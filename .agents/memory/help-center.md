---
name: Help Center module
description: Full Help Center / FAQ / User Guide implementation — DB schema, seed data, API routes, and frontend pages.
---

## Architecture

- **DB tables**: `help_categories`, `help_articles`, `faq_items` — all seeded at startup via `seedHelpContent()` in `startup-seed.ts`
- **DB enum**: `help_article_status` (`published` | `draft` | `archived`)
- **Schema**: `lib/db/src/schema/help.ts` — exported from schema barrel

## Seed data

1,339-line `artifacts/api-server/src/data/help-seed-data.ts` contains:
- 14 categories (Getting Started → Troubleshooting)
- 22 articles with full markdown content
- 23 FAQ items across 6 categories

Startup seed checks `count()` on `help_categories` and skips if > 0 (idempotent).

## API routes (`artifacts/api-server/src/routes/help.ts`)

- `GET /api/help/categories` — includes `articleCount` per category
- `GET /api/help/articles` — `?status=all` for admin (no filter), default = published only
- `GET /api/help/articles/:slug`
- `GET /api/help/faq` — `?category=` filter
- `GET /api/help/search?q=` — searches title/summary/keywords/content + FAQ
- Admin CRUD: `POST/PUT /api/help/articles`, `POST/PUT/DELETE /api/help/faq`, `PUT/POST /api/help/categories`

**Key bug fixed**: `status=all` must NOT match as a DB enum value — handled with `if (status && status !== "all")` guard.

## Frontend

- `help.tsx` — home (categories grid + popular articles + contact card) + search overlay + category drill-down
- `help-article.tsx` — breadcrumb, MarkdownContent renderer, related articles sidebar
- `help-faq.tsx` — accordion expand/collapse, category filter badges, search
- `help-videos.tsx` — static video grid (1 live, 5 coming-soon)
- `help-admin.tsx` — admin-only editor for articles and FAQ (admin role gate via redirect)
- `components/help/MarkdownContent.tsx` — custom lightweight markdown parser (no external deps)
- `components/help/HelpButton.tsx` — reusable help link button

## Sidebar & routing

- Sidebar: `<NavLink href="/help" icon={HelpCircle} label="Help & User Guide" />` (already present)
- App.tsx routes: `/help`, `/help/article/:slug`, `/help/faq`, `/help/videos`, `/help/admin`
