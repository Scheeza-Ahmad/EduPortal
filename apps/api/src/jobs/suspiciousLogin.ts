import { prisma } from '../utils/prisma';
import { sendEmail } from '../utils/mailer';
import { auditLog } from '../utils/audit';
import { emailLayout, emailSection, emailStat } from '../utils/emailTemplate';

/**
 * Not a cron job — called directly from the login controller once a given
 * IP has racked up 3+ failed attempts.
 */
export async function sendSuspiciousLoginAlert(
  ip: string,
  attemptedEmail: string,
  attempts: number
): Promise<void> {
  const superAdmins = await prisma.user.findMany({
    where: { role: 'super_admin', isActive: true },
  });
  if (superAdmins.length === 0) return;

  const now = new Date();
  const bodyHtml = `
    <p style="margin:0 0 16px;font-size:13px;color:#d03b3b;font-weight:600;">
      ⚠️ 3+ failed login attempts detected
    </p>
    ${emailSection(
      'Details',
      `${emailStat('IP Address', ip)}
       ${emailStat('Email attempted', attemptedEmail)}
       ${emailStat('Time', now.toLocaleString())}
       ${emailStat('Attempts', attempts)}`
    )}
    ${emailStat('Action', 'Consider blocking this IP if attempts continue')}
  `;

  await Promise.all(
    superAdmins.map(async (admin) => {
      try {
        await sendEmail({
          to: admin.email,
          subject: '⚠️ Suspicious Login Alert — EduPortal',
          html: emailLayout({ title: 'Suspicious Login Alert', bodyHtml }),
        });
      } catch (err) {
        console.warn('[suspiciousLogin] Email failed:', err);
      }
    })
  );

  await auditLog({
    userId: superAdmins[0].id,
    action: 'SUSPICIOUS_LOGIN_ALERT',
    meta: { ip, attemptedEmail, attempts },
  });
}
