---
name: Break-glass account
description: Production emergency admin account with MFA bypass, single-session enforcement, and audit trail.
---

## Purpose

`sysadmin@controlhub.com` — production-only break-glass emergency account for locked-out recovery. Must be rotated immediately after use.

## DB changes (applied via raw SQL — drizzle-kit push blocked)

- `users` table: `is_break_glass BOOLEAN DEFAULT false`, `mfa_exempt BOOLEAN DEFAULT false`
- `break_glass_sessions` table: `id, user_id, token_hash (UNIQUE), ip_address, user_agent, created_at, last_active_at, expires_at, revoked_at`

## Drizzle schema

`lib/db/src/schema/users.ts` — `usersTable` has `isBreakGlass`, `mfaExempt`; `breakGlassSessionsTable` defined in same file.

## Auth behavior

**On login** (`artifacts/api-server/src/routes/auth.ts`):
1. MFA check skipped if `user.mfaExempt === true` (condition: `if (!isDemo && !user.mfaExempt)`)
2. Prior `break_glass_sessions` rows with `revoked_at IS NULL` → set `revoked_at = now` (single-session)
3. New session row inserted with `token_hash = hashJwtToken(token)` and `expires_at = now + 4h`
4. `break_glass_login` audit event logged
5. `sendBreakGlassLoginAlert()` called (best-effort, errors caught)
6. JWT issued with `expiresIn: "4h"` (regular users get 24h)

**On each request** (`artifacts/api-server/src/lib/auth.ts`, `requireAuth`):
1. If DB user has `isBreakGlass`, load `break_glass_sessions` row matching `hashJwtToken(bearerToken)`
2. If no active session → 401
3. If `last_active_at < now - 15min` → 401 (idle timeout)
4. If `created_at < now - 4h` → 401 (absolute timeout)
5. If `revoked_at IS NOT NULL` → 401
6. Otherwise: update `last_active_at`, set `req.isBreakGlass = true`

**Note**: `isBreakGlass` is NOT in the JWT payload — it is read from DB on each request.

## API protections

- `PATCH /users/:id` → 403 if `existing.isBreakGlass`
- `DELETE /users/:id` → 403 if `existing.isBreakGlass`
- `POST /users/:id/deactivate` → 403 if `existing.isBreakGlass`
- `GET /organizations/my-orgs` → returns all active orgs (no membership check) if `req.isBreakGlass`

## Frontend (users.tsx)

- Name cell: red "Break-Glass" badge with `ShieldAlert` icon if `u.isBreakGlass`
- Dropdown: shows "Break-glass account — protected" disabled item instead of edit/deactivate/delete

## CLI script

`pnpm --filter @workspace/scripts run create:system-admin`

Generates 18-byte base64url password, hashes with bcrypt(14), upserts user, sets `is_break_glass=true`/`mfa_exempt=true` via raw SQL.

## Email alerts

`sendBreakGlassLoginAlert()` in `artifacts/api-server/src/lib/email.ts` — sends to `BREAK_GLASS_ALERT_EMAIL` env var or falls back to the account's own email. Best-effort.

**Why:**
Emergency accounts are common attack vectors. Single-session + short-lived JWT + idle timeout + email alert ensures any use is immediately visible and traceable.
