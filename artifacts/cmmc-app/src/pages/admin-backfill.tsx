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
  ClipboardList, SkipForward, RefreshCw,
} from "lucide-react";

interface Org { id: string; name: string; legalName: string | null }

interface DryRunResult {
  org: Org;
  totalControls: number;
  wouldUpdate: number;
  existingNarrative: number;
  missingGuidance: number;
  preview: { controlRef: string; title: string; guidancePreview: string }[];
  missingGuidanceControls: { controlRef: string; title: string }[];
}

interface ExecuteResult {
  org: Org;
  updated: number;
  skippedExisting: number;
  skippedNoGuidance: number;
  total: number;
}

function authHeaders(): Record<string, string> {
  const token = localStorage.getItem("auth_token");
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export default function AdminBackfill() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [selectedOrgId, setSelectedOrgId] = useState<string>("");
  const [dryRunResult, setDryRunResult] = useState<DryRunResult | null>(null);
  const [executeResult, setExecuteResult] = useState<ExecuteResult | null>(null);
  const [confirmed, setConfirmed] = useState(false);

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
      const r = await fetch(`/api/admin/backfill/narratives?orgId=${encodeURIComponent(orgId)}`, {
        headers: authHeaders(),
      });
      if (!r.ok) throw new Error(await r.text());
      return r.json() as Promise<DryRunResult>;
    },
    onSuccess: (data) => {
      setDryRunResult(data);
      setExecuteResult(null);
      setConfirmed(false);
    },
    onError: (e: Error) => toast({ title: "Dry-run failed", description: e.message, variant: "destructive" }),
  });

  const executeMutation = useMutation({
    mutationFn: async (orgId: string) => {
      const r = await fetch("/api/admin/backfill/narratives", {
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
      toast({ title: `Backfill complete — ${data.updated} controls updated` });
    },
    onError: (e: Error) => toast({ title: "Backfill failed", description: e.message, variant: "destructive" }),
  });

  const handleOrgChange = (orgId: string) => {
    setSelectedOrgId(orgId);
    setDryRunResult(null);
    setExecuteResult(null);
    setConfirmed(false);
  };

  const selectedOrg = orgs?.find(o => o.id === selectedOrgId);

  return (
    <div className="max-w-3xl mx-auto py-8 px-4 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <ClipboardList className="h-6 w-6 text-primary" />
          Narrative Backfill Tool
        </h1>
        <p className="text-muted-foreground text-sm mt-1">
          Copies global Implementation Guidance into an organization's blank Implementation Narratives.
          Existing narratives are never overwritten.
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
                <li>Only the selected organization is affected — global controls are never modified.</li>
                <li>Controls with an existing implementation narrative are skipped.</li>
                <li>One audit log entry is written per updated control.</li>
                <li>Always run the dry-run first and review before confirming.</li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Org selector + dry-run */}
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
                    {orgs?.map(o => (
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
              <ClipboardList className="h-4 w-4 text-blue-600" />
              Dry-Run Results — {dryRunResult.org.name}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Stats grid */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
              <div className="rounded-lg border bg-muted/20 px-3 py-3">
                <div className="text-2xl font-bold">{dryRunResult.totalControls}</div>
                <div className="text-xs text-muted-foreground">Total Controls</div>
              </div>
              <div className="rounded-lg border border-green-200 bg-green-50 px-3 py-3">
                <div className="text-2xl font-bold text-green-700">{dryRunResult.wouldUpdate}</div>
                <div className="text-xs text-muted-foreground">Would Update</div>
              </div>
              <div className="rounded-lg border bg-muted/20 px-3 py-3">
                <div className="text-2xl font-bold text-muted-foreground">{dryRunResult.existingNarrative}</div>
                <div className="text-xs text-muted-foreground">Skip (has narrative)</div>
              </div>
              <div className={`rounded-lg border px-3 py-3 ${dryRunResult.missingGuidance > 0 ? "border-orange-200 bg-orange-50" : "bg-muted/20"}`}>
                <div className={`text-2xl font-bold ${dryRunResult.missingGuidance > 0 ? "text-orange-700" : "text-muted-foreground"}`}>
                  {dryRunResult.missingGuidance}
                </div>
                <div className="text-xs text-muted-foreground">Skip (no guidance)</div>
              </div>
            </div>

            {/* Preview */}
            {dryRunResult.preview.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                  Preview — first {dryRunResult.preview.length} controls to be updated
                </p>
                <div className="divide-y rounded border">
                  {dryRunResult.preview.map((p, i) => (
                    <div key={i} className="px-4 py-2.5">
                      <div className="flex items-center gap-2 mb-0.5">
                        <code className="text-xs font-mono bg-muted px-1.5 py-0.5 rounded">{p.controlRef}</code>
                        <span className="text-xs font-medium truncate">{p.title}</span>
                      </div>
                      <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed">{p.guidancePreview}…</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Missing guidance list */}
            {dryRunResult.missingGuidanceControls.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-orange-700 uppercase tracking-wide mb-2">
                  Controls with no guidance (will be skipped)
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {dryRunResult.missingGuidanceControls.map((c, i) => (
                    <Badge key={i} className="bg-orange-100 text-orange-800 border-orange-200 text-xs font-mono">{c.controlRef}</Badge>
                  ))}
                </div>
              </div>
            )}

            {/* Zero-update state */}
            {dryRunResult.wouldUpdate === 0 && (
              <div className="flex items-center gap-2 text-sm text-green-700 bg-green-50 border border-green-200 rounded px-4 py-3">
                <CheckCircle2 className="h-4 w-4 flex-shrink-0" />
                All controls already have implementation narratives — nothing to update.
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
                      Confirm — Update {dryRunResult.wouldUpdate} Controls
                    </Button>
                    <span className="text-xs text-muted-foreground">
                      This will copy guidance into blank narratives for {dryRunResult.org.name} only.
                    </span>
                  </div>
                ) : (
                  <div className="flex items-center gap-3">
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
                    <span className="text-xs text-red-600 font-medium">Click again to execute — this writes to the database.</span>
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
            <div className="grid grid-cols-3 gap-3 text-center">
              <div className="rounded-lg border border-green-200 bg-green-50 px-3 py-4">
                <div className="text-3xl font-bold text-green-700">{executeResult.updated}</div>
                <div className="text-xs text-muted-foreground mt-0.5">Controls updated</div>
              </div>
              <div className="rounded-lg border bg-muted/20 px-3 py-4">
                <div className="text-3xl font-bold text-muted-foreground">{executeResult.skippedExisting}</div>
                <div className="text-xs text-muted-foreground mt-0.5">Skipped (had narrative)</div>
              </div>
              <div className={`rounded-lg border px-3 py-4 ${executeResult.skippedNoGuidance > 0 ? "border-orange-200 bg-orange-50" : "bg-muted/20"}`}>
                <div className={`text-3xl font-bold ${executeResult.skippedNoGuidance > 0 ? "text-orange-700" : "text-muted-foreground"}`}>
                  {executeResult.skippedNoGuidance}
                </div>
                <div className="text-xs text-muted-foreground mt-0.5">Skipped (no guidance)</div>
              </div>
            </div>
            <div className="text-sm text-green-800 bg-green-100 border border-green-200 rounded px-4 py-3 space-y-1">
              <p className="font-semibold">✓ Backfill complete</p>
              <ul className="text-xs space-y-0.5 list-disc ml-4">
                <li>{executeResult.updated} implementation narratives copied from global guidance.</li>
                <li>One audit log entry written per updated control.</li>
                <li>Control status was not changed.</li>
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
              <SkipForward className="h-3.5 w-3.5 mr-1.5" />
              Run dry-run again to verify
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
