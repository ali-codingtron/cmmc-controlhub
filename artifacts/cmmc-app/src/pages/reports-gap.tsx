import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useOrg } from "@/context/OrgContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, ChevronDown, ChevronRight } from "lucide-react";
import { ReportShell, ReportStatCard } from "@/components/reports/ReportShell";
import { apiHeaders, SEV_COLOR, STATUS_LABEL, STATUS_COLOR } from "@/lib/report-utils";
import { cn } from "@/lib/utils";

interface GapControl {
  controlId: string;
  title: string;
  domain: string;
  status: string;
  missingEvidence: boolean;
  missingPolicy: boolean;
  missingProcedure: boolean;
  missingNarrative: boolean;
  hasDraftOnly: boolean;
  hasStale: boolean;
  severity: "high" | "medium" | "low";
}

interface DomainGroup {
  domain: string;
  totalControls: number;
  gapCount: number;
  highCount: number;
  mediumCount: number;
  lowCount: number;
  controls: GapControl[];
}

interface GapData {
  reportDate: string;
  summary: {
    totalGaps: number;
    highGaps: number;
    mediumGaps: number;
    lowGaps: number;
    missingEvidence: number;
    missingPolicy: number;
    missingProcedure: number;
    missingNarrative: number;
  };
  byDomain: DomainGroup[];
}

export default function ReportsGap() {
  const { activeOrg } = useOrg();
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [severityFilter, setSeverityFilter] = useState<string>("all");

  const { data, isLoading } = useQuery<GapData>({
    queryKey: ["report-gap", activeOrg?.id],
    queryFn: async () => {
      const r = await fetch("/api/reports/gap", { headers: apiHeaders(activeOrg?.id) });
      if (!r.ok) throw new Error("Failed");
      return r.json();
    },
    enabled: !!activeOrg?.id,
  });

  if (isLoading) return <div className="flex justify-center py-24"><Loader2 className="h-7 w-7 animate-spin text-muted-foreground" /></div>;
  if (!data) return null;

  const allGapRows = data.byDomain.flatMap(d => d.controls).filter(c =>
    severityFilter === "all" || c.severity === severityFilter
  );

  const csvRows = allGapRows.map(c => ({
    "Control ID": c.controlId,
    "Title": c.title,
    "Domain": c.domain,
    "Status": STATUS_LABEL[c.status] ?? c.status,
    "Severity": c.severity,
    "Missing Evidence": c.missingEvidence ? "Yes" : "No",
    "Missing Policy": c.missingPolicy ? "Yes" : "No",
    "Missing Procedure": c.missingProcedure ? "Yes" : "No",
    "Missing Narrative": c.missingNarrative ? "Yes" : "No",
    "Draft Only": c.hasDraftOnly ? "Yes" : "No",
    "Stale Evidence": c.hasStale ? "Yes" : "No",
  }));

  const toggle = (d: string) => setExpanded(prev => {
    const next = new Set(prev);
    if (next.has(d)) next.delete(d); else next.add(d);
    return next;
  });

  const filteredDomains = data.byDomain
    .map(d => ({ ...d, controls: d.controls.filter(c => severityFilter === "all" || c.severity === severityFilter) }))
    .filter(d => d.controls.length > 0);

  return (
    <ReportShell
      title="Gap Analysis Report"
      subtitle="Controls missing evidence, policies, procedures, or implementation narratives"
      reportDate={data.reportDate}
      csvRows={csvRows}
      csvFilename="gap-analysis.csv"
    >
      {/* Summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <ReportStatCard label="Total Gaps" value={data.summary.totalGaps} color="text-foreground" bg="bg-muted/30" />
        <ReportStatCard label="High Severity" value={data.summary.highGaps} color="text-red-700" bg="bg-red-50" sub="missing evidence or both policy+procedure" />
        <ReportStatCard label="Medium Severity" value={data.summary.mediumGaps} color="text-yellow-700" bg="bg-yellow-50" sub="partial gaps" />
        <ReportStatCard label="Low Severity" value={data.summary.lowGaps} color="text-blue-700" bg="bg-blue-50" sub="draft or stale evidence" />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <Card className="p-3 text-center"><div className="text-xl font-bold text-red-700">{data.summary.missingEvidence}</div><div className="text-xs text-muted-foreground">No Evidence</div></Card>
        <Card className="p-3 text-center"><div className="text-xl font-bold text-orange-700">{data.summary.missingPolicy}</div><div className="text-xs text-muted-foreground">No Policy</div></Card>
        <Card className="p-3 text-center"><div className="text-xl font-bold text-orange-700">{data.summary.missingProcedure}</div><div className="text-xs text-muted-foreground">No Procedure</div></Card>
        <Card className="p-3 text-center"><div className="text-xl font-bold text-yellow-700">{data.summary.missingNarrative}</div><div className="text-xs text-muted-foreground">No Narrative</div></Card>
      </div>

      {/* Severity filter */}
      <div className="flex gap-2 mb-4 no-print">
        {["all", "high", "medium", "low"].map(s => (
          <button
            key={s}
            onClick={() => setSeverityFilter(s)}
            className={cn("px-3 py-1.5 rounded-md text-sm font-medium transition-colors border", severityFilter === s ? "bg-primary text-primary-foreground border-primary" : "bg-background hover:bg-muted border-input")}
          >
            {s === "all" ? "All" : s.charAt(0).toUpperCase() + s.slice(1)}
          </button>
        ))}
        <span className="ml-auto text-sm text-muted-foreground self-center">{allGapRows.length} controls with gaps</span>
      </div>

      {/* Domain groups */}
      <div className="space-y-3">
        {filteredDomains.map(domain => (
          <Card key={domain.domain}>
            <button
              className="w-full text-left px-4 py-3 flex items-center justify-between hover:bg-muted/30 transition-colors no-print"
              onClick={() => toggle(domain.domain)}
            >
              <div className="flex items-center gap-3">
                {expanded.has(domain.domain) ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                <span className="font-semibold">{domain.domain}</span>
                <span className="text-sm text-muted-foreground">{domain.controls.length} gaps of {domain.totalControls} controls</span>
              </div>
              <div className="flex gap-2">
                {domain.highCount > 0 && <Badge className="bg-red-100 text-red-700 text-[11px]">High: {domain.highCount}</Badge>}
                {domain.mediumCount > 0 && <Badge className="bg-yellow-100 text-yellow-700 text-[11px]">Medium: {domain.mediumCount}</Badge>}
                {domain.lowCount > 0 && <Badge className="bg-blue-100 text-blue-700 text-[11px]">Low: {domain.lowCount}</Badge>}
              </div>
            </button>

            {/* Print: always show; Screen: only when expanded */}
            <div className={cn("hidden print:block", expanded.has(domain.domain) && "!block")}>
              <CardContent className="pt-0 pb-3">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left">
                      <th className="py-2 pr-3 font-medium text-muted-foreground w-28">Control</th>
                      <th className="py-2 pr-3 font-medium text-muted-foreground">Title</th>
                      <th className="py-2 pr-3 font-medium text-muted-foreground w-20">Severity</th>
                      <th className="py-2 pr-3 font-medium text-muted-foreground w-24">Status</th>
                      <th className="py-2 font-medium text-muted-foreground">Gaps</th>
                    </tr>
                  </thead>
                  <tbody>
                    {domain.controls.map(c => (
                      <tr key={c.controlId} className="border-b last:border-0">
                        <td className="py-2 pr-3"><code className="text-xs bg-muted px-1.5 py-0.5 rounded">{c.controlId}</code></td>
                        <td className="py-2 pr-3 text-sm">{c.title}</td>
                        <td className="py-2 pr-3">
                          <span className={cn("text-[11px] font-medium px-2 py-0.5 rounded-full", SEV_COLOR[c.severity])}>{c.severity}</span>
                        </td>
                        <td className="py-2 pr-3">
                          <span className={cn("text-[11px] font-medium px-2 py-0.5 rounded-full", STATUS_COLOR[c.status] ?? "bg-gray-100 text-gray-700")}>{STATUS_LABEL[c.status] ?? c.status}</span>
                        </td>
                        <td className="py-2">
                          <div className="flex flex-wrap gap-1">
                            {c.missingEvidence && <span className="text-[10px] bg-red-100 text-red-700 px-1.5 py-0.5 rounded">No Evidence</span>}
                            {c.missingPolicy && <span className="text-[10px] bg-orange-100 text-orange-700 px-1.5 py-0.5 rounded">No Policy</span>}
                            {c.missingProcedure && <span className="text-[10px] bg-orange-100 text-orange-700 px-1.5 py-0.5 rounded">No Procedure</span>}
                            {c.missingNarrative && <span className="text-[10px] bg-yellow-100 text-yellow-700 px-1.5 py-0.5 rounded">No Narrative</span>}
                            {c.hasDraftOnly && <span className="text-[10px] bg-slate-100 text-slate-700 px-1.5 py-0.5 rounded">Draft Only</span>}
                            {c.hasStale && <span className="text-[10px] bg-slate-100 text-slate-700 px-1.5 py-0.5 rounded">Stale</span>}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </CardContent>
            </div>
          </Card>
        ))}
      </div>
    </ReportShell>
  );
}
