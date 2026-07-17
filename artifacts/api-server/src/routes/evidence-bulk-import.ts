import { Router } from "express";
import multer from "multer";
import AdmZip from "adm-zip";
import ExcelJS from "exceljs";
import { Readable } from "stream";
import path from "path";
import { randomUUID } from "crypto";
import {
  db,
  evidenceItemsTable,
  evidenceControlLinksTable,
  controlsTable,
} from "@workspace/db";
import { eq, or, isNull } from "drizzle-orm";
import { requireAuth } from "../lib/auth";
import { requireOrg } from "../middleware/org";
import { logAudit } from "../lib/audit";
import { objectStorageClient, ObjectStorageService } from "../lib/objectStorage";

// ─── GCS upload (mirrors evidence.ts) ─────────────────────────────────────
const objectStorageService = new ObjectStorageService();

async function uploadBufferToGCS(
  buffer: Buffer,
  mimeType: string,
  ext: string,
  originalFilename: string
): Promise<string> {
  const privateDir = objectStorageService.getPrivateObjectDir();
  const normalised = privateDir.startsWith("/") ? privateDir : `/${privateDir}`;
  const parts = normalised.split("/").filter(Boolean);
  const bucketName = parts[0];
  const prefix = parts.slice(1).join("/");
  const objectId = randomUUID();
  const objectName = prefix
    ? `${prefix}/evidence/${objectId}${ext}`
    : `evidence/${objectId}${ext}`;
  await objectStorageClient.bucket(bucketName).file(objectName).save(buffer, {
    contentType: mimeType,
    metadata: {
      contentDisposition: `attachment; filename="${encodeURIComponent(originalFilename)}"`,
    },
  });
  return `/objects/evidence/${objectId}${ext}`;
}

// ─── In-memory session store ───────────────────────────────────────────────
interface ParsedRow {
  rowNum: number;
  fileName: string;
  folderPath: string;
  evidenceTitle: string;
  evidenceType: string;
  status: string;
  linkedControlRefs: string[];
  primaryControlRef: string | null;
  collectedAt: string | null;
  expiresAt: string | null;
  description: string;
  assessorSummary: string;
  internalNotes: string;
  tags: string[];
  duplicateHandling: string;
  existingEvidenceId: string | null;
  fileFound: boolean;
  validControlIds: string[];
  invalidControlRefs: string[];
  errors: string[];
  warnings: string[];
}

interface ImportSession {
  createdAt: number;
  orgId: string;
  userId: string;
  fileBuffers: Map<string, Buffer>;
  fileNames: Map<string, string>;
  fileMimeTypes: Map<string, string>;
  rows: ParsedRow[];
}

const sessions = new Map<string, ImportSession>();
const cleanupTimer = setInterval(() => {
  const cutoff = Date.now() - 15 * 60 * 1000;
  for (const [id, s] of sessions) {
    if (s.createdAt < cutoff) sessions.delete(id);
  }
}, 60_000);
// Don't block process exit
if (cleanupTimer.unref) cleanupTimer.unref();

// ─── Type/status maps ──────────────────────────────────────────────────────
const EVIDENCE_TYPE_MAP: Record<string, string> = {
  policy: "policy",
  procedure: "procedure",
  screenshot: "screenshot",
  log: "log",
  report: "report",
  ticket: "ticket",
  "configuration export": "configuration_export",
  configuration_export: "configuration_export",
  "access review": "access_review",
  access_review: "access_review",
  "training record": "training_record",
  training_record: "training_record",
  "incident record": "incident_record",
  incident_record: "incident_record",
  "risk record": "risk_record",
  risk_record: "risk_record",
  "approval record": "approval_record",
  approval_record: "approval_record",
  "system inventory": "system_inventory",
  system_inventory: "system_inventory",
  "asset inventory": "asset_inventory",
  asset_inventory: "asset_inventory",
  "supplier review": "supplier_review",
  supplier_review: "supplier_review",
  "backup verification": "backup_verification",
  backup_verification: "backup_verification",
  "network diagram": "network_diagram",
  network_diagram: "network_diagram",
  "vulnerability scan": "scan_report",
  "scan report": "scan_report",
  scan_report: "scan_report",
  other: "other",
};

const STATUS_MAP: Record<string, string> = {
  draft: "draft",
  approved: "approved",
  active: "active",
  "needs classification": "needs_classification",
  needs_classification: "needs_classification",
  "pending review": "pending_review",
  pending_review: "pending_review",
  "assessor ready": "assessor_ready",
  assessor_ready: "assessor_ready",
  rejected: "rejected",
  stale: "stale",
  archived: "archived",
};

const MIME_MAP: Record<string, string> = {
  ".pdf": "application/pdf",
  ".docx":
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".doc": "application/msword",
  ".xlsx":
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ".xls": "application/vnd.ms-excel",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".txt": "text/plain",
  ".csv": "text/csv",
  ".log": "text/plain",
  ".json": "application/json",
  ".yaml": "text/yaml",
  ".yml": "text/yaml",
  ".pptx":
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
};

// ─── Helpers ──────────────────────────────────────────────────────────────
function normKey(folderPath: string, fileName: string): string {
  const folder = (folderPath || "").replace(/\\/g, "/").replace(/^\/|\/$/g, "");
  return folder ? `${folder}/${fileName}` : fileName;
}

function cellStr(cell: ExcelJS.Cell): string {
  const v = cell.value;
  if (v == null) return "";
  if (typeof v === "string") return v.trim();
  if (typeof v === "number" || typeof v === "boolean") return String(v).trim();
  if (v instanceof Date) return v.toISOString().split("T")[0];
  if (typeof v === "object" && "text" in (v as object))
    return ((v as { text?: string }).text ?? "").trim();
  if (typeof v === "object" && "result" in (v as object))
    return String((v as { result?: unknown }).result ?? "").trim();
  return String(v).trim();
}

function isMappingFile(entryName: string): boolean {
  const ext = path.extname(entryName).toLowerCase();
  if (![".xlsx", ".xls", ".csv"].includes(ext)) return false;
  const base = path.basename(entryName, ext).toLowerCase();
  return /map|template|import|upload/.test(base);
}

function parseWorksheetRows(ws: ExcelJS.Worksheet): Record<string, string>[] {
  const rows: Record<string, string>[] = [];
  let headers: string[] = [];
  ws.eachRow((row, rowNum) => {
    if (rowNum === 1) {
      headers = (row.values as (string | null | undefined)[])
        .slice(1)
        .map((v) => (v ? String(v).trim().toLowerCase() : ""));
      return;
    }
    const record: Record<string, string> = {};
    headers.forEach((h, i) => {
      if (!h) return;
      record[h] = cellStr(row.getCell(i + 1));
    });
    if (Object.values(record).some((v) => v !== "")) rows.push(record);
  });
  return rows;
}

function getField(raw: Record<string, string>, ...keys: string[]): string {
  for (const k of keys) {
    const v = raw[k.toLowerCase()];
    if (v !== undefined && v !== "") return v;
  }
  return "";
}

function parseRow(
  raw: Record<string, string>,
  rowNum: number
): Omit<ParsedRow, "fileFound" | "validControlIds" | "invalidControlRefs" | "errors" | "warnings"> {
  const get = (...k: string[]) => getField(raw, ...k);
  const fileName = get("file name", "filename", "file");
  const folderPath = get("folder path", "folderpath", "folder");
  const rawType = get("evidence type", "type").toLowerCase();
  const rawStatus = get("status").toLowerCase();
  const linkedRaw = get(
    "linked controls / requirements",
    "linked controls",
    "controls",
    "requirements",
    "linked controls/requirements"
  );
  const tags = get("tags");
  return {
    rowNum,
    fileName,
    folderPath,
    evidenceTitle:
      get("evidence title", "title", "name") ||
      fileName.replace(/\.[^/.]+$/, ""),
    evidenceType: EVIDENCE_TYPE_MAP[rawType] ?? "other",
    status: STATUS_MAP[rawStatus] ?? "draft",
    linkedControlRefs: linkedRaw
      .split(/[;,]+/)
      .map((s) => s.trim())
      .filter(Boolean),
    primaryControlRef:
      get(
        "primary control / requirement",
        "primary control",
        "primary requirement"
      ) || null,
    collectedAt: get("collection date", "collected at", "collectedat") || null,
    expiresAt:
      get(
        "review / expiration date",
        "expiration date",
        "expires at",
        "expiresat",
        "review/expiration date"
      ) || null,
    description: get(
      "description / what this demonstrates",
      "description",
      "what this demonstrates"
    ),
    assessorSummary: get("assessor summary"),
    internalNotes: get("internal notes"),
    tags: tags
      ? tags
          .split(/[;,]+/)
          .map((t) => t.trim())
          .filter(Boolean)
      : [],
    duplicateHandling: get("duplicate handling") || "Create New",
    existingEvidenceId: get("existing evidence id") || null,
  };
}

// ─── Router ────────────────────────────────────────────────────────────────
const router = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 200 * 1024 * 1024 },
});

// ── GET /evidence/bulk-import/template ─────────────────────────────────────
router.get(
  "/evidence/bulk-import/template",
  requireAuth,
  async (_req, res) => {
    const wb = new ExcelJS.Workbook();
    wb.creator = "Control HUB";
    wb.created = new Date();

    // Sheet 1: Evidence_Upload_Map
    const ws1 = wb.addWorksheet("Evidence_Upload_Map");
    const required = [
      "File Name",
      "Evidence Title",
      "Evidence Type",
      "Status",
      "Linked Controls / Requirements",
    ];
    const optional = [
      "Folder Path",
      "Collection Date",
      "Review / Expiration Date",
      "Primary Control / Requirement",
      "Relationship Type",
      "Framework / Package",
      "Security Domain",
      "Owner",
      "Description / What This Demonstrates",
      "Assessor Summary",
      "Internal Notes",
      "Tags",
      "Duplicate Handling",
      "Existing Evidence ID",
      "Importer Notes",
    ];
    const headers = [...required, ...optional];
    ws1.addRow(headers);
    // Style header row
    const headerRow = ws1.getRow(1);
    headerRow.eachCell((cell, colNum) => {
      cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
      cell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: colNum <= required.length ? "FF1E3A5F" : "FF4A6FA5" },
      };
      cell.alignment = { vertical: "middle", wrapText: true };
      cell.border = {
        bottom: { style: "thin", color: { argb: "FFCCCCCC" } },
      };
    });
    headerRow.height = 24;
    ws1.getColumn(1).width = 28;
    ws1.getColumn(2).width = 32;
    ws1.getColumn(3).width = 20;
    ws1.getColumn(4).width = 14;
    ws1.getColumn(5).width = 40;
    for (let i = 6; i <= headers.length; i++) ws1.getColumn(i).width = 22;

    // Example row 1
    ws1.addRow([
      "access_policy.pdf",
      "Access Control Policy",
      "Policy",
      "Approved",
      "AC.L1-3.1.1; AC.L1-3.1.2",
      "",
      "2026-01-15",
      "2027-01-15",
      "AC.L1-3.1.1",
      "Supports",
      "CMMC L1",
      "AC",
      "",
      "Defines access control procedures",
      "",
      "",
      "",
      "Create New",
      "",
      "",
    ]);
    // Example row 2
    ws1.addRow([
      "mfa_screenshot.png",
      "MFA Enforcement Screenshot",
      "Screenshot",
      "Approved",
      "IA.L2-3.5.3",
      "screenshots",
      "2026-02-10",
      "",
      "IA.L2-3.5.3",
      "Demonstrates",
      "CMMC L2",
      "IA",
      "",
      "Shows MFA enforced for all users",
      "",
      "",
      "",
      "Create New",
      "",
      "",
    ]);
    // Note row
    const noteRow = ws1.addRow([
      "← Required columns are dark blue. Optional columns are lighter blue.",
    ]);
    noteRow.getCell(1).font = { italic: true, color: { argb: "FF666666" } };

    // Sheet 2: File_Control_Map
    const ws2 = wb.addWorksheet("File_Control_Map");
    const fcHeaders = [
      "File Name",
      "Folder Path",
      "Control / Requirement ID",
      "Relationship Type",
      "Is Primary",
      "Framework / Package",
      "Notes",
    ];
    ws2.addRow(fcHeaders);
    const fcHeader = ws2.getRow(1);
    fcHeader.eachCell((cell) => {
      cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
      cell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FF4A6FA5" },
      };
      cell.alignment = { vertical: "middle" };
    });
    fcHeader.height = 22;
    fcHeaders.forEach((_, i) => { ws2.getColumn(i + 1).width = 24; });
    ws2.addRow([
      "access_policy.pdf",
      "",
      "AC.L1-3.1.1",
      "Supports",
      "Yes",
      "CMMC L1",
      "",
    ]);
    ws2.addRow([
      "access_policy.pdf",
      "",
      "AC.L1-3.1.2",
      "Supports",
      "No",
      "CMMC L1",
      "",
    ]);

    // Sheet 3: Instructions
    const ws3 = wb.addWorksheet("Instructions");
    ws3.getColumn(1).width = 80;
    const instructions = [
      ["Control HUB — Bulk Evidence Upload Template"],
      [""],
      ["HOW TO USE:"],
      ["1. Fill in the 'Evidence_Upload_Map' sheet — one row per evidence file."],
      ["2. Required columns: File Name, Evidence Title, Evidence Type, Status, Linked Controls / Requirements"],
      ["3. Put your evidence files in a folder alongside this Excel file."],
      ["4. ZIP that folder (files + this Excel file) and upload the ZIP in Control HUB."],
      ["5. Separate multiple control IDs with semicolons: AC.L1-3.1.1; AC.L1-3.1.2; IA.L1-3.5.1"],
      [""],
      ["EVIDENCE TYPES (use exactly):"],
      ["  Policy, Procedure, Screenshot, Log, Report, Ticket, Configuration Export,"],
      ["  Access Review, Training Record, Incident Record, Risk Record, Approval Record,"],
      ["  System Inventory, Asset Inventory, Supplier Review, Backup Verification,"],
      ["  Network Diagram, Vulnerability Scan, Other"],
      [""],
      ["STATUS VALUES (use exactly):"],
      ["  Draft, Approved, Active, Needs Classification, Pending Review, Assessor Ready"],
      [""],
      ["DUPLICATE HANDLING:"],
      ["  Create New — always create a new evidence record (default)"],
      ["  Link Existing — link an existing record to additional controls (requires Existing Evidence ID)"],
      ["  Skip Duplicate — skip this row and report it"],
      [""],
      ["FOLDER PATHS:"],
      ["  If your files are in subfolders within the ZIP, use the Folder Path column."],
      ["  Example: 'policies/access' for a file at policies/access/policy.pdf in the ZIP."],
      [""],
      ["NOTES:"],
      ["  - The import shows a PREVIEW before creating any records."],
      ["  - Missing files and invalid control IDs are reported before import."],
      ["  - Files are stored once; one evidence record per file, linked to all listed controls."],
    ];
    instructions.forEach(([line]) => {
      const r = ws3.addRow([line]);
      if (line?.startsWith("Control HUB")) {
        r.getCell(1).font = { bold: true, size: 14 };
      } else if (line?.endsWith(":") && !line.startsWith(" ")) {
        r.getCell(1).font = { bold: true };
      }
    });

    const buf = await wb.xlsx.writeBuffer();
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    res.setHeader(
      "Content-Disposition",
      'attachment; filename="Control_HUB_Bulk_Evidence_Upload_Template.xlsx"'
    );
    res.send(Buffer.from(buf));
  }
);

// ── POST /evidence/bulk-import/preview ────────────────────────────────────
router.post(
  "/evidence/bulk-import/preview",
  requireAuth,
  requireOrg,
  upload.single("zipFile"),
  async (req, res) => {
    if (!req.file) {
      res.status(400).json({ error: "zipFile is required" });
      return;
    }
    if (!req.file.originalname.toLowerCase().endsWith(".zip")) {
      res.status(400).json({ error: "Only ZIP files are accepted" });
      return;
    }

    let zip: AdmZip;
    try {
      zip = new AdmZip(req.file.buffer);
    } catch {
      res
        .status(400)
        .json({ error: "Could not read ZIP file. Ensure it is a valid ZIP archive." });
      return;
    }

    const entries = zip.getEntries().filter(
      (e) =>
        !e.isDirectory &&
        !e.entryName.includes("__MACOSX") &&
        !path.basename(e.entryName).startsWith(".")
    );

    // Find mapping file
    let mappingEntry =
      entries.find((e) => isMappingFile(e.entryName)) ??
      entries.find((e) => {
        const ext = path.extname(e.entryName).toLowerCase();
        return ext === ".xlsx" || ext === ".xls" || ext === ".csv";
      });

    if (!mappingEntry) {
      res.status(400).json({
        error:
          "No mapping file found in ZIP. Include an Excel (.xlsx) or CSV mapping file.",
      });
      return;
    }

    // Parse mapping file
    let rawRows: Record<string, string>[] = [];
    const mappingExt = path.extname(mappingEntry.entryName).toLowerCase();
    const mappingBuffer = mappingEntry.getData();

    try {
      const wb = new ExcelJS.Workbook();
      if (mappingExt === ".csv") {
        const readable = Readable.from(mappingBuffer);
        await wb.csv.read(readable as Parameters<typeof wb.csv.read>[0]);
        const ws = wb.worksheets[0];
        if (ws) rawRows = parseWorksheetRows(ws);
      } else {
        await wb.xlsx.load(Buffer.from(mappingBuffer) as any);
        const ws =
          wb.getWorksheet("Evidence_Upload_Map") ?? wb.worksheets[0];
        if (ws) rawRows = parseWorksheetRows(ws);
      }
    } catch {
      res.status(400).json({
        error: "Failed to parse mapping file. Ensure it is a valid Excel or CSV file.",
      });
      return;
    }

    if (rawRows.length === 0) {
      res.status(400).json({ error: "Mapping file is empty or has no data rows." });
      return;
    }

    // Build file index from ZIP
    const fileIndex = new Map<string, AdmZip.IZipEntry>();
    for (const entry of entries) {
      if (entry.entryName === mappingEntry.entryName) continue;
      const base = path.basename(entry.entryName);
      const dir = path.dirname(entry.entryName).replace(/^\.$/, "");
      fileIndex.set(normKey(dir, base), entry);
      if (!fileIndex.has(base)) fileIndex.set(base, entry);
    }

    // Load all controls (controls are global, not org-scoped per schema)
    const dbControls = await db
      .select({ id: controlsTable.id, controlId: controlsTable.controlId })
      .from(controlsTable);
    const controlRefMap = new Map<string, string>();
    for (const c of dbControls) {
      if (c.controlId) controlRefMap.set(c.controlId.toUpperCase(), c.id);
    }

    // Validate rows
    const parsedRows: ParsedRow[] = [];
    const allMissingFiles = new Set<string>();
    const allInvalidControls = new Set<string>();

    for (let i = 0; i < rawRows.length; i++) {
      const base = parseRow(rawRows[i], i + 2);
      const errors: string[] = [];
      const warnings: string[] = [];

      if (!base.fileName) {
        errors.push("File Name is required");
        parsedRows.push({
          ...base,
          fileFound: false,
          validControlIds: [],
          invalidControlRefs: [],
          errors,
          warnings,
        });
        continue;
      }

      const key = normKey(base.folderPath, base.fileName);
      const fileFound = fileIndex.has(key) || fileIndex.has(base.fileName);
      if (!fileFound) {
        allMissingFiles.add(base.fileName);
        errors.push(`File not found in ZIP: ${base.fileName}`);
      }

      const validControlIds: string[] = [];
      const invalidControlRefs: string[] = [];
      for (const ref of base.linkedControlRefs) {
        const id = controlRefMap.get(ref.toUpperCase());
        if (id) {
          if (!validControlIds.includes(id)) validControlIds.push(id);
        } else {
          invalidControlRefs.push(ref);
          allInvalidControls.add(ref);
        }
      }
      if (invalidControlRefs.length > 0) {
        warnings.push(`Invalid control IDs: ${invalidControlRefs.join(", ")}`);
      }

      const dh = base.duplicateHandling.toLowerCase().trim();
      if (dh === "supersede existing") {
        warnings.push(
          "Supersede / versioning is not yet enabled — this row will be treated as Create New"
        );
      }
      if (dh === "link existing" && !base.existingEvidenceId) {
        errors.push("Link Existing requires an Existing Evidence ID");
      }

      parsedRows.push({
        ...base,
        fileFound,
        validControlIds,
        invalidControlRefs,
        errors,
        warnings,
      });
    }

    // Store session
    const importId = randomUUID();
    const fileBuffers = new Map<string, Buffer>();
    const fileNames = new Map<string, string>();
    const fileMimeTypes = new Map<string, string>();

    for (const entry of entries) {
      if (entry.entryName === mappingEntry.entryName) continue;
      const base = path.basename(entry.entryName);
      const dir = path.dirname(entry.entryName).replace(/^\.$/, "");
      const key = normKey(dir, base);
      const buf = entry.getData();
      const ext = path.extname(base).toLowerCase();
      const mime = MIME_MAP[ext] ?? "application/octet-stream";
      fileBuffers.set(key, buf);
      fileNames.set(key, base);
      fileMimeTypes.set(key, mime);
      if (!fileBuffers.has(base)) {
        fileBuffers.set(base, buf);
        fileNames.set(base, base);
        fileMimeTypes.set(base, mime);
      }
    }

    sessions.set(importId, {
      createdAt: Date.now(),
      orgId: req.orgId!,
      userId: req.authUser!.id,
      fileBuffers,
      fileNames,
      fileMimeTypes,
      rows: parsedRows,
    });

    // Compute summary stats
    const filesMatched = parsedRows.filter((r) => r.fileFound).length;
    const evidenceToCreate = parsedRows.filter(
      (r) =>
        r.errors.length === 0 &&
        !["skip duplicate"].includes(r.duplicateHandling.toLowerCase())
    ).length;
    const mappingsToCreate = parsedRows
      .filter((r) => r.errors.length === 0)
      .reduce((s, r) => s + r.validControlIds.length, 0);

    const fileNameCounts = new Map<string, number>();
    for (const r of parsedRows) {
      if (r.fileName)
        fileNameCounts.set(r.fileName, (fileNameCounts.get(r.fileName) ?? 0) + 1);
    }
    const duplicateFilenames = [...fileNameCounts.entries()]
      .filter(([, c]) => c > 1)
      .map(([n]) => n);

    res.json({
      importId,
      preview: {
        totalRows: parsedRows.length,
        filesMatched,
        filesMissing: [...allMissingFiles],
        controlsMatched: parsedRows.reduce((s, r) => s + r.validControlIds.length, 0),
        invalidControls: [...allInvalidControls],
        evidenceToCreate,
        mappingsToCreate,
        duplicateFilenames,
        rows: parsedRows.map((r) => ({
          rowNum: r.rowNum,
          fileName: r.fileName,
          folderPath: r.folderPath,
          evidenceTitle: r.evidenceTitle,
          evidenceType: r.evidenceType,
          status: r.status,
          linkedControlRefs: r.linkedControlRefs,
          validControlIds: r.validControlIds,
          invalidControlRefs: r.invalidControlRefs,
          fileFound: r.fileFound,
          duplicateHandling: r.duplicateHandling,
          errors: r.errors,
          warnings: r.warnings,
        })),
      },
    });
  }
);

// ── POST /evidence/bulk-import/execute ────────────────────────────────────
router.post(
  "/evidence/bulk-import/execute",
  requireAuth,
  requireOrg,
  async (req, res) => {
    const { importId } = req.body as { importId?: string };
    if (!importId) {
      res.status(400).json({ error: "importId is required" });
      return;
    }
    const session = sessions.get(importId);
    if (!session) {
      res.status(404).json({
        error:
          "Import session not found or expired (15 min limit). Please re-upload your ZIP file.",
      });
      return;
    }
    if (session.orgId !== req.orgId) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }

    sessions.delete(importId);

    // Load control ref map once for primary resolution
    const dbControls = await db
      .select({ id: controlsTable.id, controlId: controlsTable.controlId })
      .from(controlsTable);
    const controlRefMap = new Map<string, string>();
    for (const c of dbControls) {
      if (c.controlId) controlRefMap.set(c.controlId.toUpperCase(), c.id);
    }

    let created = 0;
    let uploaded = 0;
    let mappingsCreated = 0;
    let skipped = 0;
    const failedRows: Array<{ rowNum: number; fileName: string; error: string }> = [];

    for (const row of session.rows) {
      if (row.errors.length > 0) {
        failedRows.push({
          rowNum: row.rowNum,
          fileName: row.fileName,
          error: row.errors.join("; "),
        });
        continue;
      }

      const dh = row.duplicateHandling.toLowerCase().trim();

      if (dh === "skip duplicate") {
        skipped++;
        continue;
      }

      if (dh === "link existing") {
        if (!row.existingEvidenceId) {
          failedRows.push({
            rowNum: row.rowNum,
            fileName: row.fileName,
            error: "Link Existing requires Existing Evidence ID",
          });
          continue;
        }
        try {
          if (row.validControlIds.length > 0) {
            await db
              .insert(evidenceControlLinksTable)
              .values(
                row.validControlIds.map((cid, idx) => ({
                  id: randomUUID(),
                  evidenceId: row.existingEvidenceId!,
                  controlId: cid,
                  isPrimary: idx === 0,
                  linkedAt: new Date(),
                }))
              )
              .onConflictDoNothing();
            mappingsCreated += row.validControlIds.length;
          }
        } catch {
          failedRows.push({
            rowNum: row.rowNum,
            fileName: row.fileName,
            error: "Failed to link existing evidence record",
          });
        }
        continue;
      }

      // Create New (default; Supersede → Create New)
      const key = normKey(row.folderPath, row.fileName);
      const buf =
        session.fileBuffers.get(key) ?? session.fileBuffers.get(row.fileName);
      if (!buf) {
        failedRows.push({
          rowNum: row.rowNum,
          fileName: row.fileName,
          error: "File buffer missing from session",
        });
        continue;
      }

      const originalFilename =
        session.fileNames.get(key) ??
        session.fileNames.get(row.fileName) ??
        row.fileName;
      const mimeType =
        session.fileMimeTypes.get(key) ??
        session.fileMimeTypes.get(row.fileName) ??
        "application/octet-stream";
      const ext = path.extname(originalFilename);
      const evidenceId = randomUUID();

      try {
        const fileKey = await uploadBufferToGCS(buf, mimeType, ext, originalFilename);
        uploaded++;

        await db.insert(evidenceItemsTable).values({
          id: evidenceId,
          organizationId: session.orgId,
          title: row.evidenceTitle,
          description: row.description || undefined,
          evidenceType: row.evidenceType as any,
          status: row.status as any,
          ownerId: session.userId,
          fileKey,
          fileName: originalFilename,
          fileSize: buf.length,
          mimeType,
          collectedAt: row.collectedAt ? new Date(row.collectedAt) : undefined,
          expiresAt: row.expiresAt ? new Date(row.expiresAt) : undefined,
          assessorSummary: row.assessorSummary || undefined,
          internalNotes: row.internalNotes || undefined,
          tags: row.tags,
          createdAt: new Date(),
          updatedAt: new Date(),
        } as any);
        created++;

        if (row.validControlIds.length > 0) {
          const primaryRef = row.primaryControlRef?.toUpperCase();
          const primaryId = primaryRef ? controlRefMap.get(primaryRef) : null;
          await db
            .insert(evidenceControlLinksTable)
            .values(
              row.validControlIds.map((cid) => ({
                id: randomUUID(),
                evidenceId,
                controlId: cid,
                isPrimary: primaryId
                  ? cid === primaryId
                  : cid === row.validControlIds[0],
                linkedAt: new Date(),
              }))
            )
            .onConflictDoNothing();
          mappingsCreated += row.validControlIds.length;
        }

        await logAudit(req, "uploaded", "evidence", evidenceId, {
          entityLabel: row.evidenceTitle,
        });
      } catch (err) {
        failedRows.push({
          rowNum: row.rowNum,
          fileName: row.fileName,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    res.json({
      created,
      uploaded,
      mappingsCreated,
      skipped,
      failed: failedRows.length,
      errors: failedRows,
    });
  }
);

export default router;
