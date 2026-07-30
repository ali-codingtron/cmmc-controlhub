import { Router } from "express";
import {
  db,
  controlsTable,
  controlAssessmentsTable,
  domainsTable,
  evidenceItemsTable,
  evidenceControlLinksTable,
  tasksTable,
  poamsTable,
  auditLogsTable,
  usersTable,
  monitoringItemsTable,
  documentsTable,
  roadmapActionsTable,
  orgRoadmapProgressTable,
  dfarsObligationsTable,
  dfarsObligationStatusTable,
  organizationPackagesTable,
  compliancePackagesTable,
  complianceRequirementsTable,
} from "@workspace/db";
import { eq, and, or, count, lte, gte, desc, sql, isNotNull, isNull, inArray, like } from "drizzle-orm";
import { requireAuth } from "../lib/auth";
import { requireOrg } from "../middleware/org";
import { resolveOrgRoadmapProfile } from "../lib/roadmap-profile";

const router = Router();

/**
 * Resolve the set of control IDs that apply to this org based on its active packages.
 * Mirrors the same logic used in GET /controls.
 * Returns null when no restriction applies (show all controls).
 */
async function resolveOrgControlIds(orgId: string): Promise<string[] | null> {
  const orgPkgs = await db
    .select({ packageId: compliancePackagesTable.id, packageKey: compliancePackagesTable.packageKey })
    .from(organizationPackagesTable)
    .innerJoin(compliancePackagesTable, eq(organizationPackagesTable.packageId, compliancePackagesTable.id))
    .where(and(eq(organizationPackagesTable.organizationId, orgId), eq(organizationPackagesTable.isActive, true)));

  if (!orgPkgs.length) return null;

  const cmmcFarPkgIds = orgPkgs
    .filter(p => p.packageKey.startsWith("CMMC_") || p.packageKey === "FAR_52_204_21")
    .map(p => p.packageId);
  const nistPkgIds = orgPkgs
    .filter(p => p.packageKey.startsWith("NIST_800_171_"))
    .map(p => p.packageId);
  const mappedPkgIds = [...cmmcFarPkgIds, ...nistPkgIds];

  if (!mappedPkgIds.length) return null; // DFARS-only or unknown package types

  const reqs = await db
    .select({ reqId: complianceRequirementsTable.requirementId, pkgId: complianceRequirementsTable.packageId })
    .from(complianceRequirementsTable)
    .where(inArray(complianceRequirementsTable.packageId, mappedPkgIds));

  if (!reqs.length) return null;

  const cmmcFarReqIds = reqs.filter(r => cmmcFarPkgIds.includes(r.pkgId)).map(r => r.reqId);
  const nistReqIds = reqs.filter(r => nistPkgIds.includes(r.pkgId)).map(r => r.reqId);

  const matched = await db
    .selectDistinct({ id: controlsTable.id })
    .from(controlsTable)
    .where(
      and(
        eq(controlsTable.isActive, true),
        or(
          cmmcFarReqIds.length > 0 ? inArray(controlsTable.controlId, cmmcFarReqIds) : undefined,
          nistReqIds.length > 0 ? inArray(controlsTable.nistRef as any, nistReqIds) : undefined
        )
      )
    );

  return matched.map(c => c.id);
}

router.get("/dashboard/summary", requireAuth, requireOrg, async (req, res) => {
  const orgId = req.orgId;

  // Resolve which controls are in scope for this org's packages (e.g. CMMC L1 = 17 controls)
  const packageControlIds = orgId ? await resolveOrgControlIds(orgId) : null;
  const controlFilter = and(
    eq(controlsTable.isActive, true),
    packageControlIds ? inArray(controlsTable.id, packageControlIds) : undefined
  );

  const [controlStats] = await db
    .select({ total: count() })
    .from(controlsTable)
    .where(controlFilter);

  const assessmentStats = await db
    .select({
      status: controlAssessmentsTable.status,
      level: controlsTable.level,
      cnt: count(),
    })
    .from(controlAssessmentsTable)
    .innerJoin(controlsTable, eq(controlsTable.id, controlAssessmentsTable.controlId))
    .where(
      and(
        orgId ? eq(controlAssessmentsTable.organizationId, orgId) : undefined,
        packageControlIds ? inArray(controlsTable.id, packageControlIds) : undefined
      )
    )
    .groupBy(controlAssessmentsTable.status, controlsTable.level);

  const [evidenceStats] = await db
    .select({ total: count() })
    .from(evidenceItemsTable)
    .where(and(sql`deleted_at IS NULL`, orgId ? eq(evidenceItemsTable.organizationId, orgId) : undefined));

  const evidenceByStatus = await db
    .select({ status: evidenceItemsTable.status, cnt: count() })
    .from(evidenceItemsTable)
    .where(and(sql`deleted_at IS NULL`, orgId ? eq(evidenceItemsTable.organizationId, orgId) : undefined))
    .groupBy(evidenceItemsTable.status);

  const [taskStats] = await db
    .select({ total: count() })
    .from(tasksTable)
    .where(
      and(
        or(eq(tasksTable.status, "open"), eq(tasksTable.status, "in_progress"), eq(tasksTable.status, "overdue")),
        orgId ? eq(tasksTable.organizationId, orgId) : undefined
      )
    );

  const [overdueTaskStats] = await db
    .select({ total: count() })
    .from(tasksTable)
    .where(
      and(
        or(eq(tasksTable.status, "open"), eq(tasksTable.status, "in_progress")),
        lte(tasksTable.dueDate, new Date()),
        orgId ? eq(tasksTable.organizationId, orgId) : undefined
      )
    );

  const [openPoamStats] = await db
    .select({ total: count() })
    .from(poamsTable)
    .where(
      and(
        or(eq(poamsTable.status, "open"), eq(poamsTable.status, "in_progress")),
        orgId ? eq(poamsTable.organizationId, orgId) : undefined
      )
    );

  const [overduePoamStats] = await db
    .select({ total: count() })
    .from(poamsTable)
    .where(
      and(
        or(eq(poamsTable.status, "open"), eq(poamsTable.status, "in_progress")),
        lte(poamsTable.scheduledCompletionDate, new Date()),
        orgId ? eq(poamsTable.organizationId, orgId) : undefined
      )
    );

  const [criticalPoamStats] = await db
    .select({ total: count() })
    .from(poamsTable)
    .where(
      and(
        or(eq(poamsTable.status, "open"), eq(poamsTable.status, "in_progress")),
        eq(poamsTable.riskLevel, "critical"),
        orgId ? eq(poamsTable.organizationId, orgId) : undefined
      )
    );

  // Use DATE-only comparison to avoid timestamp vs midnight-UTC mismatch.
  // Items due today are NOT overdue; only strictly-past dates count.
  // Status is NOT excluded — if nextDue passed, the item needs redoing regardless.
  const [monitoringOverdueStats] = await db
    .select({ total: count() })
    .from(monitoringItemsTable)
    .where(
      and(
        orgId ? eq(monitoringItemsTable.organizationId, orgId) : undefined,
        sql`${monitoringItemsTable.nextDue} IS NOT NULL`,
        sql`DATE(${monitoringItemsTable.nextDue}) < CURRENT_DATE`
      )
    );

  // Due-soon counts ALL items whose next cycle falls within 7 days — including
  // 'current' ones, because monitoring tasks recur and the upcoming cycle matters.
  const [monitoringDueSoonStats] = await db
    .select({ total: count() })
    .from(monitoringItemsTable)
    .where(
      and(
        orgId ? eq(monitoringItemsTable.organizationId, orgId) : undefined,
        sql`${monitoringItemsTable.nextDue} IS NOT NULL`,
        sql`DATE(${monitoringItemsTable.nextDue}) >= CURRENT_DATE`,
        sql`DATE(${monitoringItemsTable.nextDue}) <= CURRENT_DATE + INTERVAL '7 days'`
      )
    );

  // Current = status 'current' AND not overdue (past-due items display as "Overdue")
  const [monitoringCurrentStats] = await db
    .select({ total: count() })
    .from(monitoringItemsTable)
    .where(
      and(
        orgId ? eq(monitoringItemsTable.organizationId, orgId) : undefined,
        eq(monitoringItemsTable.status, "current"),
        sql`(${monitoringItemsTable.nextDue} IS NULL OR DATE(${monitoringItemsTable.nextDue}) >= CURRENT_DATE)`
      )
    );

  const [monitoringTotalStats] = await db
    .select({ total: count() })
    .from(monitoringItemsTable)
    .where(orgId ? eq(monitoringItemsTable.organizationId, orgId) : undefined);

  // Controls with at least one approved evidence item linked
  const [controlsWithApprovedEvidenceStats] = await db
    .select({ total: count(sql`DISTINCT ${evidenceControlLinksTable.controlId}`) })
    .from(evidenceControlLinksTable)
    .innerJoin(evidenceItemsTable, eq(evidenceItemsTable.id, evidenceControlLinksTable.evidenceId))
    .where(
      and(
        sql`${evidenceItemsTable.deletedAt} IS NULL`,
        eq(evidenceItemsTable.status, "approved"),
        orgId ? eq(evidenceItemsTable.organizationId, orgId) : undefined
      )
    );

  // Controls with an implementation narrative
  const [controlsWithNarrativeStats] = await db
    .select({ total: count() })
    .from(controlAssessmentsTable)
    .where(
      and(
        orgId ? eq(controlAssessmentsTable.organizationId, orgId) : undefined,
        isNotNull(controlAssessmentsTable.implementationNarrative),
        sql`${controlAssessmentsTable.implementationNarrative} != ''`
      )
    );

  // Active policy / procedure counts
  const docsByType = await db
    .select({ docType: documentsTable.docType, status: documentsTable.status, cnt: count() })
    .from(documentsTable)
    .where(orgId ? eq(documentsTable.organizationId, orgId) : sql`1=1`)
    .groupBy(documentsTable.docType, documentsTable.status);

  const activePolicies = docsByType
    .filter((d) => d.docType === "policy" && d.status === "active")
    .reduce((sum, d) => sum + Number(d.cnt), 0);
  const activeProcedures = docsByType
    .filter((d) => d.docType === "procedure" && d.status === "active")
    .reduce((sum, d) => sum + Number(d.cnt), 0);

  const totalControls = Number(controlStats?.total ?? 0);
  const implemented = assessmentStats
    .filter((s) => s.status === "implemented" || s.status === "assessor_ready")
    .reduce((sum, s) => sum + Number(s.cnt), 0);
  const assessorReady = assessmentStats
    .filter((s) => s.status === "assessor_ready")
    .reduce((sum, s) => sum + Number(s.cnt), 0);
  const notStarted = totalControls - assessmentStats.reduce((sum, s) => sum + Number(s.cnt), 0);
  const atRisk = assessmentStats
    .filter((s) => s.status === "at_risk")
    .reduce((sum, s) => sum + Number(s.cnt), 0);

  const l1AssessedTotal = assessmentStats.filter((s) => s.level === "L1").reduce((sum, s) => sum + Number(s.cnt), 0);
  const l1Implemented = assessmentStats
    .filter((s) => (s.status === "implemented" || s.status === "assessor_ready") && s.level === "L1")
    .reduce((sum, s) => sum + Number(s.cnt), 0);
  const l2AssessedTotal = assessmentStats.filter((s) => s.level === "L2").reduce((sum, s) => sum + Number(s.cnt), 0);
  const l2Implemented = assessmentStats
    .filter((s) => (s.status === "implemented" || s.status === "assessor_ready") && s.level === "L2")
    .reduce((sum, s) => sum + Number(s.cnt), 0);

  const [l1ControlCount] = await db.select({ cnt: count() }).from(controlsTable).where(and(eq(controlsTable.isActive, true), eq(controlsTable.level, "L1")));
  const [l2ControlCount] = await db.select({ cnt: count() }).from(controlsTable).where(and(eq(controlsTable.isActive, true), eq(controlsTable.level, "L2")));
  const l1Total = Number(l1ControlCount?.cnt ?? 0);
  const l2Total = Number(l2ControlCount?.cnt ?? 0);

  const totalEvidence = Number(evidenceStats?.total ?? 0);
  const approvedEvidence = evidenceByStatus.find((e) => e.status === "approved");
  const staleEvidence = evidenceByStatus.find((e) => e.status === "stale");
  const pendingReview = evidenceByStatus.find((e) => e.status === "pending_review");

  // ── Roadmap stats — scoped to org's assigned profile ─────────────────────────
  const roadmapProfileKey = orgId ? await resolveOrgRoadmapProfile(orgId) : null;

  // Get the set of action IDs that belong to this org's profile
  let profileActionIds: string[] = [];
  if (roadmapProfileKey) {
    const profileFilter =
      roadmapProfileKey === "CMMC_L2_R2"
        ? or(
            eq(roadmapActionsTable.profileKey, "CMMC_L2_R2"),
            isNull(roadmapActionsTable.profileKey)
          )
        : eq(roadmapActionsTable.profileKey, roadmapProfileKey);

    const profileRows = await db
      .select({ id: roadmapActionsTable.id })
      .from(roadmapActionsTable)
      .where(profileFilter);
    profileActionIds = profileRows.map((r) => r.id);
  }

  const roadmapTotalActions = profileActionIds.length;

  const [roadmapCompleteStats] =
    orgId && profileActionIds.length > 0
      ? await db
          .select({ total: count() })
          .from(orgRoadmapProgressTable)
          .where(
            and(
              eq(orgRoadmapProgressTable.organizationId, orgId),
              inArray(orgRoadmapProgressTable.actionId, profileActionIds),
              eq(orgRoadmapProgressTable.status, "complete")
            )
          )
      : [{ total: 0 }];

  const [roadmapInProgressStats] =
    orgId && profileActionIds.length > 0
      ? await db
          .select({ total: count() })
          .from(orgRoadmapProgressTable)
          .where(
            and(
              eq(orgRoadmapProgressTable.organizationId, orgId),
              inArray(orgRoadmapProgressTable.actionId, profileActionIds),
              or(
                eq(orgRoadmapProgressTable.status, "in_progress"),
                eq(orgRoadmapProgressTable.status, "evidence_needed"),
                eq(orgRoadmapProgressTable.status, "ready_for_review")
              )
            )
          )
      : [{ total: 0 }];

  const [roadmapBlockedStats] =
    orgId && profileActionIds.length > 0
      ? await db
          .select({ total: count() })
          .from(orgRoadmapProgressTable)
          .where(
            and(
              eq(orgRoadmapProgressTable.organizationId, orgId),
              inArray(orgRoadmapProgressTable.actionId, profileActionIds),
              eq(orgRoadmapProgressTable.status, "blocked")
            )
          )
      : [{ total: 0 }];

  // DFARS obligation coverage — only populated when org has active DFARS packages
  let dfarsTotal = 0, dfarsCompliant = 0, dfarsGap = 0, dfarsInProgress = 0;
  if (orgId) {
    const dfarsPackageIds = await db
      .select({ packageId: organizationPackagesTable.packageId })
      .from(organizationPackagesTable)
      .innerJoin(compliancePackagesTable, eq(organizationPackagesTable.packageId, compliancePackagesTable.id))
      .where(and(
        eq(organizationPackagesTable.organizationId, orgId),
        eq(organizationPackagesTable.isActive, true),
        like(compliancePackagesTable.packageKey, "DFARS_%")
      ));

    if (dfarsPackageIds.length > 0) {
      const pkgIds = dfarsPackageIds.map(p => p.packageId);

      const [dfarsCountRow] = await db
        .select({ cnt: count() })
        .from(dfarsObligationsTable)
        .where(inArray(dfarsObligationsTable.packageId, pkgIds));

      const dfarsStatusRows = await db
        .select({ status: dfarsObligationStatusTable.status, cnt: count() })
        .from(dfarsObligationStatusTable)
        .innerJoin(dfarsObligationsTable, eq(dfarsObligationStatusTable.obligationId, dfarsObligationsTable.id))
        .where(and(
          eq(dfarsObligationStatusTable.organizationId, orgId),
          inArray(dfarsObligationsTable.packageId, pkgIds)
        ))
        .groupBy(dfarsObligationStatusTable.status);

      dfarsTotal = Number(dfarsCountRow?.cnt ?? 0);
      for (const row of dfarsStatusRows) {
        if (row.status === "compliant") dfarsCompliant = Number(row.cnt);
        else if (row.status === "gap") dfarsGap = Number(row.cnt);
        else if (row.status === "in_progress") dfarsInProgress = Number(row.cnt);
      }
    }
  }

  res.json({
    overallReadinessPercent: totalControls > 0 ? Math.round((implemented / totalControls) * 100) : 0,
    l1ReadinessPercent: l1Total > 0 ? Math.round((l1Implemented / l1Total) * 100) : 0,
    l2ReadinessPercent: l2Total > 0 ? Math.round((l2Implemented / l2Total) * 100) : 0,
    totalControls,
    implementedControls: implemented,
    assessorReadyControls: assessorReady,
    notStartedControls: notStarted < 0 ? 0 : notStarted,
    atRiskControls: atRisk,
    totalEvidenceItems: totalEvidence,
    approvedEvidenceItems: Number(approvedEvidence?.cnt ?? 0),
    staleEvidenceItems: Number(staleEvidence?.cnt ?? 0),
    pendingReviewItems: Number(pendingReview?.cnt ?? 0),
    openTasks: Number(taskStats?.total ?? 0),
    overdueTasks: Number(overdueTaskStats?.total ?? 0),
    openPoams: Number(openPoamStats?.total ?? 0),
    overduePoams: Number(overduePoamStats?.total ?? 0),
    criticalPoams: Number(criticalPoamStats?.total ?? 0),
    monitoringOverdue: Number(monitoringOverdueStats?.total ?? 0),
    monitoringDueSoon: Number(monitoringDueSoonStats?.total ?? 0),
    monitoringCurrent: Number(monitoringCurrentStats?.total ?? 0),
    monitoringTotal: Number(monitoringTotalStats?.total ?? 0),
    controlsWithNoEvidence: 0,
    controlsWithNoPolicy: 0,
    controlsWithNoProcedure: 0,
    controlsWithApprovedEvidence: Number(controlsWithApprovedEvidenceStats?.total ?? 0),
    controlsWithNarrative: Number(controlsWithNarrativeStats?.total ?? 0),
    activePolicies,
    activeProcedures,
    roadmapTotalActions,
    roadmapCompleteActions: Number(roadmapCompleteStats?.total ?? 0),
    roadmapInProgressActions: Number(roadmapInProgressStats?.total ?? 0),
    roadmapBlockedActions: Number(roadmapBlockedStats?.total ?? 0),
    dfarsTotal,
    dfarsCompliant,
    dfarsGap,
    dfarsInProgress,
  });
});

// Standard CMMC domain abbreviations keyed by full name
const DOMAIN_CODE_MAP: Record<string, string> = {
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

router.get("/dashboard/readiness-by-domain", requireAuth, requireOrg, async (req, res) => {
  const orgId = req.orgId;

  const packageControlIds = orgId ? await resolveOrgControlIds(orgId) : null;
  const controlFilter = and(
    eq(controlsTable.isActive, true),
    packageControlIds ? inArray(controlsTable.id, packageControlIds) : undefined
  );

  const domains = await db.select().from(domainsTable).orderBy(domainsTable.sortOrder);

  const assessments = await db
    .select({
      domainId: controlsTable.domainId,
      status: controlAssessmentsTable.status,
      cnt: count(),
    })
    .from(controlsTable)
    .leftJoin(
      controlAssessmentsTable,
      and(
        eq(controlAssessmentsTable.controlId, controlsTable.id),
        orgId ? eq(controlAssessmentsTable.organizationId, orgId) : undefined
      )
    )
    .where(controlFilter)
    .groupBy(controlsTable.domainId, controlAssessmentsTable.status);

  const totalByDomain = await db
    .select({ domainId: controlsTable.domainId, cnt: count() })
    .from(controlsTable)
    .where(controlFilter)
    .groupBy(controlsTable.domainId);

  const result = domains
    .filter((d) => {
      return (totalByDomain.find((t) => t.domainId === d.id)?.cnt ?? 0) > 0;
    })
    .map((d) => {
      const domainAssessments = assessments.filter((a) => a.domainId === d.id);
      const total = Number(totalByDomain.find((t) => t.domainId === d.id)?.cnt ?? 0);
      const readyControls = domainAssessments
        .filter((a) => a.status === "implemented" || a.status === "assessor_ready")
        .reduce((sum, a) => sum + Number(a.cnt), 0);
      const code = DOMAIN_CODE_MAP[d.name] ?? d.name.split(" ").map((w) => w[0]).join("");
      return {
        domainId: d.id,
        domainCode: code,
        domainName: d.name,
        readyControls,
        totalControls: total,
        readinessPercent: total > 0 ? Math.round((readyControls / total) * 100) : 0,
        id: d.id,
        name: d.name,
        implementedControls: readyControls,
      };
    });

  res.json(result);
});

router.get("/dashboard/missing-evidence", requireAuth, requireOrg, async (req, res) => {
  const orgId = req.orgId;

  const controlsWithEvidence = await db
    .select({ controlId: evidenceControlLinksTable.controlId })
    .from(evidenceControlLinksTable)
    .innerJoin(evidenceItemsTable, eq(evidenceItemsTable.id, evidenceControlLinksTable.evidenceId))
    .where(orgId ? eq(evidenceItemsTable.organizationId, orgId) : undefined)
    .groupBy(evidenceControlLinksTable.controlId);

  const coveredIds = new Set(controlsWithEvidence.map((c) => c.controlId));

  const allControls = await db
    .select({
      id: controlsTable.id,
      controlId: controlsTable.controlId,
      title: controlsTable.title,
      domainId: controlsTable.domainId,
      domainName: domainsTable.name,
      level: controlsTable.level,
    })
    .from(controlsTable)
    .leftJoin(domainsTable, eq(domainsTable.id, controlsTable.domainId))
    .where(eq(controlsTable.isActive, true));

  const missing = allControls.filter((c) => !coveredIds.has(c.id));
  res.json(missing);
});

router.get("/dashboard/stale-evidence", requireAuth, requireOrg, async (req, res) => {
  const orgId = req.orgId;

  const items = await db
    .select()
    .from(evidenceItemsTable)
    .where(
      and(
        or(eq(evidenceItemsTable.status, "stale"), lte(evidenceItemsTable.expiresAt, new Date())),
        orgId ? eq(evidenceItemsTable.organizationId, orgId) : undefined
      )
    )
    .orderBy(evidenceItemsTable.expiresAt);

  res.json(items);
});

router.get("/dashboard/overdue-tasks", requireAuth, requireOrg, async (req, res) => {
  const orgId = req.orgId;

  const tasks = await db
    .select({
      id: tasksTable.id,
      title: tasksTable.title,
      status: tasksTable.status,
      priority: tasksTable.priority,
      dueDate: tasksTable.dueDate,
      assigneeId: tasksTable.assigneeId,
      assigneeName: usersTable.name,
    })
    .from(tasksTable)
    .leftJoin(usersTable, eq(usersTable.id, tasksTable.assigneeId))
    .where(
      and(
        or(eq(tasksTable.status, "open"), eq(tasksTable.status, "in_progress")),
        lte(tasksTable.dueDate, new Date()),
        orgId ? eq(tasksTable.organizationId, orgId) : undefined
      )
    )
    .orderBy(tasksTable.dueDate);

  res.json(tasks);
});

router.get("/dashboard/upcoming-reviews", requireAuth, requireOrg, async (req, res) => {
  const orgId = req.orgId;
  const cutoff = new Date(Date.now() + 30 * 86400000);

  const items = await db
    .select()
    .from(evidenceItemsTable)
    .where(
      and(
        lte(evidenceItemsTable.reviewDueDate, cutoff),
        gte(evidenceItemsTable.reviewDueDate, new Date()),
        eq(evidenceItemsTable.status, "approved"),
        orgId ? eq(evidenceItemsTable.organizationId, orgId) : undefined
      )
    )
    .orderBy(evidenceItemsTable.reviewDueDate)
    .limit(20);

  res.json(items);
});

router.get("/dashboard/recent-activity", requireAuth, requireOrg, async (req, res) => {
  const { limit } = req.query as Record<string, string>;
  const orgId = req.orgId;

  const logs = await db
    .select({
      id: auditLogsTable.id,
      action: auditLogsTable.action,
      entityType: auditLogsTable.entityType,
      entityId: auditLogsTable.entityId,
      entityLabel: auditLogsTable.entityLabel,
      previousValue: auditLogsTable.previousValue,
      newValue: auditLogsTable.newValue,
      userId: auditLogsTable.userId,
      userName: auditLogsTable.userName,
      timestamp: auditLogsTable.timestamp,
      organizationId: auditLogsTable.organizationId,
    })
    .from(auditLogsTable)
    .where(
      and(
        orgId ? eq(auditLogsTable.organizationId, orgId) : undefined,
        sql`${auditLogsTable.action} NOT IN ('logged_in', 'logged_out')`
      )
    )
    .orderBy(desc(auditLogsTable.timestamp))
    .limit(parseInt(limit ?? "20"));

  const activity = logs.map((log) => {
    const actionLabel = (() => {
      switch (log.action) {
        case "uploaded": return "uploaded";
        case "created": return "created";
        case "updated": return "updated";
        case "deleted": return "deleted";
        case "approved": return "approved";
        case "rejected": return "rejected";
        case "submitted": return "submitted";
        case "status_changed": return "changed status of";
        case "link_added": return "linked";
        case "link_removed": return "unlinked";
        case "completed": return "completed";
        case "closed": return "closed";
        case "superseded": return "superseded";
        case "marked_stale": return "marked stale";
        case "exported": return "exported";
        case "downloaded": return "downloaded";
        case "reopened": return "reopened";
        case "reviewed": return "reviewed";
        case "assigned": return "assigned";
        default: return log.action;
      }
    })();

    const entityTypeLabel = (() => {
      switch (log.entityType) {
        case "evidence": return "Evidence";
        case "control": return "Control";
        case "task": return "Task";
        case "poam": return "POA&M";
        case "document": return "Document";
        case "user": return "User";
        default: return log.entityType;
      }
    })();

    let description = `${actionLabel} ${entityTypeLabel}`;
    if (log.entityLabel) description += `: ${log.entityLabel}`;

    if (log.action === "status_changed" && log.newValue) {
      const nv = String(log.newValue).replace(/_/g, " ");
      description += ` → ${nv}`;
    }

    return {
      id: log.id,
      action: log.action,
      actionLabel,
      entityType: log.entityType,
      entityTypeLabel,
      entityId: log.entityId,
      entityLabel: log.entityLabel,
      description,
      previousValue: log.previousValue,
      newValue: log.newValue,
      userId: log.userId,
      userName: log.userName,
      timestamp: log.timestamp,
    };
  });

  res.json(activity);
});

export default router;
