import { useState, useCallback, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import { useOrg } from "@/context/OrgContext";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import {
  ChevronLeft,
  CheckCircle2,
  Clock3,
  Flag,
  HelpCircle,
  MinusCircle,
  ArrowRight,
  Loader2,
  AlertTriangle,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ── Types ─────────────────────────────────────────────────────────────────────

type Assessment = {
  id: string;
  name: string;
  targetLevel: string;
  status: string;
};

type Control = {
  id: string;
  controlId: string;
  title: string;
  level: string;
  domainId: string;
  domainName: string;
};

type Finding = {
  id: string;
  assessmentId: string;
  controlId: string;
  result: "met" | "partially_met" | "not_met" | "unknown" | "not_applicable";
  notes: string | null;
  evidenceExists: boolean;
  evidenceApproved: boolean;
  policyExists: boolean;
  procedureExists: boolean;
  sspNarrativeExists: boolean;
  testCompleted: boolean;
};

// ── Constants ─────────────────────────────────────────────────────────────────

const RESULTS = [
  { value: "met", label: "Met", icon: CheckCircle2, cls: "border-green-300 text-green-700 hover:bg-green-50", activeCls: "bg-green-600 border-green-600 text-white" },
  { value: "partially_met", label: "Partial", icon: Clock3, cls: "border-yellow-300 text-yellow-700 hover:bg-yellow-50", activeCls: "bg-yellow-500 border-yellow-500 text-white" },
  { value: "not_met", label: "Not Met", icon: Flag, cls: "border-red-300 text-red-700 hover:bg-red-50", activeCls: "bg-red-600 border-red-600 text-white" },
  { value: "unknown", label: "Unknown", icon: HelpCircle, cls: "border-slate-300 text-slate-600 hover:bg-slate-50", activeCls: "bg-slate-600 border-slate-600 text-white" },
  { value: "not_applicable", label: "N/A", icon: MinusCircle, cls: "border-slate-200 text-slate-400 hover:bg-slate-50", activeCls: "bg-slate-400 border-slate-400 text-white" },
] as const;

const CHECKBOXES: { key: keyof Finding; label: string }[] = [
  { key: "evidenceExists", label: "Evidence exists" },
  { key: "evidenceApproved", label: "Evidence approved" },
  { key: "policyExists", label: "Policy exists" },
  { key: "procedureExists", label: "Procedure exists" },
  { key: "sspNarrativeExists", label: "SSP narrative" },
  { key: "testCompleted", label: "Test completed" },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function getResultColor(result: string) {
  if (result === "met") return "text-green-600";
  if (result === "partially_met") return "text-yellow-600";
  if (result === "not_met") return "text-red-600";
  return "text-slate-400";
}

// ── Main component ────────────────────────────────────────────────────────────

export default function ReadinessAssess({ id }: { id: string }) {
  const { activeOrg } = useOrg();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const token = localStorage.getItem("auth_token");

  const [selectedDomain, setSelectedDomain] = useState<string | null>(null);
  const [expandedControl, setExpandedControl] = useState<string | null>(null);
  const [localFindings, setLocalFindings] = useState<Record<string, Partial<Finding>>>({});
  const savingRef = useRef<Set<string>>(new Set());
  const [savingIds, setSavingIds] = useState<Set<string>>(new Set());

  const headers = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
    "X-Organization-ID": activeOrg?.id ?? "",
  };

  // ── Fetch assessment ────────────────────────────────────────────────────────
  const { data: assessment, isLoading: loadingAssessment } = useQuery<Assessment>({
    queryKey: ["readiness-assessment", id],
    enabled: !!id && !!token,
    queryFn: async () => {
      const res = await fetch(`/api/readiness/assessments/${id}`, { headers });
      if (!res.ok) throw new Error("Not found");
      return res.json();
    },
  });

  // ── Fetch all controls ──────────────────────────────────────────────────────
  const { data: allControls = [], isLoading: loadingControls } = useQuery<Control[]>({
    queryKey: ["controls-all"],
    enabled: !!token,
    queryFn: async () => {
      const res = await fetch("/api/controls", {
        headers: {
          Authorization: `Bearer ${token}`,
          "X-Organization-ID": activeOrg?.id ?? "",
        },
      });
      if (!res.ok) throw new Error("Failed to load controls");
      return res.json();
    },
    staleTime: 60000,
  });

  // ── Fetch existing findings ─────────────────────────────────────────────────
  const { data: serverFindings = [] } = useQuery<Finding[]>({
    queryKey: ["readiness-findings", id],
    enabled: !!id && !!token,
    queryFn: async () => {
      const res = await fetch(`/api/readiness/assessments/${id}/findings`, { headers });
      if (!res.ok) throw new Error("Failed to load findings");
      return res.json();
    },
  });

  // ── Upsert mutation ─────────────────────────────────────────────────────────
  const saveFinding = useMutation({
    mutationFn: async ({ controlDbId, data }: { controlDbId: string; data: Partial<Finding> }) => {
      const res = await fetch(`/api/readiness/assessments/${id}/findings/${controlDbId}`, {
        method: "PUT",
        headers,
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Failed to save");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["readiness-findings", id] });
    },
    onError: () => {
      toast({ title: "Failed to save finding", variant: "destructive" });
    },
  });

  const completeMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/readiness/assessments/${id}/complete`, {
        method: "POST",
        headers,
      });
      if (!res.ok) throw new Error("Failed to complete");
      return res.json();
    },
    onSuccess: () => {
      navigate(`/readiness/${id}/results`);
    },
    onError: () => {
      toast({ title: "Failed to complete assessment", variant: "destructive" });
    },
  });

  // ── Build merged findings map (server + local) ────────────────────────────
  const findingsMap = Object.fromEntries(
    serverFindings.map((f) => [f.controlId, f])
  );
  // overlay local state
  for (const [cid, local] of Object.entries(localFindings)) {
    findingsMap[cid] = { ...(findingsMap[cid] ?? {}), ...local } as Finding;
  }

  // ── Build domain → controls map ────────────────────────────────────────────
  const domainMap: Record<string, { controls: Control[] }> = {};
  for (const ctrl of allControls) {
    const dn = ctrl.domainName ?? "Unknown";
    if (!domainMap[dn]) domainMap[dn] = { controls: [] };
    domainMap[dn].controls.push(ctrl);
  }
  const domains = Object.entries(domainMap).sort((a, b) => a[0].localeCompare(b[0]));

  // Auto-select first domain
  const activeDomain = selectedDomain ?? (domains[0]?.[0] ?? null);
  const domainControls = activeDomain ? (domainMap[activeDomain]?.controls ?? []) : [];

  // ── Progress calculation ────────────────────────────────────────────────────
  const totalControls = allControls.length;
  const answeredControls = Object.values(findingsMap).filter(
    (f) => f?.result && f.result !== "unknown"
  ).length;
  const pct = totalControls > 0 ? Math.round((answeredControls / totalControls) * 100) : 0;

  const getDomainProgress = (domainName: string) => {
    const controls = domainMap[domainName]?.controls ?? [];
    const answered = controls.filter((c) => {
      const f = findingsMap[c.id];
      return f?.result && f.result !== "unknown";
    }).length;
    return { answered, total: controls.length };
  };

  // ── Result click handler ───────────────────────────────────────────────────
  const handleResultClick = useCallback(
    (controlDbId: string, result: string) => {
      const existing = findingsMap[controlDbId];
      const merged: Partial<Finding> = { ...(existing ?? {}), result: result as Finding["result"] };

      setLocalFindings((prev) => ({ ...prev, [controlDbId]: merged }));

      savingRef.current.add(controlDbId);
      setSavingIds(new Set(savingRef.current));

      saveFinding.mutate(
        { controlDbId, data: merged },
        {
          onSettled: () => {
            savingRef.current.delete(controlDbId);
            setSavingIds(new Set(savingRef.current));
          },
        }
      );
    },
    [findingsMap, saveFinding]
  );

  const handleCheckboxChange = useCallback(
    (controlDbId: string, key: keyof Finding, val: boolean) => {
      const existing = findingsMap[controlDbId] ?? {};
      const merged = { ...existing, [key]: val };
      setLocalFindings((prev) => ({ ...prev, [controlDbId]: merged }));
      saveFinding.mutate({ controlDbId, data: merged });
    },
    [findingsMap, saveFinding]
  );

  const handleNotesBlur = useCallback(
    (controlDbId: string, notes: string) => {
      const existing = findingsMap[controlDbId] ?? {};
      const merged = { ...existing, notes };
      setLocalFindings((prev) => ({ ...prev, [controlDbId]: merged }));
      saveFinding.mutate({ controlDbId, data: merged });
    },
    [findingsMap, saveFinding]
  );

  if (loadingAssessment || loadingControls) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary" />
      </div>
    );
  }

  if (!assessment) {
    return (
      <div className="max-w-2xl mx-auto px-6 py-16 text-center">
        <AlertTriangle className="h-8 w-8 text-muted-foreground mx-auto mb-3" />
        <p className="text-lg font-medium">Assessment not found</p>
        <Link href="/readiness" className="text-sm text-primary hover:underline mt-2 inline-block">
          ← Back to Readiness Assessor
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-[calc(100vh-56px)]">
      {/* Top bar */}
      <div className="shrink-0 border-b bg-card px-6 py-3 flex items-center gap-4">
        <Link href="/readiness" className="text-muted-foreground hover:text-foreground">
          <ChevronLeft className="h-4 w-4" />
        </Link>
        <div className="flex-1 min-w-0">
          <h1 className="font-semibold text-sm truncate">{assessment.name}</h1>
          <p className="text-xs text-muted-foreground">
            CMMC {assessment.targetLevel} · {answeredControls} of {totalControls} controls answered
          </p>
        </div>
        {/* Progress bar */}
        <div className="flex items-center gap-3 shrink-0">
          <div className="w-40 h-2 rounded-full bg-muted overflow-hidden">
            <div
              className="h-full bg-primary rounded-full transition-all"
              style={{ width: `${pct}%` }}
            />
          </div>
          <span className="text-xs font-medium text-muted-foreground w-10 text-right">{pct}%</span>
        </div>
        <Button
          size="sm"
          onClick={() => completeMutation.mutate()}
          disabled={completeMutation.isPending}
        >
          {completeMutation.isPending ? (
            <Loader2 className="h-3.5 w-3.5 mr-2 animate-spin" />
          ) : (
            <ArrowRight className="h-3.5 w-3.5 mr-2" />
          )}
          Finish Assessment
        </Button>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* ── Domain sidebar ── */}
        <div className="w-64 shrink-0 border-r bg-muted/20 overflow-y-auto py-2">
          {domains.map(([dn]) => {
            const { answered, total } = getDomainProgress(dn);
            const allDone = answered === total && total > 0;
            const isActive = dn === activeDomain;
            return (
              <button
                key={dn}
                onClick={() => {
                  setSelectedDomain(dn);
                  setExpandedControl(null);
                }}
                className={cn(
                  "w-full text-left px-4 py-2.5 transition-colors",
                  isActive
                    ? "bg-sidebar-accent text-sidebar-accent-foreground"
                    : "hover:bg-muted/40"
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className={cn("text-xs font-medium leading-tight flex-1", isActive ? "" : "text-muted-foreground")}>
                    {dn}
                  </span>
                  <span
                    className={cn(
                      "text-[10px] px-1.5 py-0.5 rounded-full font-semibold shrink-0",
                      allDone
                        ? "bg-green-100 text-green-700"
                        : answered > 0
                        ? "bg-blue-100 text-blue-700"
                        : "bg-muted text-muted-foreground"
                    )}
                  >
                    {answered}/{total}
                  </span>
                </div>
              </button>
            );
          })}
        </div>

        {/* ── Control list ── */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-3">
          {activeDomain && (
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider pb-1">
              {activeDomain}
            </h2>
          )}
          {domainControls.map((ctrl) => {
            const finding = findingsMap[ctrl.id] as Finding | undefined;
            const result = finding?.result ?? "unknown";
            const isSaving = savingIds.has(ctrl.id);
            const isExpanded = expandedControl === ctrl.id;

            return (
              <div
                key={ctrl.id}
                className={cn(
                  "rounded-lg border bg-card transition-all",
                  result !== "unknown" ? "border-l-4" : "",
                  result === "met" ? "border-l-green-500" : "",
                  result === "partially_met" ? "border-l-yellow-500" : "",
                  result === "not_met" ? "border-l-red-500" : "",
                  result === "not_applicable" ? "border-l-slate-300" : ""
                )}
              >
                {/* Control header */}
                <button
                  className="w-full text-left px-4 py-3 flex items-start gap-3"
                  onClick={() => setExpandedControl(isExpanded ? null : ctrl.id)}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-mono font-semibold text-muted-foreground shrink-0">
                        {ctrl.controlId}
                      </span>
                      {ctrl.level === "L1" && (
                        <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded bg-blue-100 text-blue-700">L1</span>
                      )}
                      {isSaving && (
                        <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
                      )}
                    </div>
                    <p className="text-sm mt-0.5 leading-snug">{ctrl.title}</p>
                  </div>
                  {result !== "unknown" && (
                    <span className={cn("text-xs font-semibold shrink-0 mt-0.5", getResultColor(result))}>
                      {RESULTS.find((r) => r.value === result)?.label}
                    </span>
                  )}
                </button>

                {/* Result selector — always visible */}
                <div className="px-4 pb-3 flex flex-wrap gap-1.5">
                  {RESULTS.map((opt) => {
                    const Icon = opt.icon;
                    const isActive = result === opt.value;
                    return (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => handleResultClick(ctrl.id, opt.value)}
                        className={cn(
                          "flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium border transition-all",
                          isActive ? opt.activeCls : opt.cls
                        )}
                      >
                        <Icon className="h-3 w-3" />
                        {opt.label}
                      </button>
                    );
                  })}
                </div>

                {/* Expanded details */}
                {isExpanded && (
                  <div className="px-4 pb-4 space-y-4 border-t pt-4">
                    {/* Checkboxes */}
                    <div>
                      <p className="text-xs font-semibold text-muted-foreground mb-2">Evidence &amp; Documentation Signals</p>
                      <div className="grid grid-cols-3 gap-x-4 gap-y-2">
                        {CHECKBOXES.map(({ key, label }) => (
                          <label key={key} className="flex items-center gap-2 cursor-pointer select-none">
                            <input
                              type="checkbox"
                              checked={(finding?.[key] as boolean | undefined) ?? false}
                              onChange={(e) =>
                                handleCheckboxChange(ctrl.id, key, e.target.checked)
                              }
                              className="h-3.5 w-3.5 rounded border-input accent-primary"
                            />
                            <span className="text-xs text-muted-foreground">{label}</span>
                          </label>
                        ))}
                      </div>
                    </div>

                    {/* Notes */}
                    <div>
                      <p className="text-xs font-semibold text-muted-foreground mb-1.5">Notes</p>
                      <textarea
                        defaultValue={finding?.notes ?? ""}
                        onBlur={(e) => handleNotesBlur(ctrl.id, e.target.value)}
                        rows={2}
                        placeholder="Add assessment notes, observations, or gaps…"
                        className="w-full text-sm rounded-md border border-input bg-transparent px-3 py-2 resize-none focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                      />
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
