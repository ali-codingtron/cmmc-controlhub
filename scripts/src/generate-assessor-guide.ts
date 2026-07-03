/**
 * Assessor User Guide Generator
 *
 * Generates a PDF guide for the Control HUB Assessor Read-Only role.
 * Saves to /generated-guides/ — not exposed in the app UI.
 *
 * Usage: pnpm --filter @workspace/scripts run generate:assessor-guide
 *    or: pnpm generate:assessor-guide (from workspace root)
 */

import { chromium, type Page } from "playwright";
import jwt from "jsonwebtoken";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import os from "os";
import { execSync } from "child_process";

// ─── Constants ─────────────────────────────────────────────────────────────

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WORKSPACE_ROOT = path.resolve(__dirname, "..", "..");
const OUTPUT_DIR = path.join(WORKSPACE_ROOT, "generated-guides");
const PDF_FILENAME = "VTCCORP.US_Control_HUB_Assessor_User_Guide.pdf";
const OUTPUT_PDF = path.join(OUTPUT_DIR, PDF_FILENAME);

const JWT_SECRET =
  process.env.SESSION_SECRET ?? "cmmc-dev-secret-change-in-prod";

const ASSESSOR_USER = {
  id: "3a9a00f3-cc74-4e24-8aef-378c21948520",
  name: "Assessor",
  email: "assessor@example.com",
  role: "assessor",
};
const ORG_ID = "41b0ab05-34f3-44ec-933f-ea9bb472a190";
const APP_URL = "http://localhost:80";

const ORG_NAME = "VTCCORP.US";
const GENERATED_DATE = new Date().toLocaleDateString("en-US", {
  year: "numeric",
  month: "long",
  day: "numeric",
});
const VERSION = "1.0";

// ─── Token ─────────────────────────────────────────────────────────────────

function generateAssessorToken(): string {
  return jwt.sign(ASSESSOR_USER, JWT_SECRET, { expiresIn: "2h" });
}

// ─── Screenshot helpers ─────────────────────────────────────────────────────

interface ScreenshotResult {
  key: string;
  data: string; // base64
  label: string;
}

async function injectAuth(page: Page, token: string): Promise<void> {
  await page.evaluate(
    ({ t, o }) => {
      localStorage.setItem("auth_token", t);
      localStorage.setItem("cmmc_active_org_id", o);
    },
    { t: token, o: ORG_ID }
  );
}

async function takeScreenshot(
  page: Page,
  label: string,
  options: { clip?: { x: number; y: number; width: number; height: number } } = {}
): Promise<string> {
  try {
    const buffer = await page.screenshot({
      fullPage: false,
      ...options,
    });
    return buffer.toString("base64");
  } catch {
    console.warn(`  ⚠  Screenshot failed for: ${label}`);
    return "";
  }
}

async function navigateAndWait(page: Page, url: string, timeout = 12000): Promise<boolean> {
  try {
    await page.goto(url, { waitUntil: "networkidle", timeout });
    return true;
  } catch {
    try {
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 8000 });
      await page.waitForTimeout(2000);
      return true;
    } catch {
      console.warn(`  ⚠  Navigation failed: ${url}`);
      return false;
    }
  }
}

// ─── Guide HTML template ────────────────────────────────────────────────────

function img(b64: string, alt: string, caption: string): string {
  if (!b64) {
    return `<div class="screenshot-placeholder"><span class="placeholder-text">[Screenshot: ${alt}]</span></div>`;
  }
  return `
<figure class="screenshot-figure">
  <img src="data:image/png;base64,${b64}" alt="${alt}" class="screenshot" />
  <figcaption>${caption}</figcaption>
</figure>`;
}

function buildGuideHtml(shots: Map<string, string>): string {
  const s = (key: string) => shots.get(key) ?? "";

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1.0"/>
<title>Control HUB Assessor User Guide — ${ORG_NAME}</title>
<style>
  /* ── Reset & base ── */
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  html { font-size: 10pt; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif;
         color: #1a1a2e; line-height: 1.6; background: #fff; }

  /* ── Page layout ── */
  @page { size: Letter; margin: 1in 0.85in 0.9in 0.85in; }
  @page :first { margin-top: 0; margin-bottom: 0; }

  /* ── Cover page ── */
  .cover {
    page-break-after: always;
    display: flex; flex-direction: column;
    min-height: 10.5in;
    background: linear-gradient(160deg, #0f172a 0%, #1e3a5f 60%, #0f3460 100%);
    color: #fff;
    padding: 0;
    position: relative;
    overflow: hidden;
  }
  .cover-top-band {
    background: #1e40af;
    padding: 18px 60px;
    display: flex; align-items: center; gap: 16px;
  }
  .cover-logo-text {
    font-size: 22px; font-weight: 700; letter-spacing: -0.5px; color: #fff;
  }
  .cover-logo-dot { color: #60a5fa; }
  .cover-body {
    flex: 1; display: flex; flex-direction: column;
    justify-content: center; padding: 60px;
  }
  .cover-badge {
    display: inline-block; background: rgba(96,165,250,0.2);
    border: 1px solid rgba(96,165,250,0.4);
    color: #93c5fd; padding: 4px 14px; border-radius: 20px;
    font-size: 9pt; text-transform: uppercase; letter-spacing: 1px;
    margin-bottom: 24px;
  }
  .cover-title {
    font-size: 34pt; font-weight: 800; line-height: 1.15;
    color: #fff; margin-bottom: 12px;
  }
  .cover-subtitle {
    font-size: 16pt; color: #93c5fd; font-weight: 400; margin-bottom: 40px;
  }
  .cover-org-box {
    background: rgba(255,255,255,0.08);
    border: 1px solid rgba(255,255,255,0.15);
    border-radius: 10px; padding: 20px 28px; max-width: 460px;
    margin-bottom: 40px;
  }
  .cover-org-label { font-size: 8pt; color: #94a3b8; text-transform: uppercase; letter-spacing: 1px; }
  .cover-org-name { font-size: 18pt; font-weight: 700; color: #fff; margin: 4px 0 2px; }
  .cover-org-role { font-size: 10pt; color: #60a5fa; }
  .cover-meta {
    display: flex; gap: 40px;
  }
  .cover-meta-item { }
  .cover-meta-label { font-size: 8pt; color: #94a3b8; text-transform: uppercase; letter-spacing: 1px; }
  .cover-meta-value { font-size: 11pt; color: #e2e8f0; font-weight: 500; margin-top: 2px; }
  .cover-bottom {
    padding: 24px 60px;
    border-top: 1px solid rgba(255,255,255,0.1);
    display: flex; justify-content: space-between; align-items: center;
  }
  .cover-confidential {
    font-size: 9pt; color: #94a3b8;
    display: flex; align-items: center; gap: 6px;
  }
  .confidential-dot {
    width: 6px; height: 6px; border-radius: 50%; background: #f59e0b; display: inline-block;
  }
  .cover-vendor { font-size: 9pt; color: #94a3b8; }

  /* ── TOC ── */
  .toc-page {
    page-break-after: always;
    padding: 48px 0;
  }
  .toc-title {
    font-size: 22pt; font-weight: 700; color: #0f172a;
    border-bottom: 3px solid #1e40af; padding-bottom: 10px;
    margin-bottom: 28px;
  }
  .toc-entry {
    display: flex; justify-content: space-between;
    padding: 6px 0; border-bottom: 1px dotted #e2e8f0;
    font-size: 10pt;
  }
  .toc-entry.toc-section { font-weight: 600; color: #1e3a5f; margin-top: 8px; }
  .toc-entry.toc-sub { padding-left: 20px; color: #475569; font-size: 9.5pt; }
  .toc-page-num { color: #64748b; font-size: 9pt; white-space: nowrap; }

  /* ── Content pages ── */
  .content-page {
    padding: 0;
  }

  /* ── Section headings ── */
  .section {
    page-break-inside: avoid;
    margin-bottom: 32px;
  }
  .section-header {
    background: #f8fafc;
    border-left: 5px solid #1e40af;
    padding: 12px 20px;
    margin-bottom: 18px;
    page-break-after: avoid;
  }
  .section-number {
    font-size: 9pt; color: #1e40af; font-weight: 700;
    text-transform: uppercase; letter-spacing: 0.5px;
  }
  .section-title {
    font-size: 15pt; font-weight: 700; color: #0f172a; margin-top: 2px;
  }
  .subsection-title {
    font-size: 11pt; font-weight: 600; color: #1e3a5f;
    margin: 20px 0 8px; border-bottom: 1px solid #e2e8f0; padding-bottom: 5px;
  }

  /* ── Body text ── */
  p { margin-bottom: 12px; font-size: 10pt; color: #334155; }
  ul, ol { margin: 8px 0 14px 24px; }
  li { margin-bottom: 5px; font-size: 10pt; color: #334155; }
  strong { color: #0f172a; }

  /* ── Info box ── */
  .info-box {
    background: #eff6ff; border: 1px solid #bfdbfe;
    border-radius: 8px; padding: 14px 18px; margin: 14px 0;
  }
  .info-box.warning { background: #fffbeb; border-color: #fde68a; }
  .info-box.success { background: #f0fdf4; border-color: #86efac; }
  .info-box p { margin: 0; font-size: 9.5pt; }
  .info-box-title { font-weight: 700; font-size: 9.5pt; color: #1e40af; margin-bottom: 4px; }
  .info-box.warning .info-box-title { color: #92400e; }
  .info-box.success .info-box-title { color: #15803d; }

  /* ── Tables ── */
  table {
    width: 100%; border-collapse: collapse; margin: 14px 0; font-size: 9.5pt;
  }
  th {
    background: #1e3a5f; color: #fff; padding: 8px 12px;
    text-align: left; font-weight: 600; font-size: 9pt;
  }
  td {
    padding: 7px 12px; border-bottom: 1px solid #e2e8f0; color: #334155;
    vertical-align: top;
  }
  tr:nth-child(even) td { background: #f8fafc; }
  .badge {
    display: inline-block; padding: 2px 8px; border-radius: 12px;
    font-size: 8pt; font-weight: 600;
  }
  .badge-green { background: #dcfce7; color: #15803d; }
  .badge-blue { background: #dbeafe; color: #1d4ed8; }
  .badge-yellow { background: #fef9c3; color: #854d0e; }
  .badge-gray { background: #f1f5f9; color: #475569; }
  .badge-red { background: #fee2e2; color: #b91c1c; }
  .badge-purple { background: #ede9fe; color: #6d28d9; }

  /* ── Screenshots ── */
  .screenshot-figure {
    margin: 18px 0; page-break-inside: avoid;
    border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden;
  }
  .screenshot {
    width: 100%; height: auto; display: block;
  }
  figcaption {
    font-size: 8.5pt; color: #64748b; padding: 7px 12px;
    background: #f8fafc; border-top: 1px solid #e2e8f0;
    font-style: italic;
  }
  .screenshot-placeholder {
    background: #f1f5f9; border: 2px dashed #cbd5e1;
    border-radius: 8px; padding: 40px; text-align: center; margin: 18px 0;
  }
  .placeholder-text { color: #94a3b8; font-size: 9pt; }

  /* ── Step list ── */
  .step-list { list-style: none; margin: 12px 0; padding: 0; }
  .step-list li {
    display: flex; align-items: flex-start; gap: 12px;
    padding: 10px 0; border-bottom: 1px solid #f1f5f9;
  }
  .step-num {
    min-width: 28px; height: 28px; border-radius: 50%;
    background: #1e40af; color: #fff; font-weight: 700;
    font-size: 10pt; display: flex; align-items: center; justify-content: center;
    flex-shrink: 0; margin-top: 1px;
  }
  .step-content { font-size: 10pt; color: #334155; }
  .step-title { font-weight: 600; color: #0f172a; }

  /* ── Footer (print) ── */
  @media print {
    .cover { page-break-after: always; }
    .toc-page { page-break-after: always; }
    .page-break { page-break-before: always; }
  }
  .page-footer {
    position: fixed; bottom: 0; left: 0; right: 0;
    height: 36px; display: flex; justify-content: space-between; align-items: center;
    padding: 0 0.85in;
    border-top: 1px solid #e2e8f0;
    font-size: 8pt; color: #94a3b8;
  }

  /* ── Divider ── */
  hr { border: none; border-top: 1px solid #e2e8f0; margin: 24px 0; }
</style>
</head>
<body>

<!-- ═══════════════════════════════════════════════ COVER PAGE ═══ -->
<div class="cover">
  <div class="cover-top-band">
    <div class="cover-logo-text">Control<span class="cover-logo-dot"> HUB</span></div>
    <div style="color:rgba(255,255,255,0.3); font-size:18px;">|</div>
    <div style="font-size:11pt; color:#93c5fd;">Carme Technology</div>
  </div>

  <div class="cover-body">
    <div class="cover-badge">Assessor Reference Guide</div>
    <div class="cover-title">Control HUB<br/>Assessor User Guide</div>
    <div class="cover-subtitle">CMMC Assessment Review Instructions</div>

    <div class="cover-org-box">
      <div class="cover-org-label">Organization</div>
      <div class="cover-org-name">${ORG_NAME}</div>
      <div class="cover-org-role">CMMC Level 2 — Assessor Read-Only Role</div>
    </div>

    <div class="cover-meta">
      <div class="cover-meta-item">
        <div class="cover-meta-label">Version</div>
        <div class="cover-meta-value">${VERSION}</div>
      </div>
      <div class="cover-meta-item">
        <div class="cover-meta-label">Generated</div>
        <div class="cover-meta-value">${GENERATED_DATE}</div>
      </div>
      <div class="cover-meta-item">
        <div class="cover-meta-label">Prepared By</div>
        <div class="cover-meta-value">Carme Technology</div>
      </div>
    </div>
  </div>

  <div class="cover-bottom">
    <div class="cover-confidential">
      <span class="confidential-dot"></span>
      Confidential — Authorized Assessor Use Only
    </div>
    <div class="cover-vendor">info@carmetechnology.com</div>
  </div>
</div>

<!-- ═══════════════════════════════════════════════ TABLE OF CONTENTS ═══ -->
<div class="toc-page content-page">
  <div class="toc-title">Table of Contents</div>

  <div class="toc-entry toc-section"><span>Section 1 — Purpose of This Guide</span><span class="toc-page-num">3</span></div>
  <div class="toc-entry toc-section"><span>Section 2 — Assessor Access Overview</span><span class="toc-page-num">3</span></div>
  <div class="toc-entry toc-section"><span>Section 3 — What the Assessor Can Do</span><span class="toc-page-num">3</span></div>
  <div class="toc-entry toc-section"><span>Section 4 — What the Assessor Cannot Do</span><span class="toc-page-num">4</span></div>
  <div class="toc-entry toc-section"><span>Section 5 — Logging In</span><span class="toc-page-num">4</span></div>
  <div class="toc-entry toc-section"><span>Section 6 — Selecting ${ORG_NAME}</span><span class="toc-page-num">5</span></div>
  <div class="toc-entry toc-section"><span>Section 7 — Dashboard Overview</span><span class="toc-page-num">5</span></div>
  <div class="toc-entry toc-section"><span>Section 8 — Reviewing Controls</span><span class="toc-page-num">6</span></div>
  <div class="toc-entry toc-section"><span>Section 9 — Reviewing a Control (Detail View)</span><span class="toc-page-num">7</span></div>
  <div class="toc-entry toc-section"><span>Section 10 — Reviewing Evidence</span><span class="toc-page-num">8</span></div>
  <div class="toc-entry toc-section"><span>Section 11 — Previewing and Downloading Evidence</span><span class="toc-page-num">9</span></div>
  <div class="toc-entry toc-section"><span>Section 12 — Evidence Repository</span><span class="toc-page-num">9</span></div>
  <div class="toc-entry toc-section"><span>Section 13 — Documentation</span><span class="toc-page-num">10</span></div>
  <div class="toc-entry toc-section"><span>Section 14 — SSP Review</span><span class="toc-page-num">10</span></div>
  <div class="toc-entry toc-section"><span>Section 15 — Monitoring Tracker</span><span class="toc-page-num">11</span></div>
  <div class="toc-entry toc-section"><span>Section 16 — POA&amp;M Review</span><span class="toc-page-num">12</span></div>
  <div class="toc-entry toc-section"><span>Section 17 — Reports</span><span class="toc-page-num">12</span></div>
  <div class="toc-entry toc-section"><span>Section 18 — Recommended Assessor Workflow</span><span class="toc-page-num">13</span></div>
  <div class="toc-entry toc-section"><span>Section 19 — Troubleshooting</span><span class="toc-page-num">14</span></div>
  <div class="toc-entry toc-section"><span>Section 20 — Contact &amp; Support</span><span class="toc-page-num">14</span></div>
</div>

<!-- ═══════════════════════════════════════════════ CONTENT ═══ -->
<div class="content-page">

<!-- ─── Section 1 ─── -->
<div class="section">
  <div class="section-header">
    <div class="section-number">Section 1</div>
    <div class="section-title">Purpose of This Guide</div>
  </div>
  <p>This guide provides instructions for assessors reviewing <strong>${ORG_NAME}</strong> within <strong>Control HUB</strong>, the CMMC Compliance Readiness &amp; Evidence Management Platform operated by Carme Technology.</p>
  <p>The Assessor role is <strong>read-only</strong> and is designed to help external reviewers locate controls, evidence, documents, SSP narratives, monitoring records, POA&amp;M items, and reports — without the ability to modify any system records.</p>
  <div class="info-box">
    <div class="info-box-title">📋 What This Guide Covers</div>
    <p>Navigation, access overview, screen-by-screen instructions, recommended review workflow, troubleshooting steps, and contact information for ${ORG_NAME} within Control HUB.</p>
  </div>
</div>

<!-- ─── Section 2 ─── -->
<div class="section">
  <div class="section-header">
    <div class="section-number">Section 2</div>
    <div class="section-title">Assessor Access Overview</div>
  </div>
  <p>The <strong>Assessor</strong> role provides read-only access to ${ORG_NAME}'s compliance data within Control HUB. This role was designed specifically for external CMMC assessors performing Third-Party Assessment Organization (C3PAO) reviews.</p>
  <table>
    <thead>
      <tr><th>Access Level</th><th>Description</th></tr>
    </thead>
    <tbody>
      <tr><td><strong>Read-Only</strong></td><td>All data visible to the assessor is read-only. No edits, uploads, or status changes are permitted.</td></tr>
      <tr><td><strong>Evidence Access</strong></td><td>Assessor can view approved, active, and assessor-ready evidence artifacts.</td></tr>
      <tr><td><strong>Org Scoped</strong></td><td>Assessor can only see data belonging to ${ORG_NAME}.</td></tr>
      <tr><td><strong>No Admin Functions</strong></td><td>User management, settings, security center, and tenant connections are not accessible.</td></tr>
    </tbody>
  </table>
</div>

<!-- ─── Section 3 ─── -->
<div class="section">
  <div class="section-header">
    <div class="section-number">Section 3</div>
    <div class="section-title">What the Assessor Can Do</div>
  </div>
  <p>The following actions are available to the Assessor role within ${ORG_NAME}:</p>
  <ul>
    <li>View the <strong>Compliance Dashboard</strong> — overall readiness score, domain progress, recent activity</li>
    <li>Browse the <strong>Controls Library</strong> — search, filter, and open individual controls</li>
    <li>Read <strong>Implementation Narratives</strong> — how ${ORG_NAME} implements each CMMC control</li>
    <li>View <strong>Evidence Metadata</strong> — title, type, status, linked controls, collection date, owner</li>
    <li><strong>Preview evidence files</strong> — images, PDFs, text files, Office documents (where supported)</li>
    <li><strong>Download evidence files</strong> — save artifacts locally for offline review</li>
    <li>Browse the <strong>Evidence Repository</strong> — search and filter the full evidence inventory</li>
    <li>Access <strong>Documentation</strong> — policies, procedures, logs, and generated records</li>
    <li>Review <strong>SSP mappings</strong> — System Security Plan narratives per control</li>
    <li>View the <strong>Monitoring Tracker</strong> — recurring operational activities, status, and schedules</li>
    <li>Review <strong>POA&amp;M items</strong> — open gaps, remediation plans, risk levels, and target dates</li>
    <li>Access the <strong>Assessor view</strong> — a dedicated read-only control review interface</li>
    <li>Use the <strong>Help Center</strong> — in-app user guide and FAQ</li>
  </ul>
</div>

<!-- ─── Section 4 ─── -->
<div class="section">
  <div class="section-header">
    <div class="section-number">Section 4</div>
    <div class="section-title">What the Assessor Cannot Do</div>
  </div>
  <p>The Assessor role is strictly read-only. The following actions are <strong>not available</strong> and will be blocked by the system:</p>
  <ul>
    <li>Add, edit, or delete evidence</li>
    <li>Upload files or attachments</li>
    <li>Change the status of any evidence, control, or document</li>
    <li>Edit implementation narratives or control records</li>
    <li>Edit or create SSP content</li>
    <li>Edit the Monitoring Tracker (view only)</li>
    <li>Create, edit, or close POA&amp;M items</li>
    <li>Create or manage users</li>
    <li>Access Settings or Security Center</li>
    <li>Connect Microsoft tenants or run scans</li>
    <li>Generate or regenerate reports</li>
    <li>Delete any records</li>
  </ul>
  <div class="info-box warning">
    <div class="info-box-title">⚠ Read-Only Enforcement</div>
    <p>Attempting to perform any write operation will result in an "Access Denied" response from the system. If you believe you have been granted incorrect permissions, contact the ${ORG_NAME} Control HUB administrator.</p>
  </div>
</div>

<!-- ─── Section 5 ─── -->
<div class="section page-break">
  <div class="section-header">
    <div class="section-number">Section 5</div>
    <div class="section-title">Logging In</div>
  </div>
  <p>Control HUB uses email/password authentication with optional Multi-Factor Authentication (MFA). Your assessor credentials will be provided by the ${ORG_NAME} compliance administrator prior to the review.</p>

  ${img(s("login"), "Control HUB Login Screen", "Figure 5.1 — Control HUB login page. Enter your assigned assessor email and password.")}

  <ol>
    <li>Open your web browser and navigate to the Control HUB URL provided by ${ORG_NAME}.</li>
    <li>Enter your assigned <strong>email address</strong> in the Email field.</li>
    <li>Enter your <strong>password</strong> in the Password field.</li>
    <li>Click <strong>Sign In</strong>.</li>
    <li>If MFA is required, complete the authenticator code prompt using your assigned MFA app.</li>
    <li>Upon successful login, you will be directed to the <strong>Compliance Dashboard</strong>.</li>
  </ol>

  <div class="info-box">
    <div class="info-box-title">🔐 Login Assistance</div>
    <p>If you cannot log in, cannot find your credentials, or are locked out, contact the ${ORG_NAME} Control HUB administrator or email <strong>info@carmetechnology.com</strong>.</p>
  </div>
</div>

<!-- ─── Section 6 ─── -->
<div class="section">
  <div class="section-header">
    <div class="section-number">Section 6</div>
    <div class="section-title">Selecting ${ORG_NAME}</div>
  </div>
  <p>Control HUB supports multiple organizations. After logging in, confirm that <strong>${ORG_NAME}</strong> is the selected organization in the top-left of the sidebar.</p>
  <p>If you have access to only one organization, it will be pre-selected automatically. If you see a different organization name, click the organization selector in the sidebar to switch to <strong>${ORG_NAME}</strong>.</p>

  ${img(s("dashboard"), "Organization Selector — Sidebar", "Figure 6.1 — The active organization appears in the top-left corner of the sidebar. Confirm \"" + ORG_NAME + "\" is displayed.")}

  <div class="info-box">
    <div class="info-box-title">ℹ Organization Scope</div>
    <p>All data shown in Control HUB — controls, evidence, documents, monitoring, and POA&amp;Ms — is scoped to the selected organization. Only data belonging to <strong>${ORG_NAME}</strong> will be visible to the assessor.</p>
  </div>
</div>

<!-- ─── Section 7 ─── -->
<div class="section page-break">
  <div class="section-header">
    <div class="section-number">Section 7</div>
    <div class="section-title">Dashboard Overview</div>
  </div>
  <p>The <strong>Compliance Dashboard</strong> is the first screen after login. It provides a summary of ${ORG_NAME}'s overall CMMC readiness at a glance.</p>

  ${img(s("dashboard"), "VTCCORP.US Compliance Dashboard", "Figure 7.1 — The " + ORG_NAME + " Compliance Dashboard showing readiness KPIs, domain progress, and recent activity.")}

  <div class="subsection-title">Dashboard Elements</div>
  <table>
    <thead><tr><th>Element</th><th>Description</th></tr></thead>
    <tbody>
      <tr><td><strong>Overall Readiness Score</strong></td><td>Percentage of controls in a compliant or in-progress state across all 14 CMMC domains.</td></tr>
      <tr><td><strong>Controls Status</strong></td><td>Total controls assessed: implemented, in progress, not started, not applicable.</td></tr>
      <tr><td><strong>Evidence Health</strong></td><td>Summary of evidence items by status — approved, pending, stale, or archived.</td></tr>
      <tr><td><strong>Monitoring Status</strong></td><td>Count of monitoring items that are current, due soon, or overdue.</td></tr>
      <tr><td><strong>POA&amp;M Health</strong></td><td>Open POA&amp;M items by risk level and remediation status.</td></tr>
      <tr><td><strong>Domain Readiness</strong></td><td>Per-domain readiness breakdown across all 14 CMMC L2 domains.</td></tr>
      <tr><td><strong>Recent Activity</strong></td><td>Audit trail of recent compliance actions within ${ORG_NAME}.</td></tr>
      <tr><td><strong>Recommended Actions</strong></td><td>Priority items flagged for immediate attention.</td></tr>
    </tbody>
  </table>
</div>

<!-- ─── Section 8 ─── -->
<div class="section page-break">
  <div class="section-header">
    <div class="section-number">Section 8</div>
    <div class="section-title">Reviewing Controls</div>
  </div>
  <p>The <strong>Controls Library</strong> contains all 110 CMMC Level 2 controls applicable to ${ORG_NAME}. To navigate to it, click <strong>Controls</strong> in the left sidebar.</p>

  ${img(s("controls"), "Controls Library — " + ORG_NAME, "Figure 8.1 — The Controls Library listing all 110 CMMC L2 controls with their domain, level, assessment status, and evidence count.")}

  <div class="subsection-title">Controls Table Columns</div>
  <table>
    <thead><tr><th>Column</th><th>Description</th></tr></thead>
    <tbody>
      <tr><td><strong>Control ID</strong></td><td>CMMC control identifier (e.g., AC.L1-3.1.1). Click to open the control detail view.</td></tr>
      <tr><td><strong>Title</strong></td><td>Plain-language control name.</td></tr>
      <tr><td><strong>Domain</strong></td><td>One of the 14 CMMC domains (e.g., Access Control, Audit &amp; Accountability).</td></tr>
      <tr><td><strong>Level</strong></td><td>CMMC maturity level: L1 (Foundational) or L2 (Advanced).</td></tr>
      <tr><td><strong>Status</strong></td><td>Assessment status: Implemented, In Progress, Not Started, or Not Applicable.</td></tr>
      <tr><td><strong>Evidence</strong></td><td>Count of evidence items linked to this control.</td></tr>
    </tbody>
  </table>

  <div class="subsection-title">Searching and Filtering</div>
  <ul>
    <li>Use the <strong>Search</strong> box to find controls by ID, title, or keyword.</li>
    <li>Use the <strong>Domain</strong> filter to narrow to a specific CMMC domain.</li>
    <li>Use the <strong>Status</strong> filter to show controls by assessment state.</li>
    <li>Use the <strong>Level</strong> filter to toggle between L1 and L2 controls.</li>
    <li>Click any <strong>Control ID</strong> to open the full control detail.</li>
  </ul>
</div>

<!-- ─── Section 9 ─── -->
<div class="section page-break">
  <div class="section-header">
    <div class="section-number">Section 9</div>
    <div class="section-title">Reviewing a Control (Detail View)</div>
  </div>
  <p>Clicking a control ID from the Controls Library opens the <strong>Control Detail</strong> page. This page contains all assessment information for a single control across multiple tabs.</p>

  ${img(s("control_detail"), "Control Detail — Implementation Tab", "Figure 9.1 — Control detail view showing the implementation tab with narrative, assessment status, and linked information.")}

  <div class="subsection-title">Control Detail Tabs</div>
  <table>
    <thead><tr><th>Tab</th><th>Contents</th></tr></thead>
    <tbody>
      <tr><td><strong>Implementation</strong></td><td>Assessment status and the implementation narrative — a written description of how ${ORG_NAME} implements this control. Read-only for assessors.</td></tr>
      <tr><td><strong>Evidence</strong></td><td>List of evidence artifacts linked to this control. Each row shows evidence title, type, status, date, and preview/download actions.</td></tr>
      <tr><td><strong>Monitoring</strong></td><td>Recurring operational monitoring items associated with this control, including schedule and status.</td></tr>
      <tr><td><strong>POA&amp;M</strong></td><td>Any open Plan of Action &amp; Milestones items tied to this control — gaps, risk level, owner, and target date.</td></tr>
      <tr><td><strong>SSP</strong></td><td>System Security Plan mapping for this control — implementation narrative in SSP format.</td></tr>
      <tr><td><strong>Tasks</strong></td><td>Open remediation or compliance tasks associated with this control (if any).</td></tr>
    </tbody>
  </table>

  <div class="info-box">
    <div class="info-box-title">📝 Implementation Narratives</div>
    <p>The Implementation tab contains ${ORG_NAME}'s written explanation of how the control is addressed. This is a key artifact for assessment. If the narrative is empty, the control may not yet have been documented — note this in your assessment findings.</p>
  </div>

  ${img(s("control_evidence_tab"), "Control Detail — Evidence Tab", "Figure 9.2 — The Evidence tab within a control detail, listing all linked evidence artifacts with status and download options.")}
</div>

<!-- ─── Section 10 ─── -->
<div class="section page-break">
  <div class="section-header">
    <div class="section-number">Section 10</div>
    <div class="section-title">Reviewing Evidence</div>
  </div>
  <p>Evidence items are the supporting artifacts that demonstrate ${ORG_NAME}'s compliance with each CMMC control. Evidence can be viewed from the Control Detail Evidence tab, the Evidence Repository, or an Evidence Detail page.</p>

  ${img(s("evidence_detail"), "Evidence Detail Page", "Figure 10.1 — Evidence detail page showing metadata, file card, preview, linked controls, and ownership information.")}

  <div class="subsection-title">Evidence Metadata Fields</div>
  <table>
    <thead><tr><th>Field</th><th>Description</th></tr></thead>
    <tbody>
      <tr><td><strong>Title</strong></td><td>Descriptive name of the evidence item.</td></tr>
      <tr><td><strong>Type</strong></td><td>Category: Policy, Procedure, Screenshot, Log, Certificate, Contract, Configuration, etc.</td></tr>
      <tr><td><strong>Status</strong></td><td>Current lifecycle state (see Evidence Status table below).</td></tr>
      <tr><td><strong>Collection Date</strong></td><td>When the evidence was originally collected or created.</td></tr>
      <tr><td><strong>Owner</strong></td><td>The ${ORG_NAME} team member responsible for this evidence item.</td></tr>
      <tr><td><strong>Linked Controls</strong></td><td>Which CMMC controls this evidence supports.</td></tr>
      <tr><td><strong>Tags</strong></td><td>Optional keyword tags for filtering and search.</td></tr>
      <tr><td><strong>Summary</strong></td><td>Free-text description of what the evidence demonstrates.</td></tr>
    </tbody>
  </table>

  <div class="subsection-title">Evidence Status Definitions</div>
  <table>
    <thead><tr><th>Status</th><th>Meaning</th><th>Assessor Relevance</th></tr></thead>
    <tbody>
      <tr><td><span class="badge badge-blue">Approved</span></td><td>Evidence has been reviewed and approved by ${ORG_NAME} compliance team.</td><td>Primary review status — fully acceptable for assessment.</td></tr>
      <tr><td><span class="badge badge-green">Active</span></td><td>Evidence is current and in active use as a control support artifact.</td><td>Valid for assessment review.</td></tr>
      <tr><td><span class="badge badge-purple">Assessor Ready</span></td><td>Evidence has been specifically prepared and cleared for assessor review.</td><td>Primary review status — intended for assessors.</td></tr>
      <tr><td><span class="badge badge-yellow">Pending Review</span></td><td>Evidence awaiting internal approval.</td><td>May be viewed; not yet formally approved.</td></tr>
      <tr><td><span class="badge badge-gray">Draft</span></td><td>Work-in-progress evidence, not yet submitted for review.</td><td>Available to view but not formally approved.</td></tr>
      <tr><td><span class="badge badge-red">Stale</span></td><td>Evidence is outdated and may no longer be current.</td><td>Flag for follow-up — ask administrator about replacement.</td></tr>
      <tr><td><span class="badge badge-gray">Archived</span></td><td>Evidence has been retired from active use.</td><td>Historical record only — not a current control support artifact.</td></tr>
    </tbody>
  </table>
  <p><strong>For assessment purposes</strong>, focus primarily on evidence with <strong>Approved</strong>, <strong>Active</strong>, or <strong>Assessor Ready</strong> status.</p>
</div>

<!-- ─── Section 11 ─── -->
<div class="section page-break">
  <div class="section-header">
    <div class="section-number">Section 11</div>
    <div class="section-title">Previewing and Downloading Evidence</div>
  </div>
  <p>Control HUB supports in-browser file preview for many common file types, as well as direct download for offline review.</p>

  <div class="subsection-title">How to Preview Evidence</div>
  <ol>
    <li>Open an evidence item (from the Evidence Repository or a Control's Evidence tab).</li>
    <li>Locate the <strong>File Preview</strong> card on the Evidence Detail page.</li>
    <li>The file will automatically preview if the format is supported.</li>
    <li>Use the <strong>zoom controls</strong> (images) or scroll (PDFs, text) to read the content.</li>
    <li>Click the <strong>Fullscreen</strong> icon for an expanded view.</li>
  </ol>

  <div class="subsection-title">Supported Preview Types</div>
  <table>
    <thead><tr><th>Format</th><th>Preview Type</th><th>Notes</th></tr></thead>
    <tbody>
      <tr><td>PNG, JPG, GIF, WebP, SVG</td><td>Image viewer with zoom and pan</td><td>Drag to pan, scroll wheel to zoom</td></tr>
      <tr><td>PDF</td><td>Embedded PDF viewer</td><td>Full scrolling, fullscreen available</td></tr>
      <tr><td>TXT, CSV, LOG, JSON, YAML</td><td>Monospace text viewer</td><td>200 KB limit — larger files prompt download</td></tr>
      <tr><td>DOCX</td><td>Converted HTML preview</td><td>Server converts to styled HTML</td></tr>
      <tr><td>XLSX</td><td>Sheet-tab table viewer</td><td>Tabs for each worksheet</td></tr>
      <tr><td>Other formats</td><td>Download prompt only</td><td>Click Download to save locally</td></tr>
    </tbody>
  </table>

  <div class="subsection-title">How to Download Evidence</div>
  <ol>
    <li>Open the evidence detail page.</li>
    <li>Click the <strong>Download</strong> button (arrow-down icon) in the file card header.</li>
    <li>The browser will download the original file to your local machine.</li>
  </ol>

  <div class="info-box">
    <div class="info-box-title">ℹ Preview Not Loading</div>
    <p>If a file preview does not load, use the Download button to save the file and open it locally with the appropriate application. Contact the ${ORG_NAME} administrator if you encounter persistent access issues.</p>
  </div>
</div>

<!-- ─── Section 12 ─── -->
<div class="section page-break">
  <div class="section-header">
    <div class="section-number">Section 12</div>
    <div class="section-title">Evidence Repository</div>
  </div>
  <p>The <strong>Evidence Repository</strong> provides a searchable, filterable list of all evidence items for ${ORG_NAME}. Navigate to it by clicking <strong>Evidence</strong> in the left sidebar.</p>

  ${img(s("evidence"), "Evidence Repository", "Figure 12.1 — The Evidence Repository showing all " + ORG_NAME + " evidence with search and filter capabilities.")}

  <div class="subsection-title">Filtering Evidence</div>
  <ul>
    <li><strong>Search</strong> — Find evidence by title, file name, control ID, tag, or summary keyword.</li>
    <li><strong>Status filter</strong> — Show only Approved, Active, Assessor Ready, or other statuses.</li>
    <li><strong>Type filter</strong> — Narrow to a specific evidence type (Policy, Screenshot, Log, etc.).</li>
    <li><strong>Domain filter</strong> — Show evidence linked to a specific CMMC domain.</li>
    <li><strong>Owner filter</strong> — Filter by the evidence owner/responsible party.</li>
  </ul>
  <p>Click any row to open the full Evidence Detail page for that item.</p>
</div>

<!-- ─── Section 13 ─── -->
<div class="section page-break">
  <div class="section-header">
    <div class="section-number">Section 13</div>
    <div class="section-title">Documentation</div>
  </div>
  <p>The <strong>Documents</strong> section contains ${ORG_NAME}'s formal compliance documentation — policies, procedures, logs, and records — separate from individual evidence artifacts. Navigate by clicking <strong>Documents</strong> in the sidebar, then selecting <strong>All Documents</strong>.</p>

  ${img(s("documents"), "All Documents — " + ORG_NAME, "Figure 13.1 — The Documents list showing all policies, procedures, and compliance records with linked controls and status.")}

  <div class="subsection-title">Document Types</div>
  <table>
    <thead><tr><th>Type</th><th>Description</th></tr></thead>
    <tbody>
      <tr><td><strong>Policy</strong></td><td>Formal organizational policies (e.g., Access Control Policy, Incident Response Policy).</td></tr>
      <tr><td><strong>Procedure</strong></td><td>Step-by-step operational procedures that implement policies.</td></tr>
      <tr><td><strong>Log</strong></td><td>Compliance log instances — completed periodic review records.</td></tr>
      <tr><td><strong>Record</strong></td><td>Formal compliance records (e.g., training completion records, risk assessments).</td></tr>
      <tr><td><strong>Report</strong></td><td>Generated compliance reports and assessments.</td></tr>
    </tbody>
  </table>
  <p>Click any document row to open the document detail, where you can view metadata, linked controls, version history, and the document content or file.</p>
</div>

<!-- ─── Section 14 ─── -->
<div class="section page-break">
  <div class="section-header">
    <div class="section-number">Section 14</div>
    <div class="section-title">SSP Review</div>
  </div>
  <p>The <strong>System Security Plan (SSP)</strong> describes how ${ORG_NAME} implements each CMMC security requirement. For assessors, SSP narratives can be accessed through the <strong>SSP tab</strong> on individual control detail pages, or through the Assessor view.</p>

  <div class="subsection-title">Accessing SSP Narratives</div>
  <ol>
    <li>Navigate to <strong>Controls</strong> in the sidebar.</li>
    <li>Click any <strong>Control ID</strong> to open the control detail page.</li>
    <li>Select the <strong>SSP</strong> tab to view the SSP-formatted implementation narrative for that control.</li>
    <li>The SSP tab shows the control's implementation status, narrative text, and assessment scope.</li>
  </ol>

  <div class="subsection-title">Assessor Control Review View</div>
  <p>Control HUB includes a dedicated <strong>Assessor</strong> view accessible from the sidebar. This view presents controls in a format optimized for assessment review, showing implementation narratives, evidence summaries, and linked artifacts per control in a single interface.</p>

  ${img(s("assessor"), "Assessor Control Review View", "Figure 14.1 — The Assessor view provides a read-only interface for reviewing all controls, narratives, and evidence in one place.")}

  <div class="info-box">
    <div class="info-box-title">📌 Using the Assessor View</div>
    <p>The Assessor view is located in the sidebar under <strong>Assessor View</strong>. It is the primary interface for structured CMMC assessment reviews. Each control package includes the implementation narrative, linked evidence, monitoring summary, and POA&amp;M status.</p>
  </div>
</div>

<!-- ─── Section 15 ─── -->
<div class="section page-break">
  <div class="section-header">
    <div class="section-number">Section 15</div>
    <div class="section-title">Monitoring Tracker</div>
  </div>
  <p>The <strong>Monitoring Tracker</strong> records ${ORG_NAME}'s recurring operational monitoring activities required for CMMC Level 2 compliance. Navigate by clicking <strong>Monitoring</strong> in the left sidebar.</p>

  ${img(s("monitoring"), "Monitoring Tracker — " + ORG_NAME, "Figure 15.1 — The Monitoring Tracker showing 19 recurring CMMC L2 monitoring activities with frequency, schedule, and current status.")}

  <div class="subsection-title">Monitoring Tracker Columns</div>
  <table>
    <thead><tr><th>Column</th><th>Description</th></tr></thead>
    <tbody>
      <tr><td><strong>Activity</strong></td><td>The name of the recurring monitoring activity (e.g., Vulnerability Scanning, Log Review).</td></tr>
      <tr><td><strong>Control</strong></td><td>The CMMC control this activity supports.</td></tr>
      <tr><td><strong>Frequency</strong></td><td>How often the activity must be performed: Daily, Weekly, Monthly, Quarterly, Annually.</td></tr>
      <tr><td><strong>Last Completed</strong></td><td>Date the activity was most recently completed.</td></tr>
      <tr><td><strong>Next Due</strong></td><td>When the activity is next scheduled to be completed.</td></tr>
      <tr><td><strong>Status</strong></td><td>Current status: Current (completed on time), Due Soon (within threshold), or Overdue.</td></tr>
      <tr><td><strong>Notes</strong></td><td>Free-text notes or findings from the most recent completion.</td></tr>
    </tbody>
  </table>

  <div class="subsection-title">Status Meanings</div>
  <ul>
    <li><span class="badge badge-green">Current</span> — Activity has been completed for the current cycle. No action needed.</li>
    <li><span class="badge badge-yellow">Due Soon</span> — Activity is approaching its due date. ${ORG_NAME} should complete it soon.</li>
    <li><span class="badge badge-red">Overdue</span> — Activity has passed its due date. This represents a compliance gap that should be noted in assessment findings.</li>
  </ul>
</div>

<!-- ─── Section 16 ─── -->
<div class="section page-break">
  <div class="section-header">
    <div class="section-number">Section 16</div>
    <div class="section-title">POA&amp;M Review</div>
  </div>
  <p>The <strong>Plan of Action &amp; Milestones (POA&amp;M)</strong> register tracks known compliance gaps and their remediation plans. Navigate by clicking <strong>POA&amp;M</strong> in the left sidebar.</p>

  ${img(s("poams"), "POA&M Register — " + ORG_NAME, "Figure 16.1 — The POA&M register listing open gaps, risk levels, owners, target dates, and linked controls.")}

  <div class="subsection-title">POA&amp;M Fields for Assessors</div>
  <table>
    <thead><tr><th>Field</th><th>Description</th></tr></thead>
    <tbody>
      <tr><td><strong>Control</strong></td><td>The CMMC control this POA&amp;M item addresses.</td></tr>
      <tr><td><strong>Weakness</strong></td><td>Description of the identified gap or non-compliance.</td></tr>
      <tr><td><strong>Risk Level</strong></td><td>High, Medium, or Low — the assessed risk of the gap.</td></tr>
      <tr><td><strong>Status</strong></td><td>Open, In Progress, or Closed.</td></tr>
      <tr><td><strong>Owner</strong></td><td>${ORG_NAME} team member responsible for remediation.</td></tr>
      <tr><td><strong>Target Date</strong></td><td>Planned completion date for remediation.</td></tr>
      <tr><td><strong>Milestones</strong></td><td>Step-by-step remediation tasks with target dates.</td></tr>
    </tbody>
  </table>

  <div class="info-box">
    <div class="info-box-title">📋 Assessment Use of POA&amp;Ms</div>
    <p>Open POA&amp;Ms represent known deficiencies that ${ORG_NAME} has acknowledged and is actively remediating. Closed POA&amp;Ms indicate completed remediation. Review both open and recently closed items as part of your assessment.</p>
  </div>
</div>

<!-- ─── Section 17 ─── -->
<div class="section page-break">
  <div class="section-header">
    <div class="section-number">Section 17</div>
    <div class="section-title">Reports</div>
  </div>
  <p>Control HUB generates several compliance reports. These are accessible through the <strong>Assessor</strong> view, which provides export options for key compliance packages. Reports can be downloaded as PDF files.</p>

  <div class="subsection-title">Reports Available to Assessors</div>
  <table>
    <thead><tr><th>Report</th><th>Contents</th></tr></thead>
    <tbody>
      <tr><td><strong>Executive Readiness</strong></td><td>High-level compliance dashboard — overall readiness score, domain summary, key metrics.</td></tr>
      <tr><td><strong>Domain Readiness</strong></td><td>Per-domain compliance breakdown across all 14 CMMC domains.</td></tr>
      <tr><td><strong>Evidence Inventory</strong></td><td>Complete list of evidence items with status, type, and control links.</td></tr>
      <tr><td><strong>POA&amp;M Report</strong></td><td>All open and closed POA&amp;M items — gaps, risk levels, owners, target dates.</td></tr>
      <tr><td><strong>Monitoring Tracker Report</strong></td><td>All 19 monitoring activities with status and schedule information.</td></tr>
      <tr><td><strong>SSP Summary</strong></td><td>Implementation narratives per control in SSP format.</td></tr>
      <tr><td><strong>Assessor Package</strong></td><td>Full assessment package per control — generated from the Assessor view.</td></tr>
    </tbody>
  </table>

  <div class="subsection-title">How to Access Reports</div>
  <ol>
    <li>Click <strong>Assessor View</strong> in the left sidebar.</li>
    <li>The Assessor view provides per-control export packages.</li>
    <li>Individual control packages can be exported from the Assessor control detail page.</li>
    <li>For summary reports, the ${ORG_NAME} administrator can generate and share report files directly.</li>
  </ol>
</div>

<!-- ─── Section 18 ─── -->
<div class="section page-break">
  <div class="section-header">
    <div class="section-number">Section 18</div>
    <div class="section-title">Recommended Assessor Workflow</div>
  </div>
  <p>Follow this step-by-step sequence to conduct an efficient assessment review of ${ORG_NAME} in Control HUB:</p>

  <ol class="step-list">
    <li>
      <div class="step-num">1</div>
      <div class="step-content">
        <div class="step-title">Log in to Control HUB</div>
        Use your assigned assessor credentials. Complete MFA if prompted. See Section 5.
      </div>
    </li>
    <li>
      <div class="step-num">2</div>
      <div class="step-content">
        <div class="step-title">Confirm ${ORG_NAME} is selected</div>
        Verify the organization name in the top-left sidebar. If incorrect, switch organizations using the selector. See Section 6.
      </div>
    </li>
    <li>
      <div class="step-num">3</div>
      <div class="step-content">
        <div class="step-title">Review the Compliance Dashboard</div>
        Note the overall readiness score, domain readiness, and any flagged overdue items. See Section 7.
      </div>
    </li>
    <li>
      <div class="step-num">4</div>
      <div class="step-content">
        <div class="step-title">Navigate to Assessor View</div>
        Click <strong>Assessor View</strong> in the sidebar. This provides a structured control-by-control review interface.
      </div>
    </li>
    <li>
      <div class="step-num">5</div>
      <div class="step-content">
        <div class="step-title">Search for the control being reviewed</div>
        In the Controls Library or Assessor View, search by control ID (e.g., AC.L1-3.1.1) or keyword. See Section 8.
      </div>
    </li>
    <li>
      <div class="step-num">6</div>
      <div class="step-content">
        <div class="step-title">Review the Implementation narrative</div>
        Open the control detail, select the <strong>Implementation</strong> tab, and read ${ORG_NAME}'s written description of how the control is addressed. See Section 9.
      </div>
    </li>
    <li>
      <div class="step-num">7</div>
      <div class="step-content">
        <div class="step-title">Review the Evidence tab</div>
        Select the <strong>Evidence</strong> tab on the control detail. Review linked evidence items — their status, type, and date. See Section 9.
      </div>
    </li>
    <li>
      <div class="step-num">8</div>
      <div class="step-content">
        <div class="step-title">Open and preview / download evidence</div>
        Click any evidence row to open the Evidence Detail. Use the preview panel or Download button to review the artifact. See Sections 10–11.
      </div>
    </li>
    <li>
      <div class="step-num">9</div>
      <div class="step-content">
        <div class="step-title">Review the SSP mapping</div>
        Select the <strong>SSP</strong> tab on the control detail to read the System Security Plan narrative. See Section 14.
      </div>
    </li>
    <li>
      <div class="step-num">10</div>
      <div class="step-content">
        <div class="step-title">Check Monitoring and POA&amp;M (if applicable)</div>
        Select the <strong>Monitoring</strong> or <strong>POA&amp;M</strong> tabs on the control detail to see operational monitoring activities and any open remediation items. See Sections 15–16.
      </div>
    </li>
    <li>
      <div class="step-num">11</div>
      <div class="step-content">
        <div class="step-title">Use Reports for summary views</div>
        Use the Assessor view export function or request reports from the ${ORG_NAME} administrator for aggregate compliance data. See Section 17.
      </div>
    </li>
    <li>
      <div class="step-num">12</div>
      <div class="step-content">
        <div class="step-title">Contact the administrator if something is missing</div>
        If expected evidence, documentation, or control narratives are not visible, contact the ${ORG_NAME} Control HUB administrator or email info@carmetechnology.com. See Section 20.
      </div>
    </li>
  </ol>
</div>

<!-- ─── Section 19 ─── -->
<div class="section page-break">
  <div class="section-header">
    <div class="section-number">Section 19</div>
    <div class="section-title">Troubleshooting</div>
  </div>

  <table>
    <thead><tr><th>Issue</th><th>Likely Cause</th><th>Resolution</th></tr></thead>
    <tbody>
      <tr>
        <td><strong>Cannot log in</strong></td>
        <td>Incorrect credentials, account not yet created, or account locked.</td>
        <td>Verify email and password. Contact the ${ORG_NAME} administrator to confirm your account is active. See Section 20.</td>
      </tr>
      <tr>
        <td><strong>Cannot see ${ORG_NAME}</strong></td>
        <td>Assessor account not added to the ${ORG_NAME} organization in Control HUB.</td>
        <td>Contact the ${ORG_NAME} administrator to verify your org membership.</td>
      </tr>
      <tr>
        <td><strong>Evidence preview not loading</strong></td>
        <td>Unsupported file type, large file, or temporary server issue.</td>
        <td>Click the <strong>Download</strong> button to save the file locally. If the file is missing entirely, contact the administrator.</td>
      </tr>
      <tr>
        <td><strong>Download does not work</strong></td>
        <td>Browser pop-up blocker may be preventing the download dialog.</td>
        <td>Check your browser's pop-up/download settings and allow downloads from the Control HUB domain.</td>
      </tr>
      <tr>
        <td><strong>Cannot find a control</strong></td>
        <td>Search term may not match the control ID format, or the control may have a different status filter applied.</td>
        <td>Use the exact CMMC control ID (e.g., AC.L1-3.1.1). Clear all filters and search again.</td>
      </tr>
      <tr>
        <td><strong>Report does not download</strong></td>
        <td>Report generation may require admin privileges or may not yet be generated.</td>
        <td>Request the report from the ${ORG_NAME} administrator directly.</td>
      </tr>
      <tr>
        <td><strong>Access appears too broad</strong></td>
        <td>Your account may have been assigned an incorrect role (non-assessor).</td>
        <td>Contact the ${ORG_NAME} administrator to verify your role assignment is set to <strong>Assessor</strong>.</td>
      </tr>
      <tr>
        <td><strong>Session expired / logged out</strong></td>
        <td>JWT tokens expire after 24 hours of inactivity.</td>
        <td>Log in again using your credentials.</td>
      </tr>
    </tbody>
  </table>
</div>

<!-- ─── Section 20 ─── -->
<div class="section">
  <div class="section-header">
    <div class="section-number">Section 20</div>
    <div class="section-title">Contact &amp; Support</div>
  </div>
  <p>For assistance with Control HUB during the ${ORG_NAME} assessment, contact:</p>

  <table>
    <thead><tr><th>Contact Type</th><th>Details</th></tr></thead>
    <tbody>
      <tr>
        <td><strong>General Support</strong></td>
        <td>info@carmetechnology.com</td>
      </tr>
      <tr>
        <td><strong>Platform</strong></td>
        <td>Control HUB by Carme Technology</td>
      </tr>
      <tr>
        <td><strong>Organization</strong></td>
        <td>${ORG_NAME}</td>
      </tr>
      <tr>
        <td><strong>Guide Version</strong></td>
        <td>${VERSION} — Generated ${GENERATED_DATE}</td>
      </tr>
    </tbody>
  </table>

  <div class="info-box success">
    <div class="info-box-title">✅ Assessment Success</div>
    <p>This guide covers all major areas of the Control HUB assessor experience. For issues not covered here, or for access to additional data not visible through the Assessor role, contact <strong>info@carmetechnology.com</strong>.</p>
  </div>

  <hr/>
  <p style="text-align:center; font-size:8.5pt; color:#94a3b8; margin-top:20px;">
    Confidential — Authorized Assessor Use Only<br/>
    ${ORG_NAME} Control HUB Assessor User Guide — Version ${VERSION} — ${GENERATED_DATE}<br/>
    Prepared by Carme Technology · info@carmetechnology.com
  </p>
</div>

</div><!-- /content-page -->
</body>
</html>`;
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  console.log("\n🔐 Control HUB — Assessor User Guide Generator");
  console.log("═".repeat(50));
  console.log(`📁 Output:  ${OUTPUT_PDF}`);
  console.log(`🏢 Org:     ${ORG_NAME}`);
  console.log(`👤 Role:    Assessor (Read-Only)`);
  console.log(`📅 Date:    ${GENERATED_DATE}`);
  console.log("═".repeat(50));

  // Ensure output directory exists
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  // Generate auth token for the assessor user
  const token = generateAssessorToken();
  console.log("\n✅ JWT generated for assessor@example.com");

  const shots = new Map<string, string>();

  console.log("\n📸 Capturing screenshots from the app...");
  console.log(`   App URL: ${APP_URL}`);

  // Use system Chromium if Playwright's bundled binary is unavailable (NixOS)
  let executablePath: string | undefined;
  try {
    executablePath = execSync("which chromium", { encoding: "utf8" }).trim();
    console.log(`   Browser: ${executablePath}`);
  } catch {
    console.log("   Browser: Playwright bundled chromium");
  }

  const browser = await chromium.launch({
    headless: true,
    executablePath,
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
  });

  try {
    const context = await browser.newContext({
      viewport: { width: 1280, height: 800 },
    });
    const page = await context.newPage();

    // ── 1. Login page (no auth) ──────────────────────────────
    console.log("  → Login page");
    const loginOk = await navigateAndWait(page, `${APP_URL}/login`);
    if (loginOk) {
      await page.waitForTimeout(1500);
      shots.set("login", await takeScreenshot(page, "Login page"));
      console.log("     ✓ login");
    }

    // ── Inject auth ──────────────────────────────────────────
    await injectAuth(page, token);

    // ── 2. Dashboard ─────────────────────────────────────────
    console.log("  → Dashboard");
    const dashOk = await navigateAndWait(page, `${APP_URL}/`);
    if (dashOk) {
      await page.waitForTimeout(2500);
      shots.set("dashboard", await takeScreenshot(page, "Dashboard"));
      console.log("     ✓ dashboard");
    }

    // ── 3. Controls ───────────────────────────────────────────
    console.log("  → Controls library");
    const ctrlsOk = await navigateAndWait(page, `${APP_URL}/controls`);
    if (ctrlsOk) {
      await page.waitForTimeout(2000);
      shots.set("controls", await takeScreenshot(page, "Controls list"));
      console.log("     ✓ controls");
    }

    // ── 4. Control detail ─────────────────────────────────────
    console.log("  → Control detail");
    const ctrlOk = await navigateAndWait(
      page,
      `${APP_URL}/controls/AC.L1-3.1.1`
    );
    if (ctrlOk) {
      await page.waitForTimeout(2000);
      shots.set("control_detail", await takeScreenshot(page, "Control detail"));
      // Click Evidence tab
      try {
        const evidenceTab = page.locator('[role="tab"]').filter({ hasText: /evidence/i }).first();
        if (await evidenceTab.isVisible({ timeout: 3000 })) {
          await evidenceTab.click();
          await page.waitForTimeout(1500);
          shots.set("control_evidence_tab", await takeScreenshot(page, "Control evidence tab"));
          console.log("     ✓ control detail (impl + evidence tab)");
        }
      } catch {
        shots.set("control_evidence_tab", shots.get("control_detail") ?? "");
        console.log("     ✓ control detail (impl only — evidence tab not found)");
      }
    }

    // ── 5. Evidence repository ────────────────────────────────
    console.log("  → Evidence repository");
    const evidOk = await navigateAndWait(page, `${APP_URL}/evidence`);
    if (evidOk) {
      await page.waitForTimeout(2000);
      shots.set("evidence", await takeScreenshot(page, "Evidence repository"));
      console.log("     ✓ evidence");
    }

    // ── 6. Evidence detail (first item if any) ─────────────────
    console.log("  → Evidence detail");
    try {
      const firstLink = page.locator("table tbody tr td a, table tbody tr").first();
      if (await firstLink.isVisible({ timeout: 3000 })) {
        await firstLink.click();
        await page.waitForTimeout(2000);
        shots.set("evidence_detail", await takeScreenshot(page, "Evidence detail"));
        console.log("     ✓ evidence detail");
      }
    } catch {
      shots.set("evidence_detail", shots.get("evidence") ?? "");
      console.log("     ⚠  evidence detail — using evidence list screenshot");
    }

    // ── 7. Documents ──────────────────────────────────────────
    console.log("  → Documents");
    const docsOk = await navigateAndWait(page, `${APP_URL}/documents/list`);
    if (docsOk) {
      await page.waitForTimeout(2000);
      shots.set("documents", await takeScreenshot(page, "Documents list"));
      console.log("     ✓ documents");
    }

    // ── 8. Monitoring ─────────────────────────────────────────
    console.log("  → Monitoring tracker");
    const monOk = await navigateAndWait(page, `${APP_URL}/monitoring`);
    if (monOk) {
      await page.waitForTimeout(2000);
      shots.set("monitoring", await takeScreenshot(page, "Monitoring tracker"));
      console.log("     ✓ monitoring");
    }

    // ── 9. POA&Ms ─────────────────────────────────────────────
    console.log("  → POA&M register");
    const poamOk = await navigateAndWait(page, `${APP_URL}/poams`);
    if (poamOk) {
      await page.waitForTimeout(2000);
      shots.set("poams", await takeScreenshot(page, "POA&M register"));
      console.log("     ✓ poams");
    }

    // ── 10. Assessor view ─────────────────────────────────────
    console.log("  → Assessor view");
    const assOk = await navigateAndWait(page, `${APP_URL}/assessor`);
    if (assOk) {
      await page.waitForTimeout(2000);
      shots.set("assessor", await takeScreenshot(page, "Assessor view"));
      console.log("     ✓ assessor view");
    }

    console.log(`\n  📷 ${shots.size} screenshots captured`);

    // ── Generate HTML guide ──────────────────────────────────
    console.log("\n📄 Building guide HTML...");
    const html = buildGuideHtml(shots);
    const tmpHtml = path.join(os.tmpdir(), `assessor-guide-${Date.now()}.html`);
    fs.writeFileSync(tmpHtml, html, "utf8");
    console.log(`   Temp HTML: ${tmpHtml}`);

    // ── Render to PDF ─────────────────────────────────────────
    console.log("\n🖨  Generating PDF...");
    const pdfPage = await context.newPage();
    await pdfPage.goto(`file://${tmpHtml}`, { waitUntil: "networkidle", timeout: 30000 });
    await pdfPage.waitForTimeout(1000);

    await pdfPage.pdf({
      path: OUTPUT_PDF,
      format: "Letter",
      printBackground: true,
      margin: { top: "0.6in", bottom: "0.7in", left: "0.85in", right: "0.85in" },
      displayHeaderFooter: true,
      headerTemplate: `<div style="font-size:7pt;color:#94a3b8;width:100%;text-align:right;padding-right:0.85in;">
        Control HUB Assessor User Guide — ${ORG_NAME}
      </div>`,
      footerTemplate: `<div style="font-size:7pt;color:#94a3b8;width:100%;display:flex;justify-content:space-between;padding:0 0.85in;">
        <span>Confidential — Authorized Assessor Use Only</span>
        <span>Page <span class="pageNumber"></span> of <span class="totalPages"></span></span>
      </div>`,
    });

    // Clean up temp file
    fs.unlinkSync(tmpHtml);

    const stats = fs.statSync(OUTPUT_PDF);
    const sizeMb = (stats.size / 1024 / 1024).toFixed(2);

    console.log("\n" + "═".repeat(50));
    console.log("✅ Guide generated successfully!");
    console.log("═".repeat(50));
    console.log(`\n📄 PDF file:  ${OUTPUT_PDF}`);
    console.log(`📦 File size: ${sizeMb} MB`);
    console.log(`\n📂 Open the Replit file tree → generated-guides/`);
    console.log(`   Right-click the PDF to download it.\n`);
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error("\n❌ Guide generation failed:", err);
  process.exit(1);
});
