import { useQuery } from "@tanstack/react-query";
import { useOrg } from "@/context/OrgContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2 } from "lucide-react";
import { ReportShell, ReportStatCard, ProgressBar } from "@/components/reports/ReportShell";
import { apiHeaders, fmtPct } from "@/lib/report-utils";

interface DomainRow {
  domain: string;
  sortOrder: number;
  total: number;
  implemented: number;
  inProgress: number;
  notStarted: number;
  atRisk: number;
  l1: number;
  l2: number;
  pct: number;
}

export default function ReportsDomain() {
  const { activeOrg } = useOrg();

  const { data: raw, isLoading } = useQuery<{ reportDate: string; domains: DomainRow[] }>({
    queryKey: ["report-domain", activeOrg?.id],
    queryFn: async () => {
      const r = await fetch("/api/reports/domain", { headers: apiHeaders(activeOrg?.id) });
      if (!r.ok) throw new Error("Failed");
      return r.json();
    },
    enabled: !!activeOrg?.id,
  });

  if (isLoading) return <div className="flex justify-center py-24"><Loader2 className="h-7 w-7 animate-spin text-muted-foreground" /></div>;
  if (!raw) return null;

  const totalControls = raw.domains.reduce((s, d) => s + d.total, 0);
  const totalImpl = raw.domains.reduce((s, d) => s + d.implemented, 0);
  const overallPct = totalControls > 0 ? Math.round((totalImpl / totalControls) * 100) : 0;
  const strongDomains = raw.domains.filter(d => d.pct >= 75).length;
  const weakDomains = raw.domains.filter(d => d.pct < 25).length;

  const csvRows = raw.domains.map(d => ({
    "Domain": d.domain, "Total Controls": d.total, "Implemented": d.implemented,
    "In Progress": d.inProgress, "Not Started": d.notStarted, "At Risk": d.atRisk,
    "L1 Controls": d.l1, "L2 Controls": d.l2, "Readiness %": d.pct,
  }));

  function barColor(pct: number) {
    if (pct >= 75) return "bg-green-500";
    if (pct >= 50) return "bg-yellow-400";
    if (pct >= 25) return "bg-orange-400";
    return "bg-red-400";
  }

  return (
    <ReportShell
      title="Domain Readiness Report"
      subtitle="Compliance status broken down by CMMC practice domain"
      reportDate={raw.reportDate}
      csvRows={csvRows}
      csvFilename="domain-readiness.csv"
    >
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <ReportStatCard label="Overall Readiness" value={fmtPct(overallPct)} color="text-primary" bg="bg-primary/5" />
        <ReportStatCard label="Total Controls" value={totalControls} />
        <ReportStatCard label="Domains ≥ 75%" value={strongDomains} color="text-green-700" bg="bg-green-50" sub="Strong domains" />
        <ReportStatCard label="Domains < 25%" value={weakDomains} color="text-red-700" bg="bg-red-50" sub="Needs immediate attention" />
      </div>

      {/* Domain cards with visual bars */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        {raw.domains.map(d => (
          <Card key={d.domain}>
            <CardHeader className="pb-2">
              <div className="flex justify-between items-center">
                <CardTitle className="text-sm font-semibold">{d.domain}</CardTitle>
                <span className={`text-lg font-bold ${d.pct >= 75 ? "text-green-700" : d.pct >= 50 ? "text-yellow-700" : d.pct >= 25 ? "text-orange-700" : "text-red-700"}`}>
                  {fmtPct(d.pct)}
                </span>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <ProgressBar pct={d.pct} color={barColor(d.pct)} />
              <div className="grid grid-cols-4 gap-2 text-center">
                <div>
                  <div className="text-lg font-bold text-green-700">{d.implemented}</div>
                  <div className="text-[10px] text-muted-foreground">Impl.</div>
                </div>
                <div>
                  <div className="text-lg font-bold text-blue-700">{d.inProgress}</div>
                  <div className="text-[10px] text-muted-foreground">In Prog.</div>
                </div>
                <div>
                  <div className="text-lg font-bold text-gray-500">{d.notStarted}</div>
                  <div className="text-[10px] text-muted-foreground">Not Started</div>
                </div>
                <div>
                  <div className="text-lg font-bold text-red-600">{d.atRisk}</div>
                  <div className="text-[10px] text-muted-foreground">At Risk</div>
                </div>
              </div>
              <div className="flex gap-2 text-[11px] text-muted-foreground justify-end">
                <span className="bg-muted px-1.5 py-0.5 rounded">L1: {d.l1}</span>
                <span className="bg-muted px-1.5 py-0.5 rounded">L2: {d.l2}</span>
                <span className="bg-muted px-1.5 py-0.5 rounded">Total: {d.total}</span>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Summary table for print */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Domain Summary Table</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left">
                <th className="py-2 pr-3 font-medium text-muted-foreground">Domain</th>
                <th className="py-2 pr-3 font-medium text-muted-foreground text-center w-20">Total</th>
                <th className="py-2 pr-3 font-medium text-muted-foreground text-center w-24">Implemented</th>
                <th className="py-2 pr-3 font-medium text-muted-foreground text-center w-24">In Progress</th>
                <th className="py-2 pr-3 font-medium text-muted-foreground text-center w-24">Not Started</th>
                <th className="py-2 pr-3 font-medium text-muted-foreground text-center w-20">At Risk</th>
                <th className="py-2 font-medium text-muted-foreground text-center w-24">Readiness</th>
              </tr>
            </thead>
            <tbody>
              {raw.domains.map(d => (
                <tr key={d.domain} className="border-b last:border-0 hover:bg-muted/30">
                  <td className="py-2 pr-3 font-medium">{d.domain}</td>
                  <td className="py-2 pr-3 text-center">{d.total}</td>
                  <td className="py-2 pr-3 text-center text-green-700 font-semibold">{d.implemented}</td>
                  <td className="py-2 pr-3 text-center text-blue-700">{d.inProgress}</td>
                  <td className="py-2 pr-3 text-center text-gray-500">{d.notStarted}</td>
                  <td className="py-2 pr-3 text-center text-red-600">{d.atRisk}</td>
                  <td className="py-2 text-center">
                    <span className={`font-bold ${d.pct >= 75 ? "text-green-700" : d.pct >= 50 ? "text-yellow-700" : d.pct >= 25 ? "text-orange-700" : "text-red-700"}`}>
                      {fmtPct(d.pct)}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </ReportShell>
  );
}
