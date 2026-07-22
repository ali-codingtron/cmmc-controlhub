import { useState, useMemo, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useOrg } from "@/context/OrgContext";
import { useIsAssessor } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  X,
  Activity,
  CheckCircle2,
  Clock,
  AlertTriangle,
  RefreshCw,
  ChevronRight,
  ChevronDown,
  BookOpen,
  FlaskConical,
  FileText,
  ShieldCheck,
  ShieldX,
  TriangleAlert,
  Link2,
  Plus,
  Trash2,
} from "lucide-react";
import { cn } from "@/lib/utils";

type MonitoringFrequency = "daily" | "weekly" | "monthly" | "quarterly" | "annually";
type MonitoringStatus = "open" | "in_progress" | "current" | "failed_validation" | "escalated";
type ValidationStatus = "pass" | "fail" | "pass_with_exception";

interface MonitoringItem {
  id: string;
  organizationId: string | null;
  frequency: MonitoringFrequency;
  task: string;
  controlRef: string;
  description: string;
  lastCompleted: string | null;
  nextDue: string | null;
  status: MonitoringStatus;
  notes: string | null;
  sortOrder: number;
  operatingProcedure: string | null;
  testProcedure: string | null;
  evidenceToRetain: string | null;
  validationStatus: ValidationStatus | null;
  validationDate: string | null;
  reviewerNotes: string | null;
  escalationNotes: string | null;
  linkedPoamId: string | null;
  reviewedBy: string | null;
  reviewDate: string | null;
}

interface Poam {
  id: string;
  weakness: string;
  status: string;
}

const FREQUENCY_DAYS: Record<MonitoringFrequency, number> = {
  daily: 1,
  weekly: 7,
  monthly: 30,
  quarterly: 90,
  annually: 365,
};

const FREQUENCY_LABEL: Record<MonitoringFrequency, string> = {
  daily: "Daily",
  weekly: "Weekly",
  monthly: "Monthly",
  quarterly: "Quarterly",
  annually: "Annually",
};

const FREQUENCY_COLOR: Record<MonitoringFrequency, string> = {
  daily: "bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-400",
  weekly: "bg-orange-100 text-orange-700 dark:bg-orange-950/40 dark:text-orange-400",
  monthly: "bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-400",
  quarterly: "bg-purple-100 text-purple-700 dark:bg-purple-950/40 dark:text-purple-400",
  annually: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
};

const STATUS_LABEL: Record<MonitoringStatus, string> = {
  open: "Open",
  in_progress: "In Progress",
  current: "Current",
  failed_validation: "Failed Validation",
  escalated: "Escalated",
};

function todayStr(): string {
  return new Date().toISOString().split("T")[0];
}

function calcNextDueFrom(frequency: MonitoringFrequency, baseDateStr: string): string {
  const days = FREQUENCY_DAYS[frequency];
  const [y, m, d] = baseDateStr.split("-").map(Number);
  const base = new Date(y, (m as number) - 1, d as number);
  base.setDate(base.getDate() + days);
  const yy = base.getFullYear();
  const mm = String(base.getMonth() + 1).padStart(2, "0");
  const dd = String(base.getDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

function toDateInputValue(ts: string | null): string {
  if (!ts) return "";
  const s = ts.includes("T") ? ts.split("T")[0] : ts;
  return s ?? "";
}

function isOverdue(item: MonitoringItem): boolean {
  if (!item.nextDue) return false;
  return toDateInputValue(item.nextDue) < todayStr();
}

function isDueSoon(item: MonitoringItem): boolean {
  if (!item.nextDue) return false;
  const due = toDateInputValue(item.nextDue);
  const today = todayStr();
  const sevenDays = calcNextDueFrom("weekly", today);
  return due >= today && due <= sevenDays;
}

function makeHeaders(orgId: string) {
  const token = localStorage.getItem("auth_token");
  return {
    Authorization: `Bearer ${token}`,
    "X-Organization-ID": orgId,
    "Content-Type": "application/json",
  };
}

/** Renders a multi-line text block (numbered or bulleted) */
function ProcedureText({ text }: { text: string }) {
  const lines = text.split("\n").filter((l) => l.trim());
  return (
    <div className="space-y-1.5 text-sm text-foreground leading-relaxed">
      {lines.map((line, i) => (
        <div key={i} className={cn("flex gap-2", line.trim().startsWith("•") ? "items-start" : "")}>
          <span className={cn("shrink-0", line.trim().startsWith("•") ? "text-primary mt-0.5" : "")}>
            {line.trim().startsWith("•") ? "" : ""}
          </span>
          <span>{line}</span>
        </div>
      ))}
    </div>
  );
}

/** Expandable workbook panel shown below a monitoring row */
function WorkbookPanel({
  item,
  orgId,
  poams,
  isAssessor,
  onUpdate,
}: {
  item: MonitoringItem;
  orgId: string;
  poams: Poam[];
  isAssessor: boolean;
  onUpdate: (patch: Partial<MonitoringItem>) => void;
}) {
  const [reviewerNotes, setReviewerNotes] = useState(item.reviewerNotes ?? "");
  const [escalationNotes, setEscalationNotes] = useState(item.escalationNotes ?? "");

  // Sync local state when item changes
  useEffect(() => { setReviewerNotes(item.reviewerNotes ?? ""); }, [item.reviewerNotes]);
  useEffect(() => { setEscalationNotes(item.escalationNotes ?? ""); }, [item.escalationNotes]);

  const valStatusColor: Record<ValidationStatus, string> = {
    pass: "bg-green-100 text-green-700 border-green-300 dark:bg-green-950/30 dark:text-green-400",
    fail: "bg-red-100 text-red-700 border-red-300 dark:bg-red-950/30 dark:text-red-400",
    pass_with_exception: "bg-yellow-100 text-yellow-700 border-yellow-300 dark:bg-yellow-950/30 dark:text-yellow-400",
  };

  const valStatusIcon: Record<ValidationStatus, React.ReactNode> = {
    pass: <ShieldCheck className="h-3.5 w-3.5" />,
    fail: <ShieldX className="h-3.5 w-3.5" />,
    pass_with_exception: <TriangleAlert className="h-3.5 w-3.5" />,
  };

  const hasGuidance = item.operatingProcedure || item.testProcedure || item.evidenceToRetain;

  return (
    <div className="bg-muted/30 border-t border-border px-4 py-4 space-y-0">
      <Tabs defaultValue="procedure">
        <TabsList className="mb-4 h-8">
          <TabsTrigger value="procedure" className="text-xs gap-1.5 h-7">
            <BookOpen className="h-3.5 w-3.5" />
            Operating Procedure
          </TabsTrigger>
          <TabsTrigger value="test" className="text-xs gap-1.5 h-7">
            <FlaskConical className="h-3.5 w-3.5" />
            Test Procedure
          </TabsTrigger>
          <TabsTrigger value="evidence" className="text-xs gap-1.5 h-7">
            <FileText className="h-3.5 w-3.5" />
            Evidence to Retain
          </TabsTrigger>
          <TabsTrigger value="validation" className="text-xs gap-1.5 h-7">
            <ShieldCheck className="h-3.5 w-3.5" />
            Validation & Review
          </TabsTrigger>
        </TabsList>

        {/* Operating Procedure */}
        <TabsContent value="procedure" className="mt-0">
          {hasGuidance && item.operatingProcedure ? (
            <div className="rounded-lg border bg-background p-4">
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                Step-by-Step Operating Procedure
              </h3>
              <ProcedureText text={item.operatingProcedure} />
            </div>
          ) : (
            <div className="rounded-lg border bg-muted/40 p-6 text-center text-muted-foreground text-sm">
              No operating procedure defined for this task.
            </div>
          )}
        </TabsContent>

        {/* Test Procedure */}
        <TabsContent value="test" className="mt-0">
          {hasGuidance && item.testProcedure ? (
            <div className="rounded-lg border bg-background p-4">
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                Validation / Test Procedure
              </h3>
              <ProcedureText text={item.testProcedure} />
            </div>
          ) : (
            <div className="rounded-lg border bg-muted/40 p-6 text-center text-muted-foreground text-sm">
              No test procedure defined for this task.
            </div>
          )}
        </TabsContent>

        {/* Evidence to Retain */}
        <TabsContent value="evidence" className="mt-0">
          {hasGuidance && item.evidenceToRetain ? (
            <div className="rounded-lg border bg-background p-4">
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                Required Evidence to Retain
              </h3>
              <ProcedureText text={item.evidenceToRetain} />
            </div>
          ) : (
            <div className="rounded-lg border bg-muted/40 p-6 text-center text-muted-foreground text-sm">
              No evidence requirements defined for this task.
            </div>
          )}
        </TabsContent>

        {/* Validation & Review */}
        <TabsContent value="validation" className="mt-0">
          <div className="rounded-lg border bg-background p-4 space-y-5">
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Validation & Review Record
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {/* Validation Result */}
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">Validation Result</label>
                {isAssessor ? (
                  <div className={cn(
                    "inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border text-xs font-medium",
                    item.validationStatus ? valStatusColor[item.validationStatus] : "text-muted-foreground"
                  )}>
                    {item.validationStatus && valStatusIcon[item.validationStatus]}
                    {item.validationStatus
                      ? item.validationStatus === "pass_with_exception" ? "Pass with Exception"
                        : item.validationStatus === "pass" ? "Pass" : "Fail"
                      : "Not recorded"}
                  </div>
                ) : (
                  <Select
                    value={item.validationStatus ?? "none"}
                    onValueChange={(v) =>
                      onUpdate({ validationStatus: v === "none" ? null : (v as ValidationStatus) })
                    }
                  >
                    <SelectTrigger className={cn(
                      "h-8 text-xs",
                      item.validationStatus && valStatusColor[item.validationStatus]
                    )}>
                      <SelectValue placeholder="Select result..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">— Not recorded —</SelectItem>
                      <SelectItem value="pass">
                        <span className="flex items-center gap-1.5 text-green-700">
                          <ShieldCheck className="h-3.5 w-3.5" /> Pass
                        </span>
                      </SelectItem>
                      <SelectItem value="fail">
                        <span className="flex items-center gap-1.5 text-red-700">
                          <ShieldX className="h-3.5 w-3.5" /> Fail
                        </span>
                      </SelectItem>
                      <SelectItem value="pass_with_exception">
                        <span className="flex items-center gap-1.5 text-yellow-700">
                          <TriangleAlert className="h-3.5 w-3.5" /> Pass with Exception
                        </span>
                      </SelectItem>
                    </SelectContent>
                  </Select>
                )}
              </div>

              {/* Validation Date */}
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">Validation Date</label>
                <input
                  type="date"
                  className="w-full text-xs border border-input rounded-md px-2 py-1.5 bg-background focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-60 disabled:cursor-not-allowed"
                  value={toDateInputValue(item.validationDate)}
                  disabled={isAssessor}
                  onChange={(e) => onUpdate({ validationDate: e.target.value || null })}
                />
              </div>

              {/* Linked POA&M */}
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                  <Link2 className="h-3 w-3" /> Linked POA&M
                </label>
                {isAssessor ? (
                  <p className="text-xs text-muted-foreground">
                    {item.linkedPoamId
                      ? poams.find((p) => p.id === item.linkedPoamId)?.weakness ?? item.linkedPoamId
                      : "None"}
                  </p>
                ) : (
                  <Select
                    value={item.linkedPoamId ?? "none"}
                    onValueChange={(v) => onUpdate({ linkedPoamId: v === "none" ? null : v })}
                  >
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue placeholder="Link a POA&M..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">— None —</SelectItem>
                      {poams.map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          <span className="truncate max-w-[200px] block">
                            {p.weakness.length > 50 ? p.weakness.slice(0, 50) + "…" : p.weakness}
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
            </div>

            {/* Reviewer Notes */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Reviewer Notes</label>
              <Textarea
                className="text-xs min-h-[3rem] resize-none disabled:opacity-60"
                rows={3}
                placeholder="Document review observations, findings, and actions taken..."
                value={reviewerNotes}
                disabled={isAssessor}
                onChange={(e) => setReviewerNotes(e.target.value)}
                onBlur={() => !isAssessor && onUpdate({ reviewerNotes })}
              />
            </div>

            {/* Escalation Notes — shown when status is failed_validation or escalated, or when there's existing content */}
            {(item.status === "failed_validation" || item.status === "escalated" || item.escalationNotes) && (
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-red-600 dark:text-red-400 flex items-center gap-1">
                  <AlertTriangle className="h-3 w-3" />
                  Escalation Notes
                  {item.validationStatus === "fail" && (
                    <span className="text-muted-foreground font-normal ml-1">(required when validation fails)</span>
                  )}
                </label>
                <Textarea
                  className="text-xs min-h-[3rem] resize-none border-red-300 focus-visible:ring-red-400 disabled:opacity-60"
                  rows={3}
                  placeholder="Document escalation reason, actions required, and responsible parties..."
                  value={escalationNotes}
                  disabled={isAssessor}
                  onChange={(e) => setEscalationNotes(e.target.value)}
                  onBlur={() => !isAssessor && onUpdate({ escalationNotes })}
                />
              </div>
            )}

            {/* Fail-requires-POAM warning */}
            {item.validationStatus === "fail" && !item.linkedPoamId && !isAssessor && (
              <div className="flex items-start gap-2 p-3 rounded-lg bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800 text-xs text-red-700 dark:text-red-400">
                <ShieldX className="h-4 w-4 shrink-0 mt-0.5" />
                <span>
                  <strong>Action required:</strong> A failed validation should have a linked POA&M. Link an existing POA&M above or create a new one from the POA&M module.
                </span>
              </div>
            )}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

export default function MonitoringTracker() {
  const { activeOrg } = useOrg();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const isAssessor = useIsAssessor();

  const [search, setSearch] = useState("");
  const [freqFilter, setFreqFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [controlRefFilter, setControlRefFilter] = useState("all");
  const [pendingNotes, setPendingNotes] = useState<Record<string, string>>({});
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  // Bulk selection state
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkFreq, setBulkFreq] = useState<MonitoringFrequency | "">("");

  // Add / delete item state
  const [showAddItem, setShowAddItem] = useState(false);
  const [addForm, setAddForm] = useState({ task: "", frequency: "monthly" as MonitoringFrequency, controlRef: "", description: "" });
  const [deleteItemId, setDeleteItemId] = useState<string | null>(null);

  const { data: items = [], isLoading } = useQuery<MonitoringItem[]>({
    queryKey: ["monitoring", activeOrg?.id],
    queryFn: async () => {
      if (!activeOrg?.id) return [];
      const r = await fetch("/api/monitoring", {
        headers: makeHeaders(activeOrg.id),
      });
      if (!r.ok) throw new Error("Failed to load monitoring items");
      return r.json();
    },
    enabled: !!activeOrg?.id,
  });

  // Fetch POA&Ms for linking
  const { data: poams = [] } = useQuery<Poam[]>({
    queryKey: ["poams-for-monitoring", activeOrg?.id],
    queryFn: async () => {
      if (!activeOrg?.id) return [];
      const r = await fetch("/api/poams?status=open&status=in_progress", {
        headers: makeHeaders(activeOrg.id),
      });
      if (!r.ok) return [];
      return r.json();
    },
    enabled: !!activeOrg?.id,
  });

  // Backfill guidance for existing orgs (runs once when items load without guidance)
  useEffect(() => {
    if (!activeOrg?.id || items.length === 0) return;
    const needsBackfill = items.some((i) => !i.operatingProcedure);
    if (!needsBackfill) return;
    fetch("/api/monitoring/backfill-guidance", {
      method: "POST",
      headers: makeHeaders(activeOrg.id),
    }).then((r) => {
      if (r.ok) queryClient.invalidateQueries({ queryKey: ["monitoring", activeOrg.id] });
    });
  }, [activeOrg?.id, items.length]);

  const createMutation = useMutation({
    mutationFn: async (data: { task: string; frequency: MonitoringFrequency; controlRef: string; description: string }) => {
      if (!activeOrg?.id) throw new Error("No org");
      const r = await fetch("/api/monitoring", {
        method: "POST",
        headers: { ...makeHeaders(activeOrg.id), "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!r.ok) { const d = await r.json(); throw new Error(d.error ?? "Failed to create"); }
      return r.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["monitoring", activeOrg?.id] });
      setShowAddItem(false);
      setAddForm({ task: "", frequency: "monthly", controlRef: "", description: "" });
      toast({ title: "Monitoring item added" });
    },
    onError: (e: Error) => toast({ title: "Failed to add item", description: e.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      if (!activeOrg?.id) throw new Error("No org");
      const r = await fetch(`/api/monitoring/${id}`, {
        method: "DELETE",
        headers: makeHeaders(activeOrg.id),
      });
      if (!r.ok) { const d = await r.json(); throw new Error(d.error ?? "Failed to delete"); }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["monitoring", activeOrg?.id] });
      setDeleteItemId(null);
      toast({ title: "Item deleted" });
    },
    onError: (e: Error) => toast({ title: "Delete failed", description: e.message, variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: async ({
      id,
      ...data
    }: { id: string } & Partial<MonitoringItem>) => {
      if (!activeOrg?.id) throw new Error("No org selected");
      const r = await fetch(`/api/monitoring/${id}`, {
        method: "PATCH",
        headers: makeHeaders(activeOrg.id),
        body: JSON.stringify(data),
      });
      if (!r.ok) throw new Error("Failed to update");
      return r.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["monitoring", activeOrg?.id] });
    },
    onError: () => {
      toast({ title: "Update failed", description: "Could not save changes", variant: "destructive" });
    },
  });

  const uniqueControlRefs = useMemo(
    () => [...new Set(items.map((i) => i.controlRef))].sort(),
    [items]
  );

  const filtered = useMemo(() => {
    return items.filter((item) => {
      if (freqFilter !== "all" && item.frequency !== freqFilter) return false;
      if (statusFilter !== "all") {
        if (statusFilter === "overdue") {
          if (!isOverdue(item)) return false;
        } else {
          if (item.status !== statusFilter) return false;
        }
      }
      if (controlRefFilter !== "all" && item.controlRef !== controlRefFilter) return false;
      if (search) {
        const q = search.toLowerCase();
        if (!item.task.toLowerCase().includes(q) && !item.description.toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }, [items, freqFilter, statusFilter, controlRefFilter, search]);

  const hasFilters = search || freqFilter !== "all" || statusFilter !== "all" || controlRefFilter !== "all";

  const overdueCount = items.filter(isOverdue).length;
  const dueSoonCount = items.filter((i) => !isOverdue(i) && isDueSoon(i)).length;
  const currentCount = items.filter((i) => i.status === "current" && !isOverdue(i)).length;
  const failedCount = items.filter((i) => i.status === "failed_validation").length;

  // Checkbox helpers
  const filteredIds = filtered.map((i) => i.id);
  const allSelected = filteredIds.length > 0 && filteredIds.every((id) => selectedIds.has(id));
  const someSelected = filteredIds.some((id) => selectedIds.has(id));

  function toggleExpand(id: string) {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    if (allSelected) {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        filteredIds.forEach((id) => next.delete(id));
        return next;
      });
    } else {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        filteredIds.forEach((id) => next.add(id));
        return next;
      });
    }
  }

  function toggleSelectOne(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function handleFrequencyChange(item: MonitoringItem, newFreq: MonitoringFrequency) {
    const baseDate = item.lastCompleted
      ? toDateInputValue(item.lastCompleted)
      : todayStr();
    const nextDue = calcNextDueFrom(newFreq, baseDate);
    updateMutation.mutate(
      { id: item.id, frequency: newFreq, nextDue },
      {
        onSuccess: () => {
          toast({ title: "Frequency updated", description: "Next due recalculated" });
        },
      }
    );
  }

  async function handleBulkFrequencyChange() {
    if (!bulkFreq || selectedIds.size === 0 || !activeOrg?.id) return;
    const targets = items.filter((i) => selectedIds.has(i.id));
    let successCount = 0;
    await Promise.all(
      targets.map(async (item) => {
        const baseDate = item.lastCompleted
          ? toDateInputValue(item.lastCompleted)
          : todayStr();
        const nextDue = calcNextDueFrom(bulkFreq as MonitoringFrequency, baseDate);
        const r = await fetch(`/api/monitoring/${item.id}`, {
          method: "PATCH",
          headers: makeHeaders(activeOrg.id),
          body: JSON.stringify({ frequency: bulkFreq, nextDue }),
        });
        if (r.ok) successCount++;
      })
    );
    queryClient.invalidateQueries({ queryKey: ["monitoring", activeOrg?.id] });
    setSelectedIds(new Set());
    setBulkFreq("");
    toast({
      title: `${successCount} item${successCount !== 1 ? "s" : ""} updated`,
      description: "Frequency updated and next due recalculated",
    });
  }

  function handleStatusChange(item: MonitoringItem, newStatus: MonitoringStatus) {
    const today = todayStr();
    const patch: Partial<MonitoringItem> & { id: string } = { id: item.id, status: newStatus };

    if (newStatus === "current") {
      const baseDate = item.lastCompleted
        ? toDateInputValue(item.lastCompleted)
        : today;
      if (!item.lastCompleted) patch.lastCompleted = today;
      patch.nextDue = calcNextDueFrom(item.frequency, baseDate);
    }

    updateMutation.mutate(patch);
  }

  function handleLastCompletedChange(item: MonitoringItem, value: string) {
    if (value) {
      const nextDue = calcNextDueFrom(item.frequency, value);
      updateMutation.mutate({ id: item.id, lastCompleted: value, nextDue });
    } else {
      updateMutation.mutate({ id: item.id, lastCompleted: null });
    }
  }

  function handleNextDueChange(id: string, value: string) {
    updateMutation.mutate({ id, nextDue: value || null });
  }

  function handleNotesSave(id: string) {
    const notes = pendingNotes[id];
    if (notes === undefined) return;
    updateMutation.mutate({ id, notes });
    setPendingNotes((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
  }

  const selectedCount = filteredIds.filter((id) => selectedIds.has(id)).length;

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold">Monitoring Tracker</h1>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Activity className="h-4 w-4" />
            <span>CMMC L2 Operational Monitoring</span>
          </div>
          {!isAssessor && (
            <Button size="sm" onClick={() => setShowAddItem(true)}>
              <Plus className="h-4 w-4 mr-1.5" />
              Add Item
            </Button>
          )}
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-4 pb-4 flex items-center gap-3">
            <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-red-100 dark:bg-red-950/30 shrink-0">
              <AlertTriangle className="h-5 w-5 text-red-600 dark:text-red-400" />
            </div>
            <div>
              <p className="text-2xl font-bold text-red-700 dark:text-red-400">{overdueCount}</p>
              <p className="text-xs text-muted-foreground">Overdue</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4 flex items-center gap-3">
            <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-yellow-100 dark:bg-yellow-950/30 shrink-0">
              <Clock className="h-5 w-5 text-yellow-600 dark:text-yellow-400" />
            </div>
            <div>
              <p className="text-2xl font-bold text-yellow-700 dark:text-yellow-400">{dueSoonCount}</p>
              <p className="text-xs text-muted-foreground">Due Within 7 Days</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4 flex items-center gap-3">
            <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-green-100 dark:bg-green-950/30 shrink-0">
              <CheckCircle2 className="h-5 w-5 text-green-600 dark:text-green-400" />
            </div>
            <div>
              <p className="text-2xl font-bold text-green-700 dark:text-green-400">{currentCount}</p>
              <p className="text-xs text-muted-foreground">Current</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4 flex items-center gap-3">
            <div className={cn(
              "flex items-center justify-center w-9 h-9 rounded-lg shrink-0",
              failedCount > 0 ? "bg-orange-100 dark:bg-orange-950/30" : "bg-muted"
            )}>
              <ShieldX className={cn(
                "h-5 w-5",
                failedCount > 0 ? "text-orange-600 dark:text-orange-400" : "text-muted-foreground"
              )} />
            </div>
            <div>
              <p className={cn(
                "text-2xl font-bold",
                failedCount > 0 ? "text-orange-700 dark:text-orange-400" : "text-muted-foreground"
              )}>{failedCount}</p>
              <p className="text-xs text-muted-foreground">Failed Validation</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="pt-4 pb-0">
          {/* Filters row */}
          <div className="flex flex-wrap gap-3 items-center">
            <Input
              placeholder="Search tasks or descriptions..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-56 shrink-0"
            />

            <Select value={freqFilter} onValueChange={setFreqFilter}>
              <SelectTrigger className="w-36">
                <SelectValue placeholder="All Frequencies" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Frequencies</SelectItem>
                <SelectItem value="daily">Daily</SelectItem>
                <SelectItem value="weekly">Weekly</SelectItem>
                <SelectItem value="monthly">Monthly</SelectItem>
                <SelectItem value="quarterly">Quarterly</SelectItem>
                <SelectItem value="annually">Annually</SelectItem>
              </SelectContent>
            </Select>

            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-40">
                <SelectValue placeholder="All Statuses" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                <SelectItem value="overdue">Overdue</SelectItem>
                <SelectItem value="open">Open</SelectItem>
                <SelectItem value="in_progress">In Progress</SelectItem>
                <SelectItem value="current">Current</SelectItem>
                <SelectItem value="failed_validation">Failed Validation</SelectItem>
                <SelectItem value="escalated">Escalated</SelectItem>
              </SelectContent>
            </Select>

            <Select value={controlRefFilter} onValueChange={setControlRefFilter}>
              <SelectTrigger className="w-40">
                <SelectValue placeholder="All Controls" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Controls</SelectItem>
                {uniqueControlRefs.map((ref) => (
                  <SelectItem key={ref} value={ref}>{ref}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            {hasFilters && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => { setSearch(""); setFreqFilter("all"); setStatusFilter("all"); setControlRefFilter("all"); }}
                className="gap-1.5 text-muted-foreground"
              >
                <X className="h-3.5 w-3.5" />
                Clear filters
              </Button>
            )}

            <span className="ml-auto text-xs text-muted-foreground shrink-0">
              {isLoading ? "Loading..." : `${filtered.length} item${filtered.length !== 1 ? "s" : ""}`}
            </span>
          </div>

          {/* Bulk action toolbar */}
          {!isAssessor && someSelected && selectedCount > 0 && (
            <div className="mt-3 flex items-center gap-3 p-3 bg-muted/60 rounded-lg border border-border">
              <RefreshCw className="h-4 w-4 text-muted-foreground shrink-0" />
              <span className="text-sm font-medium text-foreground">
                {selectedCount} item{selectedCount !== 1 ? "s" : ""} selected
              </span>
              <span className="text-sm text-muted-foreground">— Change frequency to:</span>
              <Select value={bulkFreq} onValueChange={(v) => setBulkFreq(v as MonitoringFrequency)}>
                <SelectTrigger className="w-36 h-8 text-sm">
                  <SelectValue placeholder="Select..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="daily">Daily</SelectItem>
                  <SelectItem value="weekly">Weekly</SelectItem>
                  <SelectItem value="monthly">Monthly</SelectItem>
                  <SelectItem value="quarterly">Quarterly</SelectItem>
                  <SelectItem value="annually">Annually</SelectItem>
                </SelectContent>
              </Select>
              <Button size="sm" disabled={!bulkFreq} onClick={handleBulkFrequencyChange}>
                Apply
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => { setSelectedIds(new Set()); setBulkFreq(""); }}
                className="text-muted-foreground"
              >
                <X className="h-3.5 w-3.5" />
              </Button>
            </div>
          )}
        </CardContent>

        <CardContent className="pt-4 overflow-x-auto p-0">
          {isLoading ? (
            <div className="space-y-2 p-4">
              {[...Array(6)].map((_, i) => (
                <div key={i} className="h-12 animate-pulse bg-muted rounded" />
              ))}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-8 pl-4">
                    <Checkbox
                      checked={allSelected}
                      onCheckedChange={toggleSelectAll}
                      aria-label="Select all"
                      className={someSelected && !allSelected ? "opacity-50" : ""}
                    />
                  </TableHead>
                  <TableHead className="w-8" />
                  <TableHead className="w-32">Frequency</TableHead>
                  <TableHead className="w-52">Task</TableHead>
                  <TableHead className="w-24">Control ID</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead className="w-36">Last Completed</TableHead>
                  <TableHead className="w-36">Next Due</TableHead>
                  <TableHead className="w-40">Status</TableHead>
                  <TableHead className="w-48">Notes</TableHead>
                  {!isAssessor && <TableHead className="w-10 pr-4" />}
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={isAssessor ? 10 : 11} className="text-center text-muted-foreground py-10">
                      No monitoring items match the current filters.
                    </TableCell>
                  </TableRow>
                ) : (
                  filtered.map((item) => {
                    const overdue = isOverdue(item);
                    const dueSoon = !overdue && isDueSoon(item);
                    const isSelected = selectedIds.has(item.id);
                    const isExpanded = expandedIds.has(item.id);
                    const hasFailed = item.status === "failed_validation";
                    const isEscalated = item.status === "escalated";

                    return (
                      <>
                        <TableRow
                          key={item.id}
                          className={cn(
                            overdue && "bg-red-50/60 dark:bg-red-950/15",
                            !overdue && dueSoon && "bg-yellow-50/50 dark:bg-yellow-950/10",
                            hasFailed && "bg-orange-50/60 dark:bg-orange-950/15",
                            isEscalated && "bg-purple-50/60 dark:bg-purple-950/15",
                            isSelected && "bg-primary/5 dark:bg-primary/10",
                            isExpanded && "border-b-0"
                          )}
                        >
                          {/* Checkbox */}
                          <TableCell className="pl-4">
                            <Checkbox
                              checked={isSelected}
                              onCheckedChange={() => toggleSelectOne(item.id)}
                              aria-label={`Select ${item.task}`}
                            />
                          </TableCell>

                          {/* Expand toggle */}
                          <TableCell>
                            <button
                              onClick={() => toggleExpand(item.id)}
                              className="flex items-center justify-center w-6 h-6 rounded hover:bg-muted transition-colors"
                              title={isExpanded ? "Collapse workbook" : "Open workbook"}
                            >
                              {isExpanded
                                ? <ChevronDown className="h-4 w-4 text-muted-foreground" />
                                : <ChevronRight className="h-4 w-4 text-muted-foreground" />
                              }
                            </button>
                          </TableCell>

                          {/* Frequency */}
                          <TableCell>
                            <Select
                              value={item.frequency}
                              onValueChange={(v) => handleFrequencyChange(item, v as MonitoringFrequency)}
                              disabled={isAssessor}
                            >
                              <SelectTrigger className="h-7 w-28 border-0 shadow-none p-0 focus:ring-0 bg-transparent hover:bg-muted/60 rounded px-1.5">
                                <Badge className={cn("text-[11px] font-medium cursor-pointer", FREQUENCY_COLOR[item.frequency])}>
                                  {FREQUENCY_LABEL[item.frequency]}
                                </Badge>
                              </SelectTrigger>
                              <SelectContent>
                                {(["daily", "weekly", "monthly", "quarterly", "annually"] as MonitoringFrequency[]).map((f) => (
                                  <SelectItem key={f} value={f}>
                                    <span className={cn("inline-block px-1.5 py-0.5 rounded text-[11px] font-medium", FREQUENCY_COLOR[f])}>
                                      {FREQUENCY_LABEL[f]}
                                    </span>
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </TableCell>

                          {/* Task */}
                          <TableCell className="font-medium text-sm">
                            <div className="flex flex-col gap-0.5">
                              <span>{item.task}</span>
                              <div className="flex items-center gap-1 flex-wrap">
                                {overdue && (
                                  <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold text-red-600 bg-red-100 px-1.5 py-0.5 rounded-full leading-none">
                                    <AlertTriangle className="h-2.5 w-2.5" />
                                    Overdue
                                  </span>
                                )}
                                {hasFailed && (
                                  <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold text-orange-700 bg-orange-100 px-1.5 py-0.5 rounded-full leading-none">
                                    <ShieldX className="h-2.5 w-2.5" />
                                    Failed
                                  </span>
                                )}
                                {isEscalated && (
                                  <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold text-purple-700 bg-purple-100 px-1.5 py-0.5 rounded-full leading-none">
                                    <TriangleAlert className="h-2.5 w-2.5" />
                                    Escalated
                                  </span>
                                )}
                                {item.validationStatus && (
                                  <span className={cn(
                                    "inline-flex items-center gap-0.5 text-[10px] font-semibold px-1.5 py-0.5 rounded-full leading-none",
                                    item.validationStatus === "pass" && "text-green-700 bg-green-100",
                                    item.validationStatus === "fail" && "text-red-700 bg-red-100",
                                    item.validationStatus === "pass_with_exception" && "text-yellow-700 bg-yellow-100",
                                  )}>
                                    {item.validationStatus === "pass" && <><ShieldCheck className="h-2.5 w-2.5" />Pass</>}
                                    {item.validationStatus === "fail" && <><ShieldX className="h-2.5 w-2.5" />Fail</>}
                                    {item.validationStatus === "pass_with_exception" && <><TriangleAlert className="h-2.5 w-2.5" />Exception</>}
                                  </span>
                                )}
                              </div>
                            </div>
                          </TableCell>

                          {/* Control ID */}
                          <TableCell>
                            <code className="text-xs bg-muted px-1.5 py-0.5 rounded font-mono">
                              {item.controlRef}
                            </code>
                          </TableCell>

                          {/* Description */}
                          <TableCell className="text-sm text-muted-foreground">{item.description}</TableCell>

                          {/* Last Completed */}
                          <TableCell>
                            <input
                              type="date"
                              className="w-full text-sm border border-input rounded-md px-2 py-1 bg-background focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-60 disabled:cursor-not-allowed"
                              value={toDateInputValue(item.lastCompleted)}
                              onChange={(e) => handleLastCompletedChange(item, e.target.value)}
                              disabled={isAssessor}
                            />
                          </TableCell>

                          {/* Next Due */}
                          <TableCell>
                            <input
                              type="date"
                              className={cn(
                                "w-full text-sm border border-input rounded-md px-2 py-1 bg-background focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-60 disabled:cursor-not-allowed",
                                overdue && "border-red-400 text-red-700 dark:text-red-400"
                              )}
                              value={toDateInputValue(item.nextDue)}
                              onChange={(e) => handleNextDueChange(item.id, e.target.value)}
                              disabled={isAssessor}
                            />
                          </TableCell>

                          {/* Status */}
                          <TableCell>
                            <Select
                              value={item.status}
                              onValueChange={(v) => handleStatusChange(item, v as MonitoringStatus)}
                              disabled={isAssessor}
                            >
                              <SelectTrigger className={cn(
                                "h-8 text-xs",
                                overdue && "border-red-400 bg-red-50 text-red-700 dark:bg-red-950/30 dark:text-red-400",
                                !overdue && item.status === "current" && "border-green-400 text-green-700 dark:text-green-400",
                                !overdue && item.status === "in_progress" && "border-blue-400 text-blue-700 dark:text-blue-400",
                                item.status === "failed_validation" && "border-orange-400 text-orange-700 dark:text-orange-400",
                                item.status === "escalated" && "border-purple-400 text-purple-700 dark:text-purple-400",
                              )}>
                                {overdue ? (
                                  <span className="flex items-center gap-1 font-medium">
                                    <AlertTriangle className="h-3 w-3 shrink-0" />
                                    Overdue
                                  </span>
                                ) : (
                                  <SelectValue />
                                )}
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="open">Open</SelectItem>
                                <SelectItem value="in_progress">In Progress</SelectItem>
                                <SelectItem value="current">Current</SelectItem>
                                <SelectItem value="failed_validation">
                                  <span className="flex items-center gap-1.5 text-orange-700">
                                    <ShieldX className="h-3.5 w-3.5" /> Failed Validation
                                  </span>
                                </SelectItem>
                                <SelectItem value="escalated">
                                  <span className="flex items-center gap-1.5 text-purple-700">
                                    <TriangleAlert className="h-3.5 w-3.5" /> Escalated
                                  </span>
                                </SelectItem>
                              </SelectContent>
                            </Select>
                          </TableCell>

                          {/* Notes */}
                          <TableCell>
                            <Textarea
                              className="text-xs min-h-[2rem] resize-none disabled:opacity-60 disabled:cursor-not-allowed"
                              rows={2}
                              placeholder="Add notes..."
                              value={pendingNotes[item.id] ?? (item.notes ?? "")}
                              onChange={(e) =>
                                setPendingNotes((prev) => ({ ...prev, [item.id]: e.target.value }))
                              }
                              onBlur={() => !isAssessor && handleNotesSave(item.id)}
                              disabled={isAssessor}
                            />
                          </TableCell>

                          {/* Delete */}
                          {!isAssessor && (
                            <TableCell className="pr-4">
                              <button
                                onClick={() => setDeleteItemId(item.id)}
                                className="flex items-center justify-center w-7 h-7 rounded text-muted-foreground hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors"
                                title="Delete item"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </TableCell>
                          )}
                        </TableRow>

                        {/* Expandable workbook panel */}
                        {isExpanded && (
                          <TableRow key={`${item.id}-workbook`} className={cn(
                            overdue && "bg-red-50/40 dark:bg-red-950/10",
                            hasFailed && "bg-orange-50/40 dark:bg-orange-950/10",
                            isEscalated && "bg-purple-50/40 dark:bg-purple-950/10",
                          )}>
                            <TableCell colSpan={isAssessor ? 10 : 11} className="p-0">
                              <WorkbookPanel
                                item={item}
                                orgId={activeOrg?.id ?? ""}
                                poams={poams}
                                isAssessor={isAssessor}
                                onUpdate={(patch) =>
                                  updateMutation.mutate({ id: item.id, ...patch })
                                }
                              />
                            </TableCell>
                          </TableRow>
                        )}
                      </>
                    );
                  })
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Add Item dialog */}
      <Dialog open={showAddItem} onOpenChange={setShowAddItem}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Add Monitoring Item</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="add-task">Task Name <span className="text-red-500">*</span></Label>
              <Input
                id="add-task"
                placeholder="e.g. Review Firewall Rules"
                value={addForm.task}
                onChange={(e) => setAddForm((f) => ({ ...f, task: e.target.value }))}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Frequency <span className="text-red-500">*</span></Label>
                <Select value={addForm.frequency} onValueChange={(v) => setAddForm((f) => ({ ...f, frequency: v as MonitoringFrequency }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="daily">Daily</SelectItem>
                    <SelectItem value="weekly">Weekly</SelectItem>
                    <SelectItem value="monthly">Monthly</SelectItem>
                    <SelectItem value="quarterly">Quarterly</SelectItem>
                    <SelectItem value="annually">Annually</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="add-control">Control Ref <span className="text-red-500">*</span></Label>
                <Input
                  id="add-control"
                  placeholder="e.g. 3.1.1"
                  value={addForm.controlRef}
                  onChange={(e) => setAddForm((f) => ({ ...f, controlRef: e.target.value }))}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="add-desc">Description</Label>
              <Textarea
                id="add-desc"
                placeholder="Brief description of what this monitoring task covers…"
                rows={2}
                value={addForm.description}
                onChange={(e) => setAddForm((f) => ({ ...f, description: e.target.value }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddItem(false)} disabled={createMutation.isPending}>
              Cancel
            </Button>
            <Button
              onClick={() => createMutation.mutate(addForm)}
              disabled={createMutation.isPending || !addForm.task.trim() || !addForm.controlRef.trim()}
            >
              {createMutation.isPending ? "Adding…" : "Add Item"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirm dialog */}
      <Dialog open={!!deleteItemId} onOpenChange={() => setDeleteItemId(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Delete Monitoring Item</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Permanently remove this monitoring item? This cannot be undone.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteItemId(null)} disabled={deleteMutation.isPending}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => deleteItemId && deleteMutation.mutate(deleteItemId)}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? "Deleting…" : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
