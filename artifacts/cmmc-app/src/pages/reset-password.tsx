import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Link, useLocation } from "wouter";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Loader2, ShieldCheck, Eye, EyeOff, ArrowLeft, CheckCircle2, XCircle, AlertTriangle } from "lucide-react";

const schema = z
  .object({
    newPassword: z.string().min(12, "At least 12 characters required"),
    confirmPassword: z.string().min(1, "Please confirm your password"),
  })
  .refine((d) => d.newPassword === d.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });
type FormValues = z.infer<typeof schema>;

type TokenStatus = "checking" | "valid" | "invalid" | "expired" | "used";

function SecurityBackground() {
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      <svg className="absolute inset-0 w-full h-full opacity-[0.07]" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <pattern id="grid-rp" width="40" height="40" patternUnits="userSpaceOnUse">
            <path d="M 40 0 L 0 0 0 40" fill="none" stroke="white" strokeWidth="0.5" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#grid-rp)" />
      </svg>
    </div>
  );
}

function StrengthBar({ password }: { password: string }) {
  const checks = [
    password.length >= 12,
    /[A-Z]/.test(password),
    /[a-z]/.test(password),
    /[0-9]/.test(password),
    /[^A-Za-z0-9]/.test(password),
  ];
  const score = checks.filter(Boolean).length;
  const labels = ["", "Weak", "Fair", "Good", "Strong", "Very strong"];
  const colors = ["", "bg-red-500", "bg-orange-400", "bg-yellow-400", "bg-blue-500", "bg-green-500"];

  if (!password) return null;

  return (
    <div className="space-y-1.5 mt-2">
      <div className="flex gap-1">
        {[1, 2, 3, 4, 5].map((i) => (
          <div
            key={i}
            className={`h-1 flex-1 rounded-full transition-colors ${i <= score ? colors[score] : "bg-muted"}`}
          />
        ))}
      </div>
      <div className="flex justify-between items-center">
        <p className="text-xs text-muted-foreground">
          {checks.map((ok, idx) => {
            const reqs = ["12+ chars", "uppercase", "lowercase", "number", "special"];
            return !ok ? (
              <span key={idx} className="mr-1.5">
                <span className="text-orange-500">✗</span> {reqs[idx]}
              </span>
            ) : null;
          })}
        </p>
        <span className={`text-xs font-medium ${score >= 4 ? "text-green-600" : score >= 3 ? "text-blue-600" : "text-orange-500"}`}>
          {labels[score]}
        </span>
      </div>
    </div>
  );
}

export default function ResetPassword() {
  const [, navigate] = useLocation();
  const [tokenStatus, setTokenStatus] = useState<TokenStatus>("checking");
  const [firstName, setFirstName] = useState<string>("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const rawToken = new URLSearchParams(window.location.search).get("token") ?? "";
  const base = (import.meta.env.BASE_URL ?? "").replace(/\/$/, "");

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { newPassword: "", confirmPassword: "" },
  });

  const watchedPassword = form.watch("newPassword");

  useEffect(() => {
    if (!rawToken) {
      setTokenStatus("invalid");
      return;
    }
    fetch(`${base}/api/auth/reset-password/validate?token=${encodeURIComponent(rawToken)}`)
      .then((r) => r.json())
      .then((data: { valid: boolean; status: string; firstName?: string }) => {
        if (data.valid) {
          setTokenStatus("valid");
          setFirstName(data.firstName ?? "");
        } else {
          setTokenStatus((data.status as TokenStatus) ?? "invalid");
        }
      })
      .catch(() => setTokenStatus("invalid"));
  }, [rawToken, base]);

  async function onSubmit(values: FormValues) {
    setIsLoading(true);
    setServerError(null);
    try {
      const res = await fetch(`${base}/api/auth/reset-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token: rawToken,
          newPassword: values.newPassword,
          confirmPassword: values.confirmPassword,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setServerError(data.error ?? "Failed to reset password. Please try again.");
        if (data.code === "expired" || data.code === "used" || data.code === "invalid") {
          setTokenStatus(data.code as TokenStatus);
        }
        return;
      }
      setSuccess(true);
      setTimeout(() => navigate("/login?reset=success"), 3000);
    } catch {
      setServerError("Network error. Please check your connection and try again.");
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex bg-background">
      {/* Decorative left panel */}
      <div className="hidden lg:flex lg:w-[45%] bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 relative flex-col items-center justify-center p-12 overflow-hidden">
        <SecurityBackground />
        <div className="relative z-10 text-center space-y-6 max-w-sm">
          <div className="mx-auto h-20 w-20 rounded-3xl bg-white/10 flex items-center justify-center ring-1 ring-white/20 backdrop-blur-sm">
            <ShieldCheck className="h-10 w-10 text-blue-300" />
          </div>
          <div className="space-y-2">
            <h2 className="text-2xl font-bold text-white tracking-tight">Choose a strong password</h2>
            <p className="text-slate-400 text-sm leading-relaxed">
              Your new password must meet all security requirements to protect your account.
            </p>
          </div>
          <div className="space-y-3 text-left">
            {[
              "12 or more characters",
              "Uppercase and lowercase letters",
              "At least one number",
              "At least one special character",
            ].map((item) => (
              <div key={item} className="flex items-center gap-2.5 text-sm text-slate-300">
                <div className="h-1.5 w-1.5 rounded-full bg-blue-400 shrink-0" />
                {item}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Right form panel */}
      <div className="flex-1 flex items-center justify-center p-6 lg:p-12">
        <div className="w-full max-w-sm space-y-6">
          {/* Mobile logo */}
          <div className="flex lg:hidden items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-primary flex items-center justify-center">
              <ShieldCheck className="h-5 w-5 text-primary-foreground" />
            </div>
            <span className="font-semibold text-lg">Control HUB</span>
          </div>

          {tokenStatus === "checking" && (
            <div className="flex flex-col items-center justify-center py-12 space-y-3">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              <p className="text-sm text-muted-foreground">Verifying reset link…</p>
            </div>
          )}

          {(tokenStatus === "invalid" || tokenStatus === "expired" || tokenStatus === "used") && (
            <div className="space-y-5">
              <div className="flex flex-col items-center text-center space-y-4 py-4">
                <div className={`h-16 w-16 rounded-full flex items-center justify-center ${tokenStatus === "used" ? "bg-amber-100" : "bg-red-100"}`}>
                  {tokenStatus === "used" ? (
                    <AlertTriangle className="h-8 w-8 text-amber-600" />
                  ) : (
                    <XCircle className="h-8 w-8 text-red-600" />
                  )}
                </div>
                <div className="space-y-1.5">
                  <h1 className="text-xl font-semibold">
                    {tokenStatus === "used"
                      ? "Link already used"
                      : tokenStatus === "expired"
                      ? "Link expired"
                      : "Invalid link"}
                  </h1>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    {tokenStatus === "used"
                      ? "This password reset link has already been used. If you need to reset your password again, please request a new link."
                      : tokenStatus === "expired"
                      ? "This password reset link has expired. Reset links are valid for 30 minutes."
                      : "This password reset link is invalid or has been revoked."}
                  </p>
                </div>
              </div>
              <Link href="/forgot-password">
                <Button className="w-full">Request a new reset link</Button>
              </Link>
              <Link href="/login">
                <Button variant="ghost" className="w-full gap-2 text-muted-foreground">
                  <ArrowLeft className="h-4 w-4" />
                  Back to sign in
                </Button>
              </Link>
            </div>
          )}

          {tokenStatus === "valid" && !success && (
            <div className="space-y-5">
              <div className="space-y-1">
                <h1 className="text-2xl font-bold tracking-tight">
                  {firstName ? `Hi ${firstName}, set a new password` : "Set a new password"}
                </h1>
                <p className="text-sm text-muted-foreground">
                  Choose a strong password for your account.
                </p>
              </div>

              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                  <FormField
                    control={form.control}
                    name="newPassword"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-sm font-medium">New password</FormLabel>
                        <FormControl>
                          <div className="relative">
                            <Input
                              type={showPassword ? "text" : "password"}
                              autoComplete="new-password"
                              className="h-10 pr-10"
                              autoFocus
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
                        <StrengthBar password={watchedPassword} />
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="confirmPassword"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-sm font-medium">Confirm new password</FormLabel>
                        <FormControl>
                          <div className="relative">
                            <Input
                              type={showConfirm ? "text" : "password"}
                              autoComplete="new-password"
                              className="h-10 pr-10"
                              {...field}
                            />
                            <button
                              type="button"
                              onClick={() => setShowConfirm((v) => !v)}
                              className="absolute inset-y-0 right-0 flex items-center pr-3 text-muted-foreground hover:text-foreground transition-colors"
                              tabIndex={-1}
                              aria-label={showConfirm ? "Hide password" : "Show password"}
                            >
                              {showConfirm ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                            </button>
                          </div>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  {serverError && (
                    <div
                      role="alert"
                      className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2.5 text-sm text-destructive"
                    >
                      <XCircle className="h-4 w-4 shrink-0 mt-0.5" />
                      <span>{serverError}</span>
                    </div>
                  )}

                  <Button type="submit" className="w-full h-10 font-medium" disabled={isLoading}>
                    {isLoading ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Resetting…
                      </>
                    ) : (
                      "Reset password"
                    )}
                  </Button>
                </form>
              </Form>

              <Link href="/login">
                <Button variant="ghost" className="w-full gap-2 text-muted-foreground">
                  <ArrowLeft className="h-4 w-4" />
                  Back to sign in
                </Button>
              </Link>
            </div>
          )}

          {success && (
            <div className="space-y-5">
              <div className="flex flex-col items-center text-center space-y-4 py-4">
                <div className="h-16 w-16 rounded-full bg-green-100 flex items-center justify-center">
                  <CheckCircle2 className="h-8 w-8 text-green-600" />
                </div>
                <div className="space-y-1.5">
                  <h1 className="text-xl font-semibold">Password updated!</h1>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    Your password has been reset successfully. Redirecting you to sign in…
                  </p>
                </div>
              </div>
              <Link href="/login">
                <Button className="w-full gap-2">
                  <ArrowLeft className="h-4 w-4" />
                  Sign in now
                </Button>
              </Link>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
