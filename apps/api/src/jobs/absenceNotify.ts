import { prisma } from '../utils/prisma';
import { sendEmail } from '../utils/mailer';

/**
 * Sync — called right after attendance is marked. Instantly alerts the
 * student's parent (if one is linked) when they're marked absent.
 */
export async function notifyParentOfAbsence(studentUserId: string, subjectId: string): Promise<void> {
  const student = await prisma.user.findUnique({
    where: { id: studentUserId },
    include: { studentProfile: { include: { parent: true } } },
  });
  const subject = await prisma.subject.findUnique({ where: { id: subjectId } });
  if (!student || !subject) return;

  const parentUserId = student.studentProfile?.parent?.userId;
  if (!parentUserId) return; // no parent linked yet

  const parent = await prisma.user.findUnique({ where: { id: parentUserId } });
  if (!parent) return;

  await prisma.notification.create({
    data: {
      userId: parentUserId,
      type: 'ABSENCE_ALERT',
      message: `${student.name} was marked absent in ${subject.name} today.`,
    },
  });

  try {
    await sendEmail({
      to: parent.email,
      subject: 'EduPortal absence alert',
      html: `<p>${student.name} was marked absent in ${subject.name} today.</p>`,
    });
  } catch (err) {
    console.warn('[absenceNotify] Email failed:', err);
  }
}
