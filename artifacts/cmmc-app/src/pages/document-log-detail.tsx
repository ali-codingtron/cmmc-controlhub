import { useState } from "react";
import {
  useGetDocumentLog,
  useCompleteDocumentLog,
  useApproveDocumentLog,
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { Link } from "wouter";
import { ArrowLeft, CheckCircle2 } from "lucide-react";

const STATUS_COLORS: Record<string, string> = {
  draft: "bg-gray-100 text-gray-700",
  pending_review: "bg-yellow-100 text-yellow-700",
  approved: "bg-green-100 text-green-700",
  active: "bg-green-100 text-green-700",
};

export default function DocumentLogDetail({ id }: { id: string }) {
  const { toast } = useToast();
  const { data: log, isLoading, refetch } = useGetDocumentLog(id);
  const { mutate: completeLog, isPending: isCompleting } = useCompleteDocumentLog();
  const { mutate: approveLog, isPending: isApproving } = useApproveDocumentLog();

  const [completeDialog, setCompleteDialog] = useState(false);
  const [completionNotes, setCompletionNotes] = useState("");
  const [generateEvidence, setGenerateEvidence] = useState(true);
  const [entryResults, setEntryResults] = useState<Record<string, boolean>>({});
  const [approveNotes, setApproveNotes] = useState("");
  const [approveDialog, setApproveDialog] = useState(false);

  if (isLoading) {
    return <div className="h-64 animate-pulse bg-muted rounded" />;
  }

  if (!log) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <p>Log not found</p>
        <Button variant="outline" asChild className="mt-4">
          <Link href="/documents/logs">Back to Logs</Link>
        </Button>
      </div>
    );
  }

  const entries = (log as any).entries ?? [];
  const status = log.status;

  const handleComplete = () => {
    const entryData = entries.map((e: any) => ({
      id: e.id,
      isCompleted: entryResults[e.id] ?? false,
    }));
    completeLog(
      {
        id,
        data: {
          completionNotes,
          entries: entryData,
          generateEvidence,
        },
      },
      {
        onSuccess: () => {
          toast({ title: "Log completed" + (generateEvidence ? " and evidence created" : "") });
          setCompleteDialog(false);
          refetch();
        },
        onError: () => toast({ title: "Failed to complete log", variant: "destructive" }),
      }
    );
  };

  const handleApprove = () => {
    approveLog(
      { id, data: { notes: approveNotes } },
      {
        onSuccess: () => {
          toast({ title: "Log approved" });
          setApproveDialog(false);
          refetch();
        },
        onError: () => toast({ title: "Failed to approve", variant: "destructive" }),
      }
    );
  };

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" asChild>
            <Link href="/documents/logs">
              <ArrowLeft className="h-4 w-4 mr-1" />
              Back
            </Link>
          </Button>
          <div>
            <h1 className="text-2xl font-bold">{log.title}</h1>
            <div className="flex items-center gap-2 mt-1">
              <span className={`text-xs font-medium px-2 py-0.5 rounded ${STATUS_COLORS[status] ?? "bg-gray-100 text-gray-700"}`}>
                {status.replace(/_/g, " ")}
              </span>
              {log.templateTitle && <span className="text-xs text-muted-foreground">{log.templateTitle}</span>}
            </div>
          </div>
        </div>
        <div className="flex gap-2">
          {status === "draft" && (
            <Button size="sm" onClick={() => setCompleteDialog(true)}>
              <CheckCircle2 className="h-3.5 w-3.5 mr-1" />
              Complete Log
            </Button>
          )}
          {status === "pending_review" && (
            <Button size="sm" className="bg-green-600 hover:bg-green-700" onClick={() => setApproveDialog(true)}>
              Approve
            </Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="md:col-span-2 space-y-4">
          {entries.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Checklist Items</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {entries.map((entry: any) => (
                    <div key={entry.id} className="flex items-start gap-3">
                      <div className={`flex-shrink-0 mt-0.5 ${entry.isCompleted ? "text-green-500" : "text-muted-foreground"}`}>
                        <CheckCircle2 className="h-4 w-4" />
                      </div>
                      <div>
                        <p className={`text-sm ${entry.isCompleted ? "line-through text-muted-foreground" : ""}`}>
                          {entry.entryText}
                        </p>
                        {entry.notes && <p className="text-xs text-muted-foreground mt-0.5">{entry.notes}</p>}
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {log.completionNotes && (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Completion Notes</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">{log.completionNotes}</p>
              </CardContent>
            </Card>
          )}
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              {log.periodStart && (
                <div>
                  <span className="text-muted-foreground">Period</span>
                  <p className="font-medium">
                    {new Date(log.periodStart).toLocaleDateString()}
                    {log.periodEnd ? ` – ${new Date(log.periodEnd).toLocaleDateString()}` : ""}
                  </p>
                </div>
              )}
              <div>
                <span className="text-muted-foreground">Responsible</span>
                <p className="font-medium">{log.responsibleUserName ?? "—"}</p>
              </div>
              {log.approvedAt && (
                <div>
                  <span className="text-muted-foreground">Approved</span>
                  <p className="font-medium">{new Date(log.approvedAt).toLocaleDateString()}</p>
                </div>
              )}
              {log.generatedEvidenceId && (
                <div>
                  <span className="text-muted-foreground">Evidence</span>
                  <Link href={`/evidence/${log.generatedEvidenceId}`} className="text-primary hover:underline text-xs block">
                    View evidence record →
                  </Link>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      <Dialog open={completeDialog} onOpenChange={setCompleteDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Complete Log</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-4">
            {entries.length > 0 && (
              <div>
                <Label>Mark Items Complete</Label>
                <div className="space-y-2 mt-2 border rounded-lg p-3">
                  {entries.map((entry: any) => (
                    <div key={entry.id} className="flex items-center gap-2">
                      <Checkbox
                        id={entry.id}
                        checked={entryResults[entry.id] ?? false}
                        onCheckedChange={(c) => setEntryResults((prev) => ({ ...prev, [entry.id]: !!c }))}
                      />
                      <Label htmlFor={entry.id} className="font-normal text-sm cursor-pointer">{entry.entryText}</Label>
                    </div>
                  ))}
                </div>
              </div>
            )}
            <div>
              <Label>Completion Notes *</Label>
              <Textarea
                value={completionNotes}
                onChange={(e) => setCompletionNotes(e.target.value)}
                placeholder="Summarize findings, actions taken..."
                className="mt-1.5"
                rows={4}
              />
            </div>
            <div className="flex items-center gap-2">
              <Checkbox
                id="gen-ev"
                checked={generateEvidence}
                onCheckedChange={(c) => setGenerateEvidence(!!c)}
              />
              <Label htmlFor="gen-ev" className="font-normal cursor-pointer">Generate evidence record</Label>
            </div>
            <div className="flex justify-end gap-3">
              <Button variant="outline" onClick={() => setCompleteDialog(false)}>Cancel</Button>
              <Button onClick={handleComplete} disabled={isCompleting || !completionNotes}>
                {isCompleting ? "Completing..." : "Complete Log"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={approveDialog} onOpenChange={setApproveDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Approve Log</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-4">
            <div>
              <Label>Notes (optional)</Label>
              <Textarea
                value={approveNotes}
                onChange={(e) => setApproveNotes(e.target.value)}
                className="mt-1.5"
                rows={3}
              />
            </div>
            <div className="flex justify-end gap-3">
              <Button variant="outline" onClick={() => setApproveDialog(false)}>Cancel</Button>
              <Button onClick={handleApprove} disabled={isApproving} className="bg-green-600 hover:bg-green-700">
                {isApproving ? "Approving..." : "Approve"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
