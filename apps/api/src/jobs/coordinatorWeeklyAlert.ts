import cron from 'node-cron';
import { prisma } from '../utils/prisma';
import { sendEmail } from '../utils/mailer';
import { auditLog } from '../utils/audit';
import { emailLayout, emailSection, emailList } from '../utils/emailTemplate';

export function startCoordinatorWeeklyAlert(): void {
  // Every Sunday at 10:00 — after schoolHealthScore (09:00)
  cron.schedule('0 10 * * 0', async () => {
    try {
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

      const coordinators = await prisma.user.findMany({
        where: { role: 'coordinator', isActive: true },
        include: { teacherProfile: true },
      });

      for (const coordinator of coordinators) {
        const wing = coordinator.teacherProfile?.coordinatorWing;
        if (!wing || !coordinator.schoolId) continue;

        const inactiveTeachers = await prisma.user.findMany({
          where: {
            schoolId: coordinator.schoolId,
            role: 'teacher',
            isActive: true,
            teacherProfile: { wing: { in: [wing, 'both'] } },
            activities: { none: { createdAt: { gte: sevenDaysAgo } } },
          },
        });

        if (inactiveTeachers.length === 0) continue;

        const wingLabel = wing === 'junior' ? 'Junior' : 'Senior';

        try {
          await sendEmail({
            to: coordinator.email,
            subject: `⚠️ Inactive Teachers Alert — ${wingLabel} Wing`,
            html: emailLayout({
              title: 'Inactive Teachers Alert',
              bodyHtml: emailSection(
                `${inactiveTeachers.length} teacher(s) in your wing have not created any activity in the last 7 days`,
                emailList(
                  inactiveTeachers.map(
                    (t) =>
                      `${t.name} — ${t.lastLoginAt ? `last active ${t.lastLoginAt.toLocaleDateString()}` : 'never logged in'}`
                  )
                )
              ),
            }),
          });
        } catch (err) {
          console.warn('[coordinatorWeeklyAlert] Email failed:', err);
        }

        await auditLog({
          userId: coordinator.id,
          action: 'COORDINATOR_WEEKLY_ALERT',
          targetTable: 'User',
          meta: { wing, inactiveCount: inactiveTeachers.length },
        });
      }
    } catch (err) {
      console.error('coordinatorWeeklyAlert job failed:', err);
    }
  });
}
