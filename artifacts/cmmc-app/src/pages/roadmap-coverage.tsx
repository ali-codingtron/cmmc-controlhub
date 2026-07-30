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
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  ArrowLeft,
  TrendingUp,
  Search,
  CheckCircle2,
  CircleDashed,
  FileText,
  BookOpen,
  Activity,
  Circle,
  Clock,
  Ban,
  FileSearch,
} from "lucide-react";
import { cn } from "@/lib/utils";

function makeHeaders(orgId: string) {
  const token = localStorage.getItem("auth_token");
  return {
    Authorization: `Bearer ${token}`,
    "X-Organization-ID": orgId,
  };
}

const SUPPORT_LABEL: Record<string, string> = {
  full_support: "Full Support",
  partial_support: "Partial Support",
  evidence_only: "Evidence Support",
  doc_only: "Document Support",
  monitoring_only: "Monitoring Support",
};

function SupportIcon({ support, className }: { support: string; className?: string }) {
  const base = "h-4 w-4";
  switch (support) {
    case "full_support":
      return <CheckCircle2 className={cn(base, "text-emerald-600 dark:text-emerald-400", className)} />;
    case "partial_support":
      return <CircleDashed className={cn(base, "text-blue-600 dark:text-blue-400", className)} />;
    case "evidence_only":
      return <FileText className={cn(base, "text-amber-600 dark:text-amber-400", className)} />;
    case "doc_only":
      return <BookOpen className={cn(base, "text-slate-500 dark:text-slate-400", className)} />;
    case "monitoring_only":
      return <Activity className={cn(base, "text-purple-600 dark:text-purple-400", className)} />;
    default:
      return null;
  }
}

function StatusIcon({ status }: { status: string }) {
  const base = "h-3 w-3";
  switch (status) {
    case "complete":
      return <CheckCircle2 className={cn(base, "text-emerald-400")} />;
    case "in_progress":
      return <Clock className={cn(base, "text-blue-400")} />;
    case "blocked":
      return <Ban className={cn(base, "text-red-400")} />;
    case "evidence_needed":
      return <FileSearch className={cn(base, "text-yellow-400")} />;
    case "ready_for_review":
      return <Circle className={cn(base, "text-purple-400")} />;
    default:
      return <Circle className={cn(base, "text-slate-400")} />;
  }
}

const LEGEND_ITEMS = [
  { key: "full_support", label: "Full Support" },
  { key: "partial_support", label: "Partial Support" },
  { key: "evidence_only", label: "Evidence Support" },
  { key: "doc_only", label: "Document Support" },
  { key: "monitoring_only", label: "Monitoring Support" },
];

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
    if (
      searchControl &&
      !c.controlRef.toLowerCase().includes(searchControl.toLowerCase()) &&
      !c.domain.toLowerCase().includes(searchControl.toLowerCase())
    )
      return false;
    return true;
  });

  const filteredActions = (data?.actions ?? [])
    .filter((a) => filterPriority === "all" || a.priority === filterPriority)
    .sort(
      (a, b) =>
        PRIORITY_ORDER[a.priority as keyof typeof PRIORITY_ORDER] -
        PRIORITY_ORDER[b.priority as keyof typeof PRIORITY_ORDER]
    );

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
    <TooltipProvider delayDuration={200}>
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
            Shows which roadmap actions support which CMMC controls. Hover cells for details.
          </p>
        </div>

        {/* Legend */}
        <div className="flex flex-wrap gap-4 text-xs">
          {LEGEND_ITEMS.map((l) => (
            <div key={l.key} className="flex items-center gap-1.5">
              <SupportIcon support={l.key} />
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
                <SelectItem key={d} value={d}>
                  {d}
                </SelectItem>
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
              <tr className="sticky top-0 z-20 bg-muted/90 backdrop-blur-sm border-b">
                <th className="sticky left-0 z-30 bg-muted/90 backdrop-blur-sm text-left p-3 font-semibold min-w-40 border-r">
                  Control
                </th>
                <th className="sticky top-0 p-2 text-left font-medium text-muted-foreground min-w-16 border-r bg-muted/90 backdrop-blur-sm">
                  Coverage
                </th>
                {filteredActions.map((action) => (
                  <th
                    key={action.id}
                    className="sticky top-0 p-2 min-w-10 border-r last:border-r-0 align-bottom bg-muted/90 backdrop-blur-sm"
                  >
                    <div className="flex flex-col items-center gap-1">
                      <StatusIcon status={action.status} />
                      <Link href={`/roadmap/${action.id}`}>
                        <span
                          className="text-[9px] text-muted-foreground hover:text-primary cursor-pointer transition-colors"
                          style={{
                            writingMode: "vertical-rl",
                            transform: "rotate(180deg)",
                            maxHeight: 80,
                          }}
                        >
                          {action.title.length > 24
                            ? action.title.slice(0, 22) + "…"
                            : action.title}
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
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Link href={`/controls/${ctrl.controlId}`}>
                            <span className="text-primary hover:underline cursor-pointer font-bold text-[11px]">
                              {ctrl.controlRef}
                            </span>
                          </Link>
                        </TooltipTrigger>
                        <TooltipContent side="right">
                          <p>{ctrl.controlTitle}</p>
                        </TooltipContent>
                      </Tooltip>
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
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span className="inline-flex items-center justify-center w-5 h-5">
                                  <SupportIcon support={support} />
                                </span>
                              </TooltipTrigger>
                              <TooltipContent>
                                <p>
                                  {action.title}: {SUPPORT_LABEL[support] ?? support.replace(/_/g, " ")}
                                </p>
                              </TooltipContent>
                            </Tooltip>
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
    </TooltipProvider>
  );
}
