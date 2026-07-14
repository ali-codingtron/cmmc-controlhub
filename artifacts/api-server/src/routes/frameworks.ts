import { Router } from "express";
import {
  db,
  complianceFrameworksTable,
  compliancePackagesTable,
  organizationPackagesTable,
  organizationUsersTable,
  organizationsTable,
  dfarsObligationsTable,
  dfarsObligationStatusTable,
  requirementCrosswalkTable,
  complianceRequirementsTable,
  documentsTable,
  controlAssessmentsTable,
  controlsTable,
} from "@workspace/db";
import { eq, and, asc, inArray, count, or, like, sql } from "drizzle-orm";
import { requireAuth } from "../lib/auth";
import { requireOrg } from "../middleware/org";
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

// ── GET /dfars-obligations — DFARS obligations for org's DFARS packages ───────
router.get("/dfars-obligations", requireAuth, requireOrg, async (req, res) => {
  const orgId = req.orgId!;

  // Get org's active DFARS package IDs
  const dfarsPackages = await db
    .select({
      packageId: organizationPackagesTable.packageId,
      packageKey: compliancePackagesTable.packageKey,
      packageName: compliancePackagesTable.name,
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
    .where(
      and(
        eq(organizationPackagesTable.organizationId, orgId),
        eq(organizationPackagesTable.isActive, true),
        eq(complianceFrameworksTable.shortName, "DFARS")
      )
    );

  if (!dfarsPackages.length) {
    res.json([]);
    return;
  }

  const packageIds = dfarsPackages.map((p) => p.packageId);

  const [obligations, orgDocs] = await Promise.all([
    db
      .select({
        id: dfarsObligationsTable.id,
        packageId: dfarsObligationsTable.packageId,
        clauseNumber: dfarsObligationsTable.clauseNumber,
        obligationTitle: dfarsObligationsTable.obligationTitle,
        obligationDescription: dfarsObligationsTable.obligationDescription,
        requiredArtifacts: dfarsObligationsTable.requiredArtifacts,
        requiredProcess: dfarsObligationsTable.requiredProcess,
        applicableTo: dfarsObligationsTable.applicableTo,
        flowdownRequired: dfarsObligationsTable.flowdownRequired,
        incidentReportingRequired: dfarsObligationsTable.incidentReportingRequired,
        assessmentRequired: dfarsObligationsTable.assessmentRequired,
        sortOrder: dfarsObligationsTable.sortOrder,
        // Tracking fields (null when not yet set for this org)
        trackingStatus: dfarsObligationStatusTable.status,
        trackingOwner: dfarsObligationStatusTable.owner,
        trackingNotes: dfarsObligationStatusTable.notes,
        trackingUpdatedAt: dfarsObligationStatusTable.updatedAt,
      })
      .from(dfarsObligationsTable)
      .leftJoin(
        dfarsObligationStatusTable,
        and(
          eq(dfarsObligationStatusTable.obligationId, dfarsObligationsTable.id),
          eq(dfarsObligationStatusTable.organizationId, orgId)
        )
      )
      .where(inArray(dfarsObligationsTable.packageId, packageIds))
      .orderBy(asc(dfarsObligationsTable.clauseNumber), asc(dfarsObligationsTable.sortOrder)),

    // Fetch active/approved documents for linked-document matching
    db
      .select({ name: documentsTable.name })
      .from(documentsTable)
      .where(
        and(
          eq(documentsTable.organizationId, orgId),
          or(
            eq(documentsTable.status, "active"),
            eq(documentsTable.status, "approved"),
            eq(documentsTable.status, "assessor_ready")
          )
        )
      ),
  ]);

  const orgDocNames = orgDocs.map(d => d.name.toLowerCase());

  // Build package name lookup
  const pkgNameMap: Record<string, string> = {};
  for (const p of dfarsPackages) {
    pkgNameMap[p.packageId] = p.packageName;
  }

  res.json(
    obligations.map((o) => {
      const parsedArtifacts: string[] = o.requiredArtifacts
        ? (() => { try { return JSON.parse(o.requiredArtifacts!); } catch { return []; } })()
        : [];

      // Count org documents whose name contains a keyword from any required artifact
      const linkedDocumentCount = parsedArtifacts.reduce((total, artifact) => {
        const keyword = artifact.toLowerCase().split(/[\s(]/)[0];
        if (keyword.length < 4) return total;
        const matchCount = orgDocNames.filter(n => n.includes(keyword)).length;
        return total + matchCount;
      }, 0);

      return {
        ...o,
        requiredArtifacts: parsedArtifacts,
        packageName: pkgNameMap[o.packageId] ?? o.packageId,
        status: o.trackingStatus ?? "pending",
        owner: o.trackingOwner ?? null,
        notes: o.trackingNotes ?? null,
        linkedDocumentCount,
      };
    })
  );
});

// ── PATCH /dfars-obligations/:id/tracking — upsert org-scoped status/owner ───
router.patch("/dfars-obligations/:id/tracking", requireAuth, requireOrg, async (req, res) => {
  const orgId = req.orgId!;
  const obligationId = req.params.id as string;
  const { status, owner, notes } = req.body as { status?: string; owner?: string; notes?: string };

  // Verify obligation exists and fetch its packageId for authorization
  const [obligation] = await db
    .select({ id: dfarsObligationsTable.id, packageId: dfarsObligationsTable.packageId })
    .from(dfarsObligationsTable)
    .where(eq(dfarsObligationsTable.id, obligationId))
    .limit(1);

  if (!obligation) {
    res.status(404).json({ error: "Obligation not found" });
    return;
  }

  // Verify this obligation belongs to a DFARS package assigned to the caller's org
  const [pkgAssign] = await db
    .select({ id: organizationPackagesTable.id })
    .from(organizationPackagesTable)
    .where(
      and(
        eq(organizationPackagesTable.organizationId, orgId),
        eq(organizationPackagesTable.packageId, obligation.packageId),
        eq(organizationPackagesTable.isActive, true)
      )
    )
    .limit(1);

  if (!pkgAssign) {
    res.status(403).json({ error: "This obligation is not in your organization's assigned packages" });
    return;
  }

  const validStatuses = ["pending", "in_progress", "compliant", "gap"];
  if (status && !validStatuses.includes(status)) {
    res.status(400).json({ error: "Invalid status" });
    return;
  }

  await db
    .insert(dfarsObligationStatusTable)
    .values({
      id: randomUUID(),
      organizationId: orgId,
      obligationId,
      status: status ?? "pending",
      owner: owner ?? null,
      notes: notes ?? null,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [dfarsObligationStatusTable.organizationId, dfarsObligationStatusTable.obligationId],
      set: {
        ...(status !== undefined && { status }),
        ...(owner !== undefined && { owner: owner || null }),
        ...(notes !== undefined && { notes: notes || null }),
        updatedAt: new Date(),
      },
    });

  res.json({ success: true });
});

// ── GET /crosswalk — requirement crosswalk for org's packages ─────────────────
router.get("/crosswalk", requireAuth, requireOrg, async (req, res) => {
  const orgId = req.orgId!;

  // Get org's active package IDs
  const orgPkgRows = await db
    .select({ packageId: organizationPackagesTable.packageId })
    .from(organizationPackagesTable)
    .where(
      and(
        eq(organizationPackagesTable.organizationId, orgId),
        eq(organizationPackagesTable.isActive, true)
      )
    );

  if (orgPkgRows.length < 2) {
    res.json([]);
    return;
  }

  const packageIds = orgPkgRows.map((p) => p.packageId);

  // Get requirements for those packages
  let reqRows: Array<{ id: string; packageId: string; requirementKey: string; title: string }> = [];
  try {
    reqRows = await db
      .select({
        id: complianceRequirementsTable.id,
        packageId: complianceRequirementsTable.packageId,
        requirementKey: complianceRequirementsTable.requirementId,
        title: complianceRequirementsTable.title,
      })
      .from(complianceRequirementsTable)
      .where(inArray(complianceRequirementsTable.packageId, packageIds));
  } catch {
    res.json([]);
    return;
  }

  if (!reqRows.length) {
    res.json([]);
    return;
  }

  const reqIds = reqRows.map((r) => r.id);
  const reqMap: Record<string, typeof reqRows[0]> = {};
  for (const r of reqRows) reqMap[r.id] = r;

  // Fetch package metadata for labels
  const pkgRows = await db
    .select({
      id: compliancePackagesTable.id,
      name: compliancePackagesTable.name,
      frameworkShortName: complianceFrameworksTable.shortName,
    })
    .from(compliancePackagesTable)
    .innerJoin(complianceFrameworksTable, eq(compliancePackagesTable.frameworkId, complianceFrameworksTable.id))
    .where(inArray(compliancePackagesTable.id, packageIds));
  const pkgMap: Record<string, typeof pkgRows[0]> = {};
  for (const p of pkgRows) pkgMap[p.id] = p;

  let crosswalkRows: Array<{
    id: string;
    sourceRequirementId: string;
    targetRequirementId: string;
    relationshipType: string;
    notes: string | null;
  }> = [];
  try {
    crosswalkRows = await db
      .select()
      .from(requirementCrosswalkTable)
      .where(
        and(
          inArray(requirementCrosswalkTable.sourceRequirementId, reqIds),
          inArray(requirementCrosswalkTable.targetRequirementId, reqIds)
        )
      );
  } catch {
    res.json([]);
    return;
  }

  const result = crosswalkRows.map((cw) => {
    const src = reqMap[cw.sourceRequirementId];
    const tgt = reqMap[cw.targetRequirementId];
    const srcPkg = src ? pkgMap[src.packageId] : undefined;
    const tgtPkg = tgt ? pkgMap[tgt.packageId] : undefined;
    return {
      id: cw.id,
      sourceRequirementId: cw.sourceRequirementId,
      sourceKey: src?.requirementKey ?? cw.sourceRequirementId,
      sourceTitle: src?.title ?? "",
      sourcePackageName: srcPkg?.name ?? "",
      sourceFramework: srcPkg?.frameworkShortName ?? "",
      targetRequirementId: cw.targetRequirementId,
      targetKey: tgt?.requirementKey ?? cw.targetRequirementId,
      targetTitle: tgt?.title ?? "",
      targetPackageName: tgtPkg?.name ?? "",
      targetFramework: tgtPkg?.frameworkShortName ?? "",
      relationshipType: cw.relationshipType,
      notes: cw.notes,
    };
  });

  res.json(result);
});

// ── GET /admin/orgs-package-status — all orgs with package summary (admin) ───
router.get("/admin/orgs-package-status", requireAuth, async (req, res) => {
  const authUser = req.authUser!;
  if (authUser.role !== "admin" && !req.isBreakGlass) {
    res.status(403).json({ error: "Admin only" });
    return;
  }

  const orgs = await db
    .select({
      id: organizationsTable.id,
      name: organizationsTable.name,
      shortName: organizationsTable.shortName,
      cmmcTargetLevel: organizationsTable.cmmcTargetLevel,
      isTestOrganization: organizationsTable.isTestOrganization,
      isActive: organizationsTable.isActive,
    })
    .from(organizationsTable)
    .orderBy(asc(organizationsTable.name));

  const orgIds = orgs.map((o) => o.id);
  if (!orgIds.length) {
    res.json([]);
    return;
  }

  const L2_KEYS = new Set(["CMMC_L2_SELF", "NIST_800_171_R2", "NIST_800_171_R3", "NIST_800_171A_R2", "NIST_800_171A_R3"]);
  const L1_KEYS = new Set(["CMMC_L1_SELF", "FAR_52_204_21"]);

  const [allPackages, assessedCounts, packageControlCounts] = await Promise.all([
    db
      .select({
        organizationId: organizationPackagesTable.organizationId,
        packageId: organizationPackagesTable.packageId,
        isActive: organizationPackagesTable.isActive,
        selectedAt: organizationPackagesTable.selectedAt,
        packageKey: compliancePackagesTable.packageKey,
        packageName: compliancePackagesTable.name,
        packageType: compliancePackagesTable.packageType,
        controlCount: compliancePackagesTable.controlCount,
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
      .where(inArray(organizationPackagesTable.organizationId, orgIds)),

    // Assessed controls per org (for progress tracking)
    db
      .select({ organizationId: controlAssessmentsTable.organizationId, cnt: count() })
      .from(controlAssessmentsTable)
      .where(inArray(controlAssessmentsTable.organizationId, orgIds))
      .groupBy(controlAssessmentsTable.organizationId),

    // Distinct controls in scope per org — join to controlsTable to resolve requirement IDs
    // to actual control rows, then count DISTINCT to avoid double-counting when CMMC L2 + NIST R2
    // both have requirements that map to the same 110 controls.
    db
      .selectDistinct({
        organizationId: organizationPackagesTable.organizationId,
        controlDbId: controlsTable.id,
      })
      .from(organizationPackagesTable)
      .innerJoin(compliancePackagesTable, eq(organizationPackagesTable.packageId, compliancePackagesTable.id))
      .innerJoin(complianceRequirementsTable, eq(complianceRequirementsTable.packageId, compliancePackagesTable.id))
      .innerJoin(
        controlsTable,
        or(
          // CMMC (L1/L2) and FAR packages: requirementId matches controlsTable.controlId
          and(
            or(
              like(compliancePackagesTable.packageKey, "CMMC_%"),
              eq(compliancePackagesTable.packageKey, "FAR_52_204_21")
            ),
            eq(controlsTable.controlId, complianceRequirementsTable.requirementId)
          ),
          // NIST 800-171 packages: requirementId matches controlsTable.nistRef
          and(
            like(compliancePackagesTable.packageKey, "NIST_800_171_%"),
            sql`${controlsTable.nistRef} = ${complianceRequirementsTable.requirementId}`
          )
        )
      )
      .where(
        and(
          inArray(organizationPackagesTable.organizationId, orgIds),
          eq(organizationPackagesTable.isActive, true),
          eq(controlsTable.isActive, true)
        )
      ),
  ]);

  const pkgByOrg: Record<string, typeof allPackages> = {};
  for (const p of allPackages) {
    if (!pkgByOrg[p.organizationId]) pkgByOrg[p.organizationId] = [];
    pkgByOrg[p.organizationId].push(p);
  }

  const assessedByOrg: Record<string, number> = {};
  for (const r of assessedCounts) {
    if (r.organizationId) assessedByOrg[r.organizationId] = Number(r.cnt);
  }

  // packageControlCounts is now an array of (organizationId, controlDbId) distinct pairs.
  // Group and count in JS — each entry is already de-duplicated by SELECT DISTINCT.
  const packageControlCountByOrg: Record<string, number> = {};
  for (const r of packageControlCounts) {
    packageControlCountByOrg[r.organizationId] = (packageControlCountByOrg[r.organizationId] ?? 0) + 1;
  }

  const result = orgs.map((org) => {
    const activePkgs = (pkgByOrg[org.id] ?? []).filter((p) => p.isActive);
    const hasL2 = activePkgs.some(p => L2_KEYS.has(p.packageKey));
    const hasL1 = activePkgs.some(p => L1_KEYS.has(p.packageKey));
    const inferredLevel = hasL2 ? "L2" : hasL1 ? "L1" : (org.cmmcTargetLevel ?? null);
    return {
      ...org,
      packages: activePkgs,
      allPackages: pkgByOrg[org.id] ?? [],
      packageControlCount: packageControlCountByOrg[org.id] ?? 0,
      assessedControlCount: assessedByOrg[org.id] ?? 0,
      inferredLevel,
    };
  });

  res.json(result);
});

export default router;
