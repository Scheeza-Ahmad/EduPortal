import { prisma } from '../utils/prisma';
import { sendEmail } from '../utils/mailer';

const LOW_GRADE_THRESHOLD_PERCENT = 50;

/** Sync — called right after a submission is graded. Alerts the parent if the grade is below threshold. */
export async function checkLowGrade(
  studentProfileId: string,
  marks: number,
  totalMarks: number
): Promise<void> {
  const percentage = (marks / totalMarks) * 100;
  if (percentage >= LOW_GRADE_THRESHOLD_PERCENT) return;

  const profile = await prisma.studentProfile.findUnique({
    where: { id: studentProfileId },
    include: { user: true, parent: true },
  });
  if (!profile) return;

  const parentUserId = profile.parent?.userId;
  if (!parentUserId) return; // no parent linked yet

  const parent = await prisma.user.findUnique({ where: { id: parentUserId } });
  if (!parent) return;

  const roundedPercentage = Math.round(percentage * 10) / 10;

  await prisma.notification.create({
    data: {
      userId: parentUserId,
      type: 'LOW_GRADE_ALERT',
      message: `${profile.user.name} scored ${marks}/${totalMarks} (${roundedPercentage}%) — below the ${LOW_GRADE_THRESHOLD_PERCENT}% threshold.`,
    },
  });

  try {
    await sendEmail({
      to: parent.email,
      subject: 'EduPortal low grade alert',
      html: `<p>${profile.user.name} scored ${marks}/${totalMarks} (${roundedPercentage}%), below the ${LOW_GRADE_THRESHOLD_PERCENT}% threshold.</p>`,
    });
  } catch (err) {
    console.warn('[lowGradeAlert] Email failed:', err);
  }
}
