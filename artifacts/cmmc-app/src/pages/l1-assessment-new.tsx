/**
 * New L1 Annual Self-Assessment Wizard
 * 3-step: Year/Title → Affirming Official → Confirm & Create
 */
import { useState } from "react";
import { useLocation } from "wouter";
import {
  Shield, ChevronLeft, ChevronRight, Loader2, Check, AlertTriangle,
  Calendar, User, Building2,
} from "lucide-react";
import { useOrg } from "@/context/OrgContext";
import { useCreateL1Assessment, useGetL1History, useUpdateL1Assessment } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { cn } from "@/lib/utils";

const STEPS = ["Assessment Setup", "Affirming Official", "Review & Create"] as const;
type Step = 0 | 1 | 2;

export default function L1AssessmentNew() {
  const [, navigate] = useLocation();
  const { activeOrg } = useOrg();
  const orgId = activeOrg?.id ?? "";
  const qc = useQueryClient();

  const [step, setStep] = useState<Step>(0);
  const [form, setForm] = useState({
    assessmentYear: new Date().getFullYear(),
    title: `CMMC Level 1 Annual Self-Assessment — ${new Date().getFullYear()}`,
    scopeName: "Default",
    description: "",
    affirmingOfficialName: "",
    affirmingOfficialTitle: "",
  });
  const [error, setError] = useState<string | null>(null);

  const { data: historyData } = useGetL1History(orgId);
  const priorAssessments = historyData?.assessments ?? [];

  const createMutation = useCreateL1Assessment(orgId);
  // updatedAssessmentId is set after creation so the update mutation uses the real ID
  const [createdId, setCreatedId] = useState<string | null>(null);
  const updateMutation = useUpdateL1Assessment(createdId ?? "__none__", orgId);

  function setField(field: keyof typeof form, value: string | number) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  function canNext() {
    if (step === 0) return form.title.trim().length > 0 && form.assessmentYear > 2000;
    if (step === 1) return form.affirmingOfficialName.trim().length > 0 && form.affirmingOfficialTitle.trim().length > 0;
    return true;
  }

  async function handleCreate() {
    setError(null);
    try {
      // Step 1: create the assessment (create endpoint does not accept affirming official)
      const result = await createMutation.mutateAsync({
        assessmentYear: form.assessmentYear,
        title: form.title,
        scopeName: form.scopeName || "Default",
        description: form.description || undefined,
      });
      const assessmentId = result.assessment.id;
      setCreatedId(assessmentId);

      // Step 2: persist the affirming official via PATCH (create endpoint does not accept it)
      if (form.affirmingOfficialName.trim() || form.affirmingOfficialTitle.trim()) {
        const token = localStorage.getItem("auth_token");
        const headers: Record<string, string> = { "Content-Type": "application/json" };
        if (token) headers["Authorization"] = `Bearer ${token}`;
        if (orgId) headers["X-Organization-ID"] = orgId;
        const patchRes = await fetch(`/api/l1-assessment/${assessmentId}`, {
          method: "PATCH",
          headers,
          body: JSON.stringify({
            affirmingOfficialName: form.affirmingOfficialName || undefined,
            affirmingOfficialTitle: form.affirmingOfficialTitle || undefined,
          }),
        });
        if (!patchRes.ok) {
          const body = await patchRes.json().catch(() => ({}));
          throw new Error((body as any).error ?? `Failed to save affirming official (HTTP ${patchRes.status})`);
        }
      }

      qc.invalidateQueries({ queryKey: ["l1-assessment"] });
      qc.invalidateQueries({ queryKey: ["l1-assessment-history"] });
      navigate(`/l1-assessment/${assessmentId}`);
    } catch (err: any) {
      if (err.message?.includes("already exists")) {
        setError(`An assessment for ${form.assessmentYear} / ${form.scopeName} already exists. Go to History to view it.`);
      } else {
        setError(err.message ?? "Failed to create assessment");
      }
    }
  }

  const yearHasPrior = priorAssessments.some(
    (a) => a.assessmentYear === form.assessmentYear - 1
  );

  return (
    <div className="max-w-2xl mx-auto space-y-6 pb-12">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => (step === 0 ? navigate("/l1-assessment") : setStep((s) => (s - 1) as Step))}
          className="p-2 rounded-md hover:bg-accent transition-colors"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-lg bg-blue-600 text-white flex items-center justify-center shrink-0">
            <Shield className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-xl font-semibold">New Annual Self-Assessment</h1>
            <p className="text-sm text-muted-foreground">CMMC Level 1 — FAR 52.204-21</p>
          </div>
        </div>
      </div>

      {/* Step indicators */}
      <div className="flex items-center gap-0">
        {STEPS.map((label, i) => (
          <div key={label} className="flex items-center flex-1">
            <div className={cn(
              "flex items-center gap-2 text-xs font-medium",
              i < step ? "text-emerald-600" : i === step ? "text-foreground" : "text-muted-foreground"
            )}>
              <div className={cn(
                "h-6 w-6 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0",
                i < step ? "bg-emerald-500 text-white" : i === step ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
              )}>
                {i < step ? <Check className="h-3 w-3" /> : i + 1}
              </div>
              <span className="hidden sm:inline">{label}</span>
            </div>
            {i < STEPS.length - 1 && (
              <div className={cn("flex-1 h-px mx-2", i < step ? "bg-emerald-300" : "bg-border")} />
            )}
          </div>
        ))}
      </div>

      {/* Step content */}
      <div className="rounded-xl border border-border bg-card p-6 space-y-5">

        {/* Step 0: Assessment Setup */}
        {step === 0 && (
          <>
            <h2 className="font-semibold text-base flex items-center gap-2">
              <Calendar className="h-4 w-4 text-muted-foreground" />
              Assessment Setup
            </h2>

            {yearHasPrior && (
              <div className="rounded-lg bg-blue-50 border border-blue-200 px-4 py-3 text-sm text-blue-800">
                <strong>Prior year found:</strong> Narratives and evidence links from {form.assessmentYear - 1} will be imported as proposals for your review.
              </div>
            )}

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1.5">Assessment Year</label>
                <input
                  type="number"
                  min={2020}
                  max={2040}
                  value={form.assessmentYear}
                  onChange={(e) => {
                    const y = parseInt(e.target.value) || new Date().getFullYear();
                    setField("assessmentYear", y);
                    setField("title", `CMMC Level 1 Annual Self-Assessment — ${y}`);
                  }}
                  className="w-full rounded-md border border-input px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1.5">Assessment Title <span className="text-red-500">*</span></label>
                <input
                  type="text"
                  value={form.title}
                  onChange={(e) => setField("title", e.target.value)}
                  placeholder="e.g. CMMC Level 1 Annual Self-Assessment — 2025"
                  className="w-full rounded-md border border-input px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1.5">Scope Name</label>
                <input
                  type="text"
                  value={form.scopeName}
                  onChange={(e) => setField("scopeName", e.target.value)}
                  placeholder="Default"
                  className="w-full rounded-md border border-input px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                />
                <p className="text-xs text-muted-foreground mt-1">Use a descriptive scope name to distinguish assessments for different business units or enclaves.</p>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1.5">Description (optional)</label>
                <textarea
                  value={form.description}
                  onChange={(e) => setField("description", e.target.value)}
                  rows={3}
                  placeholder="Brief description of this assessment cycle..."
                  className="w-full rounded-md border border-input px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-none"
                />
              </div>
            </div>
          </>
        )}

        {/* Step 1: Affirming Official */}
        {step === 1 && (
          <>
            <h2 className="font-semibold text-base flex items-center gap-2">
              <User className="h-4 w-4 text-muted-foreground" />
              Affirming Official
            </h2>
            <p className="text-sm text-muted-foreground">
              The affirming official will digitally sign the annual affirmation. This is typically a senior official or authorized representative of the organization.
            </p>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1.5">Affirming Official Name <span className="text-red-500">*</span></label>
                <input
                  type="text"
                  value={form.affirmingOfficialName}
                  onChange={(e) => setField("affirmingOfficialName", e.target.value)}
                  placeholder="Full name"
                  className="w-full rounded-md border border-input px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1.5">Affirming Official Title <span className="text-red-500">*</span></label>
                <input
                  type="text"
                  value={form.affirmingOfficialTitle}
                  onChange={(e) => setField("affirmingOfficialTitle", e.target.value)}
                  placeholder="e.g. President, CTO, Information Security Officer"
                  className="w-full rounded-md border border-input px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
            </div>
          </>
        )}

        {/* Step 2: Review */}
        {step === 2 && (
          <>
            <h2 className="font-semibold text-base flex items-center gap-2">
              <Building2 className="h-4 w-4 text-muted-foreground" />
              Review & Create
            </h2>
            <div className="space-y-3">
              {[
                { label: "Organization", value: activeOrg?.name ?? "—" },
                { label: "Assessment Year", value: String(form.assessmentYear) },
                { label: "Title", value: form.title },
                { label: "Scope Name", value: form.scopeName },
                { label: "Affirming Official", value: form.affirmingOfficialName },
                { label: "Official Title", value: form.affirmingOfficialTitle },
                ...(form.description ? [{ label: "Description", value: form.description }] : []),
              ].map(({ label, value }) => (
                <div key={label} className="flex justify-between text-sm gap-4">
                  <span className="text-muted-foreground shrink-0">{label}</span>
                  <span className="font-medium text-right">{value}</span>
                </div>
              ))}
            </div>
            <div className="rounded-lg bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-800">
              Creating this assessment will set up 17 CMMC Level 1 requirement rows and {yearHasPrior ? "import prior-year narratives as proposals" : "start with blank fields"}. You can begin assessor review immediately after creation.
            </div>

            {error && (
              <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700 flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                {error}
              </div>
            )}
          </>
        )}
      </div>

      {/* Navigation buttons */}
      <div className="flex justify-between gap-3">
        <button
          onClick={() => (step === 0 ? navigate("/l1-assessment") : setStep((s) => (s - 1) as Step))}
          className="inline-flex items-center gap-2 px-4 py-2 text-sm rounded-md border border-border hover:bg-accent transition-colors"
        >
          <ChevronLeft className="h-4 w-4" />
          {step === 0 ? "Cancel" : "Back"}
        </button>

        {step < 2 ? (
          <button
            onClick={() => setStep((s) => (s + 1) as Step)}
            disabled={!canNext()}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
          >
            Next
            <ChevronRight className="h-4 w-4" />
          </button>
        ) : (
          <button
            onClick={handleCreate}
            disabled={createMutation.isPending}
            className="inline-flex items-center gap-2 px-6 py-2 text-sm rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
          >
            {createMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Shield className="h-4 w-4" />}
            {createMutation.isPending ? "Creating…" : "Create Assessment"}
          </button>
        )}
      </div>
    </div>
  );
}
