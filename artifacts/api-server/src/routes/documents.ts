import { Router } from "express";
import {
  db,
  documentTemplatesTable,
  documentsTable,
  documentVersionsTable,
  documentControlMapsTable,
  documentReviewsTable,
  generatedLogsTable,
  logEntriesTable,
  checklistItemsTable,
  checklistCompletionsTable,
  usersTable,
  controlsTable,
  domainsTable,
  evidenceItemsTable,
  evidenceControlLinksTable,
  tasksTable,
} from "@workspace/db";
import { eq, and, desc, ilike, or, inArray, lte, gte, isNull } from "drizzle-orm";
import { requireAuth } from "../lib/auth";
import { requireOrg } from "../middleware/org";
import { logAudit } from "../lib/audit";
import { randomUUID } from "crypto";

const router = Router();

function fillTemplate(template: string, values: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => values[key] ?? `{{${key}}}`);
}

function addReviewDays(freq: string): Date {
  const d = new Date();
  const days: Record<string, number> = {
    monthly: 30,
    quarterly: 90,
    semi_annually: 180,
    annually: 365,
    as_needed: 365,
  };
  d.setDate(d.getDate() + (days[freq] ?? 365));
  return d;
}

async function getControlLabels(ids: string[]): Promise<string[]> {
  if (!ids.length) return [];
  const controls = await db
    .select({ id: controlsTable.id, label: controlsTable.controlId })
    .from(controlsTable)
    .where(inArray(controlsTable.id, ids));
  return controls.map((c) => c.label);
}

async function enrichDocument(doc: typeof documentsTable.$inferSelect & {
  ownerName?: string | null;
  reviewerName?: string | null;
  approverName?: string | null;
  templateTitle?: string | null;
}) {
  const labels = await getControlLabels(doc.linkedControlIds ?? []);
  return { ...doc, linkedControlLabels: labels };
}

// ─── DOCUMENT TEMPLATES ─────────────────────────────────────────────────────

router.get("/document-templates", requireAuth, async (req, res) => {
  const { docType, search, cmmcLevel } = req.query as Record<string, string>;

  const templates = await db
    .select()
    .from(documentTemplatesTable)
    .where(
      and(
        docType ? eq(documentTemplatesTable.docType, docType as any) : undefined,
        cmmcLevel ? eq(documentTemplatesTable.cmmcLevel, cmmcLevel as any) : undefined,
        search ? ilike(documentTemplatesTable.title, `%${search}%`) : undefined,
        eq(documentTemplatesTable.isActive, true)
      )
    )
    .orderBy(documentTemplatesTable.title);

  const enriched = await Promise.all(
    templates.map(async (t) => {
      const items = await db
        .select()
        .from(checklistItemsTable)
        .where(eq(checklistItemsTable.templateId, t.id))
        .orderBy(checklistItemsTable.sortOrder);
      return { ...t, checklistItems: items };
    })
  );

  res.json(enriched);
});

router.post("/document-templates", requireAuth, async (req, res) => {
  const {
    title, docType, cmmcLevel, domainAbbr, ownerRole, reviewFrequency,
    description, bodyTemplate, requiredFields, linkedControlIds, recurrenceRule,
    requiresApproval, checklistItems,
  } = req.body;

  const id = randomUUID();
  const [template] = await db
    .insert(documentTemplatesTable)
    .values({
      id,
      title,
      docType,
      cmmcLevel: cmmcLevel ?? "both",
      domainAbbr,
      ownerRole: ownerRole ?? "compliance_manager",
      reviewFrequency: reviewFrequency ?? "annually",
      description,
      bodyTemplate,
      requiredFields: requiredFields ?? [],
      placeholders: (bodyTemplate?.match(/\{\{(\w+)\}\}/g) ?? []).map((p: string) => p.slice(2, -2)),
      linkedControlIds: linkedControlIds ?? [],
      requiresApproval: requiresApproval ?? true,
      recurrenceRule,
    })
    .returning();

  if (checklistItems?.length) {
    await db.insert(checklistItemsTable).values(
      checklistItems.map((item: any, i: number) => ({
        id: randomUUID(),
        templateId: id,
        itemText: item.itemText,
        description: item.description,
        isRequired: item.isRequired ?? true,
        sortOrder: i,
      }))
    );
  }

  await logAudit(req, "create", "document_template", id, { entityLabel: template.title, newValue: template });
  res.status(201).json({ ...template, checklistItems: checklistItems ?? [] });
});

router.get("/document-templates/:id", requireAuth, async (req, res) => {
  const [template] = await db
    .select()
    .from(documentTemplatesTable)
    .where(eq(documentTemplatesTable.id, req.params.id));

  if (!template) { res.status(404).json({ error: "Not found" }); return; }

  const items = await db
    .select()
    .from(checklistItemsTable)
    .where(eq(checklistItemsTable.templateId, template.id))
    .orderBy(checklistItemsTable.sortOrder);

  res.json({ ...template, checklistItems: items });
});

router.patch("/document-templates/:id", requireAuth, async (req, res) => {
  const { title, bodyTemplate, description, isActive, linkedControlIds, checklistItems } = req.body;
  const prev = await db.select().from(documentTemplatesTable).where(eq(documentTemplatesTable.id, req.params.id));
  if (!prev[0]) { res.status(404).json({ error: "Not found" }); return; }

  const updates: Partial<typeof documentTemplatesTable.$inferSelect> = { updatedAt: new Date() };
  if (title !== undefined) updates.title = title;
  if (bodyTemplate !== undefined) {
    updates.bodyTemplate = bodyTemplate;
    updates.placeholders = (bodyTemplate.match(/\{\{(\w+)\}\}/g) ?? []).map((p: string) => p.slice(2, -2));
  }
  if (description !== undefined) updates.description = description;
  if (isActive !== undefined) updates.isActive = isActive;
  if (linkedControlIds !== undefined) updates.linkedControlIds = linkedControlIds;

  const [updated] = await db
    .update(documentTemplatesTable)
    .set(updates)
    .where(eq(documentTemplatesTable.id, req.params.id))
    .returning();

  if (checklistItems !== undefined) {
    await db.delete(checklistItemsTable).where(eq(checklistItemsTable.templateId, req.params.id));
    if (checklistItems.length) {
      await db.insert(checklistItemsTable).values(
        checklistItems.map((item: any, i: number) => ({
          id: randomUUID(),
          templateId: req.params.id,
          itemText: item.itemText,
          description: item.description,
          isRequired: item.isRequired ?? true,
          sortOrder: i,
        }))
      );
    }
  }

  await logAudit(req, "update", "document_template", req.params.id, { entityLabel: updated.title, previousValue: prev[0], newValue: updated });
  res.json({ ...updated, checklistItems: checklistItems ?? [] });
});

// ─── DOCUMENTS ──────────────────────────────────────────────────────────────

router.get("/documents", requireAuth, requireOrg, async (req, res) => {
  const { docType, status, controlId, search, dueForReview } = req.query as Record<string, string>;
  const orgId = req.orgId;

  const rows = await db
    .select({
      id: documentsTable.id,
      templateId: documentsTable.templateId,
      templateTitle: documentTemplatesTable.title,
      title: documentsTable.title,
      docType: documentsTable.docType,
      status: documentsTable.status,
      cmmcLevel: documentsTable.cmmcLevel,
      version: documentsTable.version,
      organizationName: documentsTable.organizationName,
      systemName: documentsTable.systemName,
      effectiveDate: documentsTable.effectiveDate,
      nextReviewDate: documentsTable.nextReviewDate,
      expiresAt: documentsTable.expiresAt,
      ownerId: documentsTable.ownerId,
      ownerName: usersTable.name,
      reviewerId: documentsTable.reviewerId,
      reviewerName: documentsTable.reviewerId,
      approverId: documentsTable.approverId,
      approverName: documentsTable.approverId,
      reviewedAt: documentsTable.reviewedAt,
      approvedAt: documentsTable.approvedAt,
      activatedAt: documentsTable.activatedAt,
      rejectionNotes: documentsTable.rejectionNotes,
      reviewFrequency: documentsTable.reviewFrequency,
      isCurrentVersion: documentsTable.isCurrentVersion,
      previousVersionId: documentsTable.previousVersionId,
      createdAt: documentsTable.createdAt,
      updatedAt: documentsTable.updatedAt,
    })
    .from(documentsTable)
    .leftJoin(usersTable, eq(usersTable.id, documentsTable.ownerId))
    .leftJoin(documentTemplatesTable, eq(documentTemplatesTable.id, documentsTable.templateId))
    .where(
      and(
        orgId ? eq(documentsTable.organizationId, orgId) : undefined,
        docType ? eq(documentsTable.docType, docType as any) : undefined,
        status ? eq(documentsTable.status, status as any) : undefined,
        search ? ilike(documentsTable.title, `%${search}%`) : undefined,
        dueForReview === "true"
          ? lte(documentsTable.nextReviewDate, new Date(Date.now() + 30 * 24 * 60 * 60 * 1000))
          : undefined,
        eq(documentsTable.isCurrentVersion, true)
      )
    )
    .orderBy(desc(documentsTable.updatedAt));

  // Fetch linked control IDs from junction table for all docs at once
  const docIds = rows.map((r) => r.id);
  const controlMaps = docIds.length > 0
    ? await db.select({ documentId: documentControlMapsTable.documentId, controlId: documentControlMapsTable.controlId })
        .from(documentControlMapsTable)
        .where(inArray(documentControlMapsTable.documentId, docIds))
    : [];
  const controlMapsByDoc: Record<string, string[]> = {};
  for (const m of controlMaps) {
    if (!controlMapsByDoc[m.documentId]) controlMapsByDoc[m.documentId] = [];
    controlMapsByDoc[m.documentId].push(m.controlId);
  }

  let filtered = rows;
  if (controlId) {
    filtered = rows.filter((r) => (controlMapsByDoc[r.id] ?? []).includes(controlId));
  }

  const enriched = await Promise.all(filtered.map(async (doc) => {
    const linkedControlIds = controlMapsByDoc[doc.id] ?? [];
    const labels = await getControlLabels(linkedControlIds);
    return { ...doc, linkedControlIds, linkedControlLabels: labels };
  }));

  res.json(enriched);
});

// Document-like evidence types to surface in the unified documents view
const DOCUMENT_LIKE_EVIDENCE_TYPES = [
  "policy", "procedure", "log", "report", "access_review", "training_record",
  "incident_record", "risk_record", "approval_record", "system_inventory",
  "asset_inventory", "supplier_review", "backup_verification", "scan_report",
] as const;

router.get("/documents/all", requireAuth, requireOrg, async (req, res) => {
  const { search, type, status, domain, controlId, sourceType } = req.query as Record<string, string>;
  const orgId = req.orgId;

  // ── 1. Fetch formal documents ──────────────────────────────────────────────
  const docRows = (sourceType === "evidence") ? [] : await db
    .select({
      id: documentsTable.id,
      title: documentsTable.title,
      docType: documentsTable.docType,
      status: documentsTable.status,
      cmmcLevel: documentsTable.cmmcLevel,
      version: documentsTable.version,
      ownerId: documentsTable.ownerId,
      ownerName: usersTable.name,
      nextReviewDate: documentsTable.nextReviewDate,
      expiresAt: documentsTable.expiresAt,
      createdAt: documentsTable.createdAt,
      updatedAt: documentsTable.updatedAt,
    })
    .from(documentsTable)
    .leftJoin(usersTable, eq(usersTable.id, documentsTable.ownerId))
    .where(
      and(
        orgId ? eq(documentsTable.organizationId, orgId) : undefined,
        eq(documentsTable.isCurrentVersion, true),
        isNull(documentsTable.deletedAt),
        type ? eq(documentsTable.docType, type as any) : undefined,
        status ? eq(documentsTable.status, status as any) : undefined,
        search ? ilike(documentsTable.title, `%${search}%`) : undefined,
      )
    )
    .orderBy(desc(documentsTable.updatedAt));

  // ── 2. Fetch document-like evidence ────────────────────────────────────────
  const evidenceRows = (sourceType === "document") ? [] : await db
    .select({
      id: evidenceItemsTable.id,
      title: evidenceItemsTable.title,
      evidenceType: evidenceItemsTable.evidenceType,
      status: evidenceItemsTable.status,
      version: evidenceItemsTable.version,
      ownerId: evidenceItemsTable.ownerId,
      ownerName: usersTable.name,
      reviewDueDate: evidenceItemsTable.reviewDueDate,
      expiresAt: evidenceItemsTable.expiresAt,
      createdAt: evidenceItemsTable.createdAt,
      updatedAt: evidenceItemsTable.updatedAt,
      tags: evidenceItemsTable.tags,
      fileKey: evidenceItemsTable.fileKey,
      fileName: evidenceItemsTable.fileName,
    })
    .from(evidenceItemsTable)
    .leftJoin(usersTable, eq(usersTable.id, evidenceItemsTable.ownerId))
    .where(
      and(
        orgId ? eq(evidenceItemsTable.organizationId, orgId) : undefined,
        isNull(evidenceItemsTable.deletedAt),
        eq(evidenceItemsTable.isCurrentVersion, true),
        inArray(evidenceItemsTable.evidenceType, DOCUMENT_LIKE_EVIDENCE_TYPES as unknown as string[]),
        type ? eq(evidenceItemsTable.evidenceType, type as any) : undefined,
        status ? eq(evidenceItemsTable.status, status as any) : undefined,
        search ? ilike(evidenceItemsTable.title, `%${search}%`) : undefined,
      )
    )
    .orderBy(desc(evidenceItemsTable.updatedAt));

  // ── 3. Fetch control + domain info for all items ───────────────────────────
  const allIds = [
    ...docRows.map((d) => ({ id: d.id, source: "document" as const })),
    ...evidenceRows.map((e) => ({ id: e.id, source: "evidence" as const })),
  ];

  // Doc control links
  const docIds = docRows.map((d) => d.id);
  const docControlLinks = docIds.length > 0
    ? await db.select({
        documentId: documentControlMapsTable.documentId,
        controlId: documentControlMapsTable.controlId,
        controlLabel: controlsTable.controlId,
        level: controlsTable.level,
        domainName: domainsTable.name,
      })
        .from(documentControlMapsTable)
        .innerJoin(controlsTable, eq(controlsTable.id, documentControlMapsTable.controlId))
        .leftJoin(domainsTable, eq(domainsTable.id, controlsTable.domainId))
        .where(inArray(documentControlMapsTable.documentId, docIds))
    : [];

  // Evidence control links
  const evidenceIds = evidenceRows.map((e) => e.id);
  const evidenceControlLinks = evidenceIds.length > 0
    ? await db.select({
        evidenceId: evidenceControlLinksTable.evidenceId,
        controlId: evidenceControlLinksTable.controlId,
        controlLabel: controlsTable.controlId,
        level: controlsTable.level,
        domainName: domainsTable.name,
      })
        .from(evidenceControlLinksTable)
        .innerJoin(controlsTable, eq(controlsTable.id, evidenceControlLinksTable.controlId))
        .leftJoin(domainsTable, eq(domainsTable.id, controlsTable.domainId))
        .where(inArray(evidenceControlLinksTable.evidenceId, evidenceIds))
    : [];

  // Build lookup maps
  const docControlMap: Record<string, typeof docControlLinks> = {};
  for (const link of docControlLinks) {
    if (!docControlMap[link.documentId]) docControlMap[link.documentId] = [];
    docControlMap[link.documentId].push(link);
  }
  const evidControlMap: Record<string, typeof evidenceControlLinks> = {};
  for (const link of evidenceControlLinks) {
    if (!evidControlMap[link.evidenceId]) evidControlMap[link.evidenceId] = [];
    evidControlMap[link.evidenceId].push(link);
  }

  // ── 4. Shape unified items ─────────────────────────────────────────────────
  type LinkInfo = { controlId: string; controlLabel: string; level: string | null; domainName: string | null };

  function buildDomains(links: LinkInfo[]) {
    const seen = new Map<string, string>(); // domainName → domainCode
    for (const l of links) {
      const code = l.controlLabel.split(".")[0] ?? "";
      if (l.domainName && !seen.has(l.domainName)) seen.set(l.domainName, code);
    }
    return Array.from(seen.entries()).map(([name, code]) => ({ name, code }));
  }

  function buildTags(links: LinkInfo[], extraTags: string[] = []): string[] {
    const tags = new Set<string>(extraTags);
    for (const l of links) {
      tags.add(l.controlLabel);
      if (l.level) tags.add(l.level);
      if (l.domainName) tags.add(l.domainName);
      const code = l.controlLabel.split(".")[0];
      if (code) tags.add(code);
    }
    return Array.from(tags);
  }

  function buildLevels(links: LinkInfo[]): string[] {
    return [...new Set(links.map((l) => l.level).filter(Boolean))] as string[];
  }

  function matchesDomainFilter(links: LinkInfo[], domainFilter: string): boolean {
    const lf = domainFilter.toLowerCase();
    return links.some((l) =>
      (l.domainName?.toLowerCase().includes(lf) ?? false) ||
      l.controlLabel.split(".")[0]?.toLowerCase() === lf
    );
  }

  const docItems = docRows.map((doc) => {
    const links = docControlMap[doc.id] ?? [];
    if (controlId && !links.some((l) => l.controlId === controlId)) return null;
    if (domain && links.length > 0 && !matchesDomainFilter(links, domain)) return null;
    const cmmcLevels = buildLevels(links);
    return {
      id: doc.id,
      sourceType: "document" as const,
      title: doc.title,
      type: doc.docType,
      status: doc.status,
      version: doc.version ?? "1.0",
      cmmcLevel: doc.cmmcLevel ?? (cmmcLevels[0] ?? null),
      ownerName: doc.ownerName ?? null,
      nextReviewDate: doc.nextReviewDate ?? null,
      expiresAt: doc.expiresAt ?? null,
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt,
      tags: buildTags(links),
      linkedControls: links.map((l) => ({ id: l.controlId, label: l.controlLabel })),
      domains: buildDomains(links),
      cmmcLevels,
      fileKey: null as string | null,
      fileName: null as string | null,
    };
  }).filter(Boolean);

  const evidenceItems = evidenceRows.map((evid) => {
    const links = evidControlMap[evid.id] ?? [];
    if (controlId && !links.some((l) => l.controlId === controlId)) return null;
    if (domain && links.length > 0 && !matchesDomainFilter(links, domain)) return null;
    const cmmcLevels = buildLevels(links);
    return {
      id: evid.id,
      sourceType: "evidence" as const,
      title: evid.title,
      type: evid.evidenceType,
      status: evid.status,
      version: evid.version ?? "1.0",
      cmmcLevel: cmmcLevels[0] ?? null,
      ownerName: evid.ownerName ?? null,
      nextReviewDate: evid.reviewDueDate ?? null,
      expiresAt: evid.expiresAt ?? null,
      createdAt: evid.createdAt,
      updatedAt: evid.updatedAt,
      tags: buildTags(links, evid.tags ?? []),
      linkedControls: links.map((l) => ({ id: l.controlId, label: l.controlLabel })),
      domains: buildDomains(links),
      cmmcLevels,
      fileKey: evid.fileKey ?? null,
      fileName: evid.fileName ?? null,
    };
  }).filter(Boolean);

  // Merge and sort by updatedAt desc
  const merged = [...docItems, ...evidenceItems].sort(
    (a, b) => new Date(b!.updatedAt).getTime() - new Date(a!.updatedAt).getTime()
  );

  res.json(merged);
});

router.post("/documents/generate", requireAuth, requireOrg, async (req, res) => {
  const {
    templateId, title, organizationName, systemName, policyOwner,
    reviewerId, effectiveDate, nextReviewDate, fieldValues, linkedControlIds,
  } = req.body;

  const [template] = await db
    .select()
    .from(documentTemplatesTable)
    .where(eq(documentTemplatesTable.id, templateId));

  if (!template) { res.status(404).json({ error: "Template not found" }); return; }

  const mergeValues: Record<string, string> = {
    organization_name: organizationName ?? "{{organization_name}}",
    system_name: systemName ?? "{{system_name}}",
    policy_owner: policyOwner ?? "{{policy_owner}}",
    effective_date: effectiveDate ? new Date(effectiveDate).toLocaleDateString() : "{{effective_date}}",
    review_date: nextReviewDate ? new Date(nextReviewDate).toLocaleDateString() : "{{review_date}}",
    ...fieldValues,
  };

  const body = fillTemplate(template.bodyTemplate, mergeValues);
  const id = randomUUID();
  const controlIds = linkedControlIds ?? template.linkedControlIds ?? [];

  const [doc] = await db
    .insert(documentsTable)
    .values({
      id,
      organizationId: req.orgId ?? null,
      templateId,
      title: title ?? template.title,
      docType: template.docType,
      status: "draft",
      cmmcLevel: template.cmmcLevel,
      version: "1.0",
      body,
      fieldValues: mergeValues,
      organizationName,
      systemName,
      ownerId: req.authUser!.id,
      reviewerId,
      reviewFrequency: template.reviewFrequency,
      requiresApproval: template.requiresApproval,
      effectiveDate: effectiveDate ? new Date(effectiveDate) : undefined,
      nextReviewDate: nextReviewDate
        ? new Date(nextReviewDate)
        : addReviewDays(template.reviewFrequency),
      linkedControlIds: controlIds,
    })
    .returning();

  // Version record
  await db.insert(documentVersionsTable).values({
    id: randomUUID(),
    documentId: id,
    version: "1.0",
    body,
    fieldValues: mergeValues,
    status: "draft",
    changedById: req.authUser!.id,
    changeNotes: "Initial generation from template",
  });

  await logAudit(req, "generate", "document", id, { entityLabel: doc.title, newValue: { templateId, title } });
  const labels = await getControlLabels(controlIds);
  res.status(201).json({ ...doc, linkedControlLabels: labels, templateTitle: template.title });
});

// ── Shared gap-analysis helper ────────────────────────────────────────────────
// Active means: evidence approved/assessor_ready OR document active/approved.
// Draft means: exists with draft/pending status but not yet active.
const ACTIVE_EVIDENCE_STATUSES = ["approved", "assessor_ready"] as const;
const DRAFT_EVIDENCE_STATUSES = ["draft", "needs_classification", "pending_review"] as const;
const ACTIVE_DOC_STATUSES = ["active", "approved"] as const;
const DRAFT_DOC_STATUSES = ["draft", "pending_review", "needs_update"] as const;

type ControlDocItem = {
  controlId: string;
  controlLabel: string;
  title: string;
  domainName: string;
  existingStatus?: string;
  existingSource?: "evidence" | "document";
  evidenceId?: string;
  documentId?: string;
};

async function buildPolicyCoverageForOrg(orgId: string | undefined) {
  // 1. All active controls with domain info
  const allControls = await db
    .select({
      id: controlsTable.id,
      controlId: controlsTable.controlId,
      title: controlsTable.title,
      domainId: controlsTable.domainId,
      domainName: domainsTable.name,
    })
    .from(controlsTable)
    .leftJoin(domainsTable, eq(controlsTable.domainId, domainsTable.id))
    .where(eq(controlsTable.isActive, true));

  // 2. Document policies/procedures (all active/draft statuses) linked to controls
  const relevantDocStatuses = [...ACTIVE_DOC_STATUSES, ...DRAFT_DOC_STATUSES];
  const docLinks = await db
    .select({
      documentId: documentControlMapsTable.documentId,
      controlId: documentControlMapsTable.controlId,
      docType: documentsTable.docType,
      status: documentsTable.status,
      orgId: documentsTable.organizationId,
    })
    .from(documentControlMapsTable)
    .innerJoin(documentsTable, eq(documentsTable.id, documentControlMapsTable.documentId))
    .where(
      and(
        eq(documentsTable.isCurrentVersion, true),
        inArray(documentsTable.docType, ["policy", "procedure"]),
        inArray(documentsTable.status, relevantDocStatuses),
        orgId ? eq(documentsTable.organizationId, orgId) : undefined,
        isNull(documentsTable.deletedAt)
      )
    );

  // 3. Evidence policies/procedures (all active/draft statuses) linked to controls
  const relevantEvidenceStatuses = [...ACTIVE_EVIDENCE_STATUSES, ...DRAFT_EVIDENCE_STATUSES];
  const evidenceLinks = await db
    .select({
      evidenceId: evidenceControlLinksTable.evidenceId,
      controlId: evidenceControlLinksTable.controlId,
      evidenceType: evidenceItemsTable.evidenceType,
      status: evidenceItemsTable.status,
    })
    .from(evidenceControlLinksTable)
    .innerJoin(evidenceItemsTable, eq(evidenceItemsTable.id, evidenceControlLinksTable.evidenceId))
    .where(
      and(
        orgId ? eq(evidenceItemsTable.organizationId, orgId) : undefined,
        inArray(evidenceItemsTable.evidenceType, ["policy", "procedure"]),
        inArray(evidenceItemsTable.status, relevantEvidenceStatuses)
      )
    );

  // Build coverage maps keyed by controlId (UUID)
  // Maps: controlId → best status ("active" beats "draft")
  const policyDoc = new Map<string, { status: string; documentId: string }>();
  const procedureDoc = new Map<string, { status: string; documentId: string }>();
  for (const link of docLinks) {
    const isActive = (ACTIVE_DOC_STATUSES as readonly string[]).includes(link.status);
    if (link.docType === "policy") {
      const existing = policyDoc.get(link.controlId);
      if (!existing || isActive) policyDoc.set(link.controlId, { status: link.status, documentId: link.documentId });
    } else if (link.docType === "procedure") {
      const existing = procedureDoc.get(link.controlId);
      if (!existing || isActive) procedureDoc.set(link.controlId, { status: link.status, documentId: link.documentId });
    }
  }

  const policyEvidence = new Map<string, { status: string; evidenceId: string }>();
  const procedureEvidence = new Map<string, { status: string; evidenceId: string }>();
  for (const link of evidenceLinks) {
    const isActive = (ACTIVE_EVIDENCE_STATUSES as readonly string[]).includes(link.status);
    if (link.evidenceType === "policy") {
      const existing = policyEvidence.get(link.controlId);
      if (!existing || isActive) policyEvidence.set(link.controlId, { status: link.status, evidenceId: link.evidenceId });
    } else if (link.evidenceType === "procedure") {
      const existing = procedureEvidence.get(link.controlId);
      if (!existing || isActive) procedureEvidence.set(link.controlId, { status: link.status, evidenceId: link.evidenceId });
    }
  }

  const controlsMissingPolicy: ControlDocItem[] = [];
  const controlsWithDraftPolicy: ControlDocItem[] = [];
  const controlsMissingProcedure: ControlDocItem[] = [];
  const controlsWithDraftProcedure: ControlDocItem[] = [];

  for (const c of allControls) {
    const domainName = c.domainName ?? "";

    // Policy coverage
    const pd = policyDoc.get(c.id);
    const pe = policyEvidence.get(c.id);
    // Choose best: prefer active over draft, prefer any over none
    let bestPolicyStatus: string | undefined;
    let bestPolicySource: "document" | "evidence" | undefined;
    let bestPolicyDocId: string | undefined;
    let bestPolicyEvidId: string | undefined;

    if (pd) { bestPolicyStatus = pd.status; bestPolicySource = "document"; bestPolicyDocId = pd.documentId; }
    if (pe) {
      const peActive = (ACTIVE_EVIDENCE_STATUSES as readonly string[]).includes(pe.status);
      const pdActive = pd ? (ACTIVE_DOC_STATUSES as readonly string[]).includes(pd.status) : false;
      if (!pd || (peActive && !pdActive)) {
        bestPolicyStatus = pe.status; bestPolicySource = "evidence"; bestPolicyEvidId = pe.evidenceId; bestPolicyDocId = undefined;
      }
    }

    if (!bestPolicyStatus) {
      controlsMissingPolicy.push({ controlId: c.id, controlLabel: c.controlId, title: c.title, domainName });
    } else if (!(ACTIVE_DOC_STATUSES as readonly string[]).includes(bestPolicyStatus) && !(ACTIVE_EVIDENCE_STATUSES as readonly string[]).includes(bestPolicyStatus)) {
      controlsWithDraftPolicy.push({
        controlId: c.id, controlLabel: c.controlId, title: c.title, domainName,
        existingStatus: bestPolicyStatus, existingSource: bestPolicySource,
        evidenceId: bestPolicyEvidId, documentId: bestPolicyDocId,
      });
    }

    // Procedure coverage
    const procd = procedureDoc.get(c.id);
    const proce = procedureEvidence.get(c.id);
    let bestProcStatus: string | undefined;
    let bestProcSource: "document" | "evidence" | undefined;
    let bestProcDocId: string | undefined;
    let bestProcEvidId: string | undefined;

    if (procd) { bestProcStatus = procd.status; bestProcSource = "document"; bestProcDocId = procd.documentId; }
    if (proce) {
      const peActive = (ACTIVE_EVIDENCE_STATUSES as readonly string[]).includes(proce.status);
      const pdActive = procd ? (ACTIVE_DOC_STATUSES as readonly string[]).includes(procd.status) : false;
      if (!procd || (peActive && !pdActive)) {
        bestProcStatus = proce.status; bestProcSource = "evidence"; bestProcEvidId = proce.evidenceId; bestProcDocId = undefined;
      }
    }

    if (!bestProcStatus) {
      controlsMissingProcedure.push({ controlId: c.id, controlLabel: c.controlId, title: c.title, domainName });
    } else if (!(ACTIVE_DOC_STATUSES as readonly string[]).includes(bestProcStatus) && !(ACTIVE_EVIDENCE_STATUSES as readonly string[]).includes(bestProcStatus)) {
      controlsWithDraftProcedure.push({
        controlId: c.id, controlLabel: c.controlId, title: c.title, domainName,
        existingStatus: bestProcStatus, existingSource: bestProcSource,
        evidenceId: bestProcEvidId, documentId: bestProcDocId,
      });
    }
  }

  return { allControls, controlsMissingPolicy, controlsWithDraftPolicy, controlsMissingProcedure, controlsWithDraftProcedure };
}

router.get("/documents/missing", requireAuth, requireOrg, async (req, res) => {
  const orgId = req.orgId;

  const [coverage, now] = await Promise.all([
    buildPolicyCoverageForOrg(orgId),
    Promise.resolve(new Date()),
  ]);
  const soonDate = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

  const [expiredDocs, needsReviewDocs, pendingDocs] = await Promise.all([
    db.select().from(documentsTable).where(and(
      eq(documentsTable.isCurrentVersion, true),
      lte(documentsTable.expiresAt, now),
      orgId ? eq(documentsTable.organizationId, orgId) : undefined
    )).orderBy(desc(documentsTable.updatedAt)),
    db.select().from(documentsTable).where(and(
      eq(documentsTable.isCurrentVersion, true),
      lte(documentsTable.nextReviewDate, soonDate),
      orgId ? eq(documentsTable.organizationId, orgId) : undefined
    )).orderBy(documentsTable.nextReviewDate),
    db.select().from(documentsTable).where(and(
      eq(documentsTable.isCurrentVersion, true),
      eq(documentsTable.status, "pending_review"),
      orgId ? eq(documentsTable.organizationId, orgId) : undefined
    )).orderBy(desc(documentsTable.updatedAt)),
  ]);

  const enrich = async (docs: (typeof documentsTable.$inferSelect)[]) =>
    Promise.all(docs.map(async (d) => {
      const maps = await db.select({ controlId: documentControlMapsTable.controlId }).from(documentControlMapsTable).where(eq(documentControlMapsTable.documentId, d.id));
      const labels = await getControlLabels(maps.map((m) => m.controlId));
      return { ...d, linkedControlIds: maps.map((m) => m.controlId), linkedControlLabels: labels };
    }));

  const { controlsMissingPolicy, controlsWithDraftPolicy, controlsMissingProcedure, controlsWithDraftProcedure } = coverage;

  res.json({
    controlsMissingPolicy,
    controlsWithDraftPolicy,
    controlsMissingProcedure,
    controlsWithDraftProcedure,
    expiredDocuments: await enrich(expiredDocs),
    documentsNeedingReview: await enrich(needsReviewDocs),
    pendingApproval: await enrich(pendingDocs),
    totalMissingPolicies: controlsMissingPolicy.length,
    totalWithDraftPolicy: controlsWithDraftPolicy.length,
    totalMissingProcedures: controlsMissingProcedure.length,
    totalWithDraftProcedure: controlsWithDraftProcedure.length,
    totalExpired: expiredDocs.length,
    totalNeedingReview: needsReviewDocs.length,
    totalPendingApproval: pendingDocs.length,
  });
});

router.get("/documents/:id", requireAuth, requireOrg, async (req, res) => {
  const rows = await db
    .select({
      id: documentsTable.id,
      templateId: documentsTable.templateId,
      templateTitle: documentTemplatesTable.title,
      title: documentsTable.title,
      docType: documentsTable.docType,
      status: documentsTable.status,
      cmmcLevel: documentsTable.cmmcLevel,
      version: documentsTable.version,
      body: documentsTable.body,
      fieldValues: documentsTable.fieldValues,
      organizationName: documentsTable.organizationName,
      systemName: documentsTable.systemName,
      effectiveDate: documentsTable.effectiveDate,
      nextReviewDate: documentsTable.nextReviewDate,
      expiresAt: documentsTable.expiresAt,
      ownerId: documentsTable.ownerId,
      ownerName: usersTable.name,
      reviewerId: documentsTable.reviewerId,
      approverId: documentsTable.approverId,
      reviewedAt: documentsTable.reviewedAt,
      approvedAt: documentsTable.approvedAt,
      activatedAt: documentsTable.activatedAt,
      rejectionNotes: documentsTable.rejectionNotes,
      internalNotes: documentsTable.internalNotes,
      comments: documentsTable.comments,
      reviewFrequency: documentsTable.reviewFrequency,
      isCurrentVersion: documentsTable.isCurrentVersion,
      previousVersionId: documentsTable.previousVersionId,
      createdAt: documentsTable.createdAt,
      updatedAt: documentsTable.updatedAt,
    })
    .from(documentsTable)
    .leftJoin(usersTable, eq(usersTable.id, documentsTable.ownerId))
    .leftJoin(documentTemplatesTable, eq(documentTemplatesTable.id, documentsTable.templateId))
    .where(eq(documentsTable.id, req.params.id));

  if (!rows[0]) { res.status(404).json({ error: "Not found" }); return; }

  const doc = rows[0];
  const controlMapRows = await db.select({ controlId: documentControlMapsTable.controlId })
    .from(documentControlMapsTable)
    .where(eq(documentControlMapsTable.documentId, doc.id));
  const linkedControlIds = controlMapRows.map((m) => m.controlId);
  const labels = await getControlLabels(linkedControlIds);

  const [versions, reviews] = await Promise.all([
    db.select({
      id: documentVersionsTable.id,
      documentId: documentVersionsTable.documentId,
      version: documentVersionsTable.version,
      status: documentVersionsTable.status,
      changedByName: usersTable.name,
      changeNotes: documentVersionsTable.changeNotes,
      createdAt: documentVersionsTable.createdAt,
    })
      .from(documentVersionsTable)
      .leftJoin(usersTable, eq(usersTable.id, documentVersionsTable.changedById))
      .where(eq(documentVersionsTable.documentId, req.params.id))
      .orderBy(desc(documentVersionsTable.createdAt)),
    db.select({
      id: documentReviewsTable.id,
      documentId: documentReviewsTable.documentId,
      reviewerId: documentReviewsTable.reviewerId,
      reviewerName: usersTable.name,
      action: documentReviewsTable.action,
      notes: documentReviewsTable.notes,
      version: documentReviewsTable.version,
      reviewedAt: documentReviewsTable.reviewedAt,
    })
      .from(documentReviewsTable)
      .leftJoin(usersTable, eq(usersTable.id, documentReviewsTable.reviewerId))
      .where(eq(documentReviewsTable.documentId, req.params.id))
      .orderBy(desc(documentReviewsTable.reviewedAt)),
  ]);

  res.json({ ...doc, linkedControlIds, linkedControlLabels: labels, versionHistory: versions, reviews });
});

router.patch("/documents/:id", requireAuth, requireOrg, async (req, res) => {
  const {
    title, body, organizationName, systemName, reviewerId, nextReviewDate,
    internalNotes, comments, fieldValues, linkedControlIds,
  } = req.body;

  const [prev] = await db.select().from(documentsTable).where(eq(documentsTable.id, req.params.id));
  if (!prev) { res.status(404).json({ error: "Not found" }); return; }

  const updates: Partial<typeof documentsTable.$inferSelect> = { updatedAt: new Date() };
  if (title !== undefined) updates.title = title;
  if (body !== undefined) updates.body = body;
  if (organizationName !== undefined) updates.organizationName = organizationName;
  if (systemName !== undefined) updates.systemName = systemName;
  if (reviewerId !== undefined) updates.reviewerId = reviewerId;
  if (nextReviewDate !== undefined) updates.nextReviewDate = new Date(nextReviewDate);
  if (internalNotes !== undefined) updates.internalNotes = internalNotes;
  if (comments !== undefined) updates.comments = comments;
  if (fieldValues !== undefined) updates.fieldValues = fieldValues;
  if (linkedControlIds !== undefined) updates.linkedControlIds = linkedControlIds;

  const [updated] = await db
    .update(documentsTable)
    .set(updates)
    .where(eq(documentsTable.id, req.params.id))
    .returning();

  await logAudit(req, "update", "document", req.params.id, { entityLabel: updated.title, previousValue: prev, newValue: updated });
  const labels = await getControlLabels(updated.linkedControlIds ?? []);
  res.json({ ...updated, linkedControlLabels: labels });
});

router.post("/documents/:id/submit-review", requireAuth, requireOrg, async (req, res) => {
  const { reviewerId, notes } = req.body;
  const [prev] = await db.select().from(documentsTable).where(eq(documentsTable.id, req.params.id));
  if (!prev) { res.status(404).json({ error: "Not found" }); return; }

  const [updated] = await db
    .update(documentsTable)
    .set({ status: "pending_review", reviewerId, updatedAt: new Date() })
    .where(eq(documentsTable.id, req.params.id))
    .returning();

  await db.insert(documentReviewsTable).values({
    id: randomUUID(),
    documentId: req.params.id,
    reviewerId: (req as any).user.id,
    action: "submitted_for_review",
    notes,
    version: updated.version,
  });

  await logAudit(req, "submit_review", "document", req.params.id, { entityLabel: updated.title, previousValue: prev, newValue: updated });
  const labels = await getControlLabels(updated.linkedControlIds ?? []);
  res.json({ ...updated, linkedControlLabels: labels });
});

router.post("/documents/:id/approve", requireAuth, requireOrg, async (req, res) => {
  const { notes } = req.body;
  const [prev] = await db.select().from(documentsTable).where(eq(documentsTable.id, req.params.id));
  if (!prev) { res.status(404).json({ error: "Not found" }); return; }

  const now = new Date();
  const [updated] = await db
    .update(documentsTable)
    .set({
      status: "approved",
      approverId: (req as any).user.id,
      approvedAt: now,
      reviewedAt: now,
      updatedAt: now,
    })
    .where(eq(documentsTable.id, req.params.id))
    .returning();

  await db.insert(documentReviewsTable).values({
    id: randomUUID(),
    documentId: req.params.id,
    reviewerId: (req as any).user.id,
    action: "approved",
    notes,
    version: updated.version,
  });

  await logAudit(req, "approve", "document", req.params.id, { entityLabel: updated.title, previousValue: prev, newValue: updated });
  const labels = await getControlLabels(updated.linkedControlIds ?? []);
  res.json({ ...updated, linkedControlLabels: labels });
});

router.post("/documents/:id/reject", requireAuth, requireOrg, async (req, res) => {
  const { rejectionNotes } = req.body;
  const [prev] = await db.select().from(documentsTable).where(eq(documentsTable.id, req.params.id));
  if (!prev) { res.status(404).json({ error: "Not found" }); return; }

  const [updated] = await db
    .update(documentsTable)
    .set({ status: "draft", rejectionNotes, updatedAt: new Date() })
    .where(eq(documentsTable.id, req.params.id))
    .returning();

  await db.insert(documentReviewsTable).values({
    id: randomUUID(),
    documentId: req.params.id,
    reviewerId: (req as any).user.id,
    action: "rejected",
    notes: rejectionNotes,
    version: updated.version,
  });

  await logAudit(req, "reject", "document", req.params.id, { entityLabel: updated.title, previousValue: prev, newValue: updated });
  const labels = await getControlLabels(updated.linkedControlIds ?? []);
  res.json({ ...updated, linkedControlLabels: labels });
});

router.post("/documents/:id/activate", requireAuth, requireOrg, async (req, res) => {
  const { notes } = req.body;
  const [prev] = await db.select().from(documentsTable).where(eq(documentsTable.id, req.params.id));
  if (!prev) { res.status(404).json({ error: "Not found" }); return; }

  const now = new Date();
  const expiresAt = addReviewDays(prev.reviewFrequency ?? "annually");
  const [updated] = await db
    .update(documentsTable)
    .set({ status: "active", activatedAt: now, updatedAt: now, expiresAt })
    .where(eq(documentsTable.id, req.params.id))
    .returning();

  await db.insert(documentReviewsTable).values({
    id: randomUUID(),
    documentId: req.params.id,
    reviewerId: (req as any).user.id,
    action: "activated",
    notes,
    version: updated.version,
  });

  await logAudit(req, "activate", "document", req.params.id, { entityLabel: updated.title, previousValue: prev, newValue: updated });
  const labels = await getControlLabels(updated.linkedControlIds ?? []);
  res.json({ ...updated, linkedControlLabels: labels });
});

router.post("/documents/:id/archive", requireAuth, requireOrg, async (req, res) => {
  const { notes } = req.body;
  const [prev] = await db.select().from(documentsTable).where(eq(documentsTable.id, req.params.id));
  if (!prev) { res.status(404).json({ error: "Not found" }); return; }

  const [updated] = await db
    .update(documentsTable)
    .set({ status: "archived", updatedAt: new Date() })
    .where(eq(documentsTable.id, req.params.id))
    .returning();

  await db.insert(documentReviewsTable).values({
    id: randomUUID(),
    documentId: req.params.id,
    reviewerId: (req as any).user.id,
    action: "archived",
    notes,
    version: updated.version,
  });

  await logAudit(req, "archive", "document", req.params.id, { entityLabel: updated.title, previousValue: prev, newValue: updated });
  const labels = await getControlLabels(updated.linkedControlIds ?? []);
  res.json({ ...updated, linkedControlLabels: labels });
});

router.get("/documents/:id/versions", requireAuth, requireOrg, async (req, res) => {
  const versions = await db
    .select({
      id: documentVersionsTable.id,
      documentId: documentVersionsTable.documentId,
      version: documentVersionsTable.version,
      status: documentVersionsTable.status,
      changedByName: usersTable.name,
      changeNotes: documentVersionsTable.changeNotes,
      createdAt: documentVersionsTable.createdAt,
    })
    .from(documentVersionsTable)
    .leftJoin(usersTable, eq(usersTable.id, documentVersionsTable.changedById))
    .where(eq(documentVersionsTable.documentId, req.params.id))
    .orderBy(desc(documentVersionsTable.createdAt));

  res.json(versions);
});

// ─── DOCUMENT LOGS ──────────────────────────────────────────────────────────

router.get("/document-logs", requireAuth, requireOrg, async (req, res) => {
  const { status, templateId, search } = req.query as Record<string, string>;

  const logs = await db
    .select({
      id: generatedLogsTable.id,
      templateId: generatedLogsTable.templateId,
      templateTitle: documentTemplatesTable.title,
      title: generatedLogsTable.title,
      periodStart: generatedLogsTable.periodStart,
      periodEnd: generatedLogsTable.periodEnd,
      status: generatedLogsTable.status,
      responsibleUserId: generatedLogsTable.responsibleUserId,
      responsibleUserName: usersTable.name,
      reviewerId: generatedLogsTable.reviewerId,
      completionNotes: generatedLogsTable.completionNotes,
      reviewedAt: generatedLogsTable.reviewedAt,
      approvedAt: generatedLogsTable.approvedAt,
      generatedEvidenceId: generatedLogsTable.generatedEvidenceId,
      linkedControlIds: generatedLogsTable.linkedControlIds,
      createdAt: generatedLogsTable.createdAt,
      updatedAt: generatedLogsTable.updatedAt,
    })
    .from(generatedLogsTable)
    .leftJoin(usersTable, eq(usersTable.id, generatedLogsTable.responsibleUserId))
    .leftJoin(documentTemplatesTable, eq(documentTemplatesTable.id, generatedLogsTable.templateId))
    .where(
      and(
        status ? eq(generatedLogsTable.status, status as any) : undefined,
        templateId ? eq(generatedLogsTable.templateId, templateId) : undefined,
        search ? ilike(generatedLogsTable.title, `%${search}%`) : undefined
      )
    )
    .orderBy(desc(generatedLogsTable.createdAt));

  res.json(logs);
});

router.post("/document-logs/generate", requireAuth, requireOrg, async (req, res) => {
  const { templateId, title, periodStart, periodEnd, responsibleUserId, linkedControlIds, fieldValues } = req.body;

  let template = null;
  if (templateId) {
    const [t] = await db.select().from(documentTemplatesTable).where(eq(documentTemplatesTable.id, templateId));
    template = t;
  }

  const id = randomUUID();
  const controlIds = linkedControlIds ?? template?.linkedControlIds ?? [];

  const [log] = await db
    .insert(generatedLogsTable)
    .values({
      id,
      templateId,
      title: title ?? (template?.title ?? "Compliance Log"),
      periodStart: periodStart ? new Date(periodStart) : undefined,
      periodEnd: periodEnd ? new Date(periodEnd) : undefined,
      status: "draft",
      responsibleUserId: responsibleUserId ?? (req as any).user.id,
      linkedControlIds: controlIds,
      fieldValues: fieldValues ?? {},
    })
    .returning();

  if (template && template.checklistItems) {
    const items = await db
      .select()
      .from(checklistItemsTable)
      .where(eq(checklistItemsTable.templateId, templateId))
      .orderBy(checklistItemsTable.sortOrder);
    if (items.length) {
      await db.insert(logEntriesTable).values(
        items.map((item, i) => ({
          id: randomUUID(),
          logId: id,
          entryText: item.itemText,
          entryType: "checklist",
          isCompleted: false,
          sortOrder: i,
        }))
      );
    }
  }

  await logAudit(req, "generate", "log", id, { entityLabel: log.title, newValue: { templateId } });
  res.status(201).json({ ...log, templateTitle: template?.title });
});

router.get("/document-logs/:id", requireAuth, requireOrg, async (req, res) => {
  const rows = await db
    .select({
      id: generatedLogsTable.id,
      templateId: generatedLogsTable.templateId,
      templateTitle: documentTemplatesTable.title,
      title: generatedLogsTable.title,
      periodStart: generatedLogsTable.periodStart,
      periodEnd: generatedLogsTable.periodEnd,
      status: generatedLogsTable.status,
      responsibleUserId: generatedLogsTable.responsibleUserId,
      responsibleUserName: usersTable.name,
      reviewerId: generatedLogsTable.reviewerId,
      completionNotes: generatedLogsTable.completionNotes,
      reviewedAt: generatedLogsTable.reviewedAt,
      approvedAt: generatedLogsTable.approvedAt,
      generatedEvidenceId: generatedLogsTable.generatedEvidenceId,
      linkedControlIds: generatedLogsTable.linkedControlIds,
      fieldValues: generatedLogsTable.fieldValues,
      createdAt: generatedLogsTable.createdAt,
      updatedAt: generatedLogsTable.updatedAt,
    })
    .from(generatedLogsTable)
    .leftJoin(usersTable, eq(usersTable.id, generatedLogsTable.responsibleUserId))
    .leftJoin(documentTemplatesTable, eq(documentTemplatesTable.id, generatedLogsTable.templateId))
    .where(eq(generatedLogsTable.id, req.params.id));

  if (!rows[0]) { res.status(404).json({ error: "Not found" }); return; }

  const entries = await db
    .select()
    .from(logEntriesTable)
    .where(eq(logEntriesTable.logId, req.params.id))
    .orderBy(logEntriesTable.sortOrder);

  res.json({ ...rows[0], entries });
});

router.patch("/document-logs/:id", requireAuth, requireOrg, async (req, res) => {
  const { completionNotes, fieldValues } = req.body;
  const [prev] = await db.select().from(generatedLogsTable).where(eq(generatedLogsTable.id, req.params.id));
  if (!prev) { res.status(404).json({ error: "Not found" }); return; }

  const updates: Partial<typeof generatedLogsTable.$inferSelect> = { updatedAt: new Date() };
  if (completionNotes !== undefined) updates.completionNotes = completionNotes;
  if (fieldValues !== undefined) updates.fieldValues = fieldValues;

  const [updated] = await db
    .update(generatedLogsTable)
    .set(updates)
    .where(eq(generatedLogsTable.id, req.params.id))
    .returning();

  res.json(updated);
});

router.post("/document-logs/:id/complete", requireAuth, requireOrg, async (req, res) => {
  const { completionNotes, entries, generateEvidence } = req.body;
  const [prev] = await db.select().from(generatedLogsTable).where(eq(generatedLogsTable.id, req.params.id));
  if (!prev) { res.status(404).json({ error: "Not found" }); return; }

  if (entries?.length) {
    for (const entry of entries) {
      await db.update(logEntriesTable).set({
        isCompleted: entry.isCompleted,
        notes: entry.notes,
        completedById: (req as any).user.id,
      }).where(eq(logEntriesTable.id, entry.id));
    }
  }

  let evidenceId: string | undefined;
  if (generateEvidence) {
    evidenceId = randomUUID();
    await db.insert(evidenceItemsTable).values({
      id: evidenceId,
      title: `Completed Log: ${prev.title}`,
      description: completionNotes ?? `Compliance log completed for period ${prev.periodStart?.toLocaleDateString() ?? "N/A"} - ${prev.periodEnd?.toLocaleDateString() ?? "N/A"}`,
      evidenceType: "log",
      status: "draft",
      ownerId: (req as any).user.id,
    });
  }

  const [updated] = await db
    .update(generatedLogsTable)
    .set({
      status: "pending_review",
      completionNotes,
      generatedEvidenceId: evidenceId,
      reviewedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(generatedLogsTable.id, req.params.id))
    .returning();

  await logAudit(req, "complete", "log", req.params.id, { entityLabel: updated.title, previousValue: prev, newValue: updated });
  res.json(updated);
});

router.post("/document-logs/:id/approve", requireAuth, requireOrg, async (req, res) => {
  const { notes } = req.body;
  const [prev] = await db.select().from(generatedLogsTable).where(eq(generatedLogsTable.id, req.params.id));
  if (!prev) { res.status(404).json({ error: "Not found" }); return; }

  const [updated] = await db
    .update(generatedLogsTable)
    .set({
      status: "approved",
      approverId: (req as any).user.id,
      approvedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(generatedLogsTable.id, req.params.id))
    .returning();

  await logAudit(req, "approve", "log", req.params.id, { entityLabel: updated.title, previousValue: prev, newValue: updated });
  res.json(updated);
});

// ─── CHECKLISTS ─────────────────────────────────────────────────────────────

router.get("/checklists", requireAuth, requireOrg, async (req, res) => {
  const templates = await db
    .select()
    .from(documentTemplatesTable)
    .where(and(eq(documentTemplatesTable.docType, "checklist"), eq(documentTemplatesTable.isActive, true)))
    .orderBy(documentTemplatesTable.title);

  const enriched = await Promise.all(
    templates.map(async (t) => {
      const items = await db
        .select()
        .from(checklistItemsTable)
        .where(eq(checklistItemsTable.templateId, t.id))
        .orderBy(checklistItemsTable.sortOrder);
      return { ...t, items };
    })
  );

  res.json(enriched);
});

router.post("/checklists/:id/complete", requireAuth, requireOrg, async (req, res) => {
  const { title, notes, itemResults, generateEvidence } = req.body;
  const [template] = await db
    .select()
    .from(documentTemplatesTable)
    .where(eq(documentTemplatesTable.id, req.params.id));

  if (!template) { res.status(404).json({ error: "Not found" }); return; }

  const completionId = randomUUID();
  let evidenceId: string | undefined;

  if (generateEvidence) {
    evidenceId = randomUUID();
    await db.insert(evidenceItemsTable).values({
      id: evidenceId,
      title: `Checklist Completed: ${title}`,
      description: notes ?? `Checklist completed: ${template.title}`,
      evidenceType: "other",
      status: "draft",
      ownerId: (req as any).user.id,
    });
  }

  const [completion] = await db
    .insert(checklistCompletionsTable)
    .values({
      id: completionId,
      templateId: req.params.id,
      completedById: (req as any).user.id,
      title,
      notes,
      itemResults: itemResults ?? [],
      generatedEvidenceId: evidenceId,
      linkedControlIds: template.linkedControlIds ?? [],
    })
    .returning();

  const [user] = await db.select({ name: usersTable.name }).from(usersTable).where(eq(usersTable.id, (req as any).user.id));
  await logAudit(req, "complete_checklist", "checklist", completionId, { entityLabel: title, newValue: completion });
  res.json({ ...completion, completedByName: user?.name });
});

// ─── AUTOMATION ─────────────────────────────────────────────────────────────

router.get("/automation/doc-status", requireAuth, requireOrg, async (req, res) => {
  const now = new Date();
  const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  const [
    allDocs,
    templates,
    logsThisMonth,
    logsDue,
    checklistsCompleted,
    recentDocs,
  ] = await Promise.all([
    db.select({ status: documentsTable.status }).from(documentsTable).where(eq(documentsTable.isCurrentVersion, true)),
    db.select({ id: documentTemplatesTable.id }).from(documentTemplatesTable).where(eq(documentTemplatesTable.isActive, true)),
    db.select({ id: generatedLogsTable.id }).from(generatedLogsTable).where(
      and(
        inArray(generatedLogsTable.status, ["approved", "active"]),
        gte(generatedLogsTable.updatedAt, thisMonthStart)
      )
    ),
    db.select({ id: generatedLogsTable.id }).from(generatedLogsTable).where(eq(generatedLogsTable.status, "draft")),
    db.select({ id: checklistCompletionsTable.id }).from(checklistCompletionsTable).where(gte(checklistCompletionsTable.completedAt, thisMonthStart)),
    db.select({
      id: documentsTable.id,
      title: documentsTable.title,
      docType: documentsTable.docType,
      status: documentsTable.status,
      cmmcLevel: documentsTable.cmmcLevel,
      version: documentsTable.version,
      ownerId: documentsTable.ownerId,
      reviewFrequency: documentsTable.reviewFrequency,
      isCurrentVersion: documentsTable.isCurrentVersion,
      nextReviewDate: documentsTable.nextReviewDate,
      createdAt: documentsTable.createdAt,
      updatedAt: documentsTable.updatedAt,
    })
      .from(documentsTable)
      .where(eq(documentsTable.isCurrentVersion, true))
      .orderBy(desc(documentsTable.updatedAt))
      .limit(10),
  ]);

  const statusCounts = allDocs.reduce((acc, d) => {
    acc[d.status] = (acc[d.status] ?? 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  // Policy/procedure coverage: check both evidence and documents
  const orgId = req.orgId;
  const coverage = await buildPolicyCoverageForOrg(orgId);
  const totalControls = coverage.allControls;

  const recentDocIds = recentDocs.map((d) => d.id);
  const recentControlMaps = recentDocIds.length > 0
    ? await db.select({ documentId: documentControlMapsTable.documentId, controlId: documentControlMapsTable.controlId })
        .from(documentControlMapsTable)
        .where(inArray(documentControlMapsTable.documentId, recentDocIds))
    : [];
  const recentControlsByDoc: Record<string, string[]> = {};
  for (const m of recentControlMaps) {
    if (!recentControlsByDoc[m.documentId]) recentControlsByDoc[m.documentId] = [];
    recentControlsByDoc[m.documentId].push(m.controlId);
  }
  const enrichedRecent = await Promise.all(recentDocs.map(async (d) => {
    const ids = recentControlsByDoc[d.id] ?? [];
    return { ...d, linkedControlIds: ids, linkedControlLabels: await getControlLabels(ids) };
  }));

  res.json({
    totalDocuments: allDocs.length,
    totalActive: statusCounts["active"] ?? 0,
    totalDraft: statusCounts["draft"] ?? 0,
    totalPendingReview: statusCounts["pending_review"] ?? 0,
    totalExpired: statusCounts["expired"] ?? 0,
    totalNeedsUpdate: statusCounts["needs_update"] ?? 0,
    totalTemplates: templates.length,
    controlsMissingPolicy: coverage.controlsMissingPolicy.length,
    controlsMissingProcedure: coverage.controlsMissingProcedure.length,
    controlsWithDraftPolicy: coverage.controlsWithDraftPolicy.length,
    controlsWithDraftProcedure: coverage.controlsWithDraftProcedure.length,
    logsCompletedThisMonth: logsThisMonth.length,
    logsDue: logsDue.length,
    checklistsCompleted: checklistsCompleted.length,
    recentDocuments: enrichedRecent,
  });
});

router.post("/automation/run-doc-checks", requireAuth, requireOrg, async (req, res) => {
  const now = new Date();

  const expired = await db
    .select({ id: documentsTable.id, title: documentsTable.title })
    .from(documentsTable)
    .where(and(
      eq(documentsTable.isCurrentVersion, true),
      inArray(documentsTable.status, ["active", "approved"]),
      lte(documentsTable.expiresAt, now)
    ));

  let updated = 0;
  for (const doc of expired) {
    await db.update(documentsTable).set({ status: "expired", updatedAt: now }).where(eq(documentsTable.id, doc.id));
    updated++;
  }

  const needsReview = await db
    .select({ id: documentsTable.id, title: documentsTable.title, reviewerId: documentsTable.reviewerId })
    .from(documentsTable)
    .where(and(
      eq(documentsTable.isCurrentVersion, true),
      eq(documentsTable.status, "active"),
      lte(documentsTable.nextReviewDate, now)
    ));

  let tasksGenerated = 0;
  for (const doc of needsReview) {
    await db.update(documentsTable).set({ status: "needs_update", updatedAt: now }).where(eq(documentsTable.id, doc.id));
    const taskId = randomUUID();
    await db.insert(tasksTable).values({
      id: taskId,
      title: `Review Document: ${doc.title}`,
      description: `This document is due for periodic review.`,
      status: "open",
      priority: "medium",
      taskType: "policy_review",
      assigneeId: doc.reviewerId ?? undefined,
      createdById: (req as any).user.id,
      tags: ["document-review", "automation"],
    } as any);
    tasksGenerated++;
  }

  await logAudit(req, "run_doc_checks", "automation", "automation", { entityLabel: "Doc Checks", newValue: { expired: updated, tasks: tasksGenerated } });

  res.json({
    expiredDocuments: expired.length,
    documentsMarkedNeedsUpdate: needsReview.length,
    tasksGenerated,
    message: `Marked ${updated} documents expired, ${needsReview.length} documents needs_update, generated ${tasksGenerated} review tasks.`,
  });
});

export default router;
