import { Router } from "express";
import { eq, sql, and, or, ilike, desc } from "drizzle-orm";
import { randomUUID } from "crypto";
import { z } from "zod";
import {
  db,
  helpCategoriesTable,
  helpArticlesTable,
  faqItemsTable,
  supportTicketsTable,
  usersTable,
} from "@workspace/db";
import { requireAuth, requireRole } from "../lib/auth";
import { resolveHelpContext, HelpContext } from "../lib/help-context";
import { logAudit } from "../lib/audit";
import {
  sendSupportTicketEmail,
  sendSupportTicketConfirmation,
} from "../lib/email";

const router = Router();

// ── Visibility helpers ─────────────────────────────────────────────────────────

type ArticleRow = {
  status: string;
  roleVisibility: string[] | null;
  requiredCapabilities: string[] | null;
  packageKeys: string[] | null;
  moduleKeys: string[] | null;
};

type FaqRow = {
  status: string;
  requiredCapabilities: string[] | null;
  packageKeys: string[] | null;
  moduleKey: string | null;
};

function canSeeArticle(article: ArticleRow, ctx: HelpContext): boolean {
  if (article.status !== "published") return false;
  if (ctx.platformRole === "global_admin") return true;

  const orgRole = ctx.organizationRole;

  // roleVisibility filter
  if (article.roleVisibility && article.roleVisibility.length > 0) {
    if (!orgRole || !article.roleVisibility.includes(orgRole)) return false;
  }

  // requiredCapabilities filter — user must have ALL
  if (article.requiredCapabilities && article.requiredCapabilities.length > 0) {
    const allMet = article.requiredCapabilities.every((cap) =>
      ctx.effectiveCapabilities.includes(cap)
    );
    if (!allMet) return false;
  }

  // packageKeys filter — org must have at least ONE
  if (article.packageKeys && article.packageKeys.length > 0) {
    const hasAny = article.packageKeys.some((pk) =>
      ctx.activePackageKeys.includes(pk)
    );
    if (!hasAny) return false;
  }

  // moduleKeys filter — ALL listed modules must be enabled
  if (article.moduleKeys && article.moduleKeys.length > 0) {
    const allEnabled = article.moduleKeys.every((mk) =>
      ctx.enabledModules.includes(mk)
    );
    if (!allEnabled) return false;
  }

  return true;
}

function canSeeFaq(faq: FaqRow, ctx: HelpContext): boolean {
  if (faq.status !== "published") return false;
  if (ctx.platformRole === "global_admin") return true;

  if (faq.requiredCapabilities && faq.requiredCapabilities.length > 0) {
    const allMet = faq.requiredCapabilities.every((cap) =>
      ctx.effectiveCapabilities.includes(cap)
    );
    if (!allMet) return false;
  }

  if (faq.packageKeys && faq.packageKeys.length > 0) {
    const hasAny = faq.packageKeys.some((pk) => ctx.activePackageKeys.includes(pk));
    if (!hasAny) return false;
  }

  if (faq.moduleKey) {
    if (!ctx.enabledModules.includes(faq.moduleKey)) return false;
  }

  return true;
}

// ── GET /help/context ──────────────────────────────────────────────────────────

router.get("/help/context", requireAuth, async (req, res): Promise<void> => {
  const ctx = await resolveHelpContext(req);
  res.json(ctx);
});

// ── GET /help/categories ───────────────────────────────────────────────────────

router.get("/help/categories", requireAuth, async (req, res): Promise<void> => {
  const ctx = await resolveHelpContext(req);

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

  // Fetch all published articles with visibility fields
  const allArticles = await db
    .select({
      categoryId: helpArticlesTable.categoryId,
      status: helpArticlesTable.status,
      roleVisibility: helpArticlesTable.roleVisibility,
      requiredCapabilities: helpArticlesTable.requiredCapabilities,
      packageKeys: helpArticlesTable.packageKeys,
      moduleKeys: helpArticlesTable.moduleKeys,
    })
    .from(helpArticlesTable)
    .where(eq(helpArticlesTable.status, "published"));

  // Count visible articles per category
  const countMap: Record<string, number> = {};
  for (const a of allArticles) {
    if (!canSeeArticle(a, ctx)) continue;
    const key = a.categoryId ?? "";
    countMap[key] = (countMap[key] ?? 0) + 1;
  }

  res.json(
    categories.map((c) => ({ ...c, articleCount: countMap[c.id] ?? 0 }))
  );
});

// ── GET /help/articles ─────────────────────────────────────────────────────────

router.get("/help/articles", requireAuth, async (req, res): Promise<void> => {
  const ctx = await resolveHelpContext(req);
  const { category, module: mod, status, role } = req.query as Record<string, string>;

  const conditions: ReturnType<typeof eq>[] = [];

  if (status && status !== "all") {
    conditions.push(eq(helpArticlesTable.status, status as "published" | "draft" | "archived"));
  } else if (!status) {
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
      requiredCapabilities: helpArticlesTable.requiredCapabilities,
      packageKeys: helpArticlesTable.packageKeys,
      moduleKeys: helpArticlesTable.moduleKeys,
      featured: helpArticlesTable.featured,
      popular: helpArticlesTable.popular,
      estimatedReadMinutes: helpArticlesTable.estimatedReadMinutes,
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

  // Apply legacy role filter for admin views
  if (role && role !== "admin") {
    rows = rows.filter(
      (r) => !r.roleVisibility || r.roleVisibility.length === 0 || r.roleVisibility.includes(role)
    );
  }

  // Apply context-based visibility (skip if status=all, which is admin view)
  if (!status || status !== "all") {
    rows = rows.filter((r) => canSeeArticle(r, ctx));
  }

  res.json(rows);
});

// ── GET /help/articles/:slug ───────────────────────────────────────────────────

router.get("/help/articles/:slug", requireAuth, async (req, res): Promise<void> => {
  const ctx = await resolveHelpContext(req);

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
      requiredCapabilities: helpArticlesTable.requiredCapabilities,
      packageKeys: helpArticlesTable.packageKeys,
      moduleKeys: helpArticlesTable.moduleKeys,
      featured: helpArticlesTable.featured,
      popular: helpArticlesTable.popular,
      contentVersion: helpArticlesTable.contentVersion,
      estimatedReadMinutes: helpArticlesTable.estimatedReadMinutes,
      lastReviewedAt: helpArticlesTable.lastReviewedAt,
      lastReviewedBy: helpArticlesTable.lastReviewedBy,
      sortOrder: helpArticlesTable.sortOrder,
      status: helpArticlesTable.status,
      createdAt: helpArticlesTable.createdAt,
      updatedAt: helpArticlesTable.updatedAt,
      categoryName: helpCategoriesTable.name,
    })
    .from(helpArticlesTable)
    .leftJoin(helpCategoriesTable, eq(helpArticlesTable.categoryId, helpCategoriesTable.id))
    .where(eq(helpArticlesTable.slug, req.params.slug as string));

  if (!article) return void res.status(404).json({ error: "Article not found" });

  // Check visibility (non-admins only)
  if (!canSeeArticle(article, ctx)) {
    return void res.status(403).json({
      error: "This guide is not available for your current role or organization configuration.",
    });
  }

  res.json(article);
});

// ── GET /help/search ───────────────────────────────────────────────────────────

router.get("/help/search", requireAuth, async (req, res): Promise<void> => {
  const ctx = await resolveHelpContext(req);
  const q = ((req.query.q as string) ?? "").trim();
  if (!q) return void res.json({ articles: [], faq: [] });

  const term = `%${q}%`;

  const articles = await db
    .select({
      id: helpArticlesTable.id,
      slug: helpArticlesTable.slug,
      title: helpArticlesTable.title,
      summary: helpArticlesTable.summary,
      categoryName: helpCategoriesTable.name,
      module: helpArticlesTable.module,
      status: helpArticlesTable.status,
      roleVisibility: helpArticlesTable.roleVisibility,
      requiredCapabilities: helpArticlesTable.requiredCapabilities,
      packageKeys: helpArticlesTable.packageKeys,
      moduleKeys: helpArticlesTable.moduleKeys,
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
    .limit(20);

  const visibleArticles = articles.filter((a) => canSeeArticle(a, ctx)).slice(0, 10);

  const faqResults = await db
    .select()
    .from(faqItemsTable)
    .where(
      and(
        eq(faqItemsTable.status, "published"),
        or(ilike(faqItemsTable.question, term), ilike(faqItemsTable.answer, term)),
      ),
    )
    .limit(10);

  const visibleFaq = faqResults.filter((f) => canSeeFaq(f, ctx)).slice(0, 5);

  // Strip internal visibility fields from search results
  const cleanArticles = visibleArticles.map(({ status: _s, roleVisibility: _rv, requiredCapabilities: _rc, packageKeys: _pk, moduleKeys: _mk, ...rest }) => rest);

  res.json({ articles: cleanArticles, faq: visibleFaq });
});

// ── GET /help/faq ──────────────────────────────────────────────────────────────

router.get("/help/faq", requireAuth, async (req, res): Promise<void> => {
  const ctx = await resolveHelpContext(req);
  const { category } = req.query as Record<string, string>;
  const conditions: ReturnType<typeof eq>[] = [eq(faqItemsTable.status, "published")];
  if (category) conditions.push(eq(faqItemsTable.category, category));

  const items = await db
    .select()
    .from(faqItemsTable)
    .where(and(...conditions))
    .orderBy(faqItemsTable.sortOrder);

  const visible = items.filter((f) => canSeeFaq(f, ctx));
  res.json(visible);
});

// ── GET /help/recommended ──────────────────────────────────────────────────────

router.get("/help/recommended", requireAuth, async (req, res): Promise<void> => {
  const ctx = await resolveHelpContext(req);

  const allArticles = await db
    .select({
      id: helpArticlesTable.id,
      slug: helpArticlesTable.slug,
      title: helpArticlesTable.title,
      categoryId: helpArticlesTable.categoryId,
      module: helpArticlesTable.module,
      summary: helpArticlesTable.summary,
      keywords: helpArticlesTable.keywords,
      roleVisibility: helpArticlesTable.roleVisibility,
      requiredCapabilities: helpArticlesTable.requiredCapabilities,
      packageKeys: helpArticlesTable.packageKeys,
      moduleKeys: helpArticlesTable.moduleKeys,
      featured: helpArticlesTable.featured,
      popular: helpArticlesTable.popular,
      estimatedReadMinutes: helpArticlesTable.estimatedReadMinutes,
      sortOrder: helpArticlesTable.sortOrder,
      status: helpArticlesTable.status,
      createdAt: helpArticlesTable.createdAt,
      updatedAt: helpArticlesTable.updatedAt,
      categoryName: helpCategoriesTable.name,
    })
    .from(helpArticlesTable)
    .leftJoin(helpCategoriesTable, eq(helpArticlesTable.categoryId, helpCategoriesTable.id))
    .where(eq(helpArticlesTable.status, "published"))
    .orderBy(helpArticlesTable.sortOrder);

  const visible = allArticles.filter((a) => canSeeArticle(a, ctx));

  // Define keyword priorities per role
  const orgRole = ctx.organizationRole;
  let priorityKeywords: string[] = [];

  if (ctx.platformRole === "global_admin") {
    priorityKeywords = ["getting-started", "users", "organizations"];
  } else if (orgRole === "org_admin") {
    priorityKeywords = ["users", "organizations"];
  } else if (orgRole === "compliance_manager") {
    priorityKeywords = ["evidence", "controls", "ssp", "monitoring"];
  } else if (orgRole === "it_contributor") {
    priorityKeywords = ["evidence", "controls", "tasks"];
  } else if (orgRole === "reviewer") {
    priorityKeywords = ["evidence", "approve", "documents", "review"];
  } else if (orgRole === "executive_viewer") {
    priorityKeywords = ["dashboard", "reports"];
  } else if (orgRole === "assessor") {
    priorityKeywords = ["controls", "evidence", "ssp", "reports"];
  }

  let recommended: typeof visible = [];

  if (priorityKeywords.length > 0) {
    // Score each article by how many priority keywords match slug/title/keywords/module
    const scored = visible.map((a) => {
      const text = `${a.slug} ${a.title} ${a.keywords ?? ""} ${a.module ?? ""}`.toLowerCase();
      const score = priorityKeywords.filter((kw) => text.includes(kw)).length;
      return { ...a, _score: score };
    });
    scored.sort((a, b) => {
      if (b._score !== a._score) return b._score - a._score;
      if (b.popular !== a.popular) return b.popular ? 1 : -1;
      if (b.featured !== a.featured) return b.featured ? 1 : -1;
      return 0;
    });
    recommended = scored.slice(0, 5).map(({ _score: _s, ...rest }) => rest);
  } else {
    // Default: popular first, then featured
    const sorted = [...visible].sort((a, b) => {
      if (b.popular !== a.popular) return b.popular ? 1 : -1;
      if (b.featured !== a.featured) return b.featured ? 1 : -1;
      return 0;
    });
    recommended = sorted.slice(0, 5);
  }

  res.json(recommended);
});

// ── POST /help/articles/:slug/feedback ────────────────────────────────────────

router.post("/help/articles/:slug/feedback", requireAuth, async (req, res): Promise<void> => {
  const { helpful, reason, comment } = req.body as {
    helpful: boolean;
    reason?: string;
    comment?: string;
  };

  const slug = req.params.slug as string;

  await logAudit(req, "viewed", "help_article_feedback", slug, {
    newValue: { slug, helpful, reason: reason ?? null, comment: comment ?? null },
  });

  res.json({ success: true });
});

// ── POST /help/support-tickets ─────────────────────────────────────────────────

const ALLOWED_CATEGORIES = [
  "Sign-In, Password or MFA",
  "Microsoft SSO",
  "User Access or Role",
  "Organization Setup",
  "Controls or Frameworks",
  "Tasks",
  "Evidence Upload or Download",
  "Monitoring Tracker",
  "POA&M",
  "Implementation Roadmap",
  "Pre-Assessment",
  "Documentation",
  "SSP",
  "Reports or Exports",
  "Performance",
  "Bug Report",
  "Feature Request",
  "Tutorial Request",
  "Other",
] as const;

const supportTicketSchema = z.object({
  subject: z.string().min(3).max(200),
  category: z.enum(ALLOWED_CATEGORIES),
  description: z.string().min(10).max(5000),
  priority: z.enum(["low", "normal", "high", "urgent"]).default("normal"),
  relatedModule: z.string().optional(),
  currentPageUrl: z.string().optional(),
  articleId: z.string().uuid().optional(),
  correlationId: z.string().optional(),
  browserSummary: z.string().optional(),
  includeDiagnostics: z.boolean().default(false),
});

router.post("/help/support-tickets", requireAuth, async (req, res): Promise<void> => {
  const parsed = supportTicketSchema.safeParse(req.body);
  if (!parsed.success) {
    return void res.status(400).json({ error: "Validation failed", details: parsed.error.flatten() });
  }
  const body = parsed.data;

  // Resolve help context for metadata
  const ctx = await resolveHelpContext(req);

  // Fetch user record for name/email
  const [userRecord] = await db
    .select({ id: usersTable.id, name: usersTable.name, email: usersTable.email })
    .from(usersTable)
    .where(eq(usersTable.id, req.authUser!.id))
    .limit(1);

  if (!userRecord) {
    return void res.status(401).json({ error: "User not found" });
  }

  // Generate ticket number: CH-YYYYMMDD-NNNN
  const now = new Date();
  const dateStr = now.toISOString().slice(0, 10).replace(/-/g, "");
  const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const dayEnd = new Date(dayStart.getTime() + 86400000);

  const countResult = await db.execute<{ todayCount: number }>(
    sql`SELECT COUNT(*)::int AS "todayCount" FROM support_tickets WHERE created_at >= ${dayStart.toISOString()} AND created_at < ${dayEnd.toISOString()}`
  );
  const todayCount: number = (countResult.rows?.[0] as { todayCount: number } | undefined)?.todayCount ?? 0;

  const seq = String(todayCount + 1).padStart(4, "0");
  const ticketNumber = `CH-${dateStr}-${seq}`;
  const ticketId = randomUUID();

  // Insert ticket
  await db.execute(
    sql`INSERT INTO support_tickets (
      id, ticket_number, organization_id, submitted_by_user_id,
      submitted_by_name, submitted_by_email, effective_role,
      category, priority, subject, description,
      related_module, current_page_url, article_id,
      browser_summary, correlation_id, include_diagnostics,
      status, email_delivery_status, created_at, updated_at
    ) VALUES (
      ${ticketId}::uuid, ${ticketNumber},
      ${ctx.selectedOrganizationId}::uuid,
      ${userRecord.id}::uuid,
      ${userRecord.name}, ${userRecord.email}, ${ctx.effectiveRole},
      ${body.category}, ${body.priority}, ${body.subject}, ${body.description},
      ${body.relatedModule ?? null}, ${body.currentPageUrl ?? null},
      ${body.articleId ?? null}::uuid,
      ${body.browserSummary ?? null}, ${body.correlationId ?? null},
      ${body.includeDiagnostics},
      'submitted', 'pending', NOW(), NOW()
    )`
  );

  // Send emails
  let emailDeliveryStatus = "pending";
  try {
    await sendSupportTicketEmail({
      ticketNumber,
      subject: body.subject,
      category: body.category,
      priority: body.priority,
      description: body.description,
      submittedByName: userRecord.name,
      submittedByEmail: userRecord.email,
      effectiveRole: ctx.effectiveRole,
      organizationName: ctx.selectedOrganizationName,
      relatedModule: body.relatedModule ?? null,
      currentPageUrl: body.currentPageUrl ?? null,
      environment: null,
      browserSummary: body.browserSummary ?? null,
      correlationId: body.correlationId ?? null,
      createdAt: now,
    });

    // Also send confirmation to user
    try {
      await sendSupportTicketConfirmation({
        ticketNumber,
        subject: body.subject,
        toEmail: userRecord.email,
        toName: userRecord.name,
        createdAt: now,
      });
    } catch (_confErr) {
      // Confirmation failure is non-fatal — support email succeeded
    }

    emailDeliveryStatus = "delivered";
  } catch (_emailErr) {
    emailDeliveryStatus = "failed";
  }

  // Update email delivery status
  await db.execute(
    sql`UPDATE support_tickets SET email_delivery_status = ${emailDeliveryStatus}, updated_at = NOW() WHERE id = ${ticketId}::uuid`
  );

  // Audit log
  await logAudit(req, "submitted", "support_ticket", ticketId, {
    entityLabel: ticketNumber,
    newValue: { ticketNumber, subject: body.subject, category: body.category, priority: body.priority },
  });

  res.status(201).json({
    ticketId,
    ticketNumber,
    subject: body.subject,
    createdAt: now.toISOString(),
    emailDeliveryStatus,
  });
});

// ── GET /help/support-tickets ─────────────────────────────────────────────────

router.get("/help/support-tickets", requireAuth, async (req, res): Promise<void> => {
  const isAdmin = req.authUser?.role === "admin";
  const showAll = req.query.all === "true";

  let result: Awaited<ReturnType<typeof db.execute>>;

  if (isAdmin && showAll) {
    result = await db.execute(
      sql`SELECT * FROM support_tickets ORDER BY created_at DESC LIMIT 50`
    );
  } else {
    result = await db.execute(
      sql`SELECT * FROM support_tickets WHERE submitted_by_user_id = ${req.authUser!.id}::uuid ORDER BY created_at DESC LIMIT 50`
    );
  }

  res.json(result.rows ?? []);
});

// ── Admin CRUD ─────────────────────────────────────────────────────────────────

router.post("/help/categories", requireAuth, requireRole("admin"), async (req, res): Promise<void> => {
  const { name, description, icon, sortOrder } = req.body;
  const [row] = await db
    .insert(helpCategoriesTable)
    .values({ id: randomUUID(), name, description: description ?? "", icon: icon ?? "HelpCircle", sortOrder: sortOrder ?? 0, createdAt: new Date() })
    .returning();
  res.json(row);
});

router.put("/help/categories/:id", requireAuth, requireRole("admin"), async (req, res): Promise<void> => {
  const { name, description, icon, sortOrder } = req.body;
  const [row] = await db
    .update(helpCategoriesTable)
    .set({ name, description, icon, sortOrder })
    .where(eq(helpCategoriesTable.id, req.params.id as string))
    .returning();
  if (!row) return void res.status(404).json({ error: "Not found" });
  res.json(row);
});

router.post("/help/articles", requireAuth, requireRole("admin"), async (req, res): Promise<void> => {
  const {
    slug, title, categoryId, module: mod, content, summary, keywords,
    roleVisibility, requiredCapabilities, packageKeys, moduleKeys,
    sortOrder, status, featured, popular, contentVersion, estimatedReadMinutes,
    lastReviewedAt, lastReviewedBy,
  } = req.body;
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
      requiredCapabilities: requiredCapabilities ?? null,
      packageKeys: packageKeys ?? null,
      moduleKeys: moduleKeys ?? null,
      sortOrder: sortOrder ?? 0,
      status: status ?? "published",
      featured: featured ?? false,
      popular: popular ?? false,
      contentVersion: contentVersion ?? "1.0",
      estimatedReadMinutes: estimatedReadMinutes ?? 3,
      lastReviewedAt: lastReviewedAt ? new Date(lastReviewedAt) : null,
      lastReviewedBy: lastReviewedBy ?? null,
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    .returning();
  res.json(row);
});

router.put("/help/articles/:id", requireAuth, requireRole("admin"), async (req, res): Promise<void> => {
  const {
    slug, title, categoryId, module: mod, content, summary, keywords,
    roleVisibility, requiredCapabilities, packageKeys, moduleKeys,
    sortOrder, status, featured, popular, contentVersion, estimatedReadMinutes,
    lastReviewedAt, lastReviewedBy,
  } = req.body;
  const [row] = await db
    .update(helpArticlesTable)
    .set({
      slug, title,
      categoryId: categoryId ?? null,
      module: mod ?? null,
      content, summary, keywords,
      roleVisibility: roleVisibility ?? null,
      requiredCapabilities: requiredCapabilities ?? null,
      packageKeys: packageKeys ?? null,
      moduleKeys: moduleKeys ?? null,
      sortOrder, status,
      featured: featured ?? false,
      popular: popular ?? false,
      contentVersion: contentVersion ?? "1.0",
      estimatedReadMinutes: estimatedReadMinutes ?? 3,
      lastReviewedAt: lastReviewedAt ? new Date(lastReviewedAt) : null,
      lastReviewedBy: lastReviewedBy ?? null,
      updatedAt: new Date(),
    })
    .where(eq(helpArticlesTable.id, req.params.id as string))
    .returning();
  if (!row) return void res.status(404).json({ error: "Not found" });
  res.json(row);
});

router.post("/help/faq", requireAuth, requireRole("admin"), async (req, res): Promise<void> => {
  const { question, answer, category, sortOrder, status } = req.body;
  const [row] = await db
    .insert(faqItemsTable)
    .values({ id: randomUUID(), question, answer, category: category ?? "General", sortOrder: sortOrder ?? 0, status: status ?? "published", createdAt: new Date(), updatedAt: new Date() })
    .returning();
  res.json(row);
});

router.put("/help/faq/:id", requireAuth, requireRole("admin"), async (req, res): Promise<void> => {
  const { question, answer, category, sortOrder, status } = req.body;
  const [row] = await db
    .update(faqItemsTable)
    .set({ question, answer, category, sortOrder, status, updatedAt: new Date() })
    .where(eq(faqItemsTable.id, req.params.id as string))
    .returning();
  if (!row) return void res.status(404).json({ error: "Not found" });
  res.json(row);
});

router.delete("/help/faq/:id", requireAuth, requireRole("admin"), async (req, res): Promise<void> => {
  await db.delete(faqItemsTable).where(eq(faqItemsTable.id, req.params.id as string));
  res.json({ success: true });
});

export default router;
