import {
  pgTable,
  pgEnum,
  text,
  integer,
  boolean,
  timestamp,
} from "drizzle-orm/pg-core";
import { organizationsTable } from "./organizations";
import { controlsTable } from "./controls";

export const readinessAssessmentTypeEnum = pgEnum("readiness_assessment_type", [
  "quick_baseline",
  "full_control",
  "objective_level",
  "reassessment",
]);

export const readinessAssessmentStatusEnum = pgEnum(
  "readiness_assessment_status",
  ["setup", "scoping", "in_progress", "complete"]
);

export const readinessScopeAnswerEnum = pgEnum("readiness_scope_answer", [
  "yes",
  "no",
  "partial",
  "unknown",
  "not_applicable",
]);

export const readinessFindingResultEnum = pgEnum("readiness_finding_result", [
  "met",
  "partially_met",
  "not_met",
  "unknown",
  "not_applicable",
]);

export const readinessFindingRiskEnum = pgEnum("readiness_finding_risk", [
  "critical",
  "high",
  "medium",
  "low",
  "informational",
]);

export const readinessAssessmentsTable = pgTable("readiness_assessments", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id")
    .notNull()
    .references(() => organizationsTable.id, { onDelete: "cascade" }),
  assessmentType: readinessAssessmentTypeEnum("assessment_type")
    .notNull()
    .default("full_control"),
  name: text("name").notNull(),
  targetLevel: text("target_level").notNull().default("L2"),
  assessorName: text("assessor_name").notNull().default(""),
  systemName: text("system_name").notNull().default(""),
  environmentType: text("environment_type").notNull().default(""),
  assessmentDate: text("assessment_date").notNull(),
  primaryTools: text("primary_tools").notNull().default(""),
  cuiStoredProcessed: boolean("cui_stored_processed").notNull().default(false),
  usesMicrosoft365: boolean("uses_microsoft365").notNull().default(false),
  endpointsManaged: boolean("endpoints_managed").notNull().default(false),
  mfaEnforced: boolean("mfa_enforced").notNull().default(false),
  policiesExist: boolean("policies_exist").notNull().default(false),
  sspExists: boolean("ssp_exists").notNull().default(false),
  poamExists: boolean("poam_exists").notNull().default(false),
  evidenceExists: boolean("evidence_exists").notNull().default(false),
  status: readinessAssessmentStatusEnum("status").notNull().default("setup"),
  projectedScore: integer("projected_score"),
  maxScore: integer("max_score").default(110),
  confidenceScore: integer("confidence_score"),
  notes: text("notes"),
  completedAt: timestamp("completed_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
  createdBy: text("created_by"),
});

export const assessmentScopeAnswersTable = pgTable(
  "assessment_scope_answers",
  {
    id: text("id").primaryKey(),
    assessmentId: text("assessment_id")
      .notNull()
      .references(() => readinessAssessmentsTable.id, { onDelete: "cascade" }),
    questionKey: text("question_key").notNull(),
    answer: readinessScopeAnswerEnum("answer").notNull().default("unknown"),
    notes: text("notes"),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  }
);

export const assessmentControlFindingsTable = pgTable(
  "assessment_control_findings",
  {
    id: text("id").primaryKey(),
    assessmentId: text("assessment_id")
      .notNull()
      .references(() => readinessAssessmentsTable.id, { onDelete: "cascade" }),
    controlId: text("control_id")
      .notNull()
      .references(() => controlsTable.id, { onDelete: "cascade" }),
    result: readinessFindingResultEnum("result").notNull().default("unknown"),
    notes: text("notes"),
    evidenceExists: boolean("evidence_exists").notNull().default(false),
    evidenceApproved: boolean("evidence_approved").notNull().default(false),
    policyExists: boolean("policy_exists").notNull().default(false),
    procedureExists: boolean("procedure_exists").notNull().default(false),
    sspNarrativeExists: boolean("ssp_narrative_exists")
      .notNull()
      .default(false),
    testCompleted: boolean("test_completed").notNull().default(false),
    findingTitle: text("finding_title"),
    gapDescription: text("gap_description"),
    riskLevel: readinessFindingRiskEnum("risk_level"),
    recommendedRemediation: text("recommended_remediation"),
    ownerName: text("owner_name"),
    targetDate: text("target_date"),
    poamCreated: boolean("poam_created").notNull().default(false),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  }
);
