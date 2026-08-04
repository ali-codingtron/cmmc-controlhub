/**
 * L1 Annual Self-Assessment — Workbench
 *
 * Lists all 17 requirements grouped by domain, plus FAR Roll-Up tab and
 * validation gate. Entry point for the full assessment workflow.
 */
import { useState } from "react";
import { Link, useLocation } from "wouter";
import {
  Shield, ChevronLeft, ChevronRight, CheckCircle2, XCircle, CircleDot,
  AlertTriangle, Lock, FileCheck, BarChart3, RefreshCcw, Users, ClipboardList,
  Loader2, CheckSquare, AlertCircle, Info, Clock, Send,
} from "lucide-react";
import { useOrg } from "@/context/OrgContext";
import { useAuth } from "@/lib/auth";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetL1AssessmentDetail,
  useGetL1FarRollup,
  useValidateL1Assessment,
  useSubmitL1ForReview,
  useApproveL1ForSprs,
  useRequestL1Changes,
  useFinalizeL1Assessment,
} from "@workspace/api-client-react";
import { cn } from "@/lib/utils";
import type { L1FindingValue, L1FarClauseResult, L1ValidationError } from "@workspace/api-client-react";

// ── Constants ─────────────────────────────────────────────────────────────────

const DOMAIN_LABELS: Record<string, string> = {
  "AC": "Access Control",
  "IA": "Identification & Authentication",
  "MP": "Media Protection",
  "PE": "Physical Protection",
  "SC": "System & Communications Protection",
  "SI": "System & Information Integrity",
};

// ── Badge helpers ─────────────────────────────────────────────────────────────

function FindingBadge({ finding }: { finding: L1FindingValue }) {
  switch (finding) {
    case "met": return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-100 text-emerald-700 border border-emerald-200 shrink-0">
        <CheckCircle2 className="h-3 w-3" />MET
      </span>
    );
    case "not_met": return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-red-100 text-red-700 border border-red-200 shrink-0">
        <XCircle className="h-3 w-3" />NOT MET
      </span>
    );
    case "not_applicable": return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-slate-100 text-slate-600 border border-slate-200 shrink-0">
        N/A
      </span>
    );
    default: return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-gray-100 text-gray-500 border border-gray-200 shrink-0">
        <CircleDot className="h-3 w-3" />NOT YET
      </span>
    );
  }
}

function FarResultBadge({ result }: { result: L1FindingValue }) {
  switch (result) {
    case "met": return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-700 border border-emerald-200">SATISFIED</span>;
    case "not_met": return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-100 text-red-700 border border-red-200">NOT SATISFIED</span>;
    case "not_applicable": return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-600 border border-slate-200">N/A</span>;
    default: return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-gray-100 text-gray-500 border border-gray-200">NOT REVIEWED</span>;
  }
}

// ── FAR mapping chip ─────────────────────────────────────────────────────────

const FAR_MAPPING: Record<string, string> = {
  "AC.L1-3.1.1":  "(i)",
  "AC.L1-3.1.2":  "(ii)",
  "AC.L1-3.1.20": "(iii)",
  "AC.L1-3.1.22": "(iv)",
  "IA.L1-3.5.1":  "(v)",
  "IA.L1-3.5.2":  "(vi)",
  "MP.L1-3.8.3":  "(vii)",
  "PE.L1-3.10.1": "(viii)",
  "PE.L1-3.10.3": "(ix)",
  "PE.L1-3.10.4": "(ix)",
  "PE.L1-3.10.5": "(ix)",
  "SC.L1-3.13.1": "(x)",
  "SC.L1-3.13.5": "(xi)",
  "SI.L1-3.14.1": "(xii)",
  "SI.L1-3.14.2": "(xiii)",
  "SI.L1-3.14.4": "(xiv)",
  "SI.L1-3.14.5": "(xv)",
};

type Tab = "workbench" | "far" | "validation" | "review";

export default function L1AssessmentWorkbench({ id }: { id: string }) {
  const [, navigate] = useLocation();
  const [location] = useLocation();
  const { activeOrg } = useOrg();
  const { user } = useAuth();
  const orgId = activeOrg?.id ?? "";
  const qc = useQueryClient();
  const isAdmin = user?.role === "admin";
  const effectiveOrgRole = isAdmin ? "admin" : (activeOrg?.role ?? user?.role ?? "");
  const canAdmin = isAdmin || ["org_admin"].includes(effectiveOrgRole);

  // Determine active tab from URL query
  const urlParams = new URLSearchParams(location.split("?")[1] ?? "");
  const [activeTab, setActiveTab] = useState<Tab>((urlParams.get("tab") as Tab) ?? "workbench");

  const [expandedClause, setExpandedClause] = useState<string | null>(null);
  const [showValidation, setShowValidation] = useState(false);
  const [validationResult, setValidationResult] = useState<{
    passed: boolean;
    errors: L1ValidationError[];
    summary: { blockingErrors: number; warnings: number; requirementsReviewed: number; requirementsTotal: number; farClausesMet: number; farClausesTotal: number };
  } | null>(null);
  const [showReviewDialog, setShowReviewDialog] = useState<"submit" | "approve" | "changes" | "finalize" | null>(null);
  const [reviewComment, setReviewComment] = useState("");
  const [actionError, setActionError] = useState<string | null>(null);

  const { data, isLoading, refetch } = useGetL1AssessmentDetail(id, orgId);
  const { data: farData, refetch: refetchFar } = useGetL1FarRollup(id, orgId);

  const validateMutation = useValidateL1Assessment(id, orgId);
  const submitMutation = useSubmitL1ForReview(id, orgId);
  const approveMutation = useApproveL1ForSprs(id, orgId);
  const changesMutation = useRequestL1Changes(id, orgId);
  const finalizeMutation = useFinalizeL1Assessment(id, orgId);

  async function runValidation() {
    try {
      const result = await validateMutation.mutateAsync();
      setValidationResult(result as any);
      setShowValidation(true);
    } catch (err: any) {
      setActionError(err.message ?? "Validation failed");
    }
  }

  async function handleSubmitForReview() {
    setActionError(null);
    try {
      await submitMutation.mutateAsync();
      qc.invalidateQueries({ queryKey: ["l1-assessment-detail", id] });
      qc.invalidateQueries({ queryKey: ["l1-assessment", orgId] });
      setShowReviewDialog(null);
      refetch();
    } catch (err: any) {
      setActionError(err.message ?? "Failed to submit for review");
    }
  }

  async function handleApprove() {
    setActionError(null);
    try {
      await approveMutation.mutateAsync({ reviewerNotes: reviewComment || undefined });
      qc.invalidateQueries({ queryKey: ["l1-assessment-detail", id] });
      setShowReviewDialog(null);
      setReviewComment("");
      refetch();
    } catch (err: any) {
      setActionError(err.message ?? "Failed to approve");
    }
  }

  async function handleRequestChanges() {
    if (!reviewComment.trim()) { setActionError("Comments are required when requesting changes."); return; }
    setActionError(null);
    try {
      await changesMutation.mutateAsync({ comments: reviewComment });
      qc.invalidateQueries({ queryKey: ["l1-assessment-detail", id] });
      setShowReviewDialog(null);
      setReviewComment("");
      refetch();
    } catch (err: any) {
      setActionError(err.message ?? "Failed to request changes");
    }
  }

  async function handleFinalize() {
    setActionError(null);
    try {
      await finalizeMutation.mutateAsync();
      qc.invalidateQueries({ queryKey: ["l1-assessment-detail", id] });
      setShowReviewDialog(null);
      refetch();
    } catch (err: any) {
      setActionError(err.message ?? "Failed to finalize");
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-32 text-muted-foreground">
        <Loader2 className="h-6 w-6 animate-spin mr-2" /> Loading assessment…
      </div>
    );
  }

  if (!data) {
    return <div className="p-6 text-center text-muted-foreground">Assessment not found.</div>;
  }

  const { assessment, requirements, evidenceLinks, farRollup } = data;
  const isReadOnly = assessment.isReadOnly;
  const wf = assessment.workflowState;

  // Group requirements by domain (first 2 letters of requirementId)
  const domainGroups = requirements.reduce<Record<string, typeof requirements>>((acc, req) => {
    const domain = req.requirementId.split(".")[0]?.split("L")[0] ?? "Other";
    acc[domain] = [...(acc[domain] ?? []), req];
    return acc;
  }, {});

  const reviewed = requirements.filter((r) => r.finding !== "not_reviewed").length;
  const metCount = requirements.filter((r) => r.finding === "met").length;
  const notMetCount = requirements.filter((r) => r.finding === "not_met").length;
  const naCount = requirements.filter((r) => r.finding === "not_applicable").length;
  const progress = Math.round((reviewed / Math.max(requirements.length, 1)) * 100);

  const clauseData = farData?.clauses ?? farRollup;
  const farMet = clauseData.filter((c) => c.result === "met").length;

  const tabs: { key: Tab; label: string; icon: React.ReactNode }[] = [
    { key: "workbench", label: "Requirements", icon: <Shield className="h-3.5 w-3.5" /> },
    { key: "far", label: "FAR Roll-Up", icon: <BarChart3 className="h-3.5 w-3.5" /> },
    { key: "review", label: "Management Review", icon: <Users className="h-3.5 w-3.5" /> },
  ];

  const statusLabel = (() => {
    if (isReadOnly) return { label: "Locked", cls: "bg-slate-100 text-slate-700 border-slate-200" };
    if (assessment.status === "affirmed") return { label: "Affirmed", cls: "bg-emerald-50 text-emerald-700 border-emerald-200" };
    if (wf === "READY_FOR_MANAGEMENT_REVIEW") return { label: "Under Review", cls: "bg-purple-50 text-purple-700 border-purple-200" };
    if (wf === "CHANGES_REQUESTED") return { label: "Changes Requested", cls: "bg-amber-50 text-amber-700 border-amber-200" };
    if (wf === "READY_FOR_SPRS") return { label: "Ready for SPRS", cls: "bg-blue-50 text-blue-700 border-blue-200" };
    if (wf === "PENDING_AFFIRMATION") return { label: "Pending Affirmation", cls: "bg-indigo-50 text-indigo-700 border-indigo-200" };
    if (assessment.status === "submitted") return { label: "Submitted", cls: "bg-blue-50 text-blue-700 border-blue-200" };
    return { label: "In Progress", cls: "bg-amber-50 text-amber-700 border-amber-200" };
  })();

  return (
    <div className="space-y-4 max-w-[1200px] mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-4 pb-4 border-b border-border">
        <div className="flex items-center gap-3">
          <Link href="/l1-assessment" className="p-2 rounded-md hover:bg-accent transition-colors">
            <ChevronLeft className="h-5 w-5" />
          </Link>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-lg font-semibold">{assessment.title}</h1>
              <span className={cn("inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold border", statusLabel.cls)}>
                {statusLabel.label}
              </span>
              {isReadOnly && <Lock className="h-3.5 w-3.5 text-muted-foreground" />}
            </div>
            <p className="text-xs text-muted-foreground">{assessment.assessmentYear} · Scope: {assessment.scopeName}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 ml-auto shrink-0 flex-wrap">
          <button onClick={() => { refetch(); refetchFar(); }} className="p-2 rounded-md hover:bg-accent transition-colors" title="Refresh">
            <RefreshCcw className="h-4 w-4" />
          </button>
          {!isReadOnly && (
            <button
              onClick={runValidation}
              disabled={validateMutation.isPending}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md border border-border hover:bg-accent transition-colors"
            >
              {validateMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckSquare className="h-3.5 w-3.5" />}
              Validate
            </button>
          )}
          {!isReadOnly && assessment.status === "in_progress" && wf !== "READY_FOR_MANAGEMENT_REVIEW" && (
            <button
              onClick={() => setShowReviewDialog("submit")}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
            >
              <Send className="h-3.5 w-3.5" /> Submit for Review
            </button>
          )}
          {wf === "READY_FOR_MANAGEMENT_REVIEW" && canAdmin && (
            <div className="flex gap-1">
              <button onClick={() => setShowReviewDialog("approve")} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md bg-emerald-600 text-white hover:bg-emerald-700 transition-colors">
                <CheckCircle2 className="h-3.5 w-3.5" /> Approve
              </button>
              <button onClick={() => setShowReviewDialog("changes")} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md border border-amber-300 bg-amber-50 text-amber-700 hover:bg-amber-100 transition-colors">
                Request Changes
              </button>
            </div>
          )}
          {assessment.status === "affirmed" && !isReadOnly && canAdmin && (
            <button onClick={() => setShowReviewDialog("finalize")} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md bg-slate-700 text-white hover:bg-slate-800 transition-colors">
              <Lock className="h-3.5 w-3.5" /> Lock & Finalize
            </button>
          )}
          <Link href={`/l1-assessment/${id}/sprs`} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md border border-border hover:bg-accent transition-colors">
            <FileCheck className="h-3.5 w-3.5" /> SPRS & Affirm
          </Link>
        </div>
      </div>

      {/* Changes requested banner */}
      {wf === "CHANGES_REQUESTED" && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <strong>Changes requested by reviewer.</strong> Address the feedback and resubmit for review.
        </div>
      )}

      {/* Progress bar */}
      <div className="space-y-1">
        <div className="flex justify-between text-xs text-muted-foreground">
          <span>{reviewed} of {requirements.length} requirements reviewed</span>
          <span className="font-medium">{progress}%</span>
        </div>
        <div className="h-2 bg-muted rounded-full overflow-hidden">
          <div
            className={cn("h-full rounded-full transition-all duration-500", reviewed === requirements.length ? "bg-emerald-500" : "bg-blue-500")}
            style={{ width: `${progress}%` }}
          />
        </div>
        <div className="flex items-center gap-4 text-xs text-muted-foreground pt-1">
          {metCount > 0 && <span className="text-emerald-700 font-medium">{metCount} MET</span>}
          {notMetCount > 0 && <span className="text-red-700 font-medium">{notMetCount} NOT MET</span>}
          {naCount > 0 && <span className="text-slate-600 font-medium">{naCount} N/A</span>}
          {requirements.length - reviewed > 0 && <span className="text-gray-500">{requirements.length - reviewed} not yet</span>}
          <span className="ml-auto">{farMet}/15 FAR clauses satisfied</span>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-0 border-b border-border">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setActiveTab(t.key)}
            className={cn(
              "flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors",
              activeTab === t.key
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground hover:border-muted"
            )}
          >
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      {/* ── Tab: Workbench ──────────────────────────────────────────────────── */}
      {activeTab === "workbench" && (
        <div className="space-y-4">
          {Object.entries(domainGroups).map(([domain, reqs]) => (
            <div key={domain} className="rounded-xl border border-border overflow-hidden">
              <div className="px-4 py-2.5 bg-muted/40 border-b border-border flex items-center gap-2">
                <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground">{domain}</span>
                <span className="text-xs text-muted-foreground">—</span>
                <span className="text-xs font-medium text-foreground">{DOMAIN_LABELS[domain] ?? domain}</span>
                <span className="ml-auto text-xs text-muted-foreground">{reqs.filter(r => r.finding !== "not_reviewed").length}/{reqs.length} reviewed</span>
              </div>
              <div className="divide-y divide-border/60">
                {reqs.map((req) => (
                  <div key={req.id} className="flex items-center gap-3 px-4 py-3 hover:bg-accent/30 transition-colors">
                    <div className="shrink-0 w-28 hidden sm:block">
                      <span className="text-xs font-mono font-semibold text-foreground">{req.requirementId}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate">{req.requirementTitle}</div>
                      <div className="sm:hidden text-xs text-muted-foreground font-mono">{req.requirementId}</div>
                      {req.assessorNotes && (
                        <div className="text-xs text-muted-foreground truncate mt-0.5">{req.assessorNotes}</div>
                      )}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-[10px] font-mono text-muted-foreground hidden md:inline-block">FAR {FAR_MAPPING[req.requirementId] ?? "—"}</span>
                      <FindingBadge finding={req.finding} />
                      <Link href={`/l1-assessment/${id}/requirement/${req.id}`} className="inline-flex items-center gap-1 px-2.5 py-1 text-xs rounded-md border border-border hover:bg-accent transition-colors shrink-0">
                        Review <ChevronRight className="h-3 w-3" />
                      </Link>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Tab: FAR Roll-Up ────────────────────────────────────────────────── */}
      {activeTab === "far" && (
        <div className="space-y-4">
          {/* Summary */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {[
              { label: "Total Clauses", value: 15, color: "text-foreground" },
              { label: "Satisfied", value: clauseData.filter(c => c.result === "met").length, color: "text-emerald-700" },
              { label: "Not Satisfied", value: clauseData.filter(c => c.result === "not_met").length, color: "text-red-700" },
              { label: "Not Reviewed", value: clauseData.filter(c => c.result === "not_reviewed").length, color: "text-gray-500" },
            ].map(({ label, value, color }) => (
              <div key={label} className="rounded-lg border border-border p-3 text-center">
                <div className={cn("text-2xl font-bold tabular-nums", color)}>{value}</div>
                <div className="text-xs text-muted-foreground mt-0.5">{label}</div>
              </div>
            ))}
          </div>

          {/* Clauses table */}
          <div className="rounded-xl border border-border overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-muted/40 border-b border-border">
                  <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground w-16">Clause</th>
                  <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Description</th>
                  <th className="px-4 py-2.5 text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground w-32">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {clauseData.map((clause) => (
                  <>
                    <tr key={clause.clause} className={cn("hover:bg-accent/30 transition-colors", clause.andGate && "cursor-pointer")} onClick={() => clause.andGate && setExpandedClause(expandedClause === clause.clause ? null : clause.clause)}>
                      <td className="px-4 py-3 font-mono text-xs font-semibold text-foreground">{clause.clause}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <span>{clause.label}</span>
                          {clause.andGate && (
                            <span className="text-[10px] font-medium text-blue-600 bg-blue-50 border border-blue-200 px-1.5 py-0.5 rounded">AND-gate · 3 reqs</span>
                          )}
                          {clause.andGate && (
                            <ChevronRight className={cn("h-3.5 w-3.5 text-muted-foreground transition-transform shrink-0", expandedClause === clause.clause && "rotate-90")} />
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <FarResultBadge result={clause.result} />
                      </td>
                    </tr>
                    {clause.andGate && expandedClause === clause.clause && (
                      <tr key={`${clause.clause}-expanded`}>
                        <td colSpan={3} className="bg-blue-50/50 px-4 py-3">
                          <div className="space-y-2 ml-4">
                            {clause.findings.map((f) => {
                              const req = requirements.find((r) => r.requirementId === f.requirementId);
                              return (
                                <div key={f.requirementId} className="flex items-center gap-3">
                                  <span className="font-mono text-xs text-muted-foreground w-24 shrink-0">{f.requirementId}</span>
                                  <span className="text-xs flex-1">{req?.requirementTitle ?? f.requirementId}</span>
                                  <FindingBadge finding={f.finding} />
                                  {req && (
                                    <Link href={`/l1-assessment/${id}/requirement/${req.id}`} className="text-xs text-primary hover:underline shrink-0">
                                      Review
                                    </Link>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </td>
                      </tr>
                    )}
                  </>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-muted-foreground">
            FAR 52.204-21 clause (ix) uses AND-gate logic — all three PE requirements (3.10.3, 3.10.4, 3.10.5) must be MET for the clause to be satisfied. Click to expand.
          </p>
        </div>
      )}

      {/* ── Tab: Management Review ──────────────────────────────────────────── */}
      {activeTab === "review" && (
        <div className="max-w-2xl space-y-4">
          <div className="rounded-xl border border-border p-5 space-y-4">
            <h3 className="font-semibold">Management Review Workflow</h3>

            {/* Workflow state indicator */}
            <div className="space-y-3">
              {[
                { label: "Assessment In Progress", done: true },
                { label: "Submitted for Management Review", done: assessment.status === "submitted" || assessment.status === "affirmed" || assessment.status === "locked" },
                { label: "Management Approved", done: ["READY_FOR_SPRS", "PENDING_AFFIRMATION", "FINAL_LEVEL_1_SELF"].includes(wf ?? "") || assessment.status === "affirmed" || assessment.status === "locked" },
                { label: "Entered in SPRS", done: ["PENDING_AFFIRMATION", "FINAL_LEVEL_1_SELF"].includes(wf ?? "") || assessment.status === "affirmed" || assessment.status === "locked" },
                { label: "Assessment Affirmed", done: assessment.status === "affirmed" || assessment.status === "locked" },
              ].map((step, i) => (
                <div key={i} className="flex items-center gap-3">
                  <div className={cn("h-6 w-6 rounded-full flex items-center justify-center shrink-0", step.done ? "bg-emerald-500 text-white" : "bg-muted text-muted-foreground")}>
                    {step.done ? <CheckCircle2 className="h-3.5 w-3.5" /> : <span className="text-[10px] font-bold">{i + 1}</span>}
                  </div>
                  <span className={cn("text-sm", step.done ? "text-foreground font-medium" : "text-muted-foreground")}>{step.label}</span>
                </div>
              ))}
            </div>

            {/* Management review checklist (when under review) */}
            {wf === "READY_FOR_MANAGEMENT_REVIEW" && (
              <div className="space-y-3 pt-3 border-t border-border">
                <h4 className="text-sm font-semibold">Management Review Checklist</h4>
                {[
                  "All 17 CMMC L1 requirements have been reviewed and documented",
                  "Assessment findings reflect the current state of implementation",
                  "Implementation narratives are accurate and complete",
                  "Supporting evidence is linked to applicable requirements",
                  "Not Applicable justifications are documented where required",
                  "FAR 52.204-21 clause roll-up has been verified",
                  "Affirming official has been identified",
                  "Assessment year matches the current annual reporting period",
                ].map((item, i) => (
                  <div key={i} className="flex items-start gap-2 text-sm">
                    <Info className="h-3.5 w-3.5 text-muted-foreground mt-0.5 shrink-0" />
                    <span>{item}</span>
                  </div>
                ))}
              </div>
            )}

            {/* Actions */}
            {!isReadOnly && (
              <div className="flex flex-wrap gap-2 pt-3 border-t border-border">
                {assessment.status === "in_progress" && wf !== "READY_FOR_MANAGEMENT_REVIEW" && (
                  <button onClick={() => setShowReviewDialog("submit")} className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors">
                    <Send className="h-4 w-4" /> Submit for Management Review
                  </button>
                )}
                {wf === "READY_FOR_MANAGEMENT_REVIEW" && canAdmin && (
                  <>
                    <button onClick={() => setShowReviewDialog("approve")} className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-md bg-emerald-600 text-white hover:bg-emerald-700 transition-colors">
                      <CheckCircle2 className="h-4 w-4" /> Approve for SPRS
                    </button>
                    <button onClick={() => setShowReviewDialog("changes")} className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-md border border-amber-300 bg-amber-50 text-amber-700 hover:bg-amber-100 transition-colors">
                      Request Changes
                    </button>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Validation panel ───────────────────────────────────────────────── */}
      {showValidation && validationResult && (
        <div className="fixed inset-0 bg-black/50 flex items-start justify-center p-4 pt-16 z-50 overflow-y-auto">
          <div className="bg-background rounded-xl border border-border shadow-xl max-w-2xl w-full">
            <div className="p-4 border-b border-border flex items-center justify-between">
              <div className="flex items-center gap-2">
                {validationResult.passed ? <CheckCircle2 className="h-5 w-5 text-emerald-600" /> : <AlertCircle className="h-5 w-5 text-red-600" />}
                <h3 className="font-semibold">Validation {validationResult.passed ? "Passed" : "Failed"}</h3>
              </div>
              <button onClick={() => setShowValidation(false)} className="p-1.5 rounded-md hover:bg-accent">✕</button>
            </div>
            <div className="p-4 space-y-3 max-h-96 overflow-y-auto">
              {/* Summary */}
              <div className="grid grid-cols-3 gap-3 pb-3 border-b border-border">
                <div className="text-center">
                  <div className="text-xl font-bold text-red-600">{validationResult.summary.blockingErrors}</div>
                  <div className="text-xs text-muted-foreground">Blocking errors</div>
                </div>
                <div className="text-center">
                  <div className="text-xl font-bold text-amber-600">{validationResult.summary.warnings}</div>
                  <div className="text-xs text-muted-foreground">Warnings</div>
                </div>
                <div className="text-center">
                  <div className="text-xl font-bold text-emerald-600">{validationResult.summary.requirementsReviewed}/{validationResult.summary.requirementsTotal}</div>
                  <div className="text-xs text-muted-foreground">Reqs reviewed</div>
                </div>
              </div>
              {validationResult.errors.map((e, i) => (
                <div key={i} className={cn(
                  "flex items-start gap-2.5 p-3 rounded-lg text-sm",
                  e.severity === "error" ? "bg-red-50 border border-red-200 text-red-800" : "bg-amber-50 border border-amber-200 text-amber-800"
                )}>
                  {e.severity === "error" ? <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" /> : <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />}
                  <div>
                    <span className="font-mono text-[10px] font-bold mr-1.5">{e.code}</span>
                    {e.message}
                  </div>
                </div>
              ))}
              {validationResult.passed && validationResult.errors.length === 0 && (
                <div className="text-center py-4 text-emerald-700 font-medium">All checks passed! Assessment is ready for submission.</div>
              )}
            </div>
            <div className="p-4 border-t border-border flex justify-end gap-2">
              {validationResult.passed && !isReadOnly && assessment.status === "in_progress" && (
                <button onClick={() => { setShowValidation(false); setShowReviewDialog("submit"); }} className="inline-flex items-center gap-1.5 px-4 py-2 text-sm rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors">
                  <Send className="h-4 w-4" /> Submit for Review
                </button>
              )}
              <button onClick={() => setShowValidation(false)} className="px-4 py-2 text-sm rounded-md border border-border hover:bg-accent transition-colors">
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Review dialog ─────────────────────────────────────────────────── */}
      {showReviewDialog && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-background rounded-xl border border-border shadow-xl max-w-md w-full">
            <div className="p-4 border-b border-border">
              <h3 className="font-semibold">
                {showReviewDialog === "submit" ? "Submit for Management Review" :
                 showReviewDialog === "approve" ? "Approve for SPRS Entry" :
                 showReviewDialog === "changes" ? "Request Changes" :
                 "Lock & Finalize Assessment"}
              </h3>
            </div>
            <div className="p-4 space-y-3">
              {showReviewDialog === "submit" && (
                <p className="text-sm text-muted-foreground">This will submit the assessment for management review. The assessment will be locked for editing until the reviewer approves or requests changes.</p>
              )}
              {showReviewDialog === "approve" && (
                <>
                  <p className="text-sm text-muted-foreground">Approve this assessment for SPRS entry. The team will then record the SPRS submission details.</p>
                  <div>
                    <label className="block text-sm font-medium mb-1.5">Reviewer Notes (optional)</label>
                    <textarea
                      value={reviewComment}
                      onChange={(e) => setReviewComment(e.target.value)}
                      rows={3}
                      placeholder="Add any reviewer notes..."
                      className="w-full rounded-md border border-input px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-none"
                    />
                  </div>
                </>
              )}
              {showReviewDialog === "changes" && (
                <>
                  <p className="text-sm text-muted-foreground">Describe what changes are needed. The assessment will be returned to In Progress status.</p>
                  <div>
                    <label className="block text-sm font-medium mb-1.5">Comments <span className="text-red-500">*</span></label>
                    <textarea
                      value={reviewComment}
                      onChange={(e) => setReviewComment(e.target.value)}
                      rows={4}
                      placeholder="Describe the required changes..."
                      className="w-full rounded-md border border-input px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-none"
                    />
                  </div>
                </>
              )}
              {showReviewDialog === "finalize" && (
                <p className="text-sm text-muted-foreground">Locking the assessment makes it permanently read-only. This action cannot be undone. Proceed only when the assessment is fully affirmed and complete.</p>
              )}
              {actionError && (
                <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-md px-3 py-2">{actionError}</div>
              )}
            </div>
            <div className="p-4 border-t border-border flex justify-end gap-2">
              <button onClick={() => { setShowReviewDialog(null); setActionError(null); setReviewComment(""); }} className="px-4 py-2 text-sm rounded-md border border-border hover:bg-accent transition-colors">
                Cancel
              </button>
              <button
                onClick={() => {
                  if (showReviewDialog === "submit") handleSubmitForReview();
                  if (showReviewDialog === "approve") handleApprove();
                  if (showReviewDialog === "changes") handleRequestChanges();
                  if (showReviewDialog === "finalize") handleFinalize();
                }}
                disabled={submitMutation.isPending || approveMutation.isPending || changesMutation.isPending || finalizeMutation.isPending}
                className={cn(
                  "inline-flex items-center gap-1.5 px-4 py-2 text-sm rounded-md transition-colors disabled:opacity-50",
                  showReviewDialog === "changes" ? "border border-amber-300 bg-amber-50 text-amber-700 hover:bg-amber-100" :
                  showReviewDialog === "finalize" ? "bg-slate-700 text-white hover:bg-slate-800" :
                  "bg-primary text-primary-foreground hover:bg-primary/90"
                )}
              >
                {(submitMutation.isPending || approveMutation.isPending || changesMutation.isPending || finalizeMutation.isPending) && <Loader2 className="h-4 w-4 animate-spin" />}
                {showReviewDialog === "submit" ? "Submit" :
                 showReviewDialog === "approve" ? "Approve" :
                 showReviewDialog === "changes" ? "Send to Team" :
                 "Lock Assessment"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
