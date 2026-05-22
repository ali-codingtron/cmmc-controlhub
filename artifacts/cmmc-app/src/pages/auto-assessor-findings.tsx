import { useState, useCallback } from "react";
import { Link, useParams } from "wouter";
import {
  ArrowLeft,
  CheckCircle2,
  XCircle,
  Clock,
  AlertTriangle,
  ShieldCheck,
  FileText,
  BookOpen,
  Activity,
  Ban,
  RefreshCw,
  ChevronDown,
  Loader2,
} from "lucide-react";
import { useOrg } from "@/context/OrgContext";

const PACK_NAMES: Record<string, string> = {
  identity_access: "Identity & Access",
  mfa_auth: "MFA & Auth",
  logging_audit: "Logging & Audit",
  endpoint_config: "Endpoint & Config",
  vuln_integrity: "Vuln & Integrity",
  network: "Network",
  incident_response: "Incident Response",
  risk_poam: "Risk & POA&M",
  backup_media: "Backup & Media",
  personnel_physical: "Personnel & Training",
};

type Finding = {
  id: string;
  packId: string;
  controlRef: string;
  controlTitle: string;
  level: string;
  suggestedStatus: string;
  confidenceScore: number;
  hasEvidence: boolean;
  hasApprovedEvidence: boolean;
  hasPolicy: boolean;
  hasProcedure: boolean;
  hasSspNarrative: boolean;
  hasMonitoringItem: boolean;
  monitoringIsCurrent: boolean;
  hasOpenPoam: boolean;
  findingType: string | null;
  severity: string | null;
  gapDescription: string | null;
  recommendedRemediation: string | null;
  approvedStatus: string | null;
  approvedAt: string | null;
  rejectedAt: string | null;
};

function statusBadge(status: string) {
  const map: Record<string, { label: string; cls: string }> = {
    candidate_for_implemented: { label: "Candidate", cls: "bg-green-100 text-green-700" },
    needs_evidence: { label: "Needs Evidence", cls: "bg-orange-100 text-orange-700" },
    needs_documentation: { label: "Needs Documentation", cls: "bg-blue-100 text-blue-700" },
    needs_validation: { label: "Needs Validation", cls: "bg-purple-100 text-purple-700" },
    in_progress: { label: "In Progress", cls: "bg-yellow-100 text-yellow-700" },
    not_started: { label: "Not Started", cls: "bg-red-100 text-red-700" },
  };
  const entry = map[status] ?? { label: status, cls: "bg-gray-100 text-gray-600" };
  return (
    <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${entry.cls}`}>
      {entry.label}
    </span>
  );
}

function severityDot(severity: string | null) {
  if (!severity) return null;
  const colors: Record<string, string> = {
    high: "bg-red-500",
    medium: "bg-orange-400",
    low: "bg-yellow-400",
    informational: "bg-gray-400",
  };
  return (
    <span
      className={`inline-block h-2 w-2 rounded-full ${colors[severity] ?? "bg-gray-300"}`}
      title={severity}
    />
  );
}

function SignalIcons({
  f,
}: {
  f: Pick<
    Finding,
    | "hasApprovedEvidence"
    | "hasEvidence"
    | "hasPolicy"
    | "hasProcedure"
    | "hasSspNarrative"
    | "monitoringIsCurrent"
    | "hasMonitoringItem"
    | "hasOpenPoam"
  >;
}) {
  const icons = [
    {
      icon: ShieldCheck,
      active: f.hasApprovedEvidence,
      partial: f.hasEvidence && !f.hasApprovedEvidence,
      label: "Evidence",
    },
    { icon: FileText, active: f.hasPolicy, partial: false, label: "Policy" },
    { icon: BookOpen, active: f.hasProcedure, partial: false, label: "Procedure" },
    { icon: FileText, active: f.hasSspNarrative, partial: false, label: "SSP" },
    {
      icon: Activity,
      active: f.monitoringIsCurrent,
      partial: f.hasMonitoringItem && !f.monitoringIsCurrent,
      label: "Monitoring",
    },
    { icon: Ban, active: !f.hasOpenPoam, partial: false, label: "No POA&M" },
  ];

  return (
    <div className="flex items-center gap-1.5">
      {icons.map(({ icon: Icon, active, partial, label }) => (
        <span
          key={label}
          title={label}
          className={`flex h-5 w-5 items-center justify-center rounded ${
            active
              ? "text-green-600"
              : partial
              ? "text-yellow-500"
              : "text-gray-300"
          }`}
        >
          <Icon className="h-3.5 w-3.5" />
        </span>
      ))}
    </div>
  );
}

function ConfidenceBar({ score }: { score: number }) {
  const color =
    score >= 70 ? "bg-green-500" : score >= 40 ? "bg-yellow-500" : "bg-red-500";
  return (
    <div className="flex items-center gap-2">
      <div className="w-16 h-1.5 rounded-full bg-gray-200">
        <div
          className={`h-1.5 rounded-full ${color}`}
          style={{ width: `${score}%` }}
        />
      </div>
      <span className="text-xs text-gray-500">{score}%</span>
    </div>
  );
}

export default function AutoAssessorFindings() {
  const params = useParams<{ id: string }>();
  const { activeOrg } = useOrg();

  const [findings, setFindings] = useState<Finding[]>([]);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [packFilter, setPackFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [bulkApproving, setBulkApproving] = useState(false);
  const [actionInFlight, setActionInFlight] = useState<string | null>(null);
  const [assessmentStatus, setAssessmentStatus] = useState<string>("");

  const loadFindings = useCallback(() => {
    if (!activeOrg || !params.id) return;
    setLoading(true);
    const token = localStorage.getItem("auth_token");
    fetch(`/api/auto-assessor/assessments/${params.id}/findings`, {
      headers: {
        Authorization: `Bearer ${token}`,
        "X-Organization-ID": activeOrg.id,
      },
    })
      .then((r) => r.json())
      .then((data) => {
        setFindings(data.findings ?? []);
        setAssessmentStatus(data.assessmentStatus ?? "");
        setLoaded(true);
        setLoading(false);
      })
      .catch(() => {
        setError("Failed to load findings.");
        setLoading(false);
        setLoaded(true);
      });
  }, [activeOrg, params.id]);

  if (!loaded && !loading && activeOrg) {
    loadFindings();
  }

  async function approveFinding(findingId: string) {
    if (!activeOrg) return;
    setActionInFlight(findingId);
    const token = localStorage.getItem("auth_token");
    await fetch(
      `/api/auto-assessor/assessments/${params.id}/findings/${findingId}`,
      {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
          "X-Organization-ID": activeOrg.id,
        },
        body: JSON.stringify({ action: "approve" }),
      }
    );
    setActionInFlight(null);
    setLoaded(false);
    loadFindings();
  }

  async function rejectFinding(findingId: string) {
    if (!activeOrg) return;
    setActionInFlight(findingId);
    const token = localStorage.getItem("auth_token");
    await fetch(
      `/api/auto-assessor/assessments/${params.id}/findings/${findingId}`,
      {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
          "X-Organization-ID": activeOrg.id,
        },
        body: JSON.stringify({ action: "reject" }),
      }
    );
    setActionInFlight(null);
    setLoaded(false);
    loadFindings();
  }

  async function bulkApprove() {
    if (!activeOrg) return;
    setBulkApproving(true);
    const token = localStorage.getItem("auth_token");
    await fetch(`/api/auto-assessor/assessments/${params.id}/bulk-approve`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        "X-Organization-ID": activeOrg.id,
      },
    });
    setBulkApproving(false);
    setLoaded(false);
    loadFindings();
  }

  const filtered = findings.filter((f) => {
    if (packFilter !== "all" && f.packId !== packFilter) return false;
    if (statusFilter === "pending" && (f.approvedStatus || f.rejectedAt)) return false;
    if (statusFilter === "approved" && !f.approvedStatus) return false;
    if (statusFilter === "rejected" && !f.rejectedAt) return false;
    if (statusFilter !== "all" && statusFilter !== "pending" && statusFilter !== "approved" && statusFilter !== "rejected") {
      if (f.suggestedStatus !== statusFilter) return false;
    }
    return true;
  });

  const pendingCount = findings.filter((f) => !f.approvedStatus && !f.rejectedAt).length;
  const approvedCount = findings.filter((f) => !!f.approvedStatus).length;
  const rejectedCount = findings.filter((f) => !!f.rejectedAt && !f.approvedStatus).length;

  const packs = Array.from(new Set(findings.map((f) => f.packId))).sort();

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-5">
      <div className="flex items-center justify-between">
        <Link href={`/auto-assessor/${params.id}/results`}>
          <button className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800">
            <ArrowLeft className="h-4 w-4" /> Back to Results
          </button>
        </Link>
        {pendingCount > 0 && (
          <button
            onClick={bulkApprove}
            disabled={bulkApproving}
            className="inline-flex items-center gap-2 rounded-md bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-60"
          >
            {bulkApproving ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <CheckCircle2 className="h-4 w-4" />
            )}
            Approve All Pending ({pendingCount})
          </button>
        )}
      </div>

      <div>
        <h1 className="text-xl font-semibold text-gray-900">Assessment Findings</h1>
        <p className="text-sm text-gray-500">
          Review suggested control statuses and approve or reject each finding
        </p>
      </div>

      <div className="flex items-center gap-4 text-sm text-gray-600">
        <span
          className="cursor-pointer text-yellow-600 font-medium"
          onClick={() => setStatusFilter("pending")}
        >
          <Clock className="inline h-3.5 w-3.5 mr-1" />
          {pendingCount} pending
        </span>
        <span
          className="cursor-pointer text-green-600 font-medium"
          onClick={() => setStatusFilter("approved")}
        >
          <CheckCircle2 className="inline h-3.5 w-3.5 mr-1" />
          {approvedCount} approved
        </span>
        <span
          className="cursor-pointer text-red-500 font-medium"
          onClick={() => setStatusFilter("rejected")}
        >
          <XCircle className="inline h-3.5 w-3.5 mr-1" />
          {rejectedCount} rejected
        </span>
        <button
          onClick={() => setStatusFilter("all")}
          className="ml-auto text-xs text-gray-400 hover:text-gray-600"
        >
          Show all
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <select
          value={packFilter}
          onChange={(e) => setPackFilter(e.target.value)}
          className="rounded-md border border-gray-300 px-3 py-1.5 text-sm"
        >
          <option value="all">All Packs</option>
          {packs.map((p) => (
            <option key={p} value={p}>
              {PACK_NAMES[p] ?? p}
            </option>
          ))}
        </select>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="rounded-md border border-gray-300 px-3 py-1.5 text-sm"
        >
          <option value="all">All Statuses</option>
          <option value="pending">Pending Review</option>
          <option value="approved">Approved</option>
          <option value="rejected">Rejected</option>
          <option value="not_started">Not Started</option>
          <option value="in_progress">In Progress</option>
          <option value="needs_evidence">Needs Evidence</option>
          <option value="needs_documentation">Needs Documentation</option>
          <option value="needs_validation">Needs Validation</option>
          <option value="candidate_for_implemented">Candidate</option>
        </select>
        <span className="text-xs text-gray-400">
          Showing {filtered.length} of {findings.length}
        </span>
      </div>

      {loading && (
        <div className="flex items-center justify-center py-16 text-gray-400">
          <RefreshCw className="mr-2 h-5 w-5 animate-spin" /> Loading findings…
        </div>
      )}
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error}
        </div>
      )}

      {loaded && (
        <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-xs text-gray-500 uppercase tracking-wide">
              <tr>
                <th className="px-4 py-3 text-left w-32">Control</th>
                <th className="px-4 py-3 text-left">Pack</th>
                <th className="px-4 py-3 text-left">Suggested Status</th>
                <th className="px-4 py-3 text-left">Signals</th>
                <th className="px-4 py-3 text-left">Confidence</th>
                <th className="px-4 py-3 text-left">Review</th>
                <th className="px-4 py-3 text-left w-28">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.map((f) => {
                const isExpanded = expandedId === f.id;
                const isApproved = !!f.approvedStatus;
                const isRejected = !!f.rejectedAt && !f.approvedStatus;
                const inFlight = actionInFlight === f.id;
                return (
                  <>
                    <tr
                      key={f.id}
                      className={`hover:bg-gray-50 cursor-pointer ${isApproved ? "bg-green-50/30" : isRejected ? "bg-red-50/30" : ""}`}
                      onClick={() => setExpandedId(isExpanded ? null : f.id)}
                    >
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5">
                          {severityDot(f.severity)}
                          <span className="font-mono text-xs font-medium text-gray-800">
                            {f.controlRef}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-500">
                        {PACK_NAMES[f.packId] ?? f.packId}
                      </td>
                      <td className="px-4 py-3">{statusBadge(f.suggestedStatus)}</td>
                      <td className="px-4 py-3">
                        <SignalIcons f={f} />
                      </td>
                      <td className="px-4 py-3">
                        <ConfidenceBar score={f.confidenceScore} />
                      </td>
                      <td className="px-4 py-3">
                        {isApproved && (
                          <span className="inline-flex items-center gap-1 text-xs text-green-700">
                            <CheckCircle2 className="h-3.5 w-3.5" /> Approved
                          </span>
                        )}
                        {isRejected && (
                          <span className="inline-flex items-center gap-1 text-xs text-red-600">
                            <XCircle className="h-3.5 w-3.5" /> Rejected
                          </span>
                        )}
                        {!isApproved && !isRejected && (
                          <span className="inline-flex items-center gap-1 text-xs text-gray-400">
                            <Clock className="h-3.5 w-3.5" /> Pending
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                        {!isApproved && !isRejected && (
                          <div className="flex items-center gap-1.5">
                            <button
                              onClick={() => approveFinding(f.id)}
                              disabled={inFlight}
                              title="Approve"
                              className="flex h-7 w-7 items-center justify-center rounded-md bg-green-100 text-green-700 hover:bg-green-200 disabled:opacity-40"
                            >
                              {inFlight ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              ) : (
                                <CheckCircle2 className="h-3.5 w-3.5" />
                              )}
                            </button>
                            <button
                              onClick={() => rejectFinding(f.id)}
                              disabled={inFlight}
                              title="Reject"
                              className="flex h-7 w-7 items-center justify-center rounded-md bg-red-100 text-red-600 hover:bg-red-200 disabled:opacity-40"
                            >
                              <XCircle className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        )}
                        {(isApproved || isRejected) && (
                          <ChevronDown
                            className={`h-4 w-4 text-gray-400 transition-transform ${isExpanded ? "rotate-180" : ""}`}
                          />
                        )}
                      </td>
                    </tr>
                    {isExpanded && (
                      <tr key={`${f.id}-expand`} className="bg-gray-50">
                        <td colSpan={7} className="px-6 py-4">
                          <div className="space-y-2 text-sm text-gray-700">
                            <p className="font-medium text-gray-800">{f.controlTitle}</p>
                            {f.gapDescription && (
                              <div>
                                <span className="font-medium text-gray-600">Gap: </span>
                                {f.gapDescription}
                              </div>
                            )}
                            {f.recommendedRemediation && (
                              <div>
                                <span className="font-medium text-gray-600">Remediation: </span>
                                {f.recommendedRemediation}
                              </div>
                            )}
                            {f.suggestedStatus === "candidate_for_implemented" && (
                              <div className="flex items-center gap-1.5 text-green-700">
                                <CheckCircle2 className="h-4 w-4" />
                                All required signals detected — this control is a strong candidate
                                for Implemented status.
                              </div>
                            )}
                            {isApproved && (
                              <div className="flex items-center gap-1.5 text-green-600 font-medium">
                                <CheckCircle2 className="h-4 w-4" />
                                Approved {f.approvedAt ? `on ${new Date(f.approvedAt).toLocaleDateString()}` : ""}
                              </div>
                            )}
                            {isRejected && (
                              <div className="flex items-center gap-1.5 text-red-600 font-medium">
                                <XCircle className="h-4 w-4" />
                                Rejected {f.rejectedAt ? `on ${new Date(f.rejectedAt).toLocaleDateString()}` : ""}
                              </div>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                  </>
                );
              })}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center text-sm text-gray-400">
                    <AlertTriangle className="mx-auto h-8 w-8 mb-2 text-gray-300" />
                    No findings match the current filters
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
