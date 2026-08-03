import { Router } from "express";
import multer from "multer";
import path from "path";
import { unlink, readFile, access as fsAccess } from "fs/promises";
import { createReadStream } from "fs";
import { db, sspDocumentsTable, sspSectionsTable, sspControlMappingsTable, sspPrefillDraftsTable, controlsTable, controlAssessmentsTable, evidenceControlLinksTable, evidenceItemsTable, organizationPackagesTable, compliancePackagesTable, complianceRequirementsTable, organizationsTable } from "@workspace/db";
import { eq, and, desc, count, isNotNull, isNull, sql, ne, inArray, or } from "drizzle-orm";
import { requireAuth } from "../lib/auth";
import { requireOrg } from "../middleware/org";
import { logAudit } from "../lib/audit";
import { randomUUID } from "crypto";
import { parseSSPDocument } from "../lib/ssp-parser";
import { generateSSPDocx } from "../lib/ssp-export";
import { resolveCompatibleSSPTemplates, getSSPTemplate, buildPlaceholderValues, controlRefToL2NarrativeKeys } from "../lib/ssp-template-registry";
import { applyPrefillToDocx } from "../lib/ssp-prefill-engine";
import { objectStorageClient, ObjectStorageService, ObjectNotFoundError } from "../lib/objectStorage";

const objectStorageService = new ObjectStorageService();

// ── Package-scoped control resolver ───────────────────────────────────────────
// Returns an array of control DB UUIDs (controls.id) for the org's active
// packages, or null if the org has no packages (no restriction).
async function resolveOrgControlIds(orgId: string): Promise<string[] | null> {
  const orgPkgs = await db
    .select({ packageId: compliancePackagesTable.id, packageKey: compliancePackagesTable.packageKey })
    .from(organizationPackagesTable)
    .innerJoin(compliancePackagesTable, eq(organizationPackagesTable.packageId, compliancePackagesTable.id))
    .where(and(eq(organizationPackagesTable.organizationId, orgId), eq(organizationPackagesTable.isActive, true)));

  if (orgPkgs.length === 0) return null;

  const cmmcFarPkgIds = orgPkgs.filter(p => p.packageKey.startsWith("CMMC_") || p.packageKey === "FAR_52_204_21").map(p => p.packageId);
  const nistPkgIds    = orgPkgs.filter(p => p.packageKey.startsWith("NIST_800_171_")).map(p => p.packageId);
  const mappedPkgIds  = [...cmmcFarPkgIds, ...nistPkgIds];

  if (mappedPkgIds.length === 0) return null;

  const reqs = await db
    .select({ reqId: complianceRequirementsTable.requirementId, pkgId: complianceRequirementsTable.packageId })
    .from(complianceRequirementsTable)
    .where(inArray(complianceRequirementsTable.packageId, mappedPkgIds));

  if (reqs.length === 0) return null;

  const cmmcFarReqIds = reqs.filter(r => cmmcFarPkgIds.includes(r.pkgId)).map(r => r.reqId);
  const nistReqIds    = reqs.filter(r => nistPkgIds.includes(r.pkgId)).map(r => r.reqId);

  const matched = await db
    .selectDistinct({ id: controlsTable.id })
    .from(controlsTable)
    .where(and(
      eq(controlsTable.isActive, true),
      or(
        cmmcFarReqIds.length > 0 ? inArray(controlsTable.controlId, cmmcFarReqIds) : undefined,
        nistReqIds.length > 0    ? inArray(controlsTable.nistRef as any, nistReqIds) : undefined,
      ),
    ));

  return matched.map(c => c.id);
}

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

// ── Package-entitlement helper ────────────────────────────────────────────────
// Returns true if `orgId` has an active package that makes `templateKey` available.
async function orgIsEntitledToTemplate(orgId: string, templateKey: string): Promise<boolean> {
  const pkgRows = await db
    .select({ packageKey: compliancePackagesTable.packageKey })
    .from(organizationPackagesTable)
    .innerJoin(
      compliancePackagesTable,
      eq(organizationPackagesTable.packageId, compliancePackagesTable.id)
    )
    .where(
      and(
        eq(organizationPackagesTable.organizationId, orgId),
        eq(organizationPackagesTable.isActive, true)
      )
    );
  const packageKeys = pkgRows.map((r) => r.packageKey);
  const compatible = resolveCompatibleSSPTemplates(packageKeys);
  return compatible.some((t) => t.templateKey === templateKey);
}

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

// ── List compatible SSP templates for this org ────────────────────────────────
router.get("/ssp/templates", requireAuth, requireOrg, async (req, res): Promise<void> => {
  const orgId = (req as any).orgId as string;

  const pkgRows = await db
    .select({ packageKey: compliancePackagesTable.packageKey })
    .from(organizationPackagesTable)
    .innerJoin(
      compliancePackagesTable,
      eq(organizationPackagesTable.packageId, compliancePackagesTable.id)
    )
    .where(
      and(
        eq(organizationPackagesTable.organizationId, orgId),
        eq(organizationPackagesTable.isActive, true)
      )
    );

  const packageKeys = pkgRows.map((r) => r.packageKey);
  const templates = resolveCompatibleSSPTemplates(packageKeys);
  res.json(templates);
});

// ── Generic SSP template download (by templateKey) ───────────────────────────
router.get("/ssp/templates/:templateKey/download", requireAuth, requireOrg, async (req, res): Promise<void> => {
  const orgId = (req as any).orgId as string;
  const { templateKey } = req.params as { templateKey: string };

  // Normalise legacy "cmmc-l2-nist-r2" slug used by the old hardcoded route
  const resolvedKey =
    templateKey === "cmmc-l2-nist-r2"
      ? "CMMC_L2_NIST_R2_SSP"
      : templateKey;

  const tmpl = getSSPTemplate(resolvedKey);
  if (!tmpl) {
    res.status(404).json({ error: "Template not found" });
    return;
  }

  // Verify this org has a compatible package for the requested template
  const pkgRows = await db
    .select({ packageKey: compliancePackagesTable.packageKey })
    .from(organizationPackagesTable)
    .innerJoin(
      compliancePackagesTable,
      eq(organizationPackagesTable.packageId, compliancePackagesTable.id)
    )
    .where(
      and(
        eq(organizationPackagesTable.organizationId, orgId),
        eq(organizationPackagesTable.isActive, true)
      )
    );
  const packageKeys = pkgRows.map((r) => r.packageKey);
  const compatible = resolveCompatibleSSPTemplates(packageKeys);
  if (!compatible.some((t) => t.templateKey === resolvedKey)) {
    res.status(403).json({ error: "This template is not available for your compliance package." });
    return;
  }

  const templatePath = path.resolve(
    __dirname,
    "data",
    "templates",
    "ssp",
    tmpl.assetFilename
  );

  try {
    await fsAccess(templatePath);
  } catch {
    req.log.warn({ templateKey: resolvedKey }, "SSP template file not found");
    res.status(503).json({
      error: "The SSP template is temporarily unavailable. Contact your Control HUB administrator.",
    });
    return;
  }

  await logAudit(req, "ssp_template_downloaded", "ssp_template", resolvedKey, {
    entityLabel: tmpl.name,
    newValue: { success: true, filename: tmpl.assetFilename, version: tmpl.templateVersion },
  });

  res.setHeader(
    "Content-Type",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  );
  res.setHeader("Content-Disposition", `attachment; filename="${tmpl.downloadFilename}"`);
  createReadStream(templatePath).pipe(res);
});

// ── Prefill draft: list ───────────────────────────────────────────────────────
router.get("/ssp/prefill-drafts", requireAuth, requireOrg, async (req, res): Promise<void> => {
  const orgId = (req as any).orgId as string;
  const drafts = await db
    .select()
    .from(sspPrefillDraftsTable)
    .where(eq(sspPrefillDraftsTable.organizationId, orgId))
    .orderBy(desc(sspPrefillDraftsTable.updatedAt));
  res.json(drafts);
});

// ── Prefill draft: create ─────────────────────────────────────────────────────
router.post("/ssp/prefill-drafts", requireAuth, requireOrg, async (req, res): Promise<void> => {
  const orgId = (req as any).orgId as string;
  const userId = (req as any).userId as string | undefined;
  const { templateKey, title, valuesJson, wizardStep } = req.body as {
    templateKey?: string;
    title?: string;
    valuesJson?: string;
    wizardStep?: number;
  };

  if (!templateKey || !getSSPTemplate(templateKey)) {
    res.status(400).json({ error: "Invalid templateKey" });
    return;
  }

  if (!(await orgIsEntitledToTemplate(orgId, templateKey))) {
    res.status(403).json({ error: "This template is not available for your compliance package." });
    return;
  }

  const [draft] = await db
    .insert(sspPrefillDraftsTable)
    .values({
      id: randomUUID(),
      organizationId: orgId,
      templateKey,
      title: title?.trim() || `SSP Pre-fill Draft — ${new Date().toLocaleDateString()}`,
      valuesJson: valuesJson ?? "{}",
      wizardStep: wizardStep ?? 1,
      createdBy: userId,
    })
    .returning();

  await logAudit(req, "ssp_prefill_draft_created", "ssp_prefill_draft", draft.id, {
    entityLabel: draft.title,
    newValue: { templateKey },
  });
  res.status(201).json(draft);
});

// ── Prefill draft: get ────────────────────────────────────────────────────────
router.get("/ssp/prefill-drafts/:draftId", requireAuth, requireOrg, async (req, res): Promise<void> => {
  const orgId = (req as any).orgId as string;
  const { draftId } = req.params as { draftId: string };

  const [draft] = await db
    .select()
    .from(sspPrefillDraftsTable)
    .where(
      and(eq(sspPrefillDraftsTable.id, draftId), eq(sspPrefillDraftsTable.organizationId, orgId))
    )
    .limit(1);

  if (!draft) {
    res.status(404).json({ error: "Draft not found" });
    return;
  }
  res.json(draft);
});

// ── Prefill draft: update ─────────────────────────────────────────────────────
router.patch("/ssp/prefill-drafts/:draftId", requireAuth, requireOrg, async (req, res): Promise<void> => {
  const orgId = (req as any).orgId as string;
  const { draftId } = req.params as { draftId: string };

  const [existing] = await db
    .select({ id: sspPrefillDraftsTable.id })
    .from(sspPrefillDraftsTable)
    .where(
      and(eq(sspPrefillDraftsTable.id, draftId), eq(sspPrefillDraftsTable.organizationId, orgId))
    )
    .limit(1);
  if (!existing) {
    res.status(404).json({ error: "Draft not found" });
    return;
  }

  const updates: Record<string, unknown> = { updatedAt: new Date() };
  if (req.body.title !== undefined) updates.title = req.body.title;
  if (req.body.valuesJson !== undefined) updates.valuesJson = req.body.valuesJson;
  if (req.body.wizardStep !== undefined) updates.wizardStep = req.body.wizardStep;
  if (req.body.status !== undefined) updates.status = req.body.status;

  const [updated] = await db
    .update(sspPrefillDraftsTable)
    .set(updates)
    .where(eq(sspPrefillDraftsTable.id, draftId))
    .returning();

  res.json(updated);
});

// ── Prefill draft: delete ─────────────────────────────────────────────────────
router.delete("/ssp/prefill-drafts/:draftId", requireAuth, requireOrg, async (req, res): Promise<void> => {
  const orgId = (req as any).orgId as string;
  const { draftId } = req.params as { draftId: string };

  const [existing] = await db
    .select({ id: sspPrefillDraftsTable.id, title: sspPrefillDraftsTable.title })
    .from(sspPrefillDraftsTable)
    .where(
      and(eq(sspPrefillDraftsTable.id, draftId), eq(sspPrefillDraftsTable.organizationId, orgId))
    )
    .limit(1);
  if (!existing) {
    res.status(404).json({ error: "Draft not found" });
    return;
  }

  await db
    .delete(sspPrefillDraftsTable)
    .where(eq(sspPrefillDraftsTable.id, draftId));

  await logAudit(req, "ssp_prefill_draft_deleted", "ssp_prefill_draft", draftId, {
    entityLabel: existing.title,
  });
  res.status(204).end();
});

// ── Prefill draft: import narratives from SSP Mappings ───────────────────────
router.post("/ssp/prefill-drafts/:draftId/import-mappings", requireAuth, requireOrg, async (req, res): Promise<void> => {
  const orgId = (req as any).orgId as string;
  const { draftId } = req.params as { draftId: string };
  const overwrite = req.body?.overwrite === true;

  // Load draft
  const [draft] = await db
    .select()
    .from(sspPrefillDraftsTable)
    .where(and(eq(sspPrefillDraftsTable.id, draftId), eq(sspPrefillDraftsTable.organizationId, orgId)))
    .limit(1);
  if (!draft) {
    res.status(404).json({ error: "Draft not found" });
    return;
  }

  // Only meaningful for L2 templates
  const tmpl = getSSPTemplate(draft.templateKey);
  if (!tmpl || tmpl.cmmcLevel !== 2) {
    res.status(400).json({ error: "Import from mappings is only supported for Level 2 SSP drafts." });
    return;
  }

  // Find primary SSP document
  const [primary] = await db
    .select({ id: sspDocumentsTable.id })
    .from(sspDocumentsTable)
    .where(and(eq(sspDocumentsTable.organizationId, orgId), eq(sspDocumentsTable.isPrimary, true)))
    .limit(1);

  if (!primary) {
    res.status(404).json({ error: "No primary SSP document found. Upload and set an SSP as primary before importing." });
    return;
  }

  // Fetch all mappings with a non-empty narrative
  const mappings = await db
    .select({
      controlRef: sspControlMappingsTable.controlRef,
      implementationNarrative: sspControlMappingsTable.implementationNarrative,
    })
    .from(sspControlMappingsTable)
    .where(
      and(
        eq(sspControlMappingsTable.sspDocumentId, primary.id),
        ne(sspControlMappingsTable.implementationNarrative, "")
      )
    );

  // Parse current draft values
  let currentValues: Record<string, string> = {};
  try {
    currentValues = JSON.parse(draft.valuesJson) as Record<string, string>;
  } catch {
    // start fresh
  }

  let imported = 0;
  let skipped = 0;     // already had a value and overwrite=false
  let overwritten = 0; // already had a value but overwrite=true replaced it

  for (const m of mappings) {
    const narrative = m.implementationNarrative?.trim();
    if (!narrative) continue;

    // Derive both placeholder key variants the L2 DOCX template uses:
    //   1. "AC_L2_3_1_1_IMPLEMENTATION_NARRATIVE"  (domain+L2+ref — used in numbered sections)
    //   2. "REQ_3_1_1_IMPLEMENTATION_NARRATIVE"    (ref-only alias  — used in summary tables)
    // Always normalizes L1-tagged refs (e.g. AC.L1-3.1.1) to L2 keys so
    // controls canonicalized as L1 in ssp_control_mappings still populate correctly.
    const [domainKey, reqKey] = controlRefToL2NarrativeKeys(m.controlRef);

    const alreadyFilled = !!(currentValues[domainKey]?.trim() || currentValues[reqKey]?.trim());

    if (alreadyFilled && !overwrite) {
      // Preserve user-entered content when overwrite mode is off
      skipped++;
    } else {
      if (alreadyFilled) overwritten++;
      else imported++;
      currentValues[domainKey] = narrative;
      // Emit alias key only when it differs (avoids duplicate for fallback path)
      if (reqKey !== domainKey) {
        currentValues[reqKey] = narrative;
      }
    }
  }

  // Save updated draft
  const [updated] = await db
    .update(sspPrefillDraftsTable)
    .set({ valuesJson: JSON.stringify(currentValues), updatedAt: new Date() })
    .where(eq(sspPrefillDraftsTable.id, draftId))
    .returning();

  await logAudit(req, "ssp_prefill_mappings_imported", "ssp_prefill_draft", draftId, {
    entityLabel: draft.title,
    newValue: { imported, skipped, overwritten, total: mappings.length },
  });

  res.json({ imported, skipped, overwritten, total: mappings.length, draft: updated });
});

// ── Prefill draft: generate DOCX ──────────────────────────────────────────────
router.post("/ssp/prefill-drafts/:draftId/generate", requireAuth, requireOrg, async (req, res): Promise<void> => {
  const orgId = (req as any).orgId as string;
  const { draftId } = req.params as { draftId: string };

  const [draft] = await db
    .select()
    .from(sspPrefillDraftsTable)
    .where(
      and(eq(sspPrefillDraftsTable.id, draftId), eq(sspPrefillDraftsTable.organizationId, orgId))
    )
    .limit(1);
  if (!draft) {
    res.status(404).json({ error: "Draft not found" });
    return;
  }

  const tmpl = getSSPTemplate(draft.templateKey);
  if (!tmpl) {
    res.status(400).json({ error: "Template definition not found" });
    return;
  }

  if (!(await orgIsEntitledToTemplate(orgId, draft.templateKey))) {
    res.status(403).json({ error: "This template is not available for your compliance package." });
    return;
  }

  const templatePath = path.resolve(
    __dirname,
    "data",
    "templates",
    "ssp",
    tmpl.assetFilename
  );

  let templateBuffer: Buffer;
  try {
    templateBuffer = await readFile(templatePath);
  } catch {
    res.status(503).json({
      error: "The SSP template is temporarily unavailable. Contact your Control HUB administrator.",
    });
    return;
  }

  let wizardValues: Record<string, string> = {};
  try {
    wizardValues = JSON.parse(draft.valuesJson) as Record<string, string>;
  } catch {
    // fallback to empty
  }

  const placeholderValues = buildPlaceholderValues(wizardValues);
  const outputBuffer = applyPrefillToDocx(templateBuffer, placeholderValues);

  const orgName = wizardValues.organizationShortName || wizardValues.organizationName || "SSP";
  const safeName = orgName.replace(/[^a-zA-Z0-9_\-]/g, "_").slice(0, 40);
  const downloadFilename = `${safeName}_${tmpl.cmmcLevel === 1 ? "L1" : "L2"}_SSP_Draft.docx`;

  await logAudit(req, "ssp_prefill_generated", "ssp_prefill_draft", draftId, {
    entityLabel: draft.title,
    newValue: { templateKey: draft.templateKey, filename: downloadFilename },
  });

  res.setHeader(
    "Content-Type",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  );
  res.setHeader("Content-Disposition", `attachment; filename="${downloadFilename}"`);
  res.send(outputBuffer);
});

// ── Prefill draft: get org profile for auto-fill ──────────────────────────────
router.get("/ssp/prefill-org-profile", requireAuth, requireOrg, async (req, res): Promise<void> => {
  const orgId = (req as any).orgId as string;

  const [org] = await db
    .select({
      name: organizationsTable.name,
      legalName: organizationsTable.legalName,
      shortName: organizationsTable.shortName,
      cageCode: organizationsTable.cageCode,
      uei: organizationsTable.uei,
      industry: organizationsTable.industry,
      primaryContact: organizationsTable.primaryContact,
      organizationAddress: organizationsTable.organizationAddress,
      assessmentScope: organizationsTable.assessmentScope,
    })
    .from(organizationsTable)
    .where(eq(organizationsTable.id, orgId))
    .limit(1);

  if (!org) {
    res.status(404).json({ error: "Organization not found" });
    return;
  }

  res.json(org);
});

// ── SSP Template Download (global, auth-only, no org required) ───────────────
router.get("/ssp/templates/cmmc-l2-nist-r2/download", requireAuth, async (req, res): Promise<void> => {
  const TEMPLATE_FILENAME = "Control_HUB_CMMC_L2_NIST_800-171_SSP_Template.docx";
  const templatePath = path.resolve(
    __dirname,
    "data",
    "templates",
    "ssp",
    TEMPLATE_FILENAME
  );

  // Verify file exists before logging or streaming
  try {
    await fsAccess(templatePath);
  } catch {
    req.log.warn("SSP template file not found at expected path");
    await logAudit(req, "ssp_template_downloaded", "ssp_template", "cmmc-l2-nist-r2", {
      entityLabel: "CMMC Level 2 / NIST SP 800-171 SSP Template",
      newValue: { success: false, filename: TEMPLATE_FILENAME, version: "1.0" },
    });
    res.status(503).json({
      error: "The SSP template is temporarily unavailable. Contact your Control HUB administrator.",
    });
    return;
  }

  await logAudit(req, "ssp_template_downloaded", "ssp_template", "cmmc-l2-nist-r2", {
    entityLabel: "CMMC Level 2 / NIST SP 800-171 SSP Template",
    newValue: {
      success: true,
      filename: TEMPLATE_FILENAME,
      version: "1.0",
      templateName: "CMMC Level 2 / NIST SP 800-171 SSP Template",
    },
  });

  res.setHeader(
    "Content-Type",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  );
  res.setHeader("Content-Disposition", `attachment; filename="${TEMPLATE_FILENAME}"`);

  createReadStream(templatePath).pipe(res);
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

  // Resolve package-scoped control IDs for this org (null = no restriction)
  const packageControlIds = await resolveOrgControlIds(orgId);

  const mappingFilter = packageControlIds
    ? and(eq(sspControlMappingsTable.sspDocumentId, id), isNotNull(sspControlMappingsTable.controlDbId), inArray(sspControlMappingsTable.controlDbId, packageControlIds))
    : and(eq(sspControlMappingsTable.sspDocumentId, id), isNotNull(sspControlMappingsTable.controlDbId));

  const editedFilter = packageControlIds
    ? and(eq(sspControlMappingsTable.sspDocumentId, id), eq(sspControlMappingsTable.isEdited, true), inArray(sspControlMappingsTable.controlDbId, packageControlIds))
    : and(eq(sspControlMappingsTable.sspDocumentId, id), eq(sspControlMappingsTable.isEdited, true));

  const totalControlsQuery = packageControlIds
    ? db.select({ total: count() }).from(controlsTable).where(inArray(controlsTable.id, packageControlIds))
    : db.select({ total: count() }).from(controlsTable);

  const [[sectionsRow], [completeSectionsRow], [mappingsRow], [editedRow], [totalControlsRow]] = await Promise.all([
    db.select({ total: count() }).from(sspSectionsTable).where(eq(sspSectionsTable.sspDocumentId, id)),
    db.select({ total: count() }).from(sspSectionsTable).where(and(eq(sspSectionsTable.sspDocumentId, id), eq(sspSectionsTable.isComplete, true))),
    db.select({ total: count() }).from(sspControlMappingsTable).where(mappingFilter),
    db.select({ total: count() }).from(sspControlMappingsTable).where(editedFilter),
    totalControlsQuery,
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

  // Normalized fallback: "DOMAIN-REQ" → canonical DB control ID
  // e.g. "AC-3.1.1" → "AC.L1-3.1.1"
  // This handles SSPs that label all controls as L2 even when some are L1 in the DB.
  const normKey = (ref: string): string | null => {
    const nm = ref.match(/^([A-Z]{2,4})\.L[12]-(\d+\.\d+\.\d+)$/);
    return nm ? `${nm[1]}-${nm[2]}` : null;
  };
  const domainReqMap = new Map<string, string>(); // "AC-3.1.1" → "AC.L1-3.1.1"
  for (const [controlId] of controlMap.entries()) {
    const key = normKey(controlId);
    if (key) domainReqMap.set(key, controlId);
  }

  // Re-map any parsed ref whose level tag doesn't match the DB to its canonical form
  const normalizedMappings = controlMappings.map((m) => {
    if (controlMap.has(m.controlRef)) return m;
    const key = normKey(m.controlRef);
    if (key) {
      const canonical = domainReqMap.get(key);
      if (canonical) return { ...m, controlRef: canonical };
    }
    return m;
  });

  // Map of controlRef → existing DB row for this SSP
  const existingMap = new Map(existingMappings.map((m) => [m.controlRef, m]));

  const seenRefs = new Set<string>();
  const validMappings = normalizedMappings.filter((m) => {
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
