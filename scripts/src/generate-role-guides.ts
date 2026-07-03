/**
 * Role-Based User Guide Generator — v1
 *
 * Generates individual PDF user guides for each role in Control HUB:
 *   • Global Administrator
 *   • Compliance Manager
 *   • Reviewer
 *   • Assessor
 *
 * Usage:
 *   pnpm generate:role-guides
 *   pnpm --filter @workspace/scripts run generate:role-guides
 *
 * Prerequisites: api-server and cmmc-app workflows must be running.
 */

import { chromium, type Page } from "playwright";
import jwt from "jsonwebtoken";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { execSync } from "child_process";
import pg from "pg";

// ─── Constants ───────────────────────────────────────────────────────────────

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const WORKSPACE_ROOT = path.resolve(__dirname, "..", "..");
const OUTPUT_DIR = path.join(WORKSPACE_ROOT, "generated-guides");

const JWT_SECRET = process.env.SESSION_SECRET ?? "cmmc-dev-secret-change-in-prod";
const APP_URL = process.env.GUIDE_APP_URL ?? "http://localhost:80";
const DATABASE_URL = process.env.DATABASE_URL ?? "";
const GENERATED_DATE = new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
const VERSION = "1.0";

// Seeded users (static IDs — stable across runs)
const USERS = {
  admin:      { id: "2f6b62e2-9e28-4b6e-8d97-6760bb10ea90", name: "System Administrator", email: "admin@example.com",      role: "admin" },
  compliance: { id: "a4ae2926-92a2-4061-a1fe-d8da6dfd0410", name: "Compliance Manager",   email: "compliance@example.com", role: "compliance_manager" },
  reviewer:   { id: "f486c3f5-c33e-413b-8530-843fb52db20b", name: "Security Reviewer",     email: "reviewer@example.com",   role: "reviewer" },
  assessor:   { id: "3a9a00f3-cc74-4e24-8aef-378c21948520", name: "Assessor",              email: "assessor@example.com",   role: "assessor" },
};

// Seeded orgs
const ORGS = {
  internal: { id: "41b0ab05-34f3-44ec-933f-ea9bb472a190", name: "Internal Company" },
  vtccorp:  { id: "b5476746-0457-4028-a5f1-bf855da2e473", name: "VTCCORP.US" },
};

// ─── DB context ───────────────────────────────────────────────────────────────

interface OrgCtx {
  orgId: string;
  orgName: string;
  bestControlId: string;
  bestControlUUID: string;
  firstEvidenceId: string;
}

async function getOrgCtx(orgId: string, orgName: string): Promise<OrgCtx> {
  if (!DATABASE_URL) throw new Error("DATABASE_URL not set");
  const pool = new pg.Pool({ connectionString: DATABASE_URL });
  try {
    const ctrl = await pool.query<{ ctrl_id: string; ctrl_uuid: string }>(
      `SELECT c.control_id AS ctrl_id, c.id AS ctrl_uuid,
              COUNT(ecl.id) AS ev_count,
              COUNT(ca.id) AS ca_count
       FROM controls c
       LEFT JOIN evidence_control_links ecl ON ecl.control_id = c.id
       LEFT JOIN evidence_items ei ON ecl.evidence_id = ei.id AND ei.organization_id = $1
       LEFT JOIN control_assessments ca ON ca.control_id = c.id AND ca.organization_id = $1
       GROUP BY c.control_id, c.id
       ORDER BY COUNT(ecl.id) DESC, COUNT(ca.id) DESC
       LIMIT 1`,
      [orgId]
    );
    const bestControlId   = ctrl.rows[0]?.ctrl_id   ?? "AC.L1-3.1.1";
    const bestControlUUID = ctrl.rows[0]?.ctrl_uuid  ?? "1d7500de-45f5-4004-b2b3-33deb3472032";

    const ev = await pool.query<{ id: string }>(
      `SELECT id FROM evidence_items WHERE organization_id = $1 ORDER BY created_at ASC LIMIT 1`,
      [orgId]
    );
    const firstEvidenceId = ev.rows[0]?.id ?? "";

    return { orgId, orgName, bestControlId, bestControlUUID, firstEvidenceId };
  } finally {
    await pool.end();
  }
}

// ─── JWT ──────────────────────────────────────────────────────────────────────

function makeJwt(user: { id: string; name: string; email: string; role: string }): string {
  return jwt.sign(
    { id: user.id, name: user.name, email: user.email, role: user.role },
    JWT_SECRET,
    { expiresIn: "4h" }
  );
}

// ─── Browser helpers ──────────────────────────────────────────────────────────

async function injectAuth(page: Page, token: string, orgId: string): Promise<void> {
  await page.goto(APP_URL, { waitUntil: "domcontentloaded", timeout: 15000 });
  await page.evaluate(
    `([t, o]) => { localStorage.setItem('auth_token', t); localStorage.setItem('cmmc_active_org_id', o); }`,
    [token, orgId] as [string, string]
  );
  await page.reload({ waitUntil: "networkidle", timeout: 15000 }).catch(() => null);
  await page.waitForTimeout(1000);
}

async function nav(page: Page, url: string, timeout = 14000): Promise<boolean> {
  try {
    await page.goto(url, { waitUntil: "networkidle", timeout });
    await page.waitForTimeout(1500);
    return true;
  } catch {
    try {
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 10000 });
      await page.waitForTimeout(3000);
      return true;
    } catch {
      console.warn(`  ⚠  Nav failed: ${url}`);
      return false;
    }
  }
}

const BASE_REJECTS = [
  "Control not found", "No evidence found", "401 Unauthorized",
  "Page Not Found", "Access denied", "Demo Mode",
];

async function takeShot(
  page: Page,
  label: string,
  opts: { waitFor?: string; reject?: string[]; clip?: { x: number; y: number; width: number; height: number } } = {}
): Promise<string> {
  try {
    if (opts.waitFor) {
      try {
        await page.waitForFunction(
          `() => document.body.innerText.includes(${JSON.stringify(opts.waitFor)})`,
          { timeout: 10000 }
        );
      } catch { console.warn(`  ⚠  Timeout waiting for "${opts.waitFor}" on ${label}`); }
    }
    const bodyText = await page.evaluate<string>("document.body?.innerText ?? ''");
    const rejectAll = [...BASE_REJECTS, ...(opts.reject ?? [])];
    for (const pat of rejectAll) {
      if (bodyText.includes(pat)) {
        const idx = bodyText.indexOf(pat);
        const snip = bodyText.slice(Math.max(0, idx - 40), idx + 60).replace(/\n/g, " ");
        console.warn(`  ⚠  Rejected "${pat}" on ${label} — "…${snip}…"`);
        return "";
      }
    }
    const buf = await page.screenshot({ fullPage: false, clip: opts.clip });
    const b64 = buf.toString("base64");
    console.log(`     ✓ ${label}`);
    return b64;
  } catch (e) {
    console.warn(`  ⚠  Shot failed ${label}: ${e}`);
    return "";
  }
}

async function clickTab(page: Page, text: string): Promise<boolean> {
  try {
    const tab = page.locator(`[role="tab"]`).filter({ hasText: new RegExp(text, "i") }).first();
    if (await tab.isVisible({ timeout: 3000 })) { await tab.click(); await page.waitForTimeout(1500); return true; }
  } catch {}
  return false;
}

// ─── HTML utilities ───────────────────────────────────────────────────────────

function img(b64: string, alt: string, caption: string): string {
  if (!b64) return `<div class="screenshot-placeholder"><span class="placeholder-text">[${alt}]</span></div>`;
  return `<figure class="screenshot-figure">
  <img src="data:image/png;base64,${b64}" alt="${alt}" class="screenshot"/>
  <figcaption>${caption}</figcaption>
</figure>`;
}

function infoBox(type: "info" | "warn" | "tip", title: string, text: string): string {
  return `<div class="info-box ${type === "info" ? "" : type}"><div class="ib-title">${title}</div><p>${text}</p></div>`;
}

function steps(items: string[]): string {
  return `<ul class="step-list">${items.map((s, i) =>
    `<li><span class="step-num">${i + 1}</span><span class="step-content">${s}</span></li>`
  ).join("")}</ul>`;
}

function permTable(rows: [string, string, string][]): string {
  const badge = (p: string) => {
    const cls = p === "Full Access" ? "b-green" : p === "Read Only" ? "b-blue" :
      p.includes("Create") || p.includes("Edit") ? "b-yellow" :
      p === "Approve / Reject" ? "b-purple" : p === "No Access" ? "b-red" : "b-gray";
    return `<span class="badge ${cls}">${p}</span>`;
  };
  return `<table>
  <thead><tr><th>Area</th><th>Permission</th><th>Details</th></tr></thead>
  <tbody>${rows.map(([area, perm, note]) =>
    `<tr><td><strong>${area}</strong></td><td>${badge(perm)}</td><td>${note}</td></tr>`
  ).join("")}</tbody>
</table>`;
}

const CSS = `<style>
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  html { font-size: 10pt; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif; color: #1a1a2e; line-height: 1.65; background: #fff; }
  @page { size: Letter; margin: 0.65in 0.8in 0.75in 0.8in; }
  @page :first { margin: 0; }
  .cover { page-break-after: always; display: flex; flex-direction: column; min-height: 10.5in;
    background: linear-gradient(155deg, #0f172a 0%, #1e3a5f 55%, #0f3460 100%); color: #fff; }
  .cover-top { background: #1e40af; padding: 18px 60px; display: flex; align-items: center; gap: 14px; }
  .cover-logo { font-size: 22px; font-weight: 800; letter-spacing: -0.5px; }
  .cover-logo span { color: #60a5fa; }
  .cover-divider { color: rgba(255,255,255,0.3); font-size: 20px; }
  .cover-vendor { font-size: 11pt; color: #93c5fd; }
  .cover-body { flex: 1; display: flex; flex-direction: column; justify-content: center; padding: 64px 60px 40px; }
  .cover-badge { display: inline-block; background: rgba(96,165,250,0.18); border: 1px solid rgba(96,165,250,0.4);
    color: #93c5fd; padding: 5px 16px; border-radius: 20px; font-size: 8.5pt;
    text-transform: uppercase; letter-spacing: 1.2px; margin-bottom: 26px; }
  .cover-title { font-size: 34pt; font-weight: 800; line-height: 1.1; margin-bottom: 10px; }
  .cover-subtitle { font-size: 16pt; color: #93c5fd; font-weight: 400; margin-bottom: 44px; }
  .cover-org-box { background: rgba(255,255,255,0.08); border: 1px solid rgba(255,255,255,0.15);
    border-radius: 10px; padding: 22px 28px; max-width: 480px; margin-bottom: 40px; }
  .cover-org-label { font-size: 7.5pt; color: #94a3b8; text-transform: uppercase; letter-spacing: 1.2px; }
  .cover-org-name { font-size: 19pt; font-weight: 700; margin: 5px 0 3px; }
  .cover-org-role { font-size: 10pt; color: #60a5fa; }
  .cover-meta { display: flex; gap: 44px; }
  .cover-meta-label { font-size: 7.5pt; color: #94a3b8; text-transform: uppercase; letter-spacing: 1px; }
  .cover-meta-value { font-size: 11pt; color: #e2e8f0; font-weight: 500; margin-top: 3px; }
  .cover-bottom { padding: 24px 60px; border-top: 1px solid rgba(255,255,255,0.1); display: flex; justify-content: space-between; align-items: center; }
  .cover-confidential { font-size: 9pt; color: #94a3b8; display: flex; align-items: center; gap: 7px; }
  .conf-dot { width: 6px; height: 6px; border-radius: 50%; background: #f59e0b; }
  .toc-page { page-break-after: always; }
  .toc-title { font-size: 22pt; font-weight: 700; color: #0f172a; border-bottom: 3px solid #1e40af; padding-bottom: 10px; margin-bottom: 24px; }
  .toc-entry { display: flex; justify-content: space-between; padding: 5px 0; border-bottom: 1px dotted #e2e8f0; font-size: 9.5pt; }
  .toc-entry.main { font-weight: 600; color: #1e3a5f; margin-top: 6px; }
  .toc-entry.sub { padding-left: 22px; color: #475569; font-size: 9pt; }
  .toc-pn { color: #64748b; font-size: 9pt; white-space: nowrap; }
  .section { margin-bottom: 28px; }
  .section-header { background: #f8fafc; border-left: 5px solid #1e40af; padding: 11px 18px; margin-bottom: 16px; page-break-after: avoid; }
  .section-num { font-size: 8.5pt; color: #1e40af; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; }
  .section-title { font-size: 14pt; font-weight: 700; color: #0f172a; margin-top: 2px; }
  .subsection { margin: 20px 0 10px; }
  .subsection-title { font-size: 11pt; font-weight: 700; color: #1e3a5f; border-bottom: 1px solid #e2e8f0; padding-bottom: 5px; margin-bottom: 10px; }
  p { margin-bottom: 10px; font-size: 10pt; color: #334155; }
  ul, ol { margin: 6px 0 12px 24px; }
  li { margin-bottom: 4px; font-size: 10pt; color: #334155; }
  strong { color: #0f172a; }
  .info-box { background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 7px; padding: 12px 16px; margin: 12px 0; }
  .info-box.warn { background: #fffbeb; border-color: #fde68a; }
  .info-box.tip { background: #f0fdf4; border-color: #86efac; }
  .info-box p { margin: 0; font-size: 9.5pt; }
  .ib-title { font-weight: 700; font-size: 9.5pt; color: #1e40af; margin-bottom: 4px; }
  .warn .ib-title { color: #92400e; }
  .tip .ib-title { color: #15803d; }
  table { width: 100%; border-collapse: collapse; margin: 12px 0; font-size: 9.5pt; }
  th { background: #1e3a5f; color: #fff; padding: 7px 11px; text-align: left; font-weight: 600; font-size: 9pt; }
  td { padding: 6px 11px; border-bottom: 1px solid #e2e8f0; color: #334155; vertical-align: top; }
  tr:nth-child(even) td { background: #f8fafc; }
  .badge { display: inline-block; padding: 2px 8px; border-radius: 12px; font-size: 8pt; font-weight: 600; }
  .b-green { background: #dcfce7; color: #15803d; }
  .b-blue { background: #dbeafe; color: #1d4ed8; }
  .b-yellow { background: #fef9c3; color: #854d0e; }
  .b-gray { background: #f1f5f9; color: #475569; }
  .b-red { background: #fee2e2; color: #b91c1c; }
  .b-purple { background: #ede9fe; color: #6d28d9; }
  .screenshot-figure { margin: 14px 0; page-break-inside: avoid; border: 1px solid #e2e8f0; border-radius: 7px; overflow: hidden; box-shadow: 0 1px 4px rgba(0,0,0,0.08); }
  .screenshot { width: 100%; height: auto; display: block; }
  figcaption { font-size: 8pt; color: #64748b; padding: 6px 12px; background: #f8fafc; border-top: 1px solid #e2e8f0; font-style: italic; }
  .screenshot-placeholder { background: #f1f5f9; border: 2px dashed #cbd5e1; border-radius: 7px; padding: 36px; text-align: center; margin: 14px 0; }
  .placeholder-text { color: #94a3b8; font-size: 9pt; }
  .step-list { list-style: none; margin: 10px 0; padding: 0; }
  .step-list li { display: flex; align-items: flex-start; gap: 11px; padding: 8px 0; border-bottom: 1px solid #f1f5f9; }
  .step-num { min-width: 26px; height: 26px; border-radius: 50%; background: #1e40af; color: #fff; font-weight: 700; font-size: 9.5pt; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
  .step-content { font-size: 10pt; color: #334155; padding-top: 3px; }
  .page-break { page-break-before: always; }
  hr { border: none; border-top: 1px solid #e2e8f0; margin: 22px 0; }
</style>`;

function cover(badge: string, title: string, subtitle: string, orgName: string, roleLabel: string, confLabel: string): string {
  return `<div class="cover">
  <div class="cover-top">
    <div class="cover-logo">Control<span> HUB</span></div>
    <div class="cover-divider">|</div>
    <div class="cover-vendor">Carme Technology</div>
  </div>
  <div class="cover-body">
    <div class="cover-badge">${badge}</div>
    <div class="cover-title">${title}</div>
    <div class="cover-subtitle">${subtitle}</div>
    <div class="cover-org-box">
      <div class="cover-org-label">Organization</div>
      <div class="cover-org-name">${orgName}</div>
      <div class="cover-org-role">${roleLabel}</div>
    </div>
    <div class="cover-meta">
      <div><div class="cover-meta-label">Version</div><div class="cover-meta-value">${VERSION}</div></div>
      <div><div class="cover-meta-label">Generated</div><div class="cover-meta-value">${GENERATED_DATE}</div></div>
      <div><div class="cover-meta-label">Prepared By</div><div class="cover-meta-value">Carme Technology</div></div>
    </div>
  </div>
  <div class="cover-bottom">
    <div class="cover-confidential"><span class="conf-dot"></span>${confLabel}</div>
    <div style="font-size:9pt;color:#94a3b8;">info@carmetechnology.com</div>
  </div>
</div>`;
}

function toc(entries: Array<{ title: string; sub?: boolean }>): string {
  return `<div class="toc-page">
  <div class="toc-title">Table of Contents</div>
  ${entries.map((e, i) => `<div class="toc-entry ${e.sub ? "sub" : "main"}"><span>${e.sub ? "" : `${i + 1} — `}${e.title}</span><span class="toc-pn">${i + 2}</span></div>`).join("\n  ")}
</div>`;
}

function sec(num: string, title: string, content: string): string {
  return `<div class="section">
  <div class="section-header"><div class="section-num">Section ${num}</div><div class="section-title">${title}</div></div>
  ${content}
</div>`;
}

function sub(title: string, content: string): string {
  return `<div class="subsection"><div class="subsection-title">${title}</div>${content}</div>`;
}

function wrap(css: string, coverHtml: string, tocHtml: string, body: string): string {
  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"/>${css}</head><body>${coverHtml}${tocHtml}${body}</body></html>`;
}

// ─── Screenshot capture: Admin ────────────────────────────────────────────────

async function captureAdminShots(page: Page, ctx: OrgCtx): Promise<Map<string, string>> {
  const shots = new Map<string, string>();
  let count = 0;

  console.log("  → Login page");
  await nav(page, `${APP_URL}/login`);
  shots.set("login", await takeShot(page, "login", { waitFor: "Password" }));
  if (shots.get("login")) count++;

  console.log("  → Dashboard");
  await nav(page, `${APP_URL}/`);
  shots.set("dashboard", await takeShot(page, "dashboard", { waitFor: "Compliance Score" }));
  if (shots.get("dashboard")) count++;

  console.log("  → Controls");
  await nav(page, `${APP_URL}/controls`);
  await page.waitForTimeout(2000);
  shots.set("controls", await takeShot(page, "controls", { waitFor: "AC.L1" }));
  if (shots.get("controls")) count++;

  console.log("  → Users management");
  await nav(page, `${APP_URL}/users`);
  shots.set("users", await takeShot(page, "users", { waitFor: "Invite User" }));
  if (shots.get("users")) count++;

  console.log("  → Organizations");
  await nav(page, `${APP_URL}/organizations`);
  shots.set("organizations", await takeShot(page, "organizations", { waitFor: "Organization" }));
  if (shots.get("organizations")) count++;

  console.log("  → Audit logs");
  await nav(page, `${APP_URL}/audit-logs`);
  shots.set("audit_logs", await takeShot(page, "audit_logs", { waitFor: "Audit" }));
  if (shots.get("audit_logs")) count++;

  console.log("  → Monitoring");
  await nav(page, `${APP_URL}/monitoring`);
  shots.set("monitoring", await takeShot(page, "monitoring", { waitFor: "Monitoring" }));
  if (shots.get("monitoring")) count++;

  console.log("  → Evidence");
  await nav(page, `${APP_URL}/evidence`);
  shots.set("evidence", await takeShot(page, "evidence", { waitFor: "Evidence" }));
  if (shots.get("evidence")) count++;

  console.log(`\n  📷 ${count} / ${shots.size} admin screenshots captured`);
  return shots;
}

// ─── Screenshot capture: Compliance Manager ───────────────────────────────────

async function captureComplianceShots(page: Page, ctx: OrgCtx): Promise<Map<string, string>> {
  const shots = new Map<string, string>();
  let count = 0;

  console.log("  → Dashboard");
  await nav(page, `${APP_URL}/`);
  shots.set("dashboard", await takeShot(page, "dashboard", { waitFor: "Compliance Score" }));
  if (shots.get("dashboard")) count++;

  console.log("  → Controls");
  await nav(page, `${APP_URL}/controls`);
  await page.waitForTimeout(2000);
  shots.set("controls", await takeShot(page, "controls", { waitFor: "AC.L1" }));
  if (shots.get("controls")) count++;

  console.log(`  → Control detail: ${ctx.bestControlId}`);
  await nav(page, `${APP_URL}/controls/${ctx.bestControlUUID}`);
  await clickTab(page, "Implementation");
  shots.set("ctrl_impl", await takeShot(page, "ctrl_impl", { waitFor: "Implementation" }));
  if (shots.get("ctrl_impl")) count++;

  console.log("  → Evidence list");
  await nav(page, `${APP_URL}/evidence`);
  shots.set("evidence", await takeShot(page, "evidence", { waitFor: "Evidence" }));
  if (shots.get("evidence")) count++;

  if (ctx.firstEvidenceId) {
    console.log("  → Evidence detail");
    await nav(page, `${APP_URL}/evidence/${ctx.firstEvidenceId}`);
    shots.set("evidence_detail", await takeShot(page, "evidence_detail", { waitFor: "Evidence" }));
    if (shots.get("evidence_detail")) count++;
  }

  console.log("  → POA&Ms");
  await nav(page, `${APP_URL}/poams`);
  shots.set("poams", await takeShot(page, "poams", { waitFor: "POA" }));
  if (shots.get("poams")) count++;

  console.log("  → Monitoring");
  await nav(page, `${APP_URL}/monitoring`);
  shots.set("monitoring", await takeShot(page, "monitoring", { waitFor: "Monitoring" }));
  if (shots.get("monitoring")) count++;

  console.log("  → Documents");
  await nav(page, `${APP_URL}/documents/list`);
  shots.set("documents", await takeShot(page, "documents", { waitFor: "Document" }));
  if (shots.get("documents")) count++;

  console.log(`\n  📷 ${count} / ${shots.size} compliance manager screenshots captured`);
  return shots;
}

// ─── Screenshot capture: Reviewer ─────────────────────────────────────────────

async function captureReviewerShots(page: Page, ctx: OrgCtx): Promise<Map<string, string>> {
  const shots = new Map<string, string>();
  let count = 0;

  console.log("  → Dashboard");
  await nav(page, `${APP_URL}/`);
  shots.set("dashboard", await takeShot(page, "dashboard", { waitFor: "Compliance Score" }));
  if (shots.get("dashboard")) count++;

  console.log("  → Controls");
  await nav(page, `${APP_URL}/controls`);
  await page.waitForTimeout(2000);
  shots.set("controls", await takeShot(page, "controls", { waitFor: "AC.L1" }));
  if (shots.get("controls")) count++;

  console.log(`  → Control detail: ${ctx.bestControlId}`);
  await nav(page, `${APP_URL}/controls/${ctx.bestControlUUID}`);
  shots.set("ctrl_detail", await takeShot(page, "ctrl_detail", { waitFor: "Control" }));
  if (shots.get("ctrl_detail")) count++;

  console.log("  → Evidence list");
  await nav(page, `${APP_URL}/evidence`);
  shots.set("evidence", await takeShot(page, "evidence", { waitFor: "Evidence" }));
  if (shots.get("evidence")) count++;

  if (ctx.firstEvidenceId) {
    console.log("  → Evidence detail");
    await nav(page, `${APP_URL}/evidence/${ctx.firstEvidenceId}`);
    shots.set("evidence_detail", await takeShot(page, "evidence_detail", { waitFor: "Evidence" }));
    if (shots.get("evidence_detail")) count++;
  }

  console.log("  → Documents");
  await nav(page, `${APP_URL}/documents/list`);
  shots.set("documents", await takeShot(page, "documents", { waitFor: "Document" }));
  if (shots.get("documents")) count++;

  console.log(`\n  📷 ${count} / ${shots.size} reviewer screenshots captured`);
  return shots;
}

// ─── Screenshot capture: Assessor ─────────────────────────────────────────────

async function captureAssessorShots(page: Page, ctx: OrgCtx): Promise<Map<string, string>> {
  const shots = new Map<string, string>();
  let count = 0;

  console.log("  → Dashboard");
  await nav(page, `${APP_URL}/`);
  shots.set("dashboard", await takeShot(page, "dashboard", { waitFor: "Compliance Score" }));
  if (shots.get("dashboard")) count++;

  console.log("  → Controls library");
  await nav(page, `${APP_URL}/controls`);
  await page.waitForTimeout(3000);
  shots.set("controls", await takeShot(page, "controls", { waitFor: "AC.L1" }));
  if (shots.get("controls")) count++;

  console.log(`  → Control detail: ${ctx.bestControlId}`);
  const ctrlUrl = `${APP_URL}/controls/${ctx.bestControlUUID}`;
  await nav(page, ctrlUrl);

  await clickTab(page, "Implementation");
  shots.set("ctrl_impl", await takeShot(page, "ctrl_impl", { waitFor: "Implementation" }));
  if (shots.get("ctrl_impl")) count++;

  await clickTab(page, "Configure");
  shots.set("ctrl_configure", await takeShot(page, "ctrl_configure", { waitFor: "Configure" }));
  if (shots.get("ctrl_configure")) count++;

  await clickTab(page, "Evidence");
  shots.set("ctrl_evidence", await takeShot(page, "ctrl_evidence", { waitFor: "Evidence" }));
  if (shots.get("ctrl_evidence")) count++;

  await clickTab(page, "SSP");
  shots.set("ctrl_ssp", await takeShot(page, "ctrl_ssp", { waitFor: "SSP" }));
  if (shots.get("ctrl_ssp")) count++;

  console.log("  → Assessor controls page");
  await nav(page, `${APP_URL}/assessor`);
  shots.set("assessor", await takeShot(page, "assessor", { waitFor: "Assessor" }));
  if (shots.get("assessor")) count++;

  console.log(`\n  📷 ${count} / ${shots.size} assessor screenshots captured`);
  return shots;
}

// ─── HTML builders ────────────────────────────────────────────────────────────

function buildAdminGuide(shots: Map<string, string>, ctx: OrgCtx): string {
  const s = (k: string) => shots.get(k) ?? "";

  const coverHtml = cover(
    "Administrator Reference Guide",
    "Control HUB<br/>Global Admin Guide",
    "Platform Administration &amp; User Management",
    ctx.orgName,
    "CMMC Level 2 — Global Administrator Role",
    "Confidential — Internal Use Only"
  );

  const tocHtml = toc([
    { title: "Role Overview" },
    { title: "Logging In" },
    { title: "Dashboard" },
    { title: "Controls Library" },
    { title: "User Management" },
    { title: "Organization Management" },
    { title: "Audit Trail" },
    { title: "Monitoring Tracker" },
    { title: "Evidence Repository" },
    { title: "Recommended Admin Workflows" },
    { title: "Tips &amp; Best Practices" },
  ]);

  const body = [
    sec("1", "Role Overview", `
      <p>The <strong>Global Administrator</strong> has unrestricted access to all features in Control HUB across every organization. This role is responsible for platform configuration, user onboarding, cross-organization oversight, and security audit management.</p>
      ${permTable([
        ["Dashboard",        "Full Access",      "All KPIs, domain readiness, activity timeline, and overdue items"],
        ["Controls",         "Full Access",      "View and assess all 110 CMMC L2 controls for any organization"],
        ["Evidence",         "Full Access",      "Upload, approve, reject, and manage all evidence across all orgs"],
        ["User Management",  "Create/Edit",      "Invite, deactivate, reset passwords, and manage org memberships"],
        ["Organizations",    "Full Access",      "Create, edit, and compare readiness across all client organizations"],
        ["Audit Logs",       "Full Access",      "View the complete system-wide audit trail for all users and orgs"],
        ["POA&Ms",           "Full Access",      "Create, close, and manage all Plans of Action and Milestones"],
        ["Monitoring",       "Full Access",      "View and update all 19 operational monitoring tracker items"],
        ["Documents",        "Full Access",      "Upload, publish, approve, and manage all compliance documents"],
        ["Settings",         "Full Access",      "Account settings, Security Center (MFA), break-glass accounts"],
      ])}
      ${infoBox("warn", "⚠ Admin Credentials", "Admin credentials should be protected with MFA. Enable TOTP-based multi-factor authentication in Settings → Security Center immediately after first login. Limit Global Admin accounts to the minimum required personnel.")}
    `),

    sec("2", "Logging In", `
      <p>Navigate to your Control HUB URL in any modern browser. Enter your admin credentials and complete MFA if enabled.</p>
      ${steps([
        "Open your browser and go to the Control HUB URL provided by Carme Technology.",
        "Enter your administrator email address and password, then click <strong>Sign In</strong>.",
        "If MFA is enabled, open your authenticator app (e.g., Google Authenticator, Authy) and enter the 6-digit code.",
        "After login, the <strong>Organization Switcher</strong> in the sidebar lets you switch between client organizations.",
      ])}
      ${img(s("login"), "Login page", "Login page — enter admin email, password, and MFA code if enabled")}
    `),

    sec("3", "Dashboard", `
      <p>The dashboard provides an executive overview of compliance readiness for the currently selected organization. As a Global Admin, you can use the organization switcher to view any client's dashboard.</p>
      <ul>
        <li><strong>Compliance Score</strong> — percentage of controls with approved evidence</li>
        <li><strong>Domain Readiness</strong> — breakdown by CMMC domain (AC, IA, CM, etc.)</li>
        <li><strong>Activity Timeline</strong> — recent evidence uploads, assessments, and task completions</li>
        <li><strong>Recommended Actions</strong> — suggested next steps to close compliance gaps</li>
      </ul>
      ${img(s("dashboard"), "Admin dashboard", "Executive compliance dashboard — KPI cards, domain readiness, and activity timeline")}
      ${infoBox("tip", "💡 Switching Organizations", "Use the Organization Switcher in the left sidebar to toggle between client organizations. All data is scoped to the selected organization.")}
    `),

    sec("4", "Controls Library", `
      <p>The Controls Library lists all 110 CMMC Level 2 controls across 14 domains. Admins can view assessment status, evidence counts, and drill into any control to review implementation narratives and linked evidence.</p>
      ${img(s("controls"), "Controls library", "Controls library — 110 CMMC L2 controls with status badges and evidence counts")}
      ${infoBox("info", "📋 Control Status", "Controls show one of: Not Started, Planned, Partially Implemented, Implemented, or Not Applicable. Only Implemented controls with approved evidence contribute to the compliance score.")}
    `),

    sec("5", "User Management", `
      <p>Navigate to <strong>Users</strong> in the sidebar to manage all platform users. You can invite new users, assign roles, manage organization memberships, reset passwords, and deactivate accounts.</p>
      ${steps([
        "Click <strong>Users</strong> in the sidebar to open the user list.",
        "Click <strong>Invite User</strong> to create a new account — enter their name, email, and assign a role.",
        "Use the <strong>Actions</strong> menu on any user row to: Reset Password, Manage Orgs, Deactivate, or Delete.",
        "To add a user to an additional organization, click <strong>Manage Orgs</strong> and select the target organizations.",
      ])}
      ${img(s("users"), "User management", "User management — invite, manage roles, reset passwords, and control org access")}
      ${permTable([
        ["admin",              "Global Admin",   "Full platform access across all organizations — use sparingly"],
        ["compliance_manager", "Org Admin",      "Can manage controls, evidence, and documents for their org"],
        ["reviewer",           "Reviewer",       "Can review and flag evidence; read-only on most other areas"],
        ["assessor",           "Assessor",       "Read-only access for external CMMC assessors (C3PAO)"],
      ])}
    `),

    sec("6", "Organization Management", `
      <p>Navigate to <strong>Organizations</strong> (visible only to Global Admins) to create and manage client organizations. You can compare readiness across orgs and access global aggregate statistics.</p>
      ${steps([
        "Click <strong>Organizations</strong> in the sidebar.",
        "Click <strong>Add Organization</strong> to onboard a new client — enter org name and CMMC target level.",
        "Click any organization name to view its readiness score and comparison with other orgs.",
        "Use the <strong>Actions</strong> menu to edit org details or deactivate an organization.",
      ])}
      ${img(s("organizations"), "Organizations management", "Organizations management — create, compare, and manage client organizations")}
    `),

    sec("7", "Audit Trail", `
      <p>The <strong>Audit Log</strong> records every significant action in the system — evidence uploads, approvals, user changes, and login events — providing a tamper-evident trail for compliance reviews.</p>
      ${img(s("audit_logs"), "Audit logs", "System-wide audit trail — all events with user, timestamp, and change details")}
      ${infoBox("info", "📋 Audit Coverage", "Logged events include: login/logout, evidence create/update/delete, control assessment changes, user management actions, document approvals, and POA&M modifications.")}
    `),

    sec("8", "Monitoring Tracker", `
      <p>The <strong>Monitoring Tracker</strong> tracks 19 recurring operational review activities required for ongoing CMMC Level 2 compliance (e.g., access reviews, log reviews, vulnerability scans).</p>
      ${img(s("monitoring"), "Monitoring tracker", "Monitoring tracker — 19 CMMC L2 recurring activities with due dates and status")}
    `),

    sec("9", "Evidence Repository", `
      <p>The <strong>Evidence Repository</strong> provides a searchable, filterable view of all evidence items uploaded for the current organization. Admins can approve, reject, and manage the full evidence lifecycle.</p>
      ${img(s("evidence"), "Evidence repository", "Evidence repository — filterable list with status, type, and collection date")}
    `),

    sec("10", "Recommended Admin Workflows", `
      ${sub("Onboarding a New Client Organization", steps([
        "Navigate to <strong>Organizations</strong> → <strong>Add Organization</strong>.",
        "Set CMMC target level (L1 or L2) and confirm org name matches the OSC legal name.",
        "Go to <strong>Users</strong> → <strong>Invite User</strong> to create the Compliance Manager account for the new org.",
        "In <strong>Manage Orgs</strong>, associate the new user with the new organization.",
        "Instruct the Compliance Manager to begin control self-assessments and evidence uploads.",
      ]))}
      ${sub("Resetting a User Password", steps([
        "Navigate to <strong>Users</strong> and find the user by name or email.",
        "Click <strong>Actions</strong> → <strong>Reset Password</strong>.",
        "The user will receive an email with a temporary password. Advise them to change it immediately.",
      ]))}
      ${sub("Preparing for a CMMC Assessment", steps([
        "Ensure all controls have implementation narratives and at least one <strong>approved</strong> evidence item.",
        "Create an <strong>Assessor</strong> account and add it to the organization being assessed.",
        "Share the Control HUB URL and assessor credentials with the C3PAO.",
        "Review <strong>Audit Logs</strong> to confirm all evidence approvals are documented.",
      ]))}
    `),

    sec("11", "Tips &amp; Best Practices", `
      <ul>
        <li>Enable MFA for all Admin accounts via <strong>Settings → Security Center</strong>.</li>
        <li>Use the <strong>Organization Switcher</strong> to review each client's compliance posture monthly.</li>
        <li>Regularly review <strong>Audit Logs</strong> for unexpected changes or login anomalies.</li>
        <li>Create separate accounts for each team member — never share login credentials.</li>
        <li>Set evidence expiry dates to trigger reminders for periodic re-collection.</li>
        <li>Use POA&amp;M items to formally track any controls that cannot be immediately implemented.</li>
        <li>Archive evidence items that have been superseded rather than deleting them.</li>
      </ul>
      ${infoBox("tip", "💡 Support", "Contact Carme Technology at info@carmetechnology.com for platform support, new organization setup, or billing inquiries.")}
    `),
  ].join("\n\n");

  return wrap(`<title>Control HUB Admin Guide</title>${CSS}`, coverHtml, tocHtml, body);
}

function buildComplianceGuide(shots: Map<string, string>, ctx: OrgCtx): string {
  const s = (k: string) => shots.get(k) ?? "";

  const coverHtml = cover(
    "Compliance Manager Reference Guide",
    "Control HUB<br/>Compliance Manager Guide",
    "Evidence, Controls, and Continuous Compliance",
    ctx.orgName,
    "CMMC Level 2 — Compliance Manager Role",
    "Confidential — Internal Use Only"
  );

  const tocHtml = toc([
    { title: "Role Overview" },
    { title: "Dashboard" },
    { title: "Controls Library" },
    { title: "Assessing a Control" },
    { title: "Evidence Management" },
    { title: "POA&amp;M Register" },
    { title: "Monitoring Tracker" },
    { title: "Documents &amp; Policies" },
    { title: "Recommended Compliance Workflows" },
    { title: "Tips &amp; Best Practices" },
  ]);

  const body = [
    sec("1", "Role Overview", `
      <p>The <strong>Compliance Manager</strong> is the primary operator of the Control HUB platform for your organization. This role owns the CMMC readiness program: assessing controls, managing evidence, tracking POA&amp;M items, and maintaining documentation.</p>
      ${permTable([
        ["Dashboard",    "Full Access",      "View all KPIs, readiness score, and recommended actions"],
        ["Controls",     "Full Access",      "Assess all 110 CMMC L2 controls; write implementation narratives"],
        ["Evidence",     "Approve / Reject", "Upload, approve, reject, and manage the full evidence lifecycle"],
        ["POA&Ms",       "Create/Edit",      "Create and close Plans of Action and Milestones for open gaps"],
        ["Monitoring",   "Create/Edit",      "Update all 19 recurring monitoring activities"],
        ["Documents",    "Full Access",      "Create, publish, and approve policies, procedures, and logs"],
        ["Tasks",        "Create/Edit",      "Assign remediation tasks to team members"],
        ["Audit Logs",   "Read Only",        "View all system events for the organization"],
        ["Users",        "No Access",        "User management is handled by Global Admin"],
        ["Organizations","No Access",        "Org-level settings managed by Global Admin"],
      ])}
      ${infoBox("info", "📋 Your Primary Responsibility", "As Compliance Manager, your goal is to reach a high compliance score by ensuring each CMMC control has a documented implementation narrative and at least one piece of approved supporting evidence.")}
    `),

    sec("2", "Dashboard", `
      <p>The dashboard gives you an at-a-glance view of your organization's CMMC readiness. Check it regularly to identify gaps and prioritize remediation efforts.</p>
      <ul>
        <li><strong>Compliance Score</strong> — percentage of controls with approved evidence</li>
        <li><strong>Overdue Monitoring</strong> — recurring activities past their due date</li>
        <li><strong>Open POA&amp;Ms</strong> — controls with documented gaps requiring remediation</li>
        <li><strong>Recommended Actions</strong> — prioritized list of what to work on next</li>
      </ul>
      ${img(s("dashboard"), "Dashboard", "Compliance dashboard — readiness score, domain progress, and recommended next actions")}
    `),

    sec("3", "Controls Library", `
      <p>Navigate to <strong>Controls</strong> in the sidebar to view all 110 CMMC Level 2 controls. Use the search bar and domain filter to find specific controls. Each row shows the control ID, title, assessment status, and evidence count.</p>
      ${img(s("controls"), "Controls library", "Controls library — search, filter by domain, and view evidence counts per control")}
      ${infoBox("tip", "💡 Where to Start", "Sort by 'Not Started' status to find controls that need attention. Focus on high-priority domains (AC, IA, CM) first as they typically have the most evidence requirements.")}
    `),

    sec("4", "Assessing a Control", `
      <p>Click any control row to open the Control Detail page. The <strong>Implementation</strong> tab is your primary workspace for documenting how each CMMC requirement is met.</p>
      ${img(s("ctrl_impl"), "Control implementation tab", "Control detail — Implementation tab with assessment status and narrative editor")}
      ${steps([
        "Open the <strong>Controls</strong> page and click the control you want to assess.",
        "On the <strong>Implementation</strong> tab, set the <strong>Assessment Status</strong> (e.g., Implemented, Partially Implemented).",
        "Write a detailed <strong>Implementation Narrative</strong> describing exactly how your organization meets this requirement.",
        "Switch to the <strong>Evidence</strong> tab to link or upload supporting documents.",
        "If the control cannot be fully implemented, create a <strong>POA&amp;M</strong> item from the POA&amp;M tab.",
      ])}
      ${infoBox("warn", "⚠ Narrative Quality", "Implementation narratives should be specific and verifiable. Avoid generic statements like 'we comply with this requirement.' Instead, name the specific systems, policies, and procedures that satisfy each control.")}
    `),

    sec("5", "Evidence Management", `
      <p>Evidence is the foundation of your CMMC compliance program. Each piece of evidence supports one or more controls and must be approved before it counts toward your compliance score.</p>
      ${img(s("evidence"), "Evidence list", "Evidence repository — filterable list with status badges, type, owner, and collection date")}
      ${sub("Evidence Lifecycle", steps([
        "<strong>Upload</strong> — click <strong>Upload Evidence</strong> from the Evidence page or the Evidence tab on a control.",
        "<strong>Pending Review</strong> — newly uploaded evidence starts as 'Pending Review'.",
        "<strong>Approve or Reject</strong> — open the evidence detail and click <strong>Approve</strong> or <strong>Reject</strong>.",
        "<strong>Approved</strong> — approved evidence is counted in the compliance score for its linked controls.",
        "<strong>Stale / Expired</strong> — evidence with an expiry date is automatically flagged when overdue.",
      ]))}
      ${img(s("evidence_detail"), "Evidence detail", "Evidence detail page — preview file, view metadata, and approve or reject the evidence item")}
      ${infoBox("tip", "💡 Bulk Status Updates", "Use the checkboxes on the Evidence list page to select multiple items and update their status in bulk — useful when approving a batch of monthly evidence.")}
    `),

    sec("6", "POA&amp;M Register", `
      <p>A <strong>Plan of Action and Milestones (POA&amp;M)</strong> formally documents controls that are not yet fully implemented, the planned remediation steps, responsible parties, and target completion dates.</p>
      ${img(s("poams"), "POA&M register", "POA&M register — open gaps with risk level, responsible party, and target close date")}
      ${steps([
        "Navigate to <strong>POA&amp;Ms</strong> in the sidebar.",
        "Click <strong>Add POA&amp;M</strong> — select the control with the gap, describe the weakness, assign an owner, and set a target close date.",
        "Update the POA&amp;M progress notes regularly as remediation work progresses.",
        "When fully remediated, open the POA&amp;M and click <strong>Close POA&amp;M</strong>.",
      ])}
    `),

    sec("7", "Monitoring Tracker", `
      <p>The Monitoring Tracker lists 19 recurring activities required for ongoing CMMC Level 2 compliance — such as access reviews, log reviews, and vulnerability scans. Each item has a defined frequency (daily, weekly, monthly, quarterly, annually).</p>
      ${img(s("monitoring"), "Monitoring tracker", "Monitoring tracker — 19 recurring CMMC L2 activities with frequency, status, and last completed date")}
      ${steps([
        "Navigate to <strong>Monitoring</strong> in the sidebar.",
        "Click any row to expand the inline editor for that activity.",
        "Set the <strong>Status</strong> (Current, In Progress, Failed Validation, Escalated).",
        "Update the <strong>Last Completed</strong> date and add notes.",
        "Save changes — overdue items will appear in the dashboard's recommended actions.",
      ])}
    `),

    sec("8", "Documents &amp; Policies", `
      <p>Navigate to <strong>Documents</strong> to manage your organization's policy and procedure library. Control HUB tracks document status, approval workflows, and expiry dates to keep your document program current.</p>
      ${img(s("documents"), "Documents list", "Documents list — all policies, procedures, and records with status and expiry tracking")}
      ${infoBox("info", "📋 Key Document Types", "Policy — high-level organization requirements. Procedure — step-by-step implementation instructions. Log — recurring compliance records. Checklist — point-in-time verification activities.")}
    `),

    sec("9", "Recommended Compliance Workflows", `
      ${sub("Monthly Compliance Review", steps([
        "Check the <strong>Dashboard</strong> for overdue monitoring items and open POA&amp;M milestones.",
        "Review the <strong>Monitoring Tracker</strong> and mark completed activities as <strong>Current</strong>.",
        "Upload any new evidence collected during the month and set appropriate expiry dates.",
        "Review newly uploaded evidence and approve or reject items in the Evidence queue.",
        "Check for policies and procedures approaching their expiry date in the <strong>Documents</strong> list.",
      ]))}
      ${sub("Preparing for Assessment", steps([
        "Confirm every control has a completed Implementation Narrative.",
        "Ensure all evidence items are in <strong>Approved</strong> status — reject any outdated items.",
        "Close or update all POA&amp;M items with current progress notes.",
        "Run <strong>Documents → Missing Policies</strong> to identify any gap-analysis items.",
        "Coordinate with your Global Admin to create an Assessor account for the C3PAO.",
      ]))}
    `),

    sec("10", "Tips &amp; Best Practices", `
      <ul>
        <li>Set <strong>evidence expiry dates</strong> to match actual review cycles (quarterly evidence should expire in 3 months).</li>
        <li>Use <strong>POA&amp;M items</strong> to document every control that is not yet fully implemented.</li>
        <li>Maintain a consistent <strong>naming convention</strong> for evidence files (e.g., "2026-Q1_Access-Review_AC.L1-3.1.1.pdf").</li>
        <li>Review the <strong>Audit Log</strong> monthly to confirm team members are logging activity.</li>
        <li>Assign <strong>task owners</strong> for all open remediation work so nothing falls through the cracks.</li>
        <li>Keep implementation narratives updated — stale narratives are a red flag during assessments.</li>
        <li>Enable email notifications to be alerted when evidence is flagged as expiring.</li>
      </ul>
      ${infoBox("tip", "💡 Support", "For CMMC guidance or platform assistance, contact Carme Technology at info@carmetechnology.com.")}
    `),
  ].join("\n\n");

  return wrap(`<title>Control HUB Compliance Manager Guide</title>${CSS}`, coverHtml, tocHtml, body);
}

function buildReviewerGuide(shots: Map<string, string>, ctx: OrgCtx): string {
  const s = (k: string) => shots.get(k) ?? "";

  const coverHtml = cover(
    "Reviewer Reference Guide",
    "Control HUB<br/>Reviewer Guide",
    "Evidence Review &amp; Quality Assurance",
    ctx.orgName,
    "CMMC Level 2 — Reviewer Role",
    "Confidential — Internal Use Only"
  );

  const tocHtml = toc([
    { title: "Role Overview" },
    { title: "Dashboard" },
    { title: "Reviewing Evidence" },
    { title: "Evidence Detail &amp; Actions" },
    { title: "Controls Library (Read-Only)" },
    { title: "Documents" },
    { title: "Evidence Review Workflow" },
    { title: "Tips &amp; Best Practices" },
  ]);

  const body = [
    sec("1", "Role Overview", `
      <p>The <strong>Reviewer</strong> role is responsible for quality-assuring evidence submitted by the organization's team members. Reviewers evaluate whether evidence is accurate, current, and sufficient to support the associated CMMC control, then approve or reject it.</p>
      ${permTable([
        ["Dashboard",    "Read Only",        "View compliance score, domain readiness, and recent activity"],
        ["Controls",     "Read Only",        "Browse all 110 CMMC L2 controls and view implementation narratives"],
        ["Evidence",     "Approve / Reject", "Review all evidence items — approve, reject, or flag as stale"],
        ["Documents",    "Read Only",        "View policies, procedures, and compliance records"],
        ["POA&Ms",       "Read Only",        "View open gaps and remediation plans"],
        ["Monitoring",   "Read Only",        "View the 19 recurring operational monitoring activities"],
        ["Tasks",        "Read Only",        "View assigned tasks and completion status"],
        ["User Mgmt",    "No Access",        "User and organization management reserved for Admin"],
        ["Assessments",  "No Access",        "Control assessments are managed by Compliance Manager"],
      ])}
      ${infoBox("info", "📋 Your Primary Responsibility", "Your most important function is reviewing evidence in 'Pending Review' status and making an Approve or Reject decision. Approved evidence is what drives the organization's CMMC compliance score.")}
    `),

    sec("2", "Dashboard", `
      <p>After logging in, you will see the compliance dashboard for your organization. As a Reviewer, focus on the evidence queue — items awaiting your review will appear in the recommended actions panel.</p>
      ${img(s("dashboard"), "Dashboard", "Compliance dashboard — shows overall readiness and highlights evidence pending review")}
    `),

    sec("3", "Reviewing Evidence", `
      <p>Navigate to <strong>Evidence</strong> in the sidebar to see all evidence items for your organization. Filter by <strong>Status: Pending Review</strong> to focus on items awaiting your decision.</p>
      ${img(s("evidence"), "Evidence list", "Evidence list — filter by 'Pending Review' to find evidence items requiring your action")}
      <p>The evidence list shows key metadata for each item:</p>
      <table>
        <thead><tr><th>Column</th><th>Description</th></tr></thead>
        <tbody>
          <tr><td><strong>Title</strong></td><td>Descriptive name of the evidence item</td></tr>
          <tr><td><strong>Type</strong></td><td>Category: Policy, Screenshot, Report, Access Review, Scan Report, etc.</td></tr>
          <tr><td><strong>Status</strong></td><td>Current lifecycle stage — focus on <em>Pending Review</em></td></tr>
          <tr><td><strong>Linked Controls</strong></td><td>Which CMMC controls this evidence supports</td></tr>
          <tr><td><strong>Collected</strong></td><td>Date the evidence was gathered — check for freshness</td></tr>
          <tr><td><strong>Expires</strong></td><td>When the evidence becomes stale — flag if past due</td></tr>
        </tbody>
      </table>
    `),

    sec("4", "Evidence Detail &amp; Actions", `
      <p>Click any evidence item to open its detail page. Here you can preview the file, read the description and summary, and make your review decision.</p>
      ${img(s("evidence_detail"), "Evidence detail", "Evidence detail — preview the file, read the summary, and approve or reject")}
      ${steps([
        "Click the evidence item title to open its detail page.",
        "<strong>Preview the file</strong> — images, PDFs, text files, and Office documents can be viewed inline.",
        "Read the <strong>Description</strong> and <strong>Summary</strong> fields to understand what the evidence demonstrates.",
        "Check the <strong>Collection Date</strong> and <strong>Expiry Date</strong> — evidence should be current and not expired.",
        "Verify the <strong>Linked Controls</strong> are appropriate for this type of evidence.",
        "Click <strong>Approve</strong> if the evidence is sufficient, accurate, and relevant. Click <strong>Reject</strong> (with a reason) if it does not meet the standard.",
      ])}
      ${infoBox("warn", "⚠ Review Standards", "When approving evidence, confirm: (1) the file actually demonstrates what the description claims, (2) the collection date is within the required review period, and (3) the evidence is specific to this organization (not a generic template).")}
      ${sub("Rejection Best Practices", `
        <p>When rejecting evidence, always provide a clear rejection reason so the submitter knows what to fix:</p>
        <ul>
          <li><em>Evidence is outdated — collect a current version (within the last 90 days).</em></li>
          <li><em>File is incomplete — the screenshot only shows part of the required configuration.</em></li>
          <li><em>Wrong control — this evidence relates to IA, not AC. Please re-link appropriately.</em></li>
          <li><em>Generic template — this must reflect actual organizational settings, not a sample document.</em></li>
        </ul>
      `)}
    `),

    sec("5", "Controls Library (Read-Only)", `
      <p>As a Reviewer, you have read-only access to all 110 CMMC controls. Use this to understand the requirements behind evidence items you are reviewing.</p>
      ${img(s("controls"), "Controls library", "Controls library — view all 110 CMMC L2 controls with assessment status and evidence counts")}
      ${img(s("ctrl_detail"), "Control detail", "Control detail — view implementation narrative, evidence, and assessment status")}
      ${infoBox("tip", "💡 Understanding a Control", "When reviewing evidence for a specific control, open that control's detail page to read the Implementation Narrative. This tells you what the organization claims to have implemented — your job is to confirm the evidence supports that claim.")}
    `),

    sec("6", "Documents", `
      <p>The Documents section contains the organization's policy and procedure library. As a Reviewer, you have read-only access to view the current state of all compliance documentation.</p>
      ${img(s("documents"), "Documents list", "Documents list — policies, procedures, and compliance records with status and expiry dates")}
    `),

    sec("7", "Evidence Review Workflow", `
      <p>Follow this structured workflow when processing your evidence review queue:</p>
      ${steps([
        "Navigate to <strong>Evidence</strong> → filter by <strong>Status: Pending Review</strong>.",
        "Open the oldest pending item first (first in, first reviewed).",
        "Read the <strong>Title, Type, Description, and Summary</strong>.",
        "Preview the attached file — confirm it matches the description.",
        "Check <strong>Collection Date</strong>: evidence older than the review period may need to be recollected.",
        "Verify <strong>Linked Controls</strong>: make sure the control linkage is logical.",
        "Make your decision: <strong>Approve</strong> (sufficient) or <strong>Reject</strong> (with a written reason).",
        "Repeat for all pending items. Aim to clear the review queue within 48 hours of submission.",
      ])}
      ${infoBox("tip", "💡 Review Cadence", "Set a calendar reminder to check the Evidence queue every Monday and Thursday. Prompt reviews keep the compliance score accurate and avoid bottlenecks before assessment.")}
    `),

    sec("8", "Tips &amp; Best Practices", `
      <ul>
        <li>Filter the Evidence list by <strong>Pending Review</strong> as your first action each time you log in.</li>
        <li>Always write a clear rejection reason — vague rejections frustrate submitters and delay remediation.</li>
        <li>If you are unsure whether evidence meets a control requirement, consult the Compliance Manager before deciding.</li>
        <li>Do not approve evidence that you have submitted yourself — a second set of eyes is the point of the review process.</li>
        <li>Check expiry dates proactively — flag items that will expire within 30 days so they can be recollected.</li>
        <li>Use the <strong>Audit Log</strong> to confirm your approval/rejection decisions are recorded.</li>
      </ul>
      ${infoBox("tip", "💡 Support", "Contact Carme Technology at info@carmetechnology.com for platform assistance.")}
    `),
  ].join("\n\n");

  return wrap(`<title>Control HUB Reviewer Guide</title>${CSS}`, coverHtml, tocHtml, body);
}

function buildAssessorGuide(shots: Map<string, string>, ctx: OrgCtx): string {
  const s = (k: string) => shots.get(k) ?? "";

  const coverHtml = cover(
    "Assessor Reference Guide",
    "Control HUB<br/>Assessor Guide",
    "CMMC Assessment Review Instructions",
    ctx.orgName,
    "CMMC Level 2 — Assessor Read-Only Role",
    "Confidential — Authorized Assessor Use Only"
  );

  const tocHtml = toc([
    { title: "Role Overview" },
    { title: "Dashboard" },
    { title: "Controls Library" },
    { title: "Control Package Review" },
    { title: "Configure Tab — M365 Verification" },
    { title: "Evidence Tab" },
    { title: "SSP Tab" },
    { title: "Assessor Controls Page" },
    { title: "Recommended Assessment Workflow" },
    { title: "Troubleshooting" },
  ]);

  const body = [
    sec("1", "Role Overview", `
      <p>The <strong>Assessor</strong> role provides read-only access to the organization's compliance data for the purposes of a CMMC Third-Party Assessment (C3PAO review). All data is scoped to <strong>${ctx.orgName}</strong>.</p>
      ${permTable([
        ["Dashboard",        "Read Only",   "Compliance score, domain readiness, overdue items, and timeline"],
        ["Controls",         "Read Only",   "All 110 CMMC L2 controls with implementation narratives"],
        ["Configure Tab",    "Read Only",   "M365 implementation verification steps and test procedures"],
        ["Evidence",         "Read Only",   "All approved evidence — preview and download files"],
        ["SSP Narratives",   "Read Only",   "System Security Plan narratives per control"],
        ["Monitoring",       "Read Only",   "19 recurring operational monitoring activities"],
        ["POA&Ms",           "Read Only",   "Open gaps and remediation plans"],
        ["Documents",        "Read Only",   "Policies, procedures, and compliance records"],
        ["Assessor Page",    "Read Only",   "Dedicated assessor control list with assessment package export"],
        ["User Management",  "No Access",   "Admin-only function — not visible to assessors"],
        ["Write Actions",    "No Access",   "All create/edit/delete/upload actions are blocked for assessors"],
      ])}
      ${infoBox("warn", "⚠ Read-Only Access", "The Assessor role cannot modify any data. All create, edit, upload, approve, and delete operations are blocked. If you encounter a page that appears to allow editing, please report it to the platform administrator.")}
    `),

    sec("2", "Dashboard", `
      <p>The dashboard gives you an immediate view of the organization's CMMC compliance posture. Review the compliance score, domain readiness breakdown, and overdue items at the start of your assessment.</p>
      <ul>
        <li><strong>Compliance Score</strong> — overall percentage of controls with approved evidence</li>
        <li><strong>Domain Readiness</strong> — per-domain breakdown (AC, IA, CM, SI, etc.)</li>
        <li><strong>Overdue Monitoring</strong> — recurring activities past their scheduled review date</li>
        <li><strong>Open POA&amp;Ms</strong> — controls with documented gaps and remediation plans</li>
      </ul>
      ${img(s("dashboard"), "Compliance dashboard", "Compliance dashboard — shows overall readiness score and domain-level breakdown for the assessment organization")}
    `),

    sec("3", "Controls Library", `
      <p>Navigate to <strong>Controls</strong> to view all 110 CMMC Level 2 controls. Use the search bar to find specific controls by ID (e.g., "AC.L1-3.1.1") or keyword (e.g., "access", "multi-factor").</p>
      ${img(s("controls"), "Controls library", "Controls library — all 110 CMMC L2 controls with assessment status badges and evidence counts")}
      <p>Each control row shows:</p>
      <table>
        <thead><tr><th>Column</th><th>Description</th></tr></thead>
        <tbody>
          <tr><td><strong>Control ID</strong></td><td>CMMC identifier (e.g., AC.L1-3.1.1)</td></tr>
          <tr><td><strong>Title</strong></td><td>Requirement name from CMMC Level 2 Practice Guide</td></tr>
          <tr><td><strong>Domain</strong></td><td>One of 14 CMMC domains (AC, IA, CM, SC, SI, etc.)</td></tr>
          <tr><td><strong>Status</strong></td><td>Organization's self-assessed implementation status</td></tr>
          <tr><td><strong>Evidence</strong></td><td>Count of linked evidence items</td></tr>
        </tbody>
      </table>
    `),

    sec("4", "Control Package Review", `
      <p>Click any control to open its full assessment package. The <strong>Implementation tab</strong> is your starting point — it shows the organization's self-assessment and narrative.</p>
      ${img(s("ctrl_impl"), "Control implementation tab", "Control implementation tab — self-assessment status, implementation narrative, and linked evidence summary")}
      ${steps([
        "Click a control in the Controls list to open its detail page.",
        "Review the <strong>Assessment Status</strong> the organization has selected (Implemented, Partially Implemented, etc.).",
        "Read the <strong>Implementation Narrative</strong> — evaluate whether it adequately describes the control implementation.",
        "Switch to the <strong>Configure tab</strong> to review specific technical verification steps.",
        "Switch to the <strong>Evidence tab</strong> to review supporting documentation.",
        "Check the <strong>SSP tab</strong> for system security plan narrative.",
        "Review the <strong>POA&amp;M tab</strong> for any documented gaps.",
      ])}
    `),

    sec("5", "Configure Tab — M365 Verification", `
      <p>The <strong>Configure tab</strong> provides detailed, step-by-step implementation verification procedures specific to Microsoft 365. Each control includes test steps, expected settings, and evidence hints to guide your technical review.</p>
      ${img(s("ctrl_configure"), "Configure tab", "Configure tab — step-by-step M365 verification procedures with pass/fail criteria and evidence hints")}
      ${infoBox("info", "📋 What the Configure Tab Contains", "For each control, the Configure tab lists: (1) implementation verification steps with navigation paths in the Microsoft 365 portals, (2) expected configuration settings, (3) pass/fail criteria, and (4) evidence collection hints.")}
    `),

    sec("6", "Evidence Tab", `
      <p>The <strong>Evidence tab</strong> on a control detail page shows all evidence items linked to that control. You can preview files inline or download them for offline review.</p>
      ${img(s("ctrl_evidence"), "Evidence tab", "Evidence tab — linked evidence items with status, type, collection date, and file preview")}
      <p>For each evidence item, review:</p>
      <ul>
        <li><strong>Status</strong> — must be <em>Approved</em> or <em>Assessor Ready</em> to count toward compliance</li>
        <li><strong>Type</strong> — does the evidence type match what is expected for this control?</li>
        <li><strong>Collection Date</strong> — is the evidence current for the assessment period?</li>
        <li><strong>File Preview</strong> — click to preview or download the actual evidence file</li>
      </ul>
    `),

    sec("7", "SSP Tab", `
      <p>The <strong>SSP tab</strong> contains the System Security Plan narrative for each control — a prose description of how the control is addressed within the organization's information system boundary.</p>
      ${img(s("ctrl_ssp"), "SSP tab", "SSP tab — System Security Plan narrative for the control, describing system boundary and implementation approach")}
      ${infoBox("tip", "💡 SSP Review Tip", "The SSP narrative should align with the Implementation Narrative on the Implementation tab. Contradictions between the two narratives are a finding.")}
    `),

    sec("8", "Assessor Controls Page", `
      <p>Navigate to <strong>Assessor</strong> in the sidebar for a dedicated assessment interface. This page provides a structured control list optimized for assessment review, with the ability to export assessment packages.</p>
      ${img(s("assessor"), "Assessor controls page", "Assessor page — dedicated assessment interface with control list and package export options")}
    `),

    sec("9", "Recommended Assessment Workflow", `
      <p>Use this structured approach to systematically review the organization's CMMC compliance posture:</p>
      ${steps([
        "<strong>Dashboard review</strong> — note the overall compliance score, domain readiness, and any overdue monitoring or open POA&amp;Ms.",
        "<strong>High-risk domains first</strong> — start with domains showing &lt;80% readiness (AC, IA, CM are typically highest priority).",
        "<strong>Control-by-control review</strong> — for each selected control, open the full package and review: Implementation Narrative → Configure steps → Evidence → SSP.",
        "<strong>Evidence adequacy check</strong> — confirm each linked evidence item is in Approved/Assessor-Ready status and that the file content matches the claimed implementation.",
        "<strong>POA&amp;M review</strong> — review open POA&amp;M items, confirm they have realistic milestones and recent progress notes.",
        "<strong>Monitoring review</strong> — check the Monitoring Tracker for overdue activities; this indicates operational compliance gaps.",
        "<strong>Document review</strong> — verify that required policies and procedures exist, are approved, and are not expired.",
        "<strong>Record findings</strong> — document your findings externally; the Assessor role is read-only and cannot annotate records in the platform.",
      ])}
    `),

    sec("10", "Troubleshooting", `
      <table>
        <thead><tr><th>Issue</th><th>Likely Cause</th><th>Resolution</th></tr></thead>
        <tbody>
          <tr><td>Cannot log in</td><td>Incorrect credentials or expired account</td><td>Contact the organization's Global Admin to reset password or reactivate account</td></tr>
          <tr><td>Wrong organization shown</td><td>Org switcher set to a different org</td><td>Click the org name in the sidebar and select <strong>${ctx.orgName}</strong></td></tr>
          <tr><td>Evidence file will not preview</td><td>Unsupported file type or large file</td><td>Click <strong>Download</strong> to save the file and open locally</td></tr>
          <tr><td>Configure tab is empty</td><td>Control has no M365 configuration defined</td><td>Check the Implementation tab for manual verification notes</td></tr>
          <tr><td>Page shows Access Denied</td><td>Role restriction on an admin-only page</td><td>This is expected — navigate back using the sidebar</td></tr>
        </tbody>
      </table>
      ${infoBox("tip", "💡 Platform Support", "For technical issues with the platform during assessment, contact Carme Technology at info@carmetechnology.com. For questions about the organization's compliance program, contact their designated Compliance Manager.")}
    `),
  ].join("\n\n");

  return wrap(`<title>Control HUB Assessor Guide</title>${CSS}`, coverHtml, tocHtml, body);
}

// ─── PDF generation ───────────────────────────────────────────────────────────

async function generatePdf(html: string, outputPath: string): Promise<number> {
  const tmpHtml = outputPath.replace(".pdf", ".tmp.html");
  fs.writeFileSync(tmpHtml, html, "utf8");
  let executablePath: string | undefined;
  try { executablePath = execSync("which chromium", { encoding: "utf8" }).trim(); } catch {}
  try {
    const browser = await chromium.launch({ headless: true, executablePath, args: ["--no-sandbox", "--disable-setuid-sandbox"] });
    const page = await browser.newPage();
    await page.goto(`file://${tmpHtml}`, { waitUntil: "networkidle", timeout: 30000 });
    await page.waitForTimeout(500);
    await page.pdf({
      path: outputPath,
      format: "Letter",
      printBackground: true,
      displayHeaderFooter: false,
    });
    await browser.close();
    const size = fs.statSync(outputPath).size;
    return size;
  } finally {
    if (fs.existsSync(tmpHtml)) fs.unlinkSync(tmpHtml);
  }
}

// Optional filter: GUIDE_ONLY_ROLES=reviewer,assessor pnpm generate:role-guides
const ONLY_ROLES = process.env.GUIDE_ONLY_ROLES?.split(",").map((r) => r.trim()) ?? null;

// ─── Role definitions ─────────────────────────────────────────────────────────

interface RoleDef {
  key: string;
  label: string;
  user: typeof USERS.admin;
  org: typeof ORGS.internal;
  outputFile: string;
  captureShots: (page: Page, ctx: OrgCtx) => Promise<Map<string, string>>;
  buildHtml: (shots: Map<string, string>, ctx: OrgCtx) => string;
}

const ROLES: RoleDef[] = [
  {
    key: "admin",
    label: "Global Administrator",
    user: USERS.admin,
    org: ORGS.internal,
    outputFile: "Control_HUB_Admin_Guide.pdf",
    captureShots: captureAdminShots,
    buildHtml: buildAdminGuide,
  },
  {
    key: "compliance",
    label: "Compliance Manager",
    user: USERS.compliance,
    org: ORGS.internal,
    outputFile: "Control_HUB_Compliance_Manager_Guide.pdf",
    captureShots: captureComplianceShots,
    buildHtml: buildComplianceGuide,
  },
  {
    key: "reviewer",
    label: "Reviewer",
    user: USERS.reviewer,
    org: ORGS.internal,
    outputFile: "Control_HUB_Reviewer_Guide.pdf",
    captureShots: captureReviewerShots,
    buildHtml: buildReviewerGuide,
  },
  {
    key: "assessor",
    label: "Assessor",
    user: USERS.assessor,
    org: ORGS.vtccorp,
    outputFile: "Control_HUB_Assessor_Guide.pdf",
    captureShots: captureAssessorShots,
    buildHtml: buildAssessorGuide,
  },
];

// ─── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log("\n🔐 Control HUB — Role-Based User Guide Generator v1");
  console.log("════════════════════════════════════════════════════");
  console.log(`📁 Output:  ${OUTPUT_DIR}`);
  console.log(`🌐 App URL: ${APP_URL}`);
  console.log(`📅 Date:    ${GENERATED_DATE}`);
  console.log(`📚 Roles:   ${ROLES.map((r) => r.label).join(", ")}`);
  console.log("════════════════════════════════════════════════════\n");

  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  const results: Array<{ role: string; file: string; size: number; ok: boolean }> = [];
  const rolesToRun = ONLY_ROLES ? ROLES.filter((r) => ONLY_ROLES.includes(r.key)) : ROLES;

  for (const roleDef of rolesToRun) {
    console.log(`\n${"═".repeat(52)}`);
    console.log(`📖  Generating guide: ${roleDef.label}`);
    console.log(`${"═".repeat(52)}`);

    try {
      // Resolve DB context for this role's org
      console.log(`\n🗄  Loading org context for ${roleDef.org.name}...`);
      const ctx = await getOrgCtx(roleDef.org.id, roleDef.org.name);
      console.log(`   ✓ Org: ${ctx.orgName} (${ctx.orgId})`);
      console.log(`   ✓ Best control: ${ctx.bestControlId}`);
      console.log(`   ✓ First evidence: ${ctx.firstEvidenceId || "(none)"}`);

      // Generate JWT
      const token = makeJwt(roleDef.user);
      console.log(`\n✅ JWT generated for ${roleDef.user.email}`);

      // Launch browser for screenshots
      console.log(`\n📸 Capturing screenshots...`);
      let executablePath: string | undefined;
      try { executablePath = execSync("which chromium", { encoding: "utf8" }).trim(); } catch {}
      const browser = await chromium.launch({
        headless: true,
        executablePath,
        args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
      });
      const page = await browser.newPage();
      await page.setViewportSize({ width: 1440, height: 900 });

      // Inject auth
      await injectAuth(page, token, ctx.orgId);
      console.log(`   Auth injected for ${roleDef.user.role}`);

      // Capture role-specific screenshots
      const shots = await roleDef.captureShots(page, ctx);
      await browser.close();

      // Build HTML and generate PDF
      console.log(`\n📄 Building guide HTML...`);
      const html = roleDef.buildHtml(shots, ctx);

      console.log(`🖨  Generating PDF...`);
      const outputPath = path.join(OUTPUT_DIR, roleDef.outputFile);
      const bytes = await generatePdf(html, outputPath);
      const mb = (bytes / 1024 / 1024).toFixed(2);

      console.log(`\n✅ ${roleDef.label} guide → ${roleDef.outputFile} (${mb} MB)`);
      results.push({ role: roleDef.label, file: roleDef.outputFile, size: bytes, ok: true });
    } catch (err) {
      console.error(`\n❌ Failed to generate guide for ${roleDef.label}:`, err);
      results.push({ role: roleDef.label, file: roleDef.outputFile, size: 0, ok: false });
    }
  }

  console.log(`\n${"═".repeat(52)}`);
  console.log("📚  All Role Guides Complete");
  console.log(`${"═".repeat(52)}`);
  for (const r of results) {
    const mb = (r.size / 1024 / 1024).toFixed(2);
    const mark = r.ok ? "✅" : "❌";
    console.log(`  ${mark}  ${r.role.padEnd(24)} → ${r.file}${r.ok ? ` (${mb} MB)` : " FAILED"}`);
  }
  console.log(`\n📂 Files in: ${OUTPUT_DIR}`);
  console.log("   Right-click any file in the Replit file tree → Download\n");
}

main().catch((e) => {
  console.error("❌ Fatal error:", e);
  process.exit(1);
});
