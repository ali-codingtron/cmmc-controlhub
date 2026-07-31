import { Router } from "express";
import { db, organizationsTable, organizationFeaturesTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { z } from "zod";
import { requireAuth } from "../lib/auth";
import { requireOrg } from "../middleware/org";
import { logAudit } from "../lib/audit";
import { randomUUID } from "crypto";

const router = Router();

// GET /organizations/:id/features — list features for an org
// Missing record = enabled (default behavior)
router.get(
  "/organizations/:id/features",
  requireAuth,
  requireOrg,
  async (req, res) => {
    const orgId = req.params["id"] as string;
    // Any org member can view features for their org
    if (req.orgId !== orgId && req.authUser?.role !== "admin") {
      res.status(403).json({ error: "Access denied" });
      return;
    }

    const features = await db
      .select()
      .from(organizationFeaturesTable)
      .where(eq(organizationFeaturesTable.organizationId, orgId));

    // Default IMPLEMENTATION_ROADMAP to enabled if no record exists
    const featureMap: Record<string, {
      featureKey: string;
      enabled: boolean;
      initialized: boolean;
      enabledAt: Date | null;
      disabledAt: Date | null;
      changeReason: string | null;
    }> = {};

    for (const f of features) {
      featureMap[f.featureKey] = {
        featureKey: f.featureKey,
        enabled: f.enabled,
        initialized: f.initialized,
        enabledAt: f.enabledAt,
        disabledAt: f.disabledAt,
        changeReason: f.changeReason,
      };
    }

    // Ensure both features always appear with default enabled
    const featureDefaults = ["IMPLEMENTATION_ROADMAP", "PRE_ASSESSMENT"] as const;
    for (const key of featureDefaults) {
      if (!featureMap[key]) {
        featureMap[key] = {
          featureKey: key,
          enabled: true,
          initialized: false,
          enabledAt: null,
          disabledAt: null,
          changeReason: null,
        };
      }
    }

    res.json(Object.values(featureMap));
  }
);

// PATCH /organizations/:id/features/:key — enable or disable a feature
// IMPLEMENTATION_ROADMAP: global admin only
// PRE_ASSESSMENT: global admin OR org admin
const patchFeatureSchema = z.object({
  enabled: z.boolean(),
  changeReason: z.string().optional().default(""),
});

const VALID_FEATURE_KEYS = ["IMPLEMENTATION_ROADMAP", "PRE_ASSESSMENT"] as const;
type FeatureKey = (typeof VALID_FEATURE_KEYS)[number];

router.patch(
  "/organizations/:id/features/:key",
  requireAuth,
  requireOrg,
  async (req, res) => {
    const orgId = req.params["id"] as string;
    const featureKey = req.params["key"] as FeatureKey;

    if (!VALID_FEATURE_KEYS.includes(featureKey as FeatureKey)) {
      res.status(400).json({ error: "Unknown feature key" });
      return;
    }

    // Both features require global admin
    const isGlobalAdmin = req.authUser?.role === "admin";
    if (!isGlobalAdmin) {
      res.status(403).json({ error: "Only global administrators can toggle modules" });
      return;
    }

    const parsed = patchFeatureSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid request", details: parsed.error.flatten() });
      return;
    }
    const { enabled, changeReason } = parsed.data;

    // Check org exists
    const org = await db
      .select({ id: organizationsTable.id })
      .from(organizationsTable)
      .where(eq(organizationsTable.id, orgId))
      .limit(1);
    if (org.length === 0) {
      res.status(404).json({ error: "Organization not found" });
      return;
    }

    const userId = req.authUser!.id;
    const now = new Date();

    // Upsert the feature record
    const existing = await db
      .select()
      .from(organizationFeaturesTable)
      .where(
        and(
          eq(organizationFeaturesTable.organizationId, orgId),
          eq(organizationFeaturesTable.featureKey, featureKey)
        )
      )
      .limit(1);

    if (existing.length === 0) {
      await db.insert(organizationFeaturesTable).values({
        id: randomUUID(),
        organizationId: orgId,
        featureKey,
        enabled,
        initialized: false,
        enabledBy: enabled ? userId : null,
        enabledAt: enabled ? now : null,
        disabledBy: enabled ? null : userId,
        disabledAt: enabled ? null : now,
        changeReason,
        createdAt: now,
        updatedAt: now,
      });
    } else {
      await db
        .update(organizationFeaturesTable)
        .set({
          enabled,
          enabledBy: enabled ? userId : existing[0]!.enabledBy,
          enabledAt: enabled ? now : existing[0]!.enabledAt,
          disabledBy: enabled ? existing[0]!.disabledBy : userId,
          disabledAt: enabled ? existing[0]!.disabledAt : now,
          changeReason,
          updatedAt: now,
        })
        .where(
          and(
            eq(organizationFeaturesTable.organizationId, orgId),
            eq(organizationFeaturesTable.featureKey, featureKey)
          )
        );
    }

    // Audit log (best-effort)
    try {
      await logAudit(req, "updated", "organization_feature", orgId, {
        entityLabel: featureKey,
        newValue: { featureKey, enabled, changeReason },
      });
    } catch { /* audit logging is best-effort */ }

    res.json({ ok: true, enabled });
  }
);

export default router;
