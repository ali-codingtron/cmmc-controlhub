# Workspace

## Overview

pnpm workspace monorepo using TypeScript. CMMC Compliance Readiness & Evidence Management Platform for small business defense contractors.

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

See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details.

## Application Architecture

### Artifacts

- **artifacts/api-server** — Express 5 REST API at `/api`, port 8080
- **artifacts/cmmc-app** — React+Vite SPA at `/`, port 19979

### Seeded Data

- 14 CMMC domains, 110 controls (L1/L2), all assessments as "not_started"
- 4 users: admin@example.com, compliance@example.com, reviewer@example.com, assessor@example.com
- All passwords: `Admin1234!`
- Roles: admin, compliance_manager, reviewer, assessor

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
- `/api/domains` — CMMC domains
- `/api/controls` — controls with assessment status, evidence, tasks, POA&Ms
- `/api/evidence` — evidence CRUD, approve/reject/submit/stale/supersede actions
- `/api/tasks` — task CRUD, complete/reopen actions
- `/api/poams` — POA&M CRUD, close action
- `/api/dashboard/*` — summary, domain readiness, recent activity, overdue items
- `/api/assessor/*` — assessor control list, control packages, exports
- `/api/audit-logs` — audit trail
- `/api/documents/templates` — template CRUD (22 system templates seeded)
- `/api/documents` — document CRUD + workflow (submit/approve/reject/activate/archive)
- `/api/documents/generate` — generate a document from a template
- `/api/documents/missing` — gap analysis (controls missing policy/procedure coverage)
- `/api/document-logs` — compliance log instances (generate, complete, approve)
- `/api/checklists` — checklist completion tracking
- `/api/automation/doc-status` — overview stats (totalDocuments, totalTemplates, controlsMissingPolicy, etc.)
- `/api/automation/run-doc-checks` — mark expired docs, generate overdue tasks

### Important Technical Notes

1. **wouter v3 routing**: Uses flat Switch with catch-all `<Route>` (no path) for the Layout wrapper. Avoid nested Switch inside `<Route path="/">` — this fails because wouter v3 does EXACT matching by default. The `nest` prop creates a nested Router that strips the path prefix (breaks inner routes).

2. **bcryptjs**: Uses `bcryptjs` (pure JS), NOT `bcrypt` (native bindings don't work in this env).

3. **JWT**: Secret from `SESSION_SECRET` env var (falls back to default in dev). Token getter registered via `setAuthTokenGetter(() => localStorage.getItem("auth_token"))` in `main.tsx`.

4. **API client hooks**: Params are passed directly (e.g., `useListControls({ search })`) NOT via `{ query: { search } }`.

5. **Orval config**: Uses `mode: "single"` for Zod output. The `lib/api-zod/src/index.ts` only exports `./generated/api`.

6. **Documentation schema**: `documentsTable` has NO `linkedControlIds` column — control links use the `documentControlMapsTable` junction table (`documentId`, `controlId`). Only `documentTemplatesTable` and `generatedLogsTable` have `linkedControlIds` as a direct array column. Always query the junction table when getting control links for a document.
