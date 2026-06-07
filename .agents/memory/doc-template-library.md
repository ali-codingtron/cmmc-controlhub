---
name: CMMC L2 Document Template Library
description: 67-template library imported from ZIP; satellite tables, API routes, and frontend pages all built in one session.
---

## What was built
- **DB schema**: 6 new columns on `document_templates` (`source_template_id`, `source_package`, `family`, `artifact_type_label`, `purpose`, `scope`); 9 new satellite tables (`doc_template_sections`, `doc_template_requirements`, `doc_template_roles`, `doc_template_procedure_steps`, `doc_template_records`, `doc_template_tables`, `doc_template_placeholders`, `doc_template_control_maps`, `doc_template_import_batches`).
- **API routes** (`artifacts/api-server/src/routes/doc-template-library.ts`):
  - `GET /api/doc-templates/library` — list with search/artifactType/family/controlRef filters
  - `GET /api/doc-templates/library/:id` — full detail with all satellite data
  - `GET /api/doc-templates/families` / `artifact-types` / `placeholders` / `import-batches`
  - `POST /api/admin/doc-templates/import` — admin-only; reads ZIP from workspace root
  - `POST /api/doc-templates/generate` — creates document in `documents` table + links controls
  - `GET /api/doc-templates/generated/:docId/docx` — formatted DOCX via `docx` lib
  - `GET /api/doc-templates/generated/:docId/pdf` — PDF via `pdfkit`
  - `GET /api/doc-templates/control-requirements/:controlId` — required templates + generated docs for a control
- **Frontend pages**:
  - `/documents/templates` — `DocTemplateLibrary` (list + filters + admin import button)
  - `/documents/templates/:id` — `DocTemplateDetail` (all sections, roles, reqs, steps, records, tables, control badges)
  - `/documents/generate` — `DocGenerate` (6-step wizard; DOCX/PDF download on completion)
- **Control detail integration**: "Templates" tab added showing required templates and generated docs
- **Sidebar**: Template Library + Generate Document added to documentationItems

## Import details
- ZIP path at runtime: `${REPL_HOME}/attached_assets/CMMC_L2_Document_Library_1780837345246.zip`
- Import is **idempotent** — checks `source_template_id` before inserting; skips already-imported
- 67 templates, 270 control maps, 67 markdown sections, 268 roles, 146 requirements, 158 steps, 234 records, 53 tables, 15 placeholders
- Import batch record written to `doc_template_import_batches` for audit

## Key decisions
- Templates stored in **existing** `document_templates` table (extended), not a new table — avoids duplicating all the existing document management machinery
- Generated documents saved to **existing** `documents` table with `template_id` FK — works with all existing document workflows (approval, versioning, evidence)
- NIST ref mapping: template JSON has `"3.1.1"` format; controls table `nist_ref` is same format — direct match without needing `control_id`
- `adm-zip` added to both `@workspace/scripts` and `@workspace/api-server` packages
- `useRoute` in DocTemplateDetail accepts optional `id` prop (passed from App.tsx route) as fallback

**Why:** Extending existing tables preserves all document workflow integrations (approval, versioning, compliance logs, gap analysis) without re-implementing them.
