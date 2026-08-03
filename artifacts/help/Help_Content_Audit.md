# Control HUB Help Center — Content Audit
**Audit Date:** 2026-08-03  
**Auditor:** Agent (read-only inspection, no production content changed)  
**Scope:** All help categories, articles, FAQs, videos, support links, routes, filtering logic, and technical infrastructure

---

## Executive Summary

The current Help Center is a working but first-generation implementation. Content is stored in the database (seeded from `help-seed-data.ts`) and served through a small Express router. The fundamental problems are:

1. **No context awareness** — every authenticated user sees identical content regardless of role, org, packages, or enabled modules.
2. **Outdated content** — role names, monitoring item counts, and module descriptions do not match the live application.
3. **Support email is wrong** — all support actions point to `info@carmetechnology.com`; spec requires `support@carmetechnology.com`.
4. **No support ticket system** — current support is a bare `mailto:` link.
5. **Videos page is mostly disabled** — five of six video cards show "Coming Soon" as primary content.
6. **Lowercase module badges** — raw module keys (`pre-assessment`, `poams`, `ssp`, `users`, `dfars`) render directly in the UI.
7. **No last-reviewed dates, tags, packages, or audience rules** — the schema is missing fields required by the spec.
8. **MarkdownContent renderer uses unsanitized `dangerouslySetInnerHTML`** — potential XSS risk.
9. **Category structure is outdated** — Documentation and SSP are merged; Tasks has no category; DFARS and Crosswalk have no own categories.

---

## 1. Application Routes Inventory

Routes verified from `artifacts/cmmc-app/src/App.tsx`:

| Route | Component | Status |
|---|---|---|
| `/` | Dashboard | ✅ Exists |
| `/controls` | Controls | ✅ Exists |
| `/controls/domain/:code` | ControlDomain | ✅ Exists |
| `/controls/:id` | Control detail | ✅ Exists |
| `/evidence` | Evidence | ✅ Exists |
| `/evidence/upload` | EvidenceUpload | ✅ Exists |
| `/evidence/:id` | EvidenceDetail | ✅ Exists |
| `/monitoring` | MonitoringTracker | ✅ Exists |
| `/tasks` | Tasks | ✅ Exists |
| `/tasks/:id` | TaskDetail | ✅ Exists |
| `/poams` | Poams | ✅ Exists |
| `/poams/:id` | PoamDetail | ✅ Exists |
| `/assessor` | Assessor | ✅ Exists |
| `/assessor/controls/:id` | Assessor control detail | ✅ Exists |
| `/audit-logs` | AuditLogs | ✅ Exists |
| `/users` | Users | ✅ Exists |
| `/settings/packages` | SettingsPackages | ✅ Exists |
| `/settings` | Settings | ✅ Exists |
| `/organizations` | Organizations | ✅ Exists |
| `/security` | SecurityCenter | ✅ Exists |
| `/documents` | Documents | ✅ Exists |
| `/documents/templates` | Template library | ✅ Exists |
| `/documents/templates/:id` | Template detail | ✅ Exists |
| `/documents/generate` | Generate wizard | ✅ Exists |
| `/ssp` | SspOverview | ✅ Exists |
| `/ssp/sections` | SspSections | ✅ Exists |
| `/ssp/mappings` | SspMappings | ✅ Exists |
| `/ssp/documents` | SspDocuments | ✅ Exists |
| `/ssp/export` | SspExport | ✅ Exists |
| `/ssp/prefill` | SspPrefillWizard | ✅ Exists |
| `/roadmap` | RoadmapActions | ✅ Exists |
| `/roadmap/:id` | RoadmapActionDetail | ✅ Exists |
| `/roadmap/coverage` | RoadmapCoverage | ✅ Exists |
| `/roadmap/progress` | RoadmapProgress | ✅ Exists |
| `/reports/executive` | ReportsExecutive | ✅ Exists |
| `/reports/gap` | ReportsGap | ✅ Exists |
| `/reports/controls` | ReportsControls | ✅ Exists |
| `/reports/evidence` | ReportsEvidence | ✅ Exists |
| `/reports/poam` | ReportsPoam | ✅ Exists |
| `/reports/monitoring` | ReportsMonitoring | ✅ Exists |
| `/reports/domain` | ReportsDomain | ✅ Exists |
| `/reports/audit` | ReportsAudit | ✅ Exists |
| `/reports/ssp` | ReportsSsp | ✅ Exists |
| `/certification` | Certification | ✅ Exists |
| `/pre-assessment/*` | Pre-Assessment pages | ✅ Exists |
| `/help` | Help landing | ✅ Exists |
| `/help/article/:slug` | HelpArticle | ✅ Exists |
| `/help/faq` | HelpFaq | ✅ Exists |
| `/help/videos` | HelpVideos | ✅ Exists |
| `/help/admin` | HelpAdmin | ✅ Exists (admin-only) |

**Routes referenced in articles that no longer exist or have changed:**

| Article | Referenced Route | Actual Route | Issue |
|---|---|---|---|
| Controls Guide | `POA&Ms` sidebar link | `/poams` | Article spells it "POA&Ms" ✅ |
| Monitoring Guide | Inline row editor | Unknown | Article claims "click the row to edit inline" — actual UX should be verified |
| Reports Guide | `Assessor` sidebar section | `/assessor` | ✅ Exists |
| Reports Guide | `Reports → Audit Readiness` | `/reports/audit` | ✅ Exists |
| SSP Guide | `SSP → Sections` | `/ssp/sections` | ✅ Exists |
| SSP Guide | `SSP → Control Mapping` | `/ssp/mappings` | ✅ Exists |
| SSP Guide | `SSP → Export` | `/ssp/export` | ✅ Exists |
| Documentation Guide | `Documentation → Template Library` | `/documents/templates` | ✅ Exists |

---

## 2. Current Help Infrastructure

### Database Schema (`packages/db/src/schema/help.ts`)

| Table | Fields | Missing Fields (per spec) |
|---|---|---|
| `help_categories` | id, name, description, icon, sortOrder, createdAt | — |
| `help_articles` | id, slug, title, category_id, module, content, summary, keywords, roleVisibility[], sortOrder, status, createdAt, updatedAt | `last_reviewed_at`, `last_reviewed_by`, `content_version`, `estimated_read_minutes`, `featured`, `popular`, `published` (currently uses status=published), package filters, tags |
| `faq_items` | id, question, answer, category, sortOrder, status, createdAt, updatedAt | package_keys, module_key, required_capabilities, related_article_id |
| — | No `help_videos` table | Entire table missing — videos are hardcoded in `help-videos.tsx` |
| — | No `help_article_audience` table | Missing (audience/capability rules) |
| — | No `help_article_packages` table | Missing |
| — | No `support_tickets` table | Missing |
| — | No `support_ticket_attachments` table | Missing |

### API Routes (`artifacts/api-server/src/routes/help.ts`)

| Endpoint | Auth | Filtering | Issues |
|---|---|---|---|
| `GET /help/categories` | ✅ requireAuth | None | Returns all categories; no role/package/module filter |
| `GET /help/articles` | ✅ requireAuth | module (exact), category (name), status, roleVisibility (admin bypass) | No package filter; roleVisibility rarely used; module filter not applied landing |
| `GET /help/articles/:slug` | ✅ requireAuth | None | No audience check on direct URL — hidden articles accessible by slug |
| `GET /help/search` | ✅ requireAuth | status=published only | No role/package/module filter on search results |
| `GET /help/faq` | ✅ requireAuth | category (optional) | No role/package/module filter |
| Admin CRUD endpoints | ✅ requireAuth + admin role | — | ✅ Properly guarded |

**Critical gap:** A hidden article (e.g., one role-restricted) can still be accessed directly via `/help/article/its-slug` because the article detail endpoint performs no audience check.

### Frontend Pages

| File | Current State | Issues |
|---|---|---|
| `help.tsx` | Landing page + search + categories | `?module=` query param is ignored; no role/package context shown; support CTA points to `info@carmetechnology.com` |
| `help-article.tsx` | Article detail | No ToC; "Was this helpful? Contact us" links to `info@carmetechnology.com`; no role/package badges; no breadcrumb to category |
| `help-faq.tsx` | FAQ list | Support email points to `info@carmetechnology.com`; no role/package filter |
| `help-videos.tsx` | Video list | 5 of 6 cards "Coming Soon"; request link points to `info@carmetechnology.com` |
| `help-admin.tsx` | Admin editor | Article and FAQ CRUD; no reviewed-date/package/tag controls; no category editor |
| `components/help/MarkdownContent.tsx` | Markdown renderer | Hand-rolled parser; uses `dangerouslySetInnerHTML` without sanitization → XSS risk |
| `components/help/HelpButton.tsx` | Context button | Emits `?module=` param that landing ignores |

---

## 3. Categories Audit

| # | Current Name | Icon | Article Count | Issues | Recommended Action |
|---|---|---|---|---|---|
| 1 | Getting Started | Rocket | 2 | None | **Keep** — rename description to note both L1/L2 |
| 2 | Dashboard | LayoutDashboard | 1 | None | **Keep** |
| 3 | Controls | ShieldCheck | 4 (incl. DFARS + Crosswalk) | DFARS and Crosswalk buried here; no Tasks category | **Keep** — move DFARS and Crosswalk to own categories |
| 4 | Evidence | FileText | 2 | None | **Keep** |
| 5 | Documentation & SSP | BookOpen | 2 | Merged; spec requires separate Documentation and SSP categories | **Split** into Documentation and System Security Plan |
| 6 | Monitoring Tracker | Activity | 2 | None | **Keep** |
| 7 | POA&M | AlertTriangle | 2 | Name is correct; description OK | **Keep** |
| 8 | Implementation Roadmap | Map | 1 | No L1/L2 distinction | **Keep** — add L1/L2 aware articles |
| 9 | Pre-Assessment | Cable | 2 | No module-enabled check | **Keep** — add module gate |
| 10 | Reports | BarChart3 | 2 | None | **Keep** |
| 11 | Users & Roles | Users | 2 | User Roles Guide is outdated | **Keep** — replace article |
| 12 | MFA & Login Help | Lock | 1 | Does not include SSO guidance | **Rename** to "MFA, SSO & Sign-In" |
| 13 | Workflows | GitBranch | 8 | None | **Keep** |
| 14 | Troubleshooting | Wrench | 1 | Contact email wrong | **Keep** |
| — | *(missing)* | — | 0 | No Tasks category | **Add** Tasks category |
| — | *(missing)* | — | 0 | No DFARS Obligations category | **Add** DFARS Obligations category (module-gated) |
| — | *(missing)* | — | 0 | No Framework Crosswalk category | **Add** Framework Crosswalk category |
| — | *(missing)* | — | 0 | No Organizations & Modules category | **Add** Organizations & Modules (admin-visible) |
| — | *(missing)* | — | 0 | No Certification & Sustainment category | **Add** Certification & Sustainment |

---

## 4. Article-by-Article Audit

### A1 — Getting Started with Control HUB
| Field | Value |
|---|---|
| **Slug** | `getting-started` |
| **Category** | Getting Started |
| **Module** | dashboard |
| **Tags / Keywords** | getting started, onboarding, organization, navigation, dashboard, first steps, roles |
| **Last Reviewed** | *(none — field does not exist)* |
| **Roles Visible** | All (no restriction) |
| **Packages** | All (no filter) |
| **Referenced Routes** | Dashboard, Controls, Evidence, Monitoring Tracker, POA&Ms, Implementation Roadmap, Pre-Assessment, Documentation, SSP, Reports — all exist |

**Outdated Statements:**
- Lists roles as `Admin`, `Compliance Manager`, `Reviewer`, `IT Contributor`, `Assessor` — does not mention Platform Role None vs Global Admin, Organization roles, multi-org access, Executive Viewer, Demo Viewer
- Sidebar includes "Pre-Assessment" unconditionally — should be conditional on module being enabled
- Sidebar lists "110 CMMC controls across 14 domains" — L1 orgs have 17 controls
- "Assessor" described as "Read-only access to assessor packages" — actual role name is "Assessor Read-Only"
- "Controls" says "110 CMMC controls" — should be level-aware

**Capitalization Issues:** None in title; article body uses "Admin" (should be "Global Admin" or "Organization Admin" per context)

**Disposition: Keep and Update** — update role names, add L1 awareness, make Pre-Assessment conditional, update sidebar description to reflect all modules (Tasks, Certification)

---

### A2 — Dashboard Guide
| Field | Value |
|---|---|
| **Slug** | `dashboard-guide` |
| **Category** | Dashboard |
| **Module** | dashboard |
| **Last Reviewed** | *(none)* |
| **Roles Visible** | All |

**Outdated Statements:**
- "14 CMMC domains (AC, AT, AU, CM, IA, IR, MA, MP, PS, RA, CA, SC, SI, SA)" — SA is not a standard CMMC domain code; should be verified against live app
- Mentions "19 overdue monitoring items" in Monitoring Health description (implicit) — L1 orgs have 15 items
- Does not mention that KPI cards differ for L1 vs L2 orgs

**Disposition: Keep and Update** — verify domain list, add L1 awareness to monitoring metric, note that readiness cards may differ by package

---

### A3 — Controls Guide
| Field | Value |
|---|---|
| **Slug** | `controls-guide` |
| **Category** | Controls |
| **Module** | controls |
| **Last Reviewed** | *(none)* |
| **Roles Visible** | All |

**Outdated Statements:**
- "The Controls page lists all 110 CMMC Level 2 controls across 14 domains" — L1 orgs have 17 controls
- "Each control has a unique identifier (e.g., AC.L2-3.1.1)" — L1 identifiers use `AC.L1-3.1.1` format
- Control Detail Tabs listed: Implementation, Configure, Evidence, Monitoring, POA&M, SSP — does not mention Tasks tab; needs verification of actual tabs in live app
- "A control is 'Assessor Ready' when..." — uses undocumented term; needs to match actual UI label

**Missing Content:**
- No description of Views (Domain Overview, Detailed Table, Readiness Matrix, Attention Needed, Package View)
- No description of L1-specific control identifiers and aliases
- Tasks tab not mentioned

**Disposition: Keep and Update** — add L1/L2 awareness, add view descriptions, verify and update Control Detail tabs list, add Tasks tab

---

### A4 — Evidence Guide
| Field | Value |
|---|---|
| **Slug** | `evidence-guide` |
| **Category** | Evidence |
| **Module** | evidence |
| **Last Reviewed** | *(none)* |
| **Roles Visible** | All |

**Outdated Statements:**
- Evidence status "Superseded" mentioned — may not be implemented in current UI
- "Select multiple files at once from the Evidence page" for bulk upload — needs UX verification

**Missing Content:**
- No guide for bulk download or export folder structure
- No description of Smart Evidence Mapping (if publicly visible)
- No mention of evidence expiry/staleness policies

**Disposition: Keep and Update** — verify Superseded status is live, add bulk download guidance, verify bulk upload UX

---

### A5 — Documentation Guide
| Field | Value |
|---|---|
| **Slug** | `documentation-guide` |
| **Category** | Documentation & SSP |
| **Module** | documents |
| **Last Reviewed** | *(none)* |
| **Roles Visible** | All |

**Outdated Statements:**
- Mentions "Compliance Logs", "Checklists", "Gap Analysis" tabs — these are redirected to `/documents` in App.tsx (`/documents/logs`, `/documents/checklists`, `/documents/missing` all redirect to `/documents`), meaning the sub-tabs may have been consolidated
- "Over 60 pre-built CMMC policy and procedure templates" — actual count is 67 L2 templates + 19 L1 templates = 86 templates; or "over 85" is more accurate
- Does not distinguish L1 vs L2 templates
- Category should become "Documentation" after the split

**Missing Content:**
- No DOCX/PDF download description
- No document review workflow (submit → review → approve/reject → resubmit)

**Disposition: Keep and Update** — verify active sub-tabs, correct template count, add L1/L2 distinction, move to Documentation category, add review workflow

---

### A6 — SSP Guide
| Field | Value |
|---|---|
| **Slug** | `ssp-guide` |
| **Category** | Documentation & SSP |
| **Module** | ssp |
| **Last Reviewed** | *(none)* |
| **Roles Visible** | All |

**Outdated Statements:**
- "Every CMMC Level 2 organization must have one" — L1 organizations also have an SSP (Level 1 FCI SSP Template); article is L2-only
- Export formats listed (PDF and Word) — needs verification; SSP export uses DOCX prefill wizard

**Missing Content:**
- No description of SSP Prefill Wizard
- No L1 FCI SSP guidance
- No description of `ssp/documents` or `ssp/prefill` routes

**Disposition: Keep and Update** — split into L1 SSP guide and L2 SSP guide, add Prefill Wizard description, move to System Security Plan category

---

### A7 — Monitoring Tracker Guide
| Field | Value |
|---|---|
| **Slug** | `monitoring-guide` |
| **Category** | Monitoring Tracker |
| **Module** | monitoring |
| **Last Reviewed** | *(none)* |
| **Roles Visible** | All |

**Outdated Statements:**
- "schedules **19** recurring operational reviews required for **CMMC Level 2**" — L1 orgs now have 15 L1-specific monitoring items; L2 orgs have a separate list. The article is L2-only and will be incorrect for L1 orgs.
- "Monthly — Every 30 days" through "Annual" — correct, but frequency list should note L1 items specifically use monthly/quarterly/annual
- "Inline editor" — needs UX verification that clicking a row opens an inline editor vs a modal

**Missing Content:**
- No mention of L1 monitoring items (access review, malware scan, patching, boundary review, physical review, etc.)
- No mention that items are automatically seeded based on CMMC level

**Disposition: Split by Package** — create `monitoring-guide-l1.md` and `monitoring-guide-l2.md` or add level-conditional sections

---

### A8 — POA&M Guide
| Field | Value |
|---|---|
| **Slug** | `poam-guide` |
| **Category** | POA&M |
| **Module** | poams |
| **Last Reviewed** | *(none)* |
| **Roles Visible** | All |

**Capitalization Issues:**
- Module key renders as lowercase `poams` badge in UI

**Outdated Statements:**
- None found — content matches current implementation

**Disposition: Keep and Update** — fix module badge display name to "POA&M"

---

### A9 — Implementation Roadmap Guide
| Field | Value |
|---|---|
| **Slug** | `roadmap-guide` |
| **Category** | Implementation Roadmap |
| **Module** | roadmap |
| **Last Reviewed** | *(none)* |
| **Roles Visible** | All |

**Outdated Statements:**
- Describes only L2 roadmap views (Priority Actions, Coverage Matrix, Roadmap Progress) — L1 roadmap has a different profile with different action categories
- Does not mention that roadmap profile is selected based on active packages
- "moves through phases: Foundation → Core → Advanced" — L1 may have different phase names

**Missing Content:**
- No L1 roadmap guidance
- No description of how to link evidence to a roadmap action
- No description of action stages (if any)

**Disposition: Split by Package** — create L1 and L2 roadmap guides, or add level-conditional sections; show correct guide based on org's active package

---

### A10 — Pre-Assessment Guide
| Field | Value |
|---|---|
| **Slug** | `pre-assessment-guide` |
| **Category** | Pre-Assessment |
| **Module** | pre-assessment |
| **Last Reviewed** | *(none)* |
| **Roles Visible** | All (no module-enabled gate) |

**Critical Issues:**
- Shown to ALL users including orgs where Pre-Assessment is disabled — should be hidden when module is disabled for normal users
- No distinction between configuration (enable/disable) and usage articles

**Outdated Statements:**
- "Run Assessment" step says "Select the CMMC controls to assess" — actual UX may differ; verify
- "2–5 minutes" scan time — should be approximate

**Disposition: Split by Role** — create: (1) "What Is Pre-Assessment?" (visible to users with configure permission even when disabled); (2) usage articles visible only when module is enabled

---

### A11 — Reports Guide
| Field | Value |
|---|---|
| **Slug** | `reports-guide` |
| **Category** | Reports |
| **Module** | reports |
| **Last Reviewed** | *(none)* |
| **Roles Visible** | All |

**Outdated Statements:**
- "**Monitoring Tracker Report** Status of all **19** recurring monitoring items" — L1 orgs have 15; this is a hardcoded count
- "**Control Status Report** — A detailed view of all **110** CMMC controls" — L1 orgs have 17
- PDF and CSV as formats — needs verification per report type
- "Reports → Audit Readiness" — route `/reports/audit` exists ✅

**Disposition: Keep and Update** — remove hardcoded counts (17 vs 110), link to correct report routes

---

### A12 — User Roles Guide
| Field | Value |
|---|---|
| **Slug** | `user-roles-guide` |
| **Category** | Users & Roles |
| **Module** | users |
| **Last Reviewed** | *(none)* |
| **Roles Visible** | All |

**Critical Issues — Outdated Role Model:**
- Lists "Global Admin" with "Cannot: Nothing — global admins have unrestricted access." — spec explicitly prohibits this wording; must be replaced with "subject to protected-account safeguards and application security controls"
- Lists "Member" role — this role does not appear in the current auth architecture (which has Platform Role None + org-specific roles)
- Does not explain Platform Role None
- Does not explain multi-organization role differences
- Does not mention effective permissions (org-specific role overrides platform role for access checks)
- Does not mention break-glass safeguards
- Does not mention Executive Viewer role
- "Organization Admin" described as "Full access within their organization" — inaccurate; cannot access global settings, cannot toggle global features
- Role "Assessor (Read-Only)" — current actual role name used in system should be verified
- "Demo Viewer" — correctly mentioned but not explained fully

**Capitalization Issues:**
- Module key renders as lowercase `users` in badge UI

**Disposition: Replace** — full replacement required; create dynamic "My Role in Control HUB" page + updated static role reference

---

### A13 — MFA & Login Guide
| Field | Value |
|---|---|
| **Slug** | `mfa-login-guide` |
| **Category** | MFA & Login Help |
| **Module** | settings |
| **Last Reviewed** | *(none)* |
| **Roles Visible** | All |

**Outdated Statements:**
- No mention of Microsoft SSO / Microsoft Entra ID sign-in
- No mention of SSO-based password bypass (SSO users may not have a password in Control HUB)
- "Contact your organization admin" for lockout — admin may not be able to unlock without Global Admin access

**Missing Content:**
- Microsoft SSO login flow
- What happens if SSO is enabled for an org
- SSO-enrolled user cannot use password reset

**Disposition: Keep and Update** — add SSO section, rename category to "MFA, SSO & Sign-In"

---

### A14 — How to Invite a New User (Workflow)
| Field | Value |
|---|---|
| **Slug** | `workflow-invite-user` |
| **Category** | Workflows |
| **Module** | users |
| **Role Visibility** | `["admin", "compliance_manager"]` |
| **Last Reviewed** | *(none)* |

**Outdated Statements:**
- "Fill in: Email, Name, **Role**, **Organization**" — current model: email + name + platform role + org membership + org role; single-field "Role" is outdated
- Does not mention: invitation expiration behavior, Microsoft SSO invitation flow, multi-org access
- "Status 'Active'" after acceptance — needs verification against actual user status values

**Disposition: Keep and Update** — update invitation fields to match current multi-org model, add SSO note, add org-role assignment

---

### A15 — How to Upload Evidence to a Control (Workflow)
| Field | Value |
|---|---|
| **Slug** | `workflow-upload-evidence` |
| **Category** | Workflows |
| **Module** | evidence |
| **Role Visibility** | None (all users) |
| **Last Reviewed** | *(none)* |

**Outdated Statements:**
- Mentions "Submit for Review" button on evidence — needs UX verification this button exists
- "Uploader is notified of the approval or rejection" — notification mechanism needs verification

**Disposition: Keep and Update** — verify UX flow, add note about evidence statuses

---

### A16 — How to Approve Evidence (Workflow)
| Field | Value |
|---|---|
| **Slug** | `workflow-approve-evidence` |
| **Category** | Workflows |
| **Module** | evidence |
| **Role Visibility** | `["admin", "compliance_manager", "reviewer"]` |
| **Last Reviewed** | *(none)* |

**Outdated Statements:**
- "Bulk Actions → Approve Selected" — needs UX verification this exists in current Evidence page
- Role visibility should reference org roles, not generic strings

**Disposition: Keep and Update** — required capability: `evidence.approve`; verify bulk action UI

---

### A17 — How to Generate a Document from a Template (Workflow)
| Field | Value |
|---|---|
| **Slug** | `workflow-generate-document` |
| **Category** | Workflows |
| **Module** | documents |
| **Role Visibility** | None (all users) |
| **Last Reviewed** | *(none)* |

**Outdated Statements:**
- "Over 60 pre-built CMMC-aligned document templates" — actual count is 86 (67 L2 + 19 L1)
- Does not mention L1 vs L2 template differences
- "Fill in any required fields (organization name, effective date, owner, etc.)" — actual generation wizard fields may differ
- "Submit for Review" and approval workflow — review workflow status needs verification

**Disposition: Keep and Update** — correct template count, add L1/L2 distinction, verify generation wizard fields

---

### A18 — How to Complete a Monitoring Review (Workflow)
| Field | Value |
|---|---|
| **Slug** | `workflow-monitoring-review` |
| **Category** | Workflows |
| **Module** | monitoring |
| **Role Visibility** | None (all users) |
| **Last Reviewed** | *(none)* |

**Outdated Statements:**
- "Click the row to open the inline editor" — UX needs verification
- Does not distinguish L1 vs L2 monitoring items

**Disposition: Keep and Update** — verify inline editor vs modal, add L1/L2 context

---

### A19 — How to Create and Close a POA&M (Workflow)
| Field | Value |
|---|---|
| **Slug** | `workflow-create-poam` |
| **Category** | Workflows |
| **Module** | poams |
| **Role Visibility** | None (all users) |
| **Last Reviewed** | *(none)* |

**Outdated Statements:**
- None found — content appears accurate

**Disposition: Keep and Update** — fix module badge display; restrict visibility to roles with `poam.create` capability

---

### A20 — How to Run a Tenant-Connected Pre-Assessment (Workflow)
| Field | Value |
|---|---|
| **Slug** | `workflow-run-assessment` |
| **Category** | Workflows |
| **Module** | pre-assessment |
| **Role Visibility** | None (all users) — should be restricted |
| **Last Reviewed** | *(none)* |

**Critical Issues:**
- Shown even when Pre-Assessment module is disabled
- Should require `preassessment.run` capability

**Disposition: Keep and Update** — add module gate; add capability restriction; add note that this requires module to be enabled

---

### A21 — How to Generate a Compliance Report (Workflow)
| Field | Value |
|---|---|
| **Slug** | `workflow-generate-report` |
| **Category** | Workflows |
| **Module** | reports |
| **Role Visibility** | None (all users) |
| **Last Reviewed** | *(none)* |

**Outdated Statements:**
- "The assessor can access Control HUB directly using an Assessor Read-Only account" — minor; accurate

**Disposition: Keep and Update** — no critical issues; add capability restriction for report export

---

### A22 — Troubleshooting Common Issues
| Field | Value |
|---|---|
| **Slug** | `troubleshooting` |
| **Category** | Troubleshooting |
| **Module** | *(none)* |
| **Role Visibility** | All |
| **Last Reviewed** | *(none)* |

**Critical Issues:**
- Contact support points to `info@carmetechnology.com` — **must change to support@carmetechnology.com**
- No support ticket workflow mentioned

**Disposition: Keep and Update** — replace contact email and mailto link with support ticket workflow

---

### A23 — Understanding Compliance Packages
| Field | Value |
|---|---|
| **Slug** | `compliance-packages-overview` |
| **Category** | Getting Started |
| **Module** | settings |
| **Last Reviewed** | *(none)* |
| **Roles Visible** | All |

**Outdated Statements:**
- Mentions "DFARS clauses" — article is shown to L1 orgs without DFARS packages; should be filtered
- Package filter description may be outdated (actual UI may differ from described behavior)

**Disposition: Keep and Update** — add package-aware display; hide DFARS section for non-DFARS orgs

---

### A24 — DFARS Contract Obligations
| Field | Value |
|---|---|
| **Slug** | `dfars-obligations-guide` |
| **Category** | Controls |
| **Module** | dfars |
| **Last Reviewed** | *(none)* |
| **Roles Visible** | All — no DFARS package gate |

**Critical Issues:**
- Shown to L1 orgs without DFARS packages — should be hidden unless org has a DFARS-applicable package or user is Global Admin
- Module key `dfars` renders as lowercase in badge UI — should display "DFARS"

**Disposition: Keep and Update** — add package gate; move to new DFARS Obligations category; fix badge display

---

### A25 — Framework Crosswalk — Mapping Between Standards
| Field | Value |
|---|---|
| **Slug** | `framework-crosswalk-guide` |
| **Category** | Controls |
| **Module** | crosswalk |
| **Last Reviewed** | *(none)* |
| **Roles Visible** | All |

**Outdated Statements:**
- Content is accurate but shown universally — L1-only orgs without NIST 800-171 or DFARS packages see crosswalk content that may not apply

**Disposition: Keep and Update** — move to new Framework Crosswalk category; add package-aware display

---

## 5. FAQ Audit

**Total FAQs seeded:** 23  
**Categories:** General (2), Pre-Assessment (5), Evidence (6), Controls (1), Monitoring (2), POA&M (2), Reports (1), Users & Roles (2), MFA & Login (2)

| # | Category | Question | Issues | Disposition |
|---|---|---|---|---|
| 1 | General | What is Control HUB? | None | ✅ Keep |
| 2 | General | Is this an official CMMC assessment? | None | ✅ Keep |
| 3 | Pre-Assessment | What does 'Tenant Scan Health' mean? | Shown to all — no module gate | Update + add module gate |
| 4 | Pre-Assessment | What does 'Controls Touched by Tenant Scan' mean? | Shown to all — no module gate; references "110 CMMC controls" | Update count; add module gate |
| 5 | Evidence | Why does evidence start as 'Draft'? | None | ✅ Keep |
| 6 | Evidence | What is the difference between Evidence and Documents? | None | ✅ Keep |
| 7 | Controls | What is the difference between Implementation and Configure? | None | ✅ Keep |
| 8 | Monitoring | What does 'Current' mean in the Monitoring Tracker? | None | ✅ Keep |
| 9 | Monitoring | Why is a monitoring item overdue? | None | ✅ Keep |
| 10 | Evidence | How do I upload evidence? | None | ✅ Keep |
| 11 | Evidence | How do I bulk upload evidence? | UX needs verification | Verify + Keep |
| 12 | Evidence | How do I link evidence to multiple controls? | None | ✅ Keep |
| 13 | Evidence | How do I remove evidence from a control without deleting it? | None | ✅ Keep |
| 14 | POA&M | How do I create a POA&M? | None | ✅ Keep |
| 15 | POA&M | How do I close a POA&M? | None | ✅ Keep |
| 16 | Reports | How do I generate a report? | None | ✅ Keep |
| 17 | Users & Roles | What can an Assessor Read-Only user see? | None | ✅ Keep — verify role name is "Assessor Read-Only" |
| 18 | Users & Roles | How do I invite a user? | Outdated — assumes single-role, single-org model | Update |
| 19 | MFA & Login | How do I reset a password? | None | ✅ Keep |
| 20 | MFA & Login | How does MFA work? | None | ✅ Keep |
| 21 | Pre-Assessment | How do I connect a Microsoft tenant? | No module gate | Add module gate |
| 22 | Pre-Assessment | What Microsoft permissions are required? | No module gate | Add module gate |
| 23 | Pre-Assessment | Why might Intune data be unavailable? | No module gate | Add module gate |

**Missing FAQs (recommended additions):**
- What is Platform Role None?
- Why does my access change when I switch organizations?
- How do I enable or disable the Pre-Assessment module?
- What is the difference between L1 and L2 CMMC compliance?
- Why do I see fewer controls than expected?
- What is the Implementation Roadmap?
- How do I generate a document?
- What are the CMMC monitoring requirements?

---

## 6. Video Audit

**Source:** `artifacts/cmmc-app/src/pages/help-videos.tsx` (hardcoded, no database)

| ID | Title | Available | Category | Issues |
|---|---|---|---|---|
| demo | Control HUB Demo Walkthrough | ✅ Yes | Overview | Links to `https://www.carmetechnology.com` (external, not an actual video player) |
| getting-started | Getting Started: First Steps | ❌ Coming Soon | Getting Started | Primary card; should not show as prominent disabled card |
| evidence | Uploading and Managing Evidence | ❌ Coming Soon | Evidence | Same |
| pre-assessment | Running a Tenant-Connected Pre-Assessment | ❌ Coming Soon | Pre-Assessment | Same; shown even when module is disabled |
| monitoring | Using the Monitoring Tracker | ❌ Coming Soon | Monitoring | Same |
| reports | Generating Compliance Reports | ❌ Coming Soon | Reports | Same |

**Problems:**
- 5 of 6 cards show as full-size disabled cards with "Coming Soon" — makes Help Center look unfinished
- No database — videos are hardcoded; no admin management, no role filter, no module filter
- "Request a Video" links to `info@carmetechnology.com` — **must change to support ticket workflow**
- Pre-Assessment video shown even when module is disabled
- Only available video links to marketing website, not an actual video player

**Disposition:** Hide Coming Soon cards from primary grid; move to collapsible "Planned Tutorials" section; replace "Request a Video" with support ticket; add video to database with role/package/module fields

---

## 7. Support Links Audit

| Location | Current Email | Required Email |
|---|---|---|
| `help.tsx` — Contact Support CTA | `info@carmetechnology.com` | `support@carmetechnology.com` |
| `help-faq.tsx` — support link | `info@carmetechnology.com` | Support ticket workflow |
| `help-article.tsx` — "Was this helpful? Contact us" | `info@carmetechnology.com` | Support ticket workflow |
| `help-videos.tsx` — "Request a Video" | `info@carmetechnology.com` | Support ticket with category "Tutorial Request" |
| `help-seed-data.ts` — Troubleshooting article body | `info@carmetechnology.com` | `support@carmetechnology.com` + support ticket |

**All five occurrences of `info@carmetechnology.com` must be replaced.**

---

## 8. Capitalization Issues

Raw module key values currently rendering directly in the UI (badge display in `help.tsx`):

| Raw Key | Required Display |
|---|---|
| `pre-assessment` | Pre-Assessment |
| `poams` | POA&M |
| `ssp` | SSP |
| `users` | Users & Roles |
| `dfars` | DFARS |
| `settings` | Settings |
| `monitoring` | Monitoring Tracker |
| `documents` | Documentation |
| `evidence` | Evidence |
| `controls` | Controls & Requirements |
| `reports` | Reports & Exports |
| `roadmap` | Implementation Roadmap |
| `crosswalk` | Framework Crosswalk |
| `dashboard` | Dashboard |

**Solution:** Create a centralized `HELP_MODULE_LABELS` map and use it everywhere module keys are rendered.

---

## 9. Technical Debt

| Issue | File | Severity | Recommended Fix |
|---|---|---|---|
| `dangerouslySetInnerHTML` without sanitization in MarkdownContent | `components/help/MarkdownContent.tsx` | 🔴 High (XSS) | Sanitize via `DOMPurify` or replace with `react-markdown` + `remark-gfm` |
| `?module=` query param from HelpButton is ignored by landing page | `help.tsx:61-64` | 🟡 Medium | Read and apply `module` param on landing to pre-filter or highlight relevant category |
| Direct article slug URL has no audience check | `routes/help.ts` GET `/help/articles/:slug` | 🔴 High (access control) | Add same role/package/module filter as article list; return 403 for unauthorized slugs |
| Search does not filter by role/package/module | `routes/help.ts` GET `/help/search` | 🔴 High | Apply same filters as article list |
| `faq_items` inserted twice in some DB states | `startup-seed.ts:407-477` | 🟡 Medium | Fix idempotency logic |
| Videos hardcoded in component | `help-videos.tsx` | 🟡 Medium | Move to database with role/module/package fields |
| No `last_reviewed_at` field in schema | `schema/help.ts` | 🟡 Medium | Add migration to add field |
| No `estimated_read_minutes` field | `schema/help.ts` | 🟡 Low | Add migration |
| Admin editor has no reviewed-date or package controls | `help-admin.tsx` | 🟡 Medium | Add fields to admin form |
| No capability-based visibility — uses raw role strings | `routes/help.ts` | 🟡 Medium | Implement `resolveHelpContext()` and capability checks |

---

## 10. Missing New Content (per Spec)

The following articles are specified but do not currently exist:

**Tasks:**
- Creating a Control Task
- Opening and Viewing a Task
- Editing, Assigning, Starting, Blocking, Resuming, Closing, Reopening, Cancelling a Task
- Understanding Task Statuses

**Evidence:**
- Bulk Downloading Evidence
- Understanding Export Folder Structures and Manifests
- Troubleshooting Preview and Download Problems

**Implementation Roadmap:**
- CMMC Level 1 Roadmap guide (separate from L2)
- Action stages and evidence linking

**Pre-Assessment:**
- What Is Pre-Assessment? (for users with configure permission when disabled)
- How to Enable or Disable Pre-Assessment
- Reconnecting a Tenant

**Documentation:**
- Submitting a Document for Review
- Approving / Requesting Changes / Resubmitting
- Document statuses explained

**SSP:**
- Level 1 FCI SSP Template guide
- Prefilling an SSP (wizard walkthrough)
- Downloading a Prefilled SSP / Uploading a Completed SSP

**Users & Roles:**
- My Role in Control HUB (dynamic page)
- Platform Role None explained
- Switching Organizations
- Why My Role Changes Between Organizations
- Requesting Additional Access
- Protected Break-Glass Account (Global Admin only)

**Support:**
- Submit a Support Ticket (new workflow — does not exist at all)
- My Support Requests (new page)

**Organizations & Modules:**
- Managing Organizations (Global Admin)
- Package and Module Configuration
- Configuring Pre-Assessment (Org Admin)

**MFA & SSO:**
- Microsoft SSO Sign-In Guide
- What Happens If SSO Is Enabled for Your Organization

**Certification & Sustainment:**
- Certification Overview and Sustainment

---

## 11. Summary Dispositions

| Disposition | Articles |
|---|---|
| Keep and Update | A1, A2, A4, A8, A13, A14, A15, A16, A17, A18, A19, A21, A22, A23, A25 |
| Split by Package / Role | A7 (Monitoring — L1/L2), A9 (Roadmap — L1/L2), A10 (Pre-Assessment — config/usage) |
| Replace | A12 (User Roles Guide — full replacement with dynamic role page) |
| Keep and Update — move category | A5 (Documentation), A6 (SSP), A24 (DFARS), A25 (Crosswalk) |
| Update with module gate | A10, A20 (Pre-Assessment articles) |

---

## 12. Implementation Priority

### Phase 1 — Critical Fixes (no schema change required)
1. Replace all `info@carmetechnology.com` with correct email or support ticket CTA
2. Add audience check to `GET /help/articles/:slug` (block unauthorized direct access)
3. Apply same filters to search endpoint
4. Fix module badge display using centralized label map
5. Sanitize `MarkdownContent` renderer
6. Hide "Coming Soon" video cards from primary grid

### Phase 2 — Schema and Infrastructure
1. Add `last_reviewed_at`, `estimated_read_minutes`, `content_version` to `help_articles`
2. Add `HelpArticleAudience` table (capability-based visibility)
3. Add `HelpArticlePackage` table (package filtering)
4. Add `HelpArticleModule` table (module filtering)
5. Add `help_videos` table (move videos from hardcoded to DB)
6. Add `support_tickets` and `support_ticket_attachments` tables
7. Implement `resolveHelpContext(userId, orgId)` service
8. Implement `POST /api/help/support-tickets` endpoint with Resend email delivery

### Phase 3 — Content Updates
1. Update all 25 existing articles per dispositions above
2. Add new articles: Tasks, Evidence (bulk), Pre-Assessment (config/usage split), SSP (L1/L2), User Roles (dynamic page)
3. Add missing FAQs
4. Add capitalization label map throughout

### Phase 4 — UI/UX Redesign
1. Redesign Help landing page (hero, search, role context, recommended, categories, recently updated, support panel)
2. Redesign article page (ToC, breadcrumb, role/package badges, callout components, feedback, related)
3. Add Support Ticket form and My Support Requests page
4. Redesign Videos page (published only in primary grid, planned in collapsible section)
5. Responsive and accessibility improvements

---

*This audit was conducted 2026-08-03. No production data was modified. All findings are based on read-only code inspection.*
