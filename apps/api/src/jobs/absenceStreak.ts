import { prisma } from '../utils/prisma';
import { sendEmail } from '../utils/mailer';

/**
 * Sync check — called right after attendance is marked (not cron-scheduled).
 * If a student's last 3 marked attendance records for this subject are all
 * "absent", email the teacher and log a notification for the parent.
 */
export async function checkAbsenceStreak(
  studentId: string,
  subjectId: string,
  teacherId: string
): Promise<void> {
  const lastThree = await prisma.attendance.findMany({
    where: { studentId, subjectId },
    orderBy: { date: 'desc' },
    take: 3,
  });

  if (lastThree.length < 3 || !lastThree.every((r) => r.status === 'absent')) {
    return;
  }

  const [student, subject] = await Promise.all([
    prisma.user.findUnique({
      where: { id: studentId },
      include: { studentProfile: { include: { parent: true } } },
    }),
    prisma.subject.findUnique({ where: { id: subjectId } }),
  ]);
  if (!student || !subject) return;

  const teacher = await prisma.user.findUnique({ where: { id: teacherId } });
  if (teacher) {
    try {
      await sendEmail({
        to: teacher.email,
        subject: 'EduPortal absence streak alert',
        html: `<p>${student.name} has been marked absent for 3 consecutive days in ${subject.name}.</p>`,
      });
    } catch (err) {
      console.warn('[absenceStreak] Teacher email failed:', err);
    }
  }

  const parentUserId = student.studentProfile?.parent?.userId;
  if (parentUserId) {
    await prisma.notification.create({
      data: {
        userId: parentUserId,
        type: 'ABSENCE_STREAK',
        message: `${student.name} has been absent for 3 consecutive days in ${subject.name}.`,
      },
    });
  }
}
