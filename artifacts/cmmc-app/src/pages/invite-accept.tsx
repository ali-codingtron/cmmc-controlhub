import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Loader2, ShieldCheck, CheckCircle2, AlertCircle, Building2, Check, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";

// ─── Types ─────────────────────────────────────────────────────────────────────

type PageState = "loading" | "ready" | "invalid" | "submitting" | "error";

interface OrgMembership {
  orgName: string;
  role: string;
}

interface InviteInfo {
  name: string;
  email: string;
  expiresAt: string;
  orgMemberships: OrgMembership[];
}

// ─── Password policy ──────────────────────────────────────────────────────────

interface PolicyRule {
  label: string;
  test: (pw: string) => boolean;
}

const POLICY_RULES: PolicyRule[] = [
  { label: "At least 12 characters", test: (pw) => pw.length >= 12 },
  { label: "One uppercase letter", test: (pw) => /[A-Z]/.test(pw) },
  { label: "One lowercase letter", test: (pw) => /[a-z]/.test(pw) },
  { label: "One number", test: (pw) => /[0-9]/.test(pw) },
  { label: "One special character", test: (pw) => /[^A-Za-z0-9]/.test(pw) },
];

function PasswordPolicyChecklist({ password }: { password: string }) {
  if (!password) return null;
  return (
    <ul className="space-y-1 mt-2">
      {POLICY_RULES.map((rule) => {
        const passed = rule.test(password);
        return (
          <li key={rule.label} className={`flex items-center gap-1.5 text-xs ${passed ? "text-green-600" : "text-slate-500"}`}>
            {passed ? (
              <Check className="h-3 w-3 shrink-0 text-green-600" />
            ) : (
              <X className="h-3 w-3 shrink-0 text-slate-400" />
            )}
            {rule.label}
          </li>
        );
      })}
    </ul>
  );
}

function policyPassed(password: string) {
  return POLICY_RULES.every((r) => r.test(password));
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const ORG_ROLE_LABELS: Record<string, string> = {
  admin: "Admin",
  org_admin: "Org Admin",
  compliance_manager: "Compliance Manager",
  it_contributor: "IT Contributor",
  reviewer: "Reviewer",
  executive_viewer: "Executive Viewer",
  assessor: "Assessor",
};

function orgRoleLabel(role: string) {
  return ORG_ROLE_LABELS[role] ?? role;
}

function getApiBase() {
  const base = import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "";
  return `${base}/api`;
}

async function validateToken(token: string): Promise<InviteInfo> {
  const res = await fetch(`${getApiBase()}/invitations/validate?token=${encodeURIComponent(token)}`);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Invalid invitation link");
  return data;
}

async function acceptInvitation(token: string, password: string): Promise<void> {
  const res = await fetch(`${getApiBase()}/invitations/accept`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token, password }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Failed to accept invitation");
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function InviteAccept() {
  const [, navigate] = useLocation();
  const token = new URLSearchParams(window.location.search).get("token") ?? "";

  const [state, setState] = useState<PageState>("loading");
  const [inviteInfo, setInviteInfo] = useState<InviteInfo | null>(null);
  const [invalidMessage, setInvalidMessage] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [confirmError, setConfirmError] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  const allPoliciesMet = policyPassed(password);
  const canSubmit = allPoliciesMet && password === confirm && confirm.length > 0;

  useEffect(() => {
    if (!token) {
      setInvalidMessage("No invitation token found in the URL.");
      setState("invalid");
      return;
    }
    validateToken(token)
      .then((info) => {
        setInviteInfo(info);
        setState("ready");
      })
      .catch((err) => {
        setInvalidMessage(err.message);
        setState("invalid");
      });
  }, [token]);

  const handleSubmit = async () => {
    setConfirmError("");
    if (!allPoliciesMet) return;
    if (password !== confirm) {
      setConfirmError("Passwords do not match");
      return;
    }
    setState("submitting");
    try {
      await acceptInvitation(token, password);
      // Redirect to login with ?invited=1 banner
      navigate("/login?invited=1");
    } catch (err: any) {
      setErrorMessage(err.message ?? "Something went wrong. Please try again.");
      setState("error");
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex items-center justify-center p-4">
      <div className="w-full max-w-md space-y-6">
        {/* Logo / Brand */}
        <div className="text-center space-y-2">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-blue-600 text-white shadow-md">
            <ShieldCheck className="h-6 w-6" />
          </div>
          <h1 className="text-2xl font-bold text-slate-900">Control HUB</h1>
          <p className="text-slate-500 text-sm">CMMC Compliance Platform</p>
        </div>

        <Card className="shadow-lg border-0">
          <CardHeader className="pb-4">
            <CardTitle className="text-xl">Accept Your Invitation</CardTitle>
            {state === "ready" && inviteInfo && (
              <CardDescription>
                Welcome, <strong>{inviteInfo.name}</strong>! Set a password for{" "}
                <strong>{inviteInfo.email}</strong> to activate your account.
              </CardDescription>
            )}
          </CardHeader>

          <CardContent>
            {state === "loading" && (
              <div className="flex items-center justify-center py-8 gap-2 text-slate-500">
                <Loader2 className="h-5 w-5 animate-spin" />
                <span>Verifying invitation…</span>
              </div>
            )}

            {state === "invalid" && (
              <div className="space-y-4">
                <div className="flex items-start gap-3 rounded-lg bg-red-50 border border-red-200 p-4">
                  <AlertCircle className="h-5 w-5 text-red-500 shrink-0 mt-0.5" />
                  <div className="text-sm text-red-700">
                    <p className="font-semibold mb-1">Invitation link is invalid</p>
                    <p>{invalidMessage}</p>
                  </div>
                </div>
                <p className="text-sm text-slate-500 text-center">
                  Please contact your administrator to request a new invitation.
                </p>
              </div>
            )}

            {(state === "ready" || state === "submitting") && inviteInfo && (
              <div className="space-y-5">
                {/* Org memberships */}
                {inviteInfo.orgMemberships.length > 0 && (
                  <div className="rounded-md border bg-slate-50 p-3 space-y-2">
                    <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Organization Access</p>
                    <div className="space-y-1.5">
                      {inviteInfo.orgMemberships.map((m, i) => (
                        <div key={i} className="flex items-center gap-2 text-sm">
                          <Building2 className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                          <span className="font-medium text-slate-700">{m.orgName}</span>
                          <Badge variant="outline" className="text-xs ml-auto">{orgRoleLabel(m.role)}</Badge>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Password fields */}
                <div className="space-y-1.5">
                  <Label htmlFor="ia-password">New Password</Label>
                  <Input
                    id="ia-password"
                    type="password"
                    value={password}
                    onChange={(e) => { setPassword(e.target.value); setConfirmError(""); }}
                    placeholder="Min. 12 characters"
                    disabled={state === "submitting"}
                    autoFocus
                  />
                  <PasswordPolicyChecklist password={password} />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="ia-confirm">Confirm Password</Label>
                  <Input
                    id="ia-confirm"
                    type="password"
                    value={confirm}
                    onChange={(e) => { setConfirm(e.target.value); setConfirmError(""); }}
                    placeholder="Repeat password"
                    disabled={state === "submitting"}
                    onKeyDown={(e) => e.key === "Enter" && canSubmit && handleSubmit()}
                    className={confirmError ? "border-red-500" : ""}
                  />
                  {confirmError && <p className="text-xs text-red-500">{confirmError}</p>}
                  {!confirmError && confirm.length > 0 && password === confirm && (
                    <p className="text-xs text-green-600 flex items-center gap-1">
                      <Check className="h-3 w-3" /> Passwords match
                    </p>
                  )}
                </div>

                <Button
                  className="w-full"
                  onClick={handleSubmit}
                  disabled={state === "submitting" || !canSubmit}
                >
                  {state === "submitting" && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  {state === "submitting" ? "Activating account…" : "Activate Account"}
                </Button>
              </div>
            )}

            {state === "error" && (
              <div className="space-y-4">
                <div className="flex items-start gap-3 rounded-lg bg-red-50 border border-red-200 p-4">
                  <AlertCircle className="h-5 w-5 text-red-500 shrink-0 mt-0.5" />
                  <div className="text-sm text-red-700">
                    <p className="font-semibold mb-1">Something went wrong</p>
                    <p>{errorMessage}</p>
                  </div>
                </div>
                <Button variant="outline" className="w-full" onClick={() => setState("ready")}>
                  Try Again
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        <p className="text-center text-xs text-slate-400">
          Already have an account?{" "}
          <button
            onClick={() => navigate("/login")}
            className="text-blue-600 hover:underline"
          >
            Sign in
          </button>
        </p>
      </div>
    </div>
  );
}
