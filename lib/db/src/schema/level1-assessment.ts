import {
  pgTable,
  text,
  boolean,
  integer,
  timestamp,
  pgEnum,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { organizationsTable } from "./organizations";
import { usersTable } from "./users";
import { complianceRequirementsTable } from "./frameworks";

// ── Enums ───────────────────────────────────────────────────────────────────

export const level1AssessmentStatusEnum = pgEnum("level1_assessment_status", [
  "draft",
  "in_progress",
  "submitted",
  "affirmed",
  "locked",
]);

export const level1FindingEnum = pgEnum("level1_finding", [
  "met",
  "not_met",
  "not_applicable",
  "not_reviewed",
]);

export const level1ObjectiveResultEnum = pgEnum("level1_objective_result", [
  "satisfied",
  "other_than_satisfied",
  "not_applicable",
  "not_reviewed",
]);

export const level1AssessmentUseEnum = pgEnum("level1_assessment_use", [
  "examine",
  "interview",
  "test",
]);

export const level1EvidenceQualificationEnum = pgEnum("level1_evidence_qualification", [
  "directly_applicable",
  "partially_applicable",
  "supplementary",
]);

// ── Level 1 Annual Assessments ───────────────────────────────────────────────

/**
 * Top-level record for a CMMC Level 1 Annual Self-Assessment.
 * One per org per year per scope (unique: org + year + scope_name).
 */
export const level1AnnualAssessmentsTable = pgTable(
  "level1_annual_assessments",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizationsTable.id, { onDelete: "cascade" }),
    assessmentYear: integer("assessment_year").notNull(),
    scopeName: text("scope_name").notNull().default("Default"),
    title: text("title").notNull(),
    description: text("description"),
    status: level1AssessmentStatusEnum("status").notNull().default("draft"),
    /** Name/title of the Senior Official who will affirm */
    affirmingOfficialName: text("affirming_official_name"),
    affirmingOfficialTitle: text("affirming_official_title"),
    affirmingOfficialId: text("affirming_official_id").references(
      () => usersTable.id,
      { onDelete: "set null" }
    ),
    affirmedAt: timestamp("affirmed_at"),
    submittedAt: timestamp("submitted_at"),
    submittedById: text("submitted_by_id").references(() => usersTable.id, {
      onDelete: "set null",
    }),
    lockedAt: timestamp("locked_at"),
    lockedById: text("locked_by_id").references(() => usersTable.id, {
      onDelete: "set null",
    }),
    /** Overall score: percentage of requirements met */
    overallScore: integer("overall_score"),
    /** JSON blob of snapshot metadata at time of affirmation */
    snapshotMetadata: text("snapshot_metadata"),
    createdById: text("created_by_id").references(() => usersTable.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("level1_annual_assessments_org_year_scope_uniq").on(
      t.organizationId,
      t.assessmentYear,
      t.scopeName
    ),
  ]
);

// ── Level 1 Assessment Requirements ─────────────────────────────────────────

/**
 * Per-requirement finding within a Level 1 Annual Assessment.
 * One row per CMMC L1 practice per assessment.
 */
export const level1AssessmentRequirementsTable = pgTable(
  "level1_assessment_requirements",
  {
    id: text("id").primaryKey(),
    assessmentId: text("assessment_id")
      .notNull()
      .references(() => level1AnnualAssessmentsTable.id, { onDelete: "cascade" }),
    /** Stable control ID, e.g. "AC.L1-3.1.1" */
    requirementId: text("requirement_id").notNull(),
    /** Canonical key, e.g. "L1-AC-1" */
    canonicalKey: text("canonical_key"),
    /** Human-readable title at time of assessment */
    requirementTitle: text("requirement_title"),
    finding: level1FindingEnum("finding").notNull().default("not_reviewed"),
    implementationNarrative: text("implementation_narrative"),
    assessorNotes: text("assessor_notes"),
    naJustification: text("na_justification"),
    lastUpdatedById: text("last_updated_by_id").references(() => usersTable.id, {
      onDelete: "set null",
    }),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("level1_assessment_requirements_assessment_req_uniq").on(
      t.assessmentId,
      t.requirementId
    ),
  ]
);

// ── Level 1 Assessment Objectives ───────────────────────────────────────────

/**
 * Detailed determination objectives within a Level 1 assessment requirement.
 * Supports NIST-style "Examine / Interview / Test" objective decomposition.
 */
export const level1AssessmentObjectivesTable = pgTable(
  "level1_assessment_objectives",
  {
    id: text("id").primaryKey(),
    assessmentRequirementId: text("assessment_requirement_id")
      .notNull()
      .references(() => level1AssessmentRequirementsTable.id, {
        onDelete: "cascade",
      }),
    objectiveText: text("objective_text").notNull(),
    result: level1ObjectiveResultEnum("result").notNull().default("not_reviewed"),
    notes: text("notes"),
    sortOrder: integer("sort_order").notNull().default(0),
    lastUpdatedById: text("last_updated_by_id").references(() => usersTable.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  }
);

// ── Level 1 Assessment Evidence Links ───────────────────────────────────────

/**
 * Evidence items linked to a Level 1 assessment (at the assessment or requirement level).
 */
export const level1AssessmentEvidenceLinksTable = pgTable(
  "level1_assessment_evidence_links",
  {
    id: text("id").primaryKey(),
    assessmentId: text("assessment_id")
      .notNull()
      .references(() => level1AnnualAssessmentsTable.id, { onDelete: "cascade" }),
    /** Nullable — evidence can be linked at the assessment level or requirement level */
    assessmentRequirementId: text("assessment_requirement_id").references(
      () => level1AssessmentRequirementsTable.id,
      { onDelete: "cascade" }
    ),
    /** External evidence item ID (from evidence_items table) — nullable for ad-hoc descriptions */
    evidenceItemId: text("evidence_item_id"),
    evidenceDescription: text("evidence_description"),
    /** How this evidence is used in the assessment */
    assessmentUse: level1AssessmentUseEnum("assessment_use").notNull().default("examine"),
    /** How applicable this evidence is to the requirement */
    qualification: level1EvidenceQualificationEnum("qualification")
      .notNull()
      .default("directly_applicable"),
    fileKey: text("file_key"),
    fileName: text("file_name"),
    notes: text("notes"),
    linkedById: text("linked_by_id").references(() => usersTable.id, {
      onDelete: "set null",
    }),
    linkedAt: timestamp("linked_at").notNull().defaultNow(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  }
);

// ── Exported Types ───────────────────────────────────────────────────────────

export type Level1AnnualAssessment = typeof level1AnnualAssessmentsTable.$inferSelect;
export type Level1AssessmentRequirement = typeof level1AssessmentRequirementsTable.$inferSelect;
export type Level1AssessmentObjective = typeof level1AssessmentObjectivesTable.$inferSelect;
export type Level1AssessmentEvidenceLink = typeof level1AssessmentEvidenceLinksTable.$inferSelect;
