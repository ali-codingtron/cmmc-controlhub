import { Router } from "express";

// Per-organization SSO config routes have been removed.
// Microsoft SSO is now a global platform feature configured via server
// environment variables (MICROSOFT_SSO_CLIENT_ID, etc.).
// The new SSO routes live in auth.ts:
//   GET /api/auth/sso/status
//   GET /api/auth/microsoft/initiate
//   GET /api/auth/microsoft/callback

const router = Router();

export default router;
