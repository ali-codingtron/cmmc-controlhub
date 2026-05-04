import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useOrg } from "@/context/OrgContext";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Loader2 } from "lucide-react";
import { ReportShell, ReportStatCard } from "@/components/reports/ReportShell";
import { apiHeaders, fmtDate } from "@/lib/report-utils";
import { cn } from "@/lib/utils";

const EV_STATUS_COLOR: Record<string, string> = {
  draft: "bg-gray-100 text-gray-700",
  needs_classification: "bg-orange-100 text-orange-700",
  pending_review: "bg-yellow-100 text-yellow-700",
  approved: "bg-green-100 text-green-700",
  assessor_ready: "bg-purple-100 text-purple-700",
  rejected: "bg-red-100 text-red-700",
  stale: "bg-slate-100 text-slate-600",
  superseded: "bg-slate-100 text-slate-500",
  archived: "bg-gray-100 text-gray-500",
};

const EV_STATUS_LABEL: Record<string, string> = {
  draft: "Draft", needs_classification: "Needs Classification", pending_review: "Pending Review",
  approved: "Approved", assessor_ready: "Assessor Ready", rejected: "Rejected",
  stale: "Stale", superseded: "Superseded", archived: "Archived",
};

const EV_TYPE_LABEL: Record<string, string> = {
  policy: "Policy", procedure: "Procedure", screenshot: "Screenshot", log: "Log",
  report: "Report", ticket: "Ticket", configuration_export: "Config Export",
  access_review: "Access Review", training_record: "Training", incident_record: "Incident",
  risk_record: "Risk Record", approval_record: "Approval", system_inventory: "System Inventory",
  asset_inventory: "Asset Inventory", supplier_review: "Supplier Review",
  backup_verification: "Backup Verification", network_diagram: "Network Diagram",
  scan_report: "Scan Report", other: "Other",
};

interface EvidenceRow {
  id: string;
  title: string;
  evidenceType: string;
  status: string;
  version: string;
  ownerName: string | null;
  createdAt: string;
  expiresAt: string | null;
  collectedAt: string | null;
  fileName: string | null;
  linkedControls: string[];
}

export default function ReportsEvidence() {
  const { activeOrg } = useOrg();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");

  const { data: raw, isLoading } = useQuery<{ reportDate: string; evidence: EvidenceRow[] }>({
    queryKey: ["report-evidence", activeOrg?.id],
    queryFn: async () => {
      const r = await fetch("/api/reports/evidence", { headers: apiHeaders(activeOrg?.id) });
      if (!r.ok) throw new Error("Failed");
      return r.json();
    },
    enabled: !!activeOrg?.id,
  });

  const rows = useMemo(() => {
    if (!raw) return [];
    return raw.evidence.filter(e => {
      if (statusFilter !== "all" && e.status !== statusFilter) return false;
      if (typeFilter !== "all" && e.evidenceType !== typeFilter) return false;
      if (search) {
        const q = search.toLowerCase();
        return e.title.toLowerCase().includes(q) || e.linkedControls.join(" ").toLowerCase().includes(q);
      }
      return true;
    });
  }, [raw, search, statusFilter, typeFilter]);

  if (isLoading) return <div className="flex justify-center py-24"><Loader2 className="h-7 w-7 animate-spin text-muted-foreground" /></div>;
  if (!raw) return null;

  const all = raw.evidence;
  const csvRows = rows.map(e => ({
    "Title": e.title, "Type": EV_TYPE_LABEL[e.evidenceType] ?? e.evidenceType,
    "Status": EV_STATUS_LABEL[e.status] ?? e.status, "Version": e.version,
    "Owner": e.ownerName ?? "", "Linked Controls": e.linkedControls.join("; "),
    "Collected": fmtDate(e.collectedAt), "Uploaded": fmtDate(e.createdAt),
    "Expires": fmtDate(e.expiresAt), "File": e.fileName ?? "",
  }));

  const now = new Date();
  const expiringSoon = all.filter(e => {
    if (!e.expiresAt) return false;
    const exp = new Date(e.expiresAt);
    return exp >= now && exp <= new Date(Date.now() + 30 * 86400000);
  }).length;

  return (
    <ReportShell
      title="Evidence Inventory Report"
      subtitle="Complete record of all evidence items and their linked controls"
      reportDate={raw.reportDate}
      csvRows={csvRows}
      csvFilename="evidence-inventory.csv"
    >
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
        <ReportStatCard label="Total Evidence" value={all.length} />
        <ReportStatCard label="Approved" value={all.filter(e => e.status === "approved" || e.status === "assessor_ready").length} color="text-green-700" bg="bg-green-50" />
        <ReportStatCard label="Draft / Unclassified" value={all.filter(e => e.status === "draft" || e.status === "needs_classification").length} color="text-gray-700" bg="bg-gray-50" />
        <ReportStatCard label="Stale" value={all.filter(e => e.status === "stale").length} color="text-red-700" bg="bg-red-50" />
        <ReportStatCard label="Expiring (30d)" value={expiringSoon} color="text-yellow-700" bg="bg-yellow-50" />
      </div>

      <div className="flex flex-wrap gap-3 mb-4 no-print">
        <Input placeholder="Search evidence..." value={search} onChange={e => setSearch(e.target.value)} className="w-56" />
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="border border-input rounded-md px-3 py-2 text-sm bg-background focus:outline-none focus:ring-1 focus:ring-ring">
          <option value="all">All Statuses</option>
          {Object.entries(EV_STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)} className="border border-input rounded-md px-3 py-2 text-sm bg-background focus:outline-none focus:ring-1 focus:ring-ring">
          <option value="all">All Types</option>
          {Object.entries(EV_TYPE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <span className="text-sm text-muted-foreground self-center ml-auto">{rows.length} items</span>
      </div>

      <Card>
        <CardContent className="pt-3 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left">
                <th className="py-2 pr-3 font-medium text-muted-foreground">Title</th>
                <th className="py-2 pr-3 font-medium text-muted-foreground w-32">Type</th>
                <th className="py-2 pr-3 font-medium text-muted-foreground w-32">Status</th>
                <th className="py-2 pr-3 font-medium text-muted-foreground w-32">Owner</th>
                <th className="py-2 pr-3 font-medium text-muted-foreground">Controls</th>
                <th className="py-2 pr-3 font-medium text-muted-foreground w-28">Collected</th>
                <th className="py-2 font-medium text-muted-foreground w-28">Expires</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(e => {
                const isExpired = e.expiresAt && new Date(e.expiresAt) < now;
                return (
                  <tr key={e.id} className="border-b last:border-0 hover:bg-muted/30">
                    <td className="py-2 pr-3">
                      <div className="font-medium">{e.title}</div>
                      {e.fileName && <div className="text-[11px] text-muted-foreground">{e.fileName}</div>}
                    </td>
                    <td className="py-2 pr-3 text-xs text-muted-foreground">{EV_TYPE_LABEL[e.evidenceType] ?? e.evidenceType}</td>
                    <td className="py-2 pr-3"><span className={cn("text-[11px] font-medium px-2 py-0.5 rounded-full", EV_STATUS_COLOR[e.status] ?? "bg-gray-100")}>{EV_STATUS_LABEL[e.status] ?? e.status}</span></td>
                    <td className="py-2 pr-3 text-xs text-muted-foreground">{e.ownerName ?? "—"}</td>
                    <td className="py-2 pr-3">
                      <div className="flex flex-wrap gap-1">
                        {e.linkedControls.slice(0, 4).map(c => <code key={c} className="text-[10px] bg-muted px-1 py-0.5 rounded">{c}</code>)}
                        {e.linkedControls.length > 4 && <span className="text-[10px] text-muted-foreground">+{e.linkedControls.length - 4}</span>}
                        {e.linkedControls.length === 0 && <span className="text-[10px] text-muted-foreground">None</span>}
                      </div>
                    </td>
                    <td className="py-2 pr-3 text-xs text-muted-foreground">{fmtDate(e.collectedAt)}</td>
                    <td className={cn("py-2 text-xs", isExpired ? "text-red-600 font-medium" : "text-muted-foreground")}>{fmtDate(e.expiresAt)}</td>
                  </tr>
                );
              })}
              {rows.length === 0 && <tr><td colSpan={7} className="text-center py-10 text-muted-foreground">No evidence items match the filters.</td></tr>}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </ReportShell>
  );
}
