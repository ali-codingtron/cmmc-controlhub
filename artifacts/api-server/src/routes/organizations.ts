import { Router } from "express";
import {
  db,
  organizationsTable,
  organizationUsersTable,
  usersTable,
  controlAssessmentsTable,
  evidenceItemsTable,
  tasksTable,
  poamsTable,
  controlsTable,
} from "@workspace/db";
import { eq, and, count, or, desc } from "drizzle-orm";
import { requireAuth } from "../lib/auth";
import { randomUUID } from "crypto";

const router = Router();

function requireAdmin(req: any, res: any, next: any) {
  if (req.authUser?.role !== "admin") {
    res.status(403).json({ error: "Admin access required" });
    return;
  }
  next();
}

router.get("/organizations/my-orgs", requireAuth, async (req, res) => {
  const memberships = await db
    .select({
      id: organizationsTable.id,
      name: organizationsTable.name,
      shortName: organizationsTable.shortName,
      cmmcTargetLevel: organizationsTable.cmmcTargetLevel,
      industry: organizationsTable.industry,
      isActive: organizationsTable.isActive,
      role: organizationUsersTable.role,
      joinedAt: organizationUsersTable.joinedAt,
    })
    .from(organizationUsersTable)
    .innerJoin(organizationsTable, eq(organizationsTable.id, organizationUsersTable.organizationId))
    .where(
      and(
        eq(organizationUsersTable.userId, req.authUser!.id),
        eq(organizationUsersTable.status, "active"),
        eq(organizationsTable.isActive, true)
      )
    )
    .orderBy(organizationsTable.name);

  res.json(memberships);
});

router.get("/organizations", requireAuth, requireAdmin, async (req, res) => {
  const orgs = await db
    .select()
    .from(organizationsTable)
    .orderBy(organizationsTable.name);

  res.json(orgs);
});

router.post("/organizations", requireAuth, requireAdmin, async (req, res) => {
  const {
    name, legalName, shortName, cageCode, uei, industry,
    primaryContact, organizationAddress, assessmentScope,
    cmmcTargetLevel, notes,
  } = req.body;

  if (!name) {
    res.status(400).json({ error: "name is required" });
    return;
  }

  const id = randomUUID();
  await db.insert(organizationsTable).values({
    id,
    name,
    legalName,
    shortName,
    cageCode,
    uei,
    industry,
    primaryContact,
    complianceManagerId: req.authUser!.id,
    organizationAddress,
    assessmentScope,
    cmmcTargetLevel: cmmcTargetLevel ?? "L2",
    notes,
    isActive: true,
  });

  await db.insert(organizationUsersTable).values({
    id: randomUUID(),
    organizationId: id,
    userId: req.authUser!.id,
    role: "global_admin",
    status: "active",
    joinedAt: new Date(),
  });

  const [created] = await db.select().from(organizationsTable).where(eq(organizationsTable.id, id)).limit(1);
  res.status(201).json(created);
});

router.get("/organizations/global-stats", requireAuth, requireAdmin, async (req, res) => {
  const orgs = await db
    .select({ id: organizationsTable.id, name: organizationsTable.name, shortName: organizationsTable.shortName, cmmcTargetLevel: organizationsTable.cmmcTargetLevel })
    .from(organizationsTable)
    .where(eq(organizationsTable.isActive, true))
    .orderBy(organizationsTable.name);

  const totalControls = await db
    .select({ total: count() })
    .from(controlsTable)
    .where(eq(controlsTable.isActive, true));

  const orgStats = await Promise.all(
    orgs.map(async (org) => {
      const [assessedControls] = await db
        .select({ cnt: count() })
        .from(controlAssessmentsTable)
        .where(
          and(
            eq(controlAssessmentsTable.organizationId, org.id),
            or(
              eq(controlAssessmentsTable.status, "implemented"),
              eq(controlAssessmentsTable.status, "assessor_ready")
            )
          )
        );

      const [totalAssessments] = await db
        .select({ cnt: count() })
        .from(controlAssessmentsTable)
        .where(eq(controlAssessmentsTable.organizationId, org.id));

      const [openPoams] = await db
        .select({ cnt: count() })
        .from(poamsTable)
        .where(
          and(
            eq(poamsTable.organizationId, org.id),
            or(eq(poamsTable.status, "open"), eq(poamsTable.status, "in_progress"))
          )
        );

      const [openTasks] = await db
        .select({ cnt: count() })
        .from(tasksTable)
        .where(
          and(
            eq(tasksTable.organizationId, org.id),
            or(eq(tasksTable.status, "open"), eq(tasksTable.status, "in_progress"), eq(tasksTable.status, "overdue"))
          )
        );

      const [evidenceCount] = await db
        .select({ cnt: count() })
        .from(evidenceItemsTable)
        .where(eq(evidenceItemsTable.organizationId, org.id));

      const totalC = Number(totalControls[0]?.total ?? 0);
      const implemented = Number(assessedControls?.cnt ?? 0);
      const readinessPercent = totalC > 0 ? Math.round((implemented / totalC) * 100) : 0;

      return {
        ...org,
        readinessPercent,
        implementedControls: implemented,
        totalControls: totalC,
        openPoams: Number(openPoams?.cnt ?? 0),
        openTasks: Number(openTasks?.cnt ?? 0),
        evidenceCount: Number(evidenceCount?.cnt ?? 0),
      };
    })
  );

  res.json(orgStats);
});

router.get("/organizations/:id", requireAuth, async (req, res) => {
  const [org] = await db
    .select()
    .from(organizationsTable)
    .where(eq(organizationsTable.id, req.params.id))
    .limit(1);

  if (!org) {
    res.status(404).json({ error: "Not found" });
    return;
  }

  if (req.authUser?.role !== "admin") {
    const [membership] = await db
      .select({ id: organizationUsersTable.id })
      .from(organizationUsersTable)
      .where(
        and(
          eq(organizationUsersTable.organizationId, req.params.id),
          eq(organizationUsersTable.userId, req.authUser!.id),
          eq(organizationUsersTable.status, "active")
        )
      )
      .limit(1);

    if (!membership) {
      res.status(403).json({ error: "Access denied" });
      return;
    }
  }

  res.json(org);
});

router.patch("/organizations/:id", requireAuth, requireAdmin, async (req, res) => {
  const [existing] = await db
    .select()
    .from(organizationsTable)
    .where(eq(organizationsTable.id, req.params.id))
    .limit(1);

  if (!existing) {
    res.status(404).json({ error: "Not found" });
    return;
  }

  const {
    name, legalName, shortName, cageCode, uei, industry,
    primaryContact, organizationAddress, assessmentScope,
    cmmcTargetLevel, notes, isActive,
  } = req.body;

  await db
    .update(organizationsTable)
    .set({
      name: name ?? existing.name,
      legalName: legalName !== undefined ? legalName : existing.legalName,
      shortName: shortName !== undefined ? shortName : existing.shortName,
      cageCode: cageCode !== undefined ? cageCode : existing.cageCode,
      uei: uei !== undefined ? uei : existing.uei,
      industry: industry !== undefined ? industry : existing.industry,
      primaryContact: primaryContact !== undefined ? primaryContact : existing.primaryContact,
      organizationAddress: organizationAddress !== undefined ? organizationAddress : existing.organizationAddress,
      assessmentScope: assessmentScope !== undefined ? assessmentScope : existing.assessmentScope,
      cmmcTargetLevel: cmmcTargetLevel ?? existing.cmmcTargetLevel,
      notes: notes !== undefined ? notes : existing.notes,
      isActive: isActive !== undefined ? isActive : existing.isActive,
      updatedAt: new Date(),
    })
    .where(eq(organizationsTable.id, req.params.id));

  const [updated] = await db.select().from(organizationsTable).where(eq(organizationsTable.id, req.params.id)).limit(1);
  res.json(updated);
});

router.get("/organizations/:id/users", requireAuth, async (req, res) => {
  if (req.authUser?.role !== "admin") {
    const [membership] = await db
      .select({ id: organizationUsersTable.id })
      .from(organizationUsersTable)
      .where(
        and(
          eq(organizationUsersTable.organizationId, req.params.id),
          eq(organizationUsersTable.userId, req.authUser!.id),
          eq(organizationUsersTable.status, "active")
        )
      )
      .limit(1);
    if (!membership) {
      res.status(403).json({ error: "Access denied" });
      return;
    }
  }

  const members = await db
    .select({
      membershipId: organizationUsersTable.id,
      userId: usersTable.id,
      name: usersTable.name,
      email: usersTable.email,
      title: usersTable.title,
      department: usersTable.department,
      role: organizationUsersTable.role,
      status: organizationUsersTable.status,
      joinedAt: organizationUsersTable.joinedAt,
    })
    .from(organizationUsersTable)
    .innerJoin(usersTable, eq(usersTable.id, organizationUsersTable.userId))
    .where(eq(organizationUsersTable.organizationId, req.params.id))
    .orderBy(organizationUsersTable.role, usersTable.name);

  res.json(members);
});

router.post("/organizations/:id/users", requireAuth, requireAdmin, async (req, res) => {
  const { userId, role } = req.body;

  if (!userId || !role) {
    res.status(400).json({ error: "userId and role are required" });
    return;
  }

  const existing = await db
    .select({ id: organizationUsersTable.id })
    .from(organizationUsersTable)
    .where(
      and(
        eq(organizationUsersTable.organizationId, req.params.id),
        eq(organizationUsersTable.userId, userId)
      )
    )
    .limit(1);

  if (existing.length > 0) {
    await db
      .update(organizationUsersTable)
      .set({ role, status: "active", joinedAt: new Date() })
      .where(eq(organizationUsersTable.id, existing[0].id));
  } else {
    await db.insert(organizationUsersTable).values({
      id: randomUUID(),
      organizationId: req.params.id,
      userId,
      role,
      status: "active",
      joinedAt: new Date(),
    });
  }

  res.json({ organizationId: req.params.id, userId, role });
});

router.delete("/organizations/:id/users/:userId", requireAuth, requireAdmin, async (req, res) => {
  await db
    .update(organizationUsersTable)
    .set({ status: "inactive" })
    .where(
      and(
        eq(organizationUsersTable.organizationId, req.params.id),
        eq(organizationUsersTable.userId, req.params.userId)
      )
    );

  res.json({ success: true });
});

export default router;
