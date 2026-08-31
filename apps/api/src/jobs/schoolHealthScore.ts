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

/** Exported so the analytics endpoint can reuse the same calculation on demand. */
export async function calculateSchoolHealthScores(): Promise<SchoolHealthResult[]> {
  const weekStart = new Date();
  weekStart.setDate(weekStart.getDate() - 7);

  const schools = await prisma.school.findMany({ where: { isActive: true } });

  return Promise.all(
    schools.map(async (school) => {
      const [presentCount, totalAttendance, activitiesDue, submissionsMade, teachers] =
        await Promise.all([
          prisma.attendance.count({
            where: {
              subject: { class: { schoolId: school.id } },
              date: { gte: weekStart },
              status: 'present',
            },
          }),
          prisma.attendance.count({
            where: { subject: { class: { schoolId: school.id } }, date: { gte: weekStart } },
          }),
          prisma.activity.count({
            where: {
              subject: { class: { schoolId: school.id } },
              dueDate: { gte: weekStart },
              isDraft: false,
              isActive: true,
            },
          }),
          prisma.submission.count({
            where: {
              activity: { subject: { class: { schoolId: school.id } }, dueDate: { gte: weekStart } },
              submittedAt: { gte: weekStart },
            },
          }),
          prisma.user.findMany({
            where: { schoolId: school.id, role: 'teacher', isActive: true },
            select: { id: true },
          }),
        ]);

      const activeTeacherCount = await prisma.user.count({
        where: {
          schoolId: school.id,
          role: 'teacher',
          isActive: true,
          activities: { some: { createdAt: { gte: weekStart } } },
        },
      });

      const attendanceRate = totalAttendance > 0 ? presentCount / totalAttendance : 0;
      const submissionRate = activitiesDue > 0 ? submissionsMade / activitiesDue : 0;
      const teacherActivityRate = teachers.length > 0 ? activeTeacherCount / teachers.length : 0;

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
    })
  );
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
