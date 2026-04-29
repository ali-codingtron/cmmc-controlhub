import { Router } from "express";
import {
  db,
  poamsTable,
  controlsTable,
  usersTable,
} from "@workspace/db";
import { eq, and, desc } from "drizzle-orm";
import { requireAuth } from "../lib/auth";
import { logAudit } from "../lib/audit";
import { randomUUID } from "crypto";

const router = Router();

router.get("/poams", requireAuth, async (req, res) => {
  const { status, riskLevel, controlId } = req.query as Record<string, string>;

  const items = await db
    .select({
      id: poamsTable.id,
      poamNumber: poamsTable.poamNumber,
      title: poamsTable.title,
      deficiencyDescription: poamsTable.deficiencyDescription,
      status: poamsTable.status,
      riskLevel: poamsTable.riskLevel,
      linkedControlId: poamsTable.linkedControlId,
      linkedControlLabel: controlsTable.controlId,
      ownerId: poamsTable.ownerId,
      ownerName: usersTable.name,
      scheduledCompletionDate: poamsTable.scheduledCompletionDate,
      completedDate: poamsTable.completedDate,
      remediationPlan: poamsTable.remediationPlan,
      resourcesRequired: poamsTable.resourcesRequired,
      notes: poamsTable.notes,
      createdAt: poamsTable.createdAt,
      updatedAt: poamsTable.updatedAt,
    })
    .from(poamsTable)
    .leftJoin(controlsTable, eq(controlsTable.id, poamsTable.linkedControlId))
    .leftJoin(usersTable, eq(usersTable.id, poamsTable.ownerId))
    .where(
      and(
        status ? eq(poamsTable.status, status as any) : undefined,
        riskLevel ? eq(poamsTable.riskLevel, riskLevel as any) : undefined,
        controlId ? eq(poamsTable.linkedControlId, controlId) : undefined
      )
    )
    .orderBy(desc(poamsTable.createdAt));

  res.json(items);
});

router.post("/poams", requireAuth, async (req, res) => {
  const {
    title,
    deficiencyDescription,
    riskLevel,
    linkedControlId,
    ownerId,
    scheduledCompletionDate,
    remediationPlan,
    resourcesRequired,
    notes,
  } = req.body;

  if (!title || !deficiencyDescription) {
    res.status(400).json({ error: "title and deficiencyDescription required" });
    return;
  }

  const id = randomUUID();
  const count = await db.select().from(poamsTable);
  const poamNumber = `POA&M-${String(count.length + 1).padStart(4, "0")}`;

  await db.insert(poamsTable).values({
    id,
    poamNumber,
    title,
    deficiencyDescription,
    status: "open",
    riskLevel: riskLevel ?? "medium",
    linkedControlId,
    ownerId,
    scheduledCompletionDate: scheduledCompletionDate
      ? new Date(scheduledCompletionDate)
      : undefined,
    remediationPlan,
    resourcesRequired,
    notes,
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  await logAudit(req, "created", "poam", id, { entityLabel: title });

  const [created] = await db.select().from(poamsTable).where(eq(poamsTable.id, id)).limit(1);
  res.status(201).json(created);
});

router.get("/poams/:id", requireAuth, async (req, res) => {
  const [item] = await db
    .select({
      id: poamsTable.id,
      poamNumber: poamsTable.poamNumber,
      title: poamsTable.title,
      deficiencyDescription: poamsTable.deficiencyDescription,
      status: poamsTable.status,
      riskLevel: poamsTable.riskLevel,
      linkedControlId: poamsTable.linkedControlId,
      linkedControlLabel: controlsTable.controlId,
      ownerId: poamsTable.ownerId,
      ownerName: usersTable.name,
      scheduledCompletionDate: poamsTable.scheduledCompletionDate,
      completedDate: poamsTable.completedDate,
      remediationPlan: poamsTable.remediationPlan,
      resourcesRequired: poamsTable.resourcesRequired,
      notes: poamsTable.notes,
      resolutionSummary: poamsTable.resolutionSummary,
      createdAt: poamsTable.createdAt,
      updatedAt: poamsTable.updatedAt,
    })
    .from(poamsTable)
    .leftJoin(controlsTable, eq(controlsTable.id, poamsTable.linkedControlId))
    .leftJoin(usersTable, eq(usersTable.id, poamsTable.ownerId))
    .where(eq(poamsTable.id, req.params.id))
    .limit(1);

  if (!item) {
    res.status(404).json({ error: "Not found" });
    return;
  }

  res.json(item);
});

router.patch("/poams/:id", requireAuth, async (req, res) => {
  const [existing] = await db.select().from(poamsTable).where(eq(poamsTable.id, req.params.id)).limit(1);

  if (!existing) {
    res.status(404).json({ error: "Not found" });
    return;
  }

  const {
    title,
    deficiencyDescription,
    status,
    riskLevel,
    ownerId,
    scheduledCompletionDate,
    remediationPlan,
    resourcesRequired,
    notes,
    linkedControlId,
  } = req.body;

  await db
    .update(poamsTable)
    .set({
      title: title ?? existing.title,
      deficiencyDescription: deficiencyDescription ?? existing.deficiencyDescription,
      status: status ?? existing.status,
      riskLevel: riskLevel ?? existing.riskLevel,
      ownerId: ownerId !== undefined ? ownerId : existing.ownerId,
      linkedControlId: linkedControlId !== undefined ? linkedControlId : existing.linkedControlId,
      scheduledCompletionDate:
        scheduledCompletionDate !== undefined
          ? scheduledCompletionDate
            ? new Date(scheduledCompletionDate)
            : null
          : existing.scheduledCompletionDate,
      remediationPlan: remediationPlan !== undefined ? remediationPlan : existing.remediationPlan,
      resourcesRequired: resourcesRequired !== undefined ? resourcesRequired : existing.resourcesRequired,
      notes: notes !== undefined ? notes : existing.notes,
      updatedAt: new Date(),
    })
    .where(eq(poamsTable.id, req.params.id));

  await logAudit(req, "updated", "poam", req.params.id, { entityLabel: existing.title });

  const [updated] = await db.select().from(poamsTable).where(eq(poamsTable.id, req.params.id)).limit(1);
  res.json(updated);
});

router.post("/poams/:id/close", requireAuth, async (req, res) => {
  const { resolutionSummary } = req.body;
  const [existing] = await db.select().from(poamsTable).where(eq(poamsTable.id, req.params.id)).limit(1);

  if (!existing) {
    res.status(404).json({ error: "Not found" });
    return;
  }

  await db
    .update(poamsTable)
    .set({
      status: "closed",
      completedDate: new Date(),
      resolutionSummary,
      updatedAt: new Date(),
    })
    .where(eq(poamsTable.id, req.params.id));

  await logAudit(req, "closed", "poam", req.params.id, { entityLabel: existing.title });

  res.json({ id: req.params.id, status: "closed" });
});

export default router;
