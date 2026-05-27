import { useState, useCallback } from "react";
import {
  Cable,
  Plus,
  RefreshCw,
  CheckCircle2,
  XCircle,
  Clock,
  Wifi,
  WifiOff,
  AlertTriangle,
  Loader2,
  Eye,
  EyeOff,
  Trash2,
  Play,
} from "lucide-react";
import { useOrg } from "@/context/OrgContext";

type Connection = {
  id: string;
  tenantName: string;
  microsoftTenantId: string;
  primaryDomain: string | null;
  authMode: string;
  clientId: string | null;
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

function statusBadge(status: string) {
  const m: Record<string, { label: string; cls: string; icon: React.ReactNode }> = {
    connected: { label: "Connected", cls: "bg-green-100 text-green-700", icon: <Wifi className="h-3 w-3" /> },
    pending: { label: "Pending", cls: "bg-yellow-100 text-yellow-700", icon: <Clock className="h-3 w-3" /> },
    error: { label: "Error", cls: "bg-red-100 text-red-700", icon: <AlertTriangle className="h-3 w-3" /> },
    disconnected: { label: "Disconnected", cls: "bg-gray-100 text-gray-600", icon: <WifiOff className="h-3 w-3" /> },
  };
  const entry = m[status] ?? m.pending;
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ${entry.cls}`}>
      {entry.icon} {entry.label}
    </span>
  );
}

type FormData = {
  tenantName: string;
  microsoftTenantId: string;
  primaryDomain: string;
  clientId: string;
  clientSecret: string;
  notes: string;
};

const EMPTY_FORM: FormData = {
  tenantName: "",
  microsoftTenantId: "",
  primaryDomain: "",
  clientId: "",
  clientSecret: "",
  notes: "",
};

export default function PaConnections() {
  const { activeOrg } = useOrg();
  const [connections, setConnections] = useState<Connection[]>([]);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState<FormData>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [showSecret, setShowSecret] = useState(false);
  const [testingId, setTestingId] = useState<string | null>(null);
  const [testResults, setTestResults] = useState<Record<string, { success: boolean; error?: string }>>({});
  const [disconnectingId, setDisconnectingId] = useState<string | null>(null);

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

  async function addConnection() {
    if (!activeOrg || !form.tenantName.trim() || !form.microsoftTenantId.trim()) {
      setFormError("Tenant name and Microsoft Tenant ID are required.");
      return;
    }
    setSaving(true);
    setFormError(null);
    const token = localStorage.getItem("auth_token");
    const res = await fetch("/api/pre-assessment/connections", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        "X-Organization-ID": activeOrg.id,
      },
      body: JSON.stringify(form),
    });
    if (!res.ok) {
      const b = await res.json().catch(() => ({}));
      setFormError(b.error ?? "Failed to add connection.");
      setSaving(false);
      return;
    }
    setSaving(false);
    setShowAdd(false);
    setForm(EMPTY_FORM);
    setLoaded(false);
    load();
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

  async function disconnect(id: string) {
    if (!activeOrg || !confirm("Disconnect this tenant? Credentials will be removed. Historical scans are preserved.")) return;
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
            <p className="text-sm text-gray-500">Connect Microsoft 365 / Entra tenants for automated read-only pre-assessments</p>
          </div>
        </div>
        <button
          onClick={() => setShowAdd(true)}
          className="inline-flex items-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          <Plus className="h-4 w-4" /> Connect Microsoft Tenant
        </button>
      </div>

      <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800">
        <strong>Read-Only.</strong> Control HUB requests read-only Microsoft Graph permissions only. No changes are made to your Microsoft tenant.
      </div>

      {loading && (
        <div className="flex items-center justify-center py-20 text-gray-400">
          <RefreshCw className="mr-2 h-5 w-5 animate-spin" /> Loading…
        </div>
      )}

      {loaded && connections.length === 0 && (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-gray-300 bg-gray-50 py-20 text-center">
          <Cable className="h-12 w-12 text-gray-300 mb-4" />
          <p className="text-base font-medium text-gray-700">No tenant connections</p>
          <p className="text-sm text-gray-500 mt-1 mb-6 max-w-sm">Connect a Microsoft 365 / Entra tenant to enable automated CMMC readiness pre-assessments.</p>
          <button
            onClick={() => setShowAdd(true)}
            className="inline-flex items-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            <Plus className="h-4 w-4" /> Connect Microsoft Tenant
          </button>
        </div>
      )}

      {connections.map((conn) => (
        <div key={conn.id} className="rounded-xl border border-gray-200 bg-white p-5 space-y-3">
          <div className="flex items-start justify-between">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <h3 className="font-semibold text-gray-900">{conn.tenantName}</h3>
                {statusBadge(conn.connectionStatus)}
              </div>
              <p className="text-xs text-gray-500 font-mono">{conn.microsoftTenantId}</p>
              {conn.primaryDomain && <p className="text-xs text-gray-400">{conn.primaryDomain}</p>}
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => testConnection(conn.id)}
                disabled={testingId === conn.id}
                className="inline-flex items-center gap-1.5 rounded-md border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              >
                {testingId === conn.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                Test Connection
              </button>
              <button
                onClick={() => disconnect(conn.id)}
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
                ? <><CheckCircle2 className="h-3.5 w-3.5" /> Connection test successful.</>
                : <><XCircle className="h-3.5 w-3.5" /> {testResults[conn.id].error}</>}
            </div>
          )}

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs text-gray-600">
            <div>
              <p className="text-gray-400 uppercase tracking-wide text-[10px] mb-0.5">Auth Mode</p>
              <p>{conn.authMode === "app_only" ? "App-Only" : "Delegated"}</p>
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

          {conn.lastFailedReason && (
            <div className="flex items-start gap-1.5 text-xs text-red-600">
              <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
              <span>Last error: {conn.lastFailedReason}</span>
            </div>
          )}

          {conn.notes && <p className="text-xs text-gray-500 italic">{conn.notes}</p>}
        </div>
      ))}

      {showAdd && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="w-full max-w-lg rounded-xl bg-white p-6 shadow-xl space-y-4 mx-4">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold text-gray-900">Connect Microsoft Tenant</h2>
              <button onClick={() => { setShowAdd(false); setFormError(null); setForm(EMPTY_FORM); }} className="text-gray-400 hover:text-gray-700">
                <XCircle className="h-5 w-5" />
              </button>
            </div>

            <div className="rounded-lg bg-amber-50 border border-amber-200 p-3 text-xs text-amber-800">
              <strong>App-Only Mode.</strong> Register an Azure AD app registration with read-only Graph API permissions and provide the credentials below. No user sign-in required for scheduled scans.
            </div>

            {[
              { key: "tenantName", label: "Tenant Name", placeholder: "Contoso Corp" },
              { key: "microsoftTenantId", label: "Microsoft Tenant ID", placeholder: "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" },
              { key: "primaryDomain", label: "Primary Domain (optional)", placeholder: "contoso.onmicrosoft.com" },
              { key: "clientId", label: "App Registration Client ID", placeholder: "Application (client) ID from Azure AD" },
            ].map(({ key, label, placeholder }) => (
              <div key={key}>
                <label className="block text-xs font-medium text-gray-700 mb-1">{label}</label>
                <input
                  type="text"
                  value={(form as any)[key]}
                  onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
                  placeholder={placeholder}
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>
            ))}

            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Client Secret</label>
              <div className="relative">
                <input
                  type={showSecret ? "text" : "password"}
                  value={form.clientSecret}
                  onChange={(e) => setForm((f) => ({ ...f, clientSecret: e.target.value }))}
                  placeholder="Client secret value (encrypted at rest)"
                  className="w-full rounded-md border border-gray-300 px-3 py-2 pr-10 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
                <button
                  type="button"
                  onClick={() => setShowSecret((v) => !v)}
                  className="absolute right-2.5 top-2.5 text-gray-400 hover:text-gray-700"
                >
                  {showSecret ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              <p className="text-[11px] text-gray-400 mt-1">Stored encrypted using AES-256-GCM. Never displayed after saving.</p>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Notes (optional)</label>
              <textarea
                value={form.notes}
                onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                rows={2}
                placeholder="e.g., Production Entra tenant for Contoso CMMC assessment"
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>

            {formError && (
              <p className="text-xs text-red-600">{formError}</p>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => { setShowAdd(false); setFormError(null); setForm(EMPTY_FORM); }}
                className="rounded-md border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={addConnection}
                disabled={saving}
                className="inline-flex items-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60"
              >
                {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                {saving ? "Saving…" : "Save Connection"}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="rounded-xl border border-gray-200 bg-gray-50 p-5">
        <h3 className="text-sm font-semibold text-gray-800 mb-3">Required Permission Packs</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {[
            { name: "Identity Pack", perms: ["User.Read.All", "Directory.Read.All"], use: "Users, guests, stale accounts" },
            { name: "Authentication Pack", perms: ["Reports.Read.All", "UserAuthenticationMethod.Read.All"], use: "MFA registration, auth methods" },
            { name: "Conditional Access Pack", perms: ["Policy.Read.All"], use: "CA policies, MFA enforcement" },
            { name: "Device / Intune Pack", perms: ["DeviceManagementManagedDevices.Read.All"], use: "Managed devices, compliance state" },
            { name: "Audit / Sign-in Pack", perms: ["AuditLog.Read.All"], use: "Sign-in logs, directory audit logs" },
            { name: "Security Score Pack", perms: ["SecurityEvents.Read.All"], use: "Microsoft Secure Score" },
          ].map((p) => (
            <div key={p.name} className="rounded-lg border border-gray-200 bg-white p-3">
              <p className="text-xs font-semibold text-gray-800 mb-1">{p.name}</p>
              <p className="text-[11px] text-gray-500 mb-1.5">{p.use}</p>
              <div className="flex flex-wrap gap-1">
                {p.perms.map((perm) => (
                  <span key={perm} className="inline-block rounded bg-blue-50 px-1.5 py-0.5 text-[10px] font-mono text-blue-700">
                    {perm}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
        <p className="text-xs text-gray-400 mt-3">All permissions are read-only. Grant via App Registration in Azure Portal → API Permissions → Microsoft Graph → Application permissions.</p>
      </div>
    </div>
  );
}
