/**
 * Helpers for CMMC Level 1 Annual Self-Assessment module.
 *
 * Determines whether the L1 Annual Assessment feature is active for an org
 * based on whether the org has an active CMMC L1 self-assessment package.
 */

import { db, organizationPackagesTable } from "@workspace/db";
import { and, eq } from "drizzle-orm";

/**
 * Returns true if the L1 Annual Assessment module is active for the given org.
 *
 * Active is defined as: the org has an active assignment to the CMMC L1
 * self-assessment package ("pkg-cmmc-l1-self").
 */
export async function isL1AssessmentActive(orgId: string): Promise<boolean> {
  const rows = await db
    .select({ id: organizationPackagesTable.id })
    .from(organizationPackagesTable)
    .where(
      and(
        eq(organizationPackagesTable.organizationId, orgId),
        eq(organizationPackagesTable.packageId, "pkg-cmmc-l1-self"),
        eq(organizationPackagesTable.isActive, true)
      )
    )
    .limit(1);

  return rows.length > 0;
}
