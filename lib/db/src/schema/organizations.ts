import {
  pgTable,
  text,
  boolean,
  timestamp,
  pgEnum,
  unique,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";

export const orgUserRoleEnum = pgEnum("org_user_role", [
  "global_admin",
  "org_admin",
  "compliance_manager",
  "it_contributor",
  "reviewer",
  "executive_viewer",
  "assessor",
]);

export const orgUserStatusEnum = pgEnum("org_user_status", [
  "active",
  "invited",
  "suspended",
]);

export const cmmcTargetLevelEnum = pgEnum("cmmc_target_level", [
  "L1",
  "L2",
  "L3",
]);

export const organizationsTable = pgTable("organizations", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  legalName: text("legal_name"),
  shortName: text("short_name"),
  cageCode: text("cage_code"),
  uei: text("uei"),
  industry: text("industry"),
  primaryContact: text("primary_contact"),
  complianceManagerId: text("compliance_manager_id").references(
    () => usersTable.id,
    { onDelete: "set null" }
  ),
  organizationAddress: text("organization_address"),
  assessmentScope: text("assessment_scope"),
  systemName: text("system_name"),
  systemOwner: text("system_owner"),
  securityOfficer: text("security_officer"),
  itAdministrator: text("it_administrator"),
  defaultClassification: text("default_classification"),
  documentNumberPrefix: text("document_number_prefix"),
  cmmcTargetLevel: cmmcTargetLevelEnum("cmmc_target_level")
    .notNull()
    .default("L2"),
  notes: text("notes"),
  certificationModuleState: text("certification_module_state")
    .notNull()
    .default("NOT_AVAILABLE"),
  isTestOrganization: boolean("is_test_organization").notNull().default(false),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const organizationUsersTable = pgTable("organization_users", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id")
    .notNull()
    .references(() => organizationsTable.id, { onDelete: "cascade" }),
  userId: text("user_id")
    .notNull()
    .references(() => usersTable.id, { onDelete: "cascade" }),
  role: orgUserRoleEnum("role").notNull().default("it_contributor"),
  status: orgUserStatusEnum("status").notNull().default("active"),
  invitedAt: timestamp("invited_at"),
  joinedAt: timestamp("joined_at").defaultNow(),
});

export const orgFeatureKeyEnum = pgEnum("org_feature_key", [
  "IMPLEMENTATION_ROADMAP",
  "PRE_ASSESSMENT",
  "L1_ANNUAL_ASSESSMENT",
  "FRAMEWORK_CROSSWALK",
  "DFARS_OBLIGATIONS",
]);

export const organizationFeaturesTable = pgTable(
  "organization_features",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizationsTable.id, { onDelete: "cascade" }),
    featureKey: orgFeatureKeyEnum("feature_key").notNull(),
    enabled: boolean("enabled").notNull().default(true),
    initialized: boolean("initialized").notNull().default(false),
    enabledBy: text("enabled_by").references(() => usersTable.id, {
      onDelete: "set null",
    }),
    enabledAt: timestamp("enabled_at"),
    disabledBy: text("disabled_by").references(() => usersTable.id, {
      onDelete: "set null",
    }),
    disabledAt: timestamp("disabled_at"),
    changeReason: text("change_reason"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [unique("uq_org_feature").on(t.organizationId, t.featureKey)]
);

export const insertOrganizationSchema = createInsertSchema(
  organizationsTable
).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertOrganization = z.infer<typeof insertOrganizationSchema>;
export type Organization = typeof organizationsTable.$inferSelect;
export type OrganizationUser = typeof organizationUsersTable.$inferSelect;
