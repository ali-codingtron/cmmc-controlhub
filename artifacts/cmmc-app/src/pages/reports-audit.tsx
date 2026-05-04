import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useOrg } from "@/context/OrgContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, ShieldCheck, ShieldAlert, ShieldX, CheckCircle2, XCircle } from "lucide-react";
import { ReportShell, ReportStatCard, ProgressBar } from "@/components/reports/ReportShell";
import { apiHeaders, fmtPct, STATUS_LABEL, STATUS_COLOR } from "@/lib/report-utils";
import { cn } from "@/lib/utils";

interface AuditControl {
  controlId: string;
  title: string;
  domain: string;
  level: string;
  status: string;
  hasEvidence: boolean;
  hasApproved: boolean;
  hasNarrative: boolean;
  isReady: boolean;
  issues: string[];
}

interface AuditData {
  reportDate: string;
  overallReadiness: number;
  summary: {
    totalControls: number;
    fullyReady: number;
    missingEvidence: number;
    missingNarrative: number;
    notApprovedEvidence: number;
    evidenceNotApproved: number;
    evidenceMissingMetadata: number;
    openPoams: number;
    overdueMonitoring: number;
  };
  controls: AuditControl[];
  readyControls: AuditControl[];
}

export default function ReportsAudit() {
  const { activeOrg } = useOrg();
  const [tab, setTab] = useState<"issues" | "ready">("issues");

  const { data, isLoading } = useQuery<AuditData>({
    queryKey: ["report-audit", activeOrg?.id],
    queryFn: async () => {
      const r = await fetch("/api/reports/audit", { headers: apiHeaders(activeOrg?.id) });
      if (!r.ok) throw new Error("Failed");
      return r.json();
    },
    enabled: !!activeOrg?.id,
  });

  if (isLoading) return <div className="flex justify-center py-24"><Loader2 className="h-7 w-7 animate-spin text-muted-foreground" /></div>;
  if (!data) return null;

  const s = data.summary;
  const isAssessmentReady = data.overallReadiness >= 80 && s.overdueMonitoring === 0 && s.openPoams < 5;

  const csvRows = [...data.controls, ...data.readyControls].map(c => ({
    "Control ID": c.controlId, "Title": c.title, "Domain": c.domain, "Level": c.level,
    "Status": STATUS_LABEL[c.status] ?? c.status, "Has Evidence": c.hasEvidence ? "Yes" : "No",
    "Has Approved Evidence": c.hasApproved ? "Yes" : "No", "Has Narrative": c.hasNarrative ? "Yes" : "No",
    "Audit Ready": c.isReady ? "Yes" : "No", "Issues": c.issues.join("; "),
  }));

  return (
    <ReportShell
      title="Audit Readiness Report"
      subtitle="C3PAO assessment preparation — are you ready for an audit?"
      reportDate={data.reportDate}
      csvRows={csvRows}
      csvFilename="audit-readiness.csv"
    >
      {/* Overall readiness banner */}
      <div className={cn("flex items-center gap-4 p-4 rounded-xl border mb-6", isAssessmentReady ? "bg-green-50 border-green-200" : data.overallReadiness >= 50 ? "bg-yellow-50 border-yellow-200" : "bg-red-50 border-red-200")}>
        {isAssessmentReady
          ? <ShieldCheck className="h-8 w-8 text-green-600 flex-shrink-0" />
          : data.overallReadiness >= 50
            ? <ShieldAlert className="h-8 w-8 text-yellow-600 flex-shrink-0" />
            : <ShieldX className="h-8 w-8 text-red-600 flex-shrink-0" />}
        <div className="flex-1">
          <div className={cn("text-lg font-bold", isAssessmentReady ? "text-green-800" : data.overallReadiness >= 50 ? "text-yellow-800" : "text-red-800")}>
            {isAssessmentReady ? "Assessment Ready" : data.overallReadiness >= 50 ? "Progressing — Not Yet Ready" : "Not Ready for Assessment"}
          </div>
          <div className="text-sm text-muted-foreground">
            {data.overallReadiness}% of controls fully meet audit criteria
          </div>
          <div className="mt-2 max-w-lg">
            <ProgressBar pct={data.overallReadiness} color={isAssessmentReady ? "bg-green-500" : data.overallReadiness >= 50 ? "bg-yellow-400" : "bg-red-400"} />
          </div>
        </div>
        <div className="text-right">
          <div className={cn("text-4xl font-bold", isAssessmentReady ? "text-green-700" : data.overallReadiness >= 50 ? "text-yellow-700" : "text-red-700")}>{fmtPct(data.overallReadiness)}</div>
        </div>
      </div>

      {/* Checklist */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <ReportStatCard label="Controls Fully Ready" value={s.fullyReady} color="text-green-700" bg="bg-green-50" sub={`of ${s.totalControls} total`} />
        <ReportStatCard label="Missing Evidence" value={s.missingEvidence} color="text-red-700" bg="bg-red-50" />
        <ReportStatCard label="Missing Narrative" value={s.missingNarrative} color="text-orange-700" bg="bg-orange-50" />
        <ReportStatCard label="No Approved Evidence" value={s.notApprovedEvidence} color="text-yellow-700" bg="bg-yellow-50" />
      </div>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-6">
        <Card className="p-4 flex items-center gap-3">
          {s.evidenceNotApproved === 0 ? <CheckCircle2 className="h-5 w-5 text-green-600" /> : <XCircle className="h-5 w-5 text-red-500" />}
          <div><div className="font-semibold text-sm">Evidence Approval</div><div className="text-xs text-muted-foreground">{s.evidenceNotApproved} items not yet approved</div></div>
        </Card>
        <Card className="p-4 flex items-center gap-3">
          {s.openPoams === 0 ? <CheckCircle2 className="h-5 w-5 text-green-600" /> : s.openPoams < 5 ? <ShieldAlert className="h-5 w-5 text-yellow-500" /> : <XCircle className="h-5 w-5 text-red-500" />}
          <div><div className="font-semibold text-sm">Open POA&amp;Ms</div><div className="text-xs text-muted-foreground">{s.openPoams} open items</div></div>
        </Card>
        <Card className="p-4 flex items-center gap-3">
          {s.overdueMonitoring === 0 ? <CheckCircle2 className="h-5 w-5 text-green-600" /> : <XCircle className="h-5 w-5 text-red-500" />}
          <div><div className="font-semibold text-sm">Monitoring Gaps</div><div className="text-xs text-muted-foreground">{s.overdueMonitoring} overdue tasks</div></div>
        </Card>
      </div>

      {/* Tab toggle */}
      <div className="flex gap-2 mb-4 no-print">
        <button onClick={() => setTab("issues")} className={cn("px-4 py-2 rounded-md text-sm font-medium transition-colors", tab === "issues" ? "bg-primary text-primary-foreground" : "bg-muted hover:bg-muted/80")}>
          Issues ({data.controls.length})
        </button>
        <button onClick={() => setTab("ready")} className={cn("px-4 py-2 rounded-md text-sm font-medium transition-colors", tab === "ready" ? "bg-primary text-primary-foreground" : "bg-muted hover:bg-muted/80")}>
          Ready ({data.readyControls.length})
        </button>
      </div>

      {/* Controls with issues */}
      <div className={cn("", tab === "issues" ? "block" : "hidden print:block")}>
        <h3 className="text-sm font-semibold mb-3 text-red-700 hidden print:block">Controls with Issues ({data.controls.length})</h3>
        <Card>
          <CardContent className="pt-3 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left">
                  <th className="py-2 pr-3 font-medium text-muted-foreground w-28">Control</th>
                  <th className="py-2 pr-3 font-medium text-muted-foreground">Title</th>
                  <th className="py-2 pr-3 font-medium text-muted-foreground w-20">Level</th>
                  <th className="py-2 pr-3 font-medium text-muted-foreground w-32">Status</th>
                  <th className="py-2 pr-3 font-medium text-muted-foreground w-20 text-center">Ev.</th>
                  <th className="py-2 pr-3 font-medium text-muted-foreground w-24 text-center">Approved</th>
                  <th className="py-2 pr-3 font-medium text-muted-foreground w-24 text-center">Narrative</th>
                  <th className="py-2 font-medium text-muted-foreground">Issues</th>
                </tr>
              </thead>
              <tbody>
                {data.controls.map(c => (
                  <tr key={c.controlId} className="border-b last:border-0 hover:bg-muted/30">
                    <td className="py-2 pr-3"><code className="text-xs bg-muted px-1.5 py-0.5 rounded">{c.controlId}</code></td>
                    <td className="py-2 pr-3 text-sm">{c.title}</td>
                    <td className="py-2 pr-3"><span className="text-[11px] px-1.5 py-0.5 rounded bg-primary/10 text-primary font-semibold">{c.level}</span></td>
                    <td className="py-2 pr-3"><span className={cn("text-[11px] px-2 py-0.5 rounded-full font-medium", STATUS_COLOR[c.status] ?? "bg-gray-100")}>{STATUS_LABEL[c.status] ?? c.status}</span></td>
                    <td className="py-2 pr-3 text-center">{c.hasEvidence ? <CheckCircle2 className="h-4 w-4 text-green-600 mx-auto" /> : <XCircle className="h-4 w-4 text-red-400 mx-auto" />}</td>
                    <td className="py-2 pr-3 text-center">{c.hasApproved ? <CheckCircle2 className="h-4 w-4 text-green-600 mx-auto" /> : <XCircle className="h-4 w-4 text-red-400 mx-auto" />}</td>
                    <td className="py-2 pr-3 text-center">{c.hasNarrative ? <CheckCircle2 className="h-4 w-4 text-green-600 mx-auto" /> : <XCircle className="h-4 w-4 text-red-400 mx-auto" />}</td>
                    <td className="py-2">
                      <div className="flex flex-wrap gap-1">
                        {c.issues.map((issue, i) => <span key={i} className="text-[10px] bg-red-100 text-red-700 px-1.5 py-0.5 rounded">{issue}</span>)}
                      </div>
                    </td>
                  </tr>
                ))}
                {data.controls.length === 0 && <tr><td colSpan={8} className="text-center py-10 text-green-700 font-medium">All controls are audit ready!</td></tr>}
              </tbody>
            </table>
          </CardContent>
        </Card>
      </div>

      {/* Ready controls */}
      <div className={cn("", tab === "ready" ? "block" : "hidden")}>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-green-700">Audit-Ready Controls ({data.readyControls.length})</CardTitle></CardHeader>
          <CardContent className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left">
                  <th className="py-2 pr-3 font-medium text-muted-foreground w-28">Control</th>
                  <th className="py-2 pr-3 font-medium text-muted-foreground">Title</th>
                  <th className="py-2 pr-3 font-medium text-muted-foreground w-40">Domain</th>
                  <th className="py-2 font-medium text-muted-foreground w-32">Status</th>
                </tr>
              </thead>
              <tbody>
                {data.readyControls.map(c => (
                  <tr key={c.controlId} className="border-b last:border-0 hover:bg-muted/30">
                    <td className="py-2 pr-3"><code className="text-xs bg-muted px-1.5 py-0.5 rounded">{c.controlId}</code></td>
                    <td className="py-2 pr-3 text-sm">{c.title}</td>
                    <td className="py-2 pr-3 text-xs text-muted-foreground">{c.domain}</td>
                    <td className="py-2"><span className={cn("text-[11px] px-2 py-0.5 rounded-full font-medium", STATUS_COLOR[c.status] ?? "")}>{STATUS_LABEL[c.status] ?? c.status}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      </div>
    </ReportShell>
  );
}
