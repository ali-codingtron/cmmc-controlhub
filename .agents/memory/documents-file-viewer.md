---
name: Documents module file viewer
description: Key decisions and bugs fixed in the Documentation module — file preview, linked controls, source breakdown, Make Current rename.
---

## Core bugs fixed

1. **GET /documents/:id was missing fileKey/fileName/fileSize** in the `.select()` block — the document detail page always showed an empty "Document Body" card for file-backed docs because the API never returned the file metadata. Fix: add those three columns to the select.

2. **GET /documents/all docItems had `fileKey: null as string | null` hardcoded** — documents always appeared without a file in the list even when they had one. Fix: add fileKey/fileName/templateId to the docRows select and use actual `doc.fileKey ?? null` in docItems.

3. **document_control_maps table has NO `relationship_type` column** — only: id, document_id, control_id, linked_at. Spec sections mentioning relationship types cannot be implemented without a schema migration.

## Architecture decisions

- **Preview endpoint** (`GET /documents/:id/preview`): streams file from GCS with inline Content-Disposition. Returns 404 for no-file docs, 410 with a helpful message for legacy local-disk keys (fileKey doesn't start with `/objects/`). Uses same objectStorageService as evidence preview.
- **Legacy fileKey detection**: `isGcsKey(fileKey)` checks `fileKey.startsWith("/objects/")`. Pre-migration files (stored on ephemeral local disk) will have keys like `<uuid>.docx` with no prefix — these cannot be previewed in production.
- **sourceSubtype field**: added to both GET /documents/:id and GET /documents/all to distinguish "uploaded" | "generated" | "document" | "body" | "empty". Used for badge labels and count breakdown in the frontend.
- **getControlDetails()**: returns `{id, label, title, level, domainName}` — richer than getControlLabels() which only returned the label string. Used in GET /documents/:id response as `linkedControlDetails`.
- **GET /documents/stats**: uses SQL `COUNT(*) FILTER (WHERE ...)` syntax (requires `sql` imported from drizzle-orm, not just `isNull`).

## Frontend patterns

- **DocFileCard component**: inline in document-detail.tsx, uses `useOrg()` hook for org ID, fetches blob URL with auth headers (Authorization + X-Organization-ID), creates object URL for preview modal. Revokes blob URL on dialog close via state management.
- **Conditional content in DocumentDetail**: editing mode always shows textarea; file mode shows DocFileCard; body mode shows pre-formatted text; empty shows placeholder card. File mode takes priority over body check.

## Production observations (VTCCORP.US)

- 2 docs in `documents` table; both have fileKey issues:
  1. VTC procedure: legacy key `<uuid>.docx` (no `/objects/` prefix) — unretrievable from GCS
  2. Lazurus contract: fileKey IS NULL — never had a file uploaded
- Both need manual re-upload via Add Document dialog
- 816 doc-like evidence items, 1084 total evidence items
