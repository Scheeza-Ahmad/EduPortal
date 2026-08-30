import cron from 'node-cron';
import { prisma } from '../utils/prisma';

export function startDueDateLock(): void {
  // Every hour, on the hour
  cron.schedule('0 * * * *', async () => {
    try {
      const result = await prisma.activity.updateMany({
        where: { dueDate: { lt: new Date() }, isLocked: false, isActive: true },
        data: { isLocked: true },
      });
      if (result.count > 0) {
        console.log(`[dueDateLock] Locked ${result.count} activity(ies) past due date.`);
      }
    } catch (err) {
      console.error('dueDateLock job failed:', err);
    }
  });
}
