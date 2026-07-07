import { useState } from "react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { useOrg } from "@/context/OrgContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
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
  Zap,
  Search,
  ChevronRight,
  ChevronLeft,
  Target,
  TrendingUp,
  CheckCircle2,
  Clock,
  AlertTriangle,
  Circle,
  Ban,
  FileSearch,
  Map,
  HelpCircle,
  ArrowRight,
  Play,
  ListOrdered,
  Layers,
  ShieldCheck,
  Info,
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

type ViewMode = "guided" | "list" | "phase";

const PRIORITY_ORDER: Record<string, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
};

const PHASE_COLORS: Record<number, string> = {
  1: "bg-purple-500/20 text-purple-300 border-purple-500/30",
  2: "bg-blue-500/20 text-blue-300 border-blue-500/30",
  3: "bg-cyan-500/20 text-cyan-300 border-cyan-500/30",
  4: "bg-emerald-500/20 text-emerald-300 border-emerald-500/30",
  5: "bg-orange-500/20 text-orange-300 border-orange-500/30",
  6: "bg-rose-500/20 text-rose-300 border-rose-500/30",
};

const PHASE_INFO: Record<
  number,
  { name: string; why: string; icon: string }
> = {
  1: {
    name: "Foundation",
    icon: "🏗️",
    why: "Defines your system boundary, asset inventory, and core security policies. All other phases build on this.",
  },
  2: {
    name: "Identity & Access",
    icon: "🔐",
    why: "Establishes MFA, privileged access controls, user authentication, and account lifecycle management.",
  },
  3: {
    name: "Endpoint & System",
    icon: "💻",
    why: "Deploys device compliance, encryption, patching, and endpoint protection across your environment.",
  },
  4: {
    name: "Logging & Monitoring",
    icon: "📊",
    why: "Implements audit logging, SIEM integration, and continuous monitoring to detect and respond to threats.",
  },
  5: {
    name: "Risk & Remediation",
    icon: "🛡️",
    why: "Identifies vulnerabilities, establishes incident response capabilities, and maintains your POA&M register.",
  },
  6: {
    name: "Audit Preparation",
    icon: "📋",
    why: "Organizes all evidence, validates control coverage, and prepares your formal assessment package.",
  },
};

const STATUS_CONFIG: Record<
  string,
  {
    icon: React.ReactNode;
    label: string;
    cls: string;
    description: string;
  }
> = {
  not_started: {
    icon: <Circle className="h-3 w-3" />,
    label: "Not Started",
    cls: "text-slate-400",
    description: "No work has begun on this action.",
  },
  in_progress: {
    icon: <Clock className="h-3 w-3" />,
    label: "In Progress",
    cls: "text-blue-400",
    description: "Work has started on this action.",
  },
  evidence_needed: {
    icon: <FileSearch className="h-3 w-3" />,
    label: "Evidence Needed",
    cls: "text-yellow-400",
    description: "Steps may be complete but required evidence is missing.",
  },
  ready_for_review: {
    icon: <Target className="h-3 w-3" />,
    label: "Ready for Review",
    cls: "text-purple-400",
    description: "Action appears complete and needs reviewer approval.",
  },
  complete: {
    icon: <CheckCircle2 className="h-3 w-3" />,
    label: "Complete",
    cls: "text-emerald-400",
    description: "Action completed and reviewed.",
  },
  blocked: {
    icon: <Ban className="h-3 w-3" />,
    label: "Blocked",
    cls: "text-red-400",
    description: "Cannot continue due to an open issue or dependency.",
  },
};

function InfoTooltip({ text }: { text: string }) {
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <HelpCircle className="h-3.5 w-3.5 text-muted-foreground cursor-help shrink-0" />
        </TooltipTrigger>
        <TooltipContent className="max-w-64 text-xs">{text}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

function PriorityBadge({ priority }: { priority: string }) {
  const cfg: Record<string, string> = {
    critical: "bg-red-500/20 text-red-300 border-red-500/30",
    high: "bg-orange-500/20 text-orange-300 border-orange-500/30",
    medium: "bg-yellow-500/20 text-yellow-300 border-yellow-500/30",
    low: "bg-slate-500/20 text-slate-300 border-slate-500/30",
  };
  return (
    <span
      className={cn(
        "text-[10px] font-semibold px-2 py-0.5 rounded border uppercase tracking-wide",
        cfg[priority] ?? "bg-slate-500/20 text-slate-300"
      )}
    >
      {priority}
    </span>
  );
}

function StatusBadge({ status }: { status: string }) {
  const s = STATUS_CONFIG[status] ?? STATUS_CONFIG.not_started;
  return (
    <span className={cn("flex items-center gap-1 text-xs", s.cls)}>
      {s.icon}
      {s.label}
    </span>
  );
}

function EffortBadge({ effort }: { effort: string }) {
  const colors: Record<string, string> = {
    low: "text-emerald-400",
    medium: "text-yellow-400",
    high: "text-red-400",
  };
  return (
    <span className={cn("text-xs capitalize", colors[effort] ?? "text-slate-400")}>
      {effort} effort
    </span>
  );
}

function ImpactLabel({ score }: { score: number }) {
  const tier =
    score >= 60
      ? {
          label: "High Impact",
          short: "High",
          color:
            "text-emerald-400 bg-emerald-500/10 border-emerald-500/30",
        }
      : score >= 35
      ? {
          label: "Medium Impact",
          short: "Med",
          color:
            "text-yellow-400 bg-yellow-500/10 border-yellow-500/30",
        }
      : {
          label: "Lower Impact",
          short: "Low",
          color: "text-slate-400 bg-slate-500/10 border-slate-500/30",
        };

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div
            className={cn(
              "flex flex-col items-center justify-center rounded-xl border px-2 py-2 min-w-[60px] cursor-help shrink-0",
              tier.color
            )}
          >
            <div className="text-lg font-bold leading-none">{score}</div>
            <div className="text-[9px] font-semibold uppercase tracking-wide mt-0.5 text-center leading-tight">
              {tier.short}
            </div>
          </div>
        </TooltipTrigger>
        <TooltipContent className="max-w-xs text-xs">
          <p className="font-semibold mb-1">{tier.label} · Score {score}</p>
          <p>
            Impact score is based on controls supported, evidence gaps
            addressed, documents produced, monitoring supported, and
            estimated effort.
          </p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

function ActionCard({ action }: { action: RoadmapAction }) {
  const checkPct =
    action.checklistTotal > 0
      ? Math.round(
          (action.checklistCompleted / action.checklistTotal) * 100
        )
      : 0;

  const ctaLabel =
    action.status === "not_started"
      ? "Start Action"
      : action.status === "complete" || action.status === "ready_for_review"
      ? "View Details"
      : "Continue";

  return (
    <Link href={`/roadmap/${action.id}`}>
      <div
        className={cn(
          "rounded-lg border bg-card hover:bg-muted/30 transition-colors cursor-pointer group",
          action.status === "complete" &&
            "border-emerald-500/20 bg-emerald-950/10",
          action.status === "blocked" && "border-red-500/20"
        )}
      >
        <div className="p-4 flex items-start gap-4">
          <ImpactLabel score={action.impactScore} />

          <div className="flex-1 min-w-0 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-semibold text-sm">{action.title}</span>
              <PriorityBadge priority={action.priority} />
              <span
                className={cn(
                  "text-[10px] font-medium px-2 py-0.5 rounded border",
                  PHASE_COLORS[action.phase]
                )}
              >
                Phase {action.phase}: {action.phaseName}
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
              <span className="font-medium text-foreground/70">
                {action.category}
              </span>
              <EffortBadge effort={action.effort} />
              <span className="flex items-center gap-1">
                <ShieldCheck className="h-3 w-3" />
                {action.controlsCount} controls
                <span className="text-muted-foreground/60">
                  ({action.fullSupportCount} full,{" "}
                  {action.partialSupportCount} partial)
                </span>
              </span>
              {action.domains.length > 0 && (
                <span className="truncate max-w-48">
                  {action.domains.slice(0, 3).join(", ")}
                  {action.domains.length > 3
                    ? ` +${action.domains.length - 3}`
                    : ""}
                </span>
              )}
            </div>

            {action.checklistTotal > 0 && (
              <div className="flex items-center gap-2">
                <Progress value={checkPct} className="h-1.5 w-32" />
                <span className="text-xs text-muted-foreground">
                  {action.checklistCompleted}/{action.checklistTotal} steps
                </span>
              </div>
            )}

            {(action.owner || action.targetDate) && (
              <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
                {action.owner && <span>Owner: {action.owner}</span>}
                {action.targetDate && <span>Due: {action.targetDate}</span>}
              </div>
            )}
          </div>

          <div className="shrink-0 flex flex-col items-end gap-2">
            <StatusBadge status={action.status} />
            <span
              className={cn(
                "text-xs font-medium px-3 py-1 rounded-md border transition-colors",
                action.status === "not_started"
                  ? "border-primary/40 text-primary bg-primary/10 group-hover:bg-primary/20"
                  : action.status === "complete"
                  ? "border-emerald-500/30 text-emerald-400 bg-emerald-500/10"
                  : action.status === "ready_for_review"
                  ? "border-purple-500/30 text-purple-300 bg-purple-500/10"
                  : "border-blue-500/40 text-blue-300 bg-blue-500/10 group-hover:bg-blue-500/20"
              )}
            >
              {ctaLabel}
            </span>
          </div>
        </div>
      </div>
    </Link>
  );
}

function StartHerePanel({ actions }: { actions: RoadmapAction[] }) {
  const inProgress = actions.find((a) => a.status === "in_progress");
  const recommended =
    inProgress ??
    actions
      .filter((a) => a.status === "not_started")
      .sort((a, b) => {
        const po =
          (PRIORITY_ORDER[a.priority] ?? 9) -
          (PRIORITY_ORDER[b.priority] ?? 9);
        return po !== 0 ? po : b.impactScore - a.impactScore;
      })[0];

  const allDone =
    actions.length > 0 &&
    actions.every(
      (a) => a.status === "complete" || a.status === "ready_for_review"
    );

  if (allDone) {
    return (
      <div className="rounded-lg border border-emerald-500/30 bg-emerald-950/20 p-5">
        <div className="flex items-center gap-3">
          <CheckCircle2 className="h-8 w-8 text-emerald-400 shrink-0" />
          <div>
            <div className="font-bold text-emerald-300">Roadmap Complete!</div>
            <div className="text-sm text-muted-foreground mt-0.5">
              All actions are complete or ready for review. Prepare your
              assessment package.
            </div>
          </div>
          <Link href="/roadmap/progress" className="ml-auto shrink-0">
            <Button size="sm" className="gap-2">
              View Progress <ArrowRight className="h-3.5 w-3.5" />
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  if (!recommended) return null;

  const isResuming = !!inProgress;
  const checkPct =
    recommended.checklistTotal > 0
      ? Math.round(
          (recommended.checklistCompleted / recommended.checklistTotal) * 100
        )
      : 0;

  return (
    <div className="rounded-lg border border-primary/30 bg-primary/5 p-5 space-y-4">
      <div className="flex items-start gap-3">
        <div className="shrink-0 rounded-lg bg-primary/15 border border-primary/30 p-2.5">
          <Play className="h-5 w-5 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-xs font-semibold text-primary uppercase tracking-wide mb-1">
            {isResuming
              ? "Continue Where You Left Off"
              : "Recommended First Action"}
          </div>
          <h3 className="font-bold text-base">{recommended.title}</h3>
          <div className="flex flex-wrap gap-2 mt-1.5">
            <span className="text-xs text-muted-foreground">
              Phase {recommended.phase}: {recommended.phaseName}
            </span>
            <PriorityBadge priority={recommended.priority} />
            <EffortBadge effort={recommended.effort} />
          </div>
        </div>
        <Link href={`/roadmap/${recommended.id}`} className="shrink-0">
          <Button size="sm" className="gap-2 h-9">
            {isResuming ? "Continue Action" : "Start This Action"}
            <ArrowRight className="h-3.5 w-3.5" />
          </Button>
        </Link>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-3 border-t border-primary/15">
        <div>
          <div className="text-xs font-semibold text-muted-foreground mb-1">
            Why this is recommended
          </div>
          <p className="text-xs text-foreground/70">
            Supports {recommended.controlsCount} controls (
            {recommended.fullSupportCount} fully) across{" "}
            {recommended.domains.slice(0, 2).join(", ")}
            {recommended.domains.length > 2
              ? ` +${recommended.domains.length - 2} more domains`
              : ""}
            .
          </p>
        </div>
        <div>
          <div className="text-xs font-semibold text-muted-foreground mb-1">
            Expected outputs
          </div>
          <p className="text-xs text-foreground/70">
            Evidence files, documents, and monitoring records across{" "}
            {recommended.domains.length} domain
            {recommended.domains.length !== 1 ? "s" : ""}.
          </p>
        </div>
        {recommended.checklistTotal > 0 ? (
          <div>
            <div className="text-xs font-semibold text-muted-foreground mb-1">
              Progress
            </div>
            <div className="flex items-center gap-2">
              <Progress value={checkPct} className="h-1.5 flex-1" />
              <span className="text-xs text-muted-foreground shrink-0">
                {recommended.checklistCompleted}/{recommended.checklistTotal}{" "}
                steps
              </span>
            </div>
          </div>
        ) : (
          <div>
            <div className="text-xs font-semibold text-muted-foreground mb-1">
              Impact Score
            </div>
            <p className="text-xs text-foreground/70">
              {recommended.impactScore} points —{" "}
              {recommended.impactScore >= 60
                ? "High"
                : recommended.impactScore >= 35
                ? "Medium"
                : "Lower"}{" "}
              impact
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

function GuidedView({ actions }: { actions: RoadmapAction[] }) {
  const statusOrder: Record<string, number> = {
    in_progress: 0,
    evidence_needed: 1,
    not_started: 2,
    ready_for_review: 3,
    complete: 4,
    blocked: 5,
  };

  const ordered = [...actions].sort((a, b) => {
    const sa = statusOrder[a.status] ?? 2;
    const sb = statusOrder[b.status] ?? 2;
    if (sa !== sb) return sa - sb;
    const po =
      (PRIORITY_ORDER[a.priority] ?? 9) - (PRIORITY_ORDER[b.priority] ?? 9);
    return po !== 0 ? po : b.impactScore - a.impactScore;
  });

  const [idx, setIdx] = useState(0);
  const current = ordered[idx];
  if (!current) return null;

  const checkPct =
    current.checklistTotal > 0
      ? Math.round(
          (current.checklistCompleted / current.checklistTotal) * 100
        )
      : 0;

  const ctaLabel =
    current.status === "not_started"
      ? "Start Action"
      : current.status === "complete" || current.status === "ready_for_review"
      ? "View Details"
      : "Continue";

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="text-sm text-muted-foreground">
          Action {idx + 1} of {ordered.length}
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setIdx((i) => Math.max(0, i - 1))}
            disabled={idx === 0}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              setIdx((i) => Math.min(ordered.length - 1, i + 1))
            }
            disabled={idx === ordered.length - 1}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div
        className={cn(
          "rounded-lg border bg-card p-6 space-y-5",
          current.status === "complete" &&
            "border-emerald-500/20 bg-emerald-950/10",
          current.status === "blocked" && "border-red-500/20"
        )}
      >
        <div className="flex items-start gap-4">
          <ImpactLabel score={current.impactScore} />
          <div className="flex-1 min-w-0">
            <h2 className="text-lg font-bold">{current.title}</h2>
            <div className="flex flex-wrap gap-2 mt-1.5">
              <PriorityBadge priority={current.priority} />
              <span
                className={cn(
                  "text-[10px] font-medium px-2 py-0.5 rounded border",
                  PHASE_COLORS[current.phase]
                )}
              >
                Phase {current.phase}: {current.phaseName}
              </span>
              <EffortBadge effort={current.effort} />
            </div>
          </div>
          <StatusBadge status={current.status} />
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            {
              label: "Controls Supported",
              value: current.controlsCount,
              tip: "Number of CMMC L2 controls this action directly supports.",
            },
            {
              label: "Full Support",
              value: current.fullSupportCount,
              tip: "Controls fully satisfied by completing this action.",
            },
            {
              label: "Partial Support",
              value: current.partialSupportCount,
              tip: "Controls partially supported — additional actions may be needed.",
            },
            {
              label: "Steps",
              value: `${current.checklistCompleted}/${current.checklistTotal}`,
              tip: "Checklist steps completed for this action.",
            },
          ].map((s) => (
            <div key={s.label} className="rounded-lg border bg-background p-3">
              <div className="text-xl font-bold">{s.value}</div>
              <div className="flex items-center gap-1 text-xs text-muted-foreground mt-0.5">
                {s.label}
                <InfoTooltip text={s.tip} />
              </div>
            </div>
          ))}
        </div>

        {current.checklistTotal > 0 && (
          <div className="space-y-1.5">
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>Step progress</span>
              <span>{checkPct}%</span>
            </div>
            <Progress value={checkPct} className="h-2" />
          </div>
        )}

        {current.domains.length > 0 && (
          <div>
            <div className="text-xs font-semibold text-muted-foreground mb-1.5">
              CMMC Domains Covered
            </div>
            <div className="flex flex-wrap gap-1.5">
              {current.domains.map((d) => (
                <span
                  key={d}
                  className="text-xs px-2 py-0.5 rounded-full border border-border bg-muted/30 text-muted-foreground"
                >
                  {d}
                </span>
              ))}
            </div>
          </div>
        )}

        <div className="pt-2 border-t border-border flex items-center justify-between gap-4">
          <p className="text-xs text-muted-foreground">
            {current.status === "not_started"
              ? "This action hasn't been started yet. Click to read the overview and begin."
              : current.status === "in_progress"
              ? "This action is in progress. Open it to see your next required step."
              : current.status === "complete"
              ? "This action is complete. Evidence and documents have been collected."
              : current.status === "evidence_needed"
              ? "Steps may be done, but required evidence is still missing."
              : current.status === "ready_for_review"
              ? "This action is ready for a reviewer to approve."
              : `Status: ${STATUS_CONFIG[current.status]?.label ?? current.status}`}
          </p>
          <Link href={`/roadmap/${current.id}`}>
            <Button size="sm" className="gap-2 shrink-0">
              {ctaLabel}
              <ArrowRight className="h-3.5 w-3.5" />
            </Button>
          </Link>
        </div>
      </div>

      {/* Quick-nav thumbnails */}
      <div className="flex gap-2 overflow-x-auto pb-1">
        {ordered.slice(0, 12).map((a, i) => {
          const s = STATUS_CONFIG[a.status] ?? STATUS_CONFIG.not_started;
          return (
            <button
              key={a.id}
              onClick={() => setIdx(i)}
              className={cn(
                "shrink-0 rounded border px-3 py-2 text-xs text-left transition-colors min-w-[120px] max-w-[180px]",
                i === idx
                  ? "ring-2 ring-primary bg-primary/10 border-primary/40"
                  : "bg-card hover:bg-muted/30"
              )}
            >
              <div
                className={cn("flex items-center gap-1 mb-0.5", s.cls)}
              >
                {s.icon}
                <span className="text-[10px]">{s.label}</span>
              </div>
              <div className="truncate font-medium text-foreground/80">
                {a.title}
              </div>
            </button>
          );
        })}
        {ordered.length > 12 && (
          <div className="shrink-0 flex items-center text-xs text-muted-foreground px-2">
            +{ordered.length - 12} more
          </div>
        )}
      </div>
    </div>
  );
}

function PhaseView({
  actions,
  onSwitchToList,
}: {
  actions: RoadmapAction[];
  onSwitchToList: (phase: string) => void;
}) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
      {[1, 2, 3, 4, 5, 6].map((p) => {
        const info = PHASE_INFO[p];
        const phaseActions = actions.filter((a) => a.phase === p);
        const completeCount = phaseActions.filter(
          (a) => a.status === "complete"
        ).length;
        const nextAction =
          phaseActions.find((a) => a.status === "in_progress") ??
          phaseActions.find((a) => a.status === "not_started");
        const pct =
          phaseActions.length > 0
            ? Math.round((completeCount / phaseActions.length) * 100)
            : 0;

        return (
          <div
            key={p}
            className={cn(
              "rounded-lg border bg-card p-4 space-y-3",
              pct > 0 && pct < 100 && "border-primary/30",
              pct === 100 &&
                "border-emerald-500/30 bg-emerald-950/10"
            )}
          >
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span
                    className={cn(
                      "text-[10px] font-bold px-2 py-0.5 rounded border",
                      PHASE_COLORS[p]
                    )}
                  >
                    Phase {p}
                  </span>
                  {pct === 100 && (
                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
                  )}
                </div>
                <div className="font-semibold text-sm">
                  {info.icon} {info.name}
                </div>
              </div>
              <div className="text-right shrink-0">
                <div className="text-sm font-bold">
                  {completeCount}/{phaseActions.length}
                </div>
                <div className="text-xs text-muted-foreground">complete</div>
              </div>
            </div>

            <p className="text-xs text-muted-foreground leading-relaxed">
              {info.why}
            </p>

            <Progress value={pct} className="h-1.5" />

            {nextAction && pct < 100 && (
              <div className="text-xs">
                <span className="text-muted-foreground">Next: </span>
                <Link href={`/roadmap/${nextAction.id}`}>
                  <span className="text-primary hover:underline cursor-pointer">
                    {nextAction.title}
                  </span>
                </Link>
              </div>
            )}

            <div className="space-y-1 pt-1 border-t border-border">
              {phaseActions.slice(0, 5).map((a) => {
                const s =
                  STATUS_CONFIG[a.status] ?? STATUS_CONFIG.not_started;
                return (
                  <Link key={a.id} href={`/roadmap/${a.id}`}>
                    <div className="flex items-center gap-2 text-xs hover:bg-muted/30 px-1 py-1 rounded transition-colors">
                      <span className={s.cls}>{s.icon}</span>
                      <span className="flex-1 truncate text-foreground/80">
                        {a.title}
                      </span>
                      <ChevronRight className="h-3 w-3 text-muted-foreground shrink-0" />
                    </div>
                  </Link>
                );
              })}
              {phaseActions.length > 5 && (
                <button
                  onClick={() => onSwitchToList(String(p))}
                  className="text-xs text-primary hover:underline pl-1 pt-0.5"
                >
                  +{phaseActions.length - 5} more actions →
                </button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default function RoadmapActions() {
  const { activeOrg } = useOrg();
  const [viewMode, setViewMode] = useState<ViewMode>("guided");
  const [search, setSearch] = useState("");
  const [filterPriority, setFilterPriority] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterPhase, setFilterPhase] = useState("all");
  const [sortBy, setSortBy] = useState<"impact" | "priority" | "phase">(
    "impact"
  );

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
      if (
        search &&
        !a.title.toLowerCase().includes(search.toLowerCase()) &&
        !a.category.toLowerCase().includes(search.toLowerCase())
      )
        return false;
      if (filterPriority !== "all" && a.priority !== filterPriority)
        return false;
      if (filterStatus !== "all" && a.status !== filterStatus) return false;
      if (filterPhase !== "all" && String(a.phase) !== filterPhase)
        return false;
      return true;
    })
    .sort((a, b) => {
      if (sortBy === "impact") return b.impactScore - a.impactScore;
      if (sortBy === "priority")
        return (
          (PRIORITY_ORDER[a.priority] ?? 9) -
          (PRIORITY_ORDER[b.priority] ?? 9)
        );
      return a.phase - b.phase;
    });

  const totalComplete = actions.filter((a) => a.status === "complete").length;
  const totalInProgress = actions.filter(
    (a) => a.status === "in_progress"
  ).length;
  const totalBlocked = actions.filter((a) => a.status === "blocked").length;
  const totalControls = actions.reduce((s, a) => s + a.controlsCount, 0);
  const overallPct =
    actions.length > 0
      ? Math.round((totalComplete / actions.length) * 100)
      : 0;

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Map className="h-6 w-6 text-primary" />
            Implementation Roadmap
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Follow high-impact actions that build evidence and documentation
            across multiple CMMC controls.
          </p>
          <p className="text-xs text-muted-foreground mt-0.5 max-w-2xl">
            Instead of working control-by-control, this roadmap groups related
            implementation work into actions that support multiple CMMC controls
            at once.
          </p>
        </div>
        <div className="flex gap-2 shrink-0">
          <Link href="/roadmap/coverage">
            <Button variant="outline" size="sm" className="gap-2">
              <TrendingUp className="h-4 w-4" />
              Coverage
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

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {[
          {
            label: "Total Actions",
            value: actions.length,
            icon: Zap,
            color: "text-primary",
            tip: "Total implementation actions in your roadmap.",
          },
          {
            label: "Complete",
            value: totalComplete,
            icon: CheckCircle2,
            color: "text-emerald-400",
            tip: "Actions fully completed and reviewed.",
          },
          {
            label: "In Progress",
            value: totalInProgress,
            icon: Clock,
            color: "text-blue-400",
            tip: "Actions you have started but not yet finished.",
          },
          {
            label: "Controls Covered",
            value: totalControls,
            icon: Target,
            color: "text-purple-400",
            tip: "Total CMMC L2 control references across all actions (may overlap between actions).",
          },
          {
            label: "Overall Progress",
            value: `${overallPct}%`,
            icon: TrendingUp,
            color: "text-yellow-400",
            tip: "Percentage of actions marked complete.",
          },
        ].map((kpi) => (
          <div
            key={kpi.label}
            className="rounded-lg border bg-card p-4 flex items-center gap-3"
          >
            <kpi.icon className={cn("h-7 w-7 shrink-0", kpi.color)} />
            <div className="min-w-0">
              <div className="text-xl font-bold">{kpi.value}</div>
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                <span>{kpi.label}</span>
                <InfoTooltip text={kpi.tip} />
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Start Here / Continue panel */}
      {!isLoading && <StartHerePanel actions={actions} />}

      {/* View mode toggle */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex rounded-lg border bg-muted/30 p-1 gap-1">
          {(
            [
              { mode: "guided" as ViewMode, icon: Play, label: "Guided" },
              { mode: "list" as ViewMode, icon: ListOrdered, label: "List" },
              { mode: "phase" as ViewMode, icon: Layers, label: "Phase" },
            ] as const
          ).map(({ mode, icon: Icon, label }) => (
            <button
              key={mode}
              onClick={() => setViewMode(mode)}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors",
                viewMode === mode
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <Icon className="h-3.5 w-3.5" />
              {label}
            </button>
          ))}
        </div>
        <span className="text-xs text-muted-foreground">
          {viewMode === "guided" &&
            "One action at a time — best for getting started"}
          {viewMode === "list" && "All actions with filters and sorting"}
          {viewMode === "phase" && "Actions grouped by implementation phase"}
        </span>
      </div>

      {/* Main content by view mode */}
      {isLoading ? (
        <div className="flex justify-center py-16">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
        </div>
      ) : viewMode === "guided" ? (
        <GuidedView actions={actions} />
      ) : viewMode === "phase" ? (
        <PhaseView
          actions={actions}
          onSwitchToList={(phase) => {
            setViewMode("list");
            setFilterPhase(phase);
          }}
        />
      ) : (
        <>
          {/* Phase filter strips */}
          <div className="grid grid-cols-3 md:grid-cols-6 gap-2">
            {[1, 2, 3, 4, 5, 6].map((p) => {
              const info = PHASE_INFO[p];
              const pa = actions.filter((a) => a.phase === p);
              const done = pa.filter((a) => a.status === "complete").length;
              const pct =
                pa.length > 0
                  ? Math.round((done / pa.length) * 100)
                  : 0;
              return (
                <button
                  key={p}
                  onClick={() =>
                    setFilterPhase(
                      filterPhase === String(p) ? "all" : String(p)
                    )
                  }
                  className={cn(
                    "rounded-lg border p-3 text-left transition-colors hover:bg-muted/50",
                    filterPhase === String(p)
                      ? "ring-2 ring-primary bg-muted/30"
                      : ""
                  )}
                >
                  <div
                    className={cn(
                      "text-[10px] font-bold px-1.5 py-0.5 rounded border w-fit mb-1",
                      PHASE_COLORS[p]
                    )}
                  >
                    Phase {p}
                  </div>
                  <div className="text-xs font-medium truncate">
                    {info.name}
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">
                    {done}/{pa.length}
                  </div>
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
                <SelectItem value="evidence_needed">
                  Evidence Needed
                </SelectItem>
                <SelectItem value="ready_for_review">
                  Ready for Review
                </SelectItem>
                <SelectItem value="complete">Complete</SelectItem>
                <SelectItem value="blocked">Blocked</SelectItem>
              </SelectContent>
            </Select>
            <Select
              value={sortBy}
              onValueChange={(v) =>
                setSortBy(v as "impact" | "priority" | "phase")
              }
            >
              <SelectTrigger className="w-40">
                <SelectValue placeholder="Sort by" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="impact">Sort: Impact Score</SelectItem>
                <SelectItem value="priority">Sort: Priority</SelectItem>
                <SelectItem value="phase">Sort: Phase</SelectItem>
              </SelectContent>
            </Select>
            <span className="text-xs text-muted-foreground">
              {filtered.length} of {actions.length}
            </span>
          </div>

          {filtered.length === 0 ? (
            <div className="text-center py-16 text-muted-foreground">
              No actions match your filters.
            </div>
          ) : (
            <div className="space-y-2">
              {filtered.map((action) => (
                <ActionCard key={action.id} action={action} />
              ))}
            </div>
          )}
        </>
      )}

      {/* Status legend */}
      <div className="rounded-lg border bg-card p-4">
        <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground mb-3">
          <Info className="h-3.5 w-3.5" />
          Status Definitions
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
          {Object.entries(STATUS_CONFIG).map(([key, cfg]) => (
            <div key={key} className="flex items-start gap-2 text-xs">
              <span className={cn("mt-0.5 shrink-0", cfg.cls)}>
                {cfg.icon}
              </span>
              <div>
                <span className={cn("font-medium", cfg.cls)}>
                  {cfg.label}:
                </span>
                <span className="text-muted-foreground ml-1">
                  {cfg.description}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Blocked warning */}
      {totalBlocked > 0 && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/5 p-4 flex items-center gap-3">
          <AlertTriangle className="h-5 w-5 text-red-400 shrink-0" />
          <div className="text-sm">
            <span className="font-medium text-red-300">
              {totalBlocked} action{totalBlocked > 1 ? "s are" : " is"}{" "}
              blocked.
            </span>
            <span className="text-muted-foreground ml-1">
              Review blocked items and create POA&M entries for blockers.
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
