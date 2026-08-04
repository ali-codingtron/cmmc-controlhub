import { useState, useRef } from "react";
import {
  Award,
  AlertTriangle,
  CheckCircle2,
  Upload,
  X,
  Eye,
  FileText,
  ExternalLink,
  Check,
  Info,
  Lock,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface OfficialRecordEntry {
  id: string;
  title: string;
  recordType: string;
  documentDate: string;
  description: string;
  issuedBy: string;
  confidentiality: string;
  // File staging (client-side)
  fileName?: string;
  fileSize?: number;
  fileMimeType?: string;
  previewUrl?: string;
  file?: File;
  // External reference
  isExternal: boolean;
  externalUrl: string;
  externalNotes: string;
}

interface WizardForm {
  // Step 1
  certificationStatus: string;
  cmmcStatusDate: string;
  // Step 2
  cmmcUid: string;
  c3paoName: string;
  assessmentStartDate: string;
  assessmentCompletionDate: string;
  c3paoAssessmentReference: string;
  cageCodes: string;
  assessmentScopeName: string;
  sspTitle: string;
  sspVersion: string;
  sspDate: string;
  affirmingOfficial: string;
  internalCertificationOwner: string;
  assessorNames: string;
  assessorContactInfo: string;
  contractReferences: string;
  notes: string;
  sspDateWarningConfirmed: boolean;
  // Step 3
  officialRecords: OfficialRecordEntry[];
  // Step 4
  activateConfirm: string;
}

export interface RecordCertWizardBodyProps {
  orgId: string;
  orgName: string;
  onSuccess: () => void;
  onCancel: () => void;
  existingRecord?: Record<string, any>;
}

// ─── Constants ───────────────────────────────────────────────────────────────

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

const CONFIDENTIALITY_OPTIONS = [
  { value: "internal", label: "Internal Use Only" },
  { value: "restricted", label: "Restricted" },
  { value: "cui", label: "CUI — Controlled Unclassified Information" },
  { value: "public", label: "Public" },
];

const STEP_LABELS = ["Status", "Assessment Details", "Official Records", "Review & Activate"];

function genId(): string {
  return Math.random().toString(36).slice(2, 11);
}

function fmtSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function fmtStatus(s: string): string {
  if (s === "FINAL_L2_C3PAO") return "Final Level 2 (C3PAO)";
  if (s === "CONDITIONAL_L2_C3PAO") return "Conditional Level 2 (C3PAO)";
  return s;
}

// ─── Review Section ───────────────────────────────────────────────────────────

function ReviewSection({ title, rows }: { title: string; rows: { label: string; value: string }[] }) {
  return (
    <div className="bg-slate-50 dark:bg-slate-800/50 rounded-xl p-4">
      <div className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-widest mb-3">{title}</div>
      <div className="grid grid-cols-2 gap-3">
        {rows.map((r) => (
          <div key={r.label}>
            <div className="text-xs text-slate-500 mb-0.5">{r.label}</div>
            <div className="text-sm font-medium text-slate-800 dark:text-slate-200">{r.value || "—"}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function RecordCertWizardBody({
  orgId,
  orgName,
  onSuccess,
  onCancel,
  existingRecord,
}: RecordCertWizardBodyProps) {
  const { toast } = useToast();
  const { user } = useAuth();
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [showSspWarning, setShowSspWarning] = useState(false);
  const [showExternalForm, setShowExternalForm] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [editingRecord, setEditingRecord] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [form, setFormState] = useState<WizardForm>({
    certificationStatus: existingRecord?.certificationStatus ?? "",
    cmmcStatusDate: existingRecord?.cmmcStatusDate
      ? new Date(existingRecord.cmmcStatusDate).toISOString().slice(0, 10)
      : "",
    cmmcUid: existingRecord?.cmmcUid ?? "",
    c3paoName: existingRecord?.c3paoName ?? "",
    assessmentStartDate: existingRecord?.assessmentStartDate
      ? new Date(existingRecord.assessmentStartDate).toISOString().slice(0, 10)
      : "",
    assessmentCompletionDate: existingRecord?.assessmentCompletionDate
      ? new Date(existingRecord.assessmentCompletionDate).toISOString().slice(0, 10)
      : "",
    c3paoAssessmentReference:
      existingRecord?.c3paoAssessmentReference ?? existingRecord?.assessmentUniqueId ?? "",
    cageCodes: Array.isArray(existingRecord?.cageCodes)
      ? existingRecord.cageCodes.join(", ")
      : existingRecord?.cageCodes ?? "",
    assessmentScopeName: existingRecord?.assessmentScopeName ?? "",
    sspTitle: existingRecord?.sspTitle ?? "",
    sspVersion: existingRecord?.sspVersion ?? "",
    sspDate: existingRecord?.sspDate
      ? new Date(existingRecord.sspDate).toISOString().slice(0, 10)
      : "",
    affirmingOfficial: existingRecord?.affirmingOfficial ?? "",
    internalCertificationOwner: existingRecord?.internalCertificationOwner ?? "",
    assessorNames: Array.isArray(existingRecord?.assessorNames)
      ? existingRecord.assessorNames.join(", ")
      : "",
    assessorContactInfo: existingRecord?.assessorContactInfo ?? "",
    contractReferences: Array.isArray(existingRecord?.contractReferences)
      ? existingRecord.contractReferences.join(", ")
      : "",
    notes: existingRecord?.notes ?? "",
    sspDateWarningConfirmed: false,
    officialRecords: [],
    activateConfirm: "",
  });

  const [externalForm, setExternalForm] = useState({
    title: "",
    recordType: "",
    documentDate: "",
    externalUrl: "",
    externalNotes: "",
    confidentiality: "internal",
  });

  function setField<K extends keyof WizardForm>(key: K, value: WizardForm[K]) {
    setFormState((f) => ({ ...f, [key]: value }));
  }

  function touch(field: string) {
    setTouched((t) => ({ ...t, [field]: true }));
  }

  function touchAll(fields: string[]) {
    setTouched((t) => {
      const n = { ...t };
      fields.forEach((f) => {
        n[f] = true;
      });
      return n;
    });
  }

  // ── Date ordering checks ─────────────────────────────────────────────────

  const startAfterCompletion =
    !!form.assessmentStartDate &&
    !!form.assessmentCompletionDate &&
    form.assessmentStartDate > form.assessmentCompletionDate;

  const completionAfterStatus =
    !!form.assessmentCompletionDate &&
    !!form.cmmcStatusDate &&
    form.assessmentCompletionDate > form.cmmcStatusDate;

  const sspAfterCompletion =
    !!form.sspDate &&
    !!form.assessmentCompletionDate &&
    form.sspDate > form.assessmentCompletionDate;

  // ── Validation errors ────────────────────────────────────────────────────

  const errors: Record<string, string> = {};
  if (touched.certificationStatus && !form.certificationStatus)
    errors.certificationStatus = "Please select a certification status.";
  if (touched.cmmcStatusDate && !form.cmmcStatusDate)
    errors.cmmcStatusDate = "CMMC Status Date is required.";
  if (touched.cmmcUid && (!form.cmmcUid || form.cmmcUid.length !== 10))
    errors.cmmcUid = "CMMC UID must be exactly 10 alphanumeric characters.";
  if (touched.c3paoName && !form.c3paoName)
    errors.c3paoName = "C3PAO Name is required.";
  if (touched.assessmentStartDate && !form.assessmentStartDate)
    errors.assessmentStartDate = "Assessment Start Date is required.";
  if (touched.assessmentCompletionDate && !form.assessmentCompletionDate)
    errors.assessmentCompletionDate = "Assessment Completion Date is required.";
  if (startAfterCompletion)
    errors.assessmentCompletionDate =
      "Assessment Completion Date must be on or after the Start Date.";
  if (!startAfterCompletion && completionAfterStatus)
    errors.assessmentCompletionDate =
      "Assessment Completion Date must be on or before the CMMC Status Date.";
  if (touched.cageCodes && !form.cageCodes)
    errors.cageCodes = "At least one CAGE Code is required.";
  if (touched.assessmentScopeName && !form.assessmentScopeName)
    errors.assessmentScopeName = "Assessment Scope Name is required.";
  if (touched.sspTitle && !form.sspTitle) errors.sspTitle = "SSP Title is required.";
  if (touched.sspVersion && !form.sspVersion) errors.sspVersion = "SSP Version is required.";
  if (touched.sspDate && !form.sspDate) errors.sspDate = "SSP Date is required.";
  if (touched.affirmingOfficial && !form.affirmingOfficial)
    errors.affirmingOfficial = "Affirming Official is required.";
  if (touched.internalCertificationOwner && !form.internalCertificationOwner)
    errors.internalCertificationOwner = "Internal Certification Owner is required.";

  // ── Proceed guards ───────────────────────────────────────────────────────

  function canProceedStep1() {
    return !!form.certificationStatus && !!form.cmmcStatusDate;
  }

  function canProceedStep2() {
    if (!form.cmmcUid || form.cmmcUid.length !== 10) return false;
    if (!form.c3paoName) return false;
    if (!form.assessmentStartDate || !form.assessmentCompletionDate) return false;
    if (startAfterCompletion || completionAfterStatus) return false;
    if (!form.cageCodes) return false;
    if (!form.assessmentScopeName) return false;
    if (!form.sspTitle || !form.sspVersion || !form.sspDate) return false;
    if (!form.affirmingOfficial || !form.internalCertificationOwner) return false;
    if (sspAfterCompletion && !form.sspDateWarningConfirmed) return false;
    return true;
  }

  function tryNextStep() {
    if (step === 1) {
      touchAll(["certificationStatus", "cmmcStatusDate"]);
      if (canProceedStep1()) setStep(2);
    } else if (step === 2) {
      touchAll([
        "cmmcUid",
        "c3paoName",
        "assessmentStartDate",
        "assessmentCompletionDate",
        "cageCodes",
        "assessmentScopeName",
        "sspTitle",
        "sspVersion",
        "sspDate",
        "affirmingOfficial",
        "internalCertificationOwner",
      ]);
      if (sspAfterCompletion && !form.sspDateWarningConfirmed) {
        setShowSspWarning(true);
        return;
      }
      if (canProceedStep2()) {
        setShowSspWarning(false);
        setStep(3);
      }
    } else if (step === 3) {
      if (form.officialRecords.length === 0) {
        toast({
          title: "Official records required",
          description:
            "Add at least one official record or external reference before continuing.",
          variant: "destructive",
        });
        return;
      }
      setStep(4);
    }
  }

  // ── File handling ────────────────────────────────────────────────────────

  function handleFiles(files: FileList | null) {
    if (!files) return;
    const maxBytes = 25 * 1024 * 1024;
    const allowedExts = [".pdf", ".docx", ".xlsx", ".png", ".jpg", ".jpeg", ".txt"];

    Array.from(files).forEach((file) => {
      if (file.size > maxBytes) {
        toast({
          title: `${file.name} is too large`,
          description: "Maximum file size is 25 MB.",
          variant: "destructive",
        });
        return;
      }
      const ext = "." + (file.name.split(".").pop() ?? "").toLowerCase();
      if (!allowedExts.includes(ext)) {
        toast({
          title: `${file.name}: unsupported file type`,
          description: "Accepted: PDF, DOCX, XLSX, PNG, JPG, TXT",
          variant: "destructive",
        });
        return;
      }
      const entry: OfficialRecordEntry = {
        id: genId(),
        title: file.name.replace(/\.[^.]+$/, ""),
        recordType: "",
        documentDate: "",
        description: "",
        issuedBy: "",
        confidentiality: "internal",
        fileName: file.name,
        fileSize: file.size,
        fileMimeType: file.type,
        file,
        previewUrl: file.type.startsWith("image/") ? URL.createObjectURL(file) : undefined,
        isExternal: false,
        externalUrl: "",
        externalNotes: "",
      };
      setFormState((f) => ({
        ...f,
        officialRecords: [...f.officialRecords, entry],
      }));
      setEditingRecord(entry.id);
    });
  }

  function removeRecord(id: string) {
    setFormState((f) => {
      const rec = f.officialRecords.find((r) => r.id === id);
      if (rec?.previewUrl) URL.revokeObjectURL(rec.previewUrl);
      return { ...f, officialRecords: f.officialRecords.filter((r) => r.id !== id) };
    });
    if (editingRecord === id) setEditingRecord(null);
  }

  function updateRecord(id: string, updates: Partial<OfficialRecordEntry>) {
    setFormState((f) => ({
      ...f,
      officialRecords: f.officialRecords.map((r) =>
        r.id === id ? { ...r, ...updates } : r
      ),
    }));
  }

  function addExternalReference() {
    if (!externalForm.title || !externalForm.recordType || !externalForm.externalUrl) {
      toast({
        title: "Missing required fields",
        description: "Title, Record Type, and External URL are required.",
        variant: "destructive",
      });
      return;
    }
    const entry: OfficialRecordEntry = {
      id: genId(),
      title: externalForm.title,
      recordType: externalForm.recordType,
      documentDate: externalForm.documentDate,
      description: "",
      issuedBy: "",
      confidentiality: externalForm.confidentiality,
      isExternal: true,
      externalUrl: externalForm.externalUrl,
      externalNotes: externalForm.externalNotes,
    };
    setFormState((f) => ({ ...f, officialRecords: [...f.officialRecords, entry] }));
    setShowExternalForm(false);
    setExternalForm({
      title: "",
      recordType: "",
      documentDate: "",
      externalUrl: "",
      externalNotes: "",
      confidentiality: "internal",
    });
  }

  // ── Submit ────────────────────────────────────────────────────────────────

  async function handleSubmit() {
    if (form.activateConfirm !== "ACTIVATE") return;
    setLoading(true);
    try {
      const token = localStorage.getItem("auth_token");
      const officialRecords = form.officialRecords.map((r) => ({
        title: r.title,
        recordType: r.recordType || "Other Official Record",
        description: r.description || null,
        effectiveDate: r.documentDate || null,
        documentDate: r.documentDate || null,
        issuedBy: r.issuedBy || null,
        confidentialityClassification: r.confidentiality,
        isExternalReference: r.isExternal,
        externalUrl: r.isExternal ? r.externalUrl : null,
        externalNotes: r.isExternal ? r.externalNotes : null,
        originalFilename: r.fileName || null,
      }));

      const r = await fetch("/api/certification/initiate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
          "X-Organization-ID": orgId,
        },
        body: JSON.stringify({
          certificationStatus: form.certificationStatus,
          cmmcUid: form.cmmcUid,
          assessmentLevel: "CMMC Level 2 (C3PAO)",
          c3paoName: form.c3paoName,
          cmmcStatusDate: form.cmmcStatusDate,
          assessmentStartDate: form.assessmentStartDate,
          assessmentCompletionDate: form.assessmentCompletionDate,
          assessmentUniqueId: form.c3paoAssessmentReference || null,
          cageCodes: form.cageCodes
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean),
          assessmentScopeName: form.assessmentScopeName,
          sspTitle: form.sspTitle,
          sspVersion: form.sspVersion,
          sspDate: form.sspDate,
          affirmingOfficial: form.affirmingOfficial,
          internalCertificationOwner: form.internalCertificationOwner,
          assessorNames: form.assessorNames
            ? form.assessorNames.split(",").map((s) => s.trim()).filter(Boolean)
            : [],
          assessorContactInfo: form.assessorContactInfo || null,
          contractReferences: form.contractReferences
            ? form.contractReferences.split(",").map((s) => s.trim()).filter(Boolean)
            : [],
          notes: form.notes || null,
          sspDateConfirmed: form.sspDateWarningConfirmed,
          officialRecords,
        }),
      });

      const data = await r.json();
      if (!r.ok) {
        toast({
          title: "Activation failed",
          description: data.error ?? "Could not activate certification record.",
          variant: "destructive",
        });
        return;
      }

      const isGlobalAdmin = user?.role === "admin";
      toast({
        title: isGlobalAdmin
          ? "Certification record activated"
          : "Certification record submitted for verification",
        description: isGlobalAdmin
          ? `The CMMC Level 2 certification record for ${orgName} has been activated.`
          : `The record has been submitted. A second authorized user must verify it before the module activates.`,
      });
      onSuccess();
    } catch {
      toast({ title: "Network error", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }

  // ── Styles ────────────────────────────────────────────────────────────────

  const inputCls =
    "w-full border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-slate-800";
  const labelCls = "block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1";
  const errCls = "text-xs text-red-500 mt-1";

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div>
      {/* Step indicator */}
      <div className="flex items-center gap-1 mb-5">
        {STEP_LABELS.map((label, i) => {
          const n = i + 1;
          return (
            <div key={n} className="flex items-center gap-1.5 flex-1 min-w-0">
              <div
                className={cn(
                  "w-6 h-6 rounded-full flex items-center justify-center text-xs font-semibold shrink-0",
                  step > n
                    ? "bg-emerald-500 text-white"
                    : step === n
                    ? "bg-blue-600 text-white"
                    : "bg-slate-100 dark:bg-slate-700 text-slate-400"
                )}
              >
                {step > n ? <Check className="h-3.5 w-3.5" /> : n}
              </div>
              <span
                className={cn(
                  "text-xs truncate",
                  step >= n
                    ? "text-slate-700 dark:text-slate-300 font-medium"
                    : "text-slate-400"
                )}
              >
                {label}
              </span>
              {i < STEP_LABELS.length - 1 && (
                <div className="flex-1 h-px bg-slate-200 dark:bg-slate-700 mx-1 shrink-0" />
              )}
            </div>
          );
        })}
      </div>

      {/* ─── Step 1: Status ─────────────────────────────────────────────────── */}
      {step === 1 && (
        <div className="space-y-4">
          <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
            Record the official CMMC certification status already awarded to{" "}
            <strong>{orgName}</strong> by their C3PAO assessor. This records an
            already-received official status — do not record status here until it has
            been officially awarded by the C3PAO.
          </p>
          <div>
            <div className={labelCls}>
              Certification Status <span className="text-red-500">*</span>
            </div>
            <div className="grid grid-cols-2 gap-3 mt-1">
              {[
                {
                  value: "CONDITIONAL_L2_C3PAO",
                  label: "Conditional Level 2 (C3PAO)",
                  desc: "Assessment completed with open POA&Ms — 180-day closeout window",
                  color:
                    "border-amber-300 bg-amber-50 dark:bg-amber-950/30",
                },
                {
                  value: "FINAL_L2_C3PAO",
                  label: "Final Level 2 (C3PAO)",
                  desc: "Full assessment completed with no open POA&Ms",
                  color:
                    "border-emerald-300 bg-emerald-50 dark:bg-emerald-950/30",
                },
              ].map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => {
                    setField("certificationStatus", opt.value);
                    touch("certificationStatus");
                  }}
                  className={cn(
                    "text-left p-4 rounded-xl border-2 transition-all",
                    form.certificationStatus === opt.value
                      ? opt.color
                      : "border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:border-slate-300"
                  )}
                >
                  <div className="font-medium text-sm">{opt.label}</div>
                  <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                    {opt.desc}
                  </div>
                </button>
              ))}
            </div>
            {errors.certificationStatus && (
              <p className={errCls}>{errors.certificationStatus}</p>
            )}
          </div>
          <div>
            <label className={labelCls}>
              CMMC Status Date <span className="text-red-500">*</span>
            </label>
            <input
              type="date"
              className={inputCls}
              value={form.cmmcStatusDate}
              onChange={(e) => setField("cmmcStatusDate", e.target.value)}
              onBlur={() => touch("cmmcStatusDate")}
            />
            {errors.cmmcStatusDate && <p className={errCls}>{errors.cmmcStatusDate}</p>}
          </div>
        </div>
      )}

      {/* ─── Step 2: Assessment Details ─────────────────────────────────────── */}
      {step === 2 && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>
                CMMC UID <span className="text-red-500">*</span>
              </label>
              <input
                className={cn(inputCls, "uppercase tracking-widest")}
                value={form.cmmcUid}
                onChange={(e) =>
                  setField(
                    "cmmcUid",
                    e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "")
                  )
                }
                onBlur={() => touch("cmmcUid")}
                maxLength={10}
                placeholder="10-character UID"
              />
              <p className="text-[10px] text-slate-400 mt-0.5">
                Enter the 10-character CMMC UID from the official status or assessment
                record.
              </p>
              {errors.cmmcUid && <p className={errCls}>{errors.cmmcUid}</p>}
            </div>
            <div>
              <label className={labelCls}>Assessment Level</label>
              <input
                className={cn(
                  inputCls,
                  "bg-slate-50 dark:bg-slate-700/50 cursor-default text-slate-600 dark:text-slate-300"
                )}
                value="CMMC Level 2 (C3PAO)"
                readOnly
              />
            </div>
            <div className="col-span-2">
              <label className={labelCls}>
                C3PAO Name <span className="text-red-500">*</span>
              </label>
              <input
                className={inputCls}
                value={form.c3paoName}
                onChange={(e) => setField("c3paoName", e.target.value)}
                onBlur={() => touch("c3paoName")}
                placeholder="Third-Party Assessment Organization name"
              />
              {errors.c3paoName && <p className={errCls}>{errors.c3paoName}</p>}
            </div>
            <div>
              <label className={labelCls}>
                Assessment Start Date <span className="text-red-500">*</span>
              </label>
              <input
                type="date"
                className={inputCls}
                value={form.assessmentStartDate}
                onChange={(e) => setField("assessmentStartDate", e.target.value)}
                onBlur={() => touch("assessmentStartDate")}
              />
              {errors.assessmentStartDate && (
                <p className={errCls}>{errors.assessmentStartDate}</p>
              )}
            </div>
            <div>
              <label className={labelCls}>
                Assessment Completion Date <span className="text-red-500">*</span>
              </label>
              <input
                type="date"
                className={inputCls}
                value={form.assessmentCompletionDate}
                onChange={(e) => setField("assessmentCompletionDate", e.target.value)}
                onBlur={() => touch("assessmentCompletionDate")}
              />
              {errors.assessmentCompletionDate && (
                <p className={errCls}>{errors.assessmentCompletionDate}</p>
              )}
            </div>
            <div className="col-span-2">
              <label className={labelCls}>
                C3PAO Assessment Reference{" "}
                <span className="text-slate-400 font-normal">(optional)</span>
              </label>
              <input
                className={inputCls}
                value={form.c3paoAssessmentReference}
                onChange={(e) => setField("c3paoAssessmentReference", e.target.value)}
                placeholder="C3PAO's own internal reference number"
              />
              <p className="text-[10px] text-slate-400 mt-0.5">
                The C3PAO's own internal reference number for this assessment, if
                provided on official documents.
              </p>
            </div>
            <div className="col-span-2">
              <label className={labelCls}>
                CAGE Codes <span className="text-red-500">*</span>
              </label>
              <input
                className={inputCls}
                value={form.cageCodes}
                onChange={(e) => setField("cageCodes", e.target.value)}
                onBlur={() => touch("cageCodes")}
                placeholder="Comma-separated, e.g. 1A2B3, 4C5D6"
              />
              {errors.cageCodes && <p className={errCls}>{errors.cageCodes}</p>}
            </div>
            <div className="col-span-2">
              <label className={labelCls}>
                Assessment Scope Name <span className="text-red-500">*</span>
              </label>
              <input
                className={inputCls}
                value={form.assessmentScopeName}
                onChange={(e) => setField("assessmentScopeName", e.target.value)}
                onBlur={() => touch("assessmentScopeName")}
              />
              {errors.assessmentScopeName && (
                <p className={errCls}>{errors.assessmentScopeName}</p>
              )}
            </div>
            <div className="col-span-2">
              <label className={labelCls}>
                SSP Title <span className="text-red-500">*</span>
              </label>
              <input
                className={inputCls}
                value={form.sspTitle}
                onChange={(e) => setField("sspTitle", e.target.value)}
                onBlur={() => touch("sspTitle")}
              />
              {errors.sspTitle && <p className={errCls}>{errors.sspTitle}</p>}
            </div>
            <div>
              <label className={labelCls}>
                SSP Version <span className="text-red-500">*</span>
              </label>
              <input
                className={inputCls}
                value={form.sspVersion}
                onChange={(e) => setField("sspVersion", e.target.value)}
                onBlur={() => touch("sspVersion")}
              />
              {errors.sspVersion && <p className={errCls}>{errors.sspVersion}</p>}
            </div>
            <div>
              <label className={labelCls}>
                SSP Date <span className="text-red-500">*</span>
              </label>
              <input
                type="date"
                className={inputCls}
                value={form.sspDate}
                onChange={(e) => {
                  setField("sspDate", e.target.value);
                  setField("sspDateWarningConfirmed", false);
                }}
                onBlur={() => touch("sspDate")}
              />
              {errors.sspDate && <p className={errCls}>{errors.sspDate}</p>}
            </div>
            <div>
              <label className={labelCls}>
                Affirming Official <span className="text-red-500">*</span>
              </label>
              <input
                className={inputCls}
                value={form.affirmingOfficial}
                onChange={(e) => setField("affirmingOfficial", e.target.value)}
                onBlur={() => touch("affirmingOfficial")}
                placeholder="Name, Title"
              />
              {errors.affirmingOfficial && (
                <p className={errCls}>{errors.affirmingOfficial}</p>
              )}
            </div>
            <div>
              <label className={labelCls}>
                Internal Certification Owner <span className="text-red-500">*</span>
              </label>
              <input
                className={inputCls}
                value={form.internalCertificationOwner}
                onChange={(e) => setField("internalCertificationOwner", e.target.value)}
                onBlur={() => touch("internalCertificationOwner")}
                placeholder="Name, Title"
              />
              {errors.internalCertificationOwner && (
                <p className={errCls}>{errors.internalCertificationOwner}</p>
              )}
            </div>
            <div className="col-span-2">
              <label className={labelCls}>
                Assessor Names{" "}
                <span className="text-slate-400 font-normal">(optional, comma-separated)</span>
              </label>
              <input
                className={inputCls}
                value={form.assessorNames}
                onChange={(e) => setField("assessorNames", e.target.value)}
              />
            </div>
            <div className="col-span-2">
              <label className={labelCls}>
                Notes{" "}
                <span className="text-slate-400 font-normal">(optional)</span>
              </label>
              <textarea
                className={inputCls}
                rows={2}
                value={form.notes}
                onChange={(e) => setField("notes", e.target.value)}
              />
            </div>
          </div>

          {/* SSP date warning */}
          {(showSspWarning || (form.sspDate && sspAfterCompletion)) &&
            form.sspDate &&
            form.assessmentCompletionDate && (
              <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-700 rounded-xl p-4">
                <div className="flex gap-2">
                  <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <div className="text-sm font-medium text-amber-800 dark:text-amber-400 mb-1">
                      SSP Date After Assessment Completion
                    </div>
                    <div className="text-xs text-amber-700 dark:text-amber-500 mb-3">
                      The SSP Date ({form.sspDate}) is after the Assessment Completion Date (
                      {form.assessmentCompletionDate}). This may indicate the SSP was updated
                      after the assessment. Confirm to continue.
                    </div>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={form.sspDateWarningConfirmed}
                        onChange={(e) =>
                          setField("sspDateWarningConfirmed", e.target.checked)
                        }
                        className="rounded"
                      />
                      <span className="text-xs text-amber-800 dark:text-amber-400 font-medium">
                        I confirm the SSP date is correct and I understand the implication.
                      </span>
                    </label>
                  </div>
                </div>
              </div>
            )}
        </div>
      )}

      {/* ─── Step 3: Official Records ────────────────────────────────────────── */}
      {step === 3 && (
        <div className="space-y-4">
          {/* CUI Notice */}
          <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-700 rounded-xl p-3 flex gap-2">
            <Lock className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
            <p className="text-xs text-amber-800 dark:text-amber-400 leading-relaxed">
              <strong>CUI Notice:</strong> Official assessment records and findings may
              contain Controlled Unclassified Information (CUI). Ensure you have
              authorization to upload and store these records in this system.
            </p>
          </div>

          {/* Drop zone */}
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(false);
              handleFiles(e.dataTransfer.files);
            }}
            onClick={() => fileInputRef.current?.click()}
            className={cn(
              "border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all",
              dragOver
                ? "border-blue-400 bg-blue-50 dark:bg-blue-950/20"
                : "border-slate-200 dark:border-slate-700 hover:border-blue-300 hover:bg-slate-50 dark:hover:bg-slate-800/50"
            )}
          >
            <Upload className="h-8 w-8 mx-auto text-slate-300 mb-2" />
            <div className="text-sm font-medium text-slate-600 dark:text-slate-400">
              Drop files here or click to browse
            </div>
            <div className="text-xs text-slate-400 mt-1">
              PDF, DOCX, XLSX, PNG, JPG, TXT — up to 25 MB each
            </div>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept=".pdf,.docx,.xlsx,.png,.jpg,.jpeg,.txt"
            className="hidden"
            onChange={(e) => handleFiles(e.target.files)}
          />

          {/* Staged files */}
          {form.officialRecords.length > 0 && (
            <div className="space-y-2">
              {form.officialRecords.map((rec) => (
                <div
                  key={rec.id}
                  className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden"
                >
                  <div className="flex items-center gap-3 px-3 py-2.5 border-b border-slate-100 dark:border-slate-700/50">
                    <div className="w-8 h-8 rounded-lg bg-slate-100 dark:bg-slate-700 flex items-center justify-center shrink-0">
                      {rec.isExternal ? (
                        <ExternalLink className="h-4 w-4 text-blue-500" />
                      ) : (
                        <FileText className="h-4 w-4 text-slate-500" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-slate-800 dark:text-slate-200 truncate">
                        {rec.title || rec.fileName || "Untitled"}
                      </div>
                      <div className="text-xs text-slate-400">
                        {rec.isExternal
                          ? "External Reference"
                          : rec.fileName || "File"}
                        {rec.fileSize ? ` — ${fmtSize(rec.fileSize)}` : ""}
                        {rec.recordType ? ` · ${rec.recordType}` : ""}
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5">
                      {rec.previewUrl && (
                        <a
                          href={rec.previewUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className="p-1.5 rounded-md text-slate-400 hover:text-blue-500 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
                          title="Preview"
                        >
                          <Eye className="h-3.5 w-3.5" />
                        </a>
                      )}
                      <button
                        onClick={() =>
                          setEditingRecord(
                            editingRecord === rec.id ? null : rec.id
                          )
                        }
                        className="px-2 py-1 text-xs rounded-md text-slate-500 hover:text-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
                      >
                        {editingRecord === rec.id ? "Done" : "Edit"}
                      </button>
                      <button
                        onClick={() => removeRecord(rec.id)}
                        className="p-1.5 rounded-md text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/20 transition-colors"
                        title="Remove"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                  {editingRecord === rec.id && (
                    <div className="p-3 grid grid-cols-2 gap-3 bg-slate-50/50 dark:bg-slate-800/30">
                      <div className="col-span-2">
                        <label className={labelCls}>
                          Title <span className="text-red-500">*</span>
                        </label>
                        <input
                          className={inputCls}
                          value={rec.title}
                          onChange={(e) =>
                            updateRecord(rec.id, { title: e.target.value })
                          }
                        />
                      </div>
                      <div>
                        <label className={labelCls}>
                          Record Type <span className="text-red-500">*</span>
                        </label>
                        <select
                          className={inputCls}
                          value={rec.recordType}
                          onChange={(e) =>
                            updateRecord(rec.id, { recordType: e.target.value })
                          }
                        >
                          <option value="">Select type…</option>
                          {RECORD_TYPES.map((t) => (
                            <option key={t} value={t}>
                              {t}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className={labelCls}>Document Date</label>
                        <input
                          type="date"
                          className={inputCls}
                          value={rec.documentDate}
                          onChange={(e) =>
                            updateRecord(rec.id, { documentDate: e.target.value })
                          }
                        />
                      </div>
                      <div>
                        <label className={labelCls}>Issued By</label>
                        <input
                          className={inputCls}
                          value={rec.issuedBy}
                          onChange={(e) =>
                            updateRecord(rec.id, { issuedBy: e.target.value })
                          }
                        />
                      </div>
                      <div>
                        <label className={labelCls}>Confidentiality</label>
                        <select
                          className={inputCls}
                          value={rec.confidentiality}
                          onChange={(e) =>
                            updateRecord(rec.id, { confidentiality: e.target.value })
                          }
                        >
                          {CONFIDENTIALITY_OPTIONS.map((o) => (
                            <option key={o.value} value={o.value}>
                              {o.label}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="col-span-2">
                        <label className={labelCls}>Description</label>
                        <textarea
                          className={inputCls}
                          rows={2}
                          value={rec.description}
                          onChange={(e) =>
                            updateRecord(rec.id, { description: e.target.value })
                          }
                        />
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* External reference button */}
          {!showExternalForm && (
            <button
              onClick={() => setShowExternalForm(true)}
              className="flex items-center gap-2 text-sm text-blue-600 dark:text-blue-400 hover:underline mt-1"
            >
              <ExternalLink className="h-4 w-4" />
              Reference External Record (URL-based)
            </button>
          )}

          {/* External reference form */}
          {showExternalForm && (
            <div className="bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800 rounded-xl p-4 space-y-3">
              <div className="text-sm font-medium text-slate-700 dark:text-slate-300">
                Add External Reference
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <label className={labelCls}>
                    Title <span className="text-red-500">*</span>
                  </label>
                  <input
                    className={inputCls}
                    value={externalForm.title}
                    onChange={(e) =>
                      setExternalForm((f) => ({ ...f, title: e.target.value }))
                    }
                    placeholder="Record title"
                  />
                </div>
                <div>
                  <label className={labelCls}>
                    Record Type <span className="text-red-500">*</span>
                  </label>
                  <select
                    className={inputCls}
                    value={externalForm.recordType}
                    onChange={(e) =>
                      setExternalForm((f) => ({ ...f, recordType: e.target.value }))
                    }
                  >
                    <option value="">Select type…</option>
                    {RECORD_TYPES.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className={labelCls}>Document Date</label>
                  <input
                    type="date"
                    className={inputCls}
                    value={externalForm.documentDate}
                    onChange={(e) =>
                      setExternalForm((f) => ({ ...f, documentDate: e.target.value }))
                    }
                  />
                </div>
                <div className="col-span-2">
                  <label className={labelCls}>
                    External URL <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="url"
                    className={inputCls}
                    value={externalForm.externalUrl}
                    onChange={(e) =>
                      setExternalForm((f) => ({ ...f, externalUrl: e.target.value }))
                    }
                    placeholder="https://…"
                  />
                </div>
                <div className="col-span-2">
                  <label className={labelCls}>Notes</label>
                  <input
                    className={inputCls}
                    value={externalForm.externalNotes}
                    onChange={(e) =>
                      setExternalForm((f) => ({ ...f, externalNotes: e.target.value }))
                    }
                  />
                </div>
              </div>
              <div className="flex gap-2 justify-end">
                <button
                  onClick={() => setShowExternalForm(false)}
                  className="px-3 py-1.5 text-sm text-slate-600 dark:text-slate-400"
                >
                  Cancel
                </button>
                <button
                  onClick={addExternalReference}
                  className="px-4 py-1.5 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700"
                >
                  Add Reference
                </button>
              </div>
            </div>
          )}

          {form.officialRecords.length === 0 && (
            <div className="text-center py-6 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-200 dark:border-slate-700">
              <FileText className="h-8 w-8 text-slate-300 mx-auto mb-2" />
              <div className="text-sm text-slate-500">No records added yet</div>
              <div className="text-xs text-slate-400 mt-1">
                At least one official record or external reference is required to
                continue.
              </div>
            </div>
          )}
        </div>
      )}

      {/* ─── Step 4: Review & Activate ────────────────────────────────────────── */}
      {step === 4 && (
        <div className="space-y-4">
          <ReviewSection
            title="Certification Status"
            rows={[
              { label: "Status", value: fmtStatus(form.certificationStatus) },
              { label: "CMMC Status Date", value: form.cmmcStatusDate },
            ]}
          />
          <ReviewSection
            title="Identifiers"
            rows={[
              { label: "CMMC UID", value: form.cmmcUid },
              { label: "Assessment Level", value: "CMMC Level 2 (C3PAO)" },
              {
                label: "C3PAO Assessment Reference",
                value: form.c3paoAssessmentReference || "Not provided",
              },
              { label: "CAGE Codes", value: form.cageCodes },
            ]}
          />
          <ReviewSection
            title="Assessment"
            rows={[
              { label: "C3PAO Name", value: form.c3paoName },
              { label: "Assessment Start Date", value: form.assessmentStartDate },
              {
                label: "Assessment Completion Date",
                value: form.assessmentCompletionDate,
              },
              { label: "Assessment Scope", value: form.assessmentScopeName },
              { label: "Affirming Official", value: form.affirmingOfficial },
              {
                label: "Internal Cert. Owner",
                value: form.internalCertificationOwner,
              },
            ]}
          />
          <ReviewSection
            title="System Security Plan"
            rows={[
              { label: "SSP Title", value: form.sspTitle },
              { label: "SSP Version", value: form.sspVersion },
              { label: "SSP Date", value: form.sspDate },
            ]}
          />

          {/* Official Records summary */}
          <div className="bg-slate-50 dark:bg-slate-800/50 rounded-xl p-4">
            <div className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-widest mb-3">
              Official Records
            </div>
            <div className="text-sm text-slate-600 dark:text-slate-400 mb-2">
              {form.officialRecords.length} record
              {form.officialRecords.length !== 1 ? "s" : ""} attached
            </div>
            <div className="space-y-1">
              {form.officialRecords.map((r) => (
                <div
                  key={r.id}
                  className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-400"
                >
                  <div className="h-1.5 w-1.5 rounded-full bg-slate-400 shrink-0" />
                  <span className="font-medium">{r.title}</span>
                  {r.recordType && (
                    <span className="text-slate-400">— {r.recordType}</span>
                  )}
                  {r.isExternal && (
                    <span className="text-blue-500 ml-1">(External)</span>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Activation checklist */}
          <div className="bg-slate-50 dark:bg-slate-800/50 rounded-xl p-4 space-y-2">
            <div className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-widest mb-2">
              Activation Checklist
            </div>
            {[
              {
                label: "Certification status selected",
                ok: !!form.certificationStatus,
              },
              {
                label: "CMMC UID entered (10 characters)",
                ok: form.cmmcUid.length === 10,
              },
              { label: "C3PAO name provided", ok: !!form.c3paoName },
              {
                label: "Assessment dates provided",
                ok: !!form.assessmentStartDate && !!form.assessmentCompletionDate,
              },
              { label: "CAGE codes provided", ok: !!form.cageCodes },
              {
                label: "SSP details complete",
                ok: !!form.sspTitle && !!form.sspVersion && !!form.sspDate,
              },
              {
                label: "Official records attached",
                ok: form.officialRecords.length > 0,
              },
            ].map((item) => (
              <div key={item.label} className="flex items-center gap-2 text-xs">
                {item.ok ? (
                  <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
                ) : (
                  <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0" />
                )}
                <span
                  className={
                    item.ok
                      ? "text-slate-700 dark:text-slate-300"
                      : "text-amber-600 dark:text-amber-400"
                  }
                >
                  {item.label}
                </span>
              </div>
            ))}
          </div>

          {/* ACTIVATE confirmation */}
          <div className="border border-slate-200 dark:border-slate-700 rounded-xl p-4 space-y-3">
            <div className="flex items-start gap-2">
              <Info className="h-4 w-4 text-slate-400 shrink-0 mt-0.5" />
              <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                Type{" "}
                <strong className="font-mono text-slate-700 dark:text-slate-300">
                  ACTIVATE
                </strong>{" "}
                below to confirm. This creates an official certification record and
                activates the CMMC Level 2 Certification module for {orgName}.
              </p>
            </div>
            <input
              className={inputCls}
              placeholder='Type "ACTIVATE" to confirm'
              value={form.activateConfirm}
              onChange={(e) => setField("activateConfirm", e.target.value)}
            />
          </div>
        </div>
      )}

      {/* ─── Footer ──────────────────────────────────────────────────────────── */}
      <div className="border-t border-slate-100 dark:border-slate-700 pt-4 mt-5 flex items-center justify-between">
        <button
          onClick={step === 1 ? onCancel : () => setStep((s) => s - 1)}
          className="px-4 py-2 text-sm text-slate-600 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 transition-colors"
        >
          {step === 1 ? "Cancel" : "Back"}
        </button>
        {step < 4 ? (
          <button
            onClick={tryNextStep}
            className="px-5 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
          >
            Continue
          </button>
        ) : (
          <button
            disabled={form.activateConfirm !== "ACTIVATE" || loading}
            onClick={handleSubmit}
            className="px-5 py-2 bg-emerald-600 text-white text-sm font-medium rounded-lg hover:bg-emerald-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {loading ? "Activating…" : "Activate Certification Record"}
          </button>
        )}
      </div>
    </div>
  );
}
