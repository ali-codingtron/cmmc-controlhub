import {
  db,
  controlsTable,
  evidenceItemsTable,
  evidenceControlLinksTable,
  documentControlMapsTable,
  documentsTable,
  sspControlMappingsTable,
  sspDocumentsTable,
  monitoringItemsTable,
  poamsTable,
  autoAssessmentsTable,
  autoFindingsTable,
  autoEvidenceRequestsTable,
} from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { randomUUID } from "crypto";
import {
  getPackForControl,
  getIntakeAnswerForPack,
  ASSESSMENT_PACKS,
} from "../data/assessment-packs";

type SignalMap = {
  evidenceMap: Map<string, { count: number; approvedCount: number }>;
  docMap: Map<string, { hasPolicy: boolean; hasProcedure: boolean }>;
  sspSet: Set<string>;
  monitoringMap: Map<string, { exists: boolean; isCurrent: boolean }>;
  poamSet: Set<string>;
};

async function batchQuerySignals(orgId: string): Promise<SignalMap> {
  const [evidenceLinks, docLinks, sspMappings, monitoringItems, openPoams] =
    await Promise.all([
      db
        .select({
          controlId: evidenceControlLinksTable.controlId,
          status: evidenceItemsTable.status,
        })
        .from(evidenceControlLinksTable)
        .innerJoin(
          evidenceItemsTable,
          eq(evidenceControlLinksTable.evidenceId, evidenceItemsTable.id)
        )
        .where(eq(evidenceItemsTable.organizationId, orgId)),

      db
        .select({
          controlId: documentControlMapsTable.controlId,
          docType: documentsTable.docType,
        })
        .from(documentControlMapsTable)
        .innerJoin(
          documentsTable,
          eq(documentControlMapsTable.documentId, documentsTable.id)
        )
        .where(eq(documentsTable.organizationId, orgId)),

      db
        .select({
          controlDbId: sspControlMappingsTable.controlDbId,
          narrative: sspControlMappingsTable.implementationNarrative,
        })
        .from(sspControlMappingsTable)
        .innerJoin(
          sspDocumentsTable,
          eq(sspControlMappingsTable.sspDocumentId, sspDocumentsTable.id)
        )
        .where(eq(sspDocumentsTable.organizationId, orgId)),

      db
        .select({
          controlRef: monitoringItemsTable.controlRef,
          status: monitoringItemsTable.status,
        })
        .from(monitoringItemsTable)
        .where(eq(monitoringItemsTable.organizationId, orgId)),

      db
        .select({ linkedControlId: poamsTable.linkedControlId })
        .from(poamsTable)
        .where(
          and(
            eq(poamsTable.organizationId, orgId),
            eq(poamsTable.status, "open")
          )
        ),
    ]);

  const evidenceMap = new Map<string, { count: number; approvedCount: number }>();
  for (const link of evidenceLinks) {
    if (!link.controlId) continue;
    const e = evidenceMap.get(link.controlId) ?? { count: 0, approvedCount: 0 };
    e.count++;
    if (link.status === "approved") e.approvedCount++;
    evidenceMap.set(link.controlId, e);
  }

  const docMap = new Map<string, { hasPolicy: boolean; hasProcedure: boolean }>();
  const policyTypes = new Set(["policy", "plan", "narrative"]);
  for (const link of docLinks) {
    if (!link.controlId) continue;
    const d = docMap.get(link.controlId) ?? { hasPolicy: false, hasProcedure: false };
    if (policyTypes.has(link.docType)) d.hasPolicy = true;
    if (link.docType === "procedure") d.hasProcedure = true;
    docMap.set(link.controlId, d);
  }

  const sspSet = new Set<string>();
  for (const m of sspMappings) {
    if (m.controlDbId && m.narrative && m.narrative.trim().length > 20) {
      sspSet.add(m.controlDbId);
    }
  }

  const monitoringMap = new Map<string, { exists: boolean; isCurrent: boolean }>();
  for (const item of monitoringItems) {
    if (!item.controlRef) continue;
    const mon = monitoringMap.get(item.controlRef) ?? { exists: false, isCurrent: false };
    mon.exists = true;
    if (item.status === "current") mon.isCurrent = true;
    monitoringMap.set(item.controlRef, mon);
  }

  const poamSet = new Set<string>(
    openPoams
      .map((p) => p.linkedControlId)
      .filter((id): id is string => id !== null)
  );

  return { evidenceMap, docMap, sspSet, monitoringMap, poamSet };
}

function calcConfidence(signals: {
  intakeAnswer: string;
  hasEvidence: boolean;
  hasApprovedEvidence: boolean;
  approvedEvidenceCount: number;
  hasSsp: boolean;
  hasPolicy: boolean;
  hasProcedure: boolean;
  hasMonitoring: boolean;
  monitoringCurrent: boolean;
  hasOpenPoam: boolean;
}): number {
  let score = 0;
  if (signals.intakeAnswer === "yes") score += 25;
  else if (signals.intakeAnswer === "partial") score += 12;
  if (signals.hasApprovedEvidence) score += 20;
  else if (signals.hasEvidence) score += 8;
  if (signals.hasSsp) score += 15;
  if (signals.hasPolicy) score += 8;
  if (signals.hasProcedure) score += 7;
  if (signals.monitoringCurrent) score += 10;
  else if (signals.hasMonitoring) score += 5;
  if (!signals.hasOpenPoam) score += 5;
  if (signals.approvedEvidenceCount > 1) score += Math.min(2, signals.approvedEvidenceCount - 1);
  return Math.min(100, Math.round(score));
}

type SuggestedResult = {
  suggestedStatus:
    | "not_started"
    | "in_progress"
    | "needs_evidence"
    | "needs_documentation"
    | "needs_validation"
    | "candidate_for_implemented";
  findingType:
    | "missing_evidence"
    | "missing_policy"
    | "missing_procedure"
    | "missing_ssp_narrative"
    | "monitoring_gap"
    | "open_poam"
    | "unknown_implementation"
    | "stale_evidence"
    | null;
  severity: "high" | "medium" | "low" | "informational" | null;
  gapDescription: string | null;
  recommendedRemediation: string | null;
};

function applyRules(signals: {
  hasEvidence: boolean;
  hasApprovedEvidence: boolean;
  hasPolicy: boolean;
  hasProcedure: boolean;
  hasSsp: boolean;
  hasOpenPoam: boolean;
  intakeAnswer: string;
}): SuggestedResult {
  const { hasEvidence, hasApprovedEvidence, hasPolicy, hasProcedure, hasSsp, hasOpenPoam, intakeAnswer } = signals;
  const hasAnyDoc = hasPolicy || hasProcedure;
  const isFullySignalled = hasSsp && hasApprovedEvidence && hasAnyDoc && !hasOpenPoam;

  if (isFullySignalled) {
    return {
      suggestedStatus: "candidate_for_implemented",
      findingType: null,
      severity: null,
      gapDescription: null,
      recommendedRemediation: null,
    };
  }

  const hasAnySignal =
    hasEvidence || hasAnyDoc || hasSsp || intakeAnswer === "yes" || intakeAnswer === "partial";

  if (!hasAnySignal) {
    return {
      suggestedStatus: "not_started",
      findingType: "unknown_implementation",
      severity: "high",
      gapDescription:
        "No evidence, policy, procedure, or SSP narrative detected. Control implementation is unknown.",
      recommendedRemediation:
        "Review this control, confirm its implementation status, and upload supporting evidence.",
    };
  }

  if ((intakeAnswer === "yes" || hasSsp) && !hasApprovedEvidence) {
    return {
      suggestedStatus: "needs_evidence",
      findingType: "missing_evidence",
      severity: "medium",
      gapDescription:
        "Control appears to be implemented but no approved evidence exists in the system.",
      recommendedRemediation: "Upload and submit evidence for compliance manager approval.",
    };
  }

  if (hasEvidence && !hasAnyDoc) {
    return {
      suggestedStatus: "needs_documentation",
      findingType: hasPolicy ? "missing_procedure" : "missing_policy",
      severity: "medium",
      gapDescription: "Evidence exists but no policy or procedure is mapped to this control.",
      recommendedRemediation:
        "Upload the applicable policy or procedure and map it to this control.",
    };
  }

  if (hasEvidence && hasAnyDoc && !hasSsp) {
    return {
      suggestedStatus: "needs_validation",
      findingType: "missing_ssp_narrative",
      severity: "low",
      gapDescription:
        "Evidence and documentation exist but no SSP implementation narrative is recorded.",
      recommendedRemediation: "Add an implementation narrative to the SSP for this control.",
    };
  }

  return {
    suggestedStatus: "in_progress",
    findingType: hasOpenPoam ? "open_poam" : null,
    severity: hasOpenPoam ? "medium" : null,
    gapDescription: hasOpenPoam
      ? "An open POA&M item exists for this control limiting its readiness score."
      : null,
    recommendedRemediation: hasOpenPoam
      ? "Remediate the open POA&M item to move toward Candidate for Implemented."
      : null,
  };
}

export async function runAssessmentEngine(
  orgId: string,
  assessmentId: string,
  intakeAnswers: Record<string, string>
): Promise<void> {
  const controls = await db
    .select({
      id: controlsTable.id,
      controlId: controlsTable.controlId,
      title: controlsTable.title,
    })
    .from(controlsTable)
    .orderBy(controlsTable.controlId);

  const signals = await batchQuerySignals(orgId);

  const findingsToInsert: (typeof autoFindingsTable.$inferInsert)[] = [];
  const packGaps = new Map<string, string[]>();

  for (const ctrl of controls) {
    const packId = getPackForControl(ctrl.controlId);
    const intakeAnswer = getIntakeAnswerForPack(packId, intakeAnswers);

    const evidence = signals.evidenceMap.get(ctrl.id) ?? { count: 0, approvedCount: 0 };
    const docs = signals.docMap.get(ctrl.id) ?? { hasPolicy: false, hasProcedure: false };
    const hasSsp = signals.sspSet.has(ctrl.id);
    const monitoring = signals.monitoringMap.get(ctrl.controlId) ?? {
      exists: false,
      isCurrent: false,
    };
    const hasOpenPoam = signals.poamSet.has(ctrl.id);

    const hasEvidence = evidence.count > 0;
    const hasApprovedEvidence = evidence.approvedCount > 0;

    const confidence = calcConfidence({
      intakeAnswer,
      hasEvidence,
      hasApprovedEvidence,
      approvedEvidenceCount: evidence.approvedCount,
      hasSsp,
      hasPolicy: docs.hasPolicy,
      hasProcedure: docs.hasProcedure,
      hasMonitoring: monitoring.exists,
      monitoringCurrent: monitoring.isCurrent,
      hasOpenPoam,
    });

    const result = applyRules({
      hasEvidence,
      hasApprovedEvidence,
      hasPolicy: docs.hasPolicy,
      hasProcedure: docs.hasProcedure,
      hasSsp,
      hasOpenPoam,
      intakeAnswer,
    });

    if (result.suggestedStatus !== "candidate_for_implemented") {
      const existing = packGaps.get(packId) ?? [];
      existing.push(ctrl.controlId);
      packGaps.set(packId, existing);
    }

    findingsToInsert.push({
      id: randomUUID(),
      assessmentId,
      controlId: ctrl.id,
      packId,
      hasEvidence,
      hasApprovedEvidence,
      hasPolicy: docs.hasPolicy,
      hasProcedure: docs.hasProcedure,
      hasSspNarrative: hasSsp,
      hasMonitoringItem: monitoring.exists,
      monitoringIsCurrent: monitoring.isCurrent,
      hasOpenPoam,
      evidenceCount: evidence.count,
      approvedEvidenceCount: evidence.approvedCount,
      intakeAnswer,
      suggestedStatus: result.suggestedStatus,
      confidenceScore: confidence,
      findingType: result.findingType ?? undefined,
      severity: result.severity ?? undefined,
      gapDescription: result.gapDescription,
      recommendedRemediation: result.recommendedRemediation,
      updatedAt: new Date(),
    });
  }

  const CHUNK = 50;
  for (let i = 0; i < findingsToInsert.length; i += CHUNK) {
    await db.insert(autoFindingsTable).values(findingsToInsert.slice(i, i + CHUNK));
  }

  const evidenceRequests: (typeof autoEvidenceRequestsTable.$inferInsert)[] = [];
  for (const [packId, controlRefs] of packGaps.entries()) {
    if (controlRefs.length === 0) continue;
    const pack = ASSESSMENT_PACKS.find((p) => p.id === packId);
    if (!pack) continue;
    evidenceRequests.push({
      id: randomUUID(),
      assessmentId,
      packId,
      packName: pack.name,
      title: `Provide ${pack.shortName} evidence — ${controlRefs.length} control gap${controlRefs.length === 1 ? "" : "s"} detected`,
      controlRefs,
      evidenceType: pack.evidenceType,
      instructions: pack.evidenceInstructions,
      suggestedFilename: `${packId.replace(/_/g, "-")}_Evidence_YYYY-MM-DD`,
      status: "open",
      updatedAt: new Date(),
    });
  }
  if (evidenceRequests.length > 0) {
    await db.insert(autoEvidenceRequestsTable).values(evidenceRequests);
  }

  const total = findingsToInsert.length;
  const candidateCount = findingsToInsert.filter(
    (f) => f.suggestedStatus === "candidate_for_implemented"
  ).length;
  const needsEvidenceCount = findingsToInsert.filter(
    (f) => f.suggestedStatus === "needs_evidence"
  ).length;
  const needsDocCount = findingsToInsert.filter(
    (f) => f.suggestedStatus === "needs_documentation"
  ).length;
  const notStartedCount = findingsToInsert.filter(
    (f) => f.suggestedStatus === "not_started"
  ).length;
  const inProgressCount = findingsToInsert.filter(
    (f) => f.suggestedStatus === "in_progress"
  ).length;
  const needsValidationCount = findingsToInsert.filter(
    (f) => f.suggestedStatus === "needs_validation"
  ).length;

  const projectedScore = Math.round(
    candidateCount +
      (inProgressCount + needsEvidenceCount + needsDocCount + needsValidationCount) * 0.5
  );

  const avgConfidence =
    total > 0
      ? Math.round(findingsToInsert.reduce((s, f) => s + (f.confidenceScore ?? 0), 0) / total)
      : 0;

  await db
    .update(autoAssessmentsTable)
    .set({
      status: "complete",
      projectedScore,
      maxScore: 110,
      confidenceAvg: avgConfidence,
      totalControls: total,
      candidateCount,
      needsEvidenceCount,
      needsDocCount,
      notStartedCount,
      inProgressCount,
      completedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(autoAssessmentsTable.id, assessmentId));
}
