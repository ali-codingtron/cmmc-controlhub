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

const A4_W = 595.28;
const A4_H = 841.89;
const MARGIN = 50;
const CONTENT_W = A4_W - MARGIN * 2;

function healthLabel(rate: number, total: number): string {
  if (total < 3) return "Insufficient Data";
  if (rate >= 75) return "Strong";
  if (rate >= 50) return "Moderate";
  if (rate >= 25) return "Weak";
  return "Critical Gaps";
}

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

export function generatePaReportPdf(data: PaReportData, res: Response): void {
  const doc = new PDFDocument({ size: "A4", margin: MARGIN, autoFirstPage: false });

  res.setHeader("Content-Type", "application/pdf");
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="pre-assessment-report-${data.scan.id.slice(0, 8)}.pdf"`
  );
  doc.pipe(res);

  const passRate = data.scan.totalChecks > 0
    ? Math.round((data.scan.passedChecks / data.scan.totalChecks) * 100) : 0;
  const confidenceRate = data.scan.totalChecks > 0
    ? Math.round(((data.scan.totalChecks - data.scan.unknowns) / data.scan.totalChecks) * 100) : 0;

  const controlsTouched = Array.from(new Set([
    ...data.evidenceRecords.flatMap((e) => e.linkedControlIds),
    ...data.findings.flatMap((f) => f.linkedControlIds),
  ]));
  const controlsWithFindings = Array.from(new Set(data.findings.flatMap((f) => f.linkedControlIds)));
  const controlsWithRequests = Array.from(new Set(data.evidenceRequests.flatMap((e) => e.linkedControlIds)));

  let pageNum = 0;

  function addContentPage() {
    doc.addPage({ size: "A4", margin: MARGIN });
    pageNum++;

    doc.save();
    doc.rect(0, 0, A4_W, 40).fill(C.blueDark);
    doc.fillColor(C.white).font("Helvetica-Bold").fontSize(9)
      .text("Control HUB — Tenant-Connected CMMC Pre-Assessment Report", MARGIN, 14, { width: CONTENT_W - 80 });
    doc.fillColor(C.white).font("Helvetica").fontSize(8)
      .text(`Page ${pageNum}`, A4_W - MARGIN - 40, 14, { width: 40, align: "right" });

    doc.rect(0, A4_H - 28, A4_W, 28).fill(C.grayBg);
    doc.fillColor(C.grayLight).font("Helvetica").fontSize(7.5)
      .text("Confidential — Prepared by Control HUB. Not an official CMMC assessment. For internal use only.", MARGIN, A4_H - 18, { width: CONTENT_W });
    doc.restore();
  }

  function heading1(text: string, y: number): number {
    doc.rect(MARGIN, y, CONTENT_W, 28).fill(C.blueLight);
    doc.fillColor(C.blueDark).font("Helvetica-Bold").fontSize(12)
      .text(text, MARGIN + 10, y + 8);
    return y + 38;
  }

  function heading2(text: string, y: number): number {
    doc.fillColor(C.blue).font("Helvetica-Bold").fontSize(10).text(text, MARGIN, y);
    doc.moveTo(MARGIN, y + 14).lineTo(MARGIN + CONTENT_W, y + 14).lineWidth(0.5).strokeColor(C.grayBorder).stroke();
    return y + 22;
  }

  function body(text: string, x: number, y: number, opts: object = {}): number {
    doc.fillColor(C.gray).font("Helvetica").fontSize(9);
    doc.text(text, x, y, { width: CONTENT_W - (x - MARGIN), ...opts });
    return doc.y + 4;
  }

  function safePage(y: number, needed = 80): number {
    if (y > A4_H - 60 - needed) {
      addContentPage();
      return 58;
    }
    return y;
  }

  function metricBox(label: string, value: string, sub: string, x: number, y: number, w: number, color = C.blue): void {
    doc.rect(x, y, w, 60).fill(C.grayBg).strokeColor(C.grayBorder).stroke();
    doc.fillColor(color).font("Helvetica-Bold").fontSize(20).text(value, x + 8, y + 8, { width: w - 16, align: "center" });
    doc.fillColor(C.black).font("Helvetica-Bold").fontSize(7.5).text(label, x + 4, y + 36, { width: w - 8, align: "center" });
    doc.fillColor(C.grayLight).font("Helvetica").fontSize(7).text(sub, x + 4, y + 48, { width: w - 8, align: "center" });
  }

  function severityBadge(sev: string, x: number, y: number, w = 60): void {
    const color = SEVERITY_COLOR[sev] ?? C.info;
    doc.rect(x, y, w, 12).fill(color);
    doc.fillColor(C.white).font("Helvetica-Bold").fontSize(6.5)
      .text(sev.toUpperCase(), x, y + 2.5, { width: w, align: "center" });
  }

  function statusBadge(status: string, x: number, y: number, w = 70): void {
    const color = status === "completed" ? C.green :
      status === "completed_with_warnings" ? C.medium :
      status === "failed" ? C.critical : C.grayLight;
    doc.rect(x, y, w, 12).fill(color);
    const label = status === "completed" ? "COMPLETE" :
      status === "completed_with_warnings" ? "WITH WARNINGS" :
      status === "failed" ? "FAILED" : status.toUpperCase().replace("_", " ");
    doc.fillColor(C.white).font("Helvetica-Bold").fontSize(6)
      .text(label, x, y + 3, { width: w, align: "center" });
  }

  // ─── COVER PAGE ─────────────────────────────────────────────────────────────
  doc.addPage({ size: "A4", margin: 0 });

  doc.rect(0, 0, A4_W, 280).fill(C.blueDark);
  doc.fillColor(C.white).font("Helvetica-Bold").fontSize(26)
    .text("Tenant-Connected CMMC", MARGIN, 60, { width: CONTENT_W });
  doc.fillColor(C.white).font("Helvetica-Bold").fontSize(26)
    .text("Pre-Assessment Report", MARGIN, 92, { width: CONTENT_W });
  doc.fillColor("#93c5fd").font("Helvetica").fontSize(13)
    .text("Microsoft 365 / Entra Technical Readiness Scan", MARGIN, 130, { width: CONTENT_W });
  doc.moveTo(MARGIN, 155).lineTo(MARGIN + 120, 155).lineWidth(2).strokeColor("#60a5fa").stroke();

  doc.fillColor(C.white).font("Helvetica-Bold").fontSize(9).text("CONFIDENTIAL", MARGIN, 172);
  doc.fillColor("#bfdbfe").font("Helvetica").fontSize(9).text("Internal Use Only — Not an Official CMMC Assessment", MARGIN, 185);

  const infoY = 310;
  function infoRow(label: string, value: string, y: number): number {
    doc.fillColor(C.grayLight).font("Helvetica").fontSize(8).text(label, MARGIN, y);
    doc.fillColor(C.black).font("Helvetica-Bold").fontSize(9).text(value, MARGIN + 130, y);
    return y + 18;
  }

  let iy = infoY;
  iy = infoRow("Organization", data.org.name, iy);
  iy = infoRow("Tenant", data.tenantConnection?.tenantName ?? "—", iy);
  if (data.tenantConnection?.primaryDomain) {
    iy = infoRow("Primary Domain", data.tenantConnection.primaryDomain, iy);
  }
  iy = infoRow("Scan Name", data.scan.scanName, iy);
  iy = infoRow("Scan Date", fmtDateTime(data.scan.completedAt ?? data.scan.startedAt), iy);
  iy = infoRow("Report Generated", fmtDateTime(new Date().toISOString()), iy);
  iy = infoRow("Generated By", data.generatedBy, iy);
  iy = infoRow("Target CMMC Level", "Level 2 (110 Controls)", iy);
  iy = infoRow("Scan Status", data.scan.status.replace(/_/g, " "), iy);

  doc.rect(MARGIN, iy + 16, CONTENT_W, 40).fill(C.blueLight);
  doc.fillColor(C.blueDark).font("Helvetica-Bold").fontSize(11)
    .text(`Tenant Scan Health: ${passRate}%  ·  ${healthLabel(passRate, data.scan.totalChecks)}`, MARGIN + 10, iy + 28);

  doc.rect(0, A4_H - 40, A4_W, 40).fill(C.grayBg);
  doc.fillColor(C.grayLight).font("Helvetica").fontSize(7.5)
    .text("Confidential — Prepared by Control HUB. Not an official CMMC assessment. For internal use only.", MARGIN, A4_H - 25, { width: CONTENT_W });

  // ─── PAGE 2: EXECUTIVE SUMMARY ──────────────────────────────────────────────
  addContentPage();
  let y = 58;

  y = heading1("Executive Summary", y);

  // Metrics grid row 1
  const boxW = (CONTENT_W - 12) / 4;
  metricBox("Tenant Scan Health", `${passRate}%`, healthLabel(passRate, data.scan.totalChecks), MARGIN, y, boxW, passRate >= 75 ? C.green : passRate >= 50 ? C.medium : C.critical);
  metricBox("Assessment Confidence", `${confidenceRate}%`, "data coverage", MARGIN + boxW + 4, y, boxW, C.blue);
  metricBox("Controls Touched", `${controlsTouched.length} / ${CMMC_L2_TOTAL}`, "of CMMC L2 controls", MARGIN + (boxW + 4) * 2, y, boxW, C.blue);
  metricBox("Evidence Snapshots", `${data.evidenceRecords.length}`, "auto-generated", MARGIN + (boxW + 4) * 3, y, boxW, C.blue);
  y += 70;

  // Metrics grid row 2
  metricBox("Checks Run", `${data.scan.totalChecks}`, "total rules evaluated", MARGIN, y, boxW);
  metricBox("Passed", `${data.scan.passedChecks}`, "checks passed", MARGIN + boxW + 4, y, boxW, C.green);
  metricBox("Gaps Found", `${data.scan.failedChecks}`, "failed checks", MARGIN + (boxW + 4) * 2, y, boxW, C.critical);
  metricBox("Findings", `${data.findings.length}`, "requiring review", MARGIN + (boxW + 4) * 3, y, boxW, data.findings.length > 0 ? C.high : C.green);
  y += 76;

  y = safePage(y, 100);
  y = heading2("Scan Interpretation", y);

  const critCount = data.findings.filter((f) => f.severity === "critical").length;
  const highCount = data.findings.filter((f) => f.severity === "high").length;
  let interpretation = `This pre-assessment scanned ${data.scan.totalChecks} Microsoft tenant configuration checks across ${(data.scan.packsCompleted?.length ?? 0)} assessment packs. `;
  if (passRate >= 75) {
    interpretation += `The tenant shows strong technical readiness with ${passRate}% of checks passing.`;
  } else if (passRate >= 50) {
    interpretation += `The tenant shows moderate readiness with notable gaps that should be addressed. ${critCount + highCount} critical/high findings require priority attention.`;
  } else {
    interpretation += `The tenant shows significant gaps requiring remediation. ${critCount} critical and ${highCount} high severity findings were identified.`;
  }
  if (data.scan.packsFailed?.length > 0) {
    interpretation += ` ${data.scan.packsFailed.length} assessment pack(s) encountered data availability issues (see Pack Summary).`;
  }
  y = body(interpretation, MARGIN, y, { align: "justify" });
  y += 8;

  // ─── SCOPE & LIMITATIONS ────────────────────────────────────────────────────
  y = safePage(y, 120);
  y = heading1("Assessment Scope & Limitations", y);

  y = heading2("What This Scan Evaluated", y);
  const evaluated = [
    "Microsoft Entra ID user accounts, guest accounts, and group membership",
    "MFA registration status and authentication method coverage per user",
    "Conditional Access policies, MFA enforcement rules, and legacy authentication blocking",
    "Sign-in logs and failed/risky authentication events",
    "Directory audit logs including role changes, user/group modifications, and policy changes",
    "Microsoft Secure Score and actionable improvement recommendations",
    "Microsoft Intune managed device inventory and compliance state (if Intune is licensed and enrolled devices exist)",
  ];
  for (const item of evaluated) {
    doc.fillColor(C.green).font("Helvetica-Bold").fontSize(9).text("✓", MARGIN, y);
    doc.fillColor(C.gray).font("Helvetica").fontSize(9).text(item, MARGIN + 14, y, { width: CONTENT_W - 14 });
    y = doc.y + 3;
    y = safePage(y, 40);
  }
  y += 6;

  y = safePage(y, 80);
  y = heading2("What This Scan Does Not Fully Evaluate", y);
  const notEvaluated = [
    "SSP (System Security Plan) completeness or quality",
    "CUI scope documentation and data flow diagrams",
    "Policies, procedures, and documented controls",
    "Physical security controls",
    "Personnel security, background checks, or training records",
    "Risk management plans, risk assessments, or risk registers",
    "Incident response plan testing or exercises",
    "Backup and recovery testing",
    "Firewall configuration or network segmentation (unless Microsoft-integrated)",
    "Non-Microsoft systems, applications, or infrastructure",
    "Assessor interviews or hands-on technical testing",
  ];
  for (const item of notEvaluated) {
    y = safePage(y, 30);
    doc.fillColor(C.critical).font("Helvetica-Bold").fontSize(9).text("✗", MARGIN, y);
    doc.fillColor(C.gray).font("Helvetica").fontSize(9).text(item, MARGIN + 14, y, { width: CONTENT_W - 14 });
    y = doc.y + 3;
  }
  y += 6;

  y = safePage(y, 70);
  doc.rect(MARGIN, y, CONTENT_W, 52).fill(C.blueLight);
  doc.rect(MARGIN, y, 4, 52).fill(C.blue);
  doc.fillColor(C.blueDark).font("Helvetica-Bold").fontSize(9).text("Important Disclaimer", MARGIN + 12, y + 8);
  doc.fillColor(C.gray).font("Helvetica").fontSize(8.5)
    .text(
      "This report is a technical pre-assessment based on Microsoft tenant configuration and Microsoft Graph API data. " +
      "It is not an official CMMC assessment and does not replace a C3PAO assessment, SSP review, or formal compliance audit. " +
      "Final CMMC certification requires review of policies, procedures, evidence, interviews, and testing by a certified assessor.",
      MARGIN + 12, y + 22, { width: CONTENT_W - 20 }
    );
  y += 62;

  // ─── ASSESSMENT PACK SUMMARY ────────────────────────────────────────────────
  addContentPage();
  y = 58;
  y = heading1("Assessment Pack Summary", y);

  for (const packId of (data.scan.packsRequested ?? [])) {
    y = safePage(y, 70);
    const name = PACK_NAMES[packId] ?? packId;
    const isCompleted = (data.scan.packsCompleted ?? []).includes(packId);
    const isFailed = (data.scan.packsFailed ?? []).includes(packId);
    const packFindings = data.findings.filter((f) => f.packId === packId);
    const packEvidence = data.evidenceRecords.filter((e) => e.packId === packId);

    doc.rect(MARGIN, y, CONTENT_W, 56).fill(isFailed ? C.criticalBg : C.grayBg).strokeColor(C.grayBorder).lineWidth(0.5).stroke();
    doc.fillColor(C.black).font("Helvetica-Bold").fontSize(10).text(name, MARGIN + 10, y + 8);
    statusBadge(isFailed ? "failed" : isCompleted ? "completed" : "not_started", MARGIN + CONTENT_W - 90, y + 7);

    const cols = ["Checks", "Passed", "Gaps", "Findings", "Evidence"];
    const vals = [
      packEvidence.length.toString(),
      packEvidence.filter((e) => e.status !== "draft" || true).length.toString(),
      packFindings.filter((f) => f.result === "fail").length.toString(),
      packFindings.length.toString(),
      packEvidence.length.toString(),
    ];
    const colW = (CONTENT_W - 20) / cols.length;
    cols.forEach((col, i) => {
      const cx = MARGIN + 10 + i * colW;
      doc.fillColor(C.grayLight).font("Helvetica").fontSize(7).text(col, cx, y + 30, { width: colW - 4 });
      doc.fillColor(C.black).font("Helvetica-Bold").fontSize(9).text(vals[i], cx, y + 40, { width: colW - 4 });
    });

    if (isFailed) {
      doc.fillColor(C.critical).font("Helvetica").fontSize(8)
        .text("Data unavailable — check permissions, licensing, or tenant configuration", MARGIN + 10, y + 42);
    }
    y += 64;
  }

  // ─── CONTROL COVERAGE ───────────────────────────────────────────────────────
  y = safePage(y, 120);
  y = heading1("CMMC Control Coverage", y);

  const coverageItems = [
    ["Total CMMC Level 2 Controls", `${CMMC_L2_TOTAL}`, C.black],
    ["Controls touched by tenant scan", `${controlsTouched.length}`, C.blue],
    ["Controls NOT assessed by tenant scan", `${CMMC_L2_TOTAL - controlsTouched.length}`, C.critical],
    ["Controls with findings (gaps)", `${controlsWithFindings.length}`, C.high],
    ["Controls with evidence snapshots", `${Array.from(new Set(data.evidenceRecords.flatMap((e) => e.linkedControlIds))).length}`, C.green],
    ["Controls with evidence requests", `${controlsWithRequests.length}`, C.medium],
    ["Controls requiring manual review", `${CMMC_L2_TOTAL - controlsTouched.length}`, C.grayLight],
  ];

  const rowH = 24;
  coverageItems.forEach(([label, value, color], i) => {
    const rowY = y + i * rowH;
    if (i % 2 === 0) doc.rect(MARGIN, rowY, CONTENT_W, rowH).fill(C.grayBg);
    doc.fillColor(C.gray).font("Helvetica").fontSize(9).text(label as string, MARGIN + 10, rowY + 7);
    doc.fillColor(color as string).font("Helvetica-Bold").fontSize(10)
      .text(value as string, MARGIN + CONTENT_W - 60, rowY + 6, { width: 50, align: "right" });
  });
  y += coverageItems.length * rowH + 12;

  y = safePage(y, 50);
  doc.rect(MARGIN, y, CONTENT_W, 36).fill(C.blueLight);
  doc.fillColor(C.blueDark).font("Helvetica").fontSize(8.5)
    .text(
      `Microsoft tenant data provided assessment signals for ${controlsTouched.length} of ${CMMC_L2_TOTAL} CMMC Level 2 controls. ` +
      "Controls not touched by the tenant scan still require manual review, SSP documentation, and assessor validation.",
      MARGIN + 10, y + 10, { width: CONTENT_W - 20 }
    );
  y += 46;

  // ─── FINDINGS ───────────────────────────────────────────────────────────────
  if (data.findings.length > 0) {
    addContentPage();
    y = 58;
    y = heading1(`Findings  (${data.findings.length} total)`, y);

    const SEVERITIES = ["critical", "high", "medium", "low", "informational"];
    for (const sev of SEVERITIES) {
      const sevFindings = data.findings.filter((f) => f.severity === sev);
      if (sevFindings.length === 0) continue;

      y = safePage(y, 50);
      const color = SEVERITY_COLOR[sev] ?? C.info;
      doc.rect(MARGIN, y, CONTENT_W, 18).fill(color);
      doc.fillColor(C.white).font("Helvetica-Bold").fontSize(9)
        .text(`${sev.toUpperCase()} Severity  (${sevFindings.length})`, MARGIN + 8, y + 5);
      y += 24;

      for (const finding of sevFindings) {
        y = safePage(y, 70);

        doc.rect(MARGIN, y, CONTENT_W, 12).fill(C.grayBg);
        severityBadge(finding.severity, MARGIN, y);
        doc.fillColor(C.black).font("Helvetica-Bold").fontSize(8.5)
          .text(finding.title, MARGIN + 68, y + 1.5, { width: CONTENT_W - 140 });
        if (finding.approvedStatus === "approved") {
          doc.fillColor(C.green).font("Helvetica").fontSize(7).text("ACKNOWLEDGED", MARGIN + CONTENT_W - 80, y + 2.5);
        } else if (finding.approvedStatus === "rejected") {
          doc.fillColor(C.grayLight).font("Helvetica").fontSize(7).text("DISMISSED", MARGIN + CONTENT_W - 70, y + 2.5);
        }
        y += 14;

        if (finding.observedCondition) {
          doc.fillColor(C.grayLight).font("Helvetica-Bold").fontSize(7.5).text("Observed:", MARGIN + 8, y);
          doc.fillColor(C.gray).font("Helvetica").fontSize(8)
            .text(finding.observedCondition, MARGIN + 58, y, { width: CONTENT_W - 66 });
          y = doc.y + 2;
        }
        if (finding.recommendedRemediation) {
          y = safePage(y, 25);
          doc.fillColor(C.grayLight).font("Helvetica-Bold").fontSize(7.5).text("Remediation:", MARGIN + 8, y);
          doc.fillColor(C.gray).font("Helvetica").fontSize(8)
            .text(finding.recommendedRemediation, MARGIN + 72, y, { width: CONTENT_W - 80 });
          y = doc.y + 2;
        }
        if (finding.linkedControlIds.length > 0) {
          doc.fillColor(C.grayLight).font("Helvetica-Bold").fontSize(7.5).text("Controls:", MARGIN + 8, y);
          doc.fillColor(C.blue).font("Helvetica").fontSize(7.5)
            .text(finding.linkedControlIds.join("  "), MARGIN + 55, y, { width: CONTENT_W - 63 });
          y = doc.y + 2;
        }
        y += 8;
        doc.moveTo(MARGIN, y).lineTo(MARGIN + CONTENT_W, y).lineWidth(0.3).strokeColor(C.grayBorder).stroke();
        y += 6;
      }
      y += 6;
    }
  }

  // ─── EVIDENCE SNAPSHOTS ─────────────────────────────────────────────────────
  if (data.evidenceRecords.length > 0) {
    addContentPage();
    y = 58;
    y = heading1(`Evidence Snapshots  (${data.evidenceRecords.length})`, y);

    doc.rect(MARGIN, y, CONTENT_W, 14).fill(C.blueDark);
    doc.fillColor(C.white).font("Helvetica-Bold").fontSize(7.5);
    doc.text("Title", MARGIN + 4, y + 3.5, { width: 200 });
    doc.text("Pack", MARGIN + 208, y + 3.5, { width: 90 });
    doc.text("Source", MARGIN + 302, y + 3.5, { width: 80 });
    doc.text("Date", MARGIN + 386, y + 3.5, { width: 70 });
    doc.text("Status", MARGIN + 458, y + 3.5, { width: 70 });
    y += 16;

    data.evidenceRecords.forEach((ev, i) => {
      y = safePage(y, 24);
      if (i % 2 === 0) doc.rect(MARGIN, y, CONTENT_W, 16).fill(C.grayBg);
      doc.fillColor(C.black).font("Helvetica").fontSize(7.5).text(ev.title, MARGIN + 4, y + 4, { width: 200 });
      doc.fillColor(C.gray).font("Helvetica").fontSize(7.5)
        .text(PACK_NAMES[ev.packId] ?? ev.packId, MARGIN + 208, y + 4, { width: 90 });
      doc.text(ev.source, MARGIN + 302, y + 4, { width: 80 });
      doc.text(fmtDate(ev.collectedAt), MARGIN + 386, y + 4, { width: 70 });
      const statusColor = ev.status === "approved" ? C.green : ev.status === "rejected" ? C.critical : C.medium;
      doc.fillColor(statusColor).font("Helvetica-Bold").fontSize(7)
        .text(ev.status === "draft" ? "Pending Review" : ev.status.toUpperCase(), MARGIN + 458, y + 4.5, { width: 70 });
      y += 16;
    });
    y += 8;
  }

  // ─── EVIDENCE REQUESTS ──────────────────────────────────────────────────────
  if (data.evidenceRequests.length > 0) {
    addContentPage();
    y = 58;
    y = heading1(`Evidence Requests  (${data.evidenceRequests.length})`, y);

    for (const er of data.evidenceRequests) {
      y = safePage(y, 60);

      doc.rect(MARGIN, y, CONTENT_W, 14).fill(C.grayBg).strokeColor(C.grayBorder).lineWidth(0.5).stroke();
      doc.fillColor(C.black).font("Helvetica-Bold").fontSize(9).text(er.title, MARGIN + 8, y + 2.5, { width: CONTENT_W - 100 });
      const erColor = er.status === "closed" || er.status === "accepted" ? C.green :
        er.status === "submitted" ? C.blue : C.high;
      doc.fillColor(erColor).font("Helvetica-Bold").fontSize(7)
        .text(er.status.toUpperCase(), MARGIN + CONTENT_W - 70, y + 4, { width: 65, align: "right" });
      y += 16;

      if (er.instructions) {
        doc.fillColor(C.gray).font("Helvetica").fontSize(8)
          .text(er.instructions, MARGIN + 8, y, { width: CONTENT_W - 16 });
        y = doc.y + 4;
      }
      if (er.suggestedFilename) {
        doc.fillColor(C.grayLight).font("Helvetica").fontSize(7.5)
          .text(`Suggested filename: ${er.suggestedFilename}`, MARGIN + 8, y);
        y = doc.y + 4;
      }
      if (er.linkedControlIds.length > 0) {
        doc.fillColor(C.blue).font("Helvetica").fontSize(7.5)
          .text(`Controls: ${er.linkedControlIds.join("  ")}`, MARGIN + 8, y, { width: CONTENT_W - 16 });
        y = doc.y + 4;
      }
      if (er.ownerEmail || er.dueDate) {
        const meta = [er.ownerEmail && `Owner: ${er.ownerEmail}`, er.dueDate && `Due: ${fmtDate(er.dueDate)}`]
          .filter(Boolean).join("  ·  ");
        doc.fillColor(C.grayLight).font("Helvetica").fontSize(7.5).text(meta, MARGIN + 8, y);
        y = doc.y + 4;
      }
      y += 6;
      doc.moveTo(MARGIN, y).lineTo(MARGIN + CONTENT_W, y).lineWidth(0.3).strokeColor(C.grayBorder).stroke();
      y += 6;
    }
  }

  // ─── ROADMAP ─────────────────────────────────────────────────────────────────
  if (data.roadmapActions.length > 0) {
    addContentPage();
    y = 58;
    y = heading1(`Recommended Roadmap  (${data.roadmapActions.length} actions)`, y);

    const sorted = [...data.roadmapActions].sort((a, b) => a.priority - b.priority);
    sorted.forEach((action, i) => {
      y = safePage(y, 60);

      const priBg = action.priority === 1 ? C.criticalBg : action.priority === 2 ? C.highBg : C.blueLight;
      const priColor = action.priority === 1 ? C.critical : action.priority === 2 ? C.high : C.blue;
      const priLabel = action.priority === 1 ? "P1 · Immediate" : action.priority === 2 ? "P2 · Short-term" : "P3 · Long-term";

      doc.rect(MARGIN, y, CONTENT_W, 14).fill(priBg).strokeColor(C.grayBorder).lineWidth(0.5).stroke();
      doc.fillColor(priColor).font("Helvetica-Bold").fontSize(7).text(priLabel, MARGIN + 4, y + 3.5, { width: 80 });
      doc.fillColor(C.black).font("Helvetica-Bold").fontSize(9).text(`${i + 1}. ${action.title}`, MARGIN + 90, y + 2.5, { width: CONTENT_W - 160 });
      doc.fillColor(C.grayLight).font("Helvetica").fontSize(7)
        .text(action.category, MARGIN + CONTENT_W - 70, y + 4, { width: 65, align: "right" });
      y += 16;

      if (action.description) {
        doc.fillColor(C.gray).font("Helvetica").fontSize(8.5)
          .text(action.description, MARGIN + 8, y, { width: CONTENT_W - 16 });
        y = doc.y + 4;
      }
      if (action.linkedControlIds.length > 0) {
        doc.fillColor(C.blue).font("Helvetica").fontSize(7.5)
          .text(`Controls: ${action.linkedControlIds.join("  ")}`, MARGIN + 8, y, { width: CONTENT_W - 16 });
        y = doc.y + 4;
      }
      y += 8;
      doc.moveTo(MARGIN, y).lineTo(MARGIN + CONTENT_W, y).lineWidth(0.3).strokeColor(C.grayBorder).stroke();
      y += 6;
    });
  }

  // ─── APPENDIX ─────────────────────────────────────────────────────────────────
  addContentPage();
  y = 58;
  y = heading1("Appendix — Technical Details", y);

  y = heading2("Permissions Used", y);
  const permTable: Record<string, string[]> = {
    identity: ["User.Read.All", "GroupMember.Read.All", "Directory.Read.All"],
    authentication: ["UserAuthenticationMethod.Read.All"],
    conditional_access: ["Policy.Read.All"],
    devices: ["Device.Read.All", "DeviceManagementManagedDevices.Read.All"],
    audit: ["AuditLog.Read.All"],
    secure_score: ["SecurityEvents.Read.All"],
  };
  for (const packId of (data.scan.packsRequested ?? [])) {
    y = safePage(y, 30);
    const packName = PACK_NAMES[packId] ?? packId;
    const perms = permTable[packId] ?? [];
    const completed = (data.scan.packsCompleted ?? []).includes(packId);
    const failed = (data.scan.packsFailed ?? []).includes(packId);
    const statusStr = completed ? "✓ Available" : failed ? "✗ Unavailable" : "— Not Run";
    const statusColor = completed ? C.green : failed ? C.critical : C.grayLight;
    doc.fillColor(C.black).font("Helvetica-Bold").fontSize(8.5).text(`${packName}:`, MARGIN, y);
    doc.fillColor(statusColor).font("Helvetica").fontSize(8).text(statusStr, MARGIN + 130, y);
    y = doc.y + 2;
    doc.fillColor(C.gray).font("Helvetica").fontSize(8)
      .text(perms.join("  ·  "), MARGIN + 10, y, { width: CONTENT_W - 10 });
    y = doc.y + 8;
  }

  y += 8;
  y = heading2("Scan Metadata", y);
  const meta: Array<[string, string]> = [
    ["Scan ID", data.scan.id],
    ["Tenant ID", data.tenantConnection?.microsoftTenantId ?? "—"],
    ["Organization", data.org.name],
    ["Scan Started", fmtDateTime(data.scan.startedAt)],
    ["Scan Completed", fmtDateTime(data.scan.completedAt)],
    ["Total Checks Run", data.scan.totalChecks.toString()],
    ["Passed", data.scan.passedChecks.toString()],
    ["Gaps Found", data.scan.failedChecks.toString()],
    ["Unknown / No Data", data.scan.unknowns.toString()],
    ["Findings Generated", data.findings.length.toString()],
    ["Evidence Snapshots", data.evidenceRecords.length.toString()],
    ["Evidence Requests", data.evidenceRequests.length.toString()],
    ["Roadmap Actions", data.roadmapActions.length.toString()],
  ];
  meta.forEach(([label, value], i) => {
    y = safePage(y, 18);
    if (i % 2 === 0) doc.rect(MARGIN, y, CONTENT_W, 15).fill(C.grayBg);
    doc.fillColor(C.grayLight).font("Helvetica").fontSize(8).text(label, MARGIN + 8, y + 3.5);
    doc.fillColor(C.black).font("Helvetica").fontSize(8).text(value, MARGIN + 160, y + 3.5);
    y += 15;
  });

  doc.end();
}
