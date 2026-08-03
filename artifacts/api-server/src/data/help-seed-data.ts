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
  // Capability-based visibility (user must have ALL listed capabilities)
  requiredCapabilities?: string[];
  // Package gating (org must have at least ONE of these package keys)
  packageKeys?: string[];
  // Module gating (ALL listed modules must be enabled)
  moduleKeys?: string[];
  sortOrder: number;
  featured?: boolean;
  popular?: boolean;
  estimatedReadMinutes?: number;
  lastReviewedAt?: Date;
  contentVersion?: string;
}

export interface FaqSeed {
  question: string;
  answer: string;
  category: string;
  requiredCapabilities?: string[];
  packageKeys?: string[];
  moduleKey?: string;
  sortOrder: number;
}

export const HELP_MODULE_LABELS: Record<string, string> = {
  "dashboard": "Dashboard",
  "controls": "Controls & Requirements",
  "evidence": "Evidence",
  "documents": "Documentation",
  "ssp": "SSP",
  "monitoring": "Monitoring Tracker",
  "poams": "POA&M",
  "roadmap": "Implementation Roadmap",
  "pre-assessment": "Pre-Assessment",
  "reports": "Reports & Exports",
  "users": "Users & Roles",
  "organizations": "Organizations & Modules",
  "settings": "Settings",
  "dfars": "DFARS",
  "crosswalk": "Framework Crosswalk",
  "tasks": "Tasks",
  "certification": "Certification & Sustainment",
  "mfa": "MFA & Sign-In",
  "sso": "Microsoft SSO",
  "PRE_ASSESSMENT": "Pre-Assessment",
  "IMPLEMENTATION_ROADMAP": "Implementation Roadmap",
};

export const HELP_CATEGORIES: HelpCategorySeed[] = [
  { name: "Getting Started",          description: "Introduction to Control HUB, compliance packages, and first steps",                              icon: "Rocket",          sortOrder: 1  },
  { name: "Dashboard",                description: "Understanding your compliance dashboard and readiness KPIs",                                     icon: "LayoutDashboard", sortOrder: 2  },
  { name: "Controls & Requirements",  description: "CMMC control library, views, implementation, and assessment readiness",                         icon: "ShieldCheck",     sortOrder: 3  },
  { name: "Tasks",                    description: "Creating, assigning, and managing control implementation tasks",                                 icon: "CheckSquare",     sortOrder: 4  },
  { name: "Evidence",                 description: "Uploading, reviewing, approving, and managing compliance evidence",                             icon: "FileText",        sortOrder: 5  },
  { name: "Framework Crosswalk",      description: "Mapping requirements between CMMC, NIST SP 800-171, FAR, and DFARS",                           icon: "GitMerge",        sortOrder: 6  },
  { name: "DFARS Obligations",        description: "DFARS contract clauses, incident reporting, and flowdown requirements",                         icon: "Scale",           sortOrder: 7  },
  { name: "Monitoring Tracker",       description: "Recurring operational reviews and compliance monitoring schedules",                             icon: "Activity",        sortOrder: 8  },
  { name: "POA&M Management",         description: "Plan of Action and Milestones for tracking and closing compliance gaps",                        icon: "AlertTriangle",   sortOrder: 9  },
  { name: "Implementation Roadmap",   description: "Prioritized compliance actions and implementation progress tracking",                           icon: "Map",             sortOrder: 10 },
  { name: "Pre-Assessment",           description: "Microsoft 365 tenant analysis mapped to CMMC controls",                                        icon: "Cable",           sortOrder: 11 },
  { name: "Documentation",            description: "Policy and procedure templates, document generation, and review workflow",                      icon: "BookOpen",        sortOrder: 12 },
  { name: "System Security Plan",     description: "SSP templates, prefill wizard, narratives, and export for assessors",                          icon: "FileCheck",       sortOrder: 13 },
  { name: "Reports & Exports",        description: "Generating and exporting compliance reports and assessor packages",                             icon: "BarChart3",       sortOrder: 14 },
  { name: "Users & Roles",            description: "Platform roles, organization roles, effective permissions, and invitations",                    icon: "Users",           sortOrder: 15 },
  { name: "Organizations & Modules",  description: "Organization management, packages, and optional module configuration",                         icon: "Building2",       sortOrder: 16 },
  { name: "MFA, SSO & Sign-In",       description: "Authentication, Microsoft SSO, MFA setup, and account recovery",                               icon: "Lock",            sortOrder: 17 },
  { name: "Workflows",                description: "Step-by-step guides for common compliance tasks",                                               icon: "GitBranch",       sortOrder: 18 },
  { name: "Troubleshooting",          description: "Common issues, error messages, and how to resolve them",                                       icon: "Wrench",          sortOrder: 19 },
];

export const HELP_ARTICLES: HelpArticleSeed[] = [
  // ── A1: Getting Started ────────────────────────────────────────────────────
  {
    slug: "getting-started",
    title: "Getting Started with Control HUB",
    categoryName: "Getting Started",
    module: "dashboard",
    summary: "Learn how to navigate Control HUB, select your organization, understand your role and effective permissions, and take your first compliance actions.",
    keywords: "getting started, onboarding, organization, navigation, dashboard, first steps, roles, platform role, org role",
    sortOrder: 1,
    popular: true,
    featured: true,
    estimatedReadMinutes: 5,
    lastReviewedAt: new Date("2026-08-03"),
    contentVersion: "2.0",
    content: `## Welcome to Control HUB

Control HUB is a multi-tenant CMMC Compliance Readiness & Evidence Management Platform. It helps organizations track controls, manage evidence, complete documentation, and prepare for formal CMMC assessments. This guide covers everything you need to get up and running.

## Selecting Your Organization

If you have access to more than one organization, you will see an **organization switcher** at the top of the sidebar. Click it to switch between organizations. All data — controls, evidence, tasks, POA&Ms, documents — is scoped to the currently selected organization. Switching organizations changes what you see and what you can do.

## Understanding Your Role

Control HUB uses a **two-tier role model**:

### Platform Role
Your platform role is set once and applies across the entire system:
- **None** — Your access is entirely determined by your organization memberships. You have no platform-wide authority. This is the correct platform role for most users.
- **Global Admin** — Platform-wide administrative authority. Can manage all organizations, all users, and all platform settings.

### Organization Role
Your organization role is set per organization. You may have different roles in different organizations:
- **Organization Admin** — Full access within that organization, including user management and module configuration
- **Compliance Manager** — Primary compliance role: manages controls, evidence, documents, tasks, POA&Ms, and reports
- **IT Contributor** — Technical implementation role: uploads evidence, completes monitoring tasks, updates control notes
- **Reviewer** — Review and approval role: approves or rejects evidence and documents
- **Executive Viewer** — Read-only access to dashboards and executive-level compliance summaries
- **Assessor Read-Only** — Read-only access to assessor packages, control narratives, evidence, and SSP; designed for external CMMC assessors
- **Demo Viewer** — Read-only demonstration access; cannot create or modify any data

A user with Platform Role **None** can still be an **Organization Admin** in one organization and an **IT Contributor** in another — their effective permissions depend on which organization is selected.

## Navigating the Sidebar

The sidebar provides access to all platform modules:

- **Dashboard** — Compliance overview and KPI cards
- **Controls & Requirements** — Your assigned controls library
- **Tasks** — Control implementation tasks
- **Evidence** — Your evidence repository
- **Monitoring Tracker** — Recurring operational review schedule
- **POA&Ms** — Plan of Action & Milestones
- **Implementation Roadmap** — Prioritized compliance actions *(if enabled)*
- **Pre-Assessment** — Tenant-connected automated analysis *(if enabled)*
- **Documentation** — Policies, procedures, and templates
- **SSP** — System Security Plan management
- **Reports** — Export compliance reports

## First Recommended Actions by Role

**Organization Admin / Compliance Manager:**
1. Review the **Dashboard** — check your readiness KPIs
2. Browse **Controls & Requirements** — find controls marked Not Implemented
3. Upload **Evidence** — attach documentation to implemented controls
4. Check **Monitoring Tracker** — resolve overdue items
5. Review **POA&Ms** — confirm open remediation items are tracked

**IT Contributor:**
1. Go to **Tasks** — find tasks assigned to you
2. Open assigned **Controls** — review implementation steps and upload evidence
3. Check **Monitoring Tracker** — complete any reviews assigned to your team

**Reviewer:**
1. Go to **Evidence** — filter by Submitted status and approve or reject items
2. Go to **Documentation** — review documents submitted for approval

**Executive Viewer / Assessor Read-Only:**
1. Start at the **Dashboard** — review readiness scores and domain charts
2. Browse **Reports** for a formatted compliance summary`,
  },

  // ── A2: Dashboard Guide ────────────────────────────────────────────────────
  {
    slug: "dashboard-guide",
    title: "Dashboard Guide",
    categoryName: "Dashboard",
    module: "dashboard",
    summary: "Understand your compliance dashboard KPI cards, domain readiness chart, activity timeline, and recommended next actions.",
    keywords: "dashboard, readiness score, KPI, domain readiness, evidence health, monitoring, recommended actions, compliance posture",
    sortOrder: 1,
    popular: true,
    estimatedReadMinutes: 4,
    lastReviewedAt: new Date("2026-08-03"),
    contentVersion: "2.0",
    content: `## Dashboard Overview

The Dashboard provides a real-time executive view of your CMMC compliance posture. Metrics are calculated against the compliance packages assigned to your organization — a Level 1 organization will see readiness across its 17 assigned controls; a Level 2 organization will see readiness across its 110 assigned controls. The dashboard refreshes on every page load.

## KPI Cards

### Controls Readiness
The percentage of your assigned controls that are **Implemented** — meaning they have at least one approved evidence item and a completed implementation narrative. This is your primary compliance metric.

### Evidence Health
The percentage of evidence items in **Approved** status. Strong evidence health means reviewers have validated your uploaded documentation.

### Monitoring Health
The percentage of monitoring items that are **Current** (not overdue). Overdue monitoring indicates gaps in your ongoing operational compliance.

### POA&M Status
A count of open vs. closed Plan of Action & Milestones items. High-risk open POA&Ms indicate unresolved compliance gaps that need attention.

### Active Policies / Active Procedures
Count of active policy and procedure documents in your Documentation library. Many CMMC controls require documented policies and procedures in Active status.

## Domain Readiness Chart

Shows implementation percentage for each of the 14 CMMC domains:

**AC** (Access Control) · **AT** (Awareness & Training) · **AU** (Audit & Accountability) · **CM** (Configuration Management) · **IA** (Identification & Authentication) · **IR** (Incident Response) · **MA** (Maintenance) · **MP** (Media Protection) · **PS** (Personnel Security) · **RA** (Risk Assessment) · **CA** (Security Assessment) · **SC** (System & Communications Protection) · **SI** (System & Information Integrity)

Click any domain bar to navigate to the Controls page filtered to that domain.

## Recent Activity

The last 20 audit events across your organization — evidence uploads, control status changes, document approvals, user actions, task updates, and more. Each event shows the actor, action, and timestamp.

## Recommended Next Actions

The system surfaces the highest-priority actions to improve your compliance posture:
- Controls missing evidence
- Overdue monitoring items
- Expired or stale evidence
- Open high-risk POA&Ms
- Missing required policy or procedure documents

Each recommended action links directly to the relevant control, evidence item, or monitoring record.`,
  },

  // ── A3: Controls Guide ─────────────────────────────────────────────────────
  {
    slug: "controls-guide",
    title: "Controls & Requirements Guide",
    categoryName: "Controls & Requirements",
    module: "controls",
    summary: "Learn how to use the CMMC control library, understand control views, assess controls, link evidence, and achieve Assessor Ready status.",
    keywords: "controls, CMMC, assessment, evidence, implementation, configure, monitoring, POA&M, SSP, status, domain, Level 1, Level 2",
    sortOrder: 1,
    popular: true,
    estimatedReadMinutes: 6,
    lastReviewedAt: new Date("2026-08-03"),
    contentVersion: "2.0",
    content: `## The Control Library

The Controls & Requirements page shows the controls from your organization's active compliance packages:

- **CMMC Level 1 organizations** — 17 FCI/CMMC L1 controls mapped to FAR 52.204-21 practices (e.g., AC.L1-3.1.1)
- **CMMC Level 2 organizations** — 110 NIST SP 800-171/CMMC L2 controls across 14 domains (e.g., AC.L2-3.1.1)

Each control has a unique identifier, a requirement description, and a current implementation status.

## Control Views

Use the view selector at the top of the Controls page to switch between:

- **Domain Overview** — High-level readiness percentage per domain; best for executive or manager review
- **Detailed Table** — Full list of controls with status, evidence count, and last updated date; best for compliance work
- **Readiness Matrix** — Grid view showing implementation status across all domains at once
- **Attention Needed** — Filtered view showing only controls that are Not Implemented, have stale evidence, or have open high-risk POA&Ms
- **Package View** — Controls grouped by assigned compliance package

## Control Statuses

- **Not Implemented** — No evidence or narrative provided; control is an open compliance gap
- **Partially Implemented** — Some evidence or a narrative exists, but the control is not fully addressed
- **Implemented** — Has at least one approved evidence item and a completed narrative; counts as complete
- **Not Applicable** — Does not apply to your organization; must be documented with a justification

## Control Detail Tabs

Opening a control shows the detail view with the following tabs:

### Implementation
Write the narrative describing how your organization meets this control requirement. Explain the tools, processes, and personnel involved. A complete narrative is required for Assessor Ready status.

### Configure
Step-by-step technical configuration tasks linked to this control. IT staff can mark each step complete as they work through implementation.

### Evidence
Attach evidence files to this control. You can upload new evidence, link existing evidence from the repository, or remove a link without deleting the underlying file.

### Tasks
View and create implementation tasks scoped to this control. Tasks track discrete work items assigned to team members.

### Monitoring
View recurring monitoring reviews linked to this control. Shows frequency, last completed date, and next due date.

### POA&M
View and create Plan of Action & Milestones items for this control. Use POA&Ms when a control is not yet implemented and you need to document the remediation plan.

### SSP
Edit the System Security Plan narrative for this control. SSP narratives are used in the formal assessment package.

## What Makes a Control Assessor Ready

A control reaches **Assessor Ready** status when all of the following are true:

1. A completed implementation narrative has been written on the Implementation tab
2. At least one evidence item is in **Approved** status and linked to this control
3. There are no open **Critical** or **High** risk POA&Ms for this control

Assessor Ready controls are highlighted in the Detailed Table view and appear in the Assessor package.`,
  },

  // ── A4: Tasks Guide ────────────────────────────────────────────────────────
  {
    slug: "tasks-guide",
    title: "Tasks Guide",
    categoryName: "Tasks",
    module: "tasks",
    summary: "Learn how to create, assign, and manage control implementation tasks in Control HUB.",
    keywords: "tasks, task management, assign, due date, priority, TASK-XXXX, lifecycle, open, in progress, blocked, closed, cancelled",
    sortOrder: 1,
    estimatedReadMinutes: 5,
    lastReviewedAt: new Date("2026-08-03"),
    contentVersion: "2.0",
    content: `## What Are Control Tasks?

Tasks are scoped implementation work items linked to specific CMMC controls. Each task is assigned a unique identifier (e.g., **TASK-0042**) and tracks discrete compliance work from assignment to completion. Tasks help compliance teams coordinate who is doing what and by when.

## Task Lifecycle

Tasks move through the following statuses:

**Open** → **In Progress** → **Blocked** → *(back to)* **In Progress** → **Closed**

A task can also be **Cancelled** if it is no longer needed.

- **Open** — Task has been created and assigned but work has not started
- **In Progress** — The assignee is actively working on this task
- **Blocked** — Work cannot proceed due to a dependency or issue; a blocker note should be added
- **Closed** — Work is complete; the task has been resolved
- **Cancelled** — Task is no longer required; it will not be closed or counted toward progress

## Creating a Task

Tasks can be created from a control's **Tasks tab**:

1. Open a control from the Controls & Requirements page
2. Click the **Tasks** tab
3. Click **Create Task**
4. Fill in:
   - **Title** — Short description of the work (e.g., "Enable MFA for all admin accounts")
   - **Description** — Detailed context about what needs to be done
   - **Assignee** — The team member responsible for completing this task
   - **Due Date** — Target completion date
   - **Priority** — Low, Medium, High, or Critical
5. Click **Save**

The task is created in **Open** status and appears in the Tasks list and on the control's Tasks tab.

## Managing Task Status

### Starting a Task
Open the task and click **Start** (or change status to **In Progress**) when work begins.

### Blocking a Task
If work is blocked, change status to **Blocked** and add a note explaining the blocker. The assignee or admin can resolve the blocker and return the task to **In Progress**.

### Closing a Task
When work is complete, open the task and click **Close Task**. Add a completion note describing what was done.

### Reopening a Task
Closed tasks can be reopened if additional work is required. Change the status back to **In Progress**.

### Cancelling a Task
If a task is no longer needed, use **Cancel Task** to remove it from active tracking without closing it as complete.

## Understanding Task Views

The Tasks page shows:
- **Active** — All Open, In Progress, and Blocked tasks
- **Overdue** — Tasks past their due date that are not yet closed
- **Closed** — Completed tasks retained for audit trail

## Activity Log

Each task maintains an activity log showing every status change, note added, and reassignment. This provides an audit trail of the implementation work.`,
  },

  // ── A5: Evidence Guide ─────────────────────────────────────────────────────
  {
    slug: "evidence-guide",
    title: "Evidence Guide",
    categoryName: "Evidence",
    module: "evidence",
    summary: "Learn how to upload, manage, link, review, approve, and preview evidence for CMMC compliance.",
    keywords: "evidence, upload, approve, reject, link, controls, status, bulk upload, preview, download, draft, submitted, stale",
    sortOrder: 1,
    popular: true,
    estimatedReadMinutes: 6,
    lastReviewedAt: new Date("2026-08-03"),
    contentVersion: "2.0",
    content: `## What is Evidence?

Evidence proves your organization has implemented CMMC controls. It can be screenshots, configuration exports, audit logs, policies, contracts, scan reports, or any file that demonstrates a control is in place. Evidence is stored in a central repository and can be linked to one or more controls.

## Evidence Statuses

- **Draft** — Newly uploaded; not yet reviewed. Does not count toward control readiness.
- **Submitted** — Submitted for review by a Reviewer or Compliance Manager.
- **Approved** — Validated by a reviewer. Counts toward control readiness and implementation status.
- **Rejected** — Deemed insufficient; the uploader should replace or supplement it.
- **Stale** — Evidence has passed its review date and needs refreshing. Stale evidence no longer counts toward readiness until refreshed and re-approved.

## Uploading Evidence

### Option 1: Single Upload from the Evidence Repository
1. Go to **Evidence** in the sidebar → click **Upload Evidence**
2. Fill in:
   - **Title** — Descriptive name for the evidence
   - **Description** — What this evidence proves or demonstrates
   - **Type** — Policy, Procedure, Screenshot, Configuration Export, Audit Log, Report, or Other
   - **Linked Controls** — Search for and select all controls this evidence supports
3. Select your file → click **Save**

### Option 2: Upload from a Control Detail Page
1. Open a control from the Controls & Requirements page
2. Click the **Evidence** tab
3. Click **Upload Evidence**
4. Fill in title, description, and type — the control is pre-linked
5. Select your file → click **Save**

### Option 3: Bulk Upload
From the Evidence page, click **Bulk Upload** to select multiple files at once. After selecting files, assign a title to each and link controls, then click **Save All**.

## Linking Existing Evidence to Additional Controls

If evidence has already been uploaded and you want to link it to an additional control:

1. Open the control → click the **Evidence** tab
2. Click **Link Existing**
3. Search for and select the evidence item
4. Click **Link**

## Removing Evidence from a Control

Open Control Detail → **Evidence** tab → click the unlink icon next to the evidence item. This **removes the link** between the evidence and the control but does **not delete** the evidence from the repository. The file remains available to link to other controls.

## Previewing Files

The evidence preview supports the following formats directly in the browser:
- **Images** — PNG, JPG, GIF, WebP, SVG
- **Documents** — PDF (inline viewer), DOCX (converted to HTML), XLSX (rendered as table)
- **Text files** — TXT, CSV, JSON, YAML

Files not supported for preview can be downloaded for local review.

## Submitting Evidence for Review

New evidence starts in **Draft** status. To make it count toward control readiness:

1. Open the evidence item
2. Click **Submit for Review**
3. A Reviewer or Compliance Manager reviews and approves or rejects it
4. Once **Approved**, the evidence counts toward the linked control's implementation status

## Evidence Naming Convention

A consistent naming convention helps teams find and organize evidence:

**Recommended format:** \`[Domain]-[Control ID]-[Type]-[YYYY-MM].ext\`

**Example:** \`AC-3.1.1-Screenshot-MFA-Config-2025-06.png\``,
  },

  // ── A6: Documentation Guide ────────────────────────────────────────────────
  {
    slug: "documentation-guide",
    title: "Documentation Guide",
    categoryName: "Documentation",
    module: "documents",
    summary: "Learn how to manage policy and procedure documents, use the template library, generate documents, and track the review workflow.",
    keywords: "documents, policies, procedures, templates, generate, compliance logs, checklists, gap analysis, workflow, active, expired",
    sortOrder: 1,
    popular: true,
    estimatedReadMinutes: 5,
    lastReviewedAt: new Date("2026-08-03"),
    contentVersion: "2.0",
    content: `## Documentation Overview

The Documentation module manages formal policy and procedure documents required for CMMC compliance. Unlike evidence (which proves controls are implemented), documents define how your organization operates. Many CMMC controls explicitly require written policies and procedures as part of a complete implementation.

## Document Status Workflow

Documents follow a structured review and approval lifecycle:

**Draft** → **Under Review** → **Active** → *(Expired or Archived)*

- **Draft** — Initial state after creation or upload; visible only to the creator and admins
- **Under Review** — Submitted for review; a Reviewer or Compliance Manager must approve
- **Active** — Approved and in force; counts toward control readiness for linked controls
- **Expired** — Past the scheduled review date; must be renewed before it counts again
- **Archived** — Retired from active use; retained for historical record

## Template Library

The Template Library contains **over 85 CMMC-aligned templates** — including both Level 1 (19 templates covering FCI/CMMC L1 practices) and Level 2 (67 templates covering NIST SP 800-171/CMMC L2 requirements) — organized by control domain and document type.

**Level 1 templates** cover foundational FCI policies and procedures applicable to all DoD contractors.

**Level 2 templates** cover the full NIST SP 800-171 / CMMC L2 requirement set, including domain-specific policies, incident response plans, system security procedures, and more.

### Generating a Document from a Template

1. Go to **Documentation → Template Library**
2. Browse or search for the template you need (e.g., "Access Control Policy")
3. Click **Generate Document** on the template card
4. The generation wizard pre-fills organization-specific information
5. Review and customize the generated content
6. Click **Save** — the document is created in **Draft** status in All Documents

## Submitting for Review and Approval

1. Open the document → click **Submit for Review**
2. A Reviewer or Compliance Manager receives the review notification
3. The reviewer reads the document and clicks **Approve** or **Request Changes**
4. On approval, the document moves to **Active** status
5. Active documents count toward control readiness for their linked controls

## Gap Analysis

The **Gap Analysis** page shows which required CMMC policy and procedure documents are missing from your library. Use it to identify which templates you need to generate next to achieve full documentation coverage.`,
  },

  // ── A7: SSP Guide ──────────────────────────────────────────────────────────
  {
    slug: "ssp-guide",
    title: "System Security Plan (SSP) Guide",
    categoryName: "System Security Plan",
    module: "ssp",
    summary: "Learn how to create, manage, and export your System Security Plan for CMMC compliance, including the prefill wizard and assessor export.",
    keywords: "SSP, system security plan, sections, narratives, control mapping, export, CMMC, prefill wizard, FCI SSP, Level 1, Level 2",
    sortOrder: 1,
    estimatedReadMinutes: 6,
    lastReviewedAt: new Date("2026-08-03"),
    contentVersion: "2.0",
    content: `## What is a System Security Plan?

A System Security Plan (SSP) is a formal document that describes your information system, its security boundary, and how each applicable control is implemented. It is a required artifact for CMMC compliance.

- **Level 1 organizations** produce an FCI SSP describing implementation of the 17 foundational FCI/CMMC L1 practices
- **Level 2 organizations** produce a NIST SP 800-171 SSP describing implementation of all 110 CMMC L2 controls

The SSP is the primary document your CMMC assessor reviews. A well-completed SSP significantly reduces assessment time and back-and-forth.

## SSP Sections

Navigate to **SSP → Sections** to view and edit each section of your SSP:

- **System Information** — System name, description, boundary definition, and architecture overview
- **Roles and Responsibilities** — System owner, security officer, and key personnel with security responsibilities
- **System Environment** — Hardware, software, network topology, and interconnections
- **Control Implementations** — Per-control narratives describing how each requirement is met (populated from the SSP tab on each Control Detail page)
- **Attachments** — Network diagrams, data flow diagrams, and other supporting documentation

## SSP Prefill Wizard

The **SSP Prefill Wizard** generates a pre-filled SSP draft by combining:
- Your organization's profile data (name, industry, description)
- Control narratives you have written on the Implementation tab of each control
- Evidence linked to controls

To use the wizard:
1. Go to **SSP → Prefill Wizard**
2. Review the pre-filled content — the wizard pulls from your existing control work
3. Fill in any missing sections
4. Click **Generate** to produce a downloadable SSP document

## Downloading and Uploading the SSP

- **Download prefilled SSP** — Available as PDF (for assessors) or DOCX (for editing in Word)
- **Upload completed SSP** — Upload your finalized SSP document as an attachment for record-keeping and assessor access

## Control Mapping

**SSP → Control Mapping** shows how your controls map to SSP sections. Use it to identify which controls still need SSP narratives and ensure complete coverage before an assessment.

## Editing Control SSP Narratives

You can write SSP narratives for individual controls from:
1. **SSP → Sections** → find the control implementation section → click **Edit**
2. A control's **SSP tab** → write or update the narrative inline

Both methods update the same underlying narrative used in SSP exports.`,
  },

  // ── A8: Monitoring Guide ───────────────────────────────────────────────────
  {
    slug: "monitoring-guide",
    title: "Monitoring Tracker Guide",
    categoryName: "Monitoring Tracker",
    module: "monitoring",
    summary: "Understand the monitoring tracker, how recurring reviews work, status meanings, frequency logic, and how to record completions.",
    keywords: "monitoring, tracker, recurring, frequency, overdue, current, in progress, review, schedule, CMMC, Level 1, Level 2",
    sortOrder: 1,
    popular: true,
    estimatedReadMinutes: 5,
    lastReviewedAt: new Date("2026-08-03"),
    contentVersion: "2.0",
    content: `## What is the Monitoring Tracker?

The Monitoring Tracker schedules recurring operational reviews required for ongoing CMMC compliance. These reviews must be performed on a regular schedule — not just once — to demonstrate that your organization is actively maintaining its security posture.

Monitoring items are automatically seeded based on your organization's CMMC level:
- **Level 1 organizations** have monitoring items covering the FCI/CMMC L1 practices relevant to ongoing operational compliance
- **Level 2 organizations** have a broader set of monitoring items covering the full CMMC L2 practice set

## Monitoring Item Statuses

- **Current** — Review completed within the required frequency window. No action needed.
- **In Progress** — Review is underway or due within 30 days.
- **Overdue** — Review has passed its due date. This is an active compliance gap that must be resolved.

## Frequency Logic

Each monitoring item has a defined review frequency. The **Next Due** date is calculated as:

**Next Due** = Last Completed date + frequency interval

| Frequency | Interval |
|-----------|----------|
| Monthly   | 30 days  |
| Quarterly | 90 days  |
| Annual    | 365 days |

If no completion has ever been recorded for an item, it may show as overdue from the day it was created.

## Recording a Review Completion

1. Go to **Monitoring Tracker** in the sidebar
2. Find the item to complete (look for **Overdue** or **In Progress** status)
3. Click the row to open the detail view
4. Update the fields:
   - **Status** → set to **Current**
   - **Last Completed** → enter today's date
   - **Notes** → describe what was reviewed, who performed it, and any findings
5. Click **Save**

The **Next Due** date automatically recalculates based on the completion date you entered.

## Evidence to Retain

For each monitoring review, retain supporting evidence in the Evidence repository and link it to the relevant control. Examples:

- **Access review** — Screenshot of the user access list + sign-off email
- **Vulnerability scan** — Exported scan report
- **Backup test** — Restoration log or test completion record
- **Log review** — Log analysis summary or exported log report

## What Counts as Overdue?

A monitoring item becomes overdue when today's date exceeds the calculated **Next Due** date. The **Monitoring Health** KPI card on the Dashboard shows the count of overdue monitoring items. An overdue item represents a gap in your operational compliance and should be resolved as soon as possible.`,
  },

  // ── A9: POA&M Guide ────────────────────────────────────────────────────────
  {
    slug: "poam-guide",
    title: "POA&M Management Guide",
    categoryName: "POA&M Management",
    module: "poams",
    summary: "Learn how to create, manage, and close Plan of Action & Milestones items for CMMC compliance gap remediation.",
    keywords: "POAM, plan of action, milestones, remediation, risk, close, controls, compliance gap, audit trail",
    sortOrder: 1,
    estimatedReadMinutes: 5,
    lastReviewedAt: new Date("2026-08-03"),
    contentVersion: "2.0",
    content: `## What is a POA&M?

A Plan of Action & Milestones (POA&M) documents a known compliance gap and the structured plan to remediate it. POA&Ms are a required component of CMMC — assessors use them to verify that your organization is aware of its weaknesses and has a credible, time-bound path to resolution.

A strong POA&M program demonstrates compliance maturity even when controls are not yet fully implemented.

## Creating a POA&M

### From the Sidebar
1. Go to **POA&Ms** in the sidebar → click **Add POA&M**
2. Fill in all required fields (see below)
3. Click **Save**

### From a Control Detail Page
1. Open a control → click the **POA&M** tab
2. Click **Create POA&M** — the control is pre-linked
3. Fill in the remaining fields and click **Save**

## POA&M Fields

- **Title** — Short, descriptive name for the gap (e.g., "MFA not enabled for all privileged accounts")
- **Description** — Detailed explanation of the weakness, its scope, and potential impact
- **Linked Control** — The CMMC control this POA&M addresses
- **Risk Level** — The severity of the compliance gap (see Risk Levels below)
- **Target Completion Date** — The date by which you plan to fully remediate the gap
- **Milestones** — Interim steps toward resolution with individual target dates

## POA&M Statuses

- **Open** — Gap is identified and documented; remediation work has not yet begun
- **In Progress** — Remediation work is actively underway; milestones are being worked through
- **Closed** — Gap has been fully remediated; evidence of resolution has been linked

## Risk Levels

| Level | Description | Recommended Remediation Timeline |
|-------|-------------|-----------------------------------|
| **Critical** | Immediate threat to CUI protection | Urgent — days to weeks |
| **High** | Significant compliance gap | 30–90 days |
| **Medium** | Notable gap with manageable risk | Within 180 days |
| **Low** | Minor gap with limited impact | Within 1 year |

## Closing a POA&M

When remediation is complete:

1. Open the POA&M detail page
2. Upload or link evidence that proves the gap has been resolved
3. Click **Close POA&M**
4. Add a remediation description explaining what was done
5. The POA&M status changes to **Closed**

Closed POA&Ms are retained indefinitely for audit trail purposes. They demonstrate to assessors that your organization resolves identified gaps systematically.`,
  },

  // ── A10: Roadmap Guide ─────────────────────────────────────────────────────
  {
    slug: "roadmap-guide",
    title: "Implementation Roadmap Guide",
    categoryName: "Implementation Roadmap",
    module: "roadmap",
    summary: "Understand the implementation roadmap, priority actions, impact scoring, coverage matrix, and how to track phased compliance progress.",
    keywords: "roadmap, priority actions, impact score, phases, implementation, progress, controls, compliance, Level 1, Level 2, Foundation, Core, Advanced",
    sortOrder: 1,
    popular: true,
    estimatedReadMinutes: 5,
    moduleKeys: ["IMPLEMENTATION_ROADMAP"],
    lastReviewedAt: new Date("2026-08-03"),
    contentVersion: "2.0",
    content: `## What is the Implementation Roadmap?

The Implementation Roadmap provides a prioritized, phased action plan tailored to your organization's compliance packages. It identifies the highest-impact actions to take first, helping teams focus effort where it matters most.

Roadmap guidance is level-aware:
- **Level 1 organizations** — The roadmap focuses on completing the 17 FCI/CMMC L1 practice implementations, uploading supporting evidence, and achieving full Level 1 documentation coverage
- **Level 2 organizations** — The roadmap covers all 110 CMMC L2 practices across three implementation phases: Foundation, Core, and Advanced

## Priority Actions

The **Priority Actions** view lists recommended compliance actions ranked by:

- **Impact Score** — How much completing this action improves your overall readiness percentage
- **Effort Level** — The estimated effort required (Low, Medium, High)
- **Phase** — Which implementation phase this action belongs to (Foundation → Core → Advanced)

Each action is linked to the specific CMMC controls it addresses and shows the projected readiness improvement from completing it.

## Coverage Matrix

The **Coverage Matrix** view maps roadmap actions to the controls they address. Use it to:
- Identify "one-and-done" actions that address multiple controls simultaneously
- Spot coverage gaps where controls are not addressed by any current roadmap action
- Prioritize actions that provide the broadest coverage improvement

## Roadmap Progress

The **Roadmap Progress** view tracks completion across implementation phases:

| Phase | Focus |
|-------|-------|
| **Foundation** | Access control, identification, basic configuration management |
| **Core** | Audit, incident response, system protection, media handling |
| **Advanced** | Risk assessment, security assessment, advanced monitoring |

Each phase shows total actions, completed actions, and estimated readiness improvement from completing remaining actions.

## How to Use the Roadmap

1. Open **Priority Actions** — sort by Impact Score (highest first)
2. Pick the highest-impact, lowest-effort actions to tackle first
3. As you complete each action, upload evidence to the linked controls and write implementation narratives
4. Mark milestones complete and move to the next phase

## Important: Evidence Still Required

Completing a roadmap action does **not** automatically mark the linked controls as Implemented. You must still:
- Upload and get approved evidence linked to each control
- Write a completed implementation narrative on the control's Implementation tab

The roadmap guides your effort; evidence and narratives are what formally demonstrate compliance.`,
  },

  // ── A11: What Is Pre-Assessment (no module gate) ───────────────────────────
  {
    slug: "pre-assessment-what-is",
    title: "What Is Pre-Assessment?",
    categoryName: "Pre-Assessment",
    module: "pre-assessment",
    summary: "Learn what the Pre-Assessment module is, what it analyzes, and whether it is right for your organization.",
    keywords: "pre-assessment, what is, tenant scan, Microsoft 365, CMMC readiness, optional module, configuration analysis",
    sortOrder: 1,
    estimatedReadMinutes: 4,
    moduleKeys: [],
    lastReviewedAt: new Date("2026-08-03"),
    contentVersion: "2.0",
    content: `## What is Pre-Assessment?

The Pre-Assessment module connects Control HUB to your Microsoft 365 tenant and analyzes your actual security configurations against CMMC control requirements. It performs automated, read-only checks across your Microsoft environment and maps the findings to your assigned controls.

**Important:** Pre-Assessment is NOT an official CMMC assessment and does not certify compliance. Results do not constitute a CMMC score. Pre-Assessment is a readiness tool that helps identify configuration gaps before a formal assessment by a certified C3PAO.

## What Pre-Assessment Analyzes

Pre-Assessment reads configuration data from your Microsoft 365 tenant using read-only Microsoft Graph API permissions:

- **Intune device configurations** — Endpoint security policies, device compliance policies, and configuration profiles mapped to CMMC device management controls
- **Conditional access policies** — MFA enforcement, sign-in risk policies, and access control configurations
- **Azure AD / Entra ID settings** — Directory configurations, user settings, and authentication policies
- **Audit log availability** — Whether audit logging is enabled and accessible

## Tenant Health Indicators

After connecting a tenant, Control HUB shows a **Tenant Scan Health** status:

- **Healthy** — All data sources are available and returning complete results
- **Degraded** — Some data sources are unavailable (e.g., Intune is not licensed); findings in those areas will show as Insufficient Data
- **Error** — The connection failed or required permissions are missing

## Confidence Scoring

Each finding includes an **Assessment Confidence** indicator showing how much data was available to evaluate that control. Lower confidence means fewer data sources were accessible, not necessarily that the control is failing.

## Evidence Requests

For controls that Pre-Assessment cannot automatically verify through tenant data, it generates **evidence requests** — a list of manual evidence items you should upload to the Evidence repository to support those controls.

## Is Pre-Assessment Right for Your Organization?

Pre-Assessment is most valuable for organizations that:
- Use Microsoft 365 / Azure AD as their primary identity and device management platform
- Are in the planning or gap-assessment phase before a formal CMMC audit
- Want to reduce the manual effort of mapping Microsoft configurations to CMMC controls

**Pre-Assessment is an optional module.** It must be enabled for your organization by an Organization Admin or Global Admin before it becomes available. See the *Enabling or Disabling Pre-Assessment* article for setup instructions.`,
  },

  // ── A12: Pre-Assessment Guide (module gated) ──────────────────────────────
  {
    slug: "pre-assessment-guide",
    title: "Pre-Assessment Guide",
    categoryName: "Pre-Assessment",
    module: "pre-assessment",
    summary: "Learn how to connect your Microsoft tenant, run an automated CMMC readiness scan, interpret findings, and act on evidence requests.",
    keywords: "pre-assessment, tenant scan, Microsoft, Intune, Azure AD, findings, evidence requests, roadmap, CMMC, connect tenant, Graph permissions",
    sortOrder: 2,
    popular: true,
    estimatedReadMinutes: 7,
    moduleKeys: ["PRE_ASSESSMENT"],
    lastReviewedAt: new Date("2026-08-03"),
    contentVersion: "2.0",
    content: `## Overview

The Pre-Assessment module performs an automated CMMC readiness analysis by connecting to your Microsoft 365 tenant. It analyzes your actual security configuration and maps findings to your assigned CMMC controls.

**Important:** Pre-Assessment must be enabled for your organization before you can use it. Contact your Organization Admin if you do not see Pre-Assessment in the sidebar.

Pre-Assessment results are NOT an official CMMC score or certification. They are a readiness indicator to help guide your compliance work.

## Step 1: Connect Your Microsoft Tenant

1. Go to **Pre-Assessment → Tenant Connections**
2. Click **Add Connection**
3. Enter a display name for this connection (e.g., your company's tenant domain)
4. Click **Connect with Microsoft** — you will be redirected to Microsoft's admin consent page
5. Sign in with a Microsoft 365 **Global Admin** account
6. Review the requested permissions and click **Accept**
7. You will be redirected back to Control HUB — the connection is now saved

### Required Microsoft Graph Permissions

All permissions are **read-only**. Control HUB does not write to or modify your Microsoft tenant.

| Permission | Purpose |
|------------|---------|
| \`DeviceManagementConfiguration.Read.All\` | Read Intune device configuration policies |
| \`Policy.Read.All\` | Read conditional access and security policies |
| \`AuditLog.Read.All\` | Read Azure AD audit logs |
| \`Directory.Read.All\` | Read directory objects and user settings |

## Step 2: Run an Assessment

1. Go to **Pre-Assessment → Run Assessment**
2. Select your tenant connection from the dropdown
3. Select the controls to assess (or select all assigned controls)
4. Click **Run Assessment** — the scan typically completes in 2–5 minutes

## Step 3: Review Tenant Scan Health

After the scan completes, check the **Tenant Scan Health** indicator:

- **Healthy** — All data sources returned results; high confidence findings
- **Degraded** — Some data sources were unavailable (e.g., Intune not licensed); affected control findings show as Insufficient Data
- **Error** — Connection failed or permissions are missing; re-authorize the tenant connection

## Step 4: Interpret Findings

Go to **Pre-Assessment → Assessment History** → click the completed assessment. Findings are grouped by CMMC control and show:

- **Status** — Pass, Fail, or Insufficient Data
- **Assessment Confidence** — How much tenant data was available for this control
- **Finding Detail** — Specific configuration items that passed or failed

## Step 5: Act on Evidence Requests

Go to **Pre-Assessment → Evidence Requests** to see controls that could not be automatically verified. For each evidence request:

1. Gather the relevant documentation (screenshots, config exports, policy documents)
2. Upload to the **Evidence** repository
3. Link the evidence to the relevant control

## Troubleshooting Intune Data Unavailability

If the scan shows Intune data as unavailable:
- Confirm that **Microsoft Intune** is licensed for your tenant
- Verify the connection account has the \`DeviceManagementConfiguration.Read.All\` permission
- Check whether a conditional access policy is blocking API access from Control HUB
- Try **Reconnecting** the tenant from the Tenant Connections page

## Recommended Roadmap

After running an assessment, go to **Pre-Assessment → Recommended Roadmap** for a prioritized remediation plan based on the findings.`,
  },

  // ── A13: Enable/Disable Pre-Assessment ────────────────────────────────────
  {
    slug: "pre-assessment-enable",
    title: "Enabling or Disabling Pre-Assessment",
    categoryName: "Pre-Assessment",
    module: "pre-assessment",
    summary: "Learn how Organization Admins and Global Admins can enable or disable the Pre-Assessment module for an organization.",
    keywords: "pre-assessment, enable, disable, module, organization settings, optional module, admin",
    sortOrder: 3,
    estimatedReadMinutes: 3,
    requiredCapabilities: ["org.admin"],
    moduleKeys: [],
    lastReviewedAt: new Date("2026-08-03"),
    contentVersion: "2.0",
    content: `## Pre-Assessment is an Optional Module

Pre-Assessment is not enabled by default. It must be turned on explicitly for each organization by an **Organization Admin** or **Global Admin**. This gives organizations control over which teams have access to tenant connection and scanning features.

## Enabling Pre-Assessment

1. Navigate to **Organization Settings** (accessible from the sidebar or your organization profile)
2. Click on the **Modules** section
3. Find **Pre-Assessment** in the list of optional modules
4. Toggle the switch to **Enabled**
5. Click **Save**

Once enabled, the Pre-Assessment module appears in the sidebar for users with appropriate permissions.

## Disabling Pre-Assessment

1. Navigate to **Organization Settings → Modules**
2. Find **Pre-Assessment** and toggle the switch to **Disabled**
3. Click **Save**

When disabled:
- The Pre-Assessment module is removed from the sidebar for regular users
- Existing tenant connections, scan history, and findings are **preserved** — no data is deleted
- Help articles for Pre-Assessment usage are hidden from regular users in the Help Center
- Organization Admins and Global Admins can still access the module configuration

## Re-Enabling Pre-Assessment

Re-enabling the module restores full access to existing scan results, tenant connections, and evidence requests. No data is lost when the module is toggled off and back on.

## Who Can Enable or Disable Modules

| Role | Can Enable/Disable Modules |
|------|---------------------------|
| Global Admin | Yes — for any organization |
| Organization Admin | Yes — for their own organization |
| Compliance Manager | No |
| IT Contributor | No |
| All other roles | No |`,
  },

  // ── A14: Reports Guide ─────────────────────────────────────────────────────
  {
    slug: "reports-guide",
    title: "Reports & Exports Guide",
    categoryName: "Reports & Exports",
    module: "reports",
    summary: "Learn how to generate, configure, and export compliance reports including executive summaries, gap analysis, and assessor packages.",
    keywords: "reports, executive, gap analysis, evidence inventory, POA&M, monitoring, domain, assessor, export, PDF, CSV",
    sortOrder: 1,
    estimatedReadMinutes: 5,
    requiredCapabilities: ["reports.generate"],
    lastReviewedAt: new Date("2026-08-03"),
    contentVersion: "2.0",
    content: `## Available Reports

Control HUB includes the following compliance reports. Report content reflects the compliance packages and control set assigned to your organization — a Level 1 organization's reports reference its 17 assigned controls and monitoring items; a Level 2 organization's reports reference its full 110-control set.

### Executive Readiness Report
A high-level summary for executives and leadership showing overall readiness score, domain breakdowns, key metrics, and evidence health. Suitable for board-level or leadership review.

### Gap Analysis Report
Identifies compliance gaps — controls that are Not Implemented or Partially Implemented — with domain context and recommendations for remediation. Use this for planning and prioritization.

### Control Status Report
A detailed view of all assigned controls with current implementation status, evidence counts, linked POA&Ms, and assessment notes.

### Evidence Inventory Report
A complete list of all evidence files with statuses, linked controls, upload dates, and review dates. Use this to audit your evidence library and identify stale or missing items.

### POA&M Report
All open and closed Plan of Action & Milestones items, grouped by risk level and control domain. Shows milestone progress and target completion dates.

### Monitoring Tracker Report
Status of all monitoring items for your organization's CMMC level, including last completed dates, frequencies, and overdue items.

### Domain Readiness Report
Per-domain compliance breakdown showing implementation rates for each of the 14 CMMC domains relevant to your package.

### Audit Readiness Report
A summary designed for pre-assessment review showing assessor-ready controls and outstanding gaps. Use this to prepare for a formal CMMC assessment.

### SSP Summary Report
A formatted summary of your System Security Plan suitable for sharing with assessors or management.

## Generating a Report

1. Go to **Reports** in the sidebar
2. Select the report type from the submenu
3. Configure any available filters (date range, domain, status, risk level)
4. Click **Generate** or **Export**

## Export Formats

Most reports support two export formats:
- **PDF** — Formatted document for printing, sharing, and formal submission
- **CSV** — Flat data export for further analysis in Excel or other tools

## Assessor Package

Rather than generating a static report for your CMMC assessor, consider giving them an **Assessor Read-Only** account in Control HUB. This provides direct, live access to:
- All assessor-ready controls with evidence and narratives
- SSP content and control mappings
- Evidence files (previewable and downloadable)
- POA&M records and monitoring status

To create an assessor account, go to **Users → Invite User** and assign the **Assessor Read-Only** organization role.`,
  },

  // ── A15: User Roles Guide ──────────────────────────────────────────────────
  {
    slug: "user-roles-guide",
    title: "Understanding Roles and Permissions in Control HUB",
    categoryName: "Users & Roles",
    module: "users",
    summary: "Understand the two-tier role model, platform roles, organization roles, effective permissions, and what each role can do.",
    keywords: "roles, permissions, platform role, org role, global admin, organization admin, compliance manager, reviewer, IT contributor, assessor, demo viewer, effective permissions",
    sortOrder: 1,
    popular: true,
    featured: true,
    estimatedReadMinutes: 7,
    lastReviewedAt: new Date("2026-08-03"),
    contentVersion: "2.0",
    content: `## Two-Tier Role Model

Control HUB uses a **two-tier role model** that separates platform-level authority from organization-level access. Your effective permissions in any session are determined by the combination of your platform role and your role in the currently selected organization.

---

## Platform Roles

Platform roles are set once per user and apply globally across the entire system.

### Platform Role: None
The default platform role for all users. **None** means your access is entirely determined by your organization memberships. You have no platform-wide authority.

A user with Platform Role None can still be an **Organization Admin** in one organization and an **IT Contributor** in another — their effective permissions change when they switch organizations.

### Platform Role: Global Admin
Global Admins have platform-wide administrative authority. This role is reserved for platform administrators and should be assigned sparingly.

**Global Admins can:**
- Manage all organizations (create, edit, configure packages and modules)
- Create, edit, deactivate, and impersonate users across all organizations
- Access the Security Center (MFA policy, locked accounts, audit trail)
- View and manage help center content
- Access all compliance modules across all organizations

Global Admin authority is subject to application security controls and protected-account safeguards.

---

## Organization Roles

Organization roles are assigned per organization. A user may have different roles in different organizations.

### Organization Admin
Full administrative access within their organization.

**Can:**
- Manage users within the organization (invite, edit roles, deactivate)
- Configure compliance packages and optional modules
- Access all compliance modules
- Create and manage evidence, documents, controls, tasks, and POA&Ms

### Compliance Manager
The primary day-to-day compliance role.

**Can:**
- Manage controls, evidence, documents, tasks, and POA&Ms
- Approve and reject evidence and documents
- Run pre-assessments (if module is enabled)
- Generate and export compliance reports
- View and act on the implementation roadmap and monitoring tracker

### IT Contributor
The technical implementation role for IT staff.

**Can:**
- Upload evidence to the repository
- Link evidence to controls
- Complete monitoring tracker reviews
- Update control implementation notes
- Create and update implementation tasks

### Reviewer
The audit and quality review role.

**Can:**
- Review and approve or reject submitted evidence
- Review and approve or reject documents submitted for review
- View all compliance data in read-only mode across the organization

### Executive Viewer
Read-only access for leadership and stakeholders.

**Can:**
- View the Dashboard and all KPI metrics
- View control statuses and domain readiness
- View reports and compliance summaries
- Cannot create, edit, or approve any data

### Assessor Read-Only
Designed for external CMMC assessors who need to review compliance documentation.

**Can:**
- View assessor packages and control details with narratives
- Preview and download evidence files
- View SSP content and control mappings
- View POA&M records and monitoring tracker status

Cannot create, modify, or delete any data. This role is intentionally read-only.

### Demo Viewer
Read-only demonstration access.

**Can:**
- Browse all modules in read-only mode for demonstration purposes

Cannot create, modify, or delete any data, and cannot access real organizational compliance records.

---

## Effective Permissions

Your **effective permissions** are the combination of your platform role and your organization role in the currently selected organization. Switching organizations changes your effective role — if you are a Compliance Manager in Organization A and an IT Contributor in Organization B, switching to Organization B reduces your effective capabilities.

If you need additional access within an organization, contact your **Organization Admin** or **Global Admin** to have your organization role updated.`,
  },

  // ── A16: MFA, SSO & Sign-In Guide ─────────────────────────────────────────
  {
    slug: "mfa-login-guide",
    title: "MFA, SSO & Sign-In Guide",
    categoryName: "MFA, SSO & Sign-In",
    module: "mfa",
    summary: "Learn how to accept invitations, set a password, reset credentials, set up MFA, use recovery codes, handle account lockout, and sign in with Microsoft SSO.",
    keywords: "MFA, multi-factor authentication, login, password, reset, invitation, TOTP, recovery codes, lockout, Microsoft SSO, single sign-on, Entra ID",
    sortOrder: 1,
    estimatedReadMinutes: 5,
    lastReviewedAt: new Date("2026-08-03"),
    contentVersion: "2.0",
    content: `## Accepting an Invitation

When an admin invites you to Control HUB, you receive an email with an invitation link.

1. Click the **Accept Invitation** link in the email — links are valid for **7 days**
2. Enter your name and set a password on the acceptance page
3. After setting your password, you are logged in automatically and added to the organization

**Note:** If your organization uses **Microsoft SSO**, you may be directed to sign in with your Microsoft credentials instead of setting a password.

## Password Requirements

All passwords must meet the following requirements:
- 12 or more characters
- At least one uppercase letter (A–Z)
- At least one lowercase letter (a–z)
- At least one number (0–9)
- At least one special character (!@#$%^&* etc.)

## Resetting Your Password

**Self-service reset:**
1. Go to the Control HUB login page
2. Click **Forgot password?** below the password field
3. Enter your email address and click **Send Reset Link**
4. Check your email for the reset link (valid for 30 minutes)
5. Click the link and enter your new password

**Admin-initiated reset:**
Organization Admins and Global Admins can send a password reset email from the Users management page by clicking the action menu next to a user and selecting **Send Reset Email**.

**SSO users:** If your organization uses Microsoft SSO, authentication is managed by Microsoft Entra ID. Password changes and resets are handled through your organization's Microsoft account — not through Control HUB's password reset flow.

## Setting Up MFA

If MFA is required for your account:

1. Log in with your email and password
2. You will be prompted to configure MFA on your first login after it is enabled
3. Open an authenticator app (Google Authenticator, Microsoft Authenticator, Authy, or any TOTP app)
4. Scan the QR code displayed on screen with your authenticator app
5. Enter the 6-digit code from your app to verify the setup
6. **Save your recovery codes** in a secure location — you will need them if you lose your authenticator

## Using MFA on Login

After entering your email and password, you are prompted for your 6-digit authenticator code. Enter the current code shown in your authenticator app. Codes refresh every 30 seconds.

## Recovery Codes

Recovery codes are one-time-use backup codes for situations where you cannot access your authenticator app.

- You receive **10 recovery codes** when you set up MFA
- Each code can be used **only once**
- Store them in a secure location (password manager, encrypted file, or printed in a safe)
- After using a recovery code, contact your admin to reset your MFA setup if your authenticator is permanently unavailable

## Account Lockout

After **5 failed login attempts**, your account is temporarily locked for **15 minutes**.

- Wait 15 minutes and try again with the correct credentials
- For immediate access, contact your Organization Admin or Global Admin to unlock your account
- Admins can unlock accounts from the Users management page or Security Center

## Microsoft SSO Sign-In

If your organization has configured Microsoft SSO:

- You sign in to Control HUB using your Microsoft 365 credentials instead of a separate password
- Click **Sign in with Microsoft** on the login page and complete authentication through your organization's Microsoft Entra ID tenant
- SSO-enrolled users do not use Control HUB's internal password — authentication is fully managed by Microsoft
- MFA is typically enforced through your organization's Microsoft conditional access policies rather than Control HUB's built-in MFA

If SSO is enabled for your organization and you experience sign-in issues, contact your IT administrator to verify your Microsoft account is properly configured.`,
  },

  // ── A17: Workflow — Invite User ────────────────────────────────────────────
  {
    slug: "workflow-invite-user",
    title: "How to Invite a New User",
    categoryName: "Workflows",
    module: "users",
    summary: "Step-by-step guide to inviting a new user, assigning their platform and organization roles, and managing pending invitations.",
    keywords: "invite, user, onboarding, workflow, admin, organization, email, platform role, org role",
    roleVisibility: ["admin", "org_admin", "compliance_manager"],
    requiredCapabilities: ["users.manage"],
    sortOrder: 1,
    estimatedReadMinutes: 4,
    lastReviewedAt: new Date("2026-08-03"),
    contentVersion: "2.0",
    content: `## Who Can Invite Users

- **Global Admins** — Can invite users to any organization and assign any role
- **Organization Admins** — Can invite users to their organization and assign organization roles
- **Compliance Managers** — May have limited invitation permission depending on organization configuration

## Steps to Invite a User

1. Go to **Users** in the Admin section of the sidebar
2. Click **Invite User**
3. Fill in the invitation form:
   - **Email** — The user's email address (must not already exist in the system)
   - **Name** — The user's full name
   - **Platform Role** — Select **None** for most users. Select **Global Admin** only for platform administrators.
   - **Organization** — The organization this user will belong to
   - **Organization Role** — The role this user will have within the selected organization (see User Roles Guide for descriptions)
4. Click **Send Invitation**

The user receives an invitation email with a link valid for **7 days**.

## What Happens After the Invitation is Sent

1. The user receives the invitation email
2. They click the **Accept Invitation** link
3. They set their name and password (or sign in with Microsoft SSO if enabled for the organization)
4. They are automatically added to the organization with the assigned role
5. The user appears in the Users list with status **Active**

## Managing Pending Invitations

Pending invitations can be managed from the Users list:

- **Resend Invitation** — If the user did not receive the email or the 7-day link expired, find the user in the Users list and click **Resend Invitation**
- **Cancel Invitation** — If the invitation should no longer be valid (e.g., the role has changed), click **Cancel Invitation** to invalidate the link

## Adding a User to Multiple Organizations

A user can belong to multiple organizations with different roles in each. To add an existing user to an additional organization:

1. Go to the organization's settings or user management
2. Find the user (they already have an account)
3. Assign them a role in the new organization — no new invitation is needed

## Troubleshooting

- **"Email already exists"** — Each email can only have one Control HUB account. If the user already has an account, add them to the organization without sending a new invitation.
- **User did not receive the email** — Ask them to check their spam folder. You can resend the invitation from the Users list.
- **Invitation link expired** — Invitations expire after 7 days. Resend the invitation to generate a new link.`,
  },

  // ── A18: Workflow — Upload Evidence ───────────────────────────────────────
  {
    slug: "workflow-upload-evidence",
    title: "How to Upload Evidence to a Control",
    categoryName: "Workflows",
    module: "evidence",
    summary: "Step-by-step guide to uploading evidence and linking it to a CMMC control.",
    keywords: "upload, evidence, control, workflow, link, file, compliance, submit, review",
    sortOrder: 2,
    popular: true,
    estimatedReadMinutes: 4,
    lastReviewedAt: new Date("2026-08-03"),
    contentVersion: "2.0",
    content: `## Overview

Evidence proves your organization has implemented a CMMC control. This guide covers the three ways to upload or link evidence to a control.

## Option 1: Upload from the Control Detail Page

This is the fastest method when you are working on a specific control.

1. Go to **Controls & Requirements** → find and open the control
2. Click the **Evidence** tab
3. Click **Upload Evidence**
4. Fill in:
   - **Title** — A descriptive name for the evidence
   - **Description** — What this evidence proves or demonstrates
   - **Type** — Screenshot, Policy, Configuration Export, Audit Log, Report, or Other
5. Click **Choose File** and select your file
6. Click **Save**

The evidence is uploaded in Draft status and linked directly to this control.

## Option 2: Upload from the Evidence Repository

Use this method when uploading evidence that supports multiple controls.

1. Go to **Evidence** in the sidebar
2. Click **Upload Evidence**
3. Fill in title, description, and type
4. In the **Linked Controls** field, search for and select all controls this evidence supports
5. Choose your file and click **Save**

## Option 3: Link Existing Evidence to a Control

If you have already uploaded evidence and want to link it to an additional control:

1. Go to **Controls & Requirements** → open the control
2. Click the **Evidence** tab
3. Click **Link Existing**
4. Search for and select the evidence item
5. Click **Link**

## After Uploading: Submitting for Review

New evidence starts in **Draft** status and does not count toward control readiness until it is approved.

1. Open the evidence item (from the Evidence repository or the control's Evidence tab)
2. Click **Submit for Review**
3. A Reviewer or Compliance Manager reviews the evidence
4. They click **Approve** or **Reject**
5. Once **Approved**, the evidence counts toward the control's implementation status and readiness score`,
  },

  // ── A19: Workflow — Approve Evidence ──────────────────────────────────────
  {
    slug: "workflow-approve-evidence",
    title: "How to Approve Evidence",
    categoryName: "Workflows",
    module: "evidence",
    summary: "Step-by-step guide for reviewers and compliance managers to review and approve submitted evidence.",
    keywords: "approve, evidence, review, reject, workflow, reviewer, compliance manager",
    roleVisibility: ["admin", "org_admin", "compliance_manager", "reviewer"],
    requiredCapabilities: ["evidence.approve"],
    sortOrder: 3,
    estimatedReadMinutes: 3,
    lastReviewedAt: new Date("2026-08-03"),
    contentVersion: "2.0",
    content: `## Overview

Reviewers and Compliance Managers can approve or reject submitted evidence. Approved evidence counts toward control readiness. Only evidence in **Submitted** status can be approved or rejected.

## Steps

1. Go to **Evidence** in the sidebar
2. Filter by **Status: Submitted** to see evidence awaiting review
3. Click an evidence item to open its detail page
4. Review the evidence:
   - Preview the file directly in the browser (images, PDF, DOCX, XLSX, and text files)
   - Check the linked controls and confirm the evidence is relevant
   - Read the title, description, and any uploader notes
5. Click **Approve** or **Reject**:
   - **Approve** — Evidence is valid and adequately supports the linked controls
   - **Reject** — Evidence is insufficient; add a note explaining what is missing or needs to change

## What Happens After Your Decision

- **Approved** — Evidence status changes to Approved; linked control readiness recalculates; the uploader may receive a notification
- **Rejected** — Evidence status changes to Rejected with your note; the uploader should replace or supplement the evidence and resubmit

## Tips for Reviewing Evidence

- Confirm the evidence **directly supports** the control it is linked to — not just thematically related
- Verify the evidence is **current** — outdated screenshots or expired policies may not satisfy assessors
- For screenshots, check that relevant configuration settings are **clearly visible**
- For policy documents, verify they are **signed, dated, and applicable** to CUI/FCI systems
- If evidence partially covers a control, consider approving it and creating a POA&M for the remaining gap`,
  },

  // ── A20: Workflow — Generate Document ─────────────────────────────────────
  {
    slug: "workflow-generate-document",
    title: "How to Generate a Document from a Template",
    categoryName: "Workflows",
    module: "documents",
    summary: "Step-by-step guide to generating a policy or procedure document from the CMMC template library.",
    keywords: "generate, document, template, policy, procedure, workflow, Level 1, Level 2",
    sortOrder: 4,
    estimatedReadMinutes: 4,
    lastReviewedAt: new Date("2026-08-03"),
    contentVersion: "2.0",
    content: `## Overview

Control HUB includes **over 85 CMMC-aligned templates** — covering both Level 1 (FCI) and Level 2 (CUI/NIST SP 800-171) requirements. Generate a document from a template as a starting point for your organization's policies and procedures.

## Steps

1. Go to **Documentation → Template Library**
2. Browse by category or search for the template you need (e.g., "Access Control Policy")
3. Click **Generate Document** on the template card
4. The generation wizard opens and pre-fills organization-specific information (organization name, target date, owner, etc.)
5. Review the pre-filled content
6. Click **Generate** — the document is created in **Draft** status in All Documents

## After Generating

1. The document appears in **Documentation → All Documents** with status **Draft**
2. Open the document to review and customize it:
   - Add your organization's specific system names, tools, and processes
   - Update personnel references to match your actual team structure
   - Adjust procedures to match how your organization actually operates
   - Set the effective date and scheduled review date
3. When the document is ready, click **Submit for Review**
4. A Reviewer or Compliance Manager approves it — on approval, status changes to **Active**
5. **Active** documents count toward the control readiness of their linked controls

## Keeping Documents Current

CMMC requires that policies and procedures be reviewed and updated on a regular schedule. When a document passes its review date, its status changes to **Expired**. Expired documents must be renewed:

1. Open the expired document
2. Update the content as needed
3. Set a new review date
4. Submit for review and get it re-approved to return it to **Active** status`,
  },

  // ── A21: Workflow — Monitoring Review ─────────────────────────────────────
  {
    slug: "workflow-monitoring-review",
    title: "How to Complete a Monitoring Review",
    categoryName: "Workflows",
    module: "monitoring",
    summary: "Step-by-step guide to completing a recurring monitoring review in the Monitoring Tracker.",
    keywords: "monitoring, review, complete, recurring, workflow, overdue, current",
    sortOrder: 5,
    estimatedReadMinutes: 3,
    lastReviewedAt: new Date("2026-08-03"),
    contentVersion: "2.0",
    content: `## Overview

Monitoring reviews are recurring operational checks required for CMMC compliance. Complete them on schedule to keep your monitoring items in **Current** status and maintain ongoing compliance.

## Steps

1. Go to **Monitoring Tracker** in the sidebar
2. Find the monitoring item to complete (look for **Overdue** or **In Progress** status)
3. Click the row to open the detail view or inline editor
4. Update the fields:
   - **Status** → change to **Current**
   - **Last Completed** → enter today's date (or the actual completion date)
   - **Notes** → add a brief description of what was reviewed, who performed it, and any findings
5. Click **Save**

The **Next Due** date automatically recalculates based on the completion date and the item's frequency.

## What to Document

When completing a review, record:
- Who performed the review (name and role)
- What was checked (specific systems, accounts, configurations, logs reviewed)
- What evidence was retained (link to an uploaded evidence file if applicable)
- Any issues found and how they were addressed or escalated

## Uploading Supporting Evidence

For many monitoring items, you should retain supporting evidence:

1. Complete the monitoring review in the Tracker and save it
2. Upload the relevant evidence file (scan report, access list screenshot, backup test log, etc.) to the **Evidence** repository
3. Link the evidence to the relevant CMMC control

## Recurring Reviews — How Status Recalculates

Monitoring items do not stay Current indefinitely. Status recalculates automatically:

- Monthly items become overdue 30 days after the last completion
- Quarterly items become overdue 90 days after the last completion
- Annual items become overdue 365 days after the last completion

Plan ahead and complete reviews before their due date to avoid overdue status.`,
  },

  // ── A22: Workflow — Create POA&M ──────────────────────────────────────────
  {
    slug: "workflow-create-poam",
    title: "How to Create and Close a POA&M",
    categoryName: "Workflows",
    module: "poams",
    summary: "Step-by-step guide to creating a Plan of Action & Milestones item and closing it once the gap is remediated.",
    keywords: "POA&M, create, close, remediation, workflow, gap, control, milestones",
    sortOrder: 6,
    estimatedReadMinutes: 4,
    lastReviewedAt: new Date("2026-08-03"),
    contentVersion: "2.0",
    content: `## Creating a POA&M

Use a POA&M to document a known compliance gap and your structured plan to fix it.

### From the Sidebar
1. Go to **POA&Ms** in the sidebar → click **Add POA&M**
2. Fill in all fields (see below)
3. Click **Save**

### From a Control Detail Page
1. Open the control → click the **POA&M** tab
2. Click **Create POA&M** — the control is pre-linked automatically
3. Fill in the remaining fields and click **Save**

## POA&M Fields

- **Title** — Short description of the gap (e.g., "MFA not enabled for all privileged accounts")
- **Description** — Detailed explanation of the weakness, its scope, and potential impact
- **Linked Control** — The CMMC control this POA&M addresses (e.g., IA.L2-3.5.3)
- **Risk Level** — Critical, High, Medium, or Low
- **Target Completion Date** — When you plan to fully resolve the gap
- **Milestones** — Interim steps toward resolution (e.g., "Week 1: Identify all admin accounts", "Week 2: Enable MFA in Azure AD", "Week 3: Verify and test")

## Tracking Progress

As you work through the milestones:
1. Open the POA&M detail page
2. Check off completed milestones as they are finished
3. Change status to **In Progress** once remediation work has begun
4. Add notes on progress, blockers, or changes to the plan

## Closing a POA&M

Once the gap is fully remediated:

1. Open the POA&M detail page
2. Upload evidence proving the gap is resolved (or link existing approved evidence)
3. Click **Close POA&M**
4. Add a remediation description explaining what was done to fix the gap
5. The POA&M status changes to **Closed**

Closed POA&Ms are retained indefinitely for audit trail purposes. They demonstrate to assessors that your organization has a mature, documented remediation process.`,
  },

  // ── A23: Workflow — Run Pre-Assessment ────────────────────────────────────
  {
    slug: "workflow-run-assessment",
    title: "How to Run a Tenant-Connected Pre-Assessment",
    categoryName: "Workflows",
    module: "pre-assessment",
    summary: "Step-by-step guide to connecting your Microsoft tenant and running an automated CMMC readiness scan.",
    keywords: "pre-assessment, tenant, Microsoft, scan, workflow, findings, Intune, Azure AD",
    sortOrder: 7,
    moduleKeys: ["PRE_ASSESSMENT"],
    requiredCapabilities: ["preassessment.run"],
    estimatedReadMinutes: 5,
    lastReviewedAt: new Date("2026-08-03"),
    contentVersion: "2.0",
    content: `## Prerequisites

Before running a pre-assessment:
- The **Pre-Assessment module** must be enabled for your organization (contact your Organization Admin if it is not visible in the sidebar)
- A **Microsoft 365 Global Admin** account must be available to authorize the tenant connection
- You must have a role with pre-assessment run permission (Organization Admin or Compliance Manager)

## Step 1: Connect Your Tenant

1. Go to **Pre-Assessment → Tenant Connections**
2. Click **Add Connection**
3. Enter a display name for this tenant connection (e.g., your company's domain)
4. Click **Connect with Microsoft** — you will be redirected to Microsoft's admin consent page
5. Sign in with a Microsoft 365 **Global Admin** account
6. Review and **Accept** the requested read-only permissions
7. You are redirected back to Control HUB — the connection is saved and ready to use

## Step 2: Run the Assessment

1. Go to **Pre-Assessment → Run Assessment**
2. Select your tenant connection from the dropdown
3. Select which controls to assess (or select all assigned controls)
4. Click **Run Assessment**
5. The scan runs in the background — typically 2–5 minutes

## Step 3: Review Results

1. Go to **Pre-Assessment → Assessment History**
2. Click the most recent completed assessment to view results
3. Review findings by control domain
4. Check **Assessment Confidence** for each finding — lower confidence indicates less tenant data was available for that control

## Step 4: Act on Findings

1. Go to **Pre-Assessment → Findings** to see all failed or Insufficient Data controls
2. For technical controls — update the relevant Microsoft 365 configuration to address the gap
3. For controls needing manual evidence — go to **Pre-Assessment → Evidence Requests** and upload supporting documentation to the Evidence repository
4. Go to **Pre-Assessment → Recommended Roadmap** for a prioritized remediation plan based on the assessment findings

**Reminder:** Pre-Assessment results are NOT an official CMMC score or certification. They are a readiness indicator to guide your compliance work.`,
  },

  // ── A24: Workflow — Generate Report ───────────────────────────────────────
  {
    slug: "workflow-generate-report",
    title: "How to Generate a Compliance Report",
    categoryName: "Workflows",
    module: "reports",
    summary: "Step-by-step guide to generating and exporting compliance reports in Control HUB.",
    keywords: "report, generate, export, workflow, executive, gap analysis, evidence, assessor",
    sortOrder: 8,
    requiredCapabilities: ["reports.generate"],
    estimatedReadMinutes: 4,
    lastReviewedAt: new Date("2026-08-03"),
    contentVersion: "2.0",
    content: `## Overview

Control HUB can generate several types of compliance reports for sharing with executives, assessors, and compliance teams. Report content is tailored to your organization's active compliance packages.

## Generating an Executive Readiness Report

1. Go to **Reports → Executive Readiness**
2. Review the report preview showing readiness scores and domain breakdowns
3. Click **Export PDF** to download a formatted report
4. Share with leadership, stakeholders, or board members

## Generating a Gap Analysis Report

1. Go to **Reports → Gap Analysis**
2. Review controls that are Not Implemented or Partially Implemented
3. Optionally filter by domain or risk level
4. Click **Export** to download as PDF or CSV

## Generating an Evidence Inventory

1. Go to **Reports → Evidence Inventory**
2. Filter by status, control, or date range as needed
3. Click **Export** to download a complete evidence list

## Generating a POA&M Report

1. Go to **Reports → POA&M Report**
2. Filter by status (Open, In Progress, Closed) and risk level
3. Click **Export** to download

## Preparing an Assessor Package

For the most efficient assessor experience, create an **Assessor Read-Only** account:

1. Go to **Users → Invite User**
2. Set Platform Role: **None**, Organization Role: **Assessor Read-Only**
3. Send the invitation to your assessor
4. The assessor logs in and can view all assessor-ready controls, evidence, narratives, SSP, and POA&M records directly

Alternatively, use **Reports → Audit Readiness** to download a formatted static assessor summary.

## Recommended Report Cadence

| Report | Recommended Frequency |
|--------|-----------------------|
| Executive Readiness | Monthly or quarterly for leadership review |
| Gap Analysis | Before each CMMC assessment cycle |
| Evidence Inventory | Quarterly to catch stale or expiring evidence |
| POA&M Report | Monthly to track remediation progress |`,
  },

  // ── A25: Troubleshooting ───────────────────────────────────────────────────
  {
    slug: "troubleshooting",
    title: "Troubleshooting Common Issues",
    categoryName: "Troubleshooting",
    module: undefined,
    summary: "Solutions to common issues in Control HUB including login problems, evidence upload errors, and data not loading.",
    keywords: "troubleshooting, error, login, upload, loading, access, permissions, fix, support",
    sortOrder: 1,
    estimatedReadMinutes: 5,
    lastReviewedAt: new Date("2026-08-03"),
    contentVersion: "2.0",
    content: `## Login Issues

### "Invalid credentials" error
- Check that Caps Lock is not on
- Confirm you are using the correct email address associated with your account
- Use the **Forgot password?** link to reset your password

### Account is locked
Accounts lock after 5 failed login attempts for 15 minutes. Wait 15 minutes and try again. For immediate access, contact your Organization Admin or Global Admin to unlock your account from the Users page or Security Center.

### Not being prompted for MFA when I should be
Your admin may have recently changed the MFA enforcement policy. Log out and log back in to pick up the new setting.

### MFA code is not working
- Ensure your device's clock is accurate — TOTP codes are time-based and fail if the clock is off
- Try the code from the previous or next 30-second window
- Re-sync the time in your authenticator app settings
- Use a **recovery code** if your authenticator is unavailable

### Microsoft SSO sign-in not working
- Confirm your Microsoft account is in the correct tenant
- Check with your IT administrator that your Microsoft account is not blocked by conditional access
- Try signing in through a private/incognito browser window to rule out cached session issues

## Evidence & File Issues

### File upload failed
- Maximum file size is **50 MB**
- Supported formats: images (PNG, JPG, GIF, WebP, SVG), PDF, Word (DOCX), Excel (XLSX), text, CSV, JSON, YAML
- Check your internet connection and try again
- If the issue persists, try a different browser

### Evidence preview is not working
Some file types cannot be previewed in the browser. Use the **Download** button to view the file locally.

### Evidence is not showing as "Approved"
Evidence must be reviewed and explicitly approved by a Reviewer or Compliance Manager. Check the evidence status — it may still be in **Draft** (needs to be submitted first) or **Submitted** (awaiting reviewer action).

## Data Not Loading

### Page shows "Loading..." indefinitely
1. Refresh the page
2. Check your internet connection
3. Log out and log back in
4. Clear your browser cache and try again
5. Submit a support ticket if the issue persists after these steps

### Controls show 0% readiness but I have approved evidence
Evidence must be both **linked to the control** AND in **Approved** status. Open the control → click the **Evidence** tab to confirm the evidence is linked and shows as Approved. Evidence that is only in Draft or Submitted status does not count toward readiness.

## Access Issues

### I can't see a module in the sidebar
Two possible causes:
1. **Role restriction** — Your organization role does not include access to that module. Review the User Roles Guide or contact your Organization Admin.
2. **Module not enabled** — Optional modules (like Pre-Assessment and Implementation Roadmap) must be enabled for your organization. Contact your Organization Admin to check module settings.

### I get "Access denied" on a page
Your current role does not have permission for that action. Your effective permissions are determined by your organization role in the currently selected organization. Contact your Organization Admin or Global Admin to request a role change.

## Contact Support

If you cannot resolve an issue using this guide, submit a request to our support team:

**Submit a Support Ticket** from the Help Center — use the **Submit a Support Ticket** button to reach our support team at **support@carmetechnology.com**.

Do not include passwords, CUI, access tokens, or sensitive contract data in support requests.`,
  },

  // ── A29: Organizations & Modules Guide ────────────────────────────────────
  {
    slug: "organizations-guide",
    title: "Managing Organizations and Modules",
    categoryName: "Organizations & Modules",
    module: "organizations",
    summary: "Learn how to create and configure organizations, assign compliance packages, enable optional modules, and manage organization users.",
    keywords: "organization, modules, packages, admin, global admin, create org, compliance target, CMMC level, settings, Pre-Assessment, Roadmap",
    sortOrder: 1,
    estimatedReadMinutes: 5,
    requiredCapabilities: ["org.admin"],
    lastReviewedAt: new Date("2026-08-03"),
    contentVersion: "2.0",
    content: `## What is an Organization?

In Control HUB, an **organization** represents a single business entity or operating unit pursuing CMMC compliance. Each organization has its own isolated compliance data — controls, evidence, documents, tasks, POA&Ms, and users are scoped to a single organization.

A user can belong to multiple organizations with different roles in each.

## Creating an Organization

Only **Global Admins** can create new organizations.

1. Go to the **Organizations** management page (accessible from the Global Admin menu)
2. Click **Create Organization**
3. Fill in:
   - **Organization Name**
   - **Industry** — Select your industry sector
   - **Description** — Brief description of the organization
   - **CMMC Target Level** — Level 1 (FCI) or Level 2 (CUI/NIST SP 800-171)
4. Click **Create**

The organization is created. Compliance packages and modules can then be configured.

## Editing Organization Profile

Organization Admins and Global Admins can edit the organization profile from **Organization Settings**:
- Update name, industry, and description
- Change the CMMC target compliance level
- These changes take effect immediately

## Assigning Compliance Packages

Compliance packages define the regulatory requirements the organization tracks:

1. Go to **Organization Settings → Compliance Packages**
2. Review currently assigned packages
3. Click **Add Package** to assign a new package
4. Use the **Preview Impact** tool to see how many net-new controls the package adds before confirming
5. Click **Confirm** to assign

Available packages include CMMC Level 1, CMMC Level 2, NIST SP 800-171 Rev. 2, FAR 52.204-21, and DFARS contract clauses.

## Enabling Optional Modules

Two optional modules can be enabled per organization:

- **Implementation Roadmap** — Provides a prioritized, phased action plan for compliance
- **Pre-Assessment** — Enables Microsoft 365 tenant connection and automated control analysis

To enable or disable a module:
1. Go to **Organization Settings → Modules**
2. Toggle the module switch
3. Click **Save**

Disabling a module hides it from the sidebar but preserves all existing data.

## Managing Organization Users

From **Organization Settings → Users** (or the main **Users** page within the organization):
- View all users with their organization roles
- Invite new users (see *How to Invite a New User*)
- Edit a user's organization role
- Deactivate a user's access to the organization`,
  },

  // ── A30: My Role Guide ────────────────────────────────────────────────────
  {
    slug: "my-role-guide",
    title: "Understanding My Access in Control HUB",
    categoryName: "Users & Roles",
    module: "users",
    summary: "Learn how Control HUB determines what you can see and do, how to identify your current role, and what to do if you need more access.",
    keywords: "my role, effective permissions, access, organization role, platform role, what can I do, role badge, switch org",
    sortOrder: 2,
    estimatedReadMinutes: 4,
    lastReviewedAt: new Date("2026-08-03"),
    contentVersion: "2.0",
    content: `## How Control HUB Determines What You Can Do

Your access in Control HUB is determined by two factors working together:

1. **Platform Role** — Set once for your account (None or Global Admin)
2. **Organization Role** — Set per organization (varies per membership)

Your **effective permissions** = Platform Role + Organization Role in the selected organization.

If you have **Platform Role: None**, your access is entirely determined by your organization memberships. You have no platform-wide authority, but you may be highly privileged within specific organizations.

## Identifying Your Current Role

To see your current role:
- Look for the **role badge** in your user profile or account menu in the top-right corner
- The Help Center context header may display your effective role for the selected organization
- The sidebar navigation shows only the modules your current effective role can access

## What Each Organization Role Can Do

| Role | Key Capabilities |
|------|-----------------|
| **Organization Admin** | Full org management: users, packages, modules, all compliance data |
| **Compliance Manager** | Manage controls, evidence, documents, tasks, POA&Ms; approve evidence; generate reports |
| **IT Contributor** | Upload evidence, complete monitoring reviews, update control notes, manage tasks |
| **Reviewer** | Approve or reject evidence and documents; read-only access to all other data |
| **Executive Viewer** | Read-only access to dashboard, controls, reports, and compliance summaries |
| **Assessor Read-Only** | Read-only access to assessor package, evidence, narratives, SSP, POA&Ms |
| **Demo Viewer** | Read-only demonstration access only |

## Switching Organizations Changes Your Access

If you belong to multiple organizations, **switching organizations changes your effective role**. You might be a Compliance Manager in Organization A with full management capabilities, but an IT Contributor in Organization B with upload-only permissions. This is expected behavior — access is scoped to each organization independently.

## What "Platform Role: None" Means

Platform Role None is the correct and default platform role for most users. It means:
- You have no platform-wide authority (you cannot manage organizations or platform settings)
- Your access is entirely determined by which organizations you belong to and what role you have in each
- You may still be an Organization Admin with full capabilities within your organization

If you have Platform Role None and no organization memberships, you will see an empty dashboard with no compliance data.

## Requesting Additional Access

If you need access to a module or capability you currently cannot see:

1. Identify which organization you need access in
2. Contact your **Organization Admin** for that organization — they can update your organization role
3. If you need platform-level access or a new organization, contact a **Global Admin`
  },
];

// ── COMPLIANCE FRAMEWORK ARTICLES ────────────────────────────────────────────
// Kept as a separate export for backward compatibility with startup-seed.ts.
// These articles are also included in the HELP_ARTICLES array above
// (compliance-packages-overview, dfars-obligations-guide, framework-crosswalk-guide).

export const COMPLIANCE_FRAMEWORK_ARTICLES: HelpArticleSeed[] = [
  {
    slug: "compliance-packages-overview",
    title: "Understanding Compliance Packages",
    categoryName: "Getting Started",
    module: "settings",
    summary: "Learn how compliance packages work in Control HUB — what they are, why you'd select multiple packages, and how they affect your controls view.",
    keywords: "packages compliance framework CMMC NIST DFARS FAR overlap controls filter Level 1 Level 2",
    sortOrder: 2,
    popular: true,
    estimatedReadMinutes: 5,
    packageKeys: [],
    lastReviewedAt: new Date("2026-08-03"),
    contentVersion: "2.0",
    content: `## What are Compliance Packages?

Compliance packages define the set of regulatory requirements your organization is tracking. Control HUB supports multiple compliance frameworks, and each framework can have one or more packages — for example, CMMC Level 1 Self-Assessment, CMMC Level 2 Self-Assessment, or NIST SP 800-171 Rev. 2.

The compliance packages assigned to your organization determine which controls appear in the Controls & Requirements library, which monitoring items are seeded, and how dashboard metrics are calculated.

## Why Would I Select Multiple Packages?

Many DoD contractors must comply with more than one framework simultaneously:

- **CMMC L2 + NIST 800-171 Rev. 2** — These two frameworks share the same 110 controls. Selecting both allows you to track evidence that satisfies both requirements using a single control assessment and evidence set.

- **CMMC + DFARS clauses** — DFARS contract clauses (e.g., DFARS 252.204-7012) impose obligations beyond CMMC controls — such as 72-hour incident reporting, flowdown requirements to subcontractors, and assessment obligations. These are tracked separately on the DFARS Obligations page.

- **CMMC L2 + FAR 52.204-21** — FAR Basic Safeguarding covers the same 17 Level 1 controls as CMMC L1. Organizations holding Federal Contract Information (FCI) are subject to FAR even if not formally pursuing CMMC L1 certification.

## How Packages Affect Your Controls View

When compliance packages are assigned, the Controls & Requirements Library shows a package filter dropdown. Selecting a package narrows the controls shown:

| Package | Controls Shown |
|---------|---------------|
| CMMC L1 / FAR 52.204-21 | 17 FCI/Level 1 controls |
| CMMC L2 / NIST 800-171 | 110 Level 2 controls |
| DFARS clauses | Notice linking to DFARS Obligations page |

## Impact Preview (Dry-Run)

Before adding a new package, use the **Preview Impact** tool in **Settings → Compliance Packages**. It shows how many net-new controls the package would add, accounting for overlap with packages you already have. This helps you understand the compliance scope change before committing.

## DFARS-Specific Content

DFARS contract clause content (72-hour incident reporting, flowdown requirements, SPRS submission obligations) is covered in depth in the **DFARS Obligations Guide**. This content appears when your organization has DFARS contract clauses assigned as compliance packages.`,
  },

  {
    slug: "dfars-obligations-guide",
    title: "DFARS Contract Obligations",
    categoryName: "DFARS Obligations",
    module: "dfars",
    summary: "Understand the DFARS contract clauses relevant to CMMC compliance, including 7012, 7019, 7020, and 7021 obligations.",
    keywords: "DFARS 7012 7019 7020 7021 incident reporting flowdown CDI CUI subcontractor obligation 72-hour SPRS",
    sortOrder: 1,
    packageKeys: ["dfars", "DFARS"],
    estimatedReadMinutes: 6,
    lastReviewedAt: new Date("2026-08-03"),
    contentVersion: "2.0",
    content: `## What are DFARS Obligations?

DFARS (Defense Federal Acquisition Regulation Supplement) clauses are contractual requirements imposed by the Department of Defense on prime contractors — and often flowed down to subcontractors. They complement CMMC by adding specific process, reporting, and assessment obligations that go beyond the control checklist.

## Key DFARS Clauses

### DFARS 252.204-7012 — Safeguarding Covered Defense Information (CDI)

The foundational cybersecurity clause for DoD contractors. Requires:
- Implementing the 110 security requirements from NIST SP 800-171
- Reporting cyber incidents to DoD within **72 hours** of discovery
- Preserving and submitting disk images of affected systems
- Submitting a medium assurance certificate for cyber incident reports
- Flowing down equivalent protections to subcontractors who process, store, or transmit CDI

### DFARS 252.204-7019 — Notice of NIST SP 800-171 DoD Assessment Requirements

Requires contractors to have a current NIST SP 800-171 DoD Assessment on record in SPRS (Supplier Performance Risk System) prior to contract award and within 3 years of the prior assessment. Your self-assessment score must be submitted to SPRS.

### DFARS 252.204-7020 — NIST SP 800-171 DoD Assessment Requirements

Authorizes the Government to conduct assessments of a contractor's NIST SP 800-171 implementation. Requires contractor cooperation with assessors and access to facilities, systems, and records.

### DFARS 252.204-7021 — Cybersecurity Maturity Model Certification Requirements

The CMMC contract clause. Requires the contractor to obtain and maintain the CMMC level specified in the contract at the time of award and throughout contract performance.

## Flowdown Requirements

DFARS 252.204-7012 requires prime contractors to include its provisions in all subcontracts where subcontractors may process, store, or transmit CDI. Use the **DFARS Obligations** page in Control HUB to review which clauses in your assigned packages require flowdown to subcontractors.

## 72-Hour Incident Reporting

Any cyber incident affecting CDI or CUI must be reported to the Department of Defense within **72 hours** of discovery via the DIBNet portal at **dibnet.dod.mil**. This is a contractual obligation separate from any other notification requirements (state breach laws, GDPR, etc.).

Required information for a DFARS 7012 incident report includes:
- Company and contract information
- Description of the incident
- List of compromised systems and data
- Disk images of affected systems (submitted separately)

## SPRS Score Submission

Under DFARS 7019, your organization's NIST SP 800-171 self-assessment score must be submitted to the **Supplier Performance Risk System (SPRS)**. The score ranges from -203 (0 controls implemented) to 110 (all controls fully implemented). This score is visible to DoD contracting officers and can affect contract eligibility.`,
  },

  {
    slug: "framework-crosswalk-guide",
    title: "Framework Crosswalk — Mapping Between Standards",
    categoryName: "Framework Crosswalk",
    module: "crosswalk",
    summary: "Learn how the framework crosswalk maps requirements between CMMC, NIST 800-171, FAR, and DFARS, and how to use it to eliminate duplicated compliance work.",
    keywords: "crosswalk mapping CMMC NIST 800-171 FAR overlap equivalent framework requirements Rev 2 Rev 3",
    sortOrder: 1,
    estimatedReadMinutes: 5,
    lastReviewedAt: new Date("2026-08-03"),
    contentVersion: "2.0",
    content: `## What is the Framework Crosswalk?

The Framework Crosswalk maps requirements between compliance frameworks — showing which requirements are equivalent, overlapping, or unique across the frameworks assigned to your organization. Its primary purpose is to help you identify where a single implementation effort satisfies multiple framework requirements simultaneously, eliminating redundant compliance work.

## CMMC L2 ↔ NIST SP 800-171 Rev. 2

These two frameworks are structurally equivalent. CMMC Level 2 is based directly on the 110 NIST SP 800-171 Rev. 2 requirements. Every CMMC L2 practice maps 1:1 to a NIST 800-171 requirement with the same security objective.

If you are pursuing CMMC L2 and are also required to maintain a NIST 800-171 self-assessment score in SPRS, the same evidence base and implementation narratives satisfy both frameworks. There is no need to maintain separate compliance programs.

## NIST 800-171 Rev. 2 ↔ Rev. 3

NIST published Revision 3 of SP 800-171 in May 2024. The crosswalk for Rev. 2 → Rev. 3 shows:

- **Direct mappings** — Requirements that carried over from Rev. 2 to Rev. 3, unchanged or with minor editorial updates
- **New in Rev. 3** — Requirements that have no Rev. 2 equivalent; these represent gaps your organization must address if transitioning to Rev. 3
- **Removed from Rev. 3** — Rev. 2 requirements that were merged into other requirements or removed in the revision

## CMMC L1 ↔ FAR 52.204-21

FAR 52.204-21 (Basic Safeguarding of Covered Contractor Information Systems) covers the same 17 Level 1 practices as CMMC L1. Organizations already complying with FAR 52.204-21 have implemented the foundational controls required for CMMC L1.

Evidence collected for FAR 52.204-21 compliance directly supports a CMMC L1 self-assessment. There is no need to duplicate the evidence base.

## Relationship Types

| Type | Meaning |
|------|---------|
| **Equivalent** | Controls/requirements map 1:1 across frameworks with the same security objective |
| **Subset** | One requirement is a narrower version of another; satisfying the broader requirement covers the subset |
| **Superset** | One requirement is broader; satisfying the narrower version partially addresses the superset |
| **Partial Overlap** | Requirements address the same security area but with different scope or specificity |
| **Related** | Thematically linked but not directly interchangeable evidence |

## Using the Crosswalk to Reduce Duplication

1. Open **Framework Crosswalk** in the sidebar
2. Review the mapping table for your assigned frameworks
3. Identify **Equivalent** mappings — these are "one and done" controls where a single implementation satisfies multiple frameworks
4. When uploading evidence, link it to all controls from all relevant frameworks that the evidence supports
5. Prioritize implementing controls that appear across multiple frameworks to maximize compliance coverage per unit of effort`,
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
    answer: "Tenant Scan Health indicates the quality of data received from your Microsoft 365 tenant during a pre-assessment. 'Healthy' means all data sources are available and returning complete results. 'Degraded' means some sources are unavailable (e.g., Intune is not licensed). 'Error' means the connection failed or permissions are missing.",
    category: "Pre-Assessment",
    sortOrder: 3,
    moduleKey: "PRE_ASSESSMENT",
  },
  {
    question: "What does 'Controls Touched by Tenant Scan' mean?",
    answer: "This shows how many of your assigned CMMC controls were analyzed during your pre-assessment run. Controls where the scan had sufficient data to evaluate are 'touched'. Controls that could not be evaluated due to missing data sources or insufficient permissions are not touched and may show as Insufficient Data.",
    category: "Pre-Assessment",
    sortOrder: 4,
    moduleKey: "PRE_ASSESSMENT",
  },
  {
    question: "Why does evidence start as 'Draft'?",
    answer: "Evidence starts as Draft to support a review workflow. Unreviewed evidence should not count toward compliance readiness — it must be validated by a Reviewer or Compliance Manager first. Once approved, Draft evidence advances to Approved status and counts toward control readiness.",
    category: "Evidence",
    sortOrder: 5,
  },
  {
    question: "What is the difference between Evidence and Documents?",
    answer: "Evidence is documentation that proves a control is implemented (screenshots, configs, audit logs, etc.). Documents are formal organizational documents that define how you operate (policies, procedures, plans). A policy document can also be uploaded as evidence and linked to a control, but they serve different purposes in the compliance workflow.",
    category: "Evidence",
    sortOrder: 6,
  },
  {
    question: "What is the difference between Implementation and Configure?",
    answer: "The Implementation tab on a control is where you write the narrative describing how your organization meets the control requirement. The Configure tab contains step-by-step technical configuration tasks — actionable checklist items for IT staff to work through when technically implementing the control.",
    category: "Controls & Requirements",
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
    answer: "You can upload evidence from two places: (1) The Evidence page — click Upload Evidence, fill in the details, select your file, and link it to controls. (2) A Control Detail page — open the control, click the Evidence tab, and click Upload Evidence. New evidence starts as Draft and must be submitted and then approved by a reviewer before it counts toward readiness.",
    category: "Evidence",
    sortOrder: 10,
  },
  {
    question: "How do I bulk upload evidence?",
    answer: "Go to the Evidence page and click Bulk Upload. You can select multiple files at once. After selecting files, assign a title and link controls to each file, then click Save. All files will be uploaded in Draft status and must be submitted for review.",
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
    category: "POA&M Management",
    sortOrder: 14,
  },
  {
    question: "How do I close a POA&M?",
    answer: "Open the POA&M detail page. Upload or link evidence proving the gap is resolved. Click Close POA&M and add a remediation description explaining what was done to fix the gap. The status changes to Closed and the record is retained for audit purposes.",
    category: "POA&M Management",
    sortOrder: 15,
  },
  {
    question: "How do I generate a report?",
    answer: "Go to Reports in the sidebar and select the report type (Executive Readiness, Gap Analysis, Evidence Inventory, etc.). Configure any filters and click Generate or Export. Reports can be downloaded as PDF or CSV. For an assessor package, invite your assessor with an Assessor Read-Only account for live access.",
    category: "Reports & Exports",
    sortOrder: 16,
  },
  {
    question: "What can an Assessor Read-Only user see?",
    answer: "Assessor Read-Only users can view assessor packages and control details, preview and download evidence files, view control narratives and SSP content, and view POA&M records and monitoring status. They cannot create, modify, or delete any data. This role is designed for external CMMC assessors who need to review your compliance documentation.",
    category: "Users & Roles",
    sortOrder: 17,
  },
  {
    question: "How do I invite a user?",
    answer: "Go to Users in the Admin section of the sidebar and click Invite User. Enter the user's email, name, platform role (None for most users), organization, and organization role. Click Send Invitation. The user receives an email with a link valid for 7 days to set their password and activate their account.",
    category: "Users & Roles",
    sortOrder: 18,
  },
  {
    question: "How do I reset a password?",
    answer: "Users can reset their own password from the login page by clicking 'Forgot password?' and entering their email. Admins can also send a password reset email from the Users management page by clicking the action menu next to a user and selecting 'Send Reset Email'. SSO users manage passwords through their Microsoft account.",
    category: "MFA & Login",
    sortOrder: 19,
  },
  {
    question: "How does MFA work?",
    answer: "When MFA is enabled for your account, after entering your password you will be prompted for a 6-digit code from an authenticator app (Google Authenticator, Microsoft Authenticator, Authy, etc.). Set up MFA by scanning the QR code shown during your first login after MFA is enabled. Save your recovery codes in a secure location in case you lose access to your authenticator.",
    category: "MFA & Login",
    sortOrder: 20,
  },
  {
    question: "How do I connect a Microsoft tenant?",
    answer: "Go to Pre-Assessment → Tenant Connections and click Add Connection. You will be redirected to Microsoft's admin consent page where a Global Admin must approve the required read-only permissions. Once approved, the tenant connection is saved and ready to use for pre-assessments.",
    category: "Pre-Assessment",
    sortOrder: 21,
    moduleKey: "PRE_ASSESSMENT",
  },
  {
    question: "What Microsoft permissions are required?",
    answer: "Control HUB requires these Microsoft Graph API permissions: DeviceManagementConfiguration.Read.All (read Intune device policies), Policy.Read.All (read conditional access policies), AuditLog.Read.All (read Azure AD audit logs), and Directory.Read.All (read directory objects). All permissions are read-only — Control HUB never writes to your Microsoft tenant.",
    category: "Pre-Assessment",
    sortOrder: 22,
    moduleKey: "PRE_ASSESSMENT",
  },
  {
    question: "Why might Intune data be unavailable?",
    answer: "Intune data may be unavailable if: (1) Intune is not licensed in your Microsoft 365 tenant, (2) the service account used for the connection lacks DeviceManagementConfiguration.Read.All permission, or (3) a conditional access policy is blocking the API connection from Control HUB. Check the Tenant Scan Health indicator for details and try reconnecting the tenant.",
    category: "Pre-Assessment",
    sortOrder: 23,
    moduleKey: "PRE_ASSESSMENT",
  },
  {
    question: "What is Platform Role None?",
    answer: "Platform Role None means your access to Control HUB is entirely determined by your organization memberships. You do not have platform-wide administrative authority. You may be an Organization Admin in one organization and an IT Contributor in another — each organization membership grants different capabilities. This is the correct and default platform role for most users.",
    category: "Users & Roles",
    sortOrder: 24,
  },
  {
    question: "Why does my access change when I switch organizations?",
    answer: "Your effective permissions in Control HUB are determined by your role in the selected organization. If you are a Compliance Manager in one organization and an IT Contributor in another, switching organizations changes what you can see and do. This is expected behavior — access is scoped to each organization independently.",
    category: "Users & Roles",
    sortOrder: 25,
  },
  {
    question: "How do I enable or disable the Pre-Assessment module?",
    answer: "Organization Admins and Global Admins can enable or disable the Pre-Assessment module from Organization Settings. Navigate to your organization settings and look for the Modules section. Enabling Pre-Assessment allows users to connect Microsoft 365 tenants and run automated readiness scans. Existing scan data is preserved when the module is disabled.",
    category: "Pre-Assessment",
    sortOrder: 26,
  },
  {
    question: "What is the difference between CMMC Level 1 and Level 2?",
    answer: "CMMC Level 1 applies to organizations handling Federal Contract Information (FCI) and covers 17 foundational security practices mapped to FAR 52.204-21. It requires an annual self-assessment. CMMC Level 2 applies to organizations handling Controlled Unclassified Information (CUI) and covers 110 practices from NIST SP 800-171. Level 2 requires either a self-assessment or a third-party assessment by a certified C3PAO, depending on contract requirements.",
    category: "General",
    sortOrder: 27,
  },
  {
    question: "What is a support ticket?",
    answer: "A support ticket is a formal request for help submitted through the Control HUB Help Center. When you submit a ticket, our support team at support@carmetechnology.com receives a notification and will respond to your email. You can track your submitted tickets under My Support Requests in the Help Center. Do not include passwords, CUI, access tokens, or sensitive contract data in support requests.",
    category: "General",
    sortOrder: 28,
  },
];
