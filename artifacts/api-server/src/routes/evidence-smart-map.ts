/**
 * Smart Evidence Mapping — Local Content Analysis Engine
 *
 * All processing is done locally inside Control HUB.
 * No evidence files, filenames, extracted text, or metadata are sent
 * to any external AI or document-analysis service.
 *
 * Analysis pipeline:
 *   1. Extract text from file (DOCX, XLSX, TXT, CSV, PDF, etc.)
 *   2. Regex-detect control IDs in filename + extracted content
 *   3. Score every active control by keyword + ID match
 *   4. Return top-N suggestions with confidence labels
 *
 * Processing mode: Local Control HUB Analysis
 * External AI Processing: Disabled
 */

import { Router } from "express";
import multer from "multer";
import mammoth from "mammoth";
import ExcelJS from "exceljs";
import { Readable } from "stream";
import { db, controlsTable, domainsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireAuth } from "../lib/auth";
import { requireOrg } from "../middleware/org";

// ─── Engine version ────────────────────────────────────────────────────────
const ENGINE_VERSION = "1.0.0-local";

// ─── Domain keyword profiles (local, no external dependency) ───────────────
// These cover the 17 CMMC/NIST domain families.
const DOMAIN_KEYWORDS: Record<string, string[]> = {
  AC: [
    "access control", "access", "authorization", "permission", "privilege",
    "least privilege", "role", "user account", "login", "authenticate",
    "rbac", "session", "remote access", "logical access", "account management",
    "need to know", "separation of duties",
  ],
  IA: [
    "identity", "authentication", "multi-factor", "mfa", "password",
    "credential", "account", "identification", "token", "biometric",
    "two-factor", "2fa", "authenticator", "replay", "identifier",
    "unique user", "user id",
  ],
  MP: [
    "media", "removable", "usb", "portable", "flash drive", "disk",
    "sanitize", "destroy", "wipe", "media protection", "storage media",
    "external drive", "physical media",
  ],
  PE: [
    "physical", "physical access", "facility", "badge", "door", "escort",
    "visitor", "datacenter", "server room", "physical protection",
    "physical security", "perimeter", "authorized personnel",
  ],
  SC: [
    "network", "boundary", "firewall", "encryption", "tls", "ssl", "vpn",
    "dmz", "communication", "tunnel", "protect", "cable", "wireless",
    "network protection", "cryptography", "encrypted", "transmission",
    "denial of service", "split tunneling",
  ],
  SI: [
    "integrity", "malware", "antivirus", "patch", "vulnerability", "scan",
    "flaw", "remediation", "firmware", "software update", "antimalware",
    "security alert", "malicious code", "signature update", "patching",
    "system integrity",
  ],
  AU: [
    "audit", "audit log", "log", "event", "monitoring", "syslog", "record",
    "siem", "review logs", "audit trail", "activity", "logging",
    "accountability", "audit record", "event log",
  ],
  AT: [
    "training", "awareness", "security awareness", "education",
    "phishing", "annual training", "user training", "security training",
    "workforce", "insider threat awareness",
  ],
  CM: [
    "configuration", "baseline", "change", "inventory", "software inventory",
    "hardware inventory", "change management", "approved list", "whitelist",
    "allowlist", "configuration management", "configuration baseline",
    "configuration settings", "least functionality",
  ],
  CP: [
    "continuity", "backup", "recovery", "disaster", "bcp", "dr",
    "business continuity", "rto", "rpo", "restore", "contingency",
    "contingency plan", "data backup", "system backup", "alternate site",
  ],
  IR: [
    "incident", "response", "breach", "detection", "compromise", "alert",
    "csirt", "investigate", "incident response", "incident handling",
    "security event", "incident report",
  ],
  MA: [
    "maintenance", "patching", "remote maintenance", "service", "repair",
    "controlled maintenance", "maintenance tool", "system maintenance",
    "media sanitization",
  ],
  PS: [
    "personnel", "screening", "termination", "contractor", "background",
    "clearance", "onboarding", "offboarding", "personnel security",
    "terminated user", "personnel action",
  ],
  RA: [
    "risk", "risk assessment", "vulnerability assessment", "threat",
    "risk management", "risk level", "risk analysis", "risk mitigation",
    "scanning", "vulnerability scanning",
  ],
  SA: [
    "acquisition", "procurement", "security engineering", "developer",
    "supply chain", "scrm", "system acquisition", "third party",
    "vendor", "supplier security",
  ],
  CA: [
    "assessment", "authorization", "plan of action", "poam", "review",
    "compliance", "security assessment", "control assessment",
    "security plan", "system security plan", "ssp",
  ],
  // Additional CMMC-specific families
  CM2: ["configuration management", "configuration item"],
  AM: ["asset management", "asset inventory", "asset tracking"],
};

// ─── Evidence-type keyword hints ───────────────────────────────────────────
// Used to boost relevance when evidenceType is known.
const EVIDENCE_TYPE_DOMAINS: Record<string, string[]> = {
  policy:                ["AC", "IA", "SC", "SI", "AU", "AT", "CM", "CP", "IR", "MA", "PS", "RA", "SA", "CA"],
  procedure:             ["AC", "IA", "SI", "CM", "CP", "IR", "MA"],
  screenshot:            ["AC", "IA", "SI", "AU", "CM"],
  log:                   ["AU", "IR", "SI", "CM"],
  report:                ["RA", "CA", "SI", "AU"],
  ticket:                ["IR", "CM", "MA"],
  configuration_export:  ["CM", "SC", "SI", "AC"],
  access_review:         ["AC", "IA", "PS"],
  training_record:       ["AT", "PS"],
  incident_record:       ["IR", "AU"],
  risk_record:           ["RA", "CA"],
  approval_record:       ["CM", "SA", "PS"],
  system_inventory:      ["CM", "SA"],
  asset_inventory:       ["CM", "SA", "AC"],
  supplier_review:       ["SA", "PS"],
  backup_verification:   ["CP"],
  network_diagram:       ["SC", "AC"],
  scan_report:           ["SI", "RA"],
};

// ─── Control-ID regex patterns ─────────────────────────────────────────────
// Covers: AC.L1-3.1.1  AC.L2-3.1.3  AC-3.1.1  3.1.1  AC_L1_3_1_1
const CONTROL_PATTERNS = [
  /\b([A-Z]{2})\.(L[12])-(\d+\.\d+\.\d+)\b/gi,      // AC.L1-3.1.1
  /\b([A-Z]{2})-(\d+\.\d+\.\d+)\b/gi,                // AC-3.1.1
  /\b([A-Z]{2})_(L[12])_(\d+)_(\d+)_(\d+)\b/gi,      // AC_L1_3_1_1
  /\b(\d+\.\d+\.\d+)\b/g,                             // 3.1.1 standalone
];

function extractControlRefs(text: string): { full: Set<string>; numeric: Set<string> } {
  const full = new Set<string>();
  const numeric = new Set<string>();

  // AC.L1-3.1.1
  for (const m of text.matchAll(/\b[A-Z]{2}\.[Ll][12]-\d+\.\d+\.\d+\b/gi)) {
    full.add(m[0].toUpperCase());
  }
  // AC-3.1.1
  for (const m of text.matchAll(/\b[A-Z]{2}-\d+\.\d+\.\d+\b/gi)) {
    full.add(m[0].toUpperCase());
  }
  // AC_L1_3_1_1 → normalise to AC.L1-3.1.1
  for (const m of text.matchAll(/\b([A-Z]{2})_(L[12])_(\d+)_(\d+)_(\d+)\b/gi)) {
    full.add(`${m[1].toUpperCase()}.${m[2].toUpperCase()}-${m[3]}.${m[4]}.${m[5]}`);
  }
  // Standalone numeric 3.1.1
  for (const m of text.matchAll(/\b(\d+\.\d+\.\d+)\b/g)) {
    numeric.add(m[1]);
  }

  return { full, numeric };
}

function parseControlId(controlId: string): { domain: string; numeric: string } {
  // AC.L1-3.1.1
  const m1 = controlId.match(/^([A-Z]+)\.[Ll]\d-(\d+\.\d+\.\d+)$/i);
  if (m1) return { domain: m1[1].toUpperCase(), numeric: m1[2] };
  // AC-3.1.1
  const m2 = controlId.match(/^([A-Z]+)-(\d+\.\d+\.\d+)$/i);
  if (m2) return { domain: m2[1].toUpperCase(), numeric: m2[2] };
  // R-05 style
  const m3 = controlId.match(/^([A-Z]+)-(\w+)$/i);
  if (m3) return { domain: m3[1].toUpperCase(), numeric: m3[2] };
  return { domain: "", numeric: controlId };
}

// ─── Text extraction (all local, no external services) ─────────────────────

async function extractText(
  buffer: Buffer,
  mimeType: string,
  filename: string
): Promise<string> {
  const ext = filename.split(".").pop()?.toLowerCase() ?? "";

  // DOCX — mammoth is already installed
  if (
    ext === "docx" ||
    mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  ) {
    try {
      const result = await mammoth.extractRawText({ buffer });
      return result.value.slice(0, 30_000);
    } catch {
      return "";
    }
  }

  // XLSX — exceljs is already installed
  if (
    ext === "xlsx" ||
    ext === "xls" ||
    mimeType === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
    mimeType === "application/vnd.ms-excel"
  ) {
    try {
      const wb = new ExcelJS.Workbook();
      await wb.xlsx.load(buffer as any);
      const parts: string[] = [];
      wb.eachSheet((sheet) => {
        parts.push(sheet.name);
        // Column headers (row 1) + first 8 data rows
        for (let r = 1; r <= Math.min(9, sheet.rowCount); r++) {
          sheet.getRow(r).eachCell((cell) => {
            const v = cell.value;
            if (v != null) {
              const s =
                typeof v === "string"
                  ? v
                  : v instanceof Date
                  ? v.toISOString()
                  : String(v);
              if (s.trim()) parts.push(s.trim());
            }
          });
        }
      });
      return parts.join(" ").slice(0, 30_000);
    } catch {
      return "";
    }
  }

  // CSV — read as plain text via ExcelJS CSV reader
  if (ext === "csv" || mimeType === "text/csv") {
    try {
      const wb = new ExcelJS.Workbook();
      await wb.csv.read(Readable.from(buffer) as any);
      const ws = wb.worksheets[0];
      if (!ws) return buffer.toString("utf8", 0, 30_000);
      const rows: string[] = [];
      ws.eachRow((row, rn) => {
        if (rn > 20) return;
        const cells: string[] = [];
        row.eachCell((c) => {
          const v = c.value;
          if (v != null) cells.push(String(v).trim());
        });
        if (cells.length) rows.push(cells.join(" "));
      });
      return rows.join("\n");
    } catch {
      return buffer.toString("utf8", 0, 30_000);
    }
  }

  // Plain text, JSON, YAML, LOG, etc.
  if (
    ["txt", "log", "json", "yaml", "yml", "md"].includes(ext) ||
    mimeType.startsWith("text/")
  ) {
    return buffer.toString("utf8", 0, 30_000);
  }

  // PDF — extract printable text from binary stream.
  // PDFs created digitally (not scanned) contain text objects as ASCII.
  // We scan for printable sequences long enough to be meaningful.
  if (ext === "pdf" || mimeType === "application/pdf") {
    try {
      const raw = buffer.slice(0, 200_000).toString("latin1");
      // PDF literal strings: (text inside parens)
      const parts: string[] = [];
      for (const m of raw.matchAll(/\(([^\)\\]{2,300})\)/g)) {
        const chunk = m[1]
          .replace(/\\n/g, " ")
          .replace(/\\r/g, " ")
          .replace(/[^\x20-\x7E]/g, " ")
          .replace(/\s+/g, " ")
          .trim();
        if (chunk.length > 3) parts.push(chunk);
      }
      // Also look for BT...ET text blocks
      for (const m of raw.matchAll(/BT\s+(.*?)\s+ET/gs)) {
        const chunk = m[1]
          .replace(/[^\x20-\x7E]/g, " ")
          .replace(/\s+/g, " ")
          .trim();
        if (chunk.length > 5) parts.push(chunk);
      }
      return parts.join(" ").slice(0, 30_000);
    } catch {
      return "";
    }
  }

  // Images and unsupported types — filename analysis only
  return "";
}

// ─── Scoring function ──────────────────────────────────────────────────────

interface ScoredControl {
  dbId: string;
  controlId: string;
  title: string;
  domainName: string | null;
  level: string | null;
  score: number;
  confidenceLabel: string;
  matchReason: string;
  matchedTerms: string[];
  recommendedRelationshipType: string;
}

function confidenceLabel(score: number): string {
  if (score >= 95) return "Exact Match";
  if (score >= 80) return "High Confidence";
  if (score >= 65) return "Medium Confidence";
  if (score >= 40) return "Low Confidence";
  return "No Match";
}

function recommendRelationship(score: number, reason: string): string {
  if (reason.includes("filename")) return "Direct Evidence";
  if (score >= 80) return "Direct Evidence";
  return "Supporting Evidence";
}

function scoreControl(
  control: { id: string; controlId: string; title: string; domainName: string | null; level: string | null },
  filenameRefs: { full: Set<string>; numeric: Set<string> },
  contentRefs: { full: Set<string>; numeric: Set<string> },
  filenameText: string,
  contentText: string,
  evidenceTypeDomains: string[]
): ScoredControl | null {
  let score = 0;
  const reasons: string[] = [];
  const matchedTerms: string[] = [];

  const cidUpper = control.controlId.toUpperCase();
  const { domain, numeric } = parseControlId(cidUpper);

  // ── Exact full control ID in filename ──────────────────────────────────
  if (filenameRefs.full.has(cidUpper)) {
    score = Math.max(score, 99);
    reasons.push(`Control ID ${control.controlId} found in filename`);
    matchedTerms.push(control.controlId);
  }

  // ── Exact full control ID in content ──────────────────────────────────
  if (score < 99 && contentRefs.full.has(cidUpper)) {
    score = Math.max(score, 95);
    reasons.push(`Control ID ${control.controlId} found in file content`);
    matchedTerms.push(control.controlId);
  }

  // ── AC-3.1.1 style match ───────────────────────────────────────────────
  if (score < 90) {
    const altId = `${domain}-${numeric}`;
    if (filenameRefs.full.has(altId)) {
      score = Math.max(score, 90);
      reasons.push(`Alternate control ID ${altId} found in filename`);
      matchedTerms.push(altId);
    } else if (contentRefs.full.has(altId)) {
      score = Math.max(score, 87);
      reasons.push(`Alternate control ID ${altId} found in content`);
      matchedTerms.push(altId);
    }
  }

  // ── Numeric part (3.1.1) in filename ──────────────────────────────────
  if (score < 80 && numeric && filenameRefs.numeric.has(numeric)) {
    score = Math.max(score, 78);
    reasons.push(`Requirement number ${numeric} found in filename`);
    matchedTerms.push(numeric);
  }

  // ── Numeric part (3.1.1) in content ───────────────────────────────────
  if (score < 70 && numeric && contentRefs.numeric.has(numeric)) {
    score = Math.max(score, 65);
    reasons.push(`Requirement number ${numeric} found in content`);
    matchedTerms.push(numeric);
  }

  // ── Domain keyword matching ────────────────────────────────────────────
  if (score < 85 && domain) {
    const domainKeywords = DOMAIN_KEYWORDS[domain] ?? [];
    const titleWords = (control.title ?? "")
      .toLowerCase()
      .split(/[\s,;:.()]+/)
      .filter((w) => w.length > 3);
    const allKeywords = [...new Set([...domainKeywords, ...titleWords])];

    const lowerFilename = filenameText.toLowerCase();
    const lowerContent = contentText.toLowerCase().slice(0, 15_000);
    const combined = `${lowerFilename} ${lowerContent}`;

    const matched = allKeywords.filter((kw) => combined.includes(kw));

    if (allKeywords.length > 0 && matched.length > 0) {
      const kwRatio = matched.length / allKeywords.length;
      // Map keyword ratio 0..1 → score 40..78
      const kwScore = Math.round(40 + kwRatio * 38);

      // Boost if this domain is hinted by the evidence type
      const domainBoost = evidenceTypeDomains.includes(domain) ? 5 : 0;
      const adjusted = Math.min(kwScore + domainBoost, 78);

      if (adjusted > score) {
        score = adjusted;
        reasons.push(
          `Keyword match (${domain} domain): ${matched.slice(0, 4).join(", ")}`
        );
        matchedTerms.push(...matched.slice(0, 4));
      }
    }
  }

  // Discard very weak matches
  if (score < 38) return null;

  return {
    dbId: control.id,
    controlId: control.controlId,
    title: control.title,
    domainName: control.domainName,
    level: control.level,
    score,
    confidenceLabel: confidenceLabel(score),
    matchReason: reasons.join("; ") || "Keyword similarity",
    matchedTerms: [...new Set(matchedTerms)],
    recommendedRelationshipType: recommendRelationship(score, reasons.join(" ")),
  };
}

// ─── Router ────────────────────────────────────────────────────────────────
const router = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 },
});

/**
 * POST /api/evidence/smart-map
 *
 * Accepts a file and optional metadata.
 * Returns control suggestions derived from local analysis only.
 *
 * Processing mode: Local Control HUB Analysis
 * External AI: Disabled
 */
router.post(
  "/evidence/smart-map",
  requireAuth,
  requireOrg,
  upload.single("file"),
  async (req, res) => {
    if (!req.file) {
      res.status(400).json({ error: "file is required" });
      return;
    }

    const filename: string = req.file.originalname;
    const mimeType: string = req.file.mimetype;
    const evidenceType: string = (req.body as { evidenceType?: string }).evidenceType ?? "";
    const maxResults = 5;

    // ── Extract text locally ─────────────────────────────────────────────
    let extractedText = "";
    let extractionNote = "";
    try {
      extractedText = await extractText(req.file.buffer, mimeType, filename);
      if (!extractedText) {
        extractionNote = "Content extraction not supported for this file type; using filename analysis only.";
      }
    } catch {
      extractionNote = "Content extraction failed; using filename analysis only.";
    }

    // ── Extract control refs from filename + content ──────────────────────
    const filenameRefs = extractControlRefs(filename);
    const contentRefs = extractControlRefs(extractedText);

    // ── Load controls ─────────────────────────────────────────────────────
    // Controls are global (not org-scoped). Join domains to get domain name.
    const controls = await db
      .select({
        id: controlsTable.id,
        controlId: controlsTable.controlId,
        title: controlsTable.title,
        domainName: domainsTable.name,
        level: controlsTable.level,
      })
      .from(controlsTable)
      .leftJoin(domainsTable, eq(controlsTable.domainId, domainsTable.id));

    // Evidence-type domain hints
    const etDomains = EVIDENCE_TYPE_DOMAINS[evidenceType] ?? [];

    // ── Score each control ────────────────────────────────────────────────
    const scored: ScoredControl[] = [];
    for (const ctrl of controls) {
      const result = scoreControl(
        ctrl,
        filenameRefs,
        contentRefs,
        filename,
        extractedText,
        etDomains
      );
      if (result) scored.push(result);
    }

    // Sort descending by score; ties broken by controlId alphabetically
    scored.sort((a, b) =>
      b.score !== a.score ? b.score - a.score : a.controlId.localeCompare(b.controlId)
    );

    const suggestions = scored.slice(0, maxResults).map((s) => ({
      controlDbId: s.dbId,
      controlId: s.controlId,
      title: s.title,
      domainName: s.domainName,
      level: s.level,
      confidence: s.score,
      confidenceLabel: s.confidenceLabel,
      matchReason: s.matchReason,
      matchedTerms: s.matchedTerms,
      recommendedRelationshipType: s.recommendedRelationshipType,
      isPreselected: s.score >= 80, // Exact Match + High Confidence are preselected
    }));

    res.json({
      processingMode: "local",
      processingLabel: "Local Control HUB Analysis",
      externalAIEnabled: false,
      engineVersion: ENGINE_VERSION,
      extractedTextLength: extractedText.length,
      extractionNote: extractionNote || undefined,
      filename,
      suggestions,
    });
  }
);

export default router;
