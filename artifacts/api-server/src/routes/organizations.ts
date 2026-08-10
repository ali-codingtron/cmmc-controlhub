import { Router } from "express";
import {
  db,
  organizationsTable,
  organizationUsersTable,
  organizationFeaturesTable,
  usersTable,
  controlAssessmentsTable,
  evidenceItemsTable,
  tasksTable,
  poamsTable,
  controlsTable,
} from "@workspace/db";
import { eq, and, count, or, desc, sql, inArray } from "drizzle-orm";
import { requireAuth } from "../lib/auth";
import { logAudit } from "../lib/audit";
import { ASSIGNABLE_ORG_ROLES, isAssignableOrgRole } from "../lib/access-control";
import { randomUUID } from "crypto";

const SUPPORTED_FEATURE_KEYS = ["IMPLEMENTATION_ROADMAP", "PRE_ASSESSMENT", "FRAMEWORK_CROSSWALK"] as const;
type FeatureKey = typeof SUPPORTED_FEATURE_KEYS[number];

const router = Router();

function requireAdmin(req: any, res: any, next: any) {
  if (req.authUser?.role !== "admin") {
    res.status(403).json({ error: "Admin access required" });
    return;
  }
  next();
}

router.get("/organizations/my-orgs", requireAuth, async (req, res) => {
  res.setHeader("Cache-Control", "no-store");

  const memberships = await db
    .select({
      id: organizationsTable.id,
      name: organizationsTable.name,
      shortName: organizationsTable.shortName,
      cmmcTargetLevel: organizationsTable.cmmcTargetLevel,
      industry: organizationsTable.industry,
      isActive: organizationsTable.isActive,
      isTestOrganization: organizationsTable.isTestOrganization,
      certificationModuleState: organizationsTable.certificationModuleState,
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

  // The creator becomes Organization Admin of the new org. "global_admin" is a
  // PLATFORM role and must never be written into organization_users.role — doing so
  // mixes the two role scopes and makes membership rows look like platform grants.
  await db.insert(organizationUsersTable).values({
    id: randomUUID(),
    organizationId: id,
    userId: req.authUser!.id,
    role: "org_admin",
    status: "active",
    joinedAt: new Date(),
  });

  const [created] = await db.select().from(organizationsTable).where(eq(organizationsTable.id, id)).limit(1);
  res.status(201).json(created);
});

router.get("/organizations/global-stats", requireAuth, requireAdmin, async (req, res) => {
  const orgs = await db
    .select({ id: organizationsTable.id, name: organizationsTable.name, shortName: organizationsTable.shortName, cmmcTargetLevel: organizationsTable.cmmcTargetLevel, isTestOrganization: organizationsTable.isTestOrganization })
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
    .where(eq(organizationsTable.id, req.params.id as string))
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
          eq(organizationUsersTable.organizationId, req.params.id as string),
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
  const orgId = req.params.id as string;

  const [existing] = await db
    .select()
    .from(organizationsTable)
    .where(eq(organizationsTable.id, orgId))
    .limit(1);

  if (!existing) {
    res.status(404).json({ error: "Not found" });
    return;
  }

  const {
    name, legalName, shortName, cageCode, uei, industry,
    primaryContact, organizationAddress, assessmentScope,
    cmmcTargetLevel, notes, isActive,
    systemName, systemOwner, securityOfficer, itAdministrator,
    defaultClassification, documentNumberPrefix,
  } = req.body;

  // Track changed fields for audit log
  const ORG_KEYS = [
    "name", "legalName", "shortName", "cageCode", "uei", "industry",
    "primaryContact", "organizationAddress", "assessmentScope", "cmmcTargetLevel",
    "notes", "isActive", "systemName", "systemOwner", "securityOfficer",
    "itAdministrator", "defaultClassification", "documentNumberPrefix",
  ] as const;
  const previousValue: Record<string, unknown> = {};
  const newValue: Record<string, unknown> = {};
  for (const key of ORG_KEYS) {
    if (req.body[key] !== undefined && req.body[key] !== (existing as any)[key]) {
      previousValue[key] = (existing as any)[key];
      newValue[key] = req.body[key];
    }
  }

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
      systemName: systemName !== undefined ? systemName : existing.systemName,
      systemOwner: systemOwner !== undefined ? systemOwner : existing.systemOwner,
      securityOfficer: securityOfficer !== undefined ? securityOfficer : existing.securityOfficer,
      itAdministrator: itAdministrator !== undefined ? itAdministrator : existing.itAdministrator,
      defaultClassification: defaultClassification !== undefined ? defaultClassification : existing.defaultClassification,
      documentNumberPrefix: documentNumberPrefix !== undefined ? documentNumberPrefix : existing.documentNumberPrefix,
      updatedAt: new Date(),
    })
    .where(eq(organizationsTable.id, orgId));

  await logAudit(req, "org_profile_updated", "organization", orgId, {
    entityLabel: existing.name,
    previousValue: Object.keys(previousValue).length > 0 ? previousValue : undefined,
    newValue: {
      fieldsChanged: Object.keys(newValue),
      ...newValue,
    },
  });

  const [updated] = await db.select().from(organizationsTable).where(eq(organizationsTable.id, orgId)).limit(1);
  res.json(updated);
});

// PATCH /api/organizations/:id/profile — Global Admins and org_admins of that org.
router.patch("/organizations/:id/profile", requireAuth, async (req: any, res: any): Promise<void> => {
  const orgId = req.params.id as string;

  const [existing] = await db
    .select()
    .from(organizationsTable)
    .where(eq(organizationsTable.id, orgId))
    .limit(1);

  if (!existing) {
    res.status(404).json({ error: "Not found" });
    return;
  }

  // Authorization: platform Global Admin OR org_admin member of this specific org.
  const isGlobalAdmin = req.authUser?.role === "admin";
  let isOrgAdmin = false;
  if (!isGlobalAdmin) {
    const [membership] = await db
      .select({ role: organizationUsersTable.role })
      .from(organizationUsersTable)
      .where(
        and(
          eq(organizationUsersTable.userId, req.authUser!.id),
          eq(organizationUsersTable.organizationId, orgId),
        ),
      )
      .limit(1);
    isOrgAdmin = membership?.role === "org_admin";
  }

  if (!isGlobalAdmin && !isOrgAdmin) {
    await logAudit(req, "org_profile_edit_denied", "organization", orgId, {
      entityLabel: existing.name,
      newValue: {
        attemptedAction: "PATCH /organizations/:id/profile",
        platformRole: req.authUser?.role ?? "none",
        result: "denied",
      },
    });
    res.status(403).json({
      error: "You do not have permission to edit this organization's profile.",
    });
    return;
  }

  const {
    legalName, organizationAddress, cageCode, uei,
    assessmentScope, systemName, systemOwner, securityOfficer,
    itAdministrator, defaultClassification, documentNumberPrefix,
  } = req.body;

  // Build the update set and track only fields that actually changed for the audit log.
  const PROFILE_KEYS = [
    "legalName", "organizationAddress", "cageCode", "uei", "assessmentScope",
    "systemName", "systemOwner", "securityOfficer", "itAdministrator",
    "defaultClassification", "documentNumberPrefix",
  ] as const;

  const previousValue: Record<string, unknown> = {};
  const newValue: Record<string, unknown> = {};
  for (const key of PROFILE_KEYS) {
    if (req.body[key] !== undefined && req.body[key] !== (existing as any)[key]) {
      previousValue[key] = (existing as any)[key];
      newValue[key] = req.body[key];
    }
  }

  await db
    .update(organizationsTable)
    .set({
      legalName: legalName !== undefined ? legalName : existing.legalName,
      organizationAddress: organizationAddress !== undefined ? organizationAddress : existing.organizationAddress,
      cageCode: cageCode !== undefined ? cageCode : existing.cageCode,
      uei: uei !== undefined ? uei : existing.uei,
      assessmentScope: assessmentScope !== undefined ? assessmentScope : existing.assessmentScope,
      systemName: systemName !== undefined ? systemName : existing.systemName,
      systemOwner: systemOwner !== undefined ? systemOwner : existing.systemOwner,
      securityOfficer: securityOfficer !== undefined ? securityOfficer : existing.securityOfficer,
      itAdministrator: itAdministrator !== undefined ? itAdministrator : existing.itAdministrator,
      defaultClassification: defaultClassification !== undefined ? defaultClassification : existing.defaultClassification,
      documentNumberPrefix: documentNumberPrefix !== undefined ? documentNumberPrefix : existing.documentNumberPrefix,
      updatedAt: new Date(),
    })
    .where(eq(organizationsTable.id, orgId));

  await logAudit(req, "org_profile_updated", "organization", orgId, {
    entityLabel: existing.name,
    previousValue: Object.keys(previousValue).length > 0 ? previousValue : undefined,
    newValue: {
      fieldsChanged: Object.keys(newValue),
      ...newValue,
    },
  });

  const [updated] = await db.select().from(organizationsTable).where(eq(organizationsTable.id, orgId)).limit(1);
  res.json(updated);
});

router.get("/organizations/:id/users", requireAuth, async (req, res) => {
  if (req.authUser?.role !== "admin") {
    const [membership] = await db
      .select({ id: organizationUsersTable.id })
      .from(organizationUsersTable)
      .where(
        and(
          eq(organizationUsersTable.organizationId, req.params.id as string),
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
    .where(eq(organizationUsersTable.organizationId, req.params.id as string))
    .orderBy(organizationUsersTable.role, usersTable.name);

  res.json(members);
});

// Returns active org members eligible to review documents
router.get("/organizations/:orgId/reviewers", requireAuth, async (req, res): Promise<void> => {
  const { orgId } = req.params as Record<string, string>;

  // Must be a member of the org (or global admin)
  if (req.authUser?.role !== "admin") {
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
    if (!membership) { res.status(403).json({ error: "Access denied" }); return; }
  }

  const reviewers = await db
    .select({
      id: usersTable.id,
      name: usersTable.name,
      email: usersTable.email,
      orgRole: organizationUsersTable.role,
    })
    .from(organizationUsersTable)
    .innerJoin(usersTable, eq(usersTable.id, organizationUsersTable.userId))
    .where(
      and(
        eq(organizationUsersTable.organizationId, orgId),
        eq(organizationUsersTable.status, "active"),
        inArray(organizationUsersTable.role, ["org_admin", "compliance_manager", "reviewer", "it_contributor"])
      )
    )
    .orderBy(usersTable.name);

  res.json(reviewers);
});

router.post("/organizations/:id/users", requireAuth, requireAdmin, async (req, res) => {
  const { userId, role } = req.body;

  if (!userId || !role) {
    res.status(400).json({ error: "userId and role are required" });
    return;
  }

  // This is a second way into organization_users, so it must enforce the same
  // role-scope boundary as the Users & Roles endpoints. Without this, "global_admin"
  // (a PLATFORM role) could still be written into a membership row here, which is
  // exactly the mixing that made memberships look like platform grants.
  if (!isAssignableOrgRole(role)) {
    res.status(400).json({
      error: `Invalid organization role "${String(role)}". Allowed: ${ASSIGNABLE_ORG_ROLES.join(", ")}. "global_admin" is a platform role and is assigned through the user's platform role, not a membership.`,
    });
    return;
  }

  const [target] = await db
    .select({ email: usersTable.email })
    .from(usersTable)
    .where(eq(usersTable.id, userId))
    .limit(1);

  if (!target) {
    res.status(400).json({ error: "User not found" });
    return;
  }

  const existing = await db
    .select({ id: organizationUsersTable.id, role: organizationUsersTable.role, status: organizationUsersTable.status })
    .from(organizationUsersTable)
    .where(
      and(
        eq(organizationUsersTable.organizationId, req.params.id as string),
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
      organizationId: req.params.id as string,
      userId,
      role,
      status: "active",
      joinedAt: new Date(),
    });
  }

  // Membership/role changes are auditable wherever they happen, not only on the
  // Users & Roles routes, so role history stays traceable.
  await logAudit(req, "org_access_changed", "user", userId, {
    entityLabel: target.email,
    previousValue: existing.length > 0 ? { role: existing[0].role, status: existing[0].status } : null,
    newValue: { organizationId: req.params.id as string, role, status: "active" },
  });

  res.json({ organizationId: req.params.id as string, userId, role });
});

router.delete("/organizations/:id", requireAuth, requireAdmin, async (req, res) => {
  const { id } = req.params as Record<string, string>;
  const [existing] = await db
    .select()
    .from(organizationsTable)
    .where(eq(organizationsTable.id, id))
    .limit(1);

  if (!existing) {
    res.status(404).json({ error: "Not found" });
    return;
  }

  await db
    .delete(organizationUsersTable)
    .where(eq(organizationUsersTable.organizationId, id));

  await db
    .delete(organizationsTable)
    .where(eq(organizationsTable.id, id));

  req.log.info({ orgId: id, orgName: existing.name }, "Organization deleted");
  res.json({ success: true });
});

// ── Feature Flags ─────────────────────────────────────────────────────────────

// GET /organizations/:id/features — any authenticated org member or Global Admin
router.get("/organizations/:id/features", requireAuth, async (req, res) => {
  const orgId = req.params.id as string;

  // Authorization: platform Global Admin OR active org member
  if (req.authUser?.role !== "admin") {
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
      res.status(403).json({ error: "Access denied" });
      return;
    }
  }

  const rows = await db
    .select()
    .from(organizationFeaturesTable)
    .where(eq(organizationFeaturesTable.organizationId, orgId));

  // Return all known feature keys with their state; missing record = enabled
  const result = SUPPORTED_FEATURE_KEYS.map((key) => {
    const row = rows.find((r) => r.featureKey === key);
    if (row) {
      return { featureKey: row.featureKey, enabled: row.enabled, initialized: row.initialized };
    }
    return { featureKey: key, enabled: true, initialized: false };
  });

  res.json(result);
});

// PATCH /organizations/:id/features/:key — Global Admins only
router.patch(
  "/organizations/:id/features/:key",
  requireAuth,
  requireAdmin,
  async (req, res) => {
    const orgId = req.params.id as string;
    const key = (req.params.key as string).toUpperCase() as FeatureKey;

    if (!(SUPPORTED_FEATURE_KEYS as readonly string[]).includes(key)) {
      res.status(400).json({ error: `Unsupported feature key: ${key}` });
      return;
    }

    const { enabled, changeReason } = req.body;
    if (typeof enabled !== "boolean") {
      res.status(422).json({ error: "enabled (boolean) is required" });
      return;
    }

    const [org] = await db
      .select({ name: organizationsTable.name })
      .from(organizationsTable)
      .where(eq(organizationsTable.id, orgId))
      .limit(1);
    if (!org) {
      res.status(404).json({ error: "Organization not found" });
      return;
    }

    const [existing] = await db
      .select()
      .from(organizationFeaturesTable)
      .where(
        and(
          eq(organizationFeaturesTable.organizationId, orgId),
          eq(organizationFeaturesTable.featureKey, key)
        )
      )
      .limit(1);

    const prevEnabled = existing?.enabled ?? true; // missing record = enabled

    const now = new Date();
    if (existing) {
      await db
        .update(organizationFeaturesTable)
        .set({
          enabled,
          changeReason: changeReason ?? null,
          enabledBy: enabled ? req.authUser!.id : existing.enabledBy,
          enabledAt: enabled ? now : existing.enabledAt,
          disabledBy: !enabled ? req.authUser!.id : existing.disabledBy,
          disabledAt: !enabled ? now : existing.disabledAt,
          updatedAt: now,
        })
        .where(eq(organizationFeaturesTable.id, existing.id));
    } else {
      await db.insert(organizationFeaturesTable).values({
        id: randomUUID(),
        organizationId: orgId,
        featureKey: key,
        enabled,
        initialized: false,
        enabledBy: enabled ? req.authUser!.id : null,
        enabledAt: enabled ? now : null,
        disabledBy: !enabled ? req.authUser!.id : null,
        disabledAt: !enabled ? now : null,
        changeReason: changeReason ?? null,
      });
    }

    const auditEvent = enabled ? "roadmap_module_enabled" : "roadmap_module_disabled";
    await logAudit(req, auditEvent, "organization", orgId, {
      entityLabel: org.name,
      previousValue: { enabled: prevEnabled },
      newValue: { enabled, featureKey: key, changeReason: changeReason ?? null },
    });

    res.json({ featureKey: key, enabled, initialized: existing?.initialized ?? false });
  }
);

router.delete("/organizations/:id/users/:userId", requireAuth, requireAdmin, async (req, res) => {
  const targetUserId = req.params.userId as string;

  const [target] = await db
    .select({ email: usersTable.email })
    .from(usersTable)
    .where(eq(usersTable.id, targetUserId))
    .limit(1);

  if (!target) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  const previous = await db
    .select({ role: organizationUsersTable.role, status: organizationUsersTable.status })
    .from(organizationUsersTable)
    .where(
      and(
        eq(organizationUsersTable.organizationId, req.params.id as string),
        eq(organizationUsersTable.userId, targetUserId)
      )
    );

  await db
    .update(organizationUsersTable)
    .set({ status: "suspended" })
    .where(
      and(
        eq(organizationUsersTable.organizationId, req.params.id as string),
        eq(organizationUsersTable.userId, targetUserId)
      )
    );

  await logAudit(req, "org_access_changed", "user", targetUserId, {
    entityLabel: target.email,
    previousValue: previous.length > 0 ? previous[0] : null,
    newValue: { organizationId: req.params.id as string, status: "suspended" },
  });

  res.json({ success: true });
});

export default router;
