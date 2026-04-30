import { 
  useGetDashboardSummary, 
  useGetReadinessByDomain, 
  useGetRecentActivity 
} from "@workspace/api-client-react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { ShieldCheck, AlertTriangle, FileText, CheckSquare, Activity, Clock } from "lucide-react";

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

function getProgressColor(percent: number): string {
  if (percent < 50) return "bg-red-500";
  if (percent < 80) return "bg-yellow-500";
  return "bg-green-500";
}

export default function Dashboard() {
  const { data: summary, isLoading: summaryLoading } = useGetDashboardSummary();
  const { data: domains, isLoading: domainsLoading } = useGetReadinessByDomain();
  const { data: recentActivity, isLoading: activityLoading } = useGetRecentActivity({ limit: 15 });
  
  if (summaryLoading || domainsLoading) {
    return (
      <div className="space-y-6">
        <h1 className="text-3xl font-bold">Dashboard</h1>
        <div className="text-muted-foreground text-sm">Loading dashboard...</div>
      </div>
    );
  }

  if (!summary || !domains) {
    return (
      <div className="space-y-6">
        <h1 className="text-3xl font-bold">Dashboard</h1>
        <div className="text-muted-foreground text-sm">Unable to load dashboard data. Make sure an organization is selected.</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">Dashboard</h1>
      
      {/* Summary KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Overall Readiness</CardTitle>
            <ShieldCheck className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{summary.overallReadinessPercent ?? 0}%</div>
            <Progress value={summary.overallReadinessPercent ?? 0} className="mt-2" indicatorClassName={getProgressColor(summary.overallReadinessPercent ?? 0)} />
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">At Risk Controls</CardTitle>
            <AlertTriangle className="h-4 w-4 text-red-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">{summary.atRiskControls ?? 0}</div>
            <p className="text-xs text-muted-foreground">Controls needing attention</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Pending Evidence</CardTitle>
            <FileText className="h-4 w-4 text-yellow-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-yellow-600">{summary.pendingReviewItems ?? 0}</div>
            <p className="text-xs text-muted-foreground">Items awaiting review</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Overdue Tasks</CardTitle>
            <CheckSquare className="h-4 w-4 text-red-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">{summary.overdueTasks ?? 0}</div>
            <p className="text-xs text-muted-foreground">Tasks past due date</p>
          </CardContent>
        </Card>
      </div>

      {/* Domain Readiness + Recent Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Domain Readiness</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {domains.length === 0 ? (
              <p className="text-sm text-muted-foreground">No domain data available.</p>
            ) : (
              domains.map((domain) => {
                const pct = domain.readinessPercent ?? 0;
                const ready = domain.readyControls ?? domain.implementedControls ?? 0;
                const total = domain.totalControls ?? 0;
                return (
                  <div key={domain.domainId} className="space-y-1">
                    <div className="flex justify-between items-center text-sm">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="inline-flex items-center justify-center w-8 h-5 rounded text-xs font-bold bg-slate-100 text-slate-700 shrink-0">
                          {domain.domainCode}
                        </span>
                        <span className="font-medium truncate" title={domain.domainName}>
                          {domain.domainName}
                        </span>
                      </div>
                      <span className="text-muted-foreground shrink-0 ml-2">
                        {ready}/{total}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Progress value={pct} className="flex-1 h-2" indicatorClassName={getProgressColor(pct)} />
                      <span className="text-xs font-medium w-9 text-right">{pct}%</span>
                    </div>
                  </div>
                );
              })
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <CardTitle>Recent Activity</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
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
              <div className="space-y-3">
                {recentActivity.map((activity) => (
                  <div key={activity.id} className="flex items-start gap-3 text-sm pb-3 border-b last:border-0 last:pb-0">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-foreground">
                          {activity.userName ?? "System"}
                        </span>
                        <span className={`inline-flex items-center rounded px-1.5 py-0.5 text-xs font-medium ${actionBadgeColor(activity.action ?? "")}`}>
                          {activity.actionLabel ?? activity.action}
                        </span>
                        <span className="text-muted-foreground capitalize">
                          {activity.entityTypeLabel ?? activity.entityType}
                        </span>
                      </div>
                      {activity.entityLabel && (
                        <p className="text-xs text-foreground/70 mt-0.5 truncate" title={activity.entityLabel}>
                          {activity.entityLabel}
                          {activity.newValue && activity.action === "status_changed"
                            ? ` → ${String(activity.newValue).replace(/_/g, " ")}`
                            : ""}
                        </p>
                      )}
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {relativeTime(activity.timestamp)}
                      </p>
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
