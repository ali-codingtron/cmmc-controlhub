import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useOrg } from "@/context/OrgContext";
import { useAuth } from "@/lib/auth";
import {
  ShieldCheck,
  Building2,
  Key,
  Globe,
  ToggleLeft,
  ToggleRight,
  Loader2,
  Check,
  AlertTriangle,
  Info,
} from "lucide-react";
import { cn } from "@/lib/utils";

function apiFetch(url: string, options?: RequestInit): Promise<Response> {
  const token = localStorage.getItem("auth_token");
  const orgId = localStorage.getItem("cmmc_active_org_id");
  const headers = new Headers(options?.headers);
  if (token) headers.set("Authorization", `Bearer ${token}`);
  if (orgId) headers.set("X-Organization-ID", orgId);
  headers.set("Content-Type", "application/json");
  return fetch(url, { ...options, headers });
}

interface SsoConfig {
  id: string;
  organizationId: string;
  provider: string;
  clientId: string;
  tenantId: string;
  emailDomain: string | null;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

interface SsoFormValues {
  clientId: string;
  tenantId: string;
  clientSecret: string;
  emailDomain: string;
  enabled: boolean;
}

async function fetchSsoConfig(): Promise<SsoConfig | null> {
  const res = await apiFetch("/api/sso/config");
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Failed to fetch SSO config: ${res.status}`);
  return res.json();
}

async function saveSsoConfig(values: SsoFormValues): Promise<SsoConfig> {
  const res = await apiFetch("/api/sso/config", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(values),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "Save failed" }));
    throw new Error(err.error ?? "Save failed");
  }
  return res.json();
}

async function updateSsoConfig(id: string, values: Partial<SsoFormValues>): Promise<SsoConfig> {
  const res = await apiFetch(`/api/sso/config/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(values),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "Update failed" }));
    throw new Error(err.error ?? "Update failed");
  }
  return res.json();
}

async function deleteSsoConfig(id: string): Promise<void> {
  const res = await apiFetch(`/api/sso/config/${id}`, { method: "DELETE" });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "Delete failed" }));
    throw new Error(err.error ?? "Delete failed");
  }
}

export default function SsoSettings() {
  const { activeOrg: org } = useOrg();
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const isAdmin = user?.role === "admin" || user?.role === "compliance_manager";

  const { data: config, isLoading } = useQuery<SsoConfig | null>({
    queryKey: ["sso-config", org?.id],
    queryFn: fetchSsoConfig,
    enabled: !!org?.id && isAdmin,
  });

  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<SsoFormValues>({
    clientId: "",
    tenantId: "",
    clientSecret: "",
    emailDomain: "",
    enabled: true,
  });
  const [formError, setFormError] = useState("");
  const [saved, setSaved] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const saveMutation = useMutation({
    mutationFn: async (vals: SsoFormValues) => {
      if (config?.id) {
        return updateSsoConfig(config.id, vals);
      }
      return saveSsoConfig(vals);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sso-config"] });
      setEditing(false);
      setSaved(true);
      setFormError("");
      setTimeout(() => setSaved(false), 3000);
    },
    onError: (e: Error) => {
      setFormError(e.message);
    },
  });

  const toggleMutation = useMutation({
    mutationFn: (enabled: boolean) => updateSsoConfig(config!.id, { enabled }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["sso-config"] }),
  });

  const deleteMutation = useMutation({
    mutationFn: () => deleteSsoConfig(config!.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sso-config"] });
      setConfirmDelete(false);
    },
    onError: (e: Error) => setFormError(e.message),
  });

  function startEdit() {
    setForm({
      clientId: config?.clientId ?? "",
      tenantId: config?.tenantId ?? "",
      clientSecret: "",
      emailDomain: config?.emailDomain ?? "",
      enabled: config?.enabled ?? true,
    });
    setFormError("");
    setEditing(true);
  }

  function cancelEdit() {
    setEditing(false);
    setFormError("");
  }

  function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setFormError("");
    if (!form.clientId.trim() || !form.tenantId.trim() || (!config && !form.clientSecret.trim())) {
      setFormError("Application ID, Directory ID, and Client Secret are required.");
      return;
    }
    saveMutation.mutate(form);
  }

  if (!isAdmin) {
    return (
      <div className="max-w-2xl mx-auto p-6">
        <div className="rounded-lg border bg-muted/30 p-8 text-center">
          <ShieldCheck className="h-10 w-10 mx-auto mb-3 text-muted-foreground" />
          <p className="text-muted-foreground text-sm">Admin access required to manage SSO settings.</p>
        </div>
      </div>
    );
  }

  const callbackUrl = `${window.location.origin}/api/auth/sso/callback`;

  return (
    <div className="max-w-2xl mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <ShieldCheck className="h-6 w-6 text-primary" />
            Microsoft Entra ID SSO
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Allow users to sign in with their Microsoft 365 accounts.
          </p>
        </div>
        {config && (
          <Badge variant={config.enabled ? "default" : "secondary"} className="mt-1">
            {config.enabled ? "Enabled" : "Disabled"}
          </Badge>
        )}
      </div>

      {/* Instructions box */}
      <div className="rounded-lg border bg-blue-50 border-blue-200 p-4 space-y-3 text-sm">
        <div className="flex items-center gap-2 font-semibold text-blue-800">
          <Info className="h-4 w-4 shrink-0" />
          App Registration Required
        </div>
        <ol className="list-decimal list-inside space-y-1.5 text-blue-700 text-xs">
          <li>In the Azure Portal, go to <strong>Microsoft Entra ID → App registrations → New registration</strong>.</li>
          <li>Set redirect URI (type: <strong>Web</strong>) to the callback URL below.</li>
          <li>Under <strong>Certificates &amp; secrets</strong>, create a new client secret.</li>
          <li>Copy the Application (client) ID, Directory (tenant) ID, and client secret below.</li>
        </ol>
        <div className="flex items-center gap-2 mt-2">
          <div className="flex-1 rounded bg-blue-100 border border-blue-200 px-3 py-2 font-mono text-xs text-blue-900 break-all select-all">
            {callbackUrl}
          </div>
          <Button
            size="sm"
            variant="outline"
            className="shrink-0 text-xs border-blue-300 text-blue-800 hover:bg-blue-100"
            onClick={() => navigator.clipboard.writeText(callbackUrl)}
          >
            Copy
          </Button>
        </div>
      </div>

      {/* Current config */}
      {isLoading ? (
        <div className="flex items-center gap-2 text-muted-foreground text-sm py-4">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading SSO configuration…
        </div>
      ) : config && !editing ? (
        <div className="rounded-lg border bg-card p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-sm text-foreground">Current Configuration</h2>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => toggleMutation.mutate(!config.enabled)}
                disabled={toggleMutation.isPending}
                className="text-muted-foreground hover:text-foreground transition-colors"
                title={config.enabled ? "Disable SSO" : "Enable SSO"}
              >
                {toggleMutation.isPending ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : config.enabled ? (
                  <ToggleRight className="h-5 w-5 text-green-500" />
                ) : (
                  <ToggleLeft className="h-5 w-5" />
                )}
              </button>
            </div>
          </div>

          <div className="grid gap-3 text-sm">
            <div className="flex items-start gap-3">
              <Building2 className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
              <div>
                <div className="text-xs text-muted-foreground font-medium">Application (client) ID</div>
                <div className="font-mono text-xs mt-0.5">{config.clientId}</div>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <Globe className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
              <div>
                <div className="text-xs text-muted-foreground font-medium">Directory (tenant) ID</div>
                <div className="font-mono text-xs mt-0.5">{config.tenantId}</div>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <Key className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
              <div>
                <div className="text-xs text-muted-foreground font-medium">Client Secret</div>
                <div className="text-xs mt-0.5 text-muted-foreground">●●●●●●●●●●●● (stored encrypted)</div>
              </div>
            </div>
            {config.emailDomain && (
              <div className="flex items-start gap-3">
                <ShieldCheck className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                <div>
                  <div className="text-xs text-muted-foreground font-medium">Email Domain</div>
                  <div className="font-mono text-xs mt-0.5">{config.emailDomain}</div>
                </div>
              </div>
            )}
          </div>

          {saved && (
            <div className="flex items-center gap-2 text-green-700 text-sm">
              <Check className="h-4 w-4" /> Configuration saved successfully.
            </div>
          )}

          <div className="flex items-center gap-2 pt-1">
            <Button size="sm" variant="outline" onClick={startEdit}>Edit Configuration</Button>
            {confirmDelete ? (
              <div className="flex items-center gap-2">
                <span className="text-xs text-destructive">Remove SSO config?</span>
                <Button
                  size="sm"
                  variant="destructive"
                  disabled={deleteMutation.isPending}
                  onClick={() => deleteMutation.mutate()}
                >
                  {deleteMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : "Yes, remove"}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setConfirmDelete(false)}>Cancel</Button>
              </div>
            ) : (
              <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive" onClick={() => setConfirmDelete(true)}>
                Remove
              </Button>
            )}
          </div>
        </div>
      ) : null}

      {/* Form — create or edit */}
      {(!config || editing) && (
        <form onSubmit={handleSave} className="rounded-lg border bg-card p-5 space-y-4">
          <h2 className="font-semibold text-sm">
            {config ? "Edit Configuration" : "Configure Entra ID SSO"}
          </h2>

          <div className="space-y-1.5">
            <Label htmlFor="clientId" className="text-sm font-medium">
              Application (client) ID <span className="text-destructive">*</span>
            </Label>
            <Input
              id="clientId"
              placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
              className="h-9 font-mono text-sm"
              value={form.clientId}
              onChange={(e) => setForm((f) => ({ ...f, clientId: e.target.value }))}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="tenantId" className="text-sm font-medium">
              Directory (tenant) ID <span className="text-destructive">*</span>
            </Label>
            <Input
              id="tenantId"
              placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
              className="h-9 font-mono text-sm"
              value={form.tenantId}
              onChange={(e) => setForm((f) => ({ ...f, tenantId: e.target.value }))}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="clientSecret" className="text-sm font-medium">
              Client Secret {!config && <span className="text-destructive">*</span>}
              {config && <span className="text-xs text-muted-foreground ml-1">(leave blank to keep existing)</span>}
            </Label>
            <Input
              id="clientSecret"
              type="password"
              placeholder={config ? "Enter new secret to rotate…" : "Paste client secret…"}
              className="h-9"
              value={form.clientSecret}
              onChange={(e) => setForm((f) => ({ ...f, clientSecret: e.target.value }))}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="emailDomain" className="text-sm font-medium">
              Email Domain
              <span className="text-xs text-muted-foreground ml-1">(optional — required for "Sign in with Microsoft" auto-detection)</span>
            </Label>
            <Input
              id="emailDomain"
              placeholder="contoso.com"
              className="h-9 font-mono text-sm"
              value={form.emailDomain}
              onChange={(e) => setForm((f) => ({ ...f, emailDomain: e.target.value }))}
            />
            <p className="text-xs text-muted-foreground">
              When set, users entering an email with this domain on the login page will be directed to Microsoft sign-in.
            </p>
          </div>

          {formError && (
            <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2.5 text-sm text-destructive">
              <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
              <span>{formError}</span>
            </div>
          )}

          <div className="flex items-center gap-2 pt-1">
            <Button type="submit" size="sm" disabled={saveMutation.isPending}>
              {saveMutation.isPending ? (
                <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />Saving…</>
              ) : (
                <><Check className="h-3.5 w-3.5 mr-1.5" />Save Configuration</>
              )}
            </Button>
            {editing && (
              <Button type="button" size="sm" variant="ghost" onClick={cancelEdit}>
                Cancel
              </Button>
            )}
          </div>
        </form>
      )}

      {/* Info callout if no config */}
      {!isLoading && !config && !editing && (
        <div className="text-center py-2 text-sm text-muted-foreground">
          No SSO configuration yet.{" "}
          <button
            className="text-primary hover:underline font-medium"
            onClick={() => { setEditing(true); setForm({ clientId: "", tenantId: "", clientSecret: "", emailDomain: "", enabled: true }); }}
          >
            Set it up now
          </button>
        </div>
      )}
    </div>
  );
}
