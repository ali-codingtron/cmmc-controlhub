import { useState } from "react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { useOrg } from "@/context/OrgContext";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import {
  Zap,
  Search,
  ChevronRight,
  Target,
  TrendingUp,
  CheckCircle2,
  Clock,
  AlertTriangle,
  Circle,
  Ban,
  FileSearch,
  Map,
} from "lucide-react";
import { cn } from "@/lib/utils";

function makeHeaders(orgId: string) {
  const token = localStorage.getItem("auth_token");
  return {
    Authorization: `Bearer ${token}`,
    "X-Organization-ID": orgId,
    "Content-Type": "application/json",
  };
}

interface RoadmapAction {
  id: string;
  title: string;
  category: string;
  phase: number;
  phaseName: string;
  priority: "critical" | "high" | "medium" | "low";
  effort: "low" | "medium" | "high";
  impactScore: number;
  sortOrder: number;
  controlsCount: number;
  fullSupportCount: number;
  partialSupportCount: number;
  domains: string[];
  status: string;
  owner: string | null;
  targetDate: string | null;
  result: string | null;
  checklistTotal: number;
  checklistCompleted: number;
}

const PRIORITY_ORDER = { critical: 0, high: 1, medium: 2, low: 3 };
const PHASE_COLORS: Record<number, string> = {
  1: "bg-purple-500/20 text-purple-300 border-purple-500/30",
  2: "bg-blue-500/20 text-blue-300 border-blue-500/30",
  3: "bg-cyan-500/20 text-cyan-300 border-cyan-500/30",
  4: "bg-emerald-500/20 text-emerald-300 border-emerald-500/30",
  5: "bg-orange-500/20 text-orange-300 border-orange-500/30",
  6: "bg-rose-500/20 text-rose-300 border-rose-500/30",
};

function PriorityBadge({ priority }: { priority: string }) {
  const cfg = {
    critical: "bg-red-500/20 text-red-300 border-red-500/30",
    high: "bg-orange-500/20 text-orange-300 border-orange-500/30",
    medium: "bg-yellow-500/20 text-yellow-300 border-yellow-500/30",
    low: "bg-slate-500/20 text-slate-300 border-slate-500/30",
  }[priority] ?? "bg-slate-500/20 text-slate-300";
  return (
    <span className={cn("text-[10px] font-semibold px-2 py-0.5 rounded border uppercase tracking-wide", cfg)}>
      {priority}
    </span>
  );
}

function StatusBadge({ status }: { status: string }) {
  const cfg: Record<string, { icon: React.ReactNode; label: string; cls: string }> = {
    not_started: { icon: <Circle className="h-3 w-3" />, label: "Not Started", cls: "text-slate-400" },
    in_progress: { icon: <Clock className="h-3 w-3" />, label: "In Progress", cls: "text-blue-400" },
    evidence_needed: { icon: <FileSearch className="h-3 w-3" />, label: "Evidence Needed", cls: "text-yellow-400" },
    ready_for_review: { icon: <Target className="h-3 w-3" />, label: "Ready for Review", cls: "text-purple-400" },
    complete: { icon: <CheckCircle2 className="h-3 w-3" />, label: "Complete", cls: "text-emerald-400" },
    blocked: { icon: <Ban className="h-3 w-3" />, label: "Blocked", cls: "text-red-400" },
  };
  const s = cfg[status] ?? cfg.not_started;
  return (
    <span className={cn("flex items-center gap-1 text-xs", s.cls)}>
      {s.icon}
      {s.label}
    </span>
  );
}

function EffortBadge({ effort }: { effort: string }) {
  const colors = { low: "text-emerald-400", medium: "text-yellow-400", high: "text-red-400" };
  return (
    <span className={cn("text-xs capitalize", colors[effort as keyof typeof colors] ?? "text-slate-400")}>
      {effort} effort
    </span>
  );
}

const PHASES = [
  { phase: 1, name: "Foundation" },
  { phase: 2, name: "Identity & Access" },
  { phase: 3, name: "Endpoint & System" },
  { phase: 4, name: "Logging & Monitoring" },
  { phase: 5, name: "Risk & Remediation" },
  { phase: 6, name: "Audit Preparation" },
];

export default function RoadmapActions() {
  const { activeOrg } = useOrg();
  const [search, setSearch] = useState("");
  const [filterPriority, setFilterPriority] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterPhase, setFilterPhase] = useState("all");
  const [sortBy, setSortBy] = useState<"impact" | "priority" | "phase">("impact");

  const { data: actions = [], isLoading } = useQuery<RoadmapAction[]>({
    queryKey: ["roadmap-actions", activeOrg?.id],
    enabled: !!activeOrg?.id,
    queryFn: async () => {
      const res = await fetch("/api/roadmap/actions", {
        headers: makeHeaders(activeOrg!.id),
      });
      if (!res.ok) throw new Error("Failed to load actions");
      return res.json();
    },
  });

  const filtered = actions
    .filter((a) => {
      if (search && !a.title.toLowerCase().includes(search.toLowerCase()) &&
          !a.category.toLowerCase().includes(search.toLowerCase())) return false;
      if (filterPriority !== "all" && a.priority !== filterPriority) return false;
      if (filterStatus !== "all" && a.status !== filterStatus) return false;
      if (filterPhase !== "all" && String(a.phase) !== filterPhase) return false;
      return true;
    })
    .sort((a, b) => {
      if (sortBy === "impact") return b.impactScore - a.impactScore;
      if (sortBy === "priority") return PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority];
      return a.phase - b.phase;
    });

  const totalComplete = actions.filter((a) => a.status === "complete").length;
  const totalInProgress = actions.filter((a) => a.status === "in_progress").length;
  const totalBlocked = actions.filter((a) => a.status === "blocked").length;
  const totalControls = [...new Set(actions.flatMap((a) => a.controlsCount))].reduce(
    (_, __) => actions.reduce((s, a) => s + a.controlsCount, 0), 0
  );

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Map className="h-6 w-6 text-primary" />
            Implementation Roadmap
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">
            High-impact actions prioritized by compliance coverage. Complete these actions to build evidence across multiple CMMC controls simultaneously.
          </p>
        </div>
        <div className="flex gap-2">
          <Link href="/roadmap/coverage">
            <Button variant="outline" size="sm" className="gap-2">
              <TrendingUp className="h-4 w-4" />
              Coverage Matrix
            </Button>
          </Link>
          <Link href="/roadmap/progress">
            <Button variant="outline" size="sm" className="gap-2">
              <Target className="h-4 w-4" />
              Progress
            </Button>
          </Link>
        </div>
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "Total Actions", value: actions.length, icon: Zap, color: "text-primary" },
          { label: "Complete", value: totalComplete, icon: CheckCircle2, color: "text-emerald-400" },
          { label: "In Progress", value: totalInProgress, icon: Clock, color: "text-blue-400" },
          { label: "Controls Covered", value: totalControls, icon: Target, color: "text-purple-400" },
        ].map((kpi) => (
          <div key={kpi.label} className="rounded-lg border bg-card p-4 flex items-center gap-3">
            <kpi.icon className={cn("h-8 w-8 shrink-0", kpi.color)} />
            <div>
              <div className="text-2xl font-bold">{kpi.value}</div>
              <div className="text-xs text-muted-foreground">{kpi.label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Phase overview strips */}
      <div className="grid grid-cols-3 md:grid-cols-6 gap-2">
        {PHASES.map((p) => {
          const phaseActions = actions.filter((a) => a.phase === p.phase);
          const phaseComplete = phaseActions.filter((a) => a.status === "complete").length;
          const pct = phaseActions.length > 0 ? Math.round((phaseComplete / phaseActions.length) * 100) : 0;
          return (
            <button
              key={p.phase}
              onClick={() => setFilterPhase(filterPhase === String(p.phase) ? "all" : String(p.phase))}
              className={cn(
                "rounded-lg border p-3 text-left transition-colors hover:bg-muted/50",
                filterPhase === String(p.phase) ? "ring-2 ring-primary bg-muted/30" : ""
              )}
            >
              <div className={cn("text-[10px] font-bold px-1.5 py-0.5 rounded border w-fit mb-1", PHASE_COLORS[p.phase])}>
                Phase {p.phase}
              </div>
              <div className="text-xs font-medium text-foreground truncate">{p.name}</div>
              <div className="text-xs text-muted-foreground mt-1">{phaseComplete}/{phaseActions.length} done</div>
              <Progress value={pct} className="h-1 mt-1" />
            </button>
          );
        })}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search actions…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={filterPriority} onValueChange={setFilterPriority}>
          <SelectTrigger className="w-36">
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
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="not_started">Not Started</SelectItem>
            <SelectItem value="in_progress">In Progress</SelectItem>
            <SelectItem value="evidence_needed">Evidence Needed</SelectItem>
            <SelectItem value="ready_for_review">Ready for Review</SelectItem>
            <SelectItem value="complete">Complete</SelectItem>
            <SelectItem value="blocked">Blocked</SelectItem>
          </SelectContent>
        </Select>
        <Select value={sortBy} onValueChange={(v) => setSortBy(v as any)}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Sort by" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="impact">Sort: Impact Score</SelectItem>
            <SelectItem value="priority">Sort: Priority</SelectItem>
            <SelectItem value="phase">Sort: Phase</SelectItem>
          </SelectContent>
        </Select>
        <span className="text-xs text-muted-foreground">{filtered.length} of {actions.length}</span>
      </div>

      {/* Actions table */}
      {isLoading ? (
        <div className="flex justify-center py-16">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">No actions match your filters.</div>
      ) : (
        <div className="space-y-2">
          {filtered.map((action) => {
            const checkPct = action.checklistTotal > 0
              ? Math.round((action.checklistCompleted / action.checklistTotal) * 100) : 0;
            return (
              <Link key={action.id} href={`/roadmap/${action.id}`}>
                <div className="rounded-lg border bg-card hover:bg-muted/30 transition-colors cursor-pointer">
                  <div className="p-4 flex items-start gap-4">
                    {/* Impact score badge */}
                    <div className="shrink-0 w-14 h-14 rounded-xl bg-primary/10 border border-primary/20 flex flex-col items-center justify-center">
                      <div className="text-lg font-bold text-primary leading-none">{action.impactScore}</div>
                      <div className="text-[9px] text-muted-foreground uppercase tracking-wide mt-0.5">score</div>
                    </div>

                    {/* Main content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2 mb-1">
                        <span className="font-semibold text-sm">{action.title}</span>
                        <PriorityBadge priority={action.priority} />
                        <span className={cn("text-[10px] font-medium px-2 py-0.5 rounded border", PHASE_COLORS[action.phase])}>
                          Phase {action.phase}: {action.phaseName}
                        </span>
                      </div>
                      <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground mb-2">
                        <span className="font-medium text-foreground/70">{action.category}</span>
                        <EffortBadge effort={action.effort} />
                        <span>{action.controlsCount} controls ({action.fullSupportCount} full, {action.partialSupportCount} partial)</span>
                        <span className="truncate max-w-48">{action.domains.slice(0, 3).join(", ")}{action.domains.length > 3 ? ` +${action.domains.length - 3}` : ""}</span>
                      </div>
                      {action.checklistTotal > 0 && (
                        <div className="flex items-center gap-2">
                          <Progress value={checkPct} className="h-1.5 w-32" />
                          <span className="text-xs text-muted-foreground">
                            {action.checklistCompleted}/{action.checklistTotal} checklist
                          </span>
                        </div>
                      )}
                    </div>

                    {/* Status + arrow */}
                    <div className="shrink-0 flex flex-col items-end gap-2">
                      <StatusBadge status={action.status} />
                      {action.targetDate && (
                        <span className="text-xs text-muted-foreground">
                          Due {action.targetDate}
                        </span>
                      )}
                      <ChevronRight className="h-4 w-4 text-muted-foreground mt-1" />
                    </div>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}

      {totalBlocked > 0 && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/5 p-4 flex items-center gap-3">
          <AlertTriangle className="h-5 w-5 text-red-400 shrink-0" />
          <div className="text-sm">
            <span className="font-medium text-red-300">{totalBlocked} action{totalBlocked > 1 ? "s are" : " is"} blocked.</span>
            <span className="text-muted-foreground ml-1">Review blocked items and create POA&M entries for blockers.</span>
          </div>
        </div>
      )}
    </div>
  );
}
