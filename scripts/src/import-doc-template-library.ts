/**
 * Import CMMC L2 Document Template Library from ZIP.
 * Idempotent — skips templates already imported (matched by source_template_id).
 * Usage: pnpm --filter @workspace/scripts run import-doc-templates -- path/to/CMMC_L2_Document_Library.zip
 */
import { db } from "@workspace/db";
import {
  documentTemplatesTable,
  docTemplateSectionsTable,
  docTemplateRequirementsTable,
  docTemplateRolesTable,
  docTemplateProcedureStepsTable,
  docTemplateRecordsTable,
  docTemplateTablesTable,
  docTemplatePlaceholdersTable,
  docTemplateControlMapsTable,
  docTemplateImportBatchesTable,
  controlsTable,
} from "@workspace/db";
import { eq, inArray } from "drizzle-orm";
import { randomUUID } from "crypto";
import AdmZip from "adm-zip";
import * as fs from "fs";

// ── Artifact type → doc_type enum mapping ─────────────────────────────────────
const ARTIFACT_TYPE_MAP: Record<string, string> = {
  Policy: "policy",
  Procedure: "procedure",
  "Procedure/Checklist": "procedure",
  "Procedure/Matrix": "procedure",
  "Procedure/Register": "procedure",
  "Procedure/Tracker": "procedure",
  Standard: "other",
  "Standard/Inventory": "other",
  "Standard/Procedure": "other",
  Plan: "plan",
  "Log/Form": "log",
  "Form/Report": "form",
  "Matrix/Table": "form",
  "Register/Table": "register",
  Inventory: "system_inventory",
};

// ── Review frequency → enum mapping ──────────────────────────────────────────
function mapReviewFreq(raw: string): string {
  const s = raw.toLowerCase();
  if (s.includes("month")) return "monthly";
  if (s.includes("quarter")) return "quarterly";
  if (s.includes("semi")) return "semi_annually";
  if (s.includes("annual") || s.includes("yearly") || s.includes("year")) return "annually";
  return "annually";
}

// ── Normalize NIST ref ────────────────────────────────────────────────────────
function normalizeNist(raw: string): string {
  return raw.trim().replace(/^3\./, "3.");
}

interface TemplateJson {
  template_id: string;
  title: string;
  artifact_type: string;
  mapped_controls: string[];
  family: string;
  purpose: string;
  scope: string;
  roles: string[];
  requirements: string[];
  procedure: string[];
  records: string[];
  tables: { name: string; columns: string[] }[];
  review_frequency: string;
  implementation_notes: string[];
}

interface LibraryJson {
  library_name: string;
  placeholders: { placeholder: string; description: string }[];
  templates: TemplateJson[];
  control_mapping: {
    control_id: string;
    family: string;
    requirement: string;
    template_ids: string[];
  }[];
}

async function main() {
  const zipPath = process.argv[2] || "attached_assets/CMMC_L2_Document_Library_1780837345246.zip";

  if (!fs.existsSync(zipPath)) {
    console.error(`ZIP not found: ${zipPath}`);
    process.exit(1);
  }

  console.log(`Reading ZIP: ${zipPath}`);
  const zip = new AdmZip(zipPath);

  // Parse JSON
  const jsonEntry = zip.getEntry("cmmc_l2_document_templates.json");
  if (!jsonEntry) throw new Error("cmmc_l2_document_templates.json not found in ZIP");
  const library: LibraryJson = JSON.parse(jsonEntry.getData().toString("utf-8"));

  const log: string[] = [];
  let successCount = 0;
  let skippedCount = 0;
  let errorCount = 0;

  // ── Load all controls for NIST ref → UUID mapping ──────────────────────────
  const allControls = await db
    .select({ id: controlsTable.id, controlId: controlsTable.controlId, nistRef: controlsTable.nistRef })
    .from(controlsTable);

  // nist_ref (e.g. "3.1.1") → control UUID(s)
  const nistToControls = new Map<string, { id: string; controlId: string }[]>();
  for (const c of allControls) {
    if (!c.nistRef) continue;
    const nr = normalizeNist(c.nistRef);
    if (!nistToControls.has(nr)) nistToControls.set(nr, []);
    nistToControls.get(nr)!.push({ id: c.id, controlId: c.controlId });
  }

  // ── Upsert global placeholders ─────────────────────────────────────────────
  for (const p of library.placeholders) {
    const existing = await db
      .select({ id: docTemplatePlaceholdersTable.id })
      .from(docTemplatePlaceholdersTable)
      .where(eq(docTemplatePlaceholdersTable.placeholder, p.placeholder))
      .limit(1);

    if (existing.length === 0) {
      await db.insert(docTemplatePlaceholdersTable).values({
        id: randomUUID(),
        placeholder: p.placeholder,
        description: p.description,
        required: false,
      });
    }
  }
  log.push(`Upserted ${library.placeholders.length} placeholders`);

  // ── Check already-imported templates ──────────────────────────────────────
  const existingSourceIds = await db
    .select({ sourceTemplateId: documentTemplatesTable.sourceTemplateId })
    .from(documentTemplatesTable)
    .where(
      inArray(
        documentTemplatesTable.sourceTemplateId,
        library.templates.map((t) => t.template_id)
      )
    );
  const alreadyImported = new Set(existingSourceIds.map((r) => r.sourceTemplateId).filter(Boolean));
  log.push(`Already imported: ${alreadyImported.size} templates (will skip)`);

  // ── Import each template ───────────────────────────────────────────────────
  for (const t of library.templates) {
    if (alreadyImported.has(t.template_id)) {
      skippedCount++;
      continue;
    }

    try {
      const docType = ARTIFACT_TYPE_MAP[t.artifact_type] ?? "other";
      const reviewFreq = mapReviewFreq(t.review_frequency);

      // Read markdown body if available
      const mdFilename = `markdown_templates/${t.template_id}_${t.title.replace(/[^a-zA-Z0-9]/g, "_")}.md`;
      const mdEntry = zip.getEntries().find(
        (e) => e.entryName.startsWith("markdown_templates/") &&
          e.entryName.includes(t.template_id)
      );
      const markdownBody = mdEntry ? mdEntry.getData().toString("utf-8") : "";

      // Insert into document_templates
      const templateUUID = randomUUID();
      await db.insert(documentTemplatesTable).values({
        id: templateUUID,
        title: t.title,
        docType: docType as any,
        cmmcLevel: "L2",
        domainAbbr: t.template_id.split("-")[0],
        version: "1.0",
        ownerRole: "compliance_manager",
        reviewFrequency: reviewFreq as any,
        description: t.purpose,
        bodyTemplate: markdownBody || t.purpose,
        requiredFields: [],
        placeholders: extractPlaceholders(
          [t.purpose, t.scope, ...t.roles, ...t.requirements, ...t.procedure].join(" ")
        ),
        linkedControlIds: [],
        requiresApproval: true,
        outputFormat: "rich_text",
        isActive: true,
        isSystemTemplate: true,
        sourceTemplateId: t.template_id,
        sourcePackage: "CMMC_L2_Document_Library",
        family: t.family,
        artifactTypeLabel: t.artifact_type,
        purpose: t.purpose,
        scope: t.scope,
      });

      // Insert markdown section
      if (markdownBody) {
        await db.insert(docTemplateSectionsTable).values({
          id: randomUUID(),
          templateId: templateUUID,
          sectionName: "Full Template",
          sectionOrder: 0,
          content: markdownBody,
          contentType: "markdown",
        });
      }

      // Insert roles
      for (let i = 0; i < t.roles.length; i++) {
        await db.insert(docTemplateRolesTable).values({
          id: randomUUID(),
          templateId: templateUUID,
          roleText: t.roles[i],
          sortOrder: i,
        });
      }

      // Insert requirements
      for (let i = 0; i < t.requirements.length; i++) {
        await db.insert(docTemplateRequirementsTable).values({
          id: randomUUID(),
          templateId: templateUUID,
          requirementText: t.requirements[i],
          sortOrder: i,
        });
      }

      // Insert procedure steps
      for (let i = 0; i < t.procedure.length; i++) {
        await db.insert(docTemplateProcedureStepsTable).values({
          id: randomUUID(),
          templateId: templateUUID,
          stepText: t.procedure[i],
          sortOrder: i,
        });
      }

      // Insert records
      for (let i = 0; i < t.records.length; i++) {
        await db.insert(docTemplateRecordsTable).values({
          id: randomUUID(),
          templateId: templateUUID,
          recordName: t.records[i],
          sortOrder: i,
        });
      }

      // Insert tables
      for (let i = 0; i < t.tables.length; i++) {
        await db.insert(docTemplateTablesTable).values({
          id: randomUUID(),
          templateId: templateUUID,
          tableName: t.tables[i].name,
          columnsJson: t.tables[i].columns as any,
          sortOrder: i,
        });
      }

      // Insert control mappings
      let mappedCount = 0;
      for (const nistRef of t.mapped_controls) {
        const nr = normalizeNist(nistRef);
        const controls = nistToControls.get(nr) ?? [];
        if (controls.length === 0) {
          await db.insert(docTemplateControlMapsTable).values({
            id: randomUUID(),
            templateId: templateUUID,
            controlId: null,
            nistControlNumber: nr,
            supportType: "primary",
            artifactType: t.artifact_type,
          });
        } else {
          for (const ctrl of controls) {
            await db.insert(docTemplateControlMapsTable).values({
              id: randomUUID(),
              templateId: templateUUID,
              controlId: ctrl.id,
              nistControlNumber: nr,
              supportType: "primary",
              artifactType: t.artifact_type,
            });
            mappedCount++;
          }
        }
      }

      log.push(`✓ ${t.template_id} — ${t.title} (${t.artifact_type}, ${mappedCount} controls mapped)`);
      successCount++;
    } catch (err: any) {
      log.push(`✗ ${t.template_id} — ERROR: ${err.message}`);
      errorCount++;
    }
  }

  // ── Write import batch record ──────────────────────────────────────────────
  const batchId = randomUUID();
  await db.insert(docTemplateImportBatchesTable).values({
    id: batchId,
    filename: zipPath.split("/").pop() ?? zipPath,
    importedBy: "system",
    totalTemplates: library.templates.length,
    totalMappings: library.control_mapping.length,
    successCount,
    errorCount,
    skippedCount,
    status: errorCount > 0 ? "partial" : "complete",
    importLog: log as any,
  });

  console.log("\n=== Import Summary ===");
  console.log(`Total templates in package: ${library.templates.length}`);
  console.log(`Imported: ${successCount}`);
  console.log(`Skipped (already imported): ${skippedCount}`);
  console.log(`Errors: ${errorCount}`);
  console.log(`Batch ID: ${batchId}`);
  console.log("\nLog:");
  log.forEach((l) => console.log(" ", l));
  console.log("\nDone.");
}

function extractPlaceholders(text: string): string[] {
  const matches = text.match(/\{\{[A-Z_]+\}\}/g) ?? [];
  return [...new Set(matches)];
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
