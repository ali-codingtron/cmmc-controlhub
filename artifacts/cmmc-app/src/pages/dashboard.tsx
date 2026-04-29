import { 
  useGetDashboardSummary, 
  useGetReadinessByDomain, 
  useGetMissingEvidence, 
  useGetStaleEvidence, 
  useGetOverdueTasks, 
  useGetUpcomingReviews, 
  useGetRecentActivity 
} from "@workspace/api-client-react";
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { ShieldCheck, AlertTriangle, FileText, CheckSquare } from "lucide-react";
import { Link } from "wouter";

export default function Dashboard() {
  const { data: summary } = useGetDashboardSummary();
  const { data: domains } = useGetReadinessByDomain();
  const { data: recentActivity } = useGetRecentActivity({ limit: 10 });
  
  if (!summary || !domains) return <div>Loading...</div>;

  const getProgressColor = (percent: number) => {
    if (percent < 50) return "bg-red-500";
    if (percent < 80) return "bg-yellow-500";
    return "bg-green-500";
  };

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">Dashboard</h1>
      
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Overall Readiness</CardTitle>
            <ShieldCheck className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{summary.overallReadinessPercent}%</div>
            <Progress value={summary.overallReadinessPercent} className="mt-2" indicatorClassName={getProgressColor(summary.overallReadinessPercent)} />
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">At Risk Controls</CardTitle>
            <AlertTriangle className="h-4 w-4 text-red-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">{summary.atRiskControls}</div>
            <p className="text-xs text-muted-foreground">Controls needing attention</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Pending Evidence</CardTitle>
            <FileText className="h-4 w-4 text-yellow-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-yellow-600">{summary.pendingReviewItems}</div>
            <p className="text-xs text-muted-foreground">Items awaiting review</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Overdue Tasks</CardTitle>
            <CheckSquare className="h-4 w-4 text-red-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">{summary.overdueTasks}</div>
            <p className="text-xs text-muted-foreground">Tasks past due date</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Domain Readiness</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {domains.map(domain => (
              <div key={domain.domainId} className="space-y-1">
                <div className="flex justify-between text-sm">
                  <span className="font-medium">{domain.domainName}</span>
                  <span>{domain.readinessPercent}%</span>
                </div>
                <Progress value={domain.readinessPercent} indicatorClassName={getProgressColor(domain.readinessPercent)} />
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Recent Activity</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {recentActivity?.map(activity => (
                <div key={activity.id} className="flex items-start gap-4 text-sm">
                  <div className="flex-1">
                    <p>
                      <span className="font-medium">{activity.userName}</span>
                      {" "}{activity.action.toLowerCase()}{" "}
                      <span className="font-medium">{activity.entityLabel}</span>
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(activity.timestamp).toLocaleString()}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}