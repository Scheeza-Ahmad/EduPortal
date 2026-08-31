import cron from 'node-cron';
import { prisma } from '../utils/prisma';
import { sendEmail } from '../utils/mailer';
import { auditLog } from '../utils/audit';
import { emailLayout, emailSection, emailStat } from '../utils/emailTemplate';
import { getMissingJobs } from './registry';

interface HealthReport {
  timestamp: Date;
  database: 'ok' | 'error';
  cronJobs: 'ok' | string; // "ok" or "missing: [job names]"
  emailService: 'configured' | 'not configured';
  storageService: 'configured' | 'not configured';
  overallStatus: 'healthy' | 'degraded' | 'critical';
}

async function checkDatabase(): Promise<'ok' | 'error'> {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return 'ok';
  } catch {
    return 'error';
  }
}

export function startSystemHealthCheck(): void {
  // Every 6 hours
  cron.schedule('0 */6 * * *', async () => {
    try {
      const database = await checkDatabase();
      const missingJobs = getMissingJobs();
      const cronJobs = missingJobs.length === 0 ? 'ok' : `missing: [${missingJobs.join(', ')}]`;
      const emailService = process.env.RESEND_API_KEY ? 'configured' : 'not configured';
      const storageService = process.env.CLOUDINARY_CLOUD_NAME ? 'configured' : 'not configured';

      const overallStatus: HealthReport['overallStatus'] =
        database === 'error'
          ? 'critical'
          : cronJobs !== 'ok' || emailService === 'not configured' || storageService === 'not configured'
            ? 'degraded'
            : 'healthy';

      const report: HealthReport = {
        timestamp: new Date(),
        database,
        cronJobs,
        emailService,
        storageService,
        overallStatus,
      };

      const superAdmins = await prisma.user.findMany({
        where: { role: 'super_admin', isActive: true },
      });
      if (superAdmins.length > 0) {
        await auditLog({
          userId: superAdmins[0].id,
          action: 'SYSTEM_HEALTH_CHECK',
          meta: {
            status: overallStatus,
            checks: {
              timestamp: report.timestamp.toISOString(),
              database: report.database,
              cronJobs: report.cronJobs,
              emailService: report.emailService,
              storageService: report.storageService,
            },
          },
        });
      }

      if (overallStatus === 'healthy') {
        console.log('[systemHealthCheck] All checks passed:', report);
        return;
      }

      console.warn('[systemHealthCheck] Degraded/critical status:', report);
      if (superAdmins.length === 0) return;

      const bodyHtml = emailSection(
        'Failed Checks',
        `${emailStat('Database', database === 'ok' ? '✅ ok' : '❌ error')}
         ${emailStat('Cron Jobs', cronJobs === 'ok' ? '✅ ok' : `❌ ${cronJobs}`)}
         ${emailStat('Email Service', emailService === 'configured' ? '✅ configured' : '❌ not configured')}
         ${emailStat('Storage Service', storageService === 'configured' ? '✅ configured' : '❌ not configured')}
         ${emailStat('Timestamp', report.timestamp.toLocaleString())}`
      );

      await Promise.all(
        superAdmins.map((admin) =>
          sendEmail({
            to: admin.email,
            subject: '🚨 EduPortal System Alert',
            html: emailLayout({ title: 'System Health Alert', bodyHtml }),
          })
        )
      );
    } catch (err) {
      console.error('systemHealthCheck job failed:', err);
    }
  });
}
