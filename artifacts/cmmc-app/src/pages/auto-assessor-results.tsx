import { useState } from "react";
import { Link, useParams } from "wouter";
import {
  Bot,
  CheckCircle2,
  AlertTriangle,
  Clock,
  ChevronRight,
  BarChart3,
  Shield,
  FileSearch,
  ArrowLeft,
  RefreshCw,
  Info,
} from "lucide-react";
import { useOrg } from "@/context/OrgContext";

type PackBreakdown = {
  packId: string;
  packName: string;
  packShortName: string;
  total: number;
  candidate: number;
  notStarted: number;
  inProgress: number;
  avgConfidence: number;
};

type Assessment = {
  id: string;
  name: string;
  status: string;
  targetLevel: string;
  projectedScore: number | null;
  maxScore: number | null;
  confidenceAvg: number | null;
  candidateCount: number | null;
  needsEvidenceCount: number | null;
  needsDocCount: number | null;
  notStartedCount: number | null;
  inProgressCount: number | null;
  totalControls: number | null;
  completedAt: string | null;
  createdAt: string;
  packs: PackBreakdown[];
  evidenceRequestCount: number;
};

function ScoreRing({
  value,
  max,
  label,
  color,
}: {
  value: number | null;
  max: number;
  label: string;
  color: string;
}) {
  const pct = value !== null ? Math.min(100, Math.round((value / max) * 100)) : 0;
  const r = 36;
  const circ = 2 * Math.PI * r;
  const dash = (pct / 100) * circ;

  return (
    <div className="flex flex-col items-center gap-2">
      <svg width="90" height="90" viewBox="0 0 90 90">
        <circle cx="45" cy="45" r={r} fill="none" stroke="#e5e7eb" strokeWidth="8" />
        <circle
          cx="45"
          cy="45"
          r={r}
          fill="none"
          stroke={color}
          strokeWidth="8"
          strokeDasharray={`${dash} ${circ - dash}`}
          strokeDashoffset={circ / 4}
          strokeLinecap="round"
        />
        <text
          x="45"
          y="45"
          dominantBaseline="middle"
          textAnchor="middle"
          fontSize="14"
          fontWeight="700"
          fill="#111827"
        >
          {value !== null ? value : "—"}
        </text>
        {max !== 100 && (
          <text x="45" y="59" dominantBaseline="middle" textAnchor="middle" fontSize="9" fill="#6b7280">
            / {max}
          </text>
        )}
      </svg>
      <span className="text-xs font-medium text-gray-600 text-center">{label}</span>
    </div>
  );
}

function packGapClass(candidate: number, total: number) {
  if (total === 0) return "bg-gray-100";
  const pct = candidate / total;
  if (pct >= 0.8) return "bg-green-50 border-green-200";
  if (pct >= 0.5) return "bg-yellow-50 border-yellow-200";
  if (pct >= 0.25) return "bg-orange-50 border-orange-200";
  return "bg-red-50 border-red-200";
}

function packBarColor(candidate: number, total: number) {
  if (total === 0) return "bg-gray-300";
  const pct = candidate / total;
  if (pct >= 0.8) return "bg-green-500";
  if (pct >= 0.5) return "bg-yellow-500";
  if (pct >= 0.25) return "bg-orange-500";
  return "bg-red-500";
}

export default function AutoAssessorResults() {
  const params = useParams<{ id: string }>();
  const { activeOrg } = useOrg();
  const [assessment, setAssessment] = useState<Assessment | null>(null);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!loaded && !loading && activeOrg && params.id) {
    setLoading(true);
    const token = localStorage.getItem("auth_token");
    fetch(`/api/auto-assessor/assessments/${params.id}`, {
      headers: {
        Authorization: `Bearer ${token}`,
        "X-Organization-ID": activeOrg.id,
      },
    })
      .then((r) => r.json())
      .then((data) => {
        setAssessment(data);
        setLoaded(true);
        setLoading(false);
      })
      .catch(() => {
        setError("Failed to load assessment results.");
        setLoading(false);
        setLoaded(true);
      });
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-32 text-gray-400">
        <RefreshCw className="mr-2 h-5 w-5 animate-spin" /> Loading results…
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6 max-w-4xl mx-auto">
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error}
        </div>
      </div>
    );
  }

  if (!assessment) return null;

  const gapCount =
    (assessment.totalControls ?? 0) - (assessment.candidateCount ?? 0);

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <Link href="/auto-assessor">
            <button className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800">
              <ArrowLeft className="h-4 w-4" /> All Assessments
            </button>
          </Link>
        </div>
        <div className="flex items-center gap-2">
          {assessment.status === "complete" && (
            <Link href={`/auto-assessor/${assessment.id}/findings`}>
              <button className="inline-flex items-center gap-2 rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700">
                Review & Approve Findings <ChevronRight className="h-4 w-4" />
              </button>
            </Link>
          )}
        </div>
      </div>

      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-indigo-600 text-white">
          <Bot className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-xl font-semibold text-gray-900">{assessment.name}</h1>
          <p className="text-sm text-gray-500">
            CMMC {assessment.targetLevel} ·{" "}
            {assessment.completedAt
              ? `Completed ${new Date(assessment.completedAt).toLocaleDateString()}`
              : "In Progress"}
          </p>
        </div>
      </div>

      <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 flex items-start gap-2">
        <Info className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
        <p className="text-sm text-amber-800">
          <strong>Projected Internal Readiness Score</strong> — not an official CMMC score. These
          findings require review and approval before any control statuses are updated in the system.
        </p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="rounded-xl border border-gray-200 bg-white p-5 flex flex-col items-center gap-1">
          <ScoreRing
            value={assessment.projectedScore}
            max={assessment.maxScore ?? 110}
            label="Projected Score"
            color="#6366f1"
          />
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-5 flex flex-col items-center gap-1">
          <ScoreRing
            value={assessment.confidenceAvg}
            max={100}
            label="Avg Confidence"
            color="#3b82f6"
          />
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-5 flex flex-col items-center justify-center gap-2">
          <div className="flex items-center gap-2 text-green-600">
            <CheckCircle2 className="h-7 w-7" />
            <span className="text-3xl font-bold text-gray-900">
              {assessment.candidateCount ?? 0}
            </span>
          </div>
          <p className="text-xs font-medium text-gray-600 text-center">Candidate for Implemented</p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-5 flex flex-col items-center justify-center gap-2">
          <div className="flex items-center gap-2 text-red-500">
            <AlertTriangle className="h-7 w-7" />
            <span className="text-3xl font-bold text-gray-900">{gapCount}</span>
          </div>
          <p className="text-xs font-medium text-gray-600 text-center">Controls Needing Attention</p>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-center">
        {[
          { label: "Not Started", value: assessment.notStartedCount, color: "text-red-600" },
          { label: "In Progress", value: assessment.inProgressCount, color: "text-yellow-600" },
          { label: "Needs Evidence", value: assessment.needsEvidenceCount, color: "text-orange-600" },
          { label: "Needs Documentation", value: assessment.needsDocCount, color: "text-blue-600" },
        ].map((stat) => (
          <div key={stat.label} className="rounded-lg border border-gray-200 bg-white px-4 py-3">
            <p className={`text-2xl font-bold ${stat.color}`}>{stat.value ?? 0}</p>
            <p className="text-xs text-gray-500 mt-0.5">{stat.label}</p>
          </div>
        ))}
      </div>

      {assessment.packs && assessment.packs.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-base font-semibold text-gray-900">Assessment Pack Breakdown</h2>
            <Link href={`/auto-assessor/${assessment.id}/findings`}>
              <button className="inline-flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-800">
                <FileSearch className="h-3.5 w-3.5" /> View all findings
              </button>
            </Link>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {assessment.packs.map((pack) => {
              const pct =
                pack.total > 0 ? Math.round((pack.candidate / pack.total) * 100) : 0;
              return (
                <div
                  key={pack.packId}
                  className={`rounded-xl border p-4 ${packGapClass(pack.candidate, pack.total)}`}
                >
                  <div className="flex items-start justify-between mb-2">
                    <p className="text-sm font-medium text-gray-800">{pack.packShortName}</p>
                    <div className="flex items-center gap-1.5 text-xs text-gray-500">
                      <Shield className="h-3.5 w-3.5 text-blue-400" />
                      {pack.avgConfidence}% conf.
                    </div>
                  </div>
                  <div className="flex items-center gap-3 mb-2.5">
                    <div className="flex-1 h-2 rounded-full bg-gray-200">
                      <div
                        className={`h-2 rounded-full ${packBarColor(pack.candidate, pack.total)}`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <span className="text-xs font-medium text-gray-700 shrink-0">{pct}%</span>
                  </div>
                  <div className="flex items-center gap-3 text-xs text-gray-600">
                    <span className="flex items-center gap-1">
                      <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
                      {pack.candidate} candidate
                    </span>
                    {pack.notStarted > 0 && (
                      <span className="flex items-center gap-1">
                        <AlertTriangle className="h-3.5 w-3.5 text-red-400" />
                        {pack.notStarted} not started
                      </span>
                    )}
                    {pack.inProgress > 0 && (
                      <span className="flex items-center gap-1">
                        <Clock className="h-3.5 w-3.5 text-yellow-500" />
                        {pack.inProgress} in progress
                      </span>
                    )}
                    <span className="ml-auto text-gray-400">{pack.total} controls</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {assessment.evidenceRequestCount > 0 && (
        <div className="rounded-xl border border-gray-200 bg-white p-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-orange-100">
                <BarChart3 className="h-5 w-5 text-orange-600" />
              </div>
              <div>
                <p className="text-sm font-medium text-gray-900">
                  {assessment.evidenceRequestCount} Evidence Request
                  {assessment.evidenceRequestCount === 1 ? "" : "s"} Generated
                </p>
                <p className="text-xs text-gray-500">
                  Auto-generated requests for missing artifacts, grouped by assessment pack
                </p>
              </div>
            </div>
            <Link href={`/auto-assessor/${assessment.id}/findings`}>
              <button className="inline-flex items-center gap-1.5 rounded-md border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50">
                View in Findings <ChevronRight className="h-3.5 w-3.5" />
              </button>
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
