export interface Feature {
  key: string; // DB field name
  label: string; // Display name
  description: string; // What it does
  icon: string; // emoji
  affectsRoles: string[]; // which roles see this
  category: string; // grouping
}

export const FEATURES: Feature[] = [
  // Academic
  {
    key: 'featureAttendance',
    label: 'Attendance Tracking',
    description: 'Teachers can mark daily attendance. Students see their attendance %.',
    icon: '📋',
    affectsRoles: ['teacher', 'student', 'parent', 'coordinator'],
    category: 'Academic',
  },
  {
    key: 'featureTimetable',
    label: 'Timetable',
    description: 'Weekly class schedules for teachers and students.',
    icon: '📅',
    affectsRoles: ['teacher', 'student', 'parent'],
    category: 'Academic',
  },
  {
    key: 'featureReportCards',
    label: 'Report Cards',
    description: 'Generate and download PDF report cards.',
    icon: '📊',
    affectsRoles: ['student', 'parent', 'school_admin'],
    category: 'Academic',
  },
  {
    key: 'featureAnnouncements',
    label: 'Announcements',
    description: 'School and class-wide announcements.',
    icon: '📢',
    affectsRoles: ['teacher', 'student', 'parent', 'coordinator'],
    category: 'Academic',
  },
  {
    key: 'featureCalendar',
    label: 'Academic Calendar',
    description: 'School events, exam dates, holidays.',
    icon: '🗓️',
    affectsRoles: ['teacher', 'student', 'parent'],
    category: 'Academic',
  },

  // Management
  {
    key: 'featureLeaveRequests',
    label: 'Leave Requests',
    description: 'Students can apply for leave. Teachers and admin approve.',
    icon: '🏖️',
    affectsRoles: ['student', 'teacher', 'school_admin'],
    category: 'Management',
  },
  {
    key: 'featureConsentForms',
    label: 'Consent Forms',
    description: 'Digital permission slips for school events and trips.',
    icon: '📝',
    affectsRoles: ['parent', 'school_admin'],
    category: 'Management',
  },
  {
    key: 'featureCoordinator',
    label: 'Wing Coordinators',
    description: 'Coordinator role for supervising Junior/Senior wing teachers.',
    icon: '🎯',
    affectsRoles: ['coordinator', 'teacher', 'school_admin'],
    category: 'Management',
  },
  {
    key: 'featureMonthlyReports',
    label: 'Monthly Reports',
    description: 'Teachers submit monthly reports reviewed by coordinators and admin.',
    icon: '📈',
    affectsRoles: ['teacher', 'coordinator', 'school_admin'],
    category: 'Management',
  },

  // Finance
  {
    key: 'featureFinance',
    label: 'Finance & Fees',
    description: 'Fee management, payments, receipts, and finance portal.',
    icon: '💰',
    affectsRoles: ['finance', 'student', 'parent', 'school_admin'],
    category: 'Finance',
  },

  // Communication
  {
    key: 'featureParentPortal',
    label: 'Parent Portal',
    description: 'Parents can track child progress, attendance, and fees.',
    icon: '👨‍👩‍👧‍👦',
    affectsRoles: ['parent'],
    category: 'Communication',
  },
  {
    key: 'featureSms',
    label: 'SMS Notifications',
    description: 'Send SMS alerts for attendance, grades, and announcements.',
    icon: '📱',
    affectsRoles: ['parent', 'student'],
    category: 'Communication',
  },

  // Advanced
  {
    key: 'featureAiInsights',
    label: 'AI Insights',
    description: 'AI-powered grade suggestions, weak area analysis, dropout risk detection.',
    icon: '🤖',
    affectsRoles: ['teacher', 'student', 'school_admin'],
    category: 'Advanced',
  },
  {
    key: 'featureUrdu',
    label: 'Urdu Language',
    description: 'Toggle portal language between English and Urdu.',
    icon: '🇵🇰',
    affectsRoles: ['all'],
    category: 'Advanced',
  },
  {
    key: 'featureBadges',
    label: 'Achievement Badges',
    description: 'Students earn badges for attendance streaks and top grades.',
    icon: '🏆',
    affectsRoles: ['student'],
    category: 'Advanced',
  },
];

export const FEATURE_CATEGORIES = ['Academic', 'Management', 'Finance', 'Communication', 'Advanced'];
