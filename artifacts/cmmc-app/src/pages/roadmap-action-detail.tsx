import { useState, useEffect } from "react";
import { Link, useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useOrg } from "@/context/OrgContext";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  ArrowLeft,
  Target,
  Lightbulb,
  ShieldCheck,
  ListOrdered,
  TestTube,
  FolderSearch,
  FileText,
  CheckSquare,
  ClipboardCheck,
  ChevronRight,
  ChevronDown,
  Zap,
  AlertTriangle,
  Info,
  BookOpen,
  Upload,
  ExternalLink,
  MapPin,
  Cpu,
  ClipboardList,
  CheckCircle2,
  Circle,
  Clock,
  Ban,
  MinusCircle,
  Trash2,
  Pencil,
  Plus,
  Navigation,
  Camera,
  AlertCircle,
  User,
  ArrowRight,
  Eye,
  EyeOff,
  Package,
  HelpCircle,
  Search,
  Link2,
  Unlink,
  XCircle,
  ShieldAlert,
  Lock,
  Send,
} from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

function makeHeaders(orgId: string) {
  const token = localStorage.getItem("auth_token");
  return {
    Authorization: `Bearer ${token}`,
    "X-Organization-ID": orgId,
    "Content-Type": "application/json",
  };
}

interface ControlLink {
  id: string;
  controlRef: string;
  controlTitle: string;
  level: string;
  domain: string;
  supportType: string;
  controlId: string;
}

interface EvidenceLink {
  id: string;
  roadmapEvidenceItemId: string;
  evidenceId: string;
  linkedBy: string | null;
  linkedAt: string;
}

interface EvidenceItem {
  id: string;
  title: string;
  evidenceType: string;
  suggestedFilename: string;
  sourceSystem: string;
  mustShow: string;
  description: string | null;
  isRequired: boolean;
  links: EvidenceLink[];
}

interface ActionDocument {
  id: string;
  title: string;
  docType: string;
}

interface ChecklistItem {
  id: string;
  label: string;
  sortOrder: number;
  isRequired: boolean;
  completed: boolean;
  completedBy: string | null;
  notes: string | null;
}

interface StepProgress {
  id: string;
  status: string;
  completedBy: string | null;
  completedAt: string | null;
  notes: string | null;
  updatedAt: string;
}

interface ProcedureStep {
  id: string;
  actionId: string;
  stepNumber: number;
  title: string;
  purpose: string;
  systemPortal: string;
  navigationPath: string;
  instructions: string;
  recommendedSettings: string | null;
  expectedResult: string;
  evidenceToCapture: string;
  suggestedFilename: string;
  relatedControls: string[];
  ownerRole: string;
  ifThisFails: string;
  isRequired: boolean;
  isCustom: boolean;
  sortOrder: number;
  progress: StepProgress | null;
}

interface Progress {
  status: string;
  owner: string | null;
  targetDate: string | null;
  result: string | null;
  notes: string | null;
  overrideJustification: string | null;
  understandAckAt: string | null;
  understandAckBy: string | null;
  validationNotes: string | null;
  validatedAt: string | null;
  validatedBy: string | null;
}

type StageState = "not_started" | "in_progress" | "complete" | "blocked";

interface ComputedProgress {
  percent: number;
  doneUnits: number;
  totalUnits: number;
  missing: string[];
  stages: {
    understand: StageState;
    steps: StageState;
    evidence: StageState;
    validate: StageState;
    review: StageState;
  };
  steps: { total: number; completed: number };
  evidence: { total: number; completed: number };
  checklist: { total: number; completed: number };
  readyToComplete: boolean;
}

interface ActionDetail {
  id: string;
  title: string;
  category: string;
  phase: number;
  phaseName: string;
  priority: string;
  effort: string;
  impactScore: number;
  purpose: string;
  whyItMatters: string;
  operatingProcedure: string;
  testProcedure: string;
  controls: ControlLink[];
  evidenceItems: EvidenceItem[];
  documents: ActionDocument[];
  checklistItems: ChecklistItem[];
  progress: Progress | null;
  computedProgress: ComputedProgress;
}

const SUPPORT_TYPE_COLORS: Record<string, string> = {
  full_support: "bg-emerald-500/20 text-emerald-300 border-emerald-500/30",
  partial_support: "bg-blue-500/20 text-blue-300 border-blue-500/30",
  evidence_only: "bg-yellow-500/20 text-yellow-300 border-yellow-500/30",
  doc_only: "bg-purple-500/20 text-purple-300 border-purple-500/30",
  monitoring_only: "bg-cyan-500/20 text-cyan-300 border-cyan-500/30",
};

const SUPPORT_TYPE_LABELS: Record<string, string> = {
  full_support: "Full Support",
  partial_support: "Partial Support",
  evidence_only: "Evidence Only",
  doc_only: "Documentation Only",
  monitoring_only: "Monitoring Only",
};

const PRIORITY_COLORS: Record<string, string> = {
  critical: "bg-red-500/20 text-red-300 border-red-500/30",
  high: "bg-orange-500/20 text-orange-300 border-orange-500/30",
  medium: "bg-yellow-500/20 text-yellow-300 border-yellow-500/30",
  low: "bg-slate-500/20 text-slate-300 border-slate-500/30",
};

const STATUS_OPTIONS = [
  { value: "not_started", label: "Not Started" },
  { value: "in_progress", label: "In Progress" },
  { value: "evidence_needed", label: "Evidence Needed" },
  { value: "ready_for_review", label: "Ready for Review" },
  { value: "complete", label: "Complete" },
  { value: "blocked", label: "Blocked" },
];

const RESULT_OPTIONS = [
  { value: "passed", label: "Passed" },
  { value: "passed_with_exceptions", label: "Passed with Exceptions" },
  { value: "failed", label: "Failed" },
  { value: "needs_follow_up", label: "Needs Follow-Up" },
];

const STEP_STATUS_OPTIONS = [
  { value: "not_started", label: "Not Started" },
  { value: "in_progress", label: "In Progress" },
  { value: "complete", label: "Complete" },
  { value: "blocked", label: "Blocked" },
  { value: "not_applicable", label: "N/A" },
];

const STEP_STATUS_CONFIG: Record<
  string,
  { label: string; color: string; bg: string; Icon: React.ElementType }
> = {
  not_started: {
    label: "Not Started",
    color: "text-slate-400",
    bg: "bg-slate-500/15 border-slate-500/30",
    Icon: Circle,
  },
  in_progress: {
    label: "In Progress",
    color: "text-blue-400",
    bg: "bg-blue-500/15 border-blue-500/30",
    Icon: Clock,
  },
  complete: {
    label: "Complete",
    color: "text-emerald-400",
    bg: "bg-emerald-500/15 border-emerald-500/30",
    Icon: CheckCircle2,
  },
  blocked: {
    label: "Blocked",
    color: "text-red-400",
    bg: "bg-red-500/15 border-red-500/30",
    Icon: Ban,
  },
  not_applicable: {
    label: "N/A",
    color: "text-slate-500",
    bg: "bg-slate-600/15 border-slate-600/30",
    Icon: MinusCircle,
  },
};

function StepList({ text }: { text: string }) {
  const lines = text.split("\n").filter(Boolean);
  return (
    <ol className="space-y-2">
      {lines.map((line, i) => {
        const match = line.match(/^\d+\.\s+(.+)/);
        const content = match ? match[1] : line;
        const num = i + 1;
        return (
          <li key={i} className="flex gap-3 text-sm">
            <span className="shrink-0 w-6 h-6 rounded-full bg-primary/10 border border-primary/20 text-primary text-xs font-bold flex items-center justify-center mt-0.5">
              {num}
            </span>
            <span className="text-muted-foreground leading-relaxed">{content}</span>
          </li>
        );
      })}
    </ol>
  );
}

function DetailSection({
  icon: Icon,
  label,
  children,
  className,
}: {
  icon: React.ElementType;
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <div className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
        <Icon className="h-3.5 w-3.5" />
        {label}
      </div>
      <div className="text-sm text-foreground/80 leading-relaxed">{children}</div>
    </div>
  );
}

function MultiLineText({ text }: { text: string }) {
  const lines = text.split("\n").filter(Boolean);
  if (lines.length <= 1) return <span>{text}</span>;
  return (
    <ul className="space-y-1 mt-0.5">
      {lines.map((line, i) => {
        const content = line.replace(/^[-•]\s*/, "").replace(/^\d+\.\s*/, "");
        const isBullet = /^[-•]/.test(line);
        const isNum = /^\d+\./.test(line);
        return (
          <li key={i} className="flex gap-2">
            <span className="shrink-0 text-muted-foreground mt-0.5">
              {isBullet ? "•" : isNum ? `${i + 1}.` : "•"}
            </span>
            <span>{content}</span>
          </li>
        );
      })}
    </ul>
  );
}

function InfoTip({ text }: { text: string }) {
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <HelpCircle className="h-3.5 w-3.5 text-muted-foreground cursor-help shrink-0 inline" />
        </TooltipTrigger>
        <TooltipContent className="max-w-xs text-xs">{text}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

const STAGE_KEYS = ["understand", "steps", "evidence", "validate", "review"] as const;
type StageKey = (typeof STAGE_KEYS)[number];

const STAGE_CONFIG: Record<StageKey, { label: string; description: string; tab: string }> = {
  understand: { label: "Understand", description: "Read the overview and acknowledge", tab: "overview" },
  steps: { label: "Perform Steps", description: "Complete implementation steps", tab: "procedure" },
  evidence: { label: "Upload Evidence", description: "Collect and link evidence", tab: "evidence" },
  validate: { label: "Validate", description: "Run validation and testing", tab: "test" },
  review: { label: "Review & Complete", description: "Mark complete or request review", tab: "checklist" },
};

function StageTracker({
  stages,
  onTabChange,
}: {
  stages: ComputedProgress["stages"];
  onTabChange: (tab: string) => void;
}) {
  return (
    <div className="flex items-start gap-0 overflow-x-auto">
      {STAGE_KEYS.map((key, i) => {
        const state = stages[key];
        const done = state === "complete";
        const blocked = state === "blocked";
        const active = state === "in_progress";
        const cfg = STAGE_CONFIG[key];
        return (
          <div key={key} className="flex items-start flex-1 min-w-0">
            <div className="flex flex-col items-center min-w-0 flex-1">
              <div className="flex items-center w-full">
                {i > 0 && (
                  <div
                    className={cn(
                      "h-0.5 flex-1",
                      done || active ? "bg-primary" : blocked ? "bg-red-500/60" : "bg-border"
                    )}
                  />
                )}
                <button
                  type="button"
                  onClick={() => onTabChange(cfg.tab)}
                  className={cn(
                    "shrink-0 w-7 h-7 rounded-full border-2 flex items-center justify-center text-xs font-bold transition-colors",
                    blocked
                      ? "bg-red-500/10 border-red-500 text-red-400"
                      : done
                      ? "bg-primary border-primary text-primary-foreground"
                      : active
                      ? "border-primary text-primary bg-primary/10"
                      : "border-border text-muted-foreground bg-background hover:border-primary/50"
                  )}
                >
                  {blocked ? (
                    <AlertTriangle className="h-3.5 w-3.5" />
                  ) : done ? (
                    <CheckCircle2 className="h-4 w-4" />
                  ) : (
                    i + 1
                  )}
                </button>
                {i < STAGE_KEYS.length - 1 && (
                  <div
                    className={cn(
                      "h-0.5 flex-1",
                      done ? "bg-primary" : "bg-border"
                    )}
                  />
                )}
              </div>
              <div className="text-center mt-1.5 px-1">
                <div
                  className={cn(
                    "text-[11px] font-semibold leading-tight",
                    blocked
                      ? "text-red-400"
                      : active
                      ? "text-primary"
                      : done
                      ? "text-foreground/70"
                      : "text-muted-foreground"
                  )}
                >
                  {cfg.label}
                </div>
                {(active || blocked) && (
                  <div className="text-[10px] text-muted-foreground mt-0.5 hidden sm:block">
                    {cfg.description}
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function WhatYouWillProduce({
  evidenceItems,
  documents,
  controlsCount,
}: {
  evidenceItems: Array<{ id: string; title: string; evidenceType: string }>;
  documents: Array<{ id: string; title: string; docType: string }>;
  controlsCount: number;
}) {
  if (evidenceItems.length === 0 && documents.length === 0) return null;

  return (
    <div className="rounded-lg border bg-card overflow-hidden">
      <div className="p-4 border-b bg-muted/20 flex items-center gap-2">
        <Package className="h-4 w-4 text-primary" />
        <h3 className="font-semibold text-sm">What You Will Produce</h3>
        <span className="text-xs text-muted-foreground">
          — outputs from completing this action
        </span>
      </div>
      <div className="p-4 grid grid-cols-1 md:grid-cols-3 gap-4">
        {evidenceItems.length > 0 && (
          <div>
            <div className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
              <Camera className="h-3.5 w-3.5" />
              Evidence Files ({evidenceItems.length})
            </div>
            <ul className="space-y-1.5">
              {evidenceItems.map((ev) => (
                <li key={ev.id} className="flex items-start gap-2 text-xs">
                  <span className="shrink-0 mt-0.5 text-emerald-400">•</span>
                  <span className="text-foreground/80">{ev.title}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
        {documents.length > 0 && (
          <div>
            <div className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
              <FileText className="h-3.5 w-3.5" />
              Documents ({documents.length})
            </div>
            <ul className="space-y-1.5">
              {documents.map((doc) => (
                <li key={doc.id} className="flex items-start gap-2 text-xs">
                  <span className="shrink-0 mt-0.5 text-blue-400">•</span>
                  <span className="text-foreground/80">{doc.title}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
        <div>
          <div className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
            <ShieldCheck className="h-3.5 w-3.5" />
            Controls Supported
          </div>
          <p className="text-xs text-foreground/80">
            Completing this action contributes evidence and documentation to{" "}
            <strong>{controlsCount}</strong> CMMC L2 control
            {controlsCount !== 1 ? "s" : ""}.
          </p>
        </div>
      </div>
    </div>
  );
}

function nextStepForClient(progress: ComputedProgress): {
  label: string;
  tab: string;
} {
  if (progress.stages.understand !== "complete") {
    return { label: "Acknowledge the Overview", tab: "overview" };
  }
  if (progress.stages.steps !== "complete") {
    return { label: "Go to First Incomplete Step", tab: "procedure" };
  }
  if (progress.stages.evidence !== "complete") {
    return { label: "Upload Missing Evidence", tab: "evidence" };
  }
  if (progress.checklist.total > progress.checklist.completed) {
    return { label: "Complete Remaining Checklist Items", tab: "checklist" };
  }
  if (progress.stages.validate !== "complete") {
    return { label: "Record Validation Result", tab: "test" };
  }
  return { label: "Mark Ready for Review", tab: "checklist" };
}

function NextStepBanner({
  status,
  computedProgress,
  onTabChange,
}: {
  status: string;
  computedProgress: ComputedProgress;
  onTabChange: (tab: string) => void;
}) {
  if (status === "complete") return null;

  let message = "";
  let buttonLabel = "";
  let targetTab = "";
  let variant: "default" | "warning" | "info" = "info";

  if (status === "blocked") {
    message =
      "This action is blocked. Resolve the blocker and update the status to continue.";
    buttonLabel = "";
    targetTab = "";
    variant = "warning";
  } else if (status === "ready_for_review") {
    message = "This action is ready for review. A reviewer needs to approve it.";
    buttonLabel = "";
    targetTab = "";
    variant = "info";
  } else {
    const next = nextStepForClient(computedProgress);
    message = next.label;
    buttonLabel = next.label;
    targetTab = next.tab;
    variant = computedProgress.stages.evidence === "in_progress" ? "warning" : "info";
  }

  const borderColor =
    variant === "warning"
      ? "border-yellow-500/30 bg-yellow-500/5"
      : "border-blue-500/30 bg-blue-500/5";
  const textColor =
    variant === "warning" ? "text-yellow-300" : "text-blue-300";

  return (
    <div
      className={cn(
        "rounded-lg border p-3 flex items-center justify-between gap-3",
        borderColor
      )}
    >
      <div className="flex items-center gap-2">
        <ArrowRight
          className={cn("h-4 w-4 shrink-0", textColor)}
        />
        <div className="text-xs">
          <span className={cn("font-semibold", textColor)}>Next Step: </span>
          <span className="text-muted-foreground">{message}</span>
        </div>
      </div>
      {buttonLabel && targetTab && (
        <Button
          size="sm"
          variant="outline"
          className={cn(
            "shrink-0 h-7 text-xs gap-1.5",
            variant === "warning"
              ? "border-yellow-500/30 text-yellow-300 hover:bg-yellow-500/10"
              : "border-blue-500/30 text-blue-300 hover:bg-blue-500/10"
          )}
          onClick={() => onTabChange(targetTab)}
        >
          {buttonLabel}
          <ChevronRight className="h-3 w-3" />
        </Button>
      )}
    </div>
  );
}

function ProgressSummaryPanel({
  computedProgress,
  onTabChange,
}: {
  computedProgress: ComputedProgress;
  onTabChange: (tab: string) => void;
}) {
  const { percent, missing, readyToComplete } = computedProgress;
  return (
    <div className="rounded-lg border bg-card p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
          Completion
        </div>
        <div className="text-lg font-bold tabular-nums">{percent}%</div>
      </div>
      <div className="h-2 rounded-full bg-muted overflow-hidden">
        <div
          className={cn(
            "h-full rounded-full transition-all",
            readyToComplete ? "bg-emerald-500" : "bg-primary"
          )}
          style={{ width: `${percent}%` }}
        />
      </div>
      <div className="grid grid-cols-3 gap-2 text-center text-[11px] text-muted-foreground">
        <div>
          <div className="font-semibold text-foreground">
            {computedProgress.steps.completed}/{computedProgress.steps.total}
          </div>
          Steps
        </div>
        <div>
          <div className="font-semibold text-foreground">
            {computedProgress.evidence.completed}/{computedProgress.evidence.total}
          </div>
          Evidence
        </div>
        <div>
          <div className="font-semibold text-foreground">
            {computedProgress.checklist.completed}/{computedProgress.checklist.total}
          </div>
          Checklist
        </div>
      </div>
      {readyToComplete ? (
        <div className="flex items-center gap-1.5 text-xs text-emerald-400 font-medium pt-1">
          <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
          Ready to mark complete
        </div>
      ) : missing.length > 0 ? (
        <div className="pt-1 space-y-1">
          <div className="text-[11px] font-semibold text-yellow-300 uppercase tracking-wide flex items-center gap-1">
            <AlertTriangle className="h-3 w-3" />
            Blocking Items
          </div>
          <ul className="space-y-1">
            {missing.map((m, i) => (
              <li key={i} className="text-[11px] text-muted-foreground leading-snug">
                • {m}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      <Button
        size="sm"
        variant="outline"
        className="w-full h-7 text-xs gap-1.5"
        onClick={() => onTabChange(nextStepForClient(computedProgress).tab)}
      >
        {nextStepForClient(computedProgress).label}
        <ChevronRight className="h-3 w-3" />
      </Button>
    </div>
  );
}

// ── OverrideDialog ───────────────────────────────────────────────────────────
function OverrideDialog({
  open,
  onClose,
  onSubmit,
  isPending,
}: {
  open: boolean;
  onClose: () => void;
  onSubmit: (data: { justification: string; approvedBy: string; approvedDate: string }) => void;
  isPending: boolean;
}) {
  const [justification, setJustification] = useState("");
  const [approvedBy, setApprovedBy] = useState("");
  const [approvedDate, setApprovedDate] = useState("");

  const canSubmit = justification.trim() && approvedBy.trim() && approvedDate;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Record Legacy Completion Override</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label>Justification <span className="text-red-400">*</span></Label>
            <Textarea
              placeholder="Explain why this action is marked complete despite missing prerequisites…"
              value={justification}
              onChange={(e) => setJustification(e.target.value)}
              className="min-h-20 resize-none text-sm"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Approved By <span className="text-red-400">*</span></Label>
            <Input
              placeholder="Name of approver"
              value={approvedBy}
              onChange={(e) => setApprovedBy(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Approved Date <span className="text-red-400">*</span></Label>
            <Input
              type="date"
              value={approvedDate}
              onChange={(e) => setApprovedDate(e.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            disabled={!canSubmit || isPending}
            onClick={() => onSubmit({ justification, approvedBy, approvedDate })}
          >
            {isPending ? "Saving…" : "Submit Override"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── UploadEvidenceModal ───────────────────────────────────────────────────────
function UploadEvidenceModal({
  open,
  onClose,
  item,
  actionId,
  orgId,
  controlLinks,
  onSuccess,
}: {
  open: boolean;
  onClose: () => void;
  item: EvidenceItem | null;
  actionId: string;
  orgId: string;
  controlLinks: ControlLink[];
  onSuccess: () => void;
}) {
  const { toast } = useToast();
  const [title, setTitle] = useState(item?.title ?? "");
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [file, setFile] = useState<File | null>(null);

  // Sync title when item changes
  const itemId = item?.id;
  useState(() => {
    if (item) setTitle(item.title);
  });

  const handleSubmit = async () => {
    if (!file || !item) return;
    setUploadError(null);
    setUploading(true);
    try {
      const token = localStorage.getItem("auth_token");
      const formData = new FormData();
      formData.append("file", file);
      formData.append("title", title || item.title);
      formData.append("evidenceType", item.evidenceType);
      formData.append("suggestedFilename", item.suggestedFilename || file.name);

      const uploadRes = await fetch("/api/evidence", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "X-Organization-ID": orgId,
        },
        body: formData,
      });
      if (!uploadRes.ok) {
        const err = await uploadRes.json().catch(() => ({})) as any;
        throw new Error(err.error || "Upload failed");
      }
      const newEvidence = await uploadRes.json() as { id: string };

      // Link to the roadmap evidence item
      const linkRes = await fetch(`/api/roadmap/evidence-items/${item.id}/link`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "X-Organization-ID": orgId,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ evidenceId: newEvidence.id }),
      });
      if (!linkRes.ok) throw new Error("Evidence uploaded but linking failed");

      toast({ title: "Evidence uploaded and linked" });
      onSuccess();
      onClose();
    } catch (err: any) {
      setUploadError(err.message ?? "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  if (!item) return null;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Upload Evidence for {item.title}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label>Title</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Type</Label>
              <div className="text-sm font-mono bg-muted/30 border rounded px-2 py-1.5">{item.evidenceType}</div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Suggested Filename</Label>
              <div className="text-xs font-mono bg-muted/30 border rounded px-2 py-1.5 truncate">{item.suggestedFilename || "—"}</div>
            </div>
          </div>
          {controlLinks.length > 0 && (
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Linked Controls</Label>
              <div className="flex flex-wrap gap-1.5">
                {controlLinks.map((c) => (
                  <span
                    key={c.id}
                    className="text-[10px] font-mono px-2 py-0.5 rounded border border-primary/30 bg-primary/10 text-primary"
                  >
                    {c.controlRef}
                  </span>
                ))}
              </div>
            </div>
          )}
          <div className="space-y-1.5">
            <Label>File <span className="text-red-400">*</span></Label>
            <Input
              type="file"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              className="text-sm"
            />
          </div>
          {uploadError && (
            <div className="flex items-center gap-2 text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded p-2">
              <AlertCircle className="h-3.5 w-3.5 shrink-0" />
              {uploadError}
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={uploading}>Cancel</Button>
          <Button disabled={!file || uploading} onClick={handleSubmit} className="gap-1.5">
            <Upload className="h-3.5 w-3.5" />
            {uploading ? "Uploading…" : "Upload & Link"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── NextStepActionBar ─────────────────────────────────────────────────────────
function NextStepActionBar({
  localStatus,
  computedProgress,
  userRole,
  onTabChange,
  onReopenAction,
  onSubmitForReview,
  onApproveComplete,
  isSaving,
}: {
  localStatus: string;
  computedProgress: ComputedProgress;
  userRole: string | undefined;
  onTabChange: (tab: string) => void;
  onReopenAction: () => void;
  onSubmitForReview: () => void;
  onApproveComplete: () => void;
  isSaving: boolean;
}) {
  const { stages, readyToComplete, missing } = computedProgress;
  const isPrivileged = userRole === "admin" || userRole === "compliance_manager";
  const [showMissing, setShowMissing] = useState(false);

  let content: React.ReactNode = null;

  if (localStatus === "complete") {
    if (isPrivileged) {
      content = (
        <Button
          size="sm"
          variant="outline"
          className="w-full gap-1.5 text-xs"
          onClick={onReopenAction}
          disabled={isSaving}
        >
          <ArrowRight className="h-3.5 w-3.5 rotate-180" />
          Reopen Action
        </Button>
      );
    }
  } else if (stages.understand !== "complete") {
    content = (
      <Button
        size="sm"
        className="w-full gap-1.5 text-xs"
        onClick={() => onTabChange("overview")}
      >
        <BookOpen className="h-3.5 w-3.5" />
        Acknowledge Overview
        <ChevronRight className="h-3 w-3 ml-auto" />
      </Button>
    );
  } else if (stages.steps !== "complete") {
    content = (
      <Button
        size="sm"
        className="w-full gap-1.5 text-xs"
        onClick={() => onTabChange("procedure")}
      >
        <ListOrdered className="h-3.5 w-3.5" />
        Go to First Incomplete Step
        <ChevronRight className="h-3 w-3 ml-auto" />
      </Button>
    );
  } else if (stages.evidence !== "complete") {
    content = (
      <Button
        size="sm"
        className="w-full gap-1.5 text-xs"
        onClick={() => onTabChange("evidence")}
      >
        <FolderSearch className="h-3.5 w-3.5" />
        Upload Missing Evidence
        <ChevronRight className="h-3 w-3 ml-auto" />
      </Button>
    );
  } else if (stages.validate !== "complete") {
    content = (
      <Button
        size="sm"
        className="w-full gap-1.5 text-xs"
        onClick={() => onTabChange("test")}
      >
        <TestTube className="h-3.5 w-3.5" />
        Record Validation Result
        <ChevronRight className="h-3 w-3 ml-auto" />
      </Button>
    );
  } else if (!readyToComplete) {
    content = (
      <div className="space-y-2">
        <Button
          size="sm"
          variant="outline"
          className="w-full gap-1.5 text-xs border-yellow-500/30 text-yellow-300"
          onClick={() => setShowMissing((v) => !v)}
          disabled
        >
          <AlertTriangle className="h-3.5 w-3.5" />
          What&apos;s Missing ({missing.length} item{missing.length !== 1 ? "s" : ""})
        </Button>
        {showMissing && missing.length > 0 && (
          <ul className="text-[11px] space-y-0.5 text-muted-foreground pl-2">
            {missing.map((m, i) => <li key={i}>• {m}</li>)}
          </ul>
        )}
      </div>
    );
  } else if (localStatus !== "ready_for_review") {
    content = (
      <Button
        size="sm"
        className="w-full gap-1.5 text-xs bg-primary"
        onClick={onSubmitForReview}
        disabled={isSaving}
      >
        <Send className="h-3.5 w-3.5" />
        Submit for Review
      </Button>
    );
  } else if (isPrivileged) {
    content = (
      <Button
        size="sm"
        className="w-full gap-1.5 text-xs bg-emerald-600 hover:bg-emerald-500 text-white"
        onClick={onApproveComplete}
        disabled={isSaving}
      >
        <CheckCircle2 className="h-3.5 w-3.5" />
        Approve Complete
      </Button>
    );
  } else {
    content = (
      <Button size="sm" variant="outline" className="w-full gap-1.5 text-xs" disabled>
        <Clock className="h-3.5 w-3.5" />
        Awaiting Approval
      </Button>
    );
  }

  if (!content) return null;

  return (
    <div className="space-y-2">
      <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
        <Zap className="h-3 w-3 text-primary" />
        Next Step
      </div>
      {content}
    </div>
  );
}

const STATUS_DISPLAY_CONFIG: Record<
  string,
  { label: string; color: string; bg: string; borderColor: string }
> = {
  not_started: {
    label: "Not Started",
    color: "text-muted-foreground",
    bg: "bg-muted/30",
    borderColor: "border-border",
  },
  in_progress: {
    label: "In Progress",
    color: "text-blue-400",
    bg: "bg-blue-500/10",
    borderColor: "border-blue-500/30",
  },
  evidence_needed: {
    label: "Evidence Needed",
    color: "text-amber-400",
    bg: "bg-amber-500/10",
    borderColor: "border-amber-500/30",
  },
  ready_for_review: {
    label: "Ready for Review",
    color: "text-primary",
    bg: "bg-primary/10",
    borderColor: "border-primary/30",
  },
  complete: {
    label: "Complete",
    color: "text-emerald-400",
    bg: "bg-emerald-500/10",
    borderColor: "border-emerald-500/30",
  },
  blocked: {
    label: "Blocked",
    color: "text-red-400",
    bg: "bg-red-500/10",
    borderColor: "border-red-500/30",
  },
};

function ActionProgressPanel({
  computedProgress,
  progress,
  localOwner,
  localTargetDate,
  localNotes,
  localStatus,
  overrideJustification,
  canUpdateStatus,
  canMarkComplete,
  userRole,
  setLocalOwner,
  setLocalTargetDate,
  setLocalNotes,
  setLocalStatus,
  setOverrideJustification,
  onSaveProgress,
  onReopenAction,
  onSubmitForReview,
  onApproveComplete,
  isSaving,
  onTabChange,
}: {
  computedProgress: ComputedProgress;
  progress: Progress | null;
  localOwner: string | null;
  localTargetDate: string | null;
  localNotes: string | null;
  localStatus: string;
  overrideJustification: string;
  canUpdateStatus: boolean;
  canMarkComplete: boolean;
  userRole: string | undefined;
  setLocalOwner: (v: string) => void;
  setLocalTargetDate: (v: string) => void;
  setLocalNotes: (v: string) => void;
  setLocalStatus: (v: string | null) => void;
  setOverrideJustification: (v: string) => void;
  onSaveProgress: () => void;
  onReopenAction: () => void;
  onSubmitForReview: () => void;
  onApproveComplete: () => void;
  isSaving: boolean;
  onTabChange: (tab: string) => void;
}) {
  const { percent, stages, steps, evidence, readyToComplete, missing } = computedProgress;
  const statusCfg = STATUS_DISPLAY_CONFIG[localStatus] ?? STATUS_DISPLAY_CONFIG.not_started;

  return (
    <div className="rounded-lg border bg-card overflow-hidden">
      {/* Card header */}
      <div className="p-4 border-b bg-muted/20 flex items-center gap-2">
        <ClipboardCheck className="h-4 w-4 text-primary" />
        <h3 className="font-semibold text-sm">Action Progress</h3>
      </div>

      <div className="p-4 space-y-4">
        {/* Big percent + bar */}
        <div className="space-y-2">
          <div className="flex items-end justify-between">
            <span className="text-3xl font-bold tabular-nums">{percent}%</span>
            <span
              className={cn(
                "text-xs font-semibold px-2 py-0.5 rounded border",
                statusCfg.bg,
                statusCfg.color,
                statusCfg.borderColor
              )}
            >
              {statusCfg.label}
            </span>
          </div>
          <div className="h-2 rounded-full bg-muted overflow-hidden">
            <div
              className={cn(
                "h-full rounded-full transition-all",
                readyToComplete ? "bg-emerald-500" : "bg-primary"
              )}
              style={{ width: `${percent}%` }}
            />
          </div>
        </div>

        {/* Stage breakdown */}
        <div className="space-y-2">
          {/* Understand */}
          <div className="flex items-center justify-between text-xs">
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <Lightbulb className="h-3.5 w-3.5" />
              Understand
            </div>
            {stages.understand === "complete" ? (
              <span className="flex items-center gap-1 text-emerald-400 font-medium">
                <CheckCircle2 className="h-3 w-3" />
                Complete
              </span>
            ) : (
              <span className="text-muted-foreground">Incomplete</span>
            )}
          </div>

          {/* Steps */}
          <div className="flex items-center justify-between text-xs">
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <ListOrdered className="h-3.5 w-3.5" />
              Steps
            </div>
            <span
              className={cn(
                "font-medium",
                steps.total > 0 && steps.completed === steps.total
                  ? "text-emerald-400"
                  : "text-foreground/70"
              )}
            >
              {steps.completed} / {steps.total} complete
            </span>
          </div>

          {/* Evidence */}
          <div className="flex items-center justify-between text-xs">
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <FolderSearch className="h-3.5 w-3.5" />
              Evidence
            </div>
            <span
              className={cn(
                "font-medium",
                evidence.total > 0 && evidence.completed === evidence.total
                  ? "text-emerald-400"
                  : "text-foreground/70"
              )}
            >
              {evidence.completed} / {evidence.total} linked
            </span>
          </div>

          {/* Validation */}
          <div className="flex items-center justify-between text-xs">
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <TestTube className="h-3.5 w-3.5" />
              Validation
            </div>
            {stages.validate === "complete" ? (
              <span className="flex items-center gap-1 text-emerald-400 font-medium">
                <CheckCircle2 className="h-3 w-3" />
                Complete
              </span>
            ) : (
              <span className="text-muted-foreground">Incomplete</span>
            )}
          </div>

          {/* Review */}
          <div className="flex items-center justify-between text-xs">
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <ClipboardList className="h-3.5 w-3.5" />
              Review
            </div>
            {stages.review === "complete" ? (
              <span className="flex items-center gap-1 text-emerald-400 font-medium">
                <CheckCircle2 className="h-3 w-3" />
                Complete
              </span>
            ) : stages.review === "in_progress" ? (
              <span className="flex items-center gap-1 text-blue-400 font-medium">
                <Clock className="h-3 w-3" />
                In Progress
              </span>
            ) : (
              <span className="text-muted-foreground">Not Started</span>
            )}
          </div>
        </div>

        <div className="border-t border-border" />

        {/* Next step action bar */}
        <NextStepActionBar
          localStatus={localStatus}
          computedProgress={computedProgress}
          userRole={userRole}
          onTabChange={onTabChange}
          onReopenAction={onReopenAction}
          onSubmitForReview={onSubmitForReview}
          onApproveComplete={onApproveComplete}
          isSaving={isSaving}
        />

        <div className="border-t border-border" />

        {/* Assignment fields */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              Assignment
            </div>
            {!canUpdateStatus && <Lock className="h-3 w-3 text-muted-foreground" />}
          </div>

          <Select
            value={localStatus}
            onValueChange={setLocalStatus}
            disabled={!canUpdateStatus}
          >
            <SelectTrigger className="h-8 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {STATUS_OPTIONS.filter(
                (o) => o.value !== "complete"
              ).map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <div className="flex items-center gap-1.5">
            <User className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            <Input
              placeholder="Owner"
              value={localOwner ?? ""}
              onChange={(e) => setLocalOwner(e.target.value)}
              className="h-8 text-sm"
              disabled={!canUpdateStatus}
            />
          </div>

          <div className="flex items-center gap-1.5">
            <Clock className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            <Input
              type="date"
              value={localTargetDate ?? ""}
              onChange={(e) => setLocalTargetDate(e.target.value)}
              className="h-8 text-sm"
              disabled={!canUpdateStatus}
            />
          </div>

          <Textarea
            placeholder="Notes…"
            value={localNotes ?? ""}
            onChange={(e) => setLocalNotes(e.target.value)}
            className="text-sm min-h-16 resize-none"
            disabled={!canUpdateStatus}
          />

          {localStatus === "complete" && !readyToComplete && (
            <div className="space-y-1.5 rounded border border-yellow-500/30 bg-yellow-500/5 p-2">
              <div className="text-[11px] font-semibold text-yellow-300 flex items-center gap-1">
                <AlertTriangle className="h-3 w-3" />
                Prerequisites not met
              </div>
              <div className="text-[10px] text-muted-foreground leading-snug">
                {missing.join("; ")}
              </div>
              <Textarea
                placeholder="Override justification (required)…"
                value={overrideJustification}
                onChange={(e) => setOverrideJustification(e.target.value)}
                className="text-xs min-h-14 resize-none"
              />
            </div>
          )}

          <Button
            size="sm"
            className="w-full"
            onClick={onSaveProgress}
            disabled={
              isSaving ||
              !canUpdateStatus ||
              (localStatus === "complete" &&
                !readyToComplete &&
                !overrideJustification.trim())
            }
          >
            Save Progress
          </Button>
        </div>

        {/* How progress is calculated tooltip */}
        <div className="border-t border-border pt-2">
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <button className="flex items-center gap-1.5 text-[11px] text-muted-foreground hover:text-foreground transition-colors">
                  <HelpCircle className="h-3 w-3 shrink-0" />
                  How progress is calculated
                </button>
              </TooltipTrigger>
              <TooltipContent className="max-w-xs text-xs space-y-1 p-3">
                <p className="font-semibold mb-1">Stage Weights</p>
                <div className="grid grid-cols-2 gap-x-3 gap-y-0.5">
                  <span className="text-muted-foreground">Understand</span>
                  <span className="font-medium">10%</span>
                  <span className="text-muted-foreground">Steps</span>
                  <span className="font-medium">35%</span>
                  <span className="text-muted-foreground">Evidence &amp; Docs</span>
                  <span className="font-medium">25%</span>
                  <span className="text-muted-foreground">Validation</span>
                  <span className="font-medium">15%</span>
                  <span className="text-muted-foreground">Checklist/Review</span>
                  <span className="font-medium">15%</span>
                </div>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      </div>
    </div>
  );
}

const RESULT_CONFIG: Record<
  string,
  { label: string; Icon: typeof CheckCircle2; color: string; bg: string }
> = {
  passed: {
    label: "Passed",
    Icon: CheckCircle2,
    color: "text-emerald-400",
    bg: "bg-emerald-500/10 border-emerald-500/30",
  },
  passed_with_exceptions: {
    label: "Passed with Exceptions",
    Icon: AlertTriangle,
    color: "text-yellow-300",
    bg: "bg-yellow-500/10 border-yellow-500/30",
  },
  failed: {
    label: "Failed",
    Icon: XCircle,
    color: "text-red-400",
    bg: "bg-red-500/10 border-red-500/30",
  },
  needs_follow_up: {
    label: "Needs Follow-Up",
    Icon: ShieldAlert,
    color: "text-blue-300",
    bg: "bg-blue-500/10 border-blue-500/30",
  },
};

function ValidationPanel({
  actionId,
  orgId,
  progress,
  canValidate,
}: {
  actionId: string;
  orgId: string;
  progress: Progress | null;
  canValidate: boolean;
}) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [result, setResult] = useState<string | null>(progress?.result ?? null);
  const [notes, setNotes] = useState(progress?.validationNotes ?? "");

  const validationMutation = useMutation({
    mutationFn: async () => {
      if (!result) throw new Error("Select a result");
      const res = await fetch(`/api/roadmap/actions/${actionId}/validation`, {
        method: "POST",
        headers: makeHeaders(orgId),
        body: JSON.stringify({ result, validationNotes: notes || null }),
      });
      if (!res.ok) throw new Error("Failed to save validation");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["roadmap-action", actionId] });
      queryClient.invalidateQueries({ queryKey: ["roadmap-actions"] });
      toast({ title: "Validation result saved" });
    },
    onError: (err: Error) =>
      toast({
        title: "Failed to save validation",
        description: err.message,
        variant: "destructive",
      }),
  });

  const needsNotes = result === "failed";
  const canSubmit = !!result && (!needsNotes || notes.trim().length > 0);

  return (
    <div className="rounded-lg border bg-card p-5 space-y-4">
      <div className="flex items-center gap-2 text-sm font-semibold">
        <TestTube className="h-4 w-4 text-primary" />
        Record Validation Result
      </div>

      {progress?.validatedAt && progress.result && (
        <div
          className={cn(
            "rounded border px-3 py-2 flex items-start gap-2 text-xs",
            RESULT_CONFIG[progress.result]?.bg
          )}
        >
          {(() => {
            const cfg = RESULT_CONFIG[progress.result!];
            const Ic = cfg?.Icon ?? Info;
            return <Ic className={cn("h-3.5 w-3.5 shrink-0 mt-0.5", cfg?.color)} />;
          })()}
          <div>
            <div className={cn("font-semibold", RESULT_CONFIG[progress.result]?.color)}>
              Last recorded: {RESULT_CONFIG[progress.result]?.label}
            </div>
            <div className="text-muted-foreground mt-0.5">
              {new Date(progress.validatedAt).toLocaleString()}
              {progress.validationNotes ? ` — ${progress.validationNotes}` : ""}
            </div>
          </div>
        </div>
      )}

      {canValidate ? (
        <>
          <div className="flex flex-wrap gap-2">
            {RESULT_OPTIONS.map((opt) => {
              const cfg = RESULT_CONFIG[opt.value];
              const Ic = cfg.Icon;
              const active = result === opt.value;
              return (
                <button
                  key={opt.value}
                  onClick={() => setResult(opt.value)}
                  className={cn(
                    "flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs font-medium transition-all",
                    active
                      ? cn(cfg.bg, cfg.color, "ring-1 ring-offset-1 ring-offset-background ring-current")
                      : "border-border bg-muted/20 text-muted-foreground hover:border-border/80"
                  )}
                >
                  <Ic className="h-3.5 w-3.5" />
                  {opt.label}
                </button>
              );
            })}
          </div>
          <div>
            <Label className="text-xs">
              Validation Notes {needsNotes && <span className="text-red-400">(required for Failed)</span>}
            </Label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Describe what was tested and the outcome…"
              className="mt-1 text-sm min-h-20 resize-none"
            />
          </div>
          {result === "failed" && (
            <div className="flex items-start gap-2 text-xs text-yellow-300 bg-yellow-500/10 border border-yellow-500/20 rounded p-2">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
              <span>
                A failed validation should be tracked with a POA&amp;M. Create one in the{" "}
                <Link href="/poams">
                  <span className="underline cursor-pointer">POA&amp;Ms</span>
                </Link>{" "}
                module referencing this action.
              </span>
            </div>
          )}
          <Button
            size="sm"
            className="gap-1.5"
            disabled={!canSubmit || validationMutation.isPending}
            onClick={() => validationMutation.mutate()}
          >
            <Send className="h-3.5 w-3.5" />
            Save Validation Result
          </Button>
        </>
      ) : (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Lock className="h-3.5 w-3.5" />
          Only compliance managers, reviewers, IT contributors, or admins can record validation results.
        </div>
      )}
    </div>
  );
}

function EvidenceLinkPicker({
  orgId,
  roadmapEvidenceItemId,
  requirementTitle,
  alreadyLinkedIds,
  onLinked,
}: {
  orgId: string;
  roadmapEvidenceItemId: string;
  requirementTitle: string;
  alreadyLinkedIds: Set<string>;
  onLinked: () => void;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const { data: allEvidence = [], isFetching } = useQuery<
    Array<{ id: string; title: string; evidenceType: string; status: string; uploadedAt?: string; owner?: string; createdAt?: string }>
  >({
    queryKey: ["evidence", orgId],
    enabled: open && !!orgId,
    queryFn: async () => {
      const res = await fetch("/api/evidence", { headers: makeHeaders(orgId) });
      if (!res.ok) throw new Error("Failed to load evidence");
      const data = await res.json();
      return Array.isArray(data) ? data : (data.items ?? []);
    },
  });

  const filtered = allEvidence.filter((ev) => {
    if (search && !ev.title.toLowerCase().includes(search.toLowerCase())) return false;
    if (typeFilter !== "all" && ev.evidenceType !== typeFilter) return false;
    if (statusFilter !== "all" && ev.status !== statusFilter) return false;
    return true;
  });

  const evidenceTypes = Array.from(new Set(allEvidence.map((e) => e.evidenceType).filter(Boolean)));

  const linkMutation = useMutation({
    mutationFn: async (evidenceIds: string[]) => {
      await Promise.all(
        evidenceIds.map((evidenceId) =>
          fetch(`/api/roadmap/evidence-items/${roadmapEvidenceItemId}/link`, {
            method: "POST",
            headers: makeHeaders(orgId),
            body: JSON.stringify({ evidenceId }),
          }).then((r) => { if (!r.ok) throw new Error("Failed to link evidence"); })
        )
      );
    },
    onSuccess: () => {
      toast({ title: `${selected.size} evidence item${selected.size !== 1 ? "s" : ""} linked` });
      queryClient.invalidateQueries({ queryKey: ["roadmap-action"] });
      setOpen(false);
      setSearch("");
      setSelected(new Set());
      onLinked();
    },
    onError: () => toast({ title: "Failed to link evidence", variant: "destructive" }),
  });

  const toggleSelect = (id: string) => {
    if (alreadyLinkedIds.has(id)) return;
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) { setSearch(""); setSelected(new Set()); } }}>
      <Button
        variant="outline"
        size="sm"
        className="gap-1.5 shrink-0"
        onClick={() => setOpen(true)}
      >
        <Link2 className="h-3.5 w-3.5" />
        Link Existing
      </Button>
      <DialogContent className="max-w-3xl flex flex-col max-h-[80vh]">
        <DialogHeader>
          <DialogTitle>Link Existing Evidence to {requirementTitle}</DialogTitle>
        </DialogHeader>

        {/* Filters */}
        <div className="flex gap-2 flex-wrap shrink-0">
          <div className="relative flex-1 min-w-48">
            <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search evidence…"
              className="pl-8 h-8 text-sm"
            />
          </div>
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="h-8 text-sm w-40">
              <SelectValue placeholder="All types" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All types</SelectItem>
              {evidenceTypes.map((t) => (
                <SelectItem key={t} value={t}>{t}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="h-8 text-sm w-36">
              <SelectValue placeholder="All statuses" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="archived">Archived</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Evidence list */}
        <div className="flex-1 overflow-y-auto border rounded divide-y min-h-0">
          {isFetching ? (
            <div className="p-8 text-center text-sm text-muted-foreground">Loading evidence…</div>
          ) : filtered.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground">
              No evidence found matching your filters.
            </div>
          ) : (
            filtered.map((ev) => {
              const isLinked = alreadyLinkedIds.has(ev.id);
              const isSelected = selected.has(ev.id);
              return (
                <div
                  key={ev.id}
                  onClick={() => toggleSelect(ev.id)}
                  className={cn(
                    "flex items-center gap-3 p-3 cursor-pointer transition-colors",
                    isLinked
                      ? "opacity-60 cursor-default"
                      : isSelected
                      ? "bg-primary/10 border-l-2 border-l-primary"
                      : "hover:bg-muted/20"
                  )}
                >
                  <Checkbox
                    checked={isLinked || isSelected}
                    disabled={isLinked}
                    onCheckedChange={() => toggleSelect(ev.id)}
                    onClick={(e) => e.stopPropagation()}
                    className="shrink-0"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">{ev.title}</div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      {ev.uploadedAt || ev.createdAt
                        ? new Date(ev.uploadedAt || ev.createdAt!).toLocaleDateString()
                        : "—"}
                      {ev.owner ? ` · ${ev.owner}` : ""}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-[10px] px-1.5 py-0.5 rounded border bg-muted/30 border-border text-muted-foreground">
                      {ev.evidenceType}
                    </span>
                    <span
                      className={cn(
                        "text-[10px] px-1.5 py-0.5 rounded border font-medium",
                        ev.status === "active"
                          ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400"
                          : "bg-slate-500/10 border-slate-500/30 text-slate-400"
                      )}
                    >
                      {ev.status}
                    </span>
                    {isLinked && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded border bg-primary/10 border-primary/30 text-primary font-semibold">
                        Linked
                      </span>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <DialogFooter className="flex items-center justify-between shrink-0 pt-2">
          <span className="text-xs text-muted-foreground">
            {selected.size > 0 ? `${selected.size} selected` : "Select items to link"}
          </span>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button
              disabled={selected.size === 0 || linkMutation.isPending}
              onClick={() => linkMutation.mutate(Array.from(selected))}
            >
              {linkMutation.isPending ? "Linking…" : `Link Selected Evidence${selected.size > 0 ? ` (${selected.size})` : ""}`}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface StepEditState {
  title: string;
  purpose: string;
  systemPortal: string;
  navigationPath: string;
  instructions: string;
  recommendedSettings: string;
  expectedResult: string;
  evidenceToCapture: string;
  suggestedFilename: string;
  relatedControls: string;
  ownerRole: string;
  ifThisFails: string;
  isRequired: boolean;
  sortOrder: string;
}

function emptyEditState(): StepEditState {
  return {
    title: "",
    purpose: "",
    systemPortal: "",
    navigationPath: "",
    instructions: "",
    recommendedSettings: "",
    expectedResult: "",
    evidenceToCapture: "",
    suggestedFilename: "",
    relatedControls: "",
    ownerRole: "Compliance Manager",
    ifThisFails: "",
    isRequired: true,
    sortOrder: "0",
  };
}

function stepToEditState(step: ProcedureStep): StepEditState {
  return {
    title: step.title,
    purpose: step.purpose,
    systemPortal: step.systemPortal,
    navigationPath: step.navigationPath,
    instructions: step.instructions,
    recommendedSettings: step.recommendedSettings ?? "",
    expectedResult: step.expectedResult,
    evidenceToCapture: step.evidenceToCapture,
    suggestedFilename: step.suggestedFilename,
    relatedControls: step.relatedControls.join(", "),
    ownerRole: step.ownerRole,
    ifThisFails: step.ifThisFails,
    isRequired: step.isRequired,
    sortOrder: String(step.sortOrder),
  };
}

function StepEditorDialog({
  open,
  onClose,
  onSave,
  initialState,
  title,
  isPending,
}: {
  open: boolean;
  onClose: () => void;
  onSave: (state: StepEditState) => void;
  initialState: StepEditState;
  title: string;
  isPending: boolean;
}) {
  const [s, setS] = useState<StepEditState>(initialState);
  const f = <K extends keyof StepEditState>(k: K, v: StepEditState[K]) =>
    setS((prev) => ({ ...prev, [k]: v }));

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2 space-y-1.5">
              <Label>Step Title *</Label>
              <Input value={s.title} onChange={(e) => f("title", e.target.value)} placeholder="e.g. Enroll Devices in Intune" />
            </div>
            <div className="space-y-1.5">
              <Label>System / Portal</Label>
              <Input value={s.systemPortal} onChange={(e) => f("systemPortal", e.target.value)} placeholder="Microsoft Intune Admin Center" />
            </div>
            <div className="space-y-1.5">
              <Label>Owner Role</Label>
              <Input value={s.ownerRole} onChange={(e) => f("ownerRole", e.target.value)} placeholder="Compliance Manager" />
            </div>
            <div className="col-span-2 space-y-1.5">
              <Label>Navigation Path</Label>
              <Input value={s.navigationPath} onChange={(e) => f("navigationPath", e.target.value)} placeholder="Devices → Compliance → Policies" />
            </div>
            <div className="col-span-2 space-y-1.5">
              <Label>Purpose</Label>
              <Textarea value={s.purpose} onChange={(e) => f("purpose", e.target.value)} placeholder="Why this step is required..." className="min-h-16 resize-none" />
            </div>
            <div className="col-span-2 space-y-1.5">
              <Label>Instructions (one per line)</Label>
              <Textarea value={s.instructions} onChange={(e) => f("instructions", e.target.value)} placeholder="1. Navigate to...\n2. Configure..." className="min-h-28 resize-none font-mono text-xs" />
            </div>
            <div className="col-span-2 space-y-1.5">
              <Label>Recommended Settings</Label>
              <Textarea value={s.recommendedSettings} onChange={(e) => f("recommendedSettings", e.target.value)} placeholder="BitLocker: Required\nAntivirus: Required..." className="min-h-16 resize-none font-mono text-xs" />
            </div>
            <div className="col-span-2 space-y-1.5">
              <Label>Expected Result</Label>
              <Textarea value={s.expectedResult} onChange={(e) => f("expectedResult", e.target.value)} className="min-h-14 resize-none" />
            </div>
            <div className="col-span-2 space-y-1.5">
              <Label>Evidence to Capture (one per line)</Label>
              <Textarea value={s.evidenceToCapture} onChange={(e) => f("evidenceToCapture", e.target.value)} className="min-h-16 resize-none" />
            </div>
            <div className="space-y-1.5">
              <Label>Suggested Filename</Label>
              <Input value={s.suggestedFilename} onChange={(e) => f("suggestedFilename", e.target.value)} placeholder="CM-3.4.1_Evidence_YYYY-MM-DD.png" />
            </div>
            <div className="space-y-1.5">
              <Label>Related Controls (comma-separated)</Label>
              <Input value={s.relatedControls} onChange={(e) => f("relatedControls", e.target.value)} placeholder="CM.L2-3.4.1, AC.L2-3.1.18" />
            </div>
            <div className="col-span-2 space-y-1.5">
              <Label>If This Fails</Label>
              <Textarea value={s.ifThisFails} onChange={(e) => f("ifThisFails", e.target.value)} className="min-h-14 resize-none" />
            </div>
            <div className="space-y-1.5">
              <Label>Sort Order</Label>
              <Input type="number" value={s.sortOrder} onChange={(e) => f("sortOrder", e.target.value)} />
            </div>
            <div className="flex items-center gap-2 pt-5">
              <Checkbox checked={s.isRequired} onCheckedChange={(v) => f("isRequired", !!v)} id="req" />
              <Label htmlFor="req">Required step</Label>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={() => onSave(s)} disabled={isPending || !s.title.trim()}>
            {isPending ? "Saving…" : "Save Step"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ProcedureStepCard({
  step,
  orgId,
  canEdit,
  canUpdateStatus,
  onEdit,
  onDelete,
  onProgressUpdate,
}: {
  step: ProcedureStep;
  orgId: string;
  canEdit: boolean;
  canUpdateStatus: boolean;
  onEdit: (step: ProcedureStep) => void;
  onDelete: (stepId: string) => void;
  onProgressUpdate: (stepId: string, status: string, notes: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [simpleView, setSimpleView] = useState(true);
  const [statusLocal, setStatusLocal] = useState(step.progress?.status ?? "not_started");
  const [notesLocal, setNotesLocal] = useState(step.progress?.notes ?? "");

  const statusCfg = STEP_STATUS_CONFIG[statusLocal] ?? STEP_STATUS_CONFIG.not_started;
  const StatusIcon = statusCfg.Icon;
  const isComplete = statusLocal === "complete";

  return (
    <div
      className={cn(
        "rounded-lg border transition-colors",
        isComplete
          ? "border-emerald-500/30 bg-emerald-950/10"
          : "border-border bg-card"
      )}
    >
      {/* Collapsed header — always visible */}
      <button
        className="w-full flex items-center gap-3 p-4 text-left group"
        onClick={() => setExpanded((v) => !v)}
      >
        {/* Step number */}
        <span
          className={cn(
            "shrink-0 w-8 h-8 rounded-full border text-xs font-bold flex items-center justify-center",
            isComplete
              ? "bg-emerald-500/20 border-emerald-500/40 text-emerald-300"
              : "bg-primary/10 border-primary/20 text-primary"
          )}
        >
          {step.stepNumber}
        </span>

        {/* Title + meta */}
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={cn(
                "font-semibold text-sm",
                isComplete ? "text-emerald-200" : "text-foreground"
              )}
            >
              {step.title}
            </span>
            {!step.isRequired && (
              <span className="text-[10px] px-1.5 py-0.5 rounded border border-slate-500/30 bg-slate-500/10 text-slate-400">
                Optional
              </span>
            )}
            {step.isCustom && (
              <span className="text-[10px] px-1.5 py-0.5 rounded border border-purple-500/30 bg-purple-500/10 text-purple-400">
                Custom
              </span>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-3 mt-1">
            {step.systemPortal && (
              <span className="flex items-center gap-1 text-xs text-muted-foreground">
                <Cpu className="h-3 w-3 shrink-0" />
                {step.systemPortal.split(",")[0].split("/")[0].trim()}
              </span>
            )}
            {step.relatedControls.length > 0 && (
              <span className="flex items-center gap-1 text-xs text-muted-foreground">
                <ShieldCheck className="h-3 w-3 shrink-0" />
                {step.relatedControls.slice(0, 2).join(", ")}
                {step.relatedControls.length > 2 && ` +${step.relatedControls.length - 2}`}
              </span>
            )}
            {step.suggestedFilename && (
              <span className="flex items-center gap-1 text-xs text-muted-foreground">
                <Camera className="h-3 w-3 shrink-0" />
                Evidence required
              </span>
            )}
          </div>
        </div>

        {/* Status badge + chevron */}
        <div className="shrink-0 flex items-center gap-2">
          <span
            className={cn(
              "flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full border",
              statusCfg.bg,
              statusCfg.color
            )}
          >
            <StatusIcon className="h-3 w-3" />
            {statusCfg.label}
          </span>
          <ChevronDown
            className={cn(
              "h-4 w-4 text-muted-foreground transition-transform",
              expanded && "rotate-180"
            )}
          />
        </div>
      </button>

      {/* Expanded body */}
      {expanded && (
        <div className="border-t border-border px-4 pb-5 pt-4 space-y-5">
          {/* Simple / Advanced toggle + admin controls */}
          <div className="flex items-center justify-between gap-2">
            <button
              onClick={() => setSimpleView((v) => !v)}
              className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors rounded border border-border px-2 py-1 bg-muted/20"
            >
              {simpleView ? (
                <>
                  <Eye className="h-3 w-3" />
                  Simple View
                </>
              ) : (
                <>
                  <EyeOff className="h-3 w-3" />
                  Advanced Details
                </>
              )}
            </button>
            {canEdit && (
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                className="h-7 gap-1.5 text-xs"
                onClick={() => onEdit(step)}
              >
                <Pencil className="h-3 w-3" />
                Edit Step
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 gap-1.5 text-xs text-red-400 hover:text-red-300 hover:bg-red-500/10"
                onClick={() => onDelete(step.id)}
              >
                <Trash2 className="h-3 w-3" />
                Delete
              </Button>
            </div>
          )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {/* Left column */}
            <div className="space-y-4">
              {step.purpose && (
                <DetailSection icon={Target} label="Purpose">
                  {step.purpose}
                </DetailSection>
              )}

              {!simpleView && step.systemPortal && (
                <DetailSection icon={Cpu} label="System / Portal">
                  {step.systemPortal}
                </DetailSection>
              )}

              {!simpleView && step.navigationPath && (
                <DetailSection icon={Navigation} label="Where to Go">
                  <div className="font-mono text-xs bg-muted/40 border rounded px-3 py-2 whitespace-pre-line text-muted-foreground leading-relaxed">
                    {step.navigationPath}
                  </div>
                </DetailSection>
              )}

              {step.instructions && (
                <DetailSection icon={ClipboardList} label="What to Do">
                  <MultiLineText text={step.instructions} />
                </DetailSection>
              )}

              {!simpleView && step.recommendedSettings && (
                <DetailSection icon={CheckCircle2} label="Recommended Settings">
                  <div className="font-mono text-xs bg-muted/40 border rounded px-3 py-2 whitespace-pre-line text-muted-foreground">
                    {step.recommendedSettings}
                  </div>
                </DetailSection>
              )}
            </div>

            {/* Right column */}
            <div className="space-y-4">
              {step.expectedResult && (
                <DetailSection icon={CheckCircle2} label="Expected Result">
                  <div className="rounded border border-emerald-500/20 bg-emerald-500/5 px-3 py-2 text-emerald-200">
                    {step.expectedResult}
                  </div>
                </DetailSection>
              )}

              {step.evidenceToCapture && (
                <DetailSection icon={Camera} label="Evidence to Capture">
                  <MultiLineText text={step.evidenceToCapture} />
                </DetailSection>
              )}

              {step.suggestedFilename && (
                <DetailSection icon={FileText} label="Suggested Filename">
                  <span className="font-mono text-xs bg-muted/50 border px-2 py-1 rounded text-muted-foreground">
                    {step.suggestedFilename}
                  </span>
                </DetailSection>
              )}

              {!simpleView && step.relatedControls.length > 0 && (
                <DetailSection icon={ShieldCheck} label="Related Controls">
                  <div className="flex flex-wrap gap-1.5">
                    {step.relatedControls.map((ctrl) => (
                      <Link key={ctrl} href={`/controls/${ctrl}`}>
                        <span className="font-mono text-xs px-2 py-0.5 rounded border border-primary/30 bg-primary/10 text-primary hover:bg-primary/20 cursor-pointer transition-colors">
                          {ctrl}
                        </span>
                      </Link>
                    ))}
                  </div>
                </DetailSection>
              )}

              {!simpleView && step.ownerRole && (
                <DetailSection icon={User} label="Owner Role">
                  {step.ownerRole}
                </DetailSection>
              )}

              {!simpleView && step.ifThisFails && (
                <DetailSection icon={AlertCircle} label="If This Fails">
                  <div className="rounded border border-yellow-500/20 bg-yellow-500/5 px-3 py-2 text-yellow-200">
                    {step.ifThisFails}
                  </div>
                </DetailSection>
              )}
            </div>
          </div>

          {/* Status update + evidence upload row */}
          <div className="border-t border-border pt-4 space-y-3">
            <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              Step Progress
            </div>
            <div className="flex flex-wrap gap-3 items-start">
              <div className="flex gap-1.5 flex-wrap">
                {STEP_STATUS_OPTIONS.map((opt) => {
                  const cfg = STEP_STATUS_CONFIG[opt.value];
                  const Ic = cfg.Icon;
                  const active = statusLocal === opt.value;
                  return (
                    <button
                      key={opt.value}
                      disabled={!canUpdateStatus}
                      onClick={() => {
                        if (!canUpdateStatus) return;
                        setStatusLocal(opt.value);
                      }}
                      className={cn(
                        "flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs font-medium transition-all",
                        active
                          ? cn(cfg.bg, cfg.color, "ring-1 ring-offset-1 ring-offset-background ring-current")
                          : "border-border bg-muted/20 text-muted-foreground hover:border-border/80",
                        !canUpdateStatus && "opacity-50 cursor-not-allowed"
                      )}
                    >
                      <Ic className="h-3 w-3" />
                      {opt.label}
                    </button>
                  );
                })}
              </div>

              {canUpdateStatus && (
                <div className="flex-1 flex gap-2 min-w-52">
                  <Input
                    placeholder="Notes (optional)…"
                    value={notesLocal}
                    onChange={(e) => setNotesLocal(e.target.value)}
                    className="h-8 text-xs flex-1"
                  />
                  <Button
                    size="sm"
                    className="h-8 shrink-0 gap-1.5"
                    onClick={() => onProgressUpdate(step.id, statusLocal, notesLocal)}
                  >
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    Save
                  </Button>
                </div>
              )}
            </div>

            {step.progress?.completedAt && (
              <div className="text-xs text-muted-foreground">
                Marked complete{step.progress.completedBy ? ` by ${step.progress.completedBy}` : ""}{" "}
                on {new Date(step.progress.completedAt).toLocaleDateString()}
              </div>
            )}

            {step.suggestedFilename && (
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground mt-1">
                <Camera className="h-3.5 w-3.5 shrink-0" />
                Upload evidence for this step via the{" "}
                <button
                  onClick={() => {
                    // Bubble up to the parent tab system via a custom DOM event
                    document.dispatchEvent(new CustomEvent("roadmap-navigate-tab", { detail: "evidence" }));
                  }}
                  className="underline text-primary hover:text-primary/80 transition-colors cursor-pointer"
                >
                  Evidence tab
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function ProcedureStepsSection({
  actionId,
  orgId,
  fallbackText,
  canEdit,
  canUpdateStatus,
}: {
  actionId: string;
  orgId: string;
  fallbackText: string;
  canEdit: boolean;
  canUpdateStatus: boolean;
}) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [editStep, setEditStep] = useState<ProcedureStep | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  const { data: steps = [], isLoading } = useQuery<ProcedureStep[]>({
    queryKey: ["procedure-steps", actionId, orgId],
    enabled: !!orgId && !!actionId,
    queryFn: async () => {
      const res = await fetch(`/api/roadmap/actions/${actionId}/procedure-steps`, {
        headers: makeHeaders(orgId),
      });
      if (!res.ok) throw new Error("Failed to load steps");
      return res.json();
    },
  });

  const progressMutation = useMutation({
    mutationFn: async ({
      stepId,
      status,
      notes,
    }: {
      stepId: string;
      status: string;
      notes: string;
    }) => {
      const res = await fetch(`/api/roadmap/procedure-steps/${stepId}/progress`, {
        method: "PATCH",
        headers: makeHeaders(orgId),
        body: JSON.stringify({ status, notes: notes || null }),
      });
      if (!res.ok) throw new Error("Failed to update step");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["procedure-steps", actionId] });
      toast({ title: "Step progress saved" });
    },
    onError: () => toast({ title: "Failed to save step", variant: "destructive" }),
  });

  const addMutation = useMutation({
    mutationFn: async (state: StepEditState) => {
      const res = await fetch(`/api/roadmap/actions/${actionId}/procedure-steps`, {
        method: "POST",
        headers: makeHeaders(orgId),
        body: JSON.stringify({
          stepNumber: steps.length + 1,
          title: state.title,
          purpose: state.purpose,
          systemPortal: state.systemPortal,
          navigationPath: state.navigationPath,
          instructions: state.instructions,
          recommendedSettings: state.recommendedSettings || null,
          expectedResult: state.expectedResult,
          evidenceToCapture: state.evidenceToCapture,
          suggestedFilename: state.suggestedFilename,
          relatedControls: state.relatedControls
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean),
          ownerRole: state.ownerRole,
          ifThisFails: state.ifThisFails,
          isRequired: state.isRequired,
          sortOrder: parseInt(state.sortOrder) || steps.length,
        }),
      });
      if (!res.ok) throw new Error("Failed to add step");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["procedure-steps", actionId] });
      setAddOpen(false);
      toast({ title: "Step added" });
    },
    onError: () => toast({ title: "Failed to add step", variant: "destructive" }),
  });

  const editMutation = useMutation({
    mutationFn: async ({ stepId, state }: { stepId: string; state: StepEditState }) => {
      const res = await fetch(`/api/roadmap/procedure-steps/${stepId}`, {
        method: "PUT",
        headers: makeHeaders(orgId),
        body: JSON.stringify({
          title: state.title,
          purpose: state.purpose,
          systemPortal: state.systemPortal,
          navigationPath: state.navigationPath,
          instructions: state.instructions,
          recommendedSettings: state.recommendedSettings || null,
          expectedResult: state.expectedResult,
          evidenceToCapture: state.evidenceToCapture,
          suggestedFilename: state.suggestedFilename,
          relatedControls: state.relatedControls
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean),
          ownerRole: state.ownerRole,
          ifThisFails: state.ifThisFails,
          isRequired: state.isRequired,
          sortOrder: parseInt(state.sortOrder) || 0,
        }),
      });
      if (!res.ok) throw new Error("Failed to update step");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["procedure-steps", actionId] });
      setEditStep(null);
      toast({ title: "Step updated" });
    },
    onError: () => toast({ title: "Failed to update step", variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (stepId: string) => {
      const res = await fetch(`/api/roadmap/procedure-steps/${stepId}`, {
        method: "DELETE",
        headers: makeHeaders(orgId),
      });
      if (!res.ok) throw new Error("Failed to delete step");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["procedure-steps", actionId] });
      setDeleteConfirm(null);
      toast({ title: "Step deleted" });
    },
    onError: () => toast({ title: "Failed to delete step", variant: "destructive" }),
  });

  if (isLoading) {
    return (
      <div className="flex justify-center py-10">
        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary" />
      </div>
    );
  }

  const completedCount = steps.filter((s) => s.progress?.status === "complete").length;
  const totalRequired = steps.filter((s) => s.isRequired).length;
  const completedRequired = steps.filter(
    (s) => s.isRequired && s.progress?.status === "complete"
  ).length;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="rounded-lg border bg-card overflow-hidden">
        <div className="p-4 border-b bg-muted/20 flex items-center justify-between">
          <div>
            <h3 className="font-semibold text-sm flex items-center gap-2">
              <BookOpen className="h-4 w-4 text-primary" />
              Implementation Procedure
            </h3>
            {steps.length > 0 ? (
              <p className="text-xs text-muted-foreground mt-0.5">
                {completedCount} of {steps.length} steps complete
                {totalRequired > 0 && ` · ${completedRequired}/${totalRequired} required`}
              </p>
            ) : (
              <p className="text-xs text-muted-foreground mt-0.5">
                High-level procedure steps below. Detailed playbook steps not yet configured.
              </p>
            )}
          </div>
          {canEdit && (
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5 h-8 text-xs"
              onClick={() => setAddOpen(true)}
            >
              <Plus className="h-3.5 w-3.5" />
              Add Step
            </Button>
          )}
        </div>

        {/* Progress bar */}
        {steps.length > 0 && (
          <div className="px-4 py-2 bg-muted/10 border-b">
            <div className="h-1.5 rounded-full bg-muted overflow-hidden">
              <div
                className="h-full rounded-full bg-emerald-500 transition-all"
                style={{
                  width: steps.length ? `${(completedCount / steps.length) * 100}%` : "0%",
                }}
              />
            </div>
          </div>
        )}
      </div>

      {/* Step cards */}
      {steps.length > 0 ? (
        <div className="space-y-2">
          {steps.map((step) => (
            <ProcedureStepCard
              key={step.id}
              step={step}
              orgId={orgId}
              canEdit={canEdit}
              canUpdateStatus={canUpdateStatus}
              onEdit={setEditStep}
              onDelete={setDeleteConfirm}
              onProgressUpdate={(stepId, status, notes) =>
                progressMutation.mutate({ stepId, status, notes })
              }
            />
          ))}
        </div>
      ) : (
        /* Fallback: show legacy plain text procedure */
        <div className="rounded-lg border bg-card p-5">
          <StepList text={fallbackText} />
        </div>
      )}

      {/* Add step dialog */}
      {addOpen && (
        <StepEditorDialog
          open={addOpen}
          onClose={() => setAddOpen(false)}
          onSave={(state) => addMutation.mutate(state)}
          initialState={emptyEditState()}
          title="Add Procedure Step"
          isPending={addMutation.isPending}
        />
      )}

      {/* Edit step dialog */}
      {editStep && (
        <StepEditorDialog
          open={!!editStep}
          onClose={() => setEditStep(null)}
          onSave={(state) => editMutation.mutate({ stepId: editStep.id, state })}
          initialState={stepToEditState(editStep)}
          title={`Edit Step ${editStep.stepNumber}: ${editStep.title}`}
          isPending={editMutation.isPending}
        />
      )}

      {/* Delete confirm dialog */}
      <Dialog open={!!deleteConfirm} onOpenChange={(o) => !o && setDeleteConfirm(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete Step</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Are you sure? This will permanently remove this procedure step and all
            organization progress records for it.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteConfirm(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => deleteConfirm && deleteMutation.mutate(deleteConfirm)}
              disabled={deleteMutation.isPending}
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

const VALIDATOR_ROLES = new Set([
  "admin",
  "compliance_manager",
  "reviewer",
  "it_contributor",
]);

export default function RoadmapActionDetail({ id }: { id: string }) {
  const { activeOrg } = useOrg();
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [, navigate] = useLocation();

  const [localStatus, setLocalStatus] = useState<string | null>(null);
  const [localOwner, setLocalOwner] = useState<string | null>(null);
  const [localTargetDate, setLocalTargetDate] = useState<string | null>(null);
  const [localNotes, setLocalNotes] = useState<string | null>(null);
  const [overrideJustification, setOverrideJustification] = useState("");
  const [initialized, setInitialized] = useState(false);
  const [activeTab, setActiveTab] = useState("overview");
  const [overrideDialogOpen, setOverrideDialogOpen] = useState(false);
  const [inconsistencyDismissed, setInconsistencyDismissed] = useState(false);
  const [uploadModalItem, setUploadModalItem] = useState<EvidenceItem | null>(null);

  const canEdit =
    user?.role === "admin" || user?.role === "compliance_manager";
  const canMarkComplete = canEdit;
  const canUpdateStatus = user?.role !== "assessor";
  const canValidate = !!user?.role && VALIDATOR_ROLES.has(user.role);

  // Listen for tab-navigation events dispatched by child components (e.g. ProcedureStepCard)
  useEffect(() => {
    const handler = (e: Event) => {
      const tab = (e as CustomEvent<string>).detail;
      if (tab) setActiveTab(tab);
    };
    document.addEventListener("roadmap-navigate-tab", handler);
    return () => document.removeEventListener("roadmap-navigate-tab", handler);
  }, []);

  const { data: action, isLoading } = useQuery<ActionDetail>({
    queryKey: ["roadmap-action", id, activeOrg?.id],
    enabled: !!activeOrg?.id && !!id,
    queryFn: async () => {
      const res = await fetch(`/api/roadmap/actions/${id}`, {
        headers: makeHeaders(activeOrg!.id),
      });
      if (!res.ok) throw new Error("Failed to load action");
      return res.json();
    },
    onSuccess: (data: ActionDetail) => {
      if (!initialized) {
        setLocalStatus(data.progress?.status ?? "not_started");
        setLocalOwner(data.progress?.owner ?? "");
        setLocalTargetDate(data.progress?.targetDate ?? "");
        setLocalNotes(data.progress?.notes ?? "");
        setInitialized(true);
      }
    },
  } as any);

  const { data: evidenceIndex = [] } = useQuery<
    Array<{ id: string; title: string; status: string }>
  >({
    queryKey: ["evidence-index", activeOrg?.id],
    enabled: !!activeOrg?.id,
    queryFn: async () => {
      const res = await fetch(`/api/evidence`, {
        headers: makeHeaders(activeOrg!.id),
      });
      if (!res.ok) throw new Error("Failed to load evidence index");
      const data = await res.json();
      return Array.isArray(data) ? data : (data.items ?? []);
    },
  });
  const evidenceIndexMap = new Map(evidenceIndex.map((e) => [e.id, e]));

  const progressMutation = useMutation({
    mutationFn: async (payload: Record<string, unknown>) => {
      const res = await fetch(`/api/roadmap/actions/${id}/progress`, {
        method: "PATCH",
        headers: makeHeaders(activeOrg!.id),
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}) as any);
        const missing = Array.isArray(body.missing) ? body.missing.join("; ") : "";
        throw new Error(
          missing ? `${body.error} — ${missing}` : body.error || "Failed to save progress"
        );
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["roadmap-actions"] });
      queryClient.invalidateQueries({ queryKey: ["roadmap-action", id] });
      toast({ title: "Progress saved" });
      setOverrideJustification("");
    },
    onError: (err: Error) =>
      toast({ title: "Failed to save", description: err.message, variant: "destructive" }),
  });

  const understandMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/roadmap/actions/${id}/understand`, {
        method: "POST",
        headers: makeHeaders(activeOrg!.id),
      });
      if (!res.ok) throw new Error("Failed to acknowledge");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["roadmap-action", id] });
      queryClient.invalidateQueries({ queryKey: ["roadmap-actions"] });
      toast({ title: "Overview acknowledged" });
    },
    onError: () => toast({ title: "Failed to acknowledge", variant: "destructive" }),
  });

  const checklistMutation = useMutation({
    mutationFn: async ({
      itemId,
      completed,
      notes,
    }: {
      itemId: string;
      completed: boolean;
      notes?: string | null;
    }) => {
      const res = await fetch(
        `/api/roadmap/actions/${id}/checklist/${itemId}`,
        {
          method: "POST",
          headers: makeHeaders(activeOrg!.id),
          body: JSON.stringify({
            completed,
            ...(notes !== undefined ? { notes } : {}),
          }),
        }
      );
      if (!res.ok) throw new Error("Failed to update checklist");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["roadmap-action", id] });
      queryClient.invalidateQueries({ queryKey: ["roadmap-actions"] });
    },
    onError: () => toast({ title: "Failed to update checklist", variant: "destructive" }),
  });

  const unlinkEvidenceMutation = useMutation({
    mutationFn: async ({
      itemId,
      evidenceId,
    }: {
      itemId: string;
      evidenceId: string;
    }) => {
      const res = await fetch(
        `/api/roadmap/evidence-items/${itemId}/link/${evidenceId}`,
        { method: "DELETE", headers: makeHeaders(activeOrg!.id) }
      );
      if (!res.ok) throw new Error("Failed to unlink evidence");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["roadmap-action", id] });
      queryClient.invalidateQueries({ queryKey: ["roadmap-actions"] });
      toast({ title: "Evidence unlinked" });
    },
    onError: () => toast({ title: "Failed to unlink evidence", variant: "destructive" }),
  });

  const handleSaveProgress = () => {
    if (localStatus === "complete" && !canMarkComplete) {
      toast({
        title: "Only admins or compliance managers can mark this complete",
        variant: "destructive",
      });
      return;
    }
    progressMutation.mutate({
      status: localStatus,
      owner: localOwner || null,
      targetDate: localTargetDate || null,
      notes: localNotes || null,
      ...(localStatus === "complete"
        ? { overrideJustification: overrideJustification || null }
        : {}),
    });
  };

  const handleSubmitForReview = () => {
    setLocalStatus("ready_for_review");
    progressMutation.mutate({
      status: "ready_for_review",
      owner: localOwner || null,
      targetDate: localTargetDate || null,
      notes: localNotes || null,
    });
  };

  const handleApproveComplete = () => {
    if (!canMarkComplete) {
      toast({ title: "Only admins or compliance managers can mark complete", variant: "destructive" });
      return;
    }
    setLocalStatus("complete");
    progressMutation.mutate({
      status: "complete",
      owner: localOwner || null,
      targetDate: localTargetDate || null,
      notes: localNotes || null,
    });
  };

  // ── Consistency check ─────────────────────────────────────────────────────
  const { data: consistencyData } = useQuery<{
    hasInconsistency: boolean;
    missing: string[];
  }>({
    queryKey: ["roadmap-consistency", id, activeOrg?.id],
    enabled: !!activeOrg?.id && !!id,
    queryFn: async () => {
      const res = await fetch(`/api/roadmap/actions/${id}/consistency`, {
        headers: makeHeaders(activeOrg!.id),
      });
      if (!res.ok) return { hasInconsistency: false, missing: [] };
      return res.json();
    },
  });

  const reopenMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/roadmap/actions/${id}/reopen`, {
        method: "POST",
        headers: makeHeaders(activeOrg!.id),
      });
      if (!res.ok) throw new Error("Failed to reopen action");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["roadmap-action", id] });
      queryClient.invalidateQueries({ queryKey: ["roadmap-actions"] });
      queryClient.invalidateQueries({ queryKey: ["roadmap-consistency", id] });
      toast({ title: "Action reopened" });
      setLocalStatus("in_progress");
    },
    onError: (err: Error) =>
      toast({ title: "Failed to reopen", description: err.message, variant: "destructive" }),
  });

  const overrideMutation = useMutation({
    mutationFn: async (data: { justification: string; approvedBy: string; approvedDate: string }) => {
      const res = await fetch(`/api/roadmap/actions/${id}/override`, {
        method: "POST",
        headers: makeHeaders(activeOrg!.id),
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Failed to record override");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["roadmap-consistency", id] });
      queryClient.invalidateQueries({ queryKey: ["roadmap-action", id] });
      toast({ title: "Override recorded" });
      setOverrideDialogOpen(false);
    },
    onError: (err: Error) =>
      toast({ title: "Failed to record override", description: err.message, variant: "destructive" }),
  });

  if (isLoading || !action) {
    return (
      <div className="flex justify-center py-24">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  const completedChecklist = action.checklistItems.filter((i) => i.completed).length;
  const checkPct =
    action.checklistItems.length > 0
      ? Math.round((completedChecklist / action.checklistItems.length) * 100)
      : 0;

  const currentStatus = localStatus ?? action.progress?.status ?? "not_started";
  const statusCfgHeader = STATUS_DISPLAY_CONFIG[currentStatus] ?? STATUS_DISPLAY_CONFIG.not_started;

  const showInconsistency =
    !inconsistencyDismissed &&
    consistencyData?.hasInconsistency === true &&
    action.progress?.status === "complete";

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto">
      {/* Back nav */}
      <Link href="/roadmap">
        <button className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-4 transition-colors">
          <ArrowLeft className="h-4 w-4" />
          Implementation Roadmap
        </button>
      </Link>

      {/* Completion inconsistency warning */}
      {showInconsistency && (
        <Card className="mb-5 border-amber-500/40 bg-amber-500/5">
          <div className="p-4 space-y-3">
            <div className="flex items-center gap-2 text-amber-400 font-semibold text-sm">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              Completion Inconsistency Detected
            </div>
            <p className="text-xs text-muted-foreground">
              This action is marked complete but the following items are missing:
            </p>
            <ul className="space-y-0.5">
              {(consistencyData?.missing ?? []).map((m, i) => (
                <li key={i} className="text-xs text-amber-300">• {m}</li>
              ))}
            </ul>
            <div className="flex flex-wrap gap-2 pt-1">
              {canEdit && (
                <Button
                  size="sm"
                  variant="outline"
                  className="gap-1.5 border-amber-500/40 text-amber-300 hover:bg-amber-500/10"
                  disabled={reopenMutation.isPending}
                  onClick={() => reopenMutation.mutate()}
                >
                  <ArrowRight className="h-3.5 w-3.5 rotate-180" />
                  Reopen Action
                </Button>
              )}
              <Button
                size="sm"
                variant="outline"
                className="gap-1.5"
                onClick={() => setOverrideDialogOpen(true)}
              >
                <Pencil className="h-3.5 w-3.5" />
                Record Legacy Override
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="text-muted-foreground"
                onClick={() => setInconsistencyDismissed(true)}
              >
                Dismiss
              </Button>
            </div>
          </div>
        </Card>
      )}

      {/* Two-column layout */}
      <div className="flex flex-col lg:flex-row gap-6 items-start">

        {/* ── LEFT COLUMN ── */}
        <div className="flex-1 min-w-0 space-y-5">

          {/* Action header */}
          <div className="space-y-3">
            <h1 className="text-xl font-bold leading-tight">{action.title}</h1>

            {/* Metadata badge row */}
            <div className="flex flex-wrap items-center gap-2">
              {/* Phase */}
              <span className="text-[11px] font-semibold px-2 py-0.5 rounded border bg-card border-border text-muted-foreground">
                Phase {action.phase}: {action.phaseName}
              </span>

              {/* Priority */}
              <span
                className={cn(
                  "text-[11px] font-semibold px-2 py-0.5 rounded border uppercase tracking-wide",
                  PRIORITY_COLORS[action.priority]
                )}
              >
                {action.priority}
              </span>

              {/* Effort */}
              <span className="text-[11px] font-semibold px-2 py-0.5 rounded border bg-card border-border text-muted-foreground capitalize">
                {action.effort} effort
              </span>

              {/* Status */}
              <span
                className={cn(
                  "text-[11px] font-semibold px-2 py-0.5 rounded border",
                  statusCfgHeader.bg,
                  statusCfgHeader.color,
                  statusCfgHeader.borderColor
                )}
              >
                {statusCfgHeader.label}
              </span>

              {/* Controls count */}
              <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                <ShieldCheck className="h-3.5 w-3.5" />
                {action.controls.length} control{action.controls.length !== 1 ? "s" : ""}
              </span>

              {/* Progress % */}
              <span className="flex items-center gap-1 text-[11px] font-semibold text-foreground/70">
                <Zap className="h-3.5 w-3.5 text-primary" />
                {action.computedProgress.percent}% complete
              </span>

              {/* Owner if set */}
              {action.progress?.owner && (
                <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                  <User className="h-3.5 w-3.5" />
                  {action.progress.owner}
                </span>
              )}

              {/* Due date if set */}
              {action.progress?.targetDate && (
                <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                  <Clock className="h-3.5 w-3.5" />
                  {new Date(action.progress.targetDate).toLocaleDateString()}
                </span>
              )}
            </div>
          </div>

          {/* Stage tracker */}
          <div className="rounded-lg border bg-card p-4">
            <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">
              Where You Are
            </div>
            <StageTracker
              stages={action.computedProgress.stages}
              onTabChange={setActiveTab}
            />
          </div>

          {/* Next step banner */}
          <NextStepBanner
            status={currentStatus}
            computedProgress={action.computedProgress}
            onTabChange={setActiveTab}
          />

          {/* Tabs */}
          <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
            <TabsList className="flex-wrap h-auto gap-1">
              <TabsTrigger value="overview" className="gap-1.5">
                <Lightbulb className="h-3.5 w-3.5" />
                Overview
              </TabsTrigger>
              <TabsTrigger value="procedure" className="gap-1.5">
                <ListOrdered className="h-3.5 w-3.5" />
                Steps
              </TabsTrigger>
              <TabsTrigger value="evidence" className="gap-1.5">
                <FolderSearch className="h-3.5 w-3.5" />
                Evidence ({action.evidenceItems.length})
              </TabsTrigger>
              <TabsTrigger value="documents" className="gap-1.5">
                <FileText className="h-3.5 w-3.5" />
                Documents ({action.documents.length})
              </TabsTrigger>
              <TabsTrigger value="test" className="gap-1.5">
                <TestTube className="h-3.5 w-3.5" />
                Validation
              </TabsTrigger>
              <TabsTrigger value="controls" className="gap-1.5">
                <ShieldCheck className="h-3.5 w-3.5" />
                Controls ({action.controls.length})
              </TabsTrigger>
              <TabsTrigger value="checklist" className="gap-1.5">
                <CheckSquare className="h-3.5 w-3.5" />
                Checklist ({completedChecklist}/{action.checklistItems.length})
              </TabsTrigger>
            </TabsList>

            {/* A. Overview */}
            <TabsContent value="overview" className="space-y-4">
              <div
                className={cn(
                  "rounded-lg border p-4 flex flex-wrap items-center justify-between gap-3",
                  action.progress?.understandAckAt
                    ? "border-emerald-500/30 bg-emerald-500/5"
                    : "border-blue-500/30 bg-blue-500/5"
                )}
              >
                {action.progress?.understandAckAt ? (
                  <div className="flex items-center gap-2 text-sm text-emerald-300">
                    <CheckCircle2 className="h-4 w-4 shrink-0" />
                    <span>
                      Acknowledged on{" "}
                      {new Date(action.progress.understandAckAt).toLocaleString()}
                    </span>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 text-sm text-blue-300">
                    <Info className="h-4 w-4 shrink-0" />
                    <span>
                      Acknowledge that you've read this overview to start tracking your progress.
                    </span>
                  </div>
                )}
                {!action.progress?.understandAckAt && (
                  <Button
                    size="sm"
                    className="gap-1.5 shrink-0"
                    disabled={!canUpdateStatus || understandMutation.isPending}
                    onClick={() => understandMutation.mutate()}
                  >
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    Acknowledge Overview
                  </Button>
                )}
              </div>

              <div className="rounded-lg border bg-card p-5 space-y-4">
                <div>
                  <div className="flex items-center gap-2 text-sm font-semibold mb-2">
                    <Target className="h-4 w-4 text-primary" />
                    Purpose
                  </div>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    {action.purpose}
                  </p>
                </div>
                <hr className="border-border" />
                <div>
                  <div className="flex items-center gap-2 text-sm font-semibold mb-2">
                    <Lightbulb className="h-4 w-4 text-yellow-400" />
                    Why This Action Matters
                  </div>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    {action.whyItMatters}
                  </p>
                </div>
              </div>

              {/* Quick stats */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {[
                  { label: "Controls Linked", value: action.controls.length },
                  {
                    label: "Full Support",
                    value: action.controls.filter((c) => c.supportType === "full_support").length,
                  },
                  { label: "Evidence Items", value: action.evidenceItems.length },
                  { label: "Documents Required", value: action.documents.length },
                ].map((s) => (
                  <div key={s.label} className="rounded-lg border bg-card p-3 text-center">
                    <div className="text-2xl font-bold">{s.value}</div>
                    <div className="text-xs text-muted-foreground">{s.label}</div>
                  </div>
                ))}
              </div>

              <WhatYouWillProduce
                evidenceItems={action.evidenceItems}
                documents={action.documents}
                controlsCount={action.controls.length}
              />
            </TabsContent>

            {/* B. Controls */}
            <TabsContent value="controls">
              <div className="rounded-lg border bg-card overflow-hidden">
                <div className="p-4 border-b bg-muted/20">
                  <h3 className="font-semibold text-sm flex items-center gap-2">
                    <ShieldCheck className="h-4 w-4 text-primary" />
                    Linked CMMC Controls
                  </h3>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Completing this action supports the following controls. Controls will not be automatically marked Implemented — readiness rules must be satisfied.
                  </p>
                </div>
                <div className="divide-y">
                  {action.controls.map((ctrl) => (
                    <div
                      key={ctrl.id}
                      className="p-4 flex items-start gap-3 hover:bg-muted/20 transition-colors"
                    >
                      <div className="shrink-0 w-28">
                        <Link href={`/controls/${ctrl.controlId}`}>
                          <span className="font-mono text-sm font-bold text-primary hover:underline cursor-pointer">
                            {ctrl.controlRef}
                          </span>
                        </Link>
                        <div className="text-[10px] text-muted-foreground mt-0.5">{ctrl.level}</div>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium">{ctrl.controlTitle}</div>
                        <div className="text-xs text-muted-foreground">{ctrl.domain}</div>
                      </div>
                      <span
                        className={cn(
                          "shrink-0 text-[10px] font-semibold px-2 py-0.5 rounded border",
                          SUPPORT_TYPE_COLORS[ctrl.supportType]
                        )}
                      >
                        {SUPPORT_TYPE_LABELS[ctrl.supportType]}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
              <div className="mt-3 rounded-lg border border-blue-500/20 bg-blue-500/5 p-3 flex gap-2 text-xs text-blue-300">
                <Info className="h-4 w-4 shrink-0 mt-0.5" />
                <span>
                  A control becomes <strong>Candidate for Implemented</strong> only when: SSP narrative exists, required evidence is approved, required documents are active, testing is complete, and no blocking POA&M exists.
                </span>
              </div>
            </TabsContent>

            {/* C. Procedure steps */}
            <TabsContent value="procedure">
              {activeOrg?.id && (
                <ProcedureStepsSection
                  actionId={id}
                  orgId={activeOrg.id}
                  fallbackText={action.operatingProcedure}
                  canEdit={canEdit}
                  canUpdateStatus={canUpdateStatus}
                />
              )}
            </TabsContent>

            {/* D. Test / Validation */}
            <TabsContent value="test" className="space-y-4">
              {activeOrg?.id && (
                <ValidationPanel
                  actionId={id}
                  orgId={activeOrg.id}
                  progress={action.progress}
                  canValidate={canValidate}
                />
              )}
              <div className="rounded-lg border bg-card p-5">
                <div className="flex items-center gap-2 text-sm font-semibold mb-4">
                  <TestTube className="h-4 w-4 text-primary" />
                  Test Procedure
                </div>
                <p className="text-xs text-muted-foreground mb-4">
                  Perform these tests to validate that the action was completed correctly.
                </p>
                <StepList text={action.testProcedure} />
              </div>
            </TabsContent>

            {/* E. Evidence */}
            <TabsContent value="evidence">
              <div className="rounded-lg border bg-card overflow-hidden">
                <div className="p-4 border-b bg-muted/20">
                  <h3 className="font-semibold text-sm flex items-center gap-2">
                    <FolderSearch className="h-4 w-4 text-primary" />
                    Evidence to Capture
                  </h3>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Upload new evidence or link existing evidence from the repository to each item below.
                  </p>
                </div>
                <div className="divide-y">
                  {action.evidenceItems.map((ev, idx) => {
                    const linked = ev.links.length > 0;
                    return (
                      <div key={ev.id} className="p-4 space-y-2">
                        <div className="flex items-start gap-3">
                          <span
                            className={cn(
                              "shrink-0 w-6 h-6 rounded-full border text-xs font-bold flex items-center justify-center mt-0.5",
                              linked
                                ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400"
                                : "bg-primary/10 border-primary/20 text-primary"
                            )}
                          >
                            {linked ? <CheckCircle2 className="h-3.5 w-3.5" /> : idx + 1}
                          </span>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <div className="font-medium text-sm">{ev.title}</div>
                              <span
                                className={cn(
                                  "text-[10px] font-semibold px-1.5 py-0.5 rounded border shrink-0",
                                  ev.isRequired
                                    ? "bg-red-500/10 text-red-300 border-red-500/30"
                                    : "bg-slate-500/10 text-slate-300 border-slate-500/30"
                                )}
                              >
                                {ev.isRequired ? "Required" : "Optional"}
                              </span>
                            </div>
                            {ev.description && (
                              <p className="text-xs text-muted-foreground mt-1">
                                {ev.description}
                              </p>
                            )}
                            <div className="flex flex-wrap gap-2 mt-1 text-xs text-muted-foreground">
                              <span className="bg-muted px-2 py-0.5 rounded">{ev.evidenceType}</span>
                              <span>{ev.sourceSystem}</span>
                            </div>
                            <div className="mt-2 text-xs text-muted-foreground">
                              <span className="font-medium text-foreground/70">Must show:</span> {ev.mustShow}
                            </div>
                            <div className="mt-1.5 flex items-center gap-2">
                              <span className="text-xs font-mono bg-muted/50 border px-2 py-0.5 rounded text-muted-foreground">
                                {ev.suggestedFilename}
                              </span>
                            </div>
                          </div>
                          <div className="shrink-0 flex flex-col gap-1.5 items-stretch">
                            <Button
                              variant="outline"
                              size="sm"
                              className="gap-1.5 w-full"
                              onClick={() => setUploadModalItem(ev)}
                            >
                              <Upload className="h-3.5 w-3.5" />
                              Upload New Evidence
                            </Button>
                            {canUpdateStatus && activeOrg?.id && (
                              <EvidenceLinkPicker
                                orgId={activeOrg.id}
                                roadmapEvidenceItemId={ev.id}
                                requirementTitle={ev.title}
                                alreadyLinkedIds={new Set(ev.links.map((l) => l.evidenceId))}
                                onLinked={() =>
                                  queryClient.invalidateQueries({
                                    queryKey: ["roadmap-action", id],
                                  })
                                }
                              />
                            )}
                          </div>
                        </div>
                        {ev.links.length > 0 && (
                          <div className="ml-9 space-y-1">
                            <div className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">
                              Linked Evidence
                            </div>
                            {ev.links.map((link) => {
                              const info = evidenceIndexMap.get(link.evidenceId);
                              return (
                                <div
                                  key={link.id}
                                  className="flex items-center justify-between gap-2 text-xs bg-muted/20 rounded px-2 py-1.5"
                                >
                                  <Link href={`/evidence/${link.evidenceId}`}>
                                    <span className="text-primary hover:underline cursor-pointer truncate">
                                      {info?.title ?? link.evidenceId}
                                    </span>
                                  </Link>
                                  {canUpdateStatus && (
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      className="h-6 px-1.5 text-muted-foreground hover:text-red-400"
                                      disabled={unlinkEvidenceMutation.isPending}
                                      onClick={() =>
                                        unlinkEvidenceMutation.mutate({
                                          itemId: ev.id,
                                          evidenceId: link.evidenceId,
                                        })
                                      }
                                    >
                                      <Unlink className="h-3 w-3" />
                                    </Button>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        )}
                        <div className="ml-9 text-xs text-muted-foreground">
                          <span className="font-medium text-foreground/60">Linked controls:</span>{" "}
                          {action.controls.map((c) => c.controlRef).join(", ")}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </TabsContent>

            {/* F. Documents */}
            <TabsContent value="documents">
              <div className="rounded-lg border bg-card overflow-hidden">
                <div className="p-4 border-b bg-muted/20">
                  <h3 className="font-semibold text-sm flex items-center gap-2">
                    <FileText className="h-4 w-4 text-primary" />
                    Documents to Create or Update
                  </h3>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    These documents must exist, be current, and be approved to fully satisfy the linked controls.
                  </p>
                </div>
                <div className="divide-y">
                  {action.documents.map((doc, idx) => (
                    <div key={doc.id} className="p-4 flex items-center gap-3">
                      <span className="shrink-0 w-6 h-6 rounded-full bg-primary/10 border border-primary/20 text-primary text-xs font-bold flex items-center justify-center">
                        {idx + 1}
                      </span>
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-sm">{doc.title}</div>
                        <div className="text-xs text-muted-foreground capitalize">{doc.docType}</div>
                      </div>
                      <Link href="/documents/list">
                        <Button variant="outline" size="sm" className="gap-1.5 shrink-0">
                          <ExternalLink className="h-3.5 w-3.5" />
                          Open Docs
                        </Button>
                      </Link>
                    </div>
                  ))}
                </div>
              </div>
            </TabsContent>

            {/* G. Checklist */}
            <TabsContent value="checklist">
              <div className="rounded-lg border bg-card overflow-hidden">
                <div className="p-4 border-b bg-muted/20 flex items-center justify-between">
                  <div>
                    <h3 className="font-semibold text-sm flex items-center gap-2">
                      <ClipboardCheck className="h-4 w-4 text-primary" />
                      Completion Checklist
                    </h3>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {completedChecklist} of {action.checklistItems.length} items complete ({checkPct}%)
                    </p>
                  </div>
                  <div className="text-right">
                    {checkPct === 100 ? (
                      <span className="text-xs text-emerald-400 font-medium">✓ All items complete</span>
                    ) : (
                      <span className="text-xs text-muted-foreground">{action.checklistItems.length - completedChecklist} remaining</span>
                    )}
                  </div>
                </div>
                <div className="divide-y">
                  {action.checklistItems
                    .sort((a, b) => a.sortOrder - b.sortOrder)
                    .map((item) => (
                      <div
                        key={item.id}
                        className="flex items-start gap-3 p-4 hover:bg-muted/20 transition-colors"
                      >
                        <Checkbox
                          checked={item.completed}
                          disabled={!canUpdateStatus}
                          onCheckedChange={(checked) => {
                            checklistMutation.mutate({
                              itemId: item.id,
                              completed: !!checked,
                            });
                          }}
                          className="mt-0.5"
                        />
                        <div className="flex-1 min-w-0 space-y-1.5">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span
                              className={cn(
                                "text-sm leading-relaxed",
                                item.completed
                                  ? "line-through text-muted-foreground"
                                  : "text-foreground"
                              )}
                            >
                              {item.label}
                            </span>
                            <span
                              className={cn(
                                "text-[10px] font-semibold px-1.5 py-0.5 rounded border shrink-0",
                                item.isRequired
                                  ? "bg-red-500/10 text-red-300 border-red-500/30"
                                  : "bg-slate-500/10 text-slate-300 border-slate-500/30"
                              )}
                            >
                              {item.isRequired ? "Required" : "Optional"}
                            </span>
                          </div>
                          {item.completedBy && (
                            <div className="text-[10px] text-muted-foreground">
                              Completed by {item.completedBy}
                            </div>
                          )}
                          <Input
                            defaultValue={item.notes ?? ""}
                            disabled={!canUpdateStatus}
                            placeholder="Add a note (optional)…"
                            className="h-7 text-xs"
                            onBlur={(e) => {
                              const value = e.target.value;
                              if (value !== (item.notes ?? "")) {
                                checklistMutation.mutate({
                                  itemId: item.id,
                                  completed: item.completed,
                                  notes: value || null,
                                });
                              }
                            }}
                          />
                        </div>
                      </div>
                    ))}
                </div>
              </div>

              {checkPct === 100 && currentStatus !== "complete" && (
                <div className="mt-3 rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-4 flex items-center justify-between">
                  <div className="flex items-center gap-2 text-sm text-emerald-300">
                    <CheckSquare className="h-4 w-4 shrink-0" />
                    All checklist items complete. Mark this action as Ready for Review?
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    className="border-emerald-500/30 text-emerald-300 hover:bg-emerald-500/20"
                    disabled={!canUpdateStatus || progressMutation.isPending}
                    onClick={() => {
                      setLocalStatus("ready_for_review");
                      progressMutation.mutate({
                        status: "ready_for_review",
                        owner: localOwner || null,
                        targetDate: localTargetDate || null,
                        notes: localNotes || null,
                      });
                    }}
                  >
                    Mark Ready for Review
                  </Button>
                </div>
              )}
            </TabsContent>
          </Tabs>
        </div>

        {/* ── RIGHT COLUMN ── */}
        <div className="w-full lg:w-80 xl:w-96 shrink-0 sticky top-6 self-start">
          <ActionProgressPanel
            computedProgress={action.computedProgress}
            progress={action.progress}
            localOwner={localOwner}
            localTargetDate={localTargetDate}
            localNotes={localNotes}
            localStatus={currentStatus}
            overrideJustification={overrideJustification}
            canUpdateStatus={canUpdateStatus}
            canMarkComplete={canMarkComplete}
            userRole={user?.role}
            setLocalOwner={setLocalOwner}
            setLocalTargetDate={setLocalTargetDate}
            setLocalNotes={setLocalNotes}
            setLocalStatus={setLocalStatus}
            setOverrideJustification={setOverrideJustification}
            onSaveProgress={handleSaveProgress}
            onReopenAction={() => reopenMutation.mutate()}
            onSubmitForReview={handleSubmitForReview}
            onApproveComplete={handleApproveComplete}
            isSaving={progressMutation.isPending || reopenMutation.isPending}
            onTabChange={setActiveTab}
          />
        </div>
      </div>

      {/* Upload Evidence Modal */}
      {activeOrg?.id && (
        <UploadEvidenceModal
          open={!!uploadModalItem}
          onClose={() => setUploadModalItem(null)}
          item={uploadModalItem}
          actionId={id}
          orgId={activeOrg.id}
          controlLinks={action.controls}
          onSuccess={() => {
            queryClient.invalidateQueries({ queryKey: ["roadmap-action", id, activeOrg.id] });
          }}
        />
      )}

      {/* Override Dialog */}
      <OverrideDialog
        open={overrideDialogOpen}
        onClose={() => setOverrideDialogOpen(false)}
        onSubmit={(data) => overrideMutation.mutate(data)}
        isPending={overrideMutation.isPending}
      />
    </div>
  );
}
