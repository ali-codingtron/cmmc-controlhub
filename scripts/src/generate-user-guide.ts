/**
 * Control HUB — Complete User Guide Generator
 *
 * Generates a professional PDF user guide covering all non-admin functionality.
 * Saves to /generated-guides/Control_HUB_Complete_User_Guide.pdf
 *
 * Usage:
 *   pnpm generate:user-guide                  (from workspace root)
 *   pnpm --filter @workspace/scripts run generate:user-guide
 *
 * Prerequisites: api-server and cmmc-app workflows must be running.
 */

import { chromium, type Page } from "playwright";
import jwt from "jsonwebtoken";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import os from "os";
import pg from "pg";

// ─── Paths & constants ──────────────────────────────────────────────────────

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const WORKSPACE_ROOT = path.resolve(__dirname, "..", "..");
const OUTPUT_DIR = path.join(WORKSPACE_ROOT, "generated-guides");
const PDF_FILENAME = "Control_HUB_Complete_User_Guide.pdf";
const OUTPUT_PDF = path.join(OUTPUT_DIR, PDF_FILENAME);

const JWT_SECRET =
  process.env.SESSION_SECRET ?? "cmmc-dev-secret-change-in-prod";
const APP_URL = process.env.GUIDE_APP_URL ?? "http://localhost:80";
const DATABASE_URL = process.env.DATABASE_URL ?? "";

const GUIDE_VERSION = "1.0";
const GENERATED_DATE = new Date().toLocaleDateString("en-US", {
  year: "numeric",
  month: "long",
  day: "numeric",
});

// Apex Defense LLC — stable seeded org
const APEX_ORG = {
  id: "ce9886b3-34e0-4c93-a380-b444aa2ab459",
  name: "Apex Defense LLC",
};

// sarah@apex-defense.com — compliance_manager, no MFA
const GUIDE_USER = {
  id: "e8b007f2-f6d7-488d-ae36-e6303ddea202",
  name: "Sarah Mitchell",
  email: "sarah@apex-defense.com",
  role: "compliance_manager",
};

// Control UUIDs (stable, seeded from cmmc-controls.json)
const CONTROLS: Record<string, string> = {
  "AC.L1-3.1.1": "1d7500de-45f5-4004-b2b3-33deb3472032",
  "AC.L1-3.1.2": "02892d24-ee0f-45d8-911a-f9ff9248ce93",
  "AU.L2-3.3.1": "4c80acb5-8d5e-411e-b2e5-7ebd78762f88",
  "CM.L2-3.4.1": "eed39b06-3952-4702-bbcc-de5f70302110",
  "IA.L2-3.5.3": "4732e6a7-5834-47ae-9e46-ff230a003f5f",
  "IR.L2-3.6.1": "8372bab3-3cdf-4e3d-a85c-9775710bf4b4",
  "RA.L2-3.11.2": "c3eacda0-91cd-47b8-a9aa-1991b7766d9f",
  "SI.L1-3.14.1": "b1b63bb2-1c51-476a-b656-36d64b0cda23",
};

// ─── DB seeding ─────────────────────────────────────────────────────────────

interface SeedResult {
  bestControlId: string;
  bestControlUUID: string;
  evidenceItemId: string;
}

async function seedApexData(): Promise<SeedResult> {
  if (!DATABASE_URL) throw new Error("DATABASE_URL not set");
  const pool = new pg.Pool({ connectionString: DATABASE_URL });

  try {
    console.log("\n🗄  Seeding Apex Defense LLC data for screenshots...");

    // 1. Seed control assessments
    const assessments = [
      {
        controlId: "AC.L1-3.1.1",
        uuid: CONTROLS["AC.L1-3.1.1"],
        status: "implemented" as const,
        narrative:
          "Apex Defense LLC manages authorized system access through Microsoft Azure Active Directory. " +
          "All user accounts require multi-factor authentication enforced via Conditional Access Policies. " +
          "Access is provisioned through a formal request and approval workflow. " +
          "Privileged accounts are managed separately with just-in-time access via Azure PIM. " +
          "Quarterly access reviews are conducted by the IT Security team.",
      },
      {
        controlId: "AC.L1-3.1.2",
        uuid: CONTROLS["AC.L1-3.1.2"],
        status: "implemented",
        narrative:
          "Apex Defense enforces role-based access control across all information systems. " +
          "Users are granted access based on least privilege principles aligned to their job function. " +
          "Separation of duties is enforced for critical functions. Access roles are reviewed semi-annually.",
      },
      {
        controlId: "IA.L2-3.5.3",
        uuid: CONTROLS["IA.L2-3.5.3"],
        status: "implemented",
        narrative:
          "Multi-factor authentication is required for all users accessing CUI systems. " +
          "MFA is enforced through Azure AD Conditional Access Policies requiring authenticator app (TOTP) " +
          "or hardware FIDO2 security keys for privileged access.",
      },
      {
        controlId: "SI.L1-3.14.1",
        uuid: CONTROLS["SI.L1-3.14.1"],
        status: "implemented",
        narrative:
          "Apex Defense deploys Microsoft Defender for Endpoint on all managed workstations and servers. " +
          "Anti-malware signatures are updated automatically via Microsoft Defender cloud protection. " +
          "Endpoint scans are performed daily with results collected in Microsoft Sentinel SIEM.",
      },
      {
        controlId: "CM.L2-3.4.1",
        uuid: CONTROLS["CM.L2-3.4.1"],
        status: "in_progress",
        narrative:
          "Configuration baselines for Windows endpoints are documented and enforced via Microsoft Intune. " +
          "Linux server baselines are partially configured — remediation in progress per POAM-2026-003.",
      },
      {
        controlId: "AU.L2-3.3.1",
        uuid: CONTROLS["AU.L2-3.3.1"],
        status: "not_started",
        narrative: "",
      },
      {
        controlId: "IR.L2-3.6.1",
        uuid: CONTROLS["IR.L2-3.6.1"],
        status: "implemented",
        narrative:
          "An Incident Response Plan is maintained and reviewed annually. Tabletop exercises are conducted " +
          "semi-annually. All personnel complete incident response awareness training annually.",
      },
    ];

    for (const a of assessments) {
      const existing = await pool.query(
        `SELECT id FROM control_assessments WHERE control_id=$1 AND organization_id=$2 LIMIT 1`,
        [a.uuid, APEX_ORG.id]
      );
      if (existing.rows.length === 0) {
        await pool.query(
          `INSERT INTO control_assessments
             (id, control_id, organization_id, status, implementation_narrative,
              last_assessed_at, assessed_by_id, created_at, updated_at)
           VALUES (gen_random_uuid(),$1,$2,$3::control_status,$4,now(),$5,now(),now())`,
          [a.uuid, APEX_ORG.id, a.status, a.narrative || null, GUIDE_USER.id]
        );
      } else if (a.narrative) {
        await pool.query(
          `UPDATE control_assessments SET status=$3::control_status, implementation_narrative=$4
           WHERE control_id=$1 AND organization_id=$2`,
          [a.uuid, APEX_ORG.id, a.status, a.narrative]
        );
      }
    }
    console.log(`   ✓ ${assessments.length} control assessments seeded`);

    // 2. Seed evidence items
    const evidenceSeeds = [
      {
        title: "Access Control Policy — v3.1",
        type: "policy",
        status: "approved",
        description:
          "Formal Access Control Policy establishing requirements for user account management, " +
          "role-based access, and privileged account controls at Apex Defense LLC.",
        summary:
          "Policy document covering authorized access, least privilege, and periodic review requirements. Approved by CISO.",
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
        summary: "Visual evidence of MFA enforcement in Azure Active Directory.",
        tags: ["MFA", "Azure-AD", "identity", "CMMC-L2"],
        controlUUID: CONTROLS["IA.L2-3.5.3"],
        collectedAt: new Date("2026-02-10"),
        expiresAt: new Date("2027-02-10"),
      },
      {
        title: "Endpoint Protection — Defender Configuration Report Q1 2026",
        type: "report",
        status: "assessor_ready",
        description:
          "Microsoft Defender for Endpoint quarterly configuration and compliance report.",
        summary:
          "100% endpoint coverage with Defender for Endpoint. Signature age <4 hours. Reviewed by IT Security.",
        tags: ["endpoint-protection", "anti-malware", "defender", "CMMC-L1"],
        controlUUID: CONTROLS["SI.L1-3.14.1"],
        collectedAt: new Date("2026-03-01"),
        expiresAt: new Date("2026-09-01"),
      },
      {
        title: "User Access Review Matrix — Q2 2026",
        type: "access_review",
        status: "approved",
        description: "Quarterly user access review documenting all active accounts and access levels.",
        summary: "Access matrix verified by HR and IT. 87 active accounts reviewed. 3 removed.",
        tags: ["RBAC", "access-review", "quarterly"],
        controlUUID: CONTROLS["AC.L1-3.1.2"],
        collectedAt: new Date("2026-04-30"),
        expiresAt: new Date("2027-04-30"),
      },
      {
        title: "Vulnerability Scan — Internal Network Q1 2026",
        type: "scan_report",
        status: "approved",
        description: "Authenticated vulnerability scan against all internal systems.",
        summary: "4 medium vulnerabilities identified. All remediated within 30 days.",
        tags: ["vulnerability-scan", "RA", "quarterly"],
        controlUUID: CONTROLS["RA.L2-3.11.2"],
        collectedAt: new Date("2026-03-15"),
        expiresAt: new Date("2026-06-15"),
      },
      {
        title: "Incident Response Plan — v2.0",
        type: "policy",
        status: "approved",
        description: "Formal Incident Response Plan approved by executive leadership.",
        summary: "IRP reviewed and updated April 2026. Tabletop exercise completed.",
        tags: ["incident-response", "IR", "policy"],
        controlUUID: CONTROLS["IR.L2-3.6.1"],
        collectedAt: new Date("2026-04-01"),
        expiresAt: new Date("2027-04-01"),
      },
    ];

    let firstEvidenceId = "";
    for (const e of evidenceSeeds) {
      const existing = await pool.query<{ id: string }>(
        `SELECT id FROM evidence_items WHERE organization_id=$1 AND title=$2 LIMIT 1`,
        [APEX_ORG.id, e.title]
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
           VALUES (gen_random_uuid(),$1,$2,$3::evidence_type,$4::evidence_status,
                   '1.0',$5,$6,$7,$8,$9,true,$10,now(),now())
           RETURNING id`,
          [
            e.title, e.description, e.type, e.status, e.tags,
            GUIDE_USER.id, e.collectedAt, e.expiresAt, e.summary, APEX_ORG.id,
          ]
        );
        evidenceId = ins.rows[0].id;
        const existingLink = await pool.query(
          `SELECT 1 FROM evidence_control_links WHERE evidence_id=$1 AND control_id=$2 LIMIT 1`,
          [evidenceId, e.controlUUID]
        );
        if (existingLink.rows.length === 0) {
          await pool.query(
            `INSERT INTO evidence_control_links (id, evidence_id, control_id, linked_at, linked_by_id)
             VALUES (gen_random_uuid(),$1,$2,now(),$3)`,
            [evidenceId, e.controlUUID, GUIDE_USER.id]
          );
        }
      }
      if (!firstEvidenceId) firstEvidenceId = evidenceId;
    }
    console.log(`   ✓ ${evidenceSeeds.length} evidence items seeded`);

    // 3. Seed POA&M items
    const poamCount = await pool.query<{ count: string }>(
      `SELECT COUNT(*) as count FROM poams WHERE organization_id=$1`,
      [APEX_ORG.id]
    );
    if (parseInt(poamCount.rows[0].count) === 0) {
      const due60 = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000);
      const due90 = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000);
      await pool.query(
        `INSERT INTO poams
           (id, organization_id, poam_number, title, deficiency_description,
            status, risk_level, linked_control_id, scheduled_completion_date,
            remediation_plan, owner_id, created_at, updated_at)
         VALUES
           (gen_random_uuid(),$1,'POAM-2026-001',
            'Audit Log Review — SIEM Not Fully Configured',
            'Centralized SIEM (Microsoft Sentinel) is deployed but log ingestion from 3 legacy servers ' ||
            'is not yet configured. Audit logs for those systems are reviewed manually on a weekly basis.',
            'in_progress','medium',$2,$3,
            'Phase 1: Install Log Analytics agent on legacy servers. Phase 2: Configure ingestion rules. ' ||
            'Phase 3: Validate log completeness. Target completion Q3 2026.',
            $4,now(),now()),
           (gen_random_uuid(),$1,'POAM-2026-002',
            'Linux Server Configuration Baseline — Partial Coverage',
            'CIS Benchmark Level 1 configuration baseline is applied to Windows endpoints via Intune. ' ||
            'Linux server baselines are documented but automated enforcement is not yet deployed.',
            'open','low',$5,$6,
            'Evaluate Ansible playbooks for Linux baseline enforcement. Pilot on 2 servers by end of Q2 2026.',
            $4,now(),now())`,
        [APEX_ORG.id, CONTROLS["AU.L2-3.3.1"], due60, GUIDE_USER.id, CONTROLS["CM.L2-3.4.1"], due90]
      );
      console.log(`   ✓ 2 POA&M items seeded`);
    } else {
      console.log(`   ✓ POA&M items already exist`);
    }

    console.log(`   ✓ Apex Defense LLC seeding complete`);
    return {
      bestControlId: "AC.L1-3.1.1",
      bestControlUUID: CONTROLS["AC.L1-3.1.1"],
      evidenceItemId: firstEvidenceId,
    };
  } finally {
    await pool.end();
  }
}

// ─── Auth ───────────────────────────────────────────────────────────────────

function generateToken(): string {
  return jwt.sign(GUIDE_USER, JWT_SECRET, { expiresIn: "2h" });
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

async function navigateAndWait(page: Page, url: string, timeout = 16000): Promise<boolean> {
  try {
    await page.goto(url, { waitUntil: "networkidle", timeout });
    await page.waitForTimeout(1800);
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

const GLOBAL_REJECT = [
  "Internal Company",
  "CarmeTechnology Demo",
  "Demo Mode",
  "401 Unauthorized",
  "Page Not Found",
];

async function takeValidatedScreenshot(
  page: Page,
  label: string,
  {
    waitForText,
    rejectText = [],
    clip,
  }: {
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
    for (const pat of [...GLOBAL_REJECT, ...rejectText]) {
      if (bodyText.includes(pat)) {
        console.warn(`  ⚠  Screenshot rejected (found "${pat}"): ${label}`);
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
    const tab = page
      .locator(`[role="tab"]`)
      .filter({ hasText: new RegExp(tabText, "i") })
      .first();
    if (await tab.isVisible({ timeout: 3000 })) {
      await tab.click();
      await page.waitForTimeout(1500);
      return true;
    }
  } catch {}
  return false;
}

// ─── HTML helpers ────────────────────────────────────────────────────────────

function imgTag(b64: string, alt: string, caption: string): string {
  if (!b64)
    return `<div class="screenshot-placeholder"><span class="placeholder-text">[${caption}]</span></div>`;
  return `<figure class="screenshot-figure">
  <img src="data:image/png;base64,${b64}" alt="${alt}" class="screenshot"/>
  <figcaption>${caption}</figcaption>
</figure>`;
}

function infoBox(
  type: "info" | "warn" | "tip",
  title: string,
  body: string
): string {
  return `<div class="info-box ${type === "info" ? "" : type}">
  <div class="ib-title">${title}</div>
  <p>${body}</p>
</div>`;
}

function stepList(steps: Array<{ title: string; detail: string }>): string {
  return `<ol class="step-list">${steps
    .map(
      (s, i) =>
        `<li><span class="step-num">${i + 1}</span><span class="step-content"><span class="step-title">${s.title}</span>${s.detail}</span></li>`
    )
    .join("\n")}</ol>`;
}

function statusTable(
  rows: Array<{ status: string; color: string; desc: string }>
): string {
  return `<table>
  <thead><tr><th>Status</th><th>Meaning</th></tr></thead>
  <tbody>${rows
    .map(
      (r) =>
        `<tr><td><span class="badge b-${r.color}">${r.status}</span></td><td>${r.desc}</td></tr>`
    )
    .join("\n")}</tbody>
</table>`;
}

// ─── CSS ─────────────────────────────────────────────────────────────────────

const CSS = `
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
html { font-size: 10pt; }
body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif;
       color: #1a1a2e; line-height: 1.65; background: #fff; }

@page { size: Letter; margin: 0.65in 0.8in 0.75in 0.8in; }
@page :first { margin: 0; }

/* ── Cover ── */
.cover { page-break-after: always; display: flex; flex-direction: column;
         min-height: 10.5in;
         background: linear-gradient(155deg, #0f172a 0%, #1e3a5f 55%, #0f3460 100%);
         color: #fff; }
.cover-top { background: #1e40af; padding: 18px 60px; display: flex; align-items: center; gap: 14px; }
.cover-logo { font-size: 22px; font-weight: 800; letter-spacing: -0.5px; }
.cover-logo span { color: #60a5fa; }
.cover-divider { color: rgba(255,255,255,0.3); font-size: 20px; }
.cover-vendor { font-size: 11pt; color: #93c5fd; }
.cover-body { flex: 1; display: flex; flex-direction: column; justify-content: center; padding: 64px 60px 40px; }
.cover-badge { display: inline-block; background: rgba(96,165,250,0.18);
  border: 1px solid rgba(96,165,250,0.4); color: #93c5fd; padding: 5px 16px;
  border-radius: 20px; font-size: 8.5pt; text-transform: uppercase; letter-spacing: 1.2px; margin-bottom: 26px; }
.cover-title { font-size: 34pt; font-weight: 800; line-height: 1.1; margin-bottom: 10px; }
.cover-subtitle { font-size: 16pt; color: #93c5fd; font-weight: 400; margin-bottom: 44px; }
.cover-meta { display: flex; gap: 44px; }
.cover-meta-label { font-size: 7.5pt; color: #94a3b8; text-transform: uppercase; letter-spacing: 1px; }
.cover-meta-value { font-size: 11pt; color: #e2e8f0; font-weight: 500; margin-top: 3px; }
.cover-bottom { padding: 24px 60px; border-top: 1px solid rgba(255,255,255,0.1);
  display: flex; justify-content: space-between; align-items: center; }
.cover-confidential { font-size: 9pt; color: #94a3b8; display: flex; align-items: center; gap: 7px; }
.conf-dot { width: 6px; height: 6px; border-radius: 50%; background: #f59e0b; }

/* ── TOC ── */
.toc-page { page-break-after: always; }
.toc-title { font-size: 22pt; font-weight: 700; color: #0f172a;
  border-bottom: 3px solid #1e40af; padding-bottom: 10px; margin-bottom: 24px; }
.toc-entry { display: flex; justify-content: space-between;
  padding: 5px 0; border-bottom: 1px dotted #e2e8f0; font-size: 9.5pt; }
.toc-entry.main { font-weight: 600; color: #1e3a5f; margin-top: 6px; }
.toc-entry.sub { padding-left: 22px; color: #475569; font-size: 9pt; }
.toc-pn { color: #64748b; font-size: 9pt; white-space: nowrap; }

/* ── Section headers ── */
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
.b-orange { background: #ffedd5; color: #c2410c; }

/* ── Screenshots ── */
.screenshot-figure { margin: 14px 0; page-break-inside: avoid;
  border: 1px solid #e2e8f0; border-radius: 7px; overflow: hidden;
  box-shadow: 0 1px 4px rgba(0,0,0,0.08); }
.screenshot { width: 100%; height: auto; display: block; }
figcaption { font-size: 8pt; color: #64748b; padding: 6px 12px;
  background: #f8fafc; border-top: 1px solid #e2e8f0; font-style: italic; }
.screenshot-placeholder { background: #f1f5f9; border: 2px dashed #cbd5e1;
  border-radius: 7px; padding: 36px; text-align: center; margin: 14px 0; }
.placeholder-text { color: #94a3b8; font-size: 9pt; }

/* ── Step list ── */
.step-list { list-style: none; margin: 10px 0; padding: 0; }
.step-list li { display: flex; align-items: flex-start; gap: 11px;
  padding: 8px 0; border-bottom: 1px solid #f1f5f9; }
.step-num { min-width: 26px; height: 26px; border-radius: 50%;
  background: #1e40af; color: #fff; font-weight: 700; font-size: 9.5pt;
  display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
.step-content { font-size: 10pt; color: #334155; }
.step-title { font-weight: 600; color: #0f172a; display: block; margin-bottom: 2px; }

/* ── Workflow block ── */
.workflow-block { background: #f8fafc; border: 1px solid #e2e8f0;
  border-radius: 9px; padding: 18px 22px; margin: 14px 0; page-break-inside: avoid; }
.workflow-title { font-size: 11pt; font-weight: 700; color: #1e3a5f; margin-bottom: 10px;
  padding-bottom: 7px; border-bottom: 2px solid #bfdbfe; }

/* ── Filename examples ── */
.filename-example { font-family: 'Courier New', monospace; font-size: 8.5pt;
  background: #1e293b; color: #7dd3fc; padding: 2px 8px; border-radius: 4px;
  display: inline-block; margin: 2px 0; }
.filename-block { background: #0f172a; border-radius: 7px; padding: 12px 16px; margin: 10px 0; }
.filename-block .filename-example { background: transparent; display: block; margin: 2px 0; }

/* ── Page break ── */
.page-break { page-break-before: always; }
.avoid-break { page-break-inside: avoid; }
hr { border: none; border-top: 1px solid #e2e8f0; margin: 22px 0; }
`;

// ─── Guide HTML builder ──────────────────────────────────────────────────────

function buildGuideHtml(shots: Map<string, string>): string {
  const s = (key: string) => shots.get(key) ?? "";

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<title>Control HUB — Complete User Guide</title>
<style>${CSS}</style>
</head>
<body>

<!-- ═══════════════════════════════════════════════════════ COVER ═══ -->
<div class="cover">
  <div class="cover-top">
    <div class="cover-logo">Control<span> HUB</span></div>
    <div class="cover-divider">|</div>
    <div class="cover-vendor">Carme Technology</div>
  </div>
  <div class="cover-body">
    <div class="cover-badge">Complete User Guide</div>
    <div class="cover-title">Control HUB<br/>User Guide</div>
    <div class="cover-subtitle">CMMC Compliance Readiness &amp; Evidence Management Platform</div>
    <div class="cover-meta">
      <div><div class="cover-meta-label">Version</div><div class="cover-meta-value">${GUIDE_VERSION}</div></div>
      <div><div class="cover-meta-label">Generated</div><div class="cover-meta-value">${GENERATED_DATE}</div></div>
      <div><div class="cover-meta-label">Prepared By</div><div class="cover-meta-value">Carme Technology</div></div>
      <div><div class="cover-meta-label">Application</div><div class="cover-meta-value">Control HUB</div></div>
    </div>
  </div>
  <div class="cover-bottom">
    <div class="cover-confidential"><span class="conf-dot"></span>Confidential — Authorized Users Only</div>
    <div style="font-size:9pt;color:#94a3b8;">info@carmetechnology.com</div>
  </div>
</div>

<!-- ═══════════════════════════════════════════════════════ TOC ═══ -->
<div class="toc-page">
  <div class="toc-title">Table of Contents</div>
  <div class="toc-entry main"><span>1 — Introduction &amp; Purpose</span><span class="toc-pn">3</span></div>
  <div class="toc-entry main"><span>2 — System Overview</span><span class="toc-pn">3</span></div>
  <div class="toc-entry main"><span>3 — User Roles and Permissions</span><span class="toc-pn">4</span></div>
  <div class="toc-entry main"><span>4 — Logging In</span><span class="toc-pn">5</span></div>
  <div class="toc-entry sub"><span>4.1 Email and Password Login</span><span class="toc-pn">5</span></div>
  <div class="toc-entry sub"><span>4.2 Multi-Factor Authentication (MFA)</span><span class="toc-pn">6</span></div>
  <div class="toc-entry sub"><span>4.3 Password Reset</span><span class="toc-pn">6</span></div>
  <div class="toc-entry main"><span>5 — Organization Selection</span><span class="toc-pn">6</span></div>
  <div class="toc-entry main"><span>6 — Compliance Dashboard</span><span class="toc-pn">7</span></div>
  <div class="toc-entry main"><span>7 — Controls Library</span><span class="toc-pn">8</span></div>
  <div class="toc-entry main"><span>8 — Control Detail</span><span class="toc-pn">9</span></div>
  <div class="toc-entry sub"><span>8.1 Implementation Tab</span><span class="toc-pn">9</span></div>
  <div class="toc-entry sub"><span>8.2 Configure Tab</span><span class="toc-pn">10</span></div>
  <div class="toc-entry sub"><span>8.3 Evidence Tab</span><span class="toc-pn">10</span></div>
  <div class="toc-entry sub"><span>8.4 Monitoring Tab</span><span class="toc-pn">11</span></div>
  <div class="toc-entry sub"><span>8.5 Plan of Action &amp; Milestones (POA&amp;M) Tab</span><span class="toc-pn">11</span></div>
  <div class="toc-entry sub"><span>8.6 SSP Tab</span><span class="toc-pn">12</span></div>
  <div class="toc-entry main"><span>9 — Evidence Repository</span><span class="toc-pn">13</span></div>
  <div class="toc-entry main"><span>10 — Uploading Evidence</span><span class="toc-pn">14</span></div>
  <div class="toc-entry main"><span>11 — Previewing and Downloading Evidence</span><span class="toc-pn">15</span></div>
  <div class="toc-entry main"><span>12 — Bulk Download</span><span class="toc-pn">16</span></div>
  <div class="toc-entry main"><span>13 — Documentation</span><span class="toc-pn">17</span></div>
  <div class="toc-entry sub"><span>13.1 All Documents</span><span class="toc-pn">17</span></div>
  <div class="toc-entry sub"><span>13.2 Template Library</span><span class="toc-pn">18</span></div>
  <div class="toc-entry sub"><span>13.3 Gap Analysis</span><span class="toc-pn">18</span></div>
  <div class="toc-entry main"><span>14 — Monitoring Tracker</span><span class="toc-pn">19</span></div>
  <div class="toc-entry main"><span>15 — Plan of Action and Milestones (POA&amp;M)</span><span class="toc-pn">20</span></div>
  <div class="toc-entry main"><span>16 — Implementation Roadmap</span><span class="toc-pn">21</span></div>
  <div class="toc-entry main"><span>17 — Pre-Assessment</span><span class="toc-pn">22</span></div>
  <div class="toc-entry main"><span>18 — Reports</span><span class="toc-pn">23</span></div>
  <div class="toc-entry main"><span>19 — Help Center</span><span class="toc-pn">24</span></div>
  <div class="toc-entry main"><span>20 — End-to-End Workflows</span><span class="toc-pn">25</span></div>
  <div class="toc-entry sub"><span>Workflow 1: New Organization Readiness Review</span><span class="toc-pn">25</span></div>
  <div class="toc-entry sub"><span>Workflow 2: Control Review</span><span class="toc-pn">25</span></div>
  <div class="toc-entry sub"><span>Workflow 3: Evidence Upload</span><span class="toc-pn">26</span></div>
  <div class="toc-entry sub"><span>Workflow 4: Monthly Monitoring</span><span class="toc-pn">26</span></div>
  <div class="toc-entry sub"><span>Workflow 5: POA&amp;M Remediation</span><span class="toc-pn">27</span></div>
  <div class="toc-entry sub"><span>Workflow 6: C3PAO Assessment Preparation</span><span class="toc-pn">27</span></div>
  <div class="toc-entry main"><span>21 — Troubleshooting</span><span class="toc-pn">28</span></div>
  <div class="toc-entry main"><span>22 — Glossary</span><span class="toc-pn">29</span></div>
  <div class="toc-entry main"><span>23 — Version and Contact Information</span><span class="toc-pn">30</span></div>
</div>

<!-- ═══ §1 Introduction ═══ -->
<div class="section page-break">
  <div class="section-header">
    <div class="section-num">Section 1</div>
    <div class="section-title">Introduction &amp; Purpose</div>
  </div>
  <p><strong>Control HUB</strong> is the CMMC Compliance Readiness &amp; Evidence Management Platform developed by <strong>Carme Technology</strong>. It is designed to help Defense Industrial Base (DIB) contractors and managed service providers (MSPs) achieve and demonstrate Cybersecurity Maturity Model Certification (CMMC) compliance across all 110 Level 2 controls.</p>
  <p>This guide covers all non-administrative functionality available to compliance managers, reviewers, assessors, and members. It provides step-by-step instructions for every major module, from the Compliance Dashboard through Evidence Management, Documentation, Monitoring, POA&amp;M, the Implementation Roadmap, Pre-Assessment, and Reports.</p>
  ${infoBox("info", "📋 Audience", "This guide is written for compliance managers, compliance reviewers, IT contributors, and leadership staff. It does not cover system administration functions such as user creation, organization management, or security configuration.")}
  <p>For technical support, contact Carme Technology at <strong>info@carmetechnology.com</strong>.</p>
</div>

<!-- ═══ §2 System Overview ═══ -->
<div class="section">
  <div class="section-header">
    <div class="section-num">Section 2</div>
    <div class="section-title">System Overview</div>
  </div>
  <p>Control HUB is a <strong>multi-tenant, cloud-hosted</strong> platform. Each organization has fully isolated data. All access is authenticated and role-controlled. The platform covers:</p>
  <table>
    <thead><tr><th>Module</th><th>Purpose</th></tr></thead>
    <tbody>
      <tr><td><strong>Compliance Dashboard</strong></td><td>Executive readiness overview — KPI cards, domain progress, activity timeline, overdue items</td></tr>
      <tr><td><strong>Controls Library</strong></td><td>All 110 CMMC L2 controls with assessment status, implementation narratives, and evidence links</td></tr>
      <tr><td><strong>Evidence Repository</strong></td><td>Central repository of all evidence items with search, filter, preview, and bulk download</td></tr>
      <tr><td><strong>Documentation</strong></td><td>Policies, procedures, generated documents, and a CMMC-mapped template library</td></tr>
      <tr><td><strong>Monitoring Tracker</strong></td><td>19 recurring operational activities with frequency, status, and next-due tracking</td></tr>
      <tr><td><strong>POA&amp;M Register</strong></td><td>Plan of Action and Milestones for tracking and remediating known gaps</td></tr>
      <tr><td><strong>Implementation Roadmap</strong></td><td>Guided high-impact actions that group related work across multiple controls</td></tr>
      <tr><td><strong>Pre-Assessment</strong></td><td>Tenant-connected automated scan of Microsoft 365 / Entra ID configuration</td></tr>
      <tr><td><strong>Reports</strong></td><td>Executive and technical compliance reports for stakeholders and auditors</td></tr>
      <tr><td><strong>Help Center</strong></td><td>In-app user guide, FAQ, and support contact</td></tr>
    </tbody>
  </table>
  ${infoBox("tip", "💡 Multi-Tenancy", "If your organization manages multiple client environments, the organization switcher in the sidebar allows you to switch between organizations. All data — controls, evidence, monitoring — is fully isolated per organization.")}
</div>

<!-- ═══ §3 User Roles ═══ -->
<div class="section page-break">
  <div class="section-header">
    <div class="section-num">Section 3</div>
    <div class="section-title">User Roles and Permissions</div>
  </div>
  <p>Control HUB uses role-based access control. Your role determines which actions you can perform. The table below summarizes the primary non-administrative roles.</p>
  <table>
    <thead><tr><th>Role</th><th>Dashboard</th><th>Edit Controls</th><th>Manage Evidence</th><th>Approve Evidence</th><th>Edit Docs</th><th>Edit Monitoring</th><th>Edit POA&amp;Ms</th><th>Run Reports</th></tr></thead>
    <tbody>
      <tr><td><strong>Compliance Manager</strong></td><td>✓</td><td>✓</td><td>✓</td><td>✓</td><td>✓</td><td>✓</td><td>✓</td><td>✓</td></tr>
      <tr><td><strong>Reviewer</strong></td><td>✓</td><td>Read</td><td>Read</td><td>✓</td><td>Read</td><td>Read</td><td>Read</td><td>✓</td></tr>
      <tr><td><strong>IT Contributor / Member</strong></td><td>✓</td><td>Limited</td><td>Upload</td><td>—</td><td>Limited</td><td>✓</td><td>Limited</td><td>—</td></tr>
      <tr><td><strong>Assessor</strong></td><td>Read</td><td>Read</td><td>Read + Download</td><td>—</td><td>Read</td><td>Read</td><td>Read</td><td>—</td></tr>
    </tbody>
  </table>
  ${infoBox("warn", "⚠ Role Scope", "If a button or action is greyed out or missing, it is likely restricted by your role. Contact your organization administrator if you believe your role is incorrect.")}
  <div class="subsection">
    <div class="subsection-title">Role Descriptions</div>
    <ul>
      <li><strong>Compliance Manager</strong> — Full access to all compliance functions for the organization. Can edit controls, manage evidence lifecycle, approve/reject evidence, manage documents, update monitoring, and manage POA&amp;Ms.</li>
      <li><strong>Reviewer</strong> — Can review and approve evidence and documents, but cannot edit control assessments or perform bulk operations.</li>
      <li><strong>IT Contributor / Member</strong> — Can upload evidence and update monitoring items. Cannot approve evidence or generate reports.</li>
      <li><strong>Assessor</strong> — Read-only access to all compliance data. Can preview and download evidence. Cannot modify any records.</li>
    </ul>
  </div>
</div>

<!-- ═══ §4 Logging In ═══ -->
<div class="section">
  <div class="section-header">
    <div class="section-num">Section 4</div>
    <div class="section-title">Logging In</div>
  </div>

  <div class="subsection">
    <div class="subsection-title">4.1 Email and Password Login</div>
    ${imgTag(s("login"), "Login page", "Figure 4.1 — Control HUB login screen. Enter your email and password, then click Sign In.")}
    ${stepList([
      { title: "Navigate to Control HUB", detail: " — Open your browser and go to the URL provided by your administrator." },
      { title: "Enter your email address", detail: " — Type your organization-assigned email in the Email field." },
      { title: "Enter your password", detail: " — Type your password. Passwords are case-sensitive." },
      { title: "Click Sign In", detail: " — If credentials are correct, you are logged in. If MFA is required, you are prompted for a verification code." },
    ])}
    ${infoBox("warn", "⚠ First Login", "If this is your first login, your administrator will provide your initial password. You should change it immediately via Settings after first sign-in.")}
  </div>

  <div class="subsection">
    <div class="subsection-title">4.2 Multi-Factor Authentication (MFA)</div>
    <p>If your organization enforces MFA, you will be prompted for a 6-digit verification code after entering your password. Use your authenticator app (e.g., Microsoft Authenticator, Google Authenticator) to generate the code.</p>
    <ul>
      <li>Open your authenticator app and find the Control HUB entry.</li>
      <li>Enter the current 6-digit code displayed in the app.</li>
      <li>TOTP codes expire every 30 seconds — enter them promptly.</li>
      <li>After 5 failed attempts, your account is temporarily locked. Contact your administrator to unlock it.</li>
    </ul>
    ${infoBox("tip", "💡 Setting Up MFA", "If you need to set up MFA for the first time, navigate to Settings after logging in with your password. Your administrator can also require MFA at their discretion.")}
  </div>

  <div class="subsection">
    <div class="subsection-title">4.3 Password Reset</div>
    <p>If you have forgotten your password, contact your organization administrator to reset it. There is no self-service password reset link on the login page. Administrators can issue a new temporary password from the User Management panel.</p>
  </div>
</div>

<!-- ═══ §5 Organization Selection ═══ -->
<div class="section page-break">
  <div class="section-header">
    <div class="section-num">Section 5</div>
    <div class="section-title">Organization Selection</div>
  </div>
  ${imgTag(s("org_switcher"), "Organization switcher", "Figure 5.1 — Organization switcher in the left sidebar. Click to expand and select your active organization.")}
  <p>Control HUB supports multiple organizations. Your active organization is displayed at the bottom of the left sidebar. All data on screen — controls, evidence, monitoring — belongs to this organization.</p>
  <p><strong>To switch organizations:</strong></p>
  <ol>
    <li>Locate the organization name in the bottom-left sidebar area.</li>
    <li>Click the organization name to open the switcher dropdown.</li>
    <li>Select the desired organization from the list.</li>
    <li>The page refreshes and all data updates to reflect the selected organization.</li>
  </ol>
  ${infoBox("info", "📋 Organization Access", "You only see organizations you have been granted access to. If an organization is missing, contact your administrator.")}
  <p>Switching organizations clears all active filters and search terms. The new organization's data loads automatically.</p>
</div>

<!-- ═══ §6 Dashboard ═══ -->
<div class="section">
  <div class="section-header">
    <div class="section-num">Section 6</div>
    <div class="section-title">Compliance Dashboard</div>
  </div>
  ${imgTag(s("dashboard"), "Compliance Dashboard", "Figure 6.1 — The Compliance Dashboard provides an executive overview of your organization's CMMC readiness posture.")}
  <p>The Compliance Dashboard is the first page you see after login. It provides a real-time summary of your organization's CMMC readiness posture.</p>

  <div class="subsection">
    <div class="subsection-title">KPI Cards</div>
    <p>The top row of the dashboard displays six key performance indicator (KPI) cards:</p>
    <table>
      <thead><tr><th>Card</th><th>Description</th></tr></thead>
      <tbody>
        <tr><td><strong>Controls Implemented</strong></td><td>Number of controls marked Implemented or Partially Implemented out of 110 total</td></tr>
        <tr><td><strong>Evidence Items</strong></td><td>Total evidence items in the repository, with approved count highlighted</td></tr>
        <tr><td><strong>Active Policies</strong></td><td>Number of policy documents in Active or Approved status</td></tr>
        <tr><td><strong>Monitoring Overdue</strong></td><td>Monitoring items past their next-due date — red if any are overdue</td></tr>
        <tr><td><strong>Open POA&amp;Ms</strong></td><td>Number of open Plan of Action and Milestones items</td></tr>
        <tr><td><strong>Active Documents</strong></td><td>Total active procedures and records</td></tr>
      </tbody>
    </table>
  </div>

  <div class="subsection">
    <div class="subsection-title">Domain Readiness Chart</div>
    <p>The Domain Readiness section shows implementation progress across all 14 CMMC domains (e.g., Access Control, Audit and Accountability, Configuration Management). Each bar shows the percentage of controls in that domain that are Implemented or Partially Implemented.</p>
    <ul>
      <li><strong>Green</strong> — Control is Implemented (has an approved implementation narrative)</li>
      <li><strong>Yellow</strong> — Control is Partially Implemented</li>
      <li><strong>Gray</strong> — Control is Not Assessed or Not Implemented</li>
    </ul>
  </div>

  <div class="subsection">
    <div class="subsection-title">Activity Timeline</div>
    <p>The right panel of the dashboard shows recent activity — evidence uploads, control status changes, document updates, and user actions — sorted by date. This gives compliance managers a quick view of what has changed recently in the organization.</p>
  </div>

  <div class="subsection">
    <div class="subsection-title">Recommended Actions</div>
    <p>The dashboard may highlight recommended next actions such as overdue monitoring items, expiring evidence, and open POA&amp;Ms requiring attention. These are direct links to the relevant modules.</p>
  </div>
</div>

<!-- ═══ §7 Controls Library ═══ -->
<div class="section page-break">
  <div class="section-header">
    <div class="section-num">Section 7</div>
    <div class="section-title">Controls Library</div>
  </div>
  ${imgTag(s("controls"), "Controls Library", "Figure 7.1 — The Controls Library lists all 110 CMMC Level 2 controls with current assessment status, linked evidence count, and domain grouping.")}
  <p>The <strong>Controls Library</strong> is accessible from the sidebar under <em>Controls</em>. It displays all 110 CMMC Level 2 controls in a searchable, filterable table.</p>

  <div class="subsection">
    <div class="subsection-title">Columns</div>
    <table>
      <thead><tr><th>Column</th><th>Description</th></tr></thead>
      <tbody>
        <tr><td><strong>Control ID</strong></td><td>The CMMC control identifier (e.g., AC.L1-3.1.1)</td></tr>
        <tr><td><strong>Domain</strong></td><td>The CMMC domain (e.g., Access Control, Audit and Accountability)</td></tr>
        <tr><td><strong>Title</strong></td><td>Brief name of the control requirement</td></tr>
        <tr><td><strong>Status</strong></td><td>Current assessment status for your organization</td></tr>
        <tr><td><strong>Evidence</strong></td><td>Count of evidence items linked to this control</td></tr>
        <tr><td><strong>Level</strong></td><td>CMMC level (L1 or L2)</td></tr>
      </tbody>
    </table>
  </div>

  <div class="subsection">
    <div class="subsection-title">Searching and Filtering</div>
    <ul>
      <li><strong>Search box</strong> — Search by control ID, title, or keyword across all 110 controls</li>
      <li><strong>Domain filter</strong> — Filter by one or more CMMC domains</li>
      <li><strong>Status filter</strong> — Filter by assessment status (Implemented, Partially Implemented, Not Implemented, Not Assessed)</li>
      <li><strong>Level filter</strong> — Show only L1 or L2 controls</li>
    </ul>
  </div>

  <div class="subsection">
    <div class="subsection-title">Assessment Status Values</div>
    ${statusTable([
      { status: "Implemented", color: "green", desc: "Control requirement is fully met. Implementation narrative and evidence are present." },
      { status: "Partially Implemented", color: "yellow", desc: "Control is in progress or partially addressed. POA&M may be required." },
      { status: "Not Implemented", color: "red", desc: "Control has not been implemented. Remediation action is needed." },
      { status: "Not Assessed", color: "gray", desc: "Assessment has not been performed for this control yet." },
      { status: "Not Applicable", color: "purple", desc: "Control does not apply to this organization's environment." },
    ])}
    <p>Click any control row to open the <strong>Control Detail</strong> page for that control.</p>
  </div>
</div>

<!-- ═══ §8 Control Detail ═══ -->
<div class="section">
  <div class="section-header">
    <div class="section-num">Section 8</div>
    <div class="section-title">Control Detail</div>
  </div>
  ${imgTag(s("ctrl_impl"), "Control detail — Implementation tab", "Figure 8.1 — Control detail page showing the Implementation tab with the control requirement, assessment status, and implementation narrative.")}
  <p>Opening a control from the Controls Library loads the <strong>Control Detail</strong> page. This is the primary workspace for reviewing and documenting your compliance posture for a single control. The page has six tabs.</p>

  <!-- 8.1 Implementation -->
  <div class="subsection">
    <div class="subsection-title">8.1 Implementation Tab</div>
    ${imgTag(s("ctrl_impl"), "Control Implementation tab", "Figure 8.1 — Implementation tab showing the control requirement and narrative text.")}
    <p>The Implementation tab is the main view for a control. It contains:</p>
    <ul>
      <li><strong>Control ID and Domain</strong> — Identifier (e.g., AC.L1-3.1.1) and parent domain</li>
      <li><strong>CMMC Requirement</strong> — The verbatim CMMC requirement text from NIST SP 800-171</li>
      <li><strong>Assessment Status</strong> — Current status badge (Implemented, Partially Implemented, etc.)</li>
      <li><strong>Implementation Narrative</strong> — A free-text field where your team documents how the control is implemented in your environment. This is the primary artifact reviewers and assessors read.</li>
      <li><strong>Last Assessed</strong> — Date and user who last updated the control assessment</li>
    </ul>
    ${infoBox("tip", "💡 Writing Good Narratives", "Implementation narratives should explain <em>what</em> your organization does, <em>how</em>, and reference specific tools, policies, or processes. Generic or placeholder text will not satisfy a C3PAO assessor.")}
    <p>Compliance managers and reviewers can update the assessment status and implementation narrative using the edit controls on this tab. Changes are logged in the audit trail.</p>
  </div>

  <!-- 8.2 Configure -->
  <div class="subsection page-break">
    <div class="subsection-title">8.2 Configure Tab</div>
    ${imgTag(s("ctrl_configure"), "Control Configure tab", "Figure 8.2 — Configure tab with step-by-step implementation guidance for the control.")}
    <p>The <strong>Configure tab</strong> provides structured, step-by-step implementation guidance for the control. Each step represents a specific action or configuration your team should perform or verify.</p>
    <ul>
      <li>Each step has a <strong>title</strong>, <strong>description</strong>, and <strong>completion status</strong></li>
      <li>Steps can be marked as Complete, In Progress, or Blocked/Not Applicable</li>
      <li>The tab shows overall step completion progress for the control</li>
      <li>Steps are pre-populated from CMMC guidance — they serve as a structured implementation checklist</li>
    </ul>
    ${infoBox("info", "📋 Configure vs. Narrative", "The Configure tab tracks step-level completion. The Implementation tab narrative is where you write a summary statement for assessors. Both contribute to evidence of compliance.")}
  </div>

  <!-- 8.3 Evidence -->
  <div class="subsection">
    <div class="subsection-title">8.3 Evidence Tab</div>
    ${imgTag(s("ctrl_evidence"), "Control Evidence tab", "Figure 8.3 — Evidence tab showing evidence items linked to this control, with status badges and action buttons.")}
    <p>The <strong>Evidence tab</strong> shows all evidence items linked to this specific control. Evidence may also be linked to multiple controls simultaneously.</p>
    <p><strong>Columns:</strong> Title, Type, Status, Collected Date, Owner, Actions</p>
    <p><strong>Evidence statuses on this tab:</strong></p>
    ${statusTable([
      { status: "Draft", color: "gray", desc: "Evidence has been created but not yet submitted for review." },
      { status: "Pending Review", color: "yellow", desc: "Evidence has been submitted and is awaiting review approval." },
      { status: "Approved", color: "green", desc: "Evidence has been reviewed and approved by a Reviewer or Compliance Manager." },
      { status: "Active", color: "blue", desc: "Evidence is currently valid and in use." },
      { status: "Assessor Ready", color: "purple", desc: "Evidence is approved and marked specifically for assessor review." },
      { status: "Stale", color: "orange", desc: "Evidence has passed its review date and should be refreshed." },
      { status: "Archived", color: "gray", desc: "Evidence is archived and no longer active." },
    ])}
    <p>From this tab you can: <strong>preview</strong> the file, <strong>download</strong> it, see its linked controls, and (if your role permits) change its status or archive it.</p>
    <p>To add evidence to this control, click <strong>Add Evidence</strong> on the Evidence tab, or navigate to the Evidence Repository and link evidence from there.</p>
  </div>

  <!-- 8.4 Monitoring -->
  <div class="subsection page-break">
    <div class="subsection-title">8.4 Monitoring Tab</div>
    ${imgTag(s("ctrl_monitoring"), "Control Monitoring tab", "Figure 8.4 — Monitoring tab showing recurring operational monitoring items linked to this control.")}
    <p>The <strong>Monitoring tab</strong> shows any recurring monitoring items linked to this control from the Monitoring Tracker. These represent ongoing operational activities your team performs to demonstrate continuous compliance.</p>
    <table>
      <thead><tr><th>Field</th><th>Description</th></tr></thead>
      <tbody>
        <tr><td><strong>Task</strong></td><td>Name of the recurring monitoring activity</td></tr>
        <tr><td><strong>Frequency</strong></td><td>How often the task must be performed (Weekly, Monthly, Quarterly, Annually)</td></tr>
        <tr><td><strong>Last Completed</strong></td><td>Date the task was last marked complete</td></tr>
        <tr><td><strong>Next Due</strong></td><td>Calculated from Last Completed + Frequency</td></tr>
        <tr><td><strong>Status</strong></td><td>Open, In Progress, or Current</td></tr>
        <tr><td><strong>Notes</strong></td><td>Free-text notes recorded during the last completion</td></tr>
      </tbody>
    </table>
    <p>To update monitoring items, navigate to the <strong>Monitoring Tracker</strong> in the sidebar. See Section 14 for full details.</p>
  </div>

  <!-- 8.5 POA&M -->
  <div class="subsection">
    <div class="subsection-title">8.5 Plan of Action &amp; Milestones (POA&amp;M) Tab</div>
    ${imgTag(s("ctrl_poam"), "Control POA&M tab", "Figure 8.5 — POA&M tab showing remediation items linked to this control.")}
    <p>The <strong>POA&amp;M tab</strong> shows any Plan of Action and Milestones items linked to this control. A POA&amp;M represents a known gap or deficiency and tracks the remediation plan and timeline.</p>
    <table>
      <thead><tr><th>Field</th><th>Description</th></tr></thead>
      <tbody>
        <tr><td><strong>POA&amp;M Number</strong></td><td>Unique identifier (e.g., POAM-2026-001)</td></tr>
        <tr><td><strong>Title</strong></td><td>Short description of the deficiency</td></tr>
        <tr><td><strong>Risk Level</strong></td><td>High, Medium, or Low — indicates urgency</td></tr>
        <tr><td><strong>Status</strong></td><td>Open, In Progress, Pending Validation, or Closed</td></tr>
        <tr><td><strong>Owner</strong></td><td>Person responsible for remediation</td></tr>
        <tr><td><strong>Scheduled Completion</strong></td><td>Target date for remediation completion</td></tr>
        <tr><td><strong>Remediation Plan</strong></td><td>Description of the steps being taken to address the gap</td></tr>
      </tbody>
    </table>
    <p>To manage POA&amp;M items, navigate to the <strong>POA&amp;M Register</strong> in the sidebar. See Section 15 for full details.</p>
  </div>

  <!-- 8.6 SSP -->
  <div class="subsection page-break">
    <div class="subsection-title">8.6 SSP Tab</div>
    ${imgTag(s("ctrl_ssp"), "Control SSP tab", "Figure 8.6 — SSP tab displaying the System Security Plan narrative mapped to this control.")}
    <p>The <strong>SSP tab</strong> displays the System Security Plan (SSP) narrative for this control. The SSP narrative is the formal, organization-wide description of how the control is implemented.</p>
    <ul>
      <li><strong>SSP Narrative</strong> — The formal implementation description from the SSP document</li>
      <li><strong>Source SSP</strong> — Which SSP document this narrative comes from</li>
      <li><strong>Mapping</strong> — Shows how the SSP narrative maps to the CMMC requirement</li>
    </ul>
    ${infoBox("tip", "💡 SSP vs. Implementation Narrative", "The Implementation Narrative (Implementation tab) is your working description of what you do. The SSP Narrative is the formal statement from your System Security Plan. During C3PAO assessments, both should be consistent and aligned with your evidence.")}
    <p>Review the SSP tab to ensure alignment between your implementation narrative, the SSP content, and the evidence linked to the control. Discrepancies should be resolved before submitting for assessment.</p>
  </div>
</div>

<!-- ═══ §9 Evidence Repository ═══ -->
<div class="section">
  <div class="section-header">
    <div class="section-num">Section 9</div>
    <div class="section-title">Evidence Repository</div>
  </div>
  ${imgTag(s("evidence"), "Evidence Repository", "Figure 9.1 — The Evidence Repository lists all evidence items across the organization with search, filter, and action controls.")}
  <p>The <strong>Evidence Repository</strong> (accessed from the sidebar under <em>Evidence</em>) is the central location for all evidence items. Evidence items are linked to one or more CMMC controls and serve as proof that a control requirement is met.</p>

  <div class="subsection">
    <div class="subsection-title">Columns</div>
    <table>
      <thead><tr><th>Column</th><th>Description</th></tr></thead>
      <tbody>
        <tr><td><strong>Title</strong></td><td>Name of the evidence item</td></tr>
        <tr><td><strong>Type</strong></td><td>Evidence type (Policy, Report, Screenshot, Scan Report, Access Review, etc.)</td></tr>
        <tr><td><strong>Status</strong></td><td>Current review status (Draft, Pending Review, Approved, Active, Assessor Ready, Stale, Archived)</td></tr>
        <tr><td><strong>Linked Controls</strong></td><td>CMMC control IDs this evidence supports (e.g., AC.L1-3.1.1, IA.L2-3.5.3)</td></tr>
        <tr><td><strong>Security Domain</strong></td><td>CMMC domain derived from linked controls</td></tr>
        <tr><td><strong>Level</strong></td><td>CMMC level (L1 or L2)</td></tr>
        <tr><td><strong>Owner</strong></td><td>User responsible for this evidence item</td></tr>
        <tr><td><strong>Collected Date</strong></td><td>When the evidence was collected</td></tr>
        <tr><td><strong>Review Date</strong></td><td>Expiration or scheduled review date</td></tr>
        <tr><td><strong>Actions</strong></td><td>Preview, Download, Edit, Status change (role-dependent)</td></tr>
      </tbody>
    </table>
  </div>

  <div class="subsection">
    <div class="subsection-title">Filters</div>
    <ul>
      <li><strong>Search</strong> — Full-text search across evidence titles and descriptions</li>
      <li><strong>Type</strong> — Filter by evidence type</li>
      <li><strong>Status</strong> — Filter by review status</li>
      <li><strong>Domain</strong> — Filter by CMMC security domain</li>
      <li><strong>Level</strong> — Filter by L1 or L2</li>
      <li><strong>Control</strong> — Filter by specific control ID</li>
      <li><strong>Owner</strong> — Filter by assigned owner</li>
      <li><strong>Show Archived</strong> — Toggle to include archived items</li>
    </ul>
  </div>

  <div class="subsection">
    <div class="subsection-title">Evidence Detail</div>
    ${imgTag(s("evidence_detail"), "Evidence Detail page", "Figure 9.2 — Evidence detail page showing metadata, file preview, linked controls, and status history.")}
    <p>Click any evidence item to open its detail page. The detail page shows full metadata, the file preview (if supported), linked controls, version history, assessor summary, and internal notes. From here, reviewers can approve or reject evidence; compliance managers can update status, edit metadata, or supersede the record.</p>
  </div>
</div>

<!-- ═══ §10 Uploading Evidence ═══ -->
<div class="section page-break">
  <div class="section-header">
    <div class="section-num">Section 10</div>
    <div class="section-title">Uploading Evidence</div>
  </div>
  ${imgTag(s("evidence_upload"), "Evidence Upload page", "Figure 10.1 — The evidence upload form with metadata fields. Complete all required fields before saving.")}
  <p>Evidence can be uploaded from the <strong>Evidence Repository</strong> by clicking <strong>Add Evidence</strong>, or directly from a control's Evidence tab. You can upload one file at a time (single upload) or multiple files at once (bulk upload).</p>

  <div class="subsection">
    <div class="subsection-title">Single Upload — Required Fields</div>
    <table>
      <thead><tr><th>Field</th><th>Required</th><th>Description</th></tr></thead>
      <tbody>
        <tr><td><strong>Title</strong></td><td>Yes</td><td>Descriptive name for the evidence item. Use a naming convention (see below).</td></tr>
        <tr><td><strong>Evidence Type</strong></td><td>Yes</td><td>Category: Policy, Procedure, Report, Screenshot, Scan Report, Access Review, Training Record, Log Export, Other</td></tr>
        <tr><td><strong>Status</strong></td><td>Yes</td><td>Initial status: usually Draft (pending review) or Active (pre-approved)</td></tr>
        <tr><td><strong>Linked Controls</strong></td><td>Yes</td><td>One or more CMMC controls this evidence supports. Start typing the control ID to search.</td></tr>
        <tr><td><strong>Collection Date</strong></td><td>Yes</td><td>Date the evidence was collected or generated</td></tr>
        <tr><td><strong>Expiration / Review Date</strong></td><td>No</td><td>When the evidence should be reviewed or replaced (e.g., annually for access reviews)</td></tr>
        <tr><td><strong>Description</strong></td><td>No</td><td>Detailed description of what this evidence demonstrates</td></tr>
        <tr><td><strong>Assessor Summary</strong></td><td>No</td><td>Brief summary written for the assessor — what does this evidence prove?</td></tr>
        <tr><td><strong>Internal Notes</strong></td><td>No</td><td>Private team notes not visible to assessors</td></tr>
        <tr><td><strong>Tags</strong></td><td>No</td><td>Keywords for search and filtering</td></tr>
        <tr><td><strong>Owner</strong></td><td>No</td><td>User responsible for this evidence item</td></tr>
        <tr><td><strong>File Attachment</strong></td><td>No</td><td>Upload a file (PDF, XLSX, DOCX, PNG, JPG, CSV, TXT, LOG, YAML, etc.)</td></tr>
      </tbody>
    </table>
  </div>

  <div class="subsection">
    <div class="subsection-title">Evidence Naming Conventions</div>
    <p>Use a consistent naming convention to make evidence searchable and organized. The recommended format is:</p>
    <div class="filename-block">
      <span class="filename-example">ControlID_EvidenceType_Description_YYYY-MM-DD</span>
    </div>
    <p>Examples:</p>
    <div class="filename-block">
      <span class="filename-example">AC-3.1.1_User_Access_Review_2026-04-30.xlsx</span>
      <span class="filename-example">IA-3.5.3_MFA_Registration_Report_2026-05-01.xlsx</span>
      <span class="filename-example">AU-3.3.1_Audit_Log_Review_2026-03-15.pdf</span>
      <span class="filename-example">SI-3.14.1_Defender_Endpoint_Report_2026-Q1.pdf</span>
    </div>
  </div>

  <div class="subsection page-break">
    <div class="subsection-title">Bulk Upload</div>
    <p>Bulk upload allows you to upload multiple evidence files at once and apply shared metadata to all of them, with the option to override individual file metadata.</p>
    ${stepList([
      { title: "Click Bulk Upload", detail: " — From the Evidence Repository or a control's Evidence tab." },
      { title: "Select files", detail: " — Select multiple files from your computer. Files are staged for upload." },
      { title: "Apply default metadata", detail: " — Set Type, Status, Linked Controls, and Collection Date that apply to all files." },
      { title: "Override per-file metadata", detail: " — Expand individual files to customize their title or linked controls." },
      { title: "Click Upload All", detail: " — All files are uploaded with their metadata. The repository updates automatically." },
    ])}
    ${infoBox("info", "📋 Automatic Domain Tagging", "Linked controls determine the CMMC domain and level automatically. You do not need to set these manually — they are derived from the controls you select.")}
  </div>
</div>

<!-- ═══ §11 Previewing and Downloading Evidence ═══ -->
<div class="section">
  <div class="section-header">
    <div class="section-num">Section 11</div>
    <div class="section-title">Previewing and Downloading Evidence</div>
  </div>
  <p>Control HUB supports in-app file preview for most common file types. Previews are accessible from both the Evidence Repository list and the Evidence Detail page.</p>

  <div class="subsection">
    <div class="subsection-title">Supported Preview Types</div>
    <table>
      <thead><tr><th>File Type</th><th>Preview Behavior</th></tr></thead>
      <tbody>
        <tr><td><strong>Images</strong> (PNG, JPG, GIF, WebP, SVG)</td><td>Full-resolution preview with zoom (mouse wheel or buttons) and drag-to-pan. Fullscreen modal available.</td></tr>
        <tr><td><strong>PDF</strong></td><td>Embedded PDF viewer. Fullscreen modal available for larger documents.</td></tr>
        <tr><td><strong>Text / Log / CSV / YAML / JSON</strong></td><td>Monospace dark-theme viewer, up to 200 KB. Fullscreen modal available.</td></tr>
        <tr><td><strong>DOCX</strong></td><td>Server-rendered HTML preview. Displayed with formatted text. Fullscreen modal available.</td></tr>
        <tr><td><strong>XLSX</strong></td><td>Sheet-tab table view. Switch between sheets using the tab selector.</td></tr>
        <tr><td><strong>Other / Unsupported</strong></td><td>Download prompt displayed. File can be downloaded and opened locally.</td></tr>
      </tbody>
    </table>
  </div>

  <div class="subsection">
    <div class="subsection-title">Preview and Download Controls</div>
    <ul>
      <li><strong>View (eye icon)</strong> — Opens the in-app file preview</li>
      <li><strong>Download (download icon)</strong> — Downloads the file to your computer</li>
      <li><strong>Fullscreen (expand icon)</strong> — Opens the preview in a fullscreen modal for detailed review</li>
      <li><strong>Zoom in / Zoom out</strong> — Available for image previews; also supported via mouse wheel scroll</li>
    </ul>
    ${infoBox("tip", "💡 Large Files", "Very large files (over 20 MB) cannot be previewed in-app. Use the download button to access the file locally. Text files over 200 KB are truncated in the preview viewer.")}
  </div>
</div>

<!-- ═══ §12 Bulk Download ═══ -->
<div class="section page-break">
  <div class="section-header">
    <div class="section-num">Section 12</div>
    <div class="section-title">Bulk Download</div>
  </div>
  ${imgTag(s("bulk_download_wizard"), "Bulk Download wizard", "Figure 12.1 — The Bulk Download wizard allows you to export a structured ZIP package of evidence for offline C3PAO review.")}
  <p>The <strong>Bulk Download</strong> feature (also called the Evidence Export Package) allows you to create a structured ZIP file containing evidence files, a control mapping, a file index, and a hash manifest. This is the primary deliverable for C3PAO assessment packages.</p>

  <div class="subsection">
    <div class="subsection-title">Starting a Bulk Download</div>
    <p>Click <strong>Bulk Download</strong> in the Evidence Repository toolbar. This opens the wizard.</p>
  </div>

  <div class="subsection">
    <div class="subsection-title">Step 1: Scope</div>
    <p>Select which evidence to include:</p>
    <ul>
      <li><strong>Selected Items</strong> — Only the rows you have checked in the Evidence Repository</li>
      <li><strong>Filtered Items</strong> — All items matching your current filter settings</li>
      <li><strong>Approved / Active / Assessor-Ready</strong> — All evidence with those statuses (most common for C3PAO packages)</li>
      <li><strong>By Security Domain</strong> — All evidence linked to a specific CMMC domain</li>
      <li><strong>By Control</strong> — All evidence linked to a specific control</li>
    </ul>
  </div>

  <div class="subsection">
    <div class="subsection-title">Step 2: Structure</div>
    <p>Choose how files are organized inside the ZIP:</p>
    <ul>
      <li><strong>Flat ZIP with Manifest</strong> — All files in a single folder with a control_mapping.csv and hash_manifest.txt</li>
      <li><strong>Domain / Control Folder Structure</strong> — Files organized into folders by CMMC domain and control ID</li>
    </ul>
    ${infoBox("info", "📋 File Naming in ZIP", "Files are renamed inside the ZIP to include their linked control IDs (e.g., AC.L1-3.1.1_Access_Control_Policy_v3.pdf). Original filenames in Control HUB are not changed.")}
  </div>

  <div class="subsection">
    <div class="subsection-title">Step 3: Review &amp; Generate</div>
    <p>Review the export summary (file count, estimated size) and click <strong>Generate Package</strong>. Large exports may take several seconds. A download link appears when the package is ready.</p>
    <p><strong>Package contents:</strong></p>
    <ul>
      <li>All selected evidence files (renamed with control IDs)</li>
      <li><strong>file_index.csv</strong> — List of all files with metadata</li>
      <li><strong>control_mapping.csv</strong> — Evidence-to-control cross-reference</li>
      <li><strong>hash_manifest.txt</strong> — SHA-256 hashes for file integrity verification</li>
      <li><strong>export_issues.txt</strong> — List of any files that could not be included</li>
    </ul>
    ${infoBox("warn", "⚠ Missing Files", "If the export issues report lists files that should be included, verify they are attached (not just metadata records) and that their status qualifies them for the selected scope.")}
  </div>
</div>

<!-- ═══ §13 Documentation ═══ -->
<div class="section">
  <div class="section-header">
    <div class="section-num">Section 13</div>
    <div class="section-title">Documentation</div>
  </div>
  <p>The <strong>Documentation</strong> module is accessible from the sidebar. It covers policies, procedures, compliance logs, checklists, and generated documents. Documentation is a complement to evidence — it captures formal program documents rather than operational evidence artifacts.</p>

  <!-- 13.1 All Documents -->
  <div class="subsection">
    <div class="subsection-title">13.1 All Documents</div>
    ${imgTag(s("documents"), "All Documents list", "Figure 13.1 — The All Documents view lists all uploaded, generated, and document-type evidence for the organization.")}
    <p>The <strong>All Documents</strong> view (under <em>Documentation → All Documents</em>) is a combined list of uploaded documents, generated documents from templates, and document-category evidence items.</p>
    <table>
      <thead><tr><th>Column</th><th>Description</th></tr></thead>
      <tbody>
        <tr><td><strong>Title</strong></td><td>Document name</td></tr>
        <tr><td><strong>Type</strong></td><td>Category (Policy, Procedure, Record, Log, Checklist, etc.)</td></tr>
        <tr><td><strong>Status</strong></td><td>Document lifecycle status</td></tr>
        <tr><td><strong>Linked Controls</strong></td><td>CMMC controls this document addresses</td></tr>
        <tr><td><strong>Security Domain</strong></td><td>CMMC domain derived from linked controls</td></tr>
        <tr><td><strong>Owner</strong></td><td>Responsible user</td></tr>
        <tr><td><strong>Next Review</strong></td><td>Scheduled review or expiration date</td></tr>
        <tr><td><strong>Source</strong></td><td>Whether the document was uploaded, generated from a template, or created manually</td></tr>
      </tbody>
    </table>
    <p><strong>Document statuses:</strong></p>
    ${statusTable([
      { status: "Draft", color: "gray", desc: "Document is in progress and not yet submitted for review." },
      { status: "Pending Review", color: "yellow", desc: "Submitted for review — awaiting approval." },
      { status: "Approved", color: "green", desc: "Reviewed and approved by an authorized reviewer." },
      { status: "Active", color: "blue", desc: "Currently in force. Valid for compliance purposes." },
      { status: "Needs Update", color: "orange", desc: "Content requires update before the next review cycle." },
      { status: "Expired", color: "red", desc: "Past its scheduled review date. Should be refreshed." },
      { status: "Superseded", color: "gray", desc: "Replaced by a newer version of the document." },
      { status: "Archived", color: "gray", desc: "Retired and no longer active." },
    ])}
  </div>

  <!-- 13.2 Template Library -->
  <div class="subsection page-break">
    <div class="subsection-title">13.2 Template Library</div>
    ${imgTag(s("documents_templates"), "Template Library", "Figure 13.2 — The Template Library provides 67+ CMMC-mapped document templates ready to generate and customize.")}
    <p>The <strong>Template Library</strong> (under <em>Documentation → Templates</em>) provides a catalog of CMMC-mapped document templates for policies, procedures, records, and checklists. Each template is mapped to one or more CMMC controls.</p>
    <p>To generate a document from a template:</p>
    ${stepList([
      { title: "Browse the Template Library", detail: " — Use the search bar or filter by domain or document type." },
      { title: "Select a template", detail: " — Click the template card to open its detail view." },
      { title: "Click Generate Document", detail: " — A wizard opens to customize the document." },
      { title: "Fill in placeholders", detail: " — Replace organization-specific placeholders (e.g., [Organization Name], [System Owner])." },
      { title: "Export or Save", detail: " — Export as DOCX or PDF, or save directly to All Documents in Draft status." },
    ])}
    ${infoBox("tip", "💡 Placeholder Customization", "Placeholders marked with [brackets] should be replaced with your organization's specific information. Generic or unfilled templates will not satisfy a C3PAO assessor.")}
  </div>

  <!-- 13.3 Gap Analysis -->
  <div class="subsection">
    <div class="subsection-title">13.3 Gap Analysis</div>
    ${imgTag(s("documents_missing"), "Documentation Gap Analysis", "Figure 13.3 — The Gap Analysis view identifies missing, expired, or unlinked policies and procedures.")}
    <p>The <strong>Gap Analysis</strong> view (under <em>Documentation → Gap Analysis</em>) identifies documentation gaps in your compliance program — missing policies, missing procedures, expired documents, and documents pending review.</p>
    <ul>
      <li><strong>Missing Policies</strong> — Controls that require a policy document but have none linked and approved</li>
      <li><strong>Missing Procedures</strong> — Controls that require an implementing procedure but have none</li>
      <li><strong>Expired Documents</strong> — Documents that have passed their review date</li>
      <li><strong>Pending Review</strong> — Documents in Pending Review status that need attention</li>
    </ul>
    ${infoBox("tip", "💡 Closing Gaps", "A gap is closed when an Approved or Active document is linked to the control. Use the Template Library to quickly generate missing documents from pre-mapped templates.")}
  </div>
</div>

<!-- ═══ §14 Monitoring Tracker ═══ -->
<div class="section page-break">
  <div class="section-header">
    <div class="section-num">Section 14</div>
    <div class="section-title">Monitoring Tracker</div>
  </div>
  ${imgTag(s("monitoring"), "Monitoring Tracker", "Figure 14.1 — The Monitoring Tracker lists 19 recurring CMMC operational activities with frequency, status, and next-due tracking.")}
  <p>The <strong>Monitoring Tracker</strong> (sidebar: <em>Monitoring</em>) manages 19 recurring operational compliance activities required under CMMC Level 2. These activities represent ongoing practices your organization must perform continuously — not just at assessment time.</p>

  <div class="subsection">
    <div class="subsection-title">Tracker Columns</div>
    <table>
      <thead><tr><th>Column</th><th>Description</th></tr></thead>
      <tbody>
        <tr><td><strong>Task</strong></td><td>Name of the recurring monitoring activity</td></tr>
        <tr><td><strong>Control ID</strong></td><td>CMMC control this activity satisfies</td></tr>
        <tr><td><strong>Description</strong></td><td>What must be done during this review activity</td></tr>
        <tr><td><strong>Frequency</strong></td><td>How often: Weekly, Monthly, Quarterly, or Annually</td></tr>
        <tr><td><strong>Last Completed</strong></td><td>Date this activity was last marked complete</td></tr>
        <tr><td><strong>Next Due</strong></td><td>Calculated: Last Completed + Frequency interval</td></tr>
        <tr><td><strong>Status</strong></td><td>Current status</td></tr>
        <tr><td><strong>Notes</strong></td><td>Free-text notes entered during the last completion</td></tr>
      </tbody>
    </table>
  </div>

  <div class="subsection">
    <div class="subsection-title">Status Logic</div>
    ${statusTable([
      { status: "Open", color: "gray", desc: "Activity has not been started yet for the current cycle." },
      { status: "In Progress", color: "yellow", desc: "Activity is being performed — partially complete." },
      { status: "Current", color: "green", desc: "Activity was completed for the current cycle. Next Due is in the future." },
    ])}
    ${infoBox("warn", "⚠ Overdue Items", "If Next Due has passed and status is not Current, the item is overdue. Overdue items appear in the Dashboard KPI cards and recommended actions.")}
  </div>

  <div class="subsection">
    <div class="subsection-title">Updating a Monitoring Item</div>
    <p>Monitoring items are inline-editable. Click the row or an edit icon to update:</p>
    <ul>
      <li>Set <strong>Status</strong> to In Progress or Current</li>
      <li>Record the <strong>Last Completed</strong> date (today's date when performing the task)</li>
      <li>Add <strong>Notes</strong> describing what was observed or completed</li>
    </ul>
    <p>When you set status to <strong>Current</strong>, the <strong>Next Due</strong> date is automatically recalculated based on the frequency.</p>
    <p><strong>Example:</strong> A <em>Weekly</em> item last completed July 1, 2026 will show <em>Next Due: July 8, 2026</em>. A <em>Monthly</em> item last completed July 1, 2026 will show <em>Next Due: August 1, 2026</em>.</p>
  </div>

  <div class="subsection">
    <div class="subsection-title">Evidence for Monitoring Activities</div>
    <p>For each monitoring activity you complete, retain evidence of the work performed. Recommended evidence for common monitoring items:</p>
    <ul>
      <li><strong>Access Review</strong> — Signed access review spreadsheet or report</li>
      <li><strong>Vulnerability Scan</strong> — Scan report PDF from your scanning tool</li>
      <li><strong>Log Review</strong> — Screenshot or export from SIEM showing review completion</li>
      <li><strong>Training Completion</strong> — Training completion certificate or report</li>
    </ul>
    <p>Upload evidence to the Evidence Repository and link it to the corresponding CMMC control.</p>
  </div>
</div>

<!-- ═══ §15 POA&M ═══ -->
<div class="section">
  <div class="section-header">
    <div class="section-num">Section 15</div>
    <div class="section-title">Plan of Action and Milestones (POA&amp;M)</div>
  </div>
  ${imgTag(s("poams"), "POA&M Register", "Figure 15.1 — The POA&M Register shows all open and closed remediation items with risk level, owner, and scheduled completion date.")}
  <p>A <strong>Plan of Action and Milestones (POA&amp;M)</strong> is a formal document that identifies known security gaps, assigns ownership, and tracks the remediation plan and timeline. CMMC assessors review the POA&amp;M to understand your organization's risk posture and remediation progress.</p>

  <div class="subsection">
    <div class="subsection-title">POA&amp;M Fields</div>
    <table>
      <thead><tr><th>Field</th><th>Description</th></tr></thead>
      <tbody>
        <tr><td><strong>POA&amp;M Number</strong></td><td>Unique identifier (e.g., POAM-2026-001)</td></tr>
        <tr><td><strong>Title</strong></td><td>Brief description of the deficiency or gap</td></tr>
        <tr><td><strong>Deficiency Description</strong></td><td>Detailed explanation of the gap, including affected systems and scope</td></tr>
        <tr><td><strong>Linked Control</strong></td><td>CMMC control the gap applies to</td></tr>
        <tr><td><strong>Risk Level</strong></td><td>High, Medium, or Low — indicates urgency and potential impact</td></tr>
        <tr><td><strong>Status</strong></td><td>Current remediation status</td></tr>
        <tr><td><strong>Owner</strong></td><td>Person responsible for tracking and completing remediation</td></tr>
        <tr><td><strong>Scheduled Completion</strong></td><td>Target date for completing remediation</td></tr>
        <tr><td><strong>Remediation Plan</strong></td><td>Step-by-step plan for addressing the gap</td></tr>
        <tr><td><strong>Required Evidence</strong></td><td>What evidence is needed to prove the gap is closed</td></tr>
        <tr><td><strong>Closure Evidence</strong></td><td>Evidence item attached when the POA&amp;M is closed</td></tr>
      </tbody>
    </table>
  </div>

  <div class="subsection">
    <div class="subsection-title">POA&amp;M Status Values</div>
    ${statusTable([
      { status: "Open", color: "red", desc: "Gap is identified. Remediation has not started." },
      { status: "In Progress", color: "yellow", desc: "Remediation is underway. Target date set." },
      { status: "Pending Validation", color: "blue", desc: "Remediation steps completed. Awaiting evidence review and closure approval." },
      { status: "Closed", color: "green", desc: "Gap is fully remediated and evidence verified. No longer counts as open." },
      { status: "Accepted Risk", color: "gray", desc: "Risk accepted by leadership. No remediation planned. Documented rationale required." },
    ])}
    ${infoBox("warn", "⚠ C3PAO Review", "Assessors review all Open and In Progress POA&amp;Ms carefully. High-risk open items without credible remediation plans can affect certification decisions. Review and update POA&amp;Ms before any assessment preparation period.")}
  </div>

  <div class="subsection page-break">
    <div class="subsection-title">Creating a POA&amp;M</div>
    ${stepList([
      { title: "Navigate to POA&M Register", detail: " — Click POA&Ms in the sidebar." },
      { title: "Click Add POA&M", detail: " — The Add POA&M dialog opens." },
      { title: "Enter a descriptive title", detail: " — Be specific about the deficiency (e.g., 'Audit Log Review — SIEM Not Configured for Legacy Servers')." },
      { title: "Link to a control", detail: " — Select the CMMC control the gap is associated with." },
      { title: "Set risk level and owner", detail: " — Assign ownership and indicate risk level." },
      { title: "Set scheduled completion date", detail: " — A realistic target date for remediation." },
      { title: "Write the remediation plan", detail: " — Document specific steps and phases." },
      { title: "Save", detail: " — The POA&M is created with Open status and logged in the audit trail." },
    ])}
  </div>
</div>

<!-- ═══ §16 Implementation Roadmap ═══ -->
<div class="section">
  <div class="section-header">
    <div class="section-num">Section 16</div>
    <div class="section-title">Implementation Roadmap</div>
  </div>
  ${imgTag(s("roadmap"), "Implementation Roadmap — Priority Actions", "Figure 16.1 — The Roadmap lists high-impact actions that group related work across multiple CMMC controls.")}
  <p>The <strong>Implementation Roadmap</strong> organizes CMMC compliance work into high-impact <em>actions</em> that span multiple controls. Instead of working through 110 controls one by one, the roadmap groups related tasks by outcome — so completing one action advances multiple controls simultaneously.</p>

  <div class="subsection">
    <div class="subsection-title">Key Terms</div>
    <table>
      <thead><tr><th>Term</th><th>Meaning</th></tr></thead>
      <tbody>
        <tr><td><strong>Action</strong></td><td>A grouped implementation task that addresses multiple controls (e.g., "Deploy Multi-Factor Authentication")</td></tr>
        <tr><td><strong>Impact Score</strong></td><td>A calculated score reflecting how many controls and how significantly this action improves readiness</td></tr>
        <tr><td><strong>Priority</strong></td><td>High, Medium, or Low — recommended order to tackle actions</td></tr>
        <tr><td><strong>Effort</strong></td><td>Estimated implementation effort (Low, Medium, High)</td></tr>
        <tr><td><strong>Phase</strong></td><td>Implementation phase grouping (Foundation, Intermediate, Advanced)</td></tr>
        <tr><td><strong>Controls Supported</strong></td><td>List of CMMC controls this action contributes to</td></tr>
        <tr><td><strong>Full Support</strong></td><td>Completing this action fully satisfies the control</td></tr>
        <tr><td><strong>Partial Support</strong></td><td>Completing this action partially contributes to the control (other work also needed)</td></tr>
      </tbody>
    </table>
  </div>

  <div class="subsection">
    <div class="subsection-title">Action Detail Page</div>
    ${imgTag(s("roadmap_detail"), "Roadmap Action Detail page", "Figure 16.2 — Roadmap action detail with tabs for Steps, Evidence to Collect, Documents Needed, Validation, Checklist, and Controls Supported.")}
    <p>Clicking an action opens its detail page with six tabs:</p>
    <ul>
      <li><strong>Steps</strong> — Sequential implementation steps. Mark each as Complete or In Progress.</li>
      <li><strong>Evidence to Collect</strong> — Specific evidence items you should upload when performing this action.</li>
      <li><strong>Documents Needed</strong> — Policy or procedure documents required to complete this action.</li>
      <li><strong>Validation</strong> — How to verify the implementation is working correctly.</li>
      <li><strong>Checklist</strong> — A completion checklist to confirm all work items are done.</li>
      <li><strong>Controls Supported</strong> — Which CMMC controls this action satisfies (fully or partially).</li>
    </ul>
  </div>

  <div class="subsection page-break">
    <div class="subsection-title">Recommended Workflow for Each Action</div>
    ${stepList([
      { title: "Choose a recommended action", detail: " — Sort by Impact Score or Priority. Start with High-priority, High-impact actions." },
      { title: "Read the Overview", detail: " — Understand what the action accomplishes and which controls it supports." },
      { title: "Complete the Steps", detail: " — Follow the Steps tab. Mark each step as you complete it." },
      { title: "Upload Evidence", detail: " — Upload evidence files as you collect them. Link them to the relevant controls." },
      { title: "Link Documents", detail: " — If new policies or procedures are required, generate them from the Template Library." },
      { title: "Validate", detail: " — Follow the Validation tab instructions to confirm the implementation works." },
      { title: "Complete the Checklist", detail: " — Check off all checklist items." },
      { title: "Mark Ready for Review", detail: " — Notify your compliance manager or reviewer that the action is complete." },
    ])}
    ${infoBox("warn", "⚠ Roadmap Completion ≠ Certification", "Completing all roadmap actions does not automatically certify your controls or grant CMMC certification. The roadmap helps organize your work. Each control must still be individually assessed and evidenced for a C3PAO assessment.")}

    <div class="subsection-title" style="margin-top:14px;">Progress Tracker</div>
    <p>The roadmap includes a <strong>Progress</strong> page showing completion status across all actions — how many are Understood, In Progress, Evidence Uploaded, Validated, and Reviewed &amp; Complete.</p>
    <p>The <strong>Coverage Matrix</strong> shows which controls are supported by which actions and their current coverage percentage.</p>
  </div>
</div>

<!-- ═══ §17 Pre-Assessment ═══ -->
<div class="section">
  <div class="section-header">
    <div class="section-num">Section 17</div>
    <div class="section-title">Pre-Assessment</div>
  </div>
  ${imgTag(s("pre_assessment"), "Pre-Assessment — Results Summary", "Figure 17.1 — Pre-Assessment results summary showing scan health, findings, and evidence requests generated from the Microsoft tenant scan.")}
  <p>The <strong>Pre-Assessment</strong> module performs an automated technical scan of your organization's Microsoft 365 / Entra ID tenant configuration and produces a readiness report with findings, evidence requests, and roadmap recommendations.</p>
  ${infoBox("warn", "⚠ Not an Official Assessment", "The Pre-Assessment is an automated technical check — not an official CMMC assessment. It does not produce a CMMC score or certification. Results should be used to guide remediation efforts before a formal C3PAO assessment.")}

  <div class="subsection">
    <div class="subsection-title">Pre-Assessment Metrics</div>
    <table>
      <thead><tr><th>Metric</th><th>Description</th></tr></thead>
      <tbody>
        <tr><td><strong>Tenant Scan Health</strong></td><td>Overall scan completeness — what percentage of planned checks successfully retrieved data from the tenant</td></tr>
        <tr><td><strong>Assessment Confidence</strong></td><td>Confidence level of the assessment results based on data quality and coverage</td></tr>
        <tr><td><strong>Controls Touched by Tenant Scan</strong></td><td>Number of CMMC controls for which the scan collected relevant data</td></tr>
        <tr><td><strong>Checks Run</strong></td><td>Total number of automated configuration checks performed</td></tr>
        <tr><td><strong>Passed</strong></td><td>Checks where the observed configuration meets the CMMC requirement</td></tr>
        <tr><td><strong>Gaps Found</strong></td><td>Checks where the configuration does not meet the requirement — generates a Finding</td></tr>
        <tr><td><strong>Unknown / No Data</strong></td><td>Checks where data could not be retrieved — require manual follow-up</td></tr>
        <tr><td><strong>Evidence Snapshots</strong></td><td>Configuration snapshots automatically captured during the scan</td></tr>
        <tr><td><strong>Evidence Requests</strong></td><td>Evidence items the system identified as needed but not automatically captured</td></tr>
      </tbody>
    </table>
  </div>

  <div class="subsection page-break">
    <div class="subsection-title">Findings</div>
    ${imgTag(s("pre_assessment_findings"), "Pre-Assessment Findings", "Figure 17.2 — Findings list showing gaps identified during the tenant scan with severity, condition, and remediation guidance.")}
    <p>The <strong>Findings</strong> tab lists gaps identified during the scan. Each finding includes:</p>
    <ul>
      <li><strong>Severity</strong> — High, Medium, or Low — urgency of the gap</li>
      <li><strong>Observed Condition</strong> — What the scan found in the tenant configuration</li>
      <li><strong>Remediation</strong> — Specific steps to address the gap in your Microsoft tenant</li>
      <li><strong>Linked Controls</strong> — CMMC controls affected by this finding</li>
      <li><strong>Affected Objects</strong> — Specific users, policies, or settings affected (when available)</li>
    </ul>
    <p>High-severity findings should be addressed before scheduling a formal C3PAO assessment.</p>
  </div>

  <div class="subsection">
    <div class="subsection-title">Evidence Requests</div>
    <p>The <strong>Evidence Requests</strong> tab lists evidence that should be manually collected and uploaded to Control HUB following the pre-assessment scan. Each request includes:</p>
    <ul>
      <li><strong>Requested Evidence</strong> — What document or artifact is needed</li>
      <li><strong>Linked Controls</strong> — Which CMMC controls this evidence supports</li>
      <li><strong>Suggested Filename</strong> — Recommended naming convention for the file</li>
      <li><strong>Owner</strong> — Assigned user responsible for collecting this evidence</li>
      <li><strong>Due Date</strong> — Target collection date</li>
      <li><strong>Status</strong> — Whether the evidence has been collected and uploaded</li>
    </ul>
  </div>

  <div class="subsection">
    <div class="subsection-title">Recommended Roadmap from Pre-Assessment</div>
    <p>The <strong>Roadmap</strong> tab within Pre-Assessment shows a prioritized list of actions derived from the scan findings. These actions are ranked by impact and are directly linked to the gaps the scan identified — making it the fastest path to improving your readiness posture following the scan.</p>
  </div>
</div>

<!-- ═══ §18 Reports ═══ -->
<div class="section page-break">
  <div class="section-header">
    <div class="section-num">Section 18</div>
    <div class="section-title">Reports</div>
  </div>
  ${imgTag(s("reports"), "Reports", "Figure 18.1 — The Reports module provides downloadable compliance reports for executives, technical staff, and C3PAO assessors.")}
  <p>The <strong>Reports</strong> module generates downloadable compliance reports for different audiences — executive leadership, compliance staff, and C3PAO assessors.</p>

  <div class="subsection">
    <div class="subsection-title">Available Report Types</div>
    <table>
      <thead><tr><th>Report</th><th>Audience</th><th>Description</th></tr></thead>
      <tbody>
        <tr><td><strong>Executive Readiness</strong></td><td>Leadership, Board</td><td>High-level compliance posture summary — overall readiness %, domain scores, KPIs. No technical detail.</td></tr>
        <tr><td><strong>Domain Readiness</strong></td><td>Compliance Manager</td><td>Readiness breakdown by CMMC domain with control counts and evidence coverage.</td></tr>
        <tr><td><strong>Gap Analysis</strong></td><td>Compliance Manager, IT</td><td>Controls not yet implemented, missing evidence, and documentation gaps.</td></tr>
        <tr><td><strong>Control Status</strong></td><td>Compliance Manager</td><td>Full control-by-control status report with implementation narrative excerpts.</td></tr>
        <tr><td><strong>Evidence Inventory</strong></td><td>Compliance Manager, Assessor</td><td>Complete list of all evidence items with metadata, status, and linked controls.</td></tr>
        <tr><td><strong>POA&amp;M Report</strong></td><td>Leadership, Assessor</td><td>All POA&amp;M items with risk level, owner, dates, and remediation status.</td></tr>
        <tr><td><strong>Monitoring Tracker</strong></td><td>Compliance Manager, Assessor</td><td>All monitoring items with frequency, last completed, next due, and status.</td></tr>
        <tr><td><strong>Audit Readiness</strong></td><td>Compliance Manager</td><td>Combined readiness report for internal use before a C3PAO assessment.</td></tr>
        <tr><td><strong>SSP Summary</strong></td><td>Assessor, Leadership</td><td>System Security Plan narrative summary by control domain.</td></tr>
        <tr><td><strong>Pre-Assessment Report</strong></td><td>Compliance Manager, IT</td><td>Results of the tenant scan including findings, evidence requests, and remediation roadmap.</td></tr>
        <tr><td><strong>C3PAO Export Package</strong></td><td>Assessor, C3PAO</td><td>Full structured export of controls, narratives, evidence, and SSP for formal assessment delivery.</td></tr>
      </tbody>
    </table>
  </div>

  <div class="subsection">
    <div class="subsection-title">Generating and Downloading Reports</div>
    ${stepList([
      { title: "Navigate to Reports", detail: " — Click Reports in the sidebar navigation." },
      { title: "Select the report type", detail: " — Choose from the report list based on your audience and purpose." },
      { title: "Configure options (if available)", detail: " — Some reports allow filtering by date range, domain, or control." },
      { title: "Click Generate / Download", detail: " — The report is generated and downloaded as a PDF." },
    ])}
    ${infoBox("tip", "💡 Executive vs. Technical Reports", "Share the Executive Readiness report with leadership and the Board — it contains no sensitive technical detail. Use the Control Status, Evidence Inventory, or C3PAO Export Package for technical or assessor audiences.")}
  </div>
</div>

<!-- ═══ §19 Help Center ═══ -->
<div class="section">
  <div class="section-header">
    <div class="section-num">Section 19</div>
    <div class="section-title">Help Center</div>
  </div>
  ${imgTag(s("help_center"), "Help Center", "Figure 19.1 — The Help Center provides in-app articles, FAQ, and category-organized guidance for all platform modules.")}
  <p>The <strong>Help Center</strong> (accessible from the sidebar or the <em>?</em> icon) provides in-app documentation and frequently asked questions organized by platform module.</p>
  <ul>
    <li><strong>Browse by Category</strong> — Articles are organized into 14 categories covering every module</li>
    <li><strong>Search</strong> — Search across all articles and FAQ items by keyword</li>
    <li><strong>FAQ</strong> — Quick answers to the most common questions</li>
    <li><strong>Contextual Help</strong> — Some pages include inline help icons that open relevant articles directly</li>
  </ul>
  <p>For issues not covered by the Help Center, contact Carme Technology support at <strong>info@carmetechnology.com</strong>.</p>
</div>

<!-- ═══ §20 End-to-End Workflows ═══ -->
<div class="section page-break">
  <div class="section-header">
    <div class="section-num">Section 20</div>
    <div class="section-title">End-to-End Workflows</div>
  </div>
  <p>The following workflows describe common, real-world compliance tasks performed in Control HUB. Use them as operating procedures for your team.</p>

  <!-- Workflow 1 -->
  <div class="workflow-block">
    <div class="workflow-title">📋 Workflow 1 — New Organization Readiness Review</div>
    <p><em>Goal: Assess the current compliance posture of a newly onboarded organization.</em></p>
    ${stepList([
      { title: "Select the organization", detail: " — Use the org switcher in the sidebar to activate the organization." },
      { title: "Review the Dashboard", detail: " — Check KPI cards, domain readiness chart, and activity timeline." },
      { title: "Run Pre-Assessment (if tenant connected)", detail: " — Navigate to Pre-Assessment and review findings." },
      { title: "Review Pre-Assessment Findings", detail: " — Note high-severity findings for immediate action." },
      { title: "Review Evidence Requests", detail: " — Assign evidence collection tasks to team members." },
      { title: "Open Implementation Roadmap", detail: " — Review high-priority, high-impact actions." },
      { title: "Start the top recommended action", detail: " — Open it and review Steps, Evidence, and Documents tabs." },
      { title: "Upload initial evidence", detail: " — Collect and upload available evidence, linking to controls." },
      { title: "Review Controls Library", detail: " — Prioritize controls with no implementation status." },
      { title: "Generate a Gap Analysis report", detail: " — Share with leadership and plan next steps." },
    ])}
  </div>

  <!-- Workflow 2 -->
  <div class="workflow-block" style="margin-top:14px;">
    <div class="workflow-title">🔍 Workflow 2 — Control Review Workflow</div>
    <p><em>Goal: Fully review and document a single CMMC control.</em></p>
    ${stepList([
      { title: "Search for the control", detail: " — In Controls Library, search by control ID (e.g., AC.L1-3.1.1) or keyword." },
      { title: "Open the Control Detail page", detail: " — Click the control row to open the detail view." },
      { title: "Read the Implementation Narrative", detail: " — Review or write the narrative on the Implementation tab." },
      { title: "Open the Evidence tab", detail: " — Review linked evidence. Preview or download files as needed." },
      { title: "Open the SSP tab", detail: " — Verify alignment between the SSP narrative and implementation narrative." },
      { title: "Check the Monitoring tab", detail: " — Confirm monitoring activities are current and on schedule." },
      { title: "Check the POA&M tab", detail: " — Note any open remediation items for this control." },
      { title: "Record follow-up", detail: " — Create a POA&M if gaps exist, or add evidence if coverage is insufficient." },
    ])}
  </div>

  <!-- Workflow 3 -->
  <div class="workflow-block page-break" style="margin-top:14px;">
    <div class="workflow-title">📤 Workflow 3 — Evidence Upload Workflow</div>
    <p><em>Goal: Upload new evidence and link it to the correct CMMC controls.</em></p>
    ${stepList([
      { title: "Navigate to Evidence or a control's Evidence tab", detail: " — Go to Evidence Repository or open a specific control." },
      { title: "Click Add Evidence or Bulk Upload", detail: " — Choose single or bulk upload based on how many files you have." },
      { title: "Select evidence type and status", detail: " — Choose the appropriate type (Policy, Report, etc.) and initial status." },
      { title: "Link to controls", detail: " — Select one or more CMMC controls this evidence supports." },
      { title: "Add metadata", detail: " — Fill in title, collection date, description, and assessor summary." },
      { title: "Upload the file", detail: " — Attach the file. Supported formats: PDF, XLSX, DOCX, PNG, JPG, CSV, TXT, LOG." },
      { title: "Save", detail: " — Evidence is created and appears in both the repository and the linked control's Evidence tab." },
      { title: "Confirm", detail: " — Verify the evidence appears correctly in the Evidence Repository and control Evidence tab." },
    ])}
  </div>

  <!-- Workflow 4 -->
  <div class="workflow-block" style="margin-top:14px;">
    <div class="workflow-title">📅 Workflow 4 — Monthly Monitoring Workflow</div>
    <p><em>Goal: Complete monthly monitoring activities and update the tracker.</em></p>
    ${stepList([
      { title: "Open the Monitoring Tracker", detail: " — Navigate to Monitoring in the sidebar." },
      { title: "Filter for overdue and due-soon items", detail: " — Look for items with status Open or where Next Due is this week." },
      { title: "Perform the review activity", detail: " — Complete the actual compliance task (e.g., run the scan, review the logs)." },
      { title: "Update Last Completed to today", detail: " — Click the edit icon and enter today's date as Last Completed." },
      { title: "Confirm Next Due recalculates", detail: " — Verify the Next Due date advances by the frequency interval." },
      { title: "Upload evidence", detail: " — Upload the deliverable from the review (scan report, log export, screenshot) to Evidence." },
      { title: "Add notes", detail: " — Record what was done and any observations in the Notes field." },
      { title: "Set Status to Current", detail: " — Mark the item as Current for this cycle." },
    ])}
  </div>

  <!-- Workflow 5 -->
  <div class="workflow-block page-break" style="margin-top:14px;">
    <div class="workflow-title">🛠 Workflow 5 — POA&amp;M Remediation Workflow</div>
    <p><em>Goal: Track and close a known compliance gap.</em></p>
    ${stepList([
      { title: "Open the POA&M Register", detail: " — Navigate to POA&Ms in the sidebar." },
      { title: "Review open and high-risk items", detail: " — Sort by Risk Level to see the most urgent items first." },
      { title: "Update remediation notes", detail: " — Document progress on the remediation plan." },
      { title: "Attach closure evidence", detail: " — When remediation is complete, upload evidence proving the gap is closed." },
      { title: "Change status to Pending Validation", detail: " — Signal that remediation is done and ready for review." },
      { title: "Reviewer validates", detail: " — A Compliance Manager or Reviewer confirms the evidence and closes the POA&M." },
      { title: "Mark Closed", detail: " — Update status to Closed. The item no longer counts as an open gap." },
    ])}
  </div>

  <!-- Workflow 6 -->
  <div class="workflow-block" style="margin-top:14px;">
    <div class="workflow-title">🏛 Workflow 6 — C3PAO Assessment Preparation Workflow</div>
    <p><em>Goal: Prepare your organization for a formal Third-Party Assessment Organization (C3PAO) review.</em></p>
    ${stepList([
      { title: "Dashboard readiness review", detail: " — Review the Dashboard and address any KPI alerts — overdue monitoring, open POA&Ms, expiring evidence." },
      { title: "Evidence health review", detail: " — In the Evidence Repository, filter for Stale and Pending Review items. Refresh or approve as needed." },
      { title: "Documentation gap analysis", detail: " — Run the Documentation Gap Analysis. Generate missing policies from the Template Library." },
      { title: "SSP review", detail: " — Open the SSP module and verify narratives are current and aligned with evidence." },
      { title: "Monitoring tracker review", detail: " — Confirm all monitoring items are Current for the current cycle." },
      { title: "POA&M review", detail: " — Close any POA&Ms where remediation is complete. Update remediation plans for open items." },
      { title: "Generate reports", detail: " — Generate the Audit Readiness Report, Evidence Inventory, and POA&M Report for internal review." },
      { title: "Export assessor package", detail: " — Use Bulk Download (Approved / Active / Assessor Ready scope) to generate the C3PAO evidence package." },
    ])}
  </div>
</div>

<!-- ═══ §21 Troubleshooting ═══ -->
<div class="section page-break">
  <div class="section-header">
    <div class="section-num">Section 21</div>
    <div class="section-title">Troubleshooting</div>
  </div>
  <table>
    <thead><tr><th>Issue</th><th>Likely Cause</th><th>Resolution</th></tr></thead>
    <tbody>
      <tr>
        <td><strong>Cannot log in</strong></td>
        <td>Incorrect email or password; account deactivated</td>
        <td>Verify your email and password. Check for Caps Lock. Contact your administrator if account may be deactivated.</td>
      </tr>
      <tr>
        <td><strong>Forgot password</strong></td>
        <td>No self-service reset available</td>
        <td>Contact your organization administrator. They can issue a temporary password from User Management.</td>
      </tr>
      <tr>
        <td><strong>MFA code not working</strong></td>
        <td>TOTP code expired; device clock out of sync</td>
        <td>Verify your device clock is set to the correct time zone. TOTP codes expire every 30 seconds — enter promptly. After 5 failed attempts, contact your administrator to unlock your account.</td>
      </tr>
      <tr>
        <td><strong>Cannot see my organization</strong></td>
        <td>Not added to the organization; wrong account</td>
        <td>Confirm you are logged in with the correct email. Ask your administrator to verify your organization membership.</td>
      </tr>
      <tr>
        <td><strong>Cannot find a control</strong></td>
        <td>Incorrect search term; filter applied</td>
        <td>Clear all filters in the Controls Library. Search by the exact control ID (e.g., AC.L1-3.1.1). All 110 CMMC L2 controls are always present.</td>
      </tr>
      <tr>
        <td><strong>Evidence preview not loading</strong></td>
        <td>Large file; unsupported format; network issue</td>
        <td>Try downloading the file instead. Files over 20 MB cannot be previewed in-app. Text files over 200 KB are truncated.</td>
      </tr>
      <tr>
        <td><strong>Evidence download blocked</strong></td>
        <td>Browser pop-up blocker; file deleted</td>
        <td>Allow pop-ups for the Control HUB domain in your browser. If the file is missing, it may need to be re-uploaded.</td>
      </tr>
      <tr>
        <td><strong>Document missing from All Documents</strong></td>
        <td>Generated from template but not saved; wrong org selected</td>
        <td>Verify the correct organization is active in the sidebar. Check if the document was saved or only exported. Re-generate if needed.</td>
      </tr>
      <tr>
        <td><strong>Report not generating</strong></td>
        <td>No data to report; server timeout</td>
        <td>Ensure your organization has evidence and control data before generating reports. Refresh the page and try again. Contact support if the issue persists.</td>
      </tr>
      <tr>
        <td><strong>Bulk download has missing files</strong></td>
        <td>Evidence items without attached files; status not qualifying</td>
        <td>Check the export_issues.txt in the ZIP. Verify evidence items have files attached (not just metadata). Confirm status qualifies for the selected scope (Approved / Active / Assessor Ready).</td>
      </tr>
      <tr>
        <td><strong>Pre-assessment scan shows data unavailable</strong></td>
        <td>Microsoft tenant permissions insufficient; connection expired</td>
        <td>Contact your administrator to verify the Microsoft tenant connection is active and the app registration has required permissions. Re-run the connection setup if needed.</td>
      </tr>
      <tr>
        <td><strong>Monitoring item appears overdue</strong></td>
        <td>Last Completed date not updated; Next Due passed</td>
        <td>Open the Monitoring Tracker and update the Last Completed date for the item. Set status to Current after completing the review activity.</td>
      </tr>
      <tr>
        <td><strong>POA&amp;M status looks wrong</strong></td>
        <td>Status not updated after remediation; permissions</td>
        <td>Open the POA&amp;M and verify the status reflects actual progress. If you cannot update it, your role may not permit status changes — contact your Compliance Manager.</td>
      </tr>
    </tbody>
  </table>
  <p style="margin-top:12px;">For issues not listed above, contact <strong>info@carmetechnology.com</strong> with a description of the issue, the URL of the page, and any error messages displayed.</p>
</div>

<!-- ═══ §22 Glossary ═══ -->
<div class="section page-break">
  <div class="section-header">
    <div class="section-num">Section 22</div>
    <div class="section-title">Glossary</div>
  </div>
  <table>
    <thead><tr><th>Term</th><th>Definition</th></tr></thead>
    <tbody>
      <tr><td><strong>CMMC</strong></td><td>Cybersecurity Maturity Model Certification — the U.S. Department of Defense framework requiring Defense Industrial Base contractors to demonstrate cybersecurity practices at defined maturity levels.</td></tr>
      <tr><td><strong>C3PAO</strong></td><td>Certified Third-Party Assessment Organization — an independent organization authorized by the CMMC Accreditation Body to conduct official CMMC assessments.</td></tr>
      <tr><td><strong>Control</strong></td><td>A specific cybersecurity practice or requirement defined in CMMC (derived from NIST SP 800-171). Control HUB manages all 110 CMMC Level 2 controls.</td></tr>
      <tr><td><strong>Domain</strong></td><td>A grouping of related CMMC controls (e.g., Access Control, Audit and Accountability, Incident Response). CMMC Level 2 has 14 domains.</td></tr>
      <tr><td><strong>Evidence</strong></td><td>Documentation, files, records, or artifacts that demonstrate a control requirement is implemented and operational. Examples: access review spreadsheets, scan reports, policy documents, screenshots.</td></tr>
      <tr><td><strong>Document</strong></td><td>A formal compliance document — typically a policy, procedure, record, log, or checklist — managed in the Documentation module. Documents may also serve as evidence.</td></tr>
      <tr><td><strong>SSP</strong></td><td>System Security Plan — a formal document that describes an organization's information systems, the security controls in place, and how those controls satisfy CMMC requirements.</td></tr>
      <tr><td><strong>POA&amp;M</strong></td><td>Plan of Action and Milestones (pronounced "POH-am") — a document that tracks known security gaps, assigns ownership, and records remediation plans and target completion dates.</td></tr>
      <tr><td><strong>Monitoring Tracker</strong></td><td>A Control HUB module that manages 19 recurring CMMC operational activities — tasks your organization must perform continuously to demonstrate ongoing compliance.</td></tr>
      <tr><td><strong>Implementation Narrative</strong></td><td>A written description of how your organization implements a specific CMMC control — what systems, processes, and tools are used. This is the primary human-readable description for assessors.</td></tr>
      <tr><td><strong>Configure Step</strong></td><td>A specific, actionable implementation step within a control's Configure tab — a structured checklist of what to deploy, configure, or verify to implement the control.</td></tr>
      <tr><td><strong>Tenant Scan Health</strong></td><td>A Pre-Assessment metric indicating what percentage of planned checks successfully retrieved data from the Microsoft tenant. Lower health means more manual follow-up is needed.</td></tr>
      <tr><td><strong>Assessment Confidence</strong></td><td>A Pre-Assessment metric reflecting the reliability of findings based on data quality and coverage. High confidence means most checks ran successfully.</td></tr>
      <tr><td><strong>Controls Touched by Tenant Scan</strong></td><td>The number of CMMC controls for which the Pre-Assessment scan collected and evaluated relevant configuration data.</td></tr>
      <tr><td><strong>Evidence Request</strong></td><td>An item generated by the Pre-Assessment scan identifying evidence that must be manually collected and uploaded. Each request is linked to specific CMMC controls.</td></tr>
      <tr><td><strong>Roadmap Action</strong></td><td>A grouped implementation task in the Implementation Roadmap that addresses multiple CMMC controls simultaneously. Actions produce evidence, documents, and validation outputs.</td></tr>
      <tr><td><strong>Assessor Ready</strong></td><td>An evidence status indicating the item is approved and specifically prepared for C3PAO assessor review. Assessor Ready items are included in bulk download packages.</td></tr>
      <tr><td><strong>Active</strong></td><td>An evidence or document status indicating the item is currently valid and in use for compliance purposes.</td></tr>
      <tr><td><strong>Approved</strong></td><td>An evidence or document status indicating it has been reviewed and formally approved by an authorized reviewer or Compliance Manager.</td></tr>
      <tr><td><strong>Stale</strong></td><td>An evidence status indicating the item has passed its scheduled review or expiration date and should be refreshed or superseded.</td></tr>
    </tbody>
  </table>
</div>

<!-- ═══ §23 Version ═══ -->
<div class="section">
  <div class="section-header">
    <div class="section-num">Section 23</div>
    <div class="section-title">Version and Contact Information</div>
  </div>
  <table>
    <thead><tr><th>Field</th><th>Value</th></tr></thead>
    <tbody>
      <tr><td><strong>Guide Version</strong></td><td>${GUIDE_VERSION}</td></tr>
      <tr><td><strong>Generated Date</strong></td><td>${GENERATED_DATE}</td></tr>
      <tr><td><strong>Application</strong></td><td>Control HUB</td></tr>
      <tr><td><strong>Prepared By</strong></td><td>Carme Technology</td></tr>
      <tr><td><strong>Support Email</strong></td><td>info@carmetechnology.com</td></tr>
      <tr><td><strong>Changelog</strong></td><td>v1.0 — Initial release. Covers all non-admin modules: Dashboard, Controls, Evidence, Documentation, Monitoring, POA&amp;M, Roadmap, Pre-Assessment, Reports, Help Center, Workflows, Troubleshooting, Glossary.</td></tr>
    </tbody>
  </table>
  ${infoBox("info", "📋 Keeping This Guide Current", "This guide is generated automatically from Control HUB. As new features are added, run <code>pnpm generate:user-guide</code> to regenerate the guide with the latest screenshots and content.")}
</div>

</body>
</html>`;
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  console.log("\n" + "═".repeat(58));
  console.log("  Control HUB — Complete User Guide Generator");
  console.log("═".repeat(58));

  if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  // 1. Seed data
  const seed = await seedApexData();

  // 2. Launch browser
  console.log("\n🌐 Launching browser...");
  const CHROMIUM_PATH =
    "/nix/store/qa9cnw4v5xkxyip6mb9kxqfq1z4x2dx1-chromium-138.0.7204.100/bin/chromium";
  const browser = await chromium.launch({
    executablePath: CHROMIUM_PATH,
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
    headless: true,
  });

  try {
    const context = await browser.newContext({
      viewport: { width: 1440, height: 900 },
    });
    const page = await context.newPage();

    // 3. Authenticate
    console.log("\n🔑 Authenticating as Sarah Mitchell (compliance_manager)...");
    const token = generateToken();
    await page.goto(APP_URL, { waitUntil: "domcontentloaded", timeout: 20000 });
    await page.waitForTimeout(1000);
    await injectAuth(page, token, APEX_ORG.id);

    // 4. Take screenshots
    console.log("\n📷 Taking screenshots...");
    const shots = new Map<string, string>();

    // ── Login page ─────────────────────────────────────────────────────
    console.log("  → Login page");
    try {
      const loginContext = await browser.newContext({ viewport: { width: 1440, height: 900 } });
      const loginPage = await loginContext.newPage();
      await loginPage.goto(APP_URL, { waitUntil: "networkidle", timeout: 15000 });
      await loginPage.waitForTimeout(1000);
      const loginText = await loginPage.evaluate<string>("document.body?.innerText ?? ''");
      if (loginText.includes("Sign In") || loginText.includes("Email")) {
        shots.set("login", await loginPage.screenshot({ fullPage: false }).then(b => b.toString("base64")));
        console.log("     ✓ login page");
      } else {
        console.log("     ⚠ login page not detected (may have auto-redirected)");
      }
      await loginContext.close();
    } catch (e) {
      console.warn("     ⚠ login screenshot failed:", (e as Error).message);
    }

    // ── Dashboard ──────────────────────────────────────────────────────
    console.log("  → Dashboard");
    if (await navigateAndWait(page, `${APP_URL}/`)) {
      await page.waitForTimeout(2000);
      shots.set("dashboard", await takeValidatedScreenshot(page, "dashboard", {
        waitForText: "Dashboard",
      }));
      console.log(`     ${shots.get("dashboard") ? "✓" : "⚠"} dashboard`);
    }

    // ── Controls ───────────────────────────────────────────────────────
    console.log("  → Controls library");
    if (await navigateAndWait(page, `${APP_URL}/controls`)) {
      await page.waitForTimeout(2000);
      shots.set("controls", await takeValidatedScreenshot(page, "controls", {
        waitForText: "Control",
      }));
      console.log(`     ${shots.get("controls") ? "✓" : "⚠"} controls`);
    }

    // ── Control Detail tabs ─────────────────────────────────────────────
    console.log("  → Control detail tabs");
    const ctrlUrl = `${APP_URL}/controls/${seed.bestControlUUID}`;
    if (await navigateAndWait(page, ctrlUrl)) {
      await page.waitForTimeout(2500);
      // Implementation
      shots.set("ctrl_impl", await takeValidatedScreenshot(page, "ctrl_impl"));
      console.log(`     ${shots.get("ctrl_impl") ? "✓" : "⚠"} ctrl_impl`);

      // Configure tab
      if (await clickTab(page, "Configure")) {
        shots.set("ctrl_configure", await takeValidatedScreenshot(page, "ctrl_configure"));
        console.log(`     ${shots.get("ctrl_configure") ? "✓" : "⚠"} ctrl_configure`);
      }

      // Evidence tab
      if (await clickTab(page, "Evidence")) {
        shots.set("ctrl_evidence", await takeValidatedScreenshot(page, "ctrl_evidence"));
        console.log(`     ${shots.get("ctrl_evidence") ? "✓" : "⚠"} ctrl_evidence`);
      }

      // Monitoring tab
      if (await clickTab(page, "Monitoring")) {
        shots.set("ctrl_monitoring", await takeValidatedScreenshot(page, "ctrl_monitoring"));
        console.log(`     ${shots.get("ctrl_monitoring") ? "✓" : "⚠"} ctrl_monitoring`);
      }

      // POA&M tab
      if (await clickTab(page, "POA")) {
        shots.set("ctrl_poam", await takeValidatedScreenshot(page, "ctrl_poam"));
        console.log(`     ${shots.get("ctrl_poam") ? "✓" : "⚠"} ctrl_poam`);
      }

      // SSP tab
      if (await clickTab(page, "SSP")) {
        shots.set("ctrl_ssp", await takeValidatedScreenshot(page, "ctrl_ssp"));
        console.log(`     ${shots.get("ctrl_ssp") ? "✓" : "⚠"} ctrl_ssp`);
      }
    } else {
      console.warn(`  ⚠  Could not load control detail`);
    }

    // ── Evidence repository ─────────────────────────────────────────────
    console.log("  → Evidence repository");
    if (await navigateAndWait(page, `${APP_URL}/evidence`)) {
      await page.waitForTimeout(2000);
      shots.set("evidence", await takeValidatedScreenshot(page, "evidence"));
      console.log(`     ${shots.get("evidence") ? "✓" : "⚠"} evidence`);

      // Bulk download wizard
      console.log("  → Bulk download wizard");
      try {
        const bulkBtn = page.getByRole("button", { name: /bulk download/i });
        if (await bulkBtn.isVisible({ timeout: 4000 })) {
          await bulkBtn.click();
          await page.waitForTimeout(2000);
          shots.set("bulk_download_wizard", await takeValidatedScreenshot(page, "bulk_download_wizard", {
            waitForText: "Scope",
          }));
          console.log(`     ${shots.get("bulk_download_wizard") ? "✓" : "⚠"} bulk_download_wizard`);
          await page.keyboard.press("Escape");
          await page.waitForTimeout(600);
        } else {
          console.log("     ⚠ Bulk Download button not found — skipping");
        }
      } catch {
        console.log("     ⚠ Bulk Download wizard screenshot failed");
      }
    }

    // ── Evidence detail ─────────────────────────────────────────────────
    if (seed.evidenceItemId) {
      console.log("  → Evidence detail");
      if (await navigateAndWait(page, `${APP_URL}/evidence/${seed.evidenceItemId}`)) {
        await page.waitForTimeout(2000);
        shots.set("evidence_detail", await takeValidatedScreenshot(page, "evidence_detail"));
        console.log(`     ${shots.get("evidence_detail") ? "✓" : "⚠"} evidence detail`);
      }
    }

    // ── Evidence upload ─────────────────────────────────────────────────
    console.log("  → Evidence upload");
    if (await navigateAndWait(page, `${APP_URL}/evidence/upload`)) {
      await page.waitForTimeout(2000);
      shots.set("evidence_upload", await takeValidatedScreenshot(page, "evidence_upload"));
      console.log(`     ${shots.get("evidence_upload") ? "✓" : "⚠"} evidence_upload`);
    }

    // ── Documents ──────────────────────────────────────────────────────
    console.log("  → Documents — All Documents");
    if (await navigateAndWait(page, `${APP_URL}/documents/list`)) {
      await page.waitForTimeout(2000);
      shots.set("documents", await takeValidatedScreenshot(page, "documents"));
      console.log(`     ${shots.get("documents") ? "✓" : "⚠"} documents`);
    }

    // ── Document templates ──────────────────────────────────────────────
    console.log("  → Document templates");
    // Try /documents first, then look for a templates tab
    if (await navigateAndWait(page, `${APP_URL}/documents`)) {
      await page.waitForTimeout(2000);
      // Try clicking a Templates link/tab
      try {
        const tmplLink = page.getByRole("link", { name: /template/i }).first();
        if (await tmplLink.isVisible({ timeout: 3000 })) {
          await tmplLink.click();
          await page.waitForTimeout(2000);
        }
      } catch {}
      shots.set("documents_templates", await takeValidatedScreenshot(page, "documents_templates"));
      console.log(`     ${shots.get("documents_templates") ? "✓" : "⚠"} documents_templates`);
    }

    // ── Gap analysis ────────────────────────────────────────────────────
    console.log("  → Documentation gap analysis");
    if (await navigateAndWait(page, `${APP_URL}/documents/missing`)) {
      await page.waitForTimeout(2000);
      shots.set("documents_missing", await takeValidatedScreenshot(page, "documents_missing"));
      console.log(`     ${shots.get("documents_missing") ? "✓" : "⚠"} documents_missing`);
    }

    // ── Monitoring tracker ──────────────────────────────────────────────
    console.log("  → Monitoring tracker");
    if (await navigateAndWait(page, `${APP_URL}/monitoring`)) {
      await page.waitForTimeout(2000);
      shots.set("monitoring", await takeValidatedScreenshot(page, "monitoring", {
        waitForText: "Monitoring",
      }));
      console.log(`     ${shots.get("monitoring") ? "✓" : "⚠"} monitoring`);
    }

    // ── POA&Ms ─────────────────────────────────────────────────────────
    console.log("  → POA&M register");
    if (await navigateAndWait(page, `${APP_URL}/poams`)) {
      await page.waitForTimeout(2000);
      shots.set("poams", await takeValidatedScreenshot(page, "poams", {
        waitForText: "POA",
      }));
      console.log(`     ${shots.get("poams") ? "✓" : "⚠"} poams`);
    }

    // ── Roadmap ─────────────────────────────────────────────────────────
    console.log("  → Implementation roadmap");
    if (await navigateAndWait(page, `${APP_URL}/roadmap`)) {
      await page.waitForTimeout(2500);
      shots.set("roadmap", await takeValidatedScreenshot(page, "roadmap", {
        waitForText: "Roadmap",
      }));
      console.log(`     ${shots.get("roadmap") ? "✓" : "⚠"} roadmap`);

      // Try to open first roadmap action detail
      try {
        const firstAction = page.getByRole("link", { name: /action|priority|impact/i }).first();
        if (await firstAction.isVisible({ timeout: 3000 })) {
          await firstAction.click();
          await page.waitForTimeout(2000);
          shots.set("roadmap_detail", await takeValidatedScreenshot(page, "roadmap_detail"));
          console.log(`     ${shots.get("roadmap_detail") ? "✓" : "⚠"} roadmap_detail`);
        } else {
          // fallback — try clicking first row/card
          const firstCard = page.locator("[data-action], .action-card, [href*='/roadmap/']").first();
          if (await firstCard.isVisible({ timeout: 2000 })) {
            await firstCard.click();
            await page.waitForTimeout(2000);
            shots.set("roadmap_detail", await takeValidatedScreenshot(page, "roadmap_detail"));
            console.log(`     ${shots.get("roadmap_detail") ? "✓" : "⚠"} roadmap_detail (via card)`);
          }
        }
      } catch {
        console.log("     ⚠ Could not navigate to roadmap action detail");
      }
    }

    // ── Pre-Assessment ──────────────────────────────────────────────────
    console.log("  → Pre-assessment");
    if (await navigateAndWait(page, `${APP_URL}/pre-assessment/history`)) {
      await page.waitForTimeout(2000);
      shots.set("pre_assessment", await takeValidatedScreenshot(page, "pre_assessment"));
      console.log(`     ${shots.get("pre_assessment") ? "✓" : "⚠"} pre_assessment`);
    }

    // Pre-assessment findings
    if (await navigateAndWait(page, `${APP_URL}/pre-assessment/findings`)) {
      await page.waitForTimeout(2000);
      shots.set("pre_assessment_findings", await takeValidatedScreenshot(page, "pre_assessment_findings"));
      console.log(`     ${shots.get("pre_assessment_findings") ? "✓" : "⚠"} pre_assessment_findings`);
    }

    // ── Reports ─────────────────────────────────────────────────────────
    console.log("  → Reports");
    // Try common report routes
    for (const route of ["/reports", "/assessor/reports", "/assessor"]) {
      if (await navigateAndWait(page, `${APP_URL}${route}`, 8000)) {
        const bodyText = await page.evaluate<string>("document.body?.innerText ?? ''");
        if (bodyText.includes("Report") || bodyText.includes("Export") || bodyText.includes("Assessor")) {
          shots.set("reports", await takeValidatedScreenshot(page, "reports"));
          console.log(`     ${shots.get("reports") ? "✓" : "⚠"} reports (${route})`);
          break;
        }
      }
    }

    // ── Help Center ─────────────────────────────────────────────────────
    console.log("  → Help center");
    for (const route of ["/help", "/help-center", "/help/center"]) {
      if (await navigateAndWait(page, `${APP_URL}${route}`, 8000)) {
        const bodyText = await page.evaluate<string>("document.body?.innerText ?? ''");
        if (bodyText.includes("Help") || bodyText.includes("FAQ") || bodyText.includes("Article")) {
          shots.set("help_center", await takeValidatedScreenshot(page, "help_center"));
          console.log(`     ${shots.get("help_center") ? "✓" : "⚠"} help_center (${route})`);
          break;
        }
      }
    }

    // ── Org switcher ─────────────────────────────────────────────────────
    console.log("  → Org switcher");
    await navigateAndWait(page, `${APP_URL}/`);
    await page.waitForTimeout(1500);
    // Capture sidebar area
    try {
      const sidebarBox = await page.locator("aside, nav, [data-sidebar], .sidebar").first().boundingBox();
      if (sidebarBox) {
        shots.set("org_switcher", await takeValidatedScreenshot(page, "org_switcher", {
          clip: {
            x: sidebarBox.x,
            y: Math.max(0, sidebarBox.y + sidebarBox.height - 140),
            width: sidebarBox.width,
            height: 130,
          },
        }));
        console.log(`     ${shots.get("org_switcher") ? "✓" : "⚠"} org_switcher`);
      } else {
        // Fallback: full page screenshot cropped to left
        shots.set("org_switcher", await takeValidatedScreenshot(page, "org_switcher", {
          clip: { x: 0, y: 750, width: 280, height: 130 },
        }));
      }
    } catch {
      console.log("     ⚠ org_switcher capture failed");
    }

    const captured = [...shots.values()].filter(Boolean).length;
    console.log(`\n  📷 ${captured} / ${shots.size} screenshots captured`);

    // 5. Build HTML
    console.log("\n📄 Building guide HTML...");
    const html = buildGuideHtml(shots);
    const tmpHtml = path.join(os.tmpdir(), `user-guide-${Date.now()}.html`);
    fs.writeFileSync(tmpHtml, html, "utf8");

    // 6. Export PDF
    console.log("🖨  Generating PDF...");
    const pdfPage = await context.newPage();
    await pdfPage.goto(`file://${tmpHtml}`, { waitUntil: "networkidle", timeout: 30000 });
    await pdfPage.waitForTimeout(1000);

    await pdfPage.pdf({
      path: OUTPUT_PDF,
      format: "Letter",
      printBackground: true,
      margin: { top: "0.6in", bottom: "0.65in", left: "0.8in", right: "0.8in" },
      displayHeaderFooter: true,
      headerTemplate: `<div style="font-size:7pt;color:#94a3b8;width:100%;text-align:right;padding-right:0.8in;padding-top:4px;">
        Control HUB — Complete User Guide
      </div>`,
      footerTemplate: `<div style="font-size:7pt;color:#94a3b8;width:100%;display:flex;justify-content:space-between;padding:0 0.8in 4px;">
        <span>Confidential — Carme Technology</span>
        <span>Page <span class="pageNumber"></span> of <span class="totalPages"></span></span>
      </div>`,
    });

    fs.unlinkSync(tmpHtml);

    const stats = fs.statSync(OUTPUT_PDF);
    const sizeMb = (stats.size / 1024 / 1024).toFixed(2);

    console.log("\n" + "═".repeat(58));
    console.log("✅ User Guide generated successfully!");
    console.log("═".repeat(58));
    console.log(`\n📄 File:  ${OUTPUT_PDF}`);
    console.log(`📦 Size:  ${sizeMb} MB`);
    console.log(`📷 Screenshots: ${captured} captured`);
    console.log(`\n📂 Location: generated-guides/Control_HUB_Complete_User_Guide.pdf\n`);
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error("\n❌ User guide generation failed:", err);
  process.exit(1);
});
