---
name: Roadmap module architecture
description: Implementation Roadmap visual redesign, completion guard, evidence workflows, and optional module system.
---

## Completion guard (PATCH /roadmap/actions/:id/progress)
- Setting status="complete" requires readyToComplete===true OR admin/compliance_manager override (overrideJustification + overrideApprovedBy + overrideApprovedAt all required)
- Setting status="not_applicable" requires admin/compliance_manager + overrideJustification
- Rejects with 409 { error, missing[] } if guard fails
- New columns in org_roadmap_progress: overrideApprovedBy, overrideApprovedAt
- New status enum value: "not_applicable" added to roadmapStatusEnum

**Why:** Prevents free-pick Complete in the old status dropdown from bypassing all stage requirements.

## New endpoints
- GET /roadmap/actions/:id/consistency — read-only; returns { hasInconsistency, missing[], status }
- POST /roadmap/actions/:id/override — admin/cm only; saves legacy override fields, logs roadmap_completion_override_recorded
- POST /roadmap/actions/:id/reopen — admin/cm only; sets status=in_progress, clears completedAt/result, logs roadmap_action_reopened

## Organization features (optional modules)
- New table: organization_features (organization_id, feature_key enum, enabled bool, initialized bool, enabledBy/At, disabledBy/At, changeReason)
- Feature key: "IMPLEMENTATION_ROADMAP"; unique (org_id, feature_key)
- Missing record = enabled (fail-open default)
- GET /organizations/:id/features — any org member; returns feature list with defaults
- PATCH /organizations/:id/features/:key — Global Admin only; requires changeReason; logs roadmap_module_enabled/disabled
- requireRoadmapEnabled middleware added to GET /roadmap/actions, GET /roadmap/actions/:id, PATCH progress, GET /roadmap/coverage-matrix

**Why:** Not all orgs need guided roadmap; data is never deleted, just hidden. Fail-open on feature-check errors to avoid breaking existing orgs.

## Frontend architecture
- RoadmapFeatureContext (artifacts/cmmc-app/src/context/RoadmapFeatureContext.tsx): useRoadmapFeature() hook, staleTime 5min, fail-open
- Wrapped inside OrgContext provider in App.tsx
- Sidebar and dashboard roadmap sections gated on isRoadmapEnabled
- Roadmap routes show RoadmapDisabledPage when disabled (Map icon, explanation)
- Organizations page: "Modules" section in EditOrgDialog for Global Admins; shows Enabled/Disabled + PATCH button with confirmation+reason dialog

## Roadmap visual redesign (all 4 pages)
- Replaced all PHASE_COLORS pastel card backgrounds with bg-card (neutral)
- Phase badges: single muted neutral class "bg-muted text-foreground border"
- PriorityBadge: semantic light/dark pairs (red/orange/amber/slate)
- "How It Works" panel: single collapsible, default collapsed, persisted in localStorage["roadmap_howto_collapsed"]
- PhaseView: showEmptyPhases toggle, empty phases show "No actions assigned"
- Action detail: 2-column lg layout; left=content, right=sticky ActionProgressPanel (stage breakdown, progress %, assignment, "How progress is calculated" tooltip)
- Coverage matrix: icon-based support indicators (CheckCircle2/CircleDashed/FileText/BookOpen/Activity), sticky thead, Tooltips on cells
- Progress page: phase cards use bg-card; added Attention Needed + Ready for Review KPIs
