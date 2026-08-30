import cron from 'node-cron';
import { prisma } from '../utils/prisma';
import { sendEmail } from '../utils/mailer';

export function startPerformanceSnapshot(): void {
  // Every Friday at 17:00
  cron.schedule('0 17 * * 5', async () => {
    try {
      const teachers = await prisma.user.findMany({
        where: { role: 'teacher', isActive: true },
        include: { teachingSubjects: { where: { isActive: true } } },
      });

      await Promise.all(
        teachers.map(async (teacher) => {
          if (teacher.teachingSubjects.length === 0) return;

          const subjectAverages = await Promise.all(
            teacher.teachingSubjects.map(async (subject) => {
              const grades = await prisma.grade.findMany({
                where: { submission: { activity: { subjectId: subject.id } } },
                include: { submission: { include: { activity: true } } },
              });
              if (grades.length === 0) {
                return { name: subject.name, average: null as number | null };
              }
              const percentages = grades.map(
                (g) => (g.marks / g.submission.activity.totalMarks) * 100
              );
              const average =
                Math.round((percentages.reduce((a, b) => a + b, 0) / percentages.length) * 10) /
                10;
              return { name: subject.name, average };
            })
          );

          const rows = subjectAverages
            .map((s) => `<li>${s.name}: ${s.average === null ? 'No grades yet' : `${s.average}%`}</li>`)
            .join('');

          try {
            await sendEmail({
              to: teacher.email,
              subject: 'EduPortal weekly class performance snapshot',
              html: `<p>Hi ${teacher.name}, here's this week's class average per subject:</p><ul>${rows}</ul>`,
            });
          } catch (err) {
            console.warn('[performanceSnapshot] Email failed:', err);
          }
        })
      );
    } catch (err) {
      console.error('performanceSnapshot job failed:', err);
    }
  });
}
