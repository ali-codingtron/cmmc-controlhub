export interface ProcedureStepSeed {
  id: string;
  actionId: string;
  stepNumber: number;
  title: string;
  purpose: string;
  systemPortal: string;
  navigationPath: string;
  instructions: string;
  recommendedSettings?: string;
  expectedResult: string;
  evidenceToCapture: string;
  suggestedFilename: string;
  relatedControls: string[];
  ownerRole: string;
  ifThisFails: string;
  isRequired: boolean;
  sortOrder: number;
}

const ENDPOINT_ACTION_ID = "rm-0004-0000-0000-0000-000000000004";

export const PROCEDURE_STEPS_SEED: ProcedureStepSeed[] = [
  // ── Action D: Configure Endpoint Compliance and Device Management ─────────────

  {
    id: "ps-d001-0000-0000-0000-000000000001",
    actionId: ENDPOINT_ACTION_ID,
    stepNumber: 1,
    title: "Confirm Endpoint Scope",
    purpose:
      "Identify which devices are in scope for CMMC and CUI access so that compliance policies are applied to the right population of endpoints.",
    systemPortal: "Control HUB, Intune Admin Center, Asset Inventory",
    navigationPath:
      "Control HUB → Assessment Scope / Assets\nIntune Admin Center → Devices → All Devices",
    instructions:
      "1. Review the organization's in-scope asset inventory.\n2. Identify all Windows endpoints that store, process, or access CUI.\n3. Confirm each device has an assigned owner.\n4. Confirm each device appears in Intune or the approved management platform.\n5. Identify unmanaged, stale, duplicate, or unknown devices.\n6. Document any devices that require remediation or exclusion.",
    expectedResult:
      "All CUI-scoped devices are identified, owned, and listed in the asset inventory.",
    evidenceToCapture:
      "- Device inventory export (all in-scope endpoints)\n- Screenshot of Intune All Devices filtered to in-scope devices\n- Asset inventory showing assigned owner and scope designation",
    suggestedFilename: "CM-3.4.3_Device_Inventory_YYYY-MM-DD.xlsx",
    relatedControls: ["CM.L2-3.4.3", "IA.L1-3.5.1", "AC.L2-3.1.18"],
    ownerRole: "IT Administrator / Compliance Manager",
    ifThisFails:
      "Create a POA&M or remediation task for unmanaged or unknown devices. Document any devices that cannot be enrolled with an approved exception and compensating controls.",
    isRequired: true,
    sortOrder: 1,
  },

  {
    id: "ps-d002-0000-0000-0000-000000000002",
    actionId: ENDPOINT_ACTION_ID,
    stepNumber: 2,
    title: "Enroll Devices in Intune",
    purpose:
      "Ensure all in-scope endpoints are centrally managed through Microsoft Intune so that compliance policies, baselines, and monitoring can be applied.",
    systemPortal: "Microsoft Intune Admin Center",
    navigationPath:
      "Intune Admin Center → Devices → Windows → Windows enrollment",
    instructions:
      "1. Confirm enrollment method is configured (Entra join, hybrid join, or co-management).\n2. Confirm users or device groups are assigned to enrollment policies.\n3. Verify existing in-scope devices show as enrolled.\n4. Identify any in-scope devices that are not enrolled.\n5. For missing devices, initiate enrollment or document an approved exception.\n6. Confirm enrollment status and last check-in date is current for all enrolled devices.",
    recommendedSettings:
      "Entra join (preferred) or Hybrid Entra join for existing on-prem domain-joined devices. MDM enrollment scope: All users or targeted security group.",
    expectedResult:
      "All in-scope Windows endpoints are enrolled in Intune or have documented exceptions.",
    evidenceToCapture:
      "- Enrollment policy configuration screenshot\n- Enrolled device list export (showing enrollment date and status)\n- Exception list with justification if any devices are excluded",
    suggestedFilename: "CM-3.4.1_Intune_Enrollment_Status_YYYY-MM-DD.png",
    relatedControls: ["CM.L2-3.4.1", "CM.L2-3.4.2", "AC.L2-3.1.18"],
    ownerRole: "IT Administrator",
    ifThisFails:
      "For devices that cannot be enrolled: (1) document the reason and device identifier, (2) create a POA&M item, (3) apply compensating controls such as manual configuration validation, (4) escalate to compliance manager for exception approval.",
    isRequired: true,
    sortOrder: 2,
  },

  {
    id: "ps-d003-0000-0000-0000-000000000003",
    actionId: ENDPOINT_ACTION_ID,
    stepNumber: 3,
    title: "Create Device Compliance Policy",
    purpose:
      "Require all managed endpoints to meet defined security requirements before accessing CUI, ensuring a consistent baseline across all devices.",
    systemPortal: "Microsoft Intune Admin Center",
    navigationPath:
      "Devices → Compliance policies → Policies → Create Policy → Windows 10 and later",
    instructions:
      "1. Navigate to Compliance Policies and create or review the existing Windows compliance policy.\n2. Require BitLocker or device encryption.\n3. Require active antivirus (Windows Defender or approved third-party).\n4. Require firewall enabled.\n5. Require OS version or patch-level compliance (minimum supported OS version).\n6. Require TPM 2.0 where device hardware supports it.\n7. Assign policy to the in-scope device group.\n8. Set noncompliance action: mark device noncompliant immediately.\n9. Save policy and confirm it shows as assigned.",
    recommendedSettings:
      "BitLocker required: Yes\nAntivirus required: Yes\nFirewall required: Yes\nSecure Boot required: Yes (where supported)\nTPM required: Version 2.0 (where supported)\nMin OS version: 10.0.19041 (Windows 10 2004 or later)\nMark device noncompliant: Immediately",
    expectedResult:
      "A compliance policy exists, is assigned to all in-scope devices, and is actively evaluating compliance.",
    evidenceToCapture:
      "- Policy settings screenshot (all requirement toggles visible)\n- Assignment screenshot showing targeted device group\n- Compliance summary showing percentage compliant",
    suggestedFilename: "CM-3.4.2_Device_Compliance_Policy_YYYY-MM-DD.png",
    relatedControls: [
      "CM.L2-3.4.2",
      "SI.L1-3.14.2",
      "SI.L1-3.14.5",
      "AC.L2-3.1.18",
    ],
    ownerRole: "IT Administrator / Compliance Manager",
    ifThisFails:
      "If devices fail compliance evaluation: (1) review the specific failure reason per device, (2) create remediation tasks for each failure category, (3) do not grant Conditional Access exemptions without documented approval, (4) log exceptions in POA&M.",
    isRequired: true,
    sortOrder: 3,
  },

  {
    id: "ps-d004-0000-0000-0000-000000000004",
    actionId: ENDPOINT_ACTION_ID,
    stepNumber: 4,
    title: "Deploy Security Baseline",
    purpose:
      "Apply a standardized, pre-validated secure configuration to all endpoints to reduce attack surface and satisfy CM domain requirements.",
    systemPortal: "Microsoft Intune Admin Center",
    navigationPath:
      "Endpoint Security → Security baselines → MDM Security Baseline",
    instructions:
      "1. Navigate to Endpoint Security → Security baselines.\n2. Select the MDM Security Baseline (latest version).\n3. Create a new profile or review the existing baseline profile.\n4. Review settings — accept defaults unless a business justification requires deviation.\n5. Document any deviations from the baseline in the exception log.\n6. Assign the baseline profile to the in-scope Windows device group.\n7. Save and confirm assignment.\n8. Monitor deployment status — wait for the 'Succeeded' count to match enrolled device count.\n9. For devices showing error or conflict, review the per-device setting details.",
    recommendedSettings:
      "Use Microsoft MDM Security Baseline (current version). Review: Account Lockout, Audit Policies, Browser hardening, Credential Guard, Exploit Guard, Windows Defender settings. Document all deviations.",
    expectedResult:
      "Security baseline profile is assigned to all in-scope devices and showing deployment success status.",
    evidenceToCapture:
      "- Security baseline configuration screenshot (profile name, version, settings)\n- Assignment screenshot showing targeted group\n- Deployment status screenshot (Succeeded/Failed/Error counts)\n- Exception/deviation documentation if settings were modified",
    suggestedFilename: "CM-3.4.1_Security_Baseline_Assignment_YYYY-MM-DD.png",
    relatedControls: [
      "CM.L2-3.4.1",
      "CM.L2-3.4.2",
      "CM.L2-3.4.6",
      "CM.L2-3.4.7",
    ],
    ownerRole: "IT Administrator",
    ifThisFails:
      "If baseline deployment fails on specific devices: (1) check for conflicting configuration profiles, (2) review the device details for specific setting conflicts, (3) resolve conflicts by removing duplicate policies, (4) document persistent exceptions with compensating controls in POA&M.",
    isRequired: true,
    sortOrder: 4,
  },

  {
    id: "ps-d005-0000-0000-0000-000000000005",
    actionId: ENDPOINT_ACTION_ID,
    stepNumber: 5,
    title: "Enable Microsoft Defender Protection",
    purpose:
      "Verify that all endpoints have active anti-malware protection with real-time scanning, cloud protection, and current signatures — satisfying SI domain malware protection controls.",
    systemPortal: "Microsoft Defender Portal / Microsoft Intune Admin Center",
    navigationPath:
      "Defender Portal → Assets → Devices\nIntune Admin Center → Endpoint Security → Antivirus",
    instructions:
      "1. Navigate to Intune Endpoint Security → Antivirus.\n2. Confirm a Windows Defender Antivirus policy exists and is assigned.\n3. Verify real-time protection is set to enabled.\n4. Verify cloud-delivered protection is set to enabled.\n5. Verify automatic sample submission is configured.\n6. In the Defender portal, review Assets → Devices for any unhealthy or inactive devices.\n7. Pull the antivirus report from Intune Reports → Endpoint Security → Antivirus.\n8. For any device showing inactive or non-reporting status, create a remediation task.",
    recommendedSettings:
      "Real-time protection: Enabled\nCloud-delivered protection: Enabled (High or High Plus)\nAutomatic sample submission: Enabled\nPUA protection: Block\nTamper protection: On",
    expectedResult:
      "All in-scope endpoints show active malware protection with current signatures and no inactive/unhealthy devices.",
    evidenceToCapture:
      "- Antivirus policy configuration screenshot\n- Defender device security status report (all devices listed)\n- Report showing real-time protection enabled percentage\n- Unhealthy device remediation list (if applicable)",
    suggestedFilename: "SI-3.14.2_Defender_Antivirus_Status_YYYY-MM-DD.png",
    relatedControls: [
      "SI.L1-3.14.2",
      "SI.L1-3.14.4",
      "SI.L1-3.14.5",
      "SI.L2-3.14.6",
    ],
    ownerRole: "IT Administrator / Security Team",
    ifThisFails:
      "For devices with inactive or disabled Defender: (1) check if a third-party AV is approved and active as compensating control, (2) if no AV is present, create an emergency remediation task, (3) consider blocking CUI access from unprotected devices via Conditional Access, (4) document in POA&M.",
    isRequired: true,
    sortOrder: 5,
  },

  {
    id: "ps-d006-0000-0000-0000-000000000006",
    actionId: ENDPOINT_ACTION_ID,
    stepNumber: 6,
    title: "Configure Automatic Updates",
    purpose:
      "Ensure all endpoints receive critical security patches automatically and on schedule, satisfying SI domain patch management requirements.",
    systemPortal: "Microsoft Intune Admin Center",
    navigationPath: "Devices → Windows → Update rings for Windows 10 and later",
    instructions:
      "1. Navigate to Devices → Windows → Update rings.\n2. Create or review the existing update ring policy.\n3. Set quality update deferral period (0–7 days recommended for security patches).\n4. Set feature update deferral if desired (30–90 days is common).\n5. Configure automatic restart behavior and grace period.\n6. Define deadline for security updates (7 days recommended).\n7. Assign the update ring to the in-scope device group.\n8. Review Update compliance report to confirm devices are current.\n9. Identify devices with failed or stalled updates.",
    recommendedSettings:
      "Quality update deferral: 0–3 days\nFeature update deferral: 30 days\nDeadline for quality updates: 7 days\nRestart grace period: 2 days\nAutomatic update behavior: Auto install and restart at maintenance time",
    expectedResult:
      "A Windows update ring policy is assigned, and all in-scope devices show update compliance within the defined timeframe.",
    evidenceToCapture:
      "- Update ring configuration settings screenshot\n- Assignment screenshot showing targeted device group\n- Windows Update compliance report showing devices current or within deadline",
    suggestedFilename: "SI-3.14.1_Update_Ring_Compliance_YYYY-MM-DD.png",
    relatedControls: ["SI.L1-3.14.1", "RA.L2-3.11.2", "RA.L2-3.11.3"],
    ownerRole: "IT Administrator",
    ifThisFails:
      "For devices with stale patches (>30 days): (1) check if the device is online and checking in, (2) manually force a sync from Intune device page, (3) if the device is offline/decommissioned, update the asset inventory, (4) document patch gap in POA&M with target remediation date.",
    isRequired: true,
    sortOrder: 6,
  },

  {
    id: "ps-d007-0000-0000-0000-000000000007",
    actionId: ENDPOINT_ACTION_ID,
    stepNumber: 7,
    title: "Enable Disk Encryption (BitLocker)",
    purpose:
      "Protect CUI at rest on all endpoints by ensuring full-disk encryption is enabled and recovery keys are escrowed — satisfying SC and MP domain data protection controls.",
    systemPortal: "Microsoft Intune Admin Center",
    navigationPath:
      "Endpoint Security → Disk encryption → Create policy → Windows → BitLocker",
    instructions:
      "1. Navigate to Endpoint Security → Disk encryption.\n2. Create or review the existing BitLocker policy.\n3. Enable BitLocker on OS drives with AES-256 or AES-128 CBC.\n4. Require BitLocker encryption before allowing OS write access.\n5. Configure recovery key escrow to Microsoft Entra ID (Azure AD).\n6. Enable BitLocker on fixed data drives.\n7. Assign policy to in-scope device group.\n8. Review the encryption report: Intune → Devices → Monitor → Encryption report.\n9. Identify and remediate unencrypted or error devices.\n10. Confirm recovery keys are stored in Entra ID for auditable access.",
    recommendedSettings:
      "OS drive encryption: Required (AES 256-bit CBC or XTS-AES 256)\nFixed data drive encryption: Required\nRecovery key escrow: Azure AD / Entra ID\nStartup PIN: Required where TPM+PIN is supported\nHide recovery options during BitLocker setup: Yes",
    expectedResult:
      "All in-scope Windows devices are fully encrypted with recovery keys escrowed to Entra ID.",
    evidenceToCapture:
      "- BitLocker policy configuration screenshot\n- Encryption report from Intune showing encryption status per device\n- Sample screenshot of escrowed recovery key in Entra ID device page\n- Exception/remediation list for unencrypted devices",
    suggestedFilename: "SC-3.13.16_BitLocker_Encryption_Status_YYYY-MM-DD.png",
    relatedControls: ["SC.L2-3.13.16", "MP.L2-3.8.1", "AC.L2-3.1.19"],
    ownerRole: "IT Administrator",
    ifThisFails:
      "For devices that fail encryption: (1) check TPM status — BitLocker requires TPM 1.2+ or a USB startup key, (2) for legacy hardware without TPM, document as a hardware exception requiring replacement, (3) do not store unencrypted devices containing CUI without a compensating control, (4) log all exceptions in POA&M with hardware replacement timeline.",
    isRequired: true,
    sortOrder: 7,
  },

  {
    id: "ps-d008-0000-0000-0000-000000000008",
    actionId: ENDPOINT_ACTION_ID,
    stepNumber: 8,
    title: "Review Noncompliant Devices",
    purpose:
      "Ensure devices that fail compliance requirements are identified, remediated, or blocked from CUI access — closing the loop on compliance policy enforcement.",
    systemPortal: "Microsoft Intune Admin Center",
    navigationPath:
      "Devices → Monitor → Noncompliant devices\nDevices → Compliance policies → [Policy name] → Device status",
    instructions:
      "1. Navigate to Devices → Monitor → Noncompliant devices.\n2. Filter for status: Noncompliant, Unknown, Error.\n3. For each noncompliant device, identify:\n   - Which compliance setting(s) failed\n   - Whether the device has CUI access\n   - The device owner\n4. Create a remediation ticket or Intune remediation task for each device.\n5. For devices that cannot be remediated within 30 days, document in POA&M.\n6. Verify Conditional Access policy blocks noncompliant devices from accessing M365/CUI apps.\n7. Confirm Conditional Access grant control is set to: Require device to be marked as compliant.",
    expectedResult:
      "All noncompliant devices are either remediated, blocked from CUI access via Conditional Access, or documented as POA&M exceptions.",
    evidenceToCapture:
      "- Noncompliant device report (showing device, failure reason, owner)\n- Remediation tickets or task list\n- Conditional Access policy showing 'Require compliant device' grant control\n- Exception approval documentation",
    suggestedFilename:
      "CM-3.4.2_Noncompliant_Device_Review_YYYY-MM-DD.xlsx",
    relatedControls: ["CM.L2-3.4.2", "AC.L2-3.1.18", "CA.L2-3.12.3"],
    ownerRole: "IT Administrator / Compliance Manager",
    ifThisFails:
      "If Conditional Access cannot be enforced: (1) document the access control gap, (2) implement a manual review process as a compensating control, (3) create a high-priority POA&M for Conditional Access implementation, (4) escalate to ISSO or compliance manager immediately.",
    isRequired: true,
    sortOrder: 8,
  },

  {
    id: "ps-d009-0000-0000-0000-000000000009",
    actionId: ENDPOINT_ACTION_ID,
    stepNumber: 9,
    title: "Export Compliance Evidence",
    purpose:
      "Create audit-ready evidence packages that document the current endpoint compliance posture for CMMC assessors.",
    systemPortal: "Microsoft Intune Admin Center",
    navigationPath:
      "Devices → Compliance → Reports\nReports → Device compliance → Reports tab → All devices compliance",
    instructions:
      "1. Navigate to Intune Devices → Monitor → Compliance reports.\n2. Export the 'Device compliance' report (CSV or Excel).\n3. Export the 'Noncompliant devices' report.\n4. Navigate to Reports → Endpoint Security → Antivirus and export antivirus status.\n5. Navigate to Devices → Monitor → Encryption report and export.\n6. Take screenshots of the compliance dashboard summary (showing % compliant).\n7. Save all exports using the naming convention below.\n8. Upload each file to Control HUB Evidence repository.\n9. Link each evidence item to all mapped controls (CM, SI, AC domains).",
    expectedResult:
      "Approved evidence files exist in Control HUB for device compliance, encryption status, antivirus status, and patch compliance — all linked to applicable controls.",
    evidenceToCapture:
      "- Device compliance report (full export)\n- Noncompliant devices report\n- Antivirus status report\n- Encryption report\n- Compliance dashboard summary screenshot",
    suggestedFilename: "CM-Endpoint_Compliance_Report_YYYY-MM-DD.xlsx",
    relatedControls: [
      "CM.L2-3.4.1",
      "CM.L2-3.4.2",
      "SI.L1-3.14.1",
      "SI.L1-3.14.2",
      "CA.L2-3.12.3",
    ],
    ownerRole: "Compliance Manager",
    ifThisFails:
      "If exports are unavailable or incomplete: (1) capture screenshots of each report as a minimum, (2) document which evidence could not be exported and why, (3) schedule a follow-up export date, (4) note the gap in the evidence package with a remediation date.",
    isRequired: true,
    sortOrder: 9,
  },

  {
    id: "ps-d010-0000-0000-0000-000000000010",
    actionId: ENDPOINT_ACTION_ID,
    stepNumber: 10,
    title: "Document Baseline Approval",
    purpose:
      "Formalize the endpoint baseline by ensuring it is documented, approved, linked to controls, and reviewable by assessors — completing the CM domain documentation trail.",
    systemPortal: "Control HUB / Documentation Module",
    navigationPath:
      "Control HUB → Documents → Add Document (or upload existing)\nControl HUB → Controls → CM.L2-3.4.1 → Link document",
    instructions:
      "1. Upload or create the Endpoint Security Baseline Procedure document.\n2. Include: scope, approved configuration settings, deviation process, review frequency.\n3. Link the document to all applicable controls: CM.L2-3.4.1, CM.L2-3.4.2, CM.L2-3.4.6.\n4. Add the document owner and set a review date (annual minimum).\n5. Upload approval evidence (email approval, signed document, or change ticket).\n6. Update the SSP narrative for CM controls to reference this baseline document.\n7. Review the implementation narrative in Control HUB and confirm it reflects current configuration.\n8. Confirm the document status is set to Active or Approved.",
    recommendedSettings:
      "Document type: Procedure\nReview frequency: Annual\nApprover: CISO / IT Director / Compliance Manager\nLinked controls: CM.L2-3.4.1, CM.L2-3.4.2, CM.L2-3.4.6, CM.L2-3.4.7",
    expectedResult:
      "Endpoint baseline procedure is documented, approved, linked to controls in Control HUB, and the SSP narratives are updated.",
    evidenceToCapture:
      "- Endpoint baseline procedure document\n- Approval record (signed document or email approval)\n- SSP update note or narrative screenshot\n- Control HUB document detail showing linked controls",
    suggestedFilename: "CM-Endpoint_Baseline_Approval_YYYY-MM-DD.docx",
    relatedControls: ["CM.L2-3.4.1", "CM.L2-3.4.2", "CA.L2-3.12.4"],
    ownerRole: "Compliance Manager / CISO",
    ifThisFails:
      "If documentation approval is delayed: (1) document as an in-progress status in Control HUB, (2) create a task with a due date for the approver, (3) do not mark the action complete until formal approval is captured, (4) note the pending approval in the POA&M if the assessment date is approaching.",
    isRequired: true,
    sortOrder: 10,
  },
];
