import { randomUUID } from "crypto";
import { readFileSync } from "fs";
import { join } from "path";
import bcrypt from "bcryptjs";
import {
  db,
  domainsTable,
  controlsTable,
  usersTable,
  documentTemplatesTable,
  checklistItemsTable,
  organizationsTable,
  organizationUsersTable,
  securitySettingsTable,
  helpCategoriesTable,
  helpArticlesTable,
  faqItemsTable,
} from "@workspace/db";
import { count, eq, sql } from "drizzle-orm";
import { seedMonitoringItemsForOrg } from "./routes/monitoring";
import { seedControlConfigure } from "./routes/configure";
import { seedRoadmapActions, seedProcedureSteps } from "./routes/roadmap";
import { logger } from "./lib/logger";
import { DOCUMENT_TEMPLATES } from "./data/document-templates-data";
import { HELP_CATEGORIES, HELP_ARTICLES, FAQ_ITEMS } from "./data/help-seed-data";
import { seedDemoOrg } from "./demo-seed-org";
import { seedApexSolutions } from "./seed-apex-startup";

// __dirname is injected by the esbuild build banner and points to dist/ at runtime
const cmmcData = JSON.parse(
  readFileSync(join(__dirname, "data", "cmmc-controls.json"), "utf-8")
) as {
  domains: Array<{ id: string; name: string; description: string }>;
  controls: Array<{
    control_id: string;
    title: string;
    description: string;
    level: string;
    domain: string;
    nist_ref?: string;
    implementation_guidance?: string;
    recommended_review_frequency?: string;
  }>;
};

async function seedDomainControls() {
  const [{ value: existing }] = await db.select({ value: count() }).from(domainsTable);
  if (existing > 0) return;

  logger.info("Seeding CMMC domains and controls...");

  const domainIdMap: Record<string, string> = {};
  for (let i = 0; i < cmmcData.domains.length; i++) {
    const d = cmmcData.domains[i];
    const id = randomUUID();
    domainIdMap[d.id] = id;
    await db.insert(domainsTable).values({
      id,
      name: d.name,
      description: d.description,
      sortOrder: i,
      createdAt: new Date(),
      updatedAt: new Date(),
    }).onConflictDoNothing();
  }

  const validFreqs = ["daily", "weekly", "monthly", "quarterly", "semi_annually", "annually", "as_needed"];
  let controlCount = 0;
  for (let i = 0; i < cmmcData.controls.length; i++) {
    const ctrl = cmmcData.controls[i];
    const domainId = domainIdMap[ctrl.domain];
    if (!domainId) continue;

    const rawFreq = ctrl.recommended_review_frequency?.replace(/-/g, "_") ?? "annually";
    const freq = validFreqs.includes(rawFreq) ? rawFreq : "annually";

    await db.insert(controlsTable).values({
      id: randomUUID(),
      controlId: ctrl.control_id,
      domainId,
      title: ctrl.title,
      description: ctrl.description,
      level: ctrl.level as "L1" | "L2",
      nistRef: ctrl.nist_ref,
      implementationGuidance: ctrl.implementation_guidance,
      recommendedReviewFrequency: freq as any,
      isActive: true,
      sortOrder: i,
      createdAt: new Date(),
      updatedAt: new Date(),
    }).onConflictDoNothing();
    controlCount++;
  }

  logger.info({ domains: cmmcData.domains.length, controls: controlCount }, "CMMC controls seeded");
}

async function seedInitialAdmin() {
  const [{ value: existing }] = await db.select({ value: count() }).from(usersTable);
  if (existing > 0) return;

  logger.info("No users found — creating initial admin account...");

  const hash = await bcrypt.hash("Admin1234!", 10);
  await db.insert(usersTable).values({
    id: randomUUID(),
    name: "System Administrator",
    email: "admin@example.com",
    passwordHash: hash,
    role: "admin",
    status: "active",
    title: "IT Administrator",
    department: "Information Technology",
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  }).onConflictDoNothing();

  logger.info("Initial admin created: admin@example.com / Admin1234! — change this password immediately");
}

async function seedBreakGlassAccount() {
  const BREAK_GLASS_EMAIL = "sysadmin@controlhub.com";

  const [existing] = await db
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(eq(usersTable.email, BREAK_GLASS_EMAIL))
    .limit(1);

  let userId: string;

  if (!existing) {
    userId = randomUUID();
    const hash = await bcrypt.hash("Admin1234!", 10);
    await db.insert(usersTable).values({
      id: userId,
      name: "System Administrator (Break Glass)",
      email: BREAK_GLASS_EMAIL,
      passwordHash: hash,
      role: "admin",
      status: "active",
      title: "System Administrator",
      department: "Information Technology",
      isActive: true,
      isBreakGlass: true,
      mfaExempt: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    }).onConflictDoNothing();
    logger.info({ email: BREAK_GLASS_EMAIL }, "Break-glass account created — change the password immediately");
  } else {
    userId = existing.id;
  }

  // Ensure membership in every organization
  const orgs = await db.select({ id: organizationsTable.id }).from(organizationsTable);
  for (const org of orgs) {
    await db.insert(organizationUsersTable).values({
      id: randomUUID(),
      organizationId: org.id,
      userId,
      role: "org_admin",
      status: "active",
      joinedAt: new Date(),
    }).onConflictDoNothing();
  }

  if (orgs.length > 0) {
    logger.info({ email: BREAK_GLASS_EMAIL, orgs: orgs.length }, "Break-glass account org memberships ensured");
  }
}

async function seedDocumentTemplates() {
  const [{ value: existing }] = await db.select({ value: count() }).from(documentTemplatesTable);
  if (existing > 0) return;

  logger.info("Seeding document templates...");
  let seeded = 0;

  for (const tmpl of DOCUMENT_TEMPLATES) {
    const id = randomUUID();
    const extractedPlaceholders = [...(tmpl.bodyTemplate?.match(/\{\{(\w+)\}\}/g) ?? [])]
      .map((p: string) => p.replace(/\{\{|\}\}/g, ""));
    const uniquePlaceholders = [...new Set([...(tmpl.requiredFields ?? []), ...extractedPlaceholders])];

    const checklistItems = (tmpl as any).checklistItems as Array<{
      itemText: string;
      description?: string;
      isRequired: boolean;
    }> | undefined;

    await db.insert(documentTemplatesTable).values({
      id,
      title: tmpl.title,
      docType: tmpl.docType,
      cmmcLevel: tmpl.cmmcLevel,
      domainAbbr: (tmpl as any).domainAbbr ?? null,
      ownerRole: tmpl.ownerRole,
      reviewFrequency: tmpl.reviewFrequency,
      description: tmpl.description,
      bodyTemplate: tmpl.bodyTemplate,
      requiredFields: tmpl.requiredFields,
      placeholders: uniquePlaceholders,
      linkedControlIds: [],
      requiresApproval: tmpl.requiresApproval,
      isSystemTemplate: tmpl.isSystemTemplate,
      recurrenceRule: (tmpl as any).recurrenceRule ?? null,
    }).onConflictDoNothing();

    if (checklistItems?.length) {
      await db.insert(checklistItemsTable).values(
        checklistItems.map((item, i) => ({
          id: randomUUID(),
          templateId: id,
          itemText: item.itemText,
          description: item.description ?? null,
          isRequired: item.isRequired,
          sortOrder: i,
        }))
      ).onConflictDoNothing();
    }
    seeded++;
  }

  logger.info({ count: seeded }, "Document templates seeded");
}

async function seedMonitoringItems() {
  const orgs = await db.select({ id: organizationsTable.id }).from(organizationsTable);
  for (const org of orgs) {
    await seedMonitoringItemsForOrg(org.id);
  }
}

async function seedSecuritySettings() {
  const rows = await db.select({ id: securitySettingsTable.id }).from(securitySettingsTable).limit(1);
  if (rows.length > 0) return;

  logger.info("Seeding default security settings...");
  await db.insert(securitySettingsTable).values({
    id: "global",
    mfaEnforcementMode: "privileged",
    maxFailedLoginAttempts: 5,
    lockoutDurationMinutes: 15,
    updatedAt: new Date(),
  }).onConflictDoNothing();
}

async function migrateSsoTable() {
  const stmts = [
    `CREATE TABLE IF NOT EXISTS sso_configs (
      id text PRIMARY KEY,
      organization_id text NOT NULL,
      provider varchar(50) NOT NULL DEFAULT 'entra_id',
      client_id text NOT NULL,
      tenant_id text NOT NULL,
      client_secret_enc text NOT NULL,
      email_domain text,
      enabled boolean NOT NULL DEFAULT true,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    )`,
  ];
  for (const stmt of stmts) {
    try {
      await db.execute(sql.raw(stmt));
    } catch (_e) {
      // Already exists — safe to ignore
    }
  }
}

async function migrateFaqTable() {
  const stmts = [
    `DO $$ BEGIN
       IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'help_article_status') THEN
         CREATE TYPE help_article_status AS ENUM ('published', 'draft', 'archived');
       END IF;
     END $$`,
    `CREATE TABLE IF NOT EXISTS faq_items (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      question text NOT NULL,
      answer text NOT NULL,
      category text NOT NULL DEFAULT 'General',
      sort_order integer NOT NULL DEFAULT 0,
      status help_article_status NOT NULL DEFAULT 'published',
      created_at timestamp NOT NULL DEFAULT now(),
      updated_at timestamp NOT NULL DEFAULT now()
    )`,
  ];
  for (const stmt of stmts) {
    try {
      await db.execute(sql.raw(stmt));
    } catch (_e) {
      // Already exists — safe to ignore
    }
  }
}

async function migrateMicrosoftSsoColumns() {
  const migrations = [
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS microsoft_tenant_id text`,
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS microsoft_object_id text`,
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS microsoft_linked_at timestamptz`,
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS last_sso_login_at timestamptz`,
  ];
  for (const stmt of migrations) {
    try {
      await db.execute(sql.raw(stmt));
    } catch (_e) {
      // Already exists — safe to ignore
    }
  }
}

async function migrateBreakGlassColumns() {
  // Idempotent: adds break-glass columns and session table if they don't already exist
  const migrations = [
    // User flags
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS is_break_glass boolean NOT NULL DEFAULT false`,
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS mfa_exempt boolean NOT NULL DEFAULT false`,
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS sso_disabled boolean NOT NULL DEFAULT false`,
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS auth_provider varchar(50) NOT NULL DEFAULT 'local'`,
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS global_role varchar(50)`,
    // Break-glass sessions table
    `CREATE TABLE IF NOT EXISTS break_glass_sessions (
      id text PRIMARY KEY,
      user_id text NOT NULL,
      token_hash text NOT NULL UNIQUE,
      ip_address text,
      user_agent text,
      created_at timestamptz NOT NULL DEFAULT now(),
      last_active_at timestamptz NOT NULL DEFAULT now(),
      expires_at timestamptz NOT NULL,
      revoked_at timestamptz
    )`,
  ];
  for (const stmt of migrations) {
    try {
      await db.execute(sql.raw(stmt));
    } catch (_e) {
      // Already exists — safe to ignore
    }
  }
}

async function migrateAuditEnum() {
  const missingValues = [
    "viewed", "deactivated", "activated", "password_reset", "org_access_changed",
    "create", "update", "generate", "submit_review", "approve", "reject",
    "activate", "archive", "complete", "complete_checklist", "run_doc_checks",
    "password_changed", "login_failed", "account_locked", "account_unlocked",
    "mfa_setup_started", "mfa_enabled", "mfa_verify_success", "mfa_verify_failure",
    "mfa_recovery_code_used", "mfa_reset_by_admin", "mfa_disabled", "mfa_policy_changed",
    "mfa_required_set",
    "user_invited", "invitation_resent", "invitation_cancelled", "invitation_accepted",
    "break_glass_login", "break_glass_account_created", "break_glass_password_rotated",
    "break_glass_session_revoked", "break_glass_account_locked",
    "break_glass_login_success", "break_glass_login_failed", "break_glass_settings_changed",
    "sso_login",
    "microsoft_sso_started", "microsoft_sso_success", "microsoft_sso_failed",
    "microsoft_identity_linked", "microsoft_identity_unlinked",
    "microsoft_user_denied", "microsoft_breakglass_denied",
    "sso_disabled_account_denied", "sso_inactive_account_denied",
  ];
  for (const val of missingValues) {
    try {
      await db.execute(sql.raw(`ALTER TYPE audit_action ADD VALUE IF NOT EXISTS '${val}'`));
    } catch (_e) {
      // Already exists or concurrent add — safe to ignore
    }
  }
}

async function seedHelpContent() {
  const [{ value: catCount }] = await db.select({ value: count() }).from(helpCategoriesTable);
  const [{ value: faqCount }] = await db.select({ value: count() }).from(faqItemsTable);
  if (catCount > 0 && faqCount > 0) return;

  logger.info("Seeding help center content...");

  if (faqCount === 0) {
    for (const faq of FAQ_ITEMS) {
      await db.insert(faqItemsTable).values({
        id: randomUUID(),
        question: faq.question,
        answer: faq.answer,
        category: faq.category,
        sortOrder: faq.sortOrder,
        status: "published",
        createdAt: new Date(),
        updatedAt: new Date(),
      }).onConflictDoNothing();
    }
  }

  if (catCount > 0) return;

  const catIdMap: Record<string, string> = {};
  for (const cat of HELP_CATEGORIES) {
    const id = randomUUID();
    catIdMap[cat.name] = id;
    await db.insert(helpCategoriesTable).values({
      id,
      name: cat.name,
      description: cat.description,
      icon: cat.icon,
      sortOrder: cat.sortOrder,
      createdAt: new Date(),
    }).onConflictDoNothing();
  }

  for (const article of HELP_ARTICLES) {
    await db.insert(helpArticlesTable).values({
      id: randomUUID(),
      slug: article.slug,
      title: article.title,
      categoryId: catIdMap[article.categoryName] ?? null,
      module: article.module ?? null,
      content: article.content,
      summary: article.summary,
      keywords: article.keywords,
      roleVisibility: article.roleVisibility ?? null,
      sortOrder: article.sortOrder,
      status: "published",
      createdAt: new Date(),
      updatedAt: new Date(),
    }).onConflictDoNothing();
  }

  for (const faq of FAQ_ITEMS) {
    await db.insert(faqItemsTable).values({
      id: randomUUID(),
      question: faq.question,
      answer: faq.answer,
      category: faq.category,
      sortOrder: faq.sortOrder,
      status: "published",
      createdAt: new Date(),
      updatedAt: new Date(),
    }).onConflictDoNothing();
  }

  logger.info("Help center content seeded.");
}

/**
 * One-time idempotent fix: add missing control links for VTCCORP.US evidence items.
 * These items were uploaded without control assignments and showed as UNLINKED in bulk exports.
 * Each INSERT uses WHERE NOT EXISTS so this is safe to run on every startup.
 *
 * Mapping source:
 *   - Items titled "3.13.4_*" / "3_13_4_*" / "VTC Shared Resource Policy" → SC.L2-3.13.4
 *   - R-12 CUI SharePoint items → same controls as their already-linked sibling records
 */
async function fixVtccorpControlLinks() {
  // [evidenceId, controlId]  — all UUIDs verified against the production DB
  const pairs: [string, string][] = [
    // ── 3.13.4 items (6 unlinked copies) ───────────────────────── SC.L2-3.13.4
    ["fe108e9f-bbf9-4a23-a841-8c0726d9c8bb", "163e825e-104e-4e80-899f-025db4f9aa6c"], // 3.13.4 Narrative
    ["5d6deb93-f324-4c29-941a-9d76e0b18a95", "163e825e-104e-4e80-899f-025db4f9aa6c"], // 3.13.4_Configuration
    ["1ed3eebb-d32d-4951-878f-35ba569c7386", "163e825e-104e-4e80-899f-025db4f9aa6c"], // 3.13.4_Initial_Review_Record
    ["205af62b-4f78-465f-99ac-72461d754995", "163e825e-104e-4e80-899f-025db4f9aa6c"], // 3.13.4_Policy
    ["fc19dd4a-8bb6-4b32-a89f-1656fce37982", "163e825e-104e-4e80-899f-025db4f9aa6c"], // 3.13.4_Procedure
    ["7ccb71fa-9b11-48f6-8baf-49a427f5c658", "163e825e-104e-4e80-899f-025db4f9aa6c"], // 3_13_4_Closeout_Packet
    // ── VTC Shared Resource Policy ─────────────────────────────── SC.L2-3.13.4
    ["021747d0-b609-459b-bcba-6e266b83824b", "163e825e-104e-4e80-899f-025db4f9aa6c"],
    // ── R-12 CUI SharePoint Site Access Requests ─── CM.L2-3.4.2, SC.L2-3.13.4
    ["ecabc74e-65ac-449a-ab46-fceb1143b671", "c9202143-0a83-4de2-8884-8c469e7ccb35"],
    ["ecabc74e-65ac-449a-ab46-fceb1143b671", "163e825e-104e-4e80-899f-025db4f9aa6c"],
    // ── R-12 CUI SharePoint Site Overview ── CM.L2-3.4.2, SC.L2-3.13.4, SC.L2-3.13.8
    ["7a43c0da-7de6-4754-a350-f55534e4bc7f", "c9202143-0a83-4de2-8884-8c469e7ccb35"],
    ["7a43c0da-7de6-4754-a350-f55534e4bc7f", "163e825e-104e-4e80-899f-025db4f9aa6c"],
    ["7a43c0da-7de6-4754-a350-f55534e4bc7f", "ba80b66c-23d2-4fb3-ad2c-ff55a56b3d91"],
    // ── R-12 CUI SharePoint Site Permissions ── AC.L2-3.1.5, CM.L2-3.4.2, SC.L2-3.13.4
    ["8c08abdf-1ba0-4a7d-86be-0bcfcbd29269", "b1c780d1-1759-4926-bf1e-f17bc958a348"],
    ["8c08abdf-1ba0-4a7d-86be-0bcfcbd29269", "c9202143-0a83-4de2-8884-8c469e7ccb35"],
    ["8c08abdf-1ba0-4a7d-86be-0bcfcbd29269", "163e825e-104e-4e80-899f-025db4f9aa6c"],
    // ── R-12 CUI SharePoint Site Sharing Restricted ── CM.L2-3.4.2, CM.L2-3.4.7, SC.L2-3.13.4
    ["f4e6eb1b-1664-4ed8-9ccd-0a2e82b27fa9", "c9202143-0a83-4de2-8884-8c469e7ccb35"],
    ["f4e6eb1b-1664-4ed8-9ccd-0a2e82b27fa9", "11015949-0336-47fc-b864-fa9b9828df6b"],
    ["f4e6eb1b-1664-4ed8-9ccd-0a2e82b27fa9", "163e825e-104e-4e80-899f-025db4f9aa6c"],
    // ── R-12 Tenant Sharing Policy ── AC.L2-3.1.3, CM.L2-3.4.2, SC.L2-3.13.4
    ["ea180ac4-2bfc-4912-a769-a8bb6bf7da9d", "947bbd32-7a0a-4ae8-857f-1949a094f159"],
    ["ea180ac4-2bfc-4912-a769-a8bb6bf7da9d", "c9202143-0a83-4de2-8884-8c469e7ccb35"],
    ["ea180ac4-2bfc-4912-a769-a8bb6bf7da9d", "163e825e-104e-4e80-899f-025db4f9aa6c"],
  ];

  let inserted = 0;
  for (const [evidenceId, controlId] of pairs) {
    try {
      await db.execute(sql.raw(`
        INSERT INTO evidence_control_links (id, evidence_id, control_id, linked_at)
        SELECT gen_random_uuid(), '${evidenceId}', '${controlId}', now()
        WHERE NOT EXISTS (
          SELECT 1 FROM evidence_control_links
          WHERE evidence_id = '${evidenceId}' AND control_id = '${controlId}'
        )
      `));
      inserted++;
    } catch (_e) {
      // Evidence row may not exist in this environment — safe to skip
    }
  }
  if (inserted > 0) {
    logger.info({ inserted }, "Fixed VTCCORP.US unlinked evidence control links");
  }
}

export async function runStartupSeed() {
  try {
    await migrateSsoTable();
    await migrateFaqTable();
    await migrateMicrosoftSsoColumns();
    await migrateBreakGlassColumns();
    await migrateAuditEnum();
    await seedDomainControls();
    await seedInitialAdmin();
    await seedBreakGlassAccount();
    await seedDocumentTemplates();
    await seedMonitoringItems();
    await seedControlConfigure();
    await seedRoadmapActions();
    await seedProcedureSteps();
    await seedDemoOrg();
    await seedApexSolutions();
    await seedSecuritySettings();
    await seedHelpContent();
    await fixVtccorpControlLinks();
  } catch (err) {
    logger.error({ err }, "Startup seed failed — app will continue but may lack reference data");
  }
}
