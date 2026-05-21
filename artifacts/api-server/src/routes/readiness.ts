import { Router } from "express";
import {
  db,
  controlsTable,
  domainsTable,
  readinessAssessmentsTable,
  assessmentScopeAnswersTable,
  assessmentControlFindingsTable,
} from "@workspace/db";
import { eq, and, count, sql } from "drizzle-orm";
import { requireAuth } from "../lib/auth";
import { requireOrg } from "../middleware/org";
import { randomUUID } from "crypto";

const router = Router();

// ── List assessments for org ─────────────────────────────────────────────────
router.get("/readiness/assessments", requireAuth, requireOrg, async (req, res) => {
  const orgId = req.orgId!;

  const assessments = await db
    .select()
    .from(readinessAssessmentsTable)
    .where(eq(readinessAssessmentsTable.organizationId, orgId))
    .orderBy(sql`${readinessAssessmentsTable.createdAt} desc`);

  // Attach finding counts
  const withCounts = await Promise.all(
    assessments.map(async (a) => {
      const [{ value: totalFindings }] = await db
        .select({ value: count() })
        .from(assessmentControlFindingsTable)
        .where(eq(assessmentControlFindingsTable.assessmentId, a.id));

      const [{ value: metCount }] = await db
        .select({ value: count() })
        .from(assessmentControlFindingsTable)
        .where(
          and(
            eq(assessmentControlFindingsTable.assessmentId, a.id),
            eq(assessmentControlFindingsTable.result, "met")
          )
        );

      const [{ value: notMetCount }] = await db
        .select({ value: count() })
        .from(assessmentControlFindingsTable)
        .where(
          and(
            eq(assessmentControlFindingsTable.assessmentId, a.id),
            eq(assessmentControlFindingsTable.result, "not_met")
          )
        );

      return { ...a, totalFindings, metCount, notMetCount };
    })
  );

  return res.json(withCounts);
});

// ── Create assessment ─────────────────────────────────────────────────────────
router.post("/readiness/assessments", requireAuth, requireOrg, async (req, res) => {
  const role = req.authUser?.role;
  if (role !== "admin" && role !== "compliance_manager") {
    return res.status(403).json({ error: "Forbidden" });
  }
  const orgId = req.orgId!;
  const {
    assessmentType, name, targetLevel, assessorName, systemName,
    environmentType, assessmentDate, primaryTools,
    cuiStoredProcessed, usesMicrosoft365, endpointsManaged, mfaEnforced,
    policiesExist, sspExists, poamExists, evidenceExists, notes,
  } = req.body;

  if (!name || !assessmentDate) {
    return res.status(400).json({ error: "name and assessmentDate are required" });
  }

  const [assessment] = await db
    .insert(readinessAssessmentsTable)
    .values({
      id: randomUUID(),
      organizationId: orgId,
      assessmentType: assessmentType ?? "full_control",
      name,
      targetLevel: targetLevel ?? "L2",
      assessorName: assessorName ?? "",
      systemName: systemName ?? "",
      environmentType: environmentType ?? "",
      assessmentDate,
      primaryTools: primaryTools ?? "",
      cuiStoredProcessed: cuiStoredProcessed ?? false,
      usesMicrosoft365: usesMicrosoft365 ?? false,
      endpointsManaged: endpointsManaged ?? false,
      mfaEnforced: mfaEnforced ?? false,
      policiesExist: policiesExist ?? false,
      sspExists: sspExists ?? false,
      poamExists: poamExists ?? false,
      evidenceExists: evidenceExists ?? false,
      status: "scoping",
      notes: notes ?? null,
      createdBy: req.authUser?.id,
    })
    .returning();

  return res.status(201).json(assessment);
});

// ── Get single assessment ──────────────────────────────────────────────────────
router.get("/readiness/assessments/:id", requireAuth, requireOrg, async (req, res) => {
  const orgId = req.orgId!;
  const { id } = req.params;

  const [assessment] = await db
    .select()
    .from(readinessAssessmentsTable)
    .where(
      and(
        eq(readinessAssessmentsTable.id, id),
        eq(readinessAssessmentsTable.organizationId, orgId)
      )
    )
    .limit(1);

  if (!assessment) return res.status(404).json({ error: "Not found" });
  return res.json(assessment);
});

// ── Update assessment metadata ────────────────────────────────────────────────
router.patch("/readiness/assessments/:id", requireAuth, requireOrg, async (req, res) => {
  const role = req.authUser?.role;
  if (role !== "admin" && role !== "compliance_manager") {
    return res.status(403).json({ error: "Forbidden" });
  }
  const orgId = req.orgId!;
  const { id } = req.params;

  const allowed = [
    "name", "assessmentType", "targetLevel", "assessorName", "systemName",
    "environmentType", "assessmentDate", "primaryTools", "cuiStoredProcessed",
    "usesMicrosoft365", "endpointsManaged", "mfaEnforced", "policiesExist",
    "sspExists", "poamExists", "evidenceExists", "notes", "status",
  ] as const;

  const updates: Record<string, unknown> = { updatedAt: new Date() };
  for (const k of allowed) {
    if (k in req.body) updates[k] = req.body[k];
  }

  const [updated] = await db
    .update(readinessAssessmentsTable)
    .set(updates as any)
    .where(
      and(
        eq(readinessAssessmentsTable.id, id),
        eq(readinessAssessmentsTable.organizationId, orgId)
      )
    )
    .returning();

  if (!updated) return res.status(404).json({ error: "Not found" });
  return res.json(updated);
});

// ── Get scope answers ─────────────────────────────────────────────────────────
router.get("/readiness/assessments/:id/scope", requireAuth, requireOrg, async (req, res) => {
  const { id } = req.params;
  const answers = await db
    .select()
    .from(assessmentScopeAnswersTable)
    .where(eq(assessmentScopeAnswersTable.assessmentId, id));
  return res.json(answers);
});

// ── Upsert scope answers (batch) ──────────────────────────────────────────────
router.patch("/readiness/assessments/:id/scope", requireAuth, requireOrg, async (req, res) => {
  const { id } = req.params;
  const { answers } = req.body as {
    answers: Array<{ questionKey: string; answer: string; notes?: string }>;
  };

  if (!Array.isArray(answers)) {
    return res.status(400).json({ error: "answers array required" });
  }

  // Verify assessment belongs to org
  const [assessment] = await db
    .select({ id: readinessAssessmentsTable.id })
    .from(readinessAssessmentsTable)
    .where(
      and(
        eq(readinessAssessmentsTable.id, id),
        eq(readinessAssessmentsTable.organizationId, req.orgId!)
      )
    )
    .limit(1);
  if (!assessment) return res.status(404).json({ error: "Not found" });

  for (const ans of answers) {
    const [existing] = await db
      .select({ id: assessmentScopeAnswersTable.id })
      .from(assessmentScopeAnswersTable)
      .where(
        and(
          eq(assessmentScopeAnswersTable.assessmentId, id),
          eq(assessmentScopeAnswersTable.questionKey, ans.questionKey)
        )
      )
      .limit(1);

    if (existing) {
      await db
        .update(assessmentScopeAnswersTable)
        .set({
          answer: ans.answer as any,
          notes: ans.notes ?? null,
          updatedAt: new Date(),
        })
        .where(eq(assessmentScopeAnswersTable.id, existing.id));
    } else {
      await db.insert(assessmentScopeAnswersTable).values({
        id: randomUUID(),
        assessmentId: id,
        questionKey: ans.questionKey,
        answer: ans.answer as any,
        notes: ans.notes ?? null,
        updatedAt: new Date(),
      });
    }
  }

  return res.json({ ok: true });
});

// ── Get all findings for assessment ───────────────────────────────────────────
router.get("/readiness/assessments/:id/findings", requireAuth, requireOrg, async (req, res) => {
  const orgId = req.orgId!;
  const { id } = req.params;

  // Verify ownership
  const [assessment] = await db
    .select({ id: readinessAssessmentsTable.id })
    .from(readinessAssessmentsTable)
    .where(
      and(
        eq(readinessAssessmentsTable.id, id),
        eq(readinessAssessmentsTable.organizationId, orgId)
      )
    )
    .limit(1);
  if (!assessment) return res.status(404).json({ error: "Not found" });

  const findings = await db
    .select({
      finding: assessmentControlFindingsTable,
      control: {
        controlId: controlsTable.controlId,
        title: controlsTable.title,
        level: controlsTable.level,
        domainId: controlsTable.domainId,
      },
      domain: { name: domainsTable.name },
    })
    .from(assessmentControlFindingsTable)
    .innerJoin(controlsTable, eq(assessmentControlFindingsTable.controlId, controlsTable.id))
    .innerJoin(domainsTable, eq(controlsTable.domainId, domainsTable.id))
    .where(eq(assessmentControlFindingsTable.assessmentId, id));

  return res.json(
    findings.map((f) => ({
      ...f.finding,
      controlRef: f.control.controlId,
      controlTitle: f.control.title,
      level: f.control.level,
      domainName: f.domain.name,
    }))
  );
});

// ── Upsert a single control finding ──────────────────────────────────────────
router.put(
  "/readiness/assessments/:id/findings/:controlDbId",
  requireAuth,
  requireOrg,
  async (req, res) => {
    const orgId = req.orgId!;
    const { id, controlDbId } = req.params;

    // Verify ownership
    const [assessment] = await db
      .select({ id: readinessAssessmentsTable.id, status: readinessAssessmentsTable.status })
      .from(readinessAssessmentsTable)
      .where(
        and(
          eq(readinessAssessmentsTable.id, id),
          eq(readinessAssessmentsTable.organizationId, orgId)
        )
      )
      .limit(1);
    if (!assessment) return res.status(404).json({ error: "Not found" });

    const {
      result, notes, evidenceExists, evidenceApproved, policyExists,
      procedureExists, sspNarrativeExists, testCompleted,
      findingTitle, gapDescription, riskLevel, recommendedRemediation,
      ownerName, targetDate,
    } = req.body;

    const [existing] = await db
      .select({ id: assessmentControlFindingsTable.id })
      .from(assessmentControlFindingsTable)
      .where(
        and(
          eq(assessmentControlFindingsTable.assessmentId, id),
          eq(assessmentControlFindingsTable.controlId, controlDbId)
        )
      )
      .limit(1);

    const values = {
      assessmentId: id,
      controlId: controlDbId,
      result: result ?? "unknown",
      notes: notes ?? null,
      evidenceExists: evidenceExists ?? false,
      evidenceApproved: evidenceApproved ?? false,
      policyExists: policyExists ?? false,
      procedureExists: procedureExists ?? false,
      sspNarrativeExists: sspNarrativeExists ?? false,
      testCompleted: testCompleted ?? false,
      findingTitle: findingTitle ?? null,
      gapDescription: gapDescription ?? null,
      riskLevel: riskLevel ?? null,
      recommendedRemediation: recommendedRemediation ?? null,
      ownerName: ownerName ?? null,
      targetDate: targetDate ?? null,
      updatedAt: new Date(),
    };

    let finding;
    if (existing) {
      [finding] = await db
        .update(assessmentControlFindingsTable)
        .set(values as any)
        .where(eq(assessmentControlFindingsTable.id, existing.id))
        .returning();
    } else {
      [finding] = await db
        .insert(assessmentControlFindingsTable)
        .values({ id: randomUUID(), ...values } as any)
        .returning();
    }

    // Auto-advance status to in_progress
    if (assessment.status === "scoping") {
      await db
        .update(readinessAssessmentsTable)
        .set({ status: "in_progress", updatedAt: new Date() })
        .where(eq(readinessAssessmentsTable.id, id));
    }

    return res.json(finding);
  }
);

// ── Calculate score ───────────────────────────────────────────────────────────
router.get("/readiness/assessments/:id/score", requireAuth, requireOrg, async (req, res) => {
  const orgId = req.orgId!;
  const { id } = req.params;

  const [assessment] = await db
    .select()
    .from(readinessAssessmentsTable)
    .where(
      and(
        eq(readinessAssessmentsTable.id, id),
        eq(readinessAssessmentsTable.organizationId, orgId)
      )
    )
    .limit(1);
  if (!assessment) return res.status(404).json({ error: "Not found" });

  const findings = await db
    .select({
      finding: assessmentControlFindingsTable,
      control: { controlId: controlsTable.controlId, domainId: controlsTable.domainId },
      domain: { name: domainsTable.name },
    })
    .from(assessmentControlFindingsTable)
    .innerJoin(controlsTable, eq(assessmentControlFindingsTable.controlId, controlsTable.id))
    .innerJoin(domainsTable, eq(controlsTable.domainId, domainsTable.id))
    .where(eq(assessmentControlFindingsTable.assessmentId, id));

  const total = findings.length;
  const met = findings.filter((f) => f.finding.result === "met").length;
  const partiallyMet = findings.filter((f) => f.finding.result === "partially_met").length;
  const notMet = findings.filter((f) => f.finding.result === "not_met").length;
  const unknown = findings.filter((f) => f.finding.result === "unknown").length;
  const na = findings.filter((f) => f.finding.result === "not_applicable").length;

  // Projected score: 1 point per control, deduct for not_met, 0.5 for partially_met
  const maxScore = 110;
  const assessed = met + partiallyMet + notMet;
  const projectedScore = assessed > 0
    ? Math.round((met + partiallyMet * 0.5) * (maxScore / Math.max(assessed, 1)))
    : null;

  // Confidence score (0-100): based on evidence quality signals
  const withEvidence = findings.filter((f) => f.finding.evidenceExists).length;
  const withApprovedEvidence = findings.filter((f) => f.finding.evidenceApproved).length;
  const withPolicy = findings.filter((f) => f.finding.policyExists).length;
  const withProcedure = findings.filter((f) => f.finding.procedureExists).length;
  const withSsp = findings.filter((f) => f.finding.sspNarrativeExists).length;
  const withTest = findings.filter((f) => f.finding.testCompleted).length;

  const confidenceScore = total > 0
    ? Math.round(
        (withApprovedEvidence * 30 +
          withEvidence * 10 +
          withPolicy * 15 +
          withProcedure * 15 +
          withSsp * 15 +
          withTest * 15) /
          (total * 100) *
          100
      )
    : null;

  // Domain breakdown
  const domainMap: Record<string, { name: string; met: number; partial: number; notMet: number; unknown: number; total: number }> = {};
  for (const f of findings) {
    const dn = f.domain.name;
    if (!domainMap[dn]) domainMap[dn] = { name: dn, met: 0, partial: 0, notMet: 0, unknown: 0, total: 0 };
    domainMap[dn].total++;
    if (f.finding.result === "met") domainMap[dn].met++;
    else if (f.finding.result === "partially_met") domainMap[dn].partial++;
    else if (f.finding.result === "not_met") domainMap[dn].notMet++;
    else domainMap[dn].unknown++;
  }

  // Gaps (not_met or partially_met with findingTitle)
  const gaps = findings
    .filter((f) => f.finding.result === "not_met" || f.finding.result === "partially_met")
    .map((f) => ({
      id: f.finding.id,
      controlRef: f.control.controlId,
      domainName: f.domain.name,
      result: f.finding.result,
      findingTitle: f.finding.findingTitle,
      gapDescription: f.finding.gapDescription,
      riskLevel: f.finding.riskLevel,
      evidenceExists: f.finding.evidenceExists,
      policyExists: f.finding.policyExists,
    }));

  return res.json({
    assessmentId: id,
    totalAnswered: total,
    met,
    partiallyMet,
    notMet,
    unknown,
    notApplicable: na,
    projectedScore,
    maxScore,
    confidenceScore,
    domainBreakdown: Object.values(domainMap),
    gaps,
    poamCandidates: notMet + partiallyMet,
    assessmentStatus: assessment.status,
  });
});

// ── Complete assessment ───────────────────────────────────────────────────────
router.post("/readiness/assessments/:id/complete", requireAuth, requireOrg, async (req, res) => {
  const role = req.authUser?.role;
  if (role !== "admin" && role !== "compliance_manager") {
    return res.status(403).json({ error: "Forbidden" });
  }
  const orgId = req.orgId!;
  const { id } = req.params;

  // Calculate final score
  const findings = await db
    .select({ result: assessmentControlFindingsTable.result })
    .from(assessmentControlFindingsTable)
    .where(eq(assessmentControlFindingsTable.assessmentId, id));

  const met = findings.filter((f) => f.result === "met").length;
  const partiallyMet = findings.filter((f) => f.result === "partially_met").length;
  const notMet = findings.filter((f) => f.result === "not_met").length;
  const assessed = met + partiallyMet + notMet;
  const projectedScore = assessed > 0
    ? Math.round((met + partiallyMet * 0.5) * (110 / Math.max(assessed, 1)))
    : null;

  const [updated] = await db
    .update(readinessAssessmentsTable)
    .set({
      status: "complete",
      projectedScore,
      maxScore: 110,
      completedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(readinessAssessmentsTable.id, id),
        eq(readinessAssessmentsTable.organizationId, orgId)
      )
    )
    .returning();

  if (!updated) return res.status(404).json({ error: "Not found" });
  return res.json(updated);
});

export default router;
