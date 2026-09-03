import { Router } from 'express';
import { verifyToken } from '../middleware/auth';
import { requireRole } from '../middleware/rbac';
import {
  approveWingReport,
  assignCoordinator,
  bulkImportStudents,
  checkTimetableConflict,
  createAnnouncement,
  createCalendarDate,
  createClass,
  createConsentForm,
  createCoordinator,
  createFinanceUser,
  createStudent,
  createSubject,
  createTeacher,
  deleteAnnouncement,
  deleteCalendarDate,
  deleteClass,
  deleteConsentForm,
  deleteStudent,
  deleteSubject,
  deleteTeacher,
  deleteTimetableSlot,
  createParent,
  getAdminLeaveRequests,
  getAnnouncements,
  getAtRiskStudents,
  getBulkReportCards,
  getCalendar,
  getClasses,
  getConsentFormResponses,
  getConsentForms,
  getCoordinators,
  globalSearch,
  getParents,
  getReportCard,
  getStats,
  getStatsTrend,
  getStudents,
  getSubjects,
  getTeachers,
  getTimetableForClass,
  getWingReports,
  linkParentChildren,
  rejectWingReport,
  removeCoordinator,
  reviewAdminLeaveRequest,
  updateClass,
  updateStudent,
  updateSubject,
  updateTeacher,
  upsertTimetableSlot,
} from '../controllers/admin.controller';

const router = Router();

router.use(verifyToken, requireRole('school_admin'));

router.get('/stats', getStats);
router.get('/stats/trend', getStatsTrend);

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
router.patch('/teachers/:id/coordinator', assignCoordinator);

// Coordinators (dedicated admin page)
router.get('/coordinators', getCoordinators);
router.post('/coordinators', createCoordinator);
router.delete('/coordinators/:id', removeCoordinator);

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

// Report cards — /bulk/:classId must come before /:studentId so "bulk" isn't
// swallowed as a studentId value.
router.get('/report-cards/bulk/:classId', getBulkReportCards);
router.get('/report-cards/:studentId', getReportCard);

// Academic calendar
router.get('/calendar', getCalendar);
router.post('/calendar', createCalendarDate);
router.delete('/calendar/:id', deleteCalendarDate);

// Parents
router.get('/parents', getParents);
router.post('/parents', createParent);
router.patch('/parents/:id/children', linkParentChildren);

// Finance user management
router.post('/finance/create-user', createFinanceUser);

// Wing reports (submitted by coordinators)
router.get('/wing-reports', getWingReports);
router.patch('/wing-reports/:id/approve', approveWingReport);
router.patch('/wing-reports/:id/reject', rejectWingReport);

// Leave requests
router.get('/leave-requests', getAdminLeaveRequests);
router.patch('/leave-requests/:id/review', reviewAdminLeaveRequest);

// Consent forms — /:id/responses must come before nothing conflicting here
// since DELETE and GET on /:id don't overlap with /:id/responses.
router.get('/consent-forms', getConsentForms);
router.post('/consent-forms', createConsentForm);
router.delete('/consent-forms/:id', deleteConsentForm);
router.get('/consent-forms/:id/responses', getConsentFormResponses);

// AI / analytics
router.get('/at-risk-students', getAtRiskStudents);
router.get('/search', globalSearch);

export default router;
