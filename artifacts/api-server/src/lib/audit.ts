import { db, auditLogsTable } from "@workspace/db";
import { Request } from "express";
import { randomUUID } from "crypto";

type AuditAction = typeof auditLogsTable.$inferInsert["action"];

export async function logAudit(
  req: Request,
  action: AuditAction,
  entityType: string,
  entityId: string,
  opts?: {
    entityLabel?: string;
    previousValue?: unknown;
    newValue?: unknown;
  }
) {
  try {
    await db.insert(auditLogsTable).values({
      id: randomUUID(),
      userId: req.authUser?.id,
      userName: req.authUser?.name,
      action,
      entityType,
      entityId,
      entityLabel: opts?.entityLabel,
      previousValue: opts?.previousValue ?? null,
      newValue: opts?.newValue ?? null,
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"],
      timestamp: new Date(),
    });
  } catch (_e) {
    req.log?.warn?.({ _e }, "Failed to write audit log");
  }
}
