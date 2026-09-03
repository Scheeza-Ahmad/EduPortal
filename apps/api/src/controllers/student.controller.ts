import { Response } from 'express';
import { z } from 'zod';
import { prisma } from '../utils/prisma';
import { send } from '../utils/response';
import { auditLog } from '../utils/audit';
import { AuthRequest } from '../middleware/auth';
import { checkPerfectWeek, checkStreak30, checkStreak7, checkTopOfClass } from '../jobs/badgeAward';
import { buildReportCard } from '../services/reportCard';

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
      checkStreak30(profile.id),
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
  const schoolId = req.user!.schoolId;
  if (!schoolId) {
    send(res, 403, undefined, 'No school assigned to this account');
    return;
  }

  const report = await buildReportCard(schoolId, req.user!.userId);
  if (!report) {
    send(res, 404, undefined, 'Report card not available');
    return;
  }

  send(res, 200, report);
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
  const userId = req.user!.userId;

  const [badges, recentSubmissions] = await Promise.all([
    prisma.badge.findMany({ where: { studentId: profile.id }, orderBy: { awardedAt: 'desc' } }),
    prisma.submission.findMany({
      where: { studentId: profile.id },
      orderBy: { submittedAt: 'desc' },
      take: 30,
      select: { isLate: true },
    }),
  ]);

  // Current on-time streak, counting back from the most recent submission.
  let currentStreak = 0;
  for (const s of recentSubmissions) {
    if (s.isLate) break;
    currentStreak += 1;
  }

  const weekStart = new Date();
  const day = weekStart.getDay();
  weekStart.setDate(weekStart.getDate() - (day === 0 ? 6 : day - 1));
  weekStart.setHours(0, 0, 0, 0);
  const weekAttendance = await prisma.attendance.findMany({
    where: { studentId: userId, date: { gte: weekStart } },
  });
  const presentThisWeek = weekAttendance.filter((a) => a.status === 'present').length;

  send(res, 200, {
    badges,
    progress: {
      currentSubmissionStreak: currentStreak,
      attendanceMarkedThisWeek: weekAttendance.length,
      presentThisWeek,
    },
  });
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

// =================================================================
// Leave Requests
// =================================================================

const createLeaveRequestSchema = z
  .object({
    reason: z.string().min(1).max(1000),
    fromDate: z.coerce.date(),
    toDate: z.coerce.date(),
  })
  .refine((data) => data.fromDate < data.toDate, {
    message: 'fromDate must be before toDate',
    path: ['toDate'],
  });

// POST /api/student/leave-request
export async function createLeaveRequest(req: AuthRequest, res: Response): Promise<void> {
  const profile = await requireStudentProfile(req, res);
  if (!profile) return;
  const userId = req.user!.userId;

  const parsed = createLeaveRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    send(res, 400, undefined, 'Invalid leave request — check reason and dates');
    return;
  }
  const { reason, fromDate, toDate } = parsed.data;

  const leaveRequest = await prisma.leaveRequest.create({
    data: { requesterId: userId, reason, startDate: fromDate, endDate: toDate, status: 'pending' },
  });

  if (profile.class.classTeacherId) {
    const student = await prisma.user.findUnique({ where: { id: userId }, select: { name: true } });
    await prisma.notification.create({
      data: {
        userId: profile.class.classTeacherId,
        type: 'LEAVE_REQUEST_SUBMITTED',
        message: `${student?.name ?? 'A student'} requested leave from ${fromDate.toLocaleDateString()} to ${toDate.toLocaleDateString()}.`,
      },
    });
  }

  send(res, 201, leaveRequest);
}

// GET /api/student/leave-requests
export async function getMyLeaveRequests(req: AuthRequest, res: Response): Promise<void> {
  const profile = await requireStudentProfile(req, res);
  if (!profile) return;
  const userId = req.user!.userId;

  const requests = await prisma.leaveRequest.findMany({
    where: { requesterId: userId },
    orderBy: { createdAt: 'desc' },
  });

  const reviewerIds = [...new Set(requests.map((r) => r.reviewedBy).filter((id): id is string => Boolean(id)))];
  const reviewers = reviewerIds.length
    ? await prisma.user.findMany({ where: { id: { in: reviewerIds } }, select: { id: true, name: true } })
    : [];
  const reviewerNameById = new Map(reviewers.map((r) => [r.id, r.name]));

  send(res, 200, {
    requests: requests.map((r) => ({
      id: r.id,
      reason: r.reason,
      startDate: r.startDate,
      endDate: r.endDate,
      status: r.status,
      reviewNote: r.reviewNote,
      reviewedByName: r.reviewedBy ? (reviewerNameById.get(r.reviewedBy) ?? null) : null,
      reviewedAt: r.reviewedAt,
      createdAt: r.createdAt,
    })),
  });
}

// =================================================================
// AI Weak Areas Summary
// GET /api/student/ai-insights
// =================================================================

type Trend = 'improving' | 'declining' | 'stable';

function computeTrend(percentagesChronological: number[]): Trend {
  if (percentagesChronological.length < 2) return 'stable';
  const lastThree = percentagesChronological.slice(-3);
  const previousThree = percentagesChronological.slice(-6, -3);
  if (previousThree.length === 0) return 'stable';
  const lastAvg = lastThree.reduce((a, b) => a + b, 0) / lastThree.length;
  const prevAvg = previousThree.reduce((a, b) => a + b, 0) / previousThree.length;
  const diff = lastAvg - prevAvg;
  if (diff > 3) return 'improving';
  if (diff < -3) return 'declining';
  return 'stable';
}

export async function getAiInsights(req: AuthRequest, res: Response): Promise<void> {
  const profile = await requireStudentProfile(req, res);
  if (!profile) return;

  const grades = await prisma.grade.findMany({
    where: { studentId: profile.id },
    orderBy: { gradedAt: 'asc' },
    include: {
      submission: {
        include: {
          activity: { select: { type: true, totalMarks: true, subject: { select: { id: true, name: true } } } },
        },
      },
    },
  });

  if (grades.length < 3) {
    send(res, 200, { insights: null, reason: 'Complete more activities for AI insights' });
    return;
  }

  interface SubjectBucket {
    subjectName: string;
    percentages: number[];
    typeTotals: Map<string, { sum: number; count: number }>;
  }
  const bySubject = new Map<string, SubjectBucket>();

  const overallPercentages: number[] = [];

  for (const g of grades) {
    const activity = g.submission.activity;
    const pct = activity.totalMarks > 0 ? (g.marks / activity.totalMarks) * 100 : 0;
    overallPercentages.push(pct);

    const subject = activity.subject;
    const bucket: SubjectBucket = bySubject.get(subject.id) ?? {
      subjectName: subject.name,
      percentages: [],
      typeTotals: new Map(),
    };
    bucket.percentages.push(pct);
    const typeEntry = bucket.typeTotals.get(activity.type) ?? { sum: 0, count: 0 };
    typeEntry.sum += pct;
    typeEntry.count += 1;
    bucket.typeTotals.set(activity.type, typeEntry);
    bySubject.set(subject.id, bucket);
  }

  const subjectInsights = Array.from(bySubject.values()).map((bucket) => {
    const percentage = Math.round((bucket.percentages.reduce((a, b) => a + b, 0) / bucket.percentages.length) * 10) / 10;
    const trend = computeTrend(bucket.percentages);
    let weakestType = 'assignment';
    let weakestAvg = Infinity;
    for (const [type, entry] of bucket.typeTotals) {
      const avg = entry.sum / entry.count;
      if (avg < weakestAvg) {
        weakestAvg = avg;
        weakestType = type;
      }
    }
    return {
      subjectName: bucket.subjectName,
      percentage,
      trend,
      activitiesCount: bucket.percentages.length,
      weakestType,
      recentScores: bucket.percentages.slice(-5).map((p) => Math.round(p * 10) / 10),
    };
  });

  subjectInsights.sort((a, b) => b.percentage - a.percentage);

  const overallPercentage = Math.round((overallPercentages.reduce((a, b) => a + b, 0) / overallPercentages.length) * 10) / 10;
  const overallTrend = computeTrend(overallPercentages);

  const bestSubject = subjectInsights[0];
  const weakestSubject = subjectInsights[subjectInsights.length - 1];

  // Late-submission rate, for the generic "submit on time" recommendation.
  const submissions = await prisma.submission.findMany({ where: { studentId: profile.id }, select: { isLate: true } });
  const lateRate = submissions.length > 0 ? submissions.filter((s) => s.isLate).length / submissions.length : 0;

  const recommendations: string[] = [];
  for (const s of subjectInsights) {
    if (s.percentage < 60) {
      recommendations.push(`Focus more on ${s.weakestType} preparation in ${s.subjectName}`);
    } else if (s.trend === 'improving') {
      recommendations.push(`Your ${s.subjectName} scores are improving — keep it up!`);
    }
  }
  if (lateRate > 0.2) {
    recommendations.push('Assignment completion rate is low — try to submit on time.');
  }
  if (recommendations.length === 0) {
    recommendations.push("You're doing well across all subjects — keep up the consistent effort!");
  }

  send(res, 200, {
    overallPercentage,
    overallTrend,
    bestSubject: bestSubject ? { name: bestSubject.subjectName, percentage: bestSubject.percentage } : null,
    weakestSubject: weakestSubject ? { name: weakestSubject.subjectName, percentage: weakestSubject.percentage } : null,
    subjectInsights,
    recommendations: recommendations.slice(0, 5),
  });
}
