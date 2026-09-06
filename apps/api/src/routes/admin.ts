import { Router } from 'express';
import { verifyToken } from '../middleware/auth';
import { requireRole } from '../middleware/rbac';
import { requireFeature } from '../middleware/featureCheck';
import {
  approveWingReport,
  assignCoordinator,
  autoGenerateTimetable,
  bulkImportStudents,
  bulkImportStudentsByName,
  checkTimetableConflict,
  createAnnouncement,
  createCalendarDate,
  createClass,
  createClassWithSubjects,
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
  deactivateFinanceUser,
  addTeacherSubjectPool,
  getAdminLeaveRequests,
  getAnnouncements,
  getAtRiskStudents,
  getBulkReportCards,
  getCalendar,
  getClasses,
  getConsentFormResponses,
  getConsentForms,
  getCoordinators,
  getFinanceUsers,
  getSubjectAvailability,
  getSubjectPoolTeachers,
  getTeacherSubjectPool,
  getTimetableSettings,
  globalSearch,
  getParents,
  getReportCard,
  getSchoolBrandingSelf,
  getSchoolFeaturesSelf,
  getStaffLeaves,
  getStats,
  getStatsTrend,
  getStudents,
  getSubjects,
  getTeachers,
  getTimetableForClass,
  getWingReports,
  linkParentChildren,
  reactivateFinanceUser,
  rejectWingReport,
  removeCoordinator,
  removeTeacherSubjectPool,
  reviewAdminLeaveRequest,
  updateClass,
  updateFinanceUser,
  updateSchoolBrandingSelf,
  updateTimetableSettings,
  reviewStaffLeave,
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
router.post('/students/bulk-import-names', bulkImportStudentsByName);
router.patch('/students/:id', updateStudent);
router.delete('/students/:id', deleteStudent);

// Teachers
router.get('/teachers', getTeachers);
router.post('/teachers', createTeacher);
router.patch('/teachers/:id', updateTeacher);
router.delete('/teachers/:id', deleteTeacher);
router.patch('/teachers/:id/coordinator', requireFeature('featureCoordinator'), assignCoordinator);
router.get('/teachers/:id/subjects', getTeacherSubjectPool);
router.post('/teachers/:id/subjects', addTeacherSubjectPool);
router.delete('/teachers/:id/subjects/:subjectId', removeTeacherSubjectPool);

// Coordinators (dedicated admin page)
router.get('/coordinators', requireFeature('featureCoordinator'), getCoordinators);
router.post('/coordinators', requireFeature('featureCoordinator'), createCoordinator);
router.delete('/coordinators/:id', requireFeature('featureCoordinator'), removeCoordinator);

// Classes
router.get('/classes', getClasses);
router.post('/classes', createClass);
router.post('/classes/section', createClassWithSubjects);
router.patch('/classes/:id', updateClass);
router.delete('/classes/:id', deleteClass);

// Subjects — /availability and /teachers must be registered before /:id so
// they aren't swallowed as an id value.
router.get('/subjects/availability', getSubjectAvailability);
router.get('/subjects/teachers', getSubjectPoolTeachers);
router.get('/subjects', getSubjects);
router.post('/subjects', createSubject);
router.patch('/subjects/:id', updateSubject);
router.delete('/subjects/:id', deleteSubject);

// Timetable — /check-conflict must be registered before /:classId so it isn't
// swallowed as a classId value.
router.get('/timetable/check-conflict', requireFeature('featureTimetable'), checkTimetableConflict);
router.post('/timetable/auto-generate', requireFeature('featureTimetable'), autoGenerateTimetable);
router.get('/timetable/:classId', requireFeature('featureTimetable'), getTimetableForClass);
router.post('/timetable', requireFeature('featureTimetable'), upsertTimetableSlot);
router.delete('/timetable/:slotId', requireFeature('featureTimetable'), deleteTimetableSlot);

// Announcements
router.get('/announcements', requireFeature('featureAnnouncements'), getAnnouncements);
router.post('/announcements', requireFeature('featureAnnouncements'), createAnnouncement);
router.delete('/announcements/:id', requireFeature('featureAnnouncements'), deleteAnnouncement);

// Report cards — /bulk/:classId must come before /:studentId so "bulk" isn't
// swallowed as a studentId value.
router.get('/report-cards/bulk/:classId', requireFeature('featureReportCards'), getBulkReportCards);
router.get('/report-cards/:studentId', requireFeature('featureReportCards'), getReportCard);

// Academic calendar
router.get('/calendar', requireFeature('featureCalendar'), getCalendar);
router.post('/calendar', requireFeature('featureCalendar'), createCalendarDate);
router.delete('/calendar/:id', requireFeature('featureCalendar'), deleteCalendarDate);

// Parents
router.get('/parents', getParents);
router.post('/parents', createParent);
router.patch('/parents/:id/children', linkParentChildren);

// Finance user management
router.post('/finance/create-user', requireFeature('featureFinance'), createFinanceUser);
router.get('/finance/users', requireFeature('featureFinance'), getFinanceUsers);
router.patch('/finance/users/:id', requireFeature('featureFinance'), updateFinanceUser);
router.patch('/finance/users/:id/deactivate', requireFeature('featureFinance'), deactivateFinanceUser);
router.patch('/finance/users/:id/reactivate', requireFeature('featureFinance'), reactivateFinanceUser);

// Wing reports (submitted by coordinators)
router.get('/wing-reports', requireFeature('featureCoordinator'), getWingReports);
router.patch('/wing-reports/:id/approve', requireFeature('featureCoordinator'), approveWingReport);
router.patch('/wing-reports/:id/reject', requireFeature('featureCoordinator'), rejectWingReport);

// Leave requests
router.get('/leave-requests', requireFeature('featureLeaveRequests'), getAdminLeaveRequests);
router.patch('/leave-requests/:id/review', requireFeature('featureLeaveRequests'), reviewAdminLeaveRequest);

// Consent forms — /:id/responses must come before nothing conflicting here
// since DELETE and GET on /:id don't overlap with /:id/responses.
router.get('/consent-forms', requireFeature('featureConsentForms'), getConsentForms);
router.post('/consent-forms', requireFeature('featureConsentForms'), createConsentForm);
router.delete('/consent-forms/:id', requireFeature('featureConsentForms'), deleteConsentForm);
router.get('/consent-forms/:id/responses', requireFeature('featureConsentForms'), getConsentFormResponses);

// AI / analytics
router.get('/at-risk-students', requireFeature('featureAiInsights'), getAtRiskStudents);
router.get('/search', globalSearch);

// School branding — refines what super admin initially set
router.get('/school-settings/branding', getSchoolBrandingSelf);
router.patch('/school-settings/branding', updateSchoolBrandingSelf);

// School features — read-only for school_admin; only super admin can change these
router.get('/school-settings/features', getSchoolFeaturesSelf);

// Timetable settings
router.get('/school-settings/timetable', getTimetableSettings);
router.patch('/school-settings/timetable', updateTimetableSettings);

// Staff leaves — teacher leaves reviewed by coordinators + coordinators' own leave
router.get('/staff-leaves', getStaffLeaves);
router.patch('/staff-leaves/:id/review', reviewStaffLeave);

export default router;
