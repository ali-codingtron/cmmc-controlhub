import { Router } from "express";
import {
  db,
  evidenceRequestsTable,
  evidenceItemsTable,
  evidenceControlLinksTable,
  controlsTable,
  usersTable,
  auditLogsTable,
} from "@workspace/db";
import { eq, and, desc, or, lte, gte, sql } from "drizzle-orm";
import { requireAuth } from "../lib/auth";
import { requireOrg } from "../middleware/org";
import { logAudit } from "../lib/audit";
import { randomUUID } from "crypto";

const router = Router();

const requestSelect = {
  id: evidenceRequestsTable.id,
  organizationId: evidenceRequestsTable.organizationId,
  controlId: evidenceRequestsTable.controlId,
  title: evidenceRequestsTable.title,
  description: evidenceRequestsTable.description,
  evidenceType: evidenceRequestsTable.evidenceType,
  instructions: evidenceRequestsTable.instructions,
  ownerId: evidenceRequestsTable.ownerId,
  ownerName: usersTable.name,
  dueDate: evidenceRequestsTable.dueDate,
  recurrence: evidenceRequestsTable.recurrence,
  requiredFileTypes: evidenceRequestsTable.requiredFileTypes,
  approvalRequired: evidenceRequestsTable.approvalRequired,
  assessorSummaryRequired: evidenceRequestsTable.assessorSummaryRequired,
  status: evidenceRequestsTable.status,
  fulfilledAt: evidenceRequestsTable.fulfilledAt,
  fulfilledByEvidenceId: evidenceRequestsTable.fulfilledByEvidenceId,
  fulfilledByUserId: evidenceRequestsTable.fulfilledByUserId,
  nextDueAt: evidenceRequestsTable.nextDueAt,
  assessorSummary: evidenceRequestsTable.assessorSummary,
  createdByUserId: evidenceRequestsTable.createdByUserId,
  createdAt: evidenceRequestsTable.createdAt,
  updatedAt: evidenceRequestsTable.updatedAt,
};

// Compute next due date based on recurrence
function computeNextDue(
  base: Date,
  recurrence: string
): Date | null {
  const d = new Date(base);
  switch (recurrence) {
    case "monthly":
      d.setMonth(d.getMonth() + 1);
      return d;
    case "quarterly":
      d.setMonth(d.getMonth() + 3);
      return d;
    case "semi_annual":
      d.setMonth(d.getMonth() + 6);
      return d;
    case "annually":
      d.setFullYear(d.getFullYear() + 1);
      return d;
    default:
      return null;
  }
}

// GET /api/evidence-requests
router.get("/evidence-requests", requireAuth, requireOrg, async (req, res) => {
  const { status, controlId, ownerId } = req.query as Record<string, string>;
  const orgId = req.orgId!;

  const conditions = [eq(evidenceRequestsTable.organizationId, orgId)];
  if (status) conditions.push(eq(evidenceRequestsTable.status, status as any));
  if (controlId) conditions.push(eq(evidenceRequestsTable.controlId, controlId));
  if (ownerId) conditions.push(eq(evidenceRequestsTable.ownerId, ownerId));

  const items = await db
    .select(requestSelect)
    .from(evidenceRequestsTable)
    .leftJoin(usersTable, eq(usersTable.id, evidenceRequestsTable.ownerId))
    .where(and(...conditions))
    .orderBy(desc(evidenceRequestsTable.dueDate));

  res.json(items);
});

// GET /api/evidence-requests/stats
router.get("/evidence-requests/stats", requireAuth, requireOrg, async (req, res) => {
  const orgId = req.orgId!;

  const rows = await db
    .select({
      status: evidenceRequestsTable.status,
      count: sql<number>`count(*)::int`,
    })
    .from(evidenceRequestsTable)
    .where(eq(evidenceRequestsTable.organizationId, orgId))
    .groupBy(evidenceRequestsTable.status);

  const stats = { pending: 0, fulfilled: 0, overdue: 0, cancelled: 0 };
  for (const r of rows) stats[r.status as keyof typeof stats] = r.count;
  res.json(stats);
});

// GET /api/evidence-requests/:id
router.get("/evidence-requests/:id", requireAuth, requireOrg, async (req, res) => {
  const orgId = req.orgId!;
  const [item] = await db
    .select(requestSelect)
    .from(evidenceRequestsTable)
    .leftJoin(usersTable, eq(usersTable.id, evidenceRequestsTable.ownerId))
    .where(
      and(
        eq(evidenceRequestsTable.id, req.params.id),
        eq(evidenceRequestsTable.organizationId, orgId)
      )
    );

  if (!item) return res.status(404).json({ error: "Not found" });
  res.json(item);
});

// POST /api/evidence-requests
router.post("/evidence-requests", requireAuth, requireOrg, async (req, res) => {
  const orgId = req.orgId!;
  const userId = req.user!.id;
  const {
    controlId,
    title,
    description,
    evidenceType,
    instructions,
    ownerId,
    dueDate,
    recurrence,
    requiredFileTypes,
    approvalRequired,
    assessorSummaryRequired,
  } = req.body;

  if (!title || !evidenceType) {
    return res.status(400).json({ error: "title and evidenceType are required" });
  }

  const id = randomUUID();
  const dueDateObj = dueDate ? new Date(dueDate) : null;

  const [created] = await db
    .insert(evidenceRequestsTable)
    .values({
      id,
      organizationId: orgId,
      controlId: controlId || null,
      title,
      description: description || null,
      evidenceType,
      instructions: instructions || null,
      ownerId: ownerId || userId,
      dueDate: dueDateObj,
      recurrence: recurrence || "once",
      requiredFileTypes: requiredFileTypes || [],
      approvalRequired: approvalRequired ?? false,
      assessorSummaryRequired: assessorSummaryRequired ?? false,
      status: "pending",
      createdByUserId: userId,
      updatedAt: new Date(),
    })
    .returning();

  await logAudit({
    organizationId: orgId,
    userId,
    action: "evidence_request.created",
    entityType: "evidence_request",
    entityId: id,
    details: { title },
  });

  res.status(201).json(created);
});

// PATCH /api/evidence-requests/:id
router.patch("/evidence-requests/:id", requireAuth, requireOrg, async (req, res) => {
  const orgId = req.orgId!;
  const [existing] = await db
    .select({ id: evidenceRequestsTable.id })
    .from(evidenceRequestsTable)
    .where(
      and(
        eq(evidenceRequestsTable.id, req.params.id),
        eq(evidenceRequestsTable.organizationId, orgId)
      )
    );

  if (!existing) return res.status(404).json({ error: "Not found" });

  const allowed = [
    "title", "description", "evidenceType", "instructions", "ownerId",
    "dueDate", "recurrence", "requiredFileTypes", "approvalRequired",
    "assessorSummaryRequired", "status", "controlId", "assessorSummary",
  ];
  const updates: Record<string, any> = { updatedAt: new Date() };
  for (const key of allowed) {
    if (req.body[key] !== undefined) {
      updates[key] = key === "dueDate" ? new Date(req.body[key]) : req.body[key];
    }
  }

  const [updated] = await db
    .update(evidenceRequestsTable)
    .set(updates)
    .where(eq(evidenceRequestsTable.id, req.params.id))
    .returning();

  res.json(updated);
});

// DELETE /api/evidence-requests/:id
router.delete("/evidence-requests/:id", requireAuth, requireOrg, async (req, res) => {
  const orgId = req.orgId!;
  const [existing] = await db
    .select({ id: evidenceRequestsTable.id })
    .from(evidenceRequestsTable)
    .where(
      and(
        eq(evidenceRequestsTable.id, req.params.id),
        eq(evidenceRequestsTable.organizationId, orgId)
      )
    );

  if (!existing) return res.status(404).json({ error: "Not found" });

  await db
    .delete(evidenceRequestsTable)
    .where(eq(evidenceRequestsTable.id, req.params.id));

  res.status(204).end();
});

// POST /api/evidence-requests/:id/fulfill
// Fulfills an evidence request: creates an evidence item, links to control, marks complete
router.post(
  "/evidence-requests/:id/fulfill",
  requireAuth,
  requireOrg,
  async (req, res) => {
    const orgId = req.orgId!;
    const userId = req.user!.id;
    const { notes, assessorSummary, fileName, fileSize, mimeType } = req.body;

    const [request] = await db
      .select()
      .from(evidenceRequestsTable)
      .where(
        and(
          eq(evidenceRequestsTable.id, req.params.id),
          eq(evidenceRequestsTable.organizationId, orgId)
        )
      );

    if (!request) return res.status(404).json({ error: "Not found" });
    if (request.status === "fulfilled") {
      return res.status(400).json({ error: "Already fulfilled" });
    }

    // Create evidence item
    const evidenceId = randomUUID();
    const now = new Date();

    await db.insert(evidenceItemsTable).values({
      id: evidenceId,
      organizationId: orgId,
      title: `[Request] ${request.title}`,
      description: notes || request.description,
      evidenceType: request.evidenceType,
      status: request.approvalRequired ? "pending_review" : "approved",
      fileName: fileName || null,
      fileSize: fileSize || null,
      mimeType: mimeType || null,
      ownerId: userId,
      collectedAt: now,
      approvedAt: request.approvalRequired ? null : now,
      assessorSummary: assessorSummary || null,
      internalNotes: notes || null,
      updatedAt: now,
    });

    // Link evidence to control if present
    if (request.controlId) {
      await db.insert(evidenceControlLinksTable).values({
        id: randomUUID(),
        evidenceId,
        controlId: request.controlId,
        linkedAt: now,
        linkedById: userId,
      });
    }

    // Determine next due date for recurring requests
    const nextDue = request.dueDate
      ? computeNextDue(request.dueDate, request.recurrence)
      : null;

    // Mark fulfilled (or re-schedule if recurring)
    const newStatus =
      request.recurrence !== "once" ? "pending" : "fulfilled";

    await db
      .update(evidenceRequestsTable)
      .set({
        status: newStatus,
        fulfilledAt: now,
        fulfilledByEvidenceId: evidenceId,
        fulfilledByUserId: userId,
        nextDueAt: nextDue,
        dueDate: nextDue ?? request.dueDate,
        updatedAt: now,
      })
      .where(eq(evidenceRequestsTable.id, req.params.id));

    await logAudit({
      organizationId: orgId,
      userId,
      action: "evidence_request.fulfilled",
      entityType: "evidence_request",
      entityId: req.params.id,
      details: { evidenceId, title: request.title, fileName },
    });

    res.json({ evidenceId, nextDueAt: nextDue });
  }
);

export default router;
