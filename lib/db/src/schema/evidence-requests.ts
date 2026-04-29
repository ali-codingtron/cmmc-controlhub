import {
  pgTable,
  text,
  boolean,
  integer,
  timestamp,
  pgEnum,
  jsonb,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { usersTable } from "./users";
import { controlsTable } from "./controls";
import { organizationsTable } from "./organizations";
import { evidenceItemsTable } from "./evidence";
import { evidenceTypeEnum } from "./evidence";

export const evidenceRequestStatusEnum = pgEnum("evidence_request_status", [
  "pending",
  "fulfilled",
  "overdue",
  "cancelled",
]);

export const evidenceRequestRecurrenceEnum = pgEnum(
  "evidence_request_recurrence",
  ["once", "monthly", "quarterly", "semi_annual", "annually"]
);

export const reviewTypeEnum = pgEnum("review_type", [
  "access_review",
  "log_review",
  "backup_review",
  "vulnerability_review",
  "training_review",
  "supplier_review",
]);

export const reviewLogStatusEnum = pgEnum("review_log_status", [
  "draft",
  "completed",
]);

export const csvImportTypeEnum = pgEnum("csv_import_type", [
  "users",
  "assets",
  "systems",
  "access_reviews",
  "training_records",
  "suppliers",
  "risks",
  "poam_items",
]);

export const csvImportStatusEnum = pgEnum("csv_import_status", [
  "pending",
  "processing",
  "completed",
  "failed",
]);

export const evidenceRequestsTable = pgTable("evidence_requests", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id")
    .notNull()
    .references(() => organizationsTable.id, { onDelete: "cascade" }),
  controlId: text("control_id").references(() => controlsTable.id),
  title: text("title").notNull(),
  description: text("description"),
  evidenceType: evidenceTypeEnum("evidence_type").notNull(),
  instructions: text("instructions"),
  ownerId: text("owner_id")
    .notNull()
    .references(() => usersTable.id),
  dueDate: timestamp("due_date"),
  recurrence: evidenceRequestRecurrenceEnum("recurrence")
    .notNull()
    .default("once"),
  requiredFileTypes: text("required_file_types").array().notNull().default([]),
  approvalRequired: boolean("approval_required").notNull().default(false),
  assessorSummaryRequired: boolean("assessor_summary_required")
    .notNull()
    .default(false),
  status: evidenceRequestStatusEnum("status").notNull().default("pending"),
  fulfilledAt: timestamp("fulfilled_at"),
  fulfilledByEvidenceId: text("fulfilled_by_evidence_id").references(
    () => evidenceItemsTable.id
  ),
  fulfilledByUserId: text("fulfilled_by_user_id").references(
    () => usersTable.id
  ),
  nextDueAt: timestamp("next_due_at"),
  assessorSummary: text("assessor_summary"),
  createdByUserId: text("created_by_user_id")
    .notNull()
    .references(() => usersTable.id),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const reviewLogsTable = pgTable("review_logs", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id")
    .notNull()
    .references(() => organizationsTable.id, { onDelete: "cascade" }),
  reviewType: reviewTypeEnum("review_type").notNull(),
  title: text("title").notNull(),
  status: reviewLogStatusEnum("status").notNull().default("draft"),
  formData: jsonb("form_data").notNull().default({}),
  controlIds: text("control_ids").array().notNull().default([]),
  evidenceItemId: text("evidence_item_id").references(
    () => evidenceItemsTable.id
  ),
  reviewedById: text("reviewed_by_id")
    .notNull()
    .references(() => usersTable.id),
  reviewedAt: timestamp("reviewed_at"),
  periodStart: timestamp("period_start"),
  periodEnd: timestamp("period_end"),
  notes: text("notes"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const csvImportsTable = pgTable("csv_imports", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id")
    .notNull()
    .references(() => organizationsTable.id, { onDelete: "cascade" }),
  importType: csvImportTypeEnum("import_type").notNull(),
  fileName: text("file_name").notNull(),
  rowsTotal: integer("rows_total").notNull().default(0),
  rowsImported: integer("rows_imported").notNull().default(0),
  rowsFailed: integer("rows_failed").notNull().default(0),
  status: csvImportStatusEnum("status").notNull().default("pending"),
  errors: jsonb("errors").notNull().default([]),
  importedById: text("imported_by_id")
    .notNull()
    .references(() => usersTable.id),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertEvidenceRequestSchema = createInsertSchema(
  evidenceRequestsTable
).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  fulfilledAt: true,
  fulfilledByEvidenceId: true,
  fulfilledByUserId: true,
  nextDueAt: true,
});

export const insertReviewLogSchema = createInsertSchema(reviewLogsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  reviewedAt: true,
  evidenceItemId: true,
});

export type EvidenceRequest = typeof evidenceRequestsTable.$inferSelect;
export type ReviewLog = typeof reviewLogsTable.$inferSelect;
export type CsvImport = typeof csvImportsTable.$inferSelect;
