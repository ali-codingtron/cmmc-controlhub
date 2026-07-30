import { useState, useEffect, useCallback, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
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
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useToast } from "@/hooks/use-toast";
import {
  Plus,
  MoreHorizontal,
  CheckSquare,
  Calendar,
  Clock,
  AlertTriangle,
  AlertCircle,
  CheckCircle2,
  XCircle,
  Ban,
  Play,
  Pause,
  RotateCcw,
  User,
  ChevronDown,
  ChevronRight,
  Search,
  X,
  Activity,
  Info,
  Pencil,
  Eye,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Task {
  id: string;
  taskNumber: string | null;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  dueDate: string | null;
  startDate: string | null;
  closedDate: string | null;
  closureSummary: string | null;
  closedByUserId: string | null;
  closedByUserName: string | null;
  blockedReason: string | null;
  blockedByUserId: string | null;
  blockedByUserName: string | null;
  blockedAt: string | null;
  reopenedByUserId: string | null;
  reopenedByUserName: string | null;
  reopenedAt: string | null;
  reopenReason: string | null;
  cancelledByUserId: string | null;
  cancelledByUserName: string | null;
  cancelledAt: string | null;
  cancellationReason: string | null;
  assigneeId: string | null;
  assigneeName: string | null;
  assigneeEmail: string | null;
  createdById: string | null;
  createdByName: string | null;
  updatedByUserId: string | null;
  updatedByUserName: string | null;
  createdAt: string;
  updatedAt: string;
  organizationId: string | null;
  control?: {
    id: string;
    controlId: string;
    title: string;
    domainName: string | null;
    level: string | null;
  } | null;
  organizationName?: string | null;
}

interface TaskActivity {
  id: string;
  action: string;
  field: string | null;
  previousValue: string | null;
  newValue: string | null;
  note: string | null;
  actingUserId: string | null;
  actingUserName: string | null;
  createdAt: string;
}

interface OrgMember {
  id: string;
  name: string;
  email: string;
  role: string;
}

interface TaskSummary {
  active: number;
  inProgress: number;
  blocked: number;
  overdue: number;
  closed: number;
  cancelled: number;
  total: number;
}

interface ControlTasksTabProps {
  controlId: string;
  controlLabel: string;
  controlTitle: string;
  orgId: string | null | undefined;
  isReadOnly: boolean;
  onCountChange?: (activeCount: number) => void;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const ACTIVE_STATUSES = ["open", "in_progress", "blocked"];
const CLOSED_STATUSES = ["closed", "completed", "cancelled"];

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  open: {
    label: "Open",
    color: "bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-900/30 dark:text-blue-300",
    icon: <CheckSquare className="h-3 w-3" />,
  },
  in_progress: {
    label: "In Progress",
    color: "bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:text-amber-300",
    icon: <Play className="h-3 w-3" />,
  },
  blocked: {
    label: "Blocked",
    color: "bg-red-100 text-red-700 border-red-200 dark:bg-red-900/30 dark:text-red-300",
    icon: <Pause className="h-3 w-3" />,
  },
  closed: {
    label: "Closed",
    color: "bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-300",
    icon: <CheckCircle2 className="h-3 w-3" />,
  },
  completed: {
    label: "Completed",
    color: "bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-300",
    icon: <CheckCircle2 className="h-3 w-3" />,
  },
  cancelled: {
    label: "Cancelled",
    color: "bg-gray-100 text-gray-600 border-gray-200 dark:bg-gray-800/50 dark:text-gray-400",
    icon: <XCircle className="h-3 w-3" />,
  },
  overdue: {
    label: "Overdue",
    color: "bg-red-100 text-red-700 border-red-200 dark:bg-red-900/30 dark:text-red-300",
    icon: <AlertTriangle className="h-3 w-3" />,
  },
  deferred: {
    label: "Deferred",
    color: "bg-purple-100 text-purple-700 border-purple-200 dark:bg-purple-900/30 dark:text-purple-300",
    icon: <Clock className="h-3 w-3" />,
  },
};

const PRIORITY_CONFIG: Record<string, { label: string; color: string }> = {
  critical: { label: "Critical", color: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300" },
  high: { label: "High", color: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300" },
  medium: { label: "Medium", color: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300" },
  low: { label: "Low", color: "bg-slate-100 text-slate-600 dark:bg-slate-800/50 dark:text-slate-400" },
};

const ACTIVITY_ICONS: Record<string, React.ReactNode> = {
  created: <Plus className="h-3.5 w-3.5 text-blue-500" />,
  edited: <Pencil className="h-3.5 w-3.5 text-amber-500" />,
  started: <Play className="h-3.5 w-3.5 text-green-500" />,
  blocked: <Pause className="h-3.5 w-3.5 text-red-500" />,
  resumed: <Play className="h-3.5 w-3.5 text-amber-500" />,
  closed: <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />,
  reopened: <RotateCcw className="h-3.5 w-3.5 text-blue-500" />,
  cancelled: <XCircle className="h-3.5 w-3.5 text-gray-500" />,
};

const PRIORITIES = [
  { value: "critical", label: "Critical" },
  { value: "high", label: "High" },
  { value: "medium", label: "Medium" },
  { value: "low", label: "Low" },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function authHeaders(orgId: string | null | undefined): Record<string, string> {
  const token = localStorage.getItem("auth_token");
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
    ...(orgId ? { "X-Organization-ID": orgId } : {}),
  };
}

function formatDate(d: string | null | undefined): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString();
}

function formatDateTime(d: string | null | undefined): string {
  if (!d) return "—";
  return new Date(d).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

function dueDateStatus(
  dueDate: string | null | undefined,
  status: string
): "overdue" | "today" | "soon" | "ok" | "none" {
  if (!dueDate) return "none";
  if (CLOSED_STATUSES.includes(status)) return "none"; // never show overdue for closed
  const due = new Date(dueDate);
  due.setHours(23, 59, 59, 999); // end of due day
  const now = new Date();
  const sevenDays = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  if (due < now) return "overdue";
  const today = new Date();
  if (
    due.getFullYear() === today.getFullYear() &&
    due.getMonth() === today.getMonth() &&
    due.getDate() === today.getDate()
  )
    return "today";
  if (due <= sevenDays) return "soon";
  return "ok";
}

function DueDateBadge({ dueDate, status }: { dueDate: string | null; status: string }) {
  const ds = dueDateStatus(dueDate, status);
  if (!dueDate) return null;
  const label = formatDate(dueDate);
  if (ds === "overdue")
    return (
      <span className="inline-flex items-center gap-0.5 text-xs font-medium text-red-600">
        <AlertTriangle className="h-3 w-3" />
        {label} · Overdue
      </span>
    );
  if (ds === "today")
    return (
      <span className="inline-flex items-center gap-0.5 text-xs font-medium text-orange-600">
        <AlertCircle className="h-3 w-3" />
        {label} · Due Today
      </span>
    );
  if (ds === "soon")
    return (
      <span className="inline-flex items-center gap-0.5 text-xs text-amber-600">
        <Calendar className="h-3 w-3" />
        {label} · Due Soon
      </span>
    );
  return (
    <span className="inline-flex items-center gap-0.5 text-xs text-muted-foreground">
      <Calendar className="h-3 w-3" />
      {label}
    </span>
  );
}

function TaskStatusBadge({ status }: { status: string }) {
  const cfg = STATUS_CONFIG[status] ?? STATUS_CONFIG.open;
  return (
    <Badge
      variant="outline"
      className={cn("text-xs font-medium flex items-center gap-1 px-1.5 py-0.5", cfg.color)}
    >
      {cfg.icon}
      {cfg.label}
    </Badge>
  );
}

function TaskPriorityBadge({ priority }: { priority: string }) {
  const cfg = PRIORITY_CONFIG[priority] ?? PRIORITY_CONFIG.medium;
  return (
    <Badge variant="outline" className={cn("text-xs font-medium px-1.5 py-0.5", cfg.color)}>
      {cfg.label}
    </Badge>
  );
}

// ─── ActivityTimeline ─────────────────────────────────────────────────────────

function ActivityTimeline({ activities, loading }: { activities: TaskActivity[]; loading: boolean }) {
  if (loading) {
    return <div className="text-sm text-muted-foreground py-4 text-center">Loading activity…</div>;
  }
  if (activities.length === 0) {
    return <div className="text-sm text-muted-foreground py-4 text-center">No activity recorded yet.</div>;
  }

  function describeActivity(a: TaskActivity): string {
    switch (a.action) {
      case "created": return "created this task";
      case "started": return "started this task";
      case "blocked": return "marked this task as Blocked";
      case "resumed": return "resumed this task";
      case "closed": return "closed this task";
      case "reopened": return "reopened this task";
      case "cancelled": return "cancelled this task";
      case "edited":
        if (a.field === "title") return "updated the title";
        if (a.field === "description") return "updated the description";
        if (a.field === "priority") return `changed priority from "${a.previousValue}" to "${a.newValue}"`;
        if (a.field === "due_date") {
          if (!a.newValue) return "removed the due date";
          if (!a.previousValue) return `set due date to ${a.newValue}`;
          return `changed due date from ${a.previousValue} to ${a.newValue}`;
        }
        if (a.field === "assignee") {
          if (!a.newValue) return "removed the assignee";
          return `assigned to ${a.newValue}`;
        }
        return `updated ${a.field ?? "a field"}`;
      default: return a.action;
    }
  }

  return (
    <div className="space-y-3">
      {activities.map((a, i) => (
        <div key={a.id} className="flex gap-3 text-sm">
          <div className="flex flex-col items-center">
            <div className="flex h-6 w-6 items-center justify-center rounded-full bg-muted">
              {ACTIVITY_ICONS[a.action] ?? <Activity className="h-3.5 w-3.5 text-muted-foreground" />}
            </div>
            {i < activities.length - 1 && <div className="mt-1 w-px flex-1 bg-border" />}
          </div>
          <div className="pb-3 min-w-0">
            <p className="leading-snug">
              <span className="font-medium">{a.actingUserName ?? "Unknown user"}</span>{" "}
              <span className="text-muted-foreground">{describeActivity(a)}</span>
            </p>
            {a.note && (
              <p className="mt-0.5 text-xs text-muted-foreground italic line-clamp-3">"{a.note}"</p>
            )}
            <p className="mt-0.5 text-xs text-muted-foreground/70">{formatDateTime(a.createdAt)}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── TaskDrawer ───────────────────────────────────────────────────────────────

interface TaskDrawerProps {
  taskId: string | null;
  controlId: string;
  controlLabel: string;
  orgId: string | null | undefined;
  isReadOnly: boolean;
  onClose: () => void;
  onEdit: (task: Task) => void;
  onStart: (task: Task) => void;
  onBlock: (task: Task) => void;
  onResume: (task: Task) => void;
  onClose_task: (task: Task) => void;
  onReopen: (task: Task) => void;
  onCancel: (task: Task) => void;
  onRefreshList: () => void;
}

function TaskDrawer({
  taskId,
  controlId,
  orgId,
  controlLabel,
  isReadOnly,
  onClose,
  onEdit,
  onStart,
  onBlock,
  onResume,
  onClose_task,
  onReopen,
  onCancel,
}: TaskDrawerProps) {
  const [activityOpen, setActivityOpen] = useState(true);

  const { data: taskData, isLoading: taskLoading } = useQuery<Task>({
    queryKey: ["task-detail", taskId, orgId],
    queryFn: async () => {
      const r = await fetch(
        `/api/organizations/${orgId}/controls/${controlId}/tasks/${taskId}`,
        { headers: authHeaders(orgId) }
      );
      if (!r.ok) throw new Error("Failed to load task");
      return r.json();
    },
    enabled: !!taskId && !!orgId,
    staleTime: 10_000,
  });

  const { data: activities = [], isLoading: activityLoading } = useQuery<TaskActivity[]>({
    queryKey: ["task-activity", taskId, orgId],
    queryFn: async () => {
      const r = await fetch(
        `/api/organizations/${orgId}/controls/${controlId}/tasks/${taskId}/activity`,
        { headers: authHeaders(orgId) }
      );
      if (!r.ok) return [];
      return r.json();
    },
    enabled: !!taskId && !!orgId && activityOpen,
    staleTime: 15_000,
  });

  const task = taskData;
  const status = task?.status ?? "";
  const isActive = ACTIVE_STATUSES.includes(status);
  const isClosed = ["closed", "completed", "cancelled"].includes(status);

  function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
    return (
      <div className="grid grid-cols-[140px_1fr] gap-2 text-sm py-1">
        <span className="text-muted-foreground shrink-0">{label}</span>
        <span className="font-medium break-words">{value || "—"}</span>
      </div>
    );
  }

  return (
    <Sheet open={!!taskId} onOpenChange={(open) => { if (!open) onClose(); }}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-[580px] flex flex-col p-0 overflow-hidden"
      >
        {taskLoading || !task ? (
          <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">
            {taskLoading ? "Loading task…" : "Task details could not be loaded."}
          </div>
        ) : (
          <div className="flex flex-col h-full overflow-hidden">
            {/* Header */}
            <div className="px-6 py-4 border-b bg-card shrink-0">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    {task.taskNumber && (
                      <span className="text-xs font-mono text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                        {task.taskNumber}
                      </span>
                    )}
                    <TaskStatusBadge status={task.status} />
                    <TaskPriorityBadge priority={task.priority} />
                  </div>
                  <h2 className="font-semibold text-base leading-tight">{task.title}</h2>
                </div>
              </div>

              {/* Action buttons */}
              {!isReadOnly && (
                <div className="flex flex-wrap gap-2 mt-3">
                  <Button size="sm" variant="outline" onClick={() => onEdit(task)}>
                    <Pencil className="h-3.5 w-3.5 mr-1" /> Edit
                  </Button>
                  {status === "open" && (
                    <Button size="sm" variant="outline" onClick={() => onStart(task)}>
                      <Play className="h-3.5 w-3.5 mr-1" /> Start Task
                    </Button>
                  )}
                  {["open", "in_progress"].includes(status) && (
                    <Button size="sm" variant="outline" onClick={() => onBlock(task)}>
                      <Pause className="h-3.5 w-3.5 mr-1" /> Mark Blocked
                    </Button>
                  )}
                  {status === "blocked" && (
                    <Button size="sm" variant="outline" onClick={() => onResume(task)}>
                      <Play className="h-3.5 w-3.5 mr-1" /> Resume Task
                    </Button>
                  )}
                  {isActive && (
                    <Button size="sm" variant="outline" onClick={() => onClose_task(task)}>
                      <CheckCircle2 className="h-3.5 w-3.5 mr-1" /> Close Task
                    </Button>
                  )}
                  {isClosed && (
                    <Button size="sm" variant="outline" onClick={() => onReopen(task)}>
                      <RotateCcw className="h-3.5 w-3.5 mr-1" /> Reopen
                    </Button>
                  )}
                  {!["closed", "cancelled"].includes(status) && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-muted-foreground hover:text-red-600"
                      onClick={() => onCancel(task)}
                    >
                      <Ban className="h-3.5 w-3.5 mr-1" /> Cancel
                    </Button>
                  )}
                </div>
              )}
            </div>

            {/* Scrollable content */}
            <div className="flex-1 overflow-y-auto px-6 py-4 space-y-5">
              {/* Task Information */}
              <section>
                <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                  Task Information
                </h3>
                {task.description && (
                  <div className="mb-3 text-sm text-muted-foreground whitespace-pre-wrap leading-relaxed bg-muted/40 rounded-md px-3 py-2">
                    {task.description}
                  </div>
                )}
                <InfoRow label="Status" value={<TaskStatusBadge status={task.status} />} />
                <InfoRow label="Priority" value={<TaskPriorityBadge priority={task.priority} />} />
                <InfoRow
                  label="Assigned To"
                  value={
                    task.assigneeName ? (
                      <span className="flex items-center gap-1">
                        <User className="h-3.5 w-3.5 text-muted-foreground" />
                        {task.assigneeName}
                      </span>
                    ) : (
                      <span className="text-muted-foreground italic">Unassigned</span>
                    )
                  }
                />
                <InfoRow
                  label="Due Date"
                  value={<DueDateBadge dueDate={task.dueDate} status={task.status} />}
                />
                <InfoRow label="Start Date" value={formatDate(task.startDate)} />
                <InfoRow label="Created By" value={task.createdByName} />
                <InfoRow label="Created" value={formatDateTime(task.createdAt)} />
                <InfoRow label="Last Updated By" value={task.updatedByUserName} />
                <InfoRow label="Last Updated" value={formatDateTime(task.updatedAt)} />
              </section>

              <Separator />

              {/* Control Context */}
              <section>
                <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                  Control Context
                </h3>
                {task.organizationName && (
                  <InfoRow label="Organization" value={task.organizationName} />
                )}
                {task.control && (
                  <>
                    <InfoRow label="Control ID" value={task.control.controlId} />
                    <InfoRow label="Control Title" value={task.control.title} />
                    {task.control.domainName && (
                      <InfoRow label="Domain" value={task.control.domainName} />
                    )}
                    {task.control.level && (
                      <InfoRow label="Level" value={task.control.level} />
                    )}
                  </>
                )}
              </section>

              {/* Blocked Info */}
              {status === "blocked" && task.blockedReason && (
                <>
                  <Separator />
                  <section>
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-red-600 mb-2">
                      Blocked
                    </h3>
                    <InfoRow label="Blocked By" value={task.blockedByUserName} />
                    <InfoRow label="Blocked On" value={formatDateTime(task.blockedAt)} />
                    <div className="mt-1 text-sm text-muted-foreground bg-red-50 dark:bg-red-900/20 rounded-md px-3 py-2">
                      <span className="font-medium text-red-700 dark:text-red-400">Reason: </span>
                      {task.blockedReason}
                    </div>
                  </section>
                </>
              )}

              {/* Closure Info */}
              {["closed", "completed"].includes(status) && (
                <>
                  <Separator />
                  <section>
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-emerald-600 mb-2">
                      Closure
                    </h3>
                    <InfoRow label="Closed By" value={task.closedByUserName} />
                    <InfoRow label="Closed On" value={formatDate(task.closedDate)} />
                    {task.closureSummary && (
                      <div className="mt-1 text-sm text-muted-foreground bg-emerald-50 dark:bg-emerald-900/20 rounded-md px-3 py-2">
                        {task.closureSummary}
                      </div>
                    )}
                  </section>
                </>
              )}

              {/* Reopen Info */}
              {task.reopenedAt && (
                <>
                  <Separator />
                  <section>
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-blue-600 mb-2">
                      Reopen History
                    </h3>
                    <InfoRow label="Reopened By" value={task.reopenedByUserName} />
                    <InfoRow label="Reopened On" value={formatDateTime(task.reopenedAt)} />
                    {task.reopenReason && (
                      <div className="mt-1 text-sm text-muted-foreground bg-blue-50 dark:bg-blue-900/20 rounded-md px-3 py-2">
                        {task.reopenReason}
                      </div>
                    )}
                  </section>
                </>
              )}

              {/* Cancellation Info */}
              {status === "cancelled" && task.cancellationReason && (
                <>
                  <Separator />
                  <section>
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-600 mb-2">
                      Cancellation
                    </h3>
                    <InfoRow label="Cancelled By" value={task.cancelledByUserName} />
                    <InfoRow label="Cancelled On" value={formatDateTime(task.cancelledAt)} />
                    <div className="mt-1 text-sm text-muted-foreground bg-gray-50 dark:bg-gray-800/40 rounded-md px-3 py-2">
                      {task.cancellationReason}
                    </div>
                  </section>
                </>
              )}

              <Separator />

              {/* Activity Timeline */}
              <section>
                <button
                  className="w-full flex items-center justify-between text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3 hover:text-foreground transition-colors"
                  onClick={() => setActivityOpen((v) => !v)}
                >
                  <span>Activity History</span>
                  {activityOpen ? (
                    <ChevronDown className="h-3.5 w-3.5" />
                  ) : (
                    <ChevronRight className="h-3.5 w-3.5" />
                  )}
                </button>
                {activityOpen && (
                  <ActivityTimeline activities={activities} loading={activityLoading} />
                )}
              </section>
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

// ─── TaskRow ──────────────────────────────────────────────────────────────────

function TaskRow({
  task,
  isReadOnly,
  onClick,
  onEdit,
  onStart,
  onBlock,
  onResume,
  onCloseTask,
  onReopen,
  onCancel,
}: {
  task: Task;
  isReadOnly: boolean;
  onClick: () => void;
  onEdit: () => void;
  onStart: () => void;
  onBlock: () => void;
  onResume: () => void;
  onCloseTask: () => void;
  onReopen: () => void;
  onCancel: () => void;
}) {
  const status = task.status;
  const isActive = ACTIVE_STATUSES.includes(status);
  const isClosed = ["closed", "completed", "cancelled"].includes(status);

  return (
    <div
      className="group relative flex items-start gap-3 p-3 rounded-lg border bg-card hover:bg-muted/40 cursor-pointer transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      onClick={onClick}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") onClick(); }}
      tabIndex={0}
      role="button"
      aria-label={`Open task: ${task.title}`}
    >
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          {task.taskNumber && (
            <span className="text-xs font-mono text-muted-foreground">{task.taskNumber}</span>
          )}
          <TaskStatusBadge status={status} />
          <TaskPriorityBadge priority={task.priority} />
        </div>
        <p className="font-medium mt-1 leading-snug">{task.title}</p>
        {task.description && (
          <p className="text-sm text-muted-foreground mt-0.5 line-clamp-2">{task.description}</p>
        )}
        <div className="flex flex-wrap items-center gap-3 mt-1.5">
          {task.assigneeName && (
            <span className="flex items-center gap-0.5 text-xs text-muted-foreground">
              <User className="h-3 w-3" />
              {task.assigneeName}
            </span>
          )}
          <DueDateBadge dueDate={task.dueDate} status={status} />
          <span className="text-xs text-muted-foreground/70">
            Updated {formatDate(task.updatedAt)}
          </span>
        </div>
      </div>

      {/* 3-dot menu */}
      {!isReadOnly && (
        <div onClick={(e) => e.stopPropagation()}>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 opacity-0 group-hover:opacity-100 focus:opacity-100 shrink-0"
                aria-label="Task actions"
              >
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={onClick}>
                <Eye className="h-4 w-4 mr-2" /> View Task
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onEdit}>
                <Pencil className="h-4 w-4 mr-2" /> Edit Task
              </DropdownMenuItem>
              {isActive && (
                <>
                  <DropdownMenuSeparator />
                  {status === "open" && (
                    <DropdownMenuItem onClick={onStart}>
                      <Play className="h-4 w-4 mr-2" /> Start Task
                    </DropdownMenuItem>
                  )}
                  {["open", "in_progress"].includes(status) && (
                    <DropdownMenuItem onClick={onBlock}>
                      <Pause className="h-4 w-4 mr-2" /> Mark Blocked
                    </DropdownMenuItem>
                  )}
                  {status === "blocked" && (
                    <DropdownMenuItem onClick={onResume}>
                      <Play className="h-4 w-4 mr-2" /> Resume Task
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuItem onClick={onCloseTask}>
                    <CheckCircle2 className="h-4 w-4 mr-2" /> Close Task
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    className="text-destructive focus:text-destructive"
                    onClick={onCancel}
                  >
                    <Ban className="h-4 w-4 mr-2" /> Cancel Task
                  </DropdownMenuItem>
                </>
              )}
              {isClosed && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={onReopen}>
                    <RotateCcw className="h-4 w-4 mr-2" /> Reopen Task
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      )}
    </div>
  );
}

// ─── Add / Edit Dialog ────────────────────────────────────────────────────────

interface TaskFormDialogProps {
  mode: "add" | "edit";
  initialTask?: Task | null;
  controlId: string;
  controlLabel: string;
  orgId: string | null | undefined;
  members: OrgMember[];
  onClose: () => void;
  onSaved: (task: Task) => void;
}

function TaskFormDialog({
  mode,
  initialTask,
  controlId,
  controlLabel,
  orgId,
  members,
  onClose,
  onSaved,
}: TaskFormDialogProps) {
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    title: initialTask?.title ?? "",
    description: initialTask?.description ?? "",
    priority: initialTask?.priority ?? "medium",
    dueDate: initialTask?.dueDate
      ? new Date(initialTask.dueDate).toISOString().split("T")[0]
      : "",
    startDate: initialTask?.startDate
      ? new Date(initialTask.startDate).toISOString().split("T")[0]
      : "",
    assigneeId: initialTask?.assigneeId ?? "",
  });

  const set = (k: keyof typeof form) => (v: string) =>
    setForm((f) => ({ ...f, [k]: v }));

  const handleSave = async () => {
    if (!form.title.trim()) { toast({ title: "Title is required", variant: "destructive" }); return; }
    if (!form.description.trim()) { toast({ title: "Description is required", variant: "destructive" }); return; }
    if (!form.priority) { toast({ title: "Priority is required", variant: "destructive" }); return; }
    setSaving(true);
    try {
      const body: Record<string, any> = {
        title: form.title.trim(),
        description: form.description.trim(),
        priority: form.priority,
        dueDate: form.dueDate || null,
        startDate: form.startDate || null,
        assigneeId: form.assigneeId || null,
      };

      let url: string;
      let method: string;
      if (mode === "add") {
        url = `/api/organizations/${orgId}/controls/${controlId}/tasks`;
        method = "POST";
      } else {
        body.expectedVersion = initialTask?.updatedAt;
        url = `/api/organizations/${orgId}/controls/${controlId}/tasks/${initialTask!.id}`;
        method = "PATCH";
      }

      const r = await fetch(url, {
        method,
        headers: authHeaders(orgId),
        body: JSON.stringify(body),
      });
      if (!r.ok) {
        const e = await r.json();
        if (r.status === 409 && e.code === "CONCURRENT_MODIFICATION") {
          toast({
            title: "Task was updated by someone else",
            description: "Reload the task and try again.",
            variant: "destructive",
          });
          return;
        }
        throw new Error(e.error ?? "Failed to save");
      }
      const saved: Task = await r.json();
      toast({ title: mode === "add" ? "Task created" : "Task updated" });
      onSaved(saved);
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{mode === "add" ? "Add Task" : "Edit Task"}</DialogTitle>
          <DialogDescription>
            <span className="text-xs text-muted-foreground">
              Linked control:{" "}
              <span className="font-mono font-medium">{controlLabel}</span>
            </span>
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-1">
          <div>
            <Label>
              Title <span className="text-destructive">*</span>
            </Label>
            <Input
              value={form.title}
              onChange={(e) => set("title")(e.target.value)}
              placeholder="What needs to be done?"
              autoFocus
            />
          </div>
          <div>
            <Label>
              Description <span className="text-destructive">*</span>
            </Label>
            <Textarea
              value={form.description}
              onChange={(e) => set("description")(e.target.value)}
              placeholder="Describe the work required…"
              rows={3}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>
                Priority <span className="text-destructive">*</span>
              </Label>
              <Select value={form.priority} onValueChange={set("priority")}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PRIORITIES.map((p) => (
                    <SelectItem key={p.value} value={p.value}>
                      {p.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Assignee</Label>
              <Select value={form.assigneeId || "__unassigned__"} onValueChange={(v) => set("assigneeId")(v === "__unassigned__" ? "" : v)}>
                <SelectTrigger>
                  <SelectValue placeholder="Unassigned" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__unassigned__">Unassigned</SelectItem>
                  {members.map((m) => (
                    <SelectItem key={m.id} value={m.id}>
                      {m.name}
                      <span className="ml-1 text-xs text-muted-foreground">({m.email})</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Due Date</Label>
              <Input
                type="date"
                value={form.dueDate}
                onChange={(e) => set("dueDate")(e.target.value)}
              />
            </div>
            <div>
              <Label>Start Date</Label>
              <Input
                type="date"
                value={form.startDate}
                onChange={(e) => set("startDate")(e.target.value)}
              />
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving || !form.title.trim() || !form.description.trim()}>
            {saving ? "Saving…" : mode === "add" ? "Create Task" : "Save Changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Lifecycle dialogs ────────────────────────────────────────────────────────

function useLifecycleAction(orgId: string | null | undefined, controlId: string) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);

  const doAction = async (
    taskId: string,
    action: string,
    body: Record<string, any>,
    onSuccess: (task: Task) => void,
    successMsg: string
  ) => {
    setLoading(true);
    try {
      const r = await fetch(
        `/api/organizations/${orgId}/controls/${controlId}/tasks/${taskId}/${action}`,
        { method: "POST", headers: authHeaders(orgId), body: JSON.stringify(body) }
      );
      if (!r.ok) {
        const e = await r.json();
        throw new Error(e.error ?? `Failed to ${action} task`);
      }
      const updated: Task = await r.json();
      toast({ title: successMsg });
      onSuccess(updated);
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return { doAction, loading };
}

function StartDialog({ task, orgId, controlId, onClose, onDone }: {
  task: Task; orgId: string | null | undefined; controlId: string;
  onClose: () => void; onDone: (t: Task) => void;
}) {
  const { doAction, loading } = useLifecycleAction(orgId, controlId);
  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Start Task</DialogTitle>
          <DialogDescription>
            Move <strong>{task.taskNumber ?? task.title}</strong> to In Progress?
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button disabled={loading} onClick={() =>
            doAction(task.id, "start", {}, onDone, "Task moved to In Progress")
          }>
            {loading ? "Starting…" : "Start Task"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function BlockDialog({ task, orgId, controlId, onClose, onDone }: {
  task: Task; orgId: string | null | undefined; controlId: string;
  onClose: () => void; onDone: (t: Task) => void;
}) {
  const [blockedReason, setBlockedReason] = useState("");
  const { doAction, loading } = useLifecycleAction(orgId, controlId);
  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Mark Task Blocked</DialogTitle>
          <DialogDescription>{task.taskNumber ?? task.title}</DialogDescription>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div>
            <Label>Blocked Reason <span className="text-destructive">*</span></Label>
            <Textarea
              value={blockedReason}
              onChange={(e) => setBlockedReason(e.target.value)}
              placeholder="What is blocking this task?"
              rows={3}
              autoFocus
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            disabled={loading || !blockedReason.trim()}
            onClick={() => doAction(task.id, "block", { blockedReason }, onDone, "Task marked as Blocked")}
          >
            {loading ? "Saving…" : "Mark Blocked"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ResumeDialog({ task, orgId, controlId, onClose, onDone }: {
  task: Task; orgId: string | null | undefined; controlId: string;
  onClose: () => void; onDone: (t: Task) => void;
}) {
  const [resolutionNote, setResolutionNote] = useState("");
  const { doAction, loading } = useLifecycleAction(orgId, controlId);
  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Resume Task</DialogTitle>
          <DialogDescription>{task.taskNumber ?? task.title}</DialogDescription>
        </DialogHeader>
        {task.blockedReason && (
          <div className="text-sm text-muted-foreground bg-muted/50 rounded px-3 py-2">
            <span className="font-medium">Was blocked: </span>{task.blockedReason}
          </div>
        )}
        <div className="space-y-2 py-1">
          <Label>Resolution Note (optional)</Label>
          <Textarea
            value={resolutionNote}
            onChange={(e) => setResolutionNote(e.target.value)}
            placeholder="How was the blocker resolved?"
            rows={2}
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            disabled={loading}
            onClick={() => doAction(task.id, "resume", { resolutionNote }, onDone, "Task resumed")}
          >
            {loading ? "Saving…" : "Resume Task"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CloseDialog({ task, orgId, controlId, onClose, onDone }: {
  task: Task; orgId: string | null | undefined; controlId: string;
  onClose: () => void; onDone: (t: Task) => void;
}) {
  const [closureSummary, setClosureSummary] = useState("");
  const [closedDate, setClosedDate] = useState(new Date().toISOString().split("T")[0]);
  const { doAction, loading } = useLifecycleAction(orgId, controlId);
  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Close Task</DialogTitle>
          <DialogDescription>{task.taskNumber ?? task.title}</DialogDescription>
        </DialogHeader>
        <div className="text-sm border rounded-md px-3 py-2 space-y-1 bg-muted/30">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Status</span>
            <TaskStatusBadge status={task.status} />
          </div>
          {task.assigneeName && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">Assignee</span>
              <span>{task.assigneeName}</span>
            </div>
          )}
          {task.dueDate && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">Due Date</span>
              <span>{formatDate(task.dueDate)}</span>
            </div>
          )}
        </div>
        <div className="space-y-3 py-1">
          <div>
            <Label>Closure Summary <span className="text-destructive">*</span></Label>
            <Textarea
              value={closureSummary}
              onChange={(e) => setClosureSummary(e.target.value)}
              placeholder="Describe how this task was completed…"
              rows={3}
              autoFocus
            />
          </div>
          <div>
            <Label>Completion Date</Label>
            <Input type="date" value={closedDate} onChange={(e) => setClosedDate(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            disabled={loading || !closureSummary.trim()}
            onClick={() => doAction(task.id, "close", { closureSummary, closedDate }, onDone, "Task closed successfully.")}
          >
            {loading ? "Closing…" : "Close Task"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ReopenDialog({ task, orgId, controlId, members, onClose, onDone }: {
  task: Task; orgId: string | null | undefined; controlId: string; members: OrgMember[];
  onClose: () => void; onDone: (t: Task) => void;
}) {
  const [reopenReason, setReopenReason] = useState("");
  const [newDueDate, setNewDueDate] = useState("");
  const [newAssigneeId, setNewAssigneeId] = useState("");
  const [reopenStatus, setReopenStatus] = useState<"open" | "in_progress">("open");
  const { doAction, loading } = useLifecycleAction(orgId, controlId);
  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Reopen Task</DialogTitle>
          <DialogDescription>{task.taskNumber ?? task.title}</DialogDescription>
        </DialogHeader>
        <div className="space-y-3 py-1">
          <div>
            <Label>Reopen Reason <span className="text-destructive">*</span></Label>
            <Textarea
              value={reopenReason}
              onChange={(e) => setReopenReason(e.target.value)}
              placeholder="Why is this task being reopened?"
              rows={2}
              autoFocus
            />
          </div>
          <div>
            <Label>Reopen As</Label>
            <Select value={reopenStatus} onValueChange={(v) => setReopenStatus(v as any)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="open">Open</SelectItem>
                <SelectItem value="in_progress">In Progress</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>New Due Date (optional)</Label>
            <Input type="date" value={newDueDate} onChange={(e) => setNewDueDate(e.target.value)} />
          </div>
          <div>
            <Label>Reassign To (optional)</Label>
            <Select value={newAssigneeId || "__keep__"} onValueChange={(v) => setNewAssigneeId(v === "__keep__" ? "" : v)}>
              <SelectTrigger><SelectValue placeholder="Keep existing" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__keep__">Keep existing</SelectItem>
                {members.map((m) => (
                  <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            disabled={loading || !reopenReason.trim()}
            onClick={() => doAction(task.id, "reopen", {
              reopenReason, reopenStatus,
              newDueDate: newDueDate || undefined,
              newAssigneeId: newAssigneeId || undefined,
            }, onDone, "Task reopened.")}
          >
            {loading ? "Reopening…" : "Reopen Task"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CancelDialog({ task, orgId, controlId, onClose, onDone }: {
  task: Task; orgId: string | null | undefined; controlId: string;
  onClose: () => void; onDone: (t: Task) => void;
}) {
  const [cancellationReason, setCancellationReason] = useState("");
  const { doAction, loading } = useLifecycleAction(orgId, controlId);
  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Cancel Task</DialogTitle>
          <DialogDescription>
            Cancelling preserves the task record in history.{" "}
            <strong>{task.taskNumber ?? task.title}</strong>
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2 py-1">
          <Label>Cancellation Reason <span className="text-destructive">*</span></Label>
          <Textarea
            value={cancellationReason}
            onChange={(e) => setCancellationReason(e.target.value)}
            placeholder="Why is this task being cancelled?"
            rows={2}
            autoFocus
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            variant="destructive"
            disabled={loading || !cancellationReason.trim()}
            onClick={() => doAction(task.id, "cancel", { cancellationReason }, onDone, "Task cancelled.")}
          >
            {loading ? "Cancelling…" : "Cancel Task"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Main ControlTasksTab ─────────────────────────────────────────────────────

type DialogState =
  | { type: "none" }
  | { type: "add" }
  | { type: "edit"; task: Task }
  | { type: "start"; task: Task }
  | { type: "block"; task: Task }
  | { type: "resume"; task: Task }
  | { type: "close"; task: Task }
  | { type: "reopen"; task: Task }
  | { type: "cancel"; task: Task };

export function ControlTasksTab({
  controlId,
  controlLabel,
  controlTitle,
  orgId,
  isReadOnly,
  onCountChange,
}: ControlTasksTabProps) {
  const queryClient = useQueryClient();

  // URL-based drawer state
  const getTaskFromUrl = () => {
    const params = new URLSearchParams(window.location.search);
    return params.get("task") ?? null;
  };
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(getTaskFromUrl);

  const openTask = (taskId: string) => {
    setSelectedTaskId(taskId);
    const params = new URLSearchParams(window.location.search);
    params.set("task", taskId);
    window.history.pushState({}, "", `${window.location.pathname}?${params.toString()}`);
  };

  const closeDrawer = () => {
    setSelectedTaskId(null);
    const params = new URLSearchParams(window.location.search);
    params.delete("task");
    const qs = params.toString();
    window.history.pushState({}, "", `${window.location.pathname}${qs ? `?${qs}` : ""}`);
    invalidate();
  };

  // Filters
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("active");
  const [filterPriority, setFilterPriority] = useState("all");
  const [filterAssignee, setFilterAssignee] = useState("all");
  const [showClosed, setShowClosed] = useState(false);

  // Dialog state
  const [dialog, setDialog] = useState<DialogState>({ type: "none" });
  const closeDialog = () => setDialog({ type: "none" });

  // Data
  const listKey = ["control-tasks", orgId, controlId];
  const { data, isLoading } = useQuery<{ tasks: Task[]; summary: TaskSummary }>({
    queryKey: listKey,
    queryFn: async () => {
      const r = await fetch(
        `/api/organizations/${orgId}/controls/${controlId}/tasks`,
        { headers: authHeaders(orgId) }
      );
      if (!r.ok) throw new Error("Failed to load tasks");
      return r.json();
    },
    enabled: !!orgId,
    staleTime: 15_000,
  });

  const { data: members = [] } = useQuery<OrgMember[]>({
    queryKey: ["org-members", orgId],
    queryFn: async () => {
      const r = await fetch(`/api/organizations/${orgId}/members`, {
        headers: authHeaders(orgId),
      });
      if (!r.ok) return [];
      return r.json();
    },
    enabled: !!orgId,
    staleTime: 60_000,
  });

  const tasks = data?.tasks ?? [];
  const summary = data?.summary ?? { active: 0, inProgress: 0, blocked: 0, overdue: 0, closed: 0, cancelled: 0, total: 0 };

  useEffect(() => {
    onCountChange?.(summary.active);
  }, [summary.active, onCountChange]);

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: listKey });
    queryClient.invalidateQueries({ queryKey: ["task-detail", selectedTaskId, orgId] });
    queryClient.invalidateQueries({ queryKey: ["task-activity", selectedTaskId, orgId] });
  };

  const handleLifecycleDone = (updated: Task) => {
    closeDialog();
    invalidate();
    // If the drawer is open for this task, refresh it
    if (selectedTaskId === updated.id) {
      queryClient.invalidateQueries({ queryKey: ["task-detail", updated.id, orgId] });
      queryClient.invalidateQueries({ queryKey: ["task-activity", updated.id, orgId] });
    }
  };

  // Filter tasks
  const filteredTasks = tasks.filter((t) => {
    // Status filter
    if (filterStatus === "active" && !ACTIVE_STATUSES.includes(t.status)) return false;
    if (filterStatus === "closed" && !["closed", "completed"].includes(t.status)) return false;
    if (filterStatus === "cancelled" && t.status !== "cancelled") return false;
    if (!["active", "all", "closed", "cancelled"].includes(filterStatus) && t.status !== filterStatus) return false;
    // Show closed toggle (additive when "active" filter)
    if (filterStatus === "active" && showClosed && CLOSED_STATUSES.includes(t.status)) return true;

    // Priority
    if (filterPriority !== "all" && t.priority !== filterPriority) return false;

    // Assignee
    if (filterAssignee !== "all") {
      if (filterAssignee === "__unassigned__") {
        if (t.assigneeId) return false;
      } else if (t.assigneeId !== filterAssignee) {
        return false;
      }
    }

    // Search
    if (search.trim()) {
      const q = search.toLowerCase();
      if (
        !t.title.toLowerCase().includes(q) &&
        !(t.description ?? "").toLowerCase().includes(q) &&
        !(t.taskNumber ?? "").toLowerCase().includes(q) &&
        !(t.assigneeName ?? "").toLowerCase().includes(q)
      )
        return false;
    }

    return true;
  });

  const hasActiveFilters =
    search || filterStatus !== "active" || filterPriority !== "all" || filterAssignee !== "all" || showClosed;

  const clearFilters = () => {
    setSearch("");
    setFilterStatus("active");
    setFilterPriority("all");
    setFilterAssignee("all");
    setShowClosed(false);
  };

  return (
    <TooltipProvider>
      <div className="space-y-4">
        {/* Description */}
        <p className="text-sm text-muted-foreground">
          Track one-time work associated with this control. Use Monitoring for recurring activities and POA&amp;M for formal remediation items.
        </p>

        {/* Summary cards */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
          {[
            { label: "Active", value: summary.active, color: "text-blue-600" },
            { label: "In Progress", value: summary.inProgress, color: "text-amber-600" },
            { label: "Blocked", value: summary.blocked, color: "text-red-600" },
            { label: "Overdue", value: summary.overdue, color: "text-red-700" },
            { label: "Closed", value: summary.closed, color: "text-emerald-600" },
            { label: "Total", value: summary.total, color: "text-muted-foreground" },
          ].map((c) => (
            <div key={c.label} className="rounded-lg border bg-card px-3 py-2 text-center">
              <p className={cn("text-xl font-bold", c.color)}>{c.value}</p>
              <p className="text-xs text-muted-foreground">{c.label}</p>
            </div>
          ))}
        </div>

        {/* Filter bar + Add button */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[160px]">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search tasks…"
              className="pl-8 h-8 text-sm"
            />
          </div>
          <Select value={filterStatus} onValueChange={setFilterStatus}>
            <SelectTrigger className="h-8 w-[130px] text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="active">Active Tasks</SelectItem>
              <SelectItem value="all">All Tasks</SelectItem>
              <SelectItem value="open">Open</SelectItem>
              <SelectItem value="in_progress">In Progress</SelectItem>
              <SelectItem value="blocked">Blocked</SelectItem>
              <SelectItem value="closed">Closed</SelectItem>
              <SelectItem value="cancelled">Cancelled</SelectItem>
            </SelectContent>
          </Select>
          <Select value={filterPriority} onValueChange={setFilterPriority}>
            <SelectTrigger className="h-8 w-[110px] text-sm">
              <SelectValue placeholder="Priority" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Any Priority</SelectItem>
              {PRIORITIES.map((p) => (
                <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={filterAssignee} onValueChange={setFilterAssignee}>
            <SelectTrigger className="h-8 w-[130px] text-sm">
              <SelectValue placeholder="Assignee" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Any Assignee</SelectItem>
              <SelectItem value="__unassigned__">Unassigned</SelectItem>
              {members.map((m) => (
                <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {hasActiveFilters && (
            <Button variant="ghost" size="sm" className="h-8 px-2 text-muted-foreground" onClick={clearFilters}>
              <X className="h-3.5 w-3.5 mr-1" /> Clear
            </Button>
          )}
          <div className="ml-auto">
            {!isReadOnly && (
              <Button size="sm" onClick={() => setDialog({ type: "add" })}>
                <Plus className="h-4 w-4 mr-1" /> Add Task
              </Button>
            )}
          </div>
        </div>

        {/* Task list */}
        {isLoading ? (
          <div className="py-12 text-center text-muted-foreground text-sm">Loading tasks…</div>
        ) : filteredTasks.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <CheckSquare className="h-10 w-10 mx-auto mb-3 text-muted-foreground/30" />
              {tasks.length === 0 ? (
                <>
                  <p className="font-medium text-muted-foreground">No tasks yet</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    Create tasks to track remediation work, reviews, and compliance activities.
                  </p>
                  {!isReadOnly && (
                    <Button className="mt-4" size="sm" onClick={() => setDialog({ type: "add" })}>
                      <Plus className="h-4 w-4 mr-1" /> Add Task
                    </Button>
                  )}
                </>
              ) : (
                <>
                  <p className="font-medium text-muted-foreground">No tasks match your filters</p>
                  <Button className="mt-3" size="sm" variant="outline" onClick={clearFilters}>
                    Clear Filters
                  </Button>
                </>
              )}
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-2">
            {filteredTasks.map((task) => (
              <TaskRow
                key={task.id}
                task={task}
                isReadOnly={isReadOnly}
                onClick={() => openTask(task.id)}
                onEdit={() => { openTask(task.id); setDialog({ type: "edit", task }); }}
                onStart={() => setDialog({ type: "start", task })}
                onBlock={() => setDialog({ type: "block", task })}
                onResume={() => setDialog({ type: "resume", task })}
                onCloseTask={() => setDialog({ type: "close", task })}
                onReopen={() => setDialog({ type: "reopen", task })}
                onCancel={() => setDialog({ type: "cancel", task })}
              />
            ))}
          </div>
        )}

        {/* Task Detail Drawer */}
        <TaskDrawer
          taskId={selectedTaskId}
          controlId={controlId}
          controlLabel={controlLabel}
          orgId={orgId}
          isReadOnly={isReadOnly}
          onClose={closeDrawer}
          onEdit={(task) => setDialog({ type: "edit", task })}
          onStart={(task) => setDialog({ type: "start", task })}
          onBlock={(task) => setDialog({ type: "block", task })}
          onResume={(task) => setDialog({ type: "resume", task })}
          onClose_task={(task) => setDialog({ type: "close", task })}
          onReopen={(task) => setDialog({ type: "reopen", task })}
          onCancel={(task) => setDialog({ type: "cancel", task })}
          onRefreshList={invalidate}
        />

        {/* Dialogs */}
        {dialog.type === "add" && (
          <TaskFormDialog
            mode="add"
            controlId={controlId}
            controlLabel={controlLabel}
            orgId={orgId}
            members={members}
            onClose={closeDialog}
            onSaved={(t) => { closeDialog(); invalidate(); openTask(t.id); }}
          />
        )}
        {dialog.type === "edit" && (
          <TaskFormDialog
            mode="edit"
            initialTask={dialog.task}
            controlId={controlId}
            controlLabel={controlLabel}
            orgId={orgId}
            members={members}
            onClose={closeDialog}
            onSaved={(t) => { handleLifecycleDone(t); }}
          />
        )}
        {dialog.type === "start" && (
          <StartDialog task={dialog.task} orgId={orgId} controlId={controlId} onClose={closeDialog} onDone={handleLifecycleDone} />
        )}
        {dialog.type === "block" && (
          <BlockDialog task={dialog.task} orgId={orgId} controlId={controlId} onClose={closeDialog} onDone={handleLifecycleDone} />
        )}
        {dialog.type === "resume" && (
          <ResumeDialog task={dialog.task} orgId={orgId} controlId={controlId} onClose={closeDialog} onDone={handleLifecycleDone} />
        )}
        {dialog.type === "close" && (
          <CloseDialog task={dialog.task} orgId={orgId} controlId={controlId} onClose={closeDialog} onDone={handleLifecycleDone} />
        )}
        {dialog.type === "reopen" && (
          <ReopenDialog task={dialog.task} orgId={orgId} controlId={controlId} members={members} onClose={closeDialog} onDone={handleLifecycleDone} />
        )}
        {dialog.type === "cancel" && (
          <CancelDialog task={dialog.task} orgId={orgId} controlId={controlId} onClose={closeDialog} onDone={handleLifecycleDone} />
        )}
      </div>
    </TooltipProvider>
  );
}
