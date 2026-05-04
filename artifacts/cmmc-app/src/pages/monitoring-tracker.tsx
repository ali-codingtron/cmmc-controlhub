import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useOrg } from "@/context/OrgContext";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { X, Activity, CheckCircle2, Clock, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";

type MonitoringFrequency = "daily" | "weekly" | "monthly" | "quarterly" | "annually";
type MonitoringStatus = "open" | "in_progress" | "complete";

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

function calcNextDue(frequency: MonitoringFrequency): string {
  const days = FREQUENCY_DAYS[frequency];
  const d = new Date(Date.now() + days * 86400000);
  return d.toISOString().split("T")[0];
}

function toDateInputValue(ts: string | null): string {
  if (!ts) return "";
  return new Date(ts).toISOString().split("T")[0];
}

function isOverdue(item: MonitoringItem): boolean {
  if (item.status === "complete" || !item.nextDue) return false;
  return new Date(item.nextDue) < new Date();
}

function isDueSoon(item: MonitoringItem): boolean {
  if (item.status === "complete" || !item.nextDue) return false;
  const due = new Date(item.nextDue);
  const now = new Date();
  const sevenDays = new Date(now.getTime() + 7 * 86400000);
  return due >= now && due <= sevenDays;
}

function makeHeaders(orgId: string) {
  const token = localStorage.getItem("auth_token");
  return {
    Authorization: `Bearer ${token}`,
    "X-Organization-ID": orgId,
    "Content-Type": "application/json",
  };
}

export default function MonitoringTracker() {
  const { activeOrg } = useOrg();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [search, setSearch] = useState("");
  const [freqFilter, setFreqFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [controlRefFilter, setControlRefFilter] = useState("all");
  const [pendingNotes, setPendingNotes] = useState<Record<string, string>>({});

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

  const updateMutation = useMutation({
    mutationFn: async ({
      id,
      ...data
    }: {
      id: string;
      lastCompleted?: string | null;
      nextDue?: string | null;
      status?: MonitoringStatus;
      notes?: string;
    }) => {
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
      if (statusFilter !== "all" && item.status !== statusFilter) return false;
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
  const dueSoonCount = items.filter(isDueSoon).length;
  const completeCount = items.filter((i) => i.status === "complete").length;

  function handleStatusChange(item: MonitoringItem, newStatus: MonitoringStatus) {
    const today = new Date().toISOString().split("T")[0];
    const patch: {
      status: MonitoringStatus;
      lastCompleted?: string | null;
      nextDue?: string | null;
    } = { status: newStatus };

    if (newStatus === "complete") {
      if (!item.lastCompleted) patch.lastCompleted = today;
      if (!item.nextDue) patch.nextDue = calcNextDue(item.frequency);
    }

    updateMutation.mutate({ id: item.id, ...patch });
  }

  function handleDateChange(id: string, field: "lastCompleted" | "nextDue", value: string) {
    updateMutation.mutate({ id, [field]: value || null });
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

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold">Monitoring Tracker</h1>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Activity className="h-4 w-4" />
          <span>CMMC L2 Operational Monitoring</span>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-4">
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
              <p className="text-2xl font-bold text-green-700 dark:text-green-400">{completeCount}</p>
              <p className="text-xs text-muted-foreground">Complete</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-4 pb-0">
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
              <SelectTrigger className="w-36">
                <SelectValue placeholder="All Statuses" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                <SelectItem value="open">Open</SelectItem>
                <SelectItem value="in_progress">In Progress</SelectItem>
                <SelectItem value="complete">Complete</SelectItem>
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
        </CardContent>

        <CardContent className="pt-4 overflow-x-auto">
          {isLoading ? (
            <div className="space-y-2">
              {[...Array(6)].map((_, i) => (
                <div key={i} className="h-12 animate-pulse bg-muted rounded" />
              ))}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-24">Frequency</TableHead>
                  <TableHead className="w-48">Task</TableHead>
                  <TableHead className="w-24">Control ID</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead className="w-36">Last Completed</TableHead>
                  <TableHead className="w-36">Next Due</TableHead>
                  <TableHead className="w-36">Status</TableHead>
                  <TableHead className="w-52">Notes</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center text-muted-foreground py-10">
                      No monitoring items match the current filters.
                    </TableCell>
                  </TableRow>
                ) : (
                  filtered.map((item) => {
                    const overdue = isOverdue(item);
                    const dueSoon = isDueSoon(item);
                    return (
                      <TableRow
                        key={item.id}
                        className={cn(
                          overdue && "bg-red-50/50 dark:bg-red-950/10",
                          !overdue && dueSoon && "bg-yellow-50/50 dark:bg-yellow-950/10"
                        )}
                      >
                        {/* Frequency */}
                        <TableCell>
                          <Badge className={cn("text-[11px] font-medium", FREQUENCY_COLOR[item.frequency])}>
                            {FREQUENCY_LABEL[item.frequency]}
                          </Badge>
                        </TableCell>

                        {/* Task */}
                        <TableCell className="font-medium text-sm">{item.task}</TableCell>

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
                            className="w-full text-sm border border-input rounded-md px-2 py-1 bg-background focus:outline-none focus:ring-1 focus:ring-ring"
                            value={toDateInputValue(item.lastCompleted)}
                            onChange={(e) => handleDateChange(item.id, "lastCompleted", e.target.value)}
                          />
                        </TableCell>

                        {/* Next Due */}
                        <TableCell>
                          <input
                            type="date"
                            className={cn(
                              "w-full text-sm border border-input rounded-md px-2 py-1 bg-background focus:outline-none focus:ring-1 focus:ring-ring",
                              overdue && "border-red-400 text-red-700 dark:text-red-400"
                            )}
                            value={toDateInputValue(item.nextDue)}
                            onChange={(e) => handleDateChange(item.id, "nextDue", e.target.value)}
                          />
                        </TableCell>

                        {/* Status */}
                        <TableCell>
                          <Select
                            value={item.status}
                            onValueChange={(v) => handleStatusChange(item, v as MonitoringStatus)}
                          >
                            <SelectTrigger className={cn(
                              "h-8 text-xs",
                              item.status === "complete" && "border-green-400 text-green-700 dark:text-green-400",
                              item.status === "in_progress" && "border-yellow-400 text-yellow-700 dark:text-yellow-400",
                              item.status === "open" && overdue && "border-red-400 text-red-700 dark:text-red-400"
                            )}>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="open">Open</SelectItem>
                              <SelectItem value="in_progress">In Progress</SelectItem>
                              <SelectItem value="complete">Complete</SelectItem>
                            </SelectContent>
                          </Select>
                        </TableCell>

                        {/* Notes */}
                        <TableCell>
                          <Textarea
                            className="text-xs min-h-[2rem] resize-none"
                            rows={2}
                            placeholder="Add notes..."
                            value={pendingNotes[item.id] ?? (item.notes ?? "")}
                            onChange={(e) =>
                              setPendingNotes((prev) => ({ ...prev, [item.id]: e.target.value }))
                            }
                            onBlur={() => handleNotesSave(item.id)}
                          />
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
