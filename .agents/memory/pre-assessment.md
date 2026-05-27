---
name: Pre-Assessment Module
description: Tenant-Connected Pre-Assessment module — architecture decisions, auth model, rules engine, DB migration notes
---

## Auth model — OAuth Admin Consent Flow (current)
Control HUB owns ONE multi-tenant app registration (env vars: MICROSOFT_CLIENT_ID, MICROSOFT_CLIENT_SECRET, MICROSOFT_REDIRECT_URI, MICROSOFT_AUTHORITY). Customers click "Connect Microsoft Tenant" → redirected to `login.microsoftonline.com/organizations/v2.0/adminconsent` → after consent, callback stores the tenant connection. Scans then use client_credentials grant against each customer's tenantId using the Control HUB app creds. No per-customer clientId/clientSecret stored.

**OAuth state**: In-memory Map with 15-minute TTL, keyed by state UUID, storing {orgId, userEmail, userId}. Cleaned up every 60s via setInterval.

**Callback redirect**: After successful consent, API redirects to `/pre-assessment/connections?connected=true&tenantName=xxx`. SPA reads query params on mount via `window.location.search` and shows a success/error banner, then clears params via `window.history.replaceState`.

**MICROSOFT_CLIENT_ID not set**: `POST /microsoft/connect/start` returns 503 with clear error message. This is the expected dev state until the operator configures their app registration.

## Rules engine
11 Phase 1 rules (PA-001 to PA-011) live in `assessment-rules.ts`. Each rule has an `evaluate(input: RuleEvalInput)` method that accepts pre-fetched Graph data and returns a structured result. The runner (`pa-rules-engine.ts`) fetches data per pack, stores snapshots, then evaluates all rules matching the requested packs.

## DB migration pitfall
When replacing auto-assessor, old enum types (`auto_intake_answer`, `auto_severity`, `auto_suggested_status`, `auto_finding_category`, `auto_finding_confidence`, `auto_intake_type`, `readiness_status`) must be explicitly dropped via SQL before running `drizzle-kit push`, or drizzle-kit will offer to rename them to the new enum names.

**Why:** drizzle-kit detects orphaned enum types and tries to reuse them via rename prompts when new enums of similar shape are added.

**How to apply:** Before any schema push that removes enums: `DROP TYPE IF EXISTS <old_type> CASCADE;` for each removed enum type first.

## API route structure
All routes under `/api/pre-assessment/` registered via `router.use("/pre-assessment", preAssessmentRouter)` in routes/index.ts. Key endpoints: GET/POST `/connections`, POST `/connections/:id/test`, DELETE `/connections/:id`, POST `/scans`, GET `/scans/:id` (returns full scan with findings/evidence/requests/roadmap), PATCH `/findings/:id`, PATCH `/evidence-records/:id`, PATCH `/evidence-requests/:id`, PATCH `/roadmap/:id`, GET `/packs`.

## Frontend pages
8 pages under `/pre-assessment/*`: history (default), run, manual, connections, results/:id, findings, evidence-requests, roadmap. PaResults polls every 3s while scan status is `running` or `not_started`.

## Sidebar icon
Uses `Cable` from lucide-react (not `Bot` which was used for Auto Assessor).
