import { useState } from "react";
import {
  useGetDocument,
  useUpdateDocument,
  useSubmitDocumentForReview,
  useApproveDocument,
  useRejectDocument,
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { Link } from "wouter";
import {
  ArrowLeft, Edit, Save, X, CheckCircle2, XCircle, Send, Clock, History,
  Download, Eye, AlertCircle, FileIcon, Code2, ChevronDown, ChevronRight as ChevronRightIcon,
} from "lucide-react";
import { useOrg } from "@/context/OrgContext";
import { useAuth } from "@/lib/auth";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

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

function DocFileCard({ docId, fileKey, fileName, fileSize }: {
  docId: string;
  fileKey: string;
  fileName?: string | null;
  fileSize?: string | null;
}) {
  const { activeOrg } = useOrg();
  const { toast } = useToast();
  const [loadState, setLoadState] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);

  const ext = (fileName ?? fileKey).split(".").pop()?.toLowerCase() ?? "";
  const isLegacyKey = !fileKey.startsWith("/objects/");
  const isImage = ["png", "jpg", "jpeg", "webp", "gif", "svg"].includes(ext);
  const isPdf = ext === "pdf";
  const isPreviewable = (isImage || isPdf) && !isLegacyKey;

  const FILE_ICONS: Record<string, string> = {
    pdf: "📄", docx: "📝", doc: "📝", xlsx: "📊", xls: "📊",
    png: "🖼️", jpg: "🖼️", jpeg: "🖼️", gif: "🖼️", webp: "🖼️",
    csv: "📊", txt: "📃", log: "📃", json: "📃",
  };
  const icon = FILE_ICONS[ext] ?? "📁";

  const sizeLabel = fileSize
    ? Number(fileSize) > 1024 * 1024
      ? `${(Number(fileSize) / 1024 / 1024).toFixed(1)} MB`
      : `${(Number(fileSize) / 1024).toFixed(0)} KB`
    : null;

  const getHeaders = () => ({
    Authorization: `Bearer ${localStorage.getItem("auth_token")}`,
    ...(activeOrg?.id ? { "X-Organization-ID": activeOrg.id } : {}),
  });

  const handlePreview = async () => {
    setPreviewOpen(true);
    if (blobUrl) return;
    setLoadState("loading");
    try {
      const res = await fetch(`/api/documents/${docId}/preview`, { headers: getHeaders() });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Preview failed");
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      setBlobUrl(url);
      setLoadState("ready");
    } catch (err: any) {
      setLoadState("error");
      toast({ title: err.message ?? "Failed to load preview", variant: "destructive" });
      setPreviewOpen(false);
    }
  };

  const handleDownload = async () => {
    try {
      const res = await fetch(`/api/documents/${docId}/download`, { headers: getHeaders() });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Download failed");
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = fileName ?? "document";
      a.click();
      URL.revokeObjectURL(url);
    } catch (err: any) {
      toast({ title: err.message ?? "Download failed", variant: "destructive" });
    }
  };

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Attached File</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-start gap-3 mb-4">
            <span className="text-3xl leading-none shrink-0">{icon}</span>
            <div className="min-w-0 flex-1">
              <p className="font-medium text-sm truncate">{fileName ?? fileKey}</p>
              <div className="flex items-center gap-2 mt-0.5">
                {ext && <span className="text-xs text-muted-foreground uppercase font-mono">{ext}</span>}
                {sizeLabel && <span className="text-xs text-muted-foreground">{sizeLabel}</span>}
              </div>
            </div>
          </div>
          {isLegacyKey && (
            <div className="flex items-start gap-2 mb-4 p-3 rounded-md bg-amber-50 border border-amber-200 text-amber-800 text-xs">
              <AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
              <span>This file was uploaded before cloud storage migration and may no longer be accessible. Re-upload the file to restore access.</span>
            </div>
          )}
          <div className="flex gap-2">
            {isPreviewable && (
              <Button variant="outline" size="sm" onClick={handlePreview} disabled={loadState === "loading"}>
                <Eye className="h-3.5 w-3.5 mr-1.5" />
                {loadState === "loading" ? "Loading…" : "Preview"}
              </Button>
            )}
            {!isLegacyKey && (
              <Button variant="outline" size="sm" onClick={handleDownload}>
                <Download className="h-3.5 w-3.5 mr-1.5" />
                Download
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col p-0 gap-0">
          <div className="flex items-center justify-between px-4 py-3 border-b shrink-0">
            <span className="font-medium text-sm truncate">{fileName ?? fileKey}</span>
            <Button variant="ghost" size="icon" onClick={() => setPreviewOpen(false)} className="shrink-0 h-7 w-7">
              <X className="h-4 w-4" />
            </Button>
          </div>
          <div className="flex-1 overflow-hidden min-h-0">
            {loadState === "ready" && blobUrl && (
              isImage ? (
                <div className="h-full overflow-auto flex items-center justify-center p-4">
                  <img src={blobUrl} alt={fileName ?? "Document"} className="max-w-full max-h-full object-contain" />
                </div>
              ) : (
                <iframe src={blobUrl} className="w-full h-[75vh] border-0" title={fileName ?? "PDF"} />
              )
            )}
            {loadState === "loading" && (
              <div className="flex items-center justify-center h-40 text-muted-foreground text-sm">
                Loading preview…
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

export default function DocumentDetail({ id }: { id: string }) {
  const { toast } = useToast();
  const { user } = useAuth();
  const { data: doc, isLoading, refetch } = useGetDocument(id);

  const [editing, setEditing] = useState(false);
  const [editBody, setEditBody] = useState("");
  const [editTitle, setEditTitle] = useState("");
  const [rawSourceOpen, setRawSourceOpen] = useState(false);

  const [reviewDialog, setReviewDialog] = useState<"submit" | "approve" | "reject" | null>(null);
  const [dialogNotes, setDialogNotes] = useState("");
  const [reviewerId, setReviewerId] = useState("");

  const { mutate: updateDoc, isPending: isUpdating } = useUpdateDocument();
  const { mutate: submitReview, isPending: isSubmitting } = useSubmitDocumentForReview();
  const { mutate: approveDoc, isPending: isApproving } = useApproveDocument();
  const { mutate: rejectDoc, isPending: isRejecting } = useRejectDocument();

  const isActionPending = isUpdating || isSubmitting || isApproving || isRejecting;

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

  const fileKey = (doc as any).fileKey as string | null | undefined;
  const fileName = (doc as any).fileName as string | null | undefined;
  const fileSize = (doc as any).fileSize as string | null | undefined;
  const body = (doc as any).body as string | null | undefined;
  const linkedControlDetails = (doc as any).linkedControlDetails as {
    id: string; label: string; title: string; domainName: string | null; level: string | null;
  }[] | undefined;

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
            </>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="md:col-span-2 space-y-4">
          {editing ? (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Document Body</CardTitle>
              </CardHeader>
              <CardContent>
                <Textarea
                  value={editBody}
                  onChange={(e) => setEditBody(e.target.value)}
                  className="min-h-[400px] font-mono text-sm"
                />
              </CardContent>
            </Card>
          ) : fileKey ? (
            <DocFileCard docId={id} fileKey={fileKey} fileName={fileName} fileSize={fileSize} />
          ) : body ? (
            <>
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Document Body</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="prose prose-sm max-w-none overflow-y-auto max-h-[640px] rounded-md border bg-white p-5
                    prose-headings:text-[#1a3a5c] prose-headings:font-semibold
                    prose-h1:text-xl prose-h2:text-lg prose-h3:text-base
                    prose-p:text-gray-700 prose-li:text-gray-700
                    prose-strong:text-gray-900 prose-table:text-sm
                    prose-code:text-primary prose-code:bg-muted prose-code:px-1 prose-code:rounded">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{body}</ReactMarkdown>
                  </div>
                </CardContent>
              </Card>

              {/* Raw source — admin only, collapsed */}
              {user?.role === "admin" && (
                <Collapsible open={rawSourceOpen} onOpenChange={setRawSourceOpen}>
                  <Card className="border-dashed border-muted-foreground/30">
                    <CollapsibleTrigger asChild>
                      <CardHeader className="pb-2 cursor-pointer hover:bg-muted/30 rounded-t-lg transition-colors">
                        <CardTitle className="text-xs flex items-center gap-1.5 text-muted-foreground font-normal">
                          <Code2 className="h-3.5 w-3.5" />
                          Technical Source (Admin Only)
                          {rawSourceOpen ? <ChevronDown className="h-3.5 w-3.5 ml-auto" /> : <ChevronRightIcon className="h-3.5 w-3.5 ml-auto" />}
                        </CardTitle>
                      </CardHeader>
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                      <CardContent>
                        <pre className="text-xs bg-muted/50 rounded p-4 overflow-x-auto max-h-80 overflow-y-auto font-mono leading-relaxed whitespace-pre-wrap">
                          {body.slice(0, 6000)}{body.length > 6000 ? "\n\n…[truncated]" : ""}
                        </pre>
                      </CardContent>
                    </CollapsibleContent>
                  </Card>
                </Collapsible>
              )}
            </>
          ) : (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Document Content</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-col items-center py-8 text-center text-muted-foreground">
                  <FileIcon className="h-10 w-10 mb-3 opacity-25" />
                  <p className="text-sm font-medium">No content attached</p>
                  <p className="text-xs mt-1 max-w-xs text-muted-foreground">
                    This document has no file or body text. Use "Add Document" to create a new one with an uploaded file, or click Edit to add body text.
                  </p>
                </div>
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
            </CardContent>
          </Card>

          {linkedControlDetails && linkedControlDetails.length > 0 ? (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Linked Controls</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {linkedControlDetails.map((c) => (
                    <Link key={c.id} href={`/controls/${c.id}`}>
                      <div className="flex items-start gap-2 p-2 rounded hover:bg-muted/50 cursor-pointer group">
                        <Badge variant="secondary" className="text-xs shrink-0 font-mono mt-0.5">{c.label}</Badge>
                        <div className="min-w-0">
                          <p className="text-xs font-medium group-hover:text-primary truncate">{c.title}</p>
                          {c.domainName && (
                            <p className="text-xs text-muted-foreground truncate">{c.domainName}</p>
                          )}
                        </div>
                      </div>
                    </Link>
                  ))}
                </div>
              </CardContent>
            </Card>
          ) : (doc as any).linkedControlIds?.length > 0 ? (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Linked Controls</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-1">
                  {(doc as any).linkedControlLabels?.map((label: string, i: number) => (
                    <Link key={i} href={`/controls/${(doc as any).linkedControlIds[i]}`}>
                      <Badge variant="secondary" className="text-xs cursor-pointer hover:bg-secondary/80">{label}</Badge>
                    </Link>
                  ))}
                </div>
              </CardContent>
            </Card>
          ) : null}

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
                  "Reject"
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
