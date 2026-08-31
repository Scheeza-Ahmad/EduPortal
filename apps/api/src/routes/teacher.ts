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
  getDashboard,
  getFeeDefaulters,
  getMyClassAnnouncements,
  getMyClasses,
  getMySubjects,
  getReusableActivities,
  getSubmissions,
  gradeSubmission,
  markAttendance,
  publishActivity,
  updateActivity,
} from '../controllers/teacher.controller';

const router = Router();

router.use(verifyToken, requireRole('teacher'));

router.get('/dashboard', getDashboard);
router.get('/fee-defaulters', getFeeDefaulters);

// Activities — /reuse must come before /:id so it isn't swallowed as an id.
router.get('/activities/reuse', getReusableActivities);
router.get('/activities', getActivities);
router.get('/activities/:id', getActivity);
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

// Announcements
router.get('/announcements', getMyClassAnnouncements);
router.post('/announcements', createTeacherAnnouncement);
router.delete('/announcements/:id', deleteTeacherAnnouncement);

export default router;
