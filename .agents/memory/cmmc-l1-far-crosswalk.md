---
name: CMMC L1 ↔ FAR 52.204-21 crosswalk
description: Why the crosswalk between CMMC Level 1 and FAR 52.204-21 was missing and how it is seeded.
---

Both packages share exactly 17 identical requirement keys (AC.L1-3.1.1 … SI.L1-3.14.5).
Relationship type: `equivalent` (both packages cover the same 17 L1 practices).

**Why it was missing:** `seedCrosswalkRequirements()` in `startup-seed.ts` had a `nothingToDo` early-return guard that fired once requirements were already populated — the L1↔FAR crosswalk section was never reached on subsequent boots.

**Fix:**
1. Added `l1FarCrosswalkCount` to the parallel count checks.
2. Added `needL1FarCrosswalk` flag to the `nothingToDo` condition.
3. Added a crosswalk seeding block after FAR requirements (fetches both packages' req UUIDs by `requirementId`, inserts `equivalent` rows with `onConflictDoNothing`).
4. Inserted the 17 rows directly into the live DB to fix existing deployments.

**How to apply:** Any time a new package pair is added, follow this same pattern: add a count check for the crosswalk rows, include it in `nothingToDo`, and add an idempotent seeding block.
