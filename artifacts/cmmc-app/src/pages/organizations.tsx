import { useState, useMemo, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import {
  Building2,
  Plus,
  AlertTriangle,
  CheckSquare,
  FileText,
  RefreshCw,
  Trash2,
  Check,
  Award,
  Pencil,
  Loader2,
  Map as MapIcon,
  Cable,
} from "lucide-react";
import { useAuth } from "@/lib/auth";
import { useOrg } from "@/context/OrgContext";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { useListPackages } from "@workspace/api-client-react";

interface OrgStats {
  id: string;
  name: string;
  shortName: string | null;
  cmmcTargetLevel: string | null;
  isTestOrganization: boolean;
  readinessPercent: number;
  implementedControls: number;
  totalControls: number;
  openPoams: number;
  openTasks: number;
  evidenceCount: number;
}

interface CompliancePkg {
  id: string;
  frameworkId?: string | null;
  frameworkName?: string | null;
  frameworkShortName?: string | null;
  packageKey?: string | null;
  name: string;
  version?: string | null;
  description?: string | null;
  packageType?: string | null;
  controlCount?: number | null;
  sortOrder?: number | null;
}

const QUICK_START_PROFILES = [
  {
    id: "fci-only",
    label: "FCI Only",
    description: "Federal Contract Information — basic safeguarding under FAR 52.204-21",
    pkgIds: ["pkg-cmmc-l1-self", "pkg-far-52-204-21"],
  },
  {
    id: "dod-cui",
    label: "DoD CUI Contractor",
    description: "Handles CUI under DoD contracts — CMMC L2, NIST 800-171 r2, and DFARS 7012",
    pkgIds: ["pkg-cmmc-l2-self", "pkg-nist-800-171-r2", "pkg-dfars-7012"],
  },
  {
    id: "nist-readiness",
    label: "NIST Readiness",
    description: "NIST 800-171 assessment prep — control framework and assessment procedures",
    pkgIds: ["pkg-nist-800-171-r2", "pkg-nist-800-171a-r2"],
  },
  {
    id: "dfars-full",
    label: "DFARS Contract Support",
    description: "Full DFARS suite — all four DFARS clauses plus CMMC L2 and NIST 800-171",
    pkgIds: ["pkg-cmmc-l2-self", "pkg-nist-800-171-r2", "pkg-dfars-7012", "pkg-dfars-7019", "pkg-dfars-7020", "pkg-dfars-7021"],
  },
] as const;

function fwBadgeColor(shortName?: string | null): string {
  switch (shortName) {
    case "CMMC": return "bg-purple-50 text-purple-700 border-purple-200";
    case "NIST 800-171":
    case "NIST 800-171A": return "bg-blue-50 text-blue-700 border-blue-200";
    case "NIST 800-53": return "bg-indigo-50 text-indigo-700 border-indigo-200";
    case "DFARS": return "bg-amber-50 text-amber-700 border-amber-200";
    case "FAR": return "bg-slate-50 text-slate-600 border-slate-200";
    default: return "bg-slate-100 text-slate-600 border-slate-200";
  }
}

function ReadinessRing({ percent, size = 56 }: { percent: number; size?: number }) {
  const radius = (size - 8) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (percent / 100) * circumference;
  const color = percent >= 75 ? "#22c55e" : percent >= 40 ? "#f59e0b" : "#ef4444";

  return (
    <svg width={size} height={size} className="-rotate-90">
      <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="currentColor" strokeWidth={6} className="text-muted/30" />
      <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke={color} strokeWidth={6} strokeDasharray={circumference} strokeDashoffset={offset} strokeLinecap="round" />
      <text x="50%" y="50%" dominantBaseline="middle" textAnchor="middle" fill={color} fontSize={size * 0.22} fontWeight="700" className="rotate-90" style={{ transform: `rotate(90deg) translate(0px, -${size}px)` }}>
        {percent}%
      </text>
    </svg>
  );
}

// ─── Certification Initiation Wizard ─────────────────────────────────────────

function CertificationInitiateWizard({
  open,
  orgId,
  orgName,
  onClose,
  onSuccess,
}: {
  open: boolean;
  orgId: string;
  orgName: string;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const { toast } = useToast();
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    certificationStatus: "",
    cmmcUid: "",
    assessmentLevel: "Level 2",
    c3paoName: "",
    cmmcStatusDate: "",
    assessmentStartDate: "",
    assessmentCompletionDate: "",
    assessmentUniqueId: "",
    cageCodes: "",
    assessmentScopeName: "",
    sspTitle: "",
    sspVersion: "",
    sspDate: "",
    affirmingOfficial: "",
    internalCertificationOwner: "",
    assessorNames: "",
    notes: "",
    hasRequiredRecord: false,
  });

  function set(k: string, v: string | boolean) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  function handleClose() {
    setStep(1);
    setForm({
      certificationStatus: "",
      cmmcUid: "",
      assessmentLevel: "Level 2",
      c3paoName: "",
      cmmcStatusDate: "",
      assessmentStartDate: "",
      assessmentCompletionDate: "",
      assessmentUniqueId: "",
      cageCodes: "",
      assessmentScopeName: "",
      sspTitle: "",
      sspVersion: "",
      sspDate: "",
      affirmingOfficial: "",
      internalCertificationOwner: "",
      assessorNames: "",
      notes: "",
      hasRequiredRecord: false,
    });
    onClose();
  }

  async function handleSubmit() {
    setLoading(true);
    try {
      const token = localStorage.getItem("auth_token");
      const r = await fetch("/api/certification/initiate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
          "X-Organization-ID": orgId,
        },
        body: JSON.stringify({
          ...form,
          cageCodes: form.cageCodes.split(",").map((s) => s.trim()).filter(Boolean),
          assessorNames: form.assessorNames ? form.assessorNames.split(",").map((s) => s.trim()).filter(Boolean) : [],
          contractReferences: [],
        }),
      });
      const data = await r.json();
      if (!r.ok) {
        toast({ title: "Error", description: data.error ?? "Submission failed", variant: "destructive" });
        return;
      }
      toast({ title: "Submitted", description: `Certification record submitted for ${orgName}. A second authorized user must verify it.` });
      handleClose();
      onSuccess();
    } catch {
      toast({ title: "Error", description: "Network error", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }

  const inputClass = "w-full border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-slate-800";
  const labelClass = "block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1";
  const STEPS = ["Select Status", "Assessment Details", "Supporting Records"];

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl flex flex-col overflow-hidden" style={{ maxHeight: "90vh" }}>
        <DialogHeader className="shrink-0">
          <DialogTitle className="flex items-center gap-2">
            <Award className="h-5 w-5 text-blue-600" />
            Initiate Certification — {orgName}
          </DialogTitle>
        </DialogHeader>

        {/* Step indicator */}
        <div className="flex items-center gap-1 shrink-0 py-2">
          {STEPS.map((label, i) => {
            const n = i + 1;
            return (
              <div key={n} className="flex items-center gap-2 flex-1 min-w-0">
                <div className={cn(
                  "w-6 h-6 rounded-full flex items-center justify-center text-xs font-semibold shrink-0",
                  step >= n ? "bg-blue-600 text-white" : "bg-slate-100 dark:bg-slate-800 text-slate-400"
                )}>
                  {step > n ? <Check className="h-3.5 w-3.5" /> : n}
                </div>
                <span className={cn("text-xs truncate", step >= n ? "text-slate-700 dark:text-slate-200 font-medium" : "text-slate-400")}>{label}</span>
                {i < STEPS.length - 1 && <div className="flex-1 h-px bg-slate-200 dark:bg-slate-700 ml-1" />}
              </div>
            );
          })}
        </div>

        {/* Step content */}
        <div className="overflow-y-auto flex-1 py-2 pr-1">
          {step === 1 && (
            <div>
              <p className="text-xs text-muted-foreground mb-4">
                Select the CMMC certification status officially awarded to <strong>{orgName}</strong> by their C3PAO assessor.
              </p>
              <div className="grid grid-cols-2 gap-3">
                {[
                  { value: "CONDITIONAL_L2_C3PAO", label: "Conditional Level 2 (C3PAO)", desc: "Assessment completed with POA&Ms", color: "border-amber-300 bg-amber-50 dark:bg-amber-950/30" },
                  { value: "FINAL_L2_C3PAO", label: "Final Level 2 (C3PAO)", desc: "Full assessment completed, no open POA&Ms", color: "border-emerald-300 bg-emerald-50 dark:bg-emerald-950/30" },
                ].map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => set("certificationStatus", opt.value)}
                    className={cn(
                      "text-left p-4 rounded-xl border-2 transition-all",
                      form.certificationStatus === opt.value
                        ? opt.color
                        : "border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:border-slate-300"
                    )}
                  >
                    <div className="font-medium text-sm">{opt.label}</div>
                    <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">{opt.desc}</div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={labelClass}>CMMC UID <span className="text-red-500">*</span></label>
                <input className={inputClass} value={form.cmmcUid} onChange={(e) => set("cmmcUid", e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""))} maxLength={10} placeholder="10 alphanumeric characters" />
              </div>
              <div>
                <label className={labelClass}>Assessment Level</label>
                <input className={inputClass} value={form.assessmentLevel} onChange={(e) => set("assessmentLevel", e.target.value)} />
              </div>
              <div className="col-span-2">
                <label className={labelClass}>C3PAO Name <span className="text-red-500">*</span></label>
                <input className={inputClass} value={form.c3paoName} onChange={(e) => set("c3paoName", e.target.value)} placeholder="Third-Party Assessment Organization name" />
              </div>
              <div>
                <label className={labelClass}>CMMC Status Date <span className="text-red-500">*</span></label>
                <input type="date" className={inputClass} value={form.cmmcStatusDate} onChange={(e) => set("cmmcStatusDate", e.target.value)} />
              </div>
              <div>
                <label className={labelClass}>Assessment Start Date</label>
                <input type="date" className={inputClass} value={form.assessmentStartDate} onChange={(e) => set("assessmentStartDate", e.target.value)} />
              </div>
              <div>
                <label className={labelClass}>Assessment Completion Date</label>
                <input type="date" className={inputClass} value={form.assessmentCompletionDate} onChange={(e) => set("assessmentCompletionDate", e.target.value)} />
              </div>
              <div>
                <label className={labelClass}>Assessment Unique ID <span className="text-red-500">*</span></label>
                <input className={inputClass} value={form.assessmentUniqueId} onChange={(e) => set("assessmentUniqueId", e.target.value)} />
              </div>
              <div className="col-span-2">
                <label className={labelClass}>CAGE Codes <span className="text-red-500">*</span></label>
                <input className={inputClass} value={form.cageCodes} onChange={(e) => set("cageCodes", e.target.value)} placeholder="Comma-separated, e.g. 1A2B3, 4C5D6" />
              </div>
              <div className="col-span-2">
                <label className={labelClass}>Assessment Scope Name <span className="text-red-500">*</span></label>
                <input className={inputClass} value={form.assessmentScopeName} onChange={(e) => set("assessmentScopeName", e.target.value)} />
              </div>
              <div className="col-span-2">
                <label className={labelClass}>SSP Title <span className="text-red-500">*</span></label>
                <input className={inputClass} value={form.sspTitle} onChange={(e) => set("sspTitle", e.target.value)} />
              </div>
              <div>
                <label className={labelClass}>SSP Version <span className="text-red-500">*</span></label>
                <input className={inputClass} value={form.sspVersion} onChange={(e) => set("sspVersion", e.target.value)} />
              </div>
              <div>
                <label className={labelClass}>SSP Date <span className="text-red-500">*</span></label>
                <input type="date" className={inputClass} value={form.sspDate} onChange={(e) => set("sspDate", e.target.value)} />
              </div>
              <div>
                <label className={labelClass}>Affirming Official <span className="text-red-500">*</span></label>
                <input className={inputClass} value={form.affirmingOfficial} onChange={(e) => set("affirmingOfficial", e.target.value)} placeholder="Name, Title" />
              </div>
              <div>
                <label className={labelClass}>Internal Certification Owner <span className="text-red-500">*</span></label>
                <input className={inputClass} value={form.internalCertificationOwner} onChange={(e) => set("internalCertificationOwner", e.target.value)} placeholder="Name, Title" />
              </div>
              <div className="col-span-2">
                <label className={labelClass}>Assessor Names (optional, comma-separated)</label>
                <input className={inputClass} value={form.assessorNames} onChange={(e) => set("assessorNames", e.target.value)} />
              </div>
              <div className="col-span-2">
                <label className={labelClass}>Notes (optional)</label>
                <textarea className={inputClass} rows={2} value={form.notes} onChange={(e) => set("notes", e.target.value)} />
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-4">
              <p className="text-xs text-muted-foreground">At least one official supporting record must be available before submission. Records can be uploaded after verification in the Official Records tab.</p>
              <div className="border border-slate-200 dark:border-slate-700 rounded-xl p-4 space-y-2">
                <div className="text-xs font-medium text-slate-700 dark:text-slate-300 mb-2">Acceptable record types (at least one required):</div>
                {["CMMC Assessment Findings Report", "CMMC Status Confirmation", "SPRS Status Verification", "Certification Record", "POA&M Closeout Result (if applicable)"].map((r) => (
                  <div key={r} className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-400">
                    <div className="h-1.5 w-1.5 rounded-full bg-slate-400 shrink-0" />
                    {r}
                  </div>
                ))}
              </div>
              <label className="flex items-start gap-3 cursor-pointer">
                <input type="checkbox" checked={form.hasRequiredRecord} onChange={(e) => set("hasRequiredRecord", e.target.checked)} className="mt-0.5" />
                <span className="text-sm text-slate-700 dark:text-slate-300">
                  I confirm that at least one official supporting record is available and will be uploaded to the Official Records tab upon module activation.
                </span>
              </label>
              <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-xl p-4">
                <div className="flex gap-2">
                  <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
                  <div className="text-xs text-amber-800 dark:text-amber-400">
                    <div className="font-medium mb-1">Second-Person Verification Required</div>
                    After submission, a different authorized user with verification permissions must independently confirm this record before the Certification module becomes active.
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="shrink-0 pt-4 border-t mt-2">
          <Button variant="outline" onClick={step === 1 ? handleClose : () => setStep((s) => s - 1)}>
            {step === 1 ? "Cancel" : "Back"}
          </Button>
          <Button
            disabled={
              (step === 1 && !form.certificationStatus) ||
              (step === 2 && (!form.cmmcUid || form.cmmcUid.length !== 10 || !form.c3paoName || !form.cmmcStatusDate || !form.assessmentScopeName || !form.sspTitle || !form.sspVersion || !form.sspDate || !form.affirmingOfficial || !form.internalCertificationOwner || !form.cageCodes)) ||
              (step === 3 && !form.hasRequiredRecord) ||
              loading
            }
            onClick={step < 3 ? () => setStep((s) => s + 1) : handleSubmit}
          >
            {loading ? "Submitting…" : step < 3 ? "Continue" : "Submit for Verification"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Edit Org Dialog ───────────────────────────────────────────────────────────

function EditOrgDialog({
  open,
  orgId,
  onClose,
  onSaved,
}: {
  open: boolean;
  orgId: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<Record<string, string>>({});
  const [loaded, setLoaded] = useState(false);

  // Feature action state
  const [featureActionDialog, setFeatureActionDialog] = useState<{
    action: "enable" | "disable";
    featureTarget: "IMPLEMENTATION_ROADMAP" | "PRE_ASSESSMENT";
  } | null>(null);
  const [featureChangeReason, setFeatureChangeReason] = useState("");
  const [featureActionLoading, setFeatureActionLoading] = useState(false);

  // Fetch org features
  const { data: orgFeatures = [], refetch: refetchFeatures } = useQuery<Array<{ featureKey: string; enabled: boolean }>>({
    queryKey: ["org-features", orgId],
    queryFn: async () => {
      const token = localStorage.getItem("auth_token");
      const res = await fetch(`/api/organizations/${orgId}/features`, {
        headers: {
          Authorization: `Bearer ${token}`,
          "X-Organization-ID": orgId,
        },
      });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: open && !!orgId,
    staleTime: 5 * 60 * 1000,
  });

  const roadmapFeature = orgFeatures.find((f) => f.featureKey === "IMPLEMENTATION_ROADMAP");
  const isRoadmapEnabled = roadmapFeature?.enabled ?? true;
  const preAssessmentFeature = orgFeatures.find((f) => f.featureKey === "PRE_ASSESSMENT");
  const isPreAssessmentEnabled = preAssessmentFeature?.enabled ?? true;

  const FEATURE_LABELS: Record<string, string> = {
    IMPLEMENTATION_ROADMAP: "Implementation Roadmap",
    PRE_ASSESSMENT: "Pre-Assessment",
  };

  async function handleFeatureToggle() {
    if (!featureActionDialog) return;
    setFeatureActionLoading(true);
    try {
      const token = localStorage.getItem("auth_token");
      const newEnabled = featureActionDialog.action === "enable";
      const { featureTarget } = featureActionDialog;
      const r = await fetch(`/api/organizations/${orgId}/features/${featureTarget}`, {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${token}`,
          "X-Organization-ID": orgId,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ enabled: newEnabled, changeReason: featureChangeReason }),
      });
      if (!r.ok) {
        const err = await r.json().catch(() => ({}));
        throw new Error(err.error ?? "Failed to update feature");
      }
      const label = FEATURE_LABELS[featureTarget] ?? featureTarget;
      toast({
        title: newEnabled ? `${label} enabled` : `${label} disabled`,
        description: newEnabled
          ? `The ${label} module is now enabled for this organization.`
          : `The ${label} module has been disabled.`,
      });
      setFeatureActionDialog(null);
      setFeatureChangeReason("");
      refetchFeatures();
      queryClient.invalidateQueries({ queryKey: ["org-features", orgId] });
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setFeatureActionLoading(false);
    }
  }

  // Fetch full org data when dialog opens
  const { data: fullOrg, isLoading } = useQuery({
    queryKey: ["org-edit-detail", orgId],
    queryFn: async () => {
      const token = localStorage.getItem("auth_token");
      const base = (import.meta.env.BASE_URL ?? "").replace(/\/$/, "");
      const r = await fetch(`${base}/api/organizations/${orgId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!r.ok) throw new Error("Failed to load organization");
      return r.json() as Promise<Record<string, any>>;
    },
    enabled: open && !!orgId,
  });

  // Populate form once data arrives
  if (fullOrg && !loaded) {
    setForm({
      name: fullOrg.name ?? "",
      legalName: fullOrg.legalName ?? "",
      shortName: fullOrg.shortName ?? "",
      cageCode: fullOrg.cageCode ?? "",
      uei: fullOrg.uei ?? "",
      industry: fullOrg.industry ?? "",
      primaryContact: fullOrg.primaryContact ?? "",
      organizationAddress: fullOrg.organizationAddress ?? "",
      assessmentScope: fullOrg.assessmentScope ?? "",
      cmmcTargetLevel: fullOrg.cmmcTargetLevel ?? "L2",
      notes: fullOrg.notes ?? "",
    });
    setLoaded(true);
  }

  function handleClose() {
    setLoaded(false);
    setForm({});
    onClose();
  }

  async function handleSave() {
    if (!form.name?.trim()) {
      toast({ title: "Organization name is required", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const token = localStorage.getItem("auth_token");
      const base = (import.meta.env.BASE_URL ?? "").replace(/\/$/, "");
      const r = await fetch(`${base}/api/organizations/${orgId}`, {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: form.name.trim(),
          legalName: form.legalName || null,
          shortName: form.shortName || null,
          cageCode: form.cageCode || null,
          uei: form.uei || null,
          industry: form.industry || null,
          primaryContact: form.primaryContact || null,
          organizationAddress: form.organizationAddress || null,
          assessmentScope: form.assessmentScope || null,
          cmmcTargetLevel: form.cmmcTargetLevel || "L2",
          notes: form.notes || null,
        }),
      });
      if (!r.ok) {
        const err = await r.json().catch(() => ({}));
        throw new Error(err.error ?? "Save failed");
      }
      toast({ title: "Organization profile saved" });
      onSaved();
      handleClose();
    } catch (e: any) {
      toast({ title: "Save failed", description: e.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  const set = (key: string, value: string) => setForm((f) => ({ ...f, [key]: value }));

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) handleClose(); }}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Pencil className="h-4 w-4 text-primary" />
            Edit Organization Profile
          </DialogTitle>
        </DialogHeader>

        {isLoading || !loaded ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="space-y-5 py-2">
            {/* Identity */}
            <div>
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-3 pb-1.5 border-b">
                Organization Identity
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="sm:col-span-2 space-y-1">
                  <Label className="text-xs">Organization Name <span className="text-destructive">*</span></Label>
                  <Input value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="Apex Defense LLC" disabled={saving} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Legal Name</Label>
                  <Input value={form.legalName} onChange={(e) => set("legalName", e.target.value)} placeholder="Full legal entity name" disabled={saving} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Short Name</Label>
                  <Input value={form.shortName} onChange={(e) => set("shortName", e.target.value)} placeholder="Apex" disabled={saving} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">CAGE Code</Label>
                  <Input value={form.cageCode} onChange={(e) => set("cageCode", e.target.value)} placeholder="1ABC2" disabled={saving} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">UEI</Label>
                  <Input value={form.uei} onChange={(e) => set("uei", e.target.value)} placeholder="Unique Entity Identifier" disabled={saving} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Industry</Label>
                  <Input value={form.industry} onChange={(e) => set("industry", e.target.value)} placeholder="Aerospace & Defense" disabled={saving} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">CMMC Target Level</Label>
                  <Select value={form.cmmcTargetLevel} onValueChange={(v) => set("cmmcTargetLevel", v)} disabled={saving}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="L1">Level 1 (FCI only)</SelectItem>
                      <SelectItem value="L2">Level 2 (CUI)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="sm:col-span-2 space-y-1">
                  <Label className="text-xs">Primary Contact</Label>
                  <Input value={form.primaryContact} onChange={(e) => set("primaryContact", e.target.value)} placeholder="Name and title" disabled={saving} />
                </div>
                <div className="sm:col-span-2 space-y-1">
                  <Label className="text-xs">Organization Address</Label>
                  <Input value={form.organizationAddress} onChange={(e) => set("organizationAddress", e.target.value)} placeholder="Street, City, State ZIP" disabled={saving} />
                </div>
              </div>
            </div>

            {/* Assessment */}
            <div>
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-3 pb-1.5 border-b">
                Assessment Scope
              </h3>
              <div className="space-y-1">
                <Label className="text-xs">Assessment Scope Description</Label>
                <Input value={form.assessmentScope} onChange={(e) => set("assessmentScope", e.target.value)} placeholder="Brief description of systems in scope" disabled={saving} />
              </div>
            </div>

            {/* Notes */}
            <div>
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-3 pb-1.5 border-b">
                Notes
              </h3>
              <div className="space-y-1">
                <Label className="text-xs">Internal Notes</Label>
                <textarea
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring resize-none"
                  rows={3}
                  value={form.notes}
                  onChange={(e) => set("notes", e.target.value)}
                  placeholder="Internal notes about this organization"
                  disabled={saving}
                />
              </div>
            </div>

            {/* Modules — only shown for Global Admins */}
            {user?.role === "admin" && (
              <div>
                <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-3 pb-1.5 border-b">
                  Modules
                </h3>
                <div className="space-y-3">
                  {/* Implementation Roadmap */}
                  <div className="rounded-lg border border-border p-4 flex items-start gap-4">
                    <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                      <MapIcon className="h-5 w-5 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-semibold">Implementation Roadmap</span>
                        {isRoadmapEnabled ? (
                          <Badge className="bg-emerald-100 text-emerald-700 border border-emerald-200 hover:bg-emerald-100 text-[10px] px-2 py-0.5">
                            Enabled
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-muted-foreground text-[10px] px-2 py-0.5">
                            Disabled
                          </Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                        Guided implementation actions and evidence collection workflow for CMMC compliance.
                      </p>
                      <div className="mt-3">
                        {isRoadmapEnabled ? (
                          <Button
                            variant="outline"
                            size="sm"
                            className="text-xs h-7 text-red-600 border-red-200 hover:bg-red-50 hover:border-red-300"
                            onClick={() => setFeatureActionDialog({ action: "disable", featureTarget: "IMPLEMENTATION_ROADMAP" })}
                          >
                            Disable Module
                          </Button>
                        ) : (
                          <Button
                            variant="outline"
                            size="sm"
                            className="text-xs h-7 text-emerald-600 border-emerald-200 hover:bg-emerald-50 hover:border-emerald-300"
                            onClick={() => setFeatureActionDialog({ action: "enable", featureTarget: "IMPLEMENTATION_ROADMAP" })}
                          >
                            Enable Module
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Pre-Assessment */}
                  <div className="rounded-lg border border-border p-4 flex items-start gap-4">
                    <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                      <Cable className="h-5 w-5 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-semibold">Pre-Assessment</span>
                        {isPreAssessmentEnabled ? (
                          <Badge className="bg-emerald-100 text-emerald-700 border border-emerald-200 hover:bg-emerald-100 text-[10px] px-2 py-0.5">
                            Enabled
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-muted-foreground text-[10px] px-2 py-0.5">
                            Disabled
                          </Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                        Tenant-connected automated assessment that scans Microsoft 365 configurations against CMMC controls.
                      </p>
                      <div className="mt-3">
                        {isPreAssessmentEnabled ? (
                          <Button
                            variant="outline"
                            size="sm"
                            className="text-xs h-7 text-red-600 border-red-200 hover:bg-red-50 hover:border-red-300"
                            onClick={() => setFeatureActionDialog({ action: "disable", featureTarget: "PRE_ASSESSMENT" })}
                          >
                            Disable Module
                          </Button>
                        ) : (
                          <Button
                            variant="outline"
                            size="sm"
                            className="text-xs h-7 text-emerald-600 border-emerald-200 hover:bg-emerald-50 hover:border-emerald-300"
                            onClick={() => setFeatureActionDialog({ action: "enable", featureTarget: "PRE_ASSESSMENT" })}
                          >
                            Enable Module
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        <DialogFooter className="pt-2 border-t mt-2">
          <Button variant="outline" onClick={handleClose} disabled={saving}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving || isLoading || !loaded}>
            {saving ? <><Loader2 className="h-4 w-4 mr-1.5 animate-spin" />Saving…</> : "Save Changes"}
          </Button>
        </DialogFooter>
      </DialogContent>

      {/* Feature action confirmation dialog */}
      {featureActionDialog && (
        <Dialog open={!!featureActionDialog} onOpenChange={() => { setFeatureActionDialog(null); setFeatureChangeReason(""); }}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                {featureActionDialog.featureTarget === "PRE_ASSESSMENT"
                  ? <Cable className="h-4 w-4 text-primary" />
                  : <MapIcon className="h-4 w-4 text-primary" />
                }
                {featureActionDialog.action === "enable" ? "Enable" : "Disable"}{" "}
                {featureActionDialog.featureTarget === "PRE_ASSESSMENT" ? "Pre-Assessment" : "Implementation Roadmap"}
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-2">
              {featureActionDialog.action === "disable" ? (
                <div className="rounded-md bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 p-3 text-sm text-amber-800 dark:text-amber-400">
                  <p className="font-semibold mb-1">
                    ⚠ This will hide the {featureActionDialog.featureTarget === "PRE_ASSESSMENT" ? "Pre-Assessment" : "Roadmap"} module
                  </p>
                  <p>
                    {featureActionDialog.featureTarget === "PRE_ASSESSMENT"
                      ? "Users will no longer see the Pre-Assessment module in their sidebar. Existing assessment data and connections are preserved and can be re-enabled at any time."
                      : "Users will no longer see the Implementation Roadmap in their sidebar or dashboard. Existing roadmap data is preserved and can be re-enabled at any time."}
                  </p>
                </div>
              ) : (
                <div className="rounded-md bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 p-3 text-sm text-emerald-800 dark:text-emerald-400">
                  <p className="font-semibold mb-1">
                    Enable {featureActionDialog.featureTarget === "PRE_ASSESSMENT" ? "Pre-Assessment" : "Implementation Roadmap"}
                  </p>
                  <p>
                    {featureActionDialog.featureTarget === "PRE_ASSESSMENT"
                      ? "Users with compliance manager or reviewer access will see the Pre-Assessment module in the sidebar."
                      : "Users with compliance manager or reviewer access will see the Implementation Roadmap in the sidebar and dashboard."}
                  </p>
                </div>
              )}
              <div className="space-y-1.5">
                <Label className="text-xs">Change Reason (optional)</Label>
                <textarea
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring resize-none"
                  rows={2}
                  value={featureChangeReason}
                  onChange={(e) => setFeatureChangeReason(e.target.value)}
                  placeholder="Reason for this change (for audit log)"
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => { setFeatureActionDialog(null); setFeatureChangeReason(""); }} disabled={featureActionLoading}>
                Cancel
              </Button>
              <Button
                onClick={handleFeatureToggle}
                disabled={featureActionLoading}
                variant={featureActionDialog.action === "disable" ? "destructive" : "default"}
              >
                {featureActionLoading ? <><Loader2 className="h-4 w-4 mr-1.5 animate-spin" />Saving…</> : featureActionDialog.action === "enable" ? "Enable Module" : "Disable Module"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </Dialog>
  );
}

// ─── Org Card ─────────────────────────────────────────────────────────────────

function OrgCard({ org, onSwitch, onDelete, onInitiateCert, onEdit }: { org: OrgStats; onSwitch: (id: string) => void; onDelete: (id: string, name: string) => void; onInitiateCert: (id: string, name: string) => void; onEdit: (id: string) => void }) {
  const { activeOrg } = useOrg();
  const isActive = activeOrg?.id === org.id;
  const levelColor = org.cmmcTargetLevel === "L1" ? "bg-blue-500/10 text-blue-600 border-blue-200 dark:text-blue-400" : "bg-purple-500/10 text-purple-600 border-purple-200 dark:text-purple-400";

  return (
    <Card className={cn("hover:shadow-md transition-shadow relative", isActive && "ring-2 ring-primary")}>
      <div className="absolute top-3 right-3 flex items-center gap-1.5">
        {org.isTestOrganization && (
          <Badge variant="outline" className="text-[10px] font-semibold px-1.5 py-0 border-amber-300 text-amber-700 bg-amber-50 dark:border-amber-700 dark:text-amber-400 dark:bg-amber-950/40">
            TEST DATA
          </Badge>
        )}
        {isActive && <Badge variant="default" className="text-xs">Active</Badge>}
        {!isActive && (
          <button
            onClick={() => onDelete(org.id, org.name)}
            className="p-1.5 rounded-md text-muted-foreground hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors"
            title="Delete organization"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
      <CardHeader className="pb-3">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
            <Building2 className="h-5 w-5 text-primary" />
          </div>
          <div className="flex-1 min-w-0 pr-16">
            <CardTitle className="text-base truncate">{org.name}</CardTitle>
            <div className="flex items-center gap-2 mt-1">
              <Badge variant="outline" className={cn("text-xs font-semibold", levelColor)}>
                CMMC {org.cmmcTargetLevel ?? "—"}
              </Badge>
            </div>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center gap-4">
          <div className="relative">
            <svg width={56} height={56} className="-rotate-90">
              <circle cx={28} cy={28} r={22} fill="none" stroke="currentColor" strokeWidth={5} className="text-muted/30" />
              <circle
                cx={28} cy={28} r={22}
                fill="none"
                stroke={org.readinessPercent >= 75 ? "#22c55e" : org.readinessPercent >= 40 ? "#f59e0b" : "#ef4444"}
                strokeWidth={5}
                strokeDasharray={2 * Math.PI * 22}
                strokeDashoffset={2 * Math.PI * 22 * (1 - org.readinessPercent / 100)}
                strokeLinecap="round"
              />
            </svg>
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="text-xs font-bold">{org.readinessPercent}%</span>
            </div>
          </div>
          <div className="flex-1">
            <div className="text-xs text-muted-foreground">Readiness</div>
            <div className="text-sm font-medium">{org.implementedControls}/{org.totalControls} controls</div>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="bg-muted/40 rounded-md p-2">
            <AlertTriangle className="h-3.5 w-3.5 mx-auto text-orange-500 mb-0.5" />
            <div className="text-sm font-semibold">{org.openPoams}</div>
            <div className="text-[10px] text-muted-foreground">POA&Ms</div>
          </div>
          <div className="bg-muted/40 rounded-md p-2">
            <CheckSquare className="h-3.5 w-3.5 mx-auto text-blue-500 mb-0.5" />
            <div className="text-sm font-semibold">{org.openTasks}</div>
            <div className="text-[10px] text-muted-foreground">Tasks</div>
          </div>
          <div className="bg-muted/40 rounded-md p-2">
            <FileText className="h-3.5 w-3.5 mx-auto text-green-500 mb-0.5" />
            <div className="text-sm font-semibold">{org.evidenceCount}</div>
            <div className="text-[10px] text-muted-foreground">Evidence</div>
          </div>
        </div>

        <Button
          variant={isActive ? "outline" : "default"}
          size="sm"
          className="w-full"
          onClick={() => onSwitch(org.id)}
        >
          {isActive ? "Currently Viewing" : "Switch to Org"}
        </Button>
        <div className="grid grid-cols-2 gap-2">
          <Button
            variant="outline"
            size="sm"
            className="w-full"
            onClick={() => onEdit(org.id)}
          >
            <Pencil className="h-3.5 w-3.5 mr-1.5" />
            Edit Profile
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="w-full text-blue-600 border-blue-200 hover:bg-blue-50 hover:border-blue-300 dark:text-blue-400 dark:border-blue-800 dark:hover:bg-blue-950/30"
            onClick={() => onInitiateCert(org.id, org.name)}
          >
            <Award className="h-3.5 w-3.5 mr-1.5" />
            Certification
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function OrgCreationWizard({ open, onClose, onSuccess }: { open: boolean; onClose: () => void; onSuccess?: () => void }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { setActiveOrg, refreshOrgs } = useOrg();
  const [, navigate] = useLocation();
  const [step, setStep] = useState(1);

  const [form, setForm] = useState({
    name: "",
    legalName: "",
    shortName: "",
    cageCode: "",
    uei: "",
    industry: "",
    primaryContact: "",
    cmmcTargetLevel: "L2",
    organizationAddress: "",
    assessmentScope: "",
  });
  const [enableRoadmap, setEnableRoadmap] = useState(true);

  const [ctx, setCtx] = useState({
    handlesFci: false,
    handlesCui: false,
    isDodContractor: false,
    hasDfars7012: false,
  });

  const [selectedPkgIds, setSelectedPkgIds] = useState<string[]>([]);
  const [autoApplied, setAutoApplied] = useState(false);
  const [activeProfile, setActiveProfile] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const { data: allPackages = [], isLoading: pkgLoading } = useListPackages(
    undefined,
    { query: { enabled: open } as any }
  );

  const recommendedIds = useMemo(() => {
    const ids = new Set<string>();
    if (ctx.handlesFci && !ctx.handlesCui && !ctx.isDodContractor) {
      ids.add("pkg-cmmc-l1-self");
      ids.add("pkg-far-52-204-21");
    }
    if (ctx.handlesFci && (ctx.isDodContractor || ctx.handlesCui)) {
      ids.add("pkg-cmmc-l1-self");
    }
    if (ctx.handlesCui) {
      ids.add("pkg-cmmc-l2-self");
      ids.add("pkg-nist-800-171-r2");
    }
    if ((ctx.isDodContractor && ctx.handlesCui) || ctx.hasDfars7012) {
      ["pkg-dfars-7012", "pkg-dfars-7019", "pkg-dfars-7020", "pkg-dfars-7021"].forEach(id => ids.add(id));
      ids.add("pkg-cmmc-l2-self");
      ids.add("pkg-nist-800-171-r2");
    }
    return Array.from(ids);
  }, [ctx]);

  useEffect(() => {
    if (step === 3 && !autoApplied && allPackages.length > 0) {
      setSelectedPkgIds(recommendedIds.filter(id => allPackages.some((p: CompliancePkg) => p.id === id)));
      setAutoApplied(true);
    }
  }, [step, allPackages.length, autoApplied, recommendedIds]);

  useEffect(() => {
    if (step <= 2) setAutoApplied(false);
  }, [ctx, step]);

  const grouped = useMemo(() => {
    const map = new Map<string, CompliancePkg[]>();
    for (const pkg of allPackages as CompliancePkg[]) {
      const key = pkg.frameworkShortName ?? "Other";
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(pkg);
    }
    return Array.from(map.entries());
  }, [allPackages]);

  const selectedPkgs = (allPackages as CompliancePkg[]).filter(p => selectedPkgIds.includes(p.id));
  const rawControlCount = selectedPkgs
    .filter(p => p.packageType === "control_framework")
    .reduce((s, p) => s + (p.controlCount ?? 0), 0);
  // Subtract known overlaps: CMMC L2 and NIST 800-171 (r2 or r3) share all 110 controls;
  // CMMC L1 and FAR 52.204-21 share all 17 practices.
  const controlOverlap =
    (selectedPkgIds.includes("pkg-cmmc-l2-self") && selectedPkgIds.includes("pkg-nist-800-171-r2") ? 110 : 0) +
    (selectedPkgIds.includes("pkg-cmmc-l2-self") && selectedPkgIds.includes("pkg-nist-800-171-r3") ? 110 : 0) +
    (selectedPkgIds.includes("pkg-cmmc-l1-self") && selectedPkgIds.includes("pkg-far-52-204-21") ? 17 : 0);
  const totalControlCount = Math.max(0, rawControlCount - controlOverlap);

  const handleCreate = async () => {
    if (!form.name.trim()) return;
    setCreating(true);
    try {
      const token = localStorage.getItem("auth_token");
      const base = (import.meta.env.BASE_URL ?? "").replace(/\/$/, "");

      const orgRes = await fetch(`${base}/api/organizations`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(form),
      });
      if (!orgRes.ok) {
        const errData = await orgRes.json().catch(() => ({}));
        throw new Error(errData.error ?? "Failed to create organization");
      }
      const newOrg = await orgRes.json();

      let pkgAssignFailed = false;
      if (selectedPkgIds.length > 0) {
        const pkgRes = await fetch(`${base}/api/organizations/${newOrg.id}/packages`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ packageIds: selectedPkgIds }),
        });
        if (!pkgRes.ok) pkgAssignFailed = true;
      }

      // If roadmap is explicitly disabled, record it now
      if (!enableRoadmap) {
        await fetch(`${base}/api/organizations/${newOrg.id}/features/IMPLEMENTATION_ROADMAP`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ enabled: false, changeReason: "Disabled during organization creation" }),
        }).catch(() => { /* non-fatal */ });
      }

      // Build an OrgSummary so we can switch into the new org immediately
      const newOrgSummary = {
        id: newOrg.id,
        name: newOrg.name ?? form.name,
        shortName: newOrg.shortName ?? form.shortName ?? null,
        cmmcTargetLevel: newOrg.cmmcTargetLevel ?? form.cmmcTargetLevel ?? null,
        industry: newOrg.industry ?? form.industry ?? null,
        isActive: true,
        isTestOrganization: false,
        certificationModuleState: "NOT_AVAILABLE",
        role: "admin",
      };
      setActiveOrg(newOrgSummary);
      await refreshOrgs();
      queryClient.invalidateQueries();

      if (pkgAssignFailed) {
        toast({
          title: "Organization created",
          description: `${form.name} was created successfully. Package assignment failed — add packages in Settings > Compliance Packages.`,
          variant: "default",
        });
      } else {
        toast({
          title: "Organization created",
          description: selectedPkgIds.length > 0
            ? `${form.name} created with ${selectedPkgIds.length} compliance package${selectedPkgIds.length !== 1 ? "s" : ""}`
            : `${form.name} created successfully`,
        });
      }
      onSuccess?.();
      handleClose();
      navigate("/");
    } catch (err: any) {
      toast({ title: "Error", description: err.message ?? "Could not create organization", variant: "destructive" });
    } finally {
      setCreating(false);
    }
  };

  const handleClose = () => {
    setStep(1);
    setForm({ name: "", legalName: "", shortName: "", cageCode: "", uei: "", industry: "", primaryContact: "", cmmcTargetLevel: "L2", organizationAddress: "", assessmentScope: "" });
    setCtx({ handlesFci: false, handlesCui: false, isDodContractor: false, hasDfars7012: false });
    setSelectedPkgIds([]);
    setAutoApplied(false);
    setActiveProfile(null);
    setEnableRoadmap(true);
    onClose();
  };

  const STEP_TITLES = [
    "Organization Profile",
    "Contract & Data Context",
    "Compliance Package Selection",
    "Review Summary",
    "Confirm & Create",
  ];

  const contextQuestions = [
    {
      key: "handlesFci" as const,
      label: "Handles Federal Contract Information (FCI)",
      desc: "Receives or processes information provided by the federal government under a contract, not intended for public release.",
    },
    {
      key: "handlesCui" as const,
      label: "Handles Controlled Unclassified Information (CUI)",
      desc: "Processes, stores, or transmits information designated as CUI — including technical data, export-controlled info, or personally identifiable information.",
    },
    {
      key: "isDodContractor" as const,
      label: "Active DoD Prime or Subcontractor",
      desc: "Holds or performs work under active Department of Defense contracts or subcontracts.",
    },
    {
      key: "hasDfars7012" as const,
      label: "Contract Includes DFARS 252.204-7012",
      desc: "DoD contracts explicitly include the DFARS 252.204-7012 clause (Safeguarding Covered Defense Information).",
    },
  ];

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl flex flex-col overflow-hidden" style={{ maxHeight: "90vh" }}>
        <DialogHeader className="shrink-0 pb-2">
          <div className="flex items-center gap-1.5 mb-3">
            {[1, 2, 3, 4, 5].map(n => (
              <div
                key={n}
                className={cn(
                  "h-1 flex-1 rounded-full transition-all duration-300",
                  n <= step ? "bg-primary" : "bg-muted"
                )}
              />
            ))}
          </div>
          <div className="text-xs font-medium text-muted-foreground">Step {step} of 5</div>
          <DialogTitle className="text-lg">{STEP_TITLES[step - 1]}</DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto min-h-0 pr-1">
          {step === 1 && (
            <div className="space-y-4 py-1">
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <Label>Organization Name <span className="text-destructive">*</span></Label>
                  <Input
                    value={form.name}
                    onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                    placeholder="Apex Defense LLC"
                    autoFocus
                  />
                </div>
                <div>
                  <Label>Legal Name</Label>
                  <Input value={form.legalName} onChange={e => setForm(f => ({ ...f, legalName: e.target.value }))} placeholder="Full legal entity name" />
                </div>
                <div>
                  <Label>Short Name</Label>
                  <Input value={form.shortName} onChange={e => setForm(f => ({ ...f, shortName: e.target.value }))} placeholder="Apex" />
                </div>
                <div>
                  <Label>CAGE Code</Label>
                  <Input value={form.cageCode} onChange={e => setForm(f => ({ ...f, cageCode: e.target.value }))} placeholder="1ABC2" />
                </div>
                <div>
                  <Label>UEI</Label>
                  <Input value={form.uei} onChange={e => setForm(f => ({ ...f, uei: e.target.value }))} placeholder="Unique Entity Identifier" />
                </div>
                <div>
                  <Label>Industry</Label>
                  <Input value={form.industry} onChange={e => setForm(f => ({ ...f, industry: e.target.value }))} placeholder="Aerospace & Defense" />
                </div>
                <div>
                  <Label>CMMC Target Level</Label>
                  <Select value={form.cmmcTargetLevel} onValueChange={v => setForm(f => ({ ...f, cmmcTargetLevel: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="L1">Level 1 (FCI only)</SelectItem>
                      <SelectItem value="L2">Level 2 (CUI)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="col-span-2">
                  <Label>Primary Contact</Label>
                  <Input value={form.primaryContact} onChange={e => setForm(f => ({ ...f, primaryContact: e.target.value }))} placeholder="Contact name and title" />
                </div>
                <div className="col-span-2">
                  <Label>Organization Address</Label>
                  <Input value={form.organizationAddress} onChange={e => setForm(f => ({ ...f, organizationAddress: e.target.value }))} placeholder="Street, City, State ZIP" />
                </div>
                <div className="col-span-2">
                  <Label>Assessment Scope</Label>
                  <Input value={form.assessmentScope} onChange={e => setForm(f => ({ ...f, assessmentScope: e.target.value }))} placeholder="Brief description of systems in scope" />
                </div>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-3 py-1">
              <p className="text-sm text-muted-foreground">
                Answer a few quick questions about this organization's data and contracts. We'll use your answers to recommend the right compliance packages on the next step.
              </p>
              {contextQuestions.map(({ key, label, desc }) => (
                <button
                  key={key}
                  type="button"
                  className={cn(
                    "w-full text-left rounded-lg border p-4 transition-all",
                    ctx[key]
                      ? "border-primary bg-primary/5"
                      : "border-border hover:border-primary/40 hover:bg-muted/30"
                  )}
                  onClick={() => setCtx(c => ({ ...c, [key]: !c[key] }))}
                >
                  <div className="flex items-start gap-3">
                    <div className={cn(
                      "mt-0.5 w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 transition-colors",
                      ctx[key] ? "border-primary bg-primary" : "border-border bg-background"
                    )}>
                      {ctx[key] && <Check className="h-3 w-3 text-primary-foreground" strokeWidth={3} />}
                    </div>
                    <div>
                      <div className="font-medium text-sm">{label}</div>
                      <div className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{desc}</div>
                    </div>
                  </div>
                </button>
              ))}
              {!ctx.handlesFci && !ctx.handlesCui && !ctx.isDodContractor && (
                <p className="text-xs text-muted-foreground italic pt-1">
                  You can proceed without selecting any options and choose packages manually, or skip packages and add them later in Settings.
                </p>
              )}
            </div>
          )}

          {step === 3 && (
            <div className="space-y-5 py-1">
              {/* Quick Start profiles */}
              <div>
                <div className="text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-2">Quick Start Profile</div>
                <div className="grid grid-cols-2 gap-2">
                  {QUICK_START_PROFILES.map(profile => {
                    const isActive = activeProfile === profile.id;
                    const availableIds = profile.pkgIds.filter(id =>
                      allPackages.some((p: CompliancePkg) => p.id === id)
                    );
                    return (
                      <button
                        key={profile.id}
                        type="button"
                        className={cn(
                          "text-left rounded-lg border p-3 transition-all",
                          isActive
                            ? "border-primary bg-primary/5 ring-1 ring-primary/30"
                            : "border-border hover:border-primary/40 hover:bg-muted/20"
                        )}
                        onClick={() => {
                          if (isActive) {
                            setActiveProfile(null);
                            setSelectedPkgIds([]);
                          } else {
                            setActiveProfile(profile.id);
                            setSelectedPkgIds(availableIds);
                          }
                        }}
                      >
                        <div className="flex items-start gap-2">
                          <div className={cn(
                            "mt-0.5 w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors",
                            isActive ? "border-primary bg-primary" : "border-border bg-background"
                          )}>
                            {isActive && <Check className="h-2.5 w-2.5 text-primary-foreground" strokeWidth={3} />}
                          </div>
                          <div>
                            <div className="text-sm font-semibold leading-tight">{profile.label}</div>
                            <div className="text-[11px] text-muted-foreground mt-0.5 leading-relaxed">{profile.description}</div>
                            <div className="text-[10px] text-primary mt-1">{availableIds.length} package{availableIds.length !== 1 ? "s" : ""}</div>
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
                {activeProfile && (
                  <button
                    type="button"
                    className="mt-1.5 text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
                    onClick={() => { setActiveProfile(null); }}
                  >
                    Clear profile — customize manually below
                  </button>
                )}
              </div>

              {recommendedIds.length > 0 && !activeProfile && (
                <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 text-sm">
                  <span className="font-semibold text-primary">
                    {recommendedIds.filter(id => allPackages.some((p: CompliancePkg) => p.id === id)).length} package{recommendedIds.filter(id => allPackages.some((p: CompliancePkg) => p.id === id)).length !== 1 ? "s" : ""} recommended
                  </span>
                  <span className="text-muted-foreground"> based on your Step 2 answers. Customize below.</span>
                </div>
              )}

              {pkgLoading ? (
                <div className="space-y-3">
                  {[1, 2, 3].map(i => <div key={i} className="h-20 animate-pulse bg-muted rounded-lg" />)}
                </div>
              ) : (
                <div className="space-y-5">
                  <div className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">Individual Packages</div>
                  {grouped.map(([framework, pkgs]) => (
                    <div key={framework}>
                      <div className="text-[11px] font-medium text-muted-foreground mb-1.5">{framework}</div>
                      <div className="space-y-2">
                        {pkgs.map(pkg => {
                          const isSelected = selectedPkgIds.includes(pkg.id);
                          const isRecommended = recommendedIds.includes(pkg.id);
                          return (
                            <button
                              key={pkg.id}
                              type="button"
                              className={cn(
                                "w-full text-left rounded-lg border p-3 transition-all",
                                isSelected
                                  ? "border-primary bg-primary/5"
                                  : "border-border hover:border-primary/40 hover:bg-muted/30"
                              )}
                              onClick={() => {
                                setActiveProfile(null);
                                setSelectedPkgIds(prev =>
                                  prev.includes(pkg.id)
                                    ? prev.filter(id => id !== pkg.id)
                                    : [...prev, pkg.id]
                                );
                              }}
                            >
                              <div className="flex items-start gap-3">
                                <div className={cn(
                                  "mt-0.5 w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 transition-colors",
                                  isSelected ? "border-primary bg-primary" : "border-border bg-background"
                                )}>
                                  {isSelected && <Check className="h-3 w-3 text-primary-foreground" strokeWidth={3} />}
                                </div>
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <span className="text-sm font-medium">{pkg.name}</span>
                                    {pkg.version && <span className="text-xs text-muted-foreground">{pkg.version}</span>}
                                    {isRecommended && (
                                      <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-amber-100 text-amber-700 border border-amber-200">
                                        ★ Recommended
                                      </span>
                                    )}
                                  </div>
                                  <div className="text-xs text-muted-foreground mt-0.5 line-clamp-2 leading-relaxed">{pkg.description}</div>
                                  {pkg.controlCount != null && (
                                    <div className="text-[10px] text-muted-foreground mt-1.5">{pkg.controlCount} controls/requirements</div>
                                  )}
                                </div>
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <p className="text-xs text-muted-foreground">
                {selectedPkgIds.length === 0
                  ? "No packages selected — you can proceed without packages and add them later in Settings."
                  : `${selectedPkgIds.length} package${selectedPkgIds.length !== 1 ? "s" : ""} selected.`}
              </p>
            </div>
          )}

          {step === 4 && (
            <div className="space-y-5 py-1">
              <div className="rounded-lg border border-border bg-muted/20 p-4 space-y-3">
                <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Organization Details</div>
                <div className="space-y-2 text-sm divide-y divide-border/50">
                  <div className="flex justify-between gap-2 py-1.5">
                    <span className="text-muted-foreground">Name</span>
                    <span className="font-medium">{form.name}</span>
                  </div>
                  {form.shortName && (
                    <div className="flex justify-between gap-2 py-1.5">
                      <span className="text-muted-foreground">Short Name</span>
                      <span>{form.shortName}</span>
                    </div>
                  )}
                  <div className="flex justify-between gap-2 py-1.5">
                    <span className="text-muted-foreground">CMMC Target Level</span>
                    <span className="font-medium">Level {form.cmmcTargetLevel?.replace("L", "")}</span>
                  </div>
                  {form.industry && (
                    <div className="flex justify-between gap-2 py-1.5">
                      <span className="text-muted-foreground">Industry</span>
                      <span>{form.industry}</span>
                    </div>
                  )}
                  {form.primaryContact && (
                    <div className="flex justify-between gap-2 py-1.5">
                      <span className="text-muted-foreground">Primary Contact</span>
                      <span>{form.primaryContact}</span>
                    </div>
                  )}
                </div>
              </div>

              <div>
                <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                  Compliance Packages — {selectedPkgIds.length} selected
                </div>
                {selectedPkgIds.length === 0 ? (
                  <div className="rounded-lg border border-dashed border-border p-4 text-center">
                    <p className="text-sm text-muted-foreground">
                      No packages selected — you can add packages later in Settings &gt; Compliance Packages.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {selectedPkgs.map(pkg => (
                      <div key={pkg.id} className="flex items-center justify-between gap-2 p-2.5 rounded-md border border-border/60 bg-muted/20">
                        <div className="flex items-center gap-2 min-w-0">
                          <Badge variant="outline" className={cn("text-[10px] px-1.5 py-0 shrink-0", fwBadgeColor(pkg.frameworkShortName))}>
                            {pkg.frameworkShortName}
                          </Badge>
                          <span className="text-sm font-medium truncate">{pkg.name}</span>
                          {pkg.version && <span className="text-xs text-muted-foreground shrink-0">{pkg.version}</span>}
                        </div>
                        {pkg.controlCount != null && (
                          <span className="text-xs text-muted-foreground shrink-0">{pkg.controlCount} req.</span>
                        )}
                      </div>
                    ))}
                    {totalControlCount > 0 && (
                      <div className="text-xs text-muted-foreground pt-1 text-right">
                        Control framework scope: <span className="font-semibold text-foreground">{totalControlCount} requirements</span>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Compliance impact summary */}
              {selectedPkgIds.length > 0 && (
                <div>
                  <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                    What will be provisioned
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    {totalControlCount > 0 && (
                      <div className="rounded-md border border-border/60 bg-muted/20 p-3 text-center">
                        <div className="text-2xl font-bold text-foreground">{totalControlCount}</div>
                        <div className="text-xs text-muted-foreground mt-0.5">controls to assess</div>
                      </div>
                    )}
                    <div className="rounded-md border border-border/60 bg-muted/20 p-3 text-center">
                      <div className="text-2xl font-bold text-foreground">19</div>
                      <div className="text-xs text-muted-foreground mt-0.5">monitoring items</div>
                    </div>
                    {selectedPkgs.some(p => p.packageType === "assessment_procedure") && (
                      <div className="rounded-md border border-border/60 bg-muted/20 p-3 text-center">
                        <div className="text-2xl font-bold text-foreground">
                          {selectedPkgs.filter(p => p.packageType === "assessment_procedure").reduce((s, p) => s + (p.controlCount ?? 0), 0)}
                        </div>
                        <div className="text-xs text-muted-foreground mt-0.5">assessment methods</div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Overlap callout */}
              {selectedPkgIds.includes("pkg-cmmc-l2-self") && selectedPkgIds.includes("pkg-nist-800-171-r2") && (
                <div className="rounded-lg border border-blue-200 bg-blue-50 dark:bg-blue-950/20 dark:border-blue-800 p-3 text-xs text-blue-800 dark:text-blue-300">
                  <p className="font-semibold mb-0.5">CMMC L2 ↔ NIST 800-171 overlap</p>
                  <p>CMMC Level 2 and NIST 800-171 r2 cover the same 110 security requirements. Assessments and evidence submitted for one will count toward both — reducing your compliance workload.</p>
                </div>
              )}

              {selectedPkgs.some(p => p.frameworkShortName === "DFARS") && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-800 p-3 text-xs text-amber-800 dark:text-amber-300">
                  <p className="font-semibold mb-0.5">DFARS clause obligations included</p>
                  <p>DFARS packages carry contractual obligations: 72-hour cyber incident reporting, subcontractor flowdown, and SSP/POA&amp;M maintenance. These will be pre-loaded as monitoring items.</p>
                </div>
              )}

              {/* Implementation Roadmap toggle */}
              <div>
                <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                  Optional Modules
                </div>
                <button
                  type="button"
                  className={cn(
                    "w-full text-left rounded-lg border p-4 transition-all",
                    enableRoadmap
                      ? "border-primary bg-primary/5"
                      : "border-border hover:border-primary/40 hover:bg-muted/30"
                  )}
                  onClick={() => setEnableRoadmap(v => !v)}
                >
                  <div className="flex items-start gap-3">
                    <div className={cn(
                      "mt-0.5 w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 transition-colors",
                      enableRoadmap ? "border-primary bg-primary" : "border-border bg-background"
                    )}>
                      {enableRoadmap && <Check className="h-3 w-3 text-primary-foreground" strokeWidth={3} />}
                    </div>
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-sm">Enable Implementation Roadmap</span>
                        <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-primary/10 text-primary">Recommended</span>
                      </div>
                      <div className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
                        Guided implementation actions and evidence collection workflow for CMMC compliance. Can be enabled or disabled later from Organization Settings.
                      </div>
                    </div>
                  </div>
                </button>
              </div>
            </div>
          )}

          {step === 5 && (
            <div className="space-y-6 py-4">
              <div className="flex flex-col items-center text-center gap-3 py-2">
                <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center">
                  <Building2 className="h-7 w-7 text-primary" />
                </div>
                <div>
                  <h3 className="text-xl font-bold">{form.name}</h3>
                  <div className="flex items-center justify-center gap-2 mt-2 flex-wrap">
                    <Badge variant="outline">CMMC Level {form.cmmcTargetLevel?.replace("L", "")}</Badge>
                    {selectedPkgIds.length > 0 && (
                      <Badge variant="outline">{selectedPkgIds.length} package{selectedPkgIds.length !== 1 ? "s" : ""}</Badge>
                    )}
                    {form.industry && <Badge variant="outline">{form.industry}</Badge>}
                  </div>
                </div>
              </div>

              <div className="rounded-lg border border-border divide-y divide-border text-sm">
                <div className="flex justify-between gap-2 px-4 py-3">
                  <span className="text-muted-foreground">Organization name</span>
                  <span className="font-medium">{form.name}</span>
                </div>
                {form.shortName && (
                  <div className="flex justify-between gap-2 px-4 py-3">
                    <span className="text-muted-foreground">Short name</span>
                    <span>{form.shortName}</span>
                  </div>
                )}
                <div className="flex justify-between gap-2 px-4 py-3">
                  <span className="text-muted-foreground">CMMC target level</span>
                  <span>Level {form.cmmcTargetLevel?.replace("L", "")}</span>
                </div>
                <div className="flex justify-between gap-2 px-4 py-3">
                  <span className="text-muted-foreground">Compliance packages</span>
                  <span>{selectedPkgIds.length === 0 ? "None (add later)" : `${selectedPkgIds.length} package${selectedPkgIds.length !== 1 ? "s" : ""}`}</span>
                </div>
              </div>

              <p className="text-xs text-muted-foreground text-center">
                Clicking "Create Organization" will provision this tenant and assign the selected compliance packages. You will be added as an administrator.
              </p>
            </div>
          )}
        </div>

        <DialogFooter className="shrink-0 pt-4 border-t mt-4">
          <Button
            type="button"
            variant="outline"
            onClick={step === 1 ? handleClose : () => setStep(s => s - 1)}
          >
            {step === 1 ? "Cancel" : "← Back"}
          </Button>
          {step < 5 ? (
            <Button
              onClick={() => setStep(s => s + 1)}
              disabled={step === 1 && !form.name.trim()}
            >
              Next →
            </Button>
          ) : (
            <Button
              onClick={handleCreate}
              disabled={creating || !form.name.trim()}
            >
              {creating ? "Creating..." : "Create Organization"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function Organizations() {
  const { user } = useAuth();
  const { orgs, setActiveOrg, refreshOrgs } = useOrg();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [showNew, setShowNew] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [certWizardOrg, setCertWizardOrg] = useState<{ id: string; name: string } | null>(null);
  const [editOrgId, setEditOrgId] = useState<string | null>(null);

  const { data: stats = [], isLoading, refetch } = useQuery<OrgStats[]>({
    queryKey: ["global-stats"],
    queryFn: async () => {
      const token = localStorage.getItem("auth_token");
      const res = await fetch("/api/organizations/global-stats", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Failed to fetch stats");
      return res.json();
    },
    enabled: user?.role === "admin",
  });

  const handleSwitch = (orgId: string) => {
    const contextOrg = orgs.find((o) => o.id === orgId);
    if (contextOrg) {
      setActiveOrg(contextOrg);
      toast({ title: `Switched to ${contextOrg.name}` });
      queryClient.invalidateQueries();
      return;
    }
    const statOrg = stats.find((s) => s.id === orgId);
    if (statOrg) {
      setActiveOrg({
        id: statOrg.id,
        name: statOrg.name,
        shortName: statOrg.shortName,
        cmmcTargetLevel: statOrg.cmmcTargetLevel,
        industry: null,
        isActive: true,
        certificationModuleState: "NOT_AVAILABLE",
        isTestOrganization: statOrg.isTestOrganization,
        role: "admin",
      });
      toast({ title: `Switched to ${statOrg.name}` });
      queryClient.invalidateQueries();
    }
  };

  const handleDeleteConfirm = async () => {
    if (!deleteTarget || deleteConfirmText !== deleteTarget.name) return;
    setDeleting(true);
    try {
      const token = localStorage.getItem("auth_token");
      const res = await fetch(`/api/organizations/${deleteTarget.id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Failed to delete organization");
      toast({ title: `"${deleteTarget.name}" deleted` });
      queryClient.invalidateQueries({ queryKey: ["global-stats"] });
      refreshOrgs();
      setDeleteTarget(null);
      setDeleteConfirmText("");
    } catch {
      toast({ title: "Error", description: "Could not delete organization", variant: "destructive" });
    } finally {
      setDeleting(false);
    }
  };

  if (user?.role !== "admin") {
    return (
      <div className="p-8 text-center text-muted-foreground">
        <Building2 className="h-12 w-12 mx-auto mb-3 opacity-30" />
        <p>Admin access required to manage organizations.</p>
      </div>
    );
  }

  const totalReadiness = stats.length > 0 ? Math.round(stats.reduce((s, o) => s + o.readinessPercent, 0) / stats.length) : 0;
  const totalPoams = stats.reduce((s, o) => s + o.openPoams, 0);
  const totalTasks = stats.reduce((s, o) => s + o.openTasks, 0);

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Building2 className="h-7 w-7 text-primary" />
            Organizations
          </h1>
          <p className="text-muted-foreground mt-1">Manage client organizations and monitor compliance readiness across all tenants.</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => { refetch(); refreshOrgs(); }}>
            <RefreshCw className="h-4 w-4 mr-1" />
            Refresh
          </Button>
          <Button onClick={() => setShowNew(true)}>
            <Plus className="h-4 w-4 mr-1" />
            Add Organization
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-4">
        <Card className="col-span-1">
          <CardContent className="pt-5 pb-4">
            <div className="text-3xl font-bold text-primary">{stats.length}</div>
            <div className="text-sm text-muted-foreground mt-0.5">Total Organizations</div>
          </CardContent>
        </Card>
        <Card className="col-span-1">
          <CardContent className="pt-5 pb-4">
            <div className="text-3xl font-bold">{totalReadiness}%</div>
            <div className="text-sm text-muted-foreground mt-0.5">Avg. Readiness</div>
          </CardContent>
        </Card>
        <Card className="col-span-1">
          <CardContent className="pt-5 pb-4">
            <div className="text-3xl font-bold text-orange-500">{totalPoams}</div>
            <div className="text-sm text-muted-foreground mt-0.5">Open POA&Ms</div>
          </CardContent>
        </Card>
        <Card className="col-span-1">
          <CardContent className="pt-5 pb-4">
            <div className="text-3xl font-bold text-blue-500">{totalTasks}</div>
            <div className="text-sm text-muted-foreground mt-0.5">Open Tasks</div>
          </CardContent>
        </Card>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <Card key={i} className="h-64 animate-pulse bg-muted" />
          ))}
        </div>
      ) : stats.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center">
            <Building2 className="h-12 w-12 mx-auto mb-3 text-muted-foreground/40" />
            <p className="text-muted-foreground">No organizations found. Create one to get started.</p>
            <Button className="mt-4" onClick={() => setShowNew(true)}>
              <Plus className="h-4 w-4 mr-1" /> Add Organization
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {stats.map((org) => (
            <OrgCard
              key={org.id}
              org={org}
              onSwitch={handleSwitch}
              onDelete={(id, name) => setDeleteTarget({ id, name })}
              onInitiateCert={(id, name) => setCertWizardOrg({ id, name })}
              onEdit={(id) => setEditOrgId(id)}
            />
          ))}
        </div>
      )}

      {stats.length > 1 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Compliance Comparison</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-muted-foreground">
                    <th className="text-left font-medium pb-2 pr-4">Organization</th>
                    <th className="text-center font-medium pb-2 px-3">Level</th>
                    <th className="text-center font-medium pb-2 px-3">Readiness</th>
                    <th className="text-center font-medium pb-2 px-3">Controls</th>
                    <th className="text-center font-medium pb-2 px-3">POA&Ms</th>
                    <th className="text-center font-medium pb-2 px-3">Tasks</th>
                    <th className="text-center font-medium pb-2 px-3">Evidence</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {stats.map((org) => (
                    <tr key={org.id} className="hover:bg-muted/30 transition-colors">
                      <td className="py-2.5 pr-4 font-medium">{org.name}</td>
                      <td className="text-center py-2.5 px-3">
                        <Badge variant="outline" className="text-xs">
                          {org.cmmcTargetLevel ?? "—"}
                        </Badge>
                      </td>
                      <td className="text-center py-2.5 px-3">
                        <div className="flex items-center justify-center gap-1.5">
                          <div className="w-16 h-1.5 rounded-full bg-muted overflow-hidden">
                            <div
                              className="h-full rounded-full transition-all"
                              style={{
                                width: `${org.readinessPercent}%`,
                                backgroundColor: org.readinessPercent >= 75 ? "#22c55e" : org.readinessPercent >= 40 ? "#f59e0b" : "#ef4444",
                              }}
                            />
                          </div>
                          <span className="text-xs font-medium">{org.readinessPercent}%</span>
                        </div>
                      </td>
                      <td className="text-center py-2.5 px-3 text-muted-foreground">{org.implementedControls}/{org.totalControls}</td>
                      <td className="text-center py-2.5 px-3">
                        <span className={cn("font-medium", org.openPoams > 0 && "text-orange-500")}>{org.openPoams}</span>
                      </td>
                      <td className="text-center py-2.5 px-3">
                        <span className={cn("font-medium", org.openTasks > 0 && "text-blue-500")}>{org.openTasks}</span>
                      </td>
                      <td className="text-center py-2.5 px-3 text-muted-foreground">{org.evidenceCount}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      <OrgCreationWizard open={showNew} onClose={() => setShowNew(false)} onSuccess={refreshOrgs} />

      {editOrgId && (
        <EditOrgDialog
          open={!!editOrgId}
          orgId={editOrgId}
          onClose={() => setEditOrgId(null)}
          onSaved={() => {
            refetch();
            refreshOrgs();
            queryClient.invalidateQueries({ queryKey: ["org-edit-detail", editOrgId] });
          }}
        />
      )}

      {certWizardOrg && (
        <CertificationInitiateWizard
          open={!!certWizardOrg}
          orgId={certWizardOrg.id}
          orgName={certWizardOrg.name}
          onClose={() => setCertWizardOrg(null)}
          onSuccess={() => { refetch(); queryClient.invalidateQueries({ queryKey: ["global-stats"] }); }}
        />
      )}

      <Dialog open={!!deleteTarget} onOpenChange={() => { setDeleteTarget(null); setDeleteConfirmText(""); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-600">
              <Trash2 className="h-5 w-5" />
              Delete Organization
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="rounded-md bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 p-3 text-sm text-red-700 dark:text-red-400">
              <p className="font-semibold mb-1">⚠ This action is permanent and cannot be undone.</p>
              <p>Deleting <span className="font-semibold">"{deleteTarget?.name}"</span> will remove the organization and all user memberships. Controls, evidence, tasks, and POA&Ms scoped to this org will no longer be accessible.</p>
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm">
                Type <span className="font-semibold text-foreground">{deleteTarget?.name}</span> to confirm:
              </Label>
              <Input
                value={deleteConfirmText}
                onChange={(e) => setDeleteConfirmText(e.target.value)}
                placeholder={deleteTarget?.name}
                className="font-mono"
                autoComplete="off"
              />
            </div>
          </div>
          <DialogFooter className="mt-2">
            <Button variant="outline" onClick={() => { setDeleteTarget(null); setDeleteConfirmText(""); }}>Cancel</Button>
            <Button
              variant="destructive"
              onClick={handleDeleteConfirm}
              disabled={deleting || deleteConfirmText !== deleteTarget?.name}
            >
              {deleting ? "Deleting..." : "Delete Organization"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
