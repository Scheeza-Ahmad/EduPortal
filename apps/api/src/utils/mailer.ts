import { Resend } from 'resend';

interface SendEmailInput {
  to: string;
  subject: string;
  html: string;
  attachments?: { filename: string; content: Buffer }[];
}

export async function sendEmail({ to, subject, html, attachments }: SendEmailInput): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;

  if (!apiKey) {
    console.warn('[mailer] RESEND_API_KEY not set — skipping email');
    return;
  }

  const resend = new Resend(apiKey);
  const from = process.env.EMAIL_FROM ?? 'onboarding@resend.dev';

  const { error } = await resend.emails.send({ from, to, subject, html, attachments });

  if (error) {
    // Resend's sandbox sender (onboarding@resend.dev, or any unverified
    // domain) only delivers to the account owner's own verified address.
    // This isn't a bug in this app — surface it as a one-line hint instead
    // of a stack trace so it's obvious what to do (verify a domain and set
    // EMAIL_FROM, or test with the account owner's own email as recipient).
    if (error.message.includes('You can only send testing emails')) {
      console.warn(
        `[mailer] Resend sandbox restriction: can't email "${to}" — only the account owner's own address is deliverable until a domain is verified at resend.com/domains and EMAIL_FROM is updated.`
      );
      return;
    }
    throw new Error(`Failed to send email: ${error.message}`);
  }
}
