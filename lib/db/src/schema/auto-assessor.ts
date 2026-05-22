import { pgTable, pgEnum, text, integer, boolean, timestamp } from "drizzle-orm/pg-core";
import { organizationsTable } from "./organizations";
import { controlsTable } from "./controls";

export const autoAssessmentStatusEnum = pgEnum("auto_assessment_status", [
  "draft",
  "complete",
  "approved",
  "archived",
]);

export const autoIntakeAnswerEnum = pgEnum("auto_intake_answer", [
  "yes",
  "no",
  "partial",
  "unknown",
  "not_applicable",
]);

export const autoSuggestedStatusEnum = pgEnum("auto_suggested_status", [
  "not_started",
  "in_progress",
  "needs_evidence",
  "needs_documentation",
  "needs_validation",
  "candidate_for_implemented",
]);

export const autoFindingTypeEnum = pgEnum("auto_finding_type", [
  "missing_evidence",
  "missing_policy",
  "missing_procedure",
  "missing_ssp_narrative",
  "monitoring_gap",
  "open_poam",
  "unknown_implementation",
  "stale_evidence",
]);

export const autoSeverityEnum = pgEnum("auto_severity", [
  "high",
  "medium",
  "low",
  "informational",
]);

export const autoAssessmentsTable = pgTable("auto_assessments", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id")
    .notNull()
    .references(() => organizationsTable.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  targetLevel: text("target_level").notNull().default("L2"),
  status: autoAssessmentStatusEnum("status").notNull().default("draft"),
  projectedScore: integer("projected_score"),
  maxScore: integer("max_score").default(110),
  confidenceAvg: integer("confidence_avg"),
  totalControls: integer("total_controls").default(0),
  candidateCount: integer("candidate_count").default(0),
  needsEvidenceCount: integer("needs_evidence_count").default(0),
  needsDocCount: integer("needs_doc_count").default(0),
  notStartedCount: integer("not_started_count").default(0),
  inProgressCount: integer("in_progress_count").default(0),
  notes: text("notes"),
  completedAt: timestamp("completed_at"),
  approvedAt: timestamp("approved_at"),
  approvedBy: text("approved_by"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
  createdBy: text("created_by"),
});

export const autoIntakeAnswersTable = pgTable("auto_intake_answers", {
  id: text("id").primaryKey(),
  assessmentId: text("assessment_id")
    .notNull()
    .references(() => autoAssessmentsTable.id, { onDelete: "cascade" }),
  questionKey: text("question_key").notNull(),
  answer: autoIntakeAnswerEnum("answer").notNull().default("unknown"),
  notes: text("notes"),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const autoFindingsTable = pgTable("auto_findings", {
  id: text("id").primaryKey(),
  assessmentId: text("assessment_id")
    .notNull()
    .references(() => autoAssessmentsTable.id, { onDelete: "cascade" }),
  controlId: text("control_id")
    .notNull()
    .references(() => controlsTable.id, { onDelete: "cascade" }),
  packId: text("pack_id").notNull().default(""),
  hasEvidence: boolean("has_evidence").notNull().default(false),
  hasApprovedEvidence: boolean("has_approved_evidence").notNull().default(false),
  hasPolicy: boolean("has_policy").notNull().default(false),
  hasProcedure: boolean("has_procedure").notNull().default(false),
  hasSspNarrative: boolean("has_ssp_narrative").notNull().default(false),
  hasMonitoringItem: boolean("has_monitoring_item").notNull().default(false),
  monitoringIsCurrent: boolean("monitoring_is_current").notNull().default(false),
  hasOpenPoam: boolean("has_open_poam").notNull().default(false),
  evidenceCount: integer("evidence_count").notNull().default(0),
  approvedEvidenceCount: integer("approved_evidence_count").notNull().default(0),
  intakeAnswer: text("intake_answer").default("unknown"),
  suggestedStatus: autoSuggestedStatusEnum("suggested_status")
    .notNull()
    .default("not_started"),
  confidenceScore: integer("confidence_score").notNull().default(0),
  findingType: autoFindingTypeEnum("finding_type"),
  severity: autoSeverityEnum("severity"),
  gapDescription: text("gap_description"),
  recommendedRemediation: text("recommended_remediation"),
  approvedStatus: autoSuggestedStatusEnum("approved_status"),
  approvedAt: timestamp("approved_at"),
  approvedBy: text("approved_by"),
  rejectedAt: timestamp("rejected_at"),
  rejectedReason: text("rejected_reason"),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const autoEvidenceRequestsTable = pgTable("auto_evidence_requests", {
  id: text("id").primaryKey(),
  assessmentId: text("assessment_id")
    .notNull()
    .references(() => autoAssessmentsTable.id, { onDelete: "cascade" }),
  packId: text("pack_id").notNull().default(""),
  packName: text("pack_name").notNull().default(""),
  title: text("title").notNull(),
  controlRefs: text("control_refs").array().notNull().default([]),
  evidenceType: text("evidence_type").notNull().default(""),
  instructions: text("instructions"),
  suggestedFilename: text("suggested_filename"),
  status: text("status").notNull().default("open"),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});
