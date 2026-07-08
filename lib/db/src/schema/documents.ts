import {
  pgTable,
  text,
  boolean,
  integer,
  timestamp,
  jsonb,
  pgEnum,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";
import { controlsTable } from "./controls";
import { domainsTable } from "./domains";
import { evidenceItemsTable } from "./evidence";
import { organizationsTable } from "./organizations";

export const docTypeEnum = pgEnum("doc_type", [
  "policy",
  "procedure",
  "log",
  "register",
  "checklist",
  "narrative",
  "form",
  "plan",
  "report",
  "approval_record",
  "access_review",
  "training_record",
  "incident_record",
  "risk_record",
  "system_inventory",
  "asset_inventory",
  "supplier_review",
  "backup_verification",
  "vulnerability_scan",
  "other",
]);

export const docStatusEnum = pgEnum("doc_status", [
  "draft",
  "pending_review",
  "approved",
  "active",
  "assessor_ready",
  "rejected",
  "stale",
  "needs_update",
  "expired",
  "superseded",
  "archived",
]);

export const reviewFreqDocEnum = pgEnum("review_freq_doc", [
  "monthly",
  "quarterly",
  "semi_annually",
  "annually",
  "as_needed",
]);

export const cmmcDocLevelEnum = pgEnum("cmmc_doc_level", ["L1", "L2", "both"]);

export const documentTemplatesTable = pgTable("document_templates", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id").references(
    () => organizationsTable.id,
    { onDelete: "cascade" }
  ),
  title: text("title").notNull(),
  docType: docTypeEnum("doc_type").notNull(),
  cmmcLevel: cmmcDocLevelEnum("cmmc_level").notNull().default("both"),
  domainAbbr: text("domain_abbr"),
  version: text("version").notNull().default("1.0"),
  ownerRole: text("owner_role").notNull().default("compliance_manager"),
  reviewFrequency: reviewFreqDocEnum("review_frequency").notNull().default("annually"),
  description: text("description"),
  bodyTemplate: text("body_template").notNull(),
  requiredFields: text("required_fields").array().notNull().default([]),
  placeholders: text("placeholders").array().notNull().default([]),
  linkedControlIds: text("linked_control_ids").array().notNull().default([]),
  requiresApproval: boolean("requires_approval").notNull().default(true),
  outputFormat: text("output_format").notNull().default("rich_text"),
  isActive: boolean("is_active").notNull().default(true),
  isSystemTemplate: boolean("is_system_template").notNull().default(false),
  checklistItems: jsonb("checklist_items").default([]),
  recurrenceRule: text("recurrence_rule"),
  // ── CMMC L2 Template Library columns ─────────────────────────────────────
  sourceTemplateId: text("source_template_id"),
  sourcePackage: text("source_package"),
  family: text("family"),
  artifactTypeLabel: text("artifact_type_label"),
  purpose: text("purpose"),
  scope: text("scope"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const documentsTable = pgTable("documents", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id").references(
    () => organizationsTable.id,
    { onDelete: "cascade" }
  ),
  templateId: text("template_id").references(() => documentTemplatesTable.id),
  title: text("title").notNull(),
  docType: docTypeEnum("doc_type").notNull(),
  status: docStatusEnum("status").notNull().default("draft"),
  cmmcLevel: cmmcDocLevelEnum("cmmc_level").notNull().default("both"),
  version: text("version").notNull().default("1.0"),
  body: text("body").notNull().default(""),
  fieldValues: jsonb("field_values").default({}),
  organizationName: text("organization_name"),
  systemName: text("system_name"),
  effectiveDate: timestamp("effective_date"),
  nextReviewDate: timestamp("next_review_date"),
  expiresAt: timestamp("expires_at"),
  ownerId: text("owner_id")
    .notNull()
    .references(() => usersTable.id),
  reviewerId: text("reviewer_id").references(() => usersTable.id),
  approverId: text("approver_id").references(() => usersTable.id),
  reviewedAt: timestamp("reviewed_at"),
  approvedAt: timestamp("approved_at"),
  activatedAt: timestamp("activated_at"),
  rejectionNotes: text("rejection_notes"),
  internalNotes: text("internal_notes"),
  comments: text("comments"),
  isCurrentVersion: boolean("is_current_version").notNull().default(true),
  previousVersionId: text("previous_version_id"),
  reviewFrequency: reviewFreqDocEnum("review_frequency").notNull().default("annually"),
  requiresApproval: boolean("requires_approval").notNull().default(true),
  fileKey: text("file_key"),
  fileName: text("file_name"),
  fileSize: text("file_size"),
  assessorSummary: text("assessor_summary"),
  tags: text("tags").array().notNull().default([]),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
  deletedAt: timestamp("deleted_at"),
});

export const documentVersionsTable = pgTable("document_versions", {
  id: text("id").primaryKey(),
  documentId: text("document_id")
    .notNull()
    .references(() => documentsTable.id, { onDelete: "cascade" }),
  version: text("version").notNull(),
  body: text("body").notNull(),
  fieldValues: jsonb("field_values").default({}),
  status: docStatusEnum("status").notNull(),
  changedById: text("changed_by_id").references(() => usersTable.id),
  changeNotes: text("change_notes"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const documentControlMapsTable = pgTable("document_control_maps", {
  id: text("id").primaryKey(),
  documentId: text("document_id")
    .notNull()
    .references(() => documentsTable.id, { onDelete: "cascade" }),
  controlId: text("control_id")
    .notNull()
    .references(() => controlsTable.id),
  linkedAt: timestamp("linked_at").notNull().defaultNow(),
});

export const documentEvidenceMapsTable = pgTable("document_evidence_maps", {
  id: text("id").primaryKey(),
  documentId: text("document_id")
    .notNull()
    .references(() => documentsTable.id, { onDelete: "cascade" }),
  evidenceId: text("evidence_id")
    .notNull()
    .references(() => evidenceItemsTable.id, { onDelete: "cascade" }),
  linkedAt: timestamp("linked_at").notNull().defaultNow(),
});

export const documentReviewsTable = pgTable("document_reviews", {
  id: text("id").primaryKey(),
  documentId: text("document_id")
    .notNull()
    .references(() => documentsTable.id, { onDelete: "cascade" }),
  reviewerId: text("reviewer_id")
    .notNull()
    .references(() => usersTable.id),
  action: text("action").notNull(),
  notes: text("notes"),
  version: text("version"),
  reviewedAt: timestamp("reviewed_at").notNull().defaultNow(),
});

export const generatedLogsTable = pgTable("generated_logs", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id").references(
    () => organizationsTable.id,
    { onDelete: "cascade" }
  ),
  templateId: text("template_id").references(() => documentTemplatesTable.id),
  documentId: text("document_id").references(() => documentsTable.id),
  title: text("title").notNull(),
  periodStart: timestamp("period_start"),
  periodEnd: timestamp("period_end"),
  status: docStatusEnum("status").notNull().default("draft"),
  responsibleUserId: text("responsible_user_id").references(() => usersTable.id),
  reviewerId: text("reviewer_id").references(() => usersTable.id),
  approverId: text("approver_id").references(() => usersTable.id),
  completionNotes: text("completion_notes"),
  reviewedAt: timestamp("reviewed_at"),
  approvedAt: timestamp("approved_at"),
  generatedEvidenceId: text("generated_evidence_id").references(() => evidenceItemsTable.id),
  linkedControlIds: text("linked_control_ids").array().notNull().default([]),
  fieldValues: jsonb("field_values").default({}),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const logEntriesTable = pgTable("log_entries", {
  id: text("id").primaryKey(),
  logId: text("log_id")
    .notNull()
    .references(() => generatedLogsTable.id, { onDelete: "cascade" }),
  entryText: text("entry_text").notNull(),
  entryType: text("entry_type").notNull().default("finding"),
  completedById: text("completed_by_id").references(() => usersTable.id),
  isCompleted: boolean("is_completed").notNull().default(false),
  sortOrder: integer("sort_order").notNull().default(0),
  notes: text("notes"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const checklistItemsTable = pgTable("checklist_items", {
  id: text("id").primaryKey(),
  templateId: text("template_id")
    .notNull()
    .references(() => documentTemplatesTable.id, { onDelete: "cascade" }),
  itemText: text("item_text").notNull(),
  description: text("description"),
  isRequired: boolean("is_required").notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const checklistCompletionsTable = pgTable("checklist_completions", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id").references(
    () => organizationsTable.id,
    { onDelete: "cascade" }
  ),
  templateId: text("template_id")
    .notNull()
    .references(() => documentTemplatesTable.id),
  completedById: text("completed_by_id")
    .notNull()
    .references(() => usersTable.id),
  title: text("title").notNull(),
  notes: text("completion_notes"),
  itemResults: jsonb("item_results").default([]),
  generatedEvidenceId: text("generated_evidence_id").references(() => evidenceItemsTable.id),
  linkedControlIds: text("linked_control_ids").array().notNull().default([]),
  completedAt: timestamp("completed_at").notNull().defaultNow(),
});

export const procedureTaskRulesTable = pgTable("procedure_task_rules", {
  id: text("id").primaryKey(),
  documentId: text("document_id")
    .notNull()
    .references(() => documentsTable.id, { onDelete: "cascade" }),
  taskTitle: text("task_title").notNull(),
  taskDescription: text("task_description"),
  recurrenceFrequency: text("recurrence_frequency").notNull().default("monthly"),
  assigneeRole: text("assignee_role"),
  assigneeId: text("assignee_id").references(() => usersTable.id),
  escalationOwnerId: text("escalation_owner_id").references(() => usersTable.id),
  daysBeforeDueReminder: integer("days_before_due_reminder").notNull().default(7),
  linkedControlIds: text("linked_control_ids").array().notNull().default([]),
  isActive: boolean("is_active").notNull().default(true),
  lastGeneratedAt: timestamp("last_generated_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertDocumentTemplateSchema = createInsertSchema(documentTemplatesTable).omit({
  createdAt: true,
  updatedAt: true,
});
export const insertDocumentSchema = createInsertSchema(documentsTable).omit({
  createdAt: true,
  updatedAt: true,
  deletedAt: true,
});

export type DocumentTemplate = typeof documentTemplatesTable.$inferSelect;
export type InsertDocumentTemplate = z.infer<typeof insertDocumentTemplateSchema>;
export type Document = typeof documentsTable.$inferSelect;
export type InsertDocument = z.infer<typeof insertDocumentSchema>;
export type DocumentVersion = typeof documentVersionsTable.$inferSelect;
export type DocumentReview = typeof documentReviewsTable.$inferSelect;
export type GeneratedLog = typeof generatedLogsTable.$inferSelect;
export type LogEntry = typeof logEntriesTable.$inferSelect;
export type ChecklistItem = typeof checklistItemsTable.$inferSelect;
export type ChecklistCompletion = typeof checklistCompletionsTable.$inferSelect;
export type ProcedureTaskRule = typeof procedureTaskRulesTable.$inferSelect;
