import { Router } from "express";
import { db, monitoringItemsTable, organizationsTable } from "@workspace/db";
import { eq, and, ilike, or, lte, gte, count, sql } from "drizzle-orm";
import { requireAuth } from "../lib/auth";
import { requireOrg } from "../middleware/org";
import { randomUUID } from "crypto";

const router = Router();

interface MonitoringSeedItem {
  frequency: "daily" | "weekly" | "monthly" | "quarterly" | "annually";
  task: string;
  controlRef: string;
  description: string;
  sortOrder: number;
  operatingProcedure: string;
  testProcedure: string;
  evidenceToRetain: string;
}

const MONITORING_SEED_ITEMS: MonitoringSeedItem[] = [
  {
    frequency: "daily",
    task: "Review Defender Alerts",
    controlRef: "3.14.3",
    description: "Check Microsoft Defender for active alerts",
    sortOrder: 0,
    operatingProcedure: `1. Open Microsoft Defender portal and navigate to Incidents & Alerts for the review period.
2. Assign, categorize, and disposition each alert. Set alert status to indicate affected CUI assets/servers and alerts not yet assigned.
3. Assign and notify responsible staff to investigate open alerts.
4. Update investigation status, recommended actions, and correlated activity for each alert.
5. Assign an owner and ticket for confirmed or unremediated alerts — confirm affected systems, severity, and status.
6. Review Microsoft Secure Score for CUI systems and note any new recommendations.
7. Set the date range and review sign-in logs: include interactive, non-interactive, service principal, and managed identity sign-ins.
8. For failed MFA sign-ins or high-risk logins, review Conditional Access policy outcomes.
9. Filter Defender XDR to CUI-scoped devices and review Critical/High alerts for data exfiltration, unauthorized access, or anomalous behavior.
10. Compare results against expected change tickets and approved activities.
11. Prioritize Critical/High, known-exploited, zero-day, and internet-exposed vulnerabilities first.
12. Create remediation tickets with owner, due date, affected assets, and remediation plan.
13. Route every new deficiency that cannot be immediately corrected to the POA&M tracker.`,
    testProcedure: `1. Verify each CUI-scoped incident has a documented review with outcome, disposition, response action, and closure/containment information.
2. Verify no Critical/High incident exceeds the internal triage SLA without a documented response.
3. Confirm alert notifications and SIEM routing are functioning — sample 3–5 alerts and validate acknowledgment.
4. Confirm MFA, administrative access, and SSO routing are configured correctly; document privileged sign-ins and risk-flagged events.
5. Verify each suspicious login attempt has a documented review, owner validation or investigation, and remediation notes.`,
    evidenceToRetain: `• Screenshot of incident queue at selected time-range showing dates, categories, actions taken, and closure notes.
• For Critical/High incidents: investigation/action center results where reviewed.
• List of false positives with approved exception documentation.
• Screenshot of alert notification routing/filtering items and results.
• Risky user/sign-ins report and investigation notes.
• Ticket IDs for suspicious sign-ins and remediation actions.
• Evidence of log retention/export configuration after audit.
• Exception notes with approvals.`,
  },
  {
    frequency: "weekly",
    task: "Review Entra Sign-in Logs",
    controlRef: "3.3.x",
    description: "Check for suspicious logins",
    sortOrder: 1,
    operatingProcedure: `1. Open Microsoft Entra ID (Azure AD) and navigate to Sign-in Logs.
2. Set the date range to cover the review period (last 7 days).
3. Filter for interactive, non-interactive, service principal, and managed identity sign-ins.
4. Review for risky sign-ins, failed MFA attempts, logins from unexpected locations, and sign-ins outside business hours.
5. For each flagged sign-in: document the user, timestamp, location, IP, risk level, and outcome.
6. Review Conditional Access policy evaluation results for failed logins.
7. Investigate any anomalous sign-ins — confirm affected account, device, and business justification.
8. Disable or reset accounts where compromise is suspected.
9. Route any confirmed issues to the incident response process and POA&M tracker.
10. Compare results against approved user travel/remote access records.`,
    testProcedure: `1. Verify sign-in log review was completed for the full period (no gaps).
2. Confirm risky sign-ins were reviewed and dispositioned (approved or investigated).
3. Verify at least 5 sign-in log entries were sampled and documented.
4. Confirm all failed MFA events have been reviewed and root-caused.
5. Verify suspicious sign-ins have documented investigation, owner validation, and remediation notes.`,
    evidenceToRetain: `• Screenshot or export of Entra sign-in log for the review period.
• List of risky or flagged sign-ins with disposition notes.
• Remediation tickets or account reset documentation for compromised accounts.
• Conditional Access policy evaluation results for failed logins.
• Ticket IDs for suspicious sign-ins and remediation actions.
• Exception approvals for approved anomalous sign-ins (e.g., travel).`,
  },
  {
    frequency: "weekly",
    task: "Review Audit Logs",
    controlRef: "3.12.3",
    description: "Review Purview audit logs",
    sortOrder: 2,
    operatingProcedure: `1. Open Microsoft Purview Audit Search and set the review period (last 7 days).
2. Apply filters for high-risk activity categories: privileged role changes, file access, external sharing, and CUI data movement.
3. Review all flagged audit events and compare against approved change tickets.
4. Identify and document any unauthorized access, privilege escalation, or data exfiltration events.
5. For each finding: record the user, action, timestamp, resource, and disposition.
6. Cross-reference findings with the active change management log.
7. Escalate unplanned or unauthorized changes to the incident response process.
8. Update POA&M for findings that cannot be remediated immediately.
9. Save and export the audit log for the period as evidence.`,
    testProcedure: `1. Verify audit log review was completed for the full period with no gaps.
2. Sample at least 5 open audit findings and confirm evidence of review, owner assignment, and disposition.
3. Sample at least 3 closed findings and verify closure evidence is documented.
4. Verify all flagged events have been cross-referenced with change management records.
5. Confirm overdue open findings have been escalated to management.`,
    evidenceToRetain: `• Exported audit log for the review period (CSV or screenshot).
• List of flagged events with disposition notes.
• Change ticket cross-references for approved changes.
• POA&M entries for unresolved findings.
• Management escalation records for overdue items.
• Screenshot of Purview audit search filter configuration.`,
  },
  {
    frequency: "weekly",
    task: "Review Vulnerabilities",
    controlRef: "3.11.2",
    description: "Check Defender recommendations",
    sortOrder: 3,
    operatingProcedure: `1. Open Microsoft Defender Vulnerability Management and navigate to the Recommendations dashboard.
2. Filter to CUI-scoped devices and workloads only.
3. Sort by severity: prioritize Critical and High vulnerabilities first, then known-exploited (KEV), zero-day, and internet-exposed assets.
4. For each Critical/High finding: create or update a remediation ticket with owner, due date, affected assets, and remediation plan.
5. Update each device's compliance tracking fields in Intune/Defender.
6. Review this week's newly discovered vulnerabilities and confirm they are triaged.
7. Review progress on previously open remediation tickets — close completed items with evidence.
8. Route findings that cannot be remediated within policy timelines to the POA&M tracker.
9. Export the vulnerability report for record retention.`,
    testProcedure: `1. Verify the vulnerability report was generated for the period and reviewed.
2. Confirm the top 5 Critical/High vulnerabilities each have a remediation ticket with owner and due date.
3. Sample at least 3 Critical/High items and confirm evidence of remediation action or accepted risk.
4. Verify all open remediation items are time-bound and approved.
5. Confirm newly discovered vulnerabilities have been triaged within the required SLA.`,
    evidenceToRetain: `• Defender Vulnerability Management report export (CSV or screenshot) showing severity, affected devices, and status.
• Remediation tickets for Critical/High findings with owner and due date.
• Exception approvals and expiration dates for accepted risks.
• Updated risk register entries for unmitigated risks.
• Evidence of patch or configuration fix for at least one resolved item.`,
  },
  {
    frequency: "weekly",
    task: "Update POA&M",
    controlRef: "3.12.2",
    description: "Update any findings",
    sortOrder: 4,
    operatingProcedure: `1. Open the POA&M tracker and review all open items.
2. Update status, milestone dates, and responsible parties for each item.
3. Add any new findings identified this week from security reviews (vulnerabilities, audit logs, compliance checks).
4. Confirm scheduled milestones are met or rescheduled with documented justification.
5. Close completed items and attach supporting evidence references.
6. Escalate past-due items to management with a status summary.
7. Review items approaching their scheduled completion date and verify progress.
8. Export the updated POA&M as the official record for this review cycle.`,
    testProcedure: `1. Verify all open POA&M items have a current status, assigned owner, and milestone date.
2. Verify at least one update was made to the POA&M this week.
3. Sample at least 3 open items and confirm documented milestone progress.
4. Verify closed items have closure evidence referenced.
5. Confirm management was notified of any past-due or escalated items.`,
    evidenceToRetain: `• Current POA&M export (versioned workbook or system screenshot) showing all open items with status.
• Evidence of management notification for past-due items.
• Closed item evidence references (ticket IDs, screenshots, configuration exports).
• Update log showing changes made during this review cycle.
• POA&M version history or changelog.`,
  },
  {
    frequency: "weekly",
    task: "Check Device Compliance",
    controlRef: "3.4.x",
    description: "Verify Intune compliance",
    sortOrder: 5,
    operatingProcedure: `1. Open Microsoft Intune and navigate to the Device Compliance dashboard.
2. Filter to CUI-scoped devices only.
3. Review the compliance dashboard for non-compliant and grace-period devices.
4. For each non-compliant device: identify the policy failure, affected device, and owner.
5. Create or update remediation tickets for non-compliant devices.
6. Verify all CUI devices have encryption (BitLocker/FileVault) enabled.
7. Confirm devices in a grace period are tracked with an expiration deadline.
8. Review and confirm Conditional Access policies are blocking non-compliant devices from CUI resources.
9. Export the compliance report for record retention.`,
    testProcedure: `1. Verify all CUI-scoped devices are enrolled in Intune and reporting compliance status.
2. Sample at least 10 CUI-scoped devices and confirm compliance policy status.
3. Verify non-compliant devices have open remediation tickets with owner and due date.
4. Confirm no device has been non-compliant beyond the acceptable window without a documented exception.
5. Verify Conditional Access is blocking non-compliant devices from accessing CUI.`,
    evidenceToRetain: `• Intune compliance dashboard export or screenshot showing compliance status per device.
• List of non-compliant devices with remediation status and ticket references.
• Conditional Access policy export showing non-compliant device blocking.
• Configuration baseline policy export showing applied policies.
• Exception documentation for approved non-compliant devices.`,
  },
  {
    frequency: "monthly",
    task: "Review Firewall Rules",
    controlRef: "3.13.6",
    description: "Validate deny-by-default rules",
    sortOrder: 6,
    operatingProcedure: `1. Export current firewall rule sets from all applicable network devices and cloud security groups (NSGs, Azure Firewall, on-premises firewalls).
2. Compare each rule against the approved firewall baseline configuration document.
3. Identify rules that are overly permissive, unused, undocumented, or not in the approved baseline.
4. Disable or remove any unauthorized rules — document each change with a change ticket reference.
5. Confirm deny-by-default (implicit deny) rules are in place at all network perimeters protecting CUI.
6. Verify any allow rules are least-privilege (specific ports, sources, and destinations).
7. Update the network security baseline document to reflect the current approved rule set.
8. Obtain management review of any rule changes made during this review cycle.`,
    testProcedure: `1. Verify the firewall rule review was completed for all applicable devices and security groups.
2. Sample at least 10 firewall rules across CUI network segments and confirm each has documented business justification.
3. Verify no unauthorized inbound rules exist for CUI network segments.
4. Confirm deny-by-default policy is applied at all CUI network boundaries.
5. Verify all rule changes were made via the change management process with approved tickets.`,
    evidenceToRetain: `• Firewall rule export (CSV or screenshot) showing rule name, direction, ports, protocol, source, destination, and enabled status.
• Approved baseline configuration document with review date.
• Change tickets for any modifications made during the review period.
• Screenshot confirming deny-by-default rule at network perimeter.
• Management review sign-off for rule changes.`,
  },
  {
    frequency: "monthly",
    task: "Review User Accounts",
    controlRef: "3.1.x",
    description: "Check user and admin accounts",
    sortOrder: 7,
    operatingProcedure: `1. Export the full user account list from Active Directory / Microsoft Entra ID.
2. Identify inactive accounts (no successful login in 30+ days) and flag for review.
3. Identify accounts with privileged roles (Global Admin, Security Admin, etc.) — verify each has documented business justification and current owner.
4. Disable or remove accounts for separated employees, contractors, and temporary staff whose access is no longer required.
5. Review and confirm shared/service accounts are documented with current owners and are subject to least-privilege.
6. Verify MFA is enforced for all accounts with access to CUI.
7. Confirm guest/external accounts are reviewed and approved.
8. Update IAM documentation with review results and any actions taken.`,
    testProcedure: `1. Verify all privileged accounts have documented approval and a current assigned owner.
2. Sample at least 10 standard users, all privileged admins, and confirm accounts have valid business justification.
3. Verify no terminated employee or contractor accounts remain active.
4. Confirm MFA is enforced for all accounts with CUI access.
5. Sample at least 3 service accounts and confirm documented ownership and last-used date.`,
    evidenceToRetain: `• User and privileged account export with last login date, role, and account status.
• Disabled/deleted account log with justification and authorization references.
• MFA enforcement policy export or screenshot showing coverage.
• IAM review sign-off documentation with reviewer identity and date.
• Guest/external account approval records.`,
  },
  {
    frequency: "monthly",
    task: "Verify Backups",
    controlRef: "3.8.9",
    description: "Ensure backups are accessible",
    sortOrder: 8,
    operatingProcedure: `1. Open the backup management console (Azure Backup, Veeam, or equivalent).
2. Review backup job completion status for all CUI-scoped systems over the past month.
3. Identify failed or incomplete backup jobs and investigate the root cause.
4. Confirm recovery point objectives (RPO) are being met for all CUI systems.
5. Perform a test restore of at least one backup to confirm recoverability — document the restore time and outcome.
6. Review backup retention settings against policy requirements (minimum 90 days recommended).
7. Confirm backup storage locations are appropriately secured and access-controlled.
8. Update the backup compliance log with this month's results.`,
    testProcedure: `1. Verify backup jobs completed successfully for all CUI-scoped systems in the period.
2. Sample at least 3 backup jobs and confirm completion status, timestamp, and target storage location.
3. Verify at least one test restore was performed and documented this period.
4. Confirm backup retention settings meet organizational policy requirements.
5. Verify failed backups have open remediation tickets.`,
    evidenceToRetain: `• Backup job completion report (screenshot or export) showing all jobs, dates, and success/failure status.
• Test restore results documentation including date, system restored, restore time, and outcome.
• Backup retention configuration screenshot or export.
• Remediation tickets for any failed backup jobs.
• Access control evidence for backup storage locations.`,
  },
  {
    frequency: "monthly",
    task: "Verify Updates",
    controlRef: "3.14.1",
    description: "Confirm patches applied",
    sortOrder: 9,
    operatingProcedure: `1. Open Microsoft Intune Update Rings, WSUS, or SCCM compliance dashboard.
2. Filter to CUI-scoped devices only.
3. Review patch compliance status for all devices — identify devices missing Critical or High-severity patches.
4. For devices more than 30 days behind on critical patches: create remediation tickets with owner and due date.
5. Confirm patch deployment rings are configured, active, and progressing.
6. Review and document any approved exceptions to patch timeline requirements.
7. Verify third-party software patches (browsers, PDF readers, etc.) are also current on CUI devices.
8. Export the patch compliance report for record retention.`,
    testProcedure: `1. Verify a patch compliance report was generated for the review period.
2. Sample at least 10 CUI-scoped devices and confirm their patch status.
3. Verify no CUI device is missing a Critical/High patch beyond the acceptable window without a documented exception.
4. Confirm patches applied during the period match the expected update cycle and deployment ring configuration.
5. Verify remediation tickets exist for all non-compliant devices.`,
    evidenceToRetain: `• Patch compliance report export showing device name, OS version, patch status, and last scan date.
• Remediation tickets for non-compliant devices with owner and due date.
• Approved exception documentation for devices with delayed patches.
• Update ring configuration screenshot or export.
• Evidence of third-party software patch verification on sampled CUI devices.`,
  },
  {
    frequency: "monthly",
    task: "Check Media Compliance",
    controlRef: "3.8.x",
    description: "Ensure no unauthorized media",
    sortOrder: 10,
    operatingProcedure: `1. Review the organizational removable media policy for CUI systems.
2. Open Intune/Defender Device Control dashboard and review removable media events for the period.
3. Identify any unauthorized removable media connections on CUI-scoped workstations.
4. Confirm Device Control policies are enforced across all CUI-scoped devices.
5. Review and validate any existing exceptions — confirm each has documented approval and expiration date.
6. Remove or revoke unauthorized media access exceptions.
7. Update the media sanitization log if any media was removed from service or destroyed.
8. Document review results with reviewer identity and date.`,
    testProcedure: `1. Verify removable media policy is enforced on all CUI-scoped devices via Device Control policy.
2. Sample at least 10 CUI-scoped devices and confirm the Device Control policy is applied and active.
3. Verify no unauthorized removable media connections occurred in the period without a documented exception.
4. Confirm Device Control event logs show no unapproved media events.
5. Verify the media sanitization log is current and complete.`,
    evidenceToRetain: `• Device Control policy export or screenshot showing enforcement status and scope.
• Audit log or report of removable media events for the review period.
• Approved exception list for permitted media devices with expiration dates.
• Media sanitization log showing disposed or destroyed media.
• Screenshot of Device Control dashboard confirming policy coverage.`,
  },
  {
    frequency: "quarterly",
    task: "Review Risk Assessment",
    controlRef: "3.11.1",
    description: "Update risk profile",
    sortOrder: 11,
    operatingProcedure: `1. Open the current Risk Register.
2. Review all open risk items for current status, mitigation progress, ownership, and milestone dates.
3. Identify new threats or vulnerabilities identified since the last quarterly review.
4. Add new risk items with risk rating (likelihood × impact), owner, mitigation plan, and target date.
5. Update risk ratings for existing items as mitigations mature or new information emerges.
6. Review effectiveness of existing security controls in reducing identified risks.
7. Escalate Critical/High risks to management for review and decision (accept, mitigate, transfer).
8. Update the Risk Register document with review date and reviewer signature.
9. Link unmitigated risks to open POA&M items.`,
    testProcedure: `1. Verify the Risk Register was updated within the quarter.
2. Sample at least 5 open risk items and confirm current status, owner, mitigation plan, and milestone date.
3. Verify all Critical/High risks have an approved mitigation plan or risk acceptance documentation.
4. Confirm risk items are linked to relevant controls or POA&Ms where applicable.
5. Verify management review and sign-off on the updated Risk Register.`,
    evidenceToRetain: `• Current Risk Register export with risk ratings, owner, mitigation status, and target dates.
• Management review sign-off documentation with reviewer identity and date.
• Evidence of new risks identified and added this quarter.
• Linked POA&M entries for unmitigated risks.
• Control effectiveness notes referenced in the Risk Register.`,
  },
  {
    frequency: "quarterly",
    task: "Review Policies",
    controlRef: "ALL",
    description: "Ensure policies are current",
    sortOrder: 12,
    operatingProcedure: `1. Open the policy management system or document repository.
2. Generate a list of all active policies with their last review date and expiration date.
3. Identify policies that are expired, past their review date, or missing required sections.
4. Review each policy for accuracy, completeness, and alignment with current operations and CMMC requirements.
5. Update or revise policies as needed — track changes with version control.
6. Route updated policies for management review and approval.
7. Confirm policy distribution to all affected personnel (email, training platform, or policy portal).
8. Record review completion with reviewer identity, review date, and next review date.`,
    testProcedure: `1. Verify all policies have been reviewed within the required timeframe (quarterly for high-risk policies).
2. Sample at least 5 policies and confirm they are current, complete, and approved.
3. Verify approval signatures are present on reviewed policies.
4. Confirm policy distribution has been completed and records retained.
5. Verify version history is maintained for all reviewed and updated policies.`,
    evidenceToRetain: `• Policy review log with policy name, reviewer identity, review date, and next review date.
• Approved policy documents with version history and approval signatures.
• Distribution records or personnel acknowledgment evidence.
• List of policies pending update with responsible owner and target completion date.
• Policy portal screenshot showing current policy library status.`,
  },
  {
    frequency: "quarterly",
    task: "Test Incident Response",
    controlRef: "3.6.3",
    description: "Run simulated incident",
    sortOrder: 13,
    operatingProcedure: `1. Schedule and communicate the tabletop exercise or simulated incident scenario in advance.
2. Define the scenario: ransomware attack, data breach, insider threat, or unauthorized CUI access.
3. Distribute the Incident Response Plan (IRP) to all participants prior to the exercise.
4. Walk through the IRP step-by-step with all key stakeholders (security, IT, management, legal, HR).
5. Document decisions made, timeline adherence, communication gaps, and role effectiveness during the exercise.
6. Capture lessons learned and gaps identified during the exercise.
7. Assign owners and due dates to all identified gaps and improvements.
8. Update the IRP to address gaps found.
9. Record exercise completion with participant list, date, scenario used, and sign-off.`,
    testProcedure: `1. Verify the incident response exercise was completed within the quarter.
2. Confirm the exercise included all key stakeholders (security, IT, management, legal).
3. Verify lessons learned were documented and tracked to closure.
4. Confirm the IRP was updated based on exercise findings.
5. Verify exercise documentation was retained with participant list and sign-off.`,
    evidenceToRetain: `• Exercise scenario and agenda documentation.
• Participant list and attendance record with signatures.
• Lessons learned report with findings, owners, and due dates.
• Updated IRP version reflecting exercise findings with change log.
• Management sign-off on exercise completion and IRP update.`,
  },
  {
    frequency: "annually",
    task: "Security Assessment",
    controlRef: "3.12.1",
    description: "Full control review",
    sortOrder: 14,
    operatingProcedure: `1. Define and document the scope of the annual security assessment: systems, processes, and controls to be assessed.
2. Obtain management approval of the assessment scope and schedule.
3. Conduct assessment using CMMC Level 2 assessment guides (DoD CMMC Assessment Guides) and NIST SP 800-171A procedures.
4. Evaluate each of the 110 CMMC Level 2 controls for implementation status: MET, NOT MET, or NOT APPLICABLE.
5. Collect and retain evidence for each control assessment.
6. Document all findings, gaps, and deficiencies identified during the assessment.
7. Update the POA&M with all new findings.
8. Prepare the assessment report with executive summary, findings summary, and control-by-control detail.
9. Obtain management review and approval of assessment results.`,
    testProcedure: `1. Verify the assessment scope was documented and approved by management.
2. Confirm all 110 CMMC Level 2 controls were assessed and documented.
3. Verify evidence was collected and retained for each control.
4. Confirm the POA&M was updated with all new findings from the assessment.
5. Verify management reviewed and approved the final assessment report.`,
    evidenceToRetain: `• Signed assessment scope document with management approval.
• Assessment report with control-by-control findings (MET/NOT MET/N/A).
• Evidence packages for each assessed control.
• Updated POA&M reflecting all assessment findings.
• Management approval documentation for assessment results.
• Previous year's assessment for comparison and trend analysis.`,
  },
  {
    frequency: "annually",
    task: "Update SSP",
    controlRef: "3.12.4",
    description: "Update system security plan",
    sortOrder: 15,
    operatingProcedure: `1. Open the current System Security Plan (SSP) and review it against the current system architecture.
2. Review and update the system description, boundary, and data flow diagrams to reflect any infrastructure changes made during the year.
3. Update the user population, roles, and access descriptions.
4. Review all 110 control implementation statements for accuracy and completeness.
5. Update any responsible roles and contact information that has changed.
6. Update the interconnections table for any new or removed system connections.
7. Route the updated SSP for management review and approval.
8. Archive the previous version and record version history.
9. Confirm the SSP is stored securely and access is restricted to authorized personnel.`,
    testProcedure: `1. Verify the SSP was reviewed and updated within the past year.
2. Sample at least 10 control implementation statements and confirm they reflect current implementation.
3. Verify the system boundary diagram reflects the current architecture.
4. Confirm all responsible personnel and contact information are current.
5. Verify management approval is documented with the updated SSP.`,
    evidenceToRetain: `• Updated SSP document with version date and management approval signatures.
• System boundary diagram reflecting current architecture.
• Control implementation statements for all 110 CMMC Level 2 controls.
• Previous SSP version archived with version history and change log.
• Management review and approval documentation.`,
  },
  {
    frequency: "annually",
    task: "Security Training",
    controlRef: "3.2.x",
    description: "Complete awareness training",
    sortOrder: 16,
    operatingProcedure: `1. Review and update the annual security awareness training content for currency and relevance to current threats.
2. Ensure training covers required CMMC topics: CUI handling, phishing, password security, incident reporting, and acceptable use.
3. Enroll all personnel with CUI access in the annual training via the LMS or training platform.
4. Set completion deadline and communicate to all personnel and their managers.
5. Monitor completion progress weekly — follow up with non-completers and their supervisors.
6. Document training completions with user name, role, date completed, and course name.
7. Address non-completion with appropriate escalation (management notification, access suspension).
8. Obtain management sign-off on the training completion report.`,
    testProcedure: `1. Verify the training completion report was generated covering all required personnel.
2. Sample at least 10 users and confirm training completion records with date and course name.
3. Verify all CUI-access personnel completed required training within the annual cycle.
4. Confirm training content covers all required CMMC awareness topics.
5. Verify management sign-off is documented on the training completion report.`,
    evidenceToRetain: `• Training completion report by user and course with completion dates.
• LMS export or screenshot showing completion rates and non-completers.
• Training curriculum or content outline showing topic coverage.
• Management sign-off on training completion report.
• Escalation records for personnel who did not complete training on time.`,
  },
  {
    frequency: "annually",
    task: "Formal Risk Review",
    controlRef: "3.11.1",
    description: "Update risk documentation",
    sortOrder: 17,
    operatingProcedure: `1. Conduct a formal annual risk assessment following the organizational risk methodology.
2. Update the threat landscape analysis: review current threat intelligence for new threat actors, attack vectors, and TTPs relevant to the organization.
3. Review and update all risk scenarios with current likelihood and impact ratings.
4. Assess the effectiveness of existing risk mitigations and security controls.
5. Identify residual risk for each scenario and determine risk acceptance or additional mitigation actions.
6. Review and update the organizational risk appetite and tolerance thresholds.
7. Document risk review results in the Risk Register with updated ratings, mitigations, and decisions.
8. Obtain executive and management sign-off on the updated risk posture.
9. Route unmitigated risks to the POA&M tracker.`,
    testProcedure: `1. Verify the formal annual risk assessment was completed and documented.
2. Confirm the threat landscape was updated with current threat intelligence sources.
3. Verify all risk scenarios have current likelihood/impact ratings and documented mitigations.
4. Confirm residual risk decisions (accept/mitigate/transfer) are documented with management approval.
5. Verify the Risk Register reflects the annual review with reviewer identity and date.`,
    evidenceToRetain: `• Annual risk assessment report with methodology, findings, and recommendations.
• Updated Risk Register with current risk ratings and mitigations.
• Threat landscape analysis document with threat intelligence sources.
• Executive and management risk acceptance signatures.
• POA&M entries for unmitigated risks identified during the review.`,
  },
  {
    frequency: "annually",
    task: "Access Review",
    controlRef: "3.1.x",
    description: "Review user access",
    sortOrder: 18,
    operatingProcedure: `1. Export full user account lists from all systems handling CUI (AD, Entra ID, cloud platforms, application systems).
2. For each account: confirm business justification, current need, and appropriate access level (least-privilege).
3. Confirm all accounts with privileged access have documented management approval and are still required.
4. Identify and disable accounts for personnel who no longer require access (role changes, departures, project ends).
5. Review and enforce least-privilege: remove any permissions that exceed current job requirements.
6. Verify MFA is enabled for all accounts with CUI access.
7. Review and confirm guest/external accounts — remove those no longer needed.
8. Update access control documentation and IAM records.
9. Obtain management sign-off on the annual access review results.`,
    testProcedure: `1. Verify the annual access review was completed for all systems handling CUI.
2. Sample at least 10 users across different systems and confirm access is appropriate and documented.
3. Verify no terminated personnel have active accounts in any CUI system.
4. Confirm all privileged access is justified, documented, and management-approved.
5. Verify management sign-off is documented on the annual access review.`,
    evidenceToRetain: `• Access review report covering all CUI systems, with user names, roles, access levels, and review outcome.
• List of accounts modified, disabled, or removed with authorization references.
• Privileged access approval documentation for remaining privileged accounts.
• Management sign-off on annual access review results.
• MFA enforcement evidence for all CUI-access accounts.`,
  },
];

export async function seedMonitoringItemsForOrg(orgId: string): Promise<void> {
  const [{ value: existing }] = await db
    .select({ value: count() })
    .from(monitoringItemsTable)
    .where(eq(monitoringItemsTable.organizationId, orgId));

  if (Number(existing) > 0) return;

  await db.insert(monitoringItemsTable).values(
    MONITORING_SEED_ITEMS.map((item) => ({
      id: randomUUID(),
      organizationId: orgId,
      ...item,
      status: "open" as const,
      createdAt: new Date(),
      updatedAt: new Date(),
    }))
  );
}

/**
 * Backfill operational guidance for existing monitoring items that have no operating procedure set.
 * Matches by task name (case-insensitive).
 */
export async function backfillMonitoringGuidance(orgId: string): Promise<void> {
  const existingItems = await db
    .select()
    .from(monitoringItemsTable)
    .where(eq(monitoringItemsTable.organizationId, orgId));

  for (const item of existingItems) {
    if (item.operatingProcedure) continue; // already has guidance
    const seed = MONITORING_SEED_ITEMS.find(
      (s) => s.task.toLowerCase() === item.task.toLowerCase()
    );
    if (!seed) continue;
    await db
      .update(monitoringItemsTable)
      .set({
        operatingProcedure: seed.operatingProcedure,
        testProcedure: seed.testProcedure,
        evidenceToRetain: seed.evidenceToRetain,
        updatedAt: new Date(),
      })
      .where(eq(monitoringItemsTable.id, item.id));
  }
}

router.get("/monitoring", requireAuth, requireOrg, async (req, res) => {
  const { frequency, status, controlRef, search } = req.query as Record<string, string>;
  const orgId = req.orgId;

  const items = await db
    .select()
    .from(monitoringItemsTable)
    .where(
      and(
        orgId ? eq(monitoringItemsTable.organizationId, orgId) : undefined,
        frequency ? eq(monitoringItemsTable.frequency, frequency as any) : undefined,
        status ? eq(monitoringItemsTable.status, status as any) : undefined,
        controlRef ? eq(monitoringItemsTable.controlRef, controlRef) : undefined,
        search
          ? or(
              ilike(monitoringItemsTable.task, `%${search}%`),
              ilike(monitoringItemsTable.description, `%${search}%`)
            )
          : undefined
      )
    )
    .orderBy(monitoringItemsTable.sortOrder);

  res.json(items);
});

router.patch("/monitoring/:id", requireAuth, requireOrg, async (req, res) => {
  const orgId = req.orgId;

  const [existing] = await db
    .select()
    .from(monitoringItemsTable)
    .where(
      and(
        eq(monitoringItemsTable.id, req.params.id as string),
        orgId ? eq(monitoringItemsTable.organizationId, orgId) : undefined
      )
    )
    .limit(1);

  if (!existing) {
    res.status(404).json({ error: "Not found" });
    return;
  }

  const {
    lastCompleted,
    nextDue,
    status,
    notes,
    frequency,
    validationStatus,
    validationDate,
    reviewerNotes,
    escalationNotes,
    linkedPoamId,
    reviewedBy,
    reviewDate,
  } = req.body;

  await db
    .update(monitoringItemsTable)
    .set({
      frequency: frequency !== undefined ? frequency : existing.frequency,
      lastCompleted:
        lastCompleted !== undefined
          ? lastCompleted
            ? new Date(lastCompleted)
            : null
          : existing.lastCompleted,
      nextDue:
        nextDue !== undefined
          ? nextDue
            ? new Date(nextDue)
            : null
          : existing.nextDue,
      status: status ?? existing.status,
      notes: notes !== undefined ? notes : existing.notes,
      validationStatus: validationStatus !== undefined ? validationStatus : existing.validationStatus,
      validationDate:
        validationDate !== undefined
          ? validationDate
            ? new Date(validationDate)
            : null
          : existing.validationDate,
      reviewerNotes: reviewerNotes !== undefined ? reviewerNotes : existing.reviewerNotes,
      escalationNotes: escalationNotes !== undefined ? escalationNotes : existing.escalationNotes,
      linkedPoamId: linkedPoamId !== undefined ? linkedPoamId || null : existing.linkedPoamId,
      reviewedBy: reviewedBy !== undefined ? reviewedBy || null : existing.reviewedBy,
      reviewDate:
        reviewDate !== undefined
          ? reviewDate
            ? new Date(reviewDate)
            : null
          : existing.reviewDate,
      updatedAt: new Date(),
    })
    .where(eq(monitoringItemsTable.id, req.params.id as string));

  const [updated] = await db
    .select()
    .from(monitoringItemsTable)
    .where(eq(monitoringItemsTable.id, req.params.id as string))
    .limit(1);

  res.json(updated);
});

/**
 * Backfill operational guidance for all items in an org.
 * Safe to call multiple times — skips items that already have guidance.
 */
router.post("/monitoring/backfill-guidance", requireAuth, requireOrg, async (req, res) => {
  const orgId = req.orgId;
  if (!orgId) { res.status(400).json({ error: "Org required" }); return; }
  await backfillMonitoringGuidance(orgId);
  res.json({ ok: true });
});

router.get("/monitoring/stats", requireAuth, requireOrg, async (req, res) => {
  const orgId = req.orgId;

  const [overdueCount] = await db
    .select({ value: count() })
    .from(monitoringItemsTable)
    .where(
      and(
        orgId ? eq(monitoringItemsTable.organizationId, orgId) : undefined,
        sql`${monitoringItemsTable.nextDue} IS NOT NULL`,
        sql`DATE(${monitoringItemsTable.nextDue}) < CURRENT_DATE`
      )
    );

  const [dueSoonCount] = await db
    .select({ value: count() })
    .from(monitoringItemsTable)
    .where(
      and(
        orgId ? eq(monitoringItemsTable.organizationId, orgId) : undefined,
        sql`${monitoringItemsTable.nextDue} IS NOT NULL`,
        sql`DATE(${monitoringItemsTable.nextDue}) >= CURRENT_DATE`,
        sql`DATE(${monitoringItemsTable.nextDue}) <= CURRENT_DATE + INTERVAL '7 days'`
      )
    );

  // Current = status 'current' AND not overdue
  const [currentCount] = await db
    .select({ value: count() })
    .from(monitoringItemsTable)
    .where(
      and(
        orgId ? eq(monitoringItemsTable.organizationId, orgId) : undefined,
        eq(monitoringItemsTable.status, "current"),
        sql`(${monitoringItemsTable.nextDue} IS NULL OR DATE(${monitoringItemsTable.nextDue}) >= CURRENT_DATE)`
      )
    );

  const [failedValidationCount] = await db
    .select({ value: count() })
    .from(monitoringItemsTable)
    .where(
      and(
        orgId ? eq(monitoringItemsTable.organizationId, orgId) : undefined,
        eq(monitoringItemsTable.status, "failed_validation")
      )
    );

  res.json({
    overdue: Number(overdueCount?.value ?? 0),
    dueSoon: Number(dueSoonCount?.value ?? 0),
    current: Number(currentCount?.value ?? 0),
    failedValidation: Number(failedValidationCount?.value ?? 0),
  });
});

// ─── POST /api/monitoring — create a new monitoring item ─────────────────────

router.post("/monitoring", requireAuth, requireOrg, async (req, res) => {
  const orgId = req.orgId!;
  const orgRole = req.orgRole ?? "member";
  if (!["admin", "compliance_manager"].includes(orgRole) && req.authUser?.role !== "admin") {
    res.status(403).json({ error: "Insufficient permissions" });
    return;
  }

  const { task, frequency, controlRef, description } = req.body;
  if (!task || !frequency || !controlRef) {
    res.status(400).json({ error: "task, frequency, and controlRef are required" });
    return;
  }
  const validFrequencies = ["daily", "weekly", "monthly", "quarterly", "annually"];
  if (!validFrequencies.includes(frequency)) {
    res.status(400).json({ error: "Invalid frequency" });
    return;
  }

  const existing = await db
    .select({ sortOrder: monitoringItemsTable.sortOrder })
    .from(monitoringItemsTable)
    .where(eq(monitoringItemsTable.organizationId, orgId));
  const maxSort = existing.reduce((max, item) => Math.max(max, item.sortOrder ?? 0), existing.length - 1);

  const [inserted] = await db
    .insert(monitoringItemsTable)
    .values({
      id: randomUUID(),
      organizationId: orgId,
      task,
      frequency,
      controlRef,
      description: description ?? "",
      status: "open",
      sortOrder: maxSort + 1,
      operatingProcedure: "",
      testProcedure: "",
      evidenceToRetain: "",
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    .returning();

  res.status(201).json(inserted);
});

// ─── DELETE /api/monitoring/:id — remove a monitoring item ───────────────────

router.delete("/monitoring/:id", requireAuth, requireOrg, async (req, res) => {
  const orgId = req.orgId!;
  const orgRole = req.orgRole ?? "member";
  if (!["admin", "compliance_manager"].includes(orgRole) && req.authUser?.role !== "admin") {
    res.status(403).json({ error: "Insufficient permissions" });
    return;
  }

  const [existing] = await db
    .select()
    .from(monitoringItemsTable)
    .where(and(eq(monitoringItemsTable.id, String(req.params.id)), eq(monitoringItemsTable.organizationId, orgId)))
    .limit(1);
  if (!existing) { res.status(404).json({ error: "Not found" }); return; }

  await db.delete(monitoringItemsTable).where(eq(monitoringItemsTable.id, String(req.params.id)));
  res.json({ success: true });
});

export default router;
