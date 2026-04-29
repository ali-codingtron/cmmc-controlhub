import { useGetPoam, useClosePoam } from "@workspace/api-client-react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { StatusBadge, RiskBadge } from "@/components/ui/badges";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";
import { CheckCircle } from "lucide-react";

export default function PoamDetail({ id }: { id: string }) {
  const { data: poam, isLoading, refetch } = useGetPoam(id);
  const closeMutation = useClosePoam();

  if (isLoading) return <div>Loading...</div>;
  if (!poam) return <div>POA&M not found</div>;

  const handleClose = async () => {
    await closeMutation.mutateAsync({ id, data: { resolutionSummary: "Closed via UI" } });
    refetch();
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <h1 className="text-3xl font-bold">{poam.poamNumber}: {poam.title}</h1>
            <StatusBadge status={poam.status} />
            <RiskBadge level={poam.riskLevel} />
          </div>
        </div>
        <div className="flex gap-2">
          {poam.status !== 'closed' && (
            <Button className="bg-green-600 hover:bg-green-700 text-white" onClick={handleClose}>
              <CheckCircle className="mr-2 h-4 w-4" /> Close POA&M
            </Button>
          )}
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Details</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div>
            <h3 className="font-semibold mb-1">Deficiency Description</h3>
            <p className="text-muted-foreground">{poam.deficiencyDescription}</p>
          </div>
          
          <div>
            <h3 className="font-semibold mb-1">Remediation Plan</h3>
            <p className="text-muted-foreground">{poam.remediationPlan || "No plan provided."}</p>
          </div>

          <div>
            <h3 className="font-semibold mb-1">Resources Required</h3>
            <p className="text-muted-foreground">{poam.resourcesRequired || "None specified."}</p>
          </div>
          
          <div className="grid grid-cols-2 gap-4 pt-4 border-t">
            <div>
              <span className="font-semibold block text-sm">Owner</span>
              <span>{poam.ownerName}</span>
            </div>
            <div>
              <span className="font-semibold block text-sm">Scheduled Completion</span>
              <span>{poam.scheduledCompletionDate ? new Date(poam.scheduledCompletionDate).toLocaleDateString() : 'N/A'}</span>
            </div>
            <div>
              <span className="font-semibold block text-sm">Completed Date</span>
              <span>{poam.completedDate ? new Date(poam.completedDate).toLocaleDateString() : 'N/A'}</span>
            </div>
            <div>
              <span className="font-semibold block text-sm">Linked Control</span>
              <span>
                <Link href={`/controls/${poam.linkedControlId}`} className="text-primary hover:underline">
                  {poam.linkedControlLabel}
                </Link>
              </span>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}