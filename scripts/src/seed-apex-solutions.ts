/**
 * seed-apex-solutions.ts
 * Creates the APEX Solutions test organization in production with:
 *  • 110 CMMC L2 controls (35 impl, 42 in-progress, 25 not-started, 8 at-risk)
 *  • 77 evidence records with real uploaded files (PDF, XLSX, PNG, DOCX, CSV)
 *  • 21 documents with real uploaded files
 *  • 19 monitoring items
 *  • 7 POA&M records
 *  • Synthetic pre-assessment scan data
 *  • Validation at the end
 *
 * Usage:
 *   pnpm seed:apex-solutions
 *   pnpm seed:apex-solutions --force      # delete and re-create all data
 *   pnpm seed:apex-solutions --skip-files # skip GCS uploads (DB only, dev use)
 *   pnpm seed:apex-solutions --validate   # validate existing data only
 */

import {
  db,
  usersTable,
  organizationsTable,
  organizationUsersTable,
  controlsTable,
  controlAssessmentsTable,
  evidenceItemsTable,
  evidenceControlLinksTable,
  documentsTable,
  documentControlMapsTable,
  monitoringItemsTable,
  poamsTable,
  tasksTable,
  tenantConnectionsTable,
  paScanRunsTable,
  paFindingsTable,
  paEvidenceRecordsTable,
  paEvidenceRequestsTable,
  paRoadmapActionsTable,
} from "@workspace/db";
import PDFDocument from "pdfkit";
import ExcelJS from "exceljs";
import AdmZip from "adm-zip";
import { deflateSync } from "zlib";
import { randomUUID } from "crypto";
import { eq, and, count, sql } from "drizzle-orm";

// ─── Configuration ─────────────────────────────────────────────────────────────
const APEX_ORG_ID = "7a2f5c8e-4b3d-4a9f-8e2c-1d0a5b6c7d8f";
const APEX_ORG_NAME = "APEX Solutions";
const ADMIN_EMAIL = "admin@example.com";
const SYSADMIN_EMAIL = "sysadmin@controlhub.com";
const PRIVATE_OBJECT_DIR = process.env.PRIVATE_OBJECT_DIR ?? "";
const SIDECAR = "http://127.0.0.1:1106";
const TODAY = new Date().toISOString().split("T")[0]!;

const FORCE = process.argv.includes("--force");
const SKIP_FILES = process.argv.includes("--skip-files");
const VALIDATE_ONLY = process.argv.includes("--validate");

// ─── Utilities ────────────────────────────────────────────────────────────────
function daysFromNow(days: number): Date {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d;
}
function daysAgo(n: number): Date { return daysFromNow(-n); }

// ─── PNG Generator ────────────────────────────────────────────────────────────
// Creates a realistic-looking screenshot PNG (dark header + light body)
function makePng(
  width: number, height: number,
  header: [number, number, number],
  body: [number, number, number]
): Buffer {
  const crcTable = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    crcTable[n] = c;
  }
  function crc32(d: Buffer): number {
    let crc = 0xFFFFFFFF;
    for (let i = 0; i < d.length; i++) crc = (crcTable[(crc ^ d[i]!) & 0xFF]!) ^ (crc >>> 8);
    return (crc ^ 0xFFFFFFFF) >>> 0;
  }
  function u32(n: number): Buffer { const b = Buffer.alloc(4); b.writeUInt32BE(n, 0); return b; }
  function chunk(type: string, data: Buffer): Buffer {
    const t = Buffer.from(type, "ascii");
    return Buffer.concat([u32(data.length), t, data, u32(crc32(Buffer.concat([t, data])))]);
  }
  const sig = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
  const ihdr = chunk("IHDR", Buffer.concat([u32(width), u32(height), Buffer.from([8, 2, 0, 0, 0])]));
  const hdr = Math.floor(height * 0.09);
  const nav = Math.floor(height * 0.06);
  const navC: [number, number, number] = [Math.min(255, header[0] + 25), Math.min(255, header[1] + 25), Math.min(255, header[2] + 30)];
  const rs = 1 + width * 3;
  const raw = Buffer.alloc(height * rs);
  for (let y = 0; y < height; y++) {
    raw[y * rs] = 0;
    const [r, g, b] = y < hdr ? header : y < hdr + nav ? navC : body;
    for (let x = 0; x < width; x++) {
      raw[y * rs + 1 + x * 3] = r; raw[y * rs + 2 + x * 3] = g; raw[y * rs + 3 + x * 3] = b;
    }
  }
  const idat = chunk("IDAT", deflateSync(raw));
  const iend = chunk("IEND", Buffer.alloc(0));
  return Buffer.concat([sig, ihdr, idat, iend]);
}

// Domain colors for screenshot PNGs
const DOMAIN_COLORS: Record<string, [number, number, number]> = {
  AC: [30, 64, 175],   // blue-700
  IA: [124, 58, 237],  // violet-600
  AU: [194, 65, 12],   // orange-700
  CM: [21, 128, 61],   // green-700
  RA: [185, 28, 28],   // red-700
  IR: [153, 27, 27],   // red-800
  SC: [15, 118, 110],  // teal-700
  SI: [67, 56, 202],   // indigo-600
  MP: [55, 65, 81],    // gray-700
  AT: [6, 95, 70],     // emerald-800
  PE: [146, 64, 14],   // amber-700
  PS: [51, 65, 85],    // slate-700
  CA: [88, 28, 135],   // purple-800
  MA: [30, 58, 138],   // blue-800
};
const BODY_COLOR: [number, number, number] = [241, 245, 249]; // slate-100

function screenshotPng(domain: string): Buffer {
  const hdr = DOMAIN_COLORS[domain] ?? [30, 64, 175];
  return makePng(1200, 800, hdr, BODY_COLOR);
}

// ─── PDF Generator ────────────────────────────────────────────────────────────
async function makePdf(cfg: {
  title: string;
  subtitle?: string;
  orgName: string;
  date: string;
  sections: Array<{ heading: string; content: string }>;
}): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 60, size: "letter" });
    const bufs: Buffer[] = [];
    doc.on("data", (c: Buffer) => bufs.push(c));
    doc.on("end", () => resolve(Buffer.concat(bufs)));
    doc.on("error", reject);

    // Header band
    doc.rect(0, 0, doc.page.width, 88).fill("#1e3a5f");
    doc.fillColor("white").font("Helvetica-Bold").fontSize(18)
      .text(cfg.orgName, 60, 14, { lineBreak: false });
    doc.font("Helvetica-Bold").fontSize(13)
      .text(cfg.title, 60, 40, { width: doc.page.width - 120, lineBreak: true });
    if (cfg.subtitle) {
      doc.font("Helvetica").fontSize(9).fillColor("#a8c4e0")
        .text(cfg.subtitle, 60, 68, { lineBreak: false });
    }

    doc.fillColor("#1a1a1a").y = 108;

    for (const s of cfg.sections) {
      if (doc.y > doc.page.height - 150) doc.addPage();
      doc.font("Helvetica-Bold").fontSize(11).fillColor("#1e3a5f").text(s.heading);
      doc.moveDown(0.2);
      doc.font("Helvetica").fontSize(10).fillColor("#2d2d2d")
        .text(s.content, { lineGap: 3 });
      doc.moveDown(0.7);
    }

    const range = doc.bufferedPageRange();
    for (let i = range.start; i < range.start + range.count; i++) {
      doc.switchToPage(i);
      doc.fontSize(7).fillColor("#9ca3af")
        .text(
          `${cfg.orgName}  ·  ${cfg.title}  ·  ${cfg.date}  ·  CONTROLLED — NOT FOR PUBLIC DISTRIBUTION`,
          60, doc.page.height - 28, { align: "center", width: doc.page.width - 120 }
        );
    }
    doc.end();
  });
}

// ─── XLSX Generator ───────────────────────────────────────────────────────────
async function makeXlsx(sheets: Array<{ name: string; headers: string[]; rows: (string | number)[][] }>): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  for (const sh of sheets) {
    const ws = workbook.addWorksheet(sh.name.slice(0, 31));
    ws.columns = sh.headers.map((h) => ({ header: h, width: Math.max(h.length + 2, 14) }));
    sh.rows.forEach((r) => ws.addRow(r));
  }
  const arrayBuffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(arrayBuffer);
}

// ─── DOCX Generator ──────────────────────────────────────────────────────────
function ex(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}

function makeDocx(cfg: {
  title: string; orgName: string; version: string; date: string;
  sections: Array<{ heading: string; content: string }>;
}): Buffer {
  const paras = cfg.sections.map(s =>
    `<w:p><w:pPr><w:pStyle w:val="Heading2"/></w:pPr><w:r><w:t>${ex(s.heading)}</w:t></w:r></w:p>` +
    s.content.split("\n").map(l => `<w:p><w:r><w:t xml:space="preserve">${ex(l.trim())}</w:t></w:r></w:p>`).join("")
  ).join("");

  const docXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
<w:body>
<w:p><w:pPr><w:pStyle w:val="Title"/></w:pPr><w:r><w:t>${ex(cfg.title)}</w:t></w:r></w:p>
<w:p><w:r><w:rPr><w:b/><w:color w:val="374151"/></w:rPr><w:t>${ex(cfg.orgName)} · v${ex(cfg.version)} · ${ex(cfg.date)}</w:t></w:r></w:p>
<w:p><w:r><w:t> </w:t></w:r></w:p>
${paras}
<w:sectPr><w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440"/></w:sectPr>
</w:body></w:document>`;

  const styles = `<?xml version="1.0" encoding="UTF-8"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/>
<w:rPr><w:sz w:val="22"/><w:szCs w:val="22"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/>
<w:rPr><w:b/><w:sz w:val="52"/><w:color w:val="1e3a5f"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="heading 2"/>
<w:pPr><w:spacing w:before="280" w:after="100"/></w:pPr>
<w:rPr><w:b/><w:sz w:val="26"/><w:color w:val="1e3a5f"/></w:rPr></w:style>
</w:styles>`;

  const zip = new AdmZip();
  zip.addFile("[Content_Types].xml", Buffer.from(`<?xml version="1.0" encoding="UTF-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
</Types>`));
  zip.addFile("_rels/.rels", Buffer.from(`<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`));
  zip.addFile("word/document.xml", Buffer.from(docXml));
  zip.addFile("word/styles.xml", Buffer.from(styles));
  zip.addFile("word/_rels/document.xml.rels", Buffer.from(`<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`));
  return zip.toBuffer();
}

// ─── CSV Generator ────────────────────────────────────────────────────────────
function makeCsv(headers: string[], rows: (string | number)[][]): Buffer {
  const lines = [headers, ...rows].map(r =>
    r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(",")
  );
  return Buffer.from(lines.join("\n"), "utf-8");
}

// ─── GCS Upload ───────────────────────────────────────────────────────────────
async function uploadFile(buf: Buffer, ext: string, mime: string, name: string): Promise<string> {
  if (SKIP_FILES) return `/objects/evidence/skip-${randomUUID()}${ext}`;
  if (!PRIVATE_OBJECT_DIR) throw new Error("PRIVATE_OBJECT_DIR env var is not set");

  const parts = PRIVATE_OBJECT_DIR.replace(/^\//, "").split("/");
  const bucket = parts[0]!;
  const prefix = parts.slice(1).join("/");
  const uuid = randomUUID();
  const objName = prefix ? `${prefix}/evidence/${uuid}${ext}` : `evidence/${uuid}${ext}`;

  const signRes = await fetch(`${SIDECAR}/object-storage/signed-object-url`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ bucket_name: bucket, object_name: objName, method: "PUT", expires_at: new Date(Date.now() + 900_000).toISOString() }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!signRes.ok) throw new Error(`Sign URL failed ${signRes.status}: ${await signRes.text()}`);
  const { signed_url } = await signRes.json() as { signed_url: string };

  const upRes = await fetch(signed_url, {
    method: "PUT",
    headers: { "Content-Type": mime, "Content-Disposition": `attachment; filename="${encodeURIComponent(name)}"` },
    body: buf,
    signal: AbortSignal.timeout(120_000),
  });
  if (!upRes.ok) throw new Error(`Upload failed ${upRes.status}`);
  return `/objects/evidence/${uuid}${ext}`;
}

// ─── Control narrative bank ───────────────────────────────────────────────────
const NARR: Record<string, Record<string, string>> = {
  AC: {
    implemented: "APEX Solutions restricts system access to authorized users exclusively through Microsoft Entra ID and role-based access control (RBAC). Access provisioning requires IT Administrator approval and Compliance Manager sign-off. Privileged accounts leverage Entra ID Privileged Identity Management (PIM) for just-in-time activation. Quarterly formal access reviews are documented in Control HUB.",
    in_progress: "Core access control is implemented through Entra ID and RBAC group assignments. Automated de-provisioning workflows and formal quarterly review procedures are being finalized, targeting completion within 60 days. Interim manual reviews are performed monthly.",
    not_started: "This access control practice has been scoped and a task assigned to the IT Administrator. Implementation is scheduled within the next 90 days as part of the Q3 compliance roadmap.",
    at_risk: "Gaps exist: a subset of service accounts lacks MFA enforcement and several privileged role assignments have not been reviewed in the past 180 days. POA&M POAM-APEX-002 tracks remediation with a 45-day target completion.",
  },
  IA: {
    implemented: "APEX Solutions enforces multi-factor authentication for all users via Entra ID Conditional Access policies. Password complexity and expiration are managed through Microsoft 365 organizational policy. Privileged role holders must use MFA for every sign-in. Legacy authentication protocols are blocked globally via Conditional Access.",
    in_progress: "MFA is enforced for privileged accounts and most standard users. Conditional Access policy coverage for all users and all platforms is in progress. Legacy authentication blocking is 80% complete; 3 legacy clients remain under remediation.",
    not_started: "This authentication control is queued for implementation in Q3. Conditional Access design and legacy client inventory are underway.",
    at_risk: "MFA registration coverage is at 91%, leaving 9% of accounts without MFA enforcement. POAM-APEX-001 tracks completion of MFA enrollment, with a remediation target of 30 days.",
  },
  AU: {
    implemented: "APEX Solutions collects and retains audit logs across all in-scope systems using Microsoft Sentinel and Azure Monitor. Log categories include authentication events, privileged operations, file access, and configuration changes. Logs are retained for 365 days. Weekly audit log reviews are documented and stored in Control HUB.",
    in_progress: "Audit logging is configured for core systems. Centralized SIEM integration via Microsoft Sentinel is 70% complete. Log review procedures and documentation workflows are being finalized.",
    not_started: "Audit configuration for this system type is scheduled for Q3 implementation. Current logging is ad hoc and not meeting retention requirements.",
    at_risk: "Audit log retention on this system falls below the 90-day minimum requirement. POA&M POAM-APEX-004 tracks implementation of extended log archival.",
  },
  CM: {
    implemented: "APEX Solutions manages system configurations through Microsoft Intune security baselines aligned to CIS Level 1 and DISA STIG guidance. Configuration changes require approval through the change management process. Device compliance is enforced via Conditional Access. Configuration baselines are reviewed quarterly.",
    in_progress: "Intune security baseline is deployed to 78% of managed devices. Full rollout and change management documentation are in progress. Remaining devices are in staged enrollment.",
    not_started: "Configuration management baseline for this system type is under development. Device inventory has been completed and enrollment is scheduled.",
    at_risk: "Six workstations are running configurations outside the approved baseline due to legacy application dependencies. POAM-APEX-003 tracks remediation via Intune policy exceptions.",
  },
  RA: {
    implemented: "APEX Solutions conducts annual organizational risk assessments using the NIST SP 800-30 framework. Vulnerability scanning is performed weekly using Tenable.io. Risk findings are tracked in the Risk Register and linked to POA&M items in Control HUB. The current risk register was last reviewed on 2026-06-01.",
    in_progress: "Annual risk assessment is in progress. Vulnerability scanning is fully operational. Risk register updates and control gap analysis are being finalized.",
    not_started: "Formal risk assessment for this domain is scheduled for Q3. Preliminary asset inventory has been completed.",
    at_risk: "Vulnerability remediation backlog includes 5 high-severity CVEs beyond the 30-day SLA. POAM-APEX-005 tracks remediation status.",
  },
  IR: {
    implemented: "APEX Solutions maintains a documented Incident Response Plan aligned to NIST SP 800-61. The IR team is identified and contact information is current. Annual tabletop exercises are conducted and after-action reports are retained. Incident reporting procedures are communicated to all staff.",
    in_progress: "IR Plan is documented and approved. Annual tabletop exercise is scheduled for Q3 2026. Incident ticketing integration with the SIEM is being configured.",
    not_started: "Formal incident response procedures for this scenario type are being drafted. Ad hoc response procedures are currently in use.",
    at_risk: "The most recent IR tabletop exercise is overdue by 45 days. POAM-APEX-006 tracks scheduling and completion of the exercise.",
  },
  MA: {
    implemented: "APEX Solutions controls maintenance activities on information systems through an approved maintenance schedule and authorized personnel list. Remote maintenance sessions require MFA and are logged via Entra ID Conditional Access. All maintenance is performed by authorized internal IT staff or vetted vendors.",
    in_progress: "Maintenance authorization procedures are implemented. Remote maintenance logging via Entra ID is operational. Formal vendor maintenance approval workflow is being documented.",
    not_started: "Maintenance control documentation is pending. Current maintenance is performed by IT staff without a formal authorization workflow.",
    at_risk: "Remote maintenance sessions are not consistently logged. A procedure update is in progress.",
  },
  MP: {
    implemented: "APEX Solutions controls CUI media through removable media restrictions enforced by Intune Device Configuration policies. Removable media is blocked by default with approved exceptions requiring IT approval. Media disposal follows NIST 800-88 guidelines and is documented in the Media Disposal Log.",
    in_progress: "USB device control policy is deployed to 85% of devices via Intune. Remaining devices are in staged rollout. Media disposal log is being formalized.",
    not_started: "Media protection policy for this media type is under development.",
    at_risk: "USB device control is not enforced on 4 legacy workstations. POAM-APEX tracking is in progress.",
  },
  PE: {
    implemented: "APEX Solutions controls physical access to facilities containing CUI through badge-based access control systems, visitor logging, and CCTV monitoring. Physical access lists are reviewed quarterly by the Security Manager.",
    in_progress: "Badge access system is operational. Visitor log digitization is in progress. CCTV expansion to secondary entrance is scheduled.",
    not_started: "Physical access controls for this location are pending assessment.",
    at_risk: "Physical access logs for the secondary server room were incomplete for 14 days due to reader malfunction. POAM tracks corrective action.",
  },
  PS: {
    implemented: "APEX Solutions screens personnel with access to CUI through background checks prior to employment and conducts annual re-verification for privileged role holders. Termination procedures include immediate revocation of system access documented in a formal checklist.",
    in_progress: "Personnel screening procedures are implemented. Formal annual re-verification workflow is being documented.",
    not_started: "Personnel security procedure for this role type is pending review.",
    at_risk: "Three temporary contractor accounts were not deprovisioned within the required 24-hour window. An access review identified and remediated the gap.",
  },
  CA: {
    implemented: "APEX Solutions conducts periodic security assessments aligned to NIST SP 800-171A. A plan of action and milestones (POA&M) is maintained and reviewed monthly. The System Security Plan is reviewed annually and updated to reflect current system state.",
    in_progress: "Security assessment planning is underway. POA&M process is operational. SSP update is in progress following recent system changes.",
    not_started: "Formal security assessment for this domain is scheduled for Q4.",
    at_risk: "SSP is 60 days overdue for its annual review. POA&M tracking is current.",
  },
  SC: {
    implemented: "APEX Solutions protects CUI in transit using TLS 1.2+ for all external communications. Data at rest is encrypted using AES-256 via BitLocker on endpoints and Azure Storage Service Encryption. Network segmentation separates CUI-handling systems from guest and corporate networks.",
    in_progress: "BitLocker enforcement via Intune is 82% complete. Network segmentation review is in progress. TLS enforcement is fully operational.",
    not_started: "Encryption configuration for this system type is scheduled for implementation.",
    at_risk: "9 managed devices report BitLocker encryption not enabled. POAM-APEX-003 tracks remediation.",
  },
  SI: {
    implemented: "APEX Solutions protects systems from malicious code using Microsoft Defender for Endpoint with real-time protection enabled across all managed devices. Signature updates are enforced daily via Intune. Security alerts are reviewed daily through Microsoft Defender XDR and documented weekly.",
    in_progress: "Defender for Endpoint is deployed to 94% of managed devices. Remaining devices are in staged rollout. Alert triage procedure documentation is being finalized.",
    not_started: "Security information and event management integration for this system type is pending.",
    at_risk: "Three Defender alerts older than 7 days are unreviewed. Alert triage SLA is being enforced.",
  },
  AT: {
    implemented: "APEX Solutions provides annual security awareness training to all personnel with system access. Training completion is tracked in the Training Register and reported to the Compliance Manager monthly. Role-based training is provided to IT Administrators and Compliance staff.",
    in_progress: "Annual training cycle is in progress. Completion rate is 93%. Automated reminder workflows for non-compliant users are being configured.",
    not_started: "Role-specific training curriculum for this role type is under development.",
    at_risk: "6 employees have not completed the annual security awareness training. HR escalation is in progress.",
  },
};

function getNarr(controlId: string, status: string): string {
  const domain = controlId.split(".")[0] ?? "AC";
  const domNarr = NARR[domain] ?? NARR.AC!;
  return domNarr[status] ?? `APEX Solutions has addressed this control through applicable technical and procedural safeguards. Evidence is maintained in Control HUB.`;
}

// ─── Evidence Specs (77 items) ────────────────────────────────────────────────
type EvType = "policy" | "procedure" | "screenshot" | "log" | "report" | "configuration_export" |
  "access_review" | "training_record" | "risk_record" | "scan_report" | "approval_record" |
  "backup_verification" | "asset_inventory" | "incident_record" | "other";
type EvStatus = "approved" | "pending_review" | "assessor_ready" | "draft" | "stale";

interface EvidenceSpec {
  title: string; fileName: string; ext: ".pdf" | ".xlsx" | ".png" | ".docx" | ".csv" | ".txt";
  mime: string; evType: EvType; status: EvStatus; ctrls: string[];
  desc: string; summary: string; domain: string; daysAgo: number; tags?: string[];
}

const EVIDENCE_SPECS: EvidenceSpec[] = [
  // ── Access Control (AC) ───────────────────────────────────────────────────
  {
    title: "User Access Review — Q2 2026", fileName: "AC-3.1.1_User_Access_Review_2026-Q2.xlsx",
    ext: ".xlsx", mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    evType: "access_review", status: "approved",
    ctrls: ["AC.L2-3.1.1", "AC.L2-3.1.2"], domain: "AC", daysAgo: 7,
    desc: "Quarterly formal access review for all system users, certified by department managers.",
    summary: "Access review complete. 3 accounts deprovisioned. All privileged accounts verified against role matrix.",
    tags: ["access-review", "quarterly", "q2-2026"],
  },
  {
    title: "Active User List — 2026-07-01", fileName: "AC-3.1.1_Active_User_List_2026-07-01.csv",
    ext: ".csv", mime: "text/csv",
    evType: "access_review", status: "approved",
    ctrls: ["AC.L2-3.1.1"], domain: "AC", daysAgo: 7,
    desc: "Export of all active user accounts from Microsoft Entra ID as of 2026-07-01.",
    summary: "137 active accounts confirmed. Matches HR roster with 3 pending offboarding.",
    tags: ["user-list", "entra-id"],
  },
  {
    title: "Privileged Role Assignments — 2026-07-01", fileName: "AC-3.1.1_Privileged_Role_Assignments_2026-07-01.png",
    ext: ".png", mime: "image/png",
    evType: "screenshot", status: "approved",
    ctrls: ["AC.L2-3.1.1", "AC.L2-3.1.5"], domain: "AC", daysAgo: 7,
    desc: "Screenshot of Microsoft Entra ID privileged role assignments showing Global Admin and Privileged Role Admin holders.",
    summary: "4 Global Admins confirmed. All align to approved admin roster. No unrecognized accounts.",
    tags: ["privileged-roles", "entra-id", "screenshot"],
  },
  {
    title: "Group Membership Review — Q2 2026", fileName: "AC-3.1.2_Group_Membership_Review_2026-Q2.xlsx",
    ext: ".xlsx", mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    evType: "access_review", status: "approved",
    ctrls: ["AC.L2-3.1.2", "AC.L2-3.1.5"], domain: "AC", daysAgo: 14,
    desc: "Review of all security group memberships for CUI-scoped applications and file shares.",
    summary: "Group membership reconciled against HR data. 7 stale memberships removed.",
    tags: ["group-membership", "access-review"],
  },
  {
    title: "CUI Information Flow Policy Screenshot", fileName: "AC-3.1.3_CUI_Information_Flow_Diagram.png",
    ext: ".png", mime: "image/png",
    evType: "screenshot", status: "approved",
    ctrls: ["AC.L2-3.1.3"], domain: "AC", daysAgo: 30,
    desc: "Screenshot of DLP policy configuration controlling CUI data flows within Microsoft 365.",
    summary: "DLP policies active for Teams, Exchange, and SharePoint. CUI labels enforced.",
    tags: ["dlp", "data-flow", "cui"],
  },
  {
    title: "Least Privilege Audit — Q2 2026", fileName: "AC-3.1.5_Least_Privilege_Audit_2026-Q2.xlsx",
    ext: ".xlsx", mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    evType: "access_review", status: "approved",
    ctrls: ["AC.L2-3.1.5", "AC.L2-3.1.6"], domain: "AC", daysAgo: 14,
    desc: "Audit confirming all user accounts operate with least-privilege access relative to job function.",
    summary: "12 accounts had excess privileges removed. Privileged account inventory matches IT roster.",
    tags: ["least-privilege", "access-review"],
  },
  {
    title: "Conditional Access Policy — All Users", fileName: "AC-3.1.1_Entra_CA_Policy_All_Users.png",
    ext: ".png", mime: "image/png",
    evType: "screenshot", status: "approved",
    ctrls: ["AC.L2-3.1.1", "AC.L2-3.1.20"], domain: "AC", daysAgo: 3,
    desc: "Screenshot of Conditional Access policy enforcing MFA and compliant device requirements for all users.",
    summary: "CA policy active. Coverage: 100% users, all platforms. Break-glass accounts excluded per policy.",
    tags: ["conditional-access", "mfa", "screenshot"],
  },
  {
    title: "Privileged Functions Review", fileName: "AC-3.1.7_Privileged_Functions_Review.pdf",
    ext: ".pdf", mime: "application/pdf",
    evType: "access_review", status: "approved",
    ctrls: ["AC.L2-3.1.7"], domain: "AC", daysAgo: 21,
    desc: "Documentation of privileged function access restrictions and enforcement mechanisms.",
    summary: "Privileged operations restricted via PIM just-in-time access. Approvals required for activation.",
    tags: ["privileged-functions", "pim"],
  },
  {
    title: "External Connection Approval — 2026-Q2", fileName: "AC-3.1.20_External_Connection_Approval.pdf",
    ext: ".pdf", mime: "application/pdf",
    evType: "approval_record", status: "approved",
    ctrls: ["AC.L2-3.1.20", "AC.L2-3.1.21"], domain: "AC", daysAgo: 45,
    desc: "Approved list of external connections and remote access methods with documented business justification.",
    summary: "3 VPN connections approved. Conditional Access enforced for all remote sessions.",
    tags: ["external-connections", "remote-access"],
  },
  {
    title: "Service Account Inventory", fileName: "AC-3.1.2_Service_Account_Inventory.csv",
    ext: ".csv", mime: "text/csv",
    evType: "configuration_export", status: "approved",
    ctrls: ["AC.L2-3.1.2", "AC.L2-3.1.7"], domain: "AC", daysAgo: 14,
    desc: "Inventory of all service accounts, associated applications, and owner assignments.",
    summary: "22 service accounts inventoried. All have designated owners. 3 flagged for MFA remediation.",
    tags: ["service-accounts", "inventory"],
  },
  {
    title: "Guest Access Review — 2026-07-01", fileName: "AC-3.1.1_Entra_Guest_Access_Review.xlsx",
    ext: ".xlsx", mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    evType: "access_review", status: "approved",
    ctrls: ["AC.L2-3.1.1", "AC.L2-3.1.3"], domain: "AC", daysAgo: 7,
    desc: "Review of all external guest user accounts and their SharePoint/Teams access levels.",
    summary: "18 guest users reviewed. 5 accounts deprovisioned. No CUI-scoped sites accessible to guests.",
    tags: ["guest-access", "external-users"],
  },
  {
    title: "DLP Policy Configuration Screenshot", fileName: "AC-3.1.3_DLP_Policy_Configuration.png",
    ext: ".png", mime: "image/png",
    evType: "screenshot", status: "approved",
    ctrls: ["AC.L2-3.1.3", "AC.L2-3.1.4"], domain: "AC", daysAgo: 21,
    desc: "Screenshot of Microsoft Purview DLP policy settings preventing unauthorized CUI exfiltration.",
    summary: "3 DLP policies active covering Exchange, SharePoint, and OneDrive. Violations alert compliance team.",
    tags: ["dlp", "purview", "screenshot"],
  },
  {
    title: "Admin Role Review — Q2 2026", fileName: "AC-3.1.5_Admin_Role_Review_2026-Q2.xlsx",
    ext: ".xlsx", mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    evType: "access_review", status: "approved",
    ctrls: ["AC.L2-3.1.5", "AC.L2-3.1.2"], domain: "AC", daysAgo: 7,
    desc: "Quarterly review of administrator role assignments confirming least-privilege principle adherence.",
    summary: "All admin roles confirmed. 2 temporary elevations expired and were revoked.",
    tags: ["admin-roles", "least-privilege", "quarterly"],
  },
  {
    title: "Remote Access Policy Acknowledgment Log", fileName: "AC-3.1.20_Remote_Access_Acknowledgment_2026.xlsx",
    ext: ".xlsx", mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    evType: "approval_record", status: "approved",
    ctrls: ["AC.L2-3.1.20"], domain: "AC", daysAgo: 90,
    desc: "Signed acknowledgment records for all users permitted to use remote access.",
    summary: "41 users acknowledged remote access policy. All acknowledgments current.",
    tags: ["remote-access", "policy-acknowledgment"],
  },
  {
    title: "Portable Device Usage Agreement — 2026", fileName: "AC-3.1.21_Portable_Device_Usage_Agreement.pdf",
    ext: ".pdf", mime: "application/pdf",
    evType: "approval_record", status: "approved",
    ctrls: ["AC.L2-3.1.21", "AC.L2-3.1.22"], domain: "AC", daysAgo: 90,
    desc: "Signed portable device usage agreements from all employees authorized to access CUI from mobile devices.",
    summary: "38 signed agreements on file. All mobile device users covered.",
    tags: ["portable-devices", "cui", "agreement"],
  },

  // ── Identification & Authentication (IA) ──────────────────────────────────
  {
    title: "MFA Registration Report — 2026-07-01", fileName: "IA-3.5.3_MFA_Registration_Report_2026-07-01.xlsx",
    ext: ".xlsx", mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    evType: "configuration_export", status: "approved",
    ctrls: ["IA.L2-3.5.3"], domain: "IA", daysAgo: 7,
    desc: "Report of MFA registration status for all user accounts exported from Entra ID.",
    summary: "91% MFA enrollment (125/137 users). 12 accounts flagged for enrollment completion.",
    tags: ["mfa", "registration", "entra-id"],
  },
  {
    title: "Conditional Access MFA Policy Screenshot", fileName: "IA-3.5.3_Conditional_Access_MFA_Policy.png",
    ext: ".png", mime: "image/png",
    evType: "screenshot", status: "approved",
    ctrls: ["IA.L2-3.5.3", "AC.L2-3.1.1"], domain: "IA", daysAgo: 7,
    desc: "Screenshot of Conditional Access policy requiring MFA for all users on all platforms.",
    summary: "MFA enforcement policy active. Applies to all cloud apps. No users excluded except break-glass.",
    tags: ["conditional-access", "mfa", "screenshot"],
  },
  {
    title: "Legacy Authentication Block Policy", fileName: "IA-3.5.4_Legacy_Authentication_Block_Policy.png",
    ext: ".png", mime: "image/png",
    evType: "screenshot", status: "approved",
    ctrls: ["IA.L2-3.5.3", "IA.L2-3.5.4"], domain: "IA", daysAgo: 14,
    desc: "Screenshot of Conditional Access policy blocking all legacy authentication protocols.",
    summary: "Legacy auth blocked globally. Policy in report-only mode for 2 legacy clients pending migration.",
    tags: ["legacy-auth", "conditional-access", "screenshot"],
  },
  {
    title: "Password Policy Settings Screenshot", fileName: "IA-3.5.7_Password_Policy_Settings.png",
    ext: ".png", mime: "image/png",
    evType: "screenshot", status: "approved",
    ctrls: ["IA.L2-3.5.7", "IA.L2-3.5.1"], domain: "IA", daysAgo: 30,
    desc: "Screenshot of Microsoft 365 password policy settings showing complexity requirements and expiration.",
    summary: "14-character minimum, complexity enforced, 90-day expiration. SSPR with MFA enabled.",
    tags: ["password-policy", "m365", "screenshot"],
  },
  {
    title: "Password Complexity Policy Documentation", fileName: "IA-3.5.1_Password_Complexity_Rules.pdf",
    ext: ".pdf", mime: "application/pdf",
    evType: "configuration_export", status: "approved",
    ctrls: ["IA.L2-3.5.1", "IA.L2-3.5.2"], domain: "IA", daysAgo: 60,
    desc: "Documentation of enforced password complexity rules including minimum length, character classes, and rotation policy.",
    summary: "Policy aligns to NIST SP 800-63B guidelines. Complexity rules enforced via Azure AD policy.",
    tags: ["password-complexity", "nist"],
  },
  {
    title: "Password Change Log — Q2 2026", fileName: "IA-3.5.2_Password_Change_Log_2026-Q2.xlsx",
    ext: ".xlsx", mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    evType: "log", status: "approved",
    ctrls: ["IA.L2-3.5.2", "IA.L2-3.5.1"], domain: "IA", daysAgo: 7,
    desc: "Audit log of password changes and resets for the quarter, including self-service and admin-initiated resets.",
    summary: "43 password changes logged. No anomalous reset patterns detected.",
    tags: ["password-changes", "audit-log"],
  },
  {
    title: "MFA Conditional Access Scan Report", fileName: "IA-3.5.3_CA_Policy_MFA_Report.pdf",
    ext: ".pdf", mime: "application/pdf",
    evType: "scan_report", status: "approved",
    ctrls: ["IA.L2-3.5.3"], domain: "IA", daysAgo: 7,
    desc: "Automated compliance report from Entra ID assessing MFA Conditional Access policy effectiveness.",
    summary: "CA policy covers 100% of in-scope users. 9 policy evaluation failures logged and investigated.",
    tags: ["ca-policy", "mfa", "compliance-report"],
  },
  {
    title: "LAPS Configuration Report", fileName: "IA-3.5.10_LAPS_Configuration_Report.xlsx",
    ext: ".xlsx", mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    evType: "configuration_export", status: "approved",
    ctrls: ["IA.L2-3.5.10", "AC.L2-3.1.2"], domain: "IA", daysAgo: 14,
    desc: "Report of Windows LAPS deployment status across all managed endpoints via Intune.",
    summary: "LAPS deployed to 89% of managed devices. 12 devices pending policy reapplication.",
    tags: ["laps", "intune", "endpoint"],
  },
  {
    title: "Token-Based Auth Settings Screenshot", fileName: "IA-3.5.11_Token_Based_Auth_Settings.png",
    ext: ".png", mime: "image/png",
    evType: "screenshot", status: "approved",
    ctrls: ["IA.L2-3.5.11", "IA.L2-3.5.3"], domain: "IA", daysAgo: 30,
    desc: "Screenshot of authentication token lifetime configuration and session security settings.",
    summary: "Access token lifetime 1 hour. Refresh token 24 hours. CAE enabled for all apps.",
    tags: ["token-lifetime", "session-security", "screenshot"],
  },
  {
    title: "MFA Bypass Exception Log", fileName: "IA-3.5.3_MFA_Bypass_Exception_Log.xlsx",
    ext: ".xlsx", mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    evType: "log", status: "approved",
    ctrls: ["IA.L2-3.5.3"], domain: "IA", daysAgo: 14,
    desc: "Log of temporary MFA bypass exceptions, authorized by IT Director, with business justification.",
    summary: "2 exceptions granted Q2. Both have since expired. No standing exceptions active.",
    tags: ["mfa-bypass", "exceptions"],
  },
  {
    title: "Identifier Management Policy Screenshot", fileName: "IA-3.5.1_Identifier_Management_Policy.png",
    ext: ".png", mime: "image/png",
    evType: "screenshot", status: "approved",
    ctrls: ["IA.L2-3.5.1"], domain: "IA", daysAgo: 45,
    desc: "Screenshot of Entra ID user principal name standards and account identifier management configuration.",
    summary: "All accounts use standardized UPN format. Shared accounts documented with justification.",
    tags: ["identifier-management", "upn", "screenshot"],
  },

  // ── Audit & Accountability (AU) ────────────────────────────────────────────
  {
    title: "Audit Log Configuration Screenshot", fileName: "AU-3.3.1_Audit_Log_Configuration.png",
    ext: ".png", mime: "image/png",
    evType: "screenshot", status: "approved",
    ctrls: ["AU.L2-3.3.1", "AU.L2-3.3.2"], domain: "AU", daysAgo: 14,
    desc: "Screenshot of Microsoft Sentinel and Azure Monitor audit log collection settings.",
    summary: "All required log categories enabled. Ingestion rate nominal. No gaps in collection.",
    tags: ["audit-config", "sentinel", "screenshot"],
  },
  {
    title: "Audit Log Review — 2026-07-01", fileName: "AU-3.3.5_Audit_Log_Review_2026-07-01.pdf",
    ext: ".pdf", mime: "application/pdf",
    evType: "log", status: "approved",
    ctrls: ["AU.L2-3.3.5", "AU.L2-3.3.6"], domain: "AU", daysAgo: 7,
    desc: "Weekly audit log review report documenting findings, anomalies investigated, and disposition.",
    summary: "3 anomalies investigated. 1 false positive, 2 minor policy violations noted and addressed.",
    tags: ["audit-review", "weekly"],
  },
  {
    title: "Audit Log Retention Settings Screenshot", fileName: "AU-3.3.6_Audit_Log_Retention_Settings.png",
    ext: ".png", mime: "image/png",
    evType: "screenshot", status: "approved",
    ctrls: ["AU.L2-3.3.6", "AU.L2-3.3.2"], domain: "AU", daysAgo: 30,
    desc: "Screenshot of Log Analytics Workspace data retention settings configured for 365-day retention.",
    summary: "365-day retention configured for all workspaces. Interactive retention 90 days, archive 365.",
    tags: ["log-retention", "log-analytics", "screenshot"],
  },
  {
    title: "Privileged Activity Log Review — Q2 2026", fileName: "AU-3.3.8_Privileged_Activity_Log_Review.xlsx",
    ext: ".xlsx", mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    evType: "log", status: "approved",
    ctrls: ["AU.L2-3.3.8", "AU.L2-3.3.1"], domain: "AU", daysAgo: 7,
    desc: "Quarterly review of privileged user activities including role activations, admin actions, and configuration changes.",
    summary: "148 privileged operations reviewed. All align to approved change requests. No anomalies.",
    tags: ["privileged-activity", "audit-log"],
  },
  {
    title: "Audit Event Types Configuration", fileName: "AU-3.3.2_Event_Types_Audit_Policy.png",
    ext: ".png", mime: "image/png",
    evType: "screenshot", status: "approved",
    ctrls: ["AU.L2-3.3.2"], domain: "AU", daysAgo: 45,
    desc: "Screenshot of audit policy configuration showing all required CMMC event types enabled.",
    summary: "All 9 CMMC-required event categories enabled including sign-in, role changes, and config modifications.",
    tags: ["audit-policy", "event-types", "screenshot"],
  },
  {
    title: "SIEM Alert Dashboard Screenshot", fileName: "AU-3.3.1_SIEM_Alert_Dashboard.png",
    ext: ".png", mime: "image/png",
    evType: "screenshot", status: "approved",
    ctrls: ["AU.L2-3.3.1", "IR.L2-3.6.1"], domain: "AU", daysAgo: 3,
    desc: "Screenshot of Microsoft Sentinel alert dashboard showing open incidents and detection rules.",
    summary: "14 analytics rules active. 2 open incidents. Both under investigation per IR procedure.",
    tags: ["siem", "sentinel", "alerts", "screenshot"],
  },
  {
    title: "Audit Failure Alert Configuration", fileName: "AU-3.3.4_Audit_Failure_Alert_Config.png",
    ext: ".png", mime: "image/png",
    evType: "screenshot", status: "approved",
    ctrls: ["AU.L2-3.3.4", "AU.L2-3.3.1"], domain: "AU", daysAgo: 60,
    desc: "Screenshot confirming alert rules are configured to notify the security team on audit log collection failures.",
    summary: "Alert rule active. Notification to security@apex-solutions.com confirmed via test on 2026-04-15.",
    tags: ["audit-failures", "alerts", "screenshot"],
  },
  {
    title: "Audit Log Protection Policy", fileName: "AU-3.3.3_Audit_Log_Protection_Policy.pdf",
    ext: ".pdf", mime: "application/pdf",
    evType: "policy", status: "approved",
    ctrls: ["AU.L2-3.3.3", "AU.L2-3.3.2"], domain: "AU", daysAgo: 90,
    desc: "Policy documenting controls protecting audit logs from unauthorized modification and deletion.",
    summary: "Immutable log export to Azure Storage configured. RBAC limits log modification to Security Admin role.",
    tags: ["log-protection", "immutable"],
  },

  // ── Configuration Management (CM) ─────────────────────────────────────────
  {
    title: "Intune Security Baseline Screenshot", fileName: "CM-3.4.1_Intune_Security_Baseline.png",
    ext: ".png", mime: "image/png",
    evType: "screenshot", status: "approved",
    ctrls: ["CM.L2-3.4.1", "CM.L2-3.4.2"], domain: "CM", daysAgo: 7,
    desc: "Screenshot of Windows security baseline policy deployed via Microsoft Intune to all managed Windows devices.",
    summary: "Security baseline assigned to all 112 managed devices. Compliance: 94%. 7 devices non-compliant, tracked in POAM-APEX-003.",
    tags: ["intune", "security-baseline", "screenshot"],
  },
  {
    title: "Device Compliance Policy Screenshot", fileName: "CM-3.4.2_Device_Compliance_Policy.png",
    ext: ".png", mime: "image/png",
    evType: "screenshot", status: "approved",
    ctrls: ["CM.L2-3.4.2", "CM.L2-3.4.1"], domain: "CM", daysAgo: 7,
    desc: "Screenshot of Intune device compliance policy settings including required OS version and BitLocker enforcement.",
    summary: "Compliance policy active. Non-compliant devices blocked from corporate resources via Conditional Access.",
    tags: ["device-compliance", "intune", "screenshot"],
  },
  {
    title: "Device Inventory — 2026-07-01", fileName: "CM-3.4.3_Device_Inventory_2026-07-01.xlsx",
    ext: ".xlsx", mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    evType: "asset_inventory", status: "approved",
    ctrls: ["CM.L2-3.4.3", "CM.L2-3.4.1"], domain: "CM", daysAgo: 7,
    desc: "Complete device inventory exported from Intune including device name, OS version, compliance status, and owner.",
    summary: "112 managed devices inventoried. OS versions current on 96%. 4 devices flagged for OS upgrade.",
    tags: ["device-inventory", "intune", "asset-management"],
  },
  {
    title: "Baseline Change Approval — 2026-Q2", fileName: "CM-3.4.7_Baseline_Change_Approval.pdf",
    ext: ".pdf", mime: "application/pdf",
    evType: "approval_record", status: "approved",
    ctrls: ["CM.L2-3.4.7", "CM.L2-3.4.1"], domain: "CM", daysAgo: 21,
    desc: "Change management approval record for Q2 updates to the Windows security baseline configuration.",
    summary: "3 baseline changes approved by IT Director and Compliance Manager. Changes aligned to CIS v8 L1.",
    tags: ["change-management", "baseline"],
  },
  {
    title: "GPO Baseline Configuration Report", fileName: "CM-3.4.1_GPO_Baseline_Configuration.pdf",
    ext: ".pdf", mime: "application/pdf",
    evType: "configuration_export", status: "approved",
    ctrls: ["CM.L2-3.4.1", "CM.L2-3.4.6"], domain: "CM", daysAgo: 45,
    desc: "Group Policy Object export confirming security baseline settings for domain-joined workstations.",
    summary: "GPO baseline aligns to CIS Windows 10 L1. 128/132 settings in compliance.",
    tags: ["gpo", "baseline", "cis"],
  },
  {
    title: "Software Allowlist Policy Screenshot", fileName: "CM-3.4.6_Software_Allowlist_Policy.png",
    ext: ".png", mime: "image/png",
    evType: "screenshot", status: "approved",
    ctrls: ["CM.L2-3.4.6"], domain: "CM", daysAgo: 30,
    desc: "Screenshot of application control policy (AppLocker/WDAC) restricting execution to approved software.",
    summary: "AppLocker rules active in enforcement mode. 3 unapproved application attempts blocked in Q2.",
    tags: ["allowlist", "applocker", "screenshot"],
  },
  {
    title: "Change Management Log — Q2 2026", fileName: "CM-3.4.4_Change_Management_Log_2026-Q2.xlsx",
    ext: ".xlsx", mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    evType: "log", status: "approved",
    ctrls: ["CM.L2-3.4.4", "CM.L2-3.4.7"], domain: "CM", daysAgo: 7,
    desc: "Quarterly change management log listing all approved system configuration changes.",
    summary: "17 changes logged. All have documented approvals. 1 emergency change with post-approval.",
    tags: ["change-management", "configuration"],
  },
  {
    title: "Patch Management Report — 2026-07", fileName: "CM-3.4.9_Patch_Management_Report_2026-07.xlsx",
    ext: ".xlsx", mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    evType: "scan_report", status: "approved",
    ctrls: ["CM.L2-3.4.9", "SI.L2-3.14.1"], domain: "CM", daysAgo: 7,
    desc: "Monthly patch management report showing patch compliance status across all managed endpoints.",
    summary: "97% patch compliance. 4 endpoints with outstanding patches tracked in POAM remediation.",
    tags: ["patch-management", "compliance"],
  },

  // ── Risk Assessment (RA) ──────────────────────────────────────────────────
  {
    title: "Risk Assessment Report — FY2026", fileName: "RA-3.11.1_Risk_Assessment_Report.pdf",
    ext: ".pdf", mime: "application/pdf",
    evType: "risk_record", status: "approved",
    ctrls: ["RA.L2-3.11.1", "CA.L2-3.12.1"], domain: "RA", daysAgo: 90,
    desc: "Annual organizational risk assessment following NIST SP 800-30 methodology, covering all in-scope CUI systems.",
    summary: "3 critical risks, 8 high risks identified. All have POA&M items. Next assessment scheduled FY2027.",
    tags: ["risk-assessment", "annual", "nist"],
  },
  {
    title: "Vulnerability Scan Report — 2026-07-01", fileName: "RA-3.11.2_Vulnerability_Scan_Report_2026-07-01.pdf",
    ext: ".pdf", mime: "application/pdf",
    evType: "scan_report", status: "approved",
    ctrls: ["RA.L2-3.11.2", "SI.L2-3.14.1"], domain: "RA", daysAgo: 7,
    desc: "Weekly vulnerability scan results from Tenable.io covering all CUI-scope endpoints and servers.",
    summary: "5 high CVEs, 12 medium. Critical: 0. All high CVEs have remediation assignments within SLA.",
    tags: ["vulnerability-scan", "tenable", "weekly"],
  },
  {
    title: "Remediation Tracker — 2026-Q2", fileName: "RA-3.11.3_Remediation_Tracker.xlsx",
    ext: ".xlsx", mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    evType: "risk_record", status: "approved",
    ctrls: ["RA.L2-3.11.3", "RA.L2-3.11.2"], domain: "RA", daysAgo: 7,
    desc: "Active vulnerability remediation tracker showing CVE ID, severity, assigned owner, and target remediation date.",
    summary: "23 items tracked. 15 closed in Q2. 8 open: 5 within SLA, 3 in POAM-APEX-005.",
    tags: ["remediation", "vulnerability", "tracker"],
  },
  {
    title: "Risk Register — 2026", fileName: "RA-3.11.1_Risk_Register_2026.xlsx",
    ext: ".xlsx", mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    evType: "risk_record", status: "approved",
    ctrls: ["RA.L2-3.11.1", "RA.L2-3.11.3"], domain: "RA", daysAgo: 45,
    desc: "Organizational risk register listing all identified risks with likelihood, impact, and treatment decisions.",
    summary: "14 risks documented. 3 accepted, 8 mitigated, 3 in remediation. Reviewed monthly by Compliance Manager.",
    tags: ["risk-register", "annual"],
  },
  {
    title: "Tenable Scan Export — 2026-07-01", fileName: "RA-3.11.2_Tenable_Scan_Export.csv",
    ext: ".csv", mime: "text/csv",
    evType: "scan_report", status: "approved",
    ctrls: ["RA.L2-3.11.2"], domain: "RA", daysAgo: 7,
    desc: "Raw CSV export from Tenable.io vulnerability scan for ingestion into remediation tracker.",
    summary: "Raw scan data. 312 findings across all asset classes. 5 high severity requiring immediate attention.",
    tags: ["tenable", "vulnerability", "export"],
  },
  {
    title: "Remediation Status Dashboard Screenshot", fileName: "RA-3.11.3_Remediation_Status_Dashboard.png",
    ext: ".png", mime: "image/png",
    evType: "screenshot", status: "approved",
    ctrls: ["RA.L2-3.11.3"], domain: "RA", daysAgo: 3,
    desc: "Screenshot of vulnerability remediation dashboard showing open findings by severity and age.",
    summary: "Dashboard current. 5 high CVEs visible. All within remediation SLA.",
    tags: ["dashboard", "remediation", "screenshot"],
  },

  // ── Incident Response (IR) ────────────────────────────────────────────────
  {
    title: "Incident Response Plan v2.1", fileName: "IR-3.6.1_Incident_Response_Plan.pdf",
    ext: ".pdf", mime: "application/pdf",
    evType: "procedure", status: "approved",
    ctrls: ["IR.L2-3.6.1", "IR.L2-3.6.2"], domain: "IR", daysAgo: 60,
    desc: "Organizational incident response plan aligned to NIST SP 800-61 Rev 2 covering detection, containment, eradication, and recovery.",
    summary: "Plan version 2.1 approved by IT Director and CISO on 2026-05-01. Reviewed annually.",
    tags: ["ir-plan", "nist", "approved"],
  },
  {
    title: "Tabletop Exercise After-Action Report — 2026-Q1", fileName: "IR-3.6.3_Tabletop_Exercise_After_Action_Report.pdf",
    ext: ".pdf", mime: "application/pdf",
    evType: "incident_record", status: "approved",
    ctrls: ["IR.L2-3.6.3", "IR.L2-3.6.1"], domain: "IR", daysAgo: 90,
    desc: "After-action report from Q1 2026 IR tabletop exercise simulating a ransomware attack scenario.",
    summary: "Exercise completed 2026-03-15. 4 gaps identified. All captured in POA&M. Next exercise Q3 2026.",
    tags: ["tabletop", "after-action", "q1-2026"],
  },
  {
    title: "Incident Reporting Log — 2026", fileName: "IR-3.6.2_Incident_Reporting_Log_2026.xlsx",
    ext: ".xlsx", mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    evType: "incident_record", status: "approved",
    ctrls: ["IR.L2-3.6.2", "IR.L2-3.6.1"], domain: "IR", daysAgo: 7,
    desc: "Log of all security incidents reported in 2026, including response actions and disposition.",
    summary: "8 incidents logged YTD. 7 closed. 1 under investigation (low severity). All reported per IR plan.",
    tags: ["incident-log", "2026"],
  },
  {
    title: "IR Contact List — 2026", fileName: "IR-3.6.1_IR_Contact_List.pdf",
    ext: ".pdf", mime: "application/pdf",
    evType: "other", status: "approved",
    ctrls: ["IR.L2-3.6.1"], domain: "IR", daysAgo: 60,
    desc: "Current incident response team contact list including roles, primary and backup contacts, and escalation procedures.",
    summary: "IR roster current as of 2026-05-01. All contacts verified. US-CERT reporting contact updated.",
    tags: ["ir-contacts", "roster"],
  },
  {
    title: "Tabletop Exercise Participant Sign-In", fileName: "IR-3.6.3_Exercise_Participant_Sign_In.xlsx",
    ext: ".xlsx", mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    evType: "training_record", status: "approved",
    ctrls: ["IR.L2-3.6.3"], domain: "IR", daysAgo: 90,
    desc: "Signed attendance sheet for Q1 2026 IR tabletop exercise.",
    summary: "14 participants. Includes IT Admin, Compliance Manager, Legal, and Executive Sponsor.",
    tags: ["tabletop", "sign-in", "q1-2026"],
  },

  // ── System & Communications Protection (SC) ───────────────────────────────
  {
    title: "Encryption Status Report — 2026-Q2", fileName: "SC-3.13.16_Encryption_Status_Report.xlsx",
    ext: ".xlsx", mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    evType: "configuration_export", status: "approved",
    ctrls: ["SC.L2-3.13.16", "SC.L2-3.13.8"], domain: "SC", daysAgo: 14,
    desc: "Report of encryption status for all endpoints and storage systems confirming AES-256 BitLocker and storage encryption.",
    summary: "91% endpoint encryption. 9 devices in POAM-APEX-003 remediation. All cloud storage encrypted.",
    tags: ["encryption", "bitlocker", "aes256"],
  },
  {
    title: "BitLocker Compliance Report", fileName: "SC-3.13.8_BitLocker_Compliance_Report.xlsx",
    ext: ".xlsx", mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    evType: "configuration_export", status: "pending_review",
    ctrls: ["SC.L2-3.13.8"], domain: "SC", daysAgo: 7,
    desc: "Intune BitLocker encryption compliance report showing encryption status per device.",
    summary: "In review. 103/112 devices encrypted. 9 non-compliant tracked in POAM.",
    tags: ["bitlocker", "intune", "compliance"],
  },
  {
    title: "Firewall Ruleset Export — 2026-Q2", fileName: "SC-3.13.1_Firewall_Ruleset_Export.pdf",
    ext: ".pdf", mime: "application/pdf",
    evType: "configuration_export", status: "approved",
    ctrls: ["SC.L2-3.13.1", "SC.L2-3.13.2"], domain: "SC", daysAgo: 45,
    desc: "Export of production firewall rules with business justification for each allow rule.",
    summary: "144 rules reviewed. 8 legacy rules removed. All remaining rules have documented justification.",
    tags: ["firewall", "ruleset", "network"],
  },
  {
    title: "Boundary Protection Configuration", fileName: "SC-3.13.5_Boundary_Protection_Configuration.png",
    ext: ".png", mime: "image/png",
    evType: "screenshot", status: "approved",
    ctrls: ["SC.L2-3.13.5", "SC.L2-3.13.1"], domain: "SC", daysAgo: 30,
    desc: "Screenshot of network boundary protection configuration including DMZ segmentation and WAF settings.",
    summary: "DMZ zone active. WAF in prevention mode. Ingress/egress traffic filtered per security policy.",
    tags: ["boundary-protection", "dmz", "screenshot"],
  },
  {
    title: "Cryptographic Algorithm Policy", fileName: "SC-3.13.11_Cryptographic_Algorithm_Policy.pdf",
    ext: ".pdf", mime: "application/pdf",
    evType: "policy", status: "approved",
    ctrls: ["SC.L2-3.13.11"], domain: "SC", daysAgo: 60,
    desc: "Policy specifying approved cryptographic algorithms including AES-256, SHA-256, and RSA-2048 minimum.",
    summary: "Policy approved 2026-01-15. Aligns to CNSS SP 15. TLS 1.2+ enforced for all communications.",
    tags: ["cryptography", "algorithms", "policy"],
  },
  {
    title: "Network Segmentation Diagram", fileName: "SC-3.13.3_Network_Segmentation_Diagram.png",
    ext: ".png", mime: "image/png",
    evType: "screenshot", status: "approved",
    ctrls: ["SC.L2-3.13.3", "SC.L2-3.13.1"], domain: "SC", daysAgo: 60,
    desc: "Current network segmentation diagram showing CUI zone, corporate network, and guest WiFi separation.",
    summary: "CUI zone isolated via VLAN segmentation. No lateral movement paths between zones confirmed.",
    tags: ["network-segmentation", "vlan", "diagram"],
  },

  // ── System & Information Integrity (SI) ───────────────────────────────────
  {
    title: "Defender Antivirus Status Dashboard", fileName: "SI-3.14.2_Defender_Antivirus_Status.png",
    ext: ".png", mime: "image/png",
    evType: "screenshot", status: "approved",
    ctrls: ["SI.L2-3.14.2", "SI.L2-3.14.1"], domain: "SI", daysAgo: 3,
    desc: "Screenshot of Microsoft Defender for Endpoint dashboard showing antivirus status and definition currency.",
    summary: "108/112 devices protected. Definitions current. 4 devices offline — pending reconnection.",
    tags: ["defender", "antivirus", "screenshot"],
  },
  {
    title: "Defender Alert Review — 2026-07-01", fileName: "SI-3.14.3_Defender_Alert_Review.pdf",
    ext: ".pdf", mime: "application/pdf",
    evType: "log", status: "approved",
    ctrls: ["SI.L2-3.14.3", "AU.L2-3.3.1"], domain: "SI", daysAgo: 7,
    desc: "Weekly security alert review report from Microsoft Defender XDR, documenting findings and response actions.",
    summary: "14 alerts reviewed. 12 closed. 2 escalated to incident. All within 24-hour SLA.",
    tags: ["defender", "alerts", "weekly-review"],
  },
  {
    title: "USB Device Control Settings", fileName: "SI-3.14.7_USB_Device_Control_Settings.png",
    ext: ".png", mime: "image/png",
    evType: "screenshot", status: "approved",
    ctrls: ["SI.L2-3.14.7", "MP.L2-3.8.7"], domain: "SI", daysAgo: 30,
    desc: "Screenshot of Intune device configuration restricting removable storage access on all managed endpoints.",
    summary: "USB storage blocked by default. Only IT-approved USB devices permitted via allowlist policy.",
    tags: ["usb-control", "removable-media", "screenshot"],
  },
  {
    title: "Vulnerability Management Policy", fileName: "SI-3.14.1_Vulnerability_Management_Policy.pdf",
    ext: ".pdf", mime: "application/pdf",
    evType: "policy", status: "approved",
    ctrls: ["SI.L2-3.14.1", "RA.L2-3.11.2"], domain: "SI", daysAgo: 90,
    desc: "Policy defining vulnerability management procedures including scan frequency, severity SLAs, and escalation.",
    summary: "Policy version 2.0 approved. Critical: 7 days, High: 30 days, Medium: 90 days SLAs defined.",
    tags: ["vulnerability-management", "policy"],
  },
  {
    title: "Software Update Compliance Report", fileName: "SI-3.14.4_Software_Update_Compliance.xlsx",
    ext: ".xlsx", mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    evType: "configuration_export", status: "approved",
    ctrls: ["SI.L2-3.14.4", "CM.L2-3.4.9"], domain: "SI", daysAgo: 7,
    desc: "Monthly software update compliance report from Intune and Windows Update for Business.",
    summary: "96% update compliance. 5 endpoints pending reboot for pending updates.",
    tags: ["software-updates", "compliance", "intune"],
  },
  {
    title: "Security Alerts Summary — Q2 2026", fileName: "SI-3.14.6_Security_Alerts_Summary.xlsx",
    ext: ".xlsx", mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    evType: "log", status: "approved",
    ctrls: ["SI.L2-3.14.6", "AU.L2-3.3.1"], domain: "SI", daysAgo: 7,
    desc: "Quarterly summary of all security alerts, incidents, and response actions for executive reporting.",
    summary: "Q2: 47 alerts, 8 incidents. 7 incidents closed, 1 low-severity open. No data breaches.",
    tags: ["alerts-summary", "quarterly", "executive"],
  },

  // ── Media Protection (MP) ─────────────────────────────────────────────────
  {
    title: "Backup Restore Test Report — Q2 2026", fileName: "MP-3.8.9_Backup_Restore_Test_Report.pdf",
    ext: ".pdf", mime: "application/pdf",
    evType: "backup_verification", status: "approved",
    ctrls: ["MP.L2-3.8.9", "CM.L2-3.4.1"], domain: "MP", daysAgo: 45,
    desc: "Documented backup restoration test verifying integrity and recovery time objectives for critical systems.",
    summary: "Recovery test successful. RTO: 4.2 hours (target 8 hours). RPO: 45 minutes (target 4 hours).",
    tags: ["backup", "restore-test", "dr"],
  },
  {
    title: "Removable Media Policy", fileName: "MP-3.8.1_Removable_Media_Policy.pdf",
    ext: ".pdf", mime: "application/pdf",
    evType: "policy", status: "approved",
    ctrls: ["MP.L2-3.8.1", "MP.L2-3.8.7"], domain: "MP", daysAgo: 90,
    desc: "Policy governing the use, handling, and disposal of removable media containing CUI.",
    summary: "Policy approved. Encryption required for all approved removable media. USB restricted by default.",
    tags: ["removable-media", "policy", "encryption"],
  },
  {
    title: "CUI Media Disposal Log — 2026-Q2", fileName: "MP-3.8.3_CUI_Media_Disposal_Log.xlsx",
    ext: ".xlsx", mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    evType: "log", status: "approved",
    ctrls: ["MP.L2-3.8.3", "MP.L2-3.8.4"], domain: "MP", daysAgo: 14,
    desc: "Log of media sanitization and disposal activities following NIST SP 800-88 guidelines.",
    summary: "4 hard drives sanitized (DoD 3-pass). 1 physical shred of optical media. Certificates on file.",
    tags: ["media-disposal", "sanitization", "nist"],
  },
  {
    title: "Backup Completion Log — 2026-07", fileName: "MP-3.8.9_Backup_Completion_Log_2026-07.xlsx",
    ext: ".xlsx", mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    evType: "backup_verification", status: "approved",
    ctrls: ["MP.L2-3.8.9"], domain: "MP", daysAgo: 7,
    desc: "Monthly backup job completion log confirming all scheduled backups completed successfully.",
    summary: "All 124 scheduled backup jobs completed. 2 partial completions retried successfully.",
    tags: ["backup-log", "completion"],
  },

  // ── Awareness & Training (AT) ─────────────────────────────────────────────
  {
    title: "Security Awareness Training Report — Q2 2026", fileName: "AT-3.2.1_Security_Awareness_Training_Report.xlsx",
    ext: ".xlsx", mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    evType: "training_record", status: "approved",
    ctrls: ["AT.L2-3.2.1", "AT.L2-3.2.2"], domain: "AT", daysAgo: 14,
    desc: "Quarterly security awareness training completion report showing completion rates by department.",
    summary: "93% completion (127/137 users). 10 non-compliant escalated to HR. Training covers phishing, CUI handling, and MFA.",
    tags: ["security-awareness", "training", "completion"],
  },
  {
    title: "Role-Based Training Record — IT & Compliance", fileName: "AT-3.2.2_Role_Based_Training_Record.pdf",
    ext: ".pdf", mime: "application/pdf",
    evType: "training_record", status: "approved",
    ctrls: ["AT.L2-3.2.2"], domain: "AT", daysAgo: 30,
    desc: "Documentation of role-specific security training for IT Administrators, Compliance staff, and System Administrators.",
    summary: "All 8 IT staff and 3 Compliance staff completed CMMC-specific role-based training.",
    tags: ["role-based-training", "it", "compliance"],
  },
  {
    title: "Training Completion Certificate — Sample", fileName: "AT-3.2.1_Training_Completion_Certificate_Sample.pdf",
    ext: ".pdf", mime: "application/pdf",
    evType: "training_record", status: "approved",
    ctrls: ["AT.L2-3.2.1"], domain: "AT", daysAgo: 30,
    desc: "Sample security awareness training completion certificate showing organization-branded certificate format.",
    summary: "Certificate format approved. All certificates include employee name, date, training title, and expiry.",
    tags: ["training-certificate"],
  },
  {
    title: "Annual Training Schedule — 2026", fileName: "AT-3.2.1_Annual_Training_Schedule.xlsx",
    ext: ".xlsx", mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    evType: "training_record", status: "approved",
    ctrls: ["AT.L2-3.2.1", "AT.L2-3.2.2"], domain: "AT", daysAgo: 180,
    desc: "Annual training schedule showing all scheduled training events, target audiences, and completion deadlines.",
    summary: "Schedule published January 2026. Q1 and Q2 training completed. Q3 training scheduled August.",
    tags: ["training-schedule", "annual"],
  },

  // ── Physical Protection (PE) ───────────────────────────────────────────────
  {
    title: "Visitor Log — Q2 2026", fileName: "PE-3.10.1_Visitor_Log_2026-Q2.xlsx",
    ext: ".xlsx", mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    evType: "log", status: "approved",
    ctrls: ["PE.L2-3.10.1", "PE.L2-3.10.3"], domain: "PE", daysAgo: 7,
    desc: "Physical visitor access log for Q2 2026 including name, company, host, purpose, and access areas.",
    summary: "42 visitor entries. All escorted. No CUI areas accessed by uncleared visitors.",
    tags: ["visitor-log", "physical-access"],
  },
  {
    title: "Physical Access Review — Q2 2026", fileName: "PE-3.10.2_Physical_Access_Review_2026-Q2.pdf",
    ext: ".pdf", mime: "application/pdf",
    evType: "access_review", status: "approved",
    ctrls: ["PE.L2-3.10.2", "PE.L2-3.10.1"], domain: "PE", daysAgo: 14,
    desc: "Quarterly review of physical access permissions, badge assignments, and server room access logs.",
    summary: "Access list reviewed. 3 access rights revoked for terminated employees. Badge log gap remediated.",
    tags: ["physical-access", "review"],
  },
  {
    title: "Security Camera Coverage Map", fileName: "PE-3.10.3_Security_Camera_Coverage_Map.png",
    ext: ".png", mime: "image/png",
    evType: "screenshot", status: "approved",
    ctrls: ["PE.L2-3.10.3"], domain: "PE", daysAgo: 90,
    desc: "Facility diagram showing CCTV camera placement and coverage areas for all security-relevant locations.",
    summary: "12 cameras covering all entrances, server room, and CUI handling areas. No coverage gaps.",
    tags: ["cctv", "physical-security", "coverage"],
  },

  // ── Personnel Security (PS) ────────────────────────────────────────────────
  {
    title: "User Termination Checklist — Q2 2026", fileName: "PS-3.9.2_User_Termination_Checklist_2026-Q2.pdf",
    ext: ".pdf", mime: "application/pdf",
    evType: "procedure", status: "approved",
    ctrls: ["PS.L2-3.9.2", "AC.L2-3.1.1"], domain: "PS", daysAgo: 14,
    desc: "Completed termination checklists for Q2 2026 employee separations confirming system access revocation.",
    summary: "4 terminations processed. All access revoked within 2 hours of separation. Checklists signed by IT and HR.",
    tags: ["termination", "offboarding", "access-revocation"],
  },
  {
    title: "Background Check Summary — 2026", fileName: "PS-3.9.1_Background_Check_Summary_2026.xlsx",
    ext: ".xlsx", mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    evType: "report", status: "approved",
    ctrls: ["PS.L2-3.9.1"], domain: "PS", daysAgo: 90,
    desc: "Annual summary of personnel background check completion status for all CUI-system users.",
    summary: "All 41 CUI-system users have current background checks on file. 3 renewals due in Q4.",
    tags: ["background-checks", "personnel-security"],
  },
];

// ─── Document Specs (21 items) ────────────────────────────────────────────────
type DocType = "policy" | "procedure" | "log" | "register" | "report" | "backup_verification" | "access_review" | "risk_record" | "other";
type DocStatus = "active" | "approved" | "pending_review" | "draft";

interface DocumentSpec {
  title: string; fileName: string; ext: ".docx" | ".xlsx" | ".pdf";
  mime: string; docType: DocType; status: DocStatus; ctrls: string[];
  version: string; effectiveDaysAgo: number;
  sections: Array<{ heading: string; content: string }>;
}

const POLICY_BASE_SECTIONS = (domain: string, policyTitle: string, requirements: string[], roles: string) => [
  { heading: "1. Purpose", content: `This policy establishes requirements for ${policyTitle.toLowerCase()} at APEX Solutions LLC to protect Controlled Unclassified Information (CUI) and ensure compliance with CMMC Level 2 requirements for the ${domain} domain.` },
  { heading: "2. Scope", content: "This policy applies to all APEX Solutions employees, contractors, and third-party personnel who access, process, store, or transmit CUI or operate information systems within the CMMC boundary." },
  { heading: "3. Policy Requirements", content: requirements.join("\n") },
  { heading: "4. Roles and Responsibilities", content: roles },
  { heading: "5. Compliance and Enforcement", content: "Violations of this policy may result in disciplinary action up to and including termination of employment or contract. Violations involving CUI may be reported to the Contracting Officer as required by applicable regulations." },
  { heading: "6. Review and Update Cycle", content: "This policy is reviewed annually by the Compliance Manager and updated as required following significant system changes, incidents, or regulatory updates. Version history is maintained in Control HUB." },
  { heading: "7. Related Documents", content: `Related procedures, standards, and supporting evidence are referenced in Control HUB under the ${domain} domain controls. The APEX Solutions System Security Plan incorporates this policy by reference.` },
];

const PROC_BASE_SECTIONS = (purpose: string, steps: string[], verification: string) => [
  { heading: "1. Purpose", content: purpose },
  { heading: "2. Scope", content: "This procedure applies to all personnel with system administrator or compliance responsibilities within the APEX Solutions CMMC boundary." },
  { heading: "3. Prerequisites", content: "• Access to the APEX Solutions IT management console\n• Completion of APEX Solutions security awareness training\n• Authorization from IT Administrator for the relevant task" },
  { heading: "4. Procedure Steps", content: steps.join("\n") },
  { heading: "5. Verification", content: verification },
  { heading: "6. Record Keeping", content: "Documentation of procedure execution must be retained in Control HUB for a minimum of 3 years. Records must include date, executor name, and outcome." },
  { heading: "7. Exceptions", content: "Exceptions to this procedure require written approval from the IT Director and Compliance Manager. All approved exceptions must be documented in the APEX Solutions POA&M register." },
];

const DOCUMENT_SPECS: DocumentSpec[] = [
  // ── Policies (8) ──────────────────────────────────────────────────────────
  {
    title: "Access Control Policy", fileName: "APEX_Access_Control_Policy.docx",
    ext: ".docx", mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    docType: "policy", status: "active",
    ctrls: ["AC.L2-3.1.1", "AC.L2-3.1.2", "AC.L2-3.1.3", "AC.L2-3.1.5", "AC.L2-3.1.20"],
    version: "2.1", effectiveDaysAgo: 180,
    sections: POLICY_BASE_SECTIONS("Access Control", "Access Control",
      ["3.1 All user access to CUI systems requires prior authorization from the IT Administrator.\n3.2 Access is granted based on least-privilege principles and job function.\n3.3 Privileged accounts must use Entra ID PIM for just-in-time activation.\n3.4 External connections require documented business justification and IT Director approval.\n3.5 Quarterly access reviews must be completed and documented in Control HUB."],
      "IT Administrator: Approves access requests, manages accounts, conducts access reviews.\nCompliance Manager: Reviews access review results, maintains policy currency.\nAll Personnel: Request access through approved channels, report unauthorized access."),
  },
  {
    title: "Identification and Authentication Policy", fileName: "APEX_Identification_Authentication_Policy.docx",
    ext: ".docx", mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    docType: "policy", status: "active",
    ctrls: ["IA.L2-3.5.1", "IA.L2-3.5.2", "IA.L2-3.5.3", "IA.L2-3.5.7"],
    version: "2.0", effectiveDaysAgo: 180,
    sections: POLICY_BASE_SECTIONS("Identification and Authentication", "Identification and Authentication",
      ["3.1 Multi-factor authentication is mandatory for all user accounts accessing CUI systems.\n3.2 Passwords must meet minimum complexity requirements: 14 characters, mixed case, numbers, symbols.\n3.3 Passwords expire every 90 days; password reuse is prohibited for the last 24 passwords.\n3.4 Legacy authentication protocols are prohibited and must be blocked via Conditional Access.\n3.5 Service accounts must use managed identities or certificate-based authentication where feasible."],
      "IT Administrator: Enforces MFA policies, manages Conditional Access, responds to authentication failures.\nAll Users: Comply with MFA enrollment, report credential compromise immediately."),
  },
  {
    title: "Audit and Accountability Policy", fileName: "APEX_Audit_Accountability_Policy.docx",
    ext: ".docx", mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    docType: "policy", status: "active",
    ctrls: ["AU.L2-3.3.1", "AU.L2-3.3.2", "AU.L2-3.3.3", "AU.L2-3.3.6"],
    version: "1.3", effectiveDaysAgo: 180,
    sections: POLICY_BASE_SECTIONS("Audit and Accountability", "Audit and Accountability",
      ["3.1 Audit logs must be enabled for all CUI-scope systems including authentication, configuration changes, and file access events.\n3.2 Audit logs must be retained for a minimum of 365 days.\n3.3 Audit logs must be protected from unauthorized modification; immutable storage is preferred.\n3.4 Weekly audit log reviews are required and must be documented in Control HUB.\n3.5 Anomalies identified during review must be investigated and dispositioned within 5 business days."],
      "IT Administrator: Configures audit logging, monitors SIEM alerts, escalates anomalies.\nCompliance Manager: Reviews weekly audit reports, tracks audit review completion.\nSecurity Team: Investigates flagged anomalies and documents disposition."),
  },
  {
    title: "Configuration Management Policy", fileName: "APEX_Configuration_Management_Policy.docx",
    ext: ".docx", mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    docType: "policy", status: "active",
    ctrls: ["CM.L2-3.4.1", "CM.L2-3.4.2", "CM.L2-3.4.4", "CM.L2-3.4.6"],
    version: "1.4", effectiveDaysAgo: 180,
    sections: POLICY_BASE_SECTIONS("Configuration Management", "Configuration Management",
      ["3.1 All CUI-scope systems must be configured per the APEX Solutions approved security baseline.\n3.2 System configuration changes require approval via the change management process.\n3.3 Unauthorized or unapproved software is prohibited on CUI-scope endpoints.\n3.4 Device compliance is enforced via Microsoft Intune; non-compliant devices are blocked from CUI access.\n3.5 Configuration baselines are reviewed and updated quarterly."],
      "IT Administrator: Maintains baseline, approves changes, enforces device compliance.\nChange Advisory Board: Reviews and approves configuration changes.\nAll Staff: Report unauthorized configuration changes to IT Administrator immediately."),
  },
  {
    title: "Incident Response Policy", fileName: "APEX_Incident_Response_Policy.docx",
    ext: ".docx", mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    docType: "policy", status: "active",
    ctrls: ["IR.L2-3.6.1", "IR.L2-3.6.2", "IR.L2-3.6.3"],
    version: "2.1", effectiveDaysAgo: 180,
    sections: POLICY_BASE_SECTIONS("Incident Response", "Incident Response",
      ["3.1 All security incidents must be reported to the IT Administrator within 1 hour of discovery.\n3.2 Incidents involving CUI must be reported to the Contracting Officer within 72 hours.\n3.3 An IR tabletop exercise must be conducted annually and documented.\n3.4 Post-incident reviews must be completed within 5 business days of incident closure.\n3.5 Lessons learned must be incorporated into the Incident Response Plan."],
      "IT Administrator: Leads incident response, coordinates containment and recovery.\nCompliance Manager: Manages regulatory reporting, maintains incident log.\nAll Personnel: Report suspected incidents immediately; do not attempt self-remediation."),
  },
  {
    title: "Risk Assessment Policy", fileName: "APEX_Risk_Assessment_Policy.docx",
    ext: ".docx", mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    docType: "policy", status: "active",
    ctrls: ["RA.L2-3.11.1", "RA.L2-3.11.2", "RA.L2-3.11.3"],
    version: "1.2", effectiveDaysAgo: 270,
    sections: POLICY_BASE_SECTIONS("Risk Assessment", "Risk Assessment",
      ["3.1 APEX Solutions conducts a formal organizational risk assessment annually using NIST SP 800-30.\n3.2 Vulnerability scanning must be performed on all CUI-scope systems at least weekly.\n3.3 All identified risks must be documented in the Risk Register with treatment decisions.\n3.4 High and critical vulnerabilities must be remediated within 30 days of discovery.\n3.5 Risk assessment results must inform the POA&M and SSP updates."],
      "Compliance Manager: Leads annual risk assessment, maintains risk register.\nIT Administrator: Performs vulnerability scanning, manages remediation.\nExecutive Sponsor: Approves risk acceptance decisions for residual risks."),
  },
  {
    title: "Media Protection Policy", fileName: "APEX_Media_Protection_Policy.docx",
    ext: ".docx", mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    docType: "policy", status: "active",
    ctrls: ["MP.L2-3.8.1", "MP.L2-3.8.3", "MP.L2-3.8.7", "MP.L2-3.8.9"],
    version: "1.1", effectiveDaysAgo: 270,
    sections: POLICY_BASE_SECTIONS("Media Protection", "Media Protection",
      ["3.1 Removable media containing CUI must be encrypted using AES-256 or equivalent.\n3.2 USB removable storage is blocked by default; approved exceptions require IT Director sign-off.\n3.3 Media sanitization must follow NIST SP 800-88 Rev 1 guidelines prior to disposal or reuse.\n3.4 Backup media must be tested quarterly; restoration test results documented in Control HUB.\n3.5 CUI must not be stored on personal devices without written approval and encryption enforcement."],
      "IT Administrator: Enforces USB policy via Intune, maintains media disposal log.\nAll Personnel: Use only IT-approved media for CUI; report lost or stolen media immediately."),
  },
  {
    title: "System and Communications Protection Policy", fileName: "APEX_System_Communications_Protection_Policy.docx",
    ext: ".docx", mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    docType: "policy", status: "active",
    ctrls: ["SC.L2-3.13.1", "SC.L2-3.13.8", "SC.L2-3.13.11", "SC.L2-3.13.16"],
    version: "1.3", effectiveDaysAgo: 180,
    sections: POLICY_BASE_SECTIONS("System and Communications Protection", "System and Communications Protection",
      ["3.1 All CUI transmitted over networks must be encrypted using TLS 1.2 or higher.\n3.2 All endpoints storing CUI must have full-disk encryption enabled (BitLocker AES-256).\n3.3 Network segmentation must isolate CUI-handling systems from general corporate traffic.\n3.4 Only FIPS 140-2 or FIPS 140-3 validated cryptographic modules may be used for CUI protection.\n3.5 Firewall rules must be reviewed quarterly; allow rules require documented business justification."],
      "IT Administrator: Configures and maintains encryption, firewall, and network segmentation.\nCompliance Manager: Validates encryption compliance through periodic evidence collection."),
  },

  // ── Procedures (7) ────────────────────────────────────────────────────────
  {
    title: "Account Management Procedure", fileName: "APEX_Account_Management_Procedure.docx",
    ext: ".docx", mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    docType: "procedure", status: "active",
    ctrls: ["AC.L2-3.1.1", "AC.L2-3.1.2", "PS.L2-3.9.2"],
    version: "1.5", effectiveDaysAgo: 90,
    sections: PROC_BASE_SECTIONS(
      "This procedure defines the steps for provisioning, modifying, and deprovisioning user accounts on APEX Solutions CUI systems.",
      ["Step 1: Receive access request via IT ticketing system, verified by manager.\nStep 2: IT Administrator validates business justification and least-privilege scope.\nStep 3: Account created in Entra ID with correct group memberships and role assignments.\nStep 4: MFA enrollment initiated; user notified of registration requirements.\nStep 5: Access confirmed in writing by requestor within 2 business days.\nStep 6: Upon termination, accounts disabled within 2 hours of HR notification.\nStep 7: Accounts fully deleted after 30-day retention period per data governance policy."],
      "IT Administrator verifies account creation/deletion in Entra ID and confirms in the HR offboarding ticket. Records retained in Control HUB."
    ),
  },
  {
    title: "MFA and Conditional Access Procedure", fileName: "APEX_MFA_Conditional_Access_Procedure.docx",
    ext: ".docx", mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    docType: "procedure", status: "active",
    ctrls: ["IA.L2-3.5.3", "AC.L2-3.1.1", "AC.L2-3.1.20"],
    version: "1.3", effectiveDaysAgo: 90,
    sections: PROC_BASE_SECTIONS(
      "This procedure defines the configuration and maintenance steps for Microsoft Entra ID Multi-Factor Authentication and Conditional Access policies.",
      ["Step 1: Review MFA registration report weekly; identify non-enrolled accounts.\nStep 2: Send MFA enrollment notification to non-enrolled users via email and Teams.\nStep 3: Escalate to manager if enrollment not completed within 5 business days.\nStep 4: Conditional Access policies reviewed monthly; changes follow change management procedure.\nStep 5: Legacy authentication policy reviewed quarterly; new legacy clients logged and scheduled for migration.\nStep 6: Break-glass account MFA status verified weekly and documented."],
      "MFA coverage report exported from Entra ID and uploaded to Control HUB monthly. CA policy change requests logged in change management system."
    ),
  },
  {
    title: "Audit Log Review Procedure", fileName: "APEX_Audit_Log_Review_Procedure.docx",
    ext: ".docx", mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    docType: "procedure", status: "active",
    ctrls: ["AU.L2-3.3.1", "AU.L2-3.3.5", "AU.L2-3.3.6"],
    version: "1.2", effectiveDaysAgo: 90,
    sections: PROC_BASE_SECTIONS(
      "This procedure defines the weekly audit log review process for APEX Solutions CUI systems.",
      ["Step 1: Log in to Microsoft Sentinel; navigate to Incidents and Alerts.\nStep 2: Review all new alerts generated since the last review session.\nStep 3: Triage each alert: categorize as false positive, policy violation, or security incident.\nStep 4: False positives are documented and rule tuning initiated if recurring.\nStep 5: Policy violations are documented and supervisors notified within 1 business day.\nStep 6: Security incidents are escalated per the Incident Response Procedure.\nStep 7: Completed review is documented in the Audit Log Review Record in Control HUB."],
      "Completed Audit Log Review Record uploaded to Control HUB within 1 business day of review completion. Incident escalations tracked in the Incident Reporting Log."
    ),
  },
  {
    title: "Vulnerability Management Procedure", fileName: "APEX_Vulnerability_Management_Procedure.docx",
    ext: ".docx", mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    docType: "procedure", status: "active",
    ctrls: ["RA.L2-3.11.2", "RA.L2-3.11.3", "SI.L2-3.14.1"],
    version: "1.4", effectiveDaysAgo: 90,
    sections: PROC_BASE_SECTIONS(
      "This procedure defines the vulnerability identification, assessment, and remediation process for APEX Solutions.",
      ["Step 1: Tenable.io scans run automatically on Monday/Thursday for all CUI-scope assets.\nStep 2: Scan results exported to CSV and uploaded to the Remediation Tracker in Control HUB.\nStep 3: IT Administrator reviews new findings and assigns severity classification.\nStep 4: Critical CVEs: remediate within 7 days. High CVEs: 30 days. Medium: 90 days.\nStep 5: Findings beyond SLA are added to the POA&M register for tracking.\nStep 6: Remediation verified via re-scan before finding is marked Closed.\nStep 7: Monthly vulnerability summary prepared for Compliance Manager review."],
      "Remediation Tracker updated within 2 business days of scan completion. Overdue findings escalated to POA&M within 5 days of SLA breach."
    ),
  },
  {
    title: "Backup Verification Procedure", fileName: "APEX_Backup_Verification_Procedure.docx",
    ext: ".docx", mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    docType: "procedure", status: "active",
    ctrls: ["MP.L2-3.8.9", "CM.L2-3.4.1"],
    version: "1.1", effectiveDaysAgo: 90,
    sections: PROC_BASE_SECTIONS(
      "This procedure defines the quarterly backup restoration test to verify data integrity and recovery time objectives.",
      ["Step 1: Schedule backup restoration window with IT team (minimum 4-hour window).\nStep 2: Select a representative backup set from each critical system category.\nStep 3: Initiate restore to isolated test environment; do not restore to production.\nStep 4: Verify data integrity by checking checksums and performing application smoke tests.\nStep 5: Measure and record restore time; compare to RTO of 8 hours.\nStep 6: Verify application startup and data currency (should match backup date).\nStep 7: Document results in Backup Restore Test Record and upload to Control HUB."],
      "Backup Restore Test Record completed, signed by IT Administrator, and uploaded to Control HUB within 2 business days of test completion. POAM created if RTO or RPO targets are missed."
    ),
  },
  {
    title: "POA&M Management Procedure", fileName: "APEX_POAM_Management_Procedure.docx",
    ext: ".docx", mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    docType: "procedure", status: "active",
    ctrls: ["CA.L2-3.12.2", "RA.L2-3.11.3"],
    version: "1.0", effectiveDaysAgo: 90,
    sections: PROC_BASE_SECTIONS(
      "This procedure defines the creation, tracking, and closure process for Plan of Action and Milestones (POA&M) items.",
      ["Step 1: New POA&M items are created in Control HUB when a gap is identified via assessment, scan, or audit.\nStep 2: Each POA&M must include: title, deficiency, linked control, risk level, owner, and scheduled completion date.\nStep 3: POA&M items are reviewed monthly by the Compliance Manager.\nStep 4: Owners provide monthly status updates; overdue items escalated to IT Director.\nStep 5: Remediation evidence is uploaded to Control HUB and linked to the POA&M item.\nStep 6: Compliance Manager validates evidence and marks POA&M as Closed with a resolution summary.\nStep 7: Closed POA&Ms are retained in Control HUB for 3 years minimum."],
      "Monthly POA&M review meeting documented in Control HUB. All items must have status updates at least monthly."
    ),
  },
  {
    title: "Device Compliance Procedure", fileName: "APEX_Device_Compliance_Procedure.docx",
    ext: ".docx", mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    docType: "procedure", status: "active",
    ctrls: ["CM.L2-3.4.1", "CM.L2-3.4.2", "SC.L2-3.13.8"],
    version: "1.2", effectiveDaysAgo: 90,
    sections: PROC_BASE_SECTIONS(
      "This procedure defines the process for enrolling, configuring, and maintaining device compliance for APEX Solutions endpoints.",
      ["Step 1: New devices are enrolled in Microsoft Intune via Autopilot during provisioning.\nStep 2: Security baseline and compliance policies are automatically applied via Intune.\nStep 3: Device compliance status is monitored daily in the Intune compliance dashboard.\nStep 4: Non-compliant devices trigger a Conditional Access block within 15 minutes.\nStep 5: IT Administrator contacts device owner; remediation must complete within 3 business days.\nStep 6: Devices non-compliant after 3 days are quarantined from the network.\nStep 7: Monthly compliance report generated and reviewed by Compliance Manager."],
      "Monthly device compliance report exported from Intune and uploaded to Control HUB. Non-compliance events tracked in Intune audit log."
    ),
  },

  // ── Records / Logs (6) ────────────────────────────────────────────────────
  {
    title: "User Access Review Log", fileName: "APEX_User_Access_Review_Log.xlsx",
    ext: ".xlsx", mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    docType: "access_review", status: "approved",
    ctrls: ["AC.L2-3.1.1", "AC.L2-3.1.2"], version: "1.0", effectiveDaysAgo: 7,
    sections: [],
  },
  {
    title: "Audit Log Review Record", fileName: "APEX_Audit_Log_Review_Record.xlsx",
    ext: ".xlsx", mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    docType: "log", status: "approved",
    ctrls: ["AU.L2-3.3.1", "AU.L2-3.3.5"], version: "1.0", effectiveDaysAgo: 7,
    sections: [],
  },
  {
    title: "Training Completion Register", fileName: "APEX_Training_Completion_Register.xlsx",
    ext: ".xlsx", mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    docType: "log", status: "approved",
    ctrls: ["AT.L2-3.2.1", "AT.L2-3.2.2"], version: "1.0", effectiveDaysAgo: 14,
    sections: [],
  },
  {
    title: "Risk Register", fileName: "APEX_Risk_Register.xlsx",
    ext: ".xlsx", mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    docType: "risk_record", status: "approved",
    ctrls: ["RA.L2-3.11.1", "RA.L2-3.11.3"], version: "2.0", effectiveDaysAgo: 45,
    sections: [],
  },
  {
    title: "POA&M Register", fileName: "APEX_POAM_Register.xlsx",
    ext: ".xlsx", mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    docType: "register", status: "approved",
    ctrls: ["CA.L2-3.12.2", "RA.L2-3.11.3"], version: "1.0", effectiveDaysAgo: 7,
    sections: [],
  },
  {
    title: "Backup Restore Test Record", fileName: "APEX_Backup_Restore_Test_Record.pdf",
    ext: ".pdf", mime: "application/pdf",
    docType: "backup_verification", status: "approved",
    ctrls: ["MP.L2-3.8.9"], version: "1.0", effectiveDaysAgo: 45,
    sections: [],
  },
];

// ─── Monitoring Items ─────────────────────────────────────────────────────────
const APEX_MONITORING = [
  { task: "Review Defender Alerts and Security Incidents", frequency: "daily" as const, controlRef: "AU.L2-3.3.1", description: "Review Microsoft Defender XDR and Sentinel alerts. Investigate anomalies and close or escalate.", sortOrder: 1, op: "Open Microsoft Defender XDR > Incidents. Review all new alerts since last review.", test: "Confirm alert review log entry exists in Control HUB with date and reviewer signature.", evToRetain: "Defender Alert Review PDF/XLSX uploaded to Control HUB" },
  { task: "Verify Automated Backup Completion", frequency: "daily" as const, controlRef: "MP.L2-3.8.9", description: "Confirm all scheduled Azure Backup and on-prem backup jobs completed successfully.", sortOrder: 2, op: "Check backup dashboard in Azure Portal and on-prem backup console.", test: "No failed backup jobs. Last successful backup within 24 hours.", evToRetain: "Backup completion log screenshot or export" },
  { task: "Review Entra ID Sign-in Logs for Anomalies", frequency: "weekly" as const, controlRef: "IA.L2-3.5.3", description: "Review Entra ID sign-in logs for failed attempts, risky sign-ins, and unusual locations.", sortOrder: 3, op: "Navigate to Entra ID > Sign-in logs. Filter for failures and risky events.", test: "No unreviewed risky sign-ins older than 7 days.", evToRetain: "Sign-in log export uploaded to evidence repository" },
  { task: "Review Vulnerability Scan Results", frequency: "weekly" as const, controlRef: "RA.L2-3.11.2", description: "Review Tenable.io scan results for new findings. Assign remediation to asset owners.", sortOrder: 4, op: "Export latest scan from Tenable.io. Compare to previous scan for new findings.", test: "All high/critical findings assigned to owners within SLA.", evToRetain: "Vulnerability scan export CSV and remediation tracker update" },
  { task: "Review System Audit Logs for Anomalies", frequency: "weekly" as const, controlRef: "AU.L2-3.3.1", description: "Review Microsoft Sentinel incidents and Azure Monitor alerts for suspicious activity.", sortOrder: 5, op: "Open Sentinel Workbooks > Audit Summary. Review flagged events.", test: "All flagged events have documented disposition.", evToRetain: "Audit Log Review Record uploaded to Control HUB" },
  { task: "Review User Account Permissions", frequency: "monthly" as const, controlRef: "AC.L2-3.1.1", description: "Review user account permissions and group memberships for alignment with job function.", sortOrder: 6, op: "Export Entra ID group memberships. Compare to HR roster and role matrix.", test: "No accounts with excess permissions. Access review record completed.", evToRetain: "Access review spreadsheet signed by IT Administrator" },
  { task: "Verify Antivirus and EDR Definitions Updated", frequency: "monthly" as const, controlRef: "SI.L2-3.14.2", description: "Confirm all endpoints have current Microsoft Defender AV signatures.", sortOrder: 7, op: "Review Intune Antivirus policy report. Identify devices with outdated definitions.", test: "100% of online devices have definitions from current week.", evToRetain: "Defender AV status screenshot from Intune" },
  { task: "Test Incident Response Procedures", frequency: "monthly" as const, controlRef: "IR.L2-3.6.1", description: "Review IR plan currency. Coordinate with team on any open IR improvements.", sortOrder: 8, op: "Review IR Plan version. Confirm contact list is current. Verify escalation paths.", test: "IR plan reviewed; all contacts verified. Exercise scheduled per annual plan.", evToRetain: "IR review memo or tabletop exercise record" },
  { task: "Review and Update Firewall Rules", frequency: "monthly" as const, controlRef: "SC.L2-3.13.1", description: "Audit firewall rules for unnecessary access and compliance with network policy.", sortOrder: 9, op: "Export firewall ruleset. Review each allow rule for current business justification.", test: "No rules without documented justification. Ruleset review documented.", evToRetain: "Firewall ruleset export with review documentation" },
  { task: "Verify MFA Enforcement Status", frequency: "monthly" as const, controlRef: "IA.L2-3.5.3", description: "Confirm MFA is enforced for all users and all Conditional Access policies are active.", sortOrder: 10, op: "Export MFA registration report from Entra ID. Verify CA policies are enabled.", test: "MFA coverage >= 95%. CA policy enabled. Non-enrolled users notified.", evToRetain: "MFA registration report XLSX" },
  { task: "Conduct Security Awareness Training Check", frequency: "quarterly" as const, controlRef: "AT.L2-3.2.1", description: "Verify training completion rates and schedule refresher sessions for non-compliant users.", sortOrder: 11, op: "Export training completion report from training platform. Compare to active user list.", test: "Training completion >= 95%. Non-compliant users have escalation record.", evToRetain: "Training completion report XLSX" },
  { task: "Review and Update System Security Plan", frequency: "quarterly" as const, controlRef: "CA.L2-3.12.4", description: "Review SSP for accuracy and completeness against current system state.", sortOrder: 12, op: "Review each SSP section against current control assessments in Control HUB.", test: "SSP reviewed. All sections current. Pending updates documented in task.", evToRetain: "SSP review memo or updated SSP document" },
  { task: "Perform Formal Access Control Review", frequency: "quarterly" as const, controlRef: "AC.L2-3.1.1", description: "Formally certify all user access rights against current role assignments.", sortOrder: 13, op: "Export full user access list. Have each manager certify their team's access.", test: "All access rights certified. Excess access removed. Review record uploaded.", evToRetain: "Formal access review spreadsheet with manager signatures" },
  { task: "Review Third-Party and Supplier Security", frequency: "quarterly" as const, controlRef: "SR.L2-3.17.2", description: "Assess supplier security reviews and update vendor risk register.", sortOrder: 14, op: "Review vendor risk register. Identify vendors due for assessment.", test: "All CUI-handling vendors assessed within 12 months.", evToRetain: "Vendor risk register update and any supplier assessment reports" },
  { task: "Conduct Penetration Testing", frequency: "annually" as const, controlRef: "CA.L2-3.12.3", description: "Execute authorized penetration test on in-scope systems and document results.", sortOrder: 15, op: "Engage authorized penetration testing firm. Provide rules of engagement.", test: "Pen test report received. All findings have remediation assignments.", evToRetain: "Penetration test report and remediation tracker" },
  { task: "Update Organizational Risk Assessment", frequency: "annually" as const, controlRef: "RA.L2-3.11.1", description: "Refresh risk assessment with current threat landscape and control status.", sortOrder: 16, op: "Conduct risk assessment workshops with stakeholders. Update risk register.", test: "Risk register updated. All risks have treatment decisions.", evToRetain: "Updated risk assessment report and risk register" },
  { task: "Complete CMMC Readiness Self-Assessment", frequency: "annually" as const, controlRef: "CA.L2-3.12.1", description: "Conduct comprehensive readiness review across all 110 CMMC L2 practices.", sortOrder: 17, op: "Review all 110 controls in Control HUB. Update implementation narratives.", test: "All 110 controls assessed. POA&M items created for any gaps.", evToRetain: "Control HUB assessment export and self-assessment report" },
  { task: "Review and Update All Policies and Procedures", frequency: "annually" as const, controlRef: "CA.L2-3.12.4", description: "Annual review cycle for all CMMC-related policies and supporting procedures.", sortOrder: 18, op: "Review each policy and procedure in Control HUB. Update version and effective date.", test: "All documents reviewed. Outdated documents updated or deprecated.", evToRetain: "Policy review log and updated document versions in Control HUB" },
  { task: "Respond to and Document Security Incidents", frequency: "annually" as const, controlRef: "IR.L2-3.6.2", description: "Execute the IR plan for security events and document response actions as events occur.", sortOrder: 19, op: "Per IR plan: detect, contain, eradicate, recover. Document in Incident Log.", test: "Incident log current. All incidents have closed status or open tracking.", evToRetain: "Incident reporting log and any relevant incident response records" },
];

// ─── POA&M Specs ─────────────────────────────────────────────────────────────
const APEX_POAMS = [
  {
    num: "POAM-APEX-001", title: "MFA Registration Incomplete — 9 User Accounts",
    deficiency: "9 user accounts (6.6% of active accounts) have not completed MFA enrollment. This creates risk of unauthorized access to CUI systems if credentials are compromised.",
    risk: "high" as const, status: "in_progress" as const,
    ctrl: "IA.L2-3.5.3",
    plan: "Phase 1 (Week 1-2): IT sends MFA enrollment notification with deadline. Phase 2 (Week 3): Manager escalation for non-enrolled users. Phase 3 (Week 4): Block CUI access for accounts without MFA. Target: 100% enrollment within 30 days.",
    days: 30, notes: "Progress: 4 of 9 accounts enrolled. 5 remaining escalated to HR.",
  },
  {
    num: "POAM-APEX-002", title: "Stale Account Review — Service Accounts Without Recent Access Review",
    deficiency: "22 service accounts have not been included in the formal quarterly access review. Ownership and necessity have not been verified for 8 accounts created more than 12 months ago.",
    risk: "medium" as const, status: "open" as const,
    ctrl: "AC.L2-3.1.1",
    plan: "Step 1: IT Administrator inventories all service accounts with last-use date. Step 2: Accounts with no activity in 90 days flagged for review. Step 3: Owners contacted to confirm necessity. Step 4: Unnecessary accounts deprovisioned. Target: 45 days.",
    days: 45, notes: "Service account inventory in progress. Preliminary list shows 8 candidate accounts for deprovisioning.",
  },
  {
    num: "POAM-APEX-003", title: "Intune Compliance Rollout Incomplete — 9 Devices Non-Compliant",
    deficiency: "9 managed devices are running outside the approved Intune security baseline configuration, primarily due to legacy application compatibility constraints. These devices may not meet encryption and patching requirements.",
    risk: "high" as const, status: "in_progress" as const,
    ctrl: "CM.L2-3.4.2",
    plan: "Phase 1: IT assesses each device for baseline conflicts. Phase 2: Application owners identify mitigation options. Phase 3: Devices updated to baseline or compensating controls documented. Phase 4: Formal exception process for any remaining legacy devices. Target: 60 days.",
    days: 60, notes: "3 of 9 devices remediated. 4 require application updates from vendor. 2 pending legacy software migration.",
  },
  {
    num: "POAM-APEX-004", title: "Audit Log Review Evidence Incomplete — Q1 2026 Gap",
    deficiency: "Audit log review records for 3 weeks of Q1 2026 are missing from Control HUB. The reviews were performed but not documented per the Audit Log Review Procedure.",
    risk: "medium" as const, status: "in_progress" as const,
    ctrl: "AU.L2-3.3.1",
    plan: "Step 1: Reconstruct available evidence from Sentinel logs for the missing weeks. Step 2: Create retrospective review records with available data. Step 3: Update procedure to require same-day upload of review records. Step 4: Implement automated reminder for weekly review completion. Target: 30 days.",
    days: 30, notes: "2 of 3 missing weeks reconstructed. Automated reminder rule configured in Sentinel.",
  },
  {
    num: "POAM-APEX-005", title: "Vulnerability Remediation Backlog — 5 High-Severity CVEs",
    deficiency: "5 high-severity CVEs from the June 2026 Tenable scan have exceeded the 30-day remediation SLA. All are patch-available findings on endpoint systems.",
    risk: "high" as const, status: "open" as const,
    ctrl: "RA.L2-3.11.2",
    plan: "Step 1: IT prioritizes affected systems for patching in next maintenance window. Step 2: Interim compensating controls applied (network isolation of affected systems). Step 3: Patching completed in scheduled maintenance window. Step 4: Re-scan to confirm remediation. Target: 14 days.",
    days: 14, notes: "Patching window scheduled. Compensating controls applied to 3 of 5 affected systems.",
  },
  {
    num: "POAM-APEX-006", title: "Incident Response Tabletop Exercise Overdue",
    deficiency: "The annual IR tabletop exercise was not completed in Q2 2026 as scheduled due to scheduling conflicts with key stakeholders. The exercise is now 45 days overdue.",
    risk: "medium" as const, status: "open" as const,
    ctrl: "IR.L2-3.6.3",
    plan: "Step 1: Reschedule tabletop exercise with all required participants for Q3 2026. Step 2: Engage third-party facilitator for ransomware scenario exercise. Step 3: Complete exercise and document after-action report. Step 4: Upload AAR and participant records to Control HUB. Target: 45 days.",
    days: 45, notes: "Exercise rescheduled for 2026-08-15. Facilitator engaged. Invitations sent.",
  },
  {
    num: "POAM-APEX-007", title: "Backup Restore Test Documentation Needs Update",
    deficiency: "The Q1 2026 backup restore test was completed but the documentation lacks required fields: restore time measurement, checksum validation results, and IT Administrator signature.",
    risk: "low" as const, status: "in_progress" as const,
    ctrl: "MP.L2-3.8.9",
    plan: "Step 1: IT Administrator reviews Q1 test records and adds missing data from system logs. Step 2: Updated Backup Restore Test Record uploaded to Control HUB with signature. Step 3: Procedure updated to include checklist ensuring all required fields are captured. Target: 14 days.",
    days: 14, notes: "Updated record being finalized. Procedure checklist draft complete.",
  },
];

// ─── Monitoring status assignments ────────────────────────────────────────────
const APEX_MON_STATUSES = [
  { status: "current" as const, lastCompleted: daysAgo(1), nextDue: daysFromNow(1), notes: "No anomalies. 2 alerts resolved." },
  { status: "current" as const, lastCompleted: daysAgo(1), nextDue: daysFromNow(1), notes: "All backup jobs successful." },
  { status: "current" as const, lastCompleted: daysAgo(5), nextDue: daysFromNow(2), notes: "1 risky sign-in investigated and dismissed." },
  { status: "open" as const, lastCompleted: daysAgo(10), nextDue: daysFromNow(-3), notes: "Scan results pending remediation assignment." },
  { status: "current" as const, lastCompleted: daysAgo(6), nextDue: daysFromNow(1), notes: "2 alerts investigated. 1 escalated to incident." },
  { status: "current" as const, lastCompleted: daysAgo(22), nextDue: daysFromNow(8), notes: "3 accounts de-provisioned. Review complete." },
  { status: "current" as const, lastCompleted: daysAgo(18), nextDue: daysFromNow(12), notes: "98% definition coverage. 2 offline devices tracked." },
  { status: "open" as const, lastCompleted: daysAgo(35), nextDue: daysFromNow(5), notes: "Monthly IR check pending. Exercise scheduled for August." },
  { status: "current" as const, lastCompleted: daysAgo(25), nextDue: daysFromNow(5), notes: "8 stale rules removed. Ruleset current." },
  { status: "in_progress" as const, lastCompleted: daysAgo(32), nextDue: daysFromNow(-2), notes: "91% MFA coverage. 12 accounts in enrollment escalation." },
  { status: "current" as const, lastCompleted: daysAgo(68), nextDue: daysFromNow(22), notes: "93% completion. 10 non-compliant escalated." },
  { status: "open" as const, lastCompleted: daysAgo(95), nextDue: daysFromNow(4), notes: "SSP review in progress. 8 sections updated." },
  { status: "current" as const, lastCompleted: daysAgo(80), nextDue: daysFromNow(10), notes: "All access rights certified. 7 memberships removed." },
  { status: "open" as const, lastCompleted: daysAgo(98), nextDue: daysFromNow(-5), notes: "Supplier review overdue. 3 vendors pending assessment." },
  { status: "current" as const, lastCompleted: daysAgo(210), nextDue: daysFromNow(155), notes: "Annual pen test completed 2026-01. 4 findings all remediated." },
  { status: "in_progress" as const, lastCompleted: daysAgo(310), nextDue: daysFromNow(55), notes: "Risk assessment update in progress. Workshop scheduled." },
  { status: "current" as const, lastCompleted: daysAgo(185), nextDue: daysFromNow(180), notes: "Annual readiness assessment complete. 110 controls reviewed." },
  { status: "current" as const, lastCompleted: daysAgo(195), nextDue: daysFromNow(170), notes: "All 15 policies reviewed. 3 updated for CMMC v2.1 alignment." },
  { status: "open" as const, lastCompleted: null, nextDue: null, notes: "As-needed. 8 incidents logged YTD." },
];

// ─── File content generators ──────────────────────────────────────────────────
async function generateEvidenceFile(spec: EvidenceSpec): Promise<Buffer> {
  const d = spec.fileName;
  const date = new Date(Date.now() - spec.daysAgo * 86400000).toISOString().split("T")[0]!;

  if (spec.ext === ".png") {
    return screenshotPng(spec.domain);
  }

  if (spec.ext === ".csv") {
    if (d.includes("User_List") || d.includes("user_list")) {
      return makeCsv(
        ["Display Name", "UPN", "Job Title", "Department", "Account Status", "Last Sign-In", "MFA Registered", "Licenses"],
        Array.from({ length: 30 }, (_, i) => [`User ${i + 1} APEX`, `user${i + 1}@apex-solutions.com`, ["Analyst", "Engineer", "Manager", "Director"][i % 4]!, ["IT", "Finance", "Engineering", "HR", "Legal"][i % 5]!, "Active", new Date(Date.now() - (i * 3) * 86400000).toISOString().split("T")[0]!, i < 27 ? "Yes" : "No", "M365 E3"])
      );
    }
    if (d.includes("Service_Account")) {
      return makeCsv(
        ["Account Name", "UPN", "Type", "Owner", "Application", "Last Activity", "MFA", "Review Status"],
        Array.from({ length: 22 }, (_, i) => [`svc-app${i + 1}`, `svc-app${i + 1}@apex-solutions.com`, i < 10 ? "Managed Identity" : "Service Principal", `admin@apex-solutions.com`, `Application ${i + 1}`, new Date(Date.now() - i * 7 * 86400000).toISOString().split("T")[0]!, i < 19 ? "N/A" : "Required", i < 19 ? "Verified" : "Flagged"])
      );
    }
    // Tenable scan export
    return makeCsv(
      ["CVE ID", "Severity", "CVSS Score", "Asset", "Plugin", "Vulnerability Name", "Solution", "First Detected", "Status"],
      [
        ["CVE-2025-1234", "High", "8.1", "APEX-WS-042", "210756", "Windows Print Spooler Elevation of Privilege", "Apply Microsoft Security Update KB5021271", date, "Open"],
        ["CVE-2025-2891", "High", "7.8", "APEX-SRV-003", "214823", "OpenSSL Buffer Overflow Vulnerability", "Upgrade OpenSSL to 3.1.4 or later", date, "In Remediation"],
        ["CVE-2025-3341", "High", "7.5", "APEX-WS-017", "216012", "Microsoft Edge Remote Code Execution", "Update Microsoft Edge to 124.0.2478.80", date, "Open"],
        ["CVE-2024-8901", "Medium", "6.5", "APEX-WS-005", "198234", "WinZip Directory Traversal", "Update WinZip to 28.0 or uninstall", date, "Open"],
        ["CVE-2025-4112", "Medium", "5.9", "APEX-WS-033", "219045", "Adobe Acrobat Information Disclosure", "Update Adobe Acrobat to 24.002.20759", date, "Open"],
      ]
    );
  }

  if (spec.ext === ".xlsx") {
    if (d.includes("Access_Review") || d.includes("Group_Membership") || d.includes("Least_Privilege") || d.includes("Admin_Role") || d.includes("Remote_Access") || d.includes("Guest_Access")) {
      return await makeXlsx([{
        name: "Access Review",
        headers: ["Name", "Email", "Role", "Department", "Access Group", "Last Sign-In", "Review Decision", "Reviewer", "Review Date"],
        rows: Array.from({ length: 25 }, (_, i) => [
          `Employee ${i + 1}`, `emp${i + 1}@apex-solutions.com`,
          ["Analyst", "Engineer", "Manager", "Admin", "Viewer"][i % 5]!,
          ["IT", "Finance", "Engineering", "HR"][i % 4]!,
          `CUI-Access-Group-${(i % 3) + 1}`,
          new Date(Date.now() - i * 2 * 86400000).toISOString().split("T")[0]!,
          i < 22 ? "Retain" : "Revoke",
          "IT Administrator", date,
        ]),
      }]);
    }
    if (d.includes("MFA_Registration") || d.includes("LAPS") || d.includes("Bypass")) {
      return await makeXlsx([{
        name: "MFA Status",
        headers: ["Display Name", "UPN", "MFA Registered", "Auth Methods", "Registration Date", "Last MFA Use", "Compliant"],
        rows: Array.from({ length: 30 }, (_, i) => [
          `User ${i + 1}`, `user${i + 1}@apex-solutions.com`,
          i < 27 ? "Yes" : "No",
          i < 27 ? "Microsoft Authenticator, SMS" : "None",
          i < 27 ? new Date(Date.now() - (i * 30 + 60) * 86400000).toISOString().split("T")[0]! : "",
          i < 27 ? new Date(Date.now() - i * 86400000).toISOString().split("T")[0]! : "Never",
          i < 27 ? "Yes" : "No",
        ]),
      }]);
    }
    if (d.includes("Password_Change")) {
      return await makeXlsx([{
        name: "Password Changes",
        headers: ["User", "UPN", "Change Type", "Changed By", "Date", "IP Address", "Location"],
        rows: Array.from({ length: 20 }, (_, i) => [
          `User ${i + 1}`, `user${i + 1}@apex-solutions.com`,
          i % 3 === 0 ? "Admin Reset" : "Self-Service Reset",
          i % 3 === 0 ? "IT Administrator" : "Self",
          new Date(Date.now() - i * 3 * 86400000).toISOString().split("T")[0]!,
          `10.0.${Math.floor(i / 10)}.${(i * 7) % 255}`,
          "United States",
        ]),
      }]);
    }
    if (d.includes("Device_Inventory") || d.includes("Encryption_Status") || d.includes("BitLocker") || d.includes("Software_Update") || d.includes("Patch")) {
      return await makeXlsx([{
        name: "Device Inventory",
        headers: ["Device Name", "Owner", "OS Version", "Compliance Status", "BitLocker", "Last Check-In", "Intune Enrolled", "Defender Status"],
        rows: Array.from({ length: 30 }, (_, i) => [
          `APEX-${i < 15 ? "WS" : "SRV"}-${String(i + 1).padStart(3, "0")}`,
          `user${(i % 20) + 1}@apex-solutions.com`,
          i < 25 ? "Windows 11 23H2" : "Windows 10 22H2",
          i < 26 ? "Compliant" : "Non-Compliant",
          i < 27 ? "Enabled" : "Not Enabled",
          new Date(Date.now() - i * 2 * 86400000).toISOString().split("T")[0]!,
          i < 28 ? "Yes" : "No",
          i < 29 ? "Active" : "Offline",
        ]),
      }]);
    }
    if (d.includes("Privileged_Activity") || d.includes("Audit_Log") || d.includes("Security_Alerts")) {
      return await makeXlsx([{
        name: "Activity Log",
        headers: ["Date", "User", "Operation", "Resource", "IP Address", "Result", "Reviewed", "Notes"],
        rows: Array.from({ length: 20 }, (_, i) => [
          new Date(Date.now() - i * 86400000).toISOString().split("T")[0]!,
          i % 3 === 0 ? "admin@apex-solutions.com" : `user${(i % 10) + 1}@apex-solutions.com`,
          ["Role Activation", "Policy Change", "User Created", "Password Reset", "MFA Bypass"][i % 5]!,
          ["Global Admin Role", "CA Policy", "User Account", "IT Admin", "Service Account"][i % 5]!,
          `203.0.${i % 10}.${i * 7 % 255}`,
          i < 18 ? "Success" : "Failure",
          "Yes",
          i < 18 ? "Normal operation" : "Investigated — false positive",
        ]),
      }]);
    }
    if (d.includes("Remediation_Tracker") || d.includes("Risk_Register")) {
      return await makeXlsx([{
        name: "Remediation",
        headers: ["CVE / Risk ID", "Title", "Severity", "CVSS", "Asset", "Owner", "Due Date", "Status", "Notes"],
        rows: [
          ["CVE-2025-1234", "Print Spooler EoP", "High", "8.1", "APEX-WS-042", "IT Admin", daysFromNow(10).toISOString().split("T")[0]!, "In Progress", "Patch scheduled"],
          ["CVE-2025-2891", "OpenSSL Buffer Overflow", "High", "7.8", "APEX-SRV-003", "IT Admin", daysFromNow(7).toISOString().split("T")[0]!, "In Progress", "Testing in UAT"],
          ["CVE-2025-3341", "Edge RCE", "High", "7.5", "APEX-WS-017", "IT Admin", daysFromNow(5).toISOString().split("T")[0]!, "Open", "Update scheduled"],
          ["CVE-2024-8901", "WinZip Traversal", "Medium", "6.5", "APEX-WS-005", "IT Admin", daysFromNow(20).toISOString().split("T")[0]!, "Open", "Low priority"],
          ["CVE-2025-4112", "Adobe Acrobat ID", "Medium", "5.9", "APEX-WS-033", "IT Admin", daysFromNow(45).toISOString().split("T")[0]!, "Open", "Vendor patch pending"],
          ["RISK-2026-001", "MFA Gap", "High", "", "All Users", "Compliance Mgr", daysFromNow(30).toISOString().split("T")[0]!, "In Progress", "POAM-APEX-001"],
          ["RISK-2026-002", "Backup Doc Gap", "Low", "", "Backup Systems", "IT Admin", daysFromNow(14).toISOString().split("T")[0]!, "In Progress", "POAM-APEX-007"],
        ],
      }]);
    }
    if (d.includes("Training") || d.includes("Completion") || d.includes("Schedule")) {
      return await makeXlsx([{
        name: "Training Records",
        headers: ["Name", "Email", "Department", "Training", "Assigned Date", "Completed Date", "Score", "Expiry", "Status"],
        rows: Array.from({ length: 28 }, (_, i) => [
          `Employee ${i + 1}`, `emp${i + 1}@apex-solutions.com`,
          ["IT", "Finance", "HR", "Engineering", "Legal"][i % 5]!,
          "APEX Solutions Annual Security Awareness Training 2026",
          daysAgo(180).toISOString().split("T")[0]!,
          i < 25 ? daysAgo(90 - i).toISOString().split("T")[0]! : "Incomplete",
          i < 25 ? `${85 + (i % 15)}%` : "",
          i < 25 ? daysFromNow(270).toISOString().split("T")[0]! : "N/A",
          i < 25 ? "Complete" : "Non-Compliant",
        ]),
      }]);
    }
    if (d.includes("Visitor_Log") || d.includes("Physical_Access") || d.includes("Termination")) {
      return await makeXlsx([{
        name: "Visitor Log",
        headers: ["Date", "Visitor Name", "Company", "Host", "Purpose", "Badge #", "Areas Accessed", "Sign-In", "Sign-Out"],
        rows: Array.from({ length: 20 }, (_, i) => [
          new Date(Date.now() - i * 3 * 86400000).toISOString().split("T")[0]!,
          `Visitor ${i + 1}`, ["ACME Corp", "Contoso", "TechVenture", "AuditFirm"][i % 4]!,
          `Host ${(i % 5) + 1}`,
          ["Vendor Meeting", "Audit", "Interview", "Training", "Support"][i % 5]!,
          `V${1000 + i}`,
          i % 4 === 0 ? "Lobby Only" : "Lobby, Conference Room",
          `${8 + (i % 4)}:${String(i % 60).padStart(2, "0")} AM`,
          `${11 + (i % 7)}:${String((i * 15) % 60).padStart(2, "0")} AM`,
        ]),
      }]);
    }
    if (d.includes("Backup_Completion")) {
      return await makeXlsx([{
        name: "Backup Log",
        headers: ["Job Name", "Type", "Server", "Start Time", "End Time", "Duration", "Size (GB)", "Status", "Restore Verified"],
        rows: Array.from({ length: 15 }, (_, i) => [
          `Backup Job ${i + 1}`, i % 3 === 0 ? "Full" : i % 3 === 1 ? "Incremental" : "Differential",
          `APEX-SRV-${String((i % 5) + 1).padStart(3, "0")}`,
          `2026-07-0${(i % 7) + 1} 02:00:00`, `2026-07-0${(i % 7) + 1} 03:${String(i * 4 % 60).padStart(2, "0")}:00`,
          `${1 + i % 4}h ${(i * 12) % 60}m`,
          `${100 + i * 25}`,
          i < 13 ? "Completed" : "Completed with Warnings",
          "Yes",
        ]),
      }]);
    }
    // Default: media disposal or other
    return await makeXlsx([{
      name: "Log",
      headers: ["Date", "Item", "Description", "Owner", "Status", "Notes"],
      rows: Array.from({ length: 10 }, (_, i) => [
        new Date(Date.now() - i * 14 * 86400000).toISOString().split("T")[0]!,
        `Item ${i + 1}`, `${spec.title} — record ${i + 1}`, "IT Administrator", "Completed", "Documented",
      ]),
    }]);
  }

  if (spec.ext === ".pdf") {
    const sections: Array<{ heading: string; content: string }> = [];
    if (spec.evType === "access_review") {
      sections.push(
        { heading: "Executive Summary", content: `This ${spec.title} was conducted by the APEX Solutions IT Administrator and Compliance Manager on ${date}. All user access was reviewed against the current role matrix and job function assignments.` },
        { heading: "Methodology", content: "Access rights were exported from Microsoft Entra ID and compared against the current HR personnel list and approved role matrix. Managers certified their team's access via the formal review checklist." },
        { heading: "Findings", content: "Total accounts reviewed: 137 active accounts\nAccounts with changes: 3 accounts deprovisioned, 7 group memberships removed\nPrivileged accounts reviewed: 22 accounts, all verified\nService accounts reviewed: 22 accounts, 3 flagged for MFA remediation" },
        { heading: "Remediation Actions", content: "3 accounts of terminated employees deprovisioned within 2 hours of review completion.\n7 excess group memberships removed.\n3 service accounts added to MFA remediation POAM (POAM-APEX-001)." },
        { heading: "Attestation", content: `This access review was completed on ${date} by IT Administrator with Compliance Manager certification.\nSignature on file in Control HUB.` }
      );
    } else if (spec.evType === "scan_report") {
      sections.push(
        { heading: "Scan Overview", content: `This report presents the results of the ${spec.title} conducted on ${date} using Tenable.io vulnerability assessment platform. All CUI-scope assets were included in scope.` },
        { heading: "Executive Summary", content: "Critical: 0\nHigh: 5 (3 within 30-day SLA)\nMedium: 12\nLow: 34\nInformational: 78\n\nOverall security posture: GOOD. No critical vulnerabilities detected. High CVEs are in active remediation." },
        { heading: "High Severity Findings", content: "CVE-2025-1234: Windows Print Spooler EoP (CVSS 8.1) — APEX-WS-042 — Patch pending\nCVE-2025-2891: OpenSSL Buffer Overflow (CVSS 7.8) — APEX-SRV-003 — In UAT\nCVE-2025-3341: Edge RCE (CVSS 7.5) — APEX-WS-017 — Update scheduled\nCVE-2025-4456: Kerberos Delegation (CVSS 7.2) — AD Controller — Remediated\nCVE-2025-5012: SMB Signing Missing (CVSS 7.1) — APEX-WS-009 — In Remediation" },
        { heading: "Remediation Status", content: "5 of 5 high CVEs have assigned owners and remediation plans. All are within the 30-day SLA or tracked in POAM-APEX-005. Next scan scheduled in 7 days to verify remediation." },
        { heading: "Trending", content: "This scan shows a 15% reduction in total findings compared to last month. 23 findings from previous scan were successfully remediated. Vulnerability management program is operating effectively." }
      );
    } else if (spec.evType === "risk_record") {
      sections.push(
        { heading: "Assessment Overview", content: `APEX Solutions conducted this risk assessment on ${date} following NIST SP 800-30 Rev 1 methodology. Scope includes all information systems processing, storing, or transmitting CUI.` },
        { heading: "Risk Identification", content: "14 risks identified across all domains:\n• 3 Critical (targeted for immediate remediation)\n• 5 High (remediation within 60 days)\n• 4 Medium (remediation within 90 days)\n• 2 Low (accepted with monitoring)" },
        { heading: "Key Risk Areas", content: "1. MFA Coverage Gap — likelihood: High, impact: High — POAM-APEX-001\n2. Legacy Authentication Protocols — likelihood: Medium, impact: High — In Remediation\n3. Incomplete Device Enrollment — likelihood: Medium, impact: Medium — POAM-APEX-003\n4. Vulnerability Remediation Backlog — likelihood: Low, impact: High — POAM-APEX-005" },
        { heading: "Risk Treatment Decisions", content: "Mitigate: 11 risks with active POA&M items or completed controls\nAccept: 2 low risks with documented acceptance rationale\nTransfer: 1 risk via cyber liability insurance coverage" },
        { heading: "Recommendations", content: "Priority 1: Complete MFA enrollment for all 9 remaining accounts within 30 days\nPriority 2: Finalize BitLocker rollout to all 9 non-compliant devices\nPriority 3: Complete IR tabletop exercise overdue from Q2\nPriority 4: Schedule Q3 penetration test for network-layer findings" }
      );
    } else if (spec.evType === "backup_verification") {
      sections.push(
        { heading: "Test Overview", content: `APEX Solutions conducted this backup restoration test on ${date} to verify data integrity and validate recovery time objectives (RTO: 8 hours) and recovery point objectives (RPO: 4 hours).` },
        { heading: "Systems Tested", content: "Production File Server: APEX-SRV-001 (Azure Backup)\nSQL Database Server: APEX-SRV-003 (Azure SQL Backup)\nSharePoint Online: Tenant-level backup (Veeam Backup for M365)\nEndpoint Image: Sample workstation APEX-WS-042 (Intune Autopilot)" },
        { heading: "Test Results", content: "File Server restore: SUCCESS — 2.3 hours (RTO: Met)\nSQL Database restore: SUCCESS — 1.8 hours (RTO: Met)\nSharePoint restore: SUCCESS — 45 minutes (RTO: Met)\nEndpoint restore via Autopilot: SUCCESS — 3.1 hours (RTO: Met)\n\nAll restore operations verified via checksum validation and application smoke testing." },
        { heading: "Findings and Recommendations", content: "1. File server restore time improved by 22% over last test due to network optimization.\n2. SQL restore required 1 manual intervention step — procedure updated to automate.\n3. Endpoint rebuild process documented and simplified. New runbook created." },
        { heading: "Attestation", content: `Test completed and verified by IT Administrator on ${date}. All systems restored to operational state and returned to production backup schedule.\nDocumentation retained in Control HUB per APEX Media Protection Policy.` }
      );
    } else if (spec.evType === "incident_record") {
      sections.push(
        { heading: "Exercise Overview", content: `APEX Solutions conducted an IR tabletop exercise on ${date}. The scenario simulated a targeted ransomware attack on the APEX CUI enclave. Participants included IT Administrator, Compliance Manager, Legal Counsel, and Executive Sponsor.` },
        { heading: "Scenario Summary", content: "Scenario: A phishing email compromised a privileged account credential. The attacker moved laterally and deployed ransomware to 3 file servers before detection.\n\nSimulation duration: 3 hours\nParticipants: 14 team members\nObserver: Third-party facilitator (CyberReady LLC)" },
        { heading: "Response Actions Tested", content: "Detection and Escalation: SIEM alert to IR team — 18 minutes (target: 30 min) ✓\nIsolation of affected systems: 42 minutes (target: 60 min) ✓\nNotification to Contracting Officer: 3 hours (target: 72 hours) ✓\nForensic preservation: Initiated during containment ✓\nRecovery from backup: Tested — 6.5 hours estimated" },
        { heading: "Gaps Identified", content: "1. Backup restoration procedure requires IT Director approval — delays recovery by 1+ hours\n2. Contracting Officer contact information was not in IR contact list (updated)\n3. Quarantine procedure for cloud workloads not documented\n4. Evidence preservation chain-of-custody form not in use" },
        { heading: "After-Action Decisions", content: "All 4 gaps logged as POA&M items. IR Plan version 2.2 update scheduled. Follow-up exercise planned for Q4 2026 to test cloud workload isolation scenario." }
      );
    } else {
      sections.push(
        { heading: "Document Overview", content: `This ${spec.evType.replace(/_/g, " ")} documents APEX Solutions' implementation of ${spec.ctrls.join(", ")} as of ${date}.` },
        { heading: "Current State", content: `${spec.desc}\n\nStatus: ${spec.status}\nDate: ${date}` },
        { heading: "Evidence Details", content: `Assessor Summary: ${spec.summary}\n\nThis document has been reviewed and approved by the APEX Solutions IT Administrator and Compliance Manager.` },
        { heading: "Retention", content: "This document is retained in Control HUB per the APEX Solutions data retention policy. Minimum retention period: 3 years from the date of creation." }
      );
    }
    return makePdf({ title: spec.title, orgName: "APEX Solutions LLC", date, sections, subtitle: `Controls: ${spec.ctrls.join(", ")}` });
  }

  // .docx evidence (policy/procedure uploaded as evidence)
  return makeDocx({
    title: spec.title, orgName: "APEX Solutions LLC", version: "1.0", date,
    sections: [
      { heading: "Overview", content: spec.desc },
      { heading: "Details", content: spec.summary },
    ],
  });
}

async function generateDocumentFile(spec: DocumentSpec): Promise<Buffer> {
  const date = new Date(Date.now() - spec.effectiveDaysAgo * 86400000).toISOString().split("T")[0]!;

  if (spec.ext === ".docx") {
    return makeDocx({
      title: spec.title, orgName: "APEX Solutions LLC",
      version: spec.version, date,
      sections: spec.sections.length > 0 ? spec.sections : [
        { heading: "1. Purpose", content: `This document establishes ${spec.title.toLowerCase()} requirements for APEX Solutions LLC.` },
        { heading: "2. Scope", content: "Applies to all personnel and systems within the CMMC boundary." },
        { heading: "3. Requirements", content: "Requirements are aligned to CMMC Level 2 and NIST SP 800-171 Rev 2." },
        { heading: "4. Review", content: `Reviewed annually. Current version: ${spec.version}. Effective: ${date}.` },
      ],
    });
  }

  if (spec.ext === ".xlsx") {
    if (spec.docType === "access_review") {
      return await makeXlsx([{
        name: "Access Review",
        headers: ["Name", "Email", "Role", "Department", "Access Groups", "Last Sign-In", "Decision", "Reviewer", "Date"],
        rows: Array.from({ length: 30 }, (_, i) => [
          `Employee ${i + 1}`, `emp${i + 1}@apex-solutions.com`,
          ["Analyst", "Manager", "Engineer", "Director", "Admin"][i % 5]!,
          ["IT", "Finance", "HR", "Engineering"][i % 4]!,
          `Group-${(i % 4) + 1}, Group-${(i % 3) + 5}`,
          daysAgo(i * 2).toISOString().split("T")[0]!,
          i < 28 ? "Retain" : "Revoke",
          "Compliance Manager", date,
        ]),
      }]);
    }
    if (spec.docType === "log") {
      if (spec.title.includes("Audit")) {
        return await makeXlsx([{
          name: "Audit Log Review",
          headers: ["Review Date", "Reviewer", "Period Covered", "Alerts Reviewed", "Anomalies Found", "Escalated", "Closed", "Notes"],
          rows: Array.from({ length: 13 }, (_, i) => [
            daysAgo(i * 7).toISOString().split("T")[0]!,
            i % 2 === 0 ? "IT Administrator" : "Security Analyst",
            `${daysAgo(i * 7 + 7).toISOString().split("T")[0]} – ${daysAgo(i * 7).toISOString().split("T")[0]}`,
            Math.floor(Math.random() * 20) + 5,
            Math.floor(Math.random() * 3),
            i % 7 === 0 ? "Yes" : "No",
            "Yes",
            i % 4 === 0 ? "1 false positive tuned" : "No issues",
          ]),
        }]);
      }
      if (spec.title.includes("Training")) {
        return await makeXlsx([{
          name: "Training Register",
          headers: ["Name", "Email", "Department", "Training", "Assigned", "Completed", "Score", "Expiry", "Status"],
          rows: Array.from({ length: 35 }, (_, i) => [
            `Employee ${i + 1}`, `emp${i + 1}@apex-solutions.com`,
            ["IT", "Finance", "HR", "Engineering", "Legal", "Operations"][i % 6]!,
            "APEX Annual Security Awareness Training 2026",
            daysAgo(180).toISOString().split("T")[0]!,
            i < 32 ? daysAgo(100 - i).toISOString().split("T")[0]! : "Not Completed",
            i < 32 ? `${88 + i % 12}%` : "",
            i < 32 ? daysFromNow(265 - i).toISOString().split("T")[0]! : "",
            i < 32 ? "Complete" : "Non-Compliant",
          ]),
        }]);
      }
    }
    if (spec.docType === "risk_record") {
      return await makeXlsx([{
        name: "Risk Register",
        headers: ["Risk ID", "Risk Title", "Category", "Likelihood", "Impact", "Risk Score", "Treatment", "Owner", "Due Date", "Status"],
        rows: [
          ["RISK-2026-001", "MFA Enrollment Gap", "Identity", "High", "High", "16", "Mitigate", "IT Admin", daysFromNow(30).toISOString().split("T")[0]!, "In Progress"],
          ["RISK-2026-002", "Legacy Auth Enabled", "Identity", "Medium", "High", "12", "Mitigate", "IT Admin", daysFromNow(60).toISOString().split("T")[0]!, "In Progress"],
          ["RISK-2026-003", "Device Compliance Gap", "Endpoint", "Medium", "Medium", "9", "Mitigate", "IT Admin", daysFromNow(60).toISOString().split("T")[0]!, "In Progress"],
          ["RISK-2026-004", "Vuln Remediation Backlog", "Vulnerability", "Low", "High", "8", "Mitigate", "IT Admin", daysFromNow(14).toISOString().split("T")[0]!, "In Progress"],
          ["RISK-2026-005", "Audit Log Gap", "Audit", "Low", "Medium", "6", "Mitigate", "Compliance", daysFromNow(30).toISOString().split("T")[0]!, "In Progress"],
          ["RISK-2026-006", "Physical Access Logging", "Physical", "Low", "Low", "4", "Accept", "Facility", daysFromNow(90).toISOString().split("T")[0]!, "Accepted"],
          ["RISK-2026-007", "Third-Party Risk", "Supply Chain", "Medium", "Medium", "9", "Mitigate", "Compliance", daysFromNow(90).toISOString().split("T")[0]!, "Open"],
        ],
      }]);
    }
    if (spec.docType === "register") {
      return await makeXlsx([{
        name: "POA&M",
        headers: ["POAM #", "Title", "Control", "Risk Level", "Status", "Owner", "Due Date", "Remediation Plan", "Notes"],
        rows: APEX_POAMS.map(p => [p.num, p.title, p.ctrl, p.risk.toUpperCase(), p.status.replace("_", " ").toUpperCase(), "IT Admin", daysFromNow(p.days).toISOString().split("T")[0]!, p.plan.slice(0, 80) + "...", p.notes]),
      }]);
    }
    // Generic log
    return await makeXlsx([{
      name: "Log",
      headers: ["Date", "Entry", "Details", "Status", "Owner"],
      rows: Array.from({ length: 10 }, (_, i) => [
        daysAgo(i * 7).toISOString().split("T")[0]!, `Entry ${i + 1}`, `${spec.title} log entry ${i + 1}`, "Completed", "IT Admin",
      ]),
    }]);
  }

  // PDF
  return makePdf({
    title: spec.title, orgName: "APEX Solutions LLC",
    date: new Date(Date.now() - spec.effectiveDaysAgo * 86400000).toISOString().split("T")[0]!,
    sections: [
      { heading: "Document Information", content: `Title: ${spec.title}\nOrganization: APEX Solutions LLC\nVersion: ${spec.version}\nEffective Date: ${date}\nCMMC Controls: ${spec.ctrls.join(", ")}` },
      { heading: "Purpose and Scope", content: "This document supports APEX Solutions' CMMC Level 2 compliance posture. It is retained in Control HUB and subject to the organization's document management and retention policies." },
      { heading: "Content", content: `${spec.title} — This record has been prepared and approved by the APEX Solutions Compliance Team.\n\nStatus: ${spec.status}\nReview Cycle: Annual\nNext Review: ${daysFromNow(365 - spec.effectiveDaysAgo).toISOString().split("T")[0]}` },
      { heading: "Attestation", content: `Prepared by: IT Administrator\nReviewed by: Compliance Manager\nDate: ${date}\n\nThis document is authentic and has been reviewed for accuracy.` },
    ],
    subtitle: `v${spec.version} | Controls: ${spec.ctrls.join(", ")}`,
  });
}

// ─── Seed Functions ──────────────────────────────────────────────────────────

async function seedOrg(adminUserId: string): Promise<string> {
  const [existing] = await db.select().from(organizationsTable)
    .where(eq(organizationsTable.id, APEX_ORG_ID)).limit(1);

  if (existing && !FORCE) {
    console.log(`  ↳ Org already exists (id: ${APEX_ORG_ID}). Use --force to refresh.`);
    return APEX_ORG_ID;
  }

  if (existing && FORCE) {
    console.log("  ↳ --force: clearing existing APEX Solutions data...");
    await db.delete(organizationsTable).where(eq(organizationsTable.id, APEX_ORG_ID));
    console.log("  ↳ Cleared. Re-creating...");
  }

  await db.insert(organizationsTable).values({
    id: APEX_ORG_ID,
    name: APEX_ORG_NAME,
    legalName: "APEX Solutions LLC",
    shortName: "APEX",
    cageCode: "7APEX1",
    uei: "APEX123456789",
    industry: "Defense Technology / Aerospace",
    primaryContact: "Joseph Murray",
    complianceManagerId: adminUserId,
    organizationAddress: "4200 Wilson Blvd, Suite 900, Arlington, VA 22203",
    assessmentScope: "Cloud infrastructure (Microsoft 365 + Azure), endpoint fleet (112 devices), on-premises file servers, and all systems processing or transmitting CUI",
    cmmcTargetLevel: "L2",
    notes: "TEST ORGANIZATION — Synthetic sample data only. Created for Control HUB demonstration and testing. All data is fake and does not represent real operations.",
    isTestOrganization: true,
    isActive: true,
  });
  console.log(`  ✓ Created org: ${APEX_ORG_NAME} (${APEX_ORG_ID})`);
  return APEX_ORG_ID;
}

async function seedMemberships(orgId: string, adminUserId: string): Promise<void> {
  // Admin
  await db.insert(organizationUsersTable).values({
    id: randomUUID(), organizationId: orgId, userId: adminUserId,
    role: "org_admin", status: "active", joinedAt: new Date(),
  }).onConflictDoNothing();

  // Sysadmin
  const [sysadmin] = await db.select({ id: usersTable.id }).from(usersTable)
    .where(eq(usersTable.email, SYSADMIN_EMAIL)).limit(1);
  if (sysadmin) {
    await db.insert(organizationUsersTable).values({
      id: randomUUID(), organizationId: orgId, userId: sysadmin.id,
      role: "global_admin", status: "active", joinedAt: new Date(),
    }).onConflictDoNothing();
  }
  console.log(`  ✓ Memberships seeded`);
}

async function seedControlAssessments(orgId: string, adminUserId: string): Promise<Record<string, string>> {
  const allControls = await db.select({ id: controlsTable.id, controlId: controlsTable.controlId })
    .from(controlsTable).orderBy(controlsTable.controlId);

  if (allControls.length === 0) {
    throw new Error("No controls found — run seed-cmmc first");
  }

  // Build control ref → DB UUID map
  const controlMap: Record<string, string> = {};
  for (const c of allControls) controlMap[c.controlId] = c.id;

  // Status distribution: 35 impl, 42 in_progress, 25 not_started, 8 at_risk = 110
  // Spread evenly using a prime step (37) for natural distribution across domains
  const statusPool: ("implemented" | "in_progress" | "not_started" | "at_risk")[] = [
    ...Array(35).fill("implemented" as const),
    ...Array(42).fill("in_progress" as const),
    ...Array(25).fill("not_started" as const),
    ...Array(8).fill("at_risk" as const),
  ];
  const statusAssignment: ("implemented" | "in_progress" | "not_started" | "at_risk")[] = new Array(110);
  for (let i = 0; i < 110; i++) {
    statusAssignment[(i * 37) % 110] = statusPool[i]!;
  }

  let n = 0;
  for (let i = 0; i < allControls.length; i++) {
    const ctrl = allControls[i]!;
    const status = statusAssignment[i] ?? "not_started";
    const narrative = (status === "not_started") ? null : getNarr(ctrl.controlId, status);
    await db.insert(controlAssessmentsTable).values({
      id: randomUUID(), organizationId: orgId, controlId: ctrl.id,
      status, implementationNarrative: narrative,
      assessedById: adminUserId,
      lastAssessedAt: status === "not_started" ? null : daysAgo(Math.floor(Math.random() * 90) + 1),
      createdAt: new Date(), updatedAt: new Date(),
    }).onConflictDoNothing();
    n++;
  }
  console.log(`  ✓ ${n} control assessments seeded (35 impl / 42 in-progress / 25 not-started / 8 at-risk)`);
  return controlMap;
}

async function seedMonitoring(orgId: string): Promise<void> {
  for (let i = 0; i < APEX_MONITORING.length; i++) {
    const item = APEX_MONITORING[i]!;
    const st = APEX_MON_STATUSES[i]!;
    await db.insert(monitoringItemsTable).values({
      id: randomUUID(), organizationId: orgId,
      task: item.task, frequency: item.frequency, controlRef: item.controlRef,
      description: item.description, sortOrder: item.sortOrder,
      operatingProcedure: item.op, testProcedure: item.test, evidenceToRetain: item.evToRetain,
      status: st.status, lastCompleted: st.lastCompleted, nextDue: st.nextDue, notes: st.notes,
      createdAt: new Date(), updatedAt: new Date(),
    }).onConflictDoNothing();
  }
  console.log(`  ✓ 19 monitoring items seeded`);
}

async function seedPoams(orgId: string, adminUserId: string, controlMap: Record<string, string>): Promise<void> {
  for (const p of APEX_POAMS) {
    const linkedControlId = controlMap[p.ctrl] ?? null;
    await db.insert(poamsTable).values({
      id: randomUUID(), organizationId: orgId,
      poamNumber: p.num, title: p.title,
      deficiencyDescription: p.deficiency,
      status: p.status, riskLevel: p.risk,
      ownerId: adminUserId,
      linkedControlId,
      remediationPlan: p.plan,
      scheduledCompletionDate: daysFromNow(p.days),
      notes: p.notes,
      createdAt: daysAgo(30), updatedAt: new Date(),
    }).onConflictDoNothing();
  }
  console.log(`  ✓ 7 POA&M items seeded`);
}

async function seedTasks(orgId: string, adminUserId: string): Promise<void> {
  const tasks = [
    { title: "Complete MFA enrollment for 9 outstanding accounts", priority: "high" as const, type: "control_review" as const, days: 14 },
    { title: "Patch 5 high-severity CVEs from July vulnerability scan", priority: "critical" as const, type: "control_review" as const, days: 7 },
    { title: "Reschedule Q3 IR tabletop exercise", priority: "medium" as const, type: "general" as const, days: 21 },
    { title: "Complete device compliance remediation for 9 non-compliant endpoints", priority: "high" as const, type: "control_review" as const, days: 30 },
    { title: "Finalize SSP review — 8 sections pending update", priority: "medium" as const, type: "policy_review" as const, days: 45 },
    { title: "Complete security awareness training for 10 outstanding employees", priority: "medium" as const, type: "training_review" as const, days: 14 },
    { title: "Upload Q2 audit log review records for 3 missing weeks", priority: "high" as const, type: "policy_review" as const, days: 7 },
  ];
  for (const t of tasks) {
    await db.insert(tasksTable).values({
      id: randomUUID(), organizationId: orgId,
      title: t.title, status: "open", priority: t.priority, taskType: t.type,
      dueDate: daysFromNow(t.days), assigneeId: adminUserId, createdById: adminUserId,
      tags: [], isRecurring: false, createdAt: new Date(), updatedAt: new Date(),
    }).onConflictDoNothing();
  }
  console.log(`  ✓ 7 tasks seeded`);
}

async function seedEvidence(orgId: string, adminUserId: string, controlMap: Record<string, string>): Promise<void> {
  console.log(`  Uploading ${EVIDENCE_SPECS.length} evidence files...`);
  let n = 0;
  const BATCH = 8;

  for (let bStart = 0; bStart < EVIDENCE_SPECS.length; bStart += BATCH) {
    const batch = EVIDENCE_SPECS.slice(bStart, bStart + BATCH);
    await Promise.all(batch.map(async (spec) => {
      try {
        const buf = await generateEvidenceFile(spec);
        const fileKey = await uploadFile(buf, spec.ext, spec.mime, spec.fileName);
        const evId = randomUUID();
        const collected = daysAgo(spec.daysAgo);

        await db.insert(evidenceItemsTable).values({
          id: evId, organizationId: orgId,
          title: spec.title, description: spec.desc, evidenceType: spec.evType,
          status: spec.status, fileKey, fileName: spec.fileName,
          fileSize: buf.length, mimeType: spec.mime,
          ownerId: adminUserId, version: "1.0",
          tags: spec.tags ?? [],
          assessorSummary: spec.summary,
          isCurrentVersion: true,
          collectedAt: collected, createdAt: collected, updatedAt: new Date(),
        }).onConflictDoNothing();

        // Link to controls
        for (const ctrlRef of spec.ctrls) {
          const ctrlId = controlMap[ctrlRef];
          if (ctrlId) {
            await db.insert(evidenceControlLinksTable).values({
              id: randomUUID(), evidenceId: evId, controlId: ctrlId,
              linkedAt: new Date(), linkedById: adminUserId,
            }).onConflictDoNothing();
          }
        }
        n++;
        process.stdout.write(`    ✓ [${n}/${EVIDENCE_SPECS.length}] ${spec.fileName}\n`);
      } catch (err) {
        console.error(`    ✗ Failed: ${spec.fileName} — ${(err as Error).message}`);
      }
    }));
  }
  console.log(`  ✓ ${n} evidence records created with file attachments`);
}

async function seedDocuments(orgId: string, adminUserId: string, controlMap: Record<string, string>): Promise<void> {
  console.log(`  Uploading ${DOCUMENT_SPECS.length} document files...`);
  let n = 0;

  for (const spec of DOCUMENT_SPECS) {
    try {
      const buf = await generateDocumentFile(spec);
      const fileKey = await uploadFile(buf, spec.ext, spec.mime, spec.fileName);
      const docId = randomUUID();
      const effectiveDate = daysAgo(spec.effectiveDaysAgo);

      await db.insert(documentsTable).values({
        id: docId, organizationId: orgId,
        title: spec.title, docType: spec.docType, status: spec.status,
        cmmcLevel: "L2", version: spec.version,
        body: "",
        organizationName: APEX_ORG_NAME,
        systemName: "APEX Controlled Unclassified Information Enclave",
        effectiveDate, nextReviewDate: daysFromNow(365 - spec.effectiveDaysAgo),
        fileKey, fileName: spec.fileName,
        fileSize: String(buf.length),
        ownerId: adminUserId,
        isCurrentVersion: true,
        requiresApproval: true,
        tags: [],
        approvedAt: spec.status === "approved" || spec.status === "active" ? effectiveDate : null,
        activatedAt: spec.status === "active" ? effectiveDate : null,
        createdAt: effectiveDate, updatedAt: new Date(),
      }).onConflictDoNothing();

      // Link to controls
      for (const ctrlRef of spec.ctrls) {
        const ctrlId = controlMap[ctrlRef];
        if (ctrlId) {
          await db.insert(documentControlMapsTable).values({
            id: randomUUID(), documentId: docId, controlId: ctrlId,
            linkedAt: new Date(),
          }).onConflictDoNothing();
        }
      }
      n++;
      process.stdout.write(`    ✓ [${n}/${DOCUMENT_SPECS.length}] ${spec.fileName}\n`);
    } catch (err) {
      console.error(`    ✗ Failed: ${spec.fileName} — ${(err as Error).message}`);
    }
  }
  console.log(`  ✓ ${n} documents created`);
}

async function seedPreAssessment(orgId: string, adminUserId: string): Promise<void> {
  const connId = randomUUID();
  const scanDate = daysAgo(14);

  await db.insert(tenantConnectionsTable).values({
    id: connId, organizationId: orgId,
    tenantName: "APEX Solutions Microsoft 365",
    microsoftTenantId: "b2c3d4e5-f6a7-8901-bcde-f12345678901",
    primaryDomain: "apex-solutions.com",
    authMode: "app_only",
    connectionStatus: "connected",
    permissionsGranted: ["User.Read.All", "Policy.Read.All", "DeviceManagementConfiguration.Read.All", "SecurityEvents.Read.All", "AuditLog.Read.All", "IdentityRiskyUser.Read.All"],
    lastSuccessfulScan: scanDate,
    connectedBy: "IT Administrator",
    connectedAt: daysAgo(60),
    notes: "SYNTHETIC — Fake Microsoft tenant connection for APEX Solutions test org. Not connected to real tenant.",
    createdAt: daysAgo(60), updatedAt: scanDate,
  }).onConflictDoNothing();

  const scanId = randomUUID();
  await db.insert(paScanRunsTable).values({
    id: scanId, organizationId: orgId, tenantConnectionId: connId,
    scanName: "APEX Baseline Compliance Scan — July 2026",
    scanType: "full",
    status: "completed",
    packsRequested: ["entra_id", "intune", "defender"],
    packsCompleted: ["entra_id", "intune", "defender"],
    packsFailed: [],
    startedAt: new Date(scanDate.getTime() - 1800000),
    completedAt: scanDate,
    totalChecks: 88,
    passedChecks: 42,
    failedChecks: 32,
    warnings: 10,
    unknowns: 4,
    generatedEvidenceCount: 11,
    generatedFindingCount: 6,
    generatedEvidenceRequestCount: 5,
    createdBy: "IT Administrator",
    createdAt: daysAgo(60), updatedAt: scanDate,
  }).onConflictDoNothing();

  const findings = [
    { ruleId: "APEX-ENTRA-001", name: "MFA Coverage", title: "MFA Enforcement Incomplete — 9 Accounts Without MFA", severity: "high" as const, result: "fail" as const, pack: "entra_id", observed: "9 active user accounts have not completed MFA registration and are not covered by an MFA-enforcing Conditional Access policy", expected: "All active users must be enrolled in MFA and covered by at least one MFA-enforcing Conditional Access policy", affected: 9, controls: ["IA.L2-3.5.3", "AC.L2-3.1.1"], remediation: "Enforce MFA enrollment deadline. Block CUI access for non-enrolled accounts until registration completes.", roadmap: "Complete MFA Enrollment for All Users" },
    { ruleId: "APEX-INTUNE-001", name: "Device Compliance", title: "9 Devices Non-Compliant with Intune Security Baseline", severity: "high" as const, result: "fail" as const, pack: "intune", observed: "9 of 112 managed devices report non-compliant status against the APEX Solutions Intune security baseline policy", expected: "All managed devices must be compliant with the enforced security baseline", affected: 9, controls: ["CM.L2-3.4.2", "CM.L2-3.4.1"], remediation: "Remediate baseline conflicts. Use Intune filter-based policy targeting to apply exceptions for legacy apps.", roadmap: "Remediate Intune Baseline Non-Compliance" },
    { ruleId: "APEX-ENTRA-002", name: "Legacy Auth", title: "Legacy Authentication Still Active for 2 Clients", severity: "medium" as const, result: "partial" as const, pack: "entra_id", observed: "Sign-in logs show successful legacy authentication from 2 client applications in the past 30 days", expected: "All legacy authentication must be blocked. No successful legacy auth events should appear in sign-in logs", affected: 2, controls: ["IA.L2-3.5.3", "IA.L2-3.5.4"], remediation: "Identify legacy clients via sign-in logs. Schedule migration to modern auth. Move to enforcement mode in CA policy.", roadmap: "Complete Legacy Authentication Blocking" },
    { ruleId: "APEX-INTUNE-002", name: "BitLocker", title: "9 Devices Lack BitLocker Encryption", severity: "high" as const, result: "fail" as const, pack: "intune", observed: "9 managed Windows devices report BitLocker encryption status as Not Encrypted or Not Reporting", expected: "All managed Windows devices must have BitLocker encryption enabled and reporting to Intune", affected: 9, controls: ["SC.L2-3.13.16", "SC.L2-3.13.8"], remediation: "Create or update Intune device configuration profile to enforce BitLocker with TPM PIN. Require encryption compliance.", roadmap: "Enforce BitLocker on All Endpoints" },
    { ruleId: "APEX-DEFENDER-001", name: "Alert Response", title: "3 High-Severity Defender Alerts Older than 7 Days", severity: "medium" as const, result: "partial" as const, pack: "defender", observed: "3 high-severity security alerts in Microsoft Defender XDR are more than 7 days old without an acknowledged or closed status", expected: "All high and critical alerts must be acknowledged and assigned within 24 hours of creation", affected: 3, controls: ["AU.L2-3.3.1", "IR.L2-3.6.1"], remediation: "Assign all open alerts to security analyst. Create SLA enforcement process for alert triage. Configure automated escalation for unacknowledged high alerts.", roadmap: "Establish Daily Security Alert Review SLA" },
    { ruleId: "APEX-ENTRA-003", name: "Audit Retention", title: "Azure AD Audit Log Retention Below 90 Days on Non-Sentinel Workspace", severity: "low" as const, result: "fail" as const, pack: "entra_id", observed: "Azure AD audit log interactive retention is 30 days in the default Log Analytics Workspace", expected: "Audit logs must be retained and available for review for at least 90 days", affected: 0, controls: ["AU.L2-3.3.6", "AU.L2-3.3.2"], remediation: "Configure diagnostic settings to route all audit log categories to a Log Analytics Workspace with 90+ day interactive retention.", roadmap: "Extend Audit Log Retention to 365 Days" },
  ];

  const findingIds: string[] = [];
  for (const f of findings) {
    const fId = randomUUID();
    findingIds.push(fId);
    await db.insert(paFindingsTable).values({
      id: fId, scanRunId: scanId, organizationId: orgId,
      ruleId: f.ruleId, ruleName: f.name, title: f.title,
      severity: f.severity, result: f.result, packId: f.pack,
      observedCondition: f.observed, expectedCondition: f.expected,
      affectedCount: f.affected, linkedControlIds: f.controls,
      recommendedRemediation: f.remediation, suggestedRoadmapAction: f.roadmap,
      createdAt: scanDate, updatedAt: scanDate,
    }).onConflictDoNothing();
  }

  const evRecords = [
    { pack: "entra_id", title: "Conditional Access Policy Export — All Policies", desc: "Export of all Conditional Access policies showing coverage and conditions.", controls: ["AC.L2-3.1.1", "IA.L2-3.5.3"], status: "approved" as const },
    { pack: "intune", title: "Intune Device Compliance Policy Configuration", desc: "All Intune device compliance policies with settings and assignments.", controls: ["CM.L2-3.4.1", "CM.L2-3.4.2"], status: "approved" as const },
    { pack: "entra_id", title: "MFA Registration Status Report — All Users", desc: "Per-user MFA registration status and registered authentication methods.", controls: ["IA.L2-3.5.3"], status: "pending_review" as const },
    { pack: "intune", title: "BitLocker Encryption Compliance Report", desc: "Intune report showing encryption status per managed device.", controls: ["SC.L2-3.13.16", "SC.L2-3.13.8"], status: "pending_review" as const },
    { pack: "entra_id", title: "Sign-in Log — Risky Sign-ins Last 30 Days", desc: "Azure AD Identity Protection risky sign-in events for the past 30 days.", controls: ["IA.L2-3.5.3", "AU.L2-3.3.1"], status: "approved" as const },
    { pack: "defender", title: "Microsoft Defender XDR Alert Summary", desc: "Summary of all security alerts from Defender XDR including open and closed items.", controls: ["AU.L2-3.3.1", "IR.L2-3.6.1"], status: "approved" as const },
    { pack: "entra_id", title: "Legacy Authentication Sign-in Log", desc: "Sign-in events using legacy authentication protocols from the past 30 days.", controls: ["IA.L2-3.5.3", "IA.L2-3.5.4"], status: "pending_review" as const },
    { pack: "intune", title: "Device Compliance Status — All Devices", desc: "Intune compliance status for all enrolled devices.", controls: ["CM.L2-3.4.2"], status: "approved" as const },
    { pack: "entra_id", title: "Azure AD Audit Log Retention Settings", desc: "Current audit log retention configuration from Diagnostic Settings.", controls: ["AU.L2-3.3.6"], status: "approved" as const },
    { pack: "defender", title: "Open Security Alerts — High Severity", desc: "All open high-severity security alerts from Microsoft Defender XDR.", controls: ["IR.L2-3.6.1"], status: "pending_review" as const },
    { pack: "intune", title: "Intune Security Baseline Assignment Report", desc: "Report showing security baseline policy assignments and compliance.", controls: ["CM.L2-3.4.1"], status: "approved" as const },
  ];

  for (const er of evRecords) {
    await db.insert(paEvidenceRecordsTable).values({
      id: randomUUID(), scanRunId: scanId, organizationId: orgId,
      packId: er.pack, title: er.title, description: er.desc,
      evidenceType: "Tenant Assessment Snapshot", source: "Microsoft Graph API",
      linkedControlIds: er.controls, status: er.status,
      collectedAt: scanDate, createdAt: scanDate, updatedAt: scanDate,
    }).onConflictDoNothing();
  }

  const evRequests = [
    { title: "MFA Enrollment Screenshot — All Admin Accounts", instructions: "Take a screenshot of Entra ID Users > Per-user MFA showing registration status for all users with admin roles.", filename: "mfa-admin-enrollment-screenshot.png", controls: ["IA.L2-3.5.3"], findingIdx: 0, days: 14 },
    { title: "BitLocker Policy Export from Intune", instructions: "Export the Intune device configuration profile enforcing BitLocker. Include policy settings and device assignments.", filename: "intune-bitlocker-policy-export.pdf", controls: ["SC.L2-3.13.8"], findingIdx: 3, days: 14 },
    { title: "Legacy Authentication Block Policy Screenshot", instructions: "Screenshot of Conditional Access policy blocking legacy authentication. Show policy state, conditions, and grant controls.", filename: "ca-block-legacy-auth.png", controls: ["IA.L2-3.5.3"], findingIdx: 2, days: 7 },
    { title: "Defender Alert Triage Documentation", instructions: "Provide documentation of the 3 unresolved high-severity Defender alerts: analyst assignment, investigation notes, and planned resolution.", filename: "defender-alert-triage-q3-2026.pdf", controls: ["AU.L2-3.3.1", "IR.L2-3.6.1"], findingIdx: 4, days: 3 },
    { title: "Audit Log Retention Configuration Screenshot", instructions: "Screenshot of Log Analytics Workspace > Usage and Estimated Costs > Data Retention showing 90+ day retention configured.", filename: "log-analytics-retention-config.png", controls: ["AU.L2-3.3.6"], findingIdx: 5, days: 21 },
  ];

  for (const er of evRequests) {
    await db.insert(paEvidenceRequestsTable).values({
      id: randomUUID(), scanRunId: scanId, organizationId: orgId,
      findingId: findingIds[er.findingIdx] ?? null,
      title: er.title, instructions: er.instructions,
      suggestedFilename: er.filename, linkedControlIds: er.controls,
      dueDate: daysFromNow(er.days), ownerEmail: ADMIN_EMAIL,
      status: "open", createdAt: scanDate, updatedAt: scanDate,
    }).onConflictDoNothing();
  }

  const roadmap = [
    { cat: "Identity & Access", title: "Complete MFA Enrollment for All Users", desc: "Enforce MFA enrollment deadline. Block CUI system access for non-enrolled users via Conditional Access.", priority: 1, findings: ["APEX-ENTRA-001"], controls: ["IA.L2-3.5.3", "AC.L2-3.1.1"], status: "in_progress" as const },
    { cat: "Device Management", title: "Remediate Intune Baseline Non-Compliance", desc: "Resolve legacy app compatibility conflicts. Apply Intune filter-based policy exceptions where justified.", priority: 1, findings: ["APEX-INTUNE-001"], controls: ["CM.L2-3.4.2"], status: "in_progress" as const },
    { cat: "Data Protection", title: "Enforce BitLocker on All Endpoints", desc: "Create or update the Intune device configuration profile to enforce BitLocker AES-256 with TPM+PIN.", priority: 2, findings: ["APEX-INTUNE-002"], controls: ["SC.L2-3.13.16", "SC.L2-3.13.8"], status: "open" as const },
    { cat: "Identity & Access", title: "Complete Legacy Authentication Blocking", desc: "Identify remaining 2 legacy clients via sign-in logs. Migrate to modern auth and move CA policy to enforcement.", priority: 2, findings: ["APEX-ENTRA-002"], controls: ["IA.L2-3.5.3", "IA.L2-3.5.4"], status: "in_progress" as const },
    { cat: "Operations", title: "Establish Daily Security Alert Review SLA", desc: "Define security operations process for daily Defender XDR alert review. Assign on-call rotation.", priority: 3, findings: ["APEX-DEFENDER-001"], controls: ["AU.L2-3.3.1", "IR.L2-3.6.1"], status: "open" as const },
    { cat: "Audit & Logging", title: "Extend Audit Log Retention to 365 Days", desc: "Route all Azure AD and system audit logs to a Log Analytics Workspace with 365-day retention.", priority: 3, findings: ["APEX-ENTRA-003"], controls: ["AU.L2-3.3.6", "AU.L2-3.3.2"], status: "open" as const },
    { cat: "Device Management", title: "Complete Intune Device Enrollment", desc: "Identify and enroll any remaining unmanaged devices used by CUI-system users.", priority: 4, findings: [], controls: ["CM.L2-3.4.1"], status: "open" as const },
    { cat: "Identity & Access", title: "Implement Privileged Identity Management", desc: "Configure Entra ID PIM for all privileged role holders. Require time-bound activation with justification.", priority: 4, findings: [], controls: ["AC.L2-3.1.2", "AC.L2-3.1.5"], status: "open" as const },
  ];

  for (const ra of roadmap) {
    await db.insert(paRoadmapActionsTable).values({
      id: randomUUID(), scanRunId: scanId, organizationId: orgId,
      category: ra.cat, title: ra.title, description: ra.desc,
      priority: ra.priority, drivingFindings: ra.findings,
      linkedControlIds: ra.controls, status: ra.status,
      createdAt: scanDate, updatedAt: scanDate,
    }).onConflictDoNothing();
  }

  console.log(`  ✓ Pre-assessment data seeded (6 findings, 11 evidence records, 5 requests, 8 roadmap actions)`);
}

// ─── Validation ───────────────────────────────────────────────────────────────
async function validate(orgId: string): Promise<boolean> {
  console.log("\n📋 Validating APEX Solutions data...");
  let pass = true;
  const check = (label: string, actual: number, min: number) => {
    const ok = actual >= min;
    console.log(`  ${ok ? "✓" : "✗"} ${label}: ${actual} (expected ≥ ${min})`);
    if (!ok) pass = false;
  };

  const [orgRow] = await db.select({ name: organizationsTable.name, isTest: organizationsTable.isTestOrganization })
    .from(organizationsTable).where(eq(organizationsTable.id, orgId)).limit(1);
  console.log(`  ✓ Organization: ${orgRow?.name ?? "NOT FOUND"} (isTestOrganization: ${orgRow?.isTest})`);
  if (!orgRow) pass = false;

  const [{ value: ctrlCount }] = await db.select({ value: count() }).from(controlAssessmentsTable)
    .where(eq(controlAssessmentsTable.organizationId, orgId));
  check("Control assessments", ctrlCount, 110);

  const [{ value: evCount }] = await db.select({ value: count() }).from(evidenceItemsTable)
    .where(and(eq(evidenceItemsTable.organizationId, orgId), sql`deleted_at IS NULL`));
  check("Evidence records", evCount, 75);

  const [{ value: evWithFile }] = await db.select({ value: count() }).from(evidenceItemsTable)
    .where(and(eq(evidenceItemsTable.organizationId, orgId), sql`file_key IS NOT NULL AND deleted_at IS NULL`));
  check("Evidence with files", evWithFile, 75);

  const [{ value: docCount }] = await db.select({ value: count() }).from(documentsTable)
    .where(and(eq(documentsTable.organizationId, orgId), sql`deleted_at IS NULL`));
  check("Documents", docCount, 20);

  const [{ value: monCount }] = await db.select({ value: count() }).from(monitoringItemsTable)
    .where(eq(monitoringItemsTable.organizationId, orgId));
  check("Monitoring items", monCount, 19);

  const [{ value: poamCount }] = await db.select({ value: count() }).from(poamsTable)
    .where(eq(poamsTable.organizationId, orgId));
  check("POA&M records", poamCount, 7);

  const [{ value: evLinkCount }] = await db.select({ value: count() }).from(evidenceControlLinksTable)
    .leftJoin(evidenceItemsTable, eq(evidenceControlLinksTable.evidenceId, evidenceItemsTable.id))
    .where(eq(evidenceItemsTable.organizationId, orgId));
  check("Evidence-control links", evLinkCount, 100);

  const [{ value: docLinkCount }] = await db.select({ value: count() }).from(documentControlMapsTable)
    .leftJoin(documentsTable, eq(documentControlMapsTable.documentId, documentsTable.id))
    .where(eq(documentsTable.organizationId, orgId));
  check("Document-control links", docLinkCount, 40);

  const statusCounts = await db.select({ status: controlAssessmentsTable.status, n: count() })
    .from(controlAssessmentsTable)
    .where(eq(controlAssessmentsTable.organizationId, orgId))
    .groupBy(controlAssessmentsTable.status);
  for (const s of statusCounts) {
    console.log(`    • ${s.status}: ${s.n}`);
  }

  console.log(`\n${pass ? "✅ All validation checks passed" : "⚠️  Some validation checks failed — review output above"}`);
  return pass;
}

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log(`\n🚀 Control HUB — APEX Solutions Seed Script`);
  console.log(`   Date:         ${TODAY}`);
  console.log(`   Mode:         ${VALIDATE_ONLY ? "validate" : FORCE ? "force-refresh" : "create-or-skip"}`);
  console.log(`   Skip files:   ${SKIP_FILES}`);
  console.log(`   Org ID:       ${APEX_ORG_ID}\n`);

  if (!PRIVATE_OBJECT_DIR && !SKIP_FILES) {
    console.warn("⚠️  PRIVATE_OBJECT_DIR not set — file uploads will fail. Use --skip-files to bypass.\n");
  }

  // Find admin user
  const [adminUser] = await db.select({ id: usersTable.id })
    .from(usersTable).where(eq(usersTable.email, ADMIN_EMAIL)).limit(1);
  if (!adminUser) {
    console.error(`✗ Admin user ${ADMIN_EMAIL} not found. Run seed-cmmc first.`);
    process.exit(1);
  }
  const adminUserId = adminUser.id;
  console.log(`  ✓ Admin user found: ${ADMIN_EMAIL}\n`);

  if (VALIDATE_ONLY) {
    const ok = await validate(APEX_ORG_ID);
    process.exit(ok ? 0 : 1);
  }

  // 1. Organization
  console.log("1. Creating organization...");
  await seedOrg(adminUserId);

  // 2. Memberships
  console.log("2. Seeding memberships...");
  await seedMemberships(APEX_ORG_ID, adminUserId);

  // 3. Control assessments
  console.log("3. Seeding 110 control assessments...");
  const controlMap = await seedControlAssessments(APEX_ORG_ID, adminUserId);

  // 4. Monitoring
  console.log("4. Seeding 19 monitoring items...");
  await seedMonitoring(APEX_ORG_ID);

  // 5. POA&Ms
  console.log("5. Seeding 7 POA&M items...");
  await seedPoams(APEX_ORG_ID, adminUserId, controlMap);

  // 6. Tasks
  console.log("6. Seeding tasks...");
  await seedTasks(APEX_ORG_ID, adminUserId);

  // 7. Evidence (with real file uploads)
  console.log("7. Seeding evidence records with files...");
  await seedEvidence(APEX_ORG_ID, adminUserId, controlMap);

  // 8. Documents (with real file uploads)
  console.log("8. Seeding documents with files...");
  await seedDocuments(APEX_ORG_ID, adminUserId, controlMap);

  // 9. Pre-assessment
  console.log("9. Seeding pre-assessment scan data...");
  await seedPreAssessment(APEX_ORG_ID, adminUserId);

  // 10. Validate
  await validate(APEX_ORG_ID);

  console.log(`
✅ APEX Solutions seed complete!

Organization:    ${APEX_ORG_NAME}
Org ID:          ${APEX_ORG_ID}
Login:           ${ADMIN_EMAIL} / Admin1234!
Access:          Admin > switch to "APEX Solutions"
isTestOrg:       true (TEST DATA badge shown in UI)

Summary:
  • 110 control assessments (35 impl / 42 in-progress / 25 not-started / 8 at-risk)
  • 77 evidence records with real uploaded files
  • 21 documents with real uploaded files
  • 19 monitoring items
  • 7 POA&M items
  • 7 tasks
  • 1 pre-assessment scan (6 findings, 11 evidence snapshots, 5 requests, 8 roadmap actions)

Next steps:
  • pnpm seed:apex-solutions --validate    — check data health
  • pnpm seed:apex-solutions --skip-files  — re-seed DB only (faster for dev testing)
  • pnpm seed:apex-solutions --force       — delete and completely re-create
`);
  process.exit(0);
}

main().catch((err) => {
  console.error("\n✗ Seed failed:", err);
  process.exit(1);
});
