import cron from 'node-cron';
import { prisma } from '../utils/prisma';
import { sendEmail } from '../utils/mailer';
import { auditLog } from '../utils/audit';
import { emailLayout, emailSection, emailStat } from '../utils/emailTemplate';

type WingValue = 'junior' | 'senior';

function wingClassNumbers(wing: WingValue): number[] {
  return wing === 'junior' ? [1, 2, 3, 4, 5] : [6, 7, 8, 9, 10];
}

/** Previous calendar month's [start, end) range and its "YYYY-MM" key. */
function previousMonth(): { start: Date; end: Date; monthYear: string; label: string } {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const end = new Date(now.getFullYear(), now.getMonth(), 1);
  return {
    start,
    end,
    monthYear: `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}`,
    label: start.toLocaleString('en-US', { month: 'long', year: 'numeric' }),
  };
}

export function startWingPerformanceEmail(): void {
  // 1st of every month at 09:00
  cron.schedule('0 9 1 * *', async () => {
    try {
      const { start, end, monthYear, label } = previousMonth();

      const coordinators = await prisma.user.findMany({
        where: { role: 'coordinator', isActive: true },
        include: { teacherProfile: true },
      });

      for (const coordinator of coordinators) {
        const wing = coordinator.teacherProfile?.coordinatorWing as WingValue | undefined;
        if (!wing || !coordinator.schoolId) continue;
        const schoolId = coordinator.schoolId;

        const classes = await prisma.class.findMany({
          where: { schoolId, number: { in: wingClassNumbers(wing) }, isActive: true },
          select: { id: true },
        });
        const classIds = classes.map((c) => c.id);

        const teachers = await prisma.user.findMany({
          where: { schoolId, role: 'teacher', isActive: true, teacherProfile: { wing: { in: [wing, 'both'] } } },
        });
        const teacherIds = teachers.map((t) => t.id);
        if (teacherIds.length === 0) continue;

        const [attendanceRecords, activityCounts, reports] = await Promise.all([
          classIds.length
            ? prisma.attendance.findMany({
                where: { subject: { classId: { in: classIds } }, date: { gte: start, lt: end } },
                select: { status: true },
              })
            : [],
          prisma.activity.groupBy({
            by: ['createdById'],
            where: { createdById: { in: teacherIds }, createdAt: { gte: start, lt: end } },
            _count: { _all: true },
          }),
          prisma.monthlyReport.findMany({
            where: { teacherId: { in: teacherIds }, monthYear },
            select: { status: true },
          }),
        ]);

        const attendanceRate =
          attendanceRecords.length > 0
            ? Math.round(
                (attendanceRecords.filter((a) => a.status === 'present').length / attendanceRecords.length) * 100
              )
            : 0;

        const countByTeacher = new Map(activityCounts.map((a) => [a.createdById, a._count._all]));
        const ranked = teachers
          .map((t) => ({ name: t.name, count: countByTeacher.get(t.id) ?? 0 }))
          .sort((a, b) => b.count - a.count);
        const mostActive = ranked[0];
        const leastActive = ranked[ranked.length - 1];

        // At-risk count: students in wing classes with attendance < 70% for the month.
        let atRiskCount = 0;
        if (classIds.length > 0) {
          const students = await prisma.studentProfile.findMany({
            where: { classId: { in: classIds } },
            select: { userId: true },
          });
          const perStudentAttendance = await prisma.attendance.findMany({
            where: { studentId: { in: students.map((s) => s.userId) }, date: { gte: start, lt: end } },
            select: { studentId: true, status: true },
          });
          const bucket = new Map<string, { present: number; total: number }>();
          for (const a of perStudentAttendance) {
            const entry = bucket.get(a.studentId) ?? { present: 0, total: 0 };
            entry.total += 1;
            if (a.status === 'present') entry.present += 1;
            bucket.set(a.studentId, entry);
          }
          atRiskCount = Array.from(bucket.values()).filter((e) => e.total > 0 && e.present / e.total < 0.7).length;
        }

        const reportsSubmitted = reports.filter((r) => r.status !== 'draft').length;
        const wingLabel = wing === 'junior' ? 'Junior Wing' : 'Senior Wing';

        try {
          await sendEmail({
            to: coordinator.email,
            subject: `${wingLabel} Performance Summary — ${label}`,
            html: emailLayout({
              title: `${wingLabel} Monthly Performance`,
              bodyHtml: emailSection(
                label,
                `${emailStat('Wing attendance rate', `${attendanceRate}%`)}
                 ${emailStat('Most active teacher', mostActive ? `${mostActive.name} (${mostActive.count} activities)` : '—')}
                 ${emailStat('Least active teacher', leastActive ? `${leastActive.name} (${leastActive.count} activities)` : '—')}
                 ${emailStat('At-risk students', atRiskCount)}
                 ${emailStat('Monthly reports submitted', `${reportsSubmitted} / ${teachers.length}`)}`
              ),
            }),
          });
        } catch (err) {
          console.warn('[wingPerformanceEmail] Email failed:', err);
        }

        await auditLog({
          userId: coordinator.id,
          action: 'WING_PERFORMANCE_EMAIL',
          targetTable: 'User',
          meta: { wing, monthYear, attendanceRate, atRiskCount, reportsSubmitted },
        });
      }
    } catch (err) {
      console.error('wingPerformanceEmail job failed:', err);
    }
  });
}
