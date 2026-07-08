import { Router } from "express";
import { deflateSync } from "zlib";
import PDFDocument from "pdfkit";
import * as XLSX from "xlsx";
import AdmZip from "adm-zip";
import { randomUUID } from "crypto";
import {
  db,
  evidenceItemsTable,
  evidenceControlLinksTable,
  documentsTable,
  documentControlMapsTable,
  controlsTable,
  organizationsTable,
  usersTable,
} from "@workspace/db";
import { eq } from "drizzle-orm";
import { objectStorageClient, ObjectStorageService } from "../lib/objectStorage";
import { requireAuth } from "../lib/auth";

const router = Router();
const objSvc = new ObjectStorageService();

const APEX_ORG_ID = "7a2f5c8e-4b3d-4a9f-8e2c-1d0a5b6c7d8f";

function requireAdmin(req: any, res: any, next: any) {
  if (req.authUser?.role !== "admin") return res.status(403).json({ error: "Admin access required" });
  next();
}

function daysAgo(n: number) { return new Date(Date.now() - n * 86_400_000); }
function daysFromNow(n: number) { return new Date(Date.now() + n * 86_400_000); }
function isoDate(d: Date) { return d.toISOString().split("T")[0]!; }

// ── GCS upload helpers ────────────────────────────────────────────────────────
async function uploadEvidenceToGCS(buffer: Buffer, mimeType: string, ext: string, filename: string): Promise<string> {
  const privateDir = objSvc.getPrivateObjectDir();
  const parts = (privateDir.startsWith("/") ? privateDir : `/${privateDir}`).split("/").filter(Boolean);
  const bucketName = parts[0]!;
  const prefix = parts.slice(1).join("/");
  const objectId = randomUUID();
  const objectName = prefix ? `${prefix}/evidence/${objectId}${ext}` : `evidence/${objectId}${ext}`;
  await objectStorageClient.bucket(bucketName).file(objectName).save(buffer, {
    contentType: mimeType,
    metadata: { contentDisposition: `attachment; filename="${encodeURIComponent(filename)}"` },
  });
  return `/objects/evidence/${objectId}${ext}`;
}

async function uploadDocToGCS(buffer: Buffer, mimeType: string, ext: string, filename: string): Promise<string> {
  const privateDir = objSvc.getPrivateObjectDir();
  const parts = (privateDir.startsWith("/") ? privateDir : `/${privateDir}`).split("/").filter(Boolean);
  const bucketName = parts[0]!;
  const prefix = parts.slice(1).join("/");
  const objectId = randomUUID();
  const objectName = prefix ? `${prefix}/documents/${objectId}${ext}` : `documents/${objectId}${ext}`;
  await objectStorageClient.bucket(bucketName).file(objectName).save(buffer, {
    contentType: mimeType,
    metadata: { contentDisposition: `attachment; filename="${encodeURIComponent(filename)}"` },
  });
  return `/objects/documents/${objectId}${ext}`;
}

// ── File generators ───────────────────────────────────────────────────────────
const DOMAIN_COLORS: Record<string, [number, number, number]> = {
  AC: [30, 64, 175], IA: [124, 58, 237], AU: [194, 65, 12], CM: [21, 128, 61],
  RA: [185, 28, 28], IR: [153, 27, 27], SC: [15, 118, 110], SI: [67, 56, 202],
  MP: [55, 65, 81],  AT: [6, 95, 70],   PE: [146, 64, 14],  PS: [51, 65, 85],
  CA: [88, 28, 135], MA: [30, 58, 138],
};
const BODY_COLOR: [number, number, number] = [241, 245, 249];

function makePng(width: number, height: number, header: [number,number,number], body: [number,number,number]): Buffer {
  const crcTable = new Uint32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1); crcTable[n] = c; }
  function crc32(d: Buffer): number { let c = 0xFFFFFFFF; for (let i = 0; i < d.length; i++) c = (crcTable[(c ^ d[i]!) & 0xFF]!) ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; }
  function u32(n: number): Buffer { const b = Buffer.alloc(4); b.writeUInt32BE(n, 0); return b; }
  function chunk(type: string, data: Buffer): Buffer { const t = Buffer.from(type, "ascii"); return Buffer.concat([u32(data.length), t, data, u32(crc32(Buffer.concat([t, data])))]); }
  const sig = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
  const ihdr = chunk("IHDR", Buffer.concat([u32(width), u32(height), Buffer.from([8, 2, 0, 0, 0])]));
  const hdr = Math.floor(height * 0.09); const nav = Math.floor(height * 0.06);
  const navC: [number,number,number] = [Math.min(255, header[0]+25), Math.min(255, header[1]+25), Math.min(255, header[2]+30)];
  const rs = 1 + width * 3; const raw = Buffer.alloc(height * rs);
  for (let y = 0; y < height; y++) {
    raw[y * rs] = 0;
    const [r, g, b] = y < hdr ? header : y < hdr + nav ? navC : body;
    for (let x = 0; x < width; x++) { raw[y*rs+1+x*3] = r; raw[y*rs+2+x*3] = g; raw[y*rs+3+x*3] = b; }
  }
  return Buffer.concat([sig, ihdr, chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}
function screenshotPng(domain: string): Buffer { return makePng(1200, 800, DOMAIN_COLORS[domain] ?? [30,64,175], BODY_COLOR); }

async function makePdf(cfg: { title: string; subtitle?: string; orgName: string; date: string; sections: Array<{heading:string;content:string}> }): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 60, size: "letter" });
    const bufs: Buffer[] = [];
    doc.on("data", (c: Buffer) => bufs.push(c));
    doc.on("end", () => resolve(Buffer.concat(bufs)));
    doc.on("error", reject);
    doc.rect(0, 0, doc.page.width, 88).fill("#1e3a5f");
    doc.fillColor("white").font("Helvetica-Bold").fontSize(18).text(cfg.orgName, 60, 14, { lineBreak: false });
    doc.font("Helvetica-Bold").fontSize(13).text(cfg.title, 60, 40, { width: doc.page.width - 120, lineBreak: true });
    if (cfg.subtitle) doc.font("Helvetica").fontSize(9).fillColor("#a8c4e0").text(cfg.subtitle, 60, 68, { lineBreak: false });
    doc.fillColor("#1a1a1a").y = 108;
    for (const s of cfg.sections) {
      if (doc.y > doc.page.height - 150) doc.addPage();
      doc.font("Helvetica-Bold").fontSize(11).fillColor("#1e3a5f").text(s.heading);
      doc.moveDown(0.2);
      doc.font("Helvetica").fontSize(10).fillColor("#2d2d2d").text(s.content, { lineGap: 3 });
      doc.moveDown(0.7);
    }
    const range = doc.bufferedPageRange();
    for (let i = range.start; i < range.start + range.count; i++) {
      doc.switchToPage(i);
      doc.fontSize(7).fillColor("#9ca3af").text(`${cfg.orgName}  ·  ${cfg.title}  ·  ${cfg.date}  ·  CONTROLLED`, 60, doc.page.height - 28, { align: "center", width: doc.page.width - 120 });
    }
    doc.end();
  });
}

function makeXlsx(sheets: Array<{name:string;headers:string[];rows:(string|number)[][]}>): Buffer {
  const wb = XLSX.utils.book_new();
  for (const sh of sheets) { const ws = XLSX.utils.aoa_to_sheet([sh.headers, ...sh.rows]); XLSX.utils.book_append_sheet(wb, ws, sh.name.slice(0, 31)); }
  return Buffer.from(XLSX.write(wb, { type: "buffer", bookType: "xlsx" }));
}

function ex(s: string): string { return s.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&apos;"); }
function makeDocx(cfg: { title:string; orgName:string; version:string; date:string; sections:Array<{heading:string;content:string}> }): Buffer {
  const paras = cfg.sections.map(s =>
    `<w:p><w:pPr><w:pStyle w:val="Heading2"/></w:pPr><w:r><w:t>${ex(s.heading)}</w:t></w:r></w:p>` +
    s.content.split("\n").map(l => `<w:p><w:r><w:t xml:space="preserve">${ex(l.trim())}</w:t></w:r></w:p>`).join("")
  ).join("");
  const docXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:pPr><w:pStyle w:val="Title"/></w:pPr><w:r><w:t>${ex(cfg.title)}</w:t></w:r></w:p><w:p><w:r><w:rPr><w:b/><w:color w:val="374151"/></w:rPr><w:t>${ex(cfg.orgName)} · v${ex(cfg.version)} · ${ex(cfg.date)}</w:t></w:r></w:p><w:p><w:r><w:t> </w:t></w:r></w:p>${paras}<w:sectPr><w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440"/></w:sectPr></w:body></w:document>`;
  const styles = `<?xml version="1.0" encoding="UTF-8"?><w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:rPr><w:sz w:val="22"/></w:rPr></w:style><w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/><w:rPr><w:b/><w:sz w:val="52"/><w:color w:val="1e3a5f"/></w:rPr></w:style><w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="heading 2"/><w:pPr><w:spacing w:before="280" w:after="100"/></w:pPr><w:rPr><w:b/><w:sz w:val="26"/><w:color w:val="1e3a5f"/></w:rPr></w:style></w:styles>`;
  const zip = new AdmZip();
  zip.addFile("[Content_Types].xml", Buffer.from(`<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/></Types>`));
  zip.addFile("_rels/.rels", Buffer.from(`<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`));
  zip.addFile("word/document.xml", Buffer.from(docXml));
  zip.addFile("word/styles.xml", Buffer.from(styles));
  zip.addFile("word/_rels/document.xml.rels", Buffer.from(`<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`));
  return zip.toBuffer();
}

function makeCsv(headers: string[], rows: (string|number)[][]): Buffer {
  return Buffer.from([headers, ...rows].map(r => r.map(c => `"${String(c).replace(/"/g,'""')}"`).join(",")).join("\n"), "utf-8");
}

// ── Evidence specs (77 items) ────────────────────────────────────────────────
type EvType = "access_review"|"scan_report"|"risk_record"|"backup_verification"|"incident_record"|"log"|"screenshot"|"policy"|"procedure"|"configuration_export"|"approval_record"|"training_record"|"report"|"other"|"asset_inventory";
type EvStatus = "approved"|"pending_review";
interface EvidenceSpec {
  title: string; fileName: string; ext: ".pdf"|".xlsx"|".png"|".docx"|".csv";
  mime: string; evType: EvType; status: EvStatus; ctrls: string[];
  domain: string; daysAgo: number; desc: string; summary: string; tags: string[];
}

const EVIDENCE_SPECS: EvidenceSpec[] = [
  // AC
  { title:"User Access Review — Q2 2026", fileName:"AC-3.1.1_User_Access_Review_2026-Q2.xlsx", ext:".xlsx", mime:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", evType:"access_review", status:"approved", domain:"AC", daysAgo:7, ctrls:["AC.L2-3.1.1","AC.L2-3.1.2"], desc:"Quarterly user access review for all CUI-scope accounts covering role assignments and least-privilege validation.", summary:"112 accounts reviewed. 3 deprovisioned. 7 excess group memberships removed. Review signed by IT Administrator.", tags:["access-review","q2-2026"] },
  { title:"Active User List — 2026-07-01", fileName:"AC-3.1.1_Active_User_List_2026-07-01.csv", ext:".csv", mime:"text/csv", evType:"access_review", status:"approved", domain:"AC", daysAgo:7, ctrls:["AC.L2-3.1.1"], desc:"Export of all active Entra ID user accounts as of 2026-07-01 for access review baseline.", summary:"137 active accounts exported. All accounts have confirmed business justification.", tags:["active-users","export"] },
  { title:"Privileged Role Assignments — 2026-07-01", fileName:"AC-3.1.1_Privileged_Role_Assignments_2026-07-01.png", ext:".png", mime:"image/png", evType:"screenshot", status:"approved", domain:"AC", daysAgo:7, ctrls:["AC.L2-3.1.1","AC.L2-3.1.5"], desc:"Screenshot of Entra ID privileged role assignment report showing all Global Administrator and privileged role members.", summary:"22 privileged accounts inventoried. All verified against approved role matrix. 3 PIM-eligible roles active.", tags:["privileged-roles","screenshot"] },
  { title:"Group Membership Review — Q2 2026", fileName:"AC-3.1.2_Group_Membership_Review_2026-Q2.xlsx", ext:".xlsx", mime:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", evType:"access_review", status:"approved", domain:"AC", daysAgo:14, ctrls:["AC.L2-3.1.2","AC.L2-3.1.5"], desc:"Review of all security group memberships for least-privilege compliance across CUI-handling groups.", summary:"32 groups reviewed. 7 excess memberships removed. All CUI groups verified.", tags:["group-membership","access-review"] },
  { title:"CUI Information Flow Policy Screenshot", fileName:"AC-3.1.3_CUI_Information_Flow_Diagram.png", ext:".png", mime:"image/png", evType:"screenshot", status:"approved", domain:"AC", daysAgo:30, ctrls:["AC.L2-3.1.3"], desc:"Screenshot of DLP and information flow control policy configuration in Microsoft Purview.", summary:"CUI flow controls active. 3 DLP policies enforced. No unauthorized CUI flows detected in Q2.", tags:["information-flow","dlp","screenshot"] },
  { title:"Least Privilege Audit — Q2 2026", fileName:"AC-3.1.5_Least_Privilege_Audit_2026-Q2.xlsx", ext:".xlsx", mime:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", evType:"access_review", status:"approved", domain:"AC", daysAgo:14, ctrls:["AC.L2-3.1.5","AC.L2-3.1.6"], desc:"Quarterly least-privilege audit comparing user access rights to minimum required for job function.", summary:"All accounts verified against role matrix. 5 accounts found with excess admin rights. All corrected.", tags:["least-privilege","audit"] },
  { title:"Conditional Access Policy — All Users", fileName:"AC-3.1.1_Entra_CA_Policy_All_Users.png", ext:".png", mime:"image/png", evType:"screenshot", status:"approved", domain:"AC", daysAgo:3, ctrls:["AC.L2-3.1.1","AC.L2-3.1.20"], desc:"Screenshot of Entra ID Conditional Access policy requiring MFA for all users accessing CUI applications.", summary:"CA policy active in enforcement mode. All CUI app access requires MFA. Legacy auth blocked.", tags:["conditional-access","mfa","screenshot"] },
  { title:"Privileged Functions Review", fileName:"AC-3.1.7_Privileged_Functions_Review.pdf", ext:".pdf", mime:"application/pdf", evType:"access_review", status:"approved", domain:"AC", daysAgo:21, ctrls:["AC.L2-3.1.7"], desc:"Quarterly review of privileged function access logs and justification for privileged operations performed in Q2 2026.", summary:"148 privileged operations reviewed. All authorized. 3 emergency access events documented with post-incident review.", tags:["privileged-functions","quarterly"] },
  { title:"External Connection Approval — 2026-Q2", fileName:"AC-3.1.20_External_Connection_Approval.pdf", ext:".pdf", mime:"application/pdf", evType:"approval_record", status:"approved", domain:"AC", daysAgo:45, ctrls:["AC.L2-3.1.20","AC.L2-3.1.21"], desc:"Documented approvals for external system connections to APEX Solutions CUI environment in Q2 2026.", summary:"4 external connections approved. All have documented business justification and IT Director sign-off.", tags:["external-connections","approval"] },
  { title:"Service Account Inventory", fileName:"AC-3.1.2_Service_Account_Inventory.csv", ext:".csv", mime:"text/csv", evType:"access_review", status:"approved", domain:"AC", daysAgo:14, ctrls:["AC.L2-3.1.2","AC.L2-3.1.7"], desc:"Complete inventory of all Entra ID service accounts and managed identities with ownership and last-activity data.", summary:"22 service accounts inventoried. 8 flagged for review. 3 scheduled for deprovisioning per POAM-APEX-002.", tags:["service-accounts","inventory"] },
  { title:"Guest Access Review — 2026-07-01", fileName:"AC-3.1.1_Entra_Guest_Access_Review.xlsx", ext:".xlsx", mime:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", evType:"access_review", status:"approved", domain:"AC", daysAgo:7, ctrls:["AC.L2-3.1.1","AC.L2-3.1.3"], desc:"Review of all Entra ID B2B guest accounts verifying continued business need and appropriate access scope.", summary:"12 guest accounts reviewed. 2 removed. 10 access scopes verified as minimum necessary.", tags:["guest-access","b2b"] },
  { title:"DLP Policy Configuration Screenshot", fileName:"AC-3.1.3_DLP_Policy_Configuration.png", ext:".png", mime:"image/png", evType:"screenshot", status:"approved", domain:"AC", daysAgo:21, ctrls:["AC.L2-3.1.3","AC.L2-3.1.4"], desc:"Screenshot of Microsoft Purview DLP policy configuration protecting CUI data flows.", summary:"3 DLP policies active. CUI labeling enforced. 12 policy matches investigated in Q2.", tags:["dlp","purview","screenshot"] },
  { title:"Admin Role Review — Q2 2026", fileName:"AC-3.1.5_Admin_Role_Review_2026-Q2.xlsx", ext:".xlsx", mime:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", evType:"access_review", status:"approved", domain:"AC", daysAgo:7, ctrls:["AC.L2-3.1.5","AC.L2-3.1.2"], desc:"Formal review of all administrative role assignments confirming least-privilege for privileged accounts.", summary:"22 admin accounts reviewed. No unauthorized admin role grants detected. PIM configuration verified.", tags:["admin-roles","review"] },
  { title:"Remote Access Acknowledgment Log", fileName:"AC-3.1.20_Remote_Access_Acknowledgment_2026.xlsx", ext:".xlsx", mime:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", evType:"approval_record", status:"approved", domain:"AC", daysAgo:90, ctrls:["AC.L2-3.1.20"], desc:"Log of annual remote access policy acknowledgments signed by all users with VPN/remote access rights.", summary:"All 87 remote-access-enabled users have current acknowledgment on file.", tags:["remote-access","acknowledgment"] },
  // IA
  { title:"MFA Registration Report — 2026-07-01", fileName:"IA-3.5.3_MFA_Registration_Report_2026-07-01.xlsx", ext:".xlsx", mime:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", evType:"configuration_export", status:"approved", domain:"IA", daysAgo:7, ctrls:["IA.L2-3.5.3"], desc:"Entra ID MFA registration report showing per-user MFA enrollment status and authentication methods.", summary:"128/137 users MFA-registered (93.4%). 9 non-enrolled tracked in POAM-APEX-001. Microsoft Authenticator primary method.", tags:["mfa-registration","entra-id"] },
  { title:"Conditional Access MFA Policy Screenshot", fileName:"IA-3.5.3_Conditional_Access_MFA_Policy.png", ext:".png", mime:"image/png", evType:"screenshot", status:"approved", domain:"IA", daysAgo:7, ctrls:["IA.L2-3.5.3","AC.L2-3.1.1"], desc:"Screenshot of Entra ID Conditional Access policy enforcing MFA for all CUI application access.", summary:"Policy in enforcement mode. MFA required for all cloud app access. Sign-in risk policy also active.", tags:["conditional-access","mfa","screenshot"] },
  { title:"Legacy Authentication Block Policy", fileName:"IA-3.5.4_Legacy_Authentication_Block_Policy.png", ext:".png", mime:"image/png", evType:"screenshot", status:"approved", domain:"IA", daysAgo:14, ctrls:["IA.L2-3.5.3","IA.L2-3.5.4"], desc:"Screenshot of Conditional Access policy blocking all legacy authentication protocols (SMTP AUTH, IMAP, POP3, MAPI).", summary:"Legacy auth block policy active. 2 legacy clients identified and scheduled for migration in Q3.", tags:["legacy-auth","block-policy","screenshot"] },
  { title:"Password Policy Settings Screenshot", fileName:"IA-3.5.7_Password_Policy_Settings.png", ext:".png", mime:"image/png", evType:"screenshot", status:"approved", domain:"IA", daysAgo:30, ctrls:["IA.L2-3.5.7","IA.L2-3.5.1"], desc:"Screenshot of Entra ID password protection and complexity policy settings.", summary:"14-character minimum, mixed case, numbers, symbols enforced. Smart lockout: 10 attempts. Banned password list active.", tags:["password-policy","complexity","screenshot"] },
  { title:"Password Complexity Policy Documentation", fileName:"IA-3.5.1_Password_Complexity_Rules.pdf", ext:".pdf", mime:"application/pdf", evType:"configuration_export", status:"approved", domain:"IA", daysAgo:60, ctrls:["IA.L2-3.5.1","IA.L2-3.5.2"], desc:"Documentation of APEX Solutions password complexity requirements and enforcement mechanism via Entra ID.", summary:"Policy requires 14-char minimum, complexity rules, 90-day expiry, 24-password history. Enforced via tenant policy.", tags:["password-complexity","policy-doc"] },
  { title:"Password Change Log — Q2 2026", fileName:"IA-3.5.2_Password_Change_Log_2026-Q2.xlsx", ext:".xlsx", mime:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", evType:"log", status:"approved", domain:"IA", daysAgo:7, ctrls:["IA.L2-3.5.2","IA.L2-3.5.1"], desc:"Entra ID sign-in log export filtered for password change events in Q2 2026.", summary:"137 password change events logged. 12 admin-initiated resets, 125 self-service. No anomalies detected.", tags:["password-changes","log"] },
  { title:"MFA Conditional Access Scan Report", fileName:"IA-3.5.3_CA_Policy_MFA_Report.pdf", ext:".pdf", mime:"application/pdf", evType:"scan_report", status:"approved", domain:"IA", daysAgo:7, ctrls:["IA.L2-3.5.3"], desc:"Report of Conditional Access policy effectiveness from Microsoft Entra reporting.", summary:"99.2% of sign-ins challenged by MFA. 0.8% failures investigated. No MFA fatigue attacks detected.", tags:["ca-policy","mfa-report"] },
  { title:"LAPS Configuration Report", fileName:"IA-3.5.10_LAPS_Configuration_Report.xlsx", ext:".xlsx", mime:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", evType:"configuration_export", status:"approved", domain:"IA", daysAgo:14, ctrls:["IA.L2-3.5.10","AC.L2-3.1.2"], desc:"Intune report confirming LAPS (Local Administrator Password Solution) configuration across managed devices.", summary:"LAPS configured on all 112 managed devices. Password rotation: 30 days. Passwords stored in Entra ID.", tags:["laps","local-admin"] },
  { title:"Token-Based Auth Settings Screenshot", fileName:"IA-3.5.11_Token_Based_Auth_Settings.png", ext:".png", mime:"image/png", evType:"screenshot", status:"approved", domain:"IA", daysAgo:30, ctrls:["IA.L2-3.5.11","IA.L2-3.5.3"], desc:"Screenshot of Entra ID token lifetime policies and continuous access evaluation settings.", summary:"Token lifetime policy: 1-hour access tokens, 90-day refresh with activity. CAE enabled for all apps.", tags:["token-lifetime","cae","screenshot"] },
  { title:"MFA Bypass Exception Log", fileName:"IA-3.5.3_MFA_Bypass_Exception_Log.xlsx", ext:".xlsx", mime:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", evType:"log", status:"approved", domain:"IA", daysAgo:14, ctrls:["IA.L2-3.5.3"], desc:"Log of temporary MFA bypass exceptions authorized by IT Director with business justification.", summary:"2 exceptions granted Q2. Both have since expired. No standing exceptions active.", tags:["mfa-bypass","exceptions"] },
  { title:"Identifier Management Policy Screenshot", fileName:"IA-3.5.1_Identifier_Management_Policy.png", ext:".png", mime:"image/png", evType:"screenshot", status:"approved", domain:"IA", daysAgo:45, ctrls:["IA.L2-3.5.1"], desc:"Screenshot of Entra ID user principal name standards and account identifier management configuration.", summary:"All accounts use standardized UPN format. Shared accounts documented with justification.", tags:["identifier-management","upn","screenshot"] },
  // AU
  { title:"Audit Log Configuration Screenshot", fileName:"AU-3.3.1_Audit_Log_Configuration.png", ext:".png", mime:"image/png", evType:"screenshot", status:"approved", domain:"AU", daysAgo:14, ctrls:["AU.L2-3.3.1","AU.L2-3.3.2"], desc:"Screenshot of Microsoft Sentinel and Azure Monitor audit log collection settings.", summary:"All required log categories enabled. Ingestion rate nominal. No gaps in collection.", tags:["audit-config","sentinel","screenshot"] },
  { title:"Audit Log Review — 2026-07-01", fileName:"AU-3.3.5_Audit_Log_Review_2026-07-01.pdf", ext:".pdf", mime:"application/pdf", evType:"log", status:"approved", domain:"AU", daysAgo:7, ctrls:["AU.L2-3.3.5","AU.L2-3.3.6"], desc:"Weekly audit log review report documenting findings, anomalies investigated, and disposition.", summary:"3 anomalies investigated. 1 false positive, 2 minor policy violations noted and addressed.", tags:["audit-review","weekly"] },
  { title:"Audit Log Retention Settings Screenshot", fileName:"AU-3.3.6_Audit_Log_Retention_Settings.png", ext:".png", mime:"image/png", evType:"screenshot", status:"approved", domain:"AU", daysAgo:30, ctrls:["AU.L2-3.3.6","AU.L2-3.3.2"], desc:"Screenshot of Log Analytics Workspace data retention settings configured for 365-day retention.", summary:"365-day retention configured for all workspaces. Interactive retention 90 days, archive 365.", tags:["log-retention","log-analytics","screenshot"] },
  { title:"Privileged Activity Log Review — Q2 2026", fileName:"AU-3.3.8_Privileged_Activity_Log_Review.xlsx", ext:".xlsx", mime:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", evType:"log", status:"approved", domain:"AU", daysAgo:7, ctrls:["AU.L2-3.3.8","AU.L2-3.3.1"], desc:"Quarterly review of privileged user activities including role activations, admin actions, and configuration changes.", summary:"148 privileged operations reviewed. All align to approved change requests. No anomalies.", tags:["privileged-activity","audit-log"] },
  { title:"Audit Event Types Configuration", fileName:"AU-3.3.2_Event_Types_Audit_Policy.png", ext:".png", mime:"image/png", evType:"screenshot", status:"approved", domain:"AU", daysAgo:45, ctrls:["AU.L2-3.3.2"], desc:"Screenshot of audit policy configuration showing all required CMMC event types enabled.", summary:"All 9 CMMC-required event categories enabled including sign-in, role changes, and config modifications.", tags:["audit-policy","event-types","screenshot"] },
  { title:"SIEM Alert Dashboard Screenshot", fileName:"AU-3.3.1_SIEM_Alert_Dashboard.png", ext:".png", mime:"image/png", evType:"screenshot", status:"approved", domain:"AU", daysAgo:3, ctrls:["AU.L2-3.3.1","IR.L2-3.6.1"], desc:"Screenshot of Microsoft Sentinel alert dashboard showing open incidents and detection rules.", summary:"14 analytics rules active. 2 open incidents. Both under investigation per IR procedure.", tags:["siem","sentinel","alerts","screenshot"] },
  { title:"Audit Failure Alert Configuration", fileName:"AU-3.3.4_Audit_Failure_Alert_Config.png", ext:".png", mime:"image/png", evType:"screenshot", status:"approved", domain:"AU", daysAgo:60, ctrls:["AU.L2-3.3.4","AU.L2-3.3.1"], desc:"Screenshot confirming alert rules configured to notify the security team on audit log collection failures.", summary:"Alert rule active. Notification to security@apex-solutions.com confirmed via test on 2026-04-15.", tags:["audit-failures","alerts","screenshot"] },
  { title:"Audit Log Protection Policy", fileName:"AU-3.3.3_Audit_Log_Protection_Policy.pdf", ext:".pdf", mime:"application/pdf", evType:"policy", status:"approved", domain:"AU", daysAgo:90, ctrls:["AU.L2-3.3.3","AU.L2-3.3.2"], desc:"Policy documenting controls protecting audit logs from unauthorized modification and deletion.", summary:"Immutable log export to Azure Storage configured. RBAC limits log modification to Security Admin role.", tags:["log-protection","immutable"] },
  // CM
  { title:"Intune Security Baseline Screenshot", fileName:"CM-3.4.1_Intune_Security_Baseline.png", ext:".png", mime:"image/png", evType:"screenshot", status:"approved", domain:"CM", daysAgo:7, ctrls:["CM.L2-3.4.1","CM.L2-3.4.2"], desc:"Screenshot of Windows security baseline policy deployed via Microsoft Intune to all managed Windows devices.", summary:"Security baseline assigned to all 112 managed devices. Compliance: 94%. 7 devices non-compliant, tracked in POAM-APEX-003.", tags:["intune","security-baseline","screenshot"] },
  { title:"Device Compliance Policy Screenshot", fileName:"CM-3.4.2_Device_Compliance_Policy.png", ext:".png", mime:"image/png", evType:"screenshot", status:"approved", domain:"CM", daysAgo:7, ctrls:["CM.L2-3.4.2","CM.L2-3.4.1"], desc:"Screenshot of Intune device compliance policy settings including required OS version and BitLocker enforcement.", summary:"Compliance policy active. Non-compliant devices blocked from corporate resources via Conditional Access.", tags:["device-compliance","intune","screenshot"] },
  { title:"Device Inventory — 2026-07-01", fileName:"CM-3.4.3_Device_Inventory_2026-07-01.xlsx", ext:".xlsx", mime:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", evType:"asset_inventory", status:"approved", domain:"CM", daysAgo:7, ctrls:["CM.L2-3.4.3","CM.L2-3.4.1"], desc:"Complete device inventory exported from Intune including device name, OS version, compliance status, and owner.", summary:"112 managed devices inventoried. OS versions current on 96%. 4 devices flagged for OS upgrade.", tags:["device-inventory","intune","asset-management"] },
  { title:"Baseline Change Approval — 2026-Q2", fileName:"CM-3.4.7_Baseline_Change_Approval.pdf", ext:".pdf", mime:"application/pdf", evType:"approval_record", status:"approved", domain:"CM", daysAgo:21, ctrls:["CM.L2-3.4.7","CM.L2-3.4.1"], desc:"Change management approval record for Q2 updates to the Windows security baseline configuration.", summary:"3 baseline changes approved by IT Director and Compliance Manager. Changes aligned to CIS v8 L1.", tags:["change-management","baseline"] },
  { title:"GPO Baseline Configuration Report", fileName:"CM-3.4.1_GPO_Baseline_Configuration.pdf", ext:".pdf", mime:"application/pdf", evType:"configuration_export", status:"approved", domain:"CM", daysAgo:45, ctrls:["CM.L2-3.4.1","CM.L2-3.4.6"], desc:"Group Policy Object export confirming security baseline settings for domain-joined workstations.", summary:"GPO baseline aligns to CIS Windows 10 L1. 128/132 settings in compliance.", tags:["gpo","baseline","cis"] },
  { title:"Software Allowlist Policy Screenshot", fileName:"CM-3.4.6_Software_Allowlist_Policy.png", ext:".png", mime:"image/png", evType:"screenshot", status:"approved", domain:"CM", daysAgo:30, ctrls:["CM.L2-3.4.6"], desc:"Screenshot of application control policy (AppLocker/WDAC) restricting execution to approved software.", summary:"AppLocker rules active in enforcement mode. 3 unapproved application attempts blocked in Q2.", tags:["allowlist","applocker","screenshot"] },
  { title:"Change Management Log — Q2 2026", fileName:"CM-3.4.4_Change_Management_Log_2026-Q2.xlsx", ext:".xlsx", mime:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", evType:"log", status:"approved", domain:"CM", daysAgo:7, ctrls:["CM.L2-3.4.4","CM.L2-3.4.7"], desc:"Quarterly change management log listing all approved system configuration changes.", summary:"17 changes logged. All have documented approvals. 1 emergency change with post-approval.", tags:["change-management","configuration"] },
  { title:"Patch Management Report — 2026-07", fileName:"CM-3.4.9_Patch_Management_Report_2026-07.xlsx", ext:".xlsx", mime:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", evType:"scan_report", status:"approved", domain:"CM", daysAgo:7, ctrls:["CM.L2-3.4.9","SI.L2-3.14.1"], desc:"Monthly patch management report showing patch compliance status across all managed endpoints.", summary:"97% patch compliance. 4 endpoints with outstanding patches tracked in POAM remediation.", tags:["patch-management","compliance"] },
  // RA
  { title:"Risk Assessment Report — FY2026", fileName:"RA-3.11.1_Risk_Assessment_Report.pdf", ext:".pdf", mime:"application/pdf", evType:"risk_record", status:"approved", domain:"RA", daysAgo:90, ctrls:["RA.L2-3.11.1","CA.L2-3.12.1"], desc:"Annual organizational risk assessment following NIST SP 800-30 methodology, covering all in-scope CUI systems.", summary:"3 critical risks, 8 high risks identified. All have POA&M items. Next assessment scheduled FY2027.", tags:["risk-assessment","annual","nist"] },
  { title:"Vulnerability Scan Report — 2026-07-01", fileName:"RA-3.11.2_Vulnerability_Scan_Report_2026-07-01.pdf", ext:".pdf", mime:"application/pdf", evType:"scan_report", status:"approved", domain:"RA", daysAgo:7, ctrls:["RA.L2-3.11.2","SI.L2-3.14.1"], desc:"Weekly vulnerability scan results from Tenable.io covering all CUI-scope endpoints and servers.", summary:"5 high CVEs, 12 medium. Critical: 0. All high CVEs have remediation assignments within SLA.", tags:["vulnerability-scan","tenable","weekly"] },
  { title:"Remediation Tracker — 2026-Q2", fileName:"RA-3.11.3_Remediation_Tracker.xlsx", ext:".xlsx", mime:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", evType:"risk_record", status:"approved", domain:"RA", daysAgo:7, ctrls:["RA.L2-3.11.3","RA.L2-3.11.2"], desc:"Active vulnerability remediation tracker showing CVE ID, severity, assigned owner, and target date.", summary:"23 items tracked. 15 closed in Q2. 8 open: 5 within SLA, 3 in POAM-APEX-005.", tags:["remediation","vulnerability","tracker"] },
  { title:"Risk Register — 2026", fileName:"RA-3.11.1_Risk_Register_2026.xlsx", ext:".xlsx", mime:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", evType:"risk_record", status:"approved", domain:"RA", daysAgo:45, ctrls:["RA.L2-3.11.1","RA.L2-3.11.3"], desc:"Organizational risk register listing all identified risks with likelihood, impact, and treatment decisions.", summary:"14 risks documented. 3 accepted, 8 mitigated, 3 in remediation. Reviewed monthly by Compliance Manager.", tags:["risk-register","annual"] },
  { title:"Tenable Scan Export — 2026-07-01", fileName:"RA-3.11.2_Tenable_Scan_Export.csv", ext:".csv", mime:"text/csv", evType:"scan_report", status:"approved", domain:"RA", daysAgo:7, ctrls:["RA.L2-3.11.2"], desc:"Raw CSV export from Tenable.io vulnerability scan for ingestion into remediation tracker.", summary:"Raw scan data. 312 findings across all asset classes. 5 high severity requiring immediate attention.", tags:["tenable","vulnerability","export"] },
  { title:"Remediation Status Dashboard Screenshot", fileName:"RA-3.11.3_Remediation_Status_Dashboard.png", ext:".png", mime:"image/png", evType:"screenshot", status:"approved", domain:"RA", daysAgo:3, ctrls:["RA.L2-3.11.3"], desc:"Screenshot of vulnerability remediation dashboard showing open findings by severity and age.", summary:"Dashboard current. 5 high CVEs visible. All within remediation SLA.", tags:["dashboard","remediation","screenshot"] },
  // IR
  { title:"Incident Response Plan v2.1", fileName:"IR-3.6.1_Incident_Response_Plan.pdf", ext:".pdf", mime:"application/pdf", evType:"procedure", status:"approved", domain:"IR", daysAgo:60, ctrls:["IR.L2-3.6.1","IR.L2-3.6.2"], desc:"Organizational incident response plan aligned to NIST SP 800-61 Rev 2 covering detection, containment, eradication, and recovery.", summary:"Plan version 2.1 approved by IT Director and CISO on 2026-05-01. Reviewed annually.", tags:["ir-plan","nist","approved"] },
  { title:"Tabletop Exercise After-Action Report — 2026-Q1", fileName:"IR-3.6.3_Tabletop_Exercise_After_Action_Report.pdf", ext:".pdf", mime:"application/pdf", evType:"incident_record", status:"approved", domain:"IR", daysAgo:90, ctrls:["IR.L2-3.6.3","IR.L2-3.6.1"], desc:"After-action report from Q1 2026 IR tabletop exercise simulating a ransomware attack scenario.", summary:"Exercise completed 2026-03-15. 4 gaps identified. All captured in POA&M. Next exercise Q3 2026.", tags:["tabletop","after-action","q1-2026"] },
  { title:"Incident Reporting Log — 2026", fileName:"IR-3.6.2_Incident_Reporting_Log_2026.xlsx", ext:".xlsx", mime:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", evType:"incident_record", status:"approved", domain:"IR", daysAgo:7, ctrls:["IR.L2-3.6.2","IR.L2-3.6.1"], desc:"Log of all security incidents reported in 2026, including response actions and disposition.", summary:"8 incidents logged YTD. 7 closed. 1 under investigation (low severity). All reported per IR plan.", tags:["incident-log","2026"] },
  { title:"IR Contact List — 2026", fileName:"IR-3.6.1_IR_Contact_List.pdf", ext:".pdf", mime:"application/pdf", evType:"other", status:"approved", domain:"IR", daysAgo:60, ctrls:["IR.L2-3.6.1"], desc:"Current incident response team contact list including roles, primary and backup contacts, and escalation procedures.", summary:"IR roster current as of 2026-05-01. All contacts verified. US-CERT reporting contact updated.", tags:["ir-contacts","roster"] },
  { title:"Tabletop Exercise Participant Sign-In", fileName:"IR-3.6.3_Exercise_Participant_Sign_In.xlsx", ext:".xlsx", mime:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", evType:"training_record", status:"approved", domain:"IR", daysAgo:90, ctrls:["IR.L2-3.6.3"], desc:"Signed attendance sheet for Q1 2026 IR tabletop exercise.", summary:"14 participants. Includes IT Admin, Compliance Manager, Legal, and Executive Sponsor.", tags:["tabletop","sign-in","q1-2026"] },
  // SC
  { title:"Encryption Status Report — 2026-Q2", fileName:"SC-3.13.16_Encryption_Status_Report.xlsx", ext:".xlsx", mime:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", evType:"configuration_export", status:"approved", domain:"SC", daysAgo:14, ctrls:["SC.L2-3.13.16","SC.L2-3.13.8"], desc:"Report of encryption status for all endpoints and storage systems confirming AES-256 BitLocker and storage encryption.", summary:"91% endpoint encryption. 9 devices in POAM-APEX-003 remediation. All cloud storage encrypted.", tags:["encryption","bitlocker","aes256"] },
  { title:"BitLocker Compliance Report", fileName:"SC-3.13.8_BitLocker_Compliance_Report.xlsx", ext:".xlsx", mime:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", evType:"configuration_export", status:"pending_review", domain:"SC", daysAgo:7, ctrls:["SC.L2-3.13.8"], desc:"Intune BitLocker encryption compliance report showing encryption status per device.", summary:"In review. 103/112 devices encrypted. 9 non-compliant tracked in POAM.", tags:["bitlocker","intune","compliance"] },
  { title:"Firewall Ruleset Export — 2026-Q2", fileName:"SC-3.13.1_Firewall_Ruleset_Export.pdf", ext:".pdf", mime:"application/pdf", evType:"configuration_export", status:"approved", domain:"SC", daysAgo:45, ctrls:["SC.L2-3.13.1","SC.L2-3.13.2"], desc:"Export of production firewall rules with business justification for each allow rule.", summary:"144 rules reviewed. 8 legacy rules removed. All remaining rules have documented justification.", tags:["firewall","ruleset","network"] },
  { title:"Boundary Protection Configuration", fileName:"SC-3.13.5_Boundary_Protection_Configuration.png", ext:".png", mime:"image/png", evType:"screenshot", status:"approved", domain:"SC", daysAgo:30, ctrls:["SC.L2-3.13.5","SC.L2-3.13.1"], desc:"Screenshot of network boundary protection configuration including DMZ segmentation and WAF settings.", summary:"DMZ zone active. WAF in prevention mode. Ingress/egress traffic filtered per security policy.", tags:["boundary-protection","dmz","screenshot"] },
  { title:"Cryptographic Algorithm Policy", fileName:"SC-3.13.11_Cryptographic_Algorithm_Policy.pdf", ext:".pdf", mime:"application/pdf", evType:"policy", status:"approved", domain:"SC", daysAgo:60, ctrls:["SC.L2-3.13.11"], desc:"Policy specifying approved cryptographic algorithms including AES-256, SHA-256, and RSA-2048 minimum.", summary:"Policy approved 2026-01-15. Aligns to CNSS SP 15. TLS 1.2+ enforced for all communications.", tags:["cryptography","algorithms","policy"] },
  { title:"Network Segmentation Diagram", fileName:"SC-3.13.3_Network_Segmentation_Diagram.png", ext:".png", mime:"image/png", evType:"screenshot", status:"approved", domain:"SC", daysAgo:60, ctrls:["SC.L2-3.13.3","SC.L2-3.13.1"], desc:"Current network segmentation diagram showing CUI zone, corporate network, and guest WiFi separation.", summary:"CUI zone isolated via VLAN segmentation. No lateral movement paths between zones confirmed.", tags:["network-segmentation","vlan","diagram"] },
  // SI
  { title:"Defender Antivirus Status Dashboard", fileName:"SI-3.14.2_Defender_Antivirus_Status.png", ext:".png", mime:"image/png", evType:"screenshot", status:"approved", domain:"SI", daysAgo:3, ctrls:["SI.L2-3.14.2","SI.L2-3.14.1"], desc:"Screenshot of Microsoft Defender for Endpoint dashboard showing antivirus status and definition currency.", summary:"108/112 devices protected. Definitions current. 4 devices offline — pending reconnection.", tags:["defender","antivirus","screenshot"] },
  { title:"Defender Alert Review — 2026-07-01", fileName:"SI-3.14.3_Defender_Alert_Review.pdf", ext:".pdf", mime:"application/pdf", evType:"log", status:"approved", domain:"SI", daysAgo:7, ctrls:["SI.L2-3.14.3","AU.L2-3.3.1"], desc:"Weekly security alert review report from Microsoft Defender XDR, documenting findings and response actions.", summary:"14 alerts reviewed. 12 closed. 2 escalated to incident. All within 24-hour SLA.", tags:["defender","alerts","weekly-review"] },
  { title:"USB Device Control Settings", fileName:"SI-3.14.7_USB_Device_Control_Settings.png", ext:".png", mime:"image/png", evType:"screenshot", status:"approved", domain:"SI", daysAgo:30, ctrls:["SI.L2-3.14.7","MP.L2-3.8.7"], desc:"Screenshot of Intune device configuration restricting removable storage access on all managed endpoints.", summary:"USB storage blocked by default. Only IT-approved USB devices permitted via allowlist policy.", tags:["usb-control","removable-media","screenshot"] },
  { title:"Vulnerability Management Policy", fileName:"SI-3.14.1_Vulnerability_Management_Policy.pdf", ext:".pdf", mime:"application/pdf", evType:"policy", status:"approved", domain:"SI", daysAgo:90, ctrls:["SI.L2-3.14.1","RA.L2-3.11.2"], desc:"Policy defining vulnerability management procedures including scan frequency, severity SLAs, and escalation.", summary:"Policy version 2.0 approved. Critical: 7 days, High: 30 days, Medium: 90 days SLAs defined.", tags:["vulnerability-management","policy"] },
  { title:"Software Update Compliance Report", fileName:"SI-3.14.4_Software_Update_Compliance.xlsx", ext:".xlsx", mime:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", evType:"configuration_export", status:"approved", domain:"SI", daysAgo:7, ctrls:["SI.L2-3.14.4","CM.L2-3.4.9"], desc:"Monthly software update compliance report from Intune and Windows Update for Business.", summary:"96% update compliance. 5 endpoints pending reboot for pending updates.", tags:["software-updates","compliance","intune"] },
  { title:"Security Alerts Summary — Q2 2026", fileName:"SI-3.14.6_Security_Alerts_Summary.xlsx", ext:".xlsx", mime:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", evType:"log", status:"approved", domain:"SI", daysAgo:7, ctrls:["SI.L2-3.14.6","AU.L2-3.3.1"], desc:"Quarterly summary of all security alerts, incidents, and response actions for executive reporting.", summary:"Q2: 47 alerts, 8 incidents. 7 incidents closed, 1 low-severity open. No data breaches.", tags:["alerts-summary","quarterly","executive"] },
  // MP
  { title:"Backup Restore Test Report — Q2 2026", fileName:"MP-3.8.9_Backup_Restore_Test_Report.pdf", ext:".pdf", mime:"application/pdf", evType:"backup_verification", status:"approved", domain:"MP", daysAgo:45, ctrls:["MP.L2-3.8.9","CM.L2-3.4.1"], desc:"Documented backup restoration test verifying integrity and recovery time objectives for critical systems.", summary:"Recovery test successful. RTO: 4.2 hours (target 8 hours). RPO: 45 minutes (target 4 hours).", tags:["backup","restore-test","dr"] },
  { title:"Removable Media Policy", fileName:"MP-3.8.1_Removable_Media_Policy.pdf", ext:".pdf", mime:"application/pdf", evType:"policy", status:"approved", domain:"MP", daysAgo:90, ctrls:["MP.L2-3.8.1","MP.L2-3.8.7"], desc:"Policy governing the use, handling, and disposal of removable media containing CUI.", summary:"Policy approved. Encryption required for all approved removable media. USB restricted by default.", tags:["removable-media","policy","encryption"] },
  { title:"CUI Media Disposal Log — 2026-Q2", fileName:"MP-3.8.3_CUI_Media_Disposal_Log.xlsx", ext:".xlsx", mime:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", evType:"log", status:"approved", domain:"MP", daysAgo:14, ctrls:["MP.L2-3.8.3","MP.L2-3.8.4"], desc:"Log of media sanitization and disposal activities following NIST SP 800-88 guidelines.", summary:"4 hard drives sanitized (DoD 3-pass). 1 physical shred of optical media. Certificates on file.", tags:["media-disposal","sanitization","nist"] },
  { title:"Backup Completion Log — 2026-07", fileName:"MP-3.8.9_Backup_Completion_Log_2026-07.xlsx", ext:".xlsx", mime:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", evType:"backup_verification", status:"approved", domain:"MP", daysAgo:7, ctrls:["MP.L2-3.8.9"], desc:"Monthly backup job completion log confirming all scheduled backups completed successfully.", summary:"All 124 scheduled backup jobs completed. 2 partial completions retried successfully.", tags:["backup-log","completion"] },
  // AT
  { title:"Security Awareness Training Report — Q2 2026", fileName:"AT-3.2.1_Security_Awareness_Training_Report.xlsx", ext:".xlsx", mime:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", evType:"training_record", status:"approved", domain:"AT", daysAgo:14, ctrls:["AT.L2-3.2.1","AT.L2-3.2.2"], desc:"Quarterly security awareness training completion report showing completion rates by department.", summary:"93% completion (127/137 users). 10 non-compliant escalated to HR.", tags:["security-awareness","training","completion"] },
  { title:"Role-Based Training Record — IT & Compliance", fileName:"AT-3.2.2_Role_Based_Training_Record.pdf", ext:".pdf", mime:"application/pdf", evType:"training_record", status:"approved", domain:"AT", daysAgo:30, ctrls:["AT.L2-3.2.2"], desc:"Documentation of role-specific security training for IT Administrators, Compliance staff, and System Administrators.", summary:"All 8 IT staff and 3 Compliance staff completed CMMC-specific role-based training.", tags:["role-based-training","it","compliance"] },
  { title:"Training Completion Certificate — Sample", fileName:"AT-3.2.1_Training_Completion_Certificate_Sample.pdf", ext:".pdf", mime:"application/pdf", evType:"training_record", status:"approved", domain:"AT", daysAgo:30, ctrls:["AT.L2-3.2.1"], desc:"Sample security awareness training completion certificate showing organization-branded certificate format.", summary:"Certificate format approved. All certificates include employee name, date, training title, and expiry.", tags:["training-certificate"] },
  { title:"Annual Training Schedule — 2026", fileName:"AT-3.2.1_Annual_Training_Schedule.xlsx", ext:".xlsx", mime:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", evType:"training_record", status:"approved", domain:"AT", daysAgo:180, ctrls:["AT.L2-3.2.1","AT.L2-3.2.2"], desc:"Annual training schedule showing all scheduled training events, target audiences, and completion deadlines.", summary:"Schedule published January 2026. Q1 and Q2 training completed. Q3 training scheduled August.", tags:["training-schedule","annual"] },
  // PE
  { title:"Visitor Log — Q2 2026", fileName:"PE-3.10.1_Visitor_Log_2026-Q2.xlsx", ext:".xlsx", mime:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", evType:"log", status:"approved", domain:"PE", daysAgo:7, ctrls:["PE.L2-3.10.1","PE.L2-3.10.3"], desc:"Physical visitor access log for Q2 2026 including name, company, host, purpose, and access areas.", summary:"42 visitor entries. All escorted. No CUI areas accessed by uncleared visitors.", tags:["visitor-log","physical-access"] },
  { title:"Physical Access Review — Q2 2026", fileName:"PE-3.10.2_Physical_Access_Review_2026-Q2.pdf", ext:".pdf", mime:"application/pdf", evType:"access_review", status:"approved", domain:"PE", daysAgo:14, ctrls:["PE.L2-3.10.2","PE.L2-3.10.1"], desc:"Quarterly review of physical access permissions, badge assignments, and server room access logs.", summary:"Access list reviewed. 3 access rights revoked for terminated employees. Badge log gap remediated.", tags:["physical-access","review"] },
  { title:"Security Camera Coverage Map", fileName:"PE-3.10.3_Security_Camera_Coverage_Map.png", ext:".png", mime:"image/png", evType:"screenshot", status:"approved", domain:"PE", daysAgo:90, ctrls:["PE.L2-3.10.3"], desc:"Facility diagram showing CCTV camera placement and coverage areas for all security-relevant locations.", summary:"12 cameras covering all entrances, server room, and CUI handling areas. No coverage gaps.", tags:["cctv","physical-security","coverage"] },
  // PS
  { title:"User Termination Checklist — Q2 2026", fileName:"PS-3.9.2_User_Termination_Checklist_2026-Q2.pdf", ext:".pdf", mime:"application/pdf", evType:"procedure", status:"approved", domain:"PS", daysAgo:14, ctrls:["PS.L2-3.9.2","AC.L2-3.1.1"], desc:"Completed termination checklists for Q2 2026 employee separations confirming system access revocation.", summary:"4 terminations processed. All access revoked within 2 hours of separation. Checklists signed by IT and HR.", tags:["termination","offboarding","access-revocation"] },
  { title:"Background Check Summary — 2026", fileName:"PS-3.9.1_Background_Check_Summary_2026.xlsx", ext:".xlsx", mime:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", evType:"report", status:"approved", domain:"PS", daysAgo:90, ctrls:["PS.L2-3.9.1"], desc:"Annual summary of personnel background check completion status for all CUI-system users.", summary:"All 41 CUI-system users have current background checks on file. 3 renewals due in Q4.", tags:["background-checks","personnel-security"] },
];

// ── Document specs (21 items) ────────────────────────────────────────────────
type DocType = "policy"|"procedure"|"log"|"register"|"report"|"backup_verification"|"access_review"|"risk_record"|"other";
interface DocumentSpec {
  title: string; fileName: string; ext: ".docx"|".xlsx"|".pdf";
  mime: string; docType: DocType; status: "active"|"approved"|"pending_review"|"draft";
  ctrls: string[]; version: string; effectiveDaysAgo: number;
  sections: Array<{heading:string;content:string}>;
}

function policyBase(domain: string, title: string, reqs: string, roles: string): Array<{heading:string;content:string}> {
  return [
    { heading:"1. Purpose", content:`This policy establishes ${title.toLowerCase()} requirements for APEX Solutions LLC to protect Controlled Unclassified Information (CUI) and ensure CMMC Level 2 compliance for the ${domain} domain.` },
    { heading:"2. Scope", content:"This policy applies to all APEX Solutions employees, contractors, and third-party personnel who access, process, store, or transmit CUI or operate systems within the CMMC boundary." },
    { heading:"3. Policy Requirements", content:reqs },
    { heading:"4. Roles and Responsibilities", content:roles },
    { heading:"5. Compliance and Enforcement", content:"Violations may result in disciplinary action up to and including termination. Violations involving CUI may be reported to the Contracting Officer as required." },
    { heading:"6. Review and Update Cycle", content:"This policy is reviewed annually by the Compliance Manager and updated as required following system changes, incidents, or regulatory updates." },
    { heading:"7. Related Documents", content:`Related procedures and supporting evidence are referenced in Control HUB under the ${domain} domain controls.` },
  ];
}

function procBase(purpose: string, steps: string, verification: string): Array<{heading:string;content:string}> {
  return [
    { heading:"1. Purpose", content:purpose },
    { heading:"2. Scope", content:"This procedure applies to all personnel with system administrator or compliance responsibilities within the APEX Solutions CMMC boundary." },
    { heading:"3. Prerequisites", content:"• Access to the APEX Solutions IT management console\n• Completion of APEX Solutions security awareness training\n• Authorization from IT Administrator for the relevant task" },
    { heading:"4. Procedure Steps", content:steps },
    { heading:"5. Verification", content:verification },
    { heading:"6. Record Keeping", content:"Documentation must be retained in Control HUB for a minimum of 3 years, including date, executor name, and outcome." },
    { heading:"7. Exceptions", content:"Exceptions require written approval from the IT Director and Compliance Manager and must be documented in the POA&M register." },
  ];
}

const DOCUMENT_SPECS: DocumentSpec[] = [
  { title:"Access Control Policy", fileName:"APEX_Access_Control_Policy.docx", ext:".docx", mime:"application/vnd.openxmlformats-officedocument.wordprocessingml.document", docType:"policy", status:"active", ctrls:["AC.L2-3.1.1","AC.L2-3.1.2","AC.L2-3.1.3","AC.L2-3.1.5","AC.L2-3.1.20"], version:"2.1", effectiveDaysAgo:180, sections:policyBase("Access Control","Access Control","3.1 All user access to CUI systems requires prior authorization from the IT Administrator.\n3.2 Access is granted based on least-privilege principles and job function.\n3.3 Privileged accounts must use Entra ID PIM for just-in-time activation.\n3.4 External connections require documented business justification and IT Director approval.\n3.5 Quarterly access reviews must be completed and documented in Control HUB.","IT Administrator: Approves access requests, manages accounts, conducts access reviews.\nCompliance Manager: Reviews access review results, maintains policy currency.\nAll Personnel: Request access through approved channels, report unauthorized access.") },
  { title:"Identification and Authentication Policy", fileName:"APEX_Identification_Authentication_Policy.docx", ext:".docx", mime:"application/vnd.openxmlformats-officedocument.wordprocessingml.document", docType:"policy", status:"active", ctrls:["IA.L2-3.5.1","IA.L2-3.5.2","IA.L2-3.5.3","IA.L2-3.5.7"], version:"2.0", effectiveDaysAgo:180, sections:policyBase("Identification and Authentication","Identification and Authentication","3.1 Multi-factor authentication is mandatory for all user accounts accessing CUI systems.\n3.2 Passwords must meet minimum complexity: 14 characters, mixed case, numbers, symbols.\n3.3 Passwords expire every 90 days; reuse prohibited for last 24 passwords.\n3.4 Legacy authentication protocols are prohibited and must be blocked via Conditional Access.\n3.5 Service accounts must use managed identities or certificate-based authentication where feasible.","IT Administrator: Enforces MFA policies, manages Conditional Access, responds to authentication failures.\nAll Users: Comply with MFA enrollment, report credential compromise immediately.") },
  { title:"Audit and Accountability Policy", fileName:"APEX_Audit_Accountability_Policy.docx", ext:".docx", mime:"application/vnd.openxmlformats-officedocument.wordprocessingml.document", docType:"policy", status:"active", ctrls:["AU.L2-3.3.1","AU.L2-3.3.2","AU.L2-3.3.3","AU.L2-3.3.6"], version:"1.3", effectiveDaysAgo:180, sections:policyBase("Audit and Accountability","Audit and Accountability","3.1 Audit logs must be enabled for all CUI-scope systems.\n3.2 Audit logs must be retained for a minimum of 365 days.\n3.3 Audit logs must be protected from unauthorized modification; immutable storage preferred.\n3.4 Weekly audit log reviews are required and must be documented in Control HUB.\n3.5 Anomalies must be investigated and dispositioned within 5 business days.","IT Administrator: Configures audit logging, monitors SIEM alerts, escalates anomalies.\nCompliance Manager: Reviews weekly audit reports, tracks audit review completion.") },
  { title:"Configuration Management Policy", fileName:"APEX_Configuration_Management_Policy.docx", ext:".docx", mime:"application/vnd.openxmlformats-officedocument.wordprocessingml.document", docType:"policy", status:"active", ctrls:["CM.L2-3.4.1","CM.L2-3.4.2","CM.L2-3.4.4","CM.L2-3.4.6"], version:"1.4", effectiveDaysAgo:180, sections:policyBase("Configuration Management","Configuration Management","3.1 All CUI-scope systems must be configured per the APEX Solutions approved security baseline.\n3.2 System configuration changes require approval via the change management process.\n3.3 Unauthorized software is prohibited on CUI-scope endpoints.\n3.4 Device compliance is enforced via Microsoft Intune; non-compliant devices are blocked from CUI access.\n3.5 Configuration baselines are reviewed and updated quarterly.","IT Administrator: Maintains baseline, approves changes, enforces device compliance.\nChange Advisory Board: Reviews and approves configuration changes.") },
  { title:"Incident Response Policy", fileName:"APEX_Incident_Response_Policy.docx", ext:".docx", mime:"application/vnd.openxmlformats-officedocument.wordprocessingml.document", docType:"policy", status:"active", ctrls:["IR.L2-3.6.1","IR.L2-3.6.2","IR.L2-3.6.3"], version:"2.1", effectiveDaysAgo:180, sections:policyBase("Incident Response","Incident Response","3.1 All security incidents must be reported to the IT Administrator within 1 hour of discovery.\n3.2 Incidents involving CUI must be reported to the Contracting Officer within 72 hours.\n3.3 An IR tabletop exercise must be conducted annually and documented.\n3.4 Post-incident reviews must be completed within 5 business days of closure.\n3.5 Lessons learned must be incorporated into the Incident Response Plan.","IT Administrator: Leads incident response, coordinates containment and recovery.\nCompliance Manager: Manages regulatory reporting, maintains incident log.") },
  { title:"Risk Assessment Policy", fileName:"APEX_Risk_Assessment_Policy.docx", ext:".docx", mime:"application/vnd.openxmlformats-officedocument.wordprocessingml.document", docType:"policy", status:"active", ctrls:["RA.L2-3.11.1","RA.L2-3.11.2","RA.L2-3.11.3"], version:"1.2", effectiveDaysAgo:270, sections:policyBase("Risk Assessment","Risk Assessment","3.1 APEX Solutions conducts a formal organizational risk assessment annually using NIST SP 800-30.\n3.2 Vulnerability scanning must be performed on all CUI-scope systems at least weekly.\n3.3 All identified risks must be documented in the Risk Register with treatment decisions.\n3.4 High and critical vulnerabilities must be remediated within 30 days of discovery.\n3.5 Risk assessment results must inform POA&M and SSP updates.","Compliance Manager: Leads annual risk assessment, maintains risk register.\nIT Administrator: Performs vulnerability scanning, manages remediation.") },
  { title:"Media Protection Policy", fileName:"APEX_Media_Protection_Policy.docx", ext:".docx", mime:"application/vnd.openxmlformats-officedocument.wordprocessingml.document", docType:"policy", status:"active", ctrls:["MP.L2-3.8.1","MP.L2-3.8.3","MP.L2-3.8.7","MP.L2-3.8.9"], version:"1.1", effectiveDaysAgo:270, sections:policyBase("Media Protection","Media Protection","3.1 Removable media containing CUI must be encrypted using AES-256 or equivalent.\n3.2 USB removable storage is blocked by default; approved exceptions require IT Director sign-off.\n3.3 Media sanitization must follow NIST SP 800-88 Rev 1 guidelines prior to disposal or reuse.\n3.4 Backup media must be tested quarterly; restoration test results documented in Control HUB.\n3.5 CUI must not be stored on personal devices without written approval and encryption enforcement.","IT Administrator: Enforces USB policy via Intune, maintains media disposal log.\nAll Personnel: Use only IT-approved media for CUI; report lost or stolen media immediately.") },
  { title:"System and Communications Protection Policy", fileName:"APEX_System_Communications_Protection_Policy.docx", ext:".docx", mime:"application/vnd.openxmlformats-officedocument.wordprocessingml.document", docType:"policy", status:"active", ctrls:["SC.L2-3.13.1","SC.L2-3.13.8","SC.L2-3.13.11","SC.L2-3.13.16"], version:"1.3", effectiveDaysAgo:180, sections:policyBase("System and Communications Protection","System and Communications Protection","3.1 All CUI transmitted over networks must be encrypted using TLS 1.2 or higher.\n3.2 All endpoints storing CUI must have full-disk encryption enabled (BitLocker AES-256).\n3.3 Network segmentation must isolate CUI-handling systems from general corporate traffic.\n3.4 Only FIPS 140-2 or FIPS 140-3 validated cryptographic modules may be used for CUI protection.\n3.5 Firewall rules must be reviewed quarterly; allow rules require documented business justification.","IT Administrator: Configures and maintains encryption, firewall, and network segmentation.\nCompliance Manager: Validates encryption compliance through periodic evidence collection.") },
  { title:"Account Management Procedure", fileName:"APEX_Account_Management_Procedure.docx", ext:".docx", mime:"application/vnd.openxmlformats-officedocument.wordprocessingml.document", docType:"procedure", status:"active", ctrls:["AC.L2-3.1.1","AC.L2-3.1.2","PS.L2-3.9.2"], version:"1.5", effectiveDaysAgo:90, sections:procBase("This procedure defines the steps for provisioning, modifying, and deprovisioning user accounts on APEX Solutions CUI systems.","Step 1: Receive access request via IT ticketing system, verified by manager.\nStep 2: IT Administrator validates business justification and least-privilege scope.\nStep 3: Account created in Entra ID with correct group memberships and role assignments.\nStep 4: MFA enrollment initiated; user notified of registration requirements.\nStep 5: Access confirmed in writing by requestor within 2 business days.\nStep 6: Upon termination, accounts disabled within 2 hours of HR notification.\nStep 7: Accounts fully deleted after 30-day retention period per data governance policy.","IT Administrator verifies account creation/deletion in Entra ID and confirms in the HR offboarding ticket.") },
  { title:"MFA and Conditional Access Procedure", fileName:"APEX_MFA_Conditional_Access_Procedure.docx", ext:".docx", mime:"application/vnd.openxmlformats-officedocument.wordprocessingml.document", docType:"procedure", status:"active", ctrls:["IA.L2-3.5.3","AC.L2-3.1.1","AC.L2-3.1.20"], version:"1.3", effectiveDaysAgo:90, sections:procBase("This procedure defines the configuration and maintenance steps for Microsoft Entra ID Multi-Factor Authentication and Conditional Access policies.","Step 1: Review MFA registration report weekly; identify non-enrolled accounts.\nStep 2: Send MFA enrollment notification to non-enrolled users via email and Teams.\nStep 3: Escalate to manager if enrollment not completed within 5 business days.\nStep 4: Conditional Access policies reviewed monthly; changes follow change management procedure.\nStep 5: Legacy authentication policy reviewed quarterly; new legacy clients logged and scheduled for migration.\nStep 6: Break-glass account MFA status verified weekly and documented.","MFA coverage report exported from Entra ID and uploaded to Control HUB monthly.") },
  { title:"Audit Log Review Procedure", fileName:"APEX_Audit_Log_Review_Procedure.docx", ext:".docx", mime:"application/vnd.openxmlformats-officedocument.wordprocessingml.document", docType:"procedure", status:"active", ctrls:["AU.L2-3.3.1","AU.L2-3.3.5","AU.L2-3.3.6"], version:"1.2", effectiveDaysAgo:90, sections:procBase("This procedure defines the weekly audit log review process for APEX Solutions CUI systems.","Step 1: Log in to Microsoft Sentinel; navigate to Incidents and Alerts.\nStep 2: Review all new alerts generated since the last review session.\nStep 3: Triage each alert: categorize as false positive, policy violation, or security incident.\nStep 4: False positives are documented and rule tuning initiated if recurring.\nStep 5: Policy violations are documented and supervisors notified within 1 business day.\nStep 6: Security incidents are escalated per the Incident Response Procedure.\nStep 7: Completed review is documented in the Audit Log Review Record in Control HUB.","Completed Audit Log Review Record uploaded to Control HUB within 1 business day of review completion.") },
  { title:"Vulnerability Management Procedure", fileName:"APEX_Vulnerability_Management_Procedure.docx", ext:".docx", mime:"application/vnd.openxmlformats-officedocument.wordprocessingml.document", docType:"procedure", status:"active", ctrls:["RA.L2-3.11.2","RA.L2-3.11.3","SI.L2-3.14.1"], version:"1.4", effectiveDaysAgo:90, sections:procBase("This procedure defines the vulnerability identification, assessment, and remediation process for APEX Solutions.","Step 1: Tenable.io scans run automatically on Monday/Thursday for all CUI-scope assets.\nStep 2: Scan results exported to CSV and uploaded to the Remediation Tracker in Control HUB.\nStep 3: IT Administrator reviews new findings and assigns severity classification.\nStep 4: Critical CVEs: remediate within 7 days. High CVEs: 30 days. Medium: 90 days.\nStep 5: Findings beyond SLA are added to the POA&M register for tracking.\nStep 6: Remediation verified via re-scan before finding is marked Closed.\nStep 7: Monthly vulnerability summary prepared for Compliance Manager review.","Monthly vulnerability summary uploaded to Control HUB and reviewed by Compliance Manager.") },
  { title:"Backup Verification Procedure", fileName:"APEX_Backup_Verification_Procedure.docx", ext:".docx", mime:"application/vnd.openxmlformats-officedocument.wordprocessingml.document", docType:"procedure", status:"active", ctrls:["MP.L2-3.8.9","CM.L2-3.4.1"], version:"1.1", effectiveDaysAgo:90, sections:procBase("This procedure defines the quarterly backup restoration test to verify data integrity and recovery time objectives.","Step 1: Schedule backup restoration window with IT team (minimum 4-hour window).\nStep 2: Select a representative backup set from each critical system category.\nStep 3: Initiate restore to isolated test environment; do not restore to production.\nStep 4: Verify data integrity by checking checksums and performing application smoke tests.\nStep 5: Measure and record restore time; compare to RTO of 8 hours.\nStep 6: Document results in Backup Restore Test Record and upload to Control HUB.","Backup Restore Test Record completed, signed by IT Administrator, and uploaded to Control HUB within 2 business days.") },
  { title:"POA&M Management Procedure", fileName:"APEX_POAM_Management_Procedure.docx", ext:".docx", mime:"application/vnd.openxmlformats-officedocument.wordprocessingml.document", docType:"procedure", status:"active", ctrls:["CA.L2-3.12.2","RA.L2-3.11.3"], version:"1.0", effectiveDaysAgo:90, sections:procBase("This procedure defines the creation, tracking, and closure process for Plan of Action and Milestones (POA&M) items.","Step 1: New POA&M items are created in Control HUB when a gap is identified via assessment, scan, or audit.\nStep 2: Each POA&M must include: title, deficiency, linked control, risk level, owner, and scheduled completion date.\nStep 3: POA&M items are reviewed monthly by the Compliance Manager.\nStep 4: Owners provide monthly status updates; overdue items escalated to IT Director.\nStep 5: Remediation evidence is uploaded to Control HUB and linked to the POA&M item.\nStep 6: Compliance Manager validates evidence and marks POA&M as Closed with a resolution summary.","Monthly POA&M review meeting documented in Control HUB. All items must have status updates at least monthly.") },
  { title:"Device Compliance Procedure", fileName:"APEX_Device_Compliance_Procedure.docx", ext:".docx", mime:"application/vnd.openxmlformats-officedocument.wordprocessingml.document", docType:"procedure", status:"active", ctrls:["CM.L2-3.4.1","CM.L2-3.4.2","SC.L2-3.13.8"], version:"1.2", effectiveDaysAgo:90, sections:procBase("This procedure defines the process for enrolling, configuring, and maintaining device compliance for APEX Solutions endpoints.","Step 1: New devices are enrolled in Microsoft Intune via Autopilot during provisioning.\nStep 2: Security baseline and compliance policies are automatically applied via Intune.\nStep 3: Device compliance status is monitored daily in the Intune compliance dashboard.\nStep 4: Non-compliant devices trigger a Conditional Access block within 15 minutes.\nStep 5: IT Administrator contacts device owner; remediation must complete within 3 business days.\nStep 6: Devices non-compliant after 3 days are quarantined from the network.\nStep 7: Monthly compliance report generated and reviewed by Compliance Manager.","Monthly device compliance report exported from Intune and uploaded to Control HUB.") },
  { title:"User Access Review Log", fileName:"APEX_User_Access_Review_Log.xlsx", ext:".xlsx", mime:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", docType:"access_review", status:"approved", ctrls:["AC.L2-3.1.1","AC.L2-3.1.2"], version:"1.0", effectiveDaysAgo:7, sections:[] },
  { title:"Audit Log Review Record", fileName:"APEX_Audit_Log_Review_Record.xlsx", ext:".xlsx", mime:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", docType:"log", status:"approved", ctrls:["AU.L2-3.3.1","AU.L2-3.3.5"], version:"1.0", effectiveDaysAgo:7, sections:[] },
  { title:"Training Completion Register", fileName:"APEX_Training_Completion_Register.xlsx", ext:".xlsx", mime:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", docType:"log", status:"approved", ctrls:["AT.L2-3.2.1","AT.L2-3.2.2"], version:"1.0", effectiveDaysAgo:14, sections:[] },
  { title:"Risk Register", fileName:"APEX_Risk_Register.xlsx", ext:".xlsx", mime:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", docType:"risk_record", status:"approved", ctrls:["RA.L2-3.11.1","RA.L2-3.11.3"], version:"2.0", effectiveDaysAgo:45, sections:[] },
  { title:"POA&M Register", fileName:"APEX_POAM_Register.xlsx", ext:".xlsx", mime:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", docType:"register", status:"approved", ctrls:["CA.L2-3.12.2","RA.L2-3.11.3"], version:"1.0", effectiveDaysAgo:7, sections:[] },
  { title:"Backup Restore Test Record", fileName:"APEX_Backup_Restore_Test_Record.pdf", ext:".pdf", mime:"application/pdf", docType:"backup_verification", status:"approved", ctrls:["MP.L2-3.8.9"], version:"1.0", effectiveDaysAgo:45, sections:[] },
];

// ── File content dispatchers ──────────────────────────────────────────────────
async function generateEvidenceFile(spec: EvidenceSpec): Promise<Buffer> {
  const date = isoDate(daysAgo(spec.daysAgo));
  const d = spec.fileName;

  if (spec.ext === ".png") return screenshotPng(spec.domain);

  if (spec.ext === ".csv") {
    if (d.includes("User_List") || d.includes("user_list")) {
      return makeCsv(
        ["Display Name","UPN","Job Title","Department","Account Status","Last Sign-In","MFA Registered","Licenses"],
        Array.from({length:30}, (_,i) => [`User ${i+1} APEX`,`user${i+1}@apex-solutions.com`,["Analyst","Engineer","Manager","Director"][i%4]!,["IT","Finance","Engineering","HR","Legal"][i%5]!,"Active",isoDate(daysAgo(i*3)),i<27?"Yes":"No","M365 E3"])
      );
    }
    if (d.includes("Service_Account")) {
      return makeCsv(
        ["Account Name","UPN","Type","Owner","Application","Last Activity","MFA","Review Status"],
        Array.from({length:22}, (_,i) => [`svc-app${i+1}`,`svc-app${i+1}@apex-solutions.com`,i<10?"Managed Identity":"Service Principal","admin@apex-solutions.com",`Application ${i+1}`,isoDate(daysAgo(i*7)),i<19?"N/A":"Required",i<19?"Verified":"Flagged"])
      );
    }
    return makeCsv(
      ["CVE ID","Severity","CVSS Score","Asset","Plugin","Vulnerability Name","Solution","First Detected","Status"],
      [["CVE-2025-1234","High","8.1","APEX-WS-042","210756","Windows Print Spooler EoP","Apply Microsoft KB5021271",date,"Open"],["CVE-2025-2891","High","7.8","APEX-SRV-003","214823","OpenSSL Buffer Overflow","Upgrade OpenSSL to 3.1.4",date,"In Remediation"],["CVE-2025-3341","High","7.5","APEX-WS-017","216012","Edge RCE","Update Edge to 124.0.2478.80",date,"Open"],["CVE-2024-8901","Medium","6.5","APEX-WS-005","198234","WinZip Directory Traversal","Update WinZip to 28.0",date,"Open"],["CVE-2025-4112","Medium","5.9","APEX-WS-033","219045","Adobe Acrobat ID","Update to 24.002.20759",date,"Open"]]
    );
  }

  if (spec.ext === ".xlsx") {
    if (d.includes("Access_Review")||d.includes("Group_Membership")||d.includes("Least_Privilege")||d.includes("Admin_Role")||d.includes("Remote_Access")||d.includes("Guest_Access")) {
      return makeXlsx([{ name:"Access Review", headers:["Name","Email","Role","Department","Access Group","Last Sign-In","Review Decision","Reviewer","Review Date"], rows:Array.from({length:25},(_,i)=>[`Employee ${i+1}`,`emp${i+1}@apex-solutions.com`,["Analyst","Engineer","Manager","Admin","Viewer"][i%5]!,["IT","Finance","Engineering","HR"][i%4]!,`CUI-Access-Group-${(i%3)+1}`,isoDate(daysAgo(i*2)),i<22?"Retain":"Revoke","IT Administrator",date]) }]);
    }
    if (d.includes("MFA_Registration")||d.includes("LAPS")||d.includes("Bypass")) {
      return makeXlsx([{ name:"MFA Status", headers:["Display Name","UPN","MFA Registered","Auth Methods","Registration Date","Last MFA Use","Compliant"], rows:Array.from({length:30},(_,i)=>[`User ${i+1}`,`user${i+1}@apex-solutions.com`,i<27?"Yes":"No",i<27?"Microsoft Authenticator, SMS":"None",i<27?isoDate(daysAgo(i*30+60)):"",i<27?isoDate(daysAgo(i)):"Never",i<27?"Yes":"No"]) }]);
    }
    if (d.includes("Password_Change")) {
      return makeXlsx([{ name:"Password Changes", headers:["User","UPN","Change Type","Changed By","Date","IP Address","Location"], rows:Array.from({length:20},(_,i)=>[`User ${i+1}`,`user${i+1}@apex-solutions.com`,i%3===0?"Admin Reset":"Self-Service Reset",i%3===0?"IT Administrator":"Self",isoDate(daysAgo(i*3)),`10.0.${Math.floor(i/10)}.${(i*7)%255}`,"United States"]) }]);
    }
    if (d.includes("Device_Inventory")||d.includes("Encryption_Status")||d.includes("BitLocker")||d.includes("Software_Update")||d.includes("Patch")) {
      return makeXlsx([{ name:"Device Inventory", headers:["Device Name","Owner","OS Version","Compliance Status","BitLocker","Last Check-In","Intune Enrolled","Defender Status"], rows:Array.from({length:30},(_,i)=>[`APEX-${i<15?"WS":"SRV"}-${String(i+1).padStart(3,"0")}`,`user${(i%20)+1}@apex-solutions.com`,i<25?"Windows 11 23H2":"Windows 10 22H2",i<26?"Compliant":"Non-Compliant",i<27?"Enabled":"Not Enabled",isoDate(daysAgo(i*2)),i<28?"Yes":"No",i<29?"Active":"Offline"]) }]);
    }
    if (d.includes("Privileged_Activity")||d.includes("Audit_Log")||d.includes("Security_Alerts")) {
      return makeXlsx([{ name:"Activity Log", headers:["Date","User","Operation","Resource","IP Address","Result","Reviewed","Notes"], rows:Array.from({length:20},(_,i)=>[isoDate(daysAgo(i)),i%3===0?"admin@apex-solutions.com":`user${(i%10)+1}@apex-solutions.com`,["Role Activation","Policy Change","User Created","Password Reset","MFA Bypass"][i%5]!,["Global Admin Role","CA Policy","User Account","IT Admin","Service Account"][i%5]!,`203.0.${i%10}.${(i*7)%255}`,i<18?"Success":"Failure","Yes",i<18?"Normal operation":"Investigated — false positive"]) }]);
    }
    if (d.includes("Remediation_Tracker")||d.includes("Risk_Register")) {
      return makeXlsx([{ name:"Remediation", headers:["CVE / Risk ID","Title","Severity","CVSS","Asset","Owner","Due Date","Status","Notes"], rows:[["CVE-2025-1234","Print Spooler EoP","High","8.1","APEX-WS-042","IT Admin",isoDate(daysFromNow(10)),"In Progress","Patch scheduled"],["CVE-2025-2891","OpenSSL Buffer Overflow","High","7.8","APEX-SRV-003","IT Admin",isoDate(daysFromNow(7)),"In Progress","Testing in UAT"],["CVE-2025-3341","Edge RCE","High","7.5","APEX-WS-017","IT Admin",isoDate(daysFromNow(5)),"Open","Update scheduled"],["RISK-2026-001","MFA Gap","High","","All Users","Compliance Mgr",isoDate(daysFromNow(30)),"In Progress","POAM-APEX-001"],["RISK-2026-002","Backup Doc Gap","Low","","Backup Systems","IT Admin",isoDate(daysFromNow(14)),"In Progress","POAM-APEX-007"]] }]);
    }
    if (d.includes("Training")||d.includes("Completion")||d.includes("Schedule")||d.includes("Sign_In")) {
      return makeXlsx([{ name:"Training Records", headers:["Name","Email","Department","Training","Assigned Date","Completed Date","Score","Expiry","Status"], rows:Array.from({length:28},(_,i)=>[`Employee ${i+1}`,`emp${i+1}@apex-solutions.com`,["IT","Finance","HR","Engineering","Legal"][i%5]!,"APEX Solutions Annual Security Awareness Training 2026",isoDate(daysAgo(180)),i<25?isoDate(daysAgo(90-i)):"Incomplete",i<25?`${85+(i%15)}%`:"",i<25?isoDate(daysFromNow(270)):"N/A",i<25?"Complete":"Non-Compliant"]) }]);
    }
    if (d.includes("Visitor_Log")||d.includes("Physical_Access")||d.includes("Termination")||d.includes("Background")) {
      return makeXlsx([{ name:"Visitor Log", headers:["Date","Visitor Name","Company","Host","Purpose","Badge #","Areas Accessed","Sign-In","Sign-Out"], rows:Array.from({length:20},(_,i)=>[isoDate(daysAgo(i*3)),`Visitor ${i+1}`,["ACME Corp","Contoso","TechVenture","AuditFirm"][i%4]!,`Host ${(i%5)+1}`,["Vendor Meeting","Audit","Interview","Training","Support"][i%5]!,`V${1000+i}`,i%4===0?"Lobby Only":"Lobby, Conference Room",`${8+(i%4)}:${String(i%60).padStart(2,"0")} AM`,`${11+(i%7)}:${String((i*15)%60).padStart(2,"0")} AM`]) }]);
    }
    if (d.includes("Backup_Completion")) {
      return makeXlsx([{ name:"Backup Log", headers:["Job Name","Type","Server","Start Time","End Time","Duration","Size (GB)","Status","Restore Verified"], rows:Array.from({length:15},(_,i)=>[`Backup Job ${i+1}`,i%3===0?"Full":i%3===1?"Incremental":"Differential",`APEX-SRV-${String((i%5)+1).padStart(3,"0")}`,`2026-07-0${(i%7)+1} 02:00:00`,`2026-07-0${(i%7)+1} 03:${String(i*4%60).padStart(2,"0")}:00`,`${1+i%4}h ${(i*12)%60}m`,`${100+i*25}`,"Completed","Yes"]) }]);
    }
    if (d.includes("Change_Management")) {
      return makeXlsx([{ name:"Change Log", headers:["Change ID","Date","Title","Type","Requestor","Approver","Status","Implementation Date","Notes"], rows:Array.from({length:17},(_,i)=>[`CHG-2026-${String(i+1).padStart(3,"0")}`,isoDate(daysAgo(i*5+7)),`Change ${i+1} — ${["Security Baseline","Firewall Rule","Intune Policy","Conditional Access","SIEM Rule"][i%5]!} update`,["Standard","Normal","Emergency"][i%3]!,"IT Administrator","IT Director","Completed",isoDate(daysAgo(i*5)),i%8===0?"Emergency post-approval":"Approved per CAB"]) }]);
    }
    return makeXlsx([{ name:"Log", headers:["Date","Item","Description","Owner","Status","Notes"], rows:Array.from({length:10},(_,i)=>[isoDate(daysAgo(i*7)),`Item ${i+1}`,`${spec.title} — record ${i+1}`,"IT Administrator","Completed","Documented"]) }]);
  }

  if (spec.ext === ".pdf") {
    const sections: Array<{heading:string;content:string}> = [];
    if (spec.evType === "access_review") {
      sections.push(
        { heading:"Executive Summary", content:`This ${spec.title} was conducted by the APEX Solutions IT Administrator and Compliance Manager on ${date}. All user access was reviewed against the current role matrix and job function assignments.` },
        { heading:"Methodology", content:"Access rights were exported from Microsoft Entra ID and compared against the current HR personnel list and approved role matrix. Managers certified their team's access via the formal review checklist." },
        { heading:"Findings", content:"Total accounts reviewed: 137 active accounts\nAccounts with changes: 3 accounts deprovisioned, 7 group memberships removed\nPrivileged accounts reviewed: 22 accounts, all verified\nService accounts reviewed: 22 accounts, 3 flagged for MFA remediation" },
        { heading:"Remediation Actions", content:"3 accounts of terminated employees deprovisioned within 2 hours of review completion.\n7 excess group memberships removed.\n3 service accounts added to MFA remediation POAM (POAM-APEX-001)." },
        { heading:"Attestation", content:`This access review was completed on ${date} by IT Administrator with Compliance Manager certification.\nSignature on file in Control HUB.` }
      );
    } else if (spec.evType === "scan_report") {
      sections.push(
        { heading:"Scan Overview", content:`This report presents the results of the ${spec.title} conducted on ${date} using Tenable.io vulnerability assessment platform. All CUI-scope assets were included in scope.` },
        { heading:"Executive Summary", content:"Critical: 0\nHigh: 5 (3 within 30-day SLA)\nMedium: 12\nLow: 34\nInformational: 78\n\nOverall security posture: GOOD. No critical vulnerabilities detected. High CVEs are in active remediation." },
        { heading:"High Severity Findings", content:"CVE-2025-1234: Windows Print Spooler EoP (CVSS 8.1) — APEX-WS-042 — Patch pending\nCVE-2025-2891: OpenSSL Buffer Overflow (CVSS 7.8) — APEX-SRV-003 — In UAT\nCVE-2025-3341: Edge RCE (CVSS 7.5) — APEX-WS-017 — Update scheduled" },
        { heading:"Remediation Status", content:"5 of 5 high CVEs have assigned owners and remediation plans. All are within the 30-day SLA or tracked in POAM-APEX-005." },
        { heading:"Trending", content:"This scan shows a 15% reduction in total findings compared to last month. 23 findings from previous scan were successfully remediated." }
      );
    } else if (spec.evType === "risk_record") {
      sections.push(
        { heading:"Assessment Overview", content:`APEX Solutions conducted this risk assessment on ${date} following NIST SP 800-30 Rev 1 methodology. Scope includes all information systems processing, storing, or transmitting CUI.` },
        { heading:"Risk Identification", content:"14 risks identified across all domains:\n• 3 Critical (targeted for immediate remediation)\n• 5 High (remediation within 60 days)\n• 4 Medium (remediation within 90 days)\n• 2 Low (accepted with monitoring)" },
        { heading:"Key Risk Areas", content:"1. MFA Coverage Gap — likelihood: High, impact: High — POAM-APEX-001\n2. Legacy Authentication Protocols — likelihood: Medium, impact: High — In Remediation\n3. Incomplete Device Enrollment — likelihood: Medium, impact: Medium — POAM-APEX-003\n4. Vulnerability Remediation Backlog — likelihood: Low, impact: High — POAM-APEX-005" },
        { heading:"Risk Treatment Decisions", content:"Mitigate: 11 risks with active POA&M items or completed controls\nAccept: 2 low risks with documented acceptance rationale\nTransfer: 1 risk via cyber liability insurance coverage" },
        { heading:"Recommendations", content:"Priority 1: Complete MFA enrollment for all 9 remaining accounts within 30 days\nPriority 2: Finalize BitLocker rollout to all 9 non-compliant devices\nPriority 3: Complete IR tabletop exercise overdue from Q2" }
      );
    } else if (spec.evType === "backup_verification") {
      sections.push(
        { heading:"Test Overview", content:`APEX Solutions conducted this backup restoration test on ${date} to verify data integrity and validate recovery time objectives (RTO: 8 hours) and recovery point objectives (RPO: 4 hours).` },
        { heading:"Systems Tested", content:"Production File Server: APEX-SRV-001 (Azure Backup)\nSQL Database Server: APEX-SRV-003 (Azure SQL Backup)\nSharePoint Online: Tenant-level backup (Veeam Backup for M365)\nEndpoint Image: Sample workstation APEX-WS-042 (Intune Autopilot)" },
        { heading:"Test Results", content:"File Server restore: SUCCESS — 2.3 hours (RTO: Met)\nSQL Database restore: SUCCESS — 1.8 hours (RTO: Met)\nSharePoint restore: SUCCESS — 45 minutes (RTO: Met)\nEndpoint restore via Autopilot: SUCCESS — 3.1 hours (RTO: Met)\n\nAll restore operations verified via checksum validation and application smoke testing." },
        { heading:"Findings and Recommendations", content:"1. File server restore time improved by 22% over last test due to network optimization.\n2. SQL restore required 1 manual intervention step — procedure updated to automate." },
        { heading:"Attestation", content:`Test completed and verified by IT Administrator on ${date}. All systems restored to operational state.\nDocumentation retained in Control HUB per APEX Media Protection Policy.` }
      );
    } else if (spec.evType === "incident_record") {
      sections.push(
        { heading:"Exercise Overview", content:`APEX Solutions conducted an IR tabletop exercise on ${date}. The scenario simulated a targeted ransomware attack on the APEX CUI enclave. Participants included IT Administrator, Compliance Manager, Legal Counsel, and Executive Sponsor.` },
        { heading:"Scenario Summary", content:"Scenario: A phishing email compromised a privileged account credential. The attacker moved laterally and deployed ransomware to 3 file servers before detection.\n\nSimulation duration: 3 hours\nParticipants: 14 team members" },
        { heading:"Response Actions Tested", content:"Detection and Escalation: SIEM alert to IR team — 18 minutes (target: 30 min) ✓\nIsolation of affected systems: 42 minutes (target: 60 min) ✓\nNotification to Contracting Officer: 3 hours (target: 72 hours) ✓\nForensic preservation: Initiated during containment ✓" },
        { heading:"Gaps Identified", content:"1. Backup restoration procedure requires IT Director approval — delays recovery by 1+ hours\n2. Contracting Officer contact information was not in IR contact list (updated)\n3. Quarantine procedure for cloud workloads not documented" },
        { heading:"After-Action Decisions", content:"All 3 gaps logged as POA&M items. IR Plan version 2.2 update scheduled. Follow-up exercise planned for Q4 2026." }
      );
    } else {
      sections.push(
        { heading:"Document Overview", content:`This ${spec.evType.replace(/_/g," ")} documents APEX Solutions' implementation of ${spec.ctrls.join(", ")} as of ${date}.` },
        { heading:"Current State", content:`${spec.desc}\n\nStatus: ${spec.status}\nDate: ${date}` },
        { heading:"Evidence Details", content:`Assessor Summary: ${spec.summary}\n\nThis document has been reviewed and approved by the APEX Solutions IT Administrator and Compliance Manager.` },
        { heading:"Retention", content:"This document is retained in Control HUB per the APEX Solutions data retention policy. Minimum retention period: 3 years from the date of creation." }
      );
    }
    return makePdf({ title:spec.title, orgName:"APEX Solutions LLC", date, sections, subtitle:`Controls: ${spec.ctrls.join(", ")}` });
  }

  return makeDocx({ title:spec.title, orgName:"APEX Solutions LLC", version:"1.0", date, sections:[{ heading:"Overview", content:spec.desc },{ heading:"Details", content:spec.summary }] });
}

async function generateDocumentFile(spec: DocumentSpec): Promise<Buffer> {
  const date = isoDate(daysAgo(spec.effectiveDaysAgo));

  if (spec.ext === ".docx") {
    const sections = spec.sections.length > 0 ? spec.sections : [
      { heading:"1. Purpose", content:`This document establishes ${spec.title.toLowerCase()} requirements for APEX Solutions LLC.` },
      { heading:"2. Scope", content:"Applies to all personnel and systems within the CMMC boundary." },
      { heading:"3. Requirements", content:"Requirements are aligned to CMMC Level 2 and NIST SP 800-171 Rev 2." },
      { heading:"4. Review", content:`Reviewed annually. Current version: ${spec.version}. Effective: ${date}.` },
    ];
    return makeDocx({ title:spec.title, orgName:"APEX Solutions LLC", version:spec.version, date, sections });
  }

  if (spec.ext === ".xlsx") {
    if (spec.docType === "access_review") {
      return makeXlsx([{ name:"Access Review", headers:["Name","Email","Role","Department","Access Groups","Last Sign-In","Decision","Reviewer","Date"], rows:Array.from({length:30},(_,i)=>[`Employee ${i+1}`,`emp${i+1}@apex-solutions.com`,["Analyst","Manager","Engineer","Director","Admin"][i%5]!,["IT","Finance","HR","Engineering"][i%4]!,`Group-${(i%4)+1}, Group-${(i%3)+5}`,isoDate(daysAgo(i*2)),i<28?"Retain":"Revoke","Compliance Manager",date]) }]);
    }
    if (spec.docType === "log") {
      if (spec.title.includes("Audit")) {
        return makeXlsx([{ name:"Audit Log Review", headers:["Review Date","Reviewer","Period Covered","Alerts Reviewed","Anomalies Found","Escalated","Closed","Notes"], rows:Array.from({length:13},(_,i)=>[isoDate(daysAgo(i*7)),i%2===0?"IT Administrator":"Security Analyst",`${isoDate(daysAgo(i*7+7))} – ${isoDate(daysAgo(i*7))}`,`${Math.floor(Math.random()*20)+5}`,`${Math.floor(Math.random()*3)}`,i%7===0?"Yes":"No","Yes",i%4===0?"1 false positive tuned":"No issues"]) }]);
      }
      return makeXlsx([{ name:"Training Register", headers:["Name","Email","Department","Training","Assigned","Completed","Score","Expiry","Status"], rows:Array.from({length:35},(_,i)=>[`Employee ${i+1}`,`emp${i+1}@apex-solutions.com`,["IT","Finance","HR","Engineering","Legal","Operations"][i%6]!,"APEX Annual Security Awareness Training 2026",isoDate(daysAgo(180)),i<32?isoDate(daysAgo(100-i)):"Not Completed",i<32?`${88+i%12}%`:"",i<32?isoDate(daysFromNow(265-i)):"",i<32?"Complete":"Non-Compliant"]) }]);
    }
    if (spec.docType === "risk_record") {
      return makeXlsx([{ name:"Risk Register", headers:["Risk ID","Risk Title","Category","Likelihood","Impact","Risk Score","Treatment","Owner","Due Date","Status"], rows:[["RISK-2026-001","MFA Enrollment Gap","Identity","High","High","16","Mitigate","IT Admin",isoDate(daysFromNow(30)),"In Progress"],["RISK-2026-002","Legacy Auth Enabled","Identity","Medium","High","12","Mitigate","IT Admin",isoDate(daysFromNow(60)),"In Progress"],["RISK-2026-003","Device Compliance Gap","Endpoint","Medium","Medium","9","Mitigate","IT Admin",isoDate(daysFromNow(60)),"In Progress"],["RISK-2026-004","Vuln Remediation Backlog","Vulnerability","Low","High","8","Mitigate","IT Admin",isoDate(daysFromNow(14)),"In Progress"],["RISK-2026-005","Audit Log Gap","Audit","Low","Medium","6","Mitigate","Compliance",isoDate(daysFromNow(30)),"In Progress"],["RISK-2026-006","Physical Access Logging","Physical","Low","Low","4","Accept","Facility",isoDate(daysFromNow(90)),"Accepted"],["RISK-2026-007","Third-Party Risk","Supply Chain","Medium","Medium","9","Mitigate","Compliance",isoDate(daysFromNow(90)),"Open"]] }]);
    }
    if (spec.docType === "register") {
      return makeXlsx([{ name:"POA&M", headers:["POAM #","Title","Control","Risk Level","Status","Owner","Due Date","Remediation Plan","Notes"], rows:[["POAM-APEX-001","MFA Registration Incomplete","IA.L2-3.5.3","HIGH","IN PROGRESS","IT Admin",isoDate(daysFromNow(30)),"Phase enrollment campaign, escalate non-enrolled to HR","4 of 9 accounts enrolled"],["POAM-APEX-002","Stale Account Review","AC.L2-3.1.1","MEDIUM","OPEN","IT Admin",isoDate(daysFromNow(45)),"Inventory service accounts, deprovision unnecessary","Preliminary list 8 candidates"],["POAM-APEX-003","Intune Compliance Rollout","CM.L2-3.4.2","HIGH","IN PROGRESS","IT Admin",isoDate(daysFromNow(60)),"Assess devices, update baselines, document exceptions","3 of 9 devices remediated"],["POAM-APEX-004","Audit Log Review Evidence Gap","AU.L2-3.3.1","MEDIUM","IN PROGRESS","Compliance",isoDate(daysFromNow(30)),"Reconstruct evidence from Sentinel logs","2 of 3 weeks reconstructed"],["POAM-APEX-005","Vulnerability Remediation Backlog","RA.L2-3.11.2","HIGH","OPEN","IT Admin",isoDate(daysFromNow(14)),"Patch in next maintenance window, apply interim controls","Patching window scheduled"],["POAM-APEX-006","IR Tabletop Exercise Overdue","IR.L2-3.6.3","MEDIUM","OPEN","Compliance",isoDate(daysFromNow(45)),"Reschedule and conduct exercise with third-party facilitator","Rescheduled for 2026-08-15"],["POAM-APEX-007","Backup Documentation Needs Update","MP.L2-3.8.9","LOW","IN PROGRESS","IT Admin",isoDate(daysFromNow(14)),"Update Q1 record with required fields, improve checklist","Updated record being finalized"]] }]);
    }
    return makeXlsx([{ name:"Log", headers:["Date","Entry","Details","Status","Owner"], rows:Array.from({length:10},(_,i)=>[isoDate(daysAgo(i*7)),`Entry ${i+1}`,`${spec.title} log entry ${i+1}`,"Completed","IT Admin"]) }]);
  }

  return makePdf({
    title:spec.title, orgName:"APEX Solutions LLC", date,
    subtitle:`v${spec.version} | Controls: ${spec.ctrls.join(", ")}`,
    sections:[
      { heading:"Document Information", content:`Title: ${spec.title}\nOrganization: APEX Solutions LLC\nVersion: ${spec.version}\nEffective Date: ${date}\nCMMC Controls: ${spec.ctrls.join(", ")}` },
      { heading:"Purpose and Scope", content:"This document supports APEX Solutions' CMMC Level 2 compliance posture. It is retained in Control HUB and subject to the organization's document management and retention policies." },
      { heading:"Content", content:`${spec.title} — This record has been prepared and approved by the APEX Solutions Compliance Team.\n\nStatus: ${spec.status}\nReview Cycle: Annual\nNext Review: ${isoDate(daysFromNow(365-spec.effectiveDaysAgo))}` },
      { heading:"Attestation", content:`Prepared by: IT Administrator\nReviewed by: Compliance Manager\nDate: ${date}\n\nThis document is authentic and has been reviewed for accuracy.` },
    ],
  });
}

// ── Endpoint ─────────────────────────────────────────────────────────────────
const SEED_SECRET = "apex-seed-2026-controlhub";

router.post("/admin/seed-apex-files", async (req, res) => {
  const secret = req.headers["x-seed-secret"];
  if (secret !== SEED_SECRET) return res.status(403).json({ error: "Missing or invalid X-Seed-Secret header" });
  const [org] = await db.select({ id: organizationsTable.id, name: organizationsTable.name })
    .from(organizationsTable).where(eq(organizationsTable.id, APEX_ORG_ID)).limit(1);
  if (!org) return res.status(404).json({ error: "APEX Solutions org not found — run startup seed first" });

  const [existingEv] = await db.select({ id: evidenceItemsTable.id })
    .from(evidenceItemsTable).where(eq(evidenceItemsTable.organizationId, APEX_ORG_ID)).limit(1);
  const [existingDoc] = await db.select({ id: documentsTable.id })
    .from(documentsTable).where(eq(documentsTable.organizationId, APEX_ORG_ID)).limit(1);

  if (existingEv && existingDoc) {
    return res.json({ message: "Already seeded — APEX Solutions already has evidence and documents", skipped: true });
  }

  let [adminUser] = await db.select({ id: usersTable.id })
    .from(usersTable).where(eq(usersTable.email, "admin@example.com")).limit(1);
  if (!adminUser) {
    [adminUser] = await db.select({ id: usersTable.id })
      .from(usersTable).where(eq(usersTable.role, "admin")).limit(1);
  }
  if (!adminUser) return res.status(400).json({ error: "No admin user found in database" });

  const allControls = await db.select({ id: controlsTable.id, ref: controlsTable.controlId }).from(controlsTable);
  const controlMap = new Map(allControls.map(c => [c.ref, c.id]));

  const now = new Date();
  const errors: string[] = [];
  let evidenceUploaded = 0;
  let documentsUploaded = 0;

  if (!existingEv) {
    for (const spec of EVIDENCE_SPECS) {
      try {
        const buf = await generateEvidenceFile(spec);
        const fileKey = await uploadEvidenceToGCS(buf, spec.mime, spec.ext, spec.fileName);
        const collectedAt = daysAgo(spec.daysAgo);
        const evId = randomUUID();
        await db.insert(evidenceItemsTable).values({
          id: evId,
          organizationId: APEX_ORG_ID,
          title: spec.title,
          description: spec.desc,
          evidenceType: spec.evType,
          status: spec.status,
          fileKey,
          fileName: spec.fileName,
          fileSize: buf.length,
          mimeType: spec.mime,
          version: "1.0",
          tags: spec.tags,
          ownerId: adminUser.id,
          collectedAt,
          approvedAt: spec.status === "approved" ? collectedAt : undefined,
          assessorSummary: spec.summary,
          isCurrentVersion: true,
          createdAt: collectedAt,
          updatedAt: now,
        });
        for (const ctrlRef of spec.ctrls) {
          const controlPk = controlMap.get(ctrlRef);
          if (controlPk) {
            await db.insert(evidenceControlLinksTable).values({
              id: randomUUID(),
              evidenceId: evId,
              controlId: controlPk,
              linkedAt: now,
              linkedById: adminUser.id,
            });
          }
        }
        evidenceUploaded++;
      } catch (err: any) {
        errors.push(`evidence "${spec.fileName}": ${err.message}`);
      }
    }
  }

  if (!existingDoc) {
    for (const spec of DOCUMENT_SPECS) {
      try {
        const buf = await generateDocumentFile(spec);
        const fileKey = await uploadDocToGCS(buf, spec.mime, spec.ext, spec.fileName);
        const effectiveDate = daysAgo(spec.effectiveDaysAgo);
        const docId = randomUUID();
        await db.insert(documentsTable).values({
          id: docId,
          organizationId: APEX_ORG_ID,
          title: spec.title,
          docType: spec.docType,
          status: spec.status,
          cmmcLevel: "L2",
          version: spec.version,
          body: "",
          effectiveDate,
          ownerId: adminUser.id,
          fileKey,
          fileName: spec.fileName,
          fileSize: String(buf.length),
          isCurrentVersion: true,
          requiresApproval: true,
          approvedAt: spec.status === "approved" || spec.status === "active" ? effectiveDate : undefined,
          activatedAt: spec.status === "active" ? effectiveDate : undefined,
          createdAt: effectiveDate,
          updatedAt: now,
        });
        for (const ctrlRef of spec.ctrls) {
          const controlPk = controlMap.get(ctrlRef);
          if (controlPk) {
            await db.insert(documentControlMapsTable).values({
              id: randomUUID(),
              documentId: docId,
              controlId: controlPk,
              linkedAt: now,
            });
          }
        }
        documentsUploaded++;
      } catch (err: any) {
        errors.push(`document "${spec.fileName}": ${err.message}`);
      }
    }
  }

  res.json({
    org: org.name,
    evidenceUploaded,
    documentsUploaded,
    errors,
    message: `Seeded ${evidenceUploaded} evidence files and ${documentsUploaded} documents for ${org.name}`,
  });
});

export default router;
