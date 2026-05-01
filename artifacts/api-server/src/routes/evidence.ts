import { Router } from "express";
import multer from "multer";
import path from "path";
import { createReadStream, mkdirSync, unlink as fsUnlink } from "fs";
import {
  db,
  evidenceItemsTable,
  evidenceControlLinksTable,
  controlsTable,
  domainsTable,
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
  notInArray,
  lte,
  gte,
  ne,
  sql,
} from "drizzle-orm";
import { requireAuth } from "../lib/auth";
import { requireOrg } from "../middleware/org";
import { logAudit } from "../lib/audit";
import { randomUUID } from "crypto";

// __dirname is injected by the esbuild build banner and points to dist/ at runtime
const UPLOADS_DIR = path.resolve(__dirname, "..", "uploads", "evidence");
mkdirSync(UPLOADS_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOADS_DIR),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${randomUUID()}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024 }, // 50 MB
});

const router = Router();

const ACTIVE_STATUSES = [
  "draft",
  "needs_classification",
  "pending_review",
  "approved",
  "assessor_ready",
  "rejected",
  "stale",
  "superseded",
] as const;

const evidenceSelect = {
  id: evidenceItemsTable.id,
  title: evidenceItemsTable.title,
  description: evidenceItemsTable.description,
  evidenceType: evidenceItemsTable.evidenceType,
  status: evidenceItemsTable.status,
  fileKey: evidenceItemsTable.fileKey,
  fileName: evidenceItemsTable.fileName,
  fileSize: evidenceItemsTable.fileSize,
  mimeType: evidenceItemsTable.mimeType,
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

interface LinkedControlInfo {
  id: string;
  label: string;
  domainName: string;
  domainCode: string;
  level: string;
}

// Helper: fetch linked controls for a list of evidence IDs and attach enriched info
async function attachLinkedControls<T extends { id: string }>(items: T[]): Promise<(T & {
  linkedControlIds: string[];
  linkedControlLabels: string[];
  linkedControls: LinkedControlInfo[];
  domains: Array<{ name: string; code: string }>;
  cmmcLevels: string[];
})[]> {
  if (items.length === 0) {
    return items.map(i => ({ ...i, linkedControlIds: [], linkedControlLabels: [], linkedControls: [], domains: [], cmmcLevels: [] }));
  }

  const ids = items.map(i => i.id);
  const links = await db
    .select({
      evidenceId: evidenceControlLinksTable.evidenceId,
      controlId: evidenceControlLinksTable.controlId,
      controlLabel: controlsTable.controlId,
      level: controlsTable.level,
      domainName: domainsTable.name,
    })
    .from(evidenceControlLinksTable)
    .innerJoin(controlsTable, eq(controlsTable.id, evidenceControlLinksTable.controlId))
    .leftJoin(domainsTable, eq(domainsTable.id, controlsTable.domainId))
    .where(inArray(evidenceControlLinksTable.evidenceId, ids));

  type LinkEntry = { ids: string[]; labels: string[]; controls: LinkedControlInfo[] };
  const linkMap = new Map<string, LinkEntry>();
  for (const l of links) {
    if (!linkMap.has(l.evidenceId)) linkMap.set(l.evidenceId, { ids: [], labels: [], controls: [] });
    const label = l.controlLabel ?? l.controlId;
    const domainCode = label.split(".")[0] ?? "";
    const entry = linkMap.get(l.evidenceId)!;
    entry.ids.push(l.controlId);
    entry.labels.push(label);
    entry.controls.push({ id: l.controlId, label, domainName: l.domainName ?? "", domainCode, level: l.level ?? "" });
  }

  return items.map(i => {
    const entry = linkMap.get(i.id) ?? { ids: [], labels: [], controls: [] };
    const uniqueDomains = Array.from(
      new Map(entry.controls.map(c => [c.domainCode, { name: c.domainName, code: c.domainCode }])).values()
    );
    const uniqueLevels = [...new Set(entry.controls.map(c => c.level).filter(Boolean))];
    return {
      ...i,
      linkedControlIds: entry.ids,
      linkedControlLabels: entry.labels,
      linkedControls: entry.controls,
      domains: uniqueDomains,
      cmmcLevels: uniqueLevels,
    };
  });
}

// ── List evidence ──────────────────────────────────────────────────────────
router.get("/evidence", requireAuth, requireOrg, async (req, res) => {
  const { status, evidenceType, controlId, ownerId, search, expiringDays, showArchived } =
    req.query as Record<string, string>;
  const orgId = req.orgId;

  // Default: exclude archived. Pass showArchived=true to include them.
  const excludeArchived = showArchived !== "true";

  // Build expanded search condition across multiple text fields
  const searchCond = search
    ? or(
        ilike(evidenceItemsTable.title, `%${search}%`),
        ilike(evidenceItemsTable.fileName, `%${search}%`),
        ilike(evidenceItemsTable.assessorSummary, `%${search}%`),
        sql`array_to_string(${evidenceItemsTable.tags}, ',') ILIKE ${"%" + search + "%"}`
      )
    : undefined;

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
          status ? eq(evidenceItemsTable.status, status as any) : excludeArchived ? ne(evidenceItemsTable.status, "archived") : undefined,
          evidenceType ? eq(evidenceItemsTable.evidenceType, evidenceType as any) : undefined,
          ownerId ? eq(evidenceItemsTable.ownerId, ownerId) : undefined,
          searchCond
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
          status ? eq(evidenceItemsTable.status, status as any) : excludeArchived ? ne(evidenceItemsTable.status, "archived") : undefined,
          evidenceType ? eq(evidenceItemsTable.evidenceType, evidenceType as any) : undefined,
          ownerId ? eq(evidenceItemsTable.ownerId, ownerId) : undefined,
          searchCond,
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

  const enriched = await attachLinkedControls(items);
  res.json(enriched);
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
    .leftJoin(usersTable, eq(usersTable.id, evidenceItemsTable.ownerId))
    .where(
      and(
        orgId ? eq(evidenceItemsTable.organizationId, orgId) : undefined,
        ne(evidenceItemsTable.status, "archived"),
        or(
          ilike(evidenceItemsTable.title, `%${q}%`),
          ilike(evidenceItemsTable.description, `%${q}%`),
          ilike(evidenceItemsTable.sourceSystem, `%${q}%`)
        )
      )
    )
    .orderBy(desc(evidenceItemsTable.updatedAt))
    .limit(50);

  const enriched = await attachLinkedControls(items);
  res.json(enriched);
});

// ── Upload endpoint (multipart/form-data) ──────────────────────────────────
router.post(
  "/evidence/upload",
  requireAuth,
  requireOrg,
  upload.single("file"),
  async (req, res) => {
    const { title, description, evidenceType, controlIds, collectedAt, expiresAt, assessorSummary, internalNotes, tags: rawTags, status: rawStatus } = req.body;

    if (!title) {
      res.status(400).json({ error: "title is required" });
      return;
    }
    if (!evidenceType) {
      res.status(400).json({ error: "evidenceType is required" });
      return;
    }
    if (!req.file) {
      res.status(400).json({ error: "file is required" });
      return;
    }

    const parsedTags: string[] = (() => {
      try {
        if (Array.isArray(rawTags)) return rawTags;
        if (typeof rawTags === "string") {
          const parsed = JSON.parse(rawTags);
          return Array.isArray(parsed) ? parsed : [];
        }
        return [];
      } catch { return []; }
    })();

    const allowedStatuses = ["draft", "needs_classification", "pending_review", "approved", "active", "assessor_ready", "rejected", "stale", "superseded", "archived"] as const;
    const uploadStatus = (allowedStatuses as readonly string[]).includes(rawStatus) ? rawStatus as typeof allowedStatuses[number] : "draft";

    const id = randomUUID();
    const storedFilename = req.file.filename;
    const originalFilename = req.file.originalname;
    const fileSize = req.file.size;
    const mimeType = req.file.mimetype;
    const fileKey = path.join("evidence", storedFilename);

    await db.insert(evidenceItemsTable).values({
      id,
      organizationId: req.orgId ?? null,
      title,
      description,
      evidenceType,
      status: uploadStatus,
      ownerId: req.authUser!.id,
      fileKey,
      fileName: originalFilename,
      fileSize,
      mimeType,
      collectedAt: collectedAt ? new Date(collectedAt) : undefined,
      expiresAt: expiresAt ? new Date(expiresAt) : undefined,
      assessorSummary,
      internalNotes,
      tags: parsedTags,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const parsedControlIds: string[] = (() => {
      try {
        if (Array.isArray(controlIds)) return controlIds;
        if (typeof controlIds === "string") {
          const parsed = JSON.parse(controlIds);
          return Array.isArray(parsed) ? parsed : [controlIds];
        }
        return [];
      } catch {
        return typeof controlIds === "string" ? [controlIds] : [];
      }
    })();

    if (parsedControlIds.length > 0) {
      await db.insert(evidenceControlLinksTable).values(
        parsedControlIds.map((cid: string) => ({
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
      .leftJoin(usersTable, eq(usersTable.id, evidenceItemsTable.ownerId))
      .where(eq(evidenceItemsTable.id, id))
      .limit(1);

    const enriched = await attachLinkedControls([created]);
    res.status(201).json(enriched[0]);
  }
);

// ── Create evidence (JSON, no file) ───────────────────────────────────────
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
    .leftJoin(usersTable, eq(usersTable.id, evidenceItemsTable.ownerId))
    .where(eq(evidenceItemsTable.id, id))
    .limit(1);

  const enriched = await attachLinkedControls([created]);
  res.status(201).json(enriched[0]);
});

// ── Get single evidence item ───────────────────────────────────────────────
router.get("/evidence/:id", requireAuth, requireOrg, async (req, res) => {
  const orgId = req.orgId;

  const [item] = await db
    .select(evidenceSelect)
    .from(evidenceItemsTable)
    .leftJoin(usersTable, eq(usersTable.id, evidenceItemsTable.ownerId))
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

  res.json({
    ...item,
    linkedControlIds: links.map((l) => l.controlId),
    linkedControlLabels: links.map((l) => l.controlLabel),
    linkedControlFullLabels: links.map((l) => `${l.controlLabel}: ${l.controlTitle}`),
  });
});

// ── Preview file (inline) ──────────────────────────────────────────────────
router.get("/evidence/:id/preview", requireAuth, requireOrg, async (req, res) => {
  const orgId = req.orgId;

  const [item] = await db
    .select({
      id: evidenceItemsTable.id,
      title: evidenceItemsTable.title,
      fileKey: evidenceItemsTable.fileKey,
      fileName: evidenceItemsTable.fileName,
      mimeType: evidenceItemsTable.mimeType,
      organizationId: evidenceItemsTable.organizationId,
    })
    .from(evidenceItemsTable)
    .where(
      and(
        eq(evidenceItemsTable.id, req.params.id),
        orgId ? eq(evidenceItemsTable.organizationId, orgId) : undefined
      )
    )
    .limit(1);

  if (!item || !item.fileKey) {
    res.status(404).json({ error: "File not found" });
    return;
  }

  const filePath = path.resolve(UPLOADS_DIR, "..", item.fileKey);
  const contentType = item.mimeType ?? "application/octet-stream";
  const fileName = item.fileName ?? "evidence-file";

  res.setHeader("Content-Type", contentType);
  res.setHeader("Content-Disposition", `inline; filename="${encodeURIComponent(fileName)}"`);
  res.setHeader("X-Content-Type-Options", "nosniff");

  const stream = createReadStream(filePath);
  stream.on("error", () => {
    if (!res.headersSent) {
      res.status(404).json({ error: "File not found on disk" });
    }
  });
  stream.pipe(res);

  // Fire-and-forget audit log after headers sent
  logAudit(req, "viewed", "evidence", item.id, { entityLabel: item.title ?? fileName }).catch(() => {});
});

// ── Download file ──────────────────────────────────────────────────────────
router.get("/evidence/:id/download", requireAuth, requireOrg, async (req, res) => {
  const orgId = req.orgId;

  const [item] = await db
    .select({
      id: evidenceItemsTable.id,
      title: evidenceItemsTable.title,
      fileKey: evidenceItemsTable.fileKey,
      fileName: evidenceItemsTable.fileName,
      mimeType: evidenceItemsTable.mimeType,
      organizationId: evidenceItemsTable.organizationId,
    })
    .from(evidenceItemsTable)
    .where(
      and(
        eq(evidenceItemsTable.id, req.params.id),
        orgId ? eq(evidenceItemsTable.organizationId, orgId) : undefined
      )
    )
    .limit(1);

  if (!item || !item.fileKey) {
    res.status(404).json({ error: "File not found" });
    return;
  }

  const filePath = path.resolve(UPLOADS_DIR, "..", item.fileKey);
  const contentType = item.mimeType ?? "application/octet-stream";
  const downloadName = item.fileName ?? "evidence-file";

  res.setHeader("Content-Type", contentType);
  res.setHeader("Content-Disposition", `attachment; filename="${encodeURIComponent(downloadName)}"`);

  const stream = createReadStream(filePath);
  stream.on("error", () => {
    if (!res.headersSent) {
      res.status(404).json({ error: "File not found on disk" });
    }
  });
  stream.pipe(res);

  logAudit(req, "downloaded", "evidence", item.id, { entityLabel: item.title ?? downloadName }).catch(() => {});
});

// ── Bulk status update ─────────────────────────────────────────────────────
router.patch("/evidence/bulk-status", requireAuth, requireOrg, async (req, res) => {
  const { ids, status } = req.body as { ids: string[]; status: string };
  const orgId = req.orgId;

  const ALLOWED = ["draft","pending_review","approved","active","assessor_ready","rejected","stale","archived","superseded"] as const;
  if (!Array.isArray(ids) || ids.length === 0) {
    res.status(400).json({ error: "ids array required" });
    return;
  }
  if (!ALLOWED.includes(status as any)) {
    res.status(400).json({ error: "invalid status" });
    return;
  }

  const rows = await db
    .select({ id: evidenceItemsTable.id, title: evidenceItemsTable.title, status: evidenceItemsTable.status })
    .from(evidenceItemsTable)
    .where(
      and(
        inArray(evidenceItemsTable.id, ids),
        orgId ? eq(evidenceItemsTable.organizationId, orgId) : undefined,
        sql`deleted_at IS NULL`
      )
    );

  if (rows.length === 0) {
    res.status(404).json({ error: "No matching evidence found" });
    return;
  }

  await db
    .update(evidenceItemsTable)
    .set({ status: status as any, updatedAt: new Date() })
    .where(
      and(
        inArray(evidenceItemsTable.id, ids),
        orgId ? eq(evidenceItemsTable.organizationId, orgId) : undefined
      )
    );

  // Write audit logs for each updated item
  for (const row of rows) {
    await logAudit(req, "status_changed", "evidence", row.id, {
      entityLabel: row.title ?? undefined,
      previousValue: row.status,
      newValue: status,
    });
  }

  res.json({ updated: rows.length });
});

// ── Bulk remove from control ─────────────────────────────────────────────────
router.post("/evidence/bulk-unlink-control", requireAuth, requireOrg, async (req, res) => {
  const { ids, controlId } = req.body as { ids: string[]; controlId: string };
  const orgId = req.orgId;

  if (!Array.isArray(ids) || ids.length === 0 || !controlId) {
    res.status(400).json({ error: "ids and controlId required" });
    return;
  }

  await db
    .delete(evidenceControlLinksTable)
    .where(
      and(
        inArray(evidenceControlLinksTable.evidenceId, ids),
        eq(evidenceControlLinksTable.controlId, controlId)
      )
    );

  for (const id of ids) {
    await logAudit(req, "link_removed", "evidence", id, {
      entityLabel: controlId,
      previousValue: controlId,
    });
  }

  res.json({ unlinked: ids.length });
});

// ── Update evidence (status, fields) ──────────────────────────────────────
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
    expiresAt, tags, assessorSummary, internalNotes, collectedAt, status,
  } = req.body;

  await db
    .update(evidenceItemsTable)
    .set({
      title: title ?? existing.title,
      description: description !== undefined ? description : existing.description,
      evidenceType: evidenceType ?? existing.evidenceType,
      status: status ?? existing.status,
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

  await logAudit(req, "updated", "evidence", req.params.id, {
    entityLabel: existing.title,
    previousValue: status ? existing.status : undefined,
    newValue: status ?? undefined,
  });

  const [updated] = await db
    .select(evidenceSelect)
    .from(evidenceItemsTable)
    .leftJoin(usersTable, eq(usersTable.id, evidenceItemsTable.ownerId))
    .where(eq(evidenceItemsTable.id, req.params.id))
    .limit(1);

  const enriched = await attachLinkedControls([updated]);
  res.json(enriched[0]);
});

// ── Archive evidence ───────────────────────────────────────────────────────
router.post("/evidence/:id/archive", requireAuth, requireOrg, async (req, res) => {
  const orgId = req.orgId;
  const [item] = await db
    .select()
    .from(evidenceItemsTable)
    .where(and(eq(evidenceItemsTable.id, req.params.id), orgId ? eq(evidenceItemsTable.organizationId, orgId) : undefined))
    .limit(1);

  if (!item) { res.status(404).json({ error: "Not found" }); return; }

  await db.update(evidenceItemsTable)
    .set({ status: "archived", updatedAt: new Date() })
    .where(eq(evidenceItemsTable.id, req.params.id));

  await logAudit(req, "status_changed", "evidence", req.params.id, { entityLabel: item.title, previousValue: item.status, newValue: "archived" });
  res.json({ id: req.params.id, status: "archived" });
});

// ── Hard delete evidence ───────────────────────────────────────────────────
router.delete("/evidence/:id", requireAuth, requireOrg, async (req, res) => {
  const orgId = req.orgId;

  const [item] = await db
    .select({
      id: evidenceItemsTable.id,
      title: evidenceItemsTable.title,
      fileKey: evidenceItemsTable.fileKey,
      organizationId: evidenceItemsTable.organizationId,
    })
    .from(evidenceItemsTable)
    .where(and(eq(evidenceItemsTable.id, req.params.id), orgId ? eq(evidenceItemsTable.organizationId, orgId) : undefined))
    .limit(1);

  if (!item) { res.status(404).json({ error: "Not found" }); return; }

  // Write audit log BEFORE deleting so we have a record
  await logAudit(req, "deleted", "evidence", req.params.id, { entityLabel: item.title });

  // Remove control links (evidenceControlLinksTable has onDelete cascade from evidence_items,
  // but being explicit in case of manual unlink ordering)
  await db.delete(evidenceControlLinksTable).where(eq(evidenceControlLinksTable.evidenceId, req.params.id));

  // Delete DB record
  await db.delete(evidenceItemsTable).where(eq(evidenceItemsTable.id, req.params.id));

  // Attempt to delete file from disk (best effort, don't fail the request if missing)
  if (item.fileKey) {
    const filePath = path.resolve(UPLOADS_DIR, "..", item.fileKey);
    fsUnlink(filePath, () => {});
  }

  res.json({ id: req.params.id, deleted: true });
});

// ── Unlink evidence from a specific control ────────────────────────────────
router.delete("/evidence/:id/controls/:controlId", requireAuth, requireOrg, async (req, res) => {
  const orgId = req.orgId;

  // Verify evidence belongs to this org
  const [item] = await db
    .select({ id: evidenceItemsTable.id, title: evidenceItemsTable.title })
    .from(evidenceItemsTable)
    .where(and(eq(evidenceItemsTable.id, req.params.id), orgId ? eq(evidenceItemsTable.organizationId, orgId) : undefined))
    .limit(1);

  if (!item) { res.status(404).json({ error: "Not found" }); return; }

  await db.delete(evidenceControlLinksTable).where(
    and(
      eq(evidenceControlLinksTable.evidenceId, req.params.id),
      eq(evidenceControlLinksTable.controlId, req.params.controlId)
    )
  );

  await logAudit(req, "link_removed", "evidence", req.params.id, {
    entityLabel: item.title,
    newValue: `Removed from control ${req.params.controlId}`,
  });

  res.json({ id: req.params.id, unlinkedControlId: req.params.controlId });
});

// ── Status transitions ─────────────────────────────────────────────────────
router.post("/evidence/:id/submit", requireAuth, requireOrg, async (req, res) => {
  const orgId = req.orgId;
  const [item] = await db.select().from(evidenceItemsTable).where(and(eq(evidenceItemsTable.id, req.params.id), orgId ? eq(evidenceItemsTable.organizationId, orgId) : undefined)).limit(1);
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

// ── Link controls ──────────────────────────────────────────────────────────
router.post("/evidence/:id/link-controls", requireAuth, requireOrg, async (req, res) => {
  const { controlIds } = req.body;
  if (!Array.isArray(controlIds)) { res.status(400).json({ error: "controlIds must be an array" }); return; }

  const existing = await db.select({ controlId: evidenceControlLinksTable.controlId }).from(evidenceControlLinksTable).where(eq(evidenceControlLinksTable.evidenceId, req.params.id));
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

// ── Audit log ─────────────────────────────────────────────────────────────
router.get("/evidence/:id/audit-log", requireAuth, requireOrg, async (req, res) => {
  const logs = await db
    .select()
    .from(auditLogsTable)
    .where(and(eq(auditLogsTable.entityType, "evidence"), eq(auditLogsTable.entityId, req.params.id)))
    .orderBy(desc(auditLogsTable.timestamp));

  res.json(logs);
});

export default router;
