import { useState, useCallback } from "react";
import { useLocation } from "wouter";
import {
  CheckCircle2, XCircle, Clock, AlertTriangle, Activity,
  ChevronLeft, RefreshCw, ShieldCheck, FileText,
  ClipboardList, Map, Loader2, ChevronDown, ChevronRight,
  Shield, Key, Lock, Info, TrendingUp, Users, Cpu,
  BookOpen, AlertCircle, CircleDot, Circle,
  HelpCircle, Download,
} from "lucide-react";
import { useOrg } from "@/context/OrgContext";

const CMMC_L2_TOTAL = 110;

type ScanRun = {
  id: string;
  scanName: string;
  status: string;
  packsRequested: string[];
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
  errorMessage: string | null;
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
  affectedItems: string[] | null;
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

type EvidenceRequest = {
  id: string;
  title: string;
  linkedControlIds: string[];
  instructions: string | null;
  suggestedFilename: string | null;
  ownerEmail: string | null;
  dueDate: string | null;
  status: string;
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

const PACK_META: Record<string, { name: string; icon: React.ReactNode; permissions: string[]; license: string | null }> = {
  identity: {
    name: "Identity Pack",
    icon: <Users className="h-4 w-4" />,
    permissions: ["User.Read.All", "GroupMember.Read.All", "Directory.Read.All"],
    license: null,
  },
  authentication: {
    name: "Authentication Pack",
    icon: <Key className="h-4 w-4" />,
    permissions: ["UserAuthenticationMethod.Read.All"],
    license: "Microsoft Entra ID P1 or P2 (for full MFA data)",
  },
  conditional_access: {
    name: "Conditional Access Pack",
    icon: <Lock className="h-4 w-4" />,
    permissions: ["Policy.Read.All"],
    license: "Microsoft Entra ID P1 or P2 required",
  },
  devices: {
    name: "Device / Intune Pack",
    icon: <Cpu className="h-4 w-4" />,
    permissions: ["Device.Read.All", "DeviceManagementManagedDevices.Read.All"],
    license: "Microsoft Intune license required",
  },
  audit: {
    name: "Audit / Sign-in Pack",
    icon: <BookOpen className="h-4 w-4" />,
    permissions: ["AuditLog.Read.All"],
    license: "Microsoft Entra ID P1 or P2 required for sign-in logs",
  },
  secure_score: {
    name: "Security Score Pack",
    icon: <TrendingUp className="h-4 w-4" />,
    permissions: ["SecurityEvents.Read.All"],
    license: null,
  },
};

const SCAN_STAGES_STATIC = [
  "Initializing scan",
  "Validating tenant connection",
  "Checking granted permissions",
];
const SCAN_STAGES_POST = [
  "Generating evidence snapshots",
  "Generating findings",
  "Generating evidence requests",
  "Generating roadmap recommendations",
  "Finalizing scan results",
];

const TABS = ["Summary", "Findings", "Evidence Records", "Evidence Requests", "Roadmap", "Permissions"] as const;
type Tab = (typeof TABS)[number];

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
    pass: "bg-green-100 text-green-700",
    fail: "bg-red-100 text-red-700",
    partial: "bg-yellow-100 text-yellow-700",
    unknown: "bg-gray-100 text-gray-500",
    not_applicable: "bg-slate-100 text-slate-500",
  };
  const labels: Record<string, string> = {
    pass: "Pass", fail: "Gap", partial: "Partial", unknown: "Unknown", not_applicable: "N/A",
  };
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${m[r] ?? m.unknown}`}>
      {labels[r] ?? r}
    </span>
  );
}

function healthLabel(rate: number, totalChecks: number) {
  if (totalChecks < 3) return { label: "Insufficient Data", color: "text-gray-500", bg: "bg-gray-100" };
  if (rate >= 75) return { label: "Strong", color: "text-green-700", bg: "bg-green-100" };
  if (rate >= 50) return { label: "Moderate", color: "text-yellow-700", bg: "bg-yellow-100" };
  if (rate >= 25) return { label: "Weak", color: "text-red-700", bg: "bg-red-100" };
  return { label: "Critical Gaps", color: "text-red-800", bg: "bg-red-100" };
}

function healthBarColor(rate: number) {
  if (rate >= 75) return "bg-green-500";
  if (rate >= 50) return "bg-yellow-500";
  return "bg-red-500";
}

function packStatusPill(packId: string, completed: string[], failed: string[], findings: Finding[]) {
  const isCompleted = completed.includes(packId);
  const isFailed = failed.includes(packId);
  const packFindings = findings.filter((f) => f.packId === packId && f.result !== "pass");
  const hasCritical = packFindings.some((f) => f.severity === "critical" || f.severity === "high");

  if (isFailed) return { label: "Data Unavailable", cls: "bg-red-50 text-red-700 border-red-200" };
  if (!isCompleted) return { label: "Not Run", cls: "bg-gray-50 text-gray-500 border-gray-200" };
  if (hasCritical) return { label: "Complete — Critical Findings", cls: "bg-orange-50 text-orange-700 border-orange-200" };
  if (packFindings.length > 0) return { label: "Complete — Findings", cls: "bg-yellow-50 text-yellow-700 border-yellow-200" };
  return { label: "Complete — Passed", cls: "bg-green-50 text-green-700 border-green-200" };
}

function ScanProgressPanel({ scan }: { scan: ScanRun }) {
  const requested = scan.packsRequested ?? [];
  const completed = scan.packsCompleted ?? [];
  const failed = scan.packsFailed ?? [];
  const donePacks = completed.length + failed.length;

  const allStages: { label: string; type: "static" | "pack" | "post"; packId?: string }[] = [
    ...SCAN_STAGES_STATIC.map((s) => ({ label: s, type: "static" as const })),
    ...requested.map((p) => ({
      label: `Running ${PACK_META[p]?.name ?? p}`,
      type: "pack" as const,
      packId: p,
    })),
    ...SCAN_STAGES_POST.map((s) => ({ label: s, type: "post" as const })),
  ];

  function stageStatus(stage: typeof allStages[0]) {
    if (stage.type === "static") return "complete";
    if (stage.type === "pack" && stage.packId) {
      if (completed.includes(stage.packId) || failed.includes(stage.packId)) return failed.includes(stage.packId) ? "warning" : "complete";
      if (completed.length + failed.length < requested.length) {
        const nextIdx = requested.findIndex((p) => !completed.includes(p) && !failed.includes(p));
        if (requested[nextIdx] === stage.packId) return "running";
      }
      return "pending";
    }
    if (stage.type === "post") {
      if (donePacks >= requested.length && (scan.status === "completed" || scan.status === "completed_with_warnings")) return "complete";
      if (donePacks >= requested.length) return "running";
      return "pending";
    }
    return "pending";
  }

  return (
    <div className="rounded-xl border border-blue-200 bg-blue-50 p-5">
      <div className="flex items-center gap-2 mb-4">
        <Activity className="h-4 w-4 text-blue-600 animate-pulse" />
        <span className="text-sm font-semibold text-blue-800">Scan In Progress</span>
        <span className="text-xs text-blue-600 ml-auto">
          {donePacks}/{requested.length} packs complete
        </span>
      </div>
      <div className="space-y-2">
        {allStages.map((stage, i) => {
          const status = stageStatus(stage);
          return (
            <div key={i} className="flex items-center gap-3">
              <div className="shrink-0">
                {status === "complete" && <CheckCircle2 className="h-4 w-4 text-green-500" />}
                {status === "warning" && <AlertTriangle className="h-4 w-4 text-yellow-500" />}
                {status === "running" && <Loader2 className="h-4 w-4 text-blue-600 animate-spin" />}
                {status === "pending" && <Circle className="h-4 w-4 text-gray-300" />}
              </div>
              <span className={`text-sm ${
                status === "complete" ? "text-gray-700" :
                status === "warning" ? "text-yellow-700" :
                status === "running" ? "text-blue-800 font-medium" :
                "text-gray-400"
              }`}>
                {stage.label}
                {status === "warning" && stage.type === "pack" && stage.packId && failed.includes(stage.packId) && (
                  <span className="ml-2 text-xs text-yellow-600">— data unavailable, continuing scan</span>
                )}
              </span>
            </div>
          );
        })}
      </div>
      <p className="text-xs text-blue-600 mt-4">This page refreshes automatically. No changes are made to your tenant.</p>
    </div>
  );
}

export default function PaResults({ id }: { id: string }) {
  const [, navigate] = useLocation();
  const { activeOrg } = useOrg();
  const [scan, setScan] = useState<ScanRun | null>(null);
  const [findings, setFindings] = useState<Finding[]>([]);
  const [evidenceRecords, setEvidenceRecords] = useState<EvidenceRecord[]>([]);
  const [evidenceRequests, setEvidenceRequests] = useState<EvidenceRequest[]>([]);
  const [roadmapActions, setRoadmapActions] = useState<RoadmapAction[]>([]);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [activeTab, setActiveTab] = useState<Tab>("Summary");
  const [approving, setApproving] = useState<string | null>(null);
  const [pollingInterval, setPollingInterval] = useState<ReturnType<typeof setInterval> | null>(null);
  const [expandedFindings, setExpandedFindings] = useState<Set<string>>(new Set());
  const [dismissingId, setDismissingId] = useState<string | null>(null);
  const [dismissReason, setDismissReason] = useState("");
  const [severityFilter, setSeverityFilter] = useState("all");
  const [scopeExpanded, setScopeExpanded] = useState(false);

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

  if (loading && !scan) {
    return (
      <div className="flex items-center justify-center py-32 text-gray-400">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Loading assessment results…
      </div>
    );
  }

  if (loaded && !scan) {
    return <div className="p-6 text-center text-gray-500">Assessment not found.</div>;
  }

  const isRunning = scan?.status === "running" || scan?.status === "not_started";
  const isDone = scan?.status === "completed" || scan?.status === "completed_with_warnings";

  const passRate = scan && scan.totalChecks > 0
    ? Math.round((scan.passedChecks / scan.totalChecks) * 100) : 0;
  const confidenceRate = scan && scan.totalChecks > 0
    ? Math.round(((scan.totalChecks - scan.unknowns) / scan.totalChecks) * 100) : 0;
  const controlsTouched = Array.from(new Set([
    ...evidenceRecords.flatMap((e) => e.linkedControlIds),
    ...findings.flatMap((f) => f.linkedControlIds),
  ]));
  const controlsWithFindings = Array.from(new Set(findings.flatMap((f) => f.linkedControlIds)));
  const controlsWithEvidence = Array.from(new Set(evidenceRecords.flatMap((e) => e.linkedControlIds)));
  const controlsWithRequests = Array.from(new Set(evidenceRequests.flatMap((e) => e.linkedControlIds)));
  const health = healthLabel(passRate, scan?.totalChecks ?? 0);

  const [downloadingType, setDownloadingType] = useState<"executive" | "technical" | null>(null);

  async function downloadReport(type: "executive" | "technical") {
    if (!activeOrg) return;
    setDownloadingType(type);
    try {
      const token = localStorage.getItem("auth_token");
      const res = await fetch(`/api/pre-assessment/scans/${id}/report.pdf?type=${type}`, {
        headers: { Authorization: `Bearer ${token}`, "X-Organization-ID": activeOrg.id },
      });
      if (!res.ok) throw new Error("Failed");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${type}-report-${id.slice(0, 8)}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch {
      alert("Failed to generate report. Please try again.");
    }
    setDownloadingType(null);
  }

  const requested = scan?.packsRequested ?? [];
  const filteredFindings = findings.filter((f) =>
    severityFilter === "all" || f.severity === severityFilter
  );

  const openRequests = evidenceRequests.filter((r) => r.status === "open").length;
  const submittedRequests = evidenceRequests.filter((r) => r.status === "submitted").length;

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-5">
      <div className="flex items-center gap-2">
        <button onClick={() => navigate("/pre-assessment/history")} className="text-gray-400 hover:text-gray-700 p-1">
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
            {scan?.status === "completed_with_warnings" && " · completed with warnings"}
          </p>
        </div>
        {isRunning && (
          <div className="flex items-center gap-1.5 rounded-full bg-blue-50 border border-blue-200 px-3 py-1.5 text-xs text-blue-700">
            <Activity className="h-3.5 w-3.5 animate-pulse" /> Running…
          </div>
        )}
        {scan?.status === "completed" && (
          <span className="inline-flex items-center gap-1 rounded-full bg-green-50 border border-green-200 px-3 py-1.5 text-xs font-medium text-green-700">
            <CheckCircle2 className="h-3.5 w-3.5" /> Completed
          </span>
        )}
        {scan?.status === "completed_with_warnings" && (
          <span className="inline-flex items-center gap-1 rounded-full bg-yellow-50 border border-yellow-200 px-3 py-1.5 text-xs font-medium text-yellow-700">
            <AlertTriangle className="h-3.5 w-3.5" /> With Warnings
          </span>
        )}
        {scan?.status === "failed" && (
          <span className="inline-flex items-center gap-1 rounded-full bg-red-50 border border-red-200 px-3 py-1.5 text-xs font-medium text-red-700">
            <XCircle className="h-3.5 w-3.5" /> Failed
          </span>
        )}
        <button onClick={() => { setLoaded(false); loadData(); }} className="text-gray-400 hover:text-gray-700 p-1.5 rounded-md hover:bg-gray-100">
          <RefreshCw className="h-4 w-4" />
        </button>
        {isDone && (
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => downloadReport("executive")}
              disabled={downloadingType !== null}
              className="inline-flex items-center gap-1.5 rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-xs font-medium text-indigo-700 hover:bg-indigo-100 disabled:opacity-50 transition-colors"
            >
              {downloadingType === "executive" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
              {downloadingType === "executive" ? "Generating…" : "Executive Report"}
            </button>
            <button
              onClick={() => downloadReport("technical")}
              disabled={downloadingType !== null}
              className="inline-flex items-center gap-1.5 rounded-lg border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-medium text-blue-700 hover:bg-blue-100 disabled:opacity-50 transition-colors"
            >
              {downloadingType === "technical" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileText className="h-3.5 w-3.5" />}
              {downloadingType === "technical" ? "Generating…" : "Technical Report"}
            </button>
          </div>
        )}
      </div>

      {scan?.status === "failed" && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 flex items-start gap-2">
          <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
          <div>
            <strong>Scan failed.</strong>{" "}
            {scan.errorMessage
              ? scan.errorMessage
              : "Check your tenant connection credentials and permissions, then re-run the assessment."}
          </div>
        </div>
      )}

      {isRunning && scan && <ScanProgressPanel scan={scan} />}

      {isDone && scan && scan.totalChecks > 0 && (
        <div className="rounded-xl border border-gray-200 bg-white p-5">
          <div className="flex items-start justify-between gap-6 flex-wrap">
            <div className="flex-1 min-w-[200px]">
              <div className="flex items-baseline gap-3 mb-1">
                <span className="text-sm font-semibold text-gray-700">Tenant Scan Health</span>
                <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${health.bg} ${health.color}`}>
                  {health.label}
                </span>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-3xl font-bold text-gray-900">{passRate}%</span>
                <div className="flex-1">
                  <div className="h-2.5 w-full rounded-full bg-gray-100 overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${healthBarColor(passRate)}`}
                      style={{ width: `${passRate}%` }}
                    />
                  </div>
                  <div className="flex gap-3 mt-1 text-[11px] text-gray-400">
                    <span className="flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-full bg-green-500" />{scan.passedChecks} passed</span>
                    <span className="flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-full bg-red-500" />{scan.failedChecks} gaps</span>
                    <span className="flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-full bg-gray-300" />{scan.unknowns} unknown</span>
                  </div>
                </div>
              </div>
              <p className="text-[11px] text-gray-400 mt-2">
                Microsoft tenant technical readiness · <span className="italic">Not an official CMMC score</span>
              </p>
            </div>

            <div className="flex gap-4 flex-wrap">
              <div className="text-center min-w-[90px]">
                <p className="text-2xl font-bold text-gray-900">{confidenceRate}%</p>
                <p className="text-xs text-gray-500 mt-0.5">Assessment Confidence</p>
                <p className="text-[10px] text-gray-400">data available</p>
              </div>
              <div className="relative group cursor-help text-center min-w-[110px]">
                <p className="text-2xl font-bold text-gray-900">
                  {controlsTouched.length}
                  <span className="text-base font-normal text-gray-400"> / {CMMC_L2_TOTAL}</span>
                </p>
                <p className="text-xs text-gray-500 mt-0.5 flex items-center justify-center gap-1">
                  Controls Touched
                  <HelpCircle className="h-3 w-3 text-gray-400 shrink-0" />
                </p>
                <p className="text-[10px] text-gray-400">by tenant scan</p>
                <div className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-72 rounded-lg bg-gray-900 text-white text-xs p-3 opacity-0 group-hover:opacity-100 transition-opacity z-50 text-left leading-relaxed shadow-xl">
                  <p className="font-semibold mb-1">CMMC Controls Touched by Tenant Scan</p>
                  <p className="text-gray-300">Microsoft tenant data provided assessment signals for {controlsTouched.length} of {CMMC_L2_TOTAL} CMMC Level 2 controls. This does not mean they were fully assessed.</p>
                  <p className="text-gray-400 mt-1.5 text-[11px]">Full CMMC readiness requires SSP review, policies, procedures, evidence, interviews, testing, POA&M review, and non-Microsoft system validation.</p>
                </div>
              </div>
              <div className="text-center min-w-[90px]">
                <p className="text-2xl font-bold text-gray-900">{scan.generatedEvidenceCount}</p>
                <p className="text-xs text-gray-500 mt-0.5">Evidence Snapshots</p>
                <p className="text-[10px] text-gray-400">generated</p>
              </div>
              <div className="text-center min-w-[90px]">
                <p className="text-2xl font-bold text-orange-600">{openRequests}</p>
                <p className="text-xs text-gray-500 mt-0.5">Evidence Requests</p>
                <p className="text-[10px] text-gray-400">open</p>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="border-b border-gray-200">
        <nav className="flex gap-0 overflow-x-auto">
          {TABS.map((tab) => {
            const badge =
              tab === "Findings" && findings.length > 0 ? findings.length :
              tab === "Evidence Requests" && openRequests > 0 ? openRequests :
              null;
            return (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`whitespace-nowrap px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px flex items-center gap-1.5 ${
                  activeTab === tab
                    ? "border-blue-600 text-blue-600"
                    : "border-transparent text-gray-500 hover:text-gray-700"
                }`}
              >
                {tab}
                {badge !== null && (
                  <span className={`rounded-full px-1.5 py-0.5 text-xs ${tab === "Findings" ? "bg-red-100 text-red-700" : "bg-orange-100 text-orange-700"}`}>
                    {badge}
                  </span>
                )}
              </button>
            );
          })}
        </nav>
      </div>

      {activeTab === "Summary" && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="rounded-xl border border-gray-200 bg-white p-4">
              <h3 className="text-sm font-semibold text-gray-800 mb-3">Assessment Packs</h3>
              <div className="space-y-2">
                {requested.map((packId) => {
                  const meta = PACK_META[packId];
                  const pill = packStatusPill(packId, scan?.packsCompleted ?? [], scan?.packsFailed ?? [], findings);
                  const packFindings = findings.filter((f) => f.packId === packId);
                  return (
                    <div key={packId} className="flex items-center gap-3">
                      <div className="text-gray-400 shrink-0">{meta?.icon ?? <Shield className="h-4 w-4" />}</div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-gray-800 truncate">{meta?.name ?? packId}</p>
                        {packFindings.length > 0 && (
                          <p className="text-[11px] text-gray-400">{packFindings.length} finding{packFindings.length !== 1 ? "s" : ""}</p>
                        )}
                      </div>
                      <span className={`shrink-0 inline-flex items-center rounded border px-2 py-0.5 text-[11px] font-medium whitespace-nowrap ${pill.cls}`}>
                        {pill.label}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="rounded-xl border border-gray-200 bg-white p-4">
              <h3 className="text-sm font-semibold text-gray-800 mb-3">Findings by Severity</h3>
              {findings.length === 0 ? (
                <div className="py-4 text-center">
                  <CheckCircle2 className="mx-auto h-8 w-8 text-green-300 mb-2" />
                  <p className="text-sm text-gray-500">No findings generated</p>
                </div>
              ) : (
                <div className="space-y-2.5">
                  {["critical", "high", "medium", "low", "informational"].map((sev) => {
                    const count = findings.filter((f) => f.severity === sev).length;
                    if (count === 0) return null;
                    return (
                      <div key={sev} className="flex items-center gap-3">
                        {severityBadge(sev)}
                        <div className="flex-1 h-1.5 rounded-full bg-gray-100 overflow-hidden">
                          <div
                            className={`h-full rounded-full ${sev === "critical" ? "bg-red-500" : sev === "high" ? "bg-orange-500" : sev === "medium" ? "bg-yellow-500" : sev === "low" ? "bg-blue-400" : "bg-gray-400"}`}
                            style={{ width: `${Math.round((count / findings.length) * 100)}%` }}
                          />
                        </div>
                        <span className="text-sm font-semibold text-gray-700 w-5 text-right">{count}</span>
                      </div>
                    );
                  })}
                  <div className="pt-1 border-t border-gray-100 flex justify-between text-xs text-gray-400">
                    <span>{findings.filter((f) => !f.approvedStatus).length} needs review</span>
                    <span>{findings.filter((f) => f.approvedStatus === "approved").length} acknowledged</span>
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: "Checks Run", value: scan?.totalChecks ?? 0, icon: <ShieldCheck className="h-4 w-4" />, cls: "text-gray-600" },
              { label: "Passed", value: scan?.passedChecks ?? 0, icon: <CheckCircle2 className="h-4 w-4" />, cls: "text-green-600" },
              { label: "Gaps Found", value: scan?.failedChecks ?? 0, icon: <XCircle className="h-4 w-4" />, cls: "text-red-600" },
              { label: "Unknown / No Data", value: scan?.unknowns ?? 0, icon: <Clock className="h-4 w-4" />, cls: "text-gray-400" },
            ].map((kpi) => (
              <div key={kpi.label} className="rounded-xl border border-gray-200 bg-white p-4 text-center">
                <div className={`flex items-center justify-center mb-1.5 ${kpi.cls}`}>{kpi.icon}</div>
                <p className="text-2xl font-bold text-gray-900">{kpi.value}</p>
                <p className="text-xs text-gray-500 mt-0.5">{kpi.label}</p>
              </div>
            ))}
          </div>

          <div className="rounded-xl border border-gray-200 bg-white p-4">
            <h3 className="text-sm font-semibold text-gray-800 mb-3 flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-blue-600" /> Assessment Coverage
            </h3>
            <div className="space-y-1.5">
              {[
                { label: "Total CMMC Level 2 Controls", value: CMMC_L2_TOTAL, cls: "text-gray-700", bar: false },
                { label: "Controls touched by tenant scan", value: controlsTouched.length, cls: "text-blue-700", bar: true, color: "bg-blue-500" },
                { label: "Controls NOT assessed by tenant scan", value: CMMC_L2_TOTAL - controlsTouched.length, cls: "text-red-700", bar: true, color: "bg-red-400" },
                { label: "Controls with findings (gaps identified)", value: controlsWithFindings.length, cls: "text-orange-700", bar: true, color: "bg-orange-500" },
                { label: "Controls with evidence snapshots", value: controlsWithEvidence.length, cls: "text-green-700", bar: true, color: "bg-green-500" },
                { label: "Controls with evidence requests", value: controlsWithRequests.length, cls: "text-yellow-700", bar: true, color: "bg-yellow-500" },
                { label: "Controls requiring manual review (not touched)", value: CMMC_L2_TOTAL - controlsTouched.length, cls: "text-gray-500", bar: false },
              ].map((row) => (
                <div key={row.label} className="flex items-center gap-3 py-1 border-b border-gray-50 last:border-0">
                  <span className="flex-1 text-xs text-gray-600">{row.label}</span>
                  {row.bar && (
                    <div className="w-16 h-1.5 rounded-full bg-gray-100 overflow-hidden">
                      <div className={`h-full rounded-full ${row.color}`} style={{ width: `${Math.round((row.value / CMMC_L2_TOTAL) * 100)}%` }} />
                    </div>
                  )}
                  <span className={`text-sm font-bold w-8 text-right ${row.cls}`}>{row.value}</span>
                </div>
              ))}
            </div>
            <p className="text-[11px] text-gray-400 mt-3">
              Microsoft tenant data provided assessment signals for <strong>{controlsTouched.length}</strong> of <strong>{CMMC_L2_TOTAL}</strong> CMMC Level 2 controls.
              The remaining <strong>{CMMC_L2_TOTAL - controlsTouched.length}</strong> require SSP review, policies, interviews, and manual assessment.
            </p>
          </div>

          {roadmapActions.length > 0 && (
            <div className="rounded-xl border border-gray-200 bg-white p-4">
              <h3 className="text-sm font-semibold text-gray-800 mb-3 flex items-center gap-2">
                <Map className="h-4 w-4 text-blue-600" /> Top Recommended Actions
              </h3>
              <div className="space-y-2">
                {roadmapActions.slice(0, 5).map((a, i) => (
                  <div key={a.id} className="flex items-start gap-3 py-1.5 border-b border-gray-50 last:border-0">
                    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-blue-600 text-[10px] font-bold text-white shrink-0 mt-0.5">{i + 1}</span>
                    <div className="flex-1">
                      <p className="text-sm font-medium text-gray-800">{a.title}</p>
                      <p className="text-xs text-gray-500">{a.category} · Priority {a.priority}</p>
                    </div>
                    <button onClick={() => setActiveTab("Roadmap")} className="text-xs text-blue-600 hover:text-blue-800 shrink-0">
                      View →
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
            <div className="flex items-start gap-2">
              <Info className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
              <div className="flex-1">
                <button
                  className="w-full flex items-center justify-between text-left"
                  onClick={() => setScopeExpanded((v) => !v)}
                >
                  <h3 className="text-sm font-semibold text-amber-800">What This Scan Evaluated &amp; Limitations</h3>
                  {scopeExpanded
                    ? <ChevronDown className="h-4 w-4 text-amber-600 shrink-0" />
                    : <ChevronRight className="h-4 w-4 text-amber-600 shrink-0" />}
                </button>
                <p className="text-sm text-amber-700 leading-relaxed mt-1">
                  This pre-assessment reviews Microsoft tenant configuration via read-only Microsoft Graph API access.{" "}
                  <strong>It does not replace a C3PAO assessment</strong> and does not fully determine CMMC compliance.
                </p>
                {scopeExpanded && (
                  <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <h4 className="text-xs font-semibold text-green-800 mb-1.5 flex items-center gap-1">
                        <CheckCircle2 className="h-3.5 w-3.5 text-green-600" /> What This Scan Evaluated
                      </h4>
                      <ul className="space-y-1">
                        {[
                          "Microsoft Entra users and guest accounts",
                          "MFA / authentication registration",
                          "Conditional Access policies",
                          "Sign-in logs and risky sign-ins",
                          "Directory audit logs",
                          "Microsoft Secure Score",
                          "Intune device inventory (if available)",
                        ].map((item) => (
                          <li key={item} className="text-xs text-gray-600 flex items-start gap-1.5">
                            <span className="text-green-500 mt-0.5 shrink-0">✓</span> {item}
                          </li>
                        ))}
                      </ul>
                    </div>
                    <div>
                      <h4 className="text-xs font-semibold text-red-800 mb-1.5 flex items-center gap-1">
                        <XCircle className="h-3.5 w-3.5 text-red-500" /> What This Scan Does Not Fully Evaluate
                      </h4>
                      <ul className="space-y-1">
                        {[
                          "SSP completeness or CUI scope",
                          "Policies and procedures",
                          "Physical security controls",
                          "Personnel security and training records",
                          "Risk management records",
                          "Incident response exercises",
                          "Backup and recovery testing",
                          "Firewall configuration (unless integrated)",
                          "Non-Microsoft systems or infrastructure",
                          "Assessor interviews or hands-on testing",
                        ].map((item) => (
                          <li key={item} className="text-xs text-gray-600 flex items-start gap-1.5">
                            <span className="text-red-400 mt-0.5 shrink-0">✗</span> {item}
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {activeTab === "Findings" && (
        <div className="space-y-4">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs text-gray-500 font-medium">Severity:</span>
            {["all", "critical", "high", "medium", "low", "informational"].map((s) => (
              <button
                key={s}
                onClick={() => setSeverityFilter(s)}
                className={`rounded-full px-3 py-1 text-xs font-medium transition-colors capitalize ${
                  severityFilter === s ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                }`}
              >
                {s === "all" ? "All" : s}
                {s !== "all" && (
                  <span className="ml-1">({findings.filter((f) => f.severity === s).length})</span>
                )}
              </button>
            ))}
            <span className="text-xs text-gray-400 ml-auto">{filteredFindings.length} finding{filteredFindings.length !== 1 ? "s" : ""}</span>
          </div>

          {filteredFindings.length === 0 && (
            <div className="py-16 text-center">
              <CheckCircle2 className="mx-auto h-10 w-10 mb-3 text-green-300" />
              <p className="text-sm font-medium text-gray-600">No findings{severityFilter !== "all" ? ` for severity: ${severityFilter}` : ""}</p>
            </div>
          )}

          {filteredFindings.map((f) => {
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
                        <span className="text-xs text-gray-400 capitalize">· {(PACK_META[f.packId]?.name ?? f.packId).replace("_", " ")}</span>
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
                      {f.affectedCount > 0 && (
                        <p className="text-xs text-gray-500 mt-0.5">
                          {f.affectedCount} affected object{f.affectedCount !== 1 ? "s" : ""}
                        </p>
                      )}
                    </div>

                    {!f.approvedStatus && (
                      <div className="flex gap-1 shrink-0 flex-wrap justify-end">
                        <button
                          onClick={() => approveFinding(f.id, "approve")}
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
                          Create POA&M
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
                          onClick={() => approveFinding(f.id, "reject")}
                          disabled={approving === f.id}
                          className="rounded border border-red-200 bg-red-50 px-3 py-1 text-xs text-red-700 hover:bg-red-100 disabled:opacity-50"
                        >
                          {approving === f.id ? <Loader2 className="h-3 w-3 animate-spin inline mr-1" /> : null}
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
                    <div className="flex flex-wrap gap-1.5 max-h-40 overflow-y-auto">
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
      )}

      {activeTab === "Evidence Records" && (
        <div className="space-y-3">
          {evidenceRecords.length === 0 && (
            <p className="py-12 text-center text-sm text-gray-400">No evidence records generated.</p>
          )}

          {evidenceRecords.length > 0 && (
            <div className="flex items-center gap-3 text-xs text-gray-500 mb-1">
              <span>{evidenceRecords.length} snapshot{evidenceRecords.length !== 1 ? "s" : ""}</span>
              <span>·</span>
              <span>{evidenceRecords.filter((e) => e.status === "approved").length} approved</span>
              <span>·</span>
              <span>{evidenceRecords.filter((e) => e.status !== "approved").length} pending review</span>
            </div>
          )}

          {evidenceRecords.map((ev) => (
            <div key={ev.id} className="rounded-xl border border-gray-200 bg-white p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                    <FileText className="h-4 w-4 text-blue-500 shrink-0" />
                    <h3 className="text-sm font-semibold text-gray-900">{ev.title}</h3>
                    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                      ev.status === "approved" ? "bg-green-100 text-green-700" :
                      ev.status === "rejected" ? "bg-red-100 text-red-700" :
                      ev.status === "draft" ? "bg-gray-100 text-gray-500" :
                      "bg-yellow-100 text-yellow-700"
                    }`}>
                      {ev.status === "approved" ? "Approved" :
                       ev.status === "rejected" ? "Rejected" :
                       ev.status === "draft" ? "System Generated · Pending Review" :
                       ev.status.replace("_", " ")}
                    </span>
                  </div>
                  {ev.description && <p className="text-xs text-gray-500 mb-2">{ev.description}</p>}
                </div>
                <p className="text-xs text-gray-400 shrink-0">{new Date(ev.collectedAt).toLocaleDateString()}</p>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs text-gray-500 bg-gray-50 rounded-md px-3 py-2 mt-1">
                <div>
                  <p className="text-[10px] font-medium text-gray-400 uppercase">Source</p>
                  <p className="text-gray-700 font-medium">{ev.source}</p>
                </div>
                <div>
                  <p className="text-[10px] font-medium text-gray-400 uppercase">Pack</p>
                  <p className="text-gray-700 capitalize">{PACK_META[ev.packId]?.name ?? ev.packId}</p>
                </div>
                <div>
                  <p className="text-[10px] font-medium text-gray-400 uppercase">Type</p>
                  <p className="text-gray-700">{ev.evidenceType}</p>
                </div>
                <div>
                  <p className="text-[10px] font-medium text-gray-400 uppercase">Collected</p>
                  <p className="text-gray-700">{new Date(ev.collectedAt).toLocaleString()}</p>
                </div>
              </div>

              {ev.linkedControlIds.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-2">
                  {ev.linkedControlIds.slice(0, 10).map((c) => (
                    <span key={c} className="rounded bg-blue-50 border border-blue-100 px-1.5 py-0.5 text-[10px] font-mono text-blue-700">{c}</span>
                  ))}
                  {ev.linkedControlIds.length > 10 && (
                    <span className="text-[10px] text-gray-400">+{ev.linkedControlIds.length - 10} more</span>
                  )}
                </div>
              )}

              {ev.assessorSummary && (
                <p className="mt-2 text-xs text-gray-600 italic border-t border-gray-100 pt-2">
                  <span className="font-medium not-italic">Assessor Note:</span> {ev.assessorSummary}
                </p>
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

          {evidenceRequests.length > 0 && (
            <div className="grid grid-cols-3 gap-3 mb-2">
              <div className="rounded-xl border border-orange-200 bg-orange-50 p-3 text-center">
                <p className="text-xl font-bold text-orange-700">{openRequests}</p>
                <p className="text-xs text-orange-600">Open</p>
              </div>
              <div className="rounded-xl border border-blue-200 bg-blue-50 p-3 text-center">
                <p className="text-xl font-bold text-blue-700">{submittedRequests}</p>
                <p className="text-xs text-blue-600">Submitted</p>
              </div>
              <div className="rounded-xl border border-green-200 bg-green-50 p-3 text-center">
                <p className="text-xl font-bold text-green-700">{evidenceRequests.filter((r) => r.status === "closed").length}</p>
                <p className="text-xs text-green-600">Closed</p>
              </div>
            </div>
          )}

          {evidenceRequests.map((er) => (
            <div key={er.id} className={`rounded-xl border bg-white p-4 ${er.status === "open" ? "border-orange-200" : "border-gray-200"}`}>
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                    <ClipboardList className="h-4 w-4 text-orange-500 shrink-0" />
                    <h3 className="text-sm font-semibold text-gray-900">{er.title}</h3>
                    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium capitalize ${
                      er.status === "closed" ? "bg-green-100 text-green-700" :
                      er.status === "submitted" ? "bg-blue-100 text-blue-700" :
                      "bg-orange-100 text-orange-700"
                    }`}>
                      {er.status}
                    </span>
                  </div>
                  {er.instructions && (
                    <p className="text-xs text-gray-600 mb-2 leading-relaxed">{er.instructions}</p>
                  )}
                  {er.suggestedFilename && (
                    <div className="flex items-center gap-2 text-xs text-gray-500 bg-gray-50 rounded px-2.5 py-1.5 mb-2">
                      <FileText className="h-3.5 w-3.5 text-gray-400 shrink-0" />
                      <span>Suggested filename: </span>
                      <code className="font-mono text-gray-700">{er.suggestedFilename}</code>
                    </div>
                  )}
                  <div className="flex items-center gap-3 text-xs text-gray-400">
                    {er.ownerEmail && <span>Owner: <span className="text-gray-600">{er.ownerEmail}</span></span>}
                    {er.dueDate && <span>Due: <span className="text-gray-600">{new Date(er.dueDate).toLocaleDateString()}</span></span>}
                  </div>
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
          {roadmapActions
            .sort((a, b) => a.priority - b.priority)
            .map((a, i) => {
              const priorityStyle =
                a.priority === 1 ? { badge: "bg-red-100 text-red-700 border-red-200", label: "P1 · Immediate" } :
                a.priority === 2 ? { badge: "bg-orange-100 text-orange-700 border-orange-200", label: "P2 · Short-term" } :
                { badge: "bg-blue-100 text-blue-700 border-blue-200", label: "P3 · Long-term" };
              return (
                <div key={a.id} className="rounded-xl border border-gray-200 bg-white p-4">
                  <div className="flex items-start gap-3">
                    <span className="flex h-7 w-7 items-center justify-center rounded-full bg-blue-600 text-xs font-bold text-white shrink-0 mt-0.5">
                      {i + 1}
                    </span>
                    <div className="flex-1">
                      <div className="flex items-start justify-between gap-2 mb-1 flex-wrap">
                        <h3 className="text-sm font-semibold text-gray-900">{a.title}</h3>
                        <span className={`inline-flex items-center rounded border px-2 py-0.5 text-xs font-medium shrink-0 ${priorityStyle.badge}`}>
                          {priorityStyle.label}
                        </span>
                      </div>
                      <p className="text-xs text-gray-500 mb-1 capitalize">{a.category}</p>
                      {a.description && <p className="text-xs text-gray-600 leading-relaxed">{a.description}</p>}
                      {a.linkedControlIds.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-2">
                          {a.linkedControlIds.map((c) => (
                            <span key={c} className="rounded bg-blue-50 border border-blue-100 px-1.5 py-0.5 text-[10px] font-mono text-blue-700">{c}</span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
        </div>
      )}

      {activeTab === "Permissions" && (
        <div className="space-y-4">
          <div className="rounded-xl border border-gray-200 bg-white p-4">
            <h3 className="text-sm font-semibold text-gray-800 mb-1">Permission &amp; Data Availability</h3>
            <p className="text-xs text-gray-500 mb-4">
              Each assessment pack requires specific Microsoft Graph API permissions. If a pack is unavailable or shows
              limited data, the reason is typically one of: missing permission, licensing requirement, no data found, or
              API throttling.
            </p>
            <div className="space-y-3">
              {requested.map((packId) => {
                const meta = PACK_META[packId];
                const isCompleted = (scan?.packsCompleted ?? []).includes(packId);
                const isFailed = (scan?.packsFailed ?? []).includes(packId);
                const packFindings = findings.filter((f) => f.packId === packId);

                return (
                  <div key={packId} className={`rounded-lg border p-4 ${isFailed ? "border-red-200 bg-red-50" : "border-gray-100 bg-gray-50"}`}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-2">
                        <div className={`text-gray-500 ${isFailed ? "text-red-500" : isCompleted ? "text-green-600" : "text-gray-400"}`}>
                          {meta?.icon ?? <Shield className="h-4 w-4" />}
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-gray-800">{meta?.name ?? packId}</p>
                        </div>
                      </div>
                      <div className="shrink-0">
                        {isCompleted && !isFailed && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-green-100 text-green-700 px-2 py-0.5 text-xs font-medium">
                            <CheckCircle2 className="h-3 w-3" /> Available
                          </span>
                        )}
                        {isFailed && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-red-100 text-red-700 px-2 py-0.5 text-xs font-medium">
                            <AlertCircle className="h-3 w-3" /> Data Unavailable
                          </span>
                        )}
                        {!isCompleted && !isFailed && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 text-gray-500 px-2 py-0.5 text-xs font-medium">
                            <CircleDot className="h-3 w-3" /> Not Run
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="mt-3 space-y-1.5">
                      <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Required Permissions</p>
                      <div className="flex flex-wrap gap-1.5">
                        {(meta?.permissions ?? []).map((perm) => (
                          <span key={perm} className="rounded bg-white border border-gray-200 px-2 py-0.5 text-xs font-mono text-gray-700">
                            {perm}
                          </span>
                        ))}
                      </div>
                      {meta?.license && (
                        <p className="text-xs text-amber-700 flex items-center gap-1 mt-1">
                          <Info className="h-3.5 w-3.5 shrink-0" />
                          {meta.license}
                        </p>
                      )}
                    </div>

                    {isCompleted && packFindings.length > 0 && (
                      <div className="mt-2 pt-2 border-t border-gray-200">
                        <p className="text-xs text-gray-600">
                          <span className="font-medium">{packFindings.length} finding{packFindings.length !== 1 ? "s" : ""}</span>
                          {" "}generated ·{" "}
                          {packFindings.filter((f) => f.severity === "critical" || f.severity === "high").length} critical/high
                        </p>
                      </div>
                    )}

                    {isFailed && (
                      <div className="mt-2 pt-2 border-t border-red-200">
                        <p className="text-xs text-red-700">
                          This pack failed to retrieve data. Possible reasons: missing admin consent for required permissions,
                          {meta?.license ? " missing required license," : ""} no data in tenant, or a temporary API error.
                          Re-run the scan after granting permissions or check the tenant connection.
                        </p>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
            <div className="flex items-start gap-2">
              <Info className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
              <div className="text-xs text-amber-700 leading-relaxed">
                <strong className="text-amber-800">All permissions are read-only.</strong>{" "}
                This assessment uses App-Only authentication via admin consent. No data is written to or modified in your
                Microsoft tenant. To grant additional permissions, visit the tenant connection settings and re-run admin
                consent with the required scopes.
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
