import { Resend } from 'resend';

interface SendEmailInput {
  to: string;
  subject: string;
  html: string;
}

export async function sendEmail({ to, subject, html }: SendEmailInput): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;

  if (!apiKey) {
    console.warn('[mailer] RESEND_API_KEY not set — skipping email');
    return;
  }

  const resend = new Resend(apiKey);
  const from = process.env.EMAIL_FROM ?? 'onboarding@resend.dev';

  const { error } = await resend.emails.send({ from, to, subject, html });

  if (error) {
    throw new Error(`Failed to send email: ${error.message}`);
  }
}
