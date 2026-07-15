---
name: Org-role auth architecture
description: Two-role system — global JWT role vs org membership role; how they interact in middleware and frontend.
---

## The rule

All org-scoped permission checks must use `req.orgRole` (org membership role), NOT `req.authUser.role` (global JWT role). Global admins (`req.authUser.role === "admin"`) bypass all org checks.

**Why:** The platform has two role axes:
- `users.role` — platform-level role encoded in JWT. Only meaningful value for gating is `"admin"` (global admin). All other values are legacy.
- `organization_users.role` — org-specific membership role (org_admin, compliance_manager, it_contributor, reviewer, executive_viewer, assessor). This is the authoritative role for all org-scoped access.

**How to apply:**
- `requireOrg` middleware resolves `req.orgRole` from `organization_users.role`; global admins get `req.orgRole = "admin"`.
- `canGenerateDocs` and all org-scoped permission helpers use `req.orgRole ?? req.authUser?.role` for backward compat.
- `requireNotAssessor` checks `req.orgRole ?? req.authUser?.role`.
- The assessor write-block in `requireOrg` runs AFTER org role is resolved (not before).
- Permission matrix lives in `artifacts/api-server/src/lib/permissions.ts` (`canDo`, `hasOrgPermission`, `getOrgPermissions`).

## Frontend
- `activeOrg.role` from OrgContext (populated by `/api/organizations/my-orgs`) is the org-specific role in the UI.
- `useIsAssessor()` checks `activeOrg?.role` first, falls back to global role. Global admins always return false.
- Sidebar feature gating (`canRunAssessment`, `canViewRoadmap`) uses `effectiveOrgRole = isAdmin ? "admin" : (activeOrg?.role ?? user?.role)`.
- Bottom sidebar user label shows org role (not global role), except for global admins who see "Global Admin".
- `ORG_ROLES` dropdown does NOT include `global_admin` — that's a platform-level concept, not an org role.
- Users table "Global Role" column renamed to "Platform Role" to clarify the distinction.
