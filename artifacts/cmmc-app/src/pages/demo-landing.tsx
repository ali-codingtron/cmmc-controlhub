import { useState } from "react";
import { useLocation } from "wouter";
import { useDemoMode } from "@/context/DemoModeContext";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import {
  Shield, FileText, Activity, AlertTriangle, BarChart3,
  Network, Search, CheckCircle, ArrowRight, Play,
  Users, ExternalLink, ClipboardList, RadarIcon, BookOpen,
  Lock, TrendingUp, Zap, Building2,
} from "lucide-react";
import carmetechLogo from "@assets/Carme_Tech_Logo_Official_1779981155506.png";

const CONSULTATION_HREF = "mailto:info@carmetechnology.com?subject=Control%20HUB%20Consultation%20Request";

const FEATURES = [
  { icon: Shield, title: "CMMC 2.0 Control Library", desc: "All 110 Level 2 controls tracked with implementation status, narratives, evidence linkage, and SSP mapping.", color: "#2563EB" },
  { icon: Search, title: "Tenant Pre-Assessment", desc: "Automated Microsoft 365 scan across Entra ID, Intune, and Defender — findings in minutes, not weeks.", color: "#7C3AED" },
  { icon: FileText, title: "Evidence Repository", desc: "Centralize policies, screenshots, audit logs, and reports with a full review-and-approval workflow.", color: "#059669" },
  { icon: Activity, title: "Monitoring Tracker", desc: "19 pre-built CMMC L2 operational monitoring tasks with daily, weekly, monthly, quarterly, and annual schedules.", color: "#D97706" },
  { icon: AlertTriangle, title: "POA&M Management", desc: "Track every gap with risk ratings, remediation plans, owner assignments, and scheduled completion dates.", color: "#DC2626" },
  { icon: BookOpen, title: "System Security Plan", desc: "Auto-assembled SSP from control narratives — always current, C3PAO-ready, exportable to PDF.", color: "#0891B2" },
  { icon: BarChart3, title: "Executive Reports", desc: "On-demand PDF reports: gap analysis, domain readiness, evidence inventory, and POA&M summaries.", color: "#4F46E5" },
  { icon: Users, title: "Multi-Tenant MSP Ready", desc: "Manage multiple client organizations from one platform with full data isolation and org switcher.", color: "#BE185D" },
];

const DEMO_STEPS = [
  { n: "01", title: "Executive Dashboard", desc: "Readiness score, evidence health, monitoring status, POA&M summary, and recommended next actions — all on one screen." },
  { n: "02", title: "CMMC Controls", desc: "Browse all 110 L2 controls with implementation status, narratives, evidence links, monitoring tasks, and SSP sections." },
  { n: "03", title: "Evidence Repository", desc: "20 sample evidence items — policies, screenshots, audit logs, reports — with review and approval workflow." },
  { n: "04", title: "Monitoring Tracker", desc: "19-row monitoring tracker with overdue highlights, frequency badges, and last/next-due dates." },
  { n: "05", title: "POA&M Tracker", desc: "8 open POA&M items from critical to low risk — each with remediation plans, owners, and deadlines." },
  { n: "06", title: "Pre-Assessment Results", desc: "Completed Microsoft 365 tenant scan with 94 checks, 12 findings, severity ratings, and an implementation roadmap." },
  { n: "07", title: "Implementation Roadmap", desc: "10 prioritized remediation actions grouped by category, linked to specific findings and controls." },
  { n: "08", title: "Reports & Exports", desc: "Downloadable executive and technical PDF reports — ready to share with leadership or your C3PAO." },
];

function ReadinessCard() {
  return (
    <div style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)" }}
      className="rounded-2xl p-5 w-full max-w-sm space-y-4 backdrop-blur-sm">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Overall Readiness</span>
        <span className="text-xs text-slate-500">CarmeTechnology</span>
      </div>
      <div className="flex items-end gap-3">
        <span className="text-5xl font-black text-white">62%</span>
        <span className="text-sm text-emerald-400 mb-2 flex items-center gap-1">
          <TrendingUp className="h-3.5 w-3.5" /> +8% this quarter
        </span>
      </div>
      <div className="w-full rounded-full h-2" style={{ background: "rgba(255,255,255,0.1)" }}>
        <div className="h-2 rounded-full" style={{ width: "62%", background: "linear-gradient(90deg, #2563EB, #3B82F6)" }} />
      </div>
      <div className="space-y-2.5 pt-1">
        {[
          { label: "Access Control", pct: 78, color: "#3B82F6" },
          { label: "Identification & Auth", pct: 55, color: "#F59E0B" },
          { label: "Incident Response", pct: 40, color: "#EF4444" },
          { label: "Configuration Mgmt", pct: 70, color: "#3B82F6" },
        ].map((d) => (
          <div key={d.label}>
            <div className="flex justify-between text-[11px] mb-1">
              <span className="text-slate-400">{d.label}</span>
              <span className="text-slate-300 font-medium">{d.pct}%</span>
            </div>
            <div className="h-1.5 rounded-full" style={{ background: "rgba(255,255,255,0.08)" }}>
              <div className="h-1.5 rounded-full transition-all" style={{ width: `${d.pct}%`, background: d.color }} />
            </div>
          </div>
        ))}
      </div>
      <div className="grid grid-cols-3 gap-2 pt-1 border-t" style={{ borderColor: "rgba(255,255,255,0.08)" }}>
        <div className="text-center">
          <div className="text-lg font-bold text-white">14</div>
          <div className="text-[10px] text-slate-500">Evidence gaps</div>
        </div>
        <div className="text-center">
          <div className="text-lg font-bold text-amber-400">4</div>
          <div className="text-[10px] text-slate-500">Overdue tasks</div>
        </div>
        <div className="text-center">
          <div className="text-lg font-bold text-red-400">8</div>
          <div className="text-[10px] text-slate-500">Open POA&Ms</div>
        </div>
      </div>
    </div>
  );
}

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
      if (data.demoOrgId) localStorage.setItem("cmmc_active_org_id", data.demoOrgId);
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
    <div className="min-h-screen text-foreground" style={{ fontFamily: "inherit" }}>

      {/* ── Navbar ─────────────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-50" style={{ background: "#0F172A", borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
        <div className="max-w-6xl mx-auto px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-7 w-7 rounded-md bg-blue-600 flex items-center justify-center">
              <Shield className="h-4 w-4 text-white" />
            </div>
            <span className="font-bold text-lg text-white tracking-tight">Control HUB</span>
            <span className="hidden sm:flex items-center gap-1 text-xs text-slate-500 font-medium">
              <span className="text-slate-600 mx-1">·</span>
              <img src={carmetechLogo} alt="Carme Technology" className="h-5 rounded" style={{ background: "#1C1A0A" }} />
            </span>
          </div>
          <div className="flex items-center gap-2">
            <a
              href={CONSULTATION_HREF}
              className="hidden sm:flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-md transition-colors"
              style={{ color: "#C9A84C", border: "1px solid rgba(201,168,76,0.3)" }}
            >
              Request Consultation
            </a>
            <button
              onClick={() => navigate("/login")}
              className="text-xs text-slate-400 hover:text-white transition-colors px-3 py-1.5"
            >
              Sign In
            </button>
            <Button
              size="sm"
              onClick={handleLaunchDemo}
              disabled={isLoading}
              className="text-xs font-semibold bg-blue-600 hover:bg-blue-700 text-white border-0"
            >
              {isLoading ? "Loading…" : "Launch Demo"}
              {!isLoading && <ArrowRight className="h-3.5 w-3.5 ml-1.5" />}
            </Button>
          </div>
        </div>
      </header>

      {/* ── Hero ───────────────────────────────────────────────────────────── */}
      <section
        style={{
          background: "linear-gradient(135deg, #0F172A 0%, #1E293B 50%, #0F172A 100%)",
          position: "relative",
          overflow: "hidden",
        }}
      >
        {/* Subtle grid overlay */}
        <div style={{
          position: "absolute", inset: 0, zIndex: 0,
          backgroundImage: "linear-gradient(rgba(255,255,255,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.03) 1px, transparent 1px)",
          backgroundSize: "60px 60px",
        }} />
        {/* Blue glow */}
        <div style={{
          position: "absolute", top: "-20%", right: "10%", width: "600px", height: "600px",
          background: "radial-gradient(circle, rgba(37,99,235,0.12) 0%, transparent 70%)",
          zIndex: 0,
        }} />

        <div className="relative z-10 max-w-6xl mx-auto px-6 py-20 md:py-28 lg:py-32">
          <div className="flex flex-col lg:flex-row items-start lg:items-center gap-12 lg:gap-16">
            {/* Left: text */}
            <div className="flex-1 max-w-2xl">
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold mb-6"
                style={{ background: "rgba(37,99,235,0.15)", border: "1px solid rgba(37,99,235,0.3)", color: "#93C5FD" }}>
                <Zap className="h-3 w-3" />
                CMMC 2.0 Compliance Platform
              </div>

              <h1 className="text-4xl md:text-5xl lg:text-[52px] font-black leading-tight tracking-tight text-white mb-6">
                CMMC Readiness,{" "}
                <span style={{ color: "#60A5FA" }}>Evidence Management</span>
                {" "}&amp; Continuous Monitoring
              </h1>

              <p className="text-lg text-slate-400 leading-relaxed mb-8 max-w-xl">
                Control HUB helps defense contractors understand where they stand, organize evidence,
                track recurring monitoring, manage remediation, and prepare for C3PAO review — all in one platform.
              </p>

              {error && (
                <div className="mb-5 p-3 rounded-lg text-sm"
                  style={{ background: "rgba(220,38,38,0.1)", border: "1px solid rgba(220,38,38,0.3)", color: "#FCA5A5" }}>
                  {error}
                </div>
              )}

              <div className="flex flex-wrap gap-3 mb-6">
                <Button
                  size="lg"
                  onClick={handleLaunchDemo}
                  disabled={isLoading}
                  className="font-semibold px-7 bg-blue-600 hover:bg-blue-700 text-white border-0 shadow-lg"
                >
                  {isLoading ? "Launching…" : "Launch Live Demo"}
                  {!isLoading && <ArrowRight className="h-4 w-4 ml-2" />}
                </Button>
                <Button
                  size="lg"
                  variant="outline"
                  className="px-6 text-white border-white/20 bg-white/5 hover:bg-white/10"
                  onClick={() => navigate("/demo-video")}
                >
                  <Play className="h-4 w-4 mr-2 text-slate-300" />
                  Watch Walkthrough
                </Button>
                <a
                  href={CONSULTATION_HREF}
                  className="inline-flex items-center gap-2 px-6 h-11 rounded-md text-sm font-medium transition-colors"
                  style={{ color: "#C9A84C", border: "1px solid rgba(201,168,76,0.3)", background: "rgba(201,168,76,0.05)" }}
                >
                  Request Consultation
                  <ExternalLink className="h-3.5 w-3.5" />
                </a>
              </div>

              <p className="text-xs text-slate-600">
                Demo uses synthetic CarmeTechnology sample data only. No account required. No real data exposed.
              </p>
            </div>

            {/* Right: mockup card */}
            <div className="w-full lg:w-auto lg:flex-shrink-0 flex justify-center lg:justify-end">
              <ReadinessCard />
            </div>
          </div>
        </div>
      </section>

      {/* ── Stats bar ──────────────────────────────────────────────────────── */}
      <section style={{ background: "#1E293B", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
        <div className="max-w-6xl mx-auto px-6 py-7">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
            {[
              { value: "110", label: "CMMC L2 Controls" },
              { value: "14", label: "Practice Domains" },
              { value: "19", label: "Monitoring Tasks" },
              { value: "C3PAO", label: "Assessment Ready" },
            ].map((s) => (
              <div key={s.label} className="text-center">
                <div className="text-3xl font-black text-blue-400">{s.value}</div>
                <div className="text-xs text-slate-500 mt-1 font-medium">{s.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Features ───────────────────────────────────────────────────────── */}
      <section className="py-20 bg-background border-b">
        <div className="max-w-6xl mx-auto px-6">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold mb-3">Everything you need for CMMC readiness</h2>
            <p className="text-muted-foreground max-w-xl mx-auto text-sm">
              From automated tenant assessment to C3PAO-ready documentation — one platform for the full compliance lifecycle.
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {FEATURES.map((f) => (
              <div key={f.title}
                className="group p-5 rounded-xl border bg-card hover:shadow-lg transition-all duration-200">
                <div className="inline-flex p-2.5 rounded-lg mb-4"
                  style={{ background: `${f.color}18` }}>
                  <f.icon className="h-5 w-5" style={{ color: f.color }} />
                </div>
                <h3 className="font-semibold text-sm mb-2">{f.title}</h3>
                <p className="text-xs text-muted-foreground leading-relaxed">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── What you'll see ─────────────────────────────────────────────────── */}
      <section style={{ background: "#0F172A" }} className="py-20">
        <div className="max-w-6xl mx-auto px-6">
          <div className="text-center mb-12">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold mb-5"
              style={{ background: "rgba(37,99,235,0.15)", border: "1px solid rgba(37,99,235,0.3)", color: "#93C5FD" }}>
              <CheckCircle className="h-3 w-3" />
              Live Demo — No login required
            </div>
            <h2 className="text-3xl font-bold text-white mb-3">What you'll see in the demo</h2>
            <p className="text-slate-400 max-w-md mx-auto text-sm">
              Explore a fully-populated CarmeTechnology dataset across every module of the platform.
            </p>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {DEMO_STEPS.map((s) => (
              <div key={s.n}
                style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)" }}
                className="rounded-xl p-5 hover:border-blue-500/30 transition-colors">
                <div className="text-3xl font-black mb-3" style={{ color: "rgba(37,99,235,0.4)" }}>{s.n}</div>
                <h3 className="font-semibold text-sm text-white mb-2">{s.title}</h3>
                <p className="text-xs text-slate-500 leading-relaxed">{s.desc}</p>
              </div>
            ))}
          </div>

          <div className="mt-10 text-center">
            <Button
              size="lg"
              onClick={handleLaunchDemo}
              disabled={isLoading}
              className="px-10 font-semibold bg-blue-600 hover:bg-blue-700 text-white border-0 shadow-xl"
            >
              {isLoading ? "Launching…" : "Launch Demo Now"}
              {!isLoading && <ArrowRight className="h-4 w-4 ml-2" />}
            </Button>
            <p className="text-xs text-slate-600 mt-3">No account needed. Sample data only.</p>
          </div>
        </div>
      </section>

      {/* ── How it works ───────────────────────────────────────────────────── */}
      <section className="py-20 bg-background border-b">
        <div className="max-w-6xl mx-auto px-6">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold mb-3">How it works</h2>
            <p className="text-muted-foreground text-sm">From zero to assessment-ready in three phases.</p>
          </div>
          <div className="grid md:grid-cols-3 gap-8">
            {[
              { step: "01", icon: Network, title: "Connect Your Tenant", desc: "Link your Microsoft 365 tenant to run automated compliance scans across Entra ID, Intune, and Defender. Get findings in minutes." },
              { step: "02", icon: ClipboardList, title: "Track & Remediate", desc: "Work through controls, upload evidence, manage monitoring tasks, and assign POA&Ms to close every gap." },
              { step: "03", icon: RadarIcon, title: "Report & Assess", desc: "Generate executive reports, export your SSP, and deliver a complete evidence package to your C3PAO." },
            ].map((s, i) => (
              <div key={s.step} className="flex flex-col items-start">
                <div className="flex items-center gap-3 mb-4">
                  <span className="text-4xl font-black text-primary/15 leading-none">{s.step}</span>
                  <div className="p-2 rounded-lg bg-primary/10">
                    <s.icon className="h-5 w-5 text-primary" />
                  </div>
                </div>
                <h3 className="font-semibold mb-2">{s.title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{s.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA ────────────────────────────────────────────────────────────── */}
      <section style={{ background: "#1E293B" }} className="py-20">
        <div className="max-w-3xl mx-auto px-6 text-center">
          <div className="inline-flex items-center gap-2 mb-5">
            <Building2 className="h-5 w-5 text-blue-400" />
            <span className="text-sm font-semibold text-slate-300">Built by Carme Technology</span>
          </div>
          <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">
            Ready to talk about your CMMC program?
          </h2>
          <p className="text-slate-400 mb-8 leading-relaxed">
            Our team specializes in CMMC readiness for defense contractors.
            Request a consultation to discuss your timeline, gaps, and options.
          </p>
          <div className="flex flex-wrap justify-center gap-3">
            <Button
              size="lg"
              onClick={handleLaunchDemo}
              disabled={isLoading}
              className="px-8 font-semibold bg-blue-600 hover:bg-blue-700 text-white border-0"
            >
              {isLoading ? "Launching…" : "Launch Live Demo"}
              {!isLoading && <ArrowRight className="h-4 w-4 ml-2" />}
            </Button>
            <a
              href={CONSULTATION_HREF}
              className="inline-flex items-center gap-2 px-8 h-11 rounded-md text-sm font-semibold transition-colors"
              style={{ color: "#C9A84C", border: "1px solid rgba(201,168,76,0.4)", background: "rgba(201,168,76,0.08)" }}
            >
              Request Consultation
              <ExternalLink className="h-4 w-4" />
            </a>
          </div>
        </div>
      </section>

      {/* ── Footer ─────────────────────────────────────────────────────────── */}
      <footer style={{ background: "#0F172A", borderTop: "1px solid rgba(255,255,255,0.06)" }} className="py-10">
        <div className="max-w-6xl mx-auto px-6">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-6">
            <div className="flex flex-col items-center sm:items-start gap-2">
              <div className="flex items-center gap-2">
                <div className="h-6 w-6 rounded-md bg-blue-600 flex items-center justify-center">
                  <Shield className="h-3.5 w-3.5 text-white" />
                </div>
                <span className="font-bold text-sm text-white">Control HUB</span>
                <img src={carmetechLogo} alt="Carme Technology" className="h-5 rounded" style={{ background: "#1C1A0A" }} />
              </div>
              <p className="text-[11px] text-slate-600">Demo environment uses synthetic sample data only.</p>
            </div>
            <div className="flex flex-wrap justify-center gap-5 text-xs text-slate-500">
              <button onClick={handleLaunchDemo} className="hover:text-white transition-colors">Launch Demo</button>
              <button onClick={() => navigate("/demo-video")} className="hover:text-white transition-colors">Watch Walkthrough</button>
              <a href={CONSULTATION_HREF} className="hover:text-white transition-colors">Request Consultation</a>
              <button onClick={() => navigate("/login")} className="hover:text-white transition-colors">Sign In</button>
              <a href="mailto:info@carmetechnology.com" className="hover:text-white transition-colors">info@carmetechnology.com</a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
