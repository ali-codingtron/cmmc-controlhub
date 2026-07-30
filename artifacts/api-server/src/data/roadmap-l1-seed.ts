import type { RoadmapSeedAction } from "./roadmap-seed";

/**
 * CMMC Level 1 Implementation Roadmap actions.
 * Profile: CMMC_L1_V2_13
 * Based on the 17 CMMC L1 controls (AC, IA, MP, PE, SC, SI domains).
 * Focuses on Federal Contract Information (FCI) — not CUI.
 */
export const L1_ROADMAP_SEED: RoadmapSeedAction[] = [
  // ── Phase 1: Scope and Inventory ────────────────────────────────────────────
  {
    id: "l1-0001-0000-0000-0000-000000000001",
    title: "Define FCI Scope and System Inventory",
    category: "Foundation",
    phase: 1,
    phaseName: "Scope and Inventory",
    profileKey: "CMMC_L1_V2_13",
    priority: "critical",
    effort: "high",
    impactScore: 40,
    sortOrder: 101,
    purpose:
      "Identify where Federal Contract Information (FCI) is processed, stored, or transmitted and document the systems, users, devices, facilities, and external connections within the Level 1 assessment scope.",
    whyItMatters:
      "A clearly defined FCI scope is the foundation of every Level 1 self-assessment. Without it, you cannot determine which systems and users are subject to the basic safeguarding requirements, and an assessor will have no traceable starting point. Completing this first ensures every subsequent action targets the correct environment.",
    operatingProcedure:
      "1. Identify every system, application, device, and network segment that processes, stores, or transmits FCI.\n2. Write an FCI scope statement describing what FCI you receive and where it lives.\n3. Create a system inventory listing hardware, software, cloud services, and IP addresses in scope.\n4. Create a user inventory of every person with access to FCI systems.\n5. Create a device inventory of all endpoints, servers, and mobile devices in scope.\n6. Draw or document the network boundary showing what is in scope vs. out of scope.\n7. Identify all public-facing components (websites, portals, email gateways).\n8. List all external connections and service providers with access to FCI systems.\n9. Obtain approval of the scope from system owner or senior leadership.",
    testProcedure:
      "1. Confirm the FCI scope statement exists and is signed/approved.\n2. Verify the system inventory covers all in-scope hardware, software, and cloud services.\n3. Verify the user inventory lists all accounts with FCI access.\n4. Confirm the network boundary document shows in-scope and out-of-scope systems.\n5. Verify all external connections and service providers are listed.",
    controls: [],
    evidenceItems: [
      {
        title: "FCI Scope Statement",
        evidenceType: "Document",
        suggestedFilename: "FCI-Scope-Statement-YYYY-MM-DD.docx",
        sourceSystem: "Organization-maintained",
        mustShow: "FCI definition, assessment boundary, system owner approval",
      },
      {
        title: "System and Asset Inventory",
        evidenceType: "Spreadsheet",
        suggestedFilename: "Asset-Inventory-FCI-Scope-YYYY-MM-DD.xlsx",
        sourceSystem: "IT asset management / manual",
        mustShow: "Hardware, software, cloud services, IP ranges, in/out-of-scope designation",
      },
      {
        title: "Network Boundary Summary",
        evidenceType: "Diagram",
        suggestedFilename: "Network-Boundary-Diagram-YYYY-MM-DD.pdf",
        sourceSystem: "Network documentation",
        mustShow: "FCI system boundary, external connections, public-facing components",
      },
      {
        title: "Authorized User List",
        evidenceType: "Spreadsheet",
        suggestedFilename: "Authorized-User-List-YYYY-MM-DD.xlsx",
        sourceSystem: "HR / Identity system",
        mustShow: "User names, roles, FCI access justification",
      },
    ],
    documents: [
      { title: "FCI Scope Statement", docType: "policy" },
      { title: "Asset and User Inventory", docType: "procedure" },
    ],
    checklistItems: [
      "FCI scope statement written and approved",
      "System inventory documented (hardware, software, cloud)",
      "User inventory documented with access justification",
      "Device inventory documented",
      "Network boundary identified and documented",
      "Public-facing system inventory complete",
      "External connections and service providers listed",
      "Scope approved by leadership or system owner",
    ],
  },

  // ── Phase 2: Logical Access and Authentication ───────────────────────────────
  {
    id: "l1-0002-0000-0000-0000-000000000002",
    title: "Configure Authorized Access",
    category: "Access Control",
    phase: 2,
    phaseName: "Logical Access and Authentication",
    profileKey: "CMMC_L1_V2_13",
    priority: "critical",
    effort: "medium",
    impactScore: 38,
    sortOrder: 102,
    purpose:
      "Restrict access to FCI systems and information so that only authorized users and devices can access, use, or transmit FCI. Control what transactions and functions users may perform, limit external connections, and manage information posted to public systems.",
    whyItMatters:
      "Limiting FCI access to authorized users and limiting what they can do is the first line of defense against both insider threat and external breach. Level 1 requires that organizations actively manage who can access FCI, what they can do with it, and how it is exposed externally. Failures here account for the majority of FCI disclosure incidents.",
    operatingProcedure:
      "1. Identify all authorized users for each FCI system (match against user inventory from Action 1).\n2. Implement access controls so only authorized users can log in to FCI systems.\n3. Configure roles and permissions — restrict users to only the transactions and functions they need (least privilege).\n4. Document authorized external connections; remove or block unauthorized ones.\n5. Review any websites, portals, or systems that are publicly accessible and verify FCI is not exposed.\n6. Establish a procedure for approving and revoking access as users join, move, or leave.",
    testProcedure:
      "1. Attempt to access an FCI system with an unauthorized account — confirm access is denied.\n2. Review the access-role matrix and confirm each user has only the permissions required for their job.\n3. Verify no unauthorized external connections exist.\n4. Review public-facing systems and confirm FCI is not accessible without authentication.",
    controls: [
      { controlId: "AC.L1-3.1.1", supportType: "full_support" },
      { controlId: "AC.L1-3.1.2", supportType: "full_support" },
      { controlId: "AC.L1-3.1.20", supportType: "full_support" },
      { controlId: "AC.L1-3.1.22", supportType: "full_support" },
    ],
    evidenceItems: [
      {
        title: "Authorized User and Access Role Matrix",
        evidenceType: "Spreadsheet",
        suggestedFilename: "Access-Role-Matrix-YYYY-MM-DD.xlsx",
        sourceSystem: "Identity and access management system",
        mustShow: "User, system, permission level, business justification",
      },
      {
        title: "Access Control Test Results",
        evidenceType: "Screenshot",
        suggestedFilename: "Access-Control-Test-YYYY-MM-DD.pdf",
        sourceSystem: "Identity system",
        mustShow: "Failed login attempt for unauthorized account, timestamp",
      },
      {
        title: "External Connection Review",
        evidenceType: "Document",
        suggestedFilename: "External-Connections-Review-YYYY-MM-DD.docx",
        sourceSystem: "Network / firewall",
        mustShow: "Approved connections, blocked unauthorized connections, review date",
      },
      {
        title: "Public-Information Review Procedure",
        evidenceType: "Document",
        suggestedFilename: "Public-Systems-Review-YYYY-MM-DD.docx",
        sourceSystem: "Organization-maintained",
        mustShow: "Review process, list of public-facing systems, confirmation FCI is not exposed",
      },
    ],
    documents: [
      { title: "Access Control Policy", docType: "policy" },
      { title: "User Access Review Procedure", docType: "procedure" },
    ],
    checklistItems: [
      "Authorized user list tied to each FCI system",
      "Access controls implemented (only authorized users can access FCI systems)",
      "Least-privilege roles configured",
      "External connections documented and unauthorized ones removed",
      "Public-facing systems reviewed — FCI not publicly accessible",
      "Access provisioning and deprovisioning procedure in place",
    ],
  },

  {
    id: "l1-0003-0000-0000-0000-000000000003",
    title: "Implement Identification and Authentication",
    category: "Identity",
    phase: 2,
    phaseName: "Logical Access and Authentication",
    profileKey: "CMMC_L1_V2_13",
    priority: "critical",
    effort: "medium",
    impactScore: 36,
    sortOrder: 103,
    purpose:
      "Ensure that all users, processes acting on behalf of users, and devices are identified and authenticated before being granted access to FCI systems.",
    whyItMatters:
      "Authentication prevents unauthorized individuals from accessing FCI by impersonating legitimate users or devices. Every account accessing FCI must have a unique identity and must prove that identity before access is granted. Shared or anonymous accounts make attribution impossible and are an immediate finding in any assessment.",
    operatingProcedure:
      "1. Ensure every user account is unique — no shared or generic accounts for FCI systems.\n2. Verify every user account has an assigned owner documented in the user inventory.\n3. Configure authentication so users must present credentials (password, passphrase, or other authenticator) before accessing FCI systems.\n4. Review service accounts and automated processes that access FCI — ensure each has a documented owner and authenticates.\n5. Verify devices accessing FCI systems require authentication before connecting (e.g., machine certificates, managed device policy).\n6. Document the authentication method in use for each FCI system.",
    testProcedure:
      "1. Review the user account export and confirm no shared or anonymous accounts exist.\n2. Attempt to access an FCI system without providing credentials — confirm access is denied.\n3. Review service accounts for documented owners.\n4. Verify at least one device authentication control is in place.",
    controls: [
      { controlId: "IA.L1-3.5.1", supportType: "full_support" },
      { controlId: "IA.L1-3.5.2", supportType: "full_support" },
    ],
    evidenceItems: [
      {
        title: "User Account Export",
        evidenceType: "Spreadsheet",
        suggestedFilename: "User-Account-Export-YYYY-MM-DD.xlsx",
        sourceSystem: "Active Directory / Identity provider",
        mustShow: "Account name, display name, account owner, enabled/disabled status",
      },
      {
        title: "Authentication Policy",
        evidenceType: "Document",
        suggestedFilename: "Authentication-Policy-YYYY-MM-DD.docx",
        sourceSystem: "Organization-maintained",
        mustShow: "Authentication requirements per system, password or credential standards",
      },
      {
        title: "Login Test Results",
        evidenceType: "Screenshot",
        suggestedFilename: "Login-Test-FCI-System-YYYY-MM-DD.pdf",
        sourceSystem: "FCI system",
        mustShow: "Login prompt, successful authentication, timestamp",
      },
    ],
    documents: [
      { title: "Identification and Authentication Policy", docType: "policy" },
    ],
    checklistItems: [
      "All FCI user accounts are unique — no shared or generic accounts",
      "Every account has a documented owner",
      "Authentication required before access to all FCI systems",
      "Service accounts and automated processes authenticated with documented owners",
      "Device authentication configured or documented",
      "Authentication method documented for each FCI system",
    ],
  },

  // ── Phase 3: Physical and Media Protection ───────────────────────────────────
  {
    id: "l1-0004-0000-0000-0000-000000000004",
    title: "Protect and Sanitize Media",
    category: "Media Protection",
    phase: 3,
    phaseName: "Physical and Media Protection",
    profileKey: "CMMC_L1_V2_13",
    priority: "high",
    effort: "medium",
    impactScore: 28,
    sortOrder: 104,
    purpose:
      "Identify media containing FCI, protect it from unauthorized access or disclosure, and ensure media is properly sanitized or destroyed before disposal or reuse so FCI cannot be recovered.",
    whyItMatters:
      "Media containing FCI — including hard drives, USB drives, backup tapes, and even paper records — can be physically stolen or improperly disposed of, leading to FCI disclosure. Sanitization before reuse or disposal is required by Level 1 and is verifiable by assessors through disposal records.",
    operatingProcedure:
      "1. Identify all media types that contain or have contained FCI (hard drives, USB, optical media, backup tapes, paper).\n2. Implement physical or logical controls to protect media from unauthorized access (locked storage, encryption).\n3. Establish a media handling procedure describing how FCI media must be stored, transported, and disposed of.\n4. Before disposing of or repurposing media, sanitize it using an approved method (NIST 800-88 or equivalent).\n5. Maintain a sanitization and disposal record for each media item.\n6. Ensure paper records containing FCI are shredded using a cross-cut shredder.",
    testProcedure:
      "1. Review the media inventory and confirm FCI media is identified.\n2. Confirm media containing FCI is stored in locked or restricted-access locations.\n3. Review the sanitization record to verify disposed media was sanitized.\n4. Observe or review documentation of the sanitization method used.",
    controls: [
      { controlId: "MP.L1-3.8.3", supportType: "full_support" },
    ],
    evidenceItems: [
      {
        title: "Media Handling Procedure",
        evidenceType: "Document",
        suggestedFilename: "Media-Handling-Procedure-YYYY-MM-DD.docx",
        sourceSystem: "Organization-maintained",
        mustShow: "Media types covered, storage requirements, sanitization method, disposal process",
      },
      {
        title: "Media Inventory",
        evidenceType: "Spreadsheet",
        suggestedFilename: "Media-Inventory-FCI-YYYY-MM-DD.xlsx",
        sourceSystem: "IT / physical inventory",
        mustShow: "Media type, location, FCI designation, assigned owner",
      },
      {
        title: "Sanitization and Disposal Record",
        evidenceType: "Spreadsheet",
        suggestedFilename: "Media-Sanitization-Record-YYYY-MM-DD.xlsx",
        sourceSystem: "IT operations",
        mustShow: "Media description, sanitization method, date, performed by, disposition",
      },
    ],
    documents: [
      { title: "Media Protection and Sanitization Policy", docType: "policy" },
      { title: "Media Sanitization Procedure", docType: "procedure" },
    ],
    checklistItems: [
      "FCI media types identified and inventoried",
      "Media containing FCI stored securely (locked, restricted, or encrypted)",
      "Media handling procedure documented",
      "Sanitization method selected and documented (NIST 800-88 or equivalent)",
      "Sanitization records maintained for disposed/repurposed media",
      "Paper FCI records shredded with cross-cut shredder",
    ],
  },

  {
    id: "l1-0005-0000-0000-0000-000000000005",
    title: "Control Physical Access",
    category: "Physical Protection",
    phase: 3,
    phaseName: "Physical and Media Protection",
    profileKey: "CMMC_L1_V2_13",
    priority: "high",
    effort: "medium",
    impactScore: 30,
    sortOrder: 105,
    purpose:
      "Limit physical access to FCI systems and equipment to authorized individuals, escort and monitor visitors, maintain physical-access logs, and manage physical-access devices.",
    whyItMatters:
      "Physical access to FCI systems is as dangerous as logical access. An attacker with physical access can bypass most security controls. Level 1 requires that organizations actively manage who can physically reach FCI equipment and that visitor activity is monitored and logged.",
    operatingProcedure:
      "1. Identify all physical areas where FCI systems or media are located.\n2. Implement access controls restricting physical entry to authorized personnel only (locks, badge readers, key control).\n3. Establish a visitor procedure: visitors must be escorted and must sign in/out.\n4. Maintain a physical-access log recording who entered and when.\n5. Create an inventory of physical-access devices (keys, badges, PINs) and review it periodically.\n6. Remove or deactivate physical access for personnel who no longer require it.",
    testProcedure:
      "1. Attempt to enter an FCI area without a badge or escort — confirm access is denied.\n2. Review the visitor log and confirm all visitors were escorted and logged.\n3. Review the physical-access device inventory and confirm departed employees are removed.\n4. Confirm the access log is being maintained.",
    controls: [
      { controlId: "PE.L1-3.10.1", supportType: "full_support" },
      { controlId: "PE.L1-3.10.3", supportType: "full_support" },
      { controlId: "PE.L1-3.10.4", supportType: "full_support" },
      { controlId: "PE.L1-3.10.5", supportType: "full_support" },
    ],
    evidenceItems: [
      {
        title: "Authorized Physical Access List",
        evidenceType: "Spreadsheet",
        suggestedFilename: "Physical-Access-List-YYYY-MM-DD.xlsx",
        sourceSystem: "Facilities / HR",
        mustShow: "Name, role, area authorized, date granted, date revoked if applicable",
      },
      {
        title: "Visitor Log",
        evidenceType: "Spreadsheet",
        suggestedFilename: "Visitor-Log-YYYY-MM-DD.xlsx",
        sourceSystem: "Physical access system / manual log",
        mustShow: "Visitor name, purpose, escort name, entry time, exit time",
      },
      {
        title: "Physical Access Device Inventory",
        evidenceType: "Spreadsheet",
        suggestedFilename: "Physical-Access-Devices-YYYY-MM-DD.xlsx",
        sourceSystem: "Facilities",
        mustShow: "Key/badge/PIN type, assigned to, area, last review date",
      },
      {
        title: "Escort and Visitor Procedure",
        evidenceType: "Document",
        suggestedFilename: "Visitor-Escort-Procedure-YYYY-MM-DD.docx",
        sourceSystem: "Organization-maintained",
        mustShow: "Visitor check-in process, escort requirements, log retention",
      },
    ],
    documents: [
      { title: "Physical Access Control Policy", docType: "policy" },
      { title: "Visitor Escort Procedure", docType: "procedure" },
    ],
    checklistItems: [
      "Physical access to FCI areas limited to authorized personnel",
      "Visitor sign-in and escort procedure implemented",
      "Physical-access log maintained",
      "Physical-access device inventory created and reviewed",
      "Departed employees removed from physical access lists",
      "FCI equipment in locked or restricted physical space",
    ],
  },

  // ── Phase 4: Boundary and Public-System Protection ───────────────────────────
  {
    id: "l1-0006-0000-0000-0000-000000000006",
    title: "Protect System Boundaries and Public Components",
    category: "Communications Protection",
    phase: 4,
    phaseName: "Boundary and Public-System Protection",
    profileKey: "CMMC_L1_V2_13",
    priority: "critical",
    effort: "medium",
    impactScore: 34,
    sortOrder: 106,
    purpose:
      "Monitor and protect external and key internal boundaries of FCI systems. Separate publicly accessible information system components from internal systems to prevent unintended FCI exposure.",
    whyItMatters:
      "FCI is frequently disclosed through boundary failures — unpatched firewalls, improperly segmented networks, or public-facing systems that accidentally expose internal data. Level 1 requires that system boundaries are actively managed, monitored, and that publicly accessible components are isolated from internal FCI systems.",
    operatingProcedure:
      "1. Identify the external boundary of your FCI environment (internet-facing entry points).\n2. Confirm a firewall or equivalent boundary device is in place and configured to restrict unauthorized inbound and outbound traffic.\n3. Review firewall rules — remove rules that allow unnecessary traffic into FCI systems.\n4. Identify and document key internal boundaries (e.g., separation between FCI systems and guest networks or public kiosks).\n5. Review public-facing system components (websites, portals, extranets) and confirm they are separated from internal FCI systems.\n6. Implement or confirm monitoring for boundary events (connection attempts, anomalous traffic).",
    testProcedure:
      "1. Confirm a firewall is in place between the internet and FCI systems.\n2. Review firewall rules and verify unnecessary access is blocked.\n3. Confirm public-facing components cannot directly access internal FCI systems.\n4. Review the network diagram for accurate boundary representation.",
    controls: [
      { controlId: "SC.L1-3.13.1", supportType: "full_support" },
      { controlId: "SC.L1-3.13.5", supportType: "full_support" },
    ],
    evidenceItems: [
      {
        title: "Network Boundary Diagram",
        evidenceType: "Diagram",
        suggestedFilename: "Network-Diagram-YYYY-MM-DD.pdf",
        sourceSystem: "Network documentation",
        mustShow: "External boundary, FCI systems, public-facing components, segmentation",
      },
      {
        title: "Firewall Configuration Review",
        evidenceType: "Screenshot",
        suggestedFilename: "Firewall-Config-Review-YYYY-MM-DD.pdf",
        sourceSystem: "Firewall management console",
        mustShow: "Rule set, inbound/outbound policies, last review date",
      },
      {
        title: "Boundary Rule Review",
        evidenceType: "Document",
        suggestedFilename: "Boundary-Rule-Review-YYYY-MM-DD.docx",
        sourceSystem: "Network / IT operations",
        mustShow: "Rules reviewed, unnecessary rules removed, reviewer name, date",
      },
      {
        title: "Public-Facing System Segmentation Evidence",
        evidenceType: "Document",
        suggestedFilename: "Public-System-Segmentation-YYYY-MM-DD.docx",
        sourceSystem: "Network / IT operations",
        mustShow: "How public components are separated from internal FCI systems",
      },
    ],
    documents: [
      { title: "Network and Boundary Protection Policy", docType: "policy" },
      { title: "Firewall Rule Review Procedure", docType: "procedure" },
    ],
    checklistItems: [
      "Firewall or equivalent boundary device in place and configured",
      "Firewall rules reviewed — unnecessary access removed",
      "Key internal boundaries identified and documented",
      "Public-facing components separated from FCI systems",
      "Network boundary diagram current and accurate",
      "Boundary monitoring or logging in place",
    ],
  },

  // ── Phase 5: System Integrity ────────────────────────────────────────────────
  {
    id: "l1-0007-0000-0000-0000-000000000007",
    title: "Maintain System and Information Integrity",
    category: "System Integrity",
    phase: 5,
    phaseName: "System Integrity",
    profileKey: "CMMC_L1_V2_13",
    priority: "high",
    effort: "medium",
    impactScore: 32,
    sortOrder: 107,
    purpose:
      "Identify and correct system flaws in a timely manner. Provide malicious-code protection, keep it updated, perform periodic scans, and perform real-time scans of files from external sources.",
    whyItMatters:
      "Unpatched systems and absent malware protection are the two most common attack vectors for FCI theft. Level 1 requires that organizations actively patch their systems, run up-to-date anti-malware tools, and scan for threats both periodically and in real time. These requirements are verifiable from patch reports and anti-malware management consoles.",
    operatingProcedure:
      "1. Establish a patch management process — identify new patches for FCI systems and apply critical patches within a defined timeframe.\n2. Run a vulnerability or patch compliance report for all FCI systems.\n3. Confirm anti-malware software is deployed on all FCI endpoints and servers.\n4. Verify anti-malware definitions are set to update automatically and are current.\n5. Configure periodic scans (at minimum weekly) on all FCI systems.\n6. Confirm real-time scanning is enabled for files received from external sources (email attachments, downloaded files, USB).\n7. Document the anti-malware configuration for each system.",
    testProcedure:
      "1. Review the patch report and confirm critical patches are applied within policy timeframe.\n2. Verify anti-malware is running on each in-scope endpoint.\n3. Check that definition files are current (within 24 hours of release).\n4. Confirm periodic scan schedule is configured.\n5. Confirm real-time protection is enabled.",
    controls: [
      { controlId: "SI.L1-3.14.1", supportType: "full_support" },
      { controlId: "SI.L1-3.14.2", supportType: "full_support" },
      { controlId: "SI.L1-3.14.4", supportType: "full_support" },
      { controlId: "SI.L1-3.14.5", supportType: "full_support" },
    ],
    evidenceItems: [
      {
        title: "Patch / Update Compliance Report",
        evidenceType: "Report",
        suggestedFilename: "Patch-Compliance-Report-YYYY-MM-DD.xlsx",
        sourceSystem: "Patch management / MDM / WSUS",
        mustShow: "System name, patch status, missing patches, last scan date",
      },
      {
        title: "Anti-Malware Deployment Status",
        evidenceType: "Screenshot",
        suggestedFilename: "Antivirus-Status-YYYY-MM-DD.pdf",
        sourceSystem: "Anti-malware management console",
        mustShow: "All in-scope systems, protection status, definition version, last updated",
      },
      {
        title: "Periodic Scan Schedule Configuration",
        evidenceType: "Screenshot",
        suggestedFilename: "Scan-Schedule-Config-YYYY-MM-DD.pdf",
        sourceSystem: "Anti-malware console",
        mustShow: "Scan frequency, last scan date, systems covered",
      },
      {
        title: "Real-Time Protection Configuration",
        evidenceType: "Screenshot",
        suggestedFilename: "Realtime-Protection-Config-YYYY-MM-DD.pdf",
        sourceSystem: "Anti-malware console / endpoint policy",
        mustShow: "Real-time scanning enabled, file-source scanning enabled",
      },
    ],
    documents: [
      { title: "Patch Management Policy", docType: "policy" },
      { title: "Malware Protection Procedure", docType: "procedure" },
    ],
    checklistItems: [
      "Patch management process defined",
      "Patch compliance report run for all in-scope FCI systems",
      "Critical patches applied within policy timeframe",
      "Anti-malware deployed on all in-scope endpoints and servers",
      "Anti-malware definitions set to auto-update and are current",
      "Periodic scans scheduled and running",
      "Real-time scanning enabled for externally sourced files",
    ],
  },

  // ── Phase 6: Self-Assessment and Affirmation ─────────────────────────────────
  {
    id: "l1-0008-0000-0000-0000-000000000008",
    title: "Complete Level 1 Self-Assessment and Affirmation",
    category: "Assessment",
    phase: 6,
    phaseName: "Self-Assessment and Affirmation",
    profileKey: "CMMC_L1_V2_13",
    priority: "critical",
    effort: "high",
    impactScore: 42,
    sortOrder: 108,
    purpose:
      "Verify that every applicable Level 1 basic safeguarding requirement is MET, confirm supporting evidence, conduct required examine/interview/test activities, record the assessment scope and CAGE codes, prepare the SPRS submission information, prepare the annual affirmation, and retain all assessment artifacts.",
    whyItMatters:
      "CMMC Level 1 requires an annual self-assessment and an annual affirmation submitted through SPRS. Every requirement must be MET — Level 1 does not permit a Plan of Action and Milestones (POA&M) as a path to final status. If any requirement is Not Met, the organization cannot affirm Level 1 compliance and must remediate before submitting. This action formalizes the completion of the entire Level 1 roadmap.",
    operatingProcedure:
      "1. For each of the 17 applicable Level 1 controls, record whether it is MET or NOT MET.\n2. Link supporting evidence to each requirement in the assessment record.\n3. Conduct the required examine, interview, and test activities for each requirement.\n4. Record the assessment scope (systems, users, locations) and all CAGE codes.\n5. Calculate the SPRS score (Level 1 uses a binary approach — all MET = complete).\n6. Prepare the affirmation statement for the senior official or authorized representative.\n7. Submit the self-assessment results and affirmation to SPRS.\n8. Retain all assessment artifacts for a minimum of 3 years (or as required by contract).\n\nIMPORTANT: If any requirement is Not Met — mark this action Attention Needed, create a remediation task, and do not submit the affirmation until all requirements are MET. Do not use POA&M for Level 1.",
    testProcedure:
      "1. Confirm every Level 1 requirement has a MET/NOT MET determination recorded.\n2. Verify each MET determination is supported by linked evidence.\n3. Confirm all required examine/interview/test activities are documented.\n4. Verify CAGE codes are recorded.\n5. Confirm SPRS submission information is prepared.\n6. Verify affirmation statement is prepared and ready for authorized signature.\n7. Confirm artifact retention record is in place.",
    controls: [
      { controlId: "AC.L1-3.1.1", supportType: "evidence_only" },
      { controlId: "AC.L1-3.1.2", supportType: "evidence_only" },
      { controlId: "AC.L1-3.1.20", supportType: "evidence_only" },
      { controlId: "AC.L1-3.1.22", supportType: "evidence_only" },
      { controlId: "IA.L1-3.5.1", supportType: "evidence_only" },
      { controlId: "IA.L1-3.5.2", supportType: "evidence_only" },
      { controlId: "MP.L1-3.8.3", supportType: "evidence_only" },
      { controlId: "PE.L1-3.10.1", supportType: "evidence_only" },
      { controlId: "PE.L1-3.10.3", supportType: "evidence_only" },
      { controlId: "PE.L1-3.10.4", supportType: "evidence_only" },
      { controlId: "PE.L1-3.10.5", supportType: "evidence_only" },
      { controlId: "SC.L1-3.13.1", supportType: "evidence_only" },
      { controlId: "SC.L1-3.13.5", supportType: "evidence_only" },
      { controlId: "SI.L1-3.14.1", supportType: "evidence_only" },
      { controlId: "SI.L1-3.14.2", supportType: "evidence_only" },
      { controlId: "SI.L1-3.14.4", supportType: "evidence_only" },
      { controlId: "SI.L1-3.14.5", supportType: "evidence_only" },
    ],
    evidenceItems: [
      {
        title: "Level 1 Self-Assessment Worksheet",
        evidenceType: "Spreadsheet",
        suggestedFilename: "L1-Self-Assessment-Worksheet-YYYY-MM-DD.xlsx",
        sourceSystem: "Organization-maintained",
        mustShow: "Requirement ID, MET/NOT MET status, evidence reference, assessor name, date",
      },
      {
        title: "SPRS Submission Confirmation",
        evidenceType: "Screenshot",
        suggestedFilename: "SPRS-Submission-Confirmation-YYYY-MM-DD.pdf",
        sourceSystem: "SPRS (Supplier Performance Risk System)",
        mustShow: "Submission confirmation, CAGE code, assessment date, score",
      },
      {
        title: "Annual Affirmation Record",
        evidenceType: "Document",
        suggestedFilename: "Annual-Affirmation-YYYY-MM-DD.pdf",
        sourceSystem: "Organization-maintained",
        mustShow: "Authorized official signature, affirmation statement, date, CAGE code",
      },
      {
        title: "Assessment Artifact Retention Record",
        evidenceType: "Document",
        suggestedFilename: "Assessment-Artifact-Retention-YYYY-MM-DD.docx",
        sourceSystem: "Organization-maintained",
        mustShow: "Artifact list, storage location, retention period, review date",
      },
    ],
    documents: [
      { title: "Level 1 Self-Assessment Plan", docType: "procedure" },
      { title: "SPRS Affirmation Statement", docType: "policy" },
    ],
    checklistItems: [
      "All 17 Level 1 requirements reviewed — MET or NOT MET recorded",
      "Evidence linked to each MET requirement",
      "Examine/interview/test activities documented for each requirement",
      "Assessment scope and CAGE codes recorded",
      "SPRS submission information prepared",
      "Affirmation statement prepared for authorized official",
      "Self-assessment submitted to SPRS",
      "Assessment artifacts retained (minimum 3 years or per contract)",
    ],
  },
];
