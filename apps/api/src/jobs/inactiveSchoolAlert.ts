import cron from 'node-cron';
import { prisma } from '../utils/prisma';
import { sendEmail } from '../utils/mailer';
import { auditLog } from '../utils/audit';
import { emailLayout, emailSection, emailStat } from '../utils/emailTemplate';

export function startInactiveSchoolAlert(): void {
  // 15th of every month at 09:00
  cron.schedule('0 9 15 * *', async () => {
    try {
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      const superAdmins = await prisma.user.findMany({
        where: { role: 'super_admin', isActive: true },
      });
      if (superAdmins.length === 0) return;

      const schools = await prisma.school.findMany({ where: { isActive: true } });

      const inactiveSchools = await Promise.all(
        schools.map(async (school) => {
          const [recentLogins, recentActivities, totalUsers, totalActivitiesEver, lastActivity] =
            await Promise.all([
              prisma.user.count({
                where: { schoolId: school.id, lastLoginAt: { gte: thirtyDaysAgo } },
              }),
              prisma.activity.count({
                where: {
                  subject: { class: { schoolId: school.id } },
                  createdAt: { gte: thirtyDaysAgo },
                },
              }),
              prisma.user.count({ where: { schoolId: school.id, isActive: true } }),
              prisma.activity.count({
                where: { subject: { class: { schoolId: school.id } } },
              }),
              prisma.activity.findFirst({
                where: { subject: { class: { schoolId: school.id } } },
                orderBy: { createdAt: 'desc' },
                select: { createdAt: true },
              }),
            ]);

          const isInactive = recentLogins === 0 || recentActivities === 0;

          return isInactive
            ? {
                name: school.name,
                city: school.city,
                lastActivityDate: lastActivity?.createdAt ?? null,
                totalUsers,
                totalActivitiesEver,
              }
            : null;
        })
      );

      const inactive = inactiveSchools.filter(
        (s): s is NonNullable<typeof s> => s !== null
      );

      const monthLabel = new Date().toLocaleString('en-US', { month: 'long', year: 'numeric' });

      const bodyHtml =
        inactive.length === 0
          ? `<p style="margin:0;font-size:14px;">All schools are active this month! 🎉</p>`
          : `
            ${emailStat('Month', monthLabel)}
            ${emailStat('Inactive schools found', inactive.length)}
            ${inactive
              .map((s) =>
                emailSection(
                  `${s.name} — ${s.city}`,
                  `${emailStat('Last login', 'Never (in last 30 days)')}
                   ${emailStat(
                     'Last activity created',
                     s.lastActivityDate ? new Date(s.lastActivityDate).toLocaleDateString() : 'Never'
                   )}
                   ${emailStat('Total users', s.totalUsers)}
                   ${emailStat('Total activities ever', s.totalActivitiesEver)}
                   ${emailStat('Suggestion', 'Consider reaching out to the school admin')}`
                )
              )
              .join('')}
          `;

      await Promise.all(
        superAdmins.map((admin) =>
          sendEmail({
            to: admin.email,
            subject: '📊 Inactive Schools Report — EduPortal',
            html: emailLayout({ title: 'Inactive Schools Report', bodyHtml }),
          })
        )
      );

      await auditLog({
        userId: superAdmins[0].id,
        action: 'INACTIVE_SCHOOL_ALERT',
        meta: { count: inactive.length, schools: inactive.map((s) => s.name) },
      });
    } catch (err) {
      console.error('inactiveSchoolAlert job failed:', err);
    }
  });
}
