import { useState } from "react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { useOrg } from "@/context/OrgContext";
import { Progress } from "@/components/ui/progress";
import {
  ArrowLeft,
  Target,
  CheckCircle2,
  Clock,
  Ban,
  Circle,
  FileSearch,
  AlertTriangle,
  EyeOff,
  Eye,
} from "lucide-react";
import { cn } from "@/lib/utils";

function makeHeaders(orgId: string) {
  const token = localStorage.getItem("auth_token");
  return {
    Authorization: `Bearer ${token}`,
    "X-Organization-ID": orgId,
  };
}

interface RoadmapAction {
  id: string;
  title: string;
  category: string;
  phase: number;
  phaseName: string;
  priority: string;
  effort: string;
  impactScore: number;
  controlsCount: number;
  fullSupportCount: number;
  status: string;
  checklistTotal: number;
  checklistCompleted: number;
}

const PHASES = [
  { phase: 1, name: "Foundation", description: "SSP baseline, scope definition, policy foundation" },
  { phase: 2, name: "Identity and Access", description: "User reviews, MFA, Conditional Access, training" },
  { phase: 3, name: "Endpoint and System Security", description: "Device management, endpoint compliance, backups" },
  { phase: 4, name: "Logging and Monitoring", description: "Audit logging, SIEM alerts, log review" },
  { phase: 5, name: "Risk and Remediation", description: "Vulnerability management, incident response, risk assessment" },
  { phase: 6, name: "Audit Preparation", description: "Evidence review, test procedures, assessor readiness" },
];

const STATUS_ICON: Record<string, React.ReactNode> = {
  not_started: <Circle className="h-3.5 w-3.5 text-slate-400" />,
  in_progress: <Clock className="h-3.5 w-3.5 text-blue-400" />,
  evidence_needed: <FileSearch className="h-3.5 w-3.5 text-yellow-400" />,
  ready_for_review: <Target className="h-3.5 w-3.5 text-purple-400" />,
  complete: <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />,
  blocked: <Ban className="h-3.5 w-3.5 text-red-400" />,
};

const STATUS_LABEL: Record<string, string> = {
  not_started: "Not Started",
  in_progress: "In Progress",
  evidence_needed: "Evidence Needed",
  ready_for_review: "Ready for Review",
  complete: "Complete",
  blocked: "Blocked",
};

const PRIORITY_DOT: Record<string, string> = {
  critical: "bg-red-400",
  high: "bg-orange-400",
  medium: "bg-yellow-400",
  low: "bg-slate-400",
};

export default function RoadmapProgress() {
  const { activeOrg } = useOrg();
  const [showEmptyPhases, setShowEmptyPhases] = useState(false);

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

  const totalComplete = actions.filter((a) => a.status === "complete").length;
  const totalInProgress = actions.filter((a) => a.status === "in_progress").length;
  const totalBlocked = actions.filter((a) => a.status === "blocked").length;
  const totalEvidenceNeeded = actions.filter((a) => a.status === "evidence_needed").length;
  const totalReadyForReview = actions.filter((a) => a.status === "ready_for_review").length;
  const overallPct = actions.length > 0 ? Math.round((totalComplete / actions.length) * 100) : 0;

  const totalChecklistItems = actions.reduce((s, a) => s + a.checklistTotal, 0);
  const totalChecklistDone = actions.reduce((s, a) => s + a.checklistCompleted, 0);
  const checklistPct =
    totalChecklistItems > 0 ? Math.round((totalChecklistDone / totalChecklistItems) * 100) : 0;

  if (isLoading) {
    return (
      <div className="flex justify-center py-24">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div>
        <Link href="/roadmap">
          <button className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-4 transition-colors">
            <ArrowLeft className="h-4 w-4" />
            Implementation Roadmap
          </button>
        </Link>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Target className="h-6 w-6 text-primary" />
          Roadmap Progress
        </h1>
        <p className="text-muted-foreground text-sm mt-1">
          Overall completion across all 6 implementation phases.
        </p>
      </div>

      {/* Summary KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {[
          {
            label: "Overall Complete",
            value: `${overallPct}%`,
            sub: `${totalComplete}/${actions.length} actions`,
            color: "text-primary",
            icon: <CheckCircle2 className="h-4 w-4 text-primary" />,
          },
          {
            label: "In Progress",
            value: totalInProgress,
            sub: "actions active",
            color: "text-blue-400",
            icon: <Clock className="h-4 w-4 text-blue-400" />,
          },
          {
            label: "Blocked",
            value: totalBlocked,
            sub: "need attention",
            color: totalBlocked > 0 ? "text-red-400" : "text-muted-foreground",
            icon: <Ban className="h-4 w-4 text-red-400" />,
          },
          {
            label: "Checklist Items",
            value: `${checklistPct}%`,
            sub: `${totalChecklistDone}/${totalChecklistItems} items`,
            color: "text-emerald-400",
            icon: <CheckCircle2 className="h-4 w-4 text-emerald-400" />,
          },
          {
            label: "Attention Needed",
            value: totalEvidenceNeeded,
            sub: "evidence needed",
            color: totalEvidenceNeeded > 0 ? "text-amber-400" : "text-muted-foreground",
            icon: <AlertTriangle className="h-4 w-4 text-amber-400" />,
          },
          {
            label: "Ready for Review",
            value: totalReadyForReview,
            sub: "awaiting review",
            color: totalReadyForReview > 0 ? "text-primary" : "text-muted-foreground",
            icon: <Target className="h-4 w-4 text-primary" />,
          },
        ].map((kpi) => (
          <div key={kpi.label} className="rounded-lg border bg-card p-4">
            <div className="flex items-center gap-1.5 mb-1">{kpi.icon}</div>
            <div className={cn("text-2xl font-bold", kpi.color)}>{kpi.value}</div>
            <div className="text-xs font-medium text-foreground/70 mt-0.5">{kpi.label}</div>
            <div className="text-xs text-muted-foreground">{kpi.sub}</div>
          </div>
        ))}
      </div>

      {/* Overall progress bar */}
      <div className="rounded-lg border bg-card p-5">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-semibold">Overall Roadmap Progress</span>
          <span className="text-sm text-muted-foreground">{overallPct}%</span>
        </div>
        <Progress value={overallPct} className="h-3" />
        <div className="flex flex-wrap gap-4 mt-3 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-emerald-400" />
            {totalComplete} complete
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-blue-400" />
            {totalInProgress} in progress
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-slate-400" />
            {actions.filter((a) => a.status === "not_started").length} not started
          </span>
          {totalBlocked > 0 && (
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-red-400" />
              {totalBlocked} blocked
            </span>
          )}
        </div>
      </div>

      {/* Phase breakdown */}
      <div className="space-y-4">
        {/* Toggle empty phases */}
        <div className="flex items-center justify-end">
          <button
            onClick={() => setShowEmptyPhases((v) => !v)}
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            {showEmptyPhases ? (
              <>
                <EyeOff className="h-3.5 w-3.5" />
                Hide empty phases
              </>
            ) : (
              <>
                <Eye className="h-3.5 w-3.5" />
                Show empty phases
              </>
            )}
          </button>
        </div>

        {PHASES.map((phase) => {
          const phaseActions = actions.filter((a) => a.phase === phase.phase);
          const isEmpty = phaseActions.length === 0;

          if (isEmpty && !showEmptyPhases) return null;

          if (isEmpty) {
            return (
              <div
                key={phase.phase}
                className="rounded-lg border bg-card p-5 space-y-2"
              >
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold bg-muted text-muted-foreground px-2 py-0.5 rounded">
                    Phase {phase.phase}
                  </span>
                  <span className="text-base font-semibold text-foreground">{phase.name}</span>
                </div>
                <p className="text-xs text-muted-foreground">{phase.description}</p>
                <p className="text-xs text-muted-foreground italic">No actions assigned.</p>
              </div>
            );
          }

          const phaseComplete = phaseActions.filter((a) => a.status === "complete").length;
          const phasePct = Math.round((phaseComplete / phaseActions.length) * 100);

          return (
            <div
              key={phase.phase}
              className="rounded-lg border bg-card p-5 space-y-4"
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold bg-muted text-muted-foreground px-2 py-0.5 rounded">
                      Phase {phase.phase}
                    </span>
                    <span className="text-base font-semibold text-foreground">{phase.name}</span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">{phase.description}</p>
                </div>
                <div className="shrink-0 text-right">
                  <div className="text-xl font-bold">{phasePct}%</div>
                  <div className="text-xs text-muted-foreground">
                    {phaseComplete}/{phaseActions.length}
                  </div>
                </div>
              </div>

              <div>
                <Progress value={phasePct} className="h-2" />
              </div>

              <div className="space-y-2">
                {phaseActions.map((action) => {
                  const checkPct =
                    action.checklistTotal > 0
                      ? Math.round((action.checklistCompleted / action.checklistTotal) * 100)
                      : 0;
                  return (
                    <Link key={action.id} href={`/roadmap/${action.id}`}>
                      <div className="flex items-center gap-3 rounded-md hover:bg-muted/30 p-2 transition-colors cursor-pointer group">
                        <div className="shrink-0">{STATUS_ICON[action.status]}</div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium group-hover:text-primary transition-colors">
                              {action.title}
                            </span>
                            <span
                              className={cn("w-2 h-2 rounded-full shrink-0", PRIORITY_DOT[action.priority])}
                              title={action.priority}
                            />
                          </div>
                          <div className="flex items-center gap-3 text-xs text-muted-foreground mt-0.5">
                            <span>{action.controlsCount} controls</span>
                            {action.checklistTotal > 0 && (
                              <span>
                                {action.checklistCompleted}/{action.checklistTotal} checklist
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="shrink-0 flex items-center gap-3">
                          {action.checklistTotal > 0 && (
                            <div className="w-16">
                              <Progress value={checkPct} className="h-1" />
                            </div>
                          )}
                          <span className="text-xs text-muted-foreground w-20 text-right">
                            {STATUS_LABEL[action.status]}
                          </span>
                        </div>
                      </div>
                    </Link>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
