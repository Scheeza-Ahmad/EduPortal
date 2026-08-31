import { Router } from 'express';
import { verifyToken } from '../middleware/auth';
import { requireRole } from '../middleware/rbac';
import {
  bulkImportStudents,
  checkTimetableConflict,
  createAnnouncement,
  createCalendarDate,
  createClass,
  createStudent,
  createSubject,
  createTeacher,
  deleteAnnouncement,
  deleteCalendarDate,
  deleteClass,
  deleteStudent,
  deleteSubject,
  deleteTeacher,
  deleteTimetableSlot,
  createParent,
  getAnnouncements,
  getCalendar,
  getClasses,
  getParents,
  getReportCard,
  getStats,
  getStudents,
  getSubjects,
  getTeachers,
  getTimetableForClass,
  linkParentChildren,
  updateClass,
  updateStudent,
  updateSubject,
  updateTeacher,
  upsertTimetableSlot,
} from '../controllers/admin.controller';

const router = Router();

router.use(verifyToken, requireRole('school_admin'));

router.get('/stats', getStats);

// Students
router.get('/students', getStudents);
router.post('/students', createStudent);
router.post('/students/bulk-import', bulkImportStudents);
router.patch('/students/:id', updateStudent);
router.delete('/students/:id', deleteStudent);

// Teachers
router.get('/teachers', getTeachers);
router.post('/teachers', createTeacher);
router.patch('/teachers/:id', updateTeacher);
router.delete('/teachers/:id', deleteTeacher);

// Classes
router.get('/classes', getClasses);
router.post('/classes', createClass);
router.patch('/classes/:id', updateClass);
router.delete('/classes/:id', deleteClass);

// Subjects
router.get('/subjects', getSubjects);
router.post('/subjects', createSubject);
router.patch('/subjects/:id', updateSubject);
router.delete('/subjects/:id', deleteSubject);

// Timetable — /check-conflict must be registered before /:classId so it isn't
// swallowed as a classId value.
router.get('/timetable/check-conflict', checkTimetableConflict);
router.get('/timetable/:classId', getTimetableForClass);
router.post('/timetable', upsertTimetableSlot);
router.delete('/timetable/:slotId', deleteTimetableSlot);

// Announcements
router.get('/announcements', getAnnouncements);
router.post('/announcements', createAnnouncement);
router.delete('/announcements/:id', deleteAnnouncement);

// Report cards
router.get('/report-cards/:studentId', getReportCard);

// Academic calendar
router.get('/calendar', getCalendar);
router.post('/calendar', createCalendarDate);
router.delete('/calendar/:id', deleteCalendarDate);

// Parents
router.get('/parents', getParents);
router.post('/parents', createParent);
router.patch('/parents/:id/children', linkParentChildren);

export default router;
