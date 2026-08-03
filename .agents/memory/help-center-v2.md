---
name: Help Center v2 Overhaul
description: Full Help Center rewrite — 19 categories, 30 articles, 28 FAQs, support ticket system, resolveHelpContext, context-aware filtering, MarkdownContent XSS fix.
---

## Implemented (2026-08-03)

### DB Schema (lib/db/src/schema/help.ts)
- Added to `helpArticlesTable`: `requiredCapabilities text[]`, `packageKeys text[]`, `moduleKeys text[]`, `featured bool`, `popular bool`, `contentVersion text`, `estimatedReadMinutes int`, `lastReviewedAt timestamptz`, `lastReviewedBy text`
- Added to `faqItemsTable`: `requiredCapabilities text[]`, `packageKeys text[]`, `moduleKey text`
- New `supportTicketsTable` and `supportTicketAttachmentsTable`

### Startup Migrations (artifacts/api-server/src/startup-seed.ts)
- ALTER TABLE migrations for all new columns (around line 1378)
- CREATE TABLE IF NOT EXISTS for support_tickets + support_ticket_attachments
- Old category cleanup runs on every boot: "Controls", "Documentation & SSP", "POA&M", "Reports", "MFA & Login Help" → deleted (obsolete names from v1)

### Backend (artifacts/api-server/src/)
- `lib/help-context.ts` — `resolveHelpContext(req): HelpContext` — reads org packages, features, role
- `routes/help.ts` — NEW endpoints: GET /help/context, GET /help/recommended, POST /help/support-tickets, GET /help/support-tickets, POST /help/articles/:slug/feedback
- Updated endpoints: GET /help/articles, /help/articles/:slug, /help/search, /help/faq, /help/categories — all apply `canSeeArticle(article, ctx)` filtering
- GET /help/articles/:slug now returns 403 if user lacks visibility (was open to direct URL)
- `lib/email.ts` — added `sendSupportTicketEmail()` and `sendSupportTicketConfirmation()`
- Support ticket numbering: `CH-YYYYMMDD-NNNN`
- Support email: support@carmetechnology.com (was info@carmetechnology.com)

### Content (artifacts/api-server/src/data/help-seed-data.ts)
- 19 categories (was 14) — exports HELP_CATEGORIES, HELP_ARTICLES (27), COMPLIANCE_FRAMEWORK_ARTICLES (3), FAQ_ITEMS (28), HELP_MODULE_LABELS
- Article upsert uses `onConflictDoUpdate` keyed on slug, triggers when `content_version` advances — so content changes on every deploy
- **FAQ limitation**: faq_items has no unique constraint on question, so FAQ upsert uses `onConflictDoNothing` — existing FAQ rows are NOT updated by seed on restart; new rows are inserted
- contentVersion "2.0" on all articles; lastReviewedAt: 2026-08-03
- All support contact changed to submit-ticket flow (no mailto)

### Frontend (artifacts/cmmc-app/src/)
- `lib/help-labels.ts` — HELP_MODULE_LABELS + getModuleLabel()
- `pages/help.tsx` — redesigned: context header, hero search, quick actions, recommended section, category grid, recently updated, support panel
- `pages/help-article.tsx` — redesigned: ToC, breadcrumb, role/module badges, feedback widget, prev/next nav
- `pages/help-faq.tsx` — redesigned: accordion, search, grouped by category
- `pages/help-videos.tsx` — published-only main grid; Coming Soon in collapsible Planned section; Request Tutorial → support ticket
- `pages/help-support-ticket.tsx` — NEW: full ticket form with CUI warning, security notice, diagnostic context checkbox
- `pages/help-my-tickets.tsx` — NEW: ticket list; admin sees all via ?all=true
- `components/help/MarkdownContent.tsx` — REPLACED dangerouslySetInnerHTML with pure React renderer; supports ## H2/H3, bold, italic, code, lists, tables, callout blocks (NOTE/IMPORTANT/WARNING/PERMISSION)
- `App.tsx` — added /help/support-ticket and /help/my-tickets routes

## Key Constraints / Lessons

**Why:** Context-aware filtering (canSeeArticle) applies to every help read endpoint so users in L1 orgs never see L2-only articles, and module-gated articles (pre-assessment-guide) only appear when the module is enabled for that org. Admin bypasses all filters.

**How to apply:** When adding new articles with moduleKeys or requiredCapabilities, set them in the seed data. The backend canSeeArticle() reads those columns; no backend code change needed.

**FAQ update gap:** Adding a unique constraint on faq_items.question + switching to upsert is needed before FAQ content edits take effect in existing DBs. Currently, only new FAQs (not in DB yet) are inserted; existing FAQ text changes are silently skipped on restart.

**resolveHelpContext** is in lib/help-context.ts. It reads org packages from organization_packages table (packageKey column), org features from organization_features (featureKey, enabled), and org membership from organization_users for orgRole.
