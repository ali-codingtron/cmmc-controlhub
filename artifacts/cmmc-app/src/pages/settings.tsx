import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { useOrg } from "@/context/OrgContext";
import { useToast } from "@/hooks/use-toast";
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Eye, EyeOff, User, KeyRound, Shield, Mail, AlertTriangle, CheckCircle2, Send, Package, ChevronRight, Sparkles, ShieldOff, Award, Check, ExternalLink } from "lucide-react";
import { Link } from "wouter";
import { cn } from "@/lib/utils";

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

// ─── Certification Card ───────────────────────────────────────────────────────

const CERT_STATUS_LABELS: Record<string, { label: string; color: string }> = {
  NOT_AVAILABLE: { label: "Not Set Up", color: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300" },
  VERIFICATION_PENDING: { label: "Pending Verification", color: "bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400" },
  CONDITIONAL_L2_C3PAO: { label: "Conditional L2 (C3PAO)", color: "bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-400" },
  FINAL_L2_C3PAO: { label: "Final L2 (C3PAO)", color: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400" },
};

function CertificationCard() {
  const { user } = useAuth();
  const { activeOrg } = useOrg();
  const { toast } = useToast();
  const [showWizard, setShowWizard] = useState(false);
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    certificationStatus: "",
    cmmcUid: "",
    assessmentLevel: "Level 2",
    c3paoName: "",
    cmmcStatusDate: "",
    assessmentStartDate: "",
    assessmentCompletionDate: "",
    assessmentUniqueId: "",
    cageCodes: "",
    assessmentScopeName: "",
    sspTitle: "",
    sspVersion: "",
    sspDate: "",
    affirmingOfficial: "",
    internalCertificationOwner: "",
    assessorNames: "",
    notes: "",
    hasRequiredRecord: false,
  });

  const BLANK_FORM = {
    certificationStatus: "",
    cmmcUid: "",
    assessmentLevel: "Level 2",
    c3paoName: "",
    cmmcStatusDate: "",
    assessmentStartDate: "",
    assessmentCompletionDate: "",
    assessmentUniqueId: "",
    cageCodes: "",
    assessmentScopeName: "",
    sspTitle: "",
    sspVersion: "",
    sspDate: "",
    affirmingOfficial: "",
    internalCertificationOwner: "",
    assessorNames: "",
    notes: "",
    hasRequiredRecord: false,
  };

  const orgRole = activeOrg?.role ?? "";
  const userRole = user?.role ?? "";
  const canActivate = userRole === "admin" || ["org_admin", "compliance_manager"].includes(orgRole);

  const { data: certStatus, refetch: refetchCert } = useQuery<{ certificationModuleState: string }>({
    queryKey: ["certification-status", activeOrg?.id],
    queryFn: async () => {
      const token = localStorage.getItem("auth_token");
      const res = await fetch("/api/certification/status", {
        headers: { Authorization: `Bearer ${token}`, "X-Organization-ID": activeOrg!.id },
      });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    enabled: !!activeOrg && canActivate,
  });

  if (!canActivate) return null;

  const certState = certStatus?.certificationModuleState ?? "NOT_AVAILABLE";
  const statusMeta = CERT_STATUS_LABELS[certState] ?? CERT_STATUS_LABELS.NOT_AVAILABLE;

  function setField(k: string, v: string | boolean) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  function closeWizard() {
    setShowWizard(false);
    setStep(1);
    setForm(BLANK_FORM);
  }

  async function handleSubmit() {
    setLoading(true);
    try {
      const token = localStorage.getItem("auth_token");
      const r = await fetch("/api/certification/initiate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
          "X-Organization-ID": activeOrg!.id,
        },
        body: JSON.stringify({
          ...form,
          cageCodes: form.cageCodes.split(",").map((s) => s.trim()).filter(Boolean),
          assessorNames: form.assessorNames ? form.assessorNames.split(",").map((s) => s.trim()).filter(Boolean) : [],
          contractReferences: [],
        }),
      });
      const data = await r.json();
      if (!r.ok) {
        toast({ title: "Error", description: data.error ?? "Submission failed", variant: "destructive" });
        return;
      }
      toast({ title: "Submitted for Verification", description: "A second authorized user must verify the record before the module activates." });
      closeWizard();
      refetchCert();
    } catch {
      toast({ title: "Error", description: "Network error", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }

  const inputClass = "w-full border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-slate-800";
  const labelClass = "block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1";
  const STEPS = ["Select Status", "Assessment Details", "Supporting Records"];

  const step2Invalid = !form.cmmcUid || form.cmmcUid.length !== 10 || !form.c3paoName || !form.cmmcStatusDate || !form.assessmentScopeName || !form.sspTitle || !form.sspVersion || !form.sspDate || !form.affirmingOfficial || !form.internalCertificationOwner || !form.cageCodes;

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Award className="h-5 w-5 text-primary" />
              <CardTitle>CMMC Certification</CardTitle>
            </div>
            <Badge className={cn("text-xs font-medium border-0", statusMeta.color)}>
              {statusMeta.label}
            </Badge>
          </div>
          <CardDescription>
            Record and manage your organization's official CMMC assessment status and sustainment.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex items-center gap-3">
          {certState === "NOT_AVAILABLE" ? (
            <Button onClick={() => setShowWizard(true)}>
              <Award className="h-4 w-4 mr-1.5" />
              Initiate Certification
            </Button>
          ) : (
            <Link href="/certification">
              <Button variant="outline" className="gap-2">
                <ExternalLink className="h-4 w-4" />
                View Certification Module
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              </Button>
            </Link>
          )}
        </CardContent>
      </Card>

      <Dialog open={showWizard} onOpenChange={closeWizard}>
        <DialogContent className="max-w-2xl flex flex-col overflow-hidden" style={{ maxHeight: "90vh" }}>
          <DialogHeader className="shrink-0">
            <DialogTitle className="flex items-center gap-2">
              <Award className="h-5 w-5 text-blue-600" />
              Initiate CMMC Certification — {activeOrg?.name}
            </DialogTitle>
          </DialogHeader>

          {/* Step indicator */}
          <div className="flex items-center gap-1 shrink-0 py-2">
            {STEPS.map((label, i) => {
              const n = i + 1;
              return (
                <div key={n} className="flex items-center gap-2 flex-1 min-w-0">
                  <div className={cn(
                    "w-6 h-6 rounded-full flex items-center justify-center text-xs font-semibold shrink-0",
                    step >= n ? "bg-blue-600 text-white" : "bg-slate-100 dark:bg-slate-800 text-slate-400"
                  )}>
                    {step > n ? <Check className="h-3.5 w-3.5" /> : n}
                  </div>
                  <span className={cn("text-xs truncate", step >= n ? "text-slate-700 dark:text-slate-200 font-medium" : "text-slate-400")}>{label}</span>
                  {i < STEPS.length - 1 && <div className="flex-1 h-px bg-slate-200 dark:bg-slate-700 ml-1" />}
                </div>
              );
            })}
          </div>

          <div className="overflow-y-auto flex-1 py-2 pr-1">
            {step === 1 && (
              <div>
                <p className="text-xs text-muted-foreground mb-4">
                  Select the CMMC certification status officially awarded to <strong>{activeOrg?.name}</strong> by their C3PAO assessor.
                </p>
                <div className="grid grid-cols-2 gap-3">
                  {[
                    { value: "CONDITIONAL_L2_C3PAO", label: "Conditional Level 2 (C3PAO)", desc: "Assessment completed with POA&Ms", color: "border-amber-300 bg-amber-50 dark:bg-amber-950/30" },
                    { value: "FINAL_L2_C3PAO", label: "Final Level 2 (C3PAO)", desc: "Full assessment completed, no open POA&Ms", color: "border-emerald-300 bg-emerald-50 dark:bg-emerald-950/30" },
                  ].map((opt) => (
                    <button key={opt.value} onClick={() => setField("certificationStatus", opt.value)}
                      className={cn("text-left p-4 rounded-xl border-2 transition-all",
                        form.certificationStatus === opt.value ? opt.color : "border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:border-slate-300"
                      )}>
                      <div className="font-medium text-sm">{opt.label}</div>
                      <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">{opt.desc}</div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {step === 2 && (
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={labelClass}>CMMC UID <span className="text-red-500">*</span></label>
                  <input className={inputClass} value={form.cmmcUid} onChange={(e) => setField("cmmcUid", e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""))} maxLength={10} placeholder="10 alphanumeric characters" />
                </div>
                <div>
                  <label className={labelClass}>Assessment Level</label>
                  <input className={inputClass} value={form.assessmentLevel} onChange={(e) => setField("assessmentLevel", e.target.value)} />
                </div>
                <div className="col-span-2">
                  <label className={labelClass}>C3PAO Name <span className="text-red-500">*</span></label>
                  <input className={inputClass} value={form.c3paoName} onChange={(e) => setField("c3paoName", e.target.value)} placeholder="Third-Party Assessment Organization name" />
                </div>
                <div>
                  <label className={labelClass}>CMMC Status Date <span className="text-red-500">*</span></label>
                  <input type="date" className={inputClass} value={form.cmmcStatusDate} onChange={(e) => setField("cmmcStatusDate", e.target.value)} />
                </div>
                <div>
                  <label className={labelClass}>Assessment Start Date</label>
                  <input type="date" className={inputClass} value={form.assessmentStartDate} onChange={(e) => setField("assessmentStartDate", e.target.value)} />
                </div>
                <div>
                  <label className={labelClass}>Assessment Completion Date</label>
                  <input type="date" className={inputClass} value={form.assessmentCompletionDate} onChange={(e) => setField("assessmentCompletionDate", e.target.value)} />
                </div>
                <div>
                  <label className={labelClass}>Assessment Unique ID <span className="text-red-500">*</span></label>
                  <input className={inputClass} value={form.assessmentUniqueId} onChange={(e) => setField("assessmentUniqueId", e.target.value)} />
                </div>
                <div className="col-span-2">
                  <label className={labelClass}>CAGE Codes <span className="text-red-500">*</span></label>
                  <input className={inputClass} value={form.cageCodes} onChange={(e) => setField("cageCodes", e.target.value)} placeholder="Comma-separated, e.g. 1A2B3, 4C5D6" />
                </div>
                <div className="col-span-2">
                  <label className={labelClass}>Assessment Scope Name <span className="text-red-500">*</span></label>
                  <input className={inputClass} value={form.assessmentScopeName} onChange={(e) => setField("assessmentScopeName", e.target.value)} />
                </div>
                <div className="col-span-2">
                  <label className={labelClass}>SSP Title <span className="text-red-500">*</span></label>
                  <input className={inputClass} value={form.sspTitle} onChange={(e) => setField("sspTitle", e.target.value)} />
                </div>
                <div>
                  <label className={labelClass}>SSP Version <span className="text-red-500">*</span></label>
                  <input className={inputClass} value={form.sspVersion} onChange={(e) => setField("sspVersion", e.target.value)} />
                </div>
                <div>
                  <label className={labelClass}>SSP Date <span className="text-red-500">*</span></label>
                  <input type="date" className={inputClass} value={form.sspDate} onChange={(e) => setField("sspDate", e.target.value)} />
                </div>
                <div>
                  <label className={labelClass}>Affirming Official <span className="text-red-500">*</span></label>
                  <input className={inputClass} value={form.affirmingOfficial} onChange={(e) => setField("affirmingOfficial", e.target.value)} placeholder="Name, Title" />
                </div>
                <div>
                  <label className={labelClass}>Internal Certification Owner <span className="text-red-500">*</span></label>
                  <input className={inputClass} value={form.internalCertificationOwner} onChange={(e) => setField("internalCertificationOwner", e.target.value)} placeholder="Name, Title" />
                </div>
                <div className="col-span-2">
                  <label className={labelClass}>Assessor Names (optional, comma-separated)</label>
                  <input className={inputClass} value={form.assessorNames} onChange={(e) => setField("assessorNames", e.target.value)} />
                </div>
                <div className="col-span-2">
                  <label className={labelClass}>Notes (optional)</label>
                  <textarea className={inputClass} rows={2} value={form.notes} onChange={(e) => setField("notes", e.target.value)} />
                </div>
              </div>
            )}

            {step === 3 && (
              <div className="space-y-4">
                <p className="text-xs text-muted-foreground">At least one official supporting record must be available before submission. Records can be uploaded after verification in the Official Records tab.</p>
                <div className="border border-slate-200 dark:border-slate-700 rounded-xl p-4 space-y-2">
                  <div className="text-xs font-medium text-slate-700 dark:text-slate-300 mb-2">Acceptable record types (at least one required):</div>
                  {["CMMC Assessment Findings Report", "CMMC Status Confirmation", "SPRS Status Verification", "Certification Record", "POA&M Closeout Result (if applicable)"].map((r) => (
                    <div key={r} className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-400">
                      <div className="h-1.5 w-1.5 rounded-full bg-slate-400 shrink-0" />
                      {r}
                    </div>
                  ))}
                </div>
                <label className="flex items-start gap-3 cursor-pointer">
                  <input type="checkbox" checked={form.hasRequiredRecord} onChange={(e) => setField("hasRequiredRecord", e.target.checked)} className="mt-0.5" />
                  <span className="text-sm text-slate-700 dark:text-slate-300">
                    I confirm that at least one official supporting record is available and will be uploaded to the Official Records tab upon module activation.
                  </span>
                </label>
                <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-xl p-4">
                  <div className="flex gap-2">
                    <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
                    <div className="text-xs text-amber-800 dark:text-amber-400">
                      <div className="font-medium mb-1">Second-Person Verification Required</div>
                      After submission, a different authorized user with verification permissions must independently confirm this record before the Certification module becomes active.
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          <DialogFooter className="shrink-0 pt-4 border-t mt-2">
            <Button variant="outline" onClick={step === 1 ? closeWizard : () => setStep((s) => s - 1)}>
              {step === 1 ? "Cancel" : "Back"}
            </Button>
            <Button
              disabled={
                (step === 1 && !form.certificationStatus) ||
                (step === 2 && step2Invalid) ||
                (step === 3 && !form.hasRequiredRecord) ||
                loading
              }
              onClick={step < 3 ? () => setStep((s) => s + 1) : handleSubmit}
            >
              {loading ? "Submitting…" : step < 3 ? "Continue" : "Submit for Verification"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

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
      <CertificationCard />

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
