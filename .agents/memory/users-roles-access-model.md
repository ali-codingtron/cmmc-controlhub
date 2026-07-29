---
name: Users & Roles access model
description: The canonical platform-role vs org-role vocabulary, why "no membership = no access", and the invariants any change to Users & Roles must preserve.
---

# Canonical vocabulary

There are exactly **two** platform roles: `none` and `global_admin`. Everything
else (`org_admin`, `compliance_manager`, `it_contributor`, `reviewer`,
`executive_viewer`, `assessor`) is an **organization** role and lives only on a
membership row.

`global_admin` is stored in `users.role` as the string `"admin"`. The API
normalizes at the boundary — never compare `users.role` to `"global_admin"`
directly.

**Why:** these were previously mixed. The UI listed org roles as platform roles,
wrote `it_contributor` when the user picked "none", and the `org_user_role` pg
enum contained `global_admin`, so a platform role could be written onto a
membership. Effective-permission checks then compared values that could never
match, which is why the Effective Permissions tab rendered blank.

**How to apply:** all role reads/writes go through the access-control helpers.
Write-side OpenAPI enums are restricted to `[none, global_admin]` for platform
role and exclude `global_admin` for org roles; read-side enums stay permissive
because legacy values still exist in the database.

# Access resolution

Access comes from the platform role **or** an active organization membership.
Nothing else.

- Global Admin: platform role is authoritative, memberships are irrelevant and
  are NOT materialized as rows.
- Everyone else: requires an `active` membership in that org. `invited` and
  `suspended` are not access.
- A legacy value in `users.role` grants **nothing**. It is reported as
  `legacyRole` for visibility only, so an admin can migrate the account.

**Why:** `users.role` predates the platform/org split. Bulk-migrating legacy
values to `none` was rejected — it would silently strip access and risk
lockouts — so the values stay and are normalized at the API boundary instead.
Verified at the time: only 2 accounts had a legacy role and no membership, and
both already had no org access, so enforcing this was not a regression.

**How to apply:** never add a "legacy role implies access" fallback. If an org
needs access, give it a membership row.

# Invariants to preserve

1. **Never materialize Global Admin memberships.** A per-org insert loop for a
   platform-wide account is what produced ~1,350 duplicate rows (see
   membership-duplicates.md).
2. **Never write a platform role onto a membership**, and never write an org role
   into `users.role`. Both directions are validated server-side; keep the invite
   path validated too, since it is the easiest boundary to forget.
3. **Optimistic concurrency must be checked inside the write transaction**, after
   taking `SELECT ... FOR UPDATE` on the user row. Reading the "before" set
   outside the transaction lets two concurrent saves both pass the version check
   and silently last-writer-wins — which defeats the entire point of the version.
4. **The "don't remove the last active Global Admin" rule needs a transaction-scoped
   advisory lock that also spans the WRITE**, not just the count. The rule spans
   multiple rows, so two concurrent demotions of *different* users would each see
   "one admin left" and both succeed, leaving zero admins. Taking the lock, counting,
   committing, and *then* writing is the subtle version of this bug — the lock is
   released at commit, so the count is stale by the time the write lands. Enforce it
   on **every** path that can remove an admin: role demotion, deactivation, and
   deletion. Missing one path defeats the other two.
5. **Membership writes must act on ALL rows for a (user, org) pair**, not
   `.limit(1)`. While duplicates exist, updating one row leaves the others
   serving the old role — this is why role edits appeared not to save.
6. **User-detail and membership reads are admin-or-self.** The detail payload
   carries account-security facts (break-glass, MFA enrollment/exemption, auth
   provider), so `requireAuth` alone is an IDOR information leak.
7. **Break-glass is protected in the API, not just the UI.** Modifying it or its
   org access returns 403. UI gating is a convenience on top, never the control.

# Two lessons that cost real time here

**Find every writer before declaring a boundary enforced.** `organization_users`
has more than one write path — the Users & Roles endpoints *and* the
organization-scoped member endpoints. Hardening only the first left the platform
role still writable into a membership row through the second, and left those
changes unaudited. When adding a validation or audit rule to a table, grep for
every insert/update of it rather than trusting the module you happen to be in.

**Verify UI guards by actually opening the menu, not by reading the conditional.**
A destructive "Delete User" item sat *after* the `isBreakGlass` ternary rather
than inside its non-protected branch, so it rendered for the protected account
even though the branch above looked correct. Reading the code produced the wrong
conclusion twice; a browser check caught it immediately. Server-side enforcement
is what actually protects the account, but a visible destructive action on a
protected row is still a real defect — check the rendered output.

