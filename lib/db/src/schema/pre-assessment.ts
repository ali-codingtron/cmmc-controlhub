import {
  pgTable,
  text,
  timestamp,
  integer,
  jsonb,
  pgEnum,
} from "drizzle-orm/pg-core";
import { organizationsTable } from "./organizations";

export const paConnectionStatusEnum = pgEnum("pa_connection_status", [
  "pending",
  "connected",
  "error",
  "disconnected",
]);

export const paAuthModeEnum = pgEnum("pa_auth_mode", [
  "app_only",
  "delegated",
]);

export const paScanStatusEnum = pgEnum("pa_scan_status", [
  "not_started",
  "running",
  "completed",
  "completed_with_warnings",
  "failed",
]);

export const paFindingSeverityEnum = pgEnum("pa_finding_severity", [
  "critical",
  "high",
  "medium",
  "low",
  "informational",
]);

export const paFindingResultEnum = pgEnum("pa_finding_result", [
  "pass",
  "fail",
  "partial",
  "unknown",
  "not_applicable",
]);

export const paEvidenceStatusEnum = pgEnum("pa_evidence_status", [
  "draft",
  "pending_review",
  "approved",
  "rejected",
]);

export const paEvidenceRequestStatusEnum = pgEnum(
  "pa_evidence_request_status",
  ["open", "submitted", "closed"]
);

export const tenantConnectionsTable = pgTable("pa_tenant_connections", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id")
    .notNull()
    .references(() => organizationsTable.id, { onDelete: "cascade" }),
  tenantName: text("tenant_name").notNull(),
  microsoftTenantId: text("microsoft_tenant_id").notNull(),
  primaryDomain: text("primary_domain"),
  authMode: paAuthModeEnum("auth_mode").notNull().default("app_only"),
  clientId: text("client_id"),
  encryptedClientSecret: text("encrypted_client_secret"),
  connectionStatus: paConnectionStatusEnum("connection_status")
    .notNull()
    .default("pending"),
  permissionsGranted: jsonb("permissions_granted")
    .$type<string[]>()
    .default([]),
  lastSuccessfulScan: timestamp("last_successful_scan"),
  lastFailedScan: timestamp("last_failed_scan"),
  lastFailedReason: text("last_failed_reason"),
  connectedBy: text("connected_by"),
  connectedAt: timestamp("connected_at"),
  notes: text("notes"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const paScanRunsTable = pgTable("pa_scan_runs", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id")
    .notNull()
    .references(() => organizationsTable.id, { onDelete: "cascade" }),
  tenantConnectionId: text("tenant_connection_id").references(
    () => tenantConnectionsTable.id,
    { onDelete: "set null" }
  ),
  scanName: text("scan_name").notNull(),
  scanType: text("scan_type").notNull().default("full"),
  status: paScanStatusEnum("status").notNull().default("not_started"),
  packsRequested: jsonb("packs_requested").$type<string[]>().default([]),
  packsCompleted: jsonb("packs_completed").$type<string[]>().default([]),
  packsFailed: jsonb("packs_failed").$type<string[]>().default([]),
  permissionsUsed: jsonb("permissions_used").$type<string[]>().default([]),
  startedAt: timestamp("started_at"),
  completedAt: timestamp("completed_at"),
  totalChecks: integer("total_checks").default(0),
  passedChecks: integer("passed_checks").default(0),
  failedChecks: integer("failed_checks").default(0),
  warnings: integer("warnings").default(0),
  unknowns: integer("unknowns").default(0),
  generatedEvidenceCount: integer("generated_evidence_count").default(0),
  generatedFindingCount: integer("generated_finding_count").default(0),
  generatedEvidenceRequestCount: integer(
    "generated_evidence_request_count"
  ).default(0),
  errorMessage: text("error_message"),
  createdBy: text("created_by"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const paScanSnapshotsTable = pgTable("pa_scan_snapshots", {
  id: text("id").primaryKey(),
  scanRunId: text("scan_run_id")
    .notNull()
    .references(() => paScanRunsTable.id, { onDelete: "cascade" }),
  organizationId: text("organization_id")
    .notNull()
    .references(() => organizationsTable.id, { onDelete: "cascade" }),
  packId: text("pack_id").notNull(),
  dataType: text("data_type").notNull(),
  rawData: jsonb("raw_data"),
  summary: jsonb("summary"),
  collectedAt: timestamp("collected_at").notNull().defaultNow(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const paFindingsTable = pgTable("pa_findings", {
  id: text("id").primaryKey(),
  scanRunId: text("scan_run_id")
    .notNull()
    .references(() => paScanRunsTable.id, { onDelete: "cascade" }),
  organizationId: text("organization_id")
    .notNull()
    .references(() => organizationsTable.id, { onDelete: "cascade" }),
  ruleId: text("rule_id").notNull(),
  ruleName: text("rule_name").notNull(),
  title: text("title").notNull(),
  severity: paFindingSeverityEnum("severity").notNull(),
  result: paFindingResultEnum("result").notNull(),
  packId: text("pack_id").notNull(),
  observedCondition: text("observed_condition"),
  expectedCondition: text("expected_condition"),
  affectedCount: integer("affected_count").default(0),
  affectedItems: jsonb("affected_items").$type<unknown[]>().default([]),
  linkedControlIds: text("linked_control_ids").array().notNull().default([]),
  evidenceSource: text("evidence_source"),
  recommendedRemediation: text("recommended_remediation"),
  suggestedRoadmapAction: text("suggested_roadmap_action"),
  approvedStatus: text("approved_status"),
  approvedBy: text("approved_by"),
  approvedAt: timestamp("approved_at"),
  rejectedBy: text("rejected_by"),
  rejectedAt: timestamp("rejected_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const paEvidenceRecordsTable = pgTable("pa_evidence_records", {
  id: text("id").primaryKey(),
  scanRunId: text("scan_run_id")
    .notNull()
    .references(() => paScanRunsTable.id, { onDelete: "cascade" }),
  organizationId: text("organization_id")
    .notNull()
    .references(() => organizationsTable.id, { onDelete: "cascade" }),
  packId: text("pack_id").notNull(),
  title: text("title").notNull(),
  description: text("description"),
  evidenceType: text("evidence_type")
    .notNull()
    .default("Tenant Assessment Snapshot"),
  source: text("source").notNull().default("Microsoft Graph"),
  collectedAt: timestamp("collected_at").notNull().defaultNow(),
  dataJson: jsonb("data_json"),
  linkedControlIds: text("linked_control_ids").array().notNull().default([]),
  status: paEvidenceStatusEnum("status").notNull().default("draft"),
  assessorSummary: text("assessor_summary"),
  reviewedBy: text("reviewed_by"),
  reviewedAt: timestamp("reviewed_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const paEvidenceRequestsTable = pgTable("pa_evidence_requests", {
  id: text("id").primaryKey(),
  scanRunId: text("scan_run_id").references(() => paScanRunsTable.id, {
    onDelete: "set null",
  }),
  organizationId: text("organization_id")
    .notNull()
    .references(() => organizationsTable.id, { onDelete: "cascade" }),
  findingId: text("finding_id").references(() => paFindingsTable.id, {
    onDelete: "set null",
  }),
  title: text("title").notNull(),
  instructions: text("instructions"),
  suggestedFilename: text("suggested_filename"),
  linkedControlIds: text("linked_control_ids").array().notNull().default([]),
  dueDate: timestamp("due_date"),
  ownerEmail: text("owner_email"),
  status: paEvidenceRequestStatusEnum("status").notNull().default("open"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const paRoadmapActionsTable = pgTable("pa_roadmap_actions", {
  id: text("id").primaryKey(),
  scanRunId: text("scan_run_id").references(() => paScanRunsTable.id, {
    onDelete: "set null",
  }),
  organizationId: text("organization_id")
    .notNull()
    .references(() => organizationsTable.id, { onDelete: "cascade" }),
  category: text("category").notNull(),
  title: text("title").notNull(),
  description: text("description"),
  priority: integer("priority").notNull().default(3),
  drivingFindings: text("driving_findings").array().default([]),
  linkedControlIds: text("linked_control_ids").array().notNull().default([]),
  status: text("status").notNull().default("open"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});
