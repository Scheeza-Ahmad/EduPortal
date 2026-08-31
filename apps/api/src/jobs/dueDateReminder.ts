import cron from 'node-cron';
import { prisma } from '../utils/prisma';

/**
 * For a window of activities due soon, notify every student in that class
 * who hasn't submitted yet. `tierType` is embedded per-activity so a repeat
 * hourly run doesn't spam duplicate notifications (Notification has no
 * activityId column, so we encode it into `type` instead).
 */
async function notifyForWindow(windowStart: Date, windowEnd: Date, tierLabel: string, hoursLabel: string) {
  const activities = await prisma.activity.findMany({
    where: {
      dueDate: { gte: windowStart, lt: windowEnd },
      isDraft: false,
      isActive: true,
      isLocked: false,
    },
    include: { subject: { select: { classId: true, name: true } } },
  });

  for (const activity of activities) {
    const type = `DUE_DATE_REMINDER_${tierLabel}_${activity.id}`;

    const students = await prisma.studentProfile.findMany({
      where: {
        classId: activity.subject.classId,
        submissions: { none: { activityId: activity.id } },
      },
      select: { userId: true },
    });

    for (const student of students) {
      const alreadyNotified = await prisma.notification.findFirst({
        where: { userId: student.userId, type },
      });
      if (alreadyNotified) continue;

      await prisma.notification.create({
        data: {
          userId: student.userId,
          type,
          message: `"${activity.title}" (${activity.subject.name}) is due in ${hoursLabel}.`,
        },
      });
    }
  }
}

export function startDueDateReminder(): void {
  // Every hour, on the hour
  cron.schedule('0 * * * *', async () => {
    try {
      const now = new Date();

      const in23h = new Date(now.getTime() + 23 * 60 * 60 * 1000);
      const in24h = new Date(now.getTime() + 24 * 60 * 60 * 1000);
      await notifyForWindow(in23h, in24h, '24H', '24 hours');

      const in1h = new Date(now.getTime() + 1 * 60 * 60 * 1000);
      const in2h = new Date(now.getTime() + 2 * 60 * 60 * 1000);
      await notifyForWindow(in1h, in2h, '2H', '2 hours');
    } catch (err) {
      console.error('dueDateReminder job failed:', err);
    }
  });
}
