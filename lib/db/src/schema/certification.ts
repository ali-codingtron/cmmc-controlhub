import {
  pgTable,
  text,
  timestamp,
  boolean,
  integer,
  jsonb,
} from "drizzle-orm/pg-core";
import { organizationsTable } from "./organizations";
import { usersTable } from "./users";

export const CERTIFICATION_MODULE_STATES = [
  "NOT_AVAILABLE",
  "VERIFICATION_PENDING",
  "CONDITIONAL_L2_C3PAO",
  "FINAL_L2_C3PAO",
  "EXPIRED",
  "SUSPENDED",
  "INVALIDATED",
  "ARCHIVED",
] as const;

export type CertificationModuleState = (typeof CERTIFICATION_MODULE_STATES)[number];

export const VISIBLE_CERTIFICATION_STATES: CertificationModuleState[] = [
  "CONDITIONAL_L2_C3PAO",
  "FINAL_L2_C3PAO",
  "EXPIRED",
  "SUSPENDED",
  "INVALIDATED",
];

export const certificationRecordsTable = pgTable("certification_records", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id")
    .notNull()
    .references(() => organizationsTable.id, { onDelete: "cascade" }),
  certificationStatus: text("certification_status").notNull(),

  cmmcUid: text("cmmc_uid").notNull(),
  assessmentLevel: text("assessment_level").notNull(),
  c3paoName: text("c3pao_name").notNull(),
  cmmcStatusDate: timestamp("cmmc_status_date").notNull(),
  assessmentStartDate: timestamp("assessment_start_date").notNull(),
  assessmentCompletionDate: timestamp("assessment_completion_date").notNull(),
  assessmentUniqueId: text("assessment_unique_id").notNull(),
  cageCodes: text("cage_codes").array().notNull().default([]),
  assessmentScopeName: text("assessment_scope_name").notNull(),
  sspTitle: text("ssp_title").notNull(),
  sspVersion: text("ssp_version").notNull(),
  sspDate: timestamp("ssp_date").notNull(),
  affirmingOfficial: text("affirming_official").notNull(),
  internalCertificationOwner: text("internal_certification_owner").notNull(),

  assessorNames: text("assessor_names").array().default([]),
  assessorContactInfo: text("assessor_contact_info"),
  contractReferences: text("contract_references").array().default([]),
  notes: text("notes"),

  moduleState: text("module_state").notNull().default("VERIFICATION_PENDING"),

  submittedById: text("submitted_by_id").references(() => usersTable.id, {
    onDelete: "set null",
  }),
  submittedAt: timestamp("submitted_at").notNull().defaultNow(),

  verifiedById: text("verified_by_id").references(() => usersTable.id, {
    onDelete: "set null",
  }),
  verifiedAt: timestamp("verified_at"),
  verificationNotes: text("verification_notes"),

  rejectedById: text("rejected_by_id").references(() => usersTable.id, {
    onDelete: "set null",
  }),
  rejectedAt: timestamp("rejected_at"),
  rejectionReason: text("rejection_reason"),

  adminOverrideById: text("admin_override_by_id").references(
    () => usersTable.id,
    { onDelete: "set null" }
  ),
  adminOverrideJustification: text("admin_override_justification"),

  statusValidThrough: timestamp("status_valid_through"),
  nextAffirmationDue: timestamp("next_affirmation_due"),
  closeoutDeadline: timestamp("closeout_deadline"),

  isActive: boolean("is_active").notNull().default(true),
  isArchived: boolean("is_archived").notNull().default(false),

  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const certificationOfficialRecordsTable = pgTable(
  "certification_official_records",
  {
    id: text("id").primaryKey(),
    certificationRecordId: text("certification_record_id")
      .notNull()
      .references(() => certificationRecordsTable.id, { onDelete: "cascade" }),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizationsTable.id, { onDelete: "cascade" }),

    title: text("title").notNull(),
    recordType: text("record_type").notNull(),
    status: text("status").notNull().default("active"),
    effectiveDate: timestamp("effective_date"),
    description: text("description"),
    confidentialityClassification: text(
      "confidentiality_classification"
    ).default("controlled"),
    isRequired: boolean("is_required").notNull().default(false),

    fileKey: text("file_key"),
    fileName: text("file_name"),
    fileMimeType: text("file_mime_type"),
    fileSizeBytes: integer("file_size_bytes"),
    fileChecksum: text("file_checksum"),

    uploadedById: text("uploaded_by_id").references(() => usersTable.id, {
      onDelete: "set null",
    }),
    uploadedAt: timestamp("uploaded_at").notNull().defaultNow(),
    archivedById: text("archived_by_id").references(() => usersTable.id, {
      onDelete: "set null",
    }),
    archivedAt: timestamp("archived_at"),

    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  }
);

export const certificationScopeSnapshotsTable = pgTable(
  "certification_scope_snapshots",
  {
    id: text("id").primaryKey(),
    certificationRecordId: text("certification_record_id")
      .notNull()
      .references(() => certificationRecordsTable.id, { onDelete: "cascade" }),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizationsTable.id, { onDelete: "cascade" }),

    scopeName: text("scope_name").notNull(),
    cageCodes: text("cage_codes").array().notNull().default([]),
    locations: jsonb("locations").$type<string[]>().default([]),
    cuiAssets: jsonb("cui_assets").$type<string[]>().default([]),
    securityProtectionAssets: jsonb("security_protection_assets")
      .$type<string[]>()
      .default([]),
    contractorRiskManagedAssets: jsonb("contractor_risk_managed_assets")
      .$type<string[]>()
      .default([]),
    specializedAssets: jsonb("specialized_assets")
      .$type<string[]>()
      .default([]),
    externalServiceProviders: jsonb("external_service_providers")
      .$type<string[]>()
      .default([]),

    networkDiagramFileKey: text("network_diagram_file_key"),
    cuiDataFlowDiagramFileKey: text("cui_data_flow_diagram_file_key"),
    sspVersion: text("ssp_version"),
    scopeApprovalDate: timestamp("scope_approval_date"),
    scopeNotes: text("scope_notes"),

    createdById: text("created_by_id").references(() => usersTable.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  }
);

export const certificationAffirmationsTable = pgTable(
  "certification_affirmations",
  {
    id: text("id").primaryKey(),
    certificationRecordId: text("certification_record_id")
      .notNull()
      .references(() => certificationRecordsTable.id, { onDelete: "cascade" }),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizationsTable.id, { onDelete: "cascade" }),

    affirmationNumber: integer("affirmation_number").notNull().default(1),
    dueDate: timestamp("due_date").notNull(),
    status: text("status").notNull().default("Not Started"),
    affirmingOfficial: text("affirming_official"),
    preparationOwnerId: text("preparation_owner_id").references(
      () => usersTable.id,
      { onDelete: "set null" }
    ),
    submittedDate: timestamp("submitted_date"),
    submissionReference: text("submission_reference"),
    notes: text("notes"),
    supportingDocumentFileKey: text("supporting_document_file_key"),
    supportingDocumentName: text("supporting_document_name"),

    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  }
);

export const certificationChangeImpactTable = pgTable(
  "certification_change_impact",
  {
    id: text("id").primaryKey(),
    certificationRecordId: text("certification_record_id")
      .notNull()
      .references(() => certificationRecordsTable.id, { onDelete: "cascade" }),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizationsTable.id, { onDelete: "cascade" }),

    changeTitle: text("change_title").notNull(),
    changeDate: timestamp("change_date").notNull(),
    description: text("description").notNull(),
    systemServiceAffected: text("system_service_affected"),
    scopeImpact: text("scope_impact"),
    cuiImpact: text("cui_impact"),
    controlsAffected: text("controls_affected").array().default([]),
    sspUpdateRequired: boolean("ssp_update_required").default(false),
    diagramUpdateRequired: boolean("diagram_update_required").default(false),
    providerEspChange: boolean("provider_esp_change").default(false),
    cageLocationChange: boolean("cage_location_change").default(false),
    reassessmentConsidered: boolean("reassessment_considered").default(false),
    externalClarificationRequired: boolean(
      "external_clarification_required"
    ).default(false),

    impactDecision: text("impact_decision"),
    decisionOwnerId: text("decision_owner_id").references(() => usersTable.id, {
      onDelete: "set null",
    }),
    approvedById: text("approved_by_id").references(() => usersTable.id, {
      onDelete: "set null",
    }),
    approvedAt: timestamp("approved_at"),
    evidenceFileKey: text("evidence_file_key"),
    notes: text("notes"),
    status: text("status").notNull().default("open"),

    createdById: text("created_by_id").references(() => usersTable.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  }
);

export const certificationPoamCloseoutTable = pgTable(
  "certification_poam_closeout",
  {
    id: text("id").primaryKey(),
    certificationRecordId: text("certification_record_id")
      .notNull()
      .references(() => certificationRecordsTable.id, { onDelete: "cascade" }),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizationsTable.id, { onDelete: "cascade" }),

    title: text("title").notNull(),
    description: text("description"),
    linkedPoamId: text("linked_poam_id"),
    ownerId: text("owner_id").references(() => usersTable.id, {
      onDelete: "set null",
    }),
    dueDate: timestamp("due_date"),
    milestone: text("milestone"),
    evidenceRequired: text("evidence_required"),
    evidenceFileKey: text("evidence_file_key"),
    notes: text("notes"),
    status: text("status").notNull().default("Open"),
    scheduledCloseoutAssessmentDate: timestamp(
      "scheduled_closeout_assessment_date"
    ),
    closeoutResult: text("closeout_result"),

    createdById: text("created_by_id").references(() => usersTable.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  }
);

export const certificationRecertificationMilestonesTable = pgTable(
  "certification_recertification_milestones",
  {
    id: text("id").primaryKey(),
    certificationRecordId: text("certification_record_id")
      .notNull()
      .references(() => certificationRecordsTable.id, { onDelete: "cascade" }),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizationsTable.id, { onDelete: "cascade" }),

    milestoneName: text("milestone_name").notNull(),
    sortOrder: integer("sort_order").notNull().default(0),
    dueDate: timestamp("due_date"),
    status: text("status").notNull().default("not_started"),
    ownerId: text("owner_id").references(() => usersTable.id, {
      onDelete: "set null",
    }),
    linkedWork: text("linked_work"),
    notes: text("notes"),
    evidenceFileKey: text("evidence_file_key"),
    completedAt: timestamp("completed_at"),

    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  }
);

export const certificationHistoryTable = pgTable("certification_history", {
  id: text("id").primaryKey(),
  certificationRecordId: text("certification_record_id")
    .notNull()
    .references(() => certificationRecordsTable.id, { onDelete: "cascade" }),
  organizationId: text("organization_id")
    .notNull()
    .references(() => organizationsTable.id, { onDelete: "cascade" }),

  eventType: text("event_type").notNull(),
  eventTitle: text("event_title").notNull(),
  description: text("description"),
  previousState: text("previous_state"),
  newState: text("new_state"),
  performedById: text("performed_by_id").references(() => usersTable.id, {
    onDelete: "set null",
  }),
  performedByName: text("performed_by_name"),
  metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}),

  occurredAt: timestamp("occurred_at").notNull().defaultNow(),
});

export type CertificationRecord = typeof certificationRecordsTable.$inferSelect;
export type CertificationOfficialRecord =
  typeof certificationOfficialRecordsTable.$inferSelect;
export type CertificationScopeSnapshot =
  typeof certificationScopeSnapshotsTable.$inferSelect;
export type CertificationAffirmation =
  typeof certificationAffirmationsTable.$inferSelect;
export type CertificationChangeImpact =
  typeof certificationChangeImpactTable.$inferSelect;
export type CertificationPoamCloseout =
  typeof certificationPoamCloseoutTable.$inferSelect;
export type CertificationRecertificationMilestone =
  typeof certificationRecertificationMilestonesTable.$inferSelect;
export type CertificationHistory =
  typeof certificationHistoryTable.$inferSelect;
