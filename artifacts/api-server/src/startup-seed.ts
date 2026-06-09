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
  securitySettingsTable,
} from "@workspace/db";
import { count, eq, sql } from "drizzle-orm";
import { seedMonitoringItemsForOrg } from "./routes/monitoring";
import { seedControlConfigure } from "./routes/configure";
import { seedRoadmapActions, seedProcedureSteps } from "./routes/roadmap";
import { logger } from "./lib/logger";
import { DOCUMENT_TEMPLATES } from "./data/document-templates-data";
import { seedDemoOrg } from "./demo-seed-org";

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
    title: "IT Administrator",
    department: "Information Technology",
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  }).onConflictDoNothing();

  logger.info("Initial admin created: admin@example.com / Admin1234! — change this password immediately");
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

async function migrateAuditEnum() {
  const missingValues = [
    "viewed", "deactivated", "activated", "password_reset", "org_access_changed",
    "create", "update", "generate", "submit_review", "approve", "reject",
    "activate", "archive", "complete", "complete_checklist", "run_doc_checks",
    "password_changed", "login_failed", "account_locked", "account_unlocked",
    "mfa_setup_started", "mfa_enabled", "mfa_verify_success", "mfa_verify_failure",
    "mfa_recovery_code_used", "mfa_reset_by_admin", "mfa_disabled", "mfa_policy_changed",
    "mfa_required_set",
  ];
  for (const val of missingValues) {
    try {
      await db.execute(sql.raw(`ALTER TYPE audit_action ADD VALUE IF NOT EXISTS '${val}'`));
    } catch (_e) {
      // Already exists or concurrent add — safe to ignore
    }
  }
}

export async function runStartupSeed() {
  try {
    await migrateAuditEnum();
    await seedDomainControls();
    await seedInitialAdmin();
    await seedDocumentTemplates();
    await seedMonitoringItems();
    await seedControlConfigure();
    await seedRoadmapActions();
    await seedProcedureSteps();
    await seedDemoOrg();
    await seedSecuritySettings();
  } catch (err) {
    logger.error({ err }, "Startup seed failed — app will continue but may lack reference data");
  }
}
