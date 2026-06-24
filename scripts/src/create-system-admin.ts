import { randomUUID, randomBytes } from "crypto";
import bcrypt from "bcryptjs";
import { db, usersTable, auditLogsTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";

const BREAK_GLASS_EMAIL = process.env.CONTROL_HUB_SYSADMIN_EMAIL ?? "sysadmin@controlhub.com";
const BREAK_GLASS_NAME = "System Administrator (Break-Glass)";
const INITIAL_PASSWORD_ENV = process.env.CONTROL_HUB_SYSADMIN_INITIAL_PASSWORD;
const IS_ROTATE = process.argv.includes("--rotate-password");

async function main() {
  process.stdout.write("=".repeat(60) + "\n");
  process.stdout.write("Control HUB — Break-Glass System Admin Setup\n");
  process.stdout.write("=".repeat(60) + "\n\n");

  if (IS_ROTATE) {
    process.stdout.write("Mode: --rotate-password (force credential rotation)\n\n");
  }

  const [existing] = await db
    .select({ id: usersTable.id, email: usersTable.email, isActive: usersTable.isActive })
    .from(usersTable)
    .where(eq(usersTable.email, BREAK_GLASS_EMAIL))
    .limit(1);

  const rawPassword = INITIAL_PASSWORD_ENV ?? randomBytes(18).toString("base64url");
  const passwordHash = await bcrypt.hash(rawPassword, 14);
  const now = new Date();
  const isCreate = !existing;

  if (existing && !IS_ROTATE) {
    process.stdout.write(`ℹ️  Account already exists: ${BREAK_GLASS_EMAIL}\n`);
    process.stdout.write("   Use --rotate-password to rotate credentials.\n\n");
    await db.$client.end();
    process.exit(0);
  }

  if (existing) {
    await db.update(usersTable).set({
      name: BREAK_GLASS_NAME,
      passwordHash,
      role: "admin",
      isActive: true,
      status: "active",
      failedLoginCount: 0,
      lockedUntil: null,
      updatedAt: now,
    }).where(eq(usersTable.id, existing.id));

    await db.execute(
      sql`UPDATE users SET is_break_glass = true, mfa_exempt = true WHERE id = ${existing.id}`
    );

    await db.insert(auditLogsTable).values({
      id: randomUUID(),
      userId: existing.id,
      userName: BREAK_GLASS_NAME,
      action: "break_glass_password_rotated" as any,
      entityType: "user",
      entityId: existing.id,
      entityLabel: BREAK_GLASS_EMAIL,
      newValue: { rotatedByScript: true, timestamp: now.toISOString() },
      timestamp: now,
    });

    process.stdout.write(`✅ Break-glass credentials rotated: ${BREAK_GLASS_EMAIL}\n`);
  } else {
    const id = randomUUID();
    await db.insert(usersTable).values({
      id,
      name: BREAK_GLASS_NAME,
      email: BREAK_GLASS_EMAIL,
      passwordHash,
      role: "admin",
      isActive: true,
      status: "active",
      createdAt: now,
      updatedAt: now,
    });

    await db.execute(
      sql`UPDATE users SET is_break_glass = true, mfa_exempt = true WHERE id = ${id}`
    );

    await db.insert(auditLogsTable).values({
      id: randomUUID(),
      userId: id,
      userName: BREAK_GLASS_NAME,
      action: "break_glass_account_created" as any,
      entityType: "user",
      entityId: id,
      entityLabel: BREAK_GLASS_EMAIL,
      newValue: { createdByScript: true, timestamp: now.toISOString() },
      timestamp: now,
    });

    process.stdout.write(`✅ Break-glass account created: ${BREAK_GLASS_EMAIL}\n`);
  }

  process.stdout.write("\n");

  if (INITIAL_PASSWORD_ENV) {
    process.stdout.write("Password: set from CONTROL_HUB_SYSADMIN_INITIAL_PASSWORD (not echoed)\n");
  } else {
    // Write the generated password to STDERR only — not captured by stdout log aggregators
    process.stderr.write("\n");
    process.stderr.write("┌─────────────────────────────────────────────────────────┐\n");
    process.stderr.write("│  ⚠️  GENERATED PASSWORD — WRITE THIS DOWN NOW            │\n");
    process.stderr.write("│     It will NOT be shown again after this run.          │\n");
    process.stderr.write("└─────────────────────────────────────────────────────────┘\n");
    process.stderr.write(`\n  Email:    ${BREAK_GLASS_EMAIL}\n`);
    process.stderr.write(`  Password: ${rawPassword}\n\n`);
    process.stdout.write("Password: (written to stderr — check terminal output)\n");
  }

  process.stdout.write("\nSecurity requirements:\n");
  process.stdout.write("  • Store credentials in a hardware-backed secrets manager or physical safe\n");
  process.stdout.write("  • This account bypasses MFA — treat with maximum care\n");
  process.stdout.write("  • Sessions expire after 4h absolute / 15m idle\n");
  process.stdout.write("  • An email alert fires on every login and on ≥3 failed attempts\n");
  process.stdout.write("  • Set BREAK_GLASS_ALERT_EMAIL to send alerts to a separate address\n");
  process.stdout.write("  • All access is recorded in the audit trail\n");
  process.stdout.write("  • Never use this account for routine administration\n");

  if (isCreate) {
    process.stdout.write("\nTo rotate credentials later:\n");
    process.stdout.write("  CONTROL_HUB_SYSADMIN_NEW_PASSWORD=<pw> pnpm run create:system-admin -- --rotate-password\n");
  }

  process.stdout.write("\n");

  await db.$client.end();
  process.exit(0);
}

main().catch((err) => {
  console.error("Error creating break-glass account:", err);
  process.exit(1);
});
