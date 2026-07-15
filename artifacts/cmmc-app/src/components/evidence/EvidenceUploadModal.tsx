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
import { Paperclip, AlertTriangle, Link2, Plus, Upload } from "lucide-react";
import { ControlMultiSelect } from "./ControlMultiSelect";

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

  const { data: controls = [] } = useListControls({});

  const set = (k: keyof typeof form) => (v: string) =>
    setForm((f) => ({ ...f, [k]: v }));

  const resetForm = () => {
    setForm({ title: "", description: "", evidenceType: "", collectedAt: "", expiresAt: "", assessorSummary: "", internalNotes: "" });
    setFile(null);
    setSelectedControlIds([]);
    setPrimaryControlId(null);
    setDuplicates([]);
    setShowDuplicatePrompt(false);
    setDuplicateAction(null);
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
    if (f && !form.title) {
      set("title")(f.name.replace(/\.[^/.]+$/, ""));
    }
  };

  const checkDuplicate = async (f: File): Promise<DuplicateMatch[]> => {
    try {
      const params = new URLSearchParams({ filename: f.name, size: String(f.size) });
      const res = await fetch(`/api/evidence/check-duplicate?${params}`, { headers: apiHeaders() });
      if (!res.ok) return [];
      const data = await res.json();
      return data.matches ?? [];
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
        throw new Error(e.error ?? "Upload failed");
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

    // Duplicate check
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

          {/* Evidence Type */}
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
