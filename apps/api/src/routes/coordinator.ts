import { Router } from 'express';
import { verifyToken } from '../middleware/auth';
import { requireRole } from '../middleware/rbac';
import { requireFeature } from '../middleware/featureCheck';
import {
  createCoordinatorAnnouncement,
  deleteCoordinatorAnnouncement,
  getCoordinatorAnnouncements,
  getDashboard,
  getMonthlyReports,
  getStudentsOverview,
  getTeacherDetail,
  getTeacherLeaves,
  getTeachers,
  getWingReport,
  remindTeacher,
  reviewReport,
  reviewTeacherLeave,
  submitWingReport,
} from '../controllers/coordinator.controller';

const router = Router();

router.use(verifyToken, requireRole('coordinator'), requireFeature('featureCoordinator'));

router.get('/dashboard', getDashboard);

// Teachers — /:id/remind must come before /:id so it isn't swallowed.
router.get('/teachers', getTeachers);
router.post('/teachers/:id/remind', remindTeacher);
router.get('/teachers/:id', getTeacherDetail);

// Monthly reports
router.get('/reports', getMonthlyReports);
router.patch('/reports/:id/review', reviewReport);

// Students overview
router.get('/students', getStudentsOverview);

// Announcements
router.get('/announcements', getCoordinatorAnnouncements);
router.post('/announcements', createCoordinatorAnnouncement);
router.delete('/announcements/:id', deleteCoordinatorAnnouncement);

// Wing report (submitted to admin)
router.get('/wing-report/:monthYear', getWingReport);
router.post('/wing-report', submitWingReport);

// Teacher leave requests — pending leave from teachers in this coordinator's wing
router.get('/teacher-leaves', getTeacherLeaves);
router.patch('/teacher-leaves/:id/review', reviewTeacherLeave);

export default router;
