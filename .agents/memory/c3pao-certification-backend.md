---
name: C3PAO certification backend
description: Architecture decisions for the CMMC L2 C3PAO certification module backend — shared schema, L2 eligibility, activation methods.
---

# C3PAO Certification Backend

## Shared Zod Schema
- Location: `lib/db/src/schema/certification-validation.ts`
- Exported from `@workspace/db` (included in `lib/db/src/schema/index.ts`)
- `certificationRecordSchema` + `formatCertError(issues)` are available to both API and frontend
- All error messages are pre-crafted in the schema — `formatCertError` just returns `issues[0].message` directly
- CMMC UID must be normalized to uppercase before passing to safeParse (route does `.toUpperCase().replace(/[^A-Z0-9]/g,"")`)

## L2 Eligibility
- Middleware: `requireL2CertificationEligible` in `certification.ts`
- Checks `organization_packages` for `package_id = 'pkg-cmmc-l2-self'` + `is_active = true`
- Applied to ALL 24 certification routes (after requireAuth + requireOrg)
- Error: 404 "CMMC Level 2 C3PAO Certification is not available for this organization."

## Activation Methods
- `activationMethod` column on `certification_records`: "GLOBAL_ADMIN_DIRECT" | "SECOND_PERSON_VERIFIED" | null
- Global Admin direct: POST /initiate with `officialRecords` array in body → skips VERIFICATION_PENDING
- Standard: POST /initiate → VERIFICATION_PENDING → POST /verify → sets "SECOND_PERSON_VERIFIED"
- Legacy /admin-override endpoint also sets "GLOBAL_ADMIN_DIRECT"

## DB Schema Additions
- `certification_official_records`: 8 new nullable columns (documentDate, issuedBy, version, externalRepositoryName, externalDocumentId, externalUrl, isExternalReference, originalFilename)
- `certification_records`: `activationMethod` column
- Migration: `migrateCertificationOfficialRecordsColumns()` in startup-seed.ts — runs every boot (idempotent)

## API Response
- `c3paoAssessmentReference` is an alias for `assessmentUniqueId` added via `mapCertRecord()` helper in GET /status and GET /records
- Also returned in POST /initiate response

**Why:**
These patterns were established in Task 89. Keep them consistent; do not bypass the shared Zod schema for new certification validation code.
