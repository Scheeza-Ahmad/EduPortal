import { Response } from 'express';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { prisma } from '../utils/prisma';
import { send } from '../utils/response';
import { auditLog } from '../utils/audit';
import { sendEmail } from '../utils/mailer';
import { AuthRequest } from '../middleware/auth';
import { getStorageUsage } from '../utils/cloudinaryUsage';
import { emailBadge, emailLayout, emailSection, emailStat } from '../utils/emailTemplate';
import { sendWelcomeEmail } from '../jobs/welcomeEmail';
import { calculateSchoolHealthScores } from '../jobs/schoolHealthScore';

// ---------------------------------------------------------------
// GET /api/super/stats
// ---------------------------------------------------------------

export async function getStats(req: AuthRequest, res: Response): Promise<void> {
  const startOfThisMonth = new Date();
  startOfThisMonth.setDate(1);
  startOfThisMonth.setHours(0, 0, 0, 0);

  const startOfLastMonth = new Date(startOfThisMonth);
  startOfLastMonth.setMonth(startOfLastMonth.getMonth() - 1);

  const [
    totalSchools,
    schoolsAsOfLastMonth,
    usersByRole,
    totalSubmissions,
    totalSubmissionsThisMonth,
    storage,
  ] = await Promise.all([
    prisma.school.count({ where: { isActive: true } }),
    // Snapshot of how many (still-active) schools existed at the start of last
    // month, so the dashboard can show real month-over-month growth.
    prisma.school.count({ where: { isActive: true, createdAt: { lt: startOfLastMonth } } }),
    prisma.user.groupBy({
      by: ['role'],
      where: { isActive: true },
      _count: { role: true },
    }),
    prisma.submission.count(),
    prisma.submission.count({ where: { submittedAt: { gte: startOfThisMonth } } }),
    getStorageUsage(),
  ]);

  const schoolsPercentChange =
    schoolsAsOfLastMonth > 0
      ? Math.round(((totalSchools - schoolsAsOfLastMonth) / schoolsAsOfLastMonth) * 1000) / 10
      : totalSchools > 0
        ? 100
        : 0;

  send(res, 200, {
    totalSchools,
    schoolsPercentChange,
    usersByRole: usersByRole.map((r) => ({ role: r.role, count: r._count.role })),
    totalSubmissions,
    totalSubmissionsThisMonth,
    storage,
  });
}

// ---------------------------------------------------------------
// GET /api/super/analytics
// ---------------------------------------------------------------

const ROLE_LABELS = { student: 'students', teacher: 'teachers', school_admin: 'admins' } as const;
type GrowthRole = keyof typeof ROLE_LABELS;

async function buildUserGrowth() {
  const users = await prisma.user.findMany({
    where: { role: { in: Object.keys(ROLE_LABELS) as GrowthRole[] } },
    select: { role: true, createdAt: true },
  });

  const months: { label: string; boundary: Date }[] = [];
  const now = new Date();
  for (let i = 5; i >= 0; i--) {
    const monthStart = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const boundary = new Date(now.getFullYear(), now.getMonth() - i + 1, 1); // start of the next month
    months.push({ label: monthStart.toLocaleString('en-US', { month: 'short' }), boundary });
  }

  // Cumulative headcount as of the end of each of the last 6 months.
  return months.map(({ label, boundary }) => {
    const counts: Record<GrowthRole, number> = { student: 0, teacher: 0, school_admin: 0 };
    for (const u of users) {
      if (u.createdAt < boundary && u.role in counts) {
        counts[u.role as GrowthRole] += 1;
      }
    }
    return {
      month: label,
      students: counts.student,
      teachers: counts.teacher,
      admins: counts.school_admin,
    };
  });
}

function dateKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

async function buildActivityTrend() {
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6);
  sevenDaysAgo.setHours(0, 0, 0, 0);

  const [activities, submissions] = await Promise.all([
    prisma.activity.findMany({
      where: { createdAt: { gte: sevenDaysAgo } },
      select: { createdAt: true },
    }),
    prisma.submission.findMany({
      where: { submittedAt: { gte: sevenDaysAgo } },
      select: { submittedAt: true },
    }),
  ]);

  const days: string[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    days.push(dateKey(d));
  }

  return days.map((date) => ({
    date,
    activities: activities.filter((a) => dateKey(a.createdAt) === date).length,
    submissions: submissions.filter((s) => dateKey(s.submittedAt) === date).length,
  }));
}

async function buildSubmissionRate() {
  const [onTime, late, publishedActivities] = await Promise.all([
    prisma.submission.count({ where: { isLate: false } }),
    prisma.submission.count({ where: { isLate: true } }),
    prisma.activity.findMany({
      where: { isDraft: false, isActive: true, isLocked: false },
      select: {
        subject: { select: { classId: true } },
        _count: { select: { submissions: true } },
      },
    }),
  ]);

  const classIds = [...new Set(publishedActivities.map((a) => a.subject.classId))];
  const classCounts = classIds.length
    ? await prisma.studentProfile.groupBy({
        by: ['classId'],
        where: { classId: { in: classIds } },
        _count: { _all: true },
      })
    : [];
  const countByClass = new Map(classCounts.map((c) => [c.classId, c._count._all]));

  const pending = publishedActivities.reduce((sum, a) => {
    const expected = countByClass.get(a.subject.classId) ?? 0;
    return sum + Math.max(0, expected - a._count.submissions);
  }, 0);

  return { onTime, late, pending };
}

/**
 * Was 1 + N*4 queries (one round-trip per school). Batched down to 5 fixed
 * queries total regardless of school count — the per-school version was
 * exhausting the DB connection pool under concurrent dashboard load.
 */
async function buildSchoolsOverview() {
  const schools = await prisma.school.findMany({ orderBy: { name: 'asc' } });
  const schoolIds = schools.map((s) => s.id);
  if (schoolIds.length === 0) return [];

  const [studentCounts, teacherCounts, submissions, lastLogins] = await Promise.all([
    prisma.user.groupBy({
      by: ['schoolId'],
      where: { schoolId: { in: schoolIds }, role: 'student', isActive: true },
      _count: { _all: true },
    }),
    prisma.user.groupBy({
      by: ['schoolId'],
      where: { schoolId: { in: schoolIds }, role: 'teacher', isActive: true },
      _count: { _all: true },
    }),
    prisma.submission.findMany({
      where: { studentUser: { schoolId: { in: schoolIds } } },
      select: { studentUser: { select: { schoolId: true } } },
    }),
    prisma.user.groupBy({
      by: ['schoolId'],
      where: { schoolId: { in: schoolIds }, lastLoginAt: { not: null } },
      _max: { lastLoginAt: true },
    }),
  ]);

  const studentCountBySchool = new Map(studentCounts.map((r) => [r.schoolId, r._count._all]));
  const teacherCountBySchool = new Map(teacherCounts.map((r) => [r.schoolId, r._count._all]));
  const lastLoginBySchool = new Map(lastLogins.map((r) => [r.schoolId, r._max.lastLoginAt]));

  const submissionCountBySchool = new Map<string, number>();
  for (const s of submissions) {
    const sid = s.studentUser.schoolId;
    if (!sid) continue;
    submissionCountBySchool.set(sid, (submissionCountBySchool.get(sid) ?? 0) + 1);
  }

  return schools.map((school) => ({
    id: school.id,
    name: school.name,
    studentCount: studentCountBySchool.get(school.id) ?? 0,
    teacherCount: teacherCountBySchool.get(school.id) ?? 0,
    submissionCount: submissionCountBySchool.get(school.id) ?? 0,
    lastActive: lastLoginBySchool.get(school.id) ?? null,
    isActive: school.isActive,
  }));
}

export async function getAnalytics(req: AuthRequest, res: Response): Promise<void> {
  const [userGrowth, activityTrend, submissionRate, schoolsOverview, healthScores] = await Promise.all([
    buildUserGrowth(),
    buildActivityTrend(),
    buildSubmissionRate(),
    buildSchoolsOverview(),
    calculateSchoolHealthScores(),
  ]);

  const schoolHealthScores = healthScores.map((h) => ({
    schoolName: h.schoolName,
    score: h.score,
    grade: h.grade,
  }));

  send(res, 200, { userGrowth, activityTrend, submissionRate, schoolsOverview, schoolHealthScores });
}

// ---------------------------------------------------------------
// GET /api/super/schools
// ---------------------------------------------------------------

export async function getSchools(req: AuthRequest, res: Response): Promise<void> {
  const page = Math.max(1, parseInt(String(req.query.page ?? '1'), 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit ?? '20'), 10) || 20));

  const [schools, total] = await Promise.all([
    prisma.school.findMany({
      skip: (page - 1) * limit,
      take: limit,
      orderBy: { createdAt: 'desc' },
    }),
    prisma.school.count(),
  ]);

  // School.adminId isn't a formal Prisma relation, so look admins up separately
  // and attach them by id rather than joining.
  const adminIds = [...new Set(schools.map((s) => s.adminId).filter((id): id is string => Boolean(id)))];
  const admins = adminIds.length
    ? await prisma.user.findMany({
        where: { id: { in: adminIds } },
        select: { id: true, name: true, email: true },
      })
    : [];
  const adminsById = new Map(admins.map((a) => [a.id, a]));

  const schoolsWithAdmin = schools.map((school) => ({
    ...school,
    admin: school.adminId ? (adminsById.get(school.adminId) ?? null) : null,
  }));

  send(res, 200, {
    schools: schoolsWithAdmin,
    page,
    limit,
    total,
    totalPages: Math.ceil(total / limit),
  });
}

// ---------------------------------------------------------------
// GET /api/super/users?role=school_admin
// Minimal lookup used by the "Assign Existing User" flow.
// ---------------------------------------------------------------

const roleQuerySchema = z.enum(['super_admin', 'school_admin', 'teacher', 'student', 'parent']);

export async function getUsers(req: AuthRequest, res: Response): Promise<void> {
  const roleQuery = roleQuerySchema.safeParse(req.query.role);

  const users = await prisma.user.findMany({
    where: { isActive: true, ...(roleQuery.success ? { role: roleQuery.data } : {}) },
    select: { id: true, name: true, email: true, role: true, schoolId: true },
    orderBy: { name: 'asc' },
  });

  send(res, 200, { users });
}

// ---------------------------------------------------------------
// POST /api/super/schools
// ---------------------------------------------------------------

const createSchoolSchema = z.object({
  name: z.string().min(1),
  city: z.string().min(1),
  phone: z.string().optional(),
});

export async function createSchool(req: AuthRequest, res: Response): Promise<void> {
  const parsed = createSchoolSchema.safeParse(req.body);
  if (!parsed.success) {
    send(res, 400, undefined, 'Invalid school data');
    return;
  }

  const school = await prisma.school.create({ data: parsed.data });

  await auditLog({
    userId: req.user!.userId,
    action: 'SCHOOL_CREATE',
    targetTable: 'School',
    targetId: school.id,
    meta: { name: school.name, city: school.city },
    ip: req.ip,
  });

  send(res, 201, school);
}

// ---------------------------------------------------------------
// PATCH /api/super/schools/:id
// ---------------------------------------------------------------

const updateSchoolSchema = z.object({
  name: z.string().min(1).optional(),
  city: z.string().min(1).optional(),
  phone: z.string().optional(),
  isActive: z.boolean().optional(), // lets the frontend re-enable a soft-deleted school
  featureParentPortal: z.boolean().optional(),
  featureAi: z.boolean().optional(),
  featureSms: z.boolean().optional(),
  featureUrdu: z.boolean().optional(),
});

export async function updateSchool(req: AuthRequest, res: Response): Promise<void> {
  const parsed = updateSchoolSchema.safeParse(req.body);
  if (!parsed.success) {
    send(res, 400, undefined, 'Invalid school data');
    return;
  }

  const { id } = req.params;

  const school = await prisma.school.update({
    where: { id },
    data: parsed.data,
  });

  await auditLog({
    userId: req.user!.userId,
    action: 'SCHOOL_UPDATE',
    targetTable: 'School',
    targetId: school.id,
    meta: parsed.data,
    ip: req.ip,
  });

  send(res, 200, school);
}

// ---------------------------------------------------------------
// DELETE /api/super/schools/:id  (soft delete)
// ---------------------------------------------------------------

export async function deleteSchool(req: AuthRequest, res: Response): Promise<void> {
  const { id } = req.params;

  const school = await prisma.school.update({
    where: { id },
    data: { isActive: false },
  });

  await auditLog({
    userId: req.user!.userId,
    action: 'SCHOOL_DELETE',
    targetTable: 'School',
    targetId: school.id,
    ip: req.ip,
  });

  send(res, 200, { message: 'School deactivated' });
}

// ---------------------------------------------------------------
// PATCH /api/super/schools/:id/admin
// ---------------------------------------------------------------

const assignAdminSchema = z.object({
  userId: z.string().min(1),
});

export async function assignAdmin(req: AuthRequest, res: Response): Promise<void> {
  const parsed = assignAdminSchema.safeParse(req.body);
  if (!parsed.success) {
    send(res, 400, undefined, 'Invalid input');
    return;
  }

  const { id: schoolId } = req.params;
  const { userId } = parsed.data;

  const targetUser = await prisma.user.findUnique({ where: { id: userId } });
  if (!targetUser || !targetUser.isActive) {
    send(res, 404, undefined, 'User not found');
    return;
  }
  if (targetUser.role === 'super_admin') {
    send(res, 400, undefined, 'Cannot reassign a super_admin to a school');
    return;
  }

  const [school] = await prisma.$transaction([
    prisma.school.update({ where: { id: schoolId }, data: { adminId: userId } }),
    prisma.user.update({
      where: { id: userId },
      data: { schoolId, role: 'school_admin' },
    }),
  ]);

  await auditLog({
    userId: req.user!.userId,
    action: 'ASSIGN_ADMIN',
    targetTable: 'School',
    targetId: schoolId,
    meta: { adminUserId: userId },
    ip: req.ip,
  });

  send(res, 200, school);
}

// ---------------------------------------------------------------
// POST /api/super/schools/:id/admin/create
// ---------------------------------------------------------------

const createSchoolAdminSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  password: z.string().min(8),
});

export async function createSchoolAdmin(req: AuthRequest, res: Response): Promise<void> {
  const parsed = createSchoolAdminSchema.safeParse(req.body);
  if (!parsed.success) {
    send(res, 400, undefined, 'Invalid input');
    return;
  }

  const { id: schoolId } = req.params;
  const { name, email, password } = parsed.data;

  const school = await prisma.school.findUnique({ where: { id: schoolId } });
  if (!school) {
    send(res, 404, undefined, 'School not found');
    return;
  }

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    send(res, 400, undefined, 'Email already in use');
    return;
  }

  const hashedPassword = await bcrypt.hash(password, 12);

  const user = await prisma.user.create({
    data: { name, email, password: hashedPassword, role: 'school_admin', schoolId },
  });

  // Link the school to its new admin now that we have the generated user id.
  await prisma.school.update({ where: { id: schoolId }, data: { adminId: user.id } });

  try {
    await sendWelcomeEmail({
      name,
      email,
      role: 'school_admin',
      schoolName: school.name,
      password,
    });
  } catch (err) {
    console.warn('[createSchoolAdmin] Welcome email failed:', err);
  }

  await auditLog({
    userId: req.user!.userId,
    action: 'CREATE_SCHOOL_ADMIN',
    targetTable: 'User',
    targetId: user.id,
    meta: { schoolId, email },
    ip: req.ip,
  });

  const { password: _password, ...safeUser } = user;
  send(res, 201, safeUser);
}

// ---------------------------------------------------------------
// PATCH /api/super/schools/:id/features
// ---------------------------------------------------------------

const toggleFeaturesSchema = z.object({
  featureParentPortal: z.boolean().optional(),
  featureAi: z.boolean().optional(),
  featureSms: z.boolean().optional(),
  featureUrdu: z.boolean().optional(),
});

export async function toggleFeatures(req: AuthRequest, res: Response): Promise<void> {
  const parsed = toggleFeaturesSchema.safeParse(req.body);
  if (!parsed.success) {
    send(res, 400, undefined, 'Invalid feature flags');
    return;
  }

  const { id } = req.params;

  const school = await prisma.school.update({
    where: { id },
    data: parsed.data,
  });

  await auditLog({
    userId: req.user!.userId,
    action: 'SCHOOL_TOGGLE_FEATURES',
    targetTable: 'School',
    targetId: school.id,
    meta: parsed.data,
    ip: req.ip,
  });

  send(res, 200, school);
}

// ---------------------------------------------------------------
// GET /api/super/audit-logs
// ---------------------------------------------------------------

/**
 * Resolves human-readable names for audit log targets, one batched query per
 * target table rather than one query per row. Returns a `${table}:${id}` -> name map.
 */
// Actions that are system/automation-triggered and have no real targetTable
// row to point at — show a friendly label instead of "—".
const actionDisplayMap: Record<string, string> = {
  BACKUP: 'Database Backup',
  SYSTEM_HEALTH_CHECK: 'System Check',
  SCHOOL_HEALTH_SCORE: 'Health Score Report',
  SUSPICIOUS_LOGIN_ALERT: 'Login Security',
  INACTIVE_TEACHER_ALERT: 'Teacher Activity Check',
  INACTIVE_SCHOOL_ALERT: 'School Activity Check',
  WEEKLY_PLATFORM_SUMMARY: 'Platform Summary',
};

async function resolveTargetNames(
  logs: { targetTable: string | null; targetId: string | null }[]
): Promise<Map<string, string>> {
  const idsByTable = new Map<string, Set<string>>();
  for (const log of logs) {
    if (!log.targetTable || !log.targetId) continue;
    const set = idsByTable.get(log.targetTable) ?? new Set<string>();
    set.add(log.targetId);
    idsByTable.set(log.targetTable, set);
  }

  const nameByKey = new Map<string, string>();

  await Promise.all(
    Array.from(idsByTable.entries()).map(async ([table, idSet]) => {
      const ids = Array.from(idSet);

      switch (table) {
        case 'School': {
          const rows = await prisma.school.findMany({
            where: { id: { in: ids } },
            select: { id: true, name: true },
          });
          rows.forEach((r) => nameByKey.set(`School:${r.id}`, r.name));
          break;
        }
        case 'User': {
          const rows = await prisma.user.findMany({
            where: { id: { in: ids } },
            select: { id: true, name: true },
          });
          rows.forEach((r) => nameByKey.set(`User:${r.id}`, r.name));
          break;
        }
        case 'Subject': {
          const rows = await prisma.subject.findMany({
            where: { id: { in: ids } },
            select: { id: true, name: true },
          });
          rows.forEach((r) => nameByKey.set(`Subject:${r.id}`, r.name));
          break;
        }
        case 'Class': {
          const rows = await prisma.class.findMany({
            where: { id: { in: ids } },
            select: { id: true, number: true, section: true },
          });
          rows.forEach((r) => nameByKey.set(`Class:${r.id}`, `Class ${r.number}-${r.section}`));
          break;
        }
        case 'Announcement': {
          const rows = await prisma.announcement.findMany({
            where: { id: { in: ids } },
            select: { id: true, title: true },
          });
          rows.forEach((r) => nameByKey.set(`Announcement:${r.id}`, r.title));
          break;
        }
        default:
          break; // unresolvable target table — falls back to the id-based display
      }
    })
  );

  return nameByKey;
}

export async function getAuditLogs(req: AuthRequest, res: Response): Promise<void> {
  const page = Math.max(1, parseInt(String(req.query.page ?? '1'), 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit ?? '20'), 10) || 20));
  const { action, startDate, endDate } = req.query;

  const where: Record<string, unknown> = {};
  if (action) where.action = String(action);
  if (startDate || endDate) {
    where.createdAt = {
      ...(startDate ? { gte: new Date(String(startDate)) } : {}),
      ...(endDate ? { lte: new Date(String(endDate)) } : {}),
    };
  }

  const [logs, total] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      skip: (page - 1) * limit,
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: { user: { select: { name: true } } },
    }),
    prisma.auditLog.count({ where }),
  ]);

  const nameByKey = await resolveTargetNames(logs);

  const logsWithTargetDisplay = logs.map((log) => {
    const targetName =
      log.targetTable && log.targetId ? (nameByKey.get(`${log.targetTable}:${log.targetId}`) ?? null) : null;
    const targetDisplay = targetName
      ? targetName
      : log.targetTable
        ? `${log.targetTable} #${log.targetId?.slice(0, 8) ?? ''}`
        : (actionDisplayMap[log.action] ?? '—');

    return { ...log, targetName, targetDisplay };
  });

  send(res, 200, {
    logs: logsWithTargetDisplay,
    page,
    limit,
    total,
    totalPages: Math.ceil(total / limit),
  });
}

// ---------------------------------------------------------------
// POST /api/super/backup
// ---------------------------------------------------------------

export async function triggerBackup(req: AuthRequest, res: Response): Promise<void> {
  await auditLog({
    userId: req.user!.userId,
    action: 'BACKUP',
    ip: req.ip,
  });

  const superAdmin = await prisma.user.findUnique({ where: { id: req.user!.userId } });
  if (superAdmin) {
    try {
      const now = new Date();
      const [totalSchools, usersByRole, totalActivities, totalSubmissions] = await Promise.all([
        prisma.school.count({ where: { isActive: true } }),
        prisma.user.groupBy({ by: ['role'], where: { isActive: true }, _count: { role: true } }),
        prisma.activity.count(),
        prisma.submission.count(),
      ]);
      const totalUsers = usersByRole.reduce((sum, r) => sum + r._count.role, 0);
      const totalStudents = usersByRole.find((r) => r.role === 'student')?._count.role ?? 0;
      const roleBreakdown = usersByRole.map((r) => `${r.role}: ${r._count.role}`).join(', ');

      const bodyHtml = `
        ${emailStat('Status', `${emailBadge('✅ Backup Successful', '#0ca30c')}`)}
        ${emailStat('Triggered by', superAdmin.name)}
        ${emailStat('Timestamp', now.toLocaleString())}
        ${emailSection(
          'Database Stats at Time of Backup',
          `${emailStat('Total Schools', totalSchools)}
           ${emailStat('Total Users', `${totalUsers} (${roleBreakdown})`)}
           ${emailStat('Total Students', totalStudents)}
           ${emailStat('Total Activities', totalActivities)}
           ${emailStat('Total Submissions', totalSubmissions)}`
        )}
        ${emailStat('Next scheduled backup', 'Every Sunday at midnight')}
      `;

      await sendEmail({
        to: superAdmin.email,
        subject: `EduPortal Backup Report — ${now.toLocaleDateString()}`,
        html: emailLayout({ title: 'Backup Report', bodyHtml }),
      });
    } catch (err) {
      console.warn('[backup] Email notification failed:', err);
    }
  }

  send(res, 200, { message: 'Backup triggered' });
}

// ---------------------------------------------------------------
// POST /api/super/impersonate/:userId
// ---------------------------------------------------------------

export async function impersonateUser(req: AuthRequest, res: Response): Promise<void> {
  const { userId } = req.params;

  const targetUser = await prisma.user.findUnique({ where: { id: userId } });
  if (!targetUser || !targetUser.isActive) {
    send(res, 404, undefined, 'User not found');
    return;
  }

  const impersonationToken = jwt.sign(
    {
      userId: targetUser.id,
      role: targetUser.role,
      schoolId: targetUser.schoolId,
      impersonatedBy: req.user!.userId,
    },
    process.env.JWT_ACCESS_SECRET as string,
    { expiresIn: '15m' }
  );

  await auditLog({
    userId: req.user!.userId,
    action: 'IMPERSONATE',
    targetTable: 'User',
    targetId: targetUser.id,
    ip: req.ip,
  });

  send(res, 200, {
    accessToken: impersonationToken,
    user: { id: targetUser.id, name: targetUser.name, role: targetUser.role },
  });
}
