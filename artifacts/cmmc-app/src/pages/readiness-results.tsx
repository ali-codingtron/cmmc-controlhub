import { useQuery, useMutation } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import { useOrg } from "@/context/OrgContext";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import {
  ChevronLeft,
  CheckCircle2,
  XCircle,
  Clock3,
  HelpCircle,
  AlertTriangle,
  TrendingUp,
  ShieldCheck,
  ListChecks,
  FileWarning,
  ChevronRight,
  ArrowRight,
  Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ── Types ──────────────────────────────────────────────────────────────────────

type Assessment = {
  id: string;
  name: string;
  assessmentType: string;
  targetLevel: string;
  assessorName: string;
  systemName: string;
  assessmentDate: string;
  status: string;
  projectedScore: number | null;
  maxScore: number;
  confidenceScore: number | null;
};

type Gap = {
  id: string;
  controlRef: string;
  domainName: string;
  result: string;
  findingTitle: string | null;
  gapDescription: string | null;
  riskLevel: string | null;
  evidenceExists: boolean;
  policyExists: boolean;
};

type DomainBreakdown = {
  name: string;
  met: number;
  partial: number;
  notMet: number;
  unknown: number;
  total: number;
};

type ScoreData = {
  totalAnswered: number;
  met: number;
  partiallyMet: number;
  notMet: number;
  unknown: number;
  notApplicable: number;
  projectedScore: number | null;
  maxScore: number;
  confidenceScore: number | null;
  domainBreakdown: DomainBreakdown[];
  gaps: Gap[];
  poamCandidates: number;
  assessmentStatus: string;
};

// ── Helpers ────────────────────────────────────────────────────────────────────

const RESULT_COLORS: Record<string, string> = {
  met: "text-green-600",
  partially_met: "text-yellow-600",
  not_met: "text-red-600",
  unknown: "text-slate-500",
  not_applicable: "text-slate-400",
};

const RESULT_LABELS: Record<string, string> = {
  met: "Met",
  partially_met: "Partially Met",
  not_met: "Not Met",
  unknown: "Unknown",
  not_applicable: "N/A",
};

const RISK_COLORS: Record<string, string> = {
  critical: "bg-red-100 text-red-700",
  high: "bg-orange-100 text-orange-700",
  medium: "bg-yellow-100 text-yellow-700",
  low: "bg-blue-100 text-blue-700",
  informational: "bg-slate-100 text-slate-600",
};

function ScoreRing({ score, max, label, color }: { score: number | null; max: number; label: string; color: string }) {
  const pct = score != null ? Math.round((score / max) * 100) : 0;
  const radius = 42;
  const circ = 2 * Math.PI * radius;
  const dash = (pct / 100) * circ;

  return (
    <div className="flex flex-col items-center gap-2">
      <svg width="110" height="110" viewBox="0 0 110 110">
        <circle cx="55" cy="55" r={radius} fill="none" stroke="#e5e7eb" strokeWidth="10" />
        <circle
          cx="55"
          cy="55"
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth="10"
          strokeDasharray={`${dash} ${circ - dash}`}
          strokeLinecap="round"
          transform="rotate(-90 55 55)"
          style={{ transition: "stroke-dasharray 0.6s ease" }}
        />
        <text x="55" y="50" textAnchor="middle" fontSize="20" fontWeight="700" fill="currentColor" className="text-foreground">
          {score ?? "—"}
        </text>
        <text x="55" y="68" textAnchor="middle" fontSize="11" fill="#6b7280">
          / {max}
        </text>
      </svg>
      <span className="text-sm font-medium text-muted-foreground">{label}</span>
      {score != null && (
        <span className="text-xs text-muted-foreground">{pct}% readiness</span>
      )}
    </div>
  );
}

function DomainBar({ domain }: { domain: DomainBreakdown }) {
  const total = domain.total || 1;
  const metPct = (domain.met / total) * 100;
  const partialPct = (domain.partial / total) * 100;
  const notMetPct = (domain.notMet / total) * 100;

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground truncate max-w-[180px]">{domain.name}</span>
        <span className="text-xs text-muted-foreground shrink-0">
          {domain.met}/{domain.total}
        </span>
      </div>
      <div className="h-2 rounded-full bg-muted overflow-hidden flex">
        <div className="bg-green-500 h-full transition-all" style={{ width: `${metPct}%` }} />
        <div className="bg-yellow-400 h-full transition-all" style={{ width: `${partialPct}%` }} />
        <div className="bg-red-400 h-full transition-all" style={{ width: `${notMetPct}%` }} />
      </div>
    </div>
  );
}

// ── Main ───────────────────────────────────────────────────────────────────────

export default function ReadinessResults({ id }: { id: string }) {
  const { activeOrg } = useOrg();
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const token = localStorage.getItem("auth_token");

  const headers = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
    "X-Organization-ID": activeOrg?.id ?? "",
  };

  const canEdit = user?.role === "admin" || user?.role === "compliance_manager";

  const { data: assessment, isLoading: loadingA } = useQuery<Assessment>({
    queryKey: ["readiness-assessment", id],
    enabled: !!id && !!token,
    queryFn: async () => {
      const res = await fetch(`/api/readiness/assessments/${id}`, { headers });
      if (!res.ok) throw new Error("Not found");
      return res.json();
    },
  });

  const { data: score, isLoading: loadingS } = useQuery<ScoreData>({
    queryKey: ["readiness-score", id],
    enabled: !!id && !!token,
    queryFn: async () => {
      const res = await fetch(`/api/readiness/assessments/${id}/score`, { headers });
      if (!res.ok) throw new Error("Failed to load score");
      return res.json();
    },
    refetchInterval: assessment?.status !== "complete" ? 5000 : false,
  });

  const completeMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/readiness/assessments/${id}/complete`, {
        method: "POST",
        headers,
      });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Assessment marked complete" });
    },
    onError: () => {
      toast({ title: "Failed to complete assessment", variant: "destructive" });
    },
  });

  const isLoading = loadingA || loadingS;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary" />
      </div>
    );
  }

  const gaps = score?.gaps ?? [];
  const notMetGaps = gaps.filter((g) => g.result === "not_met");
  const partialGaps = gaps.filter((g) => g.result === "partially_met");

  const suggestedStatus = (result: string) => {
    if (result === "met") return "Needs Evidence";
    if (result === "partially_met") return "In Progress";
    if (result === "not_met") return "Gap Identified";
    return "Needs Review";
  };

  const suggestedStatusColor = (result: string) => {
    if (result === "met") return "bg-blue-100 text-blue-700";
    if (result === "partially_met") return "bg-yellow-100 text-yellow-700";
    if (result === "not_met") return "bg-red-100 text-red-700";
    return "bg-slate-100 text-slate-600";
  };

  return (
    <div className="max-w-7xl mx-auto px-6 py-8 space-y-8">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <Link href="/readiness" className="text-muted-foreground hover:text-foreground">
            <ChevronLeft className="h-5 w-5" />
          </Link>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">{assessment?.name ?? "Assessment Results"}</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              {assessment?.targetLevel} · {assessment?.assessmentDate}
              {assessment?.assessorName ? ` · ${assessment.assessorName}` : ""}
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          {assessment?.status !== "complete" && canEdit && (
            <Button onClick={() => navigate(`/readiness/${id}/assess`)} variant="outline">
              Continue Assessment
              <ArrowRight className="h-4 w-4 ml-2" />
            </Button>
          )}
          {assessment?.status !== "complete" && canEdit && (
            <Button
              onClick={() => completeMutation.mutate()}
              disabled={completeMutation.isPending}
            >
              {completeMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Mark Complete
            </Button>
          )}
        </div>
      </div>

      {/* Disclaimer banner */}
      <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
        <strong>Internal Estimate Only:</strong> The Projected Internal Readiness Score below is NOT an official CMMC score.
        Official scores are determined exclusively by a certified C3PAO.
      </div>

      {/* Score cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="rounded-xl border bg-card p-6 flex flex-col items-center">
          <ScoreRing
            score={score?.projectedScore ?? null}
            max={score?.maxScore ?? 110}
            label="Projected Readiness Score"
            color="#22c55e"
          />
        </div>
        <div className="rounded-xl border bg-card p-6 flex flex-col items-center">
          <ScoreRing
            score={score?.confidenceScore ?? null}
            max={100}
            label="Audit Confidence Score"
            color="#3b82f6"
          />
          <p className="text-xs text-center text-muted-foreground mt-2 leading-relaxed">
            Based on evidence, policy, procedure, SSP narrative, and test signals.
          </p>
        </div>
        <div className="rounded-xl border bg-card p-6 space-y-3">
          <p className="text-sm font-semibold">Control Breakdown</p>
          {[
            { label: "Met", value: score?.met ?? 0, icon: CheckCircle2, color: "text-green-600" },
            { label: "Partially Met", value: score?.partiallyMet ?? 0, icon: Clock3, color: "text-yellow-600" },
            { label: "Not Met", value: score?.notMet ?? 0, icon: XCircle, color: "text-red-600" },
            { label: "Unknown", value: score?.unknown ?? 0, icon: HelpCircle, color: "text-slate-500" },
            { label: "N/A", value: score?.notApplicable ?? 0, icon: ListChecks, color: "text-slate-400" },
          ].map(({ label, value, icon: Icon, color }) => (
            <div key={label} className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Icon className={cn("h-4 w-4", color)} />
                <span className="text-sm text-muted-foreground">{label}</span>
              </div>
              <span className={cn("text-sm font-semibold", color)}>{value}</span>
            </div>
          ))}
          <div className="pt-2 border-t flex items-center justify-between">
            <span className="text-xs text-muted-foreground">POA&amp;M Candidates</span>
            <span className="text-sm font-semibold text-orange-600">{score?.poamCandidates ?? 0}</span>
          </div>
        </div>
      </div>

      {/* Domain breakdown */}
      {(score?.domainBreakdown?.length ?? 0) > 0 && (
        <div className="rounded-xl border bg-card p-6">
          <h2 className="text-sm font-semibold mb-5 flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-primary" />
            Domain Readiness Breakdown
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-4">
            {(score?.domainBreakdown ?? [])
              .sort((a, b) => (b.met / (b.total || 1)) - (a.met / (a.total || 1)))
              .map((d) => (
                <DomainBar key={d.name} domain={d} />
              ))}
          </div>
          <div className="flex items-center gap-4 mt-4 text-xs text-muted-foreground">
            <div className="flex items-center gap-1.5"><div className="w-3 h-2 rounded-sm bg-green-500" />Met</div>
            <div className="flex items-center gap-1.5"><div className="w-3 h-2 rounded-sm bg-yellow-400" />Partial</div>
            <div className="flex items-center gap-1.5"><div className="w-3 h-2 rounded-sm bg-red-400" />Not Met</div>
            <div className="flex items-center gap-1.5"><div className="w-3 h-2 rounded-sm bg-muted" />Unknown</div>
          </div>
        </div>
      )}

      {/* Findings / Gaps table */}
      {gaps.length > 0 && (
        <div className="rounded-xl border bg-card overflow-hidden">
          <div className="px-6 py-4 border-b flex items-center justify-between">
            <h2 className="text-sm font-semibold flex items-center gap-2">
              <FileWarning className="h-4 w-4 text-orange-500" />
              Findings &amp; Gaps
              <span className="ml-1 px-2 py-0.5 rounded-full bg-orange-100 text-orange-700 text-xs font-semibold">
                {gaps.length}
              </span>
            </h2>
            <div className="flex gap-4 text-xs text-muted-foreground">
              <span className="text-red-600 font-medium">{notMetGaps.length} Not Met</span>
              <span className="text-yellow-600 font-medium">{partialGaps.length} Partial</span>
            </div>
          </div>
          <table className="w-full">
            <thead>
              <tr className="border-b bg-muted/30">
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Control</th>
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Domain</th>
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Result</th>
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Suggested Status</th>
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Risk</th>
                <th className="px-4 py-2.5" />
              </tr>
            </thead>
            <tbody className="divide-y">
              {gaps.map((gap) => (
                <tr key={gap.id} className="hover:bg-muted/20">
                  <td className="px-4 py-3">
                    <span className="font-mono text-xs font-semibold">{gap.controlRef}</span>
                    {gap.findingTitle && (
                      <p className="text-xs text-muted-foreground mt-0.5 max-w-[200px] truncate">{gap.findingTitle}</p>
                    )}
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">{gap.domainName}</td>
                  <td className="px-4 py-3">
                    <span className={cn("text-xs font-semibold", RESULT_COLORS[gap.result])}>
                      {RESULT_LABELS[gap.result] ?? gap.result}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={cn("text-xs px-2 py-0.5 rounded-full font-medium", suggestedStatusColor(gap.result))}>
                      {suggestedStatus(gap.result)}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {gap.riskLevel ? (
                      <span className={cn("text-xs px-2 py-0.5 rounded-full font-medium capitalize", RISK_COLORS[gap.riskLevel] ?? "bg-slate-100 text-slate-600")}>
                        {gap.riskLevel}
                      </span>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      {!gap.evidenceExists && (
                        <span className="text-amber-600 font-medium">No evidence</span>
                      )}
                      {!gap.policyExists && (
                        <span className="text-amber-600 font-medium">No policy</span>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Empty gaps state */}
      {gaps.length === 0 && (score?.totalAnswered ?? 0) > 0 && (
        <div className="rounded-xl border bg-card p-12 text-center">
          <CheckCircle2 className="h-10 w-10 text-green-500 mx-auto mb-3" />
          <p className="text-lg font-semibold">No gaps identified</p>
          <p className="text-sm text-muted-foreground">All answered controls are met or not applicable.</p>
        </div>
      )}

      {/* No data yet */}
      {(score?.totalAnswered ?? 0) === 0 && (
        <div className="rounded-xl border bg-card p-12 text-center">
          <AlertTriangle className="h-10 w-10 text-muted-foreground/40 mx-auto mb-3" />
          <p className="text-lg font-semibold text-muted-foreground">No controls answered yet</p>
          <Button className="mt-4" onClick={() => navigate(`/readiness/${id}/assess`)}>
            Start Control Assessment
            <ChevronRight className="h-4 w-4 ml-2" />
          </Button>
        </div>
      )}

      {/* Roadmap callout */}
      {gaps.length > 0 && (
        <div className="rounded-xl border border-primary/20 bg-primary/5 p-5 flex items-start gap-4">
          <TrendingUp className="h-5 w-5 text-primary shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-primary">Next Step: Implementation Roadmap</p>
            <p className="text-sm text-muted-foreground mt-0.5">
              Review the Implementation Roadmap to find priority actions that address your identified gaps.
              Actions are mapped to the controls that need remediation.
            </p>
            <Link href="/roadmap" className="inline-flex items-center gap-1 text-sm text-primary hover:underline mt-2 font-medium">
              Go to Implementation Roadmap
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
