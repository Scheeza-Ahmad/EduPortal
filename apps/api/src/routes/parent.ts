import { Router } from 'express';
import { verifyToken } from '../middleware/auth';
import { requireRole } from '../middleware/rbac';
import {
  createLeaveApplication,
  downloadChildReportCard,
  getChildAnnouncements,
  getChildAttendance,
  getChildFees,
  getChildGrades,
  getChildReportCard,
  getChildTimetable,
  getChildren,
  getParentConsentForms,
  getParentNotifications,
  markParentNotificationRead,
  respondToConsentForm,
} from '../controllers/parent.controller';

const router = Router();

router.use(verifyToken, requireRole('parent'));

router.get('/children', getChildren);

router.get('/child/:studentId/grades', getChildGrades);
// /pdf must be registered before the plain report-card route so it isn't
// swallowed as part of the same path.
router.get('/child/:studentId/report-card/pdf', downloadChildReportCard);
router.get('/child/:studentId/report-card', getChildReportCard);
router.get('/child/:studentId/attendance', getChildAttendance);
router.get('/child/:studentId/timetable', getChildTimetable);
router.get('/child/:studentId/announcements', getChildAnnouncements);
router.get('/child/:studentId/fees', getChildFees);

router.post('/leave-application', createLeaveApplication);

router.get('/notifications', getParentNotifications);
router.patch('/notifications/:id/read', markParentNotificationRead);

router.get('/consent-forms', getParentConsentForms);
router.post('/consent-forms/:id/respond', respondToConsentForm);

export default router;
