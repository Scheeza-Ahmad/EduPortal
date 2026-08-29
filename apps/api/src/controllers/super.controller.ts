import { Response } from 'express';
import jwt from 'jsonwebtoken';
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

  send(res, 200, { schools, page, limit, total, totalPages: Math.ceil(total / limit) });
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
// POST /api/super/schools/:id/assign-admin
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
  if (!targetUser || targetUser.role !== 'school_admin') {
    send(res, 400, undefined, 'Target user must be an existing school_admin');
    return;
  }

  const [school] = await prisma.$transaction([
    prisma.school.update({ where: { id: schoolId }, data: { adminId: userId } }),
    prisma.user.update({ where: { id: userId }, data: { schoolId } }),
  ]);

  await auditLog({
    userId: req.user!.userId,
    action: 'SCHOOL_ASSIGN_ADMIN',
    targetTable: 'School',
    targetId: schoolId,
    meta: { adminUserId: userId },
    ip: req.ip,
  });

  send(res, 200, school);
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
