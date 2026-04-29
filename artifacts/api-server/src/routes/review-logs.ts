import { Router } from "express";
import {
  db,
  reviewLogsTable,
  evidenceItemsTable,
  evidenceControlLinksTable,
  usersTable,
} from "@workspace/db";
import { eq, and, desc } from "drizzle-orm";
import { requireAuth } from "../lib/auth";
import { requireOrg } from "../middleware/org";
import { logAudit } from "../lib/audit";
import { randomUUID } from "crypto";

const router = Router();

// Map review type → default controls it satisfies
const REVIEW_TYPE_CONTROLS: Record<string, string[]> = {
  access_review: ["03.01", "03.02", "03.09"],
  log_review: ["03.14", "03.04"],
  backup_review: ["11.01", "11.02"],
  vulnerability_review: ["14.01", "14.02", "14.06"],
  training_review: ["02.02", "02.03"],
  supplier_review: ["15.01", "15.02"],
};

const REVIEW_TYPE_LABELS: Record<string, string> = {
  access_review: "Access Review",
  log_review: "Log Review",
  backup_review: "Backup Review",
  vulnerability_review: "Vulnerability Review",
  training_review: "Training Review",
  supplier_review: "Supplier Review",
};

const logSelect = {
  id: reviewLogsTable.id,
  organizationId: reviewLogsTable.organizationId,
  reviewType: reviewLogsTable.reviewType,
  title: reviewLogsTable.title,
  status: reviewLogsTable.status,
  formData: reviewLogsTable.formData,
  controlIds: reviewLogsTable.controlIds,
  evidenceItemId: reviewLogsTable.evidenceItemId,
  reviewedById: reviewLogsTable.reviewedById,
  reviewerName: usersTable.name,
  reviewedAt: reviewLogsTable.reviewedAt,
  periodStart: reviewLogsTable.periodStart,
  periodEnd: reviewLogsTable.periodEnd,
  notes: reviewLogsTable.notes,
  createdAt: reviewLogsTable.createdAt,
  updatedAt: reviewLogsTable.updatedAt,
};

// GET /api/review-logs
router.get("/review-logs", requireAuth, requireOrg, async (req, res) => {
  const { reviewType, status } = req.query as Record<string, string>;
  const orgId = req.orgId!;

  const conditions = [eq(reviewLogsTable.organizationId, orgId)];
  if (reviewType) conditions.push(eq(reviewLogsTable.reviewType, reviewType as any));
  if (status) conditions.push(eq(reviewLogsTable.status, status as any));

  const items = await db
    .select(logSelect)
    .from(reviewLogsTable)
    .leftJoin(usersTable, eq(usersTable.id, reviewLogsTable.reviewedById))
    .where(and(...conditions))
    .orderBy(desc(reviewLogsTable.createdAt));

  res.json(items);
});

// GET /api/review-logs/control-map
// Returns the default control IDs for each review type
router.get("/review-logs/control-map", requireAuth, async (_req, res) => {
  res.json(REVIEW_TYPE_CONTROLS);
});

// GET /api/review-logs/:id
router.get("/review-logs/:id", requireAuth, requireOrg, async (req, res) => {
  const orgId = req.orgId!;
  const [item] = await db
    .select(logSelect)
    .from(reviewLogsTable)
    .leftJoin(usersTable, eq(usersTable.id, reviewLogsTable.reviewedById))
    .where(
      and(
        eq(reviewLogsTable.id, req.params.id),
        eq(reviewLogsTable.organizationId, orgId)
      )
    );

  if (!item) return res.status(404).json({ error: "Not found" });
  res.json(item);
});

// POST /api/review-logs
router.post("/review-logs", requireAuth, requireOrg, async (req, res) => {
  const orgId = req.orgId!;
  const userId = req.user!.id;
  const { reviewType, title, formData, controlIds, periodStart, periodEnd, notes } = req.body;

  if (!reviewType || !title) {
    return res.status(400).json({ error: "reviewType and title are required" });
  }

  const id = randomUUID();
  const defaultControls = REVIEW_TYPE_CONTROLS[reviewType] ?? [];
  const resolvedControlIds = controlIds?.length ? controlIds : defaultControls;

  const [created] = await db
    .insert(reviewLogsTable)
    .values({
      id,
      organizationId: orgId,
      reviewType,
      title,
      status: "draft",
      formData: formData ?? {},
      controlIds: resolvedControlIds,
      reviewedById: userId,
      periodStart: periodStart ? new Date(periodStart) : null,
      periodEnd: periodEnd ? new Date(periodEnd) : null,
      notes: notes || null,
      updatedAt: new Date(),
    })
    .returning();

  res.status(201).json(created);
});

// PATCH /api/review-logs/:id
router.patch("/review-logs/:id", requireAuth, requireOrg, async (req, res) => {
  const orgId = req.orgId!;
  const [existing] = await db
    .select({ id: reviewLogsTable.id })
    .from(reviewLogsTable)
    .where(
      and(
        eq(reviewLogsTable.id, req.params.id),
        eq(reviewLogsTable.organizationId, orgId)
      )
    );

  if (!existing) return res.status(404).json({ error: "Not found" });

  const allowed = ["title", "formData", "controlIds", "periodStart", "periodEnd", "notes"];
  const updates: Record<string, any> = { updatedAt: new Date() };
  for (const key of allowed) {
    if (req.body[key] !== undefined) {
      updates[key] =
        key === "periodStart" || key === "periodEnd"
          ? new Date(req.body[key])
          : req.body[key];
    }
  }

  const [updated] = await db
    .update(reviewLogsTable)
    .set(updates)
    .where(eq(reviewLogsTable.id, req.params.id))
    .returning();

  res.json(updated);
});

// POST /api/review-logs/:id/complete
// Marks a review log as completed, auto-creates an evidence record, links to controls
router.post(
  "/review-logs/:id/complete",
  requireAuth,
  requireOrg,
  async (req, res) => {
    const orgId = req.orgId!;
    const userId = req.user!.id;

    const [log] = await db
      .select()
      .from(reviewLogsTable)
      .where(
        and(
          eq(reviewLogsTable.id, req.params.id),
          eq(reviewLogsTable.organizationId, orgId)
        )
      );

    if (!log) return res.status(404).json({ error: "Not found" });
    if (log.status === "completed") {
      return res.status(400).json({ error: "Already completed" });
    }

    const now = new Date();
    const label = REVIEW_TYPE_LABELS[log.reviewType] ?? log.reviewType;
    const evidenceId = randomUUID();

    // Create evidence record
    await db.insert(evidenceItemsTable).values({
      id: evidenceId,
      organizationId: orgId,
      title: `${label} — ${log.title}`,
      description: `Completed ${label.toLowerCase()} for period ${
        log.periodStart
          ? new Date(log.periodStart).toLocaleDateString()
          : "unspecified"
      }${log.periodEnd ? " to " + new Date(log.periodEnd).toLocaleDateString() : ""}`,
      evidenceType: "approval_record",
      status: "approved",
      ownerId: userId,
      approverId: userId,
      collectedAt: now,
      approvedAt: now,
      internalNotes: log.notes,
      updatedAt: now,
    });

    // Link to controls
    for (const controlId of log.controlIds) {
      try {
        await db.insert(evidenceControlLinksTable).values({
          id: randomUUID(),
          evidenceId,
          controlId,
          linkedAt: now,
          linkedById: userId,
        });
      } catch {
        // Skip invalid control IDs silently
      }
    }

    // Mark log completed
    await db
      .update(reviewLogsTable)
      .set({
        status: "completed",
        evidenceItemId: evidenceId,
        reviewedAt: now,
        updatedAt: now,
      })
      .where(eq(reviewLogsTable.id, req.params.id));

    await logAudit({
      organizationId: orgId,
      userId,
      action: "review_log.completed",
      entityType: "review_log",
      entityId: req.params.id,
      details: { evidenceId, reviewType: log.reviewType, title: log.title },
    });

    res.json({ evidenceId });
  }
);

// DELETE /api/review-logs/:id
router.delete("/review-logs/:id", requireAuth, requireOrg, async (req, res) => {
  const orgId = req.orgId!;
  const [existing] = await db
    .select({ id: reviewLogsTable.id, status: reviewLogsTable.status })
    .from(reviewLogsTable)
    .where(
      and(
        eq(reviewLogsTable.id, req.params.id),
        eq(reviewLogsTable.organizationId, orgId)
      )
    );

  if (!existing) return res.status(404).json({ error: "Not found" });
  if (existing.status === "completed") {
    return res.status(400).json({ error: "Cannot delete a completed review" });
  }

  await db.delete(reviewLogsTable).where(eq(reviewLogsTable.id, req.params.id));
  res.status(204).end();
});

export default router;
