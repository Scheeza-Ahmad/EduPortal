import cron from 'node-cron';
import { prisma } from '../utils/prisma';
import { auditLog } from '../utils/audit';
import { sendEmail } from '../utils/mailer';
import { emailBadge, emailLayout, emailSection, emailStat } from '../utils/emailTemplate';

export function startWeeklyBackup(): void {
  // Every Sunday at 00:00
  cron.schedule('0 0 * * 0', async () => {
    try {
      const superAdmins = await prisma.user.findMany({
        where: { role: 'super_admin', isActive: true },
      });
      if (superAdmins.length === 0) return;

      await auditLog({ userId: superAdmins[0].id, action: 'BACKUP' });

      const now = new Date();
      const oneWeekAgo = new Date(now);
      oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);

      const [
        totalSchools,
        usersByRole,
        totalActivities,
        totalSubmissions,
        newUsersThisWeek,
        activitiesThisWeek,
        submissionsThisWeek,
        schools,
      ] = await Promise.all([
        prisma.school.count({ where: { isActive: true } }),
        prisma.user.groupBy({ by: ['role'], where: { isActive: true }, _count: { role: true } }),
        prisma.activity.count(),
        prisma.submission.count(),
        prisma.user.count({ where: { createdAt: { gte: oneWeekAgo } } }),
        prisma.activity.count({ where: { createdAt: { gte: oneWeekAgo } } }),
        prisma.submission.count({ where: { submittedAt: { gte: oneWeekAgo } } }),
        prisma.school.findMany({ where: { isActive: true }, select: { id: true, name: true } }),
      ]);

      const totalUsers = usersByRole.reduce((sum, r) => sum + r._count.role, 0);
      const totalStudents = usersByRole.find((r) => r.role === 'student')?._count.role ?? 0;
      const roleBreakdown = usersByRole.map((r) => `${r.role}: ${r._count.role}`).join(', ');

      const submissionCounts = await Promise.all(
        schools.map(async (school) => ({
          name: school.name,
          count: await prisma.submission.count({
            where: { studentUser: { schoolId: school.id }, submittedAt: { gte: oneWeekAgo } },
          }),
        }))
      );
      const mostActiveSchool = submissionCounts.reduce(
        (best, s) => (s.count > (best?.count ?? -1) ? s : best),
        null as { name: string; count: number } | null
      );

      const bodyHtml = `
        ${emailStat('Status', emailBadge('✅ Backup Successful', '#0ca30c'))}
        ${emailStat('Triggered by', 'Automatic (Weekly Schedule)')}
        ${emailStat('Timestamp', now.toLocaleString())}
        ${emailSection(
          'Database Stats at Time of Backup',
          `${emailStat('Total Schools', totalSchools)}
           ${emailStat('Total Users', `${totalUsers} (${roleBreakdown})`)}
           ${emailStat('Total Students', totalStudents)}
           ${emailStat('Total Activities', totalActivities)}
           ${emailStat('Total Submissions', totalSubmissions)}`
        )}
        ${emailSection(
          'Week Summary',
          `${emailStat('New users this week', newUsersThisWeek)}
           ${emailStat('Activities created this week', activitiesThisWeek)}
           ${emailStat('Submissions this week', submissionsThisWeek)}
           ${emailStat(
             'Most active school',
             mostActiveSchool && mostActiveSchool.count > 0
               ? `${mostActiveSchool.name} (${mostActiveSchool.count} submissions)`
               : 'No submissions recorded this week'
           )}`
        )}
        ${emailStat('Next scheduled backup', 'Every Sunday at midnight')}
      `;

      await Promise.all(
        superAdmins.map((admin) =>
          sendEmail({
            to: admin.email,
            subject: `EduPortal Weekly Backup — ${now.toLocaleDateString()}`,
            html: emailLayout({ title: 'Weekly Backup Report', bodyHtml }),
          })
        )
      );
    } catch (err) {
      console.error('weeklyBackup job failed:', err);
    }
  });
}
