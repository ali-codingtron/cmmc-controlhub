import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Shield, ArrowLeft, Play, Clock, CheckCircle, ArrowRight } from "lucide-react";

const SCRIPT_SECTIONS = [
  {
    label: "A",
    title: "Opening",
    duration: "0:00 – 0:30",
    script: "Control HUB is a CMMC readiness and evidence management platform built to help organizations understand where they stand, organize evidence, track recurring monitoring, and prepare for C3PAO review.",
  },
  {
    label: "B",
    title: "Dashboard",
    duration: "0:30 – 1:00",
    script: "Show the executive dashboard — readiness score KPI, evidence health, monitoring health, POA&M summary, domain readiness bars, and recommended next actions.",
  },
  {
    label: "C",
    title: "Pre-Assessment",
    duration: "1:00 – 1:45",
    script: "Show the Microsoft tenant scan — connected Entra ID/Intune/Defender, scan results with 94 checks, 12 findings with severity, auto-generated evidence records, and evidence requests.",
  },
  {
    label: "D",
    title: "Controls",
    duration: "1:45 – 2:15",
    script: "Open a control and show the implementation narrative, configure steps, linked evidence records, monitoring items, SSP section, and POA&M linkage.",
  },
  {
    label: "E",
    title: "Evidence",
    duration: "2:15 – 2:45",
    script: "Show the evidence repository — filtering, status badges, file preview, metadata, linked controls, and the review/approve workflow.",
  },
  {
    label: "F",
    title: "Monitoring Tracker",
    duration: "2:45 – 3:10",
    script: "Show the 19-row monitoring tracker — overdue items highlighted, frequency badges, inline edit, last completed and next due dates.",
  },
  {
    label: "G",
    title: "POA&M",
    duration: "3:10 – 3:30",
    script: "Show the remediation tracker — risk levels, status, scheduled completion dates, and linked controls.",
  },
  {
    label: "H",
    title: "Reports",
    duration: "3:30 – 4:00",
    script: "Show the downloadable PDF reports — executive summary and technical detail. Click download to show the generated PDF.",
  },
  {
    label: "I",
    title: "Closing",
    duration: "4:00 – 4:30",
    script: "Control HUB gives teams one place to manage CMMC readiness — from assessment through remediation and ongoing compliance operations. Request a consultation to get started.",
  },
];

export default function DemoVideo() {
  const [, navigate] = useLocation();

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Nav */}
      <header className="sticky top-0 z-50 border-b bg-background/95 backdrop-blur">
        <div className="max-w-5xl mx-auto px-6 h-14 flex items-center justify-between">
          <button
            onClick={() => navigate("/demo")}
            className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to demo landing
          </button>
          <div className="flex items-center gap-2">
            <div className="h-6 w-6 rounded-md bg-primary flex items-center justify-center">
              <Shield className="h-3.5 w-3.5 text-primary-foreground" />
            </div>
            <span className="font-bold text-sm">Control HUB</span>
          </div>
        </div>
      </header>

      <div className="max-w-5xl mx-auto px-6 py-12">
        {/* Header */}
        <div className="text-center mb-12">
          <Badge variant="secondary" className="mb-4">Demo Walkthrough</Badge>
          <h1 className="text-3xl md:text-4xl font-bold mb-4">Control HUB Demo Walkthrough</h1>
          <div className="flex items-center justify-center gap-4 text-sm text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <Clock className="h-4 w-4" />
              3–5 minutes
            </span>
            <span>•</span>
            <span>9 sections</span>
          </div>
        </div>

        {/* Video placeholder */}
        <div className="rounded-xl border-2 border-dashed border-muted-foreground/30 bg-muted/20 aspect-video flex items-center justify-center mb-12">
          <div className="text-center">
            <div className="inline-flex p-5 rounded-full bg-muted mb-4">
              <Play className="h-8 w-8 text-muted-foreground" />
            </div>
            <p className="font-semibold text-muted-foreground">Demo video coming soon</p>
            <p className="text-sm text-muted-foreground mt-1">Recording in progress. Launch the live demo below.</p>
          </div>
        </div>

        <div className="grid md:grid-cols-2 gap-8">
          {/* Script */}
          <div>
            <h2 className="font-bold text-lg mb-4">Demo Script</h2>
            <div className="space-y-3">
              {SCRIPT_SECTIONS.map((s) => (
                <Card key={s.label} className="overflow-hidden">
                  <CardHeader className="py-2.5 px-4 bg-muted/30 flex-row items-center gap-3 space-y-0">
                    <div className="h-6 w-6 rounded-full bg-primary text-primary-foreground text-xs font-bold flex items-center justify-center shrink-0">
                      {s.label}
                    </div>
                    <div className="flex-1 min-w-0">
                      <CardTitle className="text-sm">{s.title}</CardTitle>
                    </div>
                    <span className="text-xs text-muted-foreground font-mono shrink-0">{s.duration}</span>
                  </CardHeader>
                  <CardContent className="py-2.5 px-4">
                    <p className="text-xs text-muted-foreground leading-relaxed">{s.script}</p>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>

          {/* Feature highlights */}
          <div>
            <h2 className="font-bold text-lg mb-4">Product Feature Highlights</h2>
            <div className="space-y-3">
              {[
                { title: "Automated Tenant Scanning", desc: "Connect Microsoft 365 and scan Entra ID, Intune, and Defender in minutes." },
                { title: "110 CMMC L2 Controls", desc: "All controls pre-loaded with guidance, configure steps, and evidence requirements." },
                { title: "Evidence Workflow", desc: "Upload, classify, review, and approve evidence through a structured workflow." },
                { title: "19 Monitoring Tasks", desc: "Daily through annual operational compliance tasks pre-loaded with CMMC guidance." },
                { title: "POA&M Remediation", desc: "Track every gap with risk ratings, owners, and scheduled completion dates." },
                { title: "SSP Generation", desc: "Auto-assembled SSP that stays current as you update control narratives." },
                { title: "PDF Reports", desc: "Executive and technical reports exportable on demand for any stakeholder." },
                { title: "Multi-Tenant MSP", desc: "Manage multiple client orgs with full data isolation and org switcher." },
              ].map((f) => (
                <div key={f.title} className="flex gap-3 text-sm">
                  <CheckCircle className="h-4 w-4 text-emerald-500 mt-0.5 shrink-0" />
                  <div>
                    <span className="font-medium">{f.title}</span>
                    <span className="text-muted-foreground"> — {f.desc}</span>
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-8 p-5 rounded-xl bg-primary/5 border border-primary/20">
              <p className="text-sm font-semibold mb-3">Ready to explore?</p>
              <p className="text-xs text-muted-foreground mb-4">
                Launch the live demo to explore Control HUB with a fully-populated dataset — no account required.
              </p>
              <Button size="sm" onClick={() => navigate("/demo")} className="w-full">
                Launch Live Demo
                <ArrowRight className="h-3.5 w-3.5 ml-1.5" />
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
