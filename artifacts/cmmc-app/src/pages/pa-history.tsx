import { useState, useCallback } from "react";
import { Link } from "wouter";
import {
  History,
  Plus,
  CheckCircle2,
  XCircle,
  Clock,
  AlertTriangle,
  ChevronRight,
  RefreshCw,
  Activity,
} from "lucide-react";
import { useOrg } from "@/context/OrgContext";

type ScanRun = {
  id: string;
  scanName: string;
  scanType: string;
  status: string;
  packsRequested: string[];
  packsCompleted: string[];
  packsFailed: string[];
  startedAt: string | null;
  completedAt: string | null;
  totalChecks: number;
  passedChecks: number;
  failedChecks: number;
  unknowns: number;
  generatedFindingCount: number;
  generatedEvidenceCount: number;
  createdBy: string | null;
  createdAt: string;
};

function statusBadge(status: string) {
  const m: Record<string, { label: string; cls: string; icon: React.ReactNode }> = {
    completed: { label: "Completed", cls: "bg-green-100 text-green-700", icon: <CheckCircle2 className="h-3 w-3" /> },
    completed_with_warnings: { label: "With Warnings", cls: "bg-yellow-100 text-yellow-700", icon: <AlertTriangle className="h-3 w-3" /> },
    running: { label: "Running", cls: "bg-blue-100 text-blue-700", icon: <Activity className="h-3 w-3 animate-pulse" /> },
    failed: { label: "Failed", cls: "bg-red-100 text-red-700", icon: <XCircle className="h-3 w-3" /> },
    not_started: { label: "Not Started", cls: "bg-gray-100 text-gray-600", icon: <Clock className="h-3 w-3" /> },
  };
  const e = m[status] ?? m.not_started;
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ${e.cls}`}>
      {e.icon} {e.label}
    </span>
  );
}

export default function PaHistory() {
  const { activeOrg } = useOrg();
  const [scans, setScans] = useState<ScanRun[]>([]);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(() => {
    if (!activeOrg) return;
    setLoading(true);
    const token = localStorage.getItem("auth_token");
    fetch("/api/pre-assessment/scans", {
      headers: { Authorization: `Bearer ${token}`, "X-Organization-ID": activeOrg.id },
    })
      .then((r) => r.json())
      .then((d) => { setScans(d.scans ?? []); setLoaded(true); setLoading(false); })
      .catch(() => { setLoading(false); setLoaded(true); });
  }, [activeOrg]);

  if (!loaded && !loading && activeOrg) load();

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-600 text-white">
            <History className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-gray-900">Assessment History</h1>
            <p className="text-sm text-gray-500">All tenant pre-assessment scan runs for this organization</p>
          </div>
        </div>
        <Link href="/pre-assessment/run">
          <button className="inline-flex items-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700">
            <Plus className="h-4 w-4" /> New Assessment
          </button>
        </Link>
      </div>

      {loading && (
        <div className="flex items-center justify-center py-20 text-gray-400">
          <RefreshCw className="mr-2 h-5 w-5 animate-spin" /> Loading…
        </div>
      )}

      {loaded && scans.length === 0 && (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-gray-300 bg-gray-50 py-20 text-center">
          <History className="h-12 w-12 text-gray-300 mb-4" />
          <p className="text-base font-medium text-gray-700">No assessments yet</p>
          <p className="text-sm text-gray-500 mt-1 mb-6 max-w-sm">
            Connect a Microsoft tenant and run your first automated pre-assessment.
          </p>
          <div className="flex gap-2">
            <Link href="/pre-assessment/connections">
              <button className="inline-flex items-center gap-1.5 rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
                Add Tenant Connection
              </button>
            </Link>
            <Link href="/pre-assessment/run">
              <button className="inline-flex items-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700">
                <Plus className="h-4 w-4" /> Run Assessment
              </button>
            </Link>
          </div>
        </div>
      )}

      {loaded && scans.length > 0 && (
        <div className="space-y-3">
          {scans.map((scan) => (
            <div key={scan.id} className="rounded-xl border border-gray-200 bg-white p-5 hover:border-blue-300 transition-colors">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-3 mb-1.5 flex-wrap">
                    <h3 className="font-medium text-gray-900 truncate">{scan.scanName}</h3>
                    {statusBadge(scan.status)}
                    <span className="text-xs text-gray-400 uppercase">{scan.scanType}</span>
                  </div>
                  <p className="text-xs text-gray-500">
                    {scan.completedAt
                      ? `Completed ${new Date(scan.completedAt).toLocaleDateString()} at ${new Date(scan.completedAt).toLocaleTimeString()}`
                      : scan.startedAt
                      ? `Started ${new Date(scan.startedAt).toLocaleDateString()}`
                      : `Created ${new Date(scan.createdAt).toLocaleDateString()}`}
                    {scan.createdBy && ` · by ${scan.createdBy}`}
                  </p>

                  {(scan.status === "completed" || scan.status === "completed_with_warnings") && (
                    <div className="mt-3 flex flex-wrap items-center gap-4 text-sm">
                      <div className="flex items-center gap-1.5 text-green-700">
                        <CheckCircle2 className="h-4 w-4" />
                        <span>{scan.passedChecks} passed</span>
                      </div>
                      <div className="flex items-center gap-1.5 text-red-600">
                        <XCircle className="h-4 w-4" />
                        <span>{scan.failedChecks} failed</span>
                      </div>
                      <div className="flex items-center gap-1.5 text-gray-500">
                        <Clock className="h-4 w-4" />
                        <span>{scan.unknowns} unknown</span>
                      </div>
                      <div className="text-gray-500 text-xs">
                        {scan.generatedFindingCount} findings · {scan.generatedEvidenceCount} evidence records
                      </div>
                    </div>
                  )}

                  <div className="mt-2 flex flex-wrap gap-1">
                    {scan.packsCompleted?.map((p) => (
                      <span key={p} className="rounded-full bg-green-50 border border-green-200 px-2 py-0.5 text-[10px] font-medium text-green-700">{p}</span>
                    ))}
                    {scan.packsFailed?.map((p) => (
                      <span key={p} className="rounded-full bg-red-50 border border-red-200 px-2 py-0.5 text-[10px] font-medium text-red-700">{p} ✗</span>
                    ))}
                  </div>
                </div>

                <Link href={`/pre-assessment/results/${scan.id}`}>
                  <button className="inline-flex items-center gap-1 rounded-md border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 shrink-0">
                    View Results <ChevronRight className="h-3.5 w-3.5" />
                  </button>
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
