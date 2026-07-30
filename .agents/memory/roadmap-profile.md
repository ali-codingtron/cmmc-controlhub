---
name: Roadmap profile system
description: How roadmap actions are scoped per org via profile_key — L1 vs L2 profile resolution, seed pattern, and filter approach.
---

# Roadmap Profile System

## Why
A L1 org was seeing all 12 L2 roadmap actions. The fix adds a `profile_key` column to `roadmap_actions` and resolves the org's profile from its compliance packages.

## Schema
`roadmap_actions.profile_key TEXT` (nullable — NULL is treated as CMMC_L2_R2 for backward compat).

## Profile keys
- `CMMC_L2_R2` — CMMC Level 2 / NIST 800-171; the 12 existing L2 actions.
- `CMMC_L1_V2_13` — CMMC Level 1; 8 new L1 actions (sort_order 101–108).

## Resolution logic (in `artifacts/api-server/src/lib/roadmap-profile.ts`)
1. Any `CMMC_L2_*` or `NIST_800_171_*` package → `CMMC_L2_R2`
2. Any `CMMC_L1_*` or `FAR_52_204_21` (no L2/NIST) → `CMMC_L1_V2_13`
3. Otherwise → `null` (no roadmap, returns empty array)

**Why:** L2 supersedes L1. NIST 800-171 uses the same 110 controls so gets L2 actions.

## Seed function (`seedRoadmapActions` in roadmap.ts)
- Phase 1: `UPDATE roadmap_actions SET profile_key='CMMC_L2_R2' WHERE profile_key IS NULL` (one-time migration for existing rows)
- Phase 2: idempotent insert of all L2 and L1 actions by ID

**Why:** The old seed had an early-exit guard that prevented re-runs. New design is always idempotent.

## Filter pattern (GET /roadmap/actions)
```typescript
const profileFilter = profileKey === 'CMMC_L2_R2'
  ? or(eq(roadmapActionsTable.profileKey, 'CMMC_L2_R2'), isNull(roadmapActionsTable.profileKey))
  : eq(roadmapActionsTable.profileKey, profileKey);
```
The `isNull` guard ensures existing NULL rows (pre-migration) are always included for L2.

## /roadmap/profile endpoint
Returns `PROFILE_METADATA[profileKey]` including phases array with `{phase, name, icon, description}`.
Frontend uses this to drive the page title, subtitle, and phase strip descriptions.

## L1 actions
8 actions covering all 17 L1 controls across 6 phases:
1. Scope and Inventory — Define FCI Scope and System Inventory (no control links, general)
2. Logical Access — Configure Authorized Access (AC.L1-3.1.1/2/20/22)
3. Logical Access — Implement Identification and Authentication (IA.L1-3.5.1/2)
4. Physical & Media — Protect and Sanitize Media (MP.L1-3.8.3)
5. Physical & Media — Control Physical Access (PE.L1-3.10.1/3/4/5)
6. Boundary — Protect System Boundaries and Public Components (SC.L1-3.13.1/5)
7. Integrity — Maintain System and Information Integrity (SI.L1-3.14.1/2/4/5)
8. Assessment — Complete Level 1 Self-Assessment (evidence_only links to all 17 controls)

## Dashboard fix
`roadmapTotalActions` in dashboard/summary now resolves org profile, fetches matching action IDs, and uses `inArray` filter on progress queries so L1 orgs see 8 and L2 orgs see 12.

## Frontend notes
- `Map` (lucide icon) conflicts with native JS `Map` constructor — use plain object `Record<number, string>` for `uniquePhases`.
- Phase strips are now dynamic from loaded actions (not hardcoded 1–6), so L1/L2 phases display correctly without a static map lookup conflict.
