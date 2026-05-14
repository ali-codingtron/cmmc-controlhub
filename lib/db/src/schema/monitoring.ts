import {
  pgTable,
  text,
  timestamp,
  integer,
  pgEnum,
} from "drizzle-orm/pg-core";
import { organizationsTable } from "./organizations";
import { poamsTable } from "./poams";
import { usersTable } from "./users";

export const monitoringFrequencyEnum = pgEnum("monitoring_frequency", [
  "daily",
  "weekly",
  "monthly",
  "quarterly",
  "annually",
]);

export const monitoringStatusEnum = pgEnum("monitoring_status", [
  "open",
  "in_progress",
  "current",
  "failed_validation",
  "escalated",
]);

export const monitoringValidationStatusEnum = pgEnum(
  "monitoring_validation_status",
  ["pass", "fail", "pass_with_exception"]
);

export const monitoringItemsTable = pgTable("monitoring_items", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id").references(
    () => organizationsTable.id,
    { onDelete: "cascade" }
  ),
  frequency: monitoringFrequencyEnum("frequency").notNull(),
  task: text("task").notNull(),
  controlRef: text("control_ref").notNull(),
  description: text("description").notNull(),
  lastCompleted: timestamp("last_completed"),
  nextDue: timestamp("next_due"),
  status: monitoringStatusEnum("status").notNull().default("open"),
  notes: text("notes"),
  sortOrder: integer("sort_order").notNull().default(0),
  // Operational guidance fields (seeded from the operational matrix)
  operatingProcedure: text("operating_procedure"),
  testProcedure: text("test_procedure"),
  evidenceToRetain: text("evidence_to_retain"),
  // Validation workflow fields
  validationStatus: monitoringValidationStatusEnum("validation_status"),
  validationDate: timestamp("validation_date"),
  reviewerNotes: text("reviewer_notes"),
  escalationNotes: text("escalation_notes"),
  linkedPoamId: text("linked_poam_id").references(() => poamsTable.id, {
    onDelete: "set null",
  }),
  reviewedBy: text("reviewed_by").references(() => usersTable.id, {
    onDelete: "set null",
  }),
  reviewDate: timestamp("review_date"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export type MonitoringItem = typeof monitoringItemsTable.$inferSelect;
