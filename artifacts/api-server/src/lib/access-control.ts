/**
 * Centralised authorization resolution for the two-scope role model.
 *
 *   Platform role  (users.role)             → NONE | GLOBAL_ADMIN
 *   Organization role (organization_users)  → ORGANIZATION_ADMIN | COMPLIANCE_MANAGER |
 *                                             IT_CONTRIBUTOR | REVIEWER |
 *                                             EXECUTIVE_VIEWER | ASSESSOR_READ_ONLY
 *
 * Only Global Admin is platform-wide. Every other role is granted through a
 * user-to-organization membership. A Global Admin therefore needs NO membership
 * rows — access derives from the platform role alone.
 *
 * Both the Effective Permissions UI and backend middleware must resolve access
 * through `resolveEffectiveAccess()` so the two can never disagree.
 */

import { db, usersTable, organizationsTable, organizationUsersTable } from "@workspace/db";
import { and, eq } from "drizzle-orm";
import { createHash } from "crypto";
import { getOrgPermissions, type OrgPermission } from "./permissions";

// ─── Canonical role vocabulary ───────────────────────────────────────────────

export type PlatformRole = "none" | "global_admin";

/** Stored `users.role` value meaning "no platform role". */
export const STORED_ROLE_NONE = "none";
/** Stored `users.role` value meaning Global Admin. */
export const STORED_ROLE_GLOBAL_ADMIN = "admin";

/** Legacy global roles kept only so pre-migration accounts are not locked out. */
export const LEGACY_GLOBAL_ROLES = [
  "compliance_manager",
  "it_contributor",
  "reviewer",
  "executive_viewer",
  "assessor",
] as const;

/** Organization roles assignable through a membership. `global_admin` is excluded — it is a platform role. */
export const ASSIGNABLE_ORG_ROLES = [
  "org_admin",
  "compliance_manager",
  "it_contributor",
  "reviewer",
  "executive_viewer",
  "assessor",
] as const;

export type OrgRole = (typeof ASSIGNABLE_ORG_ROLES)[number];

export const ORG_MEMBERSHIP_STATUSES = ["active", "invited", "suspended"] as const;
export type MembershipStatus = (typeof ORG_MEMBERSHIP_STATUSES)[number];

const ROLE_LABELS: Record<string, string> = {
  admin: "Global Admin",
  global_admin: "Global Admin",
  org_admin: "Organization Admin",
  compliance_manager: "Compliance Manager",
  it_contributor: "IT Contributor",
  reviewer: "Reviewer",
  executive_viewer: "Executive Viewer",
  assessor: "Assessor Read-Only",
  none: "None",
};

/** Full, unambiguous display name for a role. Never returns a bare "Admin". */
export function roleLabel(role: string | null | undefined): string {
  if (!role) return "None";
  return ROLE_LABELS[role] ?? role;
}

// ─── Platform-role normalization at the API boundary ─────────────────────────

/**
 * Collapse a stored `users.role` into the canonical platform role.
 * Legacy global roles carry no platform authority, so they normalize to "none".
 */
export function normalizePlatformRole(storedRole: string | null | undefined): PlatformRole {
  return storedRole === STORED_ROLE_GLOBAL_ADMIN ? "global_admin" : "none";
}

/**
 * Map an inbound platform-role value (from any client spelling) onto the single
 * canonical `users.role` value to persist. Returns null when the input is not a
 * recognised platform role, so callers can reject it instead of silently storing
 * an organization role in the platform-role column.
 */
export function platformRoleToStoredRole(input: unknown): "admin" | "none" | null {
  if (input === null || input === undefined) return null;
  const v = String(input).trim().toLowerCase();
  if (v === "admin" || v === "global_admin") return STORED_ROLE_GLOBAL_ADMIN;
  if (v === "none" || v === "" || v === "no_platform_role" || v === "no platform role") {
    return STORED_ROLE_NONE;
  }
  return null;
}

export function isAssignableOrgRole(role: unknown): role is OrgRole {
  return typeof role === "string" && (ASSIGNABLE_ORG_ROLES as readonly string[]).includes(role);
}

export function isMembershipStatus(status: unknown): status is MembershipStatus {
  return typeof status === "string" && (ORG_MEMBERSHIP_STATUSES as readonly string[]).includes(status);
}

// ─── Membership reads (duplicate-safe) ───────────────────────────────────────

/**
 * The subset of the drizzle client these helpers need, so they can run either on
 * the pool or inside an open transaction.
 */
type DbLike = Pick<typeof db, "select">;

export interface DistinctMembership {
  membershipId: string;
  organizationId: string;
  organizationName: string;
  role: string;
  status: string;
  joinedAt: Date | null;
  /** Extra rows for the same (user, org) pair found in the database. 0 when healthy. */
  duplicateRowCount: number;
}

/**
 * Return exactly one membership per organization for a user.
 *
 * The table has historically lacked a UNIQUE(user_id, organization_id) constraint,
 * so duplicates may exist. Reading raw rows made the Users table over-count and
 * made role edits look like they had not saved. Collapsing here keeps every
 * consumer correct even before the duplicate rows are cleaned up.
 */
export async function listDistinctMemberships(
  userId: string,
  /**
   * Optional transaction handle. Pass the active transaction when the caller is
   * about to write, so the "before" snapshot is read under the same lock it will
   * be reconciled against — otherwise concurrent saves can both read the same
   * version and silently overwrite each other.
   */
  tx?: DbLike,
): Promise<DistinctMembership[]> {
  const rows = await (tx ?? db)
    .select({
      membershipId: organizationUsersTable.id,
      organizationId: organizationsTable.id,
      organizationName: organizationsTable.name,
      role: organizationUsersTable.role,
      status: organizationUsersTable.status,
      joinedAt: organizationUsersTable.joinedAt,
    })
    .from(organizationUsersTable)
    .innerJoin(organizationsTable, eq(organizationsTable.id, organizationUsersTable.organizationId))
    .where(eq(organizationUsersTable.userId, userId))
    .orderBy(organizationsTable.name);

  const byOrg = new Map<string, DistinctMembership>();

  for (const row of rows) {
    const current = byOrg.get(row.organizationId);
    if (!current) {
      byOrg.set(row.organizationId, { ...row, duplicateRowCount: 0 });
      continue;
    }
    current.duplicateRowCount += 1;
    // Canonical row = the most recently joined; ties broken by membership id so the
    // choice is deterministic across requests.
    const preferNew =
      (row.joinedAt?.getTime() ?? 0) > (current.joinedAt?.getTime() ?? 0) ||
      ((row.joinedAt?.getTime() ?? 0) === (current.joinedAt?.getTime() ?? 0) &&
        row.membershipId > current.membershipId);
    if (preferNew) {
      byOrg.set(row.organizationId, {
        ...row,
        duplicateRowCount: current.duplicateRowCount,
      });
    }
  }

  return [...byOrg.values()].sort((a, b) => a.organizationName.localeCompare(b.organizationName));
}

/**
 * Fingerprint of a user's canonical membership set, used for optimistic
 * concurrency control on the Organization Access save. The table has no
 * row_version column, so the version is derived from the saved state itself.
 */
export function membershipSetVersion(
  memberships: readonly { organizationId: string; role: string; status: string }[],
): string {
  const canonical = [...memberships]
    .map((m) => `${m.organizationId}:${m.role}:${m.status}`)
    .sort()
    .join("|");
  return createHash("sha256").update(canonical).digest("hex").slice(0, 16);
}

// ─── Effective access resolution ─────────────────────────────────────────────

export type PermissionSource =
  | "PLATFORM_ROLE"
  | "ORGANIZATION_MEMBERSHIP"
  | "LEGACY_GLOBAL_ROLE"
  | "NONE";

export interface EffectiveAccess {
  userId: string;
  organizationId: string | null;
  organizationName: string | null;
  /** Canonical platform role. */
  platformRole: PlatformRole;
  platformRoleLabel: string;
  /** Organization role from the membership, or null for Global Admins / no membership. */
  organizationRole: string | null;
  organizationRoleLabel: string | null;
  /** Membership status — never a role name. Null when no membership exists. */
  membershipStatus: MembershipStatus | null;
  /** Role that actually governs access in this organization. */
  effectiveRole: string;
  effectiveRoleLabel: string;
  permissionSource: PermissionSource;
  /** True when the platform role alone grants access, so memberships are irrelevant. */
  membershipRequired: boolean;
  hasAccess: boolean;
  permissions: OrgPermission[];
  deniedPermissions: OrgPermission[];
  /**
   * A legacy global role still stored on the account (e.g. "compliance_manager"
   * in users.role from before platform and organization roles were separated).
   *
   * INFORMATIONAL ONLY — it never grants access. Access comes from the platform
   * role or an active organization membership, nothing else. This is surfaced so
   * an admin can see which accounts still carry a stale value and migrate them.
   */
  legacyRole: string | null;
  /** Human-readable reason when hasAccess is false. */
  reason: string | null;
}

const ALL_PERMISSIONS = getOrgPermissions("admin");

function denied(granted: readonly OrgPermission[]): OrgPermission[] {
  const g = new Set(granted);
  return ALL_PERMISSIONS.filter((p) => !g.has(p));
}

/**
 * Single source of truth for "what can this user do in this organization".
 *
 * Resolution order:
 *   1. Active Global Admin platform role → all access, source = PLATFORM_ROLE.
 *   2. Active organization membership     → membership role, source = ORGANIZATION_MEMBERSHIP.
 *   3. Legacy global role (logged)        → only to avoid locking out un-migrated accounts.
 *   4. Otherwise                          → no access.
 *
 * Pass organizationId = null to resolve platform-level access only. Global Admin
 * status is reported without requiring an organization to be chosen.
 */
export async function resolveEffectiveAccess(
  userId: string,
  organizationId: string | null,
): Promise<EffectiveAccess | null> {
  const [user] = await db
    .select({ id: usersTable.id, role: usersTable.role, isActive: usersTable.isActive })
    .from(usersTable)
    .where(eq(usersTable.id, userId))
    .limit(1);

  if (!user) return null;

  let organizationName: string | null = null;
  if (organizationId) {
    const [org] = await db
      .select({ name: organizationsTable.name })
      .from(organizationsTable)
      .where(eq(organizationsTable.id, organizationId))
      .limit(1);
    if (!org) return null;
    organizationName = org.name;
  }

  const platformRole = normalizePlatformRole(user.role);

  // Reported for visibility only — see EffectiveAccess.legacyRole. A stale value
  // in users.role grants nothing; it just means the account predates the split
  // between platform roles and organization roles.
  const legacyRole = (LEGACY_GLOBAL_ROLES as readonly string[]).includes(user.role)
    ? user.role
    : null;

  const base = {
    userId,
    organizationId,
    organizationName,
    platformRole,
    platformRoleLabel: platformRole === "global_admin" ? "Global Admin" : "None",
  };

  // 1 ── Global Admin: platform role is authoritative, memberships irrelevant.
  if (platformRole === "global_admin" && user.isActive) {
    return {
      ...base,
      organizationRole: null,
      organizationRoleLabel: null,
      membershipStatus: null,
      effectiveRole: "global_admin",
      effectiveRoleLabel: "Global Admin",
      permissionSource: "PLATFORM_ROLE",
      membershipRequired: false,
      hasAccess: true,
      permissions: ALL_PERMISSIONS,
      deniedPermissions: [],
      legacyRole,
      reason: null,
    };
  }

  const noAccess = (reason: string): EffectiveAccess => ({
    ...base,
    organizationRole: null,
    organizationRoleLabel: null,
    membershipStatus: null,
    effectiveRole: "none",
    effectiveRoleLabel: "None",
    permissionSource: "NONE",
    membershipRequired: true,
    hasAccess: false,
    permissions: [],
    deniedPermissions: ALL_PERMISSIONS,
    legacyRole,
    reason,
  });

  if (!user.isActive) return noAccess("This user account is deactivated.");
  if (!organizationId) return noAccess("Select an organization to resolve this user's access.");

  // 2 ── Organization membership.
  const memberships = await listDistinctMemberships(userId);
  const membership = memberships.find((m) => m.organizationId === organizationId);

  if (membership) {
    const status = isMembershipStatus(membership.status) ? membership.status : "suspended";
    if (status !== "active") {
      return {
        ...noAccess(
          status === "invited"
            ? "This user has been invited to the organization but has not joined yet."
            : "This user's membership in the organization is suspended.",
        ),
        organizationRole: membership.role,
        organizationRoleLabel: roleLabel(membership.role),
        membershipStatus: status,
      };
    }

    const perms = getOrgPermissions(membership.role);
    return {
      ...base,
      organizationRole: membership.role,
      organizationRoleLabel: roleLabel(membership.role),
      membershipStatus: status,
      effectiveRole: membership.role,
      effectiveRoleLabel: roleLabel(membership.role),
      permissionSource: "ORGANIZATION_MEMBERSHIP",
      membershipRequired: true,
      hasAccess: true,
      permissions: perms,
      deniedPermissions: denied(perms),
      legacyRole,
      reason: null,
    };
  }

  // 3 ── No membership. A legacy global role is NOT a licence to enter an
  // organization the user was never assigned to, so this is a hard "no access".
  return noAccess("No active organization membership exists.");
}

/**
 * Count active Global Admins, used to block the platform from reaching a state
 * with no administrator.
 */
export async function countActiveGlobalAdmins(
  excludeUserId?: string,
  tx?: DbLike,
): Promise<number> {
  const rows = await (tx ?? db)
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(and(eq(usersTable.role, STORED_ROLE_GLOBAL_ADMIN), eq(usersTable.isActive, true)));
  return rows.filter((r) => r.id !== excludeUserId).length;
}

/**
 * Advisory lock key that serialises all Global Admin promotions/demotions.
 *
 * The "don't remove the last Global Admin" rule spans multiple rows, so a
 * per-row lock cannot enforce it: two concurrent demotions of different users
 * would each see one remaining admin and both succeed, leaving zero. Every
 * writer that changes platform-role or active state must take this lock inside
 * its transaction so the count and the write are atomic.
 */
export const GLOBAL_ADMIN_LOCK_KEY = 481_517_231;
