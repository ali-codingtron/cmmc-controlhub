import mammoth from "mammoth";

export interface ParsedSection {
  sectionKey: string;
  sectionTitle: string;
  content: string;
  sortOrder: number;
}

export interface ParsedControlMapping {
  controlRef: string;
  implementationNarrative: string;
  policyReference: string;
  sspStatus: string;
  sourceSection: string;
}

export interface ParseResult {
  sections: ParsedSection[];
  controlMappings: ParsedControlMapping[];
}

const CMMC_CONTROL_RE = /\b([A-Z]{2,4}\.L[12]-\d+\.\d+\.\d+)\b/;
const CMMC_CONTROL_RE_G = /\b([A-Z]{2,4}\.L[12]-\d+\.\d+\.\d+)\b/g;

const SECTION_MAP: { re: RegExp; key: string; title: string; order: number }[] = [
  { re: /purpose|scope|introduction/i, key: "purpose", title: "Document Purpose & Scope", order: 1 },
  { re: /system\s+overview/i, key: "system_overview", title: "System Overview", order: 2 },
  { re: /system\s+(description|information)/i, key: "system_description", title: "System Description", order: 3 },
  { re: /system\s+boundary|boundary/i, key: "boundary", title: "System Boundary", order: 4 },
  { re: /system\s+component|hardware|software\s+inventor|asset\s+inventor/i, key: "components", title: "System Components", order: 5 },
  { re: /interconnect|external\s+(system|connect|interface)/i, key: "interconnections", title: "External Interconnections", order: 6 },
  { re: /data\s+(flow|classification)/i, key: "data_flow", title: "Data Flow", order: 7 },
  { re: /roles?\s*(and|&|\/)\s*responsibilit|personnel\s+role/i, key: "roles", title: "Roles and Responsibilities", order: 8 },
  { re: /maintenance|review\s+(schedule|frequen|process)/i, key: "maintenance", title: "Maintenance and Review", order: 9 },
  { re: /poa&?m|plan\s+of\s+action/i, key: "poam_summary", title: "POA&M Summary", order: 10 },
  { re: /supporting\s+polic|polic.*list|reference.*doc|appendix.*polic/i, key: "supporting_policies", title: "Supporting Policy Documents", order: 11 },
  { re: /revision\s+history|change\s+(log|history|record)/i, key: "revision_history", title: "Revision History", order: 12 },
  { re: /approv|signature/i, key: "approvals", title: "Approval and Signatures", order: 13 },
];

function stripHtml(html: string): string {
  return html
    .replace(/<\/p>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/tr>/gi, "\n")
    .replace(/<\/td>/gi, " | ")
    .replace(/<\/th>/gi, " | ")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function extractSections(html: string): ParsedSection[] {
  const headingRe = /<h([1-3])[^>]*>([\s\S]*?)<\/h[1-3]>/gi;
  const found: { text: string; index: number; endIndex: number }[] = [];
  let m: RegExpExecArray | null;

  headingRe.lastIndex = 0;
  while ((m = headingRe.exec(html)) !== null) {
    found.push({ text: stripHtml(m[2]), index: m.index, endIndex: m.index + m[0].length });
  }

  const sections: ParsedSection[] = [];
  const usedKeys = new Set<string>();

  for (let i = 0; i < found.length; i++) {
    const headingText = found[i].text;
    const contentEnd = i + 1 < found.length ? found[i + 1].index : html.length;
    const rawContent = html.slice(found[i].endIndex, contentEnd);
    const content = stripHtml(rawContent).trim();
    if (!content || content.length < 5) continue;

    const def = SECTION_MAP.find((s) => s.re.test(headingText));
    if (def && !usedKeys.has(def.key)) {
      usedKeys.add(def.key);
      sections.push({
        sectionKey: def.key,
        sectionTitle: def.title,
        content: content.slice(0, 12000),
        sortOrder: def.order,
      });
    }
  }

  return sections.sort((a, b) => a.sortOrder - b.sortOrder);
}

function extractControlMappings(html: string): ParsedControlMapping[] {
  const mappings = new Map<string, ParsedControlMapping>();

  // Strategy 1: Table-based extraction
  const tableRe = /<table[\s\S]*?<\/table>/gi;
  let tbl: RegExpExecArray | null;
  tableRe.lastIndex = 0;

  while ((tbl = tableRe.exec(html)) !== null) {
    const tableHtml = tbl[0];
    const rowRe = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
    let row: RegExpExecArray | null;
    rowRe.lastIndex = 0;

    while ((row = rowRe.exec(tableHtml)) !== null) {
      const rowHtml = row[1];
      const cellRe = /<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi;
      const cells: string[] = [];
      let cell: RegExpExecArray | null;
      cellRe.lastIndex = 0;
      while ((cell = cellRe.exec(rowHtml)) !== null) {
        cells.push(stripHtml(cell[1]).trim());
      }

      if (cells.length < 2) continue;

      const firstCell = cells[0];
      const ctrlMatch = firstCell.match(CMMC_CONTROL_RE);
      if (!ctrlMatch) continue;

      const controlRef = ctrlMatch[1];
      if (mappings.has(controlRef)) continue;

      const narrativeCell = cells[1] ?? "";
      const policyCell = cells.slice(2).join(" ") ?? "";

      const policyRef = extractPolicyRef(policyCell + " " + narrativeCell);

      if (narrativeCell.length > 5) {
        mappings.set(controlRef, {
          controlRef,
          implementationNarrative: narrativeCell.slice(0, 6000),
          policyReference: policyRef,
          sspStatus: detectStatus(narrativeCell + " " + policyCell),
          sourceSection: "Control Implementation",
        });
      }
    }
  }

  // Strategy 2: Paragraph-based extraction
  const paraRe = /<p[^>]*>([\s\S]*?)<\/p>/gi;
  const paragraphs: string[] = [];
  let para: RegExpExecArray | null;
  paraRe.lastIndex = 0;
  while ((para = paraRe.exec(html)) !== null) {
    paragraphs.push(stripHtml(para[1]).trim());
  }

  for (let i = 0; i < paragraphs.length; i++) {
    const p = paragraphs[i];
    const ctrlMatch = p.match(CMMC_CONTROL_RE);
    if (!ctrlMatch || mappings.has(ctrlMatch[1])) continue;

    const controlRef = ctrlMatch[1];
    let narrative = p.slice(p.indexOf(controlRef) + controlRef.length).replace(/^[\s:\-–]+/, "").trim();

    let j = i + 1;
    while (j < paragraphs.length && !CMMC_CONTROL_RE.test(paragraphs[j]) && narrative.length < 3000) {
      narrative += " " + paragraphs[j];
      j++;
    }

    narrative = narrative.trim();
    if (narrative.length > 10) {
      mappings.set(controlRef, {
        controlRef,
        implementationNarrative: narrative.slice(0, 6000),
        policyReference: extractPolicyRef(narrative),
        sspStatus: detectStatus(narrative),
        sourceSection: "Control Implementation",
      });
    }
  }

  return Array.from(mappings.values());
}

function extractPolicyRef(text: string): string {
  const refs: string[] = [];
  const qpMatch = text.match(/\bQP\d+\b/g);
  if (qpMatch) refs.push(...qpMatch);
  const policyMatch = text.match(/\b[A-Z]{2,6}-\d{3,}\b/g);
  if (policyMatch) refs.push(...policyMatch);
  return [...new Set(refs)].slice(0, 5).join(", ");
}

function detectStatus(text: string): string {
  const lower = text.toLowerCase();
  if (/not\s+(applicable|implemented)|n\/a/i.test(text)) return "not_applicable";
  if (/alternative/i.test(text)) return "alternative";
  if (/implement|in\s+place|compliant|deployed|enabled/i.test(text)) return "implemented";
  return "planned";
}

export async function parseSSPDocument(buffer: Buffer): Promise<ParseResult> {
  const [htmlResult] = await Promise.all([
    mammoth.convertToHtml({ buffer }),
  ]);

  const html = htmlResult.value;
  const sections = extractSections(html);
  const controlMappings = extractControlMappings(html);

  return { sections, controlMappings };
}
