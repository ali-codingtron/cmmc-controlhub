import { Router } from "express";
import multer from "multer";
import path from "path";
import { createReadStream, mkdirSync } from "fs";
import { unlink } from "fs/promises";
import { db, sspDocumentsTable, sspSectionsTable, sspControlMappingsTable, controlsTable, controlAssessmentsTable } from "@workspace/db";
import { eq, and, desc, count, isNotNull, sql } from "drizzle-orm";
import { requireAuth } from "../lib/auth";
import { requireOrg } from "../middleware/org";
import { randomUUID } from "crypto";
import { readFile } from "fs/promises";
import { parseSSPDocument } from "../lib/ssp-parser";
import { generateSSPDocx } from "../lib/ssp-export";

const SSP_UPLOADS_DIR = path.resolve(__dirname, "..", "uploads", "ssp");
mkdirSync(SSP_UPLOADS_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, SSP_UPLOADS_DIR),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${randomUUID()}${ext}`);
  },
});

const upload = multer({
  storage,
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
router.get("/ssp/control-mapping", requireAuth, requireOrg, async (req, res) => {
  const orgId = (req as any).orgId as string;
  const { controlRef } = req.query as { controlRef?: string };
  if (!controlRef) return res.json(null);

  const [primary] = await db
    .select()
    .from(sspDocumentsTable)
    .where(and(eq(sspDocumentsTable.organizationId, orgId), eq(sspDocumentsTable.isPrimary, true)))
    .limit(1);

  if (!primary) return res.json(null);

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

  if (!mapping) return res.json(null);
  res.json({
    ...mapping,
    sspDocumentTitle: primary.title,
    sspDocumentNumber: primary.documentNumber,
    sspRevisionDate: primary.revisionDate,
  });
});

// ── Update control mapping (from control-detail tab) ─────────────────────────
router.patch("/ssp/control-mappings/:mappingId", requireAuth, requireOrg, async (req, res) => {
  const orgId = (req as any).orgId as string;
  const { mappingId } = req.params;

  const [mapping] = await db
    .select()
    .from(sspControlMappingsTable)
    .where(and(eq(sspControlMappingsTable.id, mappingId), eq(sspControlMappingsTable.organizationId, orgId)))
    .limit(1);
  if (!mapping) return res.status(404).json({ error: "Not found" });

  const updates: Record<string, any> = { updatedAt: new Date(), isEdited: true };
  if ("implementationNarrative" in req.body) updates.implementationNarrative = req.body.implementationNarrative;
  if ("policyReference" in req.body) updates.policyReference = req.body.policyReference;
  if ("sspStatus" in req.body) updates.sspStatus = req.body.sspStatus;

  const [updated] = await db
    .update(sspControlMappingsTable)
    .set(updates)
    .where(eq(sspControlMappingsTable.id, mappingId))
    .returning();

  res.json(updated);
});

// ── Get primary SSP (must be before /:id) ────────────────────────────────────
router.get("/ssp/primary", requireAuth, requireOrg, async (req, res) => {
  const orgId = (req as any).orgId as string;
  const [doc] = await db
    .select()
    .from(sspDocumentsTable)
    .where(and(eq(sspDocumentsTable.organizationId, orgId), eq(sspDocumentsTable.isPrimary, true)))
    .limit(1);
  if (!doc) return res.json(null);
  res.json(doc);
});

// ── List SSPs for org ─────────────────────────────────────────────────────────
router.get("/ssp", requireAuth, requireOrg, async (req, res) => {
  const orgId = (req as any).orgId as string;
  const docs = await db
    .select()
    .from(sspDocumentsTable)
    .where(eq(sspDocumentsTable.organizationId, orgId))
    .orderBy(desc(sspDocumentsTable.createdAt));
  res.json(docs);
});

// ── Create / Upload SSP ───────────────────────────────────────────────────────
router.post("/ssp", requireAuth, requireOrg, upload.single("file"), async (req, res) => {
  const orgId = (req as any).orgId as string;
  const {
    title, documentNumber, revisionNumber, revisionDate, preparedBy,
    reviewedBy, approvedBy, organization, systemName, systemOwner,
    cmmcLevel, status, notes, nextReviewDate,
  } = req.body as Record<string, string>;

  if (!title?.trim()) return res.status(400).json({ error: "title is required" });

  const id = randomUUID();
  const file = (req as any).file as Express.Multer.File | undefined;

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
      originalFileName: file?.originalname ?? null,
      fileKey: file?.filename ?? null,
      isPrimary,
    })
    .returning();

  res.status(201).json(created);
});

// ── SSP stats for overview ────────────────────────────────────────────────────
router.get("/ssp/:id/stats", requireAuth, requireOrg, async (req, res) => {
  const orgId = (req as any).orgId as string;
  const { id } = req.params;

  const [doc] = await db
    .select()
    .from(sspDocumentsTable)
    .where(and(eq(sspDocumentsTable.id, id), eq(sspDocumentsTable.organizationId, orgId)))
    .limit(1);
  if (!doc) return res.status(404).json({ error: "Not found" });

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
router.post("/ssp/:id/parse", requireAuth, requireOrg, async (req, res) => {
  const orgId = (req as any).orgId as string;
  const { id } = req.params;

  const [doc] = await db
    .select()
    .from(sspDocumentsTable)
    .where(and(eq(sspDocumentsTable.id, id), eq(sspDocumentsTable.organizationId, orgId)))
    .limit(1);
  if (!doc) return res.status(404).json({ error: "Not found" });
  if (!doc.fileKey) return res.status(400).json({ error: "No file uploaded for this SSP" });

  const filePath = path.join(SSP_UPLOADS_DIR, doc.fileKey);
  const buffer = await readFile(filePath);
  const { sections, controlMappings } = await parseSSPDocument(buffer);

  // Wipe old extracted data
  await db.delete(sspSectionsTable).where(eq(sspSectionsTable.sspDocumentId, id));
  await db.delete(sspControlMappingsTable).where(eq(sspControlMappingsTable.sspDocumentId, id));

  // Insert sections
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

  // Resolve controlDbId from controls table; only insert mappings for valid CMMC control IDs
  const allControls = await db
    .select({ id: controlsTable.id, controlId: controlsTable.controlId })
    .from(controlsTable);

  const controlMap = new Map(allControls.map((c) => [c.controlId, c.id]));

  // Deduplicate by controlRef and filter to only valid CMMC controls that exist in the library
  const seenRefs = new Set<string>();
  const validMappings = controlMappings.filter((m) => {
    if (!controlMap.has(m.controlRef)) return false;
    if (seenRefs.has(m.controlRef)) return false;
    seenRefs.add(m.controlRef);
    return true;
  });

  if (validMappings.length > 0) {
    await db.insert(sspControlMappingsTable).values(
      validMappings.map((m) => ({
        id: randomUUID(),
        sspDocumentId: id,
        organizationId: orgId,
        controlRef: m.controlRef,
        controlDbId: controlMap.get(m.controlRef) ?? null,
        implementationNarrative: m.implementationNarrative,
        policyReference: null,
        sspStatus: null,
        sourceSection: m.sourceSection || null,
        isEdited: false,
      }))
    );
  }

  await db
    .update(sspDocumentsTable)
    .set({ extractedAt: new Date(), updatedAt: new Date() })
    .where(eq(sspDocumentsTable.id, id));

  res.json({ sectionsCount: sections.length, mappingsCount: validMappings.length });
});

// ── Set primary SSP ───────────────────────────────────────────────────────────
router.post("/ssp/:id/set-primary", requireAuth, requireOrg, async (req, res) => {
  const orgId = (req as any).orgId as string;
  const { id } = req.params;

  const [doc] = await db
    .select()
    .from(sspDocumentsTable)
    .where(and(eq(sspDocumentsTable.id, id), eq(sspDocumentsTable.organizationId, orgId)))
    .limit(1);
  if (!doc) return res.status(404).json({ error: "Not found" });

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
router.get("/ssp/:id/download", requireAuth, requireOrg, async (req, res) => {
  const orgId = (req as any).orgId as string;
  const { id } = req.params;

  const [doc] = await db
    .select()
    .from(sspDocumentsTable)
    .where(and(eq(sspDocumentsTable.id, id), eq(sspDocumentsTable.organizationId, orgId)))
    .limit(1);
  if (!doc || !doc.fileKey) return res.status(404).json({ error: "File not found" });

  const filePath = path.join(SSP_UPLOADS_DIR, doc.fileKey);
  res.setHeader("Content-Disposition", `attachment; filename="${doc.originalFileName ?? doc.fileKey}"`);
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
  createReadStream(filePath).pipe(res as any);
});

// ── Export updated DOCX ───────────────────────────────────────────────────────
router.get("/ssp/:id/export", requireAuth, requireOrg, async (req, res) => {
  const orgId = (req as any).orgId as string;
  const { id } = req.params;

  const [doc] = await db
    .select()
    .from(sspDocumentsTable)
    .where(and(eq(sspDocumentsTable.id, id), eq(sspDocumentsTable.organizationId, orgId)))
    .limit(1);
  if (!doc) return res.status(404).json({ error: "Not found" });

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
router.get("/ssp/:id", requireAuth, requireOrg, async (req, res) => {
  const orgId = (req as any).orgId as string;
  const { id } = req.params;
  const [doc] = await db
    .select()
    .from(sspDocumentsTable)
    .where(and(eq(sspDocumentsTable.id, id), eq(sspDocumentsTable.organizationId, orgId)))
    .limit(1);
  if (!doc) return res.status(404).json({ error: "Not found" });
  res.json(doc);
});

// ── Update SSP metadata ───────────────────────────────────────────────────────
router.patch("/ssp/:id", requireAuth, requireOrg, async (req, res) => {
  const orgId = (req as any).orgId as string;
  const { id } = req.params;

  const [doc] = await db
    .select()
    .from(sspDocumentsTable)
    .where(and(eq(sspDocumentsTable.id, id), eq(sspDocumentsTable.organizationId, orgId)))
    .limit(1);
  if (!doc) return res.status(404).json({ error: "Not found" });

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
router.delete("/ssp/:id", requireAuth, requireOrg, async (req, res) => {
  const orgId = (req as any).orgId as string;
  const { id } = req.params;

  const [doc] = await db
    .select()
    .from(sspDocumentsTable)
    .where(and(eq(sspDocumentsTable.id, id), eq(sspDocumentsTable.organizationId, orgId)))
    .limit(1);
  if (!doc) return res.status(404).json({ error: "Not found" });

  if (doc.fileKey) {
    const filePath = path.join(SSP_UPLOADS_DIR, doc.fileKey);
    await unlink(filePath).catch(() => {});
  }

  await db.delete(sspDocumentsTable).where(eq(sspDocumentsTable.id, id));
  res.json({ success: true });
});

// ── Get sections ──────────────────────────────────────────────────────────────
router.get("/ssp/:id/sections", requireAuth, requireOrg, async (req, res) => {
  const orgId = (req as any).orgId as string;
  const { id } = req.params;

  const [doc] = await db
    .select({ id: sspDocumentsTable.id })
    .from(sspDocumentsTable)
    .where(and(eq(sspDocumentsTable.id, id), eq(sspDocumentsTable.organizationId, orgId)))
    .limit(1);
  if (!doc) return res.status(404).json({ error: "Not found" });

  const sections = await db
    .select()
    .from(sspSectionsTable)
    .where(eq(sspSectionsTable.sspDocumentId, id))
    .orderBy(sspSectionsTable.sortOrder);

  res.json(sections);
});

// ── Update a section ──────────────────────────────────────────────────────────
router.patch("/ssp/:id/sections/:sectionId", requireAuth, requireOrg, async (req, res) => {
  const orgId = (req as any).orgId as string;
  const { id, sectionId } = req.params;

  const [doc] = await db
    .select({ id: sspDocumentsTable.id })
    .from(sspDocumentsTable)
    .where(and(eq(sspDocumentsTable.id, id), eq(sspDocumentsTable.organizationId, orgId)))
    .limit(1);
  if (!doc) return res.status(404).json({ error: "Not found" });

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
router.get("/ssp/:id/control-mappings", requireAuth, requireOrg, async (req, res) => {
  const orgId = (req as any).orgId as string;
  const { id } = req.params;
  const { search, status } = req.query as { search?: string; status?: string };

  const [doc] = await db
    .select({ id: sspDocumentsTable.id })
    .from(sspDocumentsTable)
    .where(and(eq(sspDocumentsTable.id, id), eq(sspDocumentsTable.organizationId, orgId)))
    .limit(1);
  if (!doc) return res.status(404).json({ error: "Not found" });

  let mappings = await db
    .select({
      id: sspControlMappingsTable.id,
      controlRef: sspControlMappingsTable.controlRef,
      controlDbId: sspControlMappingsTable.controlDbId,
      implementationNarrative: sspControlMappingsTable.implementationNarrative,
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

  if (search) {
    const q = search.toLowerCase();
    mappings = mappings.filter(
      (m) =>
        m.controlRef.toLowerCase().includes(q) ||
        m.implementationNarrative.toLowerCase().includes(q)
    );
  }
  if (status) {
    mappings = mappings.filter((m) => m.controlStatus === status);
  }

  res.json(mappings);
});

// ── Update a control mapping ──────────────────────────────────────────────────
router.patch("/ssp/:id/control-mappings/:mappingId", requireAuth, requireOrg, async (req, res) => {
  const orgId = (req as any).orgId as string;
  const { id, mappingId } = req.params;

  const [doc] = await db
    .select({ id: sspDocumentsTable.id })
    .from(sspDocumentsTable)
    .where(and(eq(sspDocumentsTable.id, id), eq(sspDocumentsTable.organizationId, orgId)))
    .limit(1);
  if (!doc) return res.status(404).json({ error: "Not found" });

  const updates: Record<string, any> = { updatedAt: new Date(), isEdited: true };
  if ("implementationNarrative" in req.body) updates.implementationNarrative = req.body.implementationNarrative;
  if ("policyReference" in req.body) updates.policyReference = req.body.policyReference;
  if ("sspStatus" in req.body) updates.sspStatus = req.body.sspStatus;
  if ("sourceSection" in req.body) updates.sourceSection = req.body.sourceSection;

  const [updated] = await db
    .update(sspControlMappingsTable)
    .set(updates)
    .where(eq(sspControlMappingsTable.id, mappingId))
    .returning();

  res.json(updated);
});

export default router;
