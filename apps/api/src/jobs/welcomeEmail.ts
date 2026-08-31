import { sendEmail } from '../utils/mailer';
import { emailLayout, emailSection, emailStat } from '../utils/emailTemplate';

type WelcomeRole = 'school_admin' | 'teacher' | 'student' | 'parent' | 'finance' | 'coordinator';

const ROLE_LABELS: Record<WelcomeRole, string> = {
  school_admin: 'School Administrator',
  teacher: 'Teacher',
  student: 'Student',
  parent: 'Parent',
  finance: 'Finance Officer',
  coordinator: 'Wing Coordinator',
};

const GETTING_STARTED_TIPS: Record<WelcomeRole, string> = {
  school_admin: 'Start by adding teachers and classes.',
  teacher: 'Check your assigned subjects and create activities.',
  student: 'View your timetable and upcoming assignments.',
  parent: "Monitor your child's progress and attendance.",
  finance: 'Set up fee structures and start tracking payments.',
  coordinator: "Review your wing's teacher activity and monthly reports from your dashboard.",
};

interface SendWelcomeEmailInput {
  name: string;
  email: string;
  role: WelcomeRole;
  schoolName: string;
  password?: string;
}

/** Not a cron job — called directly from account-creation controllers. */
export async function sendWelcomeEmail({
  name,
  email,
  role,
  schoolName,
  password,
}: SendWelcomeEmailInput): Promise<void> {
  const loginUrl = `${process.env.FRONTEND_URL ?? ''}/login`;

  const bodyHtml = `
    <h2 style="margin:0 0 4px;font-size:18px;">Welcome to EduPortal, ${name}!</h2>
    <p style="margin:4px 0 20px;font-size:13px;color:#52514e;">Your account has been created.</p>
    ${emailSection(
      'Account Details',
      `${emailStat('Role', ROLE_LABELS[role])}
       ${emailStat('School', schoolName)}
       ${emailStat('Login', email)}
       ${emailStat('Password', password ?? 'as provided by your admin')}`
    )}
    <p style="margin:16px 0;font-size:13px;">
      <a href="${loginUrl}" style="color:#2a78d6;">Sign in at ${loginUrl}</a>
    </p>
    ${emailSection('Getting Started', `<p style="margin:4px 0;font-size:13px;color:#52514e;">${GETTING_STARTED_TIPS[role]}</p>`)}
  `;

  await sendEmail({
    to: email,
    subject: 'Welcome to EduPortal — Your account is ready',
    html: emailLayout({
      title: 'Account Created',
      bodyHtml,
      footerText: 'If you have questions, contact your school administrator.',
    }),
  });
}
