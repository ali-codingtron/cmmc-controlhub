import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useOrg } from "@/context/OrgContext";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Loader2, CheckCircle2, XCircle } from "lucide-react";
import { ReportShell, ReportStatCard } from "@/components/reports/ReportShell";
import { apiHeaders, fmtDate, STATUS_LABEL, STATUS_COLOR } from "@/lib/report-utils";
import { cn } from "@/lib/utils";

interface ControlRow {
  controlId: string;
  title: string;
  domainName: string | null;
  level: string;
  nistRef: string | null;
  status: string;
  evidenceCount: number;
  hasNarrative: boolean;
  lastAssessedAt: string | null;
}

export default function ReportsControls() {
  const { activeOrg } = useOrg();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  const { data: raw, isLoading } = useQuery<{ reportDate: string; controls: ControlRow[] }>({
    queryKey: ["report-controls", activeOrg?.id],
    queryFn: async () => {
      const r = await fetch("/api/reports/controls", { headers: apiHeaders(activeOrg?.id) });
      if (!r.ok) throw new Error("Failed");
      return r.json();
    },
    enabled: !!activeOrg?.id,
  });

  const controls = useMemo(() => {
    if (!raw) return [];
    return raw.controls.filter(c => {
      if (statusFilter !== "all" && c.status !== statusFilter) return false;
      if (search) {
        const q = search.toLowerCase();
        return c.controlId.toLowerCase().includes(q) || c.title.toLowerCase().includes(q) || (c.domainName ?? "").toLowerCase().includes(q);
      }
      return true;
    });
  }, [raw, search, statusFilter]);

  if (isLoading) return <div className="flex justify-center py-24"><Loader2 className="h-7 w-7 animate-spin text-muted-foreground" /></div>;
  if (!raw) return null;

  const all = raw.controls;
  const csvRows = controls.map(c => ({
    "Control ID": c.controlId, "Title": c.title, "Domain": c.domainName ?? "", "Level": c.level,
    "NIST Ref": c.nistRef ?? "", "Status": STATUS_LABEL[c.status] ?? c.status,
    "Evidence Count": c.evidenceCount, "Has Narrative": c.hasNarrative ? "Yes" : "No",
    "Last Assessed": fmtDate(c.lastAssessedAt),
  }));

  return (
    <ReportShell
      title="Control Status Report"
      subtitle="Detailed view of every CMMC control's implementation status"
      reportDate={raw.reportDate}
      csvRows={csvRows}
      csvFilename="control-status.csv"
    >
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
        <ReportStatCard label="Total Controls" value={all.length} />
        <ReportStatCard label="Implemented" value={all.filter(c => c.status === "implemented" || c.status === "assessor_ready").length} color="text-green-700" bg="bg-green-50" />
        <ReportStatCard label="In Progress" value={all.filter(c => c.status === "in_progress" || c.status === "needs_review").length} color="text-blue-700" bg="bg-blue-50" />
        <ReportStatCard label="Not Started" value={all.filter(c => c.status === "not_started").length} color="text-gray-700" bg="bg-gray-50" />
        <ReportStatCard label="With Evidence" value={all.filter(c => c.evidenceCount > 0).length} color="text-purple-700" bg="bg-purple-50" />
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-4 no-print">
        <Input placeholder="Search controls..." value={search} onChange={e => setSearch(e.target.value)} className="w-56" />
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="border border-input rounded-md px-3 py-2 text-sm bg-background focus:outline-none focus:ring-1 focus:ring-ring">
          <option value="all">All Statuses</option>
          {Object.entries(STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <span className="text-sm text-muted-foreground self-center ml-auto">{controls.length} controls</span>
      </div>

      <Card>
        <CardContent className="pt-3 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left">
                <th className="py-2 pr-3 font-medium text-muted-foreground w-28">Control</th>
                <th className="py-2 pr-3 font-medium text-muted-foreground">Title</th>
                <th className="py-2 pr-3 font-medium text-muted-foreground w-40">Domain</th>
                <th className="py-2 pr-3 font-medium text-muted-foreground w-20">Level</th>
                <th className="py-2 pr-3 font-medium text-muted-foreground w-32">Status</th>
                <th className="py-2 pr-3 font-medium text-muted-foreground w-16 text-center">Evidence</th>
                <th className="py-2 pr-3 font-medium text-muted-foreground w-20 text-center">Narrative</th>
                <th className="py-2 font-medium text-muted-foreground w-32">Last Assessed</th>
              </tr>
            </thead>
            <tbody>
              {controls.map(c => (
                <tr key={c.controlId} className="border-b last:border-0 hover:bg-muted/30">
                  <td className="py-2 pr-3"><code className="text-xs bg-muted px-1.5 py-0.5 rounded font-mono">{c.controlId}</code></td>
                  <td className="py-2 pr-3 text-sm">{c.title}</td>
                  <td className="py-2 pr-3 text-xs text-muted-foreground">{c.domainName ?? "—"}</td>
                  <td className="py-2 pr-3"><span className="text-[11px] font-semibold px-1.5 py-0.5 rounded bg-primary/10 text-primary">{c.level}</span></td>
                  <td className="py-2 pr-3"><span className={cn("text-[11px] font-medium px-2 py-0.5 rounded-full", STATUS_COLOR[c.status] ?? "bg-gray-100 text-gray-700")}>{STATUS_LABEL[c.status] ?? c.status}</span></td>
                  <td className="py-2 pr-3 text-center"><span className={cn("text-sm font-semibold", c.evidenceCount > 0 ? "text-green-700" : "text-gray-400")}>{c.evidenceCount}</span></td>
                  <td className="py-2 pr-3 text-center">{c.hasNarrative ? <CheckCircle2 className="h-4 w-4 text-green-600 mx-auto" /> : <XCircle className="h-4 w-4 text-gray-300 mx-auto" />}</td>
                  <td className="py-2 text-xs text-muted-foreground">{fmtDate(c.lastAssessedAt)}</td>
                </tr>
              ))}
              {controls.length === 0 && (
                <tr><td colSpan={8} className="text-center py-10 text-muted-foreground">No controls match the filters.</td></tr>
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </ReportShell>
  );
}
