import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetControl,
  useGetControlEvidence,
  useGetControlTasks,
  useGetControlPoams,
  getGetControlQueryKey,
  getGetControlEvidenceQueryKey,
  getGetControlTasksQueryKey,
  getGetControlPoamsQueryKey,
} from "@workspace/api-client-react";
import { useOrg } from "@/context/OrgContext";
import { Link } from "wouter";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { StatusBadge, LevelBadge, RiskBadge } from "@/components/ui/badges";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useToast } from "@/hooks/use-toast";
import {
  FileText,
  CheckSquare,
  AlertTriangle,
  Plus,
  Save,
  BookOpen,
  Target,
  ClipboardList,
  Calendar,
  Download,
  Paperclip,
  MoreHorizontal,
  Eye,
  Unlink,
  Archive,
} from "lucide-react";

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
  { value: "scan_report", label: "Vulnerability Scan" },
  { value: "network_diagram", label: "Network Diagram" },
  { value: "other", label: "Other" },
];

const CONTROL_STATUSES = [
  { value: "not_started", label: "Not Started" },
  { value: "in_progress", label: "In Progress" },
  { value: "implemented", label: "Implemented" },
  { value: "needs_review", label: "Needs Review" },
  { value: "assessor_ready", label: "Assessor Ready" },
  { value: "not_applicable", label: "Not Applicable" },
  { value: "at_risk", label: "At Risk" },
];

const TASK_PRIORITIES = [
  { value: "critical", label: "Critical" },
  { value: "high", label: "High" },
  { value: "medium", label: "Medium" },
  { value: "low", label: "Low" },
];

const RISK_LEVELS = [
  { value: "critical", label: "Critical" },
  { value: "high", label: "High" },
  { value: "medium", label: "Medium" },
  { value: "low", label: "Low" },
];

function apiHeaders(orgId: string | null | undefined) {
  const token = localStorage.getItem("auth_token");
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
    ...(orgId ? { "X-Organization-ID": orgId } : {}),
  };
}

function formatDate(d: string | null | undefined) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString();
}

function evidenceTypeLabel(v: string) {
  return EVIDENCE_TYPES.find((t) => t.value === v)?.label ?? v;
}

// ─── Add Evidence Dialog ────────────────────────────────────────────────────

interface AddEvidenceDialogProps {
  open: boolean;
  onClose: () => void;
  controlId: string;
  orgId: string | null | undefined;
  onSaved: () => void;
}

function AddEvidenceDialog({ open, onClose, controlId, orgId, onSaved }: AddEvidenceDialogProps) {
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [form, setForm] = useState({
    title: "",
    description: "",
    evidenceType: "",
    collectedAt: "",
    expiresAt: "",
    assessorSummary: "",
    internalNotes: "",
  });

  const set = (k: keyof typeof form) => (v: string) => setForm((f) => ({ ...f, [k]: v }));

  const resetForm = () => {
    setForm({ title: "", description: "", evidenceType: "", collectedAt: "", expiresAt: "", assessorSummary: "", internalNotes: "" });
    setFile(null);
  };

  const errors = {
    title: !form.title,
    evidenceType: !form.evidenceType,
    file: !file,
  };
  const hasErrors = errors.title || errors.evidenceType || errors.file;

  const handleSave = async () => {
    if (hasErrors) {
      toast({ title: "Please fill in all required fields and attach a file", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const token = localStorage.getItem("auth_token");
      const fd = new FormData();
      fd.append("title", form.title);
      fd.append("evidenceType", form.evidenceType);
      if (form.description) fd.append("description", form.description);
      if (form.collectedAt) fd.append("collectedAt", form.collectedAt);
      if (form.expiresAt) fd.append("expiresAt", form.expiresAt);
      if (form.assessorSummary) fd.append("assessorSummary", form.assessorSummary);
      if (form.internalNotes) fd.append("internalNotes", form.internalNotes);
      fd.append("controlIds", JSON.stringify([controlId]));
      fd.append("file", file!);

      const headers: Record<string, string> = {
        Authorization: `Bearer ${token}`,
      };
      if (orgId) headers["X-Organization-ID"] = orgId;

      const res = await fetch("/api/evidence/upload", {
        method: "POST",
        headers,
        body: fd,
      });
      if (!res.ok) {
        const e = await res.json();
        throw new Error(e.error ?? "Failed to save evidence");
      }
      toast({ title: "Evidence uploaded successfully" });
      resetForm();
      onSaved();
      onClose();
    } catch (err: any) {
      toast({ title: "Upload failed", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleClose = () => {
    resetForm();
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add Evidence</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-1">
          <div>
            <Label>Title <span className="text-red-500">*</span></Label>
            <Input
              value={form.title}
              onChange={(e) => set("title")(e.target.value)}
              placeholder="Evidence title"
              className={errors.title && form.title === "" && saving ? "border-red-400" : ""}
            />
          </div>

          <div>
            <Label>Evidence Type <span className="text-red-500">*</span></Label>
            <Select value={form.evidenceType} onValueChange={set("evidenceType")}>
              <SelectTrigger>
                <SelectValue placeholder="Select type..." />
              </SelectTrigger>
              <SelectContent>
                {EVIDENCE_TYPES.map((t) => (
                  <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label>File <span className="text-red-500">*</span></Label>
            <label className={`mt-1 flex items-center justify-center gap-2 w-full border-2 border-dashed rounded-lg p-4 cursor-pointer transition-colors ${file ? "border-primary/40 bg-primary/5" : "border-muted-foreground/30 hover:border-primary/40 hover:bg-muted/40"}`}>
              <input
                type="file"
                className="sr-only"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              />
              {file ? (
                <div className="flex items-center gap-2 text-sm">
                  <Paperclip className="h-4 w-4 text-primary shrink-0" />
                  <span className="font-medium text-primary truncate max-w-[280px]">{file.name}</span>
                  <span className="text-muted-foreground shrink-0">({(file.size / 1024).toFixed(0)} KB)</span>
                </div>
              ) : (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Paperclip className="h-4 w-4" />
                  <span>Click to choose a file from your computer</span>
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

          <div>
            <Label>Description</Label>
            <Textarea
              value={form.description}
              onChange={(e) => set("description")(e.target.value)}
              placeholder="What does this evidence demonstrate?"
              rows={2}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Collection Date</Label>
              <Input type="date" value={form.collectedAt} onChange={(e) => set("collectedAt")(e.target.value)} />
            </div>
            <div>
              <Label>Expiration Date</Label>
              <Input type="date" value={form.expiresAt} onChange={(e) => set("expiresAt")(e.target.value)} />
            </div>
          </div>

          <div>
            <Label>Assessor Summary</Label>
            <Textarea
              value={form.assessorSummary}
              onChange={(e) => set("assessorSummary")(e.target.value)}
              placeholder="Summary for the assessor..."
              rows={2}
            />
          </div>

          <div>
            <Label>Internal Notes</Label>
            <Textarea
              value={form.internalNotes}
              onChange={(e) => set("internalNotes")(e.target.value)}
              placeholder="Internal team notes..."
              rows={2}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={handleClose}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? "Uploading..." : "Upload Evidence"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Add Task Dialog ────────────────────────────────────────────────────────

interface AddTaskDialogProps {
  open: boolean;
  onClose: () => void;
  controlId: string;
  orgId: string | null | undefined;
  onSaved: () => void;
}

function AddTaskDialog({ open, onClose, controlId, orgId, onSaved }: AddTaskDialogProps) {
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    title: "",
    description: "",
    priority: "medium",
    dueDate: "",
    assignee: "",
  });

  const set = (k: keyof typeof form) => (v: string) => setForm((f) => ({ ...f, [k]: v }));

  const handleSave = async () => {
    if (!form.title) {
      toast({ title: "Title is required", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/tasks", {
        method: "POST",
        headers: apiHeaders(orgId),
        body: JSON.stringify({
          title: form.title,
          description: form.description,
          priority: form.priority,
          dueDate: form.dueDate || undefined,
          controlIds: [controlId],
        }),
      });
      if (!res.ok) {
        const e = await res.json();
        throw new Error(e.error ?? "Failed to save task");
      }
      toast({ title: "Task added" });
      setForm({ title: "", description: "", priority: "medium", dueDate: "", assignee: "" });
      onSaved();
      onClose();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Add Task</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-1">
          <div>
            <Label>Title *</Label>
            <Input value={form.title} onChange={(e) => set("title")(e.target.value)} placeholder="Task title" />
          </div>
          <div>
            <Label>Description</Label>
            <Textarea value={form.description} onChange={(e) => set("description")(e.target.value)} placeholder="What needs to be done?" rows={3} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Priority</Label>
              <Select value={form.priority} onValueChange={set("priority")}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {TASK_PRIORITIES.map((p) => (
                    <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Due Date</Label>
              <Input type="date" value={form.dueDate} onChange={(e) => set("dueDate")(e.target.value)} />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving || !form.title}>
            {saving ? "Saving..." : "Save Task"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Add POA&M Dialog ───────────────────────────────────────────────────────

interface AddPoamDialogProps {
  open: boolean;
  onClose: () => void;
  controlId: string;
  orgId: string | null | undefined;
  onSaved: () => void;
}

function AddPoamDialog({ open, onClose, controlId, orgId, onSaved }: AddPoamDialogProps) {
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    title: "",
    deficiencyDescription: "",
    riskLevel: "medium",
    scheduledCompletionDate: "",
    remediationPlan: "",
    resourcesRequired: "",
    notes: "",
  });

  const set = (k: keyof typeof form) => (v: string) => setForm((f) => ({ ...f, [k]: v }));

  const handleSave = async () => {
    if (!form.title || !form.deficiencyDescription) {
      toast({ title: "Title and weakness description are required", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/poams", {
        method: "POST",
        headers: apiHeaders(orgId),
        body: JSON.stringify({
          title: form.title,
          deficiencyDescription: form.deficiencyDescription,
          riskLevel: form.riskLevel,
          scheduledCompletionDate: form.scheduledCompletionDate || undefined,
          remediationPlan: form.remediationPlan,
          resourcesRequired: form.resourcesRequired,
          notes: form.notes,
          linkedControlId: controlId,
        }),
      });
      if (!res.ok) {
        const e = await res.json();
        throw new Error(e.error ?? "Failed to save POA&M");
      }
      toast({ title: "POA&M added" });
      setForm({ title: "", deficiencyDescription: "", riskLevel: "medium", scheduledCompletionDate: "", remediationPlan: "", resourcesRequired: "", notes: "" });
      onSaved();
      onClose();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add POA&M Item</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-1">
          <div>
            <Label>Title *</Label>
            <Input value={form.title} onChange={(e) => set("title")(e.target.value)} placeholder="POA&M item title" />
          </div>
          <div>
            <Label>Weakness / Gap *</Label>
            <Textarea value={form.deficiencyDescription} onChange={(e) => set("deficiencyDescription")(e.target.value)} placeholder="Describe the gap or deficiency..." rows={3} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Risk Level</Label>
              <Select value={form.riskLevel} onValueChange={set("riskLevel")}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {RISK_LEVELS.map((r) => (
                    <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Target Completion</Label>
              <Input type="date" value={form.scheduledCompletionDate} onChange={(e) => set("scheduledCompletionDate")(e.target.value)} />
            </div>
          </div>
          <div>
            <Label>Remediation Plan</Label>
            <Textarea value={form.remediationPlan} onChange={(e) => set("remediationPlan")(e.target.value)} placeholder="How will this be remediated?" rows={2} />
          </div>
          <div>
            <Label>Resources Required</Label>
            <Input value={form.resourcesRequired} onChange={(e) => set("resourcesRequired")(e.target.value)} placeholder="People, tools, budget..." />
          </div>
          <div>
            <Label>Notes</Label>
            <Textarea value={form.notes} onChange={(e) => set("notes")(e.target.value)} placeholder="Additional notes..." rows={2} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving || !form.title || !form.deficiencyDescription}>
            {saving ? "Saving..." : "Save POA&M"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Main Control Detail Page ───────────────────────────────────────────────

export default function ControlDetail({ id }: { id: string }) {
  const { activeOrg } = useOrg();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: control, isLoading: isLoadingControl } = useGetControl(id);
  const { data: evidence = [] } = useGetControlEvidence(id);
  const { data: tasks = [] } = useGetControlTasks(id);
  const { data: poams = [] } = useGetControlPoams(id);

  // Implementation form state - seeded from fetched data
  const [narrative, setNarrative] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Dialog states
  const [showAddEvidence, setShowAddEvidence] = useState(false);
  const [showAddTask, setShowAddTask] = useState(false);
  const [showAddPoam, setShowAddPoam] = useState(false);

  // When control loads, initialise local state (only once per control load)
  const narrativeValue = narrative !== null ? narrative : (control?.implementationNarrative ?? "");
  const statusValue = status !== null ? status : (control?.status ?? "not_started");

  const handleSaveImplementation = async () => {
    setSaving(true);
    try {
      const res = await fetch(`/api/controls/${id}`, {
        method: "PATCH",
        headers: apiHeaders(activeOrg?.id),
        body: JSON.stringify({ status: statusValue, implementationNarrative: narrativeValue }),
      });
      if (!res.ok) throw new Error("Failed to save");
      toast({ title: "Implementation saved" });
      queryClient.invalidateQueries({ queryKey: getGetControlQueryKey(id) });
    } catch {
      toast({ title: "Error", description: "Could not save implementation", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const invalidateEvidence = () => {
    queryClient.invalidateQueries({ queryKey: getGetControlEvidenceQueryKey(id) });
  };
  const invalidateTasks = () => {
    queryClient.invalidateQueries({ queryKey: getGetControlTasksQueryKey(id) });
  };
  const invalidatePoams = () => {
    queryClient.invalidateQueries({ queryKey: getGetControlPoamsQueryKey(id) });
  };

  if (isLoadingControl) {
    return (
      <div className="p-8 flex items-center justify-center">
        <div className="text-muted-foreground">Loading control...</div>
      </div>
    );
  }
  if (!control) {
    return (
      <div className="p-8 text-center text-muted-foreground">Control not found</div>
    );
  }

  const objectives = (control as any).objectives ?? [];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <h1 className="text-3xl font-bold">{control.controlId}</h1>
            <LevelBadge level={control.level} />
            <StatusBadge status={statusValue} />
          </div>
          <h2 className="text-xl text-muted-foreground">{control.title}</h2>
          {control.domainName && (
            <p className="text-sm text-muted-foreground mt-1">Domain: {control.domainName}</p>
          )}
        </div>
      </div>

      <Tabs defaultValue="implementation" className="w-full">
        <TabsList>
          <TabsTrigger value="implementation">Implementation</TabsTrigger>
          <TabsTrigger value="evidence">Evidence ({evidence.length})</TabsTrigger>
          <TabsTrigger value="tasks">Tasks ({tasks.length})</TabsTrigger>
          <TabsTrigger value="poams">POA&Ms ({poams.length})</TabsTrigger>
        </TabsList>

        {/* ── Implementation Tab ── */}
        <TabsContent value="implementation" className="mt-6 space-y-4">
          {/* Global control info */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <BookOpen className="h-4 w-4 text-primary" />
                Control Description
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <p>{control.description}</p>
              {control.implementationGuidance && (
                <div className="mt-2 p-3 bg-muted/40 rounded-md">
                  <p className="font-medium text-xs uppercase text-muted-foreground mb-1">Implementation Guidance</p>
                  <p>{control.implementationGuidance}</p>
                </div>
              )}
              {(control as any).nistRef && (
                <p className="text-xs text-muted-foreground">NIST Ref: {(control as any).nistRef}</p>
              )}
            </CardContent>
          </Card>

          {objectives.length > 0 && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Target className="h-4 w-4 text-primary" />
                  Assessment Objectives
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2">
                  {objectives.map((obj: any, i: number) => (
                    <li key={obj.id ?? i} className="flex gap-2 text-sm">
                      <span className="text-muted-foreground shrink-0">{i + 1}.</span>
                      <span>{obj.text}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}

          {/* Org-specific implementation form */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <ClipboardList className="h-4 w-4 text-primary" />
                Organization Implementation
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label>Implementation Status</Label>
                <Select value={statusValue} onValueChange={(v) => setStatus(v)}>
                  <SelectTrigger className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CONTROL_STATUSES.map((s) => (
                      <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label>Implementation Narrative</Label>
                <Textarea
                  className="mt-1 min-h-[140px]"
                  value={narrativeValue}
                  onChange={(e) => setNarrative(e.target.value)}
                  placeholder="Describe how this control is implemented in your environment. Include relevant system names, processes, and references to policies or procedures."
                />
              </div>

              <div className="flex items-center gap-3 text-sm text-muted-foreground">
                {(control as any).lastAssessedAt && (
                  <div className="flex items-center gap-1">
                    <Calendar className="h-3.5 w-3.5" />
                    Last reviewed: {formatDate((control as any).lastAssessedAt)}
                  </div>
                )}
              </div>

              <Button onClick={handleSaveImplementation} disabled={saving}>
                <Save className="h-4 w-4 mr-2" />
                {saving ? "Saving..." : "Save Implementation"}
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Evidence Tab ── */}
        <TabsContent value="evidence" className="mt-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-base">Evidence Items</h3>
            <Button size="sm" onClick={() => setShowAddEvidence(true)}>
              <Plus className="h-4 w-4 mr-1" />
              Add Evidence
            </Button>
          </div>

          {evidence.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <FileText className="h-10 w-10 mx-auto mb-3 text-muted-foreground/40" />
                <p className="text-muted-foreground font-medium">No evidence has been added for this control yet.</p>
                <p className="text-sm text-muted-foreground mt-1">
                  Upload policies, screenshots, logs, or other documentation to support this control.
                </p>
                <Button className="mt-4" size="sm" onClick={() => setShowAddEvidence(true)}>
                  <Plus className="h-4 w-4 mr-1" />
                  Add Evidence
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {evidence.map((item: any) => (
                <Card key={item.id} className="hover:shadow-md transition-shadow">
                  <CardHeader className="pb-2">
                    <div className="flex justify-between items-start gap-2">
                      <CardTitle className="text-base leading-snug flex-1 min-w-0">
                        <Link href={`/evidence/${item.id}`} className="hover:underline text-primary">
                          {item.title}
                        </Link>
                      </CardTitle>
                      <div className="flex items-center gap-1 shrink-0">
                        <StatusBadge status={item.status} />
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-7 w-7">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem asChild>
                              <Link href={`/evidence/${item.id}`} className="flex items-center gap-2">
                                <Eye className="h-4 w-4" />
                                View / Edit
                              </Link>
                            </DropdownMenuItem>
                            {item.fileKey && (
                              <DropdownMenuItem
                                onClick={() => {
                                  const token = localStorage.getItem("auth_token");
                                  const orgId = activeOrg?.id;
                                  fetch(`/api/evidence/${item.id}/download`, {
                                    headers: {
                                      Authorization: `Bearer ${token}`,
                                      ...(orgId ? { "X-Organization-ID": orgId } : {}),
                                    },
                                  })
                                    .then((r) => r.blob())
                                    .then((blob) => {
                                      const url = URL.createObjectURL(blob);
                                      const a = document.createElement("a");
                                      a.href = url;
                                      a.download = item.fileName ?? "evidence-file";
                                      a.click();
                                      URL.revokeObjectURL(url);
                                    })
                                    .catch(() => {});
                                }}
                                className="flex items-center gap-2"
                              >
                                <Download className="h-4 w-4" />
                                Download File
                              </DropdownMenuItem>
                            )}
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              onClick={async () => {
                                try {
                                  const res = await fetch(`/api/evidence/${item.id}/controls/${id}`, {
                                    method: "DELETE",
                                    headers: apiHeaders(activeOrg?.id),
                                  });
                                  if (!res.ok) throw new Error("Failed to remove");
                                  toast({ title: "Evidence removed from this control" });
                                  invalidateEvidence();
                                } catch {
                                  toast({ title: "Error", description: "Could not remove evidence from this control", variant: "destructive" });
                                }
                              }}
                              className="flex items-center gap-2"
                            >
                              <Unlink className="h-4 w-4" />
                              Remove from this Control
                            </DropdownMenuItem>
                            {item.status !== "archived" && (
                              <DropdownMenuItem
                                onClick={async () => {
                                  try {
                                    const res = await fetch(`/api/evidence/${item.id}/archive`, {
                                      method: "POST",
                                      headers: apiHeaders(activeOrg?.id),
                                    });
                                    if (!res.ok) throw new Error("Failed to archive");
                                    toast({ title: "Evidence archived" });
                                    invalidateEvidence();
                                  } catch {
                                    toast({ title: "Error", description: "Could not archive evidence", variant: "destructive" });
                                  }
                                }}
                                className="flex items-center gap-2"
                              >
                                <Archive className="h-4 w-4" />
                                Archive Evidence
                              </DropdownMenuItem>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    <Badge variant="outline" className="text-xs">
                      {evidenceTypeLabel(item.evidenceType)}
                    </Badge>
                    {item.fileName && (
                      <div className="flex items-center gap-1.5">
                        <Paperclip className="h-3 w-3 text-muted-foreground shrink-0" />
                        <span className="text-xs text-muted-foreground truncate">{item.fileName}</span>
                        {item.fileSize && (
                          <span className="text-xs text-muted-foreground shrink-0">
                            ({(item.fileSize / 1024).toFixed(0)} KB)
                          </span>
                        )}
                      </div>
                    )}
                    {item.collectedAt && (
                      <p className="text-xs text-muted-foreground">
                        Collected: {formatDate(item.collectedAt)}
                      </p>
                    )}
                    {item.ownerName && (
                      <p className="text-xs text-muted-foreground">Owner: {item.ownerName}</p>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

          <AddEvidenceDialog
            open={showAddEvidence}
            onClose={() => setShowAddEvidence(false)}
            controlId={id}
            orgId={activeOrg?.id}
            onSaved={invalidateEvidence}
          />
        </TabsContent>

        {/* ── Tasks Tab ── */}
        <TabsContent value="tasks" className="mt-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-base">Tasks</h3>
            <Button size="sm" onClick={() => setShowAddTask(true)}>
              <Plus className="h-4 w-4 mr-1" />
              Add Task
            </Button>
          </div>

          {tasks.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <CheckSquare className="h-10 w-10 mx-auto mb-3 text-muted-foreground/40" />
                <p className="text-muted-foreground font-medium">No tasks have been added for this control yet.</p>
                <p className="text-sm text-muted-foreground mt-1">
                  Create tasks to track remediation work, reviews, and compliance activities.
                </p>
                <Button className="mt-4" size="sm" onClick={() => setShowAddTask(true)}>
                  <Plus className="h-4 w-4 mr-1" />
                  Add Task
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-2">
              {tasks.map((task: any) => (
                <Card key={task.id}>
                  <CardContent className="py-3 flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">{task.title}</p>
                      {task.description && (
                        <p className="text-sm text-muted-foreground mt-0.5 line-clamp-2">{task.description}</p>
                      )}
                      <div className="flex items-center gap-2 mt-1.5">
                        <StatusBadge status={task.status} />
                        <RiskBadge level={task.priority} />
                        {task.dueDate && (
                          <span className="text-xs text-muted-foreground flex items-center gap-0.5">
                            <Calendar className="h-3 w-3" />
                            {formatDate(task.dueDate)}
                          </span>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

          <AddTaskDialog
            open={showAddTask}
            onClose={() => setShowAddTask(false)}
            controlId={id}
            orgId={activeOrg?.id}
            onSaved={invalidateTasks}
          />
        </TabsContent>

        {/* ── POA&Ms Tab ── */}
        <TabsContent value="poams" className="mt-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-base">Plans of Action & Milestones</h3>
            <Button size="sm" onClick={() => setShowAddPoam(true)}>
              <Plus className="h-4 w-4 mr-1" />
              Add POA&M
            </Button>
          </div>

          {poams.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <AlertTriangle className="h-10 w-10 mx-auto mb-3 text-muted-foreground/40" />
                <p className="text-muted-foreground font-medium">No POA&M items have been added for this control yet.</p>
                <p className="text-sm text-muted-foreground mt-1">
                  Add POA&M items to track gaps, remediation plans, and risk acceptance decisions.
                </p>
                <Button className="mt-4" size="sm" onClick={() => setShowAddPoam(true)}>
                  <Plus className="h-4 w-4 mr-1" />
                  Add POA&M
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-2">
              {poams.map((poam: any) => (
                <Card key={poam.id}>
                  <CardContent className="py-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          {poam.poamNumber && (
                            <span className="text-xs font-mono text-muted-foreground">{poam.poamNumber}</span>
                          )}
                          <p className="font-medium truncate">{poam.title}</p>
                        </div>
                        {poam.deficiencyDescription && (
                          <p className="text-sm text-muted-foreground line-clamp-2">{poam.deficiencyDescription}</p>
                        )}
                        <div className="flex items-center gap-2 mt-1.5">
                          <StatusBadge status={poam.status} />
                          <RiskBadge level={poam.riskLevel} />
                          {poam.scheduledCompletionDate && (
                            <span className="text-xs text-muted-foreground flex items-center gap-0.5">
                              <Calendar className="h-3 w-3" />
                              Target: {formatDate(poam.scheduledCompletionDate)}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

          <AddPoamDialog
            open={showAddPoam}
            onClose={() => setShowAddPoam(false)}
            controlId={id}
            orgId={activeOrg?.id}
            onSaved={invalidatePoams}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
