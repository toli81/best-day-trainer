import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

// Update this to your verified Resend domain, or use an env var
const FROM_EMAIL = process.env.FROM_EMAIL || "Best Day Trainer <noreply@yourdomain.com>";

export async function sendMagicLinkEmail(email: string, token: string) {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  const verifyUrl = `${baseUrl}/auth/verify?token=${token}`;

  await resend.emails.send({
    from: FROM_EMAIL,
    to: email,
    subject: "Your Best Day Trainer login link",
    html: `
      <h2>Log in to Best Day Trainer</h2>
      <p>Click the link below to log in. This link expires in 15 minutes.</p>
      <p><a href="${verifyUrl}" style="display:inline-block;padding:12px 24px;background:#4cc9f0;color:#000;text-decoration:none;border-radius:6px;font-weight:600;">Log In</a></p>
      <p style="color:#888;font-size:12px;">If you didn't request this, you can safely ignore this email.</p>
    `,
  });
}

export async function sendWelcomeEmail(email: string, name: string, token: string) {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  const verifyUrl = `${baseUrl}/auth/verify?token=${token}`;

  await resend.emails.send({
    from: FROM_EMAIL,
    to: email,
    subject: `Welcome to Best Day Trainer, ${name}!`,
    html: `
      <h2>Welcome, ${name}!</h2>
      <p>Your trainer has set up your Best Day Trainer account. Click below to access your training dashboard.</p>
      <p><a href="${verifyUrl}" style="display:inline-block;padding:12px 24px;background:#4cc9f0;color:#000;text-decoration:none;border-radius:6px;font-weight:600;">View My Dashboard</a></p>
      <p style="color:#888;font-size:12px;">This link expires in 15 minutes. You can request a new one anytime from the login page.</p>
    `,
  });
}

export async function sendReminderEmail(email: string, name: string, token: string) {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  const verifyUrl = `${baseUrl}/auth/verify?token=${token}`;

  await resend.emails.send({
    from: FROM_EMAIL,
    to: email,
    subject: `${name}, check out your training progress!`,
    html: `
      <h2>Hey ${name}!</h2>
      <p>Your trainer wanted to share your latest progress. Click below to see your dashboard.</p>
      <p><a href="${verifyUrl}" style="display:inline-block;padding:12px 24px;background:#4cc9f0;color:#000;text-decoration:none;border-radius:6px;font-weight:600;">View My Progress</a></p>
      <p style="color:#888;font-size:12px;">This link expires in 15 minutes.</p>
    `,
  });
}
