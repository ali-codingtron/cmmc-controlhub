import PDFDocument from "pdfkit";
import type { Response } from "express";

const CMMC_L2_TOTAL = 110;

const C = {
  blue: "#1e40af",
  blueDark: "#1e3a8a",
  blueMid: "#3b82f6",
  blueLight: "#eff6ff",
  gray: "#374151",
  grayLight: "#9ca3af",
  grayBg: "#f9fafb",
  grayBorder: "#e5e7eb",
  white: "#ffffff",
  black: "#111827",
  critical: "#dc2626",
  criticalBg: "#fef2f2",
  high: "#ea580c",
  highBg: "#fff7ed",
  medium: "#d97706",
  mediumBg: "#fffbeb",
  low: "#2563eb",
  lowBg: "#eff6ff",
  info: "#6b7280",
  infoBg: "#f9fafb",
  green: "#16a34a",
  greenBg: "#f0fdf4",
};

const SEVERITY_COLOR: Record<string, string> = {
  critical: C.critical,
  high: C.high,
  medium: C.medium,
  low: C.low,
  informational: C.info,
};

const SEVERITY_BG: Record<string, string> = {
  critical: C.criticalBg,
  high: C.highBg,
  medium: C.mediumBg,
  low: C.lowBg,
  informational: C.infoBg,
};

export interface PaReportData {
  scan: {
    id: string;
    scanName: string;
    status: string;
    packsRequested: string[];
    packsCompleted: string[];
    packsFailed: string[];
    startedAt: string | null;
    completedAt: string | null;
    totalChecks: number;
    passedChecks: number;
    failedChecks: number;
    unknowns: number;
    generatedFindingCount: number;
    generatedEvidenceCount: number;
    generatedEvidenceRequestCount: number;
    errorMessage: string | null;
  };
  org: { name: string };
  tenantConnection: {
    tenantName: string;
    primaryDomain: string | null;
    microsoftTenantId: string | null;
  } | null;
  findings: Array<{
    id: string;
    ruleId: string;
    title: string;
    severity: string;
    result: string;
    packId: string;
    observedCondition: string | null;
    recommendedRemediation: string | null;
    linkedControlIds: string[];
    affectedCount: number;
    approvedStatus: string | null;
  }>;
  evidenceRecords: Array<{
    id: string;
    packId: string;
    title: string;
    source: string;
    evidenceType: string;
    status: string;
    linkedControlIds: string[];
    collectedAt: string;
  }>;
  evidenceRequests: Array<{
    id: string;
    title: string;
    linkedControlIds: string[];
    suggestedFilename: string | null;
    ownerEmail: string | null;
    dueDate: string | null;
    status: string;
    instructions: string | null;
  }>;
  roadmapActions: Array<{
    id: string;
    category: string;
    title: string;
    description: string | null;
    priority: number;
    linkedControlIds: string[];
    status: string;
  }>;
  generatedBy: string;
}

const PACK_NAMES: Record<string, string> = {
  identity: "Identity Pack",
  authentication: "Authentication Pack",
  conditional_access: "Conditional Access Pack",
  devices: "Device / Intune Pack",
  audit: "Audit / Sign-in Pack",
  secure_score: "Security Score Pack",
};

const PACK_PERMISSIONS: Record<string, string[]> = {
  identity: ["User.Read.All", "GroupMember.Read.All", "Directory.Read.All"],
  authentication: ["UserAuthenticationMethod.Read.All"],
  conditional_access: ["Policy.Read.All"],
  devices: ["Device.Read.All", "DeviceManagementManagedDevices.Read.All"],
  audit: ["AuditLog.Read.All"],
  secure_score: ["SecurityEvents.Read.All"],
};

const A4_W = 595.28;
const A4_H = 841.89;
const MARGIN = 44;
const CONTENT_W = A4_W - MARGIN * 2;
const HEADER_H = 36;
const FOOTER_H = 26;
const PAGE_TOP = HEADER_H + 14;
const PAGE_BOTTOM = A4_H - FOOTER_H - 10;

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function fmtDateTime(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-US", {
    month: "short", day: "numeric", year: "numeric",
    hour: "numeric", minute: "2-digit",
  });
}

function healthLabel(rate: number, total: number): string {
  if (total < 3) return "Insufficient Data";
  if (rate >= 75) return "Strong";
  if (rate >= 50) return "Moderate";
  if (rate >= 25) return "Weak";
  return "Critical Gaps";
}

const SEVERITY_SHORT: Record<string, string> = {
  critical: "Critical", high: "High", medium: "Medium", low: "Low", informational: "Info",
};

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

function dueDateOffset(severity: string): number {
  if (severity === "critical") return 7;
  if (severity === "high") return 14;
  if (severity === "medium") return 30;
  return 60;
}

function fmtDateOffset(iso: string | null, days: number): string {
  if (!iso) return "—";
  const d = new Date(iso);
  d.setDate(d.getDate() + days);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function suggestOwner(packId: string): string {
  if (packId === "identity" || packId === "authentication" || packId === "conditional_access") return "IT Admin / Identity";
  if (packId === "devices") return "IT Admin / Endpoint";
  if (packId === "audit") return "IT Admin / Security";
  return "IT / Compliance";
}

function healthColor(label: string): string {
  if (label === "Strong") return C.green;
  if (label === "Moderate") return C.medium;
  if (label === "Weak") return C.high;
  if (label === "Critical Gaps") return C.critical;
  return C.grayLight;
}

export function generatePaReportPdf(data: PaReportData, res: Response): void {
  const doc = new PDFDocument({
    size: "A4",
    margin: MARGIN,
    autoFirstPage: false,
    bufferPages: true,
  });

  res.setHeader("Content-Type", "application/pdf");
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="pre-assessment-report-${data.scan.id.slice(0, 8)}.pdf"`
  );
  doc.pipe(res);

  const passRate = data.scan.totalChecks > 0
    ? Math.round((data.scan.passedChecks / data.scan.totalChecks) * 100) : 0;

  const controlsTouched = Array.from(new Set([
    ...data.evidenceRecords.flatMap((e) => e.linkedControlIds),
    ...data.findings.flatMap((f) => f.linkedControlIds),
  ]));
  const controlsWithFindings = Array.from(new Set(data.findings.flatMap((f) => f.linkedControlIds)));

  const failedPacks = new Set(data.scan.packsFailed ?? []);
  const health = healthLabel(passRate, data.scan.totalChecks);
  const healthCol = healthColor(health);

  let pageCount = 0;

  function addPage(): void {
    doc.addPage({ size: "A4", margin: 0 });
    pageCount++;

    doc.save();
    doc.rect(0, 0, A4_W, HEADER_H).fill(C.blueDark);
    doc.fillColor("#93c5fd").font("Helvetica-Bold").fontSize(7.5)
      .text("CONTROL HUB", MARGIN, 9);
    doc.fillColor(C.white).font("Helvetica").fontSize(7.5)
      .text("Tenant-Connected CMMC Pre-Assessment Report", MARGIN + 72, 9, { width: CONTENT_W - 120 });
    doc.fillColor("#93c5fd").font("Helvetica").fontSize(7.5)
      .text(data.org.name, MARGIN + 72, 20, { width: CONTENT_W - 120 });
    doc.fillColor(C.white).font("Helvetica").fontSize(7.5)
      .text(`Page ${pageCount}`, A4_W - MARGIN - 50, 14, { width: 50, align: "right" });

    doc.rect(0, A4_H - FOOTER_H, A4_W, FOOTER_H).fill("#f1f5f9");
    doc.rect(0, A4_H - FOOTER_H, A4_W, 1).fill(C.grayBorder);
    doc.fillColor(C.grayLight).font("Helvetica").fontSize(6.5)
      .text(
        "CONFIDENTIAL — Prepared by Control HUB  |  Not an official CMMC assessment  |  Internal use only",
        MARGIN, A4_H - 16, { width: CONTENT_W, align: "center" }
      );
    doc.restore();
  }

  function safePage(y: number, needed = 80): number {
    if (y + needed > PAGE_BOTTOM) {
      addPage();
      return PAGE_TOP;
    }
    return y;
  }

  function newSection(y: number, needed = 100): number {
    if (y + needed > PAGE_BOTTOM - 40) {
      addPage();
      return PAGE_TOP;
    }
    return y + 14;
  }

  function heading1(text: string, y: number): number {
    doc.rect(MARGIN, y, CONTENT_W, 24).fill(C.blueDark);
    doc.rect(MARGIN, y, 4, 24).fill(C.blueMid);
    doc.fillColor(C.white).font("Helvetica-Bold").fontSize(11)
      .text(text, MARGIN + 12, y + 7);
    return y + 32;
  }

  function heading2(text: string, y: number): number {
    doc.fillColor(C.blue).font("Helvetica-Bold").fontSize(9.5).text(text, MARGIN, y);
    doc.moveTo(MARGIN, y + 13).lineTo(MARGIN + CONTENT_W, y + 13)
      .lineWidth(0.5).strokeColor(C.grayBorder).stroke();
    return y + 21;
  }

  function kpiCard(label: string, value: string, color: string, x: number, y: number, w: number, h: number): void {
    doc.rect(x, y, w, h).fill(C.grayBg).strokeColor(C.grayBorder).lineWidth(0.5).stroke();
    doc.rect(x, y, w, 3).fill(color);
    doc.fillColor(color).font("Helvetica-Bold").fontSize(22)
      .text(value, x, y + 12, { width: w, align: "center" });
    doc.fillColor(C.gray).font("Helvetica").fontSize(7)
      .text(label, x + 4, y + h - 14, { width: w - 8, align: "center" });
  }

  function tableHeader(cols: Array<{ label: string; x: number; w: number }>, y: number, rowH = 16): number {
    doc.rect(MARGIN, y, CONTENT_W, rowH).fill(C.blueDark);
    for (const col of cols) {
      doc.fillColor(C.white).font("Helvetica-Bold").fontSize(7)
        .text(col.label, col.x + 3, y + (rowH - 7) / 2, { width: col.w - 6 });
    }
    return y + rowH;
  }

  function tableRow(
    cols: Array<{ value: string; x: number; w: number; color?: string; bold?: boolean; align?: "left" | "right" | "center" }>,
    y: number,
    rowH: number,
    shade: boolean
  ): number {
    if (shade) doc.rect(MARGIN, y, CONTENT_W, rowH).fill(C.grayBg);
    for (const col of cols) {
      const font = col.bold ? "Helvetica-Bold" : "Helvetica";
      doc.fillColor(col.color ?? C.gray).font(font).fontSize(7.5)
        .text(col.value, col.x + 3, y + (rowH - 7.5) / 2, { width: col.w - 6, align: col.align ?? "left" });
    }
    doc.moveTo(MARGIN, y + rowH).lineTo(MARGIN + CONTENT_W, y + rowH)
      .lineWidth(0.3).strokeColor(C.grayBorder).stroke();
    return y + rowH;
  }

  function badge(text: string, color: string, x: number, y: number, w: number, h = 12): void {
    doc.rect(x, y, w, h).fill(color);
    doc.fillColor(C.white).font("Helvetica-Bold").fontSize(6.5)
      .text(text, x, y + (h - 6.5) / 2, { width: w, align: "center" });
  }

  // ═══════════════════════════════════════════════════════════════════════════════
  // COVER PAGE
  // ═══════════════════════════════════════════════════════════════════════════════
  doc.addPage({ size: "A4", margin: 0 });

  // Blue header band
  doc.rect(0, 0, A4_W, 310).fill(C.blueDark);
  // Accent bar
  doc.rect(0, 310, A4_W, 5).fill(C.blueMid);

  // Logo area
  doc.fillColor("#93c5fd").font("Helvetica-Bold").fontSize(11).text("CONTROL HUB", MARGIN, 48);
  doc.moveTo(MARGIN, 65).lineTo(MARGIN + 80, 65).lineWidth(1.5).strokeColor("#60a5fa").stroke();

  // Title
  doc.fillColor(C.white).font("Helvetica-Bold").fontSize(28)
    .text("Tenant-Connected", MARGIN, 82, { width: CONTENT_W });
  doc.fillColor(C.white).font("Helvetica-Bold").fontSize(28)
    .text("CMMC Pre-Assessment", MARGIN, 116, { width: CONTENT_W });
  doc.fillColor(C.white).font("Helvetica-Bold").fontSize(22)
    .text("Report", MARGIN, 150, { width: CONTENT_W });

  doc.fillColor("#93c5fd").font("Helvetica").fontSize(11)
    .text("Microsoft 365 / Entra Technical Readiness Scan", MARGIN, 190, { width: CONTENT_W });

  // Status chip
  const scanStatus = data.scan.status === "completed" ? "COMPLETED" :
    data.scan.status === "completed_with_warnings" ? "COMPLETED WITH WARNINGS" :
    data.scan.status === "failed" ? "FAILED" : data.scan.status.toUpperCase();
  const statusColor = data.scan.status === "completed" ? C.green :
    data.scan.status === "completed_with_warnings" ? C.medium : C.critical;
  doc.rect(MARGIN, 220, 100, 16).fill(statusColor);
  doc.fillColor(C.white).font("Helvetica-Bold").fontSize(7.5)
    .text(scanStatus, MARGIN, 225, { width: 100, align: "center" });

  doc.rect(MARGIN + 108, 220, 70, 16).fill("#1e3a8a");
  doc.fillColor("#93c5fd").font("Helvetica-Bold").fontSize(7.5)
    .text("CMMC Level 2", MARGIN + 108, 225, { width: 70, align: "center" });

  doc.fillColor("#bfdbfe").font("Helvetica-Bold").fontSize(8).text("CONFIDENTIAL", MARGIN, 254);
  doc.fillColor("#93c5fd").font("Helvetica").fontSize(8)
    .text("Internal Use Only — Not an Official CMMC Assessment", MARGIN, 266);

  // Metadata section on white background
  const metaStartY = 330;
  function coverRow(label: string, value: string, y: number): number {
    doc.fillColor(C.grayLight).font("Helvetica").fontSize(8).text(label, MARGIN, y, { width: 120 });
    doc.fillColor(C.black).font("Helvetica-Bold").fontSize(9).text(value, MARGIN + 125, y, { width: CONTENT_W - 125 });
    doc.moveTo(MARGIN, y + 16).lineTo(MARGIN + CONTENT_W, y + 16).lineWidth(0.3).strokeColor(C.grayBorder).stroke();
    return y + 22;
  }

  let cy = metaStartY;
  cy = coverRow("Organization", data.org.name, cy);
  cy = coverRow("Tenant", data.tenantConnection?.tenantName ?? "—", cy);
  if (data.tenantConnection?.primaryDomain) {
    cy = coverRow("Primary Domain", data.tenantConnection.primaryDomain, cy);
  }
  if (data.tenantConnection?.microsoftTenantId) {
    cy = coverRow("Tenant ID", data.tenantConnection.microsoftTenantId, cy);
  }
  cy = coverRow("Scan Name", data.scan.scanName, cy);
  cy = coverRow("Scan Date", fmtDateTime(data.scan.completedAt ?? data.scan.startedAt), cy);
  cy = coverRow("Report Generated", fmtDateTime(new Date().toISOString()), cy);
  cy = coverRow("Generated By", data.generatedBy, cy);
  cy = coverRow("Target CMMC Level", "CMMC Level 2 (110 controls)", cy);

  // Footer strip
  doc.rect(0, A4_H - 40, A4_W, 40).fill("#f1f5f9");
  doc.rect(0, A4_H - 40, A4_W, 1).fill(C.grayBorder);
  doc.fillColor(C.grayLight).font("Helvetica").fontSize(7)
    .text(
      "This report is produced by Control HUB and is intended for the named organization only. " +
      "It is not an official CMMC assessment and does not replace a C3PAO evaluation.",
      MARGIN, A4_H - 26, { width: CONTENT_W, align: "center" }
    );

  // ═══════════════════════════════════════════════════════════════════════════════
  // EXECUTIVE SUMMARY
  // ═══════════════════════════════════════════════════════════════════════════════
  addPage();
  let y = PAGE_TOP;
  y = heading1("Executive Summary", y);

  // 3-column KPI row 1
  const kW = (CONTENT_W - 8) / 3;
  kpiCard("Checks Run", data.scan.totalChecks.toString(), C.blue, MARGIN, y, kW, 58);
  kpiCard("Passed", data.scan.passedChecks.toString(), C.green, MARGIN + kW + 4, y, kW, 58);
  kpiCard("Gaps Found", data.scan.failedChecks.toString(), data.scan.failedChecks > 0 ? C.critical : C.green, MARGIN + (kW + 4) * 2, y, kW, 58);
  y += 66;

  // 3-column KPI row 2
  kpiCard("Findings", data.findings.length.toString(), data.findings.length > 0 ? C.high : C.green, MARGIN, y, kW, 58);
  kpiCard("Evidence Snapshots", data.evidenceRecords.length.toString(), C.blue, MARGIN + kW + 4, y, kW, 58);
  kpiCard("Evidence Requests", data.evidenceRequests.length.toString(), C.medium, MARGIN + (kW + 4) * 2, y, kW, 58);
  y += 66;

  // 3-column KPI row 3
  kpiCard("Controls Touched", `${controlsTouched.length} / ${CMMC_L2_TOTAL}`, C.blue, MARGIN, y, kW, 58);
  kpiCard("Unknown / No Data", data.scan.unknowns.toString(), data.scan.unknowns > 0 ? C.medium : C.green, MARGIN + kW + 4, y, kW, 58);
  kpiCard("Roadmap Actions", data.roadmapActions.length.toString(), C.blue, MARGIN + (kW + 4) * 2, y, kW, 58);
  y += 74;

  // Tenant Scan Health + Assessment Confidence bar
  const hsW = (CONTENT_W - 8) / 2;
  doc.rect(MARGIN, y, hsW, 42).fill(C.grayBg).strokeColor(C.grayBorder).lineWidth(0.5).stroke();
  doc.rect(MARGIN, y, hsW, 3).fill(healthCol);
  doc.fillColor(healthCol).font("Helvetica-Bold").fontSize(17).text(health, MARGIN, y + 10, { width: hsW, align: "center" });
  doc.fillColor(C.grayLight).font("Helvetica").fontSize(7).text("Tenant Scan Health", MARGIN + 4, y + 32, { width: hsW - 8, align: "center" });

  const confRate = data.scan.totalChecks > 0
    ? Math.round(((data.scan.totalChecks - data.scan.unknowns) / data.scan.totalChecks) * 100) : 0;
  const confLabel = confRate >= 80 ? "High" : confRate >= 50 ? "Moderate" : "Low";
  const confColor = confRate >= 80 ? C.green : confRate >= 50 ? C.medium : C.critical;
  doc.rect(MARGIN + hsW + 8, y, hsW, 42).fill(C.grayBg).strokeColor(C.grayBorder).lineWidth(0.5).stroke();
  doc.rect(MARGIN + hsW + 8, y, hsW, 3).fill(confColor);
  doc.fillColor(confColor).font("Helvetica-Bold").fontSize(17).text(`${confRate}%  ${confLabel}`, MARGIN + hsW + 8, y + 10, { width: hsW, align: "center" });
  doc.fillColor(C.grayLight).font("Helvetica").fontSize(7).text("Assessment Confidence", MARGIN + hsW + 12, y + 32, { width: hsW - 8, align: "center" });
  y += 52;

  // Interpretation box
  y = safePage(y, 90);
  doc.rect(MARGIN, y, CONTENT_W, 5).fill(C.blue);
  doc.rect(MARGIN, y + 5, CONTENT_W, 82).fill(C.blueLight).strokeColor(C.grayBorder).lineWidth(0.5).stroke();
  doc.fillColor(C.blueDark).font("Helvetica-Bold").fontSize(9).text("Assessment Interpretation", MARGIN + 10, y + 13);

  let interp = `This pre-assessment scanned ${data.scan.totalChecks} Microsoft tenant configuration checks across ${(data.scan.packsCompleted?.length ?? 0)} assessment packs. `;
  if (passRate >= 75) {
    interp += `The tenant shows strong technical readiness with ${passRate}% of checks passing.`;
  } else if (passRate >= 50) {
    interp += `The tenant shows moderate readiness with notable gaps requiring attention. ${passRate}% of checks passed.`;
  } else {
    interp += `The tenant shows significant gaps requiring remediation. Only ${passRate}% of checks passed.`;
  }
  const critCount = data.findings.filter((f) => f.severity === "critical").length;
  const highCount = data.findings.filter((f) => f.severity === "high").length;
  if (critCount + highCount > 0) {
    interp += ` ${critCount} critical and ${highCount} high severity findings require priority attention.`;
  }
  if (failedPacks.size > 0) {
    interp += ` ${failedPacks.size} assessment pack(s) encountered data availability issues.`;
  }

  doc.fillColor(C.gray).font("Helvetica").fontSize(8.5)
    .text(interp, MARGIN + 10, y + 28, { width: CONTENT_W - 20, align: "justify" });

  // Top concerns
  const topConcerns = data.findings
    .filter((f) => f.severity === "critical" || f.severity === "high")
    .slice(0, 3)
    .map((f) => f.title);
  if (topConcerns.length > 0) {
    const concernsText = "Primary concerns: " + topConcerns.join("; ") + ".";
    doc.fillColor(C.blueDark).font("Helvetica-Bold").fontSize(8)
      .text(concernsText, MARGIN + 10, y + 62, { width: CONTENT_W - 20 });
  }
  y += 96;

  // ═══════════════════════════════════════════════════════════════════════════════
  // SCOPE & LIMITATIONS
  // ═══════════════════════════════════════════════════════════════════════════════
  y = newSection(y, 260);
  y = heading1("Assessment Scope & Limitations", y);

  // Two-column layout
  const colW2 = (CONTENT_W - 10) / 2;
  const scopeStartY = y;

  // Left column: Evaluated
  doc.fillColor(C.green).font("Helvetica-Bold").fontSize(9).text("[+] What This Scan Evaluated", MARGIN, y);
  y += 16;
  const evaluated = [
    "Entra ID user accounts, guests, group membership",
    "MFA registration per user and authentication methods",
    "Conditional Access policies and MFA enforcement",
    "Legacy authentication blocking rules",
    "Sign-in logs and failed/risky sign-in events",
    "Directory audit logs (role changes, user/group changes)",
    "Microsoft Secure Score and improvement actions",
    "Intune managed devices and compliance state (if licensed)",
  ];
  const leftStartY = y;
  for (const item of evaluated) {
    doc.fillColor(C.green).font("Helvetica-Bold").fontSize(8).text("[+]", MARGIN, y, { width: 18 });
    doc.fillColor(C.gray).font("Helvetica").fontSize(8).text(item, MARGIN + 20, y, { width: colW2 - 22 });
    y = doc.y + 3;
  }
  const leftEndY = y;

  // Right column: Not Evaluated (start at same Y as left column)
  let ry = leftStartY;
  const rxStart = MARGIN + colW2 + 10;
  doc.fillColor(C.critical).font("Helvetica-Bold").fontSize(9)
    .text("[-] What This Scan Does Not Evaluate", rxStart - colW2 - 10 + MARGIN, scopeStartY, { width: colW2 });
  const notEvaluated = [
    "SSP completeness or quality",
    "CUI scope documentation and data flows",
    "Policies, procedures, and documented controls",
    "Physical security controls",
    "Personnel security and training records",
    "Risk management and risk registers",
    "Incident response plan testing",
    "Backup and recovery testing",
    "Firewall configuration or network segmentation",
    "Non-Microsoft systems and infrastructure",
    "Assessor interviews or hands-on testing",
  ];
  for (const item of notEvaluated) {
    doc.fillColor(C.critical).font("Helvetica-Bold").fontSize(8).text("[-]", rxStart, ry, { width: 18 });
    doc.fillColor(C.gray).font("Helvetica").fontSize(8).text(item, rxStart + 20, ry, { width: colW2 - 22 });
    ry = doc.y + 3;
  }

  y = Math.max(leftEndY, ry) + 10;

  // Disclaimer
  y = safePage(y, 60);
  doc.rect(MARGIN, y, CONTENT_W, 52).fill(C.blueLight).strokeColor(C.grayBorder).lineWidth(0.5).stroke();
  doc.rect(MARGIN, y, 4, 52).fill(C.blue);
  doc.fillColor(C.blueDark).font("Helvetica-Bold").fontSize(9).text("Important Disclaimer", MARGIN + 12, y + 8);
  doc.fillColor(C.gray).font("Helvetica").fontSize(8)
    .text(
      "This report is a technical pre-assessment based on Microsoft tenant configuration and Microsoft Graph API data. " +
      "It is not an official CMMC assessment and does not replace a C3PAO assessment, SSP review, or formal compliance audit. " +
      "Final CMMC certification requires review of policies, procedures, evidence, interviews, and testing by a certified assessor.",
      MARGIN + 12, y + 24, { width: CONTENT_W - 20 }
    );
  y += 62;

  // ═══════════════════════════════════════════════════════════════════════════════
  // ASSESSMENT PACK SUMMARY
  // ═══════════════════════════════════════════════════════════════════════════════
  y = newSection(y, 200);
  y = heading1("Assessment Pack Summary", y);

  // Table header
  const PC = {
    name: { x: MARGIN, w: 150 },
    status: { x: MARGIN + 150, w: 70 },
    checks: { x: MARGIN + 220, w: 42 },
    passed: { x: MARGIN + 262, w: 42 },
    gaps: { x: MARGIN + 304, w: 42 },
    evidence: { x: MARGIN + 346, w: 55 },
    findings: { x: MARGIN + 401, w: 50 },
    notes: { x: MARGIN + 451, w: CONTENT_W - 451 },
  };

  y = tableHeader(
    [
      { label: "Assessment Pack", x: PC.name.x, w: PC.name.w },
      { label: "Status", x: PC.status.x, w: PC.status.w },
      { label: "Checks", x: PC.checks.x, w: PC.checks.w },
      { label: "Passed", x: PC.passed.x, w: PC.passed.w },
      { label: "Gaps", x: PC.gaps.x, w: PC.gaps.w },
      { label: "Evidence", x: PC.evidence.x, w: PC.evidence.w },
      { label: "Findings", x: PC.findings.x, w: PC.findings.w },
      { label: "Notes", x: PC.notes.x, w: PC.notes.w },
    ],
    y, 16
  );

  for (let pi = 0; pi < (data.scan.packsRequested ?? []).length; pi++) {
    const packId = data.scan.packsRequested[pi];
    const name = PACK_NAMES[packId] ?? packId;
    const isCompleted = (data.scan.packsCompleted ?? []).includes(packId);
    const isFailed = (data.scan.packsFailed ?? []).includes(packId);
    const packFindings = data.findings.filter((f) => f.packId === packId);
    const packEvidence = data.evidenceRecords.filter((e) => e.packId === packId);
    const failGaps = packFindings.filter((f) => f.result === "fail").length;
    const passedEv = Math.max(0, packEvidence.length - failGaps);
    const statusLabel = isFailed ? "DATA UNAVAIL." : isCompleted ? "COMPLETE" : "NOT RUN";
    const statusCol = isFailed ? C.critical : isCompleted ? C.green : C.grayLight;
    const notes = isFailed
      ? (packId === "devices"
          ? "Data unavailable — verify DeviceManagementManagedDevices.Read.All permission, Intune license, and device enrollment"
          : "Data unavailable — verify required permissions and licensing")
      : "";

    const rowH = 16;
    y = safePage(y, rowH);
    const shade = pi % 2 === 0;
    if (shade) doc.rect(MARGIN, y, CONTENT_W, rowH).fill(C.grayBg);
    if (isFailed) doc.rect(MARGIN, y, CONTENT_W, rowH).fill(C.criticalBg);

    doc.fillColor(C.black).font("Helvetica-Bold").fontSize(7.5)
      .text(name, PC.name.x + 3, y + (rowH - 7.5) / 2, { width: PC.name.w - 6 });

    badge(statusLabel, statusCol, PC.status.x + 3, y + 3, PC.status.w - 8, 10);

    const numColor = (n: number, warnAbove = 0) => n > warnAbove ? C.critical : C.black;

    doc.fillColor(C.black).font("Helvetica").fontSize(7.5)
      .text(isFailed ? "—" : packEvidence.length.toString(), PC.checks.x + 3, y + (rowH - 7.5) / 2, { width: PC.checks.w - 6, align: "right" });
    doc.fillColor(isFailed ? C.grayLight : C.green).font("Helvetica").fontSize(7.5)
      .text(isFailed ? "—" : passedEv.toString(), PC.passed.x + 3, y + (rowH - 7.5) / 2, { width: PC.passed.w - 6, align: "right" });
    doc.fillColor(isFailed ? C.grayLight : (failGaps > 0 ? C.critical : C.green)).font("Helvetica-Bold").fontSize(7.5)
      .text(isFailed ? "—" : failGaps.toString(), PC.gaps.x + 3, y + (rowH - 7.5) / 2, { width: PC.gaps.w - 6, align: "right" });
    doc.fillColor(C.black).font("Helvetica").fontSize(7.5)
      .text(isFailed ? "—" : packEvidence.length.toString(), PC.evidence.x + 3, y + (rowH - 7.5) / 2, { width: PC.evidence.w - 6, align: "right" });
    doc.fillColor(packFindings.length > 0 ? C.high : C.black).font("Helvetica").fontSize(7.5)
      .text(isFailed ? "—" : packFindings.length.toString(), PC.findings.x + 3, y + (rowH - 7.5) / 2, { width: PC.findings.w - 6, align: "right" });
    doc.fillColor(C.grayLight).font("Helvetica").fontSize(6.5)
      .text(notes, PC.notes.x + 3, y + (rowH - 6.5) / 2, { width: PC.notes.w - 6 });

    doc.moveTo(MARGIN, y + rowH).lineTo(MARGIN + CONTENT_W, y + rowH)
      .lineWidth(0.3).strokeColor(C.grayBorder).stroke();
    y += rowH;
  }
  y += 12;

  // ═══════════════════════════════════════════════════════════════════════════════
  // CONTROL COVERAGE
  // ═══════════════════════════════════════════════════════════════════════════════
  y = newSection(y, 160);
  y = heading1(`CMMC Controls Touched by Tenant Scan: ${controlsTouched.length} / ${CMMC_L2_TOTAL}`, y);

  const coverageRows: Array<[string, string, string]> = [
    ["Total CMMC Level 2 Controls", `${CMMC_L2_TOTAL}`, C.black],
    ["Controls touched by tenant scan", `${controlsTouched.length}`, C.blue],
    ["Controls NOT touched by tenant scan", `${CMMC_L2_TOTAL - controlsTouched.length}`, C.critical],
    ["Controls with findings (gaps)", `${controlsWithFindings.length}`, C.high],
    ["Controls with evidence snapshots", `${Array.from(new Set(data.evidenceRecords.flatMap((e) => e.linkedControlIds))).length}`, C.green],
    ["Controls with evidence requests", `${Array.from(new Set(data.evidenceRequests.flatMap((e) => e.linkedControlIds))).length}`, C.medium],
    ["Controls requiring manual review only", `${CMMC_L2_TOTAL - controlsTouched.length}`, C.grayLight],
  ];

  const covRowH = 22;
  for (let ci = 0; ci < coverageRows.length; ci++) {
    y = safePage(y, covRowH);
    const [label, value, color] = coverageRows[ci];
    if (ci % 2 === 0) doc.rect(MARGIN, y, CONTENT_W, covRowH).fill(C.grayBg);
    doc.fillColor(C.gray).font("Helvetica").fontSize(8.5).text(label, MARGIN + 10, y + 6, { width: CONTENT_W - 80 });
    doc.fillColor(color).font("Helvetica-Bold").fontSize(11)
      .text(value, MARGIN + CONTENT_W - 66, y + 4, { width: 60, align: "right" });
    y += covRowH;
  }
  y += 6;

  y = safePage(y, 44);
  doc.rect(MARGIN, y, CONTENT_W, 36).fill(C.blueLight).strokeColor(C.grayBorder).lineWidth(0.5).stroke();
  doc.fillColor(C.blueDark).font("Helvetica").fontSize(8)
    .text(
      `Microsoft tenant data provided assessment signals for ${controlsTouched.length} of ${CMMC_L2_TOTAL} CMMC Level 2 controls. ` +
      "This does not mean the controls were fully assessed. Controls not touched by the tenant scan still require manual review, " +
      "SSP documentation, and assessor validation.",
      MARGIN + 10, y + 8, { width: CONTENT_W - 20 }
    );
  y += 46;

  // Domain coverage table
  y = newSection(y, 180);
  y = heading2("CMMC Control Coverage by Domain", y);

  const domTouched = new Map<string, Set<string>>();
  const domFindings = new Map<string, number>();
  const domRequests = new Map<string, number>();
  for (const ctrl of controlsTouched) {
    const d = getDomain(ctrl);
    if (!domTouched.has(d)) domTouched.set(d, new Set());
    domTouched.get(d)!.add(ctrl);
  }
  for (const f of data.findings) {
    for (const ctrl of f.linkedControlIds) {
      const d = getDomain(ctrl);
      domFindings.set(d, (domFindings.get(d) ?? 0) + 1);
    }
  }
  for (const r of data.evidenceRequests) {
    const domains = new Set(r.linkedControlIds.map(getDomain));
    for (const d of domains) domRequests.set(d, (domRequests.get(d) ?? 0) + 1);
  }

  const DCOL = {
    domain: { x: MARGIN, w: 170 },
    total: { x: MARGIN + 170, w: 44 },
    touched: { x: MARGIN + 214, w: 52 },
    findings: { x: MARGIN + 266, w: 50 },
    requests: { x: MARGIN + 316, w: 60 },
    manual: { x: MARGIN + 376, w: CONTENT_W - 376 },
  };
  y = tableHeader([
    { label: "Domain", x: DCOL.domain.x, w: DCOL.domain.w },
    { label: "Controls", x: DCOL.total.x, w: DCOL.total.w },
    { label: "Touched", x: DCOL.touched.x, w: DCOL.touched.w },
    { label: "Findings", x: DCOL.findings.x, w: DCOL.findings.w },
    { label: "Evidence Req.", x: DCOL.requests.x, w: DCOL.requests.w },
    { label: "Manual Review", x: DCOL.manual.x, w: DCOL.manual.w },
  ], y, 15);

  CMMC_DOMAINS.forEach((dom, di) => {
    const tCount = domTouched.get(dom.id)?.size ?? 0;
    const fCount = domFindings.get(dom.id) ?? 0;
    const rCount = domRequests.get(dom.id) ?? 0;
    const needsManual = tCount < dom.total;
    y = safePage(y, 13);
    if (di % 2 === 0) doc.rect(MARGIN, y, CONTENT_W, 13).fill(C.grayBg);
    doc.fillColor(C.black).font("Helvetica").fontSize(7.5)
      .text(`${dom.id} — ${dom.name}`, DCOL.domain.x + 2, y + 3, { width: DCOL.domain.w - 4 });
    doc.fillColor(C.gray).font("Helvetica").fontSize(7.5)
      .text(dom.total.toString(), DCOL.total.x + 2, y + 3, { width: DCOL.total.w - 4, align: "right" });
    doc.fillColor(tCount > 0 ? C.blue : C.grayLight).font("Helvetica-Bold").fontSize(7.5)
      .text(tCount.toString(), DCOL.touched.x + 2, y + 3, { width: DCOL.touched.w - 4, align: "right" });
    doc.fillColor(fCount > 0 ? C.critical : C.grayLight).font("Helvetica-Bold").fontSize(7.5)
      .text(fCount > 0 ? fCount.toString() : "—", DCOL.findings.x + 2, y + 3, { width: DCOL.findings.w - 4, align: "right" });
    doc.fillColor(rCount > 0 ? C.medium : C.grayLight).font("Helvetica").fontSize(7.5)
      .text(rCount > 0 ? rCount.toString() : "—", DCOL.requests.x + 2, y + 3, { width: DCOL.requests.w - 4, align: "right" });
    doc.fillColor(needsManual ? C.medium : C.green).font("Helvetica-Bold").fontSize(7)
      .text(needsManual ? "Yes" : "No", DCOL.manual.x + 2, y + 3, { width: DCOL.manual.w - 4, align: "center" });
    doc.moveTo(MARGIN, y + 13).lineTo(MARGIN + CONTENT_W, y + 13).lineWidth(0.3).strokeColor(C.grayBorder).stroke();
    y += 13;
  });
  y += 12;

  // ═══════════════════════════════════════════════════════════════════════════════
  // TOP 5 IMMEDIATE ACTIONS
  // ═══════════════════════════════════════════════════════════════════════════════
  const p1Actions = [...data.roadmapActions]
    .filter((a) => a.priority === 1)
    .sort((a, b) => a.priority - b.priority)
    .slice(0, 5);

  if (p1Actions.length > 0) {
    y = newSection(y, 140);
    y = heading1("Top Immediate Actions", y);

    doc.fillColor(C.gray).font("Helvetica").fontSize(8)
      .text(
        "These actions are the highest-priority items identified from the tenant scan. " +
        "Address these before the formal CMMC assessment.",
        MARGIN, y, { width: CONTENT_W }
      );
    y = doc.y + 10;

    for (let ai = 0; ai < p1Actions.length; ai++) {
      const action = p1Actions[ai];
      y = safePage(y, 56);

      doc.rect(MARGIN, y, CONTENT_W, 48).fill(C.criticalBg).strokeColor(C.grayBorder).lineWidth(0.5).stroke();
      doc.rect(MARGIN, y, 4, 48).fill(C.critical);

      doc.fillColor(C.critical).font("Helvetica-Bold").fontSize(7).text("IMMEDIATE", MARGIN + 10, y + 5);
      doc.fillColor(C.black).font("Helvetica-Bold").fontSize(9.5)
        .text(`${ai + 1}. ${action.title}`, MARGIN + 10, y + 16, { width: CONTENT_W - 20 });

      if (action.description) {
        doc.fillColor(C.gray).font("Helvetica").fontSize(8)
          .text(action.description, MARGIN + 10, y + 30, { width: CONTENT_W - 20 });
      }
      if (action.linkedControlIds.length > 0) {
        const ctrlY = action.description ? doc.y + 2 : y + 32;
        doc.fillColor(C.blue).font("Helvetica").fontSize(7)
          .text("Controls: " + action.linkedControlIds.slice(0, 6).join("  "), MARGIN + 10, ctrlY, { width: CONTENT_W - 20 });
      }

      y += 56;
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════════
  // FINDINGS
  // ═══════════════════════════════════════════════════════════════════════════════
  if (data.findings.length > 0) {
    y = newSection(y, 100);
    y = heading1(`Findings  (${data.findings.length} total)`, y);

    const SEVERITIES = ["critical", "high", "medium", "low", "informational"];
    for (const sev of SEVERITIES) {
      const sevFindings = data.findings.filter((f) => f.severity === sev);
      if (sevFindings.length === 0) continue;

      y = safePage(y, 44);
      const sevColor = SEVERITY_COLOR[sev] ?? C.info;
      doc.rect(MARGIN, y, CONTENT_W, 18).fill(sevColor);
      doc.fillColor(C.white).font("Helvetica-Bold").fontSize(9)
        .text(`${sev.toUpperCase()} Severity  —  ${sevFindings.length} finding${sevFindings.length !== 1 ? "s" : ""}`, MARGIN + 8, y + 5);
      y += 24;

      for (const finding of sevFindings) {
        // Estimate height: title=16, observed=24, remediation=24, controls=14, footer=10
        const estH = 16 + (finding.observedCondition ? 26 : 0) + (finding.recommendedRemediation ? 26 : 0) + (finding.linkedControlIds.length > 0 ? 16 : 0) + 14;
        y = safePage(y, estH);

        const bgColor = SEVERITY_BG[finding.severity] ?? C.infoBg;
        const borderColor = SEVERITY_COLOR[finding.severity] ?? C.info;

        // Card header
        doc.rect(MARGIN, y, CONTENT_W, 16).fill(bgColor).strokeColor(C.grayBorder).lineWidth(0.3).stroke();
        doc.rect(MARGIN, y, 4, 16).fill(borderColor);
        badge(SEVERITY_SHORT[sev] ?? sev, borderColor, MARGIN + 8, y + 2, 46, 12);

        doc.fillColor(C.black).font("Helvetica-Bold").fontSize(8.5)
          .text(finding.title, MARGIN + 68, y + 4, { width: CONTENT_W - 150 });

        if (finding.approvedStatus === "approved") {
          badge("ACKNOWLEDGED", C.green, MARGIN + CONTENT_W - 88, y + 2, 84, 12);
        } else if (finding.approvedStatus === "rejected") {
          badge("DISMISSED", C.grayLight, MARGIN + CONTENT_W - 72, y + 2, 68, 12);
        }
        y += 18;

        if (finding.observedCondition) {
          doc.fillColor(C.grayLight).font("Helvetica-Bold").fontSize(7).text("OBSERVED:", MARGIN + 8, y);
          doc.fillColor(C.gray).font("Helvetica").fontSize(8)
            .text(finding.observedCondition, MARGIN + 68, y, { width: CONTENT_W - 76 });
          y = doc.y + 4;
        }
        if (finding.recommendedRemediation) {
          y = safePage(y, 20);
          doc.fillColor(C.grayLight).font("Helvetica-Bold").fontSize(7).text("REMEDIATION:", MARGIN + 8, y);
          doc.fillColor(C.gray).font("Helvetica").fontSize(8)
            .text(finding.recommendedRemediation, MARGIN + 78, y, { width: CONTENT_W - 86 });
          y = doc.y + 4;
        }
        if (finding.linkedControlIds.length > 0) {
          doc.fillColor(C.grayLight).font("Helvetica-Bold").fontSize(7).text("CONTROLS:", MARGIN + 8, y);
          doc.fillColor(C.blue).font("Helvetica-Bold").fontSize(7.5)
            .text(finding.linkedControlIds.join("   "), MARGIN + 64, y, { width: CONTENT_W - 72 });
          y = doc.y + 4;
        }
        const dueDate = fmtDateOffset(data.scan.completedAt ?? data.scan.startedAt, dueDateOffset(finding.severity));
        const owner = suggestOwner(finding.packId);
        doc.fillColor(C.grayLight).font("Helvetica").fontSize(6.5)
          .text(`ID: ${finding.id.slice(0, 16)}   Suggested owner: ${owner}   Recommended due: ${dueDate}`, MARGIN + 8, y, { width: CONTENT_W - 16 });
        y = doc.y + 10;

        doc.moveTo(MARGIN, y).lineTo(MARGIN + CONTENT_W, y)
          .lineWidth(0.3).strokeColor(C.grayBorder).stroke();
        y += 6;
      }
      y += 6;
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════════
  // EVIDENCE SNAPSHOTS
  // ═══════════════════════════════════════════════════════════════════════════════
  if (data.evidenceRecords.length > 0) {
    y = newSection(y, 80);
    y = heading1(`Evidence Snapshots  (${data.evidenceRecords.length})`, y);

    const EC = {
      title: { x: MARGIN, w: 168 },
      pack: { x: MARGIN + 168, w: 88 },
      source: { x: MARGIN + 256, w: 72 },
      date: { x: MARGIN + 328, w: 66 },
      status: { x: MARGIN + 394, w: 62 },
      controls: { x: MARGIN + 456, w: CONTENT_W - 456 },
    };

    y = tableHeader(
      [
        { label: "Snapshot Title", x: EC.title.x, w: EC.title.w },
        { label: "Assessment Pack", x: EC.pack.x, w: EC.pack.w },
        { label: "Source", x: EC.source.x, w: EC.source.w },
        { label: "Date", x: EC.date.x, w: EC.date.w },
        { label: "Status", x: EC.status.x, w: EC.status.w },
        { label: "Controls", x: EC.controls.x, w: EC.controls.w },
      ],
      y, 16
    );

    data.evidenceRecords.forEach((ev, i) => {
      y = safePage(y, 18);
      const shade = i % 2 === 0;
      if (shade) doc.rect(MARGIN, y, CONTENT_W, 16).fill(C.grayBg);

      const isDeviceFailed = failedPacks.has(ev.packId) && ev.packId === "devices";
      const displayStatus = isDeviceFailed ? "Data Unavailable" :
        ev.status === "draft" ? "Pending Review" :
        ev.status === "approved" ? "Approved" :
        ev.status === "rejected" ? "Rejected" : ev.status;
      const statusColor = isDeviceFailed ? C.critical :
        ev.status === "approved" ? C.green :
        ev.status === "rejected" ? C.critical : C.medium;

      doc.fillColor(C.black).font("Helvetica").fontSize(7.5)
        .text(ev.title, EC.title.x + 3, y + 4, { width: EC.title.w - 6 });
      doc.fillColor(C.gray).font("Helvetica").fontSize(7.5)
        .text(PACK_NAMES[ev.packId] ?? ev.packId, EC.pack.x + 3, y + 4, { width: EC.pack.w - 6 });
      doc.fillColor(C.gray).font("Helvetica").fontSize(7.5)
        .text(ev.source, EC.source.x + 3, y + 4, { width: EC.source.w - 6 });
      doc.fillColor(C.gray).font("Helvetica").fontSize(7.5)
        .text(fmtDate(ev.collectedAt), EC.date.x + 3, y + 4, { width: EC.date.w - 6 });
      doc.fillColor(statusColor).font("Helvetica-Bold").fontSize(7)
        .text(displayStatus, EC.status.x + 3, y + 4.5, { width: EC.status.w - 6 });
      const ctrlStr = ev.linkedControlIds.length <= 3
        ? ev.linkedControlIds.join(" ")
        : ev.linkedControlIds.slice(0, 3).join(" ") + ` +${ev.linkedControlIds.length - 3}`;
      doc.fillColor(C.blue).font("Helvetica").fontSize(6.5)
        .text(ctrlStr, EC.controls.x + 3, y + 4.5, { width: EC.controls.w - 6 });

      doc.moveTo(MARGIN, y + 16).lineTo(MARGIN + CONTENT_W, y + 16)
        .lineWidth(0.3).strokeColor(C.grayBorder).stroke();
      y += 16;
    });
    y += 10;
  }

  // ═══════════════════════════════════════════════════════════════════════════════
  // EVIDENCE REQUESTS
  // ═══════════════════════════════════════════════════════════════════════════════
  if (data.evidenceRequests.length > 0) {
    y = newSection(y, 100);
    y = heading1(`Evidence Requests  (${data.evidenceRequests.length})`, y);

    doc.fillColor(C.gray).font("Helvetica").fontSize(8)
      .text(
        "These evidence items should be gathered and uploaded to Control HUB before the formal assessment.",
        MARGIN, y, { width: CONTENT_W }
      );
    y = doc.y + 10;

    const ERC = {
      num: { x: MARGIN, w: 22 },
      title: { x: MARGIN + 22, w: 148 },
      status: { x: MARGIN + 170, w: 58 },
      filename: { x: MARGIN + 228, w: 140 },
      controls: { x: MARGIN + 368, w: 80 },
      owner: { x: MARGIN + 448, w: CONTENT_W - 448 },
    };

    y = tableHeader(
      [
        { label: "#", x: ERC.num.x, w: ERC.num.w },
        { label: "Evidence Request", x: ERC.title.x, w: ERC.title.w },
        { label: "Status", x: ERC.status.x, w: ERC.status.w },
        { label: "Suggested Filename", x: ERC.filename.x, w: ERC.filename.w },
        { label: "Controls", x: ERC.controls.x, w: ERC.controls.w },
        { label: "Owner / Due", x: ERC.owner.x, w: ERC.owner.w },
      ],
      y, 16
    );

    data.evidenceRequests.forEach((er, i) => {
      y = safePage(y, 18);
      const shade = i % 2 === 0;
      if (shade) doc.rect(MARGIN, y, CONTENT_W, 16).fill(C.grayBg);

      const erStatus = er.status === "closed" || er.status === "accepted" ? "Collected" :
        er.status === "submitted" ? "Submitted" : "Open";
      const erColor = erStatus === "Collected" ? C.green : erStatus === "Submitted" ? C.blue : C.high;

      doc.fillColor(C.grayLight).font("Helvetica").fontSize(7)
        .text((i + 1).toString(), ERC.num.x + 3, y + 4.5, { width: ERC.num.w - 6, align: "right" });
      doc.fillColor(C.black).font("Helvetica").fontSize(7.5)
        .text(er.title, ERC.title.x + 3, y + 4, { width: ERC.title.w - 6 });
      doc.fillColor(erColor).font("Helvetica-Bold").fontSize(7)
        .text(erStatus, ERC.status.x + 3, y + 4.5, { width: ERC.status.w - 6 });
      doc.fillColor(C.gray).font("Helvetica").fontSize(6.5)
        .text(er.suggestedFilename ?? "—", ERC.filename.x + 3, y + 4.5, { width: ERC.filename.w - 6 });
      const ctrlStr = er.linkedControlIds.length <= 3
        ? er.linkedControlIds.join(" ")
        : er.linkedControlIds.slice(0, 3).join(" ") + ` +${er.linkedControlIds.length - 3}`;
      doc.fillColor(C.blue).font("Helvetica").fontSize(6.5)
        .text(ctrlStr, ERC.controls.x + 3, y + 4.5, { width: ERC.controls.w - 6 });
      const ownerStr = er.ownerEmail ? er.ownerEmail : "Unassigned";
      const recDue = fmtDateOffset(data.scan.completedAt ?? data.scan.startedAt, 30);
      const dueStr = er.dueDate ? fmtDate(er.dueDate) : `Rec: ${recDue}`;
      doc.fillColor(C.grayLight).font("Helvetica").fontSize(6.5)
        .text(`${ownerStr}\n${dueStr}`, ERC.owner.x + 3, y + 2, { width: ERC.owner.w - 6, lineGap: 1 });

      doc.moveTo(MARGIN, y + 16).lineTo(MARGIN + CONTENT_W, y + 16)
        .lineWidth(0.3).strokeColor(C.grayBorder).stroke();
      y += 16;
    });
    y += 10;
  }

  // ═══════════════════════════════════════════════════════════════════════════════
  // RECOMMENDED ROADMAP — 30/60/90 day grouping
  // ═══════════════════════════════════════════════════════════════════════════════
  if (data.roadmapActions.length > 0) {
    y = newSection(y, 100);
    y = heading1(`Recommended Roadmap  (${data.roadmapActions.length} actions)`, y);

    doc.fillColor(C.gray).font("Helvetica").fontSize(8)
      .text(
        "These roadmap actions are recommended based on tenant scan findings. " +
        "Address P1 items first to establish a security foundation before formal CMMC assessment scheduling.",
        MARGIN, y, { width: CONTENT_W }
      );
    y = doc.y + 10;

    const RC = {
      num: { x: MARGIN, w: 22 },
      title: { x: MARGIN + 22, w: 190 },
      category: { x: MARGIN + 212, w: 76 },
      controls: { x: MARGIN + 288, w: 100 },
      effort: { x: MARGIN + 388, w: 60 },
      due: { x: MARGIN + 448, w: CONTENT_W - 448 },
    };

    const rmBuckets: Array<{ label: string; sub: string; items: typeof data.roadmapActions; color: string; bg: string }> = [
      { label: "First 30 Days", sub: "P1 — Immediate", items: data.roadmapActions.filter((a) => a.priority === 1), color: C.critical, bg: C.criticalBg },
      { label: "31–60 Days", sub: "P2 — Short-term", items: data.roadmapActions.filter((a) => a.priority === 2), color: C.high, bg: C.highBg },
      { label: "61–90 Days", sub: "P3 — Long-term", items: data.roadmapActions.filter((a) => a.priority >= 3), color: C.blue, bg: C.blueLight },
    ];

    for (const bucket of rmBuckets) {
      if (bucket.items.length === 0) continue;
      y = safePage(y, 52);

      // Bucket header
      doc.rect(MARGIN, y, CONTENT_W, 20).fill(bucket.bg).strokeColor(C.grayBorder).lineWidth(0.5).stroke();
      doc.rect(MARGIN, y, 4, 20).fill(bucket.color);
      doc.fillColor(bucket.color).font("Helvetica-Bold").fontSize(9).text(bucket.label, MARGIN + 10, y + 4);
      doc.fillColor(C.grayLight).font("Helvetica").fontSize(7).text(bucket.sub, MARGIN + 10, y + 14);
      y += 22;

      // Column header for this bucket
      y = tableHeader([
        { label: "#", x: RC.num.x, w: RC.num.w },
        { label: "Action", x: RC.title.x, w: RC.title.w },
        { label: "Category", x: RC.category.x, w: RC.category.w },
        { label: "Controls", x: RC.controls.x, w: RC.controls.w },
        { label: "Est. Effort", x: RC.effort.x, w: RC.effort.w },
        { label: "Rec. Due Date", x: RC.due.x, w: RC.due.w },
      ], y, 14);

      bucket.items.forEach((action, i) => {
        const rowH = 18;
        y = safePage(y, rowH);
        if (i % 2 === 0) doc.rect(MARGIN, y, CONTENT_W, rowH).fill(C.grayBg);

        const effort = action.priority === 1 ? "1–2 weeks" : action.priority === 2 ? "1–3 months" : "3–6 months";
        const daysOut = action.priority === 1 ? 14 : action.priority === 2 ? 45 : 75;
        const dueDate = fmtDateOffset(data.scan.completedAt ?? data.scan.startedAt, daysOut);
        const ctrlStr = action.linkedControlIds.slice(0, 3).join(" ") +
          (action.linkedControlIds.length > 3 ? ` +${action.linkedControlIds.length - 3}` : "");

        doc.fillColor(C.grayLight).font("Helvetica").fontSize(7)
          .text((i + 1).toString(), RC.num.x + 3, y + 5, { width: RC.num.w - 6, align: "right" });
        doc.fillColor(C.black).font("Helvetica").fontSize(8)
          .text(action.title, RC.title.x + 3, y + 4, { width: RC.title.w - 6 });
        doc.fillColor(C.gray).font("Helvetica").fontSize(7)
          .text(action.category, RC.category.x + 3, y + 5, { width: RC.category.w - 6 });
        doc.fillColor(C.blue).font("Helvetica").fontSize(7)
          .text(ctrlStr, RC.controls.x + 3, y + 5, { width: RC.controls.w - 6 });
        doc.fillColor(C.grayLight).font("Helvetica").fontSize(7)
          .text(effort, RC.effort.x + 3, y + 5, { width: RC.effort.w - 6 });
        doc.fillColor(C.medium).font("Helvetica").fontSize(7)
          .text(dueDate, RC.due.x + 3, y + 5, { width: RC.due.w - 6 });

        doc.moveTo(MARGIN, y + rowH).lineTo(MARGIN + CONTENT_W, y + rowH)
          .lineWidth(0.3).strokeColor(C.grayBorder).stroke();
        y += rowH;
      });
      y += 10;
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════════
  // APPENDIX
  // ═══════════════════════════════════════════════════════════════════════════════
  y = newSection(y, 160);
  y = heading1("Appendix — Permissions & Scan Metadata", y);

  y = heading2("Graph API Permissions by Assessment Pack", y);

  const APP = {
    pack: { x: MARGIN, w: 130 },
    perms: { x: MARGIN + 130, w: 210 },
    status: { x: MARGIN + 340, w: 72 },
    notes: { x: MARGIN + 412, w: CONTENT_W - 412 },
  };

  y = tableHeader(
    [
      { label: "Assessment Pack", x: APP.pack.x, w: APP.pack.w },
      { label: "Required Permissions", x: APP.perms.x, w: APP.perms.w },
      { label: "Status", x: APP.status.x, w: APP.status.w },
      { label: "Notes", x: APP.notes.x, w: APP.notes.w },
    ],
    y, 16
  );

  for (let pi = 0; pi < (data.scan.packsRequested ?? []).length; pi++) {
    const packId = data.scan.packsRequested[pi];
    const packName = PACK_NAMES[packId] ?? packId;
    const perms = PACK_PERMISSIONS[packId] ?? [];
    const isCompleted = (data.scan.packsCompleted ?? []).includes(packId);
    const isFailed = (data.scan.packsFailed ?? []).includes(packId);

    const statusLabel = isCompleted ? "Available" : isFailed ? "Unavailable" : "Not Run";
    const statusColor = isCompleted ? C.green : isFailed ? C.critical : C.grayLight;
    const notes = isCompleted ? "Data collected successfully" :
      isFailed ? "Permission, license, or API issue" : "Pack not requested";

    const rowH = 18;
    y = safePage(y, rowH);
    const shade = pi % 2 === 0;
    if (shade) doc.rect(MARGIN, y, CONTENT_W, rowH).fill(C.grayBg);
    if (isFailed) doc.rect(MARGIN, y, CONTENT_W, rowH).fill(C.criticalBg);

    doc.fillColor(C.black).font("Helvetica-Bold").fontSize(7.5)
      .text(packName, APP.pack.x + 3, y + 5, { width: APP.pack.w - 6 });
    doc.fillColor(C.gray).font("Helvetica").fontSize(7)
      .text(perms.join(", "), APP.perms.x + 3, y + 5, { width: APP.perms.w - 6 });
    doc.fillColor(statusColor).font("Helvetica-Bold").fontSize(7.5)
      .text(statusLabel, APP.status.x + 3, y + 5, { width: APP.status.w - 6 });
    doc.fillColor(C.grayLight).font("Helvetica").fontSize(7)
      .text(notes, APP.notes.x + 3, y + 5, { width: APP.notes.w - 6 });

    doc.moveTo(MARGIN, y + rowH).lineTo(MARGIN + CONTENT_W, y + rowH)
      .lineWidth(0.3).strokeColor(C.grayBorder).stroke();
    y += rowH;
  }
  y += 14;

  y = newSection(y, 100);
  y = heading2("Scan Metadata", y);

  const metaRows: Array<[string, string]> = [
    ["Scan ID", data.scan.id],
    ["Tenant ID", data.tenantConnection?.microsoftTenantId ?? "—"],
    ["Organization", data.org.name],
    ["Tenant Name", data.tenantConnection?.tenantName ?? "—"],
    ["Primary Domain", data.tenantConnection?.primaryDomain ?? "—"],
    ["Scan Started", fmtDateTime(data.scan.startedAt)],
    ["Scan Completed", fmtDateTime(data.scan.completedAt)],
    ["Total Checks Run", data.scan.totalChecks.toString()],
    ["Passed Checks", data.scan.passedChecks.toString()],
    ["Gaps Found", data.scan.failedChecks.toString()],
    ["Unknown / No Data", data.scan.unknowns.toString()],
    ["Findings Generated", data.findings.length.toString()],
    ["Evidence Snapshots", data.evidenceRecords.length.toString()],
    ["Evidence Requests", data.evidenceRequests.length.toString()],
    ["Roadmap Actions", data.roadmapActions.length.toString()],
    ["Controls Touched", `${controlsTouched.length} / ${CMMC_L2_TOTAL}`],
    ["Report Generated By", data.generatedBy],
  ];

  metaRows.forEach(([label, value], i) => {
    y = safePage(y, 16);
    if (i % 2 === 0) doc.rect(MARGIN, y, CONTENT_W, 15).fill(C.grayBg);
    doc.fillColor(C.grayLight).font("Helvetica").fontSize(8).text(label, MARGIN + 8, y + 3.5, { width: 160 });
    doc.fillColor(C.black).font("Helvetica").fontSize(8).text(value, MARGIN + 172, y + 3.5, { width: CONTENT_W - 180 });
    y += 15;
  });

  // ═══════════════════════════════════════════════════════════════════════════════
  // POST-PROCESS: Write "Page X of Y" on every content page
  // ═══════════════════════════════════════════════════════════════════════════════
  const range = doc.bufferedPageRange();
  const totalPages = range.count;

  // Page 0 is the cover (no header), content pages are 1..count-1
  for (let i = 1; i < totalPages; i++) {
    doc.switchToPage(i);
    // Overwrite the old "Page X" with an exact white-fill then rewrite with "Page X of Y"
    doc.save();
    doc.rect(A4_W - MARGIN - 58, 8, 58, 20).fill(C.blueDark);
    doc.fillColor(C.white).font("Helvetica").fontSize(7.5)
      .text(`Page ${i} of ${totalPages - 1}`, A4_W - MARGIN - 58, 14, { width: 54, align: "right" });
    doc.restore();
  }

  doc.end();
}
