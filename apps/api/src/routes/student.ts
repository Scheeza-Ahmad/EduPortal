import { Router } from 'express';
import { verifyToken } from '../middleware/auth';
import { requireRole } from '../middleware/rbac';
import {
  createLeaveRequest,
  getActivities,
  getAiInsights,
  getAttendance,
  getBadges,
  getDashboard,
  getGradeCard,
  getGrades,
  getMyFees,
  getMyLeaveRequests,
  getMySubjects,
  getNotifications,
  getSubjectActivities,
  getSubmissions,
  markNotificationRead,
  submitActivity,
} from '../controllers/student.controller';

const router = Router();

router.use(verifyToken, requireRole('student'));

router.get('/dashboard', getDashboard);

router.get('/activities', getActivities);
router.get('/subjects', getMySubjects);
router.get('/subjects/:subjectId/activities', getSubjectActivities);

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

router.get('/ai-insights', getAiInsights);

export default router;
