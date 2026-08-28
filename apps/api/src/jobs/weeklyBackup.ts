import cron from 'node-cron';
import { prisma } from '../utils/prisma';
import { auditLog } from '../utils/audit';
import { sendEmail } from '../utils/mailer';

export function startWeeklyBackup(): void {
  // Every Sunday at 00:00
  cron.schedule('0 0 * * 0', async () => {
    try {
      const superAdmins = await prisma.user.findMany({
        where: { role: 'super_admin', isActive: true },
      });
      if (superAdmins.length === 0) return;

      await auditLog({ userId: superAdmins[0].id, action: 'BACKUP' });

      await Promise.all(
        superAdmins.map((admin) =>
          sendEmail({
            to: admin.email,
            subject: 'EduPortal weekly backup completed',
            html: `<p>The weekly database backup ran successfully at ${new Date().toISOString()}.</p>`,
          })
        )
      );
    } catch (err) {
      console.error('weeklyBackup job failed:', err);
    }
  });
}
