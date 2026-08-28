import cron from 'node-cron';
import { prisma } from '../utils/prisma';
import { sendEmail } from '../utils/mailer';

export function startMonthlyReport(): void {
  // 1st of every month at 08:00
  cron.schedule('0 8 1 * *', async () => {
    try {
      const superAdmins = await prisma.user.findMany({
        where: { role: 'super_admin', isActive: true },
      });
      if (superAdmins.length === 0) return;

      const [totalSchools, usersByRole, totalSubmissions] = await Promise.all([
        prisma.school.count({ where: { isActive: true } }),
        prisma.user.groupBy({
          by: ['role'],
          where: { isActive: true },
          _count: { role: true },
        }),
        prisma.submission.count(),
      ]);

      const roleBreakdown = usersByRole.map((r) => `${r.role}: ${r._count.role}`).join('<br/>');

      const html = `
        <h2>EduPortal Monthly Health Report</h2>
        <p><strong>Active schools:</strong> ${totalSchools}</p>
        <p><strong>Users by role:</strong><br/>${roleBreakdown}</p>
        <p><strong>Total submissions:</strong> ${totalSubmissions}</p>
      `;

      await Promise.all(
        superAdmins.map((admin) =>
          sendEmail({ to: admin.email, subject: 'EduPortal monthly health report', html })
        )
      );
    } catch (err) {
      console.error('monthlyReport job failed:', err);
    }
  });
}
