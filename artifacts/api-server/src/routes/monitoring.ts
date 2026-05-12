import { Router } from "express";
import { db, monitoringItemsTable, organizationsTable } from "@workspace/db";
import { eq, and, ilike, or, lte, gte, count, sql } from "drizzle-orm";
import { requireAuth } from "../lib/auth";
import { requireOrg } from "../middleware/org";
import { randomUUID } from "crypto";

const router = Router();

const MONITORING_SEED_ITEMS = [
  { frequency: "daily" as const,     task: "Review Defender Alerts",    controlRef: "3.14.3",  description: "Check Microsoft Defender for active alerts", sortOrder: 0 },
  { frequency: "weekly" as const,    task: "Review Entra Sign-in Logs", controlRef: "3.3.x",   description: "Check for suspicious logins", sortOrder: 1 },
  { frequency: "weekly" as const,    task: "Review Audit Logs",         controlRef: "3.12.3",  description: "Review Purview audit logs", sortOrder: 2 },
  { frequency: "weekly" as const,    task: "Review Vulnerabilities",    controlRef: "3.11.2",  description: "Check Defender recommendations", sortOrder: 3 },
  { frequency: "weekly" as const,    task: "Update POA&M",              controlRef: "3.12.2",  description: "Update any findings", sortOrder: 4 },
  { frequency: "weekly" as const,    task: "Check Device Compliance",   controlRef: "3.4.x",   description: "Verify Intune compliance", sortOrder: 5 },
  { frequency: "monthly" as const,   task: "Review Firewall Rules",     controlRef: "3.13.6",  description: "Validate deny-by-default rules", sortOrder: 6 },
  { frequency: "monthly" as const,   task: "Review User Accounts",      controlRef: "3.1.x",   description: "Check user and admin accounts", sortOrder: 7 },
  { frequency: "monthly" as const,   task: "Verify Backups",            controlRef: "3.8.9",   description: "Ensure backups are accessible", sortOrder: 8 },
  { frequency: "monthly" as const,   task: "Verify Updates",            controlRef: "3.14.1",  description: "Confirm patches applied", sortOrder: 9 },
  { frequency: "monthly" as const,   task: "Check Media Compliance",    controlRef: "3.8.x",   description: "Ensure no unauthorized media", sortOrder: 10 },
  { frequency: "quarterly" as const, task: "Review Risk Assessment",    controlRef: "3.11.1",  description: "Update risk profile", sortOrder: 11 },
  { frequency: "quarterly" as const, task: "Review Policies",           controlRef: "ALL",     description: "Ensure policies are current", sortOrder: 12 },
  { frequency: "quarterly" as const, task: "Test Incident Response",    controlRef: "3.6.3",   description: "Run simulated incident", sortOrder: 13 },
  { frequency: "annually" as const,  task: "Security Assessment",       controlRef: "3.12.1",  description: "Full control review", sortOrder: 14 },
  { frequency: "annually" as const,  task: "Update SSP",                controlRef: "3.12.4",  description: "Update system security plan", sortOrder: 15 },
  { frequency: "annually" as const,  task: "Security Training",         controlRef: "3.2.x",   description: "Complete awareness training", sortOrder: 16 },
  { frequency: "annually" as const,  task: "Formal Risk Review",        controlRef: "3.11.1",  description: "Update risk documentation", sortOrder: 17 },
  { frequency: "annually" as const,  task: "Access Review",             controlRef: "3.1.x",   description: "Review user access", sortOrder: 18 },
];

export async function seedMonitoringItemsForOrg(orgId: string): Promise<void> {
  const [{ value: existing }] = await db
    .select({ value: count() })
    .from(monitoringItemsTable)
    .where(eq(monitoringItemsTable.organizationId, orgId));

  if (Number(existing) > 0) return;

  await db.insert(monitoringItemsTable).values(
    MONITORING_SEED_ITEMS.map((item) => ({
      id: randomUUID(),
      organizationId: orgId,
      ...item,
      status: "open" as const,
      createdAt: new Date(),
      updatedAt: new Date(),
    }))
  );
}

router.get("/monitoring", requireAuth, requireOrg, async (req, res) => {
  const { frequency, status, controlRef, search } = req.query as Record<string, string>;
  const orgId = req.orgId;

  const items = await db
    .select()
    .from(monitoringItemsTable)
    .where(
      and(
        orgId ? eq(monitoringItemsTable.organizationId, orgId) : undefined,
        frequency ? eq(monitoringItemsTable.frequency, frequency as any) : undefined,
        status ? eq(monitoringItemsTable.status, status as any) : undefined,
        controlRef ? eq(monitoringItemsTable.controlRef, controlRef) : undefined,
        search
          ? or(
              ilike(monitoringItemsTable.task, `%${search}%`),
              ilike(monitoringItemsTable.description, `%${search}%`)
            )
          : undefined
      )
    )
    .orderBy(monitoringItemsTable.sortOrder);

  res.json(items);
});

router.patch("/monitoring/:id", requireAuth, requireOrg, async (req, res) => {
  const orgId = req.orgId;

  const [existing] = await db
    .select()
    .from(monitoringItemsTable)
    .where(
      and(
        eq(monitoringItemsTable.id, req.params.id),
        orgId ? eq(monitoringItemsTable.organizationId, orgId) : undefined
      )
    )
    .limit(1);

  if (!existing) {
    res.status(404).json({ error: "Not found" });
    return;
  }

  const { lastCompleted, nextDue, status, notes, frequency } = req.body;

  await db
    .update(monitoringItemsTable)
    .set({
      frequency: frequency !== undefined ? frequency : existing.frequency,
      lastCompleted:
        lastCompleted !== undefined
          ? lastCompleted
            ? new Date(lastCompleted)
            : null
          : existing.lastCompleted,
      nextDue:
        nextDue !== undefined
          ? nextDue
            ? new Date(nextDue)
            : null
          : existing.nextDue,
      status: status ?? existing.status,
      notes: notes !== undefined ? notes : existing.notes,
      updatedAt: new Date(),
    })
    .where(eq(monitoringItemsTable.id, req.params.id));

  const [updated] = await db
    .select()
    .from(monitoringItemsTable)
    .where(eq(monitoringItemsTable.id, req.params.id))
    .limit(1);

  res.json(updated);
});

router.get("/monitoring/stats", requireAuth, requireOrg, async (req, res) => {
  const orgId = req.orgId;

  // Use DATE-only comparison to avoid timestamp vs midnight-UTC mismatch.
  // Items due today are NOT overdue; only strictly-past dates count.
  // Status is NOT excluded — if nextDue passed, the item needs redoing regardless.
  const [overdueCount] = await db
    .select({ value: count() })
    .from(monitoringItemsTable)
    .where(
      and(
        orgId ? eq(monitoringItemsTable.organizationId, orgId) : undefined,
        sql`${monitoringItemsTable.nextDue} IS NOT NULL`,
        sql`DATE(${monitoringItemsTable.nextDue}) < CURRENT_DATE`
      )
    );

  // Due-soon counts ALL items whose next cycle falls within 7 days — including
  // 'current' ones, because monitoring tasks recur and the upcoming cycle matters.
  const [dueSoonCount] = await db
    .select({ value: count() })
    .from(monitoringItemsTable)
    .where(
      and(
        orgId ? eq(monitoringItemsTable.organizationId, orgId) : undefined,
        sql`${monitoringItemsTable.nextDue} IS NOT NULL`,
        sql`DATE(${monitoringItemsTable.nextDue}) >= CURRENT_DATE`,
        sql`DATE(${monitoringItemsTable.nextDue}) <= CURRENT_DATE + INTERVAL '7 days'`
      )
    );

  // Current = status 'current' AND not overdue (past-due items display as "Overdue")
  const [currentCount] = await db
    .select({ value: count() })
    .from(monitoringItemsTable)
    .where(
      and(
        orgId ? eq(monitoringItemsTable.organizationId, orgId) : undefined,
        eq(monitoringItemsTable.status, "current"),
        sql`(${monitoringItemsTable.nextDue} IS NULL OR DATE(${monitoringItemsTable.nextDue}) >= CURRENT_DATE)`
      )
    );

  res.json({
    overdue: Number(overdueCount?.value ?? 0),
    dueSoon: Number(dueSoonCount?.value ?? 0),
    current: Number(currentCount?.value ?? 0),
  });
});

export default router;
