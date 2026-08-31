import cron from 'node-cron';
import { prisma } from '../utils/prisma';
import { sendEmail } from '../utils/mailer';
import { emailLayout, emailList, emailSection, emailStat } from '../utils/emailTemplate';

const LOW_ACTIVITY_THRESHOLD = 5;

export function startMonthlyReport(): void {
  // 1st of every month at 08:00
  cron.schedule('0 8 1 * *', async () => {
    try {
      const superAdmins = await prisma.user.findMany({
        where: { role: 'super_admin', isActive: true },
      });
      if (superAdmins.length === 0) return;

      // Runs on the 1st, so "this month" would be near-empty if we counted
      // the month that just started — report on the month that just ended.
      const now = new Date();
      const periodStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const periodEnd = new Date(now.getFullYear(), now.getMonth(), 1);
      const monthLabel = periodStart.toLocaleString('en-US', { month: 'long', year: 'numeric' });

      const [
        totalSchools,
        totalUsers,
        newUsersThisMonth,
        activitiesCreated,
        submissionsMade,
        attendanceRecords,
        presentRecords,
        schools,
      ] = await Promise.all([
        prisma.school.count({ where: { isActive: true } }),
        prisma.user.count({ where: { isActive: true } }),
        prisma.user.count({ where: { createdAt: { gte: periodStart, lt: periodEnd } } }),
        prisma.activity.count({ where: { createdAt: { gte: periodStart, lt: periodEnd } } }),
        prisma.submission.count({ where: { submittedAt: { gte: periodStart, lt: periodEnd } } }),
        prisma.attendance.count({ where: { date: { gte: periodStart, lt: periodEnd } } }),
        prisma.attendance.count({
          where: { date: { gte: periodStart, lt: periodEnd }, status: 'present' },
        }),
        prisma.school.findMany({ where: { isActive: true }, select: { id: true, name: true } }),
      ]);

      const avgSubmissionRate =
        activitiesCreated > 0 ? Math.round((submissionsMade / activitiesCreated) * 1000) / 10 : 0;
      const overallAttendanceRate =
        attendanceRecords > 0 ? Math.round((presentRecords / attendanceRecords) * 1000) / 10 : 0;

      const schoolSubmissionCounts = await Promise.all(
        schools.map(async (school) => ({
          name: school.name,
          count: await prisma.submission.count({
            where: {
              studentUser: { schoolId: school.id },
              submittedAt: { gte: periodStart, lt: periodEnd },
            },
          }),
        }))
      );

      const topSchool = schoolSubmissionCounts.reduce(
        (best, s) => (s.count > (best?.count ?? -1) ? s : best),
        null as { name: string; count: number } | null
      );
      const lowActivitySchools = schoolSubmissionCounts.filter(
        (s) => s.count < LOW_ACTIVITY_THRESHOLD
      );

      const bodyHtml = `
        ${emailStat('Month', monthLabel)}
        ${emailSection(
          'Platform Overview',
          `${emailStat('Total Schools', totalSchools)}
           ${emailStat('Total Users', totalUsers)}
           ${emailStat('New users this month', newUsersThisMonth)}`
        )}
        ${emailSection(
          'Academic Activity',
          `${emailStat('Activities created', activitiesCreated)}
           ${emailStat('Submissions made', submissionsMade)}
           ${emailStat('Average submission rate', `${avgSubmissionRate}%`)}`
        )}
        ${emailSection(
          'Attendance Overview',
          `${emailStat('Total attendance records', attendanceRecords)}
           ${emailStat('Overall attendance rate', `${overallAttendanceRate}%`)}`
        )}
        ${emailSection(
          'Top Performing School',
          topSchool && topSchool.count > 0
            ? emailStat(topSchool.name, `${topSchool.count} submissions`)
            : '<p style="margin:4px 0;font-size:13px;color:#898781;">No submissions recorded this month</p>'
        )}
        ${emailSection(
          `Schools with Concerns (fewer than ${LOW_ACTIVITY_THRESHOLD} submissions)`,
          emailList(lowActivitySchools.map((s) => `${s.name} — ${s.count} submissions`))
        )}
      `;

      await Promise.all(
        superAdmins.map((admin) =>
          sendEmail({
            to: admin.email,
            subject: `EduPortal Monthly Report — ${monthLabel}`,
            html: emailLayout({
              title: 'Monthly Report',
              bodyHtml,
              footerText: 'EduPortal Monthly Report — Confidential',
            }),
          })
        )
      );
    } catch (err) {
      console.error('monthlyReport job failed:', err);
    }
  });
}
