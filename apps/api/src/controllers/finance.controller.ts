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
// School Info (read-only — used to prefill the setup wizard)
// GET /api/finance/school-info
// =================================================================

export async function getSchoolInfo(req: AuthRequest, res: Response): Promise<void> {
  const schoolId = requireSchoolId(req, res);
  if (!schoolId) return;

  const school = await prisma.school.findUnique({ where: { id: schoolId }, select: { id: true, name: true } });
  if (!school) {
    send(res, 404, undefined, 'School not found');
    return;
  }

  send(res, 200, school);
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
  phone: z.string().max(40).optional().nullable(),
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

// POST /api/finance/fee-structure/:id/sync — catches up students who joined
// the class after this structure was created (and so never got a StudentFee).
export async function syncFeeStructure(req: AuthRequest, res: Response): Promise<void> {
  const schoolId = requireSchoolId(req, res);
  if (!schoolId) return;

  const structure = await prisma.feeStructure.findFirst({ where: { id: req.params.id, schoolId } });
  if (!structure) {
    send(res, 404, undefined, 'Fee structure not found');
    return;
  }

  const studentsInClass = await prisma.studentProfile.findMany({
    where: { class: { schoolId, number: structure.classNumber } },
    select: { userId: true },
  });

  const existingFees = await prisma.studentFee.findMany({
    where: { feeStructureId: structure.id },
    select: { studentId: true },
  });
  const alreadyHasFee = new Set(existingFees.map((f) => f.studentId));
  const missingStudents = studentsInClass.filter((s) => !alreadyHasFee.has(s.userId));

  let syncedCount = 0;
  if (missingStudents.length > 0) {
    const created = await prisma.studentFee.createMany({
      data: missingStudents.map((s) => ({
        studentId: s.userId,
        feeStructureId: structure.id,
        schoolId,
        discountPercent: 0,
        baseFee: structure.baseFee,
        discountAmount: 0,
        netPayable: structure.baseFee,
        paidAmount: 0,
        lateFine: 0,
        totalDue: structure.baseFee,
        status: 'unpaid' as FeeStatus,
        dueDate: structure.dueDate,
      })),
      skipDuplicates: true,
    });
    syncedCount = created.count;
  }

  await auditLog({
    userId: req.user!.userId,
    action: 'FEE_STRUCTURE_SYNC',
    targetTable: 'FeeStructure',
    targetId: structure.id,
    meta: { syncedCount },
    ip: req.ip,
  });

  send(res, 200, { syncedCount });
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

  // Only full settlement is accepted — no partial payments. Validated
  // against the freshly recalculated totalDue (net payable + this payment's
  // late fine), not the possibly-stale value already stored on the record.
  // Float amounts compared with a small epsilon rather than strict equality.
  const remaining = totalDue - studentFee.paidAmount;
  if (Math.abs(amount - remaining) > 0.01) {
    send(res, 400, undefined, `Full payment required. Amount must be exactly PKR ${remaining}`);
    return;
  }

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
          student: {
            select: {
              name: true,
              studentProfile: {
                select: { rollNo: true, class: { select: { number: true, section: true } } },
              },
            },
          },
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
  const profile = payment.studentFee.student.studentProfile;

  send(res, 200, {
    receiptNumber: payment.receiptNumber,
    paymentDate: payment.paymentDate,
    amount: payment.amount,
    notes: payment.notes,
    monthYear: payment.studentFee.feeStructure.monthYear,
    student: {
      name: payment.studentFee.student.name,
      rollNo: profile?.rollNo ?? '—',
      class: profile?.class.number ?? payment.studentFee.feeStructure.classNumber,
      section: profile?.class.section ?? '—',
    },
    studentFee: {
      baseFee: payment.studentFee.baseFee,
      discountPercent: payment.studentFee.discountPercent,
      discountAmount: payment.studentFee.discountAmount,
      netPayable: payment.studentFee.netPayable,
      lateFine: payment.studentFee.lateFine,
      totalDue: payment.studentFee.totalDue,
      paidAmount: payment.studentFee.paidAmount,
      status: payment.studentFee.status,
    },
    school: {
      name: school?.name ?? '',
      address: settings?.address ?? null,
      phone: settings?.phone ?? null,
      invoiceFooterText: settings?.invoiceFooterText ?? null,
      invoicePrefix: settings?.invoicePrefix ?? 'INV',
    },
    recordedByName: payment.recordedByUser.name,
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
  const statusCounts = { paid: 0, partial: 0, unpaid: 0, overdue: 0 };

  for (const fee of studentFees) {
    totalDue += fee.totalDue;
    totalCollected += fee.paidAmount;
    totalLateFine += fee.lateFine;
    if (fee.status === 'overdue') overdueCount += 1;
    statusCounts[fee.status] += 1;

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

  return {
    totalDue,
    totalCollected,
    totalPending,
    overdueCount,
    collectionRate,
    totalLateFine,
    byClass,
    statusCounts,
  };
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

function lastNMonths(n: number): { monthYear: string; monthLabel: string }[] {
  const now = new Date();
  const months: { monthYear: string; monthLabel: string }[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push({
      monthYear: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`,
      monthLabel: d.toLocaleString('en-US', { month: 'short' }),
    });
  }
  return months;
}

// GET /api/finance/stats/trend?months=6
export async function getStatsTrend(req: AuthRequest, res: Response): Promise<void> {
  const schoolId = requireSchoolId(req, res);
  if (!schoolId) return;

  const months = Math.min(24, Math.max(1, parseInt(String(req.query.months ?? '6'), 10) || 6));
  const periods = lastNMonths(months);

  const trend = [];
  for (const period of periods) {
    const stats = await computeStatsForMonth(schoolId, period.monthYear);
    trend.push({
      month: period.monthYear,
      monthLabel: period.monthLabel,
      totalDue: stats.totalDue,
      totalCollected: stats.totalCollected,
      totalPending: stats.totalPending,
    });
  }

  send(res, 200, { trend });
}

// GET /api/finance/stats/payment-activity?days=7
export async function getPaymentActivity(req: AuthRequest, res: Response): Promise<void> {
  const schoolId = requireSchoolId(req, res);
  if (!schoolId) return;

  const days = Math.min(30, Math.max(1, parseInt(String(req.query.days ?? '7'), 10) || 7));

  const start = new Date();
  start.setDate(start.getDate() - (days - 1));
  start.setHours(0, 0, 0, 0);
  const end = new Date();
  end.setHours(23, 59, 59, 999);

  const payments = await prisma.feePayment.findMany({
    where: { schoolId, paymentDate: { gte: start, lte: end } },
    select: { paymentDate: true },
  });

  // Bucketed by UTC calendar day — consistent with how paymentDate is stored.
  const counts = new Map<string, number>();
  for (let i = 0; i < days; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    counts.set(d.toISOString().slice(0, 10), 0);
  }
  for (const p of payments) {
    const key = p.paymentDate.toISOString().slice(0, 10);
    if (counts.has(key)) counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  const activity = Array.from(counts.entries()).map(([date, count]) => ({
    date,
    dayLabel: new Date(`${date}T00:00:00Z`).toLocaleString('en-US', { weekday: 'short', timeZone: 'UTC' }),
    count,
  }));

  send(res, 200, { activity });
}

// GET /api/finance/stats/overdue
export async function getOverdueStudents(req: AuthRequest, res: Response): Promise<void> {
  const schoolId = requireSchoolId(req, res);
  if (!schoolId) return;

  const fees = await prisma.studentFee.findMany({
    where: { schoolId, status: 'overdue' },
    include: {
      student: {
        select: {
          name: true,
          studentProfile: { select: { class: { select: { number: true, section: true } } } },
        },
      },
    },
    orderBy: { dueDate: 'asc' },
  });

  const now = Date.now();
  const overdue = fees.map((f) => ({
    studentName: f.student.name,
    className: f.student.studentProfile?.class.number ?? null,
    section: f.student.studentProfile?.class.section ?? null,
    totalDue: f.totalDue,
    paidAmount: f.paidAmount,
    dueDate: f.dueDate,
    daysOverdue: Math.floor((now - f.dueDate.getTime()) / (1000 * 60 * 60 * 24)),
  }));

  send(res, 200, { overdue });
}

// GET /api/finance/stats/recent-payments?limit=10
export async function getRecentPayments(req: AuthRequest, res: Response): Promise<void> {
  const schoolId = requireSchoolId(req, res);
  if (!schoolId) return;

  const limit = Math.min(50, Math.max(1, parseInt(String(req.query.limit ?? '10'), 10) || 10));

  const payments = await prisma.feePayment.findMany({
    where: { schoolId },
    orderBy: { paymentDate: 'desc' },
    take: limit,
    include: { studentFee: { include: { student: { select: { name: true } } } } },
  });

  send(res, 200, {
    payments: payments.map((p) => ({
      studentName: p.studentFee.student.name,
      amount: p.amount,
      paymentDate: p.paymentDate,
      receiptNumber: p.receiptNumber,
    })),
  });
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

interface ReportStudentRow {
  name: string;
  rollNo: string;
  baseFee: number;
  discount: number;
  netPayable: number;
  lateFine: number;
  totalDue: number;
  paidAmount: number;
  status: FeeStatus;
  lastPaymentDate: string | null;
  receiptNumber: string | null;
}

interface ReportClassGroup {
  classNumber: number;
  section: string;
  totalDue: number;
  totalPaid: number;
  totalPending: number;
  studentCount: number;
  students: ReportStudentRow[];
}

/**
 * Per-student, per-class breakdown for a month — stored as FinanceReport.meta
 * so a generated report stays a frozen snapshot even if fees are edited later.
 */
async function computeReportDetail(schoolId: string, monthYear: string): Promise<ReportClassGroup[]> {
  const studentFees = await prisma.studentFee.findMany({
    where: { schoolId, feeStructure: { monthYear } },
    include: {
      student: {
        select: {
          name: true,
          studentProfile: {
            select: { rollNo: true, class: { select: { number: true, section: true } } },
          },
        },
      },
      feeStructure: { select: { classNumber: true } },
      payments: { orderBy: { paymentDate: 'desc' }, take: 1, select: { paymentDate: true, receiptNumber: true } },
    },
  });

  const groups = new Map<string, ReportClassGroup>();

  for (const fee of studentFees) {
    const profile = fee.student.studentProfile;
    const classNumber = profile?.class.number ?? fee.feeStructure.classNumber;
    const section = profile?.class.section ?? '—';
    const key = `${classNumber}-${section}`;

    const group = groups.get(key) ?? {
      classNumber,
      section,
      totalDue: 0,
      totalPaid: 0,
      totalPending: 0,
      studentCount: 0,
      students: [],
    };

    const lastPayment = fee.payments[0] ?? null;

    group.totalDue += fee.totalDue;
    group.totalPaid += fee.paidAmount;
    group.totalPending += fee.totalDue - fee.paidAmount;
    group.studentCount += 1;
    group.students.push({
      name: fee.student.name,
      rollNo: profile?.rollNo ?? '—',
      baseFee: fee.baseFee,
      discount: fee.discountAmount,
      netPayable: fee.netPayable,
      lateFine: fee.lateFine,
      totalDue: fee.totalDue,
      paidAmount: fee.paidAmount,
      status: fee.status,
      lastPaymentDate: lastPayment ? lastPayment.paymentDate.toISOString() : null,
      receiptNumber: lastPayment ? lastPayment.receiptNumber : null,
    });

    groups.set(key, group);
  }

  return Array.from(groups.values()).sort(
    (a, b) => a.classNumber - b.classNumber || a.section.localeCompare(b.section)
  );
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
  const byClass = await computeReportDetail(schoolId, monthYear);
  const meta = { byClass } as unknown as Prisma.InputJsonValue;

  const report = await prisma.financeReport.upsert({
    where: { schoolId_monthYear: { schoolId, monthYear } },
    update: {
      totalDue: stats.totalDue,
      totalPaid: stats.totalCollected,
      totalPending: stats.totalPending,
      totalLateFine: stats.totalLateFine,
      status: 'draft',
      meta,
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
      meta,
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
