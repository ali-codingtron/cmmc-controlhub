import { Router } from "express";
import {
  db,
  controlsTable,
  controlAssessmentsTable,
  domainsTable,
  evidenceItemsTable,
  evidenceControlLinksTable,
  poamsTable,
  monitoringItemsTable,
  organizationsTable,
  usersTable,
  sspDocumentsTable,
  sspSectionsTable,
  sspControlMappingsTable,
} from "@workspace/db";
import { eq, and, desc, count, isNotNull, isNull, ne, lte, gte, sql } from "drizzle-orm";
import { requireAuth } from "../lib/auth";
import { requireOrg } from "../middleware/org";

const router = Router();

// ── Shared helpers ────────────────────────────────────────────────────────────
function todayStr() {
  return new Date().toISOString().split("T")[0];
}

function daysOverdue(dateStr: string | null): number {
  if (!dateStr) return 0;
  const due = new Date(dateStr);
  const now = new Date();
  const diff = Math.floor((now.getTime() - due.getTime()) / 86400000);
  return diff > 0 ? diff : 0;
}

function sevenDaysFromNow() {
  return new Date(Date.now() + 7 * 86400000);
}

// ── 1. Executive Readiness Report ─────────────────────────────────────────────
router.get("/reports/executive", requireAuth, requireOrg, async (req, res) => {
  const orgId = req.orgId!;

  const [org] = await db
    .select({ name: organizationsTable.name, cmmcTargetLevel: organizationsTable.cmmcTargetLevel, legalName: organizationsTable.legalName, primaryContact: organizationsTable.primaryContact })
    .from(organizationsTable)
    .where(eq(organizationsTable.id, orgId))
    .limit(1);

  // Controls with assessment status
  const controls = await db
    .select({
      id: controlsTable.id,
      controlId: controlsTable.controlId,
      domainId: controlsTable.domainId,
      domainName: domainsTable.name,
      status: controlAssessmentsTable.status,
    })
    .from(controlsTable)
    .leftJoin(domainsTable, eq(domainsTable.id, controlsTable.domainId))
    .leftJoin(controlAssessmentsTable, and(
      eq(controlAssessmentsTable.controlId, controlsTable.id),
      eq(controlAssessmentsTable.organizationId, orgId),
    ));

  const total = controls.length;
  const implemented = controls.filter(c => c.status === "implemented" || c.status === "assessor_ready").length;
  const inProgress = controls.filter(c => c.status === "in_progress" || c.status === "needs_review").length;
  const notStarted = controls.filter(c => !c.status || c.status === "not_started").length;
  const atRisk = controls.filter(c => c.status === "at_risk").length;
  const notApplicable = controls.filter(c => c.status === "not_applicable").length;
  const readinessPct = total > 0 ? Math.round((implemented / total) * 100) : 0;

  // Domain breakdown for top risk areas
  const domainMap = new Map<string, { domain: string; total: number; notStarted: number }>();
  for (const c of controls) {
    const key = c.domainName ?? "Unknown";
    const e = domainMap.get(key) ?? { domain: key, total: 0, notStarted: 0 };
    e.total++;
    if (!c.status || c.status === "not_started") e.notStarted++;
    domainMap.set(key, e);
  }
  const topRiskDomains = [...domainMap.values()]
    .sort((a, b) => b.notStarted - a.notStarted)
    .slice(0, 5);

  // Evidence
  const evidence = await db
    .select({ status: evidenceItemsTable.status })
    .from(evidenceItemsTable)
    .where(and(eq(evidenceItemsTable.organizationId, orgId), isNull(evidenceItemsTable.deletedAt)));

  const evidenceTotal = evidence.length;
  const evidenceApproved = evidence.filter(e => e.status === "approved" || e.status === "assessor_ready").length;
  const evidenceDraft = evidence.filter(e => e.status === "draft" || e.status === "needs_classification").length;
  const evidenceStale = evidence.filter(e => e.status === "stale").length;

  // POA&Ms
  const poams = await db
    .select({ status: poamsTable.status, scheduledCompletionDate: poamsTable.scheduledCompletionDate })
    .from(poamsTable)
    .where(eq(poamsTable.organizationId, orgId));

  const poamTotal = poams.length;
  const poamOpen = poams.filter(p => p.status !== "closed" && p.status !== "accepted_risk").length;
  const now = new Date();
  const poamOverdue = poams.filter(p => {
    if (p.status === "closed") return false;
    if (!p.scheduledCompletionDate) return false;
    return new Date(p.scheduledCompletionDate) < now;
  }).length;
  const poamClosingSoon = poams.filter(p => {
    if (p.status === "closed") return false;
    if (!p.scheduledCompletionDate) return false;
    const due = new Date(p.scheduledCompletionDate);
    return due >= now && due <= sevenDaysFromNow();
  }).length;

  // Monitoring
  const monitoring = await db
    .select({ status: monitoringItemsTable.status, nextDue: monitoringItemsTable.nextDue })
    .from(monitoringItemsTable)
    .where(eq(monitoringItemsTable.organizationId, orgId));

  const monTotal = monitoring.length;
  const monComplete = monitoring.filter(m => m.status === "complete").length;
  const monOverdue = monitoring.filter(m => {
    if (m.status === "complete" || !m.nextDue) return false;
    return new Date(m.nextDue) < now;
  }).length;
  const monDueSoon = monitoring.filter(m => {
    if (m.status === "complete" || !m.nextDue) return false;
    const due = new Date(m.nextDue);
    return due >= now && due <= sevenDaysFromNow();
  }).length;

  res.json({
    reportDate: new Date().toISOString(),
    org: org ?? { name: "Unknown", cmmcTargetLevel: "L2" },
    controls: { total, implemented, inProgress, notStarted, atRisk, notApplicable },
    readinessPct,
    evidence: { total: evidenceTotal, approved: evidenceApproved, draft: evidenceDraft, stale: evidenceStale },
    poams: { total: poamTotal, open: poamOpen, overdue: poamOverdue, closingSoon: poamClosingSoon },
    monitoring: { total: monTotal, complete: monComplete, overdue: monOverdue, dueSoon: monDueSoon },
    topRiskDomains,
  });
});

// ── 2. Gap Analysis Report ────────────────────────────────────────────────────
router.get("/reports/gap", requireAuth, requireOrg, async (req, res) => {
  const orgId = req.orgId!;

  const controls = await db
    .select({
      id: controlsTable.id,
      controlId: controlsTable.controlId,
      title: controlsTable.title,
      domainName: domainsTable.name,
      status: controlAssessmentsTable.status,
      implementationNarrative: controlAssessmentsTable.implementationNarrative,
    })
    .from(controlsTable)
    .leftJoin(domainsTable, eq(domainsTable.id, controlsTable.domainId))
    .leftJoin(controlAssessmentsTable, and(
      eq(controlAssessmentsTable.controlId, controlsTable.id),
      eq(controlAssessmentsTable.organizationId, orgId),
    ))
    .orderBy(domainsTable.sortOrder, controlsTable.sortOrder);

  // Get all evidence links for this org
  const evidenceLinks = await db
    .select({
      controlId: evidenceControlLinksTable.controlId,
      evidenceType: evidenceItemsTable.evidenceType,
      evidenceStatus: evidenceItemsTable.status,
    })
    .from(evidenceControlLinksTable)
    .innerJoin(evidenceItemsTable, and(
      eq(evidenceItemsTable.id, evidenceControlLinksTable.evidenceId),
      eq(evidenceItemsTable.organizationId, orgId),
      isNull(evidenceItemsTable.deletedAt),
    ));

  // Build evidence map per control
  const evMap = new Map<string, typeof evidenceLinks>();
  for (const link of evidenceLinks) {
    const arr = evMap.get(link.controlId) ?? [];
    arr.push(link);
    evMap.set(link.controlId, arr);
  }

  const gapItems = controls.map(c => {
    const evLinks = evMap.get(c.id) ?? [];
    const hasEvidence = evLinks.length > 0;
    const hasApproved = evLinks.some(e => e.evidenceStatus === "approved" || e.evidenceStatus === "assessor_ready");
    const hasDraftOnly = hasEvidence && !hasApproved && evLinks.every(e => e.evidenceStatus === "draft" || e.evidenceStatus === "needs_classification");
    const hasPolicy = evLinks.some(e => e.evidenceType === "policy");
    const hasProcedure = evLinks.some(e => e.evidenceType === "procedure");
    const hasStale = evLinks.some(e => e.evidenceStatus === "stale");
    const hasNarrative = !!(c.implementationNarrative?.trim());

    const missingEvidence = !hasEvidence;
    const missingPolicy = !hasPolicy;
    const missingProcedure = !hasProcedure;
    const missingNarrative = !hasNarrative;

    // Severity: High = no evidence; Medium = has evidence but missing policy/procedure; Low = minor issues
    let severity: "high" | "medium" | "low" = "low";
    if (missingEvidence || (missingPolicy && missingProcedure)) severity = "high";
    else if (missingPolicy || missingProcedure || missingNarrative) severity = "medium";
    else if (hasDraftOnly || hasStale) severity = "low";

    const hasGap = missingEvidence || missingPolicy || missingProcedure || missingNarrative || hasDraftOnly || hasStale;

    return {
      controlId: c.controlId,
      title: c.title,
      domain: c.domainName ?? "Unknown",
      status: c.status ?? "not_started",
      missingEvidence,
      missingPolicy,
      missingProcedure,
      missingNarrative,
      hasDraftOnly,
      hasStale,
      severity,
      hasGap,
    };
  });

  // Group by domain
  const domainMap = new Map<string, typeof gapItems>();
  for (const item of gapItems) {
    const arr = domainMap.get(item.domain) ?? [];
    arr.push(item);
    domainMap.set(item.domain, arr);
  }

  const byDomain = [...domainMap.entries()].map(([domain, items]) => ({
    domain,
    totalControls: items.length,
    gapCount: items.filter(i => i.hasGap).length,
    highCount: items.filter(i => i.severity === "high" && i.hasGap).length,
    mediumCount: items.filter(i => i.severity === "medium" && i.hasGap).length,
    lowCount: items.filter(i => i.severity === "low" && i.hasGap).length,
    controls: items.filter(i => i.hasGap),
  }));

  res.json({
    reportDate: new Date().toISOString(),
    summary: {
      totalGaps: gapItems.filter(i => i.hasGap).length,
      highGaps: gapItems.filter(i => i.hasGap && i.severity === "high").length,
      mediumGaps: gapItems.filter(i => i.hasGap && i.severity === "medium").length,
      lowGaps: gapItems.filter(i => i.hasGap && i.severity === "low").length,
      missingEvidence: gapItems.filter(i => i.missingEvidence).length,
      missingPolicy: gapItems.filter(i => i.missingPolicy).length,
      missingProcedure: gapItems.filter(i => i.missingProcedure).length,
      missingNarrative: gapItems.filter(i => i.missingNarrative).length,
    },
    byDomain,
  });
});

// ── 3. Control Status Report ──────────────────────────────────────────────────
router.get("/reports/controls", requireAuth, requireOrg, async (req, res) => {
  const orgId = req.orgId!;

  const controls = await db
    .select({
      controlId: controlsTable.controlId,
      title: controlsTable.title,
      domainName: domainsTable.name,
      level: controlsTable.level,
      nistRef: controlsTable.nistRef,
      status: controlAssessmentsTable.status,
      implementationNarrative: controlAssessmentsTable.implementationNarrative,
      lastAssessedAt: controlAssessmentsTable.lastAssessedAt,
    })
    .from(controlsTable)
    .leftJoin(domainsTable, eq(domainsTable.id, controlsTable.domainId))
    .leftJoin(controlAssessmentsTable, and(
      eq(controlAssessmentsTable.controlId, controlsTable.id),
      eq(controlAssessmentsTable.organizationId, orgId),
    ))
    .orderBy(domainsTable.sortOrder, controlsTable.sortOrder);

  // Evidence counts per control
  const evidenceCounts = await db
    .select({
      controlId: evidenceControlLinksTable.controlId,
      cnt: count(evidenceControlLinksTable.id),
    })
    .from(evidenceControlLinksTable)
    .innerJoin(evidenceItemsTable, and(
      eq(evidenceItemsTable.id, evidenceControlLinksTable.evidenceId),
      eq(evidenceItemsTable.organizationId, orgId),
      isNull(evidenceItemsTable.deletedAt),
    ))
    .groupBy(evidenceControlLinksTable.controlId);

  const evCountMap = new Map(evidenceCounts.map(e => [e.controlId, Number(e.cnt)]));

  res.json({
    reportDate: new Date().toISOString(),
    controls: controls.map(c => ({
      ...c,
      evidenceCount: evCountMap.get(c.controlId) ?? 0,
      hasNarrative: !!(c.implementationNarrative?.trim()),
      status: c.status ?? "not_started",
    })),
  });
});

// ── 4. Evidence Inventory Report ──────────────────────────────────────────────
router.get("/reports/evidence", requireAuth, requireOrg, async (req, res) => {
  const orgId = req.orgId!;

  const evidence = await db
    .select({
      id: evidenceItemsTable.id,
      title: evidenceItemsTable.title,
      evidenceType: evidenceItemsTable.evidenceType,
      status: evidenceItemsTable.status,
      version: evidenceItemsTable.version,
      ownerName: usersTable.name,
      createdAt: evidenceItemsTable.createdAt,
      expiresAt: evidenceItemsTable.expiresAt,
      collectedAt: evidenceItemsTable.collectedAt,
      tags: evidenceItemsTable.tags,
      fileName: evidenceItemsTable.fileName,
    })
    .from(evidenceItemsTable)
    .leftJoin(usersTable, eq(usersTable.id, evidenceItemsTable.ownerId))
    .where(and(
      eq(evidenceItemsTable.organizationId, orgId),
      isNull(evidenceItemsTable.deletedAt),
    ))
    .orderBy(desc(evidenceItemsTable.createdAt));

  // Get linked controls per evidence item
  const links = await db
    .select({
      evidenceId: evidenceControlLinksTable.evidenceId,
      controlId: controlsTable.controlId,
      domainName: domainsTable.name,
    })
    .from(evidenceControlLinksTable)
    .innerJoin(controlsTable, eq(controlsTable.id, evidenceControlLinksTable.controlId))
    .leftJoin(domainsTable, eq(domainsTable.id, controlsTable.domainId));

  const linkMap = new Map<string, string[]>();
  for (const l of links) {
    const arr = linkMap.get(l.evidenceId) ?? [];
    arr.push(l.controlId);
    linkMap.set(l.evidenceId, arr);
  }

  res.json({
    reportDate: new Date().toISOString(),
    evidence: evidence.map(e => ({
      ...e,
      linkedControls: linkMap.get(e.id) ?? [],
    })),
  });
});

// ── 5. POA&M Report ───────────────────────────────────────────────────────────
router.get("/reports/poam", requireAuth, requireOrg, async (req, res) => {
  const orgId = req.orgId!;
  const now = new Date();

  const items = await db
    .select({
      id: poamsTable.id,
      poamNumber: poamsTable.poamNumber,
      title: poamsTable.title,
      deficiencyDescription: poamsTable.deficiencyDescription,
      status: poamsTable.status,
      riskLevel: poamsTable.riskLevel,
      linkedControlLabel: controlsTable.controlId,
      ownerName: usersTable.name,
      scheduledCompletionDate: poamsTable.scheduledCompletionDate,
      completedDate: poamsTable.completedDate,
      remediationPlan: poamsTable.remediationPlan,
      createdAt: poamsTable.createdAt,
    })
    .from(poamsTable)
    .leftJoin(controlsTable, eq(controlsTable.id, poamsTable.linkedControlId))
    .leftJoin(usersTable, eq(usersTable.id, poamsTable.ownerId))
    .where(eq(poamsTable.organizationId, orgId))
    .orderBy(desc(poamsTable.createdAt));

  const withMeta = items.map(p => {
    const due = p.scheduledCompletionDate ? new Date(p.scheduledCompletionDate) : null;
    const isOverdue = due && due < now && p.status !== "closed";
    const isDueSoon = due && due >= now && due <= sevenDaysFromNow() && p.status !== "closed";
    return {
      ...p,
      daysOverdue: isOverdue ? Math.floor((now.getTime() - due.getTime()) / 86400000) : 0,
      isOverdue: !!isOverdue,
      isDueSoon: !!isDueSoon,
    };
  });

  const open = withMeta.filter(p => p.status !== "closed" && p.status !== "accepted_risk").length;
  const overdue = withMeta.filter(p => p.isOverdue).length;
  const closingSoon = withMeta.filter(p => p.isDueSoon).length;

  res.json({
    reportDate: new Date().toISOString(),
    summary: { total: items.length, open, overdue, closingSoon },
    items: withMeta,
  });
});

// ── 6. Monitoring Tracker Report ──────────────────────────────────────────────
router.get("/reports/monitoring", requireAuth, requireOrg, async (req, res) => {
  const orgId = req.orgId!;
  const now = new Date();

  const items = await db
    .select()
    .from(monitoringItemsTable)
    .where(eq(monitoringItemsTable.organizationId, orgId))
    .orderBy(monitoringItemsTable.sortOrder);

  const withMeta = items.map(m => {
    const due = m.nextDue ? new Date(m.nextDue) : null;
    const isOverdue = due && due < now && m.status !== "complete";
    const isDueSoon = due && due >= now && due <= sevenDaysFromNow() && m.status !== "complete";
    return {
      ...m,
      isOverdue: !!isOverdue,
      isDueSoon: !!isDueSoon,
    };
  });

  res.json({
    reportDate: new Date().toISOString(),
    summary: {
      total: items.length,
      overdue: withMeta.filter(m => m.isOverdue).length,
      dueSoon: withMeta.filter(m => m.isDueSoon).length,
      complete: withMeta.filter(m => m.status === "complete").length,
    },
    items: withMeta,
  });
});

// ── 7. Domain Readiness Report ────────────────────────────────────────────────
router.get("/reports/domain", requireAuth, requireOrg, async (req, res) => {
  const orgId = req.orgId!;

  const controls = await db
    .select({
      domainId: controlsTable.domainId,
      domainName: domainsTable.name,
      sortOrder: domainsTable.sortOrder,
      status: controlAssessmentsTable.status,
      level: controlsTable.level,
    })
    .from(controlsTable)
    .leftJoin(domainsTable, eq(domainsTable.id, controlsTable.domainId))
    .leftJoin(controlAssessmentsTable, and(
      eq(controlAssessmentsTable.controlId, controlsTable.id),
      eq(controlAssessmentsTable.organizationId, orgId),
    ));

  const domainMap = new Map<string, {
    domain: string;
    sortOrder: number;
    total: number;
    implemented: number;
    inProgress: number;
    notStarted: number;
    atRisk: number;
    l1: number;
    l2: number;
  }>();

  for (const c of controls) {
    const key = c.domainName ?? "Unknown";
    const e = domainMap.get(key) ?? { domain: key, sortOrder: c.sortOrder ?? 999, total: 0, implemented: 0, inProgress: 0, notStarted: 0, atRisk: 0, l1: 0, l2: 0 };
    e.total++;
    const s = c.status ?? "not_started";
    if (s === "implemented" || s === "assessor_ready") e.implemented++;
    else if (s === "in_progress" || s === "needs_review") e.inProgress++;
    else if (s === "at_risk") e.atRisk++;
    else e.notStarted++;
    if (c.level === "L1") e.l1++;
    else e.l2++;
    domainMap.set(key, e);
  }

  const domains = [...domainMap.values()]
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map(d => ({
      ...d,
      pct: d.total > 0 ? Math.round((d.implemented / d.total) * 100) : 0,
    }));

  res.json({ reportDate: new Date().toISOString(), domains });
});

// ── 8. Audit Readiness Report ─────────────────────────────────────────────────
router.get("/reports/audit", requireAuth, requireOrg, async (req, res) => {
  const orgId = req.orgId!;
  const now = new Date();

  const controls = await db
    .select({
      id: controlsTable.id,
      controlId: controlsTable.controlId,
      title: controlsTable.title,
      domainName: domainsTable.name,
      level: controlsTable.level,
      status: controlAssessmentsTable.status,
      implementationNarrative: controlAssessmentsTable.implementationNarrative,
    })
    .from(controlsTable)
    .leftJoin(domainsTable, eq(domainsTable.id, controlsTable.domainId))
    .leftJoin(controlAssessmentsTable, and(
      eq(controlAssessmentsTable.controlId, controlsTable.id),
      eq(controlAssessmentsTable.organizationId, orgId),
    ));

  // Evidence per control
  const evidenceLinks = await db
    .select({
      controlId: evidenceControlLinksTable.controlId,
      status: evidenceItemsTable.status,
      expiresAt: evidenceItemsTable.expiresAt,
    })
    .from(evidenceControlLinksTable)
    .innerJoin(evidenceItemsTable, and(
      eq(evidenceItemsTable.id, evidenceControlLinksTable.evidenceId),
      eq(evidenceItemsTable.organizationId, orgId),
      isNull(evidenceItemsTable.deletedAt),
    ));

  const evMap = new Map<string, typeof evidenceLinks>();
  for (const l of evidenceLinks) {
    const arr = evMap.get(l.controlId) ?? [];
    arr.push(l);
    evMap.set(l.controlId, arr);
  }

  // All org evidence
  const allEvidence = await db
    .select({ status: evidenceItemsTable.status, expiresAt: evidenceItemsTable.expiresAt, ownerId: evidenceItemsTable.ownerId })
    .from(evidenceItemsTable)
    .where(and(eq(evidenceItemsTable.organizationId, orgId), isNull(evidenceItemsTable.deletedAt)));

  const evidenceNotApproved = allEvidence.filter(e => e.status !== "approved" && e.status !== "assessor_ready").length;
  const evidenceMissingMetadata = allEvidence.filter(e => !e.expiresAt || !e.ownerId).length;

  // POA&Ms
  const openPoams = await db
    .select({ id: poamsTable.id })
    .from(poamsTable)
    .where(and(eq(poamsTable.organizationId, orgId), ne(poamsTable.status, "closed")));

  // Monitoring
  const monitoring = await db
    .select({ status: monitoringItemsTable.status, nextDue: monitoringItemsTable.nextDue })
    .from(monitoringItemsTable)
    .where(eq(monitoringItemsTable.organizationId, orgId));

  const overdueMonitoring = monitoring.filter(m => m.status !== "complete" && m.nextDue && new Date(m.nextDue) < now).length;

  // Control-level audit items
  const controlAudit = controls.map(c => {
    const ev = evMap.get(c.id) ?? [];
    const hasEvidence = ev.length > 0;
    const hasApproved = ev.some(e => e.status === "approved" || e.status === "assessor_ready");
    const hasNarrative = !!(c.implementationNarrative?.trim());
    const isReady = hasEvidence && hasApproved && hasNarrative && (c.status === "implemented" || c.status === "assessor_ready");

    return {
      controlId: c.controlId,
      title: c.title,
      domain: c.domainName ?? "Unknown",
      level: c.level,
      status: c.status ?? "not_started",
      hasEvidence,
      hasApproved,
      hasNarrative,
      isReady,
      issues: [
        !hasEvidence ? "No evidence linked" : null,
        hasEvidence && !hasApproved ? "No approved evidence" : null,
        !hasNarrative ? "Missing implementation narrative" : null,
        (!c.status || c.status === "not_started") ? "Control not started" : null,
      ].filter(Boolean),
    };
  });

  const fullyReady = controlAudit.filter(c => c.isReady).length;
  const missingEvidence = controlAudit.filter(c => !c.hasEvidence).length;
  const missingNarrative = controlAudit.filter(c => !c.hasNarrative).length;
  const notApproved = controlAudit.filter(c => c.hasEvidence && !c.hasApproved).length;

  const overallReadiness = controls.length > 0 ? Math.round((fullyReady / controls.length) * 100) : 0;

  res.json({
    reportDate: new Date().toISOString(),
    overallReadiness,
    summary: {
      totalControls: controls.length,
      fullyReady,
      missingEvidence,
      missingNarrative,
      notApprovedEvidence: notApproved,
      evidenceNotApproved,
      evidenceMissingMetadata,
      openPoams: openPoams.length,
      overdueMonitoring,
    },
    controls: controlAudit.filter(c => !c.isReady),
    readyControls: controlAudit.filter(c => c.isReady),
  });
});

// ── 9. SSP Summary Report ─────────────────────────────────────────────────────
router.get("/reports/ssp", requireAuth, requireOrg, async (req, res) => {
  const orgId = req.orgId!;

  const [primaryDoc] = await db
    .select()
    .from(sspDocumentsTable)
    .where(and(eq(sspDocumentsTable.organizationId, orgId), eq(sspDocumentsTable.isPrimary, true)))
    .limit(1);

  if (!primaryDoc) {
    return res.json({ reportDate: new Date().toISOString(), hasSSP: false });
  }

  const sections = await db
    .select()
    .from(sspSectionsTable)
    .where(eq(sspSectionsTable.sspDocumentId, primaryDoc.id))
    .orderBy(sspSectionsTable.sortOrder);

  const mappings = await db
    .select()
    .from(sspControlMappingsTable)
    .where(eq(sspControlMappingsTable.sspDocumentId, primaryDoc.id))
    .orderBy(sspControlMappingsTable.controlRef);

  const policies = mappings
    .filter(m => m.policyReference)
    .map(m => m.policyReference)
    .filter((v, i, a) => a.indexOf(v) === i);

  const missingNarratives = mappings.filter(m => !m.implementationNarrative?.trim());

  res.json({
    reportDate: new Date().toISOString(),
    hasSSP: true,
    doc: primaryDoc,
    sections: {
      total: sections.length,
      complete: sections.filter(s => s.isComplete).length,
      items: sections,
    },
    mappings: {
      total: mappings.length,
      withNarrative: mappings.filter(m => m.implementationNarrative?.trim()).length,
      missingNarrative: missingNarratives.length,
      edited: mappings.filter(m => m.isEdited).length,
      items: mappings,
    },
    policies,
  });
});

export default router;
