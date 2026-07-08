import {
  pgTable,
  text,
  boolean,
  integer,
  timestamp,
  pgEnum,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { domainsTable } from "./domains";
import { usersTable } from "./users";
import { organizationsTable } from "./organizations";

export const cmmcLevelEnum = pgEnum("cmmc_level", ["L1", "L2"]);

export const controlStatusEnum = pgEnum("control_status", [
  "not_started",
  "in_progress",
  "implemented",
  "needs_review",
  "assessor_ready",
  "not_applicable",
  "at_risk",
]);

export const reviewFrequencyEnum = pgEnum("review_frequency", [
  "daily",
  "weekly",
  "monthly",
  "quarterly",
  "semi_annually",
  "annually",
  "as_needed",
]);

export const controlsTable = pgTable("controls", {
  id: text("id").primaryKey(),
  controlId: text("control_id").notNull().unique(),
  domainId: text("domain_id")
    .notNull()
    .references(() => domainsTable.id),
  title: text("title").notNull(),
  description: text("description").notNull(),
  level: cmmcLevelEnum("level").notNull(),
  nistRef: text("nist_ref"),
  implementationGuidance: text("implementation_guidance"),
  recommendedReviewFrequency: reviewFrequencyEnum("recommended_review_frequency")
    .notNull()
    .default("annually"),
  isActive: boolean("is_active").notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const assessmentObjectivesTable = pgTable("assessment_objectives", {
  id: text("id").primaryKey(),
  controlId: text("control_id")
    .notNull()
    .references(() => controlsTable.id, { onDelete: "cascade" }),
  text: text("text").notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const controlEvidenceTypesTable = pgTable("control_evidence_types", {
  id: text("id").primaryKey(),
  controlId: text("control_id")
    .notNull()
    .references(() => controlsTable.id, { onDelete: "cascade" }),
  evidenceType: text("evidence_type").notNull(),
  isRequired: boolean("is_required").notNull().default(false),
});

export const controlAssessmentsTable = pgTable("control_assessments", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id").references(
    () => organizationsTable.id,
    { onDelete: "cascade" }
  ),
  controlId: text("control_id")
    .notNull()
    .references(() => controlsTable.id),
  status: controlStatusEnum("status").notNull().default("not_started"),
  implementationNarrative: text("implementation_narrative"),
  assessorNotes: text("assessor_notes"),
  isNotApplicable: boolean("is_not_applicable").notNull().default(false),
  naJustification: text("na_justification"),
  lastAssessedAt: timestamp("last_assessed_at"),
  assessedById: text("assessed_by_id").references(() => usersTable.id),
  candidateReadyAt: timestamp("candidate_ready_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// ── Configure Tab ──────────────────────────────────────────────────────────

export const configStepStatusEnum = pgEnum("config_step_status", [
  "not_started",
  "in_progress",
  "complete",
  "not_applicable",
]);

/** Global per-control configure guidance (approach, evidence list, test procedures) */
export const controlConfigureContentTable = pgTable("control_configure_content", {
  id: text("id").primaryKey(),
  controlId: text("control_id")
    .notNull()
    .unique()
    .references(() => controlsTable.id, { onDelete: "cascade" }),
  implementationApproach: text("implementation_approach"),
  systemsUsed: text("systems_used"),        // JSON string[]
  evidenceRequirements: text("evidence_requirements"), // JSON {title,type,filename,location,mustShow}[]
  testProcedures: text("test_procedures"),  // JSON {name,steps,expectedResult,passCriteria}[]
  closeoutChecklist: text("closeout_checklist"), // JSON string[]
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

/** Global numbered configuration steps for a control */
export const controlConfigStepsTable = pgTable("control_config_steps", {
  id: text("id").primaryKey(),
  controlId: text("control_id")
    .notNull()
    .references(() => controlsTable.id, { onDelete: "cascade" }),
  stepNumber: integer("step_number").notNull(),
  title: text("title").notNull(),
  instruction: text("instruction").notNull(),
  systemPortal: text("system_portal"),
  navigationPath: text("navigation_path"),
  recommendedSetting: text("recommended_setting"),
  expectedResult: text("expected_result"),
  evidenceHint: text("evidence_hint"),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

/** Org-specific completion state per step */
export const orgControlStepProgressTable = pgTable("org_control_step_progress", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id").references(
    () => organizationsTable.id,
    { onDelete: "cascade" }
  ),
  stepId: text("step_id")
    .notNull()
    .references(() => controlConfigStepsTable.id, { onDelete: "cascade" }),
  status: configStepStatusEnum("status").notNull().default("not_started"),
  notes: text("notes"),
  completedBy: text("completed_by").references(() => usersTable.id, {
    onDelete: "set null",
  }),
  completedAt: timestamp("completed_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertControlSchema = createInsertSchema(controlsTable).omit({
  createdAt: true,
  updatedAt: true,
});

export type InsertControl = z.infer<typeof insertControlSchema>;
export type Control = typeof controlsTable.$inferSelect;
export type ControlAssessment = typeof controlAssessmentsTable.$inferSelect;
export type ControlConfigureContent = typeof controlConfigureContentTable.$inferSelect;
export type ControlConfigStep = typeof controlConfigStepsTable.$inferSelect;
export type OrgControlStepProgress = typeof orgControlStepProgressTable.$inferSelect;
