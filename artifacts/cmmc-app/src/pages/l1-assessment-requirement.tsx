/**
 * L1 Annual Self-Assessment — Requirement Detail Page
 *
 * Full detail view with tabs: Overview, Objectives, Evidence, Notes & Finding
 */
import { useState } from "react";
import { Link } from "wouter";
import {
  ChevronLeft, CheckCircle2, XCircle, CircleDot, AlertTriangle, Loader2,
  Plus, Trash2, FileText, Link2, Save, Info, Lock, ChevronRight,
} from "lucide-react";
import { useOrg } from "@/context/OrgContext";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetL1AssessmentDetail,
  useUpdateL1Requirement,
  useCreateL1Objective,
  useUpdateL1Objective,
  useDeleteL1Objective,
  useLinkL1Evidence,
  useDeleteL1Evidence,
} from "@workspace/api-client-react";
import { cn } from "@/lib/utils";
import type {
  L1FindingValue, L1ObjectiveResult, L1Requirement, L1Objective, L1EvidenceLink
} from "@workspace/api-client-react";

// ── FAR mapping ────────────────────────────────────────────────────────────

const FAR_MAPPING: Record<string, string> = {
  "AC.L1-3.1.1":  "(i)", "AC.L1-3.1.2": "(ii)", "AC.L1-3.1.20": "(iii)",
  "AC.L1-3.1.22": "(iv)", "IA.L1-3.5.1": "(v)", "IA.L1-3.5.2": "(vi)",
  "MP.L1-3.8.3": "(vii)", "PE.L1-3.10.1": "(viii)", "PE.L1-3.10.3": "(ix)",
  "PE.L1-3.10.4": "(ix)", "PE.L1-3.10.5": "(ix)", "SC.L1-3.13.1": "(x)",
  "SC.L1-3.13.5": "(xi)", "SI.L1-3.14.1": "(xii)", "SI.L1-3.14.2": "(xiii)",
  "SI.L1-3.14.4": "(xiv)", "SI.L1-3.14.5": "(xv)",
};

const REQUIREMENT_STATEMENTS: Record<string, string> = {
  "AC.L1-3.1.1": "Limit information system access to authorized users, processes acting on behalf of authorized users, and devices (including other information systems).",
  "AC.L1-3.1.2": "Limit information system access to the types of transactions and functions that authorized users are permitted to execute.",
  "AC.L1-3.1.20": "Verify and control/limit connections to external information systems.",
  "AC.L1-3.1.22": "Control information posted or processed on publicly accessible information systems.",
  "IA.L1-3.5.1": "Identify information system users, processes acting on behalf of users, and devices.",
  "IA.L1-3.5.2": "Authenticate (or verify) the identities of those users, processes, or devices, as a prerequisite to allowing access to organizational information systems.",
  "MP.L1-3.8.3": "Sanitize or destroy information system media before disposal or reuse.",
  "PE.L1-3.10.1": "Limit physical access to organizational information systems, equipment, and the respective operating environments to authorized individuals.",
  "PE.L1-3.10.3": "Escort visitors and monitor visitor activity.",
  "PE.L1-3.10.4": "Maintain audit logs of physical access.",
  "PE.L1-3.10.5": "Control and manage physical access devices.",
  "SC.L1-3.13.1": "Monitor, control, and protect organizational communications (i.e., information transmitted or received by organizational information systems) at the external boundaries and key internal boundaries of the information systems.",
  "SC.L1-3.13.5": "Implement subnetworks for publicly accessible system components that are physically or logically separated from internal networks.",
  "SI.L1-3.14.1": "Identify, report, and correct information and information system flaws in a timely manner.",
  "SI.L1-3.14.2": "Provide protection from malicious code at appropriate locations within organizational information systems.",
  "SI.L1-3.14.4": "Update malicious code protection mechanisms when new releases are available.",
  "SI.L1-3.14.5": "Perform periodic scans of the information system and real-time scans of files from external sources as files are downloaded, opened, or executed.",
};

// ── Badge helpers ─────────────────────────────────────────────────────────────

function FindingBadge({ finding }: { finding: L1FindingValue }) {
  switch (finding) {
    case "met": return <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-700 border border-emerald-200"><CheckCircle2 className="h-3.5 w-3.5" />MET</span>;
    case "not_met": return <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-red-100 text-red-700 border border-red-200"><XCircle className="h-3.5 w-3.5" />NOT MET</span>;
    case "not_applicable": return <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-slate-100 text-slate-600 border border-slate-200">N/A</span>;
    default: return <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-gray-100 text-gray-500 border border-gray-200"><CircleDot className="h-3.5 w-3.5" />NOT YET ASSESSED</span>;
  }
}

function ObjectiveResultBadge({ result }: { result: L1ObjectiveResult }) {
  switch (result) {
    case "satisfied": return <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-100 text-emerald-700">SATISFIED</span>;
    case "other_than_satisfied": return <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold bg-red-100 text-red-700">OTHER THAN SAT.</span>;
    case "not_applicable": return <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold bg-slate-100 text-slate-600">N/A</span>;
    default: return <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold bg-gray-100 text-gray-500">NOT REVIEWED</span>;
  }
}

type Tab = "overview" | "objectives" | "evidence" | "notes";

export default function L1AssessmentRequirement({
  assessmentId,
  reqId,
}: {
  assessmentId: string;
  reqId: string;
}) {
  const { activeOrg } = useOrg();
  const orgId = activeOrg?.id ?? "";
  const qc = useQueryClient();

  const [activeTab, setActiveTab] = useState<Tab>("overview");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Form state for notes tab
  const [narrative, setNarrative] = useState<string | null>(null);
  const [assessorNotes, setAssessorNotes] = useState<string | null>(null);
  const [naJustification, setNaJustification] = useState<string | null>(null);
  const [finding, setFinding] = useState<L1FindingValue | null>(null);

  // Objective form
  const [newObjText, setNewObjText] = useState("");
  const [addingObj, setAddingObj] = useState(false);

  // Evidence form
  const [addingEv, setAddingEv] = useState(false);
  const [evDesc, setEvDesc] = useState("");
  const [evUse, setEvUse] = useState<"examine" | "interview" | "test">("examine");
  const [evQual, setEvQual] = useState<"directly_applicable" | "partially_applicable" | "supplementary">("directly_applicable");

  const { data, isLoading, refetch } = useGetL1AssessmentDetail(assessmentId, orgId);
  const updateReqMutation = useUpdateL1Requirement(assessmentId, reqId, orgId);
  const createObjMutation = useCreateL1Objective(assessmentId, reqId, orgId);
  const deleteObjMutation = useDeleteL1Objective(assessmentId, reqId, orgId);
  const linkEvMutation = useLinkL1Evidence(assessmentId, orgId);
  const deleteEvMutation = useDeleteL1Evidence(assessmentId, orgId);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-32 text-muted-foreground">
        <Loader2 className="h-6 w-6 animate-spin mr-2" />Loading requirement…
      </div>
    );
  }

  if (!data) return <div className="p-6 text-muted-foreground">Assessment not found.</div>;

  const { assessment, requirements, evidenceLinks } = data;
  const req = requirements.find((r) => r.id === reqId);
  if (!req) return <div className="p-6 text-muted-foreground">Requirement not found.</div>;

  const isReadOnly = assessment.isReadOnly;

  // Initialize form state from req (lazy)
  const currentNarrative = narrative ?? req.implementationNarrative ?? "";
  const currentNotes = assessorNotes ?? req.assessorNotes ?? "";
  const currentNa = naJustification ?? req.naJustification ?? "";
  const currentFinding = finding ?? req.finding;

  const reqEvidence = evidenceLinks.filter((l) => l.assessmentRequirementId === reqId);
  const objectives = req.objectives ?? [];

  // Auto-derived finding indicator from objectives
  const hasObjectives = objectives.length > 0;
  const allSatisfied = hasObjectives && objectives.every((o) => o.result === "satisfied" || o.result === "not_applicable");
  const anyOtherThanSat = objectives.some((o) => o.result === "other_than_satisfied");
  const derivedFinding: L1FindingValue = !hasObjectives ? "not_reviewed" : allSatisfied ? "met" : anyOtherThanSat ? "not_met" : "not_reviewed";

  const farClause = FAR_MAPPING[req.requirementId] ?? "—";
  const statement = REQUIREMENT_STATEMENTS[req.requirementId] ?? req.requirementTitle;

  async function saveNotes() {
    setSaving(true);
    setSaveError(null);
    try {
      await updateReqMutation.mutateAsync({
        finding: currentFinding,
        implementationNarrative: currentNarrative,
        assessorNotes: currentNotes,
        naJustification: currentFinding === "not_applicable" ? currentNa : undefined,
      });
      qc.invalidateQueries({ queryKey: ["l1-assessment-detail", assessmentId] });
      qc.invalidateQueries({ queryKey: ["l1-assessment-far-rollup", assessmentId] });
      await refetch();
    } catch (err: any) {
      setSaveError(err.message ?? "Failed to save");
    }
    setSaving(false);
  }

  async function addObjective() {
    if (!newObjText.trim()) return;
    try {
      await createObjMutation.mutateAsync({ objectiveText: newObjText.trim(), sortOrder: objectives.length });
      setNewObjText("");
      setAddingObj(false);
      await refetch();
    } catch (err: any) {
      setSaveError(err.message ?? "Failed to add objective");
    }
  }

  async function deleteObjective(objId: string) {
    try {
      await deleteObjMutation.mutateAsync({ objId });
      await refetch();
    } catch (err: any) {
      setSaveError(err.message ?? "Failed to delete objective");
    }
  }

  async function linkEvidence() {
    if (!evDesc.trim()) return;
    try {
      await linkEvMutation.mutateAsync({
        assessmentRequirementId: reqId,
        evidenceDescription: evDesc.trim(),
        assessmentUse: evUse,
        qualification: evQual,
      });
      setEvDesc("");
      setAddingEv(false);
      await refetch();
    } catch (err: any) {
      setSaveError(err.message ?? "Failed to link evidence");
    }
  }

  async function deleteEvidence(linkId: string) {
    try {
      await deleteEvMutation.mutateAsync({ linkId });
      await refetch();
    } catch (err: any) {
      setSaveError(err.message ?? "Failed to remove evidence");
    }
  }

  // Navigate to next/prev requirement
  const reqIndex = requirements.findIndex((r) => r.id === reqId);
  const prevReq = reqIndex > 0 ? requirements[reqIndex - 1] : null;
  const nextReq = reqIndex < requirements.length - 1 ? requirements[reqIndex + 1] : null;

  const tabs: { key: Tab; label: string }[] = [
    { key: "overview", label: "Overview" },
    { key: "objectives", label: `Objectives (${objectives.length})` },
    { key: "evidence", label: `Evidence (${reqEvidence.length})` },
    { key: "notes", label: "Notes & Finding" },
  ];

  const qualLabel: Record<string, string> = {
    directly_applicable: "Directly Applicable",
    partially_applicable: "Partially Applicable",
    supplementary: "Supplementary",
  };
  const useLabel: Record<string, string> = {
    examine: "Examine",
    interview: "Interview",
    test: "Test",
  };

  return (
    <div className="max-w-4xl mx-auto space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3 pb-4 border-b border-border">
        <Link href={`/l1-assessment/${assessmentId}`} className="p-2 rounded-md hover:bg-accent transition-colors">
          <ChevronLeft className="h-5 w-5" />
        </Link>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-lg font-semibold">{req.requirementId}</h1>
            <span className="text-muted-foreground">·</span>
            <span className="text-sm text-muted-foreground">{req.requirementTitle}</span>
            {isReadOnly && <Lock className="h-4 w-4 text-muted-foreground" />}
          </div>
          <div className="flex items-center gap-2 mt-1">
            <span className="text-xs bg-purple-50 text-purple-700 border border-purple-200 rounded px-1.5 py-0.5 font-mono font-semibold">FAR {farClause}</span>
            <FindingBadge finding={req.finding} />
          </div>
        </div>
        {/* Prev/Next navigation */}
        <div className="flex items-center gap-1 shrink-0">
          {prevReq && (
            <Link href={`/l1-assessment/${assessmentId}/requirement/${prevReq.id}`} className="p-2 rounded-md hover:bg-accent transition-colors text-muted-foreground hover:text-foreground" title={prevReq.requirementId}>
              <ChevronLeft className="h-4 w-4" />
            </Link>
          )}
          <span className="text-xs text-muted-foreground px-1">{reqIndex + 1}/{requirements.length}</span>
          {nextReq && (
            <Link href={`/l1-assessment/${assessmentId}/requirement/${nextReq.id}`} className="p-2 rounded-md hover:bg-accent transition-colors text-muted-foreground hover:text-foreground" title={nextReq.requirementId}>
              <ChevronRight className="h-4 w-4" />
            </Link>
          )}
        </div>
      </div>

      {/* Auto-derived finding indicator */}
      {hasObjectives && (
        <div className={cn(
          "flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm border",
          allSatisfied ? "bg-emerald-50 border-emerald-200 text-emerald-800" :
          anyOtherThanSat ? "bg-red-50 border-red-200 text-red-800" :
          "bg-slate-50 border-slate-200 text-slate-700"
        )}>
          <Info className="h-4 w-4 shrink-0" />
          <span>
            Auto-derived from objectives: <strong>{derivedFinding === "met" ? "MET" : derivedFinding === "not_met" ? "NOT MET" : "NOT REVIEWED"}</strong>.
            {derivedFinding !== currentFinding && currentFinding !== "not_reviewed" && " Override applied in Notes & Finding."}
          </span>
        </div>
      )}

      {saveError && (
        <div className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm bg-red-50 border border-red-200 text-red-800">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          {saveError}
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-0 border-b border-border">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setActiveTab(t.key)}
            className={cn(
              "px-4 py-2.5 text-sm font-medium border-b-2 transition-colors",
              activeTab === t.key ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground hover:border-muted"
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* ── Tab: Overview ───────────────────────────────────────────────────── */}
      {activeTab === "overview" && (
        <div className="space-y-4">
          <div className="rounded-xl border border-border p-5 space-y-4">
            <h3 className="font-semibold text-sm uppercase tracking-widest text-muted-foreground">Requirement Statement</h3>
            <p className="text-sm leading-relaxed">{statement}</p>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="rounded-xl border border-border p-4">
              <div className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-2">FAR Authority Mapping</div>
              <div className="flex items-center gap-2">
                <span className="text-lg font-bold font-mono text-purple-700">FAR 52.204-21{farClause}</span>
              </div>
            </div>
            <div className="rounded-xl border border-border p-4">
              <div className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-2">Domain</div>
              <div className="text-sm font-medium">{req.requirementId.split(".")[0]}</div>
            </div>
          </div>

          {req.implementationNarrative && (
            <div className="rounded-xl border border-border p-5">
              <h3 className="font-semibold text-sm mb-3">Implementation Narrative</h3>
              <p className="text-sm leading-relaxed whitespace-pre-wrap">{req.implementationNarrative}</p>
            </div>
          )}
        </div>
      )}

      {/* ── Tab: Objectives ─────────────────────────────────────────────────── */}
      {activeTab === "objectives" && (
        <div className="space-y-4">
          {objectives.length === 0 && !addingObj && (
            <div className="text-center py-12 text-muted-foreground text-sm">
              <CircleDot className="h-8 w-8 opacity-30 mx-auto mb-2" />
              No assessment objectives defined yet.
            </div>
          )}
          {objectives.map((obj) => (
            <ObjectiveRow
              key={obj.id}
              obj={obj}
              isReadOnly={isReadOnly}
              assessmentId={assessmentId}
              reqId={reqId}
              orgId={orgId}
              onUpdate={() => refetch()}
              onDelete={() => deleteObjective(obj.id)}
            />
          ))}
          {!isReadOnly && (
            addingObj ? (
              <div className="rounded-xl border border-dashed border-primary/40 p-4 space-y-3">
                <textarea
                  value={newObjText}
                  onChange={(e) => setNewObjText(e.target.value)}
                  rows={2}
                  autoFocus
                  placeholder="Enter assessment objective text..."
                  className="w-full rounded-md border border-input px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-none"
                />
                <div className="flex gap-2">
                  <button onClick={addObjective} disabled={createObjMutation.isPending || !newObjText.trim()} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
                    {createObjMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
                    Add Objective
                  </button>
                  <button onClick={() => { setAddingObj(false); setNewObjText(""); }} className="px-3 py-1.5 text-xs rounded-md border border-border hover:bg-accent">
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <button onClick={() => setAddingObj(true)} className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors">
                <Plus className="h-4 w-4" /> Add Assessment Objective
              </button>
            )
          )}
        </div>
      )}

      {/* ── Tab: Evidence ────────────────────────────────────────────────────── */}
      {activeTab === "evidence" && (
        <div className="space-y-4">
          {reqEvidence.length === 0 && !addingEv && (
            <div className="text-center py-12 text-muted-foreground text-sm">
              <FileText className="h-8 w-8 opacity-30 mx-auto mb-2" />
              No evidence linked to this requirement.
            </div>
          )}
          {reqEvidence.map((link) => (
            <div key={link.id} className="flex items-start gap-3 p-4 rounded-xl border border-border">
              <Link2 className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium">{link.evidenceDescription ?? link.fileName ?? "Evidence Item"}</p>
                <div className="flex items-center gap-2 mt-1 flex-wrap">
                  <span className="text-[10px] font-semibold bg-blue-50 text-blue-700 border border-blue-200 px-1.5 py-0.5 rounded uppercase">{useLabel[link.assessmentUse] ?? link.assessmentUse}</span>
                  <span className={cn(
                    "text-[10px] font-semibold px-1.5 py-0.5 rounded border uppercase",
                    link.qualification === "directly_applicable" ? "bg-emerald-50 text-emerald-700 border-emerald-200" :
                    link.qualification === "partially_applicable" ? "bg-amber-50 text-amber-700 border-amber-200" :
                    "bg-slate-50 text-slate-600 border-slate-200"
                  )}>{qualLabel[link.qualification] ?? link.qualification}</span>
                  {link.notes && <span className="text-xs text-muted-foreground">{link.notes}</span>}
                </div>
              </div>
              {!isReadOnly && (
                <button onClick={() => deleteEvidence(link.id)} className="p-1.5 rounded hover:bg-red-50 hover:text-red-600 transition-colors text-muted-foreground" title="Remove evidence link">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          ))}

          {!isReadOnly && (
            addingEv ? (
              <div className="rounded-xl border border-dashed border-primary/40 p-4 space-y-3">
                <div>
                  <label className="block text-xs font-medium mb-1.5">Evidence Description <span className="text-red-500">*</span></label>
                  <textarea
                    value={evDesc}
                    onChange={(e) => setEvDesc(e.target.value)}
                    rows={2}
                    autoFocus
                    placeholder="Describe the evidence item (e.g. 'User account policy document', 'Screenshot of access control list')..."
                    className="w-full rounded-md border border-input px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-none"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium mb-1.5">Assessment Method</label>
                    <select value={evUse} onChange={(e) => setEvUse(e.target.value as any)} className="w-full rounded-md border border-input px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring">
                      <option value="examine">Examine</option>
                      <option value="interview">Interview</option>
                      <option value="test">Test</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium mb-1.5">Qualification</label>
                    <select value={evQual} onChange={(e) => setEvQual(e.target.value as any)} className="w-full rounded-md border border-input px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring">
                      <option value="directly_applicable">Directly Applicable</option>
                      <option value="partially_applicable">Partially Applicable</option>
                      <option value="supplementary">Supplementary</option>
                    </select>
                  </div>
                </div>
                <div className="flex gap-2">
                  <button onClick={linkEvidence} disabled={linkEvMutation.isPending || !evDesc.trim()} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
                    {linkEvMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Link2 className="h-3.5 w-3.5" />}
                    Link Evidence
                  </button>
                  <button onClick={() => { setAddingEv(false); setEvDesc(""); }} className="px-3 py-1.5 text-xs rounded-md border border-border hover:bg-accent">
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <button onClick={() => setAddingEv(true)} className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors">
                <Plus className="h-4 w-4" /> Link Evidence
              </button>
            )
          )}
        </div>
      )}

      {/* ── Tab: Notes & Finding ─────────────────────────────────────────────── */}
      {activeTab === "notes" && (
        <div className="space-y-4 max-w-3xl">
          <div>
            <label className="block text-sm font-medium mb-1.5">Implementation Narrative</label>
            <textarea
              disabled={isReadOnly}
              value={currentNarrative}
              onChange={(e) => setNarrative(e.target.value)}
              rows={5}
              placeholder="Describe how this practice is implemented in your organization..."
              className="w-full rounded-md border border-input px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-none disabled:opacity-60"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1.5">Assessor Notes</label>
            <textarea
              disabled={isReadOnly}
              value={currentNotes}
              onChange={(e) => setAssessorNotes(e.target.value)}
              rows={3}
              placeholder="Internal notes for assessors (not published)..."
              className="w-full rounded-md border border-input px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-none disabled:opacity-60"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1.5">Finding</label>
            <div className="flex flex-wrap gap-2">
              {(["met", "not_met", "not_applicable", "not_reviewed"] as L1FindingValue[]).map((f) => (
                <button
                  key={f}
                  disabled={isReadOnly}
                  onClick={() => setFinding(f)}
                  className={cn(
                    "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium border transition-colors disabled:opacity-60",
                    currentFinding === f
                      ? f === "met" ? "bg-emerald-600 text-white border-emerald-600" :
                        f === "not_met" ? "bg-red-600 text-white border-red-600" :
                        f === "not_applicable" ? "bg-slate-600 text-white border-slate-600" :
                        "bg-primary text-primary-foreground border-primary"
                      : "border-border hover:bg-accent"
                  )}
                >
                  {f === "met" ? "MET" : f === "not_met" ? "NOT MET" : f === "not_applicable" ? "N/A" : "NOT YET ASSESSED"}
                </button>
              ))}
            </div>
            {hasObjectives && derivedFinding !== currentFinding && (
              <p className="text-xs text-muted-foreground mt-1.5">
                <Info className="h-3 w-3 inline mr-1" />
                Objectives suggest <strong>{derivedFinding === "met" ? "MET" : derivedFinding === "not_met" ? "NOT MET" : "NOT REVIEWED"}</strong>. Manual override applied.
              </p>
            )}
          </div>
          {currentFinding === "not_applicable" && (
            <div>
              <label className="block text-sm font-medium mb-1.5">N/A Justification <span className="text-red-500">*</span></label>
              <textarea
                disabled={isReadOnly}
                value={currentNa}
                onChange={(e) => setNaJustification(e.target.value)}
                rows={3}
                placeholder="Explain why this practice is not applicable..."
                className="w-full rounded-md border border-input px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-none disabled:opacity-60"
              />
            </div>
          )}
          {!isReadOnly && (
            <div className="flex items-center gap-3">
              <button
                onClick={saveNotes}
                disabled={saving}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
              >
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                {saving ? "Saving…" : "Save Finding"}
              </button>
              {saveError && <span className="text-sm text-red-700">{saveError}</span>}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── ObjectiveRow component ─────────────────────────────────────────────────────

function ObjectiveRow({
  obj,
  isReadOnly,
  assessmentId,
  reqId,
  orgId,
  onUpdate,
  onDelete,
}: {
  obj: L1Objective;
  isReadOnly: boolean;
  assessmentId: string;
  reqId: string;
  orgId: string;
  onUpdate: () => void;
  onDelete: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(obj.objectiveText);
  const [notes, setNotes] = useState(obj.notes ?? "");
  const updateMutation = useUpdateL1Objective(assessmentId, reqId, obj.id, orgId);

  async function saveResult(result: L1ObjectiveResult) {
    try {
      await updateMutation.mutateAsync({ result });
      onUpdate();
    } catch {}
  }

  async function saveEdits() {
    try {
      await updateMutation.mutateAsync({ objectiveText: text, notes: notes || undefined });
      setEditing(false);
      onUpdate();
    } catch {}
  }

  const resultOptions: { value: L1ObjectiveResult; label: string; cls: string }[] = [
    { value: "satisfied", label: "SAT", cls: "bg-emerald-100 text-emerald-700 border-emerald-200" },
    { value: "other_than_satisfied", label: "OTS", cls: "bg-red-100 text-red-700 border-red-200" },
    { value: "not_applicable", label: "N/A", cls: "bg-slate-100 text-slate-600 border-slate-200" },
    { value: "not_reviewed", label: "N/R", cls: "bg-gray-100 text-gray-500 border-gray-200" },
  ];

  return (
    <div className="rounded-xl border border-border p-4 space-y-2">
      {editing ? (
        <div className="space-y-2">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={2}
            className="w-full rounded-md border border-input px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-none"
          />
          <input
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Notes (optional)"
            className="w-full rounded-md border border-input px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
          <div className="flex gap-2">
            <button onClick={saveEdits} disabled={updateMutation.isPending} className="px-3 py-1.5 text-xs rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
              {updateMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin inline mr-1" /> : null}Save
            </button>
            <button onClick={() => setEditing(false)} className="px-3 py-1.5 text-xs rounded-md border border-border hover:bg-accent">Cancel</button>
          </div>
        </div>
      ) : (
        <div className="flex items-start gap-3">
          <div className="flex-1 min-w-0">
            <p className="text-sm">{obj.objectiveText}</p>
            {obj.notes && <p className="text-xs text-muted-foreground mt-0.5 italic">{obj.notes}</p>}
          </div>
          <div className="flex items-center gap-1 shrink-0 flex-wrap justify-end">
            {resultOptions.map((opt) => (
              <button
                key={opt.value}
                disabled={isReadOnly || updateMutation.isPending}
                onClick={() => saveResult(opt.value)}
                className={cn(
                  "px-2 py-0.5 text-[10px] font-semibold rounded border transition-colors disabled:opacity-50",
                  obj.result === opt.value ? opt.cls : "bg-background text-muted-foreground border-border hover:bg-accent"
                )}
              >
                {opt.label}
              </button>
            ))}
            {!isReadOnly && (
              <>
                <button onClick={() => setEditing(true)} className="p-1 rounded hover:bg-accent text-muted-foreground hover:text-foreground transition-colors ml-1" title="Edit">
                  <Save className="h-3.5 w-3.5" />
                </button>
                <button onClick={onDelete} className="p-1 rounded hover:bg-red-50 hover:text-red-600 transition-colors text-muted-foreground" title="Delete">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
