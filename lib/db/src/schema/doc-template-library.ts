import {
  pgTable,
  text,
  boolean,
  integer,
  timestamp,
  jsonb,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { documentTemplatesTable } from "./documents";
import { controlsTable } from "./controls";
import { organizationsTable } from "./organizations";
import { usersTable } from "./users";
import { evidenceItemsTable } from "./evidence";

// ── Satellite tables for the imported CMMC L2 Document Template Library ───────

export const docTemplateSectionsTable = pgTable("doc_template_sections", {
  id: text("id").primaryKey(),
  templateId: text("template_id")
    .notNull()
    .references(() => documentTemplatesTable.id, { onDelete: "cascade" }),
  sectionName: text("section_name").notNull(),
  sectionOrder: integer("section_order").notNull().default(0),
  content: text("content").notNull().default(""),
  contentType: text("content_type").notNull().default("markdown"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const docTemplateRequirementsTable = pgTable("doc_template_requirements", {
  id: text("id").primaryKey(),
  templateId: text("template_id")
    .notNull()
    .references(() => documentTemplatesTable.id, { onDelete: "cascade" }),
  requirementText: text("requirement_text").notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
});

export const docTemplateRolesTable = pgTable("doc_template_roles", {
  id: text("id").primaryKey(),
  templateId: text("template_id")
    .notNull()
    .references(() => documentTemplatesTable.id, { onDelete: "cascade" }),
  roleText: text("role_text").notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
});

export const docTemplateProcedureStepsTable = pgTable("doc_template_procedure_steps", {
  id: text("id").primaryKey(),
  templateId: text("template_id")
    .notNull()
    .references(() => documentTemplatesTable.id, { onDelete: "cascade" }),
  stepText: text("step_text").notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
});

export const docTemplateRecordsTable = pgTable("doc_template_records", {
  id: text("id").primaryKey(),
  templateId: text("template_id")
    .notNull()
    .references(() => documentTemplatesTable.id, { onDelete: "cascade" }),
  recordName: text("record_name").notNull(),
  description: text("description"),
  sortOrder: integer("sort_order").notNull().default(0),
});

export const docTemplateTablesTable = pgTable("doc_template_tables", {
  id: text("id").primaryKey(),
  templateId: text("template_id")
    .notNull()
    .references(() => documentTemplatesTable.id, { onDelete: "cascade" }),
  tableName: text("table_name").notNull(),
  columnsJson: jsonb("columns_json").notNull().default([]),
  sortOrder: integer("sort_order").notNull().default(0),
});

export const docTemplatePlaceholdersTable = pgTable("doc_template_placeholders", {
  id: text("id").primaryKey(),
  placeholder: text("placeholder").notNull().unique(),
  description: text("description").notNull().default(""),
  defaultValue: text("default_value"),
  required: boolean("required").notNull().default(false),
});

export const docTemplateControlMapsTable = pgTable("doc_template_control_maps", {
  id: text("id").primaryKey(),
  templateId: text("template_id")
    .notNull()
    .references(() => documentTemplatesTable.id, { onDelete: "cascade" }),
  controlId: text("control_id").references(() => controlsTable.id),
  nistControlNumber: text("nist_control_number").notNull(),
  supportType: text("support_type").notNull().default("primary"),
  artifactType: text("artifact_type"),
});

export const docTemplateImportBatchesTable = pgTable("doc_template_import_batches", {
  id: text("id").primaryKey(),
  filename: text("filename").notNull(),
  importedBy: text("imported_by"),
  importedAt: timestamp("imported_at").notNull().defaultNow(),
  totalTemplates: integer("total_templates").notNull().default(0),
  totalMappings: integer("total_mappings").notNull().default(0),
  successCount: integer("success_count").notNull().default(0),
  errorCount: integer("error_count").notNull().default(0),
  skippedCount: integer("skipped_count").notNull().default(0),
  status: text("status").notNull().default("complete"),
  importLog: jsonb("import_log").notNull().default([]),
});

// ── Package applicability junction ────────────────────────────────────────────
// Links each library template to one or more compliance package keys with
// applicability semantics (EXACT = primary artifact, SHARED = used by both
// L1 and L2, OPTIONAL = helpful but not required, REFERENCE_ONLY = informational)
// and information_type (FCI / CUI / BOTH / NOT_APPLICABLE).

export const docTemplatePackagesTable = pgTable("doc_template_packages", {
  id: text("id").primaryKey(),
  templateId: text("template_id")
    .notNull()
    .references(() => documentTemplatesTable.id, { onDelete: "cascade" }),
  packageKey: text("package_key").notNull(),
  applicability: text("applicability").notNull().default("EXACT"),
  informationType: text("information_type").notNull().default("CUI"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (t) => ({
  uniqTemplatePkg: uniqueIndex("doc_template_packages_template_pkg_uniq").on(t.templateId, t.packageKey),
}));

// ── Per-placeholder manifest ───────────────────────────────────────────────────
// Stores richer metadata for each {{TOKEN}} in a template body.

export const docTemplatePlaceholderManifestTable = pgTable("doc_template_placeholder_manifest", {
  id: text("id").primaryKey(),
  templateId: text("template_id")
    .notNull()
    .references(() => documentTemplatesTable.id, { onDelete: "cascade" }),
  placeholderKey: text("placeholder_key").notNull(),
  displayLabel: text("display_label").notNull(),
  section: text("section"),
  dataType: text("data_type").notNull().default("text"),
  required: boolean("required").notNull().default(false),
  defaultSource: text("default_source"),
  defaultValue: text("default_value"),
  validationRule: text("validation_rule"),
  helpText: text("help_text"),
  packageKey: text("package_key"),
  allowDocumentOverride: boolean("allow_document_override").notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
}, (t) => ({
  uniqTemplatePlaceholder: uniqueIndex("doc_template_placeholder_manifest_uniq").on(t.templateId, t.placeholderKey),
}));

export type DocTemplateSection = typeof docTemplateSectionsTable.$inferSelect;
export type DocTemplateRequirement = typeof docTemplateRequirementsTable.$inferSelect;
export type DocTemplateRole = typeof docTemplateRolesTable.$inferSelect;
export type DocTemplateProcedureStep = typeof docTemplateProcedureStepsTable.$inferSelect;
export type DocTemplateRecord = typeof docTemplateRecordsTable.$inferSelect;
export type DocTemplateTable = typeof docTemplateTablesTable.$inferSelect;
export type DocTemplatePlaceholder = typeof docTemplatePlaceholdersTable.$inferSelect;
export type DocTemplateControlMap = typeof docTemplateControlMapsTable.$inferSelect;
export type DocTemplateImportBatch = typeof docTemplateImportBatchesTable.$inferSelect;
export type DocTemplatePackage = typeof docTemplatePackagesTable.$inferSelect;
export type DocTemplatePlaceholderManifest = typeof docTemplatePlaceholderManifestTable.$inferSelect;
