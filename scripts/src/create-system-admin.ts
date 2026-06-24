import { randomUUID, randomBytes } from "crypto";
import bcrypt from "bcryptjs";
import { db, usersTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";

const BREAK_GLASS_EMAIL = "sysadmin@controlhub.com";
const BREAK_GLASS_NAME = "System Administrator (Break-Glass)";

async function main() {
  console.log("=".repeat(60));
  console.log("Control HUB — Break-Glass System Admin Setup");
  console.log("=".repeat(60));
  console.log();

  const [existing] = await db
    .select({ id: usersTable.id, email: usersTable.email, isActive: usersTable.isActive })
    .from(usersTable)
    .where(eq(usersTable.email, BREAK_GLASS_EMAIL))
    .limit(1);

  const rawPassword = randomBytes(18).toString("base64url");
  const passwordHash = await bcrypt.hash(rawPassword, 14);
  const now = new Date();

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

    console.log(`✅ Break-glass account updated: ${BREAK_GLASS_EMAIL}`);
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

    console.log(`✅ Break-glass account created: ${BREAK_GLASS_EMAIL}`);
  }

  console.log();
  console.log("┌─────────────────────────────────────────────────────────┐");
  console.log("│  ⚠️  STORE THESE CREDENTIALS SECURELY                   │");
  console.log("│     They will NOT be shown again after this run.        │");
  console.log("└─────────────────────────────────────────────────────────┘");
  console.log();
  console.log(`  Email:    ${BREAK_GLASS_EMAIL}`);
  console.log(`  Password: ${rawPassword}`);
  console.log();
  console.log("Security requirements:");
  console.log("  • Store in a hardware-backed secrets manager or physical safe");
  console.log("  • This account bypasses MFA — treat with maximum care");
  console.log("  • Sessions expire after 4h absolute / 15m idle");
  console.log("  • An email alert fires to the account on every login");
  console.log("  • Set BREAK_GLASS_ALERT_EMAIL to send alerts to a separate address");
  console.log("  • All access is recorded in the audit trail");
  console.log("  • Never use this account for routine administration");
  console.log();

  await db.$client.end();
  process.exit(0);
}

main().catch((err) => {
  console.error("Error creating break-glass account:", err);
  process.exit(1);
});
