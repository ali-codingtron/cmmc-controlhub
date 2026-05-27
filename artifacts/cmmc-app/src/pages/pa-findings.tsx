import { useState, useCallback } from "react";
import { AlertTriangle, RefreshCw, CheckCircle2, XCircle, Filter, Loader2 } from "lucide-react";
import { useOrg } from "@/context/OrgContext";

type Finding = {
  id: string;
  scanRunId: string;
  ruleId: string;
  ruleName: string;
  title: string;
  severity: string;
  result: string;
  packId: string;
  observedCondition: string | null;
  expectedCondition: string | null;
  affectedCount: number;
  linkedControlIds: string[];
  recommendedRemediation: string | null;
  suggestedRoadmapAction: string | null;
  approvedStatus: string | null;
  createdAt: string;
};

const SEVERITY_ORDER: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3, informational: 4 };

function severityBadge(s: string) {
  const m: Record<string, string> = {
    critical: "bg-red-100 text-red-700 border-red-200",
    high: "bg-orange-100 text-orange-700 border-orange-200",
    medium: "bg-yellow-100 text-yellow-700 border-yellow-200",
    low: "bg-blue-100 text-blue-700 border-blue-200",
    informational: "bg-gray-100 text-gray-600 border-gray-200",
  };
  return (
    <span className={`inline-flex items-center rounded border px-2 py-0.5 text-xs font-medium capitalize ${m[s] ?? m.informational}`}>
      {s}
    </span>
  );
}

function resultBadge(r: string) {
  const m: Record<string, string> = {
    fail: "bg-red-100 text-red-700",
    partial: "bg-yellow-100 text-yellow-700",
    unknown: "bg-gray-100 text-gray-500",
    pass: "bg-green-100 text-green-700",
  };
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium capitalize ${m[r] ?? m.unknown}`}>
      {r.replace("_", " ")}
    </span>
  );
}

export default function PaFindings() {
  const { activeOrg } = useOrg();
  const [findings, setFindings] = useState<Finding[]>([]);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [severityFilter, setSeverityFilter] = useState("all");
  const [packFilter, setPackFilter] = useState("all");
  const [approving, setApproving] = useState<string | null>(null);

  const load = useCallback(() => {
    if (!activeOrg) return;
    setLoading(true);
    const token = localStorage.getItem("auth_token");
    fetch("/api/pre-assessment/findings", {
      headers: { Authorization: `Bearer ${token}`, "X-Organization-ID": activeOrg.id },
    })
      .then((r) => r.json())
      .then((d) => {
        const sorted = (d.findings ?? []).sort((a: Finding, b: Finding) =>
          (SEVERITY_ORDER[a.severity] ?? 99) - (SEVERITY_ORDER[b.severity] ?? 99)
        );
        setFindings(sorted);
        setLoaded(true);
        setLoading(false);
      })
      .catch(() => { setLoading(false); setLoaded(true); });
  }, [activeOrg]);

  if (!loaded && !loading && activeOrg) load();

  async function takeAction(id: string, action: "approve" | "reject") {
    if (!activeOrg) return;
    setApproving(id);
    const token = localStorage.getItem("auth_token");
    const res = await fetch(`/api/pre-assessment/findings/${id}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        "X-Organization-ID": activeOrg.id,
      },
      body: JSON.stringify({ action }),
    });
    if (res.ok) {
      const updated = await res.json();
      setFindings((prev) => prev.map((f) => (f.id === id ? { ...f, ...updated } : f)));
    }
    setApproving(null);
  }

  const packs = Array.from(new Set(findings.map((f) => f.packId)));
  const filtered = findings.filter((f) => {
    if (severityFilter !== "all" && f.severity !== severityFilter) return false;
    if (packFilter !== "all" && f.packId !== packFilter) return false;
    return true;
  });

  const criticalCount = findings.filter((f) => f.severity === "critical").length;
  const highCount = findings.filter((f) => f.severity === "high").length;
  const unreviewedCount = findings.filter((f) => !f.approvedStatus).length;

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-red-600 text-white">
            <AlertTriangle className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-gray-900">Findings</h1>
            <p className="text-sm text-gray-500">All pre-assessment findings across all scan runs for this organization</p>
          </div>
        </div>
        <button onClick={() => { setLoaded(false); load(); }} className="rounded-md border border-gray-200 p-2 text-gray-400 hover:bg-gray-50">
          <RefreshCw className="h-4 w-4" />
        </button>
      </div>

      {loaded && findings.length > 0 && (
        <div className="grid grid-cols-3 gap-3">
          <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-center">
            <p className="text-2xl font-bold text-red-700">{criticalCount}</p>
            <p className="text-xs text-red-600 mt-0.5">Critical</p>
          </div>
          <div className="rounded-xl border border-orange-200 bg-orange-50 p-4 text-center">
            <p className="text-2xl font-bold text-orange-700">{highCount}</p>
            <p className="text-xs text-orange-600 mt-0.5">High</p>
          </div>
          <div className="rounded-xl border border-gray-200 bg-white p-4 text-center">
            <p className="text-2xl font-bold text-gray-700">{unreviewedCount}</p>
            <p className="text-xs text-gray-500 mt-0.5">Needs Review</p>
          </div>
        </div>
      )}

      <div className="flex items-center gap-2 flex-wrap">
        <Filter className="h-4 w-4 text-gray-400" />
        <select
          value={severityFilter}
          onChange={(e) => setSeverityFilter(e.target.value)}
          className="rounded-md border border-gray-300 px-2.5 py-1.5 text-xs text-gray-700"
        >
          <option value="all">All severities</option>
          {["critical", "high", "medium", "low", "informational"].map((s) => (
            <option key={s} value={s} className="capitalize">{s}</option>
          ))}
        </select>
        <select
          value={packFilter}
          onChange={(e) => setPackFilter(e.target.value)}
          className="rounded-md border border-gray-300 px-2.5 py-1.5 text-xs text-gray-700"
        >
          <option value="all">All packs</option>
          {packs.map((p) => (
            <option key={p} value={p} className="capitalize">{p.replace("_", " ")}</option>
          ))}
        </select>
        {(severityFilter !== "all" || packFilter !== "all") && (
          <button
            onClick={() => { setSeverityFilter("all"); setPackFilter("all"); }}
            className="text-xs text-blue-600 hover:text-blue-800"
          >
            Clear filters
          </button>
        )}
        <span className="text-xs text-gray-400 ml-auto">{filtered.length} finding{filtered.length !== 1 ? "s" : ""}</span>
      </div>

      {loading && (
        <div className="flex items-center justify-center py-20 text-gray-400">
          <RefreshCw className="mr-2 h-5 w-5 animate-spin" /> Loading…
        </div>
      )}

      {loaded && findings.length === 0 && (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-gray-300 bg-gray-50 py-20 text-center">
          <CheckCircle2 className="h-12 w-12 text-gray-300 mb-4" />
          <p className="text-base font-medium text-gray-700">No findings yet</p>
          <p className="text-sm text-gray-500 mt-1 max-w-sm">Run a tenant assessment to generate findings.</p>
        </div>
      )}

      <div className="space-y-3">
        {filtered.map((f) => (
          <div key={f.id} className="rounded-xl border border-gray-200 bg-white p-4 space-y-2">
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1">
                <div className="flex items-center gap-2 flex-wrap mb-1">
                  {severityBadge(f.severity)}
                  {resultBadge(f.result)}
                  <span className="text-xs text-gray-400 font-mono">{f.ruleId}</span>
                  <span className="text-xs text-gray-400 capitalize">· {f.packId.replace("_", " ")}</span>
                  {f.approvedStatus === "approved" && (
                    <span className="inline-flex items-center gap-1 text-xs bg-green-100 text-green-700 rounded-full px-2 py-0.5">
                      <CheckCircle2 className="h-3 w-3" /> Acknowledged
                    </span>
                  )}
                  {f.approvedStatus === "rejected" && (
                    <span className="inline-flex items-center gap-1 text-xs bg-gray-100 text-gray-500 rounded-full px-2 py-0.5">
                      <XCircle className="h-3 w-3" /> Dismissed
                    </span>
                  )}
                </div>
                <h3 className="font-medium text-gray-900 text-sm">{f.title}</h3>
                <p className="text-xs text-gray-400 mt-0.5">{new Date(f.createdAt).toLocaleDateString()}</p>
              </div>
              {!f.approvedStatus && (
                <div className="flex gap-1 shrink-0">
                  <button
                    onClick={() => takeAction(f.id, "approve")}
                    disabled={approving === f.id}
                    className="inline-flex items-center gap-1 rounded border border-green-200 bg-green-50 px-2.5 py-1 text-xs text-green-700 hover:bg-green-100 disabled:opacity-50"
                  >
                    {approving === f.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <CheckCircle2 className="h-3 w-3" />}
                    Acknowledge
                  </button>
                  <button
                    onClick={() => takeAction(f.id, "reject")}
                    disabled={approving === f.id}
                    className="inline-flex items-center gap-1 rounded border border-gray-200 px-2.5 py-1 text-xs text-gray-500 hover:bg-gray-50 disabled:opacity-50"
                  >
                    Dismiss
                  </button>
                </div>
              )}
            </div>
            {f.observedCondition && (
              <p className="text-xs text-gray-600">
                <span className="font-medium text-gray-700">Observed: </span>{f.observedCondition}
              </p>
            )}
            {f.recommendedRemediation && (
              <p className="text-xs text-gray-600">
                <span className="font-medium text-gray-700">Remediation: </span>{f.recommendedRemediation}
              </p>
            )}
            {f.linkedControlIds.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {f.linkedControlIds.map((c) => (
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
