import { Router } from "express";
import bcrypt from 'bcryptjs';
import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireAuth, requireRole } from "../lib/auth";
import { logAudit } from "../lib/audit";
import { randomUUID } from "crypto";

const router = Router();
const SALT_ROUNDS = 12;

router.get("/users", requireAuth, async (req, res) => {
  const users = await db
    .select({
      id: usersTable.id,
      name: usersTable.name,
      email: usersTable.email,
      role: usersTable.role,
      title: usersTable.title,
      department: usersTable.department,
      isActive: usersTable.isActive,
      lastLoginAt: usersTable.lastLoginAt,
      createdAt: usersTable.createdAt,
    })
    .from(usersTable)
    .orderBy(usersTable.name);

  res.json(users);
});

router.post(
  "/users",
  requireAuth,
  requireRole("admin"),
  async (req, res) => {
    const { name, email, password, role, title, department } = req.body;
    if (!name || !email || !password) {
      res.status(400).json({ error: "name, email, password required" });
      return;
    }

    const existing = await db
      .select({ id: usersTable.id })
      .from(usersTable)
      .where(eq(usersTable.email, email.toLowerCase()))
      .limit(1);

    if (existing.length > 0) {
      res.status(409).json({ error: "Email already in use" });
      return;
    }

    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
    const id = randomUUID();

    await db.insert(usersTable).values({
      id,
      name,
      email: email.toLowerCase(),
      passwordHash,
      role: role ?? "it_contributor",
      title,
      department,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    await logAudit(req, "created", "user", id, { entityLabel: email });

    const [created] = await db
      .select({
        id: usersTable.id,
        name: usersTable.name,
        email: usersTable.email,
        role: usersTable.role,
        title: usersTable.title,
        department: usersTable.department,
        isActive: usersTable.isActive,
        createdAt: usersTable.createdAt,
      })
      .from(usersTable)
      .where(eq(usersTable.id, id))
      .limit(1);

    res.status(201).json(created);
  }
);

router.get("/users/:id", requireAuth, async (req, res) => {
  const [user] = await db
    .select({
      id: usersTable.id,
      name: usersTable.name,
      email: usersTable.email,
      role: usersTable.role,
      title: usersTable.title,
      department: usersTable.department,
      isActive: usersTable.isActive,
      lastLoginAt: usersTable.lastLoginAt,
      createdAt: usersTable.createdAt,
      updatedAt: usersTable.updatedAt,
    })
    .from(usersTable)
    .where(eq(usersTable.id, req.params.id))
    .limit(1);

  if (!user) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  res.json(user);
});

router.patch("/users/:id", requireAuth, requireRole("admin"), async (req, res) => {
  const { name, role, title, department, isActive } = req.body;
  const [existing] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.id, req.params.id))
    .limit(1);

  if (!existing) {
    res.status(404).json({ error: "Not found" });
    return;
  }

  await db
    .update(usersTable)
    .set({
      name: name ?? existing.name,
      role: role ?? existing.role,
      title: title !== undefined ? title : existing.title,
      department: department !== undefined ? department : existing.department,
      isActive: isActive !== undefined ? isActive : existing.isActive,
      updatedAt: new Date(),
    })
    .where(eq(usersTable.id, req.params.id));

  await logAudit(req, "updated", "user", req.params.id, {
    entityLabel: existing.email,
  });

  const [updated] = await db
    .select({
      id: usersTable.id,
      name: usersTable.name,
      email: usersTable.email,
      role: usersTable.role,
      title: usersTable.title,
      department: usersTable.department,
      isActive: usersTable.isActive,
      updatedAt: usersTable.updatedAt,
    })
    .from(usersTable)
    .where(eq(usersTable.id, req.params.id))
    .limit(1);

  res.json(updated);
});

export default router;
