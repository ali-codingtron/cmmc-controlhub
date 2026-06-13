export interface HelpCategorySeed {
  name: string;
  description: string;
  icon: string;
  sortOrder: number;
}

export interface HelpArticleSeed {
  slug: string;
  title: string;
  categoryName: string;
  module?: string;
  content: string;
  summary: string;
  keywords: string;
  roleVisibility?: string[];
  sortOrder: number;
}

export interface FaqSeed {
  question: string;
  answer: string;
  category: string;
  sortOrder: number;
}

export const HELP_CATEGORIES: HelpCategorySeed[] = [
  { name: "Getting Started", description: "Introduction to Control HUB, roles, and first steps", icon: "Rocket", sortOrder: 1 },
  { name: "Dashboard", description: "Understanding your compliance dashboard and KPIs", icon: "LayoutDashboard", sortOrder: 2 },
  { name: "Controls", description: "CMMC control library, assessments, and evidence linking", icon: "ShieldCheck", sortOrder: 3 },
  { name: "Evidence", description: "Uploading, reviewing, and managing compliance evidence", icon: "FileText", sortOrder: 4 },
  { name: "Documentation & SSP", description: "Policies, procedures, templates, and System Security Plans", icon: "BookOpen", sortOrder: 5 },
  { name: "Monitoring Tracker", description: "Recurring operational reviews and monitoring schedules", icon: "Activity", sortOrder: 6 },
  { name: "POA&M", description: "Plan of Action & Milestones for tracking remediation", icon: "AlertTriangle", sortOrder: 7 },
  { name: "Implementation Roadmap", description: "Prioritized actions and compliance progress tracking", icon: "Map", sortOrder: 8 },
  { name: "Pre-Assessment", description: "Tenant-connected automated CMMC readiness analysis", icon: "Cable", sortOrder: 9 },
  { name: "Reports", description: "Generating and exporting compliance reports", icon: "BarChart3", sortOrder: 10 },
  { name: "Users & Roles", description: "Managing users, permissions, and organizations", icon: "Users", sortOrder: 11 },
  { name: "MFA & Login Help", description: "Authentication, password reset, and multi-factor authentication", icon: "Lock", sortOrder: 12 },
  { name: "Workflows", description: "Step-by-step guides for common compliance tasks", icon: "GitBranch", sortOrder: 13 },
  { name: "Troubleshooting", description: "Common issues and how to resolve them", icon: "Wrench", sortOrder: 14 },
];

export const HELP_ARTICLES: HelpArticleSeed[] = [
  {
    slug: "getting-started",
    title: "Getting Started with Control HUB",
    categoryName: "Getting Started",
    module: "dashboard",
    summary: "Learn how to navigate Control HUB, select your organization, understand your role, and take your first compliance actions.",
    keywords: "getting started, onboarding, organization, navigation, dashboard, first steps, roles",
    sortOrder: 1,
    content: `## Welcome to Control HUB

Control HUB is a multi-tenant CMMC Compliance Readiness & Evidence Management Platform. This guide covers everything you need to get up and running quickly.

## Selecting Your Organization

If you have access to multiple organizations, you will see an organization switcher at the top of the sidebar. Click it to switch between organizations. All data is scoped to the selected organization.

## Understanding Your Role

Your role determines what you can see and do:

- **Admin** — Full access including user management and security settings
- **Compliance Manager** — Manages controls, evidence, documents, tasks, and POA&Ms
- **Reviewer** — Reviews and approves evidence and documents
- **IT Contributor** — Uploads evidence and completes monitoring tasks
- **Assessor** — Read-only access to assessor packages

See the User Roles Guide for a full breakdown.

## Navigating the Sidebar

- **Dashboard** — Compliance overview and KPI cards
- **Controls** — 110 CMMC controls across 14 domains
- **Evidence** — Your evidence repository
- **Monitoring Tracker** — Recurring operational review schedule
- **POA&Ms** — Remediation plan tracking
- **Implementation Roadmap** — Prioritized compliance actions
- **Pre-Assessment** — Tenant-connected automated analysis
- **Documentation** — Policies, procedures, and templates
- **SSP** — System Security Plan management
- **Reports** — Export compliance reports

## First Recommended Actions

1. Review the Dashboard — check your readiness score
2. Browse Controls — find controls marked Not Implemented
3. Upload Evidence — attach documentation to completed controls
4. Check Monitoring Tracker — review overdue items
5. Review POA&Ms — check open remediation items
6. Run Pre-Assessment — connect your Microsoft 365 tenant for automated analysis`,
  },
  {
    slug: "dashboard-guide",
    title: "Dashboard Guide",
    categoryName: "Dashboard",
    module: "dashboard",
    summary: "Understand your compliance dashboard KPI cards, domain readiness chart, activity timeline, and recommended next actions.",
    keywords: "dashboard, readiness score, KPI, domain readiness, evidence health, monitoring, recommended actions",
    sortOrder: 1,
    content: `## Dashboard Overview

The Dashboard provides a real-time executive view of your CMMC compliance posture. It refreshes on every page load.

## KPI Cards

### Controls Readiness
Percentage of CMMC controls that are **Implemented** — meaning they have at least one approved evidence item and a narrative. This is your primary compliance metric.

### Evidence Health
Percentage of evidence in **Approved** status. Strong evidence health means reviewers have validated your documentation.

### Monitoring Health
Percentage of monitoring items that are **Current** (not overdue). Overdue monitoring indicates operational compliance gaps.

### POA&M Status
Open vs. closed remediation items. High-risk open POA&Ms indicate unresolved compliance gaps.

### Active Policies / Active Procedures
Count of active policy and procedure documents. These are required by many CMMC controls.

## Domain Readiness Chart

Shows implementation percentage for each of the 14 CMMC domains (AC, AT, AU, CM, IA, IR, MA, MP, PS, RA, CA, SC, SI, SA). Click a domain to view controls filtered to that domain.

## Recent Activity

The last 20 audit events across your organization — evidence uploads, control updates, document status changes, user actions, and more.

## Recommended Next Actions

The system surfaces the highest-priority actions to improve your posture:
- Controls missing evidence
- Overdue monitoring items
- Expired or stale evidence
- Open high-risk POA&Ms
- Missing policy/procedure documents

Each item links directly to the relevant control or record.`,
  },
  {
    slug: "controls-guide",
    title: "Controls Guide",
    categoryName: "Controls",
    module: "controls",
    summary: "Learn how to use the CMMC control library, assess controls, link evidence, and manage the full control lifecycle.",
    keywords: "controls, CMMC, assessment, evidence, implementation, configure, monitoring, POA&M, SSP, status, domain",
    sortOrder: 1,
    content: `## The Control Library

The Controls page lists all 110 CMMC Level 2 controls across 14 domains. Each control has a unique identifier (e.g., AC.L2-3.1.1) and a description of the security practice.

## Control Statuses

- **Not Implemented** — No evidence or narrative provided
- **Partially Implemented** — Some evidence exists but control is not fully addressed
- **Implemented** — Has approved evidence and a complete narrative
- **Not Applicable** — Does not apply to your organization (must be documented)

## Control Detail Tabs

### Implementation
Write your implementation narrative describing how your organization meets this control. Required for a complete assessment. Explain the tools, processes, and personnel involved.

### Configure
Step-by-step technical configuration tasks. Mark each step complete as IT staff work through implementation.

### Evidence
Attach evidence files to this control. You can upload new evidence, link existing evidence, or remove links without deleting evidence.

### Monitoring
View recurring monitoring reviews linked to this control.

### POA&M
View and create remediation items for this control. Use POA&Ms when a control is not yet implemented.

### SSP
Edit the System Security Plan narrative for this control for formal assessment packages.

## Assessor Ready

A control is "Assessor Ready" when it has:
1. An implementation narrative
2. At least one approved evidence item
3. No open high-risk POA&Ms`,
  },
  {
    slug: "evidence-guide",
    title: "Evidence Guide",
    categoryName: "Evidence",
    module: "evidence",
    summary: "Learn how to upload, manage, link, review, and approve evidence for CMMC compliance.",
    keywords: "evidence, upload, approve, reject, link, controls, status, bulk upload, archive, preview, download",
    sortOrder: 1,
    content: `## What is Evidence?

Evidence proves your organization has implemented CMMC controls. It can be screenshots, configuration exports, audit logs, policies, contracts, or any file demonstrating a control is in place.

## Evidence Statuses

- **Draft** — Newly uploaded; not yet reviewed. Cannot mark a control as Implemented.
- **Submitted** — Submitted for review.
- **Approved** — Validated by a reviewer. Counts toward control readiness.
- **Rejected** — Insufficient; uploader should replace it.
- **Stale** — Past review date; needs refreshing.
- **Superseded** — Replaced by newer evidence.

## Uploading Evidence

### Single Upload
1. Go to **Evidence** in the sidebar → click **Upload Evidence**
2. Fill in title, description, type, and control links
3. Select the file → click **Save**

### Upload from a Control
1. Open a control → click the **Evidence** tab
2. Click **Upload Evidence** or **Link Existing**

### Bulk Upload
Select multiple files at once from the Evidence page. Assign each a title and link to controls.

## Evidence Types
Policy, Procedure, Screenshot, Configuration Export, Audit Log, Report, Other

## Linking to Multiple Controls
Select all relevant controls in the Linked Controls field when uploading. You can also link from the Control Detail Evidence tab.

## Removing Evidence from a Control
Open Control Detail → Evidence tab → click the unlink icon. The evidence stays in the repository but is removed from this control.

## Previewing Files
Supported: images (PNG/JPG/GIF/WebP/SVG), PDFs, text/CSV/JSON/YAML, DOCX (converted to HTML), XLSX (table view).

## Evidence Naming Convention
Recommended: \`[Domain]-[Control ID]-[Type]-[YYYY-MM].ext\`
Example: \`AC-3.1.1-Screenshot-MFA-Config-2025-06.png\``,
  },
  {
    slug: "documentation-guide",
    title: "Documentation Guide",
    categoryName: "Documentation & SSP",
    module: "documents",
    summary: "Learn how to manage policy and procedure documents, use the template library, generate documents, and track compliance logs.",
    keywords: "documents, policies, procedures, templates, generate, compliance logs, checklists, gap analysis, workflow",
    sortOrder: 1,
    content: `## Documentation Overview

The Documentation module manages formal policy and procedure documents required for CMMC compliance. Unlike evidence (which proves controls are implemented), documents define how your organization operates.

## Document Status Workflow

**Draft** → **Under Review** → **Active** → (Expired or Archived)

- **Draft** — Initial creation or upload
- **Under Review** — Submitted for review
- **Active** — Approved and in force; counts toward control readiness
- **Expired** — Past review date; must be renewed
- **Archived** — Retired from active use

## Template Library

Over 60 pre-built CMMC policy and procedure templates. To use:
1. Go to **Documentation → Template Library**
2. Browse or search for the template you need
3. Click **Generate** to create a document from it
4. Customize it for your organization
5. The document appears in Draft status in All Documents

## Compliance Logs

Recurring log entries required by certain controls (access review logs, training completion logs, configuration audit logs). Track whether these logs are being maintained.

## Checklists

Operational compliance checklists that staff complete regularly. Mark items complete with a date and notes.

## Gap Analysis

The **Gap Analysis** page shows which required CMMC policy and procedure documents are missing from your library.`,
  },
  {
    slug: "ssp-guide",
    title: "SSP Guide",
    categoryName: "Documentation & SSP",
    module: "ssp",
    summary: "Learn how to create, manage, and export your System Security Plan for CMMC compliance.",
    keywords: "SSP, system security plan, sections, narratives, control mapping, export, CMMC",
    sortOrder: 2,
    content: `## What is an SSP?

A System Security Plan (SSP) is a formal document required for CMMC assessment. It describes your information system, security boundary, and how each CMMC control is implemented. Every CMMC Level 2 organization must have one.

## SSP Sections

Navigate to **SSP → Sections** to view and edit each section. Key sections include:
- System Information (system description, boundary, architecture)
- Roles and Responsibilities
- System Environment (hardware, software, network)
- Control Implementations (pulled from control narratives)
- Attachments (diagrams, network maps)

## Editing Narratives

1. Go to **SSP → Sections**
2. Find the relevant section and click **Edit**
3. Write your implementation narrative
4. Click **Save**

You can also edit SSP narratives from the **SSP tab** on each Control Detail page.

## Control Mapping

**SSP → Control Mapping** shows how CMMC controls map to SSP sections. Identify which controls are covered and which still need SSP documentation.

## Exporting Your SSP

**SSP → Export** — download as PDF (for assessors) or Word document (for further editing).`,
  },
  {
    slug: "monitoring-guide",
    title: "Monitoring Tracker Guide",
    categoryName: "Monitoring Tracker",
    module: "monitoring",
    summary: "Understand the monitoring tracker, how recurring reviews work, status meanings, frequency logic, and how to record completions.",
    keywords: "monitoring, tracker, recurring, frequency, overdue, current, in progress, review, schedule, CMMC",
    sortOrder: 1,
    content: `## What is the Monitoring Tracker?

The Monitoring Tracker schedules 19 recurring operational reviews required for CMMC Level 2. These must be performed on a regular schedule to maintain ongoing compliance — not just once.

## Monitoring Item Statuses

- **Current** — Review completed within the required frequency window. No action needed.
- **In Progress** — Review is being worked on or is due within 30 days.
- **Overdue** — Review has passed its due date. This is a compliance gap.

## Frequency Logic

Each item has a defined review frequency:
- **Monthly** — Every 30 days
- **Quarterly** — Every 90 days
- **Semi-Annual** — Every 180 days
- **Annual** — Every 365 days

**Next Due** = Last Completed date + frequency interval. If no completion is recorded, the item may be overdue from the start.

## Recording a Review Completion

1. Go to **Monitoring Tracker**
2. Find the item to complete
3. Click the row to edit inline
4. Set status to **Current** and enter the completion date
5. Add notes about what was reviewed and evidence retained
6. Click **Save**

## Evidence to Retain

For each monitoring review, retain evidence of what was reviewed. Examples:
- Access review: screenshot of user access list + review sign-off
- Vulnerability scan: scan report export
- Backup test: test restoration log
- Log review: log analysis report

## What Counts as Overdue?

A monitoring item becomes overdue when the current date exceeds the Next Due date. The dashboard shows overdue monitoring counts in the Monitoring Health KPI card.`,
  },
  {
    slug: "poam-guide",
    title: "POA&M Guide",
    categoryName: "POA&M",
    module: "poams",
    summary: "Learn how to create, manage, and close Plan of Action & Milestones items for CMMC remediation tracking.",
    keywords: "POAM, plan of action, milestones, remediation, risk, close, controls, compliance gap",
    sortOrder: 1,
    content: `## What is a POA&M?

A Plan of Action & Milestones (POA&M) documents a known compliance gap and the plan to remediate it. POA&Ms are required by CMMC assessors to demonstrate awareness of weaknesses and a credible path to resolution.

## Creating a POA&M

1. Go to **POA&Ms** in the sidebar → click **Add POA&M**
2. Fill in:
   - **Title** — Short description of the gap
   - **Description** — Detailed explanation of the weakness
   - **Linked Control** — The CMMC control this addresses
   - **Risk Level** — Critical, High, Medium, or Low
   - **Target Completion Date** — When you plan to resolve it
   - **Milestones** — Interim steps toward resolution
3. Click **Save**

You can also create a POA&M directly from the **POA&M tab** on a Control Detail page.

## POA&M Statuses

- **Open** — Active gap being remediated
- **In Progress** — Remediation work is underway
- **Closed** — Gap has been resolved

## Risk Levels

- **Critical** — Immediate threat to CUI protection; must be remediated urgently
- **High** — Significant compliance gap; remediate within 30–90 days
- **Medium** — Notable gap; remediate within 180 days
- **Low** — Minor gap; remediate within 1 year

## Closing a POA&M

1. Open the POA&M detail page
2. Click **Close POA&M**
3. Add a description of the remediation completed
4. Link the evidence that proves the gap is resolved
5. The POA&M status changes to Closed

Closed POA&Ms are retained in the system for audit trail purposes.`,
  },
  {
    slug: "roadmap-guide",
    title: "Implementation Roadmap Guide",
    categoryName: "Implementation Roadmap",
    module: "roadmap",
    summary: "Understand the implementation roadmap, priority actions, impact scoring, and how to track compliance progress.",
    keywords: "roadmap, priority actions, impact score, phases, implementation, progress, controls, compliance",
    sortOrder: 1,
    content: `## What is the Implementation Roadmap?

The Implementation Roadmap provides a prioritized, phased action plan for achieving CMMC compliance. It identifies the highest-impact actions to take first, helping you focus effort where it matters most.

## Priority Actions

The **Priority Actions** view lists recommended compliance actions ranked by:
- **Impact Score** — How much this action improves your overall readiness
- **Effort Level** — Estimated effort to complete
- **Phase** — Which phase of compliance this falls in (Foundation, Core, Advanced)

Each action is linked to the CMMC controls it addresses and shows how completing it improves your readiness score.

## Coverage Matrix

The **Coverage Matrix** view shows which controls are addressed by each action and helps identify coverage gaps. Use it to see where multiple controls can be addressed by a single action.

## Roadmap Progress

The **Roadmap Progress** view tracks how many actions have been completed across each phase. It shows:
- Total actions in each phase
- Completed vs. remaining actions
- Estimated readiness improvement from completing remaining actions

## Using the Roadmap

1. Start with **Priority Actions** — sort by impact score
2. Pick the highest-impact, lowest-effort actions first
3. As you complete actions, upload evidence to the linked controls
4. The roadmap automatically recalculates progress as controls are updated
5. Move through phases: Foundation → Core → Advanced

## Relationship to Controls

Each roadmap action maps to one or more CMMC controls. Completing an action does not automatically mark controls as Implemented — you still need to upload evidence and write implementation narratives.`,
  },
  {
    slug: "pre-assessment-guide",
    title: "Pre-Assessment Guide",
    categoryName: "Pre-Assessment",
    module: "pre-assessment",
    summary: "Learn how the tenant-connected pre-assessment works, how to connect your Microsoft tenant, and how to interpret findings.",
    keywords: "pre-assessment, tenant scan, Microsoft, Intune, Azure AD, findings, evidence requests, roadmap, CMMC",
    sortOrder: 1,
    content: `## What is the Pre-Assessment?

The Pre-Assessment module performs an automated CMMC readiness analysis by connecting to your Microsoft 365 tenant. It analyzes your actual technical configuration and maps the findings to CMMC controls.

**Important:** The Pre-Assessment is NOT an official CMMC assessment and does not certify compliance. It is a readiness tool to identify gaps before a formal assessment.

## Connecting Your Microsoft Tenant

1. Go to **Pre-Assessment → Tenant Connections**
2. Click **Add Connection**
3. Follow the Microsoft admin consent flow — an admin in your Microsoft 365 tenant must authorize the connection
4. Once connected, your tenant appears in the connections list

### Required Microsoft Permissions
- \`DeviceManagementConfiguration.Read.All\` — Read Intune device configuration
- \`Policy.Read.All\` — Read conditional access and security policies
- \`AuditLog.Read.All\` — Read Azure AD audit logs
- \`Directory.Read.All\` — Read directory objects

## Running a Pre-Assessment

1. Go to **Pre-Assessment → Run Assessment**
2. Select your tenant connection
3. Select the CMMC controls to assess
4. Click **Run** — the scan typically takes 2–5 minutes

## Tenant Scan Health

The **Tenant Scan Health** indicator shows the overall health of the data received from your tenant:
- **Healthy** — All data sources are available and returning results
- **Degraded** — Some data sources are unavailable (e.g., Intune not licensed)
- **Error** — Connection failed or permissions are insufficient

## Interpreting Findings

Findings are categorized by CMMC control and include:
- **Assessment Confidence** — How confident the system is in the finding (based on data completeness)
- **Controls Touched** — How many controls this finding affects
- **Status** — Pass, Fail, or Insufficient Data

## Evidence Requests

The Pre-Assessment generates evidence requests for any control it cannot automatically verify. These are additional evidence items you should upload manually to support those controls.

## Why Intune Data May Be Unavailable

- Intune is not licensed for your tenant
- The service account lacks \`DeviceManagementConfiguration.Read.All\` permission
- Conditional access is blocking the API connection

## Recommended Roadmap

After running an assessment, go to **Pre-Assessment → Recommended Roadmap** to see a prioritized list of remediation actions based on the assessment findings.`,
  },
  {
    slug: "reports-guide",
    title: "Reports Guide",
    categoryName: "Reports",
    module: "reports",
    summary: "Learn how to generate, configure, and export compliance reports including executive summaries, gap analysis, and assessor packages.",
    keywords: "reports, executive, gap analysis, evidence inventory, POA&M, monitoring, domain, assessor, export, PDF",
    sortOrder: 1,
    content: `## Available Reports

Control HUB includes the following reports:

### Executive Readiness Report
A high-level summary of your compliance posture for executives and leadership. Shows overall readiness score, domain breakdowns, key metrics, and trending data.

### Gap Analysis Report
Identifies compliance gaps — controls that are Not Implemented or Partially Implemented — with recommendations for remediation. Useful for planning purposes.

### Control Status Report
A detailed view of all 110 CMMC controls with their current implementation status, evidence counts, and assessment notes.

### Evidence Inventory Report
A complete list of all evidence files, their statuses, linked controls, upload dates, and review dates. Use this to audit your evidence library.

### POA&M Report
All open and closed Plan of Action & Milestones items, grouped by risk level and control domain.

### Monitoring Tracker Report
Status of all 19 recurring monitoring items, including last completed dates, frequencies, and overdue items.

### Domain Readiness Report
Per-domain compliance breakdown showing implementation rates for each of the 14 CMMC domains.

### Audit Readiness Report
A summary designed for pre-assessment review, showing assessor-ready controls and outstanding gaps.

### SSP Summary Report
A formatted summary of your System Security Plan for sharing with assessors or management.

## Generating a Report

1. Go to **Reports** in the sidebar
2. Select the report type from the submenu
3. Configure any filters (date range, domains, statuses)
4. Click **Generate** or **Export**

## Export Formats

Most reports can be exported as:
- **PDF** — Formatted for printing and sharing
- **CSV/Excel** — For further analysis in spreadsheet tools

## Assessor Package

The Assessor package (available under the Assessor section) provides a read-only view of all assessor-ready controls with their evidence, narratives, and supporting documentation. Share this with your CMMC assessor.`,
  },
  {
    slug: "user-roles-guide",
    title: "User Roles Guide",
    categoryName: "Users & Roles",
    module: "users",
    summary: "Understand all user roles, their permissions, and what each role can and cannot do in Control HUB.",
    keywords: "roles, permissions, admin, compliance manager, reviewer, IT contributor, assessor, demo, user management",
    sortOrder: 1,
    content: `## Role Overview

Control HUB uses role-based access control. Each user is assigned a role that determines what they can see and do.

## Global Admin

**Full access to everything.**

Can:
- Manage all organizations
- Create, edit, and deactivate users
- Access Security Center (MFA policy, locked accounts)
- View audit trail
- Access all modules across all organizations
- Manage help content

Cannot: Nothing — global admins have unrestricted access.

## Organization Admin

**Full access within their organization.**

Can:
- Manage users within their organization
- Access all compliance modules
- Create and manage evidence, documents, controls, POA&Ms
- Run pre-assessments

Cannot: Manage other organizations or global settings.

## Compliance Manager

**Primary compliance role.**

Can:
- Manage controls, evidence, documents, tasks, and POA&Ms
- Approve and reject evidence and documents
- Run pre-assessments
- Generate reports
- View the roadmap and monitoring tracker

Cannot: Manage users or access security settings.

## IT Contributor

**Technical implementation role.**

Can:
- Upload evidence
- Complete monitoring tasks
- Update control implementation notes
- Create and update tasks
- View controls and evidence

Cannot: Approve/reject evidence, manage documents, or access administrative features.

## Reviewer

**Audit and review role.**

Can:
- Review and approve/reject evidence
- Review and approve/reject documents
- View all compliance data read-only

Cannot: Create or upload evidence, manage controls, or access admin features.

## Assessor (Read-Only)

**External assessor access.**

Can:
- View assessor packages and control details
- Download evidence and reports
- View control narratives and SSP

Cannot: Modify any data. This role is intentionally read-only for external assessment use.

## Member

**Basic access role.**

Can:
- View assigned controls and evidence
- View their own tasks

Cannot: Create or modify compliance records.

## Demo Viewer

**Public demo access.**

Can:
- View a read-only demo of the application
- Browse all modules in read-only mode

Cannot: Create, modify, or delete any data. Cannot access real organization data.`,
  },
  {
    slug: "mfa-login-guide",
    title: "MFA & Login Guide",
    categoryName: "MFA & Login Help",
    module: "settings",
    summary: "Learn how to accept invitations, set a password, reset your password, set up MFA, use recovery codes, and handle account lockout.",
    keywords: "MFA, multi-factor authentication, login, password, reset, invitation, TOTP, recovery codes, lockout, security",
    sortOrder: 1,
    content: `## Accepting an Invitation

When an admin invites you to Control HUB, you will receive an email with an invitation link.

1. Click the **Accept Invitation** link in the email (valid for 7 days)
2. Set your name and password on the acceptance page
3. Password must be at least 12 characters with uppercase, lowercase, a number, and a special character
4. After setting your password, you will be logged in automatically

## Setting a Password

Passwords must meet these requirements:
- 12 or more characters
- At least one uppercase letter
- At least one lowercase letter
- At least one number
- At least one special character (!@#$%^&* etc.)

## Resetting Your Password

If you forgot your password:

1. Go to the login page
2. Click **Forgot password?** below the password field
3. Enter your email address
4. Check your email for the reset link (valid for 30 minutes)
5. Click the link and set your new password

Admins can also send a password reset email from the Users management page.

## Setting Up MFA

If your admin has enabled MFA (multi-factor authentication):

1. Log in with your email and password
2. You will be prompted to set up MFA if required
3. Open an authenticator app (Google Authenticator, Microsoft Authenticator, Authy, etc.)
4. Scan the QR code shown on screen
5. Enter the 6-digit code from your app to verify setup
6. **Save your recovery codes** — you will need them if you lose access to your authenticator

## Using MFA on Login

After entering your password, you will be prompted for your 6-digit authenticator code. Enter the current code from your authenticator app.

## Recovery Codes

Recovery codes are one-time-use backup codes for when you cannot access your authenticator app.

- You receive 10 recovery codes when you set up MFA
- Each code can only be used once
- Store them in a secure location (password manager or printed in a safe)
- After using a recovery code, contact your admin to reset your MFA if needed

## What to Do If Locked Out

After 5 failed login attempts, your account is temporarily locked for 15 minutes.

- Wait 15 minutes and try again
- If you need immediate access, contact your organization admin to unlock your account
- Admins can unlock accounts from the Users management page or Security Center`,
  },
  {
    slug: "workflow-invite-user",
    title: "How to Invite a New User",
    categoryName: "Workflows",
    module: "users",
    summary: "Step-by-step guide to inviting a new user to your organization in Control HUB.",
    keywords: "invite, user, onboarding, workflow, admin, organization, email",
    roleVisibility: ["admin", "compliance_manager"],
    sortOrder: 1,
    content: `## Overview

Only admins and compliance managers can invite new users to Control HUB.

## Steps

1. Go to **Users** in the Admin section of the sidebar
2. Click **Invite User**
3. Fill in the invitation form:
   - **Email** — User's email address (must be unique in the system)
   - **Name** — User's full name
   - **Role** — Select the appropriate role (see User Roles Guide)
   - **Organization** — The organization this user belongs to
4. Click **Send Invitation**

The user will receive an invitation email with a link valid for 7 days.

## What Happens Next

1. The user clicks the invitation link in their email
2. They set their name and password
3. They are automatically logged in and added to the organization
4. You can see the user in the Users list with status "Active"

## Managing Pending Invitations

- **Resend Invitation** — If the user did not receive the email or the link expired, click Resend in the user's action menu
- **Cancel Invitation** — If the invitation should no longer be valid, click Cancel

## Troubleshooting

- **User says they didn't receive the email** — Ask them to check their spam folder. You can also resend the invitation.
- **Invitation link expired** — Invitations are valid for 7 days. Resend the invitation.
- **Email already exists** — Each email address can only have one account. If the user already has an account, add them to the organization instead.`,
  },
  {
    slug: "workflow-upload-evidence",
    title: "How to Upload Evidence to a Control",
    categoryName: "Workflows",
    module: "evidence",
    summary: "Step-by-step guide to uploading evidence and linking it to a CMMC control.",
    keywords: "upload, evidence, control, workflow, link, file, compliance",
    sortOrder: 2,
    content: `## Overview

Evidence proves your organization has implemented a CMMC control. This guide covers uploading evidence and linking it to a specific control.

## Option 1: Upload from the Control Detail Page

1. Go to **Controls** → find and open the control
2. Click the **Evidence** tab
3. Click **Upload Evidence**
4. Fill in:
   - **Title** — Descriptive name for the evidence
   - **Description** — What this evidence proves
   - **Type** — Screenshot, Policy, Configuration Export, etc.
5. Click **Choose File** and select your file
6. Click **Save**

The evidence is uploaded and linked directly to this control.

## Option 2: Upload from the Evidence Repository

1. Go to **Evidence** in the sidebar
2. Click **Upload Evidence**
3. Fill in the title, description, and type
4. In **Linked Controls**, search for and select all controls this evidence supports
5. Choose your file and click **Save**

## Option 3: Link Existing Evidence to a Control

If you have already uploaded evidence and want to link it to an additional control:

1. Go to **Controls** → open the control
2. Click the **Evidence** tab
3. Click **Link Existing**
4. Search for and select the evidence you want to link
5. Click **Link**

## After Uploading

New evidence starts in **Draft** status. To make it count toward control readiness:

1. Submit it for review (click **Submit for Review** on the evidence)
2. A reviewer or compliance manager will **Approve** or **Reject** it
3. Once **Approved**, the evidence counts toward the control's implementation status`,
  },
  {
    slug: "workflow-approve-evidence",
    title: "How to Approve Evidence",
    categoryName: "Workflows",
    module: "evidence",
    summary: "Step-by-step guide for reviewers and compliance managers to review and approve evidence.",
    keywords: "approve, evidence, review, reject, workflow, reviewer",
    roleVisibility: ["admin", "compliance_manager", "reviewer"],
    sortOrder: 3,
    content: `## Overview

Reviewers and compliance managers can approve or reject submitted evidence. Approved evidence counts toward control readiness.

## Steps

1. Go to **Evidence** in the sidebar
2. Filter by **Status: Submitted** to see evidence awaiting review
3. Click an evidence item to open its detail page
4. Review the evidence:
   - Preview the file directly in the browser
   - Check the linked controls
   - Read the description and notes
5. Click **Approve** or **Reject**:
   - **Approve** — Evidence is valid and supports the linked controls
   - **Reject** — Evidence is insufficient; add a note explaining what is missing

## Bulk Status Updates

To approve or reject multiple evidence items at once:

1. Go to the **Evidence** page
2. Check the boxes next to multiple items
3. Click **Bulk Actions** → select **Approve Selected** or **Reject Selected**

## What Happens After Approval

- Evidence status changes to **Approved**
- The linked control's readiness status may update
- The uploader is notified of the approval or rejection

## Tips for Reviewing Evidence

- Check that the evidence directly supports the control it is linked to
- Verify the evidence is current (not outdated screenshots or expired policies)
- For screenshots, check that they show the relevant configuration clearly
- For policies, check they are signed, dated, and applicable to CUI systems`,
  },
  {
    slug: "workflow-generate-document",
    title: "How to Generate a Document from a Template",
    categoryName: "Workflows",
    module: "documents",
    summary: "Step-by-step guide to generating a policy or procedure document from the template library.",
    keywords: "generate, document, template, policy, procedure, workflow",
    sortOrder: 4,
    content: `## Overview

Control HUB includes over 60 CMMC-aligned document templates. Generate a document from a template as a starting point for your organization's policies and procedures.

## Steps

1. Go to **Documentation → Template Library**
2. Browse or search for the template you need (e.g., "Access Control Policy")
3. Click **Generate Document** on the template card
4. Fill in any required fields (organization name, effective date, owner, etc.)
5. Review the generated content
6. Click **Save** — the document is created in Draft status

## After Generating

1. The document appears in **Documentation → All Documents** with status **Draft**
2. Open the document to review and customize it
3. Add your organization-specific details
4. When ready, click **Submit for Review**
5. A reviewer or admin approves it, moving it to **Active** status

## Customizing Generated Documents

All generated documents can be edited directly in Control HUB. Common customizations:
- Add your organization's name and branding information
- Update system-specific references (e.g., your specific CUI systems)
- Adjust procedures to match your actual tools and processes
- Set the effective date and review schedule

## Keeping Documents Current

CMMC requires policies and procedures to be reviewed and updated regularly. Set a review date when creating a document. When the review date passes, the document status changes to **Expired** and must be renewed.`,
  },
  {
    slug: "workflow-monitoring-review",
    title: "How to Complete a Monitoring Review",
    categoryName: "Workflows",
    module: "monitoring",
    summary: "Step-by-step guide to completing a recurring monitoring review in the Monitoring Tracker.",
    keywords: "monitoring, review, complete, recurring, workflow, overdue, current",
    sortOrder: 5,
    content: `## Overview

Monitoring reviews are recurring operational checks required for CMMC compliance. Complete them on schedule to keep your monitoring items Current.

## Steps

1. Go to **Monitoring Tracker** in the sidebar
2. Find the monitoring item to complete (look for **Overdue** or **In Progress** status)
3. Click the row to open the inline editor
4. Update the fields:
   - **Status** — Change to **Current**
   - **Last Completed** — Enter today's date
   - **Notes** — Add a brief description of what was reviewed and who performed it
5. Click **Save**

## What to Document

When completing a monitoring review, note:
- Who performed the review
- What was checked (specific systems, accounts, logs, etc.)
- What evidence was retained (link to the evidence file if uploaded)
- Any issues found and how they were addressed

## Uploading Evidence for a Review

For many monitoring items, you should upload supporting evidence:

1. Complete the monitoring review in the tracker
2. Upload the evidence (log export, scan report, screenshot, etc.) to the **Evidence** repository
3. Link the evidence to the relevant CMMC control

## Recurring Reviews Explained

Monitoring items do not stay Current indefinitely. The status automatically recalculates based on the Last Completed date and the required frequency:

- Monthly items become overdue 30 days after the last completion
- Quarterly items become overdue 90 days after the last completion
- etc.

Stay ahead of overdue items by completing reviews before they pass their due date.`,
  },
  {
    slug: "workflow-create-poam",
    title: "How to Create and Close a POA&M",
    categoryName: "Workflows",
    module: "poams",
    summary: "Step-by-step guide to creating a Plan of Action & Milestones item and closing it once remediated.",
    keywords: "POA&M, create, close, remediation, workflow, gap, control",
    sortOrder: 6,
    content: `## Creating a POA&M

Use a POA&M to document a known compliance gap and your plan to fix it.

1. Go to **POA&Ms** → click **Add POA&M**
2. Fill in:
   - **Title** — Short description of the gap (e.g., "MFA not enabled for all privileged accounts")
   - **Description** — Detailed explanation of the weakness
   - **Linked Control** — The CMMC control this addresses (e.g., IA.L2-3.5.3)
   - **Risk Level** — Critical, High, Medium, or Low
   - **Target Completion Date** — When you plan to resolve it
   - **Milestones** — Interim steps (e.g., "Week 1: Identify all admin accounts", "Week 2: Enable MFA")
3. Click **Save**

You can also create a POA&M from a Control Detail page → POA&M tab.

## Tracking Progress

Update the POA&M as you work through the milestones:
1. Open the POA&M detail page
2. Check off completed milestones
3. Update the status to **In Progress** once work has begun
4. Add notes on progress

## Closing a POA&M

Once the gap is fully remediated:

1. Open the POA&M detail page
2. Upload evidence proving the gap is resolved
3. Click **Close POA&M**
4. Add a remediation description (what was done to fix the gap)
5. The POA&M status changes to **Closed**

Closed POA&Ms are retained for audit trail purposes. They demonstrate to assessors that your organization has a mature remediation process.`,
  },
  {
    slug: "workflow-run-assessment",
    title: "How to Run a Tenant-Connected Pre-Assessment",
    categoryName: "Workflows",
    module: "pre-assessment",
    summary: "Step-by-step guide to connecting your Microsoft tenant and running an automated CMMC readiness scan.",
    keywords: "pre-assessment, tenant, Microsoft, scan, workflow, findings, Intune, Azure AD",
    sortOrder: 7,
    content: `## Prerequisites

- Microsoft 365 tenant with a Global Admin account available for the consent flow
- Pre-Assessment access (Admin, Compliance Manager, or Reviewer role)

## Step 1: Connect Your Tenant

1. Go to **Pre-Assessment → Tenant Connections**
2. Click **Add Connection**
3. Enter a display name for this tenant connection
4. Click **Connect with Microsoft** — you will be redirected to Microsoft's consent page
5. Sign in with a Microsoft 365 Global Admin account
6. Review and **Accept** the requested permissions
7. You will be redirected back to Control HUB

The connection is now saved and ready to use.

## Step 2: Run the Assessment

1. Go to **Pre-Assessment → Run Assessment**
2. Select your tenant connection from the dropdown
3. Select which controls to assess (or select all)
4. Click **Run Assessment**
5. The scan runs in the background — typically 2–5 minutes

## Step 3: Review Results

1. Go to **Pre-Assessment → Assessment History**
2. Click the most recent assessment to view results
3. Review findings by control domain
4. Check **Assessment Confidence** for each finding — lower confidence means less data was available

## Step 4: Act on Findings

1. Go to **Pre-Assessment → Findings** to see all failed or insufficient controls
2. For controls you can address technically — update your Microsoft 365 configuration
3. For controls that need evidence — go to **Pre-Assessment → Evidence Requests** and upload supporting documentation
4. Go to **Pre-Assessment → Recommended Roadmap** for a prioritized remediation plan`,
  },
  {
    slug: "workflow-generate-report",
    title: "How to Generate a Compliance Report",
    categoryName: "Workflows",
    module: "reports",
    summary: "Step-by-step guide to generating and exporting compliance reports in Control HUB.",
    keywords: "report, generate, export, workflow, executive, gap analysis, evidence, assessor",
    sortOrder: 8,
    content: `## Overview

Control HUB can generate several types of compliance reports for sharing with executives, assessors, and compliance teams.

## Generating an Executive Readiness Report

1. Go to **Reports → Executive Readiness**
2. Review the report preview
3. Click **Export PDF** to download a formatted report
4. Share with leadership or stakeholders

## Generating a Gap Analysis Report

1. Go to **Reports → Gap Analysis**
2. Review controls that are Not Implemented or Partially Implemented
3. Optionally filter by domain or risk level
4. Click **Export** to download as PDF or CSV

## Generating an Evidence Inventory

1. Go to **Reports → Evidence Inventory**
2. Filter by status, control, or date range as needed
3. Click **Export** to download a complete inventory list

## Generating a POA&M Report

1. Go to **Reports → POA&M Report**
2. Filter by status (Open, In Progress, Closed) and risk level
3. Click **Export** to download

## Preparing an Assessor Package

1. Go to **Assessor** in the sidebar
2. Review the list of assessor-ready controls
3. For each control, verify the evidence and narratives are complete
4. Use **Reports → Audit Readiness** to get an assessor-facing summary
5. The assessor can access Control HUB directly using an Assessor Read-Only account

## Scheduling Regular Reports

While Control HUB does not auto-schedule reports, recommended cadence:
- **Executive report** — Monthly or quarterly for leadership reviews
- **Gap analysis** — Before each CMMC assessment cycle
- **Evidence inventory** — Quarterly to catch stale or expiring evidence
- **POA&M report** — Monthly to track remediation progress`,
  },
  {
    slug: "troubleshooting",
    title: "Troubleshooting Common Issues",
    categoryName: "Troubleshooting",
    module: undefined,
    summary: "Solutions to common issues in Control HUB including login problems, evidence upload errors, and data not loading.",
    keywords: "troubleshooting, error, login, upload, loading, access, permissions, fix",
    sortOrder: 1,
    content: `## Login Issues

### I can't log in — "Invalid credentials"
- Check that caps lock is not on
- Make sure you are using the correct email address
- Use the **Forgot password?** link to reset your password

### My account is locked
Accounts lock after 5 failed login attempts for 15 minutes. Wait 15 minutes, then try again. Contact your admin for immediate unlock.

### I'm not being prompted for MFA but I should be
Your admin may have changed the MFA enforcement policy. Log out and log back in to pick up the new setting.

### My MFA code is not working
- Make sure your device's clock is accurate (TOTP codes are time-based)
- Try the code from the previous or next 30-second window
- If your authenticator app is out of sync, re-sync the time in the app settings
- Use a recovery code if available

## Evidence & File Issues

### My file upload failed
- Maximum file size is 50 MB
- Supported formats: images, PDF, Word, Excel, text, CSV, JSON
- Check your internet connection and try again

### Evidence preview is not working
Some file types cannot be previewed in the browser. Download the file instead.

### Evidence is not showing as "Approved"
Evidence must be reviewed and approved by a Reviewer or Compliance Manager. Check the status filter — it may be in Submitted or Rejected status.

## Data Not Loading

### Page shows "Loading..." indefinitely
- Refresh the page
- Check your internet connection
- Log out and log back in
- Contact your admin if the issue persists

### Controls show 0% readiness but I have approved evidence
Evidence must be linked to the control AND in Approved status. Check the Evidence tab on the control to confirm the link and status.

## Access Issues

### I can't see a module in the sidebar
Your role may not have access to that module. See the User Roles Guide or contact your admin.

### I get "Access denied" on a page
You may not have permission for that action. Your role determines what you can do. Contact your admin to request a role change.

## Contact Support

If you cannot resolve an issue using this guide, contact us at **info@carmetechnology.com**.`,
  },
];

export const FAQ_ITEMS: FaqSeed[] = [
  {
    question: "What is Control HUB?",
    answer: "Control HUB is a multi-tenant CMMC Compliance Readiness & Evidence Management Platform. It helps organizations prepare for CMMC (Cybersecurity Maturity Model Certification) by tracking controls, managing evidence, monitoring operational compliance, and generating assessor-ready packages.",
    category: "General",
    sortOrder: 1,
  },
  {
    question: "Is this an official CMMC assessment?",
    answer: "No. Control HUB is a readiness and evidence management tool, not an official CMMC assessment. CMMC certification requires an assessment by an accredited C3PAO (Certified Third-Party Assessment Organization). Control HUB helps you prepare for that assessment by tracking your compliance posture and organizing evidence.",
    category: "General",
    sortOrder: 2,
  },
  {
    question: "What does 'Tenant Scan Health' mean?",
    answer: "Tenant Scan Health indicates the quality of data received from your Microsoft 365 tenant during a pre-assessment. 'Healthy' means all data sources are available. 'Degraded' means some sources are unavailable (e.g., Intune is not licensed). 'Error' means the connection failed or permissions are missing.",
    category: "Pre-Assessment",
    sortOrder: 3,
  },
  {
    question: "What does 'Controls Touched by Tenant Scan' mean?",
    answer: "This shows how many of the 110 CMMC controls were analyzed during your pre-assessment run. Controls where the scan had data to evaluate are 'touched'. Controls that could not be evaluated (due to missing data sources or insufficient permissions) are not touched.",
    category: "Pre-Assessment",
    sortOrder: 4,
  },
  {
    question: "Why does evidence start as 'Draft'?",
    answer: "Evidence starts as Draft to support a review workflow. Unreviewed evidence should not count toward compliance readiness — it must be validated by a Reviewer or Compliance Manager first. Once approved, Draft evidence advances to Approved status and counts toward control readiness.",
    category: "Evidence",
    sortOrder: 5,
  },
  {
    question: "What is the difference between Evidence and Documents?",
    answer: "Evidence is documentation that proves a control is implemented (screenshots, configs, audit logs, etc.). Documents are formal organizational documents that define how you operate (policies, procedures, plans). A policy document can also be uploaded as evidence linking it to a control, but they serve different purposes.",
    category: "Evidence",
    sortOrder: 6,
  },
  {
    question: "What is the difference between Implementation and Configure?",
    answer: "The Implementation tab on a control is where you write the narrative describing how your organization meets the control requirement. The Configure tab contains step-by-step technical configuration tasks — actionable checklist items for IT staff to work through when technically implementing the control.",
    category: "Controls",
    sortOrder: 7,
  },
  {
    question: "What does 'Current' mean in the Monitoring Tracker?",
    answer: "'Current' means the monitoring item has been completed within the required frequency window (e.g., within the last 30 days for a monthly item). It is the desired status — no action is required. Items become 'In Progress' when they are due within 30 days and 'Overdue' when they pass their due date.",
    category: "Monitoring",
    sortOrder: 8,
  },
  {
    question: "Why is a monitoring item overdue?",
    answer: "A monitoring item becomes overdue when today's date exceeds the calculated Next Due date (Last Completed + Frequency). If no completion has ever been recorded, the item may have been overdue since it was created. To resolve it, complete the review and record the completion date in the tracker.",
    category: "Monitoring",
    sortOrder: 9,
  },
  {
    question: "How do I upload evidence?",
    answer: "You can upload evidence from two places: (1) The Evidence page — click Upload Evidence, fill in the details, select your file, and link it to controls. (2) A Control Detail page — open the control, click the Evidence tab, and click Upload Evidence. New evidence starts as Draft and must be approved by a reviewer.",
    category: "Evidence",
    sortOrder: 10,
  },
  {
    question: "How do I bulk upload evidence?",
    answer: "Go to the Evidence page and click Bulk Upload. You can select multiple files at once. After selecting files, assign a title and link controls to each file, then click Save. All files will be uploaded and linked to their respective controls.",
    category: "Evidence",
    sortOrder: 11,
  },
  {
    question: "How do I link evidence to multiple controls?",
    answer: "When uploading evidence, use the 'Linked Controls' field to search for and select multiple controls. You can also go to a Control Detail page, click the Evidence tab, and click 'Link Existing' to link already-uploaded evidence to that control.",
    category: "Evidence",
    sortOrder: 12,
  },
  {
    question: "How do I remove evidence from a control without deleting it?",
    answer: "Open the Control Detail page, click the Evidence tab, and click the unlink icon next to the evidence item. This removes the link between the evidence and the control, but the evidence file remains in your evidence repository and can be relinked or linked to other controls.",
    category: "Evidence",
    sortOrder: 13,
  },
  {
    question: "How do I create a POA&M?",
    answer: "Go to POA&Ms in the sidebar and click Add POA&M, or open a Control Detail page and click the POA&M tab. Fill in the title, description, linked control, risk level, target completion date, and milestones. Click Save. The POA&M will appear in your POA&M list with Open status.",
    category: "POA&M",
    sortOrder: 14,
  },
  {
    question: "How do I close a POA&M?",
    answer: "Open the POA&M detail page. Upload evidence proving the gap is resolved. Click Close POA&M and add a remediation description explaining what was done to fix the gap. The status changes to Closed and the record is retained for audit purposes.",
    category: "POA&M",
    sortOrder: 15,
  },
  {
    question: "How do I generate a report?",
    answer: "Go to Reports in the sidebar and select the report type (Executive Readiness, Gap Analysis, Evidence Inventory, etc.). Configure any filters and click Generate or Export. Reports can be downloaded as PDF or CSV. For an assessor package, use the Assessor section in the sidebar.",
    category: "Reports",
    sortOrder: 16,
  },
  {
    question: "What can an Assessor Read-Only user see?",
    answer: "Assessor Read-Only users can view assessor packages and control details, download evidence and reports, and view control narratives and SSP content. They cannot create, modify, or delete any data. This role is designed for external CMMC assessors who need to review your compliance documentation.",
    category: "Users & Roles",
    sortOrder: 17,
  },
  {
    question: "How do I invite a user?",
    answer: "Go to Users in the Admin section of the sidebar and click Invite User. Enter the user's email, name, role, and organization. Click Send Invitation. The user receives an email with a link valid for 7 days to set their password and activate their account.",
    category: "Users & Roles",
    sortOrder: 18,
  },
  {
    question: "How do I reset a password?",
    answer: "Users can reset their own password from the login page by clicking 'Forgot password?' and entering their email. Admins can also send a password reset email from the Users management page by clicking the action menu next to a user and selecting 'Send Reset Email'.",
    category: "MFA & Login",
    sortOrder: 19,
  },
  {
    question: "How does MFA work?",
    answer: "When MFA is enabled for your account, after entering your password you will be prompted for a 6-digit code from an authenticator app (Google Authenticator, Microsoft Authenticator, Authy, etc.). Set up MFA by scanning the QR code in Settings → Security. Save your recovery codes in a secure location in case you lose access to your authenticator.",
    category: "MFA & Login",
    sortOrder: 20,
  },
  {
    question: "How do I connect a Microsoft tenant?",
    answer: "Go to Pre-Assessment → Tenant Connections and click Add Connection. You will be redirected to Microsoft's consent page where a Global Admin must approve the required permissions. Once approved, the tenant connection is saved and ready to use for pre-assessments.",
    category: "Pre-Assessment",
    sortOrder: 21,
  },
  {
    question: "What Microsoft permissions are required?",
    answer: "Control HUB requires these Microsoft Graph API permissions: DeviceManagementConfiguration.Read.All (read Intune device policies), Policy.Read.All (read conditional access policies), AuditLog.Read.All (read Azure AD audit logs), and Directory.Read.All (read directory objects). All permissions are read-only.",
    category: "Pre-Assessment",
    sortOrder: 22,
  },
  {
    question: "Why might Intune data be unavailable?",
    answer: "Intune data may be unavailable if: (1) Intune is not licensed in your Microsoft 365 tenant, (2) the service account used for the connection lacks DeviceManagementConfiguration.Read.All permission, or (3) a conditional access policy is blocking the API connection. Check the Tenant Scan Health indicator for details.",
    category: "Pre-Assessment",
    sortOrder: 23,
  },
];
