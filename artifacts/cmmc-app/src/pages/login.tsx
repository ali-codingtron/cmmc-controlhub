import { useState, useRef, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useAuth } from "@/lib/auth";
import { useLocation } from "wouter";
import { Shield, Eye, EyeOff, Loader2, Lock, Network, ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils";

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

export default function Login() {
  const { login } = useAuth();
  const [, setLocation] = useLocation();
  const [error, setError] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const emailRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    emailRef.current?.focus();
  }, []);

  const form = useForm<z.infer<typeof loginSchema>>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" },
  });

  const onSubmit = async (data: z.infer<typeof loginSchema>) => {
    try {
      setError("");
      setIsLoading(true);
      await login(data);
      setLocation("/");
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

  return (
    <div className="min-h-screen flex">
      {/* Left panel — branding */}
      <div className="hidden lg:flex lg:w-1/2 relative bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900 flex-col justify-between p-12">
        <SecurityBackground />

        <div className="relative z-10">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-blue-500/20 border border-blue-400/30">
              <Shield className="h-5 w-5 text-blue-300" />
            </div>
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

      {/* Right panel — login form */}
      <div className="flex-1 flex flex-col items-center justify-center bg-background px-6 py-12">
        <div className="w-full max-w-sm space-y-8">
          {/* Mobile logo */}
          <div className="flex flex-col items-center gap-3 lg:hidden">
            <div className="flex items-center justify-center w-12 h-12 rounded-2xl bg-primary/10 border border-primary/20">
              <Shield className="h-6 w-6 text-primary" />
            </div>
            <div className="text-center">
              <h1 className="text-2xl font-bold tracking-tight">Control HUB</h1>
              <p className="text-sm text-muted-foreground">CMMC Compliance &amp; Evidence Management</p>
            </div>
          </div>

          {/* Desktop heading */}
          <div className="hidden lg:block space-y-1">
            <h1 className="text-2xl font-bold tracking-tight">Sign in to your account</h1>
            <p className="text-sm text-muted-foreground">CMMC Compliance &amp; Evidence Management</p>
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

          <p className="text-center text-xs text-muted-foreground">
            Secure Compliance Platform &mdash; Control HUB
          </p>
        </div>
      </div>
    </div>
  );
}
