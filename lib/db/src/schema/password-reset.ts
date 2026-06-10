import { pgTable, text, timestamp, pgEnum } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

export const passwordResetStatusEnum = pgEnum("password_reset_status", [
  "pending",
  "used",
  "expired",
  "revoked",
]);

export const passwordResetTokensTable = pgTable("password_reset_tokens", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => usersTable.id, { onDelete: "cascade" }),
  tokenHash: text("token_hash").notNull().unique(),
  status: passwordResetStatusEnum("status").notNull().default("pending"),
  expiresAt: timestamp("expires_at").notNull(),
  usedAt: timestamp("used_at"),
  requestedAt: timestamp("requested_at").notNull(),
  requestedIp: text("requested_ip"),
  requestedUserAgent: text("requested_user_agent"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export type PasswordResetToken = typeof passwordResetTokensTable.$inferSelect;
