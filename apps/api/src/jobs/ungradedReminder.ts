import cron from 'node-cron';
import { prisma } from '../utils/prisma';
import { sendEmail } from '../utils/mailer';

export function startUngradedReminder(): void {
  // Every day at 10:00
  cron.schedule('0 10 * * *', async () => {
    try {
      const threeDaysAgo = new Date();
      threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);

      const ungraded = await prisma.submission.findMany({
        where: { submittedAt: { lte: threeDaysAgo }, grade: null },
        include: {
          activity: { include: { createdBy: true, subject: { select: { name: true } } } },
        },
      });
      if (ungraded.length === 0) return;

      const byTeacher = new Map<
        string,
        { email: string; name: string; items: { title: string; subject: string }[] }
      >();

      for (const submission of ungraded) {
        const teacher = submission.activity.createdBy;
        const entry = byTeacher.get(teacher.id) ?? { email: teacher.email, name: teacher.name, items: [] };
        entry.items.push({
          title: submission.activity.title,
          subject: submission.activity.subject.name,
        });
        byTeacher.set(teacher.id, entry);
      }

      await Promise.all(
        Array.from(byTeacher.values()).map(async ({ email, name, items }) => {
          const list = items
            .map((i) => `<li>${i.title} (${i.subject})</li>`)
            .join('');
          try {
            await sendEmail({
              to: email,
              subject: 'EduPortal — submissions awaiting grading',
              html: `<p>Hi ${name}, you have ${items.length} submission(s) ungraded for 3+ days:</p><ul>${list}</ul>`,
            });
          } catch (err) {
            console.warn('[ungradedReminder] Email failed:', err);
          }
        })
      );
    } catch (err) {
      console.error('ungradedReminder job failed:', err);
    }
  });
}
