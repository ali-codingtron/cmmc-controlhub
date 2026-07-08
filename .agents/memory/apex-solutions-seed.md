---
name: APEX Solutions seed script
description: Production test organization seed with real files in GCS; fixed UUID; isTestOrganization flag; TEST DATA badge in UI.
---

## Fixed org UUID
`7a2f5c8e-4b3d-4a9f-8e2c-1d0a5b6c7d8f` — hard-coded for idempotency.

## Two-phase seeding

### Phase 1 — DB records (startup, automatic)
`artifacts/api-server/src/seed-apex-startup.ts` runs at server startup if APEX org doesn't exist yet. Seeds:
- Org record (isTestOrganization=true) + user memberships
- 110 control assessments: 35 impl / 42 in_progress / 25 not_started / 8 at_risk
- 19 monitoring items, 7 POA&Ms, 7 tasks
- Pre-assessment scan: 6 findings, 11 evidence records, 5 requests, 8 roadmap actions

### Phase 2 — Real files in GCS (one-shot HTTP endpoint)
```
POST /api/admin/seed-apex-files
Header: X-Seed-Secret: apex-seed-2026-controlhub
```
Route: `artifacts/api-server/src/routes/seed-apex-files.ts`
- Idempotent: skips if org already has evidence/documents
- Uploads 77 evidence files + 21 documents to GCS, creates all DB rows + control links
- admin@example.com has MFA so call endpoint directly with secret header (no JWT needed)

## What the file seed creates
- 77 evidence records with actual files in GCS (PNG screenshots, PDF reports, XLSX reviews, DOCX procedures, CSV exports)
- 21 documents with actual files (policies/procedures as DOCX, logs/registers as XLSX, records as PDF)
- 97 evidence→control links, 47 document→control links
- Evidence covers all 12 CMMC domains: AC (14), IA (10), AU (8), CM (8), RA (6), IR (5), SC (6), SI (6), MP (4), AT (4), PE (3), PS (2)

## File generators (all pure Node.js, no shell deps)
- PNG: custom CRC32 + PNG byte encoder (no canvas/sharp)
- PDF: pdfkit with org-branded header/footer
- XLSX: xlsx library with realistic row data
- DOCX: adm-zip + raw OOXML
- CSV: native string concat

**Why adm-zip:** has no @types package — add `scripts/src/adm-zip.d.ts` with `declare module "adm-zip"` to suppress TS error in scripts package. The api-server is fine since esbuild doesn't type-check.

## isTestOrganization column
- Added to `lib/db/src/schema/organizations.ts` as `boolean().notNull().default(false)`
- Column already applied to prod DB via `psql ALTER TABLE`
- Exposed in `my-orgs` and `global-stats` API responses

## TEST DATA badge locations
- **Organizations page** (`/organizations`): amber "TEST DATA" pill in OrgCard top-right
- **Sidebar org switcher**: compact amber "TEST" pill next to org name in dropdown
