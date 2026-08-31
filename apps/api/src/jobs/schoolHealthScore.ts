import cron from 'node-cron';
import { prisma } from '../utils/prisma';
import { sendEmail } from '../utils/mailer';
import { auditLog } from '../utils/audit';
import { emailLayout, emailSection, emailStat } from '../utils/emailTemplate';

export interface SchoolHealthBreakdown {
  [key: string]: number;
  attendanceScore: number;
  submissionScore: number;
  teacherActivityScore: number;
}

export interface SchoolHealthResult {
  schoolId: string;
  schoolName: string;
  score: number;
  grade: 'Healthy' | 'Needs Attention' | 'Critical';
  breakdown: SchoolHealthBreakdown;
}

function gradeFor(score: number): SchoolHealthResult['grade'] {
  if (score >= 80) return 'Healthy';
  if (score >= 60) return 'Needs Attention';
  return 'Critical';
}

/**
 * Was 1 + N*6 queries (one round-trip per school). Batched down to ~6 fixed
 * queries total regardless of school count — the per-school version was
 * exhausting the DB connection pool under concurrent dashboard load.
 */
export async function calculateSchoolHealthScores(): Promise<SchoolHealthResult[]> {
  const weekStart = new Date();
  weekStart.setDate(weekStart.getDate() - 7);

  const schools = await prisma.school.findMany({ where: { isActive: true } });
  const schoolIds = schools.map((s) => s.id);
  if (schoolIds.length === 0) return [];

  const [attendanceRecords, activitiesDue, teacherCounts, activeTeachers] = await Promise.all([
    prisma.attendance.findMany({
      where: { date: { gte: weekStart }, subject: { class: { schoolId: { in: schoolIds } } } },
      select: { status: true, subject: { select: { class: { select: { schoolId: true } } } } },
    }),
    prisma.activity.findMany({
      where: {
        dueDate: { gte: weekStart },
        isDraft: false,
        isActive: true,
        subject: { class: { schoolId: { in: schoolIds } } },
      },
      select: { id: true, subject: { select: { class: { select: { schoolId: true } } } } },
    }),
    prisma.user.groupBy({
      by: ['schoolId'],
      where: { schoolId: { in: schoolIds }, role: 'teacher', isActive: true },
      _count: { _all: true },
    }),
    prisma.user.findMany({
      where: {
        schoolId: { in: schoolIds },
        role: 'teacher',
        isActive: true,
        activities: { some: { createdAt: { gte: weekStart } } },
      },
      select: { schoolId: true },
    }),
  ]);

  const activityIds = activitiesDue.map((a) => a.id);
  const submissionsThisWeek = activityIds.length
    ? await prisma.submission.findMany({
        where: { activityId: { in: activityIds }, submittedAt: { gte: weekStart } },
        select: { activityId: true },
      })
    : [];

  const activityToSchool = new Map(activitiesDue.map((a) => [a.id, a.subject.class.schoolId]));

  const attendanceBySchool = new Map<string, { present: number; total: number }>();
  for (const r of attendanceRecords) {
    const sid = r.subject.class.schoolId;
    const entry = attendanceBySchool.get(sid) ?? { present: 0, total: 0 };
    entry.total += 1;
    if (r.status === 'present') entry.present += 1;
    attendanceBySchool.set(sid, entry);
  }

  const activitiesDueBySchool = new Map<string, number>();
  for (const a of activitiesDue) {
    const sid = a.subject.class.schoolId;
    activitiesDueBySchool.set(sid, (activitiesDueBySchool.get(sid) ?? 0) + 1);
  }

  const submissionsBySchool = new Map<string, number>();
  for (const s of submissionsThisWeek) {
    const sid = activityToSchool.get(s.activityId);
    if (!sid) continue;
    submissionsBySchool.set(sid, (submissionsBySchool.get(sid) ?? 0) + 1);
  }

  const totalTeachersBySchool = new Map(teacherCounts.map((r) => [r.schoolId, r._count._all]));
  const activeTeachersBySchool = new Map<string, number>();
  for (const t of activeTeachers) {
    if (!t.schoolId) continue;
    activeTeachersBySchool.set(t.schoolId, (activeTeachersBySchool.get(t.schoolId) ?? 0) + 1);
  }

  return schools.map((school) => {
    const attendance = attendanceBySchool.get(school.id) ?? { present: 0, total: 0 };
    const activitiesDueCount = activitiesDueBySchool.get(school.id) ?? 0;
    const submissionsCount = submissionsBySchool.get(school.id) ?? 0;
    const totalTeachers = totalTeachersBySchool.get(school.id) ?? 0;
    const activeTeacherCount = activeTeachersBySchool.get(school.id) ?? 0;

    const attendanceRate = attendance.total > 0 ? attendance.present / attendance.total : 0;
    const submissionRate = activitiesDueCount > 0 ? submissionsCount / activitiesDueCount : 0;
    const teacherActivityRate = totalTeachers > 0 ? activeTeacherCount / totalTeachers : 0;

    const attendanceScore = Math.round(attendanceRate * 40);
    const submissionScore = Math.round(submissionRate * 30);
    const teacherActivityScore = Math.round(teacherActivityRate * 30);
    const score = attendanceScore + submissionScore + teacherActivityScore;

    return {
      schoolId: school.id,
      schoolName: school.name,
      score,
      grade: gradeFor(score),
      breakdown: { attendanceScore, submissionScore, teacherActivityScore },
    };
  });
}

export function startSchoolHealthScore(): void {
  // Every Sunday at 09:00 (after the weekly backup at midnight)
  cron.schedule('0 9 * * 0', async () => {
    try {
      const results = await calculateSchoolHealthScores();
      const superAdmins = await prisma.user.findMany({
        where: { role: 'super_admin', isActive: true },
      });
      if (superAdmins.length === 0) return;

      await Promise.all(
        results.map((r) =>
          auditLog({
            userId: superAdmins[0].id,
            action: 'SCHOOL_HEALTH_SCORE',
            targetTable: 'School',
            targetId: r.schoolId,
            meta: { score: r.score, grade: r.grade, breakdown: r.breakdown },
          })
        )
      );

      const criticalSchools = results.filter((r) => r.score < 60);
      if (criticalSchools.length === 0) return;

      const bodyHtml = criticalSchools
        .map((r) =>
          emailSection(
            `🔴 ${r.schoolName}`,
            `${emailStat('Score', `${r.score} / 100`)}
             ${emailStat('Attendance', `${r.breakdown.attendanceScore} / 40`)}
             ${emailStat('Submissions', `${r.breakdown.submissionScore} / 30`)}
             ${emailStat('Teacher activity', `${r.breakdown.teacherActivityScore} / 30`)}`
          )
        )
        .join('');

      await Promise.all(
        superAdmins.map((admin) =>
          sendEmail({
            to: admin.email,
            subject: '🔴 School Health Alert — EduPortal',
            html: emailLayout({ title: 'School Health Alert', bodyHtml }),
          })
        )
      );
    } catch (err) {
      console.error('schoolHealthScore job failed:', err);
    }
  });
}
