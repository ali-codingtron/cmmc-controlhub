---
name: Demo experience
description: Public /demo landing page, demo login endpoint, seed script, DemoModeContext, DemoBanner, GuidedTour
---

## Demo architecture

- `/demo` and `/demo-video` are PUBLIC routes in `App.tsx` (outside `<Guard>` and `<Layout>`) — placed before the catch-all route.
- `DemoModeProvider` wraps the App (inside OrgProvider).
- `isDemoMode` stored in `localStorage` as `"isDemoMode"="true"`.

## Key files

- `scripts/src/seed-demo.ts` — idempotent seed for CarmeTechnology org + all data. Run: `pnpm --filter @workspace/scripts run seed-demo`. Use `--force` to re-seed.
- `artifacts/api-server/src/routes/auth.ts` — `POST /api/auth/demo-login` (no password). Returns `{ token, user, isDemoMode: true, demoOrgId }`. Disabled when `ENABLE_PUBLIC_DEMO=false`.
- `artifacts/cmmc-app/src/context/DemoModeContext.tsx` — `useDemoMode()` hook, `enableDemoMode()`, `disableDemoMode()`.
- `artifacts/cmmc-app/src/components/DemoBanner.tsx` — amber banner shown at top of main content area when in demo mode.
- `artifacts/cmmc-app/src/components/GuidedTour.tsx` — 9-step tour card (bottom-right), triggered from DemoBanner "Start Tour" button.

## Demo data (CarmeTechnology org)

- Demo user: `demo@controlhub.com` / `DemoMode1!` / role: `reviewer`
- Org ID: seeded fresh each time (check DB or seed output)
- 110 control assessments: ~50% implemented, 20% in_progress, 20% not_started, 10% at_risk
- 20 evidence items, 8 POA&Ms, 19 monitoring items, 6 tasks
- 1 PA tenant connection + 1 completed scan (94 checks), 12 findings, 8 evidence records, 6 evidence requests, 10 roadmap actions

## DB enum pitfalls (monitoring)

- `monitoring_frequency` enum has only: `daily, weekly, monthly, quarterly, annually` — NO `semi_annually` or `as_needed`. Use `annually` for both.
- `task_type` enum: valid values include `training_review` (NOT `training`).

**Why:** TypeScript types from Drizzle are exact — invalid enum values cause TS2769 overload errors at compile time.
