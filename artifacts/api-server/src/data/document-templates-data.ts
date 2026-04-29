export const DOCUMENT_TEMPLATES = [
  // ─── POLICIES ─────────────────────────────────────────────────────────────
  {
    title: "Information Security Policy",
    docType: "policy" as const,
    cmmcLevel: "both" as const,
    ownerRole: "compliance_manager",
    reviewFrequency: "annually" as const,
    description: "High-level organizational commitment to information security, defining roles, responsibilities, and security objectives.",
    bodyTemplate: `# Information Security Policy

**Organization:** {{organization_name}}
**System:** {{system_name}}
**Policy Owner:** {{policy_owner}}
**Effective Date:** {{effective_date}}
**Next Review Date:** {{review_date}}
**Version:** 1.0

---

## 1. Purpose

{{organization_name}} is committed to protecting the confidentiality, integrity, and availability of all information assets, including Controlled Unclassified Information (CUI) handled in support of Department of Defense (DoD) contracts. This policy establishes the organizational framework for information security.

## 2. Scope

This policy applies to all employees, contractors, subcontractors, and third parties who access, process, store, or transmit information on behalf of {{organization_name}}, including all information systems that handle CUI.

## 3. Policy Statement

{{organization_name}} shall:
- Implement and maintain a comprehensive information security program
- Protect CUI in accordance with CMMC requirements and applicable federal regulations
- Conduct periodic risk assessments to identify and mitigate security threats
- Ensure all personnel receive security awareness training
- Respond effectively to security incidents
- Maintain continuous compliance with contractual security requirements

## 4. Roles and Responsibilities

**Senior Leadership:** Champions the information security program and ensures adequate resources.

**Compliance Manager / ISSO:** Develops, implements, and maintains security policies and procedures; coordinates security activities.

**System Owner:** Ensures security controls are implemented and operating effectively on assigned systems.

**All Employees:** Comply with security policies, complete required training, and report security incidents.

## 5. Enforcement

Violations of this policy may result in disciplinary action up to and including termination of employment or contract, and may be referred to law enforcement authorities.

## 6. Review

This policy shall be reviewed at least annually or following significant organizational changes, security incidents, or changes to applicable regulations.

---

*Approved by:* __________________________
*Title:* {{approver_title}}
*Date:* {{approval_date}}`,
    requiredFields: ["organization_name", "system_name", "policy_owner", "effective_date", "review_date"],
    placeholders: ["organization_name", "system_name", "policy_owner", "effective_date", "review_date", "approver_title", "approval_date"],
    requiresApproval: true,
    isSystemTemplate: true,
  },

  {
    title: "Access Control Policy",
    docType: "policy" as const,
    cmmcLevel: "L2" as const,
    domainAbbr: "AC",
    ownerRole: "compliance_manager",
    reviewFrequency: "annually" as const,
    description: "Policy governing user access rights, account management, and least privilege principles.",
    bodyTemplate: `# Access Control Policy

**Organization:** {{organization_name}}
**Policy Owner:** {{policy_owner}}
**Effective Date:** {{effective_date}}
**Next Review Date:** {{review_date}}
**Version:** 1.0

---

## 1. Purpose

This policy establishes requirements for controlling access to {{organization_name}}'s information systems and CUI to ensure only authorized individuals have access to resources necessary for their roles.

## 2. Policy Requirements

### 2.1 Account Management
- User accounts shall be created only upon written authorization from the system owner
- Accounts shall be assigned based on the principle of least privilege
- Inactive accounts shall be disabled after {{inactive_account_days}} days of inactivity
- Accounts shall be reviewed quarterly and revoked when no longer needed

### 2.2 Access Enforcement
- Access to CUI shall require multi-factor authentication (MFA)
- Remote access requires VPN and MFA
- Shared or generic accounts are prohibited for systems containing CUI
- Privileged access shall be limited to designated administrators

### 2.3 Separation of Duties
- Duties shall be separated to reduce the risk of unauthorized modification of CUI
- No single individual shall have the ability to perform all critical security functions

### 2.4 Unsuccessful Logon Attempts
- Systems shall lock accounts after {{lockout_attempts}} consecutive failed login attempts
- Locked accounts shall require administrator action or time-based unlock after {{lockout_duration}} minutes

## 3. Enforcement

Violations of this policy may result in immediate account suspension and disciplinary action.

---

*Policy Owner:* {{policy_owner}}
*Approved:* {{approval_date}}`,
    requiredFields: ["organization_name", "policy_owner", "effective_date", "review_date"],
    placeholders: ["organization_name", "policy_owner", "effective_date", "review_date", "inactive_account_days", "lockout_attempts", "lockout_duration", "approval_date"],
    requiresApproval: true,
    isSystemTemplate: true,
  },

  {
    title: "Configuration Management Policy",
    docType: "policy" as const,
    cmmcLevel: "L2" as const,
    domainAbbr: "CM",
    ownerRole: "compliance_manager",
    reviewFrequency: "annually" as const,
    description: "Policy for establishing and maintaining baseline configurations and controlling changes to information systems.",
    bodyTemplate: `# Configuration Management Policy

**Organization:** {{organization_name}}
**Policy Owner:** {{policy_owner}}
**Effective Date:** {{effective_date}}
**Next Review Date:** {{review_date}}

---

## 1. Purpose

This policy establishes requirements for managing the configuration of information systems at {{organization_name}} to maintain system security and integrity.

## 2. Policy Requirements

### 2.1 Baseline Configurations
- All systems shall have documented baseline configurations
- Baselines shall be reviewed and updated at least annually
- Deviations from baselines require documented approval

### 2.2 Change Control
- All changes to production systems require prior approval through the change management process
- Emergency changes shall be documented within 24 hours
- Change requests shall include security impact assessment

### 2.3 Least Functionality
- Systems shall be configured to provide only essential capabilities
- Unnecessary ports, protocols, and services shall be disabled
- Software installations on CUI systems require prior approval

### 2.4 Security Configuration Settings
- Systems shall implement security configuration settings in accordance with applicable hardening guides (e.g., CIS Benchmarks)
- Default passwords shall be changed before system deployment

---

*Approved by:* {{policy_owner}} | *Date:* {{approval_date}}`,
    requiredFields: ["organization_name", "policy_owner", "effective_date", "review_date"],
    placeholders: ["organization_name", "policy_owner", "effective_date", "review_date", "approval_date"],
    requiresApproval: true,
    isSystemTemplate: true,
  },

  {
    title: "Incident Response Policy",
    docType: "policy" as const,
    cmmcLevel: "L2" as const,
    domainAbbr: "IR",
    ownerRole: "compliance_manager",
    reviewFrequency: "annually" as const,
    description: "Policy for establishing incident response capabilities and handling security incidents affecting CUI.",
    bodyTemplate: `# Incident Response Policy

**Organization:** {{organization_name}}
**Policy Owner:** {{policy_owner}}
**Effective Date:** {{effective_date}}
**Next Review Date:** {{review_date}}

---

## 1. Purpose

This policy establishes {{organization_name}}'s capability to effectively prepare for, detect, analyze, contain, recover from, and report security incidents involving CUI.

## 2. Policy Requirements

### 2.1 Incident Response Capability
- {{organization_name}} shall maintain a documented Incident Response Plan (IRP)
- An incident response team (IRT) shall be designated and trained
- Contact information for key personnel shall be maintained and tested annually

### 2.2 Reporting Requirements
- All suspected security incidents involving CUI shall be reported to the Compliance Manager within {{incident_report_hours}} hours of discovery
- DoD/government customers shall be notified of CUI breaches within 72 hours
- CISA shall be notified per applicable federal reporting requirements

### 2.3 Incident Handling
- Incidents shall be triaged, contained, and eradicated following the IR Procedure
- Post-incident reviews shall be conducted within {{post_incident_review_days}} days
- Lessons learned shall be incorporated into the IR Plan

---

*Approved by:* {{policy_owner}} | *Date:* {{approval_date}}`,
    requiredFields: ["organization_name", "policy_owner", "effective_date", "review_date"],
    placeholders: ["organization_name", "policy_owner", "effective_date", "review_date", "incident_report_hours", "post_incident_review_days", "approval_date"],
    requiresApproval: true,
    isSystemTemplate: true,
  },

  {
    title: "Media Protection Policy",
    docType: "policy" as const,
    cmmcLevel: "L2" as const,
    domainAbbr: "MP",
    ownerRole: "compliance_manager",
    reviewFrequency: "annually" as const,
    description: "Policy governing the handling, storage, transport, and disposal of media containing CUI.",
    bodyTemplate: `# Media Protection Policy

**Organization:** {{organization_name}}
**Policy Owner:** {{policy_owner}}
**Effective Date:** {{effective_date}}

---

## 1. Purpose

This policy establishes controls for protecting media containing CUI throughout its lifecycle.

## 2. Policy Requirements

### 2.1 Media Access
- Access to media containing CUI shall be restricted to authorized individuals
- Media shall be labeled to indicate the classification of information stored

### 2.2 Media Transport
- CUI shall be encrypted when transported via removable media or external networks
- Physical transport of CUI media shall use approved courier services with chain of custody

### 2.3 Media Sanitization
- Media shall be sanitized prior to disposal, reuse, or release using NIST SP 800-88 methods
- Destruction records shall be maintained for CUI media

### 2.4 Removable Media
- Use of removable media (USB, external drives) on CUI systems requires prior approval
- Unapproved removable media shall not be used on CUI systems

---

*Approved by:* {{policy_owner}} | *Date:* {{approval_date}}`,
    requiredFields: ["organization_name", "policy_owner", "effective_date"],
    placeholders: ["organization_name", "policy_owner", "effective_date", "approval_date"],
    requiresApproval: true,
    isSystemTemplate: true,
  },

  {
    title: "Risk Assessment Policy",
    docType: "policy" as const,
    cmmcLevel: "L2" as const,
    domainAbbr: "RA",
    ownerRole: "compliance_manager",
    reviewFrequency: "annually" as const,
    description: "Policy for conducting periodic risk assessments to identify and manage risks to CUI.",
    bodyTemplate: `# Risk Assessment Policy

**Organization:** {{organization_name}}
**Policy Owner:** {{policy_owner}}
**Effective Date:** {{effective_date}}

---

## 1. Purpose

This policy establishes requirements for conducting risk assessments at {{organization_name}} to identify, assess, and manage risks to CUI.

## 2. Policy Requirements

### 2.1 Risk Assessment Frequency
- Comprehensive risk assessments shall be conducted at least annually
- Risk assessments shall be triggered by significant system changes, new CUI contracts, or security incidents

### 2.2 Risk Assessment Scope
- Assessments shall cover all systems processing, storing, or transmitting CUI
- Assessments shall identify threats, vulnerabilities, likelihood, and potential impact

### 2.3 Risk Treatment
- Identified risks shall be documented in a risk register
- High and critical risks shall have documented remediation plans
- Accepted risks require written approval from senior leadership

### 2.4 Vulnerability Scanning
- Vulnerability scans shall be conducted at least {{vuln_scan_frequency}}
- Critical/High vulnerabilities shall be remediated within {{critical_vuln_days}} days

---

*Approved by:* {{policy_owner}} | *Date:* {{approval_date}}`,
    requiredFields: ["organization_name", "policy_owner", "effective_date"],
    placeholders: ["organization_name", "policy_owner", "effective_date", "vuln_scan_frequency", "critical_vuln_days", "approval_date"],
    requiresApproval: true,
    isSystemTemplate: true,
  },

  {
    title: "Audit and Accountability Policy",
    docType: "policy" as const,
    cmmcLevel: "L2" as const,
    domainAbbr: "AU",
    ownerRole: "compliance_manager",
    reviewFrequency: "annually" as const,
    description: "Policy establishing requirements for system audit logging, review, and protection.",
    bodyTemplate: `# Audit and Accountability Policy

**Organization:** {{organization_name}}
**Policy Owner:** {{policy_owner}}
**Effective Date:** {{effective_date}}

---

## 1. Purpose

This policy establishes requirements for creating, protecting, reviewing, and retaining audit logs for systems handling CUI.

## 2. Policy Requirements

### 2.1 Audit Events
Systems shall log at minimum:
- User logon/logoff (successful and failed)
- Account creation, modification, and deletion
- Access to CUI
- System administrator actions
- Security-relevant configuration changes

### 2.2 Audit Log Protection
- Audit logs shall be protected from unauthorized access and modification
- Log integrity shall be maintained and verified periodically
- Logs shall be retained for a minimum of {{log_retention_days}} days

### 2.3 Log Review
- Audit logs shall be reviewed at least {{log_review_frequency}}
- Anomalies and suspicious activities shall be investigated and documented

---

*Approved by:* {{policy_owner}} | *Date:* {{approval_date}}`,
    requiredFields: ["organization_name", "policy_owner", "effective_date"],
    placeholders: ["organization_name", "policy_owner", "effective_date", "log_retention_days", "log_review_frequency", "approval_date"],
    requiresApproval: true,
    isSystemTemplate: true,
  },

  {
    title: "Security Awareness and Training Policy",
    docType: "policy" as const,
    cmmcLevel: "both" as const,
    domainAbbr: "AT",
    ownerRole: "compliance_manager",
    reviewFrequency: "annually" as const,
    description: "Policy requiring security awareness training for all personnel with access to CUI.",
    bodyTemplate: `# Security Awareness and Training Policy

**Organization:** {{organization_name}}
**Policy Owner:** {{policy_owner}}
**Effective Date:** {{effective_date}}

---

## 1. Purpose

This policy ensures all personnel at {{organization_name}} are aware of security risks and trained to protect CUI.

## 2. Policy Requirements

### 2.1 Initial Training
- All new employees and contractors shall complete security awareness training before accessing CUI
- Training shall cover: CUI handling, phishing/social engineering, incident reporting, acceptable use

### 2.2 Annual Training
- All personnel shall complete refresher security awareness training annually
- Training completion shall be documented and records retained for {{training_record_retention}} years

### 2.3 Role-Based Training
- Personnel with significant security responsibilities (admins, ISSO, IRT members) shall receive role-based training

### 2.4 Insider Threat Awareness
- Personnel shall be trained to recognize and report insider threat indicators

---

*Approved by:* {{policy_owner}} | *Date:* {{approval_date}}`,
    requiredFields: ["organization_name", "policy_owner", "effective_date"],
    placeholders: ["organization_name", "policy_owner", "effective_date", "training_record_retention", "approval_date"],
    requiresApproval: true,
    isSystemTemplate: true,
  },

  // ─── PROCEDURES ───────────────────────────────────────────────────────────
  {
    title: "User Account Management Procedure",
    docType: "procedure" as const,
    cmmcLevel: "L2" as const,
    domainAbbr: "AC",
    ownerRole: "it_contributor",
    reviewFrequency: "annually" as const,
    description: "Step-by-step procedure for creating, modifying, disabling, and deleting user accounts.",
    bodyTemplate: `# User Account Management Procedure

**Organization:** {{organization_name}}
**System:** {{system_name}}
**Procedure Owner:** {{procedure_owner}}
**Effective Date:** {{effective_date}}

---

## 1. Purpose

This procedure describes the steps for managing user accounts on {{organization_name}}'s information systems, ensuring access is granted, modified, and revoked appropriately.

## 2. Account Provisioning

### Step 1: Access Request
- The requesting manager submits an Access Request Form (ARF) identifying:
  - Employee name and job title
  - Systems and resources required
  - Business justification
  - Requested access level

### Step 2: Authorization
- The System Owner reviews and approves or denies the request within 2 business days
- Approved requests are forwarded to IT

### Step 3: Account Creation
- IT creates the account with the minimum necessary permissions (least privilege)
- MFA is enrolled before the account is activated for CUI systems
- The user is notified with account credentials via secure channel

## 3. Account Modification
- Account changes require a new ARF or written email approval from the manager and System Owner
- Changes are implemented within 2 business days of approval

## 4. Account Termination
- HR notifies IT within 4 hours of employee separation
- IT disables the account immediately upon notification
- Accounts are deleted or archived after 30 days

## 5. Periodic Access Review
- The System Owner reviews all accounts quarterly
- Accounts without business justification are disabled
- Review results are documented and retained

---

*Procedure Owner:* {{procedure_owner}} | *Approved:* {{approval_date}}`,
    requiredFields: ["organization_name", "system_name", "procedure_owner", "effective_date"],
    placeholders: ["organization_name", "system_name", "procedure_owner", "effective_date", "approval_date"],
    requiresApproval: true,
    isSystemTemplate: true,
  },

  {
    title: "Incident Response Procedure",
    docType: "procedure" as const,
    cmmcLevel: "L2" as const,
    domainAbbr: "IR",
    ownerRole: "compliance_manager",
    reviewFrequency: "annually" as const,
    description: "Detailed procedure for detecting, containing, eradicating, and recovering from security incidents.",
    bodyTemplate: `# Incident Response Procedure

**Organization:** {{organization_name}}
**Procedure Owner:** {{procedure_owner}}
**Effective Date:** {{effective_date}}

---

## 1. Purpose

This procedure provides step-by-step guidance for responding to security incidents at {{organization_name}}.

## 2. Incident Response Phases

### Phase 1: Preparation
- Maintain current contact list for IR Team members
- Ensure incident response tools are available and tested
- Review and update this procedure annually

### Phase 2: Detection and Analysis
1. Any employee detecting a potential incident reports it to {{incident_contact}} immediately
2. The Compliance Manager logs the report in the Incident Log
3. The IRT convenes within 2 hours for severity assessment
4. Severity is classified: Critical / High / Medium / Low

### Phase 3: Containment
1. Isolate affected systems from the network if needed
2. Preserve evidence (memory dumps, log snapshots, disk images)
3. Document all containment actions with timestamps

### Phase 4: Eradication
1. Identify and remove the root cause
2. Patch vulnerabilities exploited
3. Restore from clean backups if needed

### Phase 5: Recovery
1. Restore affected systems to operation
2. Monitor systems for signs of recurrence for 30 days
3. Confirm normal operations with system owner

### Phase 6: Post-Incident Review
1. Conduct review within {{post_incident_days}} days
2. Document lessons learned
3. Update IR Plan and procedures as needed
4. Submit final incident report to senior management

## 3. Reporting Requirements
- CUI breach: Notify DoD customer within 72 hours
- Major incident: Notify CISA per applicable requirements

---

*Procedure Owner:* {{procedure_owner}} | *Approved:* {{approval_date}}`,
    requiredFields: ["organization_name", "procedure_owner", "effective_date"],
    placeholders: ["organization_name", "procedure_owner", "effective_date", "incident_contact", "post_incident_days", "approval_date"],
    requiresApproval: true,
    isSystemTemplate: true,
  },

  {
    title: "Backup and Recovery Procedure",
    docType: "procedure" as const,
    cmmcLevel: "both" as const,
    domainAbbr: "CP",
    ownerRole: "it_contributor",
    reviewFrequency: "annually" as const,
    description: "Procedure for backing up CUI systems and recovering from data loss or system failures.",
    bodyTemplate: `# Backup and Recovery Procedure

**Organization:** {{organization_name}}
**System:** {{system_name}}
**Procedure Owner:** {{procedure_owner}}
**Effective Date:** {{effective_date}}

---

## 1. Purpose

This procedure ensures {{organization_name}} can recover CUI systems and data from failures, disasters, or ransomware attacks.

## 2. Backup Requirements

| Backup Type | Frequency | Retention | Location |
|-------------|-----------|-----------|----------|
| Full Backup | Weekly | {{full_backup_retention}} | {{backup_location}} |
| Incremental | Daily | 30 days | {{backup_location}} |
| Configuration | On-change | 90 days | Offsite |

## 3. Backup Procedure

### Step 1: Automated Backups
- Backups run automatically at {{backup_time}} daily
- Backup completion and size are logged in the Backup Log
- Failed backups trigger an alert to {{alert_contact}}

### Step 2: Verification
- Weekly backup integrity checks via restore test of random files
- Monthly full restore test to isolated environment
- Quarterly DR test documented in the Recovery Test Log

## 4. Recovery Procedure

### Step 1: Assessment
1. Assess scope of data loss or system failure
2. Notify Compliance Manager and senior leadership
3. Declare recovery timeframe based on RTO/RPO

### Step 2: Restore
1. Access backup storage at {{backup_location}}
2. Select most recent clean backup point
3. Restore to clean hardware or cloud environment
4. Validate data integrity post-restore

### Step 3: Return to Service
1. Verify all services are operational
2. Scan restored system before connecting to production network
3. Document recovery actions and timeline

---

*Procedure Owner:* {{procedure_owner}} | *Approved:* {{approval_date}}`,
    requiredFields: ["organization_name", "system_name", "procedure_owner", "effective_date"],
    placeholders: ["organization_name", "system_name", "procedure_owner", "effective_date", "full_backup_retention", "backup_location", "backup_time", "alert_contact", "approval_date"],
    requiresApproval: true,
    isSystemTemplate: true,
  },

  {
    title: "Vulnerability Management Procedure",
    docType: "procedure" as const,
    cmmcLevel: "L2" as const,
    domainAbbr: "RA",
    ownerRole: "it_contributor",
    reviewFrequency: "quarterly" as const,
    description: "Procedure for conducting vulnerability scans, analyzing results, and remediating identified vulnerabilities.",
    bodyTemplate: `# Vulnerability Management Procedure

**Organization:** {{organization_name}}
**Procedure Owner:** {{procedure_owner}}
**Effective Date:** {{effective_date}}

---

## 1. Purpose

This procedure establishes the process for identifying, assessing, and remediating vulnerabilities in systems handling CUI.

## 2. Scanning

### Step 1: Schedule Scans
- Authenticated vulnerability scans run at least monthly on all CUI systems
- Scans are performed using {{scan_tool}}
- Unauthenticated scans run quarterly from outside the network

### Step 2: Analyze Results
- Results are reviewed by {{scan_reviewer}} within 5 business days
- Findings are exported and imported into the vulnerability register

## 3. Remediation Priorities

| Severity | Remediation Timeframe |
|----------|-----------------------|
| Critical | {{critical_days}} days |
| High | {{high_days}} days |
| Medium | {{medium_days}} days |
| Low | {{low_days}} days |

### Step 3: Track Remediation
- Each finding is assigned an owner responsible for remediation
- Status updates required weekly for Critical/High findings
- Completed remediations verified by re-scan

### Step 4: Exceptions
- Exception requests require written justification and senior leadership approval
- Approved exceptions are documented with compensating controls

---

*Procedure Owner:* {{procedure_owner}} | *Approved:* {{approval_date}}`,
    requiredFields: ["organization_name", "procedure_owner", "effective_date"],
    placeholders: ["organization_name", "procedure_owner", "effective_date", "scan_tool", "scan_reviewer", "critical_days", "high_days", "medium_days", "low_days", "approval_date"],
    requiresApproval: true,
    isSystemTemplate: true,
  },

  {
    title: "Security Awareness Training Procedure",
    docType: "procedure" as const,
    cmmcLevel: "both" as const,
    domainAbbr: "AT",
    ownerRole: "compliance_manager",
    reviewFrequency: "annually" as const,
    description: "Procedure for planning, delivering, and tracking security awareness training for all personnel.",
    bodyTemplate: `# Security Awareness Training Procedure

**Organization:** {{organization_name}}
**Procedure Owner:** {{procedure_owner}}
**Effective Date:** {{effective_date}}

---

## 1. Purpose

This procedure ensures all personnel receive appropriate security awareness training to protect CUI.

## 2. Training Delivery

### New Employee Training
1. New hire is enrolled in security training upon offer acceptance
2. Training must be completed before access to CUI is granted
3. Completion is logged in the Training Tracking System

### Annual Refresher Training
1. Training is assigned to all personnel each January
2. Deadline for completion: {{annual_training_deadline}}
3. Reminder emails sent at 30, 14, and 7 days before deadline
4. Non-completion escalated to employee's manager

## 3. Training Content
Training covers at minimum:
- CUI identification and handling requirements
- Phishing and social engineering awareness
- Password hygiene and MFA use
- Incident reporting procedures
- Acceptable use of company systems
- Insider threat awareness

## 4. Training Records
- Completion records maintained in {{training_system}}
- Records retained for {{record_retention}} years
- Available for assessor review upon request

---

*Procedure Owner:* {{procedure_owner}} | *Approved:* {{approval_date}}`,
    requiredFields: ["organization_name", "procedure_owner", "effective_date"],
    placeholders: ["organization_name", "procedure_owner", "effective_date", "annual_training_deadline", "training_system", "record_retention", "approval_date"],
    requiresApproval: false,
    isSystemTemplate: true,
  },

  // ─── LOGS ─────────────────────────────────────────────────────────────────
  {
    title: "Monthly Security Event Review Log",
    docType: "log" as const,
    cmmcLevel: "L2" as const,
    domainAbbr: "AU",
    ownerRole: "it_contributor",
    reviewFrequency: "monthly" as const,
    recurrenceRule: "FREQ=MONTHLY;BYMONTHDAY=1",
    description: "Monthly log documenting the review of security events, anomalies, and audit log findings.",
    bodyTemplate: `# Monthly Security Event Review Log

**Organization:** {{organization_name}}
**Review Period:** {{period_start}} – {{period_end}}
**Reviewer:** {{reviewer_name}}
**Review Date:** {{review_date}}

---

## 1. Systems Reviewed
- {{systems_reviewed}}

## 2. Log Sources Reviewed
- [ ] Windows Event Logs (Security)
- [ ] Firewall Logs
- [ ] VPN Access Logs
- [ ] Application Access Logs
- [ ] Failed Authentication Logs

## 3. Findings Summary

| Date/Time | System | Event Description | Severity | Action Taken |
|-----------|--------|-------------------|----------|--------------|
| | | | | |

## 4. Anomalies Identified

{{anomalies_noted}}

## 5. Incidents Reported
**Total Incidents This Period:** {{incident_count}}
(See Incident Log for details)

## 6. Recommendations

{{recommendations}}

## 7. Reviewer Attestation

I certify that the above review was conducted and all anomalies have been addressed or documented.

**Signature:** __________________________ **Date:** ______________`,
    requiredFields: ["organization_name", "reviewer_name", "review_date"],
    placeholders: ["organization_name", "period_start", "period_end", "reviewer_name", "review_date", "systems_reviewed", "anomalies_noted", "incident_count", "recommendations"],
    requiresApproval: false,
    isSystemTemplate: true,
    checklistItems: [
      { itemText: "Windows Event Logs reviewed", isRequired: true },
      { itemText: "Firewall logs reviewed", isRequired: true },
      { itemText: "VPN access logs reviewed", isRequired: true },
      { itemText: "Failed authentication events analyzed", isRequired: true },
      { itemText: "Anomalies documented and investigated", isRequired: true },
      { itemText: "No unresolved critical findings", isRequired: true },
    ],
  },

  {
    title: "Quarterly Access Review Log",
    docType: "log" as const,
    cmmcLevel: "both" as const,
    domainAbbr: "AC",
    ownerRole: "compliance_manager",
    reviewFrequency: "quarterly" as const,
    recurrenceRule: "FREQ=MONTHLY;INTERVAL=3;BYMONTHDAY=1",
    description: "Quarterly access review documenting verification of user access rights and removal of excess privileges.",
    bodyTemplate: `# Quarterly Access Review Log

**Organization:** {{organization_name}}
**System:** {{system_name}}
**Review Period:** {{review_period}}
**Reviewer:** {{reviewer_name}}
**Review Date:** {{review_date}}

---

## 1. Accounts Reviewed

| Username | Role/Group | Access Level | Last Login | Status | Action |
|----------|------------|--------------|------------|--------|--------|
| | | | | Active/Inactive | Keep/Remove/Modify |

**Total Accounts Reviewed:** {{total_accounts}}
**Accounts Removed/Disabled:** {{accounts_removed}}
**Accounts Modified:** {{accounts_modified}}

## 2. Privileged Accounts

| Username | Privilege Level | Business Justification | Approved By |
|----------|----------------|------------------------|-------------|
| | | | |

## 3. Service/Shared Accounts

All service accounts reviewed and confirmed still needed: **Yes / No**

## 4. Findings and Actions

{{findings_and_actions}}

## 5. Reviewer Attestation

I certify that user access rights have been reviewed and access appropriate to job functions has been confirmed or adjusted.

**Signature:** __________________________ **Date:** ______________`,
    requiredFields: ["organization_name", "system_name", "reviewer_name", "review_date"],
    placeholders: ["organization_name", "system_name", "review_period", "reviewer_name", "review_date", "total_accounts", "accounts_removed", "accounts_modified", "findings_and_actions"],
    requiresApproval: false,
    isSystemTemplate: true,
    checklistItems: [
      { itemText: "All user accounts reviewed against current employee list", isRequired: true },
      { itemText: "Terminated employee accounts confirmed disabled/deleted", isRequired: true },
      { itemText: "Privileged accounts confirmed with business justification", isRequired: true },
      { itemText: "Service accounts reviewed", isRequired: true },
      { itemText: "Excess permissions removed", isRequired: true },
      { itemText: "Results documented and signed", isRequired: true },
    ],
  },

  {
    title: "Monthly Backup Verification Log",
    docType: "log" as const,
    cmmcLevel: "both" as const,
    domainAbbr: "CP",
    ownerRole: "it_contributor",
    reviewFrequency: "monthly" as const,
    recurrenceRule: "FREQ=MONTHLY;BYMONTHDAY=1",
    description: "Monthly log documenting backup verification activities and restore test results.",
    bodyTemplate: `# Monthly Backup Verification Log

**Organization:** {{organization_name}}
**System:** {{system_name}}
**Month:** {{review_month}}
**Verified By:** {{verifier_name}}
**Date:** {{verification_date}}

---

## 1. Backup Status Summary

| Date | Backup Type | Status | Size | Duration |
|------|-------------|--------|------|----------|
| | Full | Success/Fail | | |
| | Incremental | Success/Fail | | |

**Failed Backups This Month:** {{failed_backup_count}}
**Root Cause and Resolution:** {{failure_resolution}}

## 2. Restore Test

**Test Performed:** Yes / No
**Files/Systems Restored:** {{restored_items}}
**Restore Successful:** Yes / No
**Notes:** {{restore_notes}}

## 3. Backup Storage Status

**Backup Storage Used:** {{storage_used}}
**Estimated Days Remaining:** {{storage_remaining_days}}

## 4. Verifier Attestation

**Signature:** __________________________ **Date:** ______________`,
    requiredFields: ["organization_name", "system_name", "verifier_name", "verification_date"],
    placeholders: ["organization_name", "system_name", "review_month", "verifier_name", "verification_date", "failed_backup_count", "failure_resolution", "restored_items", "restore_notes", "storage_used", "storage_remaining_days"],
    requiresApproval: false,
    isSystemTemplate: true,
    checklistItems: [
      { itemText: "All scheduled backups completed successfully", isRequired: true },
      { itemText: "Failed backups investigated and resolved", isRequired: false },
      { itemText: "Restore test performed from recent backup", isRequired: true },
      { itemText: "Backup storage capacity verified adequate", isRequired: true },
      { itemText: "Offsite/cloud backup confirmed", isRequired: true },
    ],
  },

  {
    title: "Vulnerability Scan Results Log",
    docType: "log" as const,
    cmmcLevel: "L2" as const,
    domainAbbr: "RA",
    ownerRole: "it_contributor",
    reviewFrequency: "monthly" as const,
    recurrenceRule: "FREQ=MONTHLY;BYMONTHDAY=1",
    description: "Monthly log of vulnerability scan results, findings, and remediation tracking.",
    bodyTemplate: `# Vulnerability Scan Results Log

**Organization:** {{organization_name}}
**Scan Period:** {{scan_period}}
**Scan Tool:** {{scan_tool}}
**Performed By:** {{performed_by}}
**Scan Date:** {{scan_date}}

---

## 1. Scan Summary

| Severity | Count | Remediated | Open | Exceptions |
|----------|-------|------------|------|------------|
| Critical | | | | |
| High | | | | |
| Medium | | | | |
| Low | | | | |
| Informational | | | | |

## 2. New Findings This Period

{{new_findings}}

## 3. Remediation Progress

| CVE/Finding | System | Assigned To | Target Date | Status |
|-------------|--------|-------------|-------------|--------|
| | | | | |

## 4. Overdue Remediation Items

{{overdue_items}}

## 5. Attestation

**Reviewed By:** {{reviewer_name}} | **Date:** {{review_date}}`,
    requiredFields: ["organization_name", "performed_by", "scan_date"],
    placeholders: ["organization_name", "scan_period", "scan_tool", "performed_by", "scan_date", "new_findings", "overdue_items", "reviewer_name", "review_date"],
    requiresApproval: false,
    isSystemTemplate: true,
    checklistItems: [
      { itemText: "Authenticated scan completed on all CUI systems", isRequired: true },
      { itemText: "Scan results exported and archived", isRequired: true },
      { itemText: "Critical findings assigned and tracked", isRequired: true },
      { itemText: "Overdue remediations escalated", isRequired: true },
      { itemText: "Results reviewed with IT lead", isRequired: true },
    ],
  },

  // ─── REGISTERS ────────────────────────────────────────────────────────────
  {
    title: "CUI Asset Register",
    docType: "register" as const,
    cmmcLevel: "both" as const,
    ownerRole: "compliance_manager",
    reviewFrequency: "quarterly" as const,
    description: "Register of all systems, devices, and storage locations that process, store, or transmit CUI.",
    bodyTemplate: `# CUI Asset Register

**Organization:** {{organization_name}}
**Last Updated:** {{last_updated}}
**Maintained By:** {{register_owner}}

---

## Purpose

This register documents all assets that process, store, or transmit Controlled Unclassified Information (CUI) at {{organization_name}}.

## Asset Inventory

| Asset ID | Asset Name | Type | Location | Owner | CUI Categories | Classification | Security Controls | Last Reviewed |
|----------|------------|------|----------|-------|---------------|----------------|-------------------|---------------|
| | | | | | | | | |

## Asset Types
- **Workstation** – End-user computers
- **Server** – On-premise or cloud servers
- **Network Device** – Routers, switches, firewalls
- **Storage** – NAS, SAN, cloud storage
- **Mobile** – Laptops, tablets, phones
- **Cloud Service** – SaaS, IaaS, PaaS platforms

## Change History

| Date | Change | Changed By | Approved By |
|------|--------|------------|-------------|
| | | | |

---

*Register Owner:* {{register_owner}} | *Classification:* CUI`,
    requiredFields: ["organization_name", "register_owner"],
    placeholders: ["organization_name", "last_updated", "register_owner"],
    requiresApproval: false,
    isSystemTemplate: true,
  },

  {
    title: "Risk Register",
    docType: "register" as const,
    cmmcLevel: "L2" as const,
    domainAbbr: "RA",
    ownerRole: "compliance_manager",
    reviewFrequency: "quarterly" as const,
    description: "Formal register tracking identified risks, likelihood, impact, and treatment decisions.",
    bodyTemplate: `# Risk Register

**Organization:** {{organization_name}}
**Last Updated:** {{last_updated}}
**Risk Manager:** {{risk_manager}}

---

## Risk Rating Scale

**Likelihood:** 1 (Rare) – 5 (Almost Certain)
**Impact:** 1 (Negligible) – 5 (Catastrophic)
**Risk Score:** Likelihood × Impact

| Score | Risk Level |
|-------|------------|
| 1-5 | Low |
| 6-12 | Medium |
| 15-19 | High |
| 20-25 | Critical |

## Risk Inventory

| Risk ID | Date Identified | Category | Risk Description | Likelihood | Impact | Score | Level | Treatment | Owner | Due Date | Status |
|---------|----------------|----------|-----------------|------------|--------|-------|-------|-----------|-------|----------|--------|
| | | | | | | | | Mitigate/Accept/Transfer/Avoid | | | Open/Closed |

## Risk Categories
- **Technical** – System vulnerabilities, misconfigurations
- **Operational** – Process failures, human error
- **Compliance** – Regulatory/contractual risk
- **Supply Chain** – Third-party vendor risk
- **Physical** – Facility, environmental threats

---

*Risk Manager:* {{risk_manager}} | *Last Reviewed:* {{last_updated}}`,
    requiredFields: ["organization_name", "risk_manager"],
    placeholders: ["organization_name", "last_updated", "risk_manager"],
    requiresApproval: false,
    isSystemTemplate: true,
  },

  // ─── CHECKLISTS ───────────────────────────────────────────────────────────
  {
    title: "Monthly Security Checklist",
    docType: "checklist" as const,
    cmmcLevel: "both" as const,
    ownerRole: "compliance_manager",
    reviewFrequency: "monthly" as const,
    recurrenceRule: "FREQ=MONTHLY;BYMONTHDAY=1",
    description: "Monthly checklist verifying routine security activities are completed.",
    bodyTemplate: `# Monthly Security Checklist

**Organization:** {{organization_name}}
**Month:** {{checklist_month}}
**Completed By:** {{completed_by}}
**Completion Date:** {{completion_date}}`,
    requiredFields: ["organization_name", "completed_by"],
    placeholders: ["organization_name", "checklist_month", "completed_by", "completion_date"],
    requiresApproval: false,
    isSystemTemplate: true,
    checklistItems: [
      { itemText: "Security event logs reviewed and anomalies addressed", isRequired: true },
      { itemText: "Backup jobs verified successful", isRequired: true },
      { itemText: "AV/EDR signatures up-to-date on all endpoints", isRequired: true },
      { itemText: "Critical/High vulnerability patches applied within SLA", isRequired: true },
      { itemText: "MFA confirmed enabled on all CUI system accounts", isRequired: true },
      { itemText: "No unauthorized devices on CUI network", isRequired: true },
      { itemText: "User accounts reviewed for terminated employees", isRequired: true },
      { itemText: "Incident log reviewed, open items tracked", isRequired: true },
      { itemText: "CUI handling violations reviewed and addressed", isRequired: false },
      { itemText: "POA&M items updated with current status", isRequired: false },
    ],
  },

  {
    title: "Annual CMMC Readiness Assessment Checklist",
    docType: "checklist" as const,
    cmmcLevel: "L2" as const,
    ownerRole: "compliance_manager",
    reviewFrequency: "annually" as const,
    description: "Annual self-assessment checklist verifying CMMC L2 readiness across all domains.",
    bodyTemplate: `# Annual CMMC Readiness Assessment Checklist

**Organization:** {{organization_name}}
**Assessment Year:** {{assessment_year}}
**Completed By:** {{completed_by}}
**Date:** {{completion_date}}`,
    requiredFields: ["organization_name", "completed_by"],
    placeholders: ["organization_name", "assessment_year", "completed_by", "completion_date"],
    requiresApproval: true,
    isSystemTemplate: true,
    checklistItems: [
      { itemText: "All CMMC L2 policies reviewed and updated within 12 months", isRequired: true },
      { itemText: "Annual security awareness training completed by all personnel", isRequired: true },
      { itemText: "Risk assessment completed within 12 months", isRequired: true },
      { itemText: "Vulnerability scans conducted monthly, results documented", isRequired: true },
      { itemText: "Incident response plan tested within 12 months", isRequired: true },
      { itemText: "User access reviews completed quarterly", isRequired: true },
      { itemText: "CUI system inventory (asset register) up to date", isRequired: true },
      { itemText: "Backup and recovery tested within 12 months", isRequired: true },
      { itemText: "MFA enforced on all CUI system accounts", isRequired: true },
      { itemText: "All open POA&Ms have current status and milestones", isRequired: true },
      { itemText: "Third-party vendor security reviewed", isRequired: true },
      { itemText: "CUI handling training completed for all personnel", isRequired: true },
      { itemText: "Audit logs retained per policy requirements", isRequired: true },
      { itemText: "System Security Plan (SSP) current and accurate", isRequired: true },
      { itemText: "Assessor package documentation prepared and organized", isRequired: true },
    ],
  },

  // ─── NARRATIVE ────────────────────────────────────────────────────────────
  {
    title: "System Security Plan (SSP) Narrative",
    docType: "narrative" as const,
    cmmcLevel: "L2" as const,
    ownerRole: "compliance_manager",
    reviewFrequency: "annually" as const,
    description: "High-level narrative describing the system environment, security controls, and compliance posture for assessors.",
    bodyTemplate: `# System Security Plan – Executive Narrative

**Organization:** {{organization_name}}
**System Name:** {{system_name}}
**System Owner:** {{system_owner}}
**Prepared Date:** {{prepared_date}}
**Document Version:** 1.0

---

## 1. System Overview

{{organization_name}} operates {{system_name}} to support {{system_purpose}}. This system processes, stores, and transmits Controlled Unclassified Information (CUI) in performance of DoD contract {{contract_number}}.

### System Boundaries

{{system_boundary_description}}

### Operating Environment

{{operating_environment}}

## 2. CUI Categories Handled

{{cui_categories}}

## 3. Security Control Implementation

### Access Control (AC)
{{ac_implementation_statement}}

### Audit and Accountability (AU)
{{au_implementation_statement}}

### Configuration Management (CM)
{{cm_implementation_statement}}

### Identification and Authentication (IA)
{{ia_implementation_statement}}

### Incident Response (IR)
{{ir_implementation_statement}}

### Risk Assessment (RA)
{{ra_implementation_statement}}

### System and Communications Protection (SC)
{{sc_implementation_statement}}

### System and Information Integrity (SI)
{{si_implementation_statement}}

## 4. Personnel Security

{{personnel_security_statement}}

## 5. Third-Party Providers

{{third_party_statement}}

## 6. Planned Improvements

{{planned_improvements}}

---

*Prepared by:* {{prepared_by}} | *Reviewed by:* {{reviewed_by}} | *Date:* {{prepared_date}}`,
    requiredFields: ["organization_name", "system_name", "system_owner", "prepared_date"],
    placeholders: ["organization_name", "system_name", "system_owner", "prepared_date", "system_purpose", "contract_number", "system_boundary_description", "operating_environment", "cui_categories", "ac_implementation_statement", "au_implementation_statement", "cm_implementation_statement", "ia_implementation_statement", "ir_implementation_statement", "ra_implementation_statement", "sc_implementation_statement", "si_implementation_statement", "personnel_security_statement", "third_party_statement", "planned_improvements", "prepared_by", "reviewed_by"],
    requiresApproval: true,
    isSystemTemplate: true,
  },
] as const;
