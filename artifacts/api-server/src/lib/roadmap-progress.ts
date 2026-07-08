// Server-only roadmap progress computation. This is the single source of truth
// for "how much of this priority action is done" so the list page, detail page,
// PATCH progress gating, and dashboard never disagree with each other.

export type ProcedureStepStatus =
  | "not_started"
  | "in_progress"
  | "complete"
  | "blocked"
  | "not_applicable";

export type RoadmapStatus =
  | "not_started"
  | "in_progress"
  | "evidence_needed"
  | "ready_for_review"
  | "complete"
  | "blocked";

export type RoadmapResult =
  | "passed"
  | "passed_with_exceptions"
  | "failed"
  | "needs_follow_up"
  | null;

export type StageState = "not_started" | "in_progress" | "complete" | "blocked";

export interface RoadmapProgressInput {
  understandAckAt: Date | null;
  requiredStepIds: string[];
  stepStatusById: Map<string, ProcedureStepStatus>;
  requiredEvidenceItemIds: string[];
  linkedEvidenceItemIds: Set<string>;
  requiredChecklistItemIds: string[];
  completedChecklistItemIds: Set<string>;
  validatedAt: Date | null;
  result: RoadmapResult;
  status: RoadmapStatus;
}

export interface RoadmapProgressResult {
  percent: number;
  doneUnits: number;
  totalUnits: number;
  missing: string[];
  stages: {
    understand: StageState;
    steps: StageState;
    evidence: StageState;
    validate: StageState;
    review: StageState;
  };
  steps: { total: number; completed: number };
  evidence: { total: number; completed: number };
  checklist: { total: number; completed: number };
  readyToComplete: boolean;
}

const STEP_DONE_STATUSES = new Set<ProcedureStepStatus>([
  "complete",
  "not_applicable",
]);

export function computeRoadmapProgress(
  input: RoadmapProgressInput
): RoadmapProgressResult {
  const {
    understandAckAt,
    requiredStepIds,
    stepStatusById,
    requiredEvidenceItemIds,
    linkedEvidenceItemIds,
    requiredChecklistItemIds,
    completedChecklistItemIds,
    validatedAt,
    result,
    status,
  } = input;

  const stepsCompleted = requiredStepIds.filter((id) =>
    STEP_DONE_STATUSES.has(stepStatusById.get(id) ?? "not_started")
  ).length;
  const evidenceCompleted = requiredEvidenceItemIds.filter((id) =>
    linkedEvidenceItemIds.has(id)
  ).length;
  const checklistCompleted = requiredChecklistItemIds.filter((id) =>
    completedChecklistItemIds.has(id)
  ).length;

  const understandDone = understandAckAt !== null;
  const validateDone = validatedAt !== null && result !== null;

  const totalUnits =
    1 + // understand
    requiredStepIds.length +
    requiredEvidenceItemIds.length +
    requiredChecklistItemIds.length +
    1; // validate

  const doneUnits =
    (understandDone ? 1 : 0) +
    stepsCompleted +
    evidenceCompleted +
    checklistCompleted +
    (validateDone ? 1 : 0);

  const percent =
    totalUnits === 0 ? 0 : Math.round((doneUnits / totalUnits) * 100);

  const missing: string[] = [];
  if (!understandDone) missing.push("Overview not yet acknowledged");
  const missingSteps = requiredStepIds.length - stepsCompleted;
  if (missingSteps > 0)
    missing.push(
      `${missingSteps} required step${missingSteps === 1 ? "" : "s"} not complete`
    );
  const missingEvidence = requiredEvidenceItemIds.length - evidenceCompleted;
  if (missingEvidence > 0)
    missing.push(
      `${missingEvidence} required evidence item${
        missingEvidence === 1 ? "" : "s"
      } not uploaded/linked`
    );
  const missingChecklist =
    requiredChecklistItemIds.length - checklistCompleted;
  if (missingChecklist > 0)
    missing.push(
      `${missingChecklist} required checklist item${
        missingChecklist === 1 ? "" : "s"
      } not complete`
    );
  if (!validateDone) missing.push("Validation not completed");

  const stepsStage: StageState =
    requiredStepIds.length === 0
      ? "complete"
      : stepsCompleted === requiredStepIds.length
        ? "complete"
        : stepsCompleted > 0
          ? "in_progress"
          : "not_started";

  const evidenceStage: StageState =
    requiredEvidenceItemIds.length === 0
      ? "complete"
      : evidenceCompleted === requiredEvidenceItemIds.length
        ? "complete"
        : evidenceCompleted > 0
          ? "in_progress"
          : "not_started";

  const validateStage: StageState = validateDone
    ? result === "failed"
      ? "blocked"
      : "complete"
    : "not_started";

  const checklistStage: StageState =
    requiredChecklistItemIds.length === 0
      ? "complete"
      : checklistCompleted === requiredChecklistItemIds.length
        ? "complete"
        : checklistCompleted > 0
          ? "in_progress"
          : "not_started";

  const priorStagesComplete =
    understandDone &&
    stepsStage === "complete" &&
    evidenceStage === "complete" &&
    checklistStage === "complete" &&
    validateStage === "complete";

  const reviewStage: StageState =
    status === "complete"
      ? "complete"
      : status === "ready_for_review"
        ? "in_progress"
        : status === "blocked"
          ? "blocked"
          : priorStagesComplete
            ? "in_progress"
            : "not_started";

  return {
    percent,
    doneUnits,
    totalUnits,
    missing,
    stages: {
      understand: understandDone ? "complete" : "not_started",
      steps: stepsStage,
      evidence: evidenceStage,
      validate: validateStage,
      review: reviewStage,
    },
    steps: { total: requiredStepIds.length, completed: stepsCompleted },
    evidence: {
      total: requiredEvidenceItemIds.length,
      completed: evidenceCompleted,
    },
    checklist: {
      total: requiredChecklistItemIds.length,
      completed: checklistCompleted,
    },
    readyToComplete: priorStagesComplete,
  };
}

export function nextStepFor(progress: RoadmapProgressResult): {
  label: string;
  tab: "overview" | "steps" | "evidence" | "validate" | "checklist";
} {
  if (progress.stages.understand !== "complete") {
    return { label: "Mark Overview Complete", tab: "overview" };
  }
  if (progress.stages.steps !== "complete") {
    return { label: "Go to First Incomplete Step", tab: "steps" };
  }
  if (progress.stages.evidence !== "complete") {
    return { label: "Upload Missing Evidence", tab: "evidence" };
  }
  if (progress.checklist.total > progress.checklist.completed) {
    return { label: "Complete Remaining Checklist Items", tab: "checklist" };
  }
  if (progress.stages.validate !== "complete") {
    return { label: "Record Validation Result", tab: "validate" };
  }
  return { label: "Mark Ready for Review", tab: "overview" };
}
