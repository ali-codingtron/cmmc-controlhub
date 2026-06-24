import { useState, useRef, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useAuth } from "@/lib/auth";
import { useLocation } from "wouter";
import { Eye, EyeOff, Loader2, Lock, Network, ShieldCheck, KeyRound, Copy, Check, ArrowLeft, QrCode, Smartphone } from "lucide-react";
import { cn } from "@/lib/utils";
import QRCode from "qrcode";
import { mfaVerify, mfaSetupStart, mfaSetupVerify, mfaRecoveryCode } from "@workspace/api-client-react";

const loginSchema = z.object({
  email: z.string().email("Enter a valid email address"),
  password: z.string().min(1, "Password is required"),
});

function SecurityBackground() {
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      <svg
        className="absolute inset-0 w-full h-full opacity-[0.07]"
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
            <path d="M 40 0 L 0 0 0 40" fill="none" stroke="white" strokeWidth="0.5" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#grid)" />
      </svg>

      <svg className="absolute inset-0 w-full h-full opacity-20" xmlns="http://www.w3.org/2000/svg">
        <circle cx="15%" cy="20%" r="1.5" fill="rgba(147,197,253,0.8)" />
        <circle cx="35%" cy="55%" r="1" fill="rgba(147,197,253,0.6)" />
        <circle cx="60%" cy="25%" r="2" fill="rgba(147,197,253,0.5)" />
        <circle cx="75%" cy="65%" r="1.5" fill="rgba(147,197,253,0.7)" />
        <circle cx="50%" cy="80%" r="1" fill="rgba(147,197,253,0.5)" />
        <circle cx="85%" cy="40%" r="1.5" fill="rgba(147,197,253,0.6)" />
        <circle cx="25%" cy="85%" r="1" fill="rgba(147,197,253,0.5)" />
        <circle cx="90%" cy="15%" r="1" fill="rgba(147,197,253,0.6)" />

        <line x1="15%" y1="20%" x2="35%" y2="55%" stroke="rgba(147,197,253,0.2)" strokeWidth="0.5" />
        <line x1="35%" y1="55%" x2="60%" y2="25%" stroke="rgba(147,197,253,0.2)" strokeWidth="0.5" />
        <line x1="60%" y1="25%" x2="75%" y2="65%" stroke="rgba(147,197,253,0.2)" strokeWidth="0.5" />
        <line x1="75%" y1="65%" x2="50%" y2="80%" stroke="rgba(147,197,253,0.2)" strokeWidth="0.5" />
        <line x1="60%" y1="25%" x2="85%" y2="40%" stroke="rgba(147,197,253,0.2)" strokeWidth="0.5" />
        <line x1="15%" y1="20%" x2="25%" y2="85%" stroke="rgba(147,197,253,0.15)" strokeWidth="0.5" />
        <line x1="85%" y1="40%" x2="90%" y2="15%" stroke="rgba(147,197,253,0.2)" strokeWidth="0.5" />
      </svg>

      <div className="absolute bottom-16 left-8 flex flex-col gap-4 opacity-30">
        <div className="flex items-center gap-3">
          <ShieldCheck className="h-5 w-5 text-blue-300" />
          <div className="h-px w-20 bg-blue-300/50" />
        </div>
        <div className="flex items-center gap-3">
          <Lock className="h-4 w-4 text-blue-300 ml-0.5" />
          <div className="h-px w-14 bg-blue-300/40" />
        </div>
        <div className="flex items-center gap-3">
          <Network className="h-5 w-5 text-blue-300" />
          <div className="h-px w-24 bg-blue-300/50" />
        </div>
      </div>
    </div>
  );
}

// ─── OTP Input ────────────────────────────────────────────────────────────────

function OtpInput({ value, onChange, disabled }: { value: string; onChange: (v: string) => void; disabled?: boolean }) {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  return (
    <input
      ref={inputRef}
      type="text"
      inputMode="numeric"
      autoComplete="one-time-code"
      maxLength={6}
      disabled={disabled}
      value={value}
      onChange={(e) => onChange(e.target.value.replace(/\D/g, "").slice(0, 6))}
      className="w-full text-center text-3xl font-mono tracking-[0.5em] h-14 rounded-md border border-input bg-background px-3 py-2 ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
      placeholder="000000"
    />
  );
}

// ─── MFA Verify Screen ────────────────────────────────────────────────────────

function MfaVerifyScreen({ mfaStateToken, onBack }: { mfaStateToken: string; onBack: () => void }) {
  const { loginWithToken } = useAuth();
  const [, setLocation] = useLocation();
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [showRecovery, setShowRecovery] = useState(false);
  const [recoveryCode, setRecoveryCode] = useState("");

  const mfaHeaders = () => ({ headers: { "X-Mfa-State-Token": mfaStateToken } });

  const handleVerify = async () => {
    if (code.length !== 6) return;
    setError("");
    setIsLoading(true);
    try {
      const res = await mfaVerify({ code }, mfaHeaders());
      await loginWithToken(res.token);
      setLocation("/");
    } catch (e: any) {
      setError(e?.data?.error ?? e?.message ?? "Invalid code. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleRecovery = async () => {
    if (!recoveryCode.trim()) return;
    setError("");
    setIsLoading(true);
    try {
      const res = await mfaRecoveryCode({ code: recoveryCode.trim() }, mfaHeaders());
      await loginWithToken(res.token);
      setLocation("/");
    } catch (e: any) {
      setError(e?.data?.error ?? e?.message ?? "Invalid recovery code.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (code.length === 6) handleVerify();
  }, [code]);

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-bold tracking-tight">Two-Factor Authentication</h1>
        <p className="text-sm text-muted-foreground">
          {showRecovery
            ? "Enter one of your 8-character recovery codes."
            : "Enter the 6-digit code from your authenticator app."}
        </p>
      </div>

      {!showRecovery ? (
        <div className="space-y-4">
          <OtpInput value={code} onChange={setCode} disabled={isLoading} />

          {error && (
            <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2.5 text-sm text-destructive">
              <Lock className="h-4 w-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          <Button
            className="w-full h-10"
            onClick={handleVerify}
            disabled={isLoading || code.length !== 6}
          >
            {isLoading ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Verifying…</> : "Verify"}
          </Button>

          <div className="flex items-center justify-between text-sm">
            <button type="button" className="text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1" onClick={onBack}>
              <ArrowLeft className="h-3.5 w-3.5" /> Back to login
            </button>
            <button type="button" className="text-muted-foreground hover:text-foreground transition-colors" onClick={() => { setShowRecovery(true); setError(""); }}>
              Use recovery code
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <Input
            value={recoveryCode}
            onChange={(e) => setRecoveryCode(e.target.value.toUpperCase())}
            placeholder="XXXXX-XXXXX"
            className="h-10 font-mono text-center tracking-widest text-base"
            disabled={isLoading}
            autoFocus
          />

          {error && (
            <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2.5 text-sm text-destructive">
              <Lock className="h-4 w-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          <Button className="w-full h-10" onClick={handleRecovery} disabled={isLoading || !recoveryCode.trim()}>
            {isLoading ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Verifying…</> : "Use Recovery Code"}
          </Button>

          <div className="flex items-center justify-between text-sm">
            <button type="button" className="text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1" onClick={onBack}>
              <ArrowLeft className="h-3.5 w-3.5" /> Back to login
            </button>
            <button type="button" className="text-muted-foreground hover:text-foreground transition-colors" onClick={() => { setShowRecovery(false); setError(""); }}>
              Use authenticator app
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── MFA Setup Wizard ─────────────────────────────────────────────────────────

type SetupStep = "start" | "qr" | "verify" | "recovery";

function MfaSetupScreen({ mfaStateToken, onBack }: { mfaStateToken: string; onBack: () => void }) {
  const { loginWithToken } = useAuth();
  const [, setLocation] = useLocation();
  const [step, setStep] = useState<SetupStep>("start");
  const [qrDataUrl, setQrDataUrl] = useState("");
  const [otpUri, setOtpUri] = useState("");
  const [manualKey, setManualKey] = useState("");
  const [code, setCode] = useState("");
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([]);
  const [sessionToken, setSessionToken] = useState("");
  const [sessionUser, setSessionUser] = useState<any>(null);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [showManual, setShowManual] = useState(false);
  const [copied, setCopied] = useState(false);
  const [savedCodes, setSavedCodes] = useState(false);

  const mfaHeaders = () => ({ headers: { "X-Mfa-State-Token": mfaStateToken } });

  const startSetup = async () => {
    setIsLoading(true);
    setError("");
    try {
      const res = await mfaSetupStart(mfaHeaders());
      setOtpUri(res.otpAuthUri);
      setManualKey(res.manualKey);
      const dataUrl = await QRCode.toDataURL(res.otpAuthUri, { width: 220, margin: 1, color: { dark: "#1e293b", light: "#ffffff" } });
      setQrDataUrl(dataUrl);
      setStep("qr");
    } catch (e: any) {
      setError(e?.data?.error ?? e?.message ?? "Failed to start MFA setup. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleVerify = async () => {
    if (code.length !== 6) return;
    setError("");
    setIsLoading(true);
    try {
      const res = await mfaSetupVerify({ code }, mfaHeaders());
      setRecoveryCodes(res.recoveryCodes);
      setSessionToken(res.token);
      setSessionUser(res.user);
      setStep("recovery");
    } catch (e: any) {
      setError(e?.data?.error ?? e?.message ?? "Invalid code. Please check your authenticator app.");
    } finally {
      setIsLoading(false);
    }
  };

  const copyAllCodes = async () => {
    await navigator.clipboard.writeText(recoveryCodes.join("\n"));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const finishSetup = async () => {
    await loginWithToken(sessionToken);
    setLocation("/");
  };

  useEffect(() => {
    if (step === "qr") return;
    if (code.length === 6 && step === "verify") handleVerify();
  }, [code, step]);

  if (step === "start") {
    return (
      <div className="space-y-6">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold tracking-tight">Set Up Two-Factor Authentication</h1>
          <p className="text-sm text-muted-foreground">
            Your account requires MFA. You'll need an authenticator app like Google Authenticator, Authy, or 1Password.
          </p>
        </div>

        <div className="rounded-lg border bg-muted/30 p-4 space-y-3">
          <div className="flex items-start gap-3">
            <div className="rounded-full bg-primary/10 p-1.5 shrink-0"><Smartphone className="h-4 w-4 text-primary" /></div>
            <div>
              <div className="text-sm font-medium">Install an authenticator app</div>
              <div className="text-xs text-muted-foreground mt-0.5">Google Authenticator, Authy, Microsoft Authenticator, or 1Password work great.</div>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <div className="rounded-full bg-primary/10 p-1.5 shrink-0"><QrCode className="h-4 w-4 text-primary" /></div>
            <div>
              <div className="text-sm font-medium">Scan the QR code</div>
              <div className="text-xs text-muted-foreground mt-0.5">Open your app and scan the code we'll show you.</div>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <div className="rounded-full bg-primary/10 p-1.5 shrink-0"><KeyRound className="h-4 w-4 text-primary" /></div>
            <div>
              <div className="text-sm font-medium">Enter your verification code</div>
              <div className="text-xs text-muted-foreground mt-0.5">Confirm setup with the 6-digit code from your app.</div>
            </div>
          </div>
        </div>

        {error && (
          <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2.5 text-sm text-destructive">
            <Lock className="h-4 w-4 shrink-0 mt-0.5" /><span>{error}</span>
          </div>
        )}

        <Button className="w-full h-10" onClick={startSetup} disabled={isLoading}>
          {isLoading ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Loading…</> : "Get Started"}
        </Button>

        <button type="button" className="w-full text-center text-sm text-muted-foreground hover:text-foreground transition-colors flex items-center justify-center gap-1" onClick={onBack}>
          <ArrowLeft className="h-3.5 w-3.5" /> Back to login
        </button>
      </div>
    );
  }

  if (step === "qr") {
    return (
      <div className="space-y-6">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold tracking-tight">Scan QR Code</h1>
          <p className="text-sm text-muted-foreground">
            Open your authenticator app and scan this code to add Control HUB.
          </p>
        </div>

        <div className="flex flex-col items-center gap-4">
          {qrDataUrl && (
            <div className="rounded-xl border border-muted p-3 bg-white shadow-sm">
              <img src={qrDataUrl} alt="Authenticator QR code" className="block" width={220} height={220} />
            </div>
          )}

          <button
            type="button"
            className="text-sm text-muted-foreground hover:text-foreground transition-colors underline underline-offset-4"
            onClick={() => setShowManual((v) => !v)}
          >
            {showManual ? "Hide" : "Can't scan?"} Enter code manually
          </button>

          {showManual && (
            <div className="w-full rounded-lg bg-muted/50 border p-3 text-center font-mono text-sm tracking-wider break-all select-all">
              {manualKey}
            </div>
          )}
        </div>

        <Button className="w-full h-10" onClick={() => setStep("verify")}>
          I've scanned the code — Continue
        </Button>

        <button type="button" className="w-full text-center text-sm text-muted-foreground hover:text-foreground transition-colors" onClick={onBack}>
          <ArrowLeft className="h-3.5 w-3.5 inline mr-1" /> Back
        </button>
      </div>
    );
  }

  if (step === "verify") {
    return (
      <div className="space-y-6">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold tracking-tight">Verify Your Code</h1>
          <p className="text-sm text-muted-foreground">
            Enter the 6-digit code from your authenticator app to complete setup.
          </p>
        </div>

        <OtpInput value={code} onChange={setCode} disabled={isLoading} />

        {error && (
          <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2.5 text-sm text-destructive">
            <Lock className="h-4 w-4 shrink-0 mt-0.5" /><span>{error}</span>
          </div>
        )}

        <Button className="w-full h-10" onClick={handleVerify} disabled={isLoading || code.length !== 6}>
          {isLoading ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Verifying…</> : "Verify & Enable MFA"}
        </Button>

        <button type="button" className="w-full text-center text-sm text-muted-foreground hover:text-foreground transition-colors" onClick={() => { setStep("qr"); setCode(""); setError(""); }}>
          <ArrowLeft className="h-3.5 w-3.5 inline mr-1" /> Back
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <div className="rounded-full bg-green-100 p-1">
            <Check className="h-4 w-4 text-green-600" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight">MFA Enabled!</h1>
        </div>
        <p className="text-sm text-muted-foreground">
          Save these recovery codes somewhere safe. Each can only be used once to bypass MFA if you lose your device.
        </p>
      </div>

      <div className="rounded-lg border bg-muted/30 p-4">
        <div className="grid grid-cols-2 gap-2 font-mono text-sm">
          {recoveryCodes.map((c, i) => (
            <div key={i} className="flex items-center gap-1.5 bg-background rounded px-2 py-1">
              <span className="text-muted-foreground text-xs w-4 shrink-0">{i + 1}.</span>
              <span className="tracking-wider">{c}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="flex gap-2">
        <Button variant="outline" className="flex-1 gap-2" onClick={copyAllCodes}>
          {copied ? <><Check className="h-4 w-4" />Copied!</> : <><Copy className="h-4 w-4" />Copy All</>}
        </Button>
        <Button
          variant={savedCodes ? "default" : "outline"}
          className="flex-1 gap-2"
          onClick={() => setSavedCodes(true)}
        >
          <Check className={cn("h-4 w-4", savedCodes ? "opacity-100" : "opacity-50")} />
          I've Saved Them
        </Button>
      </div>

      <Button className="w-full h-10" onClick={finishSetup} disabled={!savedCodes}>
        Enter Control HUB
      </Button>

      {!savedCodes && (
        <p className="text-xs text-center text-amber-600">
          Please save your recovery codes before continuing — you won't see them again.
        </p>
      )}
    </div>
  );
}

// ─── Login Form ───────────────────────────────────────────────────────────────

function MicrosoftIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 23 23" aria-hidden="true">
      <rect x="1" y="1" width="10" height="10" fill="#f25022" />
      <rect x="12" y="1" width="10" height="10" fill="#7fba00" />
      <rect x="1" y="12" width="10" height="10" fill="#00a4ef" />
      <rect x="12" y="12" width="10" height="10" fill="#ffb900" />
    </svg>
  );
}

export default function Login() {
  const { login, loginWithToken, mfaChallenge, clearMfaChallenge } = useAuth();
  const [, setLocation] = useLocation();
  const [error, setError] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const emailRef = useRef<HTMLInputElement>(null);
  const [invitedBanner, setInvitedBanner] = useState(false);
  const [resetBanner, setResetBanner] = useState(false);

  // SSO login state
  const [ssoMode, setSsoMode] = useState(false);
  const [ssoEmail, setSsoEmail] = useState("");
  const [ssoLoading, setSsoLoading] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);

    // Handle SSO callback token
    const ssoToken = params.get("sso_token");
    if (ssoToken) {
      window.history.replaceState({}, "", window.location.pathname);
      loginWithToken(ssoToken)
        .then(() => setLocation("/"))
        .catch(() => setError("SSO sign-in failed. Please try again."));
      return;
    }

    // Handle SSO error codes from callback
    const ssoError = params.get("sso_error");
    if (ssoError) {
      window.history.replaceState({}, "", window.location.pathname);
      const msgs: Record<string, string> = {
        invalid_state: "SSO session expired. Please try again.",
        token_exchange_failed: "Microsoft authentication failed. Please try again.",
        invalid_token: "Invalid response from Microsoft. Contact your administrator.",
        config_not_found: "SSO configuration not found. Contact your administrator.",
        missing_params: "Incomplete SSO callback. Please try again.",
        account_inactive: "Your account is inactive. Contact your administrator.",
        sso_disabled: "SSO login is not permitted for your account.",
      };
      setError(msgs[ssoError] ?? "SSO authentication failed. Please try again.");
    }

    emailRef.current?.focus();
    if (params.get("invited") === "1") setInvitedBanner(true);
    if (params.get("reset") === "success") setResetBanner(true);
  }, []);

  const handleSsoSubmit = async () => {
    const email = ssoEmail.trim().toLowerCase();
    if (!email) return;
    setSsoLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/auth/sso/initiate?email=${encodeURIComponent(email)}`);
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "No SSO configured for this domain.");
        return;
      }
      window.location.href = data.authUrl;
    } catch {
      setError("Failed to initiate SSO. Please try again.");
    } finally {
      setSsoLoading(false);
    }
  };

  const form = useForm<z.infer<typeof loginSchema>>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" },
  });

  const onSubmit = async (data: z.infer<typeof loginSchema>) => {
    try {
      setError("");
      setIsLoading(true);
      await login(data);
      // If no MFA challenge raised, navigate to dashboard
      if (!mfaChallenge) {
        setLocation("/");
      }
    } catch (e: any) {
      const apiMessage =
        e?.data?.error ||
        e?.data?.message ||
        e?.message ||
        "Invalid email or password. Please try again.";
      setError(String(apiMessage).replace(/^HTTP \d+ [^:]+:\s*/, ""));
    } finally {
      setIsLoading(false);
    }
  };

  const rightPanel = (() => {
    if (mfaChallenge?.type === "mfa_required") {
      return (
        <MfaVerifyScreen
          mfaStateToken={mfaChallenge.mfaStateToken}
          onBack={clearMfaChallenge}
        />
      );
    }
    if (mfaChallenge?.type === "mfa_setup_required") {
      return (
        <MfaSetupScreen
          mfaStateToken={mfaChallenge.mfaStateToken}
          onBack={clearMfaChallenge}
        />
      );
    }
    return (
      <>
        {/* Mobile logo */}
        <div className="flex flex-col items-center gap-3 lg:hidden">
          <img
            src="/assets/control-hub-icon.png"
            alt="Control HUB"
            className="h-14 w-14 rounded-2xl object-cover shadow-md"
          />
          <div className="text-center">
            <h1 className="text-2xl font-bold tracking-tight">Control HUB</h1>
            <p className="text-sm text-muted-foreground">CMMC Compliance &amp; Evidence Management</p>
          </div>
        </div>

        {invitedBanner && (
          <div className="flex items-start gap-2.5 rounded-lg border border-green-200 bg-green-50 px-3 py-3 text-sm text-green-800">
            <ShieldCheck className="h-4 w-4 shrink-0 mt-0.5 text-green-600" />
            <div>
              <p className="font-semibold">Account activated!</p>
              <p className="text-green-700 text-xs mt-0.5">Your password has been set. Sign in below to get started.</p>
            </div>
            <button
              className="ml-auto shrink-0 text-green-600 hover:text-green-800"
              onClick={() => setInvitedBanner(false)}
            >
              <span className="sr-only">Dismiss</span>
              ✕
            </button>
          </div>
        )}

        {resetBanner && (
          <div className="flex items-start gap-2.5 rounded-lg border border-green-200 bg-green-50 px-3 py-3 text-sm text-green-800">
            <ShieldCheck className="h-4 w-4 shrink-0 mt-0.5 text-green-600" />
            <div>
              <p className="font-semibold">Password reset successfully!</p>
              <p className="text-green-700 text-xs mt-0.5">Your new password is active. Sign in below.</p>
            </div>
            <button
              className="ml-auto shrink-0 text-green-600 hover:text-green-800"
              onClick={() => setResetBanner(false)}
            >
              <span className="sr-only">Dismiss</span>
              ✕
            </button>
          </div>
        )}

        {/* Desktop heading */}
        <div className="hidden lg:flex items-center gap-4">
          <img
            src="/assets/control-hub-icon.png"
            alt="Control HUB"
            className="h-14 w-14 rounded-2xl object-cover shadow-md shrink-0"
          />
          <div className="space-y-0.5">
            <h1 className="text-2xl font-bold tracking-tight">Sign in to your account</h1>
            <p className="text-sm text-muted-foreground">CMMC Compliance &amp; Evidence Management</p>
          </div>
        </div>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
            <FormField
              control={form.control}
              name="email"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-sm font-medium">Email address</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="name@example.com"
                      autoComplete="email"
                      className="h-10"
                      {...field}
                      ref={(el) => {
                        field.ref(el);
                        (emailRef as any).current = el;
                      }}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="password"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-sm font-medium">Password</FormLabel>
                  <FormControl>
                    <div className="relative">
                      <Input
                        type={showPassword ? "text" : "password"}
                        autoComplete="current-password"
                        className="h-10 pr-10"
                        {...field}
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword((v) => !v)}
                        className="absolute inset-y-0 right-0 flex items-center pr-3 text-muted-foreground hover:text-foreground transition-colors"
                        tabIndex={-1}
                        aria-label={showPassword ? "Hide password" : "Show password"}
                      >
                        {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="flex justify-end -mt-1">
              <a
                href="/forgot-password"
                className="text-xs text-muted-foreground hover:text-foreground transition-colors underline-offset-4 hover:underline"
              >
                Forgot password?
              </a>
            </div>

            {error && (
              <div
                role="alert"
                className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2.5 text-sm text-destructive"
              >
                <Lock className="h-4 w-4 shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}

            <Button
              type="submit"
              className="w-full h-10 font-medium"
              disabled={isLoading}
            >
              {isLoading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Signing in…
                </>
              ) : (
                "Sign in"
              )}
            </Button>
          </form>
        </Form>

        {/* SSO Divider */}
        <div className="relative">
          <div className="absolute inset-0 flex items-center">
            <span className="w-full border-t border-border" />
          </div>
          <div className="relative flex justify-center text-xs uppercase">
            <span className="bg-background px-2 text-muted-foreground">Or</span>
          </div>
        </div>

        {ssoMode ? (
          <div className="space-y-3">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Work email address</label>
              <Input
                type="email"
                placeholder="name@company.com"
                value={ssoEmail}
                onChange={(e) => setSsoEmail(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleSsoSubmit(); } }}
                autoFocus
                className="h-10"
                disabled={ssoLoading}
              />
            </div>
            <Button
              type="button"
              variant="outline"
              className="w-full h-10 gap-2.5"
              disabled={ssoLoading || !ssoEmail.trim()}
              onClick={handleSsoSubmit}
            >
              {ssoLoading ? (
                <><Loader2 className="h-4 w-4 animate-spin" />Redirecting to Microsoft…</>
              ) : (
                <><MicrosoftIcon />Continue with Microsoft</>
              )}
            </Button>
            <button
              type="button"
              className="w-full text-center text-xs text-muted-foreground hover:text-foreground transition-colors flex items-center justify-center gap-1"
              onClick={() => { setSsoMode(false); setSsoEmail(""); setError(""); }}
            >
              <ArrowLeft className="h-3 w-3" />Back to password login
            </button>
          </div>
        ) : (
          <Button
            type="button"
            variant="outline"
            className="w-full h-10 gap-2.5"
            onClick={() => { setSsoMode(true); setError(""); }}
          >
            <MicrosoftIcon />
            Sign in with Microsoft
          </Button>
        )}

        <p className="text-center text-xs text-muted-foreground">
          Secure Compliance Platform &mdash; Control HUB
        </p>
      </>
    );
  })();

  return (
    <div className="min-h-screen flex">
      {/* Left panel — branding */}
      <div className="hidden lg:flex lg:w-1/2 relative bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900 flex-col justify-between p-12">
        <SecurityBackground />

        <div className="relative z-10">
          <div className="flex items-center gap-3">
            <img
              src="/assets/control-hub-icon.png"
              alt="Control HUB"
              className="h-10 w-10 rounded-xl object-cover shadow-lg shadow-blue-900/40"
            />
            <span className="text-white font-bold text-xl tracking-tight">Control HUB</span>
          </div>
        </div>

        <div className="relative z-10 space-y-6">
          <div>
            <h2 className="text-3xl font-bold text-white leading-tight">
              Compliance readiness,<br />
              <span className="text-blue-300">simplified.</span>
            </h2>
            <p className="mt-3 text-slate-400 text-base leading-relaxed max-w-sm">
              Manage CMMC controls, evidence, and audit readiness across your organization — all in one platform.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3 max-w-sm">
            {[
              { label: "Controls Tracked", value: "110+" },
              { label: "CMMC Domains", value: "14" },
              { label: "Evidence Types", value: "Multi" },
              { label: "Audit Ready", value: "Always" },
            ].map((stat) => (
              <div key={stat.label} className="rounded-lg bg-white/5 border border-white/10 px-4 py-3">
                <div className="text-white font-bold text-lg">{stat.value}</div>
                <div className="text-slate-400 text-xs">{stat.label}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="relative z-10">
          <p className="text-slate-500 text-xs">Built for CMMC Readiness · Secure Compliance Platform</p>
        </div>
      </div>

      {/* Right panel */}
      <div className="flex-1 flex flex-col items-center justify-center bg-background px-6 py-12">
        <div className="w-full max-w-sm space-y-8">
          {rightPanel}
        </div>
      </div>
    </div>
  );
}
