import { Response } from 'express';
import { z } from 'zod';
import { prisma } from '../utils/prisma';
import { send } from '../utils/response';
import { auditLog } from '../utils/audit';
import { AuthRequest } from '../middleware/auth';
import { generateProgressReportPdf } from '../services/progressReportPdf';

// ---------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------

async function requireParentProfile(req: AuthRequest, res: Response) {
  const userId = req.user!.userId;
  const profile = await prisma.parentProfile.findUnique({
    where: { userId },
    include: {
      children: {
        include: {
          user: { select: { id: true, name: true, email: true } },
          class: true,
        },
      },
    },
  });
  if (!profile) {
    send(res, 403, undefined, 'No parent profile found for this account');
    return null;
  }
  return profile;
}

/** Verifies studentId (StudentProfile.id) is actually one of this parent's children. */
function findChild(profile: NonNullable<Awaited<ReturnType<typeof requireParentProfile>>>, studentId: string) {
  return profile.children.find((c) => c.id === studentId) ?? null;
}

// =================================================================
// GET /api/parent/children
// =================================================================

export async function getChildren(req: AuthRequest, res: Response): Promise<void> {
  const profile = await requireParentProfile(req, res);
  if (!profile) return;

  send(res, 200, {
    children: profile.children.map((c) => ({
      id: c.id,
      userId: c.user.id,
      name: c.user.name,
      rollNo: c.rollNo,
      photoUrl: c.photoUrl,
      class: { id: c.class.id, number: c.class.number, section: c.class.section },
    })),
  });
}

// =================================================================
// GET /api/parent/child/:studentId/grades
// =================================================================

export async function getChildGrades(req: AuthRequest, res: Response): Promise<void> {
  const profile = await requireParentProfile(req, res);
  if (!profile) return;

  const { studentId } = req.params;
  const child = findChild(profile, studentId);
  if (!child) {
    send(res, 403, undefined, 'Not your child');
    return;
  }

  const grades = await prisma.grade.findMany({
    where: { studentId },
    include: {
      submission: { include: { activity: { include: { subject: { select: { id: true, name: true } } } } } },
    },
    orderBy: { gradedAt: 'desc' },
  });

  const bySubject = new Map<string, { subjectName: string; grades: unknown[] }>();
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

// =================================================================
// GET /api/parent/child/:studentId/report-card
// (full semester summary — same shape as the admin/student grade card)
// =================================================================

export async function getChildReportCard(req: AuthRequest, res: Response): Promise<void> {
  const profile = await requireParentProfile(req, res);
  if (!profile) return;

  const { studentId } = req.params;
  const child = findChild(profile, studentId);
  if (!child) {
    send(res, 403, undefined, 'Not your child');
    return;
  }

  const grades = await prisma.grade.findMany({
    where: { studentId },
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
    student: {
      id: child.id,
      name: child.user.name,
      rollNo: child.rollNo,
      class: { number: child.class.number, section: child.class.section },
    },
    subjectSummary,
    overallPercentage:
      overallPossible > 0 ? Math.round((overallMarks / overallPossible) * 1000) / 10 : 0,
  });
}

// =================================================================
// GET /api/parent/child/:studentId/report-card/pdf
// Same data as above, rendered as a downloadable PDF.
// =================================================================

export async function downloadChildReportCard(req: AuthRequest, res: Response): Promise<void> {
  const profile = await requireParentProfile(req, res);
  if (!profile) return;

  const { studentId } = req.params;
  const child = findChild(profile, studentId);
  if (!child) {
    send(res, 403, undefined, 'Not your child');
    return;
  }

  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);

  const [grades, presentCount, totalAttendance] = await Promise.all([
    prisma.grade.findMany({
      where: { studentId },
      include: {
        submission: { include: { activity: { include: { subject: { select: { name: true } } } } } },
      },
    }),
    prisma.attendance.count({
      where: { studentId: child.user.id, date: { gte: startOfMonth }, status: 'present' },
    }),
    prisma.attendance.count({
      where: { studentId: child.user.id, date: { gte: startOfMonth } },
    }),
  ]);

  const bySubject = new Map<string, { marks: number; possible: number }>();
  for (const g of grades) {
    const name = g.submission.activity.subject.name;
    const entry = bySubject.get(name) ?? { marks: 0, possible: 0 };
    entry.marks += g.marks;
    entry.possible += g.submission.activity.totalMarks;
    bySubject.set(name, entry);
  }
  const subjectGrades = Array.from(bySubject.entries()).map(([subjectName, s]) => ({
    subjectName,
    percentage: s.possible > 0 ? Math.round((s.marks / s.possible) * 1000) / 10 : 0,
  }));
  const totals = Array.from(bySubject.values()).reduce(
    (acc, s) => ({ marks: acc.marks + s.marks, possible: acc.possible + s.possible }),
    { marks: 0, possible: 0 }
  );

  const pdf = await generateProgressReportPdf({
    studentName: child.user.name,
    rollNo: child.rollNo,
    className: `Class ${child.class.number} - ${child.class.section}`,
    month: startOfMonth.toLocaleString('en-US', { month: 'long', year: 'numeric' }),
    attendancePercentage:
      totalAttendance > 0 ? Math.round((presentCount / totalAttendance) * 1000) / 10 : 0,
    overallGradePercentage:
      totals.possible > 0 ? Math.round((totals.marks / totals.possible) * 1000) / 10 : 0,
    subjectGrades,
  });

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="report-card-${child.rollNo}.pdf"`);
  res.send(pdf);
}

// =================================================================
// GET /api/parent/child/:studentId/attendance
// =================================================================

export async function getChildAttendance(req: AuthRequest, res: Response): Promise<void> {
  const profile = await requireParentProfile(req, res);
  if (!profile) return;

  const { studentId } = req.params;
  const child = findChild(profile, studentId);
  if (!child) {
    send(res, 403, undefined, 'Not your child');
    return;
  }

  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);

  const [monthRecords, subjects] = await Promise.all([
    prisma.attendance.findMany({
      where: { studentId: child.user.id, date: { gte: startOfMonth } },
      include: { subject: { select: { id: true, name: true } } },
    }),
    prisma.subject.findMany({ where: { classId: child.classId, isActive: true } }),
  ]);

  const perSubject = subjects.map((subject) => {
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
// GET /api/parent/child/:studentId/timetable
// =================================================================

export async function getChildTimetable(req: AuthRequest, res: Response): Promise<void> {
  const profile = await requireParentProfile(req, res);
  if (!profile) return;

  const { studentId } = req.params;
  const child = findChild(profile, studentId);
  if (!child) {
    send(res, 403, undefined, 'Not your child');
    return;
  }

  const slots = await prisma.timetableSlot.findMany({
    where: { classId: child.classId },
    include: { subject: { include: { teacher: { select: { id: true, name: true } } } } },
    orderBy: [{ dayOfWeek: 'asc' }, { startTime: 'asc' }],
  });

  send(res, 200, { slots });
}

// =================================================================
// GET /api/parent/child/:studentId/announcements
// (school-wide + this child's class)
// =================================================================

export async function getChildAnnouncements(req: AuthRequest, res: Response): Promise<void> {
  const profile = await requireParentProfile(req, res);
  if (!profile) return;

  const { studentId } = req.params;
  const child = findChild(profile, studentId);
  if (!child) {
    send(res, 403, undefined, 'Not your child');
    return;
  }

  const announcements = await prisma.announcement.findMany({
    where: {
      isActive: true,
      OR: [{ classId: child.classId }, { classId: null }],
      schoolId: child.class.schoolId,
    },
    include: { author: { select: { id: true, name: true } }, class: true },
    orderBy: { createdAt: 'desc' },
  });

  send(res, 200, { announcements });
}

// =================================================================
// GET /api/parent/child/:studentId/fees
// =================================================================

export async function getChildFees(req: AuthRequest, res: Response): Promise<void> {
  const profile = await requireParentProfile(req, res);
  if (!profile) return;

  const child = findChild(profile, req.params.studentId);
  if (!child) {
    send(res, 404, undefined, 'Child not found');
    return;
  }

  // StudentFee.studentId points at User.id, not StudentProfile.id — the
  // route param here is the StudentProfile.id, so translate via child.user.id.
  const [fees, school] = await Promise.all([
    prisma.studentFee.findMany({
      where: { studentId: child.user.id },
      include: { feeStructure: { select: { monthYear: true, dueDate: true } } },
      orderBy: { dueDate: 'desc' },
    }),
    req.user!.schoolId
      ? prisma.school.findUnique({ where: { id: req.user!.schoolId }, select: { name: true } })
      : null,
  ]);

  send(res, 200, {
    schoolName: school?.name ?? '',
    student: {
      name: child.user.name,
      rollNo: child.rollNo,
      classNumber: child.class.number,
      section: child.class.section,
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
// Notifications — includes direct messages from a child's teacher
// (Notification.type === 'TEACHER_MESSAGE')
// =================================================================

export async function getParentNotifications(req: AuthRequest, res: Response): Promise<void> {
  const userId = req.user!.userId;

  const notifications = await prisma.notification.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
  });

  send(res, 200, { notifications });
}

export async function markParentNotificationRead(req: AuthRequest, res: Response): Promise<void> {
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
// Consent Forms
// =================================================================

// GET /api/parent/consent-forms — one row per (form, child) pair.
export async function getParentConsentForms(req: AuthRequest, res: Response): Promise<void> {
  const profile = await requireParentProfile(req, res);
  if (!profile) return;
  const schoolId = req.user!.schoolId;
  if (!schoolId || profile.children.length === 0) {
    send(res, 200, { forms: [] });
    return;
  }

  const [forms, responses] = await Promise.all([
    prisma.consentForm.findMany({ where: { schoolId, isActive: true }, orderBy: { dueDate: 'asc' } }),
    prisma.consentResponse.findMany({
      where: { parentId: req.user!.userId, studentId: { in: profile.children.map((c) => c.id) } },
    }),
  ]);

  const responseByKey = new Map(responses.map((r) => [`${r.consentFormId}:${r.studentId}`, r]));

  const rows = forms.flatMap((form) =>
    profile.children.map((child) => {
      const existing = responseByKey.get(`${form.id}:${child.id}`);
      return {
        formId: form.id,
        title: form.title,
        description: form.description,
        dueDate: form.dueDate,
        isExpired: form.dueDate.getTime() < Date.now(),
        studentId: child.id,
        studentName: child.user.name,
        status: existing ? (existing.approved ? 'approved' : 'rejected') : 'pending',
        notes: existing?.notes ?? null,
      };
    })
  );

  send(res, 200, { forms: rows });
}

const respondConsentFormSchema = z.object({
  studentId: z.string().min(1),
  approved: z.boolean(),
  notes: z.string().max(1000).optional(),
});

// POST /api/parent/consent-forms/:id/respond
export async function respondToConsentForm(req: AuthRequest, res: Response): Promise<void> {
  const profile = await requireParentProfile(req, res);
  if (!profile) return;

  const parsed = respondConsentFormSchema.safeParse(req.body);
  if (!parsed.success) {
    send(res, 400, undefined, 'Invalid consent response');
    return;
  }
  const { studentId, approved, notes } = parsed.data;

  const child = findChild(profile, studentId);
  if (!child) {
    send(res, 404, undefined, 'Child not found');
    return;
  }

  const schoolId = req.user!.schoolId;
  const form = await prisma.consentForm.findFirst({
    where: { id: req.params.id, schoolId: schoolId ?? undefined, isActive: true },
  });
  if (!form) {
    send(res, 404, undefined, 'Consent form not found');
    return;
  }

  const response = await prisma.consentResponse.upsert({
    where: { consentFormId_studentId: { consentFormId: form.id, studentId } },
    update: { approved, notes, respondedAt: new Date() },
    create: { consentFormId: form.id, parentId: req.user!.userId, studentId, approved, notes },
  });

  await auditLog({
    userId: req.user!.userId,
    action: 'CONSENT_FORM_RESPOND',
    targetTable: 'ConsentResponse',
    targetId: response.id,
    meta: { consentFormId: form.id, studentId, approved },
    ip: req.ip,
  });

  send(res, 200, response);
}
