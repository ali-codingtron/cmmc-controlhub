---
name: Control-scoped Task Lifecycle System
description: Architecture of the nested task router, activity table, task number generation, and the distinction between old flat /api/tasks routes and new nested control-task routes.
---

## Rule
New tasks created inside Control Detail use the nested router `/api/organizations/:orgId/controls/:controlId/tasks`. The flat `/api/tasks` routes are preserved unchanged for the Tasks page and task-detail page.

**Why:** The old flat routes lack lifecycle state, activity tracking, and task numbers. Rather than retrofitting them and breaking existing pages, we added a parallel nested API with richer semantics.

**How to apply:** When adding task-related features to control detail, use the nested routes. When modifying the Tasks page or task-detail page, use the flat routes.

## Task Number Generation
- `taskNumber` column: format `TASK-XXXX` (4-digit zero-padded), unique within an org, stored on `tasksTable`
- Generation: query all existing `taskNumber` values for the org, extract the max numeric suffix, increment by 1
- Generated on first `POST .../controls/:controlId/tasks` (not on legacy task creation)
- Old tasks have `taskNumber = null`

## Activity Table (`taskActivitiesTable`)
Fields: `id`, `taskId`, `organizationId`, `actingUserId`, `actingUserName`, `action`, `field`, `previousValue`, `newValue`, `note`, `createdAt`
- One row per lifecycle event: `created`, `started`, `blocked`, `resumed`, `closed`, `reopened`, `cancelled`, `edited`
- `edited` rows have `field` set to the changed column name, `previousValue`/`newValue` set to human-readable strings

## New Lifecycle Columns on `tasksTable`
`taskNumber`, `startDate`, `closedDate`, `closureSummary`, `closedByUserId`, `blockedReason`, `blockedByUserId`, `blockedAt`, `reopenedByUserId`, `reopenedAt`, `reopenReason`, `cancelledByUserId`, `cancelledAt`, `cancellationReason`, `updatedByUserId`

## `blocked` and `closed` Status Values
These were added to `taskStatusEnum` (raw SQL + drizzle push). The enum now includes: `open`, `in_progress`, `blocked`, `completed`, `overdue`, `deferred`, `cancelled`, `closed`

## Frontend Component
`artifacts/cmmc-app/src/components/tasks/ControlTasksTab.tsx` — self-contained, ~850 lines. Renders inside `control-detail.tsx` Tasks tab. Uses URL state `?task=TASK_UUID` for deep-link to drawer.

## TypeScript Patterns (avoid these mistakes)
- `db.alias()` does NOT exist in this drizzle-orm version — multi-join to the same table must be done with two-phase load (batch user ID → name resolution)
- `logAudit()` opts only supports `entityLabel`, `previousValue`, `newValue` — no `metadata` field
- `recordActivity()` `tx` parameter must be typed as `Pick<typeof db, "insert">` not `typeof db` (transactions lack `$client: Pool`)
- `@workspace/db` uses TypeScript project references — after schema changes, run `pnpm exec tsc -b` in `lib/db/` to regenerate declarations before the API server typecheck will see new columns/tables
