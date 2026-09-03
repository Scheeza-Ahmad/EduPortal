import { Response } from 'express';
import { z } from 'zod';
import { prisma } from '../utils/prisma';
import { send } from '../utils/response';
import { auditLog } from '../utils/audit';
import { AuthRequest } from '../middleware/auth';
import { checkAbsenceStreak } from '../jobs/absenceStreak';
import { notifyParentOfAbsence } from '../jobs/absenceNotify';
import { checkLowGrade } from '../jobs/lowGradeAlert';
import { checkFullMarks, checkPerfectWeek, checkTopOfClass } from '../jobs/badgeAward';

// ---------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------

/** Verifies a subject belongs to this teacher — every subject/attendance/
 * timetable-scoped route needs this so a teacher can never touch another
 * teacher's data. */
async function findOwnSubject(teacherId: string, subjectId: string) {
  return prisma.subject.findFirst({ where: { id: subjectId, teacherId } });
}

/** Verifies an activity was created by this teacher. */
async function findOwnActivity(teacherId: string, activityId: string) {
  return prisma.activity.findFirst({ where: { id: activityId, createdById: teacherId } });
}

// =================================================================
// 1. Dashboard
// GET /api/teacher/dashboard
// =================================================================

export async function getDashboard(req: AuthRequest, res: Response): Promise<void> {
  const teacherId = req.user!.userId;
  console.log('[teacher dashboard] starting...', { teacherId });

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  const in7Days = new Date(today);
  in7Days.setDate(in7Days.getDate() + 7);

  // Promise.allSettled (not Promise.all) so one failing section degrades to
  // an empty default instead of taking the whole dashboard down with it —
  // this endpoint never actually touched TeacherProfile, so that wasn't the
  // real risk here; a genuinely failing query in any one branch was.
  const [subjectsResult, ungradedResult, upcomingResult, auditResult] = await Promise.allSettled([
    prisma.subject.findMany({
      where: { teacherId, isActive: true },
      include: { class: { select: { id: true, number: true, section: true, wing: true } } },
    }),
    prisma.submission.count({
      where: { activity: { subject: { teacherId } }, grade: null },
    }),
    prisma.activity.findMany({
      where: {
        subject: { teacherId },
        isDraft: false,
        isActive: true,
        dueDate: { gte: today, lte: in7Days },
      },
      orderBy: { dueDate: 'asc' },
      include: { subject: { select: { id: true, name: true } } },
    }),
    prisma.auditLog.findMany({
      where: { userId: teacherId },
      orderBy: { createdAt: 'desc' },
      take: 5,
    }),
  ]);

  if (subjectsResult.status === 'rejected') console.error('[teacher dashboard] mySubjects failed', subjectsResult.reason);
  if (ungradedResult.status === 'rejected') console.error('[teacher dashboard] ungradedCount failed', ungradedResult.reason);
  if (upcomingResult.status === 'rejected') console.error('[teacher dashboard] upcomingActivities failed', upcomingResult.reason);
  if (auditResult.status === 'rejected') console.error('[teacher dashboard] recentAuditLogs failed', auditResult.reason);

  const mySubjects = subjectsResult.status === 'fulfilled' ? subjectsResult.value : [];
  const ungradedCount = ungradedResult.status === 'fulfilled' ? ungradedResult.value : 0;
  const upcomingActivities = upcomingResult.status === 'fulfilled' ? upcomingResult.value : [];
  const recentAuditLogs = auditResult.status === 'fulfilled' ? auditResult.value : [];

  let attendanceToday: { subjectId: string; subjectName: string; marked: boolean }[] = [];
  try {
    attendanceToday = await Promise.all(
      mySubjects.map(async (subject) => {
        const marked = await prisma.attendance.findFirst({
          where: { subjectId: subject.id, date: { gte: today, lt: tomorrow } },
        });
        return { subjectId: subject.id, subjectName: subject.name, marked: Boolean(marked) };
      })
    );
  } catch (err) {
    console.error('[teacher dashboard] attendanceToday failed', err);
  }

  console.log('[teacher dashboard] done', {
    subjects: mySubjects.length,
    ungradedCount,
    upcoming: upcomingActivities.length,
  });

  send(res, 200, {
    mySubjects,
    ungradedSubmissionsCount: ungradedCount,
    attendanceToday,
    upcomingDueDates: upcomingActivities,
    recentActivity: recentAuditLogs,
  });
}

// =================================================================
// 2. Activities
// =================================================================

export async function getActivities(req: AuthRequest, res: Response): Promise<void> {
  const teacherId = req.user!.userId;

  const activities = await prisma.activity.findMany({
    where: { createdById: teacherId },
    include: { subject: { include: { class: true } } },
    orderBy: { createdAt: 'desc' },
  });

  send(res, 200, { activities });
}

// GET /api/teacher/activities/reuse — activities from past terms (due date
// already passed) that the teacher might want to duplicate for a new term.
export async function getReusableActivities(req: AuthRequest, res: Response): Promise<void> {
  const teacherId = req.user!.userId;

  const activities = await prisma.activity.findMany({
    where: { createdById: teacherId, dueDate: { lt: new Date() } },
    include: { subject: { select: { id: true, name: true } } },
    orderBy: { dueDate: 'desc' },
    take: 50,
  });

  send(res, 200, { activities });
}

export async function getActivity(req: AuthRequest, res: Response): Promise<void> {
  const teacherId = req.user!.userId;
  const { id } = req.params;

  const activity = await prisma.activity.findFirst({
    where: { id, createdById: teacherId },
    include: {
      subject: { include: { class: true } },
      submissions: { include: { grade: true } },
    },
  });

  if (!activity) {
    send(res, 404, undefined, 'Activity not found');
    return;
  }

  send(res, 200, activity);
}

const createActivitySchema = z.object({
  subjectId: z.string().min(1),
  type: z.enum(['assignment', 'quiz', 'project', 'presentation']),
  title: z.string().min(1),
  description: z.string().optional(),
  dueDate: z.string().min(1),
  totalMarks: z.number().int().positive(),
  fileUrl: z.string().optional(),
  isDraft: z.boolean().optional(),
});

export async function createActivity(req: AuthRequest, res: Response): Promise<void> {
  const teacherId = req.user!.userId;

  const parsed = createActivitySchema.safeParse(req.body);
  if (!parsed.success) {
    send(res, 400, undefined, 'Invalid activity data');
    return;
  }
  const { subjectId, type, title, description, dueDate, totalMarks, fileUrl, isDraft } =
    parsed.data;

  const subject = await findOwnSubject(teacherId, subjectId);
  if (!subject) {
    send(res, 400, undefined, 'Subject not found or not assigned to you');
    return;
  }

  const activity = await prisma.activity.create({
    data: {
      subjectId,
      createdById: teacherId,
      type,
      title,
      description,
      dueDate: new Date(dueDate),
      totalMarks,
      fileUrl,
      isDraft: isDraft ?? false,
    },
  });

  await auditLog({
    userId: teacherId,
    action: 'ACTIVITY_CREATE',
    targetTable: 'Activity',
    targetId: activity.id,
    meta: { subjectId, title, type },
    ip: req.ip,
  });

  send(res, 201, activity);
}

const updateActivitySchema = z.object({
  title: z.string().min(1).optional(),
  description: z.string().optional(),
  dueDate: z.string().min(1).optional(),
  totalMarks: z.number().int().positive().optional(),
  fileUrl: z.string().optional(),
  isDraft: z.boolean().optional(),
});

export async function updateActivity(req: AuthRequest, res: Response): Promise<void> {
  const teacherId = req.user!.userId;
  const { id } = req.params;

  const existing = await findOwnActivity(teacherId, id);
  if (!existing) {
    send(res, 404, undefined, 'Activity not found');
    return;
  }

  const parsed = updateActivitySchema.safeParse(req.body);
  if (!parsed.success) {
    send(res, 400, undefined, 'Invalid activity data');
    return;
  }
  const { title, description, dueDate, totalMarks, fileUrl, isDraft } = parsed.data;

  const updated = await prisma.activity.update({
    where: { id },
    data: {
      title,
      description,
      dueDate: dueDate ? new Date(dueDate) : undefined,
      totalMarks,
      fileUrl,
      isDraft,
    },
  });

  await auditLog({
    userId: teacherId,
    action: 'ACTIVITY_UPDATE',
    targetTable: 'Activity',
    targetId: id,
    meta: parsed.data,
    ip: req.ip,
  });

  send(res, 200, updated);
}

export async function deleteActivity(req: AuthRequest, res: Response): Promise<void> {
  const teacherId = req.user!.userId;
  const { id } = req.params;

  const existing = await findOwnActivity(teacherId, id);
  if (!existing) {
    send(res, 404, undefined, 'Activity not found');
    return;
  }

  await prisma.activity.update({ where: { id }, data: { isActive: false } });

  await auditLog({
    userId: teacherId,
    action: 'ACTIVITY_DELETE',
    targetTable: 'Activity',
    targetId: id,
    ip: req.ip,
  });

  send(res, 200, { message: 'Activity deleted' });
}

export async function publishActivity(req: AuthRequest, res: Response): Promise<void> {
  const teacherId = req.user!.userId;
  const { id } = req.params;

  const existing = await findOwnActivity(teacherId, id);
  if (!existing) {
    send(res, 404, undefined, 'Activity not found');
    return;
  }

  const updated = await prisma.activity.update({ where: { id }, data: { isDraft: false } });

  await auditLog({
    userId: teacherId,
    action: 'ACTIVITY_PUBLISH',
    targetTable: 'Activity',
    targetId: id,
    ip: req.ip,
  });

  send(res, 200, updated);
}

// =================================================================
// 3. Submissions
// =================================================================

export async function getSubmissions(req: AuthRequest, res: Response): Promise<void> {
  const teacherId = req.user!.userId;
  const { activityId } = req.params;

  const activity = await findOwnActivity(teacherId, activityId);
  if (!activity) {
    send(res, 404, undefined, 'Activity not found');
    return;
  }

  const submissions = await prisma.submission.findMany({
    where: { activityId },
    include: {
      studentUser: { select: { id: true, name: true, email: true } },
      grade: true,
    },
    orderBy: { submittedAt: 'asc' },
  });

  send(res, 200, { submissions });
}

const gradeSubmissionSchema = z.object({
  marks: z.number().nonnegative(),
  feedback: z.string().optional(),
});

export async function gradeSubmission(req: AuthRequest, res: Response): Promise<void> {
  const teacherId = req.user!.userId;
  const { id } = req.params;

  const parsed = gradeSubmissionSchema.safeParse(req.body);
  if (!parsed.success) {
    send(res, 400, undefined, 'Invalid grade data');
    return;
  }
  const { marks, feedback } = parsed.data;

  const submission = await prisma.submission.findFirst({
    where: { id, activity: { createdById: teacherId } },
    include: { activity: true },
  });
  if (!submission) {
    send(res, 404, undefined, 'Submission not found');
    return;
  }

  if (marks > submission.activity.totalMarks) {
    send(res, 400, undefined, `Marks cannot exceed ${submission.activity.totalMarks}`);
    return;
  }

  const grade = await prisma.grade.upsert({
    where: { submissionId: id },
    create: { submissionId: id, studentId: submission.studentId, marks, feedback },
    update: { marks, feedback },
  });

  await auditLog({
    userId: teacherId,
    action: 'SUBMISSION_GRADE',
    targetTable: 'Grade',
    targetId: grade.id,
    meta: { submissionId: id, marks },
    ip: req.ip,
  });

  // Sync checks — non-fatal if either fails.
  try {
    await Promise.all([
      checkLowGrade(submission.studentId, marks, submission.activity.totalMarks),
      checkTopOfClass(submission.activityId, submission.studentId),
      checkFullMarks(submission.studentId, marks, submission.activity.totalMarks),
    ]);
  } catch (err) {
    console.warn('[gradeSubmission] Post-grade checks failed:', err);
  }

  send(res, 200, grade);
}

// =================================================================
// 4. Attendance
// =================================================================

export async function getAttendanceForDate(req: AuthRequest, res: Response): Promise<void> {
  const teacherId = req.user!.userId;
  const { subjectId, date } = req.params;

  const subject = await findOwnSubject(teacherId, subjectId);
  if (!subject) {
    send(res, 404, undefined, 'Subject not found');
    return;
  }

  const dayStart = new Date(date);
  if (Number.isNaN(dayStart.getTime())) {
    send(res, 400, undefined, 'Invalid date');
    return;
  }
  dayStart.setHours(0, 0, 0, 0);
  const dayEnd = new Date(dayStart);
  dayEnd.setDate(dayEnd.getDate() + 1);

  const [students, records] = await Promise.all([
    prisma.studentProfile.findMany({
      where: { classId: subject.classId },
      include: { user: { select: { id: true, name: true } } },
      orderBy: { rollNo: 'asc' },
    }),
    prisma.attendance.findMany({
      where: { subjectId, date: { gte: dayStart, lt: dayEnd } },
    }),
  ]);

  const statusByStudentId = new Map(records.map((r) => [r.studentId, r.status]));

  const roster = students.map((s) => ({
    studentId: s.user.id,
    name: s.user.name,
    rollNo: s.rollNo,
    status: statusByStudentId.get(s.user.id) ?? null,
  }));

  send(res, 200, { roster });
}

const markAttendanceSchema = z.object({
  subjectId: z.string().min(1),
  date: z.string().min(1),
  records: z.array(
    z.object({
      studentId: z.string().min(1),
      status: z.enum(['present', 'absent', 'late']),
    })
  ),
});

export async function markAttendance(req: AuthRequest, res: Response): Promise<void> {
  const teacherId = req.user!.userId;

  const parsed = markAttendanceSchema.safeParse(req.body);
  if (!parsed.success) {
    send(res, 400, undefined, 'Invalid attendance data');
    return;
  }
  const { subjectId, date, records } = parsed.data;

  const subject = await findOwnSubject(teacherId, subjectId);
  if (!subject) {
    send(res, 400, undefined, 'Subject not found or not assigned to you');
    return;
  }

  const attendanceDate = new Date(date);
  if (Number.isNaN(attendanceDate.getTime())) {
    send(res, 400, undefined, 'Invalid date');
    return;
  }
  attendanceDate.setHours(0, 0, 0, 0);

  await Promise.all(
    records.map((r) =>
      prisma.attendance.upsert({
        where: {
          studentId_subjectId_date: { studentId: r.studentId, subjectId, date: attendanceDate },
        },
        create: { studentId: r.studentId, subjectId, date: attendanceDate, status: r.status },
        update: { status: r.status },
      })
    )
  );

  await auditLog({
    userId: teacherId,
    action: 'ATTENDANCE_MARK',
    targetTable: 'Attendance',
    meta: { subjectId, date, count: records.length },
    ip: req.ip,
  });

  // Sync checks: 3-day absence streak -> email teacher; instant absence -> notify parent.
  const absentStudentIds = records.filter((r) => r.status === 'absent').map((r) => r.studentId);
  await Promise.all([
    ...absentStudentIds.map((studentId) => checkAbsenceStreak(studentId, subjectId, teacherId)),
    ...absentStudentIds.map((studentId) => notifyParentOfAbsence(studentId, subjectId)),
  ]);

  // Perfect-week badge check for everyone just marked (idempotent — see
  // awardIfNotAlready — so re-marking the same day is harmless).
  try {
    const studentUserIds = records.map((r) => r.studentId);
    const profiles = await prisma.studentProfile.findMany({
      where: { userId: { in: studentUserIds } },
      select: { id: true, userId: true },
    });
    await Promise.all(profiles.map((p) => checkPerfectWeek(p.userId, p.id)));
  } catch (err) {
    console.warn('[markAttendance] perfect_week check failed:', err);
  }

  send(res, 200, { message: 'Attendance marked' });
}

export async function getAttendanceReport(req: AuthRequest, res: Response): Promise<void> {
  const teacherId = req.user!.userId;
  const { subjectId } = req.params;

  const subject = await findOwnSubject(teacherId, subjectId);
  if (!subject) {
    send(res, 404, undefined, 'Subject not found');
    return;
  }

  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);

  const [students, records] = await Promise.all([
    prisma.studentProfile.findMany({
      where: { classId: subject.classId },
      include: { user: { select: { id: true, name: true } } },
      orderBy: { rollNo: 'asc' },
    }),
    prisma.attendance.findMany({
      where: { subjectId, date: { gte: startOfMonth } },
    }),
  ]);

  const report = students.map((s) => {
    const studentRecords = records.filter((r) => r.studentId === s.user.id);
    const presentCount = studentRecords.filter((r) => r.status === 'present').length;
    const total = studentRecords.length;
    return {
      studentId: s.user.id,
      name: s.user.name,
      rollNo: s.rollNo,
      totalMarked: total,
      percentage: total > 0 ? Math.round((presentCount / total) * 1000) / 10 : 0,
    };
  });

  send(res, 200, { report });
}

// =================================================================
// 5. My Classes & Subjects
// =================================================================

export async function getMySubjects(req: AuthRequest, res: Response): Promise<void> {
  const teacherId = req.user!.userId;

  const subjects = await prisma.subject.findMany({
    where: { teacherId, isActive: true },
    include: { class: true },
    orderBy: { name: 'asc' },
  });

  send(res, 200, { subjects });
}

export async function getMyClasses(req: AuthRequest, res: Response): Promise<void> {
  const teacherId = req.user!.userId;

  // "Classes I teach in" = classes where I have a subject, plus any class
  // I'm the assigned class teacher for.
  const [subjectClasses, classTeacherClasses] = await Promise.all([
    prisma.class.findMany({ where: { subjects: { some: { teacherId } } } }),
    prisma.class.findMany({ where: { classTeacherId: teacherId } }),
  ]);

  const byId = new Map([...subjectClasses, ...classTeacherClasses].map((c) => [c.id, c]));

  send(res, 200, { classes: Array.from(byId.values()) });
}

// =================================================================
// 6. Announcements
// =================================================================

export async function getMyClassAnnouncements(req: AuthRequest, res: Response): Promise<void> {
  const teacherId = req.user!.userId;

  const myClasses = await prisma.class.findMany({
    where: { OR: [{ subjects: { some: { teacherId } } }, { classTeacherId: teacherId }] },
    select: { id: true },
  });
  const classIds = myClasses.map((c) => c.id);

  const announcements = await prisma.announcement.findMany({
    where: { classId: { in: classIds }, isActive: true },
    include: { author: { select: { id: true, name: true } }, class: true },
    orderBy: { createdAt: 'desc' },
  });

  send(res, 200, { announcements });
}

const createTeacherAnnouncementSchema = z.object({
  title: z.string().min(1),
  body: z.string().min(1),
  classId: z.string().min(1),
});

export async function createTeacherAnnouncement(req: AuthRequest, res: Response): Promise<void> {
  const teacherId = req.user!.userId;

  const parsed = createTeacherAnnouncementSchema.safeParse(req.body);
  if (!parsed.success) {
    send(res, 400, undefined, 'Invalid announcement data');
    return;
  }
  const { title, body, classId } = parsed.data;

  const targetClass = await prisma.class.findFirst({
    where: {
      id: classId,
      OR: [{ subjects: { some: { teacherId } } }, { classTeacherId: teacherId }],
    },
  });
  if (!targetClass) {
    send(res, 400, undefined, 'You are not assigned to this class');
    return;
  }

  const announcement = await prisma.announcement.create({
    data: {
      title,
      body,
      classId,
      schoolId: targetClass.schoolId,
      authorId: teacherId,
    },
  });

  await auditLog({
    userId: teacherId,
    action: 'ANNOUNCEMENT_CREATE',
    targetTable: 'Announcement',
    targetId: announcement.id,
    meta: { title, classId },
    ip: req.ip,
  });

  send(res, 201, announcement);
}

export async function deleteTeacherAnnouncement(req: AuthRequest, res: Response): Promise<void> {
  const teacherId = req.user!.userId;
  const { id } = req.params;

  const existing = await prisma.announcement.findFirst({ where: { id, authorId: teacherId } });
  if (!existing) {
    send(res, 404, undefined, 'Announcement not found');
    return;
  }

  await prisma.announcement.update({ where: { id }, data: { isActive: false } });

  await auditLog({
    userId: teacherId,
    action: 'ANNOUNCEMENT_DELETE',
    targetTable: 'Announcement',
    targetId: id,
    ip: req.ip,
  });

  send(res, 200, { message: 'Announcement deleted' });
}

// =================================================================
// Fee Defaulters
// GET /api/teacher/fee-defaulters
// =================================================================

export async function getFeeDefaulters(req: AuthRequest, res: Response): Promise<void> {
  const teacherId = req.user!.userId;

  const now = new Date();
  const monthYear = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

  // "My classes" = classes I have a subject in, plus any class I'm the
  // assigned class teacher for — same definition getMyClasses uses.
  const myClasses = await prisma.class.findMany({
    where: { OR: [{ subjects: { some: { teacherId } } }, { classTeacherId: teacherId } ] },
    select: { id: true },
  });
  const classIds = myClasses.map((c) => c.id);
  if (classIds.length === 0) {
    send(res, 200, { monthYear, defaulters: [] });
    return;
  }

  const fees = await prisma.studentFee.findMany({
    where: {
      status: { in: ['unpaid', 'overdue'] },
      feeStructure: { monthYear },
      student: { studentProfile: { classId: { in: classIds } } },
    },
    include: {
      student: {
        select: {
          name: true,
          studentProfile: { select: { class: { select: { number: true, section: true } } } },
        },
      },
    },
    orderBy: { totalDue: 'desc' },
  });

  send(res, 200, {
    monthYear,
    defaulters: fees.map((f) => ({
      studentName: f.student.name,
      className: f.student.studentProfile?.class.number ?? null,
      section: f.student.studentProfile?.class.section ?? null,
      totalDue: f.totalDue - f.paidAmount,
      status: f.status,
    })),
  });
}

// =================================================================
// Class Fees — full fee/challan view for students in the teacher's classes
// GET /api/teacher/class-fees?monthYear=2026-09
// =================================================================

export async function getClassFees(req: AuthRequest, res: Response): Promise<void> {
  const teacherId = req.user!.userId;
  const now = new Date();
  const monthYear =
    typeof req.query.monthYear === 'string'
      ? req.query.monthYear
      : `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

  const myClasses = await prisma.class.findMany({
    where: { OR: [{ subjects: { some: { teacherId } } }, { classTeacherId: teacherId }] },
    select: { id: true },
  });
  const classIds = myClasses.map((c) => c.id);
  if (classIds.length === 0) {
    send(res, 200, { monthYear, fees: [] });
    return;
  }

  const fees = await prisma.studentFee.findMany({
    where: { feeStructure: { monthYear }, student: { studentProfile: { classId: { in: classIds } } } },
    include: {
      student: {
        select: {
          name: true,
          studentProfile: {
            select: { id: true, rollNo: true, class: { select: { number: true, section: true } } },
          },
        },
      },
      feeStructure: { select: { dueDate: true } },
    },
    orderBy: { totalDue: 'desc' },
  });

  send(res, 200, {
    monthYear,
    fees: fees.map((f) => ({
      id: f.id,
      studentProfileId: f.student.studentProfile?.id ?? null,
      studentName: f.student.name,
      rollNo: f.student.studentProfile?.rollNo ?? '—',
      classNumber: f.student.studentProfile?.class.number ?? null,
      section: f.student.studentProfile?.class.section ?? null,
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
// Message a student's parent directly
// POST /api/teacher/students/:studentId/message-parent
// (:studentId is StudentProfile.id)
// =================================================================

const messageParentSchema = z.object({
  message: z.string().min(1).max(1000),
});

export async function messageParent(req: AuthRequest, res: Response): Promise<void> {
  const teacherId = req.user!.userId;

  const parsed = messageParentSchema.safeParse(req.body);
  if (!parsed.success) {
    send(res, 400, undefined, 'Message is required');
    return;
  }

  // Verify this student is actually in one of the teacher's classes —
  // a teacher can only message parents of their own students.
  const myClasses = await prisma.class.findMany({
    where: { OR: [{ subjects: { some: { teacherId } } }, { classTeacherId: teacherId }] },
    select: { id: true },
  });
  const classIds = myClasses.map((c) => c.id);

  const student = await prisma.studentProfile.findFirst({
    where: { id: req.params.studentId, classId: { in: classIds } },
    include: { user: { select: { name: true } }, parent: { select: { userId: true } } },
  });
  if (!student) {
    send(res, 404, undefined, 'Student not found in your classes');
    return;
  }
  if (!student.parent) {
    send(res, 404, undefined, 'This student has no linked parent account');
    return;
  }

  const teacher = await prisma.user.findUnique({ where: { id: teacherId }, select: { name: true } });

  const notification = await prisma.notification.create({
    data: {
      userId: student.parent.userId,
      type: 'TEACHER_MESSAGE',
      message: `${teacher?.name ?? 'A teacher'} (re: ${student.user.name}): ${parsed.data.message}`,
    },
  });

  await auditLog({
    userId: teacherId,
    action: 'TEACHER_MESSAGE_PARENT',
    targetTable: 'Notification',
    targetId: notification.id,
    meta: { studentId: student.id },
    ip: req.ip,
  });

  send(res, 201, notification);
}

// =================================================================
// Monthly Report
// =================================================================

function monthRange(monthYear: string): { start: Date; end: Date } {
  const [y, m] = monthYear.split('-').map(Number);
  const start = new Date(y, (m || 1) - 1, 1);
  const end = new Date(y, m || 1, 1);
  return { start, end };
}

async function computeReportStats(
  teacherId: string,
  monthYear: string
): Promise<{ activitiesCount: number; attendanceRate: number; studentsInClasses: number }> {
  const { start, end } = monthRange(monthYear);

  const [activitiesCount, attendanceRecords, classes] = await Promise.all([
    prisma.activity.count({
      where: { subject: { teacherId }, createdAt: { gte: start, lt: end } },
    }),
    prisma.attendance.findMany({
      where: { subject: { teacherId }, date: { gte: start, lt: end } },
      select: { status: true },
    }),
    prisma.class.findMany({
      where: { OR: [{ subjects: { some: { teacherId } } }, { classTeacherId: teacherId }] },
      select: { id: true },
    }),
  ]);

  const attendanceRate =
    attendanceRecords.length > 0
      ? (attendanceRecords.filter((a) => a.status === 'present').length / attendanceRecords.length) * 100
      : 0;

  const studentsInClasses =
    classes.length > 0
      ? await prisma.studentProfile.count({ where: { classId: { in: classes.map((c) => c.id) } } })
      : 0;

  return { activitiesCount, attendanceRate: Math.round(attendanceRate), studentsInClasses };
}

/** Finds the coordinator(s) covering a teacher's wing, for notifications. */
async function findWingCoordinators(schoolId: string, teacherWing: string) {
  return prisma.user.findMany({
    where: {
      schoolId,
      role: 'coordinator',
      teacherProfile: {
        coordinatorWing: teacherWing === 'both' ? undefined : (teacherWing as 'junior' | 'senior'),
      },
    },
  });
}

// GET /api/teacher/monthly-report/:monthYear
export async function getMonthlyReport(req: AuthRequest, res: Response): Promise<void> {
  const teacherId = req.user!.userId;
  const { monthYear } = req.params;

  const [report, stats] = await Promise.all([
    prisma.monthlyReport.findUnique({ where: { teacherId_monthYear: { teacherId, monthYear } } }),
    computeReportStats(teacherId, monthYear),
  ]);

  send(res, 200, { report, stats });
}

const upsertReportSchema = z.object({
  monthYear: z.string().min(1).max(20),
  studentPerformanceSummary: z.string().max(2000).optional(),
  challengesFaced: z.string().max(2000).optional(),
  plansNextMonth: z.string().max(2000).optional(),
});

// POST /api/teacher/monthly-report
export async function upsertMonthlyReport(req: AuthRequest, res: Response): Promise<void> {
  const teacherId = req.user!.userId;
  const schoolId = req.user!.schoolId;
  if (!schoolId) {
    send(res, 403, undefined, 'No school assigned to this account');
    return;
  }

  const parsed = upsertReportSchema.safeParse(req.body);
  if (!parsed.success) {
    send(res, 400, undefined, 'Invalid monthly report data');
    return;
  }
  const { monthYear, studentPerformanceSummary, challengesFaced, plansNextMonth } = parsed.data;

  const stats = await computeReportStats(teacherId, monthYear);

  const report = await prisma.monthlyReport.upsert({
    where: { teacherId_monthYear: { teacherId, monthYear } },
    update: {
      activitiesCount: stats.activitiesCount,
      attendanceRate: stats.attendanceRate,
      studentPerformanceSummary,
      challengesFaced,
      plansNextMonth,
      status: 'draft',
    },
    create: {
      teacherId,
      schoolId,
      monthYear,
      activitiesCount: stats.activitiesCount,
      attendanceRate: stats.attendanceRate,
      studentPerformanceSummary,
      challengesFaced,
      plansNextMonth,
      status: 'draft',
    },
  });

  await auditLog({
    userId: teacherId,
    action: 'MONTHLY_REPORT_SAVE',
    targetTable: 'MonthlyReport',
    targetId: report.id,
    meta: { monthYear },
    ip: req.ip,
  });

  send(res, 200, { report, stats });
}

// PATCH /api/teacher/monthly-report/:id/submit
export async function submitMonthlyReport(req: AuthRequest, res: Response): Promise<void> {
  const teacherId = req.user!.userId;
  const schoolId = req.user!.schoolId;

  const existing = await prisma.monthlyReport.findFirst({ where: { id: req.params.id, teacherId } });
  if (!existing) {
    send(res, 404, undefined, 'Monthly report not found');
    return;
  }

  const report = await prisma.monthlyReport.update({
    where: { id: existing.id },
    data: { status: 'submitted' },
  });

  if (schoolId) {
    const teacherProfile = await prisma.teacherProfile.findUnique({ where: { userId: teacherId } });
    if (teacherProfile) {
      const coordinators = await findWingCoordinators(schoolId, teacherProfile.wing);
      if (coordinators.length > 0) {
        await prisma.notification.createMany({
          data: coordinators.map((c) => ({
            userId: c.id,
            type: 'MONTHLY_REPORT_SUBMITTED',
            message: `A monthly report for ${report.monthYear} was submitted and needs review.`,
          })),
        });
      }
    }
  }

  await auditLog({
    userId: teacherId,
    action: 'MONTHLY_REPORT_SUBMIT',
    targetTable: 'MonthlyReport',
    targetId: report.id,
    ip: req.ip,
  });

  send(res, 200, report);
}

// =================================================================
// Leave Requests — reviewing requests from students in the teacher's classes
// =================================================================

/** Classes this teacher has a subject in, or is the class teacher for. */
async function getMyClassIds(teacherId: string): Promise<string[]> {
  const classes = await prisma.class.findMany({
    where: { OR: [{ subjects: { some: { teacherId } } }, { classTeacherId: teacherId }] },
    select: { id: true },
  });
  return classes.map((c) => c.id);
}

// GET /api/teacher/leave-requests?status=pending&class=<classId>
export async function getTeacherLeaveRequests(req: AuthRequest, res: Response): Promise<void> {
  const teacherId = req.user!.userId;
  const classIds = await getMyClassIds(teacherId);
  if (classIds.length === 0) {
    send(res, 200, { requests: [] });
    return;
  }

  const { status, class: classFilter } = req.query;
  const filteredClassIds =
    typeof classFilter === 'string' && classIds.includes(classFilter) ? [classFilter] : classIds;

  const requests = await prisma.leaveRequest.findMany({
    where: {
      status: status && status !== 'all' ? (String(status) as 'pending' | 'approved' | 'rejected') : undefined,
      requester: { studentProfile: { classId: { in: filteredClassIds } } },
    },
    include: {
      requester: {
        select: {
          name: true,
          studentProfile: { select: { rollNo: true, class: { select: { id: true, number: true, section: true } } } },
        },
      },
    },
    orderBy: { createdAt: 'desc' },
  });

  send(res, 200, {
    requests: requests.map((r) => ({
      id: r.id,
      studentName: r.requester.name,
      rollNo: r.requester.studentProfile?.rollNo ?? '—',
      classId: r.requester.studentProfile?.class.id ?? null,
      classLabel: r.requester.studentProfile
        ? `${r.requester.studentProfile.class.number}-${r.requester.studentProfile.class.section}`
        : '—',
      reason: r.reason,
      startDate: r.startDate,
      endDate: r.endDate,
      status: r.status,
      reviewNote: r.reviewNote,
    })),
  });
}

const reviewLeaveRequestSchema = z.object({
  action: z.enum(['approved', 'rejected']),
  reviewNote: z.string().max(1000).optional(),
});

// PATCH /api/teacher/leave-requests/:id/review
export async function reviewTeacherLeaveRequest(req: AuthRequest, res: Response): Promise<void> {
  const teacherId = req.user!.userId;

  const parsed = reviewLeaveRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    send(res, 400, undefined, 'Invalid review data');
    return;
  }

  const classIds = await getMyClassIds(teacherId);
  const existing = await prisma.leaveRequest.findFirst({
    where: { id: req.params.id, requester: { studentProfile: { classId: { in: classIds } } } },
    include: { requester: { select: { id: true, name: true, schoolId: true } } },
  });
  if (!existing) {
    send(res, 404, undefined, 'Leave request not found');
    return;
  }

  const { action, reviewNote } = parsed.data;

  const updated = await prisma.leaveRequest.update({
    where: { id: existing.id },
    data: { status: action, reviewNote, reviewedBy: teacherId, reviewedAt: new Date() },
  });

  await prisma.notification.create({
    data: {
      userId: existing.requesterId,
      type: 'LEAVE_REQUEST_REVIEWED',
      message: `Your leave request (${new Date(existing.startDate).toLocaleDateString()} - ${new Date(existing.endDate).toLocaleDateString()}) was ${action}.`,
    },
  });

  if (action === 'approved' && existing.requester.schoolId) {
    const school = await prisma.school.findUnique({
      where: { id: existing.requester.schoolId },
      select: { adminId: true },
    });
    if (school?.adminId) {
      await prisma.notification.create({
        data: {
          userId: school.adminId,
          type: 'LEAVE_REQUEST_APPROVED',
          message: `${existing.requester.name}'s leave request was approved by their teacher.`,
        },
      });
    }
  }

  await auditLog({
    userId: teacherId,
    action: 'LEAVE_REQUEST_REVIEWED',
    targetTable: 'LeaveRequest',
    targetId: updated.id,
    meta: { action, reviewNote },
    ip: req.ip,
  });

  send(res, 200, updated);
}

// =================================================================
// AI Grade Suggestion
// GET /api/teacher/activities/:id/grade-suggestion
// =================================================================

function mean(nums: number[]): number {
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

function stdDev(nums: number[], avg: number): number {
  const variance = nums.reduce((sum, n) => sum + (n - avg) ** 2, 0) / nums.length;
  return Math.sqrt(variance);
}

function median(nums: number[]): number {
  const sorted = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

export async function getGradeSuggestion(req: AuthRequest, res: Response): Promise<void> {
  const teacherId = req.user!.userId;
  const { id } = req.params;

  const activity = await prisma.activity.findFirst({
    where: { id, createdById: teacherId },
    include: {
      submissions: { include: { grade: true } },
    },
  });
  if (!activity) {
    send(res, 404, undefined, 'Activity not found');
    return;
  }

  const totalSubmissions = activity.submissions.length;
  const gradedSubmissions = activity.submissions.filter((s) => s.grade);
  const gradedCount = gradedSubmissions.length;
  const ungradedCount = totalSubmissions - gradedCount;

  if (gradedCount < 3) {
    send(res, 200, {
      activityId: id,
      totalSubmissions,
      gradedCount,
      ungradedCount,
      suggestion: null,
      reason: 'Need at least 3 graded submissions for AI suggestion',
    });
    return;
  }

  const marks = gradedSubmissions.map((s) => s.grade!.marks);
  const avg = mean(marks);
  const sd = stdDev(marks, avg);
  const med = median(marks);

  const distribution = { excellent: 0, good: 0, average: 0, needsWork: 0 };
  for (const m of marks) {
    if (m > avg + sd) distribution.excellent += 1;
    else if (m >= avg) distribution.good += 1;
    else if (m >= avg - sd) distribution.average += 1;
    else distribution.needsWork += 1;
  }

  send(res, 200, {
    activityId: id,
    totalSubmissions,
    gradedCount,
    ungradedCount,
    stats: {
      mean: Math.round(avg * 10) / 10,
      stdDev: Math.round(sd * 10) / 10,
      min: Math.min(...marks),
      max: Math.max(...marks),
      median: med,
    },
    suggestion: {
      excellent: `Above ${Math.round((avg + sd) * 10) / 10} marks`,
      good: `${Math.round(avg * 10) / 10} to ${Math.round((avg + sd) * 10) / 10} marks`,
      average: `${Math.round((avg - sd) * 10) / 10} to ${Math.round(avg * 10) / 10} marks`,
      needsWork: `Below ${Math.round((avg - sd) * 10) / 10} marks`,
    },
    distribution,
  });
}
