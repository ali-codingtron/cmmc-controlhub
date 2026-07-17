import { useState, useRef, useCallback } from "react";
import { useOrg } from "@/context/OrgContext";
import { useQueryClient } from "@tanstack/react-query";
import { getListEvidenceQueryKey } from "@workspace/api-client-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import {
  Upload,
  FileSpreadsheet,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Download,
  Loader2,
  ArrowLeft,
  Info,
  FileX,
  ChevronDown,
  ChevronUp,
  ExternalLink,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────

interface PreviewRow {
  rowNum: number;
  fileName: string;
  folderPath: string;
  evidenceTitle: string;
  evidenceType: string;
  status: string;
  linkedControlRefs: string[];
  validControlIds: string[];
  invalidControlRefs: string[];
  fileFound: boolean;
  duplicateHandling: string;
  errors: string[];
  warnings: string[];
}

interface Preview {
  totalRows: number;
  filesMatched: number;
  filesMissing: string[];
  controlsMatched: number;
  invalidControls: string[];
  evidenceToCreate: number;
  mappingsToCreate: number;
  duplicateFilenames: string[];
  rows: PreviewRow[];
}

interface ImportResult {
  created: number;
  uploaded: number;
  mappingsCreated: number;
  skipped: number;
  failed: number;
  errors: Array<{ rowNum: number; fileName: string; error: string }>;
}

type Step = "upload" | "parsing" | "preview" | "importing" | "done";

interface Props {
  open: boolean;
  onClose: () => void;
  onImported: () => void;
}

// ─── Component ─────────────────────────────────────────────────────────────

export function EvidenceMappingImportModal({ open, onClose, onImported }: Props) {
  const { activeOrg } = useOrg();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [step, setStep] = useState<Step>("upload");
  const [importId, setImportId] = useState<string | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [showAllRows, setShowAllRows] = useState(false);
  const [expandedErrors, setExpandedErrors] = useState(false);
  const dragCounter = useRef(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const apiHeaders = useCallback(() => {
    const token = localStorage.getItem("auth_token");
    const h: Record<string, string> = {};
    if (token) h["Authorization"] = `Bearer ${token}`;
    if (activeOrg?.id) h["X-Organization-ID"] = activeOrg.id;
    return h;
  }, [activeOrg]);

  const resetAndClose = () => {
    setStep("upload");
    setImportId(null);
    setPreview(null);
    setResult(null);
    setIsDragging(false);
    setShowAllRows(false);
    setExpandedErrors(false);
    onClose();
  };

  // ── Upload ZIP → preview ──────────────────────────────────────────────
  const handleZip = useCallback(async (file: File) => {
    if (!file.name.toLowerCase().endsWith(".zip")) {
      toast({ title: "ZIP file required", description: "Please upload a .zip file.", variant: "destructive" });
      return;
    }
    setStep("parsing");
    const fd = new FormData();
    fd.append("zipFile", file);
    try {
      const res = await fetch("/api/evidence/bulk-import/preview", {
        method: "POST",
        headers: apiHeaders(),
        body: fd,
      });
      const data = await res.json();
      if (!res.ok) {
        toast({ title: "Parse error", description: data.error ?? "Unknown error", variant: "destructive" });
        setStep("upload");
        return;
      }
      setImportId(data.importId);
      setPreview(data.preview);
      setStep("preview");
    } catch {
      toast({ title: "Network error", description: "Could not reach the server.", variant: "destructive" });
      setStep("upload");
    }
  }, [apiHeaders, toast]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleZip(file);
    e.target.value = "";
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current = 0;
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleZip(file);
  };

  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    dragCounter.current++;
    setIsDragging(true);
  };
  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    dragCounter.current--;
    if (dragCounter.current <= 0) { dragCounter.current = 0; setIsDragging(false); }
  };
  const handleDragOver = (e: React.DragEvent) => { e.preventDefault(); };

  // ── Execute import ────────────────────────────────────────────────────
  const handleExecute = async () => {
    if (!importId) return;
    setStep("importing");
    try {
      const res = await fetch("/api/evidence/bulk-import/execute", {
        method: "POST",
        headers: { ...apiHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ importId }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast({ title: "Import failed", description: data.error ?? "Unknown error", variant: "destructive" });
        setStep("preview");
        return;
      }
      setResult(data);
      setStep("done");
      queryClient.invalidateQueries({ queryKey: getListEvidenceQueryKey({}) });
      onImported();
    } catch {
      toast({ title: "Network error", description: "Could not reach the server.", variant: "destructive" });
      setStep("preview");
    }
  };

  // ── Download template ─────────────────────────────────────────────────
  const downloadTemplate = async () => {
    try {
      const res = await fetch("/api/evidence/bulk-import/template", {
        headers: apiHeaders(),
      });
      if (!res.ok) { toast({ title: "Could not download template", variant: "destructive" }); return; }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "Control_HUB_Bulk_Evidence_Upload_Template.xlsx";
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      toast({ title: "Could not download template", variant: "destructive" });
    }
  };

  // ── Download error report ─────────────────────────────────────────────
  const downloadErrorReport = () => {
    if (!result?.errors.length) return;
    const lines = [
      "Row,File Name,Error",
      ...result.errors.map((e) => `${e.rowNum},"${e.fileName}","${e.error}"`),
    ];
    const blob = new Blob([lines.join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "bulk_import_errors.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  // ── Derived ───────────────────────────────────────────────────────────
  const hasErrors = preview
    ? preview.filesMissing.length > 0 || preview.invalidControls.length > 0
    : false;
  const hasHardRowErrors = preview
    ? preview.rows.some((r) => r.errors.length > 0)
    : false;
  const canImport = !!preview && preview.evidenceToCreate > 0 && !hasHardRowErrors;

  const displayedRows = preview
    ? showAllRows
      ? preview.rows
      : preview.rows.slice(0, 10)
    : [];

  const dialogTitle =
    step === "upload" ? "Mapping Import"
    : step === "parsing" ? "Reading ZIP…"
    : step === "preview" ? "Import Preview"
    : step === "importing" ? "Importing…"
    : "Import Complete";

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o && step !== "parsing" && step !== "importing") resetAndClose(); }}>
      <DialogContent
        className={cn(
          "flex flex-col",
          step === "preview" || step === "done" ? "max-w-4xl max-h-[90vh]" : "max-w-lg"
        )}
        style={{ overflow: "hidden" }}
      >
        <DialogHeader className="shrink-0">
          <DialogTitle>{dialogTitle}</DialogTitle>
        </DialogHeader>

        {/* ── STEP: UPLOAD ─────────────────────────────────────────── */}
        {step === "upload" && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Upload a <strong>ZIP file</strong> containing your evidence files plus an Excel
              or CSV mapping file. The mapping file tells Control HUB which files to link to
              which controls.
            </p>

            {/* Drop zone */}
            <div
              onDragEnter={handleDragEnter}
              onDragLeave={handleDragLeave}
              onDragOver={handleDragOver}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={cn(
                "border-2 border-dashed rounded-lg p-10 text-center cursor-pointer transition-colors",
                isDragging
                  ? "border-primary bg-primary/5"
                  : "border-muted-foreground/30 hover:border-primary/50 hover:bg-muted/40"
              )}
            >
              <Upload className={cn("h-8 w-8 mx-auto mb-2", isDragging ? "text-primary" : "text-muted-foreground")} />
              <p className="text-sm font-medium">
                {isDragging ? "Drop your ZIP here" : "Drop ZIP here or click to browse"}
              </p>
              <p className="text-xs text-muted-foreground mt-1">ZIP only, up to 200 MB</p>
              <input
                ref={fileInputRef}
                type="file"
                accept=".zip"
                className="hidden"
                onChange={handleFileChange}
              />
            </div>

            {/* Instructions */}
            <div className="rounded-md border bg-muted/30 p-3 space-y-1.5 text-xs text-muted-foreground">
              <p className="font-medium text-foreground text-sm flex items-center gap-1.5">
                <Info className="h-3.5 w-3.5 text-blue-500" />
                What to include in your ZIP:
              </p>
              <ul className="list-disc list-inside space-y-0.5 pl-1">
                <li>Your evidence files (PDF, DOCX, PNG, etc.)</li>
                <li>An Excel or CSV mapping file listing which file links to which controls</li>
                <li>Optionally organize files in subfolders — use the Folder Path column to match them</li>
              </ul>
              <p className="mt-1">
                Separate multiple control IDs with semicolons:{" "}
                <code className="font-mono bg-muted px-1 rounded">AC.L1-3.1.1; IA.L2-3.5.3</code>
              </p>
            </div>

            <DialogFooter className="gap-2 flex-wrap">
              <Button variant="outline" onClick={downloadTemplate} className="gap-1.5">
                <Download className="h-3.5 w-3.5" />
                Download Template
              </Button>
              <Button variant="ghost" onClick={resetAndClose}>Cancel</Button>
            </DialogFooter>
          </div>
        )}

        {/* ── STEP: PARSING ────────────────────────────────────────── */}
        {step === "parsing" && (
          <div className="py-12 flex flex-col items-center gap-3 text-muted-foreground">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="text-sm">Reading ZIP and validating mapping…</p>
          </div>
        )}

        {/* ── STEP: PREVIEW ────────────────────────────────────────── */}
        {step === "preview" && preview && (
          <div className="flex flex-col min-h-0 gap-4 overflow-hidden">
            {/* Stats bar */}
            <div className="shrink-0 grid grid-cols-2 sm:grid-cols-4 gap-2">
              {[
                { label: "Total rows", value: preview.totalRows, icon: FileSpreadsheet },
                { label: "Files matched", value: `${preview.filesMatched} / ${preview.totalRows}`, good: preview.filesMatched === preview.totalRows },
                { label: "To create", value: preview.evidenceToCreate, good: preview.evidenceToCreate > 0 },
                { label: "Control links", value: preview.mappingsToCreate },
              ].map(({ label, value, good, icon: Icon }) => (
                <div key={label} className="rounded-md border bg-muted/30 p-2.5 text-center">
                  {Icon && <Icon className="h-4 w-4 mx-auto mb-1 text-muted-foreground" />}
                  <p className={cn("text-lg font-bold", good === false ? "text-destructive" : good === true ? "text-green-600" : "")}>{value}</p>
                  <p className="text-xs text-muted-foreground">{label}</p>
                </div>
              ))}
            </div>

            {/* Errors / warnings summary */}
            {(preview.filesMissing.length > 0 || preview.invalidControls.length > 0 || preview.duplicateFilenames.length > 0) && (
              <div className="shrink-0 space-y-1.5">
                {preview.filesMissing.length > 0 && (
                  <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-2.5 text-sm">
                    <FileX className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
                    <div>
                      <p className="font-medium text-destructive">
                        {preview.filesMissing.length} file{preview.filesMissing.length !== 1 ? "s" : ""} missing from ZIP
                      </p>
                      <button
                        className="text-xs text-muted-foreground hover:underline flex items-center gap-0.5"
                        onClick={() => setExpandedErrors((v) => !v)}
                      >
                        {expandedErrors ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                        {expandedErrors ? "Hide" : "Show"} list
                      </button>
                      {expandedErrors && (
                        <ul className="mt-1 text-xs text-muted-foreground list-disc list-inside">
                          {preview.filesMissing.map((f) => <li key={f} className="font-mono">{f}</li>)}
                        </ul>
                      )}
                    </div>
                  </div>
                )}
                {preview.invalidControls.length > 0 && (
                  <div className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 dark:bg-amber-950/20 p-2.5 text-sm">
                    <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
                    <div>
                      <p className="font-medium text-amber-800 dark:text-amber-400">
                        {preview.invalidControls.length} unrecognized control ID{preview.invalidControls.length !== 1 ? "s" : ""} (will be skipped)
                      </p>
                      <p className="text-xs text-muted-foreground font-mono">{preview.invalidControls.join(", ")}</p>
                    </div>
                  </div>
                )}
                {preview.duplicateFilenames.length > 0 && (
                  <div className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 dark:bg-amber-950/20 p-2.5 text-sm">
                    <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
                    <div>
                      <p className="font-medium text-amber-800 dark:text-amber-400">
                        Duplicate filenames in mapping — each will create a separate record
                      </p>
                      <p className="text-xs text-muted-foreground font-mono">{preview.duplicateFilenames.join(", ")}</p>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Row table */}
            <div className="flex-1 min-h-0 overflow-y-auto border rounded-md">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-muted/80 z-10">
                  <tr>
                    <th className="text-left px-3 py-2 font-medium text-muted-foreground w-8">#</th>
                    <th className="text-left px-3 py-2 font-medium text-muted-foreground">File</th>
                    <th className="text-left px-3 py-2 font-medium text-muted-foreground">Title</th>
                    <th className="text-left px-3 py-2 font-medium text-muted-foreground">Type</th>
                    <th className="text-left px-3 py-2 font-medium text-muted-foreground">Controls</th>
                    <th className="text-left px-3 py-2 font-medium text-muted-foreground">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {displayedRows.map((row) => {
                    const hasErr = row.errors.length > 0;
                    const hasWarn = !hasErr && (row.warnings.length > 0 || row.invalidControlRefs.length > 0);
                    return (
                      <tr
                        key={row.rowNum}
                        className={cn(
                          "border-t",
                          hasErr ? "bg-destructive/5" : hasWarn ? "bg-amber-50/60 dark:bg-amber-950/10" : ""
                        )}
                      >
                        <td className="px-3 py-2 text-muted-foreground">{row.rowNum}</td>
                        <td className="px-3 py-2">
                          <div className="flex items-center gap-1">
                            {row.fileFound
                              ? <CheckCircle2 className="h-3.5 w-3.5 text-green-500 shrink-0" />
                              : <XCircle className="h-3.5 w-3.5 text-destructive shrink-0" />
                            }
                            <span className="font-mono truncate max-w-[180px]" title={row.fileName}>{row.fileName}</span>
                          </div>
                          {row.errors.map((e, i) => (
                            <p key={i} className="text-destructive text-[11px] mt-0.5">{e}</p>
                          ))}
                          {row.warnings.map((w, i) => (
                            <p key={i} className="text-amber-600 dark:text-amber-400 text-[11px] mt-0.5">{w}</p>
                          ))}
                        </td>
                        <td className="px-3 py-2 max-w-[200px]">
                          <span className="truncate block" title={row.evidenceTitle}>{row.evidenceTitle}</span>
                        </td>
                        <td className="px-3 py-2">
                          <Badge variant="outline" className="text-[11px] capitalize">
                            {row.evidenceType.replace(/_/g, " ")}
                          </Badge>
                        </td>
                        <td className="px-3 py-2">
                          <div className="flex flex-wrap gap-0.5 max-w-[200px]">
                            {row.linkedControlRefs.slice(0, 3).map((ref) => (
                              <Badge
                                key={ref}
                                variant={row.invalidControlRefs.includes(ref) ? "destructive" : "secondary"}
                                className="text-[10px] font-mono px-1"
                              >
                                {ref}
                              </Badge>
                            ))}
                            {row.linkedControlRefs.length > 3 && (
                              <Badge variant="outline" className="text-[10px] px-1">
                                +{row.linkedControlRefs.length - 3}
                              </Badge>
                            )}
                          </div>
                        </td>
                        <td className="px-3 py-2 capitalize text-muted-foreground">
                          {row.status.replace(/_/g, " ")}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {preview.rows.length > 10 && (
                <div className="px-3 py-2 border-t text-center">
                  <button
                    className="text-xs text-primary hover:underline flex items-center gap-1 mx-auto"
                    onClick={() => setShowAllRows((v) => !v)}
                  >
                    {showAllRows ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                    {showAllRows
                      ? "Show fewer"
                      : `Show all ${preview.rows.length} rows`}
                  </button>
                </div>
              )}
            </div>

            {/* Footer */}
            <DialogFooter className="shrink-0 gap-2 flex-wrap items-center">
              {!canImport && hasHardRowErrors && (
                <p className="text-xs text-destructive flex-1 text-left">
                  Rows with errors will be skipped. Fix the mapping file and re-upload to include them.
                </p>
              )}
              {!canImport && preview.evidenceToCreate === 0 && (
                <p className="text-xs text-muted-foreground flex-1 text-left">
                  No importable records found. Check that file names match exactly and controls are valid.
                </p>
              )}
              <Button variant="outline" onClick={() => setStep("upload")} className="gap-1">
                <ArrowLeft className="h-3.5 w-3.5" />
                Re-upload
              </Button>
              <Button
                onClick={handleExecute}
                disabled={!canImport}
                className="gap-1.5"
              >
                Import {preview.evidenceToCreate} Record{preview.evidenceToCreate !== 1 ? "s" : ""}
              </Button>
            </DialogFooter>
          </div>
        )}

        {/* ── STEP: IMPORTING ──────────────────────────────────────── */}
        {step === "importing" && (
          <div className="py-12 flex flex-col items-center gap-3 text-muted-foreground">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="text-sm">Uploading files and creating evidence records…</p>
            <p className="text-xs">This may take a moment for large batches.</p>
          </div>
        )}

        {/* ── STEP: DONE ───────────────────────────────────────────── */}
        {step === "done" && result && (
          <div className="space-y-4">
            <div className={cn(
              "flex items-center gap-3 rounded-md p-4 border",
              result.failed === 0
                ? "bg-green-50 border-green-200 dark:bg-green-950/20 dark:border-green-800"
                : "bg-amber-50 border-amber-200 dark:bg-amber-950/20 dark:border-amber-800"
            )}>
              {result.failed === 0
                ? <CheckCircle2 className="h-8 w-8 text-green-600 shrink-0" />
                : <AlertTriangle className="h-8 w-8 text-amber-600 shrink-0" />
              }
              <div>
                <p className="font-semibold">
                  {result.failed === 0
                    ? "Import completed successfully"
                    : `Import completed with ${result.failed} error${result.failed !== 1 ? "s" : ""}`}
                </p>
                <p className="text-sm text-muted-foreground">
                  {result.created} evidence record{result.created !== 1 ? "s" : ""} created,{" "}
                  {result.mappingsCreated} control link{result.mappingsCreated !== 1 ? "s" : ""} made
                </p>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {[
                { label: "Created", value: result.created, good: true },
                { label: "Files uploaded", value: result.uploaded },
                { label: "Control links", value: result.mappingsCreated },
                { label: "Skipped", value: result.skipped },
              ].map(({ label, value, good }) => (
                <div key={label} className="rounded-md border bg-muted/30 p-2.5 text-center">
                  <p className={cn("text-xl font-bold", good && value > 0 ? "text-green-600" : "")}>{value}</p>
                  <p className="text-xs text-muted-foreground">{label}</p>
                </div>
              ))}
            </div>

            {result.errors.length > 0 && (
              <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3">
                <p className="text-sm font-medium text-destructive mb-1">
                  {result.errors.length} row{result.errors.length !== 1 ? "s" : ""} failed
                </p>
                <div className="max-h-32 overflow-y-auto space-y-0.5">
                  {result.errors.map((e) => (
                    <p key={e.rowNum} className="text-xs text-muted-foreground">
                      <span className="font-medium">Row {e.rowNum} ({e.fileName}):</span> {e.error}
                    </p>
                  ))}
                </div>
              </div>
            )}

            <DialogFooter className="gap-2 flex-wrap">
              {result.errors.length > 0 && (
                <Button variant="outline" onClick={downloadErrorReport} className="gap-1.5">
                  <Download className="h-3.5 w-3.5" />
                  Download Error Report
                </Button>
              )}
              <Button variant="outline" onClick={() => { setStep("upload"); setPreview(null); setResult(null); setImportId(null); }} className="gap-1">
                <ArrowLeft className="h-3.5 w-3.5" />
                Import Another
              </Button>
              <Button onClick={resetAndClose}>Done</Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
