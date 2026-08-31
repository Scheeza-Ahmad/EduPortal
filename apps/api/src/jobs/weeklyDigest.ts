import cron from 'node-cron';
import { prisma } from '../utils/prisma';
import { sendEmail } from '../utils/mailer';

export function startWeeklyDigest(): void {
  // Every Monday at 08:00
  cron.schedule('0 8 * * 1', async () => {
    try {
      const students = await prisma.user.findMany({
        where: { role: 'student', isActive: true },
        include: { studentProfile: true },
      });

      const oneWeekAgo = new Date();
      oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
      const startOfMonth = new Date();
      startOfMonth.setDate(1);
      startOfMonth.setHours(0, 0, 0, 0);

      await Promise.all(
        students.map(async (student) => {
          const profile = student.studentProfile;
          if (!profile) return;

          const [pendingCount, recentGrades, presentCount, totalAttendance] = await Promise.all([
            prisma.activity.count({
              where: {
                subject: { classId: profile.classId },
                isDraft: false,
                isActive: true,
                isLocked: false,
                submissions: { none: { studentId: profile.id } },
              },
            }),
            prisma.grade.findMany({
              where: { studentId: profile.id, gradedAt: { gte: oneWeekAgo } },
              include: {
                submission: { include: { activity: { include: { subject: { select: { name: true } } } } } },
              },
            }),
            prisma.attendance.count({
              where: { studentId: student.id, date: { gte: startOfMonth }, status: 'present' },
            }),
            prisma.attendance.count({
              where: { studentId: student.id, date: { gte: startOfMonth } },
            }),
          ]);

          const attendanceRate =
            totalAttendance > 0 ? Math.round((presentCount / totalAttendance) * 1000) / 10 : 0;

          const gradesList = recentGrades
            .map(
              (g) =>
                `<li>${g.submission.activity.subject.name} — ${g.submission.activity.title}: ${g.marks}/${g.submission.activity.totalMarks}</li>`
            )
            .join('');

          try {
            await sendEmail({
              to: student.email,
              subject: 'Your EduPortal weekly digest',
              html: `
                <p>Hi ${student.name}, here's your week ahead:</p>
                <p><strong>Pending tasks:</strong> ${pendingCount}</p>
                <p><strong>Grades from last week:</strong></p>
                <ul>${gradesList || '<li>No new grades this week</li>'}</ul>
                <p><strong>Attendance this month:</strong> ${attendanceRate}%</p>
              `,
            });
          } catch (err) {
            console.warn('[weeklyDigest] Email failed:', err);
          }
        })
      );
    } catch (err) {
      console.error('weeklyDigest job failed:', err);
    }
  });
}
