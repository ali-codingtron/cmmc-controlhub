import { useState } from "react";
import { useGetPoam, useClosePoam } from "@workspace/api-client-react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Link } from "wouter";
import { ArrowLeft, CheckCircle, Pencil } from "lucide-react";
import { useIsAssessor } from "@/lib/auth";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { useOrg } from "@/context/OrgContext";
import { cn } from "@/lib/utils";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  useListUsers,
  useListControls,
  getGetPoamQueryKey,
} from "@workspace/api-client-react";
import { Search, ChevronDown, Loader2 } from "lucide-react";
import { useRef, useEffect } from "react";

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

function statusBg(status: string) {
  const map: Record<string, string> = {
    open: "bg-red-100 text-red-700 border-red-200",
    in_progress: "bg-yellow-100 text-yellow-700 border-yellow-200",
    waiting_on_vendor: "bg-orange-100 text-orange-700 border-orange-200",
    mitigated: "bg-blue-100 text-blue-700 border-blue-200",
    accepted_risk: "bg-purple-100 text-purple-700 border-purple-200",
    closed: "bg-green-100 text-green-700 border-green-200",
  };
  return map[status] ?? "bg-gray-100 text-gray-700";
}

function riskBg(level: string) {
  const map: Record<string, string> = {
    critical: "bg-red-600 text-white border-red-600",
    high: "bg-red-100 text-red-700 border-red-200",
    medium: "bg-yellow-100 text-yellow-700 border-yellow-200",
    low: "bg-green-100 text-green-700 border-green-200",
  };
  return map[level] ?? "bg-gray-100 text-gray-600";
}

function formatDate(d: string | Date | null | undefined) {
  if (!d) return "N/A";
  return new Date(d).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function ControlCombobox({ value, onChange, controls }: { value: string; onChange: (v: string) => void; controls: any[] }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const selected = controls.find((c) => c.id === value);
  const filtered = controls.filter((c) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (c.controlId ?? "").toLowerCase().includes(q) || (c.title ?? "").toLowerCase().includes(q);
  });

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    }
    if (open) {
      document.addEventListener("mousedown", handleClickOutside);
      setTimeout(() => searchRef.current?.focus(), 50);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex h-9 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring"
      >
        <span className={cn("truncate", !value && "text-muted-foreground")}>
          {selected ? `${selected.controlId} — ${selected.title}` : "No linked control"}
        </span>
        <ChevronDown className="h-4 w-4 shrink-0 opacity-50 ml-2" />
      </button>
      {open && (
        <div className="absolute z-50 mt-1 w-full rounded-md border bg-popover shadow-lg">
          <div className="p-2 border-b">
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
              <input ref={searchRef} value={search} onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by ID or title..."
                className="w-full rounded-sm border border-input bg-background pl-8 pr-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring" />
            </div>
          </div>
          <div className="max-h-56 overflow-y-auto">
            <button type="button" className={cn("w-full text-left px-3 py-2 text-sm hover:bg-accent cursor-pointer", !value && "bg-accent/50 font-medium")}
              onMouseDown={(e) => { e.preventDefault(); onChange(""); setOpen(false); setSearch(""); }}>
              No linked control
            </button>
            {filtered.length === 0
              ? <p className="px-3 py-4 text-sm text-muted-foreground text-center">No controls match</p>
              : filtered.map((c) => (
                <button key={c.id} type="button"
                  className={cn("w-full text-left px-3 py-2 text-sm hover:bg-accent cursor-pointer", value === c.id && "bg-accent/50 font-medium")}
                  onMouseDown={(e) => { e.preventDefault(); onChange(c.id); setOpen(false); setSearch(""); }}>
                  <span className="font-mono text-xs text-primary mr-1">{c.controlId}</span>
                  <span className="text-muted-foreground"> — {(c.title ?? "").slice(0, 60)}</span>
                </button>
              ))}
          </div>
        </div>
      )}
    </div>
  );
}

interface PoamEditForm {
  poamNumber: string; title: string; deficiencyDescription: string;
  linkedControlId: string; riskLevel: string; status: string; ownerId: string;
  scheduledCompletionDate: string; remediationPlan: string; resourcesRequired: string; notes: string;
}

function EditPoamDialog({ open, onClose, onSaved, poam }: { open: boolean; onClose: () => void; onSaved: () => void; poam: any }) {
  const { toast } = useToast();
  const { activeOrg } = useOrg();
  const { data: users = [] } = useListUsers();
  const { data: controlsData } = useListControls();
  const controls = (controlsData as any[]) ?? [];
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState<PoamEditForm>({
    poamNumber: poam.poamNumber ?? "",
    title: poam.title ?? "",
    deficiencyDescription: poam.deficiencyDescription ?? "",
    linkedControlId: poam.linkedControlId ?? "",
    riskLevel: poam.riskLevel ?? "medium",
    status: poam.status ?? "open",
    ownerId: poam.ownerId ?? "",
    scheduledCompletionDate: poam.scheduledCompletionDate ? new Date(poam.scheduledCompletionDate).toISOString().slice(0, 10) : "",
    remediationPlan: poam.remediationPlan ?? "",
    resourcesRequired: poam.resourcesRequired ?? "",
    notes: poam.notes ?? "",
  });

  useEffect(() => {
    if (open) {
      setForm({
        poamNumber: poam.poamNumber ?? "",
        title: poam.title ?? "",
        deficiencyDescription: poam.deficiencyDescription ?? "",
        linkedControlId: poam.linkedControlId ?? "",
        riskLevel: poam.riskLevel ?? "medium",
        status: poam.status ?? "open",
        ownerId: poam.ownerId ?? "",
        scheduledCompletionDate: poam.scheduledCompletionDate ? new Date(poam.scheduledCompletionDate).toISOString().slice(0, 10) : "",
        remediationPlan: poam.remediationPlan ?? "",
        resourcesRequired: poam.resourcesRequired ?? "",
        notes: poam.notes ?? "",
      });
    }
  }, [open, poam.id]);

  const set = (k: keyof PoamEditForm) => (v: string) => setForm((f) => ({ ...f, [k]: v }));

  const handleSave = async () => {
    if (!form.title.trim() || !form.deficiencyDescription.trim()) {
      toast({ title: "Title and description are required", variant: "destructive" }); return;
    }
    setSaving(true);
    try {
      const token = localStorage.getItem("auth_token");
      const headers: Record<string, string> = { "Content-Type": "application/json", Authorization: `Bearer ${token}` };
      if (activeOrg?.id) headers["X-Organization-ID"] = activeOrg.id;
      const res = await fetch(`/api/poams/${poam.id}`, {
        method: "PATCH", headers,
        body: JSON.stringify({
          poamNumber: form.poamNumber || undefined,
          title: form.title, deficiencyDescription: form.deficiencyDescription,
          linkedControlId: form.linkedControlId || null,
          riskLevel: form.riskLevel, status: form.status,
          ownerId: form.ownerId || null,
          scheduledCompletionDate: form.scheduledCompletionDate || null,
          remediationPlan: form.remediationPlan || null,
          resourcesRequired: form.resourcesRequired || null,
          notes: form.notes || null,
        }),
      });
      if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error ?? "Failed to update POA&M"); }
      toast({ title: "POA&M updated" });
      onSaved();
      onClose();
    } catch (err: any) {
      toast({ title: err.message, variant: "destructive" });
    } finally { setSaving(false); }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col">
        <DialogHeader className="shrink-0"><DialogTitle>Edit POA&amp;M Item</DialogTitle></DialogHeader>
        <div className="overflow-y-auto flex-1 min-h-0 py-2 space-y-4 pr-1">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>POA&amp;M Number</Label>
              <Input value={form.poamNumber} onChange={(e) => set("poamNumber")(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Risk Level</Label>
              <Select value={form.riskLevel} onValueChange={set("riskLevel")}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{RISK_LEVELS.map((r) => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Title <span className="text-red-500">*</span></Label>
            <Input value={form.title} onChange={(e) => set("title")(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Deficiency Description / Gap <span className="text-red-500">*</span></Label>
            <Textarea value={form.deficiencyDescription} onChange={(e) => set("deficiencyDescription")(e.target.value)} rows={3} className="min-h-[80px]" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Linked Control</Label>
              <ControlCombobox value={form.linkedControlId} onChange={set("linkedControlId")} controls={controls} />
            </div>
            <div className="space-y-1.5">
              <Label>Status</Label>
              <Select value={form.status} onValueChange={set("status")}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{POAM_STATUSES.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}</SelectContent>
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
                  {users.map((u: any) => <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>)}
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
            <Textarea value={form.remediationPlan} onChange={(e) => set("remediationPlan")(e.target.value)} rows={3} className="min-h-[72px]" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Resources Required</Label>
              <Textarea value={form.resourcesRequired} onChange={(e) => set("resourcesRequired")(e.target.value)} rows={2} className="min-h-[60px]" />
            </div>
            <div className="space-y-1.5">
              <Label>Notes</Label>
              <Textarea value={form.notes} onChange={(e) => set("notes")(e.target.value)} rows={2} className="min-h-[60px]" />
            </div>
          </div>
        </div>
        <DialogFooter className="shrink-0 pt-2 border-t">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Save Changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function PoamDetail({ id }: { id: string }) {
  const qc = useQueryClient();
  const { data: poam, isLoading, refetch } = useGetPoam(id);
  const closeMutation = useClosePoam();
  const isAssessor = useIsAssessor();
  const [showEdit, setShowEdit] = useState(false);
  const { toast } = useToast();

  if (isLoading) return <div className="p-8 text-muted-foreground animate-pulse">Loading…</div>;
  if (!poam) return <div className="p-8 text-muted-foreground">POA&amp;M not found</div>;

  const handleClose = async () => {
    try {
      await closeMutation.mutateAsync({ id, data: { resolutionSummary: "Closed via UI" } });
      toast({ title: "POA&M closed" });
      refetch();
    } catch {
      toast({ title: "Failed to close POA&M", variant: "destructive" });
    }
  };

  const statusLabel = POAM_STATUSES.find((s) => s.value === poam.status)?.label ?? poam.status;
  const riskLabel = RISK_LEVELS.find((r) => r.value === poam.riskLevel)?.label ?? poam.riskLevel;

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-2">
          <Button variant="ghost" size="sm" className="gap-2 -ml-2 text-muted-foreground" asChild>
            <Link href="/poams"><ArrowLeft className="h-4 w-4" /> POA&amp;Ms</Link>
          </Button>
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-2xl font-bold">{poam.poamNumber}: {poam.title}</h1>
            <span className={cn("inline-flex items-center px-2.5 py-0.5 rounded text-xs font-medium border", statusBg(poam.status))}>
              {statusLabel}
            </span>
            <span className={cn("inline-flex items-center px-2.5 py-0.5 rounded text-xs font-semibold border", riskBg(poam.riskLevel))}>
              {riskLabel} Risk
            </span>
          </div>
        </div>
        {!isAssessor && (
          <div className="flex gap-2 shrink-0">
            <Button variant="outline" onClick={() => setShowEdit(true)}>
              <Pencil className="h-4 w-4 mr-2" /> Edit
            </Button>
            {poam.status !== "closed" && (
              <Button className="bg-green-600 hover:bg-green-700 text-white" onClick={handleClose} disabled={closeMutation.isPending}>
                {closeMutation.isPending
                  ? <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  : <CheckCircle className="h-4 w-4 mr-2" />}
                Close POA&amp;M
              </Button>
            )}
          </div>
        )}
      </div>

      {/* Details card */}
      <Card>
        <CardHeader><CardTitle>Details</CardTitle></CardHeader>
        <CardContent className="space-y-6">
          <div>
            <h3 className="font-semibold mb-1">Deficiency Description</h3>
            <p className="text-muted-foreground whitespace-pre-wrap">{poam.deficiencyDescription || "—"}</p>
          </div>
          <div>
            <h3 className="font-semibold mb-1">Remediation Plan</h3>
            <p className="text-muted-foreground whitespace-pre-wrap">{poam.remediationPlan || "No plan provided."}</p>
          </div>
          <div>
            <h3 className="font-semibold mb-1">Resources Required</h3>
            <p className="text-muted-foreground">{poam.resourcesRequired || "None specified."}</p>
          </div>
          {poam.notes && (
            <div>
              <h3 className="font-semibold mb-1">Notes</h3>
              <p className="text-muted-foreground whitespace-pre-wrap">{poam.notes}</p>
            </div>
          )}
          {poam.resolutionSummary && (
            <div>
              <h3 className="font-semibold mb-1">Resolution Summary</h3>
              <p className="text-muted-foreground whitespace-pre-wrap">{poam.resolutionSummary}</p>
            </div>
          )}

          <div className="grid grid-cols-2 gap-4 pt-4 border-t">
            <div>
              <span className="font-semibold block text-sm mb-0.5">Owner</span>
              <span className="text-muted-foreground">{poam.ownerName ?? "Unassigned"}</span>
            </div>
            <div>
              <span className="font-semibold block text-sm mb-0.5">Linked Control</span>
              {poam.linkedControlId ? (
                <Link href={`/controls/${poam.linkedControlId}`} className="text-primary hover:underline font-mono text-sm">
                  {poam.linkedControlLabel ?? poam.linkedControlId}
                </Link>
              ) : (
                <span className="text-muted-foreground">None</span>
              )}
            </div>
            <div>
              <span className="font-semibold block text-sm mb-0.5">Scheduled Completion</span>
              <span className="text-muted-foreground">{formatDate(poam.scheduledCompletionDate)}</span>
            </div>
            <div>
              <span className="font-semibold block text-sm mb-0.5">Completed Date</span>
              <span className="text-muted-foreground">{formatDate(poam.completedDate)}</span>
            </div>
            <div>
              <span className="font-semibold block text-sm mb-0.5">Created</span>
              <span className="text-muted-foreground">{formatDate(poam.createdAt)}</span>
            </div>
            <div>
              <span className="font-semibold block text-sm mb-0.5">Last Updated</span>
              <span className="text-muted-foreground">{formatDate(poam.updatedAt)}</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Edit dialog */}
      {showEdit && (
        <EditPoamDialog
          open={showEdit}
          onClose={() => setShowEdit(false)}
          onSaved={() => {
            refetch();
            qc.invalidateQueries({ queryKey: getGetPoamQueryKey(id) });
          }}
          poam={poam}
        />
      )}
    </div>
  );
}
