// Additional configure seed data for all remaining CMMC controls

export interface ConfigSeedEntry {
  controlId: string;
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
  evidenceRequirements: { title: string; type: string; filename: string; location: string; mustShow: string }[];
  testProcedures: { name: string; steps: string; expectedResult: string; passCriteria: string }[];
  closeoutChecklist: string[];
}

export const CONFIGURE_SEED_PART2: ConfigSeedEntry[] = [

  // ── ACCESS CONTROL (remaining) ──────────────────────────────────────────

  {
    controlId: "AC.L2-3.1.4",
    implementationApproach: `Separate the duties of individuals to reduce the risk of malevolent activity without collusion. No single person should have the ability to complete a sensitive transaction end-to-end — authorization, execution, and review should be split across different roles. This prevents fraud, errors, and insider threats.\n\nFor Microsoft 365: Ensure that no user can both request and approve access changes. Separate code deployment from production access. Separate billing admin from user account admin.`,
    systemsUsed: ["Microsoft Entra Admin Center", "Microsoft 365 Admin Center", "Ticketing / Approval System"],
    steps: [
      { stepNumber: 1, title: "Document Sensitive Functions Requiring Separation", instruction: "Identify all sensitive functions in your environment: user provisioning, access approvals, financial transactions, code deployment, backup management, and audit log review. Document which roles perform each.", systemPortal: "Organization documentation", evidenceHint: "Separation of duties matrix document." },
      { stepNumber: 2, title: "Verify No Single User Holds Conflicting Roles", instruction: "Review Entra ID role assignments to confirm no single account holds roles that would allow end-to-end control of a sensitive process (e.g., both Global Admin and Billing Admin assigned to the same account that handles user requests).", systemPortal: "Microsoft Entra Admin Center", navigationPath: "Identity > Roles & admins > All roles", expectedResult: "No single account can both request and approve access, or deploy and approve code.", evidenceHint: "Screenshot of role assignments with separation verified." },
      { stepNumber: 3, title: "Configure Approval Workflows in PIM or Ticketing", instruction: "Configure approval requirements in Entra PIM for privileged role activations. Require a second approver for sensitive operations. Alternatively, document the manual approval process in your ticketing system.", systemPortal: "Microsoft Entra Admin Center", navigationPath: "Identity governance > Privileged identity management > Roles > Settings", recommendedSetting: "Require approval for all privileged role activations from a different manager.", evidenceHint: "Screenshot of PIM approval settings or ticketing workflow." },
      { stepNumber: 4, title: "Document and Communicate the SoD Policy", instruction: "Create or update the Access Control Policy to include the Separation of Duties requirements. Communicate to all administrators which role combinations are prohibited.", systemPortal: "Organization documentation", evidenceHint: "Access Control Policy document with SoD section." },
    ],
    evidenceRequirements: [
      { title: "Separation of Duties Matrix", type: "Document/Spreadsheet", filename: "AC-3.1.4_SoD_Matrix_YYYY-MM-DD.xlsx", location: "Organization-maintained", mustShow: "Sensitive function, required separation, roles involved, approval process" },
      { title: "Role Assignment Review", type: "Screenshot", filename: "AC-3.1.4_Role_Assignment_Review_YYYY-MM-DD.png", location: "Entra > Roles & admins", mustShow: "Role name, assigned users, confirmation no conflicting roles are held by same person" },
    ],
    testProcedures: [
      { name: "SoD Conflict Check", steps: "1. Review the SoD matrix against current role assignments.\n2. Confirm no single user holds two roles that should be separated.\n3. Attempt to have one user both request and approve an access change — verify it is blocked.", expectedResult: "No SoD conflicts exist. Approval workflows prevent one person from completing sensitive transactions alone.", passCriteria: "Zero SoD conflicts in role assignments. Approval workflows documented and enforced." },
    ],
    closeoutChecklist: ["SoD matrix documented", "Conflicting role combinations identified and remediated", "Approval workflows configured", "SoD policy documented and communicated", "Evidence uploaded", "SSP narrative updated"],
  },

  {
    controlId: "AC.L2-3.1.6",
    implementationApproach: `Use non-privileged accounts or roles when accessing non-security functions. Administrators should use their standard user account for everyday tasks like email, browsing, and accessing business applications — and switch to their privileged admin account only when performing administrative tasks. This limits the blast radius of credential compromise.\n\nFor Microsoft 365: Ensure administrators have two accounts — a standard user account for daily work and a dedicated admin account. Admin accounts should have no mailbox and no regular app licenses.`,
    systemsUsed: ["Microsoft Entra Admin Center", "Microsoft 365 Admin Center"],
    steps: [
      { stepNumber: 1, title: "Verify Admin Accounts Are Separate from User Accounts", instruction: "Confirm that all administrators have separate accounts for admin tasks. Admin accounts should be named differently (e.g., adm-jsmith@domain.com), have no Exchange mailbox, and no standard user licenses.", systemPortal: "Microsoft Entra Admin Center", navigationPath: "Identity > Users > All Users", recommendedSetting: "Admin accounts: No mailbox, no M365 app licenses, used only for admin portal access.", evidenceHint: "Screenshot of admin accounts showing no licenses or mailbox assigned." },
      { stepNumber: 2, title: "Educate Administrators on Account Usage Policy", instruction: "Document and communicate the policy requiring administrators to use their standard account for email, Teams, SharePoint, and daily work, and only use the admin account when performing administrative tasks.", systemPortal: "Organization documentation", evidenceHint: "Admin account usage policy or training record." },
      { stepNumber: 3, title: "Verify Conditional Access Blocks Admin Accounts from Non-Admin Resources", instruction: "Optionally configure a Conditional Access policy that blocks admin accounts from accessing productivity apps (Exchange, SharePoint, Teams), enforcing separation of account use.", systemPortal: "Microsoft Entra Admin Center", navigationPath: "Protection > Conditional Access", recommendedSetting: "Block admin accounts from accessing Exchange Online, SharePoint, Teams.", evidenceHint: "Screenshot of CA policy for admin account restrictions." },
    ],
    evidenceRequirements: [
      { title: "Admin Account Separation Evidence", type: "Screenshot", filename: "AC-3.1.6_Admin_Account_Separation_YYYY-MM-DD.png", location: "Entra > Users > All Users", mustShow: "Admin accounts with no licenses, no mailbox; standard accounts with licenses" },
      { title: "Account Usage Policy", type: "Document", filename: "AC-3.1.6_Account_Usage_Policy_YYYY-MM-DD.docx", location: "Organization-maintained", mustShow: "Policy requiring non-privileged accounts for non-admin tasks" },
    ],
    testProcedures: [
      { name: "Admin Account Usage Verification", steps: "1. Confirm admin accounts have no Exchange mailbox.\n2. Confirm admin accounts have no M365 app licenses.\n3. Attempt to access email or Teams with an admin account — verify it is not possible.", expectedResult: "Admin accounts cannot be used for standard productivity tasks.", passCriteria: "All admin accounts have no mailbox and no productivity licenses." },
    ],
    closeoutChecklist: ["Admin accounts confirmed separate from user accounts", "Admin accounts have no mailboxes or standard licenses", "Account usage policy documented", "Administrators trained on usage policy", "Evidence uploaded", "SSP narrative updated"],
  },

  {
    controlId: "AC.L2-3.1.7",
    implementationApproach: `Prevent non-privileged users from executing privileged functions and capture the execution of such functions in audit logs. Standard users must not be able to perform administrative actions: installing software, changing security settings, modifying user accounts, or accessing audit logs. Privileged functions must be logged so there is an audit trail.\n\nFor Microsoft 365 / Windows: Use Intune device configuration policies to restrict standard users from local admin access. Use RBAC in Entra to prevent non-admins from accessing admin portals. Ensure privileged actions are captured in audit logs.`,
    systemsUsed: ["Microsoft Intune Admin Center", "Microsoft Entra Admin Center", "Microsoft Purview Portal"],
    steps: [
      { stepNumber: 1, title: "Remove Local Admin Rights from Standard Users", instruction: "Configure an Intune policy to ensure standard users do not have local administrator rights on Windows devices. Use the Local Users and Groups configuration profile or a custom script.", systemPortal: "Microsoft Intune Admin Center", navigationPath: "Devices > Configuration profiles > Create > Windows 10 and later > Local users and groups", recommendedSetting: "Remove all non-approved members from the local Administrators group.", expectedResult: "Standard users cannot install software or change system settings.", evidenceHint: "Screenshot of Intune Local Admins policy and compliance report." },
      { stepNumber: 2, title: "Verify RBAC Prevents Non-Admins from Admin Portals", instruction: "Confirm that standard users cannot access the Microsoft 365 Admin Center, Entra Admin Center, or Intune Admin Center. Only accounts with admin roles should have access.", systemPortal: "Microsoft 365 Admin Center", navigationPath: "Roles > Role assignments", expectedResult: "Standard user accounts have no assigned admin roles.", evidenceHint: "Attempt to access M365 Admin Center with a standard user account — verify access is denied." },
      { stepNumber: 3, title: "Verify Privileged Actions Are Audited", instruction: "Confirm that admin role assignments, user creation/deletion, policy changes, and other privileged actions are captured in the Unified Audit Log.", systemPortal: "Microsoft Purview Portal", navigationPath: "Audit > Search > Activities: Admin activities", expectedResult: "Audit log contains entries for recent admin actions.", evidenceHint: "Screenshot of audit log showing admin activity entries." },
    ],
    evidenceRequirements: [
      { title: "Local Admin Restriction Policy", type: "Screenshot", filename: "AC-3.1.7_Local_Admin_Policy_YYYY-MM-DD.png", location: "Intune > Configuration profiles", mustShow: "Policy name, local admin restriction setting, assigned groups, compliance status" },
      { title: "Role Assignment Verification", type: "Screenshot", filename: "AC-3.1.7_Role_Assignments_YYYY-MM-DD.png", location: "M365 Admin Center > Roles", mustShow: "Standard users have no admin roles assigned" },
      { title: "Privileged Action Audit Log", type: "Screenshot", filename: "AC-3.1.7_Privileged_Action_Audit_YYYY-MM-DD.png", location: "Purview > Audit", mustShow: "Admin activity entries with date, user, action, and target" },
    ],
    testProcedures: [
      { name: "Privileged Function Restriction Test", steps: "1. Log in as a standard user on a CUI device.\n2. Attempt to install an application — verify the action is blocked.\n3. Attempt to access M365 Admin Center — verify access is denied.\n4. Confirm the denied access attempt is logged in the audit log.", expectedResult: "Standard users cannot execute privileged functions. All privileged actions are logged.", passCriteria: "Standard user cannot install software or access admin portals. Audit log captures privileged actions." },
    ],
    closeoutChecklist: ["Local admin rights removed from standard users via Intune", "RBAC verified — no non-admins have admin roles", "Privileged action audit logging verified", "Evidence uploaded", "SSP narrative updated"],
  },

  {
    controlId: "AC.L2-3.1.12",
    implementationApproach: `Monitor and control remote access sessions. All remote access to CUI systems must be monitored, logged, and controlled. This includes VPN connections, RDP, SSH, and cloud application access from remote locations. The organization must be able to detect, terminate, and review unauthorized remote sessions.\n\nFor Microsoft 365: Use Conditional Access to control and restrict remote access. Use the Entra ID sign-in logs to monitor remote sessions. Configure Defender for Endpoint to detect anomalous remote connections.`,
    systemsUsed: ["Microsoft Entra Admin Center", "Microsoft Defender Portal", "VPN / Remote Access Solution"],
    steps: [
      { stepNumber: 1, title: "Configure Conditional Access for Remote Access Control", instruction: "Create a Conditional Access policy that requires compliant devices and MFA for all remote access (sign-ins from non-corporate networks or non-named locations).", systemPortal: "Microsoft Entra Admin Center", navigationPath: "Protection > Conditional Access > Policies", recommendedSetting: "Require compliant device + MFA for access from non-named locations.", evidenceHint: "Screenshot of Conditional Access policy for remote access." },
      { stepNumber: 2, title: "Monitor Remote Sign-In Activity", instruction: "Review the Entra ID sign-in logs weekly for remote sign-ins. Look for anomalous countries, unfamiliar IPs, or unusual hours. Set up alert rules for sign-ins from risky locations.", systemPortal: "Microsoft Entra Admin Center", navigationPath: "Monitoring & health > Sign-in logs > filter Location", expectedResult: "Sign-in log shows all remote access with location, IP, MFA status, and device compliance.", evidenceHint: "Screenshot of sign-in log with remote access entries." },
      { stepNumber: 3, title: "Configure VPN Logging and Session Control", instruction: "Ensure your VPN solution logs all connection events: user, source IP, connection time, disconnect time, and data transferred. Review logs regularly for unauthorized sessions.", systemPortal: "VPN / Remote Access Solution", expectedResult: "VPN logs capture all remote sessions with sufficient detail for audit.", evidenceHint: "Screenshot of VPN session logs or configuration showing logging enabled." },
      { stepNumber: 4, title: "Test Remote Session Termination", instruction: "Verify that unauthorized remote sessions can be terminated. Test the ability to revoke a session via Entra ID (Revoke sessions) or through the VPN management console.", systemPortal: "Microsoft Entra Admin Center", navigationPath: "Identity > Users > select user > Revoke sessions", evidenceHint: "Screenshot showing session revocation capability." },
    ],
    evidenceRequirements: [
      { title: "Remote Access Conditional Access Policy", type: "Screenshot", filename: "AC-3.1.12_Remote_Access_CA_Policy_YYYY-MM-DD.png", location: "Entra > Conditional Access", mustShow: "Policy conditions (non-named location), grant controls (require MFA + compliant device)" },
      { title: "Remote Sign-In Log Review", type: "Screenshot", filename: "AC-3.1.12_Remote_SignIn_Logs_YYYY-MM-DD.png", location: "Entra > Sign-in logs", mustShow: "User, sign-in location, IP, MFA status, device compliance status" },
    ],
    testProcedures: [
      { name: "Remote Access Monitoring Verification", steps: "1. Initiate a remote access session from an external network.\n2. Confirm the session appears in Entra sign-in logs within 15 minutes.\n3. Confirm MFA was required for the remote access.\n4. Test terminating the session via Entra revoke sessions.", expectedResult: "Remote sessions are visible in logs, require MFA, and can be terminated.", passCriteria: "All remote sessions logged. MFA enforced. Session termination capability confirmed." },
    ],
    closeoutChecklist: ["Remote access CA policy configured", "VPN logging enabled and verified", "Sign-in log monitoring process defined", "Session termination capability tested", "Evidence uploaded", "SSP narrative updated"],
  },

  {
    controlId: "AC.L2-3.1.13",
    implementationApproach: `Employ cryptographic mechanisms to protect the confidentiality of remote access sessions. All remote access to CUI systems must use strong encryption — plaintext protocols (Telnet, FTP, HTTP) are not acceptable for CUI access. Use TLS 1.2+, VPN with AES-256, SSH v2, or equivalent.\n\nFor Microsoft 365: All cloud service connections use TLS 1.2+ by default. For on-premises systems, enforce TLS on all remote access endpoints. Disable legacy protocols (TLS 1.0/1.1, SSLv3).`,
    systemsUsed: ["Microsoft Entra Admin Center", "Microsoft 365 Admin Center", "VPN / Remote Access Solution", "Firewall / Network Console"],
    steps: [
      { stepNumber: 1, title: "Verify Microsoft 365 Uses TLS 1.2+ for All Connections", instruction: "Confirm Microsoft 365 tenant is configured to require TLS 1.2 minimum for all inbound connections. Disable legacy TLS versions.", systemPortal: "Microsoft 365 Admin Center", navigationPath: "Settings > Org settings > Modern authentication", recommendedSetting: "Modern authentication enabled. TLS 1.0/1.1 disabled.", evidenceHint: "Screenshot of modern authentication settings or TLS configuration." },
      { stepNumber: 2, title: "Verify VPN Uses Strong Encryption", instruction: "Confirm your VPN solution uses AES-256 encryption and strong authentication protocols (IKEv2, SSL/TLS). Document the VPN encryption standard.", systemPortal: "VPN Management Console", recommendedSetting: "AES-256 encryption, IKEv2 or OpenVPN protocol, SHA-256 or stronger hashing.", evidenceHint: "Screenshot of VPN encryption settings or vendor documentation." },
      { stepNumber: 3, title: "Disable Legacy Protocols on Network Boundary", instruction: "Configure firewall rules to block Telnet (port 23), FTP (port 21), and HTTP (port 80) for any CUI-related remote access. Enforce HTTPS, SFTP, SSH only.", systemPortal: "Firewall / Network Console", recommendedSetting: "Block inbound Telnet, FTP, HTTP at perimeter for CUI systems.", evidenceHint: "Firewall rule screenshot showing legacy protocols blocked." },
    ],
    evidenceRequirements: [
      { title: "TLS Configuration Evidence", type: "Screenshot/Document", filename: "AC-3.1.13_TLS_Config_YYYY-MM-DD.png", location: "M365 Admin or network device", mustShow: "TLS version 1.2+ enforced, legacy versions disabled" },
      { title: "VPN Encryption Documentation", type: "Screenshot/Document", filename: "AC-3.1.13_VPN_Encryption_YYYY-MM-DD.docx", location: "VPN console or vendor docs", mustShow: "Encryption algorithm, protocol version, authentication method" },
    ],
    testProcedures: [
      { name: "Encryption Protocol Test", steps: "1. Use an SSL/TLS scanner tool (e.g., SSL Labs) on public-facing endpoints to verify TLS 1.2+ only.\n2. Attempt to connect via Telnet or plain HTTP to a CUI system — verify connection is refused.\n3. Verify VPN connection uses the documented AES-256 algorithm.", expectedResult: "All remote access uses strong encryption. Legacy protocols are blocked.", passCriteria: "TLS 1.2+ enforced. Telnet/FTP blocked. VPN uses AES-256." },
    ],
    closeoutChecklist: ["TLS 1.2+ enforced for M365 and all remote access", "VPN encryption standard documented and configured", "Legacy protocols blocked at firewall", "Encryption policy documented", "Evidence uploaded", "SSP narrative updated"],
  },

  {
    controlId: "AC.L2-3.1.14",
    implementationApproach: `Route remote access via managed access control points. All remote access to CUI systems must pass through centrally managed, monitored, and controlled network access points — typically a VPN gateway, zero-trust network access (ZTNA) gateway, or a secure web gateway. Direct remote access bypassing these control points must be blocked.\n\nFor Microsoft 365: Cloud services are accessed via Microsoft's infrastructure. For on-premises or hybrid environments, ensure all remote access flows through your VPN or SD-WAN gateway before reaching CUI systems.`,
    systemsUsed: ["VPN / Remote Access Solution", "Firewall / Network Console", "Microsoft Entra Admin Center"],
    steps: [
      { stepNumber: 1, title: "Document the Remote Access Architecture", instruction: "Create or update a network diagram showing all remote access paths to CUI systems. Identify the managed access control point (VPN gateway, ZTNA) through which all remote access must flow.", systemPortal: "Organization documentation", evidenceHint: "Network diagram showing remote access flow through managed control points." },
      { stepNumber: 2, title: "Enforce Remote Access Through VPN Gateway", instruction: "Configure your network and firewall to block direct external access to CUI systems. All remote access must traverse the VPN gateway. Verify split tunneling is disabled or configured to route CUI traffic through the VPN.", systemPortal: "VPN / Firewall Console", recommendedSetting: "Split tunneling disabled (all traffic routes through VPN) or split tunneling configured to force CUI-bound traffic through VPN.", evidenceHint: "VPN client configuration or firewall rule screenshot showing enforced routing." },
      { stepNumber: 3, title: "Verify No Direct External Access to CUI Systems", instruction: "Run a port scan or review firewall rules to confirm CUI systems are not directly accessible from the internet. Only the VPN gateway or ZTNA should have external-facing ports.", systemPortal: "Firewall / Network Console", expectedResult: "No CUI system IPs are accessible directly from the internet.", evidenceHint: "Firewall external rule set showing only VPN gateway is accessible externally." },
    ],
    evidenceRequirements: [
      { title: "Remote Access Network Diagram", type: "Document/Diagram", filename: "AC-3.1.14_Remote_Access_Architecture_YYYY-MM-DD.png", location: "Organization-maintained", mustShow: "Remote users, managed access control point (VPN/ZTNA), CUI systems, flow direction" },
      { title: "Firewall External Access Rules", type: "Screenshot", filename: "AC-3.1.14_Firewall_External_Rules_YYYY-MM-DD.png", location: "Firewall management console", mustShow: "External inbound rules — only VPN gateway ports accessible, no direct CUI system access" },
    ],
    testProcedures: [
      { name: "Direct Access Block Verification", steps: "1. Attempt to access a CUI system directly via its IP address from an external network (without VPN).\n2. Verify the connection is blocked.\n3. Connect via VPN and verify CUI system access works.", expectedResult: "Direct external access to CUI systems is blocked. VPN access works correctly.", passCriteria: "No direct external access possible. All remote access routes through managed access control point." },
    ],
    closeoutChecklist: ["Remote access architecture documented", "VPN gateway configured as sole remote access control point", "Direct external access to CUI systems blocked", "Split tunneling configured correctly", "Evidence uploaded", "SSP narrative updated"],
  },

  {
    controlId: "AC.L2-3.1.15",
    implementationApproach: `Authorize remote execution of privileged commands and access to security-relevant information via remote access only for documented operational needs. Privileged administrative actions performed remotely must have explicit authorization — not all remote users should be able to execute admin-level commands. Document which remote access scenarios permit privileged command execution.\n\nFor Microsoft 365: Privileged admin tasks should require activation through PIM even when performed remotely. Remote privileged access should require step-up authentication.`,
    systemsUsed: ["Microsoft Entra Admin Center", "Microsoft Intune Admin Center", "VPN / Remote Access Solution"],
    steps: [
      { stepNumber: 1, title: "Document Authorized Remote Privileged Access Scenarios", instruction: "Create a policy documenting which personnel are authorized to execute privileged commands remotely, what commands/tasks are authorized, and what additional controls are required (step-up MFA, PIM activation).", systemPortal: "Organization documentation", evidenceHint: "Remote privileged access authorization policy or procedure." },
      { stepNumber: 2, title: "Require PIM Activation for Remote Admin Tasks", instruction: "Configure Entra PIM to require privileged role activation for any remote administrative tasks. Remote admins should have eligible (not permanent) privileged roles that require activation with justification.", systemPortal: "Microsoft Entra Admin Center", navigationPath: "Identity governance > Privileged identity management", recommendedSetting: "Require PIM activation for all remote privileged tasks. Activation requires justification and MFA.", evidenceHint: "Screenshot of PIM role settings requiring activation." },
      { stepNumber: 3, title: "Audit Remote Privileged Command Execution", instruction: "Review audit logs to confirm remote privileged actions are logged. Verify admin role activations performed remotely are captured with timestamp, user, and justification.", systemPortal: "Microsoft Entra Admin Center", navigationPath: "Identity governance > PIM > Audit history", evidenceHint: "Screenshot of PIM audit history showing remote privileged activations." },
    ],
    evidenceRequirements: [
      { title: "Remote Privileged Access Policy", type: "Document", filename: "AC-3.1.15_Remote_Privileged_Access_Policy_YYYY-MM-DD.docx", location: "Organization-maintained", mustShow: "Authorized personnel, permitted tasks, additional controls required, approval process" },
      { title: "PIM Remote Activation Audit Log", type: "Screenshot", filename: "AC-3.1.15_PIM_Remote_Activation_Log_YYYY-MM-DD.png", location: "Entra > PIM > Audit history", mustShow: "Activation events with user, role, justification, IP address, date/time" },
    ],
    testProcedures: [
      { name: "Remote Privileged Access Authorization Check", steps: "1. Identify the last 3 instances of remote privileged command execution.\n2. Confirm each had a corresponding PIM activation or documented authorization.\n3. Confirm each activation included MFA and justification.", expectedResult: "All remote privileged access is authorized, logged, and justified.", passCriteria: "No unauthorized remote privileged access. All remote admin actions have PIM activation records." },
    ],
    closeoutChecklist: ["Remote privileged access scenarios documented", "PIM configured for remote admin roles", "Audit logging for remote privileged access verified", "Evidence uploaded", "SSP narrative updated"],
  },

  {
    controlId: "AC.L2-3.1.16",
    implementationApproach: `Authorize wireless access to the system prior to allowing such connections. All wireless access to systems handling CUI must be explicitly authorized. This means knowing what wireless networks are in your environment, who can connect, and ensuring unauthorized wireless devices or rogue access points cannot connect to CUI-handling systems.\n\nFor Microsoft 365 / Intune: Use Intune Wi-Fi profiles to deploy authorized wireless network configurations. Require device compliance before Wi-Fi access is granted. Conduct regular wireless access point audits.`,
    systemsUsed: ["Microsoft Intune Admin Center", "Network / Wi-Fi Management Console"],
    steps: [
      { stepNumber: 1, title: "Document Authorized Wireless Networks", instruction: "Create an inventory of all authorized wireless networks (SSIDs) in your environment. Classify them by purpose: corporate CUI network, guest network, IoT. Document who is authorized to access each.", systemPortal: "Network / Wi-Fi Management Console", evidenceHint: "Wireless network inventory document." },
      { stepNumber: 2, title: "Deploy Wi-Fi Profiles via Intune", instruction: "Create Wi-Fi configuration profiles in Intune and deploy them to CUI-scoped devices. This ensures only approved networks are automatically connected and prevents users from connecting to rogue or unauthorized SSIDs.", systemPortal: "Microsoft Intune Admin Center", navigationPath: "Devices > Configuration profiles > Create > Wi-Fi", recommendedSetting: "Deploy corporate Wi-Fi profile with WPA2-Enterprise authentication. Block automatic connection to other SSIDs.", evidenceHint: "Screenshot of Intune Wi-Fi profile and assignment." },
      { stepNumber: 3, title: "Scan for Rogue Access Points", instruction: "Periodically scan for unauthorized wireless access points using your wireless infrastructure management tools. Document any rogue APs found and the remediation taken.", systemPortal: "Network / Wi-Fi Management Console", expectedResult: "No unauthorized access points are present in the environment.", evidenceHint: "Rogue AP scan results or wireless network audit report." },
    ],
    evidenceRequirements: [
      { title: "Wireless Network Authorization Inventory", type: "Document/Spreadsheet", filename: "AC-3.1.16_Wireless_Network_Inventory_YYYY-MM-DD.xlsx", location: "Organization-maintained", mustShow: "SSID, purpose, authorized users/groups, authentication method, authorization date" },
      { title: "Intune Wi-Fi Configuration Profile", type: "Screenshot", filename: "AC-3.1.16_Intune_WiFi_Profile_YYYY-MM-DD.png", location: "Intune > Configuration profiles", mustShow: "Profile name, SSID, security type, assigned groups" },
    ],
    testProcedures: [
      { name: "Unauthorized Wireless Connection Test", steps: "1. Attempt to connect a CUI device to an unauthorized Wi-Fi network.\n2. Verify Intune policy prevents automatic connection or blocks connection to unlisted SSIDs.\n3. Confirm the corporate Wi-Fi profile connects correctly.", expectedResult: "CUI devices connect only to authorized wireless networks.", passCriteria: "Unauthorized Wi-Fi connections blocked. Authorized network profile deployed and functioning." },
    ],
    closeoutChecklist: ["Authorized wireless networks documented", "Wi-Fi profiles deployed via Intune", "Rogue AP scan performed", "Wireless authorization policy documented", "Evidence uploaded", "SSP narrative updated"],
  },

  {
    controlId: "AC.L2-3.1.17",
    implementationApproach: `Protect wireless access using authentication and encryption. Wireless networks used to access CUI must use strong authentication (WPA2-Enterprise or WPA3) and encryption. Open or WEP-encrypted networks are not acceptable for CUI access. Guest networks must be isolated from CUI systems.\n\nFor Microsoft 365: CUI-handling wireless networks should use WPA2-Enterprise with 802.1X authentication against Entra ID or on-premises NPS. Isolate guest networks in a separate VLAN with no access to CUI systems.`,
    systemsUsed: ["Network / Wi-Fi Management Console", "Microsoft Intune Admin Center", "Network Access Control (802.1X / NPS)"],
    steps: [
      { stepNumber: 1, title: "Verify WPA2-Enterprise or WPA3 on CUI Networks", instruction: "Confirm all wireless networks used to access CUI use WPA2-Enterprise (802.1X) or WPA3 authentication and AES/CCMP encryption. No WEP, WPA-Personal, or open networks should be used for CUI.", systemPortal: "Network / Wi-Fi Management Console", recommendedSetting: "Security: WPA2-Enterprise or WPA3. Encryption: AES/CCMP. No TKIP.", evidenceHint: "Screenshot of wireless AP security configuration." },
      { stepNumber: 2, title: "Configure 802.1X Authentication", instruction: "Configure 802.1X authentication on your wireless infrastructure using NPS (Network Policy Server) or Entra ID. Devices must authenticate before receiving network access.", systemPortal: "Network Access Control / NPS", recommendedSetting: "PEAP-MSCHAPv2 or EAP-TLS authentication using device certificates or user credentials.", evidenceHint: "Screenshot of NPS or AAA server configuration for 802.1X." },
      { stepNumber: 3, title: "Verify Guest Network Isolation", instruction: "Confirm the guest Wi-Fi network is in a separate VLAN with firewall rules preventing any access to CUI systems or the corporate network. Guest users should only have internet access.", systemPortal: "Network / Wi-Fi Management Console", expectedResult: "Guest VLAN cannot reach corporate systems or CUI resources.", evidenceHint: "Network diagram showing VLAN isolation or firewall rule showing guest VLAN blocked from corporate VLAN." },
    ],
    evidenceRequirements: [
      { title: "Wireless Security Configuration", type: "Screenshot", filename: "AC-3.1.17_Wireless_Security_Config_YYYY-MM-DD.png", location: "Wi-Fi management console", mustShow: "SSID, security mode (WPA2-Enterprise/WPA3), encryption type (AES)" },
      { title: "Guest Network Isolation Evidence", type: "Screenshot/Diagram", filename: "AC-3.1.17_Guest_Network_Isolation_YYYY-MM-DD.png", location: "Network / Firewall console", mustShow: "Guest VLAN isolation from corporate/CUI network, firewall rules blocking cross-VLAN access" },
    ],
    testProcedures: [
      { name: "Wireless Security Verification", steps: "1. Connect to the CUI wireless network and verify WPA2-Enterprise authentication is required.\n2. Connect to the guest network and attempt to access a CUI system — verify connection is blocked.\n3. Verify no open or WPA-Personal networks are accessible from the CUI workspace.", expectedResult: "CUI wireless uses strong encryption and authentication. Guest network is isolated.", passCriteria: "WPA2-Enterprise enforced on CUI networks. Guest network cannot reach CUI systems." },
    ],
    closeoutChecklist: ["WPA2-Enterprise or WPA3 configured on CUI wireless networks", "802.1X authentication configured", "Guest network VLAN isolation verified", "Wireless security policy documented", "Evidence uploaded", "SSP narrative updated"],
  },

  {
    controlId: "AC.L2-3.1.18",
    implementationApproach: `Control connection of mobile devices. Mobile devices (smartphones, tablets) that connect to CUI systems must be managed, controlled, and monitored. Unmanaged personal devices should not be able to access CUI without additional controls. Implement Mobile Device Management (MDM) to enforce security policies on mobile devices.\n\nFor Microsoft 365: Enroll mobile devices in Microsoft Intune and enforce compliance policies. Use Conditional Access to require Intune enrollment before mobile devices can access CUI apps.`,
    systemsUsed: ["Microsoft Intune Admin Center", "Microsoft Entra Admin Center"],
    steps: [
      { stepNumber: 1, title: "Enroll Mobile Devices in Intune MDM", instruction: "Require all mobile devices (iOS, Android) that access CUI apps to be enrolled in Microsoft Intune MDM. Configure auto-enrollment via Entra ID registration.", systemPortal: "Microsoft Intune Admin Center", navigationPath: "Devices > Enrollment", recommendedSetting: "Automatic enrollment enabled for iOS and Android via Entra ID.", evidenceHint: "Screenshot of Intune enrollment configuration and enrolled mobile device list." },
      { stepNumber: 2, title: "Configure Mobile Device Compliance Policy", instruction: "Create compliance policies in Intune for iOS and Android devices requiring: PIN/password, encryption, up-to-date OS, no jailbreak/root, and screen lock.", systemPortal: "Microsoft Intune Admin Center", navigationPath: "Devices > Compliance policies", recommendedSetting: "Require device encryption, PIN (min 6 digits), OS version minimum, no jailbreak.", evidenceHint: "Screenshot of mobile compliance policy settings and compliance status." },
      { stepNumber: 3, title: "Require Compliant Mobile Device via Conditional Access", instruction: "Configure Conditional Access to require Intune-enrolled, compliant mobile devices before accessing CUI apps (Exchange Online, SharePoint, Teams).", systemPortal: "Microsoft Entra Admin Center", navigationPath: "Protection > Conditional Access", recommendedSetting: "Require device to be marked compliant by Intune for mobile access to CUI apps.", evidenceHint: "Screenshot of Conditional Access policy for mobile device compliance." },
    ],
    evidenceRequirements: [
      { title: "Mobile Device Compliance Policy", type: "Screenshot", filename: "AC-3.1.18_Mobile_Compliance_Policy_YYYY-MM-DD.png", location: "Intune > Compliance policies", mustShow: "Policy name, platform (iOS/Android), compliance requirements, assigned groups" },
      { title: "Mobile CA Policy", type: "Screenshot", filename: "AC-3.1.18_Mobile_CA_Policy_YYYY-MM-DD.png", location: "Entra > Conditional Access", mustShow: "Platform condition (mobile), require compliant device grant control" },
    ],
    testProcedures: [
      { name: "Unmanaged Mobile Device Block Test", steps: "1. Attempt to access Exchange Online or SharePoint from an unmanaged/unenrolled mobile device.\n2. Verify access is blocked by Conditional Access.\n3. Enroll the device in Intune and verify access is granted after compliance.", expectedResult: "Unmanaged mobile devices cannot access CUI apps. Enrolled, compliant devices can access.", passCriteria: "Unenrolled devices blocked. Enrolled and compliant devices granted access." },
    ],
    closeoutChecklist: ["Mobile device enrollment configured in Intune", "Mobile compliance policy created", "Conditional Access requires compliant mobile devices", "Mobile device inventory documented", "Evidence uploaded", "SSP narrative updated"],
  },

  {
    controlId: "AC.L2-3.1.19",
    implementationApproach: `Encrypt CUI on mobile devices and mobile computing platforms. Any CUI stored on or transmitted through mobile devices must be encrypted at rest and in transit. This protects CUI if a mobile device is lost or stolen.\n\nFor Microsoft 365: Require device encryption in Intune compliance policies for all mobile platforms. iOS encrypts by default when PIN is set. Android requires explicit encryption enforcement. Use Intune App Protection Policies (MAM) to encrypt CUI data within managed apps.`,
    systemsUsed: ["Microsoft Intune Admin Center", "Microsoft Entra Admin Center"],
    steps: [
      { stepNumber: 1, title: "Require Device Encryption in Compliance Policy", instruction: "Configure Intune compliance policies for iOS and Android to require storage encryption. iOS encrypts automatically when a passcode is set. Android requires explicit encryption compliance check.", systemPortal: "Microsoft Intune Admin Center", navigationPath: "Devices > Compliance policies > select policy > Device Health", recommendedSetting: "Require device encryption: Yes for all mobile platforms.", evidenceHint: "Screenshot of compliance policy showing encryption requirement enabled." },
      { stepNumber: 2, title: "Configure Intune App Protection Policies (MAM)", instruction: "Create App Protection Policies (MAM) for Microsoft 365 apps on iOS and Android. Configure policies to encrypt managed app data, prevent copy/paste to unmanaged apps, and require PIN for app access.", systemPortal: "Microsoft Intune Admin Center", navigationPath: "Apps > App protection policies", recommendedSetting: "Encrypt org data: Yes. Block clipboard: Yes. Require PIN for app access: Yes.", evidenceHint: "Screenshot of App Protection Policy settings for iOS and Android." },
      { stepNumber: 3, title: "Verify Encryption Compliance Status", instruction: "Review the device compliance report in Intune to confirm all enrolled mobile devices meet the encryption requirement. Follow up on non-compliant devices.", systemPortal: "Microsoft Intune Admin Center", navigationPath: "Reports > Device compliance", expectedResult: "All enrolled mobile devices show encryption as compliant.", evidenceHint: "Screenshot of mobile device compliance report showing encryption status." },
    ],
    evidenceRequirements: [
      { title: "Mobile Encryption Compliance Policy", type: "Screenshot", filename: "AC-3.1.19_Mobile_Encryption_Policy_YYYY-MM-DD.png", location: "Intune > Compliance policies", mustShow: "Require device encryption setting enabled for iOS and Android" },
      { title: "App Protection Policy (MAM)", type: "Screenshot", filename: "AC-3.1.19_App_Protection_Policy_YYYY-MM-DD.png", location: "Intune > App protection policies", mustShow: "Policy platform, encrypt org data = Yes, clipboard restrictions, PIN requirement" },
    ],
    testProcedures: [
      { name: "Mobile Encryption Verification", steps: "1. Check compliance status of 5 enrolled mobile devices — confirm encryption is compliant.\n2. Verify App Protection Policy is applied to M365 apps on enrolled devices.\n3. Test copy/paste from Teams to a non-managed app — verify it is blocked.", expectedResult: "All enrolled mobile devices have encryption enabled. App data is protected by MAM policies.", passCriteria: "100% of enrolled mobile devices report encryption compliant. MAM policies block data leakage." },
    ],
    closeoutChecklist: ["Device encryption required in compliance policy", "App Protection Policies (MAM) configured", "Mobile device compliance encryption verified", "Evidence uploaded", "SSP narrative updated"],
  },

  {
    controlId: "AC.L2-3.1.21",
    implementationApproach: `Limit use of portable storage devices on system components. USB drives, external hard drives, and other removable storage media present a significant CUI data exfiltration risk. Restrict or control the use of removable storage on CUI-scoped systems.\n\nFor Microsoft 365 / Intune: Use Intune device configuration policies to block or restrict USB/removable storage. Use Microsoft Defender for Endpoint to monitor and control removable storage access.`,
    systemsUsed: ["Microsoft Intune Admin Center", "Microsoft Defender Portal"],
    steps: [
      { stepNumber: 1, title: "Block or Restrict USB Storage via Intune", instruction: "Create an Intune device configuration profile or Endpoint Security attack surface reduction policy to block or restrict removable storage on CUI-scoped Windows devices.", systemPortal: "Microsoft Intune Admin Center", navigationPath: "Endpoint security > Attack surface reduction > Create policy > Removable storage access control", recommendedSetting: "Block write access to removable storage. Allow read-only access if needed for specific workflows. Block all for maximum protection.", evidenceHint: "Screenshot of Intune removable storage restriction policy." },
      { stepNumber: 2, title: "Configure Defender for Endpoint Removable Storage Control", instruction: "In Microsoft Defender for Endpoint, configure Device Control policies to define which removable storage devices are allowed (e.g., specific approved USB drives) and block all others.", systemPortal: "Microsoft Defender Portal", navigationPath: "Settings > Endpoints > Device control > Policies", recommendedSetting: "Block all removable storage by default. Create approved device exceptions for specific USB drives if required.", evidenceHint: "Screenshot of Defender device control policy." },
      { stepNumber: 3, title: "Document Exceptions and Approval Process", instruction: "If removable storage is required for specific business needs, document the exception with: justification, approved device type, authorized user, and additional controls (encryption requirement, scan before use).", systemPortal: "Organization documentation", evidenceHint: "Removable storage exception record or policy." },
    ],
    evidenceRequirements: [
      { title: "Removable Storage Restriction Policy", type: "Screenshot", filename: "AC-3.1.21_Removable_Storage_Policy_YYYY-MM-DD.png", location: "Intune > Endpoint security or Defender > Device control", mustShow: "Policy name, restriction level (block/audit), assigned groups" },
      { title: "Portable Storage Usage Policy", type: "Document", filename: "AC-3.1.21_Portable_Storage_Policy_YYYY-MM-DD.docx", location: "Organization-maintained", mustShow: "General prohibition, exception approval process, approved storage types if any" },
    ],
    testProcedures: [
      { name: "USB Block Verification", steps: "1. Insert a USB drive into a CUI-scoped device.\n2. Verify Intune or Defender policy blocks or restricts access to the drive.\n3. Confirm the event is logged in Defender or Intune.", expectedResult: "USB storage is blocked or restricted on CUI devices. Events are logged.", passCriteria: "Unauthorized USB drives blocked. Block event logged. Policy applied to all CUI devices." },
    ],
    closeoutChecklist: ["USB/removable storage policy configured in Intune", "Defender device control policies configured", "Exceptions documented with approval", "Portable storage policy communicated to users", "Evidence uploaded", "SSP narrative updated"],
  },

  // ── AWARENESS & TRAINING ────────────────────────────────────────────────

  {
    controlId: "AT.L2-3.2.1",
    implementationApproach: `Ensure that personnel are aware of the security risks associated with their activities and of the applicable policies, standards, and procedures. Security awareness training must be provided to all users annually (at minimum) and upon onboarding. Training must cover CUI handling, phishing, password security, and incident reporting.\n\nFor Microsoft 365: Use Microsoft Viva Learning or third-party LMS (KnowBe4, Proofpoint) for security awareness training delivery. Track completion via the platform. Use Microsoft Attack Simulator for phishing simulation.`,
    systemsUsed: ["Security Awareness Training Platform (KnowBe4 / Proofpoint / similar)", "Microsoft Defender Portal", "HR / LMS System"],
    steps: [
      { stepNumber: 1, title: "Deliver Annual Security Awareness Training", instruction: "Assign and track completion of annual security awareness training for all users. Training must cover: CUI handling, phishing recognition, password security, physical security, incident reporting, and acceptable use.", systemPortal: "Security Awareness Training Platform", expectedResult: "100% completion of annual training for all active users.", evidenceHint: "Training completion report showing all users, completion date, and course name." },
      { stepNumber: 2, title: "Conduct New Employee Security Onboarding Training", instruction: "Ensure all new employees complete security awareness training within their first 30 days. Document completion in HR/LMS system.", systemPortal: "HR / LMS System", evidenceHint: "Screenshot of new employee training enrollment and completion records." },
      { stepNumber: 3, title: "Run Phishing Simulation Exercises", instruction: "Conduct phishing simulation campaigns at least quarterly. Track click rates and report-rates. Provide immediate targeted training to users who click on simulated phishing emails.", systemPortal: "Microsoft Defender Portal", navigationPath: "Email & collaboration > Attack simulation training", recommendedSetting: "Run monthly simulations. Target users with click rates above 20% for additional training.", evidenceHint: "Phishing simulation results report showing campaign date, click rate, and training completion." },
      { stepNumber: 4, title: "Document Training Policy and Schedule", instruction: "Create or update the Security Awareness Training Policy defining: training frequency, topics covered, minimum completion requirements, and consequences for non-completion.", systemPortal: "Organization documentation", evidenceHint: "Security awareness training policy document." },
    ],
    evidenceRequirements: [
      { title: "Annual Training Completion Report", type: "Report/Export", filename: "AT-3.2.1_Training_Completion_YYYY-MM-DD.xlsx", location: "Training platform reports", mustShow: "Employee name, course name, completion date, score (if applicable)" },
      { title: "Phishing Simulation Results", type: "Report/Screenshot", filename: "AT-3.2.1_Phishing_Simulation_YYYY-MM-DD.png", location: "Attack simulator or training platform", mustShow: "Campaign date, users targeted, click rate, report rate, remedial training completion" },
    ],
    testProcedures: [
      { name: "Training Completion Currency Check", steps: "1. Pull training completion report for all active users.\n2. Confirm 100% of users completed training within the last 12 months.\n3. Confirm new hires in the last 30 days completed onboarding training.\n4. Review phishing simulation results from the past quarter.", expectedResult: "All users current on security awareness training. Phishing simulations conducted.", passCriteria: "100% training completion. Phishing simulation conducted in past quarter. Non-completers have documented remediation plan." },
    ],
    closeoutChecklist: ["Annual security awareness training delivered to all users", "New employee onboarding training process established", "Phishing simulation program active", "Training policy documented", "Training completion records retained", "Evidence uploaded", "SSP narrative updated"],
  },

  {
    controlId: "AT.L2-3.2.2",
    implementationApproach: `Ensure that personnel are trained to carry out their assigned information security responsibilities. Role-based training goes beyond general awareness — it provides job-specific security training for users whose roles involve elevated risk or responsibility: system administrators, developers, incident responders, and data handlers.\n\nFor Microsoft 365: Track role-based training completion in your LMS. Provide additional specialized training for admins (Entra, Intune, Defender), compliance managers, and other high-risk roles.`,
    systemsUsed: ["Security Awareness Training Platform", "HR / LMS System"],
    steps: [
      { stepNumber: 1, title: "Identify Roles Requiring Role-Based Training", instruction: "Document all roles that have elevated security responsibilities: IT administrators, compliance managers, incident responders, developers, data custodians, and executive leadership. Create a role-training matrix.", systemPortal: "Organization documentation", evidenceHint: "Role-based training matrix document." },
      { stepNumber: 2, title: "Deliver Role-Specific Security Training", instruction: "Assign and track completion of role-specific training: admin security training for IT staff, secure development training for developers, CMMC compliance training for compliance team, data handling training for CUI users.", systemPortal: "HR / LMS System", evidenceHint: "Role-based training completion records by role and user." },
      { stepNumber: 3, title: "Track Training Currency and Renewal", instruction: "Ensure role-based training is renewed annually or when roles change significantly. Set up automated reminders in the LMS for upcoming training renewals.", systemPortal: "HR / LMS System", evidenceHint: "Screenshot of training renewal schedule or automated reminder configuration." },
    ],
    evidenceRequirements: [
      { title: "Role-Based Training Matrix", type: "Document/Spreadsheet", filename: "AT-3.2.2_Role_Training_Matrix_YYYY-MM-DD.xlsx", location: "Organization-maintained", mustShow: "Role, required training courses, frequency, current completion status" },
      { title: "Role Training Completion Records", type: "Report/Export", filename: "AT-3.2.2_Role_Training_Completion_YYYY-MM-DD.xlsx", location: "LMS / Training platform", mustShow: "User, role, course name, completion date" },
    ],
    testProcedures: [
      { name: "Role-Based Training Currency Check", steps: "1. Sample 5 users from different security-sensitive roles.\n2. Confirm each completed role-appropriate training within the past 12 months.\n3. Confirm the training content aligns with their security responsibilities.", expectedResult: "All security-sensitive roles have current, relevant training records.", passCriteria: "All sampled users current on role-appropriate training. Role-training matrix documented." },
    ],
    closeoutChecklist: ["Security roles with elevated responsibilities identified", "Role-based training assigned to all relevant roles", "Training completion tracked in LMS", "Annual renewal process established", "Evidence uploaded", "SSP narrative updated"],
  },

  {
    controlId: "AT.L2-3.2.3",
    implementationApproach: `Provide security awareness training on recognizing and reporting potential threats posed by individuals seeking to gain unauthorized access to organizational resources, commonly referred to as insider threat awareness. This training is specifically focused on recognizing the signs of insider threats, social engineering, and malicious or negligent insider behavior.\n\nFor Microsoft 365: Include insider threat content in your annual security awareness program. Establish a clear reporting mechanism for suspected insider activity. Use Microsoft Purview Insider Risk Management if licensed.`,
    systemsUsed: ["Security Awareness Training Platform", "Microsoft Purview Portal (if licensed)", "HR System"],
    steps: [
      { stepNumber: 1, title: "Include Insider Threat Module in Awareness Training", instruction: "Add an insider threat awareness module to the annual security awareness curriculum. Topics should include: warning signs of insider threats, protecting information from social engineering, reporting suspicious behavior, and consequences of insider threats.", systemPortal: "Security Awareness Training Platform", evidenceHint: "Insider threat training module completion report." },
      { stepNumber: 2, title: "Establish an Insider Threat Reporting Mechanism", instruction: "Create and communicate a clear, confidential process for reporting suspected insider threats. This may be an anonymous tip line, security team email, or HR process. Ensure all employees know how to report.", systemPortal: "Organization documentation", evidenceHint: "Insider threat reporting procedure and communication evidence." },
      { stepNumber: 3, title: "Configure Insider Risk Management (if licensed)", instruction: "If using Microsoft Purview E5 or Insider Risk Management add-on, configure policies to detect: data exfiltration, access policy violations, departing employee activities, and security policy violations.", systemPortal: "Microsoft Purview Portal", navigationPath: "Insider risk management > Policies", evidenceHint: "Screenshot of Insider Risk Management policy configuration." },
    ],
    evidenceRequirements: [
      { title: "Insider Threat Training Completion", type: "Report", filename: "AT-3.2.3_Insider_Threat_Training_YYYY-MM-DD.xlsx", location: "Training platform", mustShow: "User names, course name (must include insider threat topic), completion date" },
      { title: "Insider Threat Reporting Procedure", type: "Document", filename: "AT-3.2.3_Insider_Threat_Reporting_Procedure_YYYY-MM-DD.docx", location: "Organization-maintained", mustShow: "Reporting channels, what to report, confidentiality protections, escalation process" },
    ],
    testProcedures: [
      { name: "Insider Threat Awareness Verification", steps: "1. Confirm insider threat content is included in the annual awareness training curriculum.\n2. Pull completion records to confirm all users completed insider threat training.\n3. Verify the reporting mechanism is documented and communicated to all employees.", expectedResult: "All employees trained on insider threats. Reporting mechanism established and communicated.", passCriteria: "100% of employees completed insider threat awareness training. Reporting process documented." },
    ],
    closeoutChecklist: ["Insider threat module added to annual training", "Reporting mechanism established and communicated", "Insider Risk Management configured (if licensed)", "Training completion records maintained", "Evidence uploaded", "SSP narrative updated"],
  },

  // ── AUDIT & ACCOUNTABILITY (remaining) ─────────────────────────────────

  {
    controlId: "AU.L2-3.3.2",
    implementationApproach: `Ensure that the actions of individual system users can be uniquely traced to those users so they can be held accountable for their actions. Every audit log event must contain enough information to identify the specific individual who performed the action — no shared accounts, no anonymous actions.\n\nFor Microsoft 365: The Unified Audit Log records all actions with the specific user UPN. Ensure no shared accounts are used. Ensure all admin actions are performed from individual named accounts.`,
    systemsUsed: ["Microsoft Purview Portal", "Microsoft Entra Admin Center"],
    steps: [
      { stepNumber: 1, title: "Verify Audit Log Captures Individual User Identity", instruction: "Search the audit log for recent events and confirm each entry contains the specific user UPN — not a shared or service account. Verify no actions are attributed to shared accounts.", systemPortal: "Microsoft Purview Portal", navigationPath: "Audit > Search", expectedResult: "All audit events contain a specific named user or service principal as the actor.", evidenceHint: "Screenshot of audit log search results showing individual user attribution." },
      { stepNumber: 2, title: "Verify No Shared Accounts Are Used", instruction: "Confirm no shared accounts (info@, admin@, helpdesk@) are used to perform actions in CUI systems. All actions must be traceable to a named individual.", systemPortal: "Microsoft Entra Admin Center", navigationPath: "Identity > Users > All Users", evidenceHint: "User account list confirming no shared accounts exist or are used for CUI activities." },
      { stepNumber: 3, title: "Review Service Account Actions", instruction: "For service accounts and automation accounts, verify each has a documented owner. Actions performed by service accounts must be separately reviewed.", systemPortal: "Microsoft Purview Portal", evidenceHint: "Service account inventory with owner documentation." },
    ],
    evidenceRequirements: [
      { title: "Audit Log Individual Attribution Sample", type: "Screenshot", filename: "AU-3.3.2_Audit_User_Attribution_YYYY-MM-DD.png", location: "Purview > Audit", mustShow: "Recent events with individual user UPNs in the User field, timestamps, and activities" },
    ],
    testProcedures: [
      { name: "User Accountability Traceability Check", steps: "1. Sample 10 recent audit log entries.\n2. Confirm each entry identifies a specific named user (not a shared account).\n3. Confirm the identified user actually performed the action (cross-reference with their account).", expectedResult: "All auditable actions are attributed to individual named users.", passCriteria: "100% of sampled audit entries have individual user attribution. No actions attributed to shared accounts." },
    ],
    closeoutChecklist: ["Audit log verified to capture individual user identity", "No shared accounts used for CUI activities", "Service account ownership documented", "Evidence uploaded", "SSP narrative updated"],
  },

  {
    controlId: "AU.L2-3.3.3",
    implementationApproach: `Review and update logged events. The organization must periodically review what events are being logged to ensure the right events are captured for security monitoring and investigation. Log coverage should be updated when systems change.\n\nFor Microsoft 365: Review the audit log activity categories in Purview to confirm all relevant activities are being captured. Adjust logging scope as new Microsoft 365 services are adopted.`,
    systemsUsed: ["Microsoft Purview Portal", "Microsoft Entra Admin Center"],
    steps: [
      { stepNumber: 1, title: "Review Current Audit Log Event Coverage", instruction: "Review what event categories are captured in the Microsoft 365 Unified Audit Log. Confirm coverage includes: user sign-ins, admin activities, file access, sharing events, DLP matches, mail flow, and eDiscovery.", systemPortal: "Microsoft Purview Portal", navigationPath: "Audit > Search > Activities dropdown", evidenceHint: "Screenshot of audit activity categories with current events being captured documented." },
      { stepNumber: 2, title: "Update Logging Coverage as Services Change", instruction: "When new Microsoft 365 services or on-premises systems are added, review and update the audit log scope to include the new services. Document changes to audit log configuration.", systemPortal: "Microsoft Purview Portal", evidenceHint: "Change log or documentation of audit scope updates when services were added." },
      { stepNumber: 3, title: "Document the Required Events List", instruction: "Create and maintain a documented list of events that must be captured for CMMC compliance. Review this list annually and verify the audit log is capturing all required events.", systemPortal: "Organization documentation", evidenceHint: "Required events list document with annual review date." },
    ],
    evidenceRequirements: [
      { title: "Audit Event Coverage Review", type: "Document/Screenshot", filename: "AU-3.3.3_Audit_Coverage_Review_YYYY-MM-DD.docx", location: "Organization-maintained", mustShow: "Event categories reviewed, gaps identified, updates made, review date" },
    ],
    testProcedures: [
      { name: "Audit Coverage Completeness Check", steps: "1. Review the required events list against current audit log settings.\n2. Perform sample actions in each required category and verify they appear in the audit log.\n3. Confirm the coverage review was performed within the last 12 months.", expectedResult: "All required events are being captured in the audit log.", passCriteria: "Required events list documented and current. All required event types appear in audit log." },
    ],
    closeoutChecklist: ["Required audit events documented", "Current audit log coverage reviewed", "Gaps in coverage addressed", "Annual coverage review scheduled", "Evidence uploaded", "SSP narrative updated"],
  },

  {
    controlId: "AU.L2-3.3.4",
    implementationApproach: `Alert in the event of audit logging process failure. If the audit log system fails — because storage is full, the log service stops, or another failure occurs — security personnel must be immediately alerted. A failed audit log means activities are no longer being tracked, creating a security gap.\n\nFor Microsoft 365: Configure Microsoft 365 service health alerts and Defender alerts for audit log failures. Set up monitoring for Entra ID diagnostic log failures if using Log Analytics.`,
    systemsUsed: ["Microsoft 365 Admin Center", "Microsoft Defender Portal", "Microsoft Entra Admin Center"],
    steps: [
      { stepNumber: 1, title: "Configure Microsoft 365 Service Health Alerts", instruction: "Enable service health alert emails in the Microsoft 365 Admin Center. Configure alerts for Compliance, Security, and Audit-related service incidents.", systemPortal: "Microsoft 365 Admin Center", navigationPath: "Settings > Org settings > Preferences > Email and messaging", recommendedSetting: "Send service health alerts to the security team email for all security-related incidents.", evidenceHint: "Screenshot of service health notification configuration." },
      { stepNumber: 2, title: "Configure Log Analytics Alert for Audit Log Failure", instruction: "If using Microsoft Sentinel or Log Analytics for audit log ingestion, create an alert rule that triggers when no audit events are received within a defined time window (indicating a log collection failure).", systemPortal: "Microsoft Sentinel / Log Analytics", expectedResult: "Alert fires within 1 hour of audit log collection failure.", evidenceHint: "Screenshot of alert rule configuration for audit log failure." },
      { stepNumber: 3, title: "Document the Response Procedure for Audit Failures", instruction: "Create a procedure for responding to audit log failures: who to notify, how to restore logging, how to document the gap, and whether compensating controls are needed during the outage.", systemPortal: "Organization documentation", evidenceHint: "Audit log failure response procedure document." },
    ],
    evidenceRequirements: [
      { title: "Audit Failure Alert Configuration", type: "Screenshot", filename: "AU-3.3.4_Audit_Failure_Alert_Config_YYYY-MM-DD.png", location: "M365 Admin or Sentinel", mustShow: "Alert rule, trigger conditions, notification recipients" },
      { title: "Audit Failure Response Procedure", type: "Document", filename: "AU-3.3.4_Audit_Failure_Response_YYYY-MM-DD.docx", location: "Organization-maintained", mustShow: "Alert notification process, restoration steps, documentation requirements, compensating controls" },
    ],
    testProcedures: [
      { name: "Audit Failure Alert Test", steps: "1. Verify audit failure alert is configured.\n2. If possible, simulate an audit log failure (e.g., temporarily stop log collection) and confirm the alert fires.\n3. Verify the response procedure is documented.", expectedResult: "Alert fires when audit logging fails. Response procedure is documented.", passCriteria: "Alert configuration exists. Response procedure documented. Test or tabletop exercise completed." },
    ],
    closeoutChecklist: ["Service health alerts configured", "Audit failure alert rules created", "Response procedure documented", "Alert contacts current", "Evidence uploaded", "SSP narrative updated"],
  },

  {
    controlId: "AU.L2-3.3.6",
    implementationApproach: `Provide audit record reduction and report generation to support on-demand analysis and after-the-fact investigations. The organization should have tools and processes to search, filter, and correlate audit records without having to read through raw logs manually. This enables efficient investigation.\n\nFor Microsoft 365: The Purview Audit search tool provides on-demand filtering and export. Microsoft Sentinel provides advanced SIEM correlation and reporting. Defender provides investigation tools.`,
    systemsUsed: ["Microsoft Purview Portal", "Microsoft Sentinel (if available)", "Microsoft Defender Portal"],
    steps: [
      { stepNumber: 1, title: "Demonstrate Audit Log Search Capability", instruction: "Demonstrate the ability to search and filter audit logs by user, date range, activity type, and resource. Export search results for reporting.", systemPortal: "Microsoft Purview Portal", navigationPath: "Audit > Search", expectedResult: "Audit log can be searched and exported within minutes for any given query.", evidenceHint: "Screenshot of audit search with filters applied and results showing." },
      { stepNumber: 2, title: "Create Standard Audit Reports", instruction: "Create and document standard audit report queries that are run regularly (weekly or monthly): admin activity report, user sign-in report, external sharing report, DLP match report.", systemPortal: "Microsoft Purview Portal", evidenceHint: "Saved audit search queries or exported reports from last review period." },
      { stepNumber: 3, title: "Configure SIEM Correlation (Sentinel/Defender)", instruction: "If using Microsoft Sentinel, configure correlation rules and workbooks to automatically aggregate and analyze audit events. This provides dashboards for ongoing audit monitoring.", systemPortal: "Microsoft Sentinel", evidenceHint: "Screenshot of Sentinel workbook or alert rule providing audit log correlation." },
    ],
    evidenceRequirements: [
      { title: "Audit Report Generation Sample", type: "Export/Screenshot", filename: "AU-3.3.6_Audit_Report_Sample_YYYY-MM-DD.xlsx", location: "Purview > Audit > Search > Export", mustShow: "Search criteria used, date range, activity types, filtered results, export columns" },
    ],
    testProcedures: [
      { name: "On-Demand Audit Report Generation", steps: "1. Request the audit log for a specific user's activity in the past 7 days.\n2. Verify the report can be generated within 10 minutes.\n3. Export the results to CSV and confirm all required fields are present.", expectedResult: "On-demand audit reports can be generated quickly and completely.", passCriteria: "Audit search returns complete results. Export includes all required fields. Process takes less than 10 minutes." },
    ],
    closeoutChecklist: ["Audit search capability demonstrated and documented", "Standard report queries created", "Audit reports run on regular schedule", "SIEM correlation configured (if available)", "Evidence uploaded", "SSP narrative updated"],
  },

  {
    controlId: "AU.L2-3.3.7",
    implementationApproach: `Use a system-wide (logical or physical) authoritative time source for the generation of time stamps for audit records. All audit log timestamps must be synchronized to a reliable, consistent time source so that events can be correlated across systems and time zones during investigations. Use NTP synchronized to authoritative time sources.\n\nFor Microsoft 365: Microsoft cloud services use authoritative NTP time sources internally. For Windows domain-joined devices, configure the domain controller to synchronize with an authoritative NTP server.`,
    systemsUsed: ["Microsoft Intune Admin Center", "Windows Domain Controller / NTP", "Microsoft 365 Admin Center"],
    steps: [
      { stepNumber: 1, title: "Verify NTP Configuration on Windows Devices", instruction: "Confirm Windows devices are configured to synchronize time with the domain controller (which synchronizes with an authoritative NTP source). Verify time is accurate on CUI-scoped devices.", systemPortal: "Windows / Group Policy / Intune", navigationPath: "Run: w32tm /query /status", recommendedSetting: "Windows Time service: Automatic. Sync peer: Domain controller or pool.ntp.org.", evidenceHint: "Screenshot of w32tm /query /status output on CUI devices." },
      { stepNumber: 2, title: "Configure Authoritative NTP Source on Domain Controller", instruction: "Configure the primary domain controller to synchronize with a Stratum 1 or Stratum 2 NTP source (e.g., time.windows.com, pool.ntp.org, or a government NTP server).", systemPortal: "Domain Controller / Group Policy", navigationPath: "w32tm /config /manualpeerlist:\"time.windows.com\" /syncfromflags:manual /reliable:YES /update", evidenceHint: "NTP configuration command output or Group Policy screenshot." },
      { stepNumber: 3, title: "Verify Microsoft 365 Time Accuracy", instruction: "Microsoft 365 services use Microsoft's authoritative time infrastructure. Verify audit log timestamps match expected times during a test activity.", systemPortal: "Microsoft Purview Portal", evidenceHint: "Screenshot of audit log showing accurate timestamps (cross-referenced with a known test action time)." },
    ],
    evidenceRequirements: [
      { title: "NTP Configuration Evidence", type: "Screenshot", filename: "AU-3.3.7_NTP_Config_YYYY-MM-DD.png", location: "Domain controller / CUI device", mustShow: "Time source configured, current time accurate, last sync time" },
    ],
    testProcedures: [
      { name: "Time Synchronization Accuracy Check", steps: "1. Check time on 3 CUI devices using w32tm /query /status.\n2. Compare device time to an authoritative source (time.gov, time.windows.com).\n3. Confirm time difference is less than 1 second.\n4. Confirm NTP server is the domain controller or an authoritative source.", expectedResult: "All CUI systems use an authoritative time source with accurate timestamps.", passCriteria: "Time difference less than 1 second. Authoritative time source documented and configured." },
    ],
    closeoutChecklist: ["Authoritative NTP source configured on domain controller", "CUI devices verified to synchronize from domain", "M365 time accuracy verified", "NTP policy documented", "Evidence uploaded", "SSP narrative updated"],
  },

  {
    controlId: "AU.L2-3.3.8",
    implementationApproach: `Protect audit information and audit tools from unauthorized access, modification, and deletion. Audit logs are critical for detecting and investigating security incidents — they must not be modifiable or deletable by regular users or even most administrators. Implement controls to protect audit log integrity.\n\nFor Microsoft 365: The Unified Audit Log is protected by Microsoft's infrastructure. Use audit log retention policies. Consider configuring audit log to be immutable using Microsoft Purview Audit (Premium) with immutable storage.`,
    systemsUsed: ["Microsoft Purview Portal", "Microsoft Sentinel / Log Analytics (if available)"],
    steps: [
      { stepNumber: 1, title: "Restrict Audit Log Access to Authorized Roles", instruction: "Confirm only authorized roles (Compliance Administrator, Audit Reader) can access and export audit logs. Standard users and most admins should not be able to modify or delete audit records.", systemPortal: "Microsoft Purview Portal", navigationPath: "Permissions > Compliance center roles > Audit", recommendedSetting: "Only Compliance Admin and designated audit reviewers should have audit log access.", evidenceHint: "Screenshot of audit log role assignments." },
      { stepNumber: 2, title: "Enable Audit Log Immutability (Purview Audit Premium)", instruction: "If licensed for Purview Audit Premium (formerly Advanced Audit), configure immutable audit log storage to prevent modification or deletion of audit records.", systemPortal: "Microsoft Purview Portal", evidenceHint: "Screenshot of Purview Audit license status and retention policy." },
      { stepNumber: 3, title: "Export Audit Logs to Immutable Storage", instruction: "Configure audit logs to be exported to an external, immutable storage location (Azure Immutable Blob Storage, or another SIEM) to ensure logs are preserved even if the primary source is compromised.", systemPortal: "Microsoft Entra Admin Center / Azure", navigationPath: "Entra > Diagnostic settings > Log Analytics or Storage Account", evidenceHint: "Screenshot of diagnostic settings exporting logs to immutable storage." },
    ],
    evidenceRequirements: [
      { title: "Audit Log Access Controls", type: "Screenshot", filename: "AU-3.3.8_Audit_Log_Access_Controls_YYYY-MM-DD.png", location: "Purview > Permissions", mustShow: "Role assignments for audit access — only authorized roles listed" },
      { title: "Audit Log Export to Immutable Storage", type: "Screenshot", filename: "AU-3.3.8_Audit_Log_Immutable_Export_YYYY-MM-DD.png", location: "Entra > Diagnostic settings or Azure Storage", mustShow: "Log export destination, immutability setting, retention policy" },
    ],
    testProcedures: [
      { name: "Audit Log Protection Verification", steps: "1. Attempt to delete or modify an audit log entry as a non-admin user — verify it is not possible.\n2. Attempt to delete the audit log as a Global Admin — verify the log cannot be deleted.\n3. Confirm audit log export to external storage is functioning.", expectedResult: "Audit logs cannot be modified or deleted by unauthorized users.", passCriteria: "No role can delete individual audit log entries. Export to immutable storage is configured." },
    ],
    closeoutChecklist: ["Audit log access restricted to authorized roles", "Audit log immutability configured (if licensed)", "Audit log export to external storage configured", "Evidence uploaded", "SSP narrative updated"],
  },

  {
    controlId: "AU.L2-3.3.9",
    implementationApproach: `Limit management of audit logging to a subset of privileged users. Only a small, designated group of security or compliance administrators should be able to manage audit log settings: enable/disable logging, change retention policies, or modify what events are captured. This prevents insiders from disabling logging to hide malicious activity.\n\nFor Microsoft 365: Use role-based access control in Purview to limit who can manage audit settings. Ensure changes to audit configuration are themselves audited.`,
    systemsUsed: ["Microsoft Purview Portal", "Microsoft 365 Admin Center"],
    steps: [
      { stepNumber: 1, title: "Restrict Audit Configuration Access", instruction: "Review who has the Compliance Administrator or Audit Management role in Microsoft Purview. This should be a small, named set of compliance officers — not general IT staff.", systemPortal: "Microsoft Purview Portal", navigationPath: "Permissions > Microsoft Purview solutions > Audit management", recommendedSetting: "Maximum 2-3 named users with audit management permissions.", evidenceHint: "Screenshot of audit management role assignments." },
      { stepNumber: 2, title: "Audit Changes to Audit Configuration", instruction: "Verify that changes to audit log settings (enable/disable, retention changes) are themselves logged in the audit trail. Search for 'Set-AdminAuditLogConfig' or similar admin operations.", systemPortal: "Microsoft Purview Portal", navigationPath: "Audit > Search > Activities: Admin Activities", evidenceHint: "Screenshot of audit log entry showing a recent audit configuration change." },
      { stepNumber: 3, title: "Document Authorized Audit Administrators", instruction: "Maintain a list of authorized audit log administrators with their role, name, and authorization date. Review this list annually.", systemPortal: "Organization documentation", evidenceHint: "Authorized audit administrators list." },
    ],
    evidenceRequirements: [
      { title: "Audit Management Role Assignments", type: "Screenshot", filename: "AU-3.3.9_Audit_Mgmt_Roles_YYYY-MM-DD.png", location: "Purview > Permissions", mustShow: "Role name (Audit Management), assigned users (should be minimal)" },
    ],
    testProcedures: [
      { name: "Audit Management Access Restriction Check", steps: "1. Confirm the list of audit management role holders is small (≤3 users).\n2. Attempt to modify audit log settings as a non-authorized user — verify access denied.\n3. Make an audit configuration change as an authorized admin and confirm it appears in the audit log.", expectedResult: "Only authorized, named individuals can manage audit log settings.", passCriteria: "Audit management roles assigned to ≤3 authorized users. Changes to audit config are logged." },
    ],
    closeoutChecklist: ["Audit management roles restricted to authorized users", "Authorized audit admins documented", "Audit configuration changes verified to be logged", "Annual review scheduled", "Evidence uploaded", "SSP narrative updated"],
  },

  // ── SECURITY ASSESSMENT (remaining) ────────────────────────────────────

  {
    controlId: "CA.L2-3.12.1",
    implementationApproach: `Periodically assess the security controls in organizational systems to determine if the controls are effective in their application. Security control assessments should be conducted annually (or more frequently for high-risk controls). The assessment should examine whether controls are implemented correctly, operating as intended, and producing the desired outcome.\n\nFor Microsoft 365: Use Microsoft Compliance Manager (Purview) for ongoing control assessment tracking. Conduct annual internal security control reviews or engage a third-party assessor.`,
    systemsUsed: ["Microsoft Purview Portal", "Microsoft Compliance Manager"],
    steps: [
      { stepNumber: 1, title: "Configure Microsoft Compliance Manager for CMMC", instruction: "Access Microsoft Compliance Manager in Purview and configure the CMMC Level 2 assessment. Assign controls to owners and track implementation status.", systemPortal: "Microsoft Purview Portal", navigationPath: "Compliance Manager > Assessments > Add assessment > CMMC Level 2", expectedResult: "CMMC compliance assessment is active in Compliance Manager with controls assigned.", evidenceHint: "Screenshot of Compliance Manager CMMC assessment." },
      { stepNumber: 2, title: "Conduct Annual Security Control Review", instruction: "Schedule and perform an annual review of all CMMC controls. For each control, assess: is it implemented? Is it effective? Is evidence current? Document findings.", systemPortal: "Organization documentation or Control HUB", evidenceHint: "Annual security control assessment report with date, reviewer, findings, and remediation actions." },
      { stepNumber: 3, title: "Engage Third-Party Assessor for Formal Assessment", instruction: "For CMMC Level 2 certification, engage a Certified Third-Party Assessment Organization (C3PAO) for a formal triennial assessment. Maintain records of all assessment activities.", systemPortal: "External C3PAO", evidenceHint: "C3PAO engagement letter or assessment report (or internal assessment report if conducting self-assessment)." },
    ],
    evidenceRequirements: [
      { title: "Annual Security Control Assessment Report", type: "Document/Report", filename: "CA-3.12.1_Security_Control_Assessment_YYYY-MM-DD.docx", location: "Organization-maintained", mustShow: "Controls assessed, assessment date, assessor, findings, remediation actions" },
      { title: "Compliance Manager CMMC Assessment", type: "Screenshot", filename: "CA-3.12.1_Compliance_Manager_YYYY-MM-DD.png", location: "Purview > Compliance Manager", mustShow: "CMMC assessment name, compliance score, control completion status" },
    ],
    testProcedures: [
      { name: "Security Control Assessment Currency Check", steps: "1. Confirm a security control assessment was performed within the last 12 months.\n2. Verify assessment covers all in-scope CMMC controls.\n3. Confirm findings have associated remediation actions with owners and due dates.", expectedResult: "Annual security control assessment performed and documented.", passCriteria: "Assessment completed within last 12 months. All controls assessed. Remediation tracked." },
    ],
    closeoutChecklist: ["Compliance Manager CMMC assessment configured", "Annual security control assessment completed", "Assessment findings documented with remediation", "C3PAO engagement planned (for formal certification)", "Evidence uploaded", "SSP narrative updated"],
  },

  {
    controlId: "CA.L2-3.12.2",
    implementationApproach: `Develop and implement plans of action designed to correct deficiencies and reduce or eliminate vulnerabilities in organizational systems. The Plan of Action and Milestones (POA&M) is a formal document that tracks all known security weaknesses with milestones, resource requirements, owners, and scheduled completion dates.\n\nFor Microsoft 365: Use Control HUB's POA&M module to track and manage all open deficiencies identified through security assessments, audits, and vulnerability scans.`,
    systemsUsed: ["Control HUB POA&M module", "Microsoft Purview Portal", "Vulnerability Scanner"],
    steps: [
      { stepNumber: 1, title: "Create POA&M for All Identified Deficiencies", instruction: "For every control deficiency, vulnerability, or audit finding, create a POA&M entry documenting: weakness description, risk level, scheduled completion date, resources required, and responsible owner.", systemPortal: "Control HUB POA&M module", expectedResult: "All known deficiencies have a corresponding POA&M entry.", evidenceHint: "Screenshot of POA&M list showing all open items with required fields." },
      { stepNumber: 2, title: "Define Milestone Dates and Owners", instruction: "For each POA&M entry, set realistic but aggressive milestone dates. Assign a named owner responsible for remediation. Escalation path should be documented if milestones are missed.", systemPortal: "Control HUB POA&M module", evidenceHint: "Screenshot of individual POA&M record showing milestone dates and owner assignment." },
      { stepNumber: 3, title: "Review POA&M Progress Monthly", instruction: "Conduct a monthly POA&M review to assess progress, identify blockers, update milestone dates as needed, and escalate overdue items. Document each review.", systemPortal: "Control HUB POA&M module", evidenceHint: "Monthly POA&M review record showing items reviewed, status updates, and any escalations." },
    ],
    evidenceRequirements: [
      { title: "Current POA&M Register", type: "Export/Screenshot", filename: "CA-3.12.2_POA&M_Register_YYYY-MM-DD.xlsx", location: "Control HUB > POA&Ms", mustShow: "All open items with: weakness, risk level, owner, milestone dates, status" },
      { title: "Monthly POA&M Review Record", type: "Document", filename: "CA-3.12.2_POA&M_Review_Record_YYYY-MM-DD.docx", location: "Organization-maintained", mustShow: "Review date, items reviewed, status changes, escalations, next review date" },
    ],
    testProcedures: [
      { name: "POA&M Completeness and Currency Check", steps: "1. Pull the current POA&M register and confirm all known deficiencies are listed.\n2. Confirm each item has an owner, milestone dates, and current status.\n3. Verify monthly reviews have been conducted for the past 3 months.", expectedResult: "All deficiencies have POA&M entries. Reviews are conducted monthly.", passCriteria: "No known deficiencies missing from POA&M. Monthly reviews documented. Overdue items have escalation evidence." },
    ],
    closeoutChecklist: ["POA&M created for all identified deficiencies", "Milestone dates and owners assigned to all items", "Monthly review process established", "Overdue items escalated", "Evidence uploaded", "SSP narrative updated"],
  },

  {
    controlId: "CA.L2-3.12.4",
    implementationApproach: `Develop, document, and periodically update system security plans that describe system boundaries, system environments of operation, how security requirements are implemented, and the relationships with or connections to other systems. The System Security Plan (SSP) is the foundational compliance document describing your CMMC implementation.\n\nFor Microsoft 365: Use Control HUB's SSP module to build and maintain the SSP. The SSP must be reviewed and updated at least annually or when significant changes occur.`,
    systemsUsed: ["Control HUB SSP module"],
    steps: [
      { stepNumber: 1, title: "Complete the System Security Plan in Control HUB", instruction: "Access the SSP section of Control HUB and complete all required fields: system boundary, system description, data flows, personnel, interconnections, and implementation statements for all 110 controls.", systemPortal: "Control HUB SSP module", expectedResult: "SSP is complete with implementation statements for all controls.", evidenceHint: "Screenshot of SSP overview showing completion percentage and last update date." },
      { stepNumber: 2, title: "Define the Authorization Boundary", instruction: "Clearly define the system boundary in the SSP: which systems, networks, and users are in scope for CMMC. Include a network diagram showing the boundary.", systemPortal: "Organization documentation / Control HUB SSP", evidenceHint: "Network diagram showing authorization boundary." },
      { stepNumber: 3, title: "Establish Annual SSP Review Process", instruction: "Schedule an annual SSP review to update implementation statements, reflect system changes, and incorporate new controls or modified implementations. Document each review.", systemPortal: "Control HUB SSP module", evidenceHint: "SSP review record showing date, reviewer, sections updated." },
    ],
    evidenceRequirements: [
      { title: "Completed System Security Plan", type: "Document/Export", filename: "CA-3.12.4_System_Security_Plan_YYYY-MM-DD.docx", location: "Control HUB > SSP > Export", mustShow: "System description, authorization boundary, all control implementation statements, review date" },
    ],
    testProcedures: [
      { name: "SSP Completeness and Currency Check", steps: "1. Review the SSP and confirm it has implementation statements for all 110 CMMC Level 2 controls.\n2. Confirm the SSP was reviewed within the last 12 months.\n3. Confirm the authorization boundary and network diagram are current.", expectedResult: "SSP is complete, current, and accurate.", passCriteria: "All 110 controls have implementation statements. SSP reviewed within last 12 months. Boundary current." },
    ],
    closeoutChecklist: ["SSP complete for all 110 controls", "Authorization boundary defined and documented", "Network diagram current", "Annual review process established", "SSP approved by management", "Evidence uploaded"],
  },

  // ── CONFIGURATION MANAGEMENT ────────────────────────────────────────────

  {
    controlId: "CM.L2-3.4.1",
    implementationApproach: `Establish and maintain baseline configurations and inventories of organizational systems (including hardware, software, firmware, and documentation) throughout the respective system development life cycles. A baseline configuration is the approved, documented "known good" state of a system.\n\nFor Microsoft 365: Maintain a device inventory in Intune. Define baseline configuration settings for Windows devices. Use Intune configuration profiles as the documented baseline.`,
    systemsUsed: ["Microsoft Intune Admin Center", "Microsoft Defender Portal"],
    steps: [
      { stepNumber: 1, title: "Create and Maintain a Hardware Inventory", instruction: "Maintain an up-to-date inventory of all hardware devices in scope for CMMC. Include: device name, model, serial number, OS, assigned user, and network location.", systemPortal: "Microsoft Intune Admin Center", navigationPath: "Devices > All Devices", expectedResult: "All CUI-scoped devices appear in Intune inventory with current information.", evidenceHint: "Intune device inventory export or screenshot." },
      { stepNumber: 2, title: "Define Baseline Configuration Profiles", instruction: "Create Intune configuration profiles that define the approved baseline configuration for CUI-scoped Windows devices: security settings, browser settings, OS update settings, and app settings.", systemPortal: "Microsoft Intune Admin Center", navigationPath: "Devices > Configuration profiles", evidenceHint: "Screenshot of baseline configuration profiles assigned to CUI device groups." },
      { stepNumber: 3, title: "Maintain Software Inventory", instruction: "Maintain an inventory of all approved software installed on CUI devices. Use Intune's Discovered Apps report to see what is installed. Compare against the approved software list.", systemPortal: "Microsoft Intune Admin Center", navigationPath: "Apps > Monitor > Discovered apps", expectedResult: "Software inventory is current and reflects only approved applications.", evidenceHint: "Screenshot of Intune discovered apps report." },
    ],
    evidenceRequirements: [
      { title: "Hardware/Device Inventory", type: "Export/Screenshot", filename: "CM-3.4.1_Device_Inventory_YYYY-MM-DD.xlsx", location: "Intune > All Devices > Export", mustShow: "Device name, model, OS, enrollment date, assigned user, compliance status" },
      { title: "Baseline Configuration Profiles", type: "Screenshot", filename: "CM-3.4.1_Baseline_Config_Profiles_YYYY-MM-DD.png", location: "Intune > Configuration profiles", mustShow: "Profile names, platforms, settings summary, assigned groups" },
    ],
    testProcedures: [
      { name: "Baseline Configuration Compliance Check", steps: "1. Select a CUI device and review its configuration in Intune.\n2. Verify it matches the documented baseline configuration profile.\n3. Confirm the device inventory is current and all CUI devices are included.", expectedResult: "All CUI devices have baseline configurations applied and are tracked in inventory.", passCriteria: "Device inventory complete. Baseline profiles applied to all CUI devices. No unauthorized deviations." },
    ],
    closeoutChecklist: ["Hardware inventory maintained in Intune", "Baseline configuration profiles created and assigned", "Software inventory documented", "Baseline deviation process established", "Evidence uploaded", "SSP narrative updated"],
  },

  {
    controlId: "CM.L2-3.4.2",
    implementationApproach: `Establish and enforce security configuration settings for information technology products employed in organizational systems. Security configuration settings (hardening standards) must be defined and enforced — systems must be configured according to industry standards like CIS Benchmarks or DISA STIGs.\n\nFor Microsoft 365: Use Intune Security Baselines to apply Microsoft-recommended security settings. Apply Windows Security Baseline, Microsoft Edge Baseline, and Defender for Endpoint baseline.`,
    systemsUsed: ["Microsoft Intune Admin Center", "Microsoft Defender Portal"],
    steps: [
      { stepNumber: 1, title: "Apply Intune Windows Security Baseline", instruction: "Deploy the Microsoft Windows Security Baseline from Intune to all CUI-scoped Windows devices. This baseline includes 100+ pre-configured security settings aligned with Microsoft recommendations.", systemPortal: "Microsoft Intune Admin Center", navigationPath: "Endpoint security > Security baselines > Windows Security Baseline", recommendedSetting: "Use the latest available baseline version. Review and approve each setting.", evidenceHint: "Screenshot of Windows Security Baseline deployment and compliance status." },
      { stepNumber: 2, title: "Apply Microsoft Defender for Endpoint Baseline", instruction: "Deploy the Defender for Endpoint security baseline to all CUI devices. This configures Defender with Microsoft's recommended security settings for endpoint protection.", systemPortal: "Microsoft Intune Admin Center", navigationPath: "Endpoint security > Security baselines > Microsoft Defender for Endpoint baseline", evidenceHint: "Screenshot of Defender for Endpoint baseline compliance status." },
      { stepNumber: 3, title: "Review Baseline Compliance Report", instruction: "Review the security baseline compliance report to identify devices not meeting the baseline. Investigate and remediate deviations. Document approved exceptions.", systemPortal: "Microsoft Intune Admin Center", navigationPath: "Endpoint security > Security baselines > select baseline > Device status", expectedResult: "95%+ of CUI devices are compliant with the security baseline.", evidenceHint: "Screenshot of baseline compliance report showing compliant/non-compliant device counts." },
    ],
    evidenceRequirements: [
      { title: "Security Baseline Deployment", type: "Screenshot", filename: "CM-3.4.2_Security_Baseline_Deploy_YYYY-MM-DD.png", location: "Intune > Security baselines", mustShow: "Baseline name, version, assigned groups, deployment status" },
      { title: "Security Baseline Compliance Report", type: "Screenshot", filename: "CM-3.4.2_Baseline_Compliance_YYYY-MM-DD.png", location: "Intune > Security baselines > Device status", mustShow: "Compliant vs non-compliant device count, per-device status" },
    ],
    testProcedures: [
      { name: "Security Configuration Hardening Check", steps: "1. Review baseline compliance report and confirm 95%+ compliance.\n2. Select a non-compliant device and document the deviation and remediation plan.\n3. Verify the baseline version is current (updated in the last 12 months).", expectedResult: "Security baselines are applied and enforced across CUI devices.", passCriteria: "Security baselines deployed. 95%+ compliance rate. Non-compliant devices have remediation plans." },
    ],
    closeoutChecklist: ["Windows Security Baseline applied via Intune", "Defender for Endpoint baseline applied", "Baseline compliance report reviewed", "Non-compliant devices remediated or documented", "Evidence uploaded", "SSP narrative updated"],
  },

  {
    controlId: "CM.L2-3.4.3",
    implementationApproach: `Track, review, approve/disapprove, and log changes to organizational systems. All changes to CUI-scoped systems must go through a change management process: request, review, approval, implementation, and post-change verification. Unauthorized changes must be detected and addressed.\n\nFor Microsoft 365: Implement a change management procedure and ticketing system. All admin changes (policy changes, user provisioning, configuration changes) require documented approval before implementation. The audit log captures all changes.`,
    systemsUsed: ["Ticketing / Change Management System", "Microsoft Purview Portal", "Microsoft Entra Admin Center"],
    steps: [
      { stepNumber: 1, title: "Document the Change Management Procedure", instruction: "Create or update the Change Management Procedure defining: how changes are requested, reviewed, approved, implemented, and reviewed post-implementation. Define change types: standard, normal, emergency.", systemPortal: "Organization documentation", evidenceHint: "Change management procedure document." },
      { stepNumber: 2, title: "Implement Change Tickets for All System Changes", instruction: "Require all changes to CUI systems to have a corresponding change ticket in the ticketing system. Change tickets must include: description, requestor, approver, implementation date, and post-change verification.", systemPortal: "Ticketing / Change Management System", evidenceHint: "Sample change tickets showing required fields and approval." },
      { stepNumber: 3, title: "Review Audit Log for Unauthorized Changes", instruction: "Regularly review the Microsoft 365 audit log for admin changes that do not have corresponding approved change tickets. This helps detect unauthorized changes.", systemPortal: "Microsoft Purview Portal", navigationPath: "Audit > Search > Activities: Admin activities", evidenceHint: "Screenshot of change audit log review with comparison to approved changes." },
    ],
    evidenceRequirements: [
      { title: "Change Management Procedure", type: "Document", filename: "CM-3.4.3_Change_Management_Procedure_YYYY-MM-DD.docx", location: "Organization-maintained", mustShow: "Change request process, approval requirements, implementation steps, post-change verification" },
      { title: "Sample Approved Change Tickets", type: "Screenshot", filename: "CM-3.4.3_Change_Tickets_YYYY-MM-DD.png", location: "Ticketing system", mustShow: "Change description, requestor, approver, implementation date, verification outcome" },
    ],
    testProcedures: [
      { name: "Change Management Process Verification", steps: "1. Select 5 recent system changes from the audit log.\n2. Verify each has a corresponding approved change ticket.\n3. Confirm the change was implemented as approved.\n4. Verify no unauthorized changes appear in the audit log without tickets.", expectedResult: "All system changes are tracked through the change management process.", passCriteria: "All sampled changes have approved change tickets. No unauthorized changes detected." },
    ],
    closeoutChecklist: ["Change management procedure documented", "Change ticketing system in use for all changes", "Audit log review for unauthorized changes established", "Change management training completed", "Evidence uploaded", "SSP narrative updated"],
  },

  {
    controlId: "CM.L2-3.4.4",
    implementationApproach: `Analyze the security impact of changes prior to implementation. Before implementing changes to CUI systems, a security impact analysis must be performed to identify potential security risks introduced by the change. High-risk changes require additional review and approval.\n\nFor Microsoft 365: Include security impact review as a required step in the change management process. High-risk changes (firewall rule changes, new admin accounts, policy changes) require security team sign-off.`,
    systemsUsed: ["Ticketing / Change Management System", "Organization documentation"],
    steps: [
      { stepNumber: 1, title: "Add Security Impact Analysis to Change Process", instruction: "Update the change management procedure to require a security impact analysis for all changes to CUI systems. Define what questions must be answered: Does this change affect authentication? Does it open new network paths? Does it affect audit logging?", systemPortal: "Organization documentation", evidenceHint: "Change management procedure showing security impact analysis requirement." },
      { stepNumber: 2, title: "Create Security Impact Analysis Template", instruction: "Create a standardized security impact analysis template that change requestors must complete for high-risk changes. Include: risk identification, compensating controls, approver sign-off.", systemPortal: "Organization documentation / Ticketing system", evidenceHint: "Security impact analysis template and completed example." },
      { stepNumber: 3, title: "Review Recent Changes for Security Impact Documentation", instruction: "Audit recent high-risk changes to verify security impact analysis was completed before implementation. Identify any gaps.", systemPortal: "Ticketing / Change Management System", evidenceHint: "Completed security impact analysis forms from recent changes." },
    ],
    evidenceRequirements: [
      { title: "Security Impact Analysis Template", type: "Document", filename: "CM-3.4.4_Security_Impact_Analysis_Template_YYYY-MM-DD.docx", location: "Organization-maintained", mustShow: "Risk questions, compensating controls field, approver signature block" },
      { title: "Completed Security Impact Analyses", type: "Document", filename: "CM-3.4.4_Completed_Security_Impact_YYYY-MM-DD.docx", location: "Ticketing system or shared drive", mustShow: "Change description, risk assessment, approval signatures, implementation outcome" },
    ],
    testProcedures: [
      { name: "Security Impact Analysis Completeness Check", steps: "1. Sample 5 recent high-risk changes.\n2. Confirm each has a completed security impact analysis.\n3. Verify the analysis was completed before the change was implemented.\n4. Confirm a security approver signed off on each.", expectedResult: "All high-risk changes have pre-implementation security impact analysis.", passCriteria: "Security impact analysis completed for all sampled high-risk changes. Security approver documented." },
    ],
    closeoutChecklist: ["Security impact analysis added to change process", "Analysis template created", "Security team sign-off required for high-risk changes", "Recent changes reviewed for compliance", "Evidence uploaded", "SSP narrative updated"],
  },

  {
    controlId: "CM.L2-3.4.5",
    implementationApproach: `Define, document, approve, and enforce physical and logical access restrictions associated with changes to organizational systems. Changes to system configurations must be performed only by authorized personnel. Unauthorized modifications must be prevented through technical access controls and physical security.\n\nFor Microsoft 365: Only users with designated admin roles can make configuration changes. Use PIM to require activation before making changes. Physical access to network infrastructure must be controlled.`,
    systemsUsed: ["Microsoft Entra Admin Center", "Microsoft Intune Admin Center", "Physical Access Control System"],
    steps: [
      { stepNumber: 1, title: "Document Who is Authorized to Make Configuration Changes", instruction: "Create and maintain a list of personnel authorized to make changes to each system component. This should align with admin role assignments in Entra ID.", systemPortal: "Organization documentation", evidenceHint: "Authorized change personnel list by system/component." },
      { stepNumber: 2, title: "Enforce Technical Access Controls for Changes", instruction: "Verify that only authorized admin accounts have the technical ability to make configuration changes. Standard users should not be able to modify system settings, install software, or change policies.", systemPortal: "Microsoft Entra Admin Center", navigationPath: "Identity > Roles & admins", evidenceHint: "Screenshot showing admin role assignments aligned with authorized change personnel list." },
      { stepNumber: 3, title: "Control Physical Access to Infrastructure", instruction: "Ensure physical access to network devices, servers, and other CUI infrastructure is restricted to authorized personnel through locked server rooms, badge access, or other physical controls.", systemPortal: "Physical Access Control System", evidenceHint: "Physical access log for server room or infrastructure area." },
    ],
    evidenceRequirements: [
      { title: "Authorized Change Personnel List", type: "Document", filename: "CM-3.4.5_Authorized_Change_Personnel_YYYY-MM-DD.xlsx", location: "Organization-maintained", mustShow: "System/component, authorized personnel, role, authorization date" },
    ],
    testProcedures: [
      { name: "Change Authorization Verification", steps: "1. Attempt to make a configuration change as an unauthorized user — verify it is blocked.\n2. Confirm the authorized change personnel list is current and matches admin role assignments.\n3. Verify physical access to infrastructure is controlled.", expectedResult: "Only authorized personnel can make configuration changes.", passCriteria: "Unauthorized users cannot make changes. Authorized list matches technical access controls." },
    ],
    closeoutChecklist: ["Authorized change personnel documented", "Technical access controls enforce change authorization", "Physical access to infrastructure controlled", "Evidence uploaded", "SSP narrative updated"],
  },

  {
    controlId: "CM.L2-3.4.6",
    implementationApproach: `Employ the principle of least functionality by configuring organizational systems to provide only essential capabilities. Systems should be configured to disable or restrict functions not needed for their purpose. This reduces the attack surface by removing unnecessary ports, services, protocols, and features.\n\nFor Microsoft 365: Disable Microsoft 365 features not being used. Configure Windows devices to disable unnecessary services and features. Use Intune to restrict unnecessary apps and features.`,
    systemsUsed: ["Microsoft Intune Admin Center", "Microsoft 365 Admin Center", "Firewall / Network Console"],
    steps: [
      { stepNumber: 1, title: "Disable Unnecessary Microsoft 365 Features", instruction: "Review Microsoft 365 tenant settings and disable services not being used: Sway, Forms, Stream, Power Automate (if not needed), third-party app integrations. Disable features that create risk without business value.", systemPortal: "Microsoft 365 Admin Center", navigationPath: "Settings > Org settings > Services", evidenceHint: "Screenshot of M365 services showing unnecessary services disabled." },
      { stepNumber: 2, title: "Remove Unnecessary Windows Features and Roles", instruction: "On Windows Server systems, remove roles and features not required. On Windows workstations, disable unnecessary services (Print Spooler if not needed, Remote Registry, Fax, etc.).", systemPortal: "Microsoft Intune Admin Center", navigationPath: "Devices > Configuration profiles > Settings catalog", evidenceHint: "Intune configuration profile showing unnecessary features disabled, or Windows Server Roles/Features screenshot." },
      { stepNumber: 3, title: "Close Unnecessary Network Ports", instruction: "Review and close all unnecessary open ports on the network firewall and on CUI-scoped devices. Document required open ports with business justification.", systemPortal: "Firewall / Network Console", expectedResult: "Only required ports are open. All unnecessary services are disabled.", evidenceHint: "Firewall rule review showing open ports with justification." },
    ],
    evidenceRequirements: [
      { title: "Unnecessary Services/Features Disabled", type: "Screenshot", filename: "CM-3.4.6_Least_Functionality_Config_YYYY-MM-DD.png", location: "M365 Admin or Intune", mustShow: "Disabled services or features list" },
      { title: "Network Port Justification", type: "Document", filename: "CM-3.4.6_Open_Port_Justification_YYYY-MM-DD.xlsx", location: "Organization-maintained", mustShow: "Port, protocol, service, business justification, authorized by" },
    ],
    testProcedures: [
      { name: "Least Functionality Verification", steps: "1. Port scan CUI systems and compare open ports against documented required ports.\n2. Verify unused M365 services are disabled.\n3. Review Windows services on a CUI device and confirm unnecessary services are disabled.", expectedResult: "CUI systems have only required services and ports enabled.", passCriteria: "No undocumented open ports. Unnecessary services disabled. Open ports have documented justification." },
    ],
    closeoutChecklist: ["Unnecessary M365 features disabled", "Unnecessary Windows services/features disabled", "Open ports reviewed and justified", "Least functionality policy documented", "Evidence uploaded", "SSP narrative updated"],
  },

  {
    controlId: "CM.L2-3.4.7",
    implementationApproach: `Restrict, disable, or prevent the use of nonessential programs, functions, ports, protocols, and services. Beyond just configuring systems for least functionality, this control requires active enforcement — blocking or preventing the use of non-approved programs and functions through technical controls.\n\nFor Microsoft 365: Use Intune to restrict app installation, Microsoft Defender Application Control (WDAC) or AppLocker to block unapproved programs, and firewall rules to block unnecessary protocols.`,
    systemsUsed: ["Microsoft Intune Admin Center", "Microsoft Defender Portal"],
    steps: [
      { stepNumber: 1, title: "Create an Approved Application List", instruction: "Document all approved applications that may be installed on CUI devices. All other applications should be blocked or require approval before installation.", systemPortal: "Organization documentation", evidenceHint: "Approved application list document." },
      { stepNumber: 2, title: "Restrict Unauthorized App Installation via Intune", instruction: "Configure Intune to prevent users from installing unapproved applications. Use managed apps deployment and block sideloading of unsigned or unapproved applications.", systemPortal: "Microsoft Intune Admin Center", navigationPath: "Devices > Configuration profiles > Settings catalog > App management", evidenceHint: "Screenshot of Intune app restriction policy." },
      { stepNumber: 3, title: "Deploy Defender Application Control or AppLocker", instruction: "For high-security environments, deploy Windows Defender Application Control (WDAC) or AppLocker to whitelist approved applications and block everything else from executing.", systemPortal: "Microsoft Intune Admin Center or Group Policy", recommendedSetting: "WDAC in enforcement mode with approved application list.", evidenceHint: "Screenshot of WDAC or AppLocker policy configuration." },
    ],
    evidenceRequirements: [
      { title: "Approved Application List", type: "Document", filename: "CM-3.4.7_Approved_App_List_YYYY-MM-DD.xlsx", location: "Organization-maintained", mustShow: "Application name, version, business purpose, approval date, authorized by" },
      { title: "Application Restriction Policy", type: "Screenshot", filename: "CM-3.4.7_App_Restriction_Policy_YYYY-MM-DD.png", location: "Intune or WDAC", mustShow: "Policy name, restricted app categories or WDAC enforcement mode, assigned groups" },
    ],
    testProcedures: [
      { name: "Unauthorized Application Block Test", steps: "1. Attempt to install an unapproved application on a CUI device.\n2. Verify the installation is blocked by Intune or WDAC.\n3. Confirm an approved application installs successfully.", expectedResult: "Unapproved applications cannot be installed on CUI devices.", passCriteria: "Unapproved app installation blocked. Approved apps install correctly. Block event logged." },
    ],
    closeoutChecklist: ["Approved application list documented", "App installation restriction configured in Intune", "WDAC or AppLocker deployed (if applicable)", "Unapproved application exception process documented", "Evidence uploaded", "SSP narrative updated"],
  },

  {
    controlId: "CM.L2-3.4.8",
    implementationApproach: `Apply deny-by-exception (blacklisting) policy to prevent the use of unauthorized software or deny-all, permit-by-exception (whitelisting) policy to allow the execution of authorized software. This control specifically addresses software execution policy — either block known-bad software (blacklisting) or only allow approved software (whitelisting).\n\nFor Microsoft 365: Microsoft Defender Antivirus provides blacklisting. WDAC/AppLocker provides whitelisting. For CUI environments, whitelisting (deny-all, permit-by-exception) is the preferred approach.`,
    systemsUsed: ["Microsoft Defender Portal", "Microsoft Intune Admin Center"],
    steps: [
      { stepNumber: 1, title: "Determine and Document the Software Execution Policy Approach", instruction: "Document whether you will use blacklisting (block known-bad) or whitelisting (allow only approved). For high-security CUI environments, whitelisting is recommended. For low-risk workstations, blacklisting via Defender is acceptable.", systemPortal: "Organization documentation", evidenceHint: "Software execution policy document stating chosen approach and rationale." },
      { stepNumber: 2, title: "Configure Defender Real-Time Protection (Blacklisting Baseline)", instruction: "Ensure Microsoft Defender Antivirus is configured with real-time protection, cloud-delivered protection, and PUA (potentially unwanted app) blocking enabled. This provides effective blacklisting baseline.", systemPortal: "Microsoft Intune Admin Center", navigationPath: "Endpoint security > Antivirus", evidenceHint: "Screenshot of Defender antivirus policy with PUA protection enabled." },
      { stepNumber: 3, title: "Implement Application Whitelisting (WDAC) for High-Risk Devices", instruction: "For devices with access to the most sensitive CUI, deploy WDAC in enforcement mode to only allow approved, signed applications to execute. Deploy in audit mode first to identify unauthorized software.", systemPortal: "Microsoft Intune Admin Center", navigationPath: "Endpoint security > Attack surface reduction > App control for Business", evidenceHint: "Screenshot of WDAC audit or enforcement mode policy." },
    ],
    evidenceRequirements: [
      { title: "Software Execution Policy Document", type: "Document", filename: "CM-3.4.8_Software_Execution_Policy_YYYY-MM-DD.docx", location: "Organization-maintained", mustShow: "Policy approach (blacklist/whitelist), approved software definition, enforcement method" },
      { title: "Application Control Configuration", type: "Screenshot", filename: "CM-3.4.8_App_Control_Config_YYYY-MM-DD.png", location: "Intune or Defender portal", mustShow: "Blacklist or whitelist policy configuration and assignment" },
    ],
    testProcedures: [
      { name: "Software Execution Policy Enforcement Test", steps: "1. Attempt to execute a known-bad or unapproved application on a CUI device.\n2. Verify Defender blocks or WDAC prevents execution.\n3. Execute an approved application and verify it runs correctly.", expectedResult: "Unauthorized software is blocked from executing on CUI devices.", passCriteria: "Unauthorized software execution blocked. Approved software executes normally. Block event logged." },
    ],
    closeoutChecklist: ["Software execution policy documented (blacklist or whitelist)", "Defender real-time protection enabled with PUA blocking", "WDAC configured for high-risk devices", "Approved application baseline documented", "Evidence uploaded", "SSP narrative updated"],
  },

  {
    controlId: "CM.L2-3.4.9",
    implementationApproach: `Control and monitor user-installed software. Users should not be able to install unauthorized software on CUI-scoped systems without IT approval. Monitor installed software inventories to detect unauthorized installations and remove them promptly.\n\nFor Microsoft 365 / Intune: Remove local admin rights to prevent software installation. Monitor the Intune Discovered Apps report to detect unauthorized software. Set up alerts for new software installations.`,
    systemsUsed: ["Microsoft Intune Admin Center", "Microsoft Defender Portal"],
    steps: [
      { stepNumber: 1, title: "Remove Local Admin Rights to Prevent Unauthorized Installation", instruction: "Ensure standard users do not have local administrator rights on CUI devices, which prevents unauthorized software installation. Configure via Intune policy.", systemPortal: "Microsoft Intune Admin Center", navigationPath: "Endpoint security > Account protection", evidenceHint: "Screenshot of Intune local admin restriction policy." },
      { stepNumber: 2, title: "Monitor Installed Software via Intune Discovered Apps", instruction: "Review the Intune Discovered Apps report regularly to identify any software that has been installed that is not on the approved list. Remediate by uninstalling unauthorized software.", systemPortal: "Microsoft Intune Admin Center", navigationPath: "Apps > Monitor > Discovered apps", expectedResult: "Only approved applications appear in the discovered apps list.", evidenceHint: "Screenshot of discovered apps report and comparison against approved list." },
      { stepNumber: 3, title: "Configure Alerts for New Software Installations", instruction: "Set up Defender for Endpoint alerts for new software installations on CUI devices. Alert the security team when software is installed outside of approved change windows.", systemPortal: "Microsoft Defender Portal", evidenceHint: "Screenshot of Defender alert rule for software installation events." },
    ],
    evidenceRequirements: [
      { title: "Discovered Apps Report Review", type: "Screenshot", filename: "CM-3.4.9_Discovered_Apps_Review_YYYY-MM-DD.png", location: "Intune > Apps > Monitor > Discovered apps", mustShow: "App names, install count, version — compared against approved list" },
      { title: "Unauthorized Software Remediation", type: "Screenshot/Ticket", filename: "CM-3.4.9_Unauthorized_Software_Remediation_YYYY-MM-DD.png", location: "Intune or ticketing system", mustShow: "Unauthorized software identified, remediation action taken, date removed" },
    ],
    testProcedures: [
      { name: "Unauthorized Software Detection Test", steps: "1. Review the discovered apps report against the approved application list.\n2. Identify any unauthorized software and confirm a remediation ticket exists.\n3. Attempt to install unauthorized software as a standard user — verify it is blocked.", expectedResult: "Unauthorized software is detected and remediated. Standard users cannot install software.", passCriteria: "No unauthorized software in production. Standard users blocked from installing software. Discovery monitoring active." },
    ],
    closeoutChecklist: ["Local admin rights removed from standard users", "Discovered apps monitored regularly", "Unauthorized software remediated", "Alert for new installations configured", "Evidence uploaded", "SSP narrative updated"],
  },

  // ── IDENTIFICATION & AUTHENTICATION (remaining) ─────────────────────────

  {
    controlId: "IA.L2-3.5.3",
    implementationApproach: `Use multifactor authentication for local and network access to privileged accounts and for network access to non-privileged accounts. MFA must be enforced for all account types accessing CUI systems — not just administrators. This is one of the most impactful security controls.\n\nFor Microsoft 365: Use Entra ID Conditional Access to require MFA for all users. Microsoft Authenticator is the recommended MFA method. Hardware FIDO2 keys for privileged accounts.`,
    systemsUsed: ["Microsoft Entra Admin Center"],
    steps: [
      { stepNumber: 1, title: "Enforce MFA for All Users via Conditional Access", instruction: "Create a Conditional Access policy that requires MFA for all users on all apps. Use a phased approach if necessary — start with admins and CUI-access users, then expand to all users.", systemPortal: "Microsoft Entra Admin Center", navigationPath: "Protection > Conditional Access > Policies", recommendedSetting: "Require MFA for all users, all applications. No exclusions except break-glass accounts.", evidenceHint: "Screenshot of Conditional Access MFA policy covering all users." },
      { stepNumber: 2, title: "Require Strong MFA Methods for Privileged Accounts", instruction: "For privileged (admin) accounts, require phishing-resistant MFA: FIDO2 hardware keys or Certificate-Based Authentication. Exclude SMS and phone calls as MFA methods for admin accounts.", systemPortal: "Microsoft Entra Admin Center", navigationPath: "Protection > Authentication methods > Policies", recommendedSetting: "Admin accounts: FIDO2 keys or CBA only. Regular users: Microsoft Authenticator app (push notifications or passkey).", evidenceHint: "Screenshot of Authentication Methods policy for admin accounts." },
      { stepNumber: 3, title: "Verify MFA Registration Coverage", instruction: "Review the Authentication Methods activity report to confirm all users have registered an MFA method. Follow up with users who have not registered.", systemPortal: "Microsoft Entra Admin Center", navigationPath: "Protection > Authentication methods > Activity", expectedResult: "100% of users have registered an MFA method.", evidenceHint: "Screenshot of MFA registration coverage report." },
    ],
    evidenceRequirements: [
      { title: "MFA Conditional Access Policy", type: "Screenshot", filename: "IA-3.5.3_MFA_CA_Policy_YYYY-MM-DD.png", location: "Entra > Conditional Access", mustShow: "Policy covers all users and apps, require MFA grant control, enabled status" },
      { title: "MFA Registration Coverage", type: "Screenshot", filename: "IA-3.5.3_MFA_Registration_YYYY-MM-DD.png", location: "Entra > Authentication methods > Activity", mustShow: "Percentage of users registered for MFA, method breakdown" },
    ],
    testProcedures: [
      { name: "MFA Enforcement Verification", steps: "1. Sign in as a standard user without completing MFA — verify access is denied.\n2. Sign in as a standard user and complete MFA — verify access is granted.\n3. Confirm 100% of users have MFA methods registered.", expectedResult: "MFA enforced for all users on all apps. All users have MFA methods registered.", passCriteria: "No access possible without MFA. 100% MFA registration. Admin accounts use phishing-resistant MFA." },
    ],
    closeoutChecklist: ["MFA Conditional Access policy covers all users and apps", "Phishing-resistant MFA for admin accounts", "MFA registration at 100%", "MFA policy documented", "Evidence uploaded", "SSP narrative updated"],
  },

  {
    controlId: "IA.L2-3.5.4",
    implementationApproach: `Employ replay-resistant authentication mechanisms for network access to privileged accounts and non-privileged accounts. Replay-resistant authentication prevents attackers from capturing and reusing authentication tokens. Modern authentication protocols (OAuth 2.0, SAML, FIDO2) provide replay resistance. Legacy protocols (NTLM, basic auth) do not.\n\nFor Microsoft 365: Disable legacy authentication protocols. Use modern authentication (OAuth 2.0) for all applications. FIDO2 keys and certificate-based authentication provide the strongest replay resistance.`,
    systemsUsed: ["Microsoft Entra Admin Center", "Microsoft 365 Admin Center"],
    steps: [
      { stepNumber: 1, title: "Block Legacy Authentication Protocols", instruction: "Create a Conditional Access policy to block all authentication attempts using legacy protocols (basic auth, NTLM over the network). Legacy protocols do not support MFA and are vulnerable to replay attacks.", systemPortal: "Microsoft Entra Admin Center", navigationPath: "Protection > Conditional Access > Policies", recommendedSetting: "Block access when client apps condition includes 'Exchange ActiveSync clients' and 'Other clients' (legacy auth).", evidenceHint: "Screenshot of Conditional Access policy blocking legacy authentication." },
      { stepNumber: 2, title: "Enable Modern Authentication", instruction: "Confirm modern authentication is enabled for all Microsoft 365 workloads. Modern auth uses OAuth 2.0 with short-lived tokens that are replay-resistant.", systemPortal: "Microsoft 365 Admin Center", navigationPath: "Settings > Org settings > Modern authentication", recommendedSetting: "Modern authentication: Enabled for all services.", evidenceHint: "Screenshot of modern authentication enabled settings." },
      { stepNumber: 3, title: "Verify Legacy Auth Is Blocked via Sign-In Logs", instruction: "Review the Entra sign-in logs and filter for 'Other clients' or 'Exchange ActiveSync' client apps. Confirm all such attempts are blocked.", systemPortal: "Microsoft Entra Admin Center", navigationPath: "Monitoring & health > Sign-in logs > filter Client app = Other clients", expectedResult: "All legacy authentication attempts are blocked.", evidenceHint: "Screenshot of sign-in log showing legacy auth attempts are blocked." },
    ],
    evidenceRequirements: [
      { title: "Legacy Authentication Block Policy", type: "Screenshot", filename: "IA-3.5.4_Legacy_Auth_Block_Policy_YYYY-MM-DD.png", location: "Entra > Conditional Access", mustShow: "Policy conditions (legacy client apps), grant control (Block access), enabled status" },
      { title: "Modern Authentication Enabled", type: "Screenshot", filename: "IA-3.5.4_Modern_Auth_Enabled_YYYY-MM-DD.png", location: "M365 Admin > Org settings > Modern authentication", mustShow: "Modern authentication enabled for all supported services" },
    ],
    testProcedures: [
      { name: "Legacy Authentication Block Verification", steps: "1. Attempt to authenticate using a legacy mail client with basic auth.\n2. Verify the authentication is blocked by Conditional Access.\n3. Review sign-in logs to confirm block action is recorded.", expectedResult: "Legacy authentication is blocked. Only modern auth (OAuth 2.0) is accepted.", passCriteria: "Legacy auth block policy active. Test legacy auth attempt blocked and logged." },
    ],
    closeoutChecklist: ["Legacy authentication blocked via Conditional Access", "Modern authentication enabled", "Sign-in logs verified — legacy auth attempts blocked", "Evidence uploaded", "SSP narrative updated"],
  },

  {
    controlId: "IA.L2-3.5.5",
    implementationApproach: `Identify and authenticate organizational users, organizational processes acting on behalf of organizational users, and devices. This extends the basic identification requirements to include processes and devices — not just human users. Managed identities, service principals, and device certificates must be used for non-human authentication.\n\nFor Microsoft 365: Use managed identities for Azure resources. Use device compliance and certificates for device authentication. Document all service accounts and their authentication methods.`,
    systemsUsed: ["Microsoft Entra Admin Center", "Microsoft Intune Admin Center"],
    steps: [
      { stepNumber: 1, title: "Inventory All Non-Human Identities", instruction: "Create an inventory of all service accounts, managed identities, service principals, and device accounts. Document each with: name, purpose, owner, authentication method, and last review date.", systemPortal: "Microsoft Entra Admin Center", navigationPath: "Applications > App registrations + Identity > Service principals", evidenceHint: "Non-human identity inventory document." },
      { stepNumber: 2, title: "Use Managed Identities Instead of Service Account Passwords", instruction: "Where possible, replace service account password-based authentication with Azure Managed Identities. Managed identities eliminate the need for credentials and provide automatic certificate rotation.", systemPortal: "Microsoft Entra Admin Center", navigationPath: "Identity > Managed identities", evidenceHint: "Screenshot of managed identities configured for Azure resources." },
      { stepNumber: 3, title: "Configure Device Certificate Authentication", instruction: "For device authentication, configure Entra ID device registration and Intune compliance to use device certificates for authentication rather than simple device IDs.", systemPortal: "Microsoft Intune Admin Center", navigationPath: "Devices > Configuration profiles > SCEP or PKCS certificate", evidenceHint: "Screenshot of device certificate configuration." },
    ],
    evidenceRequirements: [
      { title: "Non-Human Identity Inventory", type: "Document/Spreadsheet", filename: "IA-3.5.5_Non_Human_Identity_Inventory_YYYY-MM-DD.xlsx", location: "Organization-maintained", mustShow: "Identity name, type, purpose, owner, authentication method, last reviewed" },
    ],
    testProcedures: [
      { name: "Non-Human Identity Authentication Verification", steps: "1. Review non-human identity inventory for completeness.\n2. Confirm each service account or managed identity has a documented owner.\n3. Verify managed identities are used instead of password-based service accounts where possible.", expectedResult: "All non-human identities are inventoried and authenticated using appropriate methods.", passCriteria: "Non-human identity inventory complete. Managed identities used where possible. All identities have owners." },
    ],
    closeoutChecklist: ["Non-human identity inventory created", "Managed identities used for Azure resources", "Device certificate authentication configured", "Service account owners documented", "Evidence uploaded", "SSP narrative updated"],
  },

  {
    controlId: "IA.L2-3.5.6",
    implementationApproach: `Authenticate (or verify) the identities of those users, processes, or devices, as a prerequisite to allowing access to organizational information systems. Authentication must occur before any CUI access is granted — for users, for automated processes, and for devices. No anonymous or unauthenticated access to CUI systems is permitted.\n\nFor Microsoft 365: All Microsoft 365 services require authentication before access. Entra ID is the identity provider. Conditional Access ensures authentication requirements are met before access is granted.`,
    systemsUsed: ["Microsoft Entra Admin Center"],
    steps: [
      { stepNumber: 1, title: "Verify No Anonymous Access to CUI Systems", instruction: "Confirm that no CUI-related systems or data are accessible without authentication. Check SharePoint sharing settings, public Teams, and any web-accessible resources.", systemPortal: "SharePoint Admin Center / Microsoft Entra Admin Center", navigationPath: "SharePoint > Policies > Sharing", recommendedSetting: "No anonymous sharing of CUI content. All access requires Entra ID authentication.", evidenceHint: "Screenshot confirming anonymous access is disabled for CUI systems." },
      { stepNumber: 2, title: "Verify Authentication Required Before All CUI Access", instruction: "Review Conditional Access policies to confirm that authentication is required as a prerequisite for all access to CUI applications and data stores.", systemPortal: "Microsoft Entra Admin Center", navigationPath: "Protection > Conditional Access > Policies", expectedResult: "All CUI app access requires successful Entra ID authentication.", evidenceHint: "Screenshot of Conditional Access policies covering all CUI applications." },
    ],
    evidenceRequirements: [
      { title: "Authentication Prerequisite Verification", type: "Screenshot", filename: "IA-3.5.6_Auth_Prerequisite_YYYY-MM-DD.png", location: "Entra > Conditional Access + SharePoint sharing settings", mustShow: "All CUI apps require authentication. No anonymous access enabled." },
    ],
    testProcedures: [
      { name: "Anonymous Access Verification", steps: "1. Attempt to access a CUI SharePoint site without signing in.\n2. Verify you are redirected to the sign-in page.\n3. Confirm no CUI data is publicly accessible without authentication.", expectedResult: "No CUI system or data is accessible without authentication.", passCriteria: "All CUI systems require authentication. No anonymous access paths exist." },
    ],
    closeoutChecklist: ["Anonymous access disabled for all CUI systems", "Conditional Access ensures authentication for all CUI apps", "Authentication-first policy documented", "Evidence uploaded", "SSP narrative updated"],
  },

  {
    controlId: "IA.L2-3.5.7",
    implementationApproach: `Enforce a minimum password complexity and change requirements. Passwords must meet minimum length and complexity requirements to resist brute-force attacks. NIST SP 800-63B recommends focusing on length (minimum 8 characters) over complexity (special characters, uppercase/lowercase) — but prohibiting known-bad passwords.\n\nFor Microsoft 365: Use Entra ID Password Protection to enforce length and complexity. Enable the global and custom banned password lists. Consider implementing passkeys (FIDO2) to eliminate passwords entirely for CUI access.`,
    systemsUsed: ["Microsoft Entra Admin Center"],
    steps: [
      { stepNumber: 1, title: "Configure Entra ID Password Protection", instruction: "Enable Entra ID Password Protection to enforce minimum password requirements and block commonly compromised passwords.", systemPortal: "Microsoft Entra Admin Center", navigationPath: "Protection > Authentication methods > Password protection", recommendedSetting: "Enable custom banned password list. Lockout threshold: 10 attempts. Mode: Enforced.", evidenceHint: "Screenshot of password protection settings." },
      { stepNumber: 2, title: "Set Password Policy in Microsoft 365", instruction: "Review the Microsoft 365 password policy settings. Set minimum password length and configure password expiration (or consider no-expiry with MFA per NIST 800-63B guidance).", systemPortal: "Microsoft 365 Admin Center", navigationPath: "Settings > Org settings > Security & privacy > Password expiration policy", recommendedSetting: "Minimum 8 characters. No expiration if MFA is enforced (NIST guidance). Or 90-day expiry if MFA not universal.", evidenceHint: "Screenshot of M365 password policy settings." },
      { stepNumber: 3, title: "Add Organization-Specific Terms to Banned Password List", instruction: "Add organization-specific terms to the Entra ID custom banned password list: company name, product names, office locations, common variations.", systemPortal: "Microsoft Entra Admin Center", navigationPath: "Protection > Authentication methods > Password protection > Custom banned passwords", evidenceHint: "Screenshot showing custom banned password list terms added." },
    ],
    evidenceRequirements: [
      { title: "Password Policy Configuration", type: "Screenshot", filename: "IA-3.5.7_Password_Policy_YYYY-MM-DD.png", location: "M365 Admin and Entra > Password protection", mustShow: "Minimum length, complexity requirements, banned password list enabled" },
    ],
    testProcedures: [
      { name: "Password Policy Enforcement Test", steps: "1. Attempt to set a password that is shorter than 8 characters — verify it is rejected.\n2. Attempt to set a common password (e.g., 'Password1') — verify it is rejected.\n3. Attempt to set a password containing the company name — verify it is rejected.", expectedResult: "Password policy enforces minimum length and blocks common/bad passwords.", passCriteria: "Short passwords rejected. Common passwords rejected. Company-specific terms rejected." },
    ],
    closeoutChecklist: ["Entra ID Password Protection enabled", "Custom banned password list populated", "Password policy configured and documented", "Evidence uploaded", "SSP narrative updated"],
  },

  {
    controlId: "IA.L2-3.5.8",
    implementationApproach: `Prohibit password reuse for a specified number of generations. Users should not be able to immediately reuse the same password when required to change it. This prevents users from cycling through passwords to get back to a preferred one that may have been compromised.\n\nFor Microsoft 365: Entra ID enforces password history — by default, users cannot reuse their last 24 passwords. Verify this is configured and enforced.`,
    systemsUsed: ["Microsoft Entra Admin Center", "Microsoft 365 Admin Center"],
    steps: [
      { stepNumber: 1, title: "Verify Password History Enforcement", instruction: "Confirm Entra ID is configured to prevent password reuse. By default, Microsoft 365 maintains the last 24 passwords in history and prevents reuse.", systemPortal: "Microsoft 365 Admin Center", navigationPath: "Settings > Org settings > Security & privacy > Password expiration policy", expectedResult: "Password history is enforced — users cannot reuse recent passwords.", evidenceHint: "Screenshot of password policy settings confirming history enforcement." },
      { stepNumber: 2, title: "Document Password Reuse Policy", instruction: "Document the organization's password reuse restriction in the Password Policy or Account Security Policy. Specify the minimum number of unique passwords required before reuse is permitted (minimum 5, preferably 24).", systemPortal: "Organization documentation", evidenceHint: "Password policy document including reuse restrictions." },
    ],
    evidenceRequirements: [
      { title: "Password Policy Document", type: "Document", filename: "IA-3.5.8_Password_Reuse_Policy_YYYY-MM-DD.docx", location: "Organization-maintained", mustShow: "Password history/reuse restriction requirement (minimum generations)" },
    ],
    testProcedures: [
      { name: "Password Reuse Prevention Test", steps: "1. Change a test account's password.\n2. Immediately attempt to change it back to the original password.\n3. Verify the system prevents reuse of the recent password.", expectedResult: "System prevents reuse of recently used passwords.", passCriteria: "Password reuse blocked for at least 5 (preferably 24) previous passwords." },
    ],
    closeoutChecklist: ["Password history enforcement verified in Entra ID", "Password reuse policy documented", "Evidence uploaded", "SSP narrative updated"],
  },

  {
    controlId: "IA.L2-3.5.9",
    implementationApproach: `Allow temporary password use for system logons with an immediate change to a permanent password. When a temporary password is issued (e.g., for new users, password resets), the system must require the user to change it at first logon. Temporary passwords must not be reusable after first use.\n\nFor Microsoft 365: Configure Entra ID to require password change at next logon for temporary passwords. SSPR and admin password reset should enforce immediate change.`,
    systemsUsed: ["Microsoft Entra Admin Center"],
    steps: [
      { stepNumber: 1, title: "Configure Force Password Change at Next Logon", instruction: "When resetting a user's password, configure the 'Force change password at next logon' option. This ensures the temporary password is immediately replaced.", systemPortal: "Microsoft Entra Admin Center", navigationPath: "Identity > Users > select user > Password > Reset password > check 'Make this user change their password when they first sign in'", recommendedSetting: "Always check 'Make user change password at next sign in' when resetting passwords.", evidenceHint: "Screenshot of password reset dialog showing 'change at next logon' option checked." },
      { stepNumber: 2, title: "Document the Temporary Password Procedure", instruction: "Document the procedure for issuing and managing temporary passwords: how they are communicated, the required change at first logon, and how temporary passwords are invalidated if not used.", systemPortal: "Organization documentation", evidenceHint: "Temporary password procedure document." },
    ],
    evidenceRequirements: [
      { title: "Temporary Password Procedure", type: "Document", filename: "IA-3.5.9_Temp_Password_Procedure_YYYY-MM-DD.docx", location: "Organization-maintained", mustShow: "How temp passwords are issued, change-at-first-logon enforcement, invalidation process" },
    ],
    testProcedures: [
      { name: "Temporary Password Change Enforcement Test", steps: "1. Reset a test account's password without checking 'change at next logon'.\n2. Verify the system enforces the change-at-logon requirement.\n3. Confirm the temporary password cannot be reused after it is changed.", expectedResult: "Temporary passwords require immediate change at first logon.", passCriteria: "Change-at-logon is enforced. Temporary password cannot be reused." },
    ],
    closeoutChecklist: ["Force password change at next logon configured", "Temporary password procedure documented", "Admins trained on password reset procedure", "Evidence uploaded", "SSP narrative updated"],
  },

  {
    controlId: "IA.L2-3.5.10",
    implementationApproach: `Store and transmit only cryptographically protected passwords. Passwords must never be stored in plaintext. All password storage must use salted cryptographic hashing. All password transmission must occur over encrypted channels (TLS).\n\nFor Microsoft 365: Entra ID stores passwords using industry-standard cryptographic protection. All transmissions use TLS. For on-premises Active Directory, passwords are stored as NTLM hashes (or bcrypt if using LAPS). Verify no custom applications store plaintext passwords.`,
    systemsUsed: ["Microsoft Entra Admin Center", "Microsoft 365 Admin Center"],
    steps: [
      { stepNumber: 1, title: "Verify Microsoft 365 Password Storage Security", instruction: "Microsoft 365 and Entra ID use industry-standard cryptographic protection for stored passwords. Obtain documentation from Microsoft confirming their password protection practices.", systemPortal: "Microsoft documentation", evidenceHint: "Microsoft security documentation or attestation confirming cryptographic password storage." },
      { stepNumber: 2, title: "Audit Custom Applications for Plaintext Password Storage", instruction: "Review any custom applications or databases that handle authentication. Confirm they use cryptographic hashing (bcrypt, Argon2, PBKDF2) for password storage and TLS for transmission.", systemPortal: "Custom applications", evidenceHint: "Application security review or code review confirming cryptographic password handling." },
      { stepNumber: 3, title: "Verify Password Transmission Uses TLS", instruction: "Confirm all password transmissions occur over TLS 1.2+ encrypted connections. No application should transmit passwords over HTTP.", systemPortal: "Web application or network scan", evidenceHint: "TLS configuration verification for all authentication endpoints." },
    ],
    evidenceRequirements: [
      { title: "Microsoft Password Security Attestation", type: "Document/Screenshot", filename: "IA-3.5.10_Password_Storage_Attestation_YYYY-MM-DD.docx", location: "Microsoft docs or security center", mustShow: "Microsoft's password storage cryptographic protection methods" },
      { title: "Custom Application Password Security Review", type: "Document", filename: "IA-3.5.10_App_Password_Security_Review_YYYY-MM-DD.docx", location: "Organization-maintained", mustShow: "Applications reviewed, password storage method, transmission encryption, review date" },
    ],
    testProcedures: [
      { name: "Password Storage and Transmission Security Check", steps: "1. Confirm Microsoft 365 password documentation covers cryptographic protection.\n2. Review any custom app authentication — confirm passwords are hashed (not plaintext).\n3. Scan all authentication endpoints to confirm TLS 1.2+.", expectedResult: "No plaintext passwords stored or transmitted.", passCriteria: "All passwords cryptographically hashed. All authentication uses TLS 1.2+. No plaintext passwords." },
    ],
    closeoutChecklist: ["Microsoft 365 password security confirmed", "Custom applications reviewed for plaintext password risks", "TLS enforced for all authentication", "Evidence uploaded", "SSP narrative updated"],
  },

  {
    controlId: "IA.L2-3.5.11",
    implementationApproach: `Obscure feedback of authentication information during the authentication process. Authentication systems must not reveal password characters as they are typed — the password field must show asterisks or dots, not the actual characters. This prevents shoulder-surfing attacks.\n\nFor Microsoft 365: All Microsoft sign-in pages obscure password input. Verify any custom authentication pages or on-premises portals also obscure password feedback.`,
    systemsUsed: ["Microsoft Entra Admin Center", "Custom Web Applications"],
    steps: [
      { stepNumber: 1, title: "Verify Microsoft 365 Sign-In Page Obscures Passwords", instruction: "Confirm the Entra ID sign-in page obscures the password field with asterisks or dots. This is standard behavior but should be verified if using custom branding or sign-in pages.", systemPortal: "Microsoft Entra Admin Center (sign-in page)", evidenceHint: "Screenshot of the Entra ID sign-in page showing obscured password field." },
      { stepNumber: 2, title: "Review Custom Authentication Pages", instruction: "If the organization has custom web applications or VPN portals with authentication, verify they obscure password input fields. Review the HTML/CSS to confirm type='password' is used on all password fields.", systemPortal: "Custom web applications", evidenceHint: "Screenshot of custom authentication page showing obscured password field." },
      { stepNumber: 3, title: "Document Authentication Page Compliance", instruction: "Document all authentication pages/portals in scope and confirm each obscures password feedback. Include both cloud and on-premises systems.", systemPortal: "Organization documentation", evidenceHint: "Authentication endpoint inventory with password obscuring confirmation." },
    ],
    evidenceRequirements: [
      { title: "Authentication Page Password Obscuring", type: "Screenshot", filename: "IA-3.5.11_Password_Obscuring_YYYY-MM-DD.png", location: "All authentication pages", mustShow: "Password field shows obscured characters (asterisks/dots) not actual password" },
    ],
    testProcedures: [
      { name: "Password Obscuring Verification", steps: "1. Open the Entra ID sign-in page and type a test password.\n2. Verify the password is displayed as asterisks or dots.\n3. Inspect the page source to confirm type='password' on all password fields.", expectedResult: "All authentication pages obscure password input.", passCriteria: "All authentication forms use type='password' or equivalent obscuring." },
    ],
    closeoutChecklist: ["Microsoft 365 sign-in password obscuring verified", "Custom authentication pages reviewed", "All authentication endpoints documented", "Evidence uploaded", "SSP narrative updated"],
  },

  // ── INCIDENT RESPONSE ───────────────────────────────────────────────────

  {
    controlId: "IR.L2-3.6.1",
    implementationApproach: `Establish an operational incident-handling capability for organizational systems that includes preparation, detection, analysis, containment, recovery, and user response activities. The organization must have a formal incident response plan and team capable of detecting, responding to, and recovering from cybersecurity incidents.\n\nFor Microsoft 365: Leverage Microsoft Defender XDR for incident detection. Create a formal Incident Response Plan covering CUI-related incidents. Define your IR team, communication plan, and escalation paths.`,
    systemsUsed: ["Microsoft Defender Portal", "Organization documentation", "Ticketing System"],
    steps: [
      { stepNumber: 1, title: "Develop or Update the Incident Response Plan", instruction: "Create a formal Incident Response Plan covering: roles and responsibilities, incident classification, detection and analysis procedures, containment strategies, evidence handling, recovery steps, and lessons learned process. The plan must address CUI-specific incidents.", systemPortal: "Organization documentation", evidenceHint: "Incident Response Plan document with version number and approval date." },
      { stepNumber: 2, title: "Establish the Incident Response Team", instruction: "Designate an Incident Response Team (IRT) with defined roles: Incident Commander, Security Analyst, IT Lead, Legal/Compliance, and Communications/Management. Document contact information and availability.", systemPortal: "Organization documentation", evidenceHint: "IRT roster with roles, contacts, and escalation chain." },
      { stepNumber: 3, title: "Configure Defender XDR for Incident Management", instruction: "Use Microsoft Defender portal as the primary incident management tool. Configure incident severity levels, automatic assignment, and notification rules.", systemPortal: "Microsoft Defender Portal", navigationPath: "Settings > Microsoft Defender XDR > Notifications", evidenceHint: "Screenshot of Defender incident configuration and notification settings." },
      { stepNumber: 4, title: "Configure CUI Breach Notification Process", instruction: "Document the process for notifying the government awarding agency within 72 hours of discovering a CUI data breach. Identify the specific contact for each DoD/federal contract.", systemPortal: "Organization documentation", evidenceHint: "CUI breach notification procedure with government contacts." },
    ],
    evidenceRequirements: [
      { title: "Incident Response Plan", type: "Document", filename: "IR-3.6.1_Incident_Response_Plan_YYYY-MM-DD.docx", location: "Organization-maintained", mustShow: "Roles, detection process, containment, recovery, CUI breach notification, escalation paths" },
      { title: "Incident Response Team Roster", type: "Document", filename: "IR-3.6.1_IRT_Roster_YYYY-MM-DD.docx", location: "Organization-maintained", mustShow: "Team member names, roles, contact information, alternates" },
    ],
    testProcedures: [
      { name: "IR Plan Completeness and Currency Check", steps: "1. Review the Incident Response Plan and confirm it covers all required phases (preparation, detection, containment, recovery, lessons learned).\n2. Confirm the plan addresses CUI-specific incidents and breach notification.\n3. Verify the plan was reviewed within the last 12 months.\n4. Confirm all IRT members are current and have been notified of their role.", expectedResult: "IR plan is complete, current, and covers CUI-specific requirements.", passCriteria: "IR plan covers all phases. CUI breach notification included. Reviewed within 12 months. IRT current." },
    ],
    closeoutChecklist: ["Incident Response Plan developed", "IRT designated with documented roles", "Defender XDR configured for incident management", "CUI breach notification process documented", "Government contacts identified for breach notification", "Evidence uploaded", "SSP narrative updated"],
  },

  {
    controlId: "IR.L2-3.6.2",
    implementationApproach: `Track, document, and report incidents to designated officials and/or authorities. Every security incident must be documented with a consistent, structured record. Incidents must be reported to appropriate parties: internal management, government contracting officers (for CUI breaches), and law enforcement if required.\n\nFor Microsoft 365: Use Defender XDR to create and track incident records. Supplement with an incident tracking log. Report CUI incidents to the cognizant federal agency within required timeframes.`,
    systemsUsed: ["Microsoft Defender Portal", "Ticketing / Incident Management System"],
    steps: [
      { stepNumber: 1, title: "Implement Incident Tracking and Documentation", instruction: "For every security incident, create a formal incident record containing: discovery date, incident type, affected systems, CUI involved (yes/no), actions taken, timeline, and resolution. Use Defender XDR or a dedicated incident management system.", systemPortal: "Microsoft Defender Portal or Ticketing System", evidenceHint: "Sample incident ticket/record showing all required fields." },
      { stepNumber: 2, title: "Define Incident Reporting Requirements and Timelines", instruction: "Document what incidents must be reported, to whom, and within what timeframe: CUI breaches to DoD within 72 hours, significant incidents to senior management immediately, routine incidents to the security team.", systemPortal: "Organization documentation", evidenceHint: "Incident reporting requirements document with timelines and contacts." },
      { stepNumber: 3, title: "Maintain an Incident Log", instruction: "Maintain a running incident log tracking all incidents: minor, significant, and resolved. This log provides the historical record for trend analysis and assessments.", systemPortal: "Organization documentation / Ticketing system", evidenceHint: "Incident log showing incidents from the past 12 months with status and closure dates." },
    ],
    evidenceRequirements: [
      { title: "Incident Tracking Records", type: "Document/Export", filename: "IR-3.6.2_Incident_Log_YYYY-MM-DD.xlsx", location: "Ticketing system or organization-maintained", mustShow: "Incident date, type, severity, affected systems, CUI involved, actions taken, resolution date" },
      { title: "Incident Reporting Procedure", type: "Document", filename: "IR-3.6.2_Incident_Reporting_Procedure_YYYY-MM-DD.docx", location: "Organization-maintained", mustShow: "Reporting requirements, timelines, internal and external contacts" },
    ],
    testProcedures: [
      { name: "Incident Documentation Completeness", steps: "1. Pull the last 5 incident records.\n2. Verify each contains: discovery date, type, affected systems, CUI involvement, actions taken, resolution.\n3. For any incidents involving CUI, verify reporting occurred within required timelines.", expectedResult: "All incidents are documented and reported per defined requirements.", passCriteria: "All incidents documented with required fields. CUI incidents reported within 72 hours." },
    ],
    closeoutChecklist: ["Incident tracking system implemented", "Incident reporting requirements documented", "Incident log maintained", "CUI breach reporting process established", "Evidence uploaded", "SSP narrative updated"],
  },

  {
    controlId: "IR.L2-3.6.3",
    implementationApproach: `Test the organizational incident response capability. The incident response plan must be regularly tested to verify it works as intended. Testing can include tabletop exercises, simulations, or full functional drills. The goal is to identify gaps before a real incident occurs.\n\nFor Microsoft 365: Use Microsoft Attack Simulator to test phishing response. Conduct annual IR tabletop exercises simulating CUI breach scenarios. Document test results and lessons learned.`,
    systemsUsed: ["Microsoft Defender Portal", "Organization documentation"],
    steps: [
      { stepNumber: 1, title: "Conduct Annual IR Tabletop Exercise", instruction: "Facilitate an annual tabletop exercise simulating a realistic cybersecurity incident: ransomware, data breach, or insider threat. Walk the IRT through detection, analysis, containment, and recovery decisions.", systemPortal: "Organization-led exercise", expectedResult: "IRT demonstrates understanding of roles and procedures during the scenario.", evidenceHint: "Tabletop exercise record including date, participants, scenario, findings, and lessons learned." },
      { stepNumber: 2, title: "Test Incident Detection Capability", instruction: "Test the ability to detect and receive alerts for common incident types: phishing email received and reported, malware detected, unauthorized access attempt. Verify alerts fire and reach the right people.", systemPortal: "Microsoft Defender Portal", evidenceHint: "Test incident detection records showing alert fired and was received by the IRT." },
      { stepNumber: 3, title: "Document Lessons Learned and Update IR Plan", instruction: "After each test or real incident, document lessons learned and update the IR plan accordingly. Track improvements made as a result of testing.", systemPortal: "Organization documentation", evidenceHint: "Lessons learned document and IR plan version history showing post-test updates." },
    ],
    evidenceRequirements: [
      { title: "IR Tabletop Exercise Record", type: "Document", filename: "IR-3.6.3_Tabletop_Exercise_Record_YYYY-MM-DD.docx", location: "Organization-maintained", mustShow: "Exercise date, participants (by role), scenario, findings, lessons learned, action items" },
      { title: "Lessons Learned and IR Plan Updates", type: "Document", filename: "IR-3.6.3_Lessons_Learned_YYYY-MM-DD.docx", location: "Organization-maintained", mustShow: "Findings from test, improvements identified, IR plan update version reflecting changes" },
    ],
    testProcedures: [
      { name: "IR Testing Currency and Quality Check", steps: "1. Confirm an IR test (tabletop or functional) was conducted within the last 12 months.\n2. Verify the test record documents participants, scenario, findings, and lessons learned.\n3. Confirm the IR plan was updated as a result of the test.", expectedResult: "IR capability is tested annually with documented results and plan updates.", passCriteria: "Test conducted within 12 months. Lessons learned documented. IR plan updated." },
    ],
    closeoutChecklist: ["Annual IR tabletop exercise conducted", "Detection capability tested", "Lessons learned documented", "IR plan updated with test findings", "Evidence uploaded", "SSP narrative updated"],
  },

  // ── MAINTENANCE ─────────────────────────────────────────────────────────

  {
    controlId: "MA.L2-3.7.1",
    implementationApproach: `Perform maintenance on organizational systems. All maintenance activities on CUI systems must be performed according to documented procedures. Maintenance must be performed by authorized personnel. Schedule and track maintenance to ensure systems remain operational and secure.\n\nFor Microsoft 365: Maintenance for cloud services is handled by Microsoft. For on-premises systems, document and track all maintenance activities including patching, hardware replacement, and configuration updates.`,
    systemsUsed: ["Microsoft Intune Admin Center", "Ticketing System", "Organization documentation"],
    steps: [
      { stepNumber: 1, title: "Develop a System Maintenance Policy and Schedule", instruction: "Create a maintenance policy defining: maintenance types (preventive, corrective, emergency), required approval, scheduling requirements, and documentation standards. Create a maintenance schedule for all CUI systems.", systemPortal: "Organization documentation", evidenceHint: "System maintenance policy and maintenance schedule document." },
      { stepNumber: 2, title: "Track All Maintenance Activities", instruction: "Document all maintenance activities in a maintenance log or ticketing system: date, system, maintenance type, work performed, technician, and post-maintenance verification result.", systemPortal: "Ticketing System", evidenceHint: "Maintenance log or maintenance tickets from the past 12 months." },
      { stepNumber: 3, title: "Verify Microsoft 365 Maintenance via Service Health", instruction: "Monitor Microsoft 365 service health dashboard to track Microsoft-managed maintenance activities that affect your CUI systems. Subscribe to planned maintenance notifications.", systemPortal: "Microsoft 365 Admin Center", navigationPath: "Health > Service health > Planned maintenance", evidenceHint: "Screenshot of service health showing planned maintenance awareness." },
    ],
    evidenceRequirements: [
      { title: "System Maintenance Log", type: "Document/Spreadsheet", filename: "MA-3.7.1_Maintenance_Log_YYYY-MM-DD.xlsx", location: "Organization-maintained", mustShow: "Date, system, maintenance type, work performed, technician, approval, post-verification" },
    ],
    testProcedures: [
      { name: "Maintenance Documentation Review", steps: "1. Review maintenance log for the past 12 months.\n2. Confirm all maintenance activities are documented with required fields.\n3. Confirm maintenance was performed by authorized personnel.\n4. Verify post-maintenance verification is documented.", expectedResult: "All maintenance activities are documented and authorized.", passCriteria: "Maintenance log complete. All entries have required fields. Authorized personnel performed work." },
    ],
    closeoutChecklist: ["Maintenance policy and schedule documented", "Maintenance log maintained", "Authorized maintenance personnel documented", "Microsoft 365 service health monitoring established", "Evidence uploaded", "SSP narrative updated"],
  },

  {
    controlId: "MA.L2-3.7.2",
    implementationApproach: `Provide controls on the tools, techniques, mechanisms, and personnel used to conduct system maintenance. Maintenance tools must be controlled — only approved tools used by authorized, trained personnel. Remote maintenance must have additional controls. Maintenance sessions must be supervised and logged.\n\nFor Microsoft 365: For on-premises systems, control maintenance tools and ensure they are scanned for malware before use. Remote maintenance sessions must use encrypted connections and must be supervised.`,
    systemsUsed: ["Organization documentation", "Microsoft Intune Admin Center"],
    steps: [
      { stepNumber: 1, title: "Maintain an Approved Maintenance Tool List", instruction: "Create a list of approved maintenance tools and software that may be used on CUI systems. Prohibit the use of unapproved tools. Ensure maintenance tools are scanned for malware before use.", systemPortal: "Organization documentation", evidenceHint: "Approved maintenance tool list document." },
      { stepNumber: 2, title: "Document Authorized Maintenance Personnel", instruction: "Maintain a list of personnel authorized to perform maintenance on CUI systems, including external vendors/contractors. Verify background checks and NDA/access agreements are in place for all maintenance personnel.", systemPortal: "Organization documentation / HR system", evidenceHint: "Authorized maintenance personnel list with background check and agreement confirmation." },
      { stepNumber: 3, title: "Require Supervision for External Maintenance", instruction: "Implement a policy requiring an authorized employee to supervise all external vendor maintenance activities on CUI systems. The supervisor must verify only approved actions are taken.", systemPortal: "Organization documentation", evidenceHint: "Supervision policy and maintenance supervision log for external vendor visits." },
    ],
    evidenceRequirements: [
      { title: "Maintenance Tool and Personnel Controls", type: "Document", filename: "MA-3.7.2_Maintenance_Controls_YYYY-MM-DD.docx", location: "Organization-maintained", mustShow: "Approved tool list, authorized personnel list, supervision requirements, malware check process" },
    ],
    testProcedures: [
      { name: "Maintenance Control Verification", steps: "1. Review maintenance records to confirm only approved tools were used.\n2. Verify all maintenance personnel are on the authorized list with current background checks.\n3. Confirm external vendor maintenance was supervised and documented.", expectedResult: "Maintenance performed by authorized personnel using approved tools with supervision.", passCriteria: "All maintenance by authorized personnel. Approved tools used. External maintenance supervised." },
    ],
    closeoutChecklist: ["Approved maintenance tool list documented", "Authorized maintenance personnel list current", "Supervision policy for external maintenance documented", "Maintenance supervision records maintained", "Evidence uploaded", "SSP narrative updated"],
  },

  {
    controlId: "MA.L2-3.7.3",
    implementationApproach: `Ensure equipment removed for off-site maintenance is sanitized of any CUI. Before sending equipment (laptops, servers, storage devices) off-site for maintenance, all CUI must be removed or the storage media must be removed and secured. This prevents CUI exposure during repair or service.\n\nFor Microsoft 365 / Intune: Use Intune remote wipe to remove data before sending a device off-site. For devices that cannot be wiped, remove and retain the storage media locally.`,
    systemsUsed: ["Microsoft Intune Admin Center", "Organization documentation"],
    steps: [
      { stepNumber: 1, title: "Develop Equipment Sanitization Procedure", instruction: "Create a procedure for sanitizing equipment before off-site maintenance: perform factory reset, use Intune remote wipe, remove hard drives, or use NIST 800-88 data sanitization methods.", systemPortal: "Organization documentation", evidenceHint: "Equipment sanitization procedure document." },
      { stepNumber: 2, title: "Execute and Document Sanitization Before Off-Site Maintenance", instruction: "Before any CUI device leaves the premises for maintenance, complete the sanitization procedure and document: device name, serial number, sanitization method, date, and authorized approver.", systemPortal: "Microsoft Intune Admin Center", navigationPath: "Devices > select device > Wipe or Factory Reset", evidenceHint: "Sanitization record or Intune wipe confirmation before off-site service." },
      { stepNumber: 3, title: "Verify Device Returns Clean", instruction: "When devices return from off-site maintenance, verify they have been re-enrolled in Intune and security baseline has been re-applied before returning to CUI use.", systemPortal: "Microsoft Intune Admin Center", evidenceHint: "Intune enrollment and baseline compliance confirmation for returned device." },
    ],
    evidenceRequirements: [
      { title: "Equipment Sanitization Records", type: "Document/Spreadsheet", filename: "MA-3.7.3_Sanitization_Records_YYYY-MM-DD.xlsx", location: "Organization-maintained", mustShow: "Device ID, serial, sanitization method, date, performed by, approver" },
    ],
    testProcedures: [
      { name: "Sanitization Process Verification", steps: "1. Review sanitization records for the past 12 months.\n2. Confirm all off-site maintenance devices have sanitization records.\n3. Verify Intune remote wipe or equivalent was performed before device left site.", expectedResult: "All devices sanitized before off-site maintenance.", passCriteria: "Sanitization records exist for all off-site maintenance. Appropriate method used." },
    ],
    closeoutChecklist: ["Equipment sanitization procedure documented", "Sanitization records maintained", "Intune wipe capability confirmed", "Return device re-enrollment process defined", "Evidence uploaded", "SSP narrative updated"],
  },

  {
    controlId: "MA.L2-3.7.4",
    implementationApproach: `Check media containing diagnostic and test programs for malicious code before the media is used in the system. Any USB drives, CDs, or other media brought in to perform maintenance or diagnostic testing must be scanned for malware before use in CUI systems. This prevents malware from being introduced via maintenance media.\n\nFor Microsoft 365 / Defender: Use Microsoft Defender to scan all media before use. Have a designated, isolated scanning workstation for checking maintenance media.`,
    systemsUsed: ["Microsoft Defender Portal", "Microsoft Intune Admin Center"],
    steps: [
      { stepNumber: 1, title: "Document Media Scanning Procedure", instruction: "Create a procedure requiring that all maintenance media (USB drives, diagnostic CDs) be scanned for malware before use in CUI systems. Designate a scanning workstation for this purpose.", systemPortal: "Organization documentation", evidenceHint: "Media scanning procedure document." },
      { stepNumber: 2, title: "Scan All Maintenance Media Before Use", instruction: "Before inserting any maintenance media into a CUI system, scan the media on the designated scanning workstation using Microsoft Defender or equivalent. Document the scan results.", systemPortal: "Microsoft Defender", expectedResult: "All maintenance media is scanned clean before use.", evidenceHint: "Media scan results log or screenshots showing clean scan before maintenance activity." },
    ],
    evidenceRequirements: [
      { title: "Media Scanning Procedure", type: "Document", filename: "MA-3.7.4_Media_Scan_Procedure_YYYY-MM-DD.docx", location: "Organization-maintained", mustShow: "Scanning requirement, scanning tool, scanning workstation, documentation requirement" },
      { title: "Maintenance Media Scan Records", type: "Document/Screenshot", filename: "MA-3.7.4_Media_Scan_Records_YYYY-MM-DD.xlsx", location: "Organization-maintained", mustShow: "Date, media description, scan tool, scan result, maintenance activity" },
    ],
    testProcedures: [
      { name: "Media Scanning Process Verification", steps: "1. Review media scan records from the past 12 months.\n2. Verify all maintenance media has documented pre-use scans.\n3. Test the scanning process with a USB drive — confirm Defender scans it completely.", expectedResult: "All maintenance media is scanned before use. Process is documented.", passCriteria: "Scan records exist for all maintenance media use. Scanning process is functional." },
    ],
    closeoutChecklist: ["Media scanning procedure documented", "Scanning workstation designated", "Media scan records maintained", "Personnel trained on scanning procedure", "Evidence uploaded", "SSP narrative updated"],
  },

  {
    controlId: "MA.L2-3.7.5",
    implementationApproach: `Require MFA to establish nonlocal maintenance sessions via external network connections and terminate such connections when nonlocal maintenance is complete. Remote maintenance sessions must require MFA and must be terminated promptly when maintenance is complete. Persistent remote maintenance connections are a significant security risk.\n\nFor Microsoft 365: Require MFA for all remote maintenance access via Conditional Access. Use time-limited VPN sessions or session timeouts to ensure sessions are terminated after maintenance.`,
    systemsUsed: ["Microsoft Entra Admin Center", "VPN / Remote Access Solution"],
    steps: [
      { stepNumber: 1, title: "Require MFA for Remote Maintenance Access", instruction: "Configure Conditional Access to require MFA for all remote maintenance sessions. This applies to any remote admin access: RDP, SSH, web-based admin portals, VPN with admin access.", systemPortal: "Microsoft Entra Admin Center", navigationPath: "Protection > Conditional Access", evidenceHint: "Screenshot of Conditional Access policy requiring MFA for maintenance access." },
      { stepNumber: 2, title: "Establish Session Termination Procedure", instruction: "Document and enforce a procedure requiring technicians to explicitly terminate remote maintenance sessions when maintenance is complete. Configure session timeouts to auto-terminate idle sessions.", systemPortal: "Organization documentation / VPN console", recommendedSetting: "Remote maintenance sessions: 30-minute idle timeout. Require explicit disconnect after maintenance.", evidenceHint: "Session timeout configuration and termination procedure document." },
      { stepNumber: 3, title: "Log and Review Remote Maintenance Sessions", instruction: "Ensure all remote maintenance sessions are logged with: user, start time, end time, systems accessed, and actions taken. Review logs after each maintenance window.", systemPortal: "VPN / Remote Access Solution", evidenceHint: "Remote maintenance session log showing start/end times and actions." },
    ],
    evidenceRequirements: [
      { title: "Remote Maintenance Session Controls", type: "Screenshot/Document", filename: "MA-3.7.5_Remote_Maintenance_Controls_YYYY-MM-DD.png", location: "Entra CA and VPN config", mustShow: "MFA required, session timeout configured, logging enabled" },
    ],
    testProcedures: [
      { name: "Remote Maintenance Session Security Test", steps: "1. Initiate a remote maintenance session — verify MFA is required.\n2. Leave the session idle for 30 minutes — verify it auto-terminates.\n3. Review session log to confirm maintenance session was recorded.", expectedResult: "Remote maintenance requires MFA and sessions are terminated when complete.", passCriteria: "MFA required. Session auto-terminates after idle timeout. Session logged." },
    ],
    closeoutChecklist: ["MFA required for remote maintenance access", "Session timeout configured", "Termination procedure documented and enforced", "Remote maintenance sessions logged", "Evidence uploaded", "SSP narrative updated"],
  },

  {
    controlId: "MA.L2-3.7.6",
    implementationApproach: `Supervise the maintenance activities of maintenance personnel without required access authorization. When maintenance is performed by personnel who are not cleared or do not have authorization to access CUI (e.g., external hardware vendor, building facilities), an authorized employee must supervise the entire maintenance activity to prevent unauthorized access to CUI.\n\nFor Microsoft 365: Physical hardware maintenance by third parties requires an authorized escort. During supervised maintenance, ensure CUI is not visible on screens and storage media is secured.`,
    systemsUsed: ["Organization documentation", "Physical Access Control System"],
    steps: [
      { stepNumber: 1, title: "Define Supervision Requirements for Unauthorized Personnel", instruction: "Document the policy requiring that any maintenance personnel without CUI access authorization must be supervised by an authorized employee throughout the maintenance activity. Define who qualifies as a supervisor.", systemPortal: "Organization documentation", evidenceHint: "Supervision policy document." },
      { stepNumber: 2, title: "Implement Physical Security During Supervised Maintenance", instruction: "During supervised maintenance: lock screens or log off systems, remove or secure portable storage media, ensure CUI documents are not visible. Document these precautions in the maintenance record.", systemPortal: "Organization documentation", evidenceHint: "Supervision checklist completed during maintenance activities." },
      { stepNumber: 3, title: "Maintain Supervision Records", instruction: "For each supervised maintenance activity, document: vendor/technician name, supervisor name, date, work performed, and that CUI was not accessed or exposed during maintenance.", systemPortal: "Organization documentation", evidenceHint: "Supervision records from the past 12 months of external maintenance activities." },
    ],
    evidenceRequirements: [
      { title: "Maintenance Supervision Records", type: "Document/Spreadsheet", filename: "MA-3.7.6_Supervision_Records_YYYY-MM-DD.xlsx", location: "Organization-maintained", mustShow: "Vendor, supervisor, date, work performed, CUI not exposed confirmation" },
    ],
    testProcedures: [
      { name: "Supervision Policy and Record Check", steps: "1. Review supervision records for all external maintenance in the past 12 months.\n2. Confirm all records show an authorized supervisor was present.\n3. Confirm the policy requires supervision for unauthorized maintenance personnel.", expectedResult: "All maintenance by unauthorized personnel is supervised and documented.", passCriteria: "Supervision policy documented. All external maintenance has supervision records." },
    ],
    closeoutChecklist: ["Supervision policy documented", "Supervision requirements communicated to staff", "Supervision records maintained", "Physical CUI protection during maintenance documented", "Evidence uploaded", "SSP narrative updated"],
  },

  // ── MEDIA PROTECTION ────────────────────────────────────────────────────

  {
    controlId: "MP.L1-3.8.3",
    implementationApproach: `Sanitize or destroy information system media before disposal or reuse. Before disposing of or reusing any storage media that has contained CUI, the media must be sanitized using NIST SP 800-88 approved methods, or physically destroyed. Simply deleting files is not sufficient.\n\nFor Microsoft 365: Cloud data disposal is handled by Microsoft. For on-premises devices, use NIST 800-88 compliant sanitization before disposal: overwriting (for HDDs), cryptographic erase (for SSDs/NVMe), or physical destruction.`,
    systemsUsed: ["Microsoft Intune Admin Center", "NIST 800-88 Sanitization Tool"],
    steps: [
      { stepNumber: 1, title: "Develop a Media Sanitization Policy and Procedure", instruction: "Create a policy defining: what media must be sanitized before disposal/reuse, approved sanitization methods (per NIST 800-88), documentation requirements, and destruction verification.", systemPortal: "Organization documentation", evidenceHint: "Media sanitization policy document referencing NIST 800-88." },
      { stepNumber: 2, title: "Perform and Document Media Sanitization", instruction: "For every device or media being disposed of or reused, perform the appropriate NIST 800-88 sanitization: Clear (overwrite), Purge (cryptographic erase for SSDs), or Destroy (physical destruction). Document the sanitization.", systemPortal: "NIST 800-88 Sanitization Tool / Vendor", evidenceHint: "Sanitization certificate or log showing device, method, date, and technician." },
      { stepNumber: 3, title: "Use Certified Destruction Vendor for Physical Destruction", instruction: "When physical destruction is required, use a certified e-waste destruction vendor who provides a certificate of destruction. Retain these certificates.", systemPortal: "External destruction vendor", evidenceHint: "Certificate of destruction from certified vendor." },
    ],
    evidenceRequirements: [
      { title: "Media Sanitization/Destruction Records", type: "Document/Spreadsheet", filename: "MP-3.8.3_Sanitization_Records_YYYY-MM-DD.xlsx", location: "Organization-maintained", mustShow: "Device/media description, serial number, sanitization method, date, technician, verification" },
    ],
    testProcedures: [
      { name: "Media Sanitization Process Verification", steps: "1. Review sanitization records for the past 12 months.\n2. Confirm all disposed/reused media has a sanitization record.\n3. Verify the sanitization method used is NIST 800-88 compliant.", expectedResult: "All media is sanitized before disposal or reuse per NIST 800-88.", passCriteria: "Sanitization records complete. NIST 800-88 methods used. Certificates of destruction on file." },
    ],
    closeoutChecklist: ["Media sanitization policy documented", "NIST 800-88 sanitization methods used", "Sanitization records maintained", "Destruction vendor certified", "Evidence uploaded", "SSP narrative updated"],
  },

  {
    controlId: "MP.L2-3.8.1",
    implementationApproach: `Protect (i.e., physically control and securely store) system media containing CUI, both paper and digital. CUI media must be stored in secure, access-controlled locations. Unauthorized individuals must not be able to access or remove CUI-containing media. Paper CUI must be stored in locked cabinets.\n\nFor Microsoft 365: Cloud-stored CUI is protected by Microsoft's physical security. On-premises: secure server rooms for storage systems, locked filing cabinets for paper CUI.`,
    systemsUsed: ["Physical Access Control", "Organization documentation"],
    steps: [
      { stepNumber: 1, title: "Identify and Inventory CUI Media", instruction: "Create an inventory of all media types containing CUI: storage servers, backup drives, USB drives, paper documents, portable hard drives. Document location and access controls for each.", systemPortal: "Organization documentation", evidenceHint: "CUI media inventory with location and access controls." },
      { stepNumber: 2, title: "Implement Physical Security Controls for CUI Media", instruction: "Ensure all physical CUI media is stored in secure, access-controlled locations: locked server rooms with badge access, locked filing cabinets for paper CUI. Only authorized personnel may access.", systemPortal: "Physical access control system", evidenceHint: "Photo or documentation of locked storage, badge access logs for server room." },
      { stepNumber: 3, title: "Control and Log Media Access", instruction: "Maintain an access log for CUI media: who accessed it, when, and for what purpose. Conduct periodic audits of media access logs.", systemPortal: "Organization documentation / Physical access control", evidenceHint: "CUI media access log or physical access control system records." },
    ],
    evidenceRequirements: [
      { title: "CUI Media Inventory and Physical Controls", type: "Document", filename: "MP-3.8.1_CUI_Media_Inventory_YYYY-MM-DD.xlsx", location: "Organization-maintained", mustShow: "Media type, location, access controls, authorized personnel" },
    ],
    testProcedures: [
      { name: "CUI Media Physical Security Check", steps: "1. Visit the location where CUI media is stored.\n2. Verify media is in locked, access-controlled location.\n3. Review access logs to confirm only authorized personnel accessed the media.", expectedResult: "CUI media is physically secured and access-controlled.", passCriteria: "CUI media in locked, access-controlled storage. Access logs maintained." },
    ],
    closeoutChecklist: ["CUI media inventory created", "Physical security controls implemented", "Access controls verified", "Media access logs maintained", "Evidence uploaded", "SSP narrative updated"],
  },

  {
    controlId: "MP.L2-3.8.2",
    implementationApproach: `Limit access to CUI on system media to authorized users. Technical and physical controls must limit who can read, copy, or transfer CUI from media. Only users with a documented need-to-know should be able to access CUI on system media.\n\nFor Microsoft 365: SharePoint and Teams permissions restrict access to CUI. Sensitivity labels control access to CUI documents. For on-premises media, file system permissions and physical access controls limit access.`,
    systemsUsed: ["Microsoft Entra Admin Center", "SharePoint Admin Center", "Microsoft Purview Portal"],
    steps: [
      { stepNumber: 1, title: "Apply Least-Privilege Access to CUI Media Repositories", instruction: "Review permissions on all SharePoint libraries, Teams channels, and file shares containing CUI. Remove access for users who don't have a documented business need.", systemPortal: "SharePoint Admin Center", navigationPath: "Sites > Active sites > select site > Permissions", evidenceHint: "Screenshot of CUI site/library permissions showing only authorized users." },
      { stepNumber: 2, title: "Apply Sensitivity Labels to CUI Documents", instruction: "Label all CUI documents with the appropriate sensitivity label (e.g., CUI label). Configure the label to restrict access to authorized users only.", systemPortal: "Microsoft Purview Portal", navigationPath: "Information protection > Labels", evidenceHint: "Screenshot of CUI sensitivity label with access restriction settings." },
      { stepNumber: 3, title: "Implement DLP to Prevent Unauthorized CUI Media Access", instruction: "Configure DLP policies to alert or block when CUI is copied to unauthorized locations or shared with unauthorized users.", systemPortal: "Microsoft Purview Portal", navigationPath: "Data loss prevention > Policies", evidenceHint: "Screenshot of DLP policy protecting CUI from unauthorized access." },
    ],
    evidenceRequirements: [
      { title: "CUI Repository Access Controls", type: "Screenshot", filename: "MP-3.8.2_CUI_Access_Controls_YYYY-MM-DD.png", location: "SharePoint Admin > Site permissions", mustShow: "CUI site/library, authorized group/user names, permission levels" },
    ],
    testProcedures: [
      { name: "CUI Access Restriction Verification", steps: "1. As an unauthorized user, attempt to access a CUI SharePoint site.\n2. Verify access is denied.\n3. As an authorized user, verify CUI is accessible.", expectedResult: "CUI media access is restricted to authorized users only.", passCriteria: "Unauthorized users denied access to CUI. Authorized users have appropriate access." },
    ],
    closeoutChecklist: ["CUI repository permissions reviewed and restricted", "Sensitivity labels applied to CUI documents", "DLP policies protecting CUI", "Evidence uploaded", "SSP narrative updated"],
  },

  {
    controlId: "MP.L2-3.8.4",
    implementationApproach: `Mark media with necessary CUI markings and distribution limitations. CUI must be appropriately marked so recipients know it is controlled and must be handled accordingly. Physical media must have CUI markings. Electronic CUI must have markings or sensitivity labels.\n\nFor Microsoft 365: Use Microsoft Purview sensitivity labels to automatically mark CUI documents. Configure labels to apply visible markings (headers, footers, watermarks).`,
    systemsUsed: ["Microsoft Purview Portal", "Organization documentation"],
    steps: [
      { stepNumber: 1, title: "Configure Sensitivity Labels with CUI Visual Markings", instruction: "Configure sensitivity labels in Microsoft Purview to apply visual CUI markings to documents: headers/footers with 'CUI' designation, watermarks for printed documents.", systemPortal: "Microsoft Purview Portal", navigationPath: "Information protection > Labels > select label > Content marking", recommendedSetting: "Header: 'CONTROLLED // CUI'. Footer: distribution limitations. Watermark if printing.", evidenceHint: "Screenshot of sensitivity label with content marking configuration." },
      { stepNumber: 2, title: "Apply CUI Markings to All CUI Documents", instruction: "Train users to apply the CUI sensitivity label to all documents containing CUI. Configure auto-labeling for known CUI content types in SharePoint and Exchange.", systemPortal: "Microsoft Purview Portal", navigationPath: "Information protection > Auto-labeling", evidenceHint: "Screenshot of auto-labeling policy or user training records for CUI labeling." },
      { stepNumber: 3, title: "Mark Physical CUI Media with Required Markings", instruction: "Ensure physical media containing CUI is marked: USB drives labeled with 'CUI', printed documents stamped or printed with CUI markings, external hard drives labeled.", systemPortal: "Organization policy", evidenceHint: "Photo of physically marked CUI media or procedure for media marking." },
    ],
    evidenceRequirements: [
      { title: "Sensitivity Label CUI Marking Configuration", type: "Screenshot", filename: "MP-3.8.4_CUI_Label_Markings_YYYY-MM-DD.png", location: "Purview > Labels > Content marking", mustShow: "Label name, header/footer text with CUI designation, watermark setting" },
      { title: "CUI Marked Document Sample", type: "Screenshot", filename: "MP-3.8.4_CUI_Document_Sample_YYYY-MM-DD.png", location: "Example CUI document", mustShow: "Document with CUI header/footer marking visible" },
    ],
    testProcedures: [
      { name: "CUI Marking Application Test", steps: "1. Apply the CUI sensitivity label to a test document.\n2. Verify the header/footer CUI marking is visible.\n3. Confirm auto-labeling picks up CUI content and applies the label.\n4. Review 5 existing CUI documents to confirm they are labeled.", expectedResult: "CUI documents are marked with required CUI designations.", passCriteria: "All CUI documents have CUI markings. Sensitivity labels apply visual markings correctly." },
    ],
    closeoutChecklist: ["Sensitivity labels configured with CUI visual markings", "Auto-labeling configured for CUI content", "Physical media marking procedure documented", "Users trained on CUI labeling requirements", "Evidence uploaded", "SSP narrative updated"],
  },

  {
    controlId: "MP.L2-3.8.5",
    implementationApproach: `Control access to media containing CUI and maintain accountability for media during transport. CUI media must be accounted for and controlled during transport — both within the organization and when transported off-site. A chain of custody must be maintained.\n\nFor Microsoft 365: Electronic CUI transmitted via email must use encryption. Physical CUI media transported off-site must be tracked with a transport log and physically secured during transport.`,
    systemsUsed: ["Organization documentation", "Microsoft Purview Portal"],
    steps: [
      { stepNumber: 1, title: "Develop Media Transport Policy and Procedures", instruction: "Create a policy governing the transport of CUI media: approved transport methods, packaging requirements, tracking requirements, and authorization requirements.", systemPortal: "Organization documentation", evidenceHint: "Media transport policy document." },
      { stepNumber: 2, title: "Implement Chain of Custody for Physical CUI Media Transport", instruction: "When physically transporting CUI media off-site, maintain a transport log documenting: media description, sender, recipient, transport method, date shipped, and date received.", systemPortal: "Organization documentation", evidenceHint: "CUI media transport log with chain of custody records." },
      { stepNumber: 3, title: "Encrypt Electronic CUI During Transmission", instruction: "Ensure all electronic CUI transmitted externally uses encryption: email encryption via sensitivity labels, secure file transfer protocols (SFTP, encrypted email), or Microsoft 365 Message Encryption.", systemPortal: "Microsoft Purview Portal", evidenceHint: "Screenshot of email encryption or secure file transfer configuration." },
    ],
    evidenceRequirements: [
      { title: "Media Transport Policy and Chain of Custody Records", type: "Document", filename: "MP-3.8.5_Media_Transport_Records_YYYY-MM-DD.docx", location: "Organization-maintained", mustShow: "Transport policy, chain of custody log, electronic transmission encryption" },
    ],
    testProcedures: [
      { name: "Media Transport Control Verification", steps: "1. Review media transport log for past 12 months.\n2. Confirm all off-site media transports are documented with chain of custody.\n3. Verify electronic CUI is encrypted during transmission.", expectedResult: "CUI media transport is controlled and documented.", passCriteria: "Transport policy documented. Chain of custody maintained. Electronic CUI encrypted in transit." },
    ],
    closeoutChecklist: ["Media transport policy documented", "Chain of custody process implemented", "Electronic CUI encryption configured", "Transport log maintained", "Evidence uploaded", "SSP narrative updated"],
  },

  {
    controlId: "MP.L2-3.8.6",
    implementationApproach: `Implement cryptographic mechanisms to protect the confidentiality of CUI during transport unless otherwise protected by alternative physical safeguards. CUI must be encrypted during transmission. Unencrypted transmission of CUI over any network is prohibited.\n\nFor Microsoft 365: All Microsoft 365 transmissions use TLS. Configure email encryption for external CUI transmissions. Use Microsoft 365 Message Encryption or S/MIME for encrypted email.`,
    systemsUsed: ["Microsoft Purview Portal", "Microsoft Exchange Admin Center"],
    steps: [
      { stepNumber: 1, title: "Configure Microsoft 365 Message Encryption for CUI Email", instruction: "Configure Microsoft 365 Message Encryption (OME) to encrypt emails containing CUI when sent externally. Create a mail flow rule that applies OME when a CUI sensitivity label is applied.", systemPortal: "Microsoft Purview Portal / Exchange Admin Center", navigationPath: "Exchange > Mail flow > Rules", recommendedSetting: "Apply OME encryption when sensitivity label = CUI and recipient is external.", evidenceHint: "Screenshot of mail flow rule applying OME for CUI emails to external recipients." },
      { stepNumber: 2, title: "Verify TLS Encryption for All Microsoft 365 Connections", instruction: "Microsoft 365 uses TLS 1.2+ for all connections. Verify that connector settings require TLS for all external email partners handling CUI.", systemPortal: "Microsoft Exchange Admin Center", navigationPath: "Mail flow > Connectors", evidenceHint: "Screenshot of connector settings showing TLS required." },
      { stepNumber: 3, title: "Use Secure File Transfer for CUI File Exchange", instruction: "When sharing CUI files externally, use secure file sharing methods: SharePoint with expiring links (not public links), encrypted email attachment, or an approved secure file transfer service.", systemPortal: "SharePoint Admin Center / Microsoft 365", evidenceHint: "Screenshot or documentation of secure file sharing configuration for external CUI sharing." },
    ],
    evidenceRequirements: [
      { title: "CUI Email Encryption Configuration", type: "Screenshot", filename: "MP-3.8.6_CUI_Email_Encryption_YYYY-MM-DD.png", location: "Exchange > Mail flow rules or Purview", mustShow: "Rule/policy name, CUI condition, OME or encryption action applied" },
    ],
    testProcedures: [
      { name: "CUI Transmission Encryption Test", steps: "1. Send a test email with a CUI sensitivity label to an external recipient.\n2. Verify the recipient receives an encrypted message.\n3. Verify external file sharing uses encrypted/protected links.", expectedResult: "CUI is encrypted during all external transmissions.", passCriteria: "CUI email encrypted via OME or equivalent. No plaintext CUI transmitted externally." },
    ],
    closeoutChecklist: ["OME or equivalent configured for external CUI email", "TLS required for all email connectors", "Secure file sharing configured for external CUI exchange", "Encryption policy documented", "Evidence uploaded", "SSP narrative updated"],
  },

  {
    controlId: "MP.L2-3.8.7",
    implementationApproach: `Control the use of removable media on system components. This extends AC.L2-3.1.21 (limit use of portable storage) to all removable media types: USB drives, external hard drives, optical media, SD cards, and mobile devices connected as storage. The organization must have a policy and technical controls governing removable media use.\n\nFor Microsoft 365 / Defender: Use Defender for Endpoint Device Control to enforce removable media policies. Block or audit all removable media events.`,
    systemsUsed: ["Microsoft Defender Portal", "Microsoft Intune Admin Center"],
    steps: [
      { stepNumber: 1, title: "Define Removable Media Policy", instruction: "Create a policy defining: which removable media types are permitted, requirements for approved media (encryption, registration), approval process for exceptions, and consequences for policy violations.", systemPortal: "Organization documentation", evidenceHint: "Removable media policy document." },
      { stepNumber: 2, title: "Configure Defender Device Control for Removable Media", instruction: "Configure Microsoft Defender for Endpoint Device Control policies to enforce removable media restrictions. Define approved media classes and block or audit unapproved media.", systemPortal: "Microsoft Defender Portal", navigationPath: "Settings > Endpoints > Device control > Policies", recommendedSetting: "Block read/write to all removable storage. Allow only for approved, registered devices with justification.", evidenceHint: "Screenshot of Defender Device Control policy for removable media." },
      { stepNumber: 3, title: "Review Removable Media Events", instruction: "Review Defender for Endpoint removable media events periodically. Identify any unapproved or suspicious media connection events and investigate.", systemPortal: "Microsoft Defender Portal", navigationPath: "Reports > Device control", evidenceHint: "Screenshot of removable media event report." },
    ],
    evidenceRequirements: [
      { title: "Removable Media Policy", type: "Document", filename: "MP-3.8.7_Removable_Media_Policy_YYYY-MM-DD.docx", location: "Organization-maintained", mustShow: "Permitted media types, approval process, encryption requirement, consequences" },
      { title: "Device Control Policy", type: "Screenshot", filename: "MP-3.8.7_Device_Control_Policy_YYYY-MM-DD.png", location: "Defender > Device control", mustShow: "Policy name, removable media restrictions, assigned devices" },
    ],
    testProcedures: [
      { name: "Removable Media Control Test", steps: "1. Connect an unapproved USB drive to a CUI device.\n2. Verify Defender blocks or audits the connection.\n3. Review the Device Control report to confirm the event was logged.", expectedResult: "Removable media use is controlled and monitored.", passCriteria: "Unapproved media blocked or audited. Events logged in Defender." },
    ],
    closeoutChecklist: ["Removable media policy documented", "Defender Device Control policies configured", "Removable media events monitored", "Exception process established", "Evidence uploaded", "SSP narrative updated"],
  },

  {
    controlId: "MP.L2-3.8.8",
    implementationApproach: `Prohibit the use of portable storage devices when such devices have no identifiable owner. Unidentifiable portable storage devices (unmarked USB drives found in parking lots, unregistered drives) must not be connected to CUI systems. This prevents "drop attacks" where adversaries leave infected drives for employees to find and use.\n\nFor Microsoft 365 / Defender: Block all unregistered or unlabeled portable storage. Train employees to not connect found drives. Configure Defender to block unsigned or unregistered devices.`,
    systemsUsed: ["Microsoft Defender Portal", "Organization documentation"],
    steps: [
      { stepNumber: 1, title: "Prohibit Connection of Unknown Portable Storage", instruction: "Document and communicate a policy prohibiting the connection of any portable storage device that is not registered, labeled, and approved by IT. Include the 'found USB drive' scenario in security awareness training.", systemPortal: "Organization documentation", evidenceHint: "Acceptable use policy section on portable storage. Training record on unknown device awareness." },
      { stepNumber: 2, title: "Register All Approved Portable Storage Devices", instruction: "Maintain a registry of all approved portable storage devices including: owner, serial number, assigned device ID, and authorized use. Only registered devices may be connected to CUI systems.", systemPortal: "Organization documentation", evidenceHint: "Approved portable storage device registry." },
      { stepNumber: 3, title: "Configure Defender to Block Unregistered Devices", instruction: "Use Defender for Endpoint Device Control to create an allowlist of approved portable storage devices (by hardware ID). Block all other devices automatically.", systemPortal: "Microsoft Defender Portal", navigationPath: "Settings > Endpoints > Device control > Policies", evidenceHint: "Screenshot of Defender device control allowlist policy." },
    ],
    evidenceRequirements: [
      { title: "Portable Storage Device Registry and Policy", type: "Document", filename: "MP-3.8.8_Portable_Storage_Registry_YYYY-MM-DD.xlsx", location: "Organization-maintained", mustShow: "Owner, device description, serial number, hardware ID, authorized use, approval date" },
    ],
    testProcedures: [
      { name: "Unknown Portable Storage Block Test", steps: "1. Connect an unregistered USB drive to a CUI device.\n2. Verify Defender blocks the connection.\n3. Confirm employees are trained to report found USB drives.", expectedResult: "Unidentifiable portable storage devices are blocked from CUI systems.", passCriteria: "Unregistered devices blocked by Defender. Training records on found device policy." },
    ],
    closeoutChecklist: ["Unknown portable storage prohibition policy documented", "Approved device registry established", "Defender allowlist configured", "Employee training on found device procedure completed", "Evidence uploaded", "SSP narrative updated"],
  },

  {
    controlId: "MP.L2-3.8.9",
    implementationApproach: `Protect the confidentiality of backup CUI at storage locations. Backup copies of CUI must be protected with the same rigor as primary CUI: access controls, encryption, and physical security. Backups are frequently targeted because they may be less protected than primary systems.\n\nFor Microsoft 365: Microsoft 365 backup copies are protected by Microsoft's infrastructure. For on-premises or third-party backup systems, ensure encryption at rest, access controls, and offsite storage security.`,
    systemsUsed: ["Backup Solution", "Microsoft 365 Admin Center"],
    steps: [
      { stepNumber: 1, title: "Inventory CUI Backup Locations", instruction: "Document all locations where CUI backups are stored: on-premises tape/disk, cloud backup service, offsite storage. Each location must have appropriate security controls.", systemPortal: "Organization documentation", evidenceHint: "CUI backup location inventory with security controls for each." },
      { stepNumber: 2, title: "Encrypt CUI Backups at Rest", instruction: "Ensure all CUI backup copies are encrypted using AES-256 or equivalent. Verify backup encryption settings in your backup solution.", systemPortal: "Backup Solution", recommendedSetting: "AES-256 encryption at rest. Encryption keys managed separately from backup data.", evidenceHint: "Screenshot of backup solution showing encryption enabled." },
      { stepNumber: 3, title: "Control Access to Backup Systems and Media", instruction: "Restrict access to backup systems, backup consoles, and offline backup media to authorized personnel only. Review and document who has access to backup systems.", systemPortal: "Backup Solution / Organization documentation", evidenceHint: "Backup system access control configuration or access list." },
    ],
    evidenceRequirements: [
      { title: "Backup Encryption Configuration", type: "Screenshot", filename: "MP-3.8.9_Backup_Encryption_Config_YYYY-MM-DD.png", location: "Backup solution console", mustShow: "Encryption enabled, algorithm, key management" },
      { title: "CUI Backup Access Controls", type: "Document/Screenshot", filename: "MP-3.8.9_Backup_Access_Controls_YYYY-MM-DD.docx", location: "Organization-maintained or backup console", mustShow: "Authorized users with backup access, access control type" },
    ],
    testProcedures: [
      { name: "Backup CUI Protection Verification", steps: "1. Verify backup encryption is enabled for all CUI backup copies.\n2. Confirm only authorized personnel have access to backup systems.\n3. Verify offsite backup storage has appropriate physical security.", expectedResult: "CUI backups are encrypted and access-controlled.", passCriteria: "All CUI backups encrypted at rest. Access restricted to authorized personnel." },
    ],
    closeoutChecklist: ["CUI backup locations inventoried", "Backup encryption enabled and verified", "Backup access controls implemented", "Offsite backup security verified", "Evidence uploaded", "SSP narrative updated"],
  },

  // ── PHYSICAL PROTECTION ─────────────────────────────────────────────────

  {
    controlId: "PE.L1-3.10.1",
    implementationApproach: `Limit physical access to organizational systems to authorized individuals. Physical access to areas where CUI systems are located must be restricted to authorized personnel through physical security controls: badge access, key locks, security guards, or similar mechanisms. Unauthorized individuals must not be able to physically access CUI systems.\n\nFor Microsoft 365: Cloud infrastructure is protected by Microsoft's physical security. For on-premises systems, implement badge access control, locked server rooms, and visitor escort requirements.`,
    systemsUsed: ["Physical Access Control System", "Organization documentation"],
    steps: [
      { stepNumber: 1, title: "Implement Badge/Key Access for CUI Areas", instruction: "Ensure all areas containing CUI systems have physical access controls: electronic badge readers, key locks, or combination locks. Only authorized personnel should have access credentials.", systemPortal: "Physical Access Control System", evidenceHint: "Photo or documentation of access control mechanism on CUI area entry." },
      { stepNumber: 2, title: "Maintain Authorized Physical Access List", instruction: "Maintain a current list of all individuals with physical access to CUI areas. Review and update this list quarterly, removing access when personnel change roles or leave.", systemPortal: "Physical Access Control System", evidenceHint: "Physical access authorization list with quarterly review date." },
      { stepNumber: 3, title: "Implement Layered Physical Security", instruction: "For highest-sensitivity areas, implement layered security: perimeter security (fence/wall) > building security (locked doors) > CUI area security (badge reader) > server room security (separate lock). Document the physical security architecture.", systemPortal: "Organization documentation", evidenceHint: "Physical security architecture diagram or description." },
    ],
    evidenceRequirements: [
      { title: "Physical Access Control Evidence", type: "Photo/Screenshot", filename: "PE-3.10.1_Physical_Access_Control_YYYY-MM-DD.png", location: "Physical facility", mustShow: "Badge reader, lock, or other access control mechanism on CUI area" },
      { title: "Physical Access Authorization List", type: "Document", filename: "PE-3.10.1_Physical_Access_List_YYYY-MM-DD.xlsx", location: "Organization-maintained", mustShow: "Name, role, access level, authorization date, last review date" },
    ],
    testProcedures: [
      { name: "Physical Access Control Verification", steps: "1. Attempt to enter a CUI area without authorization — verify access is denied.\n2. Review the access authorization list and confirm it is current.\n3. Verify access revocation for departed employees is documented.", expectedResult: "Physical access to CUI areas is restricted to authorized personnel.", passCriteria: "Physical access controls functional. Authorization list current. Departed employee access revoked." },
    ],
    closeoutChecklist: ["Physical access controls implemented for CUI areas", "Authorization list maintained and reviewed", "Access revocation process documented", "Physical security architecture documented", "Evidence uploaded", "SSP narrative updated"],
  },

  {
    controlId: "PE.L1-3.10.3",
    implementationApproach: `Escort visitors and monitor visitor activity. Visitors to areas where CUI systems are located must be escorted by an authorized employee at all times. Visitors must not be left unattended in CUI areas. Visitor access must be logged.\n\nFor Microsoft 365: Cloud visitor access is managed by Microsoft. For on-premises facilities, implement a visitor management system and escort policy.`,
    systemsUsed: ["Physical Access Control / Visitor Management System", "Organization documentation"],
    steps: [
      { stepNumber: 1, title: "Implement a Visitor Management Process", instruction: "Create a visitor management procedure: pre-authorization for visits, sign-in/sign-out log, visitor badge issuance, and escort assignment. Visitors must be distinguishable from employees (visitor badge).", systemPortal: "Organization documentation / Visitor Management System", evidenceHint: "Visitor management procedure and visitor log from the past month." },
      { stepNumber: 2, title: "Require Escorts for All Visitors in CUI Areas", instruction: "Policy and practice must require that all visitors to CUI areas are escorted by an authorized employee. Train employees never to allow tailgating or leave visitors unattended.", systemPortal: "Organization documentation", evidenceHint: "Visitor escort policy and training record." },
      { stepNumber: 3, title: "Maintain Visitor Access Log", instruction: "Maintain a log of all visitors to CUI areas: name, organization, purpose, escort, time in, time out. Review the log for unusual access patterns.", systemPortal: "Physical facility / Visitor log", evidenceHint: "Visitor access log from the past 30 days." },
    ],
    evidenceRequirements: [
      { title: "Visitor Management Policy and Log", type: "Document/Spreadsheet", filename: "PE-3.10.3_Visitor_Log_YYYY-MM-DD.xlsx", location: "Physical facility", mustShow: "Visitor name, organization, purpose, escort name, time in/out" },
    ],
    testProcedures: [
      { name: "Visitor Control Verification", steps: "1. Review visitor log for the past 30 days and confirm all visitors have escort documented.\n2. Verify visitor badges are distinguishable from employee badges.\n3. Confirm employees are trained on escort requirements.", expectedResult: "All visitors are escorted and logged in CUI areas.", passCriteria: "Visitor log complete. All entries show escort. Visitor badges distinguishable." },
    ],
    closeoutChecklist: ["Visitor management procedure documented", "Visitor escort policy implemented", "Visitor log maintained", "Employee training on escort requirements completed", "Evidence uploaded", "SSP narrative updated"],
  },

  {
    controlId: "PE.L1-3.10.4",
    implementationApproach: `Maintain audit logs of physical access. Physical access logs must be maintained for CUI areas to enable investigation of unauthorized access attempts and incidents. Logs must capture: who accessed, when, and which area.\n\nFor Microsoft 365: Cloud physical access logs are maintained by Microsoft. For on-premises facilities, electronic badge readers provide access logs. Supplement with CCTV if appropriate.`,
    systemsUsed: ["Physical Access Control System", "CCTV / Security Camera System"],
    steps: [
      { stepNumber: 1, title: "Enable and Maintain Physical Access Logs", instruction: "Ensure all badge access systems and physical access controls generate and retain access logs. Configure log retention for at least 90 days (1 year preferred).", systemPortal: "Physical Access Control System", evidenceHint: "Screenshot of access control log or physical access report showing log entries." },
      { stepNumber: 2, title: "Review Physical Access Logs Regularly", instruction: "Review physical access logs weekly or monthly. Look for: access at unusual hours, multiple failed access attempts, access by terminated employees, and unauthorized access to sensitive areas.", systemPortal: "Physical Access Control System", evidenceHint: "Physical access log review record showing review date and findings." },
      { stepNumber: 3, title: "Deploy CCTV for Additional Monitoring (if applicable)", instruction: "Consider deploying CCTV cameras at entry points to CUI areas to supplement badge access logs with video evidence. Retain video footage for at least 30 days.", systemPortal: "CCTV / Security Camera System", evidenceHint: "CCTV configuration documentation or screenshot of camera coverage." },
    ],
    evidenceRequirements: [
      { title: "Physical Access Log Sample", type: "Screenshot/Export", filename: "PE-3.10.4_Physical_Access_Log_YYYY-MM-DD.png", location: "Access control system", mustShow: "Date/time, user/badge, area accessed, access granted/denied" },
    ],
    testProcedures: [
      { name: "Physical Access Log Completeness Check", steps: "1. Review physical access log for the past 30 days.\n2. Confirm all badge access events are captured with date, time, and person.\n3. Verify logs are retained for the required period.", expectedResult: "Physical access logs are complete, current, and retained appropriately.", passCriteria: "Access log captures all access events. Retention meets requirements. Logs reviewed regularly." },
    ],
    closeoutChecklist: ["Physical access logging enabled", "Log retention configured (90+ days)", "Regular log review process established", "CCTV deployed (if applicable)", "Evidence uploaded", "SSP narrative updated"],
  },

  {
    controlId: "PE.L1-3.10.5",
    implementationApproach: `Control and manage physical access devices. Physical access devices (keys, access cards, PINs, biometric data) must be managed throughout their lifecycle: issuance, use, and revocation. Lost or stolen access devices must be deactivated immediately.\n\nFor Microsoft 365: Cloud access devices managed by Microsoft. For on-premises, maintain a registry of physical access credentials and have a documented process for issuance, revocation, and emergency deactivation.`,
    systemsUsed: ["Physical Access Control System", "Organization documentation"],
    steps: [
      { stepNumber: 1, title: "Maintain a Physical Access Device Registry", instruction: "Maintain a registry of all physical access devices issued: badge ID, employee name, access level, issue date, and return/revocation status.", systemPortal: "Physical Access Control System", evidenceHint: "Physical access device registry document or access control system report." },
      { stepNumber: 2, title: "Implement Immediate Revocation for Lost/Stolen Devices", instruction: "Create a procedure for immediately deactivating physical access credentials when lost or stolen. Document the response time requirement (e.g., within 1 hour of report).", systemPortal: "Physical Access Control System", evidenceHint: "Lost badge response procedure and records of past revocations." },
      { stepNumber: 3, title: "Revoke Access When Employment Changes", instruction: "Establish a process to revoke physical access credentials when employees terminate, change roles, or go on extended leave. Coordinate with HR for timely deactivation.", systemPortal: "HR system / Physical Access Control System", evidenceHint: "HR-to-IT access revocation process documentation and records of revocations." },
    ],
    evidenceRequirements: [
      { title: "Physical Access Device Registry", type: "Document/Spreadsheet", filename: "PE-3.10.5_Physical_Access_Device_Registry_YYYY-MM-DD.xlsx", location: "Organization-maintained", mustShow: "Badge/key ID, assigned employee, access level, issue date, return/revocation status" },
    ],
    testProcedures: [
      { name: "Physical Access Device Control Verification", steps: "1. Review access device registry for completeness.\n2. Attempt to use an access badge of a recently terminated employee — verify access is denied.\n3. Confirm lost badge response procedure is documented.", expectedResult: "Physical access devices are managed and revoked when appropriate.", passCriteria: "Registry complete. Terminated employee badges deactivated. Lost badge procedure documented." },
    ],
    closeoutChecklist: ["Physical access device registry maintained", "Immediate revocation procedure documented", "Termination/role change process connected to badge revocation", "Annual access review scheduled", "Evidence uploaded", "SSP narrative updated"],
  },

  {
    controlId: "PE.L2-3.10.2",
    implementationApproach: `Protect and monitor the physical facility and support infrastructure for organizational systems. The organization must protect physical facilities housing CUI systems from environmental hazards and unauthorized physical access. Monitor facilities for physical threats and unusual activity.\n\nFor Microsoft 365: Cloud infrastructure monitoring is handled by Microsoft. For on-premises facilities, implement environmental monitoring (temperature, humidity, power) and physical intrusion detection.`,
    systemsUsed: ["Physical Access Control System", "Environmental Monitoring System", "CCTV System"],
    steps: [
      { stepNumber: 1, title: "Implement Physical Intrusion Detection", instruction: "Deploy motion sensors, door/window sensors, or alarm systems in areas containing CUI systems. Configure alerts to notify security personnel immediately of unauthorized access attempts.", systemPortal: "Physical Security System", evidenceHint: "Physical intrusion detection configuration or alarm system documentation." },
      { stepNumber: 2, title: "Implement Environmental Monitoring", instruction: "Deploy environmental sensors in server rooms and areas with CUI infrastructure: temperature, humidity, water leak, and power failure sensors. Configure alerts for out-of-range conditions.", systemPortal: "Environmental Monitoring System", evidenceHint: "Screenshot of environmental monitoring dashboard or sensor configuration." },
      { stepNumber: 3, title: "Review Facility Monitoring Logs", instruction: "Periodically review facility monitoring logs: access control, CCTV footage, environmental sensor alerts. Document the review and any incidents identified.", systemPortal: "Physical Security / Environmental Monitoring systems", evidenceHint: "Facility monitoring review record with date and findings." },
    ],
    evidenceRequirements: [
      { title: "Physical Facility Monitoring Evidence", type: "Documentation/Photo", filename: "PE-3.10.2_Facility_Monitoring_YYYY-MM-DD.docx", location: "Organization-maintained", mustShow: "Intrusion detection, environmental monitoring, CCTV coverage, alert configuration" },
    ],
    testProcedures: [
      { name: "Facility Monitoring Verification", steps: "1. Test intrusion detection system — verify alarm triggers correctly.\n2. Check environmental monitoring dashboard — confirm all sensors are reporting.\n3. Review facility monitoring log for the past 30 days.", expectedResult: "Physical facilities are monitored for intrusion and environmental threats.", passCriteria: "Intrusion detection functional. Environmental monitoring active. Logs reviewed regularly." },
    ],
    closeoutChecklist: ["Physical intrusion detection deployed", "Environmental monitoring implemented", "Facility monitoring logs reviewed regularly", "Alert notification configured", "Evidence uploaded", "SSP narrative updated"],
  },

  {
    controlId: "PE.L2-3.10.6",
    implementationApproach: `Enforce safeguarding measures for CUI at alternate work sites. When employees work from alternate locations (home office, hotel, remote site), they must still protect CUI appropriately. The organization must have policies and procedures for CUI protection at alternate work sites.\n\nFor Microsoft 365: Remote work with CUI must use Conditional Access (compliant device, MFA), encrypted VPN if on-premises CUI is accessed, and follow CUI handling requirements (not working in public, screen privacy, etc.).`,
    systemsUsed: ["Microsoft Entra Admin Center", "Microsoft Intune Admin Center", "Organization documentation"],
    steps: [
      { stepNumber: 1, title: "Develop Alternate Work Site Security Policy", instruction: "Create a policy for employees working with CUI at alternate sites: secure workspace requirements (no public spaces), device requirements (managed device only), network requirements (VPN or approved network), and physical CUI handling.", systemPortal: "Organization documentation", evidenceHint: "Alternate work site (remote work) security policy document." },
      { stepNumber: 2, title: "Require Compliant Devices for Remote CUI Access", instruction: "Enforce Conditional Access requiring Intune-enrolled, compliant devices for all remote access to CUI systems. This ensures security controls are active at alternate work sites.", systemPortal: "Microsoft Entra Admin Center", navigationPath: "Protection > Conditional Access", evidenceHint: "Screenshot of Conditional Access policy requiring compliant device for remote access." },
      { stepNumber: 3, title: "Train Employees on Remote CUI Handling", instruction: "Provide specific training on protecting CUI while working remotely: don't work in public spaces, use privacy screens, lock computer when unattended, secure paper CUI, and report incidents promptly.", systemPortal: "Security Awareness Training Platform", evidenceHint: "Remote work CUI training module completion records." },
    ],
    evidenceRequirements: [
      { title: "Alternate Work Site Security Policy", type: "Document", filename: "PE-3.10.6_Alternate_Work_Site_Policy_YYYY-MM-DD.docx", location: "Organization-maintained", mustShow: "Physical requirements, device requirements, network requirements, CUI handling at remote locations" },
    ],
    testProcedures: [
      { name: "Remote Work CUI Protection Verification", steps: "1. Confirm alternate work site policy is documented and communicated.\n2. Verify Conditional Access requires compliant devices for remote access.\n3. Confirm employees received remote CUI handling training.", expectedResult: "Remote workers protect CUI per policy. Technical controls enforce requirements.", passCriteria: "Policy documented. Conditional Access enforces compliant devices. Training completed." },
    ],
    closeoutChecklist: ["Alternate work site security policy documented", "Compliant device requirement enforced for remote access", "Remote CUI handling training completed", "Evidence uploaded", "SSP narrative updated"],
  },

  // ── PERSONNEL SECURITY ──────────────────────────────────────────────────

  {
    controlId: "PS.L2-3.9.1",
    implementationApproach: `Screen individuals prior to authorizing access to organizational systems containing CUI. Background checks must be conducted on employees and contractors before granting access to CUI systems. The extent of screening should be commensurate with the sensitivity of the CUI.\n\nFor Microsoft 365: Establish a background check requirement as part of the hiring and contractor onboarding process. Document background check results and link to system access provisioning.`,
    systemsUsed: ["HR System", "Background Check Service", "Organization documentation"],
    steps: [
      { stepNumber: 1, title: "Establish Background Check Requirements", instruction: "Define and document background check requirements for all personnel with CUI access: employment history verification, criminal record check, identity verification, and professional reference check. Include contractors and vendors.", systemPortal: "Organization documentation", evidenceHint: "Personnel security policy with background check requirements." },
      { stepNumber: 2, title: "Implement Background Check Process", instruction: "Implement a process requiring completed background checks before system access is provisioned. HR or the security team must confirm background check clearance before IT provisions CUI access.", systemPortal: "HR System / Background Check Service", evidenceHint: "Background check completion records (de-identified or confirmation from HR) and access provisioning workflow." },
      { stepNumber: 3, title: "Re-Screen Periodically or on Position Change", instruction: "Define whether periodic re-screening is required and when (e.g., every 5 years or upon significant role change). Document re-screening results.", systemPortal: "Organization documentation / HR System", evidenceHint: "Re-screening policy and records of periodic background checks." },
    ],
    evidenceRequirements: [
      { title: "Personnel Security Policy", type: "Document", filename: "PS-3.9.1_Personnel_Security_Policy_YYYY-MM-DD.docx", location: "Organization-maintained", mustShow: "Background check requirements, scope (employees/contractors), timing (pre-access), re-screening policy" },
      { title: "Background Check Completion Confirmation", type: "HR Attestation", filename: "PS-3.9.1_Background_Check_Completion_YYYY-MM-DD.docx", location: "HR records", mustShow: "Confirmation that background checks are completed before CUI access is provisioned (de-identified)" },
    ],
    testProcedures: [
      { name: "Background Check Process Verification", steps: "1. Review HR records to confirm background checks are completed before CUI access is provisioned.\n2. Verify the process prevents access provisioning without background check clearance.\n3. Confirm re-screening policy is documented.", expectedResult: "All personnel with CUI access have completed background checks.", passCriteria: "Background check process documented. Access not provisioned without clearance. Records maintained." },
    ],
    closeoutChecklist: ["Background check requirements defined", "Pre-access screening process implemented", "HR-IT access provisioning linked to background check", "Re-screening policy documented", "Evidence uploaded", "SSP narrative updated"],
  },

  {
    controlId: "PS.L2-3.9.2",
    implementationApproach: `Ensure that CUI is protected during and after personnel actions such as terminations and transfers. When employees leave or change roles, their access to CUI must be promptly revoked and any CUI they held must be returned or transferred appropriately. The separation process must include CUI access termination.\n\nFor Microsoft 365: Implement an offboarding checklist that includes Entra ID account disabling, email forwarding removal, OneDrive data transfer, and verification of CUI return.`,
    systemsUsed: ["Microsoft Entra Admin Center", "Microsoft Intune Admin Center", "HR System"],
    steps: [
      { stepNumber: 1, title: "Develop a Personnel Offboarding Checklist", instruction: "Create a comprehensive offboarding checklist for personnel terminations and significant role changes, including: disable Entra ID account, revoke all access, retrieve managed devices, recover CUI from personal storage, and remove from CUI distribution lists.", systemPortal: "Organization documentation", evidenceHint: "Personnel offboarding checklist document." },
      { stepNumber: 2, title: "Disable Accounts Immediately on Termination", instruction: "Establish a process to disable the departing employee's Entra ID account within 1 hour of separation notification (or before if possible). Revoke all active sessions.", systemPortal: "Microsoft Entra Admin Center", navigationPath: "Identity > Users > select user > Block sign-in > Yes", recommendedSetting: "Account disabled within 1 hour of separation. Sessions revoked immediately.", evidenceHint: "Screenshot of account block for a terminated employee or audit log of account disabling." },
      { stepNumber: 3, title: "Recover or Transfer CUI and Managed Devices", instruction: "Recover CUI documents, credentials, and managed devices from departing employees. Transfer OneDrive content to a manager. Ensure no CUI remains on personal devices.", systemPortal: "Microsoft 365 Admin Center / Intune", navigationPath: "M365 Admin > Users > select user > Manage OneDrive", evidenceHint: "OneDrive transfer confirmation and device wipe record for returned devices." },
    ],
    evidenceRequirements: [
      { title: "Completed Offboarding Checklist", type: "Document", filename: "PS-3.9.2_Offboarding_Checklist_YYYY-MM-DD.docx", location: "HR records", mustShow: "All checklist items checked off including access revocation, device recovery, CUI transfer" },
      { title: "Account Disable Audit Log", type: "Screenshot", filename: "PS-3.9.2_Account_Disable_Log_YYYY-MM-DD.png", location: "Entra > Audit logs", mustShow: "Account disabled event with date, time, and actor" },
    ],
    testProcedures: [
      { name: "Offboarding Process Verification", steps: "1. Review 3 recent termination cases.\n2. Confirm accounts were disabled within 1 hour of separation.\n3. Confirm managed devices were recovered or remotely wiped.\n4. Confirm offboarding checklist was completed for each.", expectedResult: "CUI access is revoked promptly on personnel departure.", passCriteria: "Accounts disabled within 1 hour. Devices recovered/wiped. Offboarding checklist completed." },
    ],
    closeoutChecklist: ["Offboarding checklist developed", "Immediate account disabling process established", "Device recovery process implemented", "CUI return/transfer process documented", "HR-IT offboarding coordination established", "Evidence uploaded", "SSP narrative updated"],
  },

  // ── RISK ASSESSMENT (remaining) ─────────────────────────────────────────

  {
    controlId: "RA.L2-3.11.1",
    implementationApproach: `Periodically assess the risk to organizational operations, organizational assets, and individuals, resulting from the operation of organizational systems and the associated processing, storage, or transmission of CUI. A formal risk assessment must be conducted at least annually and whenever significant changes occur.\n\nFor Microsoft 365: Conduct an annual risk assessment covering all CMMC-scoped systems. Use Microsoft Compliance Manager's risk score as a supporting input. Document the risk assessment methodology, findings, and treatment decisions.`,
    systemsUsed: ["Microsoft Purview Portal", "Organization documentation"],
    steps: [
      { stepNumber: 1, title: "Develop a Risk Assessment Methodology", instruction: "Define the risk assessment methodology: how threats and vulnerabilities are identified, how likelihood and impact are rated (qualitative or quantitative), and how risk scores are calculated. Reference NIST SP 800-30.", systemPortal: "Organization documentation", evidenceHint: "Risk assessment methodology document." },
      { stepNumber: 2, title: "Conduct Annual Risk Assessment", instruction: "Perform a comprehensive annual risk assessment covering all CUI systems: identify threats, vulnerabilities, existing controls, likelihood of exploitation, and potential impact. Document all findings.", systemPortal: "Organization documentation / Risk Assessment Tool", expectedResult: "Annual risk assessment is documented with all required elements.", evidenceHint: "Annual risk assessment report with date, scope, methodology, findings, and risk ratings." },
      { stepNumber: 3, title: "Document Risk Treatment Decisions", instruction: "For each identified risk, document the treatment decision: accept, mitigate, transfer, or avoid. For accepted risks, document the justification. For mitigation decisions, link to the POA&M.", systemPortal: "Organization documentation / Control HUB", evidenceHint: "Risk register or risk treatment log with decisions for each identified risk." },
    ],
    evidenceRequirements: [
      { title: "Annual Risk Assessment Report", type: "Document", filename: "RA-3.11.1_Risk_Assessment_Report_YYYY-MM-DD.docx", location: "Organization-maintained", mustShow: "Scope, methodology, threats/vulnerabilities identified, risk ratings, treatment decisions, date" },
      { title: "Risk Register", type: "Document/Spreadsheet", filename: "RA-3.11.1_Risk_Register_YYYY-MM-DD.xlsx", location: "Organization-maintained", mustShow: "Risk description, likelihood, impact, risk rating, treatment, owner, status" },
    ],
    testProcedures: [
      { name: "Risk Assessment Currency and Quality Check", steps: "1. Confirm risk assessment was conducted within the last 12 months.\n2. Verify the assessment covers all in-scope CUI systems.\n3. Confirm risk treatment decisions are documented for all identified risks.\n4. Verify risks in POA&M align with risk assessment findings.", expectedResult: "Annual risk assessment is current, comprehensive, and linked to treatment decisions.", passCriteria: "Assessment within 12 months. All systems covered. Treatment decisions documented. Aligned with POA&M." },
    ],
    closeoutChecklist: ["Risk assessment methodology documented", "Annual risk assessment completed", "Risk register maintained", "Risk treatment decisions documented", "Risks linked to POA&M", "Evidence uploaded", "SSP narrative updated"],
  },

  {
    controlId: "RA.L2-3.11.3",
    implementationApproach: `Remediate vulnerabilities in accordance with risk assessments. Once vulnerabilities are identified through scanning or assessment, they must be remediated within timeframes commensurate with their risk level. High-risk vulnerabilities require faster remediation than low-risk ones. The remediation process must be documented and tracked.\n\nFor Microsoft 365: Use Defender Vulnerability Management recommendations with defined SLAs. Track remediation in POA&M for delayed items. Document risk acceptance for vulnerabilities not remediated within SLA.`,
    systemsUsed: ["Microsoft Defender Portal", "Control HUB POA&M module", "Microsoft Intune Admin Center"],
    steps: [
      { stepNumber: 1, title: "Define Vulnerability Remediation SLAs by Risk Level", instruction: "Document vulnerability remediation SLAs based on risk level: Critical: 15 days, High: 30 days, Medium: 90 days, Low: 180 days. Get management approval for the SLAs.", systemPortal: "Organization documentation", evidenceHint: "Vulnerability management policy with remediation SLA definitions." },
      { stepNumber: 2, title: "Track Remediation Against SLAs", instruction: "Use Defender Vulnerability Management to track vulnerability remediation progress against the defined SLAs. Identify and escalate vulnerabilities approaching or past their SLA deadline.", systemPortal: "Microsoft Defender Portal", navigationPath: "Vulnerability management > Recommendations", expectedResult: "All vulnerabilities have remediation in progress within their SLA.", evidenceHint: "Screenshot of vulnerability recommendations with remediation status and deadlines." },
      { stepNumber: 3, title: "Create POA&M for Delayed Remediation", instruction: "For vulnerabilities that cannot be remediated within the SLA, create a POA&M entry documenting: risk justification, compensating controls, and revised remediation date.", systemPortal: "Control HUB POA&M module", evidenceHint: "POA&M entries for delayed vulnerability remediations." },
    ],
    evidenceRequirements: [
      { title: "Vulnerability Remediation SLA Policy", type: "Document", filename: "RA-3.11.3_Vuln_Remediation_SLA_YYYY-MM-DD.docx", location: "Organization-maintained", mustShow: "Remediation SLA by severity level, approval signatures" },
      { title: "Remediation Tracking Evidence", type: "Screenshot", filename: "RA-3.11.3_Remediation_Tracking_YYYY-MM-DD.png", location: "Defender > Vulnerability management", mustShow: "Open vulnerabilities, severity, days open, remediation status" },
    ],
    testProcedures: [
      { name: "Remediation SLA Compliance Check", steps: "1. Pull vulnerability remediation report.\n2. Identify any Critical or High vulnerabilities.\n3. Confirm each is being remediated within the SLA.\n4. For any past-SLA vulnerabilities, verify a POA&M entry exists.", expectedResult: "Vulnerabilities are remediated within defined SLAs. Delays are tracked in POA&M.", passCriteria: "SLAs defined. No Critical vulnerabilities past SLA without POA&M. Remediation tracked." },
    ],
    closeoutChecklist: ["Vulnerability remediation SLAs defined and documented", "Remediation tracking implemented in Defender", "POA&M entries for delayed remediations", "Escalation process for overdue items documented", "Evidence uploaded", "SSP narrative updated"],
  },

  // ── SYSTEM & COMMUNICATIONS PROTECTION ─────────────────────────────────

  {
    controlId: "SC.L1-3.13.1",
    implementationApproach: `Monitor, control, and protect communications (i.e., information transmitted or received by organizational systems) at the external boundaries and key internal boundaries of the systems. Network traffic at system boundaries must be monitored and controlled — typically through firewalls, intrusion detection/prevention systems, and network security monitoring.\n\nFor Microsoft 365: Use Microsoft Defender for Endpoint and Defender for Cloud Apps for boundary monitoring. Use perimeter firewalls and network security groups to control boundary traffic.`,
    systemsUsed: ["Firewall / Network Console", "Microsoft Defender Portal", "Microsoft Defender for Cloud Apps"],
    steps: [
      { stepNumber: 1, title: "Implement and Configure Perimeter Firewall", instruction: "Deploy and configure a perimeter firewall to control all inbound and outbound communications at the external boundary. Use a default-deny policy with explicit allow rules.", systemPortal: "Firewall / Network Console", recommendedSetting: "Default-deny inbound and outbound. Allow only explicitly authorized traffic.", evidenceHint: "Firewall rule set screenshot showing boundary protection configuration." },
      { stepNumber: 2, title: "Enable Microsoft Defender for Endpoint Network Protection", instruction: "Enable Network Protection in Defender for Endpoint to monitor and control network traffic at the endpoint level, blocking connections to malicious destinations.", systemPortal: "Microsoft Intune Admin Center", navigationPath: "Endpoint security > Attack surface reduction", evidenceHint: "Screenshot of Network Protection enabled in Intune policy." },
      { stepNumber: 3, title: "Monitor External Boundary Traffic", instruction: "Configure logging and monitoring for all traffic crossing the external boundary. Review logs weekly for anomalous patterns: unusual outbound volumes, connections to unexpected destinations.", systemPortal: "Firewall / Network Console", expectedResult: "All external boundary traffic is logged and monitored.", evidenceHint: "Firewall log review record or monitoring alert configuration." },
    ],
    evidenceRequirements: [
      { title: "Firewall Boundary Protection Configuration", type: "Screenshot", filename: "SC-3.13.1_Firewall_Boundary_Config_YYYY-MM-DD.png", location: "Firewall management console", mustShow: "Default-deny policy, explicit allow rules, logging enabled" },
    ],
    testProcedures: [
      { name: "Boundary Protection Verification", steps: "1. Review firewall rules to confirm default-deny with explicit allows.\n2. Attempt an unauthorized connection through the boundary — verify it is blocked.\n3. Confirm boundary traffic is being logged.", expectedResult: "External boundary communications are monitored and controlled.", passCriteria: "Default-deny configured. Boundary traffic logged. Network Protection enabled on endpoints." },
    ],
    closeoutChecklist: ["Perimeter firewall configured with default-deny", "Network Protection enabled on endpoints", "Boundary traffic logging enabled", "Traffic monitoring established", "Evidence uploaded", "SSP narrative updated"],
  },

  {
    controlId: "SC.L1-3.13.5",
    implementationApproach: `Implement subnetworks for publicly accessible system components that are separated from internal networks. Public-facing services must be in a DMZ (demilitarized zone) or separate network segment, isolated from the internal network where CUI systems reside. This prevents attackers who compromise a public-facing server from directly accessing CUI.\n\nFor Microsoft 365: Public-facing web applications should be hosted in a DMZ or a cloud provider's infrastructure. CUI systems must be on a separate, protected network segment.`,
    systemsUsed: ["Firewall / Network Console", "Azure Networking (if applicable)"],
    steps: [
      { stepNumber: 1, title: "Implement DMZ for Public-Facing Services", instruction: "Ensure public-facing servers (web servers, email gateways, VPN concentrators) are in a DMZ network segment separated from the internal CUI network by a firewall. The DMZ should be accessible from the internet but isolated from internal systems.", systemPortal: "Firewall / Network Console", expectedResult: "Public-facing servers are in DMZ, isolated from internal CUI network.", evidenceHint: "Network diagram showing DMZ, public-facing servers, internal network, and firewall separation." },
      { stepNumber: 2, title: "Configure Firewall Rules Between DMZ and Internal Network", instruction: "Create firewall rules controlling traffic between the DMZ and internal network. Limit DMZ-to-internal access to only required protocols and destinations (no broad access).", systemPortal: "Firewall / Network Console", recommendedSetting: "DMZ systems cannot initiate connections to internal CUI systems unless specifically required.", evidenceHint: "Firewall rules between DMZ and internal network zones." },
    ],
    evidenceRequirements: [
      { title: "Network Segmentation Architecture", type: "Diagram/Document", filename: "SC-3.13.5_Network_Segmentation_YYYY-MM-DD.png", location: "Organization-maintained", mustShow: "Internet, DMZ, internal CUI network, firewall separation between zones" },
      { title: "DMZ-to-Internal Firewall Rules", type: "Screenshot", filename: "SC-3.13.5_DMZ_Firewall_Rules_YYYY-MM-DD.png", location: "Firewall management console", mustShow: "Intra-zone rules limiting DMZ to internal access to required traffic only" },
    ],
    testProcedures: [
      { name: "Network Segmentation Verification", steps: "1. Attempt to connect from a DMZ system to an internal CUI system on an unauthorized port.\n2. Verify the connection is blocked by the firewall.\n3. Confirm the network diagram accurately reflects the current architecture.", expectedResult: "DMZ is properly isolated from the internal CUI network.", passCriteria: "DMZ systems cannot access internal CUI systems without explicit firewall allowance." },
    ],
    closeoutChecklist: ["DMZ implemented for public-facing services", "Firewall rules between DMZ and internal network configured", "Network segmentation diagram created", "Segmentation verified by testing", "Evidence uploaded", "SSP narrative updated"],
  },

  {
    controlId: "SC.L2-3.13.2",
    implementationApproach: `Employ architectural designs, software development techniques, and systems engineering principles that promote information security within organizational systems. Security must be designed into systems from the start, not bolted on. Use security design principles: defense in depth, least privilege, fail secure, economy of mechanism.\n\nFor Microsoft 365: Document the security architecture decisions for your Microsoft 365 implementation. Use the Microsoft 365 Security Benchmark as a design reference.`,
    systemsUsed: ["Organization documentation", "Microsoft Purview Portal"],
    steps: [
      { stepNumber: 1, title: "Document the Security Architecture", instruction: "Create a security architecture document describing how security principles are incorporated in the design of CUI systems: defense in depth layers, network segmentation, identity architecture, data protection, and monitoring.", systemPortal: "Organization documentation", evidenceHint: "Security architecture document or diagram showing layered security controls." },
      { stepNumber: 2, title: "Apply Security Design Principles to System Changes", instruction: "Require security review of all significant system changes. Verify that security design principles (least privilege, fail secure, defense in depth) are maintained when new systems or features are added.", systemPortal: "Change management process", evidenceHint: "Security impact analysis forms from recent changes showing security principles applied." },
    ],
    evidenceRequirements: [
      { title: "Security Architecture Document", type: "Document/Diagram", filename: "SC-3.13.2_Security_Architecture_YYYY-MM-DD.docx", location: "Organization-maintained", mustShow: "Defense in depth layers, network security zones, identity and access architecture, data protection design" },
    ],
    testProcedures: [
      { name: "Security Architecture Review", steps: "1. Review security architecture document for completeness.\n2. Confirm defense in depth is implemented (multiple security layers).\n3. Verify security architecture is updated when significant changes are made.", expectedResult: "Security architecture is designed using security engineering principles.", passCriteria: "Security architecture documented. Defense in depth demonstrated. Architecture updated for changes." },
    ],
    closeoutChecklist: ["Security architecture document created", "Security design principles documented", "Security review process for system changes established", "Evidence uploaded", "SSP narrative updated"],
  },

  {
    controlId: "SC.L2-3.13.3",
    implementationApproach: `Separate user functionality from system management functionality. Administrative interfaces and user interfaces must be separated — users should not be able to access administrative functions. Admin portals should be accessible only from specific networks or with privileged accounts.\n\nFor Microsoft 365: The Microsoft 365 Admin Center and Entra Admin Center are separate from the standard user interface. Enforce this separation with Conditional Access.`,
    systemsUsed: ["Microsoft Entra Admin Center", "Microsoft Intune Admin Center"],
    steps: [
      { stepNumber: 1, title: "Verify Admin and User Interfaces Are Separated", instruction: "Confirm that administrative portals (M365 Admin Center, Entra Admin Center, Intune) require admin roles and cannot be accessed by standard users.", systemPortal: "Microsoft 365 Admin Center", expectedResult: "Standard users receive 'Access denied' when attempting to access admin portals.", evidenceHint: "Screenshot showing standard user access denied to M365 Admin Center." },
      { stepNumber: 2, title: "Restrict Admin Portal Access to Privileged Accounts", instruction: "Configure Conditional Access to restrict access to admin portals to named admin accounts only. Standard user accounts should be blocked from admin portal URLs.", systemPortal: "Microsoft Entra Admin Center", navigationPath: "Protection > Conditional Access", evidenceHint: "Screenshot of CA policy restricting admin portal access to admin accounts." },
    ],
    evidenceRequirements: [
      { title: "Admin/User Interface Separation Evidence", type: "Screenshot", filename: "SC-3.13.3_Admin_User_Separation_YYYY-MM-DD.png", location: "M365 Admin or Entra", mustShow: "Standard user account denied access to admin interface" },
    ],
    testProcedures: [
      { name: "Admin/User Separation Test", steps: "1. Attempt to access M365 Admin Center with a standard user account.\n2. Verify access is denied.\n3. Confirm admin account can access the admin portal.", expectedResult: "Admin portals are accessible only to accounts with admin roles.", passCriteria: "Standard users denied admin portal access. Admin accounts have access." },
    ],
    closeoutChecklist: ["Admin and user interface separation verified", "Conditional Access restricts admin portal to admin accounts", "Evidence uploaded", "SSP narrative updated"],
  },

  {
    controlId: "SC.L2-3.13.4",
    implementationApproach: `Prevent unauthorized and unintended information transfer via shared system resources. Residual information from one process/user must not be accessible to another unauthorized process/user. This addresses shared memory, temp file residuals, and cross-process information leakage.\n\nFor Microsoft 365: Microsoft's multi-tenant architecture ensures tenant isolation. On Windows devices, standard OS memory management prevents cross-process information leakage. Ensure CUI is not stored in shared temp locations.`,
    systemsUsed: ["Microsoft Intune Admin Center", "Organization documentation"],
    steps: [
      { stepNumber: 1, title: "Document Shared Resource Security Controls", instruction: "Document the technical controls in place to prevent information transfer via shared system resources: OS memory protection, browser session isolation, temp file clearing, and tenant isolation for cloud services.", systemPortal: "Organization documentation", evidenceHint: "Shared resource security controls documentation." },
      { stepNumber: 2, title: "Configure Browser to Clear Session Data", instruction: "Configure managed browsers (Microsoft Edge) to clear browsing data (cookies, cache, temp files) at the end of each session. This prevents CUI residuals in shared browser sessions.", systemPortal: "Microsoft Intune Admin Center", navigationPath: "Devices > Configuration profiles > Microsoft Edge settings", recommendedSetting: "Clear browsing data on browser close. Disable history and form autofill for CUI-related sites.", evidenceHint: "Screenshot of Edge browser policy showing clear-on-close settings." },
    ],
    evidenceRequirements: [
      { title: "Shared Resource Controls Documentation", type: "Document", filename: "SC-3.13.4_Shared_Resource_Controls_YYYY-MM-DD.docx", location: "Organization-maintained", mustShow: "OS memory protection, browser session clearing, temp file management, tenant isolation" },
    ],
    testProcedures: [
      { name: "Shared Resource Isolation Verification", steps: "1. Verify browser clear-on-close policy is applied.\n2. Open a CUI document in a browser session, close the browser, reopen and confirm CUI is not accessible from history.\n3. Confirm Microsoft 365 tenant isolation prevents cross-tenant data access.", expectedResult: "Shared system resources do not leak CUI between sessions or processes.", passCriteria: "Browser clears session data on close. Tenant isolation confirmed." },
    ],
    closeoutChecklist: ["Shared resource controls documented", "Browser session clearing configured", "Tenant isolation verified", "Evidence uploaded", "SSP narrative updated"],
  },

  {
    controlId: "SC.L2-3.13.6",
    implementationApproach: `Implement cryptographic mechanisms to prevent unauthorized disclosure of CUI during transmission unless otherwise protected by alternative physical safeguards. All CUI transmitted over networks must be encrypted. This applies to internal network transmissions as well as external.\n\nFor Microsoft 365: TLS 1.2+ is used for all Microsoft 365 transmissions. For internal network transmissions, use IPsec or TLS to encrypt traffic containing CUI.`,
    systemsUsed: ["Microsoft 365 Admin Center", "Network / VPN Solution"],
    steps: [
      { stepNumber: 1, title: "Verify TLS for All Microsoft 365 Transmissions", instruction: "Confirm Microsoft 365 tenant uses TLS 1.2 minimum for all email, SharePoint, Teams, and other service transmissions. Check connector settings for external email.", systemPortal: "Microsoft Exchange Admin Center", navigationPath: "Mail flow > Connectors", evidenceHint: "Screenshot confirming TLS enforcement on all mail connectors." },
      { stepNumber: 2, title: "Encrypt Internal CUI Transmissions", instruction: "For internal network transmissions containing CUI, ensure traffic is encrypted using IPsec, TLS, or equivalent. Do not transmit CUI over unencrypted internal network segments.", systemPortal: "Network / Firewall / IPsec configuration", evidenceHint: "IPsec policy or internal TLS configuration documentation." },
      { stepNumber: 3, title: "Document Encryption Standards for CUI Transmission", instruction: "Document the approved encryption algorithms and protocols for CUI transmission: TLS 1.2+ for web traffic, AES-256 for VPN, IPsec for internal network encryption.", systemPortal: "Organization documentation", evidenceHint: "CUI transmission encryption standard document." },
    ],
    evidenceRequirements: [
      { title: "CUI Transmission Encryption Configuration", type: "Screenshot/Document", filename: "SC-3.13.6_CUI_Transmission_Encryption_YYYY-MM-DD.png", location: "Exchange, Network console, or documentation", mustShow: "TLS version, encryption algorithms, scope of protection" },
    ],
    testProcedures: [
      { name: "CUI Transmission Encryption Verification", steps: "1. Use a packet capture tool to sample internal network traffic from a CUI workstation.\n2. Verify captured traffic is encrypted (no plaintext CUI visible).\n3. Confirm TLS 1.2+ is enforced for all external transmissions.", expectedResult: "All CUI transmissions are encrypted in transit.", passCriteria: "No plaintext CUI in network captures. TLS 1.2+ enforced. Encryption standard documented." },
    ],
    closeoutChecklist: ["TLS enforced for all Microsoft 365 transmissions", "Internal network CUI transmissions encrypted", "Encryption standard documented", "Legacy protocols (TLS 1.0/1.1) disabled", "Evidence uploaded", "SSP narrative updated"],
  },

  {
    controlId: "SC.L2-3.13.7",
    implementationApproach: `Prevent remote devices from simultaneously connecting to the system and to resources in other environments (i.e., split tunneling). Split tunneling allows a device to simultaneously access the corporate VPN and the public internet directly, potentially allowing malware from the internet to reach CUI systems or data to leak through the public interface.\n\nFor Microsoft 365: Disable VPN split tunneling for connections to CUI systems. Force all traffic through the VPN when connected to corporate resources.`,
    systemsUsed: ["VPN / Remote Access Solution"],
    steps: [
      { stepNumber: 1, title: "Disable Split Tunneling in VPN Configuration", instruction: "Configure VPN settings to route all traffic through the corporate VPN tunnel when connected, eliminating split tunneling. Verify the VPN client enforces full-tunnel mode.", systemPortal: "VPN Management Console", recommendedSetting: "Full tunnel mode: all traffic routes through VPN. No direct internet access when VPN connected.", evidenceHint: "VPN configuration screenshot showing split tunneling disabled / full tunnel mode." },
      { stepNumber: 2, title: "Verify Full Tunnel Enforcement", instruction: "Test that when a device is connected to VPN, all internet traffic also routes through the VPN. Use traceroute or IP lookup to confirm the public IP matches the VPN exit IP.", systemPortal: "VPN Client / Test", expectedResult: "All traffic routes through VPN. No split tunneling possible.", evidenceHint: "IP address verification showing VPN IP when connected (not ISP IP)." },
    ],
    evidenceRequirements: [
      { title: "VPN Full Tunnel Configuration", type: "Screenshot", filename: "SC-3.13.7_VPN_Full_Tunnel_Config_YYYY-MM-DD.png", location: "VPN management console", mustShow: "Split tunneling disabled, full tunnel mode configured" },
    ],
    testProcedures: [
      { name: "Split Tunneling Disabled Verification", steps: "1. Connect to VPN.\n2. Check public IP — verify it shows VPN server IP, not local ISP IP.\n3. Verify internet traffic routes through VPN (traceroute shows VPN gateway).", expectedResult: "No split tunneling. All traffic routes through VPN when connected.", passCriteria: "Public IP matches VPN server. No direct internet access when VPN connected." },
    ],
    closeoutChecklist: ["Split tunneling disabled in VPN configuration", "Full tunnel enforcement verified", "VPN policy documented", "Evidence uploaded", "SSP narrative updated"],
  },

  {
    controlId: "SC.L2-3.13.8",
    implementationApproach: `Implement cryptographic mechanisms to prevent unauthorized disclosure of CUI during transmission unless otherwise protected by alternative physical safeguards. (Similar to SC.L2-3.13.6, focused on implementation of cryptographic mechanisms.) Ensure FIPS-validated cryptographic algorithms are used for CUI protection.\n\nFor Microsoft 365: Microsoft 365 uses FIPS 140-2 validated cryptographic modules. Configure Windows devices for FIPS mode if required by your contracting requirements.`,
    systemsUsed: ["Microsoft 365 Admin Center", "Microsoft Intune Admin Center"],
    steps: [
      { stepNumber: 1, title: "Verify FIPS-Validated Cryptography in Microsoft 365", instruction: "Review Microsoft's documentation confirming Microsoft 365 uses FIPS 140-2 validated cryptographic modules for data transmission and storage.", systemPortal: "Microsoft documentation", evidenceHint: "Link or copy of Microsoft's FIPS compliance documentation for Microsoft 365." },
      { stepNumber: 2, title: "Enable FIPS Mode on Windows Devices (if required)", instruction: "If your contracts specifically require FIPS mode, configure Windows FIPS compliance policy via Intune or Group Policy. Note: enabling FIPS mode can break some applications — test thoroughly before deploying.", systemPortal: "Microsoft Intune Admin Center", navigationPath: "Devices > Configuration profiles > Settings catalog > Local Policies Security Options > FIPS", evidenceHint: "Screenshot of FIPS mode configuration in Intune (if required)." },
      { stepNumber: 3, title: "Document Cryptographic Algorithm Standards", instruction: "Document the cryptographic algorithms used in your environment for CUI protection: AES-256 for encryption at rest, TLS 1.2+ (AES-256) for transmission, SHA-256+ for hashing.", systemPortal: "Organization documentation", evidenceHint: "Cryptographic algorithm standard document." },
    ],
    evidenceRequirements: [
      { title: "Cryptographic Standards Documentation", type: "Document", filename: "SC-3.13.8_Crypto_Standards_YYYY-MM-DD.docx", location: "Organization-maintained", mustShow: "Approved algorithms, FIPS validation reference, usage context (transmission/storage)" },
    ],
    testProcedures: [
      { name: "Cryptographic Implementation Verification", steps: "1. Verify Microsoft 365 FIPS documentation covers your data.\n2. Confirm cryptographic algorithm standard is documented.\n3. Verify TLS version and cipher suites on external-facing endpoints.", expectedResult: "FIPS-validated cryptography is used for CUI protection.", passCriteria: "Microsoft 365 FIPS compliance documented. Algorithm standards defined. TLS 1.2+ with strong ciphers." },
    ],
    closeoutChecklist: ["FIPS validation for Microsoft 365 documented", "Cryptographic algorithm standards documented", "FIPS mode configured (if required by contract)", "Evidence uploaded", "SSP narrative updated"],
  },

  {
    controlId: "SC.L2-3.13.9",
    implementationApproach: `Terminate network connections associated with communications sessions after a defined period of inactivity or at the end of a session. Network connections should not remain active indefinitely after a user is done. Session termination reduces the window for session hijacking attacks.\n\nFor Microsoft 365: Configure idle session timeout for Microsoft 365 web apps. Configure VPN session timeouts. Configure Conditional Access sign-in frequency.`,
    systemsUsed: ["Microsoft Entra Admin Center", "Microsoft 365 Admin Center", "VPN / Network Console"],
    steps: [
      { stepNumber: 1, title: "Configure Microsoft 365 Idle Session Timeout", instruction: "Enable idle session timeout in Microsoft 365 Admin Center for web app sessions. Sessions that are idle for the defined period will be terminated.", systemPortal: "Microsoft 365 Admin Center", navigationPath: "Settings > Org settings > Security & privacy > Idle session timeout", recommendedSetting: "Idle timeout: 1 hour for standard users, 30 minutes for admin sessions.", evidenceHint: "Screenshot of M365 idle session timeout configuration." },
      { stepNumber: 2, title: "Configure VPN Session Timeout", instruction: "Configure VPN session timeouts to terminate idle or long-running sessions. Define maximum session length and idle timeout.", systemPortal: "VPN Management Console", recommendedSetting: "Max session: 8 hours. Idle timeout: 30 minutes.", evidenceHint: "VPN session timeout configuration screenshot." },
    ],
    evidenceRequirements: [
      { title: "Session Timeout Configuration", type: "Screenshot", filename: "SC-3.13.9_Session_Timeout_Config_YYYY-MM-DD.png", location: "M365 Admin and VPN console", mustShow: "Timeout duration, scope (all users/web apps), enabled status" },
    ],
    testProcedures: [
      { name: "Session Timeout Verification", steps: "1. Leave a Microsoft 365 web session idle for the configured timeout period.\n2. Verify the session is terminated and re-authentication is required.\n3. Verify VPN session terminates after idle timeout.", expectedResult: "Idle network sessions are terminated after defined timeout period.", passCriteria: "M365 session timeout active. VPN idle timeout configured. Sessions terminate correctly." },
    ],
    closeoutChecklist: ["M365 idle session timeout configured", "VPN session timeout configured", "Admin session timeout stricter than user sessions", "Session timeout policy documented", "Evidence uploaded", "SSP narrative updated"],
  },

  {
    controlId: "SC.L2-3.13.10",
    implementationApproach: `Establish and manage cryptographic keys for cryptography employed in organizational systems. Cryptographic keys used to protect CUI must be managed throughout their lifecycle: generation, storage, distribution, rotation, and destruction. Poor key management can undermine even strong encryption.\n\nFor Microsoft 365: Microsoft manages encryption keys by default. For customer-managed keys, use Azure Key Vault. Document your key management approach.`,
    systemsUsed: ["Microsoft Azure Key Vault (if applicable)", "Microsoft Purview Portal"],
    steps: [
      { stepNumber: 1, title: "Document Cryptographic Key Management Approach", instruction: "Document how encryption keys used for CUI protection are managed: who generates them, where they are stored, how long they are valid, how they are rotated, and how they are destroyed.", systemPortal: "Organization documentation", evidenceHint: "Key management policy document." },
      { stepNumber: 2, title: "Review Microsoft 365 Key Management (Default)", instruction: "If using Microsoft-managed keys (default), document Microsoft's key management practices from their documentation. Understand that Microsoft manages key generation, rotation, and destruction.", systemPortal: "Microsoft documentation / Purview Portal", evidenceHint: "Reference to Microsoft key management documentation or screenshot of encryption key settings in Purview." },
      { stepNumber: 3, title: "Configure Customer-Managed Keys (if required)", instruction: "If regulatory requirements demand customer-managed keys, configure Double Key Encryption or Customer Key in Microsoft Purview. Store master keys in Azure Key Vault with access controlled by authorized personnel only.", systemPortal: "Microsoft Purview Portal / Azure Key Vault", evidenceHint: "Screenshot of Customer Key or Double Key Encryption configuration if implemented." },
    ],
    evidenceRequirements: [
      { title: "Key Management Policy/Documentation", type: "Document", filename: "SC-3.13.10_Key_Management_Policy_YYYY-MM-DD.docx", location: "Organization-maintained", mustShow: "Key generation, storage, rotation schedule, destruction process, authorized key custodians" },
    ],
    testProcedures: [
      { name: "Key Management Documentation Review", steps: "1. Confirm key management policy is documented.\n2. Verify key custodians are named and authorized.\n3. Confirm key rotation schedule is defined and being followed.", expectedResult: "Cryptographic keys are managed per a documented lifecycle policy.", passCriteria: "Key management policy documented. Key custodians named. Rotation schedule defined." },
    ],
    closeoutChecklist: ["Key management policy documented", "Key custodians designated", "Key rotation schedule established", "Key destruction procedure documented", "Evidence uploaded", "SSP narrative updated"],
  },

  {
    controlId: "SC.L2-3.13.11",
    implementationApproach: `Employ FIPS-validated cryptography when used to protect the confidentiality of CUI. FIPS 140-2 (or 140-3) validated cryptographic modules must be used for protecting CUI. Many commercial products use FIPS-validated modules by default. Document which validated modules protect CUI in your environment.\n\nFor Microsoft 365: Microsoft 365 uses FIPS 140-2 validated cryptographic modules. Obtain and retain Microsoft's FIPS compliance attestation.`,
    systemsUsed: ["Microsoft 365 Admin Center", "NIST CMVP Cryptographic Module Validation Program"],
    steps: [
      { stepNumber: 1, title: "Obtain Microsoft 365 FIPS Compliance Documentation", instruction: "Download or reference Microsoft's FIPS 140-2 compliance documentation for Microsoft 365. This documentation confirms FIPS-validated modules protect CUI in transit and at rest.", systemPortal: "Microsoft Trust Center / Service Trust Portal", evidenceHint: "Copy or link to Microsoft FIPS 140-2 compliance documentation for Microsoft 365." },
      { stepNumber: 2, title: "Verify FIPS-Validated Cryptography for On-Premises Systems", instruction: "For on-premises systems protecting CUI, verify the encryption tools and protocols used are FIPS 140-2 validated. Confirm TLS implementations use validated modules.", systemPortal: "On-premises systems / NIST CMVP", expectedResult: "All cryptography protecting CUI is FIPS 140-2 validated.", evidenceHint: "FIPS validation certificate or NIST CMVP entry for the cryptographic modules in use." },
    ],
    evidenceRequirements: [
      { title: "FIPS-Validated Cryptography Evidence", type: "Document", filename: "SC-3.13.11_FIPS_Validation_YYYY-MM-DD.docx", location: "Microsoft Service Trust Portal or NIST CMVP", mustShow: "FIPS 140-2 validation certificate numbers, validated products, protection scope" },
    ],
    testProcedures: [
      { name: "FIPS Validation Verification", steps: "1. Confirm Microsoft 365 FIPS documentation is on file.\n2. Verify all on-premises cryptography uses FIPS-validated modules.\n3. Confirm FIPS validation is documented for all cryptographic implementations protecting CUI.", expectedResult: "FIPS-validated cryptography is used for all CUI protection.", passCriteria: "FIPS documentation on file for all CUI-protecting cryptographic implementations." },
    ],
    closeoutChecklist: ["Microsoft 365 FIPS documentation obtained", "On-premises FIPS validation confirmed", "FIPS validation record maintained", "Evidence uploaded", "SSP narrative updated"],
  },

  {
    controlId: "SC.L2-3.13.12",
    implementationApproach: `Prohibit remote activation of collaborative computing devices and provide indication of use to users present at the devices. Cameras, microphones, and other collaborative computing features must not be remotely activated without the knowledge of users physically present at the device. This prevents unauthorized surveillance.\n\nFor Microsoft 365: Teams and other collaboration tools should not allow remote activation of cameras/microphones. Configure privacy settings to prevent unauthorized access to device cameras and microphones.`,
    systemsUsed: ["Microsoft Intune Admin Center", "Microsoft Teams Admin Center"],
    steps: [
      { stepNumber: 1, title: "Configure Device Policies to Control Camera and Microphone Access", instruction: "Use Intune device configuration profiles to control application access to cameras and microphones on CUI devices. Restrict which applications can access cameras and microphones.", systemPortal: "Microsoft Intune Admin Center", navigationPath: "Devices > Configuration profiles > Settings catalog > Privacy", recommendedSetting: "Allow only approved applications to access camera and microphone. Block web browser camera/mic access unless needed.", evidenceHint: "Screenshot of Intune privacy policy for camera and microphone access." },
      { stepNumber: 2, title: "Disable Remote Desktop Control of Camera/Microphone", instruction: "For remote desktop sessions, configure RDP settings to not allow remote redirection of local camera and microphone devices unless specifically needed for a use case.", systemPortal: "Group Policy / Intune", evidenceHint: "Group Policy or Intune setting showing device redirection restricted in RDP." },
      { stepNumber: 3, title: "Train Users on Collaborative Device Awareness", instruction: "Train users to be aware of when their camera or microphone is active (visual indicators like camera LED lights), and to cover or disable cameras/microphones on devices when not in use.", systemPortal: "Security Awareness Training Platform", evidenceHint: "Training record for collaborative device awareness." },
    ],
    evidenceRequirements: [
      { title: "Camera/Microphone Access Policy", type: "Screenshot", filename: "SC-3.13.12_Camera_Mic_Policy_YYYY-MM-DD.png", location: "Intune > Configuration profiles > Privacy", mustShow: "Camera and microphone access restrictions, approved applications" },
    ],
    testProcedures: [
      { name: "Remote Activation Prevention Verification", steps: "1. Verify Intune policy restricts camera/microphone access to approved apps.\n2. Confirm users are trained to recognize when camera/mic is active.\n3. Verify RDP settings prevent unauthorized camera/mic redirection.", expectedResult: "Cameras and microphones cannot be remotely activated without user awareness.", passCriteria: "Access policy configured. Users trained. RDP camera redirection controlled." },
    ],
    closeoutChecklist: ["Camera and microphone access policies configured", "RDP device redirection controlled", "User training on device awareness completed", "Evidence uploaded", "SSP narrative updated"],
  },

  {
    controlId: "SC.L2-3.13.13",
    implementationApproach: `Control and monitor the use of mobile code. Mobile code (JavaScript, Java applets, ActiveX, Flash) executed in web browsers can introduce malicious code from external sources. The organization must control what mobile code is permitted to execute and monitor for malicious mobile code activity.\n\nFor Microsoft 365: Use Microsoft Edge with Defender SmartScreen and Enterprise Mode to control and monitor mobile code execution. Configure browser security settings to restrict or disable unnecessary mobile code types.`,
    systemsUsed: ["Microsoft Intune Admin Center", "Microsoft Defender Portal"],
    steps: [
      { stepNumber: 1, title: "Configure Microsoft Edge Security Settings", instruction: "Deploy Microsoft Edge via Intune with security settings to control mobile code: enable SmartScreen, configure site security levels, block ActiveX/Flash, and restrict JavaScript execution for untrusted sites.", systemPortal: "Microsoft Intune Admin Center", navigationPath: "Devices > Configuration profiles > Settings catalog > Microsoft Edge", recommendedSetting: "SmartScreen: enabled. Flash: disabled. ActiveX: disabled. Enhanced security mode: enabled.", evidenceHint: "Screenshot of Edge browser security policy in Intune." },
      { stepNumber: 2, title: "Monitor for Malicious Mobile Code via Defender", instruction: "Use Microsoft Defender for Endpoint to detect and alert on malicious code execution attempts on CUI devices. Review browser-related alerts in the Defender portal.", systemPortal: "Microsoft Defender Portal", navigationPath: "Incidents & alerts > Alerts", evidenceHint: "Screenshot of Defender alerts for browser/mobile code threats." },
    ],
    evidenceRequirements: [
      { title: "Browser Mobile Code Policy", type: "Screenshot", filename: "SC-3.13.13_Browser_Mobile_Code_Policy_YYYY-MM-DD.png", location: "Intune > Configuration profiles", mustShow: "Edge browser security settings including SmartScreen, Flash disabled, security level" },
    ],
    testProcedures: [
      { name: "Mobile Code Control Verification", steps: "1. Visit a site with known Flash or ActiveX content on a CUI device.\n2. Verify Flash/ActiveX is blocked.\n3. Confirm SmartScreen blocks access to known malicious sites.", expectedResult: "Unnecessary mobile code is blocked. Malicious code is detected.", passCriteria: "Flash/ActiveX blocked. SmartScreen enabled. Defender monitoring active." },
    ],
    closeoutChecklist: ["Edge browser mobile code controls configured", "SmartScreen enabled on all CUI devices", "Flash and legacy ActiveX disabled", "Defender monitoring for malicious code active", "Evidence uploaded", "SSP narrative updated"],
  },

  {
    controlId: "SC.L2-3.13.14",
    implementationApproach: `Control and monitor the use of VoIP technologies. Voice over IP (VoIP) and video conferencing technologies can introduce security risks: eavesdropping, call interception, and denial of service. The organization must ensure VoIP systems are authorized, secured, and monitored.\n\nFor Microsoft 365: Microsoft Teams Phone and Teams meetings are the primary VoIP solution. Configure Teams security settings, meeting policies, and recording policies.`,
    systemsUsed: ["Microsoft Teams Admin Center", "Microsoft Entra Admin Center"],
    steps: [
      { stepNumber: 1, title: "Authorize and Document VoIP Systems in Use", instruction: "Maintain an inventory of all VoIP systems in use: Microsoft Teams, desk phones, video conferencing hardware. Document authorization for each system and security controls in place.", systemPortal: "Organization documentation", evidenceHint: "VoIP system inventory with security controls documentation." },
      { stepNumber: 2, title: "Configure Teams Meeting and Call Security Policies", instruction: "Configure Teams policies to control: who can start meetings, recording settings, guest meeting access, and external participant controls. Disable features that create security risks.", systemPortal: "Microsoft Teams Admin Center", navigationPath: "Meetings > Meeting policies", recommendedSetting: "Require authentication for meetings. Restrict recording to organizational users. Lobby enabled.", evidenceHint: "Screenshot of Teams meeting policy settings." },
      { stepNumber: 3, title: "Monitor VoIP Usage for Security Events", instruction: "Review Teams usage reports and audit logs for anomalous VoIP usage: unusual meeting recording, external participant access to sensitive meetings, or unauthorized forwarding.", systemPortal: "Microsoft Teams Admin Center", navigationPath: "Analytics & reports > Usage reports", evidenceHint: "Screenshot of Teams usage report review." },
    ],
    evidenceRequirements: [
      { title: "Teams VoIP Security Policy", type: "Screenshot", filename: "SC-3.13.14_Teams_VoIP_Policy_YYYY-MM-DD.png", location: "Teams Admin Center > Meeting policies", mustShow: "Meeting authentication, recording policy, guest access settings, lobby settings" },
    ],
    testProcedures: [
      { name: "VoIP Security Control Verification", steps: "1. Verify Teams meeting policy requires authentication.\n2. Attempt to join a meeting as an unauthenticated external user — verify lobby holds the user.\n3. Confirm meeting recording is restricted to organizational users.", expectedResult: "VoIP systems are secured with appropriate access controls.", passCriteria: "Meetings require authentication. Lobby enabled. Recording controlled." },
    ],
    closeoutChecklist: ["VoIP systems inventoried and authorized", "Teams meeting security policies configured", "VoIP usage monitoring established", "Evidence uploaded", "SSP narrative updated"],
  },

  {
    controlId: "SC.L2-3.13.15",
    implementationApproach: `Protect the authenticity of communications sessions. Communications sessions must be protected against modification, replay, and session hijacking. Use session authentication mechanisms such as TLS, HTTPS, and authenticated encryption protocols for all CUI-related communications.\n\nFor Microsoft 365: HTTPS (TLS) is enforced for all Microsoft 365 communications. HSTS (HTTP Strict Transport Security) prevents protocol downgrade attacks. Ensure all custom web applications also use HTTPS.`,
    systemsUsed: ["Microsoft Entra Admin Center", "Web Application / Network"],
    steps: [
      { stepNumber: 1, title: "Enforce HTTPS for All Web-Based CUI Access", instruction: "Ensure all web-based access to CUI systems uses HTTPS. Configure web servers to redirect HTTP to HTTPS. Enable HSTS to prevent protocol downgrade.", systemPortal: "Web server / Application", recommendedSetting: "HSTS with max-age 31536000. HTTPS-only. HTTP redirects to HTTPS.", evidenceHint: "Screenshot of HTTPS enforcement on web application or HSTS header verification." },
      { stepNumber: 2, title: "Verify Microsoft 365 Session Protection", instruction: "Microsoft 365 uses TLS 1.2+ for session protection. Review Conditional Access sign-in frequency settings to protect against session token theft through timely re-authentication.", systemPortal: "Microsoft Entra Admin Center", navigationPath: "Protection > Conditional Access > session controls", evidenceHint: "Screenshot confirming TLS-protected sessions and sign-in frequency controls." },
    ],
    evidenceRequirements: [
      { title: "Session Authenticity Protection Evidence", type: "Screenshot", filename: "SC-3.13.15_Session_Auth_Protection_YYYY-MM-DD.png", location: "Web application or Entra", mustShow: "HTTPS/TLS enforced, session controls in CA, no HTTP plaintext access" },
    ],
    testProcedures: [
      { name: "Session Authenticity Verification", steps: "1. Attempt to access CUI web applications via HTTP.\n2. Verify automatic redirect to HTTPS occurs.\n3. Verify SSL/TLS certificate is valid and uses TLS 1.2+.", expectedResult: "All CUI communications sessions are authenticated and protected.", passCriteria: "HTTPS enforced. HTTP redirects to HTTPS. TLS 1.2+ verified." },
    ],
    closeoutChecklist: ["HTTPS enforced for all CUI web access", "HSTS configured", "Session protection controls in Conditional Access", "Evidence uploaded", "SSP narrative updated"],
  },

  {
    controlId: "SC.L2-3.13.16",
    implementationApproach: `Protect the confidentiality of CUI at rest. CUI stored on systems must be protected through encryption at rest. This applies to data stored on servers, workstations, laptops, mobile devices, and backups.\n\nFor Microsoft 365: SharePoint, Exchange, and OneDrive use Microsoft-managed encryption at rest. Enable BitLocker on Windows devices for local storage encryption. Use Intune to verify and enforce disk encryption.`,
    systemsUsed: ["Microsoft Intune Admin Center", "Microsoft 365 Admin Center"],
    steps: [
      { stepNumber: 1, title: "Enable BitLocker Encryption on Windows Devices", instruction: "Deploy BitLocker encryption on all CUI-scoped Windows devices via Intune. Require AES-256 encryption with TPM protection. Store recovery keys in Entra ID.", systemPortal: "Microsoft Intune Admin Center", navigationPath: "Endpoint security > Disk encryption > Create policy > Windows BitLocker", recommendedSetting: "AES-256 encryption. TPM required. Recovery key backed up to Entra ID. Startup PIN optional.", evidenceHint: "Screenshot of Intune BitLocker policy and device encryption compliance report." },
      { stepNumber: 2, title: "Verify Microsoft 365 Cloud Storage Encryption", instruction: "Document Microsoft's encryption at rest for SharePoint, OneDrive, Exchange, and Teams. Microsoft uses AES-256 by default for all M365 data at rest.", systemPortal: "Microsoft Service Trust Portal", evidenceHint: "Reference to Microsoft encryption at rest documentation." },
      { stepNumber: 3, title: "Review Encryption Compliance Status", instruction: "Check the Intune device compliance report for BitLocker encryption status. Identify any non-compliant devices and remediate.", systemPortal: "Microsoft Intune Admin Center", navigationPath: "Endpoint security > Disk encryption > encryption report", expectedResult: "All CUI-scoped devices show BitLocker encryption compliant.", evidenceHint: "Screenshot of Intune BitLocker compliance report." },
    ],
    evidenceRequirements: [
      { title: "BitLocker Encryption Policy and Compliance", type: "Screenshot", filename: "SC-3.13.16_BitLocker_Config_YYYY-MM-DD.png", location: "Intune > Disk encryption", mustShow: "BitLocker policy settings (AES-256), assigned groups, device compliance status" },
      { title: "Microsoft 365 Cloud Encryption Documentation", type: "Document", filename: "SC-3.13.16_M365_Encryption_Documentation_YYYY-MM-DD.docx", location: "Microsoft Service Trust Portal", mustShow: "AES-256 encryption at rest for M365 workloads" },
    ],
    testProcedures: [
      { name: "CUI at Rest Encryption Verification", steps: "1. Check BitLocker compliance report — confirm 100% of CUI devices are encrypted.\n2. Verify BitLocker uses AES-256.\n3. Confirm recovery keys are backed up to Entra ID.", expectedResult: "All CUI data at rest is encrypted with AES-256.", passCriteria: "100% of CUI devices BitLocker-encrypted. AES-256 used. Recovery keys in Entra." },
    ],
    closeoutChecklist: ["BitLocker deployed on all CUI devices", "AES-256 encryption standard configured", "Recovery keys stored in Entra ID", "Microsoft 365 at-rest encryption documented", "Encryption compliance 100%", "Evidence uploaded", "SSP narrative updated"],
  },

  // ── SYSTEM & INFORMATION INTEGRITY (remaining) ──────────────────────────

  {
    controlId: "SI.L1-3.14.4",
    implementationApproach: `Update malicious code protection mechanisms whenever new releases are available. Antivirus and antimalware tools must be kept up to date with the latest signatures and engine versions. Outdated protection cannot detect new threats. Configure automatic updates for all endpoint protection tools.\n\nFor Microsoft 365 / Defender: Microsoft Defender Antivirus uses cloud-delivered protection and automatic signature updates. Verify automatic updates are enabled and not disabled on any CUI device.`,
    systemsUsed: ["Microsoft Intune Admin Center", "Microsoft Defender Portal"],
    steps: [
      { stepNumber: 1, title: "Enable Automatic Defender Signature Updates", instruction: "Ensure Microsoft Defender Antivirus is configured for automatic signature updates. Signatures should be updated multiple times per day via cloud-delivered protection.", systemPortal: "Microsoft Intune Admin Center", navigationPath: "Endpoint security > Antivirus > Microsoft Defender Antivirus", recommendedSetting: "Cloud-delivered protection: enabled. Automatic sample submission: enabled. Signature update interval: 4 hours.", evidenceHint: "Screenshot of Defender antivirus policy showing automatic update settings." },
      { stepNumber: 2, title: "Verify Signature Currency Across CUI Devices", instruction: "Review the Defender antivirus compliance report to confirm all CUI-scoped devices have current signatures. Investigate and remediate devices with outdated signatures.", systemPortal: "Microsoft Intune Admin Center", navigationPath: "Reports > Microsoft Defender Antivirus > Antivirus agent status", expectedResult: "All CUI devices have Defender signatures updated within the last 24 hours.", evidenceHint: "Screenshot of antivirus agent status report showing signature dates." },
    ],
    evidenceRequirements: [
      { title: "Automatic Update Configuration", type: "Screenshot", filename: "SI-3.14.4_AV_Auto_Update_Config_YYYY-MM-DD.png", location: "Intune > Endpoint security > Antivirus", mustShow: "Cloud-delivered protection enabled, automatic update interval, sample submission enabled" },
      { title: "Signature Currency Report", type: "Screenshot", filename: "SI-3.14.4_Signature_Currency_Report_YYYY-MM-DD.png", location: "Intune > Antivirus agent status report", mustShow: "Device name, signature version, signature date, compliance status" },
    ],
    testProcedures: [
      { name: "Signature Update Currency Check", steps: "1. Review antivirus agent status report.\n2. Verify all CUI devices have signatures updated within 24 hours.\n3. Test automatic update by temporarily disabling a device's internet (confirm update triggers when restored).", expectedResult: "Antimalware signatures are automatically updated to current versions.", passCriteria: "All CUI devices have signatures less than 24 hours old. Automatic updates enabled." },
    ],
    closeoutChecklist: ["Automatic Defender signature updates enabled", "Cloud-delivered protection enabled", "Signature currency report reviewed", "Outdated devices remediated", "Evidence uploaded", "SSP narrative updated"],
  },

  {
    controlId: "SI.L1-3.14.5",
    implementationApproach: `Perform periodic scans of information systems and real-time scans of files from external sources as files are downloaded, opened, or executed. Antivirus must be configured for both scheduled full scans (to catch dormant threats) and real-time scanning (to catch threats as they arrive).\n\nFor Microsoft 365 / Defender: Configure Microsoft Defender for real-time protection and periodic full scans. Defender for Office 365 provides real-time scanning of email attachments and links.`,
    systemsUsed: ["Microsoft Intune Admin Center", "Microsoft Defender Portal"],
    steps: [
      { stepNumber: 1, title: "Configure Defender Real-Time Scanning", instruction: "Ensure Microsoft Defender real-time protection is enabled on all CUI devices. Real-time scanning monitors all file operations: downloads, opens, and executions.", systemPortal: "Microsoft Intune Admin Center", navigationPath: "Endpoint security > Antivirus", recommendedSetting: "Real-time protection: On. Behavior monitoring: On. Network protection: On.", evidenceHint: "Screenshot of Defender real-time protection settings." },
      { stepNumber: 2, title: "Configure Periodic Full Scans", instruction: "Schedule weekly full scans on CUI devices to detect any threats that may have been missed by real-time scanning.", systemPortal: "Microsoft Intune Admin Center", navigationPath: "Endpoint security > Antivirus > Scan", recommendedSetting: "Quick scan: daily. Full scan: weekly (e.g., every Sunday at 2:00 AM).", evidenceHint: "Screenshot of Defender scan schedule settings." },
      { stepNumber: 3, title: "Enable Defender for Office 365 Scanning", instruction: "Enable Microsoft Defender for Office 365 to scan all email attachments and links in real time before delivery to users.", systemPortal: "Microsoft Defender Portal", navigationPath: "Email & collaboration > Policies & rules > Safe Attachments + Safe Links", recommendedSetting: "Safe Attachments: Block malware. Safe Links: Enable for email and Office apps.", evidenceHint: "Screenshot of Safe Attachments and Safe Links policies." },
    ],
    evidenceRequirements: [
      { title: "Real-Time and Scheduled Scan Configuration", type: "Screenshot", filename: "SI-3.14.5_Scan_Config_YYYY-MM-DD.png", location: "Intune > Endpoint security > Antivirus", mustShow: "Real-time protection on, scan schedule configured, scan type and frequency" },
      { title: "Defender for Office 365 Scanning Policies", type: "Screenshot", filename: "SI-3.14.5_DefenderO365_Scanning_YYYY-MM-DD.png", location: "Defender > Safe Attachments + Safe Links", mustShow: "Safe Attachments policy enabled, Safe Links policy enabled, scope" },
    ],
    testProcedures: [
      { name: "Antivirus Scanning Coverage Test", steps: "1. Confirm real-time protection is active on all CUI devices.\n2. Download the EICAR test file — verify Defender detects and blocks it in real time.\n3. Confirm scheduled scan is configured and has run in the past 7 days.", expectedResult: "Real-time scanning detects and blocks malicious files. Periodic scans run on schedule.", passCriteria: "EICAR test file detected by real-time protection. Scheduled scan has run. Defender for O365 active." },
    ],
    closeoutChecklist: ["Real-time protection enabled on all CUI devices", "Weekly full scans scheduled", "Defender for Office 365 Safe Attachments and Safe Links enabled", "Scan results reviewed", "Evidence uploaded", "SSP narrative updated"],
  },

  {
    controlId: "SI.L2-3.14.7",
    implementationApproach: `Identify unauthorized use of organizational systems. The organization must have mechanisms to detect when systems are being used in unauthorized ways: anomalous user behavior, unusual data access, off-hours activity, and other indicators of compromise or misuse.\n\nFor Microsoft 365: Use Microsoft Defender XDR for anomaly detection. Use Entra ID Identity Protection for risky user detection. Use Defender for Cloud Apps for anomalous activity detection.`,
    systemsUsed: ["Microsoft Defender Portal", "Microsoft Entra Admin Center", "Microsoft Defender for Cloud Apps"],
    steps: [
      { stepNumber: 1, title: "Enable Entra ID Identity Protection", instruction: "Enable Entra ID Identity Protection to detect risky users and risky sign-ins. Configure automated responses: require MFA for medium-risk sign-ins, block high-risk sign-ins.", systemPortal: "Microsoft Entra Admin Center", navigationPath: "Protection > Identity protection > Risky sign-ins / Risky users", recommendedSetting: "High risk: block access. Medium risk: require MFA change password. Review risk detections weekly.", evidenceHint: "Screenshot of Identity Protection risk policy configuration." },
      { stepNumber: 2, title: "Configure Defender XDR Anomaly Alerts", instruction: "Review and enable Microsoft Defender XDR anomaly detection rules. These rules identify behavioral patterns indicating unauthorized use: mass download, impossible travel, anomalous API activity.", systemPortal: "Microsoft Defender Portal", navigationPath: "Hunting > Custom detection rules", evidenceHint: "Screenshot of enabled anomaly detection alerts in Defender." },
      { stepNumber: 3, title: "Review Unauthorized Use Indicators Weekly", instruction: "Establish a weekly review of: Entra ID risky users/sign-ins, Defender XDR incidents, Cloud Apps anomaly alerts, and audit log for unusual admin activity. Document reviews.", systemPortal: "Microsoft Defender Portal", evidenceHint: "Weekly unauthorized use review log with date, findings, and actions taken." },
    ],
    evidenceRequirements: [
      { title: "Identity Protection Risk Policies", type: "Screenshot", filename: "SI-3.14.7_Identity_Protection_Policies_YYYY-MM-DD.png", location: "Entra > Identity protection", mustShow: "Sign-in risk policy and user risk policy with configured thresholds and responses" },
      { title: "Unauthorized Use Review Log", type: "Document", filename: "SI-3.14.7_Unauthorized_Use_Review_YYYY-MM-DD.xlsx", location: "Organization-maintained", mustShow: "Review date, reviewer, indicators checked, findings, actions taken" },
    ],
    testProcedures: [
      { name: "Unauthorized Use Detection Verification", steps: "1. Review Entra ID Identity Protection report for any risky users/sign-ins.\n2. Verify Identity Protection policies are configured and active.\n3. Confirm weekly review logs are being maintained.", expectedResult: "Unauthorized system use is detected and investigated.", passCriteria: "Identity Protection active with policies configured. Weekly reviews conducted and documented." },
    ],
    closeoutChecklist: ["Identity Protection enabled with risk policies configured", "Defender XDR anomaly detection active", "Cloud Apps anomaly policies enabled", "Weekly unauthorized use review established", "Evidence uploaded", "SSP narrative updated"],
  },
];

