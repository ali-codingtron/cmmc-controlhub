import { Router } from "express";
import archiver from "archiver";
import PDFDocument from "pdfkit";
import * as XLSX from "xlsx";
import crypto from "crypto";
import path from "path";
import { db } from "@workspace/db";
import {
  controlsTable,
  domainsTable,
  evidenceItemsTable,
  evidenceControlLinksTable,
  documentsTable,
  documentControlMapsTable,
  usersTable,
  organizationsTable,
  auditLogsTable,
} from "@workspace/db";
import { eq, and, inArray, isNull } from "drizzle-orm";
import { requireAuth } from "../lib/auth";
import { requireOrg } from "../middleware/org";
import { ObjectStorageService } from "../lib/objectStorage";

const router = Router();
const objectStorageService = new ObjectStorageService();

// ── CMMC domain codes ──────────────────────────────────────────────────────────
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

function domainCode(name: string): string {
  return CMMC_DOMAIN_CODES[name] ?? (name.replace(/[^A-Z]/g, "").slice(0, 2) || "XX");
}

function domainFolderName(name: string): string {
  const code = domainCode(name);
  const safe = name.replace(/[^\w\s]/g, "").replace(/\s+/g, "_");
  return `${code}_${safe}`;
}

function typeFolder(type: string, recordType: "Evidence" | "Document"): string {
  if (recordType === "Document") {
    const t = type.toLowerCase();
    if (t === "policy") return "Policies";
    if (t === "procedure") return "Procedures";
    if (t.includes("log") || t.includes("register") || t.includes("checklist")) return "Logs_and_Records";
    if (t.includes("training")) return "Training";
    if (t.includes("incident")) return "Incident_Response";
    if (t.includes("risk")) return "Risk_Records";
    if (t.includes("inventory") || t.includes("asset")) return "Inventories";
    return "Other_Documents";
  }
  switch (type) {
    case "policy": return "Policies";
    case "procedure": return "Procedures";
    case "screenshot": return "Screenshots";
    case "log": return "Logs";
    case "report": case "scan_report": return "Reports";
    case "configuration_export": return "Configuration_Exports";
    case "access_review": case "approval_record": return "Access_Reviews";
    case "training_record": return "Training";
    case "backup_verification": return "Backup_Records";
    case "system_inventory": case "asset_inventory": return "Inventories";
    case "incident_record": return "Incident_Response";
    case "risk_record": return "Risk_Records";
    case "network_diagram": return "Network_Diagrams";
    case "ticket": return "Tickets";
    default: return "Other_Evidence";
  }
}

function formatTypeLabel(type: string): string {
  return type.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function sanitizePart(s: string, maxLen = 40): string {
  return s
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, "")
    .replace(/\s+/g, "_")
    .replace(/[^\w._-]/g, "")
    .substring(0, maxLen)
    .replace(/[_-]+$/, "");
}

function formatExportDate(d: Date | null | undefined): string {
  if (!d) return "unknown";
  return new Date(d).toISOString().slice(0, 10);
}

function buildExportFilename(item: BulkItem, usedNames: Map<string, number>): string {
  const primary = item.linkedControls[0];
  const ctrlPart = primary
    ? item.linkedControls.length > 1
      ? `${primary.controlId}_PLUS_${item.linkedControls.length - 1}_CONTROLS`
      : primary.controlId
    : "UNMAPPED";
  const typePart = sanitizePart(formatTypeLabel(item.type), 25);
  const titlePart = sanitizePart(item.title, 35);
  const datePart = formatExportDate(item.collectedAt ?? item.uploadedAt);
  const ext = item.fileName ? path.extname(item.fileName) : "";

  let base = `${ctrlPart}__${typePart}__${titlePart}__${datePart}`;
  if (base.length > 110) base = base.substring(0, 110);

  const key = base.toLowerCase();
  const count = usedNames.get(key) ?? 0;
  usedNames.set(key, count + 1);
  if (count === 0) return `${base}${ext}`;
  return `${base}_${String(count).padStart(2, "0")}${ext}`;
}

// ── Types ─────────────────────────────────────────────────────────────────────
interface LinkedControl {
  id: string;
  controlId: string;
  controlTitle: string;
  level: string;
  domainName: string;
  domainCode: string;
}

interface BulkItem {
  id: string;
  title: string;
  recordType: "Evidence" | "Document";
  type: string;
  status: string;
  fileName: string | null;
  fileKey: string | null;
  ownerName: string | null;
  ownerId: string | null;
  collectedAt: Date | null;
  uploadedAt: Date;
  expiresAt: Date | null;
  nextReviewDate: Date | null;
  linkedControls: LinkedControl[];
}

// ── Shared control-link resolver for evidence items ───────────────────────────
async function resolveEvidenceLinks(evidenceIds: string[]): Promise<Map<string, LinkedControl[]>> {
  if (!evidenceIds.length) return new Map();
  const links = await db
    .select({
      evidenceId: evidenceControlLinksTable.evidenceId,
      controlDbId: controlsTable.id,
      controlId: controlsTable.controlId,
      controlTitle: controlsTable.title,
      level: controlsTable.level,
      domainName: domainsTable.name,
    })
    .from(evidenceControlLinksTable)
    .innerJoin(controlsTable, eq(controlsTable.id, evidenceControlLinksTable.controlId))
    .leftJoin(domainsTable, eq(domainsTable.id, controlsTable.domainId))
    .where(inArray(evidenceControlLinksTable.evidenceId, evidenceIds));

  const map = new Map<string, LinkedControl[]>();
  for (const l of links) {
    const arr = map.get(l.evidenceId) ?? [];
    arr.push({
      id: l.controlDbId,
      controlId: l.controlId,
      controlTitle: l.controlTitle ?? "",
      level: l.level ?? "",
      domainName: l.domainName ?? "",
      domainCode: domainCode(l.domainName ?? ""),
    });
    map.set(l.evidenceId, arr);
  }
  return map;
}

// ── Shared control-link resolver for document items ───────────────────────────
async function resolveDocumentLinks(documentIds: string[]): Promise<Map<string, LinkedControl[]>> {
  if (!documentIds.length) return new Map();
  const links = await db
    .select({
      documentId: documentControlMapsTable.documentId,
      controlDbId: controlsTable.id,
      controlId: controlsTable.controlId,
      controlTitle: controlsTable.title,
      level: controlsTable.level,
      domainName: domainsTable.name,
    })
    .from(documentControlMapsTable)
    .innerJoin(controlsTable, eq(controlsTable.id, documentControlMapsTable.controlId))
    .leftJoin(domainsTable, eq(domainsTable.id, controlsTable.domainId))
    .where(inArray(documentControlMapsTable.documentId, documentIds));

  const map = new Map<string, LinkedControl[]>();
  for (const l of links) {
    const arr = map.get(l.documentId) ?? [];
    arr.push({
      id: l.controlDbId,
      controlId: l.controlId,
      controlTitle: l.controlTitle ?? "",
      level: l.level ?? "",
      domainName: l.domainName ?? "",
      domainCode: domainCode(l.domainName ?? ""),
    });
    map.set(l.documentId, arr);
  }
  return map;
}

// ── DB helpers ────────────────────────────────────────────────────────────────
async function fetchEvidenceItems(ids: string[], orgId: string): Promise<BulkItem[]> {
  if (!ids.length) return [];
  const items = await db
    .select({
      id: evidenceItemsTable.id,
      title: evidenceItemsTable.title,
      evidenceType: evidenceItemsTable.evidenceType,
      status: evidenceItemsTable.status,
      fileName: evidenceItemsTable.fileName,
      fileKey: evidenceItemsTable.fileKey,
      ownerId: evidenceItemsTable.ownerId,
      ownerName: usersTable.name,
      collectedAt: evidenceItemsTable.collectedAt,
      expiresAt: evidenceItemsTable.expiresAt,
      createdAt: evidenceItemsTable.createdAt,
    })
    .from(evidenceItemsTable)
    .leftJoin(usersTable, eq(usersTable.id, evidenceItemsTable.ownerId))
    .where(
      and(
        inArray(evidenceItemsTable.id, ids),
        eq(evidenceItemsTable.organizationId, orgId),
        isNull(evidenceItemsTable.deletedAt)
      )
    );

  if (!items.length) return [];
  const linkMap = await resolveEvidenceLinks(items.map((i) => i.id));

  return items.map((item) => ({
    id: item.id,
    title: item.title,
    recordType: "Evidence" as const,
    type: item.evidenceType ?? "other",
    status: item.status,
    fileName: item.fileName,
    fileKey: item.fileKey,
    ownerName: item.ownerName,
    ownerId: item.ownerId,
    collectedAt: item.collectedAt,
    uploadedAt: item.createdAt,
    expiresAt: item.expiresAt,
    nextReviewDate: item.expiresAt,
    linkedControls: linkMap.get(item.id) ?? [],
  }));
}

async function fetchEvidenceItemsForOrg(orgId: string, statusFilters?: string[]): Promise<BulkItem[]> {
  const items = await db
    .select({
      id: evidenceItemsTable.id,
      title: evidenceItemsTable.title,
      evidenceType: evidenceItemsTable.evidenceType,
      status: evidenceItemsTable.status,
      fileName: evidenceItemsTable.fileName,
      fileKey: evidenceItemsTable.fileKey,
      ownerId: evidenceItemsTable.ownerId,
      ownerName: usersTable.name,
      collectedAt: evidenceItemsTable.collectedAt,
      expiresAt: evidenceItemsTable.expiresAt,
      createdAt: evidenceItemsTable.createdAt,
    })
    .from(evidenceItemsTable)
    .leftJoin(usersTable, eq(usersTable.id, evidenceItemsTable.ownerId))
    .where(
      and(
        eq(evidenceItemsTable.organizationId, orgId),
        isNull(evidenceItemsTable.deletedAt),
        eq(evidenceItemsTable.isCurrentVersion, true),
        statusFilters?.length
          ? inArray(evidenceItemsTable.status, statusFilters as any[])
          : undefined
      )
    );

  if (!items.length) return [];
  const linkMap = await resolveEvidenceLinks(items.map((i) => i.id));

  return items.map((item) => ({
    id: item.id,
    title: item.title,
    recordType: "Evidence" as const,
    type: item.evidenceType ?? "other",
    status: item.status,
    fileName: item.fileName,
    fileKey: item.fileKey,
    ownerName: item.ownerName,
    ownerId: item.ownerId,
    collectedAt: item.collectedAt,
    uploadedAt: item.createdAt,
    expiresAt: item.expiresAt,
    nextReviewDate: item.expiresAt,
    linkedControls: linkMap.get(item.id) ?? [],
  }));
}

async function fetchDocumentItems(ids: string[], orgId: string): Promise<BulkItem[]> {
  if (!ids.length) return [];
  const items = await db
    .select({
      id: documentsTable.id,
      title: documentsTable.title,
      docType: documentsTable.docType,
      status: documentsTable.status,
      fileName: documentsTable.fileName,
      fileKey: documentsTable.fileKey,
      ownerId: documentsTable.ownerId,
      ownerName: usersTable.name,
      effectiveDate: documentsTable.effectiveDate,
      nextReviewDate: documentsTable.nextReviewDate,
      createdAt: documentsTable.createdAt,
    })
    .from(documentsTable)
    .leftJoin(usersTable, eq(usersTable.id, documentsTable.ownerId))
    .where(
      and(
        inArray(documentsTable.id, ids),
        eq(documentsTable.organizationId, orgId),
        isNull(documentsTable.deletedAt)
      )
    );

  if (!items.length) return [];
  const linkMap = await resolveDocumentLinks(items.map((i) => i.id));

  return items.map((item) => ({
    id: item.id,
    title: item.title,
    recordType: "Document" as const,
    type: item.docType ?? "other",
    status: item.status,
    fileName: item.fileName,
    fileKey: item.fileKey,
    ownerName: item.ownerName,
    ownerId: item.ownerId,
    collectedAt: item.effectiveDate,
    uploadedAt: item.createdAt,
    expiresAt: item.nextReviewDate,
    nextReviewDate: item.nextReviewDate,
    linkedControls: linkMap.get(item.id) ?? [],
  }));
}

async function fetchDocumentItemsForOrg(orgId: string, statusFilters?: string[]): Promise<BulkItem[]> {
  const items = await db
    .select({
      id: documentsTable.id,
      title: documentsTable.title,
      docType: documentsTable.docType,
      status: documentsTable.status,
      fileName: documentsTable.fileName,
      fileKey: documentsTable.fileKey,
      ownerId: documentsTable.ownerId,
      ownerName: usersTable.name,
      effectiveDate: documentsTable.effectiveDate,
      nextReviewDate: documentsTable.nextReviewDate,
      createdAt: documentsTable.createdAt,
    })
    .from(documentsTable)
    .leftJoin(usersTable, eq(usersTable.id, documentsTable.ownerId))
    .where(
      and(
        eq(documentsTable.organizationId, orgId),
        isNull(documentsTable.deletedAt),
        eq(documentsTable.isCurrentVersion, true),
        statusFilters?.length
          ? inArray(documentsTable.status, statusFilters as any[])
          : undefined
      )
    );

  if (!items.length) return [];
  const linkMap = await resolveDocumentLinks(items.map((i) => i.id));

  return items.map((item) => ({
    id: item.id,
    title: item.title,
    recordType: "Document" as const,
    type: item.docType ?? "other",
    status: item.status,
    fileName: item.fileName,
    fileKey: item.fileKey,
    ownerName: item.ownerName,
    ownerId: item.ownerId,
    collectedAt: item.effectiveDate,
    uploadedAt: item.createdAt,
    expiresAt: item.nextReviewDate,
    nextReviewDate: item.nextReviewDate,
    linkedControls: linkMap.get(item.id) ?? [],
  }));
}

// ── Fetch file from GCS ───────────────────────────────────────────────────────
async function fetchFile(fileKey: string | null): Promise<Buffer | null> {
  if (!fileKey) return null;
  try {
    if (fileKey.startsWith("/objects/")) {
      const file = await objectStorageService.getObjectEntityFile(fileKey);
      const [buf] = await file.download();
      return buf as Buffer;
    }
    return null;
  } catch {
    return null;
  }
}

// ── XLSX helpers ──────────────────────────────────────────────────────────────
function buildXlsx(headers: string[], rows: (string | number | null)[][]): Buffer {
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
  ws["!cols"] = headers.map(() => ({ wch: 22 }));
  XLSX.utils.book_append_sheet(wb, ws, "Sheet1");
  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
}

// ── PDF helper ────────────────────────────────────────────────────────────────
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

const ASSESSOR_STATUSES = new Set(["approved", "active", "assessor_ready"]);

// ── POST /api/export/bulk-download ────────────────────────────────────────────
router.post(
  "/export/bulk-download",
  requireAuth,
  requireOrg,
  async (req, res) => {
    const orgId = req.orgId!;
    const user = req.authUser!;

    const {
      scope: exportScope = "custom",
      evidenceIds = [],
      documentIds = [],
      includeEvidence = true,
      includeDocuments = true,
      statusFilters = [],
      includeUnmapped = false,
      structure = "byDomain",
      includeFiles = true,
      includeManifest = true,
      includeControlMapping = true,
      includeHashManifest = false,
      exportDescription = "Bulk Download",
    } = req.body as {
      scope?: "selected" | "filtered" | "allApproved" | "entireOrg" | "custom";
      evidenceIds?: string[];
      documentIds?: string[];
      includeEvidence?: boolean;
      includeDocuments?: boolean;
      statusFilters?: string[];
      includeUnmapped?: boolean;
      structure?: "flat" | "byDomain" | "byControl" | "byType";
      includeFiles?: boolean;
      includeManifest?: boolean;
      includeControlMapping?: boolean;
      includeHashManifest?: boolean;
      exportDescription?: string;
    };

    const isServerSideScope = exportScope === "allApproved" || exportScope === "entireOrg";
    const isAssessor = user.role === "assessor";

    // Assessors are always restricted to assessor-visible statuses
    const effectiveStatusFilters: string[] | undefined = isAssessor
      ? ["approved", "active", "assessor_ready"]
      : (statusFilters.length > 0 ? statusFilters : undefined);

    // "active" is a document-only status; the evidence_status Postgres enum does not include it.
    // Passing it to an evidence query causes a runtime enum-cast error.
    // Strip any document-only values before querying evidence_items.
    const VALID_EVIDENCE_STATUSES = new Set([
      "draft", "needs_classification", "pending_review", "approved",
      "assessor_ready", "rejected", "stale", "superseded", "archived",
    ]);
    const effectiveEvidenceStatusFilters = effectiveStatusFilters
      ? effectiveStatusFilters.filter((s) => VALID_EVIDENCE_STATUSES.has(s))
      : undefined;

    if (!isServerSideScope && !evidenceIds.length && !documentIds.length) {
      res.status(400).json({ error: "No items selected" });
      return;
    }

    // Fetch organization
    const [org] = await db
      .select()
      .from(organizationsTable)
      .where(eq(organizationsTable.id, orgId))
      .limit(1);
    const orgName = org?.name ?? "Organization";
    const orgSlug = orgName.replace(/[^\w]/g, "").toUpperCase().slice(0, 12) || "ORG";

    // Fetch items
    let evidenceItems: BulkItem[] = [];
    let documentItems: BulkItem[] = [];

    if (includeEvidence) {
      evidenceItems = isServerSideScope
        ? await fetchEvidenceItemsForOrg(orgId, effectiveEvidenceStatusFilters)
        : await fetchEvidenceItems(evidenceIds, orgId);

      // Apply status filter for non-server-side scopes
      if (!isServerSideScope && effectiveEvidenceStatusFilters?.length) {
        evidenceItems = evidenceItems.filter((i) => effectiveEvidenceStatusFilters.includes(i.status));
      }

      // Assessor restriction on per-ID fetch
      if (isAssessor) {
        evidenceItems = evidenceItems.filter((i) => ASSESSOR_STATUSES.has(i.status));
      }
    }

    if (includeDocuments) {
      documentItems = isServerSideScope
        ? await fetchDocumentItemsForOrg(orgId, effectiveStatusFilters)
        : await fetchDocumentItems(documentIds, orgId);

      if (!isServerSideScope && effectiveStatusFilters?.length) {
        documentItems = documentItems.filter((i) => effectiveStatusFilters.includes(i.status));
      }

      if (isAssessor) {
        documentItems = documentItems.filter((i) => ASSESSOR_STATUSES.has(i.status));
      }
    }

    const allItems: BulkItem[] = [...evidenceItems, ...documentItems];
    if (!allItems.length) {
      res.status(400).json({ error: "No accessible items found for the selected scope and filters" });
      return;
    }

    const exportDate = new Date();
    const exportDateStr = formatExportDate(exportDate);
    const zipRootName = `${orgSlug}_Bulk_Download_${exportDateStr}`;

    res.setHeader("Content-Type", "application/zip");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${zipRootName}.zip"`
    );

    const archive = archiver("zip", { zlib: { level: 6 } });
    archive.pipe(res);

    interface FileEntry {
      item: BulkItem;
      exportName: string;
      buffer: Buffer | null;
      size: number;
      sha256: string | null;
      zipPath: string;
      issue: string | null;
    }

    const fileEntries: FileEntry[] = [];
    const issues: { id: string; title: string; controls: string; fileName: string; issue: string; action: string; included: "Yes" | "No" }[] = [];

    const usedNamesByDir = new Map<string, Map<string, number>>();
    function getUsedNames(dir: string): Map<string, number> {
      if (!usedNamesByDir.has(dir)) usedNamesByDir.set(dir, new Map());
      return usedNamesByDir.get(dir)!;
    }

    function getFilePaths(item: BulkItem, exportName: string): string[] {
      const root = zipRootName;
      const unmappedDir = `${root}/00_Unmapped_Needs_Review`;

      if (!item.linkedControls.length) {
        return [`${unmappedDir}/${exportName}`];
      }

      switch (structure) {
        case "flat":
          return [`${root}/Files/${exportName}`];
        case "byDomain": {
          const dirs = [...new Set(item.linkedControls.map((c) =>
            `${root}/${domainFolderName(c.domainName)}/${c.controlId}`
          ))];
          return dirs.map((d) => `${d}/${exportName}`);
        }
        case "byControl": {
          const dirs = [...new Set(item.linkedControls.map((c) => `${root}/${c.controlId}`))];
          return dirs.map((d) => `${d}/${exportName}`);
        }
        case "byType": {
          const folder = typeFolder(item.type, item.recordType);
          return [`${root}/${folder}/${exportName}`];
        }
      }
    }

    // Process each item
    for (const item of allItems) {
      const linkedCtrlStr = item.linkedControls.map((c) => c.controlId).join("; ") || "—";

      // Handle unmapped items
      if (!item.linkedControls.length && !includeUnmapped) {
        issues.push({
          id: item.id,
          title: item.title,
          controls: "—",
          fileName: item.fileName ?? "—",
          issue: "No linked control — excluded from export",
          action: "Link this item to a CMMC control, or enable Include Unmapped Items",
          included: "No",
        });
        continue;
      }

      if (!item.fileName) {
        issues.push({
          id: item.id,
          title: item.title,
          controls: linkedCtrlStr,
          fileName: "—",
          issue: "No file attached",
          action: "Check record and attach a file if applicable",
          included: "No",
        });
        continue;
      }

      if (!includeFiles) {
        const exportName = buildExportFilename(item, getUsedNames("_global"));
        const paths = getFilePaths(item, exportName);
        fileEntries.push({
          item, exportName, buffer: null, size: 0, sha256: null,
          zipPath: paths[0] ?? exportName, issue: null,
        });
        continue;
      }

      const buf = await fetchFile(item.fileKey);
      if (!buf) {
        issues.push({
          id: item.id,
          title: item.title,
          controls: linkedCtrlStr,
          fileName: item.fileName,
          issue: "File not found in storage",
          action: "Re-upload the file",
          included: "No",
        });
        continue;
      }

      const sha256 = crypto.createHash("sha256").update(buf).digest("hex");
      const exportName = buildExportFilename(item, getUsedNames("_global"));
      const paths = getFilePaths(item, exportName);

      fileEntries.push({
        item, exportName, buffer: buf, size: buf.length, sha256,
        zipPath: paths[0]!, issue: null,
      });

      for (const zipPath of paths) {
        archive.append(buf, { name: zipPath });
      }
    }

    // ── 00_Manifest/ ────────────────────────────────────────────────────────
    const manifestRoot = `${zipRootName}/00_Manifest`;

    if (includeManifest) {
      const headers = [
        "Exported File Name", "Original File Name", "Title", "Record Type",
        "Artifact Type", "Status", "Primary Control", "All Linked Controls",
        "Security Domain", "CMMC Level", "Owner", "Uploaded Date", "Collection Date",
        "Review Date", "Source Module", "ZIP Path", "SHA-256 Hash", "Notes",
      ];
      const rows = fileEntries.map((e) => {
        const primary = e.item.linkedControls[0];
        const domains = [...new Set(e.item.linkedControls.map((c) => c.domainName))].join("; ") || "—";
        const levels = [...new Set(e.item.linkedControls.map((c) => c.level))].filter(Boolean).join("; ") || "—";
        return [
          e.exportName,
          e.item.fileName ?? "—",
          e.item.title,
          e.item.recordType,
          formatTypeLabel(e.item.type),
          e.item.status,
          primary?.controlId ?? "UNMAPPED",
          e.item.linkedControls.map((c) => c.controlId).join("; ") || "—",
          domains,
          levels,
          e.item.ownerName ?? "—",
          formatExportDate(e.item.uploadedAt),
          formatExportDate(e.item.collectedAt),
          formatExportDate(e.item.nextReviewDate),
          e.item.recordType,
          e.zipPath,
          e.sha256 ?? "—",
          e.issue ?? "",
        ] as (string | number | null)[];
      });
      archive.append(buildXlsx(headers, rows), { name: `${manifestRoot}/File_Index.xlsx` });
    }

    if (includeControlMapping) {
      const headers = [
        "Control ID", "Control Title", "Domain", "Level",
        "Artifact Title", "Artifact Type", "Artifact Status",
        "Exported File Name", "ZIP Path", "Owner", "Collection Date", "Source Module",
      ];
      const rows: (string | number | null)[][] = [];
      for (const e of fileEntries) {
        if (!e.item.linkedControls.length) {
          rows.push([
            "UNMAPPED", "—", "—", "—",
            e.item.title, formatTypeLabel(e.item.type), e.item.status,
            e.exportName, e.zipPath, e.item.ownerName ?? "—",
            formatExportDate(e.item.collectedAt), e.item.recordType,
          ]);
        } else {
          for (const ctrl of e.item.linkedControls) {
            rows.push([
              ctrl.controlId, ctrl.controlTitle, ctrl.domainName, ctrl.level,
              e.item.title, formatTypeLabel(e.item.type), e.item.status,
              e.exportName, e.zipPath, e.item.ownerName ?? "—",
              formatExportDate(e.item.collectedAt), e.item.recordType,
            ]);
          }
        }
      }
      archive.append(buildXlsx(headers, rows), { name: `${manifestRoot}/Control_Mapping.xlsx` });
    }

    if (includeHashManifest) {
      const headers = [
        "ZIP Path", "Exported File Name", "Original File Name",
        "File Size (bytes)", "SHA-256 Hash", "Export Timestamp",
      ];
      const rows = fileEntries.map((e) => [
        e.zipPath, e.exportName, e.item.fileName ?? "—",
        e.size || "—", e.sha256 ?? "—", exportDate.toISOString(),
      ] as (string | number | null)[]);
      archive.append(buildXlsx(headers, rows), { name: `${manifestRoot}/File_Hash_Manifest.xlsx` });
    }

    // Export_Issues.xlsx (always)
    {
      const headers = [
        "Record ID", "Title", "Linked Controls", "Original Filename",
        "Issue", "Recommended Action", "Included in ZIP",
      ];
      const rows = issues.map((i) => [
        i.id, i.title, i.controls, i.fileName, i.issue, i.action, i.included,
      ] as (string | number | null)[]);
      archive.append(buildXlsx(headers, rows), { name: `${manifestRoot}/Export_Issues.xlsx` });
    }

    // Export_Summary.pdf (always)
    {
      const pdf = await buildPdf((doc) => {
        doc.fontSize(20).font("Helvetica-Bold").text("Bulk Export Summary", { align: "center" });
        doc.moveDown();
        doc.fontSize(11).font("Helvetica");
        const lines = [
          ["Organization", orgName],
          ["Export Date", exportDate.toISOString().slice(0, 19).replace("T", " ") + " UTC"],
          ["Exported By", user.name ?? user.email],
          ["Role", user.role],
          ["Scope", exportScope],
          ["Description", exportDescription],
          ["ZIP Structure", structure],
          ["Files Exported", String(fileEntries.filter((e) => e.buffer !== null).length)],
          ["Evidence Items", String(evidenceItems.length)],
          ["Documents", String(documentItems.length)],
          ["Unmapped Items", String(issues.filter((i) => i.issue.includes("No linked control")).length)],
          ["Items Excluded (no file)", String(issues.filter((i) => i.issue === "No file attached").length)],
          ["Items Excluded (not in storage)", String(issues.filter((i) => i.issue === "File not found in storage").length)],
          ["Status Filters", effectiveStatusFilters?.join(", ") ?? "All"],
          ["Include Unmapped", String(includeUnmapped)],
        ];
        for (const [label, value] of lines) {
          doc.font("Helvetica-Bold").text(`${label}: `, { continued: true });
          doc.font("Helvetica").text(value);
        }
        doc.moveDown();
        doc.fontSize(9).fillColor("gray").text(
          "This export was generated by the CMMC Compliance Platform. All files are subject to your organization's data handling policies.",
          { align: "center" }
        );
      });
      archive.append(pdf, { name: `${manifestRoot}/Export_Summary.pdf` });
    }

    await archive.finalize();

    // Audit log
    try {
      await db.insert(auditLogsTable).values({
        id: crypto.randomUUID(),
        organizationId: orgId,
        userId: user.id,
        action: "bulk_download",
        resourceType: "export",
        resourceId: zipRootName,
        details: JSON.stringify({
          scope: exportScope,
          structure,
          evidenceCount: evidenceItems.length,
          documentCount: documentItems.length,
          filesExported: fileEntries.filter((e) => e.buffer !== null).length,
          unmappedCount: issues.filter((i) => i.issue.includes("No linked control")).length,
          statusFilters: effectiveStatusFilters ?? "all",
          includeUnmapped,
          exportDescription,
        }),
        ipAddress: req.ip ?? null,
        userAgent: req.get("user-agent") ?? null,
        createdAt: exportDate,
      });
    } catch {
      // Non-fatal
    }
  }
);

export default router;
export { router as bulkExportRouter };
