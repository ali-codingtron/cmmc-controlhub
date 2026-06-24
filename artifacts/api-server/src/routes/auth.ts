import { Router } from "express";
import bcrypt from 'bcryptjs';
import { db, usersTable, auditLogsTable, organizationUsersTable, securitySettingsTable, passwordResetTokensTable, breakGlassSessionsTable, ssoConfigsTable } from "@workspace/db";
import { eq, sql, and, isNull } from "drizzle-orm";
import {
  generatePkce,
  generateState,
  storeOauthState,
  consumeOauthState,
  buildAuthorizationUrl,
  exchangeCodeForToken,
  parseIdToken,
} from "../lib/sso";
import { signToken, requireAuth, requireRole, hashJwtToken } from "../lib/auth";
import {
  encryptSecret,
  decryptSecret,
  generateTotpSecret,
  generateOtpAuthUri,
  verifyTotp,
  generateRecoveryCodes,
  verifyRecoveryCode,
  checkMfaRequired,
  checkStartup,
} from "../lib/mfa";
import { signMfaStateToken, verifyMfaStateToken } from "../lib/mfa-jwt";
import { randomUUID } from "crypto";
import { logger } from "../lib/logger";
import { sendPasswordResetEmail, getAppBaseUrl, sendBreakGlassLoginAlert } from "../lib/email";
import {
  generateResetToken,
  hashResetToken,
  checkForgotPasswordRateLimit,
  validatePasswordPolicy,
  RESET_TOKEN_EXPIRY_MINUTES,
} from "../lib/password-reset-token";

checkStartup();

const router = Router();

// ─── Break-Glass Per-IP Rate Limiter ─────────────────────────────────────────
// Tracks failed login attempts targeting the break-glass account, keyed by IP.
// • Sends alert email at ALERT_THRESHOLD failures from the same IP within the window.
// • Enforces a hard deny (429) at BLOCK_THRESHOLD failures within the window.
const BG_IP_WINDOW_MS = 15 * 60 * 1000; // 15 min sliding window
const BG_IP_ALERT_THRESHOLD = 3;
const BG_IP_BLOCK_THRESHOLD = 10;
const bgIpFailures = new Map<string, { count: number; windowStart: number; alerted: boolean }>();

/** Returns true if this IP is currently rate-limited (should receive 429). */
function isBreakGlassIpBlocked(ip: string): boolean {
  const entry = bgIpFailures.get(ip);
  if (!entry) return false;
  if (Date.now() - entry.windowStart > BG_IP_WINDOW_MS) return false;
  return entry.count >= BG_IP_BLOCK_THRESHOLD;
}

function trackBreakGlassFailure(ip: string, user: { email: string; name: string }) {
  const now = Date.now();
  const entry = bgIpFailures.get(ip);
  if (!entry || now - entry.windowStart > BG_IP_WINDOW_MS) {
    bgIpFailures.set(ip, { count: 1, windowStart: now, alerted: false });
    return;
  }
  entry.count++;
  if (entry.count >= BG_IP_ALERT_THRESHOLD && !entry.alerted) {
    entry.alerted = true;
    sendBreakGlassLoginAlert({
      email: user.email,
      name: user.name,
      ipAddress: ip,
      userAgent: "break-glass-failed-attempts",
      timestamp: new Date().toISOString(),
      failedAttempts: entry.count,
    }).catch((e) => logger.warn({ err: e }, "Failed to send break-glass failure alert"));
  }
}

async function getSecuritySettings() {
  const rows = await db.select().from(securitySettingsTable).limit(1);
  if (rows.length > 0) return rows[0];
  const [inserted] = await db.insert(securitySettingsTable).values({
    id: "global",
    mfaEnforcementMode: "privileged",
    maxFailedLoginAttempts: 5,
    lockoutDurationMinutes: 15,
    updatedAt: new Date(),
  }).onConflictDoNothing().returning();
  return inserted ?? { id: "global", mfaEnforcementMode: "privileged" as const, maxFailedLoginAttempts: 5, lockoutDurationMinutes: 15, updatedAt: new Date() };
}

function requireMfaStateToken(req: any, res: any): string | null {
  const header = req.headers["x-mfa-state-token"] as string | undefined;
  if (!header) {
    res.status(401).json({ error: "MFA state token required" });
    return null;
  }
  const payload = verifyMfaStateToken(header);
  if (!payload) {
    res.status(401).json({ error: "Invalid or expired MFA state token" });
    return null;
  }
  return payload.userId;
}

// ─── Login ────────────────────────────────────────────────────────────────────

router.post("/auth/login", async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    res.status(400).json({ error: "Email and password required" });
    return;
  }

  const [user] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.email, email.toLowerCase()))
    .limit(1);

  if (!user || !user.isActive) {
    res.status(401).json({ error: "Invalid credentials" });
    return;
  }

  if (user.lockedUntil && user.lockedUntil > new Date()) {
    const retryAfterSeconds = Math.ceil((user.lockedUntil.getTime() - Date.now()) / 1000);
    res.status(423).json({
      error: `Account is temporarily locked due to too many failed login attempts. Please try again in ${Math.ceil(retryAfterSeconds / 60)} minute(s).`,
      retryAfter: retryAfterSeconds,
    });
    return;
  }

  if (!user.passwordHash) {
    res.status(401).json({ error: "Invalid credentials" });
    return;
  }

  // Break-glass: enforce per-IP block before attempting password verification
  if (user.isBreakGlass && isBreakGlassIpBlocked(req.ip ?? "unknown")) {
    res.status(429).json({
      error: "Too many failed login attempts from this IP. Try again in 15 minutes.",
      retryAfter: 900,
    });
    return;
  }

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) {
    const settings = await getSecuritySettings();
    const newCount = user.failedLoginCount + 1;
    let lockedUntil: Date | null = null;
    if (newCount >= settings.maxFailedLoginAttempts) {
      lockedUntil = new Date(Date.now() + settings.lockoutDurationMinutes * 60 * 1000);
    }
    await db.update(usersTable).set({
      failedLoginCount: newCount,
      ...(lockedUntil ? { lockedUntil } : {}),
      updatedAt: new Date(),
    }).where(eq(usersTable.id, user.id));

    // Break-glass specific: track per-IP failures and send alert at threshold
    if (user.isBreakGlass) {
      trackBreakGlassFailure(req.ip ?? "unknown", { email: user.email, name: user.name });
      await db.insert(auditLogsTable).values({
        id: randomUUID(),
        userId: user.id,
        userName: user.name,
        action: "break_glass_login_failed" as any,
        entityType: "user",
        entityId: user.id,
        entityLabel: user.email,
        ipAddress: req.ip,
        userAgent: req.headers["user-agent"],
        newValue: { success: false, failedAttempts: newCount },
        timestamp: new Date(),
      });
    } else {
      await db.insert(auditLogsTable).values({
        id: randomUUID(),
        userId: user.id,
        userName: user.name,
        action: "login_failed",
        entityType: "user",
        entityId: user.id,
        entityLabel: user.email,
        ipAddress: req.ip,
        userAgent: req.headers["user-agent"],
        newValue: { failedAttempts: newCount },
        timestamp: new Date(),
      });
    }

    if (lockedUntil) {
      const lockAction = user.isBreakGlass ? ("break_glass_account_locked" as any) : "account_locked";
      await db.insert(auditLogsTable).values({
        id: randomUUID(),
        userId: user.id,
        userName: user.name,
        action: lockAction,
        entityType: "user",
        entityId: user.id,
        entityLabel: user.email,
        ipAddress: req.ip,
        userAgent: req.headers["user-agent"],
        newValue: { lockoutDurationMinutes: settings.lockoutDurationMinutes },
        timestamp: new Date(),
      });
      res.status(423).json({
        error: `Account locked after too many failed attempts. Please try again in ${settings.lockoutDurationMinutes} minute(s).`,
        retryAfter: settings.lockoutDurationMinutes * 60,
      });
      return;
    }

    res.status(401).json({ error: "Invalid credentials" });
    return;
  }

  await db.update(usersTable).set({
    failedLoginCount: 0,
    lockedUntil: null,
    updatedAt: new Date(),
  }).where(eq(usersTable.id, user.id));

  const isDemo = user.email === "demo@controlhub.com";

  if (!isDemo && !user.mfaExempt) {
    const settings = await getSecuritySettings();
    const mfaEnforced = checkMfaRequired(user.role, user.mfaRequired, settings.mfaEnforcementMode);

    if (mfaEnforced || user.mfaEnabled) {
      const mfaStateToken = signMfaStateToken(user.id);
      if (user.mfaEnabled && !user.mfaResetRequired) {
        res.json({ mfa_required: true, mfa_state_token: mfaStateToken });
      } else {
        res.json({ mfa_setup_required: true, mfa_state_token: mfaStateToken });
      }
      return;
    }
  }

  const loginNow = new Date();
  await db.update(usersTable).set({ lastLoginAt: loginNow }).where(eq(usersTable.id, user.id));

  const tokenExpiry = user.isBreakGlass ? "4h" : "24h";
  const token = signToken({ id: user.id, name: user.name, email: user.email, role: user.role }, tokenExpiry);

  if (user.isBreakGlass) {
    // Revoke any prior open sessions (single-session enforcement)
    const priorSessions = await db
      .select({ id: breakGlassSessionsTable.id })
      .from(breakGlassSessionsTable)
      .where(and(
        eq(breakGlassSessionsTable.userId, user.id),
        isNull(breakGlassSessionsTable.revokedAt),
      ));

    if (priorSessions.length > 0) {
      await db
        .update(breakGlassSessionsTable)
        .set({ revokedAt: loginNow })
        .where(and(
          eq(breakGlassSessionsTable.userId, user.id),
          isNull(breakGlassSessionsTable.revokedAt),
        ));

      // Emit a revocation audit event for each displaced session
      for (const prior of priorSessions) {
        await db.insert(auditLogsTable).values({
          id: randomUUID(),
          userId: user.id,
          userName: user.name,
          action: "break_glass_session_revoked" as any,
          entityType: "break_glass_session",
          entityId: prior.id,
          entityLabel: user.email,
          ipAddress: req.ip,
          newValue: { reason: "displaced_by_new_login", revokedAt: loginNow.toISOString() },
          timestamp: loginNow,
        });
      }
    }

    await db.insert(breakGlassSessionsTable).values({
      id: randomUUID(),
      userId: user.id,
      tokenHash: hashJwtToken(token),
      ipAddress: req.ip ?? null,
      userAgent: req.headers["user-agent"] ?? null,
      createdAt: loginNow,
      lastActiveAt: loginNow,
      expiresAt: new Date(loginNow.getTime() + 4 * 60 * 60 * 1000),
    });

    // Single authoritative audit event for break-glass login (replaces generic logged_in)
    await db.insert(auditLogsTable).values({
      id: randomUUID(),
      userId: user.id,
      userName: user.name,
      action: "break_glass_login_success" as any,
      entityType: "user",
      entityId: user.id,
      entityLabel: user.email,
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"],
      newValue: { success: true, ipAddress: req.ip, userAgent: req.headers["user-agent"] },
      timestamp: loginNow,
    });

    sendBreakGlassLoginAlert({
      email: user.email,
      name: user.name,
      ipAddress: req.ip ?? "unknown",
      userAgent: req.headers["user-agent"] ?? "unknown",
      timestamp: loginNow.toISOString(),
    }).catch((err) => logger.warn({ err }, "Failed to send break-glass login alert"));

    res.json({ token, user: { id: user.id, name: user.name, email: user.email, role: user.role }, isBreakGlass: true });
    return;
  }

  // Standard login audit event for non-break-glass users
  await db.insert(auditLogsTable).values({
    id: randomUUID(),
    userId: user.id,
    userName: user.name,
    action: "logged_in",
    entityType: "user",
    entityId: user.id,
    entityLabel: user.email,
    ipAddress: req.ip,
    userAgent: req.headers["user-agent"],
    timestamp: loginNow,
  });

  res.json({ token, user: { id: user.id, name: user.name, email: user.email, role: user.role } });
});

// ─── Demo Login ───────────────────────────────────────────────────────────────

router.post("/auth/demo-login", async (req, res) => {
  if (process.env.ENABLE_PUBLIC_DEMO === "false") {
    res.status(404).json({ error: "Not found" });
    return;
  }

  const [user] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.email, "demo@controlhub.com"))
    .limit(1);

  if (!user || !user.isActive) {
    res.status(503).json({ error: "The demo environment is temporarily unavailable. Please try again in a few minutes." });
    return;
  }

  const [membership] = await db
    .select({ organizationId: organizationUsersTable.organizationId })
    .from(organizationUsersTable)
    .where(eq(organizationUsersTable.userId, user.id))
    .limit(1);

  const token = signToken({ id: user.id, name: user.name, email: user.email, role: user.role });

  res.json({
    token,
    user: { id: user.id, name: user.name, email: user.email, role: user.role },
    isDemoMode: true,
    demoOrgId: membership?.organizationId ?? null,
  });
});

// ─── Logout / Me / Profile ────────────────────────────────────────────────────

router.post("/auth/logout", requireAuth, async (req, res) => {
  await db.insert(auditLogsTable).values({
    id: randomUUID(),
    userId: req.authUser!.id,
    userName: req.authUser!.name,
    action: "logged_out",
    entityType: "user",
    entityId: req.authUser!.id,
    timestamp: new Date(),
  });
  res.json({ message: "Logged out" });
});

router.get("/auth/me", requireAuth, async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  const [user] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.id, req.authUser!.id))
    .limit(1);

  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  res.json({
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    title: user.title,
    department: user.department,
    isActive: user.isActive,
    lastLoginAt: user.lastLoginAt,
    createdAt: user.createdAt,
    mfaEnabled: user.mfaEnabled,
  });
});

router.post("/auth/change-password", requireAuth, async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  if (!currentPassword || !newPassword) {
    res.status(400).json({ error: "currentPassword and newPassword are required" });
    return;
  }
  if (newPassword.length < 8) {
    res.status(400).json({ error: "New password must be at least 8 characters" });
    return;
  }

  const [user] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.id, req.authUser!.id))
    .limit(1);

  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  if (!user.passwordHash) {
    res.status(400).json({ error: "This account uses invitation-based setup. Please contact your administrator." });
    return;
  }

  const valid = await bcrypt.compare(currentPassword, user.passwordHash);
  if (!valid) {
    res.status(400).json({ error: "Current password is incorrect" });
    return;
  }

  const hash = await bcrypt.hash(newPassword, 10);
  await db.update(usersTable).set({ passwordHash: hash, updatedAt: new Date() }).where(eq(usersTable.id, user.id));

  await db.insert(auditLogsTable).values({
    id: randomUUID(),
    userId: user.id,
    userName: user.name,
    action: "password_changed",
    entityType: "user",
    entityId: user.id,
    entityLabel: user.email,
    ipAddress: req.ip,
    userAgent: req.headers["user-agent"],
    timestamp: new Date(),
  });

  res.json({ success: true });
});

router.patch("/auth/profile", requireAuth, async (req, res) => {
  const { name, title, department } = req.body;

  await db.update(usersTable).set({
    name: name ?? undefined,
    title: title !== undefined ? title : undefined,
    department: department !== undefined ? department : undefined,
    updatedAt: new Date(),
  }).where(eq(usersTable.id, req.authUser!.id));

  const [updated] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.id, req.authUser!.id))
    .limit(1);

  res.json({
    id: updated.id,
    name: updated.name,
    email: updated.email,
    role: updated.role,
    title: updated.title,
    department: updated.department,
  });
});

// ─── MFA Setup ────────────────────────────────────────────────────────────────

router.post("/auth/mfa/setup/start", async (req, res) => {
  const userId = requireMfaStateToken(req, res);
  if (!userId) return;

  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId)).limit(1);
  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  const secret = generateTotpSecret();
  const encryptedSecret = encryptSecret(secret);
  await db.update(usersTable).set({ mfaSecret: encryptedSecret, updatedAt: new Date() }).where(eq(usersTable.id, userId));

  const otpAuthUri = generateOtpAuthUri(secret, user.email);
  const manualKey = secret.match(/.{1,4}/g)?.join(" ") ?? secret;

  await db.insert(auditLogsTable).values({
    id: randomUUID(),
    userId: user.id,
    userName: user.name,
    action: "mfa_setup_started",
    entityType: "user",
    entityId: user.id,
    entityLabel: user.email,
    ipAddress: req.ip,
    userAgent: req.headers["user-agent"],
    timestamp: new Date(),
  });

  res.json({ otpAuthUri, manualKey });
});

router.post("/auth/mfa/setup/verify", async (req, res) => {
  const userId = requireMfaStateToken(req, res);
  if (!userId) return;

  const { code } = req.body;
  if (!code) {
    res.status(400).json({ error: "code is required" });
    return;
  }

  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId)).limit(1);
  if (!user || !user.mfaSecret) {
    res.status(400).json({ error: "MFA setup not started" });
    return;
  }

  const secret = decryptSecret(user.mfaSecret);
  if (!verifyTotp(secret, code)) {
    res.status(400).json({ error: "Invalid code. Please check your authenticator app and try again." });
    return;
  }

  const { plain, hashed } = await generateRecoveryCodes();
  await db.update(usersTable).set({
    mfaEnabled: true,
    mfaEnrolledAt: new Date(),
    mfaRecoveryCodes: hashed,
    mfaResetRequired: false,
    updatedAt: new Date(),
  }).where(eq(usersTable.id, userId));

  await db.insert(auditLogsTable).values({
    id: randomUUID(),
    userId: user.id,
    userName: user.name,
    action: "mfa_enabled",
    entityType: "user",
    entityId: user.id,
    entityLabel: user.email,
    ipAddress: req.ip,
    userAgent: req.headers["user-agent"],
    timestamp: new Date(),
  });

  await db.update(usersTable).set({ lastLoginAt: new Date() }).where(eq(usersTable.id, userId));
  const token = signToken({ id: user.id, name: user.name, email: user.email, role: user.role });
  res.json({ recoveryCodes: plain, token, user: { id: user.id, name: user.name, email: user.email, role: user.role } });
});

// ─── MFA Verify (login challenge) ────────────────────────────────────────────

router.post("/auth/mfa/verify", async (req, res) => {
  const userId = requireMfaStateToken(req, res);
  if (!userId) return;

  const { code } = req.body;
  if (!code) {
    res.status(400).json({ error: "code is required" });
    return;
  }

  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId)).limit(1);
  if (!user || !user.mfaEnabled || !user.mfaSecret) {
    res.status(400).json({ error: "MFA not configured for this account" });
    return;
  }

  const MFA_MAX_ATTEMPTS = 5;
  const MFA_LOCKOUT_MINUTES = 15;

  // Check if already locked out
  if (user.lockedUntil && user.lockedUntil > new Date()) {
    const retryAfterSeconds = Math.ceil((user.lockedUntil.getTime() - Date.now()) / 1000);
    res.status(429).setHeader("Retry-After", String(retryAfterSeconds)).json({
      error: `Account temporarily locked. Please try again in ${Math.ceil(retryAfterSeconds / 60)} minute(s) or start over.`,
      locked: true,
    });
    return;
  }

  const secret = decryptSecret(user.mfaSecret);
  const valid = verifyTotp(secret, code);

  if (!valid) {
    const newFailCount = (user.failedLoginCount ?? 0) + 1;
    const shouldLock = newFailCount >= MFA_MAX_ATTEMPTS;
    const lockedUntil = shouldLock ? new Date(Date.now() + MFA_LOCKOUT_MINUTES * 60 * 1000) : null;

    await db.update(usersTable)
      .set({
        failedLoginCount: newFailCount,
        ...(shouldLock ? { lockedUntil } : {}),
        updatedAt: new Date(),
      })
      .where(eq(usersTable.id, userId));

    await db.insert(auditLogsTable).values({
      id: randomUUID(),
      userId: user.id,
      userName: user.name,
      action: "mfa_verify_failure",
      entityType: "user",
      entityId: user.id,
      entityLabel: user.email,
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"],
      newValue: { attempt: newFailCount, locked: shouldLock },
      timestamp: new Date(),
    });

    if (shouldLock) {
      res.status(429).json({
        error: `Too many failed attempts. Account locked for ${MFA_LOCKOUT_MINUTES} minutes. Please start over and try again later.`,
        locked: true,
      });
      return;
    }

    const remaining = MFA_MAX_ATTEMPTS - newFailCount;
    res.status(400).json({
      error: `Invalid code. ${remaining} attempt${remaining === 1 ? "" : "s"} remaining before lockout.`,
    });
    return;
  }

  await db.update(usersTable).set({ failedLoginCount: 0, lockedUntil: null, lastLoginAt: new Date(), updatedAt: new Date() }).where(eq(usersTable.id, userId));

  await db.insert(auditLogsTable).values({
    id: randomUUID(),
    userId: user.id,
    userName: user.name,
    action: "mfa_verify_success",
    entityType: "user",
    entityId: user.id,
    entityLabel: user.email,
    ipAddress: req.ip,
    userAgent: req.headers["user-agent"],
    timestamp: new Date(),
  });

  const token = signToken({ id: user.id, name: user.name, email: user.email, role: user.role });
  res.json({ token, user: { id: user.id, name: user.name, email: user.email, role: user.role } });
});

// ─── MFA Recovery Code ────────────────────────────────────────────────────────

router.post("/auth/mfa/recovery-code", async (req, res) => {
  const userId = requireMfaStateToken(req, res);
  if (!userId) return;

  const { code } = req.body;
  if (!code) {
    res.status(400).json({ error: "code is required" });
    return;
  }

  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId)).limit(1);
  if (!user || !user.mfaEnabled || !user.mfaRecoveryCodes) {
    res.status(400).json({ error: "MFA not configured for this account" });
    return;
  }

  const idx = await verifyRecoveryCode(code, user.mfaRecoveryCodes);
  if (idx === -1) {
    res.status(400).json({ error: "Invalid recovery code." });
    return;
  }

  const updatedCodes = [...user.mfaRecoveryCodes];
  updatedCodes[idx] = null;
  await db.update(usersTable).set({
    mfaRecoveryCodes: updatedCodes,
    lastLoginAt: new Date(),
    updatedAt: new Date(),
  }).where(eq(usersTable.id, userId));

  await db.insert(auditLogsTable).values({
    id: randomUUID(),
    userId: user.id,
    userName: user.name,
    action: "mfa_recovery_code_used",
    entityType: "user",
    entityId: user.id,
    entityLabel: user.email,
    ipAddress: req.ip,
    userAgent: req.headers["user-agent"],
    newValue: { recoveryCodesRemaining: updatedCodes.filter(Boolean).length },
    timestamp: new Date(),
  });

  const token = signToken({ id: user.id, name: user.name, email: user.email, role: user.role });
  res.json({ token, user: { id: user.id, name: user.name, email: user.email, role: user.role } });
});

// ─── Admin MFA Management ─────────────────────────────────────────────────────

router.post("/auth/mfa/reset", requireAuth, requireRole("admin"), async (req, res) => {
  const { userId } = req.body;
  if (!userId) {
    res.status(400).json({ error: "userId is required" });
    return;
  }

  const [target] = await db.select().from(usersTable).where(eq(usersTable.id, userId)).limit(1);
  if (!target) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  await db.update(usersTable).set({
    mfaEnabled: false,
    mfaSecret: null,
    mfaEnrolledAt: null,
    mfaRecoveryCodes: null,
    mfaResetRequired: true,
    updatedAt: new Date(),
  }).where(eq(usersTable.id, userId));

  await db.insert(auditLogsTable).values({
    id: randomUUID(),
    userId: req.authUser!.id,
    userName: req.authUser!.name,
    action: "mfa_reset_by_admin",
    entityType: "user",
    entityId: userId,
    entityLabel: target.email,
    ipAddress: req.ip,
    userAgent: req.headers["user-agent"],
    newValue: { resetBy: req.authUser!.email },
    timestamp: new Date(),
  });

  res.json({ success: true });
});

router.post("/auth/mfa/disable", requireAuth, async (req, res) => {
  const isAdmin = req.authUser!.role === "admin";
  const { userId, password, code } = req.body;
  const targetId = isAdmin && userId ? userId : req.authUser!.id;

  if (!isAdmin) {
    if (!password) {
      res.status(400).json({ error: "Password confirmation required" });
      return;
    }
    const [self] = await db.select().from(usersTable).where(eq(usersTable.id, req.authUser!.id)).limit(1);
    if (!self || !await bcrypt.compare(password, self.passwordHash)) {
      res.status(400).json({ error: "Incorrect password" });
      return;
    }
    if (self.mfaEnabled && self.mfaSecret) {
      if (!code) {
        res.status(400).json({ error: "Current MFA code required" });
        return;
      }
      const secret = decryptSecret(self.mfaSecret);
      if (!verifyTotp(secret, code)) {
        res.status(400).json({ error: "Invalid MFA code" });
        return;
      }
    }
  }

  const [target] = await db.select().from(usersTable).where(eq(usersTable.id, targetId)).limit(1);
  if (!target) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  await db.update(usersTable).set({
    mfaEnabled: false,
    mfaSecret: null,
    mfaEnrolledAt: null,
    mfaRecoveryCodes: null,
    mfaResetRequired: false,
    mfaRequired: false,
    updatedAt: new Date(),
  }).where(eq(usersTable.id, targetId));

  await db.insert(auditLogsTable).values({
    id: randomUUID(),
    userId: req.authUser!.id,
    userName: req.authUser!.name,
    action: "mfa_disabled",
    entityType: "user",
    entityId: targetId,
    entityLabel: target.email,
    ipAddress: req.ip,
    userAgent: req.headers["user-agent"],
    newValue: { disabledBy: req.authUser!.email },
    timestamp: new Date(),
  });

  res.json({ success: true });
});

router.patch("/auth/mfa/require-user", requireAuth, requireRole("admin"), async (req, res) => {
  const { userId, mfaRequired } = req.body;
  if (!userId) {
    res.status(400).json({ error: "userId is required" });
    return;
  }

  const [target] = await db.select().from(usersTable).where(eq(usersTable.id, userId)).limit(1);
  if (!target) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  await db.update(usersTable).set({ mfaRequired: mfaRequired !== false, updatedAt: new Date() }).where(eq(usersTable.id, userId));

  await db.insert(auditLogsTable).values({
    id: randomUUID(),
    userId: req.authUser!.id,
    userName: req.authUser!.name,
    action: "mfa_required_set",
    entityType: "user",
    entityId: userId,
    entityLabel: target.email,
    ipAddress: req.ip,
    userAgent: req.headers["user-agent"],
    newValue: { mfaRequired: mfaRequired !== false },
    timestamp: new Date(),
  });

  res.json({ success: true });
});

router.post("/auth/unlock-user", requireAuth, requireRole("admin"), async (req, res) => {
  const { userId } = req.body;
  if (!userId) {
    res.status(400).json({ error: "userId is required" });
    return;
  }

  const [target] = await db.select().from(usersTable).where(eq(usersTable.id, userId)).limit(1);
  if (!target) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  await db.update(usersTable).set({ lockedUntil: null, failedLoginCount: 0, updatedAt: new Date() }).where(eq(usersTable.id, userId));

  await db.insert(auditLogsTable).values({
    id: randomUUID(),
    userId: req.authUser!.id,
    userName: req.authUser!.name,
    action: "account_unlocked",
    entityType: "user",
    entityId: userId,
    entityLabel: target.email,
    ipAddress: req.ip,
    userAgent: req.headers["user-agent"],
    newValue: { unlockedBy: req.authUser!.email },
    timestamp: new Date(),
  });

  res.json({ success: true });
});

// ─── Security Settings ────────────────────────────────────────────────────────

router.get("/auth/security-settings", requireAuth, requireRole("admin"), async (req, res) => {
  const settings = await getSecuritySettings();
  res.json(settings);
});

router.patch("/auth/security-settings", requireAuth, requireRole("admin"), async (req, res) => {
  const { mfaEnforcementMode, maxFailedLoginAttempts, lockoutDurationMinutes } = req.body;
  const current = await getSecuritySettings();

  await db.insert(securitySettingsTable).values({
    id: "global",
    mfaEnforcementMode: mfaEnforcementMode ?? current.mfaEnforcementMode,
    maxFailedLoginAttempts: maxFailedLoginAttempts ?? current.maxFailedLoginAttempts,
    lockoutDurationMinutes: lockoutDurationMinutes ?? current.lockoutDurationMinutes,
    updatedAt: new Date(),
  }).onConflictDoUpdate({
    target: securitySettingsTable.id,
    set: {
      mfaEnforcementMode: mfaEnforcementMode ?? current.mfaEnforcementMode,
      maxFailedLoginAttempts: maxFailedLoginAttempts ?? current.maxFailedLoginAttempts,
      lockoutDurationMinutes: lockoutDurationMinutes ?? current.lockoutDurationMinutes,
      updatedAt: new Date(),
    },
  });

  await db.insert(auditLogsTable).values({
    id: randomUUID(),
    userId: req.authUser!.id,
    userName: req.authUser!.name,
    action: "mfa_policy_changed",
    entityType: "security_settings",
    entityId: "global",
    entityLabel: "Global Security Settings",
    ipAddress: req.ip,
    userAgent: req.headers["user-agent"],
    previousValue: { mfaEnforcementMode: current.mfaEnforcementMode },
    newValue: { mfaEnforcementMode: mfaEnforcementMode ?? current.mfaEnforcementMode },
    timestamp: new Date(),
  });

  const updated = await getSecuritySettings();
  res.json(updated);
});

// ─── Security Center ──────────────────────────────────────────────────────────

router.get("/auth/security-center", requireAuth, requireRole("admin"), async (req, res) => {
  const settings = await getSecuritySettings();

  const allUsers = await db
    .select({
      id: usersTable.id,
      name: usersTable.name,
      email: usersTable.email,
      role: usersTable.role,
      mfaEnabled: usersTable.mfaEnabled,
      mfaRequired: usersTable.mfaRequired,
      mfaResetRequired: usersTable.mfaResetRequired,
      isActive: usersTable.isActive,
      lockedUntil: usersTable.lockedUntil,
      failedLoginCount: usersTable.failedLoginCount,
    })
    .from(usersTable)
    .where(eq(usersTable.isActive, true));

  const privilegedRoles = ["admin", "compliance_manager", "reviewer"];
  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  const enrolled = allUsers.filter((u) => u.mfaEnabled);
  const notEnrolled = allUsers.filter((u) => !u.mfaEnabled);
  const privilegedWithoutMfa = allUsers.filter((u) => privilegedRoles.includes(u.role) && !u.mfaEnabled);
  const lockedAccounts = allUsers.filter((u) => u.lockedUntil && u.lockedUntil > now);

  const mfaActionTypes = [
    "mfa_setup_started", "mfa_enabled", "mfa_verify_success", "mfa_verify_failure",
    "mfa_recovery_code_used", "mfa_reset_by_admin", "mfa_disabled", "mfa_policy_changed",
    "mfa_required_set", "account_locked", "account_unlocked", "login_failed", "logged_in", "logged_out",
  ];

  const recentEvents = await db
    .select()
    .from(auditLogsTable)
    .where(sql`${auditLogsTable.action}::text = ANY(ARRAY[${sql.raw(mfaActionTypes.map(v => `'${v}'`).join(","))}])`)
    .orderBy(sql`${auditLogsTable.timestamp} DESC`)
    .limit(50);

  // ── Password Reset Stats ──────────────────────────────────────────────────
  const [pendingRow] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(passwordResetTokensTable)
    .where(
      and(
        eq(passwordResetTokensTable.status, "pending"),
        sql`${passwordResetTokensTable.expiresAt} > ${now}`,
      ),
    );

  const [completedRow] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(passwordResetTokensTable)
    .where(
      and(
        eq(passwordResetTokensTable.status, "used"),
        sql`${passwordResetTokensTable.usedAt} >= ${thirtyDaysAgo}`,
      ),
    );

  const resetActionTypes = [
    "password_reset_requested",
    "password_reset_completed",
    "password_reset_email_sent",
    "password_reset_email_failed",
    "password_reset_link_sent_by_admin",
    "password_reset_requested_unknown_email",
  ];

  const recentResetEvents = await db
    .select()
    .from(auditLogsTable)
    .where(sql`${auditLogsTable.action}::text = ANY(ARRAY[${sql.raw(resetActionTypes.map(v => `'${v}'`).join(","))}])`)
    .orderBy(sql`${auditLogsTable.timestamp} DESC`)
    .limit(25);

  res.json({
    settings,
    stats: {
      totalUsers: allUsers.length,
      enrolledCount: enrolled.length,
      notEnrolledCount: notEnrolled.length,
    },
    privilegedWithoutMfa: privilegedWithoutMfa.map((u) => ({ id: u.id, name: u.name, email: u.email, role: u.role })),
    lockedAccounts: lockedAccounts.map((u) => ({
      id: u.id, name: u.name, email: u.email, role: u.role,
      lockedUntil: u.lockedUntil, failedLoginCount: u.failedLoginCount,
    })),
    recentEvents,
    passwordResetStats: {
      pendingCount: pendingRow?.count ?? 0,
      completedLast30Days: completedRow?.count ?? 0,
    },
    recentResetEvents,
  });
});

// ─── Forgot Password ─────────────────────────────────────────────────────────

router.post("/auth/forgot-password", async (req, res) => {
  const { email } = req.body;
  if (!email || typeof email !== "string") {
    res.status(400).json({ error: "Email is required" });
    return;
  }

  const normalizedEmail = email.toLowerCase().trim();
  const ip = req.ip ?? "unknown";
  const ua = req.headers["user-agent"] ?? "";

  // Always respond immediately — prevents timing-based enumeration
  res.json({ success: true });

  if (!checkForgotPasswordRateLimit(ip, normalizedEmail)) {
    return;
  }

  setImmediate(async () => {
    try {
      const [user] = await db
        .select()
        .from(usersTable)
        .where(and(eq(usersTable.email, normalizedEmail), eq(usersTable.isActive, true)))
        .limit(1);

      if (!user) {
        await db.insert(auditLogsTable).values({
          id: randomUUID(),
          action: "password_reset_requested_unknown_email" as any,
          entityType: "user",
          entityLabel: normalizedEmail,
          ipAddress: ip,
          userAgent: ua,
          timestamp: new Date(),
        });
        return;
      }

      // Revoke any existing pending tokens
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
        requestedIp: ip,
        requestedUserAgent: ua,
        createdAt: now,
        updatedAt: now,
      });

      await db.insert(auditLogsTable).values({
        id: randomUUID(),
        userId: user.id,
        userName: user.name,
        action: "password_reset_requested" as any,
        entityType: "user",
        entityId: user.id,
        entityLabel: user.email,
        ipAddress: ip,
        userAgent: ua,
        timestamp: now,
      });

      const resetUrl = `${getAppBaseUrl()}/reset-password?token=${rawToken}`;

      try {
        await sendPasswordResetEmail({
          toEmail: user.email,
          toName: user.name.split(" ")[0] || user.name,
          resetUrl,
        });
        await db.insert(auditLogsTable).values({
          id: randomUUID(),
          userId: user.id,
          userName: user.name,
          action: "password_reset_email_sent" as any,
          entityType: "user",
          entityId: user.id,
          entityLabel: user.email,
          ipAddress: ip,
          userAgent: ua,
          timestamp: new Date(),
        });
      } catch (err) {
        logger.error({ err, email: user.email }, "Failed to send password reset email");
        await db.insert(auditLogsTable).values({
          id: randomUUID(),
          userId: user.id,
          userName: user.name,
          action: "password_reset_email_failed" as any,
          entityType: "user",
          entityId: user.id,
          entityLabel: user.email,
          ipAddress: ip,
          userAgent: ua,
          newValue: { error: String(err) },
          timestamp: new Date(),
        });
      }
    } catch (err) {
      logger.error({ err }, "Error processing forgot password request");
    }
  });
});

// ─── Validate Reset Token ────────────────────────────────────────────────────

router.get("/auth/reset-password/validate", async (req, res) => {
  const rawToken = req.query.token as string | undefined;
  if (!rawToken) {
    res.json({ valid: false, status: "invalid" });
    return;
  }

  const tokenHash = hashResetToken(rawToken);
  const now = new Date();

  const [token] = await db
    .select()
    .from(passwordResetTokensTable)
    .where(eq(passwordResetTokensTable.tokenHash, tokenHash))
    .limit(1);

  if (!token) {
    res.json({ valid: false, status: "invalid" });
    return;
  }

  if (token.status === "used") {
    res.json({ valid: false, status: "used" });
    return;
  }

  if (token.status === "revoked" || token.status === "expired") {
    res.json({ valid: false, status: "expired" });
    return;
  }

  if (token.expiresAt < now) {
    await db
      .update(passwordResetTokensTable)
      .set({ status: "expired", updatedAt: new Date() })
      .where(eq(passwordResetTokensTable.id, token.id));
    res.json({ valid: false, status: "expired" });
    return;
  }

  if (token.status !== "pending") {
    res.json({ valid: false, status: "invalid" });
    return;
  }

  const [user] = await db
    .select({ name: usersTable.name })
    .from(usersTable)
    .where(eq(usersTable.id, token.userId))
    .limit(1);

  res.json({
    valid: true,
    status: "valid",
    firstName: user?.name?.split(" ")[0] ?? "",
  });
});

// ─── Reset Password ──────────────────────────────────────────────────────────

router.post("/auth/reset-password", async (req, res) => {
  const { token: rawToken, newPassword, confirmPassword } = req.body;

  if (!rawToken || !newPassword || !confirmPassword) {
    res.status(400).json({ error: "token, newPassword, and confirmPassword are required" });
    return;
  }

  if (newPassword !== confirmPassword) {
    res.status(400).json({ error: "Passwords do not match" });
    return;
  }

  const policyError = validatePasswordPolicy(newPassword);
  if (policyError) {
    res.status(400).json({ error: policyError });
    return;
  }

  const tokenHash = hashResetToken(rawToken);
  const now = new Date();
  const ip = req.ip ?? "unknown";
  const ua = req.headers["user-agent"] ?? "";

  const [token] = await db
    .select()
    .from(passwordResetTokensTable)
    .where(eq(passwordResetTokensTable.tokenHash, tokenHash))
    .limit(1);

  if (!token) {
    res.status(400).json({ code: "invalid", error: "This password reset link is invalid." });
    return;
  }

  if (token.status === "used") {
    res.status(400).json({ code: "used", error: "This password reset link has already been used." });
    return;
  }

  if (token.status !== "pending" || token.expiresAt < now) {
    res.status(400).json({ code: "expired", error: "This password reset link has expired. Please request a new one." });
    return;
  }

  const [user] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.id, token.userId))
    .limit(1);

  if (!user || !user.isActive) {
    res.status(400).json({ code: "invalid", error: "This password reset link is invalid." });
    return;
  }

  const passwordHash = await bcrypt.hash(newPassword, 12);

  await db
    .update(usersTable)
    .set({ passwordHash, failedLoginCount: 0, lockedUntil: null, updatedAt: now })
    .where(eq(usersTable.id, user.id));

  await db
    .update(passwordResetTokensTable)
    .set({ status: "used", usedAt: now, updatedAt: now })
    .where(eq(passwordResetTokensTable.id, token.id));

  // Revoke any other pending tokens for this user
  await db
    .update(passwordResetTokensTable)
    .set({ status: "revoked", updatedAt: now })
    .where(
      and(
        eq(passwordResetTokensTable.userId, user.id),
        eq(passwordResetTokensTable.status, "pending"),
      ),
    );

  await db.insert(auditLogsTable).values([
    {
      id: randomUUID(),
      userId: user.id,
      userName: user.name,
      action: "password_reset_completed" as any,
      entityType: "user",
      entityId: user.id,
      entityLabel: user.email,
      ipAddress: ip,
      userAgent: ua,
      timestamp: now,
    },
  ]);

  res.json({ success: true });
});

// ─── SSO: Entra ID OAuth2/PKCE ────────────────────────────────────────────────

// GET /api/auth/sso/initiate?email=<email>
// Looks up the SSO config for the email's domain and returns the Microsoft
// authorization URL. No authentication required (user is signing in).
router.get("/auth/sso/initiate", async (req, res) => {
  const rawEmail = (req.query.email as string | undefined)?.toLowerCase().trim();
  if (!rawEmail) {
    res.status(400).json({ error: "email query parameter is required" });
    return;
  }

  const atIdx = rawEmail.indexOf("@");
  if (atIdx < 1) {
    res.status(400).json({ error: "Invalid email address" });
    return;
  }
  const domain = rawEmail.slice(atIdx + 1);

  const [cfg] = await db
    .select()
    .from(ssoConfigsTable)
    .where(and(eq(ssoConfigsTable.emailDomain, domain), eq(ssoConfigsTable.enabled, true)))
    .limit(1);

  if (!cfg) {
    res.status(404).json({ error: "No SSO configured for this email domain. Contact your administrator." });
    return;
  }

  const { codeVerifier, codeChallenge } = generatePkce();
  const state = generateState();
  storeOauthState(state, codeVerifier, cfg.organizationId, cfg.id);

  const callbackUrl = `${getAppBaseUrl()}/api/auth/sso/callback`;
  const authUrl = buildAuthorizationUrl(cfg.tenantId, cfg.clientId, callbackUrl, state, codeChallenge);

  res.json({ authUrl, provider: cfg.provider });
});

// GET /api/auth/sso/callback?code=<code>&state=<state>
// Microsoft redirects here after authentication. Exchanges the code for tokens,
// extracts user info, creates or links the Control HUB user, issues a JWT,
// and redirects the browser back to the frontend with ?sso_token=<jwt>.
router.get("/auth/sso/callback", async (req, res) => {
  const { code, state, error: msError } = req.query as Record<string, string>;
  const frontendBase = getAppBaseUrl();

  if (msError) {
    logger.warn({ msError }, "Microsoft SSO error returned in callback");
    res.redirect(`${frontendBase}/login?sso_error=${encodeURIComponent(msError)}`);
    return;
  }

  if (!code || !state) {
    res.redirect(`${frontendBase}/login?sso_error=missing_params`);
    return;
  }

  const stateData = consumeOauthState(state);
  if (!stateData) {
    res.redirect(`${frontendBase}/login?sso_error=invalid_state`);
    return;
  }

  const [cfg] = await db
    .select()
    .from(ssoConfigsTable)
    .where(eq(ssoConfigsTable.id, stateData.configId))
    .limit(1);
  if (!cfg || !cfg.enabled) {
    res.redirect(`${frontendBase}/login?sso_error=config_not_found`);
    return;
  }

  const callbackUrl = `${getAppBaseUrl()}/api/auth/sso/callback`;

  let idToken: string;
  try {
    const clientSecret = decryptSecret(cfg.clientSecretEnc);
    const tokens = await exchangeCodeForToken(
      cfg.tenantId,
      cfg.clientId,
      clientSecret,
      code,
      callbackUrl,
      stateData.codeVerifier
    );
    idToken = tokens.id_token;
  } catch (e) {
    logger.error({ err: e }, "SSO token exchange failed");
    res.redirect(`${frontendBase}/login?sso_error=token_exchange_failed`);
    return;
  }

  let userInfo: { email: string; name: string; sub: string };
  try {
    userInfo = parseIdToken(idToken);
  } catch (e) {
    logger.error({ err: e }, "SSO id_token parse failed");
    res.redirect(`${frontendBase}/login?sso_error=invalid_token`);
    return;
  }

  // Find or create the Control HUB user
  let [user] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.email, userInfo.email))
    .limit(1);

  const now = new Date();
  const ip = (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() ?? req.ip ?? "unknown";
  const ua = req.headers["user-agent"] ?? "unknown";

  if (user) {
    // Existing user — check they are active and SSO not disabled
    if (!user.isActive) {
      res.redirect(`${frontendBase}/login?sso_error=account_inactive`);
      return;
    }
    if ((user as any).ssoDisabled) {
      res.redirect(`${frontendBase}/login?sso_error=sso_disabled`);
      return;
    }
    // Update last login
    await db
      .update(usersTable)
      .set({ lastLoginAt: now, updatedAt: now })
      .where(eq(usersTable.id, user.id));
  } else {
    // New user — create and add to org
    const newId = randomUUID();
    [user] = await db
      .insert(usersTable)
      .values({
        id: newId,
        name: userInfo.name,
        email: userInfo.email,
        passwordHash: null,
        role: "it_contributor",
        isActive: true,
        status: "active",
        lastLoginAt: now,
        createdAt: now,
        updatedAt: now,
      } as any)
      .returning();

    // Add to org
    await db
      .insert(organizationUsersTable)
      .values({
        userId: newId,
        organizationId: cfg.organizationId,
        role: "member",
        joinedAt: now,
      } as any)
      .onConflictDoNothing();
  }

  // Ensure org membership exists
  const [membership] = await db
    .select({ userId: organizationUsersTable.userId })
    .from(organizationUsersTable)
    .where(
      and(
        eq(organizationUsersTable.userId, user.id),
        eq(organizationUsersTable.organizationId, cfg.organizationId)
      )
    )
    .limit(1);

  if (!membership) {
    await db
      .insert(organizationUsersTable)
      .values({
        userId: user.id,
        organizationId: cfg.organizationId,
        role: "member",
        joinedAt: now,
      } as any)
      .onConflictDoNothing();
  }

  // Audit log
  await db.insert(auditLogsTable).values({
    id: randomUUID(),
    userId: user.id,
    userName: user.name,
    action: "sso_login" as any,
    entityType: "user",
    entityId: user.id,
    entityLabel: user.email,
    newValue: { provider: cfg.provider, orgId: cfg.organizationId },
    ipAddress: ip,
    userAgent: ua,
    timestamp: now,
    organizationId: cfg.organizationId,
  });

  const jwtToken = signToken({ id: user.id, name: user.name, email: user.email, role: user.role });
  res.redirect(`${frontendBase}/login?sso_token=${encodeURIComponent(jwtToken)}`);
});

export default router;
