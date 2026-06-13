import { Router } from "express";
import { eq, sql, and, or, ilike } from "drizzle-orm";
import { randomUUID } from "crypto";
import { db, helpCategoriesTable, helpArticlesTable, faqItemsTable } from "@workspace/db";
import { requireAuth, requireRole } from "../lib/auth";

const router = Router();

// ── Public Read Endpoints ──────────────────────────────────────────────────────

router.get("/help/categories", requireAuth, async (req, res) => {
  const categories = await db
    .select({
      id: helpCategoriesTable.id,
      name: helpCategoriesTable.name,
      description: helpCategoriesTable.description,
      icon: helpCategoriesTable.icon,
      sortOrder: helpCategoriesTable.sortOrder,
      createdAt: helpCategoriesTable.createdAt,
    })
    .from(helpCategoriesTable)
    .orderBy(helpCategoriesTable.sortOrder);

  const articles = await db
    .select({
      categoryId: helpArticlesTable.categoryId,
      count: sql<number>`count(*)::int`,
    })
    .from(helpArticlesTable)
    .where(eq(helpArticlesTable.status, "published"))
    .groupBy(helpArticlesTable.categoryId);

  const countMap = Object.fromEntries(articles.map((a) => [a.categoryId ?? "", a.count]));

  res.json(categories.map((c) => ({ ...c, articleCount: countMap[c.id] ?? 0 })));
});

router.get("/help/articles", requireAuth, async (req, res) => {
  const { category, module: mod, status, role } = req.query as Record<string, string>;

  const conditions: ReturnType<typeof eq>[] = [];

  if (status) {
    conditions.push(eq(helpArticlesTable.status, status as "published" | "draft" | "archived"));
  } else {
    conditions.push(eq(helpArticlesTable.status, "published"));
  }

  if (mod) {
    conditions.push(eq(helpArticlesTable.module, mod));
  }

  let rows = await db
    .select({
      id: helpArticlesTable.id,
      slug: helpArticlesTable.slug,
      title: helpArticlesTable.title,
      categoryId: helpArticlesTable.categoryId,
      module: helpArticlesTable.module,
      summary: helpArticlesTable.summary,
      keywords: helpArticlesTable.keywords,
      roleVisibility: helpArticlesTable.roleVisibility,
      sortOrder: helpArticlesTable.sortOrder,
      status: helpArticlesTable.status,
      createdAt: helpArticlesTable.createdAt,
      updatedAt: helpArticlesTable.updatedAt,
      categoryName: helpCategoriesTable.name,
    })
    .from(helpArticlesTable)
    .leftJoin(helpCategoriesTable, eq(helpArticlesTable.categoryId, helpCategoriesTable.id))
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(helpCategoriesTable.sortOrder, helpArticlesTable.sortOrder);

  if (category) {
    rows = rows.filter((r) => r.categoryName === category);
  }

  if (role && role !== "admin") {
    rows = rows.filter((r) => !r.roleVisibility || r.roleVisibility.length === 0 || r.roleVisibility.includes(role));
  }

  res.json(rows);
});

router.get("/help/articles/:slug", requireAuth, async (req, res) => {
  const [article] = await db
    .select({
      id: helpArticlesTable.id,
      slug: helpArticlesTable.slug,
      title: helpArticlesTable.title,
      categoryId: helpArticlesTable.categoryId,
      module: helpArticlesTable.module,
      content: helpArticlesTable.content,
      summary: helpArticlesTable.summary,
      keywords: helpArticlesTable.keywords,
      roleVisibility: helpArticlesTable.roleVisibility,
      sortOrder: helpArticlesTable.sortOrder,
      status: helpArticlesTable.status,
      createdAt: helpArticlesTable.createdAt,
      updatedAt: helpArticlesTable.updatedAt,
      categoryName: helpCategoriesTable.name,
    })
    .from(helpArticlesTable)
    .leftJoin(helpCategoriesTable, eq(helpArticlesTable.categoryId, helpCategoriesTable.id))
    .where(eq(helpArticlesTable.slug, req.params.slug));

  if (!article) return res.status(404).json({ error: "Article not found" });
  res.json(article);
});

router.get("/help/search", requireAuth, async (req, res) => {
  const q = ((req.query.q as string) ?? "").trim();
  if (!q) return res.json({ articles: [], faq: [] });

  const term = `%${q}%`;

  const articles = await db
    .select({
      id: helpArticlesTable.id,
      slug: helpArticlesTable.slug,
      title: helpArticlesTable.title,
      summary: helpArticlesTable.summary,
      categoryName: helpCategoriesTable.name,
      module: helpArticlesTable.module,
    })
    .from(helpArticlesTable)
    .leftJoin(helpCategoriesTable, eq(helpArticlesTable.categoryId, helpCategoriesTable.id))
    .where(
      and(
        eq(helpArticlesTable.status, "published"),
        or(
          ilike(helpArticlesTable.title, term),
          ilike(helpArticlesTable.summary, term),
          ilike(helpArticlesTable.keywords, term),
          ilike(helpArticlesTable.content, term),
        ),
      ),
    )
    .limit(10);

  const faqResults = await db
    .select()
    .from(faqItemsTable)
    .where(
      and(
        eq(faqItemsTable.status, "published"),
        or(ilike(faqItemsTable.question, term), ilike(faqItemsTable.answer, term)),
      ),
    )
    .limit(5);

  res.json({ articles, faq: faqResults });
});

router.get("/help/faq", requireAuth, async (req, res) => {
  const { category } = req.query as Record<string, string>;
  const conditions: ReturnType<typeof eq>[] = [eq(faqItemsTable.status, "published")];
  if (category) conditions.push(eq(faqItemsTable.category, category));

  const items = await db
    .select()
    .from(faqItemsTable)
    .where(and(...conditions))
    .orderBy(faqItemsTable.sortOrder);

  res.json(items);
});

// ── Admin CRUD ─────────────────────────────────────────────────────────────────

router.post("/help/categories", requireAuth, requireRole("admin"), async (req, res) => {
  const { name, description, icon, sortOrder } = req.body;
  const [row] = await db
    .insert(helpCategoriesTable)
    .values({ id: randomUUID(), name, description: description ?? "", icon: icon ?? "HelpCircle", sortOrder: sortOrder ?? 0, createdAt: new Date() })
    .returning();
  res.json(row);
});

router.put("/help/categories/:id", requireAuth, requireRole("admin"), async (req, res) => {
  const { name, description, icon, sortOrder } = req.body;
  const [row] = await db
    .update(helpCategoriesTable)
    .set({ name, description, icon, sortOrder })
    .where(eq(helpCategoriesTable.id, req.params.id))
    .returning();
  if (!row) return res.status(404).json({ error: "Not found" });
  res.json(row);
});

router.post("/help/articles", requireAuth, requireRole("admin"), async (req, res) => {
  const { slug, title, categoryId, module: mod, content, summary, keywords, roleVisibility, sortOrder, status } = req.body;
  const [row] = await db
    .insert(helpArticlesTable)
    .values({
      id: randomUUID(),
      slug,
      title,
      categoryId: categoryId ?? null,
      module: mod ?? null,
      content: content ?? "",
      summary: summary ?? "",
      keywords: keywords ?? "",
      roleVisibility: roleVisibility ?? null,
      sortOrder: sortOrder ?? 0,
      status: status ?? "published",
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    .returning();
  res.json(row);
});

router.put("/help/articles/:id", requireAuth, requireRole("admin"), async (req, res) => {
  const { slug, title, categoryId, module: mod, content, summary, keywords, roleVisibility, sortOrder, status } = req.body;
  const [row] = await db
    .update(helpArticlesTable)
    .set({ slug, title, categoryId: categoryId ?? null, module: mod ?? null, content, summary, keywords, roleVisibility: roleVisibility ?? null, sortOrder, status, updatedAt: new Date() })
    .where(eq(helpArticlesTable.id, req.params.id))
    .returning();
  if (!row) return res.status(404).json({ error: "Not found" });
  res.json(row);
});

router.post("/help/faq", requireAuth, requireRole("admin"), async (req, res) => {
  const { question, answer, category, sortOrder, status } = req.body;
  const [row] = await db
    .insert(faqItemsTable)
    .values({ id: randomUUID(), question, answer, category: category ?? "General", sortOrder: sortOrder ?? 0, status: status ?? "published", createdAt: new Date(), updatedAt: new Date() })
    .returning();
  res.json(row);
});

router.put("/help/faq/:id", requireAuth, requireRole("admin"), async (req, res) => {
  const { question, answer, category, sortOrder, status } = req.body;
  const [row] = await db
    .update(faqItemsTable)
    .set({ question, answer, category, sortOrder, status, updatedAt: new Date() })
    .where(eq(faqItemsTable.id, req.params.id))
    .returning();
  if (!row) return res.status(404).json({ error: "Not found" });
  res.json(row);
});

router.delete("/help/faq/:id", requireAuth, requireRole("admin"), async (req, res) => {
  await db.delete(faqItemsTable).where(eq(faqItemsTable.id, req.params.id));
  res.json({ success: true });
});

export default router;
