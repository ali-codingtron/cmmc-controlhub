import { Router } from "express";
import bcrypt from 'bcryptjs';
import { db, usersTable, userInvitationsTable } from "@workspace/db";
import { organizationsTable, organizationUsersTable } from "@workspace/db";
import {
  auditLogsTable,
  controlAssessmentsTable,
  tasksTable,
  poamsTable,
  documentsTable,
  documentVersionsTable,
  documentReviewsTable,
  generatedLogsTable,
  logEntriesTable,
  checklistCompletionsTable,
  procedureTaskRulesTable,
  evidenceItemsTable,
  passwordResetTokensTable,
} from "@workspace/db";
import { eq, and, isNull, inArray, sql } from "drizzle-orm";
import { requireAuth, requireRole } from "../lib/auth";
import { logAudit } from "../lib/audit";
import {
  ASSIGNABLE_ORG_ROLES,
  GLOBAL_ADMIN_LOCK_KEY,
  LEGACY_GLOBAL_ROLES,
  countActiveGlobalAdmins,
  isAssignableOrgRole,
  isMembershipStatus,
  listDistinctMemberships,
  membershipSetVersion,
  normalizePlatformRole,
  platformRoleToStoredRole,
  resolveEffectiveAccess,
  roleLabel,
  type MembershipStatus,
  type OrgRole,
} from "../lib/access-control";
import { randomUUID } from "crypto";
import { logger } from "../lib/logger";
import { sendPasswordResetEmail, getAppBaseUrl } from "../lib/email";
import { generateResetToken, RESET_TOKEN_EXPIRY_MINUTES } from "../lib/password-reset-token";

const router = Router();
const SALT_ROUNDS = 12;

// Signals a last-active-Global-Admin violation from inside a transaction so the
// whole unit of work rolls back. Thrown, not returned, because the check lives in
// the same transaction as the writes it guards.
const LAST_ADMIN_SENTINEL = "LAST_ACTIVE_GLOBAL_ADMIN";

// ── List users ───────────────────────────────────────────────────────────────
router.get("/users", requireAuth, async (req, res) => {
  const users = await db
    .select({
      id: usersTable.id,
      name: usersTable.name,
      email: usersTable.email,
      role: usersTable.role,
      status: usersTable.status,
      title: usersTable.title,
      department: usersTable.department,
      isActive: usersTable.isActive,
      invitedAt: usersTable.invitedAt,
      lastLoginAt: usersTable.lastLoginAt,
      createdAt: usersTable.createdAt,
      mfaEnabled: usersTable.mfaEnabled,
      mfaRequired: usersTable.mfaRequired,
      mfaResetRequired: usersTable.mfaResetRequired,
      lockedUntil: usersTable.lockedUntil,
      failedLoginCount: usersTable.failedLoginCount,
      isBreakGlass: usersTable.isBreakGlass,
      mfaExempt: usersTable.mfaExempt,
      invitationExpiresAt: userInvitationsTable.expiresAt,
    })
    .from(usersTable)
    .leftJoin(
      userInvitationsTable,
      and(
        eq(userInvitationsTable.userId, usersTable.id),
        eq(userInvitationsTable.status, "pending"),
      ),
    )
    .orderBy(usersTable.name);

  res.json(users);
});

// ── Create user ──────────────────────────────────────────────────────────────
router.post("/users", requireAuth, requireRole("admin"), async (req, res) => {
  const { name, email, password, role, title, department } = req.body;
  if (!name || !email || !password) {
    res.status(400).json({ error: "name, email, password required" });
    return;
  }

  const existing = await db
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(eq(usersTable.email, email.toLowerCase()))
    .limit(1);

  if (existing.length > 0) {
    res.status(409).json({ error: "Email already in use" });
    return;
  }

  // New users default to Platform Role = None. Access then comes solely from the
  // organization memberships assigned to them.
  const storedRole = role === undefined ? "none" : platformRoleToStoredRole(role);
  if (!storedRole) {
    res.status(400).json({
      error: `Invalid platform role "${String(role)}". Allowed: none, global_admin. Organization-specific roles are assigned through organization access.`,
    });
    return;
  }

  const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
  const id = randomUUID();

  await db.insert(usersTable).values({
    id,
    name,
    email: email.toLowerCase(),
    passwordHash,
    role: storedRole,
    title,
    department,
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  await logAudit(req, "created", "user", id, {
    entityLabel: name,
    newValue: { platformRole: normalizePlatformRole(storedRole) },
  });

  const [created] = await db
    .select({
      id: usersTable.id,
      name: usersTable.name,
      email: usersTable.email,
      role: usersTable.role,
      title: usersTable.title,
      department: usersTable.department,
      isActive: usersTable.isActive,
      createdAt: usersTable.createdAt,
    })
    .from(usersTable)
    .where(eq(usersTable.id, id))
    .limit(1);

  res.status(201).json(created);
});

// ── Migration dry-run report ─────────────────────────────────────────────────
router.get("/users/migration-report", requireAuth, requireRole("admin"), async (req, res) => {
  const allUsers = await db
    .select({ id: usersTable.id, name: usersTable.name, email: usersTable.email, role: usersTable.role, isActive: usersTable.isActive })
    .from(usersTable)
    .orderBy(usersTable.name);

  const allMemberships = await db
    .select({
      userId: organizationUsersTable.userId,
      organizationId: organizationUsersTable.organizationId,
      orgName: organizationsTable.name,
      role: organizationUsersTable.role,
      status: organizationUsersTable.status,
    })
    .from(organizationUsersTable)
    .leftJoin(organizationsTable, eq(organizationUsersTable.organizationId, organizationsTable.id));

  const membershipMap: Record<string, typeof allMemberships> = {};
  for (const m of allMemberships) {
    if (!membershipMap[m.userId]) membershipMap[m.userId] = [];
    membershipMap[m.userId].push(m);
  }

  const legacyNonAdminRoles = ["compliance_manager", "it_contributor", "reviewer", "executive_viewer", "assessor"];

  const report = {
    summary: {
      totalUsers: allUsers.length,
      globalAdmins: allUsers.filter(u => u.role === "admin").length,
      usersWithLegacyNonGlobalRole: allUsers.filter(u => legacyNonAdminRoles.includes(u.role)).length,
      usersWithOrgMemberships: allUsers.filter(u => (membershipMap[u.id] ?? []).length > 0).length,
      usersWithNoMembership: allUsers.filter(u => u.role !== "admin" && (membershipMap[u.id] ?? []).length === 0).length,
    },
    users: allUsers.map(u => {
      const memberships = (membershipMap[u.id] ?? []).map(m => ({
        orgId: m.organizationId,
        orgName: m.orgName ?? m.organizationId,
        role: m.role,
        status: m.status,
      }));
      const hasLegacyRole = legacyNonAdminRoles.includes(u.role);
      const hasMemberships = memberships.length > 0;
      return {
        userId: u.id,
        userName: u.name,
        email: u.email,
        legacyRole: u.role,
        isGlobalAdmin: u.role === "admin",
        isActive: u.isActive,
        orgMemberships: memberships,
        hasLegacyRoleConflict: hasLegacyRole && hasMemberships,
        noOrgAccess: u.role !== "admin" && !hasMemberships,
        resolution: u.role === "admin"
          ? "Global Admin — no changes needed"
          : hasMemberships
            ? `Org membership role overrides legacy "${u.role}" — no action needed`
            : `No org access — assign this user to at least one organization`,
      };
    }),
  };

  res.json(report);
});

// ── Get user ─────────────────────────────────────────────────────────────────
// Authoritative source for the Edit User modal. Returns the canonical platform
// role alongside the raw stored role so the client never has to guess.
// Admin-or-self only. This payload carries account-security facts (break-glass,
// MFA enrollment/exemption, auth provider, protection state), so it must not be
// readable by any authenticated user for any other user id.
router.get("/users/:id", requireAuth, async (req, res) => {
  const userId = req.params.id as string;

  if (req.authUser!.role !== "admin" && req.authUser!.id !== userId) {
    res.status(403).json({ error: "You can only view your own user record." });
    return;
  }

  const [user] = await db
    .select({
      id: usersTable.id,
      name: usersTable.name,
      email: usersTable.email,
      role: usersTable.role,
      status: usersTable.status,
      title: usersTable.title,
      department: usersTable.department,
      isActive: usersTable.isActive,
      invitedAt: usersTable.invitedAt,
      inviteAcceptedAt: usersTable.inviteAcceptedAt,
      lastLoginAt: usersTable.lastLoginAt,
      createdAt: usersTable.createdAt,
      updatedAt: usersTable.updatedAt,
      mfaEnabled: usersTable.mfaEnabled,
      mfaExempt: usersTable.mfaExempt,
      isBreakGlass: usersTable.isBreakGlass,
      authProvider: usersTable.authProvider,
      invitationStatus: userInvitationsTable.status,
      invitationExpiresAt: userInvitationsTable.expiresAt,
    })
    .from(usersTable)
    .leftJoin(
      userInvitationsTable,
      and(
        eq(userInvitationsTable.userId, usersTable.id),
        eq(userInvitationsTable.status, "pending"),
      ),
    )
    .where(eq(usersTable.id, userId))
    .limit(1);

  if (!user) {
    res.status(404).json({ error: "Not found" });
    return;
  }

  await logAudit(req, "viewed", "user", userId, { entityLabel: user.email });

  res.json({
    ...user,
    platformRole: normalizePlatformRole(user.role),
    platformRoleLabel: roleLabel(normalizePlatformRole(user.role) === "global_admin" ? "admin" : "none"),
    /** True when this account is protected from routine destructive edits. */
    isProtected: user.isBreakGlass,
    /** Legacy global role still stored on the account, surfaced for the migration report. */
    legacyRole: (LEGACY_GLOBAL_ROLES as readonly string[]).includes(user.role) ? user.role : null,
  });
});

// ── Effective access (single source of truth) ────────────────────────────────
// organizationId is optional: omit it to resolve platform-level access only, so a
// Global Admin can be reported without first choosing an organization.
router.get("/users/:id/effective-access", requireAuth, requireRole("admin"), async (req, res) => {
  const userId = req.params.id as string;
  const organizationId = (req.query.organizationId as string | undefined) || null;

  const access = await resolveEffectiveAccess(userId, organizationId);
  if (!access) {
    res.status(404).json({ error: organizationId ? "User or organization not found" : "User not found" });
    return;
  }

  await logAudit(req, "viewed", "user_effective_permissions", userId, {
    newValue: { organizationId, effectiveRole: access.effectiveRole, source: access.permissionSource },
  });

  res.json(access);
});

// ── Update user ──────────────────────────────────────────────────────────────
router.patch("/users/:id", requireAuth, requireRole("admin"), async (req, res) => {
  const { name, email, role, title, department, isActive } = req.body;
  const [existing] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.id, req.params.id as string))
    .limit(1);

  if (!existing) {
    res.status(404).json({ error: "Not found" });
    return;
  }

  if (existing.isBreakGlass) {
    await logAudit(req, "updated", "user", req.params.id as string, {
      entityLabel: existing.email,
      newValue: { blocked: true, reason: "protected break-glass account" },
    });
    res.status(403).json({ error: "The break-glass emergency account cannot be modified through the UI. Use the CLI script to rotate credentials." });
    return;
  }

  // Normalize the platform role at the API boundary so null / "" / "none" /
  // "global_admin" can never be stored inconsistently, and an ORGANIZATION role
  // can never be smuggled into the platform-role column.
  let nextRole = existing.role;
  if (role !== undefined) {
    const normalized = platformRoleToStoredRole(role);
    if (!normalized) {
      res.status(400).json({
        error: `Invalid platform role "${String(role)}". Allowed: none, global_admin. Organization-specific roles are assigned through organization access.`,
      });
      return;
    }
    nextRole = normalized;
  }

  // If email is changing, check for conflicts
  if (email && email.toLowerCase() !== existing.email) {
    const conflict = await db
      .select({ id: usersTable.id })
      .from(usersTable)
      .where(eq(usersTable.email, email.toLowerCase()))
      .limit(1);
    if (conflict.length > 0) {
      res.status(409).json({ error: "Email already in use" });
      return;
    }
  }

  const roleChanged = nextRole !== existing.role;
  const updateValues = {
    name: name ?? existing.name,
    email: email ? email.toLowerCase() : existing.email,
    role: nextRole,
    title: title !== undefined ? title : existing.title,
    department: department !== undefined ? department : existing.department,
    isActive: isActive !== undefined ? isActive : existing.isActive,
    updatedAt: new Date(),
  };

  // Never let the platform end up with no active Global Admin. The check and the
  // write MUST share one transaction holding the advisory lock — releasing the
  // lock between them lets two concurrent demotions each see "one admin left"
  // and both commit, stranding the platform with zero admins.
  const isDemotion =
    existing.role === "admin" && (nextRole !== "admin" || isActive === false);

  if (isDemotion) {
    const wouldStrand = await db.transaction(async (tx) => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(${GLOBAL_ADMIN_LOCK_KEY})`);
      if ((await countActiveGlobalAdmins(existing.id, tx)) === 0) return true;
      await tx
        .update(usersTable)
        .set(updateValues)
        .where(eq(usersTable.id, req.params.id as string));
      return false;
    });
    if (wouldStrand) {
      res.status(409).json({
        error:
          "This is the last active Global Admin. Assign Global Admin to another active user before removing it here.",
      });
      return;
    }
  } else {
    await db
      .update(usersTable)
      .set(updateValues)
      .where(eq(usersTable.id, req.params.id as string));
  }

  await logAudit(req, roleChanged ? "role_changed" : "updated", "user", req.params.id as string, {
    entityLabel: existing.email,
    previousValue: roleChanged
      ? { platformRole: normalizePlatformRole(existing.role), storedRole: existing.role }
      : undefined,
    newValue: roleChanged
      ? {
          change:
            normalizePlatformRole(nextRole) === "global_admin"
              ? "global_admin_assigned"
              : "global_admin_removed",
          platformRole: normalizePlatformRole(nextRole),
          storedRole: nextRole,
        }
      : undefined,
  });

  const [updated] = await db
    .select({
      id: usersTable.id,
      name: usersTable.name,
      email: usersTable.email,
      role: usersTable.role,
      title: usersTable.title,
      department: usersTable.department,
      isActive: usersTable.isActive,
      updatedAt: usersTable.updatedAt,
    })
    .from(usersTable)
    .where(eq(usersTable.id, req.params.id as string))
    .limit(1);

  res.json({ ...updated, platformRole: normalizePlatformRole(nextRole) });
});

// ── Delete user ──────────────────────────────────────────────────────────────
router.delete("/users/:id", requireAuth, requireRole("admin"), async (req, res) => {
  const [existing] = await db
    .select({ id: usersTable.id, name: usersTable.name, email: usersTable.email, role: usersTable.role, isBreakGlass: usersTable.isBreakGlass })
    .from(usersTable)
    .where(eq(usersTable.id, req.params.id as string))
    .limit(1);

  if (!existing) {
    res.status(404).json({ error: "Not found" });
    return;
  }

  if (existing.isBreakGlass) {
    res.status(403).json({ error: "The break-glass emergency account cannot be deleted. Deactivate it via the CLI if needed." });
    return;
  }

  // Prevent self-deletion
  if (req.authUser?.id === req.params.id as string) {
    res.status(400).json({ error: "Cannot delete your own account" });
    return;
  }

  const targetId = req.params.id as string;
  const adminId = req.authUser!.id;

  // Deleting an admin is the most permanent way to remove one, so it enforces the
  // same last-active-Global-Admin invariant. The lock is taken at the top of the
  // SAME transaction that performs the delete, so the count cannot go stale between
  // the check and the write, and a violation rolls the whole delete back.
  try {
    await db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(${GLOBAL_ADMIN_LOCK_KEY})`);
    if (
      normalizePlatformRole(existing.role) === "global_admin" &&
      (await countActiveGlobalAdmins(existing.id, tx)) === 0
    ) {
      throw new Error(LAST_ADMIN_SENTINEL);
    }

    // Nullify nullable FK references so the user row can be deleted
    await tx.update(auditLogsTable).set({ userId: null }).where(eq(auditLogsTable.userId, targetId));
    await tx.update(controlAssessmentsTable).set({ assessedById: null }).where(eq(controlAssessmentsTable.assessedById, targetId));
    await tx.update(tasksTable).set({ assigneeId: null }).where(eq(tasksTable.assigneeId, targetId));
    await tx.update(tasksTable).set({ createdById: null as any }).where(eq(tasksTable.createdById, targetId));
    await tx.update(poamsTable).set({ ownerId: null }).where(eq(poamsTable.ownerId, targetId));
    await tx.update(documentsTable).set({ reviewerId: null }).where(eq(documentsTable.reviewerId, targetId));
    await tx.update(documentsTable).set({ approverId: null }).where(eq(documentsTable.approverId, targetId));
    await tx.update(documentVersionsTable).set({ changedById: null }).where(eq(documentVersionsTable.changedById, targetId));
    await tx.update(generatedLogsTable).set({ responsibleUserId: null }).where(eq(generatedLogsTable.responsibleUserId, targetId));
    await tx.update(generatedLogsTable).set({ reviewerId: null }).where(eq(generatedLogsTable.reviewerId, targetId));
    await tx.update(generatedLogsTable).set({ approverId: null }).where(eq(generatedLogsTable.approverId, targetId));
    await tx.update(logEntriesTable).set({ completedById: null }).where(eq(logEntriesTable.completedById, targetId));
    await tx.update(procedureTaskRulesTable).set({ assigneeId: null }).where(eq(procedureTaskRulesTable.assigneeId, targetId));
    await tx.update(procedureTaskRulesTable).set({ escalationOwnerId: null }).where(eq(procedureTaskRulesTable.escalationOwnerId, targetId));
    await tx.update(evidenceItemsTable).set({ reviewerId: null }).where(eq(evidenceItemsTable.reviewerId, targetId));
    await tx.update(evidenceItemsTable).set({ approverId: null }).where(eq(evidenceItemsTable.approverId, targetId));

    // Reassign NOT NULL owner fields to the admin performing the delete
    await tx.update(documentsTable).set({ ownerId: adminId }).where(eq(documentsTable.ownerId, targetId));
    await tx.update(evidenceItemsTable).set({ ownerId: adminId }).where(eq(evidenceItemsTable.ownerId, targetId));

    // Delete records where the user reference is NOT NULL and can't be nullified
    await tx.delete(documentReviewsTable).where(eq(documentReviewsTable.reviewerId, targetId));
    await tx.delete(checklistCompletionsTable).where(eq(checklistCompletionsTable.completedById, targetId));

    // Remove org memberships
    await tx.delete(organizationUsersTable).where(eq(organizationUsersTable.userId, targetId));

    // Finally delete the user
    await tx.delete(usersTable).where(eq(usersTable.id, targetId));
    });
  } catch (err) {
    if (err instanceof Error && err.message === LAST_ADMIN_SENTINEL) {
      res.status(409).json({
        error:
          "This is the last active Global Admin. Assign Global Admin to another active user before deleting this one.",
      });
      return;
    }
    throw err;
  }

  await logAudit(req, "deleted", "user", existing.id, { entityLabel: existing.email });

  res.json({ success: true });
});

// ── Deactivate user ──────────────────────────────────────────────────────────
router.post("/users/:id/deactivate", requireAuth, requireRole("admin"), async (req, res) => {
  const [existing] = await db
    .select({ id: usersTable.id, name: usersTable.name, email: usersTable.email, role: usersTable.role, isBreakGlass: usersTable.isBreakGlass })
    .from(usersTable)
    .where(eq(usersTable.id, req.params.id as string))
    .limit(1);

  if (!existing) {
    res.status(404).json({ error: "Not found" });
    return;
  }

  if (existing.isBreakGlass) {
    res.status(403).json({ error: "The break-glass emergency account cannot be deactivated through the UI. Use the CLI script to manage it." });
    return;
  }

  if (req.authUser?.id === req.params.id as string) {
    res.status(400).json({ error: "Cannot deactivate your own account" });
    return;
  }

  // Deactivating an admin removes an active Global Admin just as surely as
  // demoting one, so this path enforces the same invariant under the same lock,
  // with the check and the write in one transaction.
  const wouldStrand = await db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(${GLOBAL_ADMIN_LOCK_KEY})`);
    if (
      normalizePlatformRole(existing.role) === "global_admin" &&
      (await countActiveGlobalAdmins(existing.id, tx)) === 0
    ) {
      return true;
    }
    await tx
      .update(usersTable)
      .set({ isActive: false, status: "suspended", updatedAt: new Date() })
      .where(eq(usersTable.id, req.params.id as string));
    return false;
  });

  if (wouldStrand) {
    res.status(409).json({
      error:
        "This is the last active Global Admin. Assign Global Admin to another active user before deactivating this one.",
    });
    return;
  }

  await logAudit(req, "deactivated", "user", existing.id, { entityLabel: existing.email });

  const [updated] = await db
    .select({
      id: usersTable.id,
      name: usersTable.name,
      email: usersTable.email,
      role: usersTable.role,
      title: usersTable.title,
      department: usersTable.department,
      isActive: usersTable.isActive,
      updatedAt: usersTable.updatedAt,
    })
    .from(usersTable)
    .where(eq(usersTable.id, req.params.id as string))
    .limit(1);

  res.json(updated);
});

// ── Activate user ────────────────────────────────────────────────────────────
router.post("/users/:id/activate", requireAuth, requireRole("admin"), async (req, res) => {
  const [existing] = await db
    .select({ id: usersTable.id, name: usersTable.name, email: usersTable.email })
    .from(usersTable)
    .where(eq(usersTable.id, req.params.id as string))
    .limit(1);

  if (!existing) {
    res.status(404).json({ error: "Not found" });
    return;
  }

  await db
    .update(usersTable)
    .set({ isActive: true, status: "active", updatedAt: new Date() })
    .where(eq(usersTable.id, req.params.id as string));

  await logAudit(req, "activated", "user", existing.id, { entityLabel: existing.email });

  const [updated] = await db
    .select({
      id: usersTable.id,
      name: usersTable.name,
      email: usersTable.email,
      role: usersTable.role,
      title: usersTable.title,
      department: usersTable.department,
      isActive: usersTable.isActive,
      updatedAt: usersTable.updatedAt,
    })
    .from(usersTable)
    .where(eq(usersTable.id, req.params.id as string))
    .limit(1);

  res.json(updated);
});

// ── Reset password ───────────────────────────────────────────────────────────
router.post("/users/:id/reset-password", requireAuth, requireRole("admin"), async (req, res) => {
  const { password } = req.body;
  if (!password || password.length < 8) {
    res.status(400).json({ error: "Password must be at least 8 characters" });
    return;
  }

  const [existing] = await db
    .select({ id: usersTable.id, email: usersTable.email })
    .from(usersTable)
    .where(eq(usersTable.id, req.params.id as string))
    .limit(1);

  if (!existing) {
    res.status(404).json({ error: "Not found" });
    return;
  }

  const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
  await db
    .update(usersTable)
    .set({ passwordHash, updatedAt: new Date() })
    .where(eq(usersTable.id, req.params.id as string));

  await logAudit(req, "password_reset", "user", existing.id, { entityLabel: existing.email });

  res.json({ success: true });
});

// ── Admin: Send Password Reset Email ─────────────────────────────────────────
router.post("/users/:id/send-password-reset", requireAuth, requireRole("admin"), async (req, res) => {
  const [user] = await db
    .select()
    .from(usersTable)
    .where(and(eq(usersTable.id, req.params.id as string), eq(usersTable.isActive, true)))
    .limit(1);

  if (!user) {
    res.status(404).json({ error: "User not found or inactive" });
    return;
  }

  // Revoke existing pending tokens
  await db
    .update(passwordResetTokensTable)
    .set({ status: "revoked", updatedAt: new Date() })
    .where(
      and(
        eq(passwordResetTokensTable.userId, user.id),
        eq(passwordResetTokensTable.status, "pending"),
      ),
    );

  const { rawToken, tokenHash } = generateResetToken();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + RESET_TOKEN_EXPIRY_MINUTES * 60 * 1000);

  await db.insert(passwordResetTokensTable).values({
    id: randomUUID(),
    userId: user.id,
    tokenHash,
    status: "pending",
    expiresAt,
    requestedAt: now,
    requestedIp: req.ip ?? "unknown",
    requestedUserAgent: req.headers["user-agent"] ?? "",
    createdAt: now,
    updatedAt: now,
  });

  await logAudit(req, "password_reset_link_sent_by_admin" as any, "user", user.id, {
    entityLabel: user.email,
    newValue: { sentBy: (req as any).user?.email },
  });

  const resetUrl = `${getAppBaseUrl()}/reset-password?token=${rawToken}`;
  let emailSent = false;

  try {
    await sendPasswordResetEmail({
      toEmail: user.email,
      toName: user.name.split(" ")[0] || user.name,
      resetUrl,
    });
    emailSent = true;
  } catch (err) {
    logger.warn({ err, email: user.email }, "Failed to send admin-triggered password reset email");
  }

  res.json({ success: true, emailSent, resetUrl: emailSent ? undefined : resetUrl });
});

// ── Get user org memberships ─────────────────────────────────────────────────
// Returns exactly one row per organization. Reading raw rows previously made the
// Users table over-count ("+1164 more") because the table has historically lacked
// a UNIQUE(user_id, organization_id) constraint.
// Admin-or-self only: which organizations a user belongs to, and in what role, is
// not information every authenticated user should be able to read about anyone else.
router.get("/users/:id/orgs", requireAuth, async (req, res) => {
  const userId = req.params.id as string;

  if (req.authUser!.role !== "admin" && req.authUser!.id !== userId) {
    res.status(403).json({ error: "You can only view your own organization access." });
    return;
  }

  const memberships = await listDistinctMemberships(userId);
  res.json(memberships);
});

// ── Canonical organization-access state ──────────────────────────────────────
router.get("/users/:id/organization-access", requireAuth, requireRole("admin"), async (req, res) => {
  const userId = req.params.id as string;

  const [user] = await db
    .select({ id: usersTable.id, role: usersTable.role })
    .from(usersTable)
    .where(eq(usersTable.id, userId))
    .limit(1);

  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  res.json(await buildOrganizationAccessState(userId, user.role));
});

/**
 * Build the organization-access envelope for a user.
 *
 * For Global Admins, memberships are NOT the source of access — the platform role
 * is. Any rows that exist are historical and are reported as such rather than as
 * required grants.
 */
async function buildOrganizationAccessState(userId: string, storedRole: string) {
  const memberships = await listDistinctMemberships(userId);
  const platformRole = normalizePlatformRole(storedRole);
  const duplicateRowCount = memberships.reduce((sum, m) => sum + m.duplicateRowCount, 0);

  return {
    userId,
    platformRole,
    membershipRequired: platformRole !== "global_admin",
    platformAccessNote:
      platformRole === "global_admin"
        ? "Global Admin has platform-wide access to all organizations. Organization-specific memberships are not required."
        : null,
    memberships,
    distinctOrganizationCount: memberships.length,
    duplicateRowCount,
    version: membershipSetVersion(memberships),
  };
}

// ── Transactionally replace the full organization-membership set ─────────────
router.put("/users/:id/organization-access", requireAuth, requireRole("admin"), async (req, res) => {
  const userId = req.params.id as string;
  const { memberships: incoming, expectedVersion, reason } = req.body ?? {};

  if (!Array.isArray(incoming)) {
    res.status(400).json({ error: "memberships must be an array" });
    return;
  }

  // 2 ── Verify the target user exists.
  const [user] = await db
    .select({
      id: usersTable.id,
      email: usersTable.email,
      role: usersTable.role,
      isBreakGlass: usersTable.isBreakGlass,
    })
    .from(usersTable)
    .where(eq(usersTable.id, userId))
    .limit(1);

  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  // 7 ── Protected accounts are never reshaped through the standard modal.
  if (user.isBreakGlass) {
    await logAudit(req, "org_access_changed", "user", userId, {
      entityLabel: user.email,
      newValue: { blocked: true, reason: "protected break-glass account" },
    });
    res.status(403).json({
      error:
        "The break-glass emergency account is protected. Its access comes from the Global Admin platform role and cannot be changed here.",
    });
    return;
  }

  // 3/4/5 ── Validate every organization ID, role and status; reject duplicates.
  const seen = new Set<string>();
  const desired: { organizationId: string; role: OrgRole; status: MembershipStatus }[] = [];

  for (const entry of incoming) {
    const organizationId = entry?.organizationId;
    if (typeof organizationId !== "string" || !organizationId) {
      res.status(400).json({ error: "Every membership requires an organizationId" });
      return;
    }
    if (seen.has(organizationId)) {
      res.status(400).json({ error: "The same organization was assigned more than once" });
      return;
    }
    seen.add(organizationId);

    if (!isAssignableOrgRole(entry?.role)) {
      res.status(400).json({
        error: `Invalid organization role "${String(entry?.role)}". Allowed: ${ASSIGNABLE_ORG_ROLES.join(", ")}`,
      });
      return;
    }
    const status = entry?.status ?? "active";
    if (!isMembershipStatus(status)) {
      res.status(400).json({ error: `Invalid membership status "${String(status)}"` });
      return;
    }
    desired.push({ organizationId, role: entry.role, status });
  }

  if (desired.length > 0) {
    const validOrgs = await db
      .select({ id: organizationsTable.id })
      .from(organizationsTable)
      .where(inArray(organizationsTable.id, desired.map((d) => d.organizationId)));
    if (validOrgs.length !== desired.length) {
      res.status(400).json({ error: "One or more organizations do not exist" });
      return;
    }
  }

  // 6-10 ── Read the current set, check the version, and reconcile — all inside a
  // single transaction that first takes a row lock on the user. Reading the
  // "before" set outside the transaction would let two concurrent saves both pass
  // the version check and silently last-writer-wins, which is exactly what
  // expectedVersion exists to prevent. The lock serialises membership writes per
  // user, so the version observed here is the version we write against.
  let before: Awaited<ReturnType<typeof listDistinctMemberships>> = [];
  let added: typeof desired = [];
  let changed: typeof desired = [];
  let removed: typeof before = [];
  let beforeByOrg = new Map<string, (typeof before)[number]>();

  try {
    const conflict = await db.transaction(async (tx) => {
      // Serialise concurrent membership edits for this user.
      await tx.execute(sql`SELECT id FROM users WHERE id = ${userId} FOR UPDATE`);

      before = await listDistinctMemberships(userId, tx);
      const currentVersion = membershipSetVersion(before);
      if (expectedVersion && expectedVersion !== currentVersion) {
        return currentVersion;
      }

      beforeByOrg = new Map(before.map((m) => [m.organizationId, m]));
      const desiredByOrg = new Map(desired.map((d) => [d.organizationId, d]));

      added = desired.filter((d) => !beforeByOrg.has(d.organizationId));
      removed = before.filter((m) => !desiredByOrg.has(m.organizationId));
      changed = desired.filter((d) => {
        const prev = beforeByOrg.get(d.organizationId);
        return prev && (prev.role !== d.role || prev.status !== d.status);
      });

      for (const d of desired) {
        const prev = beforeByOrg.get(d.organizationId);
        if (prev) {
          // Update EVERY row for this pair, not just one. Duplicate rows would
          // otherwise keep serving the old role after a successful save.
          await tx
            .update(organizationUsersTable)
            .set({ role: d.role, status: d.status })
            .where(
              and(
                eq(organizationUsersTable.userId, userId),
                eq(organizationUsersTable.organizationId, d.organizationId),
              ),
            );
        } else {
          await tx.insert(organizationUsersTable).values({
            id: randomUUID(),
            organizationId: d.organizationId,
            userId,
            role: d.role,
            status: d.status,
            joinedAt: new Date(),
          });
        }
      }

      for (const m of removed) {
        await tx
          .delete(organizationUsersTable)
          .where(
            and(
              eq(organizationUsersTable.userId, userId),
              eq(organizationUsersTable.organizationId, m.organizationId),
            ),
          );
      }

      return null;
    });

    if (conflict) {
      res.status(409).json({
        error:
          "This user's organization access was changed by someone else. Reload the user and re-apply your changes.",
        currentVersion: conflict,
      });
      return;
    }
  } catch (err) {
    logger.error({ err, userId }, "Organization access save failed — transaction rolled back");
    await logAudit(req, "org_access_changed", "user", userId, {
      entityLabel: user.email,
      newValue: { success: false },
    });
    res.status(500).json({
      error: "Organization access could not be saved. No changes were applied.",
    });
    return;
  }

  // 11 ── Audit each distinct change with previous and new values.
  const summarize = (m: { organizationId: string; role: string; status: string }) => ({
    organizationId: m.organizationId,
    role: m.role,
    roleLabel: roleLabel(m.role),
    status: m.status,
  });

  for (const a of added) {
    await logAudit(req, "org_access_changed", "user", userId, {
      entityLabel: user.email,
      newValue: { change: "access_added", ...summarize(a), reason: reason ?? null },
    });
  }
  for (const c of changed) {
    await logAudit(req, "org_access_changed", "user", userId, {
      entityLabel: user.email,
      previousValue: summarize(beforeByOrg.get(c.organizationId)!),
      newValue: { change: "org_role_changed", ...summarize(c), reason: reason ?? null },
    });
  }
  for (const r of removed) {
    await logAudit(req, "org_access_changed", "user", userId, {
      entityLabel: user.email,
      previousValue: summarize(r),
      newValue: { change: "access_removed", reason: reason ?? null },
    });
  }

  // 12 ── Return the canonical saved membership list.
  res.json(await buildOrganizationAccessState(userId, user.role));
});

// ── Add user to org ───────────────────────────────────────────────────────────
router.post("/users/:id/orgs", requireAuth, requireRole("admin"), async (req, res) => {
  const userId = req.params.id as string;
  const { organizationId, role, status } = req.body;

  if (!organizationId || !role) {
    res.status(400).json({ error: "organizationId and role are required" });
    return;
  }

  // "global_admin" is a PLATFORM role — it must never be stored as an org role.
  if (!isAssignableOrgRole(role)) {
    res.status(400).json({
      error: `Invalid organization role "${String(role)}". Allowed: ${ASSIGNABLE_ORG_ROLES.join(", ")}`,
    });
    return;
  }
  const nextStatus = status ?? "active";
  if (!isMembershipStatus(nextStatus)) {
    res.status(400).json({ error: `Invalid membership status "${String(nextStatus)}"` });
    return;
  }

  const [user] = await db
    .select({ id: usersTable.id, email: usersTable.email, isBreakGlass: usersTable.isBreakGlass })
    .from(usersTable)
    .where(eq(usersTable.id, userId))
    .limit(1);

  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  if (user.isBreakGlass) {
    res.status(403).json({
      error:
        "The break-glass emergency account is protected. Its access comes from the Global Admin platform role and cannot be changed here.",
    });
    return;
  }

  // Upsert membership. Updates EVERY row for this (user, org) pair — duplicates
  // would otherwise keep serving the old role after an apparently successful save.
  const existing = await db
    .select({ id: organizationUsersTable.id, role: organizationUsersTable.role, status: organizationUsersTable.status })
    .from(organizationUsersTable)
    .where(
      and(
        eq(organizationUsersTable.organizationId, organizationId),
        eq(organizationUsersTable.userId, userId)
      )
    );

  if (existing.length > 0) {
    await db
      .update(organizationUsersTable)
      .set({ role, status: nextStatus, joinedAt: new Date() })
      .where(
        and(
          eq(organizationUsersTable.organizationId, organizationId),
          eq(organizationUsersTable.userId, userId)
        )
      );
  } else {
    await db.insert(organizationUsersTable).values({
      id: randomUUID(),
      organizationId,
      userId,
      role,
      status: nextStatus,
      joinedAt: new Date(),
    });
  }

  await logAudit(req, "org_access_changed", "user", userId, {
    entityLabel: user.email,
    previousValue: existing[0] ? { role: existing[0].role, status: existing[0].status } : null,
    newValue: {
      change: existing.length > 0 ? "org_role_changed" : "access_added",
      organizationId,
      role,
      roleLabel: roleLabel(role),
      status: nextStatus,
    },
  });

  const [membership] = await db
    .select({
      membershipId: organizationUsersTable.id,
      organizationId: organizationsTable.id,
      organizationName: organizationsTable.name,
      role: organizationUsersTable.role,
      status: organizationUsersTable.status,
      joinedAt: organizationUsersTable.joinedAt,
    })
    .from(organizationUsersTable)
    .innerJoin(
      organizationsTable,
      eq(organizationsTable.id, organizationUsersTable.organizationId)
    )
    .where(
      and(
        eq(organizationUsersTable.organizationId, organizationId),
        eq(organizationUsersTable.userId, userId)
      )
    )
    .limit(1);

  res.json(membership);
});

// ── Update org membership ────────────────────────────────────────────────────
router.patch("/users/:id/orgs/:orgId", requireAuth, requireRole("admin"), async (req, res) => {
  const { id: userId, orgId: organizationId } = req.params as Record<string, string>;
  const { role, status } = req.body;

  if (role !== undefined && !isAssignableOrgRole(role)) {
    res.status(400).json({
      error: `Invalid organization role "${String(role)}". Allowed: ${ASSIGNABLE_ORG_ROLES.join(", ")}`,
    });
    return;
  }
  if (status !== undefined && !isMembershipStatus(status)) {
    res.status(400).json({ error: `Invalid membership status "${String(status)}"` });
    return;
  }

  const [target] = await db
    .select({ email: usersTable.email, isBreakGlass: usersTable.isBreakGlass })
    .from(usersTable)
    .where(eq(usersTable.id, userId))
    .limit(1);

  if (!target) {
    res.status(404).json({ error: "User not found" });
    return;
  }
  if (target.isBreakGlass) {
    res.status(403).json({
      error:
        "The break-glass emergency account is protected. Its access comes from the Global Admin platform role and cannot be changed here.",
    });
    return;
  }

  const pair = and(
    eq(organizationUsersTable.organizationId, organizationId),
    eq(organizationUsersTable.userId, userId)
  );

  const existing = await db
    .select({ id: organizationUsersTable.id, role: organizationUsersTable.role, status: organizationUsersTable.status })
    .from(organizationUsersTable)
    .where(pair);

  if (existing.length === 0) {
    res.status(404).json({ error: "Membership not found" });
    return;
  }

  // Update every row for the pair so duplicates cannot serve a stale role.
  await db
    .update(organizationUsersTable)
    .set({
      ...(role ? { role } : {}),
      ...(status ? { status } : {}),
    })
    .where(pair);

  await logAudit(req, "org_access_changed", "user", userId, {
    entityLabel: target.email,
    previousValue: { organizationId, role: existing[0]!.role, status: existing[0]!.status },
    newValue: {
      change: role ? "org_role_changed" : "membership_status_changed",
      organizationId,
      ...(role ? { role, roleLabel: roleLabel(role) } : {}),
      ...(status ? { status } : {}),
    },
  });

  const [updated] = await db
    .select({
      membershipId: organizationUsersTable.id,
      organizationId: organizationsTable.id,
      organizationName: organizationsTable.name,
      role: organizationUsersTable.role,
      status: organizationUsersTable.status,
      joinedAt: organizationUsersTable.joinedAt,
    })
    .from(organizationUsersTable)
    .innerJoin(
      organizationsTable,
      eq(organizationsTable.id, organizationUsersTable.organizationId)
    )
    .where(pair)
    .limit(1);

  res.json(updated);
});

// ── Remove user from org ─────────────────────────────────────────────────────
router.delete("/users/:id/orgs/:orgId", requireAuth, requireRole("admin"), async (req, res) => {
  const { id: userId, orgId: organizationId } = req.params as Record<string, string>;

  const [target] = await db
    .select({ email: usersTable.email, isBreakGlass: usersTable.isBreakGlass })
    .from(usersTable)
    .where(eq(usersTable.id, userId))
    .limit(1);

  if (!target) {
    res.status(404).json({ error: "User not found" });
    return;
  }
  if (target.isBreakGlass) {
    res.status(403).json({
      error:
        "The break-glass emergency account is protected. Its access comes from the Global Admin platform role and cannot be changed here.",
    });
    return;
  }

  const pair = and(
    eq(organizationUsersTable.organizationId, organizationId),
    eq(organizationUsersTable.userId, userId)
  );

  const existing = await db
    .select({ id: organizationUsersTable.id, role: organizationUsersTable.role, status: organizationUsersTable.status })
    .from(organizationUsersTable)
    .where(pair);

  if (existing.length === 0) {
    res.status(404).json({ error: "Membership not found" });
    return;
  }

  // Removes only the membership rows for this pair — never the user, never org data.
  // All duplicate rows go together, otherwise the access would appear to survive removal.
  await db.delete(organizationUsersTable).where(pair);

  await logAudit(req, "org_access_changed", "user", userId, {
    entityLabel: target.email,
    previousValue: { organizationId, role: existing[0]!.role, status: existing[0]!.status },
    newValue: { change: "access_removed", organizationId, rowsRemoved: existing.length },
  });

  res.json({ success: true });
});

export default router;
