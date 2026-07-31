import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { useOrg } from "@/context/OrgContext";
import { useAuth } from "@/lib/auth";
import {
  CheckCircle2, AlertTriangle, Eye, ArrowRight,
  Clock, FileText, User, Calendar, ClipboardList, UserCheck,
} from "lucide-react";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getAuthHeaders(orgId?: string): Record<string, string> {
  const h: Record<string, string> = {};
  const token = localStorage.getItem("auth_token");
  if (token) h["Authorization"] = `Bearer ${token}`;
  if (orgId) h["X-Organization-ID"] = orgId;
  return h;
}

const REQUEST_STATUS_COLORS: Record<string, string> = {
  PENDING: "bg-yellow-100 text-yellow-700",
  APPROVED: "bg-green-100 text-green-700",
  CHANGES_REQUESTED: "bg-orange-100 text-orange-700",
  CANCELLED: "bg-gray-100 text-gray-500",
};

const REQUEST_STATUS_LABELS: Record<string, string> = {
  PENDING: "Pending",
  APPROVED: "Approved",
  CHANGES_REQUESTED: "Changes Requested",
  CANCELLED: "Cancelled",
};

const DOC_STATUS_LABELS: Record<string, string> = {
  draft: "Draft",
  pending_review: "In Review",
  approved: "Approved",
  active: "Active",
  needs_update: "Changes Requested",
  expired: "Expired",
  archived: "Archived",
};

interface ReviewRequest {
  id: string;
  organizationId: string;
  generatedDocumentId: string;
  documentTitle: string;
  documentStatus: string;
  documentFileKey?: string | null;
  documentFileName?: string | null;
  templateId?: string | null;
  templateTitle?: string | null;
  reviewerUserId: string;
  reviewerName: string;
  reviewerEmail: string;
  submittedByUserId: string;
  submitterName: string;
  submitterEmail: string;
  submittedAt: string;
  dueDate?: string | null;
  status: "PENDING" | "APPROVED" | "CHANGES_REQUESTED" | "CANCELLED";
  submissionNotes?: string | null;
  decisionNotes?: string | null;
  decidedAt?: string | null;
  createdAt: string;
}

// ─── Action dialog ────────────────────────────────────────────────────────────

function ReviewActionDialog({
  request,
  action,
  orgId,
  onClose,
  onDone,
}: {
  request: ReviewRequest;
  action: "approve" | "request_changes";
  orgId?: string;
  onClose: () => void;
  onDone: () => void;
}) {
  const { toast } = useToast();
  const [notes, setNotes] = useState("");
  const [pending, setPending] = useState(false);

  const isApprove = action === "approve";

  const handleSubmit = async () => {
    if (!isApprove && !notes.trim()) return;
    setPending(true);
    try {
      const res = await fetch(
        `/api/documents/${request.generatedDocumentId}/review-requests/${request.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json", ...getAuthHeaders(orgId) },
          body: JSON.stringify({
            decision: isApprove ? "APPROVED" : "CHANGES_REQUESTED",
            notes: notes || undefined,
          }),
        }
      );
      const data = await res.json();
      if (!res.ok) {
        toast({ title: data.error ?? "Failed to record decision", variant: "destructive" });
        return;
      }
      toast({
        title: isApprove ? "Document approved. Author has been notified." : "Changes requested. Author has been notified.",
      });
      onDone();
    } finally {
      setPending(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className={`flex items-center gap-2 ${isApprove ? "text-green-700" : "text-orange-700"}`}>
            {isApprove ? <CheckCircle2 className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}
            {isApprove ? "Approve Document" : "Request Changes"}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 mt-2">
          <div className="text-sm text-muted-foreground">
            <strong>{request.documentTitle}</strong>
            {request.submitterName && (
              <span className="ml-1">— submitted by {request.submitterName}</span>
            )}
          </div>
          {isApprove ? (
            <div>
              <Label className="text-sm font-medium">Approval Notes (optional)</Label>
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Any notes about the approval..."
                className="mt-1.5"
                rows={3}
              />
            </div>
          ) : (
            <div>
              <Label className="text-sm font-medium">Changes Required *</Label>
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Describe the changes required..."
                className="mt-1.5"
                rows={4}
              />
              {!notes.trim() && (
                <p className="text-xs text-orange-600 mt-1">Required — the author needs to know what to fix.</p>
              )}
            </div>
          )}
          <div className="flex justify-end gap-3 pt-1">
            <Button variant="outline" onClick={onClose}>Cancel</Button>
            <Button
              className={isApprove ? "bg-green-600 hover:bg-green-700" : "bg-orange-600 hover:bg-orange-700"}
              onClick={handleSubmit}
              disabled={pending || (!isApprove && !notes.trim())}
            >
              {pending ? "Processing..." : isApprove ? "Approve" : "Request Changes"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Request row ──────────────────────────────────────────────────────────────

function RequestRow({
  request,
  userId,
  orgId,
  onRefresh,
}: {
  request: ReviewRequest;
  userId?: string;
  orgId?: string;
  onRefresh: () => void;
}) {
  const [actionDialog, setActionDialog] = useState<"approve" | "request_changes" | null>(null);
  const isAssignedReviewer = request.reviewerUserId === userId;
  const isPending = request.status === "PENDING";
  const isDueSoon =
    request.dueDate && new Date(request.dueDate) < new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);

  return (
    <>
      <tr className="border-b hover:bg-muted/30 transition-colors">
        <td className="px-3 py-2.5">
          <Link href={`/documents/${request.generatedDocumentId}`}>
            <span className="text-sm font-medium text-primary hover:underline cursor-pointer">
              {request.documentTitle}
            </span>
          </Link>
          {request.templateTitle && (
            <p className="text-xs text-muted-foreground">{request.templateTitle}</p>
          )}
        </td>
        <td className="px-3 py-2.5">
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <User className="h-3 w-3 shrink-0" />
            {request.submitterName ?? "—"}
          </div>
        </td>
        <td className="px-3 py-2.5">
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <User className="h-3 w-3 shrink-0" />
            {request.reviewerName ?? "—"}
          </div>
        </td>
        <td className="px-3 py-2.5 text-xs text-muted-foreground whitespace-nowrap">
          {new Date(request.submittedAt).toLocaleDateString()}
        </td>
        <td className="px-3 py-2.5 text-xs whitespace-nowrap">
          {request.dueDate ? (
            <span className={isDueSoon && isPending ? "text-red-600 font-medium" : "text-muted-foreground"}>
              {isDueSoon && isPending && "⚠ "}
              {new Date(request.dueDate).toLocaleDateString()}
            </span>
          ) : (
            <span className="text-muted-foreground">—</span>
          )}
        </td>
        <td className="px-3 py-2.5">
          <span className={`inline-flex text-xs font-medium px-2 py-0.5 rounded ${REQUEST_STATUS_COLORS[request.status] ?? "bg-gray-100 text-gray-600"}`}>
            {REQUEST_STATUS_LABELS[request.status] ?? request.status}
          </span>
        </td>
        <td className="px-3 py-2.5">
          <div className="flex items-center gap-1.5">
            <Button variant="ghost" size="sm" className="h-7 px-2" asChild>
              <Link href={`/documents/${request.generatedDocumentId}`}>
                <Eye className="h-3 w-3 mr-1" />
                Open
              </Link>
            </Button>
            {isPending && isAssignedReviewer && (
              <>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2 text-green-700 hover:text-green-800 hover:bg-green-50"
                  onClick={() => setActionDialog("approve")}
                >
                  <CheckCircle2 className="h-3 w-3 mr-1" />
                  Approve
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2 text-orange-700 hover:text-orange-800 hover:bg-orange-50"
                  onClick={() => setActionDialog("request_changes")}
                >
                  <AlertTriangle className="h-3 w-3 mr-1" />
                  Changes
                </Button>
              </>
            )}
          </div>
        </td>
      </tr>
      {actionDialog && (
        <ReviewActionDialog
          request={request}
          action={actionDialog}
          orgId={orgId}
          onClose={() => setActionDialog(null)}
          onDone={() => { setActionDialog(null); onRefresh(); }}
        />
      )}
    </>
  );
}

// ─── Table ────────────────────────────────────────────────────────────────────

function ReviewTable({
  requests,
  userId,
  orgId,
  onRefresh,
  emptyMessage,
}: {
  requests: ReviewRequest[];
  userId?: string;
  orgId?: string;
  onRefresh: () => void;
  emptyMessage: string;
}) {
  if (requests.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
        <ClipboardList className="h-10 w-10 mb-3 opacity-25" />
        <p className="text-sm">{emptyMessage}</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border">
      <table className="w-full text-sm">
        <thead className="bg-muted/50">
          <tr>
            <th className="text-left px-3 py-2 text-xs font-semibold text-muted-foreground">Document</th>
            <th className="text-left px-3 py-2 text-xs font-semibold text-muted-foreground">Submitted By</th>
            <th className="text-left px-3 py-2 text-xs font-semibold text-muted-foreground">Reviewer</th>
            <th className="text-left px-3 py-2 text-xs font-semibold text-muted-foreground">Submitted</th>
            <th className="text-left px-3 py-2 text-xs font-semibold text-muted-foreground">Due Date</th>
            <th className="text-left px-3 py-2 text-xs font-semibold text-muted-foreground">Status</th>
            <th className="text-left px-3 py-2 text-xs font-semibold text-muted-foreground">Actions</th>
          </tr>
        </thead>
        <tbody>
          {requests.map((r) => (
            <RequestRow key={r.id} request={r} userId={userId} orgId={orgId} onRefresh={onRefresh} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function DocumentReviews() {
  const { activeOrg } = useOrg();
  const { user } = useAuth();
  const orgId = activeOrg?.id;
  const isAdmin = user?.role === "admin";
  const queryClient = useQueryClient();

  const [activeTab, setActiveTab] = useState("assigned_to_me");

  const { data: requests = [], isLoading, refetch } = useQuery<ReviewRequest[]>({
    queryKey: ["document-review-requests", orgId, activeTab],
    queryFn: async () => {
      const r = await fetch(`/api/documents/review-requests?tab=${activeTab}`, {
        headers: getAuthHeaders(orgId),
      });
      if (!r.ok) return [];
      return r.json();
    },
    enabled: !!orgId,
  });

  const handleRefresh = () => {
    refetch();
    // also refetch assigned_to_me for badge count
    queryClient.invalidateQueries({ queryKey: ["document-review-requests", orgId] });
  };

  const pendingAssigned = requests.filter(
    (r) => activeTab === "assigned_to_me" && r.status === "PENDING"
  ).length;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold">Document Reviews</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Track and act on document review requests
          </p>
        </div>
        <Button variant="outline" size="sm" asChild>
          <Link href="/documents">
            <ArrowRight className="h-3.5 w-3.5 mr-1 rotate-180" />
            All Documents
          </Link>
        </Button>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="flex-wrap h-auto gap-1">
          <TabsTrigger value="assigned_to_me" className="text-xs">
            <UserCheck className="h-3.5 w-3.5 mr-1.5" />
            Assigned to Me
          </TabsTrigger>
          <TabsTrigger value="submitted_by_me" className="text-xs">
            <FileText className="h-3.5 w-3.5 mr-1.5" />
            Submitted by Me
          </TabsTrigger>
          {isAdmin && (
            <TabsTrigger value="all_pending" className="text-xs">
              <Clock className="h-3.5 w-3.5 mr-1.5" />
              All Pending
            </TabsTrigger>
          )}
          <TabsTrigger value="changes_requested" className="text-xs">
            <AlertTriangle className="h-3.5 w-3.5 mr-1.5" />
            Changes Requested
          </TabsTrigger>
          <TabsTrigger value="completed" className="text-xs">
            <CheckCircle2 className="h-3.5 w-3.5 mr-1.5" />
            Completed
          </TabsTrigger>
        </TabsList>

        <div className="mt-4">
          {isLoading ? (
            <div className="space-y-2">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="h-12 animate-pulse bg-muted rounded" />
              ))}
            </div>
          ) : (
            <>
              <TabsContent value="assigned_to_me" className="m-0">
                <ReviewTable
                  requests={requests}
                  userId={user?.id}
                  orgId={orgId}
                  onRefresh={handleRefresh}
                  emptyMessage="No documents are currently assigned to you for review."
                />
              </TabsContent>
              <TabsContent value="submitted_by_me" className="m-0">
                <ReviewTable
                  requests={requests}
                  userId={user?.id}
                  orgId={orgId}
                  onRefresh={handleRefresh}
                  emptyMessage="You haven't submitted any documents for review yet."
                />
              </TabsContent>
              {isAdmin && (
                <TabsContent value="all_pending" className="m-0">
                  <ReviewTable
                    requests={requests}
                    userId={user?.id}
                    orgId={orgId}
                    onRefresh={handleRefresh}
                    emptyMessage="No pending review requests."
                  />
                </TabsContent>
              )}
              <TabsContent value="changes_requested" className="m-0">
                <ReviewTable
                  requests={requests}
                  userId={user?.id}
                  orgId={orgId}
                  onRefresh={handleRefresh}
                  emptyMessage="No documents with changes requested."
                />
              </TabsContent>
              <TabsContent value="completed" className="m-0">
                <ReviewTable
                  requests={requests}
                  userId={user?.id}
                  orgId={orgId}
                  onRefresh={handleRefresh}
                  emptyMessage="No completed reviews yet."
                />
              </TabsContent>
            </>
          )}
        </div>
      </Tabs>
    </div>
  );
}
