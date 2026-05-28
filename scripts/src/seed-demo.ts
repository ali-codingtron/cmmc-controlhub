import {
  db,
  usersTable,
  organizationsTable,
  organizationUsersTable,
  controlsTable,
  controlAssessmentsTable,
  evidenceItemsTable,
  evidenceControlLinksTable,
  tasksTable,
  poamsTable,
  monitoringItemsTable,
  tenantConnectionsTable,
  paScanRunsTable,
  paFindingsTable,
  paEvidenceRecordsTable,
  paEvidenceRequestsTable,
  paRoadmapActionsTable,
} from "@workspace/db";
import bcrypt from "bcryptjs";
import { randomUUID } from "crypto";
import { eq, and } from "drizzle-orm";

const DEMO_USER_EMAIL = "demo@controlhub.com";
const DEMO_ORG_NAME = "CarmeTechnology";

// 19 standard CMMC L2 operational monitoring items
const DEMO_MONITORING_ITEMS = [
  { task: "Review failed login attempts", frequency: "daily" as const, controlRef: "AC.L2-3.1.1", description: "Review authentication logs for failed login attempts and investigate anomalies.", sortOrder: 1 },
  { task: "Verify automated backup completion", frequency: "daily" as const, controlRef: "CM.L2-3.4.1", description: "Confirm all scheduled backup jobs completed successfully and verify integrity.", sortOrder: 2 },
  { task: "Review access for terminated employees", frequency: "weekly" as const, controlRef: "AC.L2-3.1.1", description: "Verify disabled or removed accounts for recently terminated employees.", sortOrder: 3 },
  { task: "Review vulnerability scan results", frequency: "weekly" as const, controlRef: "SI.L2-3.14.1", description: "Analyze new vulnerability scan findings and assign remediation tasks.", sortOrder: 4 },
  { task: "Review system audit logs for anomalies", frequency: "weekly" as const, controlRef: "AU.L2-3.3.1", description: "Check SIEM alerts and audit logs for unusual or suspicious activity.", sortOrder: 5 },
  { task: "Review user account permissions", frequency: "monthly" as const, controlRef: "AC.L2-3.1.1", description: "Verify user account permissions align with current job responsibilities.", sortOrder: 6 },
  { task: "Verify antivirus and EDR definitions updated", frequency: "monthly" as const, controlRef: "SI.L2-3.14.2", description: "Confirm all endpoints have current antivirus and EDR signature definitions.", sortOrder: 7 },
  { task: "Test incident response procedures", frequency: "monthly" as const, controlRef: "IR.L2-3.6.1", description: "Conduct tabletop exercise or structured walkthrough of the incident response plan.", sortOrder: 8 },
  { task: "Review and update firewall rules", frequency: "monthly" as const, controlRef: "SC.L2-3.13.1", description: "Audit firewall rules for unnecessary access and policy compliance.", sortOrder: 9 },
  { task: "Verify MFA enforcement status", frequency: "monthly" as const, controlRef: "IA.L2-3.5.3", description: "Confirm MFA is enforced for all privileged and remote-access accounts.", sortOrder: 10 },
  { task: "Conduct security awareness training check", frequency: "quarterly" as const, controlRef: "AT.L2-3.2.1", description: "Verify training completion rates and schedule refresher sessions as needed.", sortOrder: 11 },
  { task: "Review and update system security plan", frequency: "quarterly" as const, controlRef: "CA.L2-3.12.4", description: "Review the SSP for accuracy and completeness against current system state.", sortOrder: 12 },
  { task: "Perform formal access control review", frequency: "quarterly" as const, controlRef: "AC.L2-3.1.1", description: "Formally review and certify access rights for all system users.", sortOrder: 13 },
  { task: "Review third-party and supplier security", frequency: "quarterly" as const, controlRef: "SR.L2-3.17.2", description: "Assess supplier security reviews and update vendor risk register.", sortOrder: 14 },
  { task: "Conduct penetration testing", frequency: "annually" as const, controlRef: "CA.L2-3.12.3", description: "Execute authorized penetration test on in-scope systems and document results.", sortOrder: 15 },
  { task: "Update organizational risk assessment", frequency: "annually" as const, controlRef: "RA.L2-3.11.1", description: "Refresh risk assessment with current threat landscape and control status.", sortOrder: 16 },
  { task: "Complete CMMC readiness self-assessment", frequency: "annually" as const, controlRef: "CA.L2-3.12.1", description: "Conduct comprehensive readiness review across all 110 CMMC L2 practices.", sortOrder: 17 },
  { task: "Review and update all policies and procedures", frequency: "annually" as const, controlRef: "PM.L2-3.12.4", description: "Annual review cycle for all CMMC-related policies and supporting procedures.", sortOrder: 18 },
  { task: "Respond to and document security incidents", frequency: "annually" as const, controlRef: "IR.L2-3.6.2", description: "Execute the incident response plan for security events and document response actions as events occur.", sortOrder: 19 },
];

function daysFromNow(days: number): Date {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d;
}

async function seed() {
  const force = process.argv.includes("--force");
  console.log(`\n🚀 Control HUB — Demo Data Seeder`);
  console.log(`   Organization: ${DEMO_ORG_NAME}`);
  console.log(`   Demo user:    ${DEMO_USER_EMAIL}\n`);

  // ─── Idempotency check ──────────────────────────────────────────────────────
  const [existingUser] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.email, DEMO_USER_EMAIL))
    .limit(1);

  if (existingUser && !force) {
    console.log("✅ Demo data already exists. Pass --force to re-seed.");
    process.exit(0);
  }

  if (existingUser && force) {
    console.log("⚠️  --force: removing existing demo org and user...");
    const memberships = await db
      .select({ orgId: organizationUsersTable.organizationId })
      .from(organizationUsersTable)
      .where(eq(organizationUsersTable.userId, existingUser.id));
    for (const { orgId } of memberships) {
      await db.delete(organizationsTable).where(eq(organizationsTable.id, orgId));
    }
    await db.delete(usersTable).where(eq(usersTable.id, existingUser.id));
    console.log("   Deleted existing demo data.\n");
  }

  // ─── Create demo user ────────────────────────────────────────────────────────
  const demoUserId = randomUUID();
  const hash = await bcrypt.hash("DemoMode1!", 10);
  await db.insert(usersTable).values({
    id: demoUserId,
    name: "Demo Viewer",
    email: DEMO_USER_EMAIL,
    passwordHash: hash,
    role: "reviewer",
    title: "Public Demo User",
    department: "Demo",
    isActive: true,
  }).onConflictDoNothing();
  console.log(`✓ Created demo user: ${DEMO_USER_EMAIL}`);

  // ─── Create CarmeTechnology org ──────────────────────────────────────────────
  const orgId = randomUUID();
  await db.insert(organizationsTable).values({
    id: orgId,
    name: DEMO_ORG_NAME,
    legalName: "CarmeTechnology LLC",
    shortName: "Carme",
    cageCode: "9CTH1",
    uei: "CTH123456789",
    industry: "Defense Technology",
    primaryContact: "Demo Viewer",
    complianceManagerId: demoUserId,
    organizationAddress: "100 Defense Innovation Way, Tysons Corner, VA 22182",
    assessmentScope: "Cloud infrastructure, endpoint devices, and CUI handling systems",
    cmmcTargetLevel: "L2",
    notes: "Demo organization for Control HUB public demo. All data is synthetic.",
    isActive: true,
  }).onConflictDoNothing();
  console.log(`✓ Created org: ${DEMO_ORG_NAME} (${orgId})`);

  // ─── Org membership ─────────────────────────────────────────────────────────
  await db.insert(organizationUsersTable).values({
    id: randomUUID(),
    organizationId: orgId,
    userId: demoUserId,
    role: "compliance_manager",
    status: "active",
    joinedAt: new Date(),
  }).onConflictDoNothing();
  console.log("✓ Created org membership");

  // ─── Control assessments (all 110 with realistic distribution) ───────────────
  const allControls = await db
    .select({ id: controlsTable.id, controlId: controlsTable.controlId })
    .from(controlsTable);

  if (allControls.length === 0) {
    console.error("No controls found — run seed-cmmc first.");
    process.exit(1);
  }

  // Status distribution: ~50% implemented, 20% in_progress, 20% not_started, 10% at_risk
  const narratives: Record<string, string> = {
    implemented: "CarmeTechnology has fully implemented this control through a combination of technical configurations, documented policies, and operational procedures. Evidence has been collected and reviewed.",
    in_progress: "Implementation of this control is underway. Key technical configurations have been applied; documentation and evidence collection are in progress.",
    not_started: "This control has been identified in the roadmap but implementation has not yet begun. A task has been created to address this gap.",
    at_risk: "This control has known gaps that present compliance risk. An open POA&M item tracks the remediation plan.",
    needs_review: "This control's implementation needs a compliance review to confirm currency and completeness.",
    assessor_ready: "This control is implemented and evidence has been assembled for C3PAO review.",
  };

  const statusWeights = [
    ...Array(50).fill("implemented"),
    ...Array(20).fill("in_progress"),
    ...Array(20).fill("not_started"),
    ...Array(6).fill("at_risk"),
    ...Array(2).fill("needs_review"),
    ...Array(2).fill("assessor_ready"),
  ] as const;

  let assessmentCount = 0;
  for (let i = 0; i < allControls.length; i++) {
    const ctrl = allControls[i];
    const status = statusWeights[i % statusWeights.length];
    await db.insert(controlAssessmentsTable).values({
      id: randomUUID(),
      organizationId: orgId,
      controlId: ctrl.id,
      status,
      implementationNarrative: status === "not_started" ? null : narratives[status],
      assessedById: demoUserId,
      createdAt: new Date(),
      updatedAt: new Date(),
    }).onConflictDoNothing();
    assessmentCount++;
  }
  console.log(`✓ Created ${assessmentCount} control assessments`);

  // ─── Evidence items ──────────────────────────────────────────────────────────
  const evidenceData = [
    { title: "Information Security Policy v3.2", type: "policy" as const, status: "approved" as const, description: "Corporate information security policy covering CUI handling, access control, and acceptable use.", tags: ["policy", "ism", "approved"] },
    { title: "Access Control Policy and Procedures", type: "procedure" as const, status: "approved" as const, description: "Detailed procedures for provisioning, reviewing, and revoking user access.", tags: ["access-control", "procedure"] },
    { title: "Network Architecture Diagram — Current State", type: "network_diagram" as const, status: "approved" as const, description: "Logical and physical network diagram for all in-scope systems.", tags: ["network", "architecture"] },
    { title: "Incident Response Plan v2.0", type: "procedure" as const, status: "approved" as const, description: "IR plan covering detection, containment, eradication, recovery, and lessons learned.", tags: ["incident-response", "ir-plan"] },
    { title: "Security Awareness Training — Q1 2025 Completion Records", type: "training_record" as const, status: "approved" as const, description: "Training completion certificates for all 47 employees — 96% completion rate.", tags: ["training", "sat", "q1-2025"] },
    { title: "System and Asset Inventory — March 2025", type: "asset_inventory" as const, status: "approved" as const, description: "Complete inventory of hardware and software assets in CUI scope.", tags: ["inventory", "cmdb"] },
    { title: "Vulnerability Scan Report — Tenable Nessus — April 2025", type: "scan_report" as const, status: "pending_review" as const, description: "Internal vulnerability scan results with CVSS scoring and remediation assignments.", tags: ["vulnerability", "nessus", "scan"] },
    { title: "Backup Restoration Test Log — Q1 2025", type: "backup_verification" as const, status: "approved" as const, description: "Documented test restoring production backup to verify integrity and recovery time.", tags: ["backup", "dr", "tested"] },
    { title: "MFA Enrollment Screenshot — Azure AD All Users", type: "screenshot" as const, status: "approved" as const, description: "Screenshot confirming MFA is enforced for all user accounts in Azure AD.", tags: ["mfa", "azure-ad", "screenshot"] },
    { title: "Semi-Annual User Access Review — October 2024", type: "access_review" as const, status: "approved" as const, description: "Formal access review certified by department managers for all privileged accounts.", tags: ["access-review", "periodic"] },
    { title: "Firewall Ruleset Export — October 2024", type: "configuration_export" as const, status: "assessor_ready" as const, description: "Export of production firewall rules with justification for each allow rule.", tags: ["firewall", "network-security", "config"] },
    { title: "Audit Log Export — SIEM — March 2025", type: "log" as const, status: "approved" as const, description: "90-day audit log export from Splunk covering authentication, privilege use, and file access.", tags: ["audit-log", "siem", "splunk"] },
    { title: "Risk Assessment Report — FY2025", type: "risk_record" as const, status: "approved" as const, description: "Annual organizational risk assessment covering threat landscape, vulnerabilities, and treatment decisions.", tags: ["risk", "annual", "fy2025"] },
    { title: "Business Continuity and Disaster Recovery Plan", type: "procedure" as const, status: "needs_classification" as const, description: "BCP/DRP covering critical system recovery objectives and failover procedures.", tags: ["bcp", "dr", "continuity"] },
    { title: "Configuration Management Baseline — Windows Endpoints", type: "configuration_export" as const, status: "approved" as const, description: "Approved baseline configuration for all Windows workstations per DISA STIG.", tags: ["cmb", "baseline", "stig"] },
    { title: "Penetration Test Report — SecureHarbor — Q4 2024", type: "scan_report" as const, status: "assessor_ready" as const, description: "External penetration test of internet-facing systems. 3 medium findings, all remediated.", tags: ["pentest", "external", "q4-2024"] },
    { title: "Third-Party Supplier Security Review — 2025", type: "supplier_review" as const, status: "pending_review" as const, description: "Annual review of top-10 suppliers for security posture and CUI handling practices.", tags: ["supplier", "third-party", "review"] },
    { title: "Encrypted Data Handling Procedure", type: "procedure" as const, status: "approved" as const, description: "Procedure for encrypting CUI at rest and in transit using approved algorithms.", tags: ["encryption", "cui", "data-handling"] },
    { title: "Password Policy Configuration Screenshot — Microsoft 365", type: "screenshot" as const, status: "approved" as const, description: "Screenshot of enforced password complexity and rotation policy in M365 admin center.", tags: ["password-policy", "m365", "identity"] },
    { title: "Physical Security Assessment — Server Room", type: "report" as const, status: "pending_review" as const, description: "Assessment of physical access controls, visitor logs, and environmental monitoring for the server room.", tags: ["physical-security", "facility"] },
  ];

  const evidenceIds: string[] = [];
  for (const ev of evidenceData) {
    const id = randomUUID();
    evidenceIds.push(id);
    const baseDate = new Date();
    baseDate.setDate(baseDate.getDate() - Math.floor(Math.random() * 120));
    await db.insert(evidenceItemsTable).values({
      id,
      organizationId: orgId,
      title: ev.title,
      description: ev.description,
      evidenceType: ev.type,
      status: ev.status,
      ownerId: demoUserId,
      version: "1.0",
      tags: ev.tags,
      isCurrentVersion: true,
      collectedAt: baseDate,
      createdAt: baseDate,
      updatedAt: new Date(),
    }).onConflictDoNothing();
  }
  console.log(`✓ Created ${evidenceData.length} evidence items`);

  // Link a few evidence items to controls
  const linkPairs = [
    [0, 0], [0, 1], [1, 2], [2, 3], [3, 4],
    [4, 5], [5, 6], [8, 7], [9, 8], [10, 9],
    [11, 10], [12, 11], [14, 12], [15, 13],
  ];
  for (const [evIdx, ctrlIdx] of linkPairs) {
    if (evIdx < evidenceIds.length && ctrlIdx < allControls.length) {
      await db.insert(evidenceControlLinksTable).values({
        id: randomUUID(),
        evidenceId: evidenceIds[evIdx],
        controlId: allControls[ctrlIdx].id,
        linkedAt: new Date(),
        linkedById: demoUserId,
      }).onConflictDoNothing();
    }
  }
  console.log("✓ Linked evidence to controls");

  // ─── POA&Ms ──────────────────────────────────────────────────────────────────
  const poams = [
    { num: "CARME-001", title: "Multi-Factor Authentication Not Fully Deployed", description: "MFA is not enforced for 3 legacy service accounts and 2 shared accounts. Risk of unauthorized access to CUI systems.", risk: "critical" as const, status: "open" as const, plan: "Phase 1: Enforce MFA for all service accounts via Entra ID Conditional Access by June 2025. Phase 2: Migrate shared accounts to managed identities.", days: 45, ctrl: allControls[7]?.id },
    { num: "CARME-002", title: "System Security Plan Incomplete — Missing 12 Control Narratives", description: "Current SSP is missing implementation narratives for 12 controls across the IR and RA domains.", risk: "high" as const, status: "in_progress" as const, plan: "Assign compliance team to complete narratives over next 8 weeks. Review with ISSO before finalizing.", days: 60, ctrl: allControls[14]?.id },
    { num: "CARME-003", title: "Vulnerability Remediation Backlog — 8 High CVEs", description: "8 high-severity CVEs from the April vulnerability scan remain unpatched beyond the 30-day SLA.", risk: "high" as const, status: "in_progress" as const, plan: "IT team assigned. Critical patches applied by end of May. Remaining high CVEs to be patched by June 15.", days: 30, ctrl: allControls[40]?.id },
    { num: "CARME-004", title: "Backup Restoration Not Tested for Secondary Site", description: "Backup restoration has been tested for primary datacenter but not validated for the secondary DR site.", risk: "medium" as const, status: "open" as const, plan: "Schedule DR test exercise for Q2 2025. Document restoration times and update BCP.", days: 75, ctrl: allControls[25]?.id },
    { num: "CARME-005", title: "Physical Access Controls — Server Room Badge Logs Incomplete", description: "Physical access logs for the server room are missing entries for 14 days in February 2025 due to reader malfunction.", risk: "medium" as const, status: "open" as const, plan: "Replace faulty badge reader. Implement secondary log export to SIEM. Conduct audit of Feb access records.", days: 30, ctrl: allControls[55]?.id },
    { num: "CARME-006", title: "Configuration Baseline Not Enforced on 6 Development Workstations", description: "Six developer workstations in the engineering team have not been brought into compliance with the approved STIG baseline.", risk: "medium" as const, status: "open" as const, plan: "IT will apply GPO baseline to dev machines. Exemptions require ISSO approval and documented justification.", days: 45, ctrl: allControls[62]?.id },
    { num: "CARME-007", title: "Third-Party Risk Management Program Not Formalized", description: "Supplier risk reviews are conducted ad hoc. No formal vendor risk register or review schedule exists.", risk: "low" as const, status: "open" as const, plan: "Develop supplier risk register and annual review process. Include top 15 CUI-handling vendors. Target: Q3 2025.", days: 90, ctrl: allControls[88]?.id },
    { num: "CARME-008", title: "Security Awareness Training Completion at 87%", description: "Annual security awareness training completion is below the required 100% threshold. 6 employees have not completed training.", risk: "low" as const, status: "open" as const, plan: "HR to send escalation to managers of non-compliant employees. Hard deadline set for end of month.", days: 15, ctrl: allControls[20]?.id },
  ];

  let poamNum = 0;
  for (const p of poams) {
    await db.insert(poamsTable).values({
      id: randomUUID(),
      organizationId: orgId,
      poamNumber: p.num,
      title: p.title,
      deficiencyDescription: p.description,
      status: p.status,
      riskLevel: p.risk,
      ownerId: demoUserId,
      linkedControlId: p.ctrl ?? null,
      remediationPlan: p.plan,
      scheduledCompletionDate: daysFromNow(p.days),
      createdAt: daysFromNow(-Math.floor(Math.random() * 60) - 5),
      updatedAt: new Date(),
    }).onConflictDoNothing();
    poamNum++;
  }
  console.log(`✓ Created ${poamNum} POA&M items`);

  // ─── Monitoring items ────────────────────────────────────────────────────────
  const monitoringStatuses = [
    { status: "current" as const, lastCompleted: daysFromNow(-1), nextDue: daysFromNow(1) },       // daily 1
    { status: "current" as const, lastCompleted: daysFromNow(-1), nextDue: daysFromNow(1) },       // daily 2
    { status: "open" as const, lastCompleted: daysFromNow(-14), nextDue: daysFromNow(3) },         // weekly 3
    { status: "failed_validation" as const, lastCompleted: daysFromNow(-10), nextDue: daysFromNow(-3) }, // weekly 4 overdue
    { status: "current" as const, lastCompleted: daysFromNow(-5), nextDue: daysFromNow(2) },       // weekly 5
    { status: "current" as const, lastCompleted: daysFromNow(-20), nextDue: daysFromNow(10) },     // monthly 6
    { status: "current" as const, lastCompleted: daysFromNow(-15), nextDue: daysFromNow(15) },     // monthly 7
    { status: "open" as const, lastCompleted: daysFromNow(-45), nextDue: daysFromNow(8) },         // monthly 8
    { status: "current" as const, lastCompleted: daysFromNow(-22), nextDue: daysFromNow(8) },      // monthly 9
    { status: "in_progress" as const, lastCompleted: daysFromNow(-30), nextDue: daysFromNow(-2) }, // monthly 10 overdue
    { status: "current" as const, lastCompleted: daysFromNow(-60), nextDue: daysFromNow(30) },     // quarterly 11
    { status: "open" as const, lastCompleted: daysFromNow(-90), nextDue: daysFromNow(5) },         // quarterly 12
    { status: "current" as const, lastCompleted: daysFromNow(-75), nextDue: daysFromNow(15) },     // quarterly 13
    { status: "open" as const, lastCompleted: daysFromNow(-95), nextDue: daysFromNow(-5) },        // quarterly 14 overdue
    { status: "current" as const, lastCompleted: daysFromNow(-120), nextDue: daysFromNow(60) },    // semi-annual 15
    { status: "in_progress" as const, lastCompleted: daysFromNow(-200), nextDue: daysFromNow(10) }, // semi-annual 16
    { status: "current" as const, lastCompleted: daysFromNow(-180), nextDue: daysFromNow(185) },   // annual 17
    { status: "current" as const, lastCompleted: daysFromNow(-200), nextDue: daysFromNow(165) },   // annual 18
    { status: "open" as const, lastCompleted: null, nextDue: null },                               // as_needed 19
  ];

  for (let i = 0; i < DEMO_MONITORING_ITEMS.length; i++) {
    const item = DEMO_MONITORING_ITEMS[i];
    const st = monitoringStatuses[i] ?? { status: "open" as const, lastCompleted: null, nextDue: null };
    await db.insert(monitoringItemsTable).values({
      id: randomUUID(),
      organizationId: orgId,
      ...item,
      status: st.status,
      lastCompleted: st.lastCompleted,
      nextDue: st.nextDue,
      createdAt: new Date(),
      updatedAt: new Date(),
    }).onConflictDoNothing();
  }
  console.log(`✓ Created ${DEMO_MONITORING_ITEMS.length} monitoring items`);

  // ─── Pre-Assessment — Tenant connection (fake Microsoft tenant) ──────────────
  const connectionId = randomUUID();
  await db.insert(tenantConnectionsTable).values({
    id: connectionId,
    organizationId: orgId,
    tenantName: "CarmeTechnology Microsoft 365",
    microsoftTenantId: "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    primaryDomain: "carmetechnology.com",
    authMode: "app_only",
    connectionStatus: "connected",
    permissionsGranted: ["User.Read.All", "Policy.Read.All", "DeviceManagementConfiguration.Read.All", "SecurityEvents.Read.All", "AuditLog.Read.All"],
    lastSuccessfulScan: daysFromNow(-3),
    connectedBy: "Demo Viewer",
    connectedAt: daysFromNow(-45),
    notes: "Demo tenant connection — synthetic data for demonstration.",
    createdAt: daysFromNow(-45),
    updatedAt: daysFromNow(-3),
  }).onConflictDoNothing();
  console.log("✓ Created PA tenant connection");

  // ─── Pre-Assessment — Scan run ───────────────────────────────────────────────
  const scanId = randomUUID();
  const scanDate = daysFromNow(-3);
  await db.insert(paScanRunsTable).values({
    id: scanId,
    organizationId: orgId,
    tenantConnectionId: connectionId,
    scanName: "Full Compliance Scan — May 2025",
    scanType: "full",
    status: "completed",
    packsRequested: ["entra_id", "intune", "defender"],
    packsCompleted: ["entra_id", "intune", "defender"],
    packsFailed: [],
    startedAt: new Date(scanDate.getTime() - 900000),
    completedAt: scanDate,
    totalChecks: 94,
    passedChecks: 58,
    failedChecks: 24,
    warnings: 8,
    unknowns: 4,
    generatedEvidenceCount: 8,
    generatedFindingCount: 12,
    generatedEvidenceRequestCount: 6,
    createdBy: "Demo Viewer",
    createdAt: daysFromNow(-45),
    updatedAt: daysFromNow(-3),
  }).onConflictDoNothing();
  console.log("✓ Created PA scan run");

  // ─── Pre-Assessment — Findings ───────────────────────────────────────────────
  const findingDefs = [
    { ruleId: "ENTRA-001", name: "Privileged Account MFA", title: "Privileged Accounts Missing MFA Enforcement", severity: "critical" as const, result: "fail" as const, pack: "entra_id", observed: "3 privileged accounts do not have MFA enforced via Conditional Access", expected: "All privileged accounts must require MFA for every sign-in", affected: 3, controls: ["AC.L2-3.1.1", "IA.L2-3.5.3"], remediation: "Create a Conditional Access policy targeting all privileged roles and requiring MFA for every sign-in.", roadmap: "Enable MFA for All Privileged Accounts" },
    { ruleId: "ENTRA-002", name: "Conditional Access Coverage", title: "Conditional Access Policies Incomplete for All Users", severity: "high" as const, result: "partial" as const, pack: "entra_id", observed: "14 users are excluded from the primary Conditional Access policy", expected: "All users must be covered by at least one Conditional Access policy requiring MFA", affected: 14, controls: ["AC.L2-3.1.1"], remediation: "Review and remove exclusions from CA policies. Create named location exceptions only for break-glass accounts.", roadmap: "Implement Conditional Access Policies for All Users" },
    { ruleId: "INTUNE-001", name: "Device MDM Enrollment", title: "Devices Not Enrolled in Intune MDM", severity: "high" as const, result: "fail" as const, pack: "intune", observed: "22 devices are not enrolled in Intune for management and compliance", expected: "All in-scope devices must be enrolled in Intune for policy enforcement and monitoring", affected: 22, controls: ["CM.L2-3.4.1", "CM.L2-3.4.2"], remediation: "Deploy the Intune Company Portal app and enforce device enrollment for all users via Conditional Access.", roadmap: "Enroll All Devices in Intune MDM" },
    { ruleId: "ENTRA-003", name: "Legacy Authentication", title: "Legacy Authentication Protocols Enabled", severity: "high" as const, result: "fail" as const, pack: "entra_id", observed: "Sign-in logs show successful legacy authentication events in the past 30 days", expected: "Legacy authentication protocols must be blocked for all users", affected: 7, controls: ["IA.L2-3.5.3", "AC.L2-3.1.1"], remediation: "Create a Conditional Access policy to block all legacy authentication protocols. Identify and migrate legacy clients.", roadmap: "Block Legacy Authentication Protocols" },
    { ruleId: "INTUNE-002", name: "BitLocker Enforcement", title: "BitLocker Not Enforced on All Managed Devices", severity: "high" as const, result: "fail" as const, pack: "intune", observed: "9 managed devices do not have BitLocker enabled and reporting to Intune", expected: "All managed Windows devices must have BitLocker encryption enforced via Intune policy", affected: 9, controls: ["SC.L2-3.13.8", "SC.L2-3.13.16"], remediation: "Create an Intune device configuration profile to enforce BitLocker and require encryption before device becomes compliant.", roadmap: "Enable BitLocker on All Endpoints" },
    { ruleId: "DEFENDER-001", name: "Security Alert Review", title: "Security Alerts Not Reviewed Within 24 Hours", severity: "medium" as const, result: "partial" as const, pack: "defender", observed: "Average alert acknowledgment time is 3.2 days; 8 high-severity alerts are older than 7 days", expected: "All high and critical security alerts must be acknowledged within 24 hours", affected: 8, controls: ["IR.L2-3.6.1", "AU.L2-3.3.1"], remediation: "Establish a daily security alert review process. Configure email/SMS notifications for high and critical alerts.", roadmap: "Establish Daily Security Alert Review Process" },
    { ruleId: "ENTRA-004", name: "Guest Access Permissions", title: "Guest User Permissions Too Broad", severity: "medium" as const, result: "partial" as const, pack: "entra_id", observed: "External guest users have access to internal SharePoint sites and Teams channels with CUI", expected: "Guest users must have restricted access limited to explicitly shared content only", affected: 18, controls: ["AC.L2-3.1.1", "AC.L2-3.1.3"], remediation: "Review and revoke excessive guest access. Implement Azure AD External Identities governance policies.", roadmap: "Review and Restrict Guest Access Permissions" },
    { ruleId: "ENTRA-005", name: "Password Expiration Policy", title: "Password Expiration Policy Not Configured", severity: "medium" as const, result: "fail" as const, pack: "entra_id", observed: "Tenant password expiration policy is set to 'Never expire'", expected: "Password expiration policy must be configured per organizational policy", affected: 0, controls: ["IA.L2-3.5.1", "IA.L2-3.5.2"], remediation: "Configure password expiration policy in Microsoft 365 Admin Center. Set policy to 90 days with advance notification.", roadmap: "Configure Password Expiration Policy" },
    { ruleId: "INTUNE-003", name: "LAPS Configuration", title: "Local Administrator Password Solution Not Configured", severity: "medium" as const, result: "partial" as const, pack: "intune", observed: "LAPS is configured for 31 of 53 managed devices", expected: "All managed devices must have LAPS configured to rotate local admin passwords", affected: 22, controls: ["IA.L2-3.5.1", "AC.L2-3.1.2"], remediation: "Extend the LAPS Intune policy to cover all device groups. Verify reporting via Intune device properties.", roadmap: "Configure LAPS on All Endpoints" },
    { ruleId: "ENTRA-006", name: "Audit Log Retention", title: "Azure AD Audit Log Retention Below 90 Days", severity: "low" as const, result: "fail" as const, pack: "entra_id", observed: "Azure AD audit log retention is set to 30 days for the current subscription tier", expected: "Audit logs must be retained for at least 90 days as required by CMMC AU practices", affected: 0, controls: ["AU.L2-3.3.1", "AU.L2-3.3.2"], remediation: "Export audit logs to a Log Analytics Workspace or SIEM with 90+ day retention. Alternatively, upgrade to P1/P2 license.", roadmap: "Extend Audit Log Retention to 90+ Days" },
    { ruleId: "DEFENDER-002", name: "Risky Sign-in Alerts", title: "Risky Sign-in Alerts Not Actioned", severity: "low" as const, result: "partial" as const, pack: "defender", observed: "11 risky sign-in events in the past 30 days with no remediation action recorded", expected: "All risky sign-in events must be investigated and either dismissed or remediated", affected: 11, controls: ["IR.L2-3.6.1", "IA.L2-3.5.3"], remediation: "Review risky sign-in events in the Identity Protection portal. Configure automated remediation policies for high-risk sign-ins.", roadmap: "Establish Daily Security Alert Review Process" },
    { ruleId: "INTUNE-004", name: "OS Version Compliance", title: "Some Devices Running End-of-Support OS Versions", severity: "informational" as const, result: "pass" as const, pack: "intune", observed: "2 devices are running Windows 10 21H2 which reached end of support", expected: "All devices should run supported OS versions", affected: 2, controls: ["CM.L2-3.4.1", "SI.L2-3.14.1"], remediation: "Upgrade the 2 identified devices to Windows 11 or Windows 10 22H2+ within the next patching cycle.", roadmap: "Enforce OS Version Compliance Policy" },
  ];

  const findingIds: string[] = [];
  for (const f of findingDefs) {
    const id = randomUUID();
    findingIds.push(id);
    await db.insert(paFindingsTable).values({
      id,
      scanRunId: scanId,
      organizationId: orgId,
      ruleId: f.ruleId,
      ruleName: f.name,
      title: f.title,
      severity: f.severity,
      result: f.result,
      packId: f.pack,
      observedCondition: f.observed,
      expectedCondition: f.expected,
      affectedCount: f.affected,
      linkedControlIds: f.controls,
      recommendedRemediation: f.remediation,
      suggestedRoadmapAction: f.roadmap,
      createdAt: scanDate,
      updatedAt: scanDate,
    }).onConflictDoNothing();
  }
  console.log(`✓ Created ${findingDefs.length} PA findings`);

  // ─── Pre-Assessment — Evidence records ──────────────────────────────────────
  const evidenceRecords = [
    { pack: "entra_id", title: "Conditional Access Policies Export", desc: "All Conditional Access policies exported from the Entra ID tenant.", controls: ["AC.L2-3.1.1", "IA.L2-3.5.3"], status: "approved" as const },
    { pack: "intune", title: "Intune Device Compliance Policies", desc: "Device compliance policies configured in Microsoft Intune.", controls: ["CM.L2-3.4.1"], status: "approved" as const },
    { pack: "entra_id", title: "User Sign-in Activity Report — 30 Days", desc: "Sign-in activity report for all users covering the past 30 days.", controls: ["AU.L2-3.3.1"], status: "approved" as const },
    { pack: "entra_id", title: "Privileged Identity Management — Role Assignments", desc: "Current privileged role assignments and activation history.", controls: ["AC.L2-3.1.2", "IA.L2-3.5.3"], status: "pending_review" as const },
    { pack: "intune", title: "Device Enrollment Configuration", desc: "Intune auto-enrollment and BYOD enrollment settings.", controls: ["CM.L2-3.4.1", "CM.L2-3.4.2"], status: "approved" as const },
    { pack: "defender", title: "Microsoft Defender XDR — Security Alerts Summary", desc: "Alert summary from Microsoft Defender XDR including open and resolved alerts.", controls: ["IR.L2-3.6.1", "AU.L2-3.3.1"], status: "pending_review" as const },
    { pack: "entra_id", title: "External Guest User Access Report", desc: "All external guest users and their current SharePoint/Teams access.", controls: ["AC.L2-3.1.1", "AC.L2-3.1.3"], status: "pending_review" as const },
    { pack: "entra_id", title: "Azure AD Audit Log Configuration", desc: "Audit log settings, retention policy, and export destination configuration.", controls: ["AU.L2-3.3.1", "AU.L2-3.3.2"], status: "pending_review" as const },
  ];

  for (const er of evidenceRecords) {
    await db.insert(paEvidenceRecordsTable).values({
      id: randomUUID(),
      scanRunId: scanId,
      organizationId: orgId,
      packId: er.pack,
      title: er.title,
      description: er.desc,
      evidenceType: "Tenant Assessment Snapshot",
      source: "Microsoft Graph",
      linkedControlIds: er.controls,
      status: er.status,
      collectedAt: scanDate,
      createdAt: scanDate,
      updatedAt: scanDate,
    }).onConflictDoNothing();
  }
  console.log(`✓ Created ${evidenceRecords.length} PA evidence records`);

  // ─── Pre-Assessment — Evidence requests ─────────────────────────────────────
  const evidenceRequests = [
    { title: "MFA Enrollment Screenshot for All Admin Accounts", instructions: "Take a screenshot of the Azure AD users list showing MFA registration status for all admin accounts. Filter by admin roles.", filename: "mfa-admin-enrollment-screenshot.png", controls: ["IA.L2-3.5.3", "AC.L2-3.1.1"], findingIdx: 0, days: 14 },
    { title: "BitLocker Recovery Key Policy Documentation", instructions: "Export the Intune BitLocker policy configuration and provide documentation of the key escrow process.", filename: "bitlocker-policy-export.pdf", controls: ["SC.L2-3.13.8"], findingIdx: 4, days: 14 },
    { title: "Legacy Authentication Block Confirmation", instructions: "Provide a screenshot of the Conditional Access policy blocking legacy authentication, including the list of excluded named locations if any.", filename: "ca-block-legacy-auth.png", controls: ["IA.L2-3.5.3"], findingIdx: 3, days: 7 },
    { title: "Named Location Configuration Screenshot", instructions: "Provide a screenshot of all configured named locations in Azure AD — both IP-based and country-based locations.", filename: "named-locations-screenshot.png", controls: ["AC.L2-3.1.1"], findingIdx: 1, days: 21 },
    { title: "Password Policy Documentation", instructions: "Provide a screenshot of the Microsoft 365 password policy settings, or the on-premises AD password policy Group Policy Objects.", filename: "password-policy-screenshot.png", controls: ["IA.L2-3.5.1", "IA.L2-3.5.2"], findingIdx: 7, days: 14 },
    { title: "Device Compliance Policy Export", instructions: "Export all Intune device compliance policies as PDF or CSV. Include the policy rules, assignments, and non-compliance actions.", filename: "intune-compliance-policies.pdf", controls: ["CM.L2-3.4.1"], findingIdx: 2, days: 10 },
  ];

  for (const er of evidenceRequests) {
    await db.insert(paEvidenceRequestsTable).values({
      id: randomUUID(),
      scanRunId: scanId,
      organizationId: orgId,
      findingId: er.findingIdx < findingIds.length ? findingIds[er.findingIdx] : null,
      title: er.title,
      instructions: er.instructions,
      suggestedFilename: er.filename,
      linkedControlIds: er.controls,
      dueDate: daysFromNow(er.days),
      ownerEmail: DEMO_USER_EMAIL,
      status: "open",
      createdAt: scanDate,
      updatedAt: scanDate,
    }).onConflictDoNothing();
  }
  console.log(`✓ Created ${evidenceRequests.length} PA evidence requests`);

  // ─── Pre-Assessment — Roadmap actions ───────────────────────────────────────
  const roadmapActions = [
    { category: "Identity & Access", title: "Enable MFA for All Privileged Accounts", desc: "Create and enforce a Conditional Access policy requiring MFA for all users with directory roles. Remove CA policy exclusions for privileged accounts.", priority: 1, findings: ["ENTRA-001"], controls: ["IA.L2-3.5.3", "AC.L2-3.1.1"] },
    { category: "Identity & Access", title: "Block Legacy Authentication Protocols", desc: "Create a Conditional Access policy blocking all legacy authentication. Identify legacy clients via sign-in logs and migrate to modern authentication.", priority: 1, findings: ["ENTRA-003"], controls: ["IA.L2-3.5.3", "AC.L2-3.1.1"] },
    { category: "Device Management", title: "Enroll All Devices in Intune MDM", desc: "Deploy Intune MDM enrollment to all unmanaged devices. Enforce device compliance via Conditional Access — block non-compliant devices from accessing corporate resources.", priority: 1, findings: ["INTUNE-001"], controls: ["CM.L2-3.4.1", "CM.L2-3.4.2"] },
    { category: "Device Management", title: "Enable BitLocker on All Endpoints", desc: "Create or update the Intune device configuration profile to enforce BitLocker encryption with TPM. Require device encryption compliance.", priority: 2, findings: ["INTUNE-002"], controls: ["SC.L2-3.13.8"] },
    { category: "Identity & Access", title: "Implement Conditional Access for All Users", desc: "Remove user exclusions from primary Conditional Access policies. Ensure every user account is covered by at least one MFA-requiring policy.", priority: 2, findings: ["ENTRA-002"], controls: ["AC.L2-3.1.1"] },
    { category: "Identity & Access", title: "Configure Password Expiration Policy", desc: "Set a password expiration policy in M365 Admin Center or via on-premises AD GPO. Enable self-service password reset with MFA validation.", priority: 2, findings: ["ENTRA-005"], controls: ["IA.L2-3.5.1", "IA.L2-3.5.2"] },
    { category: "Device Management", title: "Deploy LAPS to All Managed Endpoints", desc: "Extend the LAPS Intune policy assignment to all device groups. Verify LAPS is reporting correctly and rotate any exposed passwords.", priority: 3, findings: ["INTUNE-003"], controls: ["IA.L2-3.5.1", "AC.L2-3.1.2"] },
    { category: "Audit & Logging", title: "Extend Audit Log Retention to 90+ Days", desc: "Export Azure AD audit logs to a Log Analytics Workspace or SIEM with 90-day retention. Configure Diagnostic Settings for all relevant log categories.", priority: 3, findings: ["ENTRA-006"], controls: ["AU.L2-3.3.1", "AU.L2-3.3.2"] },
    { category: "Identity & Access", title: "Restrict Guest User Permissions", desc: "Review and revoke excessive guest user access to SharePoint sites and Teams channels containing CUI. Implement External Identities governance.", priority: 3, findings: ["ENTRA-004"], controls: ["AC.L2-3.1.1", "AC.L2-3.1.3"] },
    { category: "Operations", title: "Establish Daily Security Alert Review Process", desc: "Define a security operations process for reviewing Defender XDR and Identity Protection alerts daily. Assign an on-call rotation and escalation path.", priority: 4, findings: ["DEFENDER-001", "DEFENDER-002"], controls: ["IR.L2-3.6.1", "AU.L2-3.3.1"] },
  ];

  for (const ra of roadmapActions) {
    await db.insert(paRoadmapActionsTable).values({
      id: randomUUID(),
      scanRunId: scanId,
      organizationId: orgId,
      category: ra.category,
      title: ra.title,
      description: ra.desc,
      priority: ra.priority,
      drivingFindings: ra.findings,
      linkedControlIds: ra.controls,
      status: ra.priority <= 2 ? "open" : "open",
      createdAt: scanDate,
      updatedAt: scanDate,
    }).onConflictDoNothing();
  }
  console.log(`✓ Created ${roadmapActions.length} PA roadmap actions`);

  // ─── Tasks (a few open tasks for realism) ────────────────────────────────────
  const sampleTasks = [
    { title: "Complete SSP narratives for IR and RA domains", priority: "high" as const, type: "policy_review" as const, days: 21 },
    { title: "Patch 8 high-severity vulnerabilities from April scan", priority: "critical" as const, type: "control_review" as const, days: 14 },
    { title: "Schedule Q2 backup restoration test", priority: "medium" as const, type: "general" as const, days: 30 },
    { title: "Enforce MFA via Conditional Access for service accounts", priority: "critical" as const, type: "control_review" as const, days: 10 },
    { title: "Enroll 22 non-compliant devices in Intune", priority: "high" as const, type: "control_review" as const, days: 20 },
    { title: "Complete security awareness training (6 employees outstanding)", priority: "medium" as const, type: "training_review" as const, days: 7 },
  ];

  for (const t of sampleTasks) {
    await db.insert(tasksTable).values({
      id: randomUUID(),
      organizationId: orgId,
      title: t.title,
      status: "open",
      priority: t.priority,
      taskType: t.type,
      dueDate: daysFromNow(t.days),
      assigneeId: demoUserId,
      createdById: demoUserId,
      tags: [],
      isRecurring: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    }).onConflictDoNothing();
  }
  console.log(`✓ Created ${sampleTasks.length} tasks`);

  console.log(`
✅ Demo seeding complete!

Organization:  ${DEMO_ORG_NAME}
Org ID:        ${orgId}
Demo login:    ${DEMO_USER_EMAIL} / DemoMode1!
Demo URL:      /demo  (launch from the demo landing page)

Summary:
  • 110 control assessments (~50% implemented, 20% in progress, 20% not started, 10% at risk)
  • 20 evidence items (mix of approved, pending_review, assessor_ready)
  • 8 POA&M items (critical → low)
  • 19 monitoring items (12 current, 4 open, 2 in progress, 1 failed validation)
  • 6 tasks
  • 1 PA tenant connection + 1 scan (94 checks: 58 pass, 24 fail, 8 warn, 4 unknown)
  • 12 PA findings, 8 PA evidence records, 6 evidence requests, 10 roadmap actions

Set ENABLE_PUBLIC_DEMO=true in production to enable the public /demo endpoint.
`);

  process.exit(0);
}

seed().catch((err) => {
  console.error(err);
  process.exit(1);
});
