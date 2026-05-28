import { useState } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import {
  Shield, ArrowLeft, Play, Clock, CheckCircle, ArrowRight,
  ExternalLink,
} from "lucide-react";

const CONSULTATION_HREF = "mailto:info@carmetechnology.com?subject=Control%20HUB%20Consultation%20Request";

const SCRIPT_SECTIONS = [
  { label: "A", title: "Opening", duration: "0:00 – 0:30", script: "Control HUB is a CMMC readiness and evidence management platform built for defense contractors. It gives teams one place to understand where they stand, organize evidence, track recurring monitoring, and prepare for C3PAO review." },
  { label: "B", title: "Dashboard", duration: "0:30 – 1:00", script: "Show the executive dashboard — overall readiness score, evidence health, monitoring health, POA&M summary, domain readiness bars, and recommended next actions at a glance." },
  { label: "C", title: "Pre-Assessment", duration: "1:00 – 1:45", script: "Show the Microsoft tenant scan — connected Entra ID / Intune / Defender tenant, completed scan with 94 checks, 12 findings with severity ratings, auto-generated evidence records, and evidence requests." },
  { label: "D", title: "Controls", duration: "1:45 – 2:15", script: "Open a control and show the implementation narrative, configure steps, linked evidence records, monitoring items, SSP section, and POA&M linkage — all on one page." },
  { label: "E", title: "Evidence Repository", duration: "2:15 – 2:45", script: "Show the evidence repository — filtering by type and status, evidence detail with file preview, metadata, linked controls, and the review/approval workflow." },
  { label: "F", title: "Monitoring Tracker", duration: "2:45 – 3:10", script: "Show the 19-row monitoring tracker — overdue items highlighted in red, frequency badges, inline status, last completed date, and next due date." },
  { label: "G", title: "POA&M Tracker", duration: "3:10 – 3:30", script: "Show the remediation tracker — 8 POA&Ms with risk levels, status badges, scheduled completion dates, and linked controls." },
  { label: "H", title: "Reports & Exports", duration: "3:30 – 4:00", script: "Show the downloadable PDF reports — executive summary and technical detail. Demonstrate generating and downloading a report." },
  { label: "I", title: "Closing", duration: "4:00 – 4:30", script: "Control HUB gives defense contractors one platform to manage CMMC readiness from assessment through ongoing operations. Contact Carme Technology to discuss your program." },
];

const HIGHLIGHTS = [
  { title: "Automated Tenant Scanning", desc: "Connect Microsoft 365 and get Entra ID, Intune, and Defender compliance results in minutes." },
  { title: "110 CMMC L2 Controls", desc: "All controls pre-loaded with guidance, configure steps, monitoring linkage, and evidence requirements." },
  { title: "Evidence Workflow", desc: "Upload, classify, review, and approve evidence through a structured compliance workflow." },
  { title: "19 Monitoring Tasks", desc: "Daily through annual operational compliance tasks with overdue tracking and scheduling." },
  { title: "POA&M Remediation", desc: "Track every gap with risk ratings, owners, remediation plans, and scheduled completion dates." },
  { title: "SSP Generation", desc: "Auto-assembled System Security Plan that stays current as you update control narratives." },
  { title: "PDF Reports", desc: "Executive and technical reports exportable on demand for any stakeholder or assessor." },
  { title: "Multi-Tenant MSP", desc: "Manage multiple client orgs with full data isolation and an org switcher." },
];

export default function DemoVideo() {
  const [, navigate] = useLocation();
  const [isLoading, setIsLoading] = useState(false);

  const handleLaunchDemo = async () => {
    setIsLoading(true);
    try {
      const res = await fetch("/api/auth/demo-login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      if (!res.ok) return;
      const data = await res.json();
      localStorage.setItem("auth_token", data.token);
      if (data.demoOrgId) localStorage.setItem("cmmc_active_org_id", data.demoOrgId);
      localStorage.setItem("isDemoMode", "true");
      navigate("/");
    } catch {
      /* silently fail */
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen" style={{ background: "#F8FAFC" }}>
      {/* ── Nav ─────────────────────────────────────────────────────────── */}
      <header style={{ background: "#0F172A", borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
        <div className="max-w-5xl mx-auto px-6 h-14 flex items-center justify-between">
          <button
            onClick={() => navigate("/demo")}
            className="flex items-center gap-2 text-sm text-slate-400 hover:text-white transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to overview
          </button>
          <div className="flex items-center gap-2">
            <div className="h-6 w-6 rounded-md bg-blue-600 flex items-center justify-center">
              <Shield className="h-3.5 w-3.5 text-white" />
            </div>
            <span className="font-bold text-sm text-white">Control HUB</span>
            <span className="text-slate-600 text-xs hidden sm:inline">·</span>
            <span className="text-xs font-semibold hidden sm:inline" style={{ color: "#C9A84C" }}>CARME TECHNOLOGY</span>
          </div>
          <a
            href={CONSULTATION_HREF}
            className="hidden sm:flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-md transition-colors"
            style={{ color: "#C9A84C", border: "1px solid rgba(201,168,76,0.3)" }}
          >
            Request Consultation
            <ExternalLink className="h-3 w-3" />
          </a>
        </div>
      </header>

      {/* ── Hero ────────────────────────────────────────────────────────── */}
      <div style={{ background: "linear-gradient(135deg, #0F172A 0%, #1E293B 100%)" }} className="py-14">
        <div className="max-w-5xl mx-auto px-6 text-center">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold mb-5"
            style={{ background: "rgba(37,99,235,0.15)", border: "1px solid rgba(37,99,235,0.3)", color: "#93C5FD" }}>
            Demo Walkthrough
          </div>
          <h1 className="text-3xl md:text-4xl font-black text-white mb-4">Control HUB Demo Walkthrough</h1>
          <div className="flex items-center justify-center gap-5 text-sm text-slate-400">
            <span className="flex items-center gap-1.5">
              <Clock className="h-4 w-4" /> 3–5 minutes
            </span>
            <span className="text-slate-600">•</span>
            <span>9 sections</span>
            <span className="text-slate-600">•</span>
            <span>Full platform tour</span>
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-6 py-12">
        {/* ── Video placeholder ─────────────────────────────────────────── */}
        <div className="rounded-2xl overflow-hidden mb-12 shadow-xl"
          style={{ background: "#1E293B", border: "1px solid rgba(255,255,255,0.08)", aspectRatio: "16/9", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div className="text-center px-8">
            <div className="inline-flex p-5 rounded-full mb-5"
              style={{ background: "rgba(37,99,235,0.15)", border: "1px solid rgba(37,99,235,0.25)" }}>
              <Play className="h-10 w-10 text-blue-400" />
            </div>
            <p className="font-bold text-lg text-white mb-2">Walkthrough video coming soon</p>
            <p className="text-sm text-slate-400 mb-6 max-w-sm mx-auto">
              Recording in progress. In the meantime, launch the interactive demo to explore the full platform.
            </p>
            <div className="flex flex-wrap justify-center gap-3">
              <Button
                onClick={handleLaunchDemo}
                disabled={isLoading}
                className="bg-blue-600 hover:bg-blue-700 text-white border-0 font-semibold px-7"
              >
                {isLoading ? "Launching…" : "Launch Interactive Demo"}
                {!isLoading && <ArrowRight className="h-4 w-4 ml-2" />}
              </Button>
              <a
                href={CONSULTATION_HREF}
                className="inline-flex items-center gap-2 px-6 h-10 rounded-md text-sm font-medium"
                style={{ color: "#C9A84C", border: "1px solid rgba(201,168,76,0.3)", background: "rgba(201,168,76,0.05)" }}
              >
                Request Consultation
              </a>
            </div>
          </div>
        </div>

        <div className="grid md:grid-cols-2 gap-10">
          {/* ── Script ──────────────────────────────────────────────────── */}
          <div>
            <h2 className="font-bold text-lg mb-5">Demo Script</h2>
            <div className="space-y-3">
              {SCRIPT_SECTIONS.map((s) => (
                <div key={s.label} className="rounded-xl overflow-hidden border bg-card">
                  <div className="px-4 py-2.5 flex items-center gap-3 border-b bg-muted/30">
                    <div className="h-6 w-6 rounded-full bg-blue-600 text-white text-xs font-bold flex items-center justify-center shrink-0">
                      {s.label}
                    </div>
                    <span className="font-semibold text-sm flex-1">{s.title}</span>
                    <span className="text-xs text-muted-foreground font-mono shrink-0">{s.duration}</span>
                  </div>
                  <div className="px-4 py-2.5">
                    <p className="text-xs text-muted-foreground leading-relaxed">{s.script}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* ── Highlights + CTA ────────────────────────────────────────── */}
          <div>
            <h2 className="font-bold text-lg mb-5">Platform Feature Highlights</h2>
            <div className="space-y-3 mb-8">
              {HIGHLIGHTS.map((f) => (
                <div key={f.title} className="flex gap-3 text-sm">
                  <CheckCircle className="h-4 w-4 text-emerald-500 mt-0.5 shrink-0" />
                  <div>
                    <span className="font-medium">{f.title}</span>
                    <span className="text-muted-foreground"> — {f.desc}</span>
                  </div>
                </div>
              ))}
            </div>

            <div className="rounded-2xl p-6 text-white" style={{ background: "linear-gradient(135deg, #1E293B, #0F172A)", border: "1px solid rgba(255,255,255,0.08)" }}>
              <p className="font-semibold mb-2">Ready to explore?</p>
              <p className="text-sm text-slate-400 mb-5 leading-relaxed">
                Launch the live demo to explore Control HUB with a fully-populated CarmeTechnology dataset — no account required.
              </p>
              <div className="space-y-2">
                <Button
                  onClick={handleLaunchDemo}
                  disabled={isLoading}
                  className="w-full bg-blue-600 hover:bg-blue-700 text-white border-0 font-semibold"
                >
                  {isLoading ? "Launching…" : "Launch Interactive Demo"}
                  {!isLoading && <ArrowRight className="h-4 w-4 ml-2" />}
                </Button>
                <a
                  href={CONSULTATION_HREF}
                  className="flex items-center justify-center gap-2 w-full h-9 rounded-md text-sm font-medium transition-colors"
                  style={{ color: "#C9A84C", border: "1px solid rgba(201,168,76,0.3)" }}
                >
                  Request Consultation
                  <ExternalLink className="h-3.5 w-3.5" />
                </a>
              </div>
            </div>

            <p className="text-xs text-muted-foreground mt-4 text-center">
              Questions? Email{" "}
              <a href="mailto:info@carmetechnology.com" className="text-primary hover:underline">
                info@carmetechnology.com
              </a>
            </p>
          </div>
        </div>
      </div>

      {/* ── Footer ──────────────────────────────────────────────────────── */}
      <footer style={{ background: "#0F172A", borderTop: "1px solid rgba(255,255,255,0.06)" }} className="py-8 mt-8">
        <div className="max-w-5xl mx-auto px-6 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <div className="h-5 w-5 rounded bg-blue-600 flex items-center justify-center">
              <Shield className="h-3 w-3 text-white" />
            </div>
            <span className="text-sm font-bold text-white">Control HUB</span>
            <span className="text-xs text-slate-600">by</span>
            <span className="text-xs font-semibold" style={{ color: "#C9A84C" }}>CARME TECHNOLOGY</span>
          </div>
          <div className="flex gap-4 text-xs text-slate-600">
            <button onClick={() => navigate("/demo")} className="hover:text-white transition-colors">Demo</button>
            <a href={CONSULTATION_HREF} className="hover:text-white transition-colors">Consultation</a>
            <a href="mailto:info@carmetechnology.com" className="hover:text-white transition-colors">info@carmetechnology.com</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
