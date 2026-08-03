import { pgTable, text, integer, timestamp, uuid, pgEnum, boolean } from "drizzle-orm/pg-core";

export const helpArticleStatusEnum = pgEnum("help_article_status", ["published", "draft", "archived"]);

export const helpCategoriesTable = pgTable("help_categories", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull().unique(),
  description: text("description").notNull().default(""),
  icon: text("icon").notNull().default("HelpCircle"),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const helpArticlesTable = pgTable("help_articles", {
  id: uuid("id").primaryKey().defaultRandom(),
  slug: text("slug").notNull().unique(),
  title: text("title").notNull(),
  categoryId: uuid("category_id").references(() => helpCategoriesTable.id, { onDelete: "set null" }),
  module: text("module"),
  content: text("content").notNull().default(""),
  summary: text("summary").notNull().default(""),
  keywords: text("keywords").notNull().default(""),
  roleVisibility: text("role_visibility").array(),
  // Capability-based visibility (e.g. "evidence.approve", "preassessment.run")
  requiredCapabilities: text("required_capabilities").array(),
  // Package gating — org must have at least one listed package active
  packageKeys: text("package_keys").array(),
  // Module gating — listed modules must be enabled for the org
  moduleKeys: text("module_keys").array(),
  sortOrder: integer("sort_order").notNull().default(0),
  status: helpArticleStatusEnum("status").notNull().default("published"),
  featured: boolean("featured").notNull().default(false),
  popular: boolean("popular").notNull().default(false),
  contentVersion: text("content_version").notNull().default("1.0"),
  estimatedReadMinutes: integer("estimated_read_minutes").notNull().default(3),
  lastReviewedAt: timestamp("last_reviewed_at"),
  lastReviewedBy: text("last_reviewed_by"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const faqItemsTable = pgTable("faq_items", {
  id: uuid("id").primaryKey().defaultRandom(),
  question: text("question").notNull(),
  answer: text("answer").notNull(),
  category: text("category").notNull().default("General"),
  // Capability gating
  requiredCapabilities: text("required_capabilities").array(),
  // Package gating
  packageKeys: text("package_keys").array(),
  // Module gating (e.g. ["PRE_ASSESSMENT"])
  moduleKey: text("module_key"),
  sortOrder: integer("sort_order").notNull().default(0),
  status: helpArticleStatusEnum("status").notNull().default("published"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// ── Support Tickets ────────────────────────────────────────────────────────────

export const supportTicketsTable = pgTable("support_tickets", {
  id: uuid("id").primaryKey().defaultRandom(),
  ticketNumber: text("ticket_number").notNull().unique(),
  organizationId: uuid("organization_id"),
  submittedByUserId: uuid("submitted_by_user_id").notNull(),
  submittedByName: text("submitted_by_name").notNull(),
  submittedByEmail: text("submitted_by_email").notNull(),
  effectiveRole: text("effective_role"),
  category: text("category").notNull(),
  priority: text("priority").notNull().default("normal"),
  subject: text("subject").notNull(),
  description: text("description").notNull(),
  relatedModule: text("related_module"),
  currentPageUrl: text("current_page_url"),
  articleId: uuid("article_id"),
  environment: text("environment"),
  appVersion: text("app_version"),
  browserSummary: text("browser_summary"),
  correlationId: text("correlation_id"),
  includeDiagnostics: boolean("include_diagnostics").notNull().default(false),
  status: text("status").notNull().default("submitted"),
  internalNotes: text("internal_notes"),
  emailDeliveryStatus: text("email_delivery_status").notNull().default("pending"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
  resolvedAt: timestamp("resolved_at"),
  closedAt: timestamp("closed_at"),
});

export const supportTicketAttachmentsTable = pgTable("support_ticket_attachments", {
  id: uuid("id").primaryKey().defaultRandom(),
  ticketId: uuid("ticket_id").notNull(),
  originalFilename: text("original_filename").notNull(),
  storageKey: text("storage_key").notNull(),
  mimeType: text("mime_type").notNull(),
  fileSize: integer("file_size").notNull(),
  checksum: text("checksum"),
  uploadedAt: timestamp("uploaded_at").notNull().defaultNow(),
});
