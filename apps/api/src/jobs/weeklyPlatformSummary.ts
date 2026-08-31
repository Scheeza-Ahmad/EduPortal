import cron from 'node-cron';
import { prisma } from '../utils/prisma';
import { sendEmail } from '../utils/mailer';

export function startWeeklyPlatformSummary(): void {
  // Every Monday at 08:00
  cron.schedule('0 8 * * 1', async () => {
    try {
      const oneWeekAgo = new Date();
      oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
      oneWeekAgo.setHours(0, 0, 0, 0);

      const [superAdmins, newUsers, submissionsThisWeek, schools] = await Promise.all([
        prisma.user.findMany({ where: { role: 'super_admin', isActive: true } }),
        prisma.user.groupBy({
          by: ['role'],
          where: { createdAt: { gte: oneWeekAgo } },
          _count: { role: true },
        }),
        prisma.submission.count({ where: { submittedAt: { gte: oneWeekAgo } } }),
        prisma.school.findMany({ where: { isActive: true } }),
      ]);
      if (superAdmins.length === 0) return;

      const perSchool = await Promise.all(
        schools.map(async (school) => {
          const [submissionCount, loginCount] = await Promise.all([
            prisma.submission.count({
              where: { studentUser: { schoolId: school.id }, submittedAt: { gte: oneWeekAgo } },
            }),
            prisma.user.count({
              where: { schoolId: school.id, lastLoginAt: { gte: oneWeekAgo } },
            }),
          ]);
          return { name: school.name, submissionCount, loginCount };
        })
      );

      const mostActiveSchool = perSchool.reduce(
        (best, s) => (s.submissionCount > (best?.submissionCount ?? -1) ? s : best),
        null as (typeof perSchool)[number] | null
      );
      const inactiveSchools = perSchool.filter((s) => s.loginCount === 0);

      const newUsersList = newUsers
        .map((u) => `<li>${u.role}: ${u._count.role}</li>`)
        .join('');
      const inactiveList = inactiveSchools.length
        ? inactiveSchools.map((s) => `<li>${s.name}</li>`).join('')
        : '<li>None — every school had at least one login this week</li>';

      const html = `
        <h2>EduPortal Weekly Platform Summary</h2>
        <p><strong>New users this week:</strong></p>
        <ul>${newUsersList || '<li>None</li>'}</ul>
        <p><strong>Total submissions this week:</strong> ${submissionsThisWeek}</p>
        <p><strong>Most active school:</strong> ${mostActiveSchool && mostActiveSchool.submissionCount > 0 ? `${mostActiveSchool.name} (${mostActiveSchool.submissionCount} submissions)` : 'No submissions recorded this week'}</p>
        <p><strong>⚠️ Schools with 0 logins this week:</strong></p>
        <ul>${inactiveList}</ul>
      `;

      await Promise.all(
        superAdmins.map(async (admin) => {
          try {
            await sendEmail({ to: admin.email, subject: 'EduPortal weekly platform summary', html });
          } catch (err) {
            console.warn('[weeklyPlatformSummary] Email failed:', err);
          }
        })
      );
    } catch (err) {
      console.error('weeklyPlatformSummary job failed:', err);
    }
  });
}
