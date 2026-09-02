import { Router } from 'express';
import { verifyToken } from '../middleware/auth';
import { requireRole } from '../middleware/rbac';
import {
  createLeaveRequest,
  getActivities,
  getAttendance,
  getBadges,
  getDashboard,
  getGradeCard,
  getGrades,
  getMyFees,
  getMyLeaveRequests,
  getNotifications,
  getSubmissions,
  markNotificationRead,
  submitActivity,
} from '../controllers/student.controller';

const router = Router();

router.use(verifyToken, requireRole('student'));

router.get('/dashboard', getDashboard);

router.get('/activities', getActivities);

router.post('/submit/:activityId', submitActivity);
router.get('/submissions', getSubmissions);

router.get('/grades', getGrades);
router.get('/grade-card', getGradeCard);

router.get('/attendance', getAttendance);

router.get('/notifications', getNotifications);
router.patch('/notifications/:id/read', markNotificationRead);

router.get('/badges', getBadges);

router.get('/fees', getMyFees);

router.post('/leave-request', createLeaveRequest);
router.get('/leave-requests', getMyLeaveRequests);

export default router;
