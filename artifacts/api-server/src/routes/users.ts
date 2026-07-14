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
import { eq, and, isNull } from "drizzle-orm";
import { requireAuth, requireRole } from "../lib/auth";
import { logAudit } from "../lib/audit";
import { randomUUID } from "crypto";
import { logger } from "../lib/logger";
import { sendPasswordResetEmail, getAppBaseUrl } from "../lib/email";
import { generateResetToken, RESET_TOKEN_EXPIRY_MINUTES } from "../lib/password-reset-token";

const router = Router();
const SALT_ROUNDS = 12;

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

  const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
  const id = randomUUID();

  await db.insert(usersTable).values({
    id,
    name,
    email: email.toLowerCase(),
    passwordHash,
    role: role ?? "it_contributor",
    title,
    department,
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  await logAudit(req, "created", "user", id, { entityLabel: name });

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

// ── Get user ─────────────────────────────────────────────────────────────────
router.get("/users/:id", requireAuth, async (req, res) => {
  const [user] = await db
    .select({
      id: usersTable.id,
      name: usersTable.name,
      email: usersTable.email,
      role: usersTable.role,
      title: usersTable.title,
      department: usersTable.department,
      isActive: usersTable.isActive,
      lastLoginAt: usersTable.lastLoginAt,
      createdAt: usersTable.createdAt,
      updatedAt: usersTable.updatedAt,
    })
    .from(usersTable)
    .where(eq(usersTable.id, req.params.id as string))
    .limit(1);

  if (!user) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  res.json(user);
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
    res.status(403).json({ error: "The break-glass emergency account cannot be modified through the UI. Use the CLI script to rotate credentials." });
    return;
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

  const changes: Record<string, boolean> = {};
  if (role && role !== existing.role) changes.roleChanged = true;

  await db
    .update(usersTable)
    .set({
      name: name ?? existing.name,
      email: email ? email.toLowerCase() : existing.email,
      role: role ?? existing.role,
      title: title !== undefined ? title : existing.title,
      department: department !== undefined ? department : existing.department,
      isActive: isActive !== undefined ? isActive : existing.isActive,
      updatedAt: new Date(),
    })
    .where(eq(usersTable.id, req.params.id as string));

  const action = changes.roleChanged ? "role_changed" : "updated";
  await logAudit(req, action, "user", req.params.id as string, { entityLabel: existing.email });

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

// ── Delete user ──────────────────────────────────────────────────────────────
router.delete("/users/:id", requireAuth, requireRole("admin"), async (req, res) => {
  const [existing] = await db
    .select({ id: usersTable.id, name: usersTable.name, email: usersTable.email, isBreakGlass: usersTable.isBreakGlass })
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

  await logAudit(req, "deleted", "user", existing.id, { entityLabel: existing.email });

  const targetId = req.params.id as string;
  const adminId = req.authUser!.id;

  await db.transaction(async (tx) => {
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

  res.json({ success: true });
});

// ── Deactivate user ──────────────────────────────────────────────────────────
router.post("/users/:id/deactivate", requireAuth, requireRole("admin"), async (req, res) => {
  const [existing] = await db
    .select({ id: usersTable.id, name: usersTable.name, email: usersTable.email, isBreakGlass: usersTable.isBreakGlass })
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

  await db
    .update(usersTable)
    .set({ isActive: false, status: "suspended", updatedAt: new Date() })
    .where(eq(usersTable.id, req.params.id as string));

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
router.get("/users/:id/orgs", requireAuth, async (req, res) => {
  const memberships = await db
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
    .where(eq(organizationUsersTable.userId, req.params.id as string))
    .orderBy(organizationsTable.name);

  res.json(memberships);
});

// ── Add user to org ───────────────────────────────────────────────────────────
router.post("/users/:id/orgs", requireAuth, requireRole("admin"), async (req, res) => {
  const userId = req.params.id as string;
  const { organizationId, role, status } = req.body;

  if (!organizationId || !role) {
    res.status(400).json({ error: "organizationId and role are required" });
    return;
  }

  const [user] = await db
    .select({ id: usersTable.id, email: usersTable.email })
    .from(usersTable)
    .where(eq(usersTable.id, userId))
    .limit(1);

  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  // Upsert membership
  const [existing] = await db
    .select({ id: organizationUsersTable.id })
    .from(organizationUsersTable)
    .where(
      and(
        eq(organizationUsersTable.organizationId, organizationId),
        eq(organizationUsersTable.userId, userId)
      )
    )
    .limit(1);

  if (existing) {
    await db
      .update(organizationUsersTable)
      .set({ role, status: status ?? "active", joinedAt: new Date() })
      .where(eq(organizationUsersTable.id, existing.id));
  } else {
    await db.insert(organizationUsersTable).values({
      id: randomUUID(),
      organizationId,
      userId,
      role,
      status: status ?? "active",
      joinedAt: new Date(),
    });
  }

  await logAudit(req, "org_access_changed", "user", userId, {
    entityLabel: user.email,
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

  const [membership] = await db
    .select({ id: organizationUsersTable.id })
    .from(organizationUsersTable)
    .where(
      and(
        eq(organizationUsersTable.organizationId, organizationId),
        eq(organizationUsersTable.userId, userId)
      )
    )
    .limit(1);

  if (!membership) {
    res.status(404).json({ error: "Membership not found" });
    return;
  }

  await db
    .update(organizationUsersTable)
    .set({
      ...(role ? { role } : {}),
      ...(status ? { status } : {}),
    })
    .where(eq(organizationUsersTable.id, membership.id));

  await logAudit(req, "org_access_changed", "user", userId, {});

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
    .where(eq(organizationUsersTable.id, membership.id))
    .limit(1);

  res.json(updated);
});

// ── Remove user from org ─────────────────────────────────────────────────────
router.delete("/users/:id/orgs/:orgId", requireAuth, requireRole("admin"), async (req, res) => {
  const { id: userId, orgId: organizationId } = req.params as Record<string, string>;

  const [membership] = await db
    .select({ id: organizationUsersTable.id })
    .from(organizationUsersTable)
    .where(
      and(
        eq(organizationUsersTable.organizationId, organizationId),
        eq(organizationUsersTable.userId, userId)
      )
    )
    .limit(1);

  if (!membership) {
    res.status(404).json({ error: "Membership not found" });
    return;
  }

  await db
    .delete(organizationUsersTable)
    .where(eq(organizationUsersTable.id, membership.id));

  await logAudit(req, "org_access_changed", "user", userId, {
    newValue: { removed: true },
  });

  res.json({ success: true });
});

export default router;
