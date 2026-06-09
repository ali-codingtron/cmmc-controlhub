---
name: TOTP MFA implementation
description: Full MFA flow with otplib v13 functional API, AES-256-GCM encrypted secrets, MFA state tokens, account lockout, enforcement policy, and Security Center admin page.
---

# TOTP MFA Implementation

## Key decisions

**otplib v13 — functional API only**
`otplib` v13 dropped the `authenticator` object export. Use named functional imports: `generateSecret`, `generateSync`, `verifySync`, `generateURI` from `"otplib"`. The object-based API (`authenticator.generate(...)`) does not exist in v13.
**Why:** v13 changed the package exports; the authenticator object is not exported from the package root.

**MFA secret encryption**
TOTP secrets are stored AES-256-GCM encrypted in the DB column `mfaSecret`. The key comes from `MFA_ENCRYPTION_KEY` env var (64-char hex = 32 bytes). Dev fallback = 64 zeros; production fails fast if missing. Encrypt/decrypt helpers live in `artifacts/api-server/src/lib/mfa.ts`.

**MFA state token gate**
After password validation, if MFA is required but not complete, login returns `{ mfa_setup_required: true, mfa_state_token }` or `{ mfa_required: true, mfa_state_token }` instead of a real JWT. The frontend detects this shape and shows the MFA screen. Subsequent MFA calls pass `X-Mfa-State-Token` header. State token expires in 10 minutes. Helpers: `artifacts/api-server/src/lib/mfa-jwt.ts`.

**Enforcement modes**
`securitySettingsTable` singleton (id="global"); `mfaEnforcementMode` enum: `disabled | admins_only | privileged | all_users`. Default = `privileged`. "Privileged" = admin + compliance_manager + it_contributor + assessor roles. Routes: `GET/PATCH /api/security/settings`.

**Demo user bypass**
`demo@controlhub.com` always skips the MFA gate in the login route — checked before any enforcement logic.

**Account lockout**
5 failed attempts → locked for 15 minutes. `failedLoginCount` and `lockedUntil` columns on `usersTable`. Admin unlock: `POST /api/security/unlock-user`.

**Frontend MFA screens**
All MFA API calls in `login.tsx` use raw `mfaVerify()`, `mfaSetupStart()`, `mfaSetupVerify()`, etc. functions (NOT hooks) so a custom `X-Mfa-State-Token` header can be passed as the second `options?: RequestInit` arg to the generated functions.

**QR code generation**
`qrcode` npm package (`qrcode.toDataURL(uri)`) converts the otpauth URI to a base64 PNG shown inline in the setup wizard.

**Users table API**
`GET /api/users` now returns `mfaEnabled`, `mfaRequired`, `lockedUntil`, `failedLoginCount` alongside existing fields. OpenAPI `User` schema updated; run codegen after any schema change.

**Admin actions in Users page**
"Reset MFA" and "Unlock Account" dropdown items appear conditionally in the users table row menu: Reset MFA shown when `u.mfaEnabled`, Unlock shown when `u.lockedUntil` is in the future. Hooks: `useMfaReset`, `useUnlockUser`.

## How to apply
- Any new MFA endpoint must use the mfa-jwt helpers for state token validation.
- Never import `authenticator` from otplib — use the functional exports.
- Always encrypt secrets before storing; always decrypt before verifying.
- The `securitySettingsTable` is a singleton — always upsert with `id = 'global'`.
