/**
 * Central permission matrix for organization-scoped actions.
 *
 * Authorization order:
 *   1. Global admin (user.role === "admin") → allow all
 *   2. Org membership role (req.orgRole) → resolve via this matrix
 *   3. Legacy global role fallback (req.authUser.role) if no org role set
 */

export type OrgPermission =
  | "documents.generate"
  | "documents.edit"
  | "documents.approve"
  | "documents.delete"
  | "evidence.approve"
  | "evidence.edit"
  | "evidence.delete"
  | "controls.edit"
  | "poam.create"
  | "poam.edit"
  | "poam.close"
  | "tasks.create"
  | "tasks.edit"
  | "roadmap.view"
  | "roadmap.update"
  | "monitoring.update"
  | "users.manage"
  | "org.admin"
  | "reports.generate"
  | "preassessment.run"
  | "ssp.edit";

const ALL_PERMISSIONS: OrgPermission[] = [
  "documents.generate", "documents.edit", "documents.approve", "documents.delete",
  "evidence.approve", "evidence.edit", "evidence.delete",
  "controls.edit",
  "poam.create", "poam.edit", "poam.close",
  "tasks.create", "tasks.edit",
  "roadmap.view", "roadmap.update",
  "monitoring.update",
  "users.manage", "org.admin",
  "reports.generate", "preassessment.run", "ssp.edit",
];

const ROLE_PERMISSIONS: Record<string, OrgPermission[]> = {
  admin:            ALL_PERMISSIONS,
  global_admin:     ALL_PERMISSIONS,
  org_admin:        ALL_PERMISSIONS,
  compliance_manager: [
    "documents.generate", "documents.edit", "documents.approve",
    "evidence.approve", "evidence.edit",
    "controls.edit",
    "poam.create", "poam.edit", "poam.close",
    "tasks.create", "tasks.edit",
    "roadmap.view", "roadmap.update",
    "monitoring.update",
    "reports.generate", "preassessment.run", "ssp.edit",
  ],
  it_contributor: [
    "evidence.edit",
    "controls.edit",
    "poam.create", "poam.edit",
    "tasks.create", "tasks.edit",
    "roadmap.view",
    "monitoring.update",
  ],
  reviewer: [
    "roadmap.view",
  ],
  executive_viewer: [
    "roadmap.view",
  ],
  assessor: [],
};

const PERMISSION_SETS: Record<string, Set<OrgPermission>> = {};
for (const [role, perms] of Object.entries(ROLE_PERMISSIONS)) {
  PERMISSION_SETS[role] = new Set(perms);
}

export function hasOrgPermission(role: string | null | undefined, permission: OrgPermission): boolean {
  if (!role) return false;
  return PERMISSION_SETS[role]?.has(permission) ?? false;
}

export function getOrgPermissions(role: string | null | undefined): OrgPermission[] {
  if (!role) return [];
  return ROLE_PERMISSIONS[role] ?? [];
}

/**
 * Check if the current request has the given permission.
 * Uses req.orgRole (resolved org-specific role) with global-admin bypass.
 * Falls back to req.authUser.role for backward compatibility.
 */
export function canDo(
  req: { authUser?: { role: string } | null; orgRole?: string },
  permission: OrgPermission
): boolean {
  if (req.authUser?.role === "admin") return true;
  const effectiveRole = req.orgRole ?? req.authUser?.role ?? "";
  return hasOrgPermission(effectiveRole, permission);
}
