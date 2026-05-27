import { useState, useCallback } from "react";
import {
  AlertTriangle, RefreshCw, CheckCircle2, XCircle, Filter,
  Loader2, ChevronDown, ChevronRight, Map, FileText, Users,
  Key, Lock, Cpu, BookOpen, TrendingUp, Shield,
} from "lucide-react";
import { useOrg } from "@/context/OrgContext";
import { useLocation } from "wouter";

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
  affectedItems: string[] | null;
  linkedControlIds: string[];
  recommendedRemediation: string | null;
  suggestedRoadmapAction: string | null;
  approvedStatus: string | null;
  createdAt: string;
};

const SEVERITY_ORDER: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3, informational: 4 };

const PACK_NAMES: Record<string, string> = {
  identity: "Identity Pack",
  authentication: "Authentication Pack",
  conditional_access: "Conditional Access Pack",
  devices: "Device / Intune Pack",
  audit: "Audit / Sign-in Pack",
  secure_score: "Security Score Pack",
};

const PACK_ICONS: Record<string, React.ReactNode> = {
  identity: <Users className="h-3.5 w-3.5" />,
  authentication: <Key className="h-3.5 w-3.5" />,
  conditional_access: <Lock className="h-3.5 w-3.5" />,
  devices: <Cpu className="h-3.5 w-3.5" />,
  audit: <BookOpen className="h-3.5 w-3.5" />,
  secure_score: <TrendingUp className="h-3.5 w-3.5" />,
};

function severityBadge(s: string) {
  const m: Record<string, string> = {
    critical: "bg-red-100 text-red-700 border border-red-200",
    high: "bg-orange-100 text-orange-700 border border-orange-200",
    medium: "bg-yellow-100 text-yellow-700 border border-yellow-200",
    low: "bg-blue-100 text-blue-700 border border-blue-200",
    informational: "bg-gray-100 text-gray-600 border border-gray-200",
  };
  return (
    <span className={`inline-flex items-center rounded px-2 py-0.5 text-xs font-semibold uppercase tracking-wide ${m[s] ?? m.informational}`}>
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
  const labels: Record<string, string> = { fail: "Gap", partial: "Partial", unknown: "Unknown", pass: "Pass" };
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${m[r] ?? m.unknown}`}>
      {labels[r] ?? r}
    </span>
  );
}

export default function PaFindings() {
  const { activeOrg } = useOrg();
  const [, navigate] = useLocation();
  const [findings, setFindings] = useState<Finding[]>([]);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [severityFilter, setSeverityFilter] = useState("all");
  const [packFilter, setPackFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [approving, setApproving] = useState<string | null>(null);
  const [expandedFindings, setExpandedFindings] = useState<Set<string>>(new Set());
  const [dismissingId, setDismissingId] = useState<string | null>(null);
  const [dismissReason, setDismissReason] = useState("");

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
    setDismissingId(null);
    setDismissReason("");
  }

  function toggleExpand(id: string) {
    setExpandedFindings((prev) => {
      const s = new Set(prev);
      s.has(id) ? s.delete(id) : s.add(id);
      return s;
    });
  }

  const packs = Array.from(new Set(findings.map((f) => f.packId)));
  const filtered = findings.filter((f) => {
    if (severityFilter !== "all" && f.severity !== severityFilter) return false;
    if (packFilter !== "all" && f.packId !== packFilter) return false;
    if (statusFilter === "open" && f.approvedStatus) return false;
    if (statusFilter === "acknowledged" && f.approvedStatus !== "approved") return false;
    if (statusFilter === "dismissed" && f.approvedStatus !== "rejected") return false;
    return true;
  });

  const criticalCount = findings.filter((f) => f.severity === "critical").length;
  const highCount = findings.filter((f) => f.severity === "high").length;
  const unreviewedCount = findings.filter((f) => !f.approvedStatus).length;

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-5">
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-red-600 text-white">
            <AlertTriangle className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-gray-900">Findings</h1>
            <p className="text-sm text-gray-500">All pre-assessment findings across scan runs for this organization</p>
          </div>
        </div>
        <button onClick={() => { setLoaded(false); load(); }} className="rounded-md border border-gray-200 p-2 text-gray-400 hover:bg-gray-50">
          <RefreshCw className="h-4 w-4" />
        </button>
      </div>

      {loaded && findings.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-center">
            <p className="text-2xl font-bold text-red-700">{criticalCount}</p>
            <p className="text-xs text-red-600 mt-0.5">Critical</p>
          </div>
          <div className="rounded-xl border border-orange-200 bg-orange-50 p-4 text-center">
            <p className="text-2xl font-bold text-orange-700">{highCount}</p>
            <p className="text-xs text-orange-600 mt-0.5">High</p>
          </div>
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-center">
            <p className="text-2xl font-bold text-amber-700">{unreviewedCount}</p>
            <p className="text-xs text-amber-600 mt-0.5">Needs Review</p>
          </div>
          <div className="rounded-xl border border-gray-200 bg-white p-4 text-center">
            <p className="text-2xl font-bold text-green-700">{findings.filter((f) => f.approvedStatus === "approved").length}</p>
            <p className="text-xs text-gray-500 mt-0.5">Acknowledged</p>
          </div>
        </div>
      )}

      <div className="rounded-xl border border-gray-200 bg-white p-3 space-y-2.5">
        <div className="flex items-center gap-2 flex-wrap">
          <Filter className="h-3.5 w-3.5 text-gray-400" />
          <span className="text-xs text-gray-500 font-medium">Severity:</span>
          <select
            value={severityFilter}
            onChange={(e) => setSeverityFilter(e.target.value)}
            className="rounded-md border border-gray-200 px-2.5 py-1 text-xs text-gray-700 bg-white"
          >
            <option value="all">All severities</option>
            {["critical", "high", "medium", "low", "informational"].map((s) => (
              <option key={s} value={s} className="capitalize">{s}</option>
            ))}
          </select>
          <span className="text-xs text-gray-500 font-medium">Pack:</span>
          <select
            value={packFilter}
            onChange={(e) => setPackFilter(e.target.value)}
            className="rounded-md border border-gray-200 px-2.5 py-1 text-xs text-gray-700 bg-white"
          >
            <option value="all">All packs</option>
            {packs.map((p) => (
              <option key={p} value={p}>{PACK_NAMES[p] ?? p}</option>
            ))}
          </select>
          <span className="text-xs text-gray-500 font-medium">Status:</span>
          {["all", "open", "acknowledged", "dismissed"].map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`rounded-full px-2.5 py-1 text-xs font-medium transition-colors capitalize ${
                statusFilter === s ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
              }`}
            >
              {s}
            </button>
          ))}
          {(severityFilter !== "all" || packFilter !== "all" || statusFilter !== "all") && (
            <button
              onClick={() => { setSeverityFilter("all"); setPackFilter("all"); setStatusFilter("all"); }}
              className="text-xs text-blue-600 hover:text-blue-800"
            >
              Clear
            </button>
          )}
          <span className="text-xs text-gray-400 ml-auto">{filtered.length} finding{filtered.length !== 1 ? "s" : ""}</span>
        </div>
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
        {filtered.map((f) => {
          const isExpanded = expandedFindings.has(f.id);
          const isDismissing = dismissingId === f.id;
          const hasAffected = f.affectedItems && f.affectedItems.length > 0;

          return (
            <div key={f.id} className={`rounded-xl border bg-white overflow-hidden ${
              f.severity === "critical" ? "border-l-4 border-l-red-500 border-red-100" :
              f.severity === "high" ? "border-l-4 border-l-orange-500 border-orange-100" :
              "border-gray-200"
            }`}>
              <div className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1.5">
                      {severityBadge(f.severity)}
                      {resultBadge(f.result)}
                      <span className="text-xs text-gray-400 font-mono">{f.ruleId}</span>
                      <span className="inline-flex items-center gap-1 text-xs text-gray-400">
                        {PACK_ICONS[f.packId] ?? <Shield className="h-3 w-3" />}
                        {PACK_NAMES[f.packId] ?? f.packId}
                      </span>
                      {f.approvedStatus === "approved" && (
                        <span className="inline-flex items-center gap-1 text-xs bg-green-100 text-green-700 rounded-full px-2 py-0.5 font-medium">
                          <CheckCircle2 className="h-3 w-3" /> Acknowledged
                        </span>
                      )}
                      {f.approvedStatus === "rejected" && (
                        <span className="inline-flex items-center gap-1 text-xs bg-gray-100 text-gray-500 rounded-full px-2 py-0.5">
                          <XCircle className="h-3 w-3" /> Dismissed
                        </span>
                      )}
                    </div>
                    <h3 className="font-semibold text-gray-900 text-sm leading-snug">{f.title}</h3>
                    <div className="flex items-center gap-3 mt-0.5">
                      {f.affectedCount > 0 && (
                        <p className="text-xs text-gray-500">
                          <span className="font-medium">{f.affectedCount}</span> affected object{f.affectedCount !== 1 ? "s" : ""}
                        </p>
                      )}
                      <p className="text-xs text-gray-400">{new Date(f.createdAt).toLocaleDateString()}</p>
                    </div>
                  </div>

                  {!f.approvedStatus && (
                    <div className="flex gap-1 shrink-0 flex-wrap justify-end">
                      <button
                        onClick={() => takeAction(f.id, "approve")}
                        disabled={approving === f.id}
                        className="inline-flex items-center gap-1 rounded border border-green-200 bg-green-50 px-2.5 py-1 text-xs text-green-700 hover:bg-green-100 disabled:opacity-50"
                      >
                        {approving === f.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <CheckCircle2 className="h-3 w-3" />}
                        Acknowledge
                      </button>
                      <button
                        onClick={() => navigate("/poams")}
                        className="inline-flex items-center gap-1 rounded border border-blue-200 bg-blue-50 px-2.5 py-1 text-xs text-blue-700 hover:bg-blue-100"
                      >
                        <FileText className="h-3 w-3" />
                        Create POA&M
                      </button>
                      <button
                        onClick={() => navigate("/pre-assessment/roadmap")}
                        className="inline-flex items-center gap-1 rounded border border-purple-200 bg-purple-50 px-2.5 py-1 text-xs text-purple-700 hover:bg-purple-100"
                      >
                        <Map className="h-3 w-3" />
                        Roadmap
                      </button>
                      <button
                        onClick={() => { setDismissingId(f.id); setDismissReason(""); }}
                        className="inline-flex items-center gap-1 rounded border border-gray-200 px-2.5 py-1 text-xs text-gray-500 hover:bg-gray-50"
                      >
                        Dismiss
                      </button>
                    </div>
                  )}
                </div>

                {f.observedCondition && (
                  <div className="mt-2 text-xs text-gray-600 bg-gray-50 rounded-md px-3 py-2">
                    <span className="font-semibold text-gray-700">Observed: </span>{f.observedCondition}
                  </div>
                )}

                {f.recommendedRemediation && (
                  <div className="mt-2 text-xs text-gray-600">
                    <span className="font-semibold text-gray-700">Remediation: </span>{f.recommendedRemediation}
                  </div>
                )}

                {f.suggestedRoadmapAction && (
                  <div className="mt-2 text-xs text-purple-700 bg-purple-50 rounded-md px-3 py-2">
                    <span className="font-semibold">Roadmap: </span>{f.suggestedRoadmapAction}
                  </div>
                )}

                {f.linkedControlIds.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-2">
                    {f.linkedControlIds.map((c) => (
                      <span key={c} className="rounded bg-blue-50 border border-blue-100 px-1.5 py-0.5 text-[10px] font-mono text-blue-700">{c}</span>
                    ))}
                  </div>
                )}

                {hasAffected && (
                  <button
                    onClick={() => toggleExpand(f.id)}
                    className="mt-2 flex items-center gap-1.5 text-xs text-blue-600 hover:text-blue-800"
                  >
                    {isExpanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                    {isExpanded ? "Hide" : "Show"} affected objects ({f.affectedItems!.length})
                  </button>
                )}

                {isDismissing && (
                  <div className="mt-3 rounded-lg border border-gray-200 bg-gray-50 p-3 space-y-2">
                    <label className="text-xs font-medium text-gray-700">Reason for dismissal (optional)</label>
                    <textarea
                      value={dismissReason}
                      onChange={(e) => setDismissReason(e.target.value)}
                      rows={2}
                      placeholder="e.g. Not applicable to our environment, acceptable risk…"
                      className="w-full rounded border border-gray-300 px-2 py-1.5 text-xs text-gray-700 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 resize-none"
                    />
                    <div className="flex gap-2">
                      <button
                        onClick={() => takeAction(f.id, "reject")}
                        disabled={approving === f.id}
                        className="rounded border border-red-200 bg-red-50 px-3 py-1 text-xs text-red-700 hover:bg-red-100 disabled:opacity-50"
                      >
                        {approving === f.id && <Loader2 className="h-3 w-3 animate-spin inline mr-1" />}
                        Confirm Dismiss
                      </button>
                      <button
                        onClick={() => { setDismissingId(null); setDismissReason(""); }}
                        className="rounded border border-gray-200 px-3 py-1 text-xs text-gray-500 hover:bg-gray-100"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {isExpanded && hasAffected && (
                <div className="border-t border-gray-100 bg-gray-50 px-4 py-3">
                  <p className="text-xs font-semibold text-gray-600 mb-2">Affected Objects</p>
                  <div className="flex flex-wrap gap-1.5 max-h-48 overflow-y-auto">
                    {f.affectedItems!.map((item, i) => (
                      <span key={i} className="rounded bg-white border border-gray-200 px-2 py-0.5 text-xs font-mono text-gray-700">
                        {item}
                      </span>
                    ))}
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
