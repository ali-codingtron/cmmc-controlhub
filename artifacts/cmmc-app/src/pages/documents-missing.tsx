import { useGetMissingDocumentation } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";
import { AlertTriangle, CheckCircle2, FileText, ArrowLeft, ExternalLink } from "lucide-react";

export default function DocumentsMissing() {
  const { data, isLoading } = useGetMissingDocumentation();

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/documents">
            <ArrowLeft className="h-4 w-4 mr-1" />
            Back
          </Link>
        </Button>
        <div>
          <h1 className="text-3xl font-bold">Documentation Gap Analysis</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Controls missing required documentation and documents needing attention
          </p>
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-4">
          {[...Array(4)].map((_, i) => (
            <Card key={i}><CardContent className="pt-6"><div className="h-32 animate-pulse bg-muted rounded" /></CardContent></Card>
          ))}
        </div>
      ) : (
        <div className="space-y-6">
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            {[
              { label: "Missing Policies", value: data?.totalMissingPolicies ?? 0, color: "text-red-600" },
              { label: "Missing Procedures", value: data?.totalMissingProcedures ?? 0, color: "text-orange-600" },
              { label: "Expired Docs", value: data?.totalExpired ?? 0, color: "text-red-600" },
              { label: "Needing Review", value: data?.totalNeedingReview ?? 0, color: "text-yellow-600" },
              { label: "Pending Approval", value: data?.totalPendingApproval ?? 0, color: "text-blue-600" },
            ].map(({ label, value, color }) => (
              <Card key={label}>
                <CardContent className="pt-6 text-center">
                  <p className={`text-3xl font-bold ${value > 0 ? color : "text-green-600"}`}>{value}</p>
                  <p className="text-sm text-muted-foreground mt-1">{label}</p>
                </CardContent>
              </Card>
            ))}
          </div>

          {(data?.expiredDocuments?.length ?? 0) > 0 && (
            <Card className="border-red-200">
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2 text-red-700">
                  <AlertTriangle className="h-4 w-4" />
                  Expired Documents ({data?.expiredDocuments.length})
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {data?.expiredDocuments.map((doc) => (
                    <div key={doc.id} className="flex items-center justify-between p-2 rounded border border-red-100 bg-red-50/50">
                      <div>
                        <Link href={`/documents/${doc.id}`} className="text-sm font-medium text-primary hover:underline">{doc.title}</Link>
                        <p className="text-xs text-muted-foreground capitalize">{doc.docType} · v{doc.version}</p>
                      </div>
                      <Badge variant="outline" className="bg-red-100 text-red-700 text-xs">expired</Badge>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {(data?.documentsNeedingReview?.length ?? 0) > 0 && (
            <Card className="border-yellow-200">
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2 text-yellow-700">
                  <AlertTriangle className="h-4 w-4" />
                  Needing Review Soon ({data?.documentsNeedingReview.length})
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {data?.documentsNeedingReview.map((doc) => (
                    <div key={doc.id} className="flex items-center justify-between p-2 rounded border border-yellow-100">
                      <div>
                        <Link href={`/documents/${doc.id}`} className="text-sm font-medium text-primary hover:underline">{doc.title}</Link>
                        <p className="text-xs text-muted-foreground">
                          Next review: {doc.nextReviewDate ? new Date(doc.nextReviewDate).toLocaleDateString() : "—"}
                        </p>
                      </div>
                      <Badge variant="outline" className="text-xs capitalize">{doc.status.replace(/_/g, " ")}</Badge>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {(data?.pendingApproval?.length ?? 0) > 0 && (
            <Card className="border-blue-200">
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2 text-blue-700">
                  <FileText className="h-4 w-4" />
                  Pending Approval ({data?.pendingApproval.length})
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {data?.pendingApproval.map((doc) => (
                    <div key={doc.id} className="flex items-center justify-between p-2 rounded border">
                      <div>
                        <Link href={`/documents/${doc.id}`} className="text-sm font-medium text-primary hover:underline">{doc.title}</Link>
                        <p className="text-xs text-muted-foreground capitalize">{doc.docType}</p>
                      </div>
                      <Button size="sm" variant="outline" asChild>
                        <Link href={`/documents/${doc.id}`}>Review</Link>
                      </Button>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {(data?.controlsMissingPolicy?.length ?? 0) > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-red-500" />
                  Controls Missing Active Policy ({data?.controlsMissingPolicy.length})
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2 max-h-64 overflow-y-auto">
                  {data?.controlsMissingPolicy.map((c) => (
                    <div key={c.controlId} className="flex items-center justify-between p-2 rounded border bg-muted/30">
                      <Link href={`/controls/${c.controlId}`} className="text-xs font-medium text-primary hover:underline">
                        {c.controlLabel}
                      </Link>
                      <Button size="sm" variant="ghost" className="text-xs h-6 px-2" asChild>
                        <Link href={`/documents/generate`}>
                          <ExternalLink className="h-3 w-3" />
                        </Link>
                      </Button>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {(data?.controlsMissingProcedure?.length ?? 0) > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-orange-500" />
                  Controls Missing Active Procedure ({data?.controlsMissingProcedure.length})
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2 max-h-64 overflow-y-auto">
                  {data?.controlsMissingProcedure.map((c) => (
                    <div key={c.controlId} className="flex items-center justify-between p-2 rounded border bg-muted/30">
                      <Link href={`/controls/${c.controlId}`} className="text-xs font-medium text-primary hover:underline">
                        {c.controlLabel}
                      </Link>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {data?.totalMissingPolicies === 0 && data?.totalMissingProcedures === 0 && data?.totalExpired === 0 && (
            <Card>
              <CardContent className="pt-6 text-center py-12">
                <CheckCircle2 className="h-12 w-12 mx-auto mb-3 text-green-500" />
                <p className="font-semibold text-green-700">No documentation gaps detected</p>
                <p className="text-sm text-muted-foreground mt-1">All active controls have policies and procedures</p>
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
