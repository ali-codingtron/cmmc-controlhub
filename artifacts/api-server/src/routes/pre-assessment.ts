import { Router } from "express";
import {
  db,
  tenantConnectionsTable,
  paScanRunsTable,
  paScanSnapshotsTable,
  paFindingsTable,
  paEvidenceRecordsTable,
  paEvidenceRequestsTable,
  paRoadmapActionsTable,
} from "@workspace/db";
import { eq, and, desc } from "drizzle-orm";
import { randomUUID } from "crypto";
import { requireAuth } from "../lib/auth";
import { requireOrg } from "../middleware/org";
import { encryptSecret, decryptSecret } from "../lib/crypto-utils";
import { runTenantScan, testTenantConnection } from "../lib/pa-rules-engine";
import { PACK_DEFINITIONS } from "../data/assessment-rules";

const router = Router();

router.get("/packs", requireAuth, (_req, res) => {
  res.json({ packs: Object.entries(PACK_DEFINITIONS).map(([id, p]) => ({ id, ...p })) });
});

router.get("/connections", requireAuth, requireOrg, async (req, res) => {
  try {
    const rows = await db
      .select()
      .from(tenantConnectionsTable)
      .where(eq(tenantConnectionsTable.organizationId, req.orgId!))
      .orderBy(desc(tenantConnectionsTable.createdAt));

    const safe = rows.map((r) => ({ ...r, encryptedClientSecret: undefined }));
    res.json({ connections: safe });
  } catch (err) {
    req.log.error(err, "pa: list connections failed");
    res.status(500).json({ error: "Failed to list connections" });
  }
});

router.post("/connections", requireAuth, requireOrg, async (req, res) => {
  const user = (req as any).user as { email?: string; role?: string } | undefined;
  if (user?.role !== "admin" && user?.role !== "compliance_manager") {
    return res.status(403).json({ error: "Only admins and compliance managers can add tenant connections" });
  }

  const {
    tenantName,
    microsoftTenantId,
    primaryDomain,
    authMode = "app_only",
    clientId,
    clientSecret,
    notes,
  } = req.body as Record<string, string | undefined>;

  if (!tenantName?.trim() || !microsoftTenantId?.trim()) {
    return res.status(400).json({ error: "tenantName and microsoftTenantId are required" });
  }

  const id = randomUUID();
  const encSecret = clientSecret?.trim() ? encryptSecret(clientSecret.trim()) : null;

  try {
    await db.insert(tenantConnectionsTable).values({
      id,
      organizationId: req.orgId!,
      tenantName: tenantName.trim(),
      microsoftTenantId: microsoftTenantId.trim(),
      primaryDomain: primaryDomain?.trim() || null,
      authMode: (authMode as "app_only" | "delegated") ?? "app_only",
      clientId: clientId?.trim() || null,
      encryptedClientSecret: encSecret,
      connectionStatus: "pending",
      connectedBy: user?.email ?? null,
      connectedAt: new Date(),
      notes: notes?.trim() || null,
      updatedAt: new Date(),
    });

    const [row] = await db
      .select()
      .from(tenantConnectionsTable)
      .where(eq(tenantConnectionsTable.id, id));

    res.status(201).json({ ...row, encryptedClientSecret: undefined });
  } catch (err) {
    req.log.error(err, "pa: create connection failed");
    res.status(500).json({ error: "Failed to create connection" });
  }
});

router.patch("/connections/:id", requireAuth, requireOrg, async (req, res) => {
  const user = (req as any).user as { email?: string; role?: string } | undefined;
  if (user?.role !== "admin" && user?.role !== "compliance_manager") {
    return res.status(403).json({ error: "Insufficient permissions" });
  }

  try {
    const [existing] = await db
      .select()
      .from(tenantConnectionsTable)
      .where(
        and(
          eq(tenantConnectionsTable.id, req.params.id),
          eq(tenantConnectionsTable.organizationId, req.orgId!)
        )
      );
    if (!existing) return res.status(404).json({ error: "Connection not found" });

    const { tenantName, primaryDomain, clientId, clientSecret, notes } =
      req.body as Record<string, string | undefined>;

    const updates: Partial<typeof tenantConnectionsTable.$inferInsert> = {
      updatedAt: new Date(),
    };
    if (tenantName?.trim()) updates.tenantName = tenantName.trim();
    if (primaryDomain !== undefined) updates.primaryDomain = primaryDomain.trim() || null;
    if (clientId !== undefined) updates.clientId = clientId.trim() || null;
    if (clientSecret?.trim()) updates.encryptedClientSecret = encryptSecret(clientSecret.trim());
    if (notes !== undefined) updates.notes = notes.trim() || null;

    await db
      .update(tenantConnectionsTable)
      .set(updates)
      .where(eq(tenantConnectionsTable.id, req.params.id));

    const [updated] = await db
      .select()
      .from(tenantConnectionsTable)
      .where(eq(tenantConnectionsTable.id, req.params.id));

    res.json({ ...updated, encryptedClientSecret: undefined });
  } catch (err) {
    req.log.error(err, "pa: update connection failed");
    res.status(500).json({ error: "Failed to update connection" });
  }
});

router.delete("/connections/:id", requireAuth, requireOrg, async (req, res) => {
  const user = (req as any).user as { role?: string } | undefined;
  if (user?.role !== "admin") {
    return res.status(403).json({ error: "Only admins can disconnect tenants" });
  }

  try {
    const [existing] = await db
      .select({ id: tenantConnectionsTable.id })
      .from(tenantConnectionsTable)
      .where(
        and(
          eq(tenantConnectionsTable.id, req.params.id),
          eq(tenantConnectionsTable.organizationId, req.orgId!)
        )
      );
    if (!existing) return res.status(404).json({ error: "Connection not found" });

    await db
      .update(tenantConnectionsTable)
      .set({
        connectionStatus: "disconnected",
        encryptedClientSecret: null,
        clientId: null,
        updatedAt: new Date(),
      })
      .where(eq(tenantConnectionsTable.id, req.params.id));

    res.json({ success: true });
  } catch (err) {
    req.log.error(err, "pa: disconnect tenant failed");
    res.status(500).json({ error: "Failed to disconnect tenant" });
  }
});

router.post("/connections/:id/test", requireAuth, requireOrg, async (req, res) => {
  try {
    const [conn] = await db
      .select()
      .from(tenantConnectionsTable)
      .where(
        and(
          eq(tenantConnectionsTable.id, req.params.id),
          eq(tenantConnectionsTable.organizationId, req.orgId!)
        )
      );
    if (!conn) return res.status(404).json({ error: "Connection not found" });
    if (!conn.clientId || !conn.encryptedClientSecret) {
      return res.status(400).json({ error: "Connection credentials not configured" });
    }

    const secret = decryptSecret(conn.encryptedClientSecret);
    const result = await testTenantConnection(
      conn.microsoftTenantId,
      conn.clientId,
      secret
    );

    await db
      .update(tenantConnectionsTable)
      .set({
        connectionStatus: result.success ? "connected" : "error",
        lastFailedReason: result.success ? null : result.error ?? null,
        updatedAt: new Date(),
      })
      .where(eq(tenantConnectionsTable.id, req.params.id));

    res.json(result);
  } catch (err) {
    req.log.error(err, "pa: test connection failed");
    res.status(500).json({ error: "Connection test failed" });
  }
});

router.get("/scans", requireAuth, requireOrg, async (req, res) => {
  try {
    const rows = await db
      .select()
      .from(paScanRunsTable)
      .where(eq(paScanRunsTable.organizationId, req.orgId!))
      .orderBy(desc(paScanRunsTable.createdAt));

    res.json({ scans: rows });
  } catch (err) {
    req.log.error(err, "pa: list scans failed");
    res.status(500).json({ error: "Failed to list scans" });
  }
});

router.post("/scans", requireAuth, requireOrg, async (req, res) => {
  const user = (req as any).user as { email?: string; role?: string } | undefined;
  if (user?.role !== "admin" && user?.role !== "compliance_manager") {
    return res.status(403).json({ error: "Only admins and compliance managers can run scans" });
  }

  const {
    tenantConnectionId,
    scanName,
    packs = ["identity", "authentication", "conditional_access", "devices", "audit", "secure_score"],
  } = req.body as {
    tenantConnectionId?: string;
    scanName?: string;
    packs?: string[];
  };

  if (!tenantConnectionId) {
    return res.status(400).json({ error: "tenantConnectionId is required" });
  }

  const [conn] = await db
    .select({ id: tenantConnectionsTable.id })
    .from(tenantConnectionsTable)
    .where(
      and(
        eq(tenantConnectionsTable.id, tenantConnectionId),
        eq(tenantConnectionsTable.organizationId, req.orgId!)
      )
    );
  if (!conn) return res.status(404).json({ error: "Tenant connection not found" });

  const id = randomUUID();
  const name = scanName?.trim() || `Tenant Scan — ${new Date().toLocaleDateString()}`;

  try {
    await db.insert(paScanRunsTable).values({
      id,
      organizationId: req.orgId!,
      tenantConnectionId,
      scanName: name,
      scanType: packs.length === 6 ? "full" : "partial",
      packsRequested: packs,
      createdBy: user?.email ?? null,
      updatedAt: new Date(),
    });

    const [scan] = await db
      .select()
      .from(paScanRunsTable)
      .where(eq(paScanRunsTable.id, id));

    res.status(201).json(scan);

    setImmediate(() => {
      runTenantScan(id, req.orgId!, tenantConnectionId, packs).catch((err) => {
        req.log.error(err, "pa: background scan failed");
      });
    });
  } catch (err) {
    req.log.error(err, "pa: create scan failed");
    res.status(500).json({ error: "Failed to create scan" });
  }
});

router.get("/scans/:id", requireAuth, requireOrg, async (req, res) => {
  try {
    const [scan] = await db
      .select()
      .from(paScanRunsTable)
      .where(
        and(
          eq(paScanRunsTable.id, req.params.id),
          eq(paScanRunsTable.organizationId, req.orgId!)
        )
      );
    if (!scan) return res.status(404).json({ error: "Scan not found" });

    const findings = await db
      .select()
      .from(paFindingsTable)
      .where(eq(paFindingsTable.scanRunId, req.params.id))
      .orderBy(paFindingsTable.severity);

    const evidenceRecords = await db
      .select()
      .from(paEvidenceRecordsTable)
      .where(eq(paEvidenceRecordsTable.scanRunId, req.params.id));

    const evidenceRequests = await db
      .select()
      .from(paEvidenceRequestsTable)
      .where(eq(paEvidenceRequestsTable.scanRunId, req.params.id));

    const roadmapActions = await db
      .select()
      .from(paRoadmapActionsTable)
      .where(eq(paRoadmapActionsTable.scanRunId, req.params.id))
      .orderBy(paRoadmapActionsTable.priority);

    res.json({ scan, findings, evidenceRecords, evidenceRequests, roadmapActions });
  } catch (err) {
    req.log.error(err, "pa: get scan failed");
    res.status(500).json({ error: "Failed to load scan" });
  }
});

router.get("/scans/:id/snapshots", requireAuth, requireOrg, async (req, res) => {
  try {
    const rows = await db
      .select()
      .from(paScanSnapshotsTable)
      .where(eq(paScanSnapshotsTable.scanRunId, req.params.id));
    res.json({ snapshots: rows });
  } catch (err) {
    req.log.error(err, "pa: get snapshots failed");
    res.status(500).json({ error: "Failed to load snapshots" });
  }
});

router.patch("/findings/:id", requireAuth, requireOrg, async (req, res) => {
  const user = (req as any).user as { email?: string; role?: string } | undefined;
  if (user?.role !== "admin" && user?.role !== "compliance_manager") {
    return res.status(403).json({ error: "Insufficient permissions" });
  }

  const { action, reason } = req.body as { action: "approve" | "reject"; reason?: string };
  if (!["approve", "reject"].includes(action)) {
    return res.status(400).json({ error: "action must be approve or reject" });
  }

  try {
    const [finding] = await db
      .select({ id: paFindingsTable.id, orgId: paFindingsTable.organizationId })
      .from(paFindingsTable)
      .where(eq(paFindingsTable.id, req.params.id));

    if (!finding || finding.orgId !== req.orgId) {
      return res.status(404).json({ error: "Finding not found" });
    }

    if (action === "approve") {
      await db
        .update(paFindingsTable)
        .set({
          approvedStatus: "approved",
          approvedBy: user?.email ?? null,
          approvedAt: new Date(),
          rejectedAt: null,
          rejectedBy: null,
          updatedAt: new Date(),
        })
        .where(eq(paFindingsTable.id, req.params.id));
    } else {
      await db
        .update(paFindingsTable)
        .set({
          approvedStatus: "rejected",
          rejectedBy: user?.email ?? null,
          rejectedAt: new Date(),
          approvedAt: null,
          approvedBy: null,
          updatedAt: new Date(),
        })
        .where(eq(paFindingsTable.id, req.params.id));
    }

    const [updated] = await db
      .select()
      .from(paFindingsTable)
      .where(eq(paFindingsTable.id, req.params.id));
    res.json(updated);
  } catch (err) {
    req.log.error(err, "pa: patch finding failed");
    res.status(500).json({ error: "Failed to update finding" });
  }
});

router.patch("/evidence-records/:id", requireAuth, requireOrg, async (req, res) => {
  const user = (req as any).user as { email?: string; role?: string } | undefined;
  if (user?.role !== "admin" && user?.role !== "compliance_manager") {
    return res.status(403).json({ error: "Insufficient permissions" });
  }

  const { status, assessorSummary } = req.body as { status?: string; assessorSummary?: string };

  try {
    const [rec] = await db
      .select({ id: paEvidenceRecordsTable.id, orgId: paEvidenceRecordsTable.organizationId })
      .from(paEvidenceRecordsTable)
      .where(eq(paEvidenceRecordsTable.id, req.params.id));
    if (!rec || rec.orgId !== req.orgId) {
      return res.status(404).json({ error: "Evidence record not found" });
    }

    const updates: Record<string, unknown> = { updatedAt: new Date() };
    if (status) {
      updates.status = status;
      if (status === "approved" || status === "rejected") {
        updates.reviewedBy = user?.email ?? null;
        updates.reviewedAt = new Date();
      }
    }
    if (assessorSummary !== undefined) updates.assessorSummary = assessorSummary;

    await db
      .update(paEvidenceRecordsTable)
      .set(updates)
      .where(eq(paEvidenceRecordsTable.id, req.params.id));

    const [updated] = await db
      .select()
      .from(paEvidenceRecordsTable)
      .where(eq(paEvidenceRecordsTable.id, req.params.id));
    res.json(updated);
  } catch (err) {
    req.log.error(err, "pa: patch evidence record failed");
    res.status(500).json({ error: "Failed to update evidence record" });
  }
});

router.get("/findings", requireAuth, requireOrg, async (req, res) => {
  try {
    const rows = await db
      .select()
      .from(paFindingsTable)
      .where(eq(paFindingsTable.organizationId, req.orgId!))
      .orderBy(desc(paFindingsTable.createdAt));
    res.json({ findings: rows });
  } catch (err) {
    req.log.error(err, "pa: org findings failed");
    res.status(500).json({ error: "Failed to load findings" });
  }
});

router.get("/evidence-requests", requireAuth, requireOrg, async (req, res) => {
  try {
    const rows = await db
      .select()
      .from(paEvidenceRequestsTable)
      .where(eq(paEvidenceRequestsTable.organizationId, req.orgId!))
      .orderBy(desc(paEvidenceRequestsTable.createdAt));
    res.json({ evidenceRequests: rows });
  } catch (err) {
    req.log.error(err, "pa: org evidence requests failed");
    res.status(500).json({ error: "Failed to load evidence requests" });
  }
});

router.patch("/evidence-requests/:id", requireAuth, requireOrg, async (req, res) => {
  const { status } = req.body as { status?: string };
  try {
    const [req_] = await db
      .select({ id: paEvidenceRequestsTable.id, orgId: paEvidenceRequestsTable.organizationId })
      .from(paEvidenceRequestsTable)
      .where(eq(paEvidenceRequestsTable.id, req.params.id));
    if (!req_ || req_.orgId !== req.orgId) {
      return res.status(404).json({ error: "Evidence request not found" });
    }
    await db
      .update(paEvidenceRequestsTable)
      .set({ status: status as any, updatedAt: new Date() })
      .where(eq(paEvidenceRequestsTable.id, req.params.id));
    const [updated] = await db
      .select()
      .from(paEvidenceRequestsTable)
      .where(eq(paEvidenceRequestsTable.id, req.params.id));
    res.json(updated);
  } catch (err) {
    req.log.error(err, "pa: patch evidence request failed");
    res.status(500).json({ error: "Failed to update evidence request" });
  }
});

router.get("/roadmap", requireAuth, requireOrg, async (req, res) => {
  try {
    const rows = await db
      .select()
      .from(paRoadmapActionsTable)
      .where(eq(paRoadmapActionsTable.organizationId, req.orgId!))
      .orderBy(paRoadmapActionsTable.priority, desc(paRoadmapActionsTable.createdAt));
    res.json({ roadmapActions: rows });
  } catch (err) {
    req.log.error(err, "pa: org roadmap failed");
    res.status(500).json({ error: "Failed to load roadmap" });
  }
});

router.patch("/roadmap/:id", requireAuth, requireOrg, async (req, res) => {
  const { status } = req.body as { status?: string };
  if (!status) return res.status(400).json({ error: "status is required" });

  try {
    const [action] = await db
      .select({ id: paRoadmapActionsTable.id, orgId: paRoadmapActionsTable.organizationId })
      .from(paRoadmapActionsTable)
      .where(eq(paRoadmapActionsTable.id, req.params.id));
    if (!action || action.orgId !== req.orgId) {
      return res.status(404).json({ error: "Roadmap action not found" });
    }
    await db
      .update(paRoadmapActionsTable)
      .set({ status, updatedAt: new Date() })
      .where(eq(paRoadmapActionsTable.id, req.params.id));
    const [updated] = await db
      .select()
      .from(paRoadmapActionsTable)
      .where(eq(paRoadmapActionsTable.id, req.params.id));
    res.json(updated);
  } catch (err) {
    req.log.error(err, "pa: patch roadmap action failed");
    res.status(500).json({ error: "Failed to update roadmap action" });
  }
});

export default router;
