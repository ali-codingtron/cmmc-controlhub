/**
 * Roadmap profile resolver.
 *
 * Each organization is assigned a roadmap profile based on its compliance packages.
 * Profile rules (first match wins):
 *   CMMC_L2_* or NIST_800_171_* → CMMC_L2_R2
 *   CMMC_L1_* or FAR_52_204_21  → CMMC_L1_V2_13
 *   anything else                → null (no roadmap)
 */
import {
  db,
  organizationPackagesTable,
  compliancePackagesTable,
} from "@workspace/db";
import { eq, and } from "drizzle-orm";

export const PROFILE_METADATA: Record<
  string,
  {
    profileKey: string;
    profileName: string;
    title: string;
    subtitle: string;
    phases: Array<{
      phase: number;
      name: string;
      icon: string;
      description: string;
    }>;
  }
> = {
  CMMC_L2_R2: {
    profileKey: "CMMC_L2_R2",
    profileName: "CMMC Level 2",
    title: "CMMC Level 2 Implementation Roadmap",
    subtitle:
      "Implement, document, and validate the 110 NIST SP 800-171 practices required for CMMC Level 2 certification.",
    phases: [
      {
        phase: 1,
        name: "Foundation",
        icon: "🏗️",
        description:
          "Defines your system boundary, asset inventory, and core security policies. All other phases build on this.",
      },
      {
        phase: 2,
        name: "Identity & Access",
        icon: "🔐",
        description:
          "Establishes MFA, privileged access controls, user authentication, and account lifecycle management.",
      },
      {
        phase: 3,
        name: "Endpoint & System",
        icon: "💻",
        description:
          "Deploys device compliance, encryption, patching, and endpoint protection across your environment.",
      },
      {
        phase: 4,
        name: "Logging & Monitoring",
        icon: "📊",
        description:
          "Implements audit logging, SIEM integration, and continuous monitoring to detect and respond to threats.",
      },
      {
        phase: 5,
        name: "Risk & Remediation",
        icon: "🛡️",
        description:
          "Identifies vulnerabilities, establishes incident response capabilities, and maintains your POA&M register.",
      },
      {
        phase: 6,
        name: "Audit Preparation",
        icon: "📋",
        description:
          "Organizes all evidence, validates control coverage, and prepares your formal assessment package.",
      },
    ],
  },
  CMMC_L1_V2_13: {
    profileKey: "CMMC_L1_V2_13",
    profileName: "CMMC Level 1",
    title: "CMMC Level 1 Implementation Roadmap",
    subtitle:
      "Implement and validate the 17 basic safeguarding requirements for Federal Contract Information (FCI) and complete your annual self-assessment.",
    phases: [
      {
        phase: 1,
        name: "Scope and Inventory",
        icon: "🗺️",
        description:
          "Identify where FCI is processed, stored, or transmitted and document all systems, users, and devices in scope.",
      },
      {
        phase: 2,
        name: "Logical Access and Authentication",
        icon: "🔐",
        description:
          "Restrict FCI access to authorized users, implement unique identification, and enforce authentication on all FCI systems.",
      },
      {
        phase: 3,
        name: "Physical and Media Protection",
        icon: "🔒",
        description:
          "Protect physical access to FCI areas and equipment, sanitize media before disposal, and control visitor access.",
      },
      {
        phase: 4,
        name: "Boundary and Public-System Protection",
        icon: "🌐",
        description:
          "Monitor and protect system boundaries; isolate public-facing components from internal FCI systems.",
      },
      {
        phase: 5,
        name: "System Integrity",
        icon: "🛡️",
        description:
          "Patch system flaws promptly, deploy anti-malware protection, and scan for threats both periodically and in real time.",
      },
      {
        phase: 6,
        name: "Self-Assessment and Affirmation",
        icon: "📋",
        description:
          "Verify every Level 1 requirement is met, collect evidence, and submit your annual self-assessment and affirmation to SPRS.",
      },
    ],
  },
};

/**
 * Pure function: derive profile key from a list of package keys.
 * Exported for unit testing and reuse without a DB round-trip.
 */
export function resolveProfileKeyFromPackages(
  packageKeys: string[]
): string | null {
  const hasL2 = packageKeys.some(
    (k) => k.startsWith("CMMC_L2") || k.startsWith("NIST_800_171")
  );
  if (hasL2) return "CMMC_L2_R2";

  const hasL1 = packageKeys.some(
    (k) => k.startsWith("CMMC_L1") || k === "FAR_52_204_21"
  );
  if (hasL1) return "CMMC_L1_V2_13";

  return null;
}

/**
 * Async version that queries the DB.
 */
export async function resolveOrgRoadmapProfile(
  orgId: string
): Promise<string | null> {
  const rows = await db
    .select({ packageKey: compliancePackagesTable.packageKey })
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
  return resolveProfileKeyFromPackages(rows.map((r) => r.packageKey));
}
