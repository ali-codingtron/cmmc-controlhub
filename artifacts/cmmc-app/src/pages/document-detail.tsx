import { useState, useEffect, useCallback } from "react";
import {
  useGetDocument,
  useUpdateDocument,
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { Link } from "wouter";
import {
  ArrowLeft, Edit, Save, X, CheckCircle2, Send, Clock, History,
  Download, Eye, AlertCircle, FileIcon, Code2, ChevronDown, ChevronRight as ChevronRightIcon,
  ClipboardCheck, AlertTriangle, UserCheck,
} from "lucide-react";
import { useOrg } from "@/context/OrgContext";
import { useAuth } from "@/lib/auth";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

// ─── Status labels ────────────────────────────────────────────────────────────

const DOC_STATUS_LABELS: Record<string, string> = {
  draft: "Draft",
  pending_review: "In Review",
  approved: "Approved",
  active: "Active",
  assessor_ready: "Assessor Ready",
  rejected: "Rejected",
  stale: "Stale",
  needs_update: "Changes Requested",
  expired: "Expired",
  superseded: "Superseded",
  archived: "Archived",
};

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

function docStatusLabel(status: string): string {
  return DOC_STATUS_LABELS[status] ?? status.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

// ─── Auth helpers ─────────────────────────────────────────────────────────────

function getAuthHeaders(orgId?: string): Record<string, string> {
  const h: Record<string, string> = {};
  const token = localStorage.getItem("auth_token");
  if (token) h["Authorization"] = `Bearer ${token}`;
  if (orgId) h["X-Organization-ID"] = orgId;
  return h;
}

// ─── DocFileCard ──────────────────────────────────────────────────────────────

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

  const headers = getAuthHeaders(activeOrg?.id);

  const handlePreview = async () => {
    setPreviewOpen(true);
    if (blobUrl) return;
    setLoadState("loading");
    try {
      const res = await fetch(`/api/documents/${docId}/preview`, { headers });
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
      const res = await fetch(`/api/documents/${docId}/download`, { headers });
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

// ─── Main component ───────────────────────────────────────────────────────────

interface Reviewer {
  id: string;
  name: string;
  email: string;
  orgRole: string;
}

export default function DocumentDetail({ id }: { id: string }) {
  const { toast } = useToast();
  const { user } = useAuth();
  const { activeOrg } = useOrg();
  const orgId = activeOrg?.id;

  const { data: doc, isLoading, refetch } = useGetDocument(id);

  const [editing, setEditing] = useState(false);
  const [editBody, setEditBody] = useState("");
  const [editTitle, setEditTitle] = useState("");
  const [rawSourceOpen, setRawSourceOpen] = useState(false);

  // Review dialogs: submit | approve | request_changes
  const [reviewDialog, setReviewDialog] = useState<"submit" | "approve" | "request_changes" | null>(null);
  const [dialogNotes, setDialogNotes] = useState("");
  const [selectedReviewerId, setSelectedReviewerId] = useState("");
  const [reviewerSearch, setReviewerSearch] = useState("");
  const [submitDueDate, setSubmitDueDate] = useState("");
  const [reviewers, setReviewers] = useState<Reviewer[]>([]);
  const [reviewersLoading, setReviewersLoading] = useState(false);
  const [actionPending, setActionPending] = useState(false);

  const { mutate: updateDoc, isPending: isUpdating } = useUpdateDocument();

  const fetchReviewers = useCallback(async () => {
    if (!orgId) return;
    setReviewersLoading(true);
    try {
      const res = await fetch(`/api/organizations/${orgId}/reviewers`, {
        headers: getAuthHeaders(orgId),
      });
      if (res.ok) {
        const data = await res.json();
        setReviewers(data);
      }
    } finally {
      setReviewersLoading(false);
    }
  }, [orgId]);

  const openSubmitDialog = () => {
    setReviewDialog("submit");
    setDialogNotes("");
    setSelectedReviewerId("");
    setReviewerSearch("");
    setSubmitDueDate("");
    fetchReviewers();
  };

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

  // Submit for review → new review-request endpoint
  const handleSubmitForReview = async () => {
    if (!selectedReviewerId) {
      toast({ title: "Please select a reviewer before submitting.", variant: "destructive" });
      return;
    }
    setActionPending(true);
    try {
      const res = await fetch(`/api/documents/${id}/review-requests`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getAuthHeaders(orgId) },
        body: JSON.stringify({
          reviewerUserId: selectedReviewerId,
          dueDate: submitDueDate || undefined,
          notes: dialogNotes || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast({ title: data.error ?? "Failed to submit for review", variant: "destructive" });
        return;
      }
      toast({ title: "Document submitted for review. The reviewer has been notified." });
      setReviewDialog(null);
      setDialogNotes("");
      refetch();
    } finally {
      setActionPending(false);
    }
  };

  // Reviewer decision → PATCH review-request
  const handleReviewDecision = async (decision: "APPROVED" | "CHANGES_REQUESTED") => {
    const pendingRequest = (doc as any)?.pendingReviewRequest;
    if (!pendingRequest?.id) {
      toast({ title: "Review request not found.", variant: "destructive" });
      return;
    }
    if (decision === "CHANGES_REQUESTED" && !dialogNotes.trim()) {
      toast({ title: "Please describe the changes required before submitting.", variant: "destructive" });
      return;
    }
    setActionPending(true);
    try {
      const res = await fetch(`/api/documents/${id}/review-requests/${pendingRequest.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...getAuthHeaders(orgId) },
        body: JSON.stringify({ decision, notes: dialogNotes || undefined }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast({ title: data.error ?? "Failed to record decision", variant: "destructive" });
        return;
      }
      const label = decision === "APPROVED" ? "approved" : "changes requested";
      toast({ title: `Document ${label}. The author has been notified.` });
      setReviewDialog(null);
      setDialogNotes("");
      refetch();
    } finally {
      setActionPending(false);
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
          <Link href="/documents">Back to Documents</Link>
        </Button>
      </div>
    );
  }

  const status = doc.status;
  const pendingReviewRequest = (doc as any).pendingReviewRequest as {
    id: string;
    reviewerUserId: string;
    reviewerName: string;
    submitterName: string;
    submittedAt: string;
    dueDate?: string | null;
    submissionNotes?: string | null;
  } | null | undefined;

  const canEdit = ["draft", "needs_update"].includes(status);
  const canSubmit = ["draft", "needs_update"].includes(status);
  const canReview = status === "pending_review" && !!pendingReviewRequest && pendingReviewRequest.reviewerUserId === user?.id;
  const isAdmin = user?.role === "admin";

  const fileKey = (doc as any).fileKey as string | null | undefined;
  const fileName = (doc as any).fileName as string | null | undefined;
  const fileSize = (doc as any).fileSize as string | null | undefined;
  const body = (doc as any).body as string | null | undefined;
  const linkedControlDetails = (doc as any).linkedControlDetails as {
    id: string; label: string; title: string; domainName: string | null; level: string | null;
  }[] | undefined;

  const filteredReviewers = reviewerSearch
    ? reviewers.filter(
        (r) =>
          r.name.toLowerCase().includes(reviewerSearch.toLowerCase()) ||
          r.email.toLowerCase().includes(reviewerSearch.toLowerCase())
      )
    : reviewers;

  const ORG_ROLE_LABELS: Record<string, string> = {
    org_admin: "Org Admin",
    compliance_manager: "Compliance Manager",
    it_contributor: "IT Contributor",
    reviewer: "Reviewer",
  };

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" asChild>
            <Link href="/documents">
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
              <span className={`text-xs font-medium px-2 py-0.5 rounded ${DOC_STATUS_COLORS[status] ?? "bg-gray-100 text-gray-700"}`}>
                {docStatusLabel(status)}
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
                <Button variant="outline" size="sm" onClick={openSubmitDialog}>
                  <Send className="h-3.5 w-3.5 mr-1" />
                  Submit for Review
                </Button>
              )}
            </>
          )}
        </div>
      </div>

      {/* Reviewer action panel — shown to the assigned reviewer when doc is IN_REVIEW */}
      {canReview && (
        <Card className="border-yellow-200 bg-yellow-50">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2 text-yellow-800">
              <UserCheck className="h-4 w-4" />
              Review Document
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-yellow-700 mb-3">
              You are assigned to review this document.
              {pendingReviewRequest?.dueDate && (
                <span className="ml-1 font-medium">Due: {new Date(pendingReviewRequest.dueDate).toLocaleDateString()}</span>
              )}
            </p>
            {pendingReviewRequest?.submissionNotes && (
              <p className="text-xs text-yellow-600 mb-3 italic">"{pendingReviewRequest.submissionNotes}"</p>
            )}
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                className="bg-green-600 hover:bg-green-700 text-white"
                onClick={() => { setReviewDialog("approve"); setDialogNotes(""); }}
              >
                <CheckCircle2 className="h-3.5 w-3.5 mr-1.5" />
                Approve
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="border-orange-300 text-orange-700 hover:bg-orange-50"
                onClick={() => { setReviewDialog("request_changes"); setDialogNotes(""); }}
              >
                <AlertTriangle className="h-3.5 w-3.5 mr-1.5" />
                Request Changes
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Pending review info banner (for doc owner, while under review) */}
      {status === "pending_review" && !canReview && pendingReviewRequest && (
        <Card className="border-yellow-200 bg-yellow-50">
          <CardContent className="pt-4 pb-3">
            <div className="flex items-start gap-2">
              <Clock className="h-4 w-4 text-yellow-600 mt-0.5 shrink-0" />
              <div className="text-sm text-yellow-700">
                <span className="font-medium">Under Review</span> — assigned to{" "}
                <span className="font-medium">{pendingReviewRequest.reviewerName ?? "reviewer"}</span>
                {pendingReviewRequest.dueDate && (
                  <span className="text-xs ml-1">(due {new Date(pendingReviewRequest.dueDate).toLocaleDateString()})</span>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

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

          {/* Changes Requested notes */}
          {(doc as any).rejectionNotes && (
            <Card className="border-orange-200">
              <CardHeader>
                <CardTitle className="text-sm text-orange-700">Changes Requested</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-orange-600">{(doc as any).rejectionNotes}</p>
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

      {/* ─── Submit for Review Dialog ─────────────────────────────────────── */}
      <Dialog open={reviewDialog === "submit"} onOpenChange={(open) => !open && setReviewDialog(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ClipboardCheck className="h-4 w-4" />
              Submit for Review
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            <div>
              <Label className="text-sm font-medium">Reviewer *</Label>
              {reviewersLoading ? (
                <div className="mt-1.5 h-9 animate-pulse bg-muted rounded" />
              ) : reviewers.length === 0 ? (
                <p className="mt-1.5 text-sm text-muted-foreground">No eligible reviewers found in this organization.</p>
              ) : (
                <>
                  <Input
                    value={reviewerSearch}
                    onChange={(e) => setReviewerSearch(e.target.value)}
                    placeholder="Search reviewers..."
                    className="mt-1.5 mb-1.5"
                  />
                  <div className="border rounded-md max-h-40 overflow-y-auto">
                    {filteredReviewers.length === 0 ? (
                      <p className="p-2 text-sm text-muted-foreground">No reviewers match your search.</p>
                    ) : (
                      filteredReviewers.map((r) => (
                        <button
                          key={r.id}
                          type="button"
                          className={`w-full text-left px-3 py-2 text-sm hover:bg-muted/50 transition-colors flex items-center justify-between ${selectedReviewerId === r.id ? "bg-primary/10 font-medium" : ""}`}
                          onClick={() => setSelectedReviewerId(r.id)}
                        >
                          <span>{r.name}</span>
                          <span className="text-xs text-muted-foreground">{ORG_ROLE_LABELS[r.orgRole] ?? r.orgRole}</span>
                        </button>
                      ))
                    )}
                  </div>
                  {selectedReviewerId && (
                    <p className="text-xs text-green-600 mt-1">
                      ✓ {reviewers.find((r) => r.id === selectedReviewerId)?.name} selected
                    </p>
                  )}
                </>
              )}
            </div>

            <div>
              <Label className="text-sm font-medium">Review Due Date (optional)</Label>
              <Input
                type="date"
                value={submitDueDate}
                onChange={(e) => setSubmitDueDate(e.target.value)}
                className="mt-1.5"
                min={new Date().toISOString().split("T")[0]}
              />
            </div>

            <div>
              <Label className="text-sm font-medium">Submission Notes (optional)</Label>
              <Textarea
                value={dialogNotes}
                onChange={(e) => setDialogNotes(e.target.value)}
                placeholder="Any notes for the reviewer..."
                className="mt-1.5"
                rows={3}
              />
            </div>

            <div className="flex justify-end gap-3 pt-1">
              <Button variant="outline" onClick={() => setReviewDialog(null)}>Cancel</Button>
              <Button
                onClick={handleSubmitForReview}
                disabled={actionPending || !selectedReviewerId || reviewersLoading}
              >
                {actionPending ? "Submitting..." : "Submit for Review"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ─── Approve Dialog ────────────────────────────────────────────────── */}
      <Dialog open={reviewDialog === "approve"} onOpenChange={(open) => !open && setReviewDialog(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-green-700">
              <CheckCircle2 className="h-4 w-4" />
              Approve Document
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            <p className="text-sm text-muted-foreground">
              Approving this document will mark it as <strong>Approved</strong> and notify the author.
            </p>
            <div>
              <Label className="text-sm font-medium">Approval Notes (optional)</Label>
              <Textarea
                value={dialogNotes}
                onChange={(e) => setDialogNotes(e.target.value)}
                placeholder="Any notes about the approval..."
                className="mt-1.5"
                rows={3}
              />
            </div>
            <div className="flex justify-end gap-3 pt-1">
              <Button variant="outline" onClick={() => setReviewDialog(null)}>Cancel</Button>
              <Button
                className="bg-green-600 hover:bg-green-700"
                onClick={() => handleReviewDecision("APPROVED")}
                disabled={actionPending}
              >
                {actionPending ? "Processing..." : "Approve Document"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ─── Request Changes Dialog ────────────────────────────────────────── */}
      <Dialog open={reviewDialog === "request_changes"} onOpenChange={(open) => !open && setReviewDialog(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-orange-700">
              <AlertTriangle className="h-4 w-4" />
              Request Changes
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            <p className="text-sm text-muted-foreground">
              The document will be returned to the author as <strong>Changes Requested</strong>.
            </p>
            <div>
              <Label className="text-sm font-medium">Changes Required *</Label>
              <Textarea
                value={dialogNotes}
                onChange={(e) => setDialogNotes(e.target.value)}
                placeholder="Describe the changes required..."
                className="mt-1.5"
                rows={4}
              />
              {dialogNotes.trim() === "" && (
                <p className="text-xs text-orange-600 mt-1">Required — the author needs to know what to fix.</p>
              )}
            </div>
            <div className="flex justify-end gap-3 pt-1">
              <Button variant="outline" onClick={() => setReviewDialog(null)}>Cancel</Button>
              <Button
                className="bg-orange-600 hover:bg-orange-700"
                onClick={() => handleReviewDecision("CHANGES_REQUESTED")}
                disabled={actionPending || !dialogNotes.trim()}
              >
                {actionPending ? "Processing..." : "Request Changes"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
