import {
  useGetDashboardSummary,
  useGetReadinessByDomain,
  useGetRecentActivity,
} from "@workspace/api-client-react";
import { useOrg } from "@/context/OrgContext";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import {
  ShieldCheck,
  AlertTriangle,
  FileText,
  CheckSquare,
  Activity,
  Clock,
  TrendingUp,
  CircleCheck,
  CircleDot,
  CircleX,
  CircleAlert,
} from "lucide-react";
import { Link } from "wouter";
import { cn } from "@/lib/utils";

function relativeTime(ts: string | Date | null | undefined): string {
  if (!ts) return "";
  const diff = Date.now() - new Date(ts).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(ts).toLocaleDateString();
}

function actionBadgeColor(action: string): string {
  switch (action) {
    case "uploaded": return "bg-blue-100 text-blue-700";
    case "created": return "bg-green-100 text-green-700";
    case "approved": return "bg-green-100 text-green-700";
    case "deleted": return "bg-red-100 text-red-700";
    case "rejected": return "bg-red-100 text-red-700";
    case "status_changed": return "bg-purple-100 text-purple-700";
    case "updated": return "bg-yellow-100 text-yellow-700";
    case "link_added": return "bg-indigo-100 text-indigo-700";
    case "link_removed": return "bg-orange-100 text-orange-700";
    default: return "bg-gray-100 text-gray-600";
  }
}

function getProgressColor(pct: number): string {
  if (pct < 40) return "bg-red-500";
  if (pct < 70) return "bg-yellow-500";
  return "bg-green-500";
}

function ReadinessRing({ value }: { value: number }) {
  const circumference = 2 * Math.PI * 15.9;
  const strokeDash = (value / 100) * circumference;
  const colorClass = value < 40 ? "stroke-red-500" : value < 70 ? "stroke-yellow-500" : "stroke-green-500";
  const textColor = value < 40 ? "text-red-600" : value < 70 ? "text-yellow-600" : "text-green-600";
  return (
    <div className="relative flex items-center justify-center w-24 h-24">
      <svg className="w-full h-full -rotate-90" viewBox="0 0 36 36">
        <circle cx="18" cy="18" r="15.9" fill="none" strokeWidth="3" className="stroke-muted" />
        <circle
          cx="18" cy="18" r="15.9" fill="none" strokeWidth="3"
          strokeDasharray={`${strokeDash} ${circumference - strokeDash}`}
          strokeLinecap="round"
          className={colorClass}
        />
      </svg>
      <div className="absolute flex flex-col items-center">
        <span className={cn("text-xl font-bold leading-none", textColor)}>{value}%</span>
        <span className="text-[10px] text-muted-foreground">Ready</span>
      </div>
    </div>
  );
}

export default function Dashboard() {
  const { activeOrg } = useOrg();
  const { data: summary, isLoading: summaryLoading } = useGetDashboardSummary();
  const { data: domains, isLoading: domainsLoading } = useGetReadinessByDomain();
  const { data: recentActivity, isLoading: activityLoading } = useGetRecentActivity({ limit: 15 });

  const pageTitle = activeOrg ? `Dashboard: ${activeOrg.name}` : "Dashboard";

  if (summaryLoading || domainsLoading) {
    return (
      <div className="space-y-6">
        <h1 className="text-3xl font-bold">{pageTitle}</h1>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[...Array(8)].map((_, i) => <div key={i} className="h-28 animate-pulse bg-muted rounded-lg" />)}
        </div>
      </div>
    );
  }

  if (!summary) {
    return (
      <div className="space-y-6">
        <h1 className="text-3xl font-bold">{pageTitle}</h1>
        <div className="text-muted-foreground text-sm">Unable to load dashboard data. Make sure an organization is selected.</div>
      </div>
    );
  }

  const total = summary.totalControls ?? 0;
  const implemented = summary.implementedControls ?? 0;
  const notStarted = summary.notStartedControls ?? 0;
  const inProgress = Math.max(0, total - implemented - notStarted);
  const readiness = summary.overallReadinessPercent ?? 0;

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">{pageTitle}</h1>

      {/* Top section: readiness ring + controls breakdown */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Overall Readiness */}
        <Card>
          <CardContent className="pt-5 pb-5 flex items-center gap-5">
            <ReadinessRing value={readiness} />
            <div className="flex-1 space-y-1">
              <p className="font-semibold">Overall Readiness</p>
              <p className="text-sm text-muted-foreground">{implemented} of {total} controls implemented</p>
              <Progress value={readiness} className="h-2 mt-1" indicatorClassName={getProgressColor(readiness)} />
            </div>
          </CardContent>
        </Card>

        {/* Controls Breakdown */}
        <Card>
          <CardContent className="pt-5 pb-5">
            <p className="text-sm font-semibold mb-3 text-muted-foreground uppercase tracking-wide text-xs">Controls Breakdown</p>
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <CircleCheck className="h-4 w-4 text-green-500 shrink-0" />
                <div className="flex-1">
                  <p className="text-[11px] text-muted-foreground leading-none mb-0.5">Implemented</p>
                  <p className="text-lg font-bold leading-none">{implemented}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <CircleDot className="h-4 w-4 text-yellow-500 shrink-0" />
                <div className="flex-1">
                  <p className="text-[11px] text-muted-foreground leading-none mb-0.5">In Progress</p>
                  <p className="text-lg font-bold leading-none">{inProgress}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <CircleAlert className="h-4 w-4 text-red-400 shrink-0" />
                <div className="flex-1">
                  <p className="text-[11px] text-muted-foreground leading-none mb-0.5">Not Started</p>
                  <p className="text-lg font-bold leading-none">{notStarted}</p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Evidence + Risk */}
        <Card>
          <CardContent className="pt-5 pb-5 space-y-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Evidence &amp; Risk</p>
            <div className="grid grid-cols-3 gap-2">
              <div className="rounded-md bg-muted/50 p-2 text-center">
                <p className="text-[10px] text-muted-foreground">Total</p>
                <p className="font-bold text-base">{summary.totalEvidenceItems ?? 0}</p>
              </div>
              <div className="rounded-md bg-green-50 dark:bg-green-950/30 p-2 text-center">
                <p className="text-[10px] text-muted-foreground">Approved</p>
                <p className="font-bold text-base text-green-700 dark:text-green-400">{summary.approvedEvidenceItems ?? 0}</p>
              </div>
              <div className="rounded-md bg-yellow-50 dark:bg-yellow-950/30 p-2 text-center">
                <p className="text-[10px] text-muted-foreground">Pending</p>
                <p className="font-bold text-base text-yellow-700 dark:text-yellow-400">{summary.pendingReviewItems ?? 0}</p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2 border-t pt-3">
              <Link href="/poams" className="rounded-md bg-red-50 dark:bg-red-950/30 p-2 block hover:opacity-80 transition-opacity">
                <p className="text-[10px] text-muted-foreground">Open POA&amp;Ms</p>
                <p className="font-bold text-base text-red-700 dark:text-red-400">{summary.openPoams ?? 0}</p>
              </Link>
              <Link href="/monitoring" className="rounded-md bg-orange-50 dark:bg-orange-950/30 p-2 block hover:opacity-80 transition-opacity">
                <p className="text-[10px] text-muted-foreground">Monitoring Overdue</p>
                <p className="font-bold text-base text-orange-700 dark:text-orange-400">{(summary as any).monitoringOverdue ?? 0}</p>
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Domain Readiness + Recent Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
              Domain Readiness
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {!domains || domains.length === 0 ? (
              <p className="text-sm text-muted-foreground">No domain data available.</p>
            ) : (
              domains.map((domain) => {
                const pct = domain.readinessPercent ?? 0;
                const ready = (domain as any).readyControls ?? domain.implementedControls ?? 0;
                const dtotal = domain.totalControls ?? 0;
                return (
                  <div key={domain.domainId} className="space-y-1.5">
                    <div className="flex justify-between items-center text-sm">
                      <div className="flex items-center gap-2 min-w-0 flex-1">
                        <span className="inline-flex items-center justify-center px-1.5 py-0.5 rounded text-[11px] font-bold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 shrink-0 min-w-[28px]">
                          {domain.domainCode}
                        </span>
                        <span className="font-medium truncate text-sm" title={domain.domainName}>
                          {domain.domainName}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 shrink-0 ml-2">
                        <span className="text-muted-foreground text-xs tabular-nums">{ready}/{dtotal}</span>
                        <span className={cn(
                          "text-xs font-semibold tabular-nums w-9 text-right",
                          pct < 40 ? "text-red-600" : pct < 70 ? "text-yellow-600" : "text-green-600"
                        )}>{pct}%</span>
                      </div>
                    </div>
                    <Progress value={pct} className="h-2" indicatorClassName={getProgressColor(pct)} />
                  </div>
                );
              })
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <CardTitle className="flex items-center gap-2">
              <Activity className="h-4 w-4 text-muted-foreground" />
              Recent Activity
            </CardTitle>
          </CardHeader>
          <CardContent>
            {activityLoading ? (
              <p className="text-sm text-muted-foreground">Loading activity...</p>
            ) : !recentActivity || recentActivity.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <Clock className="h-8 w-8 text-muted-foreground mb-2 opacity-50" />
                <p className="text-sm text-muted-foreground">No activity recorded yet.</p>
                <p className="text-xs text-muted-foreground mt-1">Actions like updating controls, uploading evidence, and managing tasks will appear here.</p>
              </div>
            ) : (
              <div className="space-y-3 max-h-96 overflow-y-auto pr-1">
                {recentActivity.map((activity) => (
                  <div key={activity.id} className="flex items-start gap-3 text-sm pb-3 border-b last:border-0 last:pb-0">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-foreground">{activity.userName ?? "System"}</span>
                        <span className={`inline-flex items-center rounded px-1.5 py-0.5 text-xs font-medium ${actionBadgeColor(activity.action ?? "")}`}>
                          {activity.actionLabel ?? activity.action}
                        </span>
                        <span className="text-muted-foreground capitalize">{activity.entityTypeLabel ?? activity.entityType}</span>
                      </div>
                      {activity.entityLabel && (
                        <p className="text-xs text-foreground/70 mt-0.5 truncate" title={activity.entityLabel}>
                          {activity.entityLabel}
                          {activity.newValue && activity.action === "status_changed"
                            ? ` → ${String(activity.newValue).replace(/_/g, " ")}`
                            : ""}
                        </p>
                      )}
                      <p className="text-xs text-muted-foreground mt-0.5">{relativeTime(activity.timestamp)}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
