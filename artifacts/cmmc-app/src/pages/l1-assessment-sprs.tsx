/**
 * L1 Annual Self-Assessment — SPRS & Affirmation Page
 *
 * Two sections:
 * (a) SPRS section: worksheet preview, mark-entered-in-SPRS form
 * (b) Affirmation section: affirming official form, submit affirmation
 */
import { useState } from "react";
import { Link } from "wouter";
import {
  ChevronLeft, FileCheck, Download, CheckCircle2, XCircle, CircleDot,
  Loader2, AlertTriangle, Lock, Shield, Pen, Info, FileText,
} from "lucide-react";
import { useOrg } from "@/context/OrgContext";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetL1AssessmentDetail,
  useGetL1SprsWorksheet,
  useMarkL1EnteredSprs,
  useAffirmL1Assessment,
  useFinalizeL1Assessment,
} from "@workspace/api-client-react";
import { cn } from "@/lib/utils";
import type { L1FindingValue } from "@workspace/api-client-react";

function findingLabel(f: L1FindingValue): string {
  switch (f) {
    case "met": return "MET";
    case "not_met": return "NOT MET";
    case "not_applicable": return "N/A";
    default: return "NOT REVIEWED";
  }
}

function findingColor(f: L1FindingValue): string {
  switch (f) {
    case "met": return "text-emerald-700 bg-emerald-50 border-emerald-200";
    case "not_met": return "text-red-700 bg-red-50 border-red-200";
    case "not_applicable": return "text-slate-600 bg-slate-50 border-slate-200";
    default: return "text-gray-500 bg-gray-50 border-gray-200";
  }
}

// ── Download helper ────────────────────────────────────────────────────────

async function downloadL1Report(
  assessmentId: string,
  reportType: string,
  orgId: string,
  filename: string
): Promise<void> {
  const token = localStorage.getItem("auth_token");
  const res = await fetch(`/api/l1-assessment/${assessmentId}/reports/${reportType}`, {
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      "X-Organization-ID": orgId,
    },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as any).error ?? `HTTP ${res.status}`);
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export default function L1AssessmentSprs({ id }: { id: string }) {
  const { activeOrg } = useOrg();
  const orgId = activeOrg?.id ?? "";
  const qc = useQueryClient();

  const [downloadingReport, setDownloadingReport] = useState<string | null>(null);

  const [sprsForm, setSprsForm] = useState({
    submittedBy: "",
    entryDate: new Date().toISOString().slice(0, 10),
    reference: "",
    evidence: "",
  });
  const [affirmForm, setAffirmForm] = useState({
    officialName: "",
    officialTitle: "",
    officialEmail: "",
    affirmationDate: new Date().toISOString().slice(0, 10),
    cmmcUid: "",
    confirmText: "",
  });
  const [sprsError, setSprsError] = useState<string | null>(null);
  const [affirmError, setAffirmError] = useState<string | null>(null);
  const [finalizeError, setFinalizeError] = useState<string | null>(null);
  const [showFinalizeDialog, setShowFinalizeDialog] = useState(false);

  const { data, isLoading, refetch } = useGetL1AssessmentDetail(id, orgId);
  const { data: worksheetData } = useGetL1SprsWorksheet(id, orgId);

  const markSprs = useMarkL1EnteredSprs(id, orgId);
  const affirmMutation = useAffirmL1Assessment(id, orgId);
  const finalizeMutation = useFinalizeL1Assessment(id, orgId);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-32 text-muted-foreground">
        <Loader2 className="h-6 w-6 animate-spin mr-2" />Loading…
      </div>
    );
  }

  if (!data) return <div className="p-6 text-muted-foreground">Assessment not found.</div>;

  const { assessment, requirements } = data;
  const worksheet = worksheetData?.worksheet;
  const wf = assessment.workflowState;
  const isReadOnly = assessment.isReadOnly;

  const metaRaw = assessment.snapshotMetadata;
  const meta = (() => { try { return metaRaw ? JSON.parse(metaRaw) : {}; } catch { return {}; } })();

  const canEnterSprs = wf === "READY_FOR_SPRS" && !isReadOnly;
  // Affirmation is only available once SPRS entry has been recorded (PENDING_AFFIRMATION state)
  const canAffirm = wf === "PENDING_AFFIRMATION" && !isReadOnly && assessment.status !== "locked";
  const sprsEntered = ["PENDING_AFFIRMATION", "FINAL_LEVEL_1_SELF"].includes(wf ?? "") || !!meta.sprsEnteredAt;
  const isAffirmed = assessment.status === "affirmed" || wf === "FINAL_LEVEL_1_SELF";

  const CONFIRMATION_TEXT = "I affirm that this Level 1 Annual Self-Assessment accurately represents the current security posture of the organization and that the information provided is complete and accurate to the best of my knowledge.";

  async function submitSprs() {
    setSprsError(null);
    if (!sprsForm.submittedBy.trim() || !sprsForm.entryDate || !sprsForm.reference.trim()) {
      setSprsError("Submitted by, entry date, and reference number are all required.");
      return;
    }
    try {
      await markSprs.mutateAsync({
        submittedBy: sprsForm.submittedBy,
        entryDate: sprsForm.entryDate,
        reference: sprsForm.reference,
        evidence: sprsForm.evidence || undefined,
      });
      qc.invalidateQueries({ queryKey: ["l1-assessment-detail", id] });
      qc.invalidateQueries({ queryKey: ["l1-assessment-sprs-worksheet", id] });
      await refetch();
    } catch (err: any) {
      setSprsError(err.message ?? "Failed to mark SPRS entry");
    }
  }

  async function submitAffirmation() {
    setAffirmError(null);
    if (!affirmForm.officialName.trim() || !affirmForm.officialTitle.trim() || !affirmForm.affirmationDate) {
      setAffirmError("Official name, title, and affirmation date are required.");
      return;
    }
    if (affirmForm.confirmText.trim() !== CONFIRMATION_TEXT) {
      setAffirmError("The confirmation text does not match. Please type it exactly as shown.");
      return;
    }
    try {
      await affirmMutation.mutateAsync({
        officialName: affirmForm.officialName,
        officialTitle: affirmForm.officialTitle,
        officialEmail: affirmForm.officialEmail || undefined,
        affirmationDate: affirmForm.affirmationDate,
        cmmcUid: affirmForm.cmmcUid || undefined,
      });
      qc.invalidateQueries({ queryKey: ["l1-assessment-detail", id] });
      qc.invalidateQueries({ queryKey: ["l1-assessment", orgId] });
      await refetch();
    } catch (err: any) {
      setAffirmError(err.message ?? "Failed to submit affirmation");
    }
  }

  async function handleFinalize() {
    setFinalizeError(null);
    try {
      await finalizeMutation.mutateAsync();
      qc.invalidateQueries({ queryKey: ["l1-assessment-detail", id] });
      setShowFinalizeDialog(false);
      await refetch();
    } catch (err: any) {
      setFinalizeError(err.message ?? "Failed to finalize");
    }
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3 pb-4 border-b border-border">
        <Link href={`/l1-assessment/${id}`} className="p-2 rounded-md hover:bg-accent transition-colors">
          <ChevronLeft className="h-5 w-5" />
        </Link>
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-lg bg-emerald-600 text-white flex items-center justify-center shrink-0">
            <FileCheck className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-lg font-semibold">SPRS & Affirmation</h1>
            <p className="text-sm text-muted-foreground">{assessment.title} · {assessment.assessmentYear}</p>
          </div>
        </div>
        {isReadOnly && <Lock className="h-4 w-4 text-muted-foreground ml-2" />}
        {/* Download Reports panel */}
        <div className="ml-auto flex items-center gap-1.5 flex-wrap">
          {[
            { type: "main-report",       label: "Full Report",     ext: "pdf", always: true },
            { type: "workpaper",         label: "Workpaper",       ext: "xlsx", always: true },
            { type: "far-crosswalk",     label: "FAR Crosswalk",   ext: "xlsx", always: true },
            { type: "affirmation-record",label: "Affirmation Rec.",ext: "pdf", onlyAffirmed: true },
          ].filter(r => r.always || (r.onlyAffirmed && isAffirmed)).map((r) => (
            <button
              key={r.type}
              onClick={async () => {
                setDownloadingReport(r.type);
                try {
                  await downloadL1Report(id, r.type, orgId,
                    `L1_${r.type.replace(/-/g, "_")}_${assessment.assessmentYear}.${r.ext}`);
                } catch (err: any) {
                  alert(err.message ?? "Download failed");
                } finally {
                  setDownloadingReport(null);
                }
              }}
              disabled={downloadingReport === r.type}
              title={`Download ${r.label}`}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded-md border border-border hover:bg-accent transition-colors disabled:opacity-50"
            >
              {downloadingReport === r.type
                ? <Loader2 className="h-3 w-3 animate-spin" />
                : <FileText className="h-3 w-3" />}
              <span className="hidden sm:inline">{r.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Workflow status banner */}
      {wf && (
        <div className={cn("flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm border",
          wf === "READY_FOR_SPRS" ? "bg-blue-50 border-blue-200 text-blue-800" :
          wf === "PENDING_AFFIRMATION" ? "bg-indigo-50 border-indigo-200 text-indigo-800" :
          wf === "FINAL_LEVEL_1_SELF" || isAffirmed ? "bg-emerald-50 border-emerald-200 text-emerald-800" :
          "bg-muted border-border text-muted-foreground"
        )}>
          {isAffirmed ? <CheckCircle2 className="h-4 w-4 shrink-0" /> : <Info className="h-4 w-4 shrink-0" />}
          <span>
            {wf === "READY_FOR_SPRS" ? "Assessment approved by management. Please enter the results in SPRS and record the submission details below." :
             wf === "PENDING_AFFIRMATION" ? "SPRS entry recorded. Complete the annual affirmation to finalize the assessment." :
             (wf === "FINAL_LEVEL_1_SELF" || isAffirmed) ? "Assessment has been affirmed. All sections are now read-only." :
             `Current state: ${wf}`}
          </span>
        </div>
      )}

      {/* ── Section A: SPRS Worksheet & Entry ──────────────────────────── */}
      <div className="rounded-xl border border-border overflow-hidden">
        <div className="px-5 py-4 border-b border-border bg-muted/30 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Shield className="h-4 w-4 text-muted-foreground" />
            <h2 className="font-semibold text-sm">SPRS Worksheet Preview</h2>
          </div>
          <button
            onClick={async () => {
              setDownloadingReport("sprs-worksheet");
              try {
                await downloadL1Report(id, "sprs-worksheet", orgId,
                  `SPRS_Worksheet_${assessment.assessmentYear}.pdf`);
              } catch (err: any) {
                alert(err.message ?? "Download failed");
              } finally {
                setDownloadingReport(null);
              }
            }}
            disabled={downloadingReport === "sprs-worksheet"}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md border border-border hover:bg-accent transition-colors disabled:opacity-50"
          >
            {downloadingReport === "sprs-worksheet"
              ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
              : <Download className="h-3.5 w-3.5" />}
            {downloadingReport === "sprs-worksheet" ? "Generating…" : "Download Worksheet"}
          </button>
        </div>

        {/* Results summary */}
        {worksheet && (
          <div className="p-5 space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                { label: "Organization", value: worksheet.organizationName },
                { label: "Assessment Year", value: String(worksheet.assessmentYear) },
                { label: "Scope", value: worksheet.assessmentScopeName },
                { label: "Affirming Official", value: worksheet.affirmingOfficialName ?? "—" },
              ].map(({ label, value }) => (
                <div key={label} className="text-sm">
                  <div className="text-xs text-muted-foreground mb-0.5">{label}</div>
                  <div className="font-medium truncate">{value}</div>
                </div>
              ))}
            </div>

            <div className="border-t border-border pt-4">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Requirement Findings Summary</h3>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {[
                  { label: "Total", value: worksheet.requirementsSummary.total, color: "text-foreground" },
                  { label: "MET", value: worksheet.requirementsSummary.met, color: "text-emerald-700" },
                  { label: "NOT MET", value: worksheet.requirementsSummary.notMet, color: "text-red-700" },
                  { label: "N/A", value: worksheet.requirementsSummary.notApplicable, color: "text-slate-600" },
                ].map(({ label, value, color }) => (
                  <div key={label} className="text-center p-2.5 rounded-lg border border-border">
                    <div className={cn("text-2xl font-bold tabular-nums", color)}>{value}</div>
                    <div className="text-xs text-muted-foreground mt-0.5">{label}</div>
                  </div>
                ))}
              </div>
            </div>

            <div className="border-t border-border pt-4">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">FAR 52.204-21 Roll-Up</h3>
              <div className="grid grid-cols-3 gap-3">
                {[
                  { label: "Satisfied", value: worksheet.farRollup.summary.met, color: "text-emerald-700" },
                  { label: "Not Satisfied", value: worksheet.farRollup.summary.notMet, color: "text-red-700" },
                  { label: "N/A", value: worksheet.farRollup.summary.notApplicable, color: "text-slate-600" },
                ].map(({ label, value, color }) => (
                  <div key={label} className="text-center p-2.5 rounded-lg border border-border">
                    <div className={cn("text-2xl font-bold tabular-nums", color)}>{value}</div>
                    <div className="text-xs text-muted-foreground mt-0.5">{label}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Individual requirement table */}
            <div className="border-t border-border pt-4">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Individual Requirements</h3>
              <div className="rounded-lg border border-border overflow-hidden">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-muted/40 border-b border-border">
                      <th className="px-3 py-2 text-left font-semibold text-muted-foreground">Req ID</th>
                      <th className="px-3 py-2 text-left font-semibold text-muted-foreground hidden sm:table-cell">Practice</th>
                      <th className="px-3 py-2 text-right font-semibold text-muted-foreground">Finding</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/60">
                    {worksheet.requirementFindings.map((r) => (
                      <tr key={r.requirementId} className="hover:bg-accent/20">
                        <td className="px-3 py-2 font-mono font-semibold">{r.requirementId}</td>
                        <td className="px-3 py-2 text-muted-foreground hidden sm:table-cell">{r.requirementTitle}</td>
                        <td className="px-3 py-2 text-right">
                          <span className={cn("inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold border", findingColor(r.finding))}>
                            {findingLabel(r.finding)}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── Mark entered in SPRS ─────────────────────────────────────── */}
      <div className="rounded-xl border border-border overflow-hidden">
        <div className="px-5 py-4 border-b border-border bg-muted/30 flex items-center gap-2">
          {sprsEntered ? <CheckCircle2 className="h-4 w-4 text-emerald-600" /> : <CircleDot className="h-4 w-4 text-muted-foreground" />}
          <h2 className="font-semibold text-sm">SPRS Entry Record</h2>
        </div>
        <div className="p-5">
          {sprsEntered ? (
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-emerald-700 text-sm font-medium">
                <CheckCircle2 className="h-4 w-4" /> Entered in SPRS
              </div>
              {meta.sprsEnteredBy && (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm">
                  {[
                    { label: "Submitted By", value: meta.sprsEnteredBy },
                    { label: "Entry Date", value: meta.sprsEntryDate },
                    { label: "Reference #", value: meta.sprsReference },
                    ...(meta.sprsEvidence ? [{ label: "Evidence", value: meta.sprsEvidence }] : []),
                  ].map(({ label, value }) => (
                    <div key={label}>
                      <div className="text-xs text-muted-foreground mb-0.5">{label}</div>
                      <div className="font-medium">{value}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : canEnterSprs ? (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">Record the details of the SPRS entry for audit purposes.</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1.5">Submitted By <span className="text-red-500">*</span></label>
                  <input value={sprsForm.submittedBy} onChange={(e) => setSprsForm(f => ({ ...f, submittedBy: e.target.value }))}
                    placeholder="Full name" className="w-full rounded-md border border-input px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1.5">Entry Date <span className="text-red-500">*</span></label>
                  <input type="date" value={sprsForm.entryDate} onChange={(e) => setSprsForm(f => ({ ...f, entryDate: e.target.value }))}
                    className="w-full rounded-md border border-input px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1.5">SPRS Reference # <span className="text-red-500">*</span></label>
                  <input value={sprsForm.reference} onChange={(e) => setSprsForm(f => ({ ...f, reference: e.target.value }))}
                    placeholder="e.g. SPRS-2025-001" className="w-full rounded-md border border-input px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1.5">Confirmation Evidence (optional)</label>
                  <input value={sprsForm.evidence} onChange={(e) => setSprsForm(f => ({ ...f, evidence: e.target.value }))}
                    placeholder="Screenshot filename or notes" className="w-full rounded-md border border-input px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
                </div>
              </div>
              {sprsError && (
                <div className="flex items-center gap-2 px-3 py-2.5 text-sm bg-red-50 border border-red-200 text-red-700 rounded-lg">
                  <AlertTriangle className="h-4 w-4 shrink-0" /> {sprsError}
                </div>
              )}
              <button
                onClick={submitSprs}
                disabled={markSprs.isPending}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
              >
                {markSprs.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                {markSprs.isPending ? "Marking…" : "Mark Entered in SPRS"}
              </button>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              {wf === "READY_FOR_MANAGEMENT_REVIEW" ? "Awaiting management approval before SPRS entry." :
               !wf || assessment.status === "in_progress" ? "Assessment must be submitted for review and approved before SPRS entry." :
               "SPRS entry not yet recorded."}
            </p>
          )}
        </div>
      </div>

      {/* ── Section B: Annual Affirmation ─────────────────────────────── */}
      <div className="rounded-xl border border-border overflow-hidden">
        <div className="px-5 py-4 border-b border-border bg-muted/30 flex items-center gap-2">
          {isAffirmed ? <CheckCircle2 className="h-4 w-4 text-emerald-600" /> : <CircleDot className="h-4 w-4 text-muted-foreground" />}
          <h2 className="font-semibold text-sm">Annual Affirmation</h2>
        </div>
        <div className="p-5 space-y-4">
          {isAffirmed ? (
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-emerald-700 font-medium text-sm">
                <CheckCircle2 className="h-4 w-4" /> Assessment Affirmed
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm">
                {[
                  { label: "Official Name", value: assessment.affirmingOfficialName },
                  { label: "Official Title", value: assessment.affirmingOfficialTitle },
                  { label: "Affirmed Date", value: assessment.affirmedAt ? new Date(assessment.affirmedAt).toLocaleDateString() : "—" },
                  ...(meta.expirationDate ? [{ label: "Expires", value: new Date(meta.expirationDate).toLocaleDateString() }] : []),
                  ...(meta.cmmcUid ? [{ label: "CMMC UID", value: meta.cmmcUid }] : []),
                ].map(({ label, value }) => value ? (
                  <div key={label}>
                    <div className="text-xs text-muted-foreground mb-0.5">{label}</div>
                    <div className="font-medium">{value}</div>
                  </div>
                ) : null)}
              </div>
              {/* Finalize button */}
              {!isReadOnly && assessment.status === "affirmed" && (
                <div className="pt-3 border-t border-border">
                  <button onClick={() => setShowFinalizeDialog(true)} className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-md bg-slate-700 text-white hover:bg-slate-800 transition-colors">
                    <Lock className="h-4 w-4" /> Lock & Finalize Assessment
                  </button>
                  <p className="text-xs text-muted-foreground mt-1.5">Locking makes the assessment permanently read-only.</p>
                </div>
              )}
            </div>
          ) : canAffirm ? (
            <div className="space-y-4">
              {/* Read-only summary */}
              <div className="rounded-lg bg-muted/40 border border-border p-4 space-y-2">
                <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Assessment Summary</p>
                <p className="text-sm"><strong>{assessment.title}</strong></p>
                <p className="text-sm text-muted-foreground">{requirements.filter(r => r.finding === "met").length} of {requirements.length} requirements MET</p>
              </div>

              {/* Required confirmation text */}
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
                <p className="text-xs font-semibold text-amber-700 mb-2">Required Confirmation Text — type this exactly:</p>
                <p className="text-sm font-mono text-amber-900 leading-relaxed">{CONFIRMATION_TEXT}</p>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1.5">Type confirmation text <span className="text-red-500">*</span></label>
                <textarea
                  value={affirmForm.confirmText}
                  onChange={(e) => setAffirmForm(f => ({ ...f, confirmText: e.target.value }))}
                  rows={3}
                  className="w-full rounded-md border border-input px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-none"
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1.5">Official Name <span className="text-red-500">*</span></label>
                  <input value={affirmForm.officialName} onChange={(e) => setAffirmForm(f => ({ ...f, officialName: e.target.value }))}
                    placeholder="Full name" className="w-full rounded-md border border-input px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1.5">Official Title <span className="text-red-500">*</span></label>
                  <input value={affirmForm.officialTitle} onChange={(e) => setAffirmForm(f => ({ ...f, officialTitle: e.target.value }))}
                    placeholder="e.g. President, CTO" className="w-full rounded-md border border-input px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1.5">Official Email (optional)</label>
                  <input type="email" value={affirmForm.officialEmail} onChange={(e) => setAffirmForm(f => ({ ...f, officialEmail: e.target.value }))}
                    placeholder="email@company.com" className="w-full rounded-md border border-input px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1.5">Affirmation Date <span className="text-red-500">*</span></label>
                  <input type="date" value={affirmForm.affirmationDate} onChange={(e) => setAffirmForm(f => ({ ...f, affirmationDate: e.target.value }))}
                    className="w-full rounded-md border border-input px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1.5">CMMC UID (optional)</label>
                  <input value={affirmForm.cmmcUid} onChange={(e) => setAffirmForm(f => ({ ...f, cmmcUid: e.target.value }))}
                    placeholder="SPRS UID if applicable" className="w-full rounded-md border border-input px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
                </div>
              </div>
              {affirmError && (
                <div className="flex items-center gap-2 px-3 py-2.5 text-sm bg-red-50 border border-red-200 text-red-700 rounded-lg">
                  <AlertTriangle className="h-4 w-4 shrink-0" /> {affirmError}
                </div>
              )}
              <button
                onClick={submitAffirmation}
                disabled={affirmMutation.isPending || affirmForm.confirmText.trim() !== CONFIRMATION_TEXT}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-md bg-emerald-600 text-white hover:bg-emerald-700 transition-colors disabled:opacity-50"
              >
                {affirmMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Pen className="h-4 w-4" />}
                {affirmMutation.isPending ? "Submitting…" : "Submit Annual Affirmation"}
              </button>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              {assessment.status === "in_progress" ? "The assessment must be submitted for review and approved before affirmation." :
               wf === "READY_FOR_MANAGEMENT_REVIEW" ? "Awaiting management approval." :
               "SPRS entry must be completed before affirmation."}
            </p>
          )}
        </div>
      </div>

      {/* Finalize dialog */}
      {showFinalizeDialog && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-background rounded-xl border border-border shadow-xl max-w-md w-full">
            <div className="p-4 border-b border-border">
              <h3 className="font-semibold">Lock & Finalize Assessment</h3>
            </div>
            <div className="p-4 space-y-3">
              <p className="text-sm text-muted-foreground">
                This will permanently lock the assessment, making all fields read-only. This action <strong>cannot be undone</strong>. Proceed only when you are confident the assessment is complete.
              </p>
              {finalizeError && (
                <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-md px-3 py-2">{finalizeError}</div>
              )}
            </div>
            <div className="p-4 border-t border-border flex justify-end gap-2">
              <button onClick={() => setShowFinalizeDialog(false)} className="px-4 py-2 text-sm rounded-md border border-border hover:bg-accent">Cancel</button>
              <button onClick={handleFinalize} disabled={finalizeMutation.isPending} className="inline-flex items-center gap-1.5 px-4 py-2 text-sm rounded-md bg-slate-700 text-white hover:bg-slate-800 disabled:opacity-50">
                {finalizeMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Lock className="h-4 w-4" />}
                Lock Assessment
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
