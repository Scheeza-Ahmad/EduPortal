import { Response } from 'express';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../utils/prisma';
import { send } from '../utils/response';
import { auditLog } from '../utils/audit';
import { AuthRequest } from '../middleware/auth';
import { sendWelcomeEmail } from '../jobs/welcomeEmail';
import { buildReportCard } from '../services/reportCard';
import { applyLeaveAttendance } from '../utils/leaveAttendance';
import { notifyAnnouncementAudience, notifyAnnouncementRecipients } from '../utils/announcementNotify';

// ---------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------

/** Every route in this controller belongs to a school_admin, who must have a schoolId. */
function requireSchoolId(req: AuthRequest, res: Response): string | null {
  const schoolId = req.user?.schoolId;
  if (!schoolId) {
    send(res, 403, undefined, 'No school assigned to this account');
    return null;
  }
  return schoolId;
}

function parsePagination(req: AuthRequest) {
  const page = Math.max(1, parseInt(String(req.query.page ?? '1'), 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit ?? '20'), 10) || 20));
  return { page, limit };
}

function isUniqueConstraintError(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002';
}

// A teacher may carry 1-3 subjects at once — enforced wherever a subject is
// created or reassigned to a teacher.
const MAX_SUBJECTS_PER_TEACHER = 3;

/** Active subject count for a teacher within this school, optionally
 * excluding one subject (used when re-saving a subject that already belongs
 * to that same teacher — it shouldn't count against its own limit). */
async function countTeacherSubjects(
  schoolId: string,
  teacherId: string,
  excludeSubjectId?: string
): Promise<number> {
  return prisma.subject.count({
    where: {
      teacherId,
      isActive: true,
      class: { schoolId },
      ...(excludeSubjectId ? { id: { not: excludeSubjectId } } : {}),
    },
  });
}

/** Strips the password hash before a user object is ever sent in a response. */
function stripPassword<T extends { password: string }>(user: T): Omit<T, 'password'> {
  const { password: _password, ...rest } = user;
  return rest;
}

// =================================================================
// 1. Stats
// GET /api/admin/stats
// =================================================================

export async function getStats(req: AuthRequest, res: Response): Promise<void> {
  const schoolId = requireSchoolId(req, res);
  if (!schoolId) return;

  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);

  const [totalStudents, totalTeachers, totalClasses, totalActivities, presentCount, totalAttendance] =
    await Promise.all([
      prisma.user.count({ where: { schoolId, role: 'student', isActive: true } }),
      prisma.user.count({ where: { schoolId, role: { in: ['teacher', 'coordinator'] }, isActive: true } }),
      prisma.class.count({ where: { schoolId, isActive: true } }),
      prisma.activity.count({ where: { subject: { class: { schoolId } } } }),
      prisma.attendance.count({
        where: { subject: { class: { schoolId } }, date: { gte: startOfMonth }, status: 'present' },
      }),
      prisma.attendance.count({
        where: { subject: { class: { schoolId } }, date: { gte: startOfMonth } },
      }),
    ]);

  const attendanceRate = totalAttendance > 0 ? (presentCount / totalAttendance) * 100 : 0;

  send(res, 200, {
    totalStudents,
    totalTeachers,
    totalClasses,
    totalActivities,
    attendanceRate: Math.round(attendanceRate * 10) / 10,
  });
}

// GET /api/admin/stats/trend — last 6 weeks of school-wide attendance, for
// the dashboard chart.
export async function getStatsTrend(req: AuthRequest, res: Response): Promise<void> {
  const schoolId = requireSchoolId(req, res);
  if (!schoolId) return;

  const weeks = [];
  for (let i = 5; i >= 0; i--) {
    const weekEnd = new Date();
    weekEnd.setDate(weekEnd.getDate() - i * 7);
    const weekStart = new Date(weekEnd);
    weekStart.setDate(weekStart.getDate() - 7);

    const records = await prisma.attendance.findMany({
      where: { subject: { class: { schoolId } }, date: { gte: weekStart, lt: weekEnd } },
      select: { status: true },
    });
    const rate =
      records.length > 0
        ? Math.round((records.filter((a) => a.status === 'present').length / records.length) * 100)
        : 0;
    weeks.push({ weekLabel: `Week ${6 - i}`, attendanceRate: rate });
  }

  // Students per class, for the class-distribution chart.
  const classes = await prisma.class.findMany({
    where: { schoolId, isActive: true },
    select: { number: true, section: true, _count: { select: { studentProfiles: true } } },
    orderBy: [{ number: 'asc' }, { section: 'asc' }],
  });

  send(res, 200, {
    attendanceTrend: weeks,
    studentsByClass: classes.map((c) => ({
      classLabel: `${c.number}-${c.section}`,
      studentCount: c._count.studentProfiles,
    })),
  });
}

// =================================================================
// 2. Student Management
// =================================================================

export async function getStudents(req: AuthRequest, res: Response): Promise<void> {
  const schoolId = requireSchoolId(req, res);
  if (!schoolId) return;

  const { page, limit } = parsePagination(req);
  const classId = req.query.classId ? String(req.query.classId) : undefined;

  const where = {
    schoolId,
    role: 'student' as const,
    ...(classId ? { studentProfile: { classId } } : {}),
  };

  const [students, total] = await Promise.all([
    prisma.user.findMany({
      where,
      include: { studentProfile: { include: { class: true } } },
      skip: (page - 1) * limit,
      take: limit,
      orderBy: { createdAt: 'desc' },
    }),
    prisma.user.count({ where }),
  ]);

  send(res, 200, {
    students: students.map(stripPassword),
    page,
    limit,
    total,
    totalPages: Math.ceil(total / limit),
  });
}

const createStudentSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  password: z.string().min(8),
  classId: z.string().min(1),
  rollNo: z.string().min(1),
  dob: z.string().optional(),
  phone: z.string().optional(),
  address: z.string().optional(),
  // Optional — when given, either links to an existing parent account with
  // this email (so siblings share one parent login) or auto-creates a new
  // one. Omit both to leave the student unlinked; admin can link a parent
  // later from the student's edit screen.
  parentName: z.string().min(1).optional(),
  parentEmail: z.string().email().optional(),
  // Optional — lets the admin UI's auto-generated password (Parent@{rollNo}
  // or Parent@{4 random digits}) actually be the credential that gets set,
  // instead of always falling back to a random one the admin never sees.
  parentPassword: z.string().min(8).optional(),
});

export async function createStudent(req: AuthRequest, res: Response): Promise<void> {
  const schoolId = requireSchoolId(req, res);
  if (!schoolId) return;

  const parsed = createStudentSchema.safeParse(req.body);
  if (!parsed.success) {
    send(res, 400, undefined, 'Invalid student data');
    return;
  }
  const { name, email, password, classId, rollNo, dob, phone, address, parentName, parentEmail, parentPassword } =
    parsed.data;

  const targetClass = await prisma.class.findFirst({
    where: { id: classId, schoolId },
    include: { _count: { select: { studentProfiles: true } } },
  });
  if (!targetClass) {
    send(res, 400, undefined, 'Class not found in this school');
    return;
  }
  if (targetClass._count.studentProfiles >= targetClass.maxStudents) {
    send(res, 400, undefined, `Section is full. Maximum ${targetClass.maxStudents} students allowed.`);
    return;
  }

  const hashedPassword = await bcrypt.hash(password, 12);

  // Resolve the parent link before creating the student, so a bad parent
  // email fails the whole request cleanly instead of leaving a half-linked
  // student behind.
  let parentId: string | undefined;
  let newParentPlaintextPassword: string | undefined;
  let newParentEmail: string | undefined;
  let newParentName: string | undefined;

  if (parentEmail) {
    const existingParent = await prisma.user.findUnique({ where: { email: parentEmail } });
    if (existingParent) {
      if (existingParent.role !== 'parent' || existingParent.schoolId !== schoolId) {
        send(res, 400, undefined, 'That email belongs to an account that is not a parent at this school');
        return;
      }
      parentId = existingParent.id;
    } else {
      // Auto-create the parent account. Uses parentName if given, else a
      // sensible default derived from the student's name; uses the admin
      // UI's auto-generated parentPassword if given, else a random one.
      newParentPlaintextPassword = parentPassword ?? crypto.randomBytes(6).toString('hex');
      newParentEmail = parentEmail;
      newParentName = parentName?.trim() || `${name}'s Parent`;
    }
  }

  try {
    const user = await prisma.$transaction(async (tx) => {
      if (!parentId && newParentEmail) {
        const parentUser = await tx.user.create({
          data: {
            name: newParentName!,
            email: newParentEmail,
            password: await bcrypt.hash(newParentPlaintextPassword!, 12),
            role: 'parent',
            schoolId,
          },
        });
        parentId = parentUser.id;
      }

      return tx.user.create({
        data: {
          name,
          email,
          password: hashedPassword,
          role: 'student',
          schoolId,
          studentProfile: {
            create: {
              classId,
              rollNo,
              dob: dob ? new Date(dob) : undefined,
              phone,
              address,
              parentId,
            },
          },
        },
        include: { studentProfile: true },
      });
    });

    await auditLog({
      userId: req.user!.userId,
      action: 'STUDENT_CREATE',
      targetTable: 'User',
      targetId: user.id,
      meta: { email, classId, rollNo, parentId: parentId ?? null, parentAutoCreated: Boolean(newParentEmail) },
      ip: req.ip,
    });

    const school = await prisma.school.findUnique({ where: { id: schoolId }, select: { name: true } });

    try {
      await sendWelcomeEmail({
        name,
        email,
        role: 'student',
        schoolName: school?.name ?? 'your school',
        password,
      });
    } catch (err) {
      console.warn('[createStudent] Welcome email failed:', err);
    }

    if (newParentEmail && newParentPlaintextPassword) {
      try {
        await sendWelcomeEmail({
          name: newParentName!,
          email: newParentEmail,
          role: 'parent',
          schoolName: school?.name ?? 'your school',
          password: newParentPlaintextPassword,
        });
      } catch (err) {
        console.warn('[createStudent] Parent welcome email failed:', err);
      }
    }

    send(res, 201, {
      ...stripPassword(user),
      parentAutoCreated: Boolean(newParentEmail),
      parentEmail: newParentEmail ?? undefined,
    });
  } catch (err) {
    if (isUniqueConstraintError(err)) {
      send(res, 400, undefined, 'Email already in use');
      return;
    }
    throw err;
  }
}

const updateStudentSchema = z.object({
  name: z.string().min(1).optional(),
  email: z.string().email().optional(),
  classId: z.string().min(1).optional(),
  rollNo: z.string().min(1).optional(),
  dob: z.string().optional(),
  phone: z.string().optional(),
  address: z.string().optional(),
});

export async function updateStudent(req: AuthRequest, res: Response): Promise<void> {
  const schoolId = requireSchoolId(req, res);
  if (!schoolId) return;

  const parsed = updateStudentSchema.safeParse(req.body);
  if (!parsed.success) {
    send(res, 400, undefined, 'Invalid student data');
    return;
  }

  const { id } = req.params;
  const existing = await prisma.user.findFirst({
    where: { id, schoolId, role: 'student' },
    include: { studentProfile: true },
  });
  if (!existing) {
    send(res, 404, undefined, 'Student not found');
    return;
  }

  const { name, email, classId, rollNo, dob, phone, address } = parsed.data;

  if (classId && classId !== existing.studentProfile?.classId) {
    const targetClass = await prisma.class.findFirst({
      where: { id: classId, schoolId },
      include: { _count: { select: { studentProfiles: true } } },
    });
    if (!targetClass) {
      send(res, 400, undefined, 'Class not found in this school');
      return;
    }
    if (targetClass._count.studentProfiles >= targetClass.maxStudents) {
      send(res, 400, undefined, `Section is full. Maximum ${targetClass.maxStudents} students allowed.`);
      return;
    }
  }

  // A StudentProfile normally always exists (created together with the user),
  // but upsert defensively in case it's ever missing. The "create" branch
  // still needs classId/rollNo, so fall back to the existing profile's
  // values when this PATCH didn't include them.
  const resolvedClassId = classId ?? existing.studentProfile?.classId;
  const resolvedRollNo = rollNo ?? existing.studentProfile?.rollNo;
  if (!resolvedClassId || !resolvedRollNo) {
    send(res, 400, undefined, 'classId and rollNo are required');
    return;
  }

  try {
    const user = await prisma.user.update({ where: { id }, data: { name, email } });

    const studentProfile = await prisma.studentProfile.upsert({
      where: { userId: id },
      update: { classId, rollNo, dob: dob ? new Date(dob) : undefined, phone, address },
      create: {
        userId: id,
        classId: resolvedClassId,
        rollNo: resolvedRollNo,
        dob: dob ? new Date(dob) : undefined,
        phone,
        address,
      },
    });

    await auditLog({
      userId: req.user!.userId,
      action: 'STUDENT_UPDATE',
      targetTable: 'User',
      targetId: id,
      meta: parsed.data,
      ip: req.ip,
    });

    send(res, 200, { ...stripPassword(user), studentProfile });
  } catch (err) {
    if (isUniqueConstraintError(err)) {
      send(res, 400, undefined, 'Email already in use');
      return;
    }
    throw err;
  }
}

export async function deleteStudent(req: AuthRequest, res: Response): Promise<void> {
  const schoolId = requireSchoolId(req, res);
  if (!schoolId) return;

  const { id } = req.params;
  const existing = await prisma.user.findFirst({ where: { id, schoolId, role: 'student' } });
  if (!existing) {
    send(res, 404, undefined, 'Student not found');
    return;
  }

  await prisma.user.update({ where: { id }, data: { isActive: false } });

  await auditLog({
    userId: req.user!.userId,
    action: 'STUDENT_DELETE',
    targetTable: 'User',
    targetId: id,
    ip: req.ip,
  });

  send(res, 200, { message: 'Student deactivated' });
}

const bulkImportSchema = z.object({
  csv: z.string().min(1),
});

/** Simple comma-split CSV parser — no quoted-field support (fine for demo-scale imports). */
function parseCsv(csv: string): Record<string, string>[] {
  const lines = csv.trim().split(/\r?\n/).filter((line) => line.trim().length > 0);
  if (lines.length < 2) return [];

  const headers = lines[0].split(',').map((h) => h.trim());
  return lines.slice(1).map((line) => {
    const values = line.split(',').map((v) => v.trim());
    const row: Record<string, string> = {};
    headers.forEach((h, i) => {
      row[h] = values[i] ?? '';
    });
    return row;
  });
}

export async function bulkImportStudents(req: AuthRequest, res: Response): Promise<void> {
  const schoolId = requireSchoolId(req, res);
  if (!schoolId) return;

  const parsed = bulkImportSchema.safeParse(req.body);
  if (!parsed.success) {
    send(res, 400, undefined, 'Expected a "csv" text field');
    return;
  }

  const rows = parseCsv(parsed.data.csv);
  if (rows.length === 0) {
    send(res, 400, undefined, 'CSV has no data rows');
    return;
  }

  const schoolClasses = await prisma.class.findMany({
    where: { schoolId },
    select: { id: true, maxStudents: true, _count: { select: { studentProfiles: true } } },
  });
  const classCapacity = new Map(
    schoolClasses.map((c) => [c.id, { max: c.maxStudents, filled: c._count.studentProfiles }])
  );

  const created: string[] = [];
  const errors: { row: number; email: string; error: string }[] = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const { name, email, password, classId, rollNo, dob, phone, address } = row;

    if (!name || !email || !password || !classId || !rollNo) {
      errors.push({ row: i + 2, email: email ?? '', error: 'Missing required field' });
      continue;
    }
    const capacity = classCapacity.get(classId);
    if (!capacity) {
      errors.push({ row: i + 2, email, error: 'classId not found in this school' });
      continue;
    }
    if (capacity.filled >= capacity.max) {
      errors.push({ row: i + 2, email, error: `Section full (max ${capacity.max} students)` });
      continue;
    }

    try {
      const hashedPassword = await bcrypt.hash(password, 12);
      const user = await prisma.user.create({
        data: {
          name,
          email,
          password: hashedPassword,
          role: 'student',
          schoolId,
          studentProfile: {
            create: {
              classId,
              rollNo,
              dob: dob ? new Date(dob) : undefined,
              phone: phone || undefined,
              address: address || undefined,
            },
          },
        },
      });
      created.push(user.id);
      capacity.filled += 1;
    } catch (err) {
      errors.push({
        row: i + 2,
        email,
        error: isUniqueConstraintError(err) ? 'Email already in use' : 'Failed to create',
      });
    }
  }

  await auditLog({
    userId: req.user!.userId,
    action: 'STUDENT_BULK_IMPORT',
    targetTable: 'User',
    meta: { createdCount: created.length, errorCount: errors.length },
    ip: req.ip,
  });

  send(res, 201, { createdCount: created.length, errors });
}

/** Turns "Ahmed Khan" into { first: "ahmed", last: "khan", slug: "ahmed.khan" }. */
function splitNameForEmail(name: string): { first: string; last: string; slug: string } {
  const clean = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z\s]/g, '')
    .split(/\s+/)
    .filter(Boolean);
  const first = clean[0] ?? 'student';
  const last = clean.length > 1 ? clean[clean.length - 1] : '';
  const slug = last ? `${first}.${last}` : first;
  return { first, last, slug };
}

/** Extracts the trailing numeric portion of a roll number ("JR-007" -> 7). */
function trailingRollNumber(rollNo: string): number {
  const match = rollNo.match(/(\d+)$/);
  return match ? parseInt(match[1], 10) : 0;
}

function padRollNo(n: number): string {
  return String(n).padStart(3, '0');
}

const bulkImportNamesSchema = z.object({
  classId: z.string().min(1),
  names: z.array(z.string().min(1)).min(1).max(200),
  schoolDomain: z.string().min(2).max(40).optional(),
  createParents: z.boolean().optional(),
});

// POST /api/admin/students/bulk-import-names — the redesigned bulk import:
// a plain newline-separated list of names per section instead of a CSV.
// Sorts alphabetically, continues roll numbers from the class's current max,
// and auto-generates email/password (and optionally a parent account) for
// each student.
export async function bulkImportStudentsByName(req: AuthRequest, res: Response): Promise<void> {
  const schoolId = requireSchoolId(req, res);
  if (!schoolId) return;

  const parsed = bulkImportNamesSchema.safeParse(req.body);
  if (!parsed.success) {
    send(res, 400, undefined, 'Invalid bulk import data');
    return;
  }
  const { classId, names, createParents } = parsed.data;

  const targetClass = await prisma.class.findFirst({
    where: { id: classId, schoolId },
    include: {
      _count: { select: { studentProfiles: true } },
      studentProfiles: { select: { rollNo: true } },
    },
  });
  if (!targetClass) {
    send(res, 400, undefined, 'Class not found in this school');
    return;
  }

  const [school, settings] = await Promise.all([
    prisma.school.findUnique({ where: { id: schoolId }, select: { name: true, featureParentPortal: true } }),
    prisma.schoolSettings.findUnique({ where: { schoolId }, select: { schoolDomain: true } }),
  ]);
  const schoolDomain = parsed.data.schoolDomain ?? settings?.schoolDomain ?? 'school';
  const shouldCreateParents = Boolean(createParents && school?.featureParentPortal);

  // Sort alphabetically, then compute how many can actually fit.
  const sortedNames = [...names].map((n) => n.trim()).filter(Boolean).sort((a, b) => a.localeCompare(b));

  const remainingCapacity = targetClass.maxStudents - targetClass._count.studentProfiles;
  if (sortedNames.length > remainingCapacity) {
    send(
      res,
      400,
      undefined,
      `Only ${remainingCapacity} more student(s) can be added to this section (max ${targetClass.maxStudents}).`
    );
    return;
  }

  let nextRollNo = Math.max(0, ...targetClass.studentProfiles.map((p) => trailingRollNumber(p.rollNo))) + 1;

  const created: { name: string; email: string; password: string; rollNo: string }[] = [];
  const parents: { name: string; email: string; password: string; forStudent: string }[] = [];
  const failed: { name: string; error: string }[] = [];

  for (const name of sortedNames) {
    const rollNo = padRollNo(nextRollNo);
    const { first, slug } = splitNameForEmail(name);

    let email = `${slug}@${schoolDomain}.edu`;
    if (await prisma.user.findUnique({ where: { email } })) {
      email = `student${rollNo}@${schoolDomain}.edu`;
    }
    const password = `Student@${rollNo}`;

    try {
      const hashedPassword = await bcrypt.hash(password, 12);

      let parentId: string | undefined;
      let parentEmail: string | undefined;
      let parentPassword: string | undefined;

      const studentUser = await prisma.$transaction(async (tx) => {
        if (shouldCreateParents) {
          parentEmail = `parent.${first}@${schoolDomain}.edu`;
          if (await tx.user.findUnique({ where: { email: parentEmail } })) {
            parentEmail = `parent.${first}${rollNo}@${schoolDomain}.edu`;
          }
          parentPassword = `Parent@${rollNo}`;
          const parentUser = await tx.user.create({
            data: {
              name: `${name}'s Parent`,
              email: parentEmail,
              password: await bcrypt.hash(parentPassword, 12),
              role: 'parent',
              schoolId,
              parentProfile: { create: {} },
            },
            include: { parentProfile: true },
          });
          parentId = parentUser.parentProfile!.id;
        }

        return tx.user.create({
          data: {
            name,
            email,
            password: hashedPassword,
            role: 'student',
            schoolId,
            studentProfile: { create: { classId, rollNo, parentId } },
          },
        });
      });

      created.push({ name, email, password, rollNo });
      if (shouldCreateParents && parentEmail && parentPassword) {
        parents.push({ name: `${name}'s Parent`, email: parentEmail, password: parentPassword, forStudent: name });
      }
      nextRollNo += 1;

      try {
        await sendWelcomeEmail({
          name,
          email,
          role: 'student',
          schoolName: school?.name ?? 'your school',
          password,
        });
        if (shouldCreateParents && parentEmail && parentPassword) {
          await sendWelcomeEmail({
            name: `${name}'s Parent`,
            email: parentEmail,
            role: 'parent',
            schoolName: school?.name ?? 'your school',
            password: parentPassword,
          });
        }
      } catch (err) {
        console.warn('[bulkImportStudentsByName] Welcome email failed:', err);
      }

      void studentUser;
    } catch (err) {
      failed.push({ name, error: isUniqueConstraintError(err) ? 'Email already in use' : 'Failed to create' });
    }
  }

  await auditLog({
    userId: req.user!.userId,
    action: 'STUDENT_BULK_IMPORT_NAMES',
    targetTable: 'Class',
    targetId: classId,
    meta: { createdCount: created.length, parentCount: parents.length, failedCount: failed.length },
    ip: req.ip,
  });

  send(res, 201, { created, parents, failed });
}

// =================================================================
// 3. Teacher Management
// =================================================================

export async function getTeachers(req: AuthRequest, res: Response): Promise<void> {
  const schoolId = requireSchoolId(req, res);
  if (!schoolId) return;

  const teachers = await prisma.user.findMany({
    // Coordinators are teachers with an elevated role — keep them visible
    // here too, so admin can still manage/demote them.
    where: { schoolId, role: { in: ['teacher', 'coordinator'] } },
    include: {
      // isActive:true only — a soft-deleted subject shouldn't still count
      // toward "how many subjects does this teacher currently have".
      teachingSubjects: { where: { isActive: true }, select: { id: true, name: true, classId: true } },
      teacherProfile: true,
      subjectPool: { orderBy: { createdAt: 'asc' } },
    },
    orderBy: { createdAt: 'desc' },
    take: 100,
  });

  send(res, 200, { teachers: teachers.map(stripPassword) });
}

const createTeacherSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  password: z.string().min(8),
  wing: z.enum(['junior', 'senior', 'both']),
  subjectIds: z.array(z.string()).optional(),
});

export async function createTeacher(req: AuthRequest, res: Response): Promise<void> {
  const schoolId = requireSchoolId(req, res);
  if (!schoolId) return;

  const parsed = createTeacherSchema.safeParse(req.body);
  if (!parsed.success) {
    send(res, 400, undefined, 'Invalid teacher data');
    return;
  }
  const { name, email, password, wing, subjectIds } = parsed.data;

  const hashedPassword = await bcrypt.hash(password, 12);

  try {
    const user = await prisma.user.create({
      data: {
        name,
        email,
        password: hashedPassword,
        role: 'teacher',
        schoolId,
        teacherProfile: { create: { wing } },
      },
      include: { teacherProfile: true },
    });

    if (subjectIds && subjectIds.length > 0) {
      await prisma.subject.updateMany({
        where: { id: { in: subjectIds }, class: { schoolId } },
        data: { teacherId: user.id },
      });
    }

    await auditLog({
      userId: req.user!.userId,
      action: 'TEACHER_CREATE',
      targetTable: 'User',
      targetId: user.id,
      meta: { email, wing, subjectIds },
      ip: req.ip,
    });

    try {
      const school = await prisma.school.findUnique({ where: { id: schoolId }, select: { name: true } });
      await sendWelcomeEmail({
        name,
        email,
        role: 'teacher',
        schoolName: school?.name ?? 'your school',
        password,
      });
    } catch (err) {
      console.warn('[createTeacher] Welcome email failed:', err);
    }

    send(res, 201, stripPassword(user));
  } catch (err) {
    if (isUniqueConstraintError(err)) {
      send(res, 400, undefined, 'Email already in use');
      return;
    }
    throw err;
  }
}

const updateTeacherSchema = z.object({
  name: z.string().min(1).optional(),
  email: z.string().email().optional(),
  subjectIds: z.array(z.string()).optional(),
});

export async function updateTeacher(req: AuthRequest, res: Response): Promise<void> {
  const schoolId = requireSchoolId(req, res);
  if (!schoolId) return;

  const parsed = updateTeacherSchema.safeParse(req.body);
  if (!parsed.success) {
    send(res, 400, undefined, 'Invalid teacher data');
    return;
  }

  const { id } = req.params;
  const existing = await prisma.user.findFirst({ where: { id, schoolId, role: 'teacher' } });
  if (!existing) {
    send(res, 404, undefined, 'Teacher not found');
    return;
  }

  const { name, email, subjectIds } = parsed.data;

  try {
    const user = await prisma.user.update({
      where: { id },
      data: { name, email },
    });

    // Note: this only assigns the given subjects to this teacher — it does not
    // unassign subjects previously held, since Subject.teacherId is required
    // (a subject can't be left teacherless).
    if (subjectIds && subjectIds.length > 0) {
      await prisma.subject.updateMany({
        where: { id: { in: subjectIds }, class: { schoolId } },
        data: { teacherId: id },
      });
    }

    await auditLog({
      userId: req.user!.userId,
      action: 'TEACHER_UPDATE',
      targetTable: 'User',
      targetId: id,
      meta: { name, email, subjectIds },
      ip: req.ip,
    });

    send(res, 200, stripPassword(user));
  } catch (err) {
    if (isUniqueConstraintError(err)) {
      send(res, 400, undefined, 'Email already in use');
      return;
    }
    throw err;
  }
}

export async function deleteTeacher(req: AuthRequest, res: Response): Promise<void> {
  const schoolId = requireSchoolId(req, res);
  if (!schoolId) return;

  const { id } = req.params;
  const existing = await prisma.user.findFirst({ where: { id, schoolId, role: 'teacher' } });
  if (!existing) {
    send(res, 404, undefined, 'Teacher not found');
    return;
  }

  await prisma.user.update({ where: { id }, data: { isActive: false } });

  await auditLog({
    userId: req.user!.userId,
    action: 'TEACHER_DELETE',
    targetTable: 'User',
    targetId: id,
    ip: req.ip,
  });

  send(res, 200, { message: 'Teacher deactivated' });
}

// =================================================================
// 3b. Teacher Subject Pool — subjects a teacher is ELIGIBLE to teach.
// Distinct from Subject, which is an actual class+subject+teacher
// assignment; admin picks from this pool when assigning subjects to a class.
// =================================================================

const MAX_SUBJECT_POOL_SIZE = 3;

export async function getTeacherSubjectPool(req: AuthRequest, res: Response): Promise<void> {
  const schoolId = requireSchoolId(req, res);
  if (!schoolId) return;

  const { id } = req.params;
  const teacher = await prisma.user.findFirst({
    where: { id, schoolId, role: { in: ['teacher', 'coordinator'] } },
  });
  if (!teacher) {
    send(res, 404, undefined, 'Teacher not found');
    return;
  }

  const subjects = await prisma.teacherSubject.findMany({
    where: { teacherId: id, schoolId },
    orderBy: { createdAt: 'asc' },
  });

  send(res, 200, { subjects });
}

const addTeacherSubjectSchema = z.object({
  subjectName: z.string().min(1).max(60),
});

export async function addTeacherSubjectPool(req: AuthRequest, res: Response): Promise<void> {
  const schoolId = requireSchoolId(req, res);
  if (!schoolId) return;

  const parsed = addTeacherSubjectSchema.safeParse(req.body);
  if (!parsed.success) {
    send(res, 400, undefined, 'Invalid subject name');
    return;
  }
  const { subjectName } = parsed.data;

  const { id } = req.params;
  const teacher = await prisma.user.findFirst({
    where: { id, schoolId, role: { in: ['teacher', 'coordinator'] } },
  });
  if (!teacher) {
    send(res, 404, undefined, 'Teacher not found');
    return;
  }

  const currentCount = await prisma.teacherSubject.count({ where: { teacherId: id, schoolId } });
  if (currentCount >= MAX_SUBJECT_POOL_SIZE) {
    send(res, 400, undefined, `A teacher can have at most ${MAX_SUBJECT_POOL_SIZE} subjects in their pool.`);
    return;
  }

  try {
    const created = await prisma.teacherSubject.create({
      data: { teacherId: id, schoolId, subjectName: subjectName.trim() },
    });

    await auditLog({
      userId: req.user!.userId,
      action: 'TEACHER_SUBJECT_ADDED',
      targetTable: 'TeacherSubject',
      targetId: created.id,
      meta: { teacherId: id, subjectName: created.subjectName },
      ip: req.ip,
    });

    send(res, 201, created);
  } catch (err) {
    if (isUniqueConstraintError(err)) {
      send(res, 400, undefined, 'This subject is already in the teacher\'s pool');
      return;
    }
    throw err;
  }
}

export async function removeTeacherSubjectPool(req: AuthRequest, res: Response): Promise<void> {
  const schoolId = requireSchoolId(req, res);
  if (!schoolId) return;

  const { id, subjectId } = req.params;
  const existing = await prisma.teacherSubject.findFirst({
    where: { id: subjectId, teacherId: id, schoolId },
  });
  if (!existing) {
    send(res, 404, undefined, 'Subject not found in this teacher\'s pool');
    return;
  }

  await prisma.teacherSubject.delete({ where: { id: subjectId } });

  await auditLog({
    userId: req.user!.userId,
    action: 'TEACHER_SUBJECT_REMOVED',
    targetTable: 'TeacherSubject',
    targetId: subjectId,
    meta: { teacherId: id, subjectName: existing.subjectName },
    ip: req.ip,
  });

  send(res, 200, { message: 'Subject removed from teacher pool' });
}

// GET /api/admin/subjects/availability — per-subject-name teacher counts and
// per-teacher current class-teaching load, grouped for the admin's
// "Subject Availability" panel.
export async function getSubjectAvailability(req: AuthRequest, res: Response): Promise<void> {
  const schoolId = requireSchoolId(req, res);
  if (!schoolId) return;

  const pool = await prisma.teacherSubject.findMany({
    where: { schoolId },
    include: {
      teacher: {
        select: {
          id: true,
          name: true,
          teacherProfile: { select: { wing: true } },
          teachingSubjects: { where: { isActive: true }, select: { id: true } },
        },
      },
    },
    orderBy: { subjectName: 'asc' },
  });

  const bySubject = new Map<
    string,
    { subjectName: string; teachers: { id: string; name: string; wing: string | null; currentClassCount: number }[] }
  >();

  for (const entry of pool) {
    if (!bySubject.has(entry.subjectName)) {
      bySubject.set(entry.subjectName, { subjectName: entry.subjectName, teachers: [] });
    }
    bySubject.get(entry.subjectName)!.teachers.push({
      id: entry.teacher.id,
      name: entry.teacher.name,
      wing: entry.teacher.teacherProfile?.wing ?? null,
      currentClassCount: entry.teacher.teachingSubjects.length,
    });
  }

  const availability = [...bySubject.values()].map((s) => ({
    subjectName: s.subjectName,
    totalTeachers: s.teachers.length,
    teachers: s.teachers,
  }));

  send(res, 200, { availability });
}

// GET /api/admin/subjects/teachers?subjectName=&wing= — pool-matching
// teachers for a given subject name, optionally filtered by wing. Used by
// the "Add Section" wizard's Step 2 teacher dropdown (Fix 4).
export async function getSubjectPoolTeachers(req: AuthRequest, res: Response): Promise<void> {
  const schoolId = requireSchoolId(req, res);
  if (!schoolId) return;

  const subjectName = req.query.subjectName ? String(req.query.subjectName).trim() : '';
  const wing = req.query.wing ? String(req.query.wing) : undefined;
  if (!subjectName) {
    send(res, 400, undefined, 'subjectName is required');
    return;
  }

  const pool = await prisma.teacherSubject.findMany({
    where: {
      schoolId,
      subjectName,
      teacher: {
        isActive: true,
        ...(wing ? { teacherProfile: { wing: { in: [wing, 'both'] as ('junior' | 'senior' | 'both')[] } } } : {}),
      },
    },
    include: {
      teacher: {
        select: {
          id: true,
          name: true,
          teacherProfile: { select: { wing: true } },
          teachingSubjects: { where: { isActive: true }, select: { id: true } },
        },
      },
    },
  });

  const teachers = pool.map((entry) => ({
    id: entry.teacher.id,
    name: entry.teacher.name,
    wing: entry.teacher.teacherProfile?.wing ?? null,
    currentSubjectCount: entry.teacher.teachingSubjects.length,
  }));

  send(res, 200, { teachers });
}

// =================================================================
// 4. Class Management
// =================================================================

/** Class 1-5 is the junior wing, 6-10 is the senior wing. */
function wingForClassNumber(classNumber: number): 'junior' | 'senior' {
  return classNumber <= 5 ? 'junior' : 'senior';
}

export async function getClasses(req: AuthRequest, res: Response): Promise<void> {
  const schoolId = requireSchoolId(req, res);
  if (!schoolId) return;

  const classes = await prisma.class.findMany({
    where: { schoolId },
    include: { _count: { select: { studentProfiles: true, subjects: true } } },
    orderBy: [{ number: 'asc' }, { section: 'asc' }],
  });

  send(res, 200, { classes });
}

const createClassSchema = z.object({
  number: z.number().int().min(1).max(10),
  section: z.string().min(1),
  classTeacherId: z.string().optional(),
});

export async function createClass(req: AuthRequest, res: Response): Promise<void> {
  const schoolId = requireSchoolId(req, res);
  if (!schoolId) return;

  const parsed = createClassSchema.safeParse(req.body);
  if (!parsed.success) {
    send(res, 400, undefined, 'Invalid class data');
    return;
  }
  const { number, section, classTeacherId } = parsed.data;
  const wing = wingForClassNumber(number);

  const newClass = await prisma.class.create({
    data: { number, section, wing, classTeacherId, schoolId },
  });

  await auditLog({
    userId: req.user!.userId,
    action: 'CLASS_CREATE',
    targetTable: 'Class',
    targetId: newClass.id,
    meta: { number, section, wing, classTeacherId },
    ip: req.ip,
  });

  send(res, 201, newClass);
}

const createClassWithSubjectsSchema = z.object({
  number: z.number().int().min(1).max(10),
  section: z.string().min(1),
  classTeacherId: z.string().optional(),
  maxStudents: z.number().int().min(1).max(60).optional(),
  subjects: z
    .array(
      z.object({
        name: z.string().min(1),
        teacherId: z.string().min(1),
        creditHours: z.number().int().min(1).max(10),
      })
    )
    .optional(),
});

// POST /api/admin/classes/section — the 3-step "Add Section" wizard's final
// step: creates the class and every listed subject in one transaction, so a
// failure partway through never leaves a section with only some subjects.
export async function createClassWithSubjects(req: AuthRequest, res: Response): Promise<void> {
  const schoolId = requireSchoolId(req, res);
  if (!schoolId) return;

  const parsed = createClassWithSubjectsSchema.safeParse(req.body);
  if (!parsed.success) {
    send(res, 400, undefined, 'Invalid class data');
    return;
  }
  const { number, section, classTeacherId, maxStudents, subjects } = parsed.data;
  const wing = wingForClassNumber(number);

  if (classTeacherId) {
    const teacher = await prisma.user.findFirst({
      where: { id: classTeacherId, schoolId, role: { in: ['teacher', 'coordinator'] } },
    });
    if (!teacher) {
      send(res, 400, undefined, 'Class teacher not found in this school');
      return;
    }
  }
  if (subjects && subjects.length > 0) {
    const teacherIds = [...new Set(subjects.map((s) => s.teacherId))];
    const validTeachers = await prisma.user.findMany({
      where: { id: { in: teacherIds }, schoolId, role: { in: ['teacher', 'coordinator'] } },
      select: { id: true, name: true },
    });
    if (validTeachers.length !== teacherIds.length) {
      send(res, 400, undefined, 'One or more subject teachers were not found in this school');
      return;
    }

    // Each teacher's new load (subjects already assigned + how many times
    // they appear in this same batch) must not exceed the per-teacher cap.
    const teacherById = new Map(validTeachers.map((t) => [t.id, t.name]));
    for (const teacherId of teacherIds) {
      const countInThisBatch = subjects.filter((s) => s.teacherId === teacherId).length;
      const existingCount = await countTeacherSubjects(schoolId, teacherId);
      if (existingCount + countInThisBatch > MAX_SUBJECTS_PER_TEACHER) {
        send(
          res,
          400,
          undefined,
          `${teacherById.get(teacherId) ?? 'This teacher'} cannot be assigned more than ${MAX_SUBJECTS_PER_TEACHER} subjects (currently has ${existingCount}).`
        );
        return;
      }
    }
  }

  let newClass;
  try {
    newClass = await prisma.$transaction(async (tx) => {
      const created = await tx.class.create({
        data: {
          number,
          section,
          wing,
          classTeacherId,
          maxStudents: maxStudents ?? 30,
          schoolId,
        },
      });

      if (subjects && subjects.length > 0) {
        await tx.subject.createMany({
          data: subjects.map((s) => ({
            name: s.name,
            teacherId: s.teacherId,
            creditHours: s.creditHours,
            classId: created.id,
          })),
        });
      }

      return created;
    });
  } catch (err) {
    if (isUniqueConstraintError(err)) {
      send(res, 400, undefined, 'A section with this class number and letter already exists');
      return;
    }
    throw err;
  }

  await auditLog({
    userId: req.user!.userId,
    action: 'CREATE_CLASS_WITH_SUBJECTS',
    targetTable: 'Class',
    targetId: newClass.id,
    meta: { number, section, wing, classTeacherId, subjectCount: subjects?.length ?? 0 },
    ip: req.ip,
  });

  const withSubjects = await prisma.class.findUnique({
    where: { id: newClass.id },
    include: { subjects: true, _count: { select: { studentProfiles: true, subjects: true } } },
  });

  send(res, 201, withSubjects);
}

const updateClassSchema = z.object({
  number: z.number().int().min(1).max(10).optional(),
  section: z.string().min(1).optional(),
  classTeacherId: z.string().nullable().optional(),
  maxStudents: z.number().int().min(1).max(60).optional(),
});

export async function updateClass(req: AuthRequest, res: Response): Promise<void> {
  const schoolId = requireSchoolId(req, res);
  if (!schoolId) return;

  const parsed = updateClassSchema.safeParse(req.body);
  if (!parsed.success) {
    send(res, 400, undefined, 'Invalid class data');
    return;
  }

  const { id } = req.params;
  const existing = await prisma.class.findFirst({
    where: { id, schoolId },
    include: { _count: { select: { studentProfiles: true } } },
  });
  if (!existing) {
    send(res, 404, undefined, 'Class not found');
    return;
  }

  const { number, section, classTeacherId, maxStudents } = parsed.data;

  if (maxStudents !== undefined && maxStudents < existing._count.studentProfiles) {
    send(
      res,
      400,
      undefined,
      `Cannot set max students below the current enrollment (${existing._count.studentProfiles} students).`
    );
    return;
  }

  const wing = number !== undefined ? wingForClassNumber(number) : undefined;

  const updated = await prisma.class.update({
    where: { id },
    data: { number, section, wing, classTeacherId, maxStudents },
  });

  await auditLog({
    userId: req.user!.userId,
    action: 'CLASS_UPDATE',
    targetTable: 'Class',
    targetId: id,
    meta: parsed.data,
    ip: req.ip,
  });

  send(res, 200, updated);
}

export async function deleteClass(req: AuthRequest, res: Response): Promise<void> {
  const schoolId = requireSchoolId(req, res);
  if (!schoolId) return;

  const { id } = req.params;
  const existing = await prisma.class.findFirst({ where: { id, schoolId } });
  if (!existing) {
    send(res, 404, undefined, 'Class not found');
    return;
  }

  // Soft delete, per the project-wide convention (isActive=false, never hard delete).
  await prisma.class.update({ where: { id }, data: { isActive: false } });

  await auditLog({
    userId: req.user!.userId,
    action: 'CLASS_DELETE',
    targetTable: 'Class',
    targetId: id,
    ip: req.ip,
  });

  send(res, 200, { message: 'Class deleted' });
}

// =================================================================
// 5. Subject Management
// =================================================================

export async function getSubjects(req: AuthRequest, res: Response): Promise<void> {
  const schoolId = requireSchoolId(req, res);
  if (!schoolId) return;

  const classId = req.query.classId ? String(req.query.classId) : undefined;

  const subjects = await prisma.subject.findMany({
    where: { class: { schoolId }, ...(classId ? { classId } : {}) },
    include: {
      class: { select: { id: true, number: true, section: true, wing: true } },
      teacher: { select: { id: true, name: true, email: true } },
    },
    orderBy: { name: 'asc' },
  });

  send(res, 200, { subjects });
}

const createSubjectSchema = z.object({
  name: z.string().min(1),
  classId: z.string().min(1),
  teacherId: z.string().min(1),
  creditHours: z.number().int().positive(),
});

export async function createSubject(req: AuthRequest, res: Response): Promise<void> {
  const schoolId = requireSchoolId(req, res);
  if (!schoolId) return;

  const parsed = createSubjectSchema.safeParse(req.body);
  if (!parsed.success) {
    send(res, 400, undefined, 'Invalid subject data');
    return;
  }
  const { name, classId, teacherId, creditHours } = parsed.data;

  const [targetClass, targetTeacher] = await Promise.all([
    prisma.class.findFirst({ where: { id: classId, schoolId } }),
    prisma.user.findFirst({ where: { id: teacherId, schoolId, role: { in: ['teacher', 'coordinator'] } } }),
  ]);
  if (!targetClass) {
    send(res, 400, undefined, 'Class not found in this school');
    return;
  }
  if (!targetTeacher) {
    send(res, 400, undefined, 'Teacher not found in this school');
    return;
  }

  const existingSubjects = await countTeacherSubjects(schoolId, teacherId);
  if (existingSubjects >= MAX_SUBJECTS_PER_TEACHER) {
    send(res, 400, undefined, `Teacher cannot be assigned more than ${MAX_SUBJECTS_PER_TEACHER} subjects.`);
    return;
  }

  const subject = await prisma.subject.create({
    data: { name, classId, teacherId, creditHours },
  });

  await auditLog({
    userId: req.user!.userId,
    action: 'SUBJECT_CREATE',
    targetTable: 'Subject',
    targetId: subject.id,
    meta: { name, classId, teacherId },
    ip: req.ip,
  });

  send(res, 201, subject);
}

const updateSubjectSchema = z.object({
  name: z.string().min(1).optional(),
  classId: z.string().min(1).optional(),
  teacherId: z.string().min(1).optional(),
  creditHours: z.number().int().positive().optional(),
});

export async function updateSubject(req: AuthRequest, res: Response): Promise<void> {
  const schoolId = requireSchoolId(req, res);
  if (!schoolId) return;

  const parsed = updateSubjectSchema.safeParse(req.body);
  if (!parsed.success) {
    send(res, 400, undefined, 'Invalid subject data');
    return;
  }

  const { id } = req.params;
  const existing = await prisma.subject.findFirst({ where: { id, class: { schoolId } } });
  if (!existing) {
    send(res, 404, undefined, 'Subject not found');
    return;
  }

  const { name, classId, teacherId, creditHours } = parsed.data;

  if (classId) {
    const targetClass = await prisma.class.findFirst({ where: { id: classId, schoolId } });
    if (!targetClass) {
      send(res, 400, undefined, 'Class not found in this school');
      return;
    }
  }
  if (teacherId) {
    const targetTeacher = await prisma.user.findFirst({
      where: { id: teacherId, schoolId, role: { in: ['teacher', 'coordinator'] } },
    });
    if (!targetTeacher) {
      send(res, 400, undefined, 'Teacher not found in this school');
      return;
    }

    // Only re-check the cap when the teacher is actually changing — a
    // subject already assigned to this teacher shouldn't count against its
    // own limit when nothing about the assignment is moving.
    if (teacherId !== existing.teacherId) {
      const existingSubjects = await countTeacherSubjects(schoolId, teacherId);
      if (existingSubjects >= MAX_SUBJECTS_PER_TEACHER) {
        send(res, 400, undefined, `Teacher cannot be assigned more than ${MAX_SUBJECTS_PER_TEACHER} subjects.`);
        return;
      }
    }
  }

  const updated = await prisma.subject.update({
    where: { id },
    data: { name, classId, teacherId, creditHours },
  });

  await auditLog({
    userId: req.user!.userId,
    action: 'SUBJECT_UPDATE',
    targetTable: 'Subject',
    targetId: id,
    meta: parsed.data,
    ip: req.ip,
  });

  send(res, 200, updated);
}

export async function deleteSubject(req: AuthRequest, res: Response): Promise<void> {
  const schoolId = requireSchoolId(req, res);
  if (!schoolId) return;

  const { id } = req.params;
  const existing = await prisma.subject.findFirst({ where: { id, class: { schoolId } } });
  if (!existing) {
    send(res, 404, undefined, 'Subject not found');
    return;
  }

  await prisma.subject.update({ where: { id }, data: { isActive: false } });

  await auditLog({
    userId: req.user!.userId,
    action: 'SUBJECT_DELETE',
    targetTable: 'Subject',
    targetId: id,
    ip: req.ip,
  });

  send(res, 200, { message: 'Subject deleted' });
}

// =================================================================
// 6. Timetable
// =================================================================

/**
 * Finds a slot that clashes with the given one — same day, overlapping time,
 * and either the same room or the same teacher (via the subject).
 * This is the sync "teacher/room double-booking" check from phases.txt.
 */
async function findTimetableConflict(params: {
  schoolId: string;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  room?: string;
  teacherId: string;
  excludeSlotId?: string;
}) {
  const { schoolId, dayOfWeek, startTime, endTime, room, teacherId, excludeSlotId } = params;

  const candidates = await prisma.timetableSlot.findMany({
    where: {
      schoolId,
      dayOfWeek,
      ...(excludeSlotId ? { id: { not: excludeSlotId } } : {}),
    },
    include: {
      subject: { select: { teacherId: true, name: true, teacher: { select: { name: true } } } },
      class: { select: { number: true, section: true } },
    },
  });

  return candidates.find((slot) => {
    const overlaps = slot.startTime < endTime && slot.endTime > startTime;
    if (!overlaps) return false;
    const sameRoom = Boolean(room) && slot.room === room;
    const sameTeacher = slot.subject.teacherId === teacherId;
    return sameRoom || sameTeacher;
  });
}

export async function getTimetableForClass(req: AuthRequest, res: Response): Promise<void> {
  const schoolId = requireSchoolId(req, res);
  if (!schoolId) return;

  const { classId } = req.params;
  const targetClass = await prisma.class.findFirst({ where: { id: classId, schoolId } });
  if (!targetClass) {
    send(res, 404, undefined, 'Class not found');
    return;
  }

  let slots;
  try {
    slots = await prisma.timetableSlot.findMany({
      where: { classId },
      include: { subject: { include: { teacher: { select: { id: true, name: true } } } } },
      orderBy: [{ dayOfWeek: 'asc' }, { startTime: 'asc' }],
    });
  } catch (err) {
    console.error('[getTimetableForClass] Query failed', { schoolId, classId, err });
    send(res, 500, undefined, 'Failed to load timetable. Please try again.');
    return;
  }

  send(res, 200, { slots });
}

const timetableSlotSchema = z.object({
  id: z.string().optional(), // present -> update, absent -> create
  classId: z.string().min(1),
  subjectId: z.string().min(1),
  dayOfWeek: z.number().int().min(0).max(6),
  startTime: z.string().regex(/^\d{2}:\d{2}$/),
  endTime: z.string().regex(/^\d{2}:\d{2}$/),
  room: z.string().optional(),
});

export async function upsertTimetableSlot(req: AuthRequest, res: Response): Promise<void> {
  const schoolId = requireSchoolId(req, res);
  if (!schoolId) return;

  const parsed = timetableSlotSchema.safeParse(req.body);
  if (!parsed.success) {
    send(res, 400, undefined, 'Invalid timetable slot data');
    return;
  }
  const { id, classId, subjectId, dayOfWeek, startTime, endTime, room } = parsed.data;

  if (endTime <= startTime) {
    send(res, 400, undefined, 'endTime must be after startTime');
    return;
  }

  const [targetClass, targetSubject] = await Promise.all([
    prisma.class.findFirst({ where: { id: classId, schoolId } }),
    prisma.subject.findFirst({ where: { id: subjectId, class: { schoolId } } }),
  ]);
  if (!targetClass) {
    send(res, 400, undefined, 'Class not found in this school');
    return;
  }
  if (!targetSubject) {
    send(res, 400, undefined, 'Subject not found in this school');
    return;
  }

  const conflict = await findTimetableConflict({
    schoolId,
    dayOfWeek,
    startTime,
    endTime,
    room,
    teacherId: targetSubject.teacherId,
    excludeSlotId: id,
  });
  if (conflict) {
    send(
      res,
      409,
      undefined,
      `${conflict.subject.teacher.name} already teaches ${conflict.subject.name} in Class ${conflict.class.number}-${conflict.class.section} at this time. Choose a different time.`
    );
    return;
  }

  const data = { classId, subjectId, dayOfWeek, startTime, endTime, room };

  let slot;
  if (id) {
    const existing = await prisma.timetableSlot.findFirst({ where: { id, schoolId } });
    if (!existing) {
      send(res, 404, undefined, 'Timetable slot not found');
      return;
    }
    slot = await prisma.timetableSlot.update({ where: { id }, data });
  } else {
    slot = await prisma.timetableSlot.create({ data: { ...data, schoolId } });
  }

  await auditLog({
    userId: req.user!.userId,
    action: id ? 'TIMETABLE_UPDATE' : 'TIMETABLE_CREATE',
    targetTable: 'TimetableSlot',
    targetId: slot.id,
    meta: data,
    ip: req.ip,
  });

  send(res, id ? 200 : 201, slot);
}

export async function deleteTimetableSlot(req: AuthRequest, res: Response): Promise<void> {
  const schoolId = requireSchoolId(req, res);
  if (!schoolId) return;

  const { slotId } = req.params;
  const existing = await prisma.timetableSlot.findFirst({ where: { id: slotId, schoolId } });
  if (!existing) {
    send(res, 404, undefined, 'Timetable slot not found');
    return;
  }

  await prisma.timetableSlot.delete({ where: { id: slotId } });

  await auditLog({
    userId: req.user!.userId,
    action: 'TIMETABLE_DELETE',
    targetTable: 'TimetableSlot',
    targetId: slotId,
    ip: req.ip,
  });

  send(res, 200, { message: 'Timetable slot deleted' });
}

const checkConflictSchema = z.object({
  dayOfWeek: z.coerce.number().int().min(0).max(6),
  startTime: z.string().regex(/^\d{2}:\d{2}$/),
  endTime: z.string().regex(/^\d{2}:\d{2}$/),
  room: z.string().optional(),
  teacherId: z.string().min(1),
  excludeSlotId: z.string().optional(),
});

export async function checkTimetableConflict(req: AuthRequest, res: Response): Promise<void> {
  const schoolId = requireSchoolId(req, res);
  if (!schoolId) return;

  const parsed = checkConflictSchema.safeParse(req.query);
  if (!parsed.success) {
    send(res, 400, undefined, 'Invalid query parameters');
    return;
  }

  const conflict = await findTimetableConflict({ schoolId, ...parsed.data });

  send(res, 200, {
    conflict: Boolean(conflict),
    message: conflict
      ? `${conflict.subject.teacher.name} already teaches ${conflict.subject.name} in Class ${conflict.class.number}-${conflict.class.section} at this time. Choose a different time.`
      : null,
    slot: conflict ?? null,
  });
}

// =================================================================
// 7. Announcements
// =================================================================

export async function getAnnouncements(req: AuthRequest, res: Response): Promise<void> {
  const schoolId = requireSchoolId(req, res);
  if (!schoolId) return;

  const classId = req.query.classId ? String(req.query.classId) : undefined;

  const announcements = await prisma.announcement.findMany({
    where: { schoolId, isActive: true, ...(classId ? { classId } : {}) },
    include: { author: { select: { id: true, name: true } } },
    orderBy: { createdAt: 'desc' },
  });

  send(res, 200, { announcements });
}

const createAnnouncementSchema = z.object({
  title: z.string().min(1),
  body: z.string().min(1),
  classId: z.string().optional(), // omitted / undefined = school-wide
  audience: z
    .enum([
      'all_students',
      'all_teachers',
      'class_teachers_only',
      'subject_teachers_only',
      'all_staff',
      'school_wide',
      'specific_class',
    ])
    .optional(),
});

export async function createAnnouncement(req: AuthRequest, res: Response): Promise<void> {
  const schoolId = requireSchoolId(req, res);
  if (!schoolId) return;

  const parsed = createAnnouncementSchema.safeParse(req.body);
  if (!parsed.success) {
    send(res, 400, undefined, 'Invalid announcement data');
    return;
  }
  const { title, body, classId, audience } = parsed.data;

  if (classId) {
    const targetClass = await prisma.class.findFirst({ where: { id: classId, schoolId } });
    if (!targetClass) {
      send(res, 400, undefined, 'Class not found in this school');
      return;
    }
  }

  const announcement = await prisma.announcement.create({
    data: { title, body, classId, schoolId, authorId: req.user!.userId },
  });

  await auditLog({
    userId: req.user!.userId,
    action: 'ANNOUNCEMENT_CREATE',
    targetTable: 'Announcement',
    targetId: announcement.id,
    meta: { title, classId, audience },
    ip: req.ip,
  });

  if (audience) {
    await notifyAnnouncementAudience({
      schoolId,
      authorId: req.user!.userId,
      title,
      body,
      audience,
      classId: classId ?? null,
    });
  } else {
    await notifyAnnouncementRecipients({
      schoolId,
      authorId: req.user!.userId,
      title,
      body,
      classId: classId ?? null,
    });
  }

  send(res, 201, announcement);
}

export async function deleteAnnouncement(req: AuthRequest, res: Response): Promise<void> {
  const schoolId = requireSchoolId(req, res);
  if (!schoolId) return;

  const { id } = req.params;
  const existing = await prisma.announcement.findFirst({ where: { id, schoolId } });
  if (!existing) {
    send(res, 404, undefined, 'Announcement not found');
    return;
  }

  await prisma.announcement.update({ where: { id }, data: { isActive: false } });

  await auditLog({
    userId: req.user!.userId,
    action: 'ANNOUNCEMENT_DELETE',
    targetTable: 'Announcement',
    targetId: id,
    ip: req.ip,
  });

  send(res, 200, { message: 'Announcement deleted' });
}

// =================================================================
// 8. Report Cards
// GET /api/admin/report-cards/:studentId  (studentId = User.id)
// =================================================================

export async function getReportCard(req: AuthRequest, res: Response): Promise<void> {
  const schoolId = requireSchoolId(req, res);
  if (!schoolId) return;

  const report = await buildReportCard(schoolId, req.params.studentId);
  if (!report) {
    send(res, 404, undefined, 'Student not found');
    return;
  }

  send(res, 200, report);
}

// GET /api/admin/report-cards/bulk/:classId
export async function getBulkReportCards(req: AuthRequest, res: Response): Promise<void> {
  const schoolId = requireSchoolId(req, res);
  if (!schoolId) return;

  const cls = await prisma.class.findFirst({ where: { id: req.params.classId, schoolId } });
  if (!cls) {
    send(res, 404, undefined, 'Class not found');
    return;
  }

  const students = await prisma.studentProfile.findMany({
    where: { classId: cls.id },
    select: { userId: true },
    orderBy: { rollNo: 'asc' },
  });

  const reports = [];
  for (const s of students) {
    const report = await buildReportCard(schoolId, s.userId);
    if (report) reports.push(report);
  }

  send(res, 200, { reports });
}

// =================================================================
// 9. Academic Calendar
// =================================================================

export async function getCalendar(req: AuthRequest, res: Response): Promise<void> {
  const schoolId = requireSchoolId(req, res);
  if (!schoolId) return;

  const type = req.query.type ? String(req.query.type) : undefined;

  const dates = await prisma.academicDate.findMany({
    where: { schoolId, ...(type ? { type } : {}) },
    orderBy: { date: 'asc' },
  });

  send(res, 200, { dates });
}

const createCalendarSchema = z.object({
  title: z.string().min(1),
  type: z.enum(['exam', 'holiday', 'event']),
  date: z.string().min(1),
});

export async function createCalendarDate(req: AuthRequest, res: Response): Promise<void> {
  const schoolId = requireSchoolId(req, res);
  if (!schoolId) return;

  const parsed = createCalendarSchema.safeParse(req.body);
  if (!parsed.success) {
    send(res, 400, undefined, 'Invalid calendar data');
    return;
  }
  const { title, type, date } = parsed.data;

  const entry = await prisma.academicDate.create({
    data: { title, type, date: new Date(date), schoolId },
  });

  await auditLog({
    userId: req.user!.userId,
    action: 'CALENDAR_CREATE',
    targetTable: 'AcademicDate',
    targetId: entry.id,
    meta: { title, type, date },
    ip: req.ip,
  });

  send(res, 201, entry);
}

export async function deleteCalendarDate(req: AuthRequest, res: Response): Promise<void> {
  const schoolId = requireSchoolId(req, res);
  if (!schoolId) return;

  const { id } = req.params;
  const existing = await prisma.academicDate.findFirst({ where: { id, schoolId } });
  if (!existing) {
    send(res, 404, undefined, 'Calendar entry not found');
    return;
  }

  await prisma.academicDate.delete({ where: { id } });

  await auditLog({
    userId: req.user!.userId,
    action: 'CALENDAR_DELETE',
    targetTable: 'AcademicDate',
    targetId: id,
    ip: req.ip,
  });

  send(res, 200, { message: 'Calendar entry removed' });
}

// =================================================================
// 10. Parent Management
// Not part of the original 9 resource groups — added as a prerequisite for
// the Parent module, since there was previously no way to create a parent
// account or link one to a student at all.
// =================================================================

export async function getParents(req: AuthRequest, res: Response): Promise<void> {
  const schoolId = requireSchoolId(req, res);
  if (!schoolId) return;

  const parents = await prisma.user.findMany({
    where: { schoolId, role: 'parent' },
    include: {
      parentProfile: {
        include: { children: { include: { user: { select: { id: true, name: true } } } } },
      },
    },
    orderBy: { createdAt: 'desc' },
  });

  send(res, 200, { parents: parents.map(stripPassword) });
}

const createParentSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  password: z.string().min(8),
  studentIds: z.array(z.string()).optional(), // StudentProfile ids to link
});

export async function createParent(req: AuthRequest, res: Response): Promise<void> {
  const schoolId = requireSchoolId(req, res);
  if (!schoolId) return;

  const parsed = createParentSchema.safeParse(req.body);
  if (!parsed.success) {
    send(res, 400, undefined, 'Invalid parent data');
    return;
  }
  const { name, email, password, studentIds } = parsed.data;

  if (studentIds && studentIds.length > 0) {
    const validCount = await prisma.studentProfile.count({
      where: { id: { in: studentIds }, class: { schoolId } },
    });
    if (validCount !== studentIds.length) {
      send(res, 400, undefined, 'One or more students not found in this school');
      return;
    }
  }

  const hashedPassword = await bcrypt.hash(password, 12);

  try {
    const user = await prisma.user.create({
      data: {
        name,
        email,
        password: hashedPassword,
        role: 'parent',
        schoolId,
        parentProfile: { create: {} },
      },
      include: { parentProfile: true },
    });

    if (studentIds && studentIds.length > 0 && user.parentProfile) {
      await prisma.studentProfile.updateMany({
        where: { id: { in: studentIds } },
        data: { parentId: user.parentProfile.id },
      });
    }

    await auditLog({
      userId: req.user!.userId,
      action: 'PARENT_CREATE',
      targetTable: 'User',
      targetId: user.id,
      meta: { email, studentIds },
      ip: req.ip,
    });

    try {
      const school = await prisma.school.findUnique({ where: { id: schoolId }, select: { name: true } });
      await sendWelcomeEmail({
        name,
        email,
        role: 'parent',
        schoolName: school?.name ?? 'your school',
        password,
      });
    } catch (err) {
      console.warn('[createParent] Welcome email failed:', err);
    }

    send(res, 201, stripPassword(user));
  } catch (err) {
    if (isUniqueConstraintError(err)) {
      send(res, 400, undefined, 'Email already in use');
      return;
    }
    throw err;
  }
}

const linkChildrenSchema = z.object({
  studentIds: z.array(z.string()).min(1),
});

export async function linkParentChildren(req: AuthRequest, res: Response): Promise<void> {
  const schoolId = requireSchoolId(req, res);
  if (!schoolId) return;

  const parsed = linkChildrenSchema.safeParse(req.body);
  if (!parsed.success) {
    send(res, 400, undefined, 'Invalid input');
    return;
  }
  const { id } = req.params; // parent's User.id
  const { studentIds } = parsed.data;

  const parent = await prisma.user.findFirst({
    where: { id, schoolId, role: 'parent' },
    include: { parentProfile: true },
  });
  if (!parent || !parent.parentProfile) {
    send(res, 404, undefined, 'Parent not found');
    return;
  }

  const validCount = await prisma.studentProfile.count({
    where: { id: { in: studentIds }, class: { schoolId } },
  });
  if (validCount !== studentIds.length) {
    send(res, 400, undefined, 'One or more students not found in this school');
    return;
  }

  await prisma.studentProfile.updateMany({
    where: { id: { in: studentIds } },
    data: { parentId: parent.parentProfile.id },
  });

  await auditLog({
    userId: req.user!.userId,
    action: 'PARENT_LINK_CHILDREN',
    targetTable: 'User',
    targetId: id,
    meta: { studentIds },
    ip: req.ip,
  });

  send(res, 200, { message: 'Children linked' });
}

// =================================================================
// Coordinator assignment
// PATCH /api/admin/teachers/:id/coordinator
// =================================================================

const assignCoordinatorSchema = z.object({
  isCoordinator: z.boolean(),
  coordinatorWing: z.enum(['junior', 'senior']).nullable(),
});

export async function assignCoordinator(req: AuthRequest, res: Response): Promise<void> {
  const schoolId = requireSchoolId(req, res);
  if (!schoolId) return;

  const parsed = assignCoordinatorSchema.safeParse(req.body);
  if (!parsed.success) {
    send(res, 400, undefined, 'Invalid coordinator assignment data');
    return;
  }
  const { isCoordinator, coordinatorWing } = parsed.data;

  if (isCoordinator && !coordinatorWing) {
    send(res, 400, undefined, 'coordinatorWing is required when assigning a coordinator');
    return;
  }

  const { id } = req.params;
  const existing = await prisma.user.findFirst({
    where: { id, schoolId, role: { in: ['teacher', 'coordinator'] } },
    include: { teacherProfile: true },
  });
  if (!existing || !existing.teacherProfile) {
    send(res, 404, undefined, 'Teacher not found');
    return;
  }

  const [user] = await prisma.$transaction([
    prisma.user.update({
      where: { id },
      data: { role: isCoordinator ? 'coordinator' : 'teacher' },
    }),
    prisma.teacherProfile.update({
      where: { id: existing.teacherProfile.id },
      data: { isCoordinator, coordinatorWing: isCoordinator ? coordinatorWing : null },
    }),
  ]);

  await auditLog({
    userId: req.user!.userId,
    action: 'ASSIGN_COORDINATOR',
    targetTable: 'User',
    targetId: id,
    meta: { isCoordinator, coordinatorWing },
    ip: req.ip,
  });

  if (isCoordinator) {
    try {
      const school = await prisma.school.findUnique({ where: { id: schoolId }, select: { name: true } });
      await sendWelcomeEmail({
        name: existing.name,
        email: existing.email,
        role: 'coordinator',
        schoolName: school?.name ?? 'your school',
      });
    } catch (err) {
      console.warn('[assignCoordinator] Welcome email failed:', err);
    }
  }

  send(res, 200, stripPassword(user));
}

// =================================================================
// Coordinators page (dedicated admin view)
// =================================================================

export async function getCoordinators(req: AuthRequest, res: Response): Promise<void> {
  const schoolId = requireSchoolId(req, res);
  if (!schoolId) return;

  const coordinators = await prisma.user.findMany({
    where: { schoolId, role: 'coordinator' },
    include: {
      teacherProfile: true,
      teachingSubjects: { select: { id: true, name: true, class: { select: { id: true, number: true, section: true } } } },
      classTeacherOf: { select: { id: true, number: true, section: true } },
    },
    orderBy: { createdAt: 'desc' },
  });

  send(res, 200, {
    coordinators: coordinators.map((c) => ({
      ...stripPassword(c),
      wingLabel:
        c.teacherProfile?.coordinatorWing === 'junior'
          ? 'Junior Wing (Class 1-5)'
          : c.teacherProfile?.coordinatorWing === 'senior'
            ? 'Senior Wing (Class 6-10)'
            : null,
      classes: [
        ...c.teachingSubjects.map((s) => `${s.class.number}-${s.class.section}`),
        ...c.classTeacherOf.map((cl) => `${cl.number}-${cl.section}`),
      ].filter((v, i, arr) => arr.indexOf(v) === i),
    })),
  });
}

const createCoordinatorSchema = z
  .object({
    userId: z.string().optional(),
    name: z.string().min(1).optional(),
    email: z.string().email().optional(),
    password: z.string().min(8).optional(),
    coordinatorWing: z.enum(['junior', 'senior']),
  })
  .refine((data) => data.userId || (data.name && data.email && data.password), {
    message: 'Either userId, or name+email+password, must be provided',
  });

export async function createCoordinator(req: AuthRequest, res: Response): Promise<void> {
  const schoolId = requireSchoolId(req, res);
  if (!schoolId) return;

  const parsed = createCoordinatorSchema.safeParse(req.body);
  if (!parsed.success) {
    send(res, 400, undefined, 'Invalid coordinator data');
    return;
  }
  const { userId, name, email, password, coordinatorWing } = parsed.data;

  console.log('createCoordinator called', { userId, coordinatorWing, schoolId });

  const school = await prisma.school.findUnique({ where: { id: schoolId }, select: { name: true } });

  try {
    if (userId) {
      // Promote an existing user. No role filter here — a teacher missing a
      // TeacherProfile row (or with a role the strict in:['teacher','coordinator']
      // filter excluded) was the actual cause of the false "Teacher not found".
      const existing = await prisma.user.findFirst({
        where: { id: userId, schoolId, isActive: true },
        include: { teacherProfile: true },
      });
      if (!existing) {
        send(res, 404, undefined, 'Teacher not found');
        return;
      }

      if (!existing.teacherProfile) {
        await prisma.teacherProfile.create({
          data: { userId: existing.id, wing: coordinatorWing, isCoordinator: true, coordinatorWing },
        });
      } else {
        await prisma.teacherProfile.update({
          where: { userId: existing.id },
          data: { isCoordinator: true, coordinatorWing },
        });
      }

      const user = await prisma.user.update({ where: { id: userId }, data: { role: 'coordinator' } });

      await prisma.notification.create({
        data: {
          userId,
          type: 'ASSIGNED_COORDINATOR',
          message: `You have been assigned as ${coordinatorWing === 'junior' ? 'Junior' : 'Senior'} Wing Coordinator.`,
        },
      });

      await auditLog({
        userId: req.user!.userId,
        action: 'ASSIGN_COORDINATOR',
        targetTable: 'User',
        targetId: userId,
        meta: { coordinatorWing, source: 'promoted' },
        ip: req.ip,
      });

      try {
        await sendWelcomeEmail({
          name: existing.name,
          email: existing.email,
          role: 'coordinator',
          schoolName: school?.name ?? 'your school',
        });
      } catch (err) {
        console.warn('[createCoordinator] Welcome email failed:', err);
      }

      send(res, 200, stripPassword(user));
      return;
    }

    // Create a brand-new coordinator account.
    const hashedPassword = await bcrypt.hash(password as string, 12);
    const user = await prisma.user.create({
      data: {
        name: name as string,
        email: email as string,
        password: hashedPassword,
        role: 'coordinator',
        schoolId,
        teacherProfile: { create: { wing: coordinatorWing, isCoordinator: true, coordinatorWing } },
      },
      include: { teacherProfile: true },
    });

    await auditLog({
      userId: req.user!.userId,
      action: 'ASSIGN_COORDINATOR',
      targetTable: 'User',
      targetId: user.id,
      meta: { coordinatorWing, source: 'created' },
      ip: req.ip,
    });

    try {
      await sendWelcomeEmail({
        name: name as string,
        email: email as string,
        role: 'coordinator',
        schoolName: school?.name ?? 'your school',
        password,
      });
    } catch (err) {
      console.warn('[createCoordinator] Welcome email failed:', err);
    }

    send(res, 201, stripPassword(user));
  } catch (err) {
    if (isUniqueConstraintError(err)) {
      send(res, 400, undefined, 'Email already in use');
      return;
    }
    throw err;
  }
}

export async function removeCoordinator(req: AuthRequest, res: Response): Promise<void> {
  const schoolId = requireSchoolId(req, res);
  if (!schoolId) return;

  const existing = await prisma.user.findFirst({
    where: { id: req.params.id, schoolId, role: 'coordinator' },
    include: { teacherProfile: true },
  });
  if (!existing || !existing.teacherProfile) {
    send(res, 404, undefined, 'Coordinator not found');
    return;
  }

  // Demote back to a regular teacher, rather than deactivating the account —
  // matches the Teachers-page "Remove Coordinator" behavior.
  await prisma.$transaction([
    prisma.user.update({ where: { id: existing.id }, data: { role: 'teacher' } }),
    prisma.teacherProfile.update({
      where: { id: existing.teacherProfile.id },
      data: { isCoordinator: false, coordinatorWing: null },
    }),
  ]);

  await auditLog({
    userId: req.user!.userId,
    action: 'REMOVE_COORDINATOR',
    targetTable: 'User',
    targetId: existing.id,
    ip: req.ip,
  });

  send(res, 200, { message: 'Coordinator role removed' });
}

// =================================================================
// Wing Reports (submitted by coordinators, reviewed by admin)
// =================================================================

export async function getWingReports(req: AuthRequest, res: Response): Promise<void> {
  const schoolId = requireSchoolId(req, res);
  if (!schoolId) return;

  const reports = await prisma.wingReport.findMany({
    where: { schoolId },
    include: { coordinator: { select: { id: true, name: true, email: true } } },
    orderBy: { submittedAt: 'desc' },
  });

  send(res, 200, { reports });
}

const wingReportDecisionSchema = z.object({
  adminComment: z.string().max(1000).optional(),
});

export async function approveWingReport(req: AuthRequest, res: Response): Promise<void> {
  const schoolId = requireSchoolId(req, res);
  if (!schoolId) return;

  const parsed = wingReportDecisionSchema.safeParse(req.body);
  if (!parsed.success) {
    send(res, 400, undefined, 'Invalid input');
    return;
  }

  const existing = await prisma.wingReport.findFirst({ where: { id: req.params.id, schoolId } });
  if (!existing) {
    send(res, 404, undefined, 'Wing report not found');
    return;
  }

  const report = await prisma.wingReport.update({
    where: { id: existing.id },
    data: { status: 'approved', adminComment: parsed.data.adminComment, approvedAt: new Date() },
  });

  await prisma.notification.create({
    data: {
      userId: existing.coordinatorId,
      type: 'WING_REPORT_APPROVED',
      message: `Your wing report for ${existing.monthYear} has been approved.`,
    },
  });

  await auditLog({
    userId: req.user!.userId,
    action: 'WING_REPORT_APPROVE',
    targetTable: 'WingReport',
    targetId: report.id,
    ip: req.ip,
  });

  send(res, 200, report);
}

export async function rejectWingReport(req: AuthRequest, res: Response): Promise<void> {
  const schoolId = requireSchoolId(req, res);
  if (!schoolId) return;

  const parsed = wingReportDecisionSchema.safeParse(req.body);
  if (!parsed.success) {
    send(res, 400, undefined, 'Invalid input');
    return;
  }

  const existing = await prisma.wingReport.findFirst({ where: { id: req.params.id, schoolId } });
  if (!existing) {
    send(res, 404, undefined, 'Wing report not found');
    return;
  }

  const report = await prisma.wingReport.update({
    where: { id: existing.id },
    data: { status: 'rejected', adminComment: parsed.data.adminComment },
  });

  await prisma.notification.create({
    data: {
      userId: existing.coordinatorId,
      type: 'WING_REPORT_REJECTED',
      message: `Your wing report for ${existing.monthYear} needs changes — see admin comments.`,
    },
  });

  await auditLog({
    userId: req.user!.userId,
    action: 'WING_REPORT_REJECT',
    targetTable: 'WingReport',
    targetId: report.id,
    ip: req.ip,
  });

  send(res, 200, report);
}

// =================================================================
// 10. Finance User Management
// POST /api/admin/finance/create-user
// =================================================================

const createFinanceUserSchema = z.object({
  name: z.string().min(1).max(120),
  email: z.string().email(),
  password: z.string().min(8),
});

export async function createFinanceUser(req: AuthRequest, res: Response): Promise<void> {
  const schoolId = requireSchoolId(req, res);
  if (!schoolId) return;

  const parsed = createFinanceUserSchema.safeParse(req.body);
  if (!parsed.success) {
    send(res, 400, undefined, 'Invalid finance user data');
    return;
  }
  const { name, email, password } = parsed.data;

  const hashedPassword = await bcrypt.hash(password, 12);

  try {
    const user = await prisma.user.create({
      data: { name, email, password: hashedPassword, role: 'finance', schoolId },
    });

    await auditLog({
      userId: req.user!.userId,
      action: 'FINANCE_USER_CREATE',
      targetTable: 'User',
      targetId: user.id,
      meta: { email },
      ip: req.ip,
    });

    try {
      const school = await prisma.school.findUnique({ where: { id: schoolId }, select: { name: true } });
      await sendWelcomeEmail({
        name,
        email,
        role: 'finance',
        schoolName: school?.name ?? 'your school',
        password,
      });
    } catch (err) {
      console.warn('[createFinanceUser] Welcome email failed:', err);
    }

    send(res, 201, stripPassword(user));
  } catch (err) {
    if (isUniqueConstraintError(err)) {
      send(res, 400, undefined, 'Email already in use');
      return;
    }
    throw err;
  }
}

// GET /api/admin/finance/users
export async function getFinanceUsers(req: AuthRequest, res: Response): Promise<void> {
  const schoolId = requireSchoolId(req, res);
  if (!schoolId) return;

  const officers = await prisma.user.findMany({
    where: { schoolId, role: 'finance' },
    orderBy: { createdAt: 'desc' },
  });

  send(res, 200, { officers: officers.map(stripPassword) });
}

const updateFinanceUserSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  email: z.string().email().optional(),
  password: z.string().min(8).optional(),
});

// PATCH /api/admin/finance/users/:id
export async function updateFinanceUser(req: AuthRequest, res: Response): Promise<void> {
  const schoolId = requireSchoolId(req, res);
  if (!schoolId) return;

  const parsed = updateFinanceUserSchema.safeParse(req.body);
  if (!parsed.success) {
    send(res, 400, undefined, 'Invalid finance officer data');
    return;
  }

  const existing = await prisma.user.findFirst({ where: { id: req.params.id, schoolId, role: 'finance' } });
  if (!existing) {
    send(res, 404, undefined, 'Finance officer not found');
    return;
  }

  const { name, email, password } = parsed.data;

  try {
    const user = await prisma.user.update({
      where: { id: existing.id },
      data: {
        name,
        email,
        password: password ? await bcrypt.hash(password, 12) : undefined,
      },
    });

    await auditLog({
      userId: req.user!.userId,
      action: 'FINANCE_OFFICER_UPDATED',
      targetTable: 'User',
      targetId: user.id,
      meta: { name, email, passwordChanged: Boolean(password) },
      ip: req.ip,
    });

    send(res, 200, stripPassword(user));
  } catch (err) {
    if (isUniqueConstraintError(err)) {
      send(res, 400, undefined, 'Email already in use');
      return;
    }
    throw err;
  }
}

// PATCH /api/admin/finance/users/:id/deactivate
export async function deactivateFinanceUser(req: AuthRequest, res: Response): Promise<void> {
  const schoolId = requireSchoolId(req, res);
  if (!schoolId) return;

  const existing = await prisma.user.findFirst({ where: { id: req.params.id, schoolId, role: 'finance' } });
  if (!existing) {
    send(res, 404, undefined, 'Finance officer not found');
    return;
  }

  const user = await prisma.user.update({ where: { id: existing.id }, data: { isActive: false } });

  await auditLog({
    userId: req.user!.userId,
    action: 'FINANCE_OFFICER_DEACTIVATED',
    targetTable: 'User',
    targetId: user.id,
    ip: req.ip,
  });

  send(res, 200, stripPassword(user));
}

// PATCH /api/admin/finance/users/:id/reactivate
export async function reactivateFinanceUser(req: AuthRequest, res: Response): Promise<void> {
  const schoolId = requireSchoolId(req, res);
  if (!schoolId) return;

  const existing = await prisma.user.findFirst({ where: { id: req.params.id, schoolId, role: 'finance' } });
  if (!existing) {
    send(res, 404, undefined, 'Finance officer not found');
    return;
  }

  const user = await prisma.user.update({ where: { id: existing.id }, data: { isActive: true } });

  await auditLog({
    userId: req.user!.userId,
    action: 'FINANCE_OFFICER_REACTIVATED',
    targetTable: 'User',
    targetId: user.id,
    ip: req.ip,
  });

  send(res, 200, stripPassword(user));
}

// =================================================================
// Leave Requests (school-wide — admin override/final authority)
// =================================================================

// GET /api/admin/leave-requests?status=&class=&from=&to=
export async function getAdminLeaveRequests(req: AuthRequest, res: Response): Promise<void> {
  const schoolId = requireSchoolId(req, res);
  if (!schoolId) return;

  const { status, class: classId, from, to } = req.query;

  let requests;
  try {
    // schoolId is enforced via the requester relation (LeaveRequest has no
    // schoolId column of its own — every requester is a User, and every
    // User in this school has User.schoolId === schoolId).
    requests = await prisma.leaveRequest.findMany({
      where: {
        status: status && status !== 'all' ? (String(status) as 'pending' | 'approved' | 'rejected') : undefined,
        requester: {
          schoolId,
          ...(typeof classId === 'string' ? { studentProfile: { classId } } : {}),
        },
        ...(from ? { startDate: { gte: new Date(String(from)) } } : {}),
        ...(to ? { endDate: { lte: new Date(String(to)) } } : {}),
      },
      include: {
        requester: {
          select: {
            name: true,
            role: true,
            studentProfile: { select: { rollNo: true, class: { select: { id: true, number: true, section: true } } } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  } catch (err) {
    console.error('[getAdminLeaveRequests] Query failed', { schoolId, status, classId, from, to, err });
    send(res, 500, undefined, 'Failed to load leave requests. Please try again.');
    return;
  }

  send(res, 200, {
    requests: requests.map((r) => ({
      id: r.id,
      requesterName: r.requester.name,
      requesterRole: r.requester.role,
      rollNo: r.requester.studentProfile?.rollNo ?? null,
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

const adminReviewLeaveRequestSchema = z.object({
  action: z.enum(['approved', 'rejected']),
  reviewNote: z.string().max(1000).optional(),
});

// PATCH /api/admin/leave-requests/:id/review — final authority; can override a teacher's decision.
export async function reviewAdminLeaveRequest(req: AuthRequest, res: Response): Promise<void> {
  const schoolId = requireSchoolId(req, res);
  if (!schoolId) return;

  const parsed = adminReviewLeaveRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    send(res, 400, undefined, 'Invalid review data');
    return;
  }

  const existing = await prisma.leaveRequest.findFirst({
    where: { id: req.params.id, requester: { schoolId } },
    include: { requester: { select: { id: true, name: true } } },
  });
  if (!existing) {
    send(res, 404, undefined, 'Leave request not found');
    return;
  }

  const { action, reviewNote } = parsed.data;

  const updated = await prisma.leaveRequest.update({
    where: { id: existing.id },
    data: { status: action, reviewNote, reviewedBy: req.user!.userId, reviewedAt: new Date() },
  });

  if (action === 'approved') {
    await applyLeaveAttendance(updated);
  }

  const notifyIds = [existing.requesterId, existing.reviewedBy].filter(
    (id, i, arr): id is string => Boolean(id) && arr.indexOf(id) === i && id !== req.user!.userId
  );
  if (notifyIds.length > 0) {
    await prisma.notification.createMany({
      data: notifyIds.map((userId) => ({
        userId,
        type: 'LEAVE_REQUEST_ADMIN_REVIEWED',
        message: `${existing.requester.name}'s leave request was ${action} by the school admin.`,
      })),
    });
  }

  await auditLog({
    userId: req.user!.userId,
    action: 'LEAVE_REQUEST_REVIEWED',
    targetTable: 'LeaveRequest',
    targetId: updated.id,
    meta: { action, reviewNote, level: 'admin' },
    ip: req.ip,
  });

  send(res, 200, updated);
}

// =================================================================
// Consent Forms
// =================================================================

export async function getConsentForms(req: AuthRequest, res: Response): Promise<void> {
  const schoolId = requireSchoolId(req, res);
  if (!schoolId) return;

  const forms = await prisma.consentForm.findMany({
    where: { schoolId },
    include: { _count: { select: { responses: true } } },
    orderBy: { createdAt: 'desc' },
  });

  send(res, 200, {
    forms: forms.map((f) => ({
      id: f.id,
      title: f.title,
      description: f.description,
      dueDate: f.dueDate,
      isActive: f.isActive,
      createdAt: f.createdAt,
      responseCount: f._count.responses,
    })),
  });
}

const createConsentFormSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().min(1).max(2000),
  dueDate: z.coerce.date(),
});

export async function createConsentForm(req: AuthRequest, res: Response): Promise<void> {
  const schoolId = requireSchoolId(req, res);
  if (!schoolId) return;

  const parsed = createConsentFormSchema.safeParse(req.body);
  if (!parsed.success) {
    send(res, 400, undefined, 'Invalid consent form data');
    return;
  }

  const form = await prisma.consentForm.create({
    data: { schoolId, createdBy: req.user!.userId, ...parsed.data },
  });

  await auditLog({
    userId: req.user!.userId,
    action: 'CONSENT_FORM_CREATE',
    targetTable: 'ConsentForm',
    targetId: form.id,
    meta: { title: form.title },
    ip: req.ip,
  });

  // Notify every parent in this school that a new consent form needs a response.
  const parents = await prisma.user.findMany({ where: { schoolId, role: 'parent', isActive: true } });
  if (parents.length > 0) {
    await prisma.notification.createMany({
      data: parents.map((p) => ({
        userId: p.id,
        type: 'CONSENT_FORM_NEW',
        message: `New consent form: "${form.title}" — due ${form.dueDate.toLocaleDateString()}.`,
      })),
    });
  }

  send(res, 201, form);
}

export async function deleteConsentForm(req: AuthRequest, res: Response): Promise<void> {
  const schoolId = requireSchoolId(req, res);
  if (!schoolId) return;

  const existing = await prisma.consentForm.findFirst({ where: { id: req.params.id, schoolId } });
  if (!existing) {
    send(res, 404, undefined, 'Consent form not found');
    return;
  }

  await prisma.consentForm.update({ where: { id: existing.id }, data: { isActive: false } });

  await auditLog({
    userId: req.user!.userId,
    action: 'CONSENT_FORM_DELETE',
    targetTable: 'ConsentForm',
    targetId: existing.id,
    ip: req.ip,
  });

  send(res, 200, { message: 'Consent form deactivated' });
}

export async function getConsentFormResponses(req: AuthRequest, res: Response): Promise<void> {
  const schoolId = requireSchoolId(req, res);
  if (!schoolId) return;

  const form = await prisma.consentForm.findFirst({ where: { id: req.params.id, schoolId } });
  if (!form) {
    send(res, 404, undefined, 'Consent form not found');
    return;
  }

  const [responses, allParents] = await Promise.all([
    prisma.consentResponse.findMany({
      where: { consentFormId: form.id },
      orderBy: { respondedAt: 'desc' },
    }),
    prisma.parentProfile.findMany({
      where: { user: { schoolId, isActive: true } },
      include: {
        user: { select: { id: true, name: true } },
        children: { select: { id: true, user: { select: { name: true } } } },
      },
    }),
  ]);

  const respondedByKey = new Map(responses.map((r) => [`${r.parentId}:${r.studentId}`, r]));

  // Build one row per parent-child pair so "pending" rows show up too, not
  // just the ones who already responded.
  const rows = allParents.flatMap((parent) =>
    parent.children.map((child) => {
      const existing = respondedByKey.get(`${parent.userId}:${child.id}`);
      return {
        parentName: parent.user.name,
        studentName: child.user.name,
        response: existing ? (existing.approved ? 'approved' : 'rejected') : 'pending',
        notes: existing?.notes ?? null,
        respondedAt: existing?.respondedAt ?? null,
      };
    })
  );

  send(res, 200, {
    form: { id: form.id, title: form.title, dueDate: form.dueDate },
    responses: rows,
  });
}

// =================================================================
// Predictive Dropout Risk
// GET /api/admin/at-risk-students
// =================================================================

function riskLevelFor(score: number): 'high' | 'medium' | 'low' {
  if (score >= 70) return 'high';
  if (score >= 40) return 'medium';
  return 'low';
}

export async function getAtRiskStudents(req: AuthRequest, res: Response): Promise<void> {
  const schoolId = requireSchoolId(req, res);
  if (!schoolId) return;

  const students = await prisma.studentProfile.findMany({
    where: { user: { schoolId, isActive: true } },
    select: {
      id: true,
      userId: true,
      class: { select: { id: true, number: true, section: true } },
      user: { select: { name: true } },
    },
  });
  if (students.length === 0) {
    send(res, 200, []);
    return;
  }

  const studentUserIds = students.map((s) => s.userId);
  const studentProfileIds = students.map((s) => s.id);
  const classIds = [...new Set(students.map((s) => s.class.id))];

  const [attendanceRecords, grades, submissionCounts, activitiesByClass] = await Promise.all([
    prisma.attendance.findMany({
      where: { studentId: { in: studentUserIds } },
      select: { studentId: true, status: true },
    }),
    prisma.grade.findMany({
      where: { studentId: { in: studentProfileIds } },
      select: { studentId: true, marks: true, submission: { select: { activity: { select: { totalMarks: true } } } } },
    }),
    prisma.submission.groupBy({
      by: ['studentId'],
      where: { studentId: { in: studentProfileIds } },
      _count: { _all: true },
    }),
    prisma.activity.groupBy({
      by: ['subjectId'],
      where: { subject: { classId: { in: classIds } }, isDraft: false, isActive: true },
      _count: { _all: true },
    }),
  ]);

  // Total published activities per class (sum across that class's subjects).
  const subjectToClass = await prisma.subject.findMany({
    where: { classId: { in: classIds } },
    select: { id: true, classId: true },
  });
  const classIdBySubjectId = new Map(subjectToClass.map((s) => [s.id, s.classId]));
  const activityCountByClass = new Map<string, number>();
  for (const a of activitiesByClass) {
    const classId = classIdBySubjectId.get(a.subjectId);
    if (!classId) continue;
    activityCountByClass.set(classId, (activityCountByClass.get(classId) ?? 0) + a._count._all);
  }

  const attendanceByStudent = new Map<string, { present: number; total: number }>();
  for (const a of attendanceRecords) {
    const entry = attendanceByStudent.get(a.studentId) ?? { present: 0, total: 0 };
    entry.total += 1;
    if (a.status === 'present') entry.present += 1;
    attendanceByStudent.set(a.studentId, entry);
  }

  const gradesByStudent = new Map<string, { sumPct: number; count: number }>();
  for (const g of grades) {
    const pct = g.submission.activity.totalMarks > 0 ? (g.marks / g.submission.activity.totalMarks) * 100 : 0;
    const entry = gradesByStudent.get(g.studentId) ?? { sumPct: 0, count: 0 };
    entry.sumPct += pct;
    entry.count += 1;
    gradesByStudent.set(g.studentId, entry);
  }

  const submissionCountByStudent = new Map(submissionCounts.map((s) => [s.studentId, s._count._all]));

  const results = students.map((s) => {
    const att = attendanceByStudent.get(s.userId);
    const attendanceRate = att && att.total > 0 ? (att.present / att.total) * 100 : 100;

    const gr = gradesByStudent.get(s.id);
    const avgGrade = gr && gr.count > 0 ? gr.sumPct / gr.count : 100;

    const totalActivities = activityCountByClass.get(s.class.id) ?? 0;
    const submittedCount = submissionCountByStudent.get(s.id) ?? 0;
    const submissionRate = totalActivities > 0 ? Math.min(100, (submittedCount / totalActivities) * 100) : 100;

    const attendanceScore = (attendanceRate / 100) * 40;
    const gradeScore = (avgGrade / 100) * 40;
    const submissionScore = (submissionRate / 100) * 20;
    const riskScore = Math.round(100 - (attendanceScore + gradeScore + submissionScore));

    // Whichever factor lost the most points, proportionally, drives the label.
    const attendanceLoss = 40 - attendanceScore;
    const gradeLoss = 40 - gradeScore;
    const submissionLoss = 20 - submissionScore;
    let primaryReason: string;
    if (attendanceLoss >= gradeLoss && attendanceLoss >= submissionLoss) primaryReason = 'Low attendance';
    else if (gradeLoss >= submissionLoss) primaryReason = 'Poor grades';
    else primaryReason = 'Not submitting';

    return {
      studentId: s.id,
      studentName: s.user.name,
      className: s.class.number,
      section: s.class.section,
      attendanceRate: Math.round(attendanceRate),
      avgGrade: Math.round(avgGrade),
      submissionRate: Math.round(submissionRate),
      riskScore,
      riskLevel: riskLevelFor(riskScore),
      primaryReason,
    };
  });

  const atRisk = results.filter((r) => r.riskScore >= 40).sort((a, b) => b.riskScore - a.riskScore);

  send(res, 200, atRisk);
}

// =================================================================
// Global Search
// GET /api/admin/search?q=&type=all|student|teacher|class|subject
// =================================================================

export async function globalSearch(req: AuthRequest, res: Response): Promise<void> {
  const schoolId = requireSchoolId(req, res);
  if (!schoolId) return;

  const q = String(req.query.q ?? '').trim();
  const type = String(req.query.type ?? 'all');
  const empty = { students: [], teachers: [], classes: [], subjects: [] };

  if (q.length < 2) {
    send(res, 200, empty);
    return;
  }

  const wantStudents = type === 'all' || type === 'student';
  const wantTeachers = type === 'all' || type === 'teacher';
  const wantClasses = type === 'all' || type === 'class';
  const wantSubjects = type === 'all' || type === 'subject';

  const numericQuery = Number(q);

  const [students, teachers, classes, subjects] = await Promise.all([
    wantStudents
      ? prisma.user.findMany({
          where: { schoolId, role: 'student', isActive: true, name: { contains: q, mode: 'insensitive' } },
          take: 5,
          select: {
            id: true,
            name: true,
            studentProfile: { select: { rollNo: true, class: { select: { number: true, section: true } } } },
          },
        })
      : [],
    wantTeachers
      ? prisma.user.findMany({
          where: { schoolId, role: 'teacher', isActive: true, name: { contains: q, mode: 'insensitive' } },
          take: 5,
          select: { id: true, name: true, teachingSubjects: { select: { name: true } } },
        })
      : [],
    wantClasses
      ? prisma.class.findMany({
          where: {
            schoolId,
            isActive: true,
            ...(Number.isNaN(numericQuery)
              ? { section: { contains: q, mode: 'insensitive' } }
              : { number: numericQuery }),
          },
          take: 5,
          include: {
            classTeacher: { select: { name: true } },
            _count: { select: { studentProfiles: true } },
          },
        })
      : [],
    wantSubjects
      ? prisma.subject.findMany({
          where: { class: { schoolId }, isActive: true, name: { contains: q, mode: 'insensitive' } },
          take: 5,
          include: {
            class: { select: { number: true, section: true } },
            teacher: { select: { name: true } },
          },
        })
      : [],
  ]);

  send(res, 200, {
    students: students.map((s) => ({
      id: s.id,
      name: s.name,
      rollNo: s.studentProfile?.rollNo ?? null,
      classLabel: s.studentProfile ? `${s.studentProfile.class.number}-${s.studentProfile.class.section}` : null,
    })),
    teachers: teachers.map((t) => ({
      id: t.id,
      name: t.name,
      subjects: t.teachingSubjects.map((sub) => sub.name),
    })),
    classes: classes.map((c) => ({
      id: c.id,
      label: `Class ${c.number}-${c.section}`,
      studentCount: c._count.studentProfiles,
      classTeacherName: c.classTeacher?.name ?? null,
    })),
    subjects: subjects.map((sub) => ({
      id: sub.id,
      name: sub.name,
      classLabel: `${sub.class.number}-${sub.class.section}`,
      teacherName: sub.teacher.name,
    })),
  });
}

// ---------------------------------------------------------------
// GET /api/admin/school-settings/branding
// PATCH /api/admin/school-settings/branding
// School admin refining their own school's branding, initially set by
// super admin — same fields, same shape as the super-admin endpoint.
// ---------------------------------------------------------------

const adminBrandingSelect = {
  portalName: true,
  logoUrl: true,
  primaryColor: true,
  sidebarColor: true,
  accentColor: true,
  fontFamily: true,
  loginBgColor: true,
  loginMessage: true,
  faviconUrl: true,
  schoolDomain: true,
} as const;

export async function getSchoolBrandingSelf(req: AuthRequest, res: Response): Promise<void> {
  const schoolId = requireSchoolId(req, res);
  if (!schoolId) return;

  const settings = await prisma.schoolSettings.findUnique({
    where: { schoolId },
    select: adminBrandingSelect,
  });

  send(res, 200, settings ?? {});
}

const adminBrandingSchema = z.object({
  portalName: z.string().max(100).optional(),
  primaryColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  sidebarColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).nullable().optional(),
  accentColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  fontFamily: z.string().max(50).optional(),
  loginBgColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  loginMessage: z.string().max(300).nullable().optional(),
  logoUrl: z.string().url().nullable().optional(),
  faviconUrl: z.string().url().nullable().optional(),
  schoolDomain: z
    .string()
    .min(2)
    .max(40)
    .regex(/^[a-z0-9-]+$/, 'Lowercase letters, numbers and hyphens only')
    .optional(),
});

export async function updateSchoolBrandingSelf(req: AuthRequest, res: Response): Promise<void> {
  const schoolId = requireSchoolId(req, res);
  if (!schoolId) return;

  const parsed = adminBrandingSchema.safeParse(req.body);
  if (!parsed.success) {
    send(res, 400, undefined, 'Invalid branding data');
    return;
  }

  const settings = await prisma.schoolSettings.upsert({
    where: { schoolId },
    create: { schoolId, ...parsed.data },
    update: parsed.data,
    select: adminBrandingSelect,
  });

  await auditLog({
    userId: req.user!.userId,
    action: 'SCHOOL_BRANDING_UPDATED',
    targetTable: 'SchoolSettings',
    targetId: schoolId,
    meta: parsed.data,
    ip: req.ip,
  });

  send(res, 200, settings);
}

// ---------------------------------------------------------------
// GET /api/admin/school-settings/features
// Read-only — school admin can see what's enabled but only super admin can
// change it (via /api/super/schools/:id/features).
// ---------------------------------------------------------------

export async function getSchoolFeaturesSelf(req: AuthRequest, res: Response): Promise<void> {
  const schoolId = requireSchoolId(req, res);
  if (!schoolId) return;

  const school = await prisma.school.findUnique({
    where: { id: schoolId },
    select: {
      featureParentPortal: true,
      featureAi: true,
      featureSms: true,
      featureUrdu: true,
      featureCoordinator: true,
      featureLeaveRequests: true,
      featureConsentForms: true,
      featureFinance: true,
      featureAiInsights: true,
      featureAttendance: true,
      featureTimetable: true,
      featureAnnouncements: true,
      featureCalendar: true,
      featureReportCards: true,
      featureBadges: true,
      featureMonthlyReports: true,
    },
  });

  send(res, 200, school ?? {});
}

// ---------------------------------------------------------------
// GET /api/admin/staff-leaves
// PATCH /api/admin/staff-leaves/:id/review
// All teacher/coordinator leave requests for this school — both
// coordinator-approved teacher leaves and coordinators' own leave (which
// skips straight to admin).
// ---------------------------------------------------------------

export async function getStaffLeaves(req: AuthRequest, res: Response): Promise<void> {
  const schoolId = requireSchoolId(req, res);
  if (!schoolId) return;

  const leaves = await prisma.teacherLeave.findMany({
    where: { schoolId },
    orderBy: { createdAt: 'desc' },
  });

  const teacherIds = [...new Set(leaves.map((l) => l.teacherId))];
  const teachers = await prisma.user.findMany({
    where: { id: { in: teacherIds } },
    select: { id: true, name: true, role: true },
  });
  const teacherById = new Map(teachers.map((t) => [t.id, t]));

  send(res, 200, {
    leaves: leaves.map((l) => ({
      id: l.id,
      staffName: teacherById.get(l.teacherId)?.name ?? 'Unknown',
      role: teacherById.get(l.teacherId)?.role ?? 'teacher',
      fromDate: l.fromDate,
      toDate: l.toDate,
      reason: l.reason,
      status: l.status,
      reviewNote: l.reviewNote,
    })),
  });
}

const adminReviewStaffLeaveSchema = z.object({
  action: z.enum(['approved', 'rejected']),
  reviewNote: z.string().max(1000).optional(),
});

export async function reviewStaffLeave(req: AuthRequest, res: Response): Promise<void> {
  const schoolId = requireSchoolId(req, res);
  if (!schoolId) return;

  const parsed = adminReviewStaffLeaveSchema.safeParse(req.body);
  if (!parsed.success) {
    send(res, 400, undefined, 'Invalid review data');
    return;
  }

  const existing = await prisma.teacherLeave.findFirst({ where: { id: req.params.id, schoolId } });
  if (!existing) {
    send(res, 404, undefined, 'Leave request not found');
    return;
  }

  const { action, reviewNote } = parsed.data;
  const updated = await prisma.teacherLeave.update({
    where: { id: existing.id },
    data: { status: action, reviewNote, reviewedBy: req.user!.userId, reviewedAt: new Date() },
  });

  await auditLog({
    userId: req.user!.userId,
    action: 'STAFF_LEAVE_REVIEWED',
    targetTable: 'TeacherLeave',
    targetId: existing.id,
    meta: { decision: action },
    ip: req.ip,
  });

  try {
    await prisma.notification.create({
      data: {
        userId: existing.teacherId,
        type: 'TEACHER_LEAVE_REVIEWED',
        message: `Your leave request (${new Date(existing.fromDate).toLocaleDateString()} – ${new Date(existing.toDate).toLocaleDateString()}) was ${action} by the school admin.`,
      },
    });
  } catch (err) {
    console.error('[reviewStaffLeave] Failed to notify teacher', { leaveId: existing.id, err });
  }

  send(res, 200, updated);
}

// ---------------------------------------------------------------
// GET /api/admin/school-settings/timetable
// PATCH /api/admin/school-settings/timetable
// ---------------------------------------------------------------

const timetableSettingsSelect = {
  schoolStartTime: true,
  schoolEndTime: true,
  periodDuration: true,
  breakStartTime: true,
  breakDuration: true,
  workingDays: true,
} as const;

export async function getTimetableSettings(req: AuthRequest, res: Response): Promise<void> {
  const schoolId = requireSchoolId(req, res);
  if (!schoolId) return;

  const settings = await prisma.schoolSettings.findUnique({
    where: { schoolId },
    select: timetableSettingsSelect,
  });

  send(
    res,
    200,
    settings ?? {
      schoolStartTime: '08:00',
      schoolEndTime: '14:00',
      periodDuration: 45,
      breakStartTime: '10:30',
      breakDuration: 20,
      workingDays: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'],
    }
  );
}

const WORKING_DAY_VALUES = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'] as const;

const timetableSettingsSchema = z.object({
  schoolStartTime: z.string().regex(/^\d{2}:\d{2}$/),
  schoolEndTime: z.string().regex(/^\d{2}:\d{2}$/),
  periodDuration: z.number().int().min(15).max(120),
  breakStartTime: z.string().regex(/^\d{2}:\d{2}$/),
  breakDuration: z.number().int().min(0).max(120),
  workingDays: z.array(z.enum(WORKING_DAY_VALUES)).min(1),
});

export async function updateTimetableSettings(req: AuthRequest, res: Response): Promise<void> {
  const schoolId = requireSchoolId(req, res);
  if (!schoolId) return;

  const parsed = timetableSettingsSchema.safeParse(req.body);
  if (!parsed.success) {
    send(res, 400, undefined, 'Invalid timetable settings');
    return;
  }
  const { schoolStartTime, schoolEndTime } = parsed.data;
  if (schoolEndTime <= schoolStartTime) {
    send(res, 400, undefined, 'School end time must be after start time');
    return;
  }

  const settings = await prisma.schoolSettings.upsert({
    where: { schoolId },
    create: { schoolId, ...parsed.data },
    update: parsed.data,
    select: timetableSettingsSelect,
  });

  await auditLog({
    userId: req.user!.userId,
    action: 'TIMETABLE_SETTINGS_UPDATE',
    targetTable: 'SchoolSettings',
    meta: parsed.data,
    ip: req.ip,
  });

  send(res, 200, settings);
}

// =================================================================
// Auto-generate timetable
// =================================================================

function timeToMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
}

function minutesToTime(mins: number): string {
  const h = Math.floor(mins / 60) % 24;
  const m = mins % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

const DAY_NAME_TO_INDEX: Record<string, number> = {
  sunday: 0,
  monday: 1,
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
  friday: 5,
  saturday: 6,
};

/** Builds the list of period time-ranges for one day, skipping the break. */
function buildDailyPeriods(settings: {
  schoolStartTime: string;
  schoolEndTime: string;
  periodDuration: number;
  breakStartTime: string;
  breakDuration: number;
}): { startTime: string; endTime: string }[] {
  const dayStart = timeToMinutes(settings.schoolStartTime);
  const dayEnd = timeToMinutes(settings.schoolEndTime);
  const breakStart = timeToMinutes(settings.breakStartTime);
  const breakEnd = breakStart + settings.breakDuration;

  const periods: { startTime: string; endTime: string }[] = [];
  let cursor = dayStart;
  while (cursor + settings.periodDuration <= dayEnd) {
    const periodEnd = cursor + settings.periodDuration;
    // Skip straight over the break window rather than carving a period out of it.
    if (cursor < breakEnd && periodEnd > breakStart) {
      cursor = breakEnd;
      continue;
    }
    periods.push({ startTime: minutesToTime(cursor), endTime: minutesToTime(periodEnd) });
    cursor = periodEnd;
  }
  return periods;
}

const autoGenerateSchema = z.object({
  classId: z.string().min(1),
});

export async function autoGenerateTimetable(req: AuthRequest, res: Response): Promise<void> {
  const schoolId = requireSchoolId(req, res);
  if (!schoolId) return;

  const parsed = autoGenerateSchema.safeParse(req.body);
  if (!parsed.success) {
    send(res, 400, undefined, 'Invalid request');
    return;
  }
  const { classId } = parsed.data;

  const targetClass = await prisma.class.findFirst({ where: { id: classId, schoolId } });
  if (!targetClass) {
    send(res, 404, undefined, 'Class not found');
    return;
  }

  const [settings, subjects] = await Promise.all([
    prisma.schoolSettings.findUnique({ where: { schoolId }, select: timetableSettingsSelect }),
    prisma.subject.findMany({ where: { classId, isActive: true } }),
  ]);

  const effectiveSettings = settings ?? {
    schoolStartTime: '08:00',
    schoolEndTime: '14:00',
    periodDuration: 45,
    breakStartTime: '10:30',
    breakDuration: 20,
    workingDays: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'],
  };

  if (subjects.length === 0) {
    send(res, 400, undefined, 'This class has no subjects yet — add subjects before generating a timetable.');
    return;
  }

  const workingDayIndices = effectiveSettings.workingDays
    .map((d) => DAY_NAME_TO_INDEX[d])
    .filter((d): d is number => d !== undefined)
    .sort((a, b) => a - b);
  const dailyPeriods = buildDailyPeriods(effectiveSettings);

  if (workingDayIndices.length === 0 || dailyPeriods.length === 0) {
    send(res, 400, undefined, 'No valid periods could be generated from the current school timing settings.');
    return;
  }

  // Build the full week's empty slot grid: one entry per (day, period).
  const grid: { dayOfWeek: number; startTime: string; endTime: string }[] = [];
  for (const day of workingDayIndices) {
    for (const period of dailyPeriods) {
      grid.push({ dayOfWeek: day, ...period });
    }
  }

  // Queue: each subject appears `creditHours` times, spread as evenly as
  // possible across days rather than stacked on one day.
  type QueueItem = { subjectId: string; teacherId: string; name: string };
  const queue: QueueItem[] = [];
  const maxRounds = Math.max(...subjects.map((s) => s.creditHours), 1);
  for (let round = 0; round < maxRounds; round++) {
    for (const s of subjects) {
      if (round < s.creditHours) {
        queue.push({ subjectId: s.id, teacherId: s.teacherId, name: s.name });
      }
    }
  }

  // Existing slots for every OTHER class in the school — used to detect
  // teacher double-booking across the whole school, not just this class.
  const otherSlots = await prisma.timetableSlot.findMany({
    where: { schoolId, classId: { not: classId } },
    include: { subject: { select: { teacherId: true } }, class: { select: { number: true, section: true } } },
  });

  // Each teacher's current school-wide period load (excluding this class,
  // since its own slots are about to be regenerated) — a teacher with 0
  // periods gets priority so the load spreads fairly across staff.
  const teacherLoadMap = new Map<string, number>();
  for (const s of otherSlots) {
    teacherLoadMap.set(s.subject.teacherId, (teacherLoadMap.get(s.subject.teacherId) ?? 0) + 1);
  }

  const teacherIds = [...new Set(subjects.map((s) => s.teacherId))];
  const teacherRecords = await prisma.user.findMany({
    where: { id: { in: teacherIds } },
    select: { id: true, name: true },
  });
  const teacherNameById = new Map(teacherRecords.map((t) => [t.id, t.name]));
  for (const id of teacherIds) {
    if (!teacherLoadMap.has(id)) teacherLoadMap.set(id, 0);
  }

  // Stable-sort the queue so lower-loaded teachers are attempted first —
  // this is what makes the fairness rule (0-period teachers get priority) hold.
  const sortedQueue = [...queue].sort(
    (a, b) => (teacherLoadMap.get(a.teacherId) ?? 0) - (teacherLoadMap.get(b.teacherId) ?? 0)
  );

  const placed: { dayOfWeek: number; startTime: string; endTime: string; subjectId: string; teacherId: string }[] =
    [];
  const skipped: { subject: string; reason: string }[] = [];
  const usedSlotIndices = new Set<number>();
  const usedByDaySubject = new Set<string>(); // `${day}-${subjectId}` — avoid same subject twice same day

  for (const item of sortedQueue) {
    let placedThisItem = false;

    for (let i = 0; i < grid.length; i++) {
      if (usedSlotIndices.has(i)) continue;
      const cell = grid[i];
      const dayKey = `${cell.dayOfWeek}-${item.subjectId}`;
      if (usedByDaySubject.has(dayKey)) continue;

      const teacherBusyElsewhere = otherSlots.some(
        (s) =>
          s.dayOfWeek === cell.dayOfWeek &&
          s.subject.teacherId === item.teacherId &&
          s.startTime < cell.endTime &&
          s.endTime > cell.startTime
      );
      const teacherBusyThisRun = placed.some(
        (s) =>
          s.dayOfWeek === cell.dayOfWeek &&
          s.teacherId === item.teacherId &&
          s.startTime < cell.endTime &&
          s.endTime > cell.startTime
      );
      if (teacherBusyElsewhere || teacherBusyThisRun) continue;

      usedSlotIndices.add(i);
      usedByDaySubject.add(dayKey);
      placed.push({
        dayOfWeek: cell.dayOfWeek,
        startTime: cell.startTime,
        endTime: cell.endTime,
        subjectId: item.subjectId,
        teacherId: item.teacherId,
      });
      teacherLoadMap.set(item.teacherId, (teacherLoadMap.get(item.teacherId) ?? 0) + 1);
      placedThisItem = true;
      break;
    }

    if (!placedThisItem) {
      skipped.push({ subject: item.name, reason: 'No conflict-free slot available' });
    }
  }

  await prisma.$transaction([
    prisma.timetableSlot.deleteMany({ where: { classId } }),
    ...placed.map((p) =>
      prisma.timetableSlot.create({
        data: {
          schoolId,
          classId,
          subjectId: p.subjectId,
          dayOfWeek: p.dayOfWeek,
          startTime: p.startTime,
          endTime: p.endTime,
        },
      })
    ),
  ]);

  await auditLog({
    userId: req.user!.userId,
    action: 'TIMETABLE_AUTO_GENERATE',
    targetTable: 'Class',
    targetId: classId,
    meta: { created: placed.length, skipped: skipped.length },
    ip: req.ip,
  });

  const DAY_INDEX_TO_NAME = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const subjectNameById = new Map(subjects.map((s) => [s.id, s.name]));

  // Detailed, human-readable schedule report — grouped by day, numbered by
  // period order within that day, for the "here's what got generated" summary.
  const schedule = [...placed]
    .sort((a, b) => a.dayOfWeek - b.dayOfWeek || a.startTime.localeCompare(b.startTime))
    .map((p) => {
      const periodIndex = dailyPeriods.findIndex((dp) => dp.startTime === p.startTime) + 1;
      return {
        day: DAY_INDEX_TO_NAME[p.dayOfWeek],
        period: periodIndex,
        time: `${p.startTime}-${p.endTime}`,
        subject: subjectNameById.get(p.subjectId) ?? 'Unknown',
        teacher: teacherNameById.get(p.teacherId) ?? 'Unknown',
      };
    });

  const teacherLoad: Record<string, number> = {};
  for (const [id, load] of teacherLoadMap.entries()) {
    const name = teacherNameById.get(id);
    if (name) teacherLoad[name] = load;
  }

  send(res, 200, {
    generated: placed.length,
    skipped: skipped.length,
    conflicts: skipped,
    schedule,
    teacherLoad,
  });
}
