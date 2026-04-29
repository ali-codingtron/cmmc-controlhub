import { Router } from "express";
import { db, auditLogsTable } from "@workspace/db";
import { eq, and, gte, lte, desc } from "drizzle-orm";
import { requireAuth } from "../lib/auth";

const router = Router();

router.get("/audit-logs", requireAuth, async (req, res) => {
  const { entityType, action, userId, from, to, limit } =
    req.query as Record<string, string>;

  const logs = await db
    .select()
    .from(auditLogsTable)
    .where(
      and(
        entityType ? eq(auditLogsTable.entityType, entityType) : undefined,
        action ? eq(auditLogsTable.action, action as any) : undefined,
        userId ? eq(auditLogsTable.userId, userId) : undefined,
        from ? gte(auditLogsTable.timestamp, new Date(from)) : undefined,
        to ? lte(auditLogsTable.timestamp, new Date(to)) : undefined
      )
    )
    .orderBy(desc(auditLogsTable.timestamp))
    .limit(parseInt(limit ?? "100"));

  res.json(logs);
});

export default router;
