import { Router } from "express";
import {
  db,
  autoAssessmentsTable,
  autoFindingsTable,
  autoEvidenceRequestsTable,
  autoIntakeAnswersTable,
  controlsTable,
} from "@workspace/db";
import { eq, and, desc } from "drizzle-orm";
import { randomUUID } from "crypto";
import { requireAuth } from "../lib/auth";
import { requireOrg } from "../middleware/org";
import { runAssessmentEngine } from "../lib/assessment-engine";
import { ASSESSMENT_PACKS } from "../data/assessment-packs";

const router = Router();

router.get("/assessments", requireAuth, requireOrg, async (req, res) => {
  try {
    const rows = await db
      .select()
      .from(autoAssessmentsTable)
      .where(eq(autoAssessmentsTable.organizationId, req.orgId!))
      .orderBy(desc(autoAssessmentsTable.createdAt));
    res.json({ assessments: rows });
  } catch (err) {
    req.log.error(err, "auto-assessor: list failed");
    res.status(500).json({ error: "Failed to list assessments" });
  }
});

router.post("/assessments", requireAuth, requireOrg, async (req, res) => {
  const { name, notes, intakeAnswers = {} } = req.body as {
    name?: string;
    notes?: string;
    intakeAnswers?: Record<string, string>;
  };

  const user = (req as any).user as { id: string; email: string; role: string } | undefined;
  if (user && user.role !== "admin" && user.role !== "compliance_manager") {
    return res.status(403).json({ error: "Only admins and compliance managers can run assessments" });
  }

  const id = randomUUID();
  const assessmentName =
    name?.trim() || `Baseline Assessment — ${new Date().toLocaleDateString()}`;

  try {
    await db.insert(autoAssessmentsTable).values({
      id,
      organizationId: req.orgId!,
      name: assessmentName,
      notes: notes?.trim() || null,
      createdBy: user?.email ?? null,
      updatedAt: new Date(),
    });

    const intakeRows = Object.entries(intakeAnswers)
      .filter(([, v]) => v && v !== "unknown")
      .map(([key, answer]) => ({
        id: randomUUID(),
        assessmentId: id,
        questionKey: key,
        answer: answer as any,
        updatedAt: new Date(),
      }));
    if (intakeRows.length > 0) {
      await db.insert(autoIntakeAnswersTable).values(intakeRows);
    }

    await runAssessmentEngine(req.orgId!, id, intakeAnswers);

    const [assessment] = await db
      .select()
      .from(autoAssessmentsTable)
      .where(eq(autoAssessmentsTable.id, id));

    res.status(201).json(assessment);
  } catch (err) {
    req.log.error(err, "auto-assessor: run failed");
    res.status(500).json({ error: "Failed to run assessment" });
  }
});

router.get("/assessments/:id", requireAuth, requireOrg, async (req, res) => {
  try {
    const [assessment] = await db
      .select()
      .from(autoAssessmentsTable)
      .where(
        and(
          eq(autoAssessmentsTable.id, req.params.id),
          eq(autoAssessmentsTable.organizationId, req.orgId!)
        )
      );

    if (!assessment) return res.status(404).json({ error: "Assessment not found" });

    const findings = await db
      .select({ packId: autoFindingsTable.packId, suggestedStatus: autoFindingsTable.suggestedStatus, confidenceScore: autoFindingsTable.confidenceScore })
      .from(autoFindingsTable)
      .where(eq(autoFindingsTable.assessmentId, req.params.id));

    const [{ count: evidenceRequestCount }] = await db
      .select({ count: db.$count(autoEvidenceRequestsTable) })
      .from(autoEvidenceRequestsTable)
      .where(eq(autoEvidenceRequestsTable.assessmentId, req.params.id));

    const packs = ASSESSMENT_PACKS.map((pack) => {
      const packFindings = findings.filter((f) => f.packId === pack.id);
      const candidate = packFindings.filter(
        (f) => f.suggestedStatus === "candidate_for_implemented"
      ).length;
      const notStarted = packFindings.filter((f) => f.suggestedStatus === "not_started").length;
      const inProgress = packFindings.filter(
        (f) =>
          f.suggestedStatus === "in_progress" ||
          f.suggestedStatus === "needs_evidence" ||
          f.suggestedStatus === "needs_documentation" ||
          f.suggestedStatus === "needs_validation"
      ).length;
      const avgConf =
        packFindings.length > 0
          ? Math.round(
              packFindings.reduce((s, f) => s + (f.confidenceScore ?? 0), 0) /
                packFindings.length
            )
          : 0;
      return {
        packId: pack.id,
        packName: pack.name,
        packShortName: pack.shortName,
        total: packFindings.length,
        candidate,
        notStarted,
        inProgress,
        avgConfidence: avgConf,
      };
    }).filter((p) => p.total > 0);

    res.json({ ...assessment, packs, evidenceRequestCount: Number(evidenceRequestCount) });
  } catch (err) {
    req.log.error(err, "auto-assessor: get failed");
    res.status(500).json({ error: "Failed to load assessment" });
  }
});

router.get("/assessments/:id/findings", requireAuth, requireOrg, async (req, res) => {
  try {
    const [assessment] = await db
      .select({ id: autoAssessmentsTable.id, status: autoAssessmentsTable.status })
      .from(autoAssessmentsTable)
      .where(
        and(
          eq(autoAssessmentsTable.id, req.params.id),
          eq(autoAssessmentsTable.organizationId, req.orgId!)
        )
      );
    if (!assessment) return res.status(404).json({ error: "Assessment not found" });

    const rows = await db
      .select({
        id: autoFindingsTable.id,
        packId: autoFindingsTable.packId,
        suggestedStatus: autoFindingsTable.suggestedStatus,
        confidenceScore: autoFindingsTable.confidenceScore,
        hasEvidence: autoFindingsTable.hasEvidence,
        hasApprovedEvidence: autoFindingsTable.hasApprovedEvidence,
        hasPolicy: autoFindingsTable.hasPolicy,
        hasProcedure: autoFindingsTable.hasProcedure,
        hasSspNarrative: autoFindingsTable.hasSspNarrative,
        hasMonitoringItem: autoFindingsTable.hasMonitoringItem,
        monitoringIsCurrent: autoFindingsTable.monitoringIsCurrent,
        hasOpenPoam: autoFindingsTable.hasOpenPoam,
        evidenceCount: autoFindingsTable.evidenceCount,
        approvedEvidenceCount: autoFindingsTable.approvedEvidenceCount,
        findingType: autoFindingsTable.findingType,
        severity: autoFindingsTable.severity,
        gapDescription: autoFindingsTable.gapDescription,
        recommendedRemediation: autoFindingsTable.recommendedRemediation,
        approvedStatus: autoFindingsTable.approvedStatus,
        approvedAt: autoFindingsTable.approvedAt,
        rejectedAt: autoFindingsTable.rejectedAt,
        controlRef: controlsTable.controlId,
        controlTitle: controlsTable.title,
        level: controlsTable.level,
      })
      .from(autoFindingsTable)
      .innerJoin(controlsTable, eq(autoFindingsTable.controlId, controlsTable.id))
      .where(eq(autoFindingsTable.assessmentId, req.params.id))
      .orderBy(autoFindingsTable.confidenceScore);

    res.json({ assessmentStatus: assessment.status, findings: rows });
  } catch (err) {
    req.log.error(err, "auto-assessor: findings list failed");
    res.status(500).json({ error: "Failed to load findings" });
  }
});

router.patch(
  "/assessments/:id/findings/:findingId",
  requireAuth,
  requireOrg,
  async (req, res) => {
    const { action, reason } = req.body as { action: "approve" | "reject"; reason?: string };
    const user = (req as any).user as { id: string; email: string; role: string } | undefined;
    if (user && user.role !== "admin" && user.role !== "compliance_manager") {
      return res.status(403).json({ error: "Only admins and compliance managers can review findings" });
    }
    if (!action || !["approve", "reject"].includes(action)) {
      return res.status(400).json({ error: "action must be 'approve' or 'reject'" });
    }

    try {
      const [finding] = await db
        .select({ id: autoFindingsTable.id, assessmentId: autoFindingsTable.assessmentId, suggestedStatus: autoFindingsTable.suggestedStatus })
        .from(autoFindingsTable)
        .where(eq(autoFindingsTable.id, req.params.findingId));
      if (!finding || finding.assessmentId !== req.params.id)
        return res.status(404).json({ error: "Finding not found" });

      if (action === "approve") {
        await db
          .update(autoFindingsTable)
          .set({
            approvedStatus: finding.suggestedStatus,
            approvedAt: new Date(),
            approvedBy: user?.email ?? null,
            rejectedAt: null,
            rejectedReason: null,
            updatedAt: new Date(),
          })
          .where(eq(autoFindingsTable.id, req.params.findingId));
      } else {
        await db
          .update(autoFindingsTable)
          .set({
            approvedStatus: null,
            approvedAt: null,
            rejectedAt: new Date(),
            rejectedReason: reason ?? null,
            updatedAt: new Date(),
          })
          .where(eq(autoFindingsTable.id, req.params.findingId));
      }

      const [updated] = await db
        .select()
        .from(autoFindingsTable)
        .where(eq(autoFindingsTable.id, req.params.findingId));
      res.json(updated);
    } catch (err) {
      req.log.error(err, "auto-assessor: patch finding failed");
      res.status(500).json({ error: "Failed to update finding" });
    }
  }
);

router.post("/assessments/:id/bulk-approve", requireAuth, requireOrg, async (req, res) => {
  const user = (req as any).user as { id: string; email: string; role: string } | undefined;
  if (user && user.role !== "admin" && user.role !== "compliance_manager") {
    return res.status(403).json({ error: "Only admins and compliance managers can approve findings" });
  }

  try {
    const [assessment] = await db
      .select({ id: autoAssessmentsTable.id })
      .from(autoAssessmentsTable)
      .where(
        and(
          eq(autoAssessmentsTable.id, req.params.id),
          eq(autoAssessmentsTable.organizationId, req.orgId!)
        )
      );
    if (!assessment) return res.status(404).json({ error: "Assessment not found" });

    const pendingFindings = await db
      .select({ id: autoFindingsTable.id, suggestedStatus: autoFindingsTable.suggestedStatus })
      .from(autoFindingsTable)
      .where(
        and(
          eq(autoFindingsTable.assessmentId, req.params.id)
        )
      );

    const toApprove = pendingFindings.filter((f) => !f.suggestedStatus);
    const now = new Date();
    const CHUNK = 50;

    const allPending = pendingFindings.filter((f) => {
      return true;
    });

    for (let i = 0; i < allPending.length; i += CHUNK) {
      const batch = allPending.slice(i, i + CHUNK);
      for (const f of batch) {
        await db
          .update(autoFindingsTable)
          .set({
            approvedStatus: f.suggestedStatus,
            approvedAt: now,
            approvedBy: user?.email ?? null,
            rejectedAt: null,
            updatedAt: now,
          })
          .where(
            and(
              eq(autoFindingsTable.id, f.id),
            )
          );
      }
    }

    await db
      .update(autoAssessmentsTable)
      .set({ status: "approved", approvedAt: now, approvedBy: user?.email ?? null, updatedAt: now })
      .where(eq(autoAssessmentsTable.id, req.params.id));

    res.json({ approved: allPending.length });
  } catch (err) {
    req.log.error(err, "auto-assessor: bulk-approve failed");
    res.status(500).json({ error: "Failed to bulk approve" });
  }
});

router.get("/assessments/:id/evidence-requests", requireAuth, requireOrg, async (req, res) => {
  try {
    const [assessment] = await db
      .select({ id: autoAssessmentsTable.id })
      .from(autoAssessmentsTable)
      .where(
        and(
          eq(autoAssessmentsTable.id, req.params.id),
          eq(autoAssessmentsTable.organizationId, req.orgId!)
        )
      );
    if (!assessment) return res.status(404).json({ error: "Assessment not found" });

    const rows = await db
      .select()
      .from(autoEvidenceRequestsTable)
      .where(eq(autoEvidenceRequestsTable.assessmentId, req.params.id));

    res.json({ evidenceRequests: rows });
  } catch (err) {
    req.log.error(err, "auto-assessor: evidence-requests failed");
    res.status(500).json({ error: "Failed to load evidence requests" });
  }
});

export default router;
