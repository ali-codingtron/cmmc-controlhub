import { useState } from "react";
import { useLocation } from "wouter";
import { useOrg } from "@/context/OrgContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import {
  ClipboardCheck,
  ChevronRight,
  ChevronLeft,
  Zap,
  List,
  Target,
  RefreshCw,
  Check,
} from "lucide-react";
import { cn } from "@/lib/utils";

const ASSESSMENT_TYPES = [
  {
    value: "quick_baseline",
    label: "Quick Baseline",
    desc: "Fast current-state assessment based on interview-style questions.",
    icon: Zap,
  },
  {
    value: "full_control",
    label: "Full Control Assessment",
    desc: "Control-by-control assessment across all CMMC L1/L2 requirements.",
    icon: List,
  },
  {
    value: "objective_level",
    label: "Objective-Level Assessment",
    desc: "Detailed review by assessment objective.",
    icon: Target,
  },
  {
    value: "reassessment",
    label: "Reassessment",
    desc: "Re-run an assessment after remediation work.",
    icon: RefreshCw,
  },
];

const SCOPE_QUESTIONS = [
  { key: "cui_boundary_defined", text: "Has the CUI boundary been defined?" },
  { key: "ssp_created", text: "Has the System Security Plan (SSP) been created?" },
  { key: "in_scope_systems_documented", text: "Are in-scope systems documented?" },
  { key: "cui_users_identified", text: "Are users with CUI access identified?" },
  { key: "external_providers_documented", text: "Are external service providers documented?" },
  { key: "cloud_services_documented", text: "Are cloud services documented?" },
  { key: "assets_inventoried", text: "Are assets inventoried?" },
  { key: "data_flows_documented", text: "Are data flows documented?" },
  { key: "policies_procedures_documented", text: "Are policies and procedures documented?" },
];

const SCOPE_ANSWER_OPTIONS = [
  { value: "yes", label: "Yes", cls: "border-green-300 bg-green-50 text-green-700 hover:bg-green-100" },
  { value: "no", label: "No", cls: "border-red-300 bg-red-50 text-red-700 hover:bg-red-100" },
  { value: "partial", label: "Partial", cls: "border-yellow-300 bg-yellow-50 text-yellow-700 hover:bg-yellow-100" },
  { value: "unknown", label: "Unknown", cls: "border-slate-300 bg-slate-50 text-slate-700 hover:bg-slate-100" },
  { value: "not_applicable", label: "N/A", cls: "border-slate-300 bg-slate-100 text-slate-500 hover:bg-slate-200" },
];

const ACTIVE_SCOPE_CLS: Record<string, string> = {
  yes: "border-green-500 bg-green-600 text-white",
  no: "border-red-500 bg-red-600 text-white",
  partial: "border-yellow-500 bg-yellow-500 text-white",
  unknown: "border-slate-500 bg-slate-600 text-white",
  not_applicable: "border-slate-400 bg-slate-400 text-white",
};

type ScopeAnswers = Record<string, string>;

export default function ReadinessNew() {
  const [, navigate] = useLocation();
  const { activeOrg } = useOrg();
  const { toast } = useToast();
  const token = localStorage.getItem("auth_token");

  const [step, setStep] = useState(1);
  const [saving, setSaving] = useState(false);
  const [assessmentId, setAssessmentId] = useState<string | null>(null);

  // Step 1 state
  const [assessmentType, setAssessmentType] = useState("full_control");
  const [name, setName] = useState("");
  const [assessorName, setAssessorName] = useState("");
  const [systemName, setSystemName] = useState("");
  const [assessmentDate, setAssessmentDate] = useState(
    new Date().toISOString().split("T")[0]
  );
  const [targetLevel, setTargetLevel] = useState("L2");

  // Step 2 state
  const [environmentType, setEnvironmentType] = useState("");
  const [primaryTools, setPrimaryTools] = useState("");
  const [cuiStoredProcessed, setCuiStoredProcessed] = useState(false);
  const [usesMicrosoft365, setUsesMicrosoft365] = useState(false);
  const [endpointsManaged, setEndpointsManaged] = useState(false);
  const [mfaEnforced, setMfaEnforced] = useState(false);
  const [policiesExist, setPoliciesExist] = useState(false);
  const [sspExists, setSspExists] = useState(false);
  const [poamExists, setPoamExists] = useState(false);
  const [evidenceExists, setEvidenceExists] = useState(false);

  // Step 3 state
  const [scopeAnswers, setScopeAnswers] = useState<ScopeAnswers>(
    Object.fromEntries(SCOPE_QUESTIONS.map((q) => [q.key, "unknown"]))
  );

  const apiHeaders = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
    "X-Organization-ID": activeOrg?.id ?? "",
  };

  const goStep1To2 = () => {
    if (!name.trim()) {
      toast({ title: "Assessment name is required", variant: "destructive" });
      return;
    }
    if (!assessmentDate) {
      toast({ title: "Assessment date is required", variant: "destructive" });
      return;
    }
    setStep(2);
  };

  const goStep2To3 = async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/readiness/assessments", {
        method: "POST",
        headers: apiHeaders,
        body: JSON.stringify({
          assessmentType,
          name: name.trim(),
          assessorName: assessorName.trim(),
          systemName: systemName.trim(),
          assessmentDate,
          targetLevel,
          environmentType: environmentType.trim(),
          primaryTools: primaryTools.trim(),
          cuiStoredProcessed,
          usesMicrosoft365,
          endpointsManaged,
          mfaEnforced,
          policiesExist,
          sspExists,
          poamExists,
          evidenceExists,
        }),
      });
      if (!res.ok) throw new Error("Failed to create assessment");
      const created = await res.json();
      setAssessmentId(created.id);
      setStep(3);
    } catch {
      toast({ title: "Failed to create assessment", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleFinishScope = async () => {
    if (!assessmentId) return;
    setSaving(true);
    try {
      const answers = Object.entries(scopeAnswers).map(([questionKey, answer]) => ({
        questionKey,
        answer,
      }));
      const res = await fetch(`/api/readiness/assessments/${assessmentId}/scope`, {
        method: "PATCH",
        headers: apiHeaders,
        body: JSON.stringify({ answers }),
      });
      if (!res.ok) throw new Error("Failed to save scope");
      navigate(`/readiness/${assessmentId}/assess`);
    } catch {
      toast({ title: "Failed to save scope answers", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const STEPS = ["Assessment Details", "Environment Setup", "Scope Questions"];

  return (
    <div className="max-w-3xl mx-auto px-6 py-8 space-y-8">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-lg bg-primary/10">
          <ClipboardCheck className="h-6 w-6 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">New Readiness Assessment</h1>
          <p className="text-sm text-muted-foreground">Complete all steps to begin your internal baseline assessment.</p>
        </div>
      </div>

      {/* Step progress */}
      <div className="flex items-center gap-2">
        {STEPS.map((s, i) => (
          <div key={i} className="flex items-center gap-2 flex-1 last:flex-none">
            <div
              className={cn(
                "flex items-center justify-center w-7 h-7 rounded-full text-xs font-bold shrink-0",
                i + 1 < step
                  ? "bg-primary text-primary-foreground"
                  : i + 1 === step
                  ? "bg-primary text-primary-foreground ring-2 ring-primary/30"
                  : "bg-muted text-muted-foreground"
              )}
            >
              {i + 1 < step ? <Check className="h-3.5 w-3.5" /> : i + 1}
            </div>
            <span
              className={cn(
                "text-sm",
                i + 1 === step ? "font-semibold" : "text-muted-foreground"
              )}
            >
              {s}
            </span>
            {i < STEPS.length - 1 && (
              <div className={cn("flex-1 h-px", i + 1 < step ? "bg-primary" : "bg-border")} />
            )}
          </div>
        ))}
      </div>

      {/* Step 1: Assessment Details */}
      {step === 1 && (
        <div className="rounded-xl border bg-card p-6 space-y-6">
          <h2 className="text-lg font-semibold">Assessment Details</h2>

          {/* Type cards */}
          <div>
            <Label className="text-sm font-medium mb-3 block">Assessment Type</Label>
            <div className="grid grid-cols-2 gap-3">
              {ASSESSMENT_TYPES.map((t) => {
                const Icon = t.icon;
                const isSelected = assessmentType === t.value;
                return (
                  <button
                    key={t.value}
                    type="button"
                    onClick={() => setAssessmentType(t.value)}
                    className={cn(
                      "text-left p-4 rounded-lg border-2 transition-all",
                      isSelected
                        ? "border-primary bg-primary/5"
                        : "border-border hover:border-primary/40 hover:bg-muted/30"
                    )}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <Icon className={cn("h-4 w-4", isSelected ? "text-primary" : "text-muted-foreground")} />
                      <span className={cn("text-sm font-medium", isSelected ? "text-primary" : "")}>{t.label}</span>
                    </div>
                    <p className="text-xs text-muted-foreground leading-relaxed">{t.desc}</p>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2 space-y-1.5">
              <Label htmlFor="name">Assessment Name *</Label>
              <Input
                id="name"
                placeholder="e.g. Q2 2026 Internal Baseline — Apex Defense"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="assessorName">Assessor / Reviewer Name</Label>
              <Input
                id="assessorName"
                placeholder="Full name"
                value={assessorName}
                onChange={(e) => setAssessorName(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="assessmentDate">Assessment Date *</Label>
              <Input
                id="assessmentDate"
                type="date"
                value={assessmentDate}
                onChange={(e) => setAssessmentDate(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="systemName">System / Environment Name</Label>
              <Input
                id="systemName"
                placeholder="e.g. Corporate IT, CUI Enclave"
                value={systemName}
                onChange={(e) => setSystemName(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="targetLevel">CMMC Target Level</Label>
              <select
                id="targetLevel"
                value={targetLevel}
                onChange={(e) => setTargetLevel(e.target.value)}
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                <option value="L1">Level 1 (17 practices)</option>
                <option value="L2">Level 2 (110 practices)</option>
              </select>
            </div>
          </div>

          <div className="flex justify-end">
            <Button onClick={goStep1To2}>
              Next: Environment Setup
              <ChevronRight className="h-4 w-4 ml-2" />
            </Button>
          </div>
        </div>
      )}

      {/* Step 2: Environment Setup */}
      {step === 2 && (
        <div className="rounded-xl border bg-card p-6 space-y-6">
          <h2 className="text-lg font-semibold">Environment Setup</h2>
          <p className="text-sm text-muted-foreground">
            Describe the technical environment. This context helps score confidence and calibrate recommendations.
          </p>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="environmentType">Environment Type</Label>
              <Input
                id="environmentType"
                placeholder="e.g. On-premises, Cloud, Hybrid"
                value={environmentType}
                onChange={(e) => setEnvironmentType(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="primaryTools">Primary Tools / Platforms</Label>
              <Input
                id="primaryTools"
                placeholder="e.g. Microsoft 365, Azure AD, CrowdStrike"
                value={primaryTools}
                onChange={(e) => setPrimaryTools(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-3">
            <Label className="text-sm font-medium block">Environment Characteristics</Label>
            <div className="grid grid-cols-2 gap-x-6 gap-y-3">
              {([
                [cuiStoredProcessed, setCuiStoredProcessed, "CUI is stored, processed, or transmitted"],
                [usesMicrosoft365, setUsesMicrosoft365, "Microsoft 365 is used"],
                [endpointsManaged, setEndpointsManaged, "Endpoints are centrally managed"],
                [mfaEnforced, setMfaEnforced, "MFA is enforced for users"],
                [policiesExist, setPoliciesExist, "Policies and procedures exist"],
                [sspExists, setSspExists, "System Security Plan (SSP) exists"],
                [poamExists, setPoamExists, "POA&M exists"],
                [evidenceExists, setEvidenceExists, "Evidence artifacts have been collected"],
              ] as [boolean, (v: boolean) => void, string][]).map(([val, setter, label]) => (
                <label key={label} className="flex items-center gap-2.5 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={val}
                    onChange={(e) => setter(e.target.checked)}
                    className="h-4 w-4 rounded border-input accent-primary"
                  />
                  <span className="text-sm">{label}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="flex justify-between">
            <Button variant="outline" onClick={() => setStep(1)}>
              <ChevronLeft className="h-4 w-4 mr-2" />
              Back
            </Button>
            <Button onClick={goStep2To3} disabled={saving}>
              {saving ? "Creating…" : "Next: Scope Questions"}
              <ChevronRight className="h-4 w-4 ml-2" />
            </Button>
          </div>
        </div>
      )}

      {/* Step 3: Scope Questions */}
      {step === 3 && (
        <div className="rounded-xl border bg-card p-6 space-y-6">
          <div>
            <h2 className="text-lg font-semibold">Scope Readiness Questions</h2>
            <p className="text-sm text-muted-foreground mt-1">
              Answer each scoping question to establish the baseline readiness of this assessment.
            </p>
          </div>

          <div className="space-y-4">
            {SCOPE_QUESTIONS.map((q, idx) => (
              <div key={q.key} className="rounded-lg border bg-muted/20 p-4 space-y-3">
                <p className="text-sm font-medium">
                  <span className="text-muted-foreground mr-2">{idx + 1}.</span>
                  {q.text}
                </p>
                <div className="flex flex-wrap gap-2">
                  {SCOPE_ANSWER_OPTIONS.map((opt) => {
                    const isSelected = scopeAnswers[q.key] === opt.value;
                    return (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() =>
                          setScopeAnswers((prev) => ({ ...prev, [q.key]: opt.value }))
                        }
                        className={cn(
                          "px-3 py-1 rounded-full text-xs font-medium border transition-all",
                          isSelected ? ACTIVE_SCOPE_CLS[opt.value] : opt.cls
                        )}
                      >
                        {opt.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>

          <div className="flex justify-between">
            <Button variant="outline" onClick={() => setStep(2)}>
              <ChevronLeft className="h-4 w-4 mr-2" />
              Back
            </Button>
            <Button onClick={handleFinishScope} disabled={saving}>
              {saving ? "Saving…" : "Start Control Assessment"}
              <ChevronRight className="h-4 w-4 ml-2" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
