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
- `pnpm --filter @workspace/scripts run seed-cmmc` — re-seed CMMC controls (110 controls, 14 domains, 4 users)
- `pnpm --filter @workspace/scripts run seed-organizations` — re-seed 3 organizations + org-specific data

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
| / | Dashboard | Readiness summary, domain progress, activity |
| /controls | Controls | 110 CMMC controls table with search |
| /controls/:id | ControlDetail | Control assessment, evidence, tasks, POA&Ms |
| /evidence | Evidence | Evidence repository list |
| /evidence/upload | EvidenceUpload | Upload new evidence file |
| /evidence/:id | EvidenceDetail | Evidence review & approve/reject |
| /tasks | Tasks | Task list with filtering |
| /tasks/:id | TaskDetail | Task details, complete/reopen |
| /poams | Poams | POA&M list |
| /poams/:id | PoamDetail | POA&M details, close POA&M |
| /assessor | Assessor | Assessor control list for assessment |
| /assessor/controls/:id | AssessorControl | Full assessor package for a control |
| /audit-logs | AuditLogs | System-wide audit trail |
| /users | Users | User management (admin only) |
| /settings | Settings | User settings |
| /organizations | Organizations | Global admin: org management, readiness comparison (admin only) |
| /documents | Documents | Documentation automation overview/stats |
| /documents/list | DocumentsList | All documents with search/filter |
| /documents/templates | DocumentTemplates | 22 seeded templates, generate modal |
| /documents/generate | DocumentsGenerate | Generate document from template |
| /documents/logs | DocumentLogs | Compliance log instances |
| /documents/checklists | DocumentChecklists | Checklist tracking |
| /documents/missing | DocumentsMissing | Gap analysis: missing policies/procedures |
| /documents/:id | DocumentDetail | Document detail + workflow actions |
| /documents/logs/:id | DocumentLogDetail | Log detail + complete/approve actions |

### API Routes

All routes under `/api` prefix, JWT-authenticated:
- `/api/auth/login`, `/api/auth/logout`, `/api/auth/me`
- `/api/users` — user CRUD
- `/api/organizations` — org CRUD (admin only)
- `/api/organizations/my-orgs` — orgs for current user
- `/api/organizations/global-stats` — cross-org summary stats (admin only)
- `/api/domains` — CMMC domains (org-scoped)
- `/api/controls` — controls with assessment status, evidence, tasks, POA&Ms (org-scoped)
- `/api/evidence` — evidence CRUD, approve/reject/submit/stale/supersede actions (org-scoped)
- `/api/tasks` — task CRUD, complete/reopen actions (org-scoped)
- `/api/poams` — POA&M CRUD, close action (org-scoped)
- `/api/dashboard/*` — summary, domain readiness, recent activity, overdue items (org-scoped)
- `/api/assessor/*` — assessor control list, control packages, exports (org-scoped)
- `/api/audit-logs` — audit trail (org-scoped)
- `/api/documents/templates` — template CRUD (22 system templates seeded; global, not org-scoped)
- `/api/documents` — document CRUD + workflow (org-scoped)
- `/api/documents/generate` — generate a document from a template (org-scoped)
- `/api/documents/missing` — gap analysis (org-scoped)
- `/api/document-logs` — compliance log instances (org-scoped)
- `/api/checklists` — checklist completion tracking (org-scoped)
- `/api/automation/doc-status` — overview stats (org-scoped)
- `/api/automation/run-doc-checks` — mark expired docs, generate overdue tasks (org-scoped)

### Important Technical Notes

1. **wouter v3 routing**: Uses flat Switch with catch-all `<Route>` (no path) for the Layout wrapper. Avoid nested Switch inside `<Route path="/">` — this fails because wouter v3 does EXACT matching by default.

2. **bcryptjs**: Uses `bcryptjs` (pure JS), NOT `bcrypt` (native bindings don't work in this env).

3. **JWT**: Secret from `SESSION_SECRET` env var (falls back to default in dev). Token getter registered via `setAuthTokenGetter(() => localStorage.getItem("auth_token"))` in `main.tsx`.

4. **Org ID injection**: `setOrgIdGetter` registered in `OrgContext` via a `useRef` so the getter always reads the latest org ID. The custom fetch client (`lib/api-client-react/src/custom-fetch.ts`) injects `X-Organization-ID` on every request.

5. **API client hooks**: Params are passed directly (e.g., `useListControls({ search })`) NOT via `{ query: { search } }`.

6. **Orval config**: Uses `mode: "single"` for Zod output. The `lib/api-zod/src/index.ts` only exports `./generated/api`.

7. **Documentation schema**: `documentsTable` has NO `linkedControlIds` column — control links use the `documentControlMapsTable` junction table (`documentId`, `controlId`). Only `documentTemplatesTable` and `generatedLogsTable` have `linkedControlIds` as a direct array column. Always query the junction table when getting control links for a document.

8. **Org switcher dropdown**: Uses `onMouseDown` + `e.preventDefault()` (not `onClick`) on list items to prevent blur-before-click issues that would close the dropdown before the selection registers.
