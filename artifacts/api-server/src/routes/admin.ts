import { Router } from "express";
import { db, controlsTable, controlAssessmentsTable, auditLogsTable, organizationsTable } from "@workspace/db";
import { eq, and, or, isNull, sql } from "drizzle-orm";
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

export default router;
