import { useState, useCallback } from "react";
import {
  ClipboardList, RefreshCw, CheckCircle2, Filter, FileText,
  Calendar, User, Loader2, Upload, Link2, ChevronDown, ChevronRight,
} from "lucide-react";
import { useOrg } from "@/context/OrgContext";

type EvidenceRequest = {
  id: string;
  scanRunId: string | null;
  findingId: string | null;
  title: string;
  instructions: string | null;
  suggestedFilename: string | null;
  linkedControlIds: string[];
  dueDate: string | null;
  ownerEmail: string | null;
  status: string;
  createdAt: string;
};

const STATUS_STYLES: Record<string, { label: string; cls: string }> = {
  open: { label: "Open", cls: "bg-orange-100 text-orange-700 border-orange-200" },
  submitted: { label: "Submitted", cls: "bg-blue-100 text-blue-700 border-blue-200" },
  under_review: { label: "Under Review", cls: "bg-purple-100 text-purple-700 border-purple-200" },
  accepted: { label: "Accepted", cls: "bg-green-100 text-green-700 border-green-200" },
  rejected: { label: "Rejected", cls: "bg-red-100 text-red-700 border-red-200" },
  closed: { label: "Closed", cls: "bg-gray-100 text-gray-600 border-gray-200" },
};

function statusBadge(status: string) {
  const s = STATUS_STYLES[status] ?? STATUS_STYLES.open;
  return (
    <span className={`inline-flex items-center rounded border px-2 py-0.5 text-xs font-medium ${s.cls}`}>
      {s.label}
    </span>
  );
}

function isDueSoon(dueDate: string | null): boolean {
  if (!dueDate) return false;
  const due = new Date(dueDate);
  const now = new Date();
  const diff = (due.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
  return diff >= 0 && diff <= 7;
}

function isOverdue(dueDate: string | null): boolean {
  if (!dueDate) return false;
  return new Date(dueDate) < new Date();
}

export default function PaEvidenceRequests() {
  const { activeOrg } = useOrg();
  const [requests, setRequests] = useState<EvidenceRequest[]>([]);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [statusFilter, setStatusFilter] = useState("all");
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  const load = useCallback(() => {
    if (!activeOrg) return;
    setLoading(true);
    const token = localStorage.getItem("auth_token");
    fetch("/api/pre-assessment/evidence-requests", {
      headers: { Authorization: `Bearer ${token}`, "X-Organization-ID": activeOrg.id },
    })
      .then((r) => r.json())
      .then((d) => { setRequests(d.evidenceRequests ?? []); setLoaded(true); setLoading(false); })
      .catch(() => { setLoading(false); setLoaded(true); });
  }, [activeOrg]);

  if (!loaded && !loading && activeOrg) load();

  async function updateStatus(id: string, status: string) {
    if (!activeOrg) return;
    setUpdatingId(id);
    const token = localStorage.getItem("auth_token");
    const res = await fetch(`/api/pre-assessment/evidence-requests/${id}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        "X-Organization-ID": activeOrg.id,
      },
      body: JSON.stringify({ status }),
    });
    if (res.ok) {
      const updated = await res.json();
      setRequests((prev) => prev.map((r) => (r.id === id ? { ...r, ...updated } : r)));
    }
    setUpdatingId(null);
  }

  function toggleExpand(id: string) {
    setExpandedIds((prev) => {
      const s = new Set(prev);
      s.has(id) ? s.delete(id) : s.add(id);
      return s;
    });
  }

  const STATUS_TABS = ["all", "open", "submitted", "closed"];
  const filtered = requests.filter((r) => statusFilter === "all" || r.status === statusFilter);
  const openCount = requests.filter((r) => r.status === "open").length;
  const submittedCount = requests.filter((r) => r.status === "submitted").length;
  const acceptedCount = requests.filter((r) => r.status === "accepted" || r.status === "closed").length;

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-5">
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-orange-600 text-white">
            <ClipboardList className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-gray-900">Evidence Requests</h1>
            <p className="text-sm text-gray-500">Human-provided artifacts requested by pre-assessment scans</p>
          </div>
        </div>
        <button onClick={() => { setLoaded(false); load(); }} className="rounded-md border border-gray-200 p-2 text-gray-400 hover:bg-gray-50">
          <RefreshCw className="h-4 w-4" />
        </button>
      </div>

      {loaded && requests.length > 0 && (
        <div className="grid grid-cols-3 gap-3">
          <div className="rounded-xl border border-orange-200 bg-orange-50 p-4 text-center">
            <p className="text-2xl font-bold text-orange-700">{openCount}</p>
            <p className="text-xs text-orange-600 mt-0.5 font-medium">Open</p>
            <p className="text-[10px] text-orange-500">awaiting evidence</p>
          </div>
          <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 text-center">
            <p className="text-2xl font-bold text-blue-700">{submittedCount}</p>
            <p className="text-xs text-blue-600 mt-0.5 font-medium">Submitted</p>
            <p className="text-[10px] text-blue-500">pending review</p>
          </div>
          <div className="rounded-xl border border-green-200 bg-green-50 p-4 text-center">
            <p className="text-2xl font-bold text-green-700">{acceptedCount}</p>
            <p className="text-xs text-green-600 mt-0.5 font-medium">Accepted / Closed</p>
            <p className="text-[10px] text-green-500">complete</p>
          </div>
        </div>
      )}

      <div className="flex items-center gap-2 flex-wrap">
        <Filter className="h-4 w-4 text-gray-400" />
        {STATUS_TABS.map((s) => (
          <button
            key={s}
            onClick={() => setStatusFilter(s)}
            className={`rounded-full px-3 py-1 text-xs font-medium transition-colors capitalize ${
              statusFilter === s
                ? "bg-blue-600 text-white"
                : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            }`}
          >
            {s === "all" ? "All" : STATUS_STYLES[s]?.label ?? s}
            {s !== "all" && (
              <span className="ml-1">({requests.filter((r) => r.status === s).length})</span>
            )}
          </button>
        ))}
        <span className="text-xs text-gray-400 ml-auto">{filtered.length} request{filtered.length !== 1 ? "s" : ""}</span>
      </div>

      {loading && (
        <div className="flex items-center justify-center py-20 text-gray-400">
          <RefreshCw className="mr-2 h-5 w-5 animate-spin" /> Loading…
        </div>
      )}

      {loaded && requests.length === 0 && (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-gray-300 bg-gray-50 py-20 text-center">
          <CheckCircle2 className="h-12 w-12 text-gray-300 mb-4" />
          <p className="text-base font-medium text-gray-700">No evidence requests</p>
          <p className="text-sm text-gray-500 mt-1 max-w-sm">
            Evidence requests are generated automatically when scan findings require human-provided artifacts.
          </p>
        </div>
      )}

      <div className="space-y-3">
        {filtered.map((er) => {
          const isExpanded = expandedIds.has(er.id);
          const overdue = isOverdue(er.dueDate);
          const dueSoon = isDueSoon(er.dueDate);
          const isUpdating = updatingId === er.id;

          return (
            <div key={er.id} className={`rounded-xl border bg-white overflow-hidden ${
              er.status === "open" && overdue ? "border-l-4 border-l-red-500 border-red-100" :
              er.status === "open" && dueSoon ? "border-l-4 border-l-orange-400 border-orange-100" :
              er.status === "open" ? "border-orange-200" :
              "border-gray-200"
            }`}>
              <div className="p-4">
                <div className="flex items-start gap-3">
                  <ClipboardList className="h-4 w-4 text-orange-500 shrink-0 mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <h3 className="text-sm font-semibold text-gray-900">{er.title}</h3>
                        {statusBadge(er.status)}
                        {overdue && er.status === "open" && (
                          <span className="inline-flex items-center rounded border border-red-200 bg-red-50 px-2 py-0.5 text-xs font-medium text-red-700">
                            Overdue
                          </span>
                        )}
                        {dueSoon && !overdue && er.status === "open" && (
                          <span className="inline-flex items-center rounded border border-orange-200 bg-orange-50 px-2 py-0.5 text-xs font-medium text-orange-700">
                            Due Soon
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-4 text-xs text-gray-400 mt-1">
                      {er.ownerEmail && (
                        <span className="flex items-center gap-1">
                          <User className="h-3 w-3" />
                          {er.ownerEmail}
                        </span>
                      )}
                      {er.dueDate && (
                        <span className={`flex items-center gap-1 ${overdue ? "text-red-600 font-medium" : dueSoon ? "text-orange-600" : ""}`}>
                          <Calendar className="h-3 w-3" />
                          Due {new Date(er.dueDate).toLocaleDateString()}
                        </span>
                      )}
                      <span>Created {new Date(er.createdAt).toLocaleDateString()}</span>
                    </div>

                    <button
                      onClick={() => toggleExpand(er.id)}
                      className="mt-2 flex items-center gap-1.5 text-xs text-blue-600 hover:text-blue-800"
                    >
                      {isExpanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                      {isExpanded ? "Hide details" : "Show details"}
                    </button>
                  </div>

                  <div className="shrink-0 flex gap-1 flex-wrap justify-end">
                    {er.status === "open" && (
                      <>
                        <button
                          onClick={() => updateStatus(er.id, "submitted")}
                          disabled={isUpdating}
                          className="inline-flex items-center gap-1 rounded border border-blue-200 bg-blue-50 px-2.5 py-1 text-xs text-blue-700 hover:bg-blue-100 disabled:opacity-50"
                        >
                          {isUpdating ? <Loader2 className="h-3 w-3 animate-spin" /> : <Upload className="h-3 w-3" />}
                          Submit for Review
                        </button>
                        <button
                          onClick={() => updateStatus(er.id, "closed")}
                          disabled={isUpdating}
                          className="inline-flex items-center gap-1 rounded border border-green-200 bg-green-50 px-2.5 py-1 text-xs text-green-700 hover:bg-green-100 disabled:opacity-50"
                        >
                          <CheckCircle2 className="h-3 w-3" />
                          Close
                        </button>
                      </>
                    )}
                    {er.status === "submitted" && (
                      <button
                        onClick={() => updateStatus(er.id, "closed")}
                        disabled={isUpdating}
                        className="inline-flex items-center gap-1 rounded border border-green-200 bg-green-50 px-2.5 py-1 text-xs text-green-700 hover:bg-green-100 disabled:opacity-50"
                      >
                        {isUpdating ? <Loader2 className="h-3 w-3 animate-spin" /> : <CheckCircle2 className="h-3 w-3" />}
                        Accept &amp; Close
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {isExpanded && (
                <div className="border-t border-gray-100 bg-gray-50 px-4 py-3 space-y-3">
                  {er.instructions && (
                    <div>
                      <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-1">Instructions</p>
                      <p className="text-xs text-gray-700 leading-relaxed">{er.instructions}</p>
                    </div>
                  )}
                  {er.suggestedFilename && (
                    <div>
                      <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-1">Suggested Filename</p>
                      <div className="flex items-center gap-2 bg-white rounded border border-gray-200 px-3 py-1.5">
                        <FileText className="h-3.5 w-3.5 text-gray-400 shrink-0" />
                        <code className="text-xs font-mono text-gray-800">{er.suggestedFilename}</code>
                      </div>
                    </div>
                  )}
                  {er.linkedControlIds.length > 0 && (
                    <div>
                      <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Linked Controls</p>
                      <div className="flex flex-wrap gap-1">
                        {er.linkedControlIds.map((c) => (
                          <span key={c} className="rounded bg-white border border-gray-200 px-1.5 py-0.5 text-[10px] font-mono text-gray-700">{c}</span>
                        ))}
                      </div>
                    </div>
                  )}
                  <div className="flex gap-2 pt-1">
                    <button className="inline-flex items-center gap-1.5 rounded border border-blue-200 bg-white px-3 py-1.5 text-xs text-blue-700 hover:bg-blue-50">
                      <Upload className="h-3.5 w-3.5" /> Upload Evidence
                    </button>
                    <button className="inline-flex items-center gap-1.5 rounded border border-gray-200 bg-white px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-50">
                      <Link2 className="h-3.5 w-3.5" /> Link Existing Evidence
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
