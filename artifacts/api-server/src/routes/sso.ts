import { Router } from "express";
import { db, ssoConfigsTable, organizationsTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { requireAuth } from "../lib/auth";
import { encryptSecret, decryptSecret } from "../lib/mfa";
import { randomUUID } from "crypto";

const router = Router();

function requireOrgAdmin(req: any, res: any, next: any) {
  const role = req.authUser?.role;
  if (role !== "admin" && role !== "compliance_manager") {
    res.status(403).json({ error: "Org admin access required" });
    return;
  }
  next();
}

function requireOrg(req: any, res: any, next: any) {
  const orgId = req.headers["x-organization-id"] as string | undefined;
  if (!orgId) {
    res.status(400).json({ error: "X-Organization-ID header required" });
    return;
  }
  req.orgId = orgId;
  next();
}

// GET /api/sso/config — get the SSO config for the current org (or empty)
router.get("/sso/config", requireAuth, requireOrg, requireOrgAdmin, async (req, res) => {
  const configs = await db
    .select({
      id: ssoConfigsTable.id,
      organizationId: ssoConfigsTable.organizationId,
      provider: ssoConfigsTable.provider,
      clientId: ssoConfigsTable.clientId,
      tenantId: ssoConfigsTable.tenantId,
      emailDomain: ssoConfigsTable.emailDomain,
      enabled: ssoConfigsTable.enabled,
      createdAt: ssoConfigsTable.createdAt,
      updatedAt: ssoConfigsTable.updatedAt,
    })
    .from(ssoConfigsTable)
    .where(eq(ssoConfigsTable.organizationId, req.orgId as string));

  res.json(configs[0] ?? null);
});

// POST /api/sso/config — create or update SSO config for the current org
router.post("/sso/config", requireAuth, requireOrg, requireOrgAdmin, async (req, res) => {
  const { clientId, tenantId, clientSecret, emailDomain, enabled } = req.body as {
    clientId?: string;
    tenantId?: string;
    clientSecret?: string;
    emailDomain?: string;
    enabled?: boolean;
  };

  if (!clientId || !tenantId || !clientSecret) {
    res.status(400).json({ error: "clientId, tenantId, and clientSecret are required" });
    return;
  }

  if (emailDomain && !/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(emailDomain.trim())) {
    res.status(400).json({ error: "emailDomain must be a valid domain (e.g. contoso.com)" });
    return;
  }

  const orgId = req.orgId as string;

  // Check org exists
  const [org] = await db
    .select({ id: organizationsTable.id })
    .from(organizationsTable)
    .where(eq(organizationsTable.id, orgId))
    .limit(1);
  if (!org) {
    res.status(404).json({ error: "Organization not found" });
    return;
  }

  // Check for existing config
  const [existing] = await db
    .select({ id: ssoConfigsTable.id })
    .from(ssoConfigsTable)
    .where(eq(ssoConfigsTable.organizationId, orgId))
    .limit(1);

  const secretEnc = encryptSecret(clientSecret);
  const now = new Date();
  const domain = emailDomain ? emailDomain.toLowerCase().trim() : null;

  if (existing) {
    // Update existing
    const [updated] = await db
      .update(ssoConfigsTable)
      .set({
        clientId: clientId.trim(),
        tenantId: tenantId.trim(),
        clientSecretEnc: secretEnc,
        emailDomain: domain,
        enabled: enabled ?? true,
        updatedAt: now,
      })
      .where(eq(ssoConfigsTable.id, existing.id))
      .returning({
        id: ssoConfigsTable.id,
        organizationId: ssoConfigsTable.organizationId,
        provider: ssoConfigsTable.provider,
        clientId: ssoConfigsTable.clientId,
        tenantId: ssoConfigsTable.tenantId,
        emailDomain: ssoConfigsTable.emailDomain,
        enabled: ssoConfigsTable.enabled,
        createdAt: ssoConfigsTable.createdAt,
        updatedAt: ssoConfigsTable.updatedAt,
      });
    res.json(updated);
    return;
  }

  // Create new
  const [created] = await db
    .insert(ssoConfigsTable)
    .values({
      id: randomUUID(),
      organizationId: orgId,
      provider: "entra_id",
      clientId: clientId.trim(),
      tenantId: tenantId.trim(),
      clientSecretEnc: secretEnc,
      emailDomain: domain,
      enabled: enabled ?? true,
      createdAt: now,
      updatedAt: now,
    })
    .returning({
      id: ssoConfigsTable.id,
      organizationId: ssoConfigsTable.organizationId,
      provider: ssoConfigsTable.provider,
      clientId: ssoConfigsTable.clientId,
      tenantId: ssoConfigsTable.tenantId,
      emailDomain: ssoConfigsTable.emailDomain,
      enabled: ssoConfigsTable.enabled,
      createdAt: ssoConfigsTable.createdAt,
      updatedAt: ssoConfigsTable.updatedAt,
    });
  res.status(201).json(created);
});

// PATCH /api/sso/config/:id — toggle enabled or update fields without rotating secret
router.patch("/sso/config/:id", requireAuth, requireOrg, requireOrgAdmin, async (req, res) => {
  const { id } = req.params;
  const orgId = req.orgId as string;

  const [existing] = await db
    .select({ id: ssoConfigsTable.id, organizationId: ssoConfigsTable.organizationId })
    .from(ssoConfigsTable)
    .where(and(eq(ssoConfigsTable.id, id), eq(ssoConfigsTable.organizationId, orgId)))
    .limit(1);

  if (!existing) {
    res.status(404).json({ error: "SSO config not found" });
    return;
  }

  const updates: Record<string, unknown> = { updatedAt: new Date() };
  if (req.body.enabled !== undefined) updates.enabled = Boolean(req.body.enabled);
  if (req.body.emailDomain !== undefined) updates.emailDomain = req.body.emailDomain ? req.body.emailDomain.toLowerCase().trim() : null;
  if (req.body.clientId) updates.clientId = (req.body.clientId as string).trim();
  if (req.body.tenantId) updates.tenantId = (req.body.tenantId as string).trim();
  if (req.body.clientSecret) updates.clientSecretEnc = encryptSecret(req.body.clientSecret as string);

  const [updated] = await db
    .update(ssoConfigsTable)
    .set(updates)
    .where(eq(ssoConfigsTable.id, id))
    .returning({
      id: ssoConfigsTable.id,
      organizationId: ssoConfigsTable.organizationId,
      provider: ssoConfigsTable.provider,
      clientId: ssoConfigsTable.clientId,
      tenantId: ssoConfigsTable.tenantId,
      emailDomain: ssoConfigsTable.emailDomain,
      enabled: ssoConfigsTable.enabled,
      createdAt: ssoConfigsTable.createdAt,
      updatedAt: ssoConfigsTable.updatedAt,
    });

  res.json(updated);
});

// DELETE /api/sso/config/:id — remove SSO config
router.delete("/sso/config/:id", requireAuth, requireOrg, requireOrgAdmin, async (req, res) => {
  const { id } = req.params;
  const orgId = req.orgId as string;

  const [existing] = await db
    .select({ id: ssoConfigsTable.id })
    .from(ssoConfigsTable)
    .where(and(eq(ssoConfigsTable.id, id), eq(ssoConfigsTable.organizationId, orgId)))
    .limit(1);

  if (!existing) {
    res.status(404).json({ error: "SSO config not found" });
    return;
  }

  await db.delete(ssoConfigsTable).where(eq(ssoConfigsTable.id, id));
  res.status(204).end();
});

// GET /api/sso/check?domain=<domain> — public: check if SSO is configured for a given email domain
router.get("/sso/check", async (req, res) => {
  const domain = (req.query.domain as string | undefined)?.toLowerCase().trim();
  if (!domain) {
    res.status(400).json({ error: "domain query param required" });
    return;
  }

  const [config] = await db
    .select({
      organizationId: ssoConfigsTable.organizationId,
      provider: ssoConfigsTable.provider,
    })
    .from(ssoConfigsTable)
    .where(and(eq(ssoConfigsTable.emailDomain, domain), eq(ssoConfigsTable.enabled, true)))
    .limit(1);

  if (!config) {
    res.json({ available: false });
    return;
  }

  res.json({ available: true, provider: config.provider });
});

export default router;
