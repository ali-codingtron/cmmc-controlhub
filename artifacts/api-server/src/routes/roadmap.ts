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
} from "@workspace/db";
import { eq, and, inArray } from "drizzle-orm";
import { requireAuth } from "../lib/auth";
import { requireOrg } from "../middleware/org";
import { randomUUID } from "crypto";
import { ROADMAP_SEED } from "../data/roadmap-seed";

const router = Router();

// ── List Actions ──────────────────────────────────────────────────────────────
router.get(
  "/roadmap/actions",
  requireAuth,
  requireOrg,
  async (req, res) => {
    const orgId = req.orgId!;

    const actions = await db
      .select()
      .from(roadmapActionsTable)
      .orderBy(roadmapActionsTable.sortOrder);

    if (actions.length === 0) {
      res.json([]);
      return;
    }

    const actionIds = actions.map((a) => a.id);

    const [controlLinks, progressRows, checklistItems, checklistProgress] =
      await Promise.all([
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

    const result = actions.map((action) => {
      const links = controlLinks.filter((l) => l.actionId === action.id);
      const progress = progressMap.get(action.id);
      const items = checklistMap.get(action.id) ?? [];
      const completedChecklist = items.filter((i) =>
        checkProgressSet.has(i.id)
      ).length;

      const domains = [...new Set(links.map((l) => l.domain))];

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
        evidenceCount: 0,
        documentCount: 0,
        domains,
        status: progress?.status ?? "not_started",
        owner: progress?.owner ?? null,
        targetDate: progress?.targetDate ?? null,
        result: progress?.result ?? null,
        checklistTotal: items.length,
        checklistCompleted: completedChecklist,
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
  async (req, res) => {
    const { id } = req.params;
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
    ]);

    const progress = progressRows[0] ?? null;
    const checkProgressMap = new Map(
      checklistProgress.map((p) => [p.checklistItemId, p.completed])
    );

    res.json({
      ...action,
      controls: controlLinks,
      evidenceItems,
      documents,
      checklistItems: checklistItems.map((item) => ({
        ...item,
        completed: checkProgressMap.get(item.id) ?? false,
      })),
      progress,
    });
  }
);

// ── Update Progress ───────────────────────────────────────────────────────────
router.patch(
  "/roadmap/actions/:id/progress",
  requireAuth,
  requireOrg,
  async (req, res) => {
    const { id } = req.params;
    const orgId = req.orgId!;
    const { status, owner, targetDate, result, notes } = req.body as {
      status?: string;
      owner?: string;
      targetDate?: string;
      result?: string;
      notes?: string;
    };

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
          ...(status !== undefined && { status: status as any }),
          ...(owner !== undefined && { owner }),
          ...(targetDate !== undefined && { targetDate }),
          ...(result !== undefined && { result: result as any }),
          ...(notes !== undefined && { notes }),
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
        completedAt: status === "complete" ? new Date() : null,
        updatedAt: new Date(),
      });
    }

    res.json({ ok: true });
  }
);

// ── Toggle Checklist Item ─────────────────────────────────────────────────────
router.post(
  "/roadmap/actions/:id/checklist/:itemId",
  requireAuth,
  requireOrg,
  async (req, res) => {
    const { itemId } = req.params;
    const orgId = req.orgId!;
    const { completed } = req.body as { completed: boolean };

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
    const { controlId } = req.params;
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

// ── Seed Function ─────────────────────────────────────────────────────────────
export async function seedRoadmapActions(): Promise<void> {
  const [existing] = await db
    .select({ id: roadmapActionsTable.id })
    .from(roadmapActionsTable)
    .limit(1);

  if (existing) return;

  const allControls = await db
    .select({ id: controlsTable.id, controlId: controlsTable.controlId })
    .from(controlsTable);
  const controlMap = new Map(allControls.map((c) => [c.controlId, c.id]));

  for (const seed of ROADMAP_SEED) {
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
      const ev = seed.evidenceItems[i];
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
      const doc = seed.documents[i];
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
        label: seed.checklistItems[i],
        sortOrder: i,
      });
    }
  }
}

export default router;
