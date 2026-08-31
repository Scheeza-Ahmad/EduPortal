import cron from 'node-cron';
import { prisma } from '../utils/prisma';
import { sendEmail } from '../utils/mailer';
import { generateProgressReportPdf } from '../services/progressReportPdf';

export function startMonthlyProgress(): void {
  // 1st of every month at 08:00
  cron.schedule('0 8 1 * *', async () => {
    try {
      const startOfMonth = new Date();
      startOfMonth.setDate(1);
      startOfMonth.setHours(0, 0, 0, 0);
      const monthLabel = startOfMonth.toLocaleString('en-US', { month: 'long', year: 'numeric' });

      const students = await prisma.studentProfile.findMany({
        include: { user: true, class: true, parent: true },
      });

      await Promise.all(
        students.map(async (profile) => {
          const parentUserId = profile.parent?.userId;
          if (!parentUserId) return; // no parent linked

          const parent = await prisma.user.findUnique({ where: { id: parentUserId } });
          if (!parent) return;

          const [presentCount, totalAttendance, grades] = await Promise.all([
            prisma.attendance.count({
              where: { studentId: profile.userId, date: { gte: startOfMonth }, status: 'present' },
            }),
            prisma.attendance.count({
              where: { studentId: profile.userId, date: { gte: startOfMonth } },
            }),
            prisma.grade.findMany({
              where: { studentId: profile.id },
              include: {
                submission: {
                  include: { activity: { include: { subject: { select: { name: true } } } } },
                },
              },
            }),
          ]);

          const attendancePercentage =
            totalAttendance > 0 ? Math.round((presentCount / totalAttendance) * 1000) / 10 : 0;

          const bySubject = new Map<string, { marks: number; possible: number }>();
          for (const g of grades) {
            const name = g.submission.activity.subject.name;
            const entry = bySubject.get(name) ?? { marks: 0, possible: 0 };
            entry.marks += g.marks;
            entry.possible += g.submission.activity.totalMarks;
            bySubject.set(name, entry);
          }
          const subjectGrades = Array.from(bySubject.entries()).map(([subjectName, s]) => ({
            subjectName,
            percentage: s.possible > 0 ? Math.round((s.marks / s.possible) * 1000) / 10 : 0,
          }));
          const totals = Array.from(bySubject.values()).reduce(
            (acc, s) => ({ marks: acc.marks + s.marks, possible: acc.possible + s.possible }),
            { marks: 0, possible: 0 }
          );
          const overallGradePercentage =
            totals.possible > 0 ? Math.round((totals.marks / totals.possible) * 1000) / 10 : 0;

          try {
            const pdf = await generateProgressReportPdf({
              studentName: profile.user.name,
              rollNo: profile.rollNo,
              className: `Class ${profile.class.number} - ${profile.class.section}`,
              month: monthLabel,
              attendancePercentage,
              overallGradePercentage,
              subjectGrades,
            });

            await sendEmail({
              to: parent.email,
              subject: `EduPortal monthly progress report — ${profile.user.name} (${monthLabel})`,
              html: `<p>Please find attached ${profile.user.name}'s progress report for ${monthLabel}.</p>`,
              attachments: [{ filename: `progress-report-${monthLabel}.pdf`, content: pdf }],
            });
          } catch (err) {
            console.warn('[monthlyProgress] Failed for student', profile.id, err);
          }
        })
      );
    } catch (err) {
      console.error('monthlyProgress job failed:', err);
    }
  });
}
