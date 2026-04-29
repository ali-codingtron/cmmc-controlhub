import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import {
  ClipboardList,
  Plus,
  Clock,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  RefreshCw,
  Upload,
  ChevronRight,
  Calendar,
  Repeat,
  FileCheck,
} from "lucide-react";
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
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/utils";

const API_BASE = "/api";

const PRESET_REQUESTS = [
  { label: "Export User List", evidenceType: "configuration_export", instructions: "Export a full user list from your identity system (CSV or PDF). Include all active accounts, roles, and last login dates." },
  { label: "Export MFA Status", evidenceType: "configuration_export", instructions: "Export MFA enrollment status for all user accounts. Include user email, MFA method, and enrollment date." },
  { label: "Export Admin Roles", evidenceType: "configuration_export", instructions: "Export a list of all privileged/admin accounts with their roles and permissions." },
  { label: "Export Device Inventory", evidenceType: "configuration_export", instructions: "Export complete device inventory including OS version, patch level, and device owner." },
  { label: "Upload Firewall Log Review", evidenceType: "log", instructions: "Upload the completed monthly firewall log review. Include summary of findings and any anomalies." },
  { label: "Upload Backup Verification", evidenceType: "approval_record", instructions: "Upload backup verification results. Confirm backup completeness and successful restore test." },
  { label: "Upload Vulnerability Scan Report", evidenceType: "scan_report", instructions: "Upload the latest vulnerability scan report. Include severity breakdown and remediation status." },
  { label: "Upload Access Review Worksheet", evidenceType: "approval_record", instructions: "Upload the completed quarterly access review worksheet signed by the access owner." },
];

const RECURRENCE_LABELS: Record<string, string> = {
  once: "One-time",
  monthly: "Monthly",
  quarterly: "Quarterly",
  semi_annual: "Semi-annual",
  annually: "Annual",
};

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: React.ComponentType<any> }> = {
  pending: { label: "Pending", color: "bg-blue-500/10 text-blue-600 border-blue-200 dark:text-blue-400", icon: Clock },
  overdue: { label: "Overdue", color: "bg-red-500/10 text-red-600 border-red-200 dark:text-red-400", icon: AlertTriangle },
  fulfilled: { label: "Fulfilled", color: "bg-green-500/10 text-green-600 border-green-200 dark:text-green-400", icon: CheckCircle2 },
  cancelled: { label: "Cancelled", color: "bg-gray-500/10 text-gray-500 border-gray-200", icon: XCircle },
};

interface EvidenceRequest {
  id: string;
  title: string;
  description: string | null;
  evidenceType: string;
  instructions: string | null;
  ownerId: string;
  ownerName: string | null;
  controlId: string | null;
  dueDate: string | null;
  recurrence: string;
  requiredFileTypes: string[];
  approvalRequired: boolean;
  assessorSummaryRequired: boolean;
  status: string;
  fulfilledAt: string | null;
  createdAt: string;
}

function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS_CONFIG[status] ?? STATUS_CONFIG.pending;
  const Icon = cfg.icon;
  return (
    <Badge variant="outline" className={cn("gap-1 text-xs", cfg.color)}>
      <Icon className="h-3 w-3" />
      {cfg.label}
    </Badge>
  );
}

function FulfillDialog({
  request,
  onClose,
}: {
  request: EvidenceRequest;
  onClose: () => void;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [notes, setNotes] = useState("");
  const [assessorSummary, setAssessorSummary] = useState("");
  const [fileName, setFileName] = useState("");
  const [saving, setSaving] = useState(false);

  const handleFulfill = async () => {
    setSaving(true);
    try {
      const token = localStorage.getItem("auth_token");
      const res = await fetch(`${API_BASE}/evidence-requests/${request.id}/fulfill`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
          "X-Organization-ID": localStorage.getItem("cmmc_active_org_id") ?? "",
        },
        body: JSON.stringify({ notes, assessorSummary, fileName: fileName || undefined }),
      });
      if (!res.ok) throw new Error(await res.text());
      toast({ title: "Request fulfilled", description: "Evidence record created and linked." });
      queryClient.invalidateQueries({ queryKey: ["evidence-requests"] });
      onClose();
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Fulfill: {request.title}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          {request.instructions && (
            <div className="rounded-md bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 p-3 text-sm text-blue-800 dark:text-blue-200">
              <div className="font-medium mb-1">Instructions</div>
              <p>{request.instructions}</p>
            </div>
          )}
          {request.requiredFileTypes.length > 0 && (
            <div className="text-sm">
              <span className="text-muted-foreground">Required file types: </span>
              <span className="font-medium">{request.requiredFileTypes.join(", ")}</span>
            </div>
          )}
          <div>
            <Label>File Name (optional)</Label>
            <Input
              value={fileName}
              onChange={(e) => setFileName(e.target.value)}
              placeholder="e.g. user-export-2026-04.csv"
            />
            <p className="text-xs text-muted-foreground mt-1">
              In a live deployment, a file picker would upload to secure storage.
            </p>
          </div>
          <div>
            <Label>Notes</Label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Describe what was collected and any relevant context..."
              rows={3}
            />
          </div>
          {request.assessorSummaryRequired && (
            <div>
              <Label>Assessor Summary *</Label>
              <Textarea
                value={assessorSummary}
                onChange={(e) => setAssessorSummary(e.target.value)}
                placeholder="Write a summary for the assessor..."
                rows={3}
              />
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleFulfill} disabled={saving}>
            <FileCheck className="h-4 w-4 mr-1" />
            {saving ? "Fulfilling..." : "Mark Fulfilled"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CreateRequestDialog({ onClose }: { onClose: () => void }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const [preset, setPreset] = useState<number | null>(null);
  const [form, setForm] = useState({
    title: "",
    description: "",
    evidenceType: "report",
    instructions: "",
    controlId: "",
    dueDate: "",
    recurrence: "once",
    requiredFileTypes: "",
    approvalRequired: false,
    assessorSummaryRequired: false,
  });
  const [saving, setSaving] = useState(false);

  const applyPreset = (idx: number) => {
    const p = PRESET_REQUESTS[idx];
    setPreset(idx);
    setForm((f) => ({
      ...f,
      title: p.label,
      evidenceType: p.evidenceType,
      instructions: p.instructions,
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.title) return;
    setSaving(true);
    try {
      const token = localStorage.getItem("auth_token");
      const res = await fetch(`${API_BASE}/evidence-requests`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
          "X-Organization-ID": localStorage.getItem("cmmc_active_org_id") ?? "",
        },
        body: JSON.stringify({
          ...form,
          dueDate: form.dueDate || undefined,
          controlId: form.controlId || undefined,
          requiredFileTypes: form.requiredFileTypes
            ? form.requiredFileTypes.split(",").map((s) => s.trim()).filter(Boolean)
            : [],
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      toast({ title: "Evidence request created" });
      queryClient.invalidateQueries({ queryKey: ["evidence-requests"] });
      onClose();
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>New Evidence Request</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label className="mb-2 block">Quick-fill from preset</Label>
            <div className="grid grid-cols-2 gap-1.5 max-h-40 overflow-y-auto pr-1">
              {PRESET_REQUESTS.map((p, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => applyPreset(i)}
                  className={cn(
                    "text-left px-2.5 py-1.5 rounded-md text-xs border transition-colors",
                    preset === i
                      ? "bg-primary text-primary-foreground border-primary"
                      : "hover:bg-accent border-border"
                  )}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          <div className="border-t pt-4 grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <Label>Title *</Label>
              <Input
                value={form.title}
                onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                placeholder="Evidence request title"
                required
              />
            </div>
            <div className="col-span-2">
              <Label>Instructions</Label>
              <Textarea
                value={form.instructions}
                onChange={(e) => setForm((f) => ({ ...f, instructions: e.target.value }))}
                placeholder="Step-by-step instructions for the evidence owner..."
                rows={3}
              />
            </div>
            <div>
              <Label>Evidence Type</Label>
              <Select
                value={form.evidenceType}
                onValueChange={(v) => setForm((f) => ({ ...f, evidenceType: v }))}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {["policy","procedure","screenshot","log","report","ticket","configuration_export","training_record","incident_record","risk_record","approval_record","network_diagram","scan_report","other"].map((t) => (
                    <SelectItem key={t} value={t}>{t.replace(/_/g, " ")}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Recurrence</Label>
              <Select
                value={form.recurrence}
                onValueChange={(v) => setForm((f) => ({ ...f, recurrence: v }))}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(RECURRENCE_LABELS).map(([k, v]) => (
                    <SelectItem key={k} value={k}>{v}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Due Date</Label>
              <Input
                type="date"
                value={form.dueDate}
                onChange={(e) => setForm((f) => ({ ...f, dueDate: e.target.value }))}
              />
            </div>
            <div>
              <Label>Control ID (optional)</Label>
              <Input
                value={form.controlId}
                onChange={(e) => setForm((f) => ({ ...f, controlId: e.target.value }))}
                placeholder="e.g. 03.01"
              />
            </div>
            <div className="col-span-2">
              <Label>Required File Types (comma-separated)</Label>
              <Input
                value={form.requiredFileTypes}
                onChange={(e) => setForm((f) => ({ ...f, requiredFileTypes: e.target.value }))}
                placeholder="pdf, xlsx, csv"
              />
            </div>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="approvalRequired"
                checked={form.approvalRequired}
                onChange={(e) => setForm((f) => ({ ...f, approvalRequired: e.target.checked }))}
                className="rounded"
              />
              <Label htmlFor="approvalRequired">Approval required</Label>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="assessorSummaryRequired"
                checked={form.assessorSummaryRequired}
                onChange={(e) => setForm((f) => ({ ...f, assessorSummaryRequired: e.target.checked }))}
                className="rounded"
              />
              <Label htmlFor="assessorSummaryRequired">Assessor summary required</Label>
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={saving}>{saving ? "Creating..." : "Create Request"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function RequestCard({
  request,
  onFulfill,
}: {
  request: EvidenceRequest;
  onFulfill: (r: EvidenceRequest) => void;
}) {
  const isOverdue =
    request.status === "pending" &&
    request.dueDate &&
    new Date(request.dueDate) < new Date();
  const displayStatus = isOverdue ? "overdue" : request.status;

  return (
    <Card className="hover:shadow-sm transition-shadow">
      <CardContent className="pt-4 pb-3">
        <div className="flex items-start gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap mb-1">
              <StatusBadge status={displayStatus} />
              {request.recurrence !== "once" && (
                <Badge variant="outline" className="text-xs gap-1">
                  <Repeat className="h-3 w-3" />
                  {RECURRENCE_LABELS[request.recurrence]}
                </Badge>
              )}
              {request.approvalRequired && (
                <Badge variant="outline" className="text-xs">Approval needed</Badge>
              )}
            </div>
            <div className="font-medium text-sm mt-1">{request.title}</div>
            {request.instructions && (
              <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{request.instructions}</p>
            )}
            <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground flex-wrap">
              <span className="capitalize">{request.evidenceType.replace(/_/g, " ")}</span>
              {request.controlId && <span>Control: {request.controlId}</span>}
              {request.dueDate && (
                <span className={cn("flex items-center gap-1", isOverdue && "text-red-500 font-medium")}>
                  <Calendar className="h-3 w-3" />
                  Due {new Date(request.dueDate).toLocaleDateString()}
                </span>
              )}
              {request.ownerName && <span>Owner: {request.ownerName}</span>}
            </div>
          </div>
          {(request.status === "pending" || isOverdue) && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => onFulfill(request)}
              className="shrink-0"
            >
              <Upload className="h-3.5 w-3.5 mr-1" />
              Fulfill
            </Button>
          )}
          {request.status === "fulfilled" && request.fulfilledAt && (
            <div className="text-xs text-muted-foreground shrink-0">
              <CheckCircle2 className="h-4 w-4 text-green-500 mx-auto mb-0.5" />
              {new Date(request.fulfilledAt).toLocaleDateString()}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export default function EvidenceRequests() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [fulfilling, setFulfilling] = useState<EvidenceRequest | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>("all");

  const { data: requests = [], isLoading, refetch } = useQuery<EvidenceRequest[]>({
    queryKey: ["evidence-requests", statusFilter],
    queryFn: async () => {
      const token = localStorage.getItem("auth_token");
      const params = statusFilter !== "all" ? `?status=${statusFilter}` : "";
      const res = await fetch(`${API_BASE}/evidence-requests${params}`, {
        headers: {
          Authorization: `Bearer ${token}`,
          "X-Organization-ID": localStorage.getItem("cmmc_active_org_id") ?? "",
        },
      });
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
  });

  const { data: stats } = useQuery({
    queryKey: ["evidence-requests-stats"],
    queryFn: async () => {
      const token = localStorage.getItem("auth_token");
      const res = await fetch(`${API_BASE}/evidence-requests/stats`, {
        headers: {
          Authorization: `Bearer ${token}`,
          "X-Organization-ID": localStorage.getItem("cmmc_active_org_id") ?? "",
        },
      });
      if (!res.ok) return { pending: 0, fulfilled: 0, overdue: 0, cancelled: 0 };
      return res.json();
    },
  });

  const pending = requests.filter((r) => r.status === "pending" && (!r.dueDate || new Date(r.dueDate) >= new Date()));
  const overdue = requests.filter((r) => r.status === "pending" && r.dueDate && new Date(r.dueDate) < new Date());
  const fulfilled = requests.filter((r) => r.status === "fulfilled");

  return (
    <div className="p-6 space-y-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <ClipboardList className="h-7 w-7 text-primary" />
            Evidence Requests
          </h1>
          <p className="text-muted-foreground mt-1">
            Define and manage recurring evidence collection jobs. Assign owners, set due dates, and track fulfillment.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            <RefreshCw className="h-4 w-4 mr-1" />
            Refresh
          </Button>
          <Button onClick={() => setShowCreate(true)}>
            <Plus className="h-4 w-4 mr-1" />
            New Request
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-3">
        {[
          { key: "pending", label: "Pending", color: "text-blue-500", icon: Clock },
          { key: "overdue", label: "Overdue", color: "text-red-500", icon: AlertTriangle },
          { key: "fulfilled", label: "Fulfilled", color: "text-green-500", icon: CheckCircle2 },
          { key: "cancelled", label: "Cancelled", color: "text-gray-400", icon: XCircle },
        ].map(({ key, label, color, icon: Icon }) => (
          <Card
            key={key}
            className={cn("cursor-pointer transition-shadow hover:shadow-sm", statusFilter === key && "ring-2 ring-primary")}
            onClick={() => setStatusFilter(statusFilter === key ? "all" : key)}
          >
            <CardContent className="pt-4 pb-3">
              <div className="flex items-center gap-2">
                <Icon className={cn("h-5 w-5", color)} />
                <div>
                  <div className="text-xl font-bold">{stats?.[key] ?? 0}</div>
                  <div className="text-xs text-muted-foreground">{label}</div>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Filter tabs */}
      <div className="flex items-center gap-2">
        {["all", "pending", "overdue", "fulfilled", "cancelled"].map((s) => (
          <button
            key={s}
            onClick={() => setStatusFilter(s)}
            className={cn(
              "px-3 py-1.5 rounded-md text-sm transition-colors capitalize",
              statusFilter === s
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-accent"
            )}
          >
            {s === "all" ? "All" : s}
          </button>
        ))}
      </div>

      {/* Request list */}
      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <Card key={i} className="h-24 animate-pulse bg-muted" />
          ))}
        </div>
      ) : requests.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center">
            <ClipboardList className="h-12 w-12 mx-auto mb-3 text-muted-foreground/40" />
            <p className="text-muted-foreground font-medium">No evidence requests yet</p>
            <p className="text-sm text-muted-foreground mt-1">
              Create a request to start collecting evidence from your team.
            </p>
            <Button className="mt-4" onClick={() => setShowCreate(true)}>
              <Plus className="h-4 w-4 mr-1" />
              Create First Request
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {overdue.length > 0 && (
            <div>
              <div className="text-xs font-semibold text-red-500 uppercase tracking-wider mb-2 flex items-center gap-1">
                <AlertTriangle className="h-3 w-3" /> Overdue ({overdue.length})
              </div>
              {overdue.map((r) => (
                <RequestCard key={r.id} request={r} onFulfill={setFulfilling} />
              ))}
            </div>
          )}
          {pending.length > 0 && (
            <div>
              <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                Pending ({pending.length})
              </div>
              {pending.map((r) => (
                <RequestCard key={r.id} request={r} onFulfill={setFulfilling} />
              ))}
            </div>
          )}
          {fulfilled.length > 0 && (
            <div>
              <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                Fulfilled ({fulfilled.length})
              </div>
              {fulfilled.map((r) => (
                <RequestCard key={r.id} request={r} onFulfill={setFulfilling} />
              ))}
            </div>
          )}
          {requests.filter((r) => r.status === "cancelled").map((r) => (
            <RequestCard key={r.id} request={r} onFulfill={setFulfilling} />
          ))}
        </div>
      )}

      {showCreate && <CreateRequestDialog onClose={() => setShowCreate(false)} />}
      {fulfilling && (
        <FulfillDialog request={fulfilling} onClose={() => setFulfilling(null)} />
      )}
    </div>
  );
}
