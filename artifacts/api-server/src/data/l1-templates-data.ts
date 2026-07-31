/**
 * Level 1 (FCI) Document Template Library
 *
 * 19 templates covering CMMC Level 1 / FAR 52.204-21 basic safeguarding
 * requirements.  All use FCI (Federal Contract Information) terminology —
 * not CUI — and map only to L1 control IDs.
 *
 * Applicability tags:  CMMC_L1_SELF (EXACT) + FAR_52_204_21 (EXACT)
 * Information type:    FCI
 */

export interface L1Template {
  sourceTemplateId: string;
  title: string;
  docType:
    | "policy"
    | "procedure"
    | "log"
    | "register"
    | "checklist"
    | "narrative"
    | "form"
    | "plan"
    | "report"
    | "approval_record"
    | "access_review"
    | "training_record"
    | "incident_record"
    | "risk_record"
    | "system_inventory"
    | "asset_inventory"
    | "supplier_review"
    | "backup_verification"
    | "vulnerability_scan"
    | "other";
  cmmcLevel: "L1";
  domainAbbr: string;
  ownerRole: string;
  reviewFrequency:
    | "monthly"
    | "quarterly"
    | "semi_annually"
    | "annually"
    | "as_needed";
  description: string;
  bodyTemplate: string;
  requiredFields: string[];
  placeholders: string[];
  requiresApproval: boolean;
  isSystemTemplate: boolean;
  purpose: string;
  scope: string;
  /** NIST 800-171 refs for this template's mapped L1 controls */
  mappedL1Controls: string[];
  /** Package keys this template applies to */
  packageKeys: string[];
  informationType: "FCI";
  templateFamilyKey: string;
}

export const L1_TEMPLATES: L1Template[] = [
  // ── POLICIES (7) ──────────────────────────────────────────────────────────

  {
    sourceTemplateId: "L1-POL-001",
    title: "FCI Security Policy",
    docType: "policy",
    cmmcLevel: "L1",
    domainAbbr: "L1",
    ownerRole: "compliance_manager",
    reviewFrequency: "annually",
    description:
      "Overarching organizational commitment to protecting Federal Contract Information (FCI) in compliance with CMMC Level 1 and FAR 52.204-21.",
    purpose:
      "Establish {{ORGANIZATION_NAME}}'s commitment to protecting Federal Contract Information (FCI) in accordance with CMMC Level 1 and FAR 52.204-21 basic safeguarding requirements.",
    scope:
      "All employees, contractors, and systems that process, store, or transmit FCI on behalf of {{ORGANIZATION_NAME}}.",
    bodyTemplate: `# FCI Security Policy

**Organization:** {{ORGANIZATION_NAME}}
**Policy Owner:** {{POLICY_OWNER}}
**Effective Date:** {{EFFECTIVE_DATE}}
**Next Review Date:** {{REVIEW_DATE}}
**Version:** {{VERSION}}

---

## 1. Purpose

{{ORGANIZATION_NAME}} is committed to protecting Federal Contract Information (FCI) in accordance with CMMC Level 1 requirements and FAR Clause 52.204-21. This policy establishes the organizational framework for basic FCI safeguarding.

## 2. Scope

This policy applies to all employees, contractors, subcontractors, and systems at {{ORGANIZATION_NAME}} that access, process, store, or transmit FCI.

## 3. Policy Statement

{{ORGANIZATION_NAME}} shall:
- Limit access to FCI to authorized users and processes
- Protect FCI systems from unauthorized access and malicious code
- Sanitize or destroy media containing FCI before disposal or reuse
- Limit physical access to FCI systems to authorized individuals
- Protect and monitor its information systems at the organizational boundary
- Identify information systems containing FCI and maintain an inventory

## 4. Roles and Responsibilities

**Senior Management:** Champions FCI protection; ensures adequate resources.
**IT Administrator / ISSO:** Implements and maintains technical controls.
**All Personnel:** Handle FCI in accordance with this policy and complete required training.

## 5. Enforcement

Violations may result in disciplinary action up to and including contract termination and referral to law enforcement.

## 6. Review

This policy shall be reviewed annually or after significant changes to systems, personnel, or contractual requirements.

---

*Approved by:* ______________________________
*Title:* {{APPROVER_TITLE}}
*Date:* {{APPROVAL_DATE}}`,
    requiredFields: [
      "ORGANIZATION_NAME",
      "POLICY_OWNER",
      "EFFECTIVE_DATE",
      "REVIEW_DATE",
    ],
    placeholders: [
      "ORGANIZATION_NAME",
      "POLICY_OWNER",
      "EFFECTIVE_DATE",
      "REVIEW_DATE",
      "VERSION",
      "APPROVER_TITLE",
      "APPROVAL_DATE",
    ],
    requiresApproval: true,
    isSystemTemplate: true,
    mappedL1Controls: ["3.1.1", "3.1.2"],
    packageKeys: ["CMMC_L1_SELF", "FAR_52_204_21"],
    informationType: "FCI",
    templateFamilyKey: "fci-security-policy",
  },

  {
    sourceTemplateId: "L1-POL-002",
    title: "Access Control Policy (FCI)",
    docType: "policy",
    cmmcLevel: "L1",
    domainAbbr: "AC",
    ownerRole: "compliance_manager",
    reviewFrequency: "annually",
    description:
      "Policy governing who may access FCI and under what conditions, enforcing least privilege and authorized-user-only access.",
    purpose:
      "Define and enforce authorized access controls for all systems processing FCI at {{ORGANIZATION_NAME}}.",
    scope:
      "All information systems at {{ORGANIZATION_NAME}} that store, process, or transmit FCI.",
    bodyTemplate: `# Access Control Policy (FCI)

**Organization:** {{ORGANIZATION_NAME}}
**Policy Owner:** {{POLICY_OWNER}}
**Effective Date:** {{EFFECTIVE_DATE}}
**Next Review Date:** {{REVIEW_DATE}}

---

## 1. Purpose

This policy ensures that only authorized users and processes can access FCI on {{ORGANIZATION_NAME}}'s information systems.

## 2. Policy Requirements

### 2.1 Authorized Access
- Access to FCI systems is limited to authorized users whose job duties require it
- Access is granted based on written authorization from the system owner

### 2.2 Least Privilege
- Users are granted only the minimum access required to perform their duties
- Privileged accounts are limited to designated IT administrators

### 2.3 Account Controls
- Inactive accounts are disabled after {{INACTIVE_ACCOUNT_DAYS}} days
- Accounts are reviewed at least {{ACCESS_REVIEW_FREQUENCY}} by the system owner
- Shared/generic accounts are prohibited for FCI systems

### 2.4 Transaction and Function Control
- Users are restricted to the transactions and functions required for their assigned duties
- Separation of duties is applied where feasible

### 2.5 External Connections
- Remote access to FCI systems requires approval from the system owner
- External network connections are documented and reviewed annually

## 3. Enforcement

Unauthorized access to FCI is a violation of this policy and may constitute a federal offense.

---

*Policy Owner:* {{POLICY_OWNER}}
*Approved:* {{APPROVAL_DATE}}`,
    requiredFields: [
      "ORGANIZATION_NAME",
      "POLICY_OWNER",
      "EFFECTIVE_DATE",
      "REVIEW_DATE",
    ],
    placeholders: [
      "ORGANIZATION_NAME",
      "POLICY_OWNER",
      "EFFECTIVE_DATE",
      "REVIEW_DATE",
      "INACTIVE_ACCOUNT_DAYS",
      "ACCESS_REVIEW_FREQUENCY",
      "APPROVAL_DATE",
    ],
    requiresApproval: true,
    isSystemTemplate: true,
    mappedL1Controls: ["3.1.1", "3.1.2", "3.1.20", "3.1.22"],
    packageKeys: ["CMMC_L1_SELF", "FAR_52_204_21"],
    informationType: "FCI",
    templateFamilyKey: "access-control-policy",
  },

  {
    sourceTemplateId: "L1-POL-003",
    title: "Identification and Authentication Policy (FCI)",
    docType: "policy",
    cmmcLevel: "L1",
    domainAbbr: "IA",
    ownerRole: "compliance_manager",
    reviewFrequency: "annually",
    description:
      "Policy requiring identification and authentication of all users accessing FCI systems.",
    purpose:
      "Ensure that all users of FCI systems at {{ORGANIZATION_NAME}} are identified and authenticated before access is granted.",
    scope:
      "All information systems at {{ORGANIZATION_NAME}} that process FCI.",
    bodyTemplate: `# Identification and Authentication Policy (FCI)

**Organization:** {{ORGANIZATION_NAME}}
**Policy Owner:** {{POLICY_OWNER}}
**Effective Date:** {{EFFECTIVE_DATE}}
**Next Review Date:** {{REVIEW_DATE}}

---

## 1. Purpose

This policy establishes requirements for identifying and authenticating users, processes, and devices accessing FCI systems at {{ORGANIZATION_NAME}}.

## 2. Policy Requirements

### 2.1 User Identification
- All users must have a unique identifier (user ID) — shared IDs are prohibited
- User IDs must be linked to a real person with documented authorization

### 2.2 Authentication
- Users must authenticate to FCI systems before access is granted
- Passwords must meet minimum complexity requirements:
  - Minimum 12 characters
  - Mix of uppercase, lowercase, numbers, and special characters
- Passwords must be changed at least annually or immediately after suspected compromise

### 2.3 Password Protection
- Default passwords must be changed before a system is placed into production
- Passwords must not be shared, written in plaintext, or stored insecurely

## 3. Enforcement

Users who share credentials or circumvent authentication controls are subject to immediate account suspension and disciplinary action.

---

*Policy Owner:* {{POLICY_OWNER}}
*Approved:* {{APPROVAL_DATE}}`,
    requiredFields: [
      "ORGANIZATION_NAME",
      "POLICY_OWNER",
      "EFFECTIVE_DATE",
      "REVIEW_DATE",
    ],
    placeholders: [
      "ORGANIZATION_NAME",
      "POLICY_OWNER",
      "EFFECTIVE_DATE",
      "REVIEW_DATE",
      "APPROVAL_DATE",
    ],
    requiresApproval: true,
    isSystemTemplate: true,
    mappedL1Controls: ["3.5.1", "3.5.2"],
    packageKeys: ["CMMC_L1_SELF", "FAR_52_204_21"],
    informationType: "FCI",
    templateFamilyKey: "ia-policy",
  },

  {
    sourceTemplateId: "L1-POL-004",
    title: "Media Protection Policy (FCI)",
    docType: "policy",
    cmmcLevel: "L1",
    domainAbbr: "MP",
    ownerRole: "compliance_manager",
    reviewFrequency: "annually",
    description:
      "Policy governing the sanitization and disposal of media containing FCI.",
    purpose:
      "Ensure that media containing FCI is sanitized or destroyed before disposal or reuse to prevent unauthorized disclosure.",
    scope:
      "All physical and digital media at {{ORGANIZATION_NAME}} that has stored FCI.",
    bodyTemplate: `# Media Protection Policy (FCI)

**Organization:** {{ORGANIZATION_NAME}}
**Policy Owner:** {{POLICY_OWNER}}
**Effective Date:** {{EFFECTIVE_DATE}}
**Next Review Date:** {{REVIEW_DATE}}

---

## 1. Purpose

This policy ensures media containing FCI is properly sanitized or destroyed before disposal or reuse, preventing accidental disclosure.

## 2. Policy Requirements

### 2.1 Media Sanitization
- All media (hard drives, USB drives, CDs, printed documents, etc.) containing FCI must be sanitized before disposal or reuse
- Sanitization must follow NIST SP 800-88 Guidelines for Media Sanitization
- Hard drives must be overwritten, degaussed, or physically destroyed

### 2.2 Disposal
- Unsanitized FCI media must never be placed in regular trash
- Paper FCI documents must be cross-cut shredded
- Physical destruction records must be maintained

### 2.3 Media Inventory
- Portable media (USB drives, external hard drives) used for FCI must be inventoried and tracked

## 3. Enforcement

Improper disposal of FCI media is a policy violation and may constitute a federal data breach.

---

*Policy Owner:* {{POLICY_OWNER}}
*Approved:* {{APPROVAL_DATE}}`,
    requiredFields: [
      "ORGANIZATION_NAME",
      "POLICY_OWNER",
      "EFFECTIVE_DATE",
      "REVIEW_DATE",
    ],
    placeholders: [
      "ORGANIZATION_NAME",
      "POLICY_OWNER",
      "EFFECTIVE_DATE",
      "REVIEW_DATE",
      "APPROVAL_DATE",
    ],
    requiresApproval: true,
    isSystemTemplate: true,
    mappedL1Controls: ["3.8.3"],
    packageKeys: ["CMMC_L1_SELF", "FAR_52_204_21"],
    informationType: "FCI",
    templateFamilyKey: "media-protection-policy",
  },

  {
    sourceTemplateId: "L1-POL-005",
    title: "Physical Protection Policy (FCI)",
    docType: "policy",
    cmmcLevel: "L1",
    domainAbbr: "PE",
    ownerRole: "compliance_manager",
    reviewFrequency: "annually",
    description:
      "Policy restricting physical access to FCI systems and workspaces to authorized individuals.",
    purpose:
      "Limit physical access to {{ORGANIZATION_NAME}}'s information systems and workspaces containing FCI to authorized personnel only.",
    scope:
      "All physical locations at {{ORGANIZATION_NAME}} where FCI systems are hosted or accessed.",
    bodyTemplate: `# Physical Protection Policy (FCI)

**Organization:** {{ORGANIZATION_NAME}}
**Policy Owner:** {{POLICY_OWNER}}
**Effective Date:** {{EFFECTIVE_DATE}}
**Next Review Date:** {{REVIEW_DATE}}

---

## 1. Purpose

This policy restricts physical access to FCI systems and processing areas to authorized individuals.

## 2. Policy Requirements

### 2.1 Physical Access Controls
- Access to areas containing FCI systems is restricted to authorized personnel
- Physical access controls (badges, key cards, locks) must be in place
- Access lists must be reviewed at least {{ACCESS_REVIEW_FREQUENCY}}

### 2.2 Visitor Management
- Visitors must be escorted at all times in areas with FCI systems
- A visitor log must be maintained recording name, affiliation, date, time in/out, and escort

### 2.3 Physical Access Logs
- Physical access to FCI areas must be logged
- Logs must be reviewed periodically for anomalies and retained for at least 3 years

### 2.4 Physical Access Devices
- Physical access control devices (badges, keys) must be managed and decommissioned upon personnel departure
- Lost access credentials must be reported and deactivated immediately

## 3. Enforcement

Unauthorized physical access to FCI systems is a serious violation and may be referred to law enforcement.

---

*Policy Owner:* {{POLICY_OWNER}}
*Approved:* {{APPROVAL_DATE}}`,
    requiredFields: [
      "ORGANIZATION_NAME",
      "POLICY_OWNER",
      "EFFECTIVE_DATE",
      "REVIEW_DATE",
    ],
    placeholders: [
      "ORGANIZATION_NAME",
      "POLICY_OWNER",
      "EFFECTIVE_DATE",
      "REVIEW_DATE",
      "ACCESS_REVIEW_FREQUENCY",
      "APPROVAL_DATE",
    ],
    requiresApproval: true,
    isSystemTemplate: true,
    mappedL1Controls: ["3.10.1", "3.10.3", "3.10.4", "3.10.5"],
    packageKeys: ["CMMC_L1_SELF", "FAR_52_204_21"],
    informationType: "FCI",
    templateFamilyKey: "physical-protection-policy",
  },

  {
    sourceTemplateId: "L1-POL-006",
    title: "System and Communications Protection Policy (FCI)",
    docType: "policy",
    cmmcLevel: "L1",
    domainAbbr: "SC",
    ownerRole: "compliance_manager",
    reviewFrequency: "annually",
    description:
      "Policy establishing boundary protection and network segmentation requirements for FCI systems.",
    purpose:
      "Monitor, control, and protect FCI system communications at external boundaries and key internal boundaries.",
    scope:
      "All networks and communications infrastructure at {{ORGANIZATION_NAME}} that carry or could carry FCI.",
    bodyTemplate: `# System and Communications Protection Policy (FCI)

**Organization:** {{ORGANIZATION_NAME}}
**Policy Owner:** {{POLICY_OWNER}}
**Effective Date:** {{EFFECTIVE_DATE}}
**Next Review Date:** {{REVIEW_DATE}}

---

## 1. Purpose

This policy establishes requirements for monitoring and protecting FCI at system and network boundaries.

## 2. Policy Requirements

### 2.1 Boundary Protection
- FCI systems must be protected by firewalls or equivalent boundary devices
- Inbound and outbound traffic must be monitored and filtered
- Unnecessary ports, protocols, and services must be disabled

### 2.2 Public-Access System Separation
- Systems accessible to the public must be separated from internal FCI systems
- FCI must not be stored or processed on publicly accessible systems

### 2.3 Network Monitoring
- Network traffic at external boundaries must be monitored for anomalous activity
- Unauthorized connections must be blocked and logged

## 3. Enforcement

Failure to maintain boundary controls is a critical security violation requiring immediate remediation.

---

*Policy Owner:* {{POLICY_OWNER}}
*Approved:* {{APPROVAL_DATE}}`,
    requiredFields: [
      "ORGANIZATION_NAME",
      "POLICY_OWNER",
      "EFFECTIVE_DATE",
      "REVIEW_DATE",
    ],
    placeholders: [
      "ORGANIZATION_NAME",
      "POLICY_OWNER",
      "EFFECTIVE_DATE",
      "REVIEW_DATE",
      "APPROVAL_DATE",
    ],
    requiresApproval: true,
    isSystemTemplate: true,
    mappedL1Controls: ["3.13.1", "3.13.5"],
    packageKeys: ["CMMC_L1_SELF", "FAR_52_204_21"],
    informationType: "FCI",
    templateFamilyKey: "sc-protection-policy",
  },

  {
    sourceTemplateId: "L1-POL-007",
    title: "System and Information Integrity Policy (FCI)",
    docType: "policy",
    cmmcLevel: "L1",
    domainAbbr: "SI",
    ownerRole: "compliance_manager",
    reviewFrequency: "annually",
    description:
      "Policy requiring malware protection, patch management, and system scanning for FCI systems.",
    purpose:
      "Protect the integrity of FCI systems through timely patching, malware protection, and periodic scanning.",
    scope:
      "All information systems at {{ORGANIZATION_NAME}} that process, store, or transmit FCI.",
    bodyTemplate: `# System and Information Integrity Policy (FCI)

**Organization:** {{ORGANIZATION_NAME}}
**Policy Owner:** {{POLICY_OWNER}}
**Effective Date:** {{EFFECTIVE_DATE}}
**Next Review Date:** {{REVIEW_DATE}}

---

## 1. Purpose

This policy establishes requirements for maintaining the integrity of FCI systems through malware protection, patch management, and periodic scanning.

## 2. Policy Requirements

### 2.1 Malware Protection
- Anti-malware software must be deployed on all FCI systems
- Malware definitions must be updated at least {{MALWARE_SCAN_FREQUENCY}}
- Real-time protection must be enabled where technically feasible

### 2.2 Security Patching
- Operating system and application patches must be applied within 30 days of release for critical/high vulnerabilities
- Patch status must be documented and tracked

### 2.3 System Scanning
- FCI systems must be scanned for malware and vulnerabilities on a regular basis
- Scan results must be documented and remediation tracked

## 3. Enforcement

Unpatched or unprotected FCI systems must be isolated from the network until remediation is complete.

---

*Policy Owner:* {{POLICY_OWNER}}
*Approved:* {{APPROVAL_DATE}}`,
    requiredFields: [
      "ORGANIZATION_NAME",
      "POLICY_OWNER",
      "EFFECTIVE_DATE",
      "REVIEW_DATE",
    ],
    placeholders: [
      "ORGANIZATION_NAME",
      "POLICY_OWNER",
      "EFFECTIVE_DATE",
      "REVIEW_DATE",
      "MALWARE_SCAN_FREQUENCY",
      "APPROVAL_DATE",
    ],
    requiresApproval: true,
    isSystemTemplate: true,
    mappedL1Controls: ["3.14.1", "3.14.2", "3.14.4", "3.14.5"],
    packageKeys: ["CMMC_L1_SELF", "FAR_52_204_21"],
    informationType: "FCI",
    templateFamilyKey: "si-integrity-policy",
  },

  // ── PROCEDURES (7) ────────────────────────────────────────────────────────

  {
    sourceTemplateId: "L1-PROC-001",
    title: "Access Control Procedure (FCI)",
    docType: "procedure",
    cmmcLevel: "L1",
    domainAbbr: "AC",
    ownerRole: "it_contributor",
    reviewFrequency: "annually",
    description:
      "Step-by-step procedure for requesting, granting, reviewing, and revoking access to FCI systems.",
    purpose:
      "Provide operational steps for managing user access to FCI systems at {{ORGANIZATION_NAME}}.",
    scope:
      "All FCI systems and personnel at {{ORGANIZATION_NAME}} requiring access to FCI.",
    bodyTemplate: `# Access Control Procedure (FCI)

**Organization:** {{ORGANIZATION_NAME}}
**System:** {{SYSTEM_NAME}}
**Procedure Owner:** {{PROCEDURE_OWNER}}
**Effective Date:** {{EFFECTIVE_DATE}}

---

## 1. Purpose

This procedure defines the steps for granting, modifying, reviewing, and revoking access to FCI systems at {{ORGANIZATION_NAME}}.

## 2. Access Request

### Step 1 — Submit Request
- Manager submits an Access Request Form (ARF) identifying: employee name, systems needed, business justification, and requested access level

### Step 2 — Authorization
- System Owner reviews and approves/denies within 2 business days
- Approved requests are forwarded to IT

### Step 3 — Account Provisioning
- IT creates account with minimum necessary permissions (least privilege)
- User is notified of account credentials via secure channel
- Account is activated only after user confirms receipt

## 3. Access Modification
- Modifications require a new ARF or email approval from manager and System Owner

## 4. Access Termination
- HR notifies IT within 4 hours of employee separation
- IT disables the account immediately; deletes or archives after 30 days

## 5. Periodic Access Review
- System Owner reviews all accounts every {{ACCESS_REVIEW_FREQUENCY}}
- Undocumented accounts are disabled; review results are documented

---

*Procedure Owner:* {{PROCEDURE_OWNER}} | *Approved:* {{APPROVAL_DATE}}`,
    requiredFields: [
      "ORGANIZATION_NAME",
      "SYSTEM_NAME",
      "PROCEDURE_OWNER",
      "EFFECTIVE_DATE",
    ],
    placeholders: [
      "ORGANIZATION_NAME",
      "SYSTEM_NAME",
      "PROCEDURE_OWNER",
      "EFFECTIVE_DATE",
      "ACCESS_REVIEW_FREQUENCY",
      "APPROVAL_DATE",
    ],
    requiresApproval: true,
    isSystemTemplate: true,
    mappedL1Controls: ["3.1.1", "3.1.2"],
    packageKeys: ["CMMC_L1_SELF", "FAR_52_204_21"],
    informationType: "FCI",
    templateFamilyKey: "access-control-procedure",
  },

  {
    sourceTemplateId: "L1-PROC-002",
    title: "User Identification and Authentication Procedure (FCI)",
    docType: "procedure",
    cmmcLevel: "L1",
    domainAbbr: "IA",
    ownerRole: "it_contributor",
    reviewFrequency: "annually",
    description:
      "Procedure for establishing and managing user identities and authentication credentials on FCI systems.",
    purpose:
      "Define operational steps for creating, managing, and revoking user identities and passwords on FCI systems.",
    scope: "All FCI systems and user accounts at {{ORGANIZATION_NAME}}.",
    bodyTemplate: `# User Identification and Authentication Procedure (FCI)

**Organization:** {{ORGANIZATION_NAME}}
**System:** {{SYSTEM_NAME}}
**Procedure Owner:** {{PROCEDURE_OWNER}}
**Effective Date:** {{EFFECTIVE_DATE}}

---

## 1. User Account Creation
### Step 1 — Assign Unique ID
- IT assigns a unique user ID (username) — no shared IDs permitted
- User ID is linked to a documented authorization record

### Step 2 — Set Initial Password
- IT generates a temporary password meeting complexity requirements
- Password is delivered to the user via secure, out-of-band channel
- User must change password on first login

## 2. Password Requirements
- Minimum 12 characters; mix of uppercase, lowercase, numbers, and symbols
- Passwords expire annually; immediate change required if compromised
- Password history of last 10 passwords enforced (no reuse)

## 3. Default Credential Rotation
- All default manufacturer/vendor credentials are changed before system deployment
- A record of changes is maintained

## 4. Password Reset
- Password resets require identity verification (manager confirmation or secondary email/phone)
- Resets are logged in the IT ticketing system

---

*Procedure Owner:* {{PROCEDURE_OWNER}} | *Approved:* {{APPROVAL_DATE}}`,
    requiredFields: [
      "ORGANIZATION_NAME",
      "SYSTEM_NAME",
      "PROCEDURE_OWNER",
      "EFFECTIVE_DATE",
    ],
    placeholders: [
      "ORGANIZATION_NAME",
      "SYSTEM_NAME",
      "PROCEDURE_OWNER",
      "EFFECTIVE_DATE",
      "APPROVAL_DATE",
    ],
    requiresApproval: true,
    isSystemTemplate: true,
    mappedL1Controls: ["3.5.1", "3.5.2"],
    packageKeys: ["CMMC_L1_SELF", "FAR_52_204_21"],
    informationType: "FCI",
    templateFamilyKey: "ia-procedure",
  },

  {
    sourceTemplateId: "L1-PROC-003",
    title: "Media Sanitization and Disposal Procedure (FCI)",
    docType: "procedure",
    cmmcLevel: "L1",
    domainAbbr: "MP",
    ownerRole: "it_contributor",
    reviewFrequency: "annually",
    description:
      "Procedure for sanitizing and disposing of media that has stored FCI, in accordance with NIST SP 800-88.",
    purpose:
      "Ensure FCI cannot be recovered from media that is reused or disposed of.",
    scope:
      "All physical and digital media at {{ORGANIZATION_NAME}} that has stored FCI.",
    bodyTemplate: `# Media Sanitization and Disposal Procedure (FCI)

**Organization:** {{ORGANIZATION_NAME}}
**Procedure Owner:** {{PROCEDURE_OWNER}}
**Effective Date:** {{EFFECTIVE_DATE}}

---

## 1. Identify Media for Disposal or Reuse

### Step 1 — Tag and Track
- When a device or media is identified for retirement or reuse, IT logs it in the media tracking register
- Media containing FCI is flagged for sanitization before any transfer or disposal

## 2. Sanitization

### Step 2 — Select Sanitization Method
| Media Type | Method |
|---|---|
| Hard drives (HDD) | DoD 5220.22-M overwrite or physical destruction |
| Solid-state drives (SSD) | ATA Secure Erase or physical destruction |
| USB drives | Overwrite using approved tool or physical destruction |
| Optical media (CD/DVD) | Physical shredding |
| Paper documents | Cross-cut shred (DIN 66399 Level P-4 or higher) |

### Step 3 — Document Sanitization
- IT records: asset tag, serial number, method used, date, and staff member who performed sanitization
- Completed record is signed by the IT Administrator

## 3. Verification

### Step 4 — Verify Sanitization
- IT spot-checks sanitized media using a hex editor or forensic tool to confirm data is unrecoverable
- Results are noted in the disposal record

## 4. Disposal

### Step 5 — Dispose or Reuse
- Verified sanitized media may be reused within the organization or transferred to a certified e-waste vendor
- Disposal records are retained for 3 years

---

*Procedure Owner:* {{PROCEDURE_OWNER}} | *Approved:* {{APPROVAL_DATE}}`,
    requiredFields: [
      "ORGANIZATION_NAME",
      "PROCEDURE_OWNER",
      "EFFECTIVE_DATE",
    ],
    placeholders: [
      "ORGANIZATION_NAME",
      "PROCEDURE_OWNER",
      "EFFECTIVE_DATE",
      "APPROVAL_DATE",
    ],
    requiresApproval: true,
    isSystemTemplate: true,
    mappedL1Controls: ["3.8.3"],
    packageKeys: ["CMMC_L1_SELF", "FAR_52_204_21"],
    informationType: "FCI",
    templateFamilyKey: "media-disposal-procedure",
  },

  {
    sourceTemplateId: "L1-PROC-004",
    title: "Visitor Management and Physical Access Procedure (FCI)",
    docType: "procedure",
    cmmcLevel: "L1",
    domainAbbr: "PE",
    ownerRole: "it_contributor",
    reviewFrequency: "annually",
    description:
      "Procedure for managing visitor escorts and physical access control to areas containing FCI systems.",
    purpose:
      "Control physical access to FCI systems areas, escort all visitors, and maintain physical access logs.",
    scope:
      "All physical areas at {{ORGANIZATION_NAME}} that house or provide access to FCI systems.",
    bodyTemplate: `# Visitor Management and Physical Access Procedure (FCI)

**Organization:** {{ORGANIZATION_NAME}}
**Procedure Owner:** {{PROCEDURE_OWNER}}
**Effective Date:** {{EFFECTIVE_DATE}}

---

## 1. Authorized Access to FCI Areas

### Step 1 — Access Authorization
- Facilities Manager maintains a current list of personnel authorized to access FCI areas
- List is reviewed and updated {{ACCESS_REVIEW_FREQUENCY}}
- Departing employees have physical access credentials revoked on their last day

## 2. Visitor Management

### Step 2 — Visitor Check-In
- Visitors sign in at reception, presenting government-issued photo ID
- Visitor log entry includes: name, affiliation, purpose, date, time in, and escort name

### Step 3 — Escort Requirement
- Visitors must be escorted at all times in FCI areas
- Escort is responsible for visitor behavior and ensuring FCI is not accessible

### Step 4 — Visitor Check-Out
- Visitor signs out; time-out is recorded in the log
- Escort confirms no FCI was accessed inappropriately

## 3. Physical Access Logging

### Step 5 — Log Review
- Facilities Manager reviews physical access logs {{ACCESS_REVIEW_FREQUENCY}} for anomalies
- Anomalies are escalated to the IT Administrator and documented

## 4. Lost or Stolen Credentials
- Report immediately to the Facilities Manager
- Physical credentials (badges, keys) are deactivated within 4 hours of report

---

*Procedure Owner:* {{PROCEDURE_OWNER}} | *Approved:* {{APPROVAL_DATE}}`,
    requiredFields: [
      "ORGANIZATION_NAME",
      "PROCEDURE_OWNER",
      "EFFECTIVE_DATE",
    ],
    placeholders: [
      "ORGANIZATION_NAME",
      "PROCEDURE_OWNER",
      "EFFECTIVE_DATE",
      "ACCESS_REVIEW_FREQUENCY",
      "APPROVAL_DATE",
    ],
    requiresApproval: true,
    isSystemTemplate: true,
    mappedL1Controls: ["3.10.1", "3.10.3", "3.10.4", "3.10.5"],
    packageKeys: ["CMMC_L1_SELF", "FAR_52_204_21"],
    informationType: "FCI",
    templateFamilyKey: "visitor-physical-access-procedure",
  },

  {
    sourceTemplateId: "L1-PROC-005",
    title: "Malware Protection Procedure (FCI)",
    docType: "procedure",
    cmmcLevel: "L1",
    domainAbbr: "SI",
    ownerRole: "it_contributor",
    reviewFrequency: "annually",
    description:
      "Procedure for deploying, maintaining, and monitoring anti-malware protections on FCI systems.",
    purpose:
      "Protect FCI systems from malicious code through deployed and up-to-date anti-malware controls.",
    scope: "All workstations, servers, and devices at {{ORGANIZATION_NAME}} that process FCI.",
    bodyTemplate: `# Malware Protection Procedure (FCI)

**Organization:** {{ORGANIZATION_NAME}}
**System:** {{SYSTEM_NAME}}
**Procedure Owner:** {{PROCEDURE_OWNER}}
**Effective Date:** {{EFFECTIVE_DATE}}

---

## 1. Anti-Malware Deployment

### Step 1 — Install Anti-Malware
- IT deploys approved anti-malware software on all FCI systems
- Real-time protection is enabled on all endpoints where supported

### Step 2 — Definition Updates
- Malware definitions are updated automatically; update frequency: {{MALWARE_SCAN_FREQUENCY}}
- IT verifies update status weekly via central management console

## 2. Scheduled Scans

### Step 3 — Run Scheduled Scans
- Full system scans are scheduled on all FCI systems at minimum monthly
- Scan completion and results are logged in the security event log

### Step 4 — Review Scan Results
- IT Administrator reviews scan results within 24 hours of completion
- Any detected threats are documented in the security incident register

## 3. Threat Response

### Step 5 — Contain and Remediate
- Infected systems are immediately isolated from the network
- Malware is removed using approved tools; system is verified clean before reconnection
- Incident is documented per the Incident Response Procedure

## 4. Removable Media Controls
- Removable media (USB, external drives) is scanned before use on FCI systems
- Auto-run/auto-play is disabled on all FCI workstations

---

*Procedure Owner:* {{PROCEDURE_OWNER}} | *Approved:* {{APPROVAL_DATE}}`,
    requiredFields: [
      "ORGANIZATION_NAME",
      "SYSTEM_NAME",
      "PROCEDURE_OWNER",
      "EFFECTIVE_DATE",
    ],
    placeholders: [
      "ORGANIZATION_NAME",
      "SYSTEM_NAME",
      "PROCEDURE_OWNER",
      "EFFECTIVE_DATE",
      "MALWARE_SCAN_FREQUENCY",
      "APPROVAL_DATE",
    ],
    requiresApproval: true,
    isSystemTemplate: true,
    mappedL1Controls: ["3.14.2", "3.14.4", "3.14.5"],
    packageKeys: ["CMMC_L1_SELF", "FAR_52_204_21"],
    informationType: "FCI",
    templateFamilyKey: "malware-protection-procedure",
  },

  {
    sourceTemplateId: "L1-PROC-006",
    title: "Patch and Flaw Remediation Procedure (FCI)",
    docType: "procedure",
    cmmcLevel: "L1",
    domainAbbr: "SI",
    ownerRole: "it_contributor",
    reviewFrequency: "annually",
    description:
      "Procedure for identifying, testing, and applying security patches to FCI systems within required timeframes.",
    purpose:
      "Ensure FCI systems are patched promptly to address known vulnerabilities and flaws.",
    scope:
      "All operating systems, applications, and firmware on FCI systems at {{ORGANIZATION_NAME}}.",
    bodyTemplate: `# Patch and Flaw Remediation Procedure (FCI)

**Organization:** {{ORGANIZATION_NAME}}
**System:** {{SYSTEM_NAME}}
**Procedure Owner:** {{PROCEDURE_OWNER}}
**Effective Date:** {{EFFECTIVE_DATE}}

---

## 1. Patch Identification

### Step 1 — Monitor for Patches
- IT subscribes to vendor security bulletins and CISA Known Exploited Vulnerabilities (KEV) catalog
- New patches are evaluated weekly by the IT Administrator

## 2. Patch Classification and Prioritization

### Step 2 — Classify Severity
| Severity | Remediation Window |
|---|---|
| Critical | Within 14 days |
| High | Within 30 days |
| Medium | Within 90 days |
| Low | Next scheduled maintenance window |

## 3. Testing and Deployment

### Step 3 — Test in Non-Production
- Critical/High patches are tested in a non-production environment (or documented exception applied) before deployment

### Step 4 — Deploy to Production
- Patches are deployed during approved maintenance windows unless severity requires emergency deployment
- Deployment is logged with: patch ID, system, date, technician, and outcome

## 4. Verification

### Step 5 — Verify Application
- Post-patch scans or reports confirm successful installation
- Unresolved patches are tracked and escalated weekly

## 5. Exception Handling
- If a patch cannot be applied (compatibility issue), a compensating control and risk acceptance form is documented and signed by the System Owner

---

*Procedure Owner:* {{PROCEDURE_OWNER}} | *Approved:* {{APPROVAL_DATE}}`,
    requiredFields: [
      "ORGANIZATION_NAME",
      "SYSTEM_NAME",
      "PROCEDURE_OWNER",
      "EFFECTIVE_DATE",
    ],
    placeholders: [
      "ORGANIZATION_NAME",
      "SYSTEM_NAME",
      "PROCEDURE_OWNER",
      "EFFECTIVE_DATE",
      "APPROVAL_DATE",
    ],
    requiresApproval: true,
    isSystemTemplate: true,
    mappedL1Controls: ["3.14.1"],
    packageKeys: ["CMMC_L1_SELF", "FAR_52_204_21"],
    informationType: "FCI",
    templateFamilyKey: "patch-remediation-procedure",
  },

  {
    sourceTemplateId: "L1-PROC-007",
    title: "Network Boundary Protection Procedure (FCI)",
    docType: "procedure",
    cmmcLevel: "L1",
    domainAbbr: "SC",
    ownerRole: "it_contributor",
    reviewFrequency: "annually",
    description:
      "Procedure for configuring and maintaining network boundary controls to protect FCI from external threats.",
    purpose:
      "Define operational steps for maintaining boundary protection of FCI systems at {{ORGANIZATION_NAME}}.",
    scope:
      "All firewalls, routers, and network boundary devices at {{ORGANIZATION_NAME}} that protect FCI systems.",
    bodyTemplate: `# Network Boundary Protection Procedure (FCI)

**Organization:** {{ORGANIZATION_NAME}}
**System:** {{SYSTEM_NAME}}
**Procedure Owner:** {{PROCEDURE_OWNER}}
**Effective Date:** {{EFFECTIVE_DATE}}

---

## 1. Boundary Device Inventory

### Step 1 — Maintain Inventory
- IT maintains an up-to-date inventory of all boundary devices (firewalls, routers, proxies)
- Inventory is reviewed quarterly

## 2. Firewall Configuration

### Step 2 — Default-Deny Rule
- Firewall rule sets follow a default-deny philosophy: all traffic is blocked unless explicitly permitted
- Rule documentation includes: rule purpose, owner, and last review date

### Step 3 — Disable Unnecessary Services
- IT reviews firewall and boundary device configurations semi-annually
- Unnecessary ports, protocols, and services are disabled and documented

## 3. Public-Access System Separation

### Step 4 — Separate Public Systems
- Systems accessible to the public (websites, portals) are hosted in a DMZ or separate network segment
- FCI systems have no direct connectivity to public-access systems

## 4. External Connection Review

### Step 5 — Review External Connections
- All authorized external connections (VPN, third-party links) are documented and reviewed annually
- Unauthorized connections are blocked and investigated

## 5. Monitoring

### Step 6 — Log and Alert
- Firewall logs are retained for at least 1 year
- Automated alerts are configured for blocked suspicious traffic and policy violations

---

*Procedure Owner:* {{PROCEDURE_OWNER}} | *Approved:* {{APPROVAL_DATE}}`,
    requiredFields: [
      "ORGANIZATION_NAME",
      "SYSTEM_NAME",
      "PROCEDURE_OWNER",
      "EFFECTIVE_DATE",
    ],
    placeholders: [
      "ORGANIZATION_NAME",
      "SYSTEM_NAME",
      "PROCEDURE_OWNER",
      "EFFECTIVE_DATE",
      "APPROVAL_DATE",
    ],
    requiresApproval: true,
    isSystemTemplate: true,
    mappedL1Controls: ["3.13.1", "3.13.5"],
    packageKeys: ["CMMC_L1_SELF", "FAR_52_204_21"],
    informationType: "FCI",
    templateFamilyKey: "boundary-protection-procedure",
  },

  // ── TRAINING RECORD (1) ───────────────────────────────────────────────────

  {
    sourceTemplateId: "L1-TRAIN-001",
    title: "Annual FCI Security Awareness Training Record",
    docType: "training_record",
    cmmcLevel: "L1",
    domainAbbr: "AT",
    ownerRole: "compliance_manager",
    reviewFrequency: "annually",
    description:
      "Record documenting completion of annual FCI security awareness training by all personnel with access to FCI.",
    purpose:
      "Document that all personnel with access to FCI systems at {{ORGANIZATION_NAME}} have completed required security awareness training.",
    scope:
      "All employees, contractors, and subcontractors at {{ORGANIZATION_NAME}} with access to FCI.",
    bodyTemplate: `# Annual FCI Security Awareness Training Record

**Organization:** {{ORGANIZATION_NAME}}
**Training Period:** {{REVIEW_PERIOD}}
**Training Coordinator:** {{SYSTEM_OWNER}}
**Completion Deadline:** {{ANNUAL_TRAINING_DEADLINE}}
**Date Prepared:** {{EFFECTIVE_DATE}}

---

## Training Coverage

This record documents completion of the annual FCI Security Awareness Training covering:

- What is Federal Contract Information (FCI) and why it must be protected
- Access control: who may access FCI and under what conditions
- Handling and disposal of FCI (physical and digital)
- Identification of phishing, social engineering, and insider threats
- Incident reporting obligations
- FAR 52.204-21 basic safeguarding requirements overview

## Training Completion Log

| Employee Name | Title | Completion Date | Training Method | Trainer / System | Signature |
|---|---|---|---|---|---|
| | | | | | |
| | | | | | |
| | | | | | |

## Non-Completion and Exceptions

Employees who did not complete training by the deadline:
*(List name, reason, and remediation date — or enter "None")*

{{ANOMALIES_NOTED}}

## Summary

- Total personnel requiring training: ___
- Completed on time: ___
- Completed late: ___
- Pending: ___
- Exempted (with documentation): ___

---

*Prepared by:* {{SYSTEM_OWNER}}
*Date:* {{EFFECTIVE_DATE}}
*Approved by:* {{APPROVER_NAME}}`,
    requiredFields: [
      "ORGANIZATION_NAME",
      "REVIEW_PERIOD",
      "SYSTEM_OWNER",
      "EFFECTIVE_DATE",
    ],
    placeholders: [
      "ORGANIZATION_NAME",
      "REVIEW_PERIOD",
      "SYSTEM_OWNER",
      "EFFECTIVE_DATE",
      "ANNUAL_TRAINING_DEADLINE",
      "ANOMALIES_NOTED",
      "APPROVER_NAME",
    ],
    requiresApproval: false,
    isSystemTemplate: true,
    mappedL1Controls: [],
    packageKeys: ["CMMC_L1_SELF", "FAR_52_204_21"],
    informationType: "FCI",
    templateFamilyKey: "fci-training-record",
  },

  // ── LOGS (3) ──────────────────────────────────────────────────────────────

  {
    sourceTemplateId: "L1-LOG-001",
    title: "Quarterly FCI Access Review Log",
    docType: "access_review",
    cmmcLevel: "L1",
    domainAbbr: "AC",
    ownerRole: "it_contributor",
    reviewFrequency: "quarterly",
    description:
      "Quarterly log documenting the review of all user accounts with access to FCI systems.",
    purpose:
      "Document periodic review of all user accounts with access to FCI systems to ensure access remains authorized and least-privilege.",
    scope: "All user accounts on FCI systems at {{ORGANIZATION_NAME}}.",
    bodyTemplate: `# Quarterly FCI Access Review Log

**Organization:** {{ORGANIZATION_NAME}}
**Review Period:** {{REVIEW_PERIOD}}
**Reviewer:** {{SYSTEM_OWNER}}
**Review Date:** {{EFFECTIVE_DATE}}

---

## Review Summary

| System / Application | Total Accounts | Accounts Reviewed | Accounts Disabled | Accounts Modified | Notes |
|---|---|---|---|---|---|
| | | | | | |
| | | | | | |

**Total Accounts:** {{TOTAL_ACCOUNTS}}
**Accounts Removed/Disabled:** {{ACCOUNTS_REMOVED}}
**Accounts Modified:** {{ACCOUNTS_MODIFIED}}

## Findings

{{FINDINGS_AND_ACTIONS}}

## Accounts Disabled This Period

| Employee Name | Account | System | Reason | Date Disabled |
|---|---|---|---|---|
| | | | | |

## Accounts Requiring Follow-Up

| Issue | Account | System | Assigned To | Target Date |
|---|---|---|---|---|
| | | | | |

## Reviewer Attestation

I confirm that all user accounts on FCI systems have been reviewed for this period and that access remains authorized and consistent with least-privilege principles.

*Reviewer:* {{SYSTEM_OWNER}}
*Date:* {{EFFECTIVE_DATE}}`,
    requiredFields: [
      "ORGANIZATION_NAME",
      "REVIEW_PERIOD",
      "SYSTEM_OWNER",
      "EFFECTIVE_DATE",
    ],
    placeholders: [
      "ORGANIZATION_NAME",
      "REVIEW_PERIOD",
      "SYSTEM_OWNER",
      "EFFECTIVE_DATE",
      "TOTAL_ACCOUNTS",
      "ACCOUNTS_REMOVED",
      "ACCOUNTS_MODIFIED",
      "FINDINGS_AND_ACTIONS",
    ],
    requiresApproval: false,
    isSystemTemplate: true,
    mappedL1Controls: ["3.1.1", "3.1.2"],
    packageKeys: ["CMMC_L1_SELF", "FAR_52_204_21"],
    informationType: "FCI",
    templateFamilyKey: "access-review-log",
  },

  {
    sourceTemplateId: "L1-LOG-002",
    title: "Monthly Malware Scan Log (FCI)",
    docType: "log",
    cmmcLevel: "L1",
    domainAbbr: "SI",
    ownerRole: "it_contributor",
    reviewFrequency: "monthly",
    description:
      "Monthly log documenting malware scan execution and results for FCI systems.",
    purpose:
      "Record the results of monthly malware scans on FCI systems as evidence of continuous integrity protection.",
    scope:
      "All workstations, servers, and endpoints at {{ORGANIZATION_NAME}} that process FCI.",
    bodyTemplate: `# Monthly Malware Scan Log (FCI)

**Organization:** {{ORGANIZATION_NAME}}
**Scan Period:** {{REVIEW_PERIOD}}
**Performed By:** {{SYSTEM_OWNER}}
**Scan Date:** {{SCAN_DATE}}
**Scan Tool:** {{SCAN_TOOL}}

---

## Anti-Malware Software Status

| System / Endpoint | Anti-Malware Software | Version | Definition Date | Real-Time Protection | Status |
|---|---|---|---|---|---|
| | | | | Enabled | ✓ |
| | | | | Enabled | ✓ |

## Scan Results

| System | Scan Type | Start Time | End Time | Threats Found | Action Taken |
|---|---|---|---|---|---|
| | Full | | | 0 | N/A |
| | Full | | | 0 | N/A |

## Threat Summary

**Total Threats Detected:** {{INCIDENT_COUNT}}
**Threats Quarantined:** 0
**Threats Remediated:** 0
**Systems Requiring Follow-Up:** 0

## Anomalies / Incidents

{{ANOMALIES_NOTED}}

## Reviewer Sign-Off

*Reviewer:* {{SYSTEM_OWNER}}
*Date:* {{SCAN_DATE}}`,
    requiredFields: [
      "ORGANIZATION_NAME",
      "REVIEW_PERIOD",
      "SYSTEM_OWNER",
      "SCAN_DATE",
    ],
    placeholders: [
      "ORGANIZATION_NAME",
      "REVIEW_PERIOD",
      "SYSTEM_OWNER",
      "SCAN_DATE",
      "SCAN_TOOL",
      "INCIDENT_COUNT",
      "ANOMALIES_NOTED",
    ],
    requiresApproval: false,
    isSystemTemplate: true,
    mappedL1Controls: ["3.14.2", "3.14.4", "3.14.5"],
    packageKeys: ["CMMC_L1_SELF", "FAR_52_204_21"],
    informationType: "FCI",
    templateFamilyKey: "malware-scan-log",
  },

  {
    sourceTemplateId: "L1-LOG-003",
    title: "Physical Access Log (FCI)",
    docType: "log",
    cmmcLevel: "L1",
    domainAbbr: "PE",
    ownerRole: "it_contributor",
    reviewFrequency: "monthly",
    description:
      "Running log of physical access to areas containing FCI systems, including visitor entries and exits.",
    purpose:
      "Maintain a record of all physical access to FCI system areas to support accountability and anomaly detection.",
    scope:
      "All controlled areas at {{ORGANIZATION_NAME}} that contain FCI processing systems.",
    bodyTemplate: `# Physical Access Log (FCI)

**Organization:** {{ORGANIZATION_NAME}}
**Location / Area:** {{SYSTEM_NAME}}
**Log Period:** {{REVIEW_PERIOD}}
**Log Custodian:** {{SYSTEM_OWNER}}

---

## Physical Access Entries

| Date | Time In | Time Out | Name | Affiliation | Badge/Key # | Purpose | Escort (if visitor) | Approved By |
|---|---|---|---|---|---|---|---|---|
| | | | | | | | | |
| | | | | | | | | |

## Monthly Review

**Review Date:** {{EFFECTIVE_DATE}}
**Reviewed By:** {{SYSTEM_OWNER}}

**Total Access Entries this Period:** ___
**Visitor Entries:** ___
**Anomalies Detected:** {{ANOMALIES_NOTED}}

## Anomaly Details

*(Describe any anomalies or unauthorized access attempts, or enter "None")*

---

*Log Custodian:* {{SYSTEM_OWNER}}
*Period End Review Date:* {{EFFECTIVE_DATE}}`,
    requiredFields: [
      "ORGANIZATION_NAME",
      "SYSTEM_NAME",
      "REVIEW_PERIOD",
      "SYSTEM_OWNER",
    ],
    placeholders: [
      "ORGANIZATION_NAME",
      "SYSTEM_NAME",
      "REVIEW_PERIOD",
      "SYSTEM_OWNER",
      "EFFECTIVE_DATE",
      "ANOMALIES_NOTED",
    ],
    requiresApproval: false,
    isSystemTemplate: true,
    mappedL1Controls: ["3.10.4", "3.10.3"],
    packageKeys: ["CMMC_L1_SELF", "FAR_52_204_21"],
    informationType: "FCI",
    templateFamilyKey: "physical-access-log",
  },

  // ── REGISTER (1) ──────────────────────────────────────────────────────────

  {
    sourceTemplateId: "L1-EVID-REG-001",
    title: "FCI Asset Register",
    docType: "asset_inventory",
    cmmcLevel: "L1",
    domainAbbr: "L1",
    ownerRole: "it_contributor",
    reviewFrequency: "quarterly",
    description:
      "Inventory register of all information systems and assets that store, process, or transmit Federal Contract Information (FCI).",
    purpose:
      "Identify and maintain an accurate inventory of all systems and assets in scope for CMMC Level 1 / FAR 52.204-21 compliance at {{ORGANIZATION_NAME}}.",
    scope:
      "All hardware, software, and cloud services at {{ORGANIZATION_NAME}} that process, store, or transmit FCI.",
    bodyTemplate: `# FCI Asset Register

**Organization:** {{ORGANIZATION_NAME}}
**System / Scope:** {{SYSTEM_NAME}}
**Register Owner:** {{SYSTEM_OWNER}}
**Last Updated:** {{EFFECTIVE_DATE}}
**Next Review Date:** {{REVIEW_DATE}}

---

## FCI System Inventory

| Asset ID | Asset Name / Description | Type | Owner | Location | FCI Data Stored? | Access Controls | Last Reviewed | Notes |
|---|---|---|---|---|---|---|---|---|
| | | Workstation | | | Yes | Local account + AD | | |
| | | Server | | | Yes | AD + MFA | | |
| | | Cloud Service | | | Yes | Cloud IAM | | |

## Asset Types Key

- **Workstation** — Laptop, desktop
- **Server** — On-premise or hosted server
- **Cloud Service** — SaaS, IaaS, PaaS applications
- **Network Device** — Firewall, router, switch
- **Removable Media** — USB drives, external hard drives
- **Physical Records** — Paper-based FCI documents

## Review Summary

**Total FCI Assets:** ___
**Assets Added Since Last Review:** ___
**Assets Decommissioned Since Last Review:** ___

## Register Attestation

I confirm that this register accurately reflects all information systems and assets that process, store, or transmit FCI for {{ORGANIZATION_NAME}} as of {{EFFECTIVE_DATE}}.

*Register Owner:* {{SYSTEM_OWNER}}
*Date:* {{EFFECTIVE_DATE}}
*Approved by:* {{APPROVER_NAME}}`,
    requiredFields: [
      "ORGANIZATION_NAME",
      "SYSTEM_NAME",
      "SYSTEM_OWNER",
      "EFFECTIVE_DATE",
      "REVIEW_DATE",
    ],
    placeholders: [
      "ORGANIZATION_NAME",
      "SYSTEM_NAME",
      "SYSTEM_OWNER",
      "EFFECTIVE_DATE",
      "REVIEW_DATE",
      "APPROVER_NAME",
    ],
    requiresApproval: true,
    isSystemTemplate: true,
    mappedL1Controls: ["3.1.1"],
    packageKeys: ["CMMC_L1_SELF", "FAR_52_204_21"],
    informationType: "FCI",
    templateFamilyKey: "fci-asset-register",
  },
];
