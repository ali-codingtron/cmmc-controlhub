import { Router } from "express";
import archiver from "archiver";
import PDFDocument from "pdfkit";
import ExcelJS from "exceljs";
import crypto from "crypto";
import { db } from "@workspace/db";
import {
  controlsTable,
  controlAssessmentsTable,
  domainsTable,
  evidenceItemsTable,
  evidenceControlLinksTable,
  documentsTable,
  documentControlMapsTable,
  monitoringItemsTable,
  poamsTable,
  sspControlMappingsTable,
  organizationsTable,
} from "@workspace/db";
import { eq, and, inArray, isNull } from "drizzle-orm";
import { requireAuth, requireRole } from "../lib/auth";
import { requireOrg } from "../middleware/org";
import { ObjectStorageService } from "../lib/objectStorage";

const router = Router();
const objectStorageService = new ObjectStorageService();

// ── CMMC domain name → standard 2-letter code ─────────────────────────────────
const CMMC_DOMAIN_CODES: Record<string, string> = {
  "Access Control": "AC",
  "Awareness and Training": "AT",
  "Audit and Accountability": "AU",
  "Configuration Management": "CM",
  "Identification and Authentication": "IA",
  "Incident Response": "IR",
  "Maintenance": "MA",
  "Media Protection": "MP",
  "Personnel Security": "PS",
  "Physical Protection": "PE",
  "Risk Assessment": "RA",
  "Security Assessment": "CA",
  "System and Communications Protection": "SC",
  "System and Information Integrity": "SI",
};

function domainCode(domainName: string): string {
  return CMMC_DOMAIN_CODES[domainName] ?? (domainName.replace(/[^A-Z]/g, "").slice(0, 2) || "XX");
}

// ── Evidence types that should ALSO appear in the Document Library ─────────────
const DOC_LIKE_EVIDENCE_TYPES = new Set([
  "policy", "procedure", "report", "log", "approval_record", "access_review",
  "training_record", "risk_record", "incident_record", "backup_verification",
  "scan_report", "configuration_export", "system_inventory", "asset_inventory",
  "supplier_review", "network_diagram",
]);

function evidenceToDocLibFolder(evType: string): string {
  switch (evType) {
    case "policy": return "Policies";
    case "procedure": return "Procedures";
    case "log": case "approval_record": case "access_review": return "Logs_and_Review_Records";
    case "risk_record": return "Risk_and_POAM";
    case "training_record": return "Training_and_Personnel";
    case "incident_record": return "Incident_Response";
    case "configuration_export": case "system_inventory": case "asset_inventory": return "Configuration_and_Baselines";
    default: return "Other_Documents";
  }
}

function docTypeToLibFolder(docType: string | null | undefined): string {
  const t = (docType ?? "").toLowerCase();
  if (t === "policy") return "Policies";
  if (t === "procedure") return "Procedures";
  if (t === "log" || t === "register" || t === "checklist") return "Logs_and_Review_Records";
  if (t === "risk_record") return "Risk_and_POAM";
  if (t.includes("training")) return "Training_and_Personnel";
  if (t.includes("incident")) return "Incident_Response";
  if (t === "system_inventory" || t === "asset_inventory" || t === "vulnerability_scan") return "Configuration_and_Baselines";
  if (t === "narrative" || t === "form" || t === "plan") return "Generated_Documents";
  return "Other_Documents";
}

function evidenceToLibFolder(evType: string): string {
  switch (evType) {
    case "screenshot": return "Screenshots";
    case "log": return "Logs";
    case "configuration_export": return "Configuration_Exports";
    case "report": case "scan_report": return "Reports";
    case "access_review": case "approval_record": return "Access_Reviews";
    case "training_record": return "Training";
    case "backup_verification": return "Backup_and_Recovery";
    case "system_inventory": case "asset_inventory": return "Device_and_Endpoint";
    case "risk_record": case "incident_record": return "Reports";
    case "policy": case "procedure": return "Other_Evidence";
    default: return "Other_Evidence";
  }
}

// ── Helpers ────────────────────────────────────────────────────────────────────
async function buildPdf(fn: (doc: PDFKit.PDFDocument) => void): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50, size: "LETTER" });
    const chunks: Buffer[] = [];
    doc.on("data", (c: Buffer) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
    fn(doc);
    doc.end();
  });
}

async function buildXlsx(headers: string[], rows: (string | number | null | undefined)[][]): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const ws = workbook.addWorksheet("Sheet1");
  ws.columns = headers.map((h) => ({ header: h, width: Math.max(h.length + 2, 18) }));
  rows.forEach((r) => ws.addRow(r.map((v) => v ?? "")));
  const arrayBuffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(arrayBuffer);
}

function sha256hex(buf: Buffer): string {
  return crypto.createHash("sha256").update(buf).digest("hex");
}

function fmtD(d: Date | string | null | undefined): string {
  if (!d) return "—";
  try {
    return new Date(d).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
  } catch { return String(d); }
}

function fileExt(fileName: string | null | undefined): string {
  if (!fileName) return "";
  const parts = fileName.split(".");
  return parts.length > 1 ? "." + parts.pop()!.toLowerCase() : "";
}

function safeSeg(str: string, maxLen = 30): string {
  return (str ?? "")
    .replace(/[^\w\-_.() ]/g, "_")
    .replace(/\s+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, maxLen) || "file";
}

// Short filename for evidence/document files in the ZIP
// Format: TYPE__TITLE__DATE__ID8.ext (max ~100 chars)
function evidenceFilename(evType: string, title: string, collectedAt: Date | string | null | undefined, id: string, originalFileName: string | null | undefined): string {
  const ext = fileExt(originalFileName);
  const type = safeSeg(evType.replace(/_/g, "-"), 20);
  const t = safeSeg(title, 28);
  const date = collectedAt ? new Date(collectedAt).toISOString().slice(0, 10) : "unknown";
  const uid = id.replace(/-/g, "").slice(0, 8);
  return `${type}__${t}__${date}__${uid}${ext}`;
}

// Filename for evidence in a control folder (no uid needed — already in unique folder)
function ctrlEvidenceFilename(evType: string, title: string, collectedAt: Date | string | null | undefined, originalFileName: string | null | undefined): string {
  const ext = fileExt(originalFileName);
  const type = safeSeg(evType.replace(/_/g, "-"), 20);
  const t = safeSeg(title, 35);
  const date = collectedAt ? new Date(collectedAt).toISOString().slice(0, 10) : "unknown";
  return `${type}__${t}__${date}${ext}`;
}

function docFilename(docType: string | null | undefined, title: string, id: string, originalFileName: string | null | undefined): string {
  const ext = fileExt(originalFileName) || ".docx";
  const type = safeSeg((docType ?? "doc").replace(/_/g, "-"), 20);
  const t = safeSeg(title, 30);
  const uid = id.replace(/-/g, "").slice(0, 8);
  return `${type}__${t}__${uid}${ext}`;
}

function ctrlFolderName(ctrl: { controlId: string; title: string }): string {
  return `${ctrl.controlId}__${safeSeg(ctrl.title, 35)}`;
}

async function fetchGcsFile(fileKey: string): Promise<Buffer | null> {
  try {
    if (!fileKey.startsWith("/objects/")) return null;
    const file = await objectStorageService.getObjectEntityFile(fileKey);
    const [downloaded] = await file.download();
    return downloaded as Buffer;
  } catch { return null; }
}

// ── POST /api/export/c3pao-package ────────────────────────────────────────────
router.post(
  "/export/c3pao-package",
  requireAuth,
  requireOrg,
  requireRole("admin", "compliance_manager"),
  async (req, res) => {
    const user = req.authUser!;
    const orgId = req.orgId!;

    const {
      includeApproved = true,
      includeAssessorReady = true,
      includeDraft = false,
      includePendingReview = false,
      includeArchived = false,
      includeInternalNotes = false,
      includeHashManifest = true,
      includeMetadataJson = true,
    } = req.body ?? {};

    const evidenceStatuses: string[] = [];
    if (includeApproved) evidenceStatuses.push("approved");
    if (includeAssessorReady) evidenceStatuses.push("assessor_ready");
    if (includeDraft) evidenceStatuses.push("draft");
    if (includePendingReview) evidenceStatuses.push("pending_review");
    if (includeArchived) evidenceStatuses.push("archived");
    if (evidenceStatuses.length === 0) evidenceStatuses.push("approved");

    try {
      // ── 1. Query all data ────────────────────────────────────────────────────
      const [
        org, domains, controls, assessments, evidence, evidenceLinks,
        documents, docLinks, monitoring, poams, sspMappings,
      ] = await Promise.all([
        db.select().from(organizationsTable).where(eq(organizationsTable.id, orgId)).limit(1).then((r) => r[0]),
        db.select().from(domainsTable).orderBy(domainsTable.sortOrder),
        db.select().from(controlsTable).orderBy(controlsTable.sortOrder),
        db.select().from(controlAssessmentsTable).where(eq(controlAssessmentsTable.organizationId, orgId)),
        db.select().from(evidenceItemsTable).where(
          and(eq(evidenceItemsTable.organizationId, orgId), isNull(evidenceItemsTable.deletedAt),
            inArray(evidenceItemsTable.status, evidenceStatuses as [string, ...string[]]))
        ),
        db.select().from(evidenceControlLinksTable),
        db.select().from(documentsTable).where(
          and(
            eq(documentsTable.organizationId, orgId),
            isNull(documentsTable.deletedAt),
            inArray(documentsTable.status, ["active", "approved", "assessor_ready", "pending_review", "draft"] as [string, ...string[]])
          )
        ),
        db.select().from(documentControlMapsTable),
        db.select().from(monitoringItemsTable).where(eq(monitoringItemsTable.organizationId, orgId)).orderBy(monitoringItemsTable.sortOrder),
        db.select().from(poamsTable).where(eq(poamsTable.organizationId, orgId)),
        db.select().from(sspControlMappingsTable).where(eq(sspControlMappingsTable.organizationId, orgId)),
      ]);

      if (!org) return res.status(404).json({ error: "Organization not found" });

      const exportDate = new Date().toISOString().slice(0, 10);
      const exportTimestamp = new Date().toISOString();
      const orgName = safeSeg(org.name ?? "org", 40);
      const pkgName = `${orgName}_C3PAO_Evidence_Package_${exportDate}`;
      const root = `${pkgName}/`;
      const rev = `${root}01_C3PAO_Review_Package/`;
      const imp = `${root}02_C3PAO_Import_Package/`;
      const man = `${root}99_Manifests/`;

      // ── Lookup maps ──────────────────────────────────────────────────────────
      const domainMap = new Map(domains.map((d) => [d.id, d]));
      const controlMap = new Map(controls.map((c) => [c.id, c]));
      const assessmentMap = new Map(assessments.map((a) => [a.controlId, a]));

      const evidenceToControls = new Map<string, string[]>();
      const controlToEvidence = new Map<string, string[]>();
      for (const lnk of evidenceLinks) {
        if (!evidenceToControls.has(lnk.evidenceId)) evidenceToControls.set(lnk.evidenceId, []);
        evidenceToControls.get(lnk.evidenceId)!.push(lnk.controlId);
        if (!controlToEvidence.has(lnk.controlId)) controlToEvidence.set(lnk.controlId, []);
        controlToEvidence.get(lnk.controlId)!.push(lnk.evidenceId);
      }
      const evidenceMap = new Map(evidence.map((e) => [e.id, e]));

      const docToControls = new Map<string, string[]>();
      const controlToDocs = new Map<string, string[]>();
      for (const lnk of docLinks) {
        if (!docToControls.has(lnk.documentId)) docToControls.set(lnk.documentId, []);
        docToControls.get(lnk.documentId)!.push(lnk.controlId);
        if (!controlToDocs.has(lnk.controlId)) controlToDocs.set(lnk.controlId, []);
        controlToDocs.get(lnk.controlId)!.push(lnk.documentId);
      }
      const docMap = new Map(documents.map((d) => [d.id, d]));

      const controlToPoams = new Map<string, typeof poams>();
      const unmappedPoams: typeof poams = [];
      for (const p of poams) {
        if (p.linkedControlId) {
          if (!controlToPoams.has(p.linkedControlId)) controlToPoams.set(p.linkedControlId, []);
          controlToPoams.get(p.linkedControlId)!.push(p);
        } else {
          unmappedPoams.push(p);
        }
      }

      // Monitoring by controlRef (monitoring.controlRef matches control.controlId)
      const controlRefToMonitoring = new Map<string, typeof monitoring>();
      for (const m of monitoring) {
        if (!controlRefToMonitoring.has(m.controlRef)) controlRefToMonitoring.set(m.controlRef, []);
        controlRefToMonitoring.get(m.controlRef)!.push(m);
      }

      const sspMap = new Map(sspMappings.map((s) => [s.controlDbId ?? s.controlRef, s]));

      const controlsByDomain = new Map<string, typeof controls>();
      for (const c of controls) {
        if (!controlsByDomain.has(c.domainId)) controlsByDomain.set(c.domainId, []);
        controlsByDomain.get(c.domainId)!.push(c);
      }

      // Evidence that is "document-like" (also goes in Document Library)
      const docLikeEvidence = evidence.filter((e) => DOC_LIKE_EVIDENCE_TYPES.has(e.evidenceType));

      // ── 2. Pre-fetch ALL GCS files in parallel batches ──────────────────────
      const gcsCache = new Map<string, Buffer | null>();
      const uniqueFileKeys = [
        ...new Set([
          ...evidence.map((e) => e.fileKey).filter(Boolean) as string[],
          ...documents.map((d) => d.fileKey).filter(Boolean) as string[],
        ]),
      ];

      const GCS_BATCH = 10;
      for (let i = 0; i < uniqueFileKeys.length; i += GCS_BATCH) {
        const batch = uniqueFileKeys.slice(i, i + GCS_BATCH);
        await Promise.all(batch.map(async (fk) => { gcsCache.set(fk, await fetchGcsFile(fk)); }));
      }

      function cachedFile(fileKey: string | null | undefined): Buffer | null {
        if (!fileKey) return null;
        return gcsCache.get(fileKey) ?? null;
      }

      // ── 3. Send headers immediately → proxy sees live response ──────────────
      const zipName = `${pkgName}.zip`;
      res.setHeader("Content-Type", "application/zip");
      res.setHeader("Content-Disposition", `attachment; filename="${zipName}"`);
      res.writeHead(200);

      const arc = archiver("zip", { zlib: { level: 6 } });
      arc.pipe(res);
      res.on("close", () => { if (!res.writableEnded) arc.abort(); });
      arc.on("error", (err: Error) => {
        req.log.error({ err }, "Archive stream error during C3PAO export");
        if (!res.writableEnded) res.end();
      });

      // ── Tracking state ───────────────────────────────────────────────────────
      const hashManifestRows: (string | number | null | undefined)[][] = [];
      const exportIssues: { category: string; item: string; detail: string; recommendation: string }[] = [];
      // Canonical ZIP paths: evidence ID → path in 05_Evidence_Library
      const evLibPaths = new Map<string, string>();
      // Canonical ZIP paths: evidence ID → path in 02_Import evidence_files
      const evImportPaths = new Map<string, string>();
      // Canonical ZIP paths: document ID → path in 04_Document_Library
      const docLibPaths = new Map<string, string>();
      // Track used filenames per folder to avoid collisions
      const usedNamesInFolder = new Map<string, Set<string>>();

      function uniqueNameInFolder(folder: string, preferred: string): string {
        if (!usedNamesInFolder.has(folder)) usedNamesInFolder.set(folder, new Set());
        const used = usedNamesInFolder.get(folder)!;
        if (!used.has(preferred)) { used.add(preferred); return preferred; }
        const lastDot = preferred.lastIndexOf(".");
        const base = lastDot >= 0 ? preferred.slice(0, lastDot) : preferred;
        const ext = lastDot >= 0 ? preferred.slice(lastDot) : "";
        let i = 1;
        while (used.has(`${base}_${String(i).padStart(2, "0")}${ext}`)) i++;
        const unique = `${base}_${String(i).padStart(2, "0")}${ext}`;
        if (i > 1) exportIssues.push({ category: "Duplicate Filename", item: preferred, detail: `Renamed to ${unique} in ${folder}`, recommendation: "No action needed" });
        used.add(unique);
        return unique;
      }

      function addEntry(zipPath: string, buf: Buffer): void {
        arc.append(buf, { name: zipPath });
        if (includeHashManifest) {
          hashManifestRows.push([zipPath, zipPath.split("/").pop() ?? "", buf.length, sha256hex(buf), exportTimestamp]);
        }
      }

      // ── Status summary for overview PDFs ─────────────────────────────────────
      const statusCounts = { implemented: 0, in_progress: 0, not_started: 0, not_applicable: 0, planned: 0 };
      for (const a of assessments) {
        if (a.status in statusCounts) (statusCounts as Record<string, number>)[a.status]++;
        else statusCounts.not_started++;
      }
      statusCounts.not_started += controls.length - assessments.length;

      const total = controls.length;
      const impl = statusCounts.implemented;
      const pct = total > 0 ? Math.round((impl / total) * 100) : 0;

      // ════════════════════════════════════════════════════════════════════════
      // SECTION 0: 00_START_HERE
      // ════════════════════════════════════════════════════════════════════════
      const readmePdf = await buildPdf((doc) => {
        doc.fontSize(22).font("Helvetica-Bold").text("C3PAO Evidence Export Package", { align: "center" });
        doc.fontSize(14).font("Helvetica").text(org.name, { align: "center" });
        doc.text(`Export Date: ${exportDate}`, { align: "center" });
        doc.moveDown(2);

        for (const [k, v] of [
          ["Organization", org.name], ["Export Date", exportDate],
          ["CMMC Target Level", "Level 2"], ["Total Controls", String(controls.length)],
          ["Overall Readiness", `${pct}% (${impl} of ${total} implemented)`],
          ["Evidence Items Included", String(evidence.length)],
          ["Documents Included", String(documents.length + docLikeEvidence.length)],
          ["POA&M Items", String(poams.length)], ["Monitoring Items", String(monitoring.length)],
          ["Generated By", `${user.name} (${user.email})`],
        ] as [string, string][]) {
          doc.font("Helvetica-Bold").text(`${k}: `, { continued: true }).font("Helvetica").text(v);
        }

        doc.moveDown(2);
        doc.fontSize(12).font("Helvetica-Bold").text("Package Structure");
        doc.moveDown(0.5).fontSize(10).font("Helvetica");
        const structure = [
          "00_START_HERE/  — This README, upload instructions, package index",
          "01_C3PAO_Review_Package/  — Human-readable browse format",
          "  01_Assessment_Overview/  — Executive and domain readiness reports",
          "  02_SSP/  — System Security Plan narrative and control mapping",
          "  03_Control_Packages/  — Per-control folders by domain (AC/, AT/, AU/, ...)",
          "    [CTRL_ID]__[Title]/Control_Summary.pdf, Evidence/, Documents/, Monitoring/, POAM/",
          "  04_Document_Library/  — All policies, procedures, and documentation",
          "  05_Evidence_Library/  — All unique evidence files by category",
          "  06_Monitoring/  — Operational monitoring tracker",
          "  07_POAM/  — Plan of Action & Milestones register",
          "  08_Reports/  — Gap analysis and compliance reports",
          "02_C3PAO_Import_Package/  — Upload-optimized flat structure with manifests",
          "  import_manifest.xlsx  — Master upload guide (sort by Control ID)",
          "  evidence_files/  — All unique evidence files (flat)",
          "  document_files/  — All unique document files (flat)",
          "  ssp_files/ / poam_files/ / monitoring_files/",
          "99_Manifests/  — Cross-reference maps, hash manifest, issues log",
        ];
        for (const s of structure) doc.text(s);

        doc.moveDown(2).fontSize(9).font("Helvetica-Oblique").text(
          "This export package is prepared to support C3PAO assessment review under CMMC Level 2. " +
          "Control HUB remains the authoritative source for metadata, mappings, and audit history. " +
          "Handle in accordance with your organisation's data handling policy."
        );
      });
      addEntry(`${root}00_START_HERE/README.pdf`, readmePdf);

      const uploadInstrPdf = await buildPdf((doc) => {
        doc.fontSize(20).font("Helvetica-Bold").text("C3PAO Upload Instructions", { align: "center" });
        doc.fontSize(12).font("Helvetica").text(org.name, { align: "center" });
        doc.text(`Export Date: ${exportDate}`, { align: "center" });
        doc.moveDown(2);

        doc.fontSize(13).font("Helvetica-Bold").text("How to Use This Package");
        doc.moveDown(0.5).fontSize(10).font("Helvetica");
        const steps = [
          "1. Open 02_C3PAO_Import_Package/import_manifest.xlsx — this is your master upload guide.",
          "2. Sort or filter by Control ID to find all evidence and documents for a specific control.",
          "3. Upload files from evidence_files/ and document_files/ into your assessment platform.",
          "4. Use 99_Manifests/Control_to_Evidence_Map.xlsx to verify all evidence is mapped correctly.",
          "5. Use 99_Manifests/Control_to_Document_Map.xlsx to verify policy/procedure coverage.",
          "6. Use 99_Manifests/File_Hash_Manifest.xlsx to verify file integrity (SHA-256).",
          "7. Use 99_Manifests/Export_Issues.xlsx to review any warnings or missing files.",
          "8. For human review, navigate 01_C3PAO_Review_Package/03_Control_Packages/ by domain folder.",
        ];
        for (const s of steps) { doc.text(s); doc.moveDown(0.3); }

        doc.moveDown(1).fontSize(13).font("Helvetica-Bold").text("Domain Folder Codes (03_Control_Packages/)");
        doc.moveDown(0.5).fontSize(9).font("Helvetica");
        const codes = [
          "AC — Access Control", "AT — Awareness and Training", "AU — Audit and Accountability",
          "CM — Configuration Management", "IA — Identification and Authentication", "IR — Incident Response",
          "MA — Maintenance", "MP — Media Protection", "PE — Physical Protection",
          "PS — Personnel Security", "RA — Risk Assessment", "CA — Security Assessment",
          "SC — System and Communications Protection", "SI — System and Information Integrity",
        ];
        for (const c of codes) doc.text(`  ${c}`);

        doc.moveDown(2).fontSize(9).font("Helvetica-Oblique").text("Generated by Control HUB — Confidential");
      });
      addEntry(`${root}00_START_HERE/C3PAO_Upload_Instructions.pdf`, uploadInstrPdf);

      addEntry(`${root}00_START_HERE/Package_Index.xlsx`, await buildXlsx(
        ["Folder", "Description", "Key Files"],
        [
          ["00_START_HERE/", "Navigation and instructions", "README.pdf, C3PAO_Upload_Instructions.pdf"],
          ["01_C3PAO_Review_Package/01_Assessment_Overview/", "Executive and domain readiness reports", "Executive_Readiness_Report.pdf, Domain_Readiness_Report.pdf"],
          ["01_C3PAO_Review_Package/02_SSP/", "System Security Plan", "System_Security_Plan.pdf, SSP_Control_Mapping.xlsx"],
          ["01_C3PAO_Review_Package/03_Control_Packages/", "Per-control evidence packages (by domain code)", "Control_Summary.pdf, Evidence/, Documents/, Monitoring/, POAM/"],
          ["01_C3PAO_Review_Package/04_Document_Library/", "All policies, procedures, and documents", "Policies/, Procedures/, Document_Inventory.xlsx"],
          ["01_C3PAO_Review_Package/05_Evidence_Library/", "All unique evidence files by category", "Screenshots/, Logs/, Evidence_Inventory.xlsx"],
          ["01_C3PAO_Review_Package/06_Monitoring/", "Operational monitoring tracker", "Monitoring_Tracker.xlsx"],
          ["01_C3PAO_Review_Package/07_POAM/", "Plan of Action & Milestones", "POAM_Register.xlsx, POAM_Report.pdf"],
          ["01_C3PAO_Review_Package/08_Reports/", "Gap analysis and compliance reports", "Gap_Analysis_Report.pdf"],
          ["02_C3PAO_Import_Package/", "Upload-optimized flat structure", "import_manifest.xlsx, evidence_files/, document_files/"],
          ["99_Manifests/", "Cross-reference maps and hash manifest", "Control_to_Evidence_Map.xlsx, File_Hash_Manifest.xlsx, Export_Issues.xlsx"],
        ]
      ));

      // ════════════════════════════════════════════════════════════════════════
      // SECTION 1: 01_Assessment_Overview
      // ════════════════════════════════════════════════════════════════════════
      const execPdf = await buildPdf((doc) => {
        doc.fontSize(20).font("Helvetica-Bold").text("Executive Readiness Report", { align: "center" });
        doc.fontSize(12).font("Helvetica").text(org.name, { align: "center" });
        doc.text(`Export Date: ${exportDate}`, { align: "center" });
        doc.moveDown(2);

        doc.fontSize(14).font("Helvetica-Bold").text("Control Implementation Summary");
        doc.moveDown(0.5).fontSize(11).font("Helvetica");
        doc.text(`Overall Readiness: ${pct}% (${impl} of ${total} controls implemented)`);
        doc.moveDown(0.5);
        for (const [label, count] of [
          ["Implemented", statusCounts.implemented], ["In Progress", statusCounts.in_progress],
          ["Planned", statusCounts.planned], ["Not Started", statusCounts.not_started],
          ["Not Applicable", statusCounts.not_applicable],
        ] as [string, number][]) {
          doc.text(`  ${label}: ${count}`);
        }

        doc.moveDown(1.5).fontSize(14).font("Helvetica-Bold").text("Evidence Summary");
        doc.moveDown(0.5).fontSize(11).font("Helvetica");
        doc.text(`Total Evidence Items: ${evidence.length}`);
        const byStatus = new Map<string, number>();
        for (const e of evidence) byStatus.set(e.status, (byStatus.get(e.status) ?? 0) + 1);
        for (const [status, cnt] of byStatus) doc.text(`  ${status.replace(/_/g, " ")}: ${cnt}`);

        doc.moveDown(1.5).fontSize(14).font("Helvetica-Bold").text("Domain Readiness Breakdown");
        doc.moveDown(0.5).fontSize(10).font("Helvetica");
        for (const [domainId, domainControls] of controlsByDomain) {
          const domain = domainMap.get(domainId);
          if (!domain) continue;
          const code = domainCode(domain.name);
          const domImpl = domainControls.filter((c) => assessmentMap.get(c.id)?.status === "implemented").length;
          const domPct = domainControls.length > 0 ? Math.round((domImpl / domainControls.length) * 100) : 0;
          doc.text(`${code} — ${domain.name}: ${domPct}% (${domImpl}/${domainControls.length})`);
        }
        doc.moveDown(2).fontSize(9).font("Helvetica-Oblique").text("Generated by Control HUB — Confidential");
      });
      addEntry(`${rev}01_Assessment_Overview/${orgName}_Executive_Readiness_Report.pdf`, execPdf);

      const domainPdf = await buildPdf((doc) => {
        doc.fontSize(20).font("Helvetica-Bold").text("Domain Readiness Report", { align: "center" });
        doc.fontSize(12).font("Helvetica").text(org.name, { align: "center" });
        doc.text(`Export Date: ${exportDate}`, { align: "center" });
        doc.moveDown(2);

        for (const [domainId, domainControls] of controlsByDomain) {
          const domain = domainMap.get(domainId);
          if (!domain) continue;
          const code = domainCode(domain.name);
          doc.fontSize(13).font("Helvetica-Bold").text(`${code} — ${domain.name}`);
          doc.moveDown(0.3).fontSize(9).font("Helvetica");
          for (const ctrl of domainControls) {
            const assessment = assessmentMap.get(ctrl.id);
            const evCount = (controlToEvidence.get(ctrl.id) ?? []).length;
            const status = assessment?.status ?? "not_started";
            doc.text(`  ${ctrl.controlId}: ${ctrl.title} — ${status.replace(/_/g, " ")} (${evCount} evidence)`);
          }
          doc.moveDown(1);
        }
        doc.fontSize(9).font("Helvetica-Oblique").text("Generated by Control HUB — Confidential");
      });
      addEntry(`${rev}01_Assessment_Overview/${orgName}_Domain_Readiness_Report.pdf`, domainPdf);

      // ════════════════════════════════════════════════════════════════════════
      // SECTION 2: 02_SSP
      // ════════════════════════════════════════════════════════════════════════
      const sspPdf = await buildPdf((doc) => {
        doc.fontSize(20).font("Helvetica-Bold").text("System Security Plan", { align: "center" });
        doc.fontSize(12).font("Helvetica").text(org.name, { align: "center" });
        doc.text(`Export Date: ${exportDate}`, { align: "center" });
        doc.moveDown(2);

        doc.fontSize(11).font("Helvetica").text(
          `This System Security Plan summarises implementation narratives for all ${controls.length} CMMC Level 2 controls ` +
          `for ${org.name}. Controls with no recorded narrative are omitted.`
        );
        doc.moveDown(1.5);

        for (const ctrl of controls) {
          const mapping = sspMap.get(ctrl.id) ?? sspMap.get(ctrl.controlId);
          const assessment = assessmentMap.get(ctrl.id);
          const narrative = mapping?.implementationNarrative || assessment?.implementationNarrative || "";
          if (!narrative) continue;
          doc.fontSize(11).font("Helvetica-Bold").text(`${ctrl.controlId} — ${ctrl.title}`);
          doc.moveDown(0.2).fontSize(9).font("Helvetica").text(narrative);
          doc.moveDown(1);
        }
        doc.fontSize(9).font("Helvetica-Oblique").text("Generated by Control HUB — Confidential");
      });
      addEntry(`${rev}02_SSP/${orgName}_System_Security_Plan.pdf`, sspPdf);

      addEntry(`${rev}02_SSP/SSP_Control_Mapping.xlsx`, await buildXlsx(
        ["Control ID", "Control Title", "Domain", "Domain Code", "Level", "Control Status", "SSP Narrative", "Policy Reference", "SSP Status"],
        controls.map((ctrl) => {
          const domain = domainMap.get(ctrl.domainId);
          const assessment = assessmentMap.get(ctrl.id);
          const mapping = sspMap.get(ctrl.id) ?? sspMap.get(ctrl.controlId);
          return [
            ctrl.controlId, ctrl.title, domain?.name ?? "", domain ? domainCode(domain.name) : "",
            ctrl.level, assessment?.status?.replace(/_/g, " ") ?? "not started",
            mapping?.implementationNarrative ?? assessment?.implementationNarrative ?? "",
            mapping?.policyReference ?? "", mapping?.sspStatus ?? "",
          ];
        })
      ));

      // ════════════════════════════════════════════════════════════════════════
      // SECTION 3: 03_Control_Packages  (one folder per control, by domain code)
      // ════════════════════════════════════════════════════════════════════════
      for (const [domainId, domainControls] of controlsByDomain) {
        const domain = domainMap.get(domainId);
        if (!domain) continue;
        const code = domainCode(domain.name);

        for (const ctrl of domainControls) {
          const assessment = assessmentMap.get(ctrl.id);
          const mapping = sspMap.get(ctrl.id) ?? sspMap.get(ctrl.controlId);
          const ctrlEvidence = (controlToEvidence.get(ctrl.id) ?? []).map((id) => evidenceMap.get(id)).filter(Boolean) as typeof evidence;
          const ctrlDocs = (controlToDocs.get(ctrl.id) ?? []).map((id) => docMap.get(id)).filter(Boolean) as typeof documents;
          const ctrlPoams = controlToPoams.get(ctrl.id) ?? [];
          const ctrlMonitoring = controlRefToMonitoring.get(ctrl.controlId) ?? [];
          const ctrlFolder = `${rev}03_Control_Packages/${code}/${ctrlFolderName(ctrl)}/`;

          const implNarrative = assessment?.implementationNarrative ?? "(No implementation narrative recorded)";
          const sspNarrative = mapping?.implementationNarrative ?? assessment?.implementationNarrative ?? "(No SSP narrative recorded)";

          addEntry(`${ctrlFolder}Implementation_Narrative.txt`, Buffer.from(implNarrative, "utf8"));
          addEntry(`${ctrlFolder}SSP_Narrative.txt`, Buffer.from(sspNarrative, "utf8"));

          // Control_Summary.pdf — comprehensive
          const summaryPdf = await buildPdf((doc) => {
            doc.fontSize(16).font("Helvetica-Bold").text(`Control Package: ${ctrl.controlId}`);
            doc.fontSize(12).font("Helvetica").text(ctrl.title);
            doc.moveDown(0.5).fontSize(10);
            doc.text(`Domain: ${domain.name} (${code})`);
            doc.text(`Level: ${ctrl.level}`);
            doc.text(`Status: ${assessment?.status?.replace(/_/g, " ") ?? "not started"}`);
            if (ctrl.nistRef) doc.text(`NIST SP 800-171 Ref: ${ctrl.nistRef}`);
            doc.text(`Last Assessed: ${fmtD(assessment?.lastAssessedAt)}`);
            doc.text(`Export Date: ${exportDate}`);
            if (assessment?.isNotApplicable) doc.text(`Not Applicable: Yes — ${assessment.naJustification ?? ""}`);

            doc.moveDown(1).font("Helvetica-Bold").text("Control Description:");
            doc.font("Helvetica").fontSize(9).text(ctrl.description ?? "(none)");

            doc.moveDown(1).font("Helvetica-Bold").fontSize(10).text("Implementation Narrative:");
            doc.font("Helvetica").fontSize(9).text(implNarrative);

            doc.moveDown(1).font("Helvetica-Bold").fontSize(10).text("SSP Narrative:");
            doc.font("Helvetica").fontSize(9).text(sspNarrative);

            if (assessment?.assessorNotes) {
              doc.moveDown(1).font("Helvetica-Bold").fontSize(10).text("Assessor Notes:");
              doc.font("Helvetica").fontSize(9).text(assessment.assessorNotes);
            }

            doc.moveDown(1).font("Helvetica-Bold").fontSize(10).text(`Linked Evidence (${ctrlEvidence.length} items):`);
            doc.font("Helvetica").fontSize(9);
            if (ctrlEvidence.length === 0) {
              doc.text("  No evidence linked to this control.");
            } else {
              for (const e of ctrlEvidence) {
                doc.text(`  • ${e.title} [${e.evidenceType.replace(/_/g, " ")}] — ${e.status.replace(/_/g, " ")} — collected ${fmtD(e.collectedAt)}`);
                doc.text(`    File: Evidence/${ctrlEvidenceFilename(e.evidenceType, e.title, e.collectedAt, e.fileName)}`);
              }
            }

            doc.moveDown(1).font("Helvetica-Bold").fontSize(10).text(`Linked Documents (${ctrlDocs.length}):`);
            doc.font("Helvetica").fontSize(9);
            if (ctrlDocs.length === 0) {
              doc.text("  No documents linked to this control.");
            } else {
              for (const d of ctrlDocs) {
                doc.text(`  • ${d.title} [${d.docType ?? "—"}] — ${d.status}`);
              }
            }

            doc.moveDown(1).font("Helvetica-Bold").fontSize(10).text(`Monitoring Records (${ctrlMonitoring.length}):`);
            doc.font("Helvetica").fontSize(9);
            if (ctrlMonitoring.length === 0) {
              doc.text("  No monitoring records for this control.");
            } else {
              for (const m of ctrlMonitoring) {
                doc.text(`  • ${m.task} [${m.frequency}] — ${m.status} — next due: ${fmtD(m.nextDue)}`);
              }
            }

            doc.moveDown(1).font("Helvetica-Bold").fontSize(10).text(`POA&M Items (${ctrlPoams.length}):`);
            doc.font("Helvetica").fontSize(9);
            if (ctrlPoams.length === 0) {
              doc.text("  No POA&M items for this control.");
            } else {
              for (const p of ctrlPoams) {
                doc.text(`  • ${p.poamNumber ?? p.id.slice(0, 8)}: ${p.title} — ${p.status} — ${p.riskLevel} risk — due ${fmtD(p.scheduledCompletionDate)}`);
              }
            }

            doc.moveDown(2).fontSize(8).font("Helvetica-Oblique").text(
              "Files listed in Evidence/ and Documents/ are included in this control folder and indexed in 99_Manifests/. " +
              "Generated by Control HUB — Confidential"
            );
          });
          addEntry(`${ctrlFolder}Control_Summary.pdf`, summaryPdf);

          // Evidence/ subfolder
          if (ctrlEvidence.length === 0) {
            addEntry(`${ctrlFolder}Evidence/README.txt`, Buffer.from(`No evidence linked to control ${ctrl.controlId} as of export date ${exportDate}.`, "utf8"));
          } else {
            const evidenceIndexLines: string[] = [`Evidence files for ${ctrl.controlId} — ${ctrl.title}`, `Exported: ${exportDate}`, ""];
            for (const ev of ctrlEvidence) {
              const buf = cachedFile(ev.fileKey);
              const fname = uniqueNameInFolder(`${ctrlFolder}Evidence`, ctrlEvidenceFilename(ev.evidenceType, ev.title, ev.collectedAt, ev.fileName));
              if (buf) {
                addEntry(`${ctrlFolder}Evidence/${fname}`, buf);
                evidenceIndexLines.push(`${fname}  —  ${ev.title} [${ev.evidenceType}] ${ev.status}`);
              } else {
                evidenceIndexLines.push(`MISSING: ${fname}  —  ${ev.title} (file not found in storage)`);
                if (ev.fileKey) {
                  exportIssues.push({ category: "Missing File", item: ev.title, detail: `fileKey: ${ev.fileKey}`, recommendation: "Re-upload evidence file" });
                }
              }
            }
            addEntry(`${ctrlFolder}Evidence/Evidence_Index.txt`, Buffer.from(evidenceIndexLines.join("\n"), "utf8"));
          }

          // Documents/ subfolder
          if (ctrlDocs.length === 0) {
            addEntry(`${ctrlFolder}Documents/README.txt`, Buffer.from(`No documents linked to control ${ctrl.controlId} as of export date ${exportDate}.`, "utf8"));
          } else {
            for (const d of ctrlDocs) {
              if (!d.fileKey) continue;
              const buf = cachedFile(d.fileKey);
              const fname = uniqueNameInFolder(`${ctrlFolder}Documents`, docFilename(d.docType, d.title, d.id, d.fileName));
              if (buf) addEntry(`${ctrlFolder}Documents/${fname}`, buf);
            }
          }

          // Monitoring/ subfolder
          if (ctrlMonitoring.length === 0) {
            addEntry(`${ctrlFolder}Monitoring/README.txt`, Buffer.from(`No monitoring records linked to control ${ctrl.controlId} as of export date ${exportDate}.`, "utf8"));
          } else {
            const lines = [`Monitoring Records for ${ctrl.controlId}`, `Exported: ${exportDate}`, ""];
            for (const m of ctrlMonitoring) {
              lines.push(`Task: ${m.task}`);
              lines.push(`Frequency: ${m.frequency}`);
              lines.push(`Status: ${m.status}`);
              lines.push(`Last Completed: ${fmtD(m.lastCompleted)}`);
              lines.push(`Next Due: ${fmtD(m.nextDue)}`);
              if (m.description) lines.push(`Description: ${m.description}`);
              if (m.operatingProcedure) lines.push(`Operating Procedure: ${m.operatingProcedure}`);
              if (m.testProcedure) lines.push(`Test Procedure: ${m.testProcedure}`);
              if (m.evidenceToRetain) lines.push(`Evidence to Retain: ${m.evidenceToRetain}`);
              if (m.notes) lines.push(`Notes: ${m.notes}`);
              lines.push("");
            }
            addEntry(`${ctrlFolder}Monitoring/Monitoring_Records.txt`, Buffer.from(lines.join("\n"), "utf8"));
          }

          // POAM/ subfolder
          if (ctrlPoams.length === 0) {
            addEntry(`${ctrlFolder}POAM/README.txt`, Buffer.from(`No POA&M items linked to control ${ctrl.controlId} as of export date ${exportDate}.`, "utf8"));
          } else {
            const lines = [`POA&M Items for ${ctrl.controlId}`, `Exported: ${exportDate}`, ""];
            for (const p of ctrlPoams) {
              lines.push(`POAM Number: ${p.poamNumber ?? "—"}`);
              lines.push(`Title: ${p.title}`);
              lines.push(`Status: ${p.status}`);
              lines.push(`Risk Level: ${p.riskLevel}`);
              lines.push(`Scheduled Completion: ${fmtD(p.scheduledCompletionDate)}`);
              if (p.deficiencyDescription) lines.push(`Deficiency: ${p.deficiencyDescription}`);
              if (p.remediationPlan) lines.push(`Remediation Plan: ${p.remediationPlan}`);
              lines.push("");
            }
            addEntry(`${ctrlFolder}POAM/POAM_Items.txt`, Buffer.from(lines.join("\n"), "utf8"));
          }
        }
      }

      // ════════════════════════════════════════════════════════════════════════
      // SECTION 4: 04_Document_Library
      // Sources: (A) documentsTable, (B) doc-like evidence
      // ════════════════════════════════════════════════════════════════════════
      const docLibBase = `${rev}04_Document_Library/`;

      // (A) Documents from documentsTable
      for (const d of documents) {
        const subfolder = docTypeToLibFolder(d.docType);
        if (!d.fileKey) {
          // No file — still track in inventory but note missing
          if (d.docType) {
            exportIssues.push({ category: "Document Without File", item: d.title, detail: `Type: ${d.docType}, Status: ${d.status}`, recommendation: "Upload file to document record" });
          }
          continue;
        }
        const buf = cachedFile(d.fileKey);
        const fname = uniqueNameInFolder(`${docLibBase}${subfolder}`, docFilename(d.docType, d.title, d.id, d.fileName));
        const zipPath = `${docLibBase}${subfolder}/${fname}`;
        if (buf) {
          docLibPaths.set(d.id, zipPath);
          addEntry(zipPath, buf);
        } else {
          exportIssues.push({ category: "Missing File", item: d.title, detail: `fileKey: ${d.fileKey}`, recommendation: "Re-upload document file" });
        }
      }

      // (B) Doc-like evidence (also placed in Document Library)
      const docLikeEvidenceLibPaths = new Map<string, string>(); // ev.id → doc lib path
      for (const ev of docLikeEvidence) {
        if (!ev.fileKey) continue;
        const buf = cachedFile(ev.fileKey);
        const subfolder = evidenceToDocLibFolder(ev.evidenceType);
        const fname = uniqueNameInFolder(`${docLibBase}${subfolder}`, evidenceFilename(ev.evidenceType, ev.title, ev.collectedAt, ev.id, ev.fileName));
        const zipPath = `${docLibBase}${subfolder}/${fname}`;
        if (buf) {
          docLikeEvidenceLibPaths.set(ev.id, zipPath);
          addEntry(zipPath, buf);
        }
      }

      // Document_Inventory.xlsx (all sources combined)
      const docInvRows: (string | number | null | undefined)[][] = [];
      for (const d of documents) {
        const linkedCids = docToControls.get(d.id) ?? [];
        const ctrlIds = linkedCids.map((cid) => controlMap.get(cid)?.controlId ?? cid).join("; ");
        const firstLinkedCtrl = linkedCids.length > 0 ? controlMap.get(linkedCids[0]) : null;
        const firstLinkedDom = firstLinkedCtrl ? domainMap.get(firstLinkedCtrl.domainId) : null;
        const domain = firstLinkedDom ? `${domainCode(firstLinkedDom.name)} — ${firstLinkedDom.name}` : "—";
        const level = firstLinkedCtrl?.level ?? "—";
        docInvRows.push([
          d.id, d.title, d.docType ?? "—", d.status, "Uploaded Document",
          ctrlIds, domain, level, d.ownerId ?? "", fmtD(d.effectiveDate),
          fmtD(d.nextReviewDate), d.fileName ?? "—",
          docLibPaths.get(d.id) ? (docLibPaths.get(d.id)!.split("/").pop() ?? "—") : "—",
          docLibPaths.get(d.id) ?? (d.fileKey ? "missing from storage" : "no file"),
          "", "",
        ]);
      }
      for (const ev of docLikeEvidence) {
        const ctrlIds = (evidenceToControls.get(ev.id) ?? []).map((cid) => controlMap.get(cid)?.controlId ?? cid).join("; ");
        const domain = (() => {
          const cids = evidenceToControls.get(ev.id) ?? [];
          if (cids.length === 0) return "—";
          const ctrl = controlMap.get(cids[0]);
          if (!ctrl) return "—";
          const dom = domainMap.get(ctrl.domainId);
          return dom ? `${domainCode(dom.name)} — ${dom.name}` : "—";
        })();
        docInvRows.push([
          ev.id, ev.title, ev.evidenceType.replace(/_/g, " "), ev.status, "Document-Like Evidence",
          ctrlIds, domain, "—", ev.ownerId ?? "", fmtD(ev.collectedAt),
          fmtD(ev.expiresAt), ev.fileName ?? "—",
          docLikeEvidenceLibPaths.get(ev.id) ? (docLikeEvidenceLibPaths.get(ev.id)!.split("/").pop() ?? "—") : "—",
          docLikeEvidenceLibPaths.get(ev.id) ?? (ev.fileKey ? "missing from storage" : "no file"),
          "", "Also included in Evidence Library",
        ]);
      }
      // Note any missing-file warnings
      if (docInvRows.length === 0) {
        exportIssues.push({ category: "Empty Document Library", item: "Document Library", detail: "No documents or document-like evidence found", recommendation: "Upload policies/procedures as evidence or documents" });
      }

      addEntry(`${docLibBase}Document_Inventory.xlsx`, await buildXlsx(
        ["Document ID", "Title", "Document Type", "Status", "Source", "Linked Controls", "Domain", "Level", "Owner", "Effective Date", "Next Review Date", "Original Filename", "Exported Filename", "File Path in ZIP", "SHA-256", "Notes"],
        docInvRows
      ));

      // ════════════════════════════════════════════════════════════════════════
      // SECTION 5: 05_Evidence_Library  — ALL unique evidence files, by category
      // ════════════════════════════════════════════════════════════════════════
      const evLibBase = `${rev}05_Evidence_Library/`;

      for (const ev of evidence) {
        if (!ev.fileKey) {
          exportIssues.push({ category: "Evidence Without File", item: ev.title, detail: `Type: ${ev.evidenceType}, Status: ${ev.status}`, recommendation: "Evidence has no attached file" });
          continue;
        }
        const buf = cachedFile(ev.fileKey);
        const subfolder = evidenceToLibFolder(ev.evidenceType);
        const fname = uniqueNameInFolder(`${evLibBase}${subfolder}`, evidenceFilename(ev.evidenceType, ev.title, ev.collectedAt, ev.id, ev.fileName));
        const zipPath = `${evLibBase}${subfolder}/${fname}`;
        if (buf) {
          evLibPaths.set(ev.id, zipPath);
          addEntry(zipPath, buf);
        } else {
          exportIssues.push({ category: "Missing File", item: ev.title, detail: `fileKey: ${ev.fileKey}`, recommendation: "File missing from GCS storage" });
        }
        // Check if evidence has no linked controls
        if ((evidenceToControls.get(ev.id) ?? []).length === 0) {
          exportIssues.push({ category: "Unlinked Evidence", item: ev.title, detail: `Evidence ID: ${ev.id}`, recommendation: "Link this evidence to at least one control" });
        }
      }

      // Evidence_Inventory.xlsx
      addEntry(`${evLibBase}Evidence_Inventory.xlsx`, await buildXlsx(
        ["Evidence ID", "Title", "Evidence Type", "Status", "Linked Controls", "Collection Date", "Expiration Date", "Owner", "Assessor Summary", ...(includeInternalNotes ? ["Internal Notes"] : []), "Original Filename", "File Path in ZIP", "Is Document-Like"],
        evidence.map((ev) => {
          const ctrlIds = (evidenceToControls.get(ev.id) ?? []).map((cid) => controlMap.get(cid)?.controlId ?? cid).join("; ");
          return [
            ev.id, ev.title, ev.evidenceType.replace(/_/g, " "), ev.status.replace(/_/g, " "),
            ctrlIds, fmtD(ev.collectedAt), fmtD(ev.expiresAt), ev.ownerId ?? "—",
            ev.assessorSummary ?? "",
            ...(includeInternalNotes ? [ev.internalNotes ?? ""] : []),
            ev.fileName ?? "—", evLibPaths.get(ev.id) ?? (ev.fileKey ? "missing from storage" : "no file"),
            DOC_LIKE_EVIDENCE_TYPES.has(ev.evidenceType) ? "Yes" : "No",
          ];
        })
      ));

      // ════════════════════════════════════════════════════════════════════════
      // SECTION 6: 06_Monitoring
      // ════════════════════════════════════════════════════════════════════════
      addEntry(`${rev}06_Monitoring/Monitoring_Tracker.xlsx`, await buildXlsx(
        ["Task", "Control Ref", "Frequency", "Status", "Description", "Last Completed", "Next Due", "Operating Procedure", "Test Procedure", "Evidence to Retain", "Notes", "Validation Status", "Review Date"],
        monitoring.map((m) => [
          m.task,           // ← fixed: was m.title (field doesn't exist)
          m.controlRef,
          m.frequency,
          m.status,
          m.description,
          fmtD(m.lastCompleted),
          fmtD(m.nextDue),
          m.operatingProcedure ?? "",
          m.testProcedure ?? "",
          m.evidenceToRetain ?? "",
          m.notes ?? "",
          m.validationStatus ?? "",
          fmtD(m.reviewDate),
        ])
      ));

      const monPdf = await buildPdf((doc) => {
        doc.fontSize(18).font("Helvetica-Bold").text("Monitoring Tracker Report", { align: "center" });
        doc.fontSize(11).font("Helvetica").text(org.name, { align: "center" });
        doc.text(`Export Date: ${exportDate}`, { align: "center" });
        doc.moveDown(2);

        const overdue = monitoring.filter((m) => m.status === "escalated" || m.status === "failed_validation").length;
        const current = monitoring.filter((m) => m.status === "current").length;
        doc.text(`Total: ${monitoring.length}  |  Current: ${current}  |  Escalated/Failed: ${overdue}`);
        doc.moveDown(1);

        for (const m of monitoring) {
          doc.font("Helvetica-Bold").fontSize(10).text(m.task);
          doc.font("Helvetica").fontSize(9).text(
            `  Control: ${m.controlRef}  |  Frequency: ${m.frequency}  |  Status: ${m.status}  |  Last: ${fmtD(m.lastCompleted)}  |  Next: ${fmtD(m.nextDue)}`
          );
          if (m.description) doc.fontSize(8).text(`  ${m.description}`);
          doc.moveDown(0.5);
        }
        doc.fontSize(9).font("Helvetica-Oblique").text("Generated by Control HUB — Confidential");
      });
      addEntry(`${rev}06_Monitoring/Monitoring_Tracker_Report.pdf`, monPdf);

      // ════════════════════════════════════════════════════════════════════════
      // SECTION 7: 07_POAM
      // ════════════════════════════════════════════════════════════════════════
      const poamXlsx = await buildXlsx(
        ["POAM Number", "Title", "Deficiency Description", "Status", "Risk Level", "Linked Control", "Domain", "Scheduled Completion", "Completed Date", "Remediation Plan", "Resources Required", "Notes"],
        poams.map((p) => {
          const linkedCtrl = p.linkedControlId ? controlMap.get(p.linkedControlId) : null;
          const domain = linkedCtrl ? domainMap.get(linkedCtrl.domainId) : null;
          return [
            p.poamNumber ?? "—", p.title, p.deficiencyDescription, p.status, p.riskLevel,
            linkedCtrl?.controlId ?? "—",
            domain ? `${domainCode(domain.name)} — ${domain.name}` : "—",
            fmtD(p.scheduledCompletionDate), fmtD(p.completedDate),
            p.remediationPlan ?? "", p.resourcesRequired ?? "", "",
          ];
        })
      );
      addEntry(`${rev}07_POAM/POAM_Register.xlsx`, poamXlsx);

      // Unmapped POA&Ms
      if (unmappedPoams.length > 0) {
        addEntry(`${rev}07_POAM/Unmapped_POAM/README.txt`, Buffer.from(
          `${unmappedPoams.length} POA&M item(s) have no linked control.\n\nItems:\n${unmappedPoams.map((p) => `- ${p.poamNumber ?? p.id.slice(0, 8)}: ${p.title}`).join("\n")}`,
          "utf8"
        ));
        for (const p of unmappedPoams) {
          exportIssues.push({ category: "Unmapped POA&M", item: `${p.poamNumber ?? p.id.slice(0, 8)}: ${p.title}`, detail: "No linked control", recommendation: "Link this POA&M to a CMMC control" });
        }
      }

      const poamPdf = await buildPdf((doc) => {
        doc.fontSize(18).font("Helvetica-Bold").text("Plan of Action & Milestones (POA&M) Report", { align: "center" });
        doc.fontSize(11).font("Helvetica").text(org.name, { align: "center" });
        doc.text(`Export Date: ${exportDate}`, { align: "center" });
        doc.moveDown(2);

        const openPoams = poams.filter((p) => p.status === "open" || p.status === "in_progress").length;
        doc.text(`Total POA&M Items: ${poams.length}  |  Open/In Progress: ${openPoams}  |  Unmapped: ${unmappedPoams.length}`);
        doc.moveDown(1);

        for (const p of poams) {
          const linkedCtrl = p.linkedControlId ? controlMap.get(p.linkedControlId) : null;
          doc.font("Helvetica-Bold").fontSize(11).text(`${p.poamNumber ?? "POAM"}: ${p.title}`);
          doc.font("Helvetica").fontSize(9);
          doc.text(`  Control: ${linkedCtrl?.controlId ?? "UNMAPPED"}  |  Status: ${p.status}  |  Risk: ${p.riskLevel}`);
          doc.text(`  Scheduled Completion: ${fmtD(p.scheduledCompletionDate)}`);
          doc.moveDown(0.3);
          doc.text(`  Deficiency: ${p.deficiencyDescription}`);
          if (p.remediationPlan) doc.text(`  Remediation: ${p.remediationPlan}`);
          doc.moveDown(0.8);
        }
        doc.fontSize(9).font("Helvetica-Oblique").text("Generated by Control HUB — Confidential");
      });
      addEntry(`${rev}07_POAM/POAM_Report.pdf`, poamPdf);

      // ════════════════════════════════════════════════════════════════════════
      // SECTION 8: 08_Reports
      // ════════════════════════════════════════════════════════════════════════
      addEntry(`${rev}08_Reports/Executive_Readiness_Report.pdf`, execPdf);
      addEntry(`${rev}08_Reports/Domain_Readiness_Report.pdf`, domainPdf);

      const gapPdf = await buildPdf((doc) => {
        doc.fontSize(18).font("Helvetica-Bold").text("Gap Analysis Report", { align: "center" });
        doc.fontSize(11).font("Helvetica").text(org.name, { align: "center" });
        doc.text(`Export Date: ${exportDate}`, { align: "center" });
        doc.moveDown(2);

        const gaps = controls.filter((c) => {
          const a = assessmentMap.get(c.id);
          return (!a || a.status === "not_started") && (controlToEvidence.get(c.id) ?? []).length === 0;
        });
        doc.text(`Controls with no evidence and not assessed: ${gaps.length} of ${controls.length}`);
        doc.moveDown(1);

        for (const c of gaps) {
          const domain = domainMap.get(c.domainId);
          doc.font("Helvetica-Bold").fontSize(10).text(`${c.controlId}: ${c.title}`);
          doc.font("Helvetica").fontSize(9).text(`  Domain: ${domain ? `${domainCode(domain.name)} — ${domain.name}` : "—"}  |  Level: ${c.level}`);
          doc.moveDown(0.5);
        }
        doc.fontSize(9).font("Helvetica-Oblique").text("Generated by Control HUB — Confidential");
      });
      addEntry(`${rev}08_Reports/Gap_Analysis_Report.pdf`, gapPdf);

      // ════════════════════════════════════════════════════════════════════════
      // SECTION 9: 02_C3PAO_Import_Package  — flat files + master manifest
      // Each unique GCS file stored ONCE; manifests show all control mappings
      // ════════════════════════════════════════════════════════════════════════
      const importManifestRows: (string | number | null | undefined)[][] = [];

      // Import evidence_files/ (unique by evidence ID — one per evidence item)
      for (const ev of evidence) {
        if (!ev.fileKey) continue;
        const buf = cachedFile(ev.fileKey);
        const fname = evidenceFilename(ev.evidenceType, ev.title, ev.collectedAt, ev.id, ev.fileName);
        const zipPath = `${imp}evidence_files/${fname}`;
        if (buf) {
          evImportPaths.set(ev.id, zipPath);
          addEntry(zipPath, buf);
        }
        const ctrlIds = (evidenceToControls.get(ev.id) ?? []).map((cid) => controlMap.get(cid)?.controlId ?? cid).join("; ");
        const linkedCtrlId = (evidenceToControls.get(ev.id) ?? [])[0];
        const linkedCtrl = linkedCtrlId ? controlMap.get(linkedCtrlId) : null;
        const domain = linkedCtrl ? domainMap.get(linkedCtrl.domainId) : null;
        importManifestRows.push([
          "Evidence", ctrlIds, linkedCtrl?.title ?? "—",
          domain ? domainCode(domain.name) : "—", linkedCtrl?.level ?? "—",
          ev.title, ev.evidenceType.replace(/_/g, " "), ev.status.replace(/_/g, " "),
          ev.fileName ?? "—", fname,
          buf ? `evidence_files/${fname}` : "MISSING",
          `${imp}evidence_files/${fname}`,
          "Evidence", ev.ownerId ?? "", fmtD(ev.collectedAt), fmtD(ev.expiresAt), "", suggestC3paoCategory(ev.evidenceType),
        ]);
      }

      // Import document_files/ (unique by document ID)
      for (const d of documents) {
        if (!d.fileKey) continue;
        const buf = cachedFile(d.fileKey);
        const fname = docFilename(d.docType, d.title, d.id, d.fileName);
        const zipPath = `${imp}document_files/${fname}`;
        if (buf) addEntry(zipPath, buf);
        const ctrlIds = (docToControls.get(d.id) ?? []).map((cid) => controlMap.get(cid)?.controlId ?? cid).join("; ");
        const linkedCtrlId = (docToControls.get(d.id) ?? [])[0];
        const linkedCtrl = linkedCtrlId ? controlMap.get(linkedCtrlId) : null;
        const domain = linkedCtrl ? domainMap.get(linkedCtrl.domainId) : null;
        importManifestRows.push([
          "Document", ctrlIds, linkedCtrl?.title ?? "—",
          domain ? domainCode(domain.name) : "—", linkedCtrl?.level ?? "—",
          d.title, d.docType ?? "—", d.status,
          d.fileName ?? "—", fname,
          buf ? `document_files/${fname}` : "MISSING",
          `${imp}document_files/${fname}`,
          "Documentation", d.ownerId ?? "", fmtD(d.effectiveDate), fmtD(d.nextReviewDate), "", suggestC3paoDocCategory(d.docType),
        ]);
      }

      // Import ssp_files/
      addEntry(`${imp}ssp_files/SSP_Control_Mapping.xlsx`, await buildXlsx(
        ["Control ID", "Control Title", "Domain", "Level", "Status", "SSP Narrative", "Policy Reference"],
        controls.map((c) => {
          const domain = domainMap.get(c.domainId);
          const assessment = assessmentMap.get(c.id);
          const mapping = sspMap.get(c.id) ?? sspMap.get(c.controlId);
          return [c.controlId, c.title, domain ? domainCode(domain.name) : "", c.level,
            assessment?.status?.replace(/_/g, " ") ?? "not started",
            mapping?.implementationNarrative ?? assessment?.implementationNarrative ?? "",
            mapping?.policyReference ?? ""];
        })
      ));
      importManifestRows.push(["SSP", "All Controls", "System Security Plan", "—", "L2", "SSP Control Mapping", "SSP Export", "active", "—", "SSP_Control_Mapping.xlsx", "ssp_files/SSP_Control_Mapping.xlsx", `${imp}ssp_files/SSP_Control_Mapping.xlsx`, "SSP", "", exportDate, "", "", "SSP"]);

      // Import poam_files/
      addEntry(`${imp}poam_files/POAM_Register.xlsx`, poamXlsx);
      importManifestRows.push(["POA&M", "Various", "POA&M Register", "—", "L2", "POAM Register", "POA&M", "active", "—", "POAM_Register.xlsx", "poam_files/POAM_Register.xlsx", `${imp}poam_files/POAM_Register.xlsx`, "POA&M", "", exportDate, "", "", "POA&M"]);

      // Import monitoring_files/
      addEntry(`${imp}monitoring_files/Monitoring_Tracker.xlsx`, await buildXlsx(
        ["Task", "Control Ref", "Frequency", "Status", "Last Completed", "Next Due", "Description"],
        monitoring.map((m) => [m.task, m.controlRef, m.frequency, m.status, fmtD(m.lastCompleted), fmtD(m.nextDue), m.description])
      ));
      importManifestRows.push(["Monitoring", "Various", "Monitoring Tracker", "—", "L2", "Monitoring Tracker", "Monitoring", "active", "—", "Monitoring_Tracker.xlsx", "monitoring_files/Monitoring_Tracker.xlsx", `${imp}monitoring_files/Monitoring_Tracker.xlsx`, "Monitoring", "", exportDate, "", "", "Monitoring Record"]);

      // import_manifest.xlsx — master upload guide
      addEntry(`${imp}import_manifest.xlsx`, await buildXlsx(
        ["Record Type", "Control ID", "Control Title", "Domain", "Level", "Artifact Title", "Artifact Type", "Artifact Status", "Original Filename", "Exported Filename", "Folder Path", "Full ZIP Path", "Source Module", "Owner", "Collection Date", "Review Date", "Notes", "Suggested C3PAO Upload Category"],
        importManifestRows
      ));

      // ════════════════════════════════════════════════════════════════════════
      // SECTION 10: 99_Manifests
      // ════════════════════════════════════════════════════════════════════════

      // Control_to_Evidence_Map.xlsx
      const ctrlEvRows: (string | number | null | undefined)[][] = [];
      for (const c of controls) {
        const domain = domainMap.get(c.domainId);
        const assessment = assessmentMap.get(c.id);
        const ctrlEvidence = (controlToEvidence.get(c.id) ?? []).map((id) => evidenceMap.get(id)).filter(Boolean) as typeof evidence;
        if (ctrlEvidence.length === 0) {
          ctrlEvRows.push([c.controlId, c.title, domain ? `${domainCode(domain.name)} — ${domain.name}` : "—", c.level, assessment?.status?.replace(/_/g, " ") ?? "not started", "—", "—", "—", "—", "—", "—"]);
        } else {
          for (const ev of ctrlEvidence) {
            ctrlEvRows.push([c.controlId, c.title, domain ? `${domainCode(domain.name)} — ${domain.name}` : "—", c.level,
              assessment?.status?.replace(/_/g, " ") ?? "not started",
              ev.title, ev.evidenceType.replace(/_/g, " "), ev.status.replace(/_/g, " "),
              fmtD(ev.collectedAt), evLibPaths.get(ev.id) ?? "no file",
              evImportPaths.get(ev.id) ?? "no file"]);
          }
        }
      }
      addEntry(`${man}Control_to_Evidence_Map.xlsx`, await buildXlsx(
        ["Control ID", "Control Title", "Domain", "Level", "Control Status", "Evidence Title", "Evidence Type", "Evidence Status", "Collection Date", "Evidence Library Path", "Import Package Path"],
        ctrlEvRows
      ));

      // Control_to_Document_Map.xlsx
      const ctrlDocRows: (string | number | null | undefined)[][] = [];
      for (const c of controls) {
        const domain = domainMap.get(c.domainId);
        const ctrlDocs = (controlToDocs.get(c.id) ?? []).map((id) => docMap.get(id)).filter(Boolean) as typeof documents;
        if (ctrlDocs.length === 0) {
          ctrlDocRows.push([c.controlId, c.title, domain ? domainCode(domain.name) : "—", c.level, "—", "—", "—", "—"]);
        } else {
          for (const d of ctrlDocs) {
            ctrlDocRows.push([c.controlId, c.title, domain ? domainCode(domain.name) : "—", c.level,
              d.title, d.docType ?? "—", d.status, docLibPaths.get(d.id) ?? "no file"]);
          }
        }
      }
      addEntry(`${man}Control_to_Document_Map.xlsx`, await buildXlsx(
        ["Control ID", "Control Title", "Domain Code", "Level", "Document Title", "Document Type", "Document Status", "Document Library Path"],
        ctrlDocRows
      ));

      // Export_Issues.xlsx — always created
      addEntry(`${man}Export_Issues.xlsx`, await buildXlsx(
        ["Category", "Item", "Detail", "Recommendation"],
        exportIssues.length > 0
          ? exportIssues.map((i) => [i.category, i.item, i.detail, i.recommendation])
          : [["No Issues", "Export completed with no warnings", "", ""]]
      ));

      // Export_Audit_Log.xlsx
      addEntry(`${man}Export_Audit_Log.xlsx`, await buildXlsx(
        ["Field", "Value"],
        [
          ["Generated By", `${user.name} (${user.email})`],
          ["Role", user.role], ["Organization", org.name], ["Organization ID", org.id],
          ["Export Date", exportDate], ["Export Timestamp", exportTimestamp], ["CMMC Level", "L2"],
          ["Include Approved Evidence", String(includeApproved)],
          ["Include Assessor Ready Evidence", String(includeAssessorReady)],
          ["Include Draft Evidence", String(includeDraft)],
          ["Include Pending Review Evidence", String(includePendingReview)],
          ["Include Archived Evidence", String(includeArchived)],
          ["Include Internal Notes", String(includeInternalNotes)],
          ["Total Controls", controls.length], ["Evidence Items Included", evidence.length],
          ["Evidence Without Files", evidence.filter((e) => !e.fileKey).length],
          ["Documents (documentsTable)", documents.length],
          ["Document-Like Evidence", docLikeEvidence.length],
          ["Total Document Library Entries", documents.length + docLikeEvidence.length],
          ["POA&M Items", poams.length], ["Unmapped POA&M Items", unmappedPoams.length],
          ["Monitoring Items", monitoring.length], ["Export Issues", exportIssues.length],
          ["GCS Files Pre-Fetched", uniqueFileKeys.length],
        ]
      ));

      // Package_Metadata.json — comprehensive
      if (includeMetadataJson) {
        const metaJson = {
          package: pkgName, organization: org.name, organizationId: org.id,
          exportDate, exportTimestamp, cmmcLevel: "L2",
          generatedBy: { id: user.id, name: user.name, email: user.email, role: user.role },
          options: { includeApproved, includeAssessorReady, includeDraft, includePendingReview, includeArchived, includeInternalNotes },
          counts: {
            controls: controls.length, controlsImplemented: statusCounts.implemented,
            overallReadinessPct: pct,
            evidenceTotalIncluded: evidence.length,
            evidenceWithFiles: evidence.filter((e) => !!e.fileKey).length,
            evidenceWithoutFiles: evidence.filter((e) => !e.fileKey).length,
            documentsFromDocumentModule: documents.length,
            documentLikeEvidenceIncluded: docLikeEvidence.length,
            totalDocumentLibraryEntries: documents.length + docLikeEvidence.length,
            poams: poams.length, unmappedPoams: unmappedPoams.length,
            monitoring: monitoring.length, exportIssues: exportIssues.length,
          },
          structure: {
            reviewPackage: "01_C3PAO_Review_Package/",
            importPackage: "02_C3PAO_Import_Package/",
            manifests: "99_Manifests/",
          },
        };
        addEntry(`${man}Package_Metadata.json`, Buffer.from(JSON.stringify(metaJson, null, 2)));
      }

      // File_Hash_Manifest — goes last (includes all prior entries)
      if (includeHashManifest && hashManifestRows.length > 0) {
        arc.append(
          await buildXlsx(["File Path in ZIP", "Filename", "File Size (bytes)", "SHA-256 Hash", "Export Timestamp"], hashManifestRows as (string | number | null | undefined)[][]),
          { name: `${man}File_Hash_Manifest.xlsx` }
        );
      }

      // ── Finalise ─────────────────────────────────────────────────────────────
      await arc.finalize();

      req.log.info({
        org: org.name, files: hashManifestRows.length,
        evidence: evidence.length, documents: documents.length,
        docLikeEvidence: docLikeEvidence.length,
        exportIssues: exportIssues.length,
        gcsFilesLoaded: uniqueFileKeys.length,
      }, "C3PAO export package generated");

    } catch (err) {
      req.log.error({ err }, "Failed to generate C3PAO export package");
      if (!res.headersSent) res.status(500).json({ error: "Failed to generate export package" });
      else if (!res.writableEnded) res.end();
    }
  }
);

// ── Helpers for import manifest category suggestions ──────────────────────────
function suggestC3paoCategory(evidenceType: string): string {
  switch (evidenceType) {
    case "screenshot": return "Screenshot";
    case "log": return "Log";
    case "policy": return "Policy";
    case "procedure": return "Procedure";
    case "report": case "scan_report": return "Report";
    case "access_review": case "approval_record": return "Review Record";
    case "training_record": return "Training Record";
    case "configuration_export": case "system_inventory": case "asset_inventory": return "Export";
    case "backup_verification": return "Backup Verification";
    case "incident_record": return "Incident Record";
    case "risk_record": return "Risk Record";
    default: return "Other";
  }
}

function suggestC3paoDocCategory(docType: string | null | undefined): string {
  switch (docType) {
    case "policy": return "Policy";
    case "procedure": return "Procedure";
    case "log": case "register": case "checklist": return "Log";
    case "narrative": case "plan": return "SSP";
    case "report": return "Report";
    case "training_record": return "Training Record";
    case "vulnerability_scan": return "Report";
    default: return "Other";
  }
}

export default router;
