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
  organizationPackagesTable,
} from "@workspace/db";
import { count, eq, sql } from "drizzle-orm";
import { seedMonitoringItemsForOrg } from "./routes/monitoring";
import { seedControlConfigure } from "./routes/configure";
import { seedRoadmapActions, seedProcedureSteps } from "./routes/roadmap";
import { logger } from "./lib/logger";
import { DOCUMENT_TEMPLATES } from "./data/document-templates-data";
import { HELP_CATEGORIES, HELP_ARTICLES, FAQ_ITEMS, COMPLIANCE_FRAMEWORK_ARTICLES } from "./data/help-seed-data";
import { seedDemoOrg } from "./demo-seed-org";
import { seedApexSolutions } from "./seed-apex-startup";
import {
  complianceFrameworksTable,
  compliancePackagesTable,
  dfarsObligationsTable,
  complianceRequirementsTable,
  requirementCrosswalkTable,
} from "@workspace/db";
import {
  COMPLIANCE_FRAMEWORKS,
  COMPLIANCE_PACKAGES,
  DFARS_OBLIGATIONS,
} from "./data/compliance-packages-data";

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
  // Incremental: fetch existing titles so new templates added to the data file
  // are picked up on the next server start even when the table already has data.
  const existingRows = await db
    .select({ title: documentTemplatesTable.title })
    .from(documentTemplatesTable);
  const existingTitles = new Set(existingRows.map((r) => r.title));

  const toSeed = (DOCUMENT_TEMPLATES as readonly (typeof DOCUMENT_TEMPLATES)[number][]).filter(
    (t) => !existingTitles.has(t.title)
  );

  if (toSeed.length === 0) return;

  logger.info({ new: toSeed.length, existing: existingTitles.size }, "Seeding new document templates...");
  let seeded = 0;

  for (const tmpl of toSeed) {
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
      linkedControlIds: [] as string[],
      requiresApproval: tmpl.requiresApproval,
      isSystemTemplate: tmpl.isSystemTemplate,
      recurrenceRule: (tmpl as any).recurrenceRule ?? null,
    } as any).onConflictDoNothing();

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

  logger.info({ seeded }, "Document templates seeded");
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
    "role_changed",
    "password_reset_requested", "password_reset_requested_unknown_email",
    "password_reset_completed", "password_reset_email_sent",
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

async function seedOrgPackages() {
  const orgs = await db
    .select({ id: organizationsTable.id, name: organizationsTable.name, cmmcTargetLevel: organizationsTable.cmmcTargetLevel })
    .from(organizationsTable);

  if (!orgs.length) return;

  // Package sets per tier
  const DFARS_PACKAGES = ["pkg-dfars-7012", "pkg-dfars-7019", "pkg-dfars-7020", "pkg-dfars-7021"];
  const L2_PACKAGES = ["pkg-cmmc-l2-self", "pkg-nist-800-171-r2", ...DFARS_PACKAGES];
  const L1_PACKAGES = ["pkg-cmmc-l1-self", "pkg-far-52-204-21"];

  let assigned = 0;
  for (const org of orgs) {
    const [{ cnt }] = await db
      .select({ cnt: count() })
      .from(organizationPackagesTable)
      .where(eq(organizationPackagesTable.organizationId, org.id));

    if (Number(cnt) > 0) continue;

    const packageIds = org.cmmcTargetLevel === "L1" ? L1_PACKAGES : L2_PACKAGES;
    for (const packageId of packageIds) {
      await db.insert(organizationPackagesTable).values({
        id: randomUUID(),
        organizationId: org.id,
        packageId,
        isActive: true,
        selectedAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      }).onConflictDoNothing();
    }
    assigned++;
    logger.info({ orgId: org.id, orgName: org.name, count: packageIds.length }, "Seeded default compliance packages for org");
  }

  if (assigned > 0) {
    logger.info({ orgs: assigned }, "Default org packages seeded");
  }
}

async function seedComplianceFrameworks() {
  // Use per-row upserts so new frameworks/packages added to the data file
  // are picked up on the next server start even when the table already has data.
  logger.info("Seeding compliance frameworks and packages (incremental)...");

  for (const fw of COMPLIANCE_FRAMEWORKS) {
    await db
      .insert(complianceFrameworksTable)
      .values({
        id: fw.id,
        name: fw.name,
        shortName: fw.shortName,
        description: fw.description,
        issuingBody: fw.issuingBody,
        status: "active",
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .onConflictDoNothing();
  }

  for (const pkg of COMPLIANCE_PACKAGES) {
    await db
      .insert(compliancePackagesTable)
      .values({
        id: pkg.id,
        frameworkId: pkg.frameworkId,
        packageKey: pkg.packageKey,
        name: pkg.name,
        version: pkg.version,
        description: pkg.description,
        packageType: pkg.packageType,
        status: "active",
        effectiveDate: pkg.effectiveDate,
        sourceReference: pkg.sourceReference,
        controlCount: pkg.controlCount,
        sortOrder: pkg.sortOrder,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .onConflictDoNothing();
  }

  for (let i = 0; i < DFARS_OBLIGATIONS.length; i++) {
    const ob = DFARS_OBLIGATIONS[i];
    await db
      .insert(dfarsObligationsTable)
      .values({
        id: randomUUID(),
        packageId: ob.packageId,
        clauseNumber: ob.clauseNumber,
        obligationTitle: ob.obligationTitle,
        obligationDescription: ob.obligationDescription,
        requiredArtifacts: ob.requiredArtifacts,
        requiredProcess: ob.requiredProcess,
        applicableTo: ob.applicableTo,
        flowdownRequired: ob.flowdownRequired,
        incidentReportingRequired: ob.incidentReportingRequired,
        assessmentRequired: ob.assessmentRequired,
        sortOrder: ob.sortOrder,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .onConflictDoNothing();
  }

  logger.info(
    {
      frameworks: COMPLIANCE_FRAMEWORKS.length,
      packages: COMPLIANCE_PACKAGES.length,
      dfarsObligations: DFARS_OBLIGATIONS.length,
    },
    "Compliance frameworks seeded"
  );
}

async function seedComplianceFrameworkHelpArticles() {
  const SLUGS = COMPLIANCE_FRAMEWORK_ARTICLES.map((a) => a.slug);
  const existing = await db
    .select({ slug: helpArticlesTable.slug })
    .from(helpArticlesTable)
    .where(
      sql`${helpArticlesTable.slug} = ANY(ARRAY[${sql.raw(SLUGS.map((s) => `'${s}'`).join(","))}])`
    );
  const existingSlugs = new Set(existing.map((r) => r.slug));
  const toInsert = COMPLIANCE_FRAMEWORK_ARTICLES.filter((a) => !existingSlugs.has(a.slug));
  if (!toInsert.length) return;

  for (const article of toInsert) {
    const [cat] = await db
      .select({ id: helpCategoriesTable.id })
      .from(helpCategoriesTable)
      .where(eq(helpCategoriesTable.name, article.categoryName))
      .limit(1);
    if (!cat) {
      logger.warn({ categoryName: article.categoryName, slug: article.slug }, "Help article category not found — skipping");
      continue;
    }
    await db.insert(helpArticlesTable).values({
      slug: article.slug,
      title: article.title,
      categoryId: cat.id,
      module: article.module ?? null,
      content: article.content,
      summary: article.summary,
      keywords: article.keywords ?? null,
      roleVisibility: article.roleVisibility ?? null,
      sortOrder: article.sortOrder,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  }
  if (toInsert.length > 0) {
    logger.info({ count: toInsert.length }, "Seeded compliance framework help articles");
  }
}

async function seedCrosswalkRequirements() {
  // Check per-package so new packages can be seeded even if others already exist
  const [cmmcL1Count, cmmcL2Count, nistR2Count, nistR3Count, dfars7012Count, farCount, l1FarCrosswalkCount] = await Promise.all([
    db.select({ cnt: count() }).from(complianceRequirementsTable)
      .where(eq(complianceRequirementsTable.packageId, "pkg-cmmc-l1-self")),
    db.select({ cnt: count() }).from(complianceRequirementsTable)
      .where(eq(complianceRequirementsTable.packageId, "pkg-cmmc-l2-self")),
    db.select({ cnt: count() }).from(complianceRequirementsTable)
      .where(eq(complianceRequirementsTable.packageId, "pkg-nist-800-171-r2")),
    db.select({ cnt: count() }).from(complianceRequirementsTable)
      .where(eq(complianceRequirementsTable.packageId, "pkg-nist-800-171-r3")),
    db.select({ cnt: count() }).from(complianceRequirementsTable)
      .where(eq(complianceRequirementsTable.packageId, "pkg-dfars-7012")),
    db.select({ cnt: count() }).from(complianceRequirementsTable)
      .where(eq(complianceRequirementsTable.packageId, "pkg-far-52-204-21")),
    db.select({ cnt: count() }).from(requirementCrosswalkTable)
      .where(
        sql`source_requirement_id IN (
          SELECT id FROM compliance_requirements WHERE package_id = 'pkg-cmmc-l1-self'
        )`
      ),
  ]);

  const needCmmcL1 = Number(cmmcL1Count[0].cnt) === 0;
  const needCmmcL2 = Number(cmmcL2Count[0].cnt) === 0;
  const needNistR2 = Number(nistR2Count[0].cnt) === 0;
  const needNistR3 = Number(nistR3Count[0].cnt) === 0;
  const needDfars7012 = Number(dfars7012Count[0].cnt) === 0;
  const needFar = Number(farCount[0].cnt) === 0;
  const needL1FarCrosswalk = Number(l1FarCrosswalkCount[0].cnt) === 0;
  const nothingToDo = !needCmmcL1 && !needCmmcL2 && !needNistR2 && !needNistR3 && !needDfars7012 && !needFar && !needL1FarCrosswalk;
  if (nothingToDo) return;

  // Read active controls to derive requirements
  const controls = await db
    .select({
      id: controlsTable.id,
      controlId: controlsTable.controlId,
      title: controlsTable.title,
      level: controlsTable.level,
      nistRef: controlsTable.nistRef,
      sortOrder: controlsTable.sortOrder,
    })
    .from(controlsTable)
    .where(eq(controlsTable.isActive, true))
    .orderBy(controlsTable.sortOrder);

  const nistControls = controls.filter(c => c.nistRef);

  // Maps: control DB id → requirement UUID (populated from inserts or existing DB rows)
  const cmmcReqMap: Record<string, string> = {};
  const nistReqMap: Record<string, string> = {};
  const nistR3ReqMap: Record<string, string> = {};

  // L1 controls: the 17 basic cyber hygiene practices (level = "L1")
  const l1Controls = controls.filter(c => c.level === "L1");

  // --- CMMC L1 requirements (17 Level 1 practices for pkg-cmmc-l1-self) ---
  if (needCmmcL1) {
    for (let i = 0; i < l1Controls.length; i++) {
      const c = l1Controls[i];
      await db.insert(complianceRequirementsTable).values({
        id: randomUUID(),
        packageId: "pkg-cmmc-l1-self",
        requirementId: c.controlId,
        title: c.title,
        level: "L1",
        sortOrder: i + 1,
        createdAt: new Date(),
        updatedAt: new Date(),
      }).onConflictDoNothing();
    }
  }

  // --- FAR 52.204-21 requirements (15 basic safeguarding practices, mapped to L1 controls) ---
  // FAR 52.204-21's 15 safeguarding requirements align closely with CMMC L1 practices;
  // we use the 17 L1 controls as the in-scope set so package filtering works correctly.
  if (needFar) {
    for (let i = 0; i < l1Controls.length; i++) {
      const c = l1Controls[i];
      await db.insert(complianceRequirementsTable).values({
        id: randomUUID(),
        packageId: "pkg-far-52-204-21",
        requirementId: c.controlId,
        title: c.title,
        level: "L1",
        sortOrder: i + 1,
        createdAt: new Date(),
        updatedAt: new Date(),
      }).onConflictDoNothing();
    }
  }

  // --- CMMC L1 ↔ FAR 52.204-21 crosswalk (equivalent) ---
  // Both packages cover exactly the same 17 L1 practices; each requirement is equivalent.
  if (needL1FarCrosswalk) {
    const [l1Reqs, farReqs] = await Promise.all([
      db.select({ id: complianceRequirementsTable.id, requirementId: complianceRequirementsTable.requirementId })
        .from(complianceRequirementsTable)
        .where(eq(complianceRequirementsTable.packageId, "pkg-cmmc-l1-self")),
      db.select({ id: complianceRequirementsTable.id, requirementId: complianceRequirementsTable.requirementId })
        .from(complianceRequirementsTable)
        .where(eq(complianceRequirementsTable.packageId, "pkg-far-52-204-21")),
    ]);
    const farByKey: Record<string, string> = {};
    for (const r of farReqs) farByKey[r.requirementId] = r.id;
    for (const r of l1Reqs) {
      const farId = farByKey[r.requirementId];
      if (farId) {
        await db.insert(requirementCrosswalkTable).values({
          id: randomUUID(),
          sourceRequirementId: r.id,
          targetRequirementId: farId,
          relationshipType: "equivalent",
          notes: `${r.requirementId} — CMMC Level 1 ≡ FAR 52.204-21 (identical safeguarding requirement)`,
          createdAt: new Date(),
        }).onConflictDoNothing();
      }
    }
  }

  // --- CMMC L2 requirements ---
  if (needCmmcL2) {
    for (let i = 0; i < controls.length; i++) {
      const c = controls[i];
      const id = randomUUID();
      cmmcReqMap[c.id] = id;
      await db.insert(complianceRequirementsTable).values({
        id,
        packageId: "pkg-cmmc-l2-self",
        requirementId: c.controlId,
        title: c.title,
        level: c.level,
        sortOrder: i + 1,
        createdAt: new Date(),
        updatedAt: new Date(),
      }).onConflictDoNothing();
    }
  } else {
    // Fetch existing IDs so crosswalk rows reference the correct DB UUIDs
    const existing = await db
      .select({ id: complianceRequirementsTable.id, requirementId: complianceRequirementsTable.requirementId })
      .from(complianceRequirementsTable)
      .where(eq(complianceRequirementsTable.packageId, "pkg-cmmc-l2-self"));
    const byCtrlId: Record<string, string> = {};
    for (const r of existing) byCtrlId[r.requirementId] = r.id;
    for (const c of controls) if (byCtrlId[c.controlId]) cmmcReqMap[c.id] = byCtrlId[c.controlId];
  }

  // --- NIST 800-171 R2 requirements ---
  if (needNistR2) {
    for (let i = 0; i < nistControls.length; i++) {
      const c = nistControls[i];
      const id = randomUUID();
      nistReqMap[c.id] = id;
      await db.insert(complianceRequirementsTable).values({
        id,
        packageId: "pkg-nist-800-171-r2",
        requirementId: c.nistRef!,
        title: c.title,
        level: "L2",
        sortOrder: i + 1,
        createdAt: new Date(),
        updatedAt: new Date(),
      }).onConflictDoNothing();
    }
  } else {
    const existing = await db
      .select({ id: complianceRequirementsTable.id, requirementId: complianceRequirementsTable.requirementId })
      .from(complianceRequirementsTable)
      .where(eq(complianceRequirementsTable.packageId, "pkg-nist-800-171-r2"));
    const byNistRef: Record<string, string> = {};
    for (const r of existing) byNistRef[r.requirementId] = r.id;
    for (const c of nistControls) if (c.nistRef && byNistRef[c.nistRef]) nistReqMap[c.id] = byNistRef[c.nistRef];
  }

  // --- CMMC L2 ↔ NIST 800-171 R2 crosswalk (equivalent) ---
  // Only insert if at least one of the two packages was freshly seeded this run
  if (needCmmcL2 || needNistR2) {
    for (const c of nistControls) {
      const srcId = cmmcReqMap[c.id];
      const tgtId = nistReqMap[c.id];
      if (srcId && tgtId) {
        await db.insert(requirementCrosswalkTable).values({
          id: randomUUID(),
          sourceRequirementId: srcId,
          targetRequirementId: tgtId,
          relationshipType: "equivalent",
          notes: `${c.controlId} ≡ NIST 800-171 Rev. 2 §${c.nistRef}`,
          createdAt: new Date(),
        }).onConflictDoNothing();
      }
    }
  }

  // --- NIST 800-171 R3 requirements (placeholder; R3 restructures but covers same areas) ---
  if (needNistR3) {
    for (let i = 0; i < nistControls.length; i++) {
      const c = nistControls[i];
      const id = randomUUID();
      nistR3ReqMap[c.id] = id;
      await db.insert(complianceRequirementsTable).values({
        id,
        packageId: "pkg-nist-800-171-r3",
        requirementId: c.nistRef!,
        title: c.title,
        level: "L2",
        sortOrder: i + 1,
        createdAt: new Date(),
        updatedAt: new Date(),
      }).onConflictDoNothing();
    }

    // Seed crosswalk: NIST 800-171 R2 → R3 (maps_to relationship)
    for (const c of nistControls) {
      const r2Id = nistReqMap[c.id];
      const r3Id = nistR3ReqMap[c.id];
      if (r2Id && r3Id) {
        await db.insert(requirementCrosswalkTable).values({
          id: randomUUID(),
          sourceRequirementId: r2Id,
          targetRequirementId: r3Id,
          relationshipType: "maps_to",
          notes: `NIST 800-171 Rev. 2 §${c.nistRef} → Rev. 3 (placeholder; verify against Rev. 3 restructuring)`,
          createdAt: new Date(),
        }).onConflictDoNothing();
      }
    }
  }

  // --- DFARS 252.204-7012 → NIST 800-171 R2 crosswalk (maps_to) ---
  // DFARS 7012 mandates NIST SP 800-171 compliance; each NIST control is "maps_to" by this clause.
  if (needDfars7012) {
    const dfarsReqId = randomUUID();
    await db.insert(complianceRequirementsTable).values({
      id: dfarsReqId,
      packageId: "pkg-dfars-7012",
      requirementId: "252.204-7012",
      title: "DFARS 252.204-7012 — Safeguarding Covered Defense Information & Cyber Incident Reporting",
      level: "L2",
      sortOrder: 1,
      createdAt: new Date(),
      updatedAt: new Date(),
    }).onConflictDoNothing();

    // Create crosswalk: DFARS 7012 → each NIST 800-171 R2 requirement (all 110 controls mandated)
    for (const c of nistControls) {
      const nistR2Id = nistReqMap[c.id];
      if (nistR2Id) {
        await db.insert(requirementCrosswalkTable).values({
          id: randomUUID(),
          sourceRequirementId: dfarsReqId,
          targetRequirementId: nistR2Id,
          relationshipType: "maps_to",
          notes: `DFARS 252.204-7012 mandates NIST 800-171 §${c.nistRef} (${c.controlId})`,
          createdAt: new Date(),
        }).onConflictDoNothing();
      }
    }
  }

  logger.info(
    {
      cmmcReqs: needCmmcL2 ? controls.length : "skip",
      nistR2Reqs: needNistR2 ? nistControls.length : "skip",
      nistR3Reqs: needNistR3 ? nistControls.length : "skip",
      dfars7012Reqs: needDfars7012 ? 1 : "skip",
      crosswalkL1Far: needL1FarCrosswalk ? l1Controls.length : "skip",
      crosswalkCmmcR2: (needCmmcL2 || needNistR2) ? nistControls.length : "skip",
      crosswalkR2R3: needNistR3 ? nistControls.length : "skip",
      crosswalkDfars7012Nist: needDfars7012 ? nistControls.length : "skip",
    },
    "Compliance requirements crosswalk seeded"
  );
}

async function migrateCertificationTables() {
  const migrations = [
    `ALTER TABLE organizations ADD COLUMN IF NOT EXISTS certification_module_state text NOT NULL DEFAULT 'NOT_AVAILABLE'`,
    `CREATE TABLE IF NOT EXISTS certification_records (
      id text PRIMARY KEY,
      organization_id text NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      certification_status text NOT NULL,
      cmmc_uid text NOT NULL,
      assessment_level text NOT NULL,
      c3pao_name text NOT NULL,
      cmmc_status_date timestamptz NOT NULL,
      assessment_start_date timestamptz NOT NULL,
      assessment_completion_date timestamptz NOT NULL,
      assessment_unique_id text NOT NULL,
      cage_codes text[] NOT NULL DEFAULT '{}',
      assessment_scope_name text NOT NULL,
      ssp_title text NOT NULL,
      ssp_version text NOT NULL,
      ssp_date timestamptz NOT NULL,
      affirming_official text NOT NULL,
      internal_certification_owner text NOT NULL,
      assessor_names text[] DEFAULT '{}',
      assessor_contact_info text,
      contract_references text[] DEFAULT '{}',
      notes text,
      module_state text NOT NULL DEFAULT 'VERIFICATION_PENDING',
      submitted_by_id text REFERENCES users(id) ON DELETE SET NULL,
      submitted_at timestamptz NOT NULL DEFAULT now(),
      verified_by_id text REFERENCES users(id) ON DELETE SET NULL,
      verified_at timestamptz,
      verification_notes text,
      rejected_by_id text REFERENCES users(id) ON DELETE SET NULL,
      rejected_at timestamptz,
      rejection_reason text,
      admin_override_by_id text REFERENCES users(id) ON DELETE SET NULL,
      admin_override_justification text,
      status_valid_through timestamptz,
      next_affirmation_due timestamptz,
      closeout_deadline timestamptz,
      is_active boolean NOT NULL DEFAULT true,
      is_archived boolean NOT NULL DEFAULT false,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    )`,
    `CREATE TABLE IF NOT EXISTS certification_official_records (
      id text PRIMARY KEY,
      certification_record_id text NOT NULL REFERENCES certification_records(id) ON DELETE CASCADE,
      organization_id text NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      title text NOT NULL,
      record_type text NOT NULL,
      status text NOT NULL DEFAULT 'active',
      effective_date timestamptz,
      description text,
      confidentiality_classification text DEFAULT 'controlled',
      is_required boolean NOT NULL DEFAULT false,
      file_key text,
      file_name text,
      file_mime_type text,
      file_size_bytes integer,
      file_checksum text,
      uploaded_by_id text REFERENCES users(id) ON DELETE SET NULL,
      uploaded_at timestamptz NOT NULL DEFAULT now(),
      archived_by_id text REFERENCES users(id) ON DELETE SET NULL,
      archived_at timestamptz,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    )`,
    `CREATE TABLE IF NOT EXISTS certification_scope_snapshots (
      id text PRIMARY KEY,
      certification_record_id text NOT NULL REFERENCES certification_records(id) ON DELETE CASCADE,
      organization_id text NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      scope_name text NOT NULL,
      cage_codes text[] NOT NULL DEFAULT '{}',
      locations jsonb DEFAULT '[]',
      cui_assets jsonb DEFAULT '[]',
      security_protection_assets jsonb DEFAULT '[]',
      contractor_risk_managed_assets jsonb DEFAULT '[]',
      specialized_assets jsonb DEFAULT '[]',
      external_service_providers jsonb DEFAULT '[]',
      network_diagram_file_key text,
      cui_data_flow_diagram_file_key text,
      ssp_version text,
      scope_approval_date timestamptz,
      scope_notes text,
      created_by_id text REFERENCES users(id) ON DELETE SET NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    )`,
    `CREATE TABLE IF NOT EXISTS certification_affirmations (
      id text PRIMARY KEY,
      certification_record_id text NOT NULL REFERENCES certification_records(id) ON DELETE CASCADE,
      organization_id text NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      affirmation_number integer NOT NULL DEFAULT 1,
      due_date timestamptz NOT NULL,
      status text NOT NULL DEFAULT 'Not Started',
      affirming_official text,
      preparation_owner_id text REFERENCES users(id) ON DELETE SET NULL,
      submitted_date timestamptz,
      submission_reference text,
      notes text,
      supporting_document_file_key text,
      supporting_document_name text,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    )`,
    `CREATE TABLE IF NOT EXISTS certification_change_impact (
      id text PRIMARY KEY,
      certification_record_id text NOT NULL REFERENCES certification_records(id) ON DELETE CASCADE,
      organization_id text NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      change_title text NOT NULL,
      change_date timestamptz NOT NULL,
      description text NOT NULL,
      system_service_affected text,
      scope_impact text,
      cui_impact text,
      controls_affected text[] DEFAULT '{}',
      ssp_update_required boolean DEFAULT false,
      diagram_update_required boolean DEFAULT false,
      provider_esp_change boolean DEFAULT false,
      cage_location_change boolean DEFAULT false,
      reassessment_considered boolean DEFAULT false,
      external_clarification_required boolean DEFAULT false,
      impact_decision text,
      decision_owner_id text REFERENCES users(id) ON DELETE SET NULL,
      approved_by_id text REFERENCES users(id) ON DELETE SET NULL,
      approved_at timestamptz,
      evidence_file_key text,
      notes text,
      status text NOT NULL DEFAULT 'open',
      created_by_id text REFERENCES users(id) ON DELETE SET NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    )`,
    `CREATE TABLE IF NOT EXISTS certification_poam_closeout (
      id text PRIMARY KEY,
      certification_record_id text NOT NULL REFERENCES certification_records(id) ON DELETE CASCADE,
      organization_id text NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      title text NOT NULL,
      description text,
      linked_poam_id text,
      owner_id text REFERENCES users(id) ON DELETE SET NULL,
      due_date timestamptz,
      milestone text,
      evidence_required text,
      evidence_file_key text,
      notes text,
      status text NOT NULL DEFAULT 'Open',
      scheduled_closeout_assessment_date timestamptz,
      closeout_result text,
      created_by_id text REFERENCES users(id) ON DELETE SET NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    )`,
    `CREATE TABLE IF NOT EXISTS certification_recertification_milestones (
      id text PRIMARY KEY,
      certification_record_id text NOT NULL REFERENCES certification_records(id) ON DELETE CASCADE,
      organization_id text NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      milestone_name text NOT NULL,
      sort_order integer NOT NULL DEFAULT 0,
      due_date timestamptz,
      status text NOT NULL DEFAULT 'not_started',
      owner_id text REFERENCES users(id) ON DELETE SET NULL,
      linked_work text,
      notes text,
      evidence_file_key text,
      completed_at timestamptz,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    )`,
    `CREATE TABLE IF NOT EXISTS certification_history (
      id text PRIMARY KEY,
      certification_record_id text NOT NULL REFERENCES certification_records(id) ON DELETE CASCADE,
      organization_id text NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      event_type text NOT NULL,
      event_title text NOT NULL,
      description text,
      previous_state text,
      new_state text,
      performed_by_id text REFERENCES users(id) ON DELETE SET NULL,
      performed_by_name text,
      metadata jsonb DEFAULT '{}',
      occurred_at timestamptz NOT NULL DEFAULT now()
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

export async function runStartupSeed() {
  try {
    await migrateSsoTable();
    await migrateFaqTable();
    await migrateMicrosoftSsoColumns();
    await migrateCertificationTables();
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
    await seedComplianceFrameworks();
    await seedComplianceFrameworkHelpArticles();
    await seedCrosswalkRequirements();
    await seedOrgPackages();
    await fixVtccorpControlLinks();
  } catch (err) {
    logger.error({ err }, "Startup seed failed — app will continue but may lack reference data");
  }
}
