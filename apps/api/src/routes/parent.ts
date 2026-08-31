import { Router } from 'express';
import { verifyToken } from '../middleware/auth';
import { requireRole } from '../middleware/rbac';
import {
  downloadChildReportCard,
  getChildAnnouncements,
  getChildAttendance,
  getChildGrades,
  getChildReportCard,
  getChildTimetable,
  getChildren,
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

export default router;
