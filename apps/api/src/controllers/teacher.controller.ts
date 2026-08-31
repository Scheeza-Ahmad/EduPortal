import { Response } from 'express';
import { z } from 'zod';
import { prisma } from '../utils/prisma';
import { send } from '../utils/response';
import { auditLog } from '../utils/audit';
import { AuthRequest } from '../middleware/auth';
import { checkAbsenceStreak } from '../jobs/absenceStreak';
import { notifyParentOfAbsence } from '../jobs/absenceNotify';
import { checkLowGrade } from '../jobs/lowGradeAlert';
import { checkTopOfClass } from '../jobs/badgeAward';

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

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  const in7Days = new Date(today);
  in7Days.setDate(in7Days.getDate() + 7);

  const [mySubjects, ungradedCount, upcomingActivities, recentAuditLogs] = await Promise.all([
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

  const attendanceToday = await Promise.all(
    mySubjects.map(async (subject) => {
      const marked = await prisma.attendance.findFirst({
        where: { subjectId: subject.id, date: { gte: today, lt: tomorrow } },
      });
      return { subjectId: subject.id, subjectName: subject.name, marked: Boolean(marked) };
    })
  );

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
