/**
 * Repair redundant organization_users rows.
 *
 * DEFAULTS TO A DRY RUN. Nothing is written unless --apply is passed explicitly,
 * and --apply additionally requires --confirm=DELETE-DUPLICATES so it can never be
 * triggered by accident or by an automated process.
 *
 * Retention rule: for each (user_id, organization_id) pair, keep the row with the
 * latest joined_at (ties broken by the highest id, so the choice is deterministic),
 * preferring an ACTIVE row when one exists. Every removed row is printed first and
 * written to a JSON backup report before deletion.
 *
 *   pnpm --filter @workspace/scripts repair:user-memberships --email=sysadmin@controlhub.com --dry-run
 *   pnpm --filter @workspace/scripts repair:user-memberships --all --dry-run
 *   pnpm --filter @workspace/scripts repair:user-memberships --all --apply --confirm=DELETE-DUPLICATES
 *
 * Optional, only after the table is clean:
 *   --add-unique-constraint    adds UNIQUE(user_id, organization_id)
 */

import { db, usersTable, organizationsTable, organizationUsersTable } from "@workspace/db";
import { eq, inArray, sql } from "drizzle-orm";
import { writeFileSync, mkdirSync } from "fs";
import path from "path";

function arg(name: string): string | undefined {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit?.split("=").slice(1).join("=");
}

const APPLY = process.argv.includes("--apply");
const ADD_CONSTRAINT = process.argv.includes("--add-unique-constraint");
const CONFIRM = arg("confirm");
const EMAIL = arg("email");
const ALL = process.argv.includes("--all");
const REASON = arg("reason") ?? "duplicate membership repair";

interface Row {
  membershipId: string;
  userId: string;
  userEmail: string;
  organizationId: string;
  organizationName: string | null;
  role: string;
  status: string;
  joinedAt: Date | null;
}

/** Deterministic: prefer active, then latest joined_at, then highest id. */
function pickKeeper(rows: Row[]): Row {
  return [...rows].sort((a, b) => {
    const aActive = a.status === "active" ? 1 : 0;
    const bActive = b.status === "active" ? 1 : 0;
    if (aActive !== bActive) return bActive - aActive;
    const at = a.joinedAt?.getTime() ?? 0;
    const bt = b.joinedAt?.getTime() ?? 0;
    if (at !== bt) return bt - at;
    return a.membershipId < b.membershipId ? 1 : -1;
  })[0]!;
}

async function main() {
  if (!EMAIL && !ALL) {
    console.log("Usage: repair:user-memberships (--email=<address> | --all) [--dry-run] [--apply --confirm=DELETE-DUPLICATES]");
    process.exit(1);
  }

  if (APPLY && CONFIRM !== "DELETE-DUPLICATES") {
    console.error("\n  Refusing to run.");
    console.error("  --apply requires --confirm=DELETE-DUPLICATES\n");
    process.exit(1);
  }

  let targetUserIds: string[] | null = null;
  if (EMAIL) {
    const [user] = await db
      .select({ id: usersTable.id })
      .from(usersTable)
      .where(eq(usersTable.email, EMAIL.toLowerCase()))
      .limit(1);
    if (!user) {
      console.error(`  No user found with email ${EMAIL}`);
      process.exit(1);
    }
    targetUserIds = [user.id];
  }

  const allRows: Row[] = await db
    .select({
      membershipId: organizationUsersTable.id,
      userId: organizationUsersTable.userId,
      userEmail: usersTable.email,
      organizationId: organizationUsersTable.organizationId,
      organizationName: organizationsTable.name,
      role: organizationUsersTable.role,
      status: organizationUsersTable.status,
      joinedAt: organizationUsersTable.joinedAt,
    })
    .from(organizationUsersTable)
    .innerJoin(usersTable, eq(usersTable.id, organizationUsersTable.userId))
    .leftJoin(organizationsTable, eq(organizationsTable.id, organizationUsersTable.organizationId));

  const scoped = targetUserIds ? allRows.filter((r) => targetUserIds!.includes(r.userId)) : allRows;

  const groups = new Map<string, Row[]>();
  for (const r of scoped) {
    const key = `${r.userId}::${r.organizationId}`;
    const list = groups.get(key) ?? [];
    list.push(r);
    groups.set(key, list);
  }

  const keepers: Row[] = [];
  const toRemove: Row[] = [];
  for (const rows of groups.values()) {
    if (rows.length === 1) {
      keepers.push(rows[0]!);
      continue;
    }
    const keeper = pickKeeper(rows);
    keepers.push(keeper);
    for (const r of rows) if (r.membershipId !== keeper.membershipId) toRemove.push(r);
  }

  console.log(`\n${"═".repeat(74)}`);
  console.log(`  MEMBERSHIP REPAIR — ${APPLY ? "APPLY" : "DRY RUN (no writes)"}`);
  console.log(`${"═".repeat(74)}`);
  console.log(`  Scope ............................ ${EMAIL ?? "all users"}`);
  console.log(`  Rows examined .................... ${scoped.length}`);
  console.log(`  Distinct (user, org) pairs ....... ${groups.size}`);
  console.log(`  Rows to retain ................... ${keepers.length}`);
  console.log(`  Rows proposed for removal ........ ${toRemove.length}`);

  const affected = new Map<string, { email: string; orgs: Map<string, number> }>();
  for (const r of toRemove) {
    const entry = affected.get(r.userId) ?? { email: r.userEmail, orgs: new Map() };
    entry.orgs.set(
      r.organizationName ?? r.organizationId,
      (entry.orgs.get(r.organizationName ?? r.organizationId) ?? 0) + 1,
    );
    affected.set(r.userId, entry);
  }

  if (affected.size > 0) {
    console.log("\n  Affected users and the rows that would be removed:");
    for (const [, entry] of affected) {
      console.log(`\n    ${entry.email}`);
      for (const [orgName, count] of [...entry.orgs].sort()) {
        const keeper = keepers.find(
          (k) => k.userEmail === entry.email && (k.organizationName ?? k.organizationId) === orgName,
        );
        console.log(
          `      ${orgName.padEnd(28)} remove ${String(count).padStart(4)}  ` +
            `retain 1 (${keeper?.role}/${keeper?.status}, id ${keeper?.membershipId.slice(0, 8)}…)`,
        );
      }
    }
  }

  if (toRemove.length === 0) {
    console.log("\n  Nothing to repair — no duplicate rows in scope.");
  }

  // Backup report is always written, dry run included, so the pre-change state is
  // recoverable and reviewable.
  const outDir = path.join(process.cwd(), ".local", "membership-repair");
  mkdirSync(outDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const reportPath = path.join(outDir, `membership-repair-${APPLY ? "applied" : "dryrun"}-${stamp}.json`);
  writeFileSync(
    reportPath,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        mode: APPLY ? "apply" : "dry-run",
        scope: EMAIL ?? "all",
        reason: REASON,
        retentionRule: "prefer active, then latest joined_at, then highest id",
        counts: {
          rowsExamined: scoped.length,
          distinctPairs: groups.size,
          rowsRetained: keepers.length,
          rowsRemoved: toRemove.length,
        },
        retained: keepers,
        removed: toRemove,
      },
      null,
      2,
    ),
  );
  console.log(`\n  Backup report written to:\n    ${reportPath}`);

  if (!APPLY) {
    console.log("\n  DRY RUN — no rows were deleted.");
    console.log("  To apply, re-run with:  --apply --confirm=DELETE-DUPLICATES\n");
    process.exit(0);
  }

  // ── Apply ──────────────────────────────────────────────────────────────────
  if (toRemove.length > 0) {
    const ids = toRemove.map((r) => r.membershipId);
    await db.transaction(async (tx) => {
      for (let i = 0; i < ids.length; i += 500) {
        await tx.delete(organizationUsersTable).where(inArray(organizationUsersTable.id, ids.slice(i, i + 500)));
      }
    });
    console.log(`\n  Removed ${ids.length} redundant row(s) in a single transaction.`);
  }

  if (ADD_CONSTRAINT) {
    const [{ count }] = (await db.execute(sql`
      SELECT count(*)::int AS count FROM (
        SELECT user_id, organization_id FROM organization_users
        GROUP BY 1, 2 HAVING count(*) > 1
      ) d
    `)).rows as { count: number }[];

    if (count > 0) {
      console.error(`\n  Refusing to add the unique constraint: ${count} duplicate group(s) remain.`);
      process.exit(1);
    }

    await db.execute(sql`
      CREATE UNIQUE INDEX IF NOT EXISTS organization_users_user_org_unique
      ON organization_users (user_id, organization_id)
    `);
    console.log("\n  Added UNIQUE(user_id, organization_id). Repeat inserts can no longer duplicate a membership.");
  }

  console.log("\n  Repair complete.\n");
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
