import { Router } from 'express';
import { verifyToken } from '../middleware/auth';
import { requireRole } from '../middleware/rbac';
import {
  assignAdmin,
  createSchool,
  createSchoolAdmin,
  deleteSchool,
  getAnalytics,
  getAuditLogs,
  getSchoolBranding,
  getSchoolFeatures,
  getSchools,
  getStats,
  getUsers,
  impersonateUser,
  triggerBackup,
  updateSchool,
  updateSchoolBranding,
  updateSchoolFeatures,
} from '../controllers/super.controller';

const router = Router();

router.use(verifyToken, requireRole('super_admin'));

router.get('/stats', getStats);
router.get('/analytics', getAnalytics);

router.get('/users', getUsers);

router.get('/schools', getSchools);
router.post('/schools', createSchool);
router.patch('/schools/:id', updateSchool);
router.delete('/schools/:id', deleteSchool);
router.patch('/schools/:id/admin', assignAdmin);
router.post('/schools/:id/admin/create', createSchoolAdmin);
router.get('/schools/:id/branding', getSchoolBranding);
router.patch('/schools/:id/branding', updateSchoolBranding);
router.get('/schools/:id/features', getSchoolFeatures);
router.patch('/schools/:id/features', updateSchoolFeatures);

router.get('/audit-logs', getAuditLogs);

router.post('/backup', triggerBackup);
router.post('/impersonate/:userId', impersonateUser);

export default router;
