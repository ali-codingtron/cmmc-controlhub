import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import {
  Archive,
  CheckCircle2,
  ChevronRight,
  Download,
  FileSpreadsheet,
  FolderOpen,
  Layers,
  List,
  Loader2,
  TriangleAlert,
  Users,
  Filter,
  Shield,
  Star,
  AlertTriangle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";

// ── Types ─────────────────────────────────────────────────────────────────────

type ZipStructure = "flat" | "byDomain" | "byControl" | "byType";
type ExportScope = "selected" | "filtered" | "allApproved" | "entireOrg";
type FileNaming = "descriptive" | "original";

export interface BulkDownloadWizardProps {
  open: boolean;
  onClose: () => void;
  orgId: string;
  orgName: string;
  filteredEvidenceIds: string[];
  filteredDocumentIds: string[];
  selectedEvidenceIds: string[];
  selectedDocumentIds: string[];
  context?: "evidence" | "documents" | "both";
}

// ── Constants ─────────────────────────────────────────────────────────────────

const STRUCTURE_OPTIONS: {
  value: ZipStructure;
  label: string;
  description: string;
  preview: string;
  icon: React.ReactNode;
  recommended?: string;
}[] = [
  {
    value: "byDomain",
    label: "By Security Domain › Control ID",
    description: "Best for CMMC review and manual navigation.",
    preview: "AC_Access_Control/\n  AC.L1-3.1.1/\n    files…\nSC_System_and_Comms_Protection/\n  SC.L2-3.13.4/\n    files…",
    icon: <Layers className="h-4 w-4" />,
    recommended: "Manual Review",
  },
  {
    value: "byControl",
    label: "By Control ID",
    description: "Best for C3PAO control-by-control upload.",
    preview: "AC.L1-3.1.1/\n  files…\nSC.L2-3.13.4/\n  files…",
    icon: <FolderOpen className="h-4 w-4" />,
  },
  {
    value: "byType",
    label: "By File Type",
    description: "Best for evidence cleanup and audit prep.",
    preview: "Policies/\nScreenshots/\nLogs/\nReports/",
    icon: <List className="h-4 w-4" />,
  },
  {
    value: "flat",
    label: "Flat ZIP with Manifest",
    description: "Best for uploading to another system.",
    preview: "Files/\n  all files…\n00_Manifest/\n  File_Index.xlsx\n  Control_Mapping.xlsx",
    icon: <Archive className="h-4 w-4" />,
    recommended: "C3PAO Upload",
  },
];

const STATUS_OPTIONS: { value: string; label: string; default: boolean; color: string }[] = [
  { value: "approved", label: "Approved", default: true, color: "bg-green-100 text-green-700 border-green-200" },
  { value: "active", label: "Active", default: true, color: "bg-blue-100 text-blue-700 border-blue-200" },
  { value: "assessor_ready", label: "Assessor Ready", default: true, color: "bg-purple-100 text-purple-700 border-purple-200" },
  { value: "submitted", label: "Submitted", default: false, color: "bg-sky-100 text-sky-700 border-sky-200" },
  { value: "pending_review", label: "Pending Review", default: false, color: "bg-yellow-100 text-yellow-700 border-yellow-200" },
  { value: "draft", label: "Draft", default: false, color: "bg-gray-100 text-gray-600 border-gray-200" },
  { value: "stale", label: "Stale", default: false, color: "bg-orange-100 text-orange-700 border-orange-200" },
  { value: "archived", label: "Archived", default: false, color: "bg-slate-100 text-slate-600 border-slate-200" },
];

function apiHeaders(orgId: string) {
  const token = localStorage.getItem("auth_token");
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token ?? ""}`,
    "X-Organization-ID": orgId,
  };
}

// ── Step indicator ─────────────────────────────────────────────────────────────

const STEPS = ["Scope", "Content", "Structure", "Review", "Generate"] as const;

function StepIndicator({ step }: { step: number }) {
  return (
    <div className="flex items-center gap-0 mb-6">
      {STEPS.map((label, i) => {
        const n = i + 1;
        const active = step === n;
        const done = step > n;
        return (
          <div key={label} className="flex items-center">
            <div className={cn(
              "flex items-center gap-1.5 text-xs font-medium transition-colors",
              active && "text-primary",
              done && "text-muted-foreground",
              !active && !done && "text-muted-foreground/50"
            )}>
              <span className={cn(
                "h-6 w-6 rounded-full flex items-center justify-center text-xs font-semibold border shrink-0",
                active && "bg-primary text-primary-foreground border-primary",
                done && "bg-primary/20 text-primary border-primary/30",
                !active && !done && "border-muted-foreground/30 text-muted-foreground/50"
              )}>
                {done ? "✓" : n}
              </span>
              <span className="hidden sm:block">{label}</span>
            </div>
            {i < STEPS.length - 1 && (
              <div className={cn(
                "h-px w-6 sm:w-8 mx-1",
                step > i + 1 ? "bg-primary/40" : "bg-muted-foreground/20"
              )} />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Component ─────────────────────────────────────────────────────────────────

export function BulkDownloadWizard({
  open,
  onClose,
  orgId,
  orgName,
  filteredEvidenceIds,
  filteredDocumentIds,
  selectedEvidenceIds,
  selectedDocumentIds,
  context = "both",
}: BulkDownloadWizardProps) {
  const { toast } = useToast();

  const selectedCount = selectedEvidenceIds.length + selectedDocumentIds.length;
  const filteredCount = filteredEvidenceIds.length + filteredDocumentIds.length;

  const [step, setStep] = useState<1 | 2 | 3 | 4 | 5>(1);
  const [scope, setScope] = useState<ExportScope>(selectedCount > 0 ? "selected" : "allApproved");
  const [includeEvidence, setIncludeEvidence] = useState(context !== "documents");
  const [includeDocs, setIncludeDocs] = useState(context !== "evidence");
  const [statusFilters, setStatusFilters] = useState<string[]>(["approved", "active", "assessor_ready"]);
  const [includeUnmapped, setIncludeUnmapped] = useState(false);
  const [structure, setStructure] = useState<ZipStructure>("byDomain");
  const [filenaming, setFilenaming] = useState<FileNaming>("descriptive");
  const [includeManifest, setIncludeManifest] = useState(true);
  const [includeControlMapping, setIncludeControlMapping] = useState(true);
  const [includeHashManifest, setIncludeHashManifest] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isServerScope = scope === "allApproved" || scope === "entireOrg";

  // IDs to export for non-server scopes
  const exportEvidenceIds = (() => {
    if (!includeEvidence) return [];
    if (scope === "selected") return selectedEvidenceIds;
    if (scope === "filtered") return filteredEvidenceIds;
    return [];
  })();
  const exportDocumentIds = (() => {
    if (!includeDocs) return [];
    if (scope === "selected") return selectedDocumentIds;
    if (scope === "filtered") return filteredDocumentIds;
    return [];
  })();

  const canGenerate = isServerScope || exportEvidenceIds.length > 0 || exportDocumentIds.length > 0;
  const canProceed = includeEvidence || includeDocs;

  function toggleStatus(s: string) {
    setStatusFilters((prev) =>
      prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]
    );
  }

  function handleClose() {
    if (isGenerating) return;
    setStep(1);
    setDone(false);
    setError(null);
    onClose();
  }

  function next() { setStep((s) => Math.min(s + 1, 5) as 1 | 2 | 3 | 4 | 5); }
  function back() { setStep((s) => Math.max(s - 1, 1) as 1 | 2 | 3 | 4 | 5); }

  async function handleGenerate() {
    setIsGenerating(true);
    setError(null);
    setStep(5);

    const exportDateStr = new Date().toISOString().slice(0, 10);
    const orgSlug = orgName.replace(/[^\w]/g, "").toUpperCase().slice(0, 12) || "ORG";
    const filename = `${orgSlug}_Bulk_Download_${exportDateStr}.zip`;

    const body = {
      scope,
      evidenceIds: exportEvidenceIds,
      documentIds: exportDocumentIds,
      includeEvidence,
      includeDocuments: includeDocs,
      statusFilters,
      includeUnmapped,
      structure,
      filenaming,
      includeFiles: true,
      includeManifest,
      includeControlMapping,
      includeHashManifest,
      exportDescription: `${scope} — ${structure}`,
    };

    try {
      const res = await fetch("/api/export/bulk-download", {
        method: "POST",
        headers: apiHeaders(orgId),
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        throw new Error((errBody as any).error ?? `Server error ${res.status}`);
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
      setDone(true);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      setError(msg);
      toast({ title: "Export failed", description: msg, variant: "destructive" });
    } finally {
      setIsGenerating(false);
    }
  }

  // ── Step 1: Scope ─────────────────────────────────────────────────────────

  function Step1() {
    const options: {
      value: ExportScope;
      label: string;
      sublabel: string;
      icon: React.ReactNode;
      badge?: string;
      count?: string;
      disabled?: boolean;
    }[] = [
      {
        value: "selected",
        label: "Selected Items",
        sublabel: "Download only the rows currently selected.",
        icon: <Filter className="h-5 w-5" />,
        count: selectedCount > 0 ? `${selectedCount} item${selectedCount !== 1 ? "s" : ""}` : undefined,
        disabled: selectedCount === 0,
      },
      {
        value: "allApproved",
        label: "Approved / Active / Assessor Ready",
        sublabel: "Recommended for assessor review. Includes all ready evidence and documents.",
        icon: <Star className="h-5 w-5 text-amber-500" />,
        badge: "Recommended",
      },
      {
        value: "filtered",
        label: "Current Filter Results",
        sublabel: "Download all items matching the current search and filters.",
        icon: <Shield className="h-5 w-5" />,
        count: filteredCount > 0 ? `${filteredCount} item${filteredCount !== 1 ? "s" : ""}` : "0 items",
      },
      {
        value: "entireOrg",
        label: "Entire Organization",
        sublabel: "Export all permitted evidence and documents for this organization.",
        icon: <Users className="h-5 w-5" />,
        badge: filteredCount > 500 ? "Large export" : undefined,
      },
    ];

    return (
      <div className="space-y-3">
        <p className="text-sm text-muted-foreground mb-4">
          Choose which items to include in the export package.
        </p>
        {options.map((opt) => (
          <button
            key={opt.value}
            type="button"
            disabled={opt.disabled}
            onClick={() => !opt.disabled && setScope(opt.value)}
            className={cn(
              "w-full flex items-start gap-3 p-4 rounded-xl border text-left transition-all",
              scope === opt.value
                ? "border-primary bg-primary/5 ring-1 ring-primary/20"
                : "border-border hover:bg-muted/30",
              opt.disabled && "opacity-40 cursor-not-allowed"
            )}
          >
            <div className={cn(
              "mt-0.5 p-2 rounded-lg shrink-0",
              scope === opt.value ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"
            )}>
              {opt.icon}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm font-semibold">{opt.label}</span>
                {opt.badge && (
                  <Badge className={cn(
                    "text-[10px] px-1.5",
                    opt.badge === "Recommended"
                      ? "bg-amber-100 text-amber-700 border-amber-200"
                      : "bg-red-100 text-red-700 border-red-200"
                  )}>
                    {opt.badge}
                  </Badge>
                )}
                {opt.count && (
                  <Badge variant="secondary" className="text-[10px] px-1.5">{opt.count}</Badge>
                )}
                {opt.disabled && (
                  <span className="text-[11px] text-muted-foreground">(none selected)</span>
                )}
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">{opt.sublabel}</p>
            </div>
            <div className={cn(
              "mt-1 h-4 w-4 rounded-full border-2 shrink-0 flex items-center justify-center",
              scope === opt.value ? "border-primary bg-primary" : "border-muted-foreground/40"
            )}>
              {scope === opt.value && <div className="h-2 w-2 rounded-full bg-white" />}
            </div>
          </button>
        ))}
      </div>
    );
  }

  // ── Step 2: Content ───────────────────────────────────────────────────────

  function Step2() {
    return (
      <div className="space-y-6">
        <div>
          <p className="text-sm font-semibold mb-3">Files to include</p>
          <div className="flex gap-6">
            <label className={cn("flex items-center gap-2", context === "documents" && "opacity-50")}>
              <Checkbox
                checked={includeEvidence}
                onCheckedChange={(v) => setIncludeEvidence(!!v)}
                disabled={context === "documents"}
              />
              <span className="text-sm">Evidence files</span>
            </label>
            <label className={cn("flex items-center gap-2", context === "evidence" && "opacity-50")}>
              <Checkbox
                checked={includeDocs}
                onCheckedChange={(v) => setIncludeDocs(!!v)}
                disabled={context === "evidence"}
              />
              <span className="text-sm">Documents</span>
            </label>
          </div>
        </div>

        <div>
          <p className="text-sm font-semibold mb-1">Status filter</p>
          <p className="text-xs text-muted-foreground mb-3">
            {scope === "allApproved"
              ? "Scope is pre-set to Approved/Active/Assessor Ready. You can expand it below."
              : "Only include items with these statuses."}
          </p>
          <div className="flex flex-wrap gap-2">
            {STATUS_OPTIONS.map((s) => {
              const checked = statusFilters.includes(s.value);
              return (
                <button
                  key={s.value}
                  type="button"
                  onClick={() => toggleStatus(s.value)}
                  className={cn(
                    "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-all",
                    checked ? s.color : "bg-muted/30 text-muted-foreground border-muted hover:bg-muted/50"
                  )}
                >
                  {checked && <CheckCircle2 className="h-3 w-3" />}
                  {s.label}
                </button>
              );
            })}
          </div>
          {statusFilters.length === 0 && (
            <p className="text-xs text-amber-600 mt-2 flex items-center gap-1">
              <AlertTriangle className="h-3 w-3" />
              No statuses selected — export will be empty
            </p>
          )}
        </div>

        <div>
          <p className="text-sm font-semibold mb-3">Manifests</p>
          <div className="space-y-2">
            {[
              { key: "manifest", label: "File_Index.xlsx", desc: "Full file list with metadata, controls, and status", state: includeManifest, set: setIncludeManifest, locked: false },
              { key: "control", label: "Control_Mapping.xlsx", desc: "Each control linked to every supporting artifact", state: includeControlMapping, set: setIncludeControlMapping, locked: false },
              { key: "hash", label: "File_Hash_Manifest.xlsx", desc: "SHA-256 hash for every file (integrity verification)", state: includeHashManifest, set: setIncludeHashManifest, locked: false },
            ].map(({ key, label, desc, state, set }) => (
              <label key={key} className="flex items-start gap-3 cursor-pointer">
                <Checkbox checked={state} onCheckedChange={(v) => set(!!v)} className="mt-0.5" />
                <div>
                  <span className="text-sm font-medium flex items-center gap-1.5">
                    <FileSpreadsheet className="h-3.5 w-3.5 text-green-600" />
                    {label}
                  </span>
                  <p className="text-xs text-muted-foreground">{desc}</p>
                </div>
              </label>
            ))}
            <p className="text-xs text-muted-foreground pt-1">
              Export_Issues.xlsx and Export_Summary.pdf are always included.
            </p>
          </div>
        </div>

        <div className="rounded-lg border p-3 space-y-2">
          <label className="flex items-start gap-3 cursor-pointer">
            <Checkbox
              checked={includeUnmapped}
              onCheckedChange={(v) => setIncludeUnmapped(!!v)}
              className="mt-0.5"
            />
            <div>
              <span className="text-sm font-medium">Include unmapped items</span>
              <p className="text-xs text-muted-foreground">
                Items with no linked CMMC control are excluded by default. Enable this to place them in{" "}
                <code className="text-xs font-mono bg-muted px-1 rounded">00_Unmapped_Needs_Review/</code>{" "}
                within the ZIP.
              </p>
            </div>
          </label>
        </div>
      </div>
    );
  }

  // ── Step 3: Structure ─────────────────────────────────────────────────────

  function Step3() {
    const namingOptions: { value: FileNaming; label: string; description: string; example: string }[] = [
      {
        value: "descriptive",
        label: "Descriptive (control + type + date)",
        description: "Encodes the primary control ID, artifact type, and collection date into every filename.",
        example: "AC.L1-3.1.1__Policy__Access_Control_Policy__2024-01-15.pdf",
      },
      {
        value: "original",
        label: "Original filename",
        description: "Keeps the filename exactly as uploaded. Control numbers appear in the manifest spreadsheets.",
        example: "Access_Control_Policy_v2.pdf",
      },
    ];

    return (
      <div className="space-y-6">
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Choose how files are organized inside the ZIP.
          </p>
        {STRUCTURE_OPTIONS.map((opt) => (
          <label
            key={opt.value}
            className={cn(
              "flex items-start gap-3 p-4 rounded-xl border cursor-pointer transition-all",
              structure === opt.value
                ? "border-primary bg-primary/5 ring-1 ring-primary/20"
                : "border-border hover:bg-muted/30"
            )}
          >
            <input
              type="radio"
              name="structure"
              value={opt.value}
              checked={structure === opt.value}
              onChange={() => setStructure(opt.value)}
              className="accent-primary mt-1"
            />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="flex items-center gap-1.5 text-sm font-semibold">
                  {opt.icon}
                  {opt.label}
                </span>
                {opt.recommended && (
                  <Badge className="text-[10px] bg-blue-100 text-blue-700 border-blue-200">
                    {opt.recommended}
                  </Badge>
                )}
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">{opt.description}</p>
              <pre className={cn(
                "mt-2 text-[10px] font-mono leading-relaxed px-3 py-2 rounded-md",
                structure === opt.value
                  ? "bg-primary/8 text-primary/80"
                  : "bg-muted/40 text-muted-foreground"
              )}>
                {opt.preview}
              </pre>
            </div>
          </label>
        ))}
        </div>

        {/* File naming section */}
        <div className="space-y-3">
          <div>
            <p className="text-sm font-semibold">File naming</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Control numbers always appear in the manifest spreadsheets regardless of this setting.
            </p>
          </div>
          {namingOptions.map((opt) => (
            <label
              key={opt.value}
              className={cn(
                "flex items-start gap-3 p-3.5 rounded-xl border cursor-pointer transition-all",
                filenaming === opt.value
                  ? "border-primary bg-primary/5 ring-1 ring-primary/20"
                  : "border-border hover:bg-muted/30"
              )}
            >
              <input
                type="radio"
                name="filenaming"
                value={opt.value}
                checked={filenaming === opt.value}
                onChange={() => setFilenaming(opt.value)}
                className="accent-primary mt-1"
              />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold">{opt.label}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{opt.description}</p>
                <code className={cn(
                  "mt-1.5 block text-[10px] font-mono px-2 py-1 rounded-md truncate",
                  filenaming === opt.value
                    ? "bg-primary/8 text-primary/80"
                    : "bg-muted/40 text-muted-foreground"
                )}>
                  {opt.example}
                </code>
              </div>
            </label>
          ))}
        </div>
      </div>
    );
  }

  // ── Step 4: Review ────────────────────────────────────────────────────────

  function Step4() {
    const structureLabel = STRUCTURE_OPTIONS.find((s) => s.value === structure)?.label ?? structure;
    const scopeLabels: Record<ExportScope, string> = {
      selected: `${selectedCount} selected items`,
      filtered: `${filteredCount} filtered items`,
      allApproved: "All Approved / Active / Assessor Ready",
      entireOrg: "Entire organization",
    };

    const rows: [string, string][] = [
      ["Organization", orgName],
      ["Scope", scopeLabels[scope]],
      ["Status filter", statusFilters.length ? statusFilters.map((s) => s.replace(/_/g, " ")).join(", ") : "All statuses"],
      ["Content", [includeEvidence && "Evidence", includeDocs && "Documents"].filter(Boolean).join(" + ") || "None"],
      ["Unmapped items", includeUnmapped ? "Included → 00_Unmapped_Needs_Review/" : "Excluded (listed in Export_Issues.xlsx)"],
      ["ZIP structure", structureLabel],
      ["File naming", filenaming === "original" ? "Original filename (controls in manifest)" : "Descriptive (control + type + date)"],
      ["Manifests", [includeManifest && "File_Index", includeControlMapping && "Control_Mapping", includeHashManifest && "Hash_Manifest"].filter(Boolean).join(", ") || "Export_Issues + Summary only"],
    ];

    return (
      <div className="space-y-4">
        <div className="rounded-xl border bg-muted/20 divide-y text-sm overflow-hidden">
          {rows.map(([label, value]) => (
            <div key={label} className="flex justify-between px-4 py-2.5 gap-4">
              <span className="text-muted-foreground shrink-0">{label}</span>
              <span className="font-medium text-right">{value}</span>
            </div>
          ))}
        </div>

        {!canGenerate && (
          <div className="rounded-xl border border-red-200 bg-red-50 p-3 flex gap-2 text-sm text-red-700">
            <TriangleAlert className="h-4 w-4 shrink-0 mt-0.5" />
            <span>No items match the selected scope. Go back and adjust your scope or filters.</span>
          </div>
        )}

        {!canProceed && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 flex gap-2 text-sm text-amber-700">
            <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
            <span>Neither Evidence nor Documents is selected. Go back to Content and check at least one.</span>
          </div>
        )}

        {!includeUnmapped && (
          <div className="rounded-xl border border-sky-200 bg-sky-50 p-3 flex gap-2 text-sm text-sky-700">
            <Shield className="h-4 w-4 shrink-0 mt-0.5" />
            <span>
              Items without a linked CMMC control will be <strong>excluded</strong> and listed in Export_Issues.xlsx.
              To include them, go back to Content and enable "Include unmapped items."
            </span>
          </div>
        )}

        <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
          Large exports (&gt;100 files) may take 30–90 seconds to generate. The browser will download the ZIP when
          complete — do not close this window.
        </div>
      </div>
    );
  }

  // ── Step 5: Generate ──────────────────────────────────────────────────────

  function Step5() {
    if (done) {
      return (
        <div className="py-8 text-center space-y-4">
          <div className="h-16 w-16 rounded-full bg-green-100 flex items-center justify-center mx-auto">
            <CheckCircle2 className="h-9 w-9 text-green-500" />
          </div>
          <div>
            <p className="font-semibold text-lg">Package Downloaded</p>
            <p className="text-sm text-muted-foreground mt-1">
              Your export package has been saved to your Downloads folder.
            </p>
          </div>
          <Button onClick={handleClose} className="mt-2">Close</Button>
        </div>
      );
    }

    if (error) {
      return (
        <div className="py-8 text-center space-y-4">
          <div className="h-16 w-16 rounded-full bg-red-100 flex items-center justify-center mx-auto">
            <TriangleAlert className="h-9 w-9 text-red-500" />
          </div>
          <div>
            <p className="font-semibold text-lg">Export Failed</p>
            <p className="text-sm text-muted-foreground mt-1">{error}</p>
          </div>
          <div className="flex justify-center gap-2">
            <Button variant="outline" onClick={() => { setError(null); setStep(4); }}>Back to Review</Button>
            <Button onClick={handleGenerate}>Retry</Button>
          </div>
        </div>
      );
    }

    // Generating
    return (
      <div className="py-8 text-center space-y-5">
        <div className="h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto">
          <Loader2 className="h-9 w-9 text-primary animate-spin" />
        </div>
        <div>
          <p className="font-semibold text-lg">Building ZIP Package…</p>
          <p className="text-sm text-muted-foreground mt-1">
            Collecting files, resolving control mappings, and compressing.
          </p>
          <p className="text-xs text-muted-foreground mt-2">
            Large exports may take 15–90 seconds. You may keep this window open.
          </p>
        </div>
        <div className="flex justify-center gap-2 text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <Shield className="h-3 w-3" /> Resolving control links
          </span>
          <span>·</span>
          <span className="flex items-center gap-1.5">
            <Archive className="h-3 w-3" /> Compressing files
          </span>
          <span>·</span>
          <span className="flex items-center gap-1.5">
            <FileSpreadsheet className="h-3 w-3" /> Generating manifests
          </span>
        </div>
      </div>
    );
  }

  // ── Main render ───────────────────────────────────────────────────────────

  const isLastReviewStep = step === 4;
  const hideFooter = step === 5;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && handleClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader className="pb-0">
          <DialogTitle className="flex items-center gap-2 text-lg">
            <div className="p-1.5 rounded-lg bg-primary/10">
              <Archive className="h-5 w-5 text-primary" />
            </div>
            Create Export Package
          </DialogTitle>
          <p className="text-sm text-muted-foreground mt-1">
            Download evidence and documents with control mappings, manifests, and C3PAO-friendly structure.
          </p>
        </DialogHeader>

        <div className="pt-4">
          <StepIndicator step={step} />

          {step === 1 && Step1()}
          {step === 2 && Step2()}
          {step === 3 && Step3()}
          {step === 4 && Step4()}
          {step === 5 && Step5()}
        </div>

        {!hideFooter && (
          <div className="flex items-center justify-between pt-4 border-t mt-2">
            <div>
              {step > 1 && step < 5 && (
                <Button variant="ghost" onClick={back} size="sm">
                  ← Back
                </Button>
              )}
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={handleClose} size="sm">
                Cancel
              </Button>
              {!isLastReviewStep ? (
                <Button
                  onClick={next}
                  disabled={step === 2 && !canProceed}
                  size="sm"
                >
                  Next
                  <ChevronRight className="h-4 w-4 ml-1" />
                </Button>
              ) : (
                <Button
                  onClick={handleGenerate}
                  disabled={!canGenerate || !canProceed || statusFilters.length === 0}
                  size="sm"
                >
                  <Download className="h-4 w-4 mr-1.5" />
                  Generate Package
                </Button>
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
