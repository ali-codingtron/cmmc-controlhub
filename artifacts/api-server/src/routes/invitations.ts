import { Router } from "express";
import { randomUUID } from "crypto";
import { db, usersTable, userInvitationsTable, organizationUsersTable, organizationsTable, auditLogsTable } from "@workspace/db";
import { eq, and, gt, inArray } from "drizzle-orm";
import { requireAuth, requireRole } from "../lib/auth";
import { generateInviteToken, hashToken, INVITE_EXPIRY_DAYS } from "../lib/invite-token";
import { sendInvitationEmail, isEmailConfigured, getAppBaseUrl } from "../lib/email";
import { logger } from "../lib/logger";

const router = Router();

function validatePassword(password: string): string | null {
  if (password.length < 12) return "Password must be at least 12 characters";
  if (!/[A-Z]/.test(password)) return "Password must contain at least one uppercase letter";
  if (!/[a-z]/.test(password)) return "Password must contain at least one lowercase letter";
  if (!/[0-9]/.test(password)) return "Password must contain at least one digit";
  if (!/[^A-Za-z0-9]/.test(password)) return "Password must contain at least one special character";
  return null;
}

// Rate limit store for validate endpoint (simple in-memory, per-IP)
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

// ─── POST /invitations/send ─── (auth required, admin/compliance_manager)
router.post("/invitations/send", requireAuth, requireRole(["admin", "compliance_manager"]), async (req, res) => {
  const { name, email, role, title, department, orgMemberships } = req.body as {
    name: string;
    email: string;
    role: string;
    title?: string;
    department?: string;
    orgMemberships?: Array<{ orgId: string; role: string }>;
  };

  if (!name?.trim() || !email?.trim() || !role) {
    res.status(400).json({ error: "name, email, and role are required" });
    return;
  }

  const normalizedEmail = email.trim().toLowerCase();

  // Check for existing user
  const [existing] = await db.select({ id: usersTable.id }).from(usersTable).where(eq(usersTable.email, normalizedEmail)).limit(1);
  if (existing) {
    res.status(409).json({ error: "A user with this email already exists" });
    return;
  }

  const inviter = req.authUser!;

  // Create the user record (no password yet)
  const userId = randomUUID();
  const now = new Date();
  await db.insert(usersTable).values({
    id: userId,
    name: name.trim(),
    email: normalizedEmail,
    passwordHash: null,
    role: role as any,
    title: title?.trim() ?? null,
    department: department?.trim() ?? null,
    isActive: false,
    status: "invited",
    invitedById: inviter.id,
    invitedAt: now,
    createdAt: now,
    updatedAt: now,
  });

  // Create org memberships with status "invited"
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

  // Create invitation record
  const { rawToken, tokenHash } = generateInviteToken();
  const expiresAt = new Date(now.getTime() + INVITE_EXPIRY_DAYS * 24 * 60 * 60 * 1000);

  await db.insert(userInvitationsTable).values({
    id: randomUUID(),
    tokenHash,
    userId,
    invitedById: inviter.id,
    status: "pending",
    expiresAt,
    createdAt: now,
  });

  const baseUrl = getAppBaseUrl();
  const inviteUrl = `${baseUrl}/invite/accept?token=${rawToken}`;

  // Audit log
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

  // Send email if configured, otherwise return inviteUrl
  if (isEmailConfigured()) {
    try {
      await sendInvitationEmail({
        toEmail: normalizedEmail,
        toName: name.trim(),
        inviterName: inviter.name,
        inviteUrl,
      });
      res.status(201).json({ success: true, emailSent: true });
    } catch (err) {
      logger.error({ err }, "Failed to send invitation email");
      res.status(201).json({ success: true, emailSent: false, inviteUrl });
    }
  } else {
    res.status(201).json({ success: true, emailSent: false, inviteUrl });
  }
});

// ─── POST /invitations/resend ─── (auth required, admin/compliance_manager)
router.post("/invitations/resend", requireAuth, requireRole(["admin", "compliance_manager"]), async (req, res) => {
  const { userId, sendEmail = true } = req.body as { userId: string; sendEmail?: boolean };
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

  // Revoke existing pending invitations
  await db.update(userInvitationsTable)
    .set({ status: "revoked" })
    .where(and(eq(userInvitationsTable.userId, userId), eq(userInvitationsTable.status, "pending")));

  // Create new invitation
  const { rawToken, tokenHash } = generateInviteToken();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + INVITE_EXPIRY_DAYS * 24 * 60 * 60 * 1000);

  await db.insert(userInvitationsTable).values({
    id: randomUUID(),
    tokenHash,
    userId,
    invitedById: req.authUser!.id,
    status: "pending",
    expiresAt,
    createdAt: now,
  });

  const baseUrl = getAppBaseUrl();
  const inviteUrl = `${baseUrl}/invite/accept?token=${rawToken}`;

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

  if (sendEmail && isEmailConfigured()) {
    try {
      await sendInvitationEmail({
        toEmail: user.email,
        toName: user.name,
        inviterName: req.authUser!.name,
        inviteUrl,
      });
      res.json({ success: true, emailSent: true, inviteUrl });
    } catch (err) {
      logger.error({ err }, "Failed to resend invitation email");
      res.json({ success: true, emailSent: false, inviteUrl });
    }
  } else {
    res.json({ success: true, emailSent: false, inviteUrl });
  }
});

// ─── POST /invitations/cancel ─── (auth required, admin/compliance_manager)
router.post("/invitations/cancel", requireAuth, requireRole(["admin", "compliance_manager"]), async (req, res) => {
  const { userId } = req.body as { userId: string };
  if (!userId) {
    res.status(400).json({ error: "userId is required" });
    return;
  }

  const [user] = await db.select({ id: usersTable.id, email: usersTable.email, status: usersTable.status }).from(usersTable).where(eq(usersTable.id, userId)).limit(1);
  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }
  if (user.status !== "invited") {
    res.status(400).json({ error: "User has already accepted their invitation" });
    return;
  }

  // Revoke pending invitations
  await db.update(userInvitationsTable)
    .set({ status: "cancelled" })
    .where(and(eq(userInvitationsTable.userId, userId), eq(userInvitationsTable.status, "pending")));

  // Deactivate the pre-created user record
  await db.update(usersTable)
    .set({ isActive: false, status: "deactivated", updatedAt: new Date() })
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
    timestamp: new Date(),
  });

  res.json({ success: true });
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
    res.status(400).json({ error: "token is required" });
    return;
  }

  const tokenHash = hashToken(rawToken);
  const now = new Date();

  const [invitation] = await db
    .select()
    .from(userInvitationsTable)
    .where(and(
      eq(userInvitationsTable.tokenHash, tokenHash),
      eq(userInvitationsTable.status, "pending"),
      gt(userInvitationsTable.expiresAt, now),
    ))
    .limit(1);

  if (!invitation) {
    res.status(404).json({ error: "This invitation link is invalid or has expired." });
    return;
  }

  const [user] = await db
    .select({ id: usersTable.id, name: usersTable.name, email: usersTable.email })
    .from(usersTable)
    .where(eq(usersTable.id, invitation.userId))
    .limit(1);

  if (!user) {
    res.status(404).json({ error: "This invitation link is invalid or has expired." });
    return;
  }

  // Fetch assigned org memberships for display
  const memberships = await db
    .select({
      orgId: organizationUsersTable.organizationId,
      orgName: organizationsTable.name,
      role: organizationUsersTable.role,
    })
    .from(organizationUsersTable)
    .innerJoin(organizationsTable, eq(organizationsTable.id, organizationUsersTable.organizationId))
    .where(and(
      eq(organizationUsersTable.userId, user.id),
      eq(organizationUsersTable.status, "invited"),
    ));

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
    .where(and(
      eq(userInvitationsTable.tokenHash, tokenHash),
      eq(userInvitationsTable.status, "pending"),
      gt(userInvitationsTable.expiresAt, now),
    ))
    .limit(1);

  if (!invitation) {
    res.status(400).json({ error: "This invitation link is invalid or has expired." });
    return;
  }

  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, invitation.userId)).limit(1);
  if (!user || user.status !== "invited") {
    res.status(400).json({ error: "This invitation has already been used." });
    return;
  }

  const bcrypt = await import("bcryptjs");
  const passwordHash = await bcrypt.hash(password, 10);

  // Activate the user
  await db.update(usersTable).set({
    passwordHash,
    isActive: true,
    status: "active",
    inviteAcceptedAt: now,
    updatedAt: now,
  }).where(eq(usersTable.id, user.id));

  // Activate org memberships
  await db.update(organizationUsersTable)
    .set({ status: "active" })
    .where(and(
      eq(organizationUsersTable.userId, user.id),
      eq(organizationUsersTable.status, "invited"),
    ));

  // Mark invitation accepted
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
