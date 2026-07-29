import { pgTable, text, boolean, timestamp, integer, pgEnum, json, varchar } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

/**
 * Platform-level role stored on `users.role`.
 *
 * Only two values are meaningful going forward:
 *   - "admin" → Global Admin (platform-wide authority)
 *   - "none"  → No platform role; access comes solely from organization memberships
 *
 * The remaining values are legacy global roles retained so existing accounts are
 * not locked out. They are reported in the Legacy Role Migration Report and must
 * never be offered as new platform-role choices.
 */
export const userRoleEnum = pgEnum("user_role", [
  "admin",
  "compliance_manager",
  "it_contributor",
  "reviewer",
  "executive_viewer",
  "assessor",
  "none",
]);

export const mfaEnforcementModeEnum = pgEnum("mfa_enforcement_mode", [
  "disabled",
  "admins_only",
  "privileged",
  "all_users",
]);

export const userStatusEnum = pgEnum("user_status", [
  "invited",
  "pending_setup",
  "active",
  "suspended",
  "deactivated",
]);

export const usersTable = pgTable("users", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash"),
  role: userRoleEnum("role").notNull().default("it_contributor"),
  title: text("title"),
  department: text("department"),
  isActive: boolean("is_active").notNull().default(true),
  status: userStatusEnum("status").notNull().default("active"),
  invitedById: text("invited_by_id"),
  invitedAt: timestamp("invited_at"),
  inviteAcceptedAt: timestamp("invite_accepted_at"),
  lastLoginAt: timestamp("last_login_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
  mfaEnabled: boolean("mfa_enabled").notNull().default(false),
  mfaSecret: text("mfa_secret"),
  mfaEnrolledAt: timestamp("mfa_enrolled_at"),
  mfaRecoveryCodes: json("mfa_recovery_codes").$type<(string | null)[]>(),
  mfaRequired: boolean("mfa_required").notNull().default(false),
  mfaResetRequired: boolean("mfa_reset_required").notNull().default(false),
  failedLoginCount: integer("failed_login_count").notNull().default(0),
  lockedUntil: timestamp("locked_until"),
  isBreakGlass: boolean("is_break_glass").notNull().default(false),
  mfaExempt: boolean("mfa_exempt").notNull().default(false),
  ssoDisabled: boolean("sso_disabled").notNull().default(false),
  authProvider: varchar("auth_provider", { length: 50 }).notNull().default("local"),
  globalRole: varchar("global_role", { length: 50 }),
  microsoftTenantId: text("microsoft_tenant_id"),
  microsoftObjectId: text("microsoft_object_id"),
  microsoftLinkedAt: timestamp("microsoft_linked_at"),
  lastSsoLoginAt: timestamp("last_sso_login_at"),
});

export const securitySettingsTable = pgTable("security_settings", {
  id: text("id").primaryKey(),
  mfaEnforcementMode: mfaEnforcementModeEnum("mfa_enforcement_mode").notNull().default("privileged"),
  maxFailedLoginAttempts: integer("max_failed_login_attempts").notNull().default(5),
  lockoutDurationMinutes: integer("lockout_duration_minutes").notNull().default(15),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const breakGlassSessionsTable = pgTable("break_glass_sessions", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  tokenHash: text("token_hash").notNull().unique(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  lastActiveAt: timestamp("last_active_at", { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
});

export const insertUserSchema = createInsertSchema(usersTable).omit({
  id: true,
  passwordHash: true,
  lastLoginAt: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof usersTable.$inferSelect;
export type SecuritySettings = typeof securitySettingsTable.$inferSelect;
export type BreakGlassSession = typeof breakGlassSessionsTable.$inferSelect;
