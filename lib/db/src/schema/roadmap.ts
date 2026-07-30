import {
  pgTable,
  text,
  integer,
  boolean,
  timestamp,
  pgEnum,
} from "drizzle-orm/pg-core";
import { controlsTable } from "./controls";
import { organizationsTable } from "./organizations";

export const roadmapPriorityEnum = pgEnum("roadmap_priority", [
  "critical",
  "high",
  "medium",
  "low",
]);

export const roadmapEffortEnum = pgEnum("roadmap_effort", [
  "low",
  "medium",
  "high",
]);

export const roadmapStatusEnum = pgEnum("roadmap_status", [
  "not_started",
  "in_progress",
  "evidence_needed",
  "ready_for_review",
  "complete",
  "blocked",
  "not_applicable",
]);

export const roadmapSupportTypeEnum = pgEnum("roadmap_support_type", [
  "full_support",
  "partial_support",
  "evidence_only",
  "doc_only",
  "monitoring_only",
]);

export const roadmapResultEnum = pgEnum("roadmap_result", [
  "passed",
  "passed_with_exceptions",
  "failed",
  "needs_follow_up",
]);

export const roadmapActionsTable = pgTable("roadmap_actions", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  category: text("category").notNull(),
  phase: integer("phase").notNull(),
  phaseName: text("phase_name").notNull(),
  priority: roadmapPriorityEnum("priority").notNull(),
  effort: roadmapEffortEnum("effort").notNull(),
  impactScore: integer("impact_score").notNull().default(0),
  purpose: text("purpose").notNull(),
  whyItMatters: text("why_it_matters").notNull(),
  operatingProcedure: text("operating_procedure").notNull(),
  testProcedure: text("test_procedure").notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const roadmapActionControlLinksTable = pgTable(
  "roadmap_action_control_links",
  {
    id: text("id").primaryKey(),
    actionId: text("action_id")
      .notNull()
      .references(() => roadmapActionsTable.id, { onDelete: "cascade" }),
    controlId: text("control_id")
      .notNull()
      .references(() => controlsTable.id, { onDelete: "cascade" }),
    supportType: roadmapSupportTypeEnum("support_type").notNull(),
  }
);

export const roadmapActionEvidenceItemsTable = pgTable(
  "roadmap_action_evidence_items",
  {
    id: text("id").primaryKey(),
    actionId: text("action_id")
      .notNull()
      .references(() => roadmapActionsTable.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    evidenceType: text("evidence_type").notNull(),
    suggestedFilename: text("suggested_filename").notNull(),
    sourceSystem: text("source_system").notNull(),
    mustShow: text("must_show").notNull(),
    description: text("description"),
    isRequired: boolean("is_required").notNull().default(true),
    sortOrder: integer("sort_order").notNull().default(0),
  }
);

export const roadmapActionDocumentsTable = pgTable(
  "roadmap_action_documents",
  {
    id: text("id").primaryKey(),
    actionId: text("action_id")
      .notNull()
      .references(() => roadmapActionsTable.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    docType: text("doc_type").notNull(),
    sortOrder: integer("sort_order").notNull().default(0),
  }
);

export const roadmapActionChecklistItemsTable = pgTable(
  "roadmap_action_checklist_items",
  {
    id: text("id").primaryKey(),
    actionId: text("action_id")
      .notNull()
      .references(() => roadmapActionsTable.id, { onDelete: "cascade" }),
    label: text("label").notNull(),
    isRequired: boolean("is_required").notNull().default(true),
    sortOrder: integer("sort_order").notNull().default(0),
  }
);

export const orgRoadmapProgressTable = pgTable("org_roadmap_progress", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id")
    .notNull()
    .references(() => organizationsTable.id, { onDelete: "cascade" }),
  actionId: text("action_id")
    .notNull()
    .references(() => roadmapActionsTable.id, { onDelete: "cascade" }),
  status: roadmapStatusEnum("status").notNull().default("not_started"),
  owner: text("owner"),
  targetDate: text("target_date"),
  result: roadmapResultEnum("result"),
  notes: text("notes"),
  understandAckAt: timestamp("understand_ack_at"),
  understandAckBy: text("understand_ack_by"),
  validatedBy: text("validated_by"),
  validatedAt: timestamp("validated_at"),
  validationNotes: text("validation_notes"),
  overrideJustification: text("override_justification"),
  overrideApprovedBy: text("override_approved_by"),
  overrideApprovedAt: timestamp("override_approved_at"),
  completedAt: timestamp("completed_at"),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const orgRoadmapChecklistProgressTable = pgTable(
  "org_roadmap_checklist_progress",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizationsTable.id, { onDelete: "cascade" }),
    checklistItemId: text("checklist_item_id")
      .notNull()
      .references(() => roadmapActionChecklistItemsTable.id, {
        onDelete: "cascade",
      }),
    completed: boolean("completed").notNull().default(false),
    completedAt: timestamp("completed_at"),
    completedBy: text("completed_by"),
    notes: text("notes"),
  }
);

// ── Evidence Catalog → Uploaded Evidence Linkage ──────────────────────────────

export const orgRoadmapEvidenceLinksTable = pgTable(
  "org_roadmap_evidence_links",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizationsTable.id, { onDelete: "cascade" }),
    roadmapEvidenceItemId: text("roadmap_evidence_item_id")
      .notNull()
      .references(() => roadmapActionEvidenceItemsTable.id, {
        onDelete: "cascade",
      }),
    evidenceId: text("evidence_id").notNull(),
    linkedBy: text("linked_by"),
    linkedAt: timestamp("linked_at").notNull().defaultNow(),
  }
);

// ── Detailed Procedure Steps ───────────────────────────────────────────────────

export const procedureStepStatusEnum = pgEnum("procedure_step_status", [
  "not_started",
  "in_progress",
  "complete",
  "blocked",
  "not_applicable",
]);

export const roadmapProcedureStepsTable = pgTable("roadmap_procedure_steps", {
  id: text("id").primaryKey(),
  actionId: text("action_id")
    .notNull()
    .references(() => roadmapActionsTable.id, { onDelete: "cascade" }),
  stepNumber: integer("step_number").notNull(),
  title: text("title").notNull(),
  purpose: text("purpose").notNull().default(""),
  systemPortal: text("system_portal").notNull().default(""),
  navigationPath: text("navigation_path").notNull().default(""),
  instructions: text("instructions").notNull().default(""),
  recommendedSettings: text("recommended_settings"),
  expectedResult: text("expected_result").notNull().default(""),
  evidenceToCapture: text("evidence_to_capture").notNull().default(""),
  suggestedFilename: text("suggested_filename").notNull().default(""),
  relatedControls: text("related_controls").array().notNull().default([]),
  ownerRole: text("owner_role").notNull().default("Compliance Manager"),
  ifThisFails: text("if_this_fails").notNull().default(""),
  isRequired: boolean("is_required").notNull().default(true),
  isCustom: boolean("is_custom").notNull().default(false),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const orgProcedureStepProgressTable = pgTable(
  "org_procedure_step_progress",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizationsTable.id, { onDelete: "cascade" }),
    stepId: text("step_id")
      .notNull()
      .references(() => roadmapProcedureStepsTable.id, { onDelete: "cascade" }),
    status: procedureStepStatusEnum("status").notNull().default("not_started"),
    completedBy: text("completed_by"),
    completedAt: timestamp("completed_at"),
    notes: text("notes"),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  }
);
