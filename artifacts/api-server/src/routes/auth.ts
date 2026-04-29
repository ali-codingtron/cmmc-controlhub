import { Router } from "express";
import bcrypt from 'bcryptjs';
import { db, usersTable, auditLogsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { signToken, requireAuth } from "../lib/auth";
import { randomUUID } from "crypto";

const router = Router();

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

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) {
    res.status(401).json({ error: "Invalid credentials" });
    return;
  }

  await db
    .update(usersTable)
    .set({ lastLoginAt: new Date() })
    .where(eq(usersTable.id, user.id));

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
    timestamp: new Date(),
  });

  const token = signToken({
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
  });

  res.json({ token, user: { id: user.id, name: user.name, email: user.email, role: user.role } });
});

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

  const valid = await bcrypt.compare(currentPassword, user.passwordHash);
  if (!valid) {
    res.status(400).json({ error: "Current password is incorrect" });
    return;
  }

  const hash = await bcrypt.hash(newPassword, 10);
  await db
    .update(usersTable)
    .set({ passwordHash: hash, updatedAt: new Date() })
    .where(eq(usersTable.id, user.id));

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

  await db
    .update(usersTable)
    .set({
      name: name ?? undefined,
      title: title !== undefined ? title : undefined,
      department: department !== undefined ? department : undefined,
      updatedAt: new Date(),
    })
    .where(eq(usersTable.id, req.authUser!.id));

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

export default router;
