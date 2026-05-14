import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import {
  CheckCircle2,
  Circle,
  Clock,
  MinusCircle,
  ChevronDown,
  ChevronRight,
  Monitor,
  Navigation,
  Settings,
  Target,
  FileText,
  TestTube,
  ListChecks,
  Lightbulb,
  Building2,
  ClipboardCheck,
  AlertCircle,
  Loader2,
} from "lucide-react";

// ── Fetch helpers ──────────────────────────────────────────────────────────

function makeHeaders(orgId: string) {
  const token = localStorage.getItem("auth_token");
  return {
    Authorization: `Bearer ${token}`,
    "X-Organization-ID": orgId,
    "Content-Type": "application/json",
  };
}

// ── Types ──────────────────────────────────────────────────────────────────

interface EvidenceRequirement {
  title: string;
  type: string;
  filename: string;
  location: string;
  mustShow: string;
}

interface TestProcedure {
  name: string;
  steps: string;
  expectedResult: string;
  passCriteria: string;
}

interface ConfigureContent {
  id: string;
  implementationApproach: string | null;
  systemsUsed: string[];
  evidenceRequirements: EvidenceRequirement[];
  testProcedures: TestProcedure[];
  closeoutChecklist: string[];
}

interface StepProgress {
  status: "not_started" | "in_progress" | "complete" | "not_applicable";
  notes: string | null;
  completedBy: string | null;
  completedAt: string | null;
}

interface ConfigStep {
  id: string;
  stepNumber: number;
  title: string;
  instruction: string;
  systemPortal: string | null;
  navigationPath: string | null;
  recommendedSetting: string | null;
  expectedResult: string | null;
  evidenceHint: string | null;
  progress: StepProgress;
}

interface ConfigureData {
  content: ConfigureContent | null;
  steps: ConfigStep[];
}

// ── Helpers ────────────────────────────────────────────────────────────────

const STATUS_CONFIG = {
  not_started: {
    label: "Not Started",
    icon: Circle,
    color: "text-muted-foreground",
    bg: "bg-card",
    badge: "secondary" as const,
  },
  in_progress: {
    label: "In Progress",
    icon: Clock,
    color: "text-blue-600",
    bg: "bg-blue-50 dark:bg-blue-950/20",
    badge: "outline" as const,
  },
  complete: {
    label: "Complete",
    icon: CheckCircle2,
    color: "text-green-600",
    bg: "bg-green-50 dark:bg-green-950/20",
    badge: "default" as const,
  },
  not_applicable: {
    label: "N/A",
    icon: MinusCircle,
    color: "text-muted-foreground",
    bg: "bg-muted/30",
    badge: "outline" as const,
  },
};

function completionSummary(steps: ConfigStep[]) {
  const total = steps.length;
  const complete = steps.filter((s) => s.progress.status === "complete").length;
  const na = steps.filter((s) => s.progress.status === "not_applicable").length;
  const inProgress = steps.filter((s) => s.progress.status === "in_progress").length;
  const pct = total > 0 ? Math.round(((complete + na) / total) * 100) : 0;
  return { total, complete, na, inProgress, pct };
}

// ── Step Card ──────────────────────────────────────────────────────────────

function StepCard({
  step,
  controlDbId,
  orgId,
  isAssessor,
  onUpdated,
}: {
  step: ConfigStep;
  controlDbId: string;
  orgId: string;
  isAssessor: boolean;
  onUpdated: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [editingNotes, setEditingNotes] = useState(false);
  const [notesValue, setNotesValue] = useState(step.progress.notes ?? "");
  const { toast } = useToast();

  const mutation = useMutation({
    mutationFn: async (patch: { status?: string; notes?: string }) => {
      const res = await fetch(
        `/api/controls/${controlDbId}/configure/steps/${step.id}/progress`,
        {
          method: "PATCH",
          headers: makeHeaders(orgId),
          body: JSON.stringify(patch),
        }
      );
      if (!res.ok) throw new Error("Failed to update step");
      return res.json();
    },
    onSuccess: onUpdated,
    onError: () =>
      toast({ title: "Error", description: "Could not save progress.", variant: "destructive" }),
  });

  const cfg = STATUS_CONFIG[step.progress.status];
  const Icon = cfg.icon;

  return (
    <div className={`rounded-lg border ${cfg.bg} transition-all`}>
      {/* Step header row */}
      <button
        className="w-full flex items-start gap-3 p-4 text-left"
        onClick={() => setExpanded((v) => !v)}
      >
        <span className={`mt-0.5 shrink-0 ${cfg.color}`}>
          <Icon className="h-5 w-5" />
        </span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-mono text-muted-foreground">Step {step.stepNumber}</span>
            <span className="font-medium text-sm">{step.title}</span>
          </div>
          {step.systemPortal && (
            <p className="text-xs text-muted-foreground mt-0.5">{step.systemPortal}</p>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Badge variant={cfg.badge} className="text-xs">{cfg.label}</Badge>
          {expanded ? (
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          ) : (
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          )}
        </div>
      </button>

      {expanded && (
        <div className="px-4 pb-4 space-y-4 border-t pt-4">
          {/* Instruction */}
          <div>
            <p className="text-xs font-semibold uppercase text-muted-foreground mb-1">Instruction</p>
            <p className="text-sm leading-relaxed">{step.instruction}</p>
          </div>

          {/* Detail grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {step.navigationPath && (
              <div className="flex gap-2 text-sm">
                <Navigation className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
                <div>
                  <p className="text-xs text-muted-foreground font-medium">Navigation Path</p>
                  <p className="font-mono text-xs bg-muted/60 rounded px-2 py-1 mt-0.5 break-all">
                    {step.navigationPath}
                  </p>
                </div>
              </div>
            )}
            {step.recommendedSetting && (
              <div className="flex gap-2 text-sm">
                <Settings className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
                <div>
                  <p className="text-xs text-muted-foreground font-medium">Recommended Setting</p>
                  <p className="text-sm mt-0.5">{step.recommendedSetting}</p>
                </div>
              </div>
            )}
            {step.expectedResult && (
              <div className="flex gap-2 text-sm">
                <Target className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
                <div>
                  <p className="text-xs text-muted-foreground font-medium">Expected Result</p>
                  <p className="text-sm mt-0.5">{step.expectedResult}</p>
                </div>
              </div>
            )}
            {step.evidenceHint && (
              <div className="flex gap-2 text-sm">
                <FileText className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
                <div>
                  <p className="text-xs text-muted-foreground font-medium">Evidence to Capture</p>
                  <p className="text-sm mt-0.5 text-amber-700 dark:text-amber-400">
                    {step.evidenceHint}
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Notes */}
          <div>
            <p className="text-xs font-semibold uppercase text-muted-foreground mb-1">Notes</p>
            {editingNotes ? (
              <div className="space-y-2">
                <Textarea
                  className="text-sm min-h-[80px]"
                  value={notesValue}
                  onChange={(e) => setNotesValue(e.target.value)}
                  placeholder="Add notes for this step…"
                  disabled={isAssessor}
                />
                {!isAssessor && (
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      onClick={() => {
                        mutation.mutate({ notes: notesValue });
                        setEditingNotes(false);
                      }}
                      disabled={mutation.isPending}
                    >
                      Save Notes
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        setNotesValue(step.progress.notes ?? "");
                        setEditingNotes(false);
                      }}
                    >
                      Cancel
                    </Button>
                  </div>
                )}
              </div>
            ) : (
              <div
                className="text-sm text-muted-foreground cursor-pointer hover:text-foreground"
                onClick={() => !isAssessor && setEditingNotes(true)}
              >
                {step.progress.notes || (
                  <span className="italic">
                    {isAssessor ? "No notes." : "Click to add notes…"}
                  </span>
                )}
              </div>
            )}
          </div>

          {step.progress.completedAt && (
            <p className="text-xs text-muted-foreground">
              Completed:{" "}
              {new Date(step.progress.completedAt).toLocaleDateString("en-US", {
                dateStyle: "medium",
              })}
            </p>
          )}

          {/* Status controls */}
          {!isAssessor && (
            <div className="flex items-center gap-2 flex-wrap pt-1 border-t">
              <Select
                value={step.progress.status}
                onValueChange={(v) => mutation.mutate({ status: v })}
                disabled={mutation.isPending}
              >
                <SelectTrigger className="w-40 h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="not_started">Not Started</SelectItem>
                  <SelectItem value="in_progress">In Progress</SelectItem>
                  <SelectItem value="complete">Complete</SelectItem>
                  <SelectItem value="not_applicable">Not Applicable</SelectItem>
                </SelectContent>
              </Select>

              {step.progress.status !== "complete" && (
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 text-xs border-green-300 text-green-700 hover:bg-green-50"
                  onClick={() => mutation.mutate({ status: "complete" })}
                  disabled={mutation.isPending}
                >
                  {mutation.isPending ? (
                    <Loader2 className="h-3 w-3 animate-spin mr-1" />
                  ) : (
                    <CheckCircle2 className="h-3.5 w-3.5 mr-1" />
                  )}
                  Mark Complete
                </Button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Main ConfigureTab ──────────────────────────────────────────────────────

interface ConfigureTabProps {
  controlDbId: string;
  controlId: string; // e.g. "AC.L1-3.1.1"
  orgId: string;
  isAssessor: boolean;
}

export function ConfigureTab({ controlDbId, controlId, orgId, isAssessor }: ConfigureTabProps) {
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery<ConfigureData>({
    queryKey: ["configure", controlDbId, orgId],
    queryFn: async () => {
      const res = await fetch(`/api/controls/${controlDbId}/configure`, {
        headers: makeHeaders(orgId),
      });
      if (!res.ok) throw new Error("Failed to fetch configure data");
      return res.json();
    },
    staleTime: 30_000,
    enabled: !!controlDbId && !!orgId,
  });

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ["configure", controlDbId, orgId] });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20 text-muted-foreground gap-2">
        <Loader2 className="h-5 w-5 animate-spin" />
        Loading configuration guide…
      </div>
    );
  }

  const hasContent = data?.content != null;
  const steps = data?.steps ?? [];
  const content = data?.content;
  const summary = completionSummary(steps);

  if (!hasContent && steps.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center gap-4">
        <div className="h-14 w-14 rounded-full bg-muted flex items-center justify-center">
          <Settings className="h-7 w-7 text-muted-foreground" />
        </div>
        <div>
          <p className="font-semibold text-base">No configuration guidance yet</p>
          <p className="text-sm text-muted-foreground mt-1 max-w-md">
            Detailed step-by-step configuration guidance has not been added for{" "}
            <strong>{controlId}</strong> yet.
          </p>
        </div>
        {!isAssessor && (
          <p className="text-xs text-muted-foreground">
            Contact your system administrator to request guidance for this control.
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* ── Progress summary bar ── */}
      {steps.length > 0 && (
        <div className="rounded-xl border bg-card p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <ClipboardCheck className="h-5 w-5 text-primary" />
              <span className="font-semibold text-sm">Configuration Progress</span>
            </div>
            <span className="text-sm font-mono font-semibold text-primary">{summary.pct}%</span>
          </div>

          {/* Progress bar */}
          <div className="h-2 rounded-full bg-muted overflow-hidden">
            <div
              className="h-full rounded-full bg-green-500 transition-all duration-500"
              style={{ width: `${summary.pct}%` }}
            />
          </div>

          <div className="flex gap-4 mt-3 text-xs text-muted-foreground flex-wrap">
            <span className="flex items-center gap-1">
              <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
              {summary.complete} complete
            </span>
            <span className="flex items-center gap-1">
              <Clock className="h-3.5 w-3.5 text-blue-500" />
              {summary.inProgress} in progress
            </span>
            <span className="flex items-center gap-1">
              <MinusCircle className="h-3.5 w-3.5 text-muted-foreground" />
              {summary.na} N/A
            </span>
            <span className="flex items-center gap-1">
              <Circle className="h-3.5 w-3.5 text-muted-foreground" />
              {summary.total - summary.complete - summary.inProgress - summary.na} not started
            </span>
          </div>
        </div>
      )}

      {/* ── Inner tabs ── */}
      <Tabs defaultValue="steps" className="w-full">
        <TabsList className="w-full justify-start overflow-x-auto">
          <TabsTrigger value="steps" className="gap-1.5 shrink-0">
            <ListChecks className="h-4 w-4" />
            Steps ({steps.length})
          </TabsTrigger>
          <TabsTrigger value="approach" className="gap-1.5 shrink-0">
            <Lightbulb className="h-4 w-4" />
            Approach
          </TabsTrigger>
          <TabsTrigger value="evidence" className="gap-1.5 shrink-0">
            <FileText className="h-4 w-4" />
            Evidence ({content?.evidenceRequirements?.length ?? 0})
          </TabsTrigger>
          <TabsTrigger value="tests" className="gap-1.5 shrink-0">
            <TestTube className="h-4 w-4" />
            Test Procedures ({content?.testProcedures?.length ?? 0})
          </TabsTrigger>
          <TabsTrigger value="checklist" className="gap-1.5 shrink-0">
            <ClipboardCheck className="h-4 w-4" />
            Closeout
          </TabsTrigger>
        </TabsList>

        {/* ── Steps ── */}
        <TabsContent value="steps" className="mt-4 space-y-3">
          {steps.length === 0 ? (
            <div className="text-center py-10 text-muted-foreground text-sm">
              No configuration steps have been added yet.
            </div>
          ) : (
            steps.map((step) => (
              <StepCard
                key={step.id}
                step={step}
                controlDbId={controlDbId}
                orgId={orgId}
                isAssessor={isAssessor}
                onUpdated={invalidate}
              />
            ))
          )}
        </TabsContent>

        {/* ── Implementation Approach ── */}
        <TabsContent value="approach" className="mt-4 space-y-4">
          {content?.implementationApproach ? (
            <>
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Lightbulb className="h-4 w-4 text-amber-500" />
                    Implementation Approach
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-sm space-y-3">
                    {content.implementationApproach.split("\n\n").map((para, i) => (
                      <p key={i} className="leading-relaxed">{para}</p>
                    ))}
                  </div>
                </CardContent>
              </Card>

              {content.systemsUsed && content.systemsUsed.length > 0 && (
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base flex items-center gap-2">
                      <Building2 className="h-4 w-4 text-primary" />
                      Systems / Portals Used
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="flex flex-wrap gap-2">
                      {content.systemsUsed.map((sys, i) => (
                        <Badge key={i} variant="outline" className="text-xs py-1 px-2">
                          <Monitor className="h-3 w-3 mr-1.5 text-muted-foreground" />
                          {sys}
                        </Badge>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}
            </>
          ) : (
            <div className="text-center py-10 text-muted-foreground text-sm">
              No implementation approach documented yet.
            </div>
          )}
        </TabsContent>

        {/* ── Evidence Requirements ── */}
        <TabsContent value="evidence" className="mt-4 space-y-3">
          {!content?.evidenceRequirements || content.evidenceRequirements.length === 0 ? (
            <div className="text-center py-10 text-muted-foreground text-sm">
              No evidence requirements listed yet.
            </div>
          ) : (
            content.evidenceRequirements.map((ev, i) => (
              <Card key={i}>
                <CardContent className="pt-4 pb-4">
                  <div className="flex items-start gap-3">
                    <div className="h-8 w-8 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center shrink-0 mt-0.5">
                      <FileText className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                    </div>
                    <div className="flex-1 min-w-0 space-y-2">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-sm">{ev.title}</span>
                        <Badge variant="outline" className="text-xs">{ev.type}</Badge>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs text-muted-foreground">
                        <div>
                          <span className="font-medium text-foreground">Recommended Filename:</span>
                          <br />
                          <code className="bg-muted rounded px-1 text-xs break-all">{ev.filename}</code>
                        </div>
                        <div>
                          <span className="font-medium text-foreground">Where to Capture:</span>
                          <br />
                          {ev.location}
                        </div>
                        <div className="sm:col-span-2">
                          <span className="font-medium text-foreground">Must Show:</span>
                          <br />
                          {ev.mustShow}
                        </div>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </TabsContent>

        {/* ── Test Procedures ── */}
        <TabsContent value="tests" className="mt-4 space-y-4">
          {!content?.testProcedures || content.testProcedures.length === 0 ? (
            <div className="text-center py-10 text-muted-foreground text-sm">
              No test procedures documented yet.
            </div>
          ) : (
            content.testProcedures.map((tp, i) => (
              <Card key={i}>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <TestTube className="h-4 w-4 text-violet-500" />
                    Test {i + 1}: {tp.name}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 text-sm">
                  <div>
                    <p className="text-xs font-semibold uppercase text-muted-foreground mb-1">
                      Steps to Perform
                    </p>
                    <div className="bg-muted/40 rounded-md p-3 whitespace-pre-wrap font-mono text-xs leading-relaxed">
                      {tp.steps}
                    </div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="rounded-md border bg-green-50 dark:bg-green-950/20 p-3">
                      <p className="text-xs font-semibold text-green-700 dark:text-green-400 mb-1 flex items-center gap-1">
                        <CheckCircle2 className="h-3.5 w-3.5" /> Expected Result
                      </p>
                      <p className="text-xs">{tp.expectedResult}</p>
                    </div>
                    <div className="rounded-md border bg-blue-50 dark:bg-blue-950/20 p-3">
                      <p className="text-xs font-semibold text-blue-700 dark:text-blue-400 mb-1 flex items-center gap-1">
                        <Target className="h-3.5 w-3.5" /> Pass Criteria
                      </p>
                      <p className="text-xs">{tp.passCriteria}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </TabsContent>

        {/* ── Closeout Checklist ── */}
        <TabsContent value="checklist" className="mt-4">
          {!content?.closeoutChecklist || content.closeoutChecklist.length === 0 ? (
            <div className="text-center py-10 text-muted-foreground text-sm">
              No closeout checklist available.
            </div>
          ) : (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <ClipboardCheck className="h-4 w-4 text-green-600" />
                  Closeout Checklist
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {content.closeoutChecklist.map((item, i) => (
                    <div key={i} className="flex items-start gap-2.5 text-sm">
                      <div className="h-5 w-5 rounded border border-muted-foreground/30 bg-muted/30 flex items-center justify-center shrink-0 mt-0.5">
                        <span className="text-xs text-muted-foreground">{i + 1}</span>
                      </div>
                      <span>{item}</span>
                    </div>
                  ))}
                </div>
                <div className="mt-4 rounded-md bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 p-3">
                  <p className="text-xs text-amber-700 dark:text-amber-400 flex items-start gap-1.5">
                    <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                    Complete all configuration steps and upload required evidence before marking
                    this control assessment-ready.
                  </p>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
