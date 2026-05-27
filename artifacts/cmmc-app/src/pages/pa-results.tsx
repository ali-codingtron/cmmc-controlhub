import { useState, useCallback } from "react";
import { useLocation } from "wouter";
import {
  CheckCircle2, XCircle, Clock, AlertTriangle, Activity,
  ChevronLeft, RefreshCw, ShieldCheck, FileText,
  ClipboardList, Map, Loader2,
} from "lucide-react";
import { useOrg } from "@/context/OrgContext";

type ScanRun = {
  id: string;
  scanName: string;
  status: string;
  packsCompleted: string[];
  packsFailed: string[];
  startedAt: string | null;
  completedAt: string | null;
  totalChecks: number;
  passedChecks: number;
  failedChecks: number;
  warnings: number;
  unknowns: number;
  generatedFindingCount: number;
  generatedEvidenceCount: number;
  generatedEvidenceRequestCount: number;
  createdAt: string;
};

type Finding = {
  id: string;
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
};

type EvidenceRecord = {
  id: string;
  packId: string;
  title: string;
  description: string | null;
  evidenceType: string;
  source: string;
  status: string;
  linkedControlIds: string[];
  assessorSummary: string | null;
  collectedAt: string;
};

type RoadmapAction = {
  id: string;
  category: string;
  title: string;
  description: string | null;
  priority: number;
  linkedControlIds: string[];
  status: string;
};

const SEVERITY_ORDER: Record<string, number> = {
  critical: 0, high: 1, medium: 2, low: 3, informational: 4,
};

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
    pass: "bg-green-100 text-green-700",
    fail: "bg-red-100 text-red-700",
    partial: "bg-yellow-100 text-yellow-700",
    unknown: "bg-gray-100 text-gray-500",
    not_applicable: "bg-slate-100 text-slate-500",
  };
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium capitalize ${m[r] ?? m.unknown}`}>
      {r.replace("_", " ")}
    </span>
  );
}

const TABS = ["Summary", "Findings", "Evidence Records", "Evidence Requests", "Roadmap"] as const;
type Tab = (typeof TABS)[number];

export default function PaResults({ id }: { id: string }) {
  const [, navigate] = useLocation();
  const { activeOrg } = useOrg();
  const [scan, setScan] = useState<ScanRun | null>(null);
  const [findings, setFindings] = useState<Finding[]>([]);
  const [evidenceRecords, setEvidenceRecords] = useState<EvidenceRecord[]>([]);
  const [evidenceRequests, setEvidenceRequests] = useState<{ id: string; title: string; linkedControlIds: string[]; instructions: string | null; status: string; ownerEmail: string | null; dueDate: string | null }[]>([]);
  const [roadmapActions, setRoadmapActions] = useState<RoadmapAction[]>([]);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [activeTab, setActiveTab] = useState<Tab>("Summary");
  const [approving, setApproving] = useState<string | null>(null);
  const [pollingInterval, setPollingInterval] = useState<ReturnType<typeof setInterval> | null>(null);

  const loadData = useCallback((quiet = false) => {
    if (!activeOrg) return;
    if (!quiet) setLoading(true);
    const token = localStorage.getItem("auth_token");
    fetch(`/api/pre-assessment/scans/${id}`, {
      headers: { Authorization: `Bearer ${token}`, "X-Organization-ID": activeOrg.id },
    })
      .then((r) => r.json())
      .then((d) => {
        setScan(d.scan);
        setFindings((d.findings ?? []).sort((a: Finding, b: Finding) =>
          (SEVERITY_ORDER[a.severity] ?? 99) - (SEVERITY_ORDER[b.severity] ?? 99)
        ));
        setEvidenceRecords(d.evidenceRecords ?? []);
        setEvidenceRequests(d.evidenceRequests ?? []);
        setRoadmapActions(d.roadmapActions ?? []);
        setLoaded(true);
        setLoading(false);

        if (d.scan?.status === "running" || d.scan?.status === "not_started") {
          if (!pollingInterval) {
            const interval = setInterval(() => loadData(true), 3000);
            setPollingInterval(interval);
          }
        } else {
          if (pollingInterval) {
            clearInterval(pollingInterval);
            setPollingInterval(null);
          }
        }
      })
      .catch(() => { setLoading(false); setLoaded(true); });
  }, [activeOrg, id, pollingInterval]);

  if (!loaded && !loading && activeOrg) loadData();

  async function approveFinding(findingId: string, action: "approve" | "reject") {
    if (!activeOrg) return;
    setApproving(findingId);
    const token = localStorage.getItem("auth_token");
    const res = await fetch(`/api/pre-assessment/findings/${findingId}`, {
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
      setFindings((prev) => prev.map((f) => (f.id === findingId ? { ...f, ...updated } : f)));
    }
    setApproving(null);
  }

  if (loading && !scan) {
    return (
      <div className="flex items-center justify-center py-32 text-gray-400">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Loading assessment results…
      </div>
    );
  }

  if (loaded && !scan) {
    return (
      <div className="p-6 text-center text-gray-500">Assessment not found.</div>
    );
  }

  const isRunning = scan?.status === "running" || scan?.status === "not_started";
  const passRate = scan && scan.totalChecks > 0
    ? Math.round((scan.passedChecks / scan.totalChecks) * 100)
    : 0;

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <div className="flex items-center gap-2">
        <button onClick={() => navigate("/pre-assessment/history")} className="text-gray-400 hover:text-gray-700">
          <ChevronLeft className="h-5 w-5" />
        </button>
        <div className="flex-1 min-w-0">
          <h1 className="text-lg font-semibold text-gray-900 truncate">{scan?.scanName}</h1>
          <p className="text-xs text-gray-400">
            {scan?.completedAt
              ? `Completed ${new Date(scan.completedAt).toLocaleString()}`
              : scan?.startedAt
              ? `Started ${new Date(scan.startedAt).toLocaleString()}`
              : `Created ${scan ? new Date(scan.createdAt).toLocaleString() : ""}`}
          </p>
        </div>
        {isRunning && (
          <div className="flex items-center gap-2 rounded-full bg-blue-50 border border-blue-200 px-3 py-1.5 text-xs text-blue-700">
            <Activity className="h-3.5 w-3.5 animate-pulse" /> Scan in progress…
          </div>
        )}
        <button onClick={() => { setLoaded(false); loadData(); }} className="text-gray-400 hover:text-gray-700 p-1.5 rounded-md hover:bg-gray-100">
          <RefreshCw className="h-4 w-4" />
        </button>
      </div>

      {isRunning && (
        <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-700">
          The scan is running in the background. This page will auto-refresh.
        </div>
      )}

      {scan?.status === "failed" && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 flex items-start gap-2">
          <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
          <div>
            <strong>Scan failed.</strong> Check your tenant connection credentials and permissions, then re-run the assessment.
          </div>
        </div>
      )}

      {!isRunning && scan && (
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3">
          {[
            { label: "Checks Run", value: scan.totalChecks, icon: <ShieldCheck className="h-4 w-4" />, cls: "text-gray-700" },
            { label: "Passed", value: scan.passedChecks, icon: <CheckCircle2 className="h-4 w-4" />, cls: "text-green-700" },
            { label: "Gaps Found", value: scan.failedChecks, icon: <XCircle className="h-4 w-4" />, cls: "text-red-600" },
            { label: "Unknown", value: scan.unknowns, icon: <Clock className="h-4 w-4" />, cls: "text-gray-500" },
            { label: "Findings", value: scan.generatedFindingCount, icon: <AlertTriangle className="h-4 w-4" />, cls: "text-orange-600" },
            { label: "Evidence", value: scan.generatedEvidenceCount, icon: <FileText className="h-4 w-4" />, cls: "text-blue-600" },
          ].map((kpi) => (
            <div key={kpi.label} className="rounded-xl border border-gray-200 bg-white p-4 text-center">
              <div className={`flex items-center justify-center mb-1 ${kpi.cls}`}>{kpi.icon}</div>
              <p className="text-2xl font-bold text-gray-900">{kpi.value}</p>
              <p className="text-xs text-gray-500 mt-0.5">{kpi.label}</p>
            </div>
          ))}
        </div>
      )}

      {!isRunning && scan && scan.totalChecks > 0 && (
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-gray-700">Readiness Score</span>
            <span className="text-sm font-bold text-gray-900">{passRate}%</span>
          </div>
          <div className="h-3 w-full rounded-full bg-gray-100 overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${passRate >= 70 ? "bg-green-500" : passRate >= 40 ? "bg-yellow-500" : "bg-red-500"}`}
              style={{ width: `${passRate}%` }}
            />
          </div>
          <div className="flex gap-4 mt-2 text-xs text-gray-500">
            <span className="flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-full bg-green-500" />{scan.passedChecks} Passed</span>
            <span className="flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-full bg-red-500" />{scan.failedChecks} Gaps</span>
            <span className="flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-full bg-gray-300" />{scan.unknowns} Unknown</span>
          </div>
        </div>
      )}

      <div className="border-b border-gray-200">
        <nav className="flex gap-1">
          {TABS.map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors -mb-px ${
                activeTab === tab
                  ? "border-blue-600 text-blue-600"
                  : "border-transparent text-gray-500 hover:text-gray-700"
              }`}
            >
              {tab}
              {tab === "Findings" && findings.length > 0 && (
                <span className="ml-1.5 rounded-full bg-red-100 px-1.5 py-0.5 text-xs text-red-700">{findings.length}</span>
              )}
            </button>
          ))}
        </nav>
      </div>

      {activeTab === "Summary" && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="rounded-xl border border-gray-200 bg-white p-4">
              <h3 className="text-sm font-semibold text-gray-800 mb-3">Packs Completed</h3>
              <div className="space-y-1.5">
                {scan?.packsCompleted?.map((p) => (
                  <div key={p} className="flex items-center gap-2 text-sm">
                    <CheckCircle2 className="h-4 w-4 text-green-600 shrink-0" />
                    <span className="text-gray-700 capitalize">{p.replace("_", " ")}</span>
                  </div>
                ))}
                {scan?.packsFailed?.map((p) => (
                  <div key={p} className="flex items-center gap-2 text-sm">
                    <XCircle className="h-4 w-4 text-red-500 shrink-0" />
                    <span className="text-gray-700 capitalize">{p.replace("_", " ")} — failed</span>
                  </div>
                ))}
                {(!scan?.packsCompleted?.length && !scan?.packsFailed?.length) && (
                  <p className="text-sm text-gray-400">No packs data available.</p>
                )}
              </div>
            </div>

            <div className="rounded-xl border border-gray-200 bg-white p-4">
              <h3 className="text-sm font-semibold text-gray-800 mb-3">Findings by Severity</h3>
              {findings.length === 0 ? (
                <p className="text-sm text-gray-400">No findings generated.</p>
              ) : (
                <div className="space-y-2">
                  {["critical", "high", "medium", "low", "informational"].map((sev) => {
                    const count = findings.filter((f) => f.severity === sev).length;
                    if (count === 0) return null;
                    return (
                      <div key={sev} className="flex items-center gap-3">
                        {severityBadge(sev)}
                        <div className="flex-1 h-1.5 rounded-full bg-gray-100 overflow-hidden">
                          <div
                            className={`h-full rounded-full ${sev === "critical" ? "bg-red-500" : sev === "high" ? "bg-orange-500" : sev === "medium" ? "bg-yellow-500" : "bg-blue-400"}`}
                            style={{ width: `${Math.round((count / findings.length) * 100)}%` }}
                          />
                        </div>
                        <span className="text-sm font-medium text-gray-700 w-4 text-right">{count}</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {roadmapActions.length > 0 && (
            <div className="rounded-xl border border-gray-200 bg-white p-4">
              <h3 className="text-sm font-semibold text-gray-800 mb-3 flex items-center gap-2">
                <Map className="h-4 w-4 text-blue-600" /> Recommended Actions
              </h3>
              <div className="space-y-2">
                {roadmapActions.slice(0, 5).map((a, i) => (
                  <div key={a.id} className="flex items-start gap-3">
                    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-blue-600 text-[10px] font-bold text-white shrink-0 mt-0.5">{i + 1}</span>
                    <div>
                      <p className="text-sm font-medium text-gray-800">{a.title}</p>
                      <p className="text-xs text-gray-500 mt-0.5">{a.category}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {activeTab === "Findings" && (
        <div className="space-y-3">
          {findings.length === 0 && (
            <div className="py-12 text-center text-gray-400">
              <CheckCircle2 className="mx-auto h-10 w-10 mb-3 text-green-300" />
              <p className="text-sm font-medium text-gray-600">No findings generated</p>
              <p className="text-xs text-gray-400 mt-1">All checks passed or returned unknown results.</p>
            </div>
          )}
          {findings.map((f) => (
            <div key={f.id} className="rounded-xl border border-gray-200 bg-white p-4 space-y-2">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    {severityBadge(f.severity)}
                    {resultBadge(f.result)}
                    <span className="text-xs text-gray-400 font-mono">{f.ruleId}</span>
                    {f.approvedStatus === "approved" && (
                      <span className="text-xs bg-green-100 text-green-700 rounded-full px-2 py-0.5">Acknowledged</span>
                    )}
                    {f.approvedStatus === "rejected" && (
                      <span className="text-xs bg-gray-100 text-gray-500 rounded-full px-2 py-0.5">Dismissed</span>
                    )}
                  </div>
                  <h3 className="font-medium text-gray-900 text-sm">{f.title}</h3>
                </div>
                {!f.approvedStatus && (
                  <div className="flex gap-1 shrink-0">
                    <button
                      onClick={() => approveFinding(f.id, "approve")}
                      disabled={approving === f.id}
                      className="inline-flex items-center gap-1 rounded border border-green-200 bg-green-50 px-2.5 py-1 text-xs text-green-700 hover:bg-green-100 disabled:opacity-50"
                    >
                      {approving === f.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <CheckCircle2 className="h-3 w-3" />}
                      Acknowledge
                    </button>
                    <button
                      onClick={() => approveFinding(f.id, "reject")}
                      disabled={approving === f.id}
                      className="inline-flex items-center gap-1 rounded border border-gray-200 bg-gray-50 px-2.5 py-1 text-xs text-gray-500 hover:bg-gray-100 disabled:opacity-50"
                    >
                      Dismiss
                    </button>
                  </div>
                )}
              </div>
              {f.observedCondition && (
                <div className="text-xs text-gray-600">
                  <span className="font-medium text-gray-700">Observed: </span>{f.observedCondition}
                </div>
              )}
              {f.recommendedRemediation && (
                <div className="text-xs text-gray-600">
                  <span className="font-medium text-gray-700">Remediation: </span>{f.recommendedRemediation}
                </div>
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
      )}

      {activeTab === "Evidence Records" && (
        <div className="space-y-3">
          {evidenceRecords.length === 0 && (
            <p className="py-12 text-center text-sm text-gray-400">No evidence records generated.</p>
          )}
          {evidenceRecords.map((ev) => (
            <div key={ev.id} className="rounded-xl border border-gray-200 bg-white p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <FileText className="h-4 w-4 text-blue-500" />
                    <h3 className="text-sm font-medium text-gray-900">{ev.title}</h3>
                    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium capitalize ${ev.status === "approved" ? "bg-green-100 text-green-700" : ev.status === "pending_review" ? "bg-yellow-100 text-yellow-700" : "bg-gray-100 text-gray-500"}`}>
                      {ev.status.replace("_", " ")}
                    </span>
                  </div>
                  {ev.description && <p className="text-xs text-gray-500">{ev.description}</p>}
                </div>
                <p className="text-xs text-gray-400 shrink-0">{new Date(ev.collectedAt).toLocaleDateString()}</p>
              </div>
              <div className="mt-2 flex items-center gap-3 text-xs text-gray-400">
                <span>Source: {ev.source}</span>
                <span>Type: {ev.evidenceType}</span>
                <span className="capitalize">Pack: {ev.packId.replace("_", " ")}</span>
              </div>
              {ev.linkedControlIds.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-2">
                  {ev.linkedControlIds.slice(0, 8).map((c) => (
                    <span key={c} className="rounded bg-blue-50 px-1.5 py-0.5 text-[10px] font-mono text-blue-600">{c}</span>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {activeTab === "Evidence Requests" && (
        <div className="space-y-3">
          {evidenceRequests.length === 0 && (
            <p className="py-12 text-center text-sm text-gray-400">No evidence requests generated.</p>
          )}
          {evidenceRequests.map((er) => (
            <div key={er.id} className="rounded-xl border border-gray-200 bg-white p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <ClipboardList className="h-4 w-4 text-orange-500" />
                    <h3 className="text-sm font-medium text-gray-900">{er.title}</h3>
                    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium capitalize ${er.status === "closed" ? "bg-green-100 text-green-700" : er.status === "submitted" ? "bg-blue-100 text-blue-700" : "bg-orange-100 text-orange-700"}`}>
                      {er.status}
                    </span>
                  </div>
                  {er.instructions && <p className="text-xs text-gray-600 mt-1">{er.instructions}</p>}
                  {er.ownerEmail && <p className="text-xs text-gray-400 mt-1">Owner: {er.ownerEmail}</p>}
                </div>
              </div>
              {er.linkedControlIds.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-2">
                  {er.linkedControlIds.map((c) => (
                    <span key={c} className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-mono text-gray-600">{c}</span>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {activeTab === "Roadmap" && (
        <div className="space-y-3">
          {roadmapActions.length === 0 && (
            <p className="py-12 text-center text-sm text-gray-400">No roadmap actions generated.</p>
          )}
          {roadmapActions.map((a, i) => (
            <div key={a.id} className="rounded-xl border border-gray-200 bg-white p-4">
              <div className="flex items-start gap-3">
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-blue-600 text-xs font-bold text-white shrink-0">
                  {i + 1}
                </span>
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                    <h3 className="text-sm font-semibold text-gray-900">{a.title}</h3>
                    <span className="text-xs text-gray-400 bg-gray-100 rounded-full px-2 py-0.5">{a.category}</span>
                    <span className="text-xs text-gray-400">Priority {a.priority}</span>
                  </div>
                  {a.description && <p className="text-xs text-gray-600 mt-1">{a.description}</p>}
                  {a.linkedControlIds.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-2">
                      {a.linkedControlIds.map((c) => (
                        <span key={c} className="rounded bg-blue-50 px-1.5 py-0.5 text-[10px] font-mono text-blue-600">{c}</span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
