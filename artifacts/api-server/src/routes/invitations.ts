import { Router } from "express";
import type { Request, Response } from "express";
import { randomUUID } from "crypto";
import { db, usersTable, userInvitationsTable, organizationUsersTable, organizationsTable, auditLogsTable } from "@workspace/db";
import { eq, and, gt } from "drizzle-orm";
import { requireAuth, requireRole } from "../lib/auth";
import {
  ASSIGNABLE_ORG_ROLES,
  isAssignableOrgRole,
  platformRoleToStoredRole,
} from "../lib/access-control";
import { generateInviteToken, hashToken, INVITE_EXPIRY_DAYS } from "../lib/invite-token";
import { sendInvitationEmail, isEmailConfigured, getAppBaseUrl } from "../lib/email";
import { logger } from "../lib/logger";

const router = Router();

// ─── Password policy ───────────────────────────────────────────────────────────
function validatePassword(password: string): string | null {
  if (password.length < 12) return "Password must be at least 12 characters";
  if (!/[A-Z]/.test(password)) return "Password must contain at least one uppercase letter";
  if (!/[a-z]/.test(password)) return "Password must contain at least one lowercase letter";
  if (!/[0-9]/.test(password)) return "Password must contain at least one digit";
  if (!/[^A-Za-z0-9]/.test(password)) return "Password must contain at least one special character";
  return null;
}

// ─── Rate limit store (per-IP, in-memory) ─────────────────────────────────────
const validateAttempts = new Map<string, { count: number; resetAt: number }>();
function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = validateAttempts.get(ip);
  if (!entry || entry.resetAt < now) {
    validateAttempts.set(ip, { count: 1, resetAt: now + 60_000 });
    return true;
  }
  if (entry.count >= 10) return false;
  entry.count++;
  return true;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
async function getOrgMembershipsForUser(userId: string) {
  return db
    .select({
      orgId: organizationUsersTable.organizationId,
      orgName: organizationsTable.name,
      role: organizationUsersTable.role,
    })
    .from(organizationUsersTable)
    .innerJoin(organizationsTable, eq(organizationsTable.id, organizationUsersTable.organizationId))
    .where(and(
      eq(organizationUsersTable.userId, userId),
      eq(organizationUsersTable.status, "invited"),
    ));
}

// ─── Send invitation handler ──────────────────────────────────────────────────
async function handleSendInvitation(req: Request, res: Response): Promise<void> {
  const { name, email, role, title, department, orgMemberships, sendEmail: doSendEmail = true } = req.body as {
    name: string;
    email: string;
    role: string;
    title?: string;
    department?: string;
    orgMemberships?: Array<{ orgId: string; role: string }>;
    sendEmail?: boolean;
  };

  if (!name?.trim() || !email?.trim() || !role) {
    res.status(400).json({ error: "name, email, and role are required" });
    return;
  }

  // Normalize the PLATFORM role at the boundary, exactly as POST/PATCH /users do,
  // so an invite can never be the back door that stores an organization role in
  // the platform-role column. Organization roles arrive via orgMemberships.
  const normalizedRole = platformRoleToStoredRole(role);
  if (!normalizedRole) {
    res.status(400).json({
      error: `Invalid platform role "${String(role)}". Allowed: none, global_admin. Organization-specific roles are assigned through organization access.`,
    });
    return;
  }

  for (const m of orgMemberships ?? []) {
    if (!isAssignableOrgRole(m.role)) {
      res.status(400).json({
        error: `Invalid organization role "${String(m.role)}". Allowed: ${ASSIGNABLE_ORG_ROLES.join(", ")}`,
      });
      return;
    }
  }

  const normalizedEmail = email.trim().toLowerCase();

  const [existing] = await db.select({ id: usersTable.id }).from(usersTable).where(eq(usersTable.email, normalizedEmail)).limit(1);
  if (existing) {
    res.status(409).json({ error: "A user with this email already exists" });
    return;
  }

  const inviter = req.authUser!;
  const userId = randomUUID();
  const now = new Date();

  await db.insert(usersTable).values({
    id: userId,
    name: name.trim(),
    email: normalizedEmail,
    passwordHash: null,
    role: normalizedRole,
    title: title?.trim() ?? null,
    department: department?.trim() ?? null,
    isActive: false,
    status: "invited",
    invitedById: inviter.id,
    invitedAt: now,
    createdAt: now,
    updatedAt: now,
  });

  if (orgMemberships?.length) {
    for (const m of orgMemberships) {
      await db.insert(organizationUsersTable).values({
        id: randomUUID(),
        userId,
        organizationId: m.orgId,
        role: m.role as any,
        status: "invited",
        invitedAt: now,
      }).onConflictDoNothing();
    }
  }

  const { rawToken, tokenHash } = generateInviteToken();
  const expiresAt = new Date(now.getTime() + INVITE_EXPIRY_DAYS * 24 * 60 * 60 * 1000);

  await db.insert(userInvitationsTable).values({
    id: randomUUID(),
    tokenHash,
    email: normalizedEmail,
    userId,
    invitedById: inviter.id,
    status: "pending",
    expiresAt,
    createdAt: now,
  });

  const inviteUrl = `${getAppBaseUrl()}/invite/accept?token=${rawToken}`;

  await db.insert(auditLogsTable).values({
    id: randomUUID(),
    userId: inviter.id,
    userName: inviter.name,
    action: "user_invited",
    entityType: "user",
    entityId: userId,
    entityLabel: normalizedEmail,
    ipAddress: req.ip,
    userAgent: req.headers["user-agent"],
    newValue: { role, email: normalizedEmail, name: name.trim() },
    timestamp: now,
  });

  // Build org memberships for email
  const orgsForEmail = orgMemberships?.length
    ? await db
        .select({ orgName: organizationsTable.name, role: organizationUsersTable.role })
        .from(organizationUsersTable)
        .innerJoin(organizationsTable, eq(organizationsTable.id, organizationUsersTable.organizationId))
        .where(and(eq(organizationUsersTable.userId, userId), eq(organizationUsersTable.status, "invited")))
    : [];

  if (doSendEmail && isEmailConfigured()) {
    try {
      await sendInvitationEmail({
        toEmail: normalizedEmail,
        toName: name.trim(),
        inviterName: inviter.name,
        inviteUrl,
        orgMemberships: orgsForEmail,
      });
      res.status(201).json({ success: true, emailSent: true, inviteUrl });
    } catch (err) {
      logger.error({ err }, "Failed to send invitation email");
      res.status(201).json({ success: true, emailSent: false, inviteUrl });
    }
  } else {
    res.status(201).json({ success: true, emailSent: false, inviteUrl });
  }
}

// ─── Resend invitation handler ─────────────────────────────────────────────────
async function handleResendInvitation(req: Request, res: Response): Promise<void> {
  const { userId, sendEmail: doSendEmail = true } = req.body as { userId: string; sendEmail?: boolean };
  if (!userId) {
    res.status(400).json({ error: "userId is required" });
    return;
  }

  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId)).limit(1);
  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }
  if (user.status !== "invited") {
    res.status(400).json({ error: "User has already accepted their invitation" });
    return;
  }

  await db.update(userInvitationsTable)
    .set({ status: "revoked" })
    .where(and(eq(userInvitationsTable.userId, userId), eq(userInvitationsTable.status, "pending")));

  const { rawToken, tokenHash } = generateInviteToken();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + INVITE_EXPIRY_DAYS * 24 * 60 * 60 * 1000);

  await db.insert(userInvitationsTable).values({
    id: randomUUID(),
    tokenHash,
    email: user.email,
    userId,
    invitedById: req.authUser!.id,
    status: "pending",
    expiresAt,
    createdAt: now,
  });

  const inviteUrl = `${getAppBaseUrl()}/invite/accept?token=${rawToken}`;

  await db.insert(auditLogsTable).values({
    id: randomUUID(),
    userId: req.authUser!.id,
    userName: req.authUser!.name,
    action: "invitation_resent",
    entityType: "user",
    entityId: userId,
    entityLabel: user.email,
    ipAddress: req.ip,
    userAgent: req.headers["user-agent"],
    timestamp: now,
  });

  const orgsForEmail = await getOrgMembershipsForUser(userId);

  if (doSendEmail && isEmailConfigured()) {
    try {
      await sendInvitationEmail({
        toEmail: user.email,
        toName: user.name,
        inviterName: req.authUser!.name,
        inviteUrl,
        orgMemberships: orgsForEmail,
      });
      res.json({ success: true, emailSent: true, inviteUrl });
    } catch (err) {
      logger.error({ err }, "Failed to resend invitation email");
      res.json({ success: true, emailSent: false, inviteUrl });
    }
  } else {
    res.json({ success: true, emailSent: false, inviteUrl });
  }
}

// ─── Cancel invitation handler ─────────────────────────────────────────────────
async function handleCancelInvitation(req: Request, res: Response): Promise<void> {
  const { userId } = req.body as { userId: string };
  if (!userId) {
    res.status(400).json({ error: "userId is required" });
    return;
  }

  const [user] = await db.select({ id: usersTable.id, email: usersTable.email, status: usersTable.status })
    .from(usersTable).where(eq(usersTable.id, userId)).limit(1);
  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }
  if (user.status !== "invited") {
    res.status(400).json({ error: "User has already accepted their invitation" });
    return;
  }

  const now = new Date();

  await db.update(userInvitationsTable)
    .set({ status: "cancelled", cancelledAt: now })
    .where(and(eq(userInvitationsTable.userId, userId), eq(userInvitationsTable.status, "pending")));

  await db.update(usersTable)
    .set({ isActive: false, status: "deactivated", updatedAt: now })
    .where(eq(usersTable.id, userId));

  await db.insert(auditLogsTable).values({
    id: randomUUID(),
    userId: req.authUser!.id,
    userName: req.authUser!.name,
    action: "invitation_cancelled",
    entityType: "user",
    entityId: userId,
    entityLabel: user.email,
    ipAddress: req.ip,
    userAgent: req.headers["user-agent"],
    timestamp: now,
  });

  res.json({ success: true });
}

// ─── Route registrations ───────────────────────────────────────────────────────
const adminOnly = requireRole("admin");

// Canonical routes (spec-primary)
router.post("/users/invite", requireAuth, adminOnly, handleSendInvitation);

router.post("/users/:id/resend-invite", requireAuth, adminOnly, async (req, res) => {
  req.body = { ...req.body, userId: req.params.id as string };
  return handleResendInvitation(req, res);
});

router.post("/users/:id/cancel-invite", requireAuth, adminOnly, async (req, res) => {
  req.body = { ...req.body, userId: req.params.id as string };
  return handleCancelInvitation(req, res);
});

// ─── GET /invitations/validate ─── (PUBLIC, rate-limited)
router.get("/invitations/validate", async (req, res) => {
  const ip = req.ip ?? "unknown";
  if (!checkRateLimit(ip)) {
    res.status(429).json({ error: "Too many requests. Please try again later." });
    return;
  }

  const rawToken = req.query["token"] as string | undefined;
  if (!rawToken) {
    res.status(400).json({ code: "invalid", error: "token is required" });
    return;
  }

  const tokenHash = hashToken(rawToken);
  const now = new Date();

  // Query without status/expiry filter to determine specific error code
  const [invitation] = await db
    .select()
    .from(userInvitationsTable)
    .where(eq(userInvitationsTable.tokenHash, tokenHash))
    .limit(1);

  if (!invitation) {
    res.status(404).json({ code: "invalid", error: "This invitation link is invalid." });
    return;
  }

  if (invitation.status === "accepted") {
    res.status(410).json({ code: "used", error: "This invitation has already been accepted." });
    return;
  }

  if (invitation.status === "cancelled" || invitation.status === "revoked") {
    res.status(410).json({ code: "cancelled", error: "This invitation has been cancelled by an administrator." });
    return;
  }

  if (invitation.expiresAt < now) {
    res.status(410).json({ code: "expired", error: "This invitation link has expired. Please ask your administrator to resend it." });
    return;
  }

  if (invitation.status !== "pending") {
    res.status(410).json({ code: "invalid", error: "This invitation link is no longer valid." });
    return;
  }

  const [user] = await db
    .select({ id: usersTable.id, name: usersTable.name, email: usersTable.email })
    .from(usersTable)
    .where(eq(usersTable.id, invitation.userId))
    .limit(1);

  if (!user) {
    res.status(404).json({ code: "invalid", error: "This invitation link is invalid." });
    return;
  }

  const memberships = await getOrgMembershipsForUser(user.id);

  res.json({
    valid: true,
    name: user.name,
    email: user.email,
    expiresAt: invitation.expiresAt,
    orgMemberships: memberships.map((m) => ({ orgName: m.orgName, role: m.role })),
  });
});

// ─── POST /invitations/accept ─── (PUBLIC)
router.post("/invitations/accept", async (req, res) => {
  const { token, password } = req.body as { token: string; password: string };

  if (!token || !password) {
    res.status(400).json({ error: "token and password are required" });
    return;
  }
  const passwordErr = validatePassword(password);
  if (passwordErr) {
    res.status(400).json({ error: passwordErr });
    return;
  }

  const tokenHash = hashToken(token);
  const now = new Date();

  const [invitation] = await db
    .select()
    .from(userInvitationsTable)
    .where(eq(userInvitationsTable.tokenHash, tokenHash))
    .limit(1);

  if (!invitation) {
    res.status(400).json({ code: "invalid", error: "This invitation link is invalid." });
    return;
  }

  if (invitation.status === "accepted") {
    res.status(400).json({ code: "used", error: "This invitation has already been accepted." });
    return;
  }

  if (invitation.status === "cancelled" || invitation.status === "revoked") {
    res.status(400).json({ code: "cancelled", error: "This invitation has been cancelled." });
    return;
  }

  if (invitation.expiresAt < now) {
    res.status(400).json({ code: "expired", error: "This invitation link has expired. Please ask your administrator to resend it." });
    return;
  }

  if (invitation.status !== "pending") {
    res.status(400).json({ code: "invalid", error: "This invitation link is no longer valid." });
    return;
  }

  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, invitation.userId)).limit(1);
  if (!user || user.status !== "invited") {
    res.status(400).json({ code: "used", error: "This invitation has already been used." });
    return;
  }

  const bcrypt = await import("bcryptjs");
  const passwordHash = await bcrypt.hash(password, 10);

  await db.update(usersTable).set({
    passwordHash,
    isActive: true,
    status: "active",
    inviteAcceptedAt: now,
    updatedAt: now,
  }).where(eq(usersTable.id, user.id));

  await db.update(organizationUsersTable)
    .set({ status: "active" })
    .where(and(
      eq(organizationUsersTable.userId, user.id),
      eq(organizationUsersTable.status, "invited"),
    ));

  await db.update(userInvitationsTable)
    .set({ status: "accepted", acceptedAt: now })
    .where(eq(userInvitationsTable.id, invitation.id));

  await db.insert(auditLogsTable).values({
    id: randomUUID(),
    userId: user.id,
    userName: user.name,
    action: "invitation_accepted",
    entityType: "user",
    entityId: user.id,
    entityLabel: user.email,
    ipAddress: req.ip,
    userAgent: req.headers["user-agent"],
    timestamp: now,
  });

  res.json({ success: true });
});

// ─── GET /invitations/email-status ─── (auth required)
router.get("/invitations/email-status", requireAuth, (_req, res) => {
  res.json({ emailConfigured: isEmailConfigured() });
});

export default router;
