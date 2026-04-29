import {
  pgTable,
  text,
  boolean,
  integer,
  timestamp,
  pgEnum,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { usersTable } from "./users";
import { controlsTable } from "./controls";

export const evidenceStatusEnum = pgEnum("evidence_status", [
  "draft",
  "needs_classification",
  "pending_review",
  "approved",
  "assessor_ready",
  "rejected",
  "stale",
  "superseded",
  "archived",
]);

export const evidenceTypeEnum = pgEnum("evidence_type", [
  "policy",
  "procedure",
  "screenshot",
  "log",
  "report",
  "ticket",
  "configuration_export",
  "training_record",
  "incident_record",
  "risk_record",
  "approval_record",
  "network_diagram",
  "scan_report",
  "other",
]);

export const evidenceItemsTable = pgTable("evidence_items", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  description: text("description"),
  evidenceType: evidenceTypeEnum("evidence_type").notNull(),
  status: evidenceStatusEnum("status").notNull().default("draft"),
  fileKey: text("file_key"),
  fileName: text("file_name"),
  fileSize: integer("file_size"),
  mimeType: text("mime_type"),
  fileHash: text("file_hash"),
  sourceSystem: text("source_system"),
  confidentialityLevel: text("confidentiality_level"),
  version: text("version").notNull().default("1.0"),
  tags: text("tags").array().notNull().default([]),
  ownerId: text("owner_id")
    .notNull()
    .references(() => usersTable.id),
  reviewerId: text("reviewer_id").references(() => usersTable.id),
  approverId: text("approver_id").references(() => usersTable.id),
  collectedAt: timestamp("collected_at"),
  reviewedAt: timestamp("reviewed_at"),
  approvedAt: timestamp("approved_at"),
  expiresAt: timestamp("expires_at"),
  reviewDueDate: timestamp("review_due_date"),
  rejectionNotes: text("rejection_notes"),
  assessorSummary: text("assessor_summary"),
  internalNotes: text("internal_notes"),
  implementationStatement: text("implementation_statement"),
  isCurrentVersion: boolean("is_current_version").notNull().default(true),
  previousVersionId: text("previous_version_id"),
  externalTicketRef: text("external_ticket_ref"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
  deletedAt: timestamp("deleted_at"),
});

export const evidenceControlLinksTable = pgTable("evidence_control_links", {
  id: text("id").primaryKey(),
  evidenceId: text("evidence_id")
    .notNull()
    .references(() => evidenceItemsTable.id, { onDelete: "cascade" }),
  controlId: text("control_id")
    .notNull()
    .references(() => controlsTable.id),
  objectiveText: text("objective_text"),
  linkedAt: timestamp("linked_at").notNull().defaultNow(),
  linkedById: text("linked_by_id").references(() => usersTable.id),
});

export const insertEvidenceSchema = createInsertSchema(evidenceItemsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  deletedAt: true,
});

export type InsertEvidence = z.infer<typeof insertEvidenceSchema>;
export type EvidenceItem = typeof evidenceItemsTable.$inferSelect;
export type EvidenceControlLink = typeof evidenceControlLinksTable.$inferSelect;
