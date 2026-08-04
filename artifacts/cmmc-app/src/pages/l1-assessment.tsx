/**
 * L1 Annual Self-Assessment — Overview Page
 *
 * Shows the 9 top-deck stat cards plus an at-a-glance requirements table.
 * Serves as the entry point to start a new cycle or continue an in-progress one.
 */
import { useOrg } from "@/context/OrgContext";
import { useGetL1Assessment, useGetL1History } from "@workspace/api-client-react";
import { Link } from "wouter";
import {
  Shield, Plus, Clock, CheckCircle2, XCircle, AlertTriangle,
  FileCheck, Users, Calendar, Lock, ChevronRight, BarChart3,
  CircleDot, History, RefreshCcw,
} from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import type { L1Assessment, L1FindingValue } from "@workspace/api-client-react";

// ── Helpers ──────────────────────────────────────────────────────────────────

function statusColor(status: string, workflowState?: string | null) {
  if (status === "locked") return { bg: "bg-slate-100", text: "text-slate-700", border: "border-slate-200", label: "Locked" };
  if (status === "affirmed") return { bg: "bg-emerald-50", text: "text-emerald-700", border: "border-emerald-200", label: "Affirmed" };
  if (workflowState === "READY_FOR_MANAGEMENT_REVIEW") return { bg: "bg-purple-50", text: "text-purple-700", border: "border-purple-200", label: "Under Review" };
  if (workflowState === "CHANGES_REQUESTED") return { bg: "bg-amber-50", text: "text-amber-700", border: "border-amber-200", label: "Changes Requested" };
  if (workflowState === "READY_FOR_SPRS") return { bg: "bg-blue-50", text: "text-blue-700", border: "border-blue-200", label: "Ready for SPRS" };
  if (workflowState === "PENDING_AFFIRMATION") return { bg: "bg-indigo-50", text: "text-indigo-700", border: "border-indigo-200", label: "Pending Affirmation" };
  if (status === "submitted") return { bg: "bg-blue-50", text: "text-blue-700", border: "border-blue-200", label: "Submitted" };
  return { bg: "bg-amber-50", text: "text-amber-700", border: "border-amber-200", label: "In Progress" };
}

function findingBadge(finding: L1FindingValue) {
  switch (finding) {
    case "met": return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-100 text-emerald-700 border border-emerald-200"><CheckCircle2 className="h-3 w-3" />MET</span>;
    case "not_met": return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-red-100 text-red-700 border border-red-200"><XCircle className="h-3 w-3" />NOT MET</span>;
    case "not_applicable": return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-slate-100 text-slate-600 border border-slate-200">N/A</span>;
    default: return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-gray-100 text-gray-500 border border-gray-200"><CircleDot className="h-3 w-3" />NOT YET</span>;
  }
}

function StatCard({
  title,
  children,
  href,
  highlight,
}: {
  title: string;
  children: React.ReactNode;
  href?: string;
  highlight?: "blue" | "emerald" | "amber" | "purple" | "slate";
}) {
  const border = highlight === "blue" ? "border-blue-200" : highlight === "emerald" ? "border-emerald-200" : highlight === "amber" ? "border-amber-200" : highlight === "purple" ? "border-purple-200" : "border-border/60";
  const card = (
    <div className={cn("rounded-xl border p-4 bg-card shadow-sm h-full flex flex-col gap-2", border, href && "hover:shadow-md transition-shadow cursor-pointer")}>
      <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">{title}</p>
      {children}
    </div>
  );
  if (href) return <Link href={href} className="block h-full">{card}</Link>;
  return card;
}

export default function L1AssessmentOverview() {
  const { activeOrg } = useOrg();
  const orgId = activeOrg?.id ?? "";
  const qc = useQueryClient();

  const { data: activeData, isLoading: activeLoading } = useGetL1Assessment(orgId);
  const { data: historyData, isLoading: historyLoading } = useGetL1History(orgId);

  const assessment = activeData?.assessment;
  const history = historyData?.assessments ?? [];
  const isLoading = activeLoading || historyLoading;

  if (isLoading) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="h-20 bg-muted rounded-xl" />
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4">
          {[...Array(8)].map((_, i) => <div key={i} className="h-28 bg-muted rounded-lg" />)}
        </div>
      </div>
    );
  }

  // Derive stats from assessment (if exists)
  const reqsMet = assessment
    ? (historyData?.assessments?.[0] as any)?.reqsMet ?? 0
    : 0;
  const year = assessment?.assessmentYear ?? new Date().getFullYear();
  const sc = assessment ? statusColor(assessment.status, assessment.workflowState) : null;
  const expirationDate = (() => {
    if (!assessment?.snapshotMetadata) return null;
    try { return (JSON.parse(assessment.snapshotMetadata) as any).expirationDate ?? null; } catch { return null; }
  })();

  return (
    <div className="space-y-6 max-w-[1400px] mx-auto">
      {/* ── Header ──────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 pb-5 border-b border-border">
        <div className="flex items-center gap-4">
          <div className="h-12 w-12 rounded-xl bg-blue-600 text-white flex items-center justify-center shrink-0">
            <Shield className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">CMMC Level 1 Annual Self-Assessment</h1>
            <p className="text-sm text-muted-foreground mt-0.5">FAR 52.204-21 — 17 practices, 15 clauses</p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => { qc.invalidateQueries({ queryKey: ["l1-assessment"] }); qc.invalidateQueries({ queryKey: ["l1-assessment-history"] }); }}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md border border-border hover:bg-accent transition-colors"
          >
            <RefreshCcw className="h-3.5 w-3.5" /> Refresh
          </button>
          {history.length > 0 && (
            <Link href="/l1-assessment/history" className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md border border-border hover:bg-accent transition-colors">
              <History className="h-3.5 w-3.5" /> History
            </Link>
          )}
          {!assessment ? (
            <Link href="/l1-assessment/new" className="inline-flex items-center gap-1.5 px-4 py-1.5 text-sm font-medium rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors">
              <Plus className="h-4 w-4" /> Start Assessment
            </Link>
          ) : (
            <Link href={`/l1-assessment/${assessment.id}`} className="inline-flex items-center gap-1.5 px-4 py-1.5 text-sm font-medium rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors">
              Continue Workbench <ChevronRight className="h-4 w-4" />
            </Link>
          )}
        </div>
      </div>

      {/* ── No assessment yet ──────────────────────────────────────── */}
      {!assessment && (
        <div className="flex flex-col items-center justify-center py-24 text-center gap-4">
          <div className="h-16 w-16 rounded-2xl bg-blue-50 border border-blue-200 flex items-center justify-center">
            <Shield className="h-8 w-8 text-blue-500" />
          </div>
          <div>
            <h2 className="text-xl font-semibold">No Assessment Started</h2>
            <p className="text-sm text-muted-foreground mt-1 max-w-md">
              Start your CMMC Level 1 Annual Self-Assessment to document evidence of compliance with the 17 practices and satisfy FAR 52.204-21.
            </p>
          </div>
          <Link href="/l1-assessment/new" className="inline-flex items-center gap-2 px-6 py-2.5 text-sm font-semibold rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors">
            <Plus className="h-4 w-4" /> Start Annual Self-Assessment
          </Link>
          {history.length > 0 && (
            <Link href="/l1-assessment/history" className="text-sm text-muted-foreground hover:text-foreground underline-offset-4 hover:underline">
              View {history.length} prior assessment{history.length !== 1 ? "s" : ""}
            </Link>
          )}
        </div>
      )}

      {/* ── 9 stat cards (when assessment exists) ──────────────────── */}
      {assessment && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4">

            {/* Current Cycle */}
            <StatCard title="Current Cycle" highlight="blue">
              <div className="text-2xl font-bold tabular-nums">{year}</div>
              <div className="text-xs text-muted-foreground">{assessment.title}</div>
              <div className="text-[11px] text-muted-foreground">Scope: {assessment.scopeName}</div>
            </StatCard>

            {/* Assessment Status */}
            <StatCard title="Assessment Status">
              {sc && (
                <div className={cn("inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold border self-start", sc.bg, sc.text, sc.border)}>
                  {sc.label}
                </div>
              )}
              {assessment.submittedAt && (
                <div className="text-[11px] text-muted-foreground">Submitted {new Date(assessment.submittedAt).toLocaleDateString()}</div>
              )}
              {assessment.affirmedAt && (
                <div className="text-[11px] text-muted-foreground">Affirmed {new Date(assessment.affirmedAt).toLocaleDateString()}</div>
              )}
              {assessment.status === "locked" && <Lock className="h-3.5 w-3.5 text-muted-foreground" />}
            </StatCard>

            {/* 17 CMMC Requirements */}
            <StatCard title="17 Requirements" href={`/l1-assessment/${assessment.id}`}>
              <div className="text-2xl font-bold tabular-nums text-blue-600">17</div>
              <div className="text-[11px] text-muted-foreground">CMMC L1 practices to review</div>
              <div className="flex items-center gap-1.5 mt-1">
                <span className="text-[10px] font-medium text-emerald-700">MET</span>
                <span className="text-[10px] text-muted-foreground">·</span>
                <span className="text-[10px] font-medium text-slate-600">N/A</span>
                <span className="text-[10px] text-muted-foreground">·</span>
                <span className="text-[10px] font-medium text-gray-500">Not Yet</span>
              </div>
            </StatCard>

            {/* 15 FAR Clauses */}
            <StatCard title="FAR Clauses" href={`/l1-assessment/${assessment.id}?tab=far`}>
              <div className="text-2xl font-bold tabular-nums text-purple-600">15</div>
              <div className="text-[11px] text-muted-foreground">FAR 52.204-21 clauses to satisfy</div>
            </StatCard>

            {/* Management Review */}
            <StatCard title="Management Review">
              {assessment.workflowState === "READY_FOR_MANAGEMENT_REVIEW" ? (
                <div className="flex items-center gap-1.5 text-purple-700 text-sm font-semibold"><Clock className="h-4 w-4" /> Pending review</div>
              ) : assessment.workflowState === "CHANGES_REQUESTED" ? (
                <div className="flex items-center gap-1.5 text-amber-700 text-sm font-semibold"><AlertTriangle className="h-4 w-4" /> Changes requested</div>
              ) : assessment.workflowState === "READY_FOR_SPRS" || assessment.workflowState === "PENDING_AFFIRMATION" || assessment.workflowState === "FINAL_LEVEL_1_SELF" ? (
                <div className="flex items-center gap-1.5 text-emerald-700 text-sm font-semibold"><CheckCircle2 className="h-4 w-4" /> Approved</div>
              ) : (
                <div className="flex items-center gap-1.5 text-muted-foreground text-sm"><CircleDot className="h-4 w-4" /> Not yet submitted</div>
              )}
            </StatCard>

            {/* SPRS Status */}
            <StatCard title="SPRS Entry" href={`/l1-assessment/${assessment.id}/sprs`}>
              {assessment.workflowState === "PENDING_AFFIRMATION" || assessment.workflowState === "FINAL_LEVEL_1_SELF" ? (
                <div className="flex items-center gap-1.5 text-emerald-700 text-sm font-semibold"><CheckCircle2 className="h-4 w-4" /> Entered in SPRS</div>
              ) : assessment.workflowState === "READY_FOR_SPRS" ? (
                <div className="flex items-center gap-1.5 text-blue-700 text-sm font-semibold"><Clock className="h-4 w-4" /> Ready to enter</div>
              ) : (
                <div className="flex items-center gap-1.5 text-muted-foreground text-sm"><CircleDot className="h-4 w-4" /> Pending management review</div>
              )}
            </StatCard>

            {/* Annual Affirmation */}
            <StatCard title="Annual Affirmation" href={`/l1-assessment/${assessment.id}/sprs`}>
              {assessment.status === "affirmed" || assessment.workflowState === "FINAL_LEVEL_1_SELF" ? (
                <div className="flex items-center gap-1.5 text-emerald-700 text-sm font-semibold"><CheckCircle2 className="h-4 w-4" /> Affirmed</div>
              ) : (
                <div className="flex items-center gap-1.5 text-muted-foreground text-sm"><CircleDot className="h-4 w-4" /> Not yet affirmed</div>
              )}
              {assessment.affirmingOfficialName && (
                <div className="text-[11px] text-muted-foreground mt-1">By: {assessment.affirmingOfficialName}</div>
              )}
            </StatCard>

            {/* Due Date */}
            <StatCard title="Cycle / Expiration">
              <div className="flex items-center gap-1.5 text-muted-foreground text-sm">
                <Calendar className="h-4 w-4" />
                <span>Annual — {year}</span>
              </div>
              {expirationDate && (
                <div className="text-[11px] text-muted-foreground mt-1">
                  Expires: {new Date(expirationDate).toLocaleDateString()}
                </div>
              )}
              {!expirationDate && (
                <div className="text-[11px] text-muted-foreground mt-1">Annual renewal required</div>
              )}
            </StatCard>
          </div>

          {/* ── Quick navigation ────────────────────────────────────────────────── */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Link href={`/l1-assessment/${assessment.id}`} className="flex items-center gap-3 p-4 rounded-xl border border-border hover:border-primary/40 hover:bg-accent/40 transition-colors group">
              <div className="h-9 w-9 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
                <Shield className="h-4 w-4" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold">Assessment Workbench</p>
                <p className="text-xs text-muted-foreground truncate">Review 17 requirements and objectives</p>
              </div>
              <ChevronRight className="h-4 w-4 text-muted-foreground ml-auto shrink-0 group-hover:translate-x-0.5 transition-transform" />
            </Link>
            <Link href={`/l1-assessment/${assessment.id}?tab=far`} className="flex items-center gap-3 p-4 rounded-xl border border-border hover:border-primary/40 hover:bg-accent/40 transition-colors group">
              <div className="h-9 w-9 rounded-lg bg-purple-50 text-purple-600 flex items-center justify-center shrink-0">
                <BarChart3 className="h-4 w-4" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold">FAR Roll-Up</p>
                <p className="text-xs text-muted-foreground truncate">15 FAR 52.204-21 clause status</p>
              </div>
              <ChevronRight className="h-4 w-4 text-muted-foreground ml-auto shrink-0 group-hover:translate-x-0.5 transition-transform" />
            </Link>
            <Link href={`/l1-assessment/${assessment.id}/sprs`} className="flex items-center gap-3 p-4 rounded-xl border border-border hover:border-primary/40 hover:bg-accent/40 transition-colors group">
              <div className="h-9 w-9 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
                <FileCheck className="h-4 w-4" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold">SPRS & Affirmation</p>
                <p className="text-xs text-muted-foreground truncate">Record SPRS entry and affirm</p>
              </div>
              <ChevronRight className="h-4 w-4 text-muted-foreground ml-auto shrink-0 group-hover:translate-x-0.5 transition-transform" />
            </Link>
          </div>

          {/* ── History table ──────────────────────────────────────────────────── */}
          {history.length > 1 && (
            <div className="rounded-xl border border-border overflow-hidden">
              <div className="p-4 border-b border-border flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <History className="h-4 w-4 text-muted-foreground" />
                  <span className="font-semibold text-sm">Prior Assessments</span>
                </div>
                <Link href="/l1-assessment/history" className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1">
                  View all <ChevronRight className="h-3 w-3" />
                </Link>
              </div>
              <div className="divide-y divide-border">
                {history.slice(1, 4).map((a) => {
                  const s = statusColor(a.status, a.workflowState);
                  return (
                    <Link key={a.id} href={`/l1-assessment/${a.id}`} className="flex items-center gap-4 px-4 py-3 hover:bg-accent/40 transition-colors">
                      <div className="text-sm font-semibold tabular-nums w-12 shrink-0">{a.assessmentYear}</div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium truncate">{a.title}</div>
                        <div className="text-xs text-muted-foreground">{a.scopeName}</div>
                      </div>
                      <div className={cn("inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold border shrink-0", s.bg, s.text, s.border)}>
                        {s.label}
                      </div>
                      {a.isReadOnly && <Lock className="h-3.5 w-3.5 text-muted-foreground shrink-0" />}
                    </Link>
                  );
                })}
              </div>
            </div>
          )}

          {/* ── Start new cycle ────────────────────────────────────────────────── */}
          {(assessment.status === "locked" || assessment.status === "affirmed") && (
            <div className="flex justify-center pt-4">
              <Link href="/l1-assessment/new" className="inline-flex items-center gap-2 px-6 py-2.5 text-sm font-semibold rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors">
                <Plus className="h-4 w-4" /> Start New Assessment Cycle
              </Link>
            </div>
          )}
        </>
      )}
    </div>
  );
}
