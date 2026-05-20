import { useState } from "react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { useOrg } from "@/context/OrgContext";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { ArrowLeft, TrendingUp, Search } from "lucide-react";
import { cn } from "@/lib/utils";

function makeHeaders(orgId: string) {
  const token = localStorage.getItem("auth_token");
  return {
    Authorization: `Bearer ${token}`,
    "X-Organization-ID": orgId,
  };
}

const SUPPORT_COLORS: Record<string, string> = {
  full_support: "bg-emerald-500/80 text-white",
  partial_support: "bg-blue-500/60 text-white",
  evidence_only: "bg-yellow-500/60 text-white",
  doc_only: "bg-purple-500/60 text-white",
  monitoring_only: "bg-cyan-500/60 text-white",
};

const SUPPORT_ABBR: Record<string, string> = {
  full_support: "F",
  partial_support: "P",
  evidence_only: "E",
  doc_only: "D",
  monitoring_only: "M",
};

const STATUS_COLORS: Record<string, string> = {
  not_started: "text-slate-400",
  in_progress: "text-blue-400",
  evidence_needed: "text-yellow-400",
  ready_for_review: "text-purple-400",
  complete: "text-emerald-400",
  blocked: "text-red-400",
};

interface MatrixAction {
  id: string;
  title: string;
  priority: string;
  phase: number;
  status: string;
}

interface MatrixControl {
  controlId: string;
  controlRef: string;
  controlTitle: string;
  level: string;
  domain: string;
}

interface CoverageData {
  actions: MatrixAction[];
  controls: MatrixControl[];
  matrix: Record<string, string>;
}

const PRIORITY_ORDER = { critical: 0, high: 1, medium: 2, low: 3 };

export default function RoadmapCoverage() {
  const { activeOrg } = useOrg();
  const [filterDomain, setFilterDomain] = useState("all");
  const [searchControl, setSearchControl] = useState("");
  const [filterPriority, setFilterPriority] = useState("all");

  const { data, isLoading } = useQuery<CoverageData>({
    queryKey: ["roadmap-coverage", activeOrg?.id, filterDomain],
    enabled: !!activeOrg?.id,
    queryFn: async () => {
      const params = filterDomain !== "all" ? `?domain=${encodeURIComponent(filterDomain)}` : "";
      const res = await fetch(`/api/roadmap/coverage-matrix${params}`, {
        headers: makeHeaders(activeOrg!.id),
      });
      if (!res.ok) throw new Error("Failed to load coverage");
      return res.json();
    },
  });

  const domains = data
    ? [...new Set(data.controls.map((c) => c.domain))].sort()
    : [];

  const filteredControls = (data?.controls ?? []).filter((c) => {
    if (searchControl && !c.controlRef.toLowerCase().includes(searchControl.toLowerCase()) &&
        !c.domain.toLowerCase().includes(searchControl.toLowerCase())) return false;
    return true;
  });

  const filteredActions = (data?.actions ?? [])
    .filter((a) => filterPriority === "all" || a.priority === filterPriority)
    .sort((a, b) => PRIORITY_ORDER[a.priority as keyof typeof PRIORITY_ORDER] - PRIORITY_ORDER[b.priority as keyof typeof PRIORITY_ORDER]);

  const getCoverage = (actionId: string, controlId: string) =>
    data?.matrix[`${actionId}:${controlId}`] ?? null;

  const getControlCoverageCount = (controlId: string) =>
    filteredActions.filter((a) => getCoverage(a.id, controlId) !== null).length;

  if (isLoading) {
    return (
      <div className="flex justify-center py-24">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  return (
    <div className="p-6 max-w-full space-y-6">
      <div>
        <Link href="/roadmap">
          <button className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-4 transition-colors">
            <ArrowLeft className="h-4 w-4" />
            Implementation Roadmap
          </button>
        </Link>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <TrendingUp className="h-6 w-6 text-primary" />
          Coverage Matrix
        </h1>
        <p className="text-muted-foreground text-sm mt-1">
          Shows which roadmap actions support which CMMC controls. F=Full, P=Partial, E=Evidence Only, D=Doc Only, M=Monitoring Only.
        </p>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-3 text-xs">
        {[
          { key: "full_support", label: "Full Support" },
          { key: "partial_support", label: "Partial Support" },
          { key: "evidence_only", label: "Evidence Only" },
          { key: "doc_only", label: "Doc Only" },
          { key: "monitoring_only", label: "Monitoring Only" },
        ].map((l) => (
          <div key={l.key} className="flex items-center gap-1.5">
            <span className={cn("w-5 h-5 rounded text-[10px] font-bold flex items-center justify-center", SUPPORT_COLORS[l.key])}>
              {SUPPORT_ABBR[l.key]}
            </span>
            <span className="text-muted-foreground">{l.label}</span>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-center">
        <div className="relative min-w-40">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Filter controls…"
            value={searchControl}
            onChange={(e) => setSearchControl(e.target.value)}
            className="pl-9 h-8 text-sm"
          />
        </div>
        <Select value={filterDomain} onValueChange={setFilterDomain}>
          <SelectTrigger className="w-48 h-8 text-sm">
            <SelectValue placeholder="Domain" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All domains</SelectItem>
            {domains.map((d) => (
              <SelectItem key={d} value={d}>{d}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={filterPriority} onValueChange={setFilterPriority}>
          <SelectTrigger className="w-36 h-8 text-sm">
            <SelectValue placeholder="Priority" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All priorities</SelectItem>
            <SelectItem value="critical">Critical</SelectItem>
            <SelectItem value="high">High</SelectItem>
            <SelectItem value="medium">Medium</SelectItem>
            <SelectItem value="low">Low</SelectItem>
          </SelectContent>
        </Select>
        <span className="text-xs text-muted-foreground">
          {filteredActions.length} actions × {filteredControls.length} controls
        </span>
      </div>

      {/* Matrix */}
      <div className="overflow-auto rounded-lg border bg-card">
        <table className="min-w-max text-xs border-collapse">
          <thead>
            <tr className="bg-muted/40 border-b">
              <th className="sticky left-0 z-10 bg-muted/60 text-left p-3 font-semibold min-w-40 border-r">
                Control
              </th>
              <th className="p-2 text-left font-medium text-muted-foreground min-w-16 border-r">
                Coverage
              </th>
              {filteredActions.map((action) => (
                <th
                  key={action.id}
                  className="p-2 min-w-10 border-r last:border-r-0 align-bottom"
                  title={action.title}
                >
                  <div className="flex flex-col items-center gap-1">
                    <div
                      className={cn(
                        "w-2 h-2 rounded-full shrink-0",
                        STATUS_COLORS[action.status].replace("text-", "bg-").replace("/400", "")
                      )}
                      style={{
                        backgroundColor:
                          action.status === "complete" ? "#34d399" :
                          action.status === "in_progress" ? "#60a5fa" :
                          action.status === "blocked" ? "#f87171" :
                          "#94a3b8",
                      }}
                    />
                    <Link href={`/roadmap/${action.id}`}>
                      <span
                        className="text-[9px] text-muted-foreground hover:text-primary cursor-pointer transition-colors"
                        style={{ writingMode: "vertical-rl", transform: "rotate(180deg)", maxHeight: 80 }}
                      >
                        {action.title.length > 24 ? action.title.slice(0, 22) + "…" : action.title}
                      </span>
                    </Link>
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filteredControls.map((ctrl, i) => {
              const coverageCount = getControlCoverageCount(ctrl.controlId);
              return (
                <tr
                  key={ctrl.controlId}
                  className={cn(
                    "border-b last:border-b-0 hover:bg-muted/20 transition-colors",
                    i % 2 === 0 ? "" : "bg-muted/5"
                  )}
                >
                  <td className="sticky left-0 z-10 bg-card p-3 border-r font-mono">
                    <Link href={`/controls/${ctrl.controlId}`}>
                      <span className="text-primary hover:underline cursor-pointer font-bold text-[11px]">
                        {ctrl.controlRef}
                      </span>
                    </Link>
                    <div className="text-[9px] text-muted-foreground truncate max-w-32 mt-0.5">
                      {ctrl.domain}
                    </div>
                  </td>
                  <td className="p-2 border-r text-center">
                    {coverageCount > 0 ? (
                      <span className="text-primary font-bold">{coverageCount}</span>
                    ) : (
                      <span className="text-muted-foreground/40">—</span>
                    )}
                  </td>
                  {filteredActions.map((action) => {
                    const support = getCoverage(action.id, ctrl.controlId);
                    return (
                      <td
                        key={action.id}
                        className="p-1 text-center border-r last:border-r-0"
                      >
                        {support ? (
                          <span
                            className={cn(
                              "inline-flex items-center justify-center w-5 h-5 rounded text-[9px] font-bold",
                              SUPPORT_COLORS[support]
                            )}
                            title={`${action.title}: ${support.replace(/_/g, " ")}`}
                          >
                            {SUPPORT_ABBR[support]}
                          </span>
                        ) : (
                          <span className="text-muted-foreground/20 text-[10px]">·</span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
