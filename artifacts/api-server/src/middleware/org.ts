import { Request, Response, NextFunction } from "express";
import { db, organizationUsersTable, organizationsTable } from "@workspace/db";
import { and, eq } from "drizzle-orm";

export async function requireOrg(req: Request, res: Response, next: NextFunction) {
  // Assessors are read-only across the entire application
  if (
    req.authUser?.role === "assessor" &&
    ["POST", "PATCH", "PUT", "DELETE"].includes(req.method)
  ) {
    res.status(403).json({ error: "Assessors cannot perform write operations" });
    return;
  }

  const orgId = req.headers["x-organization-id"] as string | undefined;

  if (!orgId) {
    if (req.authUser?.role === "admin") {
      next();
      return;
    }
    res.status(400).json({ error: "X-Organization-ID header required" });
    return;
  }

  const [org] = await db
    .select({ id: organizationsTable.id, isActive: organizationsTable.isActive })
    .from(organizationsTable)
    .where(eq(organizationsTable.id, orgId))
    .limit(1);

  if (!org || !org.isActive) {
    res.status(404).json({ error: "Organization not found" });
    return;
  }

  if (req.authUser?.role === "admin") {
    req.orgId = orgId;
    next();
    return;
  }

  const [membership] = await db
    .select({ id: organizationUsersTable.id })
    .from(organizationUsersTable)
    .where(
      and(
        eq(organizationUsersTable.organizationId, orgId),
        eq(organizationUsersTable.userId, req.authUser!.id),
        eq(organizationUsersTable.status, "active")
      )
    )
    .limit(1);

  if (!membership) {
    res.status(403).json({ error: "Access denied to this organization" });
    return;
  }

  req.orgId = orgId;
  next();
}
