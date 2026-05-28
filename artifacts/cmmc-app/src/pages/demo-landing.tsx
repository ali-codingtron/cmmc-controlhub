import { useState } from "react";
import { useLocation } from "wouter";
import { useDemoMode } from "@/context/DemoModeContext";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Shield, FileText, Activity, AlertTriangle, BarChart3,
  Network, Search, CheckCircle, ArrowRight, Play,
  Lock, Users, Zap, ExternalLink, ChevronRight,
  ClipboardList, RadarIcon, BookOpen,
} from "lucide-react";

const FEATURES = [
  {
    icon: Shield,
    title: "CMMC 2.0 Controls",
    description: "All 110 Level 2 controls tracked with implementation status, narratives, and evidence linkage.",
    color: "text-blue-600 bg-blue-50",
  },
  {
    icon: Search,
    title: "Tenant Pre-Assessment",
    description: "Connect your Microsoft 365 tenant and automatically scan Entra ID, Intune, and Defender for compliance gaps.",
    color: "text-violet-600 bg-violet-50",
  },
  {
    icon: FileText,
    title: "Evidence Management",
    description: "Centralize policies, screenshots, audit logs, and reports with a full review-and-approval workflow.",
    color: "text-emerald-600 bg-emerald-50",
  },
  {
    icon: Activity,
    title: "Monitoring Tracker",
    description: "19 pre-built CMMC L2 operational monitoring tasks with schedules from daily to annually.",
    color: "text-amber-600 bg-amber-50",
  },
  {
    icon: AlertTriangle,
    title: "POA&M Tracking",
    description: "Track every gap with risk ratings, remediation plans, owners, and scheduled completion dates.",
    color: "text-red-600 bg-red-50",
  },
  {
    icon: BookOpen,
    title: "System Security Plan",
    description: "Auto-build your SSP from control assessments and export C3PAO-ready documentation.",
    color: "text-cyan-600 bg-cyan-50",
  },
  {
    icon: BarChart3,
    title: "Executive Reports",
    description: "On-demand PDF reports — gap analysis, domain readiness, evidence inventory, and POAM summaries.",
    color: "text-indigo-600 bg-indigo-50",
  },
  {
    icon: Users,
    title: "Multi-Tenant MSP",
    description: "Manage multiple client organizations from one platform with full data isolation.",
    color: "text-pink-600 bg-pink-50",
  },
];

const STATS = [
  { value: "110", label: "CMMC L2 Controls" },
  { value: "14", label: "Practice Domains" },
  { value: "19", label: "Monitoring Tasks" },
  { value: "C3PAO", label: "Assessment Ready" },
];

const HOW_IT_WORKS = [
  {
    step: "01",
    title: "Connect Your Tenant",
    description: "Link your Microsoft 365 tenant to run automated compliance scans across Entra ID, Intune, and Defender. Get findings in minutes.",
    icon: Network,
  },
  {
    step: "02",
    title: "Track & Remediate",
    description: "Work through controls, upload evidence, manage monitoring tasks, and assign POA&Ms to remediate gaps.",
    icon: ClipboardList,
  },
  {
    step: "03",
    title: "Report & Assess",
    description: "Generate executive reports, export your SSP, and prepare a complete evidence package for your C3PAO assessment.",
    icon: RadarIcon,
  },
];

export default function DemoLanding() {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { enableDemoMode } = useDemoMode();
  const [, navigate] = useLocation();
  const queryClient = useQueryClient();

  const handleLaunchDemo = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/demo-login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error ?? "Demo login failed. Please try again.");
        return;
      }

      const data = await res.json();
      localStorage.setItem("auth_token", data.token);
      if (data.demoOrgId) {
        localStorage.setItem("cmmc_active_org_id", data.demoOrgId);
      }
      enableDemoMode();
      queryClient.clear();
      navigate("/");
    } catch {
      setError("Could not connect to the server. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* ── Nav ───────────────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-50 border-b bg-background/95 backdrop-blur">
        <div className="max-w-6xl mx-auto px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="h-7 w-7 rounded-md bg-primary flex items-center justify-center">
              <Shield className="h-4 w-4 text-primary-foreground" />
            </div>
            <span className="font-bold text-lg tracking-tight">Control HUB</span>
            <Badge variant="secondary" className="text-[10px] font-semibold">CMMC 2.0</Badge>
          </div>
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" onClick={() => navigate("/login")}>
              Sign In
            </Button>
            <Button size="sm" onClick={handleLaunchDemo} disabled={isLoading}>
              {isLoading ? "Loading..." : "Launch Demo"}
              {!isLoading && <ArrowRight className="h-3.5 w-3.5 ml-1.5" />}
            </Button>
          </div>
        </div>
      </header>

      {/* ── Hero ──────────────────────────────────────────────────────────── */}
      <section className="relative overflow-hidden border-b bg-gradient-to-br from-background via-background to-primary/5">
        <div className="max-w-6xl mx-auto px-6 py-20 md:py-28">
          <div className="max-w-3xl">
            <Badge className="mb-5 text-xs font-semibold" variant="outline">
              <Zap className="h-3 w-3 mr-1.5 text-primary" />
              CMMC Readiness &amp; Evidence Management
            </Badge>
            <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold tracking-tight leading-tight mb-6">
              CMMC compliance,{" "}
              <span className="text-primary">built for defense contractors</span>
            </h1>
            <p className="text-lg md:text-xl text-muted-foreground leading-relaxed mb-8 max-w-2xl">
              Control HUB gives your team one platform to manage CMMC 2.0 readiness —
              from automated Microsoft tenant scanning through evidence collection,
              ongoing monitoring, and C3PAO assessment preparation.
            </p>

            {error && (
              <div className="mb-5 p-3 rounded-md bg-destructive/10 border border-destructive/20 text-sm text-destructive">
                {error}
              </div>
            )}

            <div className="flex flex-wrap items-center gap-3">
              <Button size="lg" onClick={handleLaunchDemo} disabled={isLoading} className="text-sm font-semibold px-6">
                {isLoading ? "Launching..." : "Launch Live Demo"}
                {!isLoading && <ArrowRight className="h-4 w-4 ml-2" />}
              </Button>
              <Button size="lg" variant="outline" className="text-sm px-6" onClick={() => navigate("/demo-video")}>
                <Play className="h-4 w-4 mr-2" />
                Watch Walkthrough
              </Button>
              <Button size="lg" variant="ghost" className="text-sm px-6" asChild>
                <a href="mailto:demo@controlhub.carmetechnology.com?subject=Control HUB Consultation Request">
                  Request Consultation
                  <ExternalLink className="h-3.5 w-3.5 ml-2 text-muted-foreground" />
                </a>
              </Button>
            </div>

            <p className="mt-4 text-xs text-muted-foreground">
              Demo uses synthetic CarmeTechnology data. No account required.
            </p>
          </div>
        </div>

        {/* Decorative grid */}
        <div className="absolute inset-0 -z-10 [background-image:linear-gradient(to_right,hsl(var(--border))_1px,transparent_1px),linear-gradient(to_bottom,hsl(var(--border))_1px,transparent_1px)] [background-size:64px_64px] opacity-30" />
      </section>

      {/* ── Stats ─────────────────────────────────────────────────────────── */}
      <section className="border-b bg-muted/30">
        <div className="max-w-6xl mx-auto px-6 py-8">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
            {STATS.map((s) => (
              <div key={s.label} className="text-center">
                <div className="text-3xl font-bold text-primary">{s.value}</div>
                <div className="text-sm text-muted-foreground mt-1">{s.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Features ──────────────────────────────────────────────────────── */}
      <section className="py-20 border-b">
        <div className="max-w-6xl mx-auto px-6">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold mb-3">Everything you need for CMMC readiness</h2>
            <p className="text-muted-foreground max-w-xl mx-auto">
              From automated tenant assessment to C3PAO-ready documentation — built for the full compliance lifecycle.
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {FEATURES.map((f) => (
              <div key={f.title} className="group p-5 rounded-xl border bg-card hover:shadow-md transition-shadow">
                <div className={`inline-flex p-2.5 rounded-lg mb-4 ${f.color}`}>
                  <f.icon className="h-5 w-5" />
                </div>
                <h3 className="font-semibold text-sm mb-2">{f.title}</h3>
                <p className="text-xs text-muted-foreground leading-relaxed">{f.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── How it works ──────────────────────────────────────────────────── */}
      <section className="py-20 border-b bg-muted/20">
        <div className="max-w-6xl mx-auto px-6">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold mb-3">How it works</h2>
            <p className="text-muted-foreground">From zero to assessment-ready in three phases.</p>
          </div>
          <div className="grid md:grid-cols-3 gap-8">
            {HOW_IT_WORKS.map((step, i) => (
              <div key={step.step} className="relative flex flex-col items-start">
                {i < HOW_IT_WORKS.length - 1 && (
                  <ChevronRight className="absolute -right-5 top-5 h-5 w-5 text-muted-foreground/40 hidden md:block" />
                )}
                <div className="flex items-center gap-3 mb-4">
                  <span className="text-4xl font-black text-primary/20 leading-none">{step.step}</span>
                  <div className="p-2 rounded-lg bg-primary/10">
                    <step.icon className="h-5 w-5 text-primary" />
                  </div>
                </div>
                <h3 className="font-semibold mb-2">{step.title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{step.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Demo CTA ──────────────────────────────────────────────────────── */}
      <section className="py-20 border-b">
        <div className="max-w-6xl mx-auto px-6">
          <div className="rounded-2xl bg-primary/5 border border-primary/20 p-10 md:p-14 text-center">
            <div className="inline-flex items-center gap-2 bg-primary/10 text-primary text-xs font-semibold px-3 py-1.5 rounded-full mb-6">
              <CheckCircle className="h-3.5 w-3.5" />
              Live Demo — No login required
            </div>
            <h2 className="text-3xl md:text-4xl font-bold mb-4">
              See Control HUB in action
            </h2>
            <p className="text-muted-foreground max-w-lg mx-auto mb-8 leading-relaxed">
              Explore a fully-populated demo environment with real CMMC controls,
              a completed Microsoft tenant scan, evidence records, monitoring items,
              and ready-to-download PDF reports.
            </p>
            {error && (
              <div className="mb-5 p-3 rounded-md bg-destructive/10 border border-destructive/20 text-sm text-destructive max-w-sm mx-auto">
                {error}
              </div>
            )}
            <div className="flex flex-wrap justify-center gap-3">
              <Button size="lg" onClick={handleLaunchDemo} disabled={isLoading} className="px-8 font-semibold">
                {isLoading ? "Launching..." : "Launch Demo Now"}
                {!isLoading && <ArrowRight className="h-4 w-4 ml-2" />}
              </Button>
              <Button size="lg" variant="outline" className="px-8" asChild>
                <a href="mailto:demo@controlhub.carmetechnology.com?subject=Control HUB Consultation Request">
                  Talk to Sales
                </a>
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* ── What's in the demo ────────────────────────────────────────────── */}
      <section className="py-16 border-b bg-muted/10">
        <div className="max-w-6xl mx-auto px-6">
          <h2 className="text-xl font-bold mb-6 text-center">What's included in the demo</h2>
          <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-3 max-w-3xl mx-auto">
            {[
              "110 CMMC L2 controls with assessment status",
              "Microsoft 365 tenant scan (Entra ID, Intune, Defender)",
              "12 pre-assessment findings with severity ratings",
              "20 evidence records (policies, reports, screenshots)",
              "8 POA&M items with remediation plans",
              "19 operational monitoring items with schedules",
              "10 roadmap actions with priorities",
              "Downloadable executive and technical reports",
              "Full System Security Plan (SSP)",
            ].map((item) => (
              <div key={item} className="flex items-start gap-2 text-sm text-muted-foreground">
                <CheckCircle className="h-4 w-4 text-emerald-500 mt-0.5 shrink-0" />
                <span>{item}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Footer ────────────────────────────────────────────────────────── */}
      <footer className="border-t py-10">
        <div className="max-w-6xl mx-auto px-6 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <div className="h-6 w-6 rounded-md bg-primary flex items-center justify-center">
              <Shield className="h-3.5 w-3.5 text-primary-foreground" />
            </div>
            <span className="font-semibold text-sm">Control HUB</span>
            <span className="text-muted-foreground text-xs">by CarmeTechnology</span>
          </div>
          <div className="flex items-center gap-4 text-xs text-muted-foreground">
            <button onClick={() => navigate("/login")} className="hover:text-foreground transition-colors">
              Sign In
            </button>
            <a href="mailto:demo@controlhub.carmetechnology.com" className="hover:text-foreground transition-colors">
              Contact
            </a>
            <span>controlhub.carmetechnology.com</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
