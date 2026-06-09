import nodemailer from "nodemailer";
import { logger } from "./logger";

function getSmtpConfig() {
  const host = process.env.SMTP_HOST;
  const port = parseInt(process.env.SMTP_PORT ?? "587", 10);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASSWORD;
  const from = process.env.SMTP_FROM ?? user ?? "noreply@controlhub.com";
  return { host, port, user, pass, from };
}

export function isEmailConfigured(): boolean {
  const { host, user, pass } = getSmtpConfig();
  return !!(host && user && pass);
}

export function getAppBaseUrl(): string {
  if (process.env.APP_BASE_URL) return process.env.APP_BASE_URL.replace(/\/$/, "");
  if (process.env.REPLIT_DOMAINS) {
    const domain = process.env.REPLIT_DOMAINS.split(",")[0].trim();
    return `https://${domain}`;
  }
  return "http://localhost:19979";
}

function createTransport() {
  const { host, port, user, pass } = getSmtpConfig();
  return nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
  });
}

const ORG_ROLE_LABELS: Record<string, string> = {
  admin: "Admin",
  org_admin: "Org Admin",
  compliance_manager: "Compliance Manager",
  it_contributor: "IT Contributor",
  reviewer: "Reviewer",
  executive_viewer: "Executive Viewer",
  assessor: "Assessor",
};

export async function sendInvitationEmail(opts: {
  toEmail: string;
  toName: string;
  inviterName: string;
  inviteUrl: string;
  orgMemberships?: { orgName: string; role: string }[];
}): Promise<void> {
  const { toEmail, toName, inviterName, inviteUrl, orgMemberships } = opts;
  const { from } = getSmtpConfig();
  const transport = createTransport();

  const orgSection = orgMemberships?.length
    ? `<div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px;padding:12px 16px;margin-bottom:24px;">
        <p style="color:#374151;font-weight:600;margin:0 0 8px 0;font-size:14px;">Organization Access:</p>
        <ul style="margin:0;padding:0 0 0 16px;">
          ${orgMemberships.map((m) => `<li style="color:#374151;margin-bottom:4px;font-size:14px;">${escapeHtml(m.orgName)} — <em>${escapeHtml(ORG_ROLE_LABELS[m.role] ?? m.role)}</em></li>`).join("")}
        </ul>
      </div>`
    : "";

  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 560px; margin: 0 auto; padding: 24px;">
      <h2 style="color: #111827; margin-bottom: 8px;">You've been invited to Control HUB</h2>
      <p style="color: #374151; margin-bottom: 8px;">Hi ${escapeHtml(toName)},</p>
      <p style="color: #374151; margin-bottom: 24px;">
        <strong>${escapeHtml(inviterName)}</strong> has invited you to join Control HUB, 
        a CMMC compliance management platform.
      </p>
      ${orgSection}
      <p style="margin-bottom: 24px;">
        <a href="${inviteUrl}" 
           style="display: inline-block; background-color: #2563eb; color: #fff; 
                  padding: 12px 24px; border-radius: 6px; text-decoration: none; 
                  font-weight: 600;">
          Accept Invitation
        </a>
      </p>
      <p style="color: #6b7280; font-size: 14px; margin-bottom: 8px;">
        Or copy this link: <a href="${inviteUrl}" style="color: #2563eb;">${inviteUrl}</a>
      </p>
      <p style="color: #9ca3af; font-size: 12px; margin-top: 24px; border-top: 1px solid #e5e7eb; padding-top: 16px;">
        This invitation link expires in 7 days. If you did not expect this invitation, you can safely ignore this email.
      </p>
    </div>
  `;

  const orgText = orgMemberships?.length
    ? `\nYou have been assigned to:\n${orgMemberships.map((m) => `  - ${m.orgName} (${ORG_ROLE_LABELS[m.role] ?? m.role})`).join("\n")}\n`
    : "";

  await transport.sendMail({
    from,
    to: toEmail,
    subject: `${inviterName} invited you to Control HUB`,
    text: `Hi ${toName},\n\n${inviterName} has invited you to join Control HUB.${orgText}\n\nAccept your invitation here: ${inviteUrl}\n\nThis link expires in 7 days.`,
    html,
  });

  logger.info({ toEmail }, "Invitation email sent");
}

function escapeHtml(str: string): string {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
