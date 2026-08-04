/**
 * CMMC Level 1 Annual Self-Assessment — API hooks
 *
 * Hand-written React Query hooks for the /api/l1-assessment endpoints.
 * These are not auto-generated because the L1 assessment routes were added
 * after the last OpenAPI codegen run.
 */
import { useMutation, useQuery } from "@tanstack/react-query";
import type {
  UseMutationOptions,
  UseQueryOptions,
} from "@tanstack/react-query";

// ── Types ──────────────────────────────────────────────────────────────────

export type L1FindingValue = "met" | "not_met" | "not_applicable" | "not_reviewed";
export type L1ObjectiveResult = "satisfied" | "other_than_satisfied" | "not_applicable" | "not_reviewed";
export type L1AssessmentStatus = "in_progress" | "submitted" | "affirmed" | "locked";
export type L1WorkflowState =
  | "READY_FOR_MANAGEMENT_REVIEW"
  | "CHANGES_REQUESTED"
  | "READY_FOR_SPRS"
  | "PENDING_AFFIRMATION"
  | "FINAL_LEVEL_1_SELF"
  | null;

export interface L1Assessment {
  id: string;
  organizationId: string;
  assessmentYear: number;
  scopeName: string;
  title: string;
  description: string | null;
  status: L1AssessmentStatus;
  workflowState: L1WorkflowState;
  isReadOnly: boolean;
  affirmingOfficialName: string | null;
  affirmingOfficialTitle: string | null;
  affirmingOfficialId: string | null;
  submittedAt: string | null;
  submittedById: string | null;
  affirmedAt: string | null;
  createdById: string | null;
  createdAt: string;
  updatedAt: string;
  snapshotMetadata: string | null;
}

export interface L1Requirement {
  id: string;
  assessmentId: string;
  requirementId: string;
  canonicalKey: string;
  requirementTitle: string;
  finding: L1FindingValue;
  implementationNarrative: string | null;
  assessorNotes: string | null;
  naJustification: string | null;
  sortOrder: number;
  lastUpdatedById: string | null;
  createdAt: string;
  updatedAt: string;
  objectives?: L1Objective[];
}

export interface L1Objective {
  id: string;
  assessmentRequirementId: string;
  objectiveText: string;
  result: L1ObjectiveResult;
  notes: string | null;
  sortOrder: number;
  lastUpdatedById: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface L1EvidenceLink {
  id: string;
  assessmentId: string;
  assessmentRequirementId: string | null;
  evidenceItemId: string | null;
  evidenceDescription: string | null;
  assessmentUse: "examine" | "interview" | "test";
  qualification: "directly_applicable" | "partially_applicable" | "supplementary";
  fileKey: string | null;
  fileName: string | null;
  notes: string | null;
  linkedById: string | null;
  linkedAt: string;
  createdAt: string;
}

export interface L1FarClauseResult {
  clause: string;
  label: string;
  result: L1FindingValue;
  requirementIds: string[];
  andGate: boolean;
  findings: Array<{ requirementId: string; finding: L1FindingValue }>;
}

export interface L1ValidationError {
  code: string;
  message: string;
  severity: "error" | "warning";
}

export interface L1SprsWorksheet {
  organizationName: string;
  organizationId: string;
  assessmentYear: number;
  assessmentTitle: string;
  assessmentScopeName: string;
  assessmentStatus: L1AssessmentStatus;
  workflowState: L1WorkflowState;
  affirmingOfficialName: string | null;
  affirmingOfficialTitle: string | null;
  sprsEnteredBy: string | null;
  sprsEntryDate: string | null;
  sprsReference: string | null;
  sprsEvidence: string | null;
  sprsEnteredAt: string | null;
  requirementsSummary: {
    total: number;
    met: number;
    notMet: number;
    notApplicable: number;
    notReviewed: number;
  };
  farRollup: {
    clauses: L1FarClauseResult[];
    summary: { total: number; met: number; notMet: number; notApplicable: number };
  };
  requirementFindings: Array<{
    requirementId: string;
    canonicalKey: string;
    requirementTitle: string;
    finding: L1FindingValue;
    implementationNarrative: string | null;
    naJustification: string | null;
  }>;
}

// ── Fetch helper ───────────────────────────────────────────────────────────

function getHeaders(orgId: string): HeadersInit {
  const token = localStorage.getItem("auth_token");
  return {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    "X-Organization-ID": orgId,
  };
}

async function l1Fetch<T>(
  path: string,
  orgId: string,
  options?: RequestInit
): Promise<T> {
  const res = await fetch(path, {
    ...options,
    headers: { ...getHeaders(orgId), ...(options?.headers ?? {}) },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as any).error ?? `HTTP ${res.status}`);
  }
  return res.json();
}

// ── Query hooks ────────────────────────────────────────────────────────────

/** GET /api/l1-assessment — active/latest assessment for org */
export function useGetL1Assessment(
  orgId: string | undefined,
  options?: UseQueryOptions<{ assessment: L1Assessment | null }>
) {
  return useQuery<{ assessment: L1Assessment | null }>({
    queryKey: ["l1-assessment", orgId],
    enabled: !!orgId,
    staleTime: 30000,
    ...options,
    queryFn: () => l1Fetch(`/api/l1-assessment`, orgId!),
  });
}

/** GET /api/l1-assessment/history — all assessments for org */
export function useGetL1History(
  orgId: string | undefined,
  options?: UseQueryOptions<{ assessments: (L1Assessment & { isReadOnly: boolean })[] }>
) {
  return useQuery<{ assessments: (L1Assessment & { isReadOnly: boolean })[] }>({
    queryKey: ["l1-assessment-history", orgId],
    enabled: !!orgId,
    staleTime: 30000,
    ...options,
    queryFn: () => l1Fetch(`/api/l1-assessment/history`, orgId!),
  });
}

/** GET /api/l1-assessment/:id — full assessment detail */
export function useGetL1AssessmentDetail(
  id: string | undefined,
  orgId: string | undefined,
  options?: UseQueryOptions<{
    assessment: L1Assessment;
    requirements: L1Requirement[];
    evidenceLinks: L1EvidenceLink[];
    farRollup: L1FarClauseResult[];
  }>
) {
  return useQuery({
    queryKey: ["l1-assessment-detail", id, orgId],
    enabled: !!id && !!orgId,
    staleTime: 15000,
    ...options,
    queryFn: () =>
      l1Fetch<{
        assessment: L1Assessment;
        requirements: L1Requirement[];
        evidenceLinks: L1EvidenceLink[];
        farRollup: L1FarClauseResult[];
      }>(`/api/l1-assessment/${id}`, orgId!),
  });
}

/** GET /api/l1-assessment/:id/far-rollup */
export function useGetL1FarRollup(
  id: string | undefined,
  orgId: string | undefined,
  options?: UseQueryOptions<{
    assessmentId: string;
    assessmentYear: number;
    clauses: L1FarClauseResult[];
    summary: { total: number; met: number; notMet: number; notApplicable: number; notReviewed: number; score: number };
  }>
) {
  return useQuery({
    queryKey: ["l1-assessment-far-rollup", id, orgId],
    enabled: !!id && !!orgId,
    staleTime: 15000,
    ...options,
    queryFn: () =>
      l1Fetch<{
        assessmentId: string;
        assessmentYear: number;
        clauses: L1FarClauseResult[];
        summary: { total: number; met: number; notMet: number; notApplicable: number; notReviewed: number; score: number };
      }>(`/api/l1-assessment/${id}/far-rollup`, orgId!),
  });
}

/** GET /api/l1-assessment/:id/sprs-worksheet */
export function useGetL1SprsWorksheet(
  id: string | undefined,
  orgId: string | undefined,
  options?: UseQueryOptions<{ worksheet: L1SprsWorksheet }>
) {
  return useQuery<{ worksheet: L1SprsWorksheet }>({
    queryKey: ["l1-assessment-sprs-worksheet", id, orgId],
    enabled: !!id && !!orgId,
    staleTime: 30000,
    ...options,
    queryFn: () => l1Fetch(`/api/l1-assessment/${id}/sprs-worksheet`, orgId!),
  });
}

// ── Mutation hooks ─────────────────────────────────────────────────────────

/** POST /api/l1-assessment — start a new annual cycle */
export function useCreateL1Assessment(
  orgId: string,
  options?: UseMutationOptions<
    { assessment: L1Assessment },
    Error,
    { assessmentYear: number; title: string; scopeName?: string; description?: string }
  >
) {
  return useMutation({
    ...options,
    mutationFn: (body) =>
      l1Fetch<{ assessment: L1Assessment }>(`/api/l1-assessment`, orgId, {
        method: "POST",
        body: JSON.stringify(body),
      }),
  });
}

/** PATCH /api/l1-assessment/:id — update scope/metadata */
export function useUpdateL1Assessment(
  id: string,
  orgId: string,
  options?: UseMutationOptions<
    { assessment: L1Assessment },
    Error,
    {
      title?: string;
      description?: string;
      scopeName?: string;
      affirmingOfficialName?: string;
      affirmingOfficialTitle?: string;
    }
  >
) {
  return useMutation({
    ...options,
    mutationFn: (body) =>
      l1Fetch<{ assessment: L1Assessment }>(`/api/l1-assessment/${id}`, orgId, {
        method: "PATCH",
        body: JSON.stringify(body),
      }),
  });
}

/** PATCH /api/l1-assessment/:id/requirements/:reqId */
export function useUpdateL1Requirement(
  assessmentId: string,
  reqId: string,
  orgId: string,
  options?: UseMutationOptions<
    { requirement: L1Requirement },
    Error,
    {
      finding?: L1FindingValue;
      implementationNarrative?: string;
      assessorNotes?: string;
      naJustification?: string;
    }
  >
) {
  return useMutation({
    ...options,
    mutationFn: (body) =>
      l1Fetch<{ requirement: L1Requirement }>(
        `/api/l1-assessment/${assessmentId}/requirements/${reqId}`,
        orgId,
        { method: "PATCH", body: JSON.stringify(body) }
      ),
  });
}

/** POST /api/l1-assessment/:id/requirements/:reqId/objectives */
export function useCreateL1Objective(
  assessmentId: string,
  reqId: string,
  orgId: string,
  options?: UseMutationOptions<
    { objective: L1Objective },
    Error,
    { objectiveText: string; result?: L1ObjectiveResult; notes?: string; sortOrder?: number }
  >
) {
  return useMutation({
    ...options,
    mutationFn: (body) =>
      l1Fetch<{ objective: L1Objective }>(
        `/api/l1-assessment/${assessmentId}/requirements/${reqId}/objectives`,
        orgId,
        { method: "POST", body: JSON.stringify(body) }
      ),
  });
}

/** PATCH /api/l1-assessment/:id/requirements/:reqId/objectives/:objId */
export function useUpdateL1Objective(
  assessmentId: string,
  reqId: string,
  objId: string,
  orgId: string,
  options?: UseMutationOptions<
    { objective: L1Objective },
    Error,
    { objectiveText?: string; result?: L1ObjectiveResult; notes?: string; sortOrder?: number }
  >
) {
  return useMutation({
    ...options,
    mutationFn: (body) =>
      l1Fetch<{ objective: L1Objective }>(
        `/api/l1-assessment/${assessmentId}/requirements/${reqId}/objectives/${objId}`,
        orgId,
        { method: "PATCH", body: JSON.stringify(body) }
      ),
  });
}

/** DELETE /api/l1-assessment/:id/requirements/:reqId/objectives/:objId */
export function useDeleteL1Objective(
  assessmentId: string,
  reqId: string,
  orgId: string,
  options?: UseMutationOptions<{ success: boolean }, Error, { objId: string }>
) {
  return useMutation({
    ...options,
    mutationFn: ({ objId }) =>
      l1Fetch<{ success: boolean }>(
        `/api/l1-assessment/${assessmentId}/requirements/${reqId}/objectives/${objId}`,
        orgId,
        { method: "DELETE" }
      ),
  });
}

/** POST /api/l1-assessment/:id/evidence */
export function useLinkL1Evidence(
  assessmentId: string,
  orgId: string,
  options?: UseMutationOptions<
    { evidenceLink: L1EvidenceLink },
    Error,
    {
      assessmentRequirementId?: string;
      evidenceItemId?: string;
      evidenceDescription?: string;
      assessmentUse?: "examine" | "interview" | "test";
      qualification?: "directly_applicable" | "partially_applicable" | "supplementary";
      notes?: string;
    }
  >
) {
  return useMutation({
    ...options,
    mutationFn: (body) =>
      l1Fetch<{ evidenceLink: L1EvidenceLink }>(
        `/api/l1-assessment/${assessmentId}/evidence`,
        orgId,
        { method: "POST", body: JSON.stringify(body) }
      ),
  });
}

/** DELETE /api/l1-assessment/:id/evidence/:linkId */
export function useDeleteL1Evidence(
  assessmentId: string,
  orgId: string,
  options?: UseMutationOptions<{ success: boolean }, Error, { linkId: string }>
) {
  return useMutation({
    ...options,
    mutationFn: ({ linkId }) =>
      l1Fetch<{ success: boolean }>(
        `/api/l1-assessment/${assessmentId}/evidence/${linkId}`,
        orgId,
        { method: "DELETE" }
      ),
  });
}

/** POST /api/l1-assessment/:id/validate */
export function useValidateL1Assessment(
  assessmentId: string,
  orgId: string,
  options?: UseMutationOptions<{
    passed: boolean;
    errors: L1ValidationError[];
    summary: {
      blockingErrors: number;
      warnings: number;
      requirementsReviewed: number;
      requirementsTotal: number;
      farClausesMet: number;
      farClausesTotal: number;
    };
  }, Error, void>
) {
  return useMutation({
    ...options,
    mutationFn: () =>
      l1Fetch(`/api/l1-assessment/${assessmentId}/validate`, orgId, { method: "POST" }),
  });
}

/** POST /api/l1-assessment/:id/submit-for-review */
export function useSubmitL1ForReview(
  assessmentId: string,
  orgId: string,
  options?: UseMutationOptions<{ success: boolean; workflowState: string }, Error, void>
) {
  return useMutation({
    ...options,
    mutationFn: () =>
      l1Fetch(`/api/l1-assessment/${assessmentId}/submit-for-review`, orgId, {
        method: "POST",
      }),
  });
}

/** POST /api/l1-assessment/:id/approve-for-sprs */
export function useApproveL1ForSprs(
  assessmentId: string,
  orgId: string,
  options?: UseMutationOptions<
    { success: boolean; workflowState: string },
    Error,
    { reviewerNotes?: string }
  >
) {
  return useMutation({
    ...options,
    mutationFn: (body) =>
      l1Fetch(`/api/l1-assessment/${assessmentId}/approve-for-sprs`, orgId, {
        method: "POST",
        body: JSON.stringify(body),
      }),
  });
}

/** POST /api/l1-assessment/:id/request-changes */
export function useRequestL1Changes(
  assessmentId: string,
  orgId: string,
  options?: UseMutationOptions<
    { success: boolean; workflowState: string },
    Error,
    { comments: string }
  >
) {
  return useMutation({
    ...options,
    mutationFn: (body) =>
      l1Fetch(`/api/l1-assessment/${assessmentId}/request-changes`, orgId, {
        method: "POST",
        body: JSON.stringify(body),
      }),
  });
}

/** POST /api/l1-assessment/:id/mark-entered-sprs */
export function useMarkL1EnteredSprs(
  assessmentId: string,
  orgId: string,
  options?: UseMutationOptions<
    { success: boolean; workflowState: string },
    Error,
    { submittedBy: string; entryDate: string; reference: string; evidence?: string }
  >
) {
  return useMutation({
    ...options,
    mutationFn: (body) =>
      l1Fetch(`/api/l1-assessment/${assessmentId}/mark-entered-sprs`, orgId, {
        method: "POST",
        body: JSON.stringify(body),
      }),
  });
}

/** POST /api/l1-assessment/:id/affirm */
export function useAffirmL1Assessment(
  assessmentId: string,
  orgId: string,
  options?: UseMutationOptions<
    { success: boolean; workflowState: string; expirationDate: string },
    Error,
    {
      officialName: string;
      officialTitle: string;
      officialEmail?: string;
      affirmationDate: string;
      cmmcUid?: string;
      statusDate?: string;
    }
  >
) {
  return useMutation({
    ...options,
    mutationFn: (body) =>
      l1Fetch(`/api/l1-assessment/${assessmentId}/affirm`, orgId, {
        method: "POST",
        body: JSON.stringify(body),
      }),
  });
}

/** POST /api/l1-assessment/:id/finalize — lock the assessment */
export function useFinalizeL1Assessment(
  assessmentId: string,
  orgId: string,
  options?: UseMutationOptions<{ success: boolean }, Error, void>
) {
  return useMutation({
    ...options,
    mutationFn: () =>
      l1Fetch(`/api/l1-assessment/${assessmentId}/finalize`, orgId, {
        method: "POST",
      }),
  });
}
