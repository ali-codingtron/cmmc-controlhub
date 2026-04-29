import { Router } from "express";
import { db, domainsTable, controlsTable, controlAssessmentsTable } from "@workspace/db";
import { eq, sql, count } from "drizzle-orm";
import { requireAuth } from "../lib/auth";

const router = Router();

router.get("/domains", requireAuth, async (req, res) => {
  const domains = await db
    .select()
    .from(domainsTable)
    .orderBy(domainsTable.sortOrder);

  const assessments = await db
    .select({
      domainId: controlsTable.domainId,
      status: controlAssessmentsTable.status,
      cnt: count(),
    })
    .from(controlsTable)
    .leftJoin(
      controlAssessmentsTable,
      eq(controlAssessmentsTable.controlId, controlsTable.id)
    )
    .groupBy(controlsTable.domainId, controlAssessmentsTable.status);

  const controlCounts = await db
    .select({
      domainId: controlsTable.domainId,
      total: count(),
    })
    .from(controlsTable)
    .where(eq(controlsTable.isActive, true))
    .groupBy(controlsTable.domainId);

  const result = domains.map((d) => {
    const totals = controlCounts.find((c) => c.domainId === d.id);
    const domainAssessments = assessments.filter((a) => a.domainId === d.id);
    const implemented = domainAssessments
      .filter((a) => a.status === "implemented" || a.status === "assessor_ready")
      .reduce((sum, a) => sum + Number(a.cnt), 0);
    const assessorReady = domainAssessments
      .filter((a) => a.status === "assessor_ready")
      .reduce((sum, a) => sum + Number(a.cnt), 0);
    const notStarted = domainAssessments
      .filter((a) => a.status === "not_started" || a.status === null)
      .reduce((sum, a) => sum + Number(a.cnt), 0);
    const total = Number(totals?.total ?? 0);
    return {
      ...d,
      totalControls: total,
      implementedControls: implemented,
      assessorReadyControls: assessorReady,
      notStartedControls: notStarted,
      readinessPercent: total > 0 ? Math.round((implemented / total) * 100) : 0,
    };
  });

  res.json(result);
});

router.get("/domains/:id", requireAuth, async (req, res) => {
  const [domain] = await db
    .select()
    .from(domainsTable)
    .where(eq(domainsTable.id, req.params.id))
    .limit(1);

  if (!domain) {
    res.status(404).json({ error: "Not found" });
    return;
  }

  res.json(domain);
});

export default router;
