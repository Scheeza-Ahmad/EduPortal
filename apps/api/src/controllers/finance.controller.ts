import { Response } from 'express';
import { Prisma, FeeStatus } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../utils/prisma';
import { send } from '../utils/response';
import { auditLog } from '../utils/audit';
import { AuthRequest } from '../middleware/auth';

// ---------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------

/** Every route in this controller belongs to a finance/school_admin user, who must have a schoolId. */
function requireSchoolId(req: AuthRequest, res: Response): string | null {
  const schoolId = req.user?.schoolId;
  if (!schoolId) {
    send(res, 403, undefined, 'No school assigned to this account');
    return null;
  }
  return schoolId;
}

function isUniqueConstraintError(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002';
}

/**
 * Base status is paid/partial/unpaid from the paid-vs-due comparison, then
 * overdue overrides whenever the due date has passed and the balance isn't
 * fully settled (a fully paid fee can never become overdue).
 */
function computeFeeStatus(paidAmount: number, totalDue: number, dueDate: Date): FeeStatus {
  let status: FeeStatus;
  if (paidAmount >= totalDue) status = 'paid';
  else if (paidAmount > 0) status = 'partial';
  else status = 'unpaid';

  if (Date.now() > dueDate.getTime() && paidAmount < totalDue) {
    status = 'overdue';
  }
  return status;
}

// =================================================================
// 1. School Setup (Admin only)
// =================================================================

const settingsSchema = z.object({
  sessionStartMonth: z.number().int().min(1).max(12).optional(),
  termsPerYear: z.number().int().min(1).max(12).optional(),
  invoicePrefix: z.string().min(1).max(20).optional(),
  invoiceFooterText: z.string().max(500).optional().nullable(),
  principalName: z.string().max(120).optional().nullable(),
  address: z.string().max(300).optional().nullable(),
});

// GET /api/finance/setup/settings
export async function getSchoolSettings(req: AuthRequest, res: Response): Promise<void> {
  const schoolId = requireSchoolId(req, res);
  if (!schoolId) return;

  const settings = await prisma.schoolSettings.findUnique({ where: { schoolId } });
  send(res, 200, settings);
}

// POST /api/finance/setup/settings
export async function upsertSchoolSettings(req: AuthRequest, res: Response): Promise<void> {
  const schoolId = requireSchoolId(req, res);
  if (!schoolId) return;

  const parsed = settingsSchema.safeParse(req.body);
  if (!parsed.success) {
    send(res, 400, undefined, 'Invalid settings data');
    return;
  }

  const settings = await prisma.schoolSettings.upsert({
    where: { schoolId },
    update: { ...parsed.data },
    create: { schoolId, ...parsed.data },
  });

  await auditLog({
    userId: req.user!.userId,
    action: 'FINANCE_SETTINGS_UPDATE',
    targetTable: 'SchoolSettings',
    targetId: settings.id,
    meta: parsed.data,
    ip: req.ip,
  });

  send(res, 200, settings);
}

const lateFeeRuleSchema = z.object({
  gracePeriodDays: z.number().int().min(0).optional(),
  finePerPeriod: z.number().min(0).optional(),
  periodDays: z.number().int().min(1).optional(),
});

// GET /api/finance/setup/late-fee-rule
export async function getLateFeeRule(req: AuthRequest, res: Response): Promise<void> {
  const schoolId = requireSchoolId(req, res);
  if (!schoolId) return;

  const rule = await prisma.lateFeeRule.findUnique({ where: { schoolId } });
  send(res, 200, rule);
}

// POST /api/finance/setup/late-fee-rule
export async function upsertLateFeeRule(req: AuthRequest, res: Response): Promise<void> {
  const schoolId = requireSchoolId(req, res);
  if (!schoolId) return;

  const parsed = lateFeeRuleSchema.safeParse(req.body);
  if (!parsed.success) {
    send(res, 400, undefined, 'Invalid late fee rule data');
    return;
  }

  const rule = await prisma.lateFeeRule.upsert({
    where: { schoolId },
    update: { ...parsed.data },
    create: { schoolId, ...parsed.data },
  });

  await auditLog({
    userId: req.user!.userId,
    action: 'FINANCE_LATE_FEE_RULE_UPDATE',
    targetTable: 'LateFeeRule',
    targetId: rule.id,
    meta: parsed.data,
    ip: req.ip,
  });

  send(res, 200, rule);
}

// =================================================================
// 2. Discount Policies
// =================================================================

// GET /api/finance/discount-policies
export async function getDiscountPolicies(req: AuthRequest, res: Response): Promise<void> {
  const schoolId = requireSchoolId(req, res);
  if (!schoolId) return;

  const policies = await prisma.discountPolicy.findMany({
    where: { schoolId },
    orderBy: { createdAt: 'desc' },
  });

  send(res, 200, { policies });
}

const createDiscountPolicySchema = z.object({
  name: z.string().min(1).max(120),
  discountPercent: z.number().min(0).max(100),
  eligibilityCriteria: z.string().max(500).optional(),
  marksThreshold: z.number().min(0).max(100).optional(),
});

// POST /api/finance/discount-policies
export async function createDiscountPolicy(req: AuthRequest, res: Response): Promise<void> {
  const schoolId = requireSchoolId(req, res);
  if (!schoolId) return;

  const parsed = createDiscountPolicySchema.safeParse(req.body);
  if (!parsed.success) {
    send(res, 400, undefined, 'Invalid discount policy data');
    return;
  }

  const policy = await prisma.discountPolicy.create({
    data: { schoolId, ...parsed.data },
  });

  await auditLog({
    userId: req.user!.userId,
    action: 'DISCOUNT_POLICY_CREATE',
    targetTable: 'DiscountPolicy',
    targetId: policy.id,
    meta: parsed.data,
    ip: req.ip,
  });

  send(res, 201, policy);
}

const updateDiscountPolicySchema = createDiscountPolicySchema.partial().extend({
  isActive: z.boolean().optional(),
});

// PATCH /api/finance/discount-policies/:id
export async function updateDiscountPolicy(req: AuthRequest, res: Response): Promise<void> {
  const schoolId = requireSchoolId(req, res);
  if (!schoolId) return;

  const parsed = updateDiscountPolicySchema.safeParse(req.body);
  if (!parsed.success) {
    send(res, 400, undefined, 'Invalid discount policy data');
    return;
  }

  const existing = await prisma.discountPolicy.findFirst({ where: { id: req.params.id, schoolId } });
  if (!existing) {
    send(res, 404, undefined, 'Discount policy not found');
    return;
  }

  const policy = await prisma.discountPolicy.update({
    where: { id: existing.id },
    data: parsed.data,
  });

  await auditLog({
    userId: req.user!.userId,
    action: 'DISCOUNT_POLICY_UPDATE',
    targetTable: 'DiscountPolicy',
    targetId: policy.id,
    meta: parsed.data,
    ip: req.ip,
  });

  send(res, 200, policy);
}

// DELETE /api/finance/discount-policies/:id
export async function deleteDiscountPolicy(req: AuthRequest, res: Response): Promise<void> {
  const schoolId = requireSchoolId(req, res);
  if (!schoolId) return;

  const existing = await prisma.discountPolicy.findFirst({ where: { id: req.params.id, schoolId } });
  if (!existing) {
    send(res, 404, undefined, 'Discount policy not found');
    return;
  }

  await prisma.discountPolicy.update({ where: { id: existing.id }, data: { isActive: false } });

  await auditLog({
    userId: req.user!.userId,
    action: 'DISCOUNT_POLICY_DELETE',
    targetTable: 'DiscountPolicy',
    targetId: existing.id,
    ip: req.ip,
  });

  send(res, 200, { message: 'Discount policy deactivated' });
}

// =================================================================
// 3. Fee Structure
// =================================================================

// GET /api/finance/fee-structure
export async function getFeeStructure(req: AuthRequest, res: Response): Promise<void> {
  const schoolId = requireSchoolId(req, res);
  if (!schoolId) return;

  const structures = await prisma.feeStructure.findMany({
    where: { schoolId },
    orderBy: [{ classNumber: 'asc' }, { monthYear: 'desc' }],
  });

  const grouped = new Map<number, typeof structures>();
  for (const s of structures) {
    const bucket = grouped.get(s.classNumber);
    if (bucket) bucket.push(s);
    else grouped.set(s.classNumber, [s]);
  }

  const result = Array.from(grouped.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([classNumber, items]) => ({ classNumber, structures: items }));

  send(res, 200, { byClass: result });
}

const createFeeStructureSchema = z.object({
  classNumber: z.number().int().min(1).max(10),
  monthYear: z.string().min(1).max(20), // e.g. "2024-09"
  baseFee: z.number().min(0),
  dueDate: z.coerce.date(),
});

// POST /api/finance/fee-structure
export async function createFeeStructure(req: AuthRequest, res: Response): Promise<void> {
  const schoolId = requireSchoolId(req, res);
  if (!schoolId) return;

  const parsed = createFeeStructureSchema.safeParse(req.body);
  if (!parsed.success) {
    send(res, 400, undefined, 'Invalid fee structure data');
    return;
  }
  const { classNumber, monthYear, baseFee, dueDate } = parsed.data;

  try {
    const structure = await prisma.feeStructure.create({
      data: { schoolId, classNumber, monthYear, baseFee, dueDate },
    });

    // Auto-generate a StudentFee for every student currently in this class
    // number (any section), across the whole school.
    const students = await prisma.studentProfile.findMany({
      where: { class: { schoolId, number: classNumber } },
      select: { userId: true },
    });

    let generatedCount = 0;
    if (students.length > 0) {
      const created = await prisma.studentFee.createMany({
        data: students.map((s) => ({
          studentId: s.userId,
          feeStructureId: structure.id,
          schoolId,
          discountPercent: 0,
          baseFee,
          discountAmount: 0,
          netPayable: baseFee,
          paidAmount: 0,
          lateFine: 0,
          totalDue: baseFee,
          status: 'unpaid' as FeeStatus,
          dueDate,
        })),
        skipDuplicates: true,
      });
      generatedCount = created.count;
    }

    await auditLog({
      userId: req.user!.userId,
      action: 'FEE_STRUCTURE_CREATE',
      targetTable: 'FeeStructure',
      targetId: structure.id,
      meta: { classNumber, monthYear, baseFee, studentFeesGenerated: generatedCount },
      ip: req.ip,
    });

    send(res, 201, { structure, studentFeesGenerated: generatedCount });
  } catch (err) {
    if (isUniqueConstraintError(err)) {
      send(res, 400, undefined, 'A fee structure already exists for this class and month');
      return;
    }
    throw err;
  }
}

// =================================================================
// 4. Student Fees
// =================================================================

// GET /api/finance/student-fees
export async function getStudentFees(req: AuthRequest, res: Response): Promise<void> {
  const schoolId = requireSchoolId(req, res);
  if (!schoolId) return;

  const { monthYear, status, classNumber } = req.query;

  const studentFees = await prisma.studentFee.findMany({
    where: {
      schoolId,
      ...(status ? { status: status as FeeStatus } : {}),
      feeStructure: {
        ...(monthYear ? { monthYear: String(monthYear) } : {}),
        ...(classNumber ? { classNumber: Number(classNumber) } : {}),
      },
    },
    include: {
      student: {
        select: {
          id: true,
          name: true,
          email: true,
          studentProfile: {
            select: { rollNo: true, class: { select: { number: true, section: true } } },
          },
        },
      },
      feeStructure: { select: { classNumber: true, monthYear: true, baseFee: true, dueDate: true } },
      discountPolicy: { select: { id: true, name: true, discountPercent: true } },
    },
    orderBy: { createdAt: 'desc' },
  });

  send(res, 200, { studentFees });
}

const applyDiscountSchema = z.object({
  discountPolicyId: z.string().min(1),
});

// PATCH /api/finance/student-fees/:id/discount
export async function applyDiscount(req: AuthRequest, res: Response): Promise<void> {
  const schoolId = requireSchoolId(req, res);
  if (!schoolId) return;

  const parsed = applyDiscountSchema.safeParse(req.body);
  if (!parsed.success) {
    send(res, 400, undefined, 'Invalid discount request');
    return;
  }

  const studentFee = await prisma.studentFee.findFirst({ where: { id: req.params.id, schoolId } });
  if (!studentFee) {
    send(res, 404, undefined, 'Student fee not found');
    return;
  }

  const policy = await prisma.discountPolicy.findFirst({
    where: { id: parsed.data.discountPolicyId, schoolId, isActive: true },
  });
  if (!policy) {
    send(res, 404, undefined, 'Discount policy not found');
    return;
  }

  const discountPercent = policy.discountPercent;
  const discountAmount = (studentFee.baseFee * discountPercent) / 100;
  const netPayable = studentFee.baseFee - discountAmount;
  const totalDue = netPayable + studentFee.lateFine;
  const status = computeFeeStatus(studentFee.paidAmount, totalDue, studentFee.dueDate);

  const updated = await prisma.studentFee.update({
    where: { id: studentFee.id },
    data: {
      discountPolicyId: policy.id,
      discountPercent,
      discountAmount,
      netPayable,
      totalDue,
      status,
    },
  });

  await auditLog({
    userId: req.user!.userId,
    action: 'FEE_DISCOUNT_APPLIED',
    targetTable: 'StudentFee',
    targetId: updated.id,
    meta: { discountPolicyId: policy.id, discountPercent },
    ip: req.ip,
  });

  send(res, 200, updated);
}

// =================================================================
// 5. Payments
// =================================================================

const recordPaymentSchema = z.object({
  amount: z.number().positive(),
  paymentDate: z.coerce.date().optional(),
  notes: z.string().max(500).optional(),
});

async function nextReceiptNumber(schoolId: string, year: number): Promise<string> {
  // Retry loop guards against a race between the count() and the unique
  // receiptNumber index if two payments are recorded at nearly the same time.
  for (let attempt = 0; attempt < 5; attempt++) {
    const countThisYear = await prisma.feePayment.count({
      where: {
        schoolId,
        paymentDate: { gte: new Date(year, 0, 1), lt: new Date(year + 1, 0, 1) },
      },
    });
    const seq = String(countThisYear + 1 + attempt).padStart(4, '0');
    const candidate = `RCP-${year}-${seq}`;
    const existing = await prisma.feePayment.findUnique({ where: { receiptNumber: candidate } });
    if (!existing) return candidate;
  }
  // Extremely unlikely fallback — timestamp-based suffix guarantees uniqueness.
  return `RCP-${year}-${Date.now().toString().slice(-4)}`;
}

// POST /api/finance/payments/:studentFeeId
export async function recordPayment(req: AuthRequest, res: Response): Promise<void> {
  const schoolId = requireSchoolId(req, res);
  if (!schoolId) return;

  const parsed = recordPaymentSchema.safeParse(req.body);
  if (!parsed.success) {
    send(res, 400, undefined, 'Invalid payment data');
    return;
  }
  const { amount, notes } = parsed.data;
  const paymentDate = parsed.data.paymentDate ?? new Date();

  const studentFee = await prisma.studentFee.findFirst({
    where: { id: req.params.studentFeeId, schoolId },
  });
  if (!studentFee) {
    send(res, 404, undefined, 'Student fee not found');
    return;
  }

  const lateFeeRule = await prisma.lateFeeRule.findUnique({ where: { schoolId } });

  let lateFine = 0;
  if (lateFeeRule && lateFeeRule.isActive) {
    const daysLate = Math.max(
      0,
      Math.floor((paymentDate.getTime() - studentFee.dueDate.getTime()) / (1000 * 60 * 60 * 24))
    );
    if (daysLate > lateFeeRule.gracePeriodDays) {
      const periodsLate = Math.floor(
        (daysLate - lateFeeRule.gracePeriodDays) / lateFeeRule.periodDays
      );
      lateFine = periodsLate * lateFeeRule.finePerPeriod;
    }
  }

  const totalDue = studentFee.netPayable + lateFine;
  const paidAmount = studentFee.paidAmount + amount;
  const status = computeFeeStatus(paidAmount, totalDue, studentFee.dueDate);

  const receiptNumber = await nextReceiptNumber(schoolId, paymentDate.getFullYear());

  const [payment, updatedFee] = await prisma.$transaction([
    prisma.feePayment.create({
      data: {
        studentFeeId: studentFee.id,
        schoolId,
        amount,
        paymentDate,
        receiptNumber,
        recordedBy: req.user!.userId,
        notes,
      },
    }),
    prisma.studentFee.update({
      where: { id: studentFee.id },
      data: { lateFine, totalDue, paidAmount, status },
    }),
  ]);

  await auditLog({
    userId: req.user!.userId,
    action: 'FEE_PAYMENT_RECORDED',
    targetTable: 'FeePayment',
    targetId: payment.id,
    meta: { studentFeeId: studentFee.id, amount, receiptNumber },
    ip: req.ip,
  });

  send(res, 201, { payment, studentFee: updatedFee });
}

// GET /api/finance/payments/receipt/:paymentId
export async function getReceipt(req: AuthRequest, res: Response): Promise<void> {
  const schoolId = requireSchoolId(req, res);
  if (!schoolId) return;

  const payment = await prisma.feePayment.findFirst({
    where: { id: req.params.paymentId, schoolId },
    include: {
      studentFee: {
        include: {
          student: { select: { name: true, email: true } },
          feeStructure: { select: { classNumber: true, monthYear: true } },
        },
      },
      recordedByUser: { select: { name: true } },
    },
  });
  if (!payment) {
    send(res, 404, undefined, 'Payment not found');
    return;
  }

  const settings = await prisma.schoolSettings.findUnique({ where: { schoolId } });
  const school = await prisma.school.findUnique({ where: { id: schoolId }, select: { name: true } });

  send(res, 200, {
    receiptNumber: payment.receiptNumber,
    amount: payment.amount,
    paymentDate: payment.paymentDate,
    notes: payment.notes,
    recordedBy: payment.recordedByUser.name,
    student: payment.studentFee.student,
    classNumber: payment.studentFee.feeStructure.classNumber,
    monthYear: payment.studentFee.feeStructure.monthYear,
    studentFee: {
      baseFee: payment.studentFee.baseFee,
      discountAmount: payment.studentFee.discountAmount,
      lateFine: payment.studentFee.lateFine,
      totalDue: payment.studentFee.totalDue,
      paidAmount: payment.studentFee.paidAmount,
      status: payment.studentFee.status,
    },
    school: {
      name: school?.name ?? '',
      invoicePrefix: settings?.invoicePrefix ?? 'INV',
      principalName: settings?.principalName ?? null,
      address: settings?.address ?? null,
      invoiceFooterText: settings?.invoiceFooterText ?? null,
    },
  });
}

// =================================================================
// 6. Finance Stats
// =================================================================

interface ClassStat {
  classNumber: number;
  totalDue: number;
  collected: number;
  pending: number;
}

async function computeStatsForMonth(schoolId: string, monthYear: string) {
  const studentFees = await prisma.studentFee.findMany({
    where: { schoolId, feeStructure: { monthYear } },
    select: {
      totalDue: true,
      paidAmount: true,
      lateFine: true,
      status: true,
      feeStructure: { select: { classNumber: true } },
    },
  });

  let totalDue = 0;
  let totalCollected = 0;
  let overdueCount = 0;
  let totalLateFine = 0;
  const byClassMap = new Map<number, ClassStat>();

  for (const fee of studentFees) {
    totalDue += fee.totalDue;
    totalCollected += fee.paidAmount;
    totalLateFine += fee.lateFine;
    if (fee.status === 'overdue') overdueCount += 1;

    const classNumber = fee.feeStructure.classNumber;
    const bucket = byClassMap.get(classNumber) ?? {
      classNumber,
      totalDue: 0,
      collected: 0,
      pending: 0,
    };
    bucket.totalDue += fee.totalDue;
    bucket.collected += fee.paidAmount;
    bucket.pending += fee.totalDue - fee.paidAmount;
    byClassMap.set(classNumber, bucket);
  }

  const totalPending = totalDue - totalCollected;
  const collectionRate = totalDue > 0 ? (totalCollected / totalDue) * 100 : 0;
  const byClass = Array.from(byClassMap.values()).sort((a, b) => a.classNumber - b.classNumber);

  return { totalDue, totalCollected, totalPending, overdueCount, collectionRate, totalLateFine, byClass };
}

// GET /api/finance/stats?monthYear=2024-09
export async function getFinanceStats(req: AuthRequest, res: Response): Promise<void> {
  const schoolId = requireSchoolId(req, res);
  if (!schoolId) return;

  const monthYear = String(req.query.monthYear ?? '');
  if (!monthYear) {
    send(res, 400, undefined, 'monthYear query param is required');
    return;
  }

  const stats = await computeStatsForMonth(schoolId, monthYear);
  send(res, 200, stats);
}

// =================================================================
// 7. Finance Reports
// =================================================================

// GET /api/finance/reports
export async function getFinanceReports(req: AuthRequest, res: Response): Promise<void> {
  const schoolId = requireSchoolId(req, res);
  if (!schoolId) return;

  const reports = await prisma.financeReport.findMany({
    where: { schoolId },
    orderBy: { monthYear: 'desc' },
  });

  send(res, 200, { reports });
}

const generateReportSchema = z.object({
  monthYear: z.string().min(1).max(20),
});

// POST /api/finance/reports/generate
export async function generateFinanceReport(req: AuthRequest, res: Response): Promise<void> {
  const schoolId = requireSchoolId(req, res);
  if (!schoolId) return;

  const parsed = generateReportSchema.safeParse(req.body);
  if (!parsed.success) {
    send(res, 400, undefined, 'monthYear is required');
    return;
  }
  const { monthYear } = parsed.data;

  const stats = await computeStatsForMonth(schoolId, monthYear);

  const report = await prisma.financeReport.upsert({
    where: { schoolId_monthYear: { schoolId, monthYear } },
    update: {
      totalDue: stats.totalDue,
      totalPaid: stats.totalCollected,
      totalPending: stats.totalPending,
      totalLateFine: stats.totalLateFine,
      status: 'draft',
    },
    create: {
      schoolId,
      monthYear,
      submittedBy: req.user!.userId,
      totalDue: stats.totalDue,
      totalPaid: stats.totalCollected,
      totalPending: stats.totalPending,
      totalLateFine: stats.totalLateFine,
      status: 'draft',
    },
  });

  await auditLog({
    userId: req.user!.userId,
    action: 'FINANCE_REPORT_GENERATE',
    targetTable: 'FinanceReport',
    targetId: report.id,
    meta: { monthYear },
    ip: req.ip,
  });

  send(res, 201, report);
}

// PATCH /api/finance/reports/:id/submit
export async function submitFinanceReport(req: AuthRequest, res: Response): Promise<void> {
  const schoolId = requireSchoolId(req, res);
  if (!schoolId) return;

  const existing = await prisma.financeReport.findFirst({ where: { id: req.params.id, schoolId } });
  if (!existing) {
    send(res, 404, undefined, 'Finance report not found');
    return;
  }

  const report = await prisma.financeReport.update({
    where: { id: existing.id },
    data: { status: 'submitted', submittedAt: new Date() },
  });

  const school = await prisma.school.findUnique({ where: { id: schoolId }, select: { adminId: true } });
  if (school?.adminId) {
    await prisma.notification.create({
      data: {
        userId: school.adminId,
        type: 'FINANCE_REPORT_SUBMITTED',
        message: `Finance report for ${report.monthYear} has been submitted for review.`,
      },
    });
  }

  await auditLog({
    userId: req.user!.userId,
    action: 'FINANCE_REPORT_SUBMIT',
    targetTable: 'FinanceReport',
    targetId: report.id,
    ip: req.ip,
  });

  send(res, 200, report);
}
