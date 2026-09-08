import { Router } from 'express';
import { verifyToken } from '../middleware/auth';
import { requireRole } from '../middleware/rbac';
import { requireFeature } from '../middleware/featureCheck';
import {
  createActivity,
  createTeacherAnnouncement,
  createTeacherLeave,
  deleteActivity,
  deleteTeacherAnnouncement,
  getActivities,
  getActivity,
  getAttendanceForDate,
  getAttendanceReport,
  getClassDetail,
  getClassFees,
  getDashboard,
  getFeeDefaulters,
  getGradeSuggestion,
  getMonthlyReport,
  getMyClassAnnouncements,
  getMyClasses,
  getMyTeacherLeaves,
  getMySubjects,
  getReusableActivities,
  getSubmissions,
  getTeacherLeaveRequests,
  getTeacherTimetable,
  gradeSubmission,
  markAttendance,
  publishActivity,
  reviewTeacherLeaveRequest,
  submitMonthlyReport,
  updateActivity,
  upsertMonthlyReport,
} from '../controllers/teacher.controller';

const router = Router();

// A coordinator is still a teacher — they keep their own subjects, mark
// their own attendance, and submit their own monthly report — so they need
// full access here too, not just to /api/coordinator.
router.use(verifyToken, requireRole('teacher', 'coordinator'));

router.get('/dashboard', getDashboard);
router.get('/fee-defaulters', getFeeDefaulters);
router.get('/class-fees', getClassFees);

// Monthly report
router.get('/monthly-report/:monthYear', requireFeature('featureMonthlyReports'), getMonthlyReport);
router.post('/monthly-report', requireFeature('featureMonthlyReports'), upsertMonthlyReport);
router.patch('/monthly-report/:id/submit', requireFeature('featureMonthlyReports'), submitMonthlyReport);

// Activities — /reuse must come before /:id so it isn't swallowed as an id.
router.get('/activities/reuse', getReusableActivities);
router.get('/activities', getActivities);
router.get('/activities/:id', getActivity);
router.get('/activities/:id/grade-suggestion', requireFeature('featureAiInsights'), getGradeSuggestion);
router.post('/activities', createActivity);
router.patch('/activities/:id', updateActivity);
router.delete('/activities/:id', deleteActivity);
router.post('/activities/:id/publish', publishActivity);

// Submissions
router.get('/submissions/:activityId', getSubmissions);
router.patch('/submissions/:id/grade', gradeSubmission);

// Attendance
router.get('/attendance/report/:subjectId', requireFeature('featureAttendance'), getAttendanceReport);
router.get('/attendance/:subjectId/:date', requireFeature('featureAttendance'), getAttendanceForDate);
router.post('/attendance', requireFeature('featureAttendance'), markAttendance);

// My classes & subjects
router.get('/subjects', getMySubjects);
router.get('/classes', getMyClasses);
router.get('/classes/:classId', getClassDetail);
router.get('/timetable', requireFeature('featureTimetable'), getTeacherTimetable);

// Announcements
router.get('/announcements', requireFeature('featureAnnouncements'), getMyClassAnnouncements);
router.post('/announcements', requireFeature('featureAnnouncements'), createTeacherAnnouncement);
router.delete('/announcements/:id', requireFeature('featureAnnouncements'), deleteTeacherAnnouncement);

// Leave Requests
router.get('/leave-requests', requireFeature('featureLeaveRequests'), getTeacherLeaveRequests);
router.patch('/leave-requests/:id/review', requireFeature('featureLeaveRequests'), reviewTeacherLeaveRequest);

// Teacher's own leave — to coordinator (or admin, if the teacher is itself a coordinator)
router.post('/leave', createTeacherLeave);
router.get('/leave', getMyTeacherLeaves);

export default router;
