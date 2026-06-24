import { randomUUID } from "crypto";
import bcrypt from "bcryptjs";
import { db, usersTable, auditLogsTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";

const BREAK_GLASS_EMAIL = (process.env.CONTROL_HUB_SYSADMIN_EMAIL ?? "sysadmin@controlhub.com").toLowerCase();
const BREAK_GLASS_NAME = "System Administrator (Break-Glass)";
const IS_ROTATE = process.argv.includes("--rotate-password");

async function enforceBreakGlassAttributes(userId: string) {
  await db.execute(sql`
    UPDATE users
    SET is_break_glass = true,
        mfa_exempt     = true,
        sso_disabled   = true,
        auth_provider  = 'local',
        global_role    = 'GLOBAL_ADMIN'
    WHERE id = ${userId}
  `);
}

async function main() {
  process.stdout.write("=".repeat(60) + "\n");
  process.stdout.write("Control HUB — Break-Glass System Admin Setup\n");
  process.stdout.write("=".repeat(60) + "\n\n");

  const [existing] = await db
    .select({ id: usersTable.id, email: usersTable.email, isActive: usersTable.isActive })
    .from(usersTable)
    .where(eq(usersTable.email, BREAK_GLASS_EMAIL))
    .limit(1);

  const now = new Date();

  // ── VERIFY mode: account exists, no --rotate-password ──────────────────────
  // Enforces all required break-glass attributes; does NOT touch the password.
  // No password env var needed.
  if (existing && !IS_ROTATE) {
    process.stdout.write(`Mode: verify (account exists, enforcing attributes)\n\n`);

    await db.update(usersTable).set({
      name: BREAK_GLASS_NAME,
      role: "admin",
      isActive: true,
      status: "active",
      updatedAt: now,
    }).where(eq(usersTable.id, existing.id));

    await enforceBreakGlassAttributes(existing.id);

    await db.insert(auditLogsTable).values({
      id: randomUUID(),
      userId: existing.id,
      userName: BREAK_GLASS_NAME,
      action: "break_glass_settings_changed" as any,
      entityType: "user",
      entityId: existing.id,
      entityLabel: BREAK_GLASS_EMAIL,
      newValue: {
        enforced: { isBreakGlass: true, mfaExempt: true, ssoDisabled: true, authProvider: "local", globalRole: "GLOBAL_ADMIN" },
        timestamp: now.toISOString(),
      },
      timestamp: now,
    });

    process.stdout.write(`✅ Break-glass attributes verified and enforced: ${BREAK_GLASS_EMAIL}\n`);
    process.stdout.write("   Password unchanged. Use --rotate-password to rotate credentials.\n");
    process.stdout.write(`   Alert destination: ${process.env.BREAK_GLASS_ALERT_EMAIL ?? "info@carmetechnology.com"}\n\n`);
    await db.$client.end();
    process.exit(0);
  }

  // ── ROTATE / CREATE modes require a password via env var ───────────────────
  const rawPassword = process.env.CONTROL_HUB_SYSADMIN_INITIAL_PASSWORD;
  if (!rawPassword) {
    process.stderr.write(
      "[ERROR] CONTROL_HUB_SYSADMIN_INITIAL_PASSWORD environment variable is required.\n" +
        "        Generate a strong password out-of-band and set the variable before running:\n\n" +
        "          export CONTROL_HUB_SYSADMIN_INITIAL_PASSWORD='<your-secure-password>'\n" +
        (IS_ROTATE ? "          pnpm run create:system-admin -- --rotate-password\n" : "          pnpm run create:system-admin\n") +
        "\n        Store the password in a hardware-backed secrets manager or physical safe.\n"
    );
    process.exit(1);
  }

  const passwordHash = await bcrypt.hash(rawPassword, 14);

  // ── ROTATE mode: account exists + --rotate-password ────────────────────────
  if (existing && IS_ROTATE) {
    process.stdout.write(`Mode: --rotate-password\n\n`);

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

    await enforceBreakGlassAttributes(existing.id);

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
    process.stdout.write("   Password: set from CONTROL_HUB_SYSADMIN_INITIAL_PASSWORD (not echoed)\n");
    printSecurityReminder();
    await db.$client.end();
    process.exit(0);
  }

  // ── CREATE mode: account does not exist ────────────────────────────────────
  process.stdout.write(`Mode: create\n\n`);

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

  await enforceBreakGlassAttributes(id);

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
  process.stdout.write("   Password: set from CONTROL_HUB_SYSADMIN_INITIAL_PASSWORD (not echoed)\n");
  printSecurityReminder();

  await db.$client.end();
  process.exit(0);
}

function printSecurityReminder() {
  process.stdout.write("\nSecurity requirements:\n");
  process.stdout.write(`  • Alert destination: ${process.env.BREAK_GLASS_ALERT_EMAIL ?? "info@carmetechnology.com"}\n`);
  process.stdout.write("  • This account bypasses MFA — treat with maximum care\n");
  process.stdout.write("  • SSO is disabled; auth_provider is locked to 'local'\n");
  process.stdout.write("  • Sessions expire after 4h absolute / 15m idle\n");
  process.stdout.write("  • An alert fires to the above address on every login and on ≥3 failed attempts\n");
  process.stdout.write("  • All access is recorded in the audit trail\n");
  process.stdout.write("  • Never use this account for routine administration\n");
  process.stdout.write("\nTo rotate credentials later:\n");
  process.stdout.write("  CONTROL_HUB_SYSADMIN_INITIAL_PASSWORD='<new-pw>' \\\n");
  process.stdout.write("    pnpm run create:system-admin -- --rotate-password\n\n");
}

main().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
