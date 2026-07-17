import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Eye, EyeOff, User, KeyRound, Shield, Mail, AlertTriangle, CheckCircle2, Send, Package, ChevronRight, Sparkles, ShieldOff } from "lucide-react";
import { Link } from "wouter";

function apiFetch(path: string, opts?: RequestInit) {
  const token = localStorage.getItem("auth_token");
  const base = (import.meta.env.BASE_URL ?? "").replace(/\/$/, "");
  return fetch(`${base}${path}`, {
    ...opts,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...opts?.headers,
    },
  });
}

function ProfileCard() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [name, setName] = useState(user?.name ?? "");
  const [title, setTitle] = useState("");
  const [department, setDepartment] = useState("");
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await apiFetch("/api/auth/profile", {
        method: "PATCH",
        body: JSON.stringify({ name, title, department }),
      });
      if (!res.ok) throw new Error("Failed to update profile");
      toast({ title: "Profile updated" });
    } catch {
      toast({ title: "Error", description: "Could not update profile", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <User className="h-5 w-5 text-primary" />
          <CardTitle>My Profile</CardTitle>
        </div>
        <CardDescription>Update your display name and contact details.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/40 mb-2">
          <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center font-semibold text-primary">
            {(user?.name ?? "?")[0].toUpperCase()}
          </div>
          <div>
            <div className="font-medium">{user?.email}</div>
            <Badge variant="outline" className="text-xs capitalize mt-0.5">
              {user?.role?.replace("_", " ")}
            </Badge>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="col-span-2">
            <Label>Display Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Your full name" />
          </div>
          <div>
            <Label>Title</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Compliance Manager" />
          </div>
          <div>
            <Label>Department</Label>
            <Input value={department} onChange={(e) => setDepartment(e.target.value)} placeholder="e.g. IT Security" />
          </div>
        </div>
        <Button onClick={handleSave} disabled={saving}>
          {saving ? "Saving..." : "Save Profile"}
        </Button>
      </CardContent>
    </Card>
  );
}

function ChangePasswordCard() {
  const { toast } = useToast();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [saving, setSaving] = useState(false);

  const strength = newPassword.length === 0
    ? null
    : newPassword.length < 8
    ? "weak"
    : /[A-Z]/.test(newPassword) && /[0-9]/.test(newPassword) && newPassword.length >= 10
    ? "strong"
    : "moderate";

  const strengthColor = strength === "strong" ? "text-green-600" : strength === "moderate" ? "text-yellow-600" : "text-red-500";

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      toast({ title: "Passwords don't match", variant: "destructive" });
      return;
    }
    if (newPassword.length < 8) {
      toast({ title: "Password must be at least 8 characters", variant: "destructive" });
      return;
    }

    setSaving(true);
    try {
      const res = await apiFetch("/api/auth/change-password", {
        method: "POST",
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to change password");
      toast({ title: "Password changed successfully" });
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <KeyRound className="h-5 w-5 text-primary" />
          <CardTitle>Change Password</CardTitle>
        </div>
        <CardDescription>Use a strong, unique password. Minimum 8 characters.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label>Current Password</Label>
            <div className="relative">
              <Input
                type={showCurrent ? "text" : "password"}
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                placeholder="Enter your current password"
                required
              />
              <button
                type="button"
                onClick={() => setShowCurrent((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                {showCurrent ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          <div>
            <Label>New Password</Label>
            <div className="relative">
              <Input
                type={showNew ? "text" : "password"}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="At least 8 characters"
                required
              />
              <button
                type="button"
                onClick={() => setShowNew((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                {showNew ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            {strength && (
              <p className={`text-xs mt-1 ${strengthColor}`}>
                Password strength: <span className="font-medium capitalize">{strength}</span>
              </p>
            )}
          </div>

          <div>
            <Label>Confirm New Password</Label>
            <Input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Re-enter new password"
              required
            />
            {confirmPassword && newPassword !== confirmPassword && (
              <p className="text-xs mt-1 text-red-500">Passwords do not match</p>
            )}
          </div>

          <Button
            type="submit"
            disabled={saving || !currentPassword || !newPassword || newPassword !== confirmPassword}
          >
            {saving ? "Changing..." : "Change Password"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

function SecurityInfoCard() {
  const { user } = useAuth();
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Shield className="h-5 w-5 text-primary" />
          <CardTitle>Security</CardTitle>
        </div>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <div className="flex justify-between py-2 border-b">
          <span className="text-muted-foreground">Account role</span>
          <Badge variant="outline" className="capitalize">{user?.role?.replace("_", " ")}</Badge>
        </div>
        <div className="flex justify-between py-2 border-b">
          <span className="text-muted-foreground">Authentication</span>
          <span className="font-medium">Password</span>
        </div>
        <div className="flex justify-between py-2">
          <span className="text-muted-foreground">Session storage</span>
          <span className="font-medium">Local (browser)</span>
        </div>
      </CardContent>
    </Card>
  );
}

interface EmailSettingsInfo {
  provider: string;
  fromAddress: string;
  configured: boolean;
  missingKey: boolean;
}

function EmailSettingsCard() {
  const { toast } = useToast();

  const { data: info, isLoading } = useQuery<EmailSettingsInfo>({
    queryKey: ["admin", "email-settings"],
    queryFn: async () => {
      const res = await apiFetch("/api/admin/email-settings");
      if (!res.ok) throw new Error("Failed to load email settings");
      return res.json();
    },
    staleTime: 30_000,
  });

  const testMutation = useMutation({
    mutationFn: async () => {
      const res = await apiFetch("/api/admin/email-settings/test", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Test failed");
      return data as { success: boolean; sentTo: string };
    },
    onSuccess: (data) => {
      toast({ title: "Test email sent", description: `Delivered to ${data.sentTo}` });
    },
    onError: (err: any) => {
      toast({ title: "Test email failed", description: err.message, variant: "destructive" });
    },
  });

  const providerLabel = (p: string) => {
    if (p === "resend") return "Resend";
    if (p === "smtp") return "SMTP";
    return "Not configured";
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Mail className="h-5 w-5 text-primary" />
          <CardTitle>Email Delivery</CardTitle>
        </div>
        <CardDescription>
          Outbound email for invitations, password setup, MFA recovery, and notifications.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : info ? (
          <>
            {info.missingKey && (
              <div className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4">
                <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
                <div className="text-sm">
                  <p className="font-semibold text-amber-800">API key not configured</p>
                  <p className="text-amber-700 mt-0.5">
                    {info.provider === "resend"
                      ? "The RESEND_API_KEY secret is missing. Add it in Replit Secrets to enable email delivery."
                      : "Email delivery credentials are missing. Check your EMAIL_PROVIDER and related secrets."}
                  </p>
                </div>
              </div>
            )}

            {info.configured && (
              <div className="flex items-start gap-3 rounded-lg border border-green-200 bg-green-50 p-4">
                <CheckCircle2 className="h-5 w-5 text-green-600 shrink-0 mt-0.5" />
                <p className="text-sm font-medium text-green-800">Email delivery is active</p>
              </div>
            )}

            <div className="space-y-3 text-sm">
              <div className="flex justify-between py-2 border-b items-center">
                <span className="text-muted-foreground">Provider</span>
                <Badge variant={info.configured ? "default" : "secondary"} className="capitalize">
                  {providerLabel(info.provider)}
                </Badge>
              </div>
              <div className="flex justify-between py-2 border-b items-center">
                <span className="text-muted-foreground">From address</span>
                <span className="font-mono text-xs">{info.fromAddress}</span>
              </div>
              <div className="flex justify-between py-2 items-center">
                <span className="text-muted-foreground">Status</span>
                {info.configured ? (
                  <Badge className="bg-green-600 hover:bg-green-600 text-white">Connected</Badge>
                ) : (
                  <Badge variant="destructive">Not Connected</Badge>
                )}
              </div>
            </div>

            <div className="border-t pt-4">
              <p className="text-sm text-muted-foreground mb-3">
                Send a test email to your account to verify delivery is working.
              </p>
              <Button
                onClick={() => testMutation.mutate()}
                disabled={testMutation.isPending || !info.configured}
                variant="outline"
                className="gap-2"
              >
                {testMutation.isPending ? (
                  <>
                    <Send className="h-4 w-4 animate-pulse" />
                    Sending…
                  </>
                ) : (
                  <>
                    <Send className="h-4 w-4" />
                    Send Test Email
                  </>
                )}
              </Button>
              {!info.configured && (
                <p className="text-xs text-muted-foreground mt-2">
                  Configure email credentials above to enable the test.
                </p>
              )}
            </div>
          </>
        ) : (
          <p className="text-sm text-destructive">Failed to load email settings.</p>
        )}
      </CardContent>
    </Card>
  );
}

function SmartMappingCard() {
  const settings = [
    { label: "Smart Evidence Mapping", value: "Enabled", ok: true },
    { label: "Processing Mode", value: "Local Content Analysis", ok: true },
    { label: "External AI Processing", value: "Off", ok: false, isOff: true },
    { label: "Require User Confirmation", value: "On", ok: true },
    { label: "Auto-Link High Confidence", value: "Off", ok: false, isOff: true },
  ];

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-primary" />
          <CardTitle>Smart Evidence Mapping</CardTitle>
        </div>
        <CardDescription>
          Control HUB analyzes uploaded evidence locally to suggest relevant CMMC controls.
          No evidence data is sent to external AI services.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="rounded-md border divide-y">
          {settings.map((s) => (
            <div key={s.label} className="flex items-center justify-between px-3 py-2.5">
              <span className="text-sm text-muted-foreground">{s.label}</span>
              <span className={`inline-flex items-center gap-1.5 text-sm font-medium ${s.isOff ? "text-slate-500" : "text-emerald-700"}`}>
                {s.isOff ? (
                  <ShieldOff className="h-3.5 w-3.5 text-slate-400" />
                ) : (
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                )}
                {s.value}
              </span>
            </div>
          ))}
        </div>
        <p className="text-[11px] text-muted-foreground italic">
          Smart Evidence Mapping provides control-linking recommendations. The organization remains
          responsible for confirming that each artifact supports the selected requirement.
          Any future external AI integration requires explicit administrator approval.
        </p>
      </CardContent>
    </Card>
  );
}

export default function Settings() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";

  return (
    <div className="p-6 space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
        <p className="text-muted-foreground mt-1">Manage your account, password, and preferences.</p>
      </div>

      <ProfileCard />
      <ChangePasswordCard />
      <SecurityInfoCard />
      <SmartMappingCard />

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Package className="h-5 w-5 text-primary" />
            <CardTitle>Compliance Packages</CardTitle>
          </div>
          <CardDescription>
            View and manage the regulatory frameworks and compliance packages assigned to this organization.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Link href="/settings/packages">
            <Button variant="outline" className="gap-2">
              <Package className="h-4 w-4" />
              Manage Compliance Packages
              <ChevronRight className="h-4 w-4 ml-1 text-muted-foreground" />
            </Button>
          </Link>
        </CardContent>
      </Card>

      {isAdmin && (
        <>
          <div>
            <h2 className="text-lg font-semibold tracking-tight">Admin</h2>
            <p className="text-muted-foreground text-sm mt-0.5">System configuration — visible to global admins only.</p>
          </div>
          <EmailSettingsCard />
        </>
      )}
    </div>
  );
}
