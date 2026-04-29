import { Router } from "express";
import {
  db,
  tasksTable,
  taskControlLinksTable,
  usersTable,
  controlsTable,
} from "@workspace/db";
import { eq, and, desc, or, inArray, lte } from "drizzle-orm";
import { requireAuth } from "../lib/auth";
import { requireOrg } from "../middleware/org";
import { logAudit } from "../lib/audit";
import { randomUUID } from "crypto";

const router = Router();

router.get("/tasks", requireAuth, requireOrg, async (req, res) => {
  const { status, assigneeId, controlId, priority, dueBefore } =
    req.query as Record<string, string>;
  const orgId = req.orgId;

  let taskIds: string[] | undefined;

  if (controlId) {
    const links = await db
      .select({ taskId: taskControlLinksTable.taskId })
      .from(taskControlLinksTable)
      .where(eq(taskControlLinksTable.controlId, controlId));
    taskIds = links.map((l) => l.taskId);
    if (taskIds.length === 0) { res.json([]); return; }
  }

  const tasks = await db
    .select({
      id: tasksTable.id,
      title: tasksTable.title,
      description: tasksTable.description,
      status: tasksTable.status,
      priority: tasksTable.priority,
      taskType: tasksTable.taskType,
      dueDate: tasksTable.dueDate,
      completedAt: tasksTable.completedAt,
      isRecurring: tasksTable.isRecurring,
      recurrence: tasksTable.recurrence,
      tags: tasksTable.tags,
      assigneeId: tasksTable.assigneeId,
      assigneeName: usersTable.name,
      createdById: tasksTable.createdById,
      createdAt: tasksTable.createdAt,
      updatedAt: tasksTable.updatedAt,
    })
    .from(tasksTable)
    .leftJoin(usersTable, eq(usersTable.id, tasksTable.assigneeId))
    .where(
      and(
        orgId ? eq(tasksTable.organizationId, orgId) : undefined,
        status ? eq(tasksTable.status, status as any) : undefined,
        assigneeId ? eq(tasksTable.assigneeId, assigneeId) : undefined,
        priority ? eq(tasksTable.priority, priority as any) : undefined,
        dueBefore ? lte(tasksTable.dueDate, new Date(dueBefore)) : undefined,
        taskIds ? inArray(tasksTable.id, taskIds) : undefined
      )
    )
    .orderBy(desc(tasksTable.createdAt));

  res.json(tasks);
});

router.post("/tasks", requireAuth, requireOrg, async (req, res) => {
  const { title, description, priority, taskType, dueDate, assigneeId, controlIds, tags, isRecurring, recurrence } = req.body;

  if (!title) { res.status(400).json({ error: "title required" }); return; }

  const id = randomUUID();
  await db.insert(tasksTable).values({
    id,
    organizationId: req.orgId ?? null,
    title,
    description,
    status: "open",
    priority: priority ?? "medium",
    taskType: taskType ?? "general",
    dueDate: dueDate ? new Date(dueDate) : undefined,
    assigneeId,
    createdById: req.authUser!.id,
    tags: tags ?? [],
    isRecurring: isRecurring ?? false,
    recurrence,
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  if (Array.isArray(controlIds) && controlIds.length > 0) {
    await db.insert(taskControlLinksTable).values(
      controlIds.map((cid: string) => ({
        id: randomUUID(),
        taskId: id,
        controlId: cid,
        linkedAt: new Date(),
      }))
    );
  }

  await logAudit(req, "created", "task", id, { entityLabel: title });

  const [created] = await db.select().from(tasksTable).where(eq(tasksTable.id, id)).limit(1);
  res.status(201).json(created);
});

router.get("/tasks/:id", requireAuth, requireOrg, async (req, res) => {
  const orgId = req.orgId;

  const [task] = await db
    .select({
      id: tasksTable.id,
      title: tasksTable.title,
      description: tasksTable.description,
      status: tasksTable.status,
      priority: tasksTable.priority,
      taskType: tasksTable.taskType,
      dueDate: tasksTable.dueDate,
      completedAt: tasksTable.completedAt,
      completionNotes: tasksTable.completionNotes,
      isRecurring: tasksTable.isRecurring,
      recurrence: tasksTable.recurrence,
      tags: tasksTable.tags,
      assigneeId: tasksTable.assigneeId,
      assigneeName: usersTable.name,
      createdById: tasksTable.createdById,
      createdAt: tasksTable.createdAt,
      updatedAt: tasksTable.updatedAt,
    })
    .from(tasksTable)
    .leftJoin(usersTable, eq(usersTable.id, tasksTable.assigneeId))
    .where(
      and(
        eq(tasksTable.id, req.params.id),
        orgId ? eq(tasksTable.organizationId, orgId) : undefined
      )
    )
    .limit(1);

  if (!task) { res.status(404).json({ error: "Not found" }); return; }

  const links = await db
    .select({ controlId: taskControlLinksTable.controlId, label: controlsTable.controlId })
    .from(taskControlLinksTable)
    .innerJoin(controlsTable, eq(controlsTable.id, taskControlLinksTable.controlId))
    .where(eq(taskControlLinksTable.taskId, req.params.id));

  res.json({ ...task, linkedControlIds: links.map((l) => l.controlId) });
});

router.patch("/tasks/:id", requireAuth, requireOrg, async (req, res) => {
  const orgId = req.orgId;

  const [existing] = await db
    .select()
    .from(tasksTable)
    .where(and(eq(tasksTable.id, req.params.id), orgId ? eq(tasksTable.organizationId, orgId) : undefined))
    .limit(1);

  if (!existing) { res.status(404).json({ error: "Not found" }); return; }

  const { title, description, status, priority, dueDate, assigneeId, tags } = req.body;

  await db
    .update(tasksTable)
    .set({
      title: title ?? existing.title,
      description: description !== undefined ? description : existing.description,
      status: status ?? existing.status,
      priority: priority ?? existing.priority,
      dueDate: dueDate !== undefined ? (dueDate ? new Date(dueDate) : null) : existing.dueDate,
      assigneeId: assigneeId !== undefined ? assigneeId : existing.assigneeId,
      tags: tags ?? existing.tags,
      updatedAt: new Date(),
    })
    .where(eq(tasksTable.id, req.params.id));

  await logAudit(req, "updated", "task", req.params.id, { entityLabel: existing.title });

  const [updated] = await db.select().from(tasksTable).where(eq(tasksTable.id, req.params.id)).limit(1);
  res.json(updated);
});

router.post("/tasks/:id/complete", requireAuth, requireOrg, async (req, res) => {
  const { notes } = req.body;
  const orgId = req.orgId;
  const [existing] = await db.select().from(tasksTable).where(and(eq(tasksTable.id, req.params.id), orgId ? eq(tasksTable.organizationId, orgId) : undefined)).limit(1);

  if (!existing) { res.status(404).json({ error: "Not found" }); return; }

  await db.update(tasksTable).set({ status: "completed", completedAt: new Date(), completionNotes: notes, updatedAt: new Date() }).where(eq(tasksTable.id, req.params.id));
  await logAudit(req, "completed", "task", req.params.id, { entityLabel: existing.title });
  res.json({ id: req.params.id, status: "completed" });
});

router.post("/tasks/:id/reopen", requireAuth, requireOrg, async (req, res) => {
  const orgId = req.orgId;
  const [existing] = await db.select().from(tasksTable).where(and(eq(tasksTable.id, req.params.id), orgId ? eq(tasksTable.organizationId, orgId) : undefined)).limit(1);

  if (!existing) { res.status(404).json({ error: "Not found" }); return; }

  await db.update(tasksTable).set({ status: "open", completedAt: null, updatedAt: new Date() }).where(eq(tasksTable.id, req.params.id));
  await logAudit(req, "reopened", "task", req.params.id, { entityLabel: existing.title });
  res.json({ id: req.params.id, status: "open" });
});

export default router;
