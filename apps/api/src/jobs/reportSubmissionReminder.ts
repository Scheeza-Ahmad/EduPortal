import cron from 'node-cron';
import { prisma } from '../utils/prisma';
import { sendEmail } from '../utils/mailer';
import { auditLog } from '../utils/audit';
import { emailLayout, emailSection, emailList } from '../utils/emailTemplate';

function currentMonthYear(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function monthLabel(): string {
  return new Date().toLocaleString('en-US', { month: 'long', year: 'numeric' });
}

export function startReportSubmissionReminder(): void {
  // 25th of every month at 09:00
  cron.schedule('0 9 25 * *', async () => {
    try {
      const monthYear = currentMonthYear();
      const month = monthLabel();

      const teachers = await prisma.user.findMany({
        where: {
          role: 'teacher',
          isActive: true,
          teacherReports: { none: { monthYear } },
        },
        include: { teacherProfile: true },
      });

      for (const teacher of teachers) {
        try {
          await sendEmail({
            to: teacher.email,
            subject: 'Monthly Report Due — EduPortal',
            html: emailLayout({
              title: 'Monthly Report Reminder',
              bodyHtml: `<p style="margin:0 0 16px;font-size:13px;">
                Please submit your monthly report for ${month} by end of month. Your coordinator is waiting.
              </p>`,
            }),
          });
        } catch (err) {
          console.warn('[reportSubmissionReminder] Teacher email failed:', err);
        }

        await auditLog({
          userId: teacher.id,
          action: 'MONTHLY_REPORT_REMINDER_SENT',
          targetTable: 'User',
          targetId: teacher.id,
          meta: { monthYear },
        });
      }

      if (teachers.length === 0) return;

      // Notify each wing coordinator with the count of their own wing's
      // non-submitters.
      const coordinators = await prisma.user.findMany({
        where: { role: 'coordinator', isActive: true },
        include: { teacherProfile: true },
      });

      for (const coordinator of coordinators) {
        const wing = coordinator.teacherProfile?.coordinatorWing;
        if (!wing) continue;

        const wingNonSubmitters = teachers.filter(
          (t) => t.schoolId === coordinator.schoolId && (t.teacherProfile?.wing === wing || t.teacherProfile?.wing === 'both')
        );
        if (wingNonSubmitters.length === 0) continue;

        try {
          await sendEmail({
            to: coordinator.email,
            subject: `${wingNonSubmitters.length} teachers have not submitted reports — EduPortal`,
            html: emailLayout({
              title: 'Monthly Report Status',
              bodyHtml: emailSection(
                `${wingNonSubmitters.length} teacher(s) have not submitted reports for ${month}`,
                emailList(wingNonSubmitters.map((t) => t.name))
              ),
            }),
          });
        } catch (err) {
          console.warn('[reportSubmissionReminder] Coordinator email failed:', err);
        }
      }
    } catch (err) {
      console.error('reportSubmissionReminder job failed:', err);
    }
  });
}
