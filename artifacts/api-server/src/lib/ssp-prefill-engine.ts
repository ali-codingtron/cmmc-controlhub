/**
 * SSP Prefill Engine
 *
 * Replaces {{PLACEHOLDER}} tokens in a DOCX template with user-supplied values.
 * Uses adm-zip to manipulate the DOCX ZIP archive without docxtemplater/pizzip.
 *
 * Strategy:
 *  1. Pass 1 — simple in-place text substitution of any {{KEY}} that appears in
 *     a single <w:t> element (the common case in freshly authored templates).
 *  2. Pass 2 — within each <w:p> paragraph, reconstruct the logical run-text,
 *     detect split-run placeholders, and replace them by merging the affected
 *     runs into one replacement run while preserving the first run's rPr style.
 *
 * Limitations:
 *  - Run-level formatting inside a replaced span is lost in pass 2 (the
 *    replacement text inherits the first run's character style).
 *  - Tables in header/footer are processed identically to body paragraphs.
 */

import AdmZip from "adm-zip";

// ── XML helpers ───────────────────────────────────────────────────────────────

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function unescapeXml(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

// ── Pass 1: single-run replacement ────────────────────────────────────────────

function pass1(xml: string, values: Record<string, string>): string {
  let result = xml;
  for (const [key, rawValue] of Object.entries(values)) {
    const placeholder = `{{${key}}}`;
    if (!result.includes(placeholder)) continue;
    const escaped = escapeXml(rawValue);
    // Replace all occurrences with a simple split/join (avoids regex escaping issues)
    result = result.split(placeholder).join(escaped);
  }
  return result;
}

// ── Pass 2: split-run merge ────────────────────────────────────────────────────
// Paragraphs where a placeholder is split across multiple <w:r> runs.
// We merge the affected runs into a single run with the replacement value.

function extractRunText(runContent: string): string {
  // Extract text from all <w:t>...</w:t> within a run's inner XML
  const texts: string[] = [];
  const re = /<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(runContent)) !== null) {
    texts.push(unescapeXml(m[1]));
  }
  return texts.join("");
}

function extractRpr(runContent: string): string {
  const m = runContent.match(/<w:rPr>[\s\S]*?<\/w:rPr>/);
  return m ? m[0] : "";
}

function buildRun(rpr: string, text: string): string {
  const escapedText = escapeXml(text);
  const tAttr = text.match(/^\s|\s$/) ? ' xml:space="preserve"' : "";
  return `<w:r>${rpr}<w:t${tAttr}>${escapedText}</w:t></w:r>`;
}

function processParaForSplitRuns(para: string, values: Record<string, string>): string {
  // Gather all <w:r>...</w:r> runs from this paragraph (non-greedy)
  const runRe = /<w:r\b[^>]*>[\s\S]*?<\/w:r>/g;
  const runs: { full: string; text: string; start: number; end: number }[] = [];
  let m: RegExpExecArray | null;
  while ((m = runRe.exec(para)) !== null) {
    runs.push({
      full: m[0],
      text: extractRunText(m[0]),
      start: m.index,
      end: m.index + m[0].length,
    });
  }

  if (runs.length === 0) return para;

  // Build concatenated logical text
  const logicalText = runs.map((r) => r.text).join("");

  // Check if any placeholder still exists (pass 1 already handled single-run ones)
  const remaining = Object.keys(values).filter((k) =>
    logicalText.includes(`{{${k}}}`)
  );
  if (remaining.length === 0) return para;

  // For each remaining placeholder, find which runs contain it and merge them.
  // We work on a mutable copy of the para XML.
  let result = para;

  for (const key of remaining) {
    const placeholder = `{{${key}}}`;
    const value = values[key];

    // Rebuild the run list from `result` (a previous pass may have merged some)
    const updatedRunRe = /<w:r\b[^>]*>[\s\S]*?<\/w:r>/g;
    const updatedRuns: { full: string; text: string }[] = [];
    let um: RegExpExecArray | null;
    while ((um = updatedRunRe.exec(result)) !== null) {
      updatedRuns.push({ full: um[0], text: extractRunText(um[0]) });
    }

    const updatedLogical = updatedRuns.map((r) => r.text).join("");
    if (!updatedLogical.includes(placeholder)) continue;

    // Find the start and end run indices that together span the placeholder
    let accumulated = "";
    let startIdx = -1;
    let endIdx = -1;
    for (let i = 0; i < updatedRuns.length; i++) {
      const prev = accumulated;
      accumulated += updatedRuns[i].text;
      if (startIdx === -1 && accumulated.includes("{{")) {
        // Find which run introduces the opening '{{'
        if (prev.includes("{{") || updatedRuns[i].text.includes("{{")) {
          startIdx = i;
        }
      }
      if (startIdx !== -1 && accumulated.includes(placeholder)) {
        endIdx = i;
        break;
      }
    }

    if (startIdx === -1 || endIdx === -1) continue;

    // Extract rPr from the first run
    const rpr = extractRpr(updatedRuns[startIdx].full);

    // Build replacement: the merged logical text with the placeholder replaced
    const mergedText = updatedRuns.slice(startIdx, endIdx + 1).map((r) => r.text).join("");
    const replacedText = mergedText.split(placeholder).join(value);

    // Build the replacement run(s) — split on newlines to preserve line breaks
    const lines = replacedText.split("\n");
    const replacementXml = lines
      .map((line, i) => {
        const run = buildRun(rpr, line);
        return i < lines.length - 1 ? run + "<w:br/>" : run;
      })
      .join("");

    // Replace the original run sequence in `result`
    const originalSequence = updatedRuns
      .slice(startIdx, endIdx + 1)
      .map((r) => r.full)
      .join("");

    // Escape special chars in the search string for replacement
    result = result.replace(originalSequence, replacementXml);
  }

  return result;
}

function pass2(xml: string, values: Record<string, string>): string {
  // Only process paragraphs that still contain any {{ to save cycles
  if (!xml.includes("{{")) return xml;
  return xml.replace(/<w:p\b[^>]*>[\s\S]*?<\/w:p>/g, (para) => {
    if (!para.includes("{{")) return para;
    return processParaForSplitRuns(para, values);
  });
}

// ── Main entry point ───────────────────────────────────────────────────────────

const XML_PARTS_TO_PROCESS = [
  "word/document.xml",
  /^word\/header\d*\.xml$/,
  /^word\/footer\d*\.xml$/,
  /^word\/endnotes\.xml$/,
  /^word\/footnotes\.xml$/,
];

function shouldProcess(entryName: string): boolean {
  return XML_PARTS_TO_PROCESS.some((pattern) =>
    typeof pattern === "string"
      ? entryName === pattern
      : pattern.test(entryName)
  );
}

/**
 * Apply placeholder values to a DOCX template buffer.
 *
 * @param templateBuffer  Buffer of the master DOCX template (never modified)
 * @param values          Map of placeholder key → replacement text
 * @returns               New buffer with all placeholders replaced
 */
export function applyPrefillToDocx(
  templateBuffer: Buffer,
  values: Record<string, string>
): Buffer {
  // Work on a copy so the master buffer is never mutated
  const zip = new AdmZip(templateBuffer);

  const entries = zip.getEntries();
  for (const entry of entries) {
    const name = entry.entryName;
    if (!shouldProcess(name)) continue;

    const rawXml = entry.getData().toString("utf8");
    let processed = pass1(rawXml, values);
    processed = pass2(processed, values);

    if (processed !== rawXml) {
      zip.updateFile(name, Buffer.from(processed, "utf8"));
    }
  }

  return zip.toBuffer();
}

/**
 * Discover all {{PLACEHOLDER}} tokens present in a DOCX template buffer.
 * Useful for diagnostics and schema validation.
 */
export function discoverPlaceholders(templateBuffer: Buffer): string[] {
  const zip = new AdmZip(templateBuffer);
  const found = new Set<string>();

  for (const entry of zip.getEntries()) {
    if (!shouldProcess(entry.entryName)) continue;
    const xml = entry.getData().toString("utf8");
    const re = /\{\{([A-Z0-9_]+)\}\}/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(xml)) !== null) {
      found.add(m[1]);
    }
  }

  return Array.from(found).sort();
}
