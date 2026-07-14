import { useState } from "react";
import { useLocation } from "wouter";
import { useDemoMode } from "@/context/DemoModeContext";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import {
  Shield, FileText, Activity, AlertTriangle, BarChart3,
  Network, Search, CheckCircle, ArrowRight, Play,
  Users, ExternalLink, ClipboardList, RadarIcon, BookOpen,
  TrendingUp, Zap, Building2, Info, Target, ChevronDown,
} from "lucide-react";
import carmetechLogo from "@assets/Carme_Tech_Logo_Official_1779981155506.png";

const CONSULTATION_HREF = "mailto:info@carmetechnology.com?subject=Control%20HUB%20Consultation%20Request";

const FEATURES = [
  { icon: Shield, title: "CMMC Control Library", desc: "All 110 Level 2 controls tracked with implementation status, narratives, evidence linkage, and SSP mapping.", color: "#2563EB" },
  { icon: Search, title: "Tenant Pre-Assessment", desc: "Automated Microsoft 365 scan across Entra ID, Intune, and Defender — findings in minutes, not weeks.", color: "#7C3AED" },
  { icon: FileText, title: "Evidence Repository", desc: "Centralize policies, screenshots, audit logs, and reports with a full review-and-approval workflow.", color: "#059669" },
  { icon: Activity, title: "Monitoring Tracker", desc: "19 pre-built CMMC L2 operational monitoring tasks with daily, weekly, monthly, quarterly, and annual schedules.", color: "#D97706" },
  { icon: AlertTriangle, title: "POA&M Management", desc: "Track every gap with risk ratings, remediation plans, owner assignments, and scheduled completion dates.", color: "#DC2626" },
  { icon: BookOpen, title: "System Security Plan", desc: "Auto-assembled SSP from control narratives — always current, exportable to PDF, ready for internal or external review.", color: "#0891B2" },
  { icon: BarChart3, title: "Executive Reports", desc: "On-demand PDF reports: gap analysis, domain readiness, evidence inventory, POA&M summaries, and bulk evidence exports.", color: "#4F46E5" },
  { icon: Users, title: "Multi-Tenant MSP Ready", desc: "Manage multiple client organizations from one platform with full data isolation and org switcher.", color: "#BE185D" },
];

const VALUE_PROPS = [
  { icon: Target, title: "Self-Assessment Readiness", desc: "Track CMMC Level 1 / Level 2 self-assessment readiness and internal control implementation status.", color: "#2563EB" },
  { icon: FileText, title: "NIST 800-171 Evidence Management", desc: "Organize evidence, documents, SSP narratives, monitoring records, and POA&M items by control.", color: "#059669" },
  { icon: Shield, title: "DFARS Support", desc: "Maintain the documentation and evidence needed to support contract cybersecurity obligations.", color: "#7C3AED" },
  { icon: Search, title: "Audit and Review Support", desc: "Prepare clean evidence inventories, reports, and packages for internal, government, prime, or customer review.", color: "#0891B2" },
  { icon: Activity, title: "Continuous Monitoring", desc: "Track recurring weekly, monthly, quarterly, and annual compliance activities with inline editing.", color: "#D97706" },
  { icon: TrendingUp, title: "Implementation Roadmap", desc: "Follow high-impact remediation actions that support multiple controls at once — prioritized by risk.", color: "#4F46E5" },
];

const DEMO_STEPS = [
  { n: "01", title: "Executive Dashboard", desc: "Readiness score, evidence health, monitoring status, POA&M summary, and recommended next actions — all on one screen." },
  { n: "02", title: "CMMC Controls", desc: "Browse all 110 L2 controls with implementation status, narratives, evidence links, monitoring tasks, and SSP sections." },
  { n: "03", title: "Evidence Repository", desc: "20 sample evidence items — policies, screenshots, audit logs, reports — with review and approval workflow." },
  { n: "04", title: "SSP and Documentation", desc: "Review SSP control mappings, document templates, gap analysis, and compliance log tracking." },
  { n: "05", title: "Monitoring Tracker", desc: "19-row monitoring tracker with overdue highlights, frequency badges, and last/next-due dates." },
  { n: "06", title: "POA&M Tracker", desc: "8 open POA&M items from critical to low risk — each with remediation plans, owners, and deadlines." },
  { n: "07", title: "Pre-Assessment Results", desc: "Completed Microsoft 365 tenant scan with 94 checks, 12 findings, severity ratings, and implementation roadmap." },
  { n: "08", title: "Reports & Exports", desc: "Downloadable executive and technical PDF reports — ready to share with leadership, prime contractors, or auditors." },
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
      window.location.href = "/";
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
            <img src="/assets/control-hub-icon.png" alt="Control HUB" className="h-8 w-8 rounded-lg" />
            <span className="font-bold text-lg text-white tracking-tight">Control HUB</span>
            <span className="hidden sm:flex items-center gap-1 text-xs text-slate-500 font-medium">
              <span className="text-slate-600 mx-1">·</span>
              <img src={carmetechLogo} alt="Carme Technology" className="h-8 rounded" style={{ background: "#1C1A0A" }} />
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
        <div style={{
          position: "absolute", inset: 0, zIndex: 0,
          backgroundImage: "linear-gradient(rgba(255,255,255,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.03) 1px, transparent 1px)",
          backgroundSize: "60px 60px",
        }} />
        <div style={{
          position: "absolute", top: "-20%", right: "10%", width: "600px", height: "600px",
          background: "radial-gradient(circle, rgba(37,99,235,0.12) 0%, transparent 70%)",
          zIndex: 0,
        }} />

        <div className="relative z-10 max-w-6xl mx-auto px-6 py-20 md:py-28 lg:py-32">
          <div className="flex flex-col lg:flex-row items-start lg:items-center gap-12 lg:gap-16">
            <div className="flex-1 max-w-2xl">
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold mb-6"
                style={{ background: "rgba(37,99,235,0.15)", border: "1px solid rgba(37,99,235,0.3)", color: "#93C5FD" }}>
                <Zap className="h-3 w-3" />
                CMMC · NIST 800-171 · DFARS Readiness Platform
              </div>

              <h1 className="text-4xl md:text-5xl lg:text-[52px] font-black leading-tight tracking-tight text-white mb-6">
                CMMC, NIST 800-171, and DFARS Readiness —{" "}
                <span style={{ color: "#60A5FA" }}>Built for Defense Contractors</span>
              </h1>

              <p className="text-lg text-slate-400 leading-relaxed mb-8 max-w-xl">
                Control HUB helps defense contractors manage self-assessment readiness, evidence
                collection, SSP narratives, POA&amp;M tracking, recurring monitoring, and audit
                support from one secure platform.
              </p>

              {error && (
                <div className="mb-5 p-3 rounded-lg text-sm"
                  style={{ background: "rgba(220,38,38,0.1)", border: "1px solid rgba(220,38,38,0.3)", color: "#FCA5A5" }}>
                  {error}
                </div>
              )}

              <div className="flex flex-wrap gap-3 mb-4">
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
                Explore a sample organization using synthetic data. No account required.
              </p>
            </div>

            <div className="w-full lg:w-auto lg:flex-shrink-0 flex justify-center lg:justify-end">
              <ReadinessCard />
            </div>
          </div>
        </div>
      </section>

      {/* ── Stats bar ──────────────────────────────────────────────────────── */}
      <section style={{ background: "#1E293B", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
        <div className="max-w-6xl mx-auto px-6 py-7">
          <div className="grid grid-cols-2 md:grid-cols-5 gap-6">
            {[
              { value: "110", label: "CMMC L2 Controls" },
              { value: "14", label: "Practice Domains" },
              { value: "19", label: "Monitoring Tasks" },
              { value: "L1 / L2", label: "Self-Assessment Ready" },
              { value: "C3PAO", label: "Ready When Required" },
            ].map((s) => (
              <div key={s.label} className="text-center">
                <div className="text-3xl font-black text-blue-400">{s.value}</div>
                <div className="text-xs text-slate-500 mt-1 font-medium">{s.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CMMC Phase II Status Banner ─────────────────────────────────────── */}
      <section style={{ background: "#1A2035", borderBottom: "1px solid rgba(201,168,76,0.2)" }}>
        <div className="max-w-6xl mx-auto px-6 py-8">
          <div className="rounded-xl p-6"
            style={{ background: "rgba(201,168,76,0.07)", border: "1px solid rgba(201,168,76,0.25)" }}>
            <div className="flex flex-col md:flex-row items-start gap-5">
              <div className="flex-shrink-0">
                <div className="inline-flex items-center justify-center w-10 h-10 rounded-lg"
                  style={{ background: "rgba(201,168,76,0.15)", border: "1px solid rgba(201,168,76,0.3)" }}>
                  <Info className="h-5 w-5" style={{ color: "#C9A84C" }} />
                </div>
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-center gap-2 mb-2">
                  <h3 className="font-bold text-sm" style={{ color: "#C9A84C" }}>CMMC Phase II Update</h3>
                  <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full uppercase tracking-wide"
                    style={{ background: "rgba(201,168,76,0.15)", color: "#C9A84C", border: "1px solid rgba(201,168,76,0.3)" }}>
                    July 2026
                  </span>
                </div>
                <p className="text-sm text-slate-300 leading-relaxed mb-2">
                  CMMC Phase II transition requirements are currently suspended during the federal
                  reform review period. Self-assessment, NIST SP 800-171, DFARS, SSP, POA&amp;M,
                  evidence, and monitoring readiness remain important for contractors handling FCI or CUI.
                </p>
                <p className="text-xs text-slate-500 mb-4">
                  Contract-specific requirements should be confirmed with the contracting officer,
                  prime contractor, or compliance advisor.
                </p>
                <a
                  href="#regulatory-update"
                  className="inline-flex items-center gap-1.5 text-xs font-semibold transition-colors"
                  style={{ color: "#C9A84C" }}
                >
                  Learn What This Means
                  <ChevronDown className="h-3.5 w-3.5" />
                </a>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── What Changed / What Did Not ────────────────────────────────────── */}
      <section id="regulatory-update" style={{ background: "#0F172A" }} className="py-16">
        <div className="max-w-6xl mx-auto px-6">
          <div className="text-center mb-10">
            <h2 className="text-2xl md:text-3xl font-bold text-white mb-3">What Changed — and What Did Not</h2>
            <p className="text-slate-400 text-sm max-w-lg mx-auto">
              Understanding the current regulatory environment helps contractors stay prepared
              regardless of how requirements evolve.
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-6 mb-8">
            {/* What Changed */}
            <div className="rounded-xl p-6"
              style={{ background: "rgba(220,38,38,0.05)", border: "1px solid rgba(220,38,38,0.2)" }}>
              <div className="flex items-center gap-2 mb-4">
                <div className="w-2 h-2 rounded-full bg-red-400" />
                <h3 className="font-bold text-white text-sm">What Changed</h3>
              </div>
              <ul className="space-y-3">
                {[
                  "Phase II transition requirements are suspended during the reform review period.",
                  "Broad Level 2 third-party assessment expansion is paused.",
                  "Contractors should verify contract-specific language and any amendments.",
                ].map((item) => (
                  <li key={item} className="flex items-start gap-2.5 text-sm text-slate-300">
                    <span className="mt-1 w-1.5 h-1.5 rounded-full bg-red-400 flex-shrink-0" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>

            {/* What Did Not Change */}
            <div className="rounded-xl p-6"
              style={{ background: "rgba(22,163,74,0.05)", border: "1px solid rgba(22,163,74,0.2)" }}>
              <div className="flex items-center gap-2 mb-4">
                <div className="w-2 h-2 rounded-full bg-emerald-400" />
                <h3 className="font-bold text-white text-sm">What Did Not Change</h3>
              </div>
              <ul className="space-y-3">
                {[
                  "Self-assessment readiness remains important.",
                  "NIST SP 800-171 implementation still matters for CUI environments.",
                  "DFARS evidence obligations may still apply by contract.",
                  "SSP, POA&M, evidence, monitoring, and documentation still need to be maintained.",
                  "Government, prime contractor, or customer review may still require organized evidence.",
                ].map((item) => (
                  <li key={item} className="flex items-start gap-2.5 text-sm text-slate-300">
                    <CheckCircle className="h-4 w-4 mt-0.5 text-emerald-400 flex-shrink-0" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <div className="text-center">
            <p className="text-xs text-slate-600 max-w-xl mx-auto">
              Control HUB is a readiness and evidence management platform. It does not provide legal advice or official certification.
            </p>
          </div>
        </div>
      </section>

      {/* ── Why Control HUB Still Matters ─────────────────────────────────── */}
      <section className="py-20 bg-background border-b">
        <div className="max-w-6xl mx-auto px-6">
          <div className="text-center mb-12">
            <p className="text-xs font-bold uppercase tracking-widest mb-4" style={{ color: "#3B82F6", letterSpacing: "0.12em" }}>
              CMMC · NIST 800-171 · DFARS
            </p>
            <h2 className="text-3xl font-bold mb-3">Why Control HUB Still Matters</h2>
            <p className="text-muted-foreground max-w-xl mx-auto text-sm">
              Regardless of how certification requirements evolve, the underlying evidence, documentation,
              and monitoring obligations remain. Control HUB helps you stay ready.
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {VALUE_PROPS.map((f) => (
              <div key={f.title}
                className="group p-5 rounded-xl border bg-card hover:shadow-md transition-all duration-200">
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

      {/* ── Features ───────────────────────────────────────────────────────── */}
      <section style={{ background: "#1E293B" }} className="py-20">
        <div className="max-w-6xl mx-auto px-6">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold text-white mb-3">Everything you need for compliance readiness</h2>
            <p className="text-slate-400 max-w-xl mx-auto text-sm">
              From automated tenant assessment to organized evidence and reporting — one platform for the full compliance lifecycle.
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {FEATURES.map((f) => (
              <div key={f.title}
                style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)" }}
                className="group p-5 rounded-xl hover:border-blue-500/30 transition-all duration-200">
                <div className="inline-flex p-2.5 rounded-lg mb-4"
                  style={{ background: `${f.color}18` }}>
                  <f.icon className="h-5 w-5" style={{ color: f.color }} />
                </div>
                <h3 className="font-semibold text-sm text-white mb-2">{f.title}</h3>
                <p className="text-xs text-slate-400 leading-relaxed">{f.desc}</p>
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
            <h2 className="text-3xl font-bold text-white mb-3">What You'll See in the Demo</h2>
            <p className="text-slate-400 max-w-md mx-auto text-sm">
              Explore a fully-populated sample organization across every module of the platform.
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
              {isLoading ? "Launching…" : "Launch Live Demo"}
              {!isLoading && <ArrowRight className="h-4 w-4 ml-2" />}
            </Button>
            <p className="text-xs text-slate-600 mt-3">Explore a sample organization using synthetic data. No account required.</p>
          </div>
        </div>
      </section>

      {/* ── How it works ───────────────────────────────────────────────────── */}
      <section className="py-20 bg-background border-b">
        <div className="max-w-6xl mx-auto px-6">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold mb-3">How it works</h2>
            <p className="text-muted-foreground text-sm">From zero to readiness in three phases.</p>
          </div>
          <div className="grid md:grid-cols-3 gap-8">
            {[
              {
                step: "01", icon: Network, title: "Connect Your Tenant",
                desc: "Link your Microsoft 365 tenant to run automated compliance scans across Entra ID, Intune, and Defender. Get findings in minutes.",
              },
              {
                step: "02", icon: ClipboardList, title: "Track & Remediate",
                desc: "Work through controls, upload evidence, manage monitoring tasks, and assign POA&Ms to close every gap.",
              },
              {
                step: "03", icon: RadarIcon, title: "Report & Review",
                desc: "Generate executive reports, export your SSP, and deliver organized evidence packages for self-assessment, audit review, customer review, or external assessment.",
              },
            ].map((s) => (
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

      {/* ── Regulatory Status Footnote ─────────────────────────────────────── */}
      <section style={{ background: "#111827", borderTop: "1px solid rgba(255,255,255,0.05)", borderBottom: "1px solid rgba(255,255,255,0.05)" }} className="py-10">
        <div className="max-w-4xl mx-auto px-6">
          <div className="flex items-start gap-4">
            <div className="flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center mt-0.5"
              style={{ background: "rgba(37,99,235,0.1)", border: "1px solid rgba(37,99,235,0.2)" }}>
              <Info className="h-4 w-4 text-blue-400" />
            </div>
            <div>
              <p className="text-xs text-slate-400 leading-relaxed mb-2">
                <span className="text-slate-300 font-semibold">Regulatory Status:</span>{" "}
                Regulatory status last reviewed: July 2026. Organizations should validate
                contract-specific requirements with the applicable contracting officer or prime contractor.
                Control HUB is a readiness and evidence management platform and does not provide legal advice or official certification.
              </p>
              <div className="flex flex-wrap gap-4 text-xs">
                <a
                  href="https://www.defense.gov/CMMC/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-blue-400 hover:text-blue-300 transition-colors"
                >
                  DoD CMMC Program Page
                  <ExternalLink className="h-3 w-3" />
                </a>
                <a
                  href="https://www.federalregister.gov/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-blue-400 hover:text-blue-300 transition-colors"
                >
                  Federal Register
                  <ExternalLink className="h-3 w-3" />
                </a>
              </div>
            </div>
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
            Ready to talk about your compliance program?
          </h2>
          <p className="text-slate-400 mb-8 leading-relaxed">
            Our team specializes in CMMC and NIST 800-171 readiness for defense contractors.
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
                <img src="/assets/control-hub-icon.png" alt="Control HUB" className="h-7 w-7 rounded-md" />
                <span className="font-bold text-sm text-white">Control HUB</span>
                <img src={carmetechLogo} alt="Carme Technology" className="h-8 rounded" style={{ background: "#1C1A0A" }} />
              </div>
              <p className="text-[11px] text-slate-600">Demo uses synthetic sample data only. Not legal advice.</p>
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
