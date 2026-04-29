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
} from "@workspace/db";
import { eq, and, or, count, lte, gte, desc, sql } from "drizzle-orm";
import { requireAuth } from "../lib/auth";
import { requireOrg } from "../middleware/org";

const router = Router();

router.get("/dashboard/summary", requireAuth, requireOrg, async (req, res) => {
  const orgId = req.orgId;

  const [controlStats] = await db
    .select({ total: count() })
    .from(controlsTable)
    .where(eq(controlsTable.isActive, true));

  const assessmentStats = await db
    .select({
      status: controlAssessmentsTable.status,
      level: controlsTable.level,
      cnt: count(),
    })
    .from(controlAssessmentsTable)
    .innerJoin(controlsTable, eq(controlsTable.id, controlAssessmentsTable.controlId))
    .where(orgId ? eq(controlAssessmentsTable.organizationId, orgId) : undefined)
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
    criticalPoams: Number(criticalPoamStats?.total ?? 0),
    controlsWithNoEvidence: 0,
    controlsWithNoPolicy: 0,
    controlsWithNoProcedure: 0,
  });
});

router.get("/dashboard/readiness-by-domain", requireAuth, requireOrg, async (req, res) => {
  const orgId = req.orgId;

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
    .where(eq(controlsTable.isActive, true))
    .groupBy(controlsTable.domainId, controlAssessmentsTable.status);

  const totalByDomain = await db
    .select({ domainId: controlsTable.domainId, cnt: count() })
    .from(controlsTable)
    .where(eq(controlsTable.isActive, true))
    .groupBy(controlsTable.domainId);

  const result = domains.map((d) => {
    const domainAssessments = assessments.filter((a) => a.domainId === d.id);
    const total = Number(totalByDomain.find((t) => t.domainId === d.id)?.cnt ?? 0);
    const implemented = domainAssessments
      .filter((a) => a.status === "implemented" || a.status === "assessor_ready")
      .reduce((sum, a) => sum + Number(a.cnt), 0);
    return {
      id: d.id,
      name: d.name,
      totalControls: total,
      implementedControls: implemented,
      readinessPercent: total > 0 ? Math.round((implemented / total) * 100) : 0,
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
    .select()
    .from(auditLogsTable)
    .where(orgId ? eq(auditLogsTable.organizationId, orgId) : undefined)
    .orderBy(desc(auditLogsTable.timestamp))
    .limit(parseInt(limit ?? "20"));

  res.json(logs);
});

export default router;
