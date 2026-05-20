export interface RoadmapSeedAction {
  id: string;
  title: string;
  category: string;
  phase: number;
  phaseName: string;
  priority: "critical" | "high" | "medium" | "low";
  effort: "low" | "medium" | "high";
  impactScore: number;
  purpose: string;
  whyItMatters: string;
  operatingProcedure: string;
  testProcedure: string;
  sortOrder: number;
  controls: Array<{
    controlId: string;
    supportType:
      | "full_support"
      | "partial_support"
      | "evidence_only"
      | "doc_only"
      | "monitoring_only";
  }>;
  evidenceItems: Array<{
    title: string;
    evidenceType: string;
    suggestedFilename: string;
    sourceSystem: string;
    mustShow: string;
  }>;
  documents: Array<{ title: string; docType: string }>;
  checklistItems: string[];
}

export const ROADMAP_SEED: RoadmapSeedAction[] = [
  // ── A. SSP Baseline ─────────────────────────────────────────────────────────
  {
    id: "rm-0001-0000-0000-0000-000000000001",
    title: "Define Assessment Scope and SSP Baseline",
    category: "Foundation",
    phase: 1,
    phaseName: "Foundation",
    priority: "critical",
    effort: "high",
    impactScore: 38,
    sortOrder: 1,
    purpose:
      "Establish the boundaries of your CMMC assessment, document all systems that process CUI, and create the System Security Plan (SSP) baseline. This is the foundational document that assessors review first.",
    whyItMatters:
      "Without a defined scope and SSP, every other compliance activity lacks a traceable anchor. Assessors expect to see a documented system boundary, CUI data flow, asset inventory, and SSP narratives for all applicable controls before anything else. Completing this early maximizes the value of every subsequent action.",
    operatingProcedure:
      "1. Identify all systems, services, and people that touch CUI (process, store, or transmit).\n2. Define the system boundary — what is in scope, what is explicitly out of scope.\n3. Document a CUI data flow diagram showing how CUI enters, moves through, and exits the system.\n4. Build an asset inventory listing all hardware, software, and cloud services in scope.\n5. List all external providers (cloud, SaaS, IT support) and note their CMMC/FedRAMP status.\n6. Draft SSP narratives for each CMMC L2 control, stating how the control is implemented.\n7. Have the SSP reviewed and approved by the system owner and ISSO.\n8. Upload the SSP and supporting documents to the Documents module.",
    testProcedure:
      "1. Confirm the system boundary document exists and is approved.\n2. Verify the CUI data flow diagram covers all entry, transit, and exit points.\n3. Confirm the asset inventory includes hardware, software, and cloud services.\n4. Review at least 5 SSP control narratives to verify they are specific, not boilerplate.\n5. Confirm all external providers are listed with their compliance status noted.",
    controls: [
      { controlId: "CA.L2-3.12.4", supportType: "full_support" },
      { controlId: "CA.L2-3.12.1", supportType: "partial_support" },
      { controlId: "CA.L2-3.12.3", supportType: "partial_support" },
      { controlId: "RA.L2-3.11.1", supportType: "partial_support" },
    ],
    evidenceItems: [
      {
        title: "System Security Plan (SSP)",
        evidenceType: "Document",
        suggestedFilename: "SSP-System-Security-Plan-YYYY-MM-DD.docx",
        sourceSystem: "Organization-maintained",
        mustShow:
          "System boundary, CUI scope, control implementation narratives, approval signatures",
      },
      {
        title: "Asset Inventory",
        evidenceType: "Spreadsheet",
        suggestedFilename: "Asset-Inventory-YYYY-MM-DD.xlsx",
        sourceSystem: "IT asset management / manual",
        mustShow:
          "Hardware, software, cloud services, IP addresses, owner, in/out of scope designation",
      },
      {
        title: "CUI Data Flow Diagram",
        evidenceType: "Diagram",
        suggestedFilename: "CUI-Data-Flow-Diagram-YYYY-MM-DD.png",
        sourceSystem: "Visio / draw.io / manual",
        mustShow:
          "CUI entry points, transmission paths, storage locations, exit points, external connections",
      },
      {
        title: "External Provider List",
        evidenceType: "Document",
        suggestedFilename: "External-Providers-List-YYYY-MM-DD.xlsx",
        sourceSystem: "Organization-maintained",
        mustShow:
          "Provider name, service type, data handled, CMMC/FedRAMP status, contract reference",
      },
    ],
    documents: [
      { title: "System Security Plan (SSP)", docType: "policy" },
      { title: "Assessment Scope Statement", docType: "procedure" },
      { title: "Asset Inventory", docType: "record" },
      { title: "CUI Data Flow Documentation", docType: "record" },
    ],
    checklistItems: [
      "System boundary and scope document created",
      "CUI data flow diagram completed",
      "Asset inventory compiled and current",
      "External provider list documented with CMMC status",
      "SSP drafted with control narratives for all 110 controls",
      "SSP reviewed and approved by system owner",
      "SSP uploaded to Documents module",
      "Evidence uploaded and linked to CA.L2-3.12.4",
      "POA&M created for any gaps identified during scoping",
    ],
  },

  // ── B. User Access Review ────────────────────────────────────────────────────
  {
    id: "rm-0002-0000-0000-0000-000000000002",
    title: "Perform User and Access Review",
    category: "Identity and Access",
    phase: 2,
    phaseName: "Identity and Access",
    priority: "critical",
    effort: "medium",
    impactScore: 49,
    sortOrder: 2,
    purpose:
      "Review all user accounts and access rights to ensure only authorized individuals have access to CUI systems. Identify and remove stale accounts, excess privileges, and unauthorized access.",
    whyItMatters:
      "Unauthorized or excessive access is one of the most common audit findings and a leading cause of breaches. This single action supports 11 controls across AC and IA domains. Completing this early demonstrates active identity governance and produces high-quality evidence for multiple controls simultaneously.",
    operatingProcedure:
      "1. Export all user accounts from Microsoft 365 / Entra ID (including service accounts and shared mailboxes).\n2. Export all privileged role assignments (Global Admin, Security Admin, Compliance Admin, etc.).\n3. Cross-reference account list with HR active employee roster.\n4. Identify stale accounts (no login >30 days), accounts for terminated employees, and shared accounts.\n5. Disable or delete stale/unauthorized accounts. Document actions taken.\n6. Review privileged role assignments — verify each is justified, least-privilege, and approved.\n7. Remove unnecessary privileged roles.\n8. Document the review in an Access Review Worksheet (who reviewed, date, findings, actions).\n9. Obtain sign-off from IT manager or ISSO.\n10. Upload all evidence to the Evidence module and link to AC and IA controls.",
    testProcedure:
      "1. Pull a fresh account export and verify no accounts terminated employees remain active.\n2. Verify privileged role count is documented and justified.\n3. Confirm at least one disabled account is shown in the evidence (demonstrating remediation occurred).\n4. Verify the access review worksheet shows date, reviewer name, and sign-off.\n5. Spot-check 3 user accounts to confirm they match HR roster.",
    controls: [
      { controlId: "AC.L1-3.1.1", supportType: "full_support" },
      { controlId: "AC.L1-3.1.2", supportType: "full_support" },
      { controlId: "AC.L2-3.1.5", supportType: "full_support" },
      { controlId: "AC.L2-3.1.6", supportType: "full_support" },
      { controlId: "AC.L2-3.1.7", supportType: "full_support" },
      { controlId: "AC.L2-3.1.8", supportType: "partial_support" },
      { controlId: "IA.L1-3.5.1", supportType: "full_support" },
      { controlId: "IA.L1-3.5.2", supportType: "partial_support" },
      { controlId: "IA.L2-3.5.5", supportType: "full_support" },
      { controlId: "IA.L2-3.5.6", supportType: "full_support" },
      { controlId: "CA.L2-3.12.3", supportType: "evidence_only" },
    ],
    evidenceItems: [
      {
        title: "User Account Export",
        evidenceType: "Spreadsheet",
        suggestedFilename: "AC-User-Account-Export-YYYY-MM-DD.xlsx",
        sourceSystem: "Microsoft 365 Admin Center / Entra ID",
        mustShow:
          "All accounts, last sign-in date, account status (enabled/disabled), account type",
      },
      {
        title: "Privileged Role Export",
        evidenceType: "Spreadsheet",
        suggestedFilename: "AC-Privileged-Role-Export-YYYY-MM-DD.xlsx",
        sourceSystem: "Entra ID > Roles and administrators",
        mustShow:
          "Role name, assigned users, assignment type (permanent/eligible), justification",
      },
      {
        title: "Access Review Worksheet",
        evidenceType: "Document",
        suggestedFilename: "AC-Access-Review-Worksheet-YYYY-MM-DD.xlsx",
        sourceSystem: "Organization-maintained",
        mustShow:
          "Review date, reviewer name, accounts reviewed, findings, actions taken, sign-off",
      },
      {
        title: "Disabled / Stale Account Evidence",
        evidenceType: "Screenshot",
        suggestedFilename: "AC-Stale-Accounts-Disabled-YYYY-MM-DD.png",
        sourceSystem: "Microsoft 365 Admin Center",
        mustShow: "Accounts disabled during review with timestamps",
      },
      {
        title: "Access Approval Records",
        evidenceType: "Document",
        suggestedFilename: "AC-Access-Approval-Records-YYYY-MM-DD.pdf",
        sourceSystem: "IT ticketing system / email / manual",
        mustShow:
          "Approval request, approver name, date, access granted or denied",
      },
    ],
    documents: [
      { title: "Access Control Policy", docType: "policy" },
      { title: "Account Management Procedure", docType: "procedure" },
      { title: "Access Review Log", docType: "record" },
      { title: "Access Approval Record", docType: "record" },
    ],
    checklistItems: [
      "User account export completed",
      "Privileged role export completed",
      "Cross-reference with HR roster completed",
      "Stale and unauthorized accounts identified",
      "Stale accounts disabled or deleted with documentation",
      "Privileged roles reviewed and excess removed",
      "Access review worksheet completed with sign-off",
      "Evidence uploaded and linked to AC and IA controls",
      "Access Control Policy reviewed/updated",
      "Test procedure performed and passed",
      "Exceptions documented in POA&M if applicable",
    ],
  },

  // ── C. MFA / Conditional Access ─────────────────────────────────────────────
  {
    id: "rm-0003-0000-0000-0000-000000000003",
    title: "Configure MFA and Conditional Access Baseline",
    category: "Identity Security",
    phase: 2,
    phaseName: "Identity and Access",
    priority: "critical",
    effort: "medium",
    impactScore: 33,
    sortOrder: 3,
    purpose:
      "Enforce multi-factor authentication for all users accessing CUI systems and configure Conditional Access policies to block legacy authentication, restrict remote access, and enforce compliant device requirements.",
    whyItMatters:
      "Password-only authentication is insufficient for CUI access. MFA is required by CMMC L2 and is one of the highest-impact security controls. Conditional Access policies control the conditions under which access is granted, directly supporting remote access and session controls. This action supports 7 controls across IA and AC domains.",
    operatingProcedure:
      "1. Navigate to Entra ID > Security > Authentication methods > Policies.\n2. Enable Microsoft Authenticator for all users. Disable SMS/voice if possible.\n3. Create a Conditional Access policy requiring MFA for all users on all cloud apps.\n4. Create a Conditional Access policy blocking legacy authentication protocols (Exchange ActiveSync, Basic Auth).\n5. Create a Conditional Access policy requiring compliant or Entra hybrid-joined devices for CUI access.\n6. Create a Conditional Access policy for remote access (require MFA + compliant device).\n7. Export sign-in logs and verify MFA is being enforced (look for MFA success entries).\n8. Document all Conditional Access policies with their purpose and scope.\n9. Test by signing in as a test user and verifying MFA prompt appears.",
    testProcedure:
      "1. Sign in with a test account and confirm MFA prompt appears.\n2. Attempt to sign in using a legacy authentication client (e.g., basic auth) — verify it is blocked.\n3. Verify the Conditional Access policies are in Report-only or Enabled state (not just created).\n4. Review sign-in logs to confirm MFA enforcement entries exist.\n5. Verify at least one legacy auth block event appears in sign-in logs.",
    controls: [
      { controlId: "IA.L1-3.5.2", supportType: "partial_support" },
      { controlId: "IA.L2-3.5.3", supportType: "full_support" },
      { controlId: "IA.L2-3.5.4", supportType: "partial_support" },
      { controlId: "AC.L2-3.1.8", supportType: "partial_support" },
      { controlId: "AC.L2-3.1.12", supportType: "full_support" },
      { controlId: "AC.L2-3.1.13", supportType: "full_support" },
      { controlId: "AC.L2-3.1.14", supportType: "partial_support" },
    ],
    evidenceItems: [
      {
        title: "MFA Policy Configuration Screenshot",
        evidenceType: "Screenshot",
        suggestedFilename: "IA-MFA-Policy-Config-YYYY-MM-DD.png",
        sourceSystem: "Entra ID > Authentication methods",
        mustShow:
          "Microsoft Authenticator enabled, MFA required for all users, policy state: Enabled",
      },
      {
        title: "Conditional Access Policy Screenshots",
        evidenceType: "Screenshot",
        suggestedFilename: "AC-Conditional-Access-Policies-YYYY-MM-DD.png",
        sourceSystem: "Entra ID > Security > Conditional Access",
        mustShow:
          "All CA policies listed with state (Enabled), assignments (users/apps), and grant controls",
      },
      {
        title: "Sign-In Log MFA Validation",
        evidenceType: "Spreadsheet",
        suggestedFilename: "IA-Sign-In-Log-MFA-Evidence-YYYY-MM-DD.xlsx",
        sourceSystem: "Entra ID > Sign-in logs",
        mustShow:
          "User sign-ins showing MFA satisfied, date/time, app, success status",
      },
      {
        title: "Legacy Authentication Block Evidence",
        evidenceType: "Screenshot",
        suggestedFilename: "IA-Legacy-Auth-Block-Evidence-YYYY-MM-DD.png",
        sourceSystem: "Entra ID > Sign-in logs filtered by client app",
        mustShow:
          "Blocked legacy auth attempts or policy confirming legacy auth is blocked",
      },
    ],
    documents: [
      {
        title: "Identification and Authentication Policy",
        docType: "policy",
      },
      { title: "Remote Access Procedure", docType: "procedure" },
      { title: "MFA Enrollment Procedure", docType: "procedure" },
    ],
    checklistItems: [
      "Microsoft Authenticator enabled for all users",
      "Conditional Access policy requiring MFA created and enabled",
      "Legacy authentication blocked via Conditional Access",
      "Compliant device requirement configured",
      "Remote access MFA policy configured",
      "MFA enforcement validated via sign-in logs",
      "Evidence screenshots captured and uploaded",
      "Identification and Authentication Policy updated",
      "Test procedure performed and passed",
    ],
  },

  // ── D. Endpoint Compliance ───────────────────────────────────────────────────
  {
    id: "rm-0004-0000-0000-0000-000000000004",
    title: "Configure Endpoint Compliance and Device Management",
    category: "Endpoint Security",
    phase: 3,
    phaseName: "Endpoint and System Security",
    priority: "high",
    effort: "high",
    impactScore: 50,
    sortOrder: 4,
    purpose:
      "Enroll all devices into Microsoft Intune, configure compliance policies, deploy security baselines, enable encryption, configure antivirus, and enforce patch management to establish a known-good endpoint posture.",
    whyItMatters:
      "Endpoints are the most common attack surface. Without managed, compliant devices, you cannot enforce configuration baselines, encryption, or patch status. This action supports 12 controls across CM, AC, SI, and IA domains — the largest control coverage of any single action.",
    operatingProcedure:
      "1. Enroll all Windows devices in Microsoft Intune (via Entra join or hybrid join).\n2. Create a device compliance policy requiring: BitLocker enabled, antivirus active, firewall on, OS patched within 30 days, TPM present.\n3. Deploy the Microsoft Security Baseline via Intune configuration profile.\n4. Enable Microsoft Defender Antivirus with real-time protection and cloud-delivered protection.\n5. Configure automatic OS updates and verify patch deployment via Intune.\n6. Enable BitLocker disk encryption on all Windows devices.\n7. Create a device inventory report from Intune showing all enrolled devices and compliance status.\n8. Configure Intune compliance policy to mark non-compliant devices as blocked from Conditional Access.\n9. Export device compliance report and antivirus status report.\n10. Document the configuration baseline and approval.",
    testProcedure:
      "1. Pull device compliance report from Intune — verify all devices show compliant or identify exceptions.\n2. Verify BitLocker is enabled on at least 3 test devices.\n3. Verify Microsoft Defender real-time protection is active on all enrolled devices.\n4. Verify latest Windows update is deployed within the last 30 days.\n5. Attempt to sign into M365 from a non-compliant device — verify Conditional Access blocks access.\n6. Verify the security baseline configuration profile shows as applied in Intune.",
    controls: [
      { controlId: "CM.L2-3.4.1", supportType: "full_support" },
      { controlId: "CM.L2-3.4.2", supportType: "full_support" },
      { controlId: "CM.L2-3.4.6", supportType: "full_support" },
      { controlId: "CM.L2-3.4.7", supportType: "full_support" },
      { controlId: "CM.L2-3.4.9", supportType: "partial_support" },
      { controlId: "IA.L1-3.5.1", supportType: "evidence_only" },
      { controlId: "AC.L2-3.1.18", supportType: "full_support" },
      { controlId: "AC.L2-3.1.19", supportType: "partial_support" },
      { controlId: "SI.L1-3.14.1", supportType: "full_support" },
      { controlId: "SI.L1-3.14.2", supportType: "full_support" },
      { controlId: "SI.L1-3.14.4", supportType: "full_support" },
      { controlId: "SI.L1-3.14.5", supportType: "partial_support" },
    ],
    evidenceItems: [
      {
        title: "Device Compliance Report",
        evidenceType: "Spreadsheet",
        suggestedFilename: "CM-Device-Compliance-Report-YYYY-MM-DD.xlsx",
        sourceSystem: "Microsoft Intune Admin Center > Reports",
        mustShow:
          "Device name, user, OS version, compliance status, last check-in, policy applied",
      },
      {
        title: "Device Inventory Export",
        evidenceType: "Spreadsheet",
        suggestedFilename: "CM-Device-Inventory-YYYY-MM-DD.xlsx",
        sourceSystem: "Microsoft Intune Admin Center > Devices",
        mustShow:
          "All enrolled devices, OS, serial number, enrollment date, compliance state",
      },
      {
        title: "Security Baseline Configuration Screenshot",
        evidenceType: "Screenshot",
        suggestedFilename: "CM-Security-Baseline-Config-YYYY-MM-DD.png",
        sourceSystem: "Microsoft Intune > Endpoint Security > Security baselines",
        mustShow:
          "Security baseline profile name, assigned groups, state (Success/Applied)",
      },
      {
        title: "BitLocker Encryption Evidence",
        evidenceType: "Screenshot",
        suggestedFilename: "CM-BitLocker-Encryption-Evidence-YYYY-MM-DD.png",
        sourceSystem:
          "Microsoft Intune > Devices > Encryption report or device details",
        mustShow:
          "BitLocker enabled status per device, encryption method, recovery key stored",
      },
      {
        title: "Antivirus/Defender Status Report",
        evidenceType: "Screenshot",
        suggestedFilename: "SI-Antivirus-Status-Report-YYYY-MM-DD.png",
        sourceSystem:
          "Microsoft Defender > Reports > Antivirus or Intune Antivirus report",
        mustShow:
          "Defender active on all devices, real-time protection on, signature version current",
      },
      {
        title: "Patch Compliance Report",
        evidenceType: "Spreadsheet",
        suggestedFilename: "CM-Patch-Compliance-Report-YYYY-MM-DD.xlsx",
        sourceSystem: "Intune > Reports > Windows Update",
        mustShow: "Patch status per device, last update date, compliance percentage",
      },
    ],
    documents: [
      { title: "Configuration Management Policy", docType: "policy" },
      { title: "Endpoint Security Baseline Procedure", docType: "procedure" },
      { title: "Device Compliance Procedure", docType: "procedure" },
    ],
    checklistItems: [
      "All devices enrolled in Microsoft Intune",
      "Device compliance policy created and assigned",
      "Microsoft Security Baseline deployed",
      "BitLocker encryption enabled on all devices",
      "Microsoft Defender Antivirus active on all devices",
      "Automatic patch updates configured",
      "Device compliance report exported and reviewed",
      "Non-compliant devices blocked via Conditional Access",
      "Evidence uploaded and linked to CM, AC, SI controls",
      "Configuration Management Policy updated",
      "Exceptions documented in POA&M",
    ],
  },

  // ── E. Logging / Audit Review ────────────────────────────────────────────────
  {
    id: "rm-0005-0000-0000-0000-000000000005",
    title: "Configure Logging and Audit Review",
    category: "Audit and Accountability",
    phase: 4,
    phaseName: "Logging and Monitoring",
    priority: "high",
    effort: "medium",
    impactScore: 47,
    sortOrder: 5,
    purpose:
      "Configure unified audit logging across Microsoft 365 and Azure, establish log retention of at least 90 days (1 year recommended), and perform and document a formal audit log review.",
    whyItMatters:
      "Audit logging is foundational to detecting, investigating, and recovering from security incidents. CMMC requires you to define what is audited, protect logs, retain them appropriately, and review them. This action supports 11 controls across the AU domain and enables detection capabilities required by SI and CA controls.",
    operatingProcedure:
      "1. Enable Microsoft 365 Unified Audit Log: Compliance Center > Audit > Start recording.\n2. Configure audit log retention: Compliance Center > Audit > Retention policies — set to 1 year.\n3. Enable advanced audit features: Compliance Center > Audit > enable MailItemsAccessed, Send, etc.\n4. Configure Microsoft Sentinel or Defender alerting for critical events (failed logins, admin changes, data access).\n5. Enable Entra ID sign-in and audit logs export to Log Analytics or storage account.\n6. Configure log review schedule: assign reviewer, establish frequency (weekly minimum).\n7. Perform a log review: export last 30 days of audit activity, review for anomalies.\n8. Document review findings in a Log Review Record (date, reviewer, events examined, findings, actions).\n9. Test alert rules — confirm at least 2 alerts fire correctly during testing.",
    testProcedure:
      "1. Navigate to Compliance Center > Audit — verify audit logging is On.\n2. Query audit logs for the last 7 days — confirm events are being recorded.\n3. Verify log retention policy shows at least 90 days (1 year preferred).\n4. Confirm log review record exists for the current period.\n5. Trigger a test alert (e.g., simulate a failed login) and confirm alert fires.\n6. Export 30-day sign-in log from Entra ID — verify it contains data.",
    controls: [
      { controlId: "AU.L2-3.3.1", supportType: "full_support" },
      { controlId: "AU.L2-3.3.2", supportType: "full_support" },
      { controlId: "AU.L2-3.3.3", supportType: "full_support" },
      { controlId: "AU.L2-3.3.4", supportType: "full_support" },
      { controlId: "AU.L2-3.3.5", supportType: "full_support" },
      { controlId: "AU.L2-3.3.6", supportType: "partial_support" },
      { controlId: "AU.L2-3.3.7", supportType: "full_support" },
      { controlId: "AU.L2-3.3.8", supportType: "full_support" },
      { controlId: "AU.L2-3.3.9", supportType: "partial_support" },
      { controlId: "SI.L2-3.14.6", supportType: "partial_support" },
      { controlId: "CA.L2-3.12.3", supportType: "evidence_only" },
    ],
    evidenceItems: [
      {
        title: "Audit Logging Configuration Screenshot",
        evidenceType: "Screenshot",
        suggestedFilename: "AU-Audit-Log-Config-YYYY-MM-DD.png",
        sourceSystem: "Microsoft Compliance Center > Audit",
        mustShow: "Audit logging status On, retention policy, advanced audit settings",
      },
      {
        title: "Log Review Export",
        evidenceType: "Spreadsheet",
        suggestedFilename: "AU-Log-Review-Export-YYYY-MM-DD.xlsx",
        sourceSystem: "Compliance Center > Audit > Search export",
        mustShow:
          "Date range, event types reviewed, user activities, anomalies noted",
      },
      {
        title: "Log Retention Policy Evidence",
        evidenceType: "Screenshot",
        suggestedFilename: "AU-Log-Retention-Policy-YYYY-MM-DD.png",
        sourceSystem: "Compliance Center > Audit > Retention policies",
        mustShow: "Retention duration (90+ days), scope, policy name and status",
      },
      {
        title: "Alert Configuration Evidence",
        evidenceType: "Screenshot",
        suggestedFilename: "AU-Alert-Config-Evidence-YYYY-MM-DD.png",
        sourceSystem: "Microsoft Sentinel / Defender > Alert rules",
        mustShow: "Alert rule names, triggers, severity, enabled status",
      },
      {
        title: "Audit Log Review Record",
        evidenceType: "Document",
        suggestedFilename: "AU-Log-Review-Record-YYYY-MM-DD.docx",
        sourceSystem: "Organization-maintained",
        mustShow: "Review date, reviewer, scope, findings, actions taken, sign-off",
      },
    ],
    documents: [
      { title: "Audit and Accountability Policy", docType: "policy" },
      { title: "Log Review Procedure", docType: "procedure" },
      { title: "Audit Log Review Record", docType: "record" },
    ],
    checklistItems: [
      "Microsoft 365 Unified Audit Log enabled",
      "Audit log retention set to 90+ days (1 year preferred)",
      "Advanced audit events enabled",
      "Alert rules configured for critical events",
      "Entra ID sign-in logs export configured",
      "Log review performed and documented",
      "Log Review Record completed with sign-off",
      "Evidence uploaded and linked to AU controls",
      "Audit and Accountability Policy updated",
      "Test procedure performed and passed",
    ],
  },

  // ── F. Vulnerability / Patch ─────────────────────────────────────────────────
  {
    id: "rm-0006-0000-0000-0000-000000000006",
    title: "Review Vulnerabilities and Patch Compliance",
    category: "Vulnerability Management",
    phase: 5,
    phaseName: "Risk and Remediation",
    priority: "high",
    effort: "medium",
    impactScore: 29,
    sortOrder: 6,
    purpose:
      "Perform a vulnerability scan of all in-scope systems, review patch compliance status, remediate critical and high vulnerabilities, and document findings in a risk register or POA&M.",
    whyItMatters:
      "Unpatched systems and known vulnerabilities are the most exploited attack vector. CMMC requires periodic scanning and remediation. This action directly supports 5 controls in RA, SI, and CA domains. Producing a vulnerability report with remediation evidence is one of the most important deliverables for an assessment.",
    operatingProcedure:
      "1. Run Microsoft Defender Vulnerability Management report or a third-party scanner (Tenable, Qualys) against all in-scope systems.\n2. Export the vulnerability report — categorize by severity (Critical, High, Medium, Low).\n3. Run Windows Update compliance report from Intune — identify devices with overdue patches.\n4. Prioritize Critical and High vulnerabilities for immediate remediation.\n5. Remediate top vulnerabilities — apply patches, update configurations, or document exceptions.\n6. For exceptions that cannot be remediated immediately, create POA&M entries with milestones.\n7. Re-run scan after remediation to produce before/after evidence.\n8. Document all findings and remediations in the risk register.\n9. Have risk register reviewed and signed off by ISSO/system owner.",
    testProcedure:
      "1. Confirm vulnerability scan was performed within the last 30 days (or per policy).\n2. Verify Critical and High vulnerabilities have corresponding remediation evidence or POA&M entries.\n3. Confirm patch compliance report shows 90%+ of devices patched.\n4. Verify the risk register is current and approved.\n5. Confirm re-scan evidence exists showing remediation was effective.",
    controls: [
      { controlId: "RA.L2-3.11.2", supportType: "full_support" },
      { controlId: "RA.L2-3.11.3", supportType: "full_support" },
      { controlId: "SI.L1-3.14.1", supportType: "evidence_only" },
      { controlId: "SI.L2-3.14.3", supportType: "full_support" },
      { controlId: "CA.L2-3.12.3", supportType: "evidence_only" },
    ],
    evidenceItems: [
      {
        title: "Vulnerability Scan Report",
        evidenceType: "Spreadsheet",
        suggestedFilename: "RA-Vulnerability-Scan-Report-YYYY-MM-DD.xlsx",
        sourceSystem: "Defender Vulnerability Management / Tenable / Qualys",
        mustShow:
          "CVE IDs, severity, affected systems, first detected date, remediation status",
      },
      {
        title: "Patch Compliance Report",
        evidenceType: "Spreadsheet",
        suggestedFilename: "RA-Patch-Compliance-Report-YYYY-MM-DD.xlsx",
        sourceSystem: "Microsoft Intune > Reports > Windows Update",
        mustShow:
          "Device name, pending updates, compliance status, last scan date",
      },
      {
        title: "Remediation Tickets",
        evidenceType: "Document",
        suggestedFilename: "RA-Remediation-Tickets-YYYY-MM-DD.pdf",
        sourceSystem: "IT ticketing system",
        mustShow:
          "Ticket ID, vulnerability addressed, remediation action, completion date",
      },
      {
        title: "Exception / Risk Acceptance Records",
        evidenceType: "Document",
        suggestedFilename: "RA-Exception-Approvals-YYYY-MM-DD.pdf",
        sourceSystem: "Organization-maintained",
        mustShow:
          "Vulnerability, justification for exception, risk acceptance by management, review date",
      },
      {
        title: "Before/After Remediation Evidence",
        evidenceType: "Screenshot",
        suggestedFilename: "RA-Remediation-Before-After-YYYY-MM-DD.png",
        sourceSystem: "Vulnerability scanner",
        mustShow:
          "Pre-remediation scan showing vulnerability, post-remediation scan showing it is resolved",
      },
    ],
    documents: [
      { title: "Risk Assessment Policy", docType: "policy" },
      { title: "Vulnerability Management Procedure", docType: "procedure" },
      { title: "Patch Management Procedure", docType: "procedure" },
    ],
    checklistItems: [
      "Vulnerability scan performed on all in-scope systems",
      "Vulnerability report exported and categorized by severity",
      "Patch compliance report reviewed",
      "Critical and High vulnerabilities remediated or POA&M created",
      "Exception/risk acceptance documented and approved",
      "Re-scan performed to confirm remediation",
      "Risk register updated",
      "Evidence uploaded and linked to RA and SI controls",
      "Vulnerability Management Policy reviewed",
      "Test procedure performed and passed",
    ],
  },

  // ── G. Firewall Review ───────────────────────────────────────────────────────
  {
    id: "rm-0007-0000-0000-0000-000000000007",
    title: "Review Firewall and External Connections",
    category: "Network Security",
    phase: 3,
    phaseName: "Endpoint and System Security",
    priority: "high",
    effort: "medium",
    impactScore: 32,
    sortOrder: 7,
    purpose:
      "Review all firewall rules, document approved external connections, remove unauthorized rules, and produce a network diagram showing the system boundary and all external communication paths.",
    whyItMatters:
      "Uncontrolled network traffic is a direct path for attackers. CMMC requires you to monitor, control, and document communications at system boundaries. A firewall rule review produces evidence for multiple SC controls and directly supports the system boundary documentation in the SSP.",
    operatingProcedure:
      "1. Export all firewall rules from perimeter firewall(s) and any internal firewalls.\n2. Review each rule for: business justification, owner, last review date, least-privilege principle.\n3. Identify and remove any rules with no owner, broad 'ANY' source/destination without justification, or for terminated projects.\n4. Document all approved external connections: vendor VPNs, cloud provider links, SaaS integrations.\n5. Update or create a network diagram showing all external connection points.\n6. Verify Windows Firewall is enabled on all endpoints (via Intune or Group Policy).\n7. Document the review process and approvals.\n8. Export the approved rule matrix and external connection list.\n9. Have network team or ISSO sign off on the reviewed rule set.",
    testProcedure:
      "1. Verify firewall rule export exists and review date is within policy.\n2. Confirm there are no rules flagged as 'no justification' remaining after remediation.\n3. Verify external connection list accounts for all known vendor/cloud connections.\n4. Verify Windows Firewall is enabled on test devices (Intune compliance report).\n5. Test that inbound traffic on unauthorized ports is blocked (e.g., port scan from outside).",
    controls: [
      { controlId: "AC.L1-3.1.20", supportType: "full_support" },
      { controlId: "SC.L1-3.13.1", supportType: "full_support" },
      { controlId: "SC.L2-3.13.6", supportType: "full_support" },
      { controlId: "SC.L2-3.13.7", supportType: "partial_support" },
      { controlId: "SC.L2-3.13.8", supportType: "evidence_only" },
      { controlId: "SC.L2-3.13.15", supportType: "partial_support" },
    ],
    evidenceItems: [
      {
        title: "Firewall Rule Export",
        evidenceType: "Spreadsheet",
        suggestedFilename: "SC-Firewall-Rules-Export-YYYY-MM-DD.xlsx",
        sourceSystem: "Firewall management console",
        mustShow:
          "Rule name, source, destination, port/protocol, action, owner, business justification, last review",
      },
      {
        title: "External Connection List",
        evidenceType: "Document",
        suggestedFilename: "SC-External-Connection-List-YYYY-MM-DD.xlsx",
        sourceSystem: "Organization-maintained",
        mustShow:
          "Connection name, provider, purpose, IP/hostname, protocol, approval record",
      },
      {
        title: "Approved Rule Matrix",
        evidenceType: "Document",
        suggestedFilename: "SC-Approved-Rule-Matrix-YYYY-MM-DD.xlsx",
        sourceSystem: "Organization-maintained",
        mustShow:
          "All approved rules with justification, approver, and approval date",
      },
      {
        title: "Network Diagram",
        evidenceType: "Diagram",
        suggestedFilename: "SC-Network-Diagram-YYYY-MM-DD.png",
        sourceSystem: "Visio / draw.io",
        mustShow:
          "System boundary, internal segments, external connections, CUI zones, firewall positions",
      },
      {
        title: "Change Approval Records",
        evidenceType: "Document",
        suggestedFilename: "SC-Firewall-Change-Approvals-YYYY-MM-DD.pdf",
        sourceSystem: "IT change management system",
        mustShow: "Change request, approver, date, rules modified",
      },
    ],
    documents: [
      {
        title: "System and Communications Protection Policy",
        docType: "policy",
      },
      { title: "Firewall Review Procedure", docType: "procedure" },
      { title: "External Connection Approval Record", docType: "record" },
    ],
    checklistItems: [
      "Firewall rule export completed",
      "Rules reviewed for business justification",
      "Unauthorized or expired rules removed",
      "External connections documented and approved",
      "Network diagram updated",
      "Windows Firewall enforcement verified on endpoints",
      "Rule review signed off by ISSO",
      "Evidence uploaded and linked to SC controls",
      "Communications Protection Policy reviewed",
      "Test procedure performed and passed",
    ],
  },

  // ── H. Backup Verification ───────────────────────────────────────────────────
  {
    id: "rm-0008-0000-0000-0000-000000000008",
    title: "Perform Backup Verification",
    category: "Backup and Media Protection",
    phase: 3,
    phaseName: "Endpoint and System Security",
    priority: "medium",
    effort: "low",
    impactScore: 22,
    sortOrder: 8,
    purpose:
      "Verify that all CUI systems have active, tested backups. Confirm backup encryption, offsite/cloud storage, access controls, and perform a restoration test to validate recoverability.",
    whyItMatters:
      "Without tested backups, a ransomware attack or hardware failure could permanently destroy CUI and cripple operations. CMMC requires backup and recovery capabilities. A restore test is the only way to prove backups actually work. This action supports 3 controls and requires minimal technical effort.",
    operatingProcedure:
      "1. Identify all CUI-bearing systems that require backup coverage.\n2. Review current backup job configuration — verify all systems are covered, backup frequency, and retention.\n3. Verify backups are stored offsite or in a geographically separate cloud region.\n4. Verify backup data is encrypted at rest and in transit.\n5. Verify access to backup systems is restricted (not publicly accessible, limited to backup admins).\n6. Perform a restoration test — restore a recent backup to a test environment or verify file-level restore works.\n7. Document the restore test: date, system tested, data restored, result, and who performed it.\n8. Review backup failure alerts — ensure someone is notified on backup failure.\n9. Upload backup verification evidence.",
    testProcedure:
      "1. Review backup job report — confirm all systems have a successful backup within the required frequency.\n2. Verify backup storage is encrypted — check encryption settings in backup solution.\n3. Verify backup storage is not on the same system/location as the source data.\n4. Confirm restore test was performed and documented within the last 90 days.\n5. Verify backup failure alerts are configured and tested.",
    controls: [
      { controlId: "MP.L2-3.8.9", supportType: "full_support" },
      { controlId: "SC.L2-3.13.16", supportType: "full_support" },
      { controlId: "CA.L2-3.12.3", supportType: "evidence_only" },
    ],
    evidenceItems: [
      {
        title: "Backup Job Status Report",
        evidenceType: "Screenshot",
        suggestedFilename: "MP-Backup-Job-Status-YYYY-MM-DD.png",
        sourceSystem: "Backup solution dashboard (Veeam, Azure Backup, etc.)",
        mustShow:
          "Backup jobs, systems covered, last backup date, success/failure status, retention settings",
      },
      {
        title: "Restore Test Result",
        evidenceType: "Document",
        suggestedFilename: "MP-Restore-Test-Result-YYYY-MM-DD.docx",
        sourceSystem: "Organization-maintained",
        mustShow:
          "System tested, date, data restored, restoration method, result (pass/fail), reviewer sign-off",
      },
      {
        title: "Backup Encryption Evidence",
        evidenceType: "Screenshot",
        suggestedFilename: "MP-Backup-Encryption-Evidence-YYYY-MM-DD.png",
        sourceSystem: "Backup solution settings",
        mustShow:
          "Encryption enabled, algorithm (AES-256), key management reference",
      },
      {
        title: "Failure Alert Configuration",
        evidenceType: "Screenshot",
        suggestedFilename: "MP-Backup-Failure-Alerts-YYYY-MM-DD.png",
        sourceSystem: "Backup solution > Notifications / Alerts",
        mustShow:
          "Alert recipients, conditions (backup failure), notification method",
      },
    ],
    documents: [
      { title: "Backup and Recovery Procedure", docType: "procedure" },
      { title: "Media Protection Policy", docType: "policy" },
      { title: "Recovery Procedure", docType: "procedure" },
    ],
    checklistItems: [
      "All CUI systems covered by backup jobs",
      "Backup storage verified as offsite/separate region",
      "Backup encryption confirmed",
      "Backup access controls reviewed",
      "Restore test performed and documented",
      "Backup failure alerts configured",
      "Evidence uploaded and linked to MP and SC controls",
      "Media Protection Policy reviewed",
      "Test procedure performed and passed",
    ],
  },

  // ── I. Incident Response Tabletop ────────────────────────────────────────────
  {
    id: "rm-0009-0000-0000-0000-000000000009",
    title: "Conduct Incident Response Tabletop",
    category: "Incident Response",
    phase: 5,
    phaseName: "Risk and Remediation",
    priority: "medium",
    effort: "medium",
    impactScore: 29,
    sortOrder: 9,
    purpose:
      "Exercise the organization's incident response plan through a tabletop simulation, validate team roles and communication paths, and update the IRP based on lessons learned.",
    whyItMatters:
      "CMMC requires a tested incident response capability — not just a written plan. A tabletop exercise is the minimum required test. Without it, you cannot demonstrate that your team knows how to respond to an incident or that your plan is operational. This action directly satisfies all three IR controls and supports SI and CA detection controls.",
    operatingProcedure:
      "1. Schedule the tabletop exercise with key stakeholders: IT, management, HR, legal (if applicable).\n2. Select a scenario: ransomware attack, phishing compromise, insider threat, or data exfiltration.\n3. Walk participants through the scenario step-by-step, discussing responses at each phase.\n4. Document how the team would: detect, contain, eradicate, recover, and notify (as required by DFARS 7012).\n5. Capture attendee list with names, titles, and roles.\n6. Document the after-action report: what went well, what gaps were identified, corrective actions.\n7. Update the Incident Response Plan based on lessons learned.\n8. Create POA&M entries for any gaps that require follow-up work.\n9. Upload all evidence to the Evidence module.",
    testProcedure:
      "1. Confirm the tabletop was conducted within the last 12 months.\n2. Verify attendee list includes IT, management, and key personnel.\n3. Confirm after-action report documents findings and corrective actions.\n4. Verify the Incident Response Plan was updated following the exercise.\n5. Confirm POA&M entries exist for any gaps identified.",
    controls: [
      { controlId: "IR.L2-3.6.1", supportType: "full_support" },
      { controlId: "IR.L2-3.6.2", supportType: "full_support" },
      { controlId: "IR.L2-3.6.3", supportType: "full_support" },
      { controlId: "SI.L2-3.14.3", supportType: "partial_support" },
      { controlId: "SI.L2-3.14.6", supportType: "evidence_only" },
    ],
    evidenceItems: [
      {
        title: "Tabletop Scenario Document",
        evidenceType: "Document",
        suggestedFilename: "IR-Tabletop-Scenario-YYYY-MM-DD.docx",
        sourceSystem: "Organization-maintained",
        mustShow: "Scenario narrative, injects (events), discussion questions, timeline",
      },
      {
        title: "Attendee List",
        evidenceType: "Document",
        suggestedFilename: "IR-Tabletop-Attendee-List-YYYY-MM-DD.docx",
        sourceSystem: "Organization-maintained",
        mustShow: "Name, title, role in IR plan, signature or email confirmation",
      },
      {
        title: "After-Action Report",
        evidenceType: "Document",
        suggestedFilename: "IR-After-Action-Report-YYYY-MM-DD.docx",
        sourceSystem: "Organization-maintained",
        mustShow:
          "What went well, gaps identified, corrective actions, responsible parties, due dates",
      },
      {
        title: "Lessons Learned / IRP Update Record",
        evidenceType: "Document",
        suggestedFilename: "IR-Lessons-Learned-YYYY-MM-DD.docx",
        sourceSystem: "Organization-maintained",
        mustShow: "Changes made to IRP based on exercise findings, approval signature",
      },
      {
        title: "Updated POA&M Items",
        evidenceType: "Document",
        suggestedFilename: "IR-POAM-Updates-YYYY-MM-DD.xlsx",
        sourceSystem: "Control HUB POA&M module",
        mustShow:
          "New or updated POA&M entries resulting from tabletop findings",
      },
    ],
    documents: [
      { title: "Incident Response Policy", docType: "policy" },
      { title: "Incident Response Procedure", docType: "procedure" },
      { title: "Incident Response Test Plan", docType: "record" },
    ],
    checklistItems: [
      "Tabletop exercise scheduled and conducted",
      "Scenario document prepared",
      "Attendee list captured with all key roles present",
      "Exercise facilitated through all IR phases",
      "After-action report written and signed off",
      "Incident Response Plan updated with lessons learned",
      "POA&M entries created for identified gaps",
      "Evidence uploaded and linked to IR controls",
      "IR Policy and Procedure reviewed",
      "Test procedure performed and passed",
    ],
  },

  // ── J. Security Training ─────────────────────────────────────────────────────
  {
    id: "rm-0010-0000-0000-0000-000000000010",
    title: "Complete Security Awareness and Role-Based Training",
    category: "Training",
    phase: 2,
    phaseName: "Identity and Access",
    priority: "high",
    effort: "low",
    impactScore: 25,
    sortOrder: 10,
    purpose:
      "Ensure all users complete CMMC-aligned security awareness training, and that personnel with privileged access or specific security roles complete role-based training relevant to their duties.",
    whyItMatters:
      "Human error is the leading cause of security incidents. CMMC requires all users to be aware of security risks and to be trained on their specific responsibilities. Training completion records are commonly requested evidence items in assessments. This is a low-effort, high-return action that directly satisfies all AT domain controls.",
    operatingProcedure:
      "1. Select or build a security awareness training curriculum covering: phishing, CUI handling, password hygiene, incident reporting, physical security, and acceptable use.\n2. Deploy training to all users via your LMS, Microsoft Viva Learning, or a third-party platform.\n3. Set a completion deadline (30 days for new hires, annually for all others).\n4. Create role-based training modules for: IT admins (privileged access, config management), Compliance team (CMMC requirements, evidence handling), System owners (risk acceptance, POA&M).\n5. Export training completion report showing all users, training assigned, completion date, and pass/fail.\n6. Identify and remediate overdue training.\n7. Document the training plan and obtain approval from management.\n8. Maintain training records for at least 3 years.",
    testProcedure:
      "1. Pull training completion report — verify 100% completion or documented exceptions.\n2. Verify the training content covers CUI handling and incident reporting.\n3. Confirm role-based training is assigned to privileged users.\n4. Verify new hire training is assigned within 30 days of onboarding.\n5. Check that training records are retained and accessible.",
    controls: [
      { controlId: "AT.L2-3.2.1", supportType: "full_support" },
      { controlId: "AT.L2-3.2.2", supportType: "full_support" },
      { controlId: "AT.L2-3.2.3", supportType: "full_support" },
      { controlId: "PS.L2-3.9.1", supportType: "partial_support" },
    ],
    evidenceItems: [
      {
        title: "Training Completion Report",
        evidenceType: "Spreadsheet",
        suggestedFilename: "AT-Training-Completion-Report-YYYY-MM-DD.xlsx",
        sourceSystem: "LMS / Microsoft Viva / KnowBe4 / etc.",
        mustShow:
          "User name, training assigned, completion date, pass/fail, completion percentage",
      },
      {
        title: "Training Content Sample",
        evidenceType: "Document",
        suggestedFilename: "AT-Training-Content-Sample-YYYY-MM-DD.pdf",
        sourceSystem: "Training platform",
        mustShow:
          "Training title, content outline, CUI topics covered, quiz questions",
      },
      {
        title: "Roster Reconciliation",
        evidenceType: "Spreadsheet",
        suggestedFilename: "AT-Roster-Reconciliation-YYYY-MM-DD.xlsx",
        sourceSystem: "HR system + LMS comparison",
        mustShow:
          "All active employees cross-referenced with training completion status",
      },
      {
        title: "Overdue Training Remediation Evidence",
        evidenceType: "Document",
        suggestedFilename: "AT-Overdue-Remediation-YYYY-MM-DD.docx",
        sourceSystem: "Organization-maintained",
        mustShow:
          "Users who were overdue, follow-up actions taken, final completion dates",
      },
    ],
    documents: [
      { title: "Awareness and Training Policy", docType: "policy" },
      { title: "Security Training Procedure", docType: "procedure" },
      { title: "Training Register", docType: "record" },
    ],
    checklistItems: [
      "Training curriculum defined and approved",
      "Training deployed to all users",
      "Role-based training assigned to privileged/security personnel",
      "Completion deadline set and communicated",
      "Training completion report exported (100% or exceptions documented)",
      "Overdue training remediated",
      "Training records retained per policy",
      "Evidence uploaded and linked to AT and PS controls",
      "Awareness and Training Policy reviewed",
      "Test procedure performed and passed",
    ],
  },

  // ── K. Policy / Procedure Review ─────────────────────────────────────────────
  {
    id: "rm-0011-0000-0000-0000-000000000011",
    title: "Perform Policy and Procedure Review",
    category: "Documentation",
    phase: 1,
    phaseName: "Foundation",
    priority: "high",
    effort: "high",
    impactScore: 27,
    sortOrder: 11,
    purpose:
      "Review, update, and formally approve all CMMC-required policies and procedures. Ensure every policy is current, covers its domain requirements, and has been reviewed within the past 12 months.",
    whyItMatters:
      "Policies and procedures are the documented evidence that your organization has defined how it will comply with CMMC. Every domain requires at least a policy and usually a procedure. Assessors will read these documents. An outdated or missing policy for a domain is an immediate finding. Completing this early ensures your documentation supports all other compliance activities.",
    operatingProcedure:
      "1. Create a policy inventory spreadsheet listing all required CMMC policies by domain.\n2. For each policy, document: current version, last review date, owner, approval status.\n3. Identify gaps: missing policies, policies not reviewed in 12+ months, and policies lacking procedures.\n4. Review and update each policy to ensure it covers all CMMC requirements for its domain.\n5. Ensure procedures exist for all policies that require them.\n6. Obtain management approval/signature on each updated policy.\n7. Distribute updated policies to all staff and obtain acknowledgment.\n8. Upload all policies and procedures to the Documents module and link to relevant controls.\n9. Schedule annual policy review cycle.",
    testProcedure:
      "1. Verify a policy exists for each of the 14 CMMC L2 domains.\n2. Confirm all policies show a review date within the last 12 months.\n3. Verify each policy has a management approval signature.\n4. Confirm procedures exist for the top-risk policies (AC, IA, AU, CM, IR, SC, SI).\n5. Verify policies are distributed and staff acknowledgment records exist.",
    controls: [
      { controlId: "CA.L2-3.12.3", supportType: "partial_support" },
      { controlId: "CA.L2-3.12.4", supportType: "partial_support" },
      { controlId: "AT.L2-3.2.1", supportType: "evidence_only" },
      { controlId: "AU.L2-3.3.1", supportType: "doc_only" },
      { controlId: "AC.L1-3.1.1", supportType: "doc_only" },
    ],
    evidenceItems: [
      {
        title: "Policy Review Record",
        evidenceType: "Document",
        suggestedFilename: "CA-Policy-Review-Record-YYYY-MM-DD.xlsx",
        sourceSystem: "Organization-maintained",
        mustShow:
          "Policy name, version, review date, reviewer, status, approval date",
      },
      {
        title: "Approval Signatures",
        evidenceType: "Document",
        suggestedFilename: "CA-Policy-Approval-Signatures-YYYY-MM-DD.pdf",
        sourceSystem: "Signed documents or e-signature records",
        mustShow: "Policy title, approver name/title, signature, approval date",
      },
      {
        title: "Version History Export",
        evidenceType: "Document",
        suggestedFilename: "CA-Policy-Version-History-YYYY-MM-DD.xlsx",
        sourceSystem: "Document management system",
        mustShow:
          "Document name, version numbers, change description, author, date",
      },
      {
        title: "Staff Acknowledgment Record",
        evidenceType: "Spreadsheet",
        suggestedFilename: "CA-Policy-Acknowledgment-Record-YYYY-MM-DD.xlsx",
        sourceSystem: "LMS / email / manual sign-off",
        mustShow: "Employee name, policy acknowledged, date, method",
      },
    ],
    documents: [
      { title: "Policy Inventory", docType: "record" },
      { title: "Procedure Inventory", docType: "record" },
      { title: "Policy Approval Records", docType: "record" },
      { title: "Policy Review Log", docType: "record" },
    ],
    checklistItems: [
      "Policy inventory created for all 14 CMMC domains",
      "Gaps identified (missing or outdated policies)",
      "All policies reviewed and updated",
      "Procedures created/updated for all required domains",
      "Management approval obtained on each policy",
      "Policies distributed and staff acknowledgment captured",
      "All policies uploaded to Documents module",
      "Policies linked to relevant controls",
      "Annual review schedule established",
      "Evidence uploaded and linked to CA controls",
    ],
  },

  // ── L. Risk Assessment / POAM ────────────────────────────────────────────────
  {
    id: "rm-0012-0000-0000-0000-000000000012",
    title: "Perform Risk Assessment and POA&M Review",
    category: "Risk and Remediation",
    phase: 5,
    phaseName: "Risk and Remediation",
    priority: "high",
    effort: "medium",
    impactScore: 26,
    sortOrder: 12,
    purpose:
      "Perform a formal risk assessment identifying threats, vulnerabilities, and risks to CUI. Review and update all open POA&Ms. Obtain management approval and document risk acceptance decisions.",
    whyItMatters:
      "Risk assessment is a core CA domain requirement and demonstrates that your organization actively manages risk rather than reacting to it. POA&M management shows assessors that you have a structured plan to address gaps. This action supports 4 controls in RA and CA domains and is typically reviewed by assessors as a sign of program maturity.",
    operatingProcedure:
      "1. Identify threats to CUI: internal, external, natural, adversarial.\n2. Identify vulnerabilities from: vulnerability scans, configuration reviews, previous findings.\n3. Assess likelihood and impact for each risk.\n4. Prioritize risks by risk score (likelihood × impact).\n5. Define risk treatment for each: accept, mitigate, transfer, or avoid.\n6. Document all risks in the risk register.\n7. Review all open POA&M entries — update milestone dates, remediation progress, and status.\n8. Close any POA&M items that have been remediated with evidence.\n9. Obtain management review and sign-off on the risk register.\n10. Export POA&M report from Control HUB POA&M module.",
    testProcedure:
      "1. Verify risk assessment was performed within the last 12 months.\n2. Confirm risk register includes threats, vulnerabilities, likelihood, impact, and risk owner.\n3. Verify all open POA&Ms have current milestone dates (not past due without extension).\n4. Confirm management sign-off exists on the risk register.\n5. Verify at least one closed POA&M has remediation evidence attached.",
    controls: [
      { controlId: "RA.L2-3.11.1", supportType: "full_support" },
      { controlId: "RA.L2-3.11.3", supportType: "partial_support" },
      { controlId: "CA.L2-3.12.2", supportType: "full_support" },
      { controlId: "CA.L2-3.12.3", supportType: "partial_support" },
    ],
    evidenceItems: [
      {
        title: "Updated Risk Register",
        evidenceType: "Spreadsheet",
        suggestedFilename: "RA-Risk-Register-YYYY-MM-DD.xlsx",
        sourceSystem: "Organization-maintained",
        mustShow:
          "Risk ID, threat, vulnerability, likelihood, impact, risk score, treatment, owner, review date",
      },
      {
        title: "POA&M Export",
        evidenceType: "Spreadsheet",
        suggestedFilename: "CA-POAM-Export-YYYY-MM-DD.xlsx",
        sourceSystem: "Control HUB > POA&Ms",
        mustShow:
          "Weakness, control, scheduled completion, milestones, status, resources needed",
      },
      {
        title: "Management Review Notes",
        evidenceType: "Document",
        suggestedFilename: "RA-Management-Review-Notes-YYYY-MM-DD.docx",
        sourceSystem: "Organization-maintained",
        mustShow:
          "Date, attendees, risks reviewed, decisions made, risk acceptance approvals",
      },
      {
        title: "Remediation Evidence for Closed POA&Ms",
        evidenceType: "Document",
        suggestedFilename: "CA-POAM-Remediation-Evidence-YYYY-MM-DD.pdf",
        sourceSystem: "Control HUB Evidence module",
        mustShow:
          "POA&M item reference, remediation performed, evidence of completion, closure date",
      },
    ],
    documents: [
      { title: "Risk Register", docType: "record" },
      { title: "Risk Assessment Report", docType: "record" },
      { title: "POA&M", docType: "record" },
      { title: "Risk Acceptance Records", docType: "record" },
    ],
    checklistItems: [
      "Threats and vulnerabilities identified",
      "Likelihood and impact assessed for each risk",
      "Risk register updated with all current risks",
      "Risk treatment decisions documented",
      "Management review and sign-off obtained",
      "All open POA&Ms reviewed and milestones updated",
      "Remediated POA&Ms closed with evidence",
      "POA&M export generated from Control HUB",
      "Evidence uploaded and linked to RA and CA controls",
      "Test procedure performed and passed",
    ],
  },
];
