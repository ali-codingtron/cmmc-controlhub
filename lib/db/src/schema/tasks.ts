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
import { controlsTable } from "./controls";
import { organizationsTable } from "./organizations";

export const taskStatusEnum = pgEnum("task_status", [
  "open",
  "in_progress",
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

export const insertTaskSchema = createInsertSchema(tasksTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertTask = z.infer<typeof insertTaskSchema>;
export type Task = typeof tasksTable.$inferSelect;
