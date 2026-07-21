import { Router } from "express";
import multer from "multer";
import path from "path";
import { unlink, readFile } from "fs/promises";
import { createReadStream } from "fs";
import { db, sspDocumentsTable, sspSectionsTable, sspControlMappingsTable, controlsTable, controlAssessmentsTable, evidenceControlLinksTable, evidenceItemsTable } from "@workspace/db";
import { eq, and, desc, count, isNotNull, isNull, sql, ne } from "drizzle-orm";
import { requireAuth } from "../lib/auth";
import { requireOrg } from "../middleware/org";
import { randomUUID } from "crypto";
import { parseSSPDocument } from "../lib/ssp-parser";
import { generateSSPDocx } from "../lib/ssp-export";
import { objectStorageClient, ObjectStorageService, ObjectNotFoundError } from "../lib/objectStorage";

const objectStorageService = new ObjectStorageService();

// ── GCS upload helper ─────────────────────────────────────────────────────────
async function uploadBufferToGCS(
  buffer: Buffer,
  mimeType: string,
  ext: string,
  originalFilename: string
): Promise<string> {
  const privateDir = objectStorageService.getPrivateObjectDir();
  const normalised = privateDir.startsWith("/") ? privateDir : `/${privateDir}`;
  const parts = normalised.split("/").filter(Boolean);
  const bucketName = parts[0];
  const prefix = parts.slice(1).join("/");

  const objectId = randomUUID();
  const objectName = prefix
    ? `${prefix}/ssp/${objectId}${ext}`
    : `ssp/${objectId}${ext}`;

  await objectStorageClient
    .bucket(bucketName)
    .file(objectName)
    .save(buffer, {
      contentType: mimeType,
      metadata: {
        contentDisposition: `attachment; filename="${encodeURIComponent(originalFilename)}"`,
      },
    });

  return `/objects/ssp/${objectId}${ext}`;
}

// ── GCS delete helper ─────────────────────────────────────────────────────────
async function deleteFromGCS(fileKey: string): Promise<void> {
  try {
    const file = await objectStorageService.getObjectEntityFile(fileKey);
    await file.delete();
  } catch {
    // Best effort — ignore missing objects
  }
}

// ── Read file buffer from GCS or local disk (backward compat) ─────────────────
// Old records stored bare filenames (e.g. "a9dae38f-....docx") from local disk.
// New records store "/objects/ssp/<uuid>.ext" from GCS.
async function readSSPFileBuffer(fileKey: string): Promise<Buffer | null> {
  if (fileKey.startsWith("/objects/")) {
    try {
      const file = await objectStorageService.getObjectEntityFile(fileKey);
      const [buf] = await file.download();
      return buf;
    } catch {
      return null;
    }
  }
  // Legacy local-disk fallback (dev only; will not exist in production)
  const localPath = path.resolve(__dirname, "..", "uploads", "ssp", fileKey);
  try {
    return await readFile(localPath);
  } catch {
    return null;
  }
}

// multer buffers in memory — file is uploaded to GCS in the route handler
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if ([".docx", ".doc"].includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error("Only .docx and .doc files are allowed"));
    }
  },
});

const router = Router();

// ── Get control mapping from primary SSP (must be before /:id routes) ─────────
router.get("/ssp/control-mapping", requireAuth, requireOrg, async (req, res): Promise<void> => {
  const orgId = (req as any).orgId as string;
  const { controlRef } = req.query as { controlRef?: string };
  if (!controlRef) return void res.json(null);

  const [primary] = await db
    .select()
    .from(sspDocumentsTable)
    .where(and(eq(sspDocumentsTable.organizationId, orgId), eq(sspDocumentsTable.isPrimary, true)))
    .limit(1);

  if (!primary) return void res.json(null);

  const [mapping] = await db
    .select()
    .from(sspControlMappingsTable)
    .where(
      and(
        eq(sspControlMappingsTable.sspDocumentId, primary.id),
        eq(sspControlMappingsTable.controlRef, controlRef)
      )
    )
    .limit(1);

  if (!mapping) return void res.json(null);

  const controlStatus = mapping.controlDbId
    ? await db
        .select({ status: controlAssessmentsTable.status })
        .from(controlAssessmentsTable)
        .where(and(
          eq(controlAssessmentsTable.controlId, mapping.controlDbId),
          eq(controlAssessmentsTable.organizationId, orgId),
        ))
        .limit(1)
        .then(r => r[0]?.status ?? null)
    : null;

  const hasEvidence = mapping.controlDbId
    ? await db
        .select({ id: evidenceControlLinksTable.evidenceId })
        .from(evidenceControlLinksTable)
        .innerJoin(evidenceItemsTable, and(
          eq(evidenceItemsTable.id, evidenceControlLinksTable.evidenceId),
          eq(evidenceItemsTable.organizationId, orgId),
          isNull(evidenceItemsTable.deletedAt),
        ))
        .where(eq(evidenceControlLinksTable.controlId, mapping.controlDbId))
        .limit(1)
        .then(r => r.length > 0)
    : false;

  res.json({
    ...mapping,
    controlStatus,
    hasNarrative: !!(mapping.implementationNarrative?.trim()),
    hasEvidence,
    sspDocumentTitle: primary.title,
    sspDocumentNumber: primary.documentNumber,
    sspRevisionDate: primary.revisionDate,
  });
});

// ── Update control mapping (from control-detail tab) ─────────────────────────
router.patch("/ssp/control-mappings/:mappingId", requireAuth, requireOrg, async (req, res): Promise<void> => {
  const orgId = (req as any).orgId as string;
  const { mappingId } = req.params as Record<string, string>;

  const [mapping] = await db
    .select()
    .from(sspControlMappingsTable)
    .where(and(eq(sspControlMappingsTable.id, mappingId), eq(sspControlMappingsTable.organizationId, orgId)))
    .limit(1);
  if (!mapping) return void res.status(404).json({ error: "Not found" });

  const updates: Record<string, any> = { updatedAt: new Date(), isEdited: true };
  if ("implementationNarrative" in req.body) updates.implementationNarrative = req.body.implementationNarrative;
  if ("policyReference" in req.body) updates.policyReference = req.body.policyReference;

  const [updated] = await db
    .update(sspControlMappingsTable)
    .set(updates)
    .where(eq(sspControlMappingsTable.id, mappingId))
    .returning();

  res.json(updated);
});

// ── Get primary SSP (must be before /:id) ────────────────────────────────────
router.get("/ssp/primary", requireAuth, requireOrg, async (req, res): Promise<void> => {
  const orgId = (req as any).orgId as string;
  const [doc] = await db
    .select()
    .from(sspDocumentsTable)
    .where(and(eq(sspDocumentsTable.organizationId, orgId), eq(sspDocumentsTable.isPrimary, true)))
    .limit(1);
  if (!doc) return void res.json(null);
  res.json(doc);
});

// ── List SSPs for org ─────────────────────────────────────────────────────────
router.get("/ssp", requireAuth, requireOrg, async (req, res): Promise<void> => {
  const orgId = (req as any).orgId as string;
  const docs = await db
    .select()
    .from(sspDocumentsTable)
    .where(eq(sspDocumentsTable.organizationId, orgId))
    .orderBy(desc(sspDocumentsTable.createdAt));
  res.json(docs);
});

// ── Create / Upload SSP ───────────────────────────────────────────────────────
router.post("/ssp", requireAuth, requireOrg, upload.single("file"), async (req, res): Promise<void> => {
  const orgId = (req as any).orgId as string;
  const {
    title, documentNumber, revisionNumber, revisionDate, preparedBy,
    reviewedBy, approvedBy, organization, systemName, systemOwner,
    cmmcLevel, status, notes, nextReviewDate,
  } = req.body as Record<string, string>;

  if (!title?.trim()) return void res.status(400).json({ error: "title is required" });

  const id = randomUUID();
  const multerFile = (req as any).file as Express.Multer.File | undefined;

  // Upload file to GCS if provided
  let fileKey: string | null = null;
  if (multerFile) {
    const ext = path.extname(multerFile.originalname);
    const mimeType = multerFile.mimetype || "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
    try {
      fileKey = await uploadBufferToGCS(multerFile.buffer, mimeType, ext, multerFile.originalname);
    } catch {
      return void res.status(500).json({ error: "File upload to storage failed" });
    }
  }

  const [existingPrimary] = await db
    .select({ id: sspDocumentsTable.id })
    .from(sspDocumentsTable)
    .where(and(eq(sspDocumentsTable.organizationId, orgId), eq(sspDocumentsTable.isPrimary, true)))
    .limit(1);

  const isPrimary = !existingPrimary;

  const [created] = await db
    .insert(sspDocumentsTable)
    .values({
      id,
      organizationId: orgId,
      title: title.trim(),
      documentNumber: documentNumber?.trim() || null,
      revisionNumber: revisionNumber?.trim() || null,
      revisionDate: revisionDate?.trim() || null,
      preparedBy: preparedBy?.trim() || null,
      reviewedBy: reviewedBy?.trim() || null,
      approvedBy: approvedBy?.trim() || null,
      organization: organization?.trim() || null,
      systemName: systemName?.trim() || null,
      systemOwner: systemOwner?.trim() || null,
      cmmcLevel: cmmcLevel?.trim() || null,
      status: (status as any) || "draft",
      notes: notes?.trim() || null,
      nextReviewDate: nextReviewDate?.trim() || null,
      originalFileName: multerFile?.originalname ?? null,
      fileKey,
      isPrimary,
    })
    .returning();

  res.status(201).json(created);
});

// ── SSP stats for overview ────────────────────────────────────────────────────
router.get("/ssp/:id/stats", requireAuth, requireOrg, async (req, res): Promise<void> => {
  const orgId = (req as any).orgId as string;
  const { id } = req.params as Record<string, string>;

  const [doc] = await db
    .select()
    .from(sspDocumentsTable)
    .where(and(eq(sspDocumentsTable.id, id), eq(sspDocumentsTable.organizationId, orgId)))
    .limit(1);
  if (!doc) return void res.status(404).json({ error: "Not found" });

  const [[sectionsRow], [completeSectionsRow], [mappingsRow], [editedRow], [totalControlsRow]] = await Promise.all([
    db.select({ total: count() }).from(sspSectionsTable).where(eq(sspSectionsTable.sspDocumentId, id)),
    db.select({ total: count() }).from(sspSectionsTable).where(and(eq(sspSectionsTable.sspDocumentId, id), eq(sspSectionsTable.isComplete, true))),
    db.select({ total: count() }).from(sspControlMappingsTable).where(and(eq(sspControlMappingsTable.sspDocumentId, id), isNotNull(sspControlMappingsTable.controlDbId))),
    db.select({ total: count() }).from(sspControlMappingsTable).where(and(eq(sspControlMappingsTable.sspDocumentId, id), eq(sspControlMappingsTable.isEdited, true))),
    db.select({ total: count() }).from(controlsTable),
  ]);

  res.json({
    totalSections: Number(sectionsRow?.total ?? 0),
    completeSections: Number(completeSectionsRow?.total ?? 0),
    totalMappings: Number(mappingsRow?.total ?? 0),
    editedMappings: Number(editedRow?.total ?? 0),
    totalControls: Number(totalControlsRow?.total ?? 0),
  });
});

// ── Parse / extract SSP data ──────────────────────────────────────────────────
router.post("/ssp/:id/parse", requireAuth, requireOrg, async (req, res): Promise<void> => {
  const orgId = (req as any).orgId as string;
  const { id } = req.params as Record<string, string>;

  const [doc] = await db
    .select()
    .from(sspDocumentsTable)
    .where(and(eq(sspDocumentsTable.id, id), eq(sspDocumentsTable.organizationId, orgId)))
    .limit(1);
  if (!doc) return void res.status(404).json({ error: "Not found" });
  if (!doc.fileKey) return void res.status(400).json({ error: "No file uploaded for this SSP" });

  const buffer = await readSSPFileBuffer(doc.fileKey);
  if (!buffer) return void res.status(404).json({ error: "SSP file not found in storage. Please re-upload the file." });

  const { sections, controlMappings } = await parseSSPDocument(buffer);

  // Sections are never manually edited — safe to replace entirely
  await db.delete(sspSectionsTable).where(eq(sspSectionsTable.sspDocumentId, id));

  if (sections.length > 0) {
    await db.insert(sspSectionsTable).values(
      sections.map((s) => ({
        id: randomUUID(),
        sspDocumentId: id,
        organizationId: orgId,
        sectionKey: s.sectionKey,
        sectionTitle: s.sectionTitle,
        content: s.content,
        sortOrder: s.sortOrder,
        isComplete: s.content.trim().length > 20,
      }))
    );
  }

  const [allControls, existingMappings] = await Promise.all([
    db.select({ id: controlsTable.id, controlId: controlsTable.controlId }).from(controlsTable),
    db.select().from(sspControlMappingsTable).where(eq(sspControlMappingsTable.sspDocumentId, id)),
  ]);

  const controlMap = new Map(allControls.map((c) => [c.controlId, c.id]));
  // Map of controlRef → existing DB row for this SSP
  const existingMap = new Map(existingMappings.map((m) => [m.controlRef, m]));

  const seenRefs = new Set<string>();
  const validMappings = controlMappings.filter((m) => {
    if (!controlMap.has(m.controlRef)) return false;
    if (seenRefs.has(m.controlRef)) return false;
    seenRefs.add(m.controlRef);
    return true;
  });

  const toInsert: typeof validMappings = [];
  const toUpdate: { ref: string; narrative: string; status: string; source: string }[] = [];

  for (const m of validMappings) {
    const existing = existingMap.get(m.controlRef);
    if (!existing) {
      // Control was not previously mapped — add it
      toInsert.push(m);
    } else if (!existing.isEdited) {
      // Previously mapped but user has not manually edited it — refresh from SSP
      toUpdate.push({
        ref: m.controlRef,
        narrative: m.implementationNarrative,
        status: m.sspStatus || "planned",
        source: m.sourceSection || "Control Implementation",
      });
    }
    // isEdited = true → user customised this narrative; preserve it, do nothing
  }

  if (toInsert.length > 0) {
    await db.insert(sspControlMappingsTable).values(
      toInsert.map((m) => ({
        id: randomUUID(),
        sspDocumentId: id,
        organizationId: orgId,
        controlRef: m.controlRef,
        controlDbId: controlMap.get(m.controlRef) ?? null,
        implementationNarrative: m.implementationNarrative,
        policyReference: m.policyReference || null,
        sspStatus: m.sspStatus || "planned",
        sourceSection: m.sourceSection || null,
        isEdited: false,
      }))
    );
  }

  if (toUpdate.length > 0) {
    await Promise.all(
      toUpdate.map((u) =>
        db
          .update(sspControlMappingsTable)
          .set({
            implementationNarrative: u.narrative,
            sspStatus: u.status,
            sourceSection: u.source,
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(sspControlMappingsTable.sspDocumentId, id),
              eq(sspControlMappingsTable.controlRef, u.ref)
            )
          )
      )
    );
  }

  // Gap-fill: For CMMC L2 all 110 controls are required — ensure every control
  // from the controls table has a mapping row. Any control not found by the
  // parser and not already in the DB gets a placeholder with an empty narrative
  // so the user can fill it in via the Control Mapping UI.
  const nowMapped = new Set([...existingMap.keys(), ...seenRefs]);
  const gapFillRows: { controlId: string; dbId: string }[] = [];
  for (const [controlId, dbId] of controlMap.entries()) {
    if (!nowMapped.has(controlId)) {
      gapFillRows.push({ controlId, dbId });
    }
  }

  if (gapFillRows.length > 0) {
    await db.insert(sspControlMappingsTable).values(
      gapFillRows.map((g) => ({
        id: randomUUID(),
        sspDocumentId: id,
        organizationId: orgId,
        controlRef: g.controlId,
        controlDbId: g.dbId,
        implementationNarrative: "",
        policyReference: null,
        sspStatus: "planned",
        sourceSection: null,
        isEdited: false,
      }))
    );
  }

  req.log.info(
    {
      sspId: id,
      parsedFound: validMappings.length,
      inserted: toInsert.length,
      refreshed: toUpdate.length,
      preserved: validMappings.length - toInsert.length - toUpdate.length,
      gapFilled: gapFillRows.length,
      gapFilledRefs: gapFillRows.map((g) => g.controlId),
    },
    "SSP parse complete"
  );

  await db
    .update(sspDocumentsTable)
    .set({ extractedAt: new Date(), updatedAt: new Date() })
    .where(eq(sspDocumentsTable.id, id));

  const totalMappings = existingMappings.length + toInsert.length + gapFillRows.length;
  res.json({
    sectionsCount: sections.length,
    mappingsCount: totalMappings,
    added: toInsert.length,
    refreshed: toUpdate.length,
    preserved: validMappings.length - toInsert.length - toUpdate.length,
    gapFilled: gapFillRows.length,
  });
});

// ── Set primary SSP ───────────────────────────────────────────────────────────
router.post("/ssp/:id/set-primary", requireAuth, requireOrg, async (req, res): Promise<void> => {
  const orgId = (req as any).orgId as string;
  const { id } = req.params as Record<string, string>;

  const [doc] = await db
    .select()
    .from(sspDocumentsTable)
    .where(and(eq(sspDocumentsTable.id, id), eq(sspDocumentsTable.organizationId, orgId)))
    .limit(1);
  if (!doc) return void res.status(404).json({ error: "Not found" });

  await db
    .update(sspDocumentsTable)
    .set({ isPrimary: false, updatedAt: new Date() })
    .where(eq(sspDocumentsTable.organizationId, orgId));

  const [updated] = await db
    .update(sspDocumentsTable)
    .set({ isPrimary: true, updatedAt: new Date() })
    .where(eq(sspDocumentsTable.id, id))
    .returning();

  res.json(updated);
});

// ── Download original file ────────────────────────────────────────────────────
router.get("/ssp/:id/download", requireAuth, requireOrg, async (req, res): Promise<void> => {
  const orgId = (req as any).orgId as string;
  const { id } = req.params as Record<string, string>;

  const [doc] = await db
    .select()
    .from(sspDocumentsTable)
    .where(and(eq(sspDocumentsTable.id, id), eq(sspDocumentsTable.organizationId, orgId)))
    .limit(1);
  if (!doc || !doc.fileKey) return void res.status(404).json({ error: "File not found" });

  const filename = doc.originalFileName ?? doc.fileKey;
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.wordprocessingml.document");

  if (doc.fileKey.startsWith("/objects/")) {
    // GCS path — stream from object storage
    try {
      const file = await objectStorageService.getObjectEntityFile(doc.fileKey);
      const nodeStream = file.createReadStream();
      nodeStream.on("error", (err) => {
        if (!res.headersSent) res.status(500).json({ error: "Storage read error" });
        else res.destroy();
      });
      nodeStream.pipe(res as any);
    } catch (err) {
      if (err instanceof ObjectNotFoundError) {
        return void res.status(404).json({ error: "File no longer exists in storage. Please re-upload the SSP document." });
      }
      return void res.status(500).json({ error: "Failed to retrieve file" });
    }
  } else {
    // Legacy local-disk fallback (dev records only — file will not exist in production)
    const localPath = path.resolve(__dirname, "..", "uploads", "ssp", doc.fileKey);
    const stream = createReadStream(localPath);
    stream.on("error", () => {
      if (!res.headersSent) {
        res.status(404).json({ error: "File not found in storage. Please re-upload the SSP document." });
      } else {
        res.destroy();
      }
    });
    stream.pipe(res as any);
  }
});

// ── Export updated DOCX ───────────────────────────────────────────────────────
router.get("/ssp/:id/export", requireAuth, requireOrg, async (req, res): Promise<void> => {
  const orgId = (req as any).orgId as string;
  const { id } = req.params as Record<string, string>;

  const [doc] = await db
    .select()
    .from(sspDocumentsTable)
    .where(and(eq(sspDocumentsTable.id, id), eq(sspDocumentsTable.organizationId, orgId)))
    .limit(1);
  if (!doc) return void res.status(404).json({ error: "Not found" });

  const sections = await db
    .select()
    .from(sspSectionsTable)
    .where(eq(sspSectionsTable.sspDocumentId, id))
    .orderBy(sspSectionsTable.sortOrder);

  const mappings = await db
    .select()
    .from(sspControlMappingsTable)
    .where(eq(sspControlMappingsTable.sspDocumentId, id))
    .orderBy(sspControlMappingsTable.controlRef);

  const buffer = await generateSSPDocx(doc, sections, mappings);

  const filename = `${doc.documentNumber ?? doc.title}-export.docx`
    .replace(/[^a-zA-Z0-9.\-_]/g, "_");

  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
  res.send(buffer);
});

// ── Get single SSP ────────────────────────────────────────────────────────────
router.get("/ssp/:id", requireAuth, requireOrg, async (req, res): Promise<void> => {
  const orgId = (req as any).orgId as string;
  const { id } = req.params as Record<string, string>;
  const [doc] = await db
    .select()
    .from(sspDocumentsTable)
    .where(and(eq(sspDocumentsTable.id, id), eq(sspDocumentsTable.organizationId, orgId)))
    .limit(1);
  if (!doc) return void res.status(404).json({ error: "Not found" });
  res.json(doc);
});

// ── Update SSP metadata ───────────────────────────────────────────────────────
router.patch("/ssp/:id", requireAuth, requireOrg, async (req, res): Promise<void> => {
  const orgId = (req as any).orgId as string;
  const { id } = req.params as Record<string, string>;

  const [doc] = await db
    .select()
    .from(sspDocumentsTable)
    .where(and(eq(sspDocumentsTable.id, id), eq(sspDocumentsTable.organizationId, orgId)))
    .limit(1);
  if (!doc) return void res.status(404).json({ error: "Not found" });

  const allowed = [
    "title", "documentNumber", "revisionNumber", "revisionDate", "preparedBy",
    "reviewedBy", "approvedBy", "organization", "systemName", "systemOwner",
    "cmmcLevel", "status", "notes", "nextReviewDate",
  ];
  const updates: Record<string, any> = { updatedAt: new Date() };
  for (const key of allowed) {
    if (key in req.body) updates[key] = req.body[key];
  }

  const [updated] = await db
    .update(sspDocumentsTable)
    .set(updates)
    .where(eq(sspDocumentsTable.id, id))
    .returning();

  res.json(updated);
});

// ── Delete SSP ────────────────────────────────────────────────────────────────
router.delete("/ssp/:id", requireAuth, requireOrg, async (req, res): Promise<void> => {
  const orgId = (req as any).orgId as string;
  const { id } = req.params as Record<string, string>;

  const [doc] = await db
    .select()
    .from(sspDocumentsTable)
    .where(and(eq(sspDocumentsTable.id, id), eq(sspDocumentsTable.organizationId, orgId)))
    .limit(1);
  if (!doc) return void res.status(404).json({ error: "Not found" });

  if (doc.fileKey) {
    if (doc.fileKey.startsWith("/objects/")) {
      await deleteFromGCS(doc.fileKey);
    } else {
      // Legacy local disk
      const localPath = path.resolve(__dirname, "..", "uploads", "ssp", doc.fileKey);
      await unlink(localPath).catch(() => {});
    }
  }

  await db.delete(sspDocumentsTable).where(eq(sspDocumentsTable.id, id));
  res.json({ success: true });
});

// ── Get sections ──────────────────────────────────────────────────────────────
router.get("/ssp/:id/sections", requireAuth, requireOrg, async (req, res): Promise<void> => {
  const orgId = (req as any).orgId as string;
  const { id } = req.params as Record<string, string>;

  const [doc] = await db
    .select({ id: sspDocumentsTable.id })
    .from(sspDocumentsTable)
    .where(and(eq(sspDocumentsTable.id, id), eq(sspDocumentsTable.organizationId, orgId)))
    .limit(1);
  if (!doc) return void res.status(404).json({ error: "Not found" });

  const sections = await db
    .select()
    .from(sspSectionsTable)
    .where(eq(sspSectionsTable.sspDocumentId, id))
    .orderBy(sspSectionsTable.sortOrder);

  res.json(sections);
});

// ── Update a section ──────────────────────────────────────────────────────────
router.patch("/ssp/:id/sections/:sectionId", requireAuth, requireOrg, async (req, res): Promise<void> => {
  const orgId = (req as any).orgId as string;
  const { id, sectionId } = req.params as Record<string, string>;

  const [doc] = await db
    .select({ id: sspDocumentsTable.id })
    .from(sspDocumentsTable)
    .where(and(eq(sspDocumentsTable.id, id), eq(sspDocumentsTable.organizationId, orgId)))
    .limit(1);
  if (!doc) return void res.status(404).json({ error: "Not found" });

  const updates: Record<string, any> = { updatedAt: new Date() };
  if ("content" in req.body) updates.content = req.body.content;
  if ("isComplete" in req.body) updates.isComplete = req.body.isComplete;
  if ("sectionTitle" in req.body) updates.sectionTitle = req.body.sectionTitle;

  const [updated] = await db
    .update(sspSectionsTable)
    .set(updates)
    .where(eq(sspSectionsTable.id, sectionId))
    .returning();

  res.json(updated);
});

// ── Get control mappings ──────────────────────────────────────────────────────
router.get("/ssp/:id/control-mappings", requireAuth, requireOrg, async (req, res): Promise<void> => {
  const orgId = (req as any).orgId as string;
  const { id } = req.params as Record<string, string>;
  const { search, status } = req.query as { search?: string; status?: string };

  const [doc] = await db
    .select({ id: sspDocumentsTable.id })
    .from(sspDocumentsTable)
    .where(and(eq(sspDocumentsTable.id, id), eq(sspDocumentsTable.organizationId, orgId)))
    .limit(1);
  if (!doc) return void res.status(404).json({ error: "Not found" });

  let mappings = await db
    .select({
      id: sspControlMappingsTable.id,
      controlRef: sspControlMappingsTable.controlRef,
      controlDbId: sspControlMappingsTable.controlDbId,
      implementationNarrative: sspControlMappingsTable.implementationNarrative,
      policyReference: sspControlMappingsTable.policyReference,
      sourceSection: sspControlMappingsTable.sourceSection,
      isEdited: sspControlMappingsTable.isEdited,
      controlStatus: sql<string | null>`${controlAssessmentsTable.status}`,
    })
    .from(sspControlMappingsTable)
    .leftJoin(
      controlAssessmentsTable,
      and(
        sql`${sspControlMappingsTable.controlDbId} = ${controlAssessmentsTable.controlId}`,
        eq(controlAssessmentsTable.organizationId, orgId)
      )
    )
    .where(eq(sspControlMappingsTable.sspDocumentId, id))
    .orderBy(sspControlMappingsTable.controlRef);

  const evidenceLinked = await db
    .selectDistinct({ controlId: evidenceControlLinksTable.controlId })
    .from(evidenceControlLinksTable)
    .innerJoin(evidenceItemsTable, and(
      eq(evidenceItemsTable.id, evidenceControlLinksTable.evidenceId),
      eq(evidenceItemsTable.organizationId, orgId),
      isNull(evidenceItemsTable.deletedAt),
    ));
  const evidenceSet = new Set(evidenceLinked.map(e => e.controlId));

  const enriched = mappings.map(m => ({
    ...m,
    hasNarrative: !!(m.implementationNarrative?.trim()),
    hasEvidence: !!(m.controlDbId && evidenceSet.has(m.controlDbId)),
  }));

  let filtered = enriched;
  if (search) {
    const q = search.toLowerCase();
    filtered = filtered.filter(
      (m) =>
        m.controlRef.toLowerCase().includes(q) ||
        m.implementationNarrative.toLowerCase().includes(q)
    );
  }
  if (status) {
    filtered = filtered.filter((m) => m.controlStatus === status);
  }

  res.json(filtered);
});

// ── Update a control mapping ──────────────────────────────────────────────────
router.patch("/ssp/:id/control-mappings/:mappingId", requireAuth, requireOrg, async (req, res): Promise<void> => {
  const orgId = (req as any).orgId as string;
  const { id, mappingId } = req.params as Record<string, string>;

  const [doc] = await db
    .select({ id: sspDocumentsTable.id })
    .from(sspDocumentsTable)
    .where(and(eq(sspDocumentsTable.id, id), eq(sspDocumentsTable.organizationId, orgId)))
    .limit(1);
  if (!doc) return void res.status(404).json({ error: "Not found" });

  const updates: Record<string, any> = { updatedAt: new Date() };
  if ("implementationNarrative" in req.body) updates.implementationNarrative = req.body.implementationNarrative;
  if ("policyReference" in req.body) updates.policyReference = req.body.policyReference;
  if ("sspStatus" in req.body) updates.sspStatus = req.body.sspStatus;
  updates.isEdited = true;

  const [updated] = await db
    .update(sspControlMappingsTable)
    .set(updates)
    .where(and(eq(sspControlMappingsTable.id, mappingId), eq(sspControlMappingsTable.sspDocumentId, id)))
    .returning();

  res.json(updated);
});

export default router;
