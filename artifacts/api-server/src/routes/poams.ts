import { Router } from "express";
import {
  db,
  poamsTable,
  controlsTable,
  usersTable,
} from "@workspace/db";
import { eq, and, desc, count } from "drizzle-orm";
import { requireAuth } from "../lib/auth";
import { requireOrg } from "../middleware/org";
import { logAudit } from "../lib/audit";
import { randomUUID } from "crypto";

const router = Router();

router.get("/poams", requireAuth, requireOrg, async (req, res) => {
  const { status, riskLevel, controlId } = req.query as Record<string, string>;
  const orgId = req.orgId;

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
        orgId ? eq(poamsTable.organizationId, orgId) : undefined,
        status ? eq(poamsTable.status, status as any) : undefined,
        riskLevel ? eq(poamsTable.riskLevel, riskLevel as any) : undefined,
        controlId ? eq(poamsTable.linkedControlId, controlId) : undefined
      )
    )
    .orderBy(desc(poamsTable.createdAt));

  res.json(items);
});

router.post("/poams", requireAuth, requireOrg, async (req, res) => {
  const {
    title, deficiencyDescription, riskLevel, linkedControlId,
    ownerId, scheduledCompletionDate, remediationPlan, resourcesRequired, notes,
    status: bodyStatus, poamNumber: bodyPoamNumber,
  } = req.body;
  const orgId = req.orgId;

  if (!title || !deficiencyDescription) {
    res.status(400).json({ error: "title and deficiencyDescription required" });
    return;
  }

  const id = randomUUID();

  let poamNumber = bodyPoamNumber?.trim() || null;
  if (!poamNumber) {
    const existing = await db
      .select({ id: poamsTable.id })
      .from(poamsTable)
      .where(orgId ? eq(poamsTable.organizationId, orgId) : undefined);
    poamNumber = `POA&M-${String(existing.length + 1).padStart(4, "0")}`;
  }

  const validStatuses = ["open", "in_progress", "waiting_on_vendor", "mitigated", "accepted_risk", "closed"];
  const status = validStatuses.includes(bodyStatus) ? bodyStatus : "open";

  await db.insert(poamsTable).values({
    id,
    organizationId: orgId ?? null,
    poamNumber,
    title,
    deficiencyDescription,
    status,
    riskLevel: riskLevel ?? "medium",
    linkedControlId: linkedControlId || null,
    ownerId: ownerId || null,
    scheduledCompletionDate: scheduledCompletionDate ? new Date(scheduledCompletionDate) : undefined,
    remediationPlan: remediationPlan || null,
    resourcesRequired: resourcesRequired || null,
    notes: notes || null,
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  await logAudit(req, "created", "poam", id, { entityLabel: title });

  const [created] = await db
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
    .where(eq(poamsTable.id, id))
    .limit(1);
  res.status(201).json(created);
});

router.get("/poams/:id", requireAuth, requireOrg, async (req, res) => {
  const orgId = req.orgId;

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
    .where(
      and(
        eq(poamsTable.id, req.params.id as string),
        orgId ? eq(poamsTable.organizationId, orgId) : undefined
      )
    )
    .limit(1);

  if (!item) { res.status(404).json({ error: "Not found" }); return; }
  res.json(item);
});

router.patch("/poams/:id", requireAuth, requireOrg, async (req, res) => {
  const orgId = req.orgId;

  const [existing] = await db.select().from(poamsTable).where(and(eq(poamsTable.id, req.params.id as string), orgId ? eq(poamsTable.organizationId, orgId) : undefined)).limit(1);
  if (!existing) { res.status(404).json({ error: "Not found" }); return; }

  const {
    title, deficiencyDescription, status, riskLevel, ownerId,
    scheduledCompletionDate, remediationPlan, resourcesRequired, notes, linkedControlId,
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
          ? scheduledCompletionDate ? new Date(scheduledCompletionDate) : null
          : existing.scheduledCompletionDate,
      remediationPlan: remediationPlan !== undefined ? remediationPlan : existing.remediationPlan,
      resourcesRequired: resourcesRequired !== undefined ? resourcesRequired : existing.resourcesRequired,
      notes: notes !== undefined ? notes : existing.notes,
      updatedAt: new Date(),
    })
    .where(eq(poamsTable.id, req.params.id as string));

  await logAudit(req, "updated", "poam", req.params.id as string, { entityLabel: existing.title });

  const [updated] = await db.select().from(poamsTable).where(eq(poamsTable.id, req.params.id as string)).limit(1);
  res.json(updated);
});

router.post("/poams/:id/close", requireAuth, requireOrg, async (req, res) => {
  const { resolutionSummary } = req.body;
  const orgId = req.orgId;
  const [existing] = await db.select().from(poamsTable).where(and(eq(poamsTable.id, req.params.id as string), orgId ? eq(poamsTable.organizationId, orgId) : undefined)).limit(1);

  if (!existing) { res.status(404).json({ error: "Not found" }); return; }

  await db.update(poamsTable).set({ status: "closed", completedDate: new Date(), resolutionSummary, updatedAt: new Date() }).where(eq(poamsTable.id, req.params.id as string));
  await logAudit(req, "closed", "poam", req.params.id as string, { entityLabel: existing.title });
  res.json({ id: req.params.id as string, status: "closed" });
});

export default router;
