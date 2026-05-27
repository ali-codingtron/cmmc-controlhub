import PDFDocument from "pdfkit";
import type { Response } from "express";
import type { PaReportData } from "./pa-report-generator";

const CMMC_L2_TOTAL = 110;

const C = {
  navy: "#0f172a",
  navyMid: "#1e3a8a",
  blue: "#1d4ed8",
  blueMid: "#3b82f6",
  blueLight: "#eff6ff",
  slate: "#475569",
  slateLight: "#94a3b8",
  border: "#e2e8f0",
  bg: "#f8fafc",
  white: "#ffffff",
  black: "#0f172a",
  critical: "#dc2626",
  criticalBg: "#fef2f2",
  high: "#ea580c",
  highBg: "#fff7ed",
  medium: "#d97706",
  mediumBg: "#fffbeb",
  low: "#2563eb",
  green: "#16a34a",
  greenBg: "#f0fdf4",
};

const A4_W = 595.28;
const A4_H = 841.89;
const MARGIN = 50;
const CONTENT_W = A4_W - MARGIN * 2;
const HDR_H = 34;
const FTR_H = 24;
const PAGE_TOP = HDR_H + 16;
const PAGE_BOT = A4_H - FTR_H - 12;

const CMMC_DOMAINS = [
  { id: "AC", name: "Access Control", total: 22 },
  { id: "IA", name: "Identification & Authentication", total: 11 },
  { id: "AU", name: "Audit & Accountability", total: 9 },
  { id: "SC", name: "Sys & Comms Protection", total: 16 },
  { id: "CM", name: "Configuration Management", total: 9 },
  { id: "SI", name: "Sys & Info Integrity", total: 7 },
  { id: "MP", name: "Media Protection", total: 9 },
  { id: "IR", name: "Incident Response", total: 3 },
  { id: "MA", name: "Maintenance", total: 6 },
  { id: "RA", name: "Risk Assessment", total: 3 },
  { id: "CA", name: "Security Assessment", total: 4 },
  { id: "PE", name: "Physical Protection", total: 6 },
  { id: "PS", name: "Personnel Security", total: 2 },
  { id: "AT", name: "Awareness & Training", total: 3 },
];

function getDomain(controlId: string): string {
  const m = controlId.match(/^3\.(\d+)\./);
  if (!m) return "OTHER";
  const n = parseInt(m[1]);
  const map: Record<number, string> = {
    1: "AC", 2: "AT", 3: "AU", 4: "CM", 5: "IA", 6: "IR",
    7: "MA", 8: "MP", 9: "PS", 10: "PE", 11: "RA", 12: "CA",
    13: "SC", 14: "SI",
  };
  return map[n] ?? "OTHER";
}

function fmtDate(iso: string | null, offsetDays = 0): string {
  if (!iso) return "—";
  const d = new Date(iso);
  d.setDate(d.getDate() + offsetDays);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function fmtDateTime(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-US", {
    month: "short", day: "numeric", year: "numeric",
    hour: "numeric", minute: "2-digit",
  });
}

function healthLabel(rate: number, total: number) {
  if (total < 3) return { label: "Insufficient Data", color: C.slateLight };
  if (rate >= 75) return { label: "Strong", color: C.green };
  if (rate >= 50) return { label: "Moderate", color: C.medium };
  if (rate >= 25) return { label: "Weak", color: C.high };
  return { label: "Critical Gaps", color: C.critical };
}

function dueDateOffset(severity: string): number {
  if (severity === "critical") return 7;
  if (severity === "high") return 14;
  if (severity === "medium") return 30;
  return 60;
}

function suggestOwner(packId: string): string {
  if (packId === "identity" || packId === "authentication" || packId === "conditional_access") return "IT Admin / Identity Team";
  if (packId === "devices") return "IT Admin / Endpoint Team";
  if (packId === "audit") return "IT Admin / Security Team";
  if (packId === "secure_score") return "IT Security Team";
  return "IT / Compliance Team";
}

function narrativeInterpretation(data: PaReportData, passRate: number, critCount: number, highCount: number, health: string, confRate: number): string {
  const failedPacks = (data.scan.packsFailed ?? []).length;
  const topIssues: string[] = [];

  if (critCount > 0) topIssues.push(`${critCount} critical finding${critCount > 1 ? "s" : ""} requiring immediate remediation`);
  if (highCount > 0) topIssues.push(`${highCount} high-severity gap${highCount > 1 ? "s" : ""}`);
  if (failedPacks > 0) topIssues.push(`${failedPacks} assessment pack${failedPacks > 1 ? "s" : ""} unable to collect data`);

  let base = `The Microsoft tenant scan shows ${health.toLowerCase()} technical readiness at ${passRate}% pass rate with ${confRate}% assessment confidence. `;

  if (topIssues.length > 0) {
    base += `Key concerns include ${topIssues.join(", ")}. `;
  }

  if (passRate < 50) {
    base += "The organization has significant remediation work to complete before it can be considered ready for a formal CMMC Level 2 assessment.";
  } else if (passRate < 75) {
    base += "Targeted remediation of the identified gaps would substantially improve the organization's readiness posture before a formal assessment.";
  } else {
    base += "The organization demonstrates solid technical controls with focused areas to strengthen before formal assessment.";
  }

  return base;
}

function generateTopConcerns(data: PaReportData): string[] {
  const concerns: string[] = [];
  const critHigh = data.findings.filter((f) => f.severity === "critical" || f.severity === "high");
  for (const f of critHigh.slice(0, 4)) {
    concerns.push(f.title);
  }
  if ((data.scan.packsFailed ?? []).includes("devices")) {
    concerns.push("Intune / device data unavailable — endpoint posture unverified");
  }
  return concerns.slice(0, 5);
}

export function generatePaExecutiveReportPdf(data: PaReportData, res: Response): void {
  const doc = new PDFDocument({
    size: "A4",
    margin: MARGIN,
    autoFirstPage: false,
    bufferPages: true,
  });

  res.setHeader("Content-Type", "application/pdf");
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="executive-report-${data.scan.id.slice(0, 8)}.pdf"`
  );
  doc.pipe(res);

  const passRate = data.scan.totalChecks > 0
    ? Math.round((data.scan.passedChecks / data.scan.totalChecks) * 100) : 0;
  const confRate = data.scan.totalChecks > 0
    ? Math.round(((data.scan.totalChecks - data.scan.unknowns) / data.scan.totalChecks) * 100) : 0;
  const critCount = data.findings.filter((f) => f.severity === "critical").length;
  const highCount = data.findings.filter((f) => f.severity === "high").length;
  const { label: health, color: healthCol } = healthLabel(passRate, data.scan.totalChecks);
  const confLabel = confRate >= 80 ? "High" : confRate >= 50 ? "Moderate" : "Low";
  const confColor = confRate >= 80 ? C.green : confRate >= 50 ? C.medium : C.critical;

  const controlsTouched = Array.from(new Set([
    ...data.evidenceRecords.flatMap((e) => e.linkedControlIds),
    ...data.findings.flatMap((f) => f.linkedControlIds),
  ]));
  const failedPacks = new Set(data.scan.packsFailed ?? []);
  const scanDate = data.scan.completedAt ?? data.scan.startedAt;
  const openRequests = data.evidenceRequests.length;

  let bodyPageCount = 0;

  function addPage(): void {
    doc.addPage({ size: "A4", margin: 0 });
    bodyPageCount++;

    doc.save();
    // Header
    doc.rect(0, 0, A4_W, HDR_H).fill(C.navy);
    doc.fillColor("#64748b").font("Helvetica-Bold").fontSize(7)
      .text("CONTROL HUB", MARGIN, 9);
    doc.fillColor(C.white).font("Helvetica").fontSize(7)
      .text("Executive Pre-Assessment Report", MARGIN + 65, 9, { width: CONTENT_W - 120 });
    doc.fillColor("#475569").font("Helvetica").fontSize(7)
      .text(data.org.name, MARGIN + 65, 19, { width: CONTENT_W - 120 });
    doc.fillColor(C.white).font("Helvetica").fontSize(7)
      .text(`Page ${bodyPageCount}`, A4_W - MARGIN - 46, 13, { width: 46, align: "right" });

    // Footer
    doc.rect(0, A4_H - FTR_H, A4_W, FTR_H).fill("#f1f5f9");
    doc.rect(0, A4_H - FTR_H, A4_W, 0.5).fill(C.border);
    doc.fillColor(C.slateLight).font("Helvetica").fontSize(6.5)
      .text("CONFIDENTIAL — Not an official CMMC assessment. Prepared by Control HUB for internal use only.",
        MARGIN, A4_H - 14, { width: CONTENT_W, align: "center" });
    doc.restore();
  }

  function safePage(y: number, needed = 80): number {
    if (y + needed > PAGE_BOT) { addPage(); return PAGE_TOP; }
    return y;
  }

  function section(y: number, needed = 120): number {
    if (y + needed > PAGE_BOT - 50) { addPage(); return PAGE_TOP; }
    return y + 16;
  }

  function h1(text: string, y: number): number {
    doc.rect(MARGIN, y, CONTENT_W, 22).fill(C.navy);
    doc.rect(MARGIN, y, 4, 22).fill(C.blueMid);
    doc.fillColor(C.white).font("Helvetica-Bold").fontSize(10.5).text(text, MARGIN + 12, y + 6);
    return y + 30;
  }

  function h2(text: string, y: number, color = C.navyMid): number {
    doc.fillColor(color).font("Helvetica-Bold").fontSize(9).text(text, MARGIN, y);
    doc.moveTo(MARGIN, y + 12).lineTo(MARGIN + CONTENT_W, y + 12)
      .lineWidth(0.5).strokeColor(C.border).stroke();
    return y + 20;
  }

  function badge(text: string, color: string, x: number, y: number, w: number, h = 11): void {
    doc.rect(x, y, w, h).fill(color);
    doc.fillColor(C.white).font("Helvetica-Bold").fontSize(6.5)
      .text(text, x, y + (h - 6.5) / 2, { width: w, align: "center" });
  }

  // ═══════════════════════════════════════════════════════════════
  // COVER PAGE
  // ═══════════════════════════════════════════════════════════════
  doc.addPage({ size: "A4", margin: 0 });

  // Deep navy top half
  doc.rect(0, 0, A4_W, 290).fill(C.navy);
  // Accent stripe
  doc.rect(0, 290, A4_W, 4).fill(C.blueMid);
  // Subtle left accent
  doc.rect(0, 0, 5, 290).fill(C.blue);

  doc.fillColor("#94a3b8").font("Helvetica-Bold").fontSize(10).text("CONTROL HUB", MARGIN + 8, 44);
  doc.moveTo(MARGIN + 8, 59).lineTo(MARGIN + 80, 59).lineWidth(1.5).strokeColor("#3b82f6").stroke();

  doc.fillColor(C.white).font("Helvetica-Bold").fontSize(30)
    .text("Tenant-Connected", MARGIN + 8, 74, { width: CONTENT_W });
  doc.fillColor(C.white).font("Helvetica-Bold").fontSize(30)
    .text("CMMC Pre-Assessment", MARGIN + 8, 108, { width: CONTENT_W });

  doc.fillColor("#93c5fd").font("Helvetica").fontSize(12)
    .text("Executive Summary Report", MARGIN + 8, 150, { width: CONTENT_W });
  doc.fillColor("#64748b").font("Helvetica").fontSize(9.5)
    .text("Microsoft 365 / Entra Technical Readiness Scan", MARGIN + 8, 168, { width: CONTENT_W });

  // Status badges
  const scanStatusLabel = data.scan.status === "completed" ? "COMPLETED" :
    data.scan.status === "completed_with_warnings" ? "COMPLETED WITH WARNINGS" : "FAILED";
  const scanStatusColor = data.scan.status === "completed" ? C.green :
    data.scan.status === "completed_with_warnings" ? C.medium : C.critical;
  badge(scanStatusLabel, scanStatusColor, MARGIN + 8, 200, 120);
  badge("CMMC LEVEL 2", C.navyMid, MARGIN + 136, 200, 80);
  badge("CONFIDENTIAL", "#374151", MARGIN + 224, 200, 76);

  // Readiness tile on cover
  doc.rect(MARGIN + 8, 228, 130, 50).fill("#1e293b");
  doc.fillColor(healthCol).font("Helvetica-Bold").fontSize(19).text(health, MARGIN + 8, 234, { width: 130, align: "center" });
  doc.fillColor("#94a3b8").font("Helvetica").fontSize(7).text("Tenant Scan Health", MARGIN + 8, 256, { width: 130, align: "center" });

  doc.rect(MARGIN + 148, 228, 100, 50).fill("#1e293b");
  doc.fillColor(confColor).font("Helvetica-Bold").fontSize(19).text(`${confRate}%`, MARGIN + 148, 234, { width: 100, align: "center" });
  doc.fillColor("#94a3b8").font("Helvetica").fontSize(7).text(`${confLabel} Confidence`, MARGIN + 148, 256, { width: 100, align: "center" });

  // Metadata table
  const metaY = 314;
  function coverRow(label: string, value: string, y: number): number {
    doc.fillColor(C.slateLight).font("Helvetica").fontSize(8).text(label, MARGIN + 8, y, { width: 118 });
    doc.fillColor(C.black).font("Helvetica-Bold").fontSize(8.5).text(value, MARGIN + 130, y, { width: CONTENT_W - 130 });
    doc.moveTo(MARGIN + 8, y + 15).lineTo(MARGIN + CONTENT_W - 8, y + 15).lineWidth(0.3).strokeColor(C.border).stroke();
    return y + 20;
  }

  let cy = metaY;
  cy = coverRow("Organization", data.org.name, cy);
  cy = coverRow("Tenant", data.tenantConnection?.tenantName ?? "—", cy);
  if (data.tenantConnection?.primaryDomain) {
    cy = coverRow("Primary Domain", data.tenantConnection.primaryDomain, cy);
  }
  cy = coverRow("Scan Name", data.scan.scanName, cy);
  cy = coverRow("Scan Date", fmtDateTime(scanDate), cy);
  cy = coverRow("Report Generated", fmtDateTime(new Date().toISOString()), cy);
  cy = coverRow("Prepared By", data.generatedBy, cy);
  cy = coverRow("Target CMMC Level", "CMMC Level 2  (110 practices)", cy);

  // Footer strip
  doc.rect(0, A4_H - 40, A4_W, 40).fill("#f8fafc");
  doc.rect(0, A4_H - 40, A4_W, 0.5).fill(C.border);
  doc.fillColor(C.slateLight).font("Helvetica").fontSize(6.5)
    .text(
      "This report is a technical pre-assessment based on Microsoft Graph data and Control HUB analysis. " +
      "It is intended to support CMMC readiness planning. It is not an official CMMC assessment, certification decision, or C3PAO determination.",
      MARGIN, A4_H - 26, { width: CONTENT_W, align: "center" }
    );

  // ═══════════════════════════════════════════════════════════════
  // PAGE 2: EXECUTIVE SUMMARY
  // ═══════════════════════════════════════════════════════════════
  addPage();
  let y = PAGE_TOP;
  y = h1("Executive Summary", y);

  // Readiness + Confidence large tiles
  const tW = (CONTENT_W - 6) / 2;
  doc.rect(MARGIN, y, tW, 54).fill("#0f172a");
  doc.rect(MARGIN, y, tW, 3).fill(healthCol);
  doc.fillColor(healthCol).font("Helvetica-Bold").fontSize(22).text(health, MARGIN, y + 10, { width: tW, align: "center" });
  doc.fillColor("#94a3b8").font("Helvetica").fontSize(7.5).text("Tenant Scan Health", MARGIN + 4, y + 37, { width: tW - 8, align: "center" });
  doc.fillColor("#64748b").font("Helvetica").fontSize(7).text(`${passRate}% of checks passed`, MARGIN + 4, y + 47, { width: tW - 8, align: "center" });

  doc.rect(MARGIN + tW + 6, y, tW, 54).fill("#0f172a");
  doc.rect(MARGIN + tW + 6, y, tW, 3).fill(confColor);
  doc.fillColor(confColor).font("Helvetica-Bold").fontSize(22).text(`${confRate}%  ${confLabel}`, MARGIN + tW + 6, y + 10, { width: tW, align: "center" });
  doc.fillColor("#94a3b8").font("Helvetica").fontSize(7.5).text("Assessment Confidence", MARGIN + tW + 10, y + 37, { width: tW - 8, align: "center" });
  const confReason = `${data.scan.packsCompleted?.length ?? 0} of ${data.scan.packsRequested?.length ?? 0} packs collected data`;
  doc.fillColor("#64748b").font("Helvetica").fontSize(7).text(confReason, MARGIN + tW + 10, y + 47, { width: tW - 8, align: "center" });
  y += 62;

  // 4-column KPI row
  const kW = (CONTENT_W - 6) / 4;
  function miniKpi(label: string, value: string, color: string, x: number) {
    doc.rect(x, y, kW - 2, 40).fill(C.bg).strokeColor(C.border).lineWidth(0.5).stroke();
    doc.rect(x, y, kW - 2, 3).fill(color);
    doc.fillColor(color).font("Helvetica-Bold").fontSize(17).text(value, x, y + 9, { width: kW - 2, align: "center" });
    doc.fillColor(C.slate).font("Helvetica").fontSize(6.5).text(label, x + 3, y + 30, { width: kW - 8, align: "center" });
  }
  miniKpi("Controls Touched", `${controlsTouched.length}/${CMMC_L2_TOTAL}`, C.blue, MARGIN);
  miniKpi("Critical Findings", critCount.toString(), critCount > 0 ? C.critical : C.green, MARGIN + kW + 2);
  miniKpi("High Findings", highCount.toString(), highCount > 0 ? C.high : C.green, MARGIN + (kW + 2) * 2);
  miniKpi("Evidence Requests", openRequests.toString(), openRequests > 0 ? C.medium : C.green, MARGIN + (kW + 2) * 3);
  y += 50;

  // What This Means
  y = safePage(y, 90);
  doc.rect(MARGIN, y, CONTENT_W, 4).fill(C.navyMid);
  doc.rect(MARGIN, y + 4, CONTENT_W, 78).fill(C.blueLight).strokeColor(C.border).lineWidth(0.5).stroke();
  doc.fillColor(C.navyMid).font("Helvetica-Bold").fontSize(9).text("What This Means", MARGIN + 10, y + 12);
  const narrative = narrativeInterpretation(data, passRate, critCount, highCount, health, confRate);
  doc.fillColor(C.slate).font("Helvetica").fontSize(8.5)
    .text(narrative, MARGIN + 10, y + 28, { width: CONTENT_W - 20, align: "justify" });
  y += 92;

  // Top Concerns
  y = safePage(y, 80);
  y = h2("Top Concerns", y);
  const concerns = generateTopConcerns(data);
  for (let i = 0; i < concerns.length; i++) {
    y = safePage(y, 18);
    const isHigh = i < 2;
    const bg = isHigh ? C.criticalBg : C.bg;
    doc.rect(MARGIN, y, CONTENT_W, 16).fill(bg);
    doc.fillColor(isHigh ? C.critical : C.slate).font("Helvetica-Bold").fontSize(8)
      .text(`${i + 1}.`, MARGIN + 6, y + 4, { width: 14 });
    doc.fillColor(isHigh ? C.critical : C.black).font("Helvetica").fontSize(8.5)
      .text(concerns[i], MARGIN + 22, y + 4, { width: CONTENT_W - 28 });
    doc.moveTo(MARGIN, y + 16).lineTo(MARGIN + CONTENT_W, y + 16).lineWidth(0.3).strokeColor(C.border).stroke();
    y += 16;
  }
  y += 10;

  // Recommended Next Step
  y = safePage(y, 50);
  const firstP1 = data.roadmapActions.filter((a) => a.priority === 1)[0];
  if (firstP1) {
    doc.rect(MARGIN, y, CONTENT_W, 40).fill(C.bg).strokeColor(C.border).lineWidth(0.5).stroke();
    doc.rect(MARGIN, y, 4, 40).fill(C.blue);
    doc.fillColor(C.navyMid).font("Helvetica-Bold").fontSize(8.5).text("Recommended Next Step", MARGIN + 12, y + 7);
    doc.fillColor(C.slate).font("Helvetica").fontSize(8).text(firstP1.title, MARGIN + 12, y + 21, { width: CONTENT_W - 24 });
    if (firstP1.description) {
      doc.fillColor(C.slateLight).font("Helvetica").fontSize(7.5)
        .text(firstP1.description.slice(0, 120) + (firstP1.description.length > 120 ? "…" : ""), MARGIN + 12, y + 31, { width: CONTENT_W - 24 });
    }
    y += 50;
  }

  // ═══════════════════════════════════════════════════════════════
  // PAGE 3: TOP RISKS & IMMEDIATE ACTIONS
  // ═══════════════════════════════════════════════════════════════
  y = section(y, 200);
  y = h1("Top Risks & Immediate Actions", y);

  doc.fillColor(C.slate).font("Helvetica").fontSize(8)
    .text("The following risks were identified from the tenant scan and should be addressed as the highest priorities before the formal CMMC assessment.", MARGIN, y, { width: CONTENT_W });
  y = doc.y + 12;

  // Risk table
  const RT = {
    num: { x: MARGIN, w: 20 },
    sev: { x: MARGIN + 20, w: 52 },
    risk: { x: MARGIN + 72, w: 140 },
    why: { x: MARGIN + 212, w: 110 },
    action: { x: MARGIN + 322, w: 100 },
    controls: { x: MARGIN + 422, w: CONTENT_W - 422 },
  };

  // Table header
  doc.rect(MARGIN, y, CONTENT_W, 15).fill(C.navy);
  const rtCols = [
    { label: "#", ...RT.num }, { label: "Severity", ...RT.sev },
    { label: "Risk / Gap", ...RT.risk }, { label: "Why It Matters", ...RT.why },
    { label: "Recommended Action", ...RT.action }, { label: "Controls", ...RT.controls },
  ];
  for (const col of rtCols) {
    doc.fillColor(C.white).font("Helvetica-Bold").fontSize(6.5)
      .text(col.label, col.x + 3, y + 4, { width: col.w - 6 });
  }
  y += 17;

  const SEVERITY_COLOR: Record<string, string> = {
    critical: C.critical, high: C.high, medium: C.medium, low: C.low, informational: "#6b7280",
  };
  const SEVERITY_SHORT: Record<string, string> = {
    critical: "Critical", high: "High", medium: "Medium", low: "Low", informational: "Info",
  };

  const topFindings = [...data.findings]
    .sort((a, b) => {
      const order = ["critical", "high", "medium", "low", "informational"];
      return order.indexOf(a.severity) - order.indexOf(b.severity);
    })
    .slice(0, 5);

  topFindings.forEach((f, i) => {
    const sevColor = SEVERITY_COLOR[f.severity] ?? C.slateLight;
    const dueDate = fmtDate(scanDate, dueDateOffset(f.severity));
    const action = f.recommendedRemediation
      ? f.recommendedRemediation.slice(0, 80) + (f.recommendedRemediation.length > 80 ? "…" : "")
      : "Review and remediate";
    const controls = f.linkedControlIds.slice(0, 3).join(" ") + (f.linkedControlIds.length > 3 ? ` +${f.linkedControlIds.length - 3}` : "");

    const rowH = 28;
    y = safePage(y, rowH);
    const shade = i % 2 === 0;
    if (shade) doc.rect(MARGIN, y, CONTENT_W, rowH).fill(C.bg);

    doc.fillColor(C.slateLight).font("Helvetica").fontSize(7)
      .text((i + 1).toString(), RT.num.x + 3, y + 10, { width: RT.num.w - 6, align: "center" });
    badge(SEVERITY_SHORT[f.severity] ?? f.severity, sevColor, RT.sev.x + 3, y + 9, RT.sev.w - 8, 11);
    doc.fillColor(C.black).font("Helvetica-Bold").fontSize(7.5)
      .text(f.title, RT.risk.x + 3, y + 5, { width: RT.risk.w - 6 });
    doc.fillColor(C.slateLight).font("Helvetica").fontSize(6.5)
      .text(`Due: ${dueDate}`, RT.risk.x + 3, y + 18, { width: RT.risk.w - 6 });
    doc.fillColor(C.slate).font("Helvetica").fontSize(7.5)
      .text(f.observedCondition?.slice(0, 80) ?? "See technical report", RT.why.x + 3, y + 5, { width: RT.why.w - 6 });
    doc.fillColor(C.slate).font("Helvetica").fontSize(7.5)
      .text(action, RT.action.x + 3, y + 5, { width: RT.action.w - 6 });
    doc.fillColor(C.blue).font("Helvetica").fontSize(7)
      .text(controls, RT.controls.x + 3, y + 5, { width: RT.controls.w - 6 });

    doc.moveTo(MARGIN, y + rowH).lineTo(MARGIN + CONTENT_W, y + rowH).lineWidth(0.3).strokeColor(C.border).stroke();
    y += rowH;
  });
  y += 14;

  // ═══════════════════════════════════════════════════════════════
  // PAGE 4: 30/60/90 DAY REMEDIATION PLAN
  // ═══════════════════════════════════════════════════════════════
  y = section(y, 200);
  y = h1("30 / 60 / 90 Day Remediation Plan", y);

  doc.fillColor(C.slate).font("Helvetica").fontSize(8)
    .text(
      "These roadmap actions are recommended based on tenant scan findings. " +
      "Address P1 items first to establish a foundation before formal assessment scheduling.",
      MARGIN, y, { width: CONTENT_W }
    );
  y = doc.y + 12;

  const p1 = data.roadmapActions.filter((a) => a.priority === 1).sort((a, b) => a.priority - b.priority);
  const p2 = data.roadmapActions.filter((a) => a.priority === 2).sort((a, b) => a.priority - b.priority);
  const p3 = data.roadmapActions.filter((a) => a.priority === 3).sort((a, b) => a.priority - b.priority);

  const buckets: Array<{ label: string; subtitle: string; items: typeof p1; color: string; bg: string }> = [
    { label: "First 30 Days", subtitle: "P1 — Immediate", items: p1, color: C.critical, bg: C.criticalBg },
    { label: "31–60 Days", subtitle: "P2 — Short-term", items: p2, color: C.high, bg: C.highBg },
    { label: "61–90 Days", subtitle: "P3 — Long-term", items: p3, color: C.blue, bg: C.blueLight },
  ];

  const effort = (p: number) => p === 1 ? "1–2 weeks" : p === 2 ? "1–3 months" : "3–6 months";

  for (const bucket of buckets) {
    if (bucket.items.length === 0) continue;
    y = safePage(y, 50);

    // Bucket header
    doc.rect(MARGIN, y, CONTENT_W, 20).fill(bucket.bg).strokeColor(C.border).lineWidth(0.5).stroke();
    doc.rect(MARGIN, y, 4, 20).fill(bucket.color);
    doc.fillColor(bucket.color).font("Helvetica-Bold").fontSize(9).text(bucket.label, MARGIN + 12, y + 5);
    doc.fillColor(C.slateLight).font("Helvetica").fontSize(7.5).text(bucket.subtitle, MARGIN + 12, y + 14);
    y += 24;

    for (let ai = 0; ai < bucket.items.length; ai++) {
      const action = bucket.items[ai];
      const rowH = 28;
      y = safePage(y, rowH);
      if (ai % 2 === 0) doc.rect(MARGIN, y, CONTENT_W, rowH).fill(C.bg);

      doc.fillColor(bucket.color).font("Helvetica-Bold").fontSize(7.5)
        .text(`${ai + 1}.`, MARGIN + 6, y + 9, { width: 16 });
      doc.fillColor(C.black).font("Helvetica-Bold").fontSize(8)
        .text(action.title, MARGIN + 24, y + 5, { width: 220 });
      doc.fillColor(C.slateLight).font("Helvetica").fontSize(7)
        .text(`Effort: ${effort(action.priority)}`, MARGIN + 24, y + 17, { width: 120 });

      if (action.linkedControlIds.length > 0) {
        const ctrlStr = action.linkedControlIds.slice(0, 4).join(" ") + (action.linkedControlIds.length > 4 ? ` +${action.linkedControlIds.length - 4}` : "");
        doc.fillColor(C.blue).font("Helvetica").fontSize(7)
          .text(ctrlStr, MARGIN + 260, y + 5, { width: CONTENT_W - 270 });
      }
      if (action.description) {
        doc.fillColor(C.slate).font("Helvetica").fontSize(7.5)
          .text(action.description.slice(0, 100) + (action.description.length > 100 ? "…" : ""), MARGIN + 260, y + 16, { width: CONTENT_W - 270 });
      }

      doc.moveTo(MARGIN, y + rowH).lineTo(MARGIN + CONTENT_W, y + rowH).lineWidth(0.3).strokeColor(C.border).stroke();
      y += rowH;
    }
    y += 12;
  }

  // ═══════════════════════════════════════════════════════════════
  // PAGE 5: ASSESSMENT COVERAGE & LIMITATIONS
  // ═══════════════════════════════════════════════════════════════
  y = section(y, 200);
  y = h1("Assessment Coverage & Limitations", y);

  // What was evaluated vs not — two column layout
  const col2W = (CONTENT_W - 8) / 2;
  const evStartY = y;

  doc.fillColor(C.green).font("Helvetica-Bold").fontSize(8.5).text("Evaluated by Tenant Scan", MARGIN, y);
  y += 14;
  const evLeft = [
    "Entra ID user accounts, guests, and group membership",
    "MFA registration and authentication methods per user",
    "Conditional Access policies and MFA enforcement",
    "Sign-in logs and failed or risky sign-in events",
    "Directory audit logs — role changes, policy changes",
    "Microsoft Secure Score and improvement actions",
    "Intune managed devices and compliance (if licensed)",
  ];
  const lvStartY = y;
  for (const item of evLeft) {
    doc.fillColor(C.green).font("Helvetica-Bold").fontSize(7.5).text("[+]", MARGIN, y, { width: 18 });
    doc.fillColor(C.slate).font("Helvetica").fontSize(7.5).text(item, MARGIN + 20, y, { width: col2W - 22 });
    y = doc.y + 2;
  }
  const lvEndY = y;

  // Right column
  let ry = lvStartY;
  const rx = MARGIN + col2W + 8;
  doc.fillColor(C.critical).font("Helvetica-Bold").fontSize(8.5).text("Requires Manual Review", rx, evStartY);
  const evRight = [
    "SSP completeness and CUI scope documentation",
    "Policies, procedures, and documented controls",
    "Physical security controls",
    "Personnel security and training records",
    "Risk assessment and management plans",
    "Incident response plan testing",
    "Non-Microsoft systems and infrastructure",
    "Assessor interviews or hands-on testing",
  ];
  for (const item of evRight) {
    doc.fillColor(C.critical).font("Helvetica-Bold").fontSize(7.5).text("[-]", rx, ry, { width: 18 });
    doc.fillColor(C.slate).font("Helvetica").fontSize(7.5).text(item, rx + 20, ry, { width: col2W - 22 });
    ry = doc.y + 2;
  }
  y = Math.max(lvEndY, ry) + 14;

  // Domain coverage table (compact)
  y = safePage(y, 120);
  y = h2("CMMC Control Coverage by Domain", y);

  const DC = {
    domain: { x: MARGIN, w: 168 },
    total: { x: MARGIN + 168, w: 44 },
    touched: { x: MARGIN + 212, w: 54 },
    findings: { x: MARGIN + 266, w: 50 },
    requests: { x: MARGIN + 316, w: 60 },
    manual: { x: MARGIN + 376, w: CONTENT_W - 376 },
  };

  // Table header
  doc.rect(MARGIN, y, CONTENT_W, 14).fill(C.navy);
  [
    { label: "Domain", ...DC.domain }, { label: "Controls", ...DC.total },
    { label: "Touched", ...DC.touched }, { label: "Findings", ...DC.findings },
    { label: "Evidence Req.", ...DC.requests }, { label: "Manual Review", ...DC.manual },
  ].forEach((col) => {
    doc.fillColor(C.white).font("Helvetica-Bold").fontSize(6.5)
      .text(col.label, col.x + 2, y + 4, { width: col.w - 4 });
  });
  y += 16;

  const domainTouched = new Map<string, Set<string>>();
  const domainFindings = new Map<string, number>();
  const domainRequests = new Map<string, number>();

  for (const ctrl of controlsTouched) {
    const d = getDomain(ctrl);
    if (!domainTouched.has(d)) domainTouched.set(d, new Set());
    domainTouched.get(d)!.add(ctrl);
  }
  for (const f of data.findings) {
    for (const ctrl of f.linkedControlIds) {
      const d = getDomain(ctrl);
      domainFindings.set(d, (domainFindings.get(d) ?? 0) + 1);
    }
  }
  for (const r of data.evidenceRequests) {
    const domains = new Set(r.linkedControlIds.map(getDomain));
    for (const d of domains) {
      domainRequests.set(d, (domainRequests.get(d) ?? 0) + 1);
    }
  }

  CMMC_DOMAINS.forEach((dom, di) => {
    const touchedCount = domainTouched.get(dom.id)?.size ?? 0;
    const findingCount = domainFindings.get(dom.id) ?? 0;
    const reqCount = domainRequests.get(dom.id) ?? 0;
    const needsManual = touchedCount < dom.total;

    y = safePage(y, 14);
    if (di % 2 === 0) doc.rect(MARGIN, y, CONTENT_W, 13).fill(C.bg);

    doc.fillColor(C.black).font("Helvetica").fontSize(7.5)
      .text(`${dom.id} — ${dom.name}`, DC.domain.x + 2, y + 3, { width: DC.domain.w - 4 });
    doc.fillColor(C.slate).font("Helvetica").fontSize(7.5)
      .text(dom.total.toString(), DC.total.x + 2, y + 3, { width: DC.total.w - 4, align: "right" });
    doc.fillColor(touchedCount > 0 ? C.blue : C.slateLight).font("Helvetica-Bold").fontSize(7.5)
      .text(touchedCount.toString(), DC.touched.x + 2, y + 3, { width: DC.touched.w - 4, align: "right" });
    doc.fillColor(findingCount > 0 ? C.critical : C.slateLight).font("Helvetica-Bold").fontSize(7.5)
      .text(findingCount > 0 ? findingCount.toString() : "—", DC.findings.x + 2, y + 3, { width: DC.findings.w - 4, align: "right" });
    doc.fillColor(reqCount > 0 ? C.medium : C.slateLight).font("Helvetica").fontSize(7.5)
      .text(reqCount > 0 ? reqCount.toString() : "—", DC.requests.x + 2, y + 3, { width: DC.requests.w - 4, align: "right" });
    doc.fillColor(needsManual ? C.medium : C.green).font("Helvetica-Bold").fontSize(7)
      .text(needsManual ? "Yes" : "No", DC.manual.x + 2, y + 3, { width: DC.manual.w - 4, align: "center" });

    doc.moveTo(MARGIN, y + 13).lineTo(MARGIN + CONTENT_W, y + 13).lineWidth(0.3).strokeColor(C.border).stroke();
    y += 13;
  });
  y += 12;

  // Disclaimer
  y = safePage(y, 54);
  doc.rect(MARGIN, y, CONTENT_W, 48).fill(C.blueLight).strokeColor(C.border).lineWidth(0.5).stroke();
  doc.rect(MARGIN, y, 4, 48).fill(C.blue);
  doc.fillColor(C.navyMid).font("Helvetica-Bold").fontSize(8.5).text("Important Disclaimer", MARGIN + 12, y + 8);
  doc.fillColor(C.slate).font("Helvetica").fontSize(8)
    .text(
      "This report is a technical pre-assessment based on Microsoft Graph data and Control HUB analysis. " +
      "It is intended to support CMMC readiness planning. It is not an official CMMC assessment, certification decision, or C3PAO determination. " +
      "CMMC certification requires a formal assessment by a certified C3PAO.",
      MARGIN + 12, y + 23, { width: CONTENT_W - 20 }
    );
  y += 58;

  // ═══════════════════════════════════════════════════════════════
  // PAGE 6: APPENDIX SUMMARY
  // ═══════════════════════════════════════════════════════════════
  y = section(y, 120);
  y = h1("Appendix Summary", y);

  doc.fillColor(C.slate).font("Helvetica").fontSize(8)
    .text("The full Technical Pre-Assessment Report contains complete findings, evidence snapshots, evidence requests, permissions detail, and scan metadata. This executive report provides a summary only.", MARGIN, y, { width: CONTENT_W });
  y = doc.y + 14;

  const summaryRows: Array<[string, string]> = [
    ["Total Checks Run", data.scan.totalChecks.toString()],
    ["Passed Checks", `${data.scan.passedChecks} (${passRate}%)`],
    ["Gaps Found", data.scan.failedChecks.toString()],
    ["Unknown / No Data", data.scan.unknowns.toString()],
    ["Findings Generated", data.findings.length.toString()],
    ["  Critical", critCount.toString()],
    ["  High", highCount.toString()],
    ["  Medium", data.findings.filter((f) => f.severity === "medium").length.toString()],
    ["  Low / Info", data.findings.filter((f) => f.severity === "low" || f.severity === "informational").length.toString()],
    ["Evidence Snapshots", data.evidenceRecords.length.toString()],
    ["Evidence Requests", data.evidenceRequests.length.toString()],
    ["Roadmap Actions", data.roadmapActions.length.toString()],
    ["Controls Touched by Scan", `${controlsTouched.length} / ${CMMC_L2_TOTAL}`],
    ["Assessment Packs Completed", `${data.scan.packsCompleted?.length ?? 0} / ${data.scan.packsRequested?.length ?? 0}`],
    ["Assessment Packs Failed", `${data.scan.packsFailed?.length ?? 0}`],
  ];

  summaryRows.forEach(([label, value], i) => {
    y = safePage(y, 15);
    if (i % 2 === 0) doc.rect(MARGIN, y, CONTENT_W, 14).fill(C.bg);
    const isIndent = label.startsWith("  ");
    doc.fillColor(isIndent ? C.slateLight : C.slate).font(isIndent ? "Helvetica" : "Helvetica").fontSize(8)
      .text(label, MARGIN + (isIndent ? 18 : 8), y + 3, { width: CONTENT_W - 80 });
    doc.fillColor(C.black).font("Helvetica-Bold").fontSize(8)
      .text(value, MARGIN + CONTENT_W - 70, y + 3, { width: 60, align: "right" });
    y += 14;
  });

  // ═══════════════════════════════════════════════════════════════
  // POST-PROCESS: Page X of N (body pages only, cover excluded)
  // ═══════════════════════════════════════════════════════════════
  const range = doc.bufferedPageRange();
  const totalBodyPages = range.count - 1; // subtract cover

  for (let i = 1; i < range.count; i++) {
    doc.switchToPage(i);
    doc.save();
    doc.rect(A4_W - MARGIN - 54, 8, 54, 18).fill(C.navy);
    doc.fillColor(C.white).font("Helvetica").fontSize(7)
      .text(`Page ${i} of ${totalBodyPages}`, A4_W - MARGIN - 54, 14, { width: 50, align: "right" });
    doc.restore();
  }

  doc.end();
}
