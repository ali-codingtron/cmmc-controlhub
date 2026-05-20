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
  }
);
