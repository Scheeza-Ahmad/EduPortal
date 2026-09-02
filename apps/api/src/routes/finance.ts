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
  getOverdueStudents,
  getPaymentActivity,
  getReceipt,
  getRecentPayments,
  getSchoolInfo,
  getSchoolSettings,
  getStatsTrend,
  getStudentFees,
  recordPayment,
  submitFinanceReport,
  updateDiscountPolicy,
  upsertLateFeeRule,
  upsertSchoolSettings,
} from '../controllers/finance.controller';

const router = Router();

// The Finance module is fully separate from the admin panel now — school_admin
// only creates finance-officer accounts (POST /api/admin/finance/create-user),
// they don't get into finance data/operations themselves.
router.use(verifyToken, requireRole('finance'));

router.get('/school-info', getSchoolInfo);

// School Setup
router.get('/setup/settings', getSchoolSettings);
router.post('/setup/settings', upsertSchoolSettings);
router.patch('/setup/settings', upsertSchoolSettings);
router.get('/setup/late-fee-rule', getLateFeeRule);
router.post('/setup/late-fee-rule', upsertLateFeeRule);
router.patch('/setup/late-fee-rule', upsertLateFeeRule);

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
router.get('/stats/trend', getStatsTrend);
router.get('/stats/payment-activity', getPaymentActivity);
router.get('/stats/overdue', getOverdueStudents);
router.get('/stats/recent-payments', getRecentPayments);

// Finance Reports
router.get('/reports', getFinanceReports);
router.post('/reports/generate', generateFinanceReport);
router.patch('/reports/:id/submit', submitFinanceReport);

export default router;
