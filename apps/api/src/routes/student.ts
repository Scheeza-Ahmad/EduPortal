import { Router } from 'express';
import { verifyToken } from '../middleware/auth';
import { requireRole } from '../middleware/rbac';
import { requireFeature } from '../middleware/featureCheck';
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
router.get('/grade-card', requireFeature('featureReportCards'), getGradeCard);

router.get('/attendance', requireFeature('featureAttendance'), getAttendance);

router.get('/notifications', getNotifications);
router.patch('/notifications/:id/read', markNotificationRead);

router.get('/badges', requireFeature('featureBadges'), getBadges);

router.get('/fees', requireFeature('featureFinance'), getMyFees);

router.post('/leave-request', requireFeature('featureLeaveRequests'), createLeaveRequest);
router.get('/leave-requests', requireFeature('featureLeaveRequests'), getMyLeaveRequests);

router.get('/ai-insights', requireFeature('featureAiInsights'), getAiInsights);

export default router;
