---
name: organization_users duplicate rows
description: How idempotent-looking seeding produced ~1,350 duplicate membership rows, how to detect it, and why the unique constraint must come last.
---

# The bug pattern

`organization_users` has **no `UNIQUE(user_id, organization_id)` constraint** —
only the primary key on `id`.

A seed routine inserted per-org memberships with `.onConflictDoNothing()` and a
**freshly generated UUID for `id` on every run**. Because the only unique index
is on `id`, the conflict clause matched nothing and every server restart appended
another full set of rows. Result: 1,372 raw rows for 36 real (user, org) pairs,
~1,350 of them on a single platform-wide account.

**Why it matters:** `.onConflictDoNothing()` reads as idempotent but is only
idempotent against an actual unique index. If the column pair you care about has
no constraint, it is a no-op.

**How to apply:** when writing seed or upsert code, confirm a unique index exists
on the columns you are conflicting against — `onConflictDoNothing` /
`onConflictDoUpdate` with a surrogate-key-only table silently duplicates.

# Symptoms it caused

- Org counts in list UIs inflated (a "+N more" popover showing absurd numbers),
  because the UI counted raw rows instead of distinct orgs.
- Role/status edits appeared not to persist: the writer used `.limit(1)` and
  updated one of many duplicate rows, so reads still returned an old row.

# Detection and repair order

Order matters:

1. **Diagnose read-only first.** Compare `COUNT(*)` against
   `COUNT(DISTINCT (user_id, organization_id))`, per user and platform-wide, and
   check whether the unique index exists.
2. **Fix the writer** that creates duplicates, or cleanup will just refill.
3. **Collapse duplicates in application reads** so every consumer is correct even
   before the data is cleaned. This decouples the code fix from the data fix and
   lets the repair wait for approval.
4. **Delete redundant rows** — only with explicit user approval, retaining a
   deterministic canonical row (prefer active, then latest `joined_at`, then
   highest id) and writing a backup report first.
5. **Add the unique constraint last.** Adding it while duplicates remain fails.
   The repair tooling refuses to add it until the table is clean.

**Why the constraint is last:** it is the thing that makes the bug permanently
impossible, but it cannot be created on dirty data, so it can only follow a
successful cleanup.
