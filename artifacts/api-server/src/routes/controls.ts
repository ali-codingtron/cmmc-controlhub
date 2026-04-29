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
} from "@workspace/db";
import { eq, and, ilike, count, inArray, or } from "drizzle-orm";
import { requireAuth } from "../lib/auth";
import { logAudit } from "../lib/audit";
import { randomUUID } from "crypto";

const router = Router();

router.get("/controls", requireAuth, async (req, res) => {
  const { domain, level, status, search } = req.query as Record<string, string>;

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
      eq(controlAssessmentsTable.controlId, controlsTable.id)
    )
    .where(
      and(
        eq(controlsTable.isActive, true),
        domain ? eq(controlsTable.domainId, domain) : undefined,
        level ? eq(controlsTable.level, level as "L1" | "L2") : undefined,
        status
          ? eq(
              controlAssessmentsTable.status,
              status as typeof controlAssessmentsTable.status
            )
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
      .where(inArray(evidenceControlLinksTable.controlId, controlIds))
      .groupBy(evidenceControlLinksTable.controlId);

    const approvedEvRows = await db
      .select({ controlId: evidenceControlLinksTable.controlId, cnt: count() })
      .from(evidenceControlLinksTable)
      .leftJoin(
        evidenceItemsTable,
        eq(evidenceItemsTable.id, evidenceControlLinksTable.evidenceId)
      )
      .where(
        and(
          inArray(evidenceControlLinksTable.controlId, controlIds),
          eq(evidenceItemsTable.status, "approved")
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
          or(eq(tasksTable.status, "open"), eq(tasksTable.status, "in_progress"))
        )
      )
      .groupBy(taskControlLinksTable.controlId);

    const poamRows = await db
      .select({ controlId: poamsTable.linkedControlId, cnt: count() })
      .from(poamsTable)
      .where(
        and(
          inArray(poamsTable.linkedControlId as any, controlIds),
          or(eq(poamsTable.status, "open"), eq(poamsTable.status, "in_progress"))
        )
      )
      .groupBy(poamsTable.linkedControlId);

    evRows.forEach((r) => {
      evidenceCounts[r.controlId] = Number(r.cnt);
    });
    approvedEvRows.forEach((r) => {
      evidenceCounts[`approved_${r.controlId}`] = Number(r.cnt);
    });
    taskRows.forEach((r) => {
      taskCounts[r.controlId] = Number(r.cnt);
    });
    poamRows.forEach((r) => {
      if (r.controlId) poamCounts[r.controlId] = Number(r.cnt);
    });
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

router.get("/controls/:id", requireAuth, async (req, res) => {
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
      eq(controlAssessmentsTable.controlId, controlsTable.id)
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

router.patch("/controls/:id", requireAuth, async (req, res) => {
  const { status, implementationNarrative } = req.body;

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
    .where(eq(controlAssessmentsTable.controlId, req.params.id))
    .limit(1);

  if (existing.length === 0) {
    await db.insert(controlAssessmentsTable).values({
      id: randomUUID(),
      controlId: req.params.id,
      status: status ?? "not_started",
      implementationNarrative: implementationNarrative,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  } else {
    await db
      .update(controlAssessmentsTable)
      .set({
        status: status ?? existing[0].status,
        implementationNarrative:
          implementationNarrative !== undefined
            ? implementationNarrative
            : existing[0].implementationNarrative,
        updatedAt: new Date(),
      })
      .where(eq(controlAssessmentsTable.controlId, req.params.id));
  }

  await logAudit(req, "status_changed", "control", req.params.id, {
    entityLabel: control.controlId,
    previousValue: existing[0]?.status ?? "not_started",
    newValue: status,
  });

  res.json({ id: req.params.id, status, implementationNarrative });
});

router.get("/controls/:id/evidence", requireAuth, async (req, res) => {
  const links = await db
    .select({
      id: evidenceItemsTable.id,
      title: evidenceItemsTable.title,
      evidenceType: evidenceItemsTable.evidenceType,
      status: evidenceItemsTable.status,
      fileName: evidenceItemsTable.fileName,
      fileSize: evidenceItemsTable.fileSize,
      createdAt: evidenceItemsTable.createdAt,
    })
    .from(evidenceControlLinksTable)
    .innerJoin(
      evidenceItemsTable,
      eq(evidenceItemsTable.id, evidenceControlLinksTable.evidenceId)
    )
    .where(eq(evidenceControlLinksTable.controlId, req.params.id));

  res.json(links);
});

router.get("/controls/:id/tasks", requireAuth, async (req, res) => {
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
    .where(eq(taskControlLinksTable.controlId, req.params.id));

  res.json(tasks);
});

router.get("/controls/:id/poams", requireAuth, async (req, res) => {
  const items = await db
    .select()
    .from(poamsTable)
    .where(eq(poamsTable.linkedControlId, req.params.id));

  res.json(items);
});

export default router;
