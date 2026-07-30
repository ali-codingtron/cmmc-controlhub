import {
  pgTable,
  text,
  boolean,
  timestamp,
  pgEnum,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";
import { controlsTable } from "./controls";
import { organizationsTable } from "./organizations";

export const taskStatusEnum = pgEnum("task_status", [
  "open",
  "in_progress",
  "blocked",
  "closed",
  "completed",
  "overdue",
  "cancelled",
  "deferred",
]);

export const taskPriorityEnum = pgEnum("task_priority", [
  "critical",
  "high",
  "medium",
  "low",
]);

export const taskTypeEnum = pgEnum("task_type", [
  "access_review",
  "policy_review",
  "procedure_review",
  "log_review",
  "backup_review",
  "incident_review",
  "training_review",
  "evidence_refresh",
  "control_review",
  "poam_followup",
  "general",
]);

export const taskRecurrenceEnum = pgEnum("task_recurrence", [
  "daily",
  "weekly",
  "monthly",
  "quarterly",
  "semi_annually",
  "annually",
]);

export const tasksTable = pgTable("tasks", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id").references(
    () => organizationsTable.id,
    { onDelete: "cascade" }
  ),
  title: text("title").notNull(),
  description: text("description"),
  status: taskStatusEnum("status").notNull().default("open"),
  priority: taskPriorityEnum("priority").notNull().default("medium"),
  taskType: taskTypeEnum("task_type").notNull().default("general"),
  dueDate: timestamp("due_date"),
  completedAt: timestamp("completed_at"),
  completionNotes: text("completion_notes"),
  isRecurring: boolean("is_recurring").notNull().default(false),
  recurrence: taskRecurrenceEnum("recurrence"),
  nextDueDate: timestamp("next_due_date"),
  parentTaskId: text("parent_task_id"),
  tags: text("tags").array().notNull().default([]),
  assigneeId: text("assignee_id").references(() => usersTable.id),
  createdById: text("created_by_id")
    .notNull()
    .references(() => usersTable.id),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),

  // Task lifecycle tracking
  taskNumber: text("task_number"),
  startDate: timestamp("start_date"),
  closedDate: timestamp("closed_date"),
  closureSummary: text("closure_summary"),
  closedByUserId: text("closed_by_user_id").references(() => usersTable.id),
  blockedReason: text("blocked_reason"),
  blockedByUserId: text("blocked_by_user_id").references(() => usersTable.id),
  blockedAt: timestamp("blocked_at"),
  reopenedByUserId: text("reopened_by_user_id").references(() => usersTable.id),
  reopenedAt: timestamp("reopened_at"),
  reopenReason: text("reopen_reason"),
  cancelledByUserId: text("cancelled_by_user_id").references(() => usersTable.id),
  cancelledAt: timestamp("cancelled_at"),
  cancellationReason: text("cancellation_reason"),
  updatedByUserId: text("updated_by_user_id").references(() => usersTable.id),
});

export const taskControlLinksTable = pgTable("task_control_links", {
  id: text("id").primaryKey(),
  taskId: text("task_id")
    .notNull()
    .references(() => tasksTable.id, { onDelete: "cascade" }),
  controlId: text("control_id")
    .notNull()
    .references(() => controlsTable.id),
  linkedAt: timestamp("linked_at").notNull().defaultNow(),
});

export const taskActivitiesTable = pgTable("task_activities", {
  id: text("id").primaryKey(),
  taskId: text("task_id")
    .notNull()
    .references(() => tasksTable.id, { onDelete: "cascade" }),
  organizationId: text("organization_id"),
  actingUserId: text("acting_user_id").references(() => usersTable.id),
  actingUserName: text("acting_user_name"),
  action: text("action").notNull(),
  field: text("field"),
  previousValue: text("previous_value"),
  newValue: text("new_value"),
  note: text("note"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertTaskSchema = createInsertSchema(tasksTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertTask = z.infer<typeof insertTaskSchema>;
export type Task = typeof tasksTable.$inferSelect;
export type TaskActivity = typeof taskActivitiesTable.$inferSelect;
