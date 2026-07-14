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

// ── Enums ───────────────────────────────────────────────────────────────────

export const frameworkStatusEnum = pgEnum("framework_status", [
  "active",
  "draft",
  "deprecated",
]);

export const packageTypeEnum = pgEnum("package_type", [
  "control_framework",
  "assessment_procedure",
  "contract_clause",
  "evidence_package",
  "custom",
]);

export const packageStatusEnum = pgEnum("package_status", [
  "active",
  "draft",
  "deprecated",
  "archived",
]);

export const crosswalkRelationshipEnum = pgEnum("crosswalk_relationship", [
  "equivalent",
  "maps_to",
  "partially_maps_to",
  "replaces",
  "replaced_by",
  "supports",
  "supported_by",
  "derived_from",
]);

// ── Compliance Frameworks ────────────────────────────────────────────────────

/** Top-level framework families: CMMC, NIST SP 800-171, DFARS, FAR, etc. */
export const complianceFrameworksTable = pgTable("compliance_frameworks", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  shortName: text("short_name").notNull(),
  description: text("description"),
  issuingBody: text("issuing_body"),
  status: frameworkStatusEnum("status").notNull().default("active"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// ── Compliance Packages ──────────────────────────────────────────────────────

/** Versioned packages within a framework, e.g. CMMC L2 Self-Assessment, NIST 800-171 Rev. 2 */
export const compliancePackagesTable = pgTable("compliance_packages", {
  id: text("id").primaryKey(),
  frameworkId: text("framework_id")
    .notNull()
    .references(() => complianceFrameworksTable.id),
  packageKey: text("package_key").notNull().unique(),
  name: text("name").notNull(),
  version: text("version"),
  description: text("description"),
  packageType: packageTypeEnum("package_type").notNull().default("control_framework"),
  status: packageStatusEnum("status").notNull().default("active"),
  effectiveDate: text("effective_date"),
  sourceReference: text("source_reference"),
  controlCount: integer("control_count").notNull().default(0),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// ── Organization → Package Assignments ──────────────────────────────────────

/** Which compliance packages an organization has selected */
export const organizationPackagesTable = pgTable("organization_packages", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id")
    .notNull()
    .references(() => organizationsTable.id, { onDelete: "cascade" }),
  packageId: text("package_id")
    .notNull()
    .references(() => compliancePackagesTable.id),
  isActive: boolean("is_active").notNull().default(true),
  selectedById: text("selected_by_id").references(() => usersTable.id, {
    onDelete: "set null",
  }),
  selectedAt: timestamp("selected_at").notNull().defaultNow(),
  notes: text("notes"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// ── Compliance Requirements (metadata only — no full text yet) ───────────────

/** Individual requirements/controls within a package */
export const complianceRequirementsTable = pgTable("compliance_requirements", {
  id: text("id").primaryKey(),
  packageId: text("package_id")
    .notNull()
    .references(() => compliancePackagesTable.id),
  requirementId: text("requirement_id").notNull(),
  familyCode: text("family_code"),
  familyName: text("family_name"),
  title: text("title").notNull(),
  requirementText: text("requirement_text"),
  discussion: text("discussion"),
  level: text("level"),
  sortOrder: integer("sort_order").notNull().default(0),
  isActive: boolean("is_active").notNull().default(true),
  sourceReference: text("source_reference"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// ── Requirement Crosswalk ────────────────────────────────────────────────────

/** Maps requirements across frameworks/packages (e.g. CMMC L2 ↔ NIST 800-171 Rev. 2) */
export const requirementCrosswalkTable = pgTable("requirement_crosswalk", {
  id: text("id").primaryKey(),
  sourceRequirementId: text("source_requirement_id")
    .notNull()
    .references(() => complianceRequirementsTable.id, { onDelete: "cascade" }),
  targetRequirementId: text("target_requirement_id")
    .notNull()
    .references(() => complianceRequirementsTable.id, { onDelete: "cascade" }),
  relationshipType: crosswalkRelationshipEnum("relationship_type").notNull(),
  notes: text("notes"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// ── DFARS Obligations ────────────────────────────────────────────────────────

/** Contract obligation areas seeded per DFARS clause package */
export const dfarsObligationsTable = pgTable("dfars_obligations", {
  id: text("id").primaryKey(),
  packageId: text("package_id")
    .notNull()
    .references(() => compliancePackagesTable.id),
  clauseNumber: text("clause_number").notNull(),
  obligationTitle: text("obligation_title").notNull(),
  obligationDescription: text("obligation_description"),
  requiredArtifacts: text("required_artifacts"),  // JSON: string[]
  requiredProcess: text("required_process"),
  applicableTo: text("applicable_to"),
  flowdownRequired: boolean("flowdown_required").notNull().default(false),
  incidentReportingRequired: boolean("incident_reporting_required").notNull().default(false),
  assessmentRequired: boolean("assessment_required").notNull().default(false),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// ── DFARS Obligation Tracking (org-scoped status & ownership) ────────────────

/** Per-org status tracking for DFARS obligations */
export const dfarsObligationStatusTable = pgTable(
  "dfars_obligation_status",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizationsTable.id, { onDelete: "cascade" }),
    obligationId: text("obligation_id")
      .notNull()
      .references(() => dfarsObligationsTable.id, { onDelete: "cascade" }),
    status: text("status").notNull().default("pending"),
    owner: text("owner"),
    notes: text("notes"),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [uniqueIndex("dfars_obligation_status_uniq").on(t.organizationId, t.obligationId)]
);

// ── Exported Types ───────────────────────────────────────────────────────────

export type ComplianceFramework = typeof complianceFrameworksTable.$inferSelect;
export type CompliancePackage = typeof compliancePackagesTable.$inferSelect;
export type OrganizationPackage = typeof organizationPackagesTable.$inferSelect;
export type ComplianceRequirement = typeof complianceRequirementsTable.$inferSelect;
export type RequirementCrosswalk = typeof requirementCrosswalkTable.$inferSelect;
export type DfarsObligation = typeof dfarsObligationsTable.$inferSelect;
export type DfarsObligationStatus = typeof dfarsObligationStatusTable.$inferSelect;
