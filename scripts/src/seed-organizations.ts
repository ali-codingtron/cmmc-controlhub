import {
  db,
  usersTable,
  organizationsTable,
  organizationUsersTable,
  controlsTable,
  controlAssessmentsTable,
  evidenceItemsTable,
  tasksTable,
  poamsTable,
  auditLogsTable,
  documentsTable,
  documentTemplatesTable,
  generatedLogsTable,
  checklistCompletionsTable,
} from "@workspace/db";
import bcrypt from "bcryptjs";
import { randomUUID } from "crypto";
import { isNull } from "drizzle-orm";

async function seed() {
  console.log("Seeding organizations...");

  // ─── Fetch existing global users ────────────────────────────────────────────
  const existingUsers = await db.select().from(usersTable);
  const adminUser = existingUsers.find((u) => u.email === "admin@example.com");
  const complianceUser = existingUsers.find((u) => u.email === "compliance@example.com");
  const reviewerUser = existingUsers.find((u) => u.email === "reviewer@example.com");
  const assessorUser = existingUsers.find((u) => u.email === "assessor@example.com");

  if (!adminUser) {
    console.error("Admin user not found. Run seed-cmmc first.");
    process.exit(1);
  }

  // ─── Create 3 Organizations ─────────────────────────────────────────────────
  const internalOrgId = randomUUID();
  const clientAOrgId = randomUUID();
  const clientBOrgId = randomUUID();

  const orgsToInsert = [
    {
      id: internalOrgId,
      name: "Internal Company",
      legalName: "Internal Company LLC",
      shortName: "Internal",
      cageCode: "1ABC2",
      uei: "ABC123DEF456",
      industry: "Defense Contractor",
      primaryContact: adminUser.name,
      complianceManagerId: complianceUser?.id ?? adminUser.id,
      organizationAddress: "123 Main St, Arlington, VA 22201",
      assessmentScope: "All internal CUI systems and supporting infrastructure",
      cmmcTargetLevel: "L2" as const,
      notes: "Primary internal organization. Manages all internal CMMC readiness.",
      isActive: true,
    },
    {
      id: clientAOrgId,
      name: "Apex Defense LLC",
      legalName: "Apex Defense Solutions LLC",
      shortName: "Apex",
      cageCode: "2DEF3",
      uei: "DEF456GHI789",
      industry: "Aerospace & Defense",
      primaryContact: "Sarah Mitchell",
      complianceManagerId: adminUser.id,
      organizationAddress: "456 Pentagon Blvd, Crystal City, VA 22202",
      assessmentScope: "Engineering systems, proposal management, and CUI handling",
      cmmcTargetLevel: "L2" as const,
      notes: "Client organization. Active CMMC L2 assessment in progress.",
      isActive: true,
    },
    {
      id: clientBOrgId,
      name: "Meridian Systems Inc",
      legalName: "Meridian Systems Incorporated",
      shortName: "Meridian",
      cageCode: "3GHI4",
      uei: "GHI789JKL012",
      industry: "IT Services / Defense",
      primaryContact: "James Thornton",
      complianceManagerId: adminUser.id,
      organizationAddress: "789 Defense Ave, Bethesda, MD 20817",
      assessmentScope: "Managed IT services, cloud infrastructure, and CUI data flows",
      cmmcTargetLevel: "L1" as const,
      notes: "Client organization. Beginning CMMC L1 readiness program.",
      isActive: true,
    },
  ];

  for (const org of orgsToInsert) {
    await db.insert(organizationsTable).values(org).onConflictDoNothing();
  }
  console.log("Created 3 organizations");

  // ─── Assign existing global admin to all orgs ────────────────────────────────
  const orgMemberships = [
    // Admin (global_admin) → all 3
    { id: randomUUID(), organizationId: internalOrgId, userId: adminUser.id, role: "global_admin" as const, status: "active" as const, joinedAt: new Date() },
    { id: randomUUID(), organizationId: clientAOrgId, userId: adminUser.id, role: "global_admin" as const, status: "active" as const, joinedAt: new Date() },
    { id: randomUUID(), organizationId: clientBOrgId, userId: adminUser.id, role: "global_admin" as const, status: "active" as const, joinedAt: new Date() },
  ];

  if (complianceUser) {
    orgMemberships.push({ id: randomUUID(), organizationId: internalOrgId, userId: complianceUser.id, role: "compliance_manager" as const, status: "active" as const, joinedAt: new Date() });
  }
  if (reviewerUser) {
    orgMemberships.push({ id: randomUUID(), organizationId: internalOrgId, userId: reviewerUser.id, role: "reviewer" as const, status: "active" as const, joinedAt: new Date() });
  }
  if (assessorUser) {
    orgMemberships.push({ id: randomUUID(), organizationId: internalOrgId, userId: assessorUser.id, role: "assessor" as const, status: "active" as const, joinedAt: new Date() });
  }

  for (const m of orgMemberships) {
    await db.insert(organizationUsersTable).values(m).onConflictDoNothing();
  }
  console.log("Assigned existing users to organizations");

  // ─── Create org-specific users for Client A ──────────────────────────────────
  const hash = await bcrypt.hash("Admin1234!", 10);

  const apexComplianceId = randomUUID();
  const apexItId = randomUUID();
  const meridianComplianceId = randomUUID();
  const meridianItId = randomUUID();

  const newUsers = [
    { id: apexComplianceId, name: "Sarah Mitchell", email: "sarah@apex-defense.com", passwordHash: hash, role: "compliance_manager" as const, title: "CMMC Compliance Manager", department: "Compliance", isActive: true },
    { id: apexItId, name: "Derek Wang", email: "derek@apex-defense.com", passwordHash: hash, role: "it_contributor" as const, title: "IT Security Engineer", department: "IT", isActive: true },
    { id: meridianComplianceId, name: "James Thornton", email: "james@meridian-systems.com", passwordHash: hash, role: "compliance_manager" as const, title: "IT Compliance Lead", department: "IT", isActive: true },
    { id: meridianItId, name: "Priya Nair", email: "priya@meridian-systems.com", passwordHash: hash, role: "it_contributor" as const, title: "Systems Administrator", department: "IT", isActive: true },
  ];

  for (const u of newUsers) {
    await db.insert(usersTable).values(u).onConflictDoNothing();
  }
  console.log("Created 4 org-specific users");

  // Org memberships for new users
  const newMemberships = [
    { id: randomUUID(), organizationId: clientAOrgId, userId: apexComplianceId, role: "compliance_manager" as const, status: "active" as const, joinedAt: new Date() },
    { id: randomUUID(), organizationId: clientAOrgId, userId: apexItId, role: "it_contributor" as const, status: "active" as const, joinedAt: new Date() },
    { id: randomUUID(), organizationId: clientBOrgId, userId: meridianComplianceId, role: "compliance_manager" as const, status: "active" as const, joinedAt: new Date() },
    { id: randomUUID(), organizationId: clientBOrgId, userId: meridianItId, role: "it_contributor" as const, status: "active" as const, joinedAt: new Date() },
  ];
  for (const m of newMemberships) {
    await db.insert(organizationUsersTable).values(m).onConflictDoNothing();
  }

  // ─── Migrate existing data to Internal Company ──────────────────────────────
  console.log("Migrating existing data to Internal Company...");

  await db.update(controlAssessmentsTable)
    .set({ organizationId: internalOrgId })
    .where(isNull(controlAssessmentsTable.organizationId));

  await db.update(evidenceItemsTable)
    .set({ organizationId: internalOrgId })
    .where(isNull(evidenceItemsTable.organizationId));

  await db.update(tasksTable)
    .set({ organizationId: internalOrgId })
    .where(isNull(tasksTable.organizationId));

  await db.update(poamsTable)
    .set({ organizationId: internalOrgId })
    .where(isNull(poamsTable.organizationId));

  await db.update(auditLogsTable)
    .set({ organizationId: internalOrgId })
    .where(isNull(auditLogsTable.organizationId));

  await db.update(documentsTable)
    .set({ organizationId: internalOrgId })
    .where(isNull(documentsTable.organizationId));

  await db.update(documentTemplatesTable)
    .set({ organizationId: null })
    .where(isNull(documentTemplatesTable.organizationId));

  await db.update(generatedLogsTable)
    .set({ organizationId: internalOrgId })
    .where(isNull(generatedLogsTable.organizationId));

  await db.update(checklistCompletionsTable)
    .set({ organizationId: internalOrgId })
    .where(isNull(checklistCompletionsTable.organizationId));

  console.log("Migrated existing data to Internal Company");

  // ─── Create sample data for Client A (Apex Defense) ──────────────────────────
  const allControls = await db.select({ id: controlsTable.id, level: controlsTable.level }).from(controlsTable);
  const l1Controls = allControls.filter((c) => c.level === "L1");
  const l2Controls = allControls.filter((c) => c.level === "L2");

  // Apex: 60% implemented L1, mixed L2
  const apexStatuses = ["implemented", "implemented", "implemented", "in_progress", "needs_review", "not_started", "assessor_ready", "at_risk"] as const;
  for (const ctrl of allControls) {
    const status = apexStatuses[Math.floor(Math.random() * apexStatuses.length)];
    await db.insert(controlAssessmentsTable).values({
      id: randomUUID(),
      organizationId: clientAOrgId,
      controlId: ctrl.id,
      status,
      implementationNarrative: status === "not_started" ? null : `Apex Defense has ${status === "implemented" ? "fully implemented" : "partially addressed"} this control through established security policies and technical controls.`,
      assessedById: apexComplianceId,
      createdAt: new Date(),
      updatedAt: new Date(),
    }).onConflictDoNothing();
  }
  console.log("Created Apex control assessments");

  // Apex evidence
  const apexEvidenceTypes = ["policy", "screenshot", "log", "report", "configuration_export"] as const;
  const apexEvidenceTitles = [
    { title: "Information Security Policy v2.1", type: "policy" as const },
    { title: "Access Control Configuration Export", type: "configuration_export" as const },
    { title: "Security Awareness Training Records Q1", type: "training_record" as const },
    { title: "Incident Response Log 2025", type: "incident_record" as const },
    { title: "Vulnerability Scan Report - March 2025", type: "scan_report" as const },
    { title: "System Access Review Screenshot", type: "screenshot" as const },
    { title: "Backup Verification Log", type: "log" as const },
    { title: "Network Diagram - Current State", type: "network_diagram" as const },
  ];
  for (const ev of apexEvidenceTitles) {
    await db.insert(evidenceItemsTable).values({
      id: randomUUID(),
      organizationId: clientAOrgId,
      title: ev.title,
      evidenceType: ev.type,
      status: ["approved", "pending_review", "assessor_ready"][Math.floor(Math.random() * 3)] as any,
      ownerId: apexComplianceId,
      version: "1.0",
      tags: [],
      isCurrentVersion: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    }).onConflictDoNothing();
  }
  console.log("Created Apex evidence");

  // Apex tasks
  const apexTasks = [
    { title: "Complete MFA rollout for all systems", priority: "high" as const, type: "control_review" as const },
    { title: "Update Incident Response Policy", priority: "medium" as const, type: "policy_review" as const },
    { title: "Perform quarterly access review", priority: "high" as const, type: "access_review" as const },
    { title: "Document backup procedures", priority: "medium" as const, type: "procedure_review" as const },
    { title: "Schedule CMMC readiness assessment", priority: "critical" as const, type: "control_review" as const },
  ];
  for (const t of apexTasks) {
    const daysOffset = Math.floor(Math.random() * 60) - 10;
    const dueDate = new Date();
    dueDate.setDate(dueDate.getDate() + daysOffset);
    await db.insert(tasksTable).values({
      id: randomUUID(),
      organizationId: clientAOrgId,
      title: t.title,
      status: daysOffset < 0 ? "overdue" : "open",
      priority: t.priority,
      taskType: t.type,
      dueDate,
      assigneeId: apexComplianceId,
      createdById: adminUser.id,
      tags: [],
      isRecurring: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    }).onConflictDoNothing();
  }
  console.log("Created Apex tasks");

  // Apex POA&Ms
  const apexPoams = [
    { title: "Implement Multi-Factor Authentication", description: "MFA not yet deployed on all systems. High risk gap.", risk: "high" as const },
    { title: "Establish Formal Incident Response Capability", description: "No documented IR procedure exists.", risk: "critical" as const },
    { title: "Implement Configuration Management Baseline", description: "System baselines not documented or enforced.", risk: "medium" as const },
  ];
  let poamNum = 1;
  for (const p of apexPoams) {
    const completionDate = new Date();
    completionDate.setDate(completionDate.getDate() + 90);
    await db.insert(poamsTable).values({
      id: randomUUID(),
      organizationId: clientAOrgId,
      poamNumber: `APEX-${String(poamNum++).padStart(3, "0")}`,
      title: p.title,
      deficiencyDescription: p.description,
      status: "open",
      riskLevel: p.risk,
      ownerId: apexComplianceId,
      remediationPlan: "To be developed by compliance team.",
      scheduledCompletionDate: completionDate,
      createdAt: new Date(),
      updatedAt: new Date(),
    }).onConflictDoNothing();
  }
  console.log("Created Apex POA&Ms");

  // ─── Create sample data for Client B (Meridian Systems) ──────────────────────
  // Meridian: L1 only, mostly not started (early stage)
  const meridianStatuses = ["not_started", "not_started", "not_started", "in_progress", "in_progress", "implemented"] as const;
  for (const ctrl of l1Controls) {
    const status = meridianStatuses[Math.floor(Math.random() * meridianStatuses.length)];
    await db.insert(controlAssessmentsTable).values({
      id: randomUUID(),
      organizationId: clientBOrgId,
      controlId: ctrl.id,
      status,
      implementationNarrative: status === "not_started" ? null : "Initial assessment in progress. Baseline controls being established.",
      assessedById: meridianComplianceId,
      createdAt: new Date(),
      updatedAt: new Date(),
    }).onConflictDoNothing();
  }
  for (const ctrl of l2Controls) {
    await db.insert(controlAssessmentsTable).values({
      id: randomUUID(),
      organizationId: clientBOrgId,
      controlId: ctrl.id,
      status: "not_started",
      createdAt: new Date(),
      updatedAt: new Date(),
    }).onConflictDoNothing();
  }
  console.log("Created Meridian control assessments");

  // Meridian evidence (minimal)
  const meridianEvidence = [
    { title: "IT Security Policy Draft", type: "policy" as const },
    { title: "User Access List Export", type: "report" as const },
  ];
  for (const ev of meridianEvidence) {
    await db.insert(evidenceItemsTable).values({
      id: randomUUID(),
      organizationId: clientBOrgId,
      title: ev.title,
      evidenceType: ev.type,
      status: "draft",
      ownerId: meridianComplianceId,
      version: "1.0",
      tags: [],
      isCurrentVersion: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    }).onConflictDoNothing();
  }

  // Meridian tasks (many open)
  const meridianTasks = [
    { title: "Identify all systems in scope", priority: "critical" as const },
    { title: "Create IT security policy", priority: "high" as const },
    { title: "Train staff on security awareness", priority: "high" as const },
    { title: "Implement password policy enforcement", priority: "medium" as const },
    { title: "Conduct initial gap assessment", priority: "critical" as const },
    { title: "Document user access procedures", priority: "medium" as const },
  ];
  for (const t of meridianTasks) {
    const dueDate = new Date();
    dueDate.setDate(dueDate.getDate() + Math.floor(Math.random() * 90) + 7);
    await db.insert(tasksTable).values({
      id: randomUUID(),
      organizationId: clientBOrgId,
      title: t.title,
      status: "open",
      priority: t.priority,
      taskType: "general",
      dueDate,
      assigneeId: meridianComplianceId,
      createdById: adminUser.id,
      tags: [],
      isRecurring: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    }).onConflictDoNothing();
  }

  // Meridian POA&Ms
  await db.insert(poamsTable).values({
    id: randomUUID(),
    organizationId: clientBOrgId,
    poamNumber: "MER-001",
    title: "Establish Formal Security Program",
    deficiencyDescription: "No formalized IT security program exists. All CMMC L1 practices need to be addressed from scratch.",
    status: "open",
    riskLevel: "critical",
    ownerId: meridianComplianceId,
    remediationPlan: "Engage compliance consultant, develop security policies, implement baseline technical controls.",
    scheduledCompletionDate: (() => { const d = new Date(); d.setDate(d.getDate() + 180); return d; })(),
    createdAt: new Date(),
    updatedAt: new Date(),
  }).onConflictDoNothing();

  console.log("Created Meridian data");
  console.log("\n✅ Organization seeding complete!");
  console.log("  - Internal Company (existing data migrated)");
  console.log("  - Apex Defense LLC (Client A) with 8 evidence items, 5 tasks, 3 POA&Ms");
  console.log("  - Meridian Systems Inc (Client B) with 2 evidence items, 6 tasks, 1 POA&M");
  console.log("\nNew users created:");
  console.log("  - sarah@apex-defense.com / Admin1234!");
  console.log("  - derek@apex-defense.com / Admin1234!");
  console.log("  - james@meridian-systems.com / Admin1234!");
  console.log("  - priya@meridian-systems.com / Admin1234!");

  process.exit(0);
}

seed().catch((err) => {
  console.error(err);
  process.exit(1);
});
