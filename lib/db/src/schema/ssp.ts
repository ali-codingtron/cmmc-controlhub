import { pgTable, text, timestamp, boolean, integer, pgEnum } from "drizzle-orm/pg-core";
import { organizationsTable } from "./organizations";
import { controlsTable } from "./controls";

export const sspStatusEnum = pgEnum("ssp_status", [
  "draft",
  "review",
  "approved",
  "superseded",
]);

export const sspDocumentsTable = pgTable("ssp_documents", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id").references(() => organizationsTable.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  documentNumber: text("document_number"),
  revisionNumber: text("revision_number"),
  revisionDate: text("revision_date"),
  preparedBy: text("prepared_by"),
  reviewedBy: text("reviewed_by"),
  approvedBy: text("approved_by"),
  organization: text("organization"),
  systemName: text("system_name"),
  systemOwner: text("system_owner"),
  cmmcLevel: text("cmmc_level"),
  status: sspStatusEnum("status").notNull().default("draft"),
  originalFileName: text("original_file_name"),
  fileKey: text("file_key"),
  isPrimary: boolean("is_primary").notNull().default(false),
  extractedAt: timestamp("extracted_at"),
  nextReviewDate: text("next_review_date"),
  notes: text("notes"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const sspSectionsTable = pgTable("ssp_sections", {
  id: text("id").primaryKey(),
  sspDocumentId: text("ssp_document_id").notNull().references(() => sspDocumentsTable.id, { onDelete: "cascade" }),
  organizationId: text("organization_id"),
  sectionKey: text("section_key").notNull(),
  sectionTitle: text("section_title").notNull(),
  content: text("content").notNull().default(""),
  sortOrder: integer("sort_order").notNull().default(0),
  isComplete: boolean("is_complete").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const sspControlMappingsTable = pgTable("ssp_control_mappings", {
  id: text("id").primaryKey(),
  sspDocumentId: text("ssp_document_id").notNull().references(() => sspDocumentsTable.id, { onDelete: "cascade" }),
  organizationId: text("organization_id"),
  controlRef: text("control_ref").notNull(),
  controlDbId: text("control_db_id").references(() => controlsTable.id),
  implementationNarrative: text("implementation_narrative").notNull().default(""),
  policyReference: text("policy_reference"),
  sspStatus: text("ssp_status").default("planned"),
  sourceSection: text("source_section"),
  isEdited: boolean("is_edited").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});
