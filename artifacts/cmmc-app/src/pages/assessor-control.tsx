import { useGetAssessorControlPackage, useExportControlPackage } from "@workspace/api-client-react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/badges";
import { Download } from "lucide-react";

export default function AssessorControl({ id }: { id: string }) {
  const { data: pkg, isLoading } = useGetAssessorControlPackage(id);
  const exportMutation = useExportControlPackage();

  if (isLoading) return <div>Loading...</div>;
  if (!pkg) return <div>Package not found</div>;

  const allEvidence = [
    ...pkg.policies,
    ...pkg.procedures,
    ...pkg.screenshots,
    ...pkg.logs,
    ...pkg.otherEvidence,
  ];

  const handleExport = async () => {
    try {
      const result = await exportMutation.mutateAsync({ id });
      alert(`Export ready — Export ID: ${result.exportId} (${result.evidenceCount} evidence items, ${result.controlCount} controls)`);
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <h1 className="text-3xl font-bold">{pkg.control.controlId}: {pkg.control.title}</h1>
            <StatusBadge status={pkg.control.status} />
          </div>
          <p className="text-muted-foreground">Assessor Package — {pkg.packageCompleteness}% complete</p>
        </div>
        <Button onClick={handleExport} disabled={exportMutation.isPending}>
          <Download className="mr-2 h-4 w-4" /> Export Package
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Implementation Narrative</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="prose max-w-none dark:prose-invert">
            {pkg.control.implementationNarrative ? (
              <div dangerouslySetInnerHTML={{ __html: pkg.control.implementationNarrative }} />
            ) : (
              <p className="text-muted-foreground">No narrative provided.</p>
            )}
          </div>
        </CardContent>
      </Card>

      {pkg.control.assessmentObjectives && pkg.control.assessmentObjectives.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Assessment Objectives</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="list-disc pl-5 space-y-1">
              {pkg.control.assessmentObjectives.map((obj, i) => (
                <li key={i} className="text-sm">{obj}</li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Provided Evidence ({allEvidence.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {allEvidence.length === 0 ? (
            <p className="text-muted-foreground">No evidence attached to this control.</p>
          ) : (
            <ul className="space-y-4">
              {allEvidence.map(item => (
                <li key={item.id} className="border p-4 rounded-md">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-semibold">{item.title}</span>
                    <StatusBadge status={item.status} />
                  </div>
                  <div className="text-sm text-muted-foreground">Type: {item.evidenceType}</div>
                  {item.description && (
                    <div className="text-sm mt-2">{item.description}</div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Open POA&Ms ({pkg.openPoams.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {pkg.openPoams.length === 0 ? (
            <p className="text-muted-foreground">No open POA&Ms for this control.</p>
          ) : (
            <ul className="space-y-4">
              {pkg.openPoams.map(poam => (
                <li key={poam.id} className="border p-4 rounded-md border-l-4 border-l-yellow-500">
                  <div className="font-semibold">{poam.poamNumber}: {poam.title}</div>
                  <div className="text-sm text-muted-foreground mt-1">{poam.deficiencyDescription}</div>
                  {poam.remediationPlan && (
                    <div className="text-sm mt-2"><strong>Remediation Plan:</strong> {poam.remediationPlan}</div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {pkg.auditTimeline && pkg.auditTimeline.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Audit Timeline</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-3">
              {pkg.auditTimeline.map(entry => (
                <li key={entry.id} className="flex gap-3 text-sm border-b pb-3 last:border-0">
                  <span className="text-muted-foreground whitespace-nowrap">
                    {new Date(entry.timestamp).toLocaleDateString()}
                  </span>
                  <span className="font-medium">{entry.userName ?? "System"}</span>
                  <span className="text-muted-foreground">{entry.action}: {entry.entityType} {entry.entityLabel ? `(${entry.entityLabel})` : ""}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
