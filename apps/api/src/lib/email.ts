export interface SendEmailOptions {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

export interface SendEmailResult {
  success: boolean;
  id?: string;
  error?: string;
}

/**
 * Send a transactional email using Resend REST API or fallback logger.
 */
export async function sendEmail(options: SendEmailOptions): Promise<SendEmailResult> {
  const { to, subject, html, text } = options;
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM || 'Kanchuki <noreply@kanchuki.app>';

  if (!apiKey) {
    // Development / fallback: log email contents safely for testing & diagnostics
    // biome-ignore lint/suspicious/noConsoleLog: operator-facing email diagnostics
    console.log(`[email] (mock/fallback) To: ${to} | Subject: ${subject}`);
    if (text) {
      // biome-ignore lint/suspicious/noConsoleLog: operator-facing email diagnostics
      console.log(`[email] Text: ${text}`);
    }
    return { success: true, id: `mock-${Date.now()}` };
  }

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from,
        to: [to],
        subject,
        html,
        text,
      }),
    });

    if (!res.ok) {
      const errJson = (await res.json().catch(() => null)) as { message?: string } | null;
      const errMsg = errJson?.message ?? `HTTP ${res.status}`;
      console.error(`[email] Resend error for ${to}:`, errMsg);
      return { success: false, error: errMsg };
    }

    const data = (await res.json().catch(() => ({}))) as { id?: string };
    return { success: true, id: data.id };
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Failed to dispatch email';
    console.error(`[email] Exception sending to ${to}:`, msg);
    return { success: false, error: msg };
  }
}

/**
 * Send welcome email to a new team member with their login details and OTP instructions.
 */
export async function sendTeamMemberWelcomeEmail(params: {
  name: string;
  email: string;
  tempPassword?: string;
  role: string;
  phone?: string | null;
}): Promise<SendEmailResult> {
  const { name, email, tempPassword, role, phone } = params;
  const webUrl = process.env.WEB_URL || 'https://kanchuki.app';
  const loginUrl = `${webUrl}/admin`;

  const roleLabels: Record<string, string> = {
    SUPER_ADMIN: 'Super Admin',
    MARKETING_MANAGER: 'Marketing Manager',
    MARKETING_AGENT: 'Marketing Agent',
    SUPPORT_MANAGER: 'Support Manager',
    SUPPORT_AGENT: 'Support Agent',
  };
  const roleName = roleLabels[role] ?? role;

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Welcome to Kanchuki Team</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #030712; color: #f3f4f6; margin: 0; padding: 24px; }
    .container { max-width: 540px; margin: 0 auto; background-color: #111827; border: 1px solid rgba(255,255,255,0.1); border-radius: 16px; padding: 32px; }
    .header { text-align: center; margin-bottom: 24px; }
    .logo { font-size: 24px; font-weight: bold; background: linear-gradient(to right, #06b6d4, #3b82f6); -webkit-background-clip: text; color: transparent; }
    h1 { font-size: 20px; font-weight: 700; margin-top: 12px; margin-bottom: 8px; color: #ffffff; }
    p { font-size: 14px; line-height: 1.6; color: #9ca3af; margin: 8px 0; }
    .card { background-color: #1f2937; border: 1px solid rgba(255,255,255,0.08); border-radius: 12px; padding: 20px; margin: 20px 0; }
    .credential-row { display: flex; justify-content: space-between; margin-bottom: 10px; font-size: 14px; }
    .credential-label { color: #9ca3af; font-weight: 500; }
    .credential-value { color: #f3f4f6; font-weight: 600; font-family: monospace; }
    .btn { display: inline-block; background: linear-gradient(to right, #0891b2, #2563eb); color: #ffffff; text-decoration: none; padding: 12px 28px; border-radius: 10px; font-weight: 600; font-size: 14px; text-align: center; margin: 16px 0; }
    .badge { display: inline-block; background-color: rgba(6,182,212,0.15); color: #22d3ee; padding: 4px 10px; border-radius: 6px; font-size: 12px; font-weight: 600; }
    .footer { text-align: center; font-size: 12px; color: #6b7280; margin-top: 24px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div class="logo">KANCHUKI</div>
      <h1>Welcome to the Team, ${name}!</h1>
      <p>Your team member account has been created with role <span class="badge">${roleName}</span>.</p>
    </div>

    <div class="card">
      <div class="credential-row">
        <span class="credential-label">Email:</span>
        <span class="credential-value">${email}</span>
      </div>
      ${
        phone
          ? `<div class="credential-row">
        <span class="credential-label">Mobile (for OTP):</span>
        <span class="credential-value">${phone}</span>
      </div>`
          : ''
      }
      ${
        tempPassword
          ? `<div class="credential-row">
        <span class="credential-label">Temporary Password:</span>
        <span class="credential-value">${tempPassword}</span>
      </div>`
          : ''
      }
    </div>

    <p><strong>Two convenient ways to log in:</strong></p>
    <ul style="font-size: 14px; color: #9ca3af; padding-left: 20px; line-height: 1.6;">
      ${
        phone
          ? `<li><strong>Fast OTP Login (Recommended):</strong> Enter your mobile number (<code>${phone}</code>) and log in directly using the 6-digit SMS/WhatsApp code — no password needed!</li>`
          : ''
      }
      ${
        tempPassword
          ? `<li><strong>Password Login:</strong> Sign in with your email and temporary password above, and update your password anytime.</li>`
          : ''
      }
    </ul>

    <div style="text-align: center;">
      <a href="${loginUrl}" class="btn">Sign In to Kanchuki</a>
    </div>

    <div class="footer">
      <p>Need help? Contact your administrator at support@kanchuki.app</p>
      <p>© ${new Date().getFullYear()} Kanchuki. All rights reserved.</p>
    </div>
  </div>
</body>
</html>
  `;

  const text = `Welcome to Kanchuki Team, ${name}!\n\nYour account has been created with role: ${roleName}.\nEmail: ${email}\n${phone ? `Phone (for OTP login): ${phone}\n` : ''}${tempPassword ? `Temporary Password: ${tempPassword}\n` : ''}\nYou can sign in at: ${loginUrl}\n\nLogin options:\n1. Fast Mobile OTP using ${phone || 'your phone number'}\n2. Email & Password\n`;

  return sendEmail({
    to: email,
    subject: 'Welcome to Kanchuki — Your Team Account is Ready',
    html,
    text,
  });
}

/**
 * Send password reset code to a team member.
 */
export async function sendTeamPasswordResetEmail(params: {
  name: string;
  email: string;
  resetCode: string;
}): Promise<SendEmailResult> {
  const { name, email, resetCode } = params;

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Reset Your Kanchuki Password</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #030712; color: #f3f4f6; margin: 0; padding: 24px; }
    .container { max-width: 500px; margin: 0 auto; background-color: #111827; border: 1px solid rgba(255,255,255,0.1); border-radius: 16px; padding: 32px; }
    .header { text-align: center; margin-bottom: 24px; }
    .logo { font-size: 24px; font-weight: bold; background: linear-gradient(to right, #06b6d4, #3b82f6); -webkit-background-clip: text; color: transparent; }
    h1 { font-size: 20px; font-weight: 700; margin-top: 12px; margin-bottom: 8px; color: #ffffff; }
    p { font-size: 14px; line-height: 1.6; color: #9ca3af; margin: 8px 0; }
    .code-box { background-color: #1f2937; border: 1px solid rgba(6,182,212,0.3); border-radius: 12px; padding: 20px; text-align: center; margin: 24px 0; }
    .code { font-size: 32px; font-weight: 800; letter-spacing: 8px; color: #22d3ee; font-family: monospace; }
    .footer { text-align: center; font-size: 12px; color: #6b7280; margin-top: 24px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div class="logo">KANCHUKI</div>
      <h1>Password Reset Request</h1>
      <p>Hello ${name}, we received a request to reset your team account password.</p>
    </div>

    <div class="code-box">
      <div style="font-size: 12px; text-transform: uppercase; color: #9ca3af; margin-bottom: 6px; letter-spacing: 1px;">Your Verification Code</div>
      <div class="code">${resetCode}</div>
      <div style="font-size: 12px; color: #9ca3af; margin-top: 6px;">Valid for 15 minutes</div>
    </div>

    <p>Enter this verification code on the reset screen along with your new password.</p>
    <p>If you did not request this change, you can safely ignore this email.</p>

    <div class="footer">
      <p>© ${new Date().getFullYear()} Kanchuki. All rights reserved.</p>
    </div>
  </div>
</body>
</html>
  `;

  const text = `Hello ${name},\n\nYour password reset code is: ${resetCode}\n\nThis code is valid for 15 minutes. Enter this code to set your new password.\n\nIf you did not request this, you can ignore this email.\n`;

  return sendEmail({
    to: email,
    subject: 'Kanchuki — Password Reset Code',
    html,
    text,
  });
}
