import { useGetEvidence, useGetEvidenceAuditLog, useApproveEvidence, useRejectEvidence } from "@workspace/api-client-react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/badges";
import { Button } from "@/components/ui/button";
import { Check, X } from "lucide-react";

export default function EvidenceDetail({ id }: { id: string }) {
  const { data: evidence, isLoading, refetch } = useGetEvidence(id);
  const { data: auditLog } = useGetEvidenceAuditLog(id);
  const approveMutation = useApproveEvidence();
  const rejectMutation = useRejectEvidence();

  if (isLoading) return <div>Loading...</div>;
  if (!evidence) return <div>Evidence not found</div>;

  const handleApprove = async () => {
    await approveMutation.mutateAsync({ id, data: {} });
    refetch();
  };

  const handleReject = async () => {
    await rejectMutation.mutateAsync({ id, data: { rejectionNotes: "Rejected via UI" } });
    refetch();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <h1 className="text-3xl font-bold">{evidence.title}</h1>
            <StatusBadge status={evidence.status} />
          </div>
          <p className="text-muted-foreground">{evidence.description}</p>
        </div>
        <div className="flex gap-2">
          {evidence.status === "pending_review" && (
            <>
              <Button variant="outline" className="text-red-600 hover:text-red-700" onClick={handleReject}>
                <X className="mr-2 h-4 w-4" /> Reject
              </Button>
              <Button className="bg-green-600 hover:bg-green-700 text-white" onClick={handleApprove}>
                <Check className="mr-2 h-4 w-4" /> Approve
              </Button>
            </>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="md:col-span-2 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>File Preview</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="aspect-video bg-muted flex items-center justify-center rounded-md border border-dashed">
                <span className="text-muted-foreground">Preview not available for {evidence.fileName}</span>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Metadata</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-sm">
              <div>
                <span className="font-semibold block">Type</span>
                <span>{evidence.evidenceType}</span>
              </div>
              <div>
                <span className="font-semibold block">Owner</span>
                <span>{evidence.ownerName}</span>
              </div>
              <div>
                <span className="font-semibold block">Linked Controls</span>
                <div className="flex flex-wrap gap-1 mt-1">
                  {evidence.linkedControlLabels?.map(c => (
                    <span key={c} className="bg-secondary px-2 py-1 rounded text-xs">{c}</span>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}