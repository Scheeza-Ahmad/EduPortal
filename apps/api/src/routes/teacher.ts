import { Router } from 'express';
import { verifyToken } from '../middleware/auth';
import { requireRole } from '../middleware/rbac';
import {
  createActivity,
  createTeacherAnnouncement,
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
  getMySubjects,
  getReusableActivities,
  getSubmissions,
  getTeacherLeaveRequests,
  getTeacherTimetable,
  gradeSubmission,
  markAttendance,
  messageParent,
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
router.post('/students/:studentId/message-parent', messageParent);

// Monthly report
router.get('/monthly-report/:monthYear', getMonthlyReport);
router.post('/monthly-report', upsertMonthlyReport);
router.patch('/monthly-report/:id/submit', submitMonthlyReport);

// Activities — /reuse must come before /:id so it isn't swallowed as an id.
router.get('/activities/reuse', getReusableActivities);
router.get('/activities', getActivities);
router.get('/activities/:id', getActivity);
router.get('/activities/:id/grade-suggestion', getGradeSuggestion);
router.post('/activities', createActivity);
router.patch('/activities/:id', updateActivity);
router.delete('/activities/:id', deleteActivity);
router.post('/activities/:id/publish', publishActivity);

// Submissions
router.get('/submissions/:activityId', getSubmissions);
router.patch('/submissions/:id/grade', gradeSubmission);

// Attendance
router.get('/attendance/report/:subjectId', getAttendanceReport);
router.get('/attendance/:subjectId/:date', getAttendanceForDate);
router.post('/attendance', markAttendance);

// My classes & subjects
router.get('/subjects', getMySubjects);
router.get('/classes', getMyClasses);
router.get('/classes/:classId', getClassDetail);
router.get('/timetable', getTeacherTimetable);

// Announcements
router.get('/announcements', getMyClassAnnouncements);
router.post('/announcements', createTeacherAnnouncement);
router.delete('/announcements/:id', deleteTeacherAnnouncement);

// Leave Requests
router.get('/leave-requests', getTeacherLeaveRequests);
router.patch('/leave-requests/:id/review', reviewTeacherLeaveRequest);

export default router;
