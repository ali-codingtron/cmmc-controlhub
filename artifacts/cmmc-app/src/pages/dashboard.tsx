import {
  useGetDashboardSummary,
  useGetReadinessByDomain,
  useGetRecentActivity,
  useListOrgPackages,
} from "@workspace/api-client-react";
import { useOrg } from "@/context/OrgContext";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Link } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import {
  ShieldCheck,
  AlertTriangle,
  FileText,
  Activity,
  Clock,
  TrendingUp,
  CircleCheck,
  CircleDot,
  CircleAlert,
  BarChart3,
  RefreshCcw,
  ExternalLink,
  Upload,
  Edit3,
  Trash2,
  CheckCircle2,
  XCircle,
  Link2,
  Link2Off,
  Eye,
  ArrowRight,
  Zap,
  Calendar,
  Shield,
  Map,
} from "lucide-react";

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

function getReadinessStatus(pct: number): { label: string; color: string; bg: string; border: string } {
  if (pct >= 95) return { label: "Assessment Ready", color: "text-emerald-700", bg: "bg-emerald-50", border: "border-emerald-200" };
  if (pct >= 75) return { label: "Progressing", color: "text-blue-700", bg: "bg-blue-50", border: "border-blue-200" };
  if (pct >= 40) return { label: "In Progress", color: "text-amber-700", bg: "bg-amber-50", border: "border-amber-200" };
  return { label: "At Risk", color: "text-red-700", bg: "bg-red-50", border: "border-red-200" };
}

function getProgressColor(pct: number): string {
  if (pct >= 95) return "bg-emerald-500";
  if (pct >= 75) return "bg-blue-500";
  if (pct >= 40) return "bg-amber-500";
  return "bg-red-500";
}

function getDomainStatusColor(pct: number) {
  if (pct >= 90) return { text: "text-emerald-700", bar: "bg-emerald-500", badge: "bg-emerald-50 text-emerald-700 border-emerald-200" };
  if (pct >= 60) return { text: "text-blue-700", bar: "bg-blue-500", badge: "bg-blue-50 text-blue-700 border-blue-200" };
  if (pct >= 30) return { text: "text-amber-700", bar: "bg-amber-500", badge: "bg-amber-50 text-amber-700 border-amber-200" };
  if (pct > 0)   return { text: "text-red-700",   bar: "bg-red-500",   badge: "bg-red-50 text-red-700 border-red-200" };
  return { text: "text-slate-500", bar: "bg-slate-300", badge: "bg-slate-100 text-slate-500 border-slate-200" };
}

function getActivityIcon(action: string) {
  switch (action) {
    case "uploaded":       return <Upload className="h-3.5 w-3.5" />;
    case "created":        return <Edit3 className="h-3.5 w-3.5" />;
    case "updated":        return <Edit3 className="h-3.5 w-3.5" />;
    case "deleted":        return <Trash2 className="h-3.5 w-3.5" />;
    case "approved":       return <CheckCircle2 className="h-3.5 w-3.5" />;
    case "rejected":       return <XCircle className="h-3.5 w-3.5" />;
    case "status_changed": return <Activity className="h-3.5 w-3.5" />;
    case "link_added":     return <Link2 className="h-3.5 w-3.5" />;
    case "link_removed":   return <Link2Off className="h-3.5 w-3.5" />;
    case "reviewed":       return <Eye className="h-3.5 w-3.5" />;
    default:               return <Activity className="h-3.5 w-3.5" />;
  }
}

function getActivityIconBg(action: string): string {
  switch (action) {
    case "uploaded":       return "bg-blue-100 text-blue-600";
    case "created":        return "bg-emerald-100 text-emerald-600";
    case "updated":        return "bg-slate-100 text-slate-600";
    case "deleted":        return "bg-red-100 text-red-600";
    case "approved":       return "bg-emerald-100 text-emerald-600";
    case "rejected":       return "bg-red-100 text-red-600";
    case "status_changed": return "bg-purple-100 text-purple-600";
    case "link_added":     return "bg-indigo-100 text-indigo-600";
    case "link_removed":   return "bg-orange-100 text-orange-600";
    default:               return "bg-slate-100 text-slate-600";
  }
}

function KpiCard({ title, children, href, className }: {
  title: string;
  children: React.ReactNode;
  href?: string;
  className?: string;
}) {
  const inner = (
    <Card className={cn("h-full border border-border/60 shadow-sm hover:shadow-md transition-shadow", className)}>
      <CardContent className="p-4 h-full flex flex-col">
        <p className="text-[11px] font-bold uppercase tracking-widest text-foreground/60 mb-3">{title}</p>
        {children}
      </CardContent>
    </Card>
  );
  if (href) return <Link href={href} className="block h-full">{inner}</Link>;
  return inner;
}

function StatRow({ icon, label, value, colorClass, href }: {
  icon?: React.ReactNode;
  label: string;
  value: number | string;
  colorClass?: string;
  href?: string;
}) {
  const content = (
    <div className={cn("flex items-center gap-2 py-1", href && "hover:opacity-75 transition-opacity")}>
      {icon && <span className="shrink-0">{icon}</span>}
      <span className="flex-1 text-xs text-muted-foreground truncate">{label}</span>
      <span className={cn("text-sm font-bold tabular-nums shrink-0", colorClass)}>{value}</span>
    </div>
  );
  if (href) return <Link href={href}>{content}</Link>;
  return content;
}

function ReadinessGauge({ value }: { value: number }) {
  const circumference = 2 * Math.PI * 42;
  const strokeDash = (value / 100) * circumference;
  const colorClass =
    value >= 95 ? "stroke-emerald-500" :
    value >= 75 ? "stroke-blue-500" :
    value >= 40 ? "stroke-amber-500" :
    "stroke-red-500";
  const textColor =
    value >= 95 ? "text-emerald-600" :
    value >= 75 ? "text-blue-600" :
    value >= 40 ? "text-amber-600" :
    "text-red-600";

  return (
    <div className="relative flex items-center justify-center w-28 h-28">
      <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
        <circle cx="50" cy="50" r="42" fill="none" strokeWidth="7" className="stroke-muted" />
        <circle
          cx="50" cy="50" r="42" fill="none" strokeWidth="7"
          strokeDasharray={`${strokeDash} ${circumference - strokeDash}`}
          strokeLinecap="round"
          className={cn("transition-all duration-700", colorClass)}
        />
      </svg>
      <div className="absolute flex flex-col items-center leading-none">
        <span className={cn("text-2xl font-extrabold", textColor)}>{value}%</span>
        <span className="text-[10px] text-muted-foreground mt-0.5">Ready</span>
      </div>
    </div>
  );
}


function SkeletonDashboard() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="h-24 bg-muted rounded-xl" />
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-4">
        {[...Array(5)].map((_, i) => <div key={i} className="h-40 bg-muted rounded-lg" />)}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        <div className="lg:col-span-3 h-80 bg-muted rounded-lg" />
        <div className="lg:col-span-2 h-80 bg-muted rounded-lg" />
      </div>
    </div>
  );
}

export default function Dashboard() {
  const { activeOrg, isLoading: orgLoading } = useOrg();
  const queryClient = useQueryClient();
  const { data: summary, isLoading: summaryLoading } = useGetDashboardSummary({
    query: { enabled: !!activeOrg },
  });
  const { data: domains, isLoading: domainsLoading } = useGetReadinessByDomain({
    query: { enabled: !!activeOrg },
  });
  const { data: recentActivity, isLoading: activityLoading } = useGetRecentActivity(
    { limit: 10 },
    { query: { enabled: !!activeOrg } },
  );
  const { data: orgPackages = [] } = useListOrgPackages(
    activeOrg?.id ?? "",
    { query: { enabled: !!activeOrg?.id, staleTime: 120000 } as any }
  );
  const activePkgs = orgPackages.filter(p => p.isActive);

  const handleRefresh = () => {
    queryClient.invalidateQueries();
  };

  if (orgLoading || summaryLoading || domainsLoading) return <SkeletonDashboard />;

  if (!summary) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center space-y-3">
        <ShieldCheck className="h-12 w-12 text-muted-foreground opacity-30" />
        <p className="text-lg font-medium text-muted-foreground">No organization selected</p>
        <p className="text-sm text-muted-foreground">Select an organization from the sidebar to view the compliance dashboard.</p>
      </div>
    );
  }

  const total = summary.totalControls ?? 0;
  const implemented = summary.implementedControls ?? 0;
  const notStarted = summary.notStartedControls ?? 0;
  const atRisk = summary.atRiskControls ?? 0;
  const inProgress = Math.max(0, total - implemented - notStarted - atRisk);
  const roadmapTotal = summary.roadmapTotalActions ?? 0;
  const roadmapComplete = summary.roadmapCompleteActions ?? 0;
  const roadmapInProgress = summary.roadmapInProgressActions ?? 0;
  const roadmapBlocked = summary.roadmapBlockedActions ?? 0;
  const roadmapPct = roadmapTotal > 0 ? Math.round((roadmapComplete / roadmapTotal) * 100) : 0;
  const readiness = summary.overallReadinessPercent ?? 0;
  const status = getReadinessStatus(readiness);

  const monitoringOverdue = summary.monitoringOverdue ?? 0;
  const monitoringDueSoon = summary.monitoringDueSoon ?? 0;
  const monitoringCurrent = (summary as any).monitoringCurrent ?? 0;
  const monitoringTotal = summary.monitoringTotal ?? 0;
  const overduePoams = summary.overduePoams ?? 0;
  const today = new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
  const lastActivity = recentActivity?.[0]?.timestamp;

  // ─── Recommended Next Actions ────────────────────────────────────────────
  type Action = { priority: "high" | "medium" | "low"; text: string; href: string };
  const actions: Action[] = [];
  if (monitoringOverdue > 0)
    actions.push({ priority: "high", text: `${monitoringOverdue} monitoring task${monitoringOverdue !== 1 ? "s" : ""} past due — review and update status`, href: "/monitoring" });
  if (overduePoams > 0)
    actions.push({ priority: "high", text: `${overduePoams} POA&M${overduePoams !== 1 ? "s" : ""} past scheduled completion date`, href: "/poams" });
  if (summary.openPoams > 0 && overduePoams === 0)
    actions.push({ priority: "medium", text: `${summary.openPoams} open POA&M${summary.openPoams !== 1 ? "s" : ""} require remediation planning`, href: "/poams" });
  if (summary.staleEvidenceItems > 0)
    actions.push({ priority: "medium", text: `${summary.staleEvidenceItems} evidence item${summary.staleEvidenceItems !== 1 ? "s" : ""} marked stale — refresh or replace`, href: "/evidence" });
  if (summary.pendingReviewItems > 0)
    actions.push({ priority: "medium", text: `${summary.pendingReviewItems} evidence item${summary.pendingReviewItems !== 1 ? "s" : ""} awaiting review and approval`, href: "/evidence" });
  if (atRisk > 0)
    actions.push({ priority: "high", text: `${atRisk} control${atRisk !== 1 ? "s" : ""} flagged At Risk — address before assessment`, href: "/controls" });
  if (notStarted > 0)
    actions.push({ priority: "low", text: `${notStarted} control${notStarted !== 1 ? "s" : ""} not yet assessed`, href: "/controls" });
  if (monitoringDueSoon > 0)
    actions.push({ priority: "low", text: `${monitoringDueSoon} monitoring task${monitoringDueSoon !== 1 ? "s" : ""} due within 7 days`, href: "/monitoring" });

  const topActions = actions.slice(0, 5);

  const priorityStyle = {
    high:   { dot: "bg-red-500",   label: "High",   text: "text-red-700",   bg: "bg-red-50 border-red-100" },
    medium: { dot: "bg-amber-500", label: "Medium", text: "text-amber-700", bg: "bg-amber-50 border-amber-100" },
    low:    { dot: "bg-blue-500",  label: "Low",    text: "text-blue-700",  bg: "bg-blue-50 border-blue-100" },
  };

  return (
    <div className="space-y-6 max-w-[1600px] mx-auto print:space-y-4">

      {/* ── Header ─────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 pb-2 border-b border-border">
        <div className="space-y-1">
          <div className="flex items-center gap-3 flex-wrap">
            <img
              src="/assets/control-hub-icon.png"
              alt="Control HUB"
              className="h-8 w-8 rounded-lg object-cover shrink-0 hidden sm:block"
            />
            <h1 className="text-2xl font-bold tracking-tight">{activeOrg?.name ?? "—"} Compliance Dashboard</h1>
            {activeOrg?.cmmcTargetLevel && (
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-slate-900 text-white dark:bg-white dark:text-slate-900">
                CMMC {activeOrg.cmmcTargetLevel}
              </span>
            )}
            <span className={cn("inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold border", status.bg, status.color, status.border)}>
              {status.label}
            </span>
          </div>
          {activePkgs.length > 0 && (
            <div className="flex items-center gap-1.5 flex-wrap">
              {activePkgs.map(pkg => {
                const key = pkg.packageKey ?? "";
                let label = pkg.packageName ?? key;
                if (key === "CMMC_L1_SELF") label = "CMMC L1";
                else if (key === "CMMC_L2_SELF") label = "CMMC L2";
                else if (key === "NIST_800_171_R2") label = "NIST 800-171 r2";
                else if (key === "NIST_800_171_R3") label = "NIST 800-171 r3";
                else if (key === "NIST_800_171A_R2") label = "800-171A r2";
                else if (key === "NIST_800_171A_R3") label = "800-171A r3";
                else if (key === "DFARS_252_204_7012") label = "DFARS 7012";
                else if (key === "DFARS_252_204_7019") label = "DFARS 7019";
                else if (key === "DFARS_252_204_7020") label = "DFARS 7020";
                else if (key === "DFARS_252_204_7021") label = "DFARS 7021";
                else if (key === "FAR_52_204_21") label = "FAR 52.204-21";
                const fw = pkg.frameworkShortName;
                const color = fw === "CMMC"
                  ? "bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-950/40 dark:text-purple-300 dark:border-purple-800"
                  : fw === "NIST 800-171" || fw === "NIST 800-171A"
                  ? "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-800"
                  : fw === "DFARS"
                  ? "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800"
                  : "bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700";
                return (
                  <span key={pkg.id} className={cn("inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium border", color)}>
                    {label}
                  </span>
                );
              })}
            </div>
          )}
          <div className="flex items-center gap-4 text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5"><Calendar className="h-3 w-3" />Report Date: {today}</span>
            {lastActivity && (
              <span className="flex items-center gap-1.5"><Clock className="h-3 w-3" />Last Activity: {relativeTime(lastActivity)}</span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0 print:hidden">
          <button
            onClick={handleRefresh}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md border border-border hover:bg-accent transition-colors"
          >
            <RefreshCcw className="h-3.5 w-3.5" />
            Refresh
          </button>
          <Link href="/reports/executive" className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md border border-border hover:bg-accent transition-colors">
            <FileText className="h-3.5 w-3.5" />
            Export Report
          </Link>
          <Link href="/reports/gap" className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors">
            <BarChart3 className="h-3.5 w-3.5" />
            Gap Analysis
          </Link>
        </div>
      </div>

      {/* ── 5 KPI Cards ───────────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-4">

        {/* 1. Overall Readiness */}
        <KpiCard title="Overall Readiness" className="xl:col-span-1">
          <div className="flex flex-col items-center justify-center flex-1 gap-2">
            <ReadinessGauge value={readiness} />
            <p className="text-xs text-center text-muted-foreground leading-tight">
              {implemented} of {total} controls ready
            </p>
          </div>
        </KpiCard>

        {/* 2. Controls Status */}
        <KpiCard title="Controls" href="/controls" className="xl:col-span-1">
          <div className="flex-1 space-y-0.5">
            <StatRow
              icon={<CircleCheck className="h-3.5 w-3.5 text-emerald-500" />}
              label="Implemented"
              value={implemented}
              colorClass="text-emerald-700"
            />
            <StatRow
              icon={<CircleDot className="h-3.5 w-3.5 text-amber-500" />}
              label="In Progress"
              value={inProgress}
              colorClass="text-amber-700"
            />
            <StatRow
              icon={<CircleAlert className="h-3.5 w-3.5 text-slate-400" />}
              label="Not Started"
              value={notStarted}
              colorClass="text-slate-600"
            />
            <StatRow
              icon={<AlertTriangle className="h-3.5 w-3.5 text-red-500" />}
              label="At Risk"
              value={atRisk}
              colorClass="text-red-700"
            />
          </div>
          <div className="mt-3 pt-3 border-t border-border/50">
            <Progress value={readiness} className="h-1.5" indicatorClassName={getProgressColor(readiness)} />
            <p className="text-[10px] text-muted-foreground mt-1 text-right tabular-nums">{readiness}% complete</p>
          </div>
        </KpiCard>

        {/* 3. Evidence Health */}
        <KpiCard title="Evidence Health" href="/evidence" className="xl:col-span-1">
          <div className="flex-1 space-y-0.5">
            <StatRow label="Total" value={summary.totalEvidenceItems ?? 0} />
            <StatRow
              icon={<CircleCheck className="h-3.5 w-3.5 text-emerald-500" />}
              label="Approved"
              value={summary.approvedEvidenceItems ?? 0}
              colorClass="text-emerald-700"
            />
            <StatRow
              icon={<CircleDot className="h-3.5 w-3.5 text-amber-500" />}
              label="Pending Review"
              value={summary.pendingReviewItems ?? 0}
              colorClass="text-amber-700"
            />
            <StatRow
              icon={<AlertTriangle className="h-3.5 w-3.5 text-red-500" />}
              label="Stale"
              value={summary.staleEvidenceItems ?? 0}
              colorClass="text-red-700"
            />
          </div>
          {(summary.totalEvidenceItems ?? 0) > 0 && (
            <div className="mt-3 pt-3 border-t border-border/50">
              <Progress
                value={Math.round(((summary.approvedEvidenceItems ?? 0) / (summary.totalEvidenceItems ?? 1)) * 100)}
                className="h-1.5"
                indicatorClassName="bg-emerald-500"
              />
              <p className="text-[10px] text-muted-foreground mt-1 text-right tabular-nums">
                {Math.round(((summary.approvedEvidenceItems ?? 0) / (summary.totalEvidenceItems ?? 1)) * 100)}% approved
              </p>
            </div>
          )}
        </KpiCard>

        {/* 4. Monitoring Health */}
        <KpiCard title="Monitoring" href="/monitoring" className="xl:col-span-1">
          <div className="flex-1 space-y-0.5">
            <StatRow label="Total Tasks" value={monitoringTotal} />
            <StatRow
              icon={<AlertTriangle className="h-3.5 w-3.5 text-red-500" />}
              label="Overdue"
              value={monitoringOverdue}
              colorClass={monitoringOverdue > 0 ? "text-red-700" : "text-slate-600"}
            />
            <StatRow
              icon={<Clock className="h-3.5 w-3.5 text-amber-500" />}
              label="Due Within 7 Days"
              value={monitoringDueSoon}
              colorClass={monitoringDueSoon > 0 ? "text-amber-700" : "text-slate-600"}
            />
            <StatRow
              icon={<CircleCheck className="h-3.5 w-3.5 text-emerald-500" />}
              label="Current"
              value={monitoringCurrent}
              colorClass="text-emerald-700"
            />
          </div>
          <div className="mt-3 pt-3 border-t border-border/50">
            {monitoringOverdue > 0 ? (
              <div className="flex items-center gap-1.5 text-[10px] font-medium text-red-600">
                <AlertTriangle className="h-3 w-3" />
                {monitoringOverdue} task{monitoringOverdue !== 1 ? "s" : ""} need immediate attention
              </div>
            ) : (
              <div className="flex items-center gap-1.5 text-[10px] font-medium text-emerald-600">
                <CircleCheck className="h-3 w-3" />
                No overdue monitoring items
              </div>
            )}
          </div>
        </KpiCard>

        {/* 5. POA&M Health */}
        <KpiCard title="POA&M Health" href="/poams" className="xl:col-span-1">
          <div className="flex-1 space-y-0.5">
            <StatRow
              icon={<CircleDot className="h-3.5 w-3.5 text-amber-500" />}
              label="Open Items"
              value={summary.openPoams ?? 0}
              colorClass={summary.openPoams > 0 ? "text-amber-700" : "text-slate-600"}
            />
            <StatRow
              icon={<AlertTriangle className="h-3.5 w-3.5 text-red-500" />}
              label="Overdue"
              value={overduePoams}
              colorClass={overduePoams > 0 ? "text-red-700" : "text-slate-600"}
            />
            <StatRow
              icon={<Shield className="h-3.5 w-3.5 text-red-600" />}
              label="Critical Risk"
              value={summary.criticalPoams ?? 0}
              colorClass={summary.criticalPoams > 0 ? "text-red-700" : "text-slate-600"}
            />
          </div>
          {(summary.openPoams ?? 0) === 0 ? (
            <div className="mt-3 pt-3 border-t border-border/50">
              <div className="flex items-center gap-1.5 text-[10px] font-medium text-emerald-600">
                <CircleCheck className="h-3 w-3" />
                No open POA&Ms — excellent
              </div>
            </div>
          ) : (summary.criticalPoams ?? 0) > 0 ? (
            <div className="mt-3 pt-3 border-t border-border/50">
              <div className="flex items-center gap-1.5 text-[10px] font-medium text-red-600">
                <AlertTriangle className="h-3 w-3" />
                {summary.criticalPoams} critical risk item{summary.criticalPoams !== 1 ? "s" : ""}
              </div>
            </div>
          ) : null}
        </KpiCard>

      </div>

      {/* ── Implementation Roadmap tile ──────────────────────────── */}
      <Link href="/roadmap" className="block">
        <Card className="border border-border/60 shadow-sm hover:shadow-md transition-shadow">
          <CardContent className="p-4 flex items-center gap-4 flex-wrap">
            <div className="flex items-center gap-3 shrink-0">
              <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                <Map className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                  Implementation Roadmap
                </p>
                <p className="text-sm font-bold">
                  {roadmapComplete} of {roadmapTotal} priority actions complete
                </p>
              </div>
            </div>
            <div className="flex-1 min-w-40">
              <Progress value={roadmapPct} className="h-1.5" indicatorClassName={getProgressColor(roadmapPct)} />
            </div>
            <div className="flex items-center gap-4 text-xs text-muted-foreground shrink-0">
              {roadmapInProgress > 0 && (
                <span className="flex items-center gap-1 text-amber-700">
                  <CircleDot className="h-3.5 w-3.5" /> {roadmapInProgress} in progress
                </span>
              )}
              {roadmapBlocked > 0 && (
                <span className="flex items-center gap-1 text-red-700">
                  <AlertTriangle className="h-3.5 w-3.5" /> {roadmapBlocked} blocked
                </span>
              )}
              <span className="flex items-center gap-1 font-medium text-primary">
                {roadmapComplete > 0 || roadmapInProgress > 0 ? "Continue Roadmap" : "Start Roadmap"}
                <ArrowRight className="h-3.5 w-3.5" />
              </span>
            </div>
          </CardContent>
        </Card>
      </Link>

      {/* ── Middle: Domain Readiness + Recent Activity ──────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">

        {/* Domain Readiness */}
        <Card className="lg:col-span-3 border border-border/60 shadow-sm">
          <div className="p-4 border-b border-border/60 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
              <span className="font-semibold text-sm">Domain Readiness</span>
            </div>
            <Link href="/reports/domain" className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors">
              View Report <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
          <CardContent className="p-4">
            {!domains || domains.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">No domain data available.</p>
            ) : (
              <div className="space-y-3">
                {domains.map((domain) => {
                  const pct = domain.readinessPercent ?? 0;
                  const ready = (domain as any).readyControls ?? domain.implementedControls ?? 0;
                  const dtotal = domain.totalControls ?? 0;
                  const colors = getDomainStatusColor(pct);
                  return (
                    <div key={domain.domainId} className="group">
                      <div className="flex items-center gap-3 mb-1">
                        <span className={cn(
                          "inline-flex items-center justify-center px-1.5 py-0.5 rounded text-[10px] font-bold border shrink-0 min-w-[28px] tabular-nums",
                          colors.badge
                        )}>
                          {domain.domainCode}
                        </span>
                        <span className="flex-1 text-xs font-medium text-foreground truncate" title={domain.domainName}>
                          {domain.domainName}
                        </span>
                        <div className="flex items-center gap-3 shrink-0">
                          <span className="text-xs text-muted-foreground tabular-nums">{ready}/{dtotal}</span>
                          <span className={cn("text-xs font-bold tabular-nums w-9 text-right", colors.text)}>{pct}%</span>
                        </div>
                      </div>
                      <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                        <div
                          className={cn("h-full rounded-full transition-all duration-500", colors.bar)}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Recent Activity */}
        <Card className="lg:col-span-2 border border-border/60 shadow-sm">
          <div className="p-4 border-b border-border/60 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Activity className="h-4 w-4 text-muted-foreground" />
              <span className="font-semibold text-sm">Recent Activity</span>
            </div>
            <Link href="/audit-logs" className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors">
              View all <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
          <CardContent className="p-0">
            {activityLoading ? (
              <div className="p-4 space-y-3">
                {[...Array(5)].map((_, i) => <div key={i} className="h-10 bg-muted animate-pulse rounded" />)}
              </div>
            ) : !recentActivity || recentActivity.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center px-4">
                <Clock className="h-8 w-8 text-muted-foreground mb-3 opacity-30" />
                <p className="text-sm font-medium text-muted-foreground">No activity yet</p>
                <p className="text-xs text-muted-foreground mt-1">Actions will appear here as your team works in Control HUB.</p>
              </div>
            ) : (
              <div className="divide-y divide-border/50">
                {recentActivity.map((activity) => (
                  <div key={activity.id} className="flex items-start gap-3 px-4 py-3 hover:bg-muted/30 transition-colors">
                    <div className={cn(
                      "flex items-center justify-center w-6 h-6 rounded-full shrink-0 mt-0.5",
                      getActivityIconBg(activity.action ?? "")
                    )}>
                      {getActivityIcon(activity.action ?? "")}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-baseline gap-1 flex-wrap">
                        <span className="text-xs font-semibold text-foreground">{activity.userName ?? "System"}</span>
                        <span className="text-xs text-muted-foreground">{activity.actionLabel}</span>
                        <span className="text-xs text-muted-foreground capitalize">{activity.entityTypeLabel}</span>
                      </div>
                      {activity.entityLabel && (
                        <p className="text-xs text-foreground/70 mt-0.5 truncate" title={activity.entityLabel}>
                          {activity.entityLabel}
                          {activity.action === "status_changed" && activity.newValue
                            ? ` → ${String(activity.newValue).replace(/_/g, " ")}`
                            : ""}
                        </p>
                      )}
                    </div>
                    <span className="text-[10px] text-muted-foreground shrink-0 mt-0.5 tabular-nums">{relativeTime(activity.timestamp)}</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ── Bottom: Recommended Next Actions ───────────────────── */}
      <Card className="border border-border/60 shadow-sm">
        <div className="p-4 border-b border-border/60 flex items-center gap-2">
          <Zap className="h-4 w-4 text-amber-500" />
          <span className="font-semibold text-sm">Recommended Next Actions</span>
          {topActions.length > 0 && (
            <span className="ml-auto inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-100 text-amber-700">
              {topActions.length} item{topActions.length !== 1 ? "s" : ""}
            </span>
          )}
        </div>
        <CardContent className="p-4">
          {topActions.length === 0 ? (
            <div className="flex items-center gap-3 py-4">
              <div className="flex items-center justify-center w-8 h-8 rounded-full bg-emerald-100 text-emerald-600">
                <CircleCheck className="h-4 w-4" />
              </div>
              <div>
                <p className="text-sm font-medium text-emerald-700">No critical gaps detected</p>
                <p className="text-xs text-muted-foreground mt-0.5">Your compliance program is in good shape. Keep up the momentum.</p>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
              {topActions.map((action, i) => {
                const style = priorityStyle[action.priority];
                return (
                  <Link key={i} href={action.href} className={cn(
                    "flex items-start gap-3 p-3 rounded-lg border transition-all hover:shadow-sm hover:-translate-y-px",
                    style.bg
                  )}>
                    <div className="flex items-center gap-2 shrink-0 mt-0.5">
                      <span className={cn("w-1.5 h-1.5 rounded-full shrink-0", style.dot)} />
                      <span className={cn("text-[10px] font-semibold uppercase tracking-wide", style.text)}>{style.label}</span>
                    </div>
                    <p className="text-xs text-foreground leading-relaxed flex-1">{action.text}</p>
                    <ExternalLink className="h-3 w-3 text-muted-foreground shrink-0 mt-0.5" />
                  </Link>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

    </div>
  );
}
