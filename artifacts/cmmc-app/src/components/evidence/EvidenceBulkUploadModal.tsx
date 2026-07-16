import { useState, useCallback, useRef } from "react";
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
  Files,
  Wand2,
  CheckCircle2,
  XCircle,
  Loader2,
  Trash2,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { ControlMultiSelect } from "./ControlMultiSelect";
import { cn } from "@/lib/utils";

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

interface BulkFileRow {
  file: File;
  title: string;
  evidenceType: string;
  evidenceStatus: string;
  collectedAt: string;
  expiresAt: string;
  description: string;
  controlIds: string[];
  primaryControlId: string | null;
  status: "idle" | "uploading" | "done" | "error";
  error?: string;
  expanded: boolean;
}

interface EvidenceBulkUploadModalProps {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
}

export function EvidenceBulkUploadModal({ open, onClose, onSaved }: EvidenceBulkUploadModalProps) {
  const { activeOrg } = useOrg();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: controls = [] } = useListControls({});

  const [defaults, setDefaults] = useState({
    evidenceType: "",
    evidenceStatus: "draft",
    collectedAt: "",
    expiresAt: "",
    description: "",
    controlIds: [] as string[],
    primaryControlId: null as string | null,
  });

  const [rows, setRows] = useState<BulkFileRow[]>([]);
  const [uploading, setUploading] = useState(false);
  const [allDone, setAllDone] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const dragCounter = useRef(0);

  const setDefault = <K extends keyof typeof defaults>(k: K, v: typeof defaults[K]) =>
    setDefaults((d) => ({ ...d, [k]: v }));

  const apiHeaders = useCallback(() => {
    const token = localStorage.getItem("auth_token");
    const h: Record<string, string> = { Authorization: `Bearer ${token}` };
    if (activeOrg?.id) h["X-Organization-ID"] = activeOrg.id;
    return h;
  }, [activeOrg]);

  const controlOptions = controls.map((c: any) => ({
    id: c.id,
    controlId: c.controlId,
    title: c.title,
    domainName: c.domainName,
    level: c.level,
  }));

  const addFiles = useCallback((files: File[]) => {
    if (!files.length) return;
    setRows((prev) => {
      const existing = new Set(prev.map((r) => r.file.name));
      const newRows: BulkFileRow[] = files
        .filter((f) => !existing.has(f.name))
        .map((f) => ({
          file: f,
          title: f.name.replace(/\.[^/.]+$/, ""),
          evidenceType: defaults.evidenceType,
          evidenceStatus: defaults.evidenceStatus || "draft",
          collectedAt: defaults.collectedAt,
          expiresAt: defaults.expiresAt,
          description: defaults.description,
          controlIds: [...defaults.controlIds],
          primaryControlId: defaults.primaryControlId,
          status: "idle" as const,
          expanded: false,
        }));
      return [...prev, ...newRows];
    });
  }, [defaults]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    addFiles(Array.from(e.target.files ?? []));
    e.target.value = "";
  };

  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current += 1;
    if (e.dataTransfer.items && e.dataTransfer.items.length > 0) {
      setIsDragging(true);
    }
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current -= 1;
    if (dragCounter.current === 0) setIsDragging(false);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current = 0;
    setIsDragging(false);
    const files = Array.from(e.dataTransfer.files);
    addFiles(files);
  };

  const applyDefaults = () => {
    setRows((prev) =>
      prev.map((r) =>
        r.status === "idle"
          ? {
              ...r,
              evidenceType: defaults.evidenceType || r.evidenceType,
              evidenceStatus: defaults.evidenceStatus || r.evidenceStatus,
              collectedAt: defaults.collectedAt || r.collectedAt,
              expiresAt: defaults.expiresAt || r.expiresAt,
              description: defaults.description || r.description,
              controlIds: defaults.controlIds.length > 0 ? [...defaults.controlIds] : r.controlIds,
              primaryControlId: defaults.primaryControlId ?? r.primaryControlId,
            }
          : r
      )
    );
  };

  const updateRow = (idx: number, patch: Partial<BulkFileRow>) => {
    setRows((prev) => prev.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  };

  const removeRow = (idx: number) => {
    setRows((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleUploadAll = async () => {
    const pending = rows.filter((r) => r.status === "idle");
    if (!pending.length) return;

    const missingType = rows.some((r) => r.status === "idle" && !r.evidenceType);
    if (missingType) {
      toast({ title: "Set an evidence type for every file before uploading", variant: "destructive" });
      return;
    }

    setUploading(true);
    const headers = apiHeaders();

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      if (row.status !== "idle") continue;

      setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, status: "uploading" } : r)));

      try {
        const fd = new FormData();
        fd.append("file", row.file);
        fd.append("title", row.title || row.file.name);
        fd.append("evidenceType", row.evidenceType);
        fd.append("status", row.evidenceStatus || "draft");
        fd.append("controlIds", JSON.stringify(row.controlIds));
        if (row.primaryControlId) fd.append("primaryControlId", row.primaryControlId);
        if (row.description) fd.append("description", row.description);
        if (row.collectedAt) fd.append("collectedAt", row.collectedAt);
        if (row.expiresAt) fd.append("expiresAt", row.expiresAt);

        const res = await fetch("/api/evidence/upload", {
          method: "POST",
          headers,
          body: fd,
        });

        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error ?? `HTTP ${res.status}`);
        }

        setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, status: "done" } : r)));
      } catch (err: any) {
        setRows((prev) =>
          prev.map((r, idx) => (idx === i ? { ...r, status: "error", error: err.message } : r))
        );
      }
    }

    setUploading(false);
    setAllDone(true);
    queryClient.invalidateQueries({ queryKey: getListEvidenceQueryKey() });
    onSaved();
  };

  const handleClose = () => {
    if (!uploading) {
      setRows([]);
      setDefaults({ evidenceType: "", evidenceStatus: "draft", collectedAt: "", expiresAt: "", description: "", controlIds: [], primaryControlId: null });
      setAllDone(false);
      onClose();
    }
  };

  const successCount = rows.filter((r) => r.status === "done").length;
  const errorCount = rows.filter((r) => r.status === "error").length;
  const idleCount = rows.filter((r) => r.status === "idle").length;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col">
        <DialogHeader className="shrink-0">
          <DialogTitle className="flex items-center gap-2">
            <Files className="h-5 w-5" />
            Bulk Upload Evidence
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto min-h-0 space-y-4 py-1 pr-1">

          {/* Shared defaults panel */}
          <div className="border rounded-md p-4 space-y-4 bg-muted/20">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold">Default Settings</p>
              <Button type="button" size="sm" variant="outline" onClick={applyDefaults} disabled={!rows.length}>
                <Wand2 className="h-3.5 w-3.5 mr-1.5" />
                Apply to All Files
              </Button>
            </div>

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div>
                <Label className="text-xs">Evidence Type</Label>
                <Select value={defaults.evidenceType} onValueChange={(v) => setDefault("evidenceType", v)}>
                  <SelectTrigger className="h-8 text-xs mt-1">
                    <SelectValue placeholder="Select…" />
                  </SelectTrigger>
                  <SelectContent>
                    {EVIDENCE_TYPES.map((t) => (
                      <SelectItem key={t.value} value={t.value} className="text-xs">{t.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Status</Label>
                <Select value={defaults.evidenceStatus} onValueChange={(v) => setDefault("evidenceStatus", v)}>
                  <SelectTrigger className="h-8 text-xs mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="draft" className="text-xs">Draft</SelectItem>
                    <SelectItem value="pending_review" className="text-xs">Pending Review</SelectItem>
                    <SelectItem value="approved" className="text-xs">Approved</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Collection Date</Label>
                <Input type="date" value={defaults.collectedAt} onChange={(e) => setDefault("collectedAt", e.target.value)} className="h-8 text-xs mt-1" />
              </div>
              <div>
                <Label className="text-xs">Expiration Date</Label>
                <Input type="date" value={defaults.expiresAt} onChange={(e) => setDefault("expiresAt", e.target.value)} className="h-8 text-xs mt-1" />
              </div>
            </div>

            {/* Default controls */}
            <div>
              <Label className="text-xs">Default Linked Controls</Label>
              <p className="text-[11px] text-muted-foreground mb-1">These controls will be applied to each file. You can override per-file below.</p>
              <ControlMultiSelect
                controls={controlOptions}
                selectedIds={defaults.controlIds}
                primaryId={defaults.primaryControlId}
                onChange={(ids) => {
                  setDefault("controlIds", ids);
                  if (ids.length > 0 && !ids.includes(defaults.primaryControlId ?? "")) {
                    setDefault("primaryControlId", ids[0]);
                  }
                  if (ids.length === 0) setDefault("primaryControlId", null);
                }}
                onPrimaryChange={(id) => setDefault("primaryControlId", id)}
                placeholder="Select default controls…"
              />
            </div>
          </div>

          {/* File picker / drop zone */}
          <div>
            <label
              className={cn(
                "flex items-center justify-center gap-2 w-full border-2 border-dashed rounded-lg p-4 cursor-pointer transition-colors text-sm",
                isDragging
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-muted-foreground/30 hover:border-primary/40 hover:bg-muted/40 text-muted-foreground"
              )}
              onDragEnter={handleDragEnter}
              onDragLeave={handleDragLeave}
              onDragOver={handleDragOver}
              onDrop={handleDrop}
            >
              <input type="file" multiple className="sr-only" onChange={handleFileChange} />
              <Files className="h-4 w-4" />
              {isDragging ? "Drop files here…" : "Click to add files (or drag and drop)"}
            </label>
          </div>

          {/* Summary */}
          {allDone && (
            <div className="flex items-center gap-3 p-3 rounded-md bg-muted/40 border text-sm">
              <CheckCircle2 className="h-4 w-4 text-green-600 shrink-0" />
              <span>
                <strong>{successCount}</strong> uploaded successfully
                {errorCount > 0 && <>, <strong className="text-red-600">{errorCount}</strong> failed</>}
              </span>
            </div>
          )}

          {/* File rows */}
          {rows.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground">{rows.length} file{rows.length !== 1 ? "s" : ""} queued</p>
              {rows.map((row, idx) => (
                <div
                  key={`${row.file.name}-${idx}`}
                  className={cn(
                    "border rounded-md",
                    row.status === "done" && "border-green-200 bg-green-50/30",
                    row.status === "error" && "border-red-200 bg-red-50/30",
                    row.status === "uploading" && "border-primary/30 bg-primary/5"
                  )}
                >
                  {/* Row header */}
                  <div className="flex items-center gap-3 p-3">
                    {row.status === "done" && <CheckCircle2 className="h-4 w-4 text-green-600 shrink-0" />}
                    {row.status === "error" && <XCircle className="h-4 w-4 text-red-500 shrink-0" />}
                    {row.status === "uploading" && <Loader2 className="h-4 w-4 animate-spin text-primary shrink-0" />}
                    {row.status === "idle" && <div className="h-4 w-4 rounded border border-muted-foreground/40 shrink-0" />}

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium truncate">{row.file.name}</span>
                        <span className="text-xs text-muted-foreground shrink-0">
                          ({(row.file.size / 1024).toFixed(0)} KB)
                        </span>
                      </div>
                      {row.status === "error" && (
                        <p className="text-xs text-red-600 mt-0.5">{row.error}</p>
                      )}
                      {row.status === "idle" && (
                        <div className="flex items-center gap-2 mt-1 flex-wrap">
                          {row.controlIds.length > 0 ? (
                            <span className="text-xs text-muted-foreground">
                              {row.controlIds.length} control{row.controlIds.length !== 1 ? "s" : ""} linked
                            </span>
                          ) : (
                            <span className="text-xs text-amber-600">No controls linked</span>
                          )}
                          {row.evidenceType && (
                            <Badge variant="secondary" className="text-[10px] h-4 px-1.5">
                              {EVIDENCE_TYPES.find((t) => t.value === row.evidenceType)?.label ?? row.evidenceType}
                            </Badge>
                          )}
                        </div>
                      )}
                    </div>

                    {row.status === "idle" && (
                      <div className="flex items-center gap-1 shrink-0">
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 w-7 p-0"
                          onClick={() => updateRow(idx, { expanded: !row.expanded })}
                          title={row.expanded ? "Collapse" : "Edit settings"}
                        >
                          {row.expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 w-7 p-0 text-muted-foreground hover:text-red-500"
                          onClick={() => removeRow(idx)}
                          title="Remove"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    )}
                  </div>

                  {/* Expanded per-file settings */}
                  {row.expanded && row.status === "idle" && (
                    <div className="px-3 pb-3 space-y-3 border-t pt-3">
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <Label className="text-xs">Title</Label>
                          <Input
                            value={row.title}
                            onChange={(e) => updateRow(idx, { title: e.target.value })}
                            className="h-8 text-xs mt-1"
                          />
                        </div>
                        <div>
                          <Label className="text-xs">Evidence Type <span className="text-red-500">*</span></Label>
                          <Select value={row.evidenceType} onValueChange={(v) => updateRow(idx, { evidenceType: v })}>
                            <SelectTrigger className="h-8 text-xs mt-1">
                              <SelectValue placeholder="Select…" />
                            </SelectTrigger>
                            <SelectContent>
                              {EVIDENCE_TYPES.map((t) => (
                                <SelectItem key={t.value} value={t.value} className="text-xs">{t.label}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                      <div>
                        <Label className="text-xs">Controls for this file</Label>
                        <div className="mt-1">
                          <ControlMultiSelect
                            controls={controlOptions}
                            selectedIds={row.controlIds}
                            primaryId={row.primaryControlId}
                            onChange={(ids) => {
                              updateRow(idx, {
                                controlIds: ids,
                                primaryControlId: ids.length > 0 && !ids.includes(row.primaryControlId ?? "") ? ids[0] : row.primaryControlId,
                              });
                            }}
                            onPrimaryChange={(id) => updateRow(idx, { primaryControlId: id })}
                            placeholder="Override controls for this file…"
                          />
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        <DialogFooter className="shrink-0 border-t pt-4 flex items-center justify-between">
          <div className="text-sm text-muted-foreground">
            {rows.length > 0 && !allDone && (
              <>
                {idleCount} pending · {successCount} done{errorCount > 0 ? ` · ${errorCount} failed` : ""}
              </>
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={handleClose} disabled={uploading}>
              {allDone ? "Close" : "Cancel"}
            </Button>
            {!allDone && (
              <Button onClick={handleUploadAll} disabled={uploading || rows.length === 0}>
                {uploading ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Uploading…
                  </>
                ) : (
                  <>
                    <Files className="h-4 w-4 mr-2" />
                    Upload {idleCount > 0 ? `${idleCount} File${idleCount !== 1 ? "s" : ""}` : "All"}
                  </>
                )}
              </Button>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
