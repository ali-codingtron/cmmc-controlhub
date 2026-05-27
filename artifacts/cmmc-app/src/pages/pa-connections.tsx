import { useState, useCallback, useEffect } from "react";
import {
  Cable,
  RefreshCw,
  CheckCircle2,
  XCircle,
  Clock,
  Wifi,
  WifiOff,
  AlertTriangle,
  Loader2,
  Trash2,
  Play,
  ShieldCheck,
  ExternalLink,
  Info,
} from "lucide-react";
import { useOrg } from "@/context/OrgContext";
import { useLocation } from "wouter";

type Connection = {
  id: string;
  tenantName: string;
  microsoftTenantId: string;
  primaryDomain: string | null;
  authMode: string;
  connectionStatus: string;
  permissionsGranted: string[];
  lastSuccessfulScan: string | null;
  lastFailedScan: string | null;
  lastFailedReason: string | null;
  connectedBy: string | null;
  connectedAt: string | null;
  notes: string | null;
  createdAt: string;
};

const PERMISSION_PACKS = [
  {
    id: "identity",
    name: "Identity Pack",
    use: "Enumerate users, guests, and stale accounts",
    perms: [
      { name: "User.Read.All", desc: "Read all user profiles" },
      { name: "Group.Read.All", desc: "Read group memberships" },
      { name: "Directory.Read.All", desc: "Read directory objects" },
    ],
  },
  {
    id: "authentication",
    name: "Authentication Pack",
    use: "Verify MFA registration and auth method coverage",
    perms: [
      { name: "Reports.Read.All", desc: "Read usage and authentication reports" },
      { name: "UserAuthenticationMethod.Read.All", desc: "Read registered auth methods per user" },
    ],
  },
  {
    id: "conditional_access",
    name: "Conditional Access Pack",
    use: "Review CA policies, MFA enforcement, legacy auth blocks",
    perms: [
      { name: "Policy.Read.All", desc: "Read conditional access and named location policies" },
    ],
  },
  {
    id: "devices",
    name: "Device / Intune Pack",
    use: "Inspect managed device inventory and compliance state",
    perms: [
      { name: "DeviceManagementManagedDevices.Read.All", desc: "Read Intune managed device records" },
    ],
  },
  {
    id: "audit",
    name: "Audit / Sign-in Pack",
    use: "Confirm sign-in logs and directory audit log availability",
    perms: [
      { name: "AuditLog.Read.All", desc: "Read sign-in and directory audit logs" },
    ],
  },
  {
    id: "secure_score",
    name: "Security Score Pack",
    use: "Snapshot Microsoft Secure Score recommendations",
    perms: [
      { name: "SecurityEvents.Read.All", desc: "Read security events and Secure Score" },
    ],
  },
];

function statusBadge(status: string) {
  const m: Record<string, { label: string; cls: string; icon: React.ReactNode }> = {
    connected: { label: "Connected", cls: "bg-green-100 text-green-700", icon: <Wifi className="h-3 w-3" /> },
    pending: { label: "Pending Consent", cls: "bg-yellow-100 text-yellow-700", icon: <Clock className="h-3 w-3" /> },
    error: { label: "Error", cls: "bg-red-100 text-red-700", icon: <AlertTriangle className="h-3 w-3" /> },
    disconnected: { label: "Disconnected", cls: "bg-gray-100 text-gray-500", icon: <WifiOff className="h-3 w-3" /> },
  };
  const entry = m[status] ?? m.pending;
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ${entry.cls}`}>
      {entry.icon} {entry.label}
    </span>
  );
}

export default function PaConnections() {
  const { activeOrg } = useOrg();
  const [, navigate] = useLocation();
  const [connections, setConnections] = useState<Connection[]>([]);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);
  const [testingId, setTestingId] = useState<string | null>(null);
  const [testResults, setTestResults] = useState<Record<string, { success: boolean; error?: string; displayName?: string }>>({});
  const [disconnectingId, setDisconnectingId] = useState<string | null>(null);
  const [banner, setBanner] = useState<{ type: "success" | "error"; message: string } | null>(null);

  useEffect(() => {
    const search = new URLSearchParams(window.location.search);
    const connectedParam = search.get("connected");
    const errorParam = search.get("error");
    const tenantName = search.get("tenantName");

    if (connectedParam === "true") {
      setBanner({
        type: "success",
        message: tenantName
          ? `"${tenantName}" connected successfully. You can now run an assessment.`
          : "Tenant connected successfully. You can now run an assessment.",
      });
      window.history.replaceState({}, "", "/pre-assessment/connections");
    } else if (errorParam) {
      setBanner({
        type: "error",
        message: decodeURIComponent(errorParam),
      });
      window.history.replaceState({}, "", "/pre-assessment/connections");
    }
  }, []);

  const load = useCallback(() => {
    if (!activeOrg) return;
    setLoading(true);
    const token = localStorage.getItem("auth_token");
    fetch("/api/pre-assessment/connections", {
      headers: { Authorization: `Bearer ${token}`, "X-Organization-ID": activeOrg.id },
    })
      .then((r) => r.json())
      .then((d) => { setConnections(d.connections ?? []); setLoaded(true); setLoading(false); })
      .catch(() => { setLoading(false); setLoaded(true); });
  }, [activeOrg]);

  if (!loaded && !loading && activeOrg) load();

  async function startConsent() {
    if (!activeOrg) return;
    setStarting(true);
    setStartError(null);
    const token = localStorage.getItem("auth_token");
    try {
      const res = await fetch("/api/pre-assessment/microsoft/connect/start", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "X-Organization-ID": activeOrg.id },
      });
      const data = await res.json();
      if (!res.ok || !data.authUrl) {
        setStartError(data.detail ?? data.error ?? "Failed to start Microsoft authorization.");
        setStarting(false);
        return;
      }
      window.location.href = data.authUrl;
    } catch {
      setStartError("Network error. Please try again.");
      setStarting(false);
    }
  }

  async function testConnection(id: string) {
    if (!activeOrg) return;
    setTestingId(id);
    const token = localStorage.getItem("auth_token");
    const res = await fetch(`/api/pre-assessment/connections/${id}/test`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "X-Organization-ID": activeOrg.id },
    });
    const data = await res.json().catch(() => ({ success: false, error: "Unknown error" }));
    setTestResults((prev) => ({ ...prev, [id]: data }));
    setTestingId(null);
    setLoaded(false);
    load();
  }

  async function disconnect(id: string, name: string) {
    if (!activeOrg || !confirm(`Disconnect "${name}"? Historical scans are preserved but scheduled scans will stop.`)) return;
    setDisconnectingId(id);
    const token = localStorage.getItem("auth_token");
    await fetch(`/api/pre-assessment/connections/${id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}`, "X-Organization-ID": activeOrg.id },
    });
    setDisconnectingId(null);
    setLoaded(false);
    load();
  }

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-600 text-white">
            <Cable className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-gray-900">Tenant Connections</h1>
            <p className="text-sm text-gray-500">Connect a Microsoft 365 / Entra tenant for automated read-only pre-assessments</p>
          </div>
        </div>
        <button
          onClick={startConsent}
          disabled={starting}
          className="inline-flex items-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60"
        >
          {starting ? <Loader2 className="h-4 w-4 animate-spin" /> : <ExternalLink className="h-4 w-4" />}
          {starting ? "Redirecting to Microsoft…" : "Connect Microsoft Tenant"}
        </button>
      </div>

      {banner && (
        <div className={`flex items-start gap-3 rounded-lg border px-4 py-3 text-sm ${
          banner.type === "success" ? "border-green-200 bg-green-50 text-green-800" : "border-red-200 bg-red-50 text-red-700"
        }`}>
          {banner.type === "success"
            ? <CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0" />
            : <XCircle className="h-4 w-4 mt-0.5 shrink-0" />}
          <span>{banner.message}</span>
          <button onClick={() => setBanner(null)} className="ml-auto text-inherit opacity-60 hover:opacity-100">×</button>
        </div>
      )}

      {startError && (
        <div className="flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <XCircle className="h-4 w-4 mt-0.5 shrink-0" />
          <span>{startError}</span>
        </div>
      )}

      <div className="rounded-lg border border-blue-100 bg-blue-50 px-4 py-3 text-sm text-blue-800 flex items-start gap-2">
        <ShieldCheck className="h-4 w-4 mt-0.5 shrink-0" />
        <span>
          <strong>Read-only access.</strong> Control HUB uses read-only Microsoft Graph permissions for assessment purposes.
          No tenant configuration changes are made. Your Microsoft admin password is never collected or stored.
        </span>
      </div>

      {loading && (
        <div className="flex items-center justify-center py-20 text-gray-400">
          <RefreshCw className="mr-2 h-5 w-5 animate-spin" /> Loading…
        </div>
      )}

      {loaded && connections.length === 0 && (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-gray-300 bg-gray-50 py-16 text-center">
          <Cable className="h-12 w-12 text-gray-300 mb-4" />
          <p className="text-base font-medium text-gray-700">No tenant connections yet</p>
          <p className="text-sm text-gray-500 mt-1 mb-6 max-w-sm">
            Click <strong>Connect Microsoft Tenant</strong> to begin. You'll be redirected to Microsoft
            to grant read-only permissions — no passwords are collected here.
          </p>
          <button
            onClick={startConsent}
            disabled={starting}
            className="inline-flex items-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60"
          >
            {starting ? <Loader2 className="h-4 w-4 animate-spin" /> : <ExternalLink className="h-4 w-4" />}
            {starting ? "Redirecting to Microsoft…" : "Connect with Microsoft Admin Consent"}
          </button>
        </div>
      )}

      {connections.map((conn) => (
        <div key={conn.id} className="rounded-xl border border-gray-200 bg-white p-5 space-y-4">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="flex items-center gap-2 mb-1 flex-wrap">
                <h3 className="font-semibold text-gray-900">{conn.tenantName}</h3>
                {statusBadge(conn.connectionStatus)}
              </div>
              <p className="text-xs text-gray-500 font-mono">{conn.microsoftTenantId}</p>
              {conn.primaryDomain && <p className="text-xs text-gray-400 mt-0.5">{conn.primaryDomain}</p>}
            </div>
            <div className="flex items-center gap-2 shrink-0 flex-wrap justify-end">
              {conn.connectionStatus === "connected" && (
                <button
                  onClick={() => navigate(`/pre-assessment/run?connectionId=${conn.id}`)}
                  className="inline-flex items-center gap-1.5 rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700"
                >
                  <Play className="h-3.5 w-3.5" /> Run Assessment
                </button>
              )}
              <button
                onClick={() => testConnection(conn.id)}
                disabled={testingId === conn.id}
                className="inline-flex items-center gap-1.5 rounded-md border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              >
                {testingId === conn.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                Test Connection
              </button>
              <button
                onClick={() => disconnect(conn.id, conn.tenantName)}
                disabled={disconnectingId === conn.id}
                className="inline-flex items-center gap-1.5 rounded-md border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-100 disabled:opacity-50"
              >
                {disconnectingId === conn.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                Disconnect
              </button>
            </div>
          </div>

          {testResults[conn.id] && (
            <div className={`flex items-center gap-2 rounded-md px-3 py-2 text-xs ${testResults[conn.id].success ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"}`}>
              {testResults[conn.id].success
                ? <><CheckCircle2 className="h-3.5 w-3.5 shrink-0" /> Connection verified — Microsoft Graph reachable.</>
                : <><XCircle className="h-3.5 w-3.5 shrink-0" /> {testResults[conn.id].error}</>}
            </div>
          )}

          {conn.lastFailedReason && !testResults[conn.id] && (
            <div className="flex items-start gap-1.5 text-xs text-red-600">
              <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
              <span>Last error: {conn.lastFailedReason}</span>
            </div>
          )}

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs text-gray-600 border-t border-gray-100 pt-3">
            <div>
              <p className="text-gray-400 uppercase tracking-wide text-[10px] mb-0.5">Auth Method</p>
              <p className="flex items-center gap-1">
                <ShieldCheck className="h-3 w-3 text-green-500" />
                Microsoft Admin Consent
              </p>
            </div>
            <div>
              <p className="text-gray-400 uppercase tracking-wide text-[10px] mb-0.5">Last Successful Scan</p>
              <p>{conn.lastSuccessfulScan ? new Date(conn.lastSuccessfulScan).toLocaleDateString() : "Never"}</p>
            </div>
            <div>
              <p className="text-gray-400 uppercase tracking-wide text-[10px] mb-0.5">Connected By</p>
              <p>{conn.connectedBy ?? "—"}</p>
            </div>
            <div>
              <p className="text-gray-400 uppercase tracking-wide text-[10px] mb-0.5">Connected Date</p>
              <p>{conn.connectedAt ? new Date(conn.connectedAt).toLocaleDateString() : "—"}</p>
            </div>
          </div>

          {conn.notes && <p className="text-xs text-gray-500 italic">{conn.notes}</p>}
        </div>
      ))}

      <div className="rounded-xl border border-gray-200 bg-gray-50 p-5">
        <div className="flex items-center gap-2 mb-4">
          <Info className="h-4 w-4 text-gray-500" />
          <h3 className="text-sm font-semibold text-gray-800">Permissions Requested</h3>
        </div>
        <p className="text-xs text-gray-500 mb-4">
          When you click <strong>Connect Microsoft Tenant</strong>, your Microsoft global administrator
          will be directed to Microsoft's official consent page to approve the following read-only permissions.
          Control HUB never sees or stores your Microsoft admin password.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {PERMISSION_PACKS.map((pack) => (
            <div key={pack.id} className="rounded-lg border border-gray-200 bg-white p-3">
              <p className="text-xs font-semibold text-gray-800 mb-0.5">{pack.name}</p>
              <p className="text-[11px] text-gray-500 mb-2">{pack.use}</p>
              <div className="space-y-1">
                {pack.perms.map((perm) => (
                  <div key={perm.name} className="flex items-start gap-1.5">
                    <span className="inline-block rounded bg-blue-50 px-1.5 py-0.5 text-[10px] font-mono text-blue-700 shrink-0 mt-0.5">
                      {perm.name}
                    </span>
                    <span className="text-[11px] text-gray-500">{perm.desc}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
        <p className="text-[11px] text-gray-400 mt-3 flex items-center gap-1">
          <ShieldCheck className="h-3 w-3" />
          All permissions are read-only. Control HUB cannot make changes to your Microsoft tenant.
        </p>
      </div>
    </div>
  );
}
