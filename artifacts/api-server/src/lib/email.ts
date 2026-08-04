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

// ─── Document review request email ────────────────────────────────────────────

export async function sendDocumentReviewRequestEmail(opts: {
  reviewerEmail: string;
  reviewerName: string;
  submitterName: string;
  documentTitle: string;
  documentId: string;
  dueDate?: string | null;
  notes?: string | null;
}): Promise<void> {
  const { reviewerEmail, reviewerName, submitterName, documentTitle, documentId, dueDate, notes } = opts;
  const appUrl = getAppBaseUrl();
  const docUrl = `${appUrl}/documents/${encodeURIComponent(documentId)}`;

  const dueDateLine = dueDate
    ? `<tr><td style="font-weight:600;padding:3px 0;width:120px;">Due Date</td><td>${escapeHtml(new Date(dueDate).toLocaleDateString())}</td></tr>`
    : "";

  const notesSection = notes
    ? `<div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px;padding:12px 16px;margin-bottom:24px;">
        <p style="color:#374151;font-weight:600;margin:0 0 6px 0;font-size:13px;">Submission Notes:</p>
        <p style="color:#374151;margin:0;font-size:13px;">${escapeHtml(notes)}</p>
       </div>`
    : "";

  const html = emailShell(`
    <h2 style="color:#111827;margin-bottom:8px;">Document Review Requested</h2>
    <p style="color:#374151;margin-bottom:8px;">Hi ${escapeHtml(reviewerName)},</p>
    <p style="color:#374151;margin-bottom:16px;"><strong>${escapeHtml(submitterName)}</strong> has submitted a document for your review.</p>
    <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px;padding:12px 16px;margin-bottom:16px;">
      <table style="width:100%;font-size:13px;color:#374151;">
        <tr><td style="font-weight:600;padding:3px 0;width:120px;">Document</td><td>${escapeHtml(documentTitle)}</td></tr>
        <tr><td style="font-weight:600;padding:3px 0;">Submitted By</td><td>${escapeHtml(submitterName)}</td></tr>
        ${dueDateLine}
      </table>
    </div>
    ${notesSection}
    ${primaryButton(docUrl, "Open Document")}
    <p style="color:#9ca3af;font-size:12px;">Please review the document and either approve it or request changes.</p>
  `);

  const dueDateText = dueDate ? `\nDue Date: ${new Date(dueDate).toLocaleDateString()}` : "";
  const notesText = notes ? `\nNotes: ${notes}` : "";

  await sendEmail({
    to: reviewerEmail,
    subject: `Review Requested: ${documentTitle}`,
    html,
    text: `Hi ${reviewerName},\n\n${submitterName} has submitted "${documentTitle}" for your review.${dueDateText}${notesText}\n\nOpen the document here: ${docUrl}`,
  });

  logger.info({ reviewerEmail, documentId }, "Document review request email sent");
}

// ─── Document review decision email ───────────────────────────────────────────

export async function sendDocumentDecisionEmail(opts: {
  authorEmail: string;
  authorName: string;
  reviewerName: string;
  documentTitle: string;
  documentId: string;
  decision: "APPROVED" | "CHANGES_REQUESTED";
  notes?: string | null;
}): Promise<void> {
  const { authorEmail, authorName, reviewerName, documentTitle, documentId, decision, notes } = opts;
  const appUrl = getAppBaseUrl();
  const docUrl = `${appUrl}/documents/${encodeURIComponent(documentId)}`;

  const isApproved = decision === "APPROVED";
  const headingColor = isApproved ? "#166534" : "#92400e";
  const headingText = isApproved ? "✓ Document Approved" : "Changes Requested";
  const bodyText = isApproved
    ? `<strong>${escapeHtml(reviewerName)}</strong> has approved your document.`
    : `<strong>${escapeHtml(reviewerName)}</strong> has reviewed your document and requested changes.`;
  const bgColor = isApproved ? "#f0fdf4" : "#fffbeb";
  const borderColor = isApproved ? "#bbf7d0" : "#fde68a";

  const notesSection = notes
    ? `<div style="background:${bgColor};border:1px solid ${borderColor};border-radius:6px;padding:12px 16px;margin-bottom:24px;">
        <p style="color:#374151;font-weight:600;margin:0 0 6px 0;font-size:13px;">${isApproved ? "Approval Notes:" : "Changes Required:"}</p>
        <p style="color:#374151;margin:0;font-size:13px;">${escapeHtml(notes)}</p>
       </div>`
    : "";

  const html = emailShell(`
    <h2 style="color:${headingColor};margin-bottom:8px;">${headingText}</h2>
    <p style="color:#374151;margin-bottom:8px;">Hi ${escapeHtml(authorName)},</p>
    <p style="color:#374151;margin-bottom:16px;">${bodyText}</p>
    <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px;padding:12px 16px;margin-bottom:16px;">
      <table style="width:100%;font-size:13px;color:#374151;">
        <tr><td style="font-weight:600;padding:3px 0;width:120px;">Document</td><td>${escapeHtml(documentTitle)}</td></tr>
        <tr><td style="font-weight:600;padding:3px 0;">Reviewer</td><td>${escapeHtml(reviewerName)}</td></tr>
      </table>
    </div>
    ${notesSection}
    ${primaryButton(docUrl, isApproved ? "View Approved Document" : "Edit Document")}
  `);

  const actionText = isApproved ? "approved" : "requested changes to";
  const notesText = notes ? `\n\n${isApproved ? "Notes" : "Changes Required"}: ${notes}` : "";

  await sendEmail({
    to: authorEmail,
    subject: isApproved ? `Approved: ${documentTitle}` : `Changes Requested: ${documentTitle}`,
    html,
    text: `Hi ${authorName},\n\n${reviewerName} has ${actionText} "${documentTitle}".${notesText}\n\nView the document: ${docUrl}`,
  });

  logger.info({ authorEmail, documentId, decision }, "Document decision email sent");
}

// ─── Support ticket — internal notification ────────────────────────────────────

export async function sendSupportTicketEmail(opts: {
  ticketNumber: string;
  subject: string;
  category: string;
  priority: string;
  description: string;
  submittedByName: string;
  submittedByEmail: string;
  effectiveRole: string | null;
  organizationName: string | null;
  relatedModule: string | null;
  currentPageUrl: string | null;
  environment: string | null;
  browserSummary: string | null;
  correlationId: string | null;
  createdAt: Date;
}): Promise<void> {
  const {
    ticketNumber, subject, category, priority, description,
    submittedByName, submittedByEmail, effectiveRole, organizationName,
    relatedModule, currentPageUrl, environment, browserSummary,
    correlationId, createdAt,
  } = opts;

  const priorityLabel: Record<string, string> = {
    low: "Low",
    normal: "Normal",
    high: "HIGH",
    urgent: "URGENT",
  };
  const priorityDisplay = priorityLabel[priority] ?? priority.toUpperCase();

  const optionalRows = [
    organizationName ? `<tr><td style="font-weight:600;padding:4px 0;width:160px;">Organization</td><td>${escapeHtml(organizationName)}</td></tr>` : "",
    effectiveRole ? `<tr><td style="font-weight:600;padding:4px 0;">User Role</td><td>${escapeHtml(effectiveRole)}</td></tr>` : "",
    relatedModule ? `<tr><td style="font-weight:600;padding:4px 0;">Related Module</td><td>${escapeHtml(relatedModule)}</td></tr>` : "",
    currentPageUrl ? `<tr><td style="font-weight:600;padding:4px 0;">Page URL</td><td style="word-break:break-all;">${escapeHtml(currentPageUrl)}</td></tr>` : "",
    environment ? `<tr><td style="font-weight:600;padding:4px 0;">Environment</td><td>${escapeHtml(environment)}</td></tr>` : "",
    browserSummary ? `<tr><td style="font-weight:600;padding:4px 0;">Browser</td><td>${escapeHtml(browserSummary)}</td></tr>` : "",
    correlationId ? `<tr><td style="font-weight:600;padding:4px 0;">Correlation ID</td><td style="font-family:monospace;">${escapeHtml(correlationId)}</td></tr>` : "",
  ].join("");

  const html = emailShell(`
    <h2 style="color:#111827;margin-bottom:8px;">[Control HUB Support] New Ticket — ${escapeHtml(ticketNumber)}</h2>
    <div style="background:#fef9c3;border:1px solid #fde047;border-radius:6px;padding:10px 14px;margin-bottom:16px;">
      <p style="color:#713f12;font-weight:700;margin:0;font-size:13px;">⚠ Do not reply with CUI, passwords, access tokens, or sensitive contract data.</p>
    </div>
    <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px;padding:12px 16px;margin-bottom:16px;">
      <table style="width:100%;font-size:13px;color:#374151;">
        <tr><td style="font-weight:600;padding:4px 0;width:160px;">Ticket Number</td><td style="font-family:monospace;font-weight:700;">${escapeHtml(ticketNumber)}</td></tr>
        <tr><td style="font-weight:600;padding:4px 0;">Submitted At</td><td>${escapeHtml(createdAt.toUTCString())}</td></tr>
        <tr><td style="font-weight:600;padding:4px 0;">Submitted By</td><td>${escapeHtml(submittedByName)} &lt;${escapeHtml(submittedByEmail)}&gt;</td></tr>
        <tr><td style="font-weight:600;padding:4px 0;">Category</td><td>${escapeHtml(category)}</td></tr>
        <tr><td style="font-weight:600;padding:4px 0;">Priority</td><td><strong>${escapeHtml(priorityDisplay)}</strong></td></tr>
        <tr><td style="font-weight:600;padding:4px 0;">Subject</td><td>${escapeHtml(subject)}</td></tr>
        ${optionalRows}
      </table>
    </div>
    <h3 style="color:#374151;font-size:14px;margin-bottom:6px;">Description</h3>
    <div style="background:#fff;border:1px solid #e2e8f0;border-radius:6px;padding:12px 16px;margin-bottom:16px;white-space:pre-wrap;font-size:13px;color:#374151;">${escapeHtml(description)}</div>
    <p style="color:#9ca3af;font-size:12px;">Reply to this email to respond to the user. Their email is: <strong>${escapeHtml(submittedByEmail)}</strong></p>
  `);

  const text = [
    `[Control HUB Support] New Ticket: ${ticketNumber}`,
    `WARNING: Do not reply with CUI, passwords, tokens, or sensitive data.`,
    ``,
    `Ticket: ${ticketNumber}`,
    `Submitted: ${createdAt.toUTCString()}`,
    `From: ${submittedByName} <${submittedByEmail}>`,
    `Category: ${category}`,
    `Priority: ${priorityDisplay}`,
    `Subject: ${subject}`,
    organizationName ? `Organization: ${organizationName}` : "",
    effectiveRole ? `Role: ${effectiveRole}` : "",
    relatedModule ? `Module: ${relatedModule}` : "",
    currentPageUrl ? `Page: ${currentPageUrl}` : "",
    browserSummary ? `Browser: ${browserSummary}` : "",
    correlationId ? `Correlation ID: ${correlationId}` : "",
    ``,
    `Description:`,
    description,
  ].filter((l) => l !== undefined).join("\n");

  const p = getProvider();
  const from = getFromAddress();

  if (p === "resend") {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) throw new Error("RESEND_API_KEY secret is not set");
    const client = new Resend(apiKey);
    const { error } = await client.emails.send({
      from,
      to: ["support@carmetechnology.com"],
      replyTo: submittedByEmail,
      subject: `[Control HUB Support] [${ticketNumber}] [${priorityDisplay}] ${subject}`,
      html,
      text,
    });
    if (error) throw new Error(`Resend error: ${error.message}`);
  } else if (p === "smtp") {
    const transport = createSmtpTransport();
    await transport.sendMail({
      from,
      to: "support@carmetechnology.com",
      replyTo: submittedByEmail,
      subject: `[Control HUB Support] [${ticketNumber}] [${priorityDisplay}] ${subject}`,
      html,
      text,
    });
  } else {
    throw new Error("Email is not configured.");
  }

  logger.info({ ticketNumber, submittedByEmail }, "Support ticket email sent to team");
}

// ─── Support ticket — user confirmation ───────────────────────────────────────

export async function sendSupportTicketConfirmation(opts: {
  ticketNumber: string;
  subject: string;
  toEmail: string;
  toName: string;
  createdAt: Date;
}): Promise<void> {
  const { ticketNumber, subject, toEmail, toName, createdAt } = opts;

  const html = emailShell(`
    <h2 style="color:#111827;margin-bottom:8px;">Support Request Received</h2>
    <p style="color:#374151;margin-bottom:8px;">Hi ${escapeHtml(toName)},</p>
    <p style="color:#374151;margin-bottom:16px;">Thank you for reaching out. We've received your support request and will get back to you as soon as possible.</p>
    <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:6px;padding:12px 16px;margin-bottom:16px;">
      <table style="width:100%;font-size:13px;color:#374151;">
        <tr><td style="font-weight:600;padding:4px 0;width:140px;">Ticket Number</td><td style="font-family:monospace;font-weight:700;">${escapeHtml(ticketNumber)}</td></tr>
        <tr><td style="font-weight:600;padding:4px 0;">Subject</td><td>${escapeHtml(subject)}</td></tr>
        <tr><td style="font-weight:600;padding:4px 0;">Submitted</td><td>${escapeHtml(createdAt.toUTCString())}</td></tr>
      </table>
    </div>
    <p style="color:#374151;font-size:13px;">You will receive a reply at this email address (<strong>${escapeHtml(toEmail)}</strong>) from <strong>support@carmetechnology.com</strong>. Please check your spam folder if you do not receive a reply within one business day.</p>
    <div style="background:#fef9c3;border:1px solid #fde047;border-radius:6px;padding:10px 14px;margin-top:16px;">
      <p style="color:#713f12;font-weight:600;margin:0;font-size:12px;">🔒 Security Notice: For security, do not reply with Controlled Unclassified Information, passwords, access tokens, or sensitive contract data.</p>
    </div>
  `);

  const text = [
    `Support Request Received — ${ticketNumber}`,
    ``,
    `Hi ${toName},`,
    ``,
    `Thank you for contacting Control HUB Support. Your request has been received.`,
    ``,
    `Ticket Number: ${ticketNumber}`,
    `Subject: ${subject}`,
    `Submitted: ${createdAt.toUTCString()}`,
    ``,
    `You will receive a reply at ${toEmail} from support@carmetechnology.com.`,
    ``,
    `SECURITY NOTICE: Do not reply with Controlled Unclassified Information, passwords, access tokens, or sensitive contract data.`,
  ].join("\n");

  await sendEmail({
    to: toEmail,
    subject: `Control HUB Support Request Received — ${ticketNumber}`,
    html,
    text,
  });

  logger.info({ ticketNumber, toEmail }, "Support ticket confirmation email sent to user");
}

// ─── Support ticket — status update notification ───────────────────────────────

const TICKET_STATUS_LABELS: Record<string, string> = {
  submitted: "Submitted",
  in_review: "In Review",
  waiting_on_user: "Waiting on User",
  resolved: "Resolved",
  closed: "Closed",
};

export async function sendTicketStatusUpdate(opts: {
  ticketNumber: string;
  subject: string;
  newStatus: string;
  toEmail: string;
  toName: string;
  /** Optional admin note shared with the submitter */
  sharedNote?: string | null;
}): Promise<void> {
  const { ticketNumber, subject, newStatus, toEmail, toName, sharedNote } = opts;

  const statusLabel = TICKET_STATUS_LABELS[newStatus] ?? newStatus;

  const isResolved = newStatus === "resolved" || newStatus === "closed";
  const headerColor = isResolved ? "#166534" : "#1e40af";
  const badgeBg = isResolved ? "#f0fdf4" : "#eff6ff";
  const badgeBorder = isResolved ? "#bbf7d0" : "#bfdbfe";
  const badgeText = isResolved ? "#166534" : "#1e40af";

  const sharedNoteSection = sharedNote
    ? `<div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px;padding:12px 16px;margin-bottom:24px;">
        <p style="color:#374151;font-weight:600;margin:0 0 6px 0;font-size:13px;">Message from Support:</p>
        <p style="color:#374151;margin:0;font-size:13px;white-space:pre-wrap;">${escapeHtml(sharedNote)}</p>
       </div>`
    : "";

  const sharedNoteText = sharedNote ? `\nMessage from Support:\n${sharedNote}\n` : "";

  const html = emailShell(`
    <h2 style="color:${headerColor};margin-bottom:8px;">Support Ticket Update</h2>
    <p style="color:#374151;margin-bottom:8px;">Hi ${escapeHtml(toName)},</p>
    <p style="color:#374151;margin-bottom:16px;">Your support request <strong>${escapeHtml(ticketNumber)}</strong> has been updated.</p>
    <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px;padding:12px 16px;margin-bottom:16px;">
      <table style="width:100%;font-size:13px;color:#374151;">
        <tr><td style="font-weight:600;padding:4px 0;width:140px;">Ticket Number</td><td style="font-family:monospace;font-weight:700;">${escapeHtml(ticketNumber)}</td></tr>
        <tr><td style="font-weight:600;padding:4px 0;">Subject</td><td>${escapeHtml(subject)}</td></tr>
        <tr><td style="font-weight:600;padding:4px 0;">New Status</td><td>
          <span style="display:inline-block;background:${badgeBg};border:1px solid ${badgeBorder};color:${badgeText};border-radius:4px;padding:2px 10px;font-size:12px;font-weight:600;">${escapeHtml(statusLabel)}</span>
        </td></tr>
      </table>
    </div>
    ${sharedNoteSection}
    <p style="color:#6b7280;font-size:13px;">If you have questions, you can reply to the original support email thread or submit a new request through Control HUB.</p>
    <div style="background:#fef9c3;border:1px solid #fde047;border-radius:6px;padding:10px 14px;margin-top:16px;">
      <p style="color:#713f12;font-weight:600;margin:0;font-size:12px;">🔒 Security Notice: Do not reply with Controlled Unclassified Information, passwords, or sensitive contract data.</p>
    </div>
  `);

  const text = [
    `Support Ticket Update — ${ticketNumber}`,
    ``,
    `Hi ${toName},`,
    ``,
    `Your support request ${ticketNumber} has been updated.`,
    ``,
    `Ticket Number: ${ticketNumber}`,
    `Subject: ${subject}`,
    `New Status: ${statusLabel}`,
    sharedNoteText,
    `If you have questions, reply to the original support email thread or submit a new request through Control HUB.`,
    ``,
    `SECURITY NOTICE: Do not reply with Controlled Unclassified Information, passwords, or sensitive contract data.`,
  ].join("\n");

  await sendEmail({
    to: toEmail,
    subject: `Control HUB Support [${ticketNumber}] — Status updated to ${statusLabel}`,
    html,
    text,
  });

  logger.info({ ticketNumber, toEmail, newStatus }, "Support ticket status update email sent to user");
}
