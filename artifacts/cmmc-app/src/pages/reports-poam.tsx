import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useOrg } from "@/context/OrgContext";
import { Card, CardContent } from "@/components/ui/card";
import { Loader2, AlertOctagon } from "lucide-react";
import { ReportShell, ReportStatCard } from "@/components/reports/ReportShell";
import { apiHeaders, fmtDate, RISK_COLOR } from "@/lib/report-utils";
import { cn } from "@/lib/utils";

const POAM_STATUS_COLOR: Record<string, string> = {
  open: "bg-red-100 text-red-700",
  in_progress: "bg-blue-100 text-blue-700",
  waiting_on_vendor: "bg-orange-100 text-orange-700",
  mitigated: "bg-green-100 text-green-700",
  accepted_risk: "bg-purple-100 text-purple-700",
  closed: "bg-gray-100 text-gray-500",
};

const POAM_STATUS_LABEL: Record<string, string> = {
  open: "Open", in_progress: "In Progress", waiting_on_vendor: "Waiting on Vendor",
  mitigated: "Mitigated", accepted_risk: "Accepted Risk", closed: "Closed",
};

const RISK_LABEL: Record<string, string> = { critical: "Critical", high: "High", medium: "Medium", low: "Low" };

interface PoamItem {
  id: string;
  poamNumber: string | null;
  title: string;
  deficiencyDescription: string;
  status: string;
  riskLevel: string;
  linkedControlLabel: string | null;
  ownerName: string | null;
  scheduledCompletionDate: string | null;
  completedDate: string | null;
  remediationPlan: string | null;
  createdAt: string;
  daysOverdue: number;
  isOverdue: boolean;
  isDueSoon: boolean;
}

export default function ReportsPoam() {
  const { activeOrg } = useOrg();
  const [statusFilter, setStatusFilter] = useState("all");
  const [riskFilter, setRiskFilter] = useState("all");

  const { data: raw, isLoading } = useQuery<{ reportDate: string; summary: { total: number; open: number; overdue: number; closingSoon: number }; items: PoamItem[] }>({
    queryKey: ["report-poam", activeOrg?.id],
    queryFn: async () => {
      const r = await fetch("/api/reports/poam", { headers: apiHeaders(activeOrg?.id) });
      if (!r.ok) throw new Error("Failed");
      return r.json();
    },
    enabled: !!activeOrg?.id,
  });

  const items = useMemo(() => {
    if (!raw) return [];
    return raw.items.filter(p => {
      if (statusFilter !== "all" && p.status !== statusFilter) return false;
      if (riskFilter !== "all" && p.riskLevel !== riskFilter) return false;
      return true;
    });
  }, [raw, statusFilter, riskFilter]);

  if (isLoading) return <div className="flex justify-center py-24"><Loader2 className="h-7 w-7 animate-spin text-muted-foreground" /></div>;
  if (!raw) return null;

  const csvRows = items.map(p => ({
    "POA&M #": p.poamNumber ?? "", "Title": p.title, "Status": POAM_STATUS_LABEL[p.status] ?? p.status,
    "Risk Level": RISK_LABEL[p.riskLevel] ?? p.riskLevel, "Linked Control": p.linkedControlLabel ?? "",
    "Owner": p.ownerName ?? "", "Target Completion": fmtDate(p.scheduledCompletionDate),
    "Days Overdue": p.daysOverdue, "Remediation Plan": p.remediationPlan ?? "",
  }));

  return (
    <ReportShell
      title="POA&M Report"
      subtitle="Plan of Action & Milestones — remediation tracking"
      reportDate={raw.reportDate}
      csvRows={csvRows}
      csvFilename="poam-report.csv"
    >
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <ReportStatCard label="Total POA&Ms" value={raw.summary.total} />
        <ReportStatCard label="Open Items" value={raw.summary.open} color="text-orange-700" bg="bg-orange-50" />
        <ReportStatCard label="Overdue" value={raw.summary.overdue} color="text-red-700" bg="bg-red-50" sub="Past target date" />
        <ReportStatCard label="Closing Soon" value={raw.summary.closingSoon} color="text-yellow-700" bg="bg-yellow-50" sub="Within 7 days" />
      </div>

      {raw.summary.overdue > 0 && (
        <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-800 mb-4">
          <AlertOctagon className="h-4 w-4 flex-shrink-0" />
          <span><strong>{raw.summary.overdue} POA&M items are overdue.</strong> Immediate action is required to maintain compliance posture.</span>
        </div>
      )}

      <div className="flex flex-wrap gap-3 mb-4 no-print">
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="border border-input rounded-md px-3 py-2 text-sm bg-background focus:outline-none focus:ring-1 focus:ring-ring">
          <option value="all">All Statuses</option>
          {Object.entries(POAM_STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <select value={riskFilter} onChange={e => setRiskFilter(e.target.value)} className="border border-input rounded-md px-3 py-2 text-sm bg-background focus:outline-none focus:ring-1 focus:ring-ring">
          <option value="all">All Risk Levels</option>
          {Object.entries(RISK_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <span className="text-sm text-muted-foreground self-center ml-auto">{items.length} items</span>
      </div>

      <Card>
        <CardContent className="pt-3 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left">
                <th className="py-2 pr-3 font-medium text-muted-foreground w-20">#</th>
                <th className="py-2 pr-3 font-medium text-muted-foreground">Title / Description</th>
                <th className="py-2 pr-3 font-medium text-muted-foreground w-28">Risk</th>
                <th className="py-2 pr-3 font-medium text-muted-foreground w-32">Status</th>
                <th className="py-2 pr-3 font-medium text-muted-foreground w-24">Control</th>
                <th className="py-2 pr-3 font-medium text-muted-foreground w-28">Owner</th>
                <th className="py-2 pr-3 font-medium text-muted-foreground w-28">Target Date</th>
                <th className="py-2 font-medium text-muted-foreground w-24">Overdue</th>
              </tr>
            </thead>
            <tbody>
              {items.map(p => (
                <tr key={p.id} className={cn("border-b last:border-0 hover:bg-muted/30", p.isOverdue && "bg-red-50/40")}>
                  <td className="py-2 pr-3 text-xs text-muted-foreground">{p.poamNumber ?? "—"}</td>
                  <td className="py-2 pr-3 max-w-xs">
                    <div className="font-medium">{p.title}</div>
                    <div className="text-[11px] text-muted-foreground line-clamp-1">{p.deficiencyDescription}</div>
                  </td>
                  <td className="py-2 pr-3"><span className={cn("text-[11px] font-medium px-2 py-0.5 rounded-full", RISK_COLOR[p.riskLevel] ?? "")}>{RISK_LABEL[p.riskLevel] ?? p.riskLevel}</span></td>
                  <td className="py-2 pr-3"><span className={cn("text-[11px] font-medium px-2 py-0.5 rounded-full", POAM_STATUS_COLOR[p.status] ?? "")}>{POAM_STATUS_LABEL[p.status] ?? p.status}</span></td>
                  <td className="py-2 pr-3"><code className="text-[10px] bg-muted px-1 py-0.5 rounded">{p.linkedControlLabel ?? "—"}</code></td>
                  <td className="py-2 pr-3 text-xs text-muted-foreground">{p.ownerName ?? "—"}</td>
                  <td className="py-2 pr-3 text-xs text-muted-foreground">{fmtDate(p.scheduledCompletionDate)}</td>
                  <td className="py-2">
                    {p.isOverdue ? (
                      <span className="text-[11px] font-semibold text-red-700">{p.daysOverdue}d overdue</span>
                    ) : p.isDueSoon ? (
                      <span className="text-[11px] font-semibold text-yellow-700">Due soon</span>
                    ) : <span className="text-muted-foreground">—</span>}
                  </td>
                </tr>
              ))}
              {items.length === 0 && <tr><td colSpan={8} className="text-center py-10 text-muted-foreground">No POA&M items match the filters.</td></tr>}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </ReportShell>
  );
}
