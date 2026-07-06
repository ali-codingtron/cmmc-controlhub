import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
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
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";

// ── Types ─────────────────────────────────────────────────────────────────────

type ZipStructure = "flat" | "byDomain" | "byControl" | "byType";

type Scope = "selected" | "filtered" | "allApproved";

export interface BulkDownloadWizardProps {
  open: boolean;
  onClose: () => void;
  orgId: string;
  orgName: string;
  /** IDs of items currently visible after client filters */
  filteredEvidenceIds: string[];
  filteredDocumentIds: string[];
  /** IDs of items the user has checked */
  selectedEvidenceIds: string[];
  selectedDocumentIds: string[];
  /** Which context triggered the wizard */
  context?: "evidence" | "documents" | "both";
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const STRUCTURE_OPTIONS: {
  value: ZipStructure;
  label: string;
  description: string;
  icon: React.ReactNode;
}[] = [
  {
    value: "byDomain",
    label: "By Security Domain",
    description: "AC_Access_Control / AC.L1-3.1.1 / files…  Best for CMMC review.",
    icon: <Layers className="h-4 w-4" />,
  },
  {
    value: "byControl",
    label: "By Control ID",
    description: "AC.L1-3.1.1 / files…  Best for C3PAO control-by-control review.",
    icon: <FolderOpen className="h-4 w-4" />,
  },
  {
    value: "byType",
    label: "By File Type",
    description: "Policies / Screenshots / Logs / Reports…  Best for audit prep.",
    icon: <List className="h-4 w-4" />,
  },
  {
    value: "flat",
    label: "Flat ZIP with Manifest",
    description: "All files in /Files with standardised names.  Best for upload into another system.",
    icon: <Archive className="h-4 w-4" />,
  },
];

function apiHeaders(orgId: string) {
  const token = localStorage.getItem("auth_token");
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token ?? ""}`,
    "X-Organization-ID": orgId,
  };
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

  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [scope, setScope] = useState<Scope>(
    selectedEvidenceIds.length + selectedDocumentIds.length > 0 ? "selected" : "filtered"
  );
  const [includeEvidence, setIncludeEvidence] = useState(
    context !== "documents"
  );
  const [includeDocs, setIncludeDocs] = useState(context !== "evidence");
  const [structure, setStructure] = useState<ZipStructure>("byDomain");
  const [includeManifest, setIncludeManifest] = useState(true);
  const [includeControlMapping, setIncludeControlMapping] = useState(true);
  const [includeHashManifest, setIncludeHashManifest] = useState(false);

  const [isGenerating, setIsGenerating] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Compute the IDs that will be exported based on scope + includeEvidence/includeDocs
  const exportEvidenceIds: string[] = (() => {
    if (!includeEvidence) return [];
    if (scope === "selected") return selectedEvidenceIds;
    if (scope === "filtered") return filteredEvidenceIds;
    return []; // "allApproved" handled server-side — pass empty to trigger server-side query
  })();

  const exportDocumentIds: string[] = (() => {
    if (!includeDocs) return [];
    if (scope === "selected") return selectedDocumentIds;
    if (scope === "filtered") return filteredDocumentIds;
    return [];
  })();

  const totalCount = exportEvidenceIds.length + exportDocumentIds.length;
  const selectedCount = selectedEvidenceIds.length + selectedDocumentIds.length;
  const filteredCount = filteredEvidenceIds.length + filteredDocumentIds.length;

  const scopeDescription: Record<Scope, string> = {
    selected: `${selectedCount} selected item${selectedCount !== 1 ? "s" : ""}`,
    filtered: `${filteredCount} filtered item${filteredCount !== 1 ? "s" : ""}`,
    allApproved: "all Approved / Active / Assessor Ready items",
  };

  function handleClose() {
    if (isGenerating) return;
    setStep(1);
    setDone(false);
    setError(null);
    onClose();
  }

  async function handleGenerate() {
    if (!exportEvidenceIds.length && !exportDocumentIds.length && scope !== "allApproved") {
      toast({
        title: "Nothing to export",
        description: "No items match the selected scope.",
        variant: "destructive",
      });
      return;
    }

    setIsGenerating(true);
    setError(null);

    const exportDateStr = new Date().toISOString().slice(0, 10);
    const orgSlug = orgName.replace(/[^\w]/g, "").toUpperCase().slice(0, 12) || "ORG";
    const filename = `${orgSlug}_Bulk_Download_${exportDateStr}.zip`;

    try {
      const res = await fetch("/api/export/bulk-download", {
        method: "POST",
        headers: apiHeaders(orgId),
        body: JSON.stringify({
          evidenceIds: exportEvidenceIds,
          documentIds: exportDocumentIds,
          structure,
          includeFiles: true,
          includeManifest,
          includeControlMapping,
          includeHashManifest,
          exportDescription: `${scopeDescription[scope]} — ${structure}`,
        }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body as any).error ?? `Server error ${res.status}`);
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

  // ── Render helpers ────────────────────────────────────────────────────────

  function StepIndicator() {
    const steps = ["Scope", "Structure", "Generate"];
    return (
      <div className="flex items-center gap-1 mb-6">
        {steps.map((label, i) => {
          const n = (i + 1) as 1 | 2 | 3;
          const active = step === n;
          const done = step > n;
          return (
            <div key={label} className="flex items-center gap-1">
              <div
                className={cn(
                  "flex items-center gap-1.5 text-sm font-medium transition-colors",
                  active && "text-primary",
                  done && "text-muted-foreground",
                  !active && !done && "text-muted-foreground/60"
                )}
              >
                <span
                  className={cn(
                    "h-6 w-6 rounded-full flex items-center justify-center text-xs font-semibold border",
                    active && "bg-primary text-primary-foreground border-primary",
                    done && "bg-muted text-muted-foreground border-muted-foreground/30",
                    !active && !done && "border-muted-foreground/30 text-muted-foreground/60"
                  )}
                >
                  {done ? "✓" : n}
                </span>
                {label}
              </div>
              {i < steps.length - 1 && (
                <ChevronRight className="h-3 w-3 text-muted-foreground/40 mx-1" />
              )}
            </div>
          );
        })}
      </div>
    );
  }

  // ── Step 1: Scope ─────────────────────────────────────────────────────────
  function Step1() {
    const scopeOptions: { value: Scope; label: string; count: number; disabled?: boolean }[] = [
      {
        value: "selected",
        label: "Selected items only",
        count: selectedCount,
        disabled: selectedCount === 0,
      },
      {
        value: "filtered",
        label: "All currently filtered items",
        count: filteredCount,
      },
      {
        value: "allApproved",
        label: "All Approved / Active / Assessor Ready items",
        count: 0,
      },
    ];

    return (
      <div className="space-y-5">
        <div>
          <p className="text-sm font-semibold mb-3">What to export</p>
          <div className="space-y-2">
            {scopeOptions.map((opt) => (
              <label
                key={opt.value}
                className={cn(
                  "flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors",
                  scope === opt.value
                    ? "border-primary bg-primary/5"
                    : "border-border hover:bg-muted/30",
                  opt.disabled && "opacity-40 cursor-not-allowed"
                )}
              >
                <input
                  type="radio"
                  name="scope"
                  value={opt.value}
                  checked={scope === opt.value}
                  disabled={opt.disabled}
                  onChange={() => !opt.disabled && setScope(opt.value)}
                  className="accent-primary"
                />
                <span className="text-sm flex-1">{opt.label}</span>
                {opt.value !== "allApproved" && (
                  <Badge variant="secondary" className="text-xs ml-auto">
                    {opt.count} item{opt.count !== 1 ? "s" : ""}
                  </Badge>
                )}
              </label>
            ))}
          </div>
        </div>

        <div>
          <p className="text-sm font-semibold mb-3">Content to include</p>
          <div className="flex gap-6">
            <label className="flex items-center gap-2 cursor-pointer">
              <Checkbox
                checked={includeEvidence}
                onCheckedChange={(v) => setIncludeEvidence(!!v)}
                disabled={context === "documents"}
              />
              <span className="text-sm">Evidence files</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <Checkbox
                checked={includeDocs}
                onCheckedChange={(v) => setIncludeDocs(!!v)}
                disabled={context === "evidence"}
              />
              <span className="text-sm">Documents</span>
            </label>
          </div>
        </div>
      </div>
    );
  }

  // ── Step 2: Structure + manifests ────────────────────────────────────────
  function Step2() {
    return (
      <div className="space-y-5">
        <div>
          <p className="text-sm font-semibold mb-3">ZIP folder structure</p>
          <div className="space-y-2">
            {STRUCTURE_OPTIONS.map((opt) => (
              <label
                key={opt.value}
                className={cn(
                  "flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors",
                  structure === opt.value
                    ? "border-primary bg-primary/5"
                    : "border-border hover:bg-muted/30"
                )}
              >
                <input
                  type="radio"
                  name="structure"
                  value={opt.value}
                  checked={structure === opt.value}
                  onChange={() => setStructure(opt.value)}
                  className="accent-primary mt-0.5"
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 text-sm font-medium">
                    {opt.icon}
                    {opt.label}
                    {opt.value === "byDomain" && (
                      <Badge className="text-[10px] bg-blue-100 text-blue-700 border-blue-200">Default</Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5 font-mono">{opt.description}</p>
                </div>
              </label>
            ))}
          </div>
        </div>

        <div>
          <p className="text-sm font-semibold mb-3">Manifests to include in 00_Manifest/</p>
          <div className="space-y-2">
            {[
              { key: "manifest", label: "File_Index.xlsx", desc: "Full file index with metadata, linked controls, and status", state: includeManifest, set: setIncludeManifest },
              { key: "control", label: "Control_Mapping.xlsx", desc: "Each control and every file that supports it", state: includeControlMapping, set: setIncludeControlMapping },
              { key: "hash", label: "File_Hash_Manifest.xlsx", desc: "SHA-256 hash for every exported file (integrity verification)", state: includeHashManifest, set: setIncludeHashManifest },
            ].map(({ key, label, desc, state, set }) => (
              <label key={key} className="flex items-start gap-3 cursor-pointer">
                <Checkbox
                  checked={state}
                  onCheckedChange={(v) => set(!!v)}
                  className="mt-0.5"
                />
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
      </div>
    );
  }

  // ── Step 3: Generate ──────────────────────────────────────────────────────
  function Step3() {
    if (done) {
      return (
        <div className="py-6 text-center space-y-3">
          <CheckCircle2 className="h-12 w-12 text-green-500 mx-auto" />
          <p className="font-semibold text-lg">ZIP Downloaded Successfully</p>
          <p className="text-sm text-muted-foreground">
            Your bulk download package has been saved to your Downloads folder.
          </p>
          <Button onClick={handleClose} className="mt-2">Close</Button>
        </div>
      );
    }

    if (error) {
      return (
        <div className="py-6 text-center space-y-3">
          <TriangleAlert className="h-12 w-12 text-red-400 mx-auto" />
          <p className="font-semibold text-lg">Export Failed</p>
          <p className="text-sm text-muted-foreground">{error}</p>
          <div className="flex justify-center gap-2">
            <Button variant="outline" onClick={() => { setError(null); setStep(2); }}>Back</Button>
            <Button onClick={handleGenerate}>Retry</Button>
          </div>
        </div>
      );
    }

    if (isGenerating) {
      return (
        <div className="py-8 text-center space-y-4">
          <Loader2 className="h-12 w-12 text-primary animate-spin mx-auto" />
          <p className="font-semibold">Building ZIP Package…</p>
          <p className="text-sm text-muted-foreground">
            Collecting files, generating manifests, and compressing. This may take 15–60 seconds for large exports.
          </p>
        </div>
      );
    }

    const structureLabel = STRUCTURE_OPTIONS.find((s) => s.value === structure)?.label ?? structure;

    return (
      <div className="space-y-4">
        <p className="text-sm font-semibold">Export Summary</p>
        <div className="rounded-lg border bg-muted/20 divide-y text-sm">
          {[
            ["Organization", orgName],
            ["Scope", scopeDescription[scope]],
            ["ZIP Structure", structureLabel],
            ["Evidence Items", includeEvidence ? String(exportEvidenceIds.length || "all eligible") : "Not included"],
            ["Documents", includeDocs ? String(exportDocumentIds.length || "all eligible") : "Not included"],
            ["Manifests", [includeManifest && "File_Index", includeControlMapping && "Control_Mapping", includeHashManifest && "Hash_Manifest"].filter(Boolean).join(", ") || "Export_Issues + Summary only"],
          ].map(([label, value]) => (
            <div key={label} className="flex justify-between px-4 py-2.5">
              <span className="text-muted-foreground">{label}</span>
              <span className="font-medium text-right max-w-[60%] truncate">{value}</span>
            </div>
          ))}
        </div>

        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
          Large exports (&gt;100 files) may take 30–90 seconds to generate. The browser will download the ZIP when complete — do not close this window.
        </div>

        <Button className="w-full" onClick={handleGenerate} disabled={totalCount === 0 && scope !== "allApproved"}>
          <Download className="h-4 w-4 mr-2" />
          Generate &amp; Download ZIP
        </Button>
      </div>
    );
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && handleClose()}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Archive className="h-5 w-5" />
            Bulk Download
          </DialogTitle>
        </DialogHeader>

        <div className="py-1">
          <StepIndicator />

          {step === 1 && <Step1 />}
          {step === 2 && <Step2 />}
          {step === 3 && <Step3 />}
        </div>

        {!isGenerating && !done && (
          <DialogFooter className="gap-2 sm:gap-2">
            {step > 1 && (
              <Button variant="outline" onClick={() => setStep((s) => (s - 1) as 1 | 2 | 3)}>
                Back
              </Button>
            )}
            <Button variant="outline" onClick={handleClose}>
              Cancel
            </Button>
            {step < 3 && (
              <Button
                onClick={() => setStep((s) => (s + 1) as 1 | 2 | 3)}
                disabled={!includeEvidence && !includeDocs}
              >
                Next
                <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            )}
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}
