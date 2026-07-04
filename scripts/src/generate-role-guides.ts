/**
 * Role-Based User Guide Generator — v2
 *
 * Generates individual PDF user guides for each role in Control HUB:
 *   • Global Administrator  (16 sections, 13 screenshots)
 *   • Compliance Manager    (17 sections, 12 screenshots)
 *   • Reviewer              (15 sections, 11 screenshots)
 *   • Assessor              (18 sections, 14 screenshots)
 *
 * Usage:
 *   pnpm generate:role-guides
 *   GUIDE_ONLY_ROLES=reviewer,assessor pnpm generate:role-guides
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
const VERSION = "2.0";

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

// Known control UUIDs (stable — seeded from cmmc-controls.json)
const CONTROLS: Record<string, string> = {
  "AC.L1-3.1.1": "1d7500de-45f5-4004-b2b3-33deb3472032",
  "AC.L1-3.1.2": "02892d24-ee0f-45d8-911a-f9ff9248ce93",
  "IA.L2-3.5.3": "eed39b06-3952-4702-bbcc-de5f70302110",
  "SI.L1-3.14.1": "4732e6a7-5834-47ae-9e46-ff230a003f5f",
  "CM.L2-3.4.1": "b1b63bb2-1c51-476a-b656-36d64b0cda23",
};

// ─── DB setup — seed Internal Company with evidence/assessments ───────────────

async function seedInternalCompanyData(): Promise<void> {
  if (!DATABASE_URL) throw new Error("DATABASE_URL not set");
  const pool = new pg.Pool({ connectionString: DATABASE_URL });
  const orgId = ORGS.internal.id;
  const userId = USERS.compliance.id;

  try {
    // 1. Seed control assessments
    const assessments = [
      {
        controlUUID: CONTROLS["AC.L1-3.1.1"],
        narrative:
          "Internal Company manages authorized access through Microsoft Azure Active Directory (AAD). " +
          "All user accounts require multi-factor authentication enforced via Conditional Access Policies. " +
          "Access is provisioned through the IT helpdesk ticketing system using a formal request and approval workflow. " +
          "Privileged accounts are managed with just-in-time access and quarterly reviews are conducted.",
      },
      {
        controlUUID: CONTROLS["AC.L1-3.1.2"],
        narrative:
          "Internal Company enforces role-based access control (RBAC) across all information systems. " +
          "Users are granted access based on least privilege principles aligned to their job function. " +
          "System administrators maintain a role matrix documented in the Access Control Policy. " +
          "Separation of duties is enforced for critical functions and access roles are reviewed semi-annually.",
      },
      {
        controlUUID: CONTROLS["IA.L2-3.5.3"],
        narrative:
          "Internal Company requires multi-factor authentication for all users accessing CUI systems. " +
          "MFA is enforced through Azure AD Conditional Access Policies requiring authenticator app (TOTP). " +
          "Single-factor authentication is prohibited for all CUI-touching systems. " +
          "MFA compliance is monitored via Azure AD sign-in logs reviewed weekly.",
      },
      {
        controlUUID: CONTROLS["SI.L1-3.14.1"],
        narrative:
          "Internal Company deploys Microsoft Defender for Endpoint on all managed workstations and servers. " +
          "Anti-malware signatures are updated automatically via cloud protection. " +
          "Endpoint scans are performed daily with results collected centrally. " +
          "Detected threats are triaged by the IT Security team within 24 hours per the Incident Response Plan.",
      },
    ];

    for (const a of assessments) {
      const existing = await pool.query(
        `SELECT id FROM control_assessments WHERE control_id=$1 AND organization_id=$2 LIMIT 1`,
        [a.controlUUID, orgId]
      );
      if (existing.rows.length === 0) {
        await pool.query(
          `INSERT INTO control_assessments
             (id, control_id, organization_id, status, implementation_narrative,
              last_assessed_at, assessed_by_id, created_at, updated_at)
           VALUES (gen_random_uuid(), $1, $2, 'implemented', $3, now(), $4, now(), now())`,
          [a.controlUUID, orgId, a.narrative, userId]
        );
      } else {
        await pool.query(
          `UPDATE control_assessments SET status='implemented', implementation_narrative=$3
           WHERE control_id=$1 AND organization_id=$2`,
          [a.controlUUID, orgId, a.narrative]
        );
      }
    }
    console.log(`   ✓ ${assessments.length} control assessments seeded for Internal Company`);

    // 2. Seed evidence items
    const evidenceSeeds = [
      {
        title: "Access Control Policy — v3.0",
        type: "policy",
        status: "approved",
        description: "Formal Access Control Policy establishing user account management, role-based access, and privileged account controls.",
        summary: "Policy document covering authorized access, least privilege, and periodic review requirements for Internal Company.",
        tags: ["access-control", "policy", "CMMC-L1"],
        controlUUID: CONTROLS["AC.L1-3.1.1"],
        collectedAt: new Date("2026-01-10"),
        expiresAt: new Date("2027-01-10"),
      },
      {
        title: "MFA Enforcement — Azure Conditional Access Screenshot",
        type: "screenshot",
        status: "approved",
        description: "Screenshots of Azure AD Conditional Access policies requiring MFA for all CUI-touching applications.",
        summary: "Visual evidence of MFA configuration applied to all users accessing CUI systems.",
        tags: ["MFA", "Azure-AD", "identity", "CMMC-L2"],
        controlUUID: CONTROLS["IA.L2-3.5.3"],
        collectedAt: new Date("2026-02-15"),
        expiresAt: new Date("2027-02-15"),
      },
      {
        title: "Endpoint Protection — Defender Configuration Report Q1 2026",
        type: "report",
        status: "approved",
        description: "Microsoft Defender for Endpoint quarterly configuration and compliance report.",
        summary: "Quarterly report confirming 100% endpoint coverage with Defender for Endpoint. Signature age <4 hours.",
        tags: ["endpoint-protection", "anti-malware", "defender", "CMMC-L1"],
        controlUUID: CONTROLS["SI.L1-3.14.1"],
        collectedAt: new Date("2026-03-01"),
        expiresAt: new Date("2026-09-01"),
      },
      {
        title: "Role-Based Access Control Matrix — Q1 2026",
        type: "access_review",
        status: "approved",
        description: "RBAC matrix mapping all job roles to system permissions across Internal Company information systems.",
        summary: "Access matrix verified by CISO. Documents least privilege assignments across all systems.",
        tags: ["RBAC", "access-matrix", "least-privilege"],
        controlUUID: CONTROLS["AC.L1-3.1.2"],
        collectedAt: new Date("2026-01-28"),
        expiresAt: new Date("2027-01-28"),
      },
    ];

    let firstEvidenceId = "";
    for (const e of evidenceSeeds) {
      const existing = await pool.query<{ id: string }>(
        `SELECT id FROM evidence_items WHERE organization_id=$1 AND title=$2 LIMIT 1`,
        [orgId, e.title]
      );
      let evidenceId: string;
      if (existing.rows.length > 0) {
        evidenceId = existing.rows[0].id;
      } else {
        const ins = await pool.query<{ id: string }>(
          `INSERT INTO evidence_items
             (id, title, description, evidence_type, status, version, tags, owner_id,
              collected_at, expires_at, assessor_summary, is_current_version,
              organization_id, created_at, updated_at)
           VALUES (gen_random_uuid(), $1, $2, $3::evidence_type, $4::evidence_status,
                   '1.0', $5, $6, $7, $8, $9, true, $10, now(), now())
           RETURNING id`,
          [e.title, e.description, e.type, e.status, e.tags, userId,
           e.collectedAt, e.expiresAt, e.summary, orgId]
        );
        evidenceId = ins.rows[0].id;

        const existingLink = await pool.query(
          `SELECT 1 FROM evidence_control_links WHERE evidence_id=$1 AND control_id=$2 LIMIT 1`,
          [evidenceId, e.controlUUID]
        );
        if (existingLink.rows.length === 0) {
          await pool.query(
            `INSERT INTO evidence_control_links (id, evidence_id, control_id, linked_at, linked_by_id)
             VALUES (gen_random_uuid(), $1, $2, now(), $3)`,
            [evidenceId, e.controlUUID, userId]
          );
        }
      }
      if (!firstEvidenceId) firstEvidenceId = evidenceId;
    }
    console.log(`   ✓ ${evidenceSeeds.length} evidence items seeded for Internal Company`);

    // 3. Seed POA&M items
    const poamCount = await pool.query<{ count: string }>(
      `SELECT COUNT(*) as count FROM poams WHERE organization_id=$1`,
      [orgId]
    );
    if (parseInt(poamCount.rows[0].count) === 0) {
      const due90 = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000);
      const due60 = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000);
      await pool.query(
        `INSERT INTO poams
           (id, organization_id, poam_number, title, deficiency_description,
            status, risk_level, linked_control_id, scheduled_completion_date,
            remediation_plan, owner_id, created_at, updated_at)
         VALUES
           (gen_random_uuid(), $1, 'POAM-2026-001',
            'Privileged Access Management — JIT Not Fully Deployed',
            'Just-In-Time privileged access is not yet enforced for all on-premises administrator accounts.',
            'open', 'medium', $2, $3,
            'Phase 1: Enumerate all on-premises admin accounts. Phase 2: Extend Azure PIM to on-premises. Phase 3: Convert persistent admins to JIT.',
            $4, now(), now()),
           (gen_random_uuid(), $1, 'POAM-2026-002',
            'External Vulnerability Scan — Monthly Cadence Gap',
            'External vulnerability scans have not been performed on the required monthly basis.',
            'in_progress', 'low', NULL, $5,
            'Configure automated monthly external scan. Assign scan schedule owner. Target: fully automated by end of quarter.',
            $4, now(), now())`,
        [orgId, CONTROLS["AC.L1-3.1.1"], due90, userId, due60]
      );
      console.log(`   ✓ 2 POA&M items seeded for Internal Company`);
    }
  } finally {
    await pool.end();
  }
}

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
    const bestControlUUID = ctrl.rows[0]?.ctrl_uuid  ?? CONTROLS["AC.L1-3.1.1"];

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

/**
 * Injects auth into localStorage, reloads, then waits until the sidebar
 * (`.no-print`) is visible — confirming the app is fully authenticated.
 * NOTE: Vite HMR keeps a WebSocket open so `networkidle` NEVER fires on
 *       the dev server.  Always use `domcontentloaded` + explicit element
 *       waits instead.
 */
async function injectAuth(page: Page, token: string, orgId: string, roleKey: string): Promise<void> {
  await page.goto(APP_URL, { waitUntil: "domcontentloaded", timeout: 20000 });
  await page.evaluate(
    ([t, o]: [string, string]) => {
      localStorage.setItem("auth_token", t);
      localStorage.setItem("cmmc_active_org_id", o);
    },
    [token, orgId] as [string, string]
  );
  // Hard-reload so React re-reads localStorage from scratch
  await page.reload({ waitUntil: "domcontentloaded", timeout: 20000 }).catch(() => null);
  // Wait for the sidebar (.no-print) — proof that auth succeeded and layout rendered
  const sidebarVisible = await page
    .waitForSelector(".no-print", { timeout: 15000 })
    .then(() => true)
    .catch(() => false);
  if (!sidebarVisible) {
    console.warn(`  ⚠  Sidebar not visible after auth inject for ${roleKey} — app may still be loading`);
  }
  // Extra settle time for React Query initial fetches
  await page.waitForTimeout(2500);
  console.log(`   Auth confirmed for ${roleKey} (URL: ${page.url()})`);
}

/**
 * Navigates to a URL and waits for:
 *   1. domcontentloaded (HTML parsed)
 *   2. The sidebar (.no-print) to be present (React rendered + authenticated)
 *   3. An extra settle period for API data to load
 */
async function nav(page: Page, url: string, _timeout = 14000): Promise<boolean> {
  try {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 20000 });
  } catch {
    console.warn(`  ⚠  Nav goto failed: ${url}`);
    return false;
  }
  // Wait for the authenticated shell to appear
  await page.waitForSelector(".no-print", { timeout: 12000 }).catch(() => null);
  // Let React Query finish its data fetches
  await page.waitForTimeout(3000);
  return true;
}

const BASE_REJECTS = [
  "Control not found", "No evidence found", "401 Unauthorized",
  "Page Not Found", "Access denied", "Demo Mode",
];

/**
 * Injects a small fixed banner into the page showing the screenshot label
 * and current URL so every screenshot is visually distinct.
 */
async function addBanner(page: Page, label: string): Promise<void> {
  await page.evaluate((lbl: string) => {
    const ID = "__guide_banner__";
    const existing = document.getElementById(ID);
    if (existing) existing.remove();
    const bar = document.createElement("div");
    bar.id = ID;
    bar.style.cssText = [
      "position:fixed", "top:0", "left:0", "right:0", "z-index:2147483647",
      "background:#0f172a", "color:#f8fafc", "font-family:ui-monospace,monospace",
      "font-size:11px", "padding:3px 10px", "display:flex",
      "justify-content:space-between", "align-items:center",
      "box-shadow:0 2px 6px rgba(0,0,0,.5)", "pointer-events:none",
    ].join(";");
    bar.innerHTML = `<span style="font-weight:600">🖥 ${lbl}</span>`
      + `<span style="opacity:.65">${window.location.pathname}</span>`;
    document.body.prepend(bar);
  }, label);
  // Tiny pause to let the banner paint
  await page.waitForTimeout(150);
}

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
          { timeout: 12000 }
        );
      } catch {
        console.warn(`  ⚠  Timeout waiting for "${opts.waitFor}" on ${label} (URL: ${page.url()})`);
      }
    }
    const [bodyText, currentUrl] = await Promise.all([
      page.evaluate<string>("document.body?.innerText ?? ''"),
      page.evaluate<string>("window.location.pathname"),
    ]);
    // Debug: log first 120 chars of visible text so we can see what's on each page
    console.log(`     [page: ${currentUrl}] "${bodyText.slice(0, 120).replace(/\n/g, " ")}"`);
    const rejectAll = [...BASE_REJECTS, ...(opts.reject ?? [])];
    for (const pat of rejectAll) {
      if (bodyText.includes(pat)) {
        const idx = bodyText.indexOf(pat);
        const snip = bodyText.slice(Math.max(0, idx - 40), idx + 60).replace(/\n/g, " ");
        console.warn(`  ⚠  Rejected "${pat}" on ${label} — "…${snip}…"`);
        return "";
      }
    }
    // Inject URL banner so every screenshot is visually distinct
    await addBanner(page, label);
    const buf = await page.screenshot({ fullPage: false, clip: opts.clip });
    const b64 = buf.toString("base64");
    console.log(`     ✓ ${label}`);
    return b64;
  } catch (e) {
    console.warn(`  ⚠  Shot failed ${label}: ${e}`);
    return "";
  }
}

/**
 * Clicks a tab by text, then waits for it to become aria-selected="true"
 * before returning — ensures the panel content has actually switched.
 */
async function clickTab(page: Page, text: string): Promise<boolean> {
  try {
    const tab = page.locator(`[role="tab"]`).filter({ hasText: new RegExp(text, "i") }).first();
    if (!(await tab.isVisible({ timeout: 5000 }))) return false;
    await tab.click();
    // Wait for the tab to report itself as selected
    await page
      .waitForFunction(
        (txt: string) => {
          const tabs = Array.from(document.querySelectorAll<HTMLElement>('[role="tab"]'));
          return tabs.some(
            (t) => t.getAttribute("aria-selected") === "true" && t.innerText.toLowerCase().includes(txt.toLowerCase())
          );
        },
        text,
        { timeout: 5000 }
      )
      .catch(() => null);
    // Extra settle time for the tab panel's API fetch
    await page.waitForTimeout(2000);
    return true;
  } catch {
    return false;
  }
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

  console.log(`  → Control detail: ${ctx.bestControlId} — Implementation tab`);
  await nav(page, `${APP_URL}/controls/${ctx.bestControlUUID}`);
  await clickTab(page, "Implementation");
  shots.set("ctrl_impl", await takeShot(page, "ctrl_impl", { waitFor: "Implementation" }));
  if (shots.get("ctrl_impl")) count++;

  console.log(`  → Control detail: ${ctx.bestControlId} — Evidence tab`);
  await clickTab(page, "Evidence");
  shots.set("ctrl_evidence", await takeShot(page, "ctrl_evidence", { waitFor: "Evidence" }));
  if (shots.get("ctrl_evidence")) count++;

  console.log(`  → Control detail: ${ctx.bestControlId} — SSP tab`);
  await clickTab(page, "SSP");
  shots.set("ctrl_ssp", await takeShot(page, "ctrl_ssp", { waitFor: "SSP" }));
  if (shots.get("ctrl_ssp")) count++;

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

  console.log("  → POA&Ms");
  await nav(page, `${APP_URL}/poams`);
  shots.set("poams", await takeShot(page, "poams", { waitFor: "POA" }));
  if (shots.get("poams")) count++;

  console.log("  → Monitoring");
  await nav(page, `${APP_URL}/monitoring`);
  shots.set("monitoring", await takeShot(page, "monitoring", { waitFor: "Monitoring" }));
  if (shots.get("monitoring")) count++;

  const total = Array.from(shots.keys()).length;
  console.log(`\n  📷 ${count} / ${total} admin screenshots captured`);
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

  console.log(`  → Control detail: ${ctx.bestControlId} — Implementation tab`);
  await nav(page, `${APP_URL}/controls/${ctx.bestControlUUID}`);
  await clickTab(page, "Implementation");
  shots.set("ctrl_impl", await takeShot(page, "ctrl_impl", { waitFor: "Implementation" }));
  if (shots.get("ctrl_impl")) count++;

  console.log(`  → Control detail: ${ctx.bestControlId} — Configure tab`);
  await clickTab(page, "Configure");
  shots.set("ctrl_configure", await takeShot(page, "ctrl_configure", { waitFor: "Configure" }));
  if (shots.get("ctrl_configure")) count++;

  console.log(`  → Control detail: ${ctx.bestControlId} — Evidence tab`);
  await clickTab(page, "Evidence");
  shots.set("ctrl_evidence", await takeShot(page, "ctrl_evidence", { waitFor: "Evidence" }));
  if (shots.get("ctrl_evidence")) count++;

  console.log(`  → Control detail: ${ctx.bestControlId} — Monitoring tab`);
  await clickTab(page, "Monitoring");
  shots.set("ctrl_monitoring", await takeShot(page, "ctrl_monitoring", { waitFor: "Monitoring" }));
  if (shots.get("ctrl_monitoring")) count++;

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

  console.log("  → Monitoring tracker");
  await nav(page, `${APP_URL}/monitoring`);
  shots.set("monitoring", await takeShot(page, "monitoring", { waitFor: "Monitoring" }));
  if (shots.get("monitoring")) count++;

  console.log("  → Documents");
  await nav(page, `${APP_URL}/documents/list`);
  shots.set("documents", await takeShot(page, "documents", { waitFor: "Document" }));
  if (shots.get("documents")) count++;

  console.log("  → Missing policies (gap analysis)");
  await nav(page, `${APP_URL}/documents/missing`);
  shots.set("documents_missing", await takeShot(page, "documents_missing", { waitFor: "Missing" }));
  if (shots.get("documents_missing")) count++;

  const total = Array.from(shots.keys()).length;
  console.log(`\n  📷 ${count} / ${total} compliance manager screenshots captured`);
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

  console.log("  → Controls");
  await nav(page, `${APP_URL}/controls`);
  await page.waitForTimeout(2000);
  shots.set("controls", await takeShot(page, "controls", { waitFor: "AC.L1" }));
  if (shots.get("controls")) count++;

  console.log(`  → Control detail: ${ctx.bestControlId} — Implementation tab`);
  await nav(page, `${APP_URL}/controls/${ctx.bestControlUUID}`);
  await clickTab(page, "Implementation");
  shots.set("ctrl_impl", await takeShot(page, "ctrl_impl", { waitFor: "Implementation" }));
  if (shots.get("ctrl_impl")) count++;

  console.log(`  → Control detail: ${ctx.bestControlId} — Evidence tab`);
  await clickTab(page, "Evidence");
  shots.set("ctrl_evidence", await takeShot(page, "ctrl_evidence", { waitFor: "Evidence" }));
  if (shots.get("ctrl_evidence")) count++;

  console.log(`  → Control detail: ${ctx.bestControlId} — SSP tab`);
  await clickTab(page, "SSP");
  shots.set("ctrl_ssp", await takeShot(page, "ctrl_ssp", { waitFor: "SSP" }));
  if (shots.get("ctrl_ssp")) count++;

  console.log("  → POA&Ms (read-only)");
  await nav(page, `${APP_URL}/poams`);
  shots.set("poams", await takeShot(page, "poams", { waitFor: "POA" }));
  if (shots.get("poams")) count++;

  console.log("  → Monitoring (read-only)");
  await nav(page, `${APP_URL}/monitoring`);
  shots.set("monitoring", await takeShot(page, "monitoring", { waitFor: "Monitoring" }));
  if (shots.get("monitoring")) count++;

  console.log("  → Documents");
  await nav(page, `${APP_URL}/documents/list`);
  shots.set("documents", await takeShot(page, "documents", { waitFor: "Document" }));
  if (shots.get("documents")) count++;

  const total = Array.from(shots.keys()).length;
  console.log(`\n  📷 ${count} / ${total} reviewer screenshots captured`);
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

  const ctrlUrl = `${APP_URL}/controls/${ctx.bestControlUUID}`;

  console.log(`  → Control detail: ${ctx.bestControlId} — Implementation tab`);
  await nav(page, ctrlUrl);
  await clickTab(page, "Implementation");
  shots.set("ctrl_impl", await takeShot(page, "ctrl_impl", { waitFor: "Implementation" }));
  if (shots.get("ctrl_impl")) count++;

  console.log(`  → Control detail: ${ctx.bestControlId} — Configure tab`);
  await clickTab(page, "Configure");
  shots.set("ctrl_configure", await takeShot(page, "ctrl_configure", { waitFor: "Configure" }));
  if (shots.get("ctrl_configure")) count++;

  console.log(`  → Control detail: ${ctx.bestControlId} — Evidence tab`);
  await clickTab(page, "Evidence");
  shots.set("ctrl_evidence", await takeShot(page, "ctrl_evidence", { waitFor: "Evidence" }));
  if (shots.get("ctrl_evidence")) count++;

  console.log(`  → Control detail: ${ctx.bestControlId} — Monitoring tab`);
  await clickTab(page, "Monitoring");
  shots.set("ctrl_monitoring", await takeShot(page, "ctrl_monitoring", { waitFor: "Monitoring" }));
  if (shots.get("ctrl_monitoring")) count++;

  console.log(`  → Control detail: ${ctx.bestControlId} — POA&M tab`);
  await clickTab(page, "POA");
  shots.set("ctrl_poam", await takeShot(page, "ctrl_poam", { waitFor: "POA" }));
  if (shots.get("ctrl_poam")) count++;

  console.log(`  → Control detail: ${ctx.bestControlId} — SSP tab`);
  await clickTab(page, "SSP");
  shots.set("ctrl_ssp", await takeShot(page, "ctrl_ssp", { waitFor: "SSP" }));
  if (shots.get("ctrl_ssp")) count++;

  console.log("  → Evidence repository");
  await nav(page, `${APP_URL}/evidence`);
  shots.set("evidence", await takeShot(page, "evidence", { waitFor: "Evidence" }));
  if (shots.get("evidence")) count++;

  if (ctx.firstEvidenceId) {
    console.log("  → Evidence detail");
    await nav(page, `${APP_URL}/evidence/${ctx.firstEvidenceId}`);
    shots.set("evidence_detail", await takeShot(page, "evidence_detail", { waitFor: "Evidence" }));
    if (shots.get("evidence_detail")) count++;
  }

  console.log("  → Monitoring tracker");
  await nav(page, `${APP_URL}/monitoring`);
  shots.set("monitoring", await takeShot(page, "monitoring", { waitFor: "Monitoring" }));
  if (shots.get("monitoring")) count++;

  console.log("  → POA&M register");
  await nav(page, `${APP_URL}/poams`);
  shots.set("poams", await takeShot(page, "poams", { waitFor: "POA" }));
  if (shots.get("poams")) count++;

  console.log("  → Documents");
  await nav(page, `${APP_URL}/documents/list`);
  shots.set("documents", await takeShot(page, "documents", { waitFor: "Document" }));
  if (shots.get("documents")) count++;

  console.log("  → Assessor controls page");
  await nav(page, `${APP_URL}/assessor`);
  shots.set("assessor", await takeShot(page, "assessor", { waitFor: "Assessor" }));
  if (shots.get("assessor")) count++;

  const total = Array.from(shots.keys()).length;
  console.log(`\n  📷 ${count} / ${total} assessor screenshots captured`);
  return shots;
}

// ─── Shared HTML utilities ────────────────────────────────────────────────────

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
  return `<ol class="step-list">${items.map((s, i) =>
    `<li><div class="step-num">${i + 1}</div><div class="step-content">${s}</div></li>`
  ).join("")}</ol>`;
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

function checklist(title: string, items: string[]): string {
  return `<div class="checklist">
  <div class="checklist-title">✅ ${title}</div>
  <ul>${items.map(i => `<li>${i}</li>`).join("\n")}</ul>
</div>`;
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
  .sub2-title { font-size: 10.5pt; font-weight: 600; color: #334155; margin: 14px 0 6px; }
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
  .checklist { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 14px 18px; margin: 14px 0; page-break-inside: avoid; }
  .checklist-title { font-weight: 700; font-size: 10pt; color: #1e3a5f; margin-bottom: 8px; }
  .checklist ul { margin: 0; padding-left: 20px; }
  .checklist li { font-size: 9.5pt; color: #334155; margin-bottom: 4px; list-style: none; padding-left: 4px; }
  .checklist li::before { content: "☐ "; color: #1e40af; font-weight: 700; }
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

function tocPage(entries: Array<{ title: string; sub?: boolean; page?: number }>): string {
  return `<div class="toc-page">
  <div class="toc-title">Table of Contents</div>
  ${entries.map((e, i) => `<div class="toc-entry ${e.sub ? "sub" : "main"}"><span>${e.sub ? "\u00a0\u00a0\u00a0" : `${i + 1} \u2014 `}${e.title}</span><span class="toc-pn">${e.page ?? i + 3}</span></div>`).join("\n  ")}
</div>`;
}

function sec(num: string, title: string, content: string, pageBreak = false): string {
  return `<div class="section${pageBreak ? " page-break" : ""}">
  <div class="section-header"><div class="section-num">Section ${num}</div><div class="section-title">${title}</div></div>
  ${content}
</div>`;
}

function sub(title: string, content: string): string {
  return `<div class="subsection"><div class="subsection-title">${title}</div>${content}</div>`;
}

function sub2(title: string, content: string): string {
  return `<div><div class="sub2-title">${title}</div>${content}</div>`;
}

function wrap(title: string, coverHtml: string, tocHtml: string, body: string): string {
  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"/><title>${title}</title>${CSS}</head><body>${coverHtml}${tocHtml}${body}
  <hr/><p style="text-align:center;font-size:8pt;color:#94a3b8;margin-top:18px;">Confidential — Internal Use Only<br/>Control HUB User Guide — Version ${VERSION} — ${GENERATED_DATE}<br/>Prepared by Carme Technology · info@carmetechnology.com</p></body></html>`;
}

// ─── Admin Guide ──────────────────────────────────────────────────────────────

function buildAdminGuide(shots: Map<string, string>, ctx: OrgCtx): string {
  const s = (k: string) => shots.get(k) ?? "";
  const org = ctx.orgName;

  const coverHtml = cover(
    "Administrator Reference Guide",
    "Control HUB\nGlobal Admin Guide",
    "Platform Administration &amp; Multi-Tenant Management",
    org, "CMMC Level 2 — Global Administrator Role",
    "Confidential — Internal Use Only"
  );

  const tocHtml = tocPage([
    { title: "Purpose of This Guide" },
    { title: "Role Overview &amp; Permissions" },
    { title: "What the Admin Can Do" },
    { title: "What the Admin Cannot Delegate" },
    { title: "Logging In &amp; MFA" },
    { title: "Dashboard Overview" },
    { title: "Controls Library" },
    { title: "Control Package Review" },
    { title: "Evidence Repository" },
    { title: "Evidence Detail &amp; Actions" },
    { title: "User Management" },
    { title: "Organization Management" },
    { title: "POA&amp;M Register" },
    { title: "Monitoring Tracker" },
    { title: "Documentation Library" },
    { title: "Audit Trail" },
    { title: "Security Center &amp; MFA" },
    { title: "Recommended Admin Workflows" },
    { title: "Troubleshooting" },
    { title: "Contact &amp; Support" },
  ]);

  const body = [
    sec("1", "Purpose of This Guide", `
      <p>This guide provides complete reference documentation for the <strong>Global Administrator</strong> role in <strong>Control HUB</strong>, the CMMC Compliance Readiness &amp; Evidence Management Platform operated by Carme Technology.</p>
      <p>The Global Administrator has unrestricted access to all features across every organization hosted on the platform. This guide covers navigation, user management, organization management, evidence oversight, audit trail interpretation, security configuration, and recommended operational workflows.</p>
      ${infoBox("info", "📋 Scope", "This guide covers all major platform areas available to the Global Admin role: dashboard, controls, evidence, users, organizations, POA&Ms, monitoring, documents, audit logs, and the Security Center.")}
    `),

    sec("2", "Role Overview &amp; Permissions", `
      <p>The <strong>Global Administrator</strong> is the highest-privilege role in Control HUB. Admins can operate across all client organizations, manage all users, configure the platform, and oversee the full compliance lifecycle for every organization.</p>
      ${permTable([
        ["Dashboard",        "Full Access",    "All KPIs, domain readiness, activity timeline, overdue items — any org"],
        ["Controls",         "Full Access",    "View and assess all 110 CMMC L2 controls for any organization"],
        ["Evidence",         "Full Access",    "Upload, approve, reject, bulk-update, and manage all evidence"],
        ["User Management",  "Create/Edit",    "Invite, deactivate, reset passwords, manage org memberships"],
        ["Organizations",    "Full Access",    "Create, edit, compare readiness across all client orgs"],
        ["POA&Ms",           "Full Access",    "Create, update, close, and delete Plans of Action and Milestones"],
        ["Monitoring",       "Full Access",    "View and inline-edit all 19 operational monitoring tracker items"],
        ["Documents",        "Full Access",    "Upload, publish, approve, version, and manage all compliance documents"],
        ["Audit Logs",       "Full Access",    "View the complete system-wide audit trail for all users and orgs"],
        ["Security Center",  "Full Access",    "Configure MFA policy, manage break-glass accounts, review security events"],
        ["Settings",         "Full Access",    "Account settings, notification preferences, and platform configuration"],
        ["Write Actions",    "Full Access",    "All create, edit, delete, upload, and approve operations are available"],
      ])}
      ${infoBox("warn", "⚠ Admin Credential Security", "Global Administrator credentials must be protected with MFA. Enable TOTP multi-factor authentication in Settings → Security Center immediately after first login. Limit Global Admin accounts to the minimum required personnel — one or two per organization is the recommended maximum.")}
    `),

    sec("3", "What the Admin Can Do", `
      <p>The following capabilities are available exclusively or primarily to the Global Administrator:</p>
      <ul>
        <li>Create, edit, and deactivate <strong>any user account</strong> across all organizations</li>
        <li>Add users to or remove users from any organization</li>
        <li>Reset any user's password</li>
        <li>Create and manage <strong>client organizations</strong> — name, CMMC target level, and active status</li>
        <li>View <strong>global aggregate statistics</strong> across all organizations</li>
        <li>Compare <strong>compliance readiness</strong> across multiple organizations</li>
        <li>Create, approve, reject, and archive evidence for any organization</li>
        <li>Bulk-update evidence status across multiple items</li>
        <li>Create and close <strong>POA&amp;M items</strong> for any organization</li>
        <li>Configure the <strong>Security Center</strong>: MFA enforcement policy, break-glass accounts</li>
        <li>View the <strong>complete system-wide audit trail</strong> for all users, all organizations</li>
        <li>Generate and export assessor packages for external C3PAO assessment reviews</li>
        <li>Approve and publish compliance documentation</li>
      </ul>
    `),

    sec("4", "What the Admin Cannot Delegate", `
      <p>While the Admin role is the highest privilege, certain operational best practices should not be delegated away from the Admin role:</p>
      <ul>
        <li><strong>MFA enforcement</strong> — only the Admin can configure the platform-wide MFA enforcement policy</li>
        <li><strong>Break-glass account management</strong> — emergency admin accounts should be managed only by senior Admins</li>
        <li><strong>User deletion</strong> — permanent user deletions are irreversible and require Admin authority</li>
        <li><strong>Organization deactivation</strong> — deactivating an org removes it from all user views; Admin-only action</li>
        <li><strong>Cross-org audit log review</strong> — only the Admin can view activity across all organizations simultaneously</li>
      </ul>
      ${infoBox("tip", "💡 Separation of Duties", "Assign a Compliance Manager to each client organization to handle day-to-day control assessments, evidence uploads, and monitoring updates. Reserve Global Admin accounts for platform management and oversight functions.")}
    `),

    sec("5", "Logging In &amp; MFA", `
      <p>Control HUB uses email/password authentication with optional TOTP multi-factor authentication. Admin accounts should always have MFA enabled.</p>
      ${img(s("login"), "Login page", "Figure 5.1 — Control HUB login screen. Enter your admin email and password, then complete the MFA step if enabled.")}
      ${steps([
        "Open your browser and navigate to the Control HUB URL provided by Carme Technology.",
        "Enter your administrator <strong>email address</strong> and <strong>password</strong>, then click <strong>Sign In</strong>.",
        "If MFA is enabled, open your authenticator app (Google Authenticator, Authy, or compatible TOTP app) and enter the 6-digit code.",
        "After login, the <strong>Compliance Dashboard</strong> loads for the default active organization.",
        "Use the <strong>Organization Switcher</strong> in the left sidebar to change the active organization at any time.",
      ])}
      ${infoBox("warn", "⚠ First Login", "On first login, immediately navigate to Settings → Security Center and enable TOTP multi-factor authentication. Do not operate an admin account without MFA protection.")}
    `),

    sec("6", "Dashboard Overview", `
      <p>The <strong>Compliance Dashboard</strong> provides an executive summary of the currently selected organization's CMMC readiness. As Global Admin, you can switch between any client organization using the sidebar switcher.</p>
      ${img(s("dashboard"), "Admin dashboard", "Figure 6.1 — Executive compliance dashboard showing KPI cards, domain readiness chart, activity timeline, and recommended next actions for the selected organization.")}
      <div class="sub2-title">Dashboard Elements Reference</div>
      <table>
        <thead><tr><th>Element</th><th>What It Shows</th><th>Admin Notes</th></tr></thead>
        <tbody>
          <tr><td><strong>Compliance Score</strong></td><td>Percentage of controls with approved evidence</td><td>Target: 100% for assessment readiness</td></tr>
          <tr><td><strong>Controls Status</strong></td><td>Implemented / In Progress / Not Started / N/A counts</td><td>Drill into Controls to see specific gaps</td></tr>
          <tr><td><strong>Evidence Health</strong></td><td>Approved, Pending, Stale, and Expired evidence counts</td><td>Stale/Expired items need immediate attention</td></tr>
          <tr><td><strong>Monitoring</strong></td><td>Current, Due Soon, and Overdue monitoring item counts</td><td>Overdue items reduce operational compliance posture</td></tr>
          <tr><td><strong>Open POA&amp;Ms</strong></td><td>Count of open and in-progress remediation items</td><td>High-risk overdue POA&amp;Ms are critical findings</td></tr>
          <tr><td><strong>Domain Readiness</strong></td><td>Per-domain compliance across all 14 CMMC L2 domains</td><td>Domains &lt;80% need targeted remediation</td></tr>
          <tr><td><strong>Recent Activity</strong></td><td>Timestamped log of recent compliance actions</td><td>Quickly spot unexpected or unauthorized changes</td></tr>
          <tr><td><strong>Recommended Actions</strong></td><td>System-generated prioritized next steps</td><td>Share with Compliance Managers as a work queue</td></tr>
        </tbody>
      </table>
      ${infoBox("tip", "💡 Switching Organizations", "Use the Organization Switcher in the left sidebar to toggle between client organizations. All dashboard data, evidence, controls, and monitoring items are scoped to the active organization.")}
    `),

    sec("7", "Controls Library", `
      <p>Navigate to <strong>Controls</strong> in the sidebar to view all 110 CMMC Level 2 controls across 14 domains. Admins can view assessment status, filter by domain or level, and drill into any control for full details.</p>
      ${img(s("controls"), "Controls library", "Figure 7.1 — The Controls Library listing all 110 CMMC L2 controls with domain, level, assessment status, and evidence count.")}
      <div class="sub2-title">Controls Library Column Reference</div>
      <table>
        <thead><tr><th>Column</th><th>Description</th><th>Notes</th></tr></thead>
        <tbody>
          <tr><td><strong>Control ID</strong></td><td>CMMC identifier (e.g., AC.L1-3.1.1) — click to open detail</td><td>Searchable; use exact ID for fastest lookup</td></tr>
          <tr><td><strong>Title</strong></td><td>Plain-language requirement name</td><td>Keyword searchable</td></tr>
          <tr><td><strong>Domain</strong></td><td>One of 14 CMMC L2 domains (AC, IA, CM, SC, etc.)</td><td>Use domain filter for systematic review</td></tr>
          <tr><td><strong>Level</strong></td><td>L1 (17 foundational) or L2 (all 110 controls)</td><td>L1 controls must be fully implemented first</td></tr>
          <tr><td><strong>Status</strong></td><td>Implemented / In Progress / Not Started / Not Applicable</td><td>Only Implemented + approved evidence = compliance score contribution</td></tr>
          <tr><td><strong>Evidence</strong></td><td>Count of evidence items linked to this control</td><td>Zero evidence on Implemented = gap requiring attention</td></tr>
        </tbody>
      </table>
      ${infoBox("info", "📋 Search &amp; Filter", "Use the search box to find controls by ID, title, or domain keyword. Combine domain and status filters to systematically work through compliance gaps by area.")}
      ${checklist("Controls Library Admin Checklist", [
        "All L1 controls (17 foundational) should reach Implemented status before L2 controls",
        "Zero-evidence Implemented controls are a gap — ensure Compliance Manager links supporting documentation",
        "Not Applicable controls require a written justification in the control detail",
        "Controls showing Not Started for >30 days should be escalated to the Compliance Manager",
        "Domain readiness below 80% needs a targeted remediation sprint",
      ])}
    `),

    sec("8", "Control Package Review", `
      <p>Clicking any control opens its <strong>Control Package</strong> — the full assessment view for a single CMMC requirement. As an Admin, you can view and edit all tabs for any control in any organization.</p>
      ${sub("8.1 — Implementation Tab", `
        <p>The primary assessment tab containing the organization's written description of how the control is implemented.</p>
        ${img(s("ctrl_impl"), "Control detail — Implementation tab", "Figure 8.1 — Implementation tab showing assessment status selector, implementation narrative editor, and control description.")}
        <table>
          <thead><tr><th>Field</th><th>Description</th></tr></thead>
          <tbody>
            <tr><td><strong>Control Description</strong></td><td>Official CMMC requirement text — the standard that must be met</td></tr>
            <tr><td><strong>Assessment Status</strong></td><td>Implemented / In Progress / Not Started / Not Applicable</td></tr>
            <tr><td><strong>Implementation Narrative</strong></td><td>Organization's written statement of how the control is addressed</td></tr>
            <tr><td><strong>Last Assessed</strong></td><td>Date the status was last reviewed and saved</td></tr>
          </tbody>
        </table>
        ${infoBox("tip", "💡 Narrative Quality", "A strong implementation narrative names specific systems, tools, process owners, and review frequencies. A one-sentence or generic narrative is a red flag — request the Compliance Manager to expand it before assessment.")}
      `)}
      ${sub("8.2 — Evidence Tab", `
        <p>Lists all evidence items linked to this control. Admins can add, remove, approve, and reject evidence directly from this tab.</p>
        ${img(s("ctrl_evidence"), "Control detail — Evidence tab", "Figure 8.2 — Evidence tab listing all artifacts linked to the control with status, type, collection date, and action buttons.")}
        <p>Each evidence record shows: Title, Type, Status badge, Collection Date, Expiry Date, Owner, and action buttons (Preview, Download, Change Status).</p>
        ${infoBox("warn", "⚠ Evidence Adequacy", "At minimum, each Implemented control should have one Approved evidence item of appropriate type. Zero evidence or only Pending/Rejected evidence means the control should not be counted toward the compliance score.")}
      `)}
      ${sub("8.3 — SSP Tab", `
        <p>Contains the System Security Plan narrative for the control — the formal SSP-format description for external review.</p>
        ${img(s("ctrl_ssp"), "Control detail — SSP tab", "Figure 8.3 — SSP tab with the formal System Security Plan narrative for the control. Admins can edit and save SSP content.")}
        ${infoBox("info", "ℹ SSP vs. Implementation", "Keep the SSP narrative consistent with the Implementation tab. The SSP is the externally shareable version; the Implementation tab is the working assessment record. Inconsistencies between the two should be corrected before sharing with assessors.")}
      `)}
    `, true),

    sec("9", "Evidence Repository", `
      <p>Navigate to <strong>Evidence</strong> in the sidebar for the global evidence repository — a searchable, filterable view of all evidence items for the active organization. Admins can perform all evidence lifecycle actions from this page.</p>
      ${img(s("evidence"), "Evidence repository", "Figure 9.1 — Evidence repository showing all organization evidence with status badges, type, owner, collection date, and filter controls.")}
      <div class="sub2-title">Evidence Lifecycle States</div>
      <table>
        <thead><tr><th>Status</th><th>Meaning</th><th>Admin Action</th></tr></thead>
        <tbody>
          <tr><td><span class="badge b-gray">Pending Review</span></td><td>Newly uploaded; awaiting review decision</td><td>Review and Approve or Reject</td></tr>
          <tr><td><span class="badge b-green">Approved</span></td><td>Reviewed and accepted; counts toward compliance score</td><td>Monitor expiry dates</td></tr>
          <tr><td><span class="badge b-red">Rejected</span></td><td>Reviewed and found insufficient; submitter must resubmit</td><td>Verify rejection reason was communicated</td></tr>
          <tr><td><span class="badge b-blue">Assessor Ready</span></td><td>Approved and flagged for external assessor review</td><td>Use for assessment preparation</td></tr>
          <tr><td><span class="badge b-yellow">Stale</span></td><td>Collection date exceeded review period; needs recollection</td><td>Notify evidence owner to recollect</td></tr>
          <tr><td><span class="badge b-gray">Archived</span></td><td>Superseded by a newer version; retained for history</td><td>No action needed; visible in history</td></tr>
        </tbody>
      </table>
      <div class="sub2-title">Filtering &amp; Search</div>
      <ul>
        <li><strong>Search</strong> — find by title, control ID, tag, owner name, or summary keyword</li>
        <li><strong>Status filter</strong> — narrow to a specific lifecycle stage (e.g., Pending Review)</li>
        <li><strong>Type filter</strong> — filter by evidence category (Policy, Screenshot, Report, etc.)</li>
        <li><strong>Domain filter</strong> — show evidence linked to a specific CMMC domain</li>
      </ul>
      ${infoBox("tip", "💡 Bulk Status Updates", "Select multiple evidence items using the checkboxes on the Evidence list, then use Bulk Status Update to approve or change the status of multiple items at once — useful after reviewing a monthly batch submission.")}
    `),

    sec("10", "Evidence Detail &amp; Actions", `
      <p>Click any evidence item title to open its detail page. As Admin, all action buttons (Approve, Reject, Submit, Mark Stale, Supersede) are available.</p>
      ${img(s("evidence_detail"), "Evidence detail", "Figure 10.1 — Evidence detail page showing file preview panel, metadata fields, linked controls, assessor summary, and all status action buttons.")}
      ${sub2("Evidence Detail Fields", `
        <table>
          <thead><tr><th>Field</th><th>Description</th></tr></thead>
          <tbody>
            <tr><td><strong>Title</strong></td><td>Descriptive name of the evidence artifact</td></tr>
            <tr><td><strong>Type</strong></td><td>Category: Policy, Procedure, Screenshot, Log, Certificate, Report, Access Review, Scan Report, etc.</td></tr>
            <tr><td><strong>Status</strong></td><td>Current lifecycle state with action buttons to change it</td></tr>
            <tr><td><strong>Description</strong></td><td>Full description of what the evidence demonstrates</td></tr>
            <tr><td><strong>Assessor Summary</strong></td><td>Brief one-paragraph summary for external assessors</td></tr>
            <tr><td><strong>Collection Date</strong></td><td>When the evidence was gathered</td></tr>
            <tr><td><strong>Expiry Date</strong></td><td>When the evidence becomes stale (if time-bounded)</td></tr>
            <tr><td><strong>Linked Controls</strong></td><td>CMMC controls this evidence supports</td></tr>
            <tr><td><strong>File Preview</strong></td><td>Inline preview for images, PDFs, text files, DOCX, and XLSX</td></tr>
          </tbody>
        </table>
      `)}
      ${sub2("File Preview Capabilities", `
        <p>Control HUB supports inline preview for: <strong>Images</strong> (PNG/JPG/GIF/WebP/SVG — zoom and pan), <strong>PDF</strong> (embedded viewer with fullscreen), <strong>Text/CSV/Log/JSON/YAML</strong> (monospace viewer up to 200 KB), <strong>DOCX</strong> (server-converted to HTML), <strong>XLSX</strong> (sheet-tab table view). For unsupported file types, a download prompt is displayed.</p>
      `)}
      ${checklist("Evidence Quality Checklist", [
        "File can be previewed or downloaded without error",
        "Title is descriptive and specific (not 'Screenshot1' or 'Document')",
        "Type is appropriate for the control being evidenced",
        "Collection date is current (within expected review period)",
        "Description explains what the file demonstrates and how it satisfies the control",
        "Assessor Summary is present and readable by an external reviewer",
        "Linked controls are correct for this type of evidence",
        "Owner is identified",
      ])}
    `),

    sec("11", "User Management", `
      <p>Navigate to <strong>Users</strong> in the sidebar to manage all platform users. You can create accounts, assign roles, manage organization memberships, reset passwords, and deactivate users.</p>
      ${img(s("users"), "User management", "Figure 11.1 — User management page showing the user roster with role badges, organization memberships, and the Invite User action.")}
      ${sub2("Available Roles", `
        <table>
          <thead><tr><th>Role</th><th>Label</th><th>Scope</th><th>Use Case</th></tr></thead>
          <tbody>
            <tr><td><code>admin</code></td><td>Global Admin</td><td>All orgs</td><td>Platform management — use sparingly</td></tr>
            <tr><td><code>compliance_manager</code></td><td>Compliance Manager</td><td>Assigned orgs</td><td>Primary operator for a client organization</td></tr>
            <tr><td><code>reviewer</code></td><td>Reviewer</td><td>Assigned orgs</td><td>Evidence quality assurance reviewer</td></tr>
            <tr><td><code>assessor</code></td><td>Assessor</td><td>Assigned orgs</td><td>External C3PAO assessor (read-only)</td></tr>
            <tr><td><code>member</code></td><td>Member</td><td>Assigned orgs</td><td>Limited access for non-compliance staff</td></tr>
          </tbody>
        </table>
      `)}
      ${sub("Inviting a New User", steps([
        "Click <strong>Users</strong> in the sidebar.",
        "Click <strong>Invite User</strong> — enter their name, email address, and select their platform role.",
        "Click <strong>Create User</strong>. A temporary password is assigned — share it securely with the new user.",
        "In the user's <strong>Actions</strong> menu, click <strong>Manage Orgs</strong> to add them to one or more organizations.",
        "Advise the user to log in and change their password in Settings on first login.",
      ]))}
      ${sub("Managing Existing Users", steps([
        "Click <strong>Actions</strong> on any user row to open the action menu.",
        "<strong>Reset Password</strong> — generates a new temporary password for the user.",
        "<strong>Manage Orgs</strong> — add or remove the user's access to specific organizations.",
        "<strong>Deactivate</strong> — blocks login without deleting the account; reversible with Activate.",
        "<strong>Delete</strong> — permanently removes the user. All their contributions (evidence, tasks, assessments) are retained but re-attributed to the requesting Admin.",
      ]))}
      ${infoBox("warn", "⚠ Deletion is Permanent", "Deleting a user is irreversible. Their audit log entries, evidence submissions, and assessment records are retained but their account is permanently removed. Use Deactivate for temporary access removal and Delete only when a user permanently leaves.")}
    `),

    sec("12", "Organization Management", `
      <p>Navigate to <strong>Organizations</strong> (visible only to Global Admins) to create and manage client organizations, view cross-org statistics, and compare compliance posture across multiple clients.</p>
      ${img(s("organizations"), "Organizations management", "Figure 12.1 — Organizations page listing all client organizations with CMMC target level, active status, and overall readiness scores.")}
      ${sub("Creating a New Organization", steps([
        "Click <strong>Organizations</strong> in the sidebar.",
        "Click <strong>Add Organization</strong>.",
        "Enter the organization's legal name and select CMMC target level (L1 or L2).",
        "Click <strong>Create</strong>. The new org appears in the list.",
        "Navigate to <strong>Users</strong> → <strong>Invite User</strong> to create the Compliance Manager account.",
        "In <strong>Manage Orgs</strong>, assign the new user to the new organization.",
      ]))}
      ${sub("Global Statistics", `
        <p>The Organizations page shows an aggregate readiness summary across all orgs. Use this to identify organizations that need immediate attention before scheduled CMMC assessments.</p>
        ${infoBox("tip", "💡 Cross-Org Comparison", "Click any organization name to view its individual readiness score and compliance details. The global stats panel at the top of the Organizations page shows overall averages across all active organizations.")}
      `)}
    `),

    sec("13", "POA&amp;M Register", `
      <p>Navigate to <strong>POA&amp;M</strong> in the sidebar to view and manage all Plans of Action and Milestones for the active organization. POA&amp;Ms formally document controls that are not yet fully implemented and track remediation progress.</p>
      ${img(s("poams"), "POA&M register", "Figure 13.1 — POA&M register listing all open and in-progress remediation items with POAM number, risk level, owner, and target completion date.")}
      <table>
        <thead><tr><th>Field</th><th>Description</th></tr></thead>
        <tbody>
          <tr><td><strong>POA&amp;M Number</strong></td><td>Unique tracking identifier (e.g., POAM-2026-001)</td></tr>
          <tr><td><strong>Title / Weakness</strong></td><td>Brief description of the identified gap or deficiency</td></tr>
          <tr><td><strong>Risk Level</strong></td><td><span class="badge b-red">High</span> <span class="badge b-yellow">Medium</span> <span class="badge b-gray">Low</span> — assessed risk impact</td></tr>
          <tr><td><strong>Status</strong></td><td>Open / In Progress / Closed</td></tr>
          <tr><td><strong>Owner</strong></td><td>Person responsible for executing the remediation plan</td></tr>
          <tr><td><strong>Target Date</strong></td><td>Planned completion date for full remediation</td></tr>
          <tr><td><strong>Linked Control</strong></td><td>The CMMC control the POA&amp;M addresses (if applicable)</td></tr>
          <tr><td><strong>Remediation Plan</strong></td><td>Step-by-step description of how the gap will be closed</td></tr>
        </tbody>
      </table>
      ${steps([
        "Click <strong>Add POA&amp;M</strong> to create a new item — fill in the title, weakness description, risk level, owner, target date, and remediation plan.",
        "Click any POA&amp;M row to open the detail page — update progress notes and remediation status as work progresses.",
        "When fully remediated, open the POA&amp;M and click <strong>Close POA&amp;M</strong>. Upload closure evidence before closing.",
        "Review open POA&amp;Ms monthly. High-risk items past their target date should be escalated.",
      ])}
    `),

    sec("14", "Monitoring Tracker", `
      <p>Navigate to <strong>Monitoring</strong> in the sidebar to manage the 19 recurring operational activities required for ongoing CMMC Level 2 compliance. These cover activities like access reviews, vulnerability scans, log reviews, and backup verification.</p>
      ${img(s("monitoring"), "Monitoring tracker", "Figure 14.1 — Monitoring Tracker showing all 19 CMMC L2 recurring activities with frequency, status, last completed date, and next due date.")}
      <table>
        <thead><tr><th>Column</th><th>Description</th></tr></thead>
        <tbody>
          <tr><td><strong>Activity</strong></td><td>Name of the recurring monitoring task</td></tr>
          <tr><td><strong>Control</strong></td><td>CMMC control this monitoring activity supports (e.g., AC.L1-3.1.1)</td></tr>
          <tr><td><strong>Frequency</strong></td><td>Required cadence: Weekly, Monthly, Quarterly, or Annually</td></tr>
          <tr><td><strong>Last Completed</strong></td><td>Date the activity was most recently reviewed and completed</td></tr>
          <tr><td><strong>Next Due</strong></td><td>Calculated next scheduled due date</td></tr>
          <tr><td><strong>Status</strong></td><td><span class="badge b-green">Current</span> <span class="badge b-yellow">Open</span> <span class="badge b-red">Overdue</span></td></tr>
        </tbody>
      </table>
      ${infoBox("warn", "⚠ Overdue Items", "Overdue monitoring items indicate recurring CMMC operational activities that have not been completed on schedule. These represent sustainment gaps that could be flagged as findings during a CMMC assessment. Resolve overdue items promptly.")}
    `),

    sec("15", "Documentation Library", `
      <p>Navigate to <strong>Documents</strong> in the sidebar to manage the organization's formal compliance documentation — policies, procedures, compliance logs, checklists, and records.</p>
      ${img(s("documents_missing") || s("evidence"), "Documents", "Figure 15.1 — Documents library showing policies, procedures, and records with approval status, version, and expiry tracking.")}
      <table>
        <thead><tr><th>Document Type</th><th>Description</th><th>Examples</th></tr></thead>
        <tbody>
          <tr><td><strong>Policy</strong></td><td>High-level organizational requirements and commitments</td><td>Access Control Policy, Incident Response Policy, Acceptable Use Policy</td></tr>
          <tr><td><strong>Procedure</strong></td><td>Step-by-step implementation of policies</td><td>User Provisioning Procedure, Patch Management Procedure</td></tr>
          <tr><td><strong>Log</strong></td><td>Recurring compliance review log instances</td><td>Monthly Security Log Review, Quarterly Access Review Log</td></tr>
          <tr><td><strong>Record</strong></td><td>Formal compliance records</td><td>Training Completion Records, Risk Assessment Reports</td></tr>
          <tr><td><strong>Checklist</strong></td><td>Point-in-time verification activities</td><td>Onboarding Security Checklist, Annual Audit Checklist</td></tr>
        </tbody>
      </table>
      ${infoBox("tip", "💡 Gap Analysis", "Navigate to Documents → Missing Policies to see a gap analysis of required CMMC policies and procedures that have not yet been uploaded or approved. Use this list to prioritize document creation.")}
    `),

    sec("16", "Audit Trail", `
      <p>Navigate to <strong>Audit Logs</strong> to view a tamper-evident record of every significant action taken in the system across all users and organizations.</p>
      ${img(s("audit_logs"), "Audit logs", "Figure 16.1 — System-wide audit trail showing all events with actor, timestamp, event type, and change details.")}
      <div class="sub2-title">What Is Logged</div>
      <ul>
        <li>User login and logout events</li>
        <li>Evidence create, update, approve, reject, and delete events</li>
        <li>Control assessment status and narrative changes</li>
        <li>User account creation, deactivation, and deletion</li>
        <li>Password reset events</li>
        <li>Organization create, edit, and deactivate events</li>
        <li>POA&amp;M create, update, and close events</li>
        <li>Document upload, approve, and publish events</li>
        <li>Monitoring item status updates</li>
      </ul>
      ${infoBox("info", "📋 Audit Coverage", "The audit trail captures all write operations across the platform. Read-only operations (viewing pages, downloading files) are not logged. Use the audit trail to investigate unexpected changes, verify compliance activities, and demonstrate platform governance to assessors.")}
    `),

    sec("17", "Security Center &amp; MFA", `
      <p>Navigate to <strong>Settings → Security Center</strong> to configure multi-factor authentication for your account and manage the organization's security posture settings.</p>
      ${sub("Setting Up TOTP MFA", steps([
        "Navigate to <strong>Settings</strong> from the sidebar or user menu.",
        "Click the <strong>Security Center</strong> tab.",
        "Under Multi-Factor Authentication, click <strong>Enable MFA</strong>.",
        "Open your TOTP authenticator app (Google Authenticator, Authy, Microsoft Authenticator) and scan the QR code.",
        "Enter the 6-digit code shown in your authenticator app to confirm setup.",
        "Save your <strong>backup codes</strong> in a secure location — they are required to recover access if you lose your authenticator app.",
      ]))}
      ${sub("Break-Glass Accounts", `
        <p>A <strong>break-glass account</strong> is a special emergency admin account for recovering platform access when normal admin credentials are unavailable. Only configure break-glass accounts per Carme Technology guidance.</p>
        ${infoBox("warn", "⚠ Break-Glass Usage", "Break-glass accounts have extended JWT session lifetimes and bypass MFA. All break-glass sessions are logged and audited. These accounts are intended for emergency recovery only — never use them for routine administration.")}
      `)}
    `),

    sec("18", "Recommended Admin Workflows", `
      ${sub("Onboarding a New Client Organization", steps([
        "Navigate to <strong>Organizations → Add Organization</strong>. Enter org name and CMMC target level.",
        "Go to <strong>Users → Invite User</strong>. Create the Compliance Manager account for the new client.",
        "Click <strong>Actions → Manage Orgs</strong> on the new user and associate them with the new org.",
        "Switch to the new org using the <strong>Organization Switcher</strong> and verify the dashboard loads.",
        "Instruct the Compliance Manager to begin self-assessments and evidence uploads.",
      ]))}
      ${sub("Preparing for a CMMC Assessment", steps([
        "Switch to the org being assessed using the <strong>Organization Switcher</strong>.",
        "Review the <strong>Dashboard</strong> — compliance score should be as high as possible before inviting the C3PAO.",
        "Ensure all controls have implementation narratives and at least one <strong>Approved</strong> evidence item.",
        "Check <strong>POA&amp;M</strong> items — all high-risk POA&amp;Ms should have recent progress notes and realistic target dates.",
        "Navigate to <strong>Users → Invite User</strong> and create an Assessor account for the C3PAO.",
        "Add the Assessor user to the assessment org via <strong>Manage Orgs</strong>.",
        "Share the Control HUB URL and assessor credentials with the C3PAO.",
        "Review <strong>Audit Logs</strong> to confirm all approvals and changes are documented.",
      ]))}
      ${sub("Monthly Admin Review", steps([
        "Review the <strong>Dashboard</strong> for each client org using the Organization Switcher.",
        "Check for <strong>Overdue Monitoring</strong> items and notify Compliance Managers to resolve them.",
        "Review <strong>Evidence</strong> for items expiring within the next 30 days — notify evidence owners.",
        "Review <strong>Audit Logs</strong> for any unusual or unexpected events.",
        "Update <strong>POA&amp;M</strong> progress notes for any open remediation items.",
      ]))}
    `),

    sec("19", "Troubleshooting", `
      <table>
        <thead><tr><th>Issue</th><th>Likely Cause</th><th>Resolution</th></tr></thead>
        <tbody>
          <tr><td><strong>Cannot log in</strong></td><td>Incorrect credentials or MFA code expired</td><td>Verify email/password. MFA codes are valid for 30 seconds — try entering a fresh code.</td></tr>
          <tr><td><strong>Locked out of account</strong></td><td>Too many failed login attempts</td><td>Wait 15 minutes for lockout to expire or contact Carme Technology for break-glass access.</td></tr>
          <tr><td><strong>Dashboard shows wrong org</strong></td><td>Active org is not the intended one</td><td>Use the Organization Switcher in the sidebar to select the correct organization.</td></tr>
          <tr><td><strong>User cannot see their org</strong></td><td>Org membership not assigned</td><td>Navigate to Users → Actions → Manage Orgs and add the user to the organization.</td></tr>
          <tr><td><strong>Evidence file will not preview</strong></td><td>Unsupported format or file too large</td><td>Use the Download button to save the file locally.</td></tr>
          <tr><td><strong>Control assessment not saving</strong></td><td>Session expired or network issue</td><td>Log out and log in again. Check the browser console for network errors.</td></tr>
          <tr><td><strong>Audit log missing expected event</strong></td><td>Action was a read-only operation or filter is active</td><td>Clear all audit log filters. Read operations are not logged by design.</td></tr>
          <tr><td><strong>MFA code rejected</strong></td><td>Clock skew between device and server</td><td>Verify your device's system clock is correct and set to automatic time sync.</td></tr>
          <tr><td><strong>Delete User option not visible</strong></td><td>Insufficient role or system restriction</td><td>Confirm you are logged in as Global Admin. Contact support if the issue persists.</td></tr>
        </tbody>
      </table>
    `),

    sec("20", "Contact &amp; Support", `
      <table>
        <thead><tr><th>Contact Type</th><th>Details</th></tr></thead>
        <tbody>
          <tr><td><strong>General Support</strong></td><td>info@carmetechnology.com</td></tr>
          <tr><td><strong>Platform</strong></td><td>Control HUB by Carme Technology</td></tr>
          <tr><td><strong>Organization</strong></td><td>${org}</td></tr>
          <tr><td><strong>Guide Version</strong></td><td>${VERSION} — ${GENERATED_DATE}</td></tr>
        </tbody>
      </table>
      ${infoBox("tip", "✅ Administrator Ready", "This guide covers all major platform management functions for the Global Administrator role. For any issue not covered here, contact info@carmetechnology.com.")}
    `),
  ].join("\n\n");

  return wrap("Control HUB Admin Guide", coverHtml, tocHtml, body);
}

// ─── Compliance Manager Guide ─────────────────────────────────────────────────

function buildComplianceGuide(shots: Map<string, string>, ctx: OrgCtx): string {
  const s = (k: string) => shots.get(k) ?? "";
  const org = ctx.orgName;

  const coverHtml = cover(
    "Compliance Manager Reference Guide",
    "Control HUB\nCompliance Manager Guide",
    "Evidence, Controls &amp; Continuous Compliance",
    org, "CMMC Level 2 — Compliance Manager Role",
    "Confidential — Internal Use Only"
  );

  const tocHtml = tocPage([
    { title: "Purpose of This Guide" },
    { title: "Role Overview &amp; Permissions" },
    { title: "What the Compliance Manager Can Do" },
    { title: "What the Compliance Manager Cannot Do" },
    { title: "Logging In" },
    { title: "Dashboard Overview" },
    { title: "Controls Library" },
    { title: "Assessing a Control" },
    { title: "Evidence Management" },
    { title: "Evidence Detail &amp; Actions" },
    { title: "POA&amp;M Register" },
    { title: "Monitoring Tracker" },
    { title: "Documentation Library" },
    { title: "Gap Analysis — Missing Policies" },
    { title: "Monthly Compliance Workflow" },
    { title: "Assessment Preparation Workflow" },
    { title: "Troubleshooting" },
    { title: "Contact &amp; Support" },
  ]);

  const body = [
    sec("1", "Purpose of This Guide", `
      <p>This guide provides complete reference documentation for the <strong>Compliance Manager</strong> role in <strong>Control HUB</strong>, the CMMC Compliance Readiness &amp; Evidence Management Platform operated by Carme Technology.</p>
      <p>The Compliance Manager is the primary operator of the platform for a specific organization. This role owns the organization's CMMC readiness program: performing control self-assessments, uploading and managing evidence, tracking POA&amp;M items, maintaining the monitoring tracker, and preparing for C3PAO assessment reviews.</p>
      ${infoBox("info", "📋 Scope", "This guide covers all areas of Control HUB available to the Compliance Manager: dashboard, controls, evidence, POA&Ms, monitoring, documents, and recommended workflows for ongoing and assessment-preparation compliance activities.")}
    `),

    sec("2", "Role Overview &amp; Permissions", `
      <p>The <strong>Compliance Manager</strong> is the day-to-day operator for their assigned organization. This role has full access to all compliance content within the organization — controls, evidence, POA&amp;Ms, monitoring, and documentation.</p>
      ${permTable([
        ["Dashboard",     "Full Access",      "All KPIs, readiness score, domain breakdown, and recommended actions"],
        ["Controls",      "Full Access",      "Self-assess all 110 CMMC L2 controls; write implementation narratives"],
        ["Evidence",      "Approve / Reject", "Upload, approve, reject, and manage the full evidence lifecycle"],
        ["POA&Ms",        "Create/Edit",      "Create and close Plans of Action and Milestones for open gaps"],
        ["Monitoring",    "Create/Edit",      "Update all 19 recurring operational monitoring activities"],
        ["Documents",     "Full Access",      "Create, publish, approve, and version compliance documents"],
        ["Tasks",         "Create/Edit",      "Assign remediation tasks to team members and track completion"],
        ["Audit Logs",    "Read Only",        "View all system events for the organization"],
        ["Users",         "No Access",        "User management is handled by Global Admin"],
        ["Organizations", "No Access",        "Organization-level settings managed by Global Admin"],
        ["Security Center","No Access",       "MFA and security configuration is reserved for Admin"],
      ])}
      ${infoBox("info", "📋 Primary Responsibility", "As Compliance Manager, your goal is to drive the organization's compliance score to 100% by ensuring each CMMC control has a documented implementation narrative and at least one piece of approved supporting evidence.")}
    `),

    sec("3", "What the Compliance Manager Can Do", `
      <ul>
        <li>Perform and record <strong>control self-assessments</strong> — set status and write implementation narratives for all 110 controls</li>
        <li>Upload, describe, and link <strong>evidence files</strong> to one or more CMMC controls</li>
        <li>Approve and reject evidence submitted by team members</li>
        <li>Perform <strong>bulk status updates</strong> on multiple evidence items at once</li>
        <li>Create <strong>POA&amp;M items</strong> for controls that cannot be immediately implemented</li>
        <li>Update POA&amp;M progress notes and close POA&amp;Ms when remediation is complete</li>
        <li>Update the <strong>Monitoring Tracker</strong> — mark activities as Current, record completion dates, add notes</li>
        <li>Create, publish, and approve <strong>compliance documents</strong> (policies, procedures, logs)</li>
        <li>Assign <strong>remediation tasks</strong> to team members</li>
        <li>Run the <strong>gap analysis</strong> to identify missing required policies and procedures</li>
        <li>View the <strong>audit trail</strong> for all activities within the organization</li>
      </ul>
    `),

    sec("4", "What the Compliance Manager Cannot Do", `
      <p>The Compliance Manager role is scoped to a single organization and cannot perform platform-level administrative actions:</p>
      <ul>
        <li>Create, edit, or deactivate user accounts</li>
        <li>Manage organization-level settings (name, CMMC target level)</li>
        <li>Access other organizations' data</li>
        <li>Configure MFA enforcement policy or Security Center settings</li>
        <li>View cross-organization aggregate statistics</li>
        <li>Create Assessor accounts (must request from Global Admin)</li>
      </ul>
      ${infoBox("tip", "💡 Working with Admin", "If you need a user account created, a new Assessor invited, or org-level configuration changed, contact your Global Administrator. For platform support, contact info@carmetechnology.com.")}
    `),

    sec("5", "Logging In", `
      <p>Control HUB uses email/password authentication. MFA may be enforced by your organization's administrator.</p>
      ${steps([
        "Open your browser and navigate to the Control HUB URL provided by Carme Technology.",
        "Enter your <strong>email address</strong> and <strong>password</strong>, then click <strong>Sign In</strong>.",
        "If MFA is enabled, open your authenticator app and enter the 6-digit code.",
        "After login, the <strong>Compliance Dashboard</strong> loads for your assigned organization.",
        "If you belong to multiple organizations, use the <strong>Organization Switcher</strong> in the sidebar to confirm the correct one is active.",
      ])}
      ${infoBox("info", "🔐 Enabling MFA", "You can enable TOTP multi-factor authentication for your own account in Settings → Security Center. This is strongly recommended to protect access to your organization's compliance data.")}
    `),

    sec("6", "Dashboard Overview", `
      <p>The dashboard provides an at-a-glance summary of your organization's CMMC compliance posture. Check it regularly to identify gaps and prioritize remediation activities.</p>
      ${img(s("dashboard"), "Compliance Manager dashboard", "Figure 6.1 — Compliance dashboard showing the organization's readiness score, domain progress, evidence health, monitoring status, and recommended next actions.")}
      <table>
        <thead><tr><th>Dashboard Element</th><th>What It Shows</th><th>Your Action</th></tr></thead>
        <tbody>
          <tr><td><strong>Compliance Score</strong></td><td>% of controls with approved evidence</td><td>Target: 100%; prioritize controls below 80%</td></tr>
          <tr><td><strong>Controls Status</strong></td><td>Implemented / In Progress / Not Started counts</td><td>Click through to start assessments on Not Started controls</td></tr>
          <tr><td><strong>Evidence Health</strong></td><td>Approved, Pending, Stale, Expired counts</td><td>Stale/Expired evidence must be recollected urgently</td></tr>
          <tr><td><strong>Overdue Monitoring</strong></td><td>Count of monitoring activities past their due date</td><td>Update the Monitoring Tracker to clear overdue items</td></tr>
          <tr><td><strong>Open POA&amp;Ms</strong></td><td>Count of open and in-progress remediation items</td><td>Update progress notes; close when remediation is complete</td></tr>
          <tr><td><strong>Recommended Actions</strong></td><td>Prioritized next steps generated by the system</td><td>Work through these weekly to maintain compliance momentum</td></tr>
        </tbody>
      </table>
    `),

    sec("7", "Controls Library", `
      <p>Navigate to <strong>Controls</strong> to view all 110 CMMC Level 2 controls. This is your primary workspace for driving compliance score improvements — find controls that need assessment, write narratives, and link evidence.</p>
      ${img(s("controls"), "Controls library", "Figure 7.1 — Controls Library showing all 110 CMMC L2 controls with domain, level, assessment status badge, and evidence count per control.")}
      <div class="sub2-title">Controls Library Column Reference</div>
      <table>
        <thead><tr><th>Column</th><th>Description</th><th>Notes</th></tr></thead>
        <tbody>
          <tr><td><strong>Control ID</strong></td><td>CMMC identifier (e.g., AC.L1-3.1.1) — click to open</td><td>Search by exact ID for fastest lookup</td></tr>
          <tr><td><strong>Title</strong></td><td>Requirement name from CMMC Level 2 Practice Guide</td><td>Keyword searchable</td></tr>
          <tr><td><strong>Domain</strong></td><td>One of 14 CMMC L2 domains</td><td>Use domain filter to work systematically by area</td></tr>
          <tr><td><strong>Level</strong></td><td>L1 or L2</td><td>Focus on L1 controls first — they are foundational</td></tr>
          <tr><td><strong>Status</strong></td><td>Self-assessed implementation status</td><td>Set via the Implementation tab on the control detail</td></tr>
          <tr><td><strong>Evidence</strong></td><td>Count of linked evidence items</td><td>Zero = gap even if status is Implemented</td></tr>
        </tbody>
      </table>
      ${infoBox("tip", "💡 Where to Start", "Filter by Status: Not Started and sort by Domain to find the highest-priority gaps. Focus on Access Control (AC) and Identification &amp; Authentication (IA) domains first — they have the most L1 controls and are assessed first.")}
    `),

    sec("8", "Assessing a Control", `
      <p>Click any control to open its full <strong>Control Package</strong>. The Implementation tab is your primary workspace for documenting how each CMMC requirement is met at your organization.</p>
      ${sub("8.1 — Implementation Tab", `
        <p>The Implementation tab is where you record the formal self-assessment: set the status and write the implementation narrative.</p>
        ${img(s("ctrl_impl"), "Control Implementation tab", "Figure 8.1 — Implementation tab showing status selector and implementation narrative text editor.")}
        ${steps([
          "Open a control from the Controls Library.",
          "On the <strong>Implementation</strong> tab, set <strong>Assessment Status</strong> to reflect current state (Implemented, In Progress, Not Started, or Not Applicable).",
          "Write a detailed <strong>Implementation Narrative</strong> — describe the specific systems, tools, process owners, and review frequencies that satisfy this control at your organization.",
          "Click <strong>Save</strong> to record the assessment.",
          "Switch to the <strong>Evidence</strong> tab to link or upload supporting documentation.",
        ])}
        ${infoBox("warn", "⚠ Narrative Quality", "Implementation narratives should be specific and verifiable. Avoid generic statements. Name the actual systems used (e.g., 'Microsoft Azure AD Conditional Access'), the team responsible, and the review frequency. A one-sentence narrative will not satisfy a C3PAO assessor.")}
        ${checklist("Implementation Tab Checklist", [
          "Assessment Status is set (not left as blank/Not Started if work has been done)",
          "Narrative is present and is more than one or two sentences",
          "Narrative names specific systems, platforms, and processes",
          "Narrative identifies responsible personnel or team",
          "For recurring activities, the narrative states the review frequency",
          "Narrative is specific to this organization — not a copy of generic template text",
        ])}
      `)}
      ${sub("8.2 — Configure Tab", `
        <p>The Configure tab provides step-by-step implementation guidance describing how the control should be configured and what evidence should be captured. Use this to understand what artifacts are expected as evidence.</p>
        ${img(s("ctrl_configure"), "Control Configure tab", "Figure 8.2 — Configure tab showing step-by-step implementation guidance with expected evidence artifacts for each configuration step.")}
        <p>The Configure tab lists: implementation approach, configuration steps, expected evidence to capture, required policies/procedures, and validation steps. Use it as your evidence collection checklist.</p>
        ${infoBox("info", "ℹ Configure Tab as Guide", "Use the Configure tab to understand what the assessor will expect. Each step that says 'capture screenshot of' or 'save a copy of' is telling you what evidence to upload in the Evidence tab.")}
      `)}
      ${sub("8.3 — Evidence Tab on Control", `
        <p>The Evidence tab on a control detail page shows all evidence items linked to this specific control. You can link existing repository evidence or upload new files directly here.</p>
        ${img(s("ctrl_evidence"), "Control Evidence tab", "Figure 8.3 — Evidence tab listing all evidence items linked to this control with status, type, and collection date.")}
        ${steps([
          "On the Evidence tab, click <strong>Add Evidence</strong> to link an existing evidence item from the repository.",
          "Or click <strong>Upload Evidence</strong> to add a new file — fill in the title, type, description, and collection date.",
          "After uploading, set the Expiry Date if the evidence is time-bounded (e.g., quarterly screenshots expire in 90 days).",
          "Review the linked evidence and click <strong>Approve</strong> if it meets the standard, or <strong>Reject</strong> with a written reason.",
        ])}
      `)}
      ${sub("8.4 — Monitoring Tab on Control", `
        <p>Shows recurring monitoring activities specifically linked to this control. Controls that require ongoing review will have associated monitoring items here.</p>
        ${img(s("ctrl_monitoring"), "Control Monitoring tab", "Figure 8.4 — Monitoring tab showing recurring activities linked to this control with frequency and current status.")}
        ${infoBox("tip", "💡 Monitoring &amp; Evidence", "Each time you complete a monitoring activity (e.g., monthly access review), update the Monitoring Tracker status AND upload the review output as an evidence item linked to the control. This creates a complete, time-stamped audit trail.")}
      `)}
    `, true),

    sec("9", "Evidence Management", `
      <p>Evidence is the foundation of your CMMC compliance program. Navigate to <strong>Evidence</strong> in the sidebar for the global evidence repository — a searchable list of all evidence for your organization.</p>
      ${img(s("evidence"), "Evidence repository", "Figure 9.1 — Evidence repository showing all organization evidence with status badges, type, owner, collection date, and expiry information.")}
      <div class="sub2-title">Evidence Lifecycle</div>
      <table>
        <thead><tr><th>Status</th><th>Description</th><th>Your Action</th></tr></thead>
        <tbody>
          <tr><td><span class="badge b-gray">Pending Review</span></td><td>Newly uploaded; awaiting review</td><td>Review and Approve or Reject</td></tr>
          <tr><td><span class="badge b-green">Approved</span></td><td>Accepted; counts toward compliance score</td><td>Monitor expiry dates</td></tr>
          <tr><td><span class="badge b-red">Rejected</span></td><td>Found insufficient; submitter must resubmit</td><td>Communicate rejection reason clearly</td></tr>
          <tr><td><span class="badge b-blue">Assessor Ready</span></td><td>Approved and flagged for C3PAO review</td><td>Use for assessment preparation</td></tr>
          <tr><td><span class="badge b-yellow">Stale</span></td><td>Collection date exceeded review period</td><td>Notify owner to recollect urgently</td></tr>
        </tbody>
      </table>
      ${infoBox("tip", "💡 Bulk Approvals", "Select multiple evidence items with checkboxes and use Bulk Status Update to approve a batch at once. Useful after team members submit a monthly evidence package.")}
      ${checklist("Evidence Repository Monthly Checklist", [
        "All 'Pending Review' items have been reviewed (Approved or Rejected) within 5 business days of submission",
        "No evidence items are in 'Stale' status without a recollection plan",
        "Evidence expiring within the next 30 days has been flagged to the evidence owner",
        "Each control marked Implemented has at least one Approved evidence item",
        "All evidence items have descriptive titles, types, and assessor summaries",
      ])}
    `),

    sec("10", "Evidence Detail &amp; Actions", `
      <p>Click any evidence item to open its detail page. Here you can preview the attached file, review metadata, and take lifecycle actions (Approve, Reject, Mark Stale, Supersede).</p>
      ${img(s("evidence_detail"), "Evidence detail", "Figure 10.1 — Evidence detail page showing inline file preview, metadata panel, linked controls, assessor summary, and status action buttons.")}
      <div class="sub2-title">Evidence Detail Fields</div>
      <table>
        <thead><tr><th>Field</th><th>Description</th></tr></thead>
        <tbody>
          <tr><td><strong>Title</strong></td><td>Descriptive name of the artifact</td></tr>
          <tr><td><strong>Type</strong></td><td>Policy, Procedure, Screenshot, Log, Report, Certificate, Access Review, Scan Report, etc.</td></tr>
          <tr><td><strong>Status</strong></td><td>Current lifecycle state with action buttons</td></tr>
          <tr><td><strong>Description</strong></td><td>Full explanation of what the evidence demonstrates</td></tr>
          <tr><td><strong>Assessor Summary</strong></td><td>Brief one-paragraph summary for external C3PAO reviewers</td></tr>
          <tr><td><strong>Collection Date</strong></td><td>When the evidence was gathered</td></tr>
          <tr><td><strong>Expiry Date</strong></td><td>When the evidence becomes stale (set for time-bounded artifacts)</td></tr>
          <tr><td><strong>Linked Controls</strong></td><td>CMMC controls this evidence supports</td></tr>
        </tbody>
      </table>
      ${sub("Approving Evidence", `
        <p>When reviewing evidence for approval, verify: (1) the file content actually demonstrates what the description claims, (2) the collection date is within the required review period, (3) the evidence is specific to your organization — not a generic template, and (4) the linked controls are appropriate.</p>
      `)}
      ${sub("Rejecting Evidence", `
        <p>When rejecting evidence, provide a clear, specific rejection reason so the submitter knows exactly what to fix:</p>
        <ul>
          <li><em>"Evidence is outdated — collection date is 14 months ago. Please collect a current version."</em></li>
          <li><em>"Screenshot only shows part of the required configuration — include the full policy settings screen."</em></li>
          <li><em>"Generic template text — this must reflect your organization's actual settings and systems."</em></li>
          <li><em>"Wrong control linked — this evidence relates to IA.L2-3.5.3 (MFA), not AC.L1-3.1.1."</em></li>
        </ul>
      `)}
    `),

    sec("11", "POA&amp;M Register", `
      <p>Navigate to <strong>POA&amp;M</strong> to manage all remediation items for your organization. A Plan of Action and Milestones (POA&amp;M) formally documents a compliance gap, who is responsible for fixing it, and when it will be resolved.</p>
      ${img(s("poams"), "POA&M register", "Figure 11.1 — POA&M register showing all open and in-progress remediation items with risk level, owner, and target completion date.")}
      ${steps([
        "Click <strong>Add POA&amp;M</strong> — select the control with the gap, describe the deficiency, assign an owner, set the risk level, and provide a remediation plan.",
        "Open any POA&amp;M row to view or update the remediation plan and add progress notes.",
        "Update POA&amp;M progress regularly — at minimum monthly — to document that remediation is actively in progress.",
        "When fully remediated, upload closure evidence, then click <strong>Close POA&amp;M</strong>.",
      ])}
      ${infoBox("warn", "⚠ POA&amp;M Expectations", "A C3PAO assessor will review all open POA&amp;Ms. Each item must have: a specific weakness description, a defined risk level, an assigned owner, a realistic target date, and documented progress notes. Vague or stale POA&amp;Ms will be flagged as additional findings.")}
    `),

    sec("12", "Monitoring Tracker", `
      <p>Navigate to <strong>Monitoring</strong> to manage the 19 recurring operational activities required for CMMC Level 2 sustainment. Each item has a defined frequency — update the tracker each time an activity is completed.</p>
      ${img(s("monitoring"), "Monitoring tracker", "Figure 12.1 — Monitoring Tracker showing all 19 recurring CMMC L2 activities with frequency, last completed date, next due date, and current status.")}
      <table>
        <thead><tr><th>Column</th><th>Description</th></tr></thead>
        <tbody>
          <tr><td><strong>Activity</strong></td><td>Recurring monitoring task name</td></tr>
          <tr><td><strong>Control</strong></td><td>CMMC control this activity supports</td></tr>
          <tr><td><strong>Frequency</strong></td><td>Weekly / Monthly / Quarterly / Annually</td></tr>
          <tr><td><strong>Last Completed</strong></td><td>Date most recently completed and recorded</td></tr>
          <tr><td><strong>Next Due</strong></td><td>Calculated next scheduled due date</td></tr>
          <tr><td><strong>Status</strong></td><td><span class="badge b-green">Current</span> = done on time &nbsp; <span class="badge b-yellow">Open</span> = pending &nbsp; <span class="badge b-red">Overdue</span> = past due</td></tr>
        </tbody>
      </table>
      ${steps([
        "After completing a monitoring activity (e.g., access review, vulnerability scan), navigate to <strong>Monitoring</strong>.",
        "Click the row for the completed activity.",
        "Set the Status to <strong>Current</strong>, update the <strong>Last Completed</strong> date, and add notes describing what was reviewed and any findings.",
        "Save the update. The Next Due date will recalculate automatically.",
        "Upload the review output (e.g., the access review report) as evidence linked to the related control.",
      ])}
    `),

    sec("13", "Documentation Library", `
      <p>Navigate to <strong>Documents</strong> to manage your organization's formal compliance document library — policies, procedures, logs, records, and checklists.</p>
      ${img(s("documents"), "Documents library", "Figure 13.1 — Documents library listing all organizational policies, procedures, and compliance records with approval status and expiry tracking.")}
      <table>
        <thead><tr><th>Document Type</th><th>Description</th><th>CMMC Requirement</th></tr></thead>
        <tbody>
          <tr><td><strong>Policy</strong></td><td>High-level organizational commitments and requirements</td><td>Many L2 controls require a formal written policy</td></tr>
          <tr><td><strong>Procedure</strong></td><td>Step-by-step implementation instructions</td><td>Required for recurring operational processes</td></tr>
          <tr><td><strong>Log</strong></td><td>Recurring compliance review records</td><td>Required for monitoring and audit activities</td></tr>
          <tr><td><strong>Record</strong></td><td>Formal compliance records and certifications</td><td>Training, risk assessments, vendor agreements</td></tr>
        </tbody>
      </table>
      ${infoBox("tip", "💡 Document Workflows", "Documents follow an approval workflow: Draft → In Review → Approved → Active. Only Active documents count toward compliance. Set document expiry dates and review dates to receive alerts before documents become outdated.")}
    `),

    sec("14", "Gap Analysis — Missing Policies", `
      <p>Navigate to <strong>Documents → Missing Policies</strong> to view a system-generated gap analysis identifying required CMMC policies and procedures that have not yet been created or approved.</p>
      <p>The Missing Policies page maps CMMC requirements to specific policy document types. For each gap:</p>
      ${steps([
        "Review the list of missing required document types.",
        "Click <strong>Create Document</strong> to begin drafting the missing policy or procedure using the built-in editor or file upload.",
        "Complete the document, assign a reviewer, and submit for approval.",
        "Once approved and set to Active status, the gap will clear from the Missing Policies list.",
      ])}
      ${checklist("Documentation Gap Checklist", [
        "Access Control Policy — covers authorized access, least privilege, and account management",
        "Incident Response Policy — covers detection, reporting, and response procedures",
        "Configuration Management Policy — covers baseline configuration and change control",
        "Media Protection Policy — covers handling, storage, and disposal of CUI media",
        "Risk Assessment Procedure — covers periodic risk assessment methodology",
        "System Security Plan (SSP) — covers the full system boundary and control implementations",
      ])}
    `),

    sec("15", "Monthly Compliance Workflow", `
      <p>Follow this structured monthly workflow to maintain continuous CMMC compliance and ensure your compliance score stays high between assessment cycles.</p>
      ${steps([
        "<strong>Dashboard Review</strong> — check compliance score, overdue monitoring items, and open POA&amp;M milestones. Note anything that has declined since last month.",
        "<strong>Monitoring Tracker</strong> — update all monitoring activities that are due this month. Mark completed items as Current and add notes.",
        "<strong>Evidence Queue</strong> — review all evidence in Pending Review status. Approve or reject each item within 5 business days of submission.",
        "<strong>Stale Evidence</strong> — review any evidence flagged as Stale or expiring within 30 days. Contact evidence owners to recollect.",
        "<strong>POA&amp;M Updates</strong> — add progress notes to all open POA&amp;M items. Close any that have been fully remediated.",
        "<strong>Controls Review</strong> — check if any controls moved from In Progress to Implemented this month. Verify they have linked Approved evidence.",
        "<strong>Document Review</strong> — check for policies or procedures expiring within the next 60 days. Initiate renewal reviews.",
        "<strong>Audit Log Review</strong> — scan the audit log for any unexpected or unauthorized changes.",
      ])}
      ${infoBox("tip", "💡 Calendar Reminder", "Set a recurring calendar reminder for the first Monday of each month to complete this checklist. Consistent monthly reviews prevent compliance drift and ensure you are always assessment-ready.")}
    `),

    sec("16", "Assessment Preparation Workflow", `
      <p>Use this checklist-driven workflow to prepare for an upcoming CMMC Third-Party Assessment (C3PAO review). Begin this process at least 60 days before the scheduled assessment date.</p>
      ${steps([
        "<strong>Compliance Score Target</strong> — aim for at least 90% compliance score before inviting the assessor. Focus on controls in Not Started or In Progress status.",
        "<strong>Implementation Narratives</strong> — ensure every control (especially all 110 L2 controls) has a complete, specific implementation narrative. Blank or generic narratives will be flagged.",
        "<strong>Evidence Approval</strong> — review all evidence in the repository. Ensure each control has at least one Approved or Assessor-Ready evidence item. Reject and request recollection for any outdated evidence.",
        "<strong>POA&amp;M Completion</strong> — update all open POA&amp;Ms with current progress notes. For POA&amp;Ms that cannot be closed before assessment, ensure the remediation plan is detailed and the target date is realistic.",
        "<strong>Monitoring Tracker</strong> — ensure all monitoring activities are Current. Resolve any Overdue items before the assessment.",
        "<strong>Documentation</strong> — run the Missing Policies gap analysis. Create and approve any required documents that are missing.",
        "<strong>Assessor Account</strong> — contact your Global Admin to create an Assessor account and add the C3PAO to your organization.",
        "<strong>Assessor Package Review</strong> — navigate to the Assessor page to preview what the assessor will see. Confirm all data is complete and accurate.",
      ])}
      ${infoBox("warn", "⚠ Assessment Readiness", "A C3PAO assessor will review every control, every evidence item, and every POA&amp;M. The platform cannot hide gaps from the assessor — only resolve them. Begin preparation at least 60 days before the assessment date.")}
    `),

    sec("17", "Troubleshooting", `
      <table>
        <thead><tr><th>Issue</th><th>Likely Cause</th><th>Resolution</th></tr></thead>
        <tbody>
          <tr><td><strong>Cannot log in</strong></td><td>Incorrect credentials or expired account</td><td>Contact your Global Admin to reset your password or reactivate your account.</td></tr>
          <tr><td><strong>Evidence upload fails</strong></td><td>File too large or unsupported format</td><td>Evidence files must be under 20 MB. Supported formats: PDF, DOCX, XLSX, PNG, JPG, TXT, CSV. Convert unsupported files before uploading.</td></tr>
          <tr><td><strong>Compliance score not updating</strong></td><td>Evidence is still in Pending/Rejected status</td><td>Only Approved evidence contributes to the score. Approve the pending evidence items.</td></tr>
          <tr><td><strong>Control shows No Evidence despite uploads</strong></td><td>Evidence uploaded to repository but not linked to control</td><td>Open the control's Evidence tab and link the evidence item manually.</td></tr>
          <tr><td><strong>Monitoring item cannot be updated</strong></td><td>Session expired or insufficient permissions</td><td>Refresh the page and try again. If the issue persists, contact support.</td></tr>
          <tr><td><strong>POA&amp;M cannot be closed</strong></td><td>Required fields missing (risk level, owner, or remediation plan)</td><td>Ensure all required fields are filled before attempting to close.</td></tr>
          <tr><td><strong>Document not appearing as Active</strong></td><td>Document is still in Draft or In Review status</td><td>Complete the approval workflow. Document must reach Approved status before becoming Active.</td></tr>
          <tr><td><strong>Bulk status update not working</strong></td><td>No items selected or browser session issue</td><td>Select at least one evidence item using the checkbox before clicking Bulk Update.</td></tr>
        </tbody>
      </table>
    `),

    sec("18", "Contact &amp; Support", `
      <table>
        <thead><tr><th>Contact Type</th><th>Details</th></tr></thead>
        <tbody>
          <tr><td><strong>Platform Support</strong></td><td>info@carmetechnology.com</td></tr>
          <tr><td><strong>CMMC Guidance</strong></td><td>Carme Technology compliance consulting team</td></tr>
          <tr><td><strong>Platform</strong></td><td>Control HUB by Carme Technology</td></tr>
          <tr><td><strong>Organization</strong></td><td>${org}</td></tr>
          <tr><td><strong>Guide Version</strong></td><td>${VERSION} — ${GENERATED_DATE}</td></tr>
        </tbody>
      </table>
      ${infoBox("tip", "✅ Compliance Manager Ready", "This guide covers all major compliance management functions available in Control HUB. For platform assistance or CMMC guidance, contact info@carmetechnology.com.")}
    `),
  ].join("\n\n");

  return wrap("Control HUB Compliance Manager Guide", coverHtml, tocHtml, body);
}

// ─── Reviewer Guide ───────────────────────────────────────────────────────────

function buildReviewerGuide(shots: Map<string, string>, ctx: OrgCtx): string {
  const s = (k: string) => shots.get(k) ?? "";
  const org = ctx.orgName;

  const coverHtml = cover(
    "Reviewer Reference Guide",
    "Control HUB\nReviewer Guide",
    "Evidence Review &amp; Quality Assurance",
    org, "CMMC Level 2 — Reviewer Role",
    "Confidential — Internal Use Only"
  );

  const tocHtml = tocPage([
    { title: "Purpose of This Guide" },
    { title: "Role Overview &amp; Permissions" },
    { title: "What the Reviewer Can Do" },
    { title: "What the Reviewer Cannot Do" },
    { title: "Logging In" },
    { title: "Dashboard Overview" },
    { title: "Evidence Repository — Queue Management" },
    { title: "Evidence Detail &amp; Review Actions" },
    { title: "Evidence Approval Standards" },
    { title: "Controls Library (Read-Only)" },
    { title: "Control Package View" },
    { title: "Documentation (Read-Only)" },
    { title: "POA&amp;M &amp; Monitoring (Read-Only)" },
    { title: "Evidence Review Workflow" },
    { title: "Troubleshooting" },
    { title: "Contact &amp; Support" },
  ]);

  const body = [
    sec("1", "Purpose of This Guide", `
      <p>This guide provides complete reference documentation for the <strong>Reviewer</strong> role in <strong>Control HUB</strong>, the CMMC Compliance Readiness &amp; Evidence Management Platform operated by Carme Technology.</p>
      <p>The Reviewer is responsible for quality-assuring evidence submitted by the organization's team members. This role evaluates whether evidence is accurate, current, sufficiently detailed, and appropriate for the associated CMMC control — then makes an Approve or Reject decision.</p>
      ${infoBox("info", "📋 Your Most Important Function", "Your primary task is to review evidence items in 'Pending Review' status and issue a decision: Approve (evidence is sufficient) or Reject (with a clear written reason). Approved evidence is what drives the organization's CMMC compliance score.")}
    `),

    sec("2", "Role Overview &amp; Permissions", `
      <p>The <strong>Reviewer</strong> role provides evidence review access within the assigned organization. Reviewers can approve and reject evidence but cannot perform control assessments, create POA&amp;Ms, or modify any other compliance content.</p>
      ${permTable([
        ["Dashboard",     "Read Only",        "View compliance score, domain readiness, and activity timeline"],
        ["Controls",      "Read Only",        "Browse all 110 CMMC L2 controls and implementation narratives"],
        ["Evidence",      "Approve / Reject", "Review all evidence — Approve, Reject, or flag as Stale"],
        ["Documents",     "Read Only",        "View policies, procedures, and compliance records"],
        ["POA&Ms",        "Read Only",        "View open gaps and remediation plans"],
        ["Monitoring",    "Read Only",        "View the 19 recurring operational monitoring activities"],
        ["Tasks",         "Read Only",        "View assigned tasks and completion status"],
        ["Audit Logs",    "No Access",        "Audit trail accessible to Admin and Compliance Manager only"],
        ["User Mgmt",     "No Access",        "User and organization management reserved for Admin"],
        ["Assessments",   "No Access",        "Control assessments managed by Compliance Manager"],
        ["Security Center","No Access",       "Security configuration reserved for Admin"],
      ])}
    `),

    sec("3", "What the Reviewer Can Do", `
      <ul>
        <li><strong>Approve</strong> evidence items — marking them as accepted and counting them toward the compliance score</li>
        <li><strong>Reject</strong> evidence items — with a written reason explaining what must be corrected</li>
        <li><strong>Flag evidence as Stale</strong> — when an item's collection date has exceeded the acceptable review period</li>
        <li><strong>Preview and download evidence files</strong> — images, PDFs, text files, DOCX, and XLSX</li>
        <li>View the full <strong>Evidence Repository</strong> — search, filter, and sort all evidence items</li>
        <li>Read <strong>control implementation narratives</strong> to understand what each evidence item is meant to demonstrate</li>
        <li>View all <strong>control detail tabs</strong> (Implementation, Evidence, SSP, Monitoring, POA&amp;M) in read-only mode</li>
        <li>View the <strong>Compliance Dashboard</strong> to track overall progress</li>
        <li>View <strong>Documentation</strong> — policies, procedures, and compliance records</li>
      </ul>
    `),

    sec("4", "What the Reviewer Cannot Do", `
      <p>The Reviewer role is focused exclusively on evidence review. The following actions require the Compliance Manager or Admin role:</p>
      <ul>
        <li>Upload new evidence files</li>
        <li>Edit or delete evidence records</li>
        <li>Set or change control assessment status</li>
        <li>Write or edit implementation narratives</li>
        <li>Create or edit POA&amp;M items</li>
        <li>Update the Monitoring Tracker</li>
        <li>Create, edit, or publish compliance documents</li>
        <li>Manage user accounts or organization settings</li>
        <li>Access the Audit Trail or Security Center</li>
      </ul>
      ${infoBox("tip", "💡 Working with the Compliance Manager", "If you identify evidence that is missing or needs to be collected, communicate this to the Compliance Manager — they are responsible for uploading new evidence. Your role is to evaluate what has been submitted.")}
    `),

    sec("5", "Logging In", `
      <p>Control HUB uses email/password authentication. MFA may be required by your organization.</p>
      ${steps([
        "Open your browser and navigate to the Control HUB URL.",
        "Enter your <strong>email address</strong> and <strong>password</strong>, then click <strong>Sign In</strong>.",
        "If MFA is enabled, open your authenticator app and enter the 6-digit code.",
        "After login, the <strong>Compliance Dashboard</strong> for your organization loads automatically.",
      ])}
      ${infoBox("info", "🔐 MFA Recommended", "Enable TOTP multi-factor authentication for your account in Settings → Security Center to protect access to your organization's compliance data.")}
    `),

    sec("6", "Dashboard Overview", `
      <p>After logging in, the dashboard shows the organization's overall compliance posture. As a Reviewer, focus on the evidence-related indicators that reflect your queue.</p>
      ${img(s("dashboard"), "Reviewer dashboard", "Figure 6.1 — Compliance dashboard showing overall readiness score, evidence health, and recommended actions highlighting pending evidence review items.")}
      <table>
        <thead><tr><th>Dashboard Element</th><th>Reviewer Focus</th></tr></thead>
        <tbody>
          <tr><td><strong>Compliance Score</strong></td><td>Reflects the percentage of controls with Approved evidence — your approvals directly improve this number</td></tr>
          <tr><td><strong>Evidence Health</strong></td><td>The Pending count is your review queue — aim to clear it within 48 hours of submission</td></tr>
          <tr><td><strong>Recommended Actions</strong></td><td>May highlight evidence items awaiting review — use as a quick shortcut to your queue</td></tr>
          <tr><td><strong>Recent Activity</strong></td><td>Shows recent evidence submissions and your past approvals/rejections</td></tr>
        </tbody>
      </table>
    `),

    sec("7", "Evidence Repository — Queue Management", `
      <p>Navigate to <strong>Evidence</strong> in the sidebar for the evidence repository. This is your primary workspace. Filter by <strong>Status: Pending Review</strong> to see your current review queue.</p>
      ${img(s("evidence"), "Evidence repository", "Figure 7.1 — Evidence repository with status filter set to 'Pending Review' to show only evidence items awaiting reviewer decisions.")}
      <div class="sub2-title">Evidence Repository Column Reference</div>
      <table>
        <thead><tr><th>Column</th><th>Description</th><th>Review Notes</th></tr></thead>
        <tbody>
          <tr><td><strong>Title</strong></td><td>Descriptive name of the evidence artifact</td><td>Should be specific enough to identify what the file contains without opening it</td></tr>
          <tr><td><strong>Type</strong></td><td>Category: Policy, Screenshot, Report, Log, Certificate, Access Review, Scan Report, etc.</td><td>Verify the type is appropriate for the control being evidenced</td></tr>
          <tr><td><strong>Status</strong></td><td>Current lifecycle state — focus on <em>Pending Review</em></td><td>Filter to Pending Review as your first action each session</td></tr>
          <tr><td><strong>Linked Controls</strong></td><td>CMMC controls this evidence supports</td><td>Verify the control linkage makes sense for the evidence type</td></tr>
          <tr><td><strong>Collected</strong></td><td>Date the evidence was gathered</td><td>Check for freshness — evidence older than expected review period may need recollection</td></tr>
          <tr><td><strong>Expires</strong></td><td>When the evidence becomes stale</td><td>Items expiring within 30 days need proactive recollection planning</td></tr>
          <tr><td><strong>Owner</strong></td><td>Team member who submitted the evidence</td><td>Contact them directly if you need clarification before making your decision</td></tr>
        </tbody>
      </table>
      ${infoBox("tip", "💡 Review Priority", "Process evidence in the order it was submitted (oldest first). This ensures no submission waits indefinitely and maintains a fair queue discipline. Aim to clear all Pending Review items within 48 business hours of submission.")}
    `),

    sec("8", "Evidence Detail &amp; Review Actions", `
      <p>Click any evidence item title to open its full detail page. This is where you make your review decision — Approve, Reject, or flag as Stale.</p>
      ${img(s("evidence_detail"), "Evidence detail", "Figure 8.1 — Evidence detail page showing the inline file preview panel, metadata fields, linked controls, assessor summary, and Approve/Reject action buttons.")}
      ${steps([
        "Click the evidence item title from the Evidence list.",
        "<strong>Read the Title, Type, Description, and Assessor Summary</strong> — understand what this artifact is meant to demonstrate.",
        "<strong>Preview the file</strong> — images, PDFs, text files, DOCX, and XLSX can be viewed inline. For other formats, click Download.",
        "Verify the <strong>Collection Date</strong> is within the required review period for this type of evidence.",
        "Check the <strong>Linked Controls</strong> — confirm the CMMC control linkage is logical for this evidence type.",
        "Evaluate whether the file content actually demonstrates what the description claims.",
        "Click <strong>Approve</strong> if the evidence meets the standard, or <strong>Reject</strong> and provide a clear written reason.",
      ])}
      <div class="sub2-title">File Preview Capabilities</div>
      <p>Control HUB supports inline preview for: <strong>Images</strong> (PNG/JPG/GIF/WebP/SVG — with zoom and pan), <strong>PDF</strong> (embedded viewer), <strong>Text/CSV/Log/JSON/YAML</strong> (up to 200 KB), <strong>DOCX</strong> (server-converted to HTML), <strong>XLSX</strong> (sheet-tab table view). For unsupported file types, click <strong>Download</strong> to review locally.</p>
    `),

    sec("9", "Evidence Approval Standards", `
      <p>Apply these standards consistently when making approve/reject decisions. Consistent, well-reasoned decisions make the compliance program defensible during a C3PAO assessment.</p>
      ${sub("Approval Criteria — All Must Be True", `
        <ul>
          <li>The file can be opened and previewed (not corrupt or password-protected)</li>
          <li>The file content directly demonstrates what the Title and Description claim</li>
          <li>The evidence is specific to this organization — not a generic template or sample document</li>
          <li>The Collection Date is within the acceptable review period for this type of evidence:
            <ul>
              <li>Screenshots and scan reports: within the last 90 days</li>
              <li>Policies and procedures: within the last 12 months (or has a future effective date)</li>
              <li>Access reviews: within the last review cycle (monthly, quarterly, or annually per the control)</li>
            </ul>
          </li>
          <li>The evidence type is appropriate for the control being evidenced</li>
          <li>The linked controls are logically correct for this evidence</li>
        </ul>
      `)}
      ${sub("Rejection Guidance — Examples", `
        <p>When rejecting evidence, provide the specific reason so the submitter knows exactly what to fix:</p>
        <table>
          <thead><tr><th>Issue</th><th>Rejection Reason to Write</th></tr></thead>
          <tbody>
            <tr><td>Evidence is too old</td><td>"Collection date is 14 months ago — recollect a current version (within 90 days for screenshots)."</td></tr>
            <tr><td>File is incomplete</td><td>"Screenshot only shows a portion of the configuration. Include the full settings screen with organization name visible."</td></tr>
            <tr><td>Generic template content</td><td>"This document appears to be a generic template — it must reflect your organization's actual systems, policies, and personnel."</td></tr>
            <tr><td>Wrong control linked</td><td>"This evidence supports IA.L2-3.5.3 (MFA), not AC.L1-3.1.1 (access control). Please update the linked control."</td></tr>
            <tr><td>File cannot be previewed</td><td>"File is password-protected and cannot be reviewed. Upload an unprotected version or export to PDF."</td></tr>
            <tr><td>Description does not match file</td><td>"Description states this is an access review report, but the file appears to be an unrelated screenshot. Verify you uploaded the correct file."</td></tr>
          </tbody>
        </table>
      `)}
      ${infoBox("warn", "⚠ Do Not Self-Approve", "Never approve evidence that you yourself uploaded or collected. The purpose of the review role is to provide an independent second opinion. If you are both the evidence owner and the reviewer, escalate to the Compliance Manager for approval.")}
      ${checklist("Evidence Review Quality Checklist", [
        "File opens and displays without error",
        "File content matches the evidence Title and Description",
        "Evidence is specific to this organization (not a template or sample)",
        "Collection date is within the acceptable review period",
        "Evidence type is appropriate for the CMMC control",
        "Linked controls are logically correct for this evidence type",
        "Assessor Summary accurately describes what the evidence demonstrates",
        "You are NOT the evidence owner (no self-approval)",
      ])}
    `),

    sec("10", "Controls Library (Read-Only)", `
      <p>Navigate to <strong>Controls</strong> to browse all 110 CMMC Level 2 controls. As a Reviewer, this is read-only — use it to understand the requirements behind evidence items you are evaluating.</p>
      ${img(s("controls"), "Controls library", "Figure 10.1 — Controls library in read-only mode showing all 110 CMMC L2 controls with domain, assessment status, and evidence counts.")}
      <table>
        <thead><tr><th>Column</th><th>Reviewer Use</th></tr></thead>
        <tbody>
          <tr><td><strong>Control ID</strong></td><td>Search by ID to quickly find the control an evidence item is linked to</td></tr>
          <tr><td><strong>Title</strong></td><td>Understand the plain-language requirement before evaluating evidence</td></tr>
          <tr><td><strong>Status</strong></td><td>Implemented controls with zero evidence count are gaps to flag to the Compliance Manager</td></tr>
          <tr><td><strong>Evidence Count</strong></td><td>Low evidence counts for Implemented controls indicate possible gaps</td></tr>
        </tbody>
      </table>
      ${infoBox("tip", "💡 Understanding the Requirement", "When reviewing evidence, open the associated control in a second browser tab. Reading the control's Implementation Narrative tells you what the organization claims to have implemented — your job is to verify the evidence actually supports that claim.")}
    `),

    sec("11", "Control Package View", `
      <p>Click any control to open the full Control Package. As a Reviewer, all tabs are read-only — you cannot edit narratives or change assessment status.</p>
      ${sub("Implementation Tab (Read-Only)", `
        ${img(s("ctrl_impl"), "Control Implementation tab", "Figure 11.1 — Implementation tab in read-only mode showing the assessment status and implementation narrative for the selected control.")}
        <p>Read the Implementation Narrative before reviewing evidence linked to this control. Evaluate whether the narrative is specific enough to verify, and whether the evidence you are reviewing directly supports the claimed implementation approach.</p>
      `)}
      ${sub("Evidence Tab on Control (Read-Only)", `
        ${img(s("ctrl_evidence"), "Control Evidence tab", "Figure 11.2 — Evidence tab on the control detail page showing all artifacts linked to this specific control with status and type.")}
        <p>View all evidence items linked to a control. As a Reviewer, you can click individual evidence items to open their detail page and make approval decisions from there.</p>
      `)}
      ${sub("SSP Tab (Read-Only)", `
        ${img(s("ctrl_ssp"), "Control SSP tab", "Figure 11.3 — SSP tab showing the formal System Security Plan narrative for the control in read-only mode.")}
        <p>The SSP narrative is the formal, externally shareable version of how the control is implemented. Compare it to the Implementation Narrative — inconsistencies between the two should be flagged to the Compliance Manager.</p>
      `)}
    `),

    sec("12", "Documentation (Read-Only)", `
      <p>Navigate to <strong>Documents</strong> to view the organization's policy and procedure library. As a Reviewer, you have read-only access to all documentation.</p>
      ${img(s("documents"), "Documents library", "Figure 12.1 — Documents library showing policies, procedures, and compliance records with approval status and expiry dates.")}
      <p>Use the documentation library as context when reviewing evidence. If an evidence item claims to implement a policy, verify the policy document exists and is in Active status. If a required policy is missing, flag this to the Compliance Manager.</p>
    `),

    sec("13", "POA&amp;M &amp; Monitoring (Read-Only)", `
      ${sub("POA&amp;M Register (Read-Only)", `
        <p>Navigate to <strong>POA&amp;M</strong> to view open remediation items. As a Reviewer, this is read-only. Use it to understand which controls have documented gaps — this context helps when reviewing evidence for those controls.</p>
        ${img(s("poams"), "POA&M register read-only", "Figure 13.1 — POA&M register in read-only view showing open remediation items, risk levels, and target completion dates.")}
        ${infoBox("info", "ℹ Evidence &amp; POA&amp;Ms", "If a control has an open POA&amp;M, it means the organization has acknowledged a gap. Evidence linked to that control should be reviewed carefully — Partial evidence for a partially-implemented control is valid, but must be accurately described.")}
      `)}
      ${sub("Monitoring Tracker (Read-Only)", `
        <p>Navigate to <strong>Monitoring</strong> to view the 19 recurring operational activities. This is read-only. Use it to understand whether the organization is actively performing required recurring reviews.</p>
        ${img(s("monitoring"), "Monitoring tracker read-only", "Figure 13.2 — Monitoring Tracker in read-only view showing recurring CMMC L2 activities with frequency, status, and last completed dates.")}
      `)}
    `),

    sec("14", "Evidence Review Workflow", `
      <p>Follow this structured workflow each time you log in to process your evidence review queue efficiently and consistently.</p>
      ${steps([
        "<strong>Check the Dashboard</strong> — note Evidence Health metrics. The Pending count is your immediate queue.",
        "<strong>Navigate to Evidence</strong> → filter by <strong>Status: Pending Review</strong>.",
        "<strong>Sort by submission date</strong> (oldest first) to process the queue in order.",
        "<strong>Open the first pending item</strong> — read the Title, Type, Description, and Assessor Summary.",
        "<strong>Open the linked control</strong> (in a second browser tab if needed) — read the Implementation Narrative to understand what this evidence is meant to demonstrate.",
        "<strong>Preview or download the file</strong> — verify the content matches the description.",
        "<strong>Check the Collection Date</strong> — confirm it is within the acceptable freshness window.",
        "<strong>Check the Linked Controls</strong> — confirm the control linkage is logical.",
        "<strong>Make your decision</strong>: <strong>Approve</strong> if all criteria are met, or <strong>Reject</strong> with a specific written reason.",
        "<strong>Repeat</strong> until the Pending Review queue is empty. Aim to clear all pending items within 48 hours of submission.",
      ])}
      ${infoBox("tip", "💡 Review Schedule", "Set a calendar reminder to check the Evidence queue every Monday and Thursday. Prompt reviews prevent submission backlogs and keep the compliance score current and accurate.")}
    `),

    sec("15", "Troubleshooting", `
      <table>
        <thead><tr><th>Issue</th><th>Likely Cause</th><th>Resolution</th></tr></thead>
        <tbody>
          <tr><td><strong>Cannot log in</strong></td><td>Incorrect credentials or expired account</td><td>Contact your Global Admin to reset your password or reactivate your account.</td></tr>
          <tr><td><strong>Evidence file will not preview</strong></td><td>Unsupported format or file too large</td><td>Click <strong>Download</strong> to save the file locally and open in the appropriate application.</td></tr>
          <tr><td><strong>Approve/Reject buttons not visible</strong></td><td>Evidence is not in Pending Review status or wrong role</td><td>Confirm you are logged in as Reviewer. Only Pending Review items have active action buttons.</td></tr>
          <tr><td><strong>Cannot find an evidence item</strong></td><td>Item filtered out or different org active</td><td>Clear all Evidence filters. Confirm the correct organization is active in the sidebar.</td></tr>
          <tr><td><strong>Control shows no evidence</strong></td><td>Evidence exists but is not linked to this control</td><td>Contact the Compliance Manager — they can link existing evidence to the control.</td></tr>
          <tr><td><strong>Wrong organization shown</strong></td><td>Org switcher set to a different org</td><td>Click the org name in the sidebar and select the correct organization.</td></tr>
          <tr><td><strong>Session expired</strong></td><td>Login token has expired (24-hour lifetime)</td><td>Log out and log in again.</td></tr>
        </tbody>
      </table>
    `),

    sec("16", "Contact &amp; Support", `
      <table>
        <thead><tr><th>Contact Type</th><th>Details</th></tr></thead>
        <tbody>
          <tr><td><strong>Platform Support</strong></td><td>info@carmetechnology.com</td></tr>
          <tr><td><strong>Platform</strong></td><td>Control HUB by Carme Technology</td></tr>
          <tr><td><strong>Organization</strong></td><td>${org}</td></tr>
          <tr><td><strong>Guide Version</strong></td><td>${VERSION} — ${GENERATED_DATE}</td></tr>
        </tbody>
      </table>
      ${infoBox("tip", "✅ Reviewer Ready", "This guide covers all major evidence review functions for the Reviewer role in Control HUB. For platform assistance or questions about the review process, contact info@carmetechnology.com.")}
    `),
  ].join("\n\n");

  return wrap("Control HUB Reviewer Guide", coverHtml, tocHtml, body);
}

// ─── Assessor Guide ───────────────────────────────────────────────────────────

function buildAssessorGuide(shots: Map<string, string>, ctx: OrgCtx): string {
  const s = (k: string) => shots.get(k) ?? "";
  const org = ctx.orgName;

  const coverHtml = cover(
    "Assessor Reference Guide",
    "Control HUB\nAssessor User Guide",
    "CMMC Assessment Review Instructions",
    org, "CMMC Level 2 — Assessor Read-Only Role",
    "Confidential — Authorized Assessor Use Only"
  );

  const tocHtml = tocPage([
    { title: "Purpose of This Guide" },
    { title: "Assessor Access Overview" },
    { title: "What the Assessor Can Do" },
    { title: "What the Assessor Cannot Do" },
    { title: "Logging In" },
    { title: `Selecting ${org}` },
    { title: "Dashboard Overview" },
    { title: "Controls Library" },
    { title: "Control Package Review" },
    { title: "9.1 — Implementation Tab", sub: true },
    { title: "9.2 — Configure Tab", sub: true },
    { title: "9.3 — Evidence Tab", sub: true },
    { title: "9.4 — Monitoring Tab", sub: true },
    { title: "9.5 — POA&amp;M Tab", sub: true },
    { title: "9.6 — SSP Tab", sub: true },
    { title: `Example: Reviewing ${ctx.bestControlId}` },
    { title: "Evidence Repository" },
    { title: "Documentation" },
    { title: "Monitoring Tracker" },
    { title: "POA&amp;M Register" },
    { title: "Assessor Controls Page" },
    { title: "Recommended Assessor Workflow" },
    { title: "Troubleshooting" },
    { title: "Contact &amp; Support" },
  ]);

  const body = [
    sec("1", "Purpose of This Guide", `
      <p>This guide provides instructions for assessors reviewing <strong>${org}</strong> within <strong>Control HUB</strong>, the CMMC Compliance Readiness &amp; Evidence Management Platform operated by Carme Technology.</p>
      <p>The Assessor role is <strong>read-only</strong>. It provides external reviewers with full visibility into controls, evidence, System Security Plan (SSP) narratives, monitoring records, Plan of Action and Milestones (POA&amp;M) items, and documentation — without the ability to modify any system records.</p>
      ${infoBox("info", "📋 Scope", `This guide covers navigation, screen-by-screen instructions for every Control HUB area, a complete 10-step control review example, assessment checklists for key review areas, troubleshooting, and support contact information for ${org}.`)}
    `),

    sec("2", "Assessor Access Overview", `
      <p>The <strong>Assessor</strong> role provides read-only access to ${org}'s compliance data. It is designed for external CMMC assessors performing Third-Party Assessment Organization (C3PAO) reviews.</p>
      ${permTable([
        ["Dashboard",        "Read Only",   "Compliance score, domain readiness, overdue items, and activity timeline"],
        ["Controls Library", "Read Only",   "All 110 CMMC L2 controls with assessment status and evidence counts"],
        ["Implementation Tab","Read Only",  "Self-assessment status and implementation narrative per control"],
        ["Configure Tab",    "Read Only",   "Step-by-step implementation verification procedures"],
        ["Evidence Tab",     "Read Only",   "All approved evidence — preview and download linked files"],
        ["Monitoring Tab",   "Read Only",   "Recurring operational activities linked to each control"],
        ["POA&amp;M Tab",    "Read Only",   "Open gap remediation items linked to each control"],
        ["SSP Tab",          "Read Only",   "System Security Plan narratives per control"],
        ["Evidence Repository","Read Only", "Global searchable evidence list — preview and download files"],
        ["Documentation",    "Read Only",   "Policies, procedures, logs, and compliance records"],
        ["Monitoring Tracker","Read Only",  "19 recurring operational monitoring activities"],
        ["POA&amp;M Register","Read Only",  "Complete list of open gaps and remediation plans"],
        ["Assessor Page",    "Read Only",   "Dedicated assessor control list with assessment package view"],
        ["Write Actions",    "No Access",   "All create, edit, upload, approve, and delete operations are blocked"],
      ])}
    `),

    sec("3", "What the Assessor Can Do", `
      <p>The Assessor role provides comprehensive read access to the entire compliance record for ${org}:</p>
      <ul>
        <li>View the <strong>Compliance Dashboard</strong> — readiness score, domain progress, evidence health, monitoring status, and activity timeline</li>
        <li>Browse and search the <strong>Controls Library</strong> (all 110 CMMC L2 controls)</li>
        <li>Read <strong>Implementation Narratives</strong> for each control — the organization's self-assessment</li>
        <li>Review the <strong>Configure tab</strong> — step-by-step implementation and verification procedures</li>
        <li>View linked <strong>Evidence</strong> per control — status, type, collection date, owner, and assessor summary</li>
        <li><strong>Preview and download evidence files</strong> — PDFs, images, text files, DOCX, and XLSX</li>
        <li>Access the <strong>Evidence Repository</strong> — globally searchable evidence list with filters</li>
        <li>Review <strong>Monitoring activities</strong> per control — linked recurring operational reviews</li>
        <li>View <strong>POA&amp;M items</strong> per control — documented gaps with risk level and remediation plans</li>
        <li>Read <strong>SSP narratives</strong> per control — formal System Security Plan documentation</li>
        <li>Access <strong>Documentation</strong> — policies, procedures, logs, and compliance records</li>
        <li>View the <strong>Monitoring Tracker</strong> — all 19 recurring operational activities with completion status</li>
        <li>Review the <strong>POA&amp;M Register</strong> — complete list of all open and closed remediation items</li>
        <li>Use the <strong>Assessor Controls Page</strong> — a dedicated assessment interface</li>
        <li>Use the <strong>Help Center</strong> — in-app user guide and FAQ</li>
      </ul>
    `),

    sec("4", "What the Assessor Cannot Do", `
      <p>The Assessor role is strictly read-only. The following actions are blocked at the API level — they are not merely hidden in the UI:</p>
      <ul>
        <li>Add, edit, or delete evidence items</li>
        <li>Upload files or attachments of any kind</li>
        <li>Change assessment status, evidence status, or document status</li>
        <li>Edit implementation narratives or control records</li>
        <li>Edit SSP content</li>
        <li>Update or edit the Monitoring Tracker</li>
        <li>Create, edit, or close POA&amp;M items</li>
        <li>Create or manage user accounts</li>
        <li>Access Settings or Security Center</li>
        <li>Access User Management or Organization settings</li>
        <li>Connect external systems or run automated scans</li>
        <li>Delete any records</li>
      </ul>
      ${infoBox("warn", "⚠ Read-Only Enforcement", `The system blocks all write operations for the Assessor role at the API level. If you encounter a UI element that appears to allow editing, please report it to the ${org} administrator and to info@carmetechnology.com.`)}
    `),

    sec("5", "Logging In", `
      <p>Control HUB uses email/password authentication. Multi-factor authentication (MFA) may be required. Your assessor credentials will be provided by the ${org} compliance administrator.</p>
      ${steps([
        `Open your browser and navigate to the Control HUB URL provided by ${org}.`,
        "Enter your assigned <strong>assessor email address</strong>.",
        "Enter your assigned <strong>password</strong>.",
        "Click <strong>Sign In</strong>.",
        "If MFA is required, open your authenticator app and enter the 6-digit TOTP code.",
        `Upon successful login, the <strong>Compliance Dashboard</strong> for ${org} loads automatically.`,
      ])}
      ${infoBox("info", "🔐 Login Assistance", `If you cannot log in, are locked out, or have not received credentials, contact: <strong>info@carmetechnology.com</strong> or the ${org} compliance administrator.`)}
    `),

    sec("6", `Selecting ${org}`, `
      <p>Control HUB supports multiple organizations in a single platform. After login, confirm that <strong>${org}</strong> is the active organization shown in the top-left of the sidebar.</p>
      ${img(s("dashboard"), `Dashboard — confirming ${org} is selected`, `Figure 6.1 — After login, confirm the sidebar header shows "${org}" as the active organization before beginning your assessment review.`)}
      <p>If the wrong organization is displayed, click the organization name in the sidebar to open the switcher, then select <strong>${org}</strong>.</p>
      ${infoBox("info", "ℹ Org Scope", `All data — controls, evidence, documents, monitoring, POA&Ms — is scoped to the active organization. If your assessor account has access to only one organization, it will be pre-selected automatically.`)}
    `),

    sec("7", "Dashboard Overview", `
      <p>The <strong>Compliance Dashboard</strong> provides a summary of ${org}'s overall CMMC readiness. Review it at the start of your assessment to understand the organization's current compliance posture.</p>
      ${img(s("dashboard"), "Compliance dashboard", `Figure 7.1 — The ${org} Compliance Dashboard. KPI cards show overall readiness, evidence health, monitoring status, POA&M health, and domain-level breakdown.`)}
      <table>
        <thead><tr><th>Dashboard Element</th><th>What It Shows</th><th>Assessor Notes</th></tr></thead>
        <tbody>
          <tr><td><strong>Overall Readiness</strong></td><td>% of controls with approved evidence</td><td>Starting point — note this number and compare to domain breakdown</td></tr>
          <tr><td><strong>Controls Status</strong></td><td>Implemented / In Progress / Not Started / N/A counts</td><td>Not Started controls require investigation — is the gap acknowledged?</td></tr>
          <tr><td><strong>Evidence Health</strong></td><td>Approved, Pending, Stale, Archived counts</td><td>Stale evidence on active controls is a potential finding</td></tr>
          <tr><td><strong>Monitoring</strong></td><td>Current, Due Soon, Overdue monitoring counts</td><td>Overdue items indicate sustainment gaps</td></tr>
          <tr><td><strong>Open POA&amp;Ms</strong></td><td>Open, In Progress, Closed POA&amp;M counts</td><td>High-risk overdue items are material findings</td></tr>
          <tr><td><strong>Domain Readiness</strong></td><td>Per-domain compliance across all 14 CMMC L2 domains</td><td>Domains below 80% need focused attention during your review</td></tr>
          <tr><td><strong>Recent Activity</strong></td><td>Recent compliance actions — evidence changes, assessments</td><td>Note any evidence approved within 30 days of assessment — verify it predates the assessment notice</td></tr>
        </tbody>
      </table>
    `),

    sec("8", "Controls Library", `
      <p>Navigate to <strong>Controls</strong> to view all 110 CMMC Level 2 controls. Use search and domain filters to systematically review each CMMC domain.</p>
      ${infoBox("tip", "💡 Assessor Tip", `Search by exact CMMC control ID (e.g., <strong>AC.L1-3.1.1</strong>) for the fastest lookup. The search bar matches on control ID, title, and domain name.`)}
      ${img(s("controls"), `Controls Library — ${org}`, `Figure 8.1 — The ${org} Controls Library. All 110 CMMC L2 controls with assessment status badges and evidence counts.`)}
      <div class="sub2-title">Controls Library Column Reference</div>
      <table>
        <thead><tr><th>Column</th><th>Description</th><th>Assessor Notes</th></tr></thead>
        <tbody>
          <tr><td><strong>Control ID</strong></td><td>CMMC identifier (e.g., AC.L1-3.1.1) — click to open Control Package</td><td>Use exact ID for lookup; searchable</td></tr>
          <tr><td><strong>Title</strong></td><td>Plain-language requirement name</td><td>Keyword searchable if ID is unknown</td></tr>
          <tr><td><strong>Domain</strong></td><td>One of 14 CMMC L2 domains (AC, IA, CM, SC, SI, etc.)</td><td>Filter to systematically review by domain</td></tr>
          <tr><td><strong>Level</strong></td><td>L1 (17 foundational) or L2 (all 110)</td><td>L1 controls must all be implemented as foundational requirements</td></tr>
          <tr><td><strong>Status</strong></td><td>Implemented / In Progress / Not Started / Not Applicable</td><td>Not Started on an in-scope control = gap</td></tr>
          <tr><td><strong>Evidence</strong></td><td>Count of linked evidence items</td><td>Implemented status + 0 evidence = finding</td></tr>
        </tbody>
      </table>
      <div class="sub2-title">Search &amp; Filter Options</div>
      <ul>
        <li><strong>Search box</strong> — Control ID, title keyword, or domain name</li>
        <li><strong>Domain filter</strong> — Restrict to one of 14 CMMC domains for systematic review</li>
        <li><strong>Level filter</strong> — Show only L1 (foundational) or all L2 controls</li>
        <li><strong>Status filter</strong> — Show Implemented, In Progress, Not Started, or Not Applicable controls</li>
      </ul>
      ${infoBox("warn", "⚠ Status Interpretation", `A control marked <strong>Not Started</strong> indicates the control has not been formally self-assessed by ${org}. Note these controls in your findings. For controls marked <strong>Not Applicable</strong>, verify the justification in the control detail before accepting the classification.`)}
      ${checklist("Controls Library Review Checklist", [
        "Locate each in-scope control by exact CMMC ID",
        "Verify Implemented controls have at least one evidence item (Evidence count > 0)",
        "Filter by Not Started to identify all unassessed controls",
        "Filter by Not Applicable — verify each has a written justification in the control detail",
        "Note domains with less than 80% readiness for focused evidence review",
      ])}
    `, true),

    sec("9", "Control Package Review", `
      <p>Clicking a control ID opens the full <strong>Control Package</strong> — the complete assessment view for a single CMMC requirement. Each package contains multiple tabs presenting the self-assessment, implementation guidance, evidence, monitoring records, POA&amp;M items, and SSP narrative.</p>
      ${sub("9.1 — Implementation Tab", `
        <p>The <strong>Implementation tab</strong> is the primary assessment tab. It contains ${org}'s written statement of how they implement this CMMC control in their environment.</p>
        ${img(s("ctrl_impl"), `Control Detail — Implementation Tab`, `Figure 9.1 — The Implementation tab for control ${ctx.bestControlId} showing the self-assessed status and ${org}'s implementation narrative.`)}
        <div class="sub2-title">Implementation Tab Fields</div>
        <table>
          <thead><tr><th>Field</th><th>Description</th><th>Assessor Significance</th></tr></thead>
          <tbody>
            <tr><td><strong>Control Description</strong></td><td>Official CMMC requirement text</td><td>The standard against which the narrative is evaluated</td></tr>
            <tr><td><strong>Assessment Status</strong></td><td>Implemented / In Progress / Not Started / Not Applicable</td><td>Core finding indicator</td></tr>
            <tr><td><strong>Implementation Narrative</strong></td><td>${org}'s written statement of how the control is addressed</td><td>Primary narrative evidence — evaluate specificity, accuracy, and alignment with evidence</td></tr>
            <tr><td><strong>Last Assessed</strong></td><td>Date the status was last updated</td><td>Very old dates may indicate stale self-assessment</td></tr>
          </tbody>
        </table>
        ${infoBox("tip", "💡 Narrative Quality", `A complete narrative should describe the specific <strong>systems</strong> used, the <strong>process owners</strong> responsible, the <strong>frequency</strong> of recurring activities, and the <strong>evidence sources</strong> that demonstrate implementation. A generic or one-sentence narrative is a finding.`)}
        ${checklist("Implementation Tab Checklist", [
          "Narrative is present (not blank)",
          `Narrative is specific to ${org} — names systems and process owners`,
          "Narrative references actual tools, platforms, or documented procedures",
          "Implementation status matches narrative content (Implemented = detailed narrative; Not Started = blank is expected)",
          "Save/Edit buttons are not visible (confirming read-only mode is enforced)",
          "Narrative aligns with the linked evidence in the Evidence tab",
        ])}
      `)}
      ${sub("9.2 — Configure Tab", `
        <p>The <strong>Configure tab</strong> provides step-by-step implementation guidance — the intended configuration approach, expected evidence artifacts, and validation steps. It documents how the control was expected to be configured.</p>
        ${img(s("ctrl_configure"), "Control Detail — Configure Tab", `Figure 9.2 — The Configure tab showing implementation approach, required configuration steps, and expected evidence artifacts for ${ctx.bestControlId}.`)}
        <ul>
          <li><strong>Implementation Approach</strong> — systems or platforms used to implement the control</li>
          <li><strong>Configuration Steps</strong> — ordered instructions for setting up the control</li>
          <li><strong>Evidence to Capture</strong> — what artifacts should exist as evidence of completion</li>
          <li><strong>Required Documents</strong> — policies or procedures that must be in place</li>
          <li><strong>Validation Steps</strong> — how to verify the control is working as intended</li>
        </ul>
        ${infoBox("info", `ℹ Assessor Use of Configure Tab`, `Use the Configure tab to understand what ${org} intended to implement. Cross-reference with the Evidence tab — expected artifacts listed here should exist as evidence items. Steps listed without corresponding evidence are gaps to investigate.`)}
        ${infoBox("warn", "⚠ Read-Only", "Assessors cannot check off, edit, or modify configuration steps. All Configure tab content is view-only.")}
      `)}
      ${sub("9.3 — Evidence Tab", `
        <p>The <strong>Evidence tab</strong> lists all evidence artifacts linked to this specific control — the artifacts ${org} is presenting to support their implementation claim.</p>
        ${img(s("ctrl_evidence"), "Control Detail — Evidence Tab", `Figure 9.3 — The Evidence tab listing all linked evidence for ${ctx.bestControlId} with status, type, collection date, and preview/download options.`)}
        <div class="sub2-title">Evidence Tab Columns</div>
        <table>
          <thead><tr><th>Column</th><th>Description</th></tr></thead>
          <tbody>
            <tr><td><strong>Title</strong></td><td>Descriptive name — click to open the Evidence Detail page</td></tr>
            <tr><td><strong>Type</strong></td><td>Policy, Procedure, Screenshot, Log, Certificate, Report, Access Review, Scan Report, etc.</td></tr>
            <tr><td><strong>Status</strong></td><td>Lifecycle state — focus on Approved, Active, and Assessor Ready for assessment</td></tr>
            <tr><td><strong>Collected Date</strong></td><td>When the evidence was gathered or generated</td></tr>
            <tr><td><strong>Owner</strong></td><td>${org} team member responsible for this artifact</td></tr>
          </tbody>
        </table>
        <div class="sub2-title">Evidence Review Workflow</div>
        ${steps([
          "Click the control ID in the Controls Library to open the Control Package.",
          "Select the <strong>Evidence tab</strong> below the control header.",
          "Review all listed evidence records — title, type, status, and collection date.",
          "Focus on items with status <strong>Approved</strong>, <strong>Active</strong>, or <strong>Assessor Ready</strong>.",
          "Click any evidence title to open the Evidence Detail page with full metadata and file preview.",
          "Use the preview panel or <strong>Download</strong> button to review the actual artifact.",
          "Confirm the evidence content directly supports the implementation narrative in the Implementation tab.",
        ])}
        ${img(s("evidence_detail"), "Evidence Detail Page", `Figure 9.4 — Evidence detail page showing metadata, assessor summary, file preview panel, linked controls, and collection/expiration dates.`)}
        ${checklist("Evidence Tab Checklist", [
          "At least one evidence item exists for this control",
          "Primary evidence has status: Approved, Active, or Assessor Ready",
          "Collection date is within the expected review period (not stale)",
          "Evidence type is appropriate for the control requirement",
          "Evidence title is descriptive — not generic (e.g., 'Screenshot1')",
          "File can be previewed or downloaded without error",
          "Evidence content directly supports the implementation narrative",
          "Evidence owner is identified",
        ])}
      `)}
      ${sub("9.4 — Monitoring Tab", `
        <p>The <strong>Monitoring tab</strong> shows recurring operational activities linked to this specific control. Controls requiring ongoing review (vulnerability scanning, access reviews) will have associated monitoring items here.</p>
        ${img(s("ctrl_monitoring"), "Control Detail — Monitoring Tab", `Figure 9.5 — Monitoring tab showing recurring operational activities linked to ${ctx.bestControlId} with frequency and status.`)}
        <table>
          <thead><tr><th>Column</th><th>Description</th></tr></thead>
          <tbody>
            <tr><td><strong>Task</strong></td><td>Name of the recurring monitoring activity</td></tr>
            <tr><td><strong>Frequency</strong></td><td>Required review cadence: Daily, Weekly, Monthly, Quarterly, or Annually</td></tr>
            <tr><td><strong>Last Completed</strong></td><td>Date the activity was most recently completed</td></tr>
            <tr><td><strong>Next Due</strong></td><td>When the activity is next scheduled</td></tr>
            <tr><td><strong>Status</strong></td><td>Current / Open / In Progress / Overdue</td></tr>
          </tbody>
        </table>
        ${infoBox("warn", "⚠ Overdue Status", `An <strong>Overdue</strong> monitoring item indicates a recurring operational activity has not been completed on schedule. This represents a CMMC sustainment gap — document it as a potential finding.`)}
        ${checklist("Monitoring Tab Checklist", [
          "Relevant monitoring activities exist for controls requiring recurring review",
          "Status is Current for all required monitoring activities",
          "Last Completed date is within the expected frequency window",
          "Overdue items are documented and noted as potential gaps",
        ])}
      `)}
      ${sub("9.5 — POA&amp;M Tab", `
        <p>The <strong>POA&amp;M tab</strong> shows remediation items linked to this specific control. A Plan of Action and Milestones (POA&amp;M) formally acknowledges a gap and commits to a remediation timeline.</p>
        ${img(s("ctrl_poam"), "Control Detail — POA&M Tab", `Figure 9.6 — POA&M tab showing open remediation items linked to ${ctx.bestControlId}.`)}
        <table>
          <thead><tr><th>Field</th><th>Description</th></tr></thead>
          <tbody>
            <tr><td><strong>POA&amp;M Number</strong></td><td>Unique identifier (e.g., POAM-2026-001)</td></tr>
            <tr><td><strong>Weakness / Gap</strong></td><td>Description of the identified deficiency</td></tr>
            <tr><td><strong>Risk Level</strong></td><td><span class="badge b-red">High</span> <span class="badge b-yellow">Medium</span> <span class="badge b-gray">Low</span></td></tr>
            <tr><td><strong>Status</strong></td><td>Open / In Progress / Closed</td></tr>
            <tr><td><strong>Owner</strong></td><td>Responsible party for remediation</td></tr>
            <tr><td><strong>Target Date</strong></td><td>Planned completion date</td></tr>
          </tbody>
        </table>
        ${checklist("POA&M Tab Checklist", [
          "All open POA&M items for this control are visible",
          "Risk level is defined for each item",
          "Owner is assigned for each item",
          "Target date is present and not in the past without closure",
          "High-risk items with overdue target dates are documented as findings",
          "Closed POA&Ms — verify the closure is legitimate (look for closure evidence)",
        ])}
      `)}
      ${sub("9.6 — SSP Tab", `
        <p>The <strong>SSP tab</strong> contains the System Security Plan narrative for this control — the formal, SSP-format description of how ${org} implements the requirement within their documented system boundary.</p>
        ${img(s("ctrl_ssp"), "Control Detail — SSP Tab", `Figure 9.7 — SSP tab showing the formal System Security Plan narrative for ${ctx.bestControlId}.`)}
        <ul>
          <li><strong>SSP Narrative</strong> — The formal SSP-format implementation statement for external use</li>
          <li><strong>Control Status</strong> — Should align with the Implementation tab status</li>
        </ul>
        ${infoBox("info", "ℹ SSP vs. Implementation Narrative", "The SSP tab and Implementation tab may contain similar content. The SSP represents the formally documented SSP narrative; the Implementation tab is the working assessment record. Compare both — inconsistencies may indicate the SSP has not been kept current.")}
        ${checklist("SSP Tab Checklist", [
          "SSP narrative is present (not blank)",
          `Narrative is specific to ${org}'s systems and processes`,
          "Narrative is not generic or copy-paste template text",
          "Narrative aligns with the Implementation tab narrative",
          "Narrative references actual systems, tools, or documented procedures",
          "SSP control status matches the Implementation tab status",
        ])}
      `)}
    `, true),

    sec("10", `Example: Reviewing ${ctx.bestControlId} — Step-by-Step Walkthrough`, `
      <p>This section walks through a complete 10-step control review for <strong>${ctx.bestControlId}</strong>. Use this as a template for your full assessment of all in-scope controls.</p>
      ${steps([
        `<strong>Navigate to Controls</strong> — click <strong>Controls</strong> in the left sidebar. The Controls Library loads.`,
        `<strong>Search for ${ctx.bestControlId}</strong> — type <strong>${ctx.bestControlId}</strong> in the search box. Confirm the status and evidence count before opening.`,
        `<strong>Open the control</strong> — click the <strong>${ctx.bestControlId}</strong> link. The Control Package opens with the Implementation tab active.`,
        `<strong>Read the implementation narrative</strong> — in the Implementation tab, read ${org}'s narrative. Verify it describes specific systems, process owners, and frequencies. Note any generic or missing content.`,
        `<strong>Review the Configure tab</strong> — click Configure. Review the implementation approach and expected evidence artifacts. Note any steps with no corresponding evidence.`,
        `<strong>Review the Evidence tab</strong> — click Evidence. Review all linked records. Focus on Approved, Active, or Assessor-Ready items. Note missing or stale evidence.`,
        `<strong>Open and review an evidence item</strong> — click an evidence title. Review the metadata (type, status, collection date, owner, assessor summary). Use the preview panel or Download to review the artifact itself.`,
        `<strong>Review the SSP tab</strong> — return to the control and click SSP. Compare the SSP narrative to the implementation narrative. Note any discrepancies.`,
        `<strong>Check Monitoring and POA&amp;M</strong> — click the Monitoring tab. Verify monitoring activities are Current. Click the POA&amp;M tab. Review any open remediation items.`,
        `<strong>Document your observations</strong> — record findings in your external assessment tool or worksheet. Contact the ${org} administrator if additional information is needed.`,
      ])}
      ${infoBox("info", "📌 Repeat for Each In-Scope Control", "Use this 10-step process for each control in your assessment scope. Use the Controls Library search and domain filter to work through each CMMC domain systematically.")}
    `),

    sec("11", "Evidence Repository", `
      <p>Navigate to <strong>Evidence</strong> in the sidebar for the global evidence repository — a searchable list of all evidence for ${org}.</p>
      ${img(s("evidence"), "Evidence Repository", `Figure 11.1 — The Evidence Repository showing all ${org} evidence with search, filter, type, status, and linked control information.`)}
      <div class="sub2-title">Filter Options</div>
      <ul>
        <li><strong>Search</strong> — find by title, control ID, tag, or summary keyword</li>
        <li><strong>Status filter</strong> — Approved, Active, Assessor Ready, or all statuses</li>
        <li><strong>Type filter</strong> — Policy, Screenshot, Report, Log, Certificate, etc.</li>
        <li><strong>Domain filter</strong> — Show evidence linked to a specific CMMC domain</li>
        <li><strong>Owner filter</strong> — Filter by evidence owner</li>
      </ul>
      ${checklist("Evidence Repository Checklist", [
        "Evidence records exist (repository is not empty)",
        "Majority of evidence has status: Approved, Active, or Assessor Ready",
        "Evidence types are appropriate for CMMC requirements",
        "Collection dates are recent (check for stale evidence older than 12 months without re-review)",
        "Evidence items are linked to specific controls (not floating unlinked records)",
      ])}
    `),

    sec("12", "Documentation", `
      <p>Navigate to <strong>Documents</strong> to access ${org}'s formal compliance document library — policies, procedures, logs, and records.</p>
      ${img(s("documents"), "Documentation Library", `Figure 12.1 — The All Documents page listing ${org}'s policies, procedures, logs, and records with linked controls and status.`)}
      <table>
        <thead><tr><th>Document Type</th><th>Description</th></tr></thead>
        <tbody>
          <tr><td><strong>Policy</strong></td><td>Formal organizational policies (e.g., Access Control Policy, Incident Response Policy)</td></tr>
          <tr><td><strong>Procedure</strong></td><td>Step-by-step operational procedures implementing the policies</td></tr>
          <tr><td><strong>Log</strong></td><td>Completed periodic compliance review log instances</td></tr>
          <tr><td><strong>Record</strong></td><td>Formal compliance records (training completion, risk assessments)</td></tr>
        </tbody>
      </table>
      ${checklist("Documentation Review Checklist", [
        "Required policies exist and are in Active status (Access Control, Incident Response, Configuration Management)",
        "Active documents have current effective dates — not expired",
        "Procedures exist for key operational processes required by CMMC",
        "Log instances exist demonstrating regular completion of required reviews",
        "All critical documents are linked to relevant CMMC controls",
      ])}
    `),

    sec("13", "Monitoring Tracker", `
      <p>Navigate to <strong>Monitoring</strong> in the sidebar to review ${org}'s 19 recurring operational monitoring activities required for CMMC Level 2 sustainment.</p>
      ${img(s("monitoring"), "Monitoring Tracker", `Figure 13.1 — The Monitoring Tracker showing all 19 recurring CMMC L2 activities for ${org} with frequency, status, last completed date, and next due date.`)}
      <table>
        <thead><tr><th>Column</th><th>Description</th></tr></thead>
        <tbody>
          <tr><td><strong>Activity</strong></td><td>Recurring monitoring task name</td></tr>
          <tr><td><strong>Control</strong></td><td>CMMC control this activity supports</td></tr>
          <tr><td><strong>Frequency</strong></td><td>Weekly / Monthly / Quarterly / Annually</td></tr>
          <tr><td><strong>Last Completed</strong></td><td>Date most recently completed</td></tr>
          <tr><td><strong>Next Due</strong></td><td>Scheduled next due date</td></tr>
          <tr><td><strong>Status</strong></td><td><span class="badge b-green">Current</span> = done on time &nbsp; <span class="badge b-yellow">Open</span> = pending &nbsp; <span class="badge b-red">Overdue</span> = past due date</td></tr>
        </tbody>
      </table>
      ${checklist("Monitoring Tracker Checklist", [
        "All activities show a Last Completed date consistent with their frequency",
        "No activities are in Overdue status (each Overdue item is a potential finding)",
        "High-frequency activities (weekly/monthly) are consistently Current",
        "Notes field provides context for completed activities where applicable",
      ])}
    `),

    sec("14", "POA&amp;M Register", `
      <p>Navigate to <strong>POA&amp;M</strong> in the sidebar to review all known compliance gaps and their formal remediation plans.</p>
      ${img(s("poams"), "POA&M Register", `Figure 14.1 — The POA&M register listing all open and in-progress remediation items for ${org} with risk level, owner, and target completion date.`)}
      <table>
        <thead><tr><th>Field</th><th>Description</th></tr></thead>
        <tbody>
          <tr><td><strong>POA&amp;M Number</strong></td><td>Unique identifier (e.g., POAM-2026-001)</td></tr>
          <tr><td><strong>Title / Weakness</strong></td><td>Brief description of the identified gap</td></tr>
          <tr><td><strong>Risk Level</strong></td><td><span class="badge b-red">High</span> <span class="badge b-yellow">Medium</span> <span class="badge b-gray">Low</span></td></tr>
          <tr><td><strong>Status</strong></td><td>Open / In Progress / Closed</td></tr>
          <tr><td><strong>Owner</strong></td><td>Person responsible for remediation</td></tr>
          <tr><td><strong>Target Date</strong></td><td>Planned completion date</td></tr>
          <tr><td><strong>Linked Control</strong></td><td>CMMC control the POA&amp;M addresses</td></tr>
        </tbody>
      </table>
      ${checklist("POA&M Review Checklist", [
        "All open POA&M items are visible",
        "Each item has a defined risk level (High/Medium/Low)",
        "Each item has an assigned owner",
        "Each item has a target completion date",
        "High-risk items with past-due target dates are documented as findings",
        "In-Progress items show evidence of active remediation (recent progress notes)",
        "Closed POA&Ms — verify closure is supported by evidence",
      ])}
    `),

    sec("15", "Assessor Controls Page", `
      <p>Navigate to <strong>Assessor</strong> in the sidebar for a dedicated assessment interface. This page provides a structured view of all controls optimized for C3PAO review.</p>
      ${img(s("assessor"), "Assessor Controls Page", `Figure 15.1 — The Assessor page providing a structured control list and assessment package view for external C3PAO reviewers.`)}
      ${infoBox("info", "ℹ Assessor Page Purpose", "The Assessor page provides a clean, assessment-focused view of the control inventory. Use it as an alternative to the full Controls Library when you want a streamlined assessment interface.")}
    `),

    sec("16", "Recommended Assessor Workflow", `
      <p>Follow this structured 10-step workflow to systematically review ${org}'s CMMC compliance posture:</p>
      ${steps([
        `<strong>Log in to Control HUB</strong> — use your assigned assessor credentials. Complete MFA if prompted. (Section 5)`,
        `<strong>Confirm ${org} is selected</strong> — verify the org name in the sidebar top-left. Switch if needed. (Section 6)`,
        `<strong>Review the Dashboard</strong> — note the overall readiness score, overdue monitoring items, and open POA&Ms. (Section 7)`,
        `<strong>Open the Controls Library</strong> — click Controls. Use domain and status filters to work through CMMC domains systematically. (Section 8)`,
        `<strong>For each in-scope control: open the Control Package</strong> — review Implementation → Configure → Evidence → Monitoring → POA&M → SSP tabs. (Section 9)`,
        `<strong>Open and review evidence</strong> — for each linked evidence item, review the detail page. Preview or download the file. Confirm it supports the narrative. (Sections 9.3 and 11)`,
        `<strong>Review the Evidence Repository</strong> — use the global Evidence list to get a full picture of evidence health. (Section 11)`,
        `<strong>Review the Monitoring Tracker</strong> — note any Overdue activities as potential sustainment gaps. (Section 13)`,
        `<strong>Review the POA&amp;M Register</strong> — note open items, high-risk items, and any past-due target dates. (Section 14)`,
        `<strong>Contact support if needed</strong> — for access issues, missing data, or additional information. (Section 18)`,
      ])}
    `),

    sec("17", "Troubleshooting", `
      <table>
        <thead><tr><th>Issue</th><th>Likely Cause</th><th>Resolution</th></tr></thead>
        <tbody>
          <tr><td><strong>Cannot log in</strong></td><td>Incorrect credentials or account not yet created</td><td>Verify email/password. Contact the ${org} administrator to confirm the account exists.</td></tr>
          <tr><td><strong>Cannot see ${org}</strong></td><td>Assessor account not added to the organization</td><td>Contact the ${org} compliance administrator to verify org membership.</td></tr>
          <tr><td><strong>Control shows "Not Found"</strong></td><td>Stale URL or incorrect control ID</td><td>Navigate to Controls → search by ID rather than using a direct URL.</td></tr>
          <tr><td><strong>Evidence preview not loading</strong></td><td>Unsupported format or large file</td><td>Click <strong>Download</strong> to save locally and open in the appropriate application.</td></tr>
          <tr><td><strong>Download blocked</strong></td><td>Browser pop-up blocker</td><td>Allow downloads from the Control HUB domain in your browser settings.</td></tr>
          <tr><td><strong>All controls show Not Started</strong></td><td>Different org selected or no assessments recorded</td><td>Confirm ${org} is selected in the Organization Switcher.</td></tr>
          <tr><td><strong>Evidence repository appears empty</strong></td><td>Active filter hiding items or wrong org selected</td><td>Clear all filters. Confirm ${org} is the active organization.</td></tr>
          <tr><td><strong>Session expired</strong></td><td>JWT token expires after 24 hours</td><td>Log in again using your assessor credentials.</td></tr>
          <tr><td><strong>Access too broad (seeing other orgs)</strong></td><td>Account may have admin role instead of assessor</td><td>Contact the ${org} administrator to verify the role is set to Assessor.</td></tr>
          <tr><td><strong>Configure tab empty</strong></td><td>Control has no implementation guidance defined</td><td>Check the Implementation tab for manual implementation notes.</td></tr>
        </tbody>
      </table>
    `),

    sec("18", "Contact &amp; Support", `
      <table>
        <thead><tr><th>Contact Type</th><th>Details</th></tr></thead>
        <tbody>
          <tr><td><strong>General Support</strong></td><td>info@carmetechnology.com</td></tr>
          <tr><td><strong>Platform</strong></td><td>Control HUB by Carme Technology</td></tr>
          <tr><td><strong>Organization</strong></td><td>${org}</td></tr>
          <tr><td><strong>Guide Version</strong></td><td>${VERSION} — ${GENERATED_DATE}</td></tr>
        </tbody>
      </table>
      ${infoBox("tip", "✅ Assessment Ready", `This guide covers all major areas of the Control HUB assessor experience for ${org}. For any issue not covered here, or to request additional data or report formats, contact <strong>info@carmetechnology.com</strong>.`)}
    `),
  ].join("\n\n");

  return wrap(`Control HUB Assessor Guide — ${org}`, coverHtml, tocHtml, body);
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
    await page.goto(`file://${tmpHtml}`, { waitUntil: "networkidle", timeout: 60000 });
    await page.waitForTimeout(500);
    await page.pdf({
      path: outputPath,
      format: "Letter",
      printBackground: true,
      displayHeaderFooter: false,
    });
    await browser.close();
    return fs.statSync(outputPath).size;
  } finally {
    if (fs.existsSync(tmpHtml)) fs.unlinkSync(tmpHtml);
  }
}

// ─── Role definitions ─────────────────────────────────────────────────────────

// Optional filter: GUIDE_ONLY_ROLES=reviewer,assessor pnpm generate:role-guides
const ONLY_ROLES = process.env.GUIDE_ONLY_ROLES?.split(",").map((r) => r.trim()) ?? null;

interface RoleDef {
  key: string;
  label: string;
  user: typeof USERS.admin;
  org: typeof ORGS.internal;
  outFile: string;
  captureShots: (page: Page, ctx: OrgCtx) => Promise<Map<string, string>>;
  buildGuide: (shots: Map<string, string>, ctx: OrgCtx) => string;
}

const ROLES: RoleDef[] = [
  {
    key: "admin",
    label: "Global Administrator",
    user: USERS.admin,
    org: ORGS.internal,
    outFile: "Control_HUB_Admin_Guide.pdf",
    captureShots: captureAdminShots,
    buildGuide: buildAdminGuide,
  },
  {
    key: "compliance_manager",
    label: "Compliance Manager",
    user: USERS.compliance,
    org: ORGS.internal,
    outFile: "Control_HUB_Compliance_Manager_Guide.pdf",
    captureShots: captureComplianceShots,
    buildGuide: buildComplianceGuide,
  },
  {
    key: "reviewer",
    label: "Reviewer",
    user: USERS.reviewer,
    org: ORGS.internal,
    outFile: "Control_HUB_Reviewer_Guide.pdf",
    captureShots: captureReviewerShots,
    buildGuide: buildReviewerGuide,
  },
  {
    key: "assessor",
    label: "Assessor",
    user: USERS.assessor,
    org: ORGS.vtccorp,
    outFile: "Control_HUB_Assessor_Guide.pdf",
    captureShots: captureAssessorShots,
    buildGuide: buildAssessorGuide,
  },
];

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log("\n🔐 Control HUB — Role-Based User Guide Generator v2");
  console.log("═".repeat(52));
  console.log(`📁 Output:  ${OUTPUT_DIR}`);
  console.log(`🌐 App URL: ${APP_URL}`);
  console.log(`📅 Date:    ${GENERATED_DATE}`);
  console.log(`📚 Roles:   Global Administrator, Compliance Manager, Reviewer, Assessor`);
  console.log("═".repeat(52));

  // Seed Internal Company data (evidence + assessments + POA&Ms) — idempotent
  console.log("\n🗄  Seeding Internal Company compliance data...");
  await seedInternalCompanyData();

  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  const results: Array<{ role: string; file: string; size: number; ok: boolean }> = [];
  const rolesToRun = ONLY_ROLES ? ROLES.filter((r) => ONLY_ROLES.includes(r.key)) : ROLES;

  for (const roleDef of rolesToRun) {
    console.log(`\n${"═".repeat(52)}`);
    console.log(`📖  Generating guide: ${roleDef.label}`);
    console.log(`${"═".repeat(52)}`);

    // Load org context
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

    // Inject auth — waits for sidebar (.no-print) to confirm auth worked
    await injectAuth(page, token, roleDef.org.id, roleDef.user.role);

    let shots: Map<string, string>;
    try {
      shots = await roleDef.captureShots(page, ctx);
    } finally {
      await browser.close();
    }

    // Build HTML
    console.log(`\n📄 Building guide HTML...`);
    const html = roleDef.buildGuide(shots, ctx);

    // Generate PDF
    console.log(`🖨  Generating PDF...`);
    const outputPath = path.join(OUTPUT_DIR, roleDef.outFile);
    const size = await generatePdf(html, outputPath);
    const sizeMb = (size / 1024 / 1024).toFixed(2);

    console.log(`\n✅ ${roleDef.label} guide → ${roleDef.outFile} (${sizeMb} MB)`);
    results.push({ role: roleDef.label, file: roleDef.outFile, size, ok: true });
  }

  console.log(`\n${"═".repeat(52)}`);
  console.log(`📚  All Role Guides Complete`);
  console.log(`${"═".repeat(52)}`);
  const pad = Math.max(...results.map(r => r.role.length));
  for (const r of results) {
    const sizeMb = (r.size / 1024 / 1024).toFixed(2);
    const icon = r.ok ? "✅ " : "❌ ";
    console.log(`  ${icon} ${r.role.padEnd(pad)} → ${r.file} (${sizeMb} MB)`);
  }
  console.log(`\n📂 Files in: ${OUTPUT_DIR}`);
  console.log(`   Right-click any file in the Replit file tree → Download`);
}

main().catch((err) => {
  console.error("\n❌ Fatal error:", err);
  process.exit(1);
});
