import { Router } from "express";
import AdmZip from "adm-zip";
import PDFDocument from "pdfkit";
import * as XLSX from "xlsx";
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

// ── Helper: PDF builder ────────────────────────────────────────────────────────
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

// ── Helper: XLSX builder ───────────────────────────────────────────────────────
function buildXlsx(
  headers: string[],
  rows: (string | number | null | undefined)[][]
): Buffer {
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet([
    headers,
    ...rows.map((r) => r.map((v) => v ?? "")),
  ]);
  ws["!cols"] = headers.map((h) => ({ wch: Math.max(h.length + 2, 18) }));
  XLSX.utils.book_append_sheet(wb, ws, "Sheet1");
  return Buffer.from(XLSX.write(wb, { type: "buffer", bookType: "xlsx" }));
}

// ── Helper: safe filename characters ──────────────────────────────────────────
function safeFilename(str: string, maxLen = 40): string {
  return (str ?? "")
    .replace(/[^\w\-_.]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, maxLen) || "file";
}

function fileExt(fileName: string | null | undefined): string {
  if (!fileName) return "";
  const parts = fileName.split(".");
  return parts.length > 1 ? "." + parts.pop()!.toLowerCase() : "";
}

function evidenceExportFilename(
  controlId: string,
  evidenceType: string,
  title: string,
  collectedAt: Date | null | undefined,
  originalFileName: string | null | undefined
): string {
  const ext = fileExt(originalFileName);
  const base = originalFileName ? originalFileName.replace(/\.[^.]+$/, "") : "file";
  const dateStr = collectedAt
    ? new Date(collectedAt).toISOString().slice(0, 10)
    : "unknown";
  const cleanControl = (controlId ?? "CTRL").replace(/\./g, "-");
  const cleanType = (evidenceType ?? "evidence").replace(/_/g, "-");
  const cleanTitle = safeFilename(title, 25);
  const cleanBase = safeFilename(base, 20);
  return `${cleanControl}_${cleanType}_${cleanTitle}_${dateStr}_${cleanBase}${ext}`;
}

// ── Helper: SHA-256 ────────────────────────────────────────────────────────────
function sha256hex(buf: Buffer): string {
  return crypto.createHash("sha256").update(buf).digest("hex");
}

// ── Helper: format date ────────────────────────────────────────────────────────
function fmtD(d: Date | string | null | undefined): string {
  if (!d) return "—";
  try {
    return new Date(d).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return String(d);
  }
}

// ── Helper: fetch file from GCS ────────────────────────────────────────────────
async function fetchGcsFile(fileKey: string): Promise<Buffer | null> {
  try {
    if (!fileKey.startsWith("/objects/")) return null;
    const file = await objectStorageService.getObjectEntityFile(fileKey);
    const [downloaded] = await file.download();
    return downloaded as Buffer;
  } catch {
    return null;
  }
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
      // ── 1. Query all data ──────────────────────────────────────────────────
      const [
        org,
        domains,
        controls,
        assessments,
        evidence,
        evidenceLinks,
        documents,
        docLinks,
        monitoring,
        poams,
        sspMappings,
      ] = await Promise.all([
        db
          .select()
          .from(organizationsTable)
          .where(eq(organizationsTable.id, orgId))
          .limit(1)
          .then((r) => r[0]),
        db.select().from(domainsTable).orderBy(domainsTable.name),
        db.select().from(controlsTable).orderBy(controlsTable.sortOrder),
        db
          .select()
          .from(controlAssessmentsTable)
          .where(eq(controlAssessmentsTable.organizationId, orgId)),
        db
          .select()
          .from(evidenceItemsTable)
          .where(
            and(
              eq(evidenceItemsTable.organizationId, orgId),
              isNull(evidenceItemsTable.deletedAt),
              inArray(
                evidenceItemsTable.status,
                evidenceStatuses as [string, ...string[]]
              )
            )
          ),
        db.select().from(evidenceControlLinksTable),
        db
          .select()
          .from(documentsTable)
          .where(
            and(
              eq(documentsTable.organizationId, orgId),
              inArray(documentsTable.status, [
                "active",
                "approved",
                "assessor_ready",
                "pending_review",
                "draft",
              ] as [string, ...string[]])
            )
          ),
        db.select().from(documentControlMapsTable),
        db
          .select()
          .from(monitoringItemsTable)
          .where(eq(monitoringItemsTable.organizationId, orgId)),
        db
          .select()
          .from(poamsTable)
          .where(eq(poamsTable.organizationId, orgId)),
        db
          .select()
          .from(sspControlMappingsTable)
          .where(eq(sspControlMappingsTable.organizationId, orgId)),
      ]);

      if (!org) {
        return res.status(404).json({ error: "Organization not found" });
      }

      const exportDate = new Date().toISOString().slice(0, 10);
      const orgName = safeFilename(org.name ?? "org", 30);
      const pkgName = `${orgName}_C3PAO_Evidence_Package_${exportDate}`;
      const root = `${pkgName}/`;

      // ── Lookup maps ────────────────────────────────────────────────────────
      const domainMap = new Map(domains.map((d) => [d.id, d]));
      const controlMap = new Map(controls.map((c) => [c.id, c]));
      const assessmentMap = new Map(assessments.map((a) => [a.controlId, a]));

      const evidenceToControls = new Map<string, string[]>();
      const controlToEvidence = new Map<string, string[]>();
      for (const lnk of evidenceLinks) {
        if (!evidenceToControls.has(lnk.evidenceId))
          evidenceToControls.set(lnk.evidenceId, []);
        evidenceToControls.get(lnk.evidenceId)!.push(lnk.controlId);
        if (!controlToEvidence.has(lnk.controlId))
          controlToEvidence.set(lnk.controlId, []);
        controlToEvidence.get(lnk.controlId)!.push(lnk.evidenceId);
      }
      const evidenceMap = new Map(evidence.map((e) => [e.id, e]));

      const docToControls = new Map<string, string[]>();
      const controlToDocs = new Map<string, string[]>();
      for (const lnk of docLinks) {
        if (!docToControls.has(lnk.documentId))
          docToControls.set(lnk.documentId, []);
        docToControls.get(lnk.documentId)!.push(lnk.controlId);
        if (!controlToDocs.has(lnk.controlId))
          controlToDocs.set(lnk.controlId, []);
        controlToDocs.get(lnk.controlId)!.push(lnk.documentId);
      }
      const docMap = new Map(documents.map((d) => [d.id, d]));

      const controlToPoams = new Map<string, typeof poams>();
      for (const p of poams) {
        if (p.linkedControlId) {
          if (!controlToPoams.has(p.linkedControlId))
            controlToPoams.set(p.linkedControlId, []);
          controlToPoams.get(p.linkedControlId)!.push(p);
        }
      }

      const sspMap = new Map(
        sspMappings.map((s) => [s.controlDbId ?? s.controlRef, s])
      );

      // Group controls by domain
      const controlsByDomain = new Map<string, typeof controls>();
      for (const c of controls) {
        if (!controlsByDomain.has(c.domainId))
          controlsByDomain.set(c.domainId, []);
        controlsByDomain.get(c.domainId)!.push(c);
      }

      // ── ZIP builder ────────────────────────────────────────────────────────
      const zip = new AdmZip();
      const hashManifestRows: (string | number)[][] = [];
      const missingFiles: {
        title: string;
        fileKey: string | null;
        zipPath: string;
      }[] = [];

      const usedFilenames = new Set<string>();
      function uniquePath(preferred: string): string {
        if (!usedFilenames.has(preferred)) {
          usedFilenames.add(preferred);
          return preferred;
        }
        const lastDot = preferred.lastIndexOf(".");
        const base = lastDot >= 0 ? preferred.slice(0, lastDot) : preferred;
        const ext = lastDot >= 0 ? preferred.slice(lastDot) : "";
        let i = 1;
        while (usedFilenames.has(`${base}_${String(i).padStart(2, "0")}${ext}`))
          i++;
        const unique = `${base}_${String(i).padStart(2, "0")}${ext}`;
        usedFilenames.add(unique);
        return unique;
      }

      const evidenceZipPaths = new Map<string, string>();
      const docZipPaths = new Map<string, string>();

      function addToZip(zipPath: string, buf: Buffer): void {
        zip.addFile(zipPath, buf);
        if (includeHashManifest) {
          hashManifestRows.push([
            zipPath,
            zipPath.split("/").pop() ?? "",
            buf.length,
            sha256hex(buf),
            new Date().toISOString(),
          ]);
        }
      }

      // ── 00_README ─────────────────────────────────────────────────────────
      const statusCounts = {
        implemented: 0,
        in_progress: 0,
        not_started: 0,
        not_applicable: 0,
        planned: 0,
      };
      for (const a of assessments) {
        if (a.status in statusCounts)
          (statusCounts as Record<string, number>)[a.status]++;
        else statusCounts.not_started++;
      }
      statusCounts.not_started += controls.length - assessments.length;

      const readmePdf = await buildPdf((doc) => {
        doc
          .fontSize(22)
          .font("Helvetica-Bold")
          .text("C3PAO Evidence Export Package", { align: "center" });
        doc.moveDown(0.5);
        doc
          .fontSize(14)
          .font("Helvetica")
          .text(org.name, { align: "center" });
        doc.text(`Export Date: ${exportDate}`, { align: "center" });
        doc.moveDown(2);

        const meta = [
          ["Organization", org.name],
          ["Export Date", exportDate],
          ["CMMC Target Level", "Level 2"],
          ["Total Controls", String(controls.length)],
          ["Evidence Items Included", String(evidence.length)],
          ["Documents Included", String(documents.length)],
          ["POA&M Items", String(poams.length)],
          ["Monitoring Items", String(monitoring.length)],
        ];
        for (const [k, v] of meta) {
          doc
            .font("Helvetica-Bold")
            .text(`${k}: `, { continued: true })
            .font("Helvetica")
            .text(v);
        }

        doc.moveDown(2);
        doc.fontSize(12).font("Helvetica-Bold").text("Package Contents");
        doc.moveDown(0.5);
        doc.fontSize(10).font("Helvetica");
        const folders = [
          "00_README — This README, metadata, and package index",
          "01_Assessment_Overview — Executive readiness and domain reports",
          "02_SSP — System Security Plan narrative and control mapping",
          "03_Control_Packages — Per-control packages organised by domain",
          "04_All_Evidence — Consolidated evidence files and inventory spreadsheet",
          "05_All_Documents — Policy/procedure documents and inventory",
          "06_Monitoring — Operational monitoring tracker records",
          "07_POAM — Plan of Action & Milestones register",
          "08_Reports — Comprehensive compliance reports including gap analysis",
          "09_Manifests — File hash manifest, audit log, and cross-reference maps",
        ];
        for (const f of folders) {
          doc.text(`  • ${f}`);
        }

        doc.moveDown(2);
        doc
          .fontSize(9)
          .font("Helvetica-Oblique")
          .text(
            "This export package is prepared to support C3PAO assessment review under CMMC Level 2. " +
              "Control HUB remains the authoritative source for metadata, mappings, and audit history. " +
              "This document contains confidential information. Handle in accordance with your organisation's data handling policy."
          );
      });
      addToZip(`${root}00_README/README.pdf`, readmePdf);

      if (includeMetadataJson) {
        const meta = {
          package: pkgName,
          organization: org.name,
          organizationId: org.id,
          exportDate,
          cmmcLevel: "L2",
          generatedBy: {
            id: user.id,
            name: user.name,
            email: user.email,
            role: user.role,
          },
          options: {
            includeApproved,
            includeAssessorReady,
            includeDraft,
            includePendingReview,
            includeArchived,
            includeInternalNotes,
          },
          counts: {
            controls: controls.length,
            evidence: evidence.length,
            documents: documents.length,
            poams: poams.length,
            monitoring: monitoring.length,
          },
        };
        addToZip(
          `${root}00_README/Package_Metadata.json`,
          Buffer.from(JSON.stringify(meta, null, 2))
        );
      }

      // ── 01_Assessment_Overview ────────────────────────────────────────────
      const total = controls.length;
      const impl = statusCounts.implemented;
      const pct = total > 0 ? Math.round((impl / total) * 100) : 0;

      const execPdf = await buildPdf((doc) => {
        doc
          .fontSize(20)
          .font("Helvetica-Bold")
          .text("Executive Readiness Report", { align: "center" });
        doc
          .fontSize(12)
          .font("Helvetica")
          .text(org.name, { align: "center" });
        doc.text(`Export Date: ${exportDate}`, { align: "center" });
        doc.moveDown(2);

        doc
          .fontSize(14)
          .font("Helvetica-Bold")
          .text("Control Implementation Summary");
        doc.moveDown(0.5);
        doc.fontSize(11).font("Helvetica");
        doc.text(
          `Overall Readiness: ${pct}% (${impl} of ${total} controls implemented)`
        );
        doc.moveDown(0.5);
        const sCounts = [
          ["Implemented", statusCounts.implemented],
          ["In Progress", statusCounts.in_progress],
          ["Planned", statusCounts.planned],
          ["Not Started", statusCounts.not_started],
          ["Not Applicable", statusCounts.not_applicable],
        ];
        for (const [label, count] of sCounts) {
          doc.text(`  ${label}: ${count}`);
        }

        doc.moveDown(1.5);
        doc.fontSize(14).font("Helvetica-Bold").text("Evidence Summary");
        doc.moveDown(0.5);
        doc.fontSize(11).font("Helvetica");
        doc.text(`Total Evidence Items: ${evidence.length}`);
        const byStatus = new Map<string, number>();
        for (const e of evidence) {
          byStatus.set(e.status, (byStatus.get(e.status) ?? 0) + 1);
        }
        for (const [status, cnt] of byStatus) {
          doc.text(`  ${status.replace(/_/g, " ")}: ${cnt}`);
        }

        doc.moveDown(1.5);
        doc
          .fontSize(14)
          .font("Helvetica-Bold")
          .text("Domain Readiness Breakdown");
        doc.moveDown(0.5);
        doc.fontSize(10).font("Helvetica");
        for (const [domainId, domainControls] of controlsByDomain) {
          const domain = domainMap.get(domainId);
          if (!domain) continue;
          const domImpl = domainControls.filter(
            (c) => assessmentMap.get(c.id)?.status === "implemented"
          ).length;
          const domPct =
            domainControls.length > 0
              ? Math.round((domImpl / domainControls.length) * 100)
              : 0;
          doc.text(
            `${domain.name} (${domain.abbreviation ?? ""}): ${domPct}% — ${domImpl}/${domainControls.length}`
          );
        }

        doc.moveDown(2);
        doc
          .fontSize(9)
          .font("Helvetica-Oblique")
          .text("Generated by Control HUB — Confidential");
      });
      addToZip(
        `${root}01_Assessment_Overview/${orgName}_Executive_Readiness_Report.pdf`,
        execPdf
      );

      const domainPdf = await buildPdf((doc) => {
        doc
          .fontSize(20)
          .font("Helvetica-Bold")
          .text("Domain Readiness Report", { align: "center" });
        doc
          .fontSize(12)
          .font("Helvetica")
          .text(org.name, { align: "center" });
        doc.text(`Export Date: ${exportDate}`, { align: "center" });
        doc.moveDown(2);

        for (const [domainId, domainControls] of controlsByDomain) {
          const domain = domainMap.get(domainId);
          if (!domain) continue;
          doc
            .fontSize(13)
            .font("Helvetica-Bold")
            .text(`${domain.name} (${domain.abbreviation ?? ""})`);
          doc.moveDown(0.3);
          doc.fontSize(9).font("Helvetica");
          for (const ctrl of domainControls) {
            const assessment = assessmentMap.get(ctrl.id);
            const evCount = (controlToEvidence.get(ctrl.id) ?? []).length;
            const status = assessment?.status ?? "not_started";
            doc.text(
              `  ${ctrl.controlId}: ${ctrl.title} — ${status.replace(/_/g, " ")} (${evCount} evidence)`
            );
          }
          doc.moveDown(1);
        }
        doc
          .fontSize(9)
          .font("Helvetica-Oblique")
          .text("Generated by Control HUB — Confidential");
      });
      addToZip(
        `${root}01_Assessment_Overview/${orgName}_Domain_Readiness_Report.pdf`,
        domainPdf
      );

      // ── 02_SSP ────────────────────────────────────────────────────────────
      const sspPdf = await buildPdf((doc) => {
        doc
          .fontSize(20)
          .font("Helvetica-Bold")
          .text("System Security Plan", { align: "center" });
        doc
          .fontSize(12)
          .font("Helvetica")
          .text(org.name, { align: "center" });
        doc.text(`Export Date: ${exportDate}`, { align: "center" });
        doc.moveDown(2);

        for (const ctrl of controls) {
          const mapping = sspMap.get(ctrl.id) ?? sspMap.get(ctrl.controlId);
          const assessment = assessmentMap.get(ctrl.id);
          const narrative =
            mapping?.implementationNarrative ||
            assessment?.implementationNarrative ||
            "";
          if (!narrative) continue;

          doc
            .fontSize(11)
            .font("Helvetica-Bold")
            .text(`${ctrl.controlId} — ${ctrl.title}`);
          doc.moveDown(0.2);
          doc.fontSize(9).font("Helvetica").text(narrative);
          doc.moveDown(1);
        }
        doc
          .fontSize(9)
          .font("Helvetica-Oblique")
          .text("Generated by Control HUB — Confidential");
      });
      addToZip(`${root}02_SSP/${orgName}_System_Security_Plan.pdf`, sspPdf);

      addToZip(
        `${root}02_SSP/SSP_Control_Mapping.xlsx`,
        buildXlsx(
          [
            "Control ID",
            "Control Title",
            "Domain",
            "Level",
            "Status",
            "SSP Narrative",
            "Policy Reference",
            "SSP Status",
          ],
          controls.map((ctrl) => {
            const domain = domainMap.get(ctrl.domainId);
            const assessment = assessmentMap.get(ctrl.id);
            const mapping =
              sspMap.get(ctrl.id) ?? sspMap.get(ctrl.controlId);
            return [
              ctrl.controlId,
              ctrl.title,
              domain?.name ?? "",
              ctrl.level,
              assessment?.status?.replace(/_/g, " ") ?? "not started",
              mapping?.implementationNarrative ??
                assessment?.implementationNarrative ??
                "",
              mapping?.policyReference ?? "",
              mapping?.sspStatus ?? "",
            ];
          })
        )
      );

      // ── 03_Control_Packages ───────────────────────────────────────────────
      for (const [domainId, domainControls] of controlsByDomain) {
        const domain = domainMap.get(domainId);
        if (!domain) continue;
        const domAbbrev =
          domain.abbreviation ?? domain.name.slice(0, 4).toUpperCase();

        for (const ctrl of domainControls) {
          const assessment = assessmentMap.get(ctrl.id);
          const mapping = sspMap.get(ctrl.id) ?? sspMap.get(ctrl.controlId);
          const ctrlEvidence = (controlToEvidence.get(ctrl.id) ?? [])
            .map((id) => evidenceMap.get(id))
            .filter(Boolean) as typeof evidence;
          const ctrlDocs = (controlToDocs.get(ctrl.id) ?? [])
            .map((id) => docMap.get(id))
            .filter(Boolean) as typeof documents;
          const ctrlPoams = controlToPoams.get(ctrl.id) ?? [];
          const ctrlPath = `${root}03_Control_Packages/${domAbbrev}/${ctrl.controlId}/`;

          const implNarrative =
            assessment?.implementationNarrative ??
            "(No implementation narrative recorded)";
          const sspNarrative =
            mapping?.implementationNarrative ??
            assessment?.implementationNarrative ??
            "(No SSP narrative recorded)";

          addToZip(
            `${ctrlPath}Implementation_Narrative.txt`,
            Buffer.from(implNarrative, "utf8")
          );
          addToZip(
            `${ctrlPath}SSP_Narrative.txt`,
            Buffer.from(sspNarrative, "utf8")
          );

          const summaryPdf = await buildPdf((doc) => {
            doc
              .fontSize(16)
              .font("Helvetica-Bold")
              .text(`Control Package: ${ctrl.controlId}`);
            doc.fontSize(12).font("Helvetica").text(ctrl.title);
            doc.moveDown(0.5);
            doc.fontSize(10);
            doc.text(`Domain: ${domain.name} (${domAbbrev})`);
            doc.text(`Level: ${ctrl.level}`);
            doc.text(
              `Status: ${assessment?.status?.replace(/_/g, " ") ?? "not started"}`
            );
            if (assessment?.isNotApplicable)
              doc.text(`Not Applicable: Yes — ${assessment.naJustification ?? ""}`);
            doc.text(`Last Assessed: ${fmtD(assessment?.lastAssessedAt)}`);
            if (ctrl.nistRef)
              doc.text(`NIST SP 800-171 Ref: ${ctrl.nistRef}`);

            doc.moveDown(1);
            doc.font("Helvetica-Bold").text("Control Description:");
            doc.font("Helvetica").text(ctrl.description ?? "");
            doc.moveDown(1);

            doc
              .font("Helvetica-Bold")
              .text("Implementation Narrative:");
            doc.font("Helvetica").text(implNarrative);
            doc.moveDown(1);

            if (assessment?.assessorNotes) {
              doc.font("Helvetica-Bold").text("Assessor Notes:");
              doc.font("Helvetica").text(assessment.assessorNotes);
              doc.moveDown(1);
            }

            if (includeInternalNotes && assessment?.assessorNotes) {
              doc.font("Helvetica-Bold").text("Internal Notes:");
              doc
                .font("Helvetica")
                .text(assessment.assessorNotes ?? "(none)");
              doc.moveDown(1);
            }

            doc
              .font("Helvetica-Bold")
              .text(`Evidence (${ctrlEvidence.length} items):`);
            doc.font("Helvetica");
            if (ctrlEvidence.length === 0) {
              doc.text("  No evidence linked to this control.");
            } else {
              for (const e of ctrlEvidence) {
                doc.text(
                  `  • ${e.title} [${e.evidenceType}] — ${e.status.replace(/_/g, " ")} — collected ${fmtD(e.collectedAt)}`
                );
              }
            }
            doc.moveDown(1);

            doc
              .font("Helvetica-Bold")
              .text(`Linked Documents (${ctrlDocs.length}):`);
            doc.font("Helvetica");
            if (ctrlDocs.length === 0) {
              doc.text("  No documents linked to this control.");
            } else {
              for (const d of ctrlDocs) {
                doc.text(
                  `  • ${d.title} [${d.docType ?? "—"}] — ${d.status}`
                );
              }
            }
            doc.moveDown(1);

            doc
              .font("Helvetica-Bold")
              .text(`Open POA&M Items (${ctrlPoams.length}):`);
            doc.font("Helvetica");
            if (ctrlPoams.length === 0) {
              doc.text("  No open POA&M items.");
            } else {
              for (const p of ctrlPoams) {
                doc.text(
                  `  • ${p.poamNumber ?? p.id.slice(0, 8)}: ${p.title} — ${p.status} — ${p.riskLevel} risk — due ${fmtD(p.scheduledCompletionDate)}`
                );
              }
            }
          });
          addToZip(`${ctrlPath}Control_Summary.pdf`, summaryPdf);

          // Evidence files under 03_Control_Packages
          for (const ev of ctrlEvidence) {
            if (!ev.fileKey) continue;
            const exportName = evidenceExportFilename(
              ctrl.controlId,
              ev.evidenceType,
              ev.title,
              ev.collectedAt,
              ev.fileName
            );
            const evPath = uniquePath(
              `${ctrlPath}Evidence/${exportName}`
            );
            if (!evidenceZipPaths.has(ev.id)) {
              const buf = await fetchGcsFile(ev.fileKey);
              if (buf) {
                evidenceZipPaths.set(ev.id, evPath);
                addToZip(evPath, buf);
              } else {
                missingFiles.push({
                  title: ev.title,
                  fileKey: ev.fileKey,
                  zipPath: evPath,
                });
              }
            }
          }

          // Document files under 03_Control_Packages
          for (const d of ctrlDocs) {
            if (!d.fileKey) continue;
            const docExportName =
              safeFilename(d.title, 40) + fileExt(d.fileName);
            const docPath = uniquePath(
              `${ctrlPath}Documents/${docExportName}`
            );
            if (!docZipPaths.has(d.id)) {
              const buf = await fetchGcsFile(d.fileKey);
              if (buf) {
                docZipPaths.set(d.id, docPath);
                addToZip(docPath, buf);
              } else {
                missingFiles.push({
                  title: d.title,
                  fileKey: d.fileKey,
                  zipPath: docPath,
                });
              }
            }
          }
        }
      }

      // ── 04_All_Evidence ───────────────────────────────────────────────────
      for (const ev of evidence) {
        if (!ev.fileKey || evidenceZipPaths.has(ev.id)) continue;
        const exportName = evidenceExportFilename(
          "ALL",
          ev.evidenceType,
          ev.title,
          ev.collectedAt,
          ev.fileName
        );
        const evPath = uniquePath(
          `${root}04_All_Evidence/files/${exportName}`
        );
        const buf = await fetchGcsFile(ev.fileKey);
        if (buf) {
          evidenceZipPaths.set(ev.id, evPath);
          addToZip(evPath, buf);
        } else {
          missingFiles.push({
            title: ev.title,
            fileKey: ev.fileKey,
            zipPath: evPath,
          });
        }
      }

      addToZip(
        `${root}04_All_Evidence/Evidence_Inventory.xlsx`,
        buildXlsx(
          [
            "Evidence ID",
            "Title",
            "Original File Name",
            "Evidence Type",
            "Status",
            "Linked Controls",
            "Collection Date",
            "Expiration Date",
            "Assessor Summary",
            ...(includeInternalNotes ? ["Internal Notes"] : []),
            "File Path in ZIP",
            "SHA-256 (Source)",
          ],
          evidence.map((ev) => {
            const controlIds = (evidenceToControls.get(ev.id) ?? [])
              .map((cid) => controlMap.get(cid)?.controlId ?? cid)
              .join("; ");
            return [
              ev.id,
              ev.title,
              ev.fileName ?? "—",
              ev.evidenceType.replace(/_/g, " "),
              ev.status.replace(/_/g, " "),
              controlIds,
              fmtD(ev.collectedAt),
              fmtD(ev.expiresAt),
              ev.assessorSummary ?? "",
              ...(includeInternalNotes ? [ev.internalNotes ?? ""] : []),
              evidenceZipPaths.get(ev.id) ?? "—",
              ev.fileHash ?? "—",
            ];
          })
        )
      );

      // ── 05_All_Documents ──────────────────────────────────────────────────
      for (const d of documents) {
        if (!d.fileKey || docZipPaths.has(d.id)) continue;
        const docExportName =
          safeFilename(d.title, 40) + fileExt(d.fileName);
        const docPath = uniquePath(
          `${root}05_All_Documents/files/${docExportName}`
        );
        const buf = await fetchGcsFile(d.fileKey);
        if (buf) {
          docZipPaths.set(d.id, docPath);
          addToZip(docPath, buf);
        } else {
          missingFiles.push({
            title: d.title,
            fileKey: d.fileKey,
            zipPath: docPath,
          });
        }
      }

      addToZip(
        `${root}05_All_Documents/Document_Inventory.xlsx`,
        buildXlsx(
          [
            "Document ID",
            "Title",
            "Document Type",
            "Status",
            "Linked Controls",
            "Effective Date",
            "Next Review Date",
            "File Path in ZIP",
          ],
          documents.map((d) => {
            const controlIds = (docToControls.get(d.id) ?? [])
              .map((cid) => controlMap.get(cid)?.controlId ?? cid)
              .join("; ");
            return [
              d.id,
              d.title,
              d.docType ?? "—",
              d.status,
              controlIds,
              fmtD(d.effectiveDate),
              fmtD(d.nextReviewDate),
              docZipPaths.get(d.id) ?? "—",
            ];
          })
        )
      );

      // ── 06_Monitoring ─────────────────────────────────────────────────────
      addToZip(
        `${root}06_Monitoring/Monitoring_Tracker.xlsx`,
        buildXlsx(
          [
            "Title",
            "Frequency",
            "Status",
            "Last Completed",
            "Next Due",
            "Notes",
          ],
          monitoring.map((m) => [
            m.title,
            m.frequency,
            m.status,
            fmtD(m.lastCompleted),
            fmtD(m.nextDue),
            (m as Record<string, unknown>).notes as string ?? "",
          ])
        )
      );

      const monPdf = await buildPdf((doc) => {
        doc
          .fontSize(18)
          .font("Helvetica-Bold")
          .text("Monitoring Tracker Report", { align: "center" });
        doc
          .fontSize(11)
          .font("Helvetica")
          .text(org.name, { align: "center" });
        doc.text(`Export Date: ${exportDate}`, { align: "center" });
        doc.moveDown(2);

        const overdue = monitoring.filter((m) => m.status === "overdue").length;
        const complete = monitoring.filter((m) => m.status === "complete").length;
        doc.text(
          `Total: ${monitoring.length}  |  Complete: ${complete}  |  Overdue: ${overdue}`
        );
        doc.moveDown(1);
        for (const m of monitoring) {
          doc.font("Helvetica-Bold").fontSize(10).text(m.title);
          doc
            .font("Helvetica")
            .fontSize(9)
            .text(
              `  Frequency: ${m.frequency}  |  Status: ${m.status}  |  Last: ${fmtD(m.lastCompleted)}  |  Next: ${fmtD(m.nextDue)}`
            );
          doc.moveDown(0.5);
        }
        doc
          .fontSize(9)
          .font("Helvetica-Oblique")
          .text("Generated by Control HUB — Confidential");
      });
      addToZip(`${root}06_Monitoring/Monitoring_Tracker_Report.pdf`, monPdf);

      // ── 07_POAM ───────────────────────────────────────────────────────────
      addToZip(
        `${root}07_POAM/POAM_Register.xlsx`,
        buildXlsx(
          [
            "POAM Number",
            "Title",
            "Deficiency Description",
            "Status",
            "Risk Level",
            "Linked Control",
            "Scheduled Completion",
            "Completed Date",
            "Remediation Plan",
            "Resources Required",
          ],
          poams.map((p) => {
            const ctrl = p.linkedControlId
              ? controlMap.get(p.linkedControlId)
              : null;
            return [
              p.poamNumber ?? "—",
              p.title,
              p.deficiencyDescription,
              p.status,
              p.riskLevel,
              ctrl?.controlId ?? "—",
              fmtD(p.scheduledCompletionDate),
              fmtD(p.completedDate),
              p.remediationPlan ?? "",
              p.resourcesRequired ?? "",
            ];
          })
        )
      );

      const poamPdf = await buildPdf((doc) => {
        doc
          .fontSize(18)
          .font("Helvetica-Bold")
          .text("Plan of Action & Milestones (POA&M) Report", {
            align: "center",
          });
        doc
          .fontSize(11)
          .font("Helvetica")
          .text(org.name, { align: "center" });
        doc.text(`Export Date: ${exportDate}`, { align: "center" });
        doc.moveDown(2);

        const openPoams = poams.filter(
          (p) => p.status === "open" || p.status === "in_progress"
        ).length;
        doc.text(
          `Total POA&M Items: ${poams.length}  |  Open/In Progress: ${openPoams}`
        );
        doc.moveDown(1);

        for (const p of poams) {
          const ctrl = p.linkedControlId
            ? controlMap.get(p.linkedControlId)
            : null;
          doc
            .font("Helvetica-Bold")
            .fontSize(11)
            .text(`${p.poamNumber ?? "POAM"}: ${p.title}`);
          doc.font("Helvetica").fontSize(9);
          doc.text(
            `  Control: ${ctrl?.controlId ?? "—"}  |  Status: ${p.status}  |  Risk: ${p.riskLevel}`
          );
          doc.text(
            `  Scheduled Completion: ${fmtD(p.scheduledCompletionDate)}`
          );
          doc.moveDown(0.3);
          doc.text(`  Deficiency: ${p.deficiencyDescription}`);
          if (p.remediationPlan) {
            doc.text(`  Remediation: ${p.remediationPlan}`);
          }
          doc.moveDown(0.8);
        }
        doc
          .fontSize(9)
          .font("Helvetica-Oblique")
          .text("Generated by Control HUB — Confidential");
      });
      addToZip(`${root}07_POAM/POAM_Report.pdf`, poamPdf);

      // ── 08_Reports ────────────────────────────────────────────────────────
      // Re-use already-built PDFs
      addToZip(
        `${root}08_Reports/Executive_Readiness_Report.pdf`,
        execPdf
      );
      addToZip(
        `${root}08_Reports/Domain_Readiness_Report.pdf`,
        domainPdf
      );

      const gapPdf = await buildPdf((doc) => {
        doc
          .fontSize(18)
          .font("Helvetica-Bold")
          .text("Gap Analysis Report", { align: "center" });
        doc
          .fontSize(11)
          .font("Helvetica")
          .text(org.name, { align: "center" });
        doc.text(`Export Date: ${exportDate}`, { align: "center" });
        doc.moveDown(2);

        const gaps = controls.filter((c) => {
          const a = assessmentMap.get(c.id);
          return (
            (!a || a.status === "not_started") &&
            (controlToEvidence.get(c.id) ?? []).length === 0
          );
        });
        doc.text(
          `Controls with no evidence and not assessed: ${gaps.length} of ${controls.length}`
        );
        doc.moveDown(1);

        for (const c of gaps) {
          const domain = domainMap.get(c.domainId);
          doc
            .font("Helvetica-Bold")
            .fontSize(10)
            .text(`${c.controlId}: ${c.title}`);
          doc
            .font("Helvetica")
            .fontSize(9)
            .text(`  Domain: ${domain?.name ?? "—"}  |  Level: ${c.level}`);
          doc.moveDown(0.5);
        }
        doc
          .fontSize(9)
          .font("Helvetica-Oblique")
          .text("Generated by Control HUB — Confidential");
      });
      addToZip(`${root}08_Reports/Gap_Analysis_Report.pdf`, gapPdf);

      // ── 09_Manifests ──────────────────────────────────────────────────────
      const ctrlEvRows: (string | number)[][] = [];
      for (const ctrl of controls) {
        const domain = domainMap.get(ctrl.domainId);
        const assessment = assessmentMap.get(ctrl.id);
        const ctrlEvidence = (controlToEvidence.get(ctrl.id) ?? [])
          .map((id) => evidenceMap.get(id))
          .filter(Boolean) as typeof evidence;
        if (ctrlEvidence.length === 0) {
          ctrlEvRows.push([
            ctrl.controlId,
            ctrl.title,
            domain?.name ?? "",
            ctrl.level,
            assessment?.status ?? "not_started",
            "—",
            "—",
            "—",
            "—",
            "—",
          ]);
        } else {
          for (const ev of ctrlEvidence) {
            ctrlEvRows.push([
              ctrl.controlId,
              ctrl.title,
              domain?.name ?? "",
              ctrl.level,
              assessment?.status?.replace(/_/g, " ") ?? "not started",
              ev.title,
              ev.evidenceType.replace(/_/g, " "),
              ev.status.replace(/_/g, " "),
              evidenceZipPaths.get(ev.id) ?? "—",
              fmtD(ev.collectedAt),
            ]);
          }
        }
      }
      addToZip(
        `${root}09_Manifests/Control_to_Evidence_Map.xlsx`,
        buildXlsx(
          [
            "Control ID",
            "Control Title",
            "Domain",
            "Level",
            "Control Status",
            "Evidence Title",
            "Evidence Type",
            "Evidence Status",
            "Evidence File Path",
            "Collection Date",
          ],
          ctrlEvRows
        )
      );

      const ctrlDocRows: (string | number)[][] = [];
      for (const ctrl of controls) {
        const ctrlDocs = (controlToDocs.get(ctrl.id) ?? [])
          .map((id) => docMap.get(id))
          .filter(Boolean) as typeof documents;
        if (ctrlDocs.length === 0) {
          ctrlDocRows.push([ctrl.controlId, ctrl.title, "—", "—", "—", "—", "—"]);
        } else {
          for (const d of ctrlDocs) {
            ctrlDocRows.push([
              ctrl.controlId,
              ctrl.title,
              d.docType ?? "—",
              d.title,
              d.status,
              docZipPaths.get(d.id) ?? "—",
              fmtD(d.nextReviewDate),
            ]);
          }
        }
      }
      addToZip(
        `${root}09_Manifests/Control_to_Document_Map.xlsx`,
        buildXlsx(
          [
            "Control ID",
            "Control Title",
            "Document Type",
            "Document Title",
            "Document Status",
            "Document File Path",
            "Next Review Date",
          ],
          ctrlDocRows
        )
      );

      if (includeHashManifest && hashManifestRows.length > 0) {
        addToZip(
          `${root}09_Manifests/File_Hash_Manifest.xlsx`,
          buildXlsx(
            [
              "File Path in ZIP",
              "Original Filename",
              "File Size (bytes)",
              "SHA-256 Hash",
              "Export Timestamp",
            ],
            hashManifestRows
          )
        );
      }

      addToZip(
        `${root}09_Manifests/Export_Audit_Log.xlsx`,
        buildXlsx(
          ["Field", "Value"],
          [
            ["Generated By", `${user.name} (${user.email})`],
            ["Role", user.role],
            ["Organization", org.name],
            ["Organization ID", org.id],
            ["Export Date", exportDate],
            ["Export Timestamp", new Date().toISOString()],
            ["CMMC Level", "L2"],
            ["Include Approved Evidence", String(includeApproved)],
            ["Include Assessor Ready Evidence", String(includeAssessorReady)],
            ["Include Draft Evidence", String(includeDraft)],
            ["Include Pending Review Evidence", String(includePendingReview)],
            ["Include Archived Evidence", String(includeArchived)],
            ["Include Internal Notes", String(includeInternalNotes)],
            ["Total Controls", controls.length],
            ["Evidence Items Included", evidence.length],
            ["Documents Included", documents.length],
            ["POA&M Items", poams.length],
            ["Monitoring Items", monitoring.length],
            ["Files Missing from Storage", missingFiles.length],
          ]
        )
      );

      if (missingFiles.length > 0) {
        addToZip(
          `${root}09_Manifests/Export_Issues.xlsx`,
          buildXlsx(
            ["Title", "File Key", "Intended ZIP Path", "Note"],
            missingFiles.map((f) => [
              f.title,
              f.fileKey ?? "—",
              f.zipPath,
              "File metadata exists but content could not be retrieved from storage",
            ])
          )
        );
      }

      if (includeMetadataJson) {
        addToZip(
          `${root}09_Manifests/Package_Metadata.json`,
          Buffer.from(
            JSON.stringify(
              {
                package: pkgName,
                organization: org.name,
                exportDate,
                cmmcLevel: "L2",
                counts: {
                  controls: controls.length,
                  evidence: evidence.length,
                  documents: documents.length,
                  poams: poams.length,
                  monitoring: monitoring.length,
                },
                missingFiles: missingFiles.length,
              },
              null,
              2
            )
          )
        );
      }

      // ── Stream ZIP ────────────────────────────────────────────────────────
      const zipBuffer = zip.toBuffer();
      const zipName = `${pkgName}.zip`;

      res.setHeader("Content-Type", "application/zip");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="${zipName}"`
      );
      res.setHeader("Content-Length", zipBuffer.length);
      res.send(zipBuffer);

      req.log.info(
        {
          org: org.name,
          files: hashManifestRows.length,
          missingFiles: missingFiles.length,
          size: zipBuffer.length,
        },
        "C3PAO export package generated"
      );
    } catch (err) {
      req.log.error({ err }, "Failed to generate C3PAO export package");
      if (!res.headersSent) {
        res.status(500).json({ error: "Failed to generate export package" });
      }
    }
  }
);

export default router;
