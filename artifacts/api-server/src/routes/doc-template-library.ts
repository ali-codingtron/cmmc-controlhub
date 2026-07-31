import { Router } from "express";
import {
  db,
  documentTemplatesTable,
  docTemplateSectionsTable,
  docTemplateRequirementsTable,
  docTemplateRolesTable,
  docTemplateProcedureStepsTable,
  docTemplateRecordsTable,
  docTemplateTablesTable,
  docTemplatePlaceholdersTable,
  docTemplateControlMapsTable,
  docTemplatePackagesTable,
  docTemplatePlaceholderManifestTable,
  docTemplateImportBatchesTable,
  controlsTable,
  domainsTable,
  documentsTable,
  documentControlMapsTable,
  documentEvidenceMapsTable,
  organizationsTable,
  auditLogsTable,
  evidenceItemsTable,
  evidenceControlLinksTable,
} from "@workspace/db";
import { eq, and, or, ilike, inArray, isNotNull, asc, desc } from "drizzle-orm";
import { resolveAvailableDocumentationTemplates } from "../lib/doc-template-resolver";
import { requireAuth, requireNotAssessor } from "../lib/auth";
import { requireOrg } from "../middleware/org";
import { randomUUID } from "crypto";
import AdmZip from "adm-zip";
import { Document, Packer, Paragraph, TextRun, HeadingLevel, Table, TableRow, TableCell, WidthType, AlignmentType, BorderStyle, Header, Footer, PageNumber, NumberFormat } from "docx";
import PDFDocument from "pdfkit";

const router = Router();

function requireAdmin(req: any, res: any, next: any) {
  if (req.authUser?.role !== "admin") {
    return void res.status(403).json({ error: "Admin access required" });
  }
  next();
}

function canGenerateDocs(req: any) {
  if (req.authUser?.role === "admin") return true;
  const effectiveRole = req.orgRole ?? req.authUser?.role;
  return ["global_admin", "org_admin", "compliance_manager"].includes(effectiveRole);
}

// ── GET /api/doc-templates/library ───────────────────────────────────────────
router.get("/doc-templates/library", requireAuth, async (req, res): Promise<void> => {
  const { search, artifactType, family, controlRef, status } = req.query as Record<string, string>;

  let templates = await db
    .select({
      id: documentTemplatesTable.id,
      sourceTemplateId: documentTemplatesTable.sourceTemplateId,
      title: documentTemplatesTable.title,
      docType: documentTemplatesTable.docType,
      artifactTypeLabel: documentTemplatesTable.artifactTypeLabel,
      family: documentTemplatesTable.family,
      reviewFrequency: documentTemplatesTable.reviewFrequency,
      purpose: documentTemplatesTable.purpose,
      isActive: documentTemplatesTable.isActive,
      isSystemTemplate: documentTemplatesTable.isSystemTemplate,
      sourcePackage: documentTemplatesTable.sourcePackage,
      domainAbbr: documentTemplatesTable.domainAbbr,
    })
    .from(documentTemplatesTable)
    .where(
      and(
        isNotNull(documentTemplatesTable.sourceTemplateId),
        status === "archived"
          ? eq(documentTemplatesTable.isActive, false)
          : eq(documentTemplatesTable.isActive, true),
        search
          ? or(
              ilike(documentTemplatesTable.title, `%${search}%`),
              ilike(documentTemplatesTable.sourceTemplateId, `%${search}%`),
              ilike(documentTemplatesTable.family, `%${search}%`),
              ilike(documentTemplatesTable.artifactTypeLabel, `%${search}%`),
            )
          : undefined,
        artifactType ? ilike(documentTemplatesTable.artifactTypeLabel, `%${artifactType}%`) : undefined,
        family ? ilike(documentTemplatesTable.family, `%${family}%`) : undefined,
      )
    )
    .orderBy(asc(documentTemplatesTable.domainAbbr), asc(documentTemplatesTable.title));

  if (!templates.length) return void res.json([]);

  const templateIds = templates.map((t) => t.id);

  // Fetch control maps for each template
  const controlMaps = await db
    .select({
      templateId: docTemplateControlMapsTable.templateId,
      controlId: docTemplateControlMapsTable.controlId,
      nistControlNumber: docTemplateControlMapsTable.nistControlNumber,
      controlRef: controlsTable.controlId,
    })
    .from(docTemplateControlMapsTable)
    .leftJoin(controlsTable, eq(docTemplateControlMapsTable.controlId, controlsTable.id))
    .where(inArray(docTemplateControlMapsTable.templateId, templateIds));

  const controlMapByTemplate = new Map<string, typeof controlMaps>();
  for (const cm of controlMaps) {
    if (!controlMapByTemplate.has(cm.templateId)) controlMapByTemplate.set(cm.templateId, []);
    controlMapByTemplate.get(cm.templateId)!.push(cm);
  }

  // Filter by controlRef if provided
  let filtered = templates;
  if (controlRef) {
    filtered = templates.filter((t) => {
      const maps = controlMapByTemplate.get(t.id) ?? [];
      return maps.some(
        (m) =>
          m.controlRef?.toLowerCase().includes(controlRef.toLowerCase()) ||
          m.nistControlNumber.includes(controlRef)
      );
    });
  }

  const result = filtered.map((t) => ({
    ...t,
    linkedControls: (controlMapByTemplate.get(t.id) ?? []).map((m) => ({
      controlId: m.controlId,
      nistRef: m.nistControlNumber,
      controlRef: m.controlRef,
    })),
  }));

  res.json(result);
});

// ── GET /api/doc-templates/library/:id ───────────────────────────────────────
router.get("/doc-templates/library/:id", requireAuth, async (req, res): Promise<void> => {
  const { id } = req.params as Record<string, string>;

  const [template] = await db
    .select()
    .from(documentTemplatesTable)
    .where(eq(documentTemplatesTable.id, id))
    .limit(1);

  if (!template) return void res.status(404).json({ error: "Template not found" });

  const [sections, requirements, roles, steps, records, tables, controlMaps] = await Promise.all([
    db.select().from(docTemplateSectionsTable).where(eq(docTemplateSectionsTable.templateId, id)).orderBy(asc(docTemplateSectionsTable.sectionOrder)),
    db.select().from(docTemplateRequirementsTable).where(eq(docTemplateRequirementsTable.templateId, id)).orderBy(asc(docTemplateRequirementsTable.sortOrder)),
    db.select().from(docTemplateRolesTable).where(eq(docTemplateRolesTable.templateId, id)).orderBy(asc(docTemplateRolesTable.sortOrder)),
    db.select().from(docTemplateProcedureStepsTable).where(eq(docTemplateProcedureStepsTable.templateId, id)).orderBy(asc(docTemplateProcedureStepsTable.sortOrder)),
    db.select().from(docTemplateRecordsTable).where(eq(docTemplateRecordsTable.templateId, id)).orderBy(asc(docTemplateRecordsTable.sortOrder)),
    db.select().from(docTemplateTablesTable).where(eq(docTemplateTablesTable.templateId, id)).orderBy(asc(docTemplateTablesTable.sortOrder)),
    db.select({
      id: docTemplateControlMapsTable.id,
      templateId: docTemplateControlMapsTable.templateId,
      controlId: docTemplateControlMapsTable.controlId,
      nistControlNumber: docTemplateControlMapsTable.nistControlNumber,
      supportType: docTemplateControlMapsTable.supportType,
      controlRef: controlsTable.controlId,
      controlTitle: controlsTable.title,
      domainId: controlsTable.domainId,
    })
      .from(docTemplateControlMapsTable)
      .leftJoin(controlsTable, eq(docTemplateControlMapsTable.controlId, controlsTable.id))
      .where(eq(docTemplateControlMapsTable.templateId, id))
      .orderBy(asc(docTemplateControlMapsTable.nistControlNumber)),
  ]);

  res.json({
    ...template,
    sections,
    requirements,
    roles,
    procedureSteps: steps,
    records,
    tables,
    controlMaps,
  });
});

// ── GET /api/doc-templates/placeholders ──────────────────────────────────────
router.get("/doc-templates/placeholders", requireAuth, async (_req, res) => {
  const placeholders = await db
    .select()
    .from(docTemplatePlaceholdersTable)
    .orderBy(asc(docTemplatePlaceholdersTable.placeholder));
  res.json(placeholders);
});

// ── GET /api/doc-templates/import-batches ────────────────────────────────────
router.get("/doc-templates/import-batches", requireAuth, requireAdmin, async (_req, res) => {
  const batches = await db
    .select()
    .from(docTemplateImportBatchesTable)
    .orderBy(desc(docTemplateImportBatchesTable.importedAt));
  res.json(batches);
});

// ── GET /api/doc-templates/families ──────────────────────────────────────────
router.get("/doc-templates/families", requireAuth, async (_req, res) => {
  const rows = await db
    .selectDistinct({ family: documentTemplatesTable.family })
    .from(documentTemplatesTable)
    .where(
      and(
        isNotNull(documentTemplatesTable.sourceTemplateId),
        isNotNull(documentTemplatesTable.family),
      )
    )
    .orderBy(asc(documentTemplatesTable.family));
  res.json(rows.map((r) => r.family).filter(Boolean));
});

// ── GET /api/doc-templates/artifact-types ────────────────────────────────────
router.get("/doc-templates/artifact-types", requireAuth, async (_req, res) => {
  const rows = await db
    .selectDistinct({ at: documentTemplatesTable.artifactTypeLabel })
    .from(documentTemplatesTable)
    .where(
      and(
        isNotNull(documentTemplatesTable.sourceTemplateId),
        isNotNull(documentTemplatesTable.artifactTypeLabel),
      )
    )
    .orderBy(asc(documentTemplatesTable.artifactTypeLabel));
  res.json(rows.map((r) => r.at).filter(Boolean));
});

// ── POST /api/admin/doc-templates/import ─────────────────────────────────────
// Admin: import a ZIP package (multipart or path)
router.post("/admin/doc-templates/import", requireAuth, requireAdmin, async (req, res): Promise<void> => {
  const workspaceRoot = process.env.REPL_HOME ?? "/home/runner/workspace";
  const zipPath = `${workspaceRoot}/attached_assets/CMMC_L2_Document_Library_1780837345246.zip`;
  const actorId = (req as any).authUser?.id ?? null;
  const actorName = (req as any).authUser?.name ?? "System";

  const fs = await import("fs");
  if (!fs.existsSync(zipPath)) {
    return void res.status(400).json({ error: `ZIP file not found at ${zipPath}` });
  }

  const zip = new AdmZip(zipPath);
  const jsonEntry = zip.getEntry("cmmc_l2_document_templates.json");
  if (!jsonEntry) return void res.status(400).json({ error: "cmmc_l2_document_templates.json not in ZIP" });

  const library = JSON.parse(jsonEntry.getData().toString("utf-8")) as any;
  const templates: any[] = library.templates ?? [];
  const log: string[] = [];
  let successCount = 0, skippedCount = 0, errorCount = 0;

  // Load controls for NIST ref mapping
  const allControls = await db
    .select({ id: controlsTable.id, controlId: controlsTable.controlId, nistRef: controlsTable.nistRef })
    .from(controlsTable);
  const nistToControls = new Map<string, { id: string; controlId: string }[]>();
  for (const c of allControls) {
    if (!c.nistRef) continue;
    const nr = c.nistRef.trim();
    if (!nistToControls.has(nr)) nistToControls.set(nr, []);
    nistToControls.get(nr)!.push({ id: c.id, controlId: c.controlId });
  }

  // Upsert placeholders
  for (const p of (library.placeholders ?? [])) {
    const existing = await db.select({ id: docTemplatePlaceholdersTable.id })
      .from(docTemplatePlaceholdersTable)
      .where(eq(docTemplatePlaceholdersTable.placeholder, p.placeholder)).limit(1);
    if (existing.length === 0) {
      await db.insert(docTemplatePlaceholdersTable).values({
        id: randomUUID(), placeholder: p.placeholder, description: p.description, required: false,
      });
    }
  }

  // Check already imported
  const existingSourceIds = await db
    .select({ sourceTemplateId: documentTemplatesTable.sourceTemplateId })
    .from(documentTemplatesTable)
    .where(inArray(documentTemplatesTable.sourceTemplateId, templates.map((t: any) => t.template_id)));
  const alreadyImported = new Set(existingSourceIds.map((r) => r.sourceTemplateId).filter(Boolean));

  const ARTIFACT_TYPE_MAP: Record<string, string> = {
    Policy: "policy", Procedure: "procedure", "Procedure/Checklist": "procedure",
    "Procedure/Matrix": "procedure", "Procedure/Register": "procedure", "Procedure/Tracker": "procedure",
    Standard: "other", "Standard/Inventory": "other", "Standard/Procedure": "other",
    Plan: "plan", "Log/Form": "log", "Form/Report": "form", "Matrix/Table": "form",
    "Register/Table": "register", Inventory: "system_inventory",
  };

  function mapReviewFreq(raw: string): string {
    const s = raw.toLowerCase();
    if (s.includes("month")) return "monthly";
    if (s.includes("quarter")) return "quarterly";
    if (s.includes("semi")) return "semi_annually";
    return "annually";
  }

  function extractPlaceholders(text: string): string[] {
    return [...new Set(text.match(/\{\{[A-Z_]+\}\}/g) ?? [])];
  }

  for (const t of templates) {
    if (alreadyImported.has(t.template_id)) { skippedCount++; continue; }
    try {
      const docType = ARTIFACT_TYPE_MAP[t.artifact_type] ?? "other";
      const mdEntry = zip.getEntries().find(
        (e: any) => e.entryName.startsWith("markdown_templates/") && e.entryName.includes(t.template_id)
      );
      const markdownBody = mdEntry ? mdEntry.getData().toString("utf-8") : "";
      const templateUUID = randomUUID();

      await db.insert(documentTemplatesTable).values({
        id: templateUUID, title: t.title, docType: docType as any,
        cmmcLevel: "L2", domainAbbr: t.template_id.split("-")[0], version: "1.0",
        ownerRole: "compliance_manager", reviewFrequency: mapReviewFreq(t.review_frequency) as any,
        description: t.purpose, bodyTemplate: markdownBody || t.purpose,
        requiredFields: [], placeholders: extractPlaceholders([t.purpose, t.scope, ...t.roles, ...t.requirements, ...t.procedure].join(" ")),
        linkedControlIds: [], requiresApproval: true, outputFormat: "rich_text",
        isActive: true, isSystemTemplate: true, sourceTemplateId: t.template_id,
        sourcePackage: "CMMC_L2_Document_Library", family: t.family,
        artifactTypeLabel: t.artifact_type, purpose: t.purpose, scope: t.scope,
      });

      if (markdownBody) {
        await db.insert(docTemplateSectionsTable).values({ id: randomUUID(), templateId: templateUUID, sectionName: "Full Template", sectionOrder: 0, content: markdownBody, contentType: "markdown" });
      }
      for (let i = 0; i < (t.roles ?? []).length; i++) await db.insert(docTemplateRolesTable).values({ id: randomUUID(), templateId: templateUUID, roleText: t.roles[i], sortOrder: i });
      for (let i = 0; i < (t.requirements ?? []).length; i++) await db.insert(docTemplateRequirementsTable).values({ id: randomUUID(), templateId: templateUUID, requirementText: t.requirements[i], sortOrder: i });
      for (let i = 0; i < (t.procedure ?? []).length; i++) await db.insert(docTemplateProcedureStepsTable).values({ id: randomUUID(), templateId: templateUUID, stepText: t.procedure[i], sortOrder: i });
      for (let i = 0; i < (t.records ?? []).length; i++) await db.insert(docTemplateRecordsTable).values({ id: randomUUID(), templateId: templateUUID, recordName: t.records[i], sortOrder: i });
      for (let i = 0; i < (t.tables ?? []).length; i++) await db.insert(docTemplateTablesTable).values({ id: randomUUID(), templateId: templateUUID, tableName: t.tables[i].name, columnsJson: t.tables[i].columns, sortOrder: i });

      for (const nistRef of (t.mapped_controls ?? [])) {
        const nr = nistRef.trim();
        const controls = nistToControls.get(nr) ?? [];
        if (controls.length === 0) {
          await db.insert(docTemplateControlMapsTable).values({ id: randomUUID(), templateId: templateUUID, controlId: null, nistControlNumber: nr, supportType: "primary", artifactType: t.artifact_type });
        } else {
          for (const ctrl of controls) {
            await db.insert(docTemplateControlMapsTable).values({ id: randomUUID(), templateId: templateUUID, controlId: ctrl.id, nistControlNumber: nr, supportType: "primary", artifactType: t.artifact_type });
          }
        }
      }

      log.push(`✓ ${t.template_id} — ${t.title}`);
      successCount++;
    } catch (err: any) {
      log.push(`✗ ${t.template_id} — ${err.message}`);
      errorCount++;
    }
  }

  const batchId = randomUUID();
  await db.insert(docTemplateImportBatchesTable).values({
    id: batchId, filename: "CMMC_L2_Document_Library.zip", importedBy: actorName,
    totalTemplates: templates.length, totalMappings: (library.control_mapping ?? []).length,
    successCount, errorCount, skippedCount,
    status: errorCount > 0 ? "partial" : "complete", importLog: log as any,
  });

  await db.insert(auditLogsTable).values({
    id: randomUUID(), organizationId: null, userId: actorId, userName: actorName,
    action: "create", entityType: "doc_template_import", entityId: batchId,
    entityLabel: `CMMC L2 Template Library Import — ${successCount} imported`,
    newValue: { successCount, skippedCount, errorCount } as any,
    timestamp: new Date(),
  });

  res.json({ batchId, totalTemplates: templates.length, successCount, skippedCount, errorCount, log });
});

// ── POST /api/doc-templates/generate ─────────────────────────────────────────
router.post("/doc-templates/generate", requireAuth, requireOrg, async (req, res): Promise<void> => {
  if (!canGenerateDocs(req)) return void res.status(403).json({ error: `Your current organization role does not have permission to generate documents. Required: Compliance Manager, Organization Admin, or Global Admin. Your current role: ${req.orgRole ?? req.authUser?.role ?? "unknown"}.` });

  const orgId = (req as any).orgId!;
  const actorId = (req as any).authUser?.id;
  const actorName = (req as any).authUser?.name ?? "System";

  const { templateId, title, placeholderValues, effectiveDateStr, reviewDateStr } = req.body as {
    templateId: string;
    title?: string;
    placeholderValues?: Record<string, string>;
    effectiveDateStr?: string;
    reviewDateStr?: string;
  };

  if (!templateId) return void res.status(400).json({ error: "templateId is required" });

  const [template] = await db.select().from(documentTemplatesTable).where(eq(documentTemplatesTable.id, templateId)).limit(1);
  if (!template) return void res.status(404).json({ error: "Template not found" });

  const [org] = await db.select().from(organizationsTable).where(eq(organizationsTable.id, orgId)).limit(1);
  if (!org) return void res.status(404).json({ error: "Organization not found" });

  // Load satellite data
  const [sections, requirements, roles, steps, records, tables, controlMaps] = await Promise.all([
    db.select().from(docTemplateSectionsTable).where(eq(docTemplateSectionsTable.templateId, templateId)).orderBy(asc(docTemplateSectionsTable.sectionOrder)),
    db.select().from(docTemplateRequirementsTable).where(eq(docTemplateRequirementsTable.templateId, templateId)).orderBy(asc(docTemplateRequirementsTable.sortOrder)),
    db.select().from(docTemplateRolesTable).where(eq(docTemplateRolesTable.templateId, templateId)).orderBy(asc(docTemplateRolesTable.sortOrder)),
    db.select().from(docTemplateProcedureStepsTable).where(eq(docTemplateProcedureStepsTable.templateId, templateId)).orderBy(asc(docTemplateProcedureStepsTable.sortOrder)),
    db.select().from(docTemplateRecordsTable).where(eq(docTemplateRecordsTable.templateId, templateId)).orderBy(asc(docTemplateRecordsTable.sortOrder)),
    db.select().from(docTemplateTablesTable).where(eq(docTemplateTablesTable.templateId, templateId)).orderBy(asc(docTemplateTablesTable.sortOrder)),
    db.select({ id: docTemplateControlMapsTable.id, controlId: docTemplateControlMapsTable.controlId, nistRef: docTemplateControlMapsTable.nistControlNumber })
      .from(docTemplateControlMapsTable).where(eq(docTemplateControlMapsTable.templateId, templateId)),
  ]);

  // Build default placeholder values from org
  const now = new Date();
  const effectiveDate = effectiveDateStr ? new Date(effectiveDateStr) : now;
  const reviewDate = reviewDateStr ? new Date(reviewDateStr) : new Date(now.getFullYear() + 1, now.getMonth(), now.getDate());
  const currentQuarter = `Q${Math.ceil((now.getMonth() + 1) / 3)} ${now.getFullYear()}`;

  const orgAny = org as any;
  const securityOfficer = orgAny.securityOfficer ?? "Information System Security Officer (ISSO)";
  const systemOwner = orgAny.systemOwner ?? "System Owner";
  const itAdmin = orgAny.itAdministrator ?? "IT Administrator";
  const classification = orgAny.defaultClassification ?? "Internal Use Only — CUI";
  const docPrefix = orgAny.documentNumberPrefix ?? (org.shortName ?? org.name.substring(0, 4).toUpperCase());

  const defaults: Record<string, string> = {
    // Organization identity
    "{{ORGANIZATION_NAME}}": org.name,
    "{{SYSTEM_NAME}}": orgAny.systemName ?? org.name,
    "{{CMMC_SCOPE_NAME}}": orgAny.assessmentScope ?? `${org.name} CUI Environment`,
    "{{ASSESSMENT_SCOPE}}": orgAny.assessmentScope ?? `${org.name} CUI Environment`,
    "{{CLASSIFICATION}}": classification,
    "{{DOCUMENT_NUMBER_PREFIX}}": docPrefix,
    // Responsible roles
    "{{DOCUMENT_OWNER}}": "Compliance Manager",
    "{{POLICY_OWNER}}": "Compliance Manager",
    "{{PROCEDURE_OWNER}}": "IT Administrator",
    "{{APPROVER_NAME}}": systemOwner,
    "{{APPROVER_TITLE}}": "System Owner",
    "{{SECURITY_OFFICER}}": securityOfficer,
    "{{SECURITY_OFFICER_TITLE}}": "Information System Security Officer (ISSO)",
    "{{SYSTEM_OWNER}}": systemOwner,
    "{{SYSTEM_OWNER_TITLE}}": "System Owner",
    "{{IT_ADMIN}}": itAdmin,
    "{{IT_ADMIN_TITLE}}": "IT Administrator",
    "{{IT_ADMINISTRATOR}}": itAdmin,
    "{{HR_OWNER_TITLE}}": "Human Resources Manager",
    "{{FACILITY_OWNER_TITLE}}": "Facility Manager",
    "{{REVIEWER_NAME}}": securityOfficer,
    "{{VERIFIER_NAME}}": itAdmin,
    "{{PERFORMED_BY}}": securityOfficer,
    // Dates
    "{{EFFECTIVE_DATE}}": effectiveDate.toLocaleDateString("en-US"),
    "{{REVIEW_DATE}}": reviewDate.toLocaleDateString("en-US"),
    "{{APPROVAL_DATE}}": effectiveDate.toLocaleDateString("en-US"),
    "{{VERIFICATION_DATE}}": now.toLocaleDateString("en-US"),
    "{{SCAN_DATE}}": now.toLocaleDateString("en-US"),
    "{{VERSION}}": "1.0",
    // Retention & periods
    "{{EVIDENCE_RETENTION_PERIOD}}": "3 years",
    "{{RECORD_RETENTION}}": "3 years",
    "{{TRAINING_RECORD_RETENTION}}": "3 years",
    "{{LOG_RETENTION_DAYS}}": "1095",
    "{{FULL_BACKUP_RETENTION}}": "90 days",
    "{{BACKUP_RETENTION}}": "90 days",
    // Frequencies
    "{{REMOTE_ACCESS_REVIEW_FREQUENCY}}": "Quarterly",
    "{{LOG_REVIEW_FREQUENCY}}": "Weekly",
    "{{VULN_SCAN_FREQUENCY}}": "Monthly",
    "{{REVIEW_PERIOD}}": currentQuarter,
    "{{SCAN_PERIOD}}": currentQuarter,
    "{{REVIEW_MONTH}}": now.toLocaleDateString("en-US", { month: "long", year: "numeric" }),
    "{{PERIOD_START}}": new Date(now.getFullYear(), 0, 1).toLocaleDateString("en-US"),
    "{{PERIOD_END}}": now.toLocaleDateString("en-US"),
    "{{ANNUAL_TRAINING_DEADLINE}}": "December 31",
    // Account & access control thresholds
    "{{INACTIVE_ACCOUNT_DAYS}}": "90",
    "{{LOCKOUT_ATTEMPTS}}": "5",
    "{{LOCKOUT_DURATION}}": "30 minutes",
    // Vulnerability management thresholds
    "{{CRITICAL_VULN_DAYS}}": "30",
    "{{CRITICAL_DAYS}}": "30",
    "{{HIGH_DAYS}}": "60",
    "{{MEDIUM_DAYS}}": "90",
    "{{LOW_DAYS}}": "180",
    // Incident response
    "{{INCIDENT_REPORT_HOURS}}": "72",
    "{{POST_INCIDENT_DAYS}}": "30",
    "{{POST_INCIDENT_REVIEW_DAYS}}": "30",
    "{{INCIDENT_CONTACT}}": orgAny.primaryContact ?? securityOfficer,
    // Training
    "{{TRAINING_SYSTEM}}": "[Training Management System]",
    // Tools & infrastructure
    "{{SCAN_TOOL}}": "[Vulnerability Scanner]",
    "{{SCAN_REVIEWER}}": securityOfficer,
    "{{BACKUP_LOCATION}}": "[Backup Storage Location]",
    "{{BACKUP_TIME}}": "02:00 AM UTC",
    "{{ALERT_CONTACT}}": orgAny.primaryContact ?? itAdmin,
    "{{SYSTEMS_REVIEWED}}": orgAny.systemName ?? org.name,
    // Review / audit report defaults
    "{{ANOMALIES_NOTED}}": "None",
    "{{INCIDENT_COUNT}}": "0",
    "{{RECOMMENDATIONS}}": "Continue existing controls",
    "{{TOTAL_ACCOUNTS}}": "[Number]",
    "{{ACCOUNTS_REMOVED}}": "0",
    "{{ACCOUNTS_MODIFIED}}": "0",
    "{{FINDINGS_AND_ACTIONS}}": "No findings requiring immediate action.",
    "{{FAILED_BACKUP_COUNT}}": "0",
    "{{FAILURE_RESOLUTION}}": "N/A",
    "{{RESTORED_ITEMS}}": "N/A",
    "{{RESTORE_NOTES}}": "N/A",
    "{{STORAGE_USED}}": "[Current storage used]",
    "{{STORAGE_REMAINING_DAYS}}": "[Estimated days remaining]",
    "{{NEW_FINDINGS}}": "0",
    "{{OVERDUE_ITEMS}}": "0",
  };

  const mergedValues = { ...defaults, ...(placeholderValues ?? {}) };

  // Render body by substituting placeholders in markdown
  const rawBody = sections[0]?.content ?? template.bodyTemplate ?? "";
  const body = applyPlaceholders(rawBody, mergedValues);

  // Generate document title
  const docTitle = title ?? `${template.title} — ${org.name}`;

  // Find unresolved placeholders
  const unresolvedMatches = body.match(/\{\{[A-Z_]+\}\}/g) ?? [];
  const unresolved = [...new Set(unresolvedMatches)];

  // Save to documents table
  const docId = randomUUID();
  await db.insert(documentsTable).values({
    id: docId,
    organizationId: orgId,
    templateId: template.id,
    title: docTitle,
    docType: template.docType,
    status: "draft",
    cmmcLevel: template.cmmcLevel,
    version: "1.0",
    body,
    fieldValues: mergedValues as any,
    organizationName: org.name,
    systemName: mergedValues["{{SYSTEM_NAME}}"],
    effectiveDate,
    nextReviewDate: reviewDate,
    ownerId: actorId,
    reviewFrequency: template.reviewFrequency,
    requiresApproval: true,
    isCurrentVersion: true,
    tags: [template.family ?? "", template.artifactTypeLabel ?? ""].filter(Boolean),
    createdAt: now,
    updatedAt: now,
  });

  // Link controls
  const controlIds = [...new Set(controlMaps.map((m) => m.controlId).filter(Boolean))] as string[];
  for (const cid of controlIds) {
    await db.insert(documentControlMapsTable).values({ id: randomUUID(), documentId: docId, controlId: cid });
  }

  // Map doc type → evidence type
  const docTypeToEvidenceType = (dt: string): string => {
    const map: Record<string, string> = {
      policy: "policy",
      procedure: "procedure",
      log: "log",
      report: "report",
      assessment: "report",
    };
    return map[dt] ?? "other";
  };

  // Create a matching evidence item so the document appears in Evidence Repository
  const evidenceId = randomUUID();
  await db.insert(evidenceItemsTable).values({
    id: evidenceId,
    organizationId: orgId,
    title: docTitle,
    description: `Generated from template: ${template.title} (${template.sourceTemplateId ?? template.id})`,
    evidenceType: docTypeToEvidenceType(template.docType) as any,
    status: "draft",
    fileKey: null as any,
    fileName: null as any,
    version: "1.0",
    tags: [template.family ?? "", template.artifactTypeLabel ?? ""].filter(Boolean),
    sourceSystem: "document_generator",
    confidentialityLevel: classification,
    ownerId: actorId,
    collectedAt: now,
    reviewDueDate: reviewDate,
    internalNotes: docId,
    isCurrentVersion: true,
    createdAt: now,
    updatedAt: now,
  });

  // Link evidence to same controls
  for (const cid of controlIds) {
    await db.insert(evidenceControlLinksTable).values({ id: randomUUID(), evidenceId, controlId: cid });
  }

  // Link document → evidence via join table
  await db.insert(documentEvidenceMapsTable).values({ id: randomUUID(), documentId: docId, evidenceId });

  // Audit log
  await db.insert(auditLogsTable).values({
    id: randomUUID(), organizationId: orgId, userId: actorId, userName: actorName,
    action: "create", entityType: "document", entityId: docId,
    entityLabel: docTitle, newValue: { templateId: template.sourceTemplateId, status: "draft" } as any,
    timestamp: now,
  });

  res.json({
    documentId: docId,
    evidenceId,
    title: docTitle,
    status: "draft",
    templateId,
    templateSourceId: template.sourceTemplateId,
    unresolved,
    controlCount: controlIds.length,
  });
});

// ── GET /api/doc-templates/generated/:docId/docx ─────────────────────────────
router.get("/doc-templates/generated/:docId/docx", requireAuth, requireOrg, async (req, res): Promise<void> => {
  const orgId = (req as any).orgId!;
  const [doc] = await db.select().from(documentsTable)
    .where(and(eq(documentsTable.id, req.params.docId as string), eq(documentsTable.organizationId, orgId))).limit(1);
  if (!doc) return void res.status(404).json({ error: "Document not found" });

  const [template] = doc.templateId
    ? await db.select().from(documentTemplatesTable).where(eq(documentTemplatesTable.id, doc.templateId)).limit(1)
    : [null];

  // Load satellite data for the template
  let requirements: any[] = [], roles: any[] = [], steps: any[] = [], records: any[] = [], tables: any[] = [], controlMaps: any[] = [];
  if (doc.templateId) {
    [requirements, roles, steps, records, tables, controlMaps] = await Promise.all([
      db.select().from(docTemplateRequirementsTable).where(eq(docTemplateRequirementsTable.templateId, doc.templateId)).orderBy(asc(docTemplateRequirementsTable.sortOrder)),
      db.select().from(docTemplateRolesTable).where(eq(docTemplateRolesTable.templateId, doc.templateId)).orderBy(asc(docTemplateRolesTable.sortOrder)),
      db.select().from(docTemplateProcedureStepsTable).where(eq(docTemplateProcedureStepsTable.templateId, doc.templateId)).orderBy(asc(docTemplateProcedureStepsTable.sortOrder)),
      db.select().from(docTemplateRecordsTable).where(eq(docTemplateRecordsTable.templateId, doc.templateId)).orderBy(asc(docTemplateRecordsTable.sortOrder)),
      db.select().from(docTemplateTablesTable).where(eq(docTemplateTablesTable.templateId, doc.templateId)).orderBy(asc(docTemplateTablesTable.sortOrder)),
      db.select({ nistRef: docTemplateControlMapsTable.nistControlNumber, controlRef: controlsTable.controlId, controlTitle: controlsTable.title })
        .from(docTemplateControlMapsTable)
        .leftJoin(controlsTable, eq(docTemplateControlMapsTable.controlId, controlsTable.id))
        .where(eq(docTemplateControlMapsTable.templateId, doc.templateId)),
    ]);
  }

  const fieldValues = (doc.fieldValues as Record<string, string>) ?? {};
  const effectiveDateStr = doc.effectiveDate ? new Date(doc.effectiveDate).toLocaleDateString("en-US") : "—";
  const reviewDateStr = doc.nextReviewDate ? new Date(doc.nextReviewDate).toLocaleDateString("en-US") : "—";
  const orgName = doc.organizationName ?? "Organization";
  const systemName = doc.systemName ?? fieldValues["{{SYSTEM_NAME}}"] ?? "CUI System";

  // Build DOCX children
  const children: any[] = [];

  // Cover block
  children.push(
    new Paragraph({ text: "Control HUB — CMMC Compliance Platform", style: "Intense Quote", alignment: AlignmentType.CENTER }),
    new Paragraph({ text: doc.title, heading: HeadingLevel.TITLE, alignment: AlignmentType.CENTER }),
    new Paragraph({ text: "", spacing: { after: 200 } }),
    ...metaTable([
      ["Organization", orgName],
      ["System / Scope", systemName],
      ["Template ID", template?.sourceTemplateId ?? "—"],
      ["Version", doc.version ?? "1.0"],
      ["Status", doc.status.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())],
      ["Effective Date", effectiveDateStr],
      ["Next Review Date", reviewDateStr],
      ["Classification", fieldValues["{{CLASSIFICATION}}"] ?? "Internal Use Only"],
    ]),
    new Paragraph({ text: "", spacing: { after: 400 } }),
  );

  // Purpose
  if (template?.purpose) {
    children.push(
      new Paragraph({ text: "1. Purpose", heading: HeadingLevel.HEADING_1 }),
      new Paragraph({ text: applyPlaceholders(template.purpose, fieldValues) }),
      new Paragraph({ text: "", spacing: { after: 200 } }),
    );
  }

  // Scope
  if (template?.scope) {
    children.push(
      new Paragraph({ text: "2. Scope", heading: HeadingLevel.HEADING_1 }),
      new Paragraph({ text: applyPlaceholders(template.scope, fieldValues) }),
      new Paragraph({ text: "", spacing: { after: 200 } }),
    );
  }

  // Roles
  if (roles.length > 0) {
    children.push(new Paragraph({ text: "3. Roles and Responsibilities", heading: HeadingLevel.HEADING_1 }));
    for (const r of roles) {
      children.push(new Paragraph({ text: applyPlaceholders(r.roleText, fieldValues), bullet: { level: 0 } }));
    }
    children.push(new Paragraph({ text: "", spacing: { after: 200 } }));
  }

  // Requirements
  if (requirements.length > 0) {
    children.push(new Paragraph({ text: "4. Requirements", heading: HeadingLevel.HEADING_1 }));
    for (const r of requirements) {
      children.push(new Paragraph({ text: applyPlaceholders(r.requirementText, fieldValues), bullet: { level: 0 } }));
    }
    children.push(new Paragraph({ text: "", spacing: { after: 200 } }));
  }

  // Procedure steps
  if (steps.length > 0) {
    children.push(new Paragraph({ text: "5. Procedure", heading: HeadingLevel.HEADING_1 }));
    for (let i = 0; i < steps.length; i++) {
      children.push(new Paragraph({ text: `${i + 1}. ${applyPlaceholders(steps[i].stepText, fieldValues)}`, numbering: undefined }));
    }
    children.push(new Paragraph({ text: "", spacing: { after: 200 } }));
  }

  // Records
  if (records.length > 0) {
    children.push(new Paragraph({ text: "6. Required Records and Evidence", heading: HeadingLevel.HEADING_1 }));
    for (const r of records) {
      children.push(new Paragraph({ text: r.recordName, bullet: { level: 0 } }));
    }
    children.push(new Paragraph({ text: "", spacing: { after: 200 } }));
  }

  // Tables
  for (const tbl of tables) {
    const cols = (tbl.columnsJson as string[]) ?? [];
    if (cols.length === 0) continue;
    children.push(new Paragraph({ text: tbl.tableName, heading: HeadingLevel.HEADING_2 }));
    children.push(
      new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        rows: [
          new TableRow({
            tableHeader: true,
            children: cols.map((col: string) =>
              new TableCell({
                children: [new Paragraph({ children: [new TextRun({ text: col, bold: true })] })],
                shading: { fill: "1a3a5c" },
              })
            ),
          }),
          new TableRow({
            children: cols.map(() => new TableCell({ children: [new Paragraph({ text: "" })] })),
          }),
        ],
      })
    );
    children.push(new Paragraph({ text: "", spacing: { after: 200 } }));
  }

  // Control mapping
  const uniqueControls = controlMaps.filter((m) => m.controlRef);
  if (uniqueControls.length > 0) {
    children.push(
      new Paragraph({ text: "7. CMMC Control Mapping", heading: HeadingLevel.HEADING_1 }),
      new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        rows: [
          new TableRow({
            tableHeader: true,
            children: [
              new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: "Control ID", bold: true })] })] }),
              new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: "NIST Ref", bold: true })] })] }),
              new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: "Title", bold: true })] })] }),
            ],
          }),
          ...uniqueControls.map((m) =>
            new TableRow({
              children: [
                new TableCell({ children: [new Paragraph({ text: m.controlRef ?? "" })] }),
                new TableCell({ children: [new Paragraph({ text: m.nistRef ?? "" })] }),
                new TableCell({ children: [new Paragraph({ text: m.controlTitle ?? "" })] }),
              ],
            })
          ),
        ],
      })
    );
  }

  // Approval block
  children.push(
    new Paragraph({ text: "", spacing: { after: 400 } }),
    new Paragraph({ text: "8. Review and Approval", heading: HeadingLevel.HEADING_1 }),
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: [
        new TableRow({
          tableHeader: true,
          children: ["Name", "Title", "Signature", "Date"].map((h) =>
            new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: h, bold: true })] })] })
          ),
        }),
        new TableRow({
          children: [
            new TableCell({ children: [new Paragraph({ text: fieldValues["{{APPROVER_NAME}}"] ?? "" })] }),
            new TableCell({ children: [new Paragraph({ text: fieldValues["{{APPROVER_TITLE}}"] ?? "" })] }),
            new TableCell({ children: [new Paragraph({ text: "" })] }),
            new TableCell({ children: [new Paragraph({ text: "" })] }),
          ],
        }),
      ],
    }),
  );

  const docxDoc = new Document({
    title: doc.title,
    description: template?.purpose ?? "",
    styles: {
      default: {
        document: { run: { font: "Calibri", size: 22 } },
        heading1: { run: { bold: true, size: 26, color: "1a3a5c" } },
        heading2: { run: { bold: true, size: 24, color: "1a3a5c" } },
      },
    },
    sections: [{
      properties: {},
      headers: {
        default: new Header({
          children: [new Paragraph({
            children: [
              new TextRun({ text: "Control HUB  |  ", bold: true, color: "1a3a5c" }),
              new TextRun({ text: orgName + "  |  ", color: "555555" }),
              new TextRun({ text: doc.title, italics: true, color: "555555" }),
            ],
            border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: "1a3a5c" } },
          })],
        }),
      },
      footers: {
        default: new Footer({
          children: [new Paragraph({
            children: [
              new TextRun({ text: orgName + "  —  Confidential / Internal Use  —  Page ", color: "666666" }),
              new TextRun({ children: [PageNumber.CURRENT], color: "666666" }),
              new TextRun({ text: " of ", color: "666666" }),
              new TextRun({ children: [PageNumber.TOTAL_PAGES], color: "666666" }),
              new TextRun({ text: "  —  Generated by Control HUB", color: "666666" }),
            ],
            border: { top: { style: BorderStyle.SINGLE, size: 6, color: "1a3a5c" } },
          })],
        }),
      },
      children,
    }],
  });

  const buffer = await Packer.toBuffer(docxDoc);
  const filename = `${(template?.sourceTemplateId ?? "document").replace(/[^a-zA-Z0-9-]/g, "_")}_${orgName.replace(/[^a-zA-Z0-9]/g, "_")}.docx`;

  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  res.send(buffer);

  // Audit log
  await db.insert(auditLogsTable).values({
    id: randomUUID(), organizationId: orgId, userId: (req as any).authUser?.id, userName: (req as any).authUser?.name ?? "System",
    action: "exported", entityType: "document", entityId: doc.id, entityLabel: doc.title,
    newValue: { format: "docx" } as any, timestamp: new Date(),
  });
});

// ── GET /api/doc-templates/generated/:docId/pdf ──────────────────────────────
router.get("/doc-templates/generated/:docId/pdf", requireAuth, requireOrg, async (req, res): Promise<void> => {
  const orgId = (req as any).orgId!;
  const [doc] = await db.select().from(documentsTable)
    .where(and(eq(documentsTable.id, req.params.docId as string), eq(documentsTable.organizationId, orgId))).limit(1);
  if (!doc) return void res.status(404).json({ error: "Document not found" });

  const [template] = doc.templateId
    ? await db.select().from(documentTemplatesTable).where(eq(documentTemplatesTable.id, doc.templateId)).limit(1)
    : [null];

  let requirements: any[] = [], roles: any[] = [], steps: any[] = [], records: any[] = [], controlMaps: any[] = [];
  if (doc.templateId) {
    [requirements, roles, steps, records, controlMaps] = await Promise.all([
      db.select().from(docTemplateRequirementsTable).where(eq(docTemplateRequirementsTable.templateId, doc.templateId)).orderBy(asc(docTemplateRequirementsTable.sortOrder)),
      db.select().from(docTemplateRolesTable).where(eq(docTemplateRolesTable.templateId, doc.templateId)).orderBy(asc(docTemplateRolesTable.sortOrder)),
      db.select().from(docTemplateProcedureStepsTable).where(eq(docTemplateProcedureStepsTable.templateId, doc.templateId)).orderBy(asc(docTemplateProcedureStepsTable.sortOrder)),
      db.select().from(docTemplateRecordsTable).where(eq(docTemplateRecordsTable.templateId, doc.templateId)).orderBy(asc(docTemplateRecordsTable.sortOrder)),
      db.select({ nistRef: docTemplateControlMapsTable.nistControlNumber, controlRef: controlsTable.controlId, controlTitle: controlsTable.title })
        .from(docTemplateControlMapsTable)
        .leftJoin(controlsTable, eq(docTemplateControlMapsTable.controlId, controlsTable.id))
        .where(eq(docTemplateControlMapsTable.templateId, doc.templateId)),
    ]);
  }

  const fieldValues = (doc.fieldValues as Record<string, string>) ?? {};
  const orgName = doc.organizationName ?? "Organization";

  const pdf = new PDFDocument({ size: "LETTER", margins: { top: 72, bottom: 72, left: 72, right: 72 }, info: { Title: doc.title, Author: "Control HUB" } });

  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="${doc.title.replace(/[^a-zA-Z0-9]/g, "_")}.pdf"`);
  pdf.pipe(res);

  const H1_SIZE = 14, BODY_SIZE = 10, SMALL_SIZE = 8;
  const BLUE = "#1a3a5c";
  const GREY = "#555555";

  function pdfH1(text: string) {
    pdf.moveDown(0.5).font("Helvetica-Bold").fontSize(H1_SIZE).fillColor(BLUE).text(text).moveDown(0.3);
    pdf.font("Helvetica").fontSize(BODY_SIZE).fillColor("#000000");
  }
  function pdfBody(text: string) {
    pdf.font("Helvetica").fontSize(BODY_SIZE).fillColor("#000000").text(applyPlaceholders(text, fieldValues), { lineGap: 2 });
  }
  function pdfBullet(text: string) {
    pdf.font("Helvetica").fontSize(BODY_SIZE).fillColor("#000000").text(`• ${applyPlaceholders(text, fieldValues)}`, { indent: 20, lineGap: 2 });
  }

  // Header line
  pdf.font("Helvetica-Bold").fontSize(9).fillColor(BLUE).text("Control HUB  —  CMMC Compliance Platform", { align: "center" });
  pdf.moveTo(72, pdf.y + 4).lineTo(540, pdf.y + 4).stroke(BLUE);
  pdf.moveDown(1);

  // Title
  pdf.font("Helvetica-Bold").fontSize(18).fillColor(BLUE).text(doc.title, { align: "center" });
  pdf.moveDown(0.5);

  // Meta
  const meta = [
    ["Organization", orgName],
    ["Template ID", template?.sourceTemplateId ?? "—"],
    ["Version", doc.version ?? "1.0"],
    ["Effective Date", doc.effectiveDate ? new Date(doc.effectiveDate).toLocaleDateString("en-US") : "—"],
    ["Next Review", doc.nextReviewDate ? new Date(doc.nextReviewDate).toLocaleDateString("en-US") : "—"],
    ["Classification", fieldValues["{{CLASSIFICATION}}"] ?? "Internal Use Only"],
    ["Status", doc.status.replace(/_/g, " ").replace(/\b\w/g, (c: string) => c.toUpperCase())],
  ];
  for (const [k, v] of meta) {
    pdf.font("Helvetica-Bold").fontSize(BODY_SIZE).fillColor(GREY).text(`${k}: `, { continued: true });
    pdf.font("Helvetica").fillColor("#000000").text(v as string);
  }
  pdf.moveDown(1);
  pdf.moveTo(72, pdf.y).lineTo(540, pdf.y).stroke(BLUE).moveDown(0.5);

  if (template?.purpose) { pdfH1("1. Purpose"); pdfBody(template.purpose); }
  if (template?.scope) { pdfH1("2. Scope"); pdfBody(template.scope); }
  if (roles.length) { pdfH1("3. Roles and Responsibilities"); roles.forEach((r: any) => pdfBullet(r.roleText)); }
  if (requirements.length) { pdfH1("4. Requirements"); requirements.forEach((r: any) => pdfBullet(r.requirementText)); }
  if (steps.length) {
    pdfH1("5. Procedure");
    steps.forEach((s: any, i: number) => pdfBody(`${i + 1}. ${s.stepText}`));
  }
  if (records.length) { pdfH1("6. Required Records"); records.forEach((r: any) => pdfBullet(r.recordName)); }

  const uniqueControls = controlMaps.filter((m) => m.controlRef);
  if (uniqueControls.length) {
    pdfH1("7. CMMC Control Mapping");
    const colW = [100, 70, 280];
    const rowH = 18;
    let cx = 72, cy = pdf.y;
    pdf.font("Helvetica-Bold").fontSize(SMALL_SIZE).fillColor("white");
    pdf.rect(cx, cy, 450, rowH).fill(BLUE);
    pdf.fillColor("white").text("Control ID", cx + 4, cy + 5, { width: colW[0] });
    pdf.text("NIST Ref", cx + colW[0] + 4, cy + 5, { width: colW[1] });
    pdf.text("Title", cx + colW[0] + colW[1] + 4, cy + 5, { width: colW[2] });
    cy += rowH;
    pdf.font("Helvetica").fontSize(SMALL_SIZE).fillColor("#000000");
    for (const m of uniqueControls.slice(0, 40)) {
      if (cy > 700) { pdf.addPage(); cy = 72; }
      pdf.rect(cx, cy, 450, rowH).stroke("#cccccc");
      pdf.text(m.controlRef ?? "", cx + 4, cy + 5, { width: colW[0] });
      pdf.text(m.nistRef ?? "", cx + colW[0] + 4, cy + 5, { width: colW[1] });
      pdf.text(m.controlTitle ?? "", cx + colW[0] + colW[1] + 4, cy + 5, { width: colW[2] });
      cy += rowH;
    }
    pdf.y = cy + 10;
    pdf.moveDown(0.5);
  }

  // Footer on each page
  const pageCount = (pdf as any)._pageBuffer?.length ?? 1;
  pdf.font("Helvetica").fontSize(SMALL_SIZE).fillColor(GREY);
  pdf.text(`${orgName}  —  Confidential / Internal Use  —  Generated by Control HUB`, 72, 750, { align: "center", width: 468 });

  pdf.end();
});

// ── GET /api/doc-templates/resolver ──────────────────────────────────────────
// Returns only templates applicable to the org's active compliance packages.
router.get("/doc-templates/resolver", requireAuth, requireOrg, async (req, res): Promise<void> => {
  const orgId = (req as any).orgId!;
  try {
    const result = await resolveAvailableDocumentationTemplates(orgId);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/doc-templates/packages ──────────────────────────────────────────
// Admin: returns all doc_template_packages rows for review.
router.get("/doc-templates/packages", requireAuth, requireAdmin, async (req, res): Promise<void> => {
  const { templateId, packageKey } = req.query as Record<string, string>;

  let rows = await db
    .select({
      id: docTemplatePackagesTable.id,
      templateId: docTemplatePackagesTable.templateId,
      packageKey: docTemplatePackagesTable.packageKey,
      applicability: docTemplatePackagesTable.applicability,
      informationType: docTemplatePackagesTable.informationType,
      createdAt: docTemplatePackagesTable.createdAt,
      templateTitle: documentTemplatesTable.title,
      templateSourceId: documentTemplatesTable.sourceTemplateId,
    })
    .from(docTemplatePackagesTable)
    .innerJoin(documentTemplatesTable, eq(docTemplatePackagesTable.templateId, documentTemplatesTable.id))
    .where(
      and(
        templateId ? eq(docTemplatePackagesTable.templateId, templateId) : undefined,
        packageKey ? eq(docTemplatePackagesTable.packageKey, packageKey) : undefined,
      )
    )
    .orderBy(asc(documentTemplatesTable.title), asc(docTemplatePackagesTable.packageKey));

  res.json(rows);
});

// ── GET /api/doc-templates/placeholder-manifest/:id ──────────────────────────
// Returns placeholder manifest for a specific template.
router.get("/doc-templates/placeholder-manifest/:id", requireAuth, async (req, res): Promise<void> => {
  const { id } = req.params as Record<string, string>;

  const manifest = await db
    .select()
    .from(docTemplatePlaceholderManifestTable)
    .where(eq(docTemplatePlaceholderManifestTable.templateId, id))
    .orderBy(asc(docTemplatePlaceholderManifestTable.sortOrder));

  res.json(manifest);
});

// ── GET /api/doc-templates/control-requirements/:controlId ───────────────────
router.get("/doc-templates/control-requirements/:controlId", requireAuth, requireOrg, async (req, res): Promise<void> => {
  const orgId = (req as any).orgId!;
  const { controlId } = req.params as Record<string, string>;

  // Find control
  const [control] = await db.select().from(controlsTable).where(eq(controlsTable.id, controlId)).limit(1);
  if (!control) return void res.status(404).json({ error: "Control not found" });

  // Get required templates for this control
  const templateMaps = await db
    .select({
      templateId: docTemplateControlMapsTable.templateId,
      nistRef: docTemplateControlMapsTable.nistControlNumber,
      artifactType: docTemplateControlMapsTable.artifactType,
      title: documentTemplatesTable.title,
      sourceTemplateId: documentTemplatesTable.sourceTemplateId,
      artifactTypeLabel: documentTemplatesTable.artifactTypeLabel,
      family: documentTemplatesTable.family,
      isActive: documentTemplatesTable.isActive,
    })
    .from(docTemplateControlMapsTable)
    .innerJoin(documentTemplatesTable, eq(docTemplateControlMapsTable.templateId, documentTemplatesTable.id))
    .where(and(
      eq(docTemplateControlMapsTable.controlId, controlId),
      eq(documentTemplatesTable.isActive, true),
    ));

  // Get generated documents for this control in this org
  const docMaps = await db
    .select({
      docId: documentControlMapsTable.documentId,
      title: documentsTable.title,
      status: documentsTable.status,
      docType: documentsTable.docType,
      effectiveDate: documentsTable.effectiveDate,
      nextReviewDate: documentsTable.nextReviewDate,
      templateId: documentsTable.templateId,
      version: documentsTable.version,
    })
    .from(documentControlMapsTable)
    .innerJoin(documentsTable, eq(documentControlMapsTable.documentId, documentsTable.id))
    .where(and(
      eq(documentControlMapsTable.controlId, controlId),
      eq(documentsTable.organizationId, orgId),
    ));

  res.json({
    control: { id: control.id, controlId: control.controlId, title: control.title, nistRef: control.nistRef },
    requiredTemplates: templateMaps,
    generatedDocuments: docMaps,
  });
});

// ── Helpers ───────────────────────────────────────────────────────────────────
function applyPlaceholders(text: string, values: Record<string, string>): string {
  let result = text;
  for (const [key, val] of Object.entries(values)) {
    result = result.replaceAll(key, val);
  }
  return result;
}

function metaTable(rows: [string, string][]): any[] {
  return [
    new Table({
      width: { size: 60, type: WidthType.PERCENTAGE },
      borders: {
        top: { style: BorderStyle.NONE }, bottom: { style: BorderStyle.NONE },
        left: { style: BorderStyle.NONE }, right: { style: BorderStyle.NONE },
        insideHorizontal: { style: BorderStyle.NONE }, insideVertical: { style: BorderStyle.NONE },
      },
      rows: rows.map(([k, v]) =>
        new TableRow({
          children: [
            new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: k + ":", bold: true, color: "1a3a5c" })] })], width: { size: 25, type: WidthType.PERCENTAGE } }),
            new TableCell({ children: [new Paragraph({ text: v })] }),
          ],
        })
      ),
    }),
  ];
}

export default router;
