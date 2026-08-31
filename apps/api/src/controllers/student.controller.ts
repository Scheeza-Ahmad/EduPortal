import { Response } from 'express';
import { z } from 'zod';
import { prisma } from '../utils/prisma';
import { send } from '../utils/response';
import { auditLog } from '../utils/audit';
import { AuthRequest } from '../middleware/auth';
import { checkPerfectWeek, checkStreak7, checkTopOfClass } from '../jobs/badgeAward';

// ---------------------------------------------------------------
// Shared helper
// ---------------------------------------------------------------

/** Every route here needs the student's profile (for classId + StudentProfile.id). */
async function requireStudentProfile(req: AuthRequest, res: Response) {
  const userId = req.user!.userId;
  const profile = await prisma.studentProfile.findUnique({
    where: { userId },
    include: { class: true },
  });
  if (!profile) {
    send(res, 403, undefined, 'No student profile found for this account');
    return null;
  }
  return profile;
}

// =================================================================
// 1. Dashboard
// GET /api/student/dashboard
// =================================================================

export async function getDashboard(req: AuthRequest, res: Response): Promise<void> {
  const profile = await requireStudentProfile(req, res);
  if (!profile) return;
  const userId = req.user!.userId;

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const in7Days = new Date(today);
  in7Days.setDate(in7Days.getDate() + 7);
  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);

  const [pendingActivities, upcomingDeadlines, recentGrades, presentCount, totalAttendance, badges] =
    await Promise.all([
      prisma.activity.findMany({
        where: {
          subject: { classId: profile.classId },
          isDraft: false,
          isActive: true,
          isLocked: false,
          submissions: { none: { studentId: profile.id } },
        },
        include: { subject: { select: { id: true, name: true } } },
        orderBy: { dueDate: 'asc' },
      }),
      prisma.activity.findMany({
        where: {
          subject: { classId: profile.classId },
          isDraft: false,
          isActive: true,
          dueDate: { gte: today, lte: in7Days },
        },
        include: { subject: { select: { id: true, name: true } } },
        orderBy: { dueDate: 'asc' },
      }),
      prisma.grade.findMany({
        where: { studentId: profile.id },
        orderBy: { gradedAt: 'desc' },
        take: 5,
        include: {
          submission: { include: { activity: { include: { subject: { select: { name: true } } } } } },
        },
      }),
      prisma.attendance.count({
        where: { studentId: userId, date: { gte: startOfMonth }, status: 'present' },
      }),
      prisma.attendance.count({ where: { studentId: userId, date: { gte: startOfMonth } } }),
      prisma.badge.findMany({ where: { studentId: profile.id }, orderBy: { awardedAt: 'desc' } }),
    ]);

  const attendanceRate = totalAttendance > 0 ? (presentCount / totalAttendance) * 100 : 0;

  send(res, 200, {
    pendingActivities,
    upcomingDeadlines,
    recentGrades: recentGrades.map((g) => ({
      id: g.id,
      subject: g.submission.activity.subject.name,
      activityTitle: g.submission.activity.title,
      marks: g.marks,
      totalMarks: g.submission.activity.totalMarks,
      gradedAt: g.gradedAt,
    })),
    attendanceRate: Math.round(attendanceRate * 10) / 10,
    badges,
  });
}

// =================================================================
// 2. Activities
// GET /api/student/activities
// =================================================================

type SubmissionStatus = 'submitted' | 'pending' | 'late';

export async function getActivities(req: AuthRequest, res: Response): Promise<void> {
  const profile = await requireStudentProfile(req, res);
  if (!profile) return;

  const subjectId = req.query.subject ? String(req.query.subject) : undefined;
  const statusFilter = req.query.status ? String(req.query.status) : undefined;

  const activities = await prisma.activity.findMany({
    where: {
      subject: { classId: profile.classId, ...(subjectId ? { id: subjectId } : {}) },
      isDraft: false,
      isActive: true,
    },
    include: {
      subject: { select: { id: true, name: true } },
      submissions: { where: { studentId: profile.id }, include: { grade: true } },
    },
    orderBy: { dueDate: 'asc' },
  });

  const withStatus = activities.map((activity) => {
    const mySubmission = activity.submissions[0] ?? null;
    const status: SubmissionStatus = !mySubmission
      ? 'pending'
      : mySubmission.isLate
        ? 'late'
        : 'submitted';

    return {
      id: activity.id,
      title: activity.title,
      type: activity.type,
      description: activity.description,
      dueDate: activity.dueDate,
      totalMarks: activity.totalMarks,
      isLocked: activity.isLocked,
      subject: activity.subject,
      status,
      mySubmission: mySubmission
        ? {
            id: mySubmission.id,
            submittedAt: mySubmission.submittedAt,
            isLate: mySubmission.isLate,
            grade: mySubmission.grade,
          }
        : null,
    };
  });

  const filtered = statusFilter ? withStatus.filter((a) => a.status === statusFilter) : withStatus;

  send(res, 200, { activities: filtered });
}

// =================================================================
// 3. Submissions
// =================================================================

const submitSchema = z
  .object({
    fileUrl: z.string().optional(),
    textContent: z.string().optional(),
  })
  .refine((data) => data.fileUrl || data.textContent, {
    message: 'Provide a fileUrl or textContent',
  });

export async function submitActivity(req: AuthRequest, res: Response): Promise<void> {
  const profile = await requireStudentProfile(req, res);
  if (!profile) return;
  const userId = req.user!.userId;
  const { activityId } = req.params;

  const parsed = submitSchema.safeParse(req.body);
  if (!parsed.success) {
    send(res, 400, undefined, 'Provide a fileUrl or textContent');
    return;
  }

  const activity = await prisma.activity.findFirst({
    where: { id: activityId, subject: { classId: profile.classId }, isDraft: false, isActive: true },
  });
  if (!activity) {
    send(res, 404, undefined, 'Activity not found');
    return;
  }

  if (activity.isLocked) {
    send(res, 400, undefined, 'Submissions are closed for this activity');
    return;
  }

  const existingSubmission = await prisma.submission.findUnique({
    where: { activityId_studentId: { activityId, studentId: profile.id } },
  });
  if (existingSubmission) {
    send(res, 400, undefined, 'You have already submitted this activity');
    return;
  }

  const { fileUrl, textContent } = parsed.data;

  const submission = await prisma.submission.create({
    data: {
      activityId,
      studentId: profile.id,
      studentUserId: userId,
      fileUrl,
      textContent,
      isLate: false, // locked (past-due) activities are already rejected above
    },
  });

  await auditLog({
    userId,
    action: 'SUBMISSION_CREATE',
    targetTable: 'Submission',
    targetId: submission.id,
    meta: { activityId },
    ip: req.ip,
  });

  // Sync badge checks — non-fatal if any of these fail.
  try {
    await Promise.all([
      checkStreak7(profile.id),
      checkPerfectWeek(userId, profile.id),
      checkTopOfClass(activityId, profile.id),
    ]);
  } catch (err) {
    console.warn('[submitActivity] Badge check failed:', err);
  }

  send(res, 201, submission);
}

export async function getSubmissions(req: AuthRequest, res: Response): Promise<void> {
  const profile = await requireStudentProfile(req, res);
  if (!profile) return;

  const submissions = await prisma.submission.findMany({
    where: { studentId: profile.id },
    include: {
      activity: { include: { subject: { select: { id: true, name: true } } } },
      grade: true,
    },
    orderBy: { submittedAt: 'desc' },
  });

  send(res, 200, { submissions });
}

// =================================================================
// 4. Grades
// =================================================================

export async function getGrades(req: AuthRequest, res: Response): Promise<void> {
  const profile = await requireStudentProfile(req, res);
  if (!profile) return;

  const grades = await prisma.grade.findMany({
    where: { studentId: profile.id },
    include: {
      submission: { include: { activity: { include: { subject: { select: { id: true, name: true } } } } } },
    },
    orderBy: { gradedAt: 'desc' },
  });

  const bySubject = new Map<
    string,
    { subjectName: string; grades: unknown[] }
  >();

  for (const g of grades) {
    const subject = g.submission.activity.subject;
    const entry = bySubject.get(subject.id) ?? { subjectName: subject.name, grades: [] };
    entry.grades.push({
      id: g.id,
      activityTitle: g.submission.activity.title,
      marks: g.marks,
      totalMarks: g.submission.activity.totalMarks,
      percentage: Math.round((g.marks / g.submission.activity.totalMarks) * 1000) / 10,
      feedback: g.feedback,
      gradedAt: g.gradedAt,
    });
    bySubject.set(subject.id, entry);
  }

  send(res, 200, {
    subjects: Array.from(bySubject.entries()).map(([subjectId, s]) => ({ subjectId, ...s })),
  });
}

export async function getGradeCard(req: AuthRequest, res: Response): Promise<void> {
  const profile = await requireStudentProfile(req, res);
  if (!profile) return;

  const grades = await prisma.grade.findMany({
    where: { studentId: profile.id },
    include: {
      submission: { include: { activity: { include: { subject: { select: { id: true, name: true } } } } } },
    },
  });

  const bySubject = new Map<string, { subjectName: string; totalMarks: number; totalPossible: number }>();
  for (const g of grades) {
    const subject = g.submission.activity.subject;
    const entry = bySubject.get(subject.id) ?? { subjectName: subject.name, totalMarks: 0, totalPossible: 0 };
    entry.totalMarks += g.marks;
    entry.totalPossible += g.submission.activity.totalMarks;
    bySubject.set(subject.id, entry);
  }

  const subjectSummary = Array.from(bySubject.entries()).map(([subjectId, s]) => ({
    subjectId,
    subjectName: s.subjectName,
    totalMarks: s.totalMarks,
    totalPossible: s.totalPossible,
    percentage: s.totalPossible > 0 ? Math.round((s.totalMarks / s.totalPossible) * 1000) / 10 : 0,
  }));

  const overallMarks = subjectSummary.reduce((sum, s) => sum + s.totalMarks, 0);
  const overallPossible = subjectSummary.reduce((sum, s) => sum + s.totalPossible, 0);

  send(res, 200, {
    student: { id: profile.userId, rollNo: profile.rollNo, class: profile.class },
    subjectSummary,
    overallPercentage:
      overallPossible > 0 ? Math.round((overallMarks / overallPossible) * 1000) / 10 : 0,
  });
}

// =================================================================
// 5. Attendance
// =================================================================

export async function getAttendance(req: AuthRequest, res: Response): Promise<void> {
  const profile = await requireStudentProfile(req, res);
  if (!profile) return;
  const userId = req.user!.userId;

  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);

  const [monthRecords, allSubjects] = await Promise.all([
    prisma.attendance.findMany({
      where: { studentId: userId, date: { gte: startOfMonth } },
      include: { subject: { select: { id: true, name: true } } },
    }),
    prisma.subject.findMany({ where: { classId: profile.classId, isActive: true } }),
  ]);

  const perSubject = allSubjects.map((subject) => {
    const records = monthRecords.filter((r) => r.subjectId === subject.id);
    const present = records.filter((r) => r.status === 'present').length;
    const absent = records.filter((r) => r.status === 'absent').length;
    const late = records.filter((r) => r.status === 'late').length;
    const total = records.length;
    return {
      subjectId: subject.id,
      subjectName: subject.name,
      present,
      absent,
      late,
      total,
      percentage: total > 0 ? Math.round((present / total) * 1000) / 10 : 0,
    };
  });

  const totalPresent = monthRecords.filter((r) => r.status === 'present').length;
  const overallPercentage =
    monthRecords.length > 0 ? Math.round((totalPresent / monthRecords.length) * 1000) / 10 : 0;

  send(res, 200, { perSubject, overallPercentage });
}

// =================================================================
// 6. Notifications
// =================================================================

export async function getNotifications(req: AuthRequest, res: Response): Promise<void> {
  const userId = req.user!.userId;

  const notifications = await prisma.notification.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
  });

  send(res, 200, { notifications });
}

export async function markNotificationRead(req: AuthRequest, res: Response): Promise<void> {
  const userId = req.user!.userId;
  const { id } = req.params;

  const existing = await prisma.notification.findFirst({ where: { id, userId } });
  if (!existing) {
    send(res, 404, undefined, 'Notification not found');
    return;
  }

  const updated = await prisma.notification.update({ where: { id }, data: { isRead: true } });
  send(res, 200, updated);
}

// =================================================================
// 7. Badges
// =================================================================

export async function getBadges(req: AuthRequest, res: Response): Promise<void> {
  const profile = await requireStudentProfile(req, res);
  if (!profile) return;

  const badges = await prisma.badge.findMany({
    where: { studentId: profile.id },
    orderBy: { awardedAt: 'desc' },
  });

  send(res, 200, { badges });
}

// =================================================================
// Fees
// GET /api/student/fees
// =================================================================

export async function getMyFees(req: AuthRequest, res: Response): Promise<void> {
  const profile = await requireStudentProfile(req, res);
  if (!profile) return;
  const userId = req.user!.userId;

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { name: true, school: { select: { name: true } } },
  });

  // StudentFee.studentId points at User.id (not StudentProfile.id) — unlike
  // Grade/Submission/Badge which key off the StudentProfile.
  const fees = await prisma.studentFee.findMany({
    where: { studentId: userId },
    include: { feeStructure: { select: { monthYear: true, dueDate: true } } },
    orderBy: { dueDate: 'desc' },
  });

  send(res, 200, {
    schoolName: user?.school?.name ?? '',
    student: {
      name: user?.name ?? '',
      rollNo: profile.rollNo,
      classNumber: profile.class.number,
      section: profile.class.section,
    },
    fees: fees.map((f) => ({
      id: f.id,
      monthYear: f.feeStructure.monthYear,
      dueDate: f.feeStructure.dueDate,
      baseFee: f.baseFee,
      discountAmount: f.discountAmount,
      netPayable: f.netPayable,
      lateFine: f.lateFine,
      totalDue: f.totalDue,
      paidAmount: f.paidAmount,
      status: f.status,
    })),
  });
}
