import { Router } from "express";
import {
  db,
  complianceFrameworksTable,
  compliancePackagesTable,
  organizationPackagesTable,
  organizationUsersTable,
  organizationsTable,
} from "@workspace/db";
import { eq, and, asc } from "drizzle-orm";
import { requireAuth } from "../lib/auth";
import { randomUUID } from "crypto";
import { logger } from "../lib/logger";

const router = Router();

// ── GET /frameworks — list all active frameworks ─────────────────────────────
router.get("/frameworks", requireAuth, async (req, res) => {
  const frameworks = await db
    .select()
    .from(complianceFrameworksTable)
    .where(eq(complianceFrameworksTable.status, "active"))
    .orderBy(asc(complianceFrameworksTable.name));
  res.json(frameworks);
});

// ── GET /packages — list all active packages (optional ?frameworkId filter) ──
router.get("/packages", requireAuth, async (req, res) => {
  const { frameworkId } = req.query as { frameworkId?: string };

  const rows = await db
    .select({
      id: compliancePackagesTable.id,
      frameworkId: compliancePackagesTable.frameworkId,
      packageKey: compliancePackagesTable.packageKey,
      name: compliancePackagesTable.name,
      version: compliancePackagesTable.version,
      description: compliancePackagesTable.description,
      packageType: compliancePackagesTable.packageType,
      status: compliancePackagesTable.status,
      effectiveDate: compliancePackagesTable.effectiveDate,
      sourceReference: compliancePackagesTable.sourceReference,
      controlCount: compliancePackagesTable.controlCount,
      sortOrder: compliancePackagesTable.sortOrder,
      frameworkName: complianceFrameworksTable.name,
      frameworkShortName: complianceFrameworksTable.shortName,
    })
    .from(compliancePackagesTable)
    .innerJoin(
      complianceFrameworksTable,
      eq(compliancePackagesTable.frameworkId, complianceFrameworksTable.id)
    )
    .where(
      frameworkId
        ? and(
            eq(compliancePackagesTable.status, "active"),
            eq(compliancePackagesTable.frameworkId, frameworkId)
          )
        : eq(compliancePackagesTable.status, "active")
    )
    .orderBy(asc(compliancePackagesTable.sortOrder));

  res.json(rows);
});

// ── GET /organizations/:id/packages — list packages for an org ───────────────
router.get(
  "/organizations/:id/packages",
  requireAuth,
  async (req, res) => {
    const orgId = req.params.id as string;
    const authUser = req.authUser!;

    // Verify caller has access to this org (admin can see any)
    if (authUser.role !== "admin" && !req.isBreakGlass) {
      const [membership] = await db
        .select({ id: organizationUsersTable.id })
        .from(organizationUsersTable)
        .where(
          and(
            eq(organizationUsersTable.organizationId, orgId),
            eq(organizationUsersTable.userId, authUser.id),
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
      .select({
        id: organizationPackagesTable.id,
        organizationId: organizationPackagesTable.organizationId,
        packageId: organizationPackagesTable.packageId,
        isActive: organizationPackagesTable.isActive,
        selectedAt: organizationPackagesTable.selectedAt,
        notes: organizationPackagesTable.notes,
        packageKey: compliancePackagesTable.packageKey,
        packageName: compliancePackagesTable.name,
        packageVersion: compliancePackagesTable.version,
        packageType: compliancePackagesTable.packageType,
        controlCount: compliancePackagesTable.controlCount,
        frameworkId: compliancePackagesTable.frameworkId,
        frameworkName: complianceFrameworksTable.name,
        frameworkShortName: complianceFrameworksTable.shortName,
      })
      .from(organizationPackagesTable)
      .innerJoin(
        compliancePackagesTable,
        eq(organizationPackagesTable.packageId, compliancePackagesTable.id)
      )
      .innerJoin(
        complianceFrameworksTable,
        eq(compliancePackagesTable.frameworkId, complianceFrameworksTable.id)
      )
      .where(eq(organizationPackagesTable.organizationId, orgId))
      .orderBy(asc(compliancePackagesTable.sortOrder));

    res.json(rows);
  }
);

// ── POST /organizations/:id/packages — add packages to an org ────────────────
router.post(
  "/organizations/:id/packages",
  requireAuth,
  async (req, res) => {
    const orgId = req.params.id as string;
    const authUser = req.authUser!;
    const { packageIds, notes } = req.body as {
      packageIds?: string[];
      notes?: string;
    };

    if (!packageIds?.length) {
      res.status(400).json({ error: "packageIds array is required" });
      return;
    }

    // Only admin or compliance_manager can assign packages
    if (authUser.role !== "admin" && !req.isBreakGlass) {
      const [membership] = await db
        .select({ role: organizationUsersTable.role })
        .from(organizationUsersTable)
        .where(
          and(
            eq(organizationUsersTable.organizationId, orgId),
            eq(organizationUsersTable.userId, authUser.id),
            eq(organizationUsersTable.status, "active")
          )
        )
        .limit(1);
      if (
        !membership ||
        !["org_admin", "global_admin", "compliance_manager"].includes(
          membership.role
        )
      ) {
        res.status(403).json({ error: "Insufficient permissions to assign packages" });
        return;
      }
    }

    // Verify org exists
    const [org] = await db
      .select({ id: organizationsTable.id })
      .from(organizationsTable)
      .where(eq(organizationsTable.id, orgId))
      .limit(1);
    if (!org) {
      res.status(404).json({ error: "Organization not found" });
      return;
    }

    const inserted: string[] = [];
    const skipped: string[] = [];

    for (const packageId of packageIds) {
      // Check if already assigned (active or inactive)
      const [existing] = await db
        .select({ id: organizationPackagesTable.id, isActive: organizationPackagesTable.isActive })
        .from(organizationPackagesTable)
        .where(
          and(
            eq(organizationPackagesTable.organizationId, orgId),
            eq(organizationPackagesTable.packageId, packageId)
          )
        )
        .limit(1);

      if (existing) {
        if (!existing.isActive) {
          // Re-activate
          await db
            .update(organizationPackagesTable)
            .set({ isActive: true, selectedAt: new Date(), selectedById: authUser.id, updatedAt: new Date() })
            .where(eq(organizationPackagesTable.id, existing.id));
          inserted.push(packageId);
        } else {
          skipped.push(packageId);
        }
      } else {
        await db.insert(organizationPackagesTable).values({
          id: randomUUID(),
          organizationId: orgId,
          packageId,
          isActive: true,
          selectedById: authUser.id,
          selectedAt: new Date(),
          notes: notes ?? null,
          createdAt: new Date(),
          updatedAt: new Date(),
        });
        inserted.push(packageId);
      }
    }

    logger.info({ orgId, inserted, skipped }, "Org packages assigned");
    res.status(201).json({ inserted, skipped });
  }
);

// ── DELETE /organizations/:id/packages/:packageId — deactivate a package ─────
router.delete(
  "/organizations/:id/packages/:packageId",
  requireAuth,
  async (req, res) => {
    const orgId = req.params.id as string;
    const packageId = req.params.packageId as string;
    const authUser = req.authUser!;

    // Only admin or compliance_manager can remove packages
    if (authUser.role !== "admin" && !req.isBreakGlass) {
      const [membership] = await db
        .select({ role: organizationUsersTable.role })
        .from(organizationUsersTable)
        .where(
          and(
            eq(organizationUsersTable.organizationId, orgId),
            eq(organizationUsersTable.userId, authUser.id),
            eq(organizationUsersTable.status, "active")
          )
        )
        .limit(1);
      if (
        !membership ||
        !["org_admin", "global_admin", "compliance_manager"].includes(
          membership.role
        )
      ) {
        res.status(403).json({ error: "Insufficient permissions" });
        return;
      }
    }

    const [assignment] = await db
      .select({ id: organizationPackagesTable.id })
      .from(organizationPackagesTable)
      .where(
        and(
          eq(organizationPackagesTable.organizationId, orgId),
          eq(organizationPackagesTable.packageId, packageId)
        )
      )
      .limit(1);

    if (!assignment) {
      res.status(404).json({ error: "Package assignment not found" });
      return;
    }

    // Soft-delete: mark inactive, preserve data
    await db
      .update(organizationPackagesTable)
      .set({ isActive: false, updatedAt: new Date() })
      .where(eq(organizationPackagesTable.id, assignment.id));

    logger.info({ orgId, packageId }, "Org package deactivated (soft delete)");
    res.json({ success: true });
  }
);

export default router;
