---
name: SSP Module Upgrade
description: Package-aware SSP template registry, prefill wizard, DOCX generation engine — architecture and decisions
---

## What was built

The SSP module was upgraded from a hardcoded L2-only template to a fully package-aware system.

### Template Registry (`artifacts/api-server/src/lib/ssp-template-registry.ts`)
- Static registry of two templates: `CMMC_L1_FCI_SSP_V2_13` and `CMMC_L2_NIST_R2_SSP`
- `resolveCompatibleSSPTemplates(packageKeys[])` mirrors the roadmap-profile resolver pattern
- L1 keys: `CMMC_L1_*`, `FAR_52_204_21`; L2 keys: `CMMC_L2_*`, `NIST_800_171_*`
- `buildPlaceholderValues(wizardValues)` maps wizard camelCase fields → `{{PLACEHOLDER}}` keys

### Prefill Engine (`artifacts/api-server/src/lib/ssp-prefill-engine.ts`)
- Uses `adm-zip` to read/write DOCX as ZIP
- Two-pass replacement: pass 1 = single-run substitution; pass 2 = merge-run for split placeholders
- Processes: `word/document.xml`, `word/header*.xml`, `word/footer*.xml`, endnotes, footnotes
- Master template buffer never modified (copy-then-modify pattern)

### DB Table (`lib/db/src/schema/ssp.ts`)
- Added `ssp_prefill_draftsTable` with `id, organizationId, templateKey, title, status, wizardStep, valuesJson, createdBy`
- Migrated via `migrateSspPrefillDrafts()` in `startup-seed.ts` (CREATE TABLE IF NOT EXISTS)

### API Routes (all in `artifacts/api-server/src/routes/ssp.ts`)
- `GET /api/ssp/templates` — package-aware list for the org
- `GET /api/ssp/templates/:templateKey/download` — download by key (with package-compat check)
- Legacy `GET /api/ssp/templates/cmmc-l2-nist-r2/download` — kept for backward compat (normalises to L2 key)
- `GET/POST /api/ssp/prefill-drafts` — CRUD
- `GET/PATCH/DELETE /api/ssp/prefill-drafts/:draftId`
- `POST /api/ssp/prefill-drafts/:draftId/generate` — streams DOCX buffer
- `GET /api/ssp/prefill-org-profile` — returns org fields for wizard auto-fill

### Frontend
- `ssp-overview.tsx`: `SspResourcesCard` now queries `/api/ssp/templates`; renders `SspTemplateCard` per result; empty-state when no packages assigned
- `ssp-prefill-wizard.tsx`: 8-step wizard at `/ssp/prefill-wizard?templateKey=...&draft=...`
  - Steps: Template → Org Profile → Doc Control → System Scope → Architecture → Roles → Requirements → Review
  - L1: shows all 17 requirements with narrative + status dropdowns
  - L2: shows guidance to use SSP Mappings page for 110 controls
  - Auto-saves draft on step transitions; creates on first save

### Template file locations
Both DOCX masters at `artifacts/api-server/src/data/templates/ssp/` (copied to `dist/data/templates/ssp/` by build.mjs)

### Actual template placeholder keys (discovered by inspecting the DOCX files)
The templates use a specific naming scheme — do not guess, use these:
- L1 has **224** tokens; L2 has **668** tokens
- L1 requirements use Roman numeral ordinal (AC domain = I–IV, IA = V–VI, MP = VII, PE = VIII–IX, SC = X–XI, SI = XII–XV) — NOT the NIST ref format
  - e.g. `AC_L1_B_1_I_IMPLEMENTATION_NARRATIVE` = AC.L1-3.1.1
  - PE only has VIII and IX (consolidates 4 practices into 2 sections)
- L1 architecture keys: `IDENTITY_AUTHENTICATION_AND_ACCESS_ARCHITECTURE`, `ENDPOINT_AND_MALWARE_PROTECTION_ARCHITECTURE`, `NETWORK_AND_BOUNDARY_PROTECTION_ARCHITECTURE`, `EXTERNAL_SYSTEMS_AND_CLOUD_SERVICE_ARCHITECTURE`, `NETWORK_AND_FCI_DATA_FLOW_NARRATIVE`
- **L2 architecture keys differ from L1** — L2 uses shorter names; `buildPlaceholderValues` maps both sets to the same wizard fields. Rule: when adding a template, diff its `{{KEY}}` tokens against both L1 and L2 sets; L2 often shortens names (e.g. `IDENTITY_AUTHENTICATION_AND_ACCESS_ARCHITECTURE` → `IDENTITY_AND_ACCESS_ARCHITECTURE`).
- Scope keys: `ASSESSMENT_SCOPE_NAME`, `IN_SCOPE_FCI_SYSTEMS`, `IN_SCOPE_PEOPLE_AND_ROLES`, `IN_SCOPE_FACILITIES_AND_LOCATIONS`, `BUSINESS_AND_FCI_USE_CASE_DESCRIPTION` (L1) / `BUSINESS_AND_CUI_USE_CASE_DESCRIPTION` (L2)
- L2 uses `CAGE_CODE` (singular) and `SYSTEM_ENCLAVE_NAME` (not `SYSTEM_ENVIRONMENT_NAME`); L1 uses `CAGE_CODES` (plural) and `SYSTEM_ENVIRONMENT_NAME`
- Composite fields: `SECURITY_OFFICER_NAME_AND_TITLE`, `SYSTEM_OWNER_NAME_AND_TITLE`, `PRIMARY_CONTACT_NAME_AND_TITLE`

**Why:** L1-only orgs were seeing the L2 NIST 800-171 template, which is inappropriate and confusing.

**How to apply:** When adding a new SSP template, add to the `SSP_TEMPLATES` array in `ssp-template-registry.ts` and copy the DOCX to `src/data/templates/ssp/`.
