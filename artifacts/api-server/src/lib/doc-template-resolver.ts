/**
 * Document Template Resolver
 *
 * Resolves the set of documentation templates available to an organization based
 * on its active compliance package assignments.  Templates are surfaced only when
 * at least one of their `doc_template_packages` rows matches a package_key that
 * the org has in `organization_packages`.
 *
 * Falls back to empty — an L1-only org never receives L2/CUI templates.
 */

import { db } from "@workspace/db";
import {
  documentTemplatesTable,
  docTemplatePackagesTable,
  docTemplateControlMapsTable,
  organizationPackagesTable,
  compliancePackagesTable,
  controlsTable,
} from "@workspace/db";
import { eq, inArray, and, isNotNull } from "drizzle-orm";

// ── Types ─────────────────────────────────────────────────────────────────────

export type ApplicabilityLevel =
  | "EXACT"
  | "SHARED"
  | "OPTIONAL"
  | "REFERENCE_ONLY";

export type InformationType = "FCI" | "CUI" | "BOTH" | "NOT_APPLICABLE";

export interface ResolvedTemplate {
  id: string;
  sourceTemplateId: string | null;
  title: string;
  docType: string;
  family: string | null;
  artifactTypeLabel: string | null;
  domainAbbr: string | null;
  purpose: string | null;
  informationType: InformationType | null;
  templateFamilyKey: string | null;
  /** Package keys from doc_template_packages that matched org packages */
  matchedPackageKeys: string[];
  /** All package keys tagged on this template */
  allPackageKeys: string[];
  /** Best applicability across matched rows */
  bestApplicability: ApplicabilityLevel | null;
  /** Number of L1 control mappings */
  l1ControlCount: number;
  /** Number of L2 control mappings */
  l2ControlCount: number;
}

export interface ResolverResult {
  organizationId: string;
  activePackageKeys: string[];
  templates: ResolvedTemplate[];
  /** Count by category / docType */
  countByDocType: Record<string, number>;
  /** Count by information type */
  countByInfoType: Record<string, number>;
  total: number;
}

// Applicability priority for "best" selection
const APPLICABILITY_ORDER: Record<ApplicabilityLevel, number> = {
  EXACT: 4,
  SHARED: 3,
  OPTIONAL: 2,
  REFERENCE_ONLY: 1,
};

// ── Main resolver ─────────────────────────────────────────────────────────────

export async function resolveAvailableDocumentationTemplates(
  organizationId: string
): Promise<ResolverResult> {
  // 1. Fetch org's active compliance package keys
  const orgPackageRows = await db
    .select({
      packageKey: compliancePackagesTable.packageKey,
    })
    .from(organizationPackagesTable)
    .innerJoin(
      compliancePackagesTable,
      eq(organizationPackagesTable.packageId, compliancePackagesTable.id)
    )
    .where(
      and(
        eq(organizationPackagesTable.organizationId, organizationId),
        eq(organizationPackagesTable.isActive, true)
      )
    );

  const activePackageKeys = orgPackageRows.map((r) => r.packageKey);

  if (activePackageKeys.length === 0) {
    return {
      organizationId,
      activePackageKeys: [],
      templates: [],
      countByDocType: {},
      countByInfoType: {},
      total: 0,
    };
  }

  // 2. Fetch all doc_template_packages rows for active package keys
  const packageRows = await db
    .select({
      templateId: docTemplatePackagesTable.templateId,
      packageKey: docTemplatePackagesTable.packageKey,
      applicability: docTemplatePackagesTable.applicability,
      informationType: docTemplatePackagesTable.informationType,
    })
    .from(docTemplatePackagesTable)
    .where(inArray(docTemplatePackagesTable.packageKey, activePackageKeys));

  if (packageRows.length === 0) {
    return {
      organizationId,
      activePackageKeys,
      templates: [],
      countByDocType: {},
      countByInfoType: {},
      total: 0,
    };
  }

  // Group by templateId
  const templatePackageMap = new Map<
    string,
    { packageKey: string; applicability: string; informationType: string }[]
  >();
  for (const row of packageRows) {
    if (!templatePackageMap.has(row.templateId)) {
      templatePackageMap.set(row.templateId, []);
    }
    templatePackageMap.get(row.templateId)!.push(row);
  }

  const templateIds = [...templatePackageMap.keys()];

  // 3. Fetch template metadata
  const templates = await db
    .select({
      id: documentTemplatesTable.id,
      sourceTemplateId: documentTemplatesTable.sourceTemplateId,
      title: documentTemplatesTable.title,
      docType: documentTemplatesTable.docType,
      family: documentTemplatesTable.family,
      artifactTypeLabel: documentTemplatesTable.artifactTypeLabel,
      domainAbbr: documentTemplatesTable.domainAbbr,
      purpose: documentTemplatesTable.purpose,
      informationType: documentTemplatesTable.informationType,
      templateFamilyKey: documentTemplatesTable.templateFamilyKey,
      isActive: documentTemplatesTable.isActive,
    })
    .from(documentTemplatesTable)
    .where(
      and(
        inArray(documentTemplatesTable.id, templateIds),
        eq(documentTemplatesTable.isActive, true)
      )
    );

  // 4. Fetch control map counts per template (L1 vs L2)
  const controlMaps = await db
    .select({
      templateId: docTemplateControlMapsTable.templateId,
      controlLevel: controlsTable.level,
    })
    .from(docTemplateControlMapsTable)
    .leftJoin(
      controlsTable,
      eq(docTemplateControlMapsTable.controlId, controlsTable.id)
    )
    .where(
      and(
        inArray(docTemplateControlMapsTable.templateId, templateIds),
        isNotNull(docTemplateControlMapsTable.controlId)
      )
    );

  const controlCountMap = new Map<
    string,
    { l1: number; l2: number }
  >();
  for (const cm of controlMaps) {
    if (!controlCountMap.has(cm.templateId)) {
      controlCountMap.set(cm.templateId, { l1: 0, l2: 0 });
    }
    const counts = controlCountMap.get(cm.templateId)!;
    if (cm.controlLevel === "L1") counts.l1++;
    else if (cm.controlLevel === "L2") counts.l2++;
  }

  // 5. Build result
  const resolved: ResolvedTemplate[] = templates.map((t) => {
    const pkgRows = templatePackageMap.get(t.id) ?? [];
    const matchedRows = pkgRows.filter((r) =>
      activePackageKeys.includes(r.packageKey)
    );

    const bestApplicability = matchedRows.reduce<ApplicabilityLevel | null>(
      (best, row) => {
        const level = row.applicability as ApplicabilityLevel;
        if (!best) return level;
        return (APPLICABILITY_ORDER[level] ?? 0) > (APPLICABILITY_ORDER[best] ?? 0)
          ? level
          : best;
      },
      null
    );

    // informationType: prefer matched rows, fall back to template column
    const matchedInfoType =
      matchedRows.find((r) => r.informationType)?.informationType ??
      t.informationType;

    const counts = controlCountMap.get(t.id) ?? { l1: 0, l2: 0 };

    return {
      id: t.id,
      sourceTemplateId: t.sourceTemplateId,
      title: t.title,
      docType: t.docType,
      family: t.family,
      artifactTypeLabel: t.artifactTypeLabel,
      domainAbbr: t.domainAbbr,
      purpose: t.purpose,
      informationType: matchedInfoType as InformationType | null,
      templateFamilyKey: t.templateFamilyKey,
      matchedPackageKeys: matchedRows.map((r) => r.packageKey),
      allPackageKeys: pkgRows.map((r) => r.packageKey),
      bestApplicability,
      l1ControlCount: counts.l1,
      l2ControlCount: counts.l2,
    };
  });

  // Sort: EXACT first, then SHARED, then by title
  resolved.sort((a, b) => {
    const aOrder = APPLICABILITY_ORDER[a.bestApplicability ?? "REFERENCE_ONLY"] ?? 0;
    const bOrder = APPLICABILITY_ORDER[b.bestApplicability ?? "REFERENCE_ONLY"] ?? 0;
    if (bOrder !== aOrder) return bOrder - aOrder;
    return a.title.localeCompare(b.title);
  });

  // 6. Counts
  const countByDocType: Record<string, number> = {};
  const countByInfoType: Record<string, number> = {};
  for (const t of resolved) {
    countByDocType[t.docType] = (countByDocType[t.docType] ?? 0) + 1;
    const it = t.informationType ?? "UNKNOWN";
    countByInfoType[it] = (countByInfoType[it] ?? 0) + 1;
  }

  return {
    organizationId,
    activePackageKeys,
    templates: resolved,
    countByDocType,
    countByInfoType,
    total: resolved.length,
  };
}
