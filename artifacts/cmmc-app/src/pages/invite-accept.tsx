import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Loader2, ShieldCheck, CheckCircle2, AlertCircle } from "lucide-react";

type PageState = "loading" | "ready" | "invalid" | "submitting" | "success" | "error";

interface InviteInfo {
  name: string;
  email: string;
  expiresAt: string;
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

export default function InviteAccept() {
  const [, navigate] = useLocation();
  const token = new URLSearchParams(window.location.search).get("token") ?? "";

  const [state, setState] = useState<PageState>("loading");
  const [inviteInfo, setInviteInfo] = useState<InviteInfo | null>(null);
  const [invalidMessage, setInvalidMessage] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

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
    setPasswordError("");
    if (password.length < 8) {
      setPasswordError("Password must be at least 8 characters");
      return;
    }
    if (password !== confirm) {
      setPasswordError("Passwords do not match");
      return;
    }

    setState("submitting");
    try {
      await acceptInvitation(token, password);
      setState("success");
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
            <CardTitle className="text-xl">
              {state === "success" ? "Account Created!" : "Accept Your Invitation"}
            </CardTitle>
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

            {(state === "ready" || state === "submitting") && (
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="ia-password">New Password</Label>
                  <Input
                    id="ia-password"
                    type="password"
                    value={password}
                    onChange={(e) => { setPassword(e.target.value); setPasswordError(""); }}
                    placeholder="Min. 8 characters"
                    disabled={state === "submitting"}
                    autoFocus
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="ia-confirm">Confirm Password</Label>
                  <Input
                    id="ia-confirm"
                    type="password"
                    value={confirm}
                    onChange={(e) => { setConfirm(e.target.value); setPasswordError(""); }}
                    placeholder="Repeat password"
                    disabled={state === "submitting"}
                    onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
                  />
                </div>
                {passwordError && (
                  <p className="text-sm text-red-500">{passwordError}</p>
                )}
                <Button
                  className="w-full"
                  onClick={handleSubmit}
                  disabled={state === "submitting"}
                >
                  {state === "submitting" && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  {state === "submitting" ? "Activating account…" : "Activate Account"}
                </Button>
              </div>
            )}

            {state === "success" && (
              <div className="space-y-4">
                <div className="flex items-start gap-3 rounded-lg bg-green-50 border border-green-200 p-4">
                  <CheckCircle2 className="h-5 w-5 text-green-600 shrink-0 mt-0.5" />
                  <div className="text-sm text-green-700">
                    <p className="font-semibold mb-1">Your account is now active!</p>
                    <p>You can now log in with your email and new password.</p>
                  </div>
                </div>
                <Button className="w-full" onClick={() => navigate("/login")}>
                  Go to Login
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
