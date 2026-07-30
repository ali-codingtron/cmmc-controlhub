import { Router } from "express";
import {
  db,
  controlsTable,
  domainsTable,
  roadmapActionsTable,
  roadmapActionControlLinksTable,
  roadmapActionEvidenceItemsTable,
  roadmapActionDocumentsTable,
  roadmapActionChecklistItemsTable,
  orgRoadmapProgressTable,
  orgRoadmapChecklistProgressTable,
  orgRoadmapEvidenceLinksTable,
  roadmapProcedureStepsTable,
  orgProcedureStepProgressTable,
  evidenceItemsTable,
  organizationFeaturesTable,
  organizationPackagesTable,
  compliancePackagesTable,
} from "@workspace/db";
import { eq, and, inArray, asc, isNull, or } from "drizzle-orm";
import { z } from "zod";
import { requireAuth, requireNotAssessor, requireRole } from "../lib/auth";
import { requireOrg } from "../middleware/org";
import { randomUUID } from "crypto";
import { ROADMAP_SEED } from "../data/roadmap-seed";
import { L1_ROADMAP_SEED } from "../data/roadmap-l1-seed";
import { PROCEDURE_STEPS_SEED } from "../data/roadmap-procedure-steps-seed";
import {
  resolveOrgRoadmapProfile,
  PROFILE_METADATA,
} from "../lib/roadmap-profile";
import {
  computeRoadmapProgress,
  type ProcedureStepStatus,
  type RoadmapResult,
  type RoadmapStatus,
} from "../lib/roadmap-progress";
import { logAudit } from "../lib/audit";

const router = Router();

const ADMIN_ROLES = new Set(["admin", "compliance_manager"]);

// Check if IMPLEMENTATION_ROADMAP feature is enabled for this org
// Missing record = enabled (default)
async function requireRoadmapEnabled(
  req: import("express").Request,
  res: import("express").Response,
  next: import("express").NextFunction
): Promise<void> {
  const orgId = req.orgId;
  if (!orgId) { next(); return; }
  try {
    const feature = await db
      .select({ enabled: organizationFeaturesTable.enabled })
      .from(organizationFeaturesTable)
      .where(
        and(
          eq(organizationFeaturesTable.organizationId, orgId),
          eq(organizationFeaturesTable.featureKey, "IMPLEMENTATION_ROADMAP")
        )
      )
      .limit(1);
    if (feature.length > 0 && !feature[0]!.enabled) {
      res.status(403).json({ error: "Implementation Roadmap is not enabled for this organization." });
      return;
    }
    next();
  } catch {
    next(); // fail open — don't break roadmap if feature check errors
  }
}

// ── Profile ───────────────────────────────────────────────────────────────────
router.get(
  "/roadmap/profile",
  requireAuth,
  requireOrg,
  requireRoadmapEnabled,
  async (req, res) => {
    const orgId = req.orgId!;
    const profileKey = await resolveOrgRoadmapProfile(orgId);
    if (!profileKey) {
      res.json(null);
      return;
    }
    res.json(PROFILE_METADATA[profileKey] ?? null);
  }
);

// ── List Actions ──────────────────────────────────────────────────────────────
router.get(
  "/roadmap/actions",
  requireAuth,
  requireOrg,
  requireRoadmapEnabled,
  async (req, res) => {
    const orgId = req.orgId!;

    // Resolve which roadmap profile this org is assigned to
    const profileKey = await resolveOrgRoadmapProfile(orgId);
    if (!profileKey) {
      // Org has no compatible compliance packages → no roadmap
      res.json([]);
      return;
    }

    // Build the profile filter: L2 includes NULL rows (legacy, pre-profile seeding)
    const profileFilter =
      profileKey === "CMMC_L2_R2"
        ? or(
            eq(roadmapActionsTable.profileKey, "CMMC_L2_R2"),
            isNull(roadmapActionsTable.profileKey)
          )
        : eq(roadmapActionsTable.profileKey, profileKey);

    const actions = await db
      .select()
      .from(roadmapActionsTable)
      .where(profileFilter)
      .orderBy(roadmapActionsTable.sortOrder);

    if (actions.length === 0) {
      res.json([]);
      return;
    }

    const actionIds = actions.map((a) => a.id);

    const [
      controlLinks,
      progressRows,
      checklistItems,
      checklistProgress,
      evidenceItems,
      evidenceLinks,
      procedureSteps,
      stepProgress,
    ] = await Promise.all([
        db
          .select({
            actionId: roadmapActionControlLinksTable.actionId,
            controlId: roadmapActionControlLinksTable.controlId,
            supportType: roadmapActionControlLinksTable.supportType,
            controlRef: controlsTable.controlId,
            domain: domainsTable.name,
          })
          .from(roadmapActionControlLinksTable)
          .innerJoin(
            controlsTable,
            eq(roadmapActionControlLinksTable.controlId, controlsTable.id)
          )
          .innerJoin(
            domainsTable,
            eq(controlsTable.domainId, domainsTable.id)
          )
          .where(
            inArray(roadmapActionControlLinksTable.actionId, actionIds)
          ),
        db
          .select()
          .from(orgRoadmapProgressTable)
          .where(eq(orgRoadmapProgressTable.organizationId, orgId)),
        db
          .select()
          .from(roadmapActionChecklistItemsTable)
          .where(
            inArray(roadmapActionChecklistItemsTable.actionId, actionIds)
          ),
        db
          .select()
          .from(orgRoadmapChecklistProgressTable)
          .where(eq(orgRoadmapChecklistProgressTable.organizationId, orgId)),
        db
          .select()
          .from(roadmapActionEvidenceItemsTable)
          .where(
            inArray(roadmapActionEvidenceItemsTable.actionId, actionIds)
          ),
        db
          .select()
          .from(orgRoadmapEvidenceLinksTable)
          .where(eq(orgRoadmapEvidenceLinksTable.organizationId, orgId)),
        db
          .select()
          .from(roadmapProcedureStepsTable)
          .where(inArray(roadmapProcedureStepsTable.actionId, actionIds)),
        db
          .select()
          .from(orgProcedureStepProgressTable)
          .where(eq(orgProcedureStepProgressTable.organizationId, orgId)),
      ]);

    const progressMap = new Map(
      progressRows.map((p) => [p.actionId, p])
    );
    const checklistMap = new Map<string, typeof checklistItems>();
    for (const item of checklistItems) {
      const list = checklistMap.get(item.actionId) ?? [];
      list.push(item);
      checklistMap.set(item.actionId, list);
    }
    const checkProgressSet = new Set(
      checklistProgress.filter((p) => p.completed).map((p) => p.checklistItemId)
    );
    const evidenceMap = new Map<string, typeof evidenceItems>();
    for (const item of evidenceItems) {
      const list = evidenceMap.get(item.actionId) ?? [];
      list.push(item);
      evidenceMap.set(item.actionId, list);
    }
    const evidenceLinkedSet = new Set(
      evidenceLinks.map((l) => l.roadmapEvidenceItemId)
    );
    const stepsMap = new Map<string, typeof procedureSteps>();
    for (const step of procedureSteps) {
      const list = stepsMap.get(step.actionId) ?? [];
      list.push(step);
      stepsMap.set(step.actionId, list);
    }
    const stepStatusMap = new Map(
      stepProgress.map((p) => [p.stepId, p.status as ProcedureStepStatus])
    );

    const result = actions.map((action) => {
      const links = controlLinks.filter((l) => l.actionId === action.id);
      const progress = progressMap.get(action.id);
      const items = checklistMap.get(action.id) ?? [];
      const completedChecklist = items.filter((i) =>
        checkProgressSet.has(i.id)
      ).length;
      const evItems = evidenceMap.get(action.id) ?? [];
      const steps = stepsMap.get(action.id) ?? [];

      const domains = [...new Set(links.map((l) => l.domain))];

      const computed = computeRoadmapProgress({
        understandAckAt: progress?.understandAckAt ?? null,
        requiredStepIds: steps.filter((s) => s.isRequired).map((s) => s.id),
        stepStatusById: stepStatusMap,
        requiredEvidenceItemIds: evItems
          .filter((e) => e.isRequired)
          .map((e) => e.id),
        linkedEvidenceItemIds: evidenceLinkedSet,
        requiredChecklistItemIds: items
          .filter((i) => i.isRequired)
          .map((i) => i.id),
        completedChecklistItemIds: checkProgressSet,
        validatedAt: progress?.validatedAt ?? null,
        result: (progress?.result ?? null) as RoadmapResult,
        status: (progress?.status ?? "not_started") as RoadmapStatus,
      });

      return {
        id: action.id,
        title: action.title,
        category: action.category,
        phase: action.phase,
        phaseName: action.phaseName,
        priority: action.priority,
        effort: action.effort,
        impactScore: action.impactScore,
        sortOrder: action.sortOrder,
        controlsCount: links.length,
        fullSupportCount: links.filter((l) => l.supportType === "full_support").length,
        partialSupportCount: links.filter((l) => l.supportType === "partial_support").length,
        evidenceCount: evItems.length,
        documentCount: 0,
        domains,
        status: progress?.status ?? "not_started",
        owner: progress?.owner ?? null,
        targetDate: progress?.targetDate ?? null,
        result: progress?.result ?? null,
        checklistTotal: items.length,
        checklistCompleted: completedChecklist,
        progressPercent: computed.percent,
        stages: computed.stages,
      };
    });

    res.json(result);
  }
);

// ── Action Detail ─────────────────────────────────────────────────────────────
router.get(
  "/roadmap/actions/:id",
  requireAuth,
  requireOrg,
  requireRoadmapEnabled,
  async (req, res) => {
    const { id } = req.params as Record<string, string>;
    const orgId = req.orgId!;

    const [action] = await db
      .select()
      .from(roadmapActionsTable)
      .where(eq(roadmapActionsTable.id, id))
      .limit(1);

    if (!action) {
      res.status(404).json({ error: "Action not found" });
      return;
    }

    const [
      controlLinks,
      evidenceItems,
      documents,
      checklistItems,
      progressRows,
      checklistProgress,
      procedureSteps,
      stepProgressRows,
      evidenceLinkRows,
    ] = await Promise.all([
      db
        .select({
          id: roadmapActionControlLinksTable.id,
          actionId: roadmapActionControlLinksTable.actionId,
          controlId: roadmapActionControlLinksTable.controlId,
          supportType: roadmapActionControlLinksTable.supportType,
          controlRef: controlsTable.controlId,
          controlTitle: controlsTable.title,
          level: controlsTable.level,
          domain: domainsTable.name,
          domainAbbr: domainsTable.name,
        })
        .from(roadmapActionControlLinksTable)
        .innerJoin(
          controlsTable,
          eq(roadmapActionControlLinksTable.controlId, controlsTable.id)
        )
        .innerJoin(domainsTable, eq(controlsTable.domainId, domainsTable.id))
        .where(eq(roadmapActionControlLinksTable.actionId, id)),
      db
        .select()
        .from(roadmapActionEvidenceItemsTable)
        .where(eq(roadmapActionEvidenceItemsTable.actionId, id))
        .orderBy(roadmapActionEvidenceItemsTable.sortOrder),
      db
        .select()
        .from(roadmapActionDocumentsTable)
        .where(eq(roadmapActionDocumentsTable.actionId, id))
        .orderBy(roadmapActionDocumentsTable.sortOrder),
      db
        .select()
        .from(roadmapActionChecklistItemsTable)
        .where(eq(roadmapActionChecklistItemsTable.actionId, id))
        .orderBy(roadmapActionChecklistItemsTable.sortOrder),
      db
        .select()
        .from(orgRoadmapProgressTable)
        .where(
          and(
            eq(orgRoadmapProgressTable.organizationId, orgId),
            eq(orgRoadmapProgressTable.actionId, id)
          )
        )
        .limit(1),
      db
        .select()
        .from(orgRoadmapChecklistProgressTable)
        .where(
          and(
            eq(orgRoadmapChecklistProgressTable.organizationId, orgId),
            inArray(
              orgRoadmapChecklistProgressTable.checklistItemId,
              (
                await db
                  .select({ id: roadmapActionChecklistItemsTable.id })
                  .from(roadmapActionChecklistItemsTable)
                  .where(eq(roadmapActionChecklistItemsTable.actionId, id))
              ).map((i) => i.id)
            )
          )
        ),
      db
        .select()
        .from(roadmapProcedureStepsTable)
        .where(eq(roadmapProcedureStepsTable.actionId, id))
        .orderBy(roadmapProcedureStepsTable.sortOrder),
      db
        .select()
        .from(orgProcedureStepProgressTable)
        .where(eq(orgProcedureStepProgressTable.organizationId, orgId)),
      db
        .select()
        .from(orgRoadmapEvidenceLinksTable)
        .where(eq(orgRoadmapEvidenceLinksTable.organizationId, orgId)),
    ]);

    const progress = progressRows[0] ?? null;
    const checkProgressMap = new Map(
      checklistProgress.map((p) => [p.checklistItemId, p.completed])
    );
    const stepIds = new Set(procedureSteps.map((s) => s.id));
    const stepProgressMap = new Map(
      stepProgressRows
        .filter((p) => stepIds.has(p.stepId))
        .map((p) => [p.stepId, p])
    );
    const evidenceLinksByItem = new Map<string, typeof evidenceLinkRows>();
    for (const link of evidenceLinkRows) {
      const list = evidenceLinksByItem.get(link.roadmapEvidenceItemId) ?? [];
      list.push(link);
      evidenceLinksByItem.set(link.roadmapEvidenceItemId, list);
    }
    const linkedEvidenceItemIds = new Set(
      evidenceLinkRows.map((l) => l.roadmapEvidenceItemId)
    );

    const computed = computeRoadmapProgress({
      understandAckAt: progress?.understandAckAt ?? null,
      requiredStepIds: procedureSteps
        .filter((s) => s.isRequired)
        .map((s) => s.id),
      stepStatusById: new Map(
        Array.from(stepProgressMap.entries()).map(([stepId, p]) => [
          stepId,
          p.status as ProcedureStepStatus,
        ])
      ),
      requiredEvidenceItemIds: evidenceItems
        .filter((e) => e.isRequired)
        .map((e) => e.id),
      linkedEvidenceItemIds,
      requiredChecklistItemIds: checklistItems
        .filter((i) => i.isRequired)
        .map((i) => i.id),
      completedChecklistItemIds: new Set(
        checklistProgress.filter((p) => p.completed).map((p) => p.checklistItemId)
      ),
      validatedAt: progress?.validatedAt ?? null,
      result: (progress?.result ?? null) as RoadmapResult,
      status: (progress?.status ?? "not_started") as RoadmapStatus,
    });

    res.json({
      ...action,
      controls: controlLinks,
      evidenceItems: evidenceItems.map((item) => ({
        ...item,
        links: evidenceLinksByItem.get(item.id) ?? [],
      })),
      documents,
      checklistItems: checklistItems.map((item) => ({
        ...item,
        completed: checkProgressMap.get(item.id) ?? false,
        completedBy: checklistProgress.find((p) => p.checklistItemId === item.id)
          ?.completedBy ?? null,
        notes: checklistProgress.find((p) => p.checklistItemId === item.id)
          ?.notes ?? null,
      })),
      procedureSteps: procedureSteps.map((step) => ({
        ...step,
        progress: stepProgressMap.get(step.id) ?? null,
      })),
      progress,
      computedProgress: computed,
    });
  }
);

// ── Update Progress ───────────────────────────────────────────────────────────
const updateProgressSchema = z.object({
  status: z
    .enum([
      "not_started",
      "in_progress",
      "evidence_needed",
      "ready_for_review",
      "complete",
      "blocked",
      "not_applicable",
    ])
    .optional(),
  owner: z.string().nullable().optional(),
  targetDate: z.string().nullable().optional(),
  result: z
    .enum(["passed", "passed_with_exceptions", "failed", "needs_follow_up"])
    .nullable()
    .optional(),
  notes: z.string().nullable().optional(),
  overrideJustification: z.string().nullable().optional(),
  overrideApprovedBy: z.string().nullable().optional(),
  overrideApprovedAt: z.string().nullable().optional(),
});

router.patch(
  "/roadmap/actions/:id/progress",
  requireAuth,
  requireOrg,
  requireRoadmapEnabled,
  requireNotAssessor,
  async (req, res) => {
    const { id } = req.params as Record<string, string>;
    const orgId = req.orgId!;

    const parsed = updateProgressSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(422).json({ error: "Invalid input", issues: parsed.error.issues });
      return;
    }
    const {
      status,
      owner,
      targetDate,
      result,
      notes,
      overrideJustification,
      overrideApprovedBy,
      overrideApprovedAt,
    } = parsed.data;

    const [action] = await db
      .select()
      .from(roadmapActionsTable)
      .where(eq(roadmapActionsTable.id, id))
      .limit(1);
    if (!action) {
      res.status(404).json({ error: "Action not found" });
      return;
    }

    // ── not_applicable gate ────────────────────────────────────────────────────
    if (status === "not_applicable") {
      if (!ADMIN_ROLES.has(req.authUser!.role)) {
        res.status(403).json({
          error: "Only admins or compliance managers can mark an action not applicable",
        });
        return;
      }
      if (!overrideJustification) {
        res.status(422).json({
          error: "overrideJustification is required to mark an action not applicable",
        });
        return;
      }
    }

    // ── complete gate ──────────────────────────────────────────────────────────
    let isOverrideComplete = false;

    if (status === "complete") {
      if (!ADMIN_ROLES.has(req.authUser!.role)) {
        res.status(403).json({
          error: "Only admins or compliance managers can mark an action complete",
        });
        return;
      }

      const [existingProgress] = await db
        .select()
        .from(orgRoadmapProgressTable)
        .where(
          and(
            eq(orgRoadmapProgressTable.organizationId, orgId),
            eq(orgRoadmapProgressTable.actionId, id)
          )
        )
        .limit(1);

      const [steps, evidenceItems, evidenceLinks, checklistItems, checklistProgress] =
        await Promise.all([
          db
            .select()
            .from(roadmapProcedureStepsTable)
            .where(eq(roadmapProcedureStepsTable.actionId, id)),
          db
            .select()
            .from(roadmapActionEvidenceItemsTable)
            .where(eq(roadmapActionEvidenceItemsTable.actionId, id)),
          db
            .select()
            .from(orgRoadmapEvidenceLinksTable)
            .where(eq(orgRoadmapEvidenceLinksTable.organizationId, orgId)),
          db
            .select()
            .from(roadmapActionChecklistItemsTable)
            .where(eq(roadmapActionChecklistItemsTable.actionId, id)),
          db
            .select()
            .from(orgRoadmapChecklistProgressTable)
            .where(eq(orgRoadmapChecklistProgressTable.organizationId, orgId)),
        ]);

      const stepProgress = await db
        .select()
        .from(orgProcedureStepProgressTable)
        .where(eq(orgProcedureStepProgressTable.organizationId, orgId));

      const computed = computeRoadmapProgress({
        understandAckAt: existingProgress?.understandAckAt ?? null,
        requiredStepIds: steps.filter((s) => s.isRequired).map((s) => s.id),
        stepStatusById: new Map(
          stepProgress.map((p) => [p.stepId, p.status as ProcedureStepStatus])
        ),
        requiredEvidenceItemIds: evidenceItems
          .filter((e) => e.isRequired)
          .map((e) => e.id),
        linkedEvidenceItemIds: new Set(
          evidenceLinks.map((l) => l.roadmapEvidenceItemId)
        ),
        requiredChecklistItemIds: checklistItems
          .filter((i) => i.isRequired)
          .map((i) => i.id),
        completedChecklistItemIds: new Set(
          checklistProgress.filter((p) => p.completed).map((p) => p.checklistItemId)
        ),
        validatedAt: existingProgress?.validatedAt ?? null,
        result: (result ?? existingProgress?.result ?? null) as RoadmapResult,
        status: "complete",
      });

      if (!computed.readyToComplete) {
        if (
          !overrideJustification ||
          !overrideApprovedBy ||
          !overrideApprovedAt
        ) {
          res.status(409).json({
            error: "Action requirements not met",
            missing: computed.missing,
          });
          return;
        }
        isOverrideComplete = true;
      }
    }

    const existing = await db
      .select()
      .from(orgRoadmapProgressTable)
      .where(
        and(
          eq(orgRoadmapProgressTable.organizationId, orgId),
          eq(orgRoadmapProgressTable.actionId, id)
        )
      )
      .limit(1);

    const overrideApprovedAtDate =
      isOverrideComplete && overrideApprovedAt
        ? new Date(overrideApprovedAt)
        : undefined;

    if (existing.length > 0) {
      await db
        .update(orgRoadmapProgressTable)
        .set({
          ...(status !== undefined && { status: status as any }),
          ...(owner !== undefined && { owner }),
          ...(targetDate !== undefined && { targetDate }),
          ...(result !== undefined && { result: result as any }),
          ...(notes !== undefined && { notes }),
          ...(overrideJustification !== undefined && { overrideJustification }),
          ...(isOverrideComplete && overrideApprovedBy !== undefined && { overrideApprovedBy: overrideApprovedBy ?? null }),
          ...(isOverrideComplete && overrideApprovedAtDate !== undefined && { overrideApprovedAt: overrideApprovedAtDate }),
          ...(status === "complete" && { completedAt: new Date() }),
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(orgRoadmapProgressTable.organizationId, orgId),
            eq(orgRoadmapProgressTable.actionId, id)
          )
        );
    } else {
      await db.insert(orgRoadmapProgressTable).values({
        id: randomUUID(),
        organizationId: orgId,
        actionId: id,
        status: (status as any) ?? "not_started",
        owner: owner ?? null,
        targetDate: targetDate ?? null,
        result: (result as any) ?? null,
        notes: notes ?? null,
        overrideJustification: overrideJustification ?? null,
        ...(isOverrideComplete && overrideApprovedBy !== undefined && { overrideApprovedBy: overrideApprovedBy ?? null }),
        ...(isOverrideComplete && overrideApprovedAtDate !== undefined && { overrideApprovedAt: overrideApprovedAtDate }),
        completedAt: status === "complete" ? new Date() : null,
        updatedAt: new Date(),
      });
    }

    // ── Audit log ──────────────────────────────────────────────────────────────
    if (status === "complete") {
      if (isOverrideComplete) {
        await logAudit(req, "complete", "roadmap_action", id, {
          entityLabel: action.title,
          newValue: {
            action: "roadmap_completion_override_recorded",
            overrideJustification,
            overrideApprovedBy,
            overrideApprovedAt,
          },
        });
      } else {
        await logAudit(req, "complete", "roadmap_action", id, {
          entityLabel: action.title,
          newValue: { action: "action_approved_complete" },
        });
      }
    } else if (status === "ready_for_review") {
      await logAudit(req, "status_changed", "roadmap_action", id, {
        entityLabel: action.title,
        newValue: { action: "action_submitted_for_review" },
      });
    } else if (status === "not_applicable") {
      await logAudit(req, "status_changed", "roadmap_action", id, {
        entityLabel: action.title,
        newValue: {
          action: "roadmap_action_not_applicable_set",
          overrideJustification,
        },
      });
    }

    res.json({ ok: true });
  }
);

// ── Consistency Check ─────────────────────────────────────────────────────────
router.get(
  "/roadmap/actions/:id/consistency",
  requireAuth,
  requireOrg,
  async (req, res) => {
    const { id } = req.params as Record<string, string>;
    const orgId = req.orgId!;

    const [action] = await db
      .select()
      .from(roadmapActionsTable)
      .where(eq(roadmapActionsTable.id, id))
      .limit(1);
    if (!action) {
      res.status(404).json({ error: "Action not found" });
      return;
    }

    const [existingProgress] = await db
      .select()
      .from(orgRoadmapProgressTable)
      .where(
        and(
          eq(orgRoadmapProgressTable.organizationId, orgId),
          eq(orgRoadmapProgressTable.actionId, id)
        )
      )
      .limit(1);

    const [steps, evidenceItems, evidenceLinks, checklistItems, checklistProgress] =
      await Promise.all([
        db
          .select()
          .from(roadmapProcedureStepsTable)
          .where(eq(roadmapProcedureStepsTable.actionId, id)),
        db
          .select()
          .from(roadmapActionEvidenceItemsTable)
          .where(eq(roadmapActionEvidenceItemsTable.actionId, id)),
        db
          .select()
          .from(orgRoadmapEvidenceLinksTable)
          .where(eq(orgRoadmapEvidenceLinksTable.organizationId, orgId)),
        db
          .select()
          .from(roadmapActionChecklistItemsTable)
          .where(eq(roadmapActionChecklistItemsTable.actionId, id)),
        db
          .select()
          .from(orgRoadmapChecklistProgressTable)
          .where(eq(orgRoadmapChecklistProgressTable.organizationId, orgId)),
      ]);

    const stepProgress = await db
      .select()
      .from(orgProcedureStepProgressTable)
      .where(eq(orgProcedureStepProgressTable.organizationId, orgId));

    const computed = computeRoadmapProgress({
      understandAckAt: existingProgress?.understandAckAt ?? null,
      requiredStepIds: steps.filter((s) => s.isRequired).map((s) => s.id),
      stepStatusById: new Map(
        stepProgress.map((p) => [p.stepId, p.status as ProcedureStepStatus])
      ),
      requiredEvidenceItemIds: evidenceItems
        .filter((e) => e.isRequired)
        .map((e) => e.id),
      linkedEvidenceItemIds: new Set(
        evidenceLinks.map((l) => l.roadmapEvidenceItemId)
      ),
      requiredChecklistItemIds: checklistItems
        .filter((i) => i.isRequired)
        .map((i) => i.id),
      completedChecklistItemIds: new Set(
        checklistProgress.filter((p) => p.completed).map((p) => p.checklistItemId)
      ),
      validatedAt: existingProgress?.validatedAt ?? null,
      result: (existingProgress?.result ?? null) as RoadmapResult,
      status: (existingProgress?.status ?? "not_started") as RoadmapStatus,
    });

    const currentStatus = existingProgress?.status ?? "not_started";
    const hasInconsistency = currentStatus === "complete" && !computed.readyToComplete;

    res.json({
      hasInconsistency,
      missing: computed.missing,
      actionId: id,
      status: currentStatus,
    });
  }
);

// ── Record Override (without changing status) ─────────────────────────────────
const overrideSchema = z.object({
  justification: z.string().min(1),
  approvedBy: z.string().min(1),
  approvedDate: z.string().min(1),
});

router.post(
  "/roadmap/actions/:id/override",
  requireAuth,
  requireOrg,
  async (req, res) => {
    const { id } = req.params as Record<string, string>;
    const orgId = req.orgId!;

    if (!ADMIN_ROLES.has(req.authUser!.role)) {
      res.status(403).json({
        error: "Only admins or compliance managers can record an override",
      });
      return;
    }

    const parsed = overrideSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(422).json({ error: "Invalid input", issues: parsed.error.issues });
      return;
    }
    const { justification, approvedBy, approvedDate } = parsed.data;
    const approvedDateParsed = new Date(approvedDate);

    const [action] = await db
      .select()
      .from(roadmapActionsTable)
      .where(eq(roadmapActionsTable.id, id))
      .limit(1);
    if (!action) {
      res.status(404).json({ error: "Action not found" });
      return;
    }

    const existing = await db
      .select()
      .from(orgRoadmapProgressTable)
      .where(
        and(
          eq(orgRoadmapProgressTable.organizationId, orgId),
          eq(orgRoadmapProgressTable.actionId, id)
        )
      )
      .limit(1);

    if (existing.length > 0) {
      await db
        .update(orgRoadmapProgressTable)
        .set({
          overrideJustification: justification,
          overrideApprovedBy: approvedBy,
          overrideApprovedAt: approvedDateParsed,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(orgRoadmapProgressTable.organizationId, orgId),
            eq(orgRoadmapProgressTable.actionId, id)
          )
        );
    } else {
      await db.insert(orgRoadmapProgressTable).values({
        id: randomUUID(),
        organizationId: orgId,
        actionId: id,
        status: "not_started",
        overrideJustification: justification,
        overrideApprovedBy: approvedBy,
        overrideApprovedAt: approvedDateParsed,
        updatedAt: new Date(),
      });
    }

    await logAudit(req, "complete", "roadmap_action", id, {
      entityLabel: action.title,
      newValue: {
        action: "roadmap_completion_override_recorded",
        actionId: id,
        justification,
        approvedBy,
        approvedDate,
      },
    });

    res.json({ ok: true });
  }
);

// ── Reopen Action ─────────────────────────────────────────────────────────────
router.post(
  "/roadmap/actions/:id/reopen",
  requireAuth,
  requireOrg,
  async (req, res) => {
    const { id } = req.params as Record<string, string>;
    const orgId = req.orgId!;

    if (!ADMIN_ROLES.has(req.authUser!.role)) {
      res.status(403).json({
        error: "Only admins or compliance managers can reopen an action",
      });
      return;
    }

    const [action] = await db
      .select()
      .from(roadmapActionsTable)
      .where(eq(roadmapActionsTable.id, id))
      .limit(1);
    if (!action) {
      res.status(404).json({ error: "Action not found" });
      return;
    }

    const existing = await db
      .select()
      .from(orgRoadmapProgressTable)
      .where(
        and(
          eq(orgRoadmapProgressTable.organizationId, orgId),
          eq(orgRoadmapProgressTable.actionId, id)
        )
      )
      .limit(1);

    if (existing.length === 0) {
      res.status(404).json({ error: "No progress record found" });
      return;
    }

    await db
      .update(orgRoadmapProgressTable)
      .set({
        status: "in_progress",
        completedAt: null,
        result: null,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(orgRoadmapProgressTable.organizationId, orgId),
          eq(orgRoadmapProgressTable.actionId, id)
        )
      );

    await logAudit(req, "reopened", "roadmap_action", id, {
      entityLabel: action.title,
      newValue: { action: "roadmap_action_reopened", actionId: id },
    });

    res.json({ ok: true });
  }
);

// ── Acknowledge Overview / Understand ─────────────────────────────────────────
router.post(
  "/roadmap/actions/:id/understand",
  requireAuth,
  requireOrg,
  requireNotAssessor,
  async (req, res) => {
    const { id } = req.params as Record<string, string>;
    const orgId = req.orgId!;

    const [action] = await db
      .select()
      .from(roadmapActionsTable)
      .where(eq(roadmapActionsTable.id, id))
      .limit(1);
    if (!action) {
      res.status(404).json({ error: "Action not found" });
      return;
    }

    const existing = await db
      .select()
      .from(orgRoadmapProgressTable)
      .where(
        and(
          eq(orgRoadmapProgressTable.organizationId, orgId),
          eq(orgRoadmapProgressTable.actionId, id)
        )
      )
      .limit(1);

    const now = new Date();
    if (existing.length > 0) {
      await db
        .update(orgRoadmapProgressTable)
        .set({
          understandAckAt: now,
          understandAckBy: req.authUser!.id,
          status:
            existing[0].status === "not_started"
              ? "in_progress"
              : existing[0].status,
          updatedAt: now,
        })
        .where(
          and(
            eq(orgRoadmapProgressTable.organizationId, orgId),
            eq(orgRoadmapProgressTable.actionId, id)
          )
        );
    } else {
      await db.insert(orgRoadmapProgressTable).values({
        id: randomUUID(),
        organizationId: orgId,
        actionId: id,
        status: "in_progress",
        understandAckAt: now,
        understandAckBy: req.authUser!.id,
        updatedAt: now,
      });
    }

    await logAudit(req, "acknowledged", "roadmap_action", id, {
      entityLabel: action.title,
      newValue: { action: "overview_acknowledged" },
    });

    res.json({ ok: true });
  }
);

// ── Record Validation Result ──────────────────────────────────────────────────
const validationSchema = z.object({
  result: z.enum([
    "passed",
    "passed_with_exceptions",
    "failed",
    "needs_follow_up",
  ]),
  validationNotes: z.string().nullable().optional(),
});

router.post(
  "/roadmap/actions/:id/validation",
  requireAuth,
  requireOrg,
  requireRole("admin", "compliance_manager", "reviewer", "it_contributor"),
  async (req, res) => {
    const { id } = req.params as Record<string, string>;
    const orgId = req.orgId!;

    const parsed = validationSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(422).json({ error: "Invalid input", issues: parsed.error.issues });
      return;
    }

    const [action] = await db
      .select()
      .from(roadmapActionsTable)
      .where(eq(roadmapActionsTable.id, id))
      .limit(1);
    if (!action) {
      res.status(404).json({ error: "Action not found" });
      return;
    }

    const { result, validationNotes } = parsed.data;
    const now = new Date();

    const existing = await db
      .select()
      .from(orgRoadmapProgressTable)
      .where(
        and(
          eq(orgRoadmapProgressTable.organizationId, orgId),
          eq(orgRoadmapProgressTable.actionId, id)
        )
      )
      .limit(1);

    if (existing.length > 0) {
      await db
        .update(orgRoadmapProgressTable)
        .set({
          result: result as any,
          validationNotes: validationNotes ?? null,
          validatedAt: now,
          validatedBy: req.authUser!.id,
          status:
            result === "failed"
              ? "blocked"
              : existing[0].status === "not_started" ||
                  existing[0].status === "in_progress"
                ? "ready_for_review"
                : existing[0].status,
          updatedAt: now,
        })
        .where(
          and(
            eq(orgRoadmapProgressTable.organizationId, orgId),
            eq(orgRoadmapProgressTable.actionId, id)
          )
        );
    } else {
      await db.insert(orgRoadmapProgressTable).values({
        id: randomUUID(),
        organizationId: orgId,
        actionId: id,
        status: result === "failed" ? "blocked" : "ready_for_review",
        result: result as any,
        validationNotes: validationNotes ?? null,
        validatedAt: now,
        validatedBy: req.authUser!.id,
        updatedAt: now,
      });
    }

    await logAudit(req, "validated", "roadmap_action", id, {
      entityLabel: action.title,
      newValue: {
        action: "validation_result_recorded",
        result,
        validationNotes: validationNotes ?? null,
      },
    });

    res.json({ ok: true });
  }
);

// ── Link / Unlink Evidence ─────────────────────────────────────────────────────
const linkEvidenceSchema = z.object({
  evidenceId: z.string().min(1),
});

router.post(
  "/roadmap/evidence-items/:itemId/link",
  requireAuth,
  requireOrg,
  requireNotAssessor,
  async (req, res) => {
    const { itemId } = req.params as Record<string, string>;
    const orgId = req.orgId!;

    const parsed = linkEvidenceSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(422).json({ error: "Invalid input", issues: parsed.error.issues });
      return;
    }

    const [roadmapEvidenceItem] = await db
      .select()
      .from(roadmapActionEvidenceItemsTable)
      .where(eq(roadmapActionEvidenceItemsTable.id, itemId))
      .limit(1);
    if (!roadmapEvidenceItem) {
      res.status(404).json({ error: "Roadmap evidence item not found" });
      return;
    }

    const [evidenceItem] = await db
      .select()
      .from(evidenceItemsTable)
      .where(
        and(
          eq(evidenceItemsTable.id, parsed.data.evidenceId),
          eq(evidenceItemsTable.organizationId, orgId)
        )
      )
      .limit(1);
    if (!evidenceItem) {
      res.status(404).json({ error: "Evidence item not found in this organization" });
      return;
    }

    const existing = await db
      .select()
      .from(orgRoadmapEvidenceLinksTable)
      .where(
        and(
          eq(orgRoadmapEvidenceLinksTable.organizationId, orgId),
          eq(orgRoadmapEvidenceLinksTable.roadmapEvidenceItemId, itemId),
          eq(orgRoadmapEvidenceLinksTable.evidenceId, parsed.data.evidenceId)
        )
      )
      .limit(1);

    if (existing.length === 0) {
      await db.insert(orgRoadmapEvidenceLinksTable).values({
        id: randomUUID(),
        organizationId: orgId,
        roadmapEvidenceItemId: itemId,
        evidenceId: parsed.data.evidenceId,
        linkedBy: req.authUser!.id,
        linkedAt: new Date(),
      });

      await logAudit(req, "link_added", "roadmap_evidence_item", itemId, {
        entityLabel: roadmapEvidenceItem.title,
        newValue: {
          action: "evidence_linked_to_roadmap",
          evidenceId: parsed.data.evidenceId,
          roadmapEvidenceItemId: itemId,
        },
      });
    }

    res.json({ ok: true });
  }
);

router.delete(
  "/roadmap/evidence-items/:itemId/link/:evidenceId",
  requireAuth,
  requireOrg,
  requireNotAssessor,
  async (req, res) => {
    const { itemId, evidenceId } = req.params as Record<string, string>;
    const orgId = req.orgId!;

    // Look up the roadmap evidence item title for audit logging
    const [roadmapEvidenceItem] = await db
      .select({ title: roadmapActionEvidenceItemsTable.title })
      .from(roadmapActionEvidenceItemsTable)
      .where(eq(roadmapActionEvidenceItemsTable.id, itemId))
      .limit(1);

    await db
      .delete(orgRoadmapEvidenceLinksTable)
      .where(
        and(
          eq(orgRoadmapEvidenceLinksTable.organizationId, orgId),
          eq(orgRoadmapEvidenceLinksTable.roadmapEvidenceItemId, itemId),
          eq(orgRoadmapEvidenceLinksTable.evidenceId, evidenceId)
        )
      );

    await logAudit(req, "link_removed", "roadmap_evidence_item", itemId, {
      entityLabel: roadmapEvidenceItem?.title ?? itemId,
      newValue: {
        action: "evidence_unlinked_from_roadmap",
        evidenceId,
        roadmapEvidenceItemId: itemId,
      },
    });

    res.json({ ok: true });
  }
);

// ── Toggle Checklist Item ─────────────────────────────────────────────────────
const toggleChecklistSchema = z.object({
  completed: z.boolean(),
  notes: z.string().nullable().optional(),
});

router.post(
  "/roadmap/actions/:id/checklist/:itemId",
  requireAuth,
  requireOrg,
  requireNotAssessor,
  async (req, res) => {
    const { itemId } = req.params as Record<string, string>;
    const orgId = req.orgId!;

    const parsed = toggleChecklistSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(422).json({ error: "Invalid input", issues: parsed.error.issues });
      return;
    }
    const { completed, notes } = parsed.data;

    const existing = await db
      .select()
      .from(orgRoadmapChecklistProgressTable)
      .where(
        and(
          eq(orgRoadmapChecklistProgressTable.organizationId, orgId),
          eq(orgRoadmapChecklistProgressTable.checklistItemId, itemId)
        )
      )
      .limit(1);

    if (existing.length > 0) {
      await db
        .update(orgRoadmapChecklistProgressTable)
        .set({
          completed,
          completedAt: completed ? new Date() : null,
          completedBy: completed ? req.authUser!.id : null,
          ...(notes !== undefined && { notes }),
        })
        .where(
          and(
            eq(orgRoadmapChecklistProgressTable.organizationId, orgId),
            eq(orgRoadmapChecklistProgressTable.checklistItemId, itemId)
          )
        );
    } else {
      await db.insert(orgRoadmapChecklistProgressTable).values({
        id: randomUUID(),
        organizationId: orgId,
        checklistItemId: itemId,
        completed,
        completedAt: completed ? new Date() : null,
        completedBy: completed ? req.authUser!.id : null,
        notes: notes ?? null,
      });
    }

    res.json({ ok: true });
  }
);

// ── Coverage Matrix ───────────────────────────────────────────────────────────
router.get(
  "/roadmap/coverage-matrix",
  requireAuth,
  requireOrg,
  requireRoadmapEnabled,
  async (req, res) => {
    const orgId = req.orgId!;
    const { domain } = req.query as { domain?: string };

    const actions = await db
      .select({
        id: roadmapActionsTable.id,
        title: roadmapActionsTable.title,
        priority: roadmapActionsTable.priority,
        phase: roadmapActionsTable.phase,
      })
      .from(roadmapActionsTable)
      .orderBy(roadmapActionsTable.sortOrder);

    let controlQuery = db
      .select({
        controlId: controlsTable.id,
        controlRef: controlsTable.controlId,
        controlTitle: controlsTable.title,
        level: controlsTable.level,
        domain: domainsTable.name,
        domainId: domainsTable.id,
      })
      .from(controlsTable)
      .innerJoin(domainsTable, eq(controlsTable.domainId, domainsTable.id))
      .orderBy(controlsTable.sortOrder) as any;

    if (domain) {
      controlQuery = controlQuery.where(eq(domainsTable.name, domain));
    }

    const controls = await controlQuery;

    const links = await db
      .select({
        actionId: roadmapActionControlLinksTable.actionId,
        controlId: roadmapActionControlLinksTable.controlId,
        supportType: roadmapActionControlLinksTable.supportType,
      })
      .from(roadmapActionControlLinksTable);

    const progressRows = await db
      .select()
      .from(orgRoadmapProgressTable)
      .where(eq(orgRoadmapProgressTable.organizationId, orgId));

    const progressMap = new Map(progressRows.map((p) => [p.actionId, p.status]));

    const linkMap = new Map<string, string>();
    for (const link of links) {
      linkMap.set(`${link.actionId}:${link.controlId}`, link.supportType);
    }

    res.json({
      actions: actions.map((a) => ({
        ...a,
        status: progressMap.get(a.id) ?? "not_started",
      })),
      controls,
      matrix: Object.fromEntries(linkMap),
    });
  }
);

// ── Actions for a specific control (used on Control Detail page) ──────────────
router.get(
  "/roadmap/controls/:controlId/actions",
  requireAuth,
  requireOrg,
  async (req, res) => {
    const { controlId } = req.params as Record<string, string>;
    const orgId = req.orgId!;

    const [control] = await db
      .select({ id: controlsTable.id })
      .from(controlsTable)
      .where(eq(controlsTable.controlId, controlId))
      .limit(1);

    if (!control) {
      res.status(404).json({ error: "Control not found" });
      return;
    }

    const links = await db
      .select({
        actionId: roadmapActionControlLinksTable.actionId,
        supportType: roadmapActionControlLinksTable.supportType,
      })
      .from(roadmapActionControlLinksTable)
      .where(eq(roadmapActionControlLinksTable.controlId, control.id));

    if (links.length === 0) {
      res.json([]);
      return;
    }

    const actionIds = links.map((l) => l.actionId);
    const actions = await db
      .select()
      .from(roadmapActionsTable)
      .where(inArray(roadmapActionsTable.id, actionIds))
      .orderBy(roadmapActionsTable.sortOrder);

    const progressRows = await db
      .select()
      .from(orgRoadmapProgressTable)
      .where(
        and(
          eq(orgRoadmapProgressTable.organizationId, orgId),
          inArray(orgRoadmapProgressTable.actionId, actionIds)
        )
      );

    const progressMap = new Map(progressRows.map((p) => [p.actionId, p]));
    const supportMap = new Map(links.map((l) => [l.actionId, l.supportType]));

    res.json(
      actions.map((a) => ({
        id: a.id,
        title: a.title,
        category: a.category,
        priority: a.priority,
        phase: a.phase,
        phaseName: a.phaseName,
        impactScore: a.impactScore,
        supportType: supportMap.get(a.id) ?? "partial_support",
        status: progressMap.get(a.id)?.status ?? "not_started",
        owner: progressMap.get(a.id)?.owner ?? null,
        targetDate: progressMap.get(a.id)?.targetDate ?? null,
      }))
    );
  }
);

// ── Procedure Steps ────────────────────────────────────────────────────────────

router.get(
  "/roadmap/actions/:id/procedure-steps",
  requireAuth,
  requireOrg,
  async (req, res) => {
    const { id } = req.params as Record<string, string>;
    const orgId = req.orgId!;

    const steps = await db
      .select()
      .from(roadmapProcedureStepsTable)
      .where(eq(roadmapProcedureStepsTable.actionId, id))
      .orderBy(asc(roadmapProcedureStepsTable.sortOrder));

    if (!steps.length) return res.json([]);

    const stepIds = steps.map((s) => s.id);
    const progress = await db
      .select()
      .from(orgProcedureStepProgressTable)
      .where(
        and(
          eq(orgProcedureStepProgressTable.organizationId, orgId),
          inArray(orgProcedureStepProgressTable.stepId, stepIds)
        )
      );

    const progressMap = new Map(progress.map((p) => [p.stepId, p]));
    return res.json(steps.map((s) => ({ ...s, progress: progressMap.get(s.id) ?? null })));
  }
);

const stepProgressSchema = z.object({
  status: z.enum([
    "not_started",
    "in_progress",
    "complete",
    "blocked",
    "not_applicable",
  ]),
  notes: z.string().nullable().optional(),
});

router.patch(
  "/roadmap/procedure-steps/:stepId/progress",
  requireAuth,
  requireOrg,
  requireNotAssessor,
  async (req, res) => {
    const { stepId } = req.params as Record<string, string>;
    const orgId = req.orgId!;

    const parsed = stepProgressSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(422).json({ error: "Invalid input", issues: parsed.error.issues });
      return;
    }
    const { status, notes } = parsed.data;

    const [step] = await db
      .select({ id: roadmapProcedureStepsTable.id })
      .from(roadmapProcedureStepsTable)
      .where(eq(roadmapProcedureStepsTable.id, stepId))
      .limit(1);

    if (!step) return res.status(404).json({ error: "Step not found" });

    const [existing] = await db
      .select({ id: orgProcedureStepProgressTable.id })
      .from(orgProcedureStepProgressTable)
      .where(
        and(
          eq(orgProcedureStepProgressTable.organizationId, orgId),
          eq(orgProcedureStepProgressTable.stepId, stepId)
        )
      )
      .limit(1);

    const completedAt = status === "complete" ? new Date() : null;
    const completedBy = status === "complete" ? req.authUser!.id : null;

    if (existing) {
      await db
        .update(orgProcedureStepProgressTable)
        .set({ status, notes: notes ?? null, completedBy, completedAt, updatedAt: new Date() })
        .where(eq(orgProcedureStepProgressTable.id, existing.id));
    } else {
      await db.insert(orgProcedureStepProgressTable).values({
        id: randomUUID(),
        organizationId: orgId,
        stepId,
        status,
        notes: notes ?? null,
        completedBy,
        completedAt,
        updatedAt: new Date(),
      });
    }
    return res.json({ ok: true });
  }
);

router.post(
  "/roadmap/actions/:id/procedure-steps",
  requireAuth,
  requireOrg,
  async (req, res) => {
    const role = req.authUser?.role;
    if (role !== "admin" && role !== "compliance_manager") {
      return res.status(403).json({ error: "Forbidden" });
    }
    const { id } = req.params as Record<string, string>;
    const {
      stepNumber, title, purpose, systemPortal, navigationPath,
      instructions, recommendedSettings, expectedResult, evidenceToCapture,
      suggestedFilename, relatedControls, ownerRole, ifThisFails, isRequired, sortOrder,
    } = req.body;

    const [newStep] = await db
      .insert(roadmapProcedureStepsTable)
      .values({
        id: randomUUID(),
        actionId: id,
        stepNumber: stepNumber ?? 1,
        title,
        purpose: purpose ?? "",
        systemPortal: systemPortal ?? "",
        navigationPath: navigationPath ?? "",
        instructions: instructions ?? "",
        recommendedSettings: recommendedSettings ?? null,
        expectedResult: expectedResult ?? "",
        evidenceToCapture: evidenceToCapture ?? "",
        suggestedFilename: suggestedFilename ?? "",
        relatedControls: relatedControls ?? [],
        ownerRole: ownerRole ?? "Compliance Manager",
        ifThisFails: ifThisFails ?? "",
        isRequired: isRequired ?? true,
        isCustom: true,
        sortOrder: sortOrder ?? 0,
      })
      .returning();

    return res.json(newStep);
  }
);

router.put(
  "/roadmap/procedure-steps/:stepId",
  requireAuth,
  requireOrg,
  async (req, res) => {
    const role = req.authUser?.role;
    if (role !== "admin" && role !== "compliance_manager") {
      return res.status(403).json({ error: "Forbidden" });
    }
    const { stepId } = req.params as Record<string, string>;
    const {
      title, purpose, systemPortal, navigationPath, instructions,
      recommendedSettings, expectedResult, evidenceToCapture, suggestedFilename,
      relatedControls, ownerRole, ifThisFails, isRequired, sortOrder,
    } = req.body;

    const [updated] = await db
      .update(roadmapProcedureStepsTable)
      .set({
        title, purpose, systemPortal, navigationPath, instructions,
        recommendedSettings: recommendedSettings ?? null,
        expectedResult, evidenceToCapture, suggestedFilename,
        relatedControls: relatedControls ?? [],
        ownerRole, ifThisFails,
        isRequired: isRequired ?? true,
        sortOrder: sortOrder ?? 0,
        updatedAt: new Date(),
      })
      .where(eq(roadmapProcedureStepsTable.id, stepId))
      .returning();

    if (!updated) return res.status(404).json({ error: "Step not found" });
    return res.json(updated);
  }
);

router.delete(
  "/roadmap/procedure-steps/:stepId",
  requireAuth,
  requireOrg,
  async (req, res) => {
    const role = req.authUser?.role;
    if (role !== "admin" && role !== "compliance_manager") {
      return res.status(403).json({ error: "Forbidden" });
    }
    await db
      .delete(roadmapProcedureStepsTable)
      .where(eq(roadmapProcedureStepsTable.id, req.params.stepId as string));
    return res.json({ ok: true });
  }
);

// ── Seed Function ─────────────────────────────────────────────────────────────

/** Shared helper to seed a single action and its linked data. */
async function seedOneAction(
  seed: import("../data/roadmap-seed").RoadmapSeedAction,
  controlMap: Map<string, string>
): Promise<void> {
  await db.insert(roadmapActionsTable).values({
    id: seed.id,
    title: seed.title,
    category: seed.category,
    phase: seed.phase,
    phaseName: seed.phaseName,
    priority: seed.priority,
    effort: seed.effort,
    impactScore: seed.impactScore,
    purpose: seed.purpose,
    whyItMatters: seed.whyItMatters,
    operatingProcedure: seed.operatingProcedure,
    testProcedure: seed.testProcedure,
    sortOrder: seed.sortOrder,
    profileKey: seed.profileKey ?? "CMMC_L2_R2",
  });

  for (const ctrl of seed.controls) {
    const dbId = controlMap.get(ctrl.controlId);
    if (!dbId) continue;
    await db.insert(roadmapActionControlLinksTable).values({
      id: randomUUID(),
      actionId: seed.id,
      controlId: dbId,
      supportType: ctrl.supportType,
    });
  }

  for (let i = 0; i < seed.evidenceItems.length; i++) {
    const ev = seed.evidenceItems[i]!;
    await db.insert(roadmapActionEvidenceItemsTable).values({
      id: randomUUID(),
      actionId: seed.id,
      title: ev.title,
      evidenceType: ev.evidenceType,
      suggestedFilename: ev.suggestedFilename,
      sourceSystem: ev.sourceSystem,
      mustShow: ev.mustShow,
      sortOrder: i,
    });
  }

  for (let i = 0; i < seed.documents.length; i++) {
    const doc = seed.documents[i]!;
    await db.insert(roadmapActionDocumentsTable).values({
      id: randomUUID(),
      actionId: seed.id,
      title: doc.title,
      docType: doc.docType,
      sortOrder: i,
    });
  }

  for (let i = 0; i < seed.checklistItems.length; i++) {
    await db.insert(roadmapActionChecklistItemsTable).values({
      id: randomUUID(),
      actionId: seed.id,
      label: seed.checklistItems[i]!,
      sortOrder: i,
    });
  }
}

export async function seedRoadmapActions(): Promise<void> {
  // ── Phase 1: Back-fill profile_key on existing L2 actions ───────────────────
  // Existing actions seeded before profile_key was added have NULL — treat them as L2.
  await db
    .update(roadmapActionsTable)
    .set({ profileKey: "CMMC_L2_R2" })
    .where(isNull(roadmapActionsTable.profileKey));

  // ── Phase 2: Idempotent insert of all seed actions ──────────────────────────
  const existingRows = await db
    .select({ id: roadmapActionsTable.id })
    .from(roadmapActionsTable);
  const existingIds = new Set(existingRows.map((r) => r.id));

  const allControls = await db
    .select({ id: controlsTable.id, controlId: controlsTable.controlId })
    .from(controlsTable);
  const controlMap = new Map(allControls.map((c) => [c.controlId, c.id]));

  // Seed L2 actions (first-time DB setup)
  for (const seed of ROADMAP_SEED) {
    if (existingIds.has(seed.id)) continue;
    await seedOneAction(seed, controlMap);
  }

  // Seed L1 actions (new — always idempotent)
  for (const seed of L1_ROADMAP_SEED) {
    if (existingIds.has(seed.id)) continue;
    await seedOneAction(seed, controlMap);
  }
}

export async function seedProcedureSteps(): Promise<void> {
  const existingRows = await db
    .select({ id: roadmapProcedureStepsTable.id })
    .from(roadmapProcedureStepsTable);
  const existingIds = new Set(existingRows.map((r) => r.id));

  const toInsert = PROCEDURE_STEPS_SEED.filter(
    (step) => !existingIds.has(step.id)
  );
  if (toInsert.length === 0) return;

  for (const step of toInsert) {
    await db.insert(roadmapProcedureStepsTable).values({
      id: step.id,
      actionId: step.actionId,
      stepNumber: step.stepNumber,
      title: step.title,
      purpose: step.purpose,
      systemPortal: step.systemPortal,
      navigationPath: step.navigationPath,
      instructions: step.instructions,
      recommendedSettings: step.recommendedSettings ?? null,
      expectedResult: step.expectedResult,
      evidenceToCapture: step.evidenceToCapture,
      suggestedFilename: step.suggestedFilename,
      relatedControls: step.relatedControls,
      ownerRole: step.ownerRole,
      ifThisFails: step.ifThisFails,
      isRequired: step.isRequired,
      isCustom: false,
      sortOrder: step.sortOrder,
    });
  }
}

export default router;
