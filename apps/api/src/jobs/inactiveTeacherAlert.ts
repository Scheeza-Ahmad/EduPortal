import cron from 'node-cron';
import { prisma } from '../utils/prisma';
import { sendEmail } from '../utils/mailer';
import { auditLog } from '../utils/audit';

export function startInactiveTeacherAlert(): void {
  // Every Sunday at 10:00
  cron.schedule('0 10 * * 0', async () => {
    try {
      const twoWeeksAgo = new Date();
      twoWeeksAgo.setDate(twoWeeksAgo.getDate() - 14);

      const teachers = await prisma.user.findMany({
        where: {
          role: 'teacher',
          isActive: true,
          activities: { none: { createdAt: { gte: twoWeeksAgo } } },
        },
        include: { school: true },
      });

      await Promise.all(
        teachers.map(async (teacher) => {
          if (!teacher.school?.adminId) return; // no admin to notify

          const admin = await prisma.user.findUnique({ where: { id: teacher.school.adminId } });
          if (!admin) return;

          const lastSeen = teacher.lastLoginAt
            ? `Last seen: ${teacher.lastLoginAt.toLocaleString()}.`
            : 'They have never logged in.';

          try {
            await sendEmail({
              to: admin.email,
              subject: 'EduPortal inactive teacher alert',
              html: `<p>Teacher ${teacher.name} has not posted any activity in 2 weeks. ${lastSeen}</p>`,
            });
          } catch (err) {
            console.warn('[inactiveTeacherAlert] Email failed:', err);
          }

          await auditLog({
            userId: admin.id,
            action: 'INACTIVE_TEACHER_ALERT',
            targetTable: 'User',
            targetId: teacher.id,
            meta: { teacherName: teacher.name },
          });
        })
      );
    } catch (err) {
      console.error('inactiveTeacherAlert job failed:', err);
    }
  });
}
