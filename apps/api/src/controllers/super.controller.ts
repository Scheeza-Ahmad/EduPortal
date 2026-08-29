import { Response } from 'express';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { prisma } from '../utils/prisma';
import { send } from '../utils/response';
import { auditLog } from '../utils/audit';
import { sendEmail } from '../utils/mailer';
import { AuthRequest } from '../middleware/auth';

// ---------------------------------------------------------------
// GET /api/super/stats
// ---------------------------------------------------------------

export async function getStats(req: AuthRequest, res: Response): Promise<void> {
  const [totalSchools, usersByRole, totalSubmissions] = await Promise.all([
    prisma.school.count({ where: { isActive: true } }),
    prisma.user.groupBy({
      by: ['role'],
      where: { isActive: true },
      _count: { role: true },
    }),
    prisma.submission.count(),
  ]);

  send(res, 200, {
    totalSchools,
    usersByRole: usersByRole.map((r) => ({ role: r.role, count: r._count.role })),
    totalSubmissions,
  });
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
    await sendEmail({
      to: email,
      subject: 'Welcome to EduPortal',
      html: `<p>Hi ${name},</p><p>A School Admin account has been created for you at <strong>${school.name}</strong>. Sign in with the email and password provided to you by the platform administrator.</p>`,
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
    }),
    prisma.auditLog.count({ where }),
  ]);

  send(res, 200, { logs, page, limit, total, totalPages: Math.ceil(total / limit) });
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
      await sendEmail({
        to: superAdmin.email,
        subject: 'EduPortal backup triggered',
        html: `<p>A manual database backup was triggered at ${new Date().toISOString()}.</p>`,
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
