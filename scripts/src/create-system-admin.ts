import { randomUUID } from "crypto";
import bcrypt from "bcryptjs";
import { db, usersTable, auditLogsTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";

const BREAK_GLASS_EMAIL = (process.env.CONTROL_HUB_SYSADMIN_EMAIL ?? "sysadmin@controlhub.com").toLowerCase();
const BREAK_GLASS_NAME = "System Administrator (Break-Glass)";
const IS_ROTATE = process.argv.includes("--rotate-password");

async function main() {
  process.stdout.write("=".repeat(60) + "\n");
  process.stdout.write("Control HUB — Break-Glass System Admin Setup\n");
  process.stdout.write("=".repeat(60) + "\n\n");

  if (IS_ROTATE) {
    process.stdout.write("Mode: --rotate-password (force credential rotation)\n\n");
  }

  // Password MUST be provided via env var — no generation, no plaintext output
  const rawPassword = process.env.CONTROL_HUB_SYSADMIN_INITIAL_PASSWORD;
  if (!rawPassword) {
    process.stderr.write(
      "[ERROR] CONTROL_HUB_SYSADMIN_INITIAL_PASSWORD environment variable is required.\n" +
      "        Generate a strong password out-of-band and set the variable before running:\n\n" +
      "          export CONTROL_HUB_SYSADMIN_INITIAL_PASSWORD='<your-secure-password>'\n" +
      "          pnpm run create:system-admin\n\n" +
      "        Store the password in a hardware-backed secrets manager or physical safe.\n"
    );
    process.exit(1);
  }

  const passwordHash = await bcrypt.hash(rawPassword, 14);
  const now = new Date();

  const [existing] = await db
    .select({ id: usersTable.id, email: usersTable.email, isActive: usersTable.isActive })
    .from(usersTable)
    .where(eq(usersTable.email, BREAK_GLASS_EMAIL))
    .limit(1);

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

    // Set break-glass attributes including SSO/auth constraints
    await db.execute(sql`
      UPDATE users
      SET is_break_glass = true,
          mfa_exempt     = true,
          sso_disabled   = true,
          auth_provider  = 'local',
          global_role    = 'GLOBAL_ADMIN'
      WHERE id = ${existing.id}
    `);

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

    // Set break-glass attributes including SSO/auth constraints
    await db.execute(sql`
      UPDATE users
      SET is_break_glass = true,
          mfa_exempt     = true,
          sso_disabled   = true,
          auth_provider  = 'local',
          global_role    = 'GLOBAL_ADMIN'
      WHERE id = ${id}
    `);

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

  process.stdout.write("\nSecurity requirements:\n");
  process.stdout.write(`  • Account: ${BREAK_GLASS_EMAIL}\n`);
  process.stdout.write("  • Password: provided by CONTROL_HUB_SYSADMIN_INITIAL_PASSWORD (not echoed)\n");
  process.stdout.write("  • This account bypasses MFA — treat with maximum care\n");
  process.stdout.write("  • SSO is disabled; auth_provider is locked to 'local'\n");
  process.stdout.write("  • Sessions expire after 4h absolute / 15m idle\n");
  process.stdout.write("  • An email alert fires to info@carmetechnology.com on every login\n");
  process.stdout.write("  • Alert destination overridable via BREAK_GLASS_ALERT_EMAIL\n");
  process.stdout.write("  • All access is recorded in the audit trail\n");
  process.stdout.write("  • Never use this account for routine administration\n");

  process.stdout.write("\nTo rotate credentials:\n");
  process.stdout.write("  CONTROL_HUB_SYSADMIN_INITIAL_PASSWORD='<new-pw>' \\\n");
  process.stdout.write("    pnpm run create:system-admin -- --rotate-password\n\n");

  await db.$client.end();
  process.exit(0);
}

main().catch((err) => {
  console.error("Error creating break-glass account:", err);
  process.exit(1);
});
