import { pgTable, text, timestamp, pgEnum } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

export const invitationStatusEnum = pgEnum("invitation_status", [
  "pending",
  "accepted",
  "expired",
  "cancelled",
  "revoked",
]);

export const userInvitationsTable = pgTable("user_invitations", {
  id: text("id").primaryKey(),
  tokenHash: text("token_hash").notNull().unique(),
  userId: text("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  invitedById: text("invited_by_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  email: text("email"),
  status: invitationStatusEnum("status").notNull().default("pending"),
  expiresAt: timestamp("expires_at").notNull(),
  acceptedAt: timestamp("accepted_at"),
  cancelledAt: timestamp("cancelled_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type UserInvitation = typeof userInvitationsTable.$inferSelect;
