import {
  pgTable,
  text,
  timestamp,
  json,
  pgEnum,
} from "drizzle-orm/pg-core";
import { usersTable } from "./users";
import { organizationsTable } from "./organizations";

export const auditActionEnum = pgEnum("audit_action", [
  "created",
  "updated",
  "deleted",
  "approved",
  "rejected",
  "submitted",
  "reviewed",
  "assigned",
  "uploaded",
  "downloaded",
  "exported",
  "status_changed",
  "comment_added",
  "link_added",
  "link_removed",
  "logged_in",
  "logged_out",
  "completed",
  "closed",
  "superseded",
  "marked_stale",
  "reopened",
]);

export const auditLogsTable = pgTable("audit_logs", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id").references(
    () => organizationsTable.id,
    { onDelete: "set null" }
  ),
  userId: text("user_id").references(() => usersTable.id),
  userName: text("user_name"),
  action: auditActionEnum("action").notNull(),
  entityType: text("entity_type").notNull(),
  entityId: text("entity_id").notNull(),
  entityLabel: text("entity_label"),
  previousValue: json("previous_value"),
  newValue: json("new_value"),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  timestamp: timestamp("timestamp").notNull().defaultNow(),
});

export type AuditLog = typeof auditLogsTable.$inferSelect;
