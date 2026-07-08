/**
 * seed-apex-startup.ts
 * DB-only (no GCS uploads) idempotent seed for the APEX Solutions test org.
 * Called from runStartupSeed() on every server start. Skips immediately if the
 * org already exists.
 */

import { randomUUID } from "crypto";
import {
  db,
  usersTable,
  organizationsTable,
  organizationUsersTable,
  controlsTable,
  controlAssessmentsTable,
  monitoringItemsTable,
  poamsTable,
  tasksTable,
  tenantConnectionsTable,
  paScanRunsTable,
  paFindingsTable,
  paEvidenceRecordsTable,
  paEvidenceRequestsTable,
  paRoadmapActionsTable,
} from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "./lib/logger";

const APEX_ORG_ID = "7a2f5c8e-4b3d-4a9f-8e2c-1d0a5b6c7d8f";
const APEX_ORG_NAME = "APEX Solutions";
const ADMIN_EMAIL = "admin@example.com";
const SYSADMIN_EMAIL = "sysadmin@controlhub.com";

function daysFromNow(n: number): Date {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d;
}
function daysAgo(n: number): Date { return daysFromNow(-n); }

// ─── Control narrative bank ───────────────────────────────────────────────────
const NARR: Record<string, Record<string, string>> = {
  AC: {
    implemented: "APEX Solutions restricts system access to authorized users exclusively through Microsoft Entra ID and role-based access control (RBAC). Access provisioning requires IT Administrator approval and Compliance Manager sign-off. Privileged accounts leverage Entra ID Privileged Identity Management (PIM) for just-in-time activation. Quarterly formal access reviews are documented in Control HUB.",
    in_progress: "Core access control is implemented through Entra ID and RBAC group assignments. Automated de-provisioning workflows and formal quarterly review procedures are being finalized, targeting completion within 60 days. Interim manual reviews are performed monthly.",
    at_risk: "Gaps exist: a subset of service accounts lacks MFA enforcement and several privileged role assignments have not been reviewed in the past 180 days. POA&M POAM-APEX-002 tracks remediation with a 45-day target completion.",
  },
  IA: {
    implemented: "APEX Solutions enforces multi-factor authentication for all users via Entra ID Conditional Access policies. Password complexity and expiration are managed through Microsoft 365 organizational policy. Privileged role holders must use MFA for every sign-in. Legacy authentication protocols are blocked globally via Conditional Access.",
    in_progress: "MFA is enforced for privileged accounts and most standard users. Conditional Access policy coverage for all users and all platforms is in progress. Legacy authentication blocking is 80% complete; 3 legacy clients remain under remediation.",
    at_risk: "MFA registration coverage is at 91%, leaving 9% of accounts without MFA enforcement. POAM-APEX-001 tracks completion of MFA enrollment, with a remediation target of 30 days.",
  },
  AU: {
    implemented: "APEX Solutions collects and retains audit logs across all in-scope systems using Microsoft Sentinel and Azure Monitor. Log categories include authentication events, privileged operations, file access, and configuration changes. Logs are retained for 365 days. Weekly audit log reviews are documented and stored in Control HUB.",
    in_progress: "Audit logging is configured for core systems. Centralized SIEM integration via Microsoft Sentinel is 70% complete. Log review procedures and documentation workflows are being finalized.",
    at_risk: "Audit log retention on this system falls below the 90-day minimum requirement. POA&M POAM-APEX-004 tracks implementation of extended log archival.",
  },
  CM: {
    implemented: "APEX Solutions manages system configurations through Microsoft Intune security baselines aligned to CIS Level 1 and DISA STIG guidance. Configuration changes require approval through the change management process. Device compliance is enforced via Conditional Access. Configuration baselines are reviewed quarterly.",
    in_progress: "Intune security baseline is deployed to 78% of managed devices. Full rollout and change management documentation are in progress. Remaining devices are in staged enrollment.",
    at_risk: "Six workstations are running configurations outside the approved baseline due to legacy application dependencies. POAM-APEX-003 tracks remediation via Intune policy exceptions.",
  },
  RA: {
    implemented: "APEX Solutions conducts annual organizational risk assessments using the NIST SP 800-30 framework. Vulnerability scanning is performed weekly using Tenable.io. Risk findings are tracked in the Risk Register and linked to POA&M items in Control HUB.",
    in_progress: "Annual risk assessment is in progress. Vulnerability scanning is fully operational. Risk register updates and control gap analysis are being finalized.",
    at_risk: "Vulnerability remediation backlog includes 5 high-severity CVEs beyond the 30-day SLA. POAM-APEX-005 tracks remediation status.",
  },
  IR: {
    implemented: "APEX Solutions maintains a documented Incident Response Plan aligned to NIST SP 800-61. The IR team is identified and contact information is current. Annual tabletop exercises are conducted and after-action reports are retained.",
    in_progress: "IR Plan is documented and approved. Annual tabletop exercise is scheduled for Q3 2026. Incident ticketing integration with the SIEM is being configured.",
    at_risk: "The most recent IR tabletop exercise is overdue by 45 days. POAM-APEX-006 tracks scheduling and completion of the exercise.",
  },
  MA: {
    implemented: "APEX Solutions controls maintenance activities on information systems through an approved maintenance schedule and authorized personnel list. Remote maintenance sessions require MFA and are logged via Entra ID Conditional Access.",
    in_progress: "Maintenance authorization procedures are implemented. Remote maintenance logging via Entra ID is operational. Formal vendor maintenance approval workflow is being documented.",
    at_risk: "Remote maintenance sessions are not consistently logged. A procedure update is in progress.",
  },
  MP: {
    implemented: "APEX Solutions controls CUI media through removable media restrictions enforced by Intune Device Configuration policies. Removable media is blocked by default with approved exceptions requiring IT approval. Media disposal follows NIST 800-88 guidelines.",
    in_progress: "USB device control policy is deployed to 85% of devices via Intune. Remaining devices are in staged rollout. Media disposal log is being formalized.",
    at_risk: "USB device control is not enforced on 4 legacy workstations. POAM tracking is in progress.",
  },
  PE: {
    implemented: "APEX Solutions controls physical access to facilities containing CUI through badge-based access control systems, visitor logging, and CCTV monitoring. Physical access lists are reviewed quarterly.",
    in_progress: "Badge access system is operational. Visitor log digitization is in progress.",
    at_risk: "Physical access logs for the secondary server room were incomplete for 14 days due to reader malfunction.",
  },
  PS: {
    implemented: "APEX Solutions screens personnel with access to CUI through background checks prior to employment and conducts annual re-verification for privileged role holders. Termination procedures include immediate revocation of system access.",
    in_progress: "Personnel screening procedures are implemented. Formal annual re-verification workflow is being documented.",
    at_risk: "Three temporary contractor accounts were not deprovisioned within the required 24-hour window. An access review identified and remediated the gap.",
  },
  CA: {
    implemented: "APEX Solutions conducts periodic security assessments aligned to NIST SP 800-171A. A plan of action and milestones (POA&M) is maintained and reviewed monthly. The System Security Plan is reviewed annually.",
    in_progress: "Security assessment planning is underway. POA&M process is operational. SSP update is in progress.",
    at_risk: "SSP is 60 days overdue for its annual review. POA&M tracking is current.",
  },
  SC: {
    implemented: "APEX Solutions protects CUI in transit using TLS 1.2+ for all external communications. Data at rest is encrypted using AES-256 via BitLocker on endpoints and Azure Storage Service Encryption. Network segmentation separates CUI-handling systems.",
    in_progress: "BitLocker enforcement via Intune is 82% complete. Network segmentation review is in progress. TLS enforcement is fully operational.",
    at_risk: "9 managed devices report BitLocker encryption not enabled. POAM-APEX-003 tracks remediation.",
  },
  SI: {
    implemented: "APEX Solutions protects systems from malicious code using Microsoft Defender for Endpoint with real-time protection enabled across all managed devices. Signature updates are enforced daily via Intune.",
    in_progress: "Defender for Endpoint is deployed to 94% of managed devices. Remaining devices are in staged rollout.",
    at_risk: "Three Defender alerts older than 7 days are unreviewed. Alert triage SLA is being enforced.",
  },
  AT: {
    implemented: "APEX Solutions provides annual security awareness training to all personnel with system access. Training completion is tracked in the Training Register and reported to the Compliance Manager monthly.",
    in_progress: "Annual training cycle is in progress. Completion rate is 93%. Automated reminder workflows for non-compliant users are being configured.",
    at_risk: "6 employees have not completed the annual security awareness training. HR escalation is in progress.",
  },
  SR: {
    implemented: "APEX Solutions maintains a supply chain risk management program that includes supplier assessments, contract security requirements, and periodic reviews of CUI-handling vendors.",
    in_progress: "Vendor risk register is operational. Formal supplier assessment questionnaire process is being finalized.",
    at_risk: "3 CUI-handling vendors are overdue for annual security assessment. Supplier review is in progress.",
  },
};

function getNarr(controlId: string, status: string): string {
  const domain = controlId.split(".")[0] ?? "AC";
  const domNarr = NARR[domain] ?? NARR.AC!;
  return domNarr[status] ?? `APEX Solutions has addressed this control through applicable technical and procedural safeguards. Evidence is maintained in Control HUB.`;
}

// ─── Monitoring items ─────────────────────────────────────────────────────────
const APEX_MONITORING = [
  { task: "Review Defender Alerts and Security Incidents", frequency: "daily" as const, controlRef: "AU.L2-3.3.1", description: "Review Microsoft Defender XDR and Sentinel alerts. Investigate anomalies and close or escalate.", sortOrder: 1, op: "Open Microsoft Defender XDR > Incidents. Review all new alerts since last review.", test: "Confirm alert review log entry exists in Control HUB with date and reviewer signature.", evToRetain: "Defender Alert Review PDF/XLSX uploaded to Control HUB" },
  { task: "Verify Automated Backup Completion", frequency: "daily" as const, controlRef: "MP.L2-3.8.9", description: "Confirm all scheduled Azure Backup and on-prem backup jobs completed successfully.", sortOrder: 2, op: "Check backup dashboard in Azure Portal and on-prem backup console.", test: "No failed backup jobs. Last successful backup within 24 hours.", evToRetain: "Backup completion log screenshot or export" },
  { task: "Review Entra ID Sign-in Logs for Anomalies", frequency: "weekly" as const, controlRef: "IA.L2-3.5.3", description: "Review Entra ID sign-in logs for failed attempts, risky sign-ins, and unusual locations.", sortOrder: 3, op: "Navigate to Entra ID > Sign-in logs. Filter for failures and risky events.", test: "No unreviewed risky sign-ins older than 7 days.", evToRetain: "Sign-in log export uploaded to evidence repository" },
  { task: "Review Vulnerability Scan Results", frequency: "weekly" as const, controlRef: "RA.L2-3.11.2", description: "Review Tenable.io scan results for new findings. Assign remediation to asset owners.", sortOrder: 4, op: "Export latest scan from Tenable.io. Compare to previous scan for new findings.", test: "All high/critical findings assigned to owners within SLA.", evToRetain: "Vulnerability scan export CSV and remediation tracker update" },
  { task: "Review System Audit Logs for Anomalies", frequency: "weekly" as const, controlRef: "AU.L2-3.3.1", description: "Review Microsoft Sentinel incidents and Azure Monitor alerts for suspicious activity.", sortOrder: 5, op: "Open Sentinel Workbooks > Audit Summary. Review flagged events.", test: "All flagged events have documented disposition.", evToRetain: "Audit Log Review Record uploaded to Control HUB" },
  { task: "Review User Account Permissions", frequency: "monthly" as const, controlRef: "AC.L2-3.1.1", description: "Review user account permissions and group memberships for alignment with job function.", sortOrder: 6, op: "Export Entra ID group memberships. Compare to HR roster and role matrix.", test: "No accounts with excess permissions. Access review record completed.", evToRetain: "Access review spreadsheet signed by IT Administrator" },
  { task: "Verify Antivirus and EDR Definitions Updated", frequency: "monthly" as const, controlRef: "SI.L2-3.14.2", description: "Confirm all endpoints have current Microsoft Defender AV signatures.", sortOrder: 7, op: "Review Intune Antivirus policy report. Identify devices with outdated definitions.", test: "100% of online devices have definitions from current week.", evToRetain: "Defender AV status screenshot from Intune" },
  { task: "Test Incident Response Procedures", frequency: "monthly" as const, controlRef: "IR.L2-3.6.1", description: "Review IR plan currency. Coordinate with team on any open IR improvements.", sortOrder: 8, op: "Review IR Plan version. Confirm contact list is current. Verify escalation paths.", test: "IR plan reviewed; all contacts verified. Exercise scheduled per annual plan.", evToRetain: "IR review memo or tabletop exercise record" },
  { task: "Review and Update Firewall Rules", frequency: "monthly" as const, controlRef: "SC.L2-3.13.1", description: "Audit firewall rules for unnecessary access and compliance with network policy.", sortOrder: 9, op: "Export firewall ruleset. Review each allow rule for current business justification.", test: "No rules without documented justification. Ruleset review documented.", evToRetain: "Firewall ruleset export with review documentation" },
  { task: "Verify MFA Enforcement Status", frequency: "monthly" as const, controlRef: "IA.L2-3.5.3", description: "Confirm MFA is enforced for all users and all Conditional Access policies are active.", sortOrder: 10, op: "Export MFA registration report from Entra ID. Verify CA policies are enabled.", test: "MFA coverage >= 95%. CA policy enabled. Non-enrolled users notified.", evToRetain: "MFA registration report XLSX" },
  { task: "Conduct Security Awareness Training Check", frequency: "quarterly" as const, controlRef: "AT.L2-3.2.1", description: "Verify training completion rates and schedule refresher sessions for non-compliant users.", sortOrder: 11, op: "Export training completion report from training platform. Compare to active user list.", test: "Training completion >= 95%. Non-compliant users have escalation record.", evToRetain: "Training completion report XLSX" },
  { task: "Review and Update System Security Plan", frequency: "quarterly" as const, controlRef: "CA.L2-3.12.4", description: "Review SSP for accuracy and completeness against current system state.", sortOrder: 12, op: "Review each SSP section against current control assessments in Control HUB.", test: "SSP reviewed. All sections current. Pending updates documented in task.", evToRetain: "SSP review memo or updated SSP document" },
  { task: "Perform Formal Access Control Review", frequency: "quarterly" as const, controlRef: "AC.L2-3.1.1", description: "Formally certify all user access rights against current role assignments.", sortOrder: 13, op: "Export full user access list. Have each manager certify their team's access.", test: "All access rights certified. Excess access removed. Review record uploaded.", evToRetain: "Formal access review spreadsheet with manager signatures" },
  { task: "Review Third-Party and Supplier Security", frequency: "quarterly" as const, controlRef: "SR.L2-3.17.2", description: "Assess supplier security reviews and update vendor risk register.", sortOrder: 14, op: "Review vendor risk register. Identify vendors due for assessment.", test: "All CUI-handling vendors assessed within 12 months.", evToRetain: "Vendor risk register update and any supplier assessment reports" },
  { task: "Conduct Penetration Testing", frequency: "annually" as const, controlRef: "CA.L2-3.12.3", description: "Execute authorized penetration test on in-scope systems and document results.", sortOrder: 15, op: "Engage authorized penetration testing firm. Provide rules of engagement.", test: "Pen test report received. All findings have remediation assignments.", evToRetain: "Penetration test report and remediation tracker" },
  { task: "Update Organizational Risk Assessment", frequency: "annually" as const, controlRef: "RA.L2-3.11.1", description: "Refresh risk assessment with current threat landscape and control status.", sortOrder: 16, op: "Conduct risk assessment workshops with stakeholders. Update risk register.", test: "Risk register updated. All risks have treatment decisions.", evToRetain: "Updated risk assessment report and risk register" },
  { task: "Complete CMMC Readiness Self-Assessment", frequency: "annually" as const, controlRef: "CA.L2-3.12.1", description: "Conduct comprehensive readiness review across all 110 CMMC L2 practices.", sortOrder: 17, op: "Review all 110 controls in Control HUB. Update implementation narratives.", test: "All 110 controls assessed. POA&M items created for any gaps.", evToRetain: "Control HUB assessment export and self-assessment report" },
  { task: "Review and Update All Policies and Procedures", frequency: "annually" as const, controlRef: "CA.L2-3.12.4", description: "Annual review cycle for all CMMC-related policies and supporting procedures.", sortOrder: 18, op: "Review each policy and procedure in Control HUB. Update version and effective date.", test: "All documents reviewed. Outdated documents updated or deprecated.", evToRetain: "Policy review log and updated document versions in Control HUB" },
  { task: "Respond to and Document Security Incidents", frequency: "annually" as const, controlRef: "IR.L2-3.6.2", description: "Execute the IR plan for security events and document response actions as events occur.", sortOrder: 19, op: "Per IR plan: detect, contain, eradicate, recover. Document in Incident Log.", test: "Incident log current. All incidents have closed status or open tracking.", evToRetain: "Incident reporting log and any relevant incident response records" },
];

// ─── POA&M specs ─────────────────────────────────────────────────────────────
const APEX_POAMS = [
  { num: "POAM-APEX-001", title: "MFA Registration Incomplete — 9 User Accounts", deficiency: "9 user accounts (6.6% of active accounts) have not completed MFA enrollment. This creates risk of unauthorized access to CUI systems if credentials are compromised.", risk: "high" as const, status: "in_progress" as const, ctrl: "IA.L2-3.5.3", plan: "Phase 1 (Week 1-2): IT sends MFA enrollment notification with deadline. Phase 2 (Week 3): Manager escalation for non-enrolled users. Phase 3 (Week 4): Block CUI access for accounts without MFA. Target: 100% enrollment within 30 days.", days: 30, notes: "Progress: 4 of 9 accounts enrolled. 5 remaining escalated to HR." },
  { num: "POAM-APEX-002", title: "Stale Account Review — Service Accounts Without Recent Access Review", deficiency: "22 service accounts have not been included in the formal quarterly access review. Ownership and necessity have not been verified for 8 accounts created more than 12 months ago.", risk: "medium" as const, status: "open" as const, ctrl: "AC.L2-3.1.1", plan: "Step 1: IT Administrator inventories all service accounts with last-use date. Step 2: Accounts with no activity in 90 days flagged for review. Step 3: Owners contacted to confirm necessity. Step 4: Unnecessary accounts deprovisioned. Target: 45 days.", days: 45, notes: "Service account inventory in progress. Preliminary list shows 8 candidate accounts for deprovisioning." },
  { num: "POAM-APEX-003", title: "Intune Compliance Rollout Incomplete — 9 Devices Non-Compliant", deficiency: "9 managed devices are running outside the approved Intune security baseline configuration, primarily due to legacy application compatibility constraints.", risk: "high" as const, status: "in_progress" as const, ctrl: "CM.L2-3.4.2", plan: "Phase 1: IT assesses each device for baseline conflicts. Phase 2: Application owners identify mitigation options. Phase 3: Devices updated to baseline or compensating controls documented. Target: 60 days.", days: 60, notes: "3 of 9 devices remediated. 4 require application updates from vendor. 2 pending legacy software migration." },
  { num: "POAM-APEX-004", title: "Audit Log Review Evidence Incomplete — Q1 2026 Gap", deficiency: "Audit log review records for 3 weeks of Q1 2026 are missing from Control HUB. The reviews were performed but not documented per the Audit Log Review Procedure.", risk: "medium" as const, status: "in_progress" as const, ctrl: "AU.L2-3.3.1", plan: "Step 1: Reconstruct available evidence from Sentinel logs for the missing weeks. Step 2: Create retrospective review records. Step 3: Update procedure to require same-day upload. Step 4: Implement automated reminder. Target: 30 days.", days: 30, notes: "2 of 3 missing weeks reconstructed. Automated reminder rule configured in Sentinel." },
  { num: "POAM-APEX-005", title: "Vulnerability Remediation Backlog — 5 High-Severity CVEs", deficiency: "5 high-severity CVEs from the June 2026 Tenable scan have exceeded the 30-day remediation SLA. All are patch-available findings on endpoint systems.", risk: "high" as const, status: "open" as const, ctrl: "RA.L2-3.11.2", plan: "Step 1: IT prioritizes affected systems for patching in next maintenance window. Step 2: Interim compensating controls applied. Step 3: Patching completed in scheduled maintenance window. Step 4: Re-scan to confirm remediation. Target: 14 days.", days: 14, notes: "Patching window scheduled. Compensating controls applied to 3 of 5 affected systems." },
  { num: "POAM-APEX-006", title: "Incident Response Tabletop Exercise Overdue", deficiency: "The annual IR tabletop exercise was not completed in Q2 2026 as scheduled due to scheduling conflicts with key stakeholders. The exercise is now 45 days overdue.", risk: "medium" as const, status: "open" as const, ctrl: "IR.L2-3.6.1", plan: "Step 1: Reschedule tabletop exercise with all required participants for Q3 2026. Step 2: Engage third-party facilitator for ransomware scenario exercise. Step 3: Complete exercise and document after-action report. Target: 45 days.", days: 45, notes: "Exercise rescheduled for 2026-08-15. Facilitator engaged. Invitations sent." },
  { num: "POAM-APEX-007", title: "Backup Restore Test Documentation Needs Update", deficiency: "The Q1 2026 backup restore test was completed but the documentation lacks required fields: restore time measurement, checksum validation results, and IT Administrator signature.", risk: "low" as const, status: "in_progress" as const, ctrl: "MP.L2-3.8.9", plan: "Step 1: IT Administrator reviews Q1 test records and adds missing data from system logs. Step 2: Updated Backup Restore Test Record uploaded. Step 3: Procedure updated to include checklist. Target: 14 days.", days: 14, notes: "Updated record being finalized. Procedure checklist draft complete." },
];

// ─── Seed function ────────────────────────────────────────────────────────────

export async function seedApexSolutions(): Promise<void> {
  const [existing] = await db
    .select({ id: organizationsTable.id })
    .from(organizationsTable)
    .where(eq(organizationsTable.id, APEX_ORG_ID))
    .limit(1);

  if (existing) return;

  logger.info("Seeding APEX Solutions test organization...");

  // 1. Find the admin user (prefer admin@example.com, fall back to any global admin)
  let [adminUser] = await db.select({ id: usersTable.id, email: usersTable.email })
    .from(usersTable).where(eq(usersTable.email, ADMIN_EMAIL)).limit(1);
  if (!adminUser) {
    [adminUser] = await db.select({ id: usersTable.id, email: usersTable.email })
      .from(usersTable).where(eq(usersTable.role, "admin")).limit(1);
  }
  if (!adminUser) {
    logger.warn("Cannot seed APEX Solutions — no admin user found yet");
    return;
  }
  const adminUserId = adminUser.id;

  // 2. Create org
  await db.insert(organizationsTable).values({
    id: APEX_ORG_ID,
    name: APEX_ORG_NAME,
    legalName: "APEX Solutions LLC",
    shortName: "APEX",
    cageCode: "7APEX1",
    uei: "APEX123456789",
    industry: "Defense Technology / Aerospace",
    primaryContact: "Joseph Murray",
    complianceManagerId: adminUserId,
    organizationAddress: "4200 Wilson Blvd, Suite 900, Arlington, VA 22203",
    assessmentScope: "Cloud infrastructure (Microsoft 365 + Azure), endpoint fleet (112 devices), on-premises file servers, and all systems processing or transmitting CUI",
    cmmcTargetLevel: "L2",
    notes: "TEST ORGANIZATION — Synthetic sample data only. Created for Control HUB demonstration and testing. All data is fake and does not represent real operations.",
    isTestOrganization: true,
    isActive: true,
  }).onConflictDoNothing();

  // 3. Memberships
  await db.insert(organizationUsersTable).values({
    id: randomUUID(), organizationId: APEX_ORG_ID, userId: adminUserId,
    role: "org_admin", status: "active", joinedAt: new Date(),
  }).onConflictDoNothing();

  const [sysadmin] = await db.select({ id: usersTable.id }).from(usersTable)
    .where(eq(usersTable.email, SYSADMIN_EMAIL)).limit(1);
  if (sysadmin) {
    await db.insert(organizationUsersTable).values({
      id: randomUUID(), organizationId: APEX_ORG_ID, userId: sysadmin.id,
      role: "org_admin", status: "active", joinedAt: new Date(),
    }).onConflictDoNothing();
  }

  // 4. Control assessments
  const allControls = await db.select({ id: controlsTable.id, controlId: controlsTable.controlId })
    .from(controlsTable).orderBy(controlsTable.controlId);

  if (allControls.length > 0) {
    const statusPool: ("implemented" | "in_progress" | "not_started" | "at_risk")[] = [
      ...Array(35).fill("implemented" as const),
      ...Array(42).fill("in_progress" as const),
      ...Array(25).fill("not_started" as const),
      ...Array(8).fill("at_risk" as const),
    ];
    const statusAssignment: ("implemented" | "in_progress" | "not_started" | "at_risk")[] = new Array(110);
    for (let i = 0; i < 110; i++) {
      statusAssignment[(i * 37) % 110] = statusPool[i]!;
    }

    for (let i = 0; i < allControls.length; i++) {
      const ctrl = allControls[i]!;
      const status = statusAssignment[i] ?? "not_started";
      const narrative = status === "not_started" ? null : getNarr(ctrl.controlId, status);
      await db.insert(controlAssessmentsTable).values({
        id: randomUUID(), organizationId: APEX_ORG_ID, controlId: ctrl.id,
        status, implementationNarrative: narrative,
        assessedById: adminUserId,
        lastAssessedAt: status === "not_started" ? null : daysAgo(Math.floor(Math.random() * 90) + 1),
        createdAt: new Date(), updatedAt: new Date(),
      }).onConflictDoNothing();
    }
  }

  // 5. Monitoring items
  const monStatuses = [
    { status: "current" as const, lastCompleted: daysAgo(1), nextDue: daysFromNow(1), notes: "No anomalies. 2 alerts resolved." },
    { status: "current" as const, lastCompleted: daysAgo(1), nextDue: daysFromNow(1), notes: "All backup jobs successful." },
    { status: "current" as const, lastCompleted: daysAgo(5), nextDue: daysFromNow(2), notes: "1 risky sign-in investigated and dismissed." },
    { status: "open" as const, lastCompleted: daysAgo(10), nextDue: daysFromNow(-3), notes: "Scan results pending remediation assignment." },
    { status: "current" as const, lastCompleted: daysAgo(6), nextDue: daysFromNow(1), notes: "2 alerts investigated. 1 escalated to incident." },
    { status: "current" as const, lastCompleted: daysAgo(22), nextDue: daysFromNow(8), notes: "3 accounts de-provisioned. Review complete." },
    { status: "current" as const, lastCompleted: daysAgo(18), nextDue: daysFromNow(12), notes: "98% definition coverage. 2 offline devices tracked." },
    { status: "open" as const, lastCompleted: daysAgo(35), nextDue: daysFromNow(5), notes: "Monthly IR check pending. Exercise scheduled for August." },
    { status: "current" as const, lastCompleted: daysAgo(25), nextDue: daysFromNow(5), notes: "8 stale rules removed. Ruleset current." },
    { status: "in_progress" as const, lastCompleted: daysAgo(32), nextDue: daysFromNow(-2), notes: "91% MFA coverage. 12 accounts in enrollment escalation." },
    { status: "current" as const, lastCompleted: daysAgo(68), nextDue: daysFromNow(22), notes: "93% completion. 10 non-compliant escalated." },
    { status: "open" as const, lastCompleted: daysAgo(95), nextDue: daysFromNow(4), notes: "SSP review in progress. 8 sections updated." },
    { status: "current" as const, lastCompleted: daysAgo(80), nextDue: daysFromNow(10), notes: "All access rights certified. 7 memberships removed." },
    { status: "open" as const, lastCompleted: daysAgo(98), nextDue: daysFromNow(-5), notes: "Supplier review overdue. 3 vendors pending assessment." },
    { status: "current" as const, lastCompleted: daysAgo(210), nextDue: daysFromNow(155), notes: "Annual pen test completed 2026-01. 4 findings all remediated." },
    { status: "in_progress" as const, lastCompleted: daysAgo(310), nextDue: daysFromNow(55), notes: "Risk assessment update in progress. Workshop scheduled." },
    { status: "current" as const, lastCompleted: daysAgo(185), nextDue: daysFromNow(180), notes: "Annual readiness assessment complete. 110 controls reviewed." },
    { status: "current" as const, lastCompleted: daysAgo(195), nextDue: daysFromNow(170), notes: "All 15 policies reviewed. 3 updated for CMMC v2.1 alignment." },
    { status: "open" as const, lastCompleted: null, nextDue: null, notes: "As-needed. 8 incidents logged YTD." },
  ];

  for (let i = 0; i < APEX_MONITORING.length; i++) {
    const item = APEX_MONITORING[i]!;
    const st = monStatuses[i]!;
    await db.insert(monitoringItemsTable).values({
      id: randomUUID(), organizationId: APEX_ORG_ID,
      task: item.task, frequency: item.frequency, controlRef: item.controlRef,
      description: item.description, sortOrder: item.sortOrder,
      operatingProcedure: item.op, testProcedure: item.test, evidenceToRetain: item.evToRetain,
      status: st.status, lastCompleted: st.lastCompleted, nextDue: st.nextDue, notes: st.notes,
      createdAt: new Date(), updatedAt: new Date(),
    }).onConflictDoNothing();
  }

  // 6. Control map for POA&Ms and tasks
  const controlRows = await db.select({ id: controlsTable.id, controlId: controlsTable.controlId })
    .from(controlsTable);
  const controlMap: Record<string, string> = {};
  for (const c of controlRows) controlMap[c.controlId] = c.id;

  // 7. POA&Ms
  for (const p of APEX_POAMS) {
    const linkedControlId = controlMap[p.ctrl] ?? null;
    await db.insert(poamsTable).values({
      id: randomUUID(), organizationId: APEX_ORG_ID,
      poamNumber: p.num, title: p.title,
      deficiencyDescription: p.deficiency,
      status: p.status, riskLevel: p.risk,
      ownerId: adminUserId,
      linkedControlId,
      remediationPlan: p.plan,
      scheduledCompletionDate: daysFromNow(p.days),
      notes: p.notes,
      createdAt: daysAgo(30), updatedAt: new Date(),
    }).onConflictDoNothing();
  }

  // 8. Tasks
  const tasks = [
    { title: "Complete MFA enrollment for 9 outstanding accounts", priority: "high" as const, type: "control_review" as const, days: 14 },
    { title: "Patch 5 high-severity CVEs from July vulnerability scan", priority: "critical" as const, type: "control_review" as const, days: 7 },
    { title: "Reschedule Q3 IR tabletop exercise", priority: "medium" as const, type: "general" as const, days: 21 },
    { title: "Complete device compliance remediation for 9 non-compliant endpoints", priority: "high" as const, type: "control_review" as const, days: 30 },
    { title: "Finalize SSP review — 8 sections pending update", priority: "medium" as const, type: "policy_review" as const, days: 45 },
    { title: "Complete security awareness training for 10 outstanding employees", priority: "medium" as const, type: "training_review" as const, days: 14 },
    { title: "Upload Q2 audit log review records for 3 missing weeks", priority: "high" as const, type: "policy_review" as const, days: 7 },
  ];
  for (const t of tasks) {
    await db.insert(tasksTable).values({
      id: randomUUID(), organizationId: APEX_ORG_ID,
      title: t.title, status: "open", priority: t.priority, taskType: t.type,
      dueDate: daysFromNow(t.days), assigneeId: adminUserId, createdById: adminUserId,
      tags: [], isRecurring: false, createdAt: new Date(), updatedAt: new Date(),
    }).onConflictDoNothing();
  }

  // 9. Pre-assessment data
  const scanDate = daysAgo(14);
  const connId = randomUUID();

  await db.insert(tenantConnectionsTable).values({
    id: connId, organizationId: APEX_ORG_ID,
    tenantName: "APEX Solutions Microsoft 365",
    microsoftTenantId: "b2c3d4e5-f6a7-8901-bcde-f12345678901",
    primaryDomain: "apex-solutions.com",
    authMode: "app_only",
    connectionStatus: "connected",
    permissionsGranted: ["User.Read.All", "Policy.Read.All", "DeviceManagementConfiguration.Read.All", "SecurityEvents.Read.All", "AuditLog.Read.All", "IdentityRiskyUser.Read.All"],
    lastSuccessfulScan: scanDate,
    connectedBy: "IT Administrator",
    connectedAt: daysAgo(60),
    notes: "SYNTHETIC — Fake Microsoft tenant connection for APEX Solutions test org. Not connected to real tenant.",
    createdAt: daysAgo(60), updatedAt: scanDate,
  }).onConflictDoNothing();

  const scanId = randomUUID();
  await db.insert(paScanRunsTable).values({
    id: scanId, organizationId: APEX_ORG_ID, tenantConnectionId: connId,
    scanName: "APEX Baseline Compliance Scan — July 2026",
    scanType: "full",
    status: "completed",
    packsRequested: ["entra_id", "intune", "defender"],
    packsCompleted: ["entra_id", "intune", "defender"],
    packsFailed: [],
    startedAt: new Date(scanDate.getTime() - 1800000),
    completedAt: scanDate,
    totalChecks: 88, passedChecks: 42, failedChecks: 32, warnings: 10, unknowns: 4,
    generatedEvidenceCount: 11, generatedFindingCount: 6, generatedEvidenceRequestCount: 5,
    createdBy: "IT Administrator",
    createdAt: daysAgo(60), updatedAt: scanDate,
  }).onConflictDoNothing();

  const findings = [
    { ruleId: "APEX-ENTRA-001", name: "MFA Coverage", title: "MFA Enforcement Incomplete — 9 Accounts Without MFA", severity: "high" as const, result: "fail" as const, pack: "entra_id", observed: "9 active user accounts have not completed MFA registration and are not covered by an MFA-enforcing Conditional Access policy", expected: "All active users must be enrolled in MFA and covered by at least one MFA-enforcing Conditional Access policy", affected: 9, controls: ["IA.L2-3.5.3", "AC.L2-3.1.1"], remediation: "Enforce MFA enrollment deadline. Block CUI access for non-enrolled accounts until registration completes.", roadmap: "Complete MFA Enrollment for All Users" },
    { ruleId: "APEX-INTUNE-001", name: "Device Compliance", title: "9 Devices Non-Compliant with Intune Security Baseline", severity: "high" as const, result: "fail" as const, pack: "intune", observed: "9 of 112 managed devices report non-compliant status against the APEX Solutions Intune security baseline policy", expected: "All managed devices must be compliant with the enforced security baseline", affected: 9, controls: ["CM.L2-3.4.2", "CM.L2-3.4.1"], remediation: "Remediate baseline conflicts. Use Intune filter-based policy targeting to apply exceptions for legacy apps.", roadmap: "Remediate Intune Baseline Non-Compliance" },
    { ruleId: "APEX-ENTRA-002", name: "Legacy Auth", title: "Legacy Authentication Still Active for 2 Clients", severity: "medium" as const, result: "partial" as const, pack: "entra_id", observed: "Sign-in logs show successful legacy authentication from 2 client applications in the past 30 days", expected: "All legacy authentication must be blocked. No successful legacy auth events should appear in sign-in logs", affected: 2, controls: ["IA.L2-3.5.3", "IA.L2-3.5.4"], remediation: "Identify legacy clients via sign-in logs. Schedule migration to modern auth. Move to enforcement mode in CA policy.", roadmap: "Complete Legacy Authentication Blocking" },
    { ruleId: "APEX-INTUNE-002", name: "BitLocker", title: "9 Devices Lack BitLocker Encryption", severity: "high" as const, result: "fail" as const, pack: "intune", observed: "9 managed Windows devices report BitLocker encryption status as Not Encrypted or Not Reporting", expected: "All managed Windows devices must have BitLocker encryption enabled and reporting to Intune", affected: 9, controls: ["SC.L2-3.13.16", "SC.L2-3.13.8"], remediation: "Create or update Intune device configuration profile to enforce BitLocker with TPM PIN. Require encryption compliance.", roadmap: "Enforce BitLocker on All Endpoints" },
    { ruleId: "APEX-DEFENDER-001", name: "Alert Response", title: "3 High-Severity Defender Alerts Older than 7 Days", severity: "medium" as const, result: "partial" as const, pack: "defender", observed: "3 high-severity security alerts in Microsoft Defender XDR are more than 7 days old without an acknowledged or closed status", expected: "All high and critical alerts must be acknowledged and assigned within 24 hours of creation", affected: 3, controls: ["AU.L2-3.3.1", "IR.L2-3.6.1"], remediation: "Assign all open alerts to security analyst. Create SLA enforcement process for alert triage. Configure automated escalation.", roadmap: "Establish Daily Security Alert Review SLA" },
    { ruleId: "APEX-ENTRA-003", name: "Audit Retention", title: "Azure AD Audit Log Retention Below 90 Days on Non-Sentinel Workspace", severity: "low" as const, result: "fail" as const, pack: "entra_id", observed: "Azure AD audit log interactive retention is 30 days in the default Log Analytics Workspace", expected: "Audit logs must be retained and available for review for at least 90 days", affected: 0, controls: ["AU.L2-3.3.6", "AU.L2-3.3.2"], remediation: "Configure diagnostic settings to route all audit log categories to a Log Analytics Workspace with 90+ day interactive retention.", roadmap: "Extend Audit Log Retention to 365 Days" },
  ];

  const findingIds: string[] = [];
  for (const f of findings) {
    const fId = randomUUID();
    findingIds.push(fId);
    await db.insert(paFindingsTable).values({
      id: fId, scanRunId: scanId, organizationId: APEX_ORG_ID,
      ruleId: f.ruleId, ruleName: f.name, title: f.title,
      severity: f.severity, result: f.result, packId: f.pack,
      observedCondition: f.observed, expectedCondition: f.expected,
      affectedCount: f.affected, linkedControlIds: f.controls,
      recommendedRemediation: f.remediation, suggestedRoadmapAction: f.roadmap,
      createdAt: scanDate, updatedAt: scanDate,
    }).onConflictDoNothing();
  }

  const evRecords = [
    { pack: "entra_id", title: "Conditional Access Policy Export — All Policies", desc: "Export of all Conditional Access policies showing coverage and conditions.", controls: ["AC.L2-3.1.1", "IA.L2-3.5.3"], status: "approved" as const },
    { pack: "intune", title: "Intune Device Compliance Policy Configuration", desc: "All Intune device compliance policies with settings and assignments.", controls: ["CM.L2-3.4.1", "CM.L2-3.4.2"], status: "approved" as const },
    { pack: "entra_id", title: "MFA Registration Status Report — All Users", desc: "Per-user MFA registration status and registered authentication methods.", controls: ["IA.L2-3.5.3"], status: "pending_review" as const },
    { pack: "intune", title: "BitLocker Encryption Compliance Report", desc: "Intune report showing encryption status per managed device.", controls: ["SC.L2-3.13.16", "SC.L2-3.13.8"], status: "pending_review" as const },
    { pack: "entra_id", title: "Sign-in Log — Risky Sign-ins Last 30 Days", desc: "Azure AD Identity Protection risky sign-in events for the past 30 days.", controls: ["IA.L2-3.5.3", "AU.L2-3.3.1"], status: "approved" as const },
    { pack: "defender", title: "Microsoft Defender XDR Alert Summary", desc: "Summary of all security alerts from Defender XDR including open and closed items.", controls: ["AU.L2-3.3.1", "IR.L2-3.6.1"], status: "approved" as const },
    { pack: "entra_id", title: "Legacy Authentication Sign-in Log", desc: "Sign-in events using legacy authentication protocols from the past 30 days.", controls: ["IA.L2-3.5.3", "IA.L2-3.5.4"], status: "pending_review" as const },
    { pack: "intune", title: "Device Compliance Status — All Devices", desc: "Intune compliance status for all enrolled devices.", controls: ["CM.L2-3.4.2"], status: "approved" as const },
    { pack: "entra_id", title: "Azure AD Audit Log Retention Settings", desc: "Current audit log retention configuration from Diagnostic Settings.", controls: ["AU.L2-3.3.6"], status: "approved" as const },
    { pack: "defender", title: "Open Security Alerts — High Severity", desc: "All open high-severity security alerts from Microsoft Defender XDR.", controls: ["IR.L2-3.6.1"], status: "pending_review" as const },
    { pack: "intune", title: "Intune Security Baseline Assignment Report", desc: "Report showing security baseline policy assignments and compliance.", controls: ["CM.L2-3.4.1"], status: "approved" as const },
  ];
  for (const er of evRecords) {
    await db.insert(paEvidenceRecordsTable).values({
      id: randomUUID(), scanRunId: scanId, organizationId: APEX_ORG_ID,
      packId: er.pack, title: er.title, description: er.desc,
      evidenceType: "Tenant Assessment Snapshot", source: "Microsoft Graph API",
      linkedControlIds: er.controls, status: er.status,
      collectedAt: scanDate, createdAt: scanDate, updatedAt: scanDate,
    }).onConflictDoNothing();
  }

  const evRequests = [
    { title: "MFA Enrollment Screenshot — All Admin Accounts", instructions: "Take a screenshot of Entra ID Users > Per-user MFA showing registration status for all users with admin roles.", filename: "mfa-admin-enrollment-screenshot.png", controls: ["IA.L2-3.5.3"], findingIdx: 0, days: 14 },
    { title: "BitLocker Policy Export from Intune", instructions: "Export the Intune device configuration profile enforcing BitLocker. Include policy settings and device assignments.", filename: "intune-bitlocker-policy-export.pdf", controls: ["SC.L2-3.13.8"], findingIdx: 3, days: 14 },
    { title: "Legacy Authentication Block Policy Screenshot", instructions: "Screenshot of Conditional Access policy blocking legacy authentication. Show policy state, conditions, and grant controls.", filename: "ca-block-legacy-auth.png", controls: ["IA.L2-3.5.3"], findingIdx: 2, days: 7 },
    { title: "Defender Alert Triage Documentation", instructions: "Provide documentation of the 3 unresolved high-severity Defender alerts: analyst assignment, investigation notes, and planned resolution.", filename: "defender-alert-triage-q3-2026.pdf", controls: ["AU.L2-3.3.1", "IR.L2-3.6.1"], findingIdx: 4, days: 3 },
    { title: "Audit Log Retention Configuration Screenshot", instructions: "Screenshot of Log Analytics Workspace > Usage and Estimated Costs > Data Retention showing 90+ day retention configured.", filename: "log-analytics-retention-config.png", controls: ["AU.L2-3.3.6"], findingIdx: 5, days: 21 },
  ];
  for (const er of evRequests) {
    await db.insert(paEvidenceRequestsTable).values({
      id: randomUUID(), scanRunId: scanId, organizationId: APEX_ORG_ID,
      findingId: findingIds[er.findingIdx] ?? null,
      title: er.title, instructions: er.instructions,
      suggestedFilename: er.filename, linkedControlIds: er.controls,
      dueDate: daysFromNow(er.days), ownerEmail: ADMIN_EMAIL,
      status: "open", createdAt: scanDate, updatedAt: scanDate,
    }).onConflictDoNothing();
  }

  const roadmap = [
    { cat: "Identity & Access", title: "Complete MFA Enrollment for All Users", desc: "Enforce MFA enrollment deadline. Block CUI system access for non-enrolled users via Conditional Access.", priority: 1, findings: ["APEX-ENTRA-001"], controls: ["IA.L2-3.5.3", "AC.L2-3.1.1"], status: "in_progress" as const },
    { cat: "Device Management", title: "Remediate Intune Baseline Non-Compliance", desc: "Resolve legacy app compatibility conflicts. Apply Intune filter-based policy exceptions where justified.", priority: 1, findings: ["APEX-INTUNE-001"], controls: ["CM.L2-3.4.2"], status: "in_progress" as const },
    { cat: "Data Protection", title: "Enforce BitLocker on All Endpoints", desc: "Create or update the Intune device configuration profile to enforce BitLocker AES-256 with TPM+PIN.", priority: 2, findings: ["APEX-INTUNE-002"], controls: ["SC.L2-3.13.16", "SC.L2-3.13.8"], status: "open" as const },
    { cat: "Identity & Access", title: "Complete Legacy Authentication Blocking", desc: "Identify remaining 2 legacy clients via sign-in logs. Migrate to modern auth and move CA policy to enforcement.", priority: 2, findings: ["APEX-ENTRA-002"], controls: ["IA.L2-3.5.3", "IA.L2-3.5.4"], status: "in_progress" as const },
    { cat: "Operations", title: "Establish Daily Security Alert Review SLA", desc: "Define security operations process for daily Defender XDR alert review. Assign on-call rotation.", priority: 3, findings: ["APEX-DEFENDER-001"], controls: ["AU.L2-3.3.1", "IR.L2-3.6.1"], status: "open" as const },
    { cat: "Audit & Logging", title: "Extend Audit Log Retention to 365 Days", desc: "Route all Azure AD and system audit logs to a Log Analytics Workspace with 365-day retention.", priority: 3, findings: ["APEX-ENTRA-003"], controls: ["AU.L2-3.3.6", "AU.L2-3.3.2"], status: "open" as const },
    { cat: "Device Management", title: "Complete Intune Device Enrollment", desc: "Identify and enroll any remaining unmanaged devices used by CUI-system users.", priority: 4, findings: [], controls: ["CM.L2-3.4.1"], status: "open" as const },
    { cat: "Identity & Access", title: "Implement Privileged Identity Management", desc: "Configure Entra ID PIM for all privileged role holders. Require time-bound activation with justification.", priority: 4, findings: [], controls: ["AC.L2-3.1.2", "AC.L2-3.1.5"], status: "open" as const },
  ];
  for (const ra of roadmap) {
    await db.insert(paRoadmapActionsTable).values({
      id: randomUUID(), scanRunId: scanId, organizationId: APEX_ORG_ID,
      category: ra.cat, title: ra.title, description: ra.desc,
      priority: ra.priority, drivingFindings: ra.findings,
      linkedControlIds: ra.controls, status: ra.status,
      createdAt: scanDate, updatedAt: scanDate,
    }).onConflictDoNothing();
  }

  logger.info(
    "APEX Solutions test org seeded — org, 110 assessments, 19 monitoring items, 7 POA&Ms, 7 tasks, pre-assessment scan"
  );
}
