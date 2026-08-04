import { randomUUID } from "crypto";
import { readFileSync, writeFileSync, mkdirSync } from "fs";
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
  docTemplatePackagesTable,
  docTemplatePlaceholderManifestTable,
  docTemplateControlMapsTable,
} from "@workspace/db";
import { count, eq, sql, inArray, and } from "drizzle-orm";
import { seedMonitoringItemsForOrg, migrateMonitoringLevelForOrg } from "./routes/monitoring";
import { seedControlConfigure } from "./routes/configure";
import { seedRoadmapActions, seedProcedureSteps } from "./routes/roadmap";
import { logger } from "./lib/logger";
import { DOCUMENT_TEMPLATES } from "./data/document-templates-data";
import { L1_TEMPLATES } from "./data/l1-templates-data";
import { HELP_CATEGORIES, HELP_ARTICLES, FAQ_ITEMS, COMPLIANCE_FRAMEWORK_ARTICLES } from "./data/help-seed-data";
import { seedDemoOrg } from "./demo-seed-org";
import { seedApexSolutions } from "./seed-apex-startup";
import {
  complianceFrameworksTable,
  compliancePackagesTable,
  dfarsObligationsTable,
  complianceRequirementsTable,
  requirementCrosswalkTable,
  requirementAuthorityMappingsTable,
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
  const orgs = await db
    .select({ id: organizationsTable.id, cmmcTargetLevel: organizationsTable.cmmcTargetLevel })
    .from(organizationsTable);
  for (const org of orgs) {
    const level = org.cmmcTargetLevel ?? "L2";
    // Silently replace L2 items with L1 defaults if org is L1 and was seeded wrong
    await migrateMonitoringLevelForOrg(org.id, level);
    await seedMonitoringItemsForOrg(org.id, level);
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

  logger.info("Seeding / updating help center content...");

  // ── Remove obsolete category names replaced by spec v2 ────────────────────────
  const OBSOLETE_CATEGORIES = [
    "Controls",             // → Controls & Requirements
    "Documentation & SSP",  // → split into Documentation + System Security Plan
    "POA&M",                // → POA&M Management
    "Reports",              // → Reports & Exports
    "MFA & Login Help",     // → MFA, SSO & Sign-In
  ];
  await db.delete(helpCategoriesTable).where(inArray(helpCategoriesTable.name, OBSOLETE_CATEGORIES));

  // ── Categories: insert new ones, upsert description/icon/sortOrder on conflict ──
  const catIdMap: Record<string, string> = {};

  // Pre-load existing category IDs so the map works even when categories already exist
  const existingCats = await db.select({ id: helpCategoriesTable.id, name: helpCategoriesTable.name }).from(helpCategoriesTable);
  for (const ec of existingCats) catIdMap[ec.name] = ec.id;

  for (const cat of HELP_CATEGORIES) {
    const id = catIdMap[cat.name] ?? randomUUID();
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

  // ── Articles: upsert — insert new, update content/metadata when contentVersion is newer ──
  for (const article of HELP_ARTICLES) {
    const categoryId = catIdMap[article.categoryName] ?? null;
    await db.insert(helpArticlesTable).values({
      id: randomUUID(),
      slug: article.slug,
      title: article.title,
      categoryId,
      module: article.module ?? null,
      content: article.content,
      summary: article.summary,
      keywords: article.keywords,
      roleVisibility: article.roleVisibility ?? null,
      requiredCapabilities: article.requiredCapabilities ?? null,
      packageKeys: article.packageKeys ?? null,
      moduleKeys: article.moduleKeys ?? null,
      sortOrder: article.sortOrder,
      featured: article.featured ?? false,
      popular: article.popular ?? false,
      contentVersion: article.contentVersion ?? "1.0",
      estimatedReadMinutes: article.estimatedReadMinutes ?? 3,
      lastReviewedAt: article.lastReviewedAt ?? null,
      status: "published",
      createdAt: new Date(),
      updatedAt: new Date(),
    }).onConflictDoUpdate({
      target: helpArticlesTable.slug,
      set: {
        title: article.title,
        categoryId,
        module: article.module ?? null,
        content: article.content,
        summary: article.summary,
        keywords: article.keywords,
        roleVisibility: article.roleVisibility ?? null,
        requiredCapabilities: article.requiredCapabilities ?? null,
        packageKeys: article.packageKeys ?? null,
        moduleKeys: article.moduleKeys ?? null,
        sortOrder: article.sortOrder,
        featured: article.featured ?? false,
        popular: article.popular ?? false,
        contentVersion: article.contentVersion ?? "1.0",
        estimatedReadMinutes: article.estimatedReadMinutes ?? 3,
        lastReviewedAt: article.lastReviewedAt ?? null,
        status: "published",
        updatedAt: new Date(),
      },
    });
  }

  // ── FAQs: upsert by question text (unique constraint: faq_items_question_unique)
  for (const faq of FAQ_ITEMS) {
    await db.insert(faqItemsTable).values({
      id: randomUUID(),
      question: faq.question,
      answer: faq.answer,
      category: faq.category,
      requiredCapabilities: faq.requiredCapabilities ?? null,
      packageKeys: faq.packageKeys ?? null,
      moduleKey: faq.moduleKey ?? null,
      sortOrder: faq.sortOrder,
      status: "published",
      createdAt: new Date(),
      updatedAt: new Date(),
    }).onConflictDoUpdate({
      target: faqItemsTable.question,
      set: {
        answer: faq.answer,
        category: faq.category,
        requiredCapabilities: faq.requiredCapabilities ?? null,
        packageKeys: faq.packageKeys ?? null,
        moduleKey: faq.moduleKey ?? null,
        sortOrder: faq.sortOrder,
        updatedAt: new Date(),
      },
    });
  }

  if (catCount === 0) {
    logger.info("Help center content seeded (first run).");
  } else {
    logger.info("Help center content updated (upsert pass complete).");
  }
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
  // Upsert all compliance framework articles — insert new, update existing when content changes.
  for (const article of COMPLIANCE_FRAMEWORK_ARTICLES) {
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
      id: randomUUID(),
      slug: article.slug,
      title: article.title,
      categoryId: cat.id,
      module: article.module ?? null,
      content: article.content,
      summary: article.summary,
      keywords: article.keywords ?? null,
      roleVisibility: article.roleVisibility ?? null,
      requiredCapabilities: article.requiredCapabilities ?? null,
      packageKeys: article.packageKeys ?? null,
      moduleKeys: article.moduleKeys ?? null,
      sortOrder: article.sortOrder,
      featured: article.featured ?? false,
      popular: article.popular ?? false,
      contentVersion: article.contentVersion ?? "1.0",
      estimatedReadMinutes: article.estimatedReadMinutes ?? 3,
      lastReviewedAt: article.lastReviewedAt ?? null,
      status: "published",
      createdAt: new Date(),
      updatedAt: new Date(),
    }).onConflictDoUpdate({
      target: helpArticlesTable.slug,
      set: {
        title: article.title,
        categoryId: cat.id,
        module: article.module ?? null,
        content: article.content,
        summary: article.summary,
        keywords: article.keywords ?? null,
        roleVisibility: article.roleVisibility ?? null,
        requiredCapabilities: article.requiredCapabilities ?? null,
        packageKeys: article.packageKeys ?? null,
        moduleKeys: article.moduleKeys ?? null,
        sortOrder: article.sortOrder,
        featured: article.featured ?? false,
        popular: article.popular ?? false,
        contentVersion: article.contentVersion ?? "1.0",
        estimatedReadMinutes: article.estimatedReadMinutes ?? 3,
        lastReviewedAt: article.lastReviewedAt ?? null,
        status: "published",
        updatedAt: new Date(),
      },
    });
  }
  logger.info({ count: COMPLIANCE_FRAMEWORK_ARTICLES.length }, "Compliance framework help articles upserted");
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

async function migrateSspPrefillDrafts() {
  // ssp_prefill_drafts was added in the SSP module upgrade. Safe to run on every boot.
  try {
    await db.execute(sql.raw(`
      CREATE TABLE IF NOT EXISTS ssp_prefill_drafts (
        id text PRIMARY KEY,
        organization_id text NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
        template_key text NOT NULL,
        title text NOT NULL,
        status text NOT NULL DEFAULT 'in_progress',
        wizard_step integer NOT NULL DEFAULT 1,
        values_json text NOT NULL DEFAULT '{}',
        created_by text,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `));
  } catch (_e) {
    // Already exists — safe to ignore
  }
}

async function migrateRoadmapProfileKey() {
  // profile_key was added to roadmap_actions in the L1 roadmap profile feature.
  // Production databases provisioned before this release won't have the column,
  // so seedRoadmapActions() would crash trying to reference it.
  try {
    await db.execute(sql.raw(
      `ALTER TABLE roadmap_actions ADD COLUMN IF NOT EXISTS profile_key text`
    ));
  } catch (_e) {
    // Already exists — safe to ignore
  }
}

async function migrateOrgFeatureEnum() {
  // PRE_ASSESSMENT was added to org_feature_key enum after initial release.
  // Postgres enums require an explicit ALTER TYPE to add new values.
  try {
    await db.execute(sql.raw(
      `ALTER TYPE org_feature_key ADD VALUE IF NOT EXISTS 'PRE_ASSESSMENT'`
    ));
  } catch (_e) {
    // Already exists or DDL not allowed in transaction — safe to ignore
  }
}

// ── Task 59: Doc Template Schema Additions ────────────────────────────────────

async function migrateDocTemplateNewColumns() {
  const migrations = [
    // Nullable columns on existing document_templates table
    `ALTER TABLE document_templates ADD COLUMN IF NOT EXISTS information_type text`,
    `ALTER TABLE document_templates ADD COLUMN IF NOT EXISTS template_family_key text`,
  ];
  for (const stmt of migrations) {
    try {
      await db.execute(sql.raw(stmt));
    } catch (_e) {
      // Already exists — safe to ignore
    }
  }
}

async function migrateDocTemplatePackagesTable() {
  const stmts = [
    `CREATE TABLE IF NOT EXISTS doc_template_packages (
      id text PRIMARY KEY,
      template_id text NOT NULL REFERENCES document_templates(id) ON DELETE CASCADE,
      package_key text NOT NULL,
      applicability text NOT NULL DEFAULT 'EXACT',
      information_type text NOT NULL DEFAULT 'CUI',
      created_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE (template_id, package_key)
    )`,
    `CREATE INDEX IF NOT EXISTS doc_template_packages_pkg_key_idx ON doc_template_packages(package_key)`,
  ];
  for (const stmt of stmts) {
    try {
      await db.execute(sql.raw(stmt));
    } catch (_e) {
      // Already exists — safe to ignore
    }
  }
}

async function migrateDocTemplatePlaceholderManifestTable() {
  const stmts = [
    `CREATE TABLE IF NOT EXISTS doc_template_placeholder_manifest (
      id text PRIMARY KEY,
      template_id text NOT NULL REFERENCES document_templates(id) ON DELETE CASCADE,
      placeholder_key text NOT NULL,
      display_label text NOT NULL,
      section text,
      data_type text NOT NULL DEFAULT 'text',
      required boolean NOT NULL DEFAULT false,
      default_source text,
      default_value text,
      validation_rule text,
      help_text text,
      package_key text,
      allow_document_override boolean NOT NULL DEFAULT true,
      sort_order integer NOT NULL DEFAULT 0,
      UNIQUE (template_id, placeholder_key)
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

async function migrateDocumentReviewRequestsTable() {
  const stmts = [
    `DO $$ BEGIN
       IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'review_request_status') THEN
         CREATE TYPE review_request_status AS ENUM ('PENDING','APPROVED','CHANGES_REQUESTED','CANCELLED');
       END IF;
     END $$`,
    `CREATE TABLE IF NOT EXISTS document_review_requests (
      id text PRIMARY KEY,
      organization_id text REFERENCES organizations(id) ON DELETE CASCADE,
      generated_document_id text REFERENCES documents(id) ON DELETE CASCADE,
      evidence_id text REFERENCES evidence_items(id) ON DELETE SET NULL,
      reviewer_user_id text REFERENCES users(id) ON DELETE SET NULL,
      submitted_by_user_id text REFERENCES users(id) ON DELETE SET NULL,
      submitted_at timestamptz NOT NULL DEFAULT now(),
      due_date timestamptz,
      status review_request_status NOT NULL DEFAULT 'PENDING',
      submission_notes text,
      decision text,
      decision_notes text,
      decided_at timestamptz,
      decided_by_user_id text REFERENCES users(id) ON DELETE SET NULL,
      row_version integer NOT NULL DEFAULT 1,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    )`,
    // Partial unique index: at most one PENDING request per document
    `CREATE UNIQUE INDEX IF NOT EXISTS document_review_requests_pending_doc_uniq
      ON document_review_requests(generated_document_id)
      WHERE status = 'PENDING'`,
  ];
  for (const stmt of stmts) {
    try {
      await db.execute(sql.raw(stmt));
    } catch (_e) {
      // Already exists — safe to ignore
    }
  }
}

// ── Help Center schema migrations ─────────────────────────────────────────────

async function migrateHelpNewColumns() {
  const stmts = [
    // help_articles new columns
    `ALTER TABLE help_articles ADD COLUMN IF NOT EXISTS required_capabilities text[]`,
    `ALTER TABLE help_articles ADD COLUMN IF NOT EXISTS package_keys text[]`,
    `ALTER TABLE help_articles ADD COLUMN IF NOT EXISTS module_keys text[]`,
    `ALTER TABLE help_articles ADD COLUMN IF NOT EXISTS featured boolean NOT NULL DEFAULT false`,
    `ALTER TABLE help_articles ADD COLUMN IF NOT EXISTS popular boolean NOT NULL DEFAULT false`,
    `ALTER TABLE help_articles ADD COLUMN IF NOT EXISTS content_version text NOT NULL DEFAULT '1.0'`,
    `ALTER TABLE help_articles ADD COLUMN IF NOT EXISTS estimated_read_minutes integer NOT NULL DEFAULT 3`,
    `ALTER TABLE help_articles ADD COLUMN IF NOT EXISTS last_reviewed_at timestamptz`,
    `ALTER TABLE help_articles ADD COLUMN IF NOT EXISTS last_reviewed_by text`,
    // faq_items new columns
    `ALTER TABLE faq_items ADD COLUMN IF NOT EXISTS required_capabilities text[]`,
    `ALTER TABLE faq_items ADD COLUMN IF NOT EXISTS package_keys text[]`,
    `ALTER TABLE faq_items ADD COLUMN IF NOT EXISTS module_key text`,
    // support_tickets table
    `CREATE TABLE IF NOT EXISTS support_tickets (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      ticket_number text NOT NULL UNIQUE,
      organization_id uuid,
      submitted_by_user_id uuid NOT NULL,
      submitted_by_name text NOT NULL,
      submitted_by_email text NOT NULL,
      effective_role text,
      category text NOT NULL,
      priority text NOT NULL DEFAULT 'normal',
      subject text NOT NULL,
      description text NOT NULL,
      related_module text,
      current_page_url text,
      article_id uuid,
      environment text,
      app_version text,
      browser_summary text,
      correlation_id text,
      include_diagnostics boolean NOT NULL DEFAULT false,
      status text NOT NULL DEFAULT 'submitted',
      internal_notes text,
      email_delivery_status text NOT NULL DEFAULT 'pending',
      created_at timestamptz NOT NULL DEFAULT NOW(),
      updated_at timestamptz NOT NULL DEFAULT NOW(),
      resolved_at timestamptz,
      closed_at timestamptz
    )`,
    // support_tickets: add internal_notes column if missing (added in schema v2)
    `ALTER TABLE support_tickets ADD COLUMN IF NOT EXISTS internal_notes text`,
    // faq_items: unique constraint on question prevents duplicate seed inserts
    `ALTER TABLE faq_items ADD CONSTRAINT IF NOT EXISTS faq_items_question_unique UNIQUE (question)`,
    // support_ticket_attachments table
    `CREATE TABLE IF NOT EXISTS support_ticket_attachments (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      ticket_id uuid NOT NULL REFERENCES support_tickets(id) ON DELETE CASCADE,
      original_filename text NOT NULL,
      storage_key text NOT NULL,
      mime_type text NOT NULL,
      file_size integer NOT NULL,
      checksum text,
      uploaded_at timestamptz NOT NULL DEFAULT NOW()
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

// ── Package applicability seed ─────────────────────────────────────────────────
// Tags all 67 existing library templates with their package applicability.
// Idempotent: skips templates that already have rows in doc_template_packages.

async function seedDocTemplatePackages() {
  // Fetch all library templates (those with sourceTemplateId set — the imported L2 library)
  const libraryTemplates = await db
    .select({
      id: documentTemplatesTable.id,
      sourceTemplateId: documentTemplatesTable.sourceTemplateId,
      title: documentTemplatesTable.title,
      cmmcLevel: documentTemplatesTable.cmmcLevel,
      family: documentTemplatesTable.family,
    })
    .from(documentTemplatesTable)
    .where(sql`${documentTemplatesTable.sourceTemplateId} IS NOT NULL`);

  if (libraryTemplates.length === 0) return;

  // Get already-tagged template IDs
  const alreadyTagged = await db
    .select({ templateId: docTemplatePackagesTable.templateId })
    .from(docTemplatePackagesTable);
  const taggedSet = new Set(alreadyTagged.map((r) => r.templateId));

  const toTag = libraryTemplates.filter((t) => !taggedSet.has(t.id));
  if (toTag.length === 0) return;

  logger.info({ count: toTag.length }, "Seeding doc_template_packages for library templates...");

  // Keywords/prefixes that signal shared governance (cross-L1 and L2) templates
  const SHARED_KEYWORDS = [
    "training", "awareness", "workforce", "personnel", "roles", "security policy",
    "information security policy", "incident response policy",
  ];

  // Templates matching these sourceTemplateId prefixes are primarily FAR/L1-adjacent
  // (governance/org-level, no deep CUI dependency)
  const FAR_SHARED_PREFIXES = ["AT-", "IR-POL", "PS-"];

  let inserted = 0;
  for (const t of toTag) {
    const titleLower = (t.title ?? "").toLowerCase();
    const srcId = t.sourceTemplateId ?? "";

    // Determine if this is a shared governance template
    const isShared =
      SHARED_KEYWORDS.some((kw) => titleLower.includes(kw)) ||
      FAR_SHARED_PREFIXES.some((pfx) => srcId.startsWith(pfx));

    // All L2 library templates are primarily CUI/CMMC_L2_SELF + NIST_800_171_R2
    const rows: Array<{
      id: string;
      templateId: string;
      packageKey: string;
      applicability: string;
      informationType: string;
    }> = [
      {
        id: randomUUID(),
        templateId: t.id,
        packageKey: "CMMC_L2_SELF",
        applicability: "EXACT",
        informationType: "CUI",
      },
      {
        id: randomUUID(),
        templateId: t.id,
        packageKey: "NIST_800_171_R2",
        applicability: "EXACT",
        informationType: "CUI",
      },
    ];

    // Shared governance templates also apply to L1/FAR (SHARED = used by both)
    if (isShared) {
      rows.push(
        {
          id: randomUUID(),
          templateId: t.id,
          packageKey: "CMMC_L1_SELF",
          applicability: "SHARED",
          informationType: "BOTH",
        },
        {
          id: randomUUID(),
          templateId: t.id,
          packageKey: "FAR_52_204_21",
          applicability: "SHARED",
          informationType: "BOTH",
        }
      );

      // Update information_type on the template row itself
      await db.execute(sql.raw(
        `UPDATE document_templates SET information_type = 'BOTH' WHERE id = '${t.id}'`
      ));
    } else {
      // Pure CUI template
      await db.execute(sql.raw(
        `UPDATE document_templates SET information_type = 'CUI' WHERE id = '${t.id}'`
      ));
    }

    for (const row of rows) {
      await db
        .insert(docTemplatePackagesTable)
        .values(row)
        .onConflictDoNothing();
      inserted++;
    }
  }

  logger.info({ inserted }, "Doc template packages seeded for library templates");
}

// ── Level 1 template seed ─────────────────────────────────────────────────────
// Inserts 19 L1 templates (idempotent by sourceTemplateId).
// Each is tagged to CMMC_L1_SELF and FAR_52_204_21 in doc_template_packages.

async function seedLevel1Templates() {
  // Fetch existing L1 sourceTemplateIds to make seed idempotent
  const existing = await db
    .select({ sourceTemplateId: documentTemplatesTable.sourceTemplateId })
    .from(documentTemplatesTable)
    .where(
      inArray(
        documentTemplatesTable.sourceTemplateId,
        L1_TEMPLATES.map((t) => t.sourceTemplateId)
      )
    );
  const existingIds = new Set(existing.map((r) => r.sourceTemplateId));

  const toSeed = L1_TEMPLATES.filter((t) => !existingIds.has(t.sourceTemplateId));
  if (toSeed.length === 0) return;

  logger.info({ count: toSeed.length }, "Seeding L1 templates...");

  // Load L1 controls for mapping (control_id like "AC.L1-*")
  const l1Controls = await db
    .select({ id: controlsTable.id, controlId: controlsTable.controlId, nistRef: controlsTable.nistRef })
    .from(controlsTable)
    .where(sql`${controlsTable.level} = 'L1'`);

  // Build nistRef → control row map
  const nistToL1 = new Map<string, typeof l1Controls[0]>();
  for (const c of l1Controls) {
    if (c.nistRef) nistToL1.set(c.nistRef.trim(), c);
  }

  for (const tmpl of toSeed) {
    const templateId = randomUUID();
    const extractedPlaceholders = [
      ...new Set([
        ...(tmpl.requiredFields ?? []),
        ...(tmpl.bodyTemplate.match(/\{\{([A-Z_]+)\}\}/g) ?? []).map((p) =>
          p.replace(/\{\{|\}\}/g, "")
        ),
      ]),
    ];
    const computedArtifactTypeLabel =
      tmpl.docType === "policy"
        ? "Policy"
        : tmpl.docType === "procedure"
        ? "Procedure"
        : tmpl.docType === "log" || tmpl.docType === "access_review"
        ? "Log"
        : tmpl.docType === "training_record"
        ? "Training Record"
        : tmpl.docType === "asset_inventory"
        ? "Register/Table"
        : "Other";

    await db
      .insert(documentTemplatesTable)
      .values({
        id: templateId,
        title: tmpl.title,
        docType: tmpl.docType,
        cmmcLevel: tmpl.cmmcLevel,
        domainAbbr: tmpl.domainAbbr,
        ownerRole: tmpl.ownerRole,
        reviewFrequency: tmpl.reviewFrequency,
        description: tmpl.description,
        bodyTemplate: tmpl.bodyTemplate,
        requiredFields: tmpl.requiredFields,
        placeholders: extractedPlaceholders,
        linkedControlIds: [],
        requiresApproval: tmpl.requiresApproval,
        isSystemTemplate: tmpl.isSystemTemplate,
        sourceTemplateId: tmpl.sourceTemplateId,
        sourcePackage: "CMMC_L1_Document_Library",
        family: "Level 1 FCI",
        artifactTypeLabel: computedArtifactTypeLabel,
        purpose: tmpl.purpose,
        scope: tmpl.scope,
        informationType: tmpl.informationType,
        templateFamilyKey: tmpl.templateFamilyKey,
        outputFormat: "rich_text",
        isActive: true,
      } as any)
      .onConflictDoNothing();

    // Insert doc_template_packages rows
    for (const packageKey of tmpl.packageKeys) {
      await db
        .insert(docTemplatePackagesTable)
        .values({
          id: randomUUID(),
          templateId,
          packageKey,
          applicability: "EXACT",
          informationType: tmpl.informationType,
        })
        .onConflictDoNothing();
    }

    // Insert control maps
    for (const nistRef of tmpl.mappedL1Controls) {
      const ctrl = nistToL1.get(nistRef);
      await db
        .insert(docTemplateControlMapsTable)
        .values({
          id: randomUUID(),
          templateId,
          controlId: ctrl?.id ?? null,
          nistControlNumber: nistRef,
          supportType: "primary",
          artifactType: computedArtifactTypeLabel,
        } as any)
        .onConflictDoNothing();
    }
  }

  logger.info({ seeded: toSeed.length }, "L1 templates seeded");
}

// ── Placeholder manifest seed ──────────────────────────────────────────────────
// Extracts {{TOKEN}} from all template bodies and inserts manifest rows.
// Idempotent: skips templates already present in the manifest table.

const REQUIRED_PLACEHOLDER_KEYS = new Set([
  "ORGANIZATION_NAME",
  "EFFECTIVE_DATE",
  "REVIEW_DATE",
  "VERSION",
  "APPROVER_NAME",
  "SYSTEM_OWNER",
  "SYSTEM_NAME",
  "ACCESS_REVIEW_FREQUENCY",
  "MALWARE_SCAN_FREQUENCY",
]);

const PLACEHOLDER_LABELS: Record<string, { label: string; section?: string; dataType?: string; helpText?: string }> = {
  ORGANIZATION_NAME: { label: "Organization Name", section: "Header", dataType: "text", helpText: "Full legal name of the organization" },
  SYSTEM_NAME: { label: "System Name", section: "Header", dataType: "text", helpText: "Name of the information system in scope" },
  EFFECTIVE_DATE: { label: "Effective Date", section: "Header", dataType: "date", helpText: "Date this document takes effect" },
  REVIEW_DATE: { label: "Next Review Date", section: "Header", dataType: "date", helpText: "Date the document must next be reviewed" },
  VERSION: { label: "Version", section: "Header", dataType: "text" },
  POLICY_OWNER: { label: "Policy Owner", section: "Header", dataType: "text" },
  PROCEDURE_OWNER: { label: "Procedure Owner", section: "Header", dataType: "text" },
  APPROVER_NAME: { label: "Approver Name", section: "Approval", dataType: "text" },
  APPROVER_TITLE: { label: "Approver Title", section: "Approval", dataType: "text" },
  APPROVAL_DATE: { label: "Approval Date", section: "Approval", dataType: "date" },
  SYSTEM_OWNER: { label: "System Owner", section: "Header", dataType: "text" },
  SECURITY_OFFICER: { label: "Security Officer Name", section: "Header", dataType: "text" },
  IT_ADMIN: { label: "IT Administrator Name", section: "Header", dataType: "text" },
  ACCESS_REVIEW_FREQUENCY: { label: "Access Review Frequency", section: "Controls", dataType: "text", helpText: "e.g. quarterly, semi-annually, annually" },
  MALWARE_SCAN_FREQUENCY: { label: "Malware Scan Frequency", section: "Controls", dataType: "text", helpText: "e.g. daily, weekly, monthly" },
  INACTIVE_ACCOUNT_DAYS: { label: "Inactive Account Threshold (Days)", section: "Controls", dataType: "number" },
  LOCKOUT_ATTEMPTS: { label: "Lockout Attempts", section: "Controls", dataType: "number" },
  LOCKOUT_DURATION: { label: "Lockout Duration", section: "Controls", dataType: "text" },
  REVIEW_PERIOD: { label: "Review Period", section: "Header", dataType: "text", helpText: "e.g. Q1 2026" },
  SCAN_DATE: { label: "Scan Date", section: "Header", dataType: "date" },
  SCAN_TOOL: { label: "Scan Tool Name", section: "Controls", dataType: "text" },
  TOTAL_ACCOUNTS: { label: "Total Account Count", section: "Summary", dataType: "number" },
  ACCOUNTS_REMOVED: { label: "Accounts Removed", section: "Summary", dataType: "number" },
  ACCOUNTS_MODIFIED: { label: "Accounts Modified", section: "Summary", dataType: "number" },
  INCIDENT_COUNT: { label: "Incident Count", section: "Summary", dataType: "number" },
  ANOMALIES_NOTED: { label: "Anomalies / Notes", section: "Summary", dataType: "text" },
  FINDINGS_AND_ACTIONS: { label: "Findings and Actions", section: "Summary", dataType: "text" },
  ANNUAL_TRAINING_DEADLINE: { label: "Annual Training Deadline", section: "Controls", dataType: "text" },
};

async function seedDocTemplatePlaceholderManifest() {
  // Find templates that already have manifest rows
  const alreadyHaveManifest = await db
    .select({ templateId: docTemplatePlaceholderManifestTable.templateId })
    .from(docTemplatePlaceholderManifestTable)
    .groupBy(docTemplatePlaceholderManifestTable.templateId);
  const alreadySet = new Set(alreadyHaveManifest.map((r) => r.templateId));

  // Fetch all active templates with body
  const templates = await db
    .select({
      id: documentTemplatesTable.id,
      bodyTemplate: documentTemplatesTable.bodyTemplate,
    })
    .from(documentTemplatesTable)
    .where(sql`${documentTemplatesTable.isActive} = true`);

  const toSeed = templates.filter((t) => !alreadySet.has(t.id));
  if (toSeed.length === 0) return;

  logger.info({ count: toSeed.length }, "Seeding doc template placeholder manifest...");
  let insertedTotal = 0;

  for (const t of toSeed) {
    const body = t.bodyTemplate ?? "";
    const tokens = [...new Set((body.match(/\{\{([A-Z_]+)\}\}/g) ?? []).map((p) => p.replace(/\{\{|\}\}/g, "")))];
    if (tokens.length === 0) continue;

    for (let i = 0; i < tokens.length; i++) {
      const key = tokens[i];
      const meta = PLACEHOLDER_LABELS[key] ?? { label: key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()) };
      await db
        .insert(docTemplatePlaceholderManifestTable)
        .values({
          id: randomUUID(),
          templateId: t.id,
          placeholderKey: key,
          displayLabel: meta.label,
          section: meta.section ?? null,
          dataType: meta.dataType ?? "text",
          required: REQUIRED_PLACEHOLDER_KEYS.has(key),
          defaultSource: REQUIRED_PLACEHOLDER_KEYS.has(key) ? "organization" : null,
          defaultValue: null,
          validationRule: null,
          helpText: meta.helpText ?? null,
          packageKey: null,
          allowDocumentOverride: true,
          sortOrder: i,
        } as any)
        .onConflictDoNothing();
      insertedTotal++;
    }
  }

  logger.info({ insertedTotal }, "Doc template placeholder manifest seeded");
}

// ── CSV dry-run report ─────────────────────────────────────────────────────────

async function generateDocTemplateApplicabilityCsv() {
  const workspaceRoot = process.env.REPL_HOME ?? "/home/runner/workspace";
  const outPath = `${workspaceRoot}/artifacts/api-server/src/data/Documentation_Template_Applicability_Dry_Run.csv`;

  try {
    // Fetch all templates with their package rows
    const templates = await db
      .select({
        id: documentTemplatesTable.id,
        sourceTemplateId: documentTemplatesTable.sourceTemplateId,
        title: documentTemplatesTable.title,
        family: documentTemplatesTable.family,
        artifactTypeLabel: documentTemplatesTable.artifactTypeLabel,
        cmmcLevel: documentTemplatesTable.cmmcLevel,
        informationType: documentTemplatesTable.informationType,
        templateFamilyKey: documentTemplatesTable.templateFamilyKey,
        isActive: documentTemplatesTable.isActive,
      })
      .from(documentTemplatesTable)
      .where(sql`${documentTemplatesTable.sourceTemplateId} IS NOT NULL`);

    if (templates.length === 0) return;

    const templateIds = templates.map((t) => t.id);

    // Fetch package rows
    const pkgRows = await db
      .select({
        templateId: docTemplatePackagesTable.templateId,
        packageKey: docTemplatePackagesTable.packageKey,
        applicability: docTemplatePackagesTable.applicability,
        informationType: docTemplatePackagesTable.informationType,
      })
      .from(docTemplatePackagesTable)
      .where(inArray(docTemplatePackagesTable.templateId, templateIds));

    const pkgByTemplate = new Map<string, typeof pkgRows>();
    for (const row of pkgRows) {
      if (!pkgByTemplate.has(row.templateId)) pkgByTemplate.set(row.templateId, []);
      pkgByTemplate.get(row.templateId)!.push(row);
    }

    // Fetch control maps
    const ctrlMaps = await db
      .select({
        templateId: docTemplateControlMapsTable.templateId,
        nistControlNumber: docTemplateControlMapsTable.nistControlNumber,
      })
      .from(docTemplateControlMapsTable)
      .where(inArray(docTemplateControlMapsTable.templateId, templateIds));

    const ctrlByTemplate = new Map<string, string[]>();
    for (const cm of ctrlMaps) {
      if (!ctrlByTemplate.has(cm.templateId)) ctrlByTemplate.set(cm.templateId, []);
      ctrlByTemplate.get(cm.templateId)!.push(cm.nistControlNumber);
    }

    // Build CSV
    const escape = (v: string) => `"${(v ?? "").replace(/"/g, '""')}"`;
    const headers = [
      "Template ID",
      "Title",
      "Category / Family",
      "Artifact Type",
      "Existing Control Mappings",
      "CUI/FCI Language",
      "Proposed Package Applicability",
      "Proposed Information Type",
      "Proposed Variant Family",
      "CMMC Level",
      "Active",
      "Conflicts",
      "Recommended Action",
    ];

    const rows: string[][] = [headers];

    for (const t of templates) {
      const pkgs = pkgByTemplate.get(t.id) ?? [];
      const controls = ctrlByTemplate.get(t.id) ?? [];
      const packageApplicability = pkgs
        .map((p) => `${p.packageKey}:${p.applicability}`)
        .join("; ");
      const pkgInfoType = pkgs[0]?.informationType ?? "";
      const fciFlavor = (t.informationType ?? pkgInfoType).includes("FCI")
        ? "FCI"
        : (t.informationType ?? pkgInfoType).includes("CUI")
        ? "CUI"
        : "Both/Mixed";

      // Detect conflicts: template tagged FCI but has CUI control mappings → flag
      const hasL2Controls = controls.some((c) => !c.startsWith("3.1") && !c.startsWith("3.5") && !c.startsWith("3.8") && !c.startsWith("3.10") && !c.startsWith("3.13") && !c.startsWith("3.14"));
      const conflict = fciFlavor === "FCI" && hasL2Controls ? "FCI template mapped to L2-only controls" : "";

      const action =
        pkgs.length === 0
          ? "Tag with default CMMC_L2_SELF / NIST_800_171_R2 EXACT"
          : conflict
          ? "Review control mapping for FCI/CUI mismatch"
          : "No action required";

      rows.push([
        escape(t.sourceTemplateId ?? ""),
        escape(t.title),
        escape(t.family ?? ""),
        escape(t.artifactTypeLabel ?? ""),
        escape(controls.slice(0, 5).join(", ") + (controls.length > 5 ? ` (+${controls.length - 5} more)` : "")),
        escape(fciFlavor),
        escape(packageApplicability),
        escape(t.informationType ?? pkgInfoType ?? ""),
        escape(t.templateFamilyKey ?? ""),
        escape(t.cmmcLevel ?? ""),
        escape(t.isActive ? "Yes" : "No"),
        escape(conflict),
        escape(action),
      ]);
    }

    const csvContent = rows.map((r) => r.join(",")).join("\n");
    mkdirSync(`${workspaceRoot}/artifacts/api-server/src/data`, { recursive: true });
    writeFileSync(outPath, csvContent, "utf-8");
    logger.info({ rows: rows.length - 1, path: outPath }, "Documentation_Template_Applicability_Dry_Run.csv generated");
  } catch (err: any) {
    logger.warn({ err: err.message }, "CSV dry-run report generation skipped (non-fatal)");
  }
}

// ── Task 79: L1 Annual Assessment schema migrations ───────────────────────────

async function migrateOrgFeatureEnumL1Annual() {
  // L1_ANNUAL_ASSESSMENT was added to org_feature_key enum for L1 Assessment module.
  try {
    await db.execute(sql.raw(
      `ALTER TYPE org_feature_key ADD VALUE IF NOT EXISTS 'L1_ANNUAL_ASSESSMENT'`
    ));
  } catch (_e) {
    // Already exists or DDL not allowed in transaction — safe to ignore
  }
}

async function migrateL1AssessmentTables() {
  // Create enums for Level 1 assessment if they don't already exist
  const enumStmts = [
    `DO $$ BEGIN
       IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'level1_assessment_status') THEN
         CREATE TYPE level1_assessment_status AS ENUM ('draft', 'in_progress', 'submitted', 'affirmed', 'locked');
       END IF;
     END $$`,
    `DO $$ BEGIN
       IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'level1_finding') THEN
         CREATE TYPE level1_finding AS ENUM ('met', 'not_met', 'not_applicable', 'not_reviewed');
       END IF;
     END $$`,
    `DO $$ BEGIN
       IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'level1_objective_result') THEN
         CREATE TYPE level1_objective_result AS ENUM ('satisfied', 'other_than_satisfied', 'not_applicable', 'not_reviewed');
       END IF;
     END $$`,
    `DO $$ BEGIN
       IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'level1_assessment_use') THEN
         CREATE TYPE level1_assessment_use AS ENUM ('examine', 'interview', 'test');
       END IF;
     END $$`,
    `DO $$ BEGIN
       IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'level1_evidence_qualification') THEN
         CREATE TYPE level1_evidence_qualification AS ENUM ('directly_applicable', 'partially_applicable', 'supplementary');
       END IF;
     END $$`,
  ];

  // Create tables
  const tableStmts = [
    // 1. Top-level annual assessment record
    `CREATE TABLE IF NOT EXISTS level1_annual_assessments (
      id text PRIMARY KEY,
      organization_id text NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      assessment_year integer NOT NULL,
      scope_name text NOT NULL DEFAULT 'Default',
      title text NOT NULL,
      description text,
      status level1_assessment_status NOT NULL DEFAULT 'draft',
      affirming_official_name text,
      affirming_official_title text,
      affirming_official_id text REFERENCES users(id) ON DELETE SET NULL,
      affirmed_at timestamptz,
      submitted_at timestamptz,
      submitted_by_id text REFERENCES users(id) ON DELETE SET NULL,
      locked_at timestamptz,
      locked_by_id text REFERENCES users(id) ON DELETE SET NULL,
      overall_score integer,
      snapshot_metadata text,
      created_by_id text REFERENCES users(id) ON DELETE SET NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    )`,
    `CREATE UNIQUE INDEX IF NOT EXISTS level1_annual_assessments_org_year_scope_uniq
      ON level1_annual_assessments(organization_id, assessment_year, scope_name)`,

    // 2. Per-requirement finding within an assessment
    `CREATE TABLE IF NOT EXISTS level1_assessment_requirements (
      id text PRIMARY KEY,
      assessment_id text NOT NULL REFERENCES level1_annual_assessments(id) ON DELETE CASCADE,
      requirement_id text NOT NULL,
      canonical_key text,
      requirement_title text,
      finding level1_finding NOT NULL DEFAULT 'not_reviewed',
      implementation_narrative text,
      assessor_notes text,
      na_justification text,
      last_updated_by_id text REFERENCES users(id) ON DELETE SET NULL,
      sort_order integer NOT NULL DEFAULT 0,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    )`,
    `CREATE UNIQUE INDEX IF NOT EXISTS level1_assessment_requirements_assessment_req_uniq
      ON level1_assessment_requirements(assessment_id, requirement_id)`,

    // 3. Detailed determination objectives per requirement
    `CREATE TABLE IF NOT EXISTS level1_assessment_objectives (
      id text PRIMARY KEY,
      assessment_requirement_id text NOT NULL REFERENCES level1_assessment_requirements(id) ON DELETE CASCADE,
      objective_text text NOT NULL,
      result level1_objective_result NOT NULL DEFAULT 'not_reviewed',
      notes text,
      sort_order integer NOT NULL DEFAULT 0,
      last_updated_by_id text REFERENCES users(id) ON DELETE SET NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    )`,

    // 4. Evidence links for the assessment
    `CREATE TABLE IF NOT EXISTS level1_assessment_evidence_links (
      id text PRIMARY KEY,
      assessment_id text NOT NULL REFERENCES level1_annual_assessments(id) ON DELETE CASCADE,
      assessment_requirement_id text REFERENCES level1_assessment_requirements(id) ON DELETE CASCADE,
      evidence_item_id text,
      evidence_description text,
      assessment_use level1_assessment_use NOT NULL DEFAULT 'examine',
      qualification level1_evidence_qualification NOT NULL DEFAULT 'directly_applicable',
      file_key text,
      file_name text,
      notes text,
      linked_by_id text REFERENCES users(id) ON DELETE SET NULL,
      linked_at timestamptz NOT NULL DEFAULT now(),
      created_at timestamptz NOT NULL DEFAULT now()
    )`,

    // 5. Requirement ↔ external authority clause mappings
    `CREATE TABLE IF NOT EXISTS requirement_authority_mappings (
      id text PRIMARY KEY,
      requirement_id text NOT NULL REFERENCES compliance_requirements(id) ON DELETE CASCADE,
      authority_key text NOT NULL,
      authority_clause text NOT NULL,
      relationship_type text NOT NULL DEFAULT 'IMPLEMENTS',
      rollup_group text,
      notes text,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE (requirement_id, authority_key, authority_clause)
    )`,
    `CREATE INDEX IF NOT EXISTS requirement_authority_mappings_authority_key_idx
      ON requirement_authority_mappings(authority_key)`,
  ];

  // Add canonical_key column to compliance_requirements if not present
  const columnStmt = `ALTER TABLE compliance_requirements ADD COLUMN IF NOT EXISTS canonical_key text`;

  for (const stmt of [...enumStmts, ...tableStmts, columnStmt]) {
    try {
      await db.execute(sql.raw(stmt));
    } catch (_e) {
      // Already exists — safe to ignore
    }
  }
}

// ── L1 requirement → FAR 52.204-21 authority mappings ────────────────────────

/**
 * Canonical keys for each of the 17 CMMC Level 1 practices.
 * Stable identifiers used for cross-package linkage in the L1 Annual Assessment.
 */
const L1_CANONICAL_KEY_MAP: Record<string, { canonicalKey: string; farClause: string; rollupGroup?: string }> = {
  "AC.L1-3.1.1":  { canonicalKey: "L1-AC-1",  farClause: "(i)" },
  "AC.L1-3.1.2":  { canonicalKey: "L1-AC-2",  farClause: "(ii)" },
  "AC.L1-3.1.20": { canonicalKey: "L1-AC-3",  farClause: "(iii)" },
  "AC.L1-3.1.22": { canonicalKey: "L1-AC-4",  farClause: "(iv)" },
  "IA.L1-3.5.1":  { canonicalKey: "L1-IA-1",  farClause: "(v)" },
  "IA.L1-3.5.2":  { canonicalKey: "L1-IA-2",  farClause: "(vi)" },
  "MP.L1-3.8.3":  { canonicalKey: "L1-MP-1",  farClause: "(vii)" },
  "PE.L1-3.10.1": { canonicalKey: "L1-PE-1",  farClause: "(viii)" },
  // FAR clause (ix) covers three Physical Protection requirements:
  // Visitor Escort, Physical Access Logs, and Physical Access Devices
  "PE.L1-3.10.3": { canonicalKey: "L1-PE-2",  farClause: "(ix)", rollupGroup: "ix" },
  "PE.L1-3.10.4": { canonicalKey: "L1-PE-3",  farClause: "(ix)", rollupGroup: "ix" },
  "PE.L1-3.10.5": { canonicalKey: "L1-PE-4",  farClause: "(ix)", rollupGroup: "ix" },
  "SC.L1-3.13.1": { canonicalKey: "L1-SC-1",  farClause: "(x)" },
  "SC.L1-3.13.5": { canonicalKey: "L1-SC-2",  farClause: "(xi)" },
  "SI.L1-3.14.1": { canonicalKey: "L1-SI-1",  farClause: "(xii)" },
  "SI.L1-3.14.2": { canonicalKey: "L1-SI-2",  farClause: "(xiii)" },
  "SI.L1-3.14.4": { canonicalKey: "L1-SI-3",  farClause: "(xiv)" },
  "SI.L1-3.14.5": { canonicalKey: "L1-SI-4",  farClause: "(xv)" },
};

async function seedL1RequirementAuthorityMappings() {
  // Fetch existing authority mapping count for the FAR authority to detect first-run
  const [{ cnt: existingMappingCount }] = await db
    .select({ cnt: count() })
    .from(requirementAuthorityMappingsTable)
    .where(eq(requirementAuthorityMappingsTable.authorityKey, "FAR_52_204_21"));

  // Fetch the 17 CMMC L1 requirements from compliance_requirements (pkg-cmmc-l1-self)
  const l1Reqs = await db
    .select({
      id: complianceRequirementsTable.id,
      requirementId: complianceRequirementsTable.requirementId,
      canonicalKey: complianceRequirementsTable.canonicalKey,
    })
    .from(complianceRequirementsTable)
    .where(eq(complianceRequirementsTable.packageId, "pkg-cmmc-l1-self"));

  if (l1Reqs.length === 0) {
    // Requirements not yet seeded — will be resolved on next startup
    return;
  }

  // Upsert canonical_key on each L1 compliance_requirement row
  let canonicalKeyUpdates = 0;
  for (const req of l1Reqs) {
    const mapping = L1_CANONICAL_KEY_MAP[req.requirementId];
    if (mapping && !req.canonicalKey) {
      await db.execute(sql.raw(
        `UPDATE compliance_requirements SET canonical_key = '${mapping.canonicalKey}' WHERE id = '${req.id}'`
      ));
      canonicalKeyUpdates++;
    }
  }

  if (Number(existingMappingCount) >= l1Reqs.length) {
    // Already seeded; just apply any missing canonical key updates
    if (canonicalKeyUpdates > 0) {
      logger.info({ canonicalKeyUpdates }, "Updated missing canonical_key values on L1 compliance requirements");
    }
    return;
  }

  logger.info("Seeding L1 requirement → FAR 52.204-21 authority mappings...");

  let inserted = 0;
  for (const req of l1Reqs) {
    const meta = L1_CANONICAL_KEY_MAP[req.requirementId];
    if (!meta) continue;

    await db
      .insert(requirementAuthorityMappingsTable)
      .values({
        id: randomUUID(),
        requirementId: req.id,
        authorityKey: "FAR_52_204_21",
        authorityClause: meta.farClause,
        relationshipType: "IMPLEMENTS",
        rollupGroup: meta.rollupGroup ?? null,
        notes: `${req.requirementId} (${meta.canonicalKey}) implements FAR 52.204-21 clause ${meta.farClause}`,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: [
          requirementAuthorityMappingsTable.requirementId,
          requirementAuthorityMappingsTable.authorityKey,
          requirementAuthorityMappingsTable.authorityClause,
        ],
        set: {
          relationshipType: "IMPLEMENTS",
          rollupGroup: meta.rollupGroup ?? null,
          updatedAt: new Date(),
        },
      });
    inserted++;
  }

  logger.info(
    { inserted, canonicalKeyUpdates },
    "L1 requirement authority mappings seeded (FAR 52.204-21)"
  );
}

// ── L1 requirement startup diagnostic ─────────────────────────────────────────

/**
 * Non-blocking diagnostic that logs L1 requirement health at startup.
 * Logs to server log only — does not throw and does not block startup.
 */
async function diagnoseL1Requirements() {
  try {
    const EXPECTED_CANONICAL_KEYS = Object.values(L1_CANONICAL_KEY_MAP).map(m => m.canonicalKey);
    const EXPECTED_COUNT = EXPECTED_CANONICAL_KEYS.length; // 17

    // 1. Total L1 requirement count in pkg-cmmc-l1-self
    const [{ cnt: totalCount }] = await db
      .select({ cnt: count() })
      .from(complianceRequirementsTable)
      .where(eq(complianceRequirementsTable.packageId, "pkg-cmmc-l1-self"));

    // 2. L1 requirements that have a canonical_key set
    const withCanonicalKey = await db
      .select({ requirementId: complianceRequirementsTable.requirementId })
      .from(complianceRequirementsTable)
      .where(
        and(
          eq(complianceRequirementsTable.packageId, "pkg-cmmc-l1-self"),
          sql`${complianceRequirementsTable.canonicalKey} IS NOT NULL`
        )
      );

    // 3. L1 requirements missing FAR authority mappings
    const l1Reqs = await db
      .select({ id: complianceRequirementsTable.id, requirementId: complianceRequirementsTable.requirementId })
      .from(complianceRequirementsTable)
      .where(eq(complianceRequirementsTable.packageId, "pkg-cmmc-l1-self"));

    const mappedReqIds = new Set<string>();
    if (l1Reqs.length > 0) {
      const mappings = await db
        .select({ requirementId: requirementAuthorityMappingsTable.requirementId })
        .from(requirementAuthorityMappingsTable)
        .where(
          and(
            eq(requirementAuthorityMappingsTable.authorityKey, "FAR_52_204_21"),
            inArray(requirementAuthorityMappingsTable.requirementId, l1Reqs.map(r => r.id))
          )
        );
      for (const m of mappings) mappedReqIds.add(m.requirementId);
    }

    const missingFarMappings = l1Reqs
      .filter(r => !mappedReqIds.has(r.id))
      .map(r => r.requirementId);

    // 4. Requirements sharing a FAR clause outside expected rollup group
    const clauseIxMappings = await db
      .select({
        requirementId: requirementAuthorityMappingsTable.requirementId,
        rollupGroup: requirementAuthorityMappingsTable.rollupGroup,
      })
      .from(requirementAuthorityMappingsTable)
      .where(
        and(
          eq(requirementAuthorityMappingsTable.authorityKey, "FAR_52_204_21"),
          eq(requirementAuthorityMappingsTable.authorityClause, "(ix)")
        )
      );

    const unexpectedClauseIx = clauseIxMappings.filter(m => m.rollupGroup !== "ix");

    // 5. Which canonical keys are missing
    const presentRequirementIds = new Set(l1Reqs.map(r => r.requirementId));
    const missingCanonicalKeys = EXPECTED_CANONICAL_KEYS.filter(key => {
      const controlId = Object.entries(L1_CANONICAL_KEY_MAP).find(([, v]) => v.canonicalKey === key)?.[0];
      return !controlId || !presentRequirementIds.has(controlId);
    });

    logger.info(
      {
        l1RequirementCount: Number(totalCount),
        expectedCount: EXPECTED_COUNT,
        withCanonicalKey: withCanonicalKey.length,
        missingFarMappings: missingFarMappings.length > 0 ? missingFarMappings : "none",
        unexpectedClauseIx: unexpectedClauseIx.length > 0 ? unexpectedClauseIx.map(m => m.requirementId) : "none",
        missingCanonicalKeys: missingCanonicalKeys.length > 0 ? missingCanonicalKeys : "none",
      },
      "[L1 Diagnostic] L1 requirement health check complete"
    );
  } catch (err: any) {
    logger.warn({ err: err.message }, "[L1 Diagnostic] Non-blocking L1 requirement diagnostic failed");
  }
}

// ─────────────────────────────────────────────────────────────────────────────

export async function runStartupSeed() {
  try {
    await migrateSsoTable();
    await migrateFaqTable();
    await migrateMicrosoftSsoColumns();
    await migrateCertificationTables();
    await migrateBreakGlassColumns();
    await migrateAuditEnum();
    await migrateRoadmapProfileKey();
    await migrateOrgFeatureEnum();
    await migrateSspPrefillDrafts();
    // ── Task 59: doc template schema additions ────────────────────────────
    await migrateDocTemplateNewColumns();
    await migrateDocTemplatePackagesTable();
    await migrateDocTemplatePlaceholderManifestTable();
    await migrateDocumentReviewRequestsTable();
    // ─────────────────────────────────────────────────────────────────────
    await seedDomainControls();
    await seedInitialAdmin();
    await migrateHelpNewColumns();
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
    // ── Task 59: package applicability + L1 templates + manifest + CSV ───
    await seedDocTemplatePackages();
    await seedLevel1Templates();
    await seedDocTemplatePlaceholderManifest();
    await generateDocTemplateApplicabilityCsv();
    // ─────────────────────────────────────────────────────────────────────
    // ── Task 79: L1 Annual Assessment — DB schema & seed data ─────────────
    await migrateOrgFeatureEnumL1Annual();
    await migrateL1AssessmentTables();
    await seedL1RequirementAuthorityMappings();
    // Non-blocking startup diagnostic — logs to server log only
    diagnoseL1Requirements().catch(() => {/* already caught internally */});
    // ─────────────────────────────────────────────────────────────────────
  } catch (err) {
    logger.error({ err }, "Startup seed failed — app will continue but may lack reference data");
  }
}
