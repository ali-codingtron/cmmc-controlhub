import { useState, useEffect } from "react";
import { useAuth } from "@/lib/auth";
import { useOrg } from "@/context/OrgContext";
import { useDemoMode } from "@/context/DemoModeContext";
import { useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import {
  Award,
  Shield,
  Clock,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  ChevronRight,
  ChevronDown,
  Plus,
  RefreshCw,
  FileText,
  Calendar,
  Building2,
  Hash,
  ArrowRight,
  Activity,
  Layers,
  GitBranch,
  RotateCcw,
  History,
  Info,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { RecordCertWizardBody } from "@/components/certification/RecordCertWizardBody";

// ─── Types ───────────────────────────────────────────────────────────────────

interface CertificationRecord {
  id: string;
  organizationId: string;
  certificationStatus: string;
  cmmcUid: string;
  assessmentLevel: string;
  c3paoName: string;
  cmmcStatusDate: string;
  assessmentStartDate: string;
  assessmentCompletionDate: string;
  assessmentUniqueId: string;
  cageCodes: string[];
  assessmentScopeName: string;
  sspTitle: string;
  sspVersion: string;
  sspDate: string;
  affirmingOfficial: string;
  internalCertificationOwner: string;
  assessorNames: string[];
  assessorContactInfo: string | null;
  contractReferences: string[];
  notes: string | null;
  moduleState: string;
  submittedById: string | null;
  submittedAt: string;
  verifiedById: string | null;
  verifiedAt: string | null;
  verificationNotes: string | null;
  adminOverrideJustification: string | null;
  statusValidThrough: string | null;
  nextAffirmationDue: string | null;
  closeoutDeadline: string | null;
  isActive: boolean;
  isArchived: boolean;
  createdAt: string;
}

interface StatusResponse {
  certificationModuleState: string;
  certificationRecord: CertificationRecord | null;
  sustainmentHealth?: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmtDate(d: string | null | undefined): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

function daysUntil(d: string | null | undefined): number | null {
  if (!d) return null;
  const diff = new Date(d).getTime() - Date.now();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

function countdownLabel(d: string | null | undefined): string {
  const days = daysUntil(d);
  if (days === null) return "—";
  if (days < 0) return `${Math.abs(days)} days overdue`;
  if (days === 0) return "Due today";
  return `${days} days remaining`;
}

function statusBadgeClass(state: string): string {
  switch (state) {
    case "FINAL_L2_C3PAO": return "bg-emerald-100 text-emerald-800 border-emerald-200";
    case "CONDITIONAL_L2_C3PAO": return "bg-amber-100 text-amber-800 border-amber-200";
    case "EXPIRED": return "bg-red-100 text-red-700 border-red-200";
    case "SUSPENDED": return "bg-red-100 text-red-700 border-red-200";
    case "INVALIDATED": return "bg-red-100 text-red-700 border-red-200";
    case "VERIFICATION_PENDING": return "bg-blue-100 text-blue-800 border-blue-200";
    default: return "bg-slate-100 text-slate-600 border-slate-200";
  }
}

function statusLabel(state: string): string {
  switch (state) {
    case "FINAL_L2_C3PAO": return "Final Level 2 (C3PAO)";
    case "CONDITIONAL_L2_C3PAO": return "Conditional Level 2 (C3PAO)";
    case "EXPIRED": return "Expired";
    case "SUSPENDED": return "Suspended";
    case "INVALIDATED": return "Invalidated";
    case "VERIFICATION_PENDING": return "Verification Pending";
    default: return state;
  }
}

function healthColor(h: string): string {
  switch (h) {
    case "On Track": return "text-emerald-600";
    case "Attention Needed": return "text-amber-600";
    case "At Risk": return "text-orange-600";
    case "Expired": return "text-red-600";
    default: return "text-slate-500";
  }
}

function canActivate(orgRole: string, userRole: string): boolean {
  return userRole === "admin" || ["org_admin", "compliance_manager"].includes(orgRole);
}

function canVerify(orgRole: string, userRole: string): boolean {
  return userRole === "admin" || ["org_admin", "reviewer"].includes(orgRole);
}

// ─── Activation Wizard ───────────────────────────────────────────────────────

function ActivationWizard({
  onSuccess,
  onCancel,
  existingRecord,
}: {
  onSuccess: () => void;
  onCancel: () => void;
  existingRecord?: Record<string, any>;
}) {
  const { activeOrg } = useOrg();

  if (!activeOrg) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="bg-slate-900 rounded-t-2xl px-6 py-5">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-600/20 rounded-lg">
              <Award className="h-5 w-5 text-blue-400" />
            </div>
            <div>
              <h2 className="text-white font-semibold text-lg">
                Record Official CMMC Level 2 Status — {activeOrg.name}
              </h2>
              <p className="text-slate-400 text-xs mt-0.5">
                This records an already-received official C3PAO certification status.
              </p>
            </div>
          </div>
        </div>
        <div className="p-6">
          <RecordCertWizardBody
            orgId={activeOrg.id}
            orgName={activeOrg.name}
            onSuccess={onSuccess}
            onCancel={onCancel}
            existingRecord={existingRecord}
          />
        </div>
      </div>
    </div>
  );
}

// ─── Verification Panel ───────────────────────────────────────────────────────

function VerificationPanel({
  record,
  onAction,
}: {
  record: CertificationRecord;
  onAction: () => void;
}) {
  const { activeOrg } = useOrg();
  const { user } = useAuth();
  const { toast } = useToast();
  const [verificationNotes, setVerificationNotes] = useState("");
  const [rejectionReason, setRejectionReason] = useState("");
  const [loading, setLoading] = useState(false);
  const [showReject, setShowReject] = useState(false);
  const [showAdminOverride, setShowAdminOverride] = useState(false);
  const [adminJustification, setAdminJustification] = useState("");
  const [adminLoading, setAdminLoading] = useState(false);

  const isSelf = user?.id === record.submittedById;

  async function doAdminOverride() {
    if (adminJustification.trim().length < 20) {
      toast({ title: "Justification too short", description: "Enter at least 20 characters.", variant: "destructive" });
      return;
    }
    setAdminLoading(true);
    try {
      const token = localStorage.getItem("auth_token");
      const r = await fetch("/api/certification/admin-override", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, "X-Organization-ID": activeOrg!.id },
        body: JSON.stringify({ justification: adminJustification }),
      });
      const data = await r.json();
      if (!r.ok) {
        toast({ title: "Override failed", description: data.error ?? "Could not apply override", variant: "destructive" });
        return;
      }
      toast({ title: "Override applied", description: "Certification has been activated." });
      onAction();
    } catch {
      toast({ title: "Network error", variant: "destructive" });
    } finally {
      setAdminLoading(false);
    }
  }

  async function doVerify() {
    setLoading(true);
    try {
      const token = localStorage.getItem("auth_token");
      const r = await fetch("/api/certification/verify", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
          "X-Organization-ID": activeOrg!.id,
        },
        body: JSON.stringify({ verificationNotes }),
      });
      const data = await r.json();
      if (!r.ok) {
        toast({ title: "Error", description: data.error ?? "Verification failed", variant: "destructive" });
        return;
      }
      toast({ title: "Verified", description: "Certification module is now active." });
      onAction();
    } catch {
      toast({ title: "Error", description: "Network error", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }

  async function doReject() {
    if (!rejectionReason.trim()) {
      toast({ title: "Error", description: "Rejection reason is required", variant: "destructive" });
      return;
    }
    setLoading(true);
    try {
      const token = localStorage.getItem("auth_token");
      const r = await fetch("/api/certification/reject", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
          "X-Organization-ID": activeOrg!.id,
        },
        body: JSON.stringify({ rejectionReason }),
      });
      const data = await r.json();
      if (!r.ok) {
        toast({ title: "Error", description: data.error ?? "Rejection failed", variant: "destructive" });
        return;
      }
      toast({ title: "Rejected", description: "Certification record has been rejected." });
      onAction();
    } catch {
      toast({ title: "Error", description: "Network error", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="bg-blue-50 border border-blue-200 rounded-2xl p-6">
      <div className="flex items-center gap-3 mb-4">
        <div className="p-2 bg-blue-100 rounded-lg">
          <Clock className="h-5 w-5 text-blue-600" />
        </div>
        <div>
          <div className="font-semibold text-blue-900">Certification Pending Verification</div>
          <div className="text-xs text-blue-700">Submitted {fmtDate(record.submittedAt)}</div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 mb-4 text-xs">
        <div className="bg-white rounded-lg p-3 border border-blue-100">
          <div className="text-slate-500 mb-1">Status</div>
          <div className="font-semibold text-slate-800">{statusLabel(record.certificationStatus)}</div>
        </div>
        <div className="bg-white rounded-lg p-3 border border-blue-100">
          <div className="text-slate-500 mb-1">CMMC UID</div>
          <div className="font-semibold text-slate-800 font-mono">{record.cmmcUid}</div>
        </div>
        <div className="bg-white rounded-lg p-3 border border-blue-100">
          <div className="text-slate-500 mb-1">C3PAO</div>
          <div className="font-semibold text-slate-800">{record.c3paoName}</div>
        </div>
        <div className="bg-white rounded-lg p-3 border border-blue-100">
          <div className="text-slate-500 mb-1">Status Date</div>
          <div className="font-semibold text-slate-800">{fmtDate(record.cmmcStatusDate)}</div>
        </div>
      </div>

      {isSelf ? (
        <div className="space-y-3">
          <div className="bg-white border border-blue-200 rounded-xl p-4 text-sm text-blue-800">
            <div className="font-medium mb-1">Awaiting Second-Person Verification</div>
            <div className="text-xs text-blue-600">
              You submitted this record. A different authorized user must verify it before the module activates.
            </div>
          </div>
          {user?.role === "admin" && (
            <div className="border border-amber-200 rounded-xl overflow-hidden">
              <button
                onClick={() => setShowAdminOverride((v) => !v)}
                className="w-full flex items-center justify-between px-4 py-3 bg-amber-50 text-sm font-medium text-amber-800 hover:bg-amber-100 transition-colors"
              >
                <span className="flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4" />
                  Admin Override
                </span>
                <ChevronDown className={cn("h-4 w-4 transition-transform", showAdminOverride && "rotate-180")} />
              </button>
              {showAdminOverride && (
                <div className="px-4 py-3 bg-white space-y-3">
                  <p className="text-xs text-slate-500">
                    Bypass the second-person requirement by documenting justification below. This action is permanently audit-logged.
                  </p>
                  <textarea
                    rows={3}
                    value={adminJustification}
                    onChange={(e) => setAdminJustification(e.target.value)}
                    placeholder="Justification for bypassing second-person verification (min 20 characters)…"
                    className="w-full border border-amber-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
                  />
                  <button
                    onClick={doAdminOverride}
                    disabled={adminLoading || adminJustification.trim().length < 20}
                    className="w-full py-2 bg-amber-600 text-white text-sm font-medium rounded-lg hover:bg-amber-700 disabled:opacity-40 transition-colors"
                  >
                    {adminLoading ? "Applying override…" : "Apply Override & Activate"}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          <textarea
            placeholder="Verification notes (optional)"
            value={verificationNotes}
            onChange={(e) => setVerificationNotes(e.target.value)}
            rows={2}
            className="w-full border border-blue-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <div className="flex gap-3">
            <button
              onClick={doVerify}
              disabled={loading}
              className="flex-1 py-2.5 bg-emerald-600 text-white text-sm font-medium rounded-lg hover:bg-emerald-700 disabled:opacity-40 transition-colors"
            >
              Verify & Activate
            </button>
            <button
              onClick={() => setShowReject((v) => !v)}
              className="px-4 py-2.5 bg-white border border-red-200 text-red-600 text-sm font-medium rounded-lg hover:bg-red-50 transition-colors"
            >
              Reject
            </button>
          </div>
          {showReject && (
            <div className="space-y-2">
              <textarea
                placeholder="Rejection reason (required)"
                value={rejectionReason}
                onChange={(e) => setRejectionReason(e.target.value)}
                rows={2}
                className="w-full border border-red-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-red-400"
              />
              <button
                onClick={doReject}
                disabled={loading || !rejectionReason.trim()}
                className="w-full py-2 bg-red-600 text-white text-sm font-medium rounded-lg hover:bg-red-700 disabled:opacity-40 transition-colors"
              >
                Confirm Rejection
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Summary Cards ────────────────────────────────────────────────────────────

function SummaryCard({
  label,
  value,
  sub,
  icon: Icon,
  accent,
}: {
  label: string;
  value: string;
  sub?: string;
  icon: React.ComponentType<{ className?: string }>;
  accent?: string;
}) {
  return (
    <div className="bg-slate-800 rounded-xl p-4 border border-slate-700">
      <div className="flex items-start justify-between mb-3">
        <div className="p-1.5 bg-slate-700 rounded-lg">
          <Icon className={cn("h-4 w-4", accent ?? "text-slate-300")} />
        </div>
      </div>
      <div className="text-xs text-slate-400 mb-1">{label}</div>
      <div className={cn("text-sm font-semibold", accent ?? "text-white")}>{value}</div>
      {sub && <div className="text-xs text-slate-500 mt-1">{sub}</div>}
    </div>
  );
}

// ─── Overview Tab ─────────────────────────────────────────────────────────────

function OverviewTab({ record, health }: { record: CertificationRecord; health: string }) {
  const nextDeadline = record.certificationStatus === "CONDITIONAL_L2_C3PAO"
    ? record.closeoutDeadline
    : record.nextAffirmationDue;
  const nextDeadlineLabel = record.certificationStatus === "CONDITIONAL_L2_C3PAO"
    ? "Closeout Deadline"
    : "Next Affirmation";

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-3 gap-4">
        <SummaryCard label="CMMC Status" value={statusLabel(record.certificationStatus)} icon={Award}
          accent={record.certificationStatus === "FINAL_L2_C3PAO" ? "text-emerald-400" : "text-amber-400"} />
        <SummaryCard label="CMMC UID" value={record.cmmcUid} icon={Hash} accent="text-blue-400" />
        <SummaryCard label="C3PAO" value={record.c3paoName} icon={Building2} />
        <SummaryCard label="Status Date" value={fmtDate(record.cmmcStatusDate)} icon={Calendar} />
        <SummaryCard label={nextDeadlineLabel} value={fmtDate(nextDeadline)} sub={countdownLabel(nextDeadline)} icon={Clock}
          accent={daysUntil(nextDeadline) !== null && daysUntil(nextDeadline)! < 30 ? "text-amber-400" : "text-slate-300"} />
        <SummaryCard label="Status Valid Through"
          value={record.statusValidThrough ? fmtDate(record.statusValidThrough) : "Per government records"}
          sub={record.statusValidThrough ? countdownLabel(record.statusValidThrough) : undefined}
          icon={CheckCircle2}
          accent={record.certificationStatus === "FINAL_L2_C3PAO" ? "text-emerald-400" : "text-slate-400"} />
        <SummaryCard label="Certified Scope" value={record.assessmentScopeName} icon={Layers} />
        <SummaryCard label="Sustainment Health" value={health} icon={Activity} accent={healthColor(health) as any} />
        <SummaryCard label="Next Assessment" value={record.statusValidThrough ? fmtDate(record.statusValidThrough) : "—"} sub="3-year cycle" icon={RotateCcw} />
      </div>

      {/* Assessment record detail */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 bg-slate-50">
          <div className="font-semibold text-sm text-slate-800">Assessment Record</div>
        </div>
        <div className="p-5 grid grid-cols-2 gap-4 text-sm">
          {[
            { label: "Assessment Level", value: record.assessmentLevel },
            { label: "Assessment Unique ID", value: record.assessmentUniqueId },
            { label: "Assessment Start Date", value: fmtDate(record.assessmentStartDate) },
            { label: "Assessment Completion Date", value: fmtDate(record.assessmentCompletionDate) },
            { label: "CAGE Codes", value: record.cageCodes.join(", ") || "—" },
            { label: "SSP Title", value: record.sspTitle },
            { label: "SSP Version", value: record.sspVersion },
            { label: "SSP Date", value: fmtDate(record.sspDate) },
            { label: "Affirming Official", value: record.affirmingOfficial },
            { label: "Internal Certification Owner", value: record.internalCertificationOwner },
          ].map((row) => (
            <div key={row.label}>
              <div className="text-xs text-slate-500 mb-0.5">{row.label}</div>
              <div className="text-slate-800 font-medium">{row.value}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Disclaimer */}
      <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 flex gap-3">
        <Info className="h-4 w-4 text-slate-400 shrink-0 mt-0.5" />
        <p className="text-xs text-slate-500">
          Control HUB displays the certification information recorded and verified by the organization. Official status remains governed by the applicable government systems, assessment records, and contractual requirements. Recorded Status Validity is subject to continuing compliance, current affirmation, official government records, and contract requirements.
        </p>
      </div>
    </div>
  );
}

// ─── Official Records Tab ─────────────────────────────────────────────────────

function OfficialRecordsTab({ canEdit }: { canEdit: boolean }) {
  const { activeOrg } = useOrg();
  const { toast } = useToast();
  const [records, setRecords] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ title: "", recordType: "", description: "", effectiveDate: "" });

  const RECORD_TYPES = [
    "CMMC Assessment Findings Report",
    "CMMC Status Confirmation",
    "SPRS Verification",
    "Certification Record",
    "CMMC UID Record",
    "Final Assessment Scope",
    "SSP Used for Assessment",
    "Artifact Hash Manifest",
    "Conditional POA&M",
    "POA&M Closeout Assessment",
    "Annual Affirmation",
    "Assessment Correspondence",
    "Other Official Record",
  ];

  useEffect(() => {
    async function load() {
      const token = localStorage.getItem("auth_token");
      const r = await fetch("/api/certification/official-records", {
        headers: { Authorization: `Bearer ${token}`, "X-Organization-ID": activeOrg!.id },
      });
      if (r.ok) setRecords(await r.json());
      setLoading(false);
    }
    if (activeOrg) load();
  }, [activeOrg]);

  async function addRecord() {
    const token = localStorage.getItem("auth_token");
    const r = await fetch("/api/certification/official-records", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, "X-Organization-ID": activeOrg!.id },
      body: JSON.stringify(form),
    });
    if (r.ok) {
      const newRec = await r.json();
      setRecords((prev) => [{ id: newRec.id, ...form, status: "active", uploadedAt: new Date().toISOString() }, ...prev]);
      setForm({ title: "", recordType: "", description: "", effectiveDate: "" });
      setShowAdd(false);
      toast({ title: "Record added" });
    } else {
      const d = await r.json();
      toast({ title: "Error", description: d.error, variant: "destructive" });
    }
  }

  const inputClass = "w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500";
  const labelClass = "block text-xs font-medium text-slate-600 mb-1";

  if (loading) return <div className="text-center py-12 text-sm text-slate-400">Loading records…</div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="text-sm text-slate-500">{records.length} official record{records.length !== 1 ? "s" : ""}</div>
        {canEdit && (
          <button onClick={() => setShowAdd(true)} className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors">
            <Plus className="h-4 w-4" />
            Add Record
          </button>
        )}
      </div>

      {showAdd && (
        <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-3">
          <h4 className="text-sm font-semibold text-slate-800">Add Official Record</h4>
          <div>
            <label className={labelClass}>Title *</label>
            <input className={inputClass} value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} />
          </div>
          <div>
            <label className={labelClass}>Record Type *</label>
            <select className={inputClass} value={form.recordType} onChange={(e) => setForm((f) => ({ ...f, recordType: e.target.value }))}>
              <option value="">Select type…</option>
              {RECORD_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div>
            <label className={labelClass}>Description</label>
            <textarea className={inputClass} rows={2} value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} />
          </div>
          <div>
            <label className={labelClass}>Effective Date</label>
            <input type="date" className={inputClass} value={form.effectiveDate} onChange={(e) => setForm((f) => ({ ...f, effectiveDate: e.target.value }))} />
          </div>
          <div className="flex gap-2 justify-end">
            <button onClick={() => setShowAdd(false)} className="px-3 py-1.5 text-sm text-slate-600">Cancel</button>
            <button onClick={addRecord} disabled={!form.title || !form.recordType} className="px-4 py-1.5 bg-blue-600 text-white text-sm rounded-lg disabled:opacity-40">Add</button>
          </div>
        </div>
      )}

      {records.length === 0 ? (
        <div className="text-center py-12 bg-slate-50 rounded-xl border border-slate-200">
          <FileText className="h-10 w-10 text-slate-300 mx-auto mb-3" />
          <div className="text-sm text-slate-500">No official records yet.</div>
          <div className="text-xs text-slate-400 mt-1">Upload certification findings, status confirmations, and other official records.</div>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="text-left px-4 py-3 text-xs font-medium text-slate-500">Title</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-slate-500">Type</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-slate-500">Status</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-slate-500">Uploaded</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {records.map((r) => (
                <tr key={r.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3 font-medium text-slate-800">{r.title}</td>
                  <td className="px-4 py-3 text-slate-500">{r.recordType}</td>
                  <td className="px-4 py-3">
                    <span className={cn("text-xs px-2 py-1 rounded-full font-medium border",
                      r.status === "active" ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-slate-100 text-slate-500 border-slate-200")}>
                      {r.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-500">{fmtDate(r.uploadedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─── Affirmations Tab ─────────────────────────────────────────────────────────

function AffirmationsTab({ record, canEdit }: { record: CertificationRecord; canEdit: boolean }) {
  const { activeOrg } = useOrg();
  const { toast } = useToast();
  const [affirmations, setAffirmations] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ dueDate: "", affirmingOfficial: "", status: "Not Started", notes: "" });

  const AFFIRMATION_STATUSES = ["Not Started", "In Preparation", "Ready for Signature", "Submitted", "Confirmed", "Overdue", "Not Required"];

  useEffect(() => {
    async function load() {
      const token = localStorage.getItem("auth_token");
      const r = await fetch("/api/certification/affirmations", {
        headers: { Authorization: `Bearer ${token}`, "X-Organization-ID": activeOrg!.id },
      });
      if (r.ok) setAffirmations(await r.json());
      setLoading(false);
    }
    if (activeOrg) load();
  }, [activeOrg]);

  async function addAffirmation() {
    const token = localStorage.getItem("auth_token");
    const r = await fetch("/api/certification/affirmations", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, "X-Organization-ID": activeOrg!.id },
      body: JSON.stringify({ ...form, affirmationNumber: affirmations.length + 1 }),
    });
    if (r.ok) {
      const { id } = await r.json();
      setAffirmations((prev) => [...prev, { ...form, id, affirmationNumber: prev.length + 1 }]);
      setShowAdd(false);
      toast({ title: "Affirmation added" });
    }
  }

  const inputClass = "w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500";

  const statusColor = (s: string) => {
    if (s === "Confirmed" || s === "Submitted") return "bg-emerald-50 text-emerald-700 border-emerald-200";
    if (s === "Overdue") return "bg-red-50 text-red-700 border-red-200";
    if (s === "Ready for Signature") return "bg-blue-50 text-blue-700 border-blue-200";
    return "bg-slate-50 text-slate-600 border-slate-200";
  };

  if (loading) return <div className="text-center py-12 text-sm text-slate-400">Loading…</div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-sm font-medium text-slate-700">Annual Affirmations</div>
          <div className="text-xs text-slate-500 mt-0.5">Next due: {fmtDate(record.nextAffirmationDue)}</div>
        </div>
        {canEdit && (
          <button onClick={() => setShowAdd(true)} className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700">
            <Plus className="h-4 w-4" /> Add Affirmation
          </button>
        )}
      </div>

      {showAdd && (
        <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-3">
          <h4 className="text-sm font-semibold text-slate-800">Add Affirmation #{affirmations.length + 1}</h4>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Due Date *</label>
              <input type="date" className={inputClass} value={form.dueDate} onChange={(e) => setForm((f) => ({ ...f, dueDate: e.target.value }))} />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Status</label>
              <select className={inputClass} value={form.status} onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))}>
                {AFFIRMATION_STATUSES.map((s) => <option key={s}>{s}</option>)}
              </select>
            </div>
            <div className="col-span-2">
              <label className="block text-xs font-medium text-slate-600 mb-1">Affirming Official</label>
              <input className={inputClass} value={form.affirmingOfficial} onChange={(e) => setForm((f) => ({ ...f, affirmingOfficial: e.target.value }))} />
            </div>
          </div>
          <div className="flex gap-2 justify-end">
            <button onClick={() => setShowAdd(false)} className="px-3 py-1.5 text-sm text-slate-600">Cancel</button>
            <button onClick={addAffirmation} disabled={!form.dueDate} className="px-4 py-1.5 bg-blue-600 text-white text-sm rounded-lg disabled:opacity-40">Add</button>
          </div>
        </div>
      )}

      {affirmations.length === 0 ? (
        <div className="text-center py-12 bg-slate-50 rounded-xl border border-slate-200">
          <Calendar className="h-10 w-10 text-slate-300 mx-auto mb-3" />
          <div className="text-sm text-slate-500">No affirmations tracked yet.</div>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="text-left px-4 py-3 text-xs font-medium text-slate-500">#</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-slate-500">Due Date</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-slate-500">Status</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-slate-500">Affirming Official</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {affirmations.map((a) => (
                <tr key={a.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3 text-slate-500">{a.affirmationNumber}</td>
                  <td className="px-4 py-3 font-medium text-slate-800">{fmtDate(a.dueDate)}</td>
                  <td className="px-4 py-3">
                    <span className={cn("text-xs px-2 py-1 rounded-full border font-medium", statusColor(a.status))}>{a.status}</span>
                  </td>
                  <td className="px-4 py-3 text-slate-600">{a.affirmingOfficial || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─── Change Impact Tab ─────────────────────────────────────────────────────────

function ChangeImpactTab({ canEdit }: { canEdit: boolean }) {
  const { activeOrg } = useOrg();
  const { toast } = useToast();
  const [changes, setChanges] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ changeTitle: "", changeDate: "", description: "" });

  const DECISIONS = [
    "No Certification Impact",
    "Documentation Update Required",
    "Scope Review Required",
    "Material Change Review Required",
    "External Clarification Required",
    "Potential Reassessment Required",
  ];

  useEffect(() => {
    async function load() {
      const token = localStorage.getItem("auth_token");
      const r = await fetch("/api/certification/changes", {
        headers: { Authorization: `Bearer ${token}`, "X-Organization-ID": activeOrg!.id },
      });
      if (r.ok) setChanges(await r.json());
      setLoading(false);
    }
    if (activeOrg) load();
  }, [activeOrg]);

  async function addChange() {
    const token = localStorage.getItem("auth_token");
    const r = await fetch("/api/certification/changes", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, "X-Organization-ID": activeOrg!.id },
      body: JSON.stringify(form),
    });
    if (r.ok) {
      const { id } = await r.json();
      setChanges((prev) => [{ id, ...form, status: "open", createdAt: new Date().toISOString() }, ...prev]);
      setShowAdd(false);
      setForm({ changeTitle: "", changeDate: "", description: "" });
      toast({ title: "Change impact recorded" });
    }
  }

  const inputClass = "w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500";

  const decisionColor = (d: string) => {
    if (!d) return "bg-slate-50 text-slate-500 border-slate-200";
    if (d === "No Certification Impact") return "bg-emerald-50 text-emerald-700 border-emerald-200";
    if (d.includes("Reassessment")) return "bg-red-50 text-red-700 border-red-200";
    if (d.includes("Material")) return "bg-orange-50 text-orange-700 border-orange-200";
    return "bg-amber-50 text-amber-700 border-amber-200";
  };

  if (loading) return <div className="text-center py-12 text-sm text-slate-400">Loading…</div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-sm font-medium text-slate-700">Change Impact Register</div>
          <div className="text-xs text-slate-500 mt-0.5">Track changes that may affect your certified scope or controls.</div>
        </div>
        {canEdit && (
          <button onClick={() => setShowAdd(true)} className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700">
            <Plus className="h-4 w-4" /> Record Change
          </button>
        )}
      </div>

      <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-800 flex gap-2">
        <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
        Changes do not automatically affect certification status. An authorized human decision is required for all impact determinations.
      </div>

      {showAdd && (
        <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-3">
          <h4 className="text-sm font-semibold">Record Change Impact</h4>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Change Title *</label>
            <input className={inputClass} value={form.changeTitle} onChange={(e) => setForm((f) => ({ ...f, changeTitle: e.target.value }))} />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Change Date *</label>
            <input type="date" className={inputClass} value={form.changeDate} onChange={(e) => setForm((f) => ({ ...f, changeDate: e.target.value }))} />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Description *</label>
            <textarea className={inputClass} rows={2} value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} />
          </div>
          <div className="flex gap-2 justify-end">
            <button onClick={() => setShowAdd(false)} className="px-3 py-1.5 text-sm text-slate-600">Cancel</button>
            <button onClick={addChange} disabled={!form.changeTitle || !form.changeDate || !form.description} className="px-4 py-1.5 bg-blue-600 text-white text-sm rounded-lg disabled:opacity-40">Add</button>
          </div>
        </div>
      )}

      {changes.length === 0 ? (
        <div className="text-center py-12 bg-slate-50 rounded-xl border border-slate-200">
          <GitBranch className="h-10 w-10 text-slate-300 mx-auto mb-3" />
          <div className="text-sm text-slate-500">No change impact records yet.</div>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="text-left px-4 py-3 text-xs font-medium text-slate-500">Change</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-slate-500">Date</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-slate-500">Decision</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-slate-500">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {changes.map((c) => (
                <tr key={c.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3">
                    <div className="font-medium text-slate-800">{c.changeTitle}</div>
                    <div className="text-xs text-slate-500 truncate max-w-xs">{c.description}</div>
                  </td>
                  <td className="px-4 py-3 text-slate-600">{fmtDate(c.changeDate)}</td>
                  <td className="px-4 py-3">
                    <span className={cn("text-xs px-2 py-1 rounded-full border font-medium", decisionColor(c.impactDecision))}>
                      {c.impactDecision || "Pending Decision"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-500 capitalize">{c.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─── POA&M Closeout Tab ───────────────────────────────────────────────────────

function PoamCloseoutTab({ record, canEdit }: { record: CertificationRecord; canEdit: boolean }) {
  const { activeOrg } = useOrg();
  const { toast } = useToast();
  const [data, setData] = useState<{ items: any[]; certificationRecord: CertificationRecord | null }>({ items: [], certificationRecord: null });
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ title: "", description: "", dueDate: "", milestone: "", evidenceRequired: "" });

  const closeoutDeadline = record.closeoutDeadline;
  const daysLeft = daysUntil(closeoutDeadline);

  useEffect(() => {
    async function load() {
      const token = localStorage.getItem("auth_token");
      const r = await fetch("/api/certification/poam-closeout", {
        headers: { Authorization: `Bearer ${token}`, "X-Organization-ID": activeOrg!.id },
      });
      if (r.ok) setData(await r.json());
      setLoading(false);
    }
    if (activeOrg) load();
  }, [activeOrg]);

  async function addItem() {
    const token = localStorage.getItem("auth_token");
    const r = await fetch("/api/certification/poam-closeout", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, "X-Organization-ID": activeOrg!.id },
      body: JSON.stringify(form),
    });
    if (r.ok) {
      const { id } = await r.json();
      setData((prev) => ({ ...prev, items: [...prev.items, { id, ...form, status: "Open" }] }));
      setShowAdd(false);
      toast({ title: "Item added" });
    }
  }

  const inputClass = "w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500";
  const STATUSES = ["Open", "In Progress", "Evidence Ready", "Ready for Closeout Assessment", "Closed", "Failed Closeout", "Expired"];
  const statusColor = (s: string) => {
    if (s === "Closed") return "bg-emerald-50 text-emerald-700 border-emerald-200";
    if (s === "Failed Closeout" || s === "Expired") return "bg-red-50 text-red-700 border-red-200";
    if (s === "Ready for Closeout Assessment") return "bg-blue-50 text-blue-700 border-blue-200";
    if (s === "Evidence Ready") return "bg-purple-50 text-purple-700 border-purple-200";
    return "bg-slate-50 text-slate-600 border-slate-200";
  };

  if (loading) return <div className="text-center py-12 text-sm text-slate-400">Loading…</div>;

  return (
    <div className="space-y-4">
      {/* Deadline cards */}
      <div className="grid grid-cols-3 gap-4">
        <div className={cn("rounded-xl p-4 border", daysLeft !== null && daysLeft < 0 ? "bg-red-50 border-red-200" : daysLeft !== null && daysLeft < 30 ? "bg-amber-50 border-amber-200" : "bg-slate-50 border-slate-200")}>
          <div className="text-xs text-slate-500 mb-1">Conditional Status Date</div>
          <div className="font-semibold text-slate-800">{fmtDate(record.cmmcStatusDate)}</div>
        </div>
        <div className={cn("rounded-xl p-4 border", daysLeft !== null && daysLeft < 0 ? "bg-red-50 border-red-200" : daysLeft !== null && daysLeft < 30 ? "bg-amber-50 border-amber-200" : "bg-slate-50 border-slate-200")}>
          <div className="text-xs text-slate-500 mb-1">180-Day Closeout Deadline</div>
          <div className="font-semibold text-slate-800">{fmtDate(closeoutDeadline)}</div>
        </div>
        <div className={cn("rounded-xl p-4 border", daysLeft !== null && daysLeft < 0 ? "bg-red-50 border-red-200" : daysLeft !== null && daysLeft < 30 ? "bg-amber-50 border-amber-200" : "bg-slate-50 border-slate-200")}>
          <div className="text-xs text-slate-500 mb-1">Days Remaining</div>
          <div className={cn("font-semibold", daysLeft !== null && daysLeft < 0 ? "text-red-600" : "text-slate-800")}>{countdownLabel(closeoutDeadline)}</div>
        </div>
      </div>

      <div className="flex items-center justify-between">
        <div className="text-sm font-medium text-slate-700">{data.items.length} POA&M Item{data.items.length !== 1 ? "s" : ""}</div>
        {canEdit && (
          <button onClick={() => setShowAdd(true)} className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700">
            <Plus className="h-4 w-4" /> Add Item
          </button>
        )}
      </div>

      {showAdd && (
        <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-3">
          <h4 className="text-sm font-semibold">Add POA&M Closeout Item</h4>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Title *</label>
            <input className={inputClass} value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Description</label>
            <textarea className={inputClass} rows={2} value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Due Date</label>
              <input type="date" className={inputClass} value={form.dueDate} onChange={(e) => setForm((f) => ({ ...f, dueDate: e.target.value }))} />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Milestone</label>
              <input className={inputClass} value={form.milestone} onChange={(e) => setForm((f) => ({ ...f, milestone: e.target.value }))} />
            </div>
          </div>
          <div className="flex gap-2 justify-end">
            <button onClick={() => setShowAdd(false)} className="px-3 py-1.5 text-sm text-slate-600">Cancel</button>
            <button onClick={addItem} disabled={!form.title} className="px-4 py-1.5 bg-blue-600 text-white text-sm rounded-lg disabled:opacity-40">Add</button>
          </div>
        </div>
      )}

      {data.items.length === 0 ? (
        <div className="text-center py-12 bg-slate-50 rounded-xl border border-slate-200">
          <AlertTriangle className="h-10 w-10 text-slate-300 mx-auto mb-3" />
          <div className="text-sm text-slate-500">No POA&M closeout items yet.</div>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="text-left px-4 py-3 text-xs font-medium text-slate-500">Item</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-slate-500">Due</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-slate-500">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {data.items.map((item) => (
                <tr key={item.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3">
                    <div className="font-medium text-slate-800">{item.title}</div>
                    {item.milestone && <div className="text-xs text-slate-500">{item.milestone}</div>}
                  </td>
                  <td className="px-4 py-3 text-slate-600">{fmtDate(item.dueDate)}</td>
                  <td className="px-4 py-3">
                    <span className={cn("text-xs px-2 py-1 rounded-full border font-medium", statusColor(item.status))}>{item.status}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─── Recertification Tab ──────────────────────────────────────────────────────

function RecertificationTab({ record }: { record: CertificationRecord }) {
  const { activeOrg } = useOrg();
  const [milestones, setMilestones] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const token = localStorage.getItem("auth_token");
      const r = await fetch("/api/certification/recertification", {
        headers: { Authorization: `Bearer ${token}`, "X-Organization-ID": activeOrg!.id },
      });
      if (r.ok) setMilestones(await r.json());
      setLoading(false);
    }
    if (activeOrg) load();
  }, [activeOrg]);

  const statusColor = (s: string) => {
    if (s === "completed") return "bg-emerald-50 text-emerald-700 border-emerald-200";
    if (s === "in_progress") return "bg-blue-50 text-blue-700 border-blue-200";
    if (s === "skipped") return "bg-slate-50 text-slate-400 border-slate-200";
    return "bg-slate-50 text-slate-600 border-slate-200";
  };

  if (loading) return <div className="text-center py-12 text-sm text-slate-400">Loading…</div>;

  return (
    <div className="space-y-4">
      <div className="text-sm text-slate-500">
        Expiration: <span className="font-medium text-slate-700">{fmtDate(record.statusValidThrough)}</span>
        {record.statusValidThrough && <span className="ml-2 text-slate-400">({countdownLabel(record.statusValidThrough)})</span>}
      </div>

      {milestones.length === 0 ? (
        <div className="text-center py-12 bg-slate-50 rounded-xl border border-slate-200">
          <RotateCcw className="h-10 w-10 text-slate-300 mx-auto mb-3" />
          <div className="text-sm text-slate-500">No recertification milestones available yet.</div>
          <div className="text-xs text-slate-400 mt-1">Milestones are auto-generated for Final Level 2 certifications with a 3-year expiry.</div>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="text-left px-4 py-3 text-xs font-medium text-slate-500">Milestone</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-slate-500">Due Date</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-slate-500">Status</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-slate-500">Countdown</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {milestones.map((m) => (
                <tr key={m.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3 font-medium text-slate-800">{m.milestoneName}</td>
                  <td className="px-4 py-3 text-slate-600">{fmtDate(m.dueDate)}</td>
                  <td className="px-4 py-3">
                    <span className={cn("text-xs px-2 py-1 rounded-full border font-medium", statusColor(m.status))}>{m.status.replace("_", " ")}</span>
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-500">{m.dueDate ? countdownLabel(m.dueDate) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─── History Tab ──────────────────────────────────────────────────────────────

function HistoryTab() {
  const { activeOrg } = useOrg();
  const [history, setHistory] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const token = localStorage.getItem("auth_token");
      const r = await fetch("/api/certification/history", {
        headers: { Authorization: `Bearer ${token}`, "X-Organization-ID": activeOrg!.id },
      });
      if (r.ok) setHistory(await r.json());
      setLoading(false);
    }
    if (activeOrg) load();
  }, [activeOrg]);

  const eventIcon = (t: string) => {
    if (t.includes("verified")) return <CheckCircle2 className="h-4 w-4 text-emerald-500" />;
    if (t.includes("rejected")) return <XCircle className="h-4 w-4 text-red-500" />;
    if (t.includes("submitted")) return <FileText className="h-4 w-4 text-blue-500" />;
    if (t.includes("expired")) return <Clock className="h-4 w-4 text-red-400" />;
    return <History className="h-4 w-4 text-slate-400" />;
  };

  if (loading) return <div className="text-center py-12 text-sm text-slate-400">Loading…</div>;

  return (
    <div className="space-y-3">
      {history.length === 0 ? (
        <div className="text-center py-12 bg-slate-50 rounded-xl border border-slate-200">
          <History className="h-10 w-10 text-slate-300 mx-auto mb-3" />
          <div className="text-sm text-slate-500">No history events yet.</div>
        </div>
      ) : (
        <div className="relative">
          <div className="absolute left-6 top-0 bottom-0 w-px bg-slate-200" />
          <div className="space-y-4">
            {history.map((event) => (
              <div key={event.id} className="flex gap-4 relative">
                <div className="w-12 h-12 rounded-full bg-white border border-slate-200 flex items-center justify-center z-10 shrink-0">
                  {eventIcon(event.eventType)}
                </div>
                <div className="flex-1 bg-white border border-slate-200 rounded-xl p-4 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <div className="font-medium text-sm text-slate-800">{event.eventTitle}</div>
                    <div className="text-xs text-slate-400 shrink-0">{fmtDate(event.occurredAt)}</div>
                  </div>
                  {event.description && <div className="text-xs text-slate-600 mt-1">{event.description}</div>}
                  {event.performedByName && <div className="text-xs text-slate-400 mt-1">by {event.performedByName}</div>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Sustainment Tab ──────────────────────────────────────────────────────────

function SustainmentTab() {
  const { activeOrg } = useOrg();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const token = localStorage.getItem("auth_token");
      const r = await fetch("/api/certification/sustainment", {
        headers: { Authorization: `Bearer ${token}`, "X-Organization-ID": activeOrg!.id },
      });
      if (r.ok) setData(await r.json());
      setLoading(false);
    }
    if (activeOrg) load();
  }, [activeOrg]);

  if (loading) return <div className="text-center py-12 text-sm text-slate-400">Loading…</div>;
  if (!data) return null;

  const items = [
    { label: "Monitoring Items Overdue", value: data.monitoringOverdue, href: "/monitoring", urgent: data.monitoringOverdue > 0, icon: Activity },
    { label: "Evidence Pending Review", value: data.evidencePendingReview, href: "/evidence", urgent: data.evidencePendingReview > 0, icon: FileText },
    { label: "Open POA&Ms", value: data.openPoams, href: "/poams", urgent: data.openPoams > 0, icon: AlertTriangle },
    { label: "Open Change Impact Items", value: data.openChanges, href: "/certification", urgent: data.openChanges > 0, icon: GitBranch },
  ];

  return (
    <div className="space-y-5">
      <p className="text-sm text-slate-500">Cross-module sustainment indicators. Links go to authoritative records — no data is duplicated here.</p>

      <div className="grid grid-cols-2 gap-4">
        {items.map((item) => (
          <Link key={item.label} href={item.href}>
            <div className={cn(
              "rounded-xl border p-4 flex items-center gap-4 hover:shadow-sm transition-shadow cursor-pointer",
              item.urgent ? "bg-red-50 border-red-200" : "bg-white border-slate-200"
            )}>
              <div className={cn("p-2 rounded-lg", item.urgent ? "bg-red-100" : "bg-slate-100")}>
                <item.icon className={cn("h-5 w-5", item.urgent ? "text-red-500" : "text-slate-500")} />
              </div>
              <div>
                <div className="text-2xl font-bold text-slate-800">{item.value}</div>
                <div className="text-xs text-slate-500">{item.label}</div>
              </div>
              <ChevronRight className="h-4 w-4 text-slate-400 ml-auto" />
            </div>
          </Link>
        ))}
      </div>

      {data.nextAffirmation && (
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <div className="text-xs font-medium text-slate-500 mb-2">Next Annual Affirmation</div>
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm font-medium text-slate-800">Affirmation #{data.nextAffirmation.affirmationNumber}</div>
              <div className="text-xs text-slate-500">{fmtDate(data.nextAffirmation.dueDate)}</div>
            </div>
            <span className="text-xs px-2 py-1 rounded-full bg-slate-100 text-slate-600 border border-slate-200">{data.nextAffirmation.status}</span>
          </div>
        </div>
      )}

      {data.nextMilestone && (
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <div className="text-xs font-medium text-slate-500 mb-2">Next Recertification Milestone</div>
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm font-medium text-slate-800">{data.nextMilestone.milestoneName}</div>
              <div className="text-xs text-slate-500">{fmtDate(data.nextMilestone.dueDate)}</div>
            </div>
            <span className="text-xs text-slate-500">{countdownLabel(data.nextMilestone.dueDate)}</span>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Scope Tab (placeholder with instruction) ────────────────────────────────

function ScopeTab({ record, canEdit }: { record: CertificationRecord; canEdit: boolean }) {
  const { activeOrg } = useOrg();
  const { toast } = useToast();
  const [scope, setScope] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ scopeName: "", cageCodes: "", sspVersion: "", scopeNotes: "" });

  useEffect(() => {
    async function load() {
      const token = localStorage.getItem("auth_token");
      const r = await fetch("/api/certification/scope", {
        headers: { Authorization: `Bearer ${token}`, "X-Organization-ID": activeOrg!.id },
      });
      if (r.ok) setScope(await r.json());
      setLoading(false);
    }
    if (activeOrg) load();
  }, [activeOrg]);

  async function createScope() {
    const token = localStorage.getItem("auth_token");
    const r = await fetch("/api/certification/scope", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, "X-Organization-ID": activeOrg!.id },
      body: JSON.stringify({ ...form, cageCodes: form.cageCodes.split(",").map((s) => s.trim()).filter(Boolean) }),
    });
    if (r.ok) {
      toast({ title: "Scope snapshot created" });
      const token2 = localStorage.getItem("auth_token");
      const r2 = await fetch("/api/certification/scope", { headers: { Authorization: `Bearer ${token2}`, "X-Organization-ID": activeOrg!.id } });
      if (r2.ok) setScope(await r2.json());
      setShowCreate(false);
    }
  }

  const inputClass = "w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500";

  if (loading) return <div className="text-center py-12 text-sm text-slate-400">Loading…</div>;

  return (
    <div className="space-y-4">
      {!scope ? (
        <div className="text-center py-12 bg-slate-50 rounded-xl border border-slate-200">
          <Layers className="h-10 w-10 text-slate-300 mx-auto mb-3" />
          <div className="text-sm font-medium text-slate-600 mb-1">No Scope Snapshot</div>
          <div className="text-xs text-slate-400 mb-4">Create a point-in-time snapshot of your certified assessment scope.</div>
          {canEdit && (
            <button onClick={() => setShowCreate(true)} className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700">
              Create Scope Snapshot
            </button>
          )}
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100 bg-slate-50 flex items-center justify-between">
            <div>
              <div className="font-semibold text-sm text-slate-800">{scope.scopeName}</div>
              <div className="text-xs text-slate-500">Snapshot recorded {fmtDate(scope.createdAt)}</div>
            </div>
            {canEdit && <button onClick={() => setShowCreate(true)} className="text-xs text-blue-600 hover:text-blue-800">Update Snapshot</button>}
          </div>
          <div className="p-5 grid grid-cols-2 gap-4 text-sm">
            <div>
              <div className="text-xs text-slate-500 mb-1">CAGE Codes</div>
              <div className="text-slate-800">{scope.cageCodes?.join(", ") || "—"}</div>
            </div>
            <div>
              <div className="text-xs text-slate-500 mb-1">SSP Version</div>
              <div className="text-slate-800">{scope.sspVersion || "—"}</div>
            </div>
            {scope.scopeNotes && (
              <div className="col-span-2">
                <div className="text-xs text-slate-500 mb-1">Notes</div>
                <div className="text-slate-800">{scope.scopeNotes}</div>
              </div>
            )}
          </div>
        </div>
      )}

      {showCreate && (
        <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-3">
          <h4 className="text-sm font-semibold">{scope ? "Update Scope Snapshot" : "Create Scope Snapshot"}</h4>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Scope Name *</label>
            <input className={inputClass} value={form.scopeName} onChange={(e) => setForm((f) => ({ ...f, scopeName: e.target.value }))} />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">CAGE Codes (comma-separated)</label>
            <input className={inputClass} value={form.cageCodes} onChange={(e) => setForm((f) => ({ ...f, cageCodes: e.target.value }))} />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">SSP Version</label>
            <input className={inputClass} value={form.sspVersion} onChange={(e) => setForm((f) => ({ ...f, sspVersion: e.target.value }))} />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Scope Notes</label>
            <textarea className={inputClass} rows={2} value={form.scopeNotes} onChange={(e) => setForm((f) => ({ ...f, scopeNotes: e.target.value }))} />
          </div>
          <div className="flex gap-2 justify-end">
            <button onClick={() => setShowCreate(false)} className="px-3 py-1.5 text-sm text-slate-600">Cancel</button>
            <button onClick={createScope} disabled={!form.scopeName} className="px-4 py-1.5 bg-blue-600 text-white text-sm rounded-lg disabled:opacity-40">Save</button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

type Tab = "overview" | "records" | "scope" | "affirmations" | "sustainment" | "changes" | "poam-closeout" | "recertification" | "history";

export default function Certification() {
  const { user } = useAuth();
  const { activeOrg, refreshOrgs } = useOrg();
  const { isDemoMode } = useDemoMode();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<StatusResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<Tab>("overview");
  const [showWizard, setShowWizard] = useState(false);

  const orgRole = activeOrg?.role ?? "";
  const userRole = user?.role ?? "";
  const canEdit = userRole === "admin" || orgRole === "org_admin";

  async function loadStatus() {
    if (!activeOrg) return;
    const token = localStorage.getItem("auth_token");
    const r = await fetch("/api/certification/status", {
      headers: { Authorization: `Bearer ${token}`, "X-Organization-ID": activeOrg.id },
    });
    if (r.ok) {
      setStatus(await r.json());
    }
    setLoading(false);
  }

  useEffect(() => {
    loadStatus();
  }, [activeOrg]);

  if (isDemoMode) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <Shield className="h-10 w-10 text-slate-300 mx-auto mb-3" />
          <div className="text-slate-500 text-sm">Certification module not available in demo mode.</div>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
      </div>
    );
  }

  const certState = status?.certificationModuleState ?? "NOT_AVAILABLE";
  const record = status?.certificationRecord ?? null;
  const health = status?.sustainmentHealth ?? "On Track";

  // Not Available — show activation prompt for authorized users
  if (certState === "NOT_AVAILABLE") {
    const userCanActivate = canActivate(orgRole, userRole);
    const isL1Only = activeOrg?.cmmcTargetLevel === "L1";

    return (
      <div className="max-w-2xl mx-auto py-16">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-slate-100 rounded-2xl mb-4">
            <Award className="h-8 w-8 text-slate-400" />
          </div>
          <h1 className="text-2xl font-bold text-slate-900 mb-2">CMMC Certification &amp; Sustainment</h1>
          <p className="text-slate-500 text-sm">
            This module becomes available after {activeOrg?.name ?? "your organization"} records an
            official Conditional or Final Level 2 (C3PAO) CMMC status.
          </p>
        </div>

        {isL1Only ? (
          <div className="bg-slate-50 rounded-2xl border border-slate-200 p-8 text-center text-sm text-slate-500">
            CMMC Level 2 C3PAO Certification is not available for organizations configured for Level 1 only.
            Add the CMMC Level 2 package in Settings to enable this module.
          </div>
        ) : userCanActivate ? (
          <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center">
            <div className="text-sm text-slate-600 mb-2">
              Use this module to record an official C3PAO certification status that has already been awarded.
              Once activated, the module preserves the assessment record, tracks annual affirmations,
              maintains the certified scope, and supports recertification planning.
            </div>
            <p className="text-xs text-slate-400 mb-6">
              Do not record a status here until it has been officially awarded by the C3PAO.
            </p>
            <button
              onClick={() => setShowWizard(true)}
              className="px-6 py-3 bg-blue-600 text-white font-medium rounded-xl hover:bg-blue-700 transition-colors"
            >
              Record C3PAO Status
            </button>
          </div>
        ) : (
          <div className="bg-slate-50 rounded-2xl border border-slate-200 p-8 text-center text-sm text-slate-500">
            Contact your organization administrator to activate the Certification module.
          </div>
        )}

        {showWizard && (
          <ActivationWizard
            onSuccess={async () => {
              setShowWizard(false);
              await refreshOrgs();
              queryClient.invalidateQueries();
              await loadStatus();
            }}
            onCancel={() => setShowWizard(false)}
          />
        )}
      </div>
    );
  }

  // Verification Pending
  if (certState === "VERIFICATION_PENDING") {
    const userCanVerify = canVerify(orgRole, userRole);
    const isGlobalAdmin = userRole === "admin";
    return (
      <div className="max-w-2xl mx-auto py-12 space-y-6">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-blue-100 rounded-xl">
            <Award className="h-6 w-6 text-blue-600" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-900">CMMC Certification &amp; Sustainment</h1>
            <div className="text-sm text-slate-500">{activeOrg?.name}</div>
          </div>
          <span className={cn("ml-auto text-xs font-medium px-3 py-1 rounded-full border", statusBadgeClass("VERIFICATION_PENDING"))}>
            Verification Pending
          </span>
        </div>

        {/* GA banner */}
        {isGlobalAdmin && (
          <div className="bg-blue-50 border border-blue-200 rounded-2xl p-4 flex items-start gap-3">
            <Info className="h-4 w-4 text-blue-600 shrink-0 mt-0.5" />
            <div className="text-sm text-blue-800">
              <span className="font-medium">Platform Global Admin:</span>{" "}
              This certification record is pending review. Use the verification panel below to
              approve it, reject it, or apply an Admin Override to activate it directly without a
              second approver.
            </div>
          </div>
        )}

        {record && (userCanVerify || record.submittedById === user?.id) ? (
          <VerificationPanel
            record={record}
            onAction={async () => {
              await refreshOrgs();
              queryClient.invalidateQueries();
              await loadStatus();
            }}
          />
        ) : (
          <div className="bg-blue-50 border border-blue-200 rounded-2xl p-6 text-sm text-blue-800">
            A certification record has been submitted and is awaiting second-person verification.
          </div>
        )}

      </div>
    );
  }

  // Active states: CONDITIONAL_L2_C3PAO, FINAL_L2_C3PAO, EXPIRED, SUSPENDED, INVALIDATED
  const TABS: { id: Tab; label: string; show?: boolean }[] = [
    { id: "overview", label: "Overview" },
    { id: "records", label: "Official Records" },
    { id: "scope", label: "Certified Scope" },
    { id: "affirmations", label: "Annual Affirmations" },
    { id: "sustainment", label: "Sustainment" },
    { id: "changes", label: "Change Impact" },
    { id: "poam-closeout", label: "POA&M Closeout", show: certState === "CONDITIONAL_L2_C3PAO" || (record?.moduleState === "CONDITIONAL_L2_C3PAO") },
    { id: "recertification", label: "Recertification" },
    { id: "history", label: "History" },
  ];

  const visibleTabs = TABS.filter((t) => t.show !== false);

  const statusDate = record?.cmmcStatusDate;
  const nextDeadline = certState === "CONDITIONAL_L2_C3PAO" ? record?.closeoutDeadline : record?.nextAffirmationDue;

  return (
    <div className="space-y-0">
      {/* Header */}
      <div className="bg-slate-900 rounded-2xl mb-6 overflow-hidden">
        <div className="px-6 py-5">
          {/* Status badges */}
          {(certState === "SUSPENDED" || certState === "INVALIDATED") && (
            <div className="mb-4 bg-red-500/20 border border-red-500/30 rounded-xl p-3 flex items-center gap-2">
              <XCircle className="h-4 w-4 text-red-400" />
              <span className="text-sm text-red-300 font-medium">
                {certState === "SUSPENDED" ? "Certification Suspended" : "Certification Invalidated"} — Module retained for historical review.
              </span>
            </div>
          )}
          {certState === "EXPIRED" && (
            <div className="mb-4 bg-red-500/20 border border-red-500/30 rounded-xl p-3 flex items-center gap-2">
              <Clock className="h-4 w-4 text-red-400" />
              <span className="text-sm text-red-300 font-medium">Certification Expired — Records retained for historical review.</span>
            </div>
          )}

          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-slate-700 rounded-xl">
                <Award className="h-6 w-6 text-blue-400" />
              </div>
              <div>
                <h1 className="text-white font-bold text-xl">CMMC Certification & Sustainment</h1>
                <div className="text-slate-400 text-sm">{activeOrg?.name}</div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className={cn("text-xs font-semibold px-3 py-1.5 rounded-full border", statusBadgeClass(certState))}>
                {statusLabel(certState)}
              </span>
              <button onClick={loadStatus} className="p-2 rounded-lg bg-slate-800 text-slate-400 hover:text-white transition-colors">
                <RefreshCw className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* Quick info bar */}
          {record && (
            <div className="mt-4 flex flex-wrap gap-4 text-xs">
              {[
                { label: "CMMC UID", value: record.cmmcUid, mono: true },
                { label: "C3PAO", value: record.c3paoName },
                { label: "Status Date", value: fmtDate(statusDate) },
                nextDeadline ? { label: certState === "CONDITIONAL_L2_C3PAO" ? "Closeout Deadline" : "Next Affirmation", value: countdownLabel(nextDeadline) } : null,
              ].filter(Boolean).map((item) => (
                <div key={item!.label} className="bg-slate-800 rounded-lg px-3 py-2">
                  <div className="text-slate-400">{item!.label}</div>
                  <div className={cn("text-white font-medium mt-0.5", item!.mono ? "font-mono" : "")}>{item!.value}</div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Tab navigation */}
        <div className="border-t border-slate-700 px-4 flex gap-1 overflow-x-auto">
          {visibleTabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                "px-4 py-3 text-sm font-medium whitespace-nowrap transition-colors border-b-2",
                activeTab === tab.id
                  ? "text-white border-blue-500"
                  : "text-slate-400 border-transparent hover:text-slate-200"
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Tab content */}
      <div>
        {record ? (
          <>
            {activeTab === "overview" && <OverviewTab record={record} health={health} />}
            {activeTab === "records" && <OfficialRecordsTab canEdit={canEdit} />}
            {activeTab === "scope" && <ScopeTab record={record} canEdit={canEdit} />}
            {activeTab === "affirmations" && <AffirmationsTab record={record} canEdit={canEdit} />}
            {activeTab === "sustainment" && <SustainmentTab />}
            {activeTab === "changes" && <ChangeImpactTab canEdit={canEdit} />}
            {activeTab === "poam-closeout" && <PoamCloseoutTab record={record} canEdit={canEdit} />}
            {activeTab === "recertification" && <RecertificationTab record={record} />}
            {activeTab === "history" && <HistoryTab />}
          </>
        ) : (
          <div className="text-center py-12 text-sm text-slate-400">
            No certification record available.
          </div>
        )}
      </div>
    </div>
  );
}
