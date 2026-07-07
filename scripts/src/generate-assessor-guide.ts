/**
 * Assessor User Guide Generator — v2
 *
 * Generates a PDF guide for the Control HUB Assessor Read-Only role.
 * Saves to /generated-guides/ — not exposed in the app UI.
 *
 * Usage:
 *   pnpm generate:assessor-guide                  (from workspace root)
 *   pnpm --filter @workspace/scripts run generate:assessor-guide
 *
 * Prerequisites: api-server and cmmc-app workflows must be running.
 */

import { chromium, type Page } from "playwright";
import jwt from "jsonwebtoken";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import os from "os";
import { execSync } from "child_process";
import pg from "pg";

// ─── Paths & constants ──────────────────────────────────────────────────────

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const WORKSPACE_ROOT = path.resolve(__dirname, "..", "..");
const OUTPUT_DIR = path.join(WORKSPACE_ROOT, "generated-guides");
const PDF_FILENAME = "VTCCORP.US_Control_HUB_Assessor_User_Guide.pdf";
const OUTPUT_PDF = path.join(OUTPUT_DIR, PDF_FILENAME);

const JWT_SECRET =
  process.env.SESSION_SECRET ?? "cmmc-dev-secret-change-in-prod";
const APP_URL = process.env.GUIDE_APP_URL ?? "http://localhost:80";
const DATABASE_URL = process.env.DATABASE_URL ?? "";

const VTCCORP_ORG_NAME = "VTCCORP.US";
const GENERATED_DATE = new Date().toLocaleDateString("en-US", {
  year: "numeric",
  month: "long",
  day: "numeric",
});
const VERSION = "2.0";

// Known user IDs (static — these are seeded in dev and don't change)
const ASSESSOR_USER = {
  id: "3a9a00f3-cc74-4e24-8aef-378c21948520",
  name: "Assessor",
  email: "assessor@example.com",
  role: "assessor",
};

// Known control UUIDs (stable — seeded from cmmc-controls.json, UUIDs don't change)
const CONTROLS = {
  "AC.L1-3.1.1": "1d7500de-45f5-4004-b2b3-33deb3472032",
  "AC.L1-3.1.2": "02892d24-ee0f-45d8-911a-f9ff9248ce93",
  "IA.L2-3.5.3": "eed39b06-3952-4702-bbcc-de5f70302110",
  "SI.L1-3.14.1": "4732e6a7-5834-47ae-9e46-ff230a003f5f",
  "CM.L2-3.4.1": "b1b63bb2-1c51-476a-b656-36d64b0cda23",
};

// ─── Database setup ─────────────────────────────────────────────────────────

interface OrgContext {
  orgId: string;
  bestControlId: string; // e.g. "AC.L1-3.1.1"
  bestControlUUID: string; // e.g. "1d7500de-..."
  evidenceItemId: string;
}

async function setupVtcCorpOrg(): Promise<OrgContext> {
  if (!DATABASE_URL) throw new Error("DATABASE_URL not set");
  const pool = new pg.Pool({ connectionString: DATABASE_URL });

  try {
    console.log("\n🗄  Setting up VTCCORP.US organization in database...");

    // 1. Create org — no unique constraint on name, use SELECT + conditional INSERT
    let orgId: string;
    const existingOrg = await pool.query<{ id: string }>(
      `SELECT id FROM organizations WHERE name=$1 LIMIT 1`,
      [VTCCORP_ORG_NAME]
    );
    if (existingOrg.rows.length > 0) {
      orgId = existingOrg.rows[0].id;
    } else {
      const ins = await pool.query<{ id: string }>(
        `INSERT INTO organizations
           (id, name, cmmc_target_level, is_active, created_at, updated_at)
         VALUES (gen_random_uuid(), $1, 'L2', true, now(), now())
         RETURNING id`,
        [VTCCORP_ORG_NAME]
      );
      orgId = ins.rows[0].id;
    }
    console.log(`   ✓ Org: ${VTCCORP_ORG_NAME} (${orgId})`);

    // 2. Add assessor user to org — no unique constraint on (user_id, org_id), check first
    const existingMember = await pool.query(
      `SELECT id FROM organization_users WHERE user_id=$1 AND organization_id=$2 LIMIT 1`,
      [ASSESSOR_USER.id, orgId]
    );
    if (existingMember.rows.length === 0) {
      await pool.query(
        `INSERT INTO organization_users (id, user_id, organization_id, role, status, joined_at)
         VALUES (gen_random_uuid(), $1, $2, 'assessor', 'active', now())`,
        [ASSESSOR_USER.id, orgId]
      );
    }
    console.log(`   ✓ Assessor user added to ${VTCCORP_ORG_NAME}`);

    // 3. Seed control assessments — check before inserting (no unique constraint)
    const assessments: Array<{ controlId: string; controlUUID: string; narrative: string }> = [
      {
        controlId: "AC.L1-3.1.1",
        controlUUID: CONTROLS["AC.L1-3.1.1"],
        narrative:
          "VTCCORP.US manages authorized access through Microsoft Azure Active Directory (AAD). " +
          "All user accounts require multi-factor authentication (MFA) enforced via Conditional Access Policies. " +
          "Access is provisioned through the ITSM ticketing system using a formal access request and approval workflow. " +
          "Privileged accounts are managed separately with just-in-time (JIT) access via Azure PIM. " +
          "Quarterly access reviews are conducted by the IT Security team to verify continued appropriateness of access.",
      },
      {
        controlId: "AC.L1-3.1.2",
        controlUUID: CONTROLS["AC.L1-3.1.2"],
        narrative:
          "VTCCORP.US enforces role-based access control (RBAC) across all information systems. " +
          "Users are granted access based on least privilege principles aligned to their job function. " +
          "System administrators maintain a role matrix documented in the Access Control Policy. " +
          "Separation of duties is enforced for critical functions (e.g., financial approvals, code deployment). " +
          "Access roles are reviewed semi-annually and after any personnel change.",
      },
      {
        controlId: "IA.L2-3.5.3",
        controlUUID: CONTROLS["IA.L2-3.5.3"],
        narrative:
          "VTCCORP.US requires multi-factor authentication for all users accessing CUI systems. " +
          "MFA is enforced through Azure AD Conditional Access Policies requiring authenticator app (TOTP) " +
          "or hardware FIDO2 security keys for privileged access. " +
          "Single-factor authentication is prohibited for all CUI-touching systems as of Q1 2026. " +
          "MFA compliance is monitored via Azure AD sign-in logs reviewed weekly.",
      },
      {
        controlId: "SI.L1-3.14.1",
        controlUUID: CONTROLS["SI.L1-3.14.1"],
        narrative:
          "VTCCORP.US deploys Microsoft Defender for Endpoint on all managed workstations and servers. " +
          "Anti-malware signatures are updated automatically via Microsoft Defender cloud protection. " +
          "Endpoint scans are performed daily with results collected in Microsoft Sentinel SIEM. " +
          "Detected threats are triaged by the IT Security team within 24 hours per the Incident Response Plan.",
      },
      {
        controlId: "CM.L2-3.4.1",
        controlUUID: CONTROLS["CM.L2-3.4.1"],
        narrative:
          "VTCCORP.US maintains a configuration baseline for all IT assets using Microsoft Endpoint Manager (Intune). " +
          "Configuration baselines align with CIS Benchmarks Level 1 for Windows 11 and Windows Server 2022. " +
          "Baseline compliance is monitored continuously via Intune compliance policies. " +
          "Deviations from baseline trigger automated remediation or IT Security review within 48 hours.",
      },
    ];

    for (const a of assessments) {
      const existingAssmt = await pool.query(
        `SELECT id FROM control_assessments WHERE control_id=$1 AND organization_id=$2 LIMIT 1`,
        [a.controlUUID, orgId]
      );
      if (existingAssmt.rows.length === 0) {
        await pool.query(
          `INSERT INTO control_assessments
             (id, control_id, organization_id, status, implementation_narrative,
              last_assessed_at, assessed_by_id, created_at, updated_at)
           VALUES (gen_random_uuid(), $1, $2, 'implemented', $3, now(), $4, now(), now())`,
          [a.controlUUID, orgId, a.narrative, ASSESSOR_USER.id]
        );
      } else {
        await pool.query(
          `UPDATE control_assessments SET status='implemented', implementation_narrative=$3
           WHERE control_id=$1 AND organization_id=$2`,
          [a.controlUUID, orgId, a.narrative]
        );
      }
    }
    console.log(`   ✓ ${assessments.length} control assessments seeded (Implemented)`);

    // 4. Seed evidence items (use only valid evidence_type enum values)
    const evidenceSeeds = [
      {
        title: "Access Control Policy — v2.1",
        type: "policy",
        status: "approved",
        description:
          "Formal Access Control Policy establishing requirements for user account management, " +
          "role-based access, and privileged account controls at VTCCORP.US.",
        summary:
          "Policy document covering authorized access, least privilege, and periodic review requirements.",
        tags: ["access-control", "policy", "CMMC-L1"],
        controlUUID: CONTROLS["AC.L1-3.1.1"],
        collectedAt: new Date("2026-01-15"),
        expiresAt: new Date("2027-01-15"),
      },
      {
        title: "MFA Enforcement Screenshot — Azure Conditional Access",
        type: "screenshot",
        status: "approved",
        description:
          "Screenshots of Azure AD Conditional Access policies requiring MFA for all CUI-touching applications.",
        summary:
          "Visual evidence of MFA configuration in Azure Active Directory applied to all users.",
        tags: ["MFA", "Azure-AD", "identity", "CMMC-L2"],
        controlUUID: CONTROLS["IA.L2-3.5.3"],
        collectedAt: new Date("2026-02-10"),
        expiresAt: new Date("2027-02-10"),
      },
      {
        title: "Endpoint Protection — Defender for Endpoint Configuration Report",
        type: "report",
        status: "approved",
        description:
          "Microsoft Defender for Endpoint quarterly configuration and compliance report " +
          "confirming anti-malware deployment across all managed endpoints.",
        summary:
          "Quarterly report showing 100% endpoint coverage with Defender for Endpoint. Signature age <4 hours.",
        tags: ["endpoint-protection", "anti-malware", "defender", "CMMC-L1"],
        controlUUID: CONTROLS["SI.L1-3.14.1"],
        collectedAt: new Date("2026-03-01"),
        expiresAt: new Date("2026-09-01"),
      },
      {
        title: "Role-Based Access Control Matrix — Q1 2026",
        type: "access_review",
        status: "approved",
        description:
          "RBAC matrix mapping all job roles to system permissions across VTCCORP.US information systems.",
        summary:
          "Access matrix verified by CISO. Documents least privilege assignments for 42 roles across 8 systems.",
        tags: ["RBAC", "access-matrix", "least-privilege"],
        controlUUID: CONTROLS["AC.L1-3.1.2"],
        collectedAt: new Date("2026-01-30"),
        expiresAt: new Date("2027-01-30"),
      },
      {
        title: "Intune Configuration Baseline Compliance Report — Q1 2026",
        type: "scan_report",
        status: "assessor_ready",
        description:
          "Microsoft Intune compliance report showing configuration baseline enforcement " +
          "across all managed Windows endpoints per CIS Benchmark Level 1.",
        summary:
          "98.3% compliance rate. 4 devices remediated automatically. Reviewed by IT Security.",
        tags: ["configuration-management", "Intune", "baseline", "CIS-benchmark"],
        controlUUID: CONTROLS["CM.L2-3.4.1"],
        collectedAt: new Date("2026-03-15"),
        expiresAt: new Date("2026-09-15"),
      },
    ];

    let firstEvidenceId = "";
    for (const e of evidenceSeeds) {
      const existingEv = await pool.query<{ id: string }>(
        `SELECT id FROM evidence_items WHERE organization_id=$1 AND title=$2 LIMIT 1`,
        [orgId, e.title]
      );
      let evidenceId: string;
      if (existingEv.rows.length > 0) {
        evidenceId = existingEv.rows[0].id;
      } else {
        const ins = await pool.query<{ id: string }>(
          `INSERT INTO evidence_items
             (id, title, description, evidence_type, status, version, tags, owner_id,
              collected_at, expires_at, assessor_summary, is_current_version,
              organization_id, created_at, updated_at)
           VALUES (gen_random_uuid(), $1, $2, $3::evidence_type, $4::evidence_status,
                   '1.0', $5, $6, $7, $8, $9, true, $10, now(), now())
           RETURNING id`,
          [
            e.title,
            e.description,
            e.type,
            e.status,
            e.tags,
            ASSESSOR_USER.id,
            e.collectedAt,
            e.expiresAt,
            e.summary,
            orgId,
          ]
        );
        evidenceId = ins.rows[0].id;

        // Link evidence to control (check first — no unique constraint known)
        const existingLink = await pool.query(
          `SELECT 1 FROM evidence_control_links WHERE evidence_id=$1 AND control_id=$2 LIMIT 1`,
          [evidenceId, e.controlUUID]
        );
        if (existingLink.rows.length === 0) {
          await pool.query(
            `INSERT INTO evidence_control_links (id, evidence_id, control_id, linked_at, linked_by_id)
             VALUES (gen_random_uuid(), $1, $2, now(), $3)`,
            [evidenceId, e.controlUUID, ASSESSOR_USER.id]
          );
        }
      }
      if (!firstEvidenceId) firstEvidenceId = evidenceId;
    }
    console.log(`   ✓ ${evidenceSeeds.length} evidence items seeded`);

    // 5. Seed monitoring items (only if none exist for this org)
    const monCount = await pool.query<{ count: string }>(
      `SELECT COUNT(*) as count FROM monitoring_items WHERE organization_id=$1`,
      [orgId]
    );
    if (parseInt(monCount.rows[0].count) === 0) {
      const monItems = [
        { task: "User Access Review", controlRef: "AC.L1-3.1.1", freq: "quarterly", status: "current", desc: "Review all user accounts and access privileges to verify continued appropriateness." },
        { task: "Multi-Factor Authentication Audit", controlRef: "IA.L2-3.5.3", freq: "monthly", status: "current", desc: "Verify MFA is enforced for all users with access to CUI systems." },
        { task: "Vulnerability Scanning — Internal", controlRef: "RA.L2-3.11.2", freq: "monthly", status: "current", desc: "Run authenticated vulnerability scans against all internal systems." },
        { task: "Vulnerability Scanning — External", controlRef: "RA.L2-3.11.2", freq: "monthly", status: "open", desc: "Run external vulnerability scans against public-facing assets." },
        { task: "Endpoint Protection Status Review", controlRef: "SI.L1-3.14.1", freq: "weekly", status: "current", desc: "Review Defender for Endpoint dashboard for unprotected or non-compliant endpoints." },
        { task: "Log Review — Security Events", controlRef: "AU.L2-3.3.1", freq: "weekly", status: "open", desc: "Review SIEM alerts and security event logs in Microsoft Sentinel." },
        { task: "Configuration Baseline Compliance Check", controlRef: "CM.L2-3.4.1", freq: "monthly", status: "current", desc: "Review Intune compliance report for devices deviating from configuration baseline." },
        { task: "Backup Verification", controlRef: "CP.L2-3.8.9", freq: "monthly", status: "open", desc: "Verify backup integrity and recovery capability for critical systems." },
        { task: "Security Awareness Training Completion", controlRef: "AT.L2-3.2.1", freq: "annually", status: "current", desc: "Confirm all personnel have completed annual security awareness training." },
        { task: "Incident Response Plan Review", controlRef: "IR.L2-3.6.1", freq: "annually", status: "current", desc: "Review and update Incident Response Plan to reflect current environment." },
        { task: "Physical Access Log Review", controlRef: "PE.L1-3.10.1", freq: "monthly", status: "open", desc: "Review physical access logs for server room and sensitive areas." },
        { task: "Password Policy Enforcement Check", controlRef: "IA.L2-3.5.1", freq: "quarterly", status: "current", desc: "Verify password policies are enforced in Active Directory and all applications." },
        { task: "Third-Party Risk Assessment Update", controlRef: "SR.L2-3.17.1", freq: "annually", status: "open", desc: "Update third-party supplier risk assessments for CUI-touching vendors." },
        { task: "Penetration Testing", controlRef: "CA.L2-3.12.1", freq: "annually", status: "current", desc: "Conduct annual penetration test against CUI systems and network perimeter." },
        { task: "System Security Plan (SSP) Review", controlRef: "CA.L2-3.12.4", freq: "annually", status: "current", desc: "Review and update the System Security Plan to reflect current system state." },
        { task: "Media Sanitization Log Review", controlRef: "MP.L2-3.8.3", freq: "quarterly", status: "open", desc: "Review media sanitization and destruction records for retired equipment." },
        { task: "Remote Access Session Review", controlRef: "AC.L2-3.1.14", freq: "monthly", status: "current", desc: "Review VPN and remote access session logs for anomalies." },
        { task: "Security Control Assessment", controlRef: "CA.L2-3.12.1", freq: "annually", status: "current", desc: "Conduct periodic security control effectiveness assessment across all CMMC domains." },
        { task: "POA&M Status Review", controlRef: "CA.L2-3.12.2", freq: "monthly", status: "open", desc: "Review and update Plan of Action and Milestones for all open deficiencies." },
      ];
      for (let i = 0; i < monItems.length; i++) {
        const m = monItems[i];
        const lastCompleted = m.status === "current"
          ? new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
          : null;
        const nextDue = new Date(Date.now() + (m.freq === "weekly" ? 7 : m.freq === "monthly" ? 30 : 90) * 24 * 60 * 60 * 1000);
        await pool.query(
          `INSERT INTO monitoring_items
             (id, organization_id, frequency, task, control_ref, description,
              status, last_completed, next_due, sort_order, created_at, updated_at)
           VALUES (gen_random_uuid(), $1, $2::monitoring_frequency, $3, $4, $5,
                   $6::monitoring_status, $7, $8, $9, now(), now())`,
          [orgId, m.freq, m.task, m.controlRef, m.desc, m.status, lastCompleted, nextDue, i]
        );
      }
      console.log(`   ✓ 19 monitoring items seeded`);
    }

    // 6. Seed POA&M items — compute dates in JS to avoid SQL interval syntax issues
    const poamCount = await pool.query<{ count: string }>(
      `SELECT COUNT(*) as count FROM poams WHERE organization_id=$1`,
      [orgId]
    );
    if (parseInt(poamCount.rows[0].count) === 0) {
      const due90 = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000);
      const due30 = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
      await pool.query(
        `INSERT INTO poams
           (id, organization_id, poam_number, title, deficiency_description,
            status, risk_level, linked_control_id, scheduled_completion_date,
            remediation_plan, owner_id, created_at, updated_at)
         VALUES
           (gen_random_uuid(), $1, 'POAM-2026-001',
            'Privileged Access Management — JIT Not Fully Deployed',
            'Just-In-Time privileged access via Azure PIM is not yet enforced for all on-premises ' ||
            'administrator accounts. Elevated privileges remain persistent for 3 server admin accounts.',
            'open', 'medium', $2, $3,
            'Phase 1: Enumerate all on-premises admin accounts. Phase 2: Extend Azure PIM to on-premises. ' ||
            'Phase 3: Convert persistent admins to JIT. Verify and close by Q3 2026.',
            $4, now(), now()),
           (gen_random_uuid(), $1, 'POAM-2026-002',
            'External Vulnerability Scan — Monthly Cadence Gap',
            'External vulnerability scans have not been performed on a monthly basis. ' ||
            'Last external scan was performed in November 2025.',
            'in_progress', 'low', NULL, $5,
            'Configure automated monthly external scan in Qualys. Assign scan schedule owner.',
            $4, now(), now())`,
        [orgId, CONTROLS["AC.L1-3.1.1"], due90, ASSESSOR_USER.id, due30]
      );
      console.log(`   ✓ 2 POA&M items seeded`);
    }

    // 7. Find best control (most evidence)
    const bestCtrl = await pool.query<{ ctrl_id: string; ctrl_uuid: string; ev_count: string }>(
      `SELECT c.control_id as ctrl_id, c.id as ctrl_uuid,
              COUNT(ecl.evidence_id) as ev_count
       FROM control_assessments ca
       JOIN controls c ON ca.control_id = c.id
       LEFT JOIN evidence_control_links ecl ON ecl.control_id = c.id
       LEFT JOIN evidence_items ei ON ecl.evidence_id = ei.id AND ei.organization_id = $1
       WHERE ca.organization_id = $1
         AND ca.status = 'implemented'
         AND ca.implementation_narrative IS NOT NULL
       GROUP BY c.control_id, c.id
       ORDER BY ev_count DESC, c.control_id
       LIMIT 1`,
      [orgId]
    );

    const bestControlId = bestCtrl.rows[0]?.ctrl_id ?? "AC.L1-3.1.1";
    const bestControlUUID = bestCtrl.rows[0]?.ctrl_uuid ?? CONTROLS["AC.L1-3.1.1"];
    console.log(`   ✓ Best control: ${bestControlId} (${parseInt(bestCtrl.rows[0]?.ev_count ?? "0")} evidence items)`);

    return { orgId, bestControlId, bestControlUUID, evidenceItemId: firstEvidenceId };
  } finally {
    await pool.end();
  }
}

// ─── Auth ───────────────────────────────────────────────────────────────────

function generateToken(): string {
  return jwt.sign(ASSESSOR_USER, JWT_SECRET, { expiresIn: "2h" });
}

// ─── Screenshot helpers ─────────────────────────────────────────────────────

async function injectAuth(page: Page, token: string, orgId: string): Promise<void> {
  await page.evaluate(
    ({ t, o }) => {
      localStorage.setItem("auth_token", t);
      localStorage.setItem("cmmc_active_org_id", o);
    },
    { t: token, o: orgId }
  );
}

async function navigateAndWait(page: Page, url: string, timeout = 14000): Promise<boolean> {
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
      console.warn(`  ⚠  Navigation failed: ${url}`);
      return false;
    }
  }
}

const REJECT_PATTERNS = [
  "Control not found",
  "No evidence found",
  "No documents found",
  "Internal Company",
  "CarmeTechnology Demo",
  "Demo Mode",
  "Access denied",
  "401 Unauthorized",
  "Page Not Found",
];

async function takeValidatedScreenshot(
  page: Page,
  label: string,
  { waitForText, rejectText = [], clip }: {
    waitForText?: string;
    rejectText?: string[];
    clip?: { x: number; y: number; width: number; height: number };
  } = {}
): Promise<string> {
  try {
    if (waitForText) {
      try {
        await page.waitForFunction(
          `() => document.body.innerText.includes(${JSON.stringify(waitForText)})`,
          { timeout: 8000 }
        );
      } catch {
        console.warn(`  ⚠  Timeout waiting for "${waitForText}" on ${label}`);
      }
    }

    const bodyText = await page.evaluate<string>("document.body?.innerText ?? ''");

    const rejectAll = [...REJECT_PATTERNS, ...rejectText];
    for (const pat of rejectAll) {
      if (bodyText.includes(pat)) {
        const idx = bodyText.indexOf(pat);
        const snippet = bodyText.slice(Math.max(0, idx - 60), idx + 80).replace(/\n/g, " ");
        console.warn(`  ⚠  Screenshot rejected (found "${pat}"): ${label} — context: "…${snippet}…"`);
        return "";
      }
    }

    const buffer = await page.screenshot({ fullPage: false, clip });
    return buffer.toString("base64");
  } catch (e) {
    console.warn(`  ⚠  Screenshot error on "${label}":`, (e as Error).message);
    return "";
  }
}

async function clickTab(page: Page, tabText: string): Promise<boolean> {
  try {
    const tab = page.locator(`[role="tab"]`).filter({ hasText: new RegExp(tabText, "i") }).first();
    if (await tab.isVisible({ timeout: 3000 })) {
      await tab.click();
      await page.waitForTimeout(1500);
      return true;
    }
  } catch {}
  return false;
}

// ─── Guide HTML ─────────────────────────────────────────────────────────────

function imgTag(b64: string, alt: string, caption: string): string {
  if (!b64) return `<div class="screenshot-placeholder"><span class="placeholder-text">[${caption}]</span></div>`;
  return `<figure class="screenshot-figure">
  <img src="data:image/png;base64,${b64}" alt="${alt}" class="screenshot"/>
  <figcaption>${caption}</figcaption>
</figure>`;
}

function checklist(title: string, items: string[]): string {
  return `<div class="checklist">
  <div class="checklist-title">✅ ${title}</div>
  <ul>${items.map((i) => `<li>${i}</li>`).join("\n")}</ul>
</div>`;
}

function buildGuideHtml(shots: Map<string, string>, ctx: OrgContext): string {
  const s = (key: string) => shots.get(key) ?? "";

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<title>Control HUB Assessor User Guide — ${VTCCORP_ORG_NAME}</title>
<style>
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  html { font-size: 10pt; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif;
         color: #1a1a2e; line-height: 1.65; background: #fff; }

  @page { size: Letter; margin: 0.65in 0.8in 0.75in 0.8in; }
  @page :first { margin: 0; }

  /* ── Cover ── */
  .cover {
    page-break-after: always;
    display: flex; flex-direction: column;
    min-height: 10.5in;
    background: linear-gradient(155deg, #0f172a 0%, #1e3a5f 55%, #0f3460 100%);
    color: #fff;
  }
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
  .cover-bottom { padding: 24px 60px; border-top: 1px solid rgba(255,255,255,0.1);
    display: flex; justify-content: space-between; align-items: center; }
  .cover-confidential { font-size: 9pt; color: #94a3b8; display: flex; align-items: center; gap: 7px; }
  .conf-dot { width: 6px; height: 6px; border-radius: 50%; background: #f59e0b; }

  /* ── TOC ── */
  .toc-page { page-break-after: always; padding: 0; }
  .toc-title { font-size: 22pt; font-weight: 700; color: #0f172a;
    border-bottom: 3px solid #1e40af; padding-bottom: 10px; margin-bottom: 24px; }
  .toc-entry { display: flex; justify-content: space-between;
    padding: 5px 0; border-bottom: 1px dotted #e2e8f0; font-size: 9.5pt; }
  .toc-entry.main { font-weight: 600; color: #1e3a5f; margin-top: 6px; }
  .toc-entry.sub { padding-left: 22px; color: #475569; font-size: 9pt; }
  .toc-pn { color: #64748b; font-size: 9pt; white-space: nowrap; }

  /* ── Content ── */
  .section { margin-bottom: 28px; }
  .section-header { background: #f8fafc; border-left: 5px solid #1e40af;
    padding: 11px 18px; margin-bottom: 16px; page-break-after: avoid; }
  .section-num { font-size: 8.5pt; color: #1e40af; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; }
  .section-title { font-size: 14pt; font-weight: 700; color: #0f172a; margin-top: 2px; }
  .subsection { margin: 20px 0 10px; }
  .subsection-title { font-size: 11pt; font-weight: 700; color: #1e3a5f;
    border-bottom: 1px solid #e2e8f0; padding-bottom: 5px; margin-bottom: 10px; }
  .sub2-title { font-size: 10.5pt; font-weight: 600; color: #334155; margin: 14px 0 6px; }

  p { margin-bottom: 10px; font-size: 10pt; color: #334155; }
  ul, ol { margin: 6px 0 12px 24px; }
  li { margin-bottom: 4px; font-size: 10pt; color: #334155; }
  strong { color: #0f172a; }

  /* ── Info boxes ── */
  .info-box { background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 7px; padding: 12px 16px; margin: 12px 0; }
  .info-box.warn { background: #fffbeb; border-color: #fde68a; }
  .info-box.tip { background: #f0fdf4; border-color: #86efac; }
  .info-box p { margin: 0; font-size: 9.5pt; }
  .ib-title { font-weight: 700; font-size: 9.5pt; color: #1e40af; margin-bottom: 4px; }
  .warn .ib-title { color: #92400e; }
  .tip .ib-title { color: #15803d; }

  /* ── Tables ── */
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

  /* ── Screenshots ── */
  .screenshot-figure { margin: 14px 0; page-break-inside: avoid;
    border: 1px solid #e2e8f0; border-radius: 7px; overflow: hidden; box-shadow: 0 1px 4px rgba(0,0,0,0.08); }
  .screenshot { width: 100%; height: auto; display: block; }
  figcaption { font-size: 8pt; color: #64748b; padding: 6px 12px;
    background: #f8fafc; border-top: 1px solid #e2e8f0; font-style: italic; }
  .screenshot-placeholder { background: #f1f5f9; border: 2px dashed #cbd5e1;
    border-radius: 7px; padding: 36px; text-align: center; margin: 14px 0; }
  .placeholder-text { color: #94a3b8; font-size: 9pt; }

  /* ── Step list ── */
  .step-list { list-style: none; margin: 10px 0; padding: 0; }
  .step-list li { display: flex; align-items: flex-start; gap: 11px; padding: 8px 0; border-bottom: 1px solid #f1f5f9; }
  .step-num { min-width: 26px; height: 26px; border-radius: 50%; background: #1e40af; color: #fff;
    font-weight: 700; font-size: 9.5pt; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
  .step-content { font-size: 10pt; color: #334155; }
  .step-title { font-weight: 600; color: #0f172a; display: block; margin-bottom: 2px; }

  /* ── Checklist ── */
  .checklist { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px;
    padding: 14px 18px; margin: 14px 0; page-break-inside: avoid; }
  .checklist-title { font-weight: 700; font-size: 10pt; color: #1e3a5f; margin-bottom: 8px; }
  .checklist ul { margin: 0; padding-left: 20px; }
  .checklist li { font-size: 9.5pt; color: #334155; margin-bottom: 4px; list-style: none; padding-left: 4px; }
  .checklist li::before { content: "☐ "; color: #1e40af; font-weight: 700; }

  /* ── Page break ── */
  .page-break { page-break-before: always; }
  hr { border: none; border-top: 1px solid #e2e8f0; margin: 22px 0; }
</style>
</head>
<body>

<!-- ═══ COVER ═══ -->
<div class="cover">
  <div class="cover-top">
    <div class="cover-logo">Control<span> HUB</span></div>
    <div class="cover-divider">|</div>
    <div class="cover-vendor">Carme Technology</div>
  </div>
  <div class="cover-body">
    <div class="cover-badge">Assessor Reference Guide</div>
    <div class="cover-title">Control HUB<br/>Assessor User Guide</div>
    <div class="cover-subtitle">CMMC Assessment Review Instructions</div>
    <div class="cover-org-box">
      <div class="cover-org-label">Organization</div>
      <div class="cover-org-name">${VTCCORP_ORG_NAME}</div>
      <div class="cover-org-role">CMMC Level 2 — Assessor Read-Only Role</div>
    </div>
    <div class="cover-meta">
      <div><div class="cover-meta-label">Version</div><div class="cover-meta-value">${VERSION}</div></div>
      <div><div class="cover-meta-label">Generated</div><div class="cover-meta-value">${GENERATED_DATE}</div></div>
      <div><div class="cover-meta-label">Prepared By</div><div class="cover-meta-value">Carme Technology</div></div>
    </div>
  </div>
  <div class="cover-bottom">
    <div class="cover-confidential"><span class="conf-dot"></span>Confidential — Authorized Assessor Use Only</div>
    <div style="font-size:9pt;color:#94a3b8;">info@carmetechnology.com</div>
  </div>
</div>

<!-- ═══ TOC ═══ -->
<div class="toc-page">
  <div class="toc-title">Table of Contents</div>
  <div class="toc-entry main"><span>1 — Purpose of This Guide</span><span class="toc-pn">3</span></div>
  <div class="toc-entry main"><span>2 — Assessor Access Overview</span><span class="toc-pn">3</span></div>
  <div class="toc-entry main"><span>3 — What the Assessor Can Do</span><span class="toc-pn">3</span></div>
  <div class="toc-entry main"><span>4 — What the Assessor Cannot Do</span><span class="toc-pn">4</span></div>
  <div class="toc-entry main"><span>5 — Logging In</span><span class="toc-pn">4</span></div>
  <div class="toc-entry main"><span>6 — Selecting ${VTCCORP_ORG_NAME}</span><span class="toc-pn">5</span></div>
  <div class="toc-entry main"><span>7 — Dashboard Overview</span><span class="toc-pn">5</span></div>
  <div class="toc-entry main"><span>8 — Controls Library</span><span class="toc-pn">6</span></div>
  <div class="toc-entry main"><span>9 — Control Package Review</span><span class="toc-pn">7</span></div>
  <div class="toc-entry sub"><span>9.1 Implementation Tab</span><span class="toc-pn">7</span></div>
  <div class="toc-entry sub"><span>9.2 Configure Tab</span><span class="toc-pn">8</span></div>
  <div class="toc-entry sub"><span>9.3 Evidence Tab</span><span class="toc-pn">9</span></div>
  <div class="toc-entry sub"><span>9.4 Monitoring Tab</span><span class="toc-pn">10</span></div>
  <div class="toc-entry sub"><span>9.5 Plan of Action and Milestones (POA&amp;M) Tab</span><span class="toc-pn">11</span></div>
  <div class="toc-entry sub"><span>9.6 SSP Tab</span><span class="toc-pn">11</span></div>
  <div class="toc-entry main"><span>10 — Example: Reviewing ${ctx.bestControlId}</span><span class="toc-pn">12</span></div>
  <div class="toc-entry main"><span>11 — Evidence Repository</span><span class="toc-pn">13</span></div>
  <div class="toc-entry sub"><span>11.1 Bulk Download Evidence Package</span><span class="toc-pn">13</span></div>
  <div class="toc-entry main"><span>12 — Documentation</span><span class="toc-pn">14</span></div>
  <div class="toc-entry sub"><span>12.1 Bulk Download Document Package</span><span class="toc-pn">14</span></div>
  <div class="toc-entry main"><span>13 — Monitoring Tracker</span><span class="toc-pn">14</span></div>
  <div class="toc-entry main"><span>14 — Plan of Action and Milestones Register</span><span class="toc-pn">14</span></div>
  <div class="toc-entry main"><span>15 — Reports</span><span class="toc-pn">15</span></div>
  <div class="toc-entry main"><span>16 — Recommended Assessor Workflow</span><span class="toc-pn">15</span></div>
  <div class="toc-entry main"><span>17 — Troubleshooting</span><span class="toc-pn">16</span></div>
  <div class="toc-entry main"><span>18 — Contact &amp; Support</span><span class="toc-pn">17</span></div>
</div>

<!-- ═══ SECTIONS ═══ -->

<!-- §1 -->
<div class="section">
  <div class="section-header"><div class="section-num">Section 1</div><div class="section-title">Purpose of This Guide</div></div>
  <p>This guide provides instructions for assessors reviewing <strong>${VTCCORP_ORG_NAME}</strong> within <strong>Control HUB</strong>, the CMMC Compliance Readiness &amp; Evidence Management Platform operated by Carme Technology.</p>
  <p>The Assessor role is <strong>read-only</strong>. It gives external reviewers access to controls, evidence, System Security Plan (SSP) narratives, monitoring records, Plan of Action and Milestones (POA&amp;M) items, and documentation — without the ability to modify any system records.</p>
  <div class="info-box"><div class="ib-title">📋 Scope</div><p>This guide covers navigation, screen-by-screen instructions, a step-by-step control review example, checklists for key review areas, troubleshooting, and support contact information for ${VTCCORP_ORG_NAME}.</p></div>
</div>

<!-- §2 -->
<div class="section">
  <div class="section-header"><div class="section-num">Section 2</div><div class="section-title">Assessor Access Overview</div></div>
  <p>The <strong>Assessor</strong> role provides read-only access to ${VTCCORP_ORG_NAME}'s compliance data. It is designed for external CMMC assessors performing Third-Party Assessment Organization (C3PAO) reviews.</p>
  <table>
    <thead><tr><th>Access Type</th><th>Description</th></tr></thead>
    <tbody>
      <tr><td><strong>Read-Only</strong></td><td>All data is read-only. No edits, uploads, or status changes are permitted.</td></tr>
      <tr><td><strong>Evidence Access</strong></td><td>Approved, Active, and Assessor-Ready evidence is fully visible and downloadable.</td></tr>
      <tr><td><strong>Org Scoped</strong></td><td>Only data belonging to ${VTCCORP_ORG_NAME} is visible.</td></tr>
      <tr><td><strong>No Admin Functions</strong></td><td>User management, Settings, Security Center, and tenant connections are inaccessible.</td></tr>
    </tbody>
  </table>
</div>

<!-- §3 -->
<div class="section">
  <div class="section-header"><div class="section-num">Section 3</div><div class="section-title">What the Assessor Can Do</div></div>
  <ul>
    <li>View the <strong>Compliance Dashboard</strong> — readiness score, domain progress, activity timeline</li>
    <li>Browse and search the <strong>Controls Library</strong> (all 110 CMMC L2 controls)</li>
    <li>Read <strong>Implementation Narratives</strong> for each control</li>
    <li>Review the <strong>Configure tab</strong> — implementation guidance steps</li>
    <li>View linked <strong>Evidence</strong> per control — status, type, collection date, owner</li>
    <li><strong>Preview and download evidence files</strong> — PDFs, images, text, Office documents</li>
    <li>Use <strong>Bulk Download</strong> — export a structured ZIP package of evidence and/or documents for offline C3PAO review (approved, active, and assessor-ready items)</li>
    <li>Access the <strong>Evidence Repository</strong> — global searchable evidence list</li>
    <li>Access <strong>Documentation</strong> — policies, procedures, logs, records</li>
    <li>Review <strong>SSP narratives</strong> per control — System Security Plan mappings</li>
    <li>View the <strong>Monitoring Tracker</strong> — 19 recurring operational review activities</li>
    <li>Review <strong>POA&amp;M items</strong> — open gaps, remediation plans, risk levels</li>
    <li>Use the <strong>Help Center</strong> — in-app user guide and FAQ</li>
  </ul>
</div>

<!-- §4 -->
<div class="section">
  <div class="section-header"><div class="section-num">Section 4</div><div class="section-title">What the Assessor Cannot Do</div></div>
  <p>The Assessor role is strictly read-only. The following actions are blocked:</p>
  <ul>
    <li>Add, edit, or delete evidence items</li>
    <li>Upload files or attachments</li>
    <li>Change assessment status, evidence status, or document status</li>
    <li>Edit implementation narratives or control records</li>
    <li>Edit SSP content</li>
    <li>Edit or update the Monitoring Tracker</li>
    <li>Create, edit, or close POA&amp;M items</li>
    <li>Create or manage user accounts</li>
    <li>Access Settings or Security Center</li>
    <li>Connect Microsoft tenants or run automated scans</li>
    <li>Generate or regenerate reports</li>
    <li>Delete any records</li>
  </ul>
  <div class="info-box warn"><div class="ib-title">⚠ Read-Only Enforcement</div><p>The system blocks all write operations for the Assessor role. If you believe you have incorrect permissions, contact the ${VTCCORP_ORG_NAME} administrator.</p></div>
</div>

<!-- §5 -->
<div class="section page-break">
  <div class="section-header"><div class="section-num">Section 5</div><div class="section-title">Logging In</div></div>
  <p>Control HUB uses email/password authentication. Multi-factor authentication (MFA) may be enforced. Your assessor credentials will be provided by the ${VTCCORP_ORG_NAME} compliance administrator.</p>
  ${imgTag(s("login"), "Login page", "Figure 5.1 — Control HUB login screen. Enter your assigned assessor email and password, then click Sign In.")}
  <ol>
    <li>Open your browser and navigate to the Control HUB URL provided by ${VTCCORP_ORG_NAME}.</li>
    <li>Enter your assigned <strong>email address</strong>.</li>
    <li>Enter your <strong>password</strong>.</li>
    <li>Click <strong>Sign In</strong>.</li>
    <li>If MFA is required, enter the 6-digit code from your authenticator app.</li>
    <li>Upon success, the <strong>Compliance Dashboard</strong> loads automatically.</li>
  </ol>
  <div class="info-box"><div class="ib-title">🔐 Login Assistance</div><p>If you cannot log in, are locked out, or have not received credentials, contact: <strong>info@carmetechnology.com</strong></p></div>
</div>

<!-- §6 -->
<div class="section">
  <div class="section-header"><div class="section-num">Section 6</div><div class="section-title">Selecting ${VTCCORP_ORG_NAME}</div></div>
  <p>Control HUB supports multiple organizations. After login, confirm that <strong>${VTCCORP_ORG_NAME}</strong> is the active organization shown in the top-left of the sidebar.</p>
  ${imgTag(s("dashboard"), "Dashboard — organization selector", "Figure 6.1 — The active organization name appears in the sidebar header. Confirm it shows \"" + VTCCORP_ORG_NAME + "\" before beginning your review.")}
  <p>If the wrong organization is displayed, click the organization name in the sidebar to open the organization switcher, then select <strong>${VTCCORP_ORG_NAME}</strong>.</p>
  <div class="info-box"><div class="ib-title">ℹ Org Scope</div><p>All data — controls, evidence, documents, monitoring, POA&amp;Ms — is scoped to the active organization. If you have access to only one organization, it will be pre-selected automatically.</p></div>
</div>

<!-- §7 -->
<div class="section">
  <div class="section-header"><div class="section-num">Section 7</div><div class="section-title">Dashboard Overview</div></div>
  <p>The <strong>Compliance Dashboard</strong> provides a summary of ${VTCCORP_ORG_NAME}'s overall CMMC readiness. It is the first screen after login.</p>
  ${imgTag(s("dashboard"), "Compliance Dashboard", "Figure 7.1 — The " + VTCCORP_ORG_NAME + " Compliance Dashboard. KPI cards show overall readiness, evidence health, monitoring status, and POA&M health.")}
  <table>
    <thead><tr><th>Dashboard Element</th><th>What It Shows</th></tr></thead>
    <tbody>
      <tr><td><strong>Overall Readiness</strong></td><td>Percentage of controls in a compliant or advancing state.</td></tr>
      <tr><td><strong>Controls Status</strong></td><td>Implemented / In Progress / Not Started / Not Applicable counts.</td></tr>
      <tr><td><strong>Evidence Health</strong></td><td>Evidence by status — approved, pending, stale, or archived.</td></tr>
      <tr><td><strong>Monitoring</strong></td><td>Current, Due Soon, and Overdue monitoring item counts.</td></tr>
      <tr><td><strong>POA&amp;M Health</strong></td><td>Open, In Progress, and Closed POA&amp;M item counts.</td></tr>
      <tr><td><strong>Domain Readiness</strong></td><td>Per-domain progress across all 14 CMMC L2 domains.</td></tr>
      <tr><td><strong>Recent Activity</strong></td><td>Audit trail of recent compliance actions within ${VTCCORP_ORG_NAME}.</td></tr>
    </tbody>
  </table>
</div>

<!-- §8 -->
<div class="section page-break">
  <div class="section-header"><div class="section-num">Section 8</div><div class="section-title">Controls Library</div></div>
  <p>The <strong>Controls Library</strong> contains all 110 CMMC Level 2 controls applicable to ${VTCCORP_ORG_NAME}. It is the fastest way to locate a specific CMMC practice. Navigate by clicking <strong>Controls</strong> in the left sidebar.</p>
  <div class="info-box tip"><div class="ib-title">💡 Assessor Tip</div><p>Assessors should search by the exact CMMC control ID (e.g., <strong>AC.L1-3.1.1</strong>) when reviewing a specific requirement. The search bar matches on control ID, title, and domain name.</p></div>
  ${imgTag(s("controls"), "Controls Library — " + VTCCORP_ORG_NAME, "Figure 8.1 — The " + VTCCORP_ORG_NAME + " Controls Library. All 110 CMMC L2 controls are listed with their current assessment status and evidence counts.")}

  <div class="subsection"><div class="subsection-title">Controls Library Column Reference</div></div>
  <table>
    <thead><tr><th>Column</th><th>Description</th><th>Assessor Notes</th></tr></thead>
    <tbody>
      <tr><td><strong>Control ID</strong></td><td>CMMC identifier, e.g. AC.L1-3.1.1. Click to open the control detail.</td><td>Use for exact lookup; searchable.</td></tr>
      <tr><td><strong>Title</strong></td><td>Plain-language requirement name.</td><td>Use for keyword search if ID is unknown.</td></tr>
      <tr><td><strong>Domain</strong></td><td>One of the 14 CMMC domains (e.g., Access Control).</td><td>Filter to focus review on a specific domain.</td></tr>
      <tr><td><strong>Level</strong></td><td>L1 (Foundational) or L2 (Advanced).</td><td>L1 = 17 controls; L2 = 110 total.</td></tr>
      <tr><td><strong>Status</strong></td><td>Implemented / In Progress / Not Started / Not Applicable.</td><td>Implemented indicates ${VTCCORP_ORG_NAME} has documented the control and linked evidence.</td></tr>
      <tr><td><strong>Evidence</strong></td><td>Count of evidence items linked to this control.</td><td>0 evidence on an Implemented control warrants follow-up.</td></tr>
    </tbody>
  </table>

  <div class="subsection"><div class="subsection-title">Searching and Filtering</div></div>
  <ul>
    <li><strong>Search box</strong> — Enter a control ID (AC.L1-3.1.1), title keyword, or domain name.</li>
    <li><strong>Domain filter</strong> — Limit the list to one of the 14 CMMC domains.</li>
    <li><strong>Level filter</strong> — Show only L1 (foundational) or all L2 controls.</li>
    <li><strong>Status filter</strong> — Show only Implemented, In Progress, Not Started, or Not Applicable controls.</li>
    <li>Click any <strong>Control ID link</strong> to open the full Control Package for that requirement.</li>
  </ul>

  <div class="info-box warn"><div class="ib-title">⚠ Status Interpretation</div><p>A control marked <strong>Not Started</strong> or blank may indicate the control has not yet been formally assessed by ${VTCCORP_ORG_NAME}. Note these controls in your assessment findings and ask the administrator for current status.</p></div>

  ${checklist("Controls Library Review Checklist", [
    "Locate the control using the exact CMMC ID from your assessment scope",
    "Verify the control status is Implemented (or document if Not Started / In Progress)",
    "Check the evidence count — zero evidence on an Implemented control requires clarification",
    "Filter by domain to review all controls in a CMMC domain systematically",
    "Note any controls showing Not Applicable — verify justification in control detail",
  ])}
</div>

<!-- §9 -->
<div class="section page-break">
  <div class="section-header"><div class="section-num">Section 9</div><div class="section-title">Control Package Review</div></div>
  <p>Clicking a control ID opens the <strong>Control Package</strong> — a full assessment view for a single CMMC requirement. Each control package contains multiple tabs grouping the assessment evidence, narratives, and supporting information.</p>
  <p>The control header shows the Control ID, full title, CMMC domain, level, and current assessment status. Below the header, the following tabs are available to the Assessor role.</p>

  <div class="subsection" id="s91"><div class="subsection-title">9.1 — Implementation Tab</div></div>
  <p>The <strong>Implementation tab</strong> is the primary assessment tab. It contains ${VTCCORP_ORG_NAME}'s written explanation of how they implement the CMMC control in their environment.</p>
  ${imgTag(s("ctrl_impl"), "Control Detail — Implementation Tab", "Figure 9.1 — The Implementation tab for control " + ctx.bestControlId + " showing the assessment status and " + VTCCORP_ORG_NAME + "'s implementation narrative.")}
  <div class="sub2-title">Implementation Tab Fields</div>
  <table>
    <thead><tr><th>Field</th><th>Description</th><th>Assessor Significance</th></tr></thead>
    <tbody>
      <tr><td><strong>Control Description</strong></td><td>The official CMMC requirement text.</td><td>Reference for what must be implemented.</td></tr>
      <tr><td><strong>Implementation Guidance</strong></td><td>Internal guidance on how the control was implemented.</td><td>Understand the intended approach before reviewing evidence.</td></tr>
      <tr><td><strong>Implementation Status</strong></td><td>Implemented / In Progress / Not Started / Not Applicable.</td><td>Core finding indicator.</td></tr>
      <tr><td><strong>Implementation Narrative</strong></td><td>${VTCCORP_ORG_NAME}'s written statement of how the control is addressed.</td><td>Primary narrative evidence. Verify specificity, accuracy, and alignment with evidence.</td></tr>
    </tbody>
  </table>
  <div class="info-box tip"><div class="ib-title">💡 Narrative Quality</div><p>A complete narrative should describe the specific <strong>systems</strong> used, the <strong>process owners</strong> responsible, the <strong>frequency</strong> of recurring activities, and the <strong>evidence sources</strong> that demonstrate implementation. A generic or one-sentence narrative is a finding.</p></div>
  ${checklist("Implementation Tab Checklist", [
    "Narrative is present and not blank",
    "Narrative is specific to " + VTCCORP_ORG_NAME + " (names systems and process owners)",
    "Narrative references actual tools, platforms, or procedures",
    "Implementation status matches narrative content",
    "Save/Edit buttons are not visible (confirming read-only mode)",
    "Narrative aligns with the linked evidence in the Evidence tab",
  ])}

  <div class="subsection page-break" id="s92"><div class="subsection-title">9.2 — Configure Tab</div></div>
  <p>The <strong>Configure tab</strong> provides step-by-step implementation guidance documenting the intended configuration process. It is not evidence itself, but it explains how the control was expected to be configured and what evidence should have been captured.</p>
  ${imgTag(s("ctrl_configure"), "Control Detail — Configure Tab", "Figure 9.2 — The Configure tab showing implementation approach, required steps, and expected evidence artifacts.")}
  <ul>
    <li><strong>Implementation Approach</strong> — describes the systems or platforms used to implement the control.</li>
    <li><strong>Configuration Steps</strong> — ordered instructions for implementing the control.</li>
    <li><strong>Evidence to Capture</strong> — what artifacts should exist as evidence of completion.</li>
    <li><strong>Required Documents</strong> — any policies or procedures that must be in place.</li>
    <li><strong>Validation Steps</strong> — how to verify the control is working.</li>
  </ul>
  <div class="info-box"><div class="ib-title">ℹ Assessor Use of Configure Tab</div><p>Use the Configure tab to understand what ${VTCCORP_ORG_NAME} intended to implement. Then cross-reference with the Evidence tab to confirm that expected artifacts exist. Steps listed as incomplete or missing evidence entries may indicate gaps.</p></div>
  <div class="info-box warn"><div class="ib-title">⚠ Read-Only</div><p>Assessors cannot check off, edit, or modify configuration steps. The tab is view-only.</p></div>

  <div class="subsection page-break" id="s93"><div class="subsection-title">9.3 — Evidence Tab</div></div>
  <p>The <strong>Evidence tab</strong> lists all evidence artifacts linked to this specific control. These are the artifacts ${VTCCORP_ORG_NAME} is presenting to support their implementation claim.</p>
  ${imgTag(s("ctrl_evidence"), "Control Detail — Evidence Tab", "Figure 9.3 — The Evidence tab listing all linked evidence artifacts for " + ctx.bestControlId + " with status, type, collection date, and download options.")}
  <div class="sub2-title">Evidence Tab Columns</div>
  <table>
    <thead><tr><th>Column</th><th>Description</th></tr></thead>
    <tbody>
      <tr><td><strong>Title</strong></td><td>Descriptive name of the evidence artifact. Click to open the Evidence Detail.</td></tr>
      <tr><td><strong>Type</strong></td><td>Category: Policy, Procedure, Screenshot, Log, Certificate, Report, Spreadsheet, etc.</td></tr>
      <tr><td><strong>Status</strong></td><td>Lifecycle state. Focus on Approved, Active, and Assessor Ready for assessment.</td></tr>
      <tr><td><strong>Collected Date</strong></td><td>When the evidence was collected or generated.</td></tr>
      <tr><td><strong>Owner</strong></td><td>The ${VTCCORP_ORG_NAME} team member responsible for this artifact.</td></tr>
      <tr><td><strong>Preview / Download</strong></td><td>Icons to open the file preview or download the artifact.</td></tr>
    </tbody>
  </table>
  <div class="sub2-title">Evidence Review Workflow</div>
  <ol class="step-list">
    <li><div class="step-num">1</div><div class="step-content"><span class="step-title">Open the control</span>Click the control ID in the Controls Library or search for it.</div></li>
    <li><div class="step-num">2</div><div class="step-content"><span class="step-title">Select the Evidence tab</span>Click the Evidence tab below the control header.</div></li>
    <li><div class="step-num">3</div><div class="step-content"><span class="step-title">Review all listed evidence records</span>Check title, type, status, and collection date for each item.</div></li>
    <li><div class="step-num">4</div><div class="step-content"><span class="step-title">Prioritize Approved / Active / Assessor Ready</span>These statuses indicate evidence that has passed internal review.</div></li>
    <li><div class="step-num">5</div><div class="step-content"><span class="step-title">Open the Evidence Detail</span>Click the evidence title to see full metadata, file preview, and linked controls.</div></li>
    <li><div class="step-num">6</div><div class="step-content"><span class="step-title">Preview or download the file</span>Use the preview panel or the Download button to review the artifact.</div></li>
    <li><div class="step-num">7</div><div class="step-content"><span class="step-title">Confirm alignment</span>Verify the evidence directly supports the implementation narrative in the Implementation tab.</div></li>
  </ol>
  ${imgTag(s("evidence_detail"), "Evidence Detail Page", "Figure 9.4 — Evidence detail page showing metadata, assessor summary, file preview area, linked controls, and collection/expiration dates.")}
  ${checklist("Evidence Tab Checklist", [
    "At least one evidence item exists for this control",
    "Primary evidence has status: Approved, Active, or Assessor Ready",
    "Collection date is reasonable and not stale (>12 months old without re-review)",
    "Evidence type is appropriate for the control (e.g., policy for policy-based controls)",
    "Evidence title is descriptive (not generic like 'Screenshot 1')",
    "File can be previewed or downloaded",
    "Evidence content directly supports the implementation narrative",
    "Owner is identified",
  ])}

  <div class="subsection page-break" id="s94"><div class="subsection-title">9.4 — Monitoring Tab</div></div>
  <p>The <strong>Monitoring tab</strong> shows recurring operational activities linked to this control. Controls that require ongoing review (e.g., vulnerability scanning, access reviews) will show associated monitoring items here.</p>
  ${imgTag(s("ctrl_monitoring"), "Control Detail — Monitoring Tab", "Figure 9.5 — The Monitoring tab showing recurring operational activities linked to " + ctx.bestControlId + ".")}
  <table>
    <thead><tr><th>Column</th><th>Description</th></tr></thead>
    <tbody>
      <tr><td><strong>Task</strong></td><td>Name of the recurring monitoring activity.</td></tr>
      <tr><td><strong>Frequency</strong></td><td>Required review cadence: Daily, Weekly, Monthly, Quarterly, or Annually.</td></tr>
      <tr><td><strong>Last Completed</strong></td><td>Date the activity was most recently completed.</td></tr>
      <tr><td><strong>Next Due</strong></td><td>When the activity is next scheduled.</td></tr>
      <tr><td><strong>Status</strong></td><td>Current / Open / In Progress / Overdue.</td></tr>
      <tr><td><strong>Notes</strong></td><td>Free-text notes from the most recent completion.</td></tr>
    </tbody>
  </table>
  <div class="info-box warn"><div class="ib-title">⚠ Overdue Status</div><p>An <strong>Overdue</strong> monitoring item indicates a recurring operational activity has not been completed on schedule. This may represent a CMMC sustainment gap — note it in assessment findings.</p></div>
  ${checklist("Monitoring Tab Checklist", [
    "Relevant monitoring activities exist for controls requiring recurring review",
    "Status is Current for all required monitoring activities",
    "Last Completed date is within the expected frequency window",
    "Overdue items are documented and noted as potential gaps",
    "Notes provide context on what was reviewed or found",
  ])}

  <div class="subsection" id="s95"><div class="subsection-title">9.5 — Plan of Action and Milestones (POA&amp;M) Tab</div></div>
  <p>The <strong>POA&amp;M tab</strong> shows remediation items linked to this specific control. A Plan of Action and Milestones (POA&amp;M) is a formal gap remediation record that ${VTCCORP_ORG_NAME} has committed to address.</p>
  ${imgTag(s("ctrl_poam"), "Control Detail — POA&M Tab", "Figure 9.6 — POA&M tab showing any open remediation items linked to " + ctx.bestControlId + ".")}
  <table>
    <thead><tr><th>Field</th><th>Description</th></tr></thead>
    <tbody>
      <tr><td><strong>POA&amp;M Number</strong></td><td>Unique identifier for the remediation item.</td></tr>
      <tr><td><strong>Weakness / Gap</strong></td><td>Description of the identified deficiency.</td></tr>
      <tr><td><strong>Risk Level</strong></td><td>High / Medium / Low — the assessed risk of the gap.</td></tr>
      <tr><td><strong>Status</strong></td><td>Open / In Progress / Closed.</td></tr>
      <tr><td><strong>Owner</strong></td><td>Responsible party for remediation.</td></tr>
      <tr><td><strong>Target Date</strong></td><td>Planned completion date.</td></tr>
    </tbody>
  </table>
  ${checklist("POA&M Tab Checklist", [
    "Review all open POA&M items for this control",
    "Verify risk level is defined (High/Medium/Low)",
    "Owner is assigned",
    "Target date is present and not in the past without closure",
    "High-risk items with overdue target dates are documented as findings",
    "Closed POA&Ms — verify closure evidence exists",
  ])}

  <div class="subsection" id="s96"><div class="subsection-title">9.6 — SSP Tab</div></div>
  <p>The <strong>SSP tab</strong> presents the System Security Plan narrative for this control — the formal SSP-format description of how ${VTCCORP_ORG_NAME} implements the requirement within their documented system boundary.</p>
  ${imgTag(s("ctrl_ssp"), "Control Detail — SSP Tab", "Figure 9.7 — SSP tab showing the System Security Plan narrative for " + ctx.bestControlId + ".")}
  <ul>
    <li><strong>SSP Narrative</strong> — The formal SSP-formatted implementation statement.</li>
    <li><strong>Control Status</strong> — Should align with the Implementation tab status.</li>
    <li><strong>Last Updated</strong> — When the SSP narrative was most recently revised.</li>
  </ul>
  <div class="info-box"><div class="ib-title">ℹ SSP vs. Implementation Narrative</div><p>The SSP tab and Implementation tab may contain similar content. The SSP tab represents the formally documented SSP narrative, while the Implementation tab is the working assessment record. Compare both — inconsistencies between them may indicate the SSP needs updating.</p></div>
  ${checklist("SSP Tab Checklist", [
    "SSP narrative exists and is not blank",
    "Narrative is specific to " + VTCCORP_ORG_NAME + " systems and processes",
    "Narrative is not generic or copy-paste template text",
    "Narrative aligns with the Implementation tab narrative",
    "Narrative references actual systems, tools, or procedures",
    "SSP control status matches the Implementation status",
  ])}
</div>

<!-- §10 -->
<div class="section page-break">
  <div class="section-header"><div class="section-num">Section 10</div><div class="section-title">Example: Reviewing ${ctx.bestControlId} — Step-by-Step Walkthrough</div></div>
  <p>This section walks through a complete control review for <strong>${ctx.bestControlId}</strong> — one of the core CMMC controls in ${VTCCORP_ORG_NAME}'s assessment scope. Use this as a template for your full assessment.</p>

  <ol class="step-list">
    <li><div class="step-num">1</div><div class="step-content"><span class="step-title">Navigate to Controls</span>Click <strong>Controls</strong> in the left sidebar. The Controls Library loads.</div></li>
    <li><div class="step-num">2</div><div class="step-content"><span class="step-title">Search for ${ctx.bestControlId}</span>Type <strong>${ctx.bestControlId}</strong> in the search box. The library filters to the matching control. Confirm the status and evidence count before opening.</div></li>
    <li><div class="step-num">3</div><div class="step-content"><span class="step-title">Open the control</span>Click the <strong>${ctx.bestControlId}</strong> link. The Control Package opens with the Implementation tab active.</div></li>
    <li><div class="step-num">4</div><div class="step-content"><span class="step-title">Read the implementation narrative</span>In the <strong>Implementation</strong> tab, read ${VTCCORP_ORG_NAME}'s narrative. Verify it describes specific systems, process owners, and frequency of activity. Note any generic or missing content.</div></li>
    <li><div class="step-num">5</div><div class="step-content"><span class="step-title">Review the Configure tab</span>Click the <strong>Configure</strong> tab. Review the implementation approach and expected evidence artifacts. Identify any steps that appear incomplete.</div></li>
    <li><div class="step-num">6</div><div class="step-content"><span class="step-title">Review the Evidence tab</span>Click <strong>Evidence</strong>. Review all linked evidence records. Focus on items with status Approved, Active, or Assessor Ready. Note any missing or stale evidence.</div></li>
    <li><div class="step-num">7</div><div class="step-content"><span class="step-title">Open and review an evidence item</span>Click an evidence title. The Evidence Detail page opens. Review the metadata (type, status, collection date, owner, assessor summary). Use the preview panel or Download button to review the actual artifact.</div></li>
    <li><div class="step-num">8</div><div class="step-content"><span class="step-title">Review the SSP tab</span>Return to the control. Click the <strong>SSP</strong> tab. Compare the SSP narrative to the implementation narrative. Note any discrepancies.</div></li>
    <li><div class="step-num">9</div><div class="step-content"><span class="step-title">Check Monitoring and POA&amp;M</span>Click the <strong>Monitoring</strong> tab. Verify monitoring is current for any recurring activities. Click the <strong>POA&amp;M</strong> tab. Review any open remediation items.</div></li>
    <li><div class="step-num">10</div><div class="step-content"><span class="step-title">Document your observations</span>Record your findings outside the app (assessment tool, worksheet, or notes). Contact the ${VTCCORP_ORG_NAME} administrator if you need additional information not visible in Control HUB.</div></li>
  </ol>

  <div class="info-box"><div class="ib-title">📌 Repeat for Each Control in Scope</div><p>Repeat this 10-step process for each control in your assessment scope. Use the Controls Library search and domain filter to systematically work through each CMMC domain.</p></div>
</div>

<!-- §11 -->
<div class="section page-break">
  <div class="section-header"><div class="section-num">Section 11</div><div class="section-title">Evidence Repository</div></div>
  <p>The <strong>Evidence Repository</strong> provides a global, searchable list of all evidence items for ${VTCCORP_ORG_NAME}. Navigate by clicking <strong>Evidence</strong> in the left sidebar.</p>
  ${imgTag(s("evidence"), "Evidence Repository", "Figure 11.1 — The Evidence Repository showing all " + VTCCORP_ORG_NAME + " evidence items with search, filter, type, status, and linked control information.")}
  <div class="subsection-title">Filtering Evidence</div>
  <ul>
    <li><strong>Search</strong> — Find by title, filename, control ID, tag, or summary keyword.</li>
    <li><strong>Status filter</strong> — Show Approved, Active, Assessor Ready, or other statuses.</li>
    <li><strong>Type filter</strong> — Narrow to a specific type (Policy, Screenshot, Log, etc.).</li>
    <li><strong>Domain filter</strong> — Show evidence linked to a specific CMMC domain.</li>
    <li><strong>Owner filter</strong> — Filter by evidence owner.</li>
  </ul>
  ${checklist("Evidence Repository Checklist", [
    "Evidence records are present (not empty)",
    "Most evidence has status Approved, Active, or Assessor Ready",
    "Evidence types are appropriate for CMMC requirements",
    "Collection dates are recent (verify expiration for time-bound evidence)",
    "Evidence is linked to specific controls (not unlinked floating records)",
  ])}

  <div class="subsection-title">Bulk Download Evidence Package</div>
  <p>The <strong>Bulk Download</strong> button in the Evidence Repository toolbar lets assessors export a structured ZIP package containing evidence files and a control-mapping manifest — designed for offline C3PAO review and uploading to assessment tools.</p>
  ${imgTag(s("bulk_download_wizard"), "Bulk Download Wizard — Scope Step", "Figure 11.2 — The Bulk Download wizard (Step 1: Scope). Choose which evidence items to include before selecting structure and content options.")}
  <p>Clicking <strong>Bulk Download</strong> opens a 5-step wizard:</p>
  <ol class="step-list">
    <li><div class="step-num">1</div><div class="step-content"><span class="step-title">Scope</span>Choose what to include: <em>Selected Items</em> (rows you have checked), <em>Approved / Active / Assessor Ready</em> (recommended for assessment), <em>Current Filter Results</em>, or <em>Entire Organization</em>.</div></li>
    <li><div class="step-num">2</div><div class="step-content"><span class="step-title">Content</span>Choose whether to include Evidence files, Documents, or both. Select which status levels to include (Approved, Active, Assessor Ready are pre-selected by default). Optionally include items not linked to any control.</div></li>
    <li><div class="step-num">3</div><div class="step-content"><span class="step-title">Structure</span>Select the ZIP folder layout that best suits your review workflow.</div></li>
    <li><div class="step-num">4</div><div class="step-content"><span class="step-title">Review</span>Confirm the settings before generating.</div></li>
    <li><div class="step-num">5</div><div class="step-content"><span class="step-title">Generate</span>The server assembles the ZIP and the browser downloads it automatically. The filename follows the pattern: <strong>VTCCORPUS_Bulk_Download_YYYY-MM-DD.zip</strong></div></li>
  </ol>
  <div class="sub2-title">ZIP Structure Options</div>
  <table>
    <thead><tr><th>Structure</th><th>Folder Layout</th><th>Best For</th></tr></thead>
    <tbody>
      <tr><td><strong>By Domain › Control ID</strong> <span class="badge b-blue">Recommended</span></td><td>AC_Access_Control/<br/>&nbsp;&nbsp;AC.L1-3.1.1/<br/>&nbsp;&nbsp;&nbsp;&nbsp;files…</td><td>Manual CMMC review — browse by domain then control</td></tr>
      <tr><td><strong>By Control ID</strong></td><td>AC.L1-3.1.1/<br/>&nbsp;&nbsp;files…</td><td>C3PAO control-by-control upload to assessment portal</td></tr>
      <tr><td><strong>By File Type</strong></td><td>Policies/<br/>Screenshots/<br/>Logs/…</td><td>Evidence cleanup and audit prep</td></tr>
      <tr><td><strong>Flat ZIP with Manifest</strong> <span class="badge b-purple">C3PAO Upload</span></td><td>Files/<br/>&nbsp;&nbsp;all files…<br/>00_Manifest/<br/>&nbsp;&nbsp;File_Index.xlsx<br/>&nbsp;&nbsp;Control_Mapping.xlsx</td><td>Uploading to an assessment management system</td></tr>
    </tbody>
  </table>
  <div class="info-box tip"><div class="ib-title">💡 Assessor Tip — Recommended Scope</div><p>For most assessments, choose <strong>Approved / Active / Assessor Ready</strong> as the scope and <strong>By Domain › Control ID</strong> as the structure. The resulting ZIP mirrors the CMMC domain hierarchy and includes a control-mapping manifest, making it easy to verify evidence coverage domain by domain.</p></div>
  <div class="info-box"><div class="ib-title">ℹ Manifest Files</div><p>When <em>Include Manifest</em> is enabled, the ZIP contains an <strong>File_Index.xlsx</strong> listing every file with its title, type, status, control links, and collection date. When <em>Include Control Mapping</em> is enabled, a <strong>Control_Mapping.xlsx</strong> cross-references every control with its evidence files — useful for gap analysis during assessment.</p></div>
  <div class="info-box warn"><div class="ib-title">⚠ Assessor Scope</div><p>Assessors can only bulk download items they are permitted to view individually — Approved, Active, and Assessor-Ready evidence and documents for ${VTCCORP_ORG_NAME}. Draft or internal-only artifacts are excluded automatically.</p></div>
  ${checklist("Bulk Download Checklist", [
    "Use Approved / Active / Assessor Ready scope for the primary assessment package",
    "Select By Domain › Control ID structure for easiest manual review",
    "Enable Include Manifest and Include Control Mapping for cross-reference spreadsheets",
    "Verify ZIP filename includes the correct organization name and today's date",
    "Confirm the ZIP contains the expected domain and control folders after download",
    "Use the Control_Mapping.xlsx to identify controls with zero evidence files",
  ])}
</div>

<!-- §12 -->
<div class="section">
  <div class="section-header"><div class="section-num">Section 12</div><div class="section-title">Documentation</div></div>
  <p>The <strong>Documentation</strong> section contains ${VTCCORP_ORG_NAME}'s formal compliance documents — policies, procedures, logs, and records. Navigate by clicking <strong>Documentation</strong> → <strong>All Documents</strong> in the sidebar.</p>
  ${imgTag(s("documents"), "All Documents", "Figure 12.1 — The All Documents page listing " + VTCCORP_ORG_NAME + "'s policies, procedures, logs, and records with linked controls and status.")}
  <table>
    <thead><tr><th>Document Type</th><th>Description</th></tr></thead>
    <tbody>
      <tr><td><strong>Policy</strong></td><td>Formal organizational policies (e.g., Access Control Policy, Incident Response Policy).</td></tr>
      <tr><td><strong>Procedure</strong></td><td>Step-by-step operational procedures implementing policies.</td></tr>
      <tr><td><strong>Log</strong></td><td>Completed periodic compliance review log instances.</td></tr>
      <tr><td><strong>Record</strong></td><td>Formal compliance records (training completion, risk assessments, etc.).</td></tr>
      <tr><td><strong>Report</strong></td><td>Generated compliance reports and assessments.</td></tr>
    </tbody>
  </table>

  <div class="subsection-title">Bulk Download Document Package</div>
  <p>The <strong>Bulk Download</strong> button on the All Documents page works identically to the Evidence Repository bulk download. Assessors can export a ZIP of all active policies, procedures, and records — organized by CMMC domain or control — for offline review.</p>
  <p>When downloading from the Documents page, set <em>Content</em> to <strong>Documents only</strong> to get a clean package of formal compliance documents without evidence attachments. To export a combined evidence + document package in a single ZIP, open the Evidence Repository and include both content types in Step 2 of the wizard.</p>
  <div class="info-box tip"><div class="ib-title">💡 Policy & Procedure Review</div><p>Use the <em>By Domain › Control ID</em> structure when bulk downloading documents. Each CMMC domain folder will contain the policies and procedures that ${VTCCORP_ORG_NAME} has linked to those controls, making it straightforward to verify policy coverage across all 14 domains.</p></div>
</div>

<!-- §13 -->
<div class="section page-break">
  <div class="section-header"><div class="section-num">Section 13</div><div class="section-title">Monitoring Tracker</div></div>
  <p>The <strong>Monitoring Tracker</strong> records ${VTCCORP_ORG_NAME}'s 19 recurring operational monitoring activities required for CMMC Level 2 compliance. Navigate by clicking <strong>Monitoring Tracker</strong> in the sidebar.</p>
  ${imgTag(s("monitoring"), "Monitoring Tracker", "Figure 13.1 — The Monitoring Tracker showing all recurring CMMC L2 activities with frequency, completion schedule, and current status.")}
  <table>
    <thead><tr><th>Column</th><th>Description</th></tr></thead>
    <tbody>
      <tr><td><strong>Activity</strong></td><td>Recurring monitoring task (e.g., User Access Review, Vulnerability Scanning).</td></tr>
      <tr><td><strong>Control</strong></td><td>The CMMC control this monitoring activity supports.</td></tr>
      <tr><td><strong>Frequency</strong></td><td>Required cadence: Daily, Weekly, Monthly, Quarterly, or Annually.</td></tr>
      <tr><td><strong>Last Completed</strong></td><td>Date most recently completed.</td></tr>
      <tr><td><strong>Next Due</strong></td><td>Next scheduled due date.</td></tr>
      <tr><td><strong>Status</strong></td><td><span class="badge b-green">Current</span> Completed on time &nbsp; <span class="badge b-yellow">Open</span> Pending &nbsp; <span class="badge b-red">Overdue</span> Past due</td></tr>
    </tbody>
  </table>
  ${checklist("Monitoring Tracker Checklist", [
    "All activities with a Current status show a recent Last Completed date within the frequency window",
    "Overdue items are documented — each represents a potential sustainment gap",
    "Open items have an upcoming Next Due date within a reasonable timeframe",
    "High-frequency activities (weekly/monthly) are consistently marked Current",
    "Notes field provides context for completed activities where applicable",
  ])}
</div>

<!-- §14 -->
<div class="section">
  <div class="section-header"><div class="section-num">Section 14</div><div class="section-title">Plan of Action and Milestones Register</div></div>
  <p>The <strong>POA&amp;M register</strong> lists all known gaps and their remediation plans. A Plan of Action and Milestones (POA&amp;M) is a formal acknowledgment of a deficiency with a documented remediation path. Navigate via <strong>POA&amp;M</strong> in the sidebar.</p>
  ${imgTag(s("poams"), "POA&M Register", "Figure 14.1 — The POA&M register listing all open and in-progress remediation items with risk level, owner, and target completion date.")}
  <table>
    <thead><tr><th>Field</th><th>Description</th></tr></thead>
    <tbody>
      <tr><td><strong>POA&amp;M Number</strong></td><td>Unique identifier (e.g., POAM-2026-001).</td></tr>
      <tr><td><strong>Title / Weakness</strong></td><td>Brief description of the identified gap or deficiency.</td></tr>
      <tr><td><strong>Risk Level</strong></td><td><span class="badge b-red">High</span> <span class="badge b-yellow">Medium</span> <span class="badge b-gray">Low</span></td></tr>
      <tr><td><strong>Status</strong></td><td>Open / In Progress / Closed.</td></tr>
      <tr><td><strong>Owner</strong></td><td>Person responsible for remediation.</td></tr>
      <tr><td><strong>Target Date</strong></td><td>Planned completion date.</td></tr>
      <tr><td><strong>Linked Control</strong></td><td>The CMMC control the POA&amp;M addresses.</td></tr>
    </tbody>
  </table>
  ${checklist("POA&M Review Checklist", [
    "All open POA&M items are visible",
    "Each item has a defined risk level",
    "Each item has an assigned owner",
    "Each item has a target completion date",
    "High-risk items with past-due target dates are documented as findings",
    "In Progress items have evidence of active remediation",
    "Closed items — verify closure evidence was captured",
  ])}
</div>

<!-- §15 -->
<div class="section page-break">
  <div class="section-header"><div class="section-num">Section 15</div><div class="section-title">Reports</div></div>
  <p>Control HUB generates compliance reports accessible through the Assessor view and administrator-provided exports. Assessors can request specific reports from the ${VTCCORP_ORG_NAME} administrator.</p>
  <table>
    <thead><tr><th>Report</th><th>Contents</th><th>How to Access</th></tr></thead>
    <tbody>
      <tr><td><strong>Executive Readiness</strong></td><td>Overall readiness score, domain summary.</td><td>Request from administrator.</td></tr>
      <tr><td><strong>Domain Readiness</strong></td><td>Per-domain compliance across 14 CMMC domains.</td><td>Request from administrator.</td></tr>
      <tr><td><strong>Evidence Inventory</strong></td><td>All evidence items with status and control links.</td><td>Evidence Repository (export).</td></tr>
      <tr><td><strong>POA&amp;M Report</strong></td><td>All open/closed POA&amp;M items.</td><td>Request from administrator.</td></tr>
      <tr><td><strong>Monitoring Report</strong></td><td>All 19 monitoring activities with status.</td><td>Monitoring Tracker view.</td></tr>
      <tr><td><strong>Assessor Control Package</strong></td><td>Per-control implementation, narrative, and evidence summary.</td><td>Visible in Control Package view.</td></tr>
    </tbody>
  </table>
  <div class="info-box"><div class="ib-title">ℹ Report Access</div><p>Assessors cannot generate or regenerate reports. If you need a specific report format for your assessment, contact the ${VTCCORP_ORG_NAME} administrator or <strong>info@carmetechnology.com</strong>.</p></div>
</div>

<!-- §16 -->
<div class="section">
  <div class="section-header"><div class="section-num">Section 16</div><div class="section-title">Recommended Assessor Workflow</div></div>
  <ol class="step-list">
    <li><div class="step-num">1</div><div class="step-content"><span class="step-title">Log in to Control HUB</span>Use your assigned assessor credentials. Complete MFA if prompted. See Section 5.</div></li>
    <li><div class="step-num">2</div><div class="step-content"><span class="step-title">Confirm ${VTCCORP_ORG_NAME} is selected</span>Verify the org name in the sidebar top-left. Switch if needed. See Section 6.</div></li>
    <li><div class="step-num">3</div><div class="step-content"><span class="step-title">Review the Dashboard</span>Note overall readiness, overdue monitoring items, and open POA&amp;Ms. See Section 7.</div></li>
    <li><div class="step-num">4</div><div class="step-content"><span class="step-title">Open the Controls Library</span>Click Controls. Use domain and status filters to systematically review each CMMC domain. See Section 8.</div></li>
    <li><div class="step-num">5</div><div class="step-content"><span class="step-title">For each in-scope control: open the Control Package</span>Click the control ID. Review Implementation → Configure → Evidence → SSP → Monitoring → POA&amp;M tabs. See Section 9.</div></li>
    <li><div class="step-num">6</div><div class="step-content"><span class="step-title">Open and review evidence</span>Click each evidence item. Preview or download the file. Confirm it supports the implementation narrative. See Sections 9.3 and 11.</div></li>
    <li><div class="step-num">7</div><div class="step-content"><span class="step-title">Bulk download the evidence package</span>From the Evidence Repository, click <strong>Bulk Download</strong>. Select <em>Approved / Active / Assessor Ready</em> scope, enable both Evidence and Documents, choose <em>By Domain › Control ID</em> structure, and enable Include Manifest and Include Control Mapping. Download the ZIP for offline review. See Section 11.1.</div></li>
    <li><div class="step-num">8</div><div class="step-content"><span class="step-title">Review Monitoring Tracker</span>Click Monitoring Tracker. Note any Overdue activities as potential gaps. See Section 13.</div></li>
    <li><div class="step-num">9</div><div class="step-content"><span class="step-title">Review POA&amp;M Register</span>Click POA&amp;M. Note open items, high-risk items, and past-due targets. See Section 14.</div></li>
    <li><div class="step-num">10</div><div class="step-content"><span class="step-title">Request any missing reports</span>Contact the administrator if additional report formats are needed. See Section 15.</div></li>
    <li><div class="step-num">11</div><div class="step-content"><span class="step-title">Contact support if needed</span>For access issues, missing data, or additional information, see Section 18.</div></li>
  </ol>
</div>

<!-- §17 -->
<div class="section page-break">
  <div class="section-header"><div class="section-num">Section 17</div><div class="section-title">Troubleshooting</div></div>
  <table>
    <thead><tr><th>Issue</th><th>Likely Cause</th><th>Resolution</th></tr></thead>
    <tbody>
      <tr><td><strong>Cannot log in</strong></td><td>Incorrect credentials or account not yet created.</td><td>Verify email/password. Contact administrator. See Section 18.</td></tr>
      <tr><td><strong>Cannot see ${VTCCORP_ORG_NAME}</strong></td><td>Assessor account not added to the org.</td><td>Contact the ${VTCCORP_ORG_NAME} administrator to verify org membership.</td></tr>
      <tr><td><strong>Control shows "Not Found"</strong></td><td>Stale URL or incorrect control ID in the link.</td><td>Navigate to Controls → search by ID instead of using a direct URL.</td></tr>
      <tr><td><strong>Evidence preview not loading</strong></td><td>Unsupported format or temporary issue.</td><td>Use the Download button to save locally.</td></tr>
      <tr><td><strong>Download blocked</strong></td><td>Browser pop-up blocker.</td><td>Allow downloads from Control HUB domain in browser settings.</td></tr>
      <tr><td><strong>Controls all show "Not Started"</strong></td><td>Viewing a different org or no assessments recorded.</td><td>Confirm ${VTCCORP_ORG_NAME} is selected in the org switcher.</td></tr>
      <tr><td><strong>Evidence repository empty</strong></td><td>Filter active or different org selected.</td><td>Clear all filters. Confirm ${VTCCORP_ORG_NAME} is active.</td></tr>
      <tr><td><strong>Session expired</strong></td><td>JWT tokens expire after 24 hours.</td><td>Log in again with your assessor credentials.</td></tr>
      <tr><td><strong>Access too broad</strong></td><td>Wrong role assigned to account.</td><td>Contact administrator to verify role is set to Assessor.</td></tr>
      <tr><td><strong>Bulk Download button not visible</strong></td><td>Browser width too narrow or toolbar collapsed.</td><td>Widen the browser window. The button appears in the Evidence Repository and All Documents toolbars.</td></tr>
      <tr><td><strong>Bulk Download ZIP is empty</strong></td><td>No evidence matched the selected scope and status filters.</td><td>Switch scope to <em>Approved / Active / Assessor Ready</em>. Verify evidence exists in the repository.</td></tr>
      <tr><td><strong>Bulk Download fails or times out</strong></td><td>Large export or server timeout on very large organizations.</td><td>Reduce the scope (use a domain filter first, then download filtered results). Contact administrator if the issue persists.</td></tr>
      <tr><td><strong>Control_Mapping.xlsx shows no files for a control</strong></td><td>Evidence exists but is not linked to that control.</td><td>Check the Evidence tab on the Control Package — evidence may exist but be unlinked. Note this as a potential gap.</td></tr>
    </tbody>
  </table>
</div>

<!-- §18 -->
<div class="section">
  <div class="section-header"><div class="section-num">Section 18</div><div class="section-title">Contact &amp; Support</div></div>
  <table>
    <thead><tr><th>Contact Type</th><th>Details</th></tr></thead>
    <tbody>
      <tr><td><strong>General Support</strong></td><td>info@carmetechnology.com</td></tr>
      <tr><td><strong>Platform</strong></td><td>Control HUB by Carme Technology</td></tr>
      <tr><td><strong>Organization</strong></td><td>${VTCCORP_ORG_NAME}</td></tr>
      <tr><td><strong>Guide Version</strong></td><td>${VERSION} — ${GENERATED_DATE}</td></tr>
    </tbody>
  </table>
  <div class="info-box tip"><div class="ib-title">✅ Assessment Ready</div><p>This guide covers all major areas of the Control HUB assessor experience for ${VTCCORP_ORG_NAME}. For any issue not covered here or access to additional data, contact <strong>info@carmetechnology.com</strong>.</p></div>
  <hr/>
  <p style="text-align:center;font-size:8pt;color:#94a3b8;margin-top:18px;">
    Confidential — Authorized Assessor Use Only<br/>
    ${VTCCORP_ORG_NAME} Control HUB Assessor User Guide — Version ${VERSION} — ${GENERATED_DATE}<br/>
    Prepared by Carme Technology · info@carmetechnology.com
  </p>
</div>

</body>
</html>`;
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  console.log("\n🔐 Control HUB — Assessor User Guide Generator v2");
  console.log("═".repeat(52));
  console.log(`📁 Output:  ${OUTPUT_PDF}`);
  console.log(`🏢 Org:     ${VTCCORP_ORG_NAME}`);
  console.log(`🌐 App URL: ${APP_URL}`);
  console.log(`📅 Date:    ${GENERATED_DATE}`);
  console.log("═".repeat(52));

  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  // ── 1. Setup org & seed data ─────────────────────────────────────────────
  const ctx = await setupVtcCorpOrg();

  // ── 2. Generate assessor JWT ────────────────────────────────────────────
  const token = generateToken();
  console.log("\n✅ JWT generated for assessor@example.com");

  // ── 3. Screenshot capture ────────────────────────────────────────────────
  console.log("\n📸 Capturing screenshots...");

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

  const shots = new Map<string, string>();

  try {
    const context = await browser.newContext({
      viewport: { width: 1440, height: 900 },
    });
    const page = await context.newPage();

    // ── Login page (no auth) ────────────────────────────────────────────
    console.log("  → Login page");
    if (await navigateAndWait(page, `${APP_URL}/login`)) {
      shots.set("login", await takeValidatedScreenshot(page, "login", { waitForText: "Sign In" }));
      console.log(`     ${shots.get("login") ? "✓" : "⚠"} login`);
    }

    // ── Inject auth ─────────────────────────────────────────────────────
    await injectAuth(page, token, ctx.orgId);

    // ── Dashboard ───────────────────────────────────────────────────────
    console.log("  → Dashboard");
    if (await navigateAndWait(page, `${APP_URL}/`)) {
      await page.waitForTimeout(2000);
      shots.set("dashboard", await takeValidatedScreenshot(page, "dashboard", {
        waitForText: "Dashboard",
        rejectText: ["Internal Company"],
      }));
      console.log(`     ${shots.get("dashboard") ? "✓" : "⚠"} dashboard`);
    }

    // ── Controls library ────────────────────────────────────────────────
    console.log("  → Controls library");
    if (await navigateAndWait(page, `${APP_URL}/controls`)) {
      // Wait longer for controls to fully load (API call can be slow on first load)
      await page.waitForTimeout(3500);
      // Re-check: if still showing loading/auth error, wait further
      const ctrlText = await page.evaluate<string>("document.body?.innerText ?? ''");
      if (!ctrlText.includes("AC.L1") && ctrlText.includes("Unauthorized")) {
        await page.reload({ waitUntil: "networkidle", timeout: 12000 }).catch(() => null);
        await page.waitForTimeout(3000);
      }
      shots.set("controls", await takeValidatedScreenshot(page, "controls", {
        waitForText: "AC.L1",
        rejectText: ["Internal Company"],
      }));
      console.log(`     ${shots.get("controls") ? "✓" : "⚠"} controls`);
    }

    // ── Control detail — multiple tab screenshots ────────────────────────
    console.log(`  → Control detail: ${ctx.bestControlId}`);
    const ctrlUrl = `${APP_URL}/controls/${ctx.bestControlUUID}`;
    if (await navigateAndWait(page, ctrlUrl)) {
      await page.waitForTimeout(2500);

      // Implementation tab (default)
      shots.set("ctrl_impl", await takeValidatedScreenshot(page, "ctrl_impl", {
        waitForText: ctx.bestControlId,
        rejectText: ["Control not found", "Internal Company"],
      }));
      console.log(`     ${shots.get("ctrl_impl") ? "✓" : "⚠"} implementation tab`);

      // Configure tab
      if (await clickTab(page, "Configure")) {
        shots.set("ctrl_configure", await takeValidatedScreenshot(page, "ctrl_configure", {
          rejectText: ["Control not found"],
        }));
        console.log(`     ${shots.get("ctrl_configure") ? "✓" : "⚠"} configure tab`);
      }

      // Evidence tab
      if (await clickTab(page, "Evidence")) {
        shots.set("ctrl_evidence", await takeValidatedScreenshot(page, "ctrl_evidence", {
          rejectText: ["Control not found"],
        }));
        console.log(`     ${shots.get("ctrl_evidence") ? "✓" : "⚠"} evidence tab`);
      }

      // Monitoring tab
      if (await clickTab(page, "Monitoring")) {
        shots.set("ctrl_monitoring", await takeValidatedScreenshot(page, "ctrl_monitoring", {
          rejectText: ["Control not found"],
        }));
        console.log(`     ${shots.get("ctrl_monitoring") ? "✓" : "⚠"} monitoring tab`);
      }

      // POA&M tab
      if (await clickTab(page, "POA")) {
        shots.set("ctrl_poam", await takeValidatedScreenshot(page, "ctrl_poam", {
          rejectText: ["Control not found"],
        }));
        console.log(`     ${shots.get("ctrl_poam") ? "✓" : "⚠"} poam tab`);
      }

      // SSP tab
      if (await clickTab(page, "SSP")) {
        shots.set("ctrl_ssp", await takeValidatedScreenshot(page, "ctrl_ssp", {
          rejectText: ["Control not found"],
        }));
        console.log(`     ${shots.get("ctrl_ssp") ? "✓" : "⚠"} ssp tab`);
      }
    } else {
      console.warn(`  ⚠  Could not load control detail: ${ctrlUrl}`);
    }

    // ── Evidence repository ────────────────────────────────────────────
    console.log("  → Evidence repository");
    if (await navigateAndWait(page, `${APP_URL}/evidence`)) {
      await page.waitForTimeout(2000);
      shots.set("evidence", await takeValidatedScreenshot(page, "evidence", {
        rejectText: ["Internal Company", "No evidence found"],
      }));
      console.log(`     ${shots.get("evidence") ? "✓" : "⚠"} evidence`);

      // ── Bulk Download wizard ──────────────────────────────────────────
      console.log("  → Bulk Download wizard");
      try {
        const bulkBtn = page.getByRole("button", { name: /bulk download/i });
        if (await bulkBtn.isVisible({ timeout: 3000 })) {
          await bulkBtn.click();
          await page.waitForTimeout(1500);
          shots.set("bulk_download_wizard", await takeValidatedScreenshot(page, "bulk_download_wizard", {
            waitForText: "Scope",
            rejectText: ["Internal Company"],
          }));
          console.log(`     ${shots.get("bulk_download_wizard") ? "✓" : "⚠"} bulk_download_wizard`);
          // Close wizard (press Escape) before continuing
          await page.keyboard.press("Escape");
          await page.waitForTimeout(500);
        } else {
          console.log("     ⚠  Bulk Download button not found — skipping");
        }
      } catch (e) {
        console.log("     ⚠  Bulk Download wizard screenshot failed — skipping");
      }
    }

    // ── Evidence detail ────────────────────────────────────────────────
    if (ctx.evidenceItemId) {
      console.log("  → Evidence detail");
      if (await navigateAndWait(page, `${APP_URL}/evidence/${ctx.evidenceItemId}`)) {
        await page.waitForTimeout(2000);
        shots.set("evidence_detail", await takeValidatedScreenshot(page, "evidence_detail", {
          rejectText: ["Internal Company", "not found"],
        }));
        console.log(`     ${shots.get("evidence_detail") ? "✓" : "⚠"} evidence detail`);
      }
    }

    // ── Documents ──────────────────────────────────────────────────────
    console.log("  → Documentation");
    if (await navigateAndWait(page, `${APP_URL}/documents/list`)) {
      await page.waitForTimeout(2000);
      shots.set("documents", await takeValidatedScreenshot(page, "documents", {
        rejectText: ["Internal Company"],
      }));
      console.log(`     ${shots.get("documents") ? "✓" : "⚠"} documents`);
    }

    // ── Monitoring tracker ─────────────────────────────────────────────
    console.log("  → Monitoring tracker");
    if (await navigateAndWait(page, `${APP_URL}/monitoring`)) {
      await page.waitForTimeout(2000);
      shots.set("monitoring", await takeValidatedScreenshot(page, "monitoring", {
        rejectText: ["Internal Company"],
      }));
      console.log(`     ${shots.get("monitoring") ? "✓" : "⚠"} monitoring`);
    }

    // ── POA&Ms ─────────────────────────────────────────────────────────
    console.log("  → POA&M register");
    if (await navigateAndWait(page, `${APP_URL}/poams`)) {
      await page.waitForTimeout(2000);
      shots.set("poams", await takeValidatedScreenshot(page, "poams", {
        rejectText: ["Internal Company"],
      }));
      console.log(`     ${shots.get("poams") ? "✓" : "⚠"} poams`);
    }

    const captured = [...shots.values()].filter(Boolean).length;
    console.log(`\n  📷 ${captured} / ${shots.size} screenshots captured`);

    // ── Build HTML ─────────────────────────────────────────────────────
    console.log("\n📄 Building guide HTML...");
    const html = buildGuideHtml(shots, ctx);
    const tmpHtml = path.join(os.tmpdir(), `assessor-guide-${Date.now()}.html`);
    fs.writeFileSync(tmpHtml, html, "utf8");

    // ── Export PDF ─────────────────────────────────────────────────────
    console.log("🖨  Generating PDF...");
    const pdfPage = await context.newPage();
    await pdfPage.goto(`file://${tmpHtml}`, { waitUntil: "networkidle", timeout: 30000 });
    await pdfPage.waitForTimeout(800);

    await pdfPage.pdf({
      path: OUTPUT_PDF,
      format: "Letter",
      printBackground: true,
      margin: { top: "0.6in", bottom: "0.65in", left: "0.8in", right: "0.8in" },
      displayHeaderFooter: true,
      headerTemplate: `<div style="font-size:7pt;color:#94a3b8;width:100%;text-align:right;padding-right:0.8in;padding-top:4px;">
        ${VTCCORP_ORG_NAME} — Control HUB Assessor User Guide
      </div>`,
      footerTemplate: `<div style="font-size:7pt;color:#94a3b8;width:100%;display:flex;justify-content:space-between;padding:0 0.8in 4px;">
        <span>Confidential — Authorized Assessor Use Only</span>
        <span>Page <span class="pageNumber"></span> of <span class="totalPages"></span></span>
      </div>`,
    });

    fs.unlinkSync(tmpHtml);

    const stats = fs.statSync(OUTPUT_PDF);
    const sizeMb = (stats.size / 1024 / 1024).toFixed(2);

    console.log("\n" + "═".repeat(52));
    console.log("✅ Guide generated successfully!");
    console.log("═".repeat(52));
    console.log(`\n📄 File:  ${OUTPUT_PDF}`);
    console.log(`📦 Size:  ${sizeMb} MB`);
    console.log(`\n📂 Replit file tree → generated-guides/ → right-click → Download\n`);
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error("\n❌ Guide generation failed:", err);
  process.exit(1);
});
