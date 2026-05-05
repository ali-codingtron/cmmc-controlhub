import jwt from "jsonwebtoken";
import { Request, Response, NextFunction } from "express";
import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const JWT_SECRET = process.env.SESSION_SECRET ?? "cmmc-dev-secret-change-in-prod";

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: string;
}

export function signToken(user: AuthUser): string {
  return jwt.sign(user, JWT_SECRET, { expiresIn: "24h" });
}

export function verifyToken(token: string): AuthUser | null {
  try {
    return jwt.verify(token, JWT_SECRET) as AuthUser;
  } catch {
    return null;
  }
}

declare global {
  namespace Express {
    interface Request {
      authUser?: AuthUser;
      orgId?: string;
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
