import { useState, useCallback } from "react";
import { useListControls, getListEvidenceQueryKey } from "@workspace/api-client-react";
import { useOrg } from "@/context/OrgContext";
import { useQueryClient } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import {
  Paperclip,
  AlertTriangle,
  Link2,
  Plus,
  Upload,
  Sparkles,
  Loader2,
  ShieldOff,
  ChevronDown,
  ChevronUp,
  CheckCircle2,
  Circle,
} from "lucide-react";
import { ControlMultiSelect } from "./ControlMultiSelect";

const EVIDENCE_STATUSES = [
  { value: "draft", label: "Draft" },
  { value: "pending_review", label: "Pending Review" },
  { value: "approved", label: "Approved" },
  { value: "assessor_ready", label: "Assessor Ready" },
];

const EVIDENCE_TYPES = [
  { value: "policy", label: "Policy" },
  { value: "procedure", label: "Procedure" },
  { value: "screenshot", label: "Screenshot" },
  { value: "log", label: "Log" },
  { value: "report", label: "Report" },
  { value: "ticket", label: "Ticket" },
  { value: "configuration_export", label: "Configuration Export" },
  { value: "access_review", label: "Access Review" },
  { value: "training_record", label: "Training Record" },
  { value: "incident_record", label: "Incident Record" },
  { value: "risk_record", label: "Risk Record" },
  { value: "approval_record", label: "Approval Record" },
  { value: "system_inventory", label: "System Inventory" },
  { value: "asset_inventory", label: "Asset Inventory" },
  { value: "supplier_review", label: "Supplier Review" },
  { value: "backup_verification", label: "Backup Verification" },
  { value: "network_diagram", label: "Network Diagram" },
  { value: "scan_report", label: "Vulnerability Scan" },
  { value: "other", label: "Other" },
];

interface DuplicateMatch {
  id: string;
  title: string;
  fileName: string;
  status: string;
  createdAt: string;
}

interface EvidenceUploadModalProps {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
}

type DuplicateAction = "link" | "upload_new" | null;

// ── Smart Mapping types ────────────────────────────────────────────────────

interface SmartSuggestion {
  controlDbId: string;
  controlId: string;
  title: string;
  domainName: string | null;
  level: string | null;
  confidence: number;
  confidenceLabel: string;
  matchReason: string;
  matchedTerms: string[];
  recommendedRelationshipType: string;
  isPreselected: boolean;
}

interface SmartMapResult {
  processingLabel: string;
  externalAIEnabled: boolean;
  extractionNote?: string;
  suggestions: SmartSuggestion[];
}

const CONFIDENCE_STYLES: Record<string, { badge: string; border: string; dot: string }> = {
  "Exact Match":       { badge: "bg-emerald-100 text-emerald-800 border-emerald-200", border: "border-emerald-200 bg-emerald-50/40", dot: "bg-emerald-500" },
  "High Confidence":   { badge: "bg-blue-100 text-blue-800 border-blue-200",         border: "border-blue-200 bg-blue-50/40",       dot: "bg-blue-500"    },
  "Medium Confidence": { badge: "bg-amber-100 text-amber-800 border-amber-200",       border: "border-amber-200 bg-amber-50/30",     dot: "bg-amber-500"   },
  "Low Confidence":    { badge: "bg-slate-100 text-slate-700 border-slate-200",       border: "border-slate-200 bg-slate-50/30",     dot: "bg-slate-400"   },
};

// ── Component ──────────────────────────────────────────────────────────────

export function EvidenceUploadModal({ open, onClose, onSaved }: EvidenceUploadModalProps) {
  const { activeOrg } = useOrg();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [saving, setSaving] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [selectedControlIds, setSelectedControlIds] = useState<string[]>([]);
  const [primaryControlId, setPrimaryControlId] = useState<string | null>(null);
  const [form, setForm] = useState({
    title: "",
    description: "",
    evidenceType: "",
    status: "draft",
    collectedAt: "",
    expiresAt: "",
    assessorSummary: "",
    internalNotes: "",
  });

  // Duplicate detection state
  const [duplicates, setDuplicates] = useState<DuplicateMatch[]>([]);
  const [showDuplicatePrompt, setShowDuplicatePrompt] = useState(false);
  const [duplicateAction, setDuplicateAction] = useState<DuplicateAction>(null);
  const [linkingExisting, setLinkingExisting] = useState(false);

  // Smart mapping state
  const [suggesting, setSuggesting] = useState(false);
  const [smartResult, setSmartResult] = useState<SmartMapResult | null>(null);
  const [smartError, setSmartError] = useState<string | null>(null);
  const [checkedSuggestions, setCheckedSuggestions] = useState<Set<string>>(new Set());
  const [smartPanelOpen, setSmartPanelOpen] = useState(false);

  const { data: controls = [] } = useListControls({});

  const set = (k: keyof typeof form) => (v: string) =>
    setForm((f) => ({ ...f, [k]: v }));

  const resetForm = () => {
    setForm({ title: "", description: "", evidenceType: "", status: "draft", collectedAt: "", expiresAt: "", assessorSummary: "", internalNotes: "" });
    setFile(null);
    setSelectedControlIds([]);
    setPrimaryControlId(null);
    setDuplicates([]);
    setShowDuplicatePrompt(false);
    setDuplicateAction(null);
    setSmartResult(null);
    setSmartError(null);
    setSuggesting(false);
    setCheckedSuggestions(new Set());
    setSmartPanelOpen(false);
  };

  const handleClose = () => {
    if (!saving) {
      resetForm();
      onClose();
    }
  };

  const apiHeaders = useCallback(() => {
    const token = localStorage.getItem("auth_token");
    const h: Record<string, string> = { Authorization: `Bearer ${token}` };
    if (activeOrg?.id) h["X-Organization-ID"] = activeOrg.id;
    return h;
  }, [activeOrg]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0] ?? null;
    setFile(f);
    // Clear previous smart suggestions when file changes
    setSmartResult(null);
    setSmartError(null);
    setCheckedSuggestions(new Set());
    setSmartPanelOpen(false);
    if (f && !form.title) {
      set("title")(f.name.replace(/\.[^/.]+$/, ""));
    }
  };

  // ── Smart mapping ────────────────────────────────────────────────────────
  const runSmartMapping = async () => {
    if (!file) return;
    setSuggesting(true);
    setSmartError(null);
    setSmartResult(null);
    setSmartPanelOpen(true);

    try {
      const fd = new FormData();
      fd.append("file", file);
      if (form.evidenceType) fd.append("evidenceType", form.evidenceType);

      const res = await fetch("/api/evidence/smart-map", {
        method: "POST",
        headers: apiHeaders(),
        body: fd,
      });

      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        throw new Error((e as any).error ?? "Analysis failed");
      }

      const data: SmartMapResult = await res.json();
      setSmartResult(data);

      // Pre-check suggestions that are Exact Match or High Confidence
      const preChecked = new Set(
        data.suggestions
          .filter((s) => s.isPreselected)
          .map((s) => s.controlDbId)
      );
      setCheckedSuggestions(preChecked);
    } catch (err: any) {
      setSmartError(err.message ?? "Could not analyze file");
    } finally {
      setSuggesting(false);
    }
  };

  const toggleSuggestion = (id: string) => {
    setCheckedSuggestions((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const applyCheckedSuggestions = () => {
    if (!smartResult) return;
    const toAdd = smartResult.suggestions
      .filter((s) => checkedSuggestions.has(s.controlDbId))
      .map((s) => s.controlDbId)
      .filter((id) => !selectedControlIds.includes(id));

    const next = [...selectedControlIds, ...toAdd];
    setSelectedControlIds(next);
    if (next.length > 0 && !primaryControlId) {
      setPrimaryControlId(next[0]);
    }

    toast({ title: `Applied ${toAdd.length} suggested control${toAdd.length !== 1 ? "s" : ""}` });
    setSmartPanelOpen(false);
  };

  // ── Upload ───────────────────────────────────────────────────────────────
  const checkDuplicate = async (f: File): Promise<DuplicateMatch[]> => {
    try {
      const params = new URLSearchParams({ filename: f.name, size: String(f.size) });
      const res = await fetch(`/api/evidence/check-duplicate?${params}`, { headers: apiHeaders() });
      if (!res.ok) return [];
      const data = await res.json();
      return (data as any).matches ?? [];
    } catch {
      return [];
    }
  };

  const doUpload = async () => {
    setSaving(true);
    try {
      const fd = new FormData();
      fd.append("title", form.title);
      fd.append("evidenceType", form.evidenceType);
      fd.append("status", form.status);
      if (form.description) fd.append("description", form.description);
      if (form.collectedAt) fd.append("collectedAt", form.collectedAt);
      if (form.expiresAt) fd.append("expiresAt", form.expiresAt);
      if (form.assessorSummary) fd.append("assessorSummary", form.assessorSummary);
      if (form.internalNotes) fd.append("internalNotes", form.internalNotes);
      fd.append("controlIds", JSON.stringify(selectedControlIds));
      if (primaryControlId) fd.append("primaryControlId", primaryControlId);
      fd.append("file", file!);

      const res = await fetch("/api/evidence/upload", {
        method: "POST",
        headers: apiHeaders(),
        body: fd,
      });
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        throw new Error((e as any).error ?? "Upload failed");
      }
      toast({ title: "Evidence uploaded successfully" });
      queryClient.invalidateQueries({ queryKey: getListEvidenceQueryKey() });
      onSaved();
      handleClose();
    } catch (err: any) {
      toast({ title: "Upload failed", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const linkExistingToControls = async (evidenceId: string) => {
    setLinkingExisting(true);
    try {
      const res = await fetch(`/api/evidence/${evidenceId}/link-controls`, {
        method: "POST",
        headers: { ...apiHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ controlIds: selectedControlIds, primaryControlId }),
      });
      if (!res.ok) throw new Error("Linking failed");
      toast({ title: "Linked existing evidence to selected controls" });
      queryClient.invalidateQueries({ queryKey: getListEvidenceQueryKey() });
      onSaved();
      handleClose();
    } catch (err: any) {
      toast({ title: "Link failed", description: err.message, variant: "destructive" });
    } finally {
      setLinkingExisting(false);
    }
  };

  const handleSave = async () => {
    if (!form.title) {
      toast({ title: "Title is required", variant: "destructive" });
      return;
    }
    if (!form.evidenceType) {
      toast({ title: "Evidence type is required", variant: "destructive" });
      return;
    }
    if (!file) {
      toast({ title: "Please attach a file", variant: "destructive" });
      return;
    }
    if (selectedControlIds.length === 0) {
      toast({ title: "Select at least one control to link this evidence to", variant: "destructive" });
      return;
    }

    const matches = await checkDuplicate(file);
    if (matches.length > 0) {
      setDuplicates(matches);
      setShowDuplicatePrompt(true);
      return;
    }

    await doUpload();
  };

  const controlOptions = controls.map((c: any) => ({
    id: c.id,
    controlId: c.controlId,
    title: c.title,
    domainName: c.domainName,
    level: c.level,
  }));

  // ── Duplicate prompt ─────────────────────────────────────────────────────
  if (showDuplicatePrompt) {
    return (
      <Dialog open={open} onOpenChange={() => { setShowDuplicatePrompt(false); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-500" />
              Possible Duplicate Detected
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-1">
            <p className="text-sm text-muted-foreground">
              A file with the same name and size already exists in this organization:
            </p>
            <div className="space-y-2">
              {duplicates.map((d) => (
                <div key={d.id} className="flex items-center justify-between rounded-md border p-3 bg-muted/30">
                  <div>
                    <p className="text-sm font-medium">{d.title}</p>
                    <p className="text-xs text-muted-foreground">{d.fileName}</p>
                  </div>
                  <Badge variant="outline" className="text-xs">{d.status}</Badge>
                </div>
              ))}
            </div>
            <p className="text-sm text-muted-foreground">What would you like to do?</p>
          </div>
          <DialogFooter className="flex-col gap-2 sm:flex-col">
            {duplicates.length === 1 && selectedControlIds.length > 0 && (
              <Button
                className="w-full justify-start gap-2"
                onClick={() => linkExistingToControls(duplicates[0].id)}
                disabled={linkingExisting}
              >
                <Link2 className="h-4 w-4" />
                {linkingExisting ? "Linking…" : "Link Existing Evidence to Selected Controls"}
              </Button>
            )}
            <Button
              variant="outline"
              className="w-full justify-start gap-2"
              onClick={() => { setShowDuplicatePrompt(false); setDuplicateAction("upload_new"); doUpload(); }}
              disabled={saving}
            >
              <Upload className="h-4 w-4" />
              Upload as New Evidence Anyway
            </Button>
            <Button
              variant="ghost"
              className="w-full"
              onClick={() => setShowDuplicatePrompt(false)}
            >
              Cancel
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  // ── Group suggestions by confidence tier ─────────────────────────────────
  const suggestionGroups = smartResult
    ? (["Exact Match", "High Confidence", "Medium Confidence", "Low Confidence"] as const).map((label) => ({
        label,
        items: smartResult.suggestions.filter((s) => s.confidenceLabel === label),
      })).filter((g) => g.items.length > 0)
    : [];

  const checkedCount = checkedSuggestions.size;
  const alreadyLinkedIds = new Set(selectedControlIds);

  // ── Main modal ───────────────────────────────────────────────────────────
  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Plus className="h-5 w-5" />
            Upload Evidence
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-1">
          {/* Title */}
          <div>
            <Label>Title <span className="text-red-500">*</span></Label>
            <Input
              value={form.title}
              onChange={(e) => set("title")(e.target.value)}
              placeholder="Evidence title"
              className="mt-1"
            />
          </div>

          {/* Evidence Type + Status row */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Evidence Type <span className="text-red-500">*</span></Label>
              <Select value={form.evidenceType} onValueChange={set("evidenceType")}>
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="Select type…" />
                </SelectTrigger>
                <SelectContent>
                  {EVIDENCE_TYPES.map((t) => (
                    <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Status</Label>
              <Select value={form.status} onValueChange={set("status")}>
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {EVIDENCE_STATUSES.map((s) => (
                    <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* File */}
          <div>
            <Label>File <span className="text-red-500">*</span></Label>
            <label className={`mt-1 flex items-center justify-center gap-2 w-full border-2 border-dashed rounded-lg p-4 cursor-pointer transition-colors ${file ? "border-primary/40 bg-primary/5" : "border-muted-foreground/30 hover:border-primary/40 hover:bg-muted/40"}`}>
              <input type="file" className="sr-only" onChange={handleFileChange} />
              {file ? (
                <div className="flex items-center gap-2 text-sm">
                  <Paperclip className="h-4 w-4 text-primary shrink-0" />
                  <span className="font-medium text-primary truncate max-w-[300px]">{file.name}</span>
                  <span className="text-muted-foreground shrink-0">({(file.size / 1024).toFixed(0)} KB)</span>
                </div>
              ) : (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Paperclip className="h-4 w-4" />
                  <span>Click to choose a file</span>
                </div>
              )}
            </label>
            {file && (
              <button
                type="button"
                onClick={() => setFile(null)}
                className="mt-1 text-xs text-muted-foreground hover:text-red-500 underline"
              >
                Remove file
              </button>
            )}
          </div>

          {/* ── Smart Evidence Mapping panel ─────────────────────────────── */}
          {file && (
            <div className="rounded-lg border border-dashed border-primary/30 bg-muted/20 p-3">
              {/* Header row */}
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-primary" />
                  <span className="text-sm font-medium">Smart Evidence Mapping</span>
                  {/* Processing mode badges */}
                  <span className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium bg-emerald-50 border-emerald-200 text-emerald-700">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                    Local Analysis
                  </span>
                  <span className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium bg-slate-50 border-slate-200 text-slate-600">
                    <ShieldOff className="h-2.5 w-2.5" />
                    External AI: Off
                  </span>
                </div>

                {/* Suggest / collapse button */}
                {!suggesting && !smartResult && (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={runSmartMapping}
                    className="h-7 text-xs gap-1.5"
                  >
                    <Sparkles className="h-3 w-3" />
                    Suggest Controls
                  </Button>
                )}
                {smartResult && (
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => setSmartPanelOpen((v) => !v)}
                    className="h-7 text-xs gap-1"
                  >
                    {smartPanelOpen ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                    {smartPanelOpen ? "Collapse" : "Show suggestions"}
                  </Button>
                )}
              </div>

              {/* Analyzing… */}
              {suggesting && (
                <div className="mt-3 flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin text-primary" />
                  <span>Processing: Local Control HUB Analysis…</span>
                </div>
              )}

              {/* Error */}
              {smartError && !suggesting && (
                <div className="mt-2 flex items-center gap-2 text-sm text-destructive">
                  <AlertTriangle className="h-3.5 w-3.5" />
                  {smartError}
                  <button
                    type="button"
                    className="ml-auto text-xs underline hover:no-underline text-muted-foreground"
                    onClick={runSmartMapping}
                  >
                    Retry
                  </button>
                </div>
              )}

              {/* Results */}
              {smartResult && smartPanelOpen && (
                <div className="mt-3 space-y-2">
                  {/* Disclaimer */}
                  <p className="text-[11px] text-muted-foreground italic border-b pb-2">
                    Smart Evidence Mapping provides control-linking recommendations. The organization remains responsible for confirming that each artifact supports the selected requirement.
                  </p>

                  {smartResult.extractionNote && (
                    <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1">
                      {smartResult.extractionNote}
                    </p>
                  )}

                  {suggestionGroups.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No strong control matches found. Please select controls manually.</p>
                  ) : (
                    <>
                      {/* Per-group display */}
                      {suggestionGroups.map((group) => {
                        const styles = CONFIDENCE_STYLES[group.label] ?? CONFIDENCE_STYLES["Low Confidence"];
                        return (
                          <div key={group.label} className="space-y-1.5">
                            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{group.label}</p>
                            {group.items.map((s) => {
                              const isChecked = checkedSuggestions.has(s.controlDbId);
                              const alreadyLinked = alreadyLinkedIds.has(s.controlDbId);
                              return (
                                <button
                                  key={s.controlDbId}
                                  type="button"
                                  disabled={alreadyLinked}
                                  onClick={() => !alreadyLinked && toggleSuggestion(s.controlDbId)}
                                  className={`w-full text-left rounded-md border px-3 py-2 transition-colors ${alreadyLinked ? "opacity-50 cursor-not-allowed bg-muted/30 border-muted" : isChecked ? styles.border + " ring-1 ring-primary/30" : "border-border hover:border-muted-foreground/40 bg-card"}`}
                                >
                                  <div className="flex items-start gap-2">
                                    <div className="mt-0.5 shrink-0">
                                      {alreadyLinked ? (
                                        <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                                      ) : isChecked ? (
                                        <CheckCircle2 className="h-4 w-4 text-primary" />
                                      ) : (
                                        <Circle className="h-4 w-4 text-muted-foreground" />
                                      )}
                                    </div>
                                    <div className="flex-1 min-w-0 space-y-0.5">
                                      <div className="flex items-center gap-1.5 flex-wrap">
                                        <span className="text-xs font-mono font-semibold">{s.controlId}</span>
                                        <span className={`inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px] font-medium ${styles.badge}`}>
                                          <span className={`h-1 w-1 rounded-full ${styles.dot}`} />
                                          {s.confidenceLabel} · {s.confidence}%
                                        </span>
                                        {alreadyLinked && (
                                          <span className="text-[10px] text-emerald-600 font-medium">Already selected</span>
                                        )}
                                      </div>
                                      <p className="text-xs text-muted-foreground line-clamp-1">{s.title}</p>
                                      <p className="text-[11px] text-muted-foreground/70 line-clamp-1">{s.matchReason}</p>
                                    </div>
                                  </div>
                                </button>
                              );
                            })}
                          </div>
                        );
                      })}

                      {/* Apply button */}
                      <div className="flex items-center justify-between pt-1 border-t">
                        <p className="text-[11px] text-muted-foreground">
                          {checkedCount} suggestion{checkedCount !== 1 ? "s" : ""} selected
                        </p>
                        <div className="flex gap-2">
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            className="h-7 text-xs"
                            onClick={() => setSmartPanelOpen(false)}
                          >
                            Dismiss
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            className="h-7 text-xs gap-1"
                            onClick={applyCheckedSuggestions}
                            disabled={checkedCount === 0}
                          >
                            <Plus className="h-3 w-3" />
                            Apply {checkedCount > 0 ? checkedCount : ""} to Controls
                          </Button>
                        </div>
                      </div>
                    </>
                  )}

                  {/* Re-analyze */}
                  <button
                    type="button"
                    className="text-[11px] text-muted-foreground hover:text-primary underline"
                    onClick={runSmartMapping}
                  >
                    Re-analyze file
                  </button>
                </div>
              )}

              {/* Collapsed summary after analysis */}
              {smartResult && !smartPanelOpen && !suggesting && (
                <p className="mt-1.5 text-[11px] text-muted-foreground">
                  {smartResult.suggestions.length} suggestion{smartResult.suggestions.length !== 1 ? "s" : ""} found
                  {smartResult.suggestions.filter((s) => s.confidenceLabel === "Exact Match").length > 0
                    ? ` · ${smartResult.suggestions.filter((s) => s.confidenceLabel === "Exact Match").length} exact match`
                    : ""}
                  {" · "}
                  <button
                    type="button"
                    className="underline hover:no-underline"
                    onClick={() => setSmartPanelOpen(true)}
                  >
                    View
                  </button>
                </p>
              )}
            </div>
          )}

          {/* Controls */}
          <div>
            <Label>
              Linked Controls <span className="text-red-500">*</span>
            </Label>
            <p className="text-xs text-muted-foreground mb-1.5">
              Select one or more CMMC controls. The starred control is the primary link.
            </p>
            <ControlMultiSelect
              controls={controlOptions}
              selectedIds={selectedControlIds}
              primaryId={primaryControlId}
              onChange={(ids) => {
                setSelectedControlIds(ids);
                if (ids.length > 0 && !ids.includes(primaryControlId ?? "")) {
                  setPrimaryControlId(ids[0]);
                }
                if (ids.length === 0) setPrimaryControlId(null);
              }}
              onPrimaryChange={setPrimaryControlId}
            />
          </div>

          {/* Description */}
          <div>
            <Label>Description</Label>
            <Textarea
              value={form.description}
              onChange={(e) => set("description")(e.target.value)}
              placeholder="What does this evidence demonstrate?"
              rows={2}
              className="mt-1"
            />
          </div>

          {/* Dates */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Collection Date</Label>
              <Input type="date" value={form.collectedAt} onChange={(e) => set("collectedAt")(e.target.value)} className="mt-1" />
            </div>
            <div>
              <Label>Expiration Date</Label>
              <Input type="date" value={form.expiresAt} onChange={(e) => set("expiresAt")(e.target.value)} className="mt-1" />
            </div>
          </div>

          {/* Assessor Summary */}
          <div>
            <Label>Assessor Summary</Label>
            <Textarea
              value={form.assessorSummary}
              onChange={(e) => set("assessorSummary")(e.target.value)}
              placeholder="Summary for the assessor…"
              rows={2}
              className="mt-1"
            />
          </div>

          {/* Internal Notes */}
          <div>
            <Label>Internal Notes</Label>
            <Textarea
              value={form.internalNotes}
              onChange={(e) => set("internalNotes")(e.target.value)}
              placeholder="Internal team notes…"
              rows={2}
              className="mt-1"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose} disabled={saving}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? "Uploading…" : "Upload Evidence"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
