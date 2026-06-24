import { Resend } from "resend";
import nodemailer from "nodemailer";
import { logger } from "./logger";

// ─── Provider detection ────────────────────────────────────────────────────────

type Provider = "resend" | "smtp" | "none";

function getProvider(): Provider {
  const p = (process.env.EMAIL_PROVIDER ?? "").toLowerCase().trim();
  if (p === "resend") return "resend";
  if (p === "smtp") return "smtp";
  // Legacy auto-detect: if SMTP vars present but EMAIL_PROVIDER not set
  const { host, user, pass } = getSmtpVars();
  if (host && user && pass) return "smtp";
  return "none";
}

function getFromAddress(): string {
  return (
    process.env.EMAIL_FROM?.trim() ||
    process.env.SMTP_FROM?.trim() ||
    "Control HUB <noreply@carmetechnology.com>"
  );
}

// ─── Email configured check ────────────────────────────────────────────────────

export function isEmailConfigured(): boolean {
  const p = getProvider();
  if (p === "resend") return !!process.env.RESEND_API_KEY;
  if (p === "smtp") {
    const { host, user, pass } = getSmtpVars();
    return !!(host && user && pass);
  }
  return false;
}

export function getEmailProviderInfo(): {
  provider: string;
  fromAddress: string;
  configured: boolean;
  missingKey: boolean;
} {
  const p = getProvider();
  const fromAddress = getFromAddress();
  if (p === "resend") {
    const hasKey = !!process.env.RESEND_API_KEY;
    return { provider: "resend", fromAddress, configured: hasKey, missingKey: !hasKey };
  }
  if (p === "smtp") {
    const { host, user, pass } = getSmtpVars();
    const configured = !!(host && user && pass);
    return { provider: "smtp", fromAddress, configured, missingKey: !configured };
  }
  return { provider: "none", fromAddress, configured: false, missingKey: true };
}

// ─── SMTP helpers ──────────────────────────────────────────────────────────────

function getSmtpVars() {
  return {
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT ?? "587", 10),
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASSWORD,
  };
}

function createSmtpTransport() {
  const { host, port, user, pass } = getSmtpVars();
  return nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
  });
}

// ─── App base URL ──────────────────────────────────────────────────────────────

export function getAppBaseUrl(): string {
  if (process.env.APP_BASE_URL) return process.env.APP_BASE_URL.replace(/\/$/, "");
  if (process.env.REPLIT_DOMAINS) {
    const domain = process.env.REPLIT_DOMAINS.split(",")[0].trim();
    return `https://${domain}`;
  }
  return "http://localhost:19979";
}

// ─── Core send ─────────────────────────────────────────────────────────────────

interface EmailMessage {
  to: string;
  subject: string;
  html: string;
  text: string;
}

async function sendEmail(msg: EmailMessage): Promise<void> {
  const p = getProvider();
  const from = getFromAddress();

  if (p === "resend") {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) throw new Error("RESEND_API_KEY secret is not set");
    const client = new Resend(apiKey);
    const { error } = await client.emails.send({
      from,
      to: [msg.to],
      subject: msg.subject,
      html: msg.html,
      text: msg.text,
    });
    if (error) throw new Error(`Resend error: ${error.message}`);
    return;
  }

  if (p === "smtp") {
    const transport = createSmtpTransport();
    await transport.sendMail({ from, to: msg.to, subject: msg.subject, html: msg.html, text: msg.text });
    return;
  }

  throw new Error("Email is not configured. Set EMAIL_PROVIDER and the matching credentials.");
}

// ─── HTML helpers ──────────────────────────────────────────────────────────────

function escapeHtml(str: string): string {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function emailShell(body: string): string {
  return `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:560px;margin:0 auto;padding:24px;">${body}<p style="color:#9ca3af;font-size:12px;margin-top:24px;border-top:1px solid #e5e7eb;padding-top:16px;">Control HUB — CMMC Compliance Management</p></div>`;
}

function primaryButton(href: string, label: string): string {
  return `<p style="margin-bottom:24px;"><a href="${href}" style="display:inline-block;background-color:#2563eb;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:600;">${label}</a></p>`;
}

// ─── Role label map ────────────────────────────────────────────────────────────

const ORG_ROLE_LABELS: Record<string, string> = {
  admin: "Admin",
  org_admin: "Org Admin",
  compliance_manager: "Compliance Manager",
  it_contributor: "IT Contributor",
  reviewer: "Reviewer",
  executive_viewer: "Executive Viewer",
  assessor: "Assessor",
};

// ─── Email templates ───────────────────────────────────────────────────────────

export async function sendInvitationEmail(opts: {
  toEmail: string;
  toName: string;
  inviterName: string;
  inviteUrl: string;
  orgMemberships?: { orgName: string; role: string }[];
}): Promise<void> {
  const { toEmail, toName, inviterName, inviteUrl, orgMemberships } = opts;

  const orgSection = orgMemberships?.length
    ? `<div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px;padding:12px 16px;margin-bottom:24px;">
        <p style="color:#374151;font-weight:600;margin:0 0 8px 0;font-size:14px;">Organization Access:</p>
        <ul style="margin:0;padding:0 0 0 16px;">
          ${orgMemberships.map((m) => `<li style="color:#374151;margin-bottom:4px;font-size:14px;">${escapeHtml(m.orgName)} — <em>${escapeHtml(ORG_ROLE_LABELS[m.role] ?? m.role)}</em></li>`).join("")}
        </ul>
      </div>`
    : "";

  const orgText = orgMemberships?.length
    ? `\nYou have been assigned to:\n${orgMemberships.map((m) => `  - ${m.orgName} (${ORG_ROLE_LABELS[m.role] ?? m.role})`).join("\n")}\n`
    : "";

  const html = emailShell(`
    <h2 style="color:#111827;margin-bottom:8px;">You've been invited to Control HUB</h2>
    <p style="color:#374151;margin-bottom:8px;">Hi ${escapeHtml(toName)},</p>
    <p style="color:#374151;margin-bottom:24px;"><strong>${escapeHtml(inviterName)}</strong> has invited you to join Control HUB, a CMMC compliance management platform.</p>
    ${orgSection}
    ${primaryButton(inviteUrl, "Accept Invitation")}
    <p style="color:#6b7280;font-size:14px;margin-bottom:8px;">Or copy this link: <a href="${inviteUrl}" style="color:#2563eb;">${inviteUrl}</a></p>
    <p style="color:#9ca3af;font-size:12px;">This invitation link expires in 7 days. If you did not expect this invitation, you can safely ignore this email.</p>
  `);

  await sendEmail({
    to: toEmail,
    subject: `${inviterName} invited you to Control HUB`,
    html,
    text: `Hi ${toName},\n\n${inviterName} has invited you to join Control HUB.${orgText}\n\nAccept your invitation here: ${inviteUrl}\n\nThis link expires in 7 days.`,
  });

  logger.info({ toEmail }, "Invitation email sent");
}

export async function sendPasswordResetEmail(opts: {
  toEmail: string;
  toName: string;
  resetUrl: string;
}): Promise<void> {
  const { toEmail, toName, resetUrl } = opts;

  const html = emailShell(`
    <h2 style="color:#111827;margin-bottom:8px;">Reset your Control HUB password</h2>
    <p style="color:#374151;margin-bottom:24px;">Hi ${escapeHtml(toName)}, we received a request to reset your password.</p>
    ${primaryButton(resetUrl, "Reset Password")}
    <p style="color:#9ca3af;font-size:12px;">This link expires in 1 hour. If you did not request a password reset, you can safely ignore this email.</p>
  `);

  await sendEmail({
    to: toEmail,
    subject: "Reset your Control HUB password",
    html,
    text: `Hi ${toName},\n\nReset your password here: ${resetUrl}\n\nThis link expires in 1 hour.`,
  });

  logger.info({ toEmail }, "Password reset email sent");
}

export async function sendMfaRecoveryEmail(opts: {
  toEmail: string;
  toName: string;
  recoveryUrl: string;
}): Promise<void> {
  const { toEmail, toName, recoveryUrl } = opts;

  const html = emailShell(`
    <h2 style="color:#111827;margin-bottom:8px;">MFA Recovery — Control HUB</h2>
    <p style="color:#374151;margin-bottom:24px;">Hi ${escapeHtml(toName)}, an admin has initiated MFA recovery for your account.</p>
    ${primaryButton(recoveryUrl, "Set Up New MFA")}
    <p style="color:#9ca3af;font-size:12px;">If you did not request this, contact your administrator immediately.</p>
  `);

  await sendEmail({
    to: toEmail,
    subject: "Control HUB — MFA Recovery",
    html,
    text: `Hi ${toName},\n\nSet up new MFA here: ${recoveryUrl}`,
  });

  logger.info({ toEmail }, "MFA recovery email sent");
}

export async function sendTestEmail(opts: {
  toEmail: string;
  toName: string;
}): Promise<void> {
  const { toEmail, toName } = opts;

  const html = emailShell(`
    <h2 style="color:#111827;margin-bottom:8px;">Control HUB — Test Email</h2>
    <p style="color:#374151;margin-bottom:8px;">Hi ${escapeHtml(toName)},</p>
    <p style="color:#374151;margin-bottom:24px;">This is a test email confirming that your Resend email integration is working correctly.</p>
    <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:6px;padding:12px 16px;margin-bottom:16px;">
      <p style="color:#166534;font-weight:600;margin:0;font-size:14px;">✓ Email delivery is configured and working</p>
    </div>
  `);

  await sendEmail({
    to: toEmail,
    subject: "Control HUB — Email Configuration Test",
    html,
    text: `Hi ${toName},\n\nThis confirms your Control HUB email integration is working correctly.`,
  });

  logger.info({ toEmail }, "Test email sent");
}

export async function sendBreakGlassLoginAlert(opts: {
  email: string;
  name: string;
  ipAddress: string;
  userAgent: string;
  timestamp: string;
  /** When set, this is a failed-attempt alert rather than a successful login alert */
  failedAttempts?: number;
}): Promise<void> {
  const { email, name, ipAddress, userAgent, timestamp, failedAttempts } = opts;
  const alertEmail = process.env.BREAK_GLASS_ALERT_EMAIL || "info@carmetechnology.com";
  const dateStr = new Date(timestamp).toUTCString();
  const isFailed = failedAttempts !== undefined;

  const subjectLine = isFailed
    ? `⚠️ Control HUB — Break-Glass: ${failedAttempts} Failed Login Attempts`
    : "⚠️ Control HUB — Break-Glass Account Login";

  const intro = isFailed
    ? `<p style="color:#374151;margin-bottom:16px;"><strong>${failedAttempts} failed login attempts</strong> have been detected against the Control HUB break-glass account from IP <strong>${escapeHtml(ipAddress)}</strong>. This may indicate a brute-force attack. Review the audit trail immediately.</p>`
    : `<p style="color:#374151;margin-bottom:16px;">The Control HUB break-glass emergency account has been accessed. If this was not you, contact your security team immediately and revoke the session.</p>`;

  const html = emailShell(`
    <h2 style="color:#b91c1c;margin-bottom:8px;">${isFailed ? "⚠️ Break-Glass Failed Login Attempts" : "⚠️ Break-Glass Account Login Alert"}</h2>
    <p style="color:#374151;margin-bottom:8px;">Hi ${escapeHtml(name)},</p>
    ${intro}
    <div style="background:#fef2f2;border:1px solid #fecaca;border-radius:6px;padding:12px 16px;margin-bottom:24px;">
      <table style="width:100%;font-size:13px;color:#374151;">
        <tr><td style="font-weight:600;padding:3px 0;width:130px;">Account</td><td>${escapeHtml(email)}</td></tr>
        <tr><td style="font-weight:600;padding:3px 0;">Time</td><td>${escapeHtml(dateStr)}</td></tr>
        <tr><td style="font-weight:600;padding:3px 0;">IP Address</td><td>${escapeHtml(ipAddress)}</td></tr>
        ${isFailed ? `<tr><td style="font-weight:600;padding:3px 0;">Failed Attempts</td><td style="color:#b91c1c;font-weight:700;">${failedAttempts} (from this IP in 15 min)</td></tr>` : `<tr><td style="font-weight:600;padding:3px 0;">User Agent</td><td style="word-break:break-all;">${escapeHtml(userAgent.substring(0, 200))}</td></tr>`}
      </table>
    </div>
    ${isFailed
      ? `<p style="color:#6b7280;font-size:13px;">All failed attempts are recorded in the audit trail. If this activity is unauthorized, consider locking the break-glass account and rotating credentials immediately.</p>`
      : `<p style="color:#6b7280;font-size:13px;">This session will automatically expire after 4 hours absolute or 15 minutes of inactivity. All actions taken by this account are recorded in the audit trail.</p>`}
  `);

  const textBody = isFailed
    ? `BREAK-GLASS FAILED LOGIN ALERT\n\nAccount: ${email}\nTime: ${dateStr}\nIP: ${ipAddress}\nFailed Attempts: ${failedAttempts} (from this IP in 15 min)\n\nReview the audit trail and consider rotating credentials immediately.`
    : `BREAK-GLASS LOGIN ALERT\n\nAccount: ${email}\nTime: ${dateStr}\nIP: ${ipAddress}\nUser Agent: ${userAgent}\n\nIf this was not authorized, contact your security team immediately.`;

  await sendEmail({
    to: alertEmail,
    subject: subjectLine,
    html,
    text: textBody,
  });

  if (isFailed) {
    logger.warn({ email, ipAddress, failedAttempts }, "Break-glass failed-attempt alert sent");
  } else {
    logger.warn({ email, ipAddress }, "Break-glass login alert sent");
  }
}
