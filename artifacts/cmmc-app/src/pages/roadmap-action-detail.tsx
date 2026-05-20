import { useState } from "react";
import { Link, useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useOrg } from "@/context/OrgContext";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
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
  Zap,
  AlertTriangle,
  Info,
  BookOpen,
  Upload,
  ExternalLink,
} from "lucide-react";
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

interface EvidenceItem {
  id: string;
  title: string;
  evidenceType: string;
  suggestedFilename: string;
  sourceSystem: string;
  mustShow: string;
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
  completed: boolean;
}

interface Progress {
  status: string;
  owner: string | null;
  targetDate: string | null;
  result: string | null;
  notes: string | null;
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

export default function RoadmapActionDetail({ id }: { id: string }) {
  const { activeOrg } = useOrg();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [, navigate] = useLocation();

  const [localStatus, setLocalStatus] = useState<string | null>(null);
  const [localOwner, setLocalOwner] = useState<string | null>(null);
  const [localTargetDate, setLocalTargetDate] = useState<string | null>(null);
  const [localResult, setLocalResult] = useState<string | null>(null);
  const [localNotes, setLocalNotes] = useState<string | null>(null);
  const [initialized, setInitialized] = useState(false);

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
        setLocalResult(data.progress?.result ?? "");
        setLocalNotes(data.progress?.notes ?? "");
        setInitialized(true);
      }
    },
  } as any);

  const progressMutation = useMutation({
    mutationFn: async (payload: Record<string, string | null>) => {
      const res = await fetch(`/api/roadmap/actions/${id}/progress`, {
        method: "PATCH",
        headers: makeHeaders(activeOrg!.id),
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error("Failed to save progress");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["roadmap-actions"] });
      queryClient.invalidateQueries({ queryKey: ["roadmap-action", id] });
      toast({ title: "Progress saved" });
    },
    onError: () => toast({ title: "Failed to save", variant: "destructive" }),
  });

  const checklistMutation = useMutation({
    mutationFn: async ({
      itemId,
      completed,
    }: {
      itemId: string;
      completed: boolean;
    }) => {
      const res = await fetch(
        `/api/roadmap/actions/${id}/checklist/${itemId}`,
        {
          method: "POST",
          headers: makeHeaders(activeOrg!.id),
          body: JSON.stringify({ completed }),
        }
      );
      if (!res.ok) throw new Error("Failed to update checklist");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["roadmap-action", id] });
      queryClient.invalidateQueries({ queryKey: ["roadmap-actions"] });
    },
  });

  const handleSaveProgress = () => {
    progressMutation.mutate({
      status: localStatus,
      owner: localOwner || null,
      targetDate: localTargetDate || null,
      result: localResult || null,
      notes: localNotes || null,
    });
  };

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

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      {/* Back + header */}
      <div>
        <Link href="/roadmap">
          <button className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-4 transition-colors">
            <ArrowLeft className="h-4 w-4" />
            Implementation Roadmap
          </button>
        </Link>

        <div className="flex flex-wrap items-start gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2 mb-1">
              <h1 className="text-xl font-bold">{action.title}</h1>
              <span
                className={cn(
                  "text-[10px] font-semibold px-2 py-0.5 rounded border uppercase tracking-wide",
                  PRIORITY_COLORS[action.priority]
                )}
              >
                {action.priority}
              </span>
            </div>
            <div className="flex flex-wrap gap-3 text-sm text-muted-foreground">
              <span className="font-medium text-foreground/70">{action.category}</span>
              <span>Phase {action.phase}: {action.phaseName}</span>
              <span className="capitalize">{action.effort} effort</span>
              <span className="flex items-center gap-1">
                <Zap className="h-3.5 w-3.5 text-primary" />
                Impact Score: <strong className="text-foreground">{action.impactScore}</strong>
              </span>
            </div>
          </div>

          {/* Progress panel */}
          <div className="rounded-lg border bg-card p-4 w-72 space-y-3 shrink-0">
            <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Progress</div>
            <div className="space-y-2">
              <Select value={currentStatus} onValueChange={setLocalStatus}>
                <SelectTrigger className="h-8 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STATUS_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Input
                placeholder="Owner"
                value={localOwner ?? ""}
                onChange={(e) => setLocalOwner(e.target.value)}
                className="h-8 text-sm"
              />
              <Input
                type="date"
                value={localTargetDate ?? ""}
                onChange={(e) => setLocalTargetDate(e.target.value)}
                className="h-8 text-sm"
              />
              <Select
                value={localResult ?? ""}
                onValueChange={setLocalResult}
              >
                <SelectTrigger className="h-8 text-sm">
                  <SelectValue placeholder="Result (optional)" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">No result yet</SelectItem>
                  {RESULT_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Textarea
                placeholder="Notes…"
                value={localNotes ?? ""}
                onChange={(e) => setLocalNotes(e.target.value)}
                className="text-sm min-h-16 resize-none"
              />
              <Button
                size="sm"
                className="w-full"
                onClick={handleSaveProgress}
                disabled={progressMutation.isPending}
              >
                Save Progress
              </Button>
            </div>
            {localResult === "failed" && (
              <div className="flex items-start gap-2 text-xs text-yellow-300 bg-yellow-500/10 border border-yellow-500/20 rounded p-2">
                <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                Create a POA&M for this action in the{" "}
                <Link href="/poams">
                  <span className="underline cursor-pointer">POA&Ms</span>
                </Link>{" "}
                module.
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="overview" className="space-y-4">
        <TabsList className="flex-wrap h-auto gap-1">
          <TabsTrigger value="overview" className="gap-1.5">
            <Lightbulb className="h-3.5 w-3.5" />
            Overview
          </TabsTrigger>
          <TabsTrigger value="controls" className="gap-1.5">
            <ShieldCheck className="h-3.5 w-3.5" />
            Controls ({action.controls.length})
          </TabsTrigger>
          <TabsTrigger value="procedure" className="gap-1.5">
            <ListOrdered className="h-3.5 w-3.5" />
            Procedure
          </TabsTrigger>
          <TabsTrigger value="test" className="gap-1.5">
            <TestTube className="h-3.5 w-3.5" />
            Test Procedure
          </TabsTrigger>
          <TabsTrigger value="evidence" className="gap-1.5">
            <FolderSearch className="h-3.5 w-3.5" />
            Evidence ({action.evidenceItems.length})
          </TabsTrigger>
          <TabsTrigger value="documents" className="gap-1.5">
            <FileText className="h-3.5 w-3.5" />
            Documents ({action.documents.length})
          </TabsTrigger>
          <TabsTrigger value="checklist" className="gap-1.5">
            <CheckSquare className="h-3.5 w-3.5" />
            Checklist ({completedChecklist}/{action.checklistItems.length})
          </TabsTrigger>
        </TabsList>

        {/* A. Overview = Purpose + Why */}
        <TabsContent value="overview" className="space-y-4">
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

        {/* C. Operating Procedure */}
        <TabsContent value="procedure">
          <div className="rounded-lg border bg-card p-5">
            <div className="flex items-center gap-2 text-sm font-semibold mb-4">
              <BookOpen className="h-4 w-4 text-primary" />
              Operating Procedure
            </div>
            <StepList text={action.operatingProcedure} />
          </div>
        </TabsContent>

        {/* D. Test Procedure */}
        <TabsContent value="test">
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
                Upload each item to the Evidence module and link to the listed controls.
              </p>
            </div>
            <div className="divide-y">
              {action.evidenceItems.map((ev, idx) => (
                <div key={ev.id} className="p-4 space-y-2">
                  <div className="flex items-start gap-3">
                    <span className="shrink-0 w-6 h-6 rounded-full bg-primary/10 border border-primary/20 text-primary text-xs font-bold flex items-center justify-center mt-0.5">
                      {idx + 1}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-sm">{ev.title}</div>
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
                    <Link href="/evidence/upload">
                      <Button variant="outline" size="sm" className="gap-1.5 shrink-0">
                        <Upload className="h-3.5 w-3.5" />
                        Upload
                      </Button>
                    </Link>
                  </div>
                  <div className="ml-9 text-xs text-muted-foreground">
                    <span className="font-medium text-foreground/60">Linked controls:</span>{" "}
                    {action.controls.map((c) => c.controlRef).join(", ")}
                  </div>
                </div>
              ))}
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
                  <label
                    key={item.id}
                    className="flex items-start gap-3 p-4 cursor-pointer hover:bg-muted/20 transition-colors"
                  >
                    <Checkbox
                      checked={item.completed}
                      onCheckedChange={(checked) => {
                        checklistMutation.mutate({
                          itemId: item.id,
                          completed: !!checked,
                        });
                      }}
                      className="mt-0.5"
                    />
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
                  </label>
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
                onClick={() => {
                  setLocalStatus("ready_for_review");
                  progressMutation.mutate({
                    status: "ready_for_review",
                    owner: localOwner || null,
                    targetDate: localTargetDate || null,
                    result: localResult || null,
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
  );
}
