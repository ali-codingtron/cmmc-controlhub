import { useState, useRef, useEffect, useCallback } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useAuth } from "@/lib/auth";
import { useLocation } from "wouter";
import {
  Eye, EyeOff, Loader2, Lock, Network, ShieldCheck, KeyRound, Copy,
  Check, ArrowLeft, QrCode, Smartphone, AlertCircle, CheckCircle2,
  Info, AlertTriangle, Layers, FileCheck, ClipboardCheck,
} from "lucide-react";
import { cn } from "@/lib/utils";
import QRCode from "qrcode";
import { mfaVerify, mfaSetupStart, mfaSetupVerify, mfaRecoveryCode } from "@workspace/api-client-react";

// ─── Schemas ──────────────────────────────────────────────────────────────────

const loginSchema = z.object({
  email: z.string().email("Enter a valid email address"),
  password: z.string().min(1, "Password is required"),
});

// ─── Environment badge ────────────────────────────────────────────────────────

type AppEnv = "development" | "staging" | "production";

function EnvironmentBadge({ env }: { env: AppEnv | null }) {
  if (!env || env === "production") {
    // Production: show a very subtle slate badge
    if (env === "production") {
      return (
        <span className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] font-medium text-slate-500 select-none">
          Production
        </span>
      );
    }
    return null;
  }
  if (env === "staging") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-700 select-none">
        Staging
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-blue-200 bg-blue-50 px-2 py-0.5 text-[10px] font-semibold text-blue-700 select-none">
      Development
    </span>
  );
}

// ─── Inline message region ────────────────────────────────────────────────────

type MessageVariant = "error" | "info" | "success" | "warning";

interface InlineMessage {
  variant: MessageVariant;
  text: string;
}

function MessageBanner({ msg, onDismiss }: { msg: InlineMessage; onDismiss?: () => void }) {
  const styles: Record<MessageVariant, string> = {
    error: "border-red-200 bg-red-50 text-red-800",
    info: "border-blue-200 bg-blue-50 text-blue-800",
    success: "border-green-200 bg-green-50 text-green-800",
    warning: "border-amber-200 bg-amber-50 text-amber-800",
  };
  const icons: Record<MessageVariant, React.ReactNode> = {
    error: <AlertCircle className="h-4 w-4 shrink-0 mt-0.5 text-red-600" />,
    info: <Info className="h-4 w-4 shrink-0 mt-0.5 text-blue-600" />,
    success: <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5 text-green-600" />,
    warning: <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5 text-amber-600" />,
  };

  return (
    <div
      role="alert"
      aria-live="assertive"
      className={cn("flex items-start gap-2.5 rounded-lg border px-3 py-2.5 text-sm", styles[msg.variant])}
    >
      {icons[msg.variant]}
      <span className="flex-1 leading-snug">{msg.text}</span>
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          className="ml-1 shrink-0 opacity-60 hover:opacity-100 transition-opacity"
          aria-label="Dismiss"
        >
          ✕
        </button>
      )}
    </div>
  );
}

// ─── Left-panel security grid background ──────────────────────────────────────

function SecurityBackground() {
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden="true">
      {/* Subtle grid */}
      <svg className="absolute inset-0 w-full h-full opacity-[0.05]" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
            <path d="M 40 0 L 0 0 0 40" fill="none" stroke="white" strokeWidth="0.5" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#grid)" />
      </svg>

      {/* Network nodes — reduced opacity */}
      <svg className="absolute inset-0 w-full h-full opacity-[0.12]" xmlns="http://www.w3.org/2000/svg">
        <circle cx="15%" cy="20%" r="1.5" fill="rgba(147,197,253,0.8)" />
        <circle cx="35%" cy="55%" r="1" fill="rgba(147,197,253,0.6)" />
        <circle cx="60%" cy="25%" r="2" fill="rgba(147,197,253,0.5)" />
        <circle cx="75%" cy="65%" r="1.5" fill="rgba(147,197,253,0.7)" />
        <circle cx="50%" cy="80%" r="1" fill="rgba(147,197,253,0.5)" />
        <circle cx="85%" cy="40%" r="1.5" fill="rgba(147,197,253,0.6)" />
        <circle cx="25%" cy="85%" r="1" fill="rgba(147,197,253,0.5)" />
        <circle cx="90%" cy="15%" r="1" fill="rgba(147,197,253,0.6)" />
        <line x1="15%" y1="20%" x2="35%" y2="55%" stroke="rgba(147,197,253,0.15)" strokeWidth="0.5" />
        <line x1="35%" y1="55%" x2="60%" y2="25%" stroke="rgba(147,197,253,0.15)" strokeWidth="0.5" />
        <line x1="60%" y1="25%" x2="75%" y2="65%" stroke="rgba(147,197,253,0.15)" strokeWidth="0.5" />
        <line x1="75%" y1="65%" x2="50%" y2="80%" stroke="rgba(147,197,253,0.15)" strokeWidth="0.5" />
        <line x1="60%" y1="25%" x2="85%" y2="40%" stroke="rgba(147,197,253,0.12)" strokeWidth="0.5" />
        <line x1="15%" y1="20%" x2="25%" y2="85%" stroke="rgba(147,197,253,0.10)" strokeWidth="0.5" />
        <line x1="85%" y1="40%" x2="90%" y2="15%" stroke="rgba(147,197,253,0.12)" strokeWidth="0.5" />
      </svg>
    </div>
  );
}

// ─── Microsoft icon ───────────────────────────────────────────────────────────

function MicrosoftIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 23 23" aria-hidden="true">
      <rect x="1" y="1" width="10" height="10" fill="#f25022" />
      <rect x="12" y="1" width="10" height="10" fill="#7fba00" />
      <rect x="1" y="12" width="10" height="10" fill="#00a4ef" />
      <rect x="12" y="12" width="10" height="10" fill="#ffb900" />
    </svg>
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
          {error && <MessageBanner msg={{ variant: "error", text: error }} />}
          <Button className="w-full h-12" onClick={handleVerify} disabled={isLoading || code.length !== 6}>
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
            className="h-12 font-mono text-center tracking-widest text-base"
            disabled={isLoading}
            autoFocus
          />
          {error && <MessageBanner msg={{ variant: "error", text: error }} />}
          <Button className="w-full h-12" onClick={handleRecovery} disabled={isLoading || !recoveryCode.trim()}>
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
          {[
            { icon: <Smartphone className="h-4 w-4 text-primary" />, title: "Install an authenticator app", desc: "Google Authenticator, Authy, Microsoft Authenticator, or 1Password work great." },
            { icon: <QrCode className="h-4 w-4 text-primary" />, title: "Scan the QR code", desc: "Open your app and scan the code we'll show you." },
            { icon: <KeyRound className="h-4 w-4 text-primary" />, title: "Enter your verification code", desc: "Confirm setup with the 6-digit code from your app." },
          ].map((item, i) => (
            <div key={i} className="flex items-start gap-3">
              <div className="rounded-full bg-primary/10 p-1.5 shrink-0">{item.icon}</div>
              <div>
                <div className="text-sm font-medium">{item.title}</div>
                <div className="text-xs text-muted-foreground mt-0.5">{item.desc}</div>
              </div>
            </div>
          ))}
        </div>

        {error && <MessageBanner msg={{ variant: "error", text: error }} />}

        <Button className="w-full h-12" onClick={startSetup} disabled={isLoading}>
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
          <p className="text-sm text-muted-foreground">Open your authenticator app and scan this code to add Control HUB.</p>
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

        <Button className="w-full h-12" onClick={() => setStep("verify")}>
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
          <p className="text-sm text-muted-foreground">Enter the 6-digit code from your authenticator app to complete setup.</p>
        </div>

        <OtpInput value={code} onChange={setCode} disabled={isLoading} />
        {error && <MessageBanner msg={{ variant: "error", text: error }} />}

        <Button className="w-full h-12" onClick={handleVerify} disabled={isLoading || code.length !== 6}>
          {isLoading ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Verifying…</> : "Verify & Enable MFA"}
        </Button>

        <button type="button" className="w-full text-center text-sm text-muted-foreground hover:text-foreground transition-colors" onClick={() => { setStep("qr"); setCode(""); setError(""); }}>
          <ArrowLeft className="h-3.5 w-3.5 inline mr-1" /> Back
        </button>
      </div>
    );
  }

  // Recovery codes step
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
        <Button variant={savedCodes ? "default" : "outline"} className="flex-1 gap-2" onClick={() => setSavedCodes(true)}>
          <Check className={cn("h-4 w-4", savedCodes ? "opacity-100" : "opacity-50")} />
          I've Saved Them
        </Button>
      </div>

      <Button className="w-full h-12" onClick={finishSetup} disabled={!savedCodes}>
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

// ─── Main Login Page ──────────────────────────────────────────────────────────

export default function Login() {
  const { login, loginWithToken, mfaChallenge, clearMfaChallenge } = useAuth();
  const [, setLocation] = useLocation();
  const [message, setMessage] = useState<InlineMessage | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [capsLock, setCapsLock] = useState(false);
  const emailRef = useRef<HTMLInputElement>(null);

  // SSO state
  const [ssoLoading, setSsoLoading] = useState(false);
  const [ssoConfigured, setSsoConfigured] = useState<boolean | null>(null);

  // Environment badge
  const [appEnv, setAppEnv] = useState<AppEnv | null>(null);

  useEffect(() => {
    // Fetch safe public config (environment)
    fetch("/api/config")
      .then((r) => r.json())
      .then((d) => setAppEnv(d.env ?? "development"))
      .catch(() => setAppEnv("development"));

    // Check whether Microsoft SSO is configured
    fetch("/api/auth/sso/status")
      .then((r) => r.json())
      .then((d) => setSsoConfigured(d.configured === true))
      .catch(() => setSsoConfigured(false));

    const params = new URLSearchParams(window.location.search);

    // Handle SSO callback token
    const ssoToken = params.get("sso_token");
    if (ssoToken) {
      window.history.replaceState({}, "", window.location.pathname);
      loginWithToken(ssoToken)
        .then(() => setLocation("/"))
        .catch(() => setMessage({ variant: "error", text: "Microsoft sign-in could not be completed. Try again or contact your organization administrator." }));
      return;
    }

    // Handle SSO error codes returned from the callback redirect
    const ssoErrorParam = params.get("sso_error");
    if (ssoErrorParam) {
      window.history.replaceState({}, "", window.location.pathname);
      const msgs: Record<string, string> = {
        access_denied: "Microsoft sign-in was cancelled.",
        not_provisioned: "Access has not been provisioned. Contact your Control HUB administrator.",
        invalid_state: "Microsoft sign-in session expired. Please try again.",
        token_exchange_failed: "Microsoft authentication failed. Please try again.",
        invalid_token: "Invalid response from Microsoft. Contact your administrator.",
        config_not_found: "Microsoft SSO is not configured. Contact your administrator.",
        missing_params: "Incomplete sign-in response. Please try again.",
        account_inactive: "Your Control HUB account is inactive. Contact your administrator.",
        sso_disabled: "Microsoft SSO is disabled for this account.",
        token_audience_mismatch: "Microsoft SSO configuration error. Contact your administrator.",
        token_issuer_mismatch: "Microsoft SSO configuration error. Contact your administrator.",
      };
      setMessage({ variant: "error", text: msgs[ssoErrorParam] ?? "Microsoft sign-in could not be completed. Try again or contact your organization administrator." });
    }

    // Banner states from URL params
    if (params.get("invited") === "1") {
      setMessage({ variant: "success", text: "Account activated! Your password has been set. Sign in below to get started." });
    }
    if (params.get("reset") === "success") {
      setMessage({ variant: "success", text: "Password reset successfully. Sign in below with your new password." });
    }
    if (params.get("expired") === "1") {
      setMessage({ variant: "warning", text: "Your session has expired. Please sign in again." });
    }

    emailRef.current?.focus();
  }, []);

  const handleMicrosoftLogin = async () => {
    setSsoLoading(true);
    setMessage(null);
    try {
      const res = await fetch("/api/auth/microsoft/initiate");
      const data = await res.json();
      if (!res.ok) {
        setMessage({ variant: "error", text: data.error ?? "Microsoft sign-in is temporarily unavailable. Please try again." });
        return;
      }
      window.location.href = data.authUrl;
    } catch {
      setMessage({ variant: "error", text: "Microsoft sign-in is temporarily unavailable. Please try again." });
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
      setMessage(null);
      setIsLoading(true);
      await login(data);
      if (!mfaChallenge) {
        setLocation("/");
      }
    } catch (e: any) {
      // Clear the password field after a failed login — do not preserve it
      form.setValue("password", "");
      const raw =
        e?.data?.error ||
        e?.data?.message ||
        e?.message ||
        "";
      const normalized = String(raw).replace(/^HTTP \d+ [^:]+:\s*/, "").toLowerCase();

      // Map specific backend messages to user-safe copy without revealing account existence
      let userMsg = "Unable to sign in with those credentials.";
      if (normalized.includes("disabled") || normalized.includes("inactive")) {
        userMsg = "This account is disabled. Contact your organization administrator.";
      } else if (normalized.includes("invitation") || normalized.includes("invite")) {
        userMsg = "Your invitation has not been completed. Check your email for the setup link.";
      } else if (normalized.includes("rate limit") || normalized.includes("too many")) {
        userMsg = "Too many attempts. Please wait a moment before trying again.";
      } else if (normalized.includes("network") || normalized.includes("fetch")) {
        userMsg = "Network error. Check your connection and try again.";
      }

      setMessage({ variant: "error", text: userMsg });
    } finally {
      setIsLoading(false);
    }
  };

  // Caps Lock detection
  const handleKeyEvent = useCallback((e: KeyboardEvent) => {
    setCapsLock(e.getModifierState?.("CapsLock") ?? false);
  }, []);

  useEffect(() => {
    window.addEventListener("keydown", handleKeyEvent);
    window.addEventListener("keyup", handleKeyEvent);
    return () => {
      window.removeEventListener("keydown", handleKeyEvent);
      window.removeEventListener("keyup", handleKeyEvent);
    };
  }, [handleKeyEvent]);

  // ── Right-panel content ────────────────────────────────────────────────────

  const loginForm = (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4" noValidate>

        {/* Inline message region — above email */}
        {message && (
          <MessageBanner
            msg={message}
            onDismiss={() => setMessage(null)}
          />
        )}

        {/* Email */}
        <FormField
          control={form.control}
          name="email"
          render={({ field }) => (
            <FormItem>
              <FormLabel className="text-sm font-medium text-slate-700">Email address</FormLabel>
              <FormControl>
                <Input
                  type="email"
                  placeholder="name@organization.com"
                  autoComplete="email"
                  className="h-12 text-sm focus-visible:ring-blue-500"
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

        {/* Password */}
        <FormField
          control={form.control}
          name="password"
          render={({ field }) => (
            <FormItem>
              <div className="flex items-center justify-between">
                <FormLabel className="text-sm font-medium text-slate-700">Password</FormLabel>
                <a
                  href="/forgot-password"
                  className="text-xs text-slate-500 hover:text-slate-800 transition-colors underline-offset-4 hover:underline"
                  tabIndex={0}
                >
                  Forgot password?
                </a>
              </div>
              <FormControl>
                <div className="relative">
                  <Input
                    type={showPassword ? "text" : "password"}
                    autoComplete="current-password"
                    className="h-12 pr-11 text-sm focus-visible:ring-blue-500"
                    {...field}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    className="absolute inset-y-0 right-0 flex items-center px-3 text-slate-400 hover:text-slate-700 transition-colors"
                    aria-label={showPassword ? "Hide password" : "Show password"}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </FormControl>
              <FormMessage />
              {capsLock && (
                <p className="flex items-center gap-1.5 text-xs text-amber-600 mt-1" role="status">
                  <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                  Caps Lock is on
                </p>
              )}
            </FormItem>
          )}
        />

        {/* Sign in button */}
        <Button
          type="submit"
          className="w-full h-12 text-sm font-semibold bg-blue-600 hover:bg-blue-700 focus-visible:ring-blue-500"
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
  );

  const rightPanel = (() => {
    // MFA flows — render inside the same card shell
    if (mfaChallenge?.type === "mfa_required") {
      return <MfaVerifyScreen mfaStateToken={mfaChallenge.mfaStateToken} onBack={clearMfaChallenge} />;
    }
    if (mfaChallenge?.type === "mfa_setup_required") {
      return <MfaSetupScreen mfaStateToken={mfaChallenge.mfaStateToken} onBack={clearMfaChallenge} />;
    }

    return (
      <div className="space-y-5">
        {/* Card header */}
        <div className="space-y-1">
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Welcome back</h1>
          <p className="text-sm font-medium text-slate-600">Sign in to Control HUB</p>
          <p className="text-xs text-slate-500 pt-0.5">
            Use your Control HUB credentials or your Microsoft work account.
          </p>
        </div>

        {/* Login form */}
        {loginForm}

        {/* Microsoft SSO */}
        {ssoConfigured === true && (
          <>
            {/* Divider */}
            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t border-slate-200" />
              </div>
              <div className="relative flex justify-center text-xs">
                <span className="bg-white px-3 text-slate-400">or continue with</span>
              </div>
            </div>

            <Button
              type="button"
              variant="outline"
              className="w-full h-12 gap-2.5 text-sm font-medium border-slate-200 bg-white text-slate-800 hover:bg-slate-50 hover:border-slate-300 focus-visible:ring-blue-500"
              disabled={ssoLoading}
              onClick={handleMicrosoftLogin}
            >
              {ssoLoading ? (
                <><Loader2 className="h-4 w-4 animate-spin" />Redirecting to Microsoft…</>
              ) : (
                <><MicrosoftIcon />Continue with Microsoft</>
              )}
            </Button>
          </>
        )}

        {/* Access + security footer */}
        <div className="space-y-2 pt-1">
          <p className="text-center text-xs text-slate-500">
            Need access?{" "}
            <span className="text-slate-700">Contact your organization administrator.</span>
          </p>
          <p className="text-center text-[11px] text-slate-400">
            Authorized use only. Activity may be logged.
          </p>
        </div>
      </div>
    );
  })();

  // ── Full page layout ───────────────────────────────────────────────────────

  return (
    <div className="min-h-screen flex" role="main">

      {/* ── Left brand panel (desktop only) ─────────────────────────────────── */}
      <aside
        className="hidden lg:flex lg:w-[46%] xl:w-[44%] relative bg-gradient-to-br from-slate-900 via-[#0f1f3d] to-slate-900 flex-col justify-between p-10 xl:p-12"
        aria-hidden="true"
      >
        <SecurityBackground />

        {/* Top: logo + wordmark */}
        <div className="relative z-10 flex items-center gap-3">
          <img
            src="/assets/control-hub-icon.png"
            alt="Control HUB"
            className="h-12 w-12 object-contain"
          />
          <span className="text-white font-bold text-lg tracking-tight">Control HUB</span>
        </div>

        {/* Middle: headline + copy + badges + benefits */}
        <div className="relative z-10 space-y-7">
          <div>
            <h2 className="text-3xl xl:text-4xl font-bold text-white leading-snug">
              Compliance readiness,{" "}
              <span className="text-blue-400">organized.</span>
            </h2>
            <p className="mt-3 text-slate-400 text-sm leading-relaxed max-w-xs xl:max-w-sm">
              Manage requirements, evidence, documentation, assessments, and continuous monitoring in one secure workspace.
            </p>
          </div>

          {/* Framework badges */}
          <div className="flex flex-wrap gap-2">
            {["CMMC", "NIST SP 800-171", "DFARS"].map((badge) => (
              <span
                key={badge}
                className="inline-flex items-center rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-medium text-slate-300"
              >
                {badge}
              </span>
            ))}
          </div>

          {/* Value statement rows */}
          <div className="space-y-3">
            {[
              {
                icon: <Layers className="h-4 w-4 text-blue-400 shrink-0 mt-0.5" />,
                title: "Multi-framework management",
                desc: "Manage CMMC, NIST, DFARS, and applicable organizational requirements.",
              },
              {
                icon: <FileCheck className="h-4 w-4 text-blue-400 shrink-0 mt-0.5" />,
                title: "Evidence mapped to requirements",
                desc: "Organize supporting artifacts and maintain clear requirement traceability.",
              },
              {
                icon: <ClipboardCheck className="h-4 w-4 text-blue-400 shrink-0 mt-0.5" />,
                title: "Role-based workflows and audit history",
                desc: "Use role-based workflows, approvals, monitoring, and recorded activity.",
              },
            ].map((item) => (
              <div key={item.title} className="flex items-start gap-3">
                {item.icon}
                <div>
                  <div className="text-sm font-medium text-white">{item.title}</div>
                  <div className="text-xs text-slate-500 mt-0.5">{item.desc}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Bottom: Carme Technology */}
        <div className="relative z-10 space-y-0.5">
          <a
            href="https://carmetechnology.com"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-block"
          >
            <img
              src="/carme-technology-logo.png"
              alt="Carme Technology"
              className="h-10 w-auto object-contain opacity-90 hover:opacity-100 transition-opacity"
            />
          </a>
          <p className="text-slate-500 text-xs">Compliance technology for defense contractors and regulated organizations.</p>
        </div>
      </aside>

      {/* ── Right panel ─────────────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col bg-slate-50 min-h-screen">

        {/* Mobile top banner — shown only below lg breakpoint */}
        <div className="lg:hidden flex items-center gap-3 px-6 py-4 bg-slate-900">
          <img
            src="/assets/control-hub-icon.png"
            alt="Control HUB"
            className="h-8 w-8 object-contain"
          />
          <span className="text-white font-bold text-base tracking-tight">Control HUB</span>
          <span className="ml-auto text-slate-400 text-xs">Compliance Readiness &amp; Evidence Management</span>
        </div>

        {/* Centered login card */}
        <div className="flex-1 flex items-center justify-center px-4 py-10">
          <div className="w-full max-w-[440px]">

            {/* The card */}
            <div className="rounded-2xl border border-slate-200 bg-white shadow-sm px-8 py-8">
              {rightPanel}
            </div>

            {/* Below-card footnote */}
            <p className="mt-4 text-center text-[11px] text-slate-400">
              Compliance Readiness &amp; Evidence Management · Control HUB
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
