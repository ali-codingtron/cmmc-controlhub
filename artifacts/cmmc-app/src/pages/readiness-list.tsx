import { useQuery } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import { useOrg } from "@/context/OrgContext";
import { useAuth } from "@/lib/auth";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  ClipboardCheck,
  Plus,
  ChevronRight,
  Calendar,
  User,
  CheckCircle2,
  Clock3,
  CircleDot,
  FileQuestion,
} from "lucide-react";
import { cn } from "@/lib/utils";

type Assessment = {
  id: string;
  name: string;
  assessmentType: string;
  targetLevel: string;
  assessorName: string;
  assessmentDate: string;
  status: "setup" | "scoping" | "in_progress" | "complete";
  projectedScore: number | null;
  maxScore: number;
  confidenceScore: number | null;
  totalFindings: number;
  metCount: number;
  notMetCount: number;
  createdAt: string;
};

const TYPE_LABELS: Record<string, string> = {
  quick_baseline: "Quick Baseline",
  full_control: "Full Control",
  objective_level: "Objective-Level",
  reassessment: "Reassessment",
};

function StatusBadge({ status }: { status: Assessment["status"] }) {
  const map = {
    setup: { label: "Setup", icon: CircleDot, cls: "bg-slate-100 text-slate-700 border-slate-200" },
    scoping: { label: "Scoping", icon: FileQuestion, cls: "bg-yellow-50 text-yellow-700 border-yellow-200" },
    in_progress: { label: "In Progress", icon: Clock3, cls: "bg-blue-50 text-blue-700 border-blue-200" },
    complete: { label: "Complete", icon: CheckCircle2, cls: "bg-green-50 text-green-700 border-green-200" },
  }[status] ?? { label: status, icon: CircleDot, cls: "bg-slate-100 text-slate-600 border-slate-200" };

  const Icon = map.icon;
  return (
    <span className={cn("inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border", map.cls)}>
      <Icon className="h-3 w-3" />
      {map.label}
    </span>
  );
}

export default function ReadinessList() {
  const { activeOrg } = useOrg();
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const token = localStorage.getItem("auth_token");

  const canCreate = user?.role === "admin" || user?.role === "compliance_manager";

  const { data: assessments = [], isLoading } = useQuery<Assessment[]>({
    queryKey: ["readiness-assessments", activeOrg?.id],
    enabled: !!activeOrg?.id && !!token,
    queryFn: async () => {
      const res = await fetch("/api/readiness/assessments", {
        headers: {
          Authorization: `Bearer ${token}`,
          "X-Organization-ID": activeOrg!.id,
        },
      });
      if (!res.ok) throw new Error("Failed to load assessments");
      return res.json();
    },
  });

  const handleRowClick = (a: Assessment) => {
    if (a.status === "complete") {
      navigate(`/readiness/${a.id}/results`);
    } else {
      navigate(`/readiness/${a.id}/assess`);
    }
  };

  return (
    <div className="max-w-6xl mx-auto px-6 py-8 space-y-8">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-primary/10">
            <ClipboardCheck className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Readiness Assessor</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Run internal CMMC baseline assessments to identify gaps before a formal C3PAO evaluation.
            </p>
          </div>
        </div>
        {canCreate && (
          <Button onClick={() => navigate("/readiness/new")}>
            <Plus className="h-4 w-4 mr-2" />
            New Assessment
          </Button>
        )}
      </div>

      {/* Info banner */}
      <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
        <strong>Internal Use Only:</strong> Scores shown here are projected readiness estimates, not official CMMC scores.
        An official score is only determined by a certified C3PAO.
      </div>

      {/* Assessments list */}
      {isLoading ? (
        <div className="flex items-center justify-center h-48">
          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary" />
        </div>
      ) : assessments.length === 0 ? (
        <div className="rounded-xl border-2 border-dashed border-muted-foreground/20 bg-muted/30 py-20 text-center">
          <ClipboardCheck className="h-10 w-10 text-muted-foreground/40 mx-auto mb-3" />
          <p className="text-lg font-medium text-muted-foreground">No assessments yet</p>
          <p className="text-sm text-muted-foreground/70 mb-6">
            Start a readiness assessment to identify compliance gaps before your formal evaluation.
          </p>
          {canCreate && (
            <Button onClick={() => navigate("/readiness/new")}>
              <Plus className="h-4 w-4 mr-2" />
              Start Your First Assessment
            </Button>
          )}
        </div>
      ) : (
        <div className="rounded-xl border bg-card overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b bg-muted/40">
                <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Assessment</th>
                <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Type</th>
                <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Date</th>
                <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Status</th>
                <th className="text-right px-4 py-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Projected Score</th>
                <th className="text-right px-4 py-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Controls</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y">
              {assessments.map((a) => (
                <tr
                  key={a.id}
                  className="hover:bg-muted/30 cursor-pointer transition-colors"
                  onClick={() => handleRowClick(a)}
                >
                  <td className="px-4 py-3">
                    <div className="font-medium text-sm">{a.name}</div>
                    {a.assessorName && (
                      <div className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                        <User className="h-3 w-3" />
                        {a.assessorName}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-xs text-muted-foreground">
                      {TYPE_LABELS[a.assessmentType] ?? a.assessmentType} · {a.targetLevel}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Calendar className="h-3 w-3" />
                      {a.assessmentDate}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={a.status} />
                  </td>
                  <td className="px-4 py-3 text-right">
                    {a.projectedScore != null ? (
                      <span className="font-semibold text-sm">
                        {a.projectedScore}
                        <span className="text-xs text-muted-foreground font-normal">/{a.maxScore}</span>
                      </span>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {a.totalFindings > 0 ? (
                      <div className="text-xs text-muted-foreground">
                        <span className="text-green-600 font-medium">{a.metCount} met</span>
                        {" · "}
                        <span className="text-red-600 font-medium">{a.notMetCount} not met</span>
                        {" · "}
                        {a.totalFindings} total
                      </div>
                    ) : (
                      <span className="text-xs text-muted-foreground">0 answered</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
