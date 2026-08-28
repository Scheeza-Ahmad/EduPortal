import { Router } from 'express';
import { verifyToken } from '../middleware/auth';
import { requireRole } from '../middleware/rbac';
import {
  assignAdmin,
  createSchool,
  deleteSchool,
  getAuditLogs,
  getSchools,
  getStats,
  impersonateUser,
  toggleFeatures,
  triggerBackup,
  updateSchool,
} from '../controllers/super.controller';

const router = Router();

router.use(verifyToken, requireRole('super_admin'));

router.get('/stats', getStats);

router.get('/schools', getSchools);
router.post('/schools', createSchool);
router.patch('/schools/:id', updateSchool);
router.delete('/schools/:id', deleteSchool);
router.post('/schools/:id/assign-admin', assignAdmin);
router.patch('/schools/:id/features', toggleFeatures);

router.get('/audit-logs', getAuditLogs);

router.post('/backup', triggerBackup);
router.post('/impersonate/:userId', impersonateUser);

export default router;
