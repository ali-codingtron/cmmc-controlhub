import { Router } from "express";
import {
  db,
  evidenceItemsTable,
  evidenceControlLinksTable,
  controlsTable,
  usersTable,
  auditLogsTable,
} from "@workspace/db";
import {
  eq,
  and,
  ilike,
  desc,
  or,
  inArray,
  lte,
  sql,
  gte,
} from "drizzle-orm";
import { requireAuth } from "../lib/auth";
import { requireOrg } from "../middleware/org";
import { logAudit } from "../lib/audit";
import { randomUUID } from "crypto";

const router = Router();

const evidenceSelect = {
  id: evidenceItemsTable.id,
  title: evidenceItemsTable.title,
  description: evidenceItemsTable.description,
  evidenceType: evidenceItemsTable.evidenceType,
  status: evidenceItemsTable.status,
  fileName: evidenceItemsTable.fileName,
  fileSize: evidenceItemsTable.fileSize,
  sourceSystem: evidenceItemsTable.sourceSystem,
  confidentialityLevel: evidenceItemsTable.confidentialityLevel,
  version: evidenceItemsTable.version,
  tags: evidenceItemsTable.tags,
  ownerId: evidenceItemsTable.ownerId,
  ownerName: usersTable.name,
  reviewerId: evidenceItemsTable.reviewerId,
  approverId: evidenceItemsTable.approverId,
  collectedAt: evidenceItemsTable.collectedAt,
  approvedAt: evidenceItemsTable.approvedAt,
  expiresAt: evidenceItemsTable.expiresAt,
  reviewDueDate: evidenceItemsTable.reviewDueDate,
  assessorSummary: evidenceItemsTable.assessorSummary,
  internalNotes: evidenceItemsTable.internalNotes,
  createdAt: evidenceItemsTable.createdAt,
  updatedAt: evidenceItemsTable.updatedAt,
};

router.get("/evidence", requireAuth, requireOrg, async (req, res) => {
  const { status, evidenceType, controlId, domainId, ownerId, search, expiringDays } =
    req.query as Record<string, string>;
  const orgId = req.orgId;

  let items;
  if (controlId) {
    items = await db
      .select(evidenceSelect)
      .from(evidenceControlLinksTable)
      .innerJoin(evidenceItemsTable, eq(evidenceItemsTable.id, evidenceControlLinksTable.evidenceId))
      .leftJoin(usersTable, eq(usersTable.id, evidenceItemsTable.ownerId))
      .where(
        and(
          eq(evidenceControlLinksTable.controlId, controlId),
          orgId ? eq(evidenceItemsTable.organizationId, orgId) : undefined,
          status ? eq(evidenceItemsTable.status, status as any) : undefined,
          evidenceType ? eq(evidenceItemsTable.evidenceType, evidenceType as any) : undefined,
          ownerId ? eq(evidenceItemsTable.ownerId, ownerId) : undefined
        )
      )
      .orderBy(desc(evidenceItemsTable.updatedAt));
  } else {
    items = await db
      .select(evidenceSelect)
      .from(evidenceItemsTable)
      .leftJoin(usersTable, eq(usersTable.id, evidenceItemsTable.ownerId))
      .where(
        and(
          orgId ? eq(evidenceItemsTable.organizationId, orgId) : undefined,
          status ? eq(evidenceItemsTable.status, status as any) : undefined,
          evidenceType ? eq(evidenceItemsTable.evidenceType, evidenceType as any) : undefined,
          ownerId ? eq(evidenceItemsTable.ownerId, ownerId) : undefined,
          search ? ilike(evidenceItemsTable.title, `%${search}%`) : undefined,
          expiringDays
            ? and(
                lte(evidenceItemsTable.expiresAt, new Date(Date.now() + parseInt(expiringDays) * 86400000)),
                gte(evidenceItemsTable.expiresAt, new Date())
              )
            : undefined
        )
      )
      .orderBy(desc(evidenceItemsTable.updatedAt));
  }

  res.json(items);
});

router.get("/evidence/search", requireAuth, requireOrg, async (req, res) => {
  const { q } = req.query as Record<string, string>;
  const orgId = req.orgId;

  if (!q) {
    res.json([]);
    return;
  }
  const items = await db
    .select(evidenceSelect)
    .from(evidenceItemsTable)
    .where(
      and(
        orgId ? eq(evidenceItemsTable.organizationId, orgId) : undefined,
        or(
          ilike(evidenceItemsTable.title, `%${q}%`),
          ilike(evidenceItemsTable.description, `%${q}%`),
          ilike(evidenceItemsTable.sourceSystem, `%${q}%`)
        )
      )
    )
    .orderBy(desc(evidenceItemsTable.updatedAt))
    .limit(50);

  res.json(items);
});

router.post("/evidence", requireAuth, requireOrg, async (req, res) => {
  const {
    title,
    description,
    evidenceType,
    controlIds,
    sourceSystem,
    confidentialityLevel,
    expiresAt,
    tags,
    assessorSummary,
    internalNotes,
    collectedAt,
  } = req.body;

  if (!title || !evidenceType) {
    res.status(400).json({ error: "title and evidenceType required" });
    return;
  }

  const id = randomUUID();
  await db.insert(evidenceItemsTable).values({
    id,
    organizationId: req.orgId ?? null,
    title,
    description,
    evidenceType,
    status: "draft",
    ownerId: req.authUser!.id,
    sourceSystem,
    confidentialityLevel,
    expiresAt: expiresAt ? new Date(expiresAt) : undefined,
    tags: tags ?? [],
    assessorSummary,
    internalNotes,
    collectedAt: collectedAt ? new Date(collectedAt) : undefined,
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  if (Array.isArray(controlIds) && controlIds.length > 0) {
    await db.insert(evidenceControlLinksTable).values(
      controlIds.map((cid: string) => ({
        id: randomUUID(),
        evidenceId: id,
        controlId: cid,
        linkedAt: new Date(),
        linkedById: req.authUser!.id,
      }))
    );
  }

  await logAudit(req, "uploaded", "evidence", id, { entityLabel: title });

  const [created] = await db
    .select(evidenceSelect)
    .from(evidenceItemsTable)
    .where(eq(evidenceItemsTable.id, id))
    .limit(1);

  res.status(201).json(created);
});

router.get("/evidence/:id", requireAuth, requireOrg, async (req, res) => {
  const orgId = req.orgId;

  const [item] = await db
    .select(evidenceSelect)
    .from(evidenceItemsTable)
    .where(
      and(
        eq(evidenceItemsTable.id, req.params.id),
        orgId ? eq(evidenceItemsTable.organizationId, orgId) : undefined
      )
    )
    .limit(1);

  if (!item) {
    res.status(404).json({ error: "Not found" });
    return;
  }

  const links = await db
    .select({
      controlId: evidenceControlLinksTable.controlId,
      controlLabel: controlsTable.controlId,
      controlTitle: controlsTable.title,
    })
    .from(evidenceControlLinksTable)
    .innerJoin(controlsTable, eq(controlsTable.id, evidenceControlLinksTable.controlId))
    .where(eq(evidenceControlLinksTable.evidenceId, req.params.id));

  const owner = await db
    .select({ name: usersTable.name })
    .from(usersTable)
    .where(eq(usersTable.id, item.ownerId))
    .limit(1);

  res.json({
    ...item,
    ownerName: owner[0]?.name,
    linkedControlIds: links.map((l) => l.controlId),
    linkedControlLabels: links.map((l) => `${l.controlLabel}: ${l.controlTitle}`),
  });
});

router.patch("/evidence/:id", requireAuth, requireOrg, async (req, res) => {
  const orgId = req.orgId;

  const [existing] = await db
    .select()
    .from(evidenceItemsTable)
    .where(
      and(
        eq(evidenceItemsTable.id, req.params.id),
        orgId ? eq(evidenceItemsTable.organizationId, orgId) : undefined
      )
    )
    .limit(1);

  if (!existing) {
    res.status(404).json({ error: "Not found" });
    return;
  }

  const {
    title, description, evidenceType, sourceSystem, confidentialityLevel,
    expiresAt, tags, assessorSummary, internalNotes, collectedAt,
  } = req.body;

  await db
    .update(evidenceItemsTable)
    .set({
      title: title ?? existing.title,
      description: description !== undefined ? description : existing.description,
      evidenceType: evidenceType ?? existing.evidenceType,
      sourceSystem: sourceSystem !== undefined ? sourceSystem : existing.sourceSystem,
      confidentialityLevel: confidentialityLevel !== undefined ? confidentialityLevel : existing.confidentialityLevel,
      expiresAt: expiresAt ? new Date(expiresAt) : existing.expiresAt,
      tags: tags ?? existing.tags,
      assessorSummary: assessorSummary !== undefined ? assessorSummary : existing.assessorSummary,
      internalNotes: internalNotes !== undefined ? internalNotes : existing.internalNotes,
      collectedAt: collectedAt ? new Date(collectedAt) : existing.collectedAt,
      updatedAt: new Date(),
    })
    .where(eq(evidenceItemsTable.id, req.params.id));

  await logAudit(req, "updated", "evidence", req.params.id, { entityLabel: existing.title });

  const [updated] = await db
    .select(evidenceSelect)
    .from(evidenceItemsTable)
    .where(eq(evidenceItemsTable.id, req.params.id))
    .limit(1);

  res.json(updated);
});

router.post("/evidence/:id/submit", requireAuth, requireOrg, async (req, res) => {
  const orgId = req.orgId;
  const [item] = await db
    .select()
    .from(evidenceItemsTable)
    .where(and(eq(evidenceItemsTable.id, req.params.id), orgId ? eq(evidenceItemsTable.organizationId, orgId) : undefined))
    .limit(1);

  if (!item) { res.status(404).json({ error: "Not found" }); return; }

  await db.update(evidenceItemsTable).set({ status: "pending_review", updatedAt: new Date() }).where(eq(evidenceItemsTable.id, req.params.id));
  await logAudit(req, "submitted", "evidence", req.params.id, { entityLabel: item.title, previousValue: item.status, newValue: "pending_review" });
  res.json({ id: req.params.id, status: "pending_review" });
});

router.post("/evidence/:id/approve", requireAuth, requireOrg, async (req, res) => {
  const { assessorSummary } = req.body;
  const orgId = req.orgId;
  const [item] = await db.select().from(evidenceItemsTable).where(and(eq(evidenceItemsTable.id, req.params.id), orgId ? eq(evidenceItemsTable.organizationId, orgId) : undefined)).limit(1);

  if (!item) { res.status(404).json({ error: "Not found" }); return; }

  await db.update(evidenceItemsTable).set({ status: "approved", approverId: req.authUser!.id, approvedAt: new Date(), assessorSummary: assessorSummary ?? item.assessorSummary, updatedAt: new Date() }).where(eq(evidenceItemsTable.id, req.params.id));
  await logAudit(req, "approved", "evidence", req.params.id, { entityLabel: item.title, previousValue: item.status, newValue: "approved" });
  res.json({ id: req.params.id, status: "approved" });
});

router.post("/evidence/:id/reject", requireAuth, requireOrg, async (req, res) => {
  const { reason } = req.body;
  const orgId = req.orgId;
  const [item] = await db.select().from(evidenceItemsTable).where(and(eq(evidenceItemsTable.id, req.params.id), orgId ? eq(evidenceItemsTable.organizationId, orgId) : undefined)).limit(1);

  if (!item) { res.status(404).json({ error: "Not found" }); return; }

  await db.update(evidenceItemsTable).set({ status: "rejected", rejectionNotes: reason, reviewerId: req.authUser!.id, updatedAt: new Date() }).where(eq(evidenceItemsTable.id, req.params.id));
  await logAudit(req, "rejected", "evidence", req.params.id, { entityLabel: item.title, previousValue: item.status, newValue: "rejected" });
  res.json({ id: req.params.id, status: "rejected" });
});

router.post("/evidence/:id/stale", requireAuth, requireOrg, async (req, res) => {
  const orgId = req.orgId;
  const [item] = await db.select().from(evidenceItemsTable).where(and(eq(evidenceItemsTable.id, req.params.id), orgId ? eq(evidenceItemsTable.organizationId, orgId) : undefined)).limit(1);

  if (!item) { res.status(404).json({ error: "Not found" }); return; }

  await db.update(evidenceItemsTable).set({ status: "stale", updatedAt: new Date() }).where(eq(evidenceItemsTable.id, req.params.id));
  await logAudit(req, "marked_stale", "evidence", req.params.id, { entityLabel: item.title });
  res.json({ id: req.params.id, status: "stale" });
});

router.post("/evidence/:id/supersede", requireAuth, requireOrg, async (req, res) => {
  const { newEvidenceId } = req.body;
  const orgId = req.orgId;
  const [item] = await db.select().from(evidenceItemsTable).where(and(eq(evidenceItemsTable.id, req.params.id), orgId ? eq(evidenceItemsTable.organizationId, orgId) : undefined)).limit(1);

  if (!item) { res.status(404).json({ error: "Not found" }); return; }

  await db.update(evidenceItemsTable).set({ status: "superseded", isCurrentVersion: false, updatedAt: new Date() }).where(eq(evidenceItemsTable.id, req.params.id));
  if (newEvidenceId) {
    await db.update(evidenceItemsTable).set({ previousVersionId: req.params.id, updatedAt: new Date() }).where(eq(evidenceItemsTable.id, newEvidenceId));
  }
  await logAudit(req, "superseded", "evidence", req.params.id, { entityLabel: item.title, newValue: newEvidenceId });
  res.json({ id: req.params.id, status: "superseded" });
});

router.post("/evidence/:id/link-controls", requireAuth, requireOrg, async (req, res) => {
  const { controlIds } = req.body;

  if (!Array.isArray(controlIds)) {
    res.status(400).json({ error: "controlIds must be an array" });
    return;
  }

  const existing = await db
    .select({ controlId: evidenceControlLinksTable.controlId })
    .from(evidenceControlLinksTable)
    .where(eq(evidenceControlLinksTable.evidenceId, req.params.id));

  const existingIds = new Set(existing.map((l) => l.controlId));
  const newIds = controlIds.filter((id: string) => !existingIds.has(id));

  if (newIds.length > 0) {
    await db.insert(evidenceControlLinksTable).values(
      newIds.map((cid: string) => ({
        id: randomUUID(),
        evidenceId: req.params.id,
        controlId: cid,
        linkedAt: new Date(),
        linkedById: req.authUser!.id,
      }))
    );
  }

  await logAudit(req, "link_added", "evidence", req.params.id, { newValue: controlIds });
  res.json({ id: req.params.id, linkedControlIds: controlIds });
});

router.get("/evidence/:id/audit-log", requireAuth, requireOrg, async (req, res) => {
  const logs = await db
    .select()
    .from(auditLogsTable)
    .where(and(eq(auditLogsTable.entityType, "evidence"), eq(auditLogsTable.entityId, req.params.id)))
    .orderBy(desc(auditLogsTable.timestamp));

  res.json(logs);
});

export default router;
