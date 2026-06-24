import jwt from "jsonwebtoken";
import { Request, Response, NextFunction } from "express";
import { db, usersTable, breakGlassSessionsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { createHash } from "crypto";

const JWT_SECRET = process.env.SESSION_SECRET ?? "cmmc-dev-secret-change-in-prod";
const BREAK_GLASS_IDLE_MINUTES = 15;

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: string;
}

export function signToken(user: AuthUser, expiresIn: string = "24h"): string {
  return jwt.sign(user, JWT_SECRET, { expiresIn });
}

export function verifyToken(token: string): AuthUser | null {
  try {
    return jwt.verify(token, JWT_SECRET) as AuthUser;
  } catch {
    return null;
  }
}

export function hashJwtToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

declare global {
  namespace Express {
    interface Request {
      authUser?: AuthUser;
      orgId?: string;
      isBreakGlass?: boolean;
    }
  }
}

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const token = authHeader.slice(7);
  const user = verifyToken(token);
  if (!user) {
    res.status(401).json({ error: "Invalid or expired token" });
    return;
  }
  const dbUser = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.id, user.id))
    .limit(1);
  if (!dbUser[0] || !dbUser[0].isActive) {
    res.status(401).json({ error: "User not found or inactive" });
    return;
  }

  if (dbUser[0].isBreakGlass) {
    const tokenHash = hashJwtToken(token);
    const [session] = await db
      .select()
      .from(breakGlassSessionsTable)
      .where(eq(breakGlassSessionsTable.tokenHash, tokenHash))
      .limit(1);

    if (!session || session.revokedAt) {
      res.status(401).json({ error: "Break-glass session has been revoked" });
      return;
    }

    const now = new Date();

    if (session.expiresAt < now) {
      // Mark as revoked on absolute expiry
      db.update(breakGlassSessionsTable)
        .set({ revokedAt: now })
        .where(eq(breakGlassSessionsTable.id, session.id))
        .catch(() => {});
      res.status(401).json({ error: "Break-glass session has expired" });
      return;
    }

    const idleLimit = new Date(session.lastActiveAt.getTime() + BREAK_GLASS_IDLE_MINUTES * 60 * 1000);
    if (now > idleLimit) {
      // Mark as revoked on idle timeout
      db.update(breakGlassSessionsTable)
        .set({ revokedAt: now })
        .where(eq(breakGlassSessionsTable.id, session.id))
        .catch(() => {});
      res.status(401).json({ error: "Break-glass session timed out due to inactivity" });
      return;
    }

    db.update(breakGlassSessionsTable)
      .set({ lastActiveAt: now })
      .where(eq(breakGlassSessionsTable.id, session.id))
      .catch(() => {});

    req.isBreakGlass = true;
  }

  req.authUser = user;
  next();
}

export function requireRole(...roles: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.authUser) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    if (!roles.includes(req.authUser.role)) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }
    next();
  };
}

/** Blocks the assessor role from performing any write operation. */
export function requireNotAssessor(req: Request, res: Response, next: NextFunction) {
  if (req.authUser?.role === "assessor") {
    res.status(403).json({ error: "Assessors cannot perform write operations" });
    return;
  }
  next();
}
