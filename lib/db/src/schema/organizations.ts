import {
  pgTable,
  text,
  boolean,
  timestamp,
  pgEnum,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
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
  cmmcTargetLevel: cmmcTargetLevelEnum("cmmc_target_level")
    .notNull()
    .default("L2"),
  notes: text("notes"),
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
