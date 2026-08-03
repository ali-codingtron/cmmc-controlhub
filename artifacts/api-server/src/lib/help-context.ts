import { Request } from "express";
import { db, organizationsTable, organizationPackagesTable, compliancePackagesTable, organizationFeaturesTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { getOrgPermissions } from "./permissions";

// ── Display label map ──────────────────────────────────────────────────────────

const ROLE_DISPLAY_LABELS: Record<string, string> = {
  admin: "Global Admin",
  global_admin: "Global Admin",
  org_admin: "Organization Admin",
  compliance_manager: "Compliance Manager",
  it_contributor: "IT Contributor",
  reviewer: "Reviewer",
  executive_viewer: "Executive Viewer",
  assessor: "Assessor Read-Only",
  demo_viewer: "Demo Viewer",
};

// ── Return type ────────────────────────────────────────────────────────────────

export interface HelpContext {
  platformRole: "global_admin" | "user";
  organizationRole: string | null;
  effectiveRole: string;
  effectiveCapabilities: string[];
  selectedOrganizationId: string | null;
  selectedOrganizationName: string | null;
  activePackageKeys: string[];
  activeFrameworkVersions: string[];
  enabledModules: string[];
  organizationLevel: "L1" | "L2" | null;
  isDemo: boolean;
  isTest: boolean;
}

// ── Resolve context ────────────────────────────────────────────────────────────

export async function resolveHelpContext(req: Request): Promise<HelpContext> {
  const authUser = req.authUser;
  const isGlobalAdmin = authUser?.role === "admin";

  const platformRole: "global_admin" | "user" = isGlobalAdmin ? "global_admin" : "user";

  // Org ID: prefer req.orgId (set by requireOrg middleware), fallback to header
  const orgId =
    req.orgId ??
    (req.headers["x-organization-id"] as string | undefined) ??
    null;

  // Org role: prefer req.orgRole, fallback to authUser.role for non-org requests
  const orgRole: string | null = isGlobalAdmin
    ? "admin"
    : (req.orgRole ?? null);

  // Effective role for display
  const effectiveRole =
    ROLE_DISPLAY_LABELS[orgRole ?? ""] ??
    ROLE_DISPLAY_LABELS[authUser?.role ?? ""] ??
    "User";

  // Capabilities from org role
  const effectiveCapabilities = getOrgPermissions(orgRole) as string[];

  // Fetch org name
  let selectedOrganizationName: string | null = null;
  if (orgId) {
    const [org] = await db
      .select({ name: organizationsTable.name })
      .from(organizationsTable)
      .where(eq(organizationsTable.id, orgId))
      .limit(1);
    selectedOrganizationName = org?.name ?? null;
  }

  // Fetch active package keys for the org
  let activePackageKeys: string[] = [];
  let activeFrameworkVersions: string[] = [];
  if (orgId) {
    const pkgs = await db
      .select({
        packageKey: compliancePackagesTable.packageKey,
        version: compliancePackagesTable.version,
      })
      .from(organizationPackagesTable)
      .innerJoin(
        compliancePackagesTable,
        eq(organizationPackagesTable.packageId, compliancePackagesTable.id)
      )
      .where(
        and(
          eq(organizationPackagesTable.organizationId, orgId),
          eq(organizationPackagesTable.isActive, true)
        )
      );

    activePackageKeys = pkgs.map((p) => p.packageKey);
    activeFrameworkVersions = pkgs
      .filter((p) => p.version != null)
      .map((p) => p.version as string);
  }

  // Derive CMMC level from package keys
  let organizationLevel: "L1" | "L2" | null = null;
  for (const key of activePackageKeys) {
    const upper = key.toUpperCase();
    if (upper.includes("L2") || upper.includes("CMMC_L2")) {
      organizationLevel = "L2";
      break;
    }
    if (upper.includes("L1") || upper.includes("CMMC_L1") || upper.includes("FAR")) {
      organizationLevel = "L1";
    }
  }

  // Fetch enabled modules for the org
  let enabledModules: string[] = [];
  if (orgId) {
    const features = await db
      .select({ featureKey: organizationFeaturesTable.featureKey, enabled: organizationFeaturesTable.enabled })
      .from(organizationFeaturesTable)
      .where(
        and(
          eq(organizationFeaturesTable.organizationId, orgId),
          eq(organizationFeaturesTable.enabled, true)
        )
      );
    enabledModules = features.map((f) => f.featureKey);
  }

  // Determine demo / test flags from org name (simple heuristic)
  const isDemo = (selectedOrganizationName ?? "").toLowerCase().includes("demo");
  const isTest = (selectedOrganizationName ?? "").toLowerCase().includes("test");

  return {
    platformRole,
    organizationRole: isGlobalAdmin ? null : (req.orgRole ?? null),
    effectiveRole,
    effectiveCapabilities,
    selectedOrganizationId: orgId,
    selectedOrganizationName,
    activePackageKeys,
    activeFrameworkVersions,
    enabledModules,
    organizationLevel,
    isDemo,
    isTest,
  };
}
