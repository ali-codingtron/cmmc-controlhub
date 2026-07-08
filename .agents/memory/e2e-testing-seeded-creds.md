---
name: E2E testing with seeded credentials
description: Gotchas when using replit.md-documented seed credentials for runTest/curl-based e2e verification — passwords and MFA state can drift from docs after prior sessions' experiments.
---

## Seeded passwords can go stale

`replit.md` documents seed credentials (e.g. `admin@example.com` / `Admin1234!`), but prior sessions may have reset a specific test user's password while debugging (password reset flows, account lockout tests, etc.) without updating the doc. A user existing with `is_active=true` and no lockout does **not** guarantee the documented password still works.

**How to apply:** Before writing a runTest plan around seeded credentials, do a quick `curl -X POST /api/auth/login` sanity check for the exact account you intend to use. If it returns `Invalid credentials`, don't assume the seed script is broken — try another seeded user with the same role, or fall back to creating a fresh throwaway user.

## Per-user MFA opt-in overrides global enforcement mode

`securitySettingsTable.mfaEnforcementMode` can be `disabled` globally while a specific user still has `mfaEnabled=true` on their own row (e.g. an admin account that was used to test/demo the MFA setup flow in an earlier session). That user will still hit the MFA/2FA screen on login regardless of the global mode — global "disabled" only stops *new* MFA enrollment prompts, it doesn't retroactively turn off MFA for users who already opted in.

**How to apply:** When an e2e login test unexpectedly hits an MFA/2FA screen, check `SELECT mfa_enabled FROM users WHERE email = ...` before assuming the enforcement policy is misconfigured. For a quick one-off browser test, it's safe to temporarily flip `mfa_enabled = false` for that dev-only test account, run the test, then flip it back — cheaper than decrypting a TOTP secret or scripting a code generator. Prefer picking a different seeded user with `mfa_enabled = false` and the right role if one exists, to avoid touching another account's state at all.
