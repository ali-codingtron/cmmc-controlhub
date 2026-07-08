---
name: APEX Solutions seed script
description: Production test organization seed with real files, mixed control statuses, and TEST DATA badge in UI.
---

## Fixed org UUID
`7a2f5c8e-4b3d-4a9f-8e2c-1d0a5b6c7d8f` — hard-coded for idempotency. Admin user `apex-admin@apex-solutions.com` / `Admin1234!`.

## Run command
```
pnpm --filter @workspace/scripts run seed:apex-solutions [--force] [--skip-files] [--validate]
```
- `--force`: deletes + recreates org (idempotent overwrite)
- `--skip-files`: seeds DB records only, skips GCS uploads (fast local dev)
- `--validate`: validates expected record counts without seeding

## What it seeds
- 110 control assessments: 35 impl / 42 in_progress / 25 not_started / 8 at_risk
  - Distribution via prime-step: `statusAssignment[(i * 37) % 110]` spreads statuses evenly across all 14 domains
- 77 evidence records with actual files in GCS (PNG, PDF, XLSX, DOCX, CSV)
- 21 documents with actual files in GCS
- 19 monitoring items
- 7 POA&Ms with real control references
- 7 tasks
- Pre-assessment scan: 6 findings, 11 evidence records, 5 requests, 8 roadmap actions, 1 tenant connection

## File generators (all pure Node.js, no shell deps)
- PNG: custom CRC32 + PNG byte encoder (no canvas/sharp)
- PDF: pdfkit
- XLSX: xlsx library
- DOCX: adm-zip + raw XML
- CSV: native string concat

**Why:** adm-zip has no @types package — add `scripts/src/adm-zip.d.ts` with `declare module "adm-zip"` to suppress TS error (same as existing import-doc-template-library.ts pattern). tsx runs it fine at runtime.

## isTestOrganization column
- Added to `lib/db/src/schema/organizations.ts` as `boolean().notNull().default(false)`
- Column already applied to prod DB via `psql ALTER TABLE`
- Exposed in `my-orgs` and `global-stats` API responses
- `OrgSummary` interface includes `isTestOrganization: boolean`

## TEST DATA badge locations
- **Organizations page** (`/organizations`): amber "TEST DATA" pill in OrgCard top-right
- **Sidebar org switcher**: compact amber "TEST" pill next to org name in dropdown
