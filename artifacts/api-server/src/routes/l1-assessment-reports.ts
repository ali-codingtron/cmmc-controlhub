/**
 * CMMC Level 1 Annual Self-Assessment — Report & Export Endpoints
 *
 * Nine report endpoints mounted under /:id/reports/ by the l1-assessment router.
 * All routes require level1_assessment.view permission and active L1 module.
 *
 * Reports:
 *  1. main-report        — PDF: Full assessment report
 *  2. workpaper          — XLSX: 17-requirement workpaper
 *  3. far-crosswalk      — XLSX: FAR 52.204-21 crosswalk + roll-up
 *  4. objective-workpaper— XLSX: Per-objective workpaper
 *  5. evidence-index     — XLSX: Evidence index
 *  6. scope-summary      — PDF: FCI scope summary
 *  7. sprs-worksheet     — PDF: SPRS entry worksheet
 *  8. affirmation-record — PDF: Affirmation record
 *  9. hash-manifest      — XLSX: Assessment artifact hash manifest
 */

import { Router } from "express";
import PDFDocument from "pdfkit";
import ExcelJS from "exceljs";
import { createHash } from "crypto";
import { eq, and, asc, inArray } from "drizzle-orm";
import {
  db,
  level1AnnualAssessmentsTable,
  level1AssessmentRequirementsTable,
  level1AssessmentObjectivesTable,
  level1AssessmentEvidenceLinksTable,
  organizationsTable,
} from "@workspace/db";
import { requireAuth } from "../lib/auth";
import { requireOrg } from "../middleware/org";
import { canDo } from "../lib/permissions";
import { isL1AssessmentActive } from "../lib/l1-assessment-helpers";

const router = Router({ mergeParams: true });

// ── Shared constants (mirrors l1-assessment.ts) ──────────────────────────────

const L1_REQUIREMENTS = [
  { requirementId: "AC.L1-3.1.1",  canonicalKey: "L1-AC-1", requirementTitle: "Authorized Access Control",             sortOrder: 0  },
  { requirementId: "AC.L1-3.1.2",  canonicalKey: "L1-AC-2", requirementTitle: "Transaction & Function Control",         sortOrder: 1  },
  { requirementId: "AC.L1-3.1.20", canonicalKey: "L1-AC-3", requirementTitle: "Control Connection to External Systems", sortOrder: 2  },
  { requirementId: "AC.L1-3.1.22", canonicalKey: "L1-AC-4", requirementTitle: "Control Public Information",             sortOrder: 3  },
  { requirementId: "IA.L1-3.5.1",  canonicalKey: "L1-IA-1", requirementTitle: "Identify System Users",                 sortOrder: 4  },
  { requirementId: "IA.L1-3.5.2",  canonicalKey: "L1-IA-2", requirementTitle: "Authenticate System Users",             sortOrder: 5  },
  { requirementId: "MP.L1-3.8.3",  canonicalKey: "L1-MP-1", requirementTitle: "Sanitize or Destroy Media",             sortOrder: 6  },
  { requirementId: "PE.L1-3.10.1", canonicalKey: "L1-PE-1", requirementTitle: "Limit Physical Access",                 sortOrder: 7  },
  { requirementId: "PE.L1-3.10.3", canonicalKey: "L1-PE-2", requirementTitle: "Escort Visitors",                       sortOrder: 8  },
  { requirementId: "PE.L1-3.10.4", canonicalKey: "L1-PE-3", requirementTitle: "Audit Physical Access Logs",            sortOrder: 9  },
  { requirementId: "PE.L1-3.10.5", canonicalKey: "L1-PE-4", requirementTitle: "Manage Physical Access Devices",        sortOrder: 10 },
  { requirementId: "SC.L1-3.13.1", canonicalKey: "L1-SC-1", requirementTitle: "Boundary Protection",                   sortOrder: 11 },
  { requirementId: "SC.L1-3.13.5", canonicalKey: "L1-SC-2", requirementTitle: "Public-Access System Separation",       sortOrder: 12 },
  { requirementId: "SI.L1-3.14.1", canonicalKey: "L1-SI-1", requirementTitle: "Flaw Remediation",                      sortOrder: 13 },
  { requirementId: "SI.L1-3.14.2", canonicalKey: "L1-SI-2", requirementTitle: "Malicious Code Protection",             sortOrder: 14 },
  { requirementId: "SI.L1-3.14.4", canonicalKey: "L1-SI-3", requirementTitle: "Update Malicious Code Protection",      sortOrder: 15 },
  { requirementId: "SI.L1-3.14.5", canonicalKey: "L1-SI-4", requirementTitle: "System & File Scanning",                sortOrder: 16 },
] as const;

const FAR_CLAUSE_MAPPING = [
  { clause: "(i)",    label: "Limit access to authorized users",                     requirementIds: ["AC.L1-3.1.1"],                                   andGate: false },
  { clause: "(ii)",   label: "Limit access to authorized transactions/functions",    requirementIds: ["AC.L1-3.1.2"],                                   andGate: false },
  { clause: "(iii)",  label: "Verify and control connections to external systems",   requirementIds: ["AC.L1-3.1.20"],                                  andGate: false },
  { clause: "(iv)",   label: "Control CUI on publicly accessible systems",           requirementIds: ["AC.L1-3.1.22"],                                  andGate: false },
  { clause: "(v)",    label: "Identify information system users",                    requirementIds: ["IA.L1-3.5.1"],                                   andGate: false },
  { clause: "(vi)",   label: "Authenticate information system users",                requirementIds: ["IA.L1-3.5.2"],                                   andGate: false },
  { clause: "(vii)",  label: "Sanitize or destroy media before disposal/reuse",      requirementIds: ["MP.L1-3.8.3"],                                   andGate: false },
  { clause: "(viii)", label: "Limit physical access to authorized individuals",      requirementIds: ["PE.L1-3.10.1"],                                  andGate: false },
  { clause: "(ix)",   label: "Escort visitors and maintain physical access logs",    requirementIds: ["PE.L1-3.10.3", "PE.L1-3.10.4", "PE.L1-3.10.5"], andGate: true  },
  { clause: "(x)",    label: "Monitor and control organizational communications",    requirementIds: ["SC.L1-3.13.1"],                                  andGate: false },
  { clause: "(xi)",   label: "Implement subnetworks for publicly accessible systems",requirementIds: ["SC.L1-3.13.5"],                                  andGate: false },
  { clause: "(xii)",  label: "Identify, report, and correct system flaws",           requirementIds: ["SI.L1-3.14.1"],                                  andGate: false },
  { clause: "(xiii)", label: "Provide protection from malicious code",               requirementIds: ["SI.L1-3.14.2"],                                  andGate: false },
  { clause: "(xiv)",  label: "Update malicious code protection mechanisms",          requirementIds: ["SI.L1-3.14.4"],                                  andGate: false },
  { clause: "(xv)",   label: "Perform periodic and real-time system scans",          requirementIds: ["SI.L1-3.14.5"],                                  andGate: false },
] as const;

type FindingValue = "met" | "not_met" | "not_applicable" | "not_reviewed";

interface FarClauseResult {
  clause: string;
  label: string;
  result: FindingValue;
  requirementIds: readonly string[];
  andGate: boolean;
  findings: Array<{ requirementId: string; finding: FindingValue }>;
}

function computeFarRollup(
  requirementFindings: Array<{ requirementId: string; finding: FindingValue }>
): FarClauseResult[] {
  const findingMap = new Map<string, FindingValue>(
    requirementFindings.map((r) => [r.requirementId, r.finding])
  );

  return FAR_CLAUSE_MAPPING.map((clause) => {
    const clauseFindings = clause.requirementIds.map((rid) => ({
      requirementId: rid,
      finding: findingMap.get(rid) ?? ("not_reviewed" as FindingValue),
    }));

    let result: FindingValue;
    if (clause.andGate) {
      if (clauseFindings.every((f) => f.finding === "met")) result = "met";
      else if (clauseFindings.some((f) => f.finding === "not_met")) result = "not_met";
      else if (clauseFindings.every((f) => f.finding === "not_applicable")) result = "not_applicable";
      else result = "not_reviewed";
    } else {
      const f = clauseFindings[0].finding;
      result = f;
    }

    return {
      clause: clause.clause,
      label: clause.label,
      result,
      requirementIds: clause.requirementIds,
      andGate: clause.andGate,
      findings: clauseFindings,
    };
  });
}

function parseMeta(raw: string | null | undefined): Record<string, unknown> {
  if (!raw) return {};
  try { return JSON.parse(raw) as Record<string, unknown>; }
  catch { return {}; }
}

// ── Domain label from requirementId prefix ───────────────────────────────────

function domainLabel(requirementId: string): string {
  const prefix = requirementId.split(".")[0] ?? "";
  const map: Record<string, string> = {
    AC: "Access Control", IA: "Identification & Authentication",
    MP: "Media Protection", PE: "Physical Protection",
    SC: "System & Communications Protection", SI: "System & Information Integrity",
  };
  return map[prefix] ?? prefix;
}

function findingLabel(f: FindingValue): string {
  switch (f) {
    case "met": return "MET";
    case "not_met": return "NOT MET";
    case "not_applicable": return "N/A";
    default: return "NOT REVIEWED";
  }
}

// Objective results use a different enum from requirement findings
function objectiveResultLabel(r: string | null | undefined): string {
  switch (r) {
    case "satisfied": return "Satisfied";
    case "other_than_satisfied": return "Other Than Satisfied";
    case "not_applicable": return "Not Applicable";
    case "not_reviewed": return "Not Reviewed";
    default: return "Not Reviewed";
  }
}

function fmtDate(d: Date | string | null | undefined): string {
  if (!d) return "—";
  try { return new Date(d).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" }); }
  catch { return String(d); }
}

function fmtDateShort(d: Date | string | null | undefined): string {
  if (!d) return "—";
  try { return new Date(d).toISOString().slice(0, 10); }
  catch { return String(d); }
}

// ── PDF helpers ───────────────────────────────────────────────────────────────

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

function pdfRule(doc: PDFKit.PDFDocument, color = "#cccccc") {
  doc.save().strokeColor(color).lineWidth(0.5)
    .moveTo(50, doc.y).lineTo(562, doc.y).stroke().restore().moveDown(0.4);
}

function pdfSectionHeader(doc: PDFKit.PDFDocument, title: string) {
  doc.moveDown(0.6);
  doc.fontSize(10).font("Helvetica-Bold").fillColor("#1e3a5f").text(title.toUpperCase());
  pdfRule(doc, "#1e3a5f");
  doc.fillColor("black");
}

function pdfLV(doc: PDFKit.PDFDocument, label: string, value: string) {
  doc.fontSize(9).font("Helvetica-Bold").text(label + ":", { continued: true });
  doc.font("Helvetica").text("  " + (value || "—"));
}

function pdfTableHeader(
  doc: PDFKit.PDFDocument,
  cols: { label: string; x: number; width: number }[],
  y: number
) {
  doc.save().rect(50, y, 512, 15).fill("#1e3a5f").restore();
  doc.fontSize(8).font("Helvetica-Bold").fillColor("white");
  for (const col of cols) {
    doc.text(col.label, col.x, y + 3, { width: col.width - 4, lineBreak: false });
  }
  doc.fillColor("black");
}

function pdfTableRow(
  doc: PDFKit.PDFDocument,
  cols: { text: string; x: number; width: number }[],
  y: number,
  shade: boolean
) {
  if (shade) doc.save().rect(50, y, 512, 14).fill("#f5f7fa").restore();
  doc.fontSize(7.5).font("Helvetica").fillColor("black");
  for (const col of cols) {
    doc.text(col.text, col.x, y + 3, { width: col.width - 4, lineBreak: false });
  }
}

function pdfFindingBadge(doc: PDFKit.PDFDocument, finding: FindingValue, x: number, y: number) {
  const colors: Record<string, { bg: string; text: string }> = {
    met: { bg: "#d1fae5", text: "#065f46" },
    not_met: { bg: "#fee2e2", text: "#991b1b" },
    not_applicable: { bg: "#f1f5f9", text: "#475569" },
    not_reviewed: { bg: "#fef9c3", text: "#854d0e" },
  };
  const c = colors[finding] ?? colors.not_reviewed;
  const label = findingLabel(finding);
  doc.save().rect(x, y + 1, 55, 11).fill(c.bg).restore();
  doc.fontSize(7).font("Helvetica-Bold").fillColor(c.text)
    .text(label, x + 2, y + 3, { width: 51, lineBreak: false });
  doc.fillColor("black");
}

// ── XLSX helpers ──────────────────────────────────────────────────────────────

async function buildXlsxMultiSheet(
  sheets: Array<{
    name: string;
    headers: string[];
    rows: (string | number | null | undefined)[][];
    colWidths?: number[];
  }>
): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Control HUB — CMMC Assessment Platform";
  workbook.created = new Date();

  for (const sheet of sheets) {
    const ws = workbook.addWorksheet(sheet.name);
    ws.columns = sheet.headers.map((h, i) => ({
      header: h,
      width: sheet.colWidths?.[i] ?? Math.max(h.length + 4, 16),
    }));
    // Style header row
    const hRow = ws.getRow(1);
    hRow.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 10 };
    hRow.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1E3A5F" } };
    hRow.alignment = { vertical: "middle", wrapText: false };
    hRow.height = 18;
    // Freeze header row
    ws.views = [{ state: "frozen", ySplit: 1 }];
    // Add data rows
    let rowIdx = 2;
    for (const row of sheet.rows) {
      const r = ws.addRow(row.map((v) => v ?? ""));
      if (rowIdx % 2 === 0) {
        r.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF8FAFC" } };
      }
      r.alignment = { vertical: "top", wrapText: true };
      rowIdx++;
    }
    // Auto-fit columns based on content
    ws.columns.forEach((col) => {
      let maxLen = (col.header as string)?.length ?? 10;
      col.eachCell?.({ includeEmpty: false }, (cell) => {
        const v = String(cell.value ?? "");
        if (v.length > maxLen) maxLen = v.length;
      });
      col.width = Math.min(Math.max(maxLen + 2, 12), 60);
    });
  }

  const arrayBuffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(arrayBuffer);
}

// ── Data loader ───────────────────────────────────────────────────────────────

interface AssessmentData {
  assessment: typeof level1AnnualAssessmentsTable.$inferSelect;
  org: typeof organizationsTable.$inferSelect;
  requirements: (typeof level1AssessmentRequirementsTable.$inferSelect)[];
  objectives: (typeof level1AssessmentObjectivesTable.$inferSelect)[];
  evidenceLinks: (typeof level1AssessmentEvidenceLinksTable.$inferSelect)[];
  farRollup: FarClauseResult[];
  meta: Record<string, unknown>;
}

async function loadAssessmentData(
  assessmentId: string,
  orgId: string,
  res: any
): Promise<AssessmentData | null> {
  const [assessment] = await db
    .select()
    .from(level1AnnualAssessmentsTable)
    .where(and(
      eq(level1AnnualAssessmentsTable.id, assessmentId),
      eq(level1AnnualAssessmentsTable.organizationId, orgId)
    ))
    .limit(1);

  if (!assessment) {
    res.status(404).json({ error: "Assessment not found" });
    return null;
  }

  // Fetch org, requirements, and evidence in parallel first
  const [org, requirements, evidenceLinks] = await Promise.all([
    db.select().from(organizationsTable).where(eq(organizationsTable.id, orgId)).limit(1).then(r => r[0]),
    db.select().from(level1AssessmentRequirementsTable)
      .where(eq(level1AssessmentRequirementsTable.assessmentId, assessmentId))
      .orderBy(asc(level1AssessmentRequirementsTable.sortOrder)),
    db.select().from(level1AssessmentEvidenceLinksTable)
      .where(eq(level1AssessmentEvidenceLinksTable.assessmentId, assessmentId))
      .orderBy(asc(level1AssessmentEvidenceLinksTable.createdAt)),
  ]);

  if (!org) {
    res.status(404).json({ error: "Organization not found" });
    return null;
  }

  // Objectives link through requirements — fetch after requirements are known
  const objectives = requirements.length > 0
    ? await db.select().from(level1AssessmentObjectivesTable)
        .where(inArray(
          level1AssessmentObjectivesTable.assessmentRequirementId,
          requirements.map(r => r.id)
        ))
        .orderBy(asc(level1AssessmentObjectivesTable.sortOrder))
    : [];

  const farRollup = computeFarRollup(
    requirements.map((r) => ({ requirementId: r.requirementId, finding: r.finding as FindingValue }))
  );

  return {
    assessment,
    org,
    requirements,
    objectives: objectives ?? [],
    evidenceLinks,
    farRollup,
    meta: parseMeta(assessment.snapshotMetadata),
  };
}

// ── Shared permission guard ───────────────────────────────────────────────────

async function guardReport(req: any, res: any, orgId: string): Promise<boolean> {
  if (!canDo(req, "level1_assessment.view")) {
    res.status(403).json({ error: "level1_assessment.view permission required" });
    return false;
  }
  const active = await isL1AssessmentActive(orgId);
  if (!active) {
    res.status(404).json({ error: "CMMC Level 1 Self-Assessment module is not active for this organization" });
    return false;
  }
  return true;
}

function streamFile(res: any, buf: Buffer, contentType: string, filename: string) {
  res.setHeader("Content-Type", contentType);
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  res.setHeader("Content-Length", buf.length);
  res.end(buf);
}

// ════════════════════════════════════════════════════════════════════════════════
// 1. Main Assessment Report PDF
// GET /l1-assessment/:id/reports/main-report
// ════════════════════════════════════════════════════════════════════════════════

router.get("/main-report", requireAuth, requireOrg, async (req, res): Promise<void> => {
  const orgId = req.orgId!;
  if (!(await guardReport(req, res, orgId))) return;

  try {
    const data = await loadAssessmentData(req.params.id as string, orgId, res);
    if (!data) return;

    const { assessment, org, requirements, evidenceLinks, farRollup, meta } = data;

    const metCount = requirements.filter(r => r.finding === "met").length;
    const notMetCount = requirements.filter(r => r.finding === "not_met").length;
    const naCount = requirements.filter(r => r.finding === "not_applicable").length;
    const notReviewedCount = requirements.filter(r => r.finding === "not_reviewed").length;
    const farMet = farRollup.filter(c => c.result === "met").length;
    const farNotMet = farRollup.filter(c => c.result === "not_met").length;
    const farNa = farRollup.filter(c => c.result === "not_applicable").length;
    const farNotReviewed = farRollup.filter(c => c.result === "not_reviewed").length;
    const overallFarResult = farNotMet === 0 && farNotReviewed === 0 ? "SATISFIED" : farNotMet > 0 ? "NOT SATISFIED" : "INCOMPLETE";
    const generatedAt = new Date();

    const buf = await buildPdf((doc) => {
      // ── Cover Page ────────────────────────────────────────────────────────
      doc.save().rect(0, 0, 612, 200).fill("#1e3a5f").restore();
      doc.fontSize(20).font("Helvetica-Bold").fillColor("white")
        .text("CMMC LEVEL 1 ANNUAL SELF-ASSESSMENT REPORT", 50, 50, { align: "center", width: 512 });
      doc.fontSize(13).font("Helvetica")
        .text(org.name, { align: "center", width: 512 });
      doc.moveDown(0.5)
        .fontSize(11)
        .text(`Assessment Year: ${assessment.assessmentYear}`, { align: "center", width: 512 })
        .text(`Generated: ${fmtDate(generatedAt)}`, { align: "center", width: 512 });

      doc.fillColor("black").moveDown(2);

      // ── Executive Summary ─────────────────────────────────────────────────
      pdfSectionHeader(doc, "Executive Summary");
      pdfLV(doc, "Organization", org.name);
      pdfLV(doc, "Assessment Title", assessment.title);
      pdfLV(doc, "Assessment Scope", assessment.scopeName);
      pdfLV(doc, "Assessment Year", String(assessment.assessmentYear));
      pdfLV(doc, "Status", assessment.status.replace(/_/g, " ").toUpperCase());
      pdfLV(doc, "Report Generated", fmtDate(generatedAt));

      doc.moveDown(0.8);
      doc.fontSize(9).font("Helvetica-Bold").text("17 CMMC Level 1 Requirement Findings");
      doc.moveDown(0.3);

      // Counts summary table
      const reqColsH = [
        { label: "Total Reqs", x: 50,  width: 80 },
        { label: "MET",        x: 130, width: 80 },
        { label: "NOT MET",    x: 210, width: 80 },
        { label: "N/A",        x: 290, width: 80 },
        { label: "NOT REVIEWED",x: 370, width: 90 },
      ];
      const reqY = doc.y;
      pdfTableHeader(doc, reqColsH, reqY);
      const reqRowY = reqY + 15;
      pdfTableRow(doc, [
        { text: String(requirements.length), x: 50,  width: 80 },
        { text: String(metCount),            x: 130, width: 80 },
        { text: String(notMetCount),         x: 210, width: 80 },
        { text: String(naCount),             x: 290, width: 80 },
        { text: String(notReviewedCount),    x: 370, width: 90 },
      ], reqRowY, false);
      doc.y = reqRowY + 18;

      doc.moveDown(0.8);
      doc.fontSize(9).font("Helvetica-Bold").text("FAR 52.204-21 Clause Roll-Up Summary");
      doc.moveDown(0.3);

      const farColsH = [
        { label: "Total Clauses", x: 50,  width: 90 },
        { label: "SATISFIED",     x: 140, width: 90 },
        { label: "NOT SATISFIED", x: 230, width: 90 },
        { label: "N/A",           x: 320, width: 80 },
        { label: "Overall Result",x: 400, width: 100 },
      ];
      const farSumY = doc.y;
      pdfTableHeader(doc, farColsH, farSumY);
      pdfTableRow(doc, [
        { text: "15",              x: 50,  width: 90 },
        { text: String(farMet),    x: 140, width: 90 },
        { text: String(farNotMet), x: 230, width: 90 },
        { text: String(farNa),     x: 320, width: 80 },
        { text: overallFarResult,  x: 400, width: 100 },
      ], farSumY + 15, false);
      doc.y = farSumY + 33;

      // ── Scope ─────────────────────────────────────────────────────────────
      pdfSectionHeader(doc, "Assessment Scope");
      pdfLV(doc, "Scope Name", assessment.scopeName);
      pdfLV(doc, "Information Type", "Federal Contract Information (FCI)");
      if (assessment.description) pdfLV(doc, "Description", assessment.description);

      // ── Requirement Details ───────────────────────────────────────────────
      pdfSectionHeader(doc, "Requirement Findings Detail");
      doc.fontSize(8).font("Helvetica").fillColor("#475569")
        .text("One row per CMMC Level 1 practice with FAR 52.204-21 clause mapping.")
        .fillColor("black");
      doc.moveDown(0.4);

      const rCols = [
        { label: "Req ID",    x: 50,  width: 82 },
        { label: "Practice",  x: 132, width: 190 },
        { label: "Domain",    x: 322, width: 120 },
        { label: "Finding",   x: 442, width: 70 },
        { label: "FAR Clause",x: 512, width: 50 },
      ];
      const rHdrY = doc.y;
      pdfTableHeader(doc, rCols, rHdrY);
      doc.y = rHdrY + 15;

      // Build FAR clause mapping for requirements
      const reqToFar = new Map<string, string[]>();
      for (const clause of FAR_CLAUSE_MAPPING) {
        for (const rid of clause.requirementIds) {
          if (!reqToFar.has(rid)) reqToFar.set(rid, []);
          reqToFar.get(rid)!.push(clause.clause);
        }
      }

      // Map requirements to DB findings
      const dbFindingMap = new Map(requirements.map(r => [r.requirementId, r.finding as FindingValue]));

      L1_REQUIREMENTS.forEach((req, idx) => {
        const finding = dbFindingMap.get(req.requirementId) ?? "not_reviewed";
        const farClauses = reqToFar.get(req.requirementId)?.join(", ") ?? "—";
        const rowY = doc.y;

        if (rowY > 700) { doc.addPage(); }
        const currentY = doc.y;

        pdfTableRow(doc, [
          { text: req.requirementId, x: 50,  width: 82 },
          { text: req.requirementTitle, x: 132, width: 190 },
          { text: domainLabel(req.requirementId), x: 322, width: 120 },
          { text: "",                x: 442, width: 70 }, // badge drawn separately
          { text: farClauses,        x: 512, width: 50 },
        ], currentY, idx % 2 === 1);
        pdfFindingBadge(doc, finding, 442, currentY);
        doc.y = currentY + 14;
      });

      // ── Evidence Summary ──────────────────────────────────────────────────
      pdfSectionHeader(doc, "Evidence Summary");
      pdfLV(doc, "Total Linked Evidence Items", String(evidenceLinks.length));
      const byUse = { examine: 0, interview: 0, test: 0 };
      for (const e of evidenceLinks) {
        if (e.assessmentUse in byUse) byUse[e.assessmentUse as keyof typeof byUse]++;
      }
      pdfLV(doc, "By Assessment Use", `Examine: ${byUse.examine} | Interview: ${byUse.interview} | Test: ${byUse.test}`);
      const directly = evidenceLinks.filter(e => e.qualification === "directly_applicable").length;
      pdfLV(doc, "Directly Applicable", String(directly));

      // ── Management Approval ───────────────────────────────────────────────
      pdfSectionHeader(doc, "Management Approval & Review");
      pdfLV(doc, "Submitted By", String(meta.submittedByName ?? meta.submittedById ?? "—"));
      pdfLV(doc, "Submitted At", fmtDate(assessment.submittedAt));
      if (meta.reviewerNotes) pdfLV(doc, "Reviewer Notes", String(meta.reviewerNotes));
      if (meta.approvedByName) pdfLV(doc, "Approved By", String(meta.approvedByName));
      if (meta.approvedAt) pdfLV(doc, "Approved At", fmtDate(String(meta.approvedAt)));

      // ── SPRS Status ───────────────────────────────────────────────────────
      pdfSectionHeader(doc, "SPRS Entry Status");
      if (meta.sprsEnteredAt) {
        pdfLV(doc, "Entry Status", "RECORDED");
        pdfLV(doc, "Entered By", String(meta.sprsEnteredBy ?? "—"));
        pdfLV(doc, "Entry Date", String(meta.sprsEntryDate ?? "—"));
        pdfLV(doc, "SPRS Reference", String(meta.sprsReference ?? "—"));
        if (meta.sprsEvidence) pdfLV(doc, "Evidence", String(meta.sprsEvidence));
      } else {
        pdfLV(doc, "Entry Status", "NOT YET RECORDED");
      }

      // ── Affirmation Status ────────────────────────────────────────────────
      pdfSectionHeader(doc, "Annual Affirmation Status");
      if (assessment.affirmedAt) {
        pdfLV(doc, "Affirmation Status", "AFFIRMED");
        pdfLV(doc, "Affirming Official", assessment.affirmingOfficialName ?? "—");
        pdfLV(doc, "Official Title", assessment.affirmingOfficialTitle ?? "—");
        pdfLV(doc, "Affirmed On", fmtDate(assessment.affirmedAt));
        if (meta.expirationDate) pdfLV(doc, "Expires", fmtDate(String(meta.expirationDate)));
        if (meta.cmmcUid) pdfLV(doc, "CMMC UID", String(meta.cmmcUid));
      } else {
        pdfLV(doc, "Affirmation Status", "NOT YET AFFIRMED");
      }

      if (assessment.status === "locked") {
        pdfLV(doc, "Assessment Locked At", fmtDate(assessment.lockedAt));
        if (meta.snapshotHash) pdfLV(doc, "Snapshot Hash (SHA-256)", String(meta.snapshotHash));
      }

      // Footer
      doc.moveDown(2);
      pdfRule(doc, "#cccccc");
      doc.fontSize(7.5).font("Helvetica-Oblique").fillColor("#64748b")
        .text(
          `CMMC Level 1 Annual Self-Assessment Report — ${org.name} — ${assessment.assessmentYear} — ` +
          `Generated ${generatedAt.toISOString()} — For official use. Handle in accordance with data handling policy.`,
          { align: "center" }
        );
    });

    streamFile(res, buf, "application/pdf",
      `L1_Assessment_Report_${assessment.assessmentYear}_${org.name.replace(/[^A-Za-z0-9]/g, "_").slice(0, 30)}.pdf`);
  } catch (err) {
    (req as any).log?.error(err, "l1 reports: main-report failed");
    res.status(500).json({ error: "Failed to generate main report" });
  }
});

// ════════════════════════════════════════════════════════════════════════════════
// 2. 17-Requirement Workpaper XLSX
// GET /l1-assessment/:id/reports/workpaper
// ════════════════════════════════════════════════════════════════════════════════

router.get("/workpaper", requireAuth, requireOrg, async (req, res): Promise<void> => {
  const orgId = req.orgId!;
  if (!(await guardReport(req, res, orgId))) return;

  try {
    const data = await loadAssessmentData(req.params.id as string, orgId, res);
    if (!data) return;

    const { assessment, org, requirements, evidenceLinks, farRollup } = data;

    // Map requirement ID → evidence count
    const evidenceByReqId = new Map<string, number>();
    for (const e of evidenceLinks) {
      if (e.assessmentRequirementId) {
        // Find which requirement row this maps to
        const req2 = requirements.find(r => r.id === e.assessmentRequirementId);
        if (req2) {
          evidenceByReqId.set(req2.requirementId, (evidenceByReqId.get(req2.requirementId) ?? 0) + 1);
        }
      }
    }

    // Map requirement ID → FAR clauses
    const reqToFar = new Map<string, string[]>();
    for (const clause of FAR_CLAUSE_MAPPING) {
      for (const rid of clause.requirementIds) {
        if (!reqToFar.has(rid)) reqToFar.set(rid, []);
        reqToFar.get(rid)!.push(clause.clause);
      }
    }

    // Build rows — merge L1_REQUIREMENTS with DB findings
    const dbFindingMap = new Map(requirements.map(r => [r.requirementId, r]));

    const rows: (string | null)[][] = L1_REQUIREMENTS.map((req) => {
      const dbReq = dbFindingMap.get(req.requirementId);
      const farClauses = reqToFar.get(req.requirementId)?.join(", ") ?? "";
      const evidenceCount = evidenceByReqId.get(req.requirementId) ?? 0;
      const objFarClause = farRollup.find(c => c.requirementIds.includes(req.requirementId));

      return [
        req.requirementId,
        req.requirementTitle,
        domainLabel(req.requirementId),
        findingLabel((dbReq?.finding as FindingValue) ?? "not_reviewed"),
        farClauses,
        objFarClause ? findingLabel(objFarClause.result) : "—",
        dbReq?.implementationNarrative ?? "",
        dbReq?.assessorNotes ?? "",
        dbReq?.naJustification ?? "",
        String(evidenceCount),
      ];
    });

    const buf = await buildXlsxMultiSheet([{
      name: "17-Req Workpaper",
      headers: [
        "Requirement ID", "Practice Title", "Domain / Family", "Finding",
        "FAR 52.204-21 Clause(s)", "FAR Clause Result", "Implementation Narrative",
        "Assessor Notes", "N/A Justification", "Evidence Count",
      ],
      rows,
      colWidths: [16, 32, 28, 14, 22, 18, 50, 40, 40, 14],
    }, {
      name: "Metadata",
      headers: ["Field", "Value"],
      rows: [
        ["Organization", org.name],
        ["Assessment Year", String(assessment.assessmentYear)],
        ["Assessment Title", assessment.title],
        ["Scope Name", assessment.scopeName],
        ["Status", assessment.status],
        ["Total Requirements", String(requirements.length)],
        ["MET", String(requirements.filter(r => r.finding === "met").length)],
        ["NOT MET", String(requirements.filter(r => r.finding === "not_met").length)],
        ["N/A", String(requirements.filter(r => r.finding === "not_applicable").length)],
        ["NOT REVIEWED", String(requirements.filter(r => r.finding === "not_reviewed").length)],
        ["FAR Clauses Satisfied", String(farRollup.filter(c => c.result === "met").length) + " of 15"],
        ["Generated At", new Date().toISOString()],
      ],
    }]);

    streamFile(res, buf, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      `L1_Workpaper_${assessment.assessmentYear}_${org.name.replace(/[^A-Za-z0-9]/g, "_").slice(0, 30)}.xlsx`);
  } catch (err) {
    (req as any).log?.error(err, "l1 reports: workpaper failed");
    res.status(500).json({ error: "Failed to generate workpaper" });
  }
});

// ════════════════════════════════════════════════════════════════════════════════
// 3. FAR 52.204-21 Crosswalk XLSX
// GET /l1-assessment/:id/reports/far-crosswalk
// ════════════════════════════════════════════════════════════════════════════════

router.get("/far-crosswalk", requireAuth, requireOrg, async (req, res): Promise<void> => {
  const orgId = req.orgId!;
  if (!(await guardReport(req, res, orgId))) return;

  try {
    const data = await loadAssessmentData(req.params.id as string, orgId, res);
    if (!data) return;

    const { assessment, org, requirements, farRollup } = data;
    const dbFindingMap = new Map(requirements.map(r => [r.requirementId, r.finding as FindingValue]));

    // Build crosswalk rows — clause (ix) gets three rows (one per PE requirement)
    const rows: (string | null)[][] = [];
    for (const clause of farRollup) {
      if (clause.andGate && clause.requirementIds.length > 1) {
        // Expand — first row has clause result, subsequent have blank clause
        clause.requirementIds.forEach((rid, idx) => {
          const l1req = L1_REQUIREMENTS.find(r => r.requirementId === rid);
          const finding = dbFindingMap.get(rid) ?? "not_reviewed";
          rows.push([
            idx === 0 ? clause.clause : "",
            idx === 0 ? clause.label : "(continued — AND gate)",
            idx === 0 ? findingLabel(clause.result) : "",
            rid,
            l1req?.requirementTitle ?? rid,
            domainLabel(rid),
            findingLabel(finding),
            idx === 0 && clause.andGate ? "All requirements must be MET (AND gate)" : "",
          ]);
        });
      } else {
        const rid = clause.requirementIds[0];
        const l1req = L1_REQUIREMENTS.find(r => r.requirementId === rid);
        const finding = dbFindingMap.get(rid) ?? "not_reviewed";
        rows.push([
          clause.clause,
          clause.label,
          findingLabel(clause.result),
          rid ?? "",
          l1req?.requirementTitle ?? "",
          domainLabel(rid ?? ""),
          findingLabel(finding),
          "",
        ]);
      }
    }

    // Roll-up summary rows
    const metCount = farRollup.filter(c => c.result === "met").length;
    const notMetCount = farRollup.filter(c => c.result === "not_met").length;
    const naCount = farRollup.filter(c => c.result === "not_applicable").length;
    const notReviewedCount = farRollup.filter(c => c.result === "not_reviewed").length;

    const buf = await buildXlsxMultiSheet([{
      name: "FAR Crosswalk",
      headers: [
        "FAR Clause", "FAR Clause Description", "Clause Roll-Up Result",
        "CMMC L1 Req ID", "CMMC L1 Practice", "Domain", "Practice Finding", "Notes",
      ],
      rows,
      colWidths: [12, 48, 20, 16, 34, 30, 16, 36],
    }, {
      name: "Roll-Up Summary",
      headers: ["Metric", "Count", "Notes"],
      rows: [
        ["Total FAR 52.204-21 Clauses", "15", ""],
        ["Satisfied (MET)", String(metCount), ""],
        ["Not Satisfied (NOT MET)", String(notMetCount), ""],
        ["Not Applicable (N/A)", String(naCount), ""],
        ["Not Reviewed", String(notReviewedCount), ""],
        ["Overall FAR 52.204-21 Result",
          notMetCount === 0 && notReviewedCount === 0 ? "SATISFIED" : notMetCount > 0 ? "NOT SATISFIED" : "INCOMPLETE",
          "SATISFIED requires all applicable clauses MET"],
        ["Organization", org.name, ""],
        ["Assessment Year", String(assessment.assessmentYear), ""],
        ["Generated At", new Date().toISOString(), ""],
      ],
    }]);

    streamFile(res, buf, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      `FAR_Crosswalk_${assessment.assessmentYear}_${org.name.replace(/[^A-Za-z0-9]/g, "_").slice(0, 30)}.xlsx`);
  } catch (err) {
    (req as any).log?.error(err, "l1 reports: far-crosswalk failed");
    res.status(500).json({ error: "Failed to generate FAR crosswalk" });
  }
});

// ════════════════════════════════════════════════════════════════════════════════
// 4. Objective Workpaper XLSX
// GET /l1-assessment/:id/reports/objective-workpaper
// ════════════════════════════════════════════════════════════════════════════════

router.get("/objective-workpaper", requireAuth, requireOrg, async (req, res): Promise<void> => {
  const orgId = req.orgId!;
  if (!(await guardReport(req, res, orgId))) return;

  try {
    const data = await loadAssessmentData(req.params.id as string, orgId, res);
    if (!data) return;

    const { assessment, org, requirements, objectives } = data;

    // Map req DB id → requirement row
    const reqById = new Map(requirements.map(r => [r.id, r]));

    const rows: (string | null)[][] = objectives.map((obj, idx) => {
      const parentReq = reqById.get((obj as any).assessmentRequirementId ?? "");
      const methods: string[] = [];
      // Infer methods from notes if present
      if ((obj as any).examineNotes) methods.push("Examine");
      if ((obj as any).interviewNotes) methods.push("Interview");
      if ((obj as any).testNotes) methods.push("Test");

      return [
        parentReq?.requirementId ?? "—",
        parentReq?.requirementTitle ?? "—",
        String(idx + 1),
        obj.objectiveText,
        objectiveResultLabel(obj.result),
        methods.join(", ") || "—",
        obj.notes ?? "",
      ];
    });

    // If no objectives, add placeholder rows for each requirement
    const effectiveRows = rows.length > 0 ? rows : requirements.map(r => [
      r.requirementId,
      r.requirementTitle,
      "1",
      `Assess ${r.requirementTitle}`,
      "Not Reviewed",
      "—",
      "",
    ]);

    const buf = await buildXlsxMultiSheet([{
      name: "Objective Workpaper",
      headers: [
        "Requirement ID", "Requirement Title", "Objective #",
        "Objective Statement", "Result", "Assessment Methods", "Notes",
      ],
      rows: effectiveRows,
      colWidths: [16, 36, 12, 55, 20, 22, 45],
    }, {
      name: "Metadata",
      headers: ["Field", "Value"],
      rows: [
        ["Organization", org.name],
        ["Assessment Year", String(assessment.assessmentYear)],
        ["Total Objectives Recorded", String(objectives.length)],
        ["Generated At", new Date().toISOString()],
      ],
    }]);

    streamFile(res, buf, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      `L1_Objective_Workpaper_${assessment.assessmentYear}_${org.name.replace(/[^A-Za-z0-9]/g, "_").slice(0, 30)}.xlsx`);
  } catch (err) {
    (req as any).log?.error(err, "l1 reports: objective-workpaper failed");
    res.status(500).json({ error: "Failed to generate objective workpaper" });
  }
});

// ════════════════════════════════════════════════════════════════════════════════
// 5. Evidence Index XLSX
// GET /l1-assessment/:id/reports/evidence-index
// ════════════════════════════════════════════════════════════════════════════════

router.get("/evidence-index", requireAuth, requireOrg, async (req, res): Promise<void> => {
  const orgId = req.orgId!;
  if (!(await guardReport(req, res, orgId))) return;

  try {
    const data = await loadAssessmentData(req.params.id as string, orgId, res);
    if (!data) return;

    const { assessment, org, requirements, evidenceLinks } = data;

    // Map requirement DB id → requirementId
    const reqById = new Map(requirements.map(r => [r.id, r]));

    const rows: (string | null)[][] = evidenceLinks.map((e) => {
      const parentReq = e.assessmentRequirementId ? reqById.get(e.assessmentRequirementId) : null;
      return [
        e.fileName ?? e.evidenceDescription ?? "—",
        e.evidenceDescription ?? "",
        e.assessmentUse ?? "—",
        e.qualification?.replace(/_/g, " ") ?? "—",
        parentReq?.requirementId ?? "—",
        parentReq?.requirementTitle ?? "—",
        e.notes ?? "",
        fmtDateShort(e.linkedAt),
        fmtDateShort(e.createdAt),
      ];
    });

    const buf = await buildXlsxMultiSheet([{
      name: "Evidence Index",
      headers: [
        "File / Description", "Evidence Description", "Assessment Use",
        "Qualification", "Linked Requirement ID", "Linked Requirement Title",
        "Notes", "Linked At", "Created At",
      ],
      rows,
      colWidths: [35, 45, 16, 24, 20, 38, 40, 14, 14],
    }, {
      name: "Metadata",
      headers: ["Field", "Value"],
      rows: [
        ["Organization", org.name],
        ["Assessment Year", String(assessment.assessmentYear)],
        ["Total Evidence Items", String(evidenceLinks.length)],
        ["Examine Items", String(evidenceLinks.filter(e => e.assessmentUse === "examine").length)],
        ["Interview Items", String(evidenceLinks.filter(e => e.assessmentUse === "interview").length)],
        ["Test Items", String(evidenceLinks.filter(e => e.assessmentUse === "test").length)],
        ["Directly Applicable", String(evidenceLinks.filter(e => e.qualification === "directly_applicable").length)],
        ["Generated At", new Date().toISOString()],
      ],
    }]);

    streamFile(res, buf, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      `L1_Evidence_Index_${assessment.assessmentYear}_${org.name.replace(/[^A-Za-z0-9]/g, "_").slice(0, 30)}.xlsx`);
  } catch (err) {
    (req as any).log?.error(err, "l1 reports: evidence-index failed");
    res.status(500).json({ error: "Failed to generate evidence index" });
  }
});

// ════════════════════════════════════════════════════════════════════════════════
// 6. FCI Scope Summary PDF
// GET /l1-assessment/:id/reports/scope-summary
// ════════════════════════════════════════════════════════════════════════════════

router.get("/scope-summary", requireAuth, requireOrg, async (req, res): Promise<void> => {
  const orgId = req.orgId!;
  if (!(await guardReport(req, res, orgId))) return;

  try {
    const data = await loadAssessmentData(req.params.id as string, orgId, res);
    if (!data) return;

    const { assessment, org, requirements, farRollup, meta } = data;
    const metCount = requirements.filter(r => r.finding === "met").length;
    const generatedAt = new Date();

    const buf = await buildPdf((doc) => {
      // Cover
      doc.save().rect(0, 0, 612, 160).fill("#1e5f3f").restore();
      doc.fontSize(18).font("Helvetica-Bold").fillColor("white")
        .text("FCI SCOPE SUMMARY", 50, 40, { align: "center", width: 512 });
      doc.fontSize(12).font("Helvetica")
        .text("Federal Contract Information — Assessment Scope", { align: "center", width: 512 });
      doc.moveDown(0.5)
        .text(org.name, { align: "center", width: 512 });
      doc.fillColor("black").moveDown(3);

      pdfSectionHeader(doc, "Organization Information");
      pdfLV(doc, "Organization Name", org.name);
      if ((org as any).legalName) pdfLV(doc, "Legal Name", (org as any).legalName);
      if ((org as any).primaryContact) pdfLV(doc, "Primary Contact", (org as any).primaryContact);

      pdfSectionHeader(doc, "Assessment Scope");
      pdfLV(doc, "Scope Name", assessment.scopeName);
      pdfLV(doc, "Assessment Year", String(assessment.assessmentYear));
      pdfLV(doc, "Assessment Title", assessment.title);
      pdfLV(doc, "Information Type", "Federal Contract Information (FCI)");
      pdfLV(doc, "Applicable Standard", "FAR 52.204-21 (Basic Safeguarding of Covered Contractor Information Systems)");
      if (assessment.description) {
        doc.moveDown(0.3);
        pdfLV(doc, "Scope Description", assessment.description);
      }

      pdfSectionHeader(doc, "Scope Boundary — FCI Systems");
      doc.fontSize(9).font("Helvetica").fillColor("#374151")
        .text(
          "This assessment covers all information systems that process, store, or transmit Federal Contract Information (FCI) " +
          "within the above-named scope. FCI is information provided by or generated for the Government under a contract " +
          "to develop or deliver a product or service to the Government, but not intended for public release (see FAR 2.101).",
          { lineBreak: true }
        )
        .fillColor("black");
      doc.moveDown(0.5);
      pdfLV(doc, "CAGE Codes", String(meta.cageCodes ?? "See assessment scope documentation"));
      pdfLV(doc, "Locations / Sites", String(meta.locations ?? "See assessment scope documentation"));
      pdfLV(doc, "System / Asset Boundary", String(meta.assetBoundary ?? "See assessment scope documentation"));
      pdfLV(doc, "External Service Providers (ESPs)", String(meta.esps ?? "See assessment scope documentation"));
      pdfLV(doc, "Users in Scope", String(meta.userCount ?? "See assessment scope documentation"));

      pdfSectionHeader(doc, "Assessment Summary");
      pdfLV(doc, "Total CMMC Level 1 Requirements", "17");
      pdfLV(doc, "Requirements MET", String(metCount));
      pdfLV(doc, "Requirements NOT MET", String(requirements.filter(r => r.finding === "not_met").length));
      pdfLV(doc, "Requirements N/A", String(requirements.filter(r => r.finding === "not_applicable").length));
      // Use clause-level rollup so AND-gate clauses (e.g. (ix)) are handled correctly
      const scopeFarNotMet = farRollup.filter(c => c.result === "not_met").length;
      const scopeFarNotReviewed = farRollup.filter(c => c.result === "not_reviewed").length;
      pdfLV(doc, "FAR 52.204-21 Overall Result",
        scopeFarNotMet === 0 && scopeFarNotReviewed === 0
          ? "SATISFIED"
          : scopeFarNotMet > 0 ? "NOT SATISFIED" : "INCOMPLETE"
      );

      doc.moveDown(2);
      pdfRule(doc);
      doc.fontSize(7.5).font("Helvetica-Oblique").fillColor("#64748b")
        .text(
          `FCI Scope Summary — ${org.name} — ${assessment.assessmentYear} — Generated ${generatedAt.toISOString()} — ` +
          "For official use. This document describes Federal Contract Information scope only. " +
          "CUI (Controlled Unclassified Information) is subject to NIST SP 800-171 and CMMC Level 2.",
          { align: "center" }
        );
    });

    streamFile(res, buf, "application/pdf",
      `FCI_Scope_Summary_${assessment.assessmentYear}_${org.name.replace(/[^A-Za-z0-9]/g, "_").slice(0, 30)}.pdf`);
  } catch (err) {
    (req as any).log?.error(err, "l1 reports: scope-summary failed");
    res.status(500).json({ error: "Failed to generate scope summary" });
  }
});

// ════════════════════════════════════════════════════════════════════════════════
// 7. SPRS Entry Worksheet PDF
// GET /l1-assessment/:id/reports/sprs-worksheet
// ════════════════════════════════════════════════════════════════════════════════

router.get("/sprs-worksheet", requireAuth, requireOrg, async (req, res): Promise<void> => {
  const orgId = req.orgId!;
  if (!(await guardReport(req, res, orgId))) return;

  try {
    const data = await loadAssessmentData(req.params.id as string, orgId, res);
    if (!data) return;

    const { assessment, org, requirements, farRollup, meta } = data;

    const metCount = requirements.filter(r => r.finding === "met").length;
    const notMetCount = requirements.filter(r => r.finding === "not_met").length;
    const naCount = requirements.filter(r => r.finding === "not_applicable").length;
    const farMet = farRollup.filter(c => c.result === "met").length;
    const farNotMet = farRollup.filter(c => c.result === "not_met").length;
    const farNa = farRollup.filter(c => c.result === "not_applicable").length;
    const generatedAt = new Date();

    const dbFindingMap = new Map(requirements.map(r => [r.requirementId, r.finding as FindingValue]));

    const buf = await buildPdf((doc) => {
      // Header
      doc.save().rect(0, 0, 612, 130).fill("#0f2d5e").restore();
      doc.fontSize(17).font("Helvetica-Bold").fillColor("white")
        .text("SPRS ENTRY WORKSHEET", 50, 28, { align: "center", width: 512 });
      doc.fontSize(10).font("Helvetica")
        .text("CMMC Level 1 Annual Self-Assessment — FAR 52.204-21", { align: "center", width: 512 });
      doc.fontSize(9).text("Supplier Performance Risk System (SPRS) — Manual Entry Preparation", { align: "center", width: 512 });
      doc.fillColor("black").moveDown(3.5);

      // Organization & Assessment
      pdfSectionHeader(doc, "Organization & Assessment Information");
      pdfLV(doc, "Organization Name", org.name);
      if ((org as any).legalName) pdfLV(doc, "Legal Name", (org as any).legalName);
      pdfLV(doc, "Scope Name", assessment.scopeName);
      pdfLV(doc, "Assessment Year", String(assessment.assessmentYear));
      pdfLV(doc, "Assessment Title", assessment.title);
      pdfLV(doc, "CAGE Code(s)", String(meta.cageCodes ?? "[Enter CAGE code(s)]"));
      pdfLV(doc, "Employee Count", String(meta.employeeCount ?? "[Enter employee count]"));

      // Affirming Official
      pdfSectionHeader(doc, "Affirming Official");
      pdfLV(doc, "Name", assessment.affirmingOfficialName ?? "[Name of affirming official]");
      pdfLV(doc, "Title", assessment.affirmingOfficialTitle ?? "[Title of affirming official]");
      pdfLV(doc, "Date of Affirmation", fmtDate(assessment.affirmedAt) ?? "[Date]");
      if (meta.cmmcUid) pdfLV(doc, "CMMC UID", String(meta.cmmcUid));

      // SPRS Entry Record (if already recorded)
      pdfSectionHeader(doc, "SPRS Entry Record");
      if (meta.sprsEnteredAt) {
        pdfLV(doc, "Entered By", String(meta.sprsEnteredBy ?? "—"));
        pdfLV(doc, "Entry Date", String(meta.sprsEntryDate ?? "—"));
        pdfLV(doc, "SPRS Reference", String(meta.sprsReference ?? "—"));
        if (meta.sprsEvidence) pdfLV(doc, "Confirmation Evidence", String(meta.sprsEvidence));
      } else {
        doc.fontSize(9).font("Helvetica").fillColor("#64748b")
          .text("SPRS entry not yet recorded. Complete SPRS entry through the system after submitting to SPRS.")
          .fillColor("black");
      }

      // 17-Requirement Summary
      pdfSectionHeader(doc, "17 CMMC Level 1 Requirement Findings");

      const reqCols = [
        { label: "Req ID",   x: 50,  width: 90 },
        { label: "Practice", x: 140, width: 230 },
        { label: "Finding",  x: 370, width: 80 },
        { label: "FAR",      x: 450, width: 60 },
      ];
      const reqHdrY = doc.y;
      pdfTableHeader(doc, reqCols, reqHdrY);
      doc.y = reqHdrY + 15;

      const reqToFar = new Map<string, string[]>();
      for (const clause of FAR_CLAUSE_MAPPING) {
        for (const rid of clause.requirementIds) {
          if (!reqToFar.has(rid)) reqToFar.set(rid, []);
          reqToFar.get(rid)!.push(clause.clause);
        }
      }

      L1_REQUIREMENTS.forEach((req, idx) => {
        if (doc.y > 700) doc.addPage();
        const finding = dbFindingMap.get(req.requirementId) ?? "not_reviewed";
        const farClauses = reqToFar.get(req.requirementId)?.join(", ") ?? "";
        const rowY = doc.y;
        pdfTableRow(doc, [
          { text: req.requirementId,    x: 50,  width: 90 },
          { text: req.requirementTitle, x: 140, width: 230 },
          { text: "",                   x: 370, width: 80 },
          { text: farClauses,           x: 450, width: 60 },
        ], rowY, idx % 2 === 1);
        pdfFindingBadge(doc, finding, 370, rowY);
        doc.y = rowY + 14;
      });

      doc.moveDown(0.5);
      doc.fontSize(8).font("Helvetica-Bold")
        .text(`Summary: ${metCount} MET | ${notMetCount} NOT MET | ${naCount} N/A | ${requirements.filter(r => r.finding === "not_reviewed").length} NOT REVIEWED`);

      // FAR Roll-Up
      pdfSectionHeader(doc, "FAR 52.204-21 Clause Roll-Up");

      const farCols = [
        { label: "Clause",     x: 50,  width: 50 },
        { label: "Description",x: 100, width: 290 },
        { label: "Result",     x: 390, width: 80 },
        { label: "And Gate",   x: 470, width: 55 },
      ];
      const farHdrY = doc.y;
      pdfTableHeader(doc, farCols, farHdrY);
      doc.y = farHdrY + 15;

      farRollup.forEach((clause, idx) => {
        if (doc.y > 700) doc.addPage();
        const rowY = doc.y;
        pdfTableRow(doc, [
          { text: clause.clause,               x: 50,  width: 50 },
          { text: clause.label,                x: 100, width: 290 },
          { text: "",                          x: 390, width: 80 },
          { text: clause.andGate ? "Yes" : "", x: 470, width: 55 },
        ], rowY, idx % 2 === 1);
        pdfFindingBadge(doc, clause.result, 390, rowY);
        doc.y = rowY + 14;
      });

      doc.moveDown(0.5);
      doc.fontSize(8).font("Helvetica-Bold")
        .text(`FAR Summary: ${farMet} Satisfied | ${farNotMet} Not Satisfied | ${farNa} N/A | ${farRollup.filter(c => c.result === "not_reviewed").length} Not Reviewed`);

      // Management Reviewer
      pdfSectionHeader(doc, "Management Reviewer");
      pdfLV(doc, "Submitted By", String(meta.submittedByName ?? meta.submittedById ?? "[Management reviewer name]"));
      pdfLV(doc, "Review Date", fmtDate(assessment.submittedAt));
      if (meta.approvedByName) pdfLV(doc, "Approved By", String(meta.approvedByName));

      // Footer disclaimer
      doc.moveDown(1.5);
      doc.save().rect(50, doc.y, 512, 1).fill("#94a3b8").restore().moveDown(0.4);
      doc.fontSize(8).font("Helvetica-Bold").fillColor("#374151")
        .text("IMPORTANT NOTICE", { align: "center" });
      doc.fontSize(7.5).font("Helvetica").fillColor("#64748b")
        .text(
          "This worksheet is prepared for manual entry into the Supplier Performance Risk System (SPRS). " +
          "Control HUB does not submit to SPRS on your behalf. " +
          "Entry into SPRS must be performed by the Affirming Official or authorized representative. " +
          `Generated: ${generatedAt.toISOString()}`,
          { align: "center" }
        );
    });

    streamFile(res, buf, "application/pdf",
      `SPRS_Worksheet_${assessment.assessmentYear}_${org.name.replace(/[^A-Za-z0-9]/g, "_").slice(0, 30)}.pdf`);
  } catch (err) {
    (req as any).log?.error(err, "l1 reports: sprs-worksheet failed");
    res.status(500).json({ error: "Failed to generate SPRS worksheet" });
  }
});

// ════════════════════════════════════════════════════════════════════════════════
// 8. Affirmation Record PDF
// GET /l1-assessment/:id/reports/affirmation-record
// ════════════════════════════════════════════════════════════════════════════════

router.get("/affirmation-record", requireAuth, requireOrg, async (req, res): Promise<void> => {
  const orgId = req.orgId!;
  if (!(await guardReport(req, res, orgId))) return;

  try {
    const data = await loadAssessmentData(req.params.id as string, orgId, res);
    if (!data) return;

    const { assessment, org, requirements, meta } = data;

    const metCount = requirements.filter(r => r.finding === "met").length;
    const notMetCount = requirements.filter(r => r.finding === "not_met").length;
    const generatedAt = new Date();

    // Compute a hash of key assessment data for audit chain
    const snapshotPayload = JSON.stringify({
      assessmentId: assessment.id,
      organizationId: assessment.organizationId,
      assessmentYear: assessment.assessmentYear,
      findings: requirements.map(r => ({ id: r.requirementId, finding: r.finding })),
      affirmingOfficialName: assessment.affirmingOfficialName,
      affirmedAt: assessment.affirmedAt,
    });
    const snapshotHash = createHash("sha256").update(snapshotPayload).digest("hex");

    const AFFIRMATION_TEXT =
      "I affirm that this Level 1 Annual Self-Assessment accurately represents the current security " +
      "posture of the organization and that the information provided is complete and accurate to the " +
      "best of my knowledge.";

    const buf = await buildPdf((doc) => {
      // Official header
      doc.save().rect(0, 0, 612, 150).fill("#1e3a5f").restore();
      doc.fontSize(18).font("Helvetica-Bold").fillColor("white")
        .text("ANNUAL AFFIRMATION RECORD", 50, 36, { align: "center", width: 512 });
      doc.fontSize(11).font("Helvetica")
        .text("CMMC Level 1 Annual Self-Assessment", { align: "center", width: 512 });
      doc.fontSize(9)
        .text("FAR 52.204-21 — Federal Acquisition Regulation Basic Safeguarding", { align: "center", width: 512 });
      doc.fillColor("black").moveDown(3.5);

      // Status banner
      if (!assessment.affirmedAt) {
        doc.save().rect(50, doc.y, 512, 20).fill("#fef9c3").restore();
        doc.fontSize(9).font("Helvetica-Bold").fillColor("#854d0e")
          .text("⚠  THIS ASSESSMENT HAS NOT YET BEEN AFFIRMED", 60, doc.y + 5, { width: 500 });
        doc.fillColor("black").moveDown(2);
      }

      // Organization
      pdfSectionHeader(doc, "Organization");
      pdfLV(doc, "Organization Name", org.name);
      if ((org as any).legalName) pdfLV(doc, "Legal Name", (org as any).legalName);
      pdfLV(doc, "Assessment Year", String(assessment.assessmentYear));
      pdfLV(doc, "Assessment Title", assessment.title);
      pdfLV(doc, "Scope", assessment.scopeName);

      // Affirming Official
      pdfSectionHeader(doc, "Affirming Official");
      pdfLV(doc, "Full Name", assessment.affirmingOfficialName ?? "—");
      pdfLV(doc, "Title / Position", assessment.affirmingOfficialTitle ?? "—");
      if (meta.officialEmail) pdfLV(doc, "Email", String(meta.officialEmail));
      pdfLV(doc, "Affirmation Date", fmtDate(assessment.affirmedAt));
      if (meta.expirationDate) pdfLV(doc, "Affirmation Expires", fmtDate(String(meta.expirationDate)));
      if (meta.cmmcUid) pdfLV(doc, "CMMC UID (SPRS)", String(meta.cmmcUid));

      // Assessment Summary
      pdfSectionHeader(doc, "Assessment Summary at Time of Affirmation");
      pdfLV(doc, "Total Requirements", "17");
      pdfLV(doc, "MET", String(metCount));
      pdfLV(doc, "NOT MET", String(notMetCount));
      pdfLV(doc, "N/A", String(requirements.filter(r => r.finding === "not_applicable").length));
      pdfLV(doc, "NOT REVIEWED", String(requirements.filter(r => r.finding === "not_reviewed").length));

      // Affirmation Statement
      pdfSectionHeader(doc, "Affirmation Statement");
      doc.moveDown(0.3);
      doc.save().rect(50, doc.y, 512, 55).fill("#f0f9ff").restore();
      doc.fontSize(9.5).font("Helvetica").fillColor("#1e3a5f")
        .text(AFFIRMATION_TEXT, 58, doc.y + 8, { width: 496, lineBreak: true });
      doc.fillColor("black");
      doc.y += 4;
      doc.moveDown(1);

      // Signature block
      doc.moveDown(0.5);
      doc.fontSize(9).font("Helvetica-Bold").text("Affirming Official Signature:");
      doc.moveDown(0.3);
      doc.save().moveTo(50, doc.y + 15).lineTo(280, doc.y + 15).stroke().restore();
      doc.fontSize(8).font("Helvetica").text("Signature", 50, doc.y + 17);
      doc.save().moveTo(310, doc.y + 15 - 17).lineTo(562, doc.y + 15 - 17).stroke().restore();
      doc.text("Date", 310, doc.y + 17 - 17);
      doc.moveDown(2);

      // Audit Chain
      pdfSectionHeader(doc, "Audit Chain & Integrity");
      pdfLV(doc, "Assessment ID", assessment.id);
      pdfLV(doc, "Assessment Hash (SHA-256)", snapshotHash.slice(0, 40) + "...");
      pdfLV(doc, "Full Hash", snapshotHash);
      pdfLV(doc, "Record Generated", generatedAt.toISOString());
      if (assessment.lockedAt) {
        pdfLV(doc, "Assessment Locked At", fmtDate(assessment.lockedAt));
        if (meta.snapshotHash) pdfLV(doc, "Locked Snapshot Hash", String(meta.snapshotHash));
      }

      // Footer
      doc.moveDown(2);
      pdfRule(doc);
      doc.fontSize(7.5).font("Helvetica-Oblique").fillColor("#64748b")
        .text(
          `Annual Affirmation Record — ${org.name} — Assessment Year ${assessment.assessmentYear} — ` +
          `Generated ${generatedAt.toISOString()} — ` +
          "This record documents the annual affirmation required under FAR 52.204-21. Retain for compliance records.",
          { align: "center" }
        );
    });

    streamFile(res, buf, "application/pdf",
      `Affirmation_Record_${assessment.assessmentYear}_${org.name.replace(/[^A-Za-z0-9]/g, "_").slice(0, 30)}.pdf`);
  } catch (err) {
    (req as any).log?.error(err, "l1 reports: affirmation-record failed");
    res.status(500).json({ error: "Failed to generate affirmation record" });
  }
});

// ════════════════════════════════════════════════════════════════════════════════
// 9. Assessment Artifact Hash Manifest XLSX
// GET /l1-assessment/:id/reports/hash-manifest
// ════════════════════════════════════════════════════════════════════════════════

router.get("/hash-manifest", requireAuth, requireOrg, async (req, res): Promise<void> => {
  const orgId = req.orgId!;
  if (!(await guardReport(req, res, orgId))) return;

  try {
    const data = await loadAssessmentData(req.params.id as string, orgId, res);
    if (!data) return;

    const { assessment, org, requirements, evidenceLinks, farRollup, meta } = data;
    const generatedAt = new Date().toISOString();

    // Build artifact blobs and hash each
    const artifacts: Array<{ name: string; payload: string }> = [];

    // Assessment metadata blob
    artifacts.push({
      name: "assessment_metadata",
      payload: JSON.stringify({
        id: assessment.id, orgId: assessment.organizationId,
        year: assessment.assessmentYear, title: assessment.title,
        scopeName: assessment.scopeName, status: assessment.status,
        affirmedAt: assessment.affirmedAt, lockedAt: assessment.lockedAt,
      }),
    });

    // Scope snapshot
    artifacts.push({
      name: "scope_snapshot",
      payload: JSON.stringify({
        scopeName: assessment.scopeName, description: assessment.description,
        assessmentYear: assessment.assessmentYear,
      }),
    });

    // Requirements snapshot (one per requirement)
    for (const req2 of requirements) {
      artifacts.push({
        name: `requirement_${req2.requirementId}`,
        payload: JSON.stringify({
          requirementId: req2.requirementId, canonicalKey: req2.canonicalKey,
          finding: req2.finding, implementationNarrative: req2.implementationNarrative,
          assessorNotes: req2.assessorNotes, naJustification: req2.naJustification,
        }),
      });
    }

    // FAR roll-up snapshot
    artifacts.push({
      name: "far_rollup_snapshot",
      payload: JSON.stringify(farRollup.map(c => ({ clause: c.clause, result: c.result, requirementIds: c.requirementIds }))),
    });

    // Evidence links snapshot
    artifacts.push({
      name: "evidence_links_snapshot",
      payload: JSON.stringify(evidenceLinks.map(e => ({
        id: e.id, requirementId: e.assessmentRequirementId,
        use: e.assessmentUse, qualification: e.qualification,
        fileName: e.fileName, description: e.evidenceDescription,
      }))),
    });

    // SPRS & affirmation metadata
    artifacts.push({
      name: "sprs_affirmation_metadata",
      payload: JSON.stringify({
        affirmingOfficialName: assessment.affirmingOfficialName,
        affirmingOfficialTitle: assessment.affirmingOfficialTitle,
        affirmedAt: assessment.affirmedAt,
        sprsEnteredAt: meta.sprsEnteredAt, sprsEntryDate: meta.sprsEntryDate,
        sprsReference: meta.sprsReference, cmmcUid: meta.cmmcUid,
        expirationDate: meta.expirationDate,
      }),
    });

    const rows: (string | null)[][] = artifacts.map(a => {
      const hash = createHash("sha256").update(a.payload).digest("hex");
      return [a.name, hash, generatedAt, assessment.id, String(Buffer.byteLength(a.payload, "utf8"))];
    });

    // Also include locked snapshot hash if present
    if (meta.snapshotHash) {
      rows.push(["locked_finalization_snapshot", String(meta.snapshotHash), String(assessment.lockedAt ?? ""), assessment.id, "—"]);
    }

    const buf = await buildXlsxMultiSheet([{
      name: "Hash Manifest",
      headers: ["Artifact Name", "SHA-256 Hash", "Generated At", "Assessment ID", "Payload Size (bytes)"],
      rows,
      colWidths: [35, 68, 26, 38, 20],
    }, {
      name: "Readme",
      headers: ["Field", "Value"],
      rows: [
        ["Purpose", "Integrity verification manifest for CMMC Level 1 Annual Self-Assessment artifacts"],
        ["Hash Algorithm", "SHA-256"],
        ["Organization", org.name],
        ["Assessment Year", String(assessment.assessmentYear)],
        ["Assessment ID", assessment.id],
        ["Assessment Status", assessment.status],
        ["Total Artifacts", String(rows.length)],
        ["Manifest Generated At", generatedAt],
        ["Note", "Hashes are computed from structured JSON snapshots of each assessment artifact at download time. " +
          "For locked assessments, compare against the locked_finalization_snapshot row."],
      ],
    }]);

    streamFile(res, buf, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      `Hash_Manifest_${assessment.assessmentYear}_${org.name.replace(/[^A-Za-z0-9]/g, "_").slice(0, 30)}.xlsx`);
  } catch (err) {
    (req as any).log?.error(err, "l1 reports: hash-manifest failed");
    res.status(500).json({ error: "Failed to generate hash manifest" });
  }
});

export default router;
