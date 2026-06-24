import { pgTable, text, boolean, timestamp, varchar } from "drizzle-orm/pg-core";

export const ssoConfigsTable = pgTable("sso_configs", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id").notNull(),
  provider: varchar("provider", { length: 50 }).notNull().default("entra_id"),
  clientId: text("client_id").notNull(),
  tenantId: text("tenant_id").notNull(),
  clientSecretEnc: text("client_secret_enc").notNull(),
  emailDomain: text("email_domain"),
  enabled: boolean("enabled").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
