import { useQuery } from "@tanstack/react-query";
import { useOrg } from "@/context/OrgContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, ShieldCheck, FileText, AlertTriangle, Activity, TrendingUp } from "lucide-react";
import { ReportShell, ReportStatCard, ProgressBar } from "@/components/reports/ReportShell";
import { apiHeaders, fmtPct, STATUS_LABEL } from "@/lib/report-utils";

interface ExecutiveData {
  reportDate: string;
  org: { name: string; cmmcTargetLevel: string; legalName?: string; primaryContact?: string };
  controls: { total: number; implemented: number; inProgress: number; notStarted: number; atRisk: number; notApplicable: number };
  readinessPct: number;
  evidence: { total: number; approved: number; draft: number; stale: number };
  poams: { total: number; open: number; overdue: number; closingSoon: number };
  monitoring: { total: number; complete: number; overdue: number; dueSoon: number };
  topRiskDomains: { domain: string; total: number; notStarted: number }[];
}

export default function ReportsExecutive() {
  const { activeOrg } = useOrg();

  const { data, isLoading } = useQuery<ExecutiveData>({
    queryKey: ["report-executive", activeOrg?.id],
    queryFn: async () => {
      const r = await fetch("/api/reports/executive", { headers: apiHeaders(activeOrg?.id) });
      if (!r.ok) throw new Error("Failed");
      return r.json();
    },
    enabled: !!activeOrg?.id,
  });

  if (isLoading) return <div className="flex justify-center py-24"><Loader2 className="h-7 w-7 animate-spin text-muted-foreground" /></div>;
  if (!data) return null;

  const evidencePct = data.evidence.total > 0 ? Math.round((data.evidence.approved / data.evidence.total) * 100) : 0;

  return (
    <ReportShell
      title="Executive Readiness Report"
      subtitle="High-level CMMC compliance overview for leadership"
      reportDate={data.reportDate}
      orgName={data.org.name}
    >
      {/* Org header */}
      <Card className="mb-6">
        <CardContent className="pt-4 pb-4">
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div>
              <h2 className="text-xl font-semibold">{data.org.name}</h2>
              {data.org.legalName && <p className="text-sm text-muted-foreground">{data.org.legalName}</p>}
              {data.org.primaryContact && <p className="text-sm text-muted-foreground">Contact: {data.org.primaryContact}</p>}
            </div>
            <div className="flex items-center gap-3">
              <Badge className="text-sm px-3 py-1 bg-primary/10 text-primary border-primary/20">
                CMMC Target: {data.org.cmmcTargetLevel}
              </Badge>
              <div className="text-right">
                <div className="text-4xl font-bold text-primary">{fmtPct(data.readinessPct)}</div>
                <div className="text-xs text-muted-foreground">Overall Readiness</div>
              </div>
            </div>
          </div>
          <div className="mt-4">
            <ProgressBar
              pct={data.readinessPct}
              label={`${data.controls.implemented} of ${data.controls.total} controls implemented`}
              color={data.readinessPct >= 75 ? "bg-green-500" : data.readinessPct >= 50 ? "bg-yellow-500" : "bg-red-500"}
            />
          </div>
        </CardContent>
      </Card>

      {/* Control summary */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
        <ReportStatCard label="Total Controls" value={data.controls.total} bg="bg-muted/30" />
        <ReportStatCard label="Implemented" value={data.controls.implemented} color="text-green-700" bg="bg-green-50" />
        <ReportStatCard label="In Progress" value={data.controls.inProgress} color="text-blue-700" bg="bg-blue-50" />
        <ReportStatCard label="Not Started" value={data.controls.notStarted} color="text-gray-700" bg="bg-gray-50" />
        <ReportStatCard label="At Risk" value={data.controls.atRisk} color="text-red-700" bg="bg-red-50" />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
        {/* Evidence */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2"><FileText className="h-4 w-4 text-primary" />Evidence</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="text-3xl font-bold">{data.evidence.total}</div>
            <div className="text-xs text-muted-foreground">Total items</div>
            <ProgressBar pct={evidencePct} label={`${data.evidence.approved} approved (${evidencePct}%)`} color="bg-green-500" />
            <div className="grid grid-cols-2 gap-2 pt-2 text-xs">
              <div><span className="font-medium">{data.evidence.draft}</span> <span className="text-muted-foreground">draft</span></div>
              <div><span className="font-medium">{data.evidence.stale}</span> <span className="text-muted-foreground">stale</span></div>
            </div>
          </CardContent>
        </Card>

        {/* POA&Ms */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2"><AlertTriangle className="h-4 w-4 text-orange-500" />POA&amp;Ms</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="text-3xl font-bold">{data.poams.open}</div>
            <div className="text-xs text-muted-foreground">Open items</div>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div className={`rounded p-2 text-center ${data.poams.overdue > 0 ? "bg-red-50" : "bg-muted/30"}`}>
                <div className={`font-bold ${data.poams.overdue > 0 ? "text-red-700" : ""}`}>{data.poams.overdue}</div>
                <div className="text-xs text-muted-foreground">Overdue</div>
              </div>
              <div className={`rounded p-2 text-center ${data.poams.closingSoon > 0 ? "bg-yellow-50" : "bg-muted/30"}`}>
                <div className={`font-bold ${data.poams.closingSoon > 0 ? "text-yellow-700" : ""}`}>{data.poams.closingSoon}</div>
                <div className="text-xs text-muted-foreground">Due Soon</div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Monitoring */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2"><Activity className="h-4 w-4 text-blue-500" />Monitoring</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="text-3xl font-bold">{data.monitoring.complete}</div>
            <div className="text-xs text-muted-foreground">Tasks complete of {data.monitoring.total}</div>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div className={`rounded p-2 text-center ${data.monitoring.overdue > 0 ? "bg-red-50" : "bg-muted/30"}`}>
                <div className={`font-bold ${data.monitoring.overdue > 0 ? "text-red-700" : ""}`}>{data.monitoring.overdue}</div>
                <div className="text-xs text-muted-foreground">Overdue</div>
              </div>
              <div className={`rounded p-2 text-center ${data.monitoring.dueSoon > 0 ? "bg-yellow-50" : "bg-muted/30"}`}>
                <div className={`font-bold ${data.monitoring.dueSoon > 0 ? "text-yellow-700" : ""}`}>{data.monitoring.dueSoon}</div>
                <div className="text-xs text-muted-foreground">Due Soon</div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Top risk domains */}
      {data.topRiskDomains.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2"><TrendingUp className="h-4 w-4 text-red-500" />Top 5 Risk Areas (Controls Not Started)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {data.topRiskDomains.map((d) => (
                <div key={d.domain}>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="font-medium">{d.domain}</span>
                    <span className="text-muted-foreground">{d.notStarted} / {d.total} not started</span>
                  </div>
                  <ProgressBar
                    pct={d.total > 0 ? ((d.notStarted / d.total) * 100) : 0}
                    color="bg-red-400"
                  />
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* What to do next */}
      <Card className="mt-6 border-primary/20 bg-primary/5">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-primary" />What To Do Next</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="space-y-2 text-sm">
            {data.controls.notStarted > 0 && <li className="flex gap-2"><span className="text-red-500 font-bold">1.</span>Address {data.controls.notStarted} controls not yet started — begin with high-risk domains above.</li>}
            {data.evidence.draft > 0 && <li className="flex gap-2"><span className="text-orange-500 font-bold">2.</span>Move {data.evidence.draft} draft evidence items through review and approval.</li>}
            {data.poams.overdue > 0 && <li className="flex gap-2"><span className="text-red-500 font-bold">3.</span>Resolve {data.poams.overdue} overdue POA&amp;M items immediately.</li>}
            {data.monitoring.overdue > 0 && <li className="flex gap-2"><span className="text-orange-500 font-bold">4.</span>Complete {data.monitoring.overdue} overdue monitoring tasks to maintain operational compliance.</li>}
            {data.controls.atRisk > 0 && <li className="flex gap-2"><span className="text-yellow-600 font-bold">5.</span>Review and remediate {data.controls.atRisk} at-risk controls before your assessment.</li>}
            {data.controls.notStarted === 0 && data.poams.overdue === 0 && data.monitoring.overdue === 0 && (
              <li className="text-green-700 font-medium">Your compliance posture is strong. Continue maintaining evidence and monitoring schedules.</li>
            )}
          </ul>
        </CardContent>
      </Card>
    </ReportShell>
  );
}
