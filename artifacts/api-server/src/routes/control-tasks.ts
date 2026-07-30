/**
 * Control-scoped task routes.
 * All routes are nested under /organizations/:orgId/controls/:controlId/tasks
 * and enforce that the task belongs to both the org and the control.
 */
import { Router } from "express";
import {
  db,
  tasksTable,
  taskControlLinksTable,
  taskActivitiesTable,
  usersTable,
  controlsTable,
  organizationsTable,
  organizationUsersTable,
} from "@workspace/db";
import { eq, and, desc, isNotNull, inArray } from "drizzle-orm";
import { requireAuth } from "../lib/auth";
import { requireOrg } from "../middleware/org";
import { canDo } from "../lib/permissions";
import { logAudit } from "../lib/audit";
import { randomUUID } from "crypto";

const router = Router();

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Generate next TASK-XXXX number for this org (sequential, stable). */
async function generateTaskNumber(orgId: string): Promise<string> {
  const existing = await db
    .select({ taskNumber: tasksTable.taskNumber })
    .from(tasksTable)
    .where(and(eq(tasksTable.organizationId, orgId), isNotNull(tasksTable.taskNumber)));
  let max = 0;
  for (const row of existing) {
    if (row.taskNumber) {
      const match = row.taskNumber.match(/(\d+)$/);
      if (match) max = Math.max(max, parseInt(match[1], 10));
    }
  }
  return `TASK-${String(max + 1).padStart(4, "0")}`;
}

/** Resolve a set of user IDs to { id → name } map. */
async function resolveUserNames(ids: (string | null | undefined)[]): Promise<Record<string, string>> {
  const unique = [...new Set(ids.filter((id): id is string => !!id))];
  if (unique.length === 0) return {};
  const rows = await db
    .select({ id: usersTable.id, name: usersTable.name })
    .from(usersTable)
    .where(inArray(usersTable.id, unique));
  const map: Record<string, string> = {};
  for (const r of rows) if (r.name) map[r.id] = r.name;
  return map;
}

/** Load and validate a task belongs to this org + control. */
async function loadScopedTask(orgId: string, controlId: string, taskId: string) {
  // Verify the control link exists
  const [link] = await db
    .select({ taskId: taskControlLinksTable.taskId })
    .from(taskControlLinksTable)
    .where(and(
      eq(taskControlLinksTable.taskId, taskId),
      eq(taskControlLinksTable.controlId, controlId)
    ))
    .limit(1);
  if (!link) return null;

  // Fetch task + assignee in one join
  const [row] = await db
    .select({
      id: tasksTable.id,
      taskNumber: tasksTable.taskNumber,
      title: tasksTable.title,
      description: tasksTable.description,
      status: tasksTable.status,
      priority: tasksTable.priority,
      dueDate: tasksTable.dueDate,
      startDate: tasksTable.startDate,
      closedDate: tasksTable.closedDate,
      closureSummary: tasksTable.closureSummary,
      closedByUserId: tasksTable.closedByUserId,
      blockedReason: tasksTable.blockedReason,
      blockedByUserId: tasksTable.blockedByUserId,
      blockedAt: tasksTable.blockedAt,
      reopenedByUserId: tasksTable.reopenedByUserId,
      reopenedAt: tasksTable.reopenedAt,
      reopenReason: tasksTable.reopenReason,
      cancelledByUserId: tasksTable.cancelledByUserId,
      cancelledAt: tasksTable.cancelledAt,
      cancellationReason: tasksTable.cancellationReason,
      assigneeId: tasksTable.assigneeId,
      assigneeName: usersTable.name,
      assigneeEmail: usersTable.email,
      createdById: tasksTable.createdById,
      updatedByUserId: tasksTable.updatedByUserId,
      createdAt: tasksTable.createdAt,
      updatedAt: tasksTable.updatedAt,
      organizationId: tasksTable.organizationId,
    })
    .from(tasksTable)
    .leftJoin(usersTable, eq(usersTable.id, tasksTable.assigneeId))
    .where(and(eq(tasksTable.id, taskId), eq(tasksTable.organizationId, orgId)))
    .limit(1);

  if (!row) return null;

  // Resolve other user names in a single batch query
  const names = await resolveUserNames([
    row.createdById,
    row.closedByUserId,
    row.blockedByUserId,
    row.reopenedByUserId,
    row.cancelledByUserId,
    row.updatedByUserId,
  ]);

  return {
    ...row,
    createdByName: row.createdById ? (names[row.createdById] ?? null) : null,
    closedByUserName: row.closedByUserId ? (names[row.closedByUserId] ?? null) : null,
    blockedByUserName: row.blockedByUserId ? (names[row.blockedByUserId] ?? null) : null,
    reopenedByUserName: row.reopenedByUserId ? (names[row.reopenedByUserId] ?? null) : null,
    cancelledByUserName: row.cancelledByUserId ? (names[row.cancelledByUserId] ?? null) : null,
    updatedByUserName: row.updatedByUserId ? (names[row.updatedByUserId] ?? null) : null,
  };
}

/** Record a task activity event. */
async function recordActivity(
  tx: Pick<typeof db, "insert">,
  taskId: string,
  orgId: string,
  userId: string,
  userName: string | null,
  action: string,
  opts?: {
    field?: string;
    previousValue?: string | null;
    newValue?: string | null;
    note?: string | null;
  }
) {
  await tx.insert(taskActivitiesTable).values({
    id: randomUUID(),
    taskId,
    organizationId: orgId,
    actingUserId: userId,
    actingUserName: userName ?? null,
    action,
    field: opts?.field ?? null,
    previousValue: opts?.previousValue ?? null,
    newValue: opts?.newValue ?? null,
    note: opts?.note ?? null,
    createdAt: new Date(),
  });
}

/** Validate that an assignee is an active member of the org. */
async function validateAssignee(assigneeId: string, orgId: string) {
  const [m] = await db
    .select({ userId: organizationUsersTable.userId })
    .from(organizationUsersTable)
    .where(and(
      eq(organizationUsersTable.userId, assigneeId),
      eq(organizationUsersTable.organizationId, orgId),
      eq(organizationUsersTable.status, "active")
    ))
    .limit(1);
  return m ?? null;
}

// ─── GET org members (assignee picker) ───────────────────────────────────────
router.get(
  "/organizations/:orgId/members",
  requireAuth,
  requireOrg,
  async (req, res): Promise<void> => {
    const orgId = req.params.orgId as string;
    if (req.orgId !== orgId && req.authUser?.role !== "admin") {
      res.status(403).json({ error: "Access denied" }); return;
    }
    const members = await db
      .select({
        id: usersTable.id,
        name: usersTable.name,
        email: usersTable.email,
        role: organizationUsersTable.role,
      })
      .from(organizationUsersTable)
      .innerJoin(usersTable, eq(usersTable.id, organizationUsersTable.userId))
      .where(and(
        eq(organizationUsersTable.organizationId, orgId),
        eq(organizationUsersTable.status, "active")
      ))
      .orderBy(usersTable.name);
    res.json(members);
  }
);

// ─── GET task list ────────────────────────────────────────────────────────────
router.get(
  "/organizations/:orgId/controls/:controlId/tasks",
  requireAuth,
  requireOrg,
  async (req, res): Promise<void> => {
    const orgId = req.params.orgId as string;
    const controlId = req.params.controlId as string;
    if (req.orgId !== orgId && req.authUser?.role !== "admin") {
      res.status(403).json({ error: "Access denied" }); return;
    }

    const links = await db
      .select({ taskId: taskControlLinksTable.taskId })
      .from(taskControlLinksTable)
      .where(eq(taskControlLinksTable.controlId, controlId));

    if (links.length === 0) {
      res.json({ tasks: [], summary: { active: 0, inProgress: 0, blocked: 0, overdue: 0, closed: 0, cancelled: 0, total: 0 } });
      return;
    }

    const taskIds = links.map((l) => l.taskId);

    const tasks = await db
      .select({
        id: tasksTable.id,
        taskNumber: tasksTable.taskNumber,
        title: tasksTable.title,
        description: tasksTable.description,
        status: tasksTable.status,
        priority: tasksTable.priority,
        dueDate: tasksTable.dueDate,
        startDate: tasksTable.startDate,
        closedDate: tasksTable.closedDate,
        closureSummary: tasksTable.closureSummary,
        blockedReason: tasksTable.blockedReason,
        blockedAt: tasksTable.blockedAt,
        assigneeId: tasksTable.assigneeId,
        assigneeName: usersTable.name,
        assigneeEmail: usersTable.email,
        createdById: tasksTable.createdById,
        createdAt: tasksTable.createdAt,
        updatedAt: tasksTable.updatedAt,
        organizationId: tasksTable.organizationId,
      })
      .from(tasksTable)
      .leftJoin(usersTable, eq(usersTable.id, tasksTable.assigneeId))
      .where(and(
        eq(tasksTable.organizationId, orgId),
        inArray(tasksTable.id, taskIds)
      ))
      .orderBy(desc(tasksTable.createdAt));

    // Resolve creator names
    const creatorIds = [...new Set(tasks.map((t) => t.createdById).filter(Boolean))] as string[];
    const creatorNames = await resolveUserNames(creatorIds);

    const enriched = tasks.map((t) => ({
      ...t,
      createdByName: t.createdById ? (creatorNames[t.createdById] ?? null) : null,
    }));

    const now = new Date();
    const ACTIVE = new Set(["open", "in_progress", "blocked"]);
    const CLOSED = new Set(["closed", "completed"]);
    const summary = { active: 0, inProgress: 0, blocked: 0, overdue: 0, closed: 0, cancelled: 0, total: enriched.length };
    for (const t of enriched) {
      if (ACTIVE.has(t.status)) {
        summary.active++;
        if (t.status === "in_progress") summary.inProgress++;
        if (t.status === "blocked") summary.blocked++;
        if (t.dueDate && new Date(t.dueDate) < now) summary.overdue++;
      }
      if (CLOSED.has(t.status)) summary.closed++;
      if (t.status === "cancelled") summary.cancelled++;
    }
    res.json({ tasks: enriched, summary });
  }
);

// ─── POST create task ─────────────────────────────────────────────────────────
router.post(
  "/organizations/:orgId/controls/:controlId/tasks",
  requireAuth,
  requireOrg,
  async (req, res): Promise<void> => {
    const orgId = req.params.orgId as string;
    const controlId = req.params.controlId as string;
    if (req.orgId !== orgId && req.authUser?.role !== "admin") {
      res.status(403).json({ error: "Access denied" }); return;
    }
    if (!canDo(req, "tasks.create")) {
      res.status(403).json({ error: "You do not have permission to create tasks." }); return;
    }

    const [control] = await db
      .select({ id: controlsTable.id })
      .from(controlsTable)
      .where(eq(controlsTable.id, controlId))
      .limit(1);
    if (!control) { res.status(404).json({ error: "Control not found" }); return; }

    const { title, description, priority, dueDate, startDate, assigneeId } = req.body;
    if (!title?.trim()) { res.status(400).json({ error: "Title is required" }); return; }
    if (!description?.trim()) { res.status(400).json({ error: "Description is required" }); return; }
    if (!priority) { res.status(400).json({ error: "Priority is required" }); return; }

    if (assigneeId) {
      const m = await validateAssignee(assigneeId, orgId);
      if (!m) { res.status(400).json({ error: "The selected user does not have active access to this organization." }); return; }
    }

    const taskNumber = await generateTaskNumber(orgId);
    const id = randomUUID();
    const now = new Date();

    await db.transaction(async (tx) => {
      await tx.insert(tasksTable).values({
        id,
        organizationId: orgId,
        title: title.trim(),
        description: description.trim(),
        status: "open",
        priority,
        taskType: "general",
        taskNumber,
        dueDate: dueDate ? new Date(dueDate) : undefined,
        startDate: startDate ? new Date(startDate) : undefined,
        assigneeId: assigneeId || undefined,
        createdById: req.authUser!.id,
        tags: [],
        isRecurring: false,
        createdAt: now,
        updatedAt: now,
      });
      await tx.insert(taskControlLinksTable).values({
        id: randomUUID(), taskId: id, controlId, linkedAt: now,
      });
      await recordActivity(tx, id, orgId, req.authUser!.id, req.authUser!.name ?? null, "created", {
        note: `Task ${taskNumber} created`,
      });
    });

    await logAudit(req, "created", "task", id, { entityLabel: `${taskNumber}: ${title.trim()}` });
    const created = await loadScopedTask(orgId, controlId, id);
    res.status(201).json(created);
  }
);

// ─── GET task detail ──────────────────────────────────────────────────────────
router.get(
  "/organizations/:orgId/controls/:controlId/tasks/:taskId",
  requireAuth,
  requireOrg,
  async (req, res): Promise<void> => {
    const { orgId, controlId, taskId } = req.params as Record<string, string>;
    if (req.orgId !== orgId && req.authUser?.role !== "admin") {
      res.status(403).json({ error: "Access denied" }); return;
    }

    const task = await loadScopedTask(orgId, controlId, taskId);
    if (!task) { res.status(404).json({ error: "Task not found" }); return; }

    const [controlRow] = await db
      .select({ id: controlsTable.id, controlId: controlsTable.controlId, title: controlsTable.title, level: controlsTable.level })
      .from(controlsTable)
      .where(eq(controlsTable.id, controlId))
      .limit(1);

    const [org] = await db
      .select({ name: organizationsTable.name })
      .from(organizationsTable)
      .where(eq(organizationsTable.id, orgId))
      .limit(1);

    await logAudit(req, "viewed", "task", taskId, { entityLabel: task.taskNumber ?? taskId });
    res.json({ ...task, control: controlRow ?? null, organizationName: org?.name ?? null });
  }
);

// ─── PATCH edit task ──────────────────────────────────────────────────────────
router.patch(
  "/organizations/:orgId/controls/:controlId/tasks/:taskId",
  requireAuth,
  requireOrg,
  async (req, res): Promise<void> => {
    const { orgId, controlId, taskId } = req.params as Record<string, string>;
    if (req.orgId !== orgId && req.authUser?.role !== "admin") {
      res.status(403).json({ error: "Access denied" }); return;
    }
    if (!canDo(req, "tasks.edit")) {
      res.status(403).json({ error: "You do not have permission to edit tasks." }); return;
    }

    const existing = await loadScopedTask(orgId, controlId, taskId);
    if (!existing) { res.status(404).json({ error: "Task not found" }); return; }

    const { title, description, priority, dueDate, startDate, assigneeId, expectedVersion } = req.body;

    // Concurrency check
    if (expectedVersion) {
      const expectedDate = new Date(expectedVersion);
      const actualDate = new Date(existing.updatedAt);
      if (Math.abs(expectedDate.getTime() - actualDate.getTime()) > 1000) {
        res.status(409).json({
          error: "This task was updated by another user. Reload the latest task before saving.",
          code: "CONCURRENT_MODIFICATION",
        });
        return;
      }
    }

    if (assigneeId) {
      const m = await validateAssignee(assigneeId, orgId);
      if (!m) { res.status(400).json({ error: "The selected user does not have active access to this organization." }); return; }
    }

    const now = new Date();
    const updates: Partial<typeof tasksTable.$inferInsert> = {
      updatedAt: now,
      updatedByUserId: req.authUser!.id,
    };
    const activityEntries: Array<{ field: string; prev: string | null; next: string | null }> = [];

    if (title !== undefined && title.trim() !== existing.title) {
      updates.title = title.trim();
      activityEntries.push({ field: "title", prev: existing.title, next: title.trim() });
    }
    if (description !== undefined && description !== existing.description) {
      updates.description = description;
      activityEntries.push({ field: "description", prev: existing.description, next: description });
    }
    if (priority !== undefined && priority !== existing.priority) {
      updates.priority = priority;
      activityEntries.push({ field: "priority", prev: existing.priority, next: priority });
    }
    if (dueDate !== undefined) {
      updates.dueDate = dueDate ? new Date(dueDate) : null;
      activityEntries.push({
        field: "due_date",
        prev: existing.dueDate ? new Date(existing.dueDate).toLocaleDateString() : null,
        next: dueDate ? new Date(dueDate).toLocaleDateString() : null,
      });
    }
    if (startDate !== undefined) {
      updates.startDate = startDate ? new Date(startDate) : null;
    }
    if (assigneeId !== undefined) {
      updates.assigneeId = assigneeId || null;
      activityEntries.push({ field: "assignee", prev: existing.assigneeName, next: null });
    }

    await db.transaction(async (tx) => {
      await tx.update(tasksTable).set(updates).where(eq(tasksTable.id, taskId));

      for (const entry of activityEntries) {
        let nextVal = entry.next;
        if (entry.field === "assignee" && assigneeId) {
          const [u] = await tx.select({ name: usersTable.name }).from(usersTable).where(eq(usersTable.id, assigneeId)).limit(1);
          nextVal = u?.name ?? null;
        }
        await recordActivity(tx, taskId, orgId, req.authUser!.id, req.authUser!.name ?? null, "edited", {
          field: entry.field,
          previousValue: entry.prev,
          newValue: nextVal,
        });
      }
    });

    await logAudit(req, "updated", "task", taskId, { entityLabel: existing.taskNumber ?? taskId });
    const updated = await loadScopedTask(orgId, controlId, taskId);
    res.json(updated);
  }
);

// ─── POST start ───────────────────────────────────────────────────────────────
router.post(
  "/organizations/:orgId/controls/:controlId/tasks/:taskId/start",
  requireAuth, requireOrg,
  async (req, res): Promise<void> => {
    const { orgId, controlId, taskId } = req.params as Record<string, string>;
    if (req.orgId !== orgId && req.authUser?.role !== "admin") { res.status(403).json({ error: "Access denied" }); return; }
    if (!canDo(req, "tasks.start")) { res.status(403).json({ error: "You do not have permission to start tasks." }); return; }
    const existing = await loadScopedTask(orgId, controlId, taskId);
    if (!existing) { res.status(404).json({ error: "Task not found" }); return; }
    if (existing.status !== "open") { res.status(409).json({ error: `Cannot start a task with status "${existing.status}". Task must be Open.` }); return; }

    const now = new Date();
    await db.transaction(async (tx) => {
      await tx.update(tasksTable).set({
        status: "in_progress",
        startDate: existing.startDate ?? now,
        updatedAt: now,
        updatedByUserId: req.authUser!.id,
      }).where(eq(tasksTable.id, taskId));
      await recordActivity(tx, taskId, orgId, req.authUser!.id, req.authUser!.name ?? null, "started", { previousValue: "open", newValue: "in_progress" });
    });
    await logAudit(req, "task_started", "task", taskId, { entityLabel: existing.taskNumber ?? taskId });
    res.json(await loadScopedTask(orgId, controlId, taskId));
  }
);

// ─── POST block ───────────────────────────────────────────────────────────────
router.post(
  "/organizations/:orgId/controls/:controlId/tasks/:taskId/block",
  requireAuth, requireOrg,
  async (req, res): Promise<void> => {
    const { orgId, controlId, taskId } = req.params as Record<string, string>;
    if (req.orgId !== orgId && req.authUser?.role !== "admin") { res.status(403).json({ error: "Access denied" }); return; }
    if (!canDo(req, "tasks.block")) { res.status(403).json({ error: "You do not have permission to block tasks." }); return; }
    const existing = await loadScopedTask(orgId, controlId, taskId);
    if (!existing) { res.status(404).json({ error: "Task not found" }); return; }
    if (!["open", "in_progress"].includes(existing.status)) { res.status(409).json({ error: `Cannot block a task with status "${existing.status}".` }); return; }
    const { blockedReason } = req.body;
    if (!blockedReason?.trim()) { res.status(400).json({ error: "Blocked reason is required." }); return; }

    const now = new Date();
    await db.transaction(async (tx) => {
      await tx.update(tasksTable).set({
        status: "blocked",
        blockedReason: blockedReason.trim(),
        blockedByUserId: req.authUser!.id,
        blockedAt: now,
        updatedAt: now,
        updatedByUserId: req.authUser!.id,
      }).where(eq(tasksTable.id, taskId));
      await recordActivity(tx, taskId, orgId, req.authUser!.id, req.authUser!.name ?? null, "blocked", {
        previousValue: existing.status, newValue: "blocked", note: blockedReason.trim(),
      });
    });
    await logAudit(req, "task_blocked", "task", taskId, { entityLabel: existing.taskNumber ?? taskId, previousValue: existing.status, newValue: blockedReason });
    res.json(await loadScopedTask(orgId, controlId, taskId));
  }
);

// ─── POST resume ──────────────────────────────────────────────────────────────
router.post(
  "/organizations/:orgId/controls/:controlId/tasks/:taskId/resume",
  requireAuth, requireOrg,
  async (req, res): Promise<void> => {
    const { orgId, controlId, taskId } = req.params as Record<string, string>;
    if (req.orgId !== orgId && req.authUser?.role !== "admin") { res.status(403).json({ error: "Access denied" }); return; }
    if (!canDo(req, "tasks.start")) { res.status(403).json({ error: "You do not have permission to resume tasks." }); return; }
    const existing = await loadScopedTask(orgId, controlId, taskId);
    if (!existing) { res.status(404).json({ error: "Task not found" }); return; }
    if (existing.status !== "blocked") { res.status(409).json({ error: "Task is not blocked." }); return; }
    const { resolutionNote } = req.body;
    const now = new Date();
    await db.transaction(async (tx) => {
      await tx.update(tasksTable).set({ status: "in_progress", updatedAt: now, updatedByUserId: req.authUser!.id }).where(eq(tasksTable.id, taskId));
      await recordActivity(tx, taskId, orgId, req.authUser!.id, req.authUser!.name ?? null, "resumed", {
        previousValue: "blocked", newValue: "in_progress", note: resolutionNote?.trim() ?? null,
      });
    });
    await logAudit(req, "task_resumed", "task", taskId, { entityLabel: existing.taskNumber ?? taskId });
    res.json(await loadScopedTask(orgId, controlId, taskId));
  }
);

// ─── POST close ───────────────────────────────────────────────────────────────
router.post(
  "/organizations/:orgId/controls/:controlId/tasks/:taskId/close",
  requireAuth, requireOrg,
  async (req, res): Promise<void> => {
    const { orgId, controlId, taskId } = req.params as Record<string, string>;
    if (req.orgId !== orgId && req.authUser?.role !== "admin") { res.status(403).json({ error: "Access denied" }); return; }
    if (!canDo(req, "tasks.close")) { res.status(403).json({ error: "You do not have permission to close tasks." }); return; }
    const existing = await loadScopedTask(orgId, controlId, taskId);
    if (!existing) { res.status(404).json({ error: "Task not found" }); return; }
    if (["closed", "cancelled"].includes(existing.status)) { res.status(409).json({ error: `Task is already ${existing.status}.` }); return; }
    const { closureSummary, closedDate } = req.body;
    if (!closureSummary?.trim()) { res.status(400).json({ error: "Closure summary is required." }); return; }

    const now = new Date();
    const closedAt = closedDate ? new Date(closedDate) : now;
    await db.transaction(async (tx) => {
      await tx.update(tasksTable).set({
        status: "closed",
        closureSummary: closureSummary.trim(),
        closedDate: closedAt,
        closedByUserId: req.authUser!.id,
        updatedAt: now,
        updatedByUserId: req.authUser!.id,
      }).where(eq(tasksTable.id, taskId));
      await recordActivity(tx, taskId, orgId, req.authUser!.id, req.authUser!.name ?? null, "closed", {
        previousValue: existing.status, newValue: "closed", note: closureSummary.trim(),
      });
    });
    await logAudit(req, "task_closed", "task", taskId, { entityLabel: existing.taskNumber ?? taskId, previousValue: existing.status, newValue: "closed" });
    res.json(await loadScopedTask(orgId, controlId, taskId));
  }
);

// ─── POST reopen ──────────────────────────────────────────────────────────────
router.post(
  "/organizations/:orgId/controls/:controlId/tasks/:taskId/reopen",
  requireAuth, requireOrg,
  async (req, res): Promise<void> => {
    const { orgId, controlId, taskId } = req.params as Record<string, string>;
    if (req.orgId !== orgId && req.authUser?.role !== "admin") { res.status(403).json({ error: "Access denied" }); return; }
    if (!canDo(req, "tasks.reopen")) { res.status(403).json({ error: "You do not have permission to reopen tasks." }); return; }
    const existing = await loadScopedTask(orgId, controlId, taskId);
    if (!existing) { res.status(404).json({ error: "Task not found" }); return; }
    if (!["closed", "cancelled", "completed"].includes(existing.status)) { res.status(409).json({ error: "Only closed or cancelled tasks can be reopened." }); return; }
    const { reopenReason, newDueDate, newAssigneeId, reopenStatus } = req.body;
    if (!reopenReason?.trim()) { res.status(400).json({ error: "Reopen reason is required." }); return; }

    const targetStatus = reopenStatus === "in_progress" ? "in_progress" : "open";
    const now = new Date();
    await db.transaction(async (tx) => {
      const updateSet: Partial<typeof tasksTable.$inferInsert> = {
        status: targetStatus as any,
        reopenedByUserId: req.authUser!.id,
        reopenedAt: now,
        reopenReason: reopenReason.trim(),
        updatedAt: now,
        updatedByUserId: req.authUser!.id,
      };
      if (newDueDate !== undefined) updateSet.dueDate = newDueDate ? new Date(newDueDate) : null;
      if (newAssigneeId !== undefined) updateSet.assigneeId = newAssigneeId || null;
      await tx.update(tasksTable).set(updateSet).where(eq(tasksTable.id, taskId));
      await recordActivity(tx, taskId, orgId, req.authUser!.id, req.authUser!.name ?? null, "reopened", {
        previousValue: existing.status, newValue: targetStatus, note: reopenReason.trim(),
      });
    });
    await logAudit(req, "task_reopened", "task", taskId, { entityLabel: existing.taskNumber ?? taskId, previousValue: existing.status, newValue: targetStatus });
    res.json(await loadScopedTask(orgId, controlId, taskId));
  }
);

// ─── POST cancel ──────────────────────────────────────────────────────────────
router.post(
  "/organizations/:orgId/controls/:controlId/tasks/:taskId/cancel",
  requireAuth, requireOrg,
  async (req, res): Promise<void> => {
    const { orgId, controlId, taskId } = req.params as Record<string, string>;
    if (req.orgId !== orgId && req.authUser?.role !== "admin") { res.status(403).json({ error: "Access denied" }); return; }
    if (!canDo(req, "tasks.cancel")) { res.status(403).json({ error: "You do not have permission to cancel tasks." }); return; }
    const existing = await loadScopedTask(orgId, controlId, taskId);
    if (!existing) { res.status(404).json({ error: "Task not found" }); return; }
    if (existing.status === "cancelled") { res.status(409).json({ error: "Task is already cancelled." }); return; }
    const { cancellationReason } = req.body;
    if (!cancellationReason?.trim()) { res.status(400).json({ error: "Cancellation reason is required." }); return; }

    const now = new Date();
    await db.transaction(async (tx) => {
      await tx.update(tasksTable).set({
        status: "cancelled",
        cancellationReason: cancellationReason.trim(),
        cancelledByUserId: req.authUser!.id,
        cancelledAt: now,
        updatedAt: now,
        updatedByUserId: req.authUser!.id,
      }).where(eq(tasksTable.id, taskId));
      await recordActivity(tx, taskId, orgId, req.authUser!.id, req.authUser!.name ?? null, "cancelled", {
        previousValue: existing.status, newValue: "cancelled", note: cancellationReason.trim(),
      });
    });
    await logAudit(req, "task_cancelled", "task", taskId, { entityLabel: existing.taskNumber ?? taskId, previousValue: existing.status, newValue: "cancelled" });
    res.json(await loadScopedTask(orgId, controlId, taskId));
  }
);

// ─── GET activity ─────────────────────────────────────────────────────────────
router.get(
  "/organizations/:orgId/controls/:controlId/tasks/:taskId/activity",
  requireAuth, requireOrg,
  async (req, res): Promise<void> => {
    const { orgId, controlId, taskId } = req.params as Record<string, string>;
    if (req.orgId !== orgId && req.authUser?.role !== "admin") { res.status(403).json({ error: "Access denied" }); return; }
    const existing = await loadScopedTask(orgId, controlId, taskId);
    if (!existing) { res.status(404).json({ error: "Task not found" }); return; }

    const activities = await db
      .select({
        id: taskActivitiesTable.id,
        action: taskActivitiesTable.action,
        field: taskActivitiesTable.field,
        previousValue: taskActivitiesTable.previousValue,
        newValue: taskActivitiesTable.newValue,
        note: taskActivitiesTable.note,
        actingUserId: taskActivitiesTable.actingUserId,
        actingUserName: taskActivitiesTable.actingUserName,
        createdAt: taskActivitiesTable.createdAt,
      })
      .from(taskActivitiesTable)
      .where(eq(taskActivitiesTable.taskId, taskId))
      .orderBy(desc(taskActivitiesTable.createdAt));

    res.json(activities);
  }
);

export default router;
