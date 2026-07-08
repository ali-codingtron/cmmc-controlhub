import {
  pgTable,
  text,
  timestamp,
  pgEnum,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";
import { controlsTable } from "./controls";
import { organizationsTable } from "./organizations";

export const poamStatusEnum = pgEnum("poam_status", [
  "open",
  "in_progress",
  "waiting_on_vendor",
  "mitigated",
  "accepted_risk",
  "closed",
]);

export const riskLevelEnum = pgEnum("risk_level", [
  "critical",
  "high",
  "medium",
  "low",
]);

export const poamsTable = pgTable("poams", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id").references(
    () => organizationsTable.id,
    { onDelete: "cascade" }
  ),
  poamNumber: text("poam_number"),
  title: text("title").notNull(),
  deficiencyDescription: text("deficiency_description").notNull(),
  status: poamStatusEnum("status").notNull().default("open"),
  riskLevel: riskLevelEnum("risk_level").notNull().default("medium"),
  linkedControlId: text("linked_control_id").references(
    () => controlsTable.id
  ),
  ownerId: text("owner_id").references(() => usersTable.id),
  scheduledCompletionDate: timestamp("scheduled_completion_date"),
  completedDate: timestamp("completed_date"),
  remediationPlan: text("remediation_plan"),
  resourcesRequired: text("resources_required"),
  notes: text("notes"),
  resolutionSummary: text("resolution_summary"),
  originatingAssessment: text("originating_assessment"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertPoamSchema = createInsertSchema(poamsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertPoam = z.infer<typeof insertPoamSchema>;
export type Poam = typeof poamsTable.$inferSelect;
