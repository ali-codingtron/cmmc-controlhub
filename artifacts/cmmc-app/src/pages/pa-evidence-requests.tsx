import { useState, useCallback } from "react";
import { ClipboardList, RefreshCw, CheckCircle2, Filter } from "lucide-react";
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

export default function PaEvidenceRequests() {
  const { activeOrg } = useOrg();
  const [requests, setRequests] = useState<EvidenceRequest[]>([]);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [statusFilter, setStatusFilter] = useState("all");
  const [updatingId, setUpdatingId] = useState<string | null>(null);

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

  const filtered = requests.filter((r) => statusFilter === "all" || r.status === statusFilter);
  const openCount = requests.filter((r) => r.status === "open").length;
  const submittedCount = requests.filter((r) => r.status === "submitted").length;
  const closedCount = requests.filter((r) => r.status === "closed").length;

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
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
            <p className="text-xs text-orange-600 mt-0.5">Open</p>
          </div>
          <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 text-center">
            <p className="text-2xl font-bold text-blue-700">{submittedCount}</p>
            <p className="text-xs text-blue-600 mt-0.5">Submitted</p>
          </div>
          <div className="rounded-xl border border-green-200 bg-green-50 p-4 text-center">
            <p className="text-2xl font-bold text-green-700">{closedCount}</p>
            <p className="text-xs text-green-600 mt-0.5">Closed</p>
          </div>
        </div>
      )}

      <div className="flex items-center gap-2">
        <Filter className="h-4 w-4 text-gray-400" />
        {["all", "open", "submitted", "closed"].map((s) => (
          <button
            key={s}
            onClick={() => setStatusFilter(s)}
            className={`rounded-full px-3 py-1 text-xs font-medium transition-colors capitalize ${
              statusFilter === s
                ? "bg-blue-600 text-white"
                : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            }`}
          >
            {s}
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
          <p className="text-sm text-gray-500 mt-1 max-w-sm">Evidence requests are generated automatically when scan findings require human-provided artifacts.</p>
        </div>
      )}

      <div className="space-y-3">
        {filtered.map((er) => (
          <div key={er.id} className={`rounded-xl border bg-white p-4 space-y-2 ${er.status === "open" ? "border-orange-200" : "border-gray-200"}`}>
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1">
                <div className="flex items-center gap-2 flex-wrap mb-1">
                  <ClipboardList className="h-4 w-4 text-orange-500" />
                  <h3 className="text-sm font-medium text-gray-900">{er.title}</h3>
                  <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium capitalize ${er.status === "closed" ? "bg-green-100 text-green-700" : er.status === "submitted" ? "bg-blue-100 text-blue-700" : "bg-orange-100 text-orange-700"}`}>
                    {er.status}
                  </span>
                </div>
                {er.instructions && <p className="text-xs text-gray-600">{er.instructions}</p>}
                {er.suggestedFilename && (
                  <p className="text-xs text-gray-400 mt-1">
                    Suggested filename: <span className="font-mono">{er.suggestedFilename}</span>
                  </p>
                )}
                <div className="flex items-center gap-3 mt-1 text-xs text-gray-400">
                  {er.ownerEmail && <span>Owner: {er.ownerEmail}</span>}
                  {er.dueDate && <span>Due: {new Date(er.dueDate).toLocaleDateString()}</span>}
                  <span>Created: {new Date(er.createdAt).toLocaleDateString()}</span>
                </div>
              </div>
              {er.status === "open" && (
                <div className="flex gap-1 shrink-0">
                  <button
                    onClick={() => updateStatus(er.id, "submitted")}
                    disabled={updatingId === er.id}
                    className="rounded border border-blue-200 bg-blue-50 px-2.5 py-1 text-xs text-blue-700 hover:bg-blue-100 disabled:opacity-50"
                  >
                    Mark Submitted
                  </button>
                  <button
                    onClick={() => updateStatus(er.id, "closed")}
                    disabled={updatingId === er.id}
                    className="rounded border border-green-200 bg-green-50 px-2.5 py-1 text-xs text-green-700 hover:bg-green-100 disabled:opacity-50"
                  >
                    Close
                  </button>
                </div>
              )}
              {er.status === "submitted" && (
                <button
                  onClick={() => updateStatus(er.id, "closed")}
                  disabled={updatingId === er.id}
                  className="rounded border border-green-200 bg-green-50 px-2.5 py-1 text-xs text-green-700 hover:bg-green-100 disabled:opacity-50 shrink-0"
                >
                  Close
                </button>
              )}
            </div>
            {er.linkedControlIds.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {er.linkedControlIds.map((c) => (
                  <span key={c} className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-mono text-gray-600">{c}</span>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
