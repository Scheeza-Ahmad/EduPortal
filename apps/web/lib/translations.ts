export type Language = 'en' | 'ur';

type TranslationKey = keyof typeof translations;

export const translations = {
  dashboard: { en: 'Dashboard', ur: 'ڈیش بورڈ' },
  students: { en: 'Students', ur: 'طلباء' },
  teachers: { en: 'Teachers', ur: 'اساتذہ' },
  coordinators: { en: 'Coordinators', ur: 'کوآرڈینیٹرز' },
  classes: { en: 'Classes', ur: 'کلاسز' },
  subjects: { en: 'Subjects', ur: 'مضامین' },
  timetable: { en: 'Timetable', ur: 'ٹائم ٹیبل' },
  attendance: { en: 'Attendance', ur: 'حاضری' },
  grades: { en: 'Grades', ur: 'نمبرات' },
  fees: { en: 'Fees', ur: 'فیس' },
  reportCards: { en: 'Report Cards', ur: 'رپورٹ کارڈ' },
  reports: { en: 'Reports', ur: 'رپورٹس' },
  announcements: { en: 'Announcements', ur: 'اعلانات' },
  calendar: { en: 'Calendar', ur: 'کیلنڈر' },
  leaveRequests: { en: 'Leave Requests', ur: 'رخصت کی درخواستیں' },
  consentForms: { en: 'Consent Forms', ur: 'رضامندی فارم' },
  financeOfficer: { en: 'Finance Officer', ur: 'فنانس آفیسر' },
  atRiskStudents: { en: 'At-Risk Students', ur: 'خطرے میں طلباء' },
  logout: { en: 'Logout', ur: 'لاگ آوٹ' },
  save: { en: 'Save', ur: 'محفوظ کریں' },
  cancel: { en: 'Cancel', ur: 'منسوخ' },
  search: { en: 'Search', ur: 'تلاش' },
  welcome: { en: 'Welcome', ur: 'خوش آمدید' },
  activities: { en: 'Activities', ur: 'سرگرمیاں' },
  submissions: { en: 'Submissions', ur: 'جمع شدہ کام' },
  badges: { en: 'Badges', ur: 'بیجز' },
  achievements: { en: 'Achievements', ur: 'کامیابیاں' },
  notifications: { en: 'Notifications', ur: 'اطلاعات' },
  messages: { en: 'Messages', ur: 'پیغامات' },
  monthlyReport: { en: 'Monthly Report', ur: 'ماہانہ رپورٹ' },
  wingReport: { en: 'Wing Report', ur: 'ونگ رپورٹ' },
  parents: { en: 'Parents', ur: 'والدین' },
  schools: { en: 'Schools', ur: 'اسکولز' },
  auditLog: { en: 'Audit Log', ur: 'آڈٹ لاگ' },
  backup: { en: 'Backup', ur: 'بیک اپ' },
  setup: { en: 'Setup', ur: 'ترتیب' },
  feeStructure: { en: 'Fee Structure', ur: 'فیس ڈھانچہ' },
  studentFees: { en: 'Student Fees', ur: 'طلباء کی فیس' },
  insights: { en: 'AI Insights', ur: 'اے آئی بصیرت' },
  loading: { en: 'Loading...', ur: 'لوڈ ہو رہا ہے...' },
  edit: { en: 'Edit', ur: 'ترمیم' },
  delete: { en: 'Delete', ur: 'حذف کریں' },
  approve: { en: 'Approve', ur: 'منظور کریں' },
  reject: { en: 'Reject', ur: 'مسترد کریں' },
  myClasses: { en: 'My Classes', ur: 'میری کلاسیں' },
  classFees: { en: 'Class Fees', ur: 'کلاس فیس' },
  reportCard: { en: 'Report Card', ur: 'رپورٹ کارڈ' },
  leave: { en: 'Leave', ur: 'رخصت' },

  // Actions
  add: { en: 'Add', ur: 'شامل کریں' },
  filter: { en: 'Filter', ur: 'فلٹر' },
  download: { en: 'Download', ur: 'ڈاؤن لوڈ' },
  submit: { en: 'Submit', ur: 'جمع کریں' },
  create: { en: 'Create', ur: 'بنائیں' },
  update: { en: 'Update', ur: 'اپ ڈیٹ' },
  view: { en: 'View', ur: 'دیکھیں' },
  settings: { en: 'Settings', ur: 'ترتیبات' },

  // Common labels
  name: { en: 'Name', ur: 'نام' },
  email: { en: 'Email', ur: 'ای میل' },
  password: { en: 'Password', ur: 'پاس ورڈ' },
  phone: { en: 'Phone', ur: 'فون' },
  address: { en: 'Address', ur: 'پتہ' },
  date: { en: 'Date', ur: 'تاریخ' },
  status: { en: 'Status', ur: 'حیثیت' },
  active: { en: 'Active', ur: 'فعال' },
  inactive: { en: 'Inactive', ur: 'غیر فعال' },
  total: { en: 'Total', ur: 'کل' },
  actions: { en: 'Actions', ur: 'اقدامات' },

  // Status values
  paid: { en: 'Paid', ur: 'ادا شدہ' },
  pending: { en: 'Pending', ur: 'زیر التواء' },
  overdue: { en: 'Overdue', ur: 'واجب الادا' },
  approved: { en: 'Approved', ur: 'منظور شدہ' },
  rejected: { en: 'Rejected', ur: 'مسترد شدہ' },
  draft: { en: 'Draft', ur: 'مسودہ' },
  submitted: { en: 'Submitted', ur: 'جمع شدہ' },

  // Messages
  noData: { en: 'No data', ur: 'کوئی ڈیٹا نہیں' },
  success: { en: 'Success', ur: 'کامیابی' },
  error: { en: 'Error', ur: 'خرابی' },

  // Dashboard stats
  totalStudents: { en: 'Total Students', ur: 'کل طلباء' },
  totalTeachers: { en: 'Total Teachers', ur: 'کل اساتذہ' },
  totalClasses: { en: 'Total Classes', ur: 'کل کلاسز' },
  totalActivities: { en: 'Total Activities', ur: 'کل سرگرمیاں' },
  attendanceRate: { en: 'Attendance Rate', ur: 'حاضری کی شرح' },
  collectionRate: { en: 'Collection Rate', ur: 'وصولی کی شرح' },
} as const satisfies Record<string, { en: string; ur: string }>;

export function t(key: TranslationKey, lang: Language): string {
  return translations[key][lang];
}
