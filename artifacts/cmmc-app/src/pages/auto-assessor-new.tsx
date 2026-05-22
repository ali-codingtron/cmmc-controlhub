import { useState } from "react";
import { useLocation } from "wouter";
import {
  Bot,
  ChevronRight,
  ChevronLeft,
  Loader2,
  CheckCircle2,
  ArrowRight,
} from "lucide-react";
import { useOrg } from "@/context/OrgContext";

const INTAKE_QUESTIONS = [
  { key: "ssp_uploaded", text: "Is a System Security Plan (SSP) uploaded?" },
  { key: "scope_defined", text: "Is the assessment scope and system boundary defined?" },
  { key: "assets_documented", text: "Are in-scope assets (hardware, software, services) documented?" },
  { key: "cui_defined", text: "Is CUI being stored, processed, or transmitted identified?" },
  { key: "users_documented", text: "Are users and privileged users documented?" },
  { key: "policies_uploaded", text: "Are security policies uploaded and current?" },
  { key: "procedures_uploaded", text: "Are security procedures uploaded and current?" },
  { key: "evidence_uploaded", text: "Has compliance evidence (screenshots, exports, reports) been uploaded?" },
  { key: "poam_available", text: "Is a Plan of Action and Milestones (POA&M) available?" },
  { key: "monitoring_active", text: "Is the operational monitoring tracker active and up to date?" },
  { key: "endpoints_managed", text: "Are endpoints centrally managed (MDM / Intune / GPO)?" },
  { key: "mfa_enforced", text: "Is MFA enforced for all users including privileged accounts?" },
  { key: "audit_logs_reviewed", text: "Are audit logs regularly reviewed?" },
  { key: "vulnerabilities_reviewed", text: "Are vulnerability scans performed and results reviewed?" },
  { key: "backups_tested", text: "Are backups performed and restore procedures tested?" },
  { key: "ir_tested", text: "Has incident response been tested (tabletop or exercise)?" },
] as const;

type Answer = "yes" | "no" | "partial" | "unknown" | "not_applicable";

const ANSWER_OPTIONS: { value: Answer; label: string; color: string }[] = [
  { value: "yes", label: "Yes", color: "bg-green-100 text-green-700 border-green-300 ring-green-400" },
  { value: "partial", label: "Partial", color: "bg-yellow-100 text-yellow-700 border-yellow-300 ring-yellow-400" },
  { value: "no", label: "No", color: "bg-red-100 text-red-700 border-red-300 ring-red-400" },
  { value: "unknown", label: "Unknown", color: "bg-gray-100 text-gray-600 border-gray-300 ring-gray-400" },
  { value: "not_applicable", label: "N/A", color: "bg-slate-100 text-slate-500 border-slate-300 ring-slate-400" },
];

export default function AutoAssessorNew() {
  const [, navigate] = useLocation();
  const { activeOrg } = useOrg();

  const [step, setStep] = useState<1 | 2>(1);
  const [name, setName] = useState("");
  const [notes, setNotes] = useState("");
  const [answers, setAnswers] = useState<Record<string, Answer>>({});
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function setAnswer(key: string, value: Answer) {
    setAnswers((prev) => ({ ...prev, [key]: value }));
  }

  function answeredCount() {
    return INTAKE_QUESTIONS.filter((q) => answers[q.key] && answers[q.key] !== "unknown").length;
  }

  async function runAssessment() {
    if (!activeOrg) return;
    setSubmitting(true);
    setError(null);
    try {
      const token = localStorage.getItem("auth_token");
      const res = await fetch("/api/auto-assessor/assessments", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
          "X-Organization-ID": activeOrg.id,
        },
        body: JSON.stringify({
          name: name.trim() || `Baseline Assessment — ${new Date().toLocaleDateString()}`,
          notes: notes.trim() || undefined,
          intakeAnswers: answers,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "Failed to run assessment");
      }
      const data = await res.json();
      navigate(`/auto-assessor/${data.id}/results`);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Unexpected error");
      setSubmitting(false);
    }
  }

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-indigo-600 text-white">
          <Bot className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Run Automated Baseline Assessment</h1>
          <p className="text-sm text-gray-500">
            The system will scan existing evidence, documents, SSP, monitoring, and POA&M data
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2 text-sm">
        <div
          className={`flex items-center gap-1.5 font-medium ${step === 1 ? "text-indigo-700" : "text-gray-400"}`}
        >
          <span className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold ${step === 1 ? "bg-indigo-600 text-white" : step === 2 ? "bg-green-100 text-green-700" : "bg-gray-200 text-gray-500"}`}>
            {step > 1 ? <CheckCircle2 className="h-4 w-4" /> : "1"}
          </span>
          Setup
        </div>
        <ChevronRight className="h-4 w-4 text-gray-300" />
        <div
          className={`flex items-center gap-1.5 font-medium ${step === 2 ? "text-indigo-700" : "text-gray-400"}`}
        >
          <span className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold ${step === 2 ? "bg-indigo-600 text-white" : "bg-gray-200 text-gray-500"}`}>
            2
          </span>
          Intake Questions
        </div>
      </div>

      {step === 1 && (
        <div className="rounded-xl border border-gray-200 bg-white p-6 space-y-5">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Assessment Name
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={`Baseline Assessment — ${new Date().toLocaleDateString()}`}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Notes <span className="text-gray-400">(optional)</span>
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              placeholder="e.g., Initial assessment before Q2 audit, post-remediation check…"
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
          </div>
          <div className="rounded-lg border border-indigo-100 bg-indigo-50 p-4 text-sm text-indigo-800">
            <p className="font-medium mb-1">What happens when you run an assessment:</p>
            <ul className="space-y-1 list-disc list-inside text-indigo-700">
              <li>All 110 CMMC Level 2 controls are evaluated automatically</li>
              <li>Existing evidence, documents, SSP narratives, monitoring status, and POA&Ms are checked</li>
              <li>A projected readiness score and per-control findings are generated</li>
              <li>Evidence requests are created for identified gaps</li>
            </ul>
          </div>
          <div className="flex justify-end">
            <button
              onClick={() => setStep(2)}
              className="inline-flex items-center gap-2 rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
            >
              Next: Intake Questions <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {step === 2 && (
        <div className="space-y-4">
          <div className="rounded-xl border border-gray-200 bg-white p-5">
            <div className="flex items-center justify-between mb-1">
              <p className="text-sm font-medium text-gray-700">
                Organization-Level Intake Questions
              </p>
              <span className="text-xs text-gray-500">
                {answeredCount()} / {INTAKE_QUESTIONS.length} answered
              </span>
            </div>
            <p className="text-xs text-gray-500 mb-4">
              Answer these high-level questions to boost confidence scoring. Skipping is fine — the
              engine will still scan all existing data.
            </p>

            <div className="space-y-4">
              {INTAKE_QUESTIONS.map((q, idx) => (
                <div key={q.key} className="flex flex-col gap-2">
                  <p className="text-sm text-gray-800">
                    <span className="text-gray-400 mr-2">{idx + 1}.</span>
                    {q.text}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {ANSWER_OPTIONS.map((opt) => {
                      const selected = answers[q.key] === opt.value;
                      return (
                        <button
                          key={opt.value}
                          onClick={() => setAnswer(q.key, opt.value)}
                          className={`rounded-md border px-3 py-1 text-xs font-medium transition-all ${opt.color} ${selected ? "ring-2 ring-offset-1 font-semibold" : "opacity-60 hover:opacity-100"}`}
                        >
                          {opt.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {error && (
            <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              {error}
            </div>
          )}

          <div className="flex items-center justify-between">
            <button
              onClick={() => setStep(1)}
              className="inline-flex items-center gap-1.5 rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              disabled={submitting}
            >
              <ChevronLeft className="h-4 w-4" /> Back
            </button>
            <button
              onClick={runAssessment}
              disabled={submitting}
              className="inline-flex items-center gap-2 rounded-md bg-indigo-600 px-5 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-60"
            >
              {submitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" /> Running Assessment…
                </>
              ) : (
                <>
                  <ArrowRight className="h-4 w-4" /> Run Automated Assessment
                </>
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
