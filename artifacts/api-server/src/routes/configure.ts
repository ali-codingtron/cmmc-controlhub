import { Router } from "express";
import {
  db,
  controlsTable,
  controlConfigureContentTable,
  controlConfigStepsTable,
  orgControlStepProgressTable,
} from "@workspace/db";
import { eq, and, inArray } from "drizzle-orm";
import { requireAuth } from "../lib/auth";
import { requireOrg } from "../middleware/org";
import { randomUUID } from "crypto";
import { CONFIGURE_SEED_PART2 } from "../data/configure-seed-part2";

const router = Router();

// ── Seed Data ──────────────────────────────────────────────────────────────

interface ConfigSeed {
  controlId: string; // e.g. "AC.L1-3.1.1"
  implementationApproach: string;
  systemsUsed: string[];
  steps: {
    stepNumber: number;
    title: string;
    instruction: string;
    systemPortal?: string;
    navigationPath?: string;
    recommendedSetting?: string;
    expectedResult?: string;
    evidenceHint?: string;
  }[];
  evidenceRequirements: {
    title: string;
    type: string;
    filename: string;
    location: string;
    mustShow: string;
  }[];
  testProcedures: {
    name: string;
    steps: string;
    expectedResult: string;
    passCriteria: string;
  }[];
  closeoutChecklist: string[];
}

const CONFIGURE_SEED: ConfigSeed[] = [
  {
    controlId: "AC.L1-3.1.1",
    implementationApproach: `Limit system access to authorized users, processes acting on behalf of authorized users, and devices (including other systems). Every account that can access CUI systems must belong to a named, approved individual with documented business need. Use named accounts (no shared passwords), role-based access groups, MFA, and documented access approvals. Review accounts regularly and disable or remove accounts when access is no longer needed.\n\nFor small businesses using Microsoft 365: Entra ID manages all identities. Assign users to security groups aligned to their job role, not to individual apps. Guest accounts must be explicitly approved by management.`,
    systemsUsed: ["Microsoft Entra Admin Center", "Microsoft 365 Admin Center", "SharePoint Admin Center", "Microsoft Intune Admin Center", "Ticketing / Approval System"],
    steps: [
      { stepNumber: 1, title: "Review All Active User Accounts", instruction: "Export the full user list from Entra ID. Identify all active accounts and confirm each belongs to a current, authorized employee or contractor with documented business need.", systemPortal: "Microsoft Entra Admin Center", navigationPath: "Identity > Users > All Users", expectedResult: "List of all active accounts with display name, UPN, account type, and last sign-in.", evidenceHint: "Export as CSV — screenshot or file upload." },
      { stepNumber: 2, title: "Identify Guest, Shared, and Service Accounts", instruction: "Filter the user list for guest accounts (UserType = Guest) and service/shared accounts. Confirm each guest has a documented approval from management. Confirm shared accounts are not used for CUI-related activities.", systemPortal: "Microsoft Entra Admin Center", navigationPath: "Identity > Users > All Users > filter by Guest", recommendedSetting: "Guest access should be limited; shared accounts should be avoided for CUI.", expectedResult: "List of guest/shared accounts with approval documentation.", evidenceHint: "Screenshot of guest accounts with notes on approval status." },
      { stepNumber: 3, title: "Review Privileged Role Assignments", instruction: "Navigate to Roles and Administrators. List all users with privileged roles (Global Admin, Security Admin, etc.). Confirm each has documented management approval and active business need.", systemPortal: "Microsoft Entra Admin Center", navigationPath: "Identity > Roles & admins > All roles", recommendedSetting: "Privileged roles should be assigned to the minimum number of users required.", expectedResult: "List of privileged role assignments with justifications.", evidenceHint: "Export role assignment list or screenshot." },
      { stepNumber: 4, title: "Verify MFA is Enforced for All Users", instruction: "Check that Conditional Access or per-user MFA requires MFA for all accounts with access to CUI. Verify no accounts are excluded from MFA enforcement.", systemPortal: "Microsoft Entra Admin Center", navigationPath: "Protection > Conditional Access > Policies", recommendedSetting: "Require MFA for all users — no exclusions for CUI-access accounts.", expectedResult: "Conditional Access policy shows MFA required for all users.", evidenceHint: "Screenshot of Conditional Access policy configuration." },
      { stepNumber: 5, title: "Identify and Disable Stale/Inactive Accounts", instruction: "Filter for accounts with last sign-in more than 30 days ago. Confirm whether each account is still required. Disable or delete accounts for users who have left or no longer need access.", systemPortal: "Microsoft Entra Admin Center", navigationPath: "Identity > Users > All Users > filter by Last sign-in", recommendedSetting: "Accounts inactive for 30+ days without documented reason should be disabled.", expectedResult: "Stale accounts are reviewed, disabled, or deleted with documented rationale.", evidenceHint: "Screenshot of disabled accounts or change tickets." },
      { stepNumber: 6, title: "Review CUI-Related Group Memberships", instruction: "Review membership of groups that grant access to SharePoint sites, Teams, or applications containing CUI. Confirm all members have current business justification.", systemPortal: "Microsoft Entra Admin Center", navigationPath: "Identity > Groups > All Groups", expectedResult: "Group membership list confirms all members are authorized.", evidenceHint: "Export group membership list for CUI-related groups." },
      { stepNumber: 7, title: "Export Evidence and Update SSP", instruction: "Export the final user list, privileged role assignments, and group memberships. Upload as evidence. Update the SSP implementation narrative for AC.L1-3.1.1 to reflect current implementation.", systemPortal: "Microsoft Entra Admin Center", navigationPath: "Users > All Users > Export", evidenceHint: "Save as: AC-3.1.1_User_Access_Review_YYYY-MM-DD.xlsx" },
    ],
    evidenceRequirements: [
      { title: "Active User Export", type: "CSV/Export", filename: "AC-3.1.1_Entra_User_Export_YYYY-MM-DD.csv", location: "Microsoft Entra Admin Center > Users > All Users > Export", mustShow: "Display name, UPN, account type, last sign-in date, account status" },
      { title: "Privileged Role Assignment Export", type: "Screenshot/Export", filename: "AC-3.1.1_Privileged_Role_Assignments_YYYY-MM-DD.png", location: "Entra > Roles & admins > All roles", mustShow: "Role name, assigned users, assignment type (eligible/active)" },
      { title: "MFA / Conditional Access Configuration", type: "Screenshot", filename: "AC-3.1.1_MFA_CA_Policy_YYYY-MM-DD.png", location: "Entra > Protection > Conditional Access", mustShow: "Policy name, assignment, MFA requirement, status (Enabled)" },
      { title: "Access Review Worksheet", type: "Spreadsheet", filename: "AC-3.1.1_Access_Review_YYYY-MM-DD.xlsx", location: "Organization-maintained", mustShow: "User, role, business justification, review date, reviewer" },
      { title: "Disabled/Removed Account Evidence", type: "Screenshot/Ticket", filename: "AC-3.1.1_Access_Removal_YYYY-MM-DD.png", location: "Entra > Users or ticketing system", mustShow: "Account status, disable/delete date, authorization reference" },
    ],
    testProcedures: [
      { name: "Unauthorized Account Check", steps: "1. Sample at least 10 active accounts or all if fewer than 10.\n2. For each account, confirm: named owner exists, business justification is documented, account is still needed.\n3. Confirm no shared accounts are used for CUI-related activities.\n4. Confirm no former employee accounts remain active.", expectedResult: "All sampled accounts have authorized owners and documented business need.", passCriteria: "100% of sampled accounts are authorized. No former employees have active accounts. No unauthorized shared accounts." },
      { name: "Privileged Access Validation", steps: "1. List all users with Global Admin, Security Admin, Exchange Admin, SharePoint Admin, or other privileged roles.\n2. Confirm each has documented management approval.\n3. Confirm privileged access is limited to the minimum required users.\n4. Confirm no privileged accounts are shared.", expectedResult: "All privileged accounts are individually assigned and approved.", passCriteria: "All privileged accounts have documented approval. No unauthorized privileged accounts exist." },
      { name: "MFA Enforcement Verification", steps: "1. Attempt to sign in as a test user without MFA.\n2. Verify MFA is prompted and cannot be bypassed.\n3. Confirm Conditional Access policy covers all users accessing CUI systems.", expectedResult: "MFA is required for all user sign-ins to CUI systems.", passCriteria: "No user can access CUI without completing MFA." },
    ],
    closeoutChecklist: [
      "Implementation narrative completed in Implementation tab",
      "All active accounts reviewed and confirmed authorized",
      "Stale/inactive accounts disabled or removed",
      "Privileged role assignments reviewed and documented",
      "MFA enforced for all CUI-access accounts",
      "Guest/external accounts reviewed and approved",
      "Active user export uploaded as evidence",
      "Access review worksheet completed and uploaded",
      "SSP narrative updated for this control",
    ],
  },
  {
    controlId: "AC.L1-3.1.2",
    implementationApproach: `Limit system access to the types of transactions and functions that authorized users are permitted to execute. This means users should only be able to perform actions required for their job role — they cannot access admin functions, financial systems, or sensitive configurations unless explicitly authorized. Implement role-based access control (RBAC) using security groups, application permissions, and least-privilege principles.\n\nFor Microsoft 365: Use Entra ID security groups or Microsoft 365 groups to control access to SharePoint, Teams, Exchange, and applications. Use Conditional Access to restrict what can be done from which device/location.`,
    systemsUsed: ["Microsoft Entra Admin Center", "Microsoft 365 Admin Center", "SharePoint Admin Center", "Microsoft Intune Admin Center", "Microsoft Exchange Admin Center"],
    steps: [
      { stepNumber: 1, title: "Map Roles to Required Functions", instruction: "Document each job role in the organization and the functions/transactions that role requires access to. This forms the basis of your RBAC model.", systemPortal: "Organization documentation", evidenceHint: "Create or update a Role-Function matrix document." },
      { stepNumber: 2, title: "Review SharePoint and Teams Permissions", instruction: "Audit permissions on all SharePoint sites and Teams containing CUI. Ensure only authorized groups/users have access at the appropriate permission level (Read, Edit, Owner).", systemPortal: "SharePoint Admin Center", navigationPath: "Sites > Active sites > select site > Permissions", recommendedSetting: "CUI sites should not use 'Everyone' or 'Everyone except external users' groups.", expectedResult: "Permission lists show only authorized security groups.", evidenceHint: "Screenshot of site permissions for each CUI-related site." },
      { stepNumber: 3, title: "Review Exchange / Email Access", instruction: "Confirm shared mailboxes, distribution lists, and mail-enabled groups used for CUI are restricted to authorized users only. Verify no unauthorized delegates have access to mailboxes.", systemPortal: "Microsoft Exchange Admin Center", navigationPath: "Recipients > Mailboxes or Groups", recommendedSetting: "Delegate access should be documented and limited.", evidenceHint: "Screenshot of mailbox permissions or distribution group membership." },
      { stepNumber: 4, title: "Review Application Role Assignments", instruction: "For SaaS applications integrated with Entra ID, review which users are assigned to each application and what roles they have. Remove assignments for users no longer needing access.", systemPortal: "Microsoft Entra Admin Center", navigationPath: "Applications > Enterprise applications > select app > Users and groups", expectedResult: "Application role assignments match the role-function matrix.", evidenceHint: "Screenshot or export of application role assignments." },
      { stepNumber: 5, title: "Implement or Verify RBAC via Security Groups", instruction: "Ensure access to CUI resources is granted through security groups (not individual assignments where possible). Confirm group membership is reviewed regularly.", systemPortal: "Microsoft Entra Admin Center", navigationPath: "Identity > Groups > All Groups", recommendedSetting: "Use named security groups per role, not individual assignments to resources.", evidenceHint: "Screenshot of group configuration and membership for CUI-access groups." },
    ],
    evidenceRequirements: [
      { title: "Role-Function Matrix", type: "Document/Spreadsheet", filename: "AC-3.1.2_Role_Function_Matrix_YYYY-MM-DD.xlsx", location: "Organization-maintained", mustShow: "Role name, authorized functions/transactions, systems, review date" },
      { title: "SharePoint Site Permissions Export", type: "Screenshot/Export", filename: "AC-3.1.2_SharePoint_Permissions_YYYY-MM-DD.png", location: "SharePoint Admin Center > Sites", mustShow: "Site name, group/user name, permission level" },
      { title: "Application Role Assignment Export", type: "Screenshot/Export", filename: "AC-3.1.2_App_Role_Assignments_YYYY-MM-DD.png", location: "Entra > Enterprise Applications", mustShow: "Application name, user/group, role assigned" },
    ],
    testProcedures: [
      { name: "Role-Based Access Verification", steps: "1. Sample at least 3 users across different job roles.\n2. For each user, confirm they can access only what their role requires.\n3. Attempt to access a resource the user should NOT have access to — verify access is denied.", expectedResult: "Users can only perform authorized transactions and functions.", passCriteria: "No user can access resources or functions beyond their assigned role." },
    ],
    closeoutChecklist: ["Role-Function matrix documented", "SharePoint permissions reviewed", "Application role assignments reviewed", "Security groups implemented for CUI access", "Evidence uploaded and approved", "SSP narrative updated"],
  },
  {
    controlId: "AC.L1-3.1.20",
    implementationApproach: `Verify and control/limit connections to external systems. Before connecting to any external network or system, the organization must verify the connection is authorized and documented. This includes cloud services, partner networks, contractor systems, and internet connections. Implement firewall rules, network segmentation, and Conditional Access to control what external connections are allowed.\n\nFor Microsoft 365: Use Conditional Access to restrict sign-ins by device compliance, location, and risk level. Use network policies and firewall rules to control outbound connections from CUI-handling systems.`,
    systemsUsed: ["Microsoft Entra Admin Center", "Microsoft Defender Portal", "Firewall / Network Console", "Microsoft Intune Admin Center"],
    steps: [
      { stepNumber: 1, title: "Document Authorized External Connections", instruction: "Create or update an inventory of all authorized external connections: cloud services, VPN connections, partner networks, and internet-facing services. Each connection must have a documented business justification and owner.", systemPortal: "Organization documentation", evidenceHint: "Network diagram or external connection inventory document." },
      { stepNumber: 2, title: "Review Firewall Outbound Rules", instruction: "Review outbound firewall rules for CUI-scoped systems. Confirm only authorized external services are permitted. Block all unnecessary outbound connections.", systemPortal: "Firewall / Network Console", navigationPath: "Policies > Outbound rules", recommendedSetting: "Default-deny outbound; allow only documented services.", evidenceHint: "Firewall rule export showing outbound allow rules." },
      { stepNumber: 3, title: "Configure Conditional Access Location Policies", instruction: "Create a Conditional Access policy that requires compliant devices or named locations for sign-ins from external networks. Optionally block sign-ins from high-risk countries.", systemPortal: "Microsoft Entra Admin Center", navigationPath: "Protection > Conditional Access > Policies", recommendedSetting: "Require compliant device or approved MFA method for external access.", evidenceHint: "Screenshot of Conditional Access policy for external network access." },
      { stepNumber: 4, title: "Review Cloud App Connections (OAuth Apps)", instruction: "Review third-party apps connected to your Microsoft 365 tenant via OAuth. Remove any unauthorized or unnecessary app connections.", systemPortal: "Microsoft Defender Portal", navigationPath: "Cloud Apps > Connected apps > App connectors", expectedResult: "Only authorized apps have OAuth access to the tenant.", evidenceHint: "Screenshot of connected apps list." },
    ],
    evidenceRequirements: [
      { title: "External Connection Inventory", type: "Document/Spreadsheet", filename: "AC-3.1.20_External_Connections_YYYY-MM-DD.xlsx", location: "Organization-maintained", mustShow: "Connection name, type, business purpose, owner, authorization date" },
      { title: "Firewall Outbound Rules Export", type: "Export/Screenshot", filename: "AC-3.1.20_Firewall_Outbound_Rules_YYYY-MM-DD.png", location: "Firewall management console", mustShow: "Rule name, destination, port, protocol, enabled status" },
      { title: "Conditional Access External Network Policy", type: "Screenshot", filename: "AC-3.1.20_CA_External_Policy_YYYY-MM-DD.png", location: "Entra > Conditional Access", mustShow: "Policy name, conditions, access controls, enabled status" },
    ],
    testProcedures: [
      { name: "Unauthorized External Connection Test", steps: "1. Attempt to access an unauthorized external service from a CUI-scoped system.\n2. Verify the connection is blocked by firewall policy.\n3. Confirm the block is logged.", expectedResult: "Unauthorized external connections are blocked and logged.", passCriteria: "Firewall blocks unauthorized outbound traffic. All external connections in inventory are authorized and documented." },
    ],
    closeoutChecklist: ["External connection inventory documented", "Firewall outbound rules reviewed", "Conditional Access external policy configured", "OAuth app connections reviewed", "Evidence uploaded", "SSP narrative updated"],
  },
  {
    controlId: "AC.L1-3.1.22",
    implementationApproach: `Control information posted or processed on publicly accessible systems. The organization must ensure that CUI is never posted to public-facing systems (websites, public SharePoint, public Teams channels, public repositories, etc.) without explicit authorization. Implement content review processes and technical controls to prevent accidental public disclosure of CUI.\n\nFor Microsoft 365: Use SharePoint sharing policies to prevent external sharing of CUI-containing content. Use DLP policies to detect and block CUI from being shared externally.`,
    systemsUsed: ["Microsoft Purview Portal", "SharePoint Admin Center", "Microsoft 365 Admin Center", "Microsoft Defender Portal"],
    steps: [
      { stepNumber: 1, title: "Review SharePoint External Sharing Settings", instruction: "Review and restrict external sharing settings for SharePoint to prevent CUI from being shared with unauthenticated users or unauthorized external accounts.", systemPortal: "SharePoint Admin Center", navigationPath: "Policies > Sharing", recommendedSetting: "Set external sharing to 'New and existing guests' or 'Only people in your organization' for CUI sites.", evidenceHint: "Screenshot of SharePoint sharing policy settings." },
      { stepNumber: 2, title: "Configure Data Loss Prevention (DLP) Policy", instruction: "Create or verify a DLP policy that detects CUI content (based on sensitive info types) and blocks or alerts when it is shared externally or posted to public locations.", systemPortal: "Microsoft Purview Portal", navigationPath: "Data loss prevention > Policies", recommendedSetting: "Block external sharing of content containing CUI sensitive information types.", evidenceHint: "Screenshot of DLP policy configuration showing conditions and actions." },
      { stepNumber: 3, title: "Review Public-Facing Website Content", instruction: "If the organization has public websites, review content for any CUI or sensitive operational information. Remove or redact any content that should not be publicly accessible.", systemPortal: "Website CMS / hosting platform", evidenceHint: "Screenshot or record of public website content review." },
      { stepNumber: 4, title: "Review Microsoft 365 Group / Teams Privacy Settings", instruction: "Confirm that Teams and Microsoft 365 Groups containing CUI are set to Private (not Public). Public groups can be joined by any user in the tenant.", systemPortal: "Microsoft Teams Admin Center / Entra", navigationPath: "Teams > Manage teams > Privacy column", recommendedSetting: "All Teams/Groups containing CUI must be Private.", evidenceHint: "Screenshot of Teams privacy settings for CUI-related teams." },
    ],
    evidenceRequirements: [
      { title: "SharePoint External Sharing Policy", type: "Screenshot", filename: "AC-3.1.22_SharePoint_Sharing_Policy_YYYY-MM-DD.png", location: "SharePoint Admin Center > Policies > Sharing", mustShow: "External sharing level, guest access settings" },
      { title: "DLP Policy Configuration", type: "Screenshot", filename: "AC-3.1.22_DLP_Policy_YYYY-MM-DD.png", location: "Microsoft Purview > DLP > Policies", mustShow: "Policy name, conditions (CUI sensitive types), actions (block/alert), status" },
      { title: "Teams Privacy Settings Review", type: "Screenshot", filename: "AC-3.1.22_Teams_Privacy_YYYY-MM-DD.png", location: "Teams Admin Center > Manage teams", mustShow: "Team name, privacy setting (Public/Private) for all CUI-related teams" },
    ],
    testProcedures: [
      { name: "CUI Public Disclosure Prevention Test", steps: "1. Attempt to share a document containing CUI with an external user.\n2. Verify the DLP policy blocks or alerts on the share attempt.\n3. Verify no CUI content is accessible on public-facing systems.", expectedResult: "CUI cannot be shared externally without authorization. DLP detects and blocks unauthorized sharing.", passCriteria: "DLP policy triggers on CUI sharing attempt. No CUI found on public-facing systems." },
    ],
    closeoutChecklist: ["SharePoint external sharing restricted", "DLP policy configured for CUI", "Public website reviewed for CUI", "Teams privacy settings reviewed", "Evidence uploaded", "SSP narrative updated"],
  },
  {
    controlId: "IA.L1-3.5.1",
    implementationApproach: `Identify information system users, processes acting on behalf of users, and devices. Every user, service account, and device that accesses CUI systems must have a unique identifier — no shared or anonymous accounts for CUI access. Maintain an up-to-date inventory of authorized users, service accounts, and devices.\n\nFor Microsoft 365 / Entra ID: Each user must have a unique Entra ID account. Service principals and managed identities must be documented with an owner. Devices must be registered in Entra ID / Intune.`,
    systemsUsed: ["Microsoft Entra Admin Center", "Microsoft Intune Admin Center", "Microsoft 365 Admin Center"],
    steps: [
      { stepNumber: 1, title: "Verify All User Accounts are Uniquely Identified", instruction: "Confirm that every user of CUI systems has an individual, named account. No shared accounts (e.g., 'admin@company.com' used by multiple people) should exist for CUI access.", systemPortal: "Microsoft Entra Admin Center", navigationPath: "Identity > Users > All Users", recommendedSetting: "Each account must have a unique UPN and display name identifying the person.", evidenceHint: "Export user list showing UPN, display name, and account type." },
      { stepNumber: 2, title: "Inventory Service Accounts and Managed Identities", instruction: "List all service accounts, service principals, and managed identities. Confirm each has a documented owner, purpose, and is regularly reviewed.", systemPortal: "Microsoft Entra Admin Center", navigationPath: "Applications > App registrations + Identity > Service principals", evidenceHint: "Service account inventory document." },
      { stepNumber: 3, title: "Verify Device Registration / Enrollment", instruction: "Confirm all devices used to access CUI are enrolled in Intune and have a device ID / Entra ID device record. Unregistered devices should be blocked by Conditional Access.", systemPortal: "Microsoft Intune Admin Center", navigationPath: "Devices > All Devices", recommendedSetting: "All CUI-access devices must be Entra ID joined or registered.", evidenceHint: "Screenshot of Intune device list or Conditional Access require-compliant-device policy." },
    ],
    evidenceRequirements: [
      { title: "User Account Inventory", type: "CSV/Export", filename: "IA-3.5.1_User_Account_Inventory_YYYY-MM-DD.csv", location: "Entra > Users > All Users > Export", mustShow: "UPN, display name, account type, account enabled status" },
      { title: "Service Account Inventory", type: "Document/Spreadsheet", filename: "IA-3.5.1_Service_Account_Inventory_YYYY-MM-DD.xlsx", location: "Organization-maintained", mustShow: "Account name, type, owner, purpose, last reviewed" },
      { title: "Device Registration Export", type: "Screenshot/Export", filename: "IA-3.5.1_Device_Inventory_YYYY-MM-DD.png", location: "Intune > Devices > All Devices", mustShow: "Device name, owner, compliance status, enrollment date" },
    ],
    testProcedures: [
      { name: "Unique Identifier Verification", steps: "1. Sample 10 user accounts from the user list.\n2. Confirm each UPN maps to a single named individual.\n3. Search for accounts with generic names (admin, helpdesk, shared) — confirm none are used for CUI access.\n4. Confirm all CUI-access devices appear in Intune.", expectedResult: "Every CUI-system user and device has a unique identifier.", passCriteria: "No shared accounts used for CUI. All CUI devices are enrolled and identified." },
    ],
    closeoutChecklist: ["User account inventory completed", "Service account inventory documented", "Device inventory verified in Intune", "No shared accounts used for CUI", "Evidence uploaded", "SSP narrative updated"],
  },
  {
    controlId: "IA.L1-3.5.2",
    implementationApproach: `Authenticate (or verify) the identities of users, processes, or devices as a prerequisite to allowing access to organizational information systems. Authentication must be performed before any CUI access is granted. At minimum, this means passwords — but for CUI, MFA is the recommended baseline. Passwords must meet complexity and length requirements.\n\nFor Microsoft 365: Use Entra ID with MFA (Conditional Access) and password protection. Configure password policies to meet NIST SP 800-63B recommendations (minimum 8 characters, no complexity rules, check against banned password list).`,
    systemsUsed: ["Microsoft Entra Admin Center", "Microsoft 365 Admin Center"],
    steps: [
      { stepNumber: 1, title: "Enable and Configure Multi-Factor Authentication", instruction: "Enable MFA for all users via Conditional Access (preferred) or per-user MFA. Ensure MFA is required for every sign-in to CUI-related services. Verify no users are excluded.", systemPortal: "Microsoft Entra Admin Center", navigationPath: "Protection > Conditional Access > Policies", recommendedSetting: "Require MFA for all users — grant access only when MFA is satisfied.", evidenceHint: "Screenshot of Conditional Access MFA policy showing enabled status and user scope." },
      { stepNumber: 2, title: "Configure Password Protection", instruction: "Enable Entra ID Password Protection to block commonly used passwords. Configure the custom banned password list with organization-specific terms.", systemPortal: "Microsoft Entra Admin Center", navigationPath: "Protection > Authentication methods > Password protection", recommendedSetting: "Enable both global and custom banned password lists.", evidenceHint: "Screenshot of Password Protection settings." },
      { stepNumber: 3, title: "Verify SSPR is Configured", instruction: "Configure Self-Service Password Reset (SSPR) to require authentication verification. Ensure SSPR is not configured in a way that bypasses MFA.", systemPortal: "Microsoft Entra Admin Center", navigationPath: "Protection > Password reset", recommendedSetting: "Require at least 2 authentication methods for SSPR.", evidenceHint: "Screenshot of SSPR configuration showing required authentication methods." },
      { stepNumber: 4, title: "Review Authentication Methods Registered", instruction: "Review the Authentication Methods Activity report to confirm all users have MFA authentication methods registered. Follow up with users who have not registered.", systemPortal: "Microsoft Entra Admin Center", navigationPath: "Protection > Authentication methods > Activity", evidenceHint: "Screenshot of authentication method registration coverage." },
    ],
    evidenceRequirements: [
      { title: "MFA / Conditional Access Policy", type: "Screenshot", filename: "IA-3.5.2_MFA_CA_Policy_YYYY-MM-DD.png", location: "Entra > Conditional Access", mustShow: "Policy name, users in scope, grant controls (Require MFA), enabled status" },
      { title: "Password Protection Configuration", type: "Screenshot", filename: "IA-3.5.2_Password_Protection_YYYY-MM-DD.png", location: "Entra > Authentication methods > Password protection", mustShow: "Enable password protection, custom banned list, lockout settings" },
      { title: "MFA Registration Coverage", type: "Screenshot", filename: "IA-3.5.2_MFA_Registration_YYYY-MM-DD.png", location: "Entra > Authentication methods > Activity", mustShow: "Number of users registered for MFA vs. total users" },
    ],
    testProcedures: [
      { name: "MFA Bypass Attempt", steps: "1. Sign in as a test user with only a password (no MFA).\n2. Verify MFA is prompted and access is denied if MFA is not completed.\n3. Confirm the Conditional Access policy blocks non-MFA sign-ins.", expectedResult: "No CUI access is possible without completing MFA.", passCriteria: "MFA prompt appears for all users. Access is denied if MFA is not completed." },
    ],
    closeoutChecklist: ["MFA enabled for all CUI-access accounts", "Password protection configured", "SSPR configured with multi-step verification", "MFA registration coverage reviewed", "Evidence uploaded", "SSP narrative updated"],
  },
  {
    controlId: "SI.L1-3.14.1",
    implementationApproach: `Identify, report, and correct information and information system flaws in a timely manner. This means patching operating systems, applications, and firmware on a regular schedule. Critical vulnerabilities should be patched within a defined timeframe (recommended: Critical within 15 days, High within 30 days). Use automated patch management where possible.\n\nFor Microsoft 365 / Intune: Use Intune Update Rings for Windows devices. Use Defender Vulnerability Management to track and prioritize patch work.`,
    systemsUsed: ["Microsoft Intune Admin Center", "Microsoft Defender Portal", "WSUS / SCCM (if applicable)"],
    steps: [
      { stepNumber: 1, title: "Configure Windows Update Rings in Intune", instruction: "Create Update Ring policies in Intune to automatically deploy Windows updates to CUI-scoped devices. Set a maximum deferral that meets your patch SLA.", systemPortal: "Microsoft Intune Admin Center", navigationPath: "Devices > Windows > Update rings for Windows 10 and later", recommendedSetting: "Quality updates: 7-day deferral. Feature updates: 30-day deferral. Deadline: 3 days.", evidenceHint: "Screenshot of Update Ring configuration." },
      { stepNumber: 2, title: "Review Patch Compliance Dashboard", instruction: "Check the Windows Update compliance report in Intune. Identify devices that are not compliant with the current patch policy. Create remediation tickets for non-compliant devices.", systemPortal: "Microsoft Intune Admin Center", navigationPath: "Reports > Windows updates > Windows Update compliance report", expectedResult: "All CUI-scoped devices show compliant patch status.", evidenceHint: "Screenshot of compliance dashboard showing patch status by device." },
      { stepNumber: 3, title: "Review Vulnerability Management Findings", instruction: "Open Defender Vulnerability Management and review current vulnerabilities on CUI-scoped devices. Prioritize Critical and High CVEs. Create remediation tasks for unpatched vulnerabilities.", systemPortal: "Microsoft Defender Portal", navigationPath: "Vulnerability management > Recommendations", recommendedSetting: "Critical CVEs: remediate within 15 days. High CVEs: remediate within 30 days.", evidenceHint: "Export of vulnerability findings with severity and remediation status." },
      { stepNumber: 4, title: "Configure Third-Party Application Updates", instruction: "If Intune manages third-party app updates, configure policies for common apps (Chrome, Adobe, etc.). Alternatively, document the process for manually tracking and applying third-party patches.", systemPortal: "Microsoft Intune Admin Center", navigationPath: "Apps > Windows > Windows apps", evidenceHint: "Screenshot of app update policies or manual patch procedure document." },
    ],
    evidenceRequirements: [
      { title: "Update Ring Configuration", type: "Screenshot", filename: "SI-3.14.1_Update_Ring_Config_YYYY-MM-DD.png", location: "Intune > Devices > Update rings", mustShow: "Update ring name, deferral settings, deadline, assigned groups" },
      { title: "Patch Compliance Report", type: "Screenshot/Export", filename: "SI-3.14.1_Patch_Compliance_YYYY-MM-DD.png", location: "Intune > Reports > Windows updates", mustShow: "Device name, OS version, patch status, last check-in date" },
      { title: "Vulnerability Findings Export", type: "Export/Screenshot", filename: "SI-3.14.1_Vulnerability_Findings_YYYY-MM-DD.png", location: "Defender > Vulnerability management > Recommendations", mustShow: "CVE, severity, affected devices, remediation status, due date" },
    ],
    testProcedures: [
      { name: "Patch SLA Compliance Check", steps: "1. Identify the 5 most recent Critical/High CVEs patched.\n2. Confirm each was remediated within the defined SLA (e.g., Critical: 15 days, High: 30 days).\n3. Confirm the patch compliance report shows no CUI devices are missing critical patches beyond the SLA.", expectedResult: "All critical patches applied within defined SLA.", passCriteria: "No CUI device is missing a Critical or High patch beyond the SLA. Patch SLA policy is documented." },
    ],
    closeoutChecklist: ["Update ring configured in Intune", "Patch compliance reviewed", "Vulnerability findings reviewed and triaged", "Critical/High patches applied within SLA", "Evidence uploaded", "SSP narrative updated"],
  },
  {
    controlId: "SI.L1-3.14.2",
    implementationApproach: `Provide protection from malicious code at appropriate locations within organizational information systems. Deploy and maintain endpoint protection (antivirus/antimalware) on all CUI-scoped devices. Ensure signatures and definitions are kept up to date. Configure real-time protection, scheduled scans, and alerting.\n\nFor Microsoft 365: Microsoft Defender Antivirus is built into Windows and managed through Intune. Enable and configure Microsoft Defender Antivirus via Endpoint Security policies.`,
    systemsUsed: ["Microsoft Intune Admin Center", "Microsoft Defender Portal"],
    steps: [
      { stepNumber: 1, title: "Verify Microsoft Defender Antivirus is Enabled", instruction: "Confirm Microsoft Defender Antivirus is active and not disabled on all CUI-scoped Windows devices. Check for any third-party AV conflicts.", systemPortal: "Microsoft Intune Admin Center", navigationPath: "Endpoint security > Antivirus > Microsoft Defender Antivirus", recommendedSetting: "Real-time protection: On. Cloud-delivered protection: On. Automatic sample submission: On.", evidenceHint: "Screenshot of Defender Antivirus policy configuration." },
      { stepNumber: 2, title: "Configure Endpoint Security Antivirus Policy", instruction: "Create an Endpoint Security Antivirus policy in Intune and assign it to all CUI-scoped device groups. Configure scan settings, exclusions (minimize these), and protection cloud settings.", systemPortal: "Microsoft Intune Admin Center", navigationPath: "Endpoint security > Antivirus > Create policy", recommendedSetting: "Enable all real-time protection features. Configure weekly full scan. Minimize exclusions.", evidenceHint: "Screenshot of Antivirus policy settings and assignments." },
      { stepNumber: 3, title: "Review Antivirus Compliance Report", instruction: "Check the Antivirus agent status report in Intune to verify all CUI devices have Defender running and signatures are up to date.", systemPortal: "Microsoft Intune Admin Center", navigationPath: "Reports > Microsoft Defender Antivirus > Antivirus agent status", expectedResult: "All CUI devices show Defender active with current signatures.", evidenceHint: "Screenshot of antivirus compliance report." },
      { stepNumber: 4, title: "Review Active Malware Detections", instruction: "Review the Defender portal for any active malware detections on CUI-scoped devices. Remediate any active threats and document the remediation.", systemPortal: "Microsoft Defender Portal", navigationPath: "Incidents & alerts > Alerts", expectedResult: "No unresolved malware detections on CUI devices.", evidenceHint: "Screenshot of alerts dashboard showing resolved status for any detections." },
    ],
    evidenceRequirements: [
      { title: "Antivirus Policy Configuration", type: "Screenshot", filename: "SI-3.14.2_AV_Policy_Config_YYYY-MM-DD.png", location: "Intune > Endpoint security > Antivirus", mustShow: "Policy name, settings (real-time protection, cloud protection), assigned groups" },
      { title: "Antivirus Compliance Report", type: "Screenshot", filename: "SI-3.14.2_AV_Compliance_Report_YYYY-MM-DD.png", location: "Intune > Reports > Antivirus agent status", mustShow: "Device name, Defender status, signature version, last scan date" },
      { title: "Malware Detection Review", type: "Screenshot", filename: "SI-3.14.2_Malware_Detection_Review_YYYY-MM-DD.png", location: "Defender > Incidents & alerts", mustShow: "Alert status (active/resolved), device, threat name, remediation action" },
    ],
    testProcedures: [
      { name: "Antivirus Active Protection Test", steps: "1. Confirm Defender is active on at least 5 sampled CUI devices.\n2. Verify signatures are updated within the last 24 hours.\n3. Attempt to download the EICAR test file on a CUI device — verify Defender detects and blocks it.", expectedResult: "Defender is active, signatures are current, and malicious files are blocked.", passCriteria: "All sampled CUI devices have active Defender. EICAR test file is detected and blocked." },
    ],
    closeoutChecklist: ["Defender Antivirus enabled on all CUI devices", "Antivirus policy configured in Intune", "Compliance report reviewed", "Active threats remediated", "Evidence uploaded", "SSP narrative updated"],
  },
  {
    controlId: "AU.L2-3.3.1",
    implementationApproach: `Create and retain system audit logs and records to enable the monitoring, analysis, investigation, and reporting of unlawful or unauthorized system activity. Configure logging on all CUI systems to capture authentication events, privilege escalation, configuration changes, data access, and failed access attempts. Logs must be retained for a sufficient period (minimum 90 days recommended, 1 year preferred).\n\nFor Microsoft 365: Enable Unified Audit Log in Microsoft Purview. Configure audit log retention policies. Enable Defender audit logging.`,
    systemsUsed: ["Microsoft Purview Portal", "Microsoft Entra Admin Center", "Microsoft Defender Portal", "Microsoft 365 Admin Center"],
    steps: [
      { stepNumber: 1, title: "Enable Microsoft 365 Unified Audit Log", instruction: "Confirm that the Unified Audit Log is enabled for your Microsoft 365 tenant. This captures activity across Exchange, SharePoint, Teams, Entra ID, and other services.", systemPortal: "Microsoft Purview Portal", navigationPath: "Audit > Start recording user and admin activity", recommendedSetting: "Audit log must be enabled. For E3 licenses: 90-day retention. For E5 or add-on: 1-year retention.", evidenceHint: "Screenshot confirming audit log is enabled." },
      { stepNumber: 2, title: "Configure Audit Log Retention Policy", instruction: "Create an audit log retention policy to extend retention beyond the default period. Prioritize retention for user sign-in, file access, admin activity, and DLP events.", systemPortal: "Microsoft Purview Portal", navigationPath: "Audit > Audit retention policies", recommendedSetting: "Retain all audit logs for minimum 1 year. Extend to 10 years for E5 licenses.", evidenceHint: "Screenshot of audit retention policy configuration." },
      { stepNumber: 3, title: "Enable Entra ID Sign-In and Audit Logs", instruction: "Confirm Entra ID diagnostic settings are configured to export sign-in logs and audit logs to Log Analytics Workspace or Storage Account for long-term retention.", systemPortal: "Microsoft Entra Admin Center", navigationPath: "Monitoring & health > Diagnostic settings", recommendedSetting: "Send all sign-in and audit logs to Log Analytics Workspace.", evidenceHint: "Screenshot of Diagnostic Settings configuration." },
      { stepNumber: 4, title: "Configure Defender Alert Logging", instruction: "Confirm Microsoft Defender is configured to generate alerts for key events: malware detection, unauthorized access, suspicious sign-in. Verify alerts are being routed to the security team.", systemPortal: "Microsoft Defender Portal", navigationPath: "Settings > Endpoints > Advanced features", recommendedSetting: "Enable all security alert categories relevant to CUI systems.", evidenceHint: "Screenshot of Defender alert configuration." },
      { stepNumber: 5, title: "Perform a Test Audit Log Search", instruction: "Run a sample audit log search for the past 7 days covering user sign-ins, file access, and admin changes. Confirm log entries are present and contain the expected fields.", systemPortal: "Microsoft Purview Portal", navigationPath: "Audit > Search", expectedResult: "Audit log search returns results for sign-in, file access, and admin activity events.", evidenceHint: "Screenshot of audit search results." },
    ],
    evidenceRequirements: [
      { title: "Audit Log Enabled Confirmation", type: "Screenshot", filename: "AU-3.3.1_Audit_Log_Enabled_YYYY-MM-DD.png", location: "Purview > Audit", mustShow: "Audit logging is turned On; date enabled" },
      { title: "Audit Retention Policy", type: "Screenshot", filename: "AU-3.3.1_Audit_Retention_Policy_YYYY-MM-DD.png", location: "Purview > Audit > Retention policies", mustShow: "Policy name, retention period, workloads covered" },
      { title: "Entra ID Diagnostic Settings", type: "Screenshot", filename: "AU-3.3.1_Entra_Diagnostic_Settings_YYYY-MM-DD.png", location: "Entra > Monitoring > Diagnostic settings", mustShow: "Log categories enabled, destination (Log Analytics / Storage Account)" },
      { title: "Sample Audit Log Search", type: "Screenshot", filename: "AU-3.3.1_Audit_Log_Sample_Search_YYYY-MM-DD.png", location: "Purview > Audit > Search results", mustShow: "Search date range, activity types, sample results with user, date, operation" },
    ],
    testProcedures: [
      { name: "Audit Log Coverage Verification", steps: "1. Search the audit log for sign-in events from the past 7 days — confirm entries exist.\n2. Search for file access events on a CUI SharePoint site — confirm entries exist.\n3. Search for an admin configuration change — confirm it was logged.\n4. Confirm log entries include: date/time, user, operation, target resource, IP address.", expectedResult: "Audit log captures authentication, file access, and admin activity with required fields.", passCriteria: "All required event types are captured. Retention policy meets minimum requirement." },
    ],
    closeoutChecklist: ["Unified Audit Log enabled", "Audit retention policy configured (min 1 year)", "Entra ID diagnostic logs configured", "Defender alerts configured", "Audit log search verified", "Evidence uploaded", "SSP narrative updated"],
  },
  {
    controlId: "AU.L2-3.3.5",
    implementationApproach: `Correlate audit record review, analysis, and reporting processes for investigation and response to indications of unlawful, unauthorized, suspected, or unusual activity. The organization must regularly review audit logs — not just collect them. Define who reviews logs, how often, and what constitutes a suspicious event that requires follow-up.\n\nFor Microsoft 365: Use Microsoft Sentinel or the Defender portal for SIEM correlation. If Sentinel is not available, conduct manual Purview audit log reviews on a defined schedule.`,
    systemsUsed: ["Microsoft Purview Portal", "Microsoft Defender Portal", "Microsoft Sentinel (if licensed)", "Microsoft Entra Admin Center"],
    steps: [
      { stepNumber: 1, title: "Define Log Review Schedule and Responsibility", instruction: "Document who is responsible for reviewing audit logs, how often (daily for high-risk events, weekly minimum), and what types of events require immediate escalation.", systemPortal: "Organization documentation", evidenceHint: "Log review procedure document or monitoring calendar." },
      { stepNumber: 2, title: "Configure Defender XDR Alerts and Incidents", instruction: "Review the Defender portal alert queue. Configure alert severity thresholds and routing. Assign alerts to the security team for triage and response.", systemPortal: "Microsoft Defender Portal", navigationPath: "Incidents & alerts > Alerts", recommendedSetting: "All High and Critical alerts should be triaged within 4 hours.", evidenceHint: "Screenshot of alert queue and assignment policy." },
      { stepNumber: 3, title: "Perform Weekly Audit Log Review", instruction: "Conduct a structured weekly review of the audit log. Search for: failed sign-ins, privileged account activity, external sharing, DLP policy matches, and anomalous file access. Document findings.", systemPortal: "Microsoft Purview Portal", navigationPath: "Audit > Search", evidenceHint: "Screenshot of weekly audit search with date, categories, and summary of findings." },
      { stepNumber: 4, title: "Document Findings and Escalation", instruction: "For each log review, document: review date, reviewer, events reviewed, findings, and any escalation actions. Maintain this record for audit purposes.", systemPortal: "Organization documentation / ticketing system", evidenceHint: "Completed log review record or ticket." },
    ],
    evidenceRequirements: [
      { title: "Log Review Procedure", type: "Document", filename: "AU-3.3.5_Log_Review_Procedure_YYYY-MM-DD.docx", location: "Organization documentation", mustShow: "Review schedule, responsible roles, event categories reviewed, escalation process" },
      { title: "Completed Log Review Records", type: "Document/Spreadsheet", filename: "AU-3.3.5_Log_Review_Record_YYYY-MM-DD.xlsx", location: "Organization documentation", mustShow: "Review date, reviewer, events reviewed, findings, escalation actions" },
      { title: "Defender Alert Queue Screenshot", type: "Screenshot", filename: "AU-3.3.5_Defender_Alerts_YYYY-MM-DD.png", location: "Defender > Incidents & alerts", mustShow: "Alert severity, status, assigned to, resolution" },
    ],
    testProcedures: [
      { name: "Log Review Currency Check", steps: "1. Request the last 3 log review records.\n2. Confirm reviews were completed on schedule (weekly minimum).\n3. Confirm each record documents: reviewer, date, events reviewed, findings.\n4. Verify at least one finding was escalated in the past quarter.", expectedResult: "Regular log reviews are performed and documented.", passCriteria: "Log reviews completed on schedule. Findings documented. Escalation process demonstrated." },
    ],
    closeoutChecklist: ["Log review schedule defined and documented", "Defender alerts configured and assigned", "Weekly log review performed and documented", "Escalation process documented", "Evidence uploaded", "SSP narrative updated"],
  },
  {
    controlId: "AC.L2-3.1.3",
    implementationApproach: `Control the flow of CUI in accordance with approved authorizations. CUI must only flow to authorized recipients and systems — it must not be emailed to personal accounts, stored in unauthorized cloud services, or transferred to systems outside the authorization boundary. Implement technical controls to enforce data flow restrictions.\n\nFor Microsoft 365: Use DLP policies, information barriers, and sensitivity labels to control CUI flow. Configure transport rules to prevent CUI from being sent to unauthorized external domains.`,
    systemsUsed: ["Microsoft Purview Portal", "Microsoft Exchange Admin Center", "SharePoint Admin Center"],
    steps: [
      { stepNumber: 1, title: "Configure Sensitivity Labels for CUI", instruction: "Create sensitivity labels in Microsoft Purview for CUI content. Configure labels to apply encryption and access restrictions. Train users to apply labels to CUI documents.", systemPortal: "Microsoft Purview Portal", navigationPath: "Information protection > Labels", recommendedSetting: "CUI label should restrict external sharing and apply encryption.", evidenceHint: "Screenshot of sensitivity label configuration for CUI." },
      { stepNumber: 2, title: "Configure DLP Policy to Block Unauthorized CUI Flow", instruction: "Create a DLP policy that detects CUI (by sensitivity label or content match) and blocks or alerts when sent to unauthorized external recipients or uploaded to unauthorized services.", systemPortal: "Microsoft Purview Portal", navigationPath: "Data loss prevention > Policies", recommendedSetting: "Block sending CUI to personal email domains. Alert when CUI is uploaded to non-approved cloud storage.", evidenceHint: "Screenshot of DLP policy configuration with conditions and actions." },
      { stepNumber: 3, title: "Configure Exchange Transport Rules for CUI", instruction: "Create transport rules to restrict outbound email containing CUI to approved external domains only. Quarantine or reject emails to unauthorized recipients.", systemPortal: "Microsoft Exchange Admin Center", navigationPath: "Mail flow > Rules", recommendedSetting: "Block or quarantine outbound email with CUI sensitivity label to non-approved domains.", evidenceHint: "Screenshot of transport rule configuration." },
    ],
    evidenceRequirements: [
      { title: "Sensitivity Label Configuration", type: "Screenshot", filename: "AC-3.1.3_Sensitivity_Labels_YYYY-MM-DD.png", location: "Purview > Information protection > Labels", mustShow: "Label name, encryption settings, external sharing restriction" },
      { title: "DLP Policy for CUI Flow Control", type: "Screenshot", filename: "AC-3.1.3_DLP_CUI_Flow_Policy_YYYY-MM-DD.png", location: "Purview > DLP > Policies", mustShow: "Policy conditions (sensitivity label / content types), actions (block/alert), scope" },
    ],
    testProcedures: [
      { name: "CUI Flow Control Test", steps: "1. Attempt to email a CUI-labeled document to a personal email address.\n2. Verify the DLP policy blocks or alerts on the attempt.\n3. Confirm the sender receives a policy tip or block notification.", expectedResult: "CUI cannot flow to unauthorized recipients without authorization.", passCriteria: "DLP blocks CUI email to unauthorized recipients. Alert generated and logged." },
    ],
    closeoutChecklist: ["Sensitivity labels created for CUI", "DLP policy configured for CUI flow", "Exchange transport rules configured", "Evidence uploaded", "SSP narrative updated"],
  },
  {
    controlId: "AC.L2-3.1.5",
    implementationApproach: `Employ the principle of least privilege, including for specific security functions and privileged accounts. Users should only have the minimum access required to perform their job. Privileged accounts should be separate from standard user accounts (e.g., an admin should have a normal account for email and a separate admin account for administrative tasks). Regularly review and remove unnecessary access.\n\nFor Microsoft 365: Use Privileged Identity Management (PIM) if licensed for just-in-time privileged access. Separate admin accounts from user accounts. Review application permissions regularly.`,
    systemsUsed: ["Microsoft Entra Admin Center", "Microsoft 365 Admin Center", "SharePoint Admin Center"],
    steps: [
      { stepNumber: 1, title: "Separate Administrative Accounts from User Accounts", instruction: "Confirm that administrators have separate accounts for administrative tasks — they should not use their regular email account for admin work. Admin accounts should have no email and no internet browsing.", systemPortal: "Microsoft Entra Admin Center", navigationPath: "Identity > Users > All Users", recommendedSetting: "Admin accounts: UPN format admin-name@domain.com, no mailbox, no user licenses.", evidenceHint: "Screenshot showing admin accounts are separate from regular user accounts." },
      { stepNumber: 2, title: "Review and Minimize Privileged Role Assignments", instruction: "Audit all privileged role assignments. Confirm each privileged role is assigned to the minimum number of users. Remove any assignments that are not actively needed.", systemPortal: "Microsoft Entra Admin Center", navigationPath: "Identity > Roles & admins > All roles", recommendedSetting: "Global Admin should have 2-4 accounts maximum. Prefer scoped roles over global roles.", evidenceHint: "Screenshot of privileged role assignments." },
      { stepNumber: 3, title: "Implement Just-In-Time Access (PIM) if Licensed", instruction: "If using Entra ID P2, configure Privileged Identity Management for eligible role assignments. Administrators request activation when needed, with approval required for high-privilege roles.", systemPortal: "Microsoft Entra Admin Center", navigationPath: "Identity governance > Privileged identity management", recommendedSetting: "Make privileged roles eligible (not permanent). Require justification and approval for activation.", evidenceHint: "Screenshot of PIM role configuration." },
      { stepNumber: 4, title: "Review Application and API Permissions", instruction: "Review permissions granted to enterprise applications and OAuth apps. Remove any applications with excessive permissions that are not actively used.", systemPortal: "Microsoft Entra Admin Center", navigationPath: "Applications > Enterprise applications > Permissions", evidenceHint: "Screenshot of app permission review." },
    ],
    evidenceRequirements: [
      { title: "Privileged Role Assignment Review", type: "Screenshot/Export", filename: "AC-3.1.5_Privileged_Roles_YYYY-MM-DD.png", location: "Entra > Roles & admins > All roles", mustShow: "Role name, assigned users, assignment type (permanent/eligible)" },
      { title: "Admin Account Separation Evidence", type: "Screenshot", filename: "AC-3.1.5_Admin_Account_Separation_YYYY-MM-DD.png", location: "Entra > Users > All Users", mustShow: "Admin accounts visible as separate from user accounts (naming convention, no license)" },
    ],
    testProcedures: [
      { name: "Least Privilege Verification", steps: "1. Sample 5 non-admin users and confirm they cannot perform admin functions.\n2. Confirm admin accounts have no unnecessary licenses or mailboxes.\n3. Verify at least 2 but no more than 4 Global Admin accounts exist.", expectedResult: "Users have minimum necessary access. Privileged access is separated and minimized.", passCriteria: "No users have excessive permissions. Admin accounts are separated from user accounts." },
    ],
    closeoutChecklist: ["Admin accounts separated from user accounts", "Privileged roles reviewed and minimized", "PIM configured (if P2 licensed)", "Application permissions reviewed", "Evidence uploaded", "SSP narrative updated"],
  },
  {
    controlId: "AC.L2-3.1.8",
    implementationApproach: `Limit unsuccessful logon attempts. Configure account lockout or delays after a defined number of failed authentication attempts to prevent brute-force attacks. For cloud services, use Conditional Access risk-based policies in addition to lockout.\n\nFor Microsoft 365 / Entra ID: Configure Smart Lockout in Entra ID. Use Conditional Access to block high-risk sign-ins automatically.`,
    systemsUsed: ["Microsoft Entra Admin Center"],
    steps: [
      { stepNumber: 1, title: "Configure Entra ID Smart Lockout", instruction: "Configure Smart Lockout settings in Entra ID to lock accounts after a defined number of failed sign-in attempts. Set the lockout threshold and duration.", systemPortal: "Microsoft Entra Admin Center", navigationPath: "Protection > Authentication methods > Password protection", recommendedSetting: "Lockout threshold: 10 attempts. Lockout duration: 60 seconds (increases with repeated failures).", evidenceHint: "Screenshot of Smart Lockout configuration." },
      { stepNumber: 2, title: "Configure Risk-Based Conditional Access", instruction: "Create a Conditional Access policy that blocks or requires step-up authentication for high-risk or medium-risk sign-in risk levels (powered by Entra ID Identity Protection).", systemPortal: "Microsoft Entra Admin Center", navigationPath: "Protection > Conditional Access > Policies", recommendedSetting: "Sign-in risk: High → Block. Sign-in risk: Medium → Require MFA.", evidenceHint: "Screenshot of risk-based Conditional Access policy." },
      { stepNumber: 3, title: "Review Failed Sign-In Log", instruction: "Search the Entra ID sign-in logs for failed authentication events. Identify any accounts with repeated failures that may indicate a brute-force attack.", systemPortal: "Microsoft Entra Admin Center", navigationPath: "Monitoring & health > Sign-in logs > filter Status = Failure", evidenceHint: "Screenshot of failed sign-in log review." },
    ],
    evidenceRequirements: [
      { title: "Smart Lockout Configuration", type: "Screenshot", filename: "AC-3.1.8_Smart_Lockout_Config_YYYY-MM-DD.png", location: "Entra > Authentication methods > Password protection", mustShow: "Lockout threshold value, lockout duration in seconds" },
      { title: "Risk-Based Conditional Access Policy", type: "Screenshot", filename: "AC-3.1.8_Risk_CA_Policy_YYYY-MM-DD.png", location: "Entra > Conditional Access", mustShow: "Policy name, sign-in risk condition, grant/block controls, enabled status" },
    ],
    testProcedures: [
      { name: "Account Lockout Test", steps: "1. Attempt to sign in with an incorrect password multiple times (up to the lockout threshold minus 1).\n2. Verify the account is not permanently locked on the first test.\n3. Exceed the threshold — confirm the account is locked or additional verification is required.\n4. Verify lockout is released after the configured duration.", expectedResult: "Account locks after defined failed attempt threshold.", passCriteria: "Account lockout triggers at configured threshold. Lockout duration matches policy." },
    ],
    closeoutChecklist: ["Smart Lockout configured", "Risk-based Conditional Access policy created", "Failed sign-in log reviewed", "Evidence uploaded", "SSP narrative updated"],
  },
  {
    controlId: "AC.L2-3.1.9",
    implementationApproach: `Provide privacy and security notices consistent with CUI rules (per CUI SAR). Display system use notifications to all users before or during sign-in. The banner must inform users that the system contains government data, is subject to monitoring, and that unauthorized use is prohibited.\n\nFor Microsoft 365: Configure a Terms of Use policy in Entra ID Conditional Access. Users must accept the ToU before accessing CUI systems.`,
    systemsUsed: ["Microsoft Entra Admin Center"],
    steps: [
      { stepNumber: 1, title: "Create a Terms of Use Document", instruction: "Prepare a system use notification document (PDF) that includes: system monitoring notice, authorized use only statement, CUI handling requirements, and consequences of unauthorized use.", systemPortal: "Organization documentation", evidenceHint: "Terms of Use PDF document — to be uploaded to Entra ID." },
      { stepNumber: 2, title: "Configure Entra ID Terms of Use Policy", instruction: "Upload the Terms of Use document to Entra ID and create a ToU policy requiring all users to accept it before accessing CUI systems.", systemPortal: "Microsoft Entra Admin Center", navigationPath: "Identity governance > Terms of use", recommendedSetting: "Require re-acceptance: annually or when terms change. Per device acceptance.", evidenceHint: "Screenshot of Terms of Use policy configuration." },
      { stepNumber: 3, title: "Link Terms of Use to Conditional Access", instruction: "Create or update a Conditional Access policy that requires the Terms of Use to be accepted as a grant control before accessing CUI-related applications.", systemPortal: "Microsoft Entra Admin Center", navigationPath: "Protection > Conditional Access > Policies", recommendedSetting: "Add 'Require terms of use' as a grant control for CUI application access.", evidenceHint: "Screenshot of Conditional Access policy showing ToU as a grant requirement." },
    ],
    evidenceRequirements: [
      { title: "System Use Notification Document", type: "Document (PDF)", filename: "AC-3.1.9_System_Use_Notice_YYYY-MM-DD.pdf", location: "Organization-maintained", mustShow: "Monitoring notice, authorized use statement, CUI handling requirements, consequences" },
      { title: "Terms of Use Policy Configuration", type: "Screenshot", filename: "AC-3.1.9_Terms_of_Use_Config_YYYY-MM-DD.png", location: "Entra > Identity governance > Terms of use", mustShow: "ToU policy name, document attached, re-acceptance period, languages" },
      { title: "Conditional Access ToU Requirement", type: "Screenshot", filename: "AC-3.1.9_CA_ToU_Policy_YYYY-MM-DD.png", location: "Entra > Conditional Access", mustShow: "Policy name, conditions, grant controls including 'Require terms of use'" },
    ],
    testProcedures: [
      { name: "Terms of Use Enforcement Test", steps: "1. Sign in as a new or unaccepted user.\n2. Verify the Terms of Use document is displayed before access is granted.\n3. Decline the ToU — verify access is denied.\n4. Accept the ToU — verify access is granted.", expectedResult: "Users must accept the system use notice before accessing CUI systems.", passCriteria: "ToU displayed on every sign-in (or per policy period). Access denied if ToU not accepted." },
    ],
    closeoutChecklist: ["System use notification document created", "Terms of Use policy configured in Entra", "Conditional Access linked to ToU", "Evidence uploaded", "SSP narrative updated"],
  },
  {
    controlId: "AC.L2-3.1.10",
    implementationApproach: `Use session lock with pattern-hiding displays after a period of inactivity. Systems must automatically lock when left unattended. This prevents unauthorized access to a logged-in session. Configure screen lock timeout at both the device and application level.\n\nFor Microsoft 365 / Windows: Configure Windows screen lock via Intune device configuration policy. Also configure idle timeout in Microsoft 365 apps if applicable.`,
    systemsUsed: ["Microsoft Intune Admin Center", "Microsoft Entra Admin Center"],
    steps: [
      { stepNumber: 1, title: "Configure Windows Screen Lock via Intune", instruction: "Create a Device Configuration policy in Intune that enforces screen lock after a defined inactivity period for all CUI-scoped Windows devices.", systemPortal: "Microsoft Intune Admin Center", navigationPath: "Devices > Configuration profiles > Create profile > Windows 10 and later > Settings catalog", recommendedSetting: "Screen lock timeout: 15 minutes maximum. Require password to unlock.", evidenceHint: "Screenshot of Intune screen lock policy configuration and assignment." },
      { stepNumber: 2, title: "Verify Screen Lock on macOS Devices (if applicable)", instruction: "If macOS devices access CUI, configure screen lock policy via Intune or MDM. Set maximum inactivity timeout.", systemPortal: "Microsoft Intune Admin Center", navigationPath: "Devices > Configuration profiles > Create profile > macOS", recommendedSetting: "Screen lock: 15 minutes maximum.", evidenceHint: "Screenshot of macOS lock policy if applicable." },
      { stepNumber: 3, title: "Configure Microsoft 365 Idle Timeout", instruction: "Configure idle session timeout for Microsoft 365 web apps to sign out users after inactivity. This is a tenant-level setting.", systemPortal: "Microsoft 365 Admin Center", navigationPath: "Settings > Org settings > Security & privacy > Idle session timeout", recommendedSetting: "Idle session timeout: 1 hour for Microsoft 365 web apps.", evidenceHint: "Screenshot of M365 idle session timeout configuration." },
      { stepNumber: 4, title: "Verify Compliance via Intune Report", instruction: "Check the device configuration compliance report to confirm screen lock policy is applied to all CUI-scoped devices.", systemPortal: "Microsoft Intune Admin Center", navigationPath: "Reports > Device configuration", evidenceHint: "Screenshot of configuration profile compliance report." },
    ],
    evidenceRequirements: [
      { title: "Windows Screen Lock Policy", type: "Screenshot", filename: "AC-3.1.10_Screen_Lock_Policy_YYYY-MM-DD.png", location: "Intune > Devices > Configuration profiles", mustShow: "Policy name, screen lock timeout setting (≤15 min), assigned device groups" },
      { title: "Microsoft 365 Idle Session Timeout", type: "Screenshot", filename: "AC-3.1.10_M365_Idle_Timeout_YYYY-MM-DD.png", location: "M365 Admin > Settings > Security & privacy", mustShow: "Idle session timeout enabled, timeout duration setting" },
    ],
    testProcedures: [
      { name: "Screen Lock Enforcement Test", steps: "1. On a CUI-scoped device, leave the session idle for 15 minutes.\n2. Verify the screen locks automatically.\n3. Verify the screen shows a lock screen (pattern-hiding display — no sensitive data visible).\n4. Verify a password is required to unlock.", expectedResult: "Screen locks after ≤15 minutes of inactivity. Password required to unlock.", passCriteria: "All CUI devices lock within the configured timeout. No session data visible on lock screen." },
    ],
    closeoutChecklist: ["Windows screen lock policy configured in Intune", "Microsoft 365 idle timeout configured", "Policy compliance verified", "Evidence uploaded", "SSP narrative updated"],
  },
  {
    controlId: "AC.L2-3.1.11",
    implementationApproach: `Terminate (automatically) a user session after a defined condition. While related to AC.L1-3.1.10 (session lock), this control specifically addresses session termination — ending the session entirely, not just locking it. Configure session lifetime limits so sessions cannot remain active indefinitely.\n\nFor Microsoft 365: Configure Conditional Access Sign-in Frequency policy to require periodic re-authentication. Configure session lifetime limits for persistent browser sessions.`,
    systemsUsed: ["Microsoft Entra Admin Center"],
    steps: [
      { stepNumber: 1, title: "Configure Sign-in Frequency Policy", instruction: "Create a Conditional Access policy that enforces periodic re-authentication for CUI-related applications. Users must sign in again after the defined period.", systemPortal: "Microsoft Entra Admin Center", navigationPath: "Protection > Conditional Access > Policies > Session > Sign-in frequency", recommendedSetting: "Sign-in frequency: 8 hours for CUI applications. No persistent sessions.", evidenceHint: "Screenshot of Conditional Access policy showing sign-in frequency setting." },
      { stepNumber: 2, title: "Disable Persistent Browser Sessions", instruction: "Configure the Conditional Access session control to prevent browser sessions from remaining active after the browser is closed.", systemPortal: "Microsoft Entra Admin Center", navigationPath: "Protection > Conditional Access > Policies > Session > Persistent browser session", recommendedSetting: "Persistent browser session: Never persistent.", evidenceHint: "Screenshot of CA policy showing persistent session = Never persistent." },
      { stepNumber: 3, title: "Configure Token Lifetime (if applicable)", instruction: "If using custom token lifetime policies, configure access token lifetime to limit how long sessions can remain active without re-authentication.", systemPortal: "Microsoft Entra Admin Center", navigationPath: "Identity > Applications > Token lifetime policies", recommendedSetting: "Default token lifetimes are generally appropriate; Conditional Access Sign-in Frequency is preferred.", evidenceHint: "Screenshot of token lifetime policy if configured." },
    ],
    evidenceRequirements: [
      { title: "Sign-in Frequency Conditional Access Policy", type: "Screenshot", filename: "AC-3.1.11_Session_Termination_CA_YYYY-MM-DD.png", location: "Entra > Conditional Access", mustShow: "Policy name, session controls, sign-in frequency value, persistent browser setting, enabled status" },
    ],
    testProcedures: [
      { name: "Session Termination Test", steps: "1. Sign in to a CUI application and leave the session idle past the sign-in frequency period.\n2. Attempt to interact with the application — verify re-authentication is required.\n3. Close the browser and reopen — verify the session is not persistent.", expectedResult: "Sessions terminate and require re-authentication after the defined period.", passCriteria: "Re-authentication required after sign-in frequency period. No persistent browser sessions." },
    ],
    closeoutChecklist: ["Sign-in frequency CA policy configured", "Persistent browser sessions disabled", "Evidence uploaded", "SSP narrative updated"],
  },
  {
    controlId: "SI.L2-3.14.3",
    implementationApproach: `Identify and respond to security alerts, advisories, and directives in a timely manner. The organization must have a process to receive, review, and act on security alerts from vendors, US-CERT, and other authoritative sources. Subscribe to relevant alert feeds and ensure alerts are triaged and acted on.\n\nFor Microsoft 365: Subscribe to Microsoft Security Update Guide notifications. Review Defender threat intelligence. Review US-CERT / CISA alerts.`,
    systemsUsed: ["Microsoft Defender Portal", "Microsoft 365 Admin Center", "Microsoft Entra Admin Center"],
    steps: [
      { stepNumber: 1, title: "Subscribe to Microsoft Security Notifications", instruction: "Configure your Microsoft 365 tenant to receive security advisory emails. Subscribe to the Microsoft Security Response Center (MSRC) notifications for products you use.", systemPortal: "Microsoft 365 Admin Center", navigationPath: "Settings > Org settings > Security & privacy > Microsoft Security notifications", evidenceHint: "Screenshot of security notification subscription settings." },
      { stepNumber: 2, title: "Subscribe to CISA Known Exploited Vulnerabilities Feed", instruction: "Subscribe to CISA's Known Exploited Vulnerabilities (KEV) catalog alerts. Review new entries weekly and confirm your environment is not affected.", systemPortal: "External — CISA website", navigationPath: "https://www.cisa.gov/known-exploited-vulnerabilities-catalog", evidenceHint: "Screenshot or documentation showing CISA KEV subscription or review process." },
      { stepNumber: 3, title: "Document the Alert Response Process", instruction: "Create or update a procedure for receiving, triaging, and responding to security alerts. Define who receives alerts, triage timelines (e.g., Critical: 4 hours, High: 24 hours), and escalation paths.", systemPortal: "Organization documentation", evidenceHint: "Alert response procedure document." },
      { stepNumber: 4, title: "Review Microsoft Defender Threat Intelligence", instruction: "Review the Microsoft Defender Threat Intelligence reports relevant to your industry. Identify any active threat campaigns targeting your sector.", systemPortal: "Microsoft Defender Portal", navigationPath: "Threat intelligence > Threat analytics", evidenceHint: "Screenshot of threat analytics dashboard." },
    ],
    evidenceRequirements: [
      { title: "Security Alert Subscription Evidence", type: "Screenshot/Document", filename: "SI-3.14.3_Alert_Subscriptions_YYYY-MM-DD.png", location: "M365 Admin or email inbox", mustShow: "Subscription confirmation or notification settings for MSRC and CISA alerts" },
      { title: "Alert Response Procedure", type: "Document", filename: "SI-3.14.3_Alert_Response_Procedure_YYYY-MM-DD.docx", location: "Organization documentation", mustShow: "Alert sources, triage timelines, responsible roles, escalation process" },
      { title: "Recent Alert Review Record", type: "Document/Screenshot", filename: "SI-3.14.3_Alert_Review_Record_YYYY-MM-DD.xlsx", location: "Organization documentation", mustShow: "Alert date, source, severity, affected systems, action taken, closed date" },
    ],
    testProcedures: [
      { name: "Alert Response Timeliness Check", steps: "1. Review the last 3 months of security alerts received.\n2. Confirm each alert was reviewed within the defined triage timeline.\n3. Confirm actions were taken and documented for each applicable alert.\n4. Verify at least one CISA KEV alert was reviewed and assessed.", expectedResult: "Security alerts are received, triaged, and acted on within defined timelines.", passCriteria: "All alerts reviewed within SLA. Actions documented. No critical alerts ignored." },
    ],
    closeoutChecklist: ["Security notification subscriptions configured", "CISA KEV subscription established", "Alert response procedure documented", "Alert review record maintained", "Evidence uploaded", "SSP narrative updated"],
  },
  {
    controlId: "SI.L2-3.14.6",
    implementationApproach: `Monitor organizational information systems, including inbound and outbound communications traffic, to detect attacks and indicators of potential attacks. Network traffic monitoring must be in place for CUI-handling systems. Use network security solutions to detect anomalies, intrusions, and data exfiltration attempts.\n\nFor Microsoft 365: Use Microsoft Defender for Endpoint network protection features. Use Microsoft Defender for Cloud Apps to monitor cloud application traffic. Enable DNS protection in Defender.`,
    systemsUsed: ["Microsoft Defender Portal", "Microsoft Defender for Cloud Apps", "Firewall / Network Console", "Microsoft Intune Admin Center"],
    steps: [
      { stepNumber: 1, title: "Enable Network Protection in Defender for Endpoint", instruction: "Enable Network Protection on all CUI-scoped Windows endpoints. This blocks connections to malicious domains and IP addresses at the network layer.", systemPortal: "Microsoft Intune Admin Center", navigationPath: "Endpoint security > Attack surface reduction > Create policy", recommendedSetting: "Network protection: Block mode. Web content filtering: Enabled.", evidenceHint: "Screenshot of Network Protection policy in Intune." },
      { stepNumber: 2, title: "Configure Defender for Cloud Apps (MCAS)", instruction: "Enable Microsoft Defender for Cloud Apps and connect your Microsoft 365 tenant. Configure anomaly detection policies for unusual data access, download, or sharing patterns.", systemPortal: "Microsoft Defender Portal", navigationPath: "Cloud Apps > Policies > Policy management", recommendedSetting: "Enable: Unusual file download, Mass download by single user, Activity from infrequent country.", evidenceHint: "Screenshot of Cloud Apps anomaly detection policies." },
      { stepNumber: 3, title: "Review Firewall Traffic Logs", instruction: "Configure your network firewall to log all inbound and outbound traffic for CUI-scoped systems. Review logs weekly for anomalous patterns.", systemPortal: "Firewall / Network Console", evidenceHint: "Firewall log retention configuration screenshot or traffic log review record." },
      { stepNumber: 4, title: "Configure Defender Endpoint Detection (EDR)", instruction: "Verify Microsoft Defender EDR is in active (block) mode on all CUI devices. EDR monitors process, network, and file activity for malicious behavior.", systemPortal: "Microsoft Defender Portal", navigationPath: "Settings > Endpoints > Advanced features", recommendedSetting: "EDR in block mode: On. Automated investigation: On.", evidenceHint: "Screenshot of Defender EDR configuration." },
    ],
    evidenceRequirements: [
      { title: "Network Protection Policy", type: "Screenshot", filename: "SI-3.14.6_Network_Protection_Policy_YYYY-MM-DD.png", location: "Intune > Endpoint security > Attack surface reduction", mustShow: "Network protection setting (Block), assigned groups" },
      { title: "Cloud Apps Anomaly Detection Policies", type: "Screenshot", filename: "SI-3.14.6_Cloud_App_Policies_YYYY-MM-DD.png", location: "Defender > Cloud Apps > Policies", mustShow: "Policy names, type (anomaly detection), enabled status" },
      { title: "Firewall Log Configuration", type: "Screenshot/Document", filename: "SI-3.14.6_Firewall_Logging_YYYY-MM-DD.png", location: "Firewall management console", mustShow: "Logging enabled, log retention period, inbound and outbound traffic logging" },
    ],
    testProcedures: [
      { name: "Network Monitoring Coverage Check", steps: "1. Confirm Network Protection is active on all CUI-scoped devices.\n2. Attempt to access a known malicious test domain from a CUI device — verify it is blocked.\n3. Confirm Cloud Apps anomaly policies are active and have generated at least one alert in the past 30 days.", expectedResult: "Network traffic to CUI systems is monitored and suspicious traffic is blocked/alerted.", passCriteria: "Network Protection blocks malicious connections. Cloud Apps policies active and generating alerts." },
    ],
    closeoutChecklist: ["Network Protection enabled on CUI devices", "Cloud Apps anomaly policies configured", "Firewall logging configured and reviewed", "Defender EDR active on CUI devices", "Evidence uploaded", "SSP narrative updated"],
  },
  {
    controlId: "RA.L2-3.11.2",
    implementationApproach: `Scan for vulnerabilities in organizational systems and applications periodically and when new vulnerabilities potentially affecting the system are identified; remediate vulnerabilities in accordance with risk assessments. Conduct regular vulnerability scans using approved tools. Prioritize and remediate findings based on risk.\n\nFor Microsoft 365 / Intune environments: Use Microsoft Defender Vulnerability Management as the primary vulnerability scanner. Supplement with periodic network scans for on-premises systems.`,
    systemsUsed: ["Microsoft Defender Portal", "Microsoft Intune Admin Center", "Network Vulnerability Scanner (Nessus, Qualys, or similar)"],
    steps: [
      { stepNumber: 1, title: "Configure Defender Vulnerability Management", instruction: "Enable Microsoft Defender Vulnerability Management in your Defender portal. Confirm all CUI-scoped devices are onboarded to Defender for Endpoint.", systemPortal: "Microsoft Defender Portal", navigationPath: "Vulnerability management > Dashboard", recommendedSetting: "All CUI devices must be onboarded and reporting to Defender for Endpoint.", evidenceHint: "Screenshot of VM dashboard showing device coverage." },
      { stepNumber: 2, title: "Define Vulnerability Scanning Schedule", instruction: "Document the vulnerability scanning schedule. Defender continuously scans enrolled devices. For network/infrastructure scans, schedule authenticated scans at least monthly.", systemPortal: "Organization documentation / Vulnerability scanner", evidenceHint: "Scanning schedule document or scanner configuration screenshot." },
      { stepNumber: 3, title: "Review and Prioritize Vulnerability Findings", instruction: "Review the Defender Vulnerability Management recommendations dashboard. Sort by severity. Create remediation tasks for Critical and High findings. Document accepted risks.", systemPortal: "Microsoft Defender Portal", navigationPath: "Vulnerability management > Recommendations", recommendedSetting: "Critical CVEs: remediate within 15 days. High CVEs: 30 days. Medium: 90 days.", evidenceHint: "Screenshot of vulnerability recommendations with severity and remediation status." },
      { stepNumber: 4, title: "Track Remediation in POA&M", instruction: "For vulnerabilities that cannot be remediated within the required timeframe, document them in the POA&M with milestone dates, risk acceptance justification, and owner.", systemPortal: "Control HUB POA&M module", evidenceHint: "POA&M entry for each accepted or deferred vulnerability." },
    ],
    evidenceRequirements: [
      { title: "Vulnerability Scan Results", type: "Export/Screenshot", filename: "RA-3.11.2_Vuln_Scan_Results_YYYY-MM-DD.png", location: "Defender > Vulnerability management > Recommendations", mustShow: "CVE IDs, severity, affected devices, remediation status, due dates" },
      { title: "Scanning Schedule Document", type: "Document", filename: "RA-3.11.2_Scanning_Schedule_YYYY-MM-DD.docx", location: "Organization-maintained", mustShow: "Scan frequency, systems in scope, tool used, responsible role" },
      { title: "Remediation Tracking Evidence", type: "Screenshot/Tickets", filename: "RA-3.11.2_Remediation_Tracking_YYYY-MM-DD.png", location: "Defender or ticketing system", mustShow: "Open remediations with owner, due date, and current status" },
    ],
    testProcedures: [
      { name: "Vulnerability Scan Coverage and Timeliness", steps: "1. Confirm all CUI devices are onboarded to Defender Vulnerability Management.\n2. Sample 5 Critical/High vulnerabilities from the last scan.\n3. Confirm each has a remediation ticket with owner and due date.\n4. Verify Critical CVEs were remediated within 15 days (or have approved POA&M).", expectedResult: "All CUI systems are scanned. Critical/High vulnerabilities have documented remediation plans.", passCriteria: "100% of CUI devices covered by scanning. Critical CVEs remediated or in POA&M within SLA." },
    ],
    closeoutChecklist: ["Defender Vulnerability Management enabled for all CUI devices", "Scanning schedule documented", "Vulnerability findings reviewed and prioritized", "Remediation tasks created for Critical/High findings", "Unresolved findings in POA&M", "Evidence uploaded", "SSP narrative updated"],
  },
  {
    controlId: "CA.L2-3.12.3",
    implementationApproach: `Monitor security controls on an ongoing basis to ensure the continued effectiveness of the controls. Continuous monitoring means the organization has a program to check that implemented controls are still working as intended, not just during annual assessments. Establish monitoring frequencies for each control and document monitoring results.\n\nFor Microsoft 365: Use the Monitoring Tracker in Control HUB to track recurring operational reviews. Use Microsoft Secure Score for continuous visibility into control effectiveness. Schedule periodic control effectiveness reviews.`,
    systemsUsed: ["Control HUB Monitoring Tracker", "Microsoft Secure Score", "Microsoft Defender Portal", "Microsoft Purview Portal"],
    steps: [
      { stepNumber: 1, title: "Define Continuous Monitoring Strategy", instruction: "Create a Continuous Monitoring Plan that defines: which controls are monitored, monitoring frequency for each, what metrics indicate effectiveness, and who is responsible.", systemPortal: "Organization documentation", evidenceHint: "Continuous Monitoring Plan document." },
      { stepNumber: 2, title: "Configure the Monitoring Tracker", instruction: "In Control HUB, review the Monitoring Tracker. Confirm all 19 operational monitoring items are assigned, have appropriate frequencies, and are up to date.", systemPortal: "Control HUB > Monitoring Tracker", evidenceHint: "Screenshot of Control HUB Monitoring Tracker showing all items with current status." },
      { stepNumber: 3, title: "Review Microsoft Secure Score", instruction: "Review the Microsoft Secure Score dashboard monthly. Track score trends, review recommended actions, and confirm improvements are being made consistently.", systemPortal: "Microsoft Defender Portal", navigationPath: "Exposure management > Secure score", recommendedSetting: "Target: Maintain or improve score month-over-month. Review and implement recommended actions.", evidenceHint: "Screenshot of Secure Score dashboard showing current score and trend." },
      { stepNumber: 4, title: "Document Monitoring Results", instruction: "Maintain a log of monitoring activities performed: date, reviewer, controls reviewed, findings, and actions taken. This forms the evidence of your continuous monitoring program.", systemPortal: "Organization documentation or ticketing system", evidenceHint: "Monitoring log or completed monitoring review records." },
    ],
    evidenceRequirements: [
      { title: "Continuous Monitoring Plan", type: "Document", filename: "CA-3.12.3_Continuous_Monitoring_Plan_YYYY-MM-DD.docx", location: "Organization-maintained", mustShow: "Controls monitored, frequency, metrics, responsible roles, review schedule" },
      { title: "Microsoft Secure Score Dashboard", type: "Screenshot", filename: "CA-3.12.3_Secure_Score_YYYY-MM-DD.png", location: "Defender > Secure score", mustShow: "Current score, score trend, recommended actions" },
      { title: "Monitoring Activity Log", type: "Document/Spreadsheet", filename: "CA-3.12.3_Monitoring_Log_YYYY-MM-DD.xlsx", location: "Organization-maintained", mustShow: "Date, reviewer, controls reviewed, findings, actions taken" },
    ],
    testProcedures: [
      { name: "Continuous Monitoring Program Verification", steps: "1. Request the Continuous Monitoring Plan and confirm it covers all 110 controls.\n2. Review the last 3 months of monitoring logs — confirm reviews were performed on schedule.\n3. Confirm at least 3 monitoring activities were completed in the past month.\n4. Verify the Monitoring Tracker in Control HUB shows current status.", expectedResult: "Continuous monitoring is actively performed and documented.", passCriteria: "Monitoring Plan exists and is current. Monitoring logs demonstrate ongoing activity. Tracker is up to date." },
    ],
    closeoutChecklist: ["Continuous Monitoring Plan documented", "Control HUB Monitoring Tracker configured", "Secure Score reviewed and documented", "Monitoring activity log maintained", "Evidence uploaded", "SSP narrative updated"],
  },
];

// ── Seed Function ──────────────────────────────────────────────────────────

export async function seedControlConfigure(): Promise<void> {
  // Resolve control UUIDs from control_id strings
  const allControls = await db.select({ id: controlsTable.id, controlId: controlsTable.controlId }).from(controlsTable);
  const controlMap = new Map(allControls.map((c) => [c.controlId, c.id]));

  for (const seed of [...CONFIGURE_SEED, ...CONFIGURE_SEED_PART2]) {
    const dbControlId = controlMap.get(seed.controlId);
    if (!dbControlId) continue; // control not found in DB

    // Check if content already seeded
    const existing = await db
      .select({ id: controlConfigureContentTable.id })
      .from(controlConfigureContentTable)
      .where(eq(controlConfigureContentTable.controlId, dbControlId))
      .limit(1);

    if (existing.length > 0) continue; // already seeded

    // Insert content
    await db.insert(controlConfigureContentTable).values({
      id: randomUUID(),
      controlId: dbControlId,
      implementationApproach: seed.implementationApproach,
      systemsUsed: JSON.stringify(seed.systemsUsed),
      evidenceRequirements: JSON.stringify(seed.evidenceRequirements),
      testProcedures: JSON.stringify(seed.testProcedures),
      closeoutChecklist: JSON.stringify(seed.closeoutChecklist),
    });

    // Insert steps
    if (seed.steps.length > 0) {
      await db.insert(controlConfigStepsTable).values(
        seed.steps.map((step, i) => ({
          id: randomUUID(),
          controlId: dbControlId,
          stepNumber: step.stepNumber,
          title: step.title,
          instruction: step.instruction,
          systemPortal: step.systemPortal ?? null,
          navigationPath: step.navigationPath ?? null,
          recommendedSetting: step.recommendedSetting ?? null,
          expectedResult: step.expectedResult ?? null,
          evidenceHint: step.evidenceHint ?? null,
          sortOrder: i,
        }))
      );
    }
  }
}

// ── Routes ────────────────────────────────────────────────────────────────

router.get(
  "/controls/:id/configure",
  requireAuth,
  requireOrg,
  async (req, res) => {
    const orgId = req.orgId;

    // Resolve control by UUID or controlId string
    let control = await db
      .select({ id: controlsTable.id, controlId: controlsTable.controlId })
      .from(controlsTable)
      .where(eq(controlsTable.id, req.params.id as string))
      .limit(1)
      .then((r) => r[0]);

    if (!control) {
      res.status(404).json({ error: "Control not found" });
      return;
    }

    // Get content
    const [content] = await db
      .select()
      .from(controlConfigureContentTable)
      .where(eq(controlConfigureContentTable.controlId, control.id))
      .limit(1);

    // Get steps
    const steps = await db
      .select()
      .from(controlConfigStepsTable)
      .where(eq(controlConfigStepsTable.controlId, control.id))
      .orderBy(controlConfigStepsTable.sortOrder);

    // Get org progress for all steps
    let progress: Record<string, { status: string; notes: string | null; completedBy: string | null; completedAt: string | null }> = {};
    if (steps.length > 0 && orgId) {
      const stepIds = steps.map((s) => s.id);
      const progressRows = await db
        .select()
        .from(orgControlStepProgressTable)
        .where(
          and(
            eq(orgControlStepProgressTable.organizationId, orgId),
            inArray(orgControlStepProgressTable.stepId, stepIds)
          )
        );
      for (const row of progressRows) {
        progress[row.stepId] = {
          status: row.status,
          notes: row.notes,
          completedBy: row.completedBy,
          completedAt: row.completedAt ? row.completedAt.toISOString() : null,
        };
      }
    }

    // Parse JSON fields
    const parsed = content
      ? {
          ...content,
          systemsUsed: tryParseJSON(content.systemsUsed, []),
          evidenceRequirements: tryParseJSON(content.evidenceRequirements, []),
          testProcedures: tryParseJSON(content.testProcedures, []),
          closeoutChecklist: tryParseJSON(content.closeoutChecklist, []),
        }
      : null;

    res.json({
      content: parsed,
      steps: steps.map((s) => ({
        ...s,
        progress: progress[s.id] ?? { status: "not_started", notes: null, completedBy: null, completedAt: null },
      })),
    });
  }
);

router.patch(
  "/controls/:id/configure/steps/:stepId/progress",
  requireAuth,
  requireOrg,
  async (req, res) => {
    const orgId = req.orgId;
    if (!orgId) { res.status(400).json({ error: "Org required" }); return; }

    const { status, notes } = req.body;
    const userId = (req as any).user?.id;

    // Check if progress row exists
    const [existing] = await db
      .select()
      .from(orgControlStepProgressTable)
      .where(
        and(
          eq(orgControlStepProgressTable.organizationId, orgId),
          eq(orgControlStepProgressTable.stepId, req.params.stepId as string)
        )
      )
      .limit(1);

    const now = new Date();

    if (existing) {
      await db
        .update(orgControlStepProgressTable)
        .set({
          status: status ?? existing.status,
          notes: notes !== undefined ? notes : existing.notes,
          completedBy: status === "complete" ? (userId ?? existing.completedBy) : existing.completedBy,
          completedAt: status === "complete" ? now : (status === "not_started" ? null : existing.completedAt),
          updatedAt: now,
        })
        .where(eq(orgControlStepProgressTable.id, existing.id));
    } else {
      await db.insert(orgControlStepProgressTable).values({
        id: randomUUID(),
        organizationId: orgId,
        stepId: req.params.stepId as string,
        status: status ?? "not_started",
        notes: notes ?? null,
        completedBy: status === "complete" ? (userId ?? null) : null,
        completedAt: status === "complete" ? now : null,
        createdAt: now,
        updatedAt: now,
      });
    }

    const [updated] = await db
      .select()
      .from(orgControlStepProgressTable)
      .where(
        and(
          eq(orgControlStepProgressTable.organizationId, orgId),
          eq(orgControlStepProgressTable.stepId, req.params.stepId as string)
        )
      )
      .limit(1);

    res.json(updated);
  }
);

function tryParseJSON<T>(val: string | null | undefined, fallback: T): T {
  if (!val) return fallback;
  try { return JSON.parse(val) as T; } catch { return fallback; }
}

export default router;
