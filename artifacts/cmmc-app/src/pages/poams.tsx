import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useIsAssessor } from "@/lib/auth";
import {
  useListPoams,
  getListPoamsQueryKey,
  useListUsers,
  useListControls,
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Link } from "wouter";
import { Plus, AlertTriangle, Loader2, X } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useOrg } from "@/context/OrgContext";
import { cn } from "@/lib/utils";

const POAM_STATUSES = [
  { value: "open", label: "Open" },
  { value: "in_progress", label: "In Progress" },
  { value: "waiting_on_vendor", label: "Waiting on Vendor" },
  { value: "mitigated", label: "Mitigated" },
  { value: "accepted_risk", label: "Accepted Risk" },
  { value: "closed", label: "Closed" },
];

const RISK_LEVELS = [
  { value: "critical", label: "Critical" },
  { value: "high", label: "High" },
  { value: "medium", label: "Medium" },
  { value: "low", label: "Low" },
];

function PoamStatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    open: "bg-red-100 text-red-700 border-red-200",
    in_progress: "bg-yellow-100 text-yellow-700 border-yellow-200",
    waiting_on_vendor: "bg-orange-100 text-orange-700 border-orange-200",
    mitigated: "bg-blue-100 text-blue-700 border-blue-200",
    accepted_risk: "bg-purple-100 text-purple-700 border-purple-200",
    closed: "bg-green-100 text-green-700 border-green-200",
  };
  const label = POAM_STATUSES.find((s) => s.value === status)?.label ?? status.replace(/_/g, " ");
  return (
    <span className={cn("inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border whitespace-nowrap", colors[status] ?? "bg-gray-100 text-gray-700")}>
      {label}
    </span>
  );
}

function PoamRiskBadge({ level }: { level: string }) {
  const colors: Record<string, string> = {
    critical: "bg-red-600 text-white border-red-600",
    high: "bg-red-100 text-red-700 border-red-200",
    medium: "bg-yellow-100 text-yellow-700 border-yellow-200",
    low: "bg-green-100 text-green-700 border-green-200",
  };
  return (
    <span className={cn("inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold border whitespace-nowrap", colors[level] ?? "bg-gray-100 text-gray-600")}>
      {level ? level.charAt(0).toUpperCase() + level.slice(1) : "—"}
    </span>
  );
}

function formatDate(d: string | Date | null | undefined) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

// ─── Add POA&M Dialog ─────────────────────────────────────────────────────────

interface AddPoamForm {
  poamNumber: string;
  title: string;
  deficiencyDescription: string;
  linkedControlId: string;
  riskLevel: string;
  status: string;
  ownerId: string;
  scheduledCompletionDate: string;
  remediationPlan: string;
  resourcesRequired: string;
  notes: string;
}

const EMPTY_FORM: AddPoamForm = {
  poamNumber: "",
  title: "",
  deficiencyDescription: "",
  linkedControlId: "",
  riskLevel: "medium",
  status: "open",
  ownerId: "",
  scheduledCompletionDate: "",
  remediationPlan: "",
  resourcesRequired: "",
  notes: "",
};

function AddPoamDialog({
  open,
  onClose,
  onSaved,
  defaultControlId,
}: {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  defaultControlId?: string;
}) {
  const { toast } = useToast();
  const { activeOrg } = useOrg();
  const [form, setForm] = useState<AddPoamForm>({ ...EMPTY_FORM, linkedControlId: defaultControlId ?? "" });
  const [saving, setSaving] = useState(false);

  const { data: users = [] } = useListUsers();
  const { data: controlsData } = useListControls();
  const controls = (controlsData as any[]) ?? [];

  const set = (k: keyof AddPoamForm) => (v: string) => setForm((f) => ({ ...f, [k]: v }));

  const handleSave = async () => {
    if (!form.title.trim() || !form.deficiencyDescription.trim()) {
      toast({ title: "Title and description are required", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const token = localStorage.getItem("auth_token");
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      };
      if (activeOrg?.id) headers["X-Organization-ID"] = activeOrg.id;

      const res = await fetch("/api/poams", {
        method: "POST",
        headers,
        body: JSON.stringify({
          poamNumber: form.poamNumber || undefined,
          title: form.title,
          deficiencyDescription: form.deficiencyDescription,
          linkedControlId: form.linkedControlId || undefined,
          riskLevel: form.riskLevel,
          status: form.status,
          ownerId: form.ownerId || undefined,
          scheduledCompletionDate: form.scheduledCompletionDate || undefined,
          remediationPlan: form.remediationPlan || undefined,
          resourcesRequired: form.resourcesRequired || undefined,
          notes: form.notes || undefined,
        }),
      });

      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        throw new Error(e.error ?? "Failed to save POA&M");
      }

      toast({ title: "POA&M created" });
      setForm({ ...EMPTY_FORM, linkedControlId: defaultControlId ?? "" });
      onSaved();
      onClose();
    } catch (err: any) {
      toast({ title: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col">
        <DialogHeader className="shrink-0">
          <DialogTitle>Add POA&amp;M Item</DialogTitle>
        </DialogHeader>

        <div className="overflow-y-auto flex-1 min-h-0 py-2 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>POA&amp;M Number <span className="text-muted-foreground text-xs">(auto-generated if blank)</span></Label>
              <Input value={form.poamNumber} onChange={(e) => set("poamNumber")(e.target.value)} placeholder="POA&amp;M-0001" />
            </div>
            <div className="space-y-1.5">
              <Label>Risk Level</Label>
              <Select value={form.riskLevel} onValueChange={set("riskLevel")}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {RISK_LEVELS.map((r) => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Title <span className="text-red-500">*</span></Label>
            <Input value={form.title} onChange={(e) => set("title")(e.target.value)} placeholder="POA&M item title" />
          </div>

          <div className="space-y-1.5">
            <Label>Deficiency Description / Gap <span className="text-red-500">*</span></Label>
            <Textarea
              value={form.deficiencyDescription}
              onChange={(e) => set("deficiencyDescription")(e.target.value)}
              placeholder="Describe the weakness, gap, or finding..."
              rows={3}
              className="min-h-[80px]"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Linked Control</Label>
              <Select value={form.linkedControlId || "__none__"} onValueChange={(v) => set("linkedControlId")(v === "__none__" ? "" : v)}>
                <SelectTrigger><SelectValue placeholder="Select control..." /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">No linked control</SelectItem>
                  {controls.map((c: any) => (
                    <SelectItem key={c.id} value={c.id}>{c.controlId} — {(c.title ?? "").slice(0, 50)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Status</Label>
              <Select value={form.status} onValueChange={set("status")}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {POAM_STATUSES.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Owner</Label>
              <Select value={form.ownerId || "__none__"} onValueChange={(v) => set("ownerId")(v === "__none__" ? "" : v)}>
                <SelectTrigger><SelectValue placeholder="Assign owner..." /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Unassigned</SelectItem>
                  {users.map((u: any) => (
                    <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Scheduled Completion</Label>
              <Input type="date" value={form.scheduledCompletionDate} onChange={(e) => set("scheduledCompletionDate")(e.target.value)} />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Remediation Plan</Label>
            <Textarea
              value={form.remediationPlan}
              onChange={(e) => set("remediationPlan")(e.target.value)}
              placeholder="Steps planned to remediate this finding..."
              rows={3}
              className="min-h-[72px]"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Resources Required</Label>
              <Textarea
                value={form.resourcesRequired}
                onChange={(e) => set("resourcesRequired")(e.target.value)}
                placeholder="Budget, personnel, tools..."
                rows={2}
                className="min-h-[60px]"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Notes</Label>
              <Textarea
                value={form.notes}
                onChange={(e) => set("notes")(e.target.value)}
                placeholder="Internal notes..."
                rows={2}
                className="min-h-[60px]"
              />
            </div>
          </div>
        </div>

        <DialogFooter className="shrink-0">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Save POA&amp;M
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function Poams() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterRisk, setFilterRisk] = useState("all");
  const [showAdd, setShowAdd] = useState(false);
  const isAssessor = useIsAssessor();

  const { data: poams = [], isLoading } = useListPoams({
    status: filterStatus !== "all" ? filterStatus : undefined,
    riskLevel: filterRisk !== "all" ? filterRisk : undefined,
  });

  const filtered = poams.filter((p) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      (p.title ?? "").toLowerCase().includes(q) ||
      (p.poamNumber ?? "").toLowerCase().includes(q) ||
      (p.linkedControlLabel ?? "").toLowerCase().includes(q)
    );
  });

  const openCount = poams.filter((p) => p.status === "open").length;
  const highCritCount = poams.filter((p) => p.riskLevel === "critical" || p.riskLevel === "high").length;
  const inProgressCount = poams.filter((p) => p.status === "in_progress").length;

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">POA&amp;Ms</h1>
          <p className="text-muted-foreground mt-1">Plan of Action &amp; Milestones — track remediation of gaps and findings</p>
        </div>
        {!isAssessor && (
          <Button onClick={() => setShowAdd(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Add POA&amp;M
          </Button>
        )}
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Open Items</p>
                <p className="text-2xl font-bold text-red-600">{openCount}</p>
              </div>
              <AlertTriangle className="h-8 w-8 text-red-400 opacity-60" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">In Progress</p>
                <p className="text-2xl font-bold text-yellow-600">{inProgressCount}</p>
              </div>
              <AlertTriangle className="h-8 w-8 text-yellow-400 opacity-60" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Critical / High Risk</p>
                <p className="text-2xl font-bold text-orange-600">{highCritCount}</p>
              </div>
              <AlertTriangle className="h-8 w-8 text-orange-400 opacity-60" />
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">All POA&amp;M Items ({filtered.length})</CardTitle>
            {(filterStatus !== "all" || filterRisk !== "all" || search) && (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 gap-1 text-xs text-muted-foreground"
                onClick={() => { setFilterStatus("all"); setFilterRisk("all"); setSearch(""); }}
              >
                <X className="h-3 w-3" /> Clear filters
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          {/* Filters */}
          <div className="flex gap-3 mb-5 flex-wrap">
            <Input
              placeholder="Search POA&Ms..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="max-w-xs"
            />
            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger className="w-44">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                {POAM_STATUSES.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={filterRisk} onValueChange={setFilterRisk}>
              <SelectTrigger className="w-36">
                <SelectValue placeholder="Risk Level" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Risk Levels</SelectItem>
                {RISK_LEVELS.map((r) => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          {isLoading ? (
            <div className="space-y-3">
              {[...Array(5)].map((_, i) => <div key={i} className="h-12 animate-pulse bg-muted rounded" />)}
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-14 text-muted-foreground">
              <AlertTriangle className="h-12 w-12 mx-auto mb-3 opacity-25" />
              <p className="font-medium">No POA&amp;M items found</p>
              <p className="text-sm mt-1">Add a POA&amp;M to track remediation of a gap or finding.</p>
              <Button className="mt-4" onClick={() => setShowAdd(true)}>
                <Plus className="h-4 w-4 mr-2" />
                Add First POA&amp;M
              </Button>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-28">POA&amp;M #</TableHead>
                  <TableHead>Title</TableHead>
                  <TableHead className="w-32">Status</TableHead>
                  <TableHead className="w-24">Risk</TableHead>
                  <TableHead className="w-36">Control</TableHead>
                  <TableHead className="w-32">Owner</TableHead>
                  <TableHead className="w-32">Target Date</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((poam) => (
                  <TableRow key={poam.id}>
                    <TableCell className="font-mono text-xs">
                      <Link href={`/poams/${poam.id}`} className="text-primary hover:underline font-semibold">
                        {poam.poamNumber ?? "—"}
                      </Link>
                    </TableCell>
                    <TableCell>
                      <Link href={`/poams/${poam.id}`} className="hover:underline font-medium">
                        {poam.title}
                      </Link>
                      {poam.deficiencyDescription && (
                        <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{poam.deficiencyDescription}</p>
                      )}
                    </TableCell>
                    <TableCell><PoamStatusBadge status={poam.status} /></TableCell>
                    <TableCell><PoamRiskBadge level={poam.riskLevel} /></TableCell>
                    <TableCell>
                      {poam.linkedControlId ? (
                        <Link href={`/controls/${poam.linkedControlId}`} className="text-primary hover:underline text-xs font-mono">
                          {poam.linkedControlLabel ?? "—"}
                        </Link>
                      ) : <span className="text-muted-foreground text-xs">—</span>}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">{poam.ownerName ?? "—"}</TableCell>
                    <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                      {formatDate(poam.scheduledCompletionDate)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <AddPoamDialog
        open={showAdd}
        onClose={() => setShowAdd(false)}
        onSaved={() => qc.invalidateQueries({ queryKey: getListPoamsQueryKey() })}
      />
    </div>
  );
}
