import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useOrg } from "@/context/OrgContext";
import { Card, CardContent } from "@/components/ui/card";
import { Loader2, Clock, CheckCircle2, AlertTriangle } from "lucide-react";
import { ReportShell, ReportStatCard } from "@/components/reports/ReportShell";
import { apiHeaders, fmtDate } from "@/lib/report-utils";
import { cn } from "@/lib/utils";

const FREQ_LABEL: Record<string, string> = {
  daily: "Daily", weekly: "Weekly", monthly: "Monthly", quarterly: "Quarterly", annually: "Annually",
};

const STATUS_COLOR: Record<string, string> = {
  open: "bg-gray-100 text-gray-700",
  in_progress: "bg-blue-100 text-blue-700",
  current: "bg-green-100 text-green-700",
};

const STATUS_LABEL: Record<string, string> = {
  open: "Open",
  in_progress: "In Progress",
  current: "Current",
};

interface MonItem {
  id: string;
  task: string;
  frequency: string;
  controlRef: string;
  description: string;
  lastCompleted: string | null;
  nextDue: string | null;
  status: string;
  notes: string | null;
  isOverdue: boolean;
  isDueSoon: boolean;
}

export default function ReportsMonitoring() {
  const { activeOrg } = useOrg();
  const [statusFilter, setStatusFilter] = useState("all");
  const [freqFilter, setFreqFilter] = useState("all");

  const { data: raw, isLoading } = useQuery<{
    reportDate: string;
    summary: { total: number; overdue: number; dueSoon: number; current: number };
    items: MonItem[];
  }>({
    queryKey: ["report-monitoring", activeOrg?.id],
    queryFn: async () => {
      const r = await fetch("/api/reports/monitoring", { headers: apiHeaders(activeOrg?.id) });
      if (!r.ok) throw new Error("Failed");
      return r.json();
    },
    enabled: !!activeOrg?.id,
  });

  const items = useMemo(() => {
    if (!raw) return [];
    return raw.items.filter(m => {
      if (statusFilter === "overdue" && !m.isOverdue) return false;
      if (statusFilter !== "all" && statusFilter !== "overdue" && m.status !== statusFilter) return false;
      if (freqFilter !== "all" && m.frequency !== freqFilter) return false;
      return true;
    });
  }, [raw, statusFilter, freqFilter]);

  if (isLoading) return <div className="flex justify-center py-24"><Loader2 className="h-7 w-7 animate-spin text-muted-foreground" /></div>;
  if (!raw) return null;

  const csvRows = items.map(m => ({
    "Task": m.task, "Frequency": FREQ_LABEL[m.frequency] ?? m.frequency,
    "Control Ref": m.controlRef, "Status": STATUS_LABEL[m.status] ?? m.status,
    "Last Completed": fmtDate(m.lastCompleted), "Next Due": fmtDate(m.nextDue),
    "Overdue": m.isOverdue ? "Yes" : "No", "Notes": m.notes ?? "",
  }));

  return (
    <ReportShell
      title="Monitoring Tracker Report"
      subtitle="Operational compliance monitoring tasks and schedules"
      reportDate={raw.reportDate}
      csvRows={csvRows}
      csvFilename="monitoring-report.csv"
    >
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <ReportStatCard label="Total Tasks" value={raw.summary.total} />
        <ReportStatCard label="Current" value={raw.summary.current} color="text-green-700" bg="bg-green-50" sub="Up to date this cycle" />
        <ReportStatCard label="Overdue" value={raw.summary.overdue} color="text-red-700" bg="bg-red-50" sub="Past due date" />
        <ReportStatCard label="Due Within 7 Days" value={raw.summary.dueSoon} color="text-yellow-700" bg="bg-yellow-50" />
      </div>

      {raw.summary.overdue > 0 && (
        <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-800 mb-4">
          <AlertTriangle className="h-4 w-4 flex-shrink-0" />
          <span><strong>{raw.summary.overdue} monitoring tasks are overdue.</strong> These gaps are high-risk findings during a C3PAO assessment.</span>
        </div>
      )}

      <div className="flex flex-wrap gap-3 mb-4 no-print">
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="border border-input rounded-md px-3 py-2 text-sm bg-background focus:outline-none focus:ring-1 focus:ring-ring">
          <option value="all">All Statuses</option>
          <option value="overdue">Overdue Only</option>
          <option value="open">Open</option>
          <option value="in_progress">In Progress</option>
          <option value="current">Current</option>
        </select>
        <select value={freqFilter} onChange={e => setFreqFilter(e.target.value)} className="border border-input rounded-md px-3 py-2 text-sm bg-background focus:outline-none focus:ring-1 focus:ring-ring">
          <option value="all">All Frequencies</option>
          {Object.entries(FREQ_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <span className="text-sm text-muted-foreground self-center ml-auto">{items.length} tasks</span>
      </div>

      <Card>
        <CardContent className="pt-3 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left">
                <th className="py-2 pr-3 font-medium text-muted-foreground">Task</th>
                <th className="py-2 pr-3 font-medium text-muted-foreground w-24">Frequency</th>
                <th className="py-2 pr-3 font-medium text-muted-foreground w-24">Control Ref</th>
                <th className="py-2 pr-3 font-medium text-muted-foreground w-28">Status</th>
                <th className="py-2 pr-3 font-medium text-muted-foreground w-28">Last Completed</th>
                <th className="py-2 pr-3 font-medium text-muted-foreground w-28">Next Due</th>
                <th className="py-2 font-medium text-muted-foreground w-20">Flag</th>
              </tr>
            </thead>
            <tbody>
              {items.map(m => (
                <tr key={m.id} className={cn("border-b last:border-0 hover:bg-muted/30", m.isOverdue && "bg-red-50/40")}>
                  <td className="py-2 pr-3">
                    <div className="font-medium">{m.task}</div>
                    <div className="text-[11px] text-muted-foreground line-clamp-1">{m.description}</div>
                  </td>
                  <td className="py-2 pr-3 text-xs text-muted-foreground">{FREQ_LABEL[m.frequency] ?? m.frequency}</td>
                  <td className="py-2 pr-3"><code className="text-[10px] bg-muted px-1 py-0.5 rounded">{m.controlRef}</code></td>
                  <td className="py-2 pr-3">
                    <span className={cn("text-[11px] font-medium px-2 py-0.5 rounded-full", STATUS_COLOR[m.status] ?? "bg-gray-100 text-gray-700")}>
                      {STATUS_LABEL[m.status] ?? m.status}
                    </span>
                  </td>
                  <td className="py-2 pr-3 text-xs text-muted-foreground">{fmtDate(m.lastCompleted)}</td>
                  <td className={cn("py-2 pr-3 text-xs font-medium", m.isOverdue ? "text-red-700" : m.isDueSoon ? "text-yellow-700" : "text-muted-foreground")}>
                    {fmtDate(m.nextDue)}
                  </td>
                  <td className="py-2">
                    {m.isOverdue ? (
                      <span className="flex items-center gap-1 text-[11px] text-red-700 font-semibold"><AlertTriangle className="h-3 w-3" />Overdue</span>
                    ) : m.isDueSoon ? (
                      <span className="flex items-center gap-1 text-[11px] text-yellow-700 font-semibold"><Clock className="h-3 w-3" />Due Soon</span>
                    ) : m.status === "current" ? (
                      <span className="flex items-center gap-1 text-[11px] text-green-700"><CheckCircle2 className="h-3 w-3" />Current</span>
                    ) : null}
                  </td>
                </tr>
              ))}
              {items.length === 0 && <tr><td colSpan={7} className="text-center py-10 text-muted-foreground">No monitoring tasks match the filters.</td></tr>}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </ReportShell>
  );
}
