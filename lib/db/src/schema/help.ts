import { pgTable, text, integer, timestamp, uuid, pgEnum } from "drizzle-orm/pg-core";

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
  sortOrder: integer("sort_order").notNull().default(0),
  status: helpArticleStatusEnum("status").notNull().default("published"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const faqItemsTable = pgTable("faq_items", {
  id: uuid("id").primaryKey().defaultRandom(),
  question: text("question").notNull(),
  answer: text("answer").notNull(),
  category: text("category").notNull().default("General"),
  sortOrder: integer("sort_order").notNull().default(0),
  status: helpArticleStatusEnum("status").notNull().default("published"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});
