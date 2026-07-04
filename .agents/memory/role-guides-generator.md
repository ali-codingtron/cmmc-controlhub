---
name: Role-Based User Guides Generator
description: How generate-role-guides.ts works, key decisions, and runtime constraints.
---

## Script: scripts/src/generate-role-guides.ts

Generates 4 role-specific PDF user guides: Admin, Compliance Manager, Reviewer, Assessor.

**Why:** Users needed depth matching the VTCCORP.US assessor guide (2.3 MB, 18 sections, 14+ screenshots).

**How to apply:** Run one guide at a time via `GUIDE_ONLY_ROLES=<key> pnpm generate:role-guides` — 2+ guides at once hits the 120s bash timeout.

## Key design decisions

- **Internal Company seeding**: `seedInternalCompanyData()` creates 4 control assessments + 4 evidence items + 2 POA&Ms for Internal Company org (idempotent — checks before insert). This enables evidence_detail screenshots for admin/compliance/reviewer guides.
- **VTCCORP.US for assessor**: Assessor guide uses VTCCORP.US org (has pre-existing seeded data from generate-assessor-guide.ts seed flow).
- **Chromium**: Uses `execSync("which chromium")` as executablePath — bundled Playwright chromium fails with libglib-2.0.so.0 missing on NixOS.
- **Screenshots per role**: Admin 13, Compliance 12, Reviewer 10, Assessor 14. All control tabs captured (Implementation, Configure, Evidence, Monitoring, POA&M, SSP).
- **Run one at a time**: Each guide takes ~80-90s. Running 2 at once exceeds the 120s shell timeout.

## Critical: networkidle never fires on Vite dev server

`waitUntil: "networkidle"` permanently blocks on the Vite dev server because HMR keeps
a WebSocket connection open. Always use `domcontentloaded` + `.waitForSelector(".no-print")`
(sidebar) as proof that auth succeeded and layout rendered. This was the root cause of
all screenshots looking identical (pages captured before React finished rendering).

## Output sizes (after screenshot fix)

- Admin: ~2.5 MB, 20 sections, 13 screenshots
- Compliance Manager: ~1.8 MB, 18 sections, 12 screenshots
- Reviewer: ~1.6 MB, 16 sections, 10 screenshots
- Assessor: ~2.1 MB, 18 sections, 14 screenshots

## Screenshot helpers (v2 fixed)

- `injectAuth()`: domcontentloaded + .no-print selector wait + 2.5s settle
- `nav()`: domcontentloaded + .no-print selector wait + 3s settle
- `addBanner(page, label)`: injects fixed dark banner with label + URL path on every screenshot
- `clickTab()`: waits for `aria-selected="true"` after click before returning

## GUIDE_ONLY_ROLES keys

`admin`, `compliance_manager`, `reviewer`, `assessor`

## Evidence types used in seeding

Valid DB enum values: `policy`, `screenshot`, `report`, `access_review`, `scan_report`  
Valid evidence status: `approved`, `pending_review`, `rejected`, `stale`, `archived`, `assessor_ready`
