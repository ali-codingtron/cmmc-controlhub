import { useState } from "react";
import {
  useGetDocument,
  useUpdateDocument,
  useSubmitDocumentForReview,
  useApproveDocument,
  useRejectDocument,
  useActivateDocument,
  useArchiveDocument,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { Link } from "wouter";
import {
  ArrowLeft, Edit, Save, X, CheckCircle2, XCircle, Send, Play, Archive, Clock, History
} from "lucide-react";

const DOC_STATUS_COLORS: Record<string, string> = {
  draft: "bg-gray-100 text-gray-700",
  pending_review: "bg-yellow-100 text-yellow-700",
  approved: "bg-blue-100 text-blue-700",
  active: "bg-green-100 text-green-700",
  needs_update: "bg-orange-100 text-orange-700",
  expired: "bg-red-100 text-red-700",
  superseded: "bg-purple-100 text-purple-700",
  archived: "bg-slate-100 text-slate-700",
};

export default function DocumentDetail({ id }: { id: string }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: doc, isLoading, refetch } = useGetDocument(id);

  const [editing, setEditing] = useState(false);
  const [editBody, setEditBody] = useState("");
  const [editTitle, setEditTitle] = useState("");

  const [reviewDialog, setReviewDialog] = useState<"submit" | "approve" | "reject" | "activate" | "archive" | null>(null);
  const [dialogNotes, setDialogNotes] = useState("");
  const [reviewerId, setReviewerId] = useState("");

  const { mutate: updateDoc, isPending: isUpdating } = useUpdateDocument();
  const { mutate: submitReview, isPending: isSubmitting } = useSubmitDocumentForReview();
  const { mutate: approveDoc, isPending: isApproving } = useApproveDocument();
  const { mutate: rejectDoc, isPending: isRejecting } = useRejectDocument();
  const { mutate: activateDoc, isPending: isActivating } = useActivateDocument();
  const { mutate: archiveDoc, isPending: isArchiving } = useArchiveDocument();

  const isActionPending = isUpdating || isSubmitting || isApproving || isRejecting || isActivating || isArchiving;

  const startEdit = () => {
    setEditBody((doc as any)?.body ?? "");
    setEditTitle(doc?.title ?? "");
    setEditing(true);
  };

  const cancelEdit = () => setEditing(false);

  const saveEdit = () => {
    updateDoc(
      { id, data: { title: editTitle, body: editBody } },
      {
        onSuccess: () => {
          toast({ title: "Document updated" });
          setEditing(false);
          refetch();
        },
        onError: () => toast({ title: "Failed to update", variant: "destructive" }),
      }
    );
  };

  const handleAction = (action: typeof reviewDialog) => {
    if (!action) return;

    const onSuccess = () => {
      toast({ title: `Document ${action?.replace("_", " ")} successful` });
      setReviewDialog(null);
      setDialogNotes("");
      refetch();
    };
    const onError = () => toast({ title: "Action failed", variant: "destructive" });

    if (action === "submit") {
      submitReview({ id, data: { reviewerId: reviewerId || id, notes: dialogNotes } }, { onSuccess, onError });
    } else if (action === "approve") {
      approveDoc({ id, data: { notes: dialogNotes } }, { onSuccess, onError });
    } else if (action === "reject") {
      rejectDoc({ id, data: { rejectionNotes: dialogNotes } }, { onSuccess, onError });
    } else if (action === "activate") {
      activateDoc({ id, data: { notes: dialogNotes } }, { onSuccess, onError });
    } else if (action === "archive") {
      archiveDoc({ id, data: { notes: dialogNotes } }, { onSuccess, onError });
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="h-10 animate-pulse bg-muted rounded w-1/3" />
        <div className="h-64 animate-pulse bg-muted rounded" />
      </div>
    );
  }

  if (!doc) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <p>Document not found</p>
        <Button variant="outline" asChild className="mt-4">
          <Link href="/documents/list">Back to Documents</Link>
        </Button>
      </div>
    );
  }

  const status = doc.status;
  const canEdit = ["draft", "needs_update"].includes(status);
  const canSubmit = ["draft", "needs_update"].includes(status);
  const canApprove = status === "pending_review";
  const canActivate = status === "approved";
  const canArchive = ["active", "approved", "needs_update"].includes(status);

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" asChild>
            <Link href="/documents/list">
              <ArrowLeft className="h-4 w-4 mr-1" />
              Back
            </Link>
          </Button>
          <div>
            {editing ? (
              <Input
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                className="text-2xl font-bold h-auto py-1 border-dashed"
              />
            ) : (
              <h1 className="text-2xl font-bold">{doc.title}</h1>
            )}
            <div className="flex items-center gap-2 mt-1">
              <span className={`text-xs font-medium px-2 py-0.5 rounded ${DOC_STATUS_COLORS[status] ?? ""}`}>
                {status.replace(/_/g, " ")}
              </span>
              <span className="text-xs text-muted-foreground capitalize">{doc.docType}</span>
              <span className="text-xs text-muted-foreground">v{doc.version}</span>
              <Badge variant="outline" className="text-xs">{doc.cmmcLevel}</Badge>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap justify-end">
          {editing ? (
            <>
              <Button variant="outline" size="sm" onClick={cancelEdit}>
                <X className="h-3.5 w-3.5 mr-1" />
                Cancel
              </Button>
              <Button size="sm" onClick={saveEdit} disabled={isUpdating}>
                <Save className="h-3.5 w-3.5 mr-1" />
                {isUpdating ? "Saving..." : "Save"}
              </Button>
            </>
          ) : (
            <>
              {canEdit && (
                <Button variant="outline" size="sm" onClick={startEdit}>
                  <Edit className="h-3.5 w-3.5 mr-1" />
                  Edit
                </Button>
              )}
              {canSubmit && (
                <Button variant="outline" size="sm" onClick={() => setReviewDialog("submit")}>
                  <Send className="h-3.5 w-3.5 mr-1" />
                  Submit for Review
                </Button>
              )}
              {canApprove && (
                <>
                  <Button variant="outline" size="sm" className="border-red-300 text-red-700 hover:bg-red-50" onClick={() => setReviewDialog("reject")}>
                    <XCircle className="h-3.5 w-3.5 mr-1" />
                    Reject
                  </Button>
                  <Button size="sm" className="bg-green-600 hover:bg-green-700" onClick={() => setReviewDialog("approve")}>
                    <CheckCircle2 className="h-3.5 w-3.5 mr-1" />
                    Approve
                  </Button>
                </>
              )}
              {canActivate && (
                <Button size="sm" onClick={() => setReviewDialog("activate")}>
                  <Play className="h-3.5 w-3.5 mr-1" />
                  Activate
                </Button>
              )}
              {canArchive && (
                <Button variant="ghost" size="sm" onClick={() => setReviewDialog("archive")}>
                  <Archive className="h-3.5 w-3.5 mr-1" />
                  Archive
                </Button>
              )}
            </>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="md:col-span-2 space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Document Body</CardTitle>
            </CardHeader>
            <CardContent>
              {editing ? (
                <Textarea
                  value={editBody}
                  onChange={(e) => setEditBody(e.target.value)}
                  className="min-h-[500px] font-mono text-sm"
                />
              ) : (
                <div className="prose prose-sm max-w-none">
                  <pre className="whitespace-pre-wrap text-sm font-sans leading-relaxed">
                    {(doc as any).body}
                  </pre>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div>
                <span className="text-muted-foreground">Owner</span>
                <p className="font-medium">{(doc as any).ownerName ?? "—"}</p>
              </div>
              <div>
                <span className="text-muted-foreground">Review Frequency</span>
                <p className="font-medium capitalize">{doc.reviewFrequency?.replace(/_/g, " ")}</p>
              </div>
              {doc.effectiveDate && (
                <div>
                  <span className="text-muted-foreground">Effective Date</span>
                  <p className="font-medium">{new Date(doc.effectiveDate).toLocaleDateString()}</p>
                </div>
              )}
              {doc.nextReviewDate && (
                <div>
                  <span className="text-muted-foreground">Next Review</span>
                  <p className="font-medium">{new Date(doc.nextReviewDate).toLocaleDateString()}</p>
                </div>
              )}
              {doc.approvedAt && (
                <div>
                  <span className="text-muted-foreground">Approved</span>
                  <p className="font-medium">{new Date(doc.approvedAt).toLocaleDateString()}</p>
                </div>
              )}
              {doc.activatedAt && (
                <div>
                  <span className="text-muted-foreground">Activated</span>
                  <p className="font-medium">{new Date(doc.activatedAt).toLocaleDateString()}</p>
                </div>
              )}
            </CardContent>
          </Card>

          {doc.linkedControlIds?.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Linked Controls</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-1">
                  {doc.linkedControlLabels?.map((label, i) => (
                    <Link key={i} href={`/controls/${doc.linkedControlIds[i]}`}>
                      <Badge variant="secondary" className="text-xs cursor-pointer hover:bg-secondary/80">{label}</Badge>
                    </Link>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {(doc as any).rejectionNotes && (
            <Card className="border-red-200">
              <CardHeader>
                <CardTitle className="text-sm text-red-700">Rejection Notes</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-red-600">{(doc as any).rejectionNotes}</p>
              </CardContent>
            </Card>
          )}

          {((doc as any).reviews?.length ?? 0) > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm flex items-center gap-2">
                  <History className="h-4 w-4" />
                  Review History
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {(doc as any).reviews?.map((review: any) => (
                    <div key={review.id} className="text-sm">
                      <div className="flex justify-between">
                        <span className="font-medium capitalize">{review.action.replace(/_/g, " ")}</span>
                        <span className="text-muted-foreground text-xs">{new Date(review.reviewedAt).toLocaleDateString()}</span>
                      </div>
                      <p className="text-muted-foreground text-xs">{review.reviewerName ?? "System"}</p>
                      {review.notes && <p className="text-xs mt-0.5 text-muted-foreground italic">{review.notes}</p>}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {((doc as any).versionHistory?.length ?? 0) > 1 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm flex items-center gap-2">
                  <Clock className="h-4 w-4" />
                  Version History
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {(doc as any).versionHistory?.map((v: any) => (
                    <div key={v.id} className="text-xs">
                      <div className="flex justify-between">
                        <span className="font-medium">v{v.version}</span>
                        <span className="text-muted-foreground">{new Date(v.createdAt).toLocaleDateString()}</span>
                      </div>
                      {v.changeNotes && <p className="text-muted-foreground italic">{v.changeNotes}</p>}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      <Dialog open={!!reviewDialog} onOpenChange={(open) => !open && setReviewDialog(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {reviewDialog === "submit" && "Submit for Review"}
              {reviewDialog === "approve" && "Approve Document"}
              {reviewDialog === "reject" && "Reject Document"}
              {reviewDialog === "activate" && "Activate Document"}
              {reviewDialog === "archive" && "Archive Document"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-4">
            {reviewDialog === "submit" && (
              <div>
                <Label>Reviewer ID (optional)</Label>
                <Input
                  value={reviewerId}
                  onChange={(e) => setReviewerId(e.target.value)}
                  placeholder="User ID of reviewer..."
                  className="mt-1.5"
                />
              </div>
            )}
            <div>
              <Label>{reviewDialog === "reject" ? "Rejection Notes *" : "Notes (optional)"}</Label>
              <Textarea
                value={dialogNotes}
                onChange={(e) => setDialogNotes(e.target.value)}
                placeholder={
                  reviewDialog === "reject" ? "Provide reason for rejection..." :
                  reviewDialog === "approve" ? "Approval notes..." :
                  reviewDialog === "activate" ? "Activation notes..." :
                  "Notes..."
                }
                className="mt-1.5"
                rows={3}
              />
            </div>
            <div className="flex justify-end gap-3">
              <Button variant="outline" onClick={() => setReviewDialog(null)}>Cancel</Button>
              <Button
                onClick={() => handleAction(reviewDialog)}
                disabled={isActionPending || (reviewDialog === "reject" && !dialogNotes)}
                className={reviewDialog === "approve" ? "bg-green-600 hover:bg-green-700" : reviewDialog === "reject" ? "bg-red-600 hover:bg-red-700" : ""}
              >
                {isActionPending ? "Processing..." : (
                  reviewDialog === "submit" ? "Submit" :
                  reviewDialog === "approve" ? "Approve" :
                  reviewDialog === "reject" ? "Reject" :
                  reviewDialog === "activate" ? "Activate" :
                  "Archive"
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
