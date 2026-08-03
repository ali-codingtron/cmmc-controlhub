import { useState, useCallback } from "react";
import { useLocation } from "wouter";
import { ScanLine, Loader2, Play, ChevronRight, CheckSquare, Square, AlertTriangle } from "lucide-react";
import { useOrg } from "@/context/OrgContext";

type Connection = {
  id: string;
  tenantName: string;
  microsoftTenantId: string;
  primaryDomain: string | null;
  connectionStatus: string;
};

const ALL_PACKS = [
  { id: "identity",          name: "Identity Pack",          desc: "Users, guests, stale accounts, group membership",                  controls: "AC.L1-3.1.1, IA.L1-3.5.1, IA.L2-3.5.6", l1Relevant: true  },
  { id: "authentication",    name: "Authentication Pack",    desc: "MFA registration, authentication method coverage",                 controls: "IA.L1-3.5.2, IA.L2-3.5.3",              l1Relevant: true  },
  { id: "conditional_access",name: "Conditional Access Pack",desc: "CA policies, MFA enforcement, legacy auth blocking",               controls: "IA.L2-3.5.3, AC.L2-3.1.12, SC.L2-3.13.8", l1Relevant: false },
  { id: "devices",           name: "Device / Intune Pack",  desc: "Managed devices, compliance state, encryption",                    controls: "CM.L2-3.4.1, CM.L2-3.4.3, SI.L1-3.14.1", l1Relevant: false },
  { id: "audit",             name: "Audit / Sign-in Pack",  desc: "Sign-in logs, directory audit logs, admin changes",                controls: "AU.L2-3.3.1, AU.L2-3.3.2, CA.L2-3.12.3", l1Relevant: false },
  { id: "secure_score",      name: "Security Score Pack",   desc: "Microsoft Secure Score and improvement recommendations",           controls: "Multiple",                                l1Relevant: false },
];

export default function PaRun() {
  const [, navigate] = useLocation();
  const { activeOrg } = useOrg();
  const isL1 = activeOrg?.cmmcTargetLevel === "L1";

  const [connections, setConnections] = useState<Connection[]>([]);
  const [connsLoaded, setConnsLoaded] = useState(false);
  const [scanName, setScanName] = useState("");
  const [selectedConn, setSelectedConn] = useState("");
  const [selectedPacks, setSelectedPacks] = useState<string[]>(() =>
    isL1 ? ALL_PACKS.filter((p) => p.l1Relevant).map((p) => p.id) : ALL_PACKS.map((p) => p.id)
  );
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadConns = useCallback(() => {
    if (!activeOrg) return;
    const token = localStorage.getItem("auth_token");
    fetch("/api/pre-assessment/connections", {
      headers: { Authorization: `Bearer ${token}`, "X-Organization-ID": activeOrg.id },
    })
      .then((r) => r.json())
      .then((d) => {
        const active = (d.connections ?? []).filter(
          (c: Connection) => c.connectionStatus !== "disconnected"
        );
        setConnections(active);
        if (active.length > 0) setSelectedConn(active[0].id);
        setConnsLoaded(true);
      })
      .catch(() => setConnsLoaded(true));
  }, [activeOrg]);

  if (!connsLoaded && activeOrg) loadConns();

  function togglePack(id: string) {
    setSelectedPacks((prev) =>
      prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]
    );
  }

  async function runScan() {
    if (!activeOrg || !selectedConn || selectedPacks.length === 0) {
      setError("Select a tenant connection and at least one pack.");
      return;
    }
    setRunning(true);
    setError(null);
    const token = localStorage.getItem("auth_token");
    const res = await fetch("/api/pre-assessment/scans", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        "X-Organization-ID": activeOrg.id,
      },
      body: JSON.stringify({
        tenantConnectionId: selectedConn,
        scanName: scanName.trim() || undefined,
        packs: selectedPacks,
      }),
    });

    if (!res.ok) {
      const b = await res.json().catch(() => ({}));
      setError(b.error ?? "Failed to start scan.");
      setRunning(false);
      return;
    }

    const data = await res.json();
    navigate(`/pre-assessment/results/${data.id}`);
  }

  const allSelected = selectedPacks.length === ALL_PACKS.length;

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-600 text-white">
          <ScanLine className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Tenant-Connected Assessment</h1>
          <p className="text-sm text-gray-500">Connect to your Microsoft tenant and run an automated CMMC readiness pre-assessment</p>
        </div>
      </div>

      <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
        <strong>Internal Use Only.</strong> This is a <strong>read-only</strong> pre-assessment. No changes are made to your Microsoft tenant. Results require Admin/CM review before any control updates.
      </div>

      {!connsLoaded && (
        <div className="flex items-center justify-center py-12 text-gray-400">
          <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Loading connections…
        </div>
      )}

      {connsLoaded && connections.length === 0 && (
        <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50 p-8 text-center">
          <AlertTriangle className="mx-auto h-10 w-10 text-gray-300 mb-3" />
          <p className="text-sm font-medium text-gray-700">No tenant connections configured</p>
          <p className="text-xs text-gray-500 mt-1 mb-4">Set up a tenant connection before running an assessment.</p>
          <a href="/pre-assessment/connections" className="inline-flex items-center gap-1.5 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700">
            Go to Tenant Connections <ChevronRight className="h-4 w-4" />
          </a>
        </div>
      )}

      {connsLoaded && connections.length > 0 && (
        <>
          <div className="rounded-xl border border-gray-200 bg-white p-5 space-y-4">
            <h2 className="text-sm font-semibold text-gray-800">1. Assessment Setup</h2>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1.5">Assessment Name (optional)</label>
              <input
                type="text"
                value={scanName}
                onChange={(e) => setScanName(e.target.value)}
                placeholder={`Tenant Pre-Assessment — ${new Date().toLocaleDateString()}`}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1.5">Tenant Connection</label>
              <select
                value={selectedConn}
                onChange={(e) => setSelectedConn(e.target.value)}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              >
                {connections.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.tenantName}{c.primaryDomain ? ` (${c.primaryDomain})` : ""}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="rounded-xl border border-gray-200 bg-white p-5 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-gray-800">2. Assessment Packs</h2>
              <button
                onClick={() => setSelectedPacks(allSelected ? [] : ALL_PACKS.map((p) => p.id))}
                className="text-xs text-blue-600 hover:text-blue-800"
              >
                {allSelected ? "Deselect all" : "Select all"}
              </button>
            </div>

            {isL1 && (
              <div className="rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-800">
                <strong>CMMC Level 1 org:</strong> Identity and Authentication packs cover your 17 FCI safeguarding requirements. The remaining packs assess NIST SP 800-171 controls applicable at Level 2.
              </div>
            )}

            <div className="space-y-2">
              {ALL_PACKS.map((pack) => {
                const isSelected = selectedPacks.includes(pack.id);
                return (
                  <button
                    key={pack.id}
                    onClick={() => togglePack(pack.id)}
                    className={`w-full flex items-start gap-3 rounded-lg border p-3 text-left transition-colors ${
                      isSelected
                        ? "border-blue-300 bg-blue-50"
                        : "border-gray-200 bg-white hover:border-gray-300"
                    }`}
                  >
                    {isSelected
                      ? <CheckSquare className="h-4 w-4 text-blue-600 mt-0.5 shrink-0" />
                      : <Square className="h-4 w-4 text-gray-300 mt-0.5 shrink-0" />}
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-medium text-gray-800">{pack.name}</p>
                        {pack.l1Relevant
                          ? <span className="inline-flex items-center rounded-full bg-green-100 px-2 py-0.5 text-[10px] font-semibold text-green-700">L1 Relevant</span>
                          : <span className="inline-flex items-center rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-medium text-gray-500">L2 / NIST SP 800-171</span>
                        }
                      </div>
                      <p className="text-xs text-gray-500 mt-0.5">{pack.desc}</p>
                      <p className="text-[11px] text-blue-600 mt-1">Controls: {pack.controls}</p>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {error && (
            <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}

          <div className="flex justify-end">
            <button
              onClick={runScan}
              disabled={running || selectedPacks.length === 0}
              className="inline-flex items-center gap-2 rounded-md bg-blue-600 px-6 py-2.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60"
            >
              {running ? (
                <><Loader2 className="h-4 w-4 animate-spin" /> Starting Scan…</>
              ) : (
                <><Play className="h-4 w-4" /> Run Tenant Assessment</>
              )}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
