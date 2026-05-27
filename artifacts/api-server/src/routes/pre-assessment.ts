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
import { runTenantScan, testTenantConnection } from "../lib/pa-rules-engine";
import { getGraphTokenForTenant, invalidateTokenCacheForTenant, graphGet } from "../lib/graph-client";
import { PACK_DEFINITIONS } from "../data/assessment-rules";
import { getMicrosoftConfig, getMicrosoftConfigStatus } from "../lib/ms-config";

const router = Router();

interface OAuthState {
  orgId: string;
  userEmail: string;
  userId: string;
  expiresAt: number;
}
const oauthStateStore = new Map<string, OAuthState>();

setInterval(() => {
  const now = Date.now();
  for (const [key, val] of oauthStateStore) {
    if (now > val.expiresAt) oauthStateStore.delete(key);
  }
}, 60_000);

router.get("/packs", requireAuth, (_req, res) => {
  res.json({ packs: Object.entries(PACK_DEFINITIONS).map(([id, p]) => ({ id, ...p })) });
});

router.get("/microsoft/config-status", requireAuth, (_req, res) => {
  const status = getMicrosoftConfigStatus();
  res.json(status);
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

router.post("/microsoft/connect/start", requireAuth, requireOrg, async (req, res) => {
  const cfg = getMicrosoftConfig();
  if (!cfg.ok) {
    return res.status(503).json({
      error: "Microsoft tenant connection is not configured yet",
      detail:
        `Microsoft tenant connection is not configured yet. Missing: ${cfg.missing.join(", ")}. ` +
        "Add the Microsoft app registration values to production environment variables before connecting tenants.",
      missingVars: cfg.missing,
    });
  }

  const user = req.authUser;
  const state = randomUUID();

  oauthStateStore.set(state, {
    orgId: req.orgId!,
    userEmail: user?.email ?? "",
    userId: user?.id ?? "",
    expiresAt: Date.now() + 15 * 60 * 1000,
  });

  const params = new URLSearchParams({
    client_id: cfg.clientId,
    scope: cfg.graphScope,
    redirect_uri: cfg.redirectUri,
    state,
  });

  const authUrl = `${cfg.authority}/v2.0/adminconsent?${params.toString()}`;

  req.log.info({
    msg: "pa: building admin consent URL",
    authority: cfg.authority,
    hasClientId: !!cfg.clientId,
    hasRedirectUri: !!cfg.redirectUri,
    hasScope: !!cfg.graphScope,
    scope: cfg.graphScope,
    stateGenerated: state,
  });

  res.json({ authUrl });
});

router.get("/microsoft/callback", async (req, res) => {
  const { state, tenant, error, error_description } = req.query as Record<string, string | undefined>;

  const frontendBase = process.env.FRONTEND_BASE_URL || "";

  if (!state || !oauthStateStore.has(state)) {
    return res.redirect(`${frontendBase}/pre-assessment/connections?error=invalid_state`);
  }

  const stateData = oauthStateStore.get(state)!;
  oauthStateStore.delete(state);

  if (Date.now() > stateData.expiresAt) {
    return res.redirect(`${frontendBase}/pre-assessment/connections?error=state_expired`);
  }

  if (error) {
    const reason =
      error === "access_denied"
        ? "Admin consent was declined. A global administrator must approve the permissions."
        : error_description ?? error;
    return res.redirect(
      `${frontendBase}/pre-assessment/connections?error=${encodeURIComponent(reason)}`
    );
  }

  if (!tenant) {
    return res.redirect(`${frontendBase}/pre-assessment/connections?error=missing_tenant`);
  }

  let tenantName: string = tenant;
  let primaryDomain: string | null = null;

  try {
    const token = await getGraphTokenForTenant(tenant);
    const orgResp = await graphGet<{
      value: { displayName?: string; verifiedDomains?: { name: string; isDefault: boolean }[] }[];
    }>(token, "/organization", { $top: "1" });
    const msOrg = orgResp.value?.[0];
    if (msOrg?.displayName) tenantName = msOrg.displayName;
    primaryDomain =
      msOrg?.verifiedDomains?.find((d) => d.isDefault)?.name ??
      msOrg?.verifiedDomains?.[0]?.name ??
      null;
  } catch {
    /* best-effort — proceed without display name */
  }

  try {
    const existing = await db
      .select({ id: tenantConnectionsTable.id })
      .from(tenantConnectionsTable)
      .where(
        and(
          eq(tenantConnectionsTable.organizationId, stateData.orgId),
          eq(tenantConnectionsTable.microsoftTenantId, tenant)
        )
      );

    if (existing.length > 0) {
      await db
        .update(tenantConnectionsTable)
        .set({
          tenantName,
          primaryDomain,
          connectionStatus: "connected",
          connectedBy: stateData.userEmail || null,
          connectedAt: new Date(),
          authMode: "delegated",
          clientId: null,
          encryptedClientSecret: null,
          lastFailedReason: null,
          updatedAt: new Date(),
        })
        .where(eq(tenantConnectionsTable.id, existing[0].id));
    } else {
      await db.insert(tenantConnectionsTable).values({
        id: randomUUID(),
        organizationId: stateData.orgId,
        tenantName,
        microsoftTenantId: tenant,
        primaryDomain,
        authMode: "delegated",
        clientId: null,
        encryptedClientSecret: null,
        connectionStatus: "connected",
        connectedBy: stateData.userEmail || null,
        connectedAt: new Date(),
        updatedAt: new Date(),
      });
    }
  } catch (err) {
    return res.redirect(
      `${frontendBase}/pre-assessment/connections?error=${encodeURIComponent("Failed to save connection")}`
    );
  }

  res.redirect(`${frontendBase}/pre-assessment/connections?connected=true&tenantName=${encodeURIComponent(tenantName)}`);
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

    const result = await testTenantConnection(conn.microsoftTenantId);

    await db
      .update(tenantConnectionsTable)
      .set({
        connectionStatus: result.success ? "connected" : "error",
        lastFailedReason: result.success ? null : (result.error ?? null),
        updatedAt: new Date(),
      })
      .where(eq(tenantConnectionsTable.id, req.params.id));

    res.json(result);
  } catch (err) {
    req.log.error(err, "pa: test connection failed");
    res.status(500).json({ error: "Connection test failed" });
  }
});

router.delete("/connections/:id", requireAuth, requireOrg, async (req, res) => {
  const user = req.authUser;
  if (user?.role !== "admin" && user?.role !== "compliance_manager") {
    return res.status(403).json({ error: "Only admins and compliance managers can disconnect tenants" });
  }

  try {
    const [existing] = await db
      .select({ id: tenantConnectionsTable.id, microsoftTenantId: tenantConnectionsTable.microsoftTenantId })
      .from(tenantConnectionsTable)
      .where(
        and(
          eq(tenantConnectionsTable.id, req.params.id),
          eq(tenantConnectionsTable.organizationId, req.orgId!)
        )
      );
    if (!existing) return res.status(404).json({ error: "Connection not found" });

    invalidateTokenCacheForTenant(existing.microsoftTenantId);

    await db
      .delete(tenantConnectionsTable)
      .where(eq(tenantConnectionsTable.id, req.params.id));

    res.json({ success: true });
  } catch (err) {
    req.log.error(err, "pa: remove tenant failed");
    res.status(500).json({ error: "Failed to remove tenant connection" });
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
  const user = req.authUser;
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
    .select({ id: tenantConnectionsTable.id, connectionStatus: tenantConnectionsTable.connectionStatus })
    .from(tenantConnectionsTable)
    .where(
      and(
        eq(tenantConnectionsTable.id, tenantConnectionId),
        eq(tenantConnectionsTable.organizationId, req.orgId!)
      )
    );
  if (!conn) return res.status(404).json({ error: "Tenant connection not found" });
  if (conn.connectionStatus === "disconnected") {
    return res.status(400).json({ error: "Tenant is disconnected. Reconnect before running a scan." });
  }

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
  const user = req.authUser;
  if (user?.role !== "admin" && user?.role !== "compliance_manager") {
    return res.status(403).json({ error: "Insufficient permissions" });
  }

  const { action, reason } = req.body as { action: "approve" | "reject" | "acknowledge" | "dismiss"; reason?: string };
  if (!["approve", "reject", "acknowledge", "dismiss"].includes(action)) {
    return res.status(400).json({ error: "action must be approve, reject, acknowledge, or dismiss" });
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
        .set({ approvedStatus: "approved", approvedBy: user?.email ?? null, approvedAt: new Date(), rejectedAt: null, rejectedBy: null, updatedAt: new Date() })
        .where(eq(paFindingsTable.id, req.params.id));
    } else if (action === "reject" || action === "dismiss") {
      await db
        .update(paFindingsTable)
        .set({ approvedStatus: "rejected", rejectedBy: user?.email ?? null, rejectedAt: new Date(), approvedAt: null, approvedBy: null, updatedAt: new Date() })
        .where(eq(paFindingsTable.id, req.params.id));
    } else {
      await db
        .update(paFindingsTable)
        .set({ approvedStatus: "pending_review", updatedAt: new Date() })
        .where(eq(paFindingsTable.id, req.params.id));
    }

    const [updated] = await db.select().from(paFindingsTable).where(eq(paFindingsTable.id, req.params.id));
    res.json(updated);
  } catch (err) {
    req.log.error(err, "pa: patch finding failed");
    res.status(500).json({ error: "Failed to update finding" });
  }
});

router.patch("/evidence-records/:id", requireAuth, requireOrg, async (req, res) => {
  const user = req.authUser;
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

    await db.update(paEvidenceRecordsTable).set(updates).where(eq(paEvidenceRecordsTable.id, req.params.id));
    const [updated] = await db.select().from(paEvidenceRecordsTable).where(eq(paEvidenceRecordsTable.id, req.params.id));
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
    const [updated] = await db.select().from(paEvidenceRequestsTable).where(eq(paEvidenceRequestsTable.id, req.params.id));
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
    const [updated] = await db.select().from(paRoadmapActionsTable).where(eq(paRoadmapActionsTable.id, req.params.id));
    res.json(updated);
  } catch (err) {
    req.log.error(err, "pa: patch roadmap action failed");
    res.status(500).json({ error: "Failed to update roadmap action" });
  }
});

export default router;
