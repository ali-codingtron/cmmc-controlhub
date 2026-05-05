# Workspace

## Overview

pnpm workspace monorepo using TypeScript. CMMC Compliance Readiness & Evidence Management Platform — **multi-tenant** (MSP/compliance consultant use case). Supports multiple client organizations with full data isolation via `X-Organization-ID` header.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **API framework**: Express 5
- **Database**: PostgreSQL + Drizzle ORM
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **Build**: esbuild (CJS bundle)
- **Frontend**: React 19 + Vite + Tailwind CSS + wouter v3 (routing)
- **Auth**: JWT (jsonwebtoken + bcryptjs), tokens in localStorage

## Key Commands

- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- `pnpm --filter @workspace/api-server run dev` — run API server locally
- `pnpm --filter @workspace/scripts run seed-cmmc` — re-seed CMMC controls (110 controls, 14 domains, 4 users) in dev
- `pnpm --filter @workspace/scripts run seed-organizations` — re-seed 3 demo organizations + org-specific data in dev

### Automatic Production Seeding

On every startup, `artifacts/api-server/src/startup-seed.ts` runs **before** `app.listen()`. It checks each table with a `count()` query and skips any that already have data (fully idempotent).

- **Empty database (production first boot)**: Seeds 14 CMMC domains, 110 controls, 22 document templates, one initial admin user (`admin@example.com` / `Admin1234!` — must be changed immediately), and 19 monitoring items per org
- **Populated database (all subsequent starts)**: All checks pass instantly with no DB writes
- **New org created**: `seedMonitoringItemsForOrg(orgId)` is called from `artifacts/api-server/src/routes/monitoring.ts` on the startup seed pass for any org that has 0 monitoring items

The `cmmc-controls.json` data file is copied to `dist/data/` during the esbuild build step (`build.mjs`). The document templates are embedded directly in `src/data/document-templates-data.ts`.

See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details.

## Application Architecture

### Artifacts

- **artifacts/api-server** — Express 5 REST API at `/api`, port 8080
- **artifacts/cmmc-app** — React+Vite SPA at `/`, port 19979

### Multi-Tenancy

All major data tables have an `organizationId` foreign key. Every API request to scoped routes must include an `X-Organization-ID` header (set automatically by the `OrgContext` / custom fetch client).

**Isolation pattern**:
- `requireOrg` middleware validates the header, checks user membership in the org, and sets `req.orgId`
- All DB queries filter by `eq(table.organizationId, req.orgId)`
- Global admin (role=`admin`) can access all orgs by passing any valid org ID

**Frontend**:
- `OrgContext` (`artifacts/cmmc-app/src/context/OrgContext.tsx`) fetches `GET /api/organizations/my-orgs`, stores active org in `localStorage`, and registers a getter with `setOrgIdGetter()` so every API call includes the header
- `OrgSwitcher` component in the sidebar lets users switch between orgs; switching invalidates all React Query caches

### Seeded Organizations

| Organization | Short Name | CMMC Level | Org ID |
|---|---|---|---|
| Internal Company | Internal | L2 | `41b0ab05-34f3-44ec-933f-ea9bb472a190` |
| Apex Defense LLC | Apex | L2 | `ce9886b3-34e0-4c93-a380-b444aa2ab459` |
| Meridian Systems Inc | Meridian | L2 | `d48c1977-06e2-4dc6-a310-b771d9945055` |

### Seeded Users

| Email | Password | Role | Org Access |
|---|---|---|---|
| admin@example.com | Admin1234! | admin (global) | All 3 orgs |
| compliance@example.com | Admin1234! | compliance_manager | Internal Company |
| reviewer@example.com | Admin1234! | reviewer | Internal Company |
| assessor@example.com | Admin1234! | assessor | Internal Company |
| sarah@apex-defense.com | Admin1234! | member | Apex Defense LLC |
| derek@apex-defense.com | Admin1234! | admin | Apex Defense LLC |
| james@meridian-systems.com | Admin1234! | member | Meridian Systems Inc |
| priya@meridian-systems.com | Admin1234! | admin | Meridian Systems Inc |

### Key Pages

| Route | Component | Description |
|---|---|---|
| / | Dashboard | Executive compliance dashboard — 6 KPI cards, domain readiness, activity timeline, recommended next actions |
| /controls | Controls | 110 CMMC controls table with search |
| /controls/:id | ControlDetail | Control assessment, evidence (w/ bulk select), tasks, POA&Ms |
| /evidence | Evidence | Evidence repository list |
| /evidence/upload | EvidenceUpload | Upload new evidence file |
| /evidence/:id | EvidenceDetail | Evidence review & approve/reject (back button uses browser history) |
| /monitoring | MonitoringTracker | 19-row inline-editable CMMC L2 operational monitoring tracker (replaces Tasks in sidebar) |
| /tasks | Tasks | Task list with filtering (still accessible, not in sidebar) |
| /tasks/:id | TaskDetail | Task details, complete/reopen |
| /poams | Poams | POA&M list with filters, summary stats, Add POA&M dialog |
| /poams/:id | PoamDetail | POA&M details, close POA&M |
| /assessor | Assessor | Assessor control list for assessment |
| /assessor/controls/:id | AssessorControl | Full assessor package for a control |
| /audit-logs | AuditLogs | System-wide audit trail |
| /users | Users | User management (admin only) |
| /settings | Settings | User settings |
| /organizations | Organizations | Global admin: org management, readiness comparison (admin only) |
| /documents | Documents | Documentation overview/stats (no templates) |
| /documents/list | DocumentsList | All documents with search/filter, Add Document dialog (file upload) |
| /documents/logs | DocumentLogs | Compliance log instances |
| /documents/checklists | DocumentChecklists | Checklist tracking |
| /documents/missing | DocumentsMissing | Gap analysis: missing policies/procedures |
| /documents/:id | DocumentDetail | Document detail + workflow actions |
| /documents/logs/:id | DocumentLogDetail | Log detail + complete/approve actions |

### API Routes

All routes under `/api` prefix, JWT-authenticated:
- `/api/auth/login`, `/api/auth/logout`, `/api/auth/me`
- `/api/users` — user CRUD (create, list, update, deactivate, activate, reset-password, delete) + org membership management (`/api/users/:id/orgs`)
- `/api/organizations` — org CRUD (admin only)
- `/api/organizations/my-orgs` — orgs for current user
- `/api/organizations/global-stats` — cross-org summary stats (admin only)
- `/api/domains` — CMMC domains (org-scoped)
- `/api/controls` — controls with assessment status, evidence, tasks, POA&Ms (org-scoped)
- `/api/evidence` — evidence CRUD, approve/reject/submit/stale/supersede actions (org-scoped); `PATCH /api/evidence/bulk-status` for bulk status updates
- `/api/monitoring` — monitoring item list (GET with frequency/status/controlRef/search filters) + inline update (PATCH :id) + stats (GET /stats); org-scoped; 19 items pre-seeded per org
- `/api/tasks` — task CRUD, complete/reopen actions (org-scoped)
- `/api/poams` — POA&M CRUD, close action (org-scoped)
- `/api/dashboard/*` — summary (incl. monitoringOverdue, monitoringDueSoon, monitoringTotal, overduePoams, controlsWithApprovedEvidence, controlsWithNarrative, activePolicies, activeProcedures), domain readiness, recent activity, overdue items (org-scoped)
- `/api/assessor/*` — assessor control list, control packages, exports (org-scoped)
- `/api/audit-logs` — audit trail (org-scoped)
- `/api/documents` — document CRUD + workflow (org-scoped); `POST /api/documents/upload` for file-based upload; `GET /api/documents/:id/download` for file download
- `/api/documents/missing` — gap analysis (org-scoped)
- `/api/document-logs` — compliance log instances (org-scoped)
- `/api/checklists` — checklist completion tracking (org-scoped)
- `/api/automation/doc-status` — overview stats (org-scoped)
- `/api/automation/run-doc-checks` — mark expired docs, generate overdue tasks (org-scoped)

### Evidence File Storage

Evidence files are stored in **Replit Object Storage (GCS-backed)** — persistent across deployments.

- **Upload flow**: multer `memoryStorage()` buffers the file in RAM → server uploads buffer directly to GCS → stores `/objects/evidence/<uuid><ext>` as `fileKey` in the DB
- **Download / Preview flow**: server reads `fileKey`; if it starts with `/objects/` → stream from GCS; otherwise fall back to local disk (backward-compat for pre-migration dev records)
- **Delete**: removes the GCS object (best-effort) + the DB record
- **GCS client**: `artifacts/api-server/src/lib/objectStorage.ts` (copied from object-storage skill; uses Replit sidecar auth — do not modify the client setup)
- **ACL**: `artifacts/api-server/src/lib/objectAcl.ts` (framework in place; evidence objects are currently served without ACL enforcement — authenticated by JWT middleware on the route)
- **Bucket**: `DEFAULT_OBJECT_STORAGE_BUCKET_ID` env var (already provisioned)

### Important Technical Notes

1. **wouter v3 routing**: Uses flat Switch with catch-all `<Route>` (no path) for the Layout wrapper. Avoid nested Switch inside `<Route path="/">` — this fails because wouter v3 does EXACT matching by default.

2. **bcryptjs**: Uses `bcryptjs` (pure JS), NOT `bcrypt` (native bindings don't work in this env).

3. **JWT**: Secret from `SESSION_SECRET` env var (falls back to default in dev). Token getter registered via `setAuthTokenGetter(() => localStorage.getItem("auth_token"))` in `main.tsx`.

4. **Org ID injection**: `setOrgIdGetter` registered in `OrgContext` via a `useRef` so the getter always reads the latest org ID. The custom fetch client (`lib/api-client-react/src/custom-fetch.ts`) injects `X-Organization-ID` on every request.

5. **API client hooks**: Params are passed directly (e.g., `useListControls({ search })`) NOT via `{ query: { search } }`.

6. **Orval config**: Uses `mode: "single"` for Zod output. The `lib/api-zod/src/index.ts` only exports `./generated/api`.

7. **Documentation schema**: `documentsTable` has NO `linkedControlIds` column — control links use the `documentControlMapsTable` junction table (`documentId`, `controlId`). Only `documentTemplatesTable` and `generatedLogsTable` have `linkedControlIds` as a direct array column. Always query the junction table when getting control links for a document.

8. **Org switcher dropdown**: Uses `onMouseDown` + `e.preventDefault()` (not `onClick`) on list items to prevent blur-before-click issues that would close the dropdown before the selection registers.

9. **User deletion cascade**: `DELETE /api/users/:id` runs a full transaction that: nullifies nullable FK references in `audit_logs`, `control_assessments`, `tasks`, `poams`, `documents`, `document_versions`, `generated_logs`, `log_entries`, `procedure_task_rules`, and `evidence_items`; reassigns NOT-NULL `ownerId` fields in `documents` and `evidence_items` to the deleting admin; deletes `document_reviews` and `checklist_completions` rows for the user; removes org memberships; then deletes the user record.
