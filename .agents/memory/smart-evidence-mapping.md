---
name: Smart Evidence Mapping
description: Local-only evidence analysis engine that suggests CMMC controls from filenames + content. No external AI.
---

# Smart Evidence Mapping

## Architecture

- **Endpoint**: `POST /api/evidence/smart-map` in `artifacts/api-server/src/routes/evidence-smart-map.ts`
- **Router registered**: `artifacts/api-server/src/routes/index.ts`
- **Frontend panel**: inline in `EvidenceUploadModal.tsx` (not a separate modal step)
- **Settings indicator**: `SmartMappingCard` component in `artifacts/cmmc-app/src/pages/settings.tsx`

## Analysis pipeline (fully local, no external APIs)

1. Text extraction by file type:
   - DOCX → mammoth.extractRawText()
   - XLSX / CSV → ExcelJS (sheet names + headers + first 8 rows)
   - TXT/JSON/YAML/LOG/MD → buffer.toString('utf8', 0, 30_000)
   - PDF → raw Latin-1 buffer scan for `(literal strings)` and `BT...ET` blocks (no pdfjs needed)
   - Images / unsupported → filename analysis only
2. Regex control-ID extraction from filename + text: all formats (AC.L1-3.1.1, AC-3.1.1, 3.1.1, AC_L1_3_1_1)
3. Per-control scoring: exact-ID-in-filename=99, exact-ID-in-content=95, alt-format=90/87, numeric-in-filename=78, numeric-in-content=65, keyword-ratio×38+40 = 40–78 + 5pt evidenceType boost
4. Top 5 results; minimum score 38 to appear

## Confidence tiers

- ≥ 95: Exact Match (pre-selected in UI)
- ≥ 80: High Confidence (pre-selected in UI)
- ≥ 65: Medium Confidence (shown, unchecked)
- ≥ 40: Low Confidence (shown, unchecked)

## Default settings (all in code, not DB-driven yet)

Smart Mapping Enabled, Processing Mode = Local Content Analysis, External AI = Off,
Require User Confirmation = On, Auto-Link High Confidence = Off

## DB query note

`controlsTable` has `domainId` (FK) — not `domainName`. Must LEFT JOIN `domainsTable` on `domainId = domainsTable.id` to get the domain name.

**Why:** Controls schema stores domain as a FK; domain name lives in the domains table.

## Key constraint

All evidence, filenames, extracted text, and metadata must NEVER leave the server to any external AI provider.
This is a hard product requirement. If adding AI in future, it must be a separate explicitly-approved feature.
