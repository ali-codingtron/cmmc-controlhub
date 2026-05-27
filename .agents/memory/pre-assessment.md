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
All routes under `/api/pre-assessment/` registered via `router.use("/pre-assessment", preAssessmentRouter)` in routes/index.ts. Key endpoints: GET/POST `/connections`, POST `/connections/:id/test`, DELETE `/connections/:id`, POST `/scans`, GET `/scans/:id` (returns full scan with findings/evidence/requests/roadmap), GET `/scans/:id/report-data` (structured JSON for PDF), GET `/scans/:id/report.pdf` (streams PDF), PATCH `/findings/:id`, PATCH `/evidence-records/:id`, PATCH `/evidence-requests/:id`, PATCH `/roadmap/:id`, GET `/packs`.

## PDF report generation (pdfkit) — dual-report architecture
Two generators: `pa-report-generator.ts` (Technical, full detail) and `pa-executive-report-generator.ts` (Executive, 4–6 pages). Route `GET /scans/:id/report.pdf?type=executive|technical` dispatches to the correct generator. UI shows two buttons: "Executive Report" (indigo) and "Technical Report" (blue), each calling `downloadReport(type)` with `downloadingType` state. Both generators share the `PaReportData` interface exported from `pa-report-generator.ts`.

**pdfkit rules**: Mark external in `build.mjs`. Standard fonts only (Helvetica/Helvetica-Bold) — no TTF. Use `bufferPages:true` + `doc.switchToPage(i)` for "Page X of Y" footer. Cover page is always page index 0; body pages start at index 1. Severity labels: Critical/High/Medium/Low/Info (never "INFORMATIONAL" — wraps at 46px badge width).

**Domain coverage**: Both reports include a CMMC L2 domain coverage table. Domain extraction from control IDs: `3.X.Y` → section number X → domain abbr (1=AC…14=SI). 14 domains, 110 total controls.

**Recommended due dates**: Critical=+7d, High=+14d, Medium=+30d, Low/Info=+60d from scan completion date. Applied to finding cards (footer line) and evidence requests (Rec: date).

**30/60/90 day roadmap grouping**: P1=First 30 Days, P2=31–60 Days, P3=61–90 Days. Each bucket gets a colored sub-header then a column-header row.

## Frontend pages
8 pages under `/pre-assessment/*`: history (default), run, manual, connections, results/:id, findings, evidence-requests, roadmap. PaResults polls every 3s while scan status is `running` or `not_started`.

## UI improvements applied (spec sections 1–15)
- **pa-results.tsx**: Animated scan progress panel with per-stage/per-pack status; "Tenant Scan Health" replaces "Readiness Score" with Strong/Moderate/Weak/Critical labels; Assessment Confidence, CMMC Controls Evaluated, Evidence Snapshots metrics; Pack status grid (Complete–Passed / Complete–Findings / Data Unavailable); Scope & Limitations card; Findings tab shows `affectedItems` in collapsible section; Dismiss with reason inline form; Create POA&M button navigates to /poams; Permissions tab shows per-pack required permissions, license notes, data availability explanation; Evidence Records show full metadata grid; Roadmap shows P1/P2/P3 priority badges.
- **pa-findings.tsx**: Same finding improvements globally; status filter (open/acknowledged/dismissed); suggestedRoadmapAction display; Roadmap navigation button.
- **pa-evidence-requests.tsx**: Work-item layout with expandable details; overdue/due-soon badges; suggested filename display; Upload Evidence / Link Existing Evidence actions; Submit for Review replaces Mark Submitted.
- Finding type now includes `affectedItems: string[] | null` — comes from `paFindingsTable.affectedItems` jsonb.

## Sidebar icon
Uses `Cable` from lucide-react (not `Bot` which was used for Auto Assessor).
