import { Router } from "express";
import {
  db,
  controlsTable,
  controlAssessmentsTable,
  auditLogsTable,
  organizationsTable,
  roadmapActionsTable,
  orgRoadmapProgressTable,
  roadmapActionChecklistItemsTable,
  orgRoadmapChecklistProgressTable,
  roadmapProcedureStepsTable,
  orgProcedureStepProgressTable,
} from "@workspace/db";
import { eq, and, inArray } from "drizzle-orm";
import { requireAuth } from "../lib/auth";
import { randomUUID } from "crypto";

const router = Router();

function requireAdmin(req: any, res: any, next: any) {
  if (req.authUser?.role !== "admin") {
    return res.status(403).json({ error: "Admin access required" });
  }
  next();
}

// ── GET /api/admin/backfill/narratives?orgId=xxx  ─────────────────────────────
// Dry-run: returns stats without touching the DB.
router.get("/admin/backfill/narratives", requireAuth, requireAdmin, async (req, res) => {
  const { orgId } = req.query as { orgId?: string };
  if (!orgId) return res.status(400).json({ error: "orgId is required" });

  const [org] = await db
    .select({ id: organizationsTable.id, name: organizationsTable.name, legalName: organizationsTable.legalName })
    .from(organizationsTable)
    .where(eq(organizationsTable.id, orgId))
    .limit(1);
  if (!org) return res.status(404).json({ error: "Organization not found" });

  const allControls = await db
    .select({
      controlId: controlsTable.id,
      controlRef: controlsTable.controlId,
      title: controlsTable.title,
      guidance: controlsTable.implementationGuidance,
      narrative: controlAssessmentsTable.implementationNarrative,
      assessmentId: controlAssessmentsTable.id,
    })
    .from(controlsTable)
    .leftJoin(
      controlAssessmentsTable,
      and(
        eq(controlAssessmentsTable.controlId, controlsTable.id),
        eq(controlAssessmentsTable.organizationId, orgId),
      )
    )
    .where(eq(controlsTable.isActive, true));

  const blankNarrative: typeof allControls = [];
  const existingNarrative: typeof allControls = [];
  const missingGuidance: typeof allControls = [];

  for (const c of allControls) {
    const hasNarrative = !!(c.narrative?.trim());
    const hasGuidance = !!(c.guidance?.trim());
    if (hasNarrative) {
      existingNarrative.push(c);
    } else if (!hasGuidance) {
      missingGuidance.push(c);
    } else {
      blankNarrative.push(c);
    }
  }

  res.json({
    org,
    totalControls: allControls.length,
    wouldUpdate: blankNarrative.length,
    existingNarrative: existingNarrative.length,
    missingGuidance: missingGuidance.length,
    preview: blankNarrative.slice(0, 5).map(c => ({
      controlRef: c.controlRef,
      title: c.title,
      guidancePreview: c.guidance?.slice(0, 120) ?? "",
    })),
    missingGuidanceControls: missingGuidance.map(c => ({ controlRef: c.controlRef, title: c.title })),
  });
});

// ── POST /api/admin/backfill/narratives  ──────────────────────────────────────
// Execute: copies guidance → narrative for blank rows, writes one audit log per update.
router.post("/admin/backfill/narratives", requireAuth, requireAdmin, async (req, res) => {
  const { orgId } = req.body as { orgId?: string };
  if (!orgId) return res.status(400).json({ error: "orgId is required" });

  const [org] = await db
    .select({ id: organizationsTable.id, name: organizationsTable.name })
    .from(organizationsTable)
    .where(eq(organizationsTable.id, orgId))
    .limit(1);
  if (!org) return res.status(404).json({ error: "Organization not found" });

  const allControls = await db
    .select({
      controlId: controlsTable.id,
      controlRef: controlsTable.controlId,
      title: controlsTable.title,
      guidance: controlsTable.implementationGuidance,
      narrative: controlAssessmentsTable.implementationNarrative,
      assessmentId: controlAssessmentsTable.id,
    })
    .from(controlsTable)
    .leftJoin(
      controlAssessmentsTable,
      and(
        eq(controlAssessmentsTable.controlId, controlsTable.id),
        eq(controlAssessmentsTable.organizationId, orgId),
      )
    )
    .where(eq(controlsTable.isActive, true));

  let updated = 0;
  let skippedExisting = 0;
  let skippedNoGuidance = 0;

  const now = new Date();
  const actorId = (req as any).authUser?.id ?? null;
  const actorName = (req as any).authUser?.name ?? "System";

  for (const ctrl of allControls) {
    const hasNarrative = !!(ctrl.narrative?.trim());
    const hasGuidance = !!(ctrl.guidance?.trim());

    if (hasNarrative) {
      skippedExisting++;
      continue;
    }
    if (!hasGuidance) {
      skippedNoGuidance++;
      continue;
    }

    if (ctrl.assessmentId) {
      await db
        .update(controlAssessmentsTable)
        .set({ implementationNarrative: ctrl.guidance!, updatedAt: now })
        .where(eq(controlAssessmentsTable.id, ctrl.assessmentId));
    } else {
      await db.insert(controlAssessmentsTable).values({
        id: randomUUID(),
        organizationId: orgId,
        controlId: ctrl.controlId,
        status: "not_started",
        implementationNarrative: ctrl.guidance!,
        createdAt: now,
        updatedAt: now,
      });
    }

    await db.insert(auditLogsTable).values({
      id: randomUUID(),
      organizationId: orgId,
      userId: actorId,
      userName: actorName,
      action: "updated",
      entityType: "control_assessment",
      entityId: ctrl.controlId,
      entityLabel: ctrl.controlRef,
      previousValue: { implementationNarrative: null } as any,
      newValue: { implementationNarrative: ctrl.guidance!.slice(0, 200) } as any,
      timestamp: now,
    });

    updated++;
  }

  res.json({
    org,
    updated,
    skippedExisting,
    skippedNoGuidance,
    total: allControls.length,
  });
});

// ── GET /api/admin/orgs  ──────────────────────────────────────────────────────
// Returns all organizations for the admin org selector.
router.get("/admin/orgs", requireAuth, requireAdmin, async (_req, res) => {
  const orgs = await db
    .select({ id: organizationsTable.id, name: organizationsTable.name, legalName: organizationsTable.legalName })
    .from(organizationsTable)
    .orderBy(organizationsTable.name);
  res.json(orgs);
});

// ── GET /api/admin/backfill/roadmap?orgId=xxx  ────────────────────────────────
// Dry-run: returns current roadmap status summary for the org without changing anything.
router.get("/admin/backfill/roadmap", requireAuth, requireAdmin, async (req, res) => {
  const { orgId } = req.query as { orgId?: string };
  if (!orgId) return res.status(400).json({ error: "orgId is required" });

  const [org] = await db
    .select({ id: organizationsTable.id, name: organizationsTable.name, legalName: organizationsTable.legalName })
    .from(organizationsTable)
    .where(eq(organizationsTable.id, orgId))
    .limit(1);
  if (!org) return res.status(404).json({ error: "Organization not found" });

  const allActions = await db
    .select()
    .from(roadmapActionsTable)
    .orderBy(roadmapActionsTable.sortOrder);

  if (allActions.length === 0) {
    return res.json({ org, totalActions: 0, statusCounts: {}, actions: [] });
  }

  const actionIds = allActions.map((a) => a.id);

  const progressRows = await db
    .select()
    .from(orgRoadmapProgressTable)
    .where(eq(orgRoadmapProgressTable.organizationId, orgId));

  const progressMap = new Map(progressRows.map((p) => [p.actionId, p]));

  const statusCounts: Record<string, number> = {
    not_started: 0,
    in_progress: 0,
    evidence_needed: 0,
    ready_for_review: 0,
    complete: 0,
    blocked: 0,
    missing: 0,
  };

  const actions = allActions.map((a) => {
    const progress = progressMap.get(a.id);
    const currentStatus = progress?.status ?? "missing";
    statusCounts[currentStatus] = (statusCounts[currentStatus] ?? 0) + 1;
    return {
      id: a.id,
      title: a.title,
      phase: a.phase,
      phaseName: a.phaseName,
      category: a.category,
      currentStatus,
      hasProgressRecord: !!progress,
      completedAt: progress?.completedAt ?? null,
    };
  });

  // Also count checklist items and procedure steps for info
  const checklistItems = await db
    .select({ id: roadmapActionChecklistItemsTable.id })
    .from(roadmapActionChecklistItemsTable)
    .where(inArray(roadmapActionChecklistItemsTable.actionId, actionIds));

  const procedureSteps = await db
    .select({ id: roadmapProcedureStepsTable.id })
    .from(roadmapProcedureStepsTable)
    .where(inArray(roadmapProcedureStepsTable.actionId, actionIds));

  res.json({
    org,
    totalActions: allActions.length,
    totalChecklistItems: checklistItems.length,
    totalProcedureSteps: procedureSteps.length,
    statusCounts,
    wouldUpdate: allActions.length - (statusCounts.complete ?? 0),
    actions,
  });
});

// ── POST /api/admin/backfill/roadmap  ─────────────────────────────────────────
// Execute: marks ALL roadmap actions for the org as complete.
// Creates missing progress records. Writes one audit log per action + one summary.
router.post("/admin/backfill/roadmap", requireAuth, requireAdmin, async (req, res) => {
  const { orgId } = req.body as { orgId?: string };
  if (!orgId) return res.status(400).json({ error: "orgId is required" });

  const [org] = await db
    .select({ id: organizationsTable.id, name: organizationsTable.name })
    .from(organizationsTable)
    .where(eq(organizationsTable.id, orgId))
    .limit(1);
  if (!org) return res.status(404).json({ error: "Organization not found" });

  const allActions = await db
    .select()
    .from(roadmapActionsTable)
    .orderBy(roadmapActionsTable.sortOrder);

  if (allActions.length === 0) {
    return res.json({ org, updated: 0, created: 0, checklistUpdated: 0, stepsUpdated: 0 });
  }

  const actionIds = allActions.map((a) => a.id);
  const now = new Date();
  const actorId = (req as any).authUser?.id ?? null;
  const actorName = (req as any).authUser?.name ?? "System";

  // Load existing progress rows
  const existingProgress = await db
    .select()
    .from(orgRoadmapProgressTable)
    .where(eq(orgRoadmapProgressTable.organizationId, orgId));
  const progressMap = new Map(existingProgress.map((p) => [p.actionId, p]));

  let updated = 0;
  let created = 0;

  for (const action of allActions) {
    const existing = progressMap.get(action.id);
    const previousStatus = existing?.status ?? null;

    if (existing) {
      if (existing.status !== "complete") {
        await db
          .update(orgRoadmapProgressTable)
          .set({
            status: "complete",
            result: "passed",
            completedAt: existing.completedAt ?? now,
            updatedAt: now,
          })
          .where(eq(orgRoadmapProgressTable.id, existing.id));
        updated++;
      }
    } else {
      await db.insert(orgRoadmapProgressTable).values({
        id: randomUUID(),
        organizationId: orgId,
        actionId: action.id,
        status: "complete",
        result: "passed",
        completedAt: now,
        updatedAt: now,
      });
      created++;
    }

    // Per-action audit log entry
    if (existing?.status !== "complete") {
      await db.insert(auditLogsTable).values({
        id: randomUUID(),
        organizationId: orgId,
        userId: actorId,
        userName: actorName,
        action: "complete",
        entityType: "roadmap_action",
        entityId: action.id,
        entityLabel: action.title,
        previousValue: { status: previousStatus } as any,
        newValue: { status: "complete", result: "passed" } as any,
        timestamp: now,
      });
    }
  }

  // Mark all checklist items complete
  const allChecklistItems = await db
    .select()
    .from(roadmapActionChecklistItemsTable)
    .where(inArray(roadmapActionChecklistItemsTable.actionId, actionIds));

  const existingChecklist = await db
    .select()
    .from(orgRoadmapChecklistProgressTable)
    .where(eq(orgRoadmapChecklistProgressTable.organizationId, orgId));
  const checklistMap = new Map(existingChecklist.map((c) => [c.checklistItemId, c]));

  let checklistUpdated = 0;
  for (const item of allChecklistItems) {
    const existing = checklistMap.get(item.id);
    if (existing) {
      if (!existing.completed) {
        await db
          .update(orgRoadmapChecklistProgressTable)
          .set({ completed: true, completedAt: now })
          .where(eq(orgRoadmapChecklistProgressTable.id, existing.id));
        checklistUpdated++;
      }
    } else {
      await db.insert(orgRoadmapChecklistProgressTable).values({
        id: randomUUID(),
        organizationId: orgId,
        checklistItemId: item.id,
        completed: true,
        completedAt: now,
      });
      checklistUpdated++;
    }
  }

  // Mark all procedure steps complete
  const allSteps = await db
    .select()
    .from(roadmapProcedureStepsTable)
    .where(inArray(roadmapProcedureStepsTable.actionId, actionIds));

  const existingSteps = await db
    .select()
    .from(orgProcedureStepProgressTable)
    .where(eq(orgProcedureStepProgressTable.organizationId, orgId));
  const stepsMap = new Map(existingSteps.map((s) => [s.stepId, s]));

  let stepsUpdated = 0;
  for (const step of allSteps) {
    const existing = stepsMap.get(step.id);
    if (existing) {
      if (existing.status !== "complete") {
        await db
          .update(orgProcedureStepProgressTable)
          .set({ status: "complete", completedAt: now, completedBy: actorName, updatedAt: now })
          .where(eq(orgProcedureStepProgressTable.id, existing.id));
        stepsUpdated++;
      }
    } else {
      await db.insert(orgProcedureStepProgressTable).values({
        id: randomUUID(),
        organizationId: orgId,
        stepId: step.id,
        status: "complete",
        completedAt: now,
        completedBy: actorName,
        updatedAt: now,
      });
      stepsUpdated++;
    }
  }

  // Summary audit log entry
  await db.insert(auditLogsTable).values({
    id: randomUUID(),
    organizationId: orgId,
    userId: actorId,
    userName: actorName,
    action: "complete",
    entityType: "roadmap_backfill",
    entityId: orgId,
    entityLabel: `${org.name} Implementation Roadmap Backfill Completed`,
    previousValue: null,
    newValue: {
      actionsUpdated: updated,
      actionsCreated: created,
      checklistItemsMarked: checklistUpdated,
      procedureStepsMarked: stepsUpdated,
      totalActions: allActions.length,
    } as any,
    timestamp: now,
  });

  res.json({
    org,
    totalActions: allActions.length,
    updated,
    created,
    checklistUpdated,
    stepsUpdated,
    alreadyComplete: allActions.length - updated - created,
  });
});

export default router;
