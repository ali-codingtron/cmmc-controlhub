/**
 * L1 Annual Self-Assessment — History Page
 */
import { useOrg } from "@/context/OrgContext";
import { useGetL1History } from "@workspace/api-client-react";
import { Link } from "wouter";
import {
  History, Lock, ChevronLeft, Plus, Download, ChevronRight,
  CheckCircle2, XCircle, CircleDot, Shield,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { L1Assessment } from "@workspace/api-client-react";

type HistoryAssessment = L1Assessment & { isReadOnly: boolean };

function statusLabel(a: HistoryAssessment): { label: string; bg: string; text: string; border: string } {
  if (a.status === "locked") return { label: "Locked", bg: "bg-slate-100", text: "text-slate-700", border: "border-slate-200" };
  if (a.status === "affirmed") return { label: "Affirmed", bg: "bg-emerald-50", text: "text-emerald-700", border: "border-emerald-200" };
  const wf = (a as any).workflowState;
  if (wf === "READY_FOR_MANAGEMENT_REVIEW") return { label: "Under Review", bg: "bg-purple-50", text: "text-purple-700", border: "border-purple-200" };
  if (wf === "CHANGES_REQUESTED") return { label: "Changes Requested", bg: "bg-amber-50", text: "text-amber-700", border: "border-amber-200" };
  if (wf === "READY_FOR_SPRS") return { label: "Ready for SPRS", bg: "bg-blue-50", text: "text-blue-700", border: "border-blue-200" };
  if (wf === "PENDING_AFFIRMATION") return { label: "Pending Affirmation", bg: "bg-indigo-50", text: "text-indigo-700", border: "border-indigo-200" };
  if (a.status === "submitted") return { label: "Submitted", bg: "bg-blue-50", text: "text-blue-700", border: "border-blue-200" };
  return { label: "In Progress", bg: "bg-amber-50", text: "text-amber-700", border: "border-amber-200" };
}

export default function L1AssessmentHistory() {
  const { activeOrg } = useOrg();
  const { data, isLoading } = useGetL1History(activeOrg?.id);
  const assessments = data?.assessments ?? [];

  return (
    <div className="space-y-5 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Link href="/l1-assessment" className="p-2 rounded-md hover:bg-accent transition-colors">
            <ChevronLeft className="h-5 w-5" />
          </Link>
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-blue-600 text-white flex items-center justify-center shrink-0">
              <History className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-xl font-semibold">Assessment History</h1>
              <p className="text-sm text-muted-foreground">All L1 Annual Self-Assessment cycles</p>
            </div>
          </div>
        </div>
        <Link href="/l1-assessment/new" className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors">
          <Plus className="h-4 w-4" /> New Assessment
        </Link>
      </div>

      {isLoading && (
        <div className="animate-pulse space-y-3">
          {[...Array(3)].map((_, i) => <div key={i} className="h-20 bg-muted rounded-lg" />)}
        </div>
      )}

      {!isLoading && assessments.length === 0 && (
        <div className="flex flex-col items-center justify-center py-24 text-center gap-4">
          <div className="h-14 w-14 rounded-xl bg-muted flex items-center justify-center">
            <Shield className="h-7 w-7 text-muted-foreground opacity-40" />
          </div>
          <p className="text-muted-foreground">No assessments found. Start your first cycle.</p>
          <Link href="/l1-assessment/new" className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors">
            <Plus className="h-4 w-4" /> Start Assessment
          </Link>
        </div>
      )}

      {!isLoading && assessments.length > 0 && (
        <div className="rounded-xl border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted/50 border-b border-border">
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Year</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Assessment</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Status</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground hidden md:table-cell">Affirming Official</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground hidden lg:table-cell">Created</th>
                <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {assessments.map((a) => {
                const s = statusLabel(a);
                const meta = (() => {
                  try { return a.snapshotMetadata ? JSON.parse(a.snapshotMetadata) : {}; } catch { return {}; }
                })();
                return (
                  <tr key={a.id} className="hover:bg-accent/30 transition-colors">
                    <td className="px-4 py-3 font-bold tabular-nums text-base">
                      {a.assessmentYear}
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-medium truncate max-w-xs">{a.title}</div>
                      <div className="text-xs text-muted-foreground mt-0.5">{a.scopeName}</div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span className={cn("inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold border", s.bg, s.text, s.border)}>
                          {s.label}
                        </span>
                        {a.isReadOnly && <Lock className="h-3 w-3 text-muted-foreground" />}
                      </div>
                    </td>
                    <td className="px-4 py-3 hidden md:table-cell text-sm text-muted-foreground">
                      {a.affirmingOfficialName ? (
                        <div>
                          <div className="font-medium text-foreground">{a.affirmingOfficialName}</div>
                          <div className="text-xs">{a.affirmingOfficialTitle}</div>
                        </div>
                      ) : <span className="text-muted-foreground/50">—</span>}
                    </td>
                    <td className="px-4 py-3 hidden lg:table-cell text-xs text-muted-foreground">
                      {new Date(a.createdAt).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => alert("Report download will be available in a future release.")}
                          className="inline-flex items-center gap-1 px-2 py-1 text-xs rounded border border-border hover:bg-accent transition-colors text-muted-foreground"
                          title="Download report (coming soon)"
                        >
                          <Download className="h-3 w-3" />
                          <span className="hidden sm:inline">Report</span>
                        </button>
                        <Link href={`/l1-assessment/${a.id}`} className="inline-flex items-center gap-1 px-2 py-1 text-xs rounded border border-border hover:bg-accent transition-colors">
                          {a.isReadOnly ? "View" : "Open"}
                          <ChevronRight className="h-3 w-3" />
                        </Link>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
