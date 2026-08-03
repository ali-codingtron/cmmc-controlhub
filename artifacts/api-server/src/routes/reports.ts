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
  organizationPackagesTable,
  compliancePackagesTable,
  complianceRequirementsTable,
} from "@workspace/db";
import { eq, and, desc, count, isNotNull, isNull, ne, lte, gte, sql, or, inArray } from "drizzle-orm";
import { requireAuth } from "../lib/auth";
import { requireOrg } from "../middleware/org";

const router = Router();

// ── Package-aware control filter ──────────────────────────────────────────────
// Returns an array of control DB IDs the org is actually responsible for,
// or null if there are no package restrictions (show all — legacy / no packages).
async function resolveOrgControlIds(orgId: string): Promise<string[] | null> {
  const orgPkgs = await db
    .select({ packageId: compliancePackagesTable.id, packageKey: compliancePackagesTable.packageKey })
    .from(organizationPackagesTable)
    .innerJoin(compliancePackagesTable, eq(organizationPackagesTable.packageId, compliancePackagesTable.id))
    .where(and(
      eq(organizationPackagesTable.organizationId, orgId),
      eq(organizationPackagesTable.isActive, true),
    ));

  if (orgPkgs.length === 0) return null; // no packages → show all

  const cmmcFarPkgIds = orgPkgs.filter(p => p.packageKey.startsWith("CMMC_") || p.packageKey === "FAR_52_204_21").map(p => p.packageId);
  const nistPkgIds = orgPkgs.filter(p => p.packageKey.startsWith("NIST_800_171_")).map(p => p.packageId);
  const mappedPkgIds = [...cmmcFarPkgIds, ...nistPkgIds];

  if (mappedPkgIds.length === 0) return null; // DFARS-only or non-control packages → show all

  const reqs = await db
    .select({ reqId: complianceRequirementsTable.requirementId, pkgId: complianceRequirementsTable.packageId })
    .from(complianceRequirementsTable)
    .where(inArray(complianceRequirementsTable.packageId, mappedPkgIds));

  if (reqs.length === 0) return null;

  const cmmcFarReqIds = reqs.filter(r => cmmcFarPkgIds.includes(r.pkgId)).map(r => r.reqId);
  const nistReqIds    = reqs.filter(r => nistPkgIds.includes(r.pkgId)).map(r => r.reqId);

  const matched = await db
    .selectDistinct({ id: controlsTable.id })
    .from(controlsTable)
    .where(and(
      eq(controlsTable.isActive, true),
      or(
        cmmcFarReqIds.length > 0 ? inArray(controlsTable.controlId, cmmcFarReqIds) : undefined,
        nistReqIds.length > 0    ? inArray(controlsTable.nistRef as any, nistReqIds) : undefined,
      ),
    ));

  return matched.map(c => c.id);
}

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
router.get("/reports/executive", requireAuth, requireOrg, async (req, res): Promise<void> => {
  const orgId = req.orgId!;

  const [org, packageControlIds] = await Promise.all([
    db.select({ name: organizationsTable.name, cmmcTargetLevel: organizationsTable.cmmcTargetLevel, legalName: organizationsTable.legalName, primaryContact: organizationsTable.primaryContact })
      .from(organizationsTable)
      .where(eq(organizationsTable.id, orgId))
      .limit(1)
      .then(r => r[0]),
    resolveOrgControlIds(orgId),
  ]);

  // Controls with assessment status — filtered to org's active packages
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
    ))
    .where(packageControlIds ? inArray(controlsTable.id, packageControlIds) : undefined);

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
  const monCurrent = monitoring.filter(m => m.status === "current").length;
  const monOverdue = monitoring.filter(m => {
    if (!m.nextDue) return false;
    return new Date(m.nextDue) < now;
  }).length;
  const monDueSoon = monitoring.filter(m => {
    if (!m.nextDue) return false;
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
    monitoring: { total: monTotal, current: monCurrent, overdue: monOverdue, dueSoon: monDueSoon },
    topRiskDomains,
  });
});

// ── 2. Gap Analysis Report ────────────────────────────────────────────────────
router.get("/reports/gap", requireAuth, requireOrg, async (req, res): Promise<void> => {
  const orgId = req.orgId!;

  const packageControlIds = await resolveOrgControlIds(orgId);

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
    .where(packageControlIds ? inArray(controlsTable.id, packageControlIds) : undefined)
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
router.get("/reports/controls", requireAuth, requireOrg, async (req, res): Promise<void> => {
  const orgId = req.orgId!;

  const packageControlIds = await resolveOrgControlIds(orgId);

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
    .where(packageControlIds ? inArray(controlsTable.id, packageControlIds) : undefined)
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
router.get("/reports/evidence", requireAuth, requireOrg, async (req, res): Promise<void> => {
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
router.get("/reports/poam", requireAuth, requireOrg, async (req, res): Promise<void> => {
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
router.get("/reports/monitoring", requireAuth, requireOrg, async (req, res): Promise<void> => {
  const orgId = req.orgId!;
  const now = new Date();

  const items = await db
    .select()
    .from(monitoringItemsTable)
    .where(eq(monitoringItemsTable.organizationId, orgId))
    .orderBy(monitoringItemsTable.sortOrder);

  const withMeta = items.map(m => {
    const due = m.nextDue ? new Date(m.nextDue) : null;
    const isOverdue = due && due < now;
    const isDueSoon = due && due >= now && due <= sevenDaysFromNow();
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
      current: withMeta.filter(m => m.status === "current").length,
    },
    items: withMeta,
  });
});

// ── 7. Domain Readiness & C3PAO Readiness Report ─────────────────────────────
router.get("/reports/domain", requireAuth, requireOrg, async (req, res): Promise<void> => {
  const orgId = req.orgId!;
  const now = new Date();

  const DOMAIN_CODE: Record<string, string> = {
    "Access Control": "AC", "Awareness and Training": "AT", "Audit and Accountability": "AU",
    "Configuration Management": "CM", "Identification and Authentication": "IA",
    "Incident Response": "IR", "Maintenance": "MA", "Media Protection": "MP",
    "Personnel Security": "PS", "Physical Protection": "PE", "Risk Assessment": "RA",
    "Security Assessment": "CA", "System and Communications Protection": "SC",
    "System and Information Integrity": "SI",
  };

  const packageControlIds = await resolveOrgControlIds(orgId);

  // Fetch all data in parallel
  const [
    orgResult,
    controlsRaw,
    evidenceLinksRaw,
    allEvidenceRaw,
    allPoamsRaw,
    monitoringRaw,
    sspResult,
  ] = await Promise.all([
    db.select({ name: organizationsTable.name, cmmcTargetLevel: organizationsTable.cmmcTargetLevel, legalName: organizationsTable.legalName })
      .from(organizationsTable).where(eq(organizationsTable.id, orgId)).limit(1),

    db.select({
      id: controlsTable.id,
      controlRef: controlsTable.controlId,
      title: controlsTable.title,
      domainId: controlsTable.domainId,
      domainName: domainsTable.name,
      sortOrder: domainsTable.sortOrder,
      level: controlsTable.level,
      status: controlAssessmentsTable.status,
      implementationNarrative: controlAssessmentsTable.implementationNarrative,
    })
    .from(controlsTable)
    .leftJoin(domainsTable, eq(domainsTable.id, controlsTable.domainId))
    .leftJoin(controlAssessmentsTable, and(
      eq(controlAssessmentsTable.controlId, controlsTable.id),
      eq(controlAssessmentsTable.organizationId, orgId),
    ))
    .where(packageControlIds
      ? and(eq(controlsTable.isActive, true), inArray(controlsTable.id, packageControlIds))
      : eq(controlsTable.isActive, true)),

    db.select({
      controlId: evidenceControlLinksTable.controlId,
      status: evidenceItemsTable.status,
      evidenceType: evidenceItemsTable.evidenceType,
      fileKey: evidenceItemsTable.fileKey,
      fileHash: evidenceItemsTable.fileHash,
    })
    .from(evidenceControlLinksTable)
    .innerJoin(evidenceItemsTable, and(
      eq(evidenceItemsTable.id, evidenceControlLinksTable.evidenceId),
      eq(evidenceItemsTable.organizationId, orgId),
      isNull(evidenceItemsTable.deletedAt),
    )),

    db.select({ status: evidenceItemsTable.status, fileKey: evidenceItemsTable.fileKey, fileHash: evidenceItemsTable.fileHash })
    .from(evidenceItemsTable)
    .where(and(eq(evidenceItemsTable.organizationId, orgId), isNull(evidenceItemsTable.deletedAt))),

    db.select({ status: poamsTable.status, linkedControlId: poamsTable.linkedControlId, scheduledCompletionDate: poamsTable.scheduledCompletionDate })
    .from(poamsTable)
    .where(eq(poamsTable.organizationId, orgId)),

    db.select({ status: monitoringItemsTable.status, nextDue: monitoringItemsTable.nextDue, controlRef: monitoringItemsTable.controlRef })
    .from(monitoringItemsTable)
    .where(eq(monitoringItemsTable.organizationId, orgId)),

    db.select({ id: sspDocumentsTable.id, title: sspDocumentsTable.title, revisionNumber: sspDocumentsTable.revisionNumber })
    .from(sspDocumentsTable)
    .where(and(eq(sspDocumentsTable.organizationId, orgId), eq(sspDocumentsTable.isPrimary, true)))
    .limit(1),
  ]);

  const org = orgResult[0];
  const ssp = sspResult[0];

  const sspMappings = ssp
    ? await db.select({ controlRef: sspControlMappingsTable.controlRef, implementationNarrative: sspControlMappingsTable.implementationNarrative })
        .from(sspControlMappingsTable).where(eq(sspControlMappingsTable.sspDocumentId, ssp.id))
    : [];

  // Evidence links map per control
  const evMapByControl = new Map<string, typeof evidenceLinksRaw>();
  for (const link of evidenceLinksRaw) {
    const arr = evMapByControl.get(link.controlId) ?? [];
    arr.push(link);
    evMapByControl.set(link.controlId, arr);
  }

  // Monitoring grouped by domain code
  const monByDomainCode = new Map<string, { current: number; overdue: number; total: number }>();
  for (const m of monitoringRaw) {
    const code = (m.controlRef ?? "").split(".")[0] ?? "XX";
    const e = monByDomainCode.get(code) ?? { current: 0, overdue: 0, total: 0 };
    e.total++;
    if (m.nextDue && new Date(m.nextDue) < now) e.overdue++;
    else if (m.status === "current") e.current++;
    monByDomainCode.set(code, e);
  }

  // Build control-id → domain name lookup from already-fetched controls
  const controlIdToDomainName = new Map<string, string>(
    controlsRaw.map(c => [c.id, c.domainName ?? "Unknown"])
  );

  // POA&Ms open by domain
  const poamsByDomain = new Map<string, number>();
  const openPoamTotal = allPoamsRaw.filter(p => p.status !== "closed" && p.status !== "accepted_risk").length;
  for (const p of allPoamsRaw) {
    if (p.status === "closed" || p.status === "accepted_risk") continue;
    const domain = (p.linkedControlId ? controlIdToDomainName.get(p.linkedControlId) : null) ?? "Unlinked";
    poamsByDomain.set(domain, (poamsByDomain.get(domain) ?? 0) + 1);
  }

  // Per-control aggregation
  const totalControls = controlsRaw.length;
  let implementedCount = 0, inProgressCount = 0, notStartedCount = 0, atRiskCount = 0;
  let controlsWithEvidence = 0, controlsWithApprovedEvidence = 0, controlsWithNarrative = 0;
  let controlsWithPolicyOrProc = 0;

  type DomainAccum = {
    name: string; code: string; sortOrder: number;
    implemented: number; inProgress: number; notStarted: number; atRisk: number; total: number;
    withEvidence: number; withApproved: number; withNarrative: number;
  };
  const domainAccum = new Map<string, DomainAccum>();
  const exceptions: { controlId: string; title: string; domain: string; issues: string[] }[] = [];

  for (const ctrl of controlsRaw) {
    const status = ctrl.status ?? "not_started";
    const hasNarrative = !!(ctrl.implementationNarrative?.trim());
    const links = evMapByControl.get(ctrl.id) ?? [];
    const hasEvidence = links.length > 0;
    const hasApproved = links.some(l => l.status === "approved" || l.status === "assessor_ready");
    const hasStale = links.some(l => l.status === "stale");
    const hasPolicyOrProc = links.some(l => l.evidenceType === "policy" || l.evidenceType === "procedure");
    if (status === "implemented" || status === "assessor_ready") implementedCount++;
    else if (status === "in_progress" || status === "needs_review") inProgressCount++;
    else if (status === "at_risk") atRiskCount++;
    else notStartedCount++;

    if (hasEvidence) controlsWithEvidence++;
    if (hasApproved) controlsWithApprovedEvidence++;
    if (hasNarrative) controlsWithNarrative++;
    if (hasPolicyOrProc) controlsWithPolicyOrProc++;

    const domainName = ctrl.domainName ?? "Unknown";
    const code = DOMAIN_CODE[domainName] ?? domainName.split(" ").map(w => w[0]).join("");
    const acc = domainAccum.get(domainName) ?? { name: domainName, code, sortOrder: ctrl.sortOrder ?? 999, implemented: 0, inProgress: 0, notStarted: 0, atRisk: 0, total: 0, withEvidence: 0, withApproved: 0, withNarrative: 0 };
    acc.total++;
    if (status === "implemented" || status === "assessor_ready") acc.implemented++;
    else if (status === "in_progress" || status === "needs_review") acc.inProgress++;
    else if (status === "at_risk") acc.atRisk++;
    else acc.notStarted++;
    if (hasEvidence) acc.withEvidence++;
    if (hasApproved) acc.withApproved++;
    if (hasNarrative) acc.withNarrative++;
    domainAccum.set(domainName, acc);

    const issues: string[] = [];
    if (!hasEvidence) issues.push("No evidence linked");
    else if (!hasApproved) issues.push("No approved evidence");
    if (!hasNarrative) issues.push("Missing SSP narrative");
    if (hasStale) issues.push("Stale evidence present");
    if (status === "at_risk") issues.push("Control marked At Risk");
    if (issues.length > 0) exceptions.push({ controlId: ctrl.controlRef, title: ctrl.title ?? ctrl.controlRef, domain: domainName, issues });
  }

  // Evidence integrity stats
  const totalEvidence = allEvidenceRaw.length;
  const evWithFile = allEvidenceRaw.filter(e => !!e.fileKey).length;
  const evWithHash = allEvidenceRaw.filter(e => !!e.fileHash).length;
  const evStale = allEvidenceRaw.filter(e => e.status === "stale").length;
  const evApproved = allEvidenceRaw.filter(e => e.status === "approved" || e.status === "assessor_ready").length;
  const evPending = allEvidenceRaw.filter(e => e.status === "pending_review").length;
  const evMissingHash = allEvidenceRaw.filter(e => !!e.fileKey && !e.fileHash).length;

  // Projected CMMC Score
  const maxScore = totalControls; // scoped to org's active package, not a hard-coded 110
  const notMet = notStartedCount + atRiskCount;
  const projectedScore = Math.max(0, maxScore - notMet);

  // Audit Confidence Score — 100 pts, compliance-focused only (no hash/archive factors)
  // c1(25) implemented controls · c2(20) approved evidence · c3(15) evidence coverage
  // c4(15) SSP narrative · c5(10) policy/procedure · c6(5) fresh evidence
  // c7(5) monitoring current · c8(5) POA&M status
  const monitoringTotal = monitoringRaw.length;
  const monitoringOverdue = monitoringRaw.filter(m => m.nextDue && new Date(m.nextDue) < now).length;
  const stalePct = totalEvidence > 0 ? evStale / totalEvidence : 0;
  const c1 = totalControls > 0 ? Math.round((implementedCount / totalControls) * 25) : 0;
  const c2 = totalControls > 0 ? Math.round((controlsWithApprovedEvidence / totalControls) * 20) : 0;
  const c3 = totalControls > 0 ? Math.round((controlsWithEvidence / totalControls) * 15) : 0;
  const c4 = totalControls > 0 ? Math.round((controlsWithNarrative / totalControls) * 15) : 0;
  const c5 = totalControls > 0 ? Math.round((controlsWithPolicyOrProc / totalControls) * 10) : 0;
  const c6 = Math.round((1 - stalePct) * 5);
  const c7 = monitoringTotal > 0 ? Math.round(((monitoringTotal - monitoringOverdue) / monitoringTotal) * 5) : 5;
  const c8 = openPoamTotal === 0 ? 5 : openPoamTotal <= 5 ? 3 : openPoamTotal <= 10 ? 1 : 0;
  const auditConfidence = c1 + c2 + c3 + c4 + c5 + c6 + c7 + c8;
  const auditRating = auditConfidence >= 90 ? "Strong" : auditConfidence >= 75 ? "Moderate" : auditConfidence >= 50 ? "Needs Work" : "High Risk";

  // Domain rows
  const domains = [...domainAccum.values()]
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map(d => {
      const readinessPct = d.total > 0 ? Math.round((d.implemented / d.total) * 100) : 0;
      const evidenceQualityPct = d.total > 0 ? Math.round((d.withApproved / d.total) * 100) : 0;
      const sspCoveragePct = d.total > 0 ? Math.round((d.withNarrative / d.total) * 100) : 0;
      const monData = monByDomainCode.get(d.code);
      const monitoringStatus = !monData ? "no_data" : monData.overdue > 0 ? "overdue" : "current";
      const openPoams = poamsByDomain.get(d.name) ?? 0;
      const riskRating = readinessPct >= 90 ? "low" : readinessPct >= 75 ? "medium" : readinessPct >= 50 ? "high" : "critical";
      const nextAction = d.notStarted > 0
        ? `Start ${d.notStarted} not-started control${d.notStarted > 1 ? "s" : ""}`
        : d.withApproved < d.total
        ? `Approve evidence for ${d.total - d.withApproved} control${(d.total - d.withApproved) > 1 ? "s" : ""}`
        : d.withNarrative < d.total
        ? `Add SSP narrative for ${d.total - d.withNarrative} control${(d.total - d.withNarrative) > 1 ? "s" : ""}`
        : "Review evidence expiration dates";
      return { domainCode: d.code, domainName: d.name, implemented: d.implemented, inProgress: d.inProgress, notStarted: d.notStarted, atRisk: d.atRisk, total: d.total, readinessPct, evidenceQualityPct, sspCoveragePct, monitoringStatus, openPoams, riskRating, nextAction };
    });

  const domainsReady = domains.filter(d => d.readinessPct === 100).length;
  const monitoringGaps = monitoringTotal > 0 ? monitoringOverdue : 0;
  const overallReadinessPct = totalControls > 0 ? Math.round((implementedCount / totalControls) * 100) : 0;
  const overallStatus = overallReadinessPct >= 95 && openPoamTotal === 0 && monitoringOverdue === 0
    ? "C3PAO Ready" : overallReadinessPct >= 75 ? "In Progress" : "At Risk";

  const sspMappingsWithNarrative = sspMappings.filter(m => m.implementationNarrative?.trim()).length;

  const c3paoChecklist = [
    { item: "SSP uploaded and versioned", status: ssp ? "complete" : "missing" as const, count: ssp ? 1 : 0, total: 1, notes: ssp ? `${ssp.title} · rev ${ssp.revisionNumber ?? "1.0"}` : "No SSP document uploaded", link: "/ssp/documents" },
    { item: "SSP mapped to controls", status: (sspMappingsWithNarrative >= totalControls * 0.8 ? "complete" : sspMappings.length > 0 ? "partial" : "missing") as "complete" | "partial" | "missing", count: sspMappingsWithNarrative, total: totalControls, notes: `${sspMappingsWithNarrative} of ${totalControls} controls have SSP narrative`, link: "/ssp/sections" },
    { item: "Evidence mapped to controls", status: (controlsWithEvidence >= totalControls * 0.9 ? "complete" : controlsWithEvidence > 0 ? "partial" : "missing") as "complete" | "partial" | "missing", count: controlsWithEvidence, total: totalControls, notes: `${controlsWithEvidence} of ${totalControls} controls covered`, link: "/evidence" },
    { item: "Evidence approved", status: (controlsWithApprovedEvidence >= totalControls * 0.9 ? "complete" : controlsWithApprovedEvidence > 0 ? "partial" : "missing") as "complete" | "partial" | "missing", count: controlsWithApprovedEvidence, total: totalControls, notes: `${controlsWithApprovedEvidence} of ${totalControls} controls have approved evidence`, link: "/evidence" },
    { item: "POA&M reviewed", status: (openPoamTotal === 0 ? "complete" : openPoamTotal <= 5 ? "partial" : "missing") as "complete" | "partial" | "missing", count: 0, total: openPoamTotal, notes: openPoamTotal === 0 ? "No open POA&M items" : `${openPoamTotal} open items require attention`, link: "/poams" },
    { item: "Monitoring tracker current", status: (monitoringOverdue === 0 ? "complete" : monitoringOverdue <= 3 ? "partial" : "missing") as "complete" | "partial" | "missing", count: monitoringTotal - monitoringOverdue, total: monitoringTotal, notes: monitoringOverdue === 0 ? "All monitoring tasks current" : `${monitoringOverdue} overdue tasks`, link: "/monitoring" },
  ];

  res.json({
    reportDate: new Date().toISOString(),
    org: { name: org?.name ?? "Unknown", cmmcTargetLevel: org?.cmmcTargetLevel ?? "Level 2", legalName: org?.legalName ?? null },
    executiveSummary: {
      overallReadinessPct, overallStatus,
      controlsReady: implementedCount, totalControls,
      domainsReady, totalDomains: domains.length,
      openPoams: openPoamTotal,
      evidenceGaps: totalControls - controlsWithEvidence,
      monitoringGaps,
    },
    projectedScore: { max: maxScore, score: projectedScore, loss: maxScore - projectedScore, notMet, openPoams: openPoamTotal },
    auditConfidence: {
      score: auditConfidence, rating: auditRating,
      breakdown: { implementedControls: c1, approvedEvidence: c2, evidenceCoverage: c3, sspNarrative: c4, policyProcedure: c5, freshEvidence: c6, monitoringCurrent: c7, poamStatus: c8 },
    },
    c3paoChecklist,
    domains,
    evidenceIntegrity: { total: totalEvidence, withFile: evWithFile, withHash: evWithHash, missingHash: evMissingHash, stale: evStale, approved: evApproved, pendingReview: evPending },
    exceptions: exceptions.slice(0, 60),
    poamSummary: {
      open: openPoamTotal,
      overdue: allPoamsRaw.filter(p => p.status !== "closed" && p.scheduledCompletionDate && new Date(p.scheduledCompletionDate) < now).length,
      scoreImpact: notMet,
    },
    monitoringSummary: {
      total: monitoringTotal,
      current: monitoringRaw.filter(m => m.status === "current").length,
      overdue: monitoringOverdue,
      dueSoon: monitoringRaw.filter(m => m.nextDue && new Date(m.nextDue) >= now && new Date(m.nextDue) <= new Date(Date.now() + 7 * 86400000)).length,
    },
    ssp: ssp ? { title: ssp.title, version: ssp.revisionNumber ?? null, mappingsCount: sspMappings.length, mappingsWithNarrative: sspMappingsWithNarrative } : null,
  });
});

// ── 8. Audit Readiness Report ─────────────────────────────────────────────────
router.get("/reports/audit", requireAuth, requireOrg, async (req, res): Promise<void> => {
  const orgId = req.orgId!;
  const now = new Date();

  const packageControlIds = await resolveOrgControlIds(orgId);

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
    ))
    .where(packageControlIds ? inArray(controlsTable.id, packageControlIds) : undefined);

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

  const overdueMonitoring = monitoring.filter(m => m.nextDue && new Date(m.nextDue) < now).length;

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
router.get("/reports/ssp", requireAuth, requireOrg, async (req, res): Promise<void> => {
  const orgId = req.orgId!;

  const [primaryDoc] = await db
    .select()
    .from(sspDocumentsTable)
    .where(and(eq(sspDocumentsTable.organizationId, orgId), eq(sspDocumentsTable.isPrimary, true)))
    .limit(1);

  if (!primaryDoc) {
    return void res.json({ reportDate: new Date().toISOString(), hasSSP: false });
  }

  const sections = await db
    .select()
    .from(sspSectionsTable)
    .where(eq(sspSectionsTable.sspDocumentId, primaryDoc.id))
    .orderBy(sspSectionsTable.sortOrder);

  const mappings = await db
    .select({
      id: sspControlMappingsTable.id,
      controlRef: sspControlMappingsTable.controlRef,
      controlDbId: sspControlMappingsTable.controlDbId,
      implementationNarrative: sspControlMappingsTable.implementationNarrative,
      policyReference: sspControlMappingsTable.policyReference,
      isEdited: sspControlMappingsTable.isEdited,
      controlStatus: sql<string | null>`${controlAssessmentsTable.status}`,
    })
    .from(sspControlMappingsTable)
    .leftJoin(
      controlAssessmentsTable,
      and(
        sql`${sspControlMappingsTable.controlDbId} = ${controlAssessmentsTable.controlId}`,
        eq(controlAssessmentsTable.organizationId, orgId),
      )
    )
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
