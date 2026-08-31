import { Response } from 'express';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../utils/prisma';
import { send } from '../utils/response';
import { auditLog } from '../utils/audit';
import { AuthRequest } from '../middleware/auth';

// ---------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------

type WingValue = 'junior' | 'senior';

interface WingContext {
  schoolId: string;
  wing: WingValue;
  wingLabel: string;
}

function wingClassNumbers(wing: WingValue): number[] {
  return wing === 'junior' ? [1, 2, 3, 4, 5] : [6, 7, 8, 9, 10];
}

function wingLabelFor(wing: WingValue): string {
  return wing === 'junior' ? 'Junior Wing (Class 1-5)' : 'Senior Wing (Class 6-10)';
}

/** Every coordinator route needs the coordinator's own wing + school. */
async function requireWingContext(req: AuthRequest, res: Response): Promise<WingContext | null> {
  const schoolId = req.user?.schoolId;
  if (!schoolId) {
    send(res, 403, undefined, 'No school assigned to this account');
    return null;
  }

  const profile = await prisma.teacherProfile.findUnique({ where: { userId: req.user!.userId } });
  if (!profile || !profile.isCoordinator || !profile.coordinatorWing) {
    send(res, 403, undefined, 'This account is not assigned as a wing coordinator');
    return null;
  }

  const wing = profile.coordinatorWing as WingValue;
  return { schoolId, wing, wingLabel: wingLabelFor(wing) };
}

function monthRange(monthYear: string): { start: Date; end: Date } {
  const [y, m] = monthYear.split('-').map(Number);
  const start = new Date(y, (m || 1) - 1, 1);
  const end = new Date(y, m || 1, 1);
  return { start, end };
}

function currentMonthYear(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

async function getWingClasses(schoolId: string, wing: WingValue) {
  return prisma.class.findMany({
    where: { schoolId, number: { in: wingClassNumbers(wing) }, isActive: true },
    select: { id: true, number: true, section: true },
  });
}

async function getWingTeachers(schoolId: string, wing: WingValue) {
  return prisma.user.findMany({
    where: {
      schoolId,
      role: 'teacher',
      isActive: true,
      teacherProfile: { wing: { in: [wing, 'both'] } },
    },
    include: {
      teacherProfile: true,
      teachingSubjects: { select: { id: true, classId: true } },
      classTeacherOf: { select: { id: true } },
    },
  });
}

function activityStatusFor(lastActiveDate: Date | null): 'active' | 'low' | 'inactive' {
  if (!lastActiveDate) return 'inactive';
  const daysSince = Math.floor((Date.now() - lastActiveDate.getTime()) / (1000 * 60 * 60 * 24));
  if (daysSince <= 3) return 'active';
  if (daysSince <= 7) return 'low';
  return 'inactive';
}

interface TeacherActivitySummary {
  teacherId: string;
  teacherName: string;
  email: string;
  lastLoginAt: string | null;
  classesCount: number;
  activitiesThisMonth: number;
  lastActiveDate: string | null;
  activityStatus: 'active' | 'low' | 'inactive';
  reportStatus: string;
}

interface TeacherForActivity {
  id: string;
  name: string;
  email: string;
  lastLoginAt: Date | null;
  teachingSubjects: { classId: string }[];
  classTeacherOf: { id: string }[];
}

/** Shared by the dashboard, teachers list, and teacher detail endpoints. */
async function computeTeacherActivity(teachers: TeacherForActivity[]): Promise<TeacherActivitySummary[]> {
  const { start, end } = monthRange(currentMonthYear());
  const teacherIds = teachers.map((t) => t.id);
  if (teacherIds.length === 0) return [];

  const [activitiesThisMonth, lastActivities, reports] = await Promise.all([
    prisma.activity.groupBy({
      by: ['createdById'],
      where: { createdById: { in: teacherIds }, createdAt: { gte: start, lt: end } },
      _count: { _all: true },
    }),
    prisma.activity.groupBy({
      by: ['createdById'],
      where: { createdById: { in: teacherIds } },
      _max: { createdAt: true },
    }),
    prisma.monthlyReport.findMany({
      where: { teacherId: { in: teacherIds }, monthYear: currentMonthYear() },
      select: { teacherId: true, status: true },
    }),
  ]);

  const activityCountByTeacher = new Map(activitiesThisMonth.map((a) => [a.createdById, a._count._all]));
  const lastActiveByTeacher = new Map(lastActivities.map((a) => [a.createdById, a._max.createdAt]));
  const reportByTeacher = new Map(reports.map((r) => [r.teacherId, r.status]));

  return teachers.map((t) => {
    const classIds = new Set([...t.teachingSubjects.map((s) => s.classId), ...t.classTeacherOf.map((c) => c.id)]);
    const lastActiveDate = lastActiveByTeacher.get(t.id) ?? null;
    return {
      teacherId: t.id,
      teacherName: t.name,
      email: t.email,
      lastLoginAt: t.lastLoginAt ? t.lastLoginAt.toISOString() : null,
      classesCount: classIds.size,
      activitiesThisMonth: activityCountByTeacher.get(t.id) ?? 0,
      lastActiveDate: lastActiveDate ? lastActiveDate.toISOString() : null,
      activityStatus: activityStatusFor(lastActiveDate),
      reportStatus: reportByTeacher.get(t.id) ?? 'none',
    };
  });
}

interface AtRiskStudent {
  studentProfileId: string;
  name: string;
  classNumber: number;
  section: string;
  attendanceRate: number;
  averageGrade: number | null;
  riskReason: 'Low Attendance' | 'Low Grades' | 'Both';
}

/** Shared by the dashboard's atRiskStudents count and the students-overview page. */
async function computeAtRiskStudents(
  classIds: string[]
): Promise<{ atRisk: AtRiskStudent[]; byClass: Map<string, { attendance: number[]; grades: number[] }> }> {
  if (classIds.length === 0) return { atRisk: [], byClass: new Map() };

  const students = await prisma.studentProfile.findMany({
    where: { classId: { in: classIds } },
    select: {
      id: true,
      userId: true,
      class: { select: { id: true, number: true, section: true } },
      user: { select: { name: true } },
    },
  });
  const studentUserIds = students.map((s) => s.userId);
  const studentProfileIds = students.map((s) => s.id);

  const [attendanceRecords, grades] = await Promise.all([
    studentUserIds.length
      ? prisma.attendance.findMany({
          where: { studentId: { in: studentUserIds } },
          select: { studentId: true, status: true },
        })
      : [],
    studentProfileIds.length
      ? prisma.grade.findMany({
          where: { studentId: { in: studentProfileIds }, submission: { activity: { totalMarks: { gt: 0 } } } },
          select: { studentId: true, marks: true, submission: { select: { activity: { select: { totalMarks: true } } } } },
        })
      : [],
  ]);

  const attendanceByStudent = new Map<string, { present: number; total: number }>();
  for (const a of attendanceRecords) {
    const entry = attendanceByStudent.get(a.studentId) ?? { present: 0, total: 0 };
    entry.total += 1;
    if (a.status === 'present') entry.present += 1;
    attendanceByStudent.set(a.studentId, entry);
  }

  const gradesByStudent = new Map<string, { earned: number; possible: number }>();
  for (const g of grades) {
    const entry = gradesByStudent.get(g.studentId) ?? { earned: 0, possible: 0 };
    entry.earned += g.marks;
    entry.possible += g.submission.activity.totalMarks;
    gradesByStudent.set(g.studentId, entry);
  }

  const atRisk: AtRiskStudent[] = [];
  const byClass = new Map<string, { attendance: number[]; grades: number[] }>();

  for (const s of students) {
    const att = attendanceByStudent.get(s.userId);
    const attendanceRate = att && att.total > 0 ? (att.present / att.total) * 100 : 100;
    const gr = gradesByStudent.get(s.id);
    const averageGrade = gr && gr.possible > 0 ? (gr.earned / gr.possible) * 100 : null;

    const classBucket = byClass.get(s.class.id) ?? { attendance: [], grades: [] };
    classBucket.attendance.push(attendanceRate);
    if (averageGrade != null) classBucket.grades.push(averageGrade);
    byClass.set(s.class.id, classBucket);

    const lowAttendance = attendanceRate < 70;
    const lowGrades = averageGrade != null && averageGrade < 50;
    if (lowAttendance || lowGrades) {
      atRisk.push({
        studentProfileId: s.id,
        name: s.user.name,
        classNumber: s.class.number,
        section: s.class.section,
        attendanceRate: Math.round(attendanceRate),
        averageGrade: averageGrade != null ? Math.round(averageGrade) : null,
        riskReason: lowAttendance && lowGrades ? 'Both' : lowAttendance ? 'Low Attendance' : 'Low Grades',
      });
    }
  }

  return { atRisk, byClass };
}

// =================================================================
// 1. Dashboard
// GET /api/coordinator/dashboard
// =================================================================

export async function getDashboard(req: AuthRequest, res: Response): Promise<void> {
  const ctx = await requireWingContext(req, res);
  if (!ctx) return;
  const { schoolId, wing, wingLabel } = ctx;

  const classes = await getWingClasses(schoolId, wing);
  const classIds = classes.map((c) => c.id);
  const teachers = await getWingTeachers(schoolId, wing);
  const teacherIds = teachers.map((t) => t.id);

  const { start, end } = monthRange(currentMonthYear());

  const [totalStudents, activitiesThisMonth, activitiesDue, teacherActivity, atRiskResult, pendingReports, recentReports] =
    await Promise.all([
      classIds.length ? prisma.studentProfile.count({ where: { classId: { in: classIds } } }) : 0,
      teacherIds.length
        ? prisma.activity.count({ where: { createdById: { in: teacherIds }, createdAt: { gte: start, lt: end } } })
        : 0,
      classIds.length
        ? prisma.activity.findMany({
            where: {
              subject: { classId: { in: classIds } },
              isDraft: false,
              isActive: true,
              dueDate: { gte: start, lt: end },
            },
            select: { id: true, subject: { select: { classId: true } } },
          })
        : [],
      computeTeacherActivity(teachers),
      computeAtRiskStudents(classIds),
      teacherIds.length
        ? prisma.monthlyReport.count({
            where: { teacherId: { in: teacherIds }, monthYear: currentMonthYear(), status: 'submitted' },
          })
        : 0,
      teacherIds.length
        ? prisma.monthlyReport.findMany({
            where: { teacherId: { in: teacherIds } },
            orderBy: { updatedAt: 'desc' },
            take: 5,
            include: { teacher: { select: { name: true } } },
          })
        : [],
    ]);

  let submissionRate = 0;
  if (activitiesDue.length > 0) {
    const activityIds = activitiesDue.map((a) => a.id);
    const submissions = await prisma.submission.findMany({
      where: { activityId: { in: activityIds } },
      select: { activityId: true },
    });
    const classSizeCache = new Map<string, number>();
    for (const cId of new Set(activitiesDue.map((a) => a.subject.classId))) {
      classSizeCache.set(cId, await prisma.studentProfile.count({ where: { classId: cId } }));
    }
    const submittedCount = submissions.length;
    const expectedCount = activitiesDue.reduce(
      (sum, a) => sum + (classSizeCache.get(a.subject.classId) ?? 0),
      0
    );
    submissionRate = expectedCount > 0 ? Math.round((submittedCount / expectedCount) * 100) : 0;
  }

  const attendanceRecords = classIds.length
    ? await prisma.attendance.findMany({
        where: { subject: { classId: { in: classIds } }, date: { gte: start, lt: end } },
        select: { status: true },
      })
    : [];
  const attendanceRate =
    attendanceRecords.length > 0
      ? Math.round(
          (attendanceRecords.filter((a) => a.status === 'present').length / attendanceRecords.length) * 100
        )
      : 0;

  const alerts: { type: string; message: string; teacherName?: string; className?: string }[] = [];
  for (const t of teacherActivity) {
    if (t.activityStatus === 'inactive') {
      alerts.push({
        type: 'inactive_teacher',
        message: `${t.teacherName} has not created any activity in over 7 days.`,
        teacherName: t.teacherName,
      });
    }
  }
  const classAttendanceByClass = new Map<string, number[]>();
  for (const c of classes) classAttendanceByClass.set(c.id, []);
  if (classIds.length) {
    const perClassAttendance = await prisma.attendance.findMany({
      where: { subject: { classId: { in: classIds } }, date: { gte: start, lt: end } },
      select: { status: true, subject: { select: { classId: true } } },
    });
    const bucket = new Map<string, { present: number; total: number }>();
    for (const a of perClassAttendance) {
      const entry = bucket.get(a.subject.classId) ?? { present: 0, total: 0 };
      entry.total += 1;
      if (a.status === 'present') entry.present += 1;
      bucket.set(a.subject.classId, entry);
    }
    for (const c of classes) {
      const entry = bucket.get(c.id);
      const rate = entry && entry.total > 0 ? (entry.present / entry.total) * 100 : 100;
      if (entry && entry.total > 0 && rate < 75) {
        alerts.push({
          type: 'low_attendance',
          message: `Class ${c.number} - ${c.section} attendance is at ${Math.round(rate)}% this month.`,
          className: `${c.number}-${c.section}`,
        });
      }
    }
  }
  if (pendingReports > 0) {
    alerts.push({ type: 'pending_report', message: `${pendingReports} monthly report(s) awaiting your review.` });
  }

  // At-risk student count per class, for the "At-Risk Students by Class" chart.
  const atRiskByClassMap = new Map<string, number>();
  for (const s of atRiskResult.atRisk) {
    const key = `${s.classNumber}-${s.section}`;
    atRiskByClassMap.set(key, (atRiskByClassMap.get(key) ?? 0) + 1);
  }
  const atRiskByClass = classes.map((c) => ({
    classLabel: `${c.number}-${c.section}`,
    count: atRiskByClassMap.get(`${c.number}-${c.section}`) ?? 0,
  }));

  // Wing attendance rate for each of the last 4 weeks, for the trend chart.
  const attendanceTrend = [];
  if (classIds.length) {
    for (let i = 3; i >= 0; i--) {
      const weekEnd = new Date();
      weekEnd.setDate(weekEnd.getDate() - i * 7);
      const weekStart = new Date(weekEnd);
      weekStart.setDate(weekStart.getDate() - 7);
      const records = await prisma.attendance.findMany({
        where: { subject: { classId: { in: classIds } }, date: { gte: weekStart, lt: weekEnd } },
        select: { status: true },
      });
      const rate =
        records.length > 0
          ? Math.round((records.filter((a) => a.status === 'present').length / records.length) * 100)
          : 0;
      attendanceTrend.push({ weekLabel: `Week ${4 - i}`, attendanceRate: rate });
    }
  }

  send(res, 200, {
    wing,
    wingLabel,
    stats: {
      totalTeachers: teachers.length,
      totalStudents,
      totalClasses: classes.length,
      activitiesThisMonth,
      submissionRate,
      attendanceRate,
      pendingReports,
      atRiskStudents: atRiskResult.atRisk.length,
    },
    teacherActivity,
    recentReports: recentReports.map((r) => ({
      id: r.id,
      teacherName: r.teacher.name,
      monthYear: r.monthYear,
      status: r.status,
      updatedAt: r.updatedAt,
    })),
    alerts: alerts.slice(0, 15),
    attendanceTrend,
    atRiskByClass,
  });
}

// =================================================================
// 2. Teachers
// GET /api/coordinator/teachers
// =================================================================

export async function getTeachers(req: AuthRequest, res: Response): Promise<void> {
  const ctx = await requireWingContext(req, res);
  if (!ctx) return;

  const teachers = await getWingTeachers(ctx.schoolId, ctx.wing);
  const activity = await computeTeacherActivity(teachers);

  send(res, 200, { teachers: activity });
}

// =================================================================
// 3. Teacher detail
// GET /api/coordinator/teachers/:id
// =================================================================

export async function getTeacherDetail(req: AuthRequest, res: Response): Promise<void> {
  const ctx = await requireWingContext(req, res);
  if (!ctx) return;

  const teacher = await prisma.user.findFirst({
    where: { id: req.params.id, schoolId: ctx.schoolId, role: 'teacher' },
    include: {
      teacherProfile: true,
      teachingSubjects: {
        select: { id: true, name: true, classId: true, class: { select: { id: true, number: true, section: true } } },
      },
      classTeacherOf: { select: { id: true, number: true, section: true } },
    },
  });
  if (!teacher) {
    send(res, 404, undefined, 'Teacher not found');
    return;
  }

  const threeMonthsAgo = new Date();
  threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);

  const [activitiesLast3Months, attendanceLastMonth, reports, summaryList] = await Promise.all([
    prisma.activity.findMany({
      where: { createdById: teacher.id, createdAt: { gte: threeMonthsAgo } },
      select: { id: true, title: true, createdAt: true, dueDate: true, subject: { select: { name: true } } },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.attendance.findMany({
      where: {
        subject: { teacherId: teacher.id },
        date: { gte: monthRange(currentMonthYear()).start, lt: monthRange(currentMonthYear()).end },
      },
      select: { status: true },
    }),
    prisma.monthlyReport.findMany({ where: { teacherId: teacher.id }, orderBy: { monthYear: 'desc' } }),
    computeTeacherActivity([teacher]),
  ]);

  const attendanceRate =
    attendanceLastMonth.length > 0
      ? Math.round(
          (attendanceLastMonth.filter((a) => a.status === 'present').length / attendanceLastMonth.length) * 100
        )
      : 0;

  send(res, 200, {
    teacher: {
      id: teacher.id,
      name: teacher.name,
      email: teacher.email,
      wing: teacher.teacherProfile?.wing,
      lastLoginAt: teacher.lastLoginAt,
    },
    classes: [
      ...teacher.teachingSubjects.map((s) => ({ classLabel: `${s.class.number}-${s.class.section}`, subject: s.name })),
    ],
    classTeacherOf: teacher.classTeacherOf.map((c) => `${c.number}-${c.section}`),
    activitiesLast3Months,
    attendanceRateThisMonth: attendanceRate,
    monthlyReports: reports,
    summary: summaryList[0] ?? null,
  });
}

// Not in the original 8-endpoint spec, but STEP 5's "Send Reminder" action
// on the teachers list needs somewhere to POST to.
// POST /api/coordinator/teachers/:id/remind
export async function remindTeacher(req: AuthRequest, res: Response): Promise<void> {
  const ctx = await requireWingContext(req, res);
  if (!ctx) return;

  const teacher = await prisma.user.findFirst({
    where: { id: req.params.id, schoolId: ctx.schoolId, role: 'teacher' },
  });
  if (!teacher) {
    send(res, 404, undefined, 'Teacher not found');
    return;
  }

  const monthLabel = new Date().toLocaleString('en-US', { month: 'long', year: 'numeric' });
  await prisma.notification.create({
    data: {
      userId: teacher.id,
      type: 'MONTHLY_REPORT_REMINDER',
      message: `Please submit your monthly report for ${monthLabel}.`,
    },
  });

  await auditLog({
    userId: req.user!.userId,
    action: 'COORDINATOR_SEND_REMINDER',
    targetTable: 'User',
    targetId: teacher.id,
    ip: req.ip,
  });

  send(res, 200, { message: 'Reminder sent' });
}

// =================================================================
// 4. Monthly reports
// GET /api/coordinator/reports?monthYear=&status=
// =================================================================

export async function getMonthlyReports(req: AuthRequest, res: Response): Promise<void> {
  const ctx = await requireWingContext(req, res);
  if (!ctx) return;

  const teachers = await getWingTeachers(ctx.schoolId, ctx.wing);
  const teacherIds = teachers.map((t) => t.id);
  const { monthYear, status } = req.query;

  const reports = teacherIds.length
    ? await prisma.monthlyReport.findMany({
        where: {
          teacherId: { in: teacherIds },
          ...(monthYear ? { monthYear: String(monthYear) } : {}),
          ...(status ? { status: String(status) as never } : {}),
        },
        include: { teacher: { select: { name: true, email: true } } },
        orderBy: { updatedAt: 'desc' },
      })
    : [];

  send(res, 200, { reports });
}

// =================================================================
// 5. Review report
// PATCH /api/coordinator/reports/:id/review
// =================================================================

const reviewReportSchema = z.object({
  coordinatorComment: z.string().max(2000).optional(),
  action: z.enum(['reviewed', 'forwarded', 'rejected']),
});

export async function reviewReport(req: AuthRequest, res: Response): Promise<void> {
  const ctx = await requireWingContext(req, res);
  if (!ctx) return;

  const parsed = reviewReportSchema.safeParse(req.body);
  if (!parsed.success) {
    send(res, 400, undefined, 'Invalid review data');
    return;
  }

  const teachers = await getWingTeachers(ctx.schoolId, ctx.wing);
  const teacherIds = teachers.map((t) => t.id);

  const existing = await prisma.monthlyReport.findFirst({
    where: { id: req.params.id, teacherId: { in: teacherIds } },
  });
  if (!existing) {
    send(res, 404, undefined, 'Monthly report not found');
    return;
  }

  const report = await prisma.monthlyReport.update({
    where: { id: existing.id },
    data: {
      status: parsed.data.action,
      coordinatorComment: parsed.data.coordinatorComment,
      coordinatorReviewedAt: new Date(),
      coordinatorId: req.user!.userId,
    },
  });

  if (parsed.data.action === 'forwarded') {
    const admins = await prisma.user.findMany({ where: { schoolId: ctx.schoolId, role: 'school_admin' } });
    if (admins.length > 0) {
      await prisma.notification.createMany({
        data: admins.map((a) => ({
          userId: a.id,
          type: 'MONTHLY_REPORT_FORWARDED',
          message: `A monthly report for ${report.monthYear} was forwarded by the ${ctx.wingLabel} coordinator.`,
        })),
      });
    }
  }

  await auditLog({
    userId: req.user!.userId,
    action: 'COORDINATOR_REVIEW',
    targetTable: 'MonthlyReport',
    targetId: report.id,
    meta: { action: parsed.data.action },
    ip: req.ip,
  });

  send(res, 200, report);
}

// =================================================================
// 6. Students overview
// GET /api/coordinator/students
// =================================================================

export async function getStudentsOverview(req: AuthRequest, res: Response): Promise<void> {
  const ctx = await requireWingContext(req, res);
  if (!ctx) return;

  const classes = await getWingClasses(ctx.schoolId, ctx.wing);
  const classIds = classes.map((c) => c.id);
  const { atRisk, byClass } = await computeAtRiskStudents(classIds);

  const totalStudents = classIds.length ? await prisma.studentProfile.count({ where: { classId: { in: classIds } } }) : 0;

  const allAttendance: number[] = [];
  const allGrades: number[] = [];
  const byClassSummary = classes.map((c) => {
    const bucket = byClass.get(c.id) ?? { attendance: [], grades: [] };
    allAttendance.push(...bucket.attendance);
    allGrades.push(...bucket.grades);
    const avgAttendance = bucket.attendance.length
      ? Math.round(bucket.attendance.reduce((a, b) => a + b, 0) / bucket.attendance.length)
      : 0;
    const avgGrade = bucket.grades.length
      ? Math.round(bucket.grades.reduce((a, b) => a + b, 0) / bucket.grades.length)
      : 0;
    return {
      classNumber: c.number,
      section: c.section,
      studentCount: 0, // filled below
      attendanceRate: avgAttendance,
      averageGrade: avgGrade,
    };
  });

  // fill studentCount per class
  const countsByClassId = classIds.length
    ? await prisma.studentProfile.groupBy({ by: ['classId'], where: { classId: { in: classIds } }, _count: { _all: true } })
    : [];
  const countMap = new Map(countsByClassId.map((c) => [c.classId, c._count._all]));
  classes.forEach((c, i) => {
    byClassSummary[i].studentCount = countMap.get(c.id) ?? 0;
  });

  send(res, 200, {
    totalStudents,
    averageAttendance: allAttendance.length
      ? Math.round(allAttendance.reduce((a, b) => a + b, 0) / allAttendance.length)
      : 0,
    averageGrade: allGrades.length ? Math.round(allGrades.reduce((a, b) => a + b, 0) / allGrades.length) : 0,
    atRiskStudents: atRisk,
    byClass: byClassSummary,
  });
}

// =================================================================
// 7. Announcements
// =================================================================

export async function getCoordinatorAnnouncements(req: AuthRequest, res: Response): Promise<void> {
  const ctx = await requireWingContext(req, res);
  if (!ctx) return;

  const classes = await getWingClasses(ctx.schoolId, ctx.wing);
  const classIds = classes.map((c) => c.id);

  const announcements = await prisma.announcement.findMany({
    where: {
      isActive: true,
      OR: [{ authorId: req.user!.userId }, { classId: { in: classIds } }],
    },
    orderBy: { createdAt: 'desc' },
  });

  send(res, 200, { announcements });
}

const createCoordinatorAnnouncementSchema = z.object({
  title: z.string().min(1).max(200),
  body: z.string().min(1).max(2000),
  targetWing: z.boolean(),
});

export async function createCoordinatorAnnouncement(req: AuthRequest, res: Response): Promise<void> {
  const ctx = await requireWingContext(req, res);
  if (!ctx) return;

  const parsed = createCoordinatorAnnouncementSchema.safeParse(req.body);
  if (!parsed.success) {
    send(res, 400, undefined, 'Invalid announcement data');
    return;
  }
  const { title, body, targetWing } = parsed.data;

  if (targetWing) {
    const classes = await getWingClasses(ctx.schoolId, ctx.wing);
    const created = await prisma.$transaction(
      classes.map((c) =>
        prisma.announcement.create({
          data: { schoolId: ctx.schoolId, authorId: req.user!.userId, classId: c.id, title, body },
        })
      )
    );
    await auditLog({
      userId: req.user!.userId,
      action: 'COORDINATOR_ANNOUNCEMENT_CREATE',
      targetTable: 'Announcement',
      meta: { title, targetWing: true, count: created.length },
      ip: req.ip,
    });
    send(res, 201, { announcements: created });
    return;
  }

  const announcement = await prisma.announcement.create({
    data: { schoolId: ctx.schoolId, authorId: req.user!.userId, classId: null, title, body },
  });

  await auditLog({
    userId: req.user!.userId,
    action: 'COORDINATOR_ANNOUNCEMENT_CREATE',
    targetTable: 'Announcement',
    targetId: announcement.id,
    meta: { title, targetWing: false },
    ip: req.ip,
  });

  send(res, 201, announcement);
}

export async function deleteCoordinatorAnnouncement(req: AuthRequest, res: Response): Promise<void> {
  const ctx = await requireWingContext(req, res);
  if (!ctx) return;

  const existing = await prisma.announcement.findFirst({
    where: { id: req.params.id, schoolId: ctx.schoolId, authorId: req.user!.userId },
  });
  if (!existing) {
    send(res, 404, undefined, 'Announcement not found');
    return;
  }

  await prisma.announcement.update({ where: { id: existing.id }, data: { isActive: false } });

  await auditLog({
    userId: req.user!.userId,
    action: 'COORDINATOR_ANNOUNCEMENT_DELETE',
    targetTable: 'Announcement',
    targetId: existing.id,
    ip: req.ip,
  });

  send(res, 200, { message: 'Announcement deleted' });
}

// =================================================================
// 8. Wing report (submitted to admin)
// =================================================================

async function buildWingSummary(schoolId: string, wing: WingValue, monthYear: string) {
  const classes = await getWingClasses(schoolId, wing);
  const classIds = classes.map((c) => c.id);
  const teachers = await getWingTeachers(schoolId, wing);
  const activity = await computeTeacherActivity(teachers);
  const { atRisk } = await computeAtRiskStudents(classIds);

  const { start, end } = monthRange(monthYear);
  const attendanceRecords = classIds.length
    ? await prisma.attendance.findMany({
        where: { subject: { classId: { in: classIds } }, date: { gte: start, lt: end } },
        select: { status: true },
      })
    : [];
  const attendanceRate =
    attendanceRecords.length > 0
      ? Math.round(
          (attendanceRecords.filter((a) => a.status === 'present').length / attendanceRecords.length) * 100
        )
      : 0;

  const activitiesCreated = activity.reduce((sum, t) => sum + t.activitiesThisMonth, 0);
  const activeTeachers = activity.filter((t) => t.activityStatus === 'active').length;
  const inactiveTeachers = activity.filter((t) => t.activityStatus === 'inactive').length;

  const reports = teachers.length
    ? await prisma.monthlyReport.findMany({
        where: { teacherId: { in: teachers.map((t) => t.id) }, monthYear },
        select: { status: true },
      })
    : [];
  const submittedReports = reports.filter((r) => r.status !== 'draft').length;

  const totalStudents = classIds.length ? await prisma.studentProfile.count({ where: { classId: { in: classIds } } }) : 0;

  return {
    monthYear,
    totalTeachers: teachers.length,
    activeTeachers,
    inactiveTeachers,
    totalStudents,
    wingAttendanceRate: attendanceRate,
    activitiesCreated,
    atRiskStudentCount: atRisk.length,
    teacherReportsSubmitted: submittedReports,
    teacherReportsTotal: teachers.length,
    teacherSummaries: activity.map((t) => ({
      teacherName: t.teacherName,
      activitiesThisMonth: t.activitiesThisMonth,
      activityStatus: t.activityStatus,
      reportStatus: t.reportStatus,
    })),
    atRiskList: atRisk,
  };
}

// GET /api/coordinator/wing-report/:monthYear
export async function getWingReport(req: AuthRequest, res: Response): Promise<void> {
  const ctx = await requireWingContext(req, res);
  if (!ctx) return;

  const { monthYear } = req.params;
  const [summary, existing] = await Promise.all([
    buildWingSummary(ctx.schoolId, ctx.wing, monthYear),
    prisma.wingReport.findUnique({
      where: { schoolId_wing_monthYear: { schoolId: ctx.schoolId, wing: ctx.wing, monthYear } },
    }),
  ]);

  send(res, 200, { summary, existing });
}

const submitWingReportSchema = z.object({
  monthYear: z.string().min(1).max(20),
  notes: z.string().max(2000).optional(),
});

// POST /api/coordinator/wing-report
export async function submitWingReport(req: AuthRequest, res: Response): Promise<void> {
  const ctx = await requireWingContext(req, res);
  if (!ctx) return;

  const parsed = submitWingReportSchema.safeParse(req.body);
  if (!parsed.success) {
    send(res, 400, undefined, 'monthYear is required');
    return;
  }
  const { monthYear, notes } = parsed.data;

  const summaryData = await buildWingSummary(ctx.schoolId, ctx.wing, monthYear);
  const summary = summaryData as unknown as Prisma.InputJsonValue;

  const report = await prisma.wingReport.upsert({
    where: { schoolId_wing_monthYear: { schoolId: ctx.schoolId, wing: ctx.wing, monthYear } },
    update: { summary, notes, status: 'submitted', submittedAt: new Date() },
    create: {
      schoolId: ctx.schoolId,
      coordinatorId: req.user!.userId,
      wing: ctx.wing,
      monthYear,
      summary,
      notes,
      status: 'submitted',
    },
  });

  const admins = await prisma.user.findMany({ where: { schoolId: ctx.schoolId, role: 'school_admin' } });
  if (admins.length > 0) {
    await prisma.notification.createMany({
      data: admins.map((a) => ({
        userId: a.id,
        type: 'WING_REPORT_SUBMITTED',
        message: `${ctx.wingLabel} report for ${monthYear} has been submitted for review.`,
      })),
    });
  }

  await auditLog({
    userId: req.user!.userId,
    action: 'WING_REPORT_SUBMIT',
    targetTable: 'WingReport',
    targetId: report.id,
    meta: { monthYear, wing: ctx.wing },
    ip: req.ip,
  });

  send(res, 201, report);
}
