import { prisma } from '../utils/prisma';

function startOfWeek(): Date {
  const now = new Date();
  const day = now.getDay(); // 0 = Sunday
  const diffToMonday = day === 0 ? 6 : day - 1;
  const monday = new Date(now);
  monday.setDate(now.getDate() - diffToMonday);
  monday.setHours(0, 0, 0, 0);
  return monday;
}

type StreakBadgeType = 'perfect_week' | 'top_of_class' | 'streak_7' | 'streak_30' | 'full_marks';

async function awardIfNotAlready(
  studentProfileId: string,
  type: StreakBadgeType,
  notAfter: Date
): Promise<void> {
  const existing = await prisma.badge.findFirst({
    where: { studentId: studentProfileId, type },
    orderBy: { awardedAt: 'desc' },
  });
  if (existing && existing.awardedAt >= notAfter) return; // already awarded for this streak/week

  await prisma.badge.create({ data: { studentId: studentProfileId, type } });
}

/** perfect_week — 100% attendance so far this week (must have at least one record). */
export async function checkPerfectWeek(studentUserId: string, studentProfileId: string): Promise<void> {
  const weekStart = startOfWeek();

  const records = await prisma.attendance.findMany({
    where: { studentId: studentUserId, date: { gte: weekStart } },
  });
  if (records.length === 0) return;

  const allPresent = records.every((r) => r.status === 'present');
  if (!allPresent) return;

  await awardIfNotAlready(studentProfileId, 'perfect_week', weekStart);
}

/** top_of_class — this student has the highest grade among all graded submissions for the activity. */
export async function checkTopOfClass(activityId: string, studentProfileId: string): Promise<void> {
  const grades = await prisma.grade.findMany({
    where: { submission: { activityId } },
  });
  if (grades.length === 0) return;

  const myGrade = grades.find((g) => g.studentId === studentProfileId);
  if (!myGrade) return; // not graded yet — nothing to check

  const maxMarks = Math.max(...grades.map((g) => g.marks));
  if (myGrade.marks < maxMarks) return;

  await prisma.badge.create({ data: { studentId: studentProfileId, type: 'top_of_class' } });
}

/** streak_7 — last 7 submissions were all on time. */
export async function checkStreak7(studentProfileId: string): Promise<void> {
  const lastSeven = await prisma.submission.findMany({
    where: { studentId: studentProfileId },
    orderBy: { submittedAt: 'desc' },
    take: 7,
  });
  if (lastSeven.length < 7 || !lastSeven.every((s) => !s.isLate)) return;

  const streakStart = lastSeven[lastSeven.length - 1].submittedAt;
  await awardIfNotAlready(studentProfileId, 'streak_7', streakStart);
}

/** streak_30 — last 30 submissions were all on time. */
export async function checkStreak30(studentProfileId: string): Promise<void> {
  const lastThirty = await prisma.submission.findMany({
    where: { studentId: studentProfileId },
    orderBy: { submittedAt: 'desc' },
    take: 30,
  });
  if (lastThirty.length < 30 || !lastThirty.every((s) => !s.isLate)) return;

  const streakStart = lastThirty[lastThirty.length - 1].submittedAt;
  await awardIfNotAlready(studentProfileId, 'streak_30', streakStart);
}

/** full_marks — scored 100% on a graded activity. */
export async function checkFullMarks(
  studentProfileId: string,
  marks: number,
  totalMarks: number
): Promise<void> {
  if (totalMarks <= 0 || marks < totalMarks) return;
  await prisma.badge.create({ data: { studentId: studentProfileId, type: 'full_marks' } });
}
