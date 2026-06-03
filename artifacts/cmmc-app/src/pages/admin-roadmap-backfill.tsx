import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  AlertTriangle, CheckCircle2, Loader2, Play, ShieldAlert,
  Map, RefreshCw, ListChecks, ChevronDown, ChevronUp,
} from "lucide-react";

interface Org { id: string; name: string; legalName: string | null }

interface ActionSummary {
  id: string;
  title: string;
  phase: number;
  phaseName: string;
  category: string;
  currentStatus: string;
  hasProgressRecord: boolean;
  completedAt: string | null;
}

interface DryRunResult {
  org: Org;
  totalActions: number;
  totalChecklistItems: number;
  totalProcedureSteps: number;
  statusCounts: Record<string, number>;
  wouldUpdate: number;
  actions: ActionSummary[];
}

interface ExecuteResult {
  org: Org;
  totalActions: number;
  updated: number;
  created: number;
  checklistUpdated: number;
  stepsUpdated: number;
  alreadyComplete: number;
}

function authHeaders(): Record<string, string> {
  const token = localStorage.getItem("auth_token");
  return token ? { Authorization: `Bearer ${token}` } : {};
}

const STATUS_LABELS: Record<string, string> = {
  not_started: "Not Started",
  in_progress: "In Progress",
  evidence_needed: "Evidence Needed",
  ready_for_review: "Ready for Review",
  complete: "Complete",
  blocked: "Blocked",
  missing: "No Record",
};

const STATUS_BADGE: Record<string, string> = {
  not_started: "bg-slate-100 text-slate-700 border-slate-200",
  in_progress: "bg-blue-100 text-blue-700 border-blue-200",
  evidence_needed: "bg-yellow-100 text-yellow-700 border-yellow-200",
  ready_for_review: "bg-purple-100 text-purple-700 border-purple-200",
  complete: "bg-green-100 text-green-700 border-green-200",
  blocked: "bg-red-100 text-red-700 border-red-200",
  missing: "bg-orange-100 text-orange-700 border-orange-200",
};

export default function AdminRoadmapBackfill() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [selectedOrgId, setSelectedOrgId] = useState<string>("");
  const [dryRunResult, setDryRunResult] = useState<DryRunResult | null>(null);
  const [executeResult, setExecuteResult] = useState<ExecuteResult | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [showActionList, setShowActionList] = useState(false);

  if (user?.role !== "admin") {
    return (
      <div className="max-w-xl mx-auto mt-20 text-center">
        <ShieldAlert className="h-12 w-12 text-red-400 mx-auto mb-4" />
        <h2 className="text-xl font-bold mb-2">Admin Access Required</h2>
        <p className="text-muted-foreground">This page is only accessible to global administrators.</p>
      </div>
    );
  }

  const { data: orgs, isLoading: orgsLoading } = useQuery<Org[]>({
    queryKey: ["admin-orgs"],
    queryFn: async () => {
      const r = await fetch("/api/admin/orgs", { headers: authHeaders() });
      if (!r.ok) throw new Error("Failed to load organizations");
      return r.json();
    },
  });

  const dryRunMutation = useMutation({
    mutationFn: async (orgId: string) => {
      const r = await fetch(`/api/admin/backfill/roadmap?orgId=${encodeURIComponent(orgId)}`, {
        headers: authHeaders(),
      });
      if (!r.ok) throw new Error(await r.text());
      return r.json() as Promise<DryRunResult>;
    },
    onSuccess: (data) => {
      setDryRunResult(data);
      setExecuteResult(null);
      setConfirmed(false);
      setShowActionList(false);
    },
    onError: (e: Error) => toast({ title: "Dry-run failed", description: e.message, variant: "destructive" }),
  });

  const executeMutation = useMutation({
    mutationFn: async (orgId: string) => {
      const r = await fetch("/api/admin/backfill/roadmap", {
        method: "POST",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ orgId }),
      });
      if (!r.ok) throw new Error(await r.text());
      return r.json() as Promise<ExecuteResult>;
    },
    onSuccess: (data) => {
      setExecuteResult(data);
      setDryRunResult(null);
      setConfirmed(false);
      toast({ title: `Roadmap backfill complete — ${data.updated + data.created} actions marked complete` });
    },
    onError: (e: Error) => toast({ title: "Backfill failed", description: e.message, variant: "destructive" }),
  });

  const handleOrgChange = (orgId: string) => {
    setSelectedOrgId(orgId);
    setDryRunResult(null);
    setExecuteResult(null);
    setConfirmed(false);
    setShowActionList(false);
  };

  const nonCompleteActions = dryRunResult?.actions.filter((a) => a.currentStatus !== "complete") ?? [];

  return (
    <div className="max-w-3xl mx-auto py-8 px-4 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Map className="h-6 w-6 text-primary" />
          Roadmap Backfill Tool
        </h1>
        <p className="text-muted-foreground text-sm mt-1">
          Marks all Implementation Roadmap actions as Complete for a single organization.
          Use this when an org was onboarded after the roadmap was created and has already completed the work.
        </p>
      </div>

      {/* Warning banner */}
      <Card className="border-orange-200 bg-orange-50">
        <CardContent className="pt-4 pb-4">
          <div className="flex gap-3">
            <AlertTriangle className="h-5 w-5 text-orange-600 flex-shrink-0 mt-0.5" />
            <div className="text-sm text-orange-900">
              <p className="font-semibold mb-1">Production safety rules</p>
              <ul className="space-y-0.5 list-disc ml-4">
                <li>Only the selected organization is affected — no other orgs are touched.</li>
                <li>Actions already marked Complete are skipped.</li>
                <li>Existing notes are preserved; only status, result, and timestamps are updated.</li>
                <li>One audit log entry is written per action updated, plus a summary entry.</li>
                <li>Always run the dry-run first and review before confirming.</li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Step 1 — Org selector + dry-run */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Step 1 — Select Organization &amp; Run Dry-Run</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-3 items-end">
            <div className="flex-1">
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Organization</label>
              {orgsLoading ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" /> Loading…
                </div>
              ) : (
                <Select value={selectedOrgId} onValueChange={handleOrgChange}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select an organization…" />
                  </SelectTrigger>
                  <SelectContent>
                    {orgs?.map((o) => (
                      <SelectItem key={o.id} value={o.id}>
                        {o.name}{o.legalName ? ` — ${o.legalName}` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
            <Button
              onClick={() => dryRunMutation.mutate(selectedOrgId)}
              disabled={!selectedOrgId || dryRunMutation.isPending}
              variant="outline"
            >
              {dryRunMutation.isPending
                ? <><Loader2 className="h-4 w-4 mr-1.5 animate-spin" />Running…</>
                : <><Play className="h-4 w-4 mr-1.5" />Run Dry-Run</>}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Dry-run results */}
      {dryRunResult && (
        <Card className="border-blue-200">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <ListChecks className="h-4 w-4 text-blue-600" />
              Dry-Run Results — {dryRunResult.org.name}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Stats grid */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
              <div className="rounded-lg border bg-muted/20 px-3 py-3">
                <div className="text-2xl font-bold">{dryRunResult.totalActions}</div>
                <div className="text-xs text-muted-foreground">Total Actions</div>
              </div>
              <div className="rounded-lg border border-green-200 bg-green-50 px-3 py-3">
                <div className="text-2xl font-bold text-green-700">{dryRunResult.statusCounts.complete ?? 0}</div>
                <div className="text-xs text-muted-foreground">Already Complete</div>
              </div>
              <div className={`rounded-lg border px-3 py-3 ${dryRunResult.wouldUpdate > 0 ? "border-blue-200 bg-blue-50" : "bg-muted/20"}`}>
                <div className={`text-2xl font-bold ${dryRunResult.wouldUpdate > 0 ? "text-blue-700" : "text-muted-foreground"}`}>
                  {dryRunResult.wouldUpdate}
                </div>
                <div className="text-xs text-muted-foreground">Would Update</div>
              </div>
              <div className="rounded-lg border bg-muted/20 px-3 py-3">
                <div className="text-2xl font-bold text-muted-foreground">{dryRunResult.totalChecklistItems}</div>
                <div className="text-xs text-muted-foreground">Checklist Items</div>
              </div>
            </div>

            {/* Status breakdown */}
            {Object.entries(dryRunResult.statusCounts).filter(([, n]) => n > 0).length > 0 && (
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                  Current status breakdown
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {Object.entries(dryRunResult.statusCounts)
                    .filter(([, count]) => count > 0)
                    .map(([status, count]) => (
                      <Badge
                        key={status}
                        className={`text-xs ${STATUS_BADGE[status] ?? "bg-slate-100 text-slate-700"}`}
                      >
                        {STATUS_LABELS[status] ?? status}: {count}
                      </Badge>
                    ))}
                </div>
              </div>
            )}

            {/* Actions that will be updated — collapsible */}
            {nonCompleteActions.length > 0 && (
              <div>
                <button
                  className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2 hover:text-foreground transition-colors"
                  onClick={() => setShowActionList((v) => !v)}
                >
                  {showActionList ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                  {nonCompleteActions.length} actions to be marked complete
                </button>
                {showActionList && (
                  <div className="divide-y rounded border max-h-72 overflow-y-auto">
                    {nonCompleteActions.map((a) => (
                      <div key={a.id} className="px-3 py-2 flex items-center gap-3">
                        <span className="text-xs text-muted-foreground w-16 flex-shrink-0">
                          Phase {a.phase}
                        </span>
                        <span className="text-xs font-medium flex-1 truncate">{a.title}</span>
                        <Badge className={`text-xs flex-shrink-0 ${STATUS_BADGE[a.currentStatus] ?? ""}`}>
                          {STATUS_LABELS[a.currentStatus] ?? a.currentStatus}
                        </Badge>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* All-complete state */}
            {dryRunResult.wouldUpdate === 0 && (
              <div className="flex items-center gap-2 text-sm text-green-700 bg-green-50 border border-green-200 rounded px-4 py-3">
                <CheckCircle2 className="h-4 w-4 flex-shrink-0" />
                All roadmap actions are already marked Complete — nothing to update.
              </div>
            )}

            {/* Step 2 — Confirm */}
            {dryRunResult.wouldUpdate > 0 && (
              <div className="border-t pt-4">
                <p className="text-sm font-semibold mb-3">Step 2 — Confirm Backfill</p>
                {!confirmed ? (
                  <div className="flex items-center gap-3">
                    <Button
                      variant="destructive"
                      onClick={() => setConfirmed(true)}
                    >
                      <CheckCircle2 className="h-4 w-4 mr-1.5" />
                      Mark {dryRunResult.wouldUpdate} Actions Complete for {dryRunResult.org.name}
                    </Button>
                  </div>
                ) : (
                  <div className="flex flex-wrap items-center gap-3">
                    <Button
                      onClick={() => executeMutation.mutate(selectedOrgId)}
                      disabled={executeMutation.isPending}
                      className="bg-green-700 hover:bg-green-800 text-white"
                    >
                      {executeMutation.isPending
                        ? <><Loader2 className="h-4 w-4 mr-1.5 animate-spin" />Running Backfill…</>
                        : <><RefreshCw className="h-4 w-4 mr-1.5" />Execute Backfill Now</>}
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => setConfirmed(false)}>
                      Cancel
                    </Button>
                    <span className="text-xs text-red-600 font-medium">
                      Click to confirm — this writes to the database for {dryRunResult.org.name} only.
                    </span>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Execute results */}
      {executeResult && (
        <Card className="border-green-200 bg-green-50/40">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2 text-green-800">
              <CheckCircle2 className="h-5 w-5 text-green-600" />
              Backfill Complete — {executeResult.org.name}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
              <div className="rounded-lg border border-green-200 bg-green-50 px-3 py-4">
                <div className="text-3xl font-bold text-green-700">{executeResult.totalActions}</div>
                <div className="text-xs text-muted-foreground mt-0.5">Total Actions</div>
              </div>
              <div className="rounded-lg border border-green-200 bg-green-50 px-3 py-4">
                <div className="text-3xl font-bold text-green-700">{executeResult.updated}</div>
                <div className="text-xs text-muted-foreground mt-0.5">Updated</div>
              </div>
              <div className="rounded-lg border border-green-200 bg-green-50 px-3 py-4">
                <div className="text-3xl font-bold text-green-700">{executeResult.created}</div>
                <div className="text-xs text-muted-foreground mt-0.5">Records Created</div>
              </div>
              <div className="rounded-lg border bg-muted/20 px-3 py-4">
                <div className="text-3xl font-bold text-muted-foreground">{executeResult.alreadyComplete}</div>
                <div className="text-xs text-muted-foreground mt-0.5">Already Complete</div>
              </div>
            </div>

            <div className="text-sm text-green-800 bg-green-100 border border-green-200 rounded px-4 py-3 space-y-1">
              <p className="font-semibold">✓ Backfill complete</p>
              <ul className="text-xs space-y-0.5 list-disc ml-4">
                <li>{executeResult.updated} existing progress records updated to Complete.</li>
                <li>{executeResult.created} new progress records created as Complete.</li>
                <li>{executeResult.checklistUpdated} checklist items marked complete.</li>
                <li>{executeResult.stepsUpdated} procedure steps marked complete.</li>
                <li>Audit log written: one entry per action + one summary entry.</li>
                <li>No other organizations were affected.</li>
              </ul>
            </div>

            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setExecuteResult(null);
                setDryRunResult(null);
                dryRunMutation.mutate(selectedOrgId);
              }}
            >
              <Play className="h-3.5 w-3.5 mr-1.5" />
              Run dry-run again to verify
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
