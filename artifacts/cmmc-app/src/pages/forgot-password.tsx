import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Link } from "wouter";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Loader2, ShieldCheck, ArrowLeft, MailCheck } from "lucide-react";

const schema = z.object({
  email: z.string().email("Enter a valid email address"),
});
type FormValues = z.infer<typeof schema>;

function SecurityBackground() {
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      <svg className="absolute inset-0 w-full h-full opacity-[0.07]" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <pattern id="grid-fp" width="40" height="40" patternUnits="userSpaceOnUse">
            <path d="M 40 0 L 0 0 0 40" fill="none" stroke="white" strokeWidth="0.5" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#grid-fp)" />
      </svg>
    </div>
  );
}

export default function ForgotPassword() {
  const [submitted, setSubmitted] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { email: "" },
  });

  async function onSubmit(values: FormValues) {
    setIsLoading(true);
    try {
      const base = (import.meta.env.BASE_URL ?? "").replace(/\/$/, "");
      await fetch(`${base}/api/auth/forgot-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: values.email }),
      });
    } catch {
      // Intentionally swallow network errors — always show success to prevent enumeration
    } finally {
      setIsLoading(false);
      setSubmitted(true);
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
            <h2 className="text-2xl font-bold text-white tracking-tight">Secure Password Reset</h2>
            <p className="text-slate-400 text-sm leading-relaxed">
              We'll send a secure, time-limited reset link to your registered email address.
            </p>
          </div>
          <div className="space-y-3 text-left">
            {[
              "Link expires in 30 minutes",
              "Single-use — invalidated after use",
              "Previous links revoked on new request",
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

          {submitted ? (
            <div className="space-y-5">
              <div className="flex flex-col items-center text-center space-y-4 py-4">
                <div className="h-16 w-16 rounded-full bg-green-100 flex items-center justify-center">
                  <MailCheck className="h-8 w-8 text-green-600" />
                </div>
                <div className="space-y-1.5">
                  <h1 className="text-xl font-semibold">Check your email</h1>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    If an account exists for <span className="font-medium text-foreground">{form.getValues("email")}</span>, we've sent a password reset link. Check your inbox and spam folder.
                  </p>
                </div>
                <p className="text-xs text-muted-foreground">
                  The link expires in 30 minutes.
                </p>
                <p className="text-xs text-muted-foreground border-t pt-3 mt-1">
                  Didn't receive an email? Your administrator may need to configure email delivery — contact them for a manual password reset link.
                </p>
              </div>
              <Link href="/login">
                <Button variant="outline" className="w-full gap-2">
                  <ArrowLeft className="h-4 w-4" />
                  Back to sign in
                </Button>
              </Link>
            </div>
          ) : (
            <div className="space-y-5">
              <div className="space-y-1">
                <h1 className="text-2xl font-bold tracking-tight">Forgot your password?</h1>
                <p className="text-sm text-muted-foreground">
                  Enter your email and we'll send you a reset link.
                </p>
              </div>

              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
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
                            autoFocus
                            className="h-10"
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <Button type="submit" className="w-full h-10 font-medium" disabled={isLoading}>
                    {isLoading ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Sending…
                      </>
                    ) : (
                      "Send reset link"
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
        </div>
      </div>
    </div>
  );
}
