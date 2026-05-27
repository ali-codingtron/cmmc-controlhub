import { useState, useCallback } from "react";
import { Map, RefreshCw, CheckCircle2, Circle, Loader2 } from "lucide-react";
import { useOrg } from "@/context/OrgContext";

type RoadmapAction = {
  id: string;
  scanRunId: string | null;
  category: string;
  title: string;
  description: string | null;
  priority: number;
  drivingFindings: string[];
  linkedControlIds: string[];
  status: string;
  createdAt: string;
};

const CATEGORY_COLORS: Record<string, string> = {
  "Identity & Access": "bg-blue-100 text-blue-700 border-blue-200",
  "Authentication": "bg-purple-100 text-purple-700 border-purple-200",
  "Endpoint Management": "bg-green-100 text-green-700 border-green-200",
  "Audit & Logging": "bg-orange-100 text-orange-700 border-orange-200",
  "Security Posture": "bg-red-100 text-red-700 border-red-200",
};

export default function PaRoadmap() {
  const { activeOrg } = useOrg();
  const [actions, setActions] = useState<RoadmapAction[]>([]);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  const load = useCallback(() => {
    if (!activeOrg) return;
    setLoading(true);
    const token = localStorage.getItem("auth_token");
    fetch("/api/pre-assessment/roadmap", {
      headers: { Authorization: `Bearer ${token}`, "X-Organization-ID": activeOrg.id },
    })
      .then((r) => r.json())
      .then((d) => { setActions(d.roadmapActions ?? []); setLoaded(true); setLoading(false); })
      .catch(() => { setLoading(false); setLoaded(true); });
  }, [activeOrg]);

  if (!loaded && !loading && activeOrg) load();

  async function updateStatus(id: string, status: string) {
    if (!activeOrg) return;
    setUpdatingId(id);
    const token = localStorage.getItem("auth_token");
    await fetch(`/api/pre-assessment/roadmap/${id}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        "X-Organization-ID": activeOrg.id,
      },
      body: JSON.stringify({ status }),
    });
    setActions((prev) => prev.map((a) => (a.id === id ? { ...a, status } : a)));
    setUpdatingId(null);
  }

  const byPriority = [1, 2, 3, 4].map((p) => ({
    priority: p,
    label: p === 1 ? "Immediate" : p === 2 ? "Short-Term" : p === 3 ? "Medium-Term" : "Long-Term",
    cls: p === 1 ? "text-red-700" : p === 2 ? "text-orange-700" : p === 3 ? "text-blue-700" : "text-gray-600",
    items: actions.filter((a) => a.priority === p),
  })).filter((g) => g.items.length > 0);

  const openCount = actions.filter((a) => a.status === "open").length;
  const inProgressCount = actions.filter((a) => a.status === "in_progress").length;
  const doneCount = actions.filter((a) => a.status === "done").length;

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-green-600 text-white">
            <Map className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-gray-900">Recommended Roadmap</h1>
            <p className="text-sm text-gray-500">Prioritized implementation actions generated from pre-assessment scan findings</p>
          </div>
        </div>
        <button onClick={() => { setLoaded(false); load(); }} className="rounded-md border border-gray-200 p-2 text-gray-400 hover:bg-gray-50">
          <RefreshCw className="h-4 w-4" />
        </button>
      </div>

      {loaded && actions.length > 0 && (
        <div className="grid grid-cols-3 gap-3">
          <div className="rounded-xl border border-gray-200 bg-white p-4 text-center">
            <p className="text-2xl font-bold text-gray-700">{openCount}</p>
            <p className="text-xs text-gray-500 mt-0.5">Open</p>
          </div>
          <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 text-center">
            <p className="text-2xl font-bold text-blue-700">{inProgressCount}</p>
            <p className="text-xs text-blue-600 mt-0.5">In Progress</p>
          </div>
          <div className="rounded-xl border border-green-200 bg-green-50 p-4 text-center">
            <p className="text-2xl font-bold text-green-700">{doneCount}</p>
            <p className="text-xs text-green-600 mt-0.5">Completed</p>
          </div>
        </div>
      )}

      {loading && (
        <div className="flex items-center justify-center py-20 text-gray-400">
          <RefreshCw className="mr-2 h-5 w-5 animate-spin" /> Loading…
        </div>
      )}

      {loaded && actions.length === 0 && (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-gray-300 bg-gray-50 py-20 text-center">
          <Map className="h-12 w-12 text-gray-300 mb-4" />
          <p className="text-base font-medium text-gray-700">No roadmap actions yet</p>
          <p className="text-sm text-gray-500 mt-1 max-w-sm">Roadmap actions are generated automatically after a tenant assessment scan completes.</p>
        </div>
      )}

      {byPriority.map((group) => (
        <div key={group.priority} className="space-y-2">
          <h2 className={`text-sm font-semibold uppercase tracking-wide ${group.cls}`}>
            Priority {group.priority} — {group.label}
          </h2>
          {group.items.map((action, i) => (
            <div
              key={action.id}
              className={`rounded-xl border bg-white p-4 space-y-2 ${action.status === "done" ? "opacity-60" : "border-gray-200"}`}
            >
              <div className="flex items-start gap-3">
                <button
                  onClick={() => updateStatus(action.id, action.status === "done" ? "open" : action.status === "in_progress" ? "done" : "in_progress")}
                  disabled={updatingId === action.id}
                  className="mt-0.5 shrink-0"
                >
                  {updatingId === action.id ? (
                    <Loader2 className="h-5 w-5 text-gray-400 animate-spin" />
                  ) : action.status === "done" ? (
                    <CheckCircle2 className="h-5 w-5 text-green-600" />
                  ) : action.status === "in_progress" ? (
                    <Circle className="h-5 w-5 text-blue-500 fill-blue-100" />
                  ) : (
                    <Circle className="h-5 w-5 text-gray-300" />
                  )}
                </button>
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-gray-800 text-[10px] font-bold text-white shrink-0">
                      {i + 1}
                    </span>
                    <h3 className={`text-sm font-semibold text-gray-900 ${action.status === "done" ? "line-through" : ""}`}>
                      {action.title}
                    </h3>
                    <span className={`inline-flex items-center rounded border px-2 py-0.5 text-xs font-medium ${CATEGORY_COLORS[action.category] ?? "bg-gray-100 text-gray-600 border-gray-200"}`}>
                      {action.category}
                    </span>
                    {action.status === "in_progress" && (
                      <span className="text-xs bg-blue-100 text-blue-700 rounded-full px-2 py-0.5">In Progress</span>
                    )}
                  </div>
                  {action.description && (
                    <p className="text-xs text-gray-600 mt-1">{action.description}</p>
                  )}
                  {action.linkedControlIds.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-2">
                      {action.linkedControlIds.map((c) => (
                        <span key={c} className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-mono text-gray-600">{c}</span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
