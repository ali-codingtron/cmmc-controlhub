/**
 * Read-only diagnostic for a user's platform role and organization access.
 *
 * Reports duplicate / orphaned membership rows and the exact numbers the Users &
 * Roles page derives its summary from. Makes NO writes of any kind.
 *
 *   pnpm --filter @workspace/scripts diagnose:user-access --email=sysadmin@controlhub.com
 *   pnpm --filter @workspace/scripts diagnose:user-access --all
 */

import { db, usersTable, organizationsTable, organizationUsersTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";

function arg(name: string): string | undefined {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit?.split("=").slice(1).join("=");
}

const ROLE_LABELS: Record<string, string> = {
  admin: "Global Admin",
  global_admin: "Global Admin",
  org_admin: "Organization Admin",
  compliance_manager: "Compliance Manager",
  it_contributor: "IT Contributor",
  reviewer: "Reviewer",
  executive_viewer: "Executive Viewer",
  assessor: "Assessor Read-Only",
  none: "None",
};

async function diagnoseUser(email: string) {
  const [user] = await db
    .select({
      id: usersTable.id,
      name: usersTable.name,
      email: usersTable.email,
      role: usersTable.role,
      isActive: usersTable.isActive,
      isBreakGlass: usersTable.isBreakGlass,
      mfaExempt: usersTable.mfaExempt,
    })
    .from(usersTable)
    .where(eq(usersTable.email, email.toLowerCase()))
    .limit(1);

  if (!user) {
    console.log(`\n  No user found with email ${email}`);
    return;
  }

  const platformRole = user.role === "admin" ? "GLOBAL_ADMIN" : "NONE";

  const rows = await db
    .select({
      membershipId: organizationUsersTable.id,
      organizationId: organizationUsersTable.organizationId,
      organizationName: organizationsTable.name,
      role: organizationUsersTable.role,
      status: organizationUsersTable.status,
    })
    .from(organizationUsersTable)
    .leftJoin(organizationsTable, eq(organizationsTable.id, organizationUsersTable.organizationId))
    .where(eq(organizationUsersTable.userId, user.id));

  const byOrg = new Map<string, typeof rows>();
  for (const r of rows) {
    const list = byOrg.get(r.organizationId) ?? [];
    list.push(r);
    byOrg.set(r.organizationId, list);
  }

  const orphaned = rows.filter((r) => r.organizationName === null);
  const duplicateRows = rows.length - byOrg.size;

  console.log(`\n${"═".repeat(74)}`);
  console.log(`  ${user.name}`);
  console.log(`${"═".repeat(74)}`);
  console.log(`  User ID .................... ${user.id}`);
  console.log(`  Email ...................... ${user.email}`);
  console.log(`  Platform role .............. ${platformRole} (stored: "${user.role}")`);
  console.log(`  Break-glass flag ........... ${user.isBreakGlass}`);
  console.log(`  MFA exempt ................. ${user.mfaExempt}`);
  console.log(`  Active ..................... ${user.isActive}`);
  console.log("");
  console.log(`  Raw membership rows ........ ${rows.length}`);
  console.log(`  Distinct organizations ..... ${byOrg.size}`);
  console.log(`  Duplicate rows ............. ${duplicateRows}`);
  console.log(`  Orphaned rows .............. ${orphaned.length}`);

  if (platformRole === "GLOBAL_ADMIN") {
    console.log("");
    console.log("  Access source: PLATFORM ROLE — all organizations.");
    console.log("  Organization memberships are NOT required and are not used to");
    console.log("  calculate this user's access. Any rows below are historical.");
  }

  if (byOrg.size > 0) {
    console.log("");
    console.log("  Organization memberships (one line per organization):");
    const sorted = [...byOrg.entries()].sort((a, b) =>
      (a[1][0]!.organizationName ?? "").localeCompare(b[1][0]!.organizationName ?? ""),
    );
    for (const [orgId, list] of sorted) {
      const first = list[0]!;
      const roles = [...new Set(list.map((l) => l.role))];
      const label = ROLE_LABELS[first.role] ?? first.role;
      const dup = list.length > 1 ? `  ⚠ ${list.length} rows` : "";
      const mixed = roles.length > 1 ? `  ⚠ conflicting roles: ${roles.join(", ")}` : "";
      console.log(
        `    • ${(first.organizationName ?? "(orphaned) " + orgId).padEnd(28)} ${label.padEnd(22)} ${first.status}${dup}${mixed}`,
      );
    }
  }

  console.log("");
  console.log("  What the Users & Roles table should show:");
  if (platformRole === "GLOBAL_ADMIN") {
    console.log("    Organization Access: All Organizations — Global Admin  (no numeric count)");
  } else {
    const names = [...byOrg.values()].map((l) => l[0]!.organizationName ?? "(orphaned)").sort();
    const shown = names.slice(0, 2);
    const more = byOrg.size - shown.length;
    console.log(`    Organization Access: ${shown.join(", ")}${more > 0 ? ` +${more} more` : ""}`);
  }

  if (duplicateRows > 0) {
    console.log("");
    console.log(`  ⚠ ${duplicateRows} redundant row(s) present. Preview the cleanup with:`);
    console.log(`      pnpm --filter @workspace/scripts repair:user-memberships --email=${user.email} --dry-run`);
  }
}

async function main() {
  const email = arg("email");
  const all = process.argv.includes("--all");

  if (!email && !all) {
    console.log("Usage: diagnose:user-access --email=<address> | --all");
    process.exit(1);
  }

  const [{ count: orgCount }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(organizationsTable);
  const [{ count: totalRows }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(organizationUsersTable);
  const [{ count: distinctPairs }] = await db
    .select({ count: sql<number>`count(distinct (user_id, organization_id))::int` })
    .from(organizationUsersTable);

  console.log("");
  console.log("  PLATFORM-WIDE TOTALS");
  console.log(`    Organizations in database ........ ${orgCount}`);
  console.log(`    organization_users raw rows ...... ${totalRows}`);
  console.log(`    Distinct (user, org) pairs ....... ${distinctPairs}`);
  console.log(`    Redundant rows ................... ${totalRows - distinctPairs}`);

  const uniqueIdx = await db.execute(sql`
    SELECT indexname FROM pg_indexes
    WHERE tablename = 'organization_users' AND indexdef ILIKE '%unique%' AND indexdef ILIKE '%user_id%'
  `);
  const hasUnique = (uniqueIdx.rows ?? []).length > 0;
  console.log(`    UNIQUE(user_id, organization_id) . ${hasUnique ? "present" : "MISSING"}`);

  if (all) {
    const users = await db.select({ email: usersTable.email }).from(usersTable).orderBy(usersTable.email);
    for (const u of users) await diagnoseUser(u.email);
  } else {
    await diagnoseUser(email!);
  }

  console.log("\n  Diagnostic complete. No data was modified.\n");
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
