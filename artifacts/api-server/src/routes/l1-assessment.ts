/**
 * CMMC Level 1 Annual Self-Assessment — API Routes
 *
 * All routes are mounted under /l1-assessment and require:
 *  - requireAuth  — valid JWT
 *  - requireOrg   — X-Organization-ID header; sets req.orgId, req.orgRole
 *  - requireL1Module (inline guard) — org must have an active CMMC L1 package
 *
 * Status lifecycle (stored in level1_annual_assessments.status enum):
 *   in_progress → submitted → affirmed → locked
 *
 * Extended workflow state is stored as JSON in snapshotMetadata under the
 * "workflowState" key so we don't need additional enum values:
 *   READY_FOR_MANAGEMENT_REVIEW | CHANGES_REQUESTED |
 *   READY_FOR_SPRS | PENDING_AFFIRMATION | FINAL_LEVEL_1_SELF
 */

import { Router } from "express";
import { createHash } from "crypto";
import { randomUUID } from "crypto";
import { eq, and, desc, asc, inArray } from "drizzle-orm";
import l1ReportsRouter from "./l1-assessment-reports";
import {
  db,
  level1AnnualAssessmentsTable,
  level1AssessmentRequirementsTable,
  level1AssessmentObjectivesTable,
  level1AssessmentEvidenceLinksTable,
  evidenceItemsTable,
  organizationsTable,
} from "@workspace/db";
import { requireAuth } from "../lib/auth";
import { requireOrg } from "../middleware/org";
import { canDo } from "../lib/permissions";
import { logAudit } from "../lib/audit";
import { isL1AssessmentActive } from "../lib/l1-assessment-helpers";

const router = Router();

// ── 17 CMMC Level 1 Practices ───────────────────────────────────────────────

export const L1_REQUIREMENTS = [
  { requirementId: "AC.L1-3.1.1",  canonicalKey: "L1-AC-1", requirementTitle: "Authorized Access Control",          sortOrder: 0  },
  { requirementId: "AC.L1-3.1.2",  canonicalKey: "L1-AC-2", requirementTitle: "Transaction & Function Control",      sortOrder: 1  },
  { requirementId: "AC.L1-3.1.20", canonicalKey: "L1-AC-3", requirementTitle: "Control Connection to External Systems", sortOrder: 2 },
  { requirementId: "AC.L1-3.1.22", canonicalKey: "L1-AC-4", requirementTitle: "Control Public Information",          sortOrder: 3  },
  { requirementId: "IA.L1-3.5.1",  canonicalKey: "L1-IA-1", requirementTitle: "Identify System Users",              sortOrder: 4  },
  { requirementId: "IA.L1-3.5.2",  canonicalKey: "L1-IA-2", requirementTitle: "Authenticate System Users",          sortOrder: 5  },
  { requirementId: "MP.L1-3.8.3",  canonicalKey: "L1-MP-1", requirementTitle: "Sanitize or Destroy Media",          sortOrder: 6  },
  { requirementId: "PE.L1-3.10.1", canonicalKey: "L1-PE-1", requirementTitle: "Limit Physical Access",              sortOrder: 7  },
  { requirementId: "PE.L1-3.10.3", canonicalKey: "L1-PE-2", requirementTitle: "Escort Visitors",                    sortOrder: 8  },
  { requirementId: "PE.L1-3.10.4", canonicalKey: "L1-PE-3", requirementTitle: "Audit Physical Access Logs",         sortOrder: 9  },
  { requirementId: "PE.L1-3.10.5", canonicalKey: "L1-PE-4", requirementTitle: "Manage Physical Access Devices",     sortOrder: 10 },
  { requirementId: "SC.L1-3.13.1", canonicalKey: "L1-SC-1", requirementTitle: "Boundary Protection",                sortOrder: 11 },
  { requirementId: "SC.L1-3.13.5", canonicalKey: "L1-SC-2", requirementTitle: "Public-Access System Separation",    sortOrder: 12 },
  { requirementId: "SI.L1-3.14.1", canonicalKey: "L1-SI-1", requirementTitle: "Flaw Remediation",                   sortOrder: 13 },
  { requirementId: "SI.L1-3.14.2", canonicalKey: "L1-SI-2", requirementTitle: "Malicious Code Protection",          sortOrder: 14 },
  { requirementId: "SI.L1-3.14.4", canonicalKey: "L1-SI-3", requirementTitle: "Update Malicious Code Protection",   sortOrder: 15 },
  { requirementId: "SI.L1-3.14.5", canonicalKey: "L1-SI-4", requirementTitle: "System & File Scanning",             sortOrder: 16 },
] as const;

// ── FAR 52.204-21 Clause → CMMC L1 Requirement Mapping ──────────────────────

/**
 * 15 FAR 52.204-21 (b) safeguarding clauses.
 * Clause (ix) uses AND-gate logic: all three PE requirements must be MET.
 */
export const FAR_CLAUSE_MAPPING = [
  { clause: "(i)",    label: "Limit access to authorized users",                  requirementIds: ["AC.L1-3.1.1"],                                   andGate: false },
  { clause: "(ii)",   label: "Limit access to authorized transactions/functions", requirementIds: ["AC.L1-3.1.2"],                                   andGate: false },
  { clause: "(iii)",  label: "Verify and control connections to external systems", requirementIds: ["AC.L1-3.1.20"],                                  andGate: false },
  { clause: "(iv)",   label: "Control CUI on publicly accessible systems",        requirementIds: ["AC.L1-3.1.22"],                                  andGate: false },
  { clause: "(v)",    label: "Identify information system users",                 requirementIds: ["IA.L1-3.5.1"],                                   andGate: false },
  { clause: "(vi)",   label: "Authenticate information system users",             requirementIds: ["IA.L1-3.5.2"],                                   andGate: false },
  { clause: "(vii)",  label: "Sanitize or destroy media before disposal/reuse",   requirementIds: ["MP.L1-3.8.3"],                                   andGate: false },
  { clause: "(viii)", label: "Limit physical access to authorized individuals",   requirementIds: ["PE.L1-3.10.1"],                                  andGate: false },
  { clause: "(ix)",   label: "Escort visitors and maintain physical access logs", requirementIds: ["PE.L1-3.10.3", "PE.L1-3.10.4", "PE.L1-3.10.5"], andGate: true  },
  { clause: "(x)",    label: "Monitor and control organizational communications", requirementIds: ["SC.L1-3.13.1"],                                  andGate: false },
  { clause: "(xi)",   label: "Implement subnetworks for publicly accessible systems", requirementIds: ["SC.L1-3.13.5"],                              andGate: false },
  { clause: "(xii)",  label: "Identify, report, and correct system flaws",        requirementIds: ["SI.L1-3.14.1"],                                  andGate: false },
  { clause: "(xiii)", label: "Provide protection from malicious code",            requirementIds: ["SI.L1-3.14.2"],                                  andGate: false },
  { clause: "(xiv)",  label: "Update malicious code protection mechanisms",       requirementIds: ["SI.L1-3.14.4"],                                  andGate: false },
  { clause: "(xv)",   label: "Perform periodic and real-time system scans",       requirementIds: ["SI.L1-3.14.5"],                                  andGate: false },
] as const;

// ── Helpers ──────────────────────────────────────────────────────────────────

type FindingValue = "met" | "not_met" | "not_applicable" | "not_reviewed";

interface FarClauseResult {
  clause: string;
  label: string;
  result: "met" | "not_met" | "not_applicable" | "not_reviewed";
  requirementIds: string[];
  andGate: boolean;
  findings: Array<{ requirementId: string; finding: FindingValue }>;
}

/**
 * Pure function: compute FAR 52.204-21 clause results from 17 CMMC L1 findings.
 * Clause (ix) uses AND-gate: all three PE requirements must be MET.
 */
export function computeFarRollup(
  requirementFindings: Array<{ requirementId: string; finding: FindingValue }>
): FarClauseResult[] {
  const findingMap = new Map<string, FindingValue>(
    requirementFindings.map((r) => [r.requirementId, r.finding])
  );

  return FAR_CLAUSE_MAPPING.map((clause) => {
    const clauseFindings = clause.requirementIds.map((rid) => ({
      requirementId: rid,
      finding: findingMap.get(rid) ?? ("not_reviewed" as FindingValue),
    }));

    let result: "met" | "not_met" | "not_applicable" | "not_reviewed";

    if (clause.andGate) {
      // AND-gate: all must be "met" for the clause to be MET
      if (clauseFindings.every((f) => f.finding === "met")) {
        result = "met";
      } else if (clauseFindings.some((f) => f.finding === "not_met")) {
        result = "not_met";
      } else if (clauseFindings.every((f) => f.finding === "not_applicable")) {
        result = "not_applicable";
      } else {
        result = "not_reviewed";
      }
    } else {
      const f = clauseFindings[0]?.finding ?? "not_reviewed";
      result = f;
    }

    return {
      clause: clause.clause,
      label: clause.label,
      result,
      requirementIds: [...clause.requirementIds],
      andGate: clause.andGate,
      findings: clauseFindings,
    };
  });
}

/**
 * Parse snapshotMetadata JSON safely; returns {} on failure.
 */
function parseMeta(raw: string | null | undefined): Record<string, unknown> {
  if (!raw) return {};
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return {};
  }
}

/**
 * Guard: return 404 if L1 module not active for org.
 * Returns true on success; false + sends response on failure.
 */
async function requireL1Module(orgId: string, res: any): Promise<boolean> {
  const active = await isL1AssessmentActive(orgId);
  if (!active) {
    res.status(404).json({ error: "CMMC Level 1 Self-Assessment module is not active for this organization" });
    return false;
  }
  return true;
}

/**
 * Fetch an assessment belonging to this org, returning null with 404 if not found.
 */
async function fetchAssessment(assessmentId: string, orgId: string, res: any) {
  const [assessment] = await db
    .select()
    .from(level1AnnualAssessmentsTable)
    .where(
      and(
        eq(level1AnnualAssessmentsTable.id, assessmentId),
        eq(level1AnnualAssessmentsTable.organizationId, orgId)
      )
    )
    .limit(1);
  if (!assessment) {
    res.status(404).json({ error: "Assessment not found" });
    return null;
  }
  return assessment;
}

/**
 * Guard writes on locked assessments unless caller has correct_locked permission.
 * Returns true (blocked, response sent) when write should be denied.
 */
function isLockedBlocked(
  assessment: { status: string },
  req: { orgRole?: string; authUser?: { role: string } | null }
): boolean {
  if (assessment.status !== "locked") return false;
  return !canDo(req, "level1_assessment.correct_locked");
}

// ── GET /l1-assessment — active or latest assessment ────────────────────────

router.get("/", requireAuth, requireOrg, async (req, res): Promise<void> => {
  const orgId = req.orgId!;
  if (!canDo(req, "level1_assessment.view")) {
    res.status(403).json({ error: "level1_assessment.view permission required" });
    return;
  }
  if (!(await requireL1Module(orgId, res))) return;

  try {
    // Return the most recently created non-locked assessment, or locked if that's all there is
    const [active] = await db
      .select()
      .from(level1AnnualAssessmentsTable)
      .where(eq(level1AnnualAssessmentsTable.organizationId, orgId))
      .orderBy(
        desc(level1AnnualAssessmentsTable.assessmentYear),
        desc(level1AnnualAssessmentsTable.createdAt)
      )
      .limit(1);

    res.json({ assessment: active ?? null });
  } catch (err) {
    req.log.error(err, "l1: get active assessment failed");
    res.status(500).json({ error: "Failed to retrieve assessment" });
  }
});

// ── GET /l1-assessment/history ───────────────────────────────────────────────

router.get("/history", requireAuth, requireOrg, async (req, res): Promise<void> => {
  const orgId = req.orgId!;
  if (!canDo(req, "level1_assessment.view")) {
    res.status(403).json({ error: "level1_assessment.view permission required" });
    return;
  }
  if (!(await requireL1Module(orgId, res))) return;

  try {
    const assessments = await db
      .select()
      .from(level1AnnualAssessmentsTable)
      .where(eq(level1AnnualAssessmentsTable.organizationId, orgId))
      .orderBy(
        desc(level1AnnualAssessmentsTable.assessmentYear),
        desc(level1AnnualAssessmentsTable.createdAt)
      );

    res.json({
      assessments: assessments.map((a) => ({
        ...a,
        isReadOnly: a.status === "locked",
      })),
    });
  } catch (err) {
    req.log.error(err, "l1: get history failed");
    res.status(500).json({ error: "Failed to retrieve assessment history" });
  }
});

// ── POST /l1-assessment — start a new annual cycle ──────────────────────────

router.post("/", requireAuth, requireOrg, async (req, res): Promise<void> => {
  const orgId = req.orgId!;
  if (!canDo(req, "level1_assessment.start")) {
    res.status(403).json({ error: "level1_assessment.start permission required" });
    return;
  }
  if (!(await requireL1Module(orgId, res))) return;

  const {
    assessmentYear,
    scopeName = "Default",
    title,
    description,
  } = req.body as {
    assessmentYear?: number;
    scopeName?: string;
    title?: string;
    description?: string;
  };

  const year = assessmentYear ?? new Date().getFullYear();

  if (!title) {
    res.status(400).json({ error: "title is required" });
    return;
  }

  try {
    // Check for existing non-locked assessment for this year/scope
    const [existing] = await db
      .select({ id: level1AnnualAssessmentsTable.id, status: level1AnnualAssessmentsTable.status })
      .from(level1AnnualAssessmentsTable)
      .where(
        and(
          eq(level1AnnualAssessmentsTable.organizationId, orgId),
          eq(level1AnnualAssessmentsTable.assessmentYear, year),
          eq(level1AnnualAssessmentsTable.scopeName, scopeName)
        )
      )
      .limit(1);

    if (existing) {
      // The DB unique index on (org, year, scope) prevents inserting a second row.
      // Return 409 regardless of the existing row's status — only one cycle per year/scope is allowed.
      res.status(409).json({
        error: `An assessment for ${year} / ${scopeName} already exists`,
        assessmentId: existing.id,
        status: existing.status,
      });
      return;
    }

    // Find the most recent PRIOR assessment for this org/scope from an EARLIER year
    // (used to copy narratives/evidence as proposals into the new cycle)
    const [prior] = await db
      .select()
      .from(level1AnnualAssessmentsTable)
      .where(
        and(
          eq(level1AnnualAssessmentsTable.organizationId, orgId),
          eq(level1AnnualAssessmentsTable.scopeName, scopeName)
        )
      )
      .orderBy(desc(level1AnnualAssessmentsTable.assessmentYear))
      .limit(1);

    const priorReqs = prior
      ? await db
          .select()
          .from(level1AssessmentRequirementsTable)
          .where(eq(level1AssessmentRequirementsTable.assessmentId, prior.id))
      : [];

    type L1Objective = typeof level1AssessmentObjectivesTable.$inferSelect;
    const priorObjsByReqId = new Map<string, L1Objective[]>();
    if (priorReqs.length > 0) {
      const priorObjs: L1Objective[] = await db
        .select()
        .from(level1AssessmentObjectivesTable)
        .where(
          inArray(
            level1AssessmentObjectivesTable.assessmentRequirementId,
            priorReqs.map((r) => r.id)
          )
        );
      for (const obj of priorObjs) {
        const arr = priorObjsByReqId.get(obj.assessmentRequirementId) ?? [];
        arr.push(obj);
        priorObjsByReqId.set(obj.assessmentRequirementId, arr);
      }
    }

    const priorEvidenceLinks = prior
      ? await db
          .select()
          .from(level1AssessmentEvidenceLinksTable)
          .where(eq(level1AssessmentEvidenceLinksTable.assessmentId, prior.id))
      : [];

    // Build a map from prior requirementId → new requirementRowId for evidence link copy
    const priorReqRowIdByReqId = new Map(priorReqs.map((r) => [r.requirementId, r.id]));

    // Create new assessment
    const newAssessmentId = randomUUID();
    await db.insert(level1AnnualAssessmentsTable).values({
      id: newAssessmentId,
      organizationId: orgId,
      assessmentYear: year,
      scopeName,
      title,
      description: description ?? null,
      status: "in_progress",
      affirmingOfficialName: prior?.affirmingOfficialName ?? null,
      affirmingOfficialTitle: prior?.affirmingOfficialTitle ?? null,
      affirmingOfficialId: null,
      createdById: req.authUser?.id ?? null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    // Create 17 requirement rows — copy prior narratives as proposals
    const newReqIdByReqId = new Map<string, string>();

    for (const req17 of L1_REQUIREMENTS) {
      const priorRow = priorReqs.find((r) => r.requirementId === req17.requirementId);
      const newReqId = randomUUID();
      newReqIdByReqId.set(req17.requirementId, newReqId);

      await db.insert(level1AssessmentRequirementsTable).values({
        id: newReqId,
        assessmentId: newAssessmentId,
        requirementId: req17.requirementId,
        canonicalKey: req17.canonicalKey,
        requirementTitle: req17.requirementTitle,
        finding: "not_reviewed",
        // Copy prior narratives as proposals for reference
        implementationNarrative: priorRow?.implementationNarrative
          ? `[PROPOSED FROM ${year - 1}] ${priorRow.implementationNarrative}`
          : null,
        assessorNotes: null,
        naJustification: null,
        sortOrder: req17.sortOrder,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      // Copy prior objectives (reset to not_reviewed)
      const priorObjsForReq = priorRow
        ? (priorObjsByReqId.get(priorRow.id) ?? [])
        : [];
      for (const obj of priorObjsForReq) {
        await db.insert(level1AssessmentObjectivesTable).values({
          id: randomUUID(),
          assessmentRequirementId: newReqId,
          objectiveText: obj.objectiveText,
          result: "not_reviewed",
          notes: null,
          sortOrder: obj.sortOrder,
          createdAt: new Date(),
          updatedAt: new Date(),
        });
      }
    }

    // Copy prior evidence links as proposals (mark them as needing revalidation in notes)
    for (const link of priorEvidenceLinks) {
      const newReqId = link.assessmentRequirementId
        ? (() => {
            const priorRow = priorReqs.find((r) => r.id === link.assessmentRequirementId);
            return priorRow ? newReqIdByReqId.get(priorRow.requirementId) ?? null : null;
          })()
        : null;

      await db.insert(level1AssessmentEvidenceLinksTable).values({
        id: randomUUID(),
        assessmentId: newAssessmentId,
        assessmentRequirementId: newReqId ?? null,
        evidenceItemId: link.evidenceItemId ?? null,
        evidenceDescription: link.evidenceDescription ?? null,
        assessmentUse: link.assessmentUse,
        qualification: link.qualification,
        fileKey: link.fileKey ?? null,
        fileName: link.fileName ?? null,
        notes: `[NEEDS REVALIDATION — copied from ${year - 1} assessment]${link.notes ? ` ${link.notes}` : ""}`,
        linkedById: req.authUser?.id ?? null,
        linkedAt: new Date(),
        createdAt: new Date(),
      });
    }

    await logAudit(req, "create" as any, "level1_annual_assessment", newAssessmentId, {
      entityLabel: `L1 Assessment ${year} — ${scopeName} — Created`,
      newValue: { year, scopeName, title, copiedFromPrior: !!prior },
    });

    const [created] = await db
      .select()
      .from(level1AnnualAssessmentsTable)
      .where(eq(level1AnnualAssessmentsTable.id, newAssessmentId));

    res.status(201).json({ assessment: created });
  } catch (err) {
    req.log.error(err, "l1: start new cycle failed");
    res.status(500).json({ error: "Failed to start assessment" });
  }
});

// ── GET /l1-assessment/:id — full assessment detail ─────────────────────────

router.get("/:id", requireAuth, requireOrg, async (req, res): Promise<void> => {
  const orgId = req.orgId!;
  if (!canDo(req, "level1_assessment.view")) {
    res.status(403).json({ error: "level1_assessment.view permission required" });
    return;
  }
  if (!(await requireL1Module(orgId, res))) return;

  try {
    const assessment = await fetchAssessment(req.params.id as string, orgId, res);
    if (!assessment) return;

    const [requirements, evidenceLinks] = await Promise.all([
      db
        .select()
        .from(level1AssessmentRequirementsTable)
        .where(eq(level1AssessmentRequirementsTable.assessmentId, assessment.id))
        .orderBy(asc(level1AssessmentRequirementsTable.sortOrder)),
      db
        .select()
        .from(level1AssessmentEvidenceLinksTable)
        .where(eq(level1AssessmentEvidenceLinksTable.assessmentId, assessment.id))
        .orderBy(asc(level1AssessmentEvidenceLinksTable.linkedAt)),
    ]);

    const objectives =
      requirements.length > 0
        ? await db
            .select()
            .from(level1AssessmentObjectivesTable)
            .where(
              inArray(
                level1AssessmentObjectivesTable.assessmentRequirementId,
                requirements.map((r) => r.id)
              )
            )
            .orderBy(asc(level1AssessmentObjectivesTable.sortOrder))
        : [];

    const objsByReqId = new Map<string, typeof objectives>();
    for (const obj of objectives) {
      const arr = objsByReqId.get(obj.assessmentRequirementId) ?? [];
      arr.push(obj);
      objsByReqId.set(obj.assessmentRequirementId, arr);
    }

    const requirementsWithObjectives = requirements.map((r) => ({
      ...r,
      objectives: objsByReqId.get(r.id) ?? [],
    }));

    const farRollup = computeFarRollup(
      requirements.map((r) => ({ requirementId: r.requirementId, finding: r.finding }))
    );

    res.json({
      assessment: {
        ...assessment,
        workflowState: parseMeta(assessment.snapshotMetadata).workflowState ?? null,
        isReadOnly: assessment.status === "locked",
      },
      requirements: requirementsWithObjectives,
      evidenceLinks,
      farRollup,
    });
  } catch (err) {
    req.log.error(err, "l1: get assessment detail failed");
    res.status(500).json({ error: "Failed to retrieve assessment" });
  }
});

// ── PATCH /l1-assessment/:id — update scope / metadata ──────────────────────

router.patch("/:id", requireAuth, requireOrg, async (req, res): Promise<void> => {
  const orgId = req.orgId!;
  if (!canDo(req, "level1_assessment.edit")) {
    res.status(403).json({ error: "level1_assessment.edit permission required" });
    return;
  }
  if (!(await requireL1Module(orgId, res))) return;

  try {
    const assessment = await fetchAssessment(req.params.id as string, orgId, res);
    if (!assessment) return;

    if (isLockedBlocked(assessment, req)) {
      res.status(423).json({ error: "Assessment is locked. correct_locked permission required to edit." });
      return;
    }

    const {
      title,
      description,
      scopeName,
      affirmingOfficialName,
      affirmingOfficialTitle,
      affirmingOfficialId,
    } = req.body as {
      title?: string;
      description?: string;
      scopeName?: string;
      affirmingOfficialName?: string;
      affirmingOfficialTitle?: string;
      affirmingOfficialId?: string;
    };

    const updates: Partial<typeof level1AnnualAssessmentsTable.$inferInsert> = {
      updatedAt: new Date(),
    };
    if (title !== undefined) updates.title = title;
    if (description !== undefined) updates.description = description;
    if (scopeName !== undefined) updates.scopeName = scopeName;
    if (affirmingOfficialName !== undefined) updates.affirmingOfficialName = affirmingOfficialName;
    if (affirmingOfficialTitle !== undefined) updates.affirmingOfficialTitle = affirmingOfficialTitle;
    if (affirmingOfficialId !== undefined) updates.affirmingOfficialId = affirmingOfficialId;

    await db
      .update(level1AnnualAssessmentsTable)
      .set(updates)
      .where(eq(level1AnnualAssessmentsTable.id, assessment.id));

    await logAudit(req, "update" as any, "level1_annual_assessment", assessment.id, {
      entityLabel: `L1 Assessment ${assessment.assessmentYear} — Updated`,
      newValue: updates,
    });

    const [updated] = await db
      .select()
      .from(level1AnnualAssessmentsTable)
      .where(eq(level1AnnualAssessmentsTable.id, assessment.id));

    res.json({ assessment: updated });
  } catch (err) {
    req.log.error(err, "l1: update assessment failed");
    res.status(500).json({ error: "Failed to update assessment" });
  }
});

// ── GET /l1-assessment/:id/requirements — list requirements ─────────────────

router.get("/:id/requirements", requireAuth, requireOrg, async (req, res): Promise<void> => {
  const orgId = req.orgId!;
  if (!canDo(req, "level1_assessment.view")) {
    res.status(403).json({ error: "level1_assessment.view permission required" });
    return;
  }
  if (!(await requireL1Module(orgId, res))) return;

  try {
    const assessment = await fetchAssessment(req.params.id as string, orgId, res);
    if (!assessment) return;

    const requirements = await db
      .select()
      .from(level1AssessmentRequirementsTable)
      .where(eq(level1AssessmentRequirementsTable.assessmentId, assessment.id))
      .orderBy(asc(level1AssessmentRequirementsTable.sortOrder));

    res.json({ requirements });
  } catch (err) {
    req.log.error(err, "l1: list requirements failed");
    res.status(500).json({ error: "Failed to list requirements" });
  }
});

// ── PATCH /l1-assessment/:id/requirements/:reqId — update finding ────────────

router.patch("/:id/requirements/:reqId", requireAuth, requireOrg, async (req, res): Promise<void> => {
  const orgId = req.orgId!;
  if (!canDo(req, "level1_assessment.manage_requirements")) {
    res.status(403).json({ error: "level1_assessment.manage_requirements permission required" });
    return;
  }
  if (!(await requireL1Module(orgId, res))) return;

  try {
    const assessment = await fetchAssessment(req.params.id as string, orgId, res);
    if (!assessment) return;

    if (isLockedBlocked(assessment, req)) {
      res.status(423).json({ error: "Assessment is locked. correct_locked permission required." });
      return;
    }

    const [requirement] = await db
      .select()
      .from(level1AssessmentRequirementsTable)
      .where(
        and(
          eq(level1AssessmentRequirementsTable.id, req.params.reqId as string),
          eq(level1AssessmentRequirementsTable.assessmentId, assessment.id)
        )
      )
      .limit(1);

    if (!requirement) {
      res.status(404).json({ error: "Requirement not found" });
      return;
    }

    const {
      finding,
      implementationNarrative,
      assessorNotes,
      naJustification,
    } = req.body as {
      finding?: "met" | "not_met" | "not_applicable" | "not_reviewed";
      implementationNarrative?: string;
      assessorNotes?: string;
      naJustification?: string;
    };

    // If setting to MET, verify all applicable objectives are SATISFIED or NOT_APPLICABLE
    if (finding === "met") {
      const objectives = await db
        .select()
        .from(level1AssessmentObjectivesTable)
        .where(eq(level1AssessmentObjectivesTable.assessmentRequirementId, requirement.id));

      const unsatisfied = objectives.filter(
        (o) => o.result !== "satisfied" && o.result !== "not_applicable"
      );
      if (unsatisfied.length > 0) {
        res.status(400).json({
          error: "Cannot mark requirement MET: all objectives must be SATISFIED or NOT_APPLICABLE",
          unsatisfiedCount: unsatisfied.length,
        });
        return;
      }
    }

    // NA justification is required for NOT_APPLICABLE
    if (finding === "not_applicable" && !naJustification && !requirement.naJustification) {
      res.status(400).json({ error: "naJustification is required when finding is not_applicable" });
      return;
    }

    const updates: Partial<typeof level1AssessmentRequirementsTable.$inferInsert> = {
      lastUpdatedById: req.authUser?.id ?? null,
      updatedAt: new Date(),
    };
    if (finding !== undefined) updates.finding = finding;
    if (implementationNarrative !== undefined) updates.implementationNarrative = implementationNarrative;
    if (assessorNotes !== undefined) updates.assessorNotes = assessorNotes;
    if (naJustification !== undefined) updates.naJustification = naJustification;

    await db
      .update(level1AssessmentRequirementsTable)
      .set(updates)
      .where(eq(level1AssessmentRequirementsTable.id, requirement.id));

    // Touch parent assessment updatedAt
    await db
      .update(level1AnnualAssessmentsTable)
      .set({ updatedAt: new Date() })
      .where(eq(level1AnnualAssessmentsTable.id, assessment.id));

    await logAudit(req, "update" as any, "level1_assessment_requirement", requirement.id, {
      entityLabel: `${requirement.requirementId} — ${finding ?? requirement.finding}`,
      previousValue: { finding: requirement.finding },
      newValue: { finding: finding ?? requirement.finding },
    });

    const [updated] = await db
      .select()
      .from(level1AssessmentRequirementsTable)
      .where(eq(level1AssessmentRequirementsTable.id, requirement.id));

    res.json({ requirement: updated });
  } catch (err) {
    req.log.error(err, "l1: update requirement failed");
    res.status(500).json({ error: "Failed to update requirement" });
  }
});

// ── GET /l1-assessment/:id/requirements/:reqId/objectives ────────────────────

router.get("/:id/requirements/:reqId/objectives", requireAuth, requireOrg, async (req, res): Promise<void> => {
  const orgId = req.orgId!;
  if (!canDo(req, "level1_assessment.view")) {
    res.status(403).json({ error: "level1_assessment.view permission required" });
    return;
  }
  if (!(await requireL1Module(orgId, res))) return;

  try {
    const assessment = await fetchAssessment(req.params.id as string, orgId, res);
    if (!assessment) return;

    const [requirement] = await db
      .select({ id: level1AssessmentRequirementsTable.id })
      .from(level1AssessmentRequirementsTable)
      .where(
        and(
          eq(level1AssessmentRequirementsTable.id, req.params.reqId as string),
          eq(level1AssessmentRequirementsTable.assessmentId, assessment.id)
        )
      )
      .limit(1);

    if (!requirement) {
      res.status(404).json({ error: "Requirement not found" });
      return;
    }

    const objectives = await db
      .select()
      .from(level1AssessmentObjectivesTable)
      .where(eq(level1AssessmentObjectivesTable.assessmentRequirementId, requirement.id))
      .orderBy(asc(level1AssessmentObjectivesTable.sortOrder));

    res.json({ objectives });
  } catch (err) {
    req.log.error(err, "l1: list objectives failed");
    res.status(500).json({ error: "Failed to list objectives" });
  }
});

// ── POST /l1-assessment/:id/requirements/:reqId/objectives ───────────────────

router.post("/:id/requirements/:reqId/objectives", requireAuth, requireOrg, async (req, res): Promise<void> => {
  const orgId = req.orgId!;
  if (!canDo(req, "level1_assessment.manage_objectives")) {
    res.status(403).json({ error: "level1_assessment.manage_objectives permission required" });
    return;
  }
  if (!(await requireL1Module(orgId, res))) return;

  try {
    const assessment = await fetchAssessment(req.params.id as string, orgId, res);
    if (!assessment) return;

    if (isLockedBlocked(assessment, req)) {
      res.status(423).json({ error: "Assessment is locked. correct_locked permission required." });
      return;
    }

    const [requirement] = await db
      .select({ id: level1AssessmentRequirementsTable.id })
      .from(level1AssessmentRequirementsTable)
      .where(
        and(
          eq(level1AssessmentRequirementsTable.id, req.params.reqId as string),
          eq(level1AssessmentRequirementsTable.assessmentId, assessment.id)
        )
      )
      .limit(1);

    if (!requirement) {
      res.status(404).json({ error: "Requirement not found" });
      return;
    }

    const { objectiveText, result = "not_reviewed", notes, sortOrder = 0 } = req.body as {
      objectiveText?: string;
      result?: "satisfied" | "other_than_satisfied" | "not_applicable" | "not_reviewed";
      notes?: string;
      sortOrder?: number;
    };

    if (!objectiveText) {
      res.status(400).json({ error: "objectiveText is required" });
      return;
    }

    const newId = randomUUID();
    await db.insert(level1AssessmentObjectivesTable).values({
      id: newId,
      assessmentRequirementId: requirement.id,
      objectiveText,
      result,
      notes: notes ?? null,
      sortOrder,
      lastUpdatedById: req.authUser?.id ?? null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const [created] = await db
      .select()
      .from(level1AssessmentObjectivesTable)
      .where(eq(level1AssessmentObjectivesTable.id, newId));

    res.status(201).json({ objective: created });
  } catch (err) {
    req.log.error(err, "l1: create objective failed");
    res.status(500).json({ error: "Failed to create objective" });
  }
});

// ── PATCH /l1-assessment/:id/requirements/:reqId/objectives/:objId ───────────

router.patch("/:id/requirements/:reqId/objectives/:objId", requireAuth, requireOrg, async (req, res): Promise<void> => {
  const orgId = req.orgId!;
  if (!canDo(req, "level1_assessment.manage_objectives")) {
    res.status(403).json({ error: "level1_assessment.manage_objectives permission required" });
    return;
  }
  if (!(await requireL1Module(orgId, res))) return;

  try {
    const assessment = await fetchAssessment(req.params.id as string, orgId, res);
    if (!assessment) return;

    if (isLockedBlocked(assessment, req)) {
      res.status(423).json({ error: "Assessment is locked. correct_locked permission required." });
      return;
    }

    // Verify the requirement belongs to this assessment (prevents cross-assessment IDOR)
    const [requirementOwner] = await db
      .select({ id: level1AssessmentRequirementsTable.id })
      .from(level1AssessmentRequirementsTable)
      .where(
        and(
          eq(level1AssessmentRequirementsTable.id, req.params.reqId as string),
          eq(level1AssessmentRequirementsTable.assessmentId, assessment.id)
        )
      )
      .limit(1);

    if (!requirementOwner) {
      res.status(404).json({ error: "Requirement not found in this assessment" });
      return;
    }

    const [objective] = await db
      .select()
      .from(level1AssessmentObjectivesTable)
      .where(
        and(
          eq(level1AssessmentObjectivesTable.id, req.params.objId as string),
          eq(level1AssessmentObjectivesTable.assessmentRequirementId, requirementOwner.id)
        )
      )
      .limit(1);

    if (!objective) {
      res.status(404).json({ error: "Objective not found" });
      return;
    }

    const { objectiveText, result, notes, sortOrder } = req.body as {
      objectiveText?: string;
      result?: "satisfied" | "other_than_satisfied" | "not_applicable" | "not_reviewed";
      notes?: string;
      sortOrder?: number;
    };

    const updates: Partial<typeof level1AssessmentObjectivesTable.$inferInsert> = {
      lastUpdatedById: req.authUser?.id ?? null,
      updatedAt: new Date(),
    };
    if (objectiveText !== undefined) updates.objectiveText = objectiveText;
    if (result !== undefined) updates.result = result;
    if (notes !== undefined) updates.notes = notes;
    if (sortOrder !== undefined) updates.sortOrder = sortOrder;

    await db
      .update(level1AssessmentObjectivesTable)
      .set(updates)
      .where(eq(level1AssessmentObjectivesTable.id, objective.id));

    await logAudit(req, "update" as any, "level1_assessment_objective", objective.id, {
      entityLabel: `Objective — ${result ?? objective.result}`,
      previousValue: { result: objective.result },
      newValue: { result: result ?? objective.result },
    });

    const [updated] = await db
      .select()
      .from(level1AssessmentObjectivesTable)
      .where(eq(level1AssessmentObjectivesTable.id, objective.id));

    res.json({ objective: updated });
  } catch (err) {
    req.log.error(err, "l1: update objective failed");
    res.status(500).json({ error: "Failed to update objective" });
  }
});

// ── DELETE /l1-assessment/:id/requirements/:reqId/objectives/:objId ──────────

router.delete("/:id/requirements/:reqId/objectives/:objId", requireAuth, requireOrg, async (req, res): Promise<void> => {
  const orgId = req.orgId!;
  if (!canDo(req, "level1_assessment.manage_objectives")) {
    res.status(403).json({ error: "level1_assessment.manage_objectives permission required" });
    return;
  }
  if (!(await requireL1Module(orgId, res))) return;

  try {
    const assessment = await fetchAssessment(req.params.id as string, orgId, res);
    if (!assessment) return;

    if (isLockedBlocked(assessment, req)) {
      res.status(423).json({ error: "Assessment is locked. correct_locked permission required." });
      return;
    }

    // Verify the requirement belongs to this assessment (prevents cross-assessment IDOR)
    const [requirementOwnerDel] = await db
      .select({ id: level1AssessmentRequirementsTable.id })
      .from(level1AssessmentRequirementsTable)
      .where(
        and(
          eq(level1AssessmentRequirementsTable.id, req.params.reqId as string),
          eq(level1AssessmentRequirementsTable.assessmentId, assessment.id)
        )
      )
      .limit(1);

    if (!requirementOwnerDel) {
      res.status(404).json({ error: "Requirement not found in this assessment" });
      return;
    }

    // Delete only the objective that belongs to this validated requirement
    await db
      .delete(level1AssessmentObjectivesTable)
      .where(
        and(
          eq(level1AssessmentObjectivesTable.id, req.params.objId as string),
          eq(level1AssessmentObjectivesTable.assessmentRequirementId, requirementOwnerDel.id)
        )
      );

    res.json({ success: true });
  } catch (err) {
    req.log.error(err, "l1: delete objective failed");
    res.status(500).json({ error: "Failed to delete objective" });
  }
});

// ── GET /l1-assessment/:id/evidence — list evidence links ───────────────────

router.get("/:id/evidence", requireAuth, requireOrg, async (req, res): Promise<void> => {
  const orgId = req.orgId!;
  if (!canDo(req, "level1_assessment.view")) {
    res.status(403).json({ error: "level1_assessment.view permission required" });
    return;
  }
  if (!(await requireL1Module(orgId, res))) return;

  try {
    const assessment = await fetchAssessment(req.params.id as string, orgId, res);
    if (!assessment) return;

    const links = await db
      .select()
      .from(level1AssessmentEvidenceLinksTable)
      .where(eq(level1AssessmentEvidenceLinksTable.assessmentId, assessment.id))
      .orderBy(asc(level1AssessmentEvidenceLinksTable.linkedAt));

    res.json({ evidenceLinks: links });
  } catch (err) {
    req.log.error(err, "l1: list evidence links failed");
    res.status(500).json({ error: "Failed to list evidence links" });
  }
});

// ── POST /l1-assessment/:id/evidence — link evidence ────────────────────────

router.post("/:id/evidence", requireAuth, requireOrg, async (req, res): Promise<void> => {
  const orgId = req.orgId!;
  if (!canDo(req, "level1_assessment.link_evidence")) {
    res.status(403).json({ error: "level1_assessment.link_evidence permission required" });
    return;
  }
  if (!(await requireL1Module(orgId, res))) return;

  try {
    const assessment = await fetchAssessment(req.params.id as string, orgId, res);
    if (!assessment) return;

    if (isLockedBlocked(assessment, req)) {
      res.status(423).json({ error: "Assessment is locked. correct_locked permission required." });
      return;
    }

    const {
      assessmentRequirementId,
      evidenceItemId,
      evidenceDescription,
      assessmentUse = "examine",
      qualification = "directly_applicable",
      fileKey,
      fileName,
      notes,
    } = req.body as {
      assessmentRequirementId?: string;
      evidenceItemId?: string;
      evidenceDescription?: string;
      assessmentUse?: "examine" | "interview" | "test";
      qualification?: "directly_applicable" | "partially_applicable" | "supplementary";
      fileKey?: string;
      fileName?: string;
      notes?: string;
    };

    // Validate evidenceItemId belongs to the org (if provided)
    if (evidenceItemId) {
      const [evItem] = await db
        .select({ id: evidenceItemsTable.id })
        .from(evidenceItemsTable)
        .where(
          and(
            eq(evidenceItemsTable.id, evidenceItemId),
            eq(evidenceItemsTable.organizationId, orgId)
          )
        )
        .limit(1);
      if (!evItem) {
        res.status(404).json({ error: "Evidence item not found in this organization" });
        return;
      }
    }

    // Validate requirement belongs to assessment (if provided)
    if (assessmentRequirementId) {
      const [req17] = await db
        .select({ id: level1AssessmentRequirementsTable.id })
        .from(level1AssessmentRequirementsTable)
        .where(
          and(
            eq(level1AssessmentRequirementsTable.id, assessmentRequirementId),
            eq(level1AssessmentRequirementsTable.assessmentId, assessment.id)
          )
        )
        .limit(1);
      if (!req17) {
        res.status(404).json({ error: "Requirement not found in this assessment" });
        return;
      }
    }

    if (!evidenceItemId && !evidenceDescription) {
      res.status(400).json({ error: "Either evidenceItemId or evidenceDescription is required" });
      return;
    }

    const newId = randomUUID();
    await db.insert(level1AssessmentEvidenceLinksTable).values({
      id: newId,
      assessmentId: assessment.id,
      assessmentRequirementId: assessmentRequirementId ?? null,
      evidenceItemId: evidenceItemId ?? null,
      evidenceDescription: evidenceDescription ?? null,
      assessmentUse,
      qualification,
      fileKey: fileKey ?? null,
      fileName: fileName ?? null,
      notes: notes ?? null,
      linkedById: req.authUser?.id ?? null,
      linkedAt: new Date(),
      createdAt: new Date(),
    });

    await logAudit(req, "create" as any, "level1_assessment_evidence_link", newId, {
      entityLabel: `Evidence linked to L1 Assessment ${assessment.assessmentYear}`,
      newValue: { evidenceItemId, assessmentRequirementId, assessmentUse },
    });

    const [created] = await db
      .select()
      .from(level1AssessmentEvidenceLinksTable)
      .where(eq(level1AssessmentEvidenceLinksTable.id, newId));

    res.status(201).json({ evidenceLink: created });
  } catch (err) {
    req.log.error(err, "l1: link evidence failed");
    res.status(500).json({ error: "Failed to link evidence" });
  }
});

// ── PATCH /l1-assessment/:id/evidence/:linkId ────────────────────────────────

router.patch("/:id/evidence/:linkId", requireAuth, requireOrg, async (req, res): Promise<void> => {
  const orgId = req.orgId!;
  if (!canDo(req, "level1_assessment.link_evidence")) {
    res.status(403).json({ error: "level1_assessment.link_evidence permission required" });
    return;
  }
  if (!(await requireL1Module(orgId, res))) return;

  try {
    const assessment = await fetchAssessment(req.params.id as string, orgId, res);
    if (!assessment) return;

    if (isLockedBlocked(assessment, req)) {
      res.status(423).json({ error: "Assessment is locked. correct_locked permission required." });
      return;
    }

    const [link] = await db
      .select()
      .from(level1AssessmentEvidenceLinksTable)
      .where(
        and(
          eq(level1AssessmentEvidenceLinksTable.id, req.params.linkId as string),
          eq(level1AssessmentEvidenceLinksTable.assessmentId, assessment.id)
        )
      )
      .limit(1);

    if (!link) {
      res.status(404).json({ error: "Evidence link not found" });
      return;
    }

    const { assessmentUse, qualification, notes, evidenceDescription } = req.body as {
      assessmentUse?: "examine" | "interview" | "test";
      qualification?: "directly_applicable" | "partially_applicable" | "supplementary";
      notes?: string;
      evidenceDescription?: string;
    };

    const updates: Partial<typeof level1AssessmentEvidenceLinksTable.$inferInsert> = {};
    if (assessmentUse !== undefined) updates.assessmentUse = assessmentUse;
    if (qualification !== undefined) updates.qualification = qualification;
    if (notes !== undefined) updates.notes = notes;
    if (evidenceDescription !== undefined) updates.evidenceDescription = evidenceDescription;

    await db
      .update(level1AssessmentEvidenceLinksTable)
      .set(updates)
      .where(eq(level1AssessmentEvidenceLinksTable.id, link.id));

    const [updated] = await db
      .select()
      .from(level1AssessmentEvidenceLinksTable)
      .where(eq(level1AssessmentEvidenceLinksTable.id, link.id));

    res.json({ evidenceLink: updated });
  } catch (err) {
    req.log.error(err, "l1: update evidence link failed");
    res.status(500).json({ error: "Failed to update evidence link" });
  }
});

// ── DELETE /l1-assessment/:id/evidence/:linkId ───────────────────────────────

router.delete("/:id/evidence/:linkId", requireAuth, requireOrg, async (req, res): Promise<void> => {
  const orgId = req.orgId!;
  if (!canDo(req, "level1_assessment.unlink_evidence")) {
    res.status(403).json({ error: "level1_assessment.unlink_evidence permission required" });
    return;
  }
  if (!(await requireL1Module(orgId, res))) return;

  try {
    const assessment = await fetchAssessment(req.params.id as string, orgId, res);
    if (!assessment) return;

    if (isLockedBlocked(assessment, req)) {
      res.status(423).json({ error: "Assessment is locked. correct_locked permission required." });
      return;
    }

    await db
      .delete(level1AssessmentEvidenceLinksTable)
      .where(
        and(
          eq(level1AssessmentEvidenceLinksTable.id, req.params.linkId as string),
          eq(level1AssessmentEvidenceLinksTable.assessmentId, assessment.id)
        )
      );

    await logAudit(req, "update" as any, "level1_assessment_evidence_link", req.params.linkId as string, {
      entityLabel: `Evidence unlinked from L1 Assessment ${assessment.assessmentYear}`,
    });

    res.json({ success: true });
  } catch (err) {
    req.log.error(err, "l1: delete evidence link failed");
    res.status(500).json({ error: "Failed to delete evidence link" });
  }
});

// ── GET /l1-assessment/:id/far-rollup ────────────────────────────────────────

router.get("/:id/far-rollup", requireAuth, requireOrg, async (req, res): Promise<void> => {
  const orgId = req.orgId!;
  if (!canDo(req, "level1_assessment.view")) {
    res.status(403).json({ error: "level1_assessment.view permission required" });
    return;
  }
  if (!(await requireL1Module(orgId, res))) return;

  try {
    const assessment = await fetchAssessment(req.params.id as string, orgId, res);
    if (!assessment) return;

    const requirements = await db
      .select({
        requirementId: level1AssessmentRequirementsTable.requirementId,
        finding: level1AssessmentRequirementsTable.finding,
      })
      .from(level1AssessmentRequirementsTable)
      .where(eq(level1AssessmentRequirementsTable.assessmentId, assessment.id));

    const farRollup = computeFarRollup(
      requirements.map((r) => ({ requirementId: r.requirementId, finding: r.finding }))
    );

    const metCount = farRollup.filter((c) => c.result === "met").length;
    const totalApplicable = farRollup.filter((c) => c.result !== "not_applicable").length;
    const score = totalApplicable > 0 ? Math.round((metCount / totalApplicable) * 100) : 0;

    res.json({
      assessmentId: assessment.id,
      assessmentYear: assessment.assessmentYear,
      clauses: farRollup,
      summary: {
        total: farRollup.length,
        met: metCount,
        notMet: farRollup.filter((c) => c.result === "not_met").length,
        notApplicable: farRollup.filter((c) => c.result === "not_applicable").length,
        notReviewed: farRollup.filter((c) => c.result === "not_reviewed").length,
        score,
      },
    });
  } catch (err) {
    req.log.error(err, "l1: far rollup failed");
    res.status(500).json({ error: "Failed to compute FAR rollup" });
  }
});

// ── POST /l1-assessment/:id/validate — validation gate ──────────────────────

router.post("/:id/validate", requireAuth, requireOrg, async (req, res): Promise<void> => {
  const orgId = req.orgId!;
  if (!canDo(req, "level1_assessment.view")) {
    res.status(403).json({ error: "level1_assessment.view permission required" });
    return;
  }
  if (!(await requireL1Module(orgId, res))) return;

  try {
    const assessment = await fetchAssessment(req.params.id as string, orgId, res);
    if (!assessment) return;

    const [requirements, evidenceLinks, org] = await Promise.all([
      db
        .select()
        .from(level1AssessmentRequirementsTable)
        .where(eq(level1AssessmentRequirementsTable.assessmentId, assessment.id))
        .orderBy(asc(level1AssessmentRequirementsTable.sortOrder)),
      db
        .select()
        .from(level1AssessmentEvidenceLinksTable)
        .where(eq(level1AssessmentEvidenceLinksTable.assessmentId, assessment.id)),
      db
        .select({ name: organizationsTable.name })
        .from(organizationsTable)
        .where(eq(organizationsTable.id, orgId))
        .limit(1),
    ]);

    type ValidationError = { code: string; message: string; severity: "error" | "warning" };
    const errors: ValidationError[] = [];

    // B1: Assessment must not already be locked
    if (assessment.status === "locked") {
      errors.push({ code: "B1", message: "Assessment is already finalized and locked.", severity: "error" });
    }

    // B2: Title is required
    if (!assessment.title?.trim()) {
      errors.push({ code: "B2", message: "Assessment title is required.", severity: "error" });
    }

    // B3: All 17 requirements must exist
    if (requirements.length < 17) {
      errors.push({
        code: "B3",
        message: `Only ${requirements.length} of 17 required L1 practices have assessment rows.`,
        severity: "error",
      });
    }

    // B4: No requirements in NOT_REVIEWED state
    const notReviewed = requirements.filter((r) => r.finding === "not_reviewed");
    if (notReviewed.length > 0) {
      errors.push({
        code: "B4",
        message: `${notReviewed.length} requirement(s) still have NOT_REVIEWED finding: ${notReviewed.map((r) => r.requirementId).join(", ")}`,
        severity: "error",
      });
    }

    // B5: NOT_APPLICABLE requirements must have a justification
    const naWithoutJustification = requirements.filter(
      (r) => r.finding === "not_applicable" && !r.naJustification?.trim()
    );
    if (naWithoutJustification.length > 0) {
      errors.push({
        code: "B5",
        message: `${naWithoutJustification.length} NOT_APPLICABLE requirement(s) are missing NA justification: ${naWithoutJustification.map((r) => r.requirementId).join(", ")}`,
        severity: "error",
      });
    }

    // B6: At least one evidence item must be linked
    if (evidenceLinks.length === 0) {
      errors.push({
        code: "B6",
        message: "At least one evidence item must be linked to the assessment.",
        severity: "error",
      });
    }

    // B7: Affirming official name is required
    if (!assessment.affirmingOfficialName?.trim()) {
      errors.push({
        code: "B7",
        message: "Affirming official name is required before submission.",
        severity: "error",
      });
    }

    // B8: Affirming official title is required
    if (!assessment.affirmingOfficialTitle?.trim()) {
      errors.push({
        code: "B8",
        message: "Affirming official title is required before submission.",
        severity: "error",
      });
    }

    // B9: FAR rollup must have no NOT_REVIEWED clauses
    const farRollup = computeFarRollup(
      requirements.map((r) => ({ requirementId: r.requirementId, finding: r.finding }))
    );
    const farNotReviewed = farRollup.filter((c) => c.result === "not_reviewed");
    if (farNotReviewed.length > 0) {
      errors.push({
        code: "B9",
        message: `${farNotReviewed.length} FAR 52.204-21 clause(s) are NOT_REVIEWED: ${farNotReviewed.map((c) => c.clause).join(", ")}`,
        severity: "error",
      });
    }

    // B10: Organization name must exist
    if (!org[0]?.name) {
      errors.push({
        code: "B10",
        message: "Organization name is missing.",
        severity: "error",
      });
    }

    // B11: Requirements marked MET should have implementation narratives (warning)
    const metWithoutNarrative = requirements.filter(
      (r) => r.finding === "met" && !r.implementationNarrative?.trim()
    );
    if (metWithoutNarrative.length > 0) {
      errors.push({
        code: "W1",
        message: `${metWithoutNarrative.length} MET requirement(s) have no implementation narrative (recommended): ${metWithoutNarrative.map((r) => r.requirementId).join(", ")}`,
        severity: "warning",
      });
    }

    // B12: NOT_MET requirements should have implementation narratives (warning)
    const notMetWithoutNarrative = requirements.filter(
      (r) => r.finding === "not_met" && !r.implementationNarrative?.trim()
    );
    if (notMetWithoutNarrative.length > 0) {
      errors.push({
        code: "W2",
        message: `${notMetWithoutNarrative.length} NOT_MET requirement(s) have no implementation narrative (recommended).`,
        severity: "warning",
      });
    }

    // B13: Check that evidence links reference valid evidence items (not just ad-hoc descriptions)
    const evidenceWithItems = evidenceLinks.filter((l) => l.evidenceItemId !== null);
    if (evidenceWithItems.length === 0 && evidenceLinks.length > 0) {
      errors.push({
        code: "W3",
        message: "No evidence links reference formal evidence items — all are ad-hoc descriptions.",
        severity: "warning",
      });
    }

    // B14: Assessment year should match current calendar year (warning if different)
    const currentYear = new Date().getFullYear();
    if (assessment.assessmentYear !== currentYear) {
      errors.push({
        code: "W4",
        message: `Assessment year (${assessment.assessmentYear}) does not match the current calendar year (${currentYear}).`,
        severity: "warning",
      });
    }

    // B15: All 17 standard requirements should be present
    const presentReqIds = new Set(requirements.map((r) => r.requirementId));
    const missingStandardReqs = L1_REQUIREMENTS.filter((r) => !presentReqIds.has(r.requirementId));
    if (missingStandardReqs.length > 0) {
      errors.push({
        code: "B11",
        message: `Missing standard L1 requirement rows: ${missingStandardReqs.map((r) => r.requirementId).join(", ")}`,
        severity: "error",
      });
    }

    // B16: Objectives for requirements should be consistent with findings
    const requirementIds = requirements.map((r) => r.id);
    if (requirementIds.length > 0) {
      const allObjectives = await db
        .select()
        .from(level1AssessmentObjectivesTable)
        .where(inArray(level1AssessmentObjectivesTable.assessmentRequirementId, requirementIds));

      const objsByReqId = new Map<string, typeof allObjectives>();
      for (const obj of allObjectives) {
        const arr = objsByReqId.get(obj.assessmentRequirementId) ?? [];
        arr.push(obj);
        objsByReqId.set(obj.assessmentRequirementId, arr);
      }

      for (const req17 of requirements) {
        if (req17.finding === "met") {
          const objs = objsByReqId.get(req17.id) ?? [];
          const unsatisfied = objs.filter(
            (o) => o.result !== "satisfied" && o.result !== "not_applicable"
          );
          if (unsatisfied.length > 0) {
            errors.push({
              code: "B12",
              message: `${req17.requirementId} is MET but has ${unsatisfied.length} objective(s) not SATISFIED/NOT_APPLICABLE.`,
              severity: "error",
            });
          }
        }
      }
    }

    // B17: Not met count (informational)
    const notMetCount = requirements.filter((r) => r.finding === "not_met").length;
    if (notMetCount === 17) {
      errors.push({
        code: "W5",
        message: "All 17 requirements are NOT_MET. Verify that findings are accurate.",
        severity: "warning",
      });
    }

    // B18: Scope name should be set
    if (!assessment.scopeName?.trim() || assessment.scopeName === "Default") {
      errors.push({
        code: "W6",
        message: "Assessment scope name is using the default value. Consider setting a descriptive scope name.",
        severity: "warning",
      });
    }

    // B19: Assessment must be in_progress or submitted to proceed
    if (assessment.status === "affirmed") {
      errors.push({
        code: "B13",
        message: "Assessment has already been affirmed.",
        severity: "error",
      });
    }

    const blockingErrors = errors.filter((e) => e.severity === "error");
    const passed = blockingErrors.length === 0;

    res.json({
      passed,
      errors,
      summary: {
        blockingErrors: blockingErrors.length,
        warnings: errors.filter((e) => e.severity === "warning").length,
        requirementsReviewed: requirements.filter((r) => r.finding !== "not_reviewed").length,
        requirementsTotal: requirements.length,
        farClausesMet: farRollup.filter((c) => c.result === "met").length,
        farClausesTotal: 15,
      },
    });
  } catch (err) {
    req.log.error(err, "l1: validate failed");
    res.status(500).json({ error: "Failed to run validation" });
  }
});

// ── POST /l1-assessment/:id/submit-for-review ────────────────────────────────

router.post("/:id/submit-for-review", requireAuth, requireOrg, async (req, res): Promise<void> => {
  const orgId = req.orgId!;
  if (!canDo(req, "level1_assessment.submit")) {
    res.status(403).json({ error: "level1_assessment.submit permission required" });
    return;
  }
  if (!(await requireL1Module(orgId, res))) return;

  try {
    const assessment = await fetchAssessment(req.params.id as string, orgId, res);
    if (!assessment) return;

    if (!["in_progress", "draft"].includes(assessment.status)) {
      const meta = parseMeta(assessment.snapshotMetadata);
      if (meta.workflowState === "CHANGES_REQUESTED") {
        // Allow resubmission after changes requested
      } else {
        res.status(400).json({ error: `Cannot submit from status '${assessment.status}'` });
        return;
      }
    }

    if (isLockedBlocked(assessment, req)) {
      res.status(423).json({ error: "Assessment is locked." });
      return;
    }

    const meta = parseMeta(assessment.snapshotMetadata);
    meta.workflowState = "READY_FOR_MANAGEMENT_REVIEW";
    meta.managementReviewSubmittedAt = new Date().toISOString();
    meta.managementReviewSubmittedById = req.authUser?.id ?? null;
    meta.managementReviewSubmittedByName = req.authUser?.name ?? null;
    delete meta.changesRequestedAt;
    delete meta.changesRequestedComments;

    await db
      .update(level1AnnualAssessmentsTable)
      .set({
        status: "submitted",
        submittedAt: new Date(),
        submittedById: req.authUser?.id ?? null,
        snapshotMetadata: JSON.stringify(meta),
        updatedAt: new Date(),
      })
      .where(eq(level1AnnualAssessmentsTable.id, assessment.id));

    await logAudit(req, "submit_review" as any, "level1_annual_assessment", assessment.id, {
      entityLabel: `L1 Assessment ${assessment.assessmentYear} — Submitted for Management Review`,
      previousValue: { status: assessment.status },
      newValue: { status: "submitted", workflowState: "READY_FOR_MANAGEMENT_REVIEW" },
    });

    res.json({ success: true, workflowState: "READY_FOR_MANAGEMENT_REVIEW" });
  } catch (err) {
    req.log.error(err, "l1: submit for review failed");
    res.status(500).json({ error: "Failed to submit for review" });
  }
});

// ── POST /l1-assessment/:id/approve-for-sprs ─────────────────────────────────

router.post("/:id/approve-for-sprs", requireAuth, requireOrg, async (req, res): Promise<void> => {
  const orgId = req.orgId!;
  // Approve requires org_admin or higher
  if (!canDo(req, "level1_assessment.submit") || !["org_admin", "admin", "global_admin"].includes(req.orgRole ?? "")) {
    if (!["org_admin", "admin", "global_admin"].includes(req.orgRole ?? "")) {
      res.status(403).json({ error: "org_admin role required to approve for SPRS" });
      return;
    }
  }
  if (!(await requireL1Module(orgId, res))) return;

  try {
    const assessment = await fetchAssessment(req.params.id as string, orgId, res);
    if (!assessment) return;

    const meta = parseMeta(assessment.snapshotMetadata);
    if (meta.workflowState !== "READY_FOR_MANAGEMENT_REVIEW") {
      res.status(400).json({
        error: "Assessment must be in READY_FOR_MANAGEMENT_REVIEW state to approve for SPRS",
        currentWorkflowState: meta.workflowState ?? assessment.status,
      });
      return;
    }

    const { reviewerNotes } = req.body as { reviewerNotes?: string };

    meta.workflowState = "READY_FOR_SPRS";
    meta.managementReviewApprovedAt = new Date().toISOString();
    meta.managementReviewApprovedById = req.authUser?.id ?? null;
    meta.managementReviewApprovedByName = req.authUser?.name ?? null;
    if (reviewerNotes) meta.reviewerNotes = reviewerNotes;

    await db
      .update(level1AnnualAssessmentsTable)
      .set({
        snapshotMetadata: JSON.stringify(meta),
        updatedAt: new Date(),
      })
      .where(eq(level1AnnualAssessmentsTable.id, assessment.id));

    await logAudit(req, "approve" as any, "level1_annual_assessment", assessment.id, {
      entityLabel: `L1 Assessment ${assessment.assessmentYear} — Approved for SPRS Entry`,
      previousValue: { workflowState: "READY_FOR_MANAGEMENT_REVIEW" },
      newValue: { workflowState: "READY_FOR_SPRS" },
    });

    res.json({ success: true, workflowState: "READY_FOR_SPRS" });
  } catch (err) {
    req.log.error(err, "l1: approve for sprs failed");
    res.status(500).json({ error: "Failed to approve for SPRS" });
  }
});

// ── POST /l1-assessment/:id/request-changes ──────────────────────────────────

router.post("/:id/request-changes", requireAuth, requireOrg, async (req, res): Promise<void> => {
  const orgId = req.orgId!;
  if (!["org_admin", "admin", "global_admin"].includes(req.orgRole ?? "")) {
    res.status(403).json({ error: "org_admin role required to request changes" });
    return;
  }
  if (!(await requireL1Module(orgId, res))) return;

  try {
    const assessment = await fetchAssessment(req.params.id as string, orgId, res);
    if (!assessment) return;

    const meta = parseMeta(assessment.snapshotMetadata);
    if (meta.workflowState !== "READY_FOR_MANAGEMENT_REVIEW") {
      res.status(400).json({
        error: "Assessment must be in READY_FOR_MANAGEMENT_REVIEW state to request changes",
        currentWorkflowState: meta.workflowState ?? assessment.status,
      });
      return;
    }

    const { comments } = req.body as { comments?: string };
    if (!comments?.trim()) {
      res.status(400).json({ error: "comments are required when requesting changes" });
      return;
    }

    meta.workflowState = "CHANGES_REQUESTED";
    meta.changesRequestedAt = new Date().toISOString();
    meta.changesRequestedById = req.authUser?.id ?? null;
    meta.changesRequestedByName = req.authUser?.name ?? null;
    meta.changesRequestedComments = comments;

    await db
      .update(level1AnnualAssessmentsTable)
      .set({
        status: "in_progress",
        snapshotMetadata: JSON.stringify(meta),
        updatedAt: new Date(),
      })
      .where(eq(level1AnnualAssessmentsTable.id, assessment.id));

    await logAudit(req, "reject" as any, "level1_annual_assessment", assessment.id, {
      entityLabel: `L1 Assessment ${assessment.assessmentYear} — Changes Requested`,
      previousValue: { workflowState: "READY_FOR_MANAGEMENT_REVIEW" },
      newValue: { workflowState: "CHANGES_REQUESTED", comments },
    });

    res.json({ success: true, workflowState: "CHANGES_REQUESTED" });
  } catch (err) {
    req.log.error(err, "l1: request changes failed");
    res.status(500).json({ error: "Failed to request changes" });
  }
});

// ── GET /l1-assessment/:id/sprs-worksheet ────────────────────────────────────

router.get("/:id/sprs-worksheet", requireAuth, requireOrg, async (req, res): Promise<void> => {
  const orgId = req.orgId!;
  if (!canDo(req, "level1_assessment.view")) {
    res.status(403).json({ error: "level1_assessment.view permission required" });
    return;
  }
  if (!(await requireL1Module(orgId, res))) return;

  try {
    const assessment = await fetchAssessment(req.params.id as string, orgId, res);
    if (!assessment) return;

    const [requirements, org] = await Promise.all([
      db
        .select()
        .from(level1AssessmentRequirementsTable)
        .where(eq(level1AssessmentRequirementsTable.assessmentId, assessment.id))
        .orderBy(asc(level1AssessmentRequirementsTable.sortOrder)),
      db
        .select()
        .from(organizationsTable)
        .where(eq(organizationsTable.id, orgId))
        .limit(1),
    ]);

    const farRollup = computeFarRollup(
      requirements.map((r) => ({ requirementId: r.requirementId, finding: r.finding }))
    );

    const metCount = farRollup.filter((c) => c.result === "met").length;
    const notMetCount = farRollup.filter((c) => c.result === "not_met").length;
    const naCount = farRollup.filter((c) => c.result === "not_applicable").length;

    const meta = parseMeta(assessment.snapshotMetadata);

    res.json({
      worksheet: {
        // Organization info
        organizationName: org[0]?.name ?? "Unknown",
        organizationId: orgId,

        // Assessment info
        assessmentYear: assessment.assessmentYear,
        assessmentTitle: assessment.title,
        assessmentScopeName: assessment.scopeName,
        assessmentStatus: assessment.status,
        workflowState: meta.workflowState ?? null,

        // Affirming official (for SPRS entry)
        affirmingOfficialName: assessment.affirmingOfficialName ?? null,
        affirmingOfficialTitle: assessment.affirmingOfficialTitle ?? null,

        // SPRS submission details (pre-filled if previously entered)
        sprsEnteredBy: meta.sprsEnteredBy ?? null,
        sprsEntryDate: meta.sprsEntryDate ?? null,
        sprsReference: meta.sprsReference ?? null,
        sprsEvidence: meta.sprsEvidence ?? null,
        sprsEnteredAt: meta.sprsEnteredAt ?? null,

        // Results summary
        requirementsSummary: {
          total: requirements.length,
          met: requirements.filter((r) => r.finding === "met").length,
          notMet: requirements.filter((r) => r.finding === "not_met").length,
          notApplicable: requirements.filter((r) => r.finding === "not_applicable").length,
          notReviewed: requirements.filter((r) => r.finding === "not_reviewed").length,
        },

        // FAR 52.204-21 rollup
        farRollup: {
          clauses: farRollup,
          summary: {
            total: 15,
            met: metCount,
            notMet: notMetCount,
            notApplicable: naCount,
          },
        },

        // Individual requirement findings for SPRS documentation
        requirementFindings: requirements.map((r) => ({
          requirementId: r.requirementId,
          canonicalKey: r.canonicalKey,
          requirementTitle: r.requirementTitle,
          finding: r.finding,
          implementationNarrative: r.implementationNarrative,
          naJustification: r.naJustification,
        })),
      },
    });
  } catch (err) {
    req.log.error(err, "l1: sprs worksheet failed");
    res.status(500).json({ error: "Failed to generate SPRS worksheet" });
  }
});

// ── POST /l1-assessment/:id/mark-entered-sprs ────────────────────────────────

router.post("/:id/mark-entered-sprs", requireAuth, requireOrg, async (req, res): Promise<void> => {
  const orgId = req.orgId!;
  if (!canDo(req, "level1_assessment.submit")) {
    res.status(403).json({ error: "level1_assessment.submit permission required" });
    return;
  }
  if (!(await requireL1Module(orgId, res))) return;

  try {
    const assessment = await fetchAssessment(req.params.id as string, orgId, res);
    if (!assessment) return;

    const meta = parseMeta(assessment.snapshotMetadata);
    if (meta.workflowState !== "READY_FOR_SPRS") {
      res.status(400).json({
        error: "Assessment must be in READY_FOR_SPRS state to mark SPRS entry",
        currentWorkflowState: meta.workflowState ?? assessment.status,
      });
      return;
    }

    const { submittedBy, entryDate, reference, evidence } = req.body as {
      submittedBy?: string;
      entryDate?: string;
      reference?: string;
      evidence?: string;
    };

    if (!submittedBy || !entryDate || !reference) {
      res.status(400).json({
        error: "submittedBy, entryDate, and reference are required for SPRS entry",
      });
      return;
    }

    meta.workflowState = "PENDING_AFFIRMATION";
    meta.sprsEnteredBy = submittedBy;
    meta.sprsEntryDate = entryDate;
    meta.sprsReference = reference;
    meta.sprsEvidence = evidence ?? null;
    meta.sprsEnteredAt = new Date().toISOString();
    meta.sprsEnteredById = req.authUser?.id ?? null;

    await db
      .update(level1AnnualAssessmentsTable)
      .set({
        snapshotMetadata: JSON.stringify(meta),
        updatedAt: new Date(),
      })
      .where(eq(level1AnnualAssessmentsTable.id, assessment.id));

    await logAudit(req, "update" as any, "level1_annual_assessment", assessment.id, {
      entityLabel: `L1 Assessment ${assessment.assessmentYear} — Entered in SPRS`,
      newValue: { workflowState: "PENDING_AFFIRMATION", sprsReference: reference, entryDate },
    });

    res.json({ success: true, workflowState: "PENDING_AFFIRMATION" });
  } catch (err) {
    req.log.error(err, "l1: mark entered sprs failed");
    res.status(500).json({ error: "Failed to mark SPRS entry" });
  }
});

// ── POST /l1-assessment/:id/affirm ───────────────────────────────────────────

router.post("/:id/affirm", requireAuth, requireOrg, async (req, res): Promise<void> => {
  const orgId = req.orgId!;
  if (!canDo(req, "level1_assessment.affirm")) {
    res.status(403).json({ error: "level1_assessment.affirm permission required" });
    return;
  }
  if (!(await requireL1Module(orgId, res))) return;

  try {
    const assessment = await fetchAssessment(req.params.id as string, orgId, res);
    if (!assessment) return;

    const meta = parseMeta(assessment.snapshotMetadata);

    // Allow affirmation from PENDING_AFFIRMATION or READY_FOR_SPRS (skip SPRS step if needed)
    if (!["PENDING_AFFIRMATION", "READY_FOR_SPRS", "READY_FOR_MANAGEMENT_REVIEW"].includes(
      (meta.workflowState as string) ?? ""
    ) && assessment.status !== "submitted") {
      res.status(400).json({
        error: "Assessment must be submitted before affirmation",
        currentWorkflowState: meta.workflowState ?? assessment.status,
      });
      return;
    }

    const {
      officialName,
      officialTitle,
      officialEmail,
      affirmationDate,
      cmmcUid,
      statusDate,
    } = req.body as {
      officialName?: string;
      officialTitle?: string;
      officialEmail?: string;
      affirmationDate?: string;
      cmmcUid?: string;
      statusDate?: string;
    };

    if (!officialName || !officialTitle || !affirmationDate) {
      res.status(400).json({
        error: "officialName, officialTitle, and affirmationDate are required for affirmation",
      });
      return;
    }

    const affirmedDate = new Date(affirmationDate);
    // Expiration: 1 year from affirmation date for L1 annual self-assessment
    const expirationDate = new Date(affirmedDate);
    expirationDate.setFullYear(expirationDate.getFullYear() + 1);

    meta.workflowState = "FINAL_LEVEL_1_SELF";
    meta.affirmationOfficialName = officialName;
    meta.affirmationOfficialTitle = officialTitle;
    meta.affirmationOfficialEmail = officialEmail ?? null;
    meta.affirmationDate = affirmationDate;
    meta.cmmcUid = cmmcUid ?? null;
    meta.statusDate = statusDate ?? affirmationDate;
    meta.expirationDate = expirationDate.toISOString();
    meta.affirmedByUserId = req.authUser?.id ?? null;
    meta.affirmedByUserName = req.authUser?.name ?? null;

    await db
      .update(level1AnnualAssessmentsTable)
      .set({
        status: "affirmed",
        affirmingOfficialName: officialName,
        affirmingOfficialTitle: officialTitle,
        affirmingOfficialId: req.authUser?.id ?? null,
        affirmedAt: affirmedDate,
        snapshotMetadata: JSON.stringify(meta),
        updatedAt: new Date(),
      })
      .where(eq(level1AnnualAssessmentsTable.id, assessment.id));

    await logAudit(req, "activate" as any, "level1_annual_assessment", assessment.id, {
      entityLabel: `L1 Assessment ${assessment.assessmentYear} — Affirmed by ${officialName}`,
      previousValue: { status: assessment.status, workflowState: meta.workflowState },
      newValue: {
        status: "affirmed",
        workflowState: "FINAL_LEVEL_1_SELF",
        affirmingOfficial: `${officialName}, ${officialTitle}`,
        expirationDate: expirationDate.toISOString(),
      },
    });

    res.json({ success: true, workflowState: "FINAL_LEVEL_1_SELF", expirationDate: expirationDate.toISOString() });
  } catch (err) {
    req.log.error(err, "l1: affirm failed");
    res.status(500).json({ error: "Failed to record affirmation" });
  }
});

// ── POST /l1-assessment/:id/finalize ─────────────────────────────────────────

router.post("/:id/finalize", requireAuth, requireOrg, async (req, res): Promise<void> => {
  const orgId = req.orgId!;
  if (!canDo(req, "level1_assessment.affirm")) {
    res.status(403).json({ error: "level1_assessment.affirm permission required to finalize" });
    return;
  }
  if (!(await requireL1Module(orgId, res))) return;

  try {
    const assessment = await fetchAssessment(req.params.id as string, orgId, res);
    if (!assessment) return;

    if (assessment.status === "locked") {
      res.status(400).json({ error: "Assessment is already finalized and locked" });
      return;
    }

    if (assessment.status !== "affirmed") {
      res.status(400).json({
        error: "Assessment must be in AFFIRMED status before finalization",
        currentStatus: assessment.status,
      });
      return;
    }

    const meta = parseMeta(assessment.snapshotMetadata);
    if (meta.workflowState !== "FINAL_LEVEL_1_SELF") {
      res.status(400).json({
        error: "Assessment must be in FINAL_LEVEL_1_SELF workflow state before finalization",
        currentWorkflowState: meta.workflowState ?? null,
      });
      return;
    }

    // Load all data for snapshots
    const [requirements, evidenceLinks, org] = await Promise.all([
      db
        .select()
        .from(level1AssessmentRequirementsTable)
        .where(eq(level1AssessmentRequirementsTable.assessmentId, assessment.id))
        .orderBy(asc(level1AssessmentRequirementsTable.sortOrder)),
      db
        .select()
        .from(level1AssessmentEvidenceLinksTable)
        .where(eq(level1AssessmentEvidenceLinksTable.assessmentId, assessment.id)),
      db
        .select()
        .from(organizationsTable)
        .where(eq(organizationsTable.id, orgId))
        .limit(1),
    ]);

    const farRollup = computeFarRollup(
      requirements.map((r) => ({ requirementId: r.requirementId, finding: r.finding }))
    );

    const metCount = requirements.filter((r) => r.finding === "met").length;
    const overallScore = requirements.length > 0 ? Math.round((metCount / requirements.length) * 100) : 0;

    // Build immutable snapshot
    const snapshotData = {
      lockedAt: new Date().toISOString(),
      lockedByUserId: req.authUser?.id ?? null,
      lockedByUserName: req.authUser?.name ?? null,
      assessmentYear: assessment.assessmentYear,
      scopeName: assessment.scopeName,
      organizationName: org[0]?.name ?? "Unknown",
      overallScore,
      requirementFindings: requirements.map((r) => ({
        requirementId: r.requirementId,
        canonicalKey: r.canonicalKey,
        requirementTitle: r.requirementTitle,
        finding: r.finding,
        implementationNarrative: r.implementationNarrative,
        naJustification: r.naJustification,
      })),
      farClauseResults: farRollup.map((c) => ({
        clause: c.clause,
        label: c.label,
        result: c.result,
        requirementIds: c.requirementIds,
      })),
      evidenceLinkCount: evidenceLinks.length,
      affirmingOfficialName: assessment.affirmingOfficialName,
      affirmingOfficialTitle: assessment.affirmingOfficialTitle,
      affirmedAt: assessment.affirmedAt?.toISOString() ?? null,
      workflowMeta: meta,
    };

    const snapshotJson = JSON.stringify(snapshotData);
    const snapshotHash = createHash("sha256").update(snapshotJson).digest("hex");

    // Retention: 6 years from finalization
    const retentionUntil = new Date();
    retentionUntil.setFullYear(retentionUntil.getFullYear() + 6);

    const finalMeta = {
      ...meta,
      workflowState: "LOCKED",
      finalizedAt: new Date().toISOString(),
      finalizedByUserId: req.authUser?.id ?? null,
      finalizedByUserName: req.authUser?.name ?? null,
      snapshotHash,
      retentionUntil: retentionUntil.toISOString(),
    };

    await db
      .update(level1AnnualAssessmentsTable)
      .set({
        status: "locked",
        lockedAt: new Date(),
        lockedById: req.authUser?.id ?? null,
        overallScore,
        snapshotMetadata: JSON.stringify({ ...finalMeta, snapshot: snapshotData }),
        updatedAt: new Date(),
      })
      .where(eq(level1AnnualAssessmentsTable.id, assessment.id));

    await logAudit(req, "archive" as any, "level1_annual_assessment", assessment.id, {
      entityLabel: `L1 Assessment ${assessment.assessmentYear} — Finalized and Locked`,
      newValue: {
        status: "locked",
        overallScore,
        snapshotHash,
        retentionUntil: retentionUntil.toISOString(),
        farClausesMet: farRollup.filter((c) => c.result === "met").length,
      },
    });

    res.json({
      success: true,
      assessmentId: assessment.id,
      status: "locked",
      overallScore,
      snapshotHash,
      retentionUntil: retentionUntil.toISOString(),
      summary: {
        requirementsMet: metCount,
        requirementsTotal: requirements.length,
        farClausesMet: farRollup.filter((c) => c.result === "met").length,
        farClausesTotal: 15,
      },
    });
  } catch (err) {
    req.log.error(err, "l1: finalize failed");
    res.status(500).json({ error: "Failed to finalize assessment" });
  }
});

// ── Mount report sub-router ──────────────────────────────────────────────────
// Handles GET /l1-assessment/:id/reports/* (9 endpoints)
router.use("/:id/reports", l1ReportsRouter);

export default router;
