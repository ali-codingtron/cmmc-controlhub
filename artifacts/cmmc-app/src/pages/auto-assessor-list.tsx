import { useState } from "react";
import { Link } from "wouter";
import {
  Bot,
  Plus,
  CheckCircle2,
  Clock,
  AlertTriangle,
  ChevronRight,
  BarChart3,
  Shield,
} from "lucide-react";
import { useOrg } from "@/context/OrgContext";

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
  notStartedCount: number | null;
  totalControls: number | null;
  completedAt: string | null;
  createdAt: string;
  createdBy: string | null;
};

function statusBadge(status: string) {
  if (status === "complete")
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-medium text-blue-700">
        <Clock className="h-3 w-3" /> Pending Review
      </span>
    );
  if (status === "approved")
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-700">
        <CheckCircle2 className="h-3 w-3" /> Approved
      </span>
    );
  if (status === "draft")
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-600">
        Draft
      </span>
    );
  return (
    <span className="inline-flex items-center rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-600">
      {status}
    </span>
  );
}

export default function AutoAssessorList() {
  const { activeOrg } = useOrg();
  const [assessments, setAssessments] = useState<Assessment[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!loaded && !loading && activeOrg) {
    setLoading(true);
    const token = localStorage.getItem("auth_token");
    fetch("/api/auto-assessor/assessments", {
      headers: {
        Authorization: `Bearer ${token}`,
        "X-Organization-ID": activeOrg.id,
      },
    })
      .then((r) => r.json())
      .then((data) => {
        setAssessments(data.assessments ?? []);
        setLoaded(true);
        setLoading(false);
      })
      .catch(() => {
        setError("Failed to load assessments.");
        setLoading(false);
        setLoaded(true);
      });
  }

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-indigo-600 text-white">
            <Bot className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-gray-900">Automated Baseline Assessor</h1>
            <p className="text-sm text-gray-500">
              Scan existing data to determine control readiness without manual entry
            </p>
          </div>
        </div>
        <Link href="/auto-assessor/new">
          <button className="inline-flex items-center gap-2 rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700">
            <Plus className="h-4 w-4" /> Run New Assessment
          </button>
        </Link>
      </div>

      <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
        <p className="text-sm text-amber-800">
          <strong>Internal Use Only:</strong> This tool produces a{" "}
          <strong>Projected Internal Readiness Score</strong> — not an official CMMC score. Results
          require Admin or Compliance Manager approval before any control statuses are updated.
        </p>
      </div>

      {loading && (
        <div className="flex items-center justify-center py-20 text-gray-400">
          <Clock className="mr-2 h-5 w-5 animate-spin" /> Loading assessments…
        </div>
      )}
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error}
        </div>
      )}

      {loaded && !error && assessments && assessments.length === 0 && (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-gray-300 bg-gray-50 py-20 text-center">
          <Bot className="h-12 w-12 text-gray-300 mb-4" />
          <p className="text-base font-medium text-gray-700">No assessments yet</p>
          <p className="text-sm text-gray-500 mt-1 mb-6 max-w-sm">
            Run your first automated baseline assessment to scan existing evidence, documents, SSP
            narratives, monitoring, and POA&Ms across all 110 CMMC controls.
          </p>
          <Link href="/auto-assessor/new">
            <button className="inline-flex items-center gap-2 rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700">
              <Plus className="h-4 w-4" /> Run New Assessment
            </button>
          </Link>
        </div>
      )}

      {loaded && assessments && assessments.length > 0 && (
        <div className="space-y-3">
          {assessments.map((a) => (
            <div
              key={a.id}
              className="rounded-xl border border-gray-200 bg-white p-5 hover:border-indigo-300 transition-colors"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-3 mb-1.5">
                    <h3 className="font-medium text-gray-900 truncate">{a.name}</h3>
                    {statusBadge(a.status)}
                    <span className="text-xs text-gray-400">CMMC {a.targetLevel}</span>
                  </div>
                  <p className="text-xs text-gray-500">
                    {a.completedAt
                      ? `Completed ${new Date(a.completedAt).toLocaleDateString()}`
                      : `Created ${new Date(a.createdAt).toLocaleDateString()}`}
                  </p>
                  <div className="mt-3 flex items-center gap-6 text-sm">
                    {a.projectedScore !== null && a.maxScore && (
                      <div className="flex items-center gap-1.5 text-gray-700">
                        <BarChart3 className="h-4 w-4 text-indigo-500" />
                        <span className="font-semibold text-indigo-700">{a.projectedScore}</span>
                        <span className="text-gray-400">/ {a.maxScore}</span>
                        <span className="text-gray-500">projected</span>
                      </div>
                    )}
                    {a.candidateCount !== null && (
                      <div className="flex items-center gap-1.5 text-gray-600">
                        <CheckCircle2 className="h-4 w-4 text-green-500" />
                        <span>{a.candidateCount} candidate</span>
                      </div>
                    )}
                    {a.notStartedCount !== null && (
                      <div className="flex items-center gap-1.5 text-gray-600">
                        <AlertTriangle className="h-4 w-4 text-red-400" />
                        <span>{a.notStartedCount} not started</span>
                      </div>
                    )}
                    {a.confidenceAvg !== null && (
                      <div className="flex items-center gap-1.5 text-gray-600">
                        <Shield className="h-4 w-4 text-blue-400" />
                        <span>{a.confidenceAvg}% avg confidence</span>
                      </div>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {a.status === "complete" && (
                    <Link href={`/auto-assessor/${a.id}/findings`}>
                      <button className="rounded-md border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-xs font-medium text-indigo-700 hover:bg-indigo-100">
                        Review Findings
                      </button>
                    </Link>
                  )}
                  <Link href={`/auto-assessor/${a.id}/results`}>
                    <button className="inline-flex items-center gap-1 rounded-md border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50">
                      View Results <ChevronRight className="h-3.5 w-3.5" />
                    </button>
                  </Link>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
