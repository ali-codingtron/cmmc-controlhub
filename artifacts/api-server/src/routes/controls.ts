import { Router } from "express";
import {
  db,
  controlsTable,
  controlAssessmentsTable,
  domainsTable,
  assessmentObjectivesTable,
  evidenceItemsTable,
  evidenceControlLinksTable,
  tasksTable,
  taskControlLinksTable,
  poamsTable,
  usersTable,
  organizationPackagesTable,
  compliancePackagesTable,
  complianceRequirementsTable,
} from "@workspace/db";
import { eq, and, ilike, count, inArray, or, desc } from "drizzle-orm";

import { requireAuth } from "../lib/auth";
import { requireOrg } from "../middleware/org";
import { logAudit } from "../lib/audit";
import { randomUUID } from "crypto";

const router = Router();

router.get("/controls", requireAuth, requireOrg, async (req, res) => {
  const { domain, level, status, search } = req.query as Record<string, string>;
  const orgId = req.orgId;

  // Package-aware filtering via compliance_requirements join.
  // When org has CMMC/FAR/NIST packages, filter controls to those covered by requirement mappings.
  // DFARS-only orgs and orgs with no packages see all controls (legacy behaviour).
  let packageControlIds: string[] | null = null; // null = no package restriction

  if (orgId && !level) {
    const orgPkgs = await db
      .select({
        packageId: compliancePackagesTable.id,
        packageKey: compliancePackagesTable.packageKey,
      })
      .from(organizationPackagesTable)
      .innerJoin(compliancePackagesTable, eq(organizationPackagesTable.packageId, compliancePackagesTable.id))
      .where(
        and(
          eq(organizationPackagesTable.organizationId, orgId),
          eq(organizationPackagesTable.isActive, true)
        )
      );

    if (orgPkgs.length > 0) {
      // CMMC (L1/L2) and FAR packages: their requirement IDs match controlsTable.controlId
      const cmmcFarPkgIds = orgPkgs
        .filter(p => p.packageKey.startsWith("CMMC_") || p.packageKey === "FAR_52_204_21")
        .map(p => p.packageId);

      // NIST 800-171 requirement packages (exclude assessment procedures, i.e. "171A"):
      // NIST_800_171_R2, NIST_800_171_R3 → their requirement IDs match controlsTable.nistRef
      const nistPkgIds = orgPkgs
        .filter(p => p.packageKey.startsWith("NIST_800_171_"))
        .map(p => p.packageId);

      const mappedPkgIds = [...cmmcFarPkgIds, ...nistPkgIds];

      if (mappedPkgIds.length > 0) {
        // Fetch requirement IDs from seeded compliance_requirements for these packages
        const reqs = await db
          .select({
            reqId: complianceRequirementsTable.requirementId,
            pkgId: complianceRequirementsTable.packageId,
          })
          .from(complianceRequirementsTable)
          .where(inArray(complianceRequirementsTable.packageId, mappedPkgIds));

        if (reqs.length > 0) {
          const cmmcFarReqIds = reqs.filter(r => cmmcFarPkgIds.includes(r.pkgId)).map(r => r.reqId);
          const nistReqIds = reqs.filter(r => nistPkgIds.includes(r.pkgId)).map(r => r.reqId);

          // Resolve matching control DB IDs (deduplicated via SELECT DISTINCT)
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

          packageControlIds = matched.map(c => c.id);
        }
        // If requirements not yet seeded (empty reqs), fall through → show all (packageControlIds stays null)
      }
      // DFARS-only or unrecognised packages → packageControlIds stays null (show all)
    }
    // No packages → show all (legacy behaviour)
  }

  const controls = await db
    .select({
      id: controlsTable.id,
      controlId: controlsTable.controlId,
      domainId: controlsTable.domainId,
      domainName: domainsTable.name,
      title: controlsTable.title,
      description: controlsTable.description,
      level: controlsTable.level,
      nistRef: controlsTable.nistRef,
      implementationGuidance: controlsTable.implementationGuidance,
      recommendedReviewFrequency: controlsTable.recommendedReviewFrequency,
      sortOrder: controlsTable.sortOrder,
      status: controlAssessmentsTable.status,
      implementationNarrative: controlAssessmentsTable.implementationNarrative,
      lastAssessedAt: controlAssessmentsTable.lastAssessedAt,
      assessmentId: controlAssessmentsTable.id,
    })
    .from(controlsTable)
    .leftJoin(domainsTable, eq(domainsTable.id, controlsTable.domainId))
    .leftJoin(
      controlAssessmentsTable,
      and(
        eq(controlAssessmentsTable.controlId, controlsTable.id),
        orgId ? eq(controlAssessmentsTable.organizationId, orgId) : undefined
      )
    )
    .where(
      and(
        eq(controlsTable.isActive, true),
        domain ? eq(controlsTable.domainId, domain) : undefined,
        level ? eq(controlsTable.level, level as "L1" | "L2")
          : packageControlIds !== null && packageControlIds.length > 0
          ? inArray(controlsTable.id, packageControlIds)
          : undefined,
        status
          ? eq(controlAssessmentsTable.status, status as typeof controlAssessmentsTable.status)
          : undefined,
        search
          ? or(
              ilike(controlsTable.controlId, `%${search}%`),
              ilike(controlsTable.title, `%${search}%`)
            )
          : undefined
      )
    )
    .orderBy(controlsTable.sortOrder);

  const controlIds = controls.map((c) => c.id);
  let evidenceCounts: Record<string, number> = {};
  let taskCounts: Record<string, number> = {};
  let poamCounts: Record<string, number> = {};

  if (controlIds.length > 0) {
    const evRows = await db
      .select({ controlId: evidenceControlLinksTable.controlId, cnt: count() })
      .from(evidenceControlLinksTable)
      .innerJoin(evidenceItemsTable, eq(evidenceItemsTable.id, evidenceControlLinksTable.evidenceId))
      .where(
        and(
          inArray(evidenceControlLinksTable.controlId, controlIds),
          orgId ? eq(evidenceItemsTable.organizationId, orgId) : undefined
        )
      )
      .groupBy(evidenceControlLinksTable.controlId);

    const approvedEvRows = await db
      .select({ controlId: evidenceControlLinksTable.controlId, cnt: count() })
      .from(evidenceControlLinksTable)
      .leftJoin(evidenceItemsTable, eq(evidenceItemsTable.id, evidenceControlLinksTable.evidenceId))
      .where(
        and(
          inArray(evidenceControlLinksTable.controlId, controlIds),
          eq(evidenceItemsTable.status, "approved"),
          orgId ? eq(evidenceItemsTable.organizationId, orgId) : undefined
        )
      )
      .groupBy(evidenceControlLinksTable.controlId);

    const taskRows = await db
      .select({ controlId: taskControlLinksTable.controlId, cnt: count() })
      .from(taskControlLinksTable)
      .leftJoin(tasksTable, eq(tasksTable.id, taskControlLinksTable.taskId))
      .where(
        and(
          inArray(taskControlLinksTable.controlId, controlIds),
          or(eq(tasksTable.status, "open"), eq(tasksTable.status, "in_progress")),
          orgId ? eq(tasksTable.organizationId, orgId) : undefined
        )
      )
      .groupBy(taskControlLinksTable.controlId);

    const poamRows = await db
      .select({ controlId: poamsTable.linkedControlId, cnt: count() })
      .from(poamsTable)
      .where(
        and(
          inArray(poamsTable.linkedControlId as any, controlIds),
          or(eq(poamsTable.status, "open"), eq(poamsTable.status, "in_progress")),
          orgId ? eq(poamsTable.organizationId, orgId) : undefined
        )
      )
      .groupBy(poamsTable.linkedControlId);

    evRows.forEach((r) => { evidenceCounts[r.controlId] = Number(r.cnt); });
    approvedEvRows.forEach((r) => { evidenceCounts[`approved_${r.controlId}`] = Number(r.cnt); });
    taskRows.forEach((r) => { taskCounts[r.controlId] = Number(r.cnt); });
    poamRows.forEach((r) => { if (r.controlId) poamCounts[r.controlId] = Number(r.cnt); });
  }

  const result = controls.map((c) => ({
    ...c,
    status: c.status ?? "not_started",
    evidenceCount: evidenceCounts[c.id] ?? 0,
    approvedEvidenceCount: evidenceCounts[`approved_${c.id}`] ?? 0,
    openTaskCount: taskCounts[c.id] ?? 0,
    openPoamCount: poamCounts[c.id] ?? 0,
  }));

  res.json(result);
});

router.get("/controls/:id", requireAuth, requireOrg, async (req, res) => {
  const orgId = req.orgId;

  const [control] = await db
    .select({
      id: controlsTable.id,
      controlId: controlsTable.controlId,
      domainId: controlsTable.domainId,
      domainName: domainsTable.name,
      title: controlsTable.title,
      description: controlsTable.description,
      level: controlsTable.level,
      nistRef: controlsTable.nistRef,
      implementationGuidance: controlsTable.implementationGuidance,
      recommendedReviewFrequency: controlsTable.recommendedReviewFrequency,
      status: controlAssessmentsTable.status,
      implementationNarrative: controlAssessmentsTable.implementationNarrative,
      lastAssessedAt: controlAssessmentsTable.lastAssessedAt,
      assessmentId: controlAssessmentsTable.id,
    })
    .from(controlsTable)
    .leftJoin(domainsTable, eq(domainsTable.id, controlsTable.domainId))
    .leftJoin(
      controlAssessmentsTable,
      and(
        eq(controlAssessmentsTable.controlId, controlsTable.id),
        orgId ? eq(controlAssessmentsTable.organizationId, orgId) : undefined
      )
    )
    .where(eq(controlsTable.id, req.params.id))
    .limit(1);

  if (!control) {
    res.status(404).json({ error: "Not found" });
    return;
  }

  const objectives = await db
    .select()
    .from(assessmentObjectivesTable)
    .where(eq(assessmentObjectivesTable.controlId, req.params.id))
    .orderBy(assessmentObjectivesTable.sortOrder);

  res.json({ ...control, status: control.status ?? "not_started", objectives });
});

router.patch("/controls/:id", requireAuth, requireOrg, async (req, res) => {
  const { status, implementationNarrative } = req.body;
  const orgId = req.orgId;

  const [control] = await db
    .select()
    .from(controlsTable)
    .where(eq(controlsTable.id, req.params.id))
    .limit(1);

  if (!control) {
    res.status(404).json({ error: "Not found" });
    return;
  }

  const existing = await db
    .select()
    .from(controlAssessmentsTable)
    .where(
      and(
        eq(controlAssessmentsTable.controlId, req.params.id),
        orgId ? eq(controlAssessmentsTable.organizationId, orgId) : undefined
      )
    )
    .limit(1);

  if (existing.length === 0) {
    await db.insert(controlAssessmentsTable).values({
      id: randomUUID(),
      organizationId: orgId ?? null,
      controlId: req.params.id,
      status: status ?? "not_started",
      implementationNarrative,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  } else {
    await db
      .update(controlAssessmentsTable)
      .set({
        status: status ?? existing[0].status,
        implementationNarrative:
          implementationNarrative !== undefined ? implementationNarrative : existing[0].implementationNarrative,
        updatedAt: new Date(),
      })
      .where(eq(controlAssessmentsTable.id, existing[0].id));
  }

  await logAudit(req, "status_changed", "control", req.params.id, {
    entityLabel: control.controlId,
    previousValue: existing[0]?.status ?? "not_started",
    newValue: status,
  });

  res.json({ id: req.params.id, status, implementationNarrative });
});

router.get("/controls/:id/evidence", requireAuth, requireOrg, async (req, res) => {
  const orgId = req.orgId;

  // Active statuses: exclude archived (and soft-deleted). Count/display only live evidence.
  const ACTIVE_STATUSES = ["draft", "needs_classification", "pending_review", "approved", "assessor_ready", "rejected", "stale", "superseded"];

  const links = await db
    .select({
      id: evidenceItemsTable.id,
      title: evidenceItemsTable.title,
      evidenceType: evidenceItemsTable.evidenceType,
      status: evidenceItemsTable.status,
      fileName: evidenceItemsTable.fileName,
      fileSize: evidenceItemsTable.fileSize,
      fileKey: evidenceItemsTable.fileKey,
      mimeType: evidenceItemsTable.mimeType,
      ownerId: evidenceItemsTable.ownerId,
      ownerName: usersTable.name,
      collectedAt: evidenceItemsTable.collectedAt,
      expiresAt: evidenceItemsTable.expiresAt,
      assessorSummary: evidenceItemsTable.assessorSummary,
      createdAt: evidenceItemsTable.createdAt,
      updatedAt: evidenceItemsTable.updatedAt,
    })
    .from(evidenceControlLinksTable)
    .innerJoin(evidenceItemsTable, eq(evidenceItemsTable.id, evidenceControlLinksTable.evidenceId))
    .leftJoin(usersTable, eq(usersTable.id, evidenceItemsTable.ownerId))
    .where(
      and(
        eq(evidenceControlLinksTable.controlId, req.params.id),
        orgId ? eq(evidenceItemsTable.organizationId, orgId) : undefined,
        inArray(evidenceItemsTable.status, ACTIVE_STATUSES as any[])
      )
    )
    .orderBy(desc(evidenceItemsTable.updatedAt));

  res.json(links);
});

router.get("/controls/:id/tasks", requireAuth, requireOrg, async (req, res) => {
  const orgId = req.orgId;

  const tasks = await db
    .select({
      id: tasksTable.id,
      title: tasksTable.title,
      status: tasksTable.status,
      priority: tasksTable.priority,
      dueDate: tasksTable.dueDate,
    })
    .from(taskControlLinksTable)
    .innerJoin(tasksTable, eq(tasksTable.id, taskControlLinksTable.taskId))
    .where(
      and(
        eq(taskControlLinksTable.controlId, req.params.id),
        orgId ? eq(tasksTable.organizationId, orgId) : undefined
      )
    );

  res.json(tasks);
});

router.get("/controls/:id/poams", requireAuth, requireOrg, async (req, res) => {
  const orgId = req.orgId;

  const items = await db
    .select()
    .from(poamsTable)
    .where(
      and(
        eq(poamsTable.linkedControlId, req.params.id),
        orgId ? eq(poamsTable.organizationId, orgId) : undefined
      )
    );

  res.json(items);
});

export default router;
