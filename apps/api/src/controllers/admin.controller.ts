import { Response } from 'express';
import bcrypt from 'bcryptjs';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../utils/prisma';
import { send } from '../utils/response';
import { auditLog } from '../utils/audit';
import { AuthRequest } from '../middleware/auth';
import { sendWelcomeEmail } from '../jobs/welcomeEmail';

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
      prisma.user.count({ where: { schoolId, role: 'teacher', isActive: true } }),
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
});

export async function createStudent(req: AuthRequest, res: Response): Promise<void> {
  const schoolId = requireSchoolId(req, res);
  if (!schoolId) return;

  const parsed = createStudentSchema.safeParse(req.body);
  if (!parsed.success) {
    send(res, 400, undefined, 'Invalid student data');
    return;
  }
  const { name, email, password, classId, rollNo, dob, phone, address } = parsed.data;

  const targetClass = await prisma.class.findFirst({ where: { id: classId, schoolId } });
  if (!targetClass) {
    send(res, 400, undefined, 'Class not found in this school');
    return;
  }

  const hashedPassword = await bcrypt.hash(password, 12);

  try {
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
            phone,
            address,
          },
        },
      },
      include: { studentProfile: true },
    });

    await auditLog({
      userId: req.user!.userId,
      action: 'STUDENT_CREATE',
      targetTable: 'User',
      targetId: user.id,
      meta: { email, classId, rollNo },
      ip: req.ip,
    });

    try {
      const school = await prisma.school.findUnique({ where: { id: schoolId }, select: { name: true } });
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

    send(res, 201, stripPassword(user));
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

  if (classId) {
    const targetClass = await prisma.class.findFirst({ where: { id: classId, schoolId } });
    if (!targetClass) {
      send(res, 400, undefined, 'Class not found in this school');
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

  const schoolClasses = await prisma.class.findMany({ where: { schoolId }, select: { id: true } });
  const validClassIds = new Set(schoolClasses.map((c) => c.id));

  const created: string[] = [];
  const errors: { row: number; email: string; error: string }[] = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const { name, email, password, classId, rollNo, dob, phone, address } = row;

    if (!name || !email || !password || !classId || !rollNo) {
      errors.push({ row: i + 2, email: email ?? '', error: 'Missing required field' });
      continue;
    }
    if (!validClassIds.has(classId)) {
      errors.push({ row: i + 2, email, error: 'classId not found in this school' });
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

// =================================================================
// 3. Teacher Management
// =================================================================

export async function getTeachers(req: AuthRequest, res: Response): Promise<void> {
  const schoolId = requireSchoolId(req, res);
  if (!schoolId) return;

  const teachers = await prisma.user.findMany({
    where: { schoolId, role: 'teacher' },
    include: {
      teachingSubjects: { select: { id: true, name: true, classId: true } },
      teacherProfile: true,
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

const updateClassSchema = z.object({
  number: z.number().int().min(1).max(10).optional(),
  section: z.string().min(1).optional(),
  classTeacherId: z.string().nullable().optional(),
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
  const existing = await prisma.class.findFirst({ where: { id, schoolId } });
  if (!existing) {
    send(res, 404, undefined, 'Class not found');
    return;
  }

  const { number, section, classTeacherId } = parsed.data;
  const wing = number !== undefined ? wingForClassNumber(number) : undefined;

  const updated = await prisma.class.update({
    where: { id },
    data: { number, section, wing, classTeacherId },
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
    prisma.user.findFirst({ where: { id: teacherId, schoolId, role: 'teacher' } }),
  ]);
  if (!targetClass) {
    send(res, 400, undefined, 'Class not found in this school');
    return;
  }
  if (!targetTeacher) {
    send(res, 400, undefined, 'Teacher not found in this school');
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
      where: { id: teacherId, schoolId, role: 'teacher' },
    });
    if (!targetTeacher) {
      send(res, 400, undefined, 'Teacher not found in this school');
      return;
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
    include: { subject: { select: { teacherId: true, name: true } } },
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

  const slots = await prisma.timetableSlot.findMany({
    where: { classId },
    include: { subject: { include: { teacher: { select: { id: true, name: true } } } } },
    orderBy: [{ dayOfWeek: 'asc' }, { startTime: 'asc' }],
  });

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
    send(res, 409, undefined, `Conflicts with an existing slot (${conflict.subject.name})`);
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
});

export async function createAnnouncement(req: AuthRequest, res: Response): Promise<void> {
  const schoolId = requireSchoolId(req, res);
  if (!schoolId) return;

  const parsed = createAnnouncementSchema.safeParse(req.body);
  if (!parsed.success) {
    send(res, 400, undefined, 'Invalid announcement data');
    return;
  }
  const { title, body, classId } = parsed.data;

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
    meta: { title, classId },
    ip: req.ip,
  });

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

  const { studentId } = req.params;

  const student = await prisma.user.findFirst({
    where: { id: studentId, schoolId, role: 'student' },
    include: { studentProfile: { include: { class: true } } },
  });
  if (!student || !student.studentProfile) {
    send(res, 404, undefined, 'Student not found');
    return;
  }

  const grades = await prisma.grade.findMany({
    where: { studentId: student.studentProfile.id },
    include: {
      submission: {
        include: { activity: { include: { subject: { select: { id: true, name: true } } } } },
      },
    },
    orderBy: { gradedAt: 'desc' },
  });

  const bySubject = new Map<string, { subjectName: string; totalMarks: number; totalPossible: number }>();
  for (const grade of grades) {
    const subject = grade.submission.activity.subject;
    const entry = bySubject.get(subject.id) ?? {
      subjectName: subject.name,
      totalMarks: 0,
      totalPossible: 0,
    };
    entry.totalMarks += grade.marks;
    entry.totalPossible += grade.submission.activity.totalMarks;
    bySubject.set(subject.id, entry);
  }

  const subjectSummary = Array.from(bySubject.entries()).map(([subjectId, s]) => ({
    subjectId,
    subjectName: s.subjectName,
    totalMarks: s.totalMarks,
    totalPossible: s.totalPossible,
    percentage: s.totalPossible > 0 ? Math.round((s.totalMarks / s.totalPossible) * 1000) / 10 : 0,
  }));

  send(res, 200, {
    student: {
      id: student.id,
      name: student.name,
      rollNo: student.studentProfile.rollNo,
      class: student.studentProfile.class,
    },
    subjectSummary,
    grades: grades.map((g) => ({
      id: g.id,
      subject: g.submission.activity.subject.name,
      activityTitle: g.submission.activity.title,
      marks: g.marks,
      totalMarks: g.submission.activity.totalMarks,
      feedback: g.feedback,
      gradedAt: g.gradedAt,
    })),
  });
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
