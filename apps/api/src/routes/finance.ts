import { Router } from 'express';
import { verifyToken } from '../middleware/auth';
import { requireRole } from '../middleware/rbac';
import {
  applyDiscount,
  createDiscountPolicy,
  createFeeStructure,
  deleteDiscountPolicy,
  generateFinanceReport,
  getDiscountPolicies,
  getFeeStructure,
  getFinanceReports,
  getFinanceStats,
  getLateFeeRule,
  getReceipt,
  getSchoolSettings,
  getStudentFees,
  recordPayment,
  submitFinanceReport,
  updateDiscountPolicy,
  upsertLateFeeRule,
  upsertSchoolSettings,
} from '../controllers/finance.controller';

const router = Router();

// Every finance route requires the finance or school_admin role.
router.use(verifyToken, requireRole('finance', 'school_admin'));

// School Setup — reads are open to finance/school_admin (router-level check
// above), writes are admin only (stricter check added per-route).
router.get('/setup/settings', getSchoolSettings);
router.post('/setup/settings', requireRole('school_admin'), upsertSchoolSettings);
router.get('/setup/late-fee-rule', getLateFeeRule);
router.post('/setup/late-fee-rule', requireRole('school_admin'), upsertLateFeeRule);

// Discount Policies
router.get('/discount-policies', getDiscountPolicies);
router.post('/discount-policies', createDiscountPolicy);
router.patch('/discount-policies/:id', updateDiscountPolicy);
router.delete('/discount-policies/:id', deleteDiscountPolicy);

// Fee Structure
router.get('/fee-structure', getFeeStructure);
router.post('/fee-structure', createFeeStructure);

// Student Fees
router.get('/student-fees', getStudentFees);
router.patch('/student-fees/:id/discount', applyDiscount);

// Payments — /receipt/:paymentId is a GET, distinct from the POST below, so
// there's no route-order ambiguity between them.
router.post('/payments/:studentFeeId', recordPayment);
router.get('/payments/receipt/:paymentId', getReceipt);

// Finance Stats
router.get('/stats', getFinanceStats);

// Finance Reports
router.get('/reports', getFinanceReports);
router.post('/reports/generate', generateFinanceReport);
router.patch('/reports/:id/submit', submitFinanceReport);

export default router;
