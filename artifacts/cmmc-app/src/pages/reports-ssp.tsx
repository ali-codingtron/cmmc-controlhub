import { useQuery } from "@tanstack/react-query";
import { useOrg } from "@/context/OrgContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, FileText, CheckCircle2, XCircle, AlertTriangle } from "lucide-react";
import { ReportShell, ReportStatCard, ProgressBar } from "@/components/reports/ReportShell";
import { apiHeaders, fmtDate } from "@/lib/report-utils";
import { cn } from "@/lib/utils";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";

interface SspData {
  reportDate: string;
  hasSSP: boolean;
  doc?: {
    id: string;
    title: string;
    documentNumber: string | null;
    revisionNumber: string | null;
    revisionDate: string | null;
    systemName: string | null;
    systemOwner: string | null;
    cmmcLevel: string | null;
    status: string;
    preparedBy: string | null;
    reviewedBy: string | null;
    approvedBy: string | null;
    nextReviewDate: string | null;
    notes: string | null;
  };
  sections?: {
    total: number;
    complete: number;
    items: { sectionTitle: string; isComplete: boolean; content: string }[];
  };
  mappings?: {
    total: number;
    withNarrative: number;
    missingNarrative: number;
    edited: number;
    items: { controlRef: string; sspStatus: string; implementationNarrative: string; policyReference: string | null }[];
  };
  policies?: (string | null)[];
}

export default function ReportsSsp() {
  const { activeOrg } = useOrg();

  const { data, isLoading } = useQuery<SspData>({
    queryKey: ["report-ssp", activeOrg?.id],
    queryFn: async () => {
      const r = await fetch("/api/reports/ssp", { headers: apiHeaders(activeOrg?.id) });
      if (!r.ok) throw new Error("Failed");
      return r.json();
    },
    enabled: !!activeOrg?.id,
  });

  if (isLoading) return <div className="flex justify-center py-24"><Loader2 className="h-7 w-7 animate-spin text-muted-foreground" /></div>;
  if (!data) return null;

  if (!data.hasSSP || !data.doc) {
    return (
      <ReportShell title="SSP Summary Report" subtitle="System Security Plan completeness overview" reportDate={data.reportDate}>
        <div className="flex flex-col items-center justify-center py-24 gap-4">
          <FileText className="h-12 w-12 text-muted-foreground" />
          <h2 className="text-lg font-semibold text-muted-foreground">No Primary SSP Found</h2>
          <p className="text-sm text-muted-foreground">Upload and mark an SSP as primary to generate this report.</p>
          <Link href="/ssp"><Button>Go to SSP Module</Button></Link>
        </div>
      </ReportShell>
    );
  }

  const sectionPct = data.sections!.total > 0 ? Math.round((data.sections!.complete / data.sections!.total) * 100) : 0;
  const narrativePct = data.mappings!.total > 0 ? Math.round((data.mappings!.withNarrative / data.mappings!.total) * 100) : 0;

  const csvMappings = data.mappings!.items.map(m => ({
    "Control Ref": m.controlRef, "SSP Status": m.sspStatus,
    "Has Narrative": m.implementationNarrative?.trim() ? "Yes" : "No",
    "Policy Reference": m.policyReference ?? "",
    "Narrative Preview": m.implementationNarrative?.slice(0, 100) ?? "",
  }));

  return (
    <ReportShell
      title="SSP Summary Report"
      subtitle="System Security Plan completeness and control mapping overview"
      reportDate={data.reportDate}
      csvRows={csvMappings}
      csvFilename="ssp-summary.csv"
    >
      {/* SSP header info */}
      <Card className="mb-6">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2"><FileText className="h-4 w-4 text-primary" />SSP Document Details</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
            <div><span className="text-muted-foreground">Title:</span> <span className="font-medium">{data.doc.title}</span></div>
            {data.doc.documentNumber && <div><span className="text-muted-foreground">Doc #:</span> <span className="font-medium">{data.doc.documentNumber}</span></div>}
            {data.doc.revisionNumber && <div><span className="text-muted-foreground">Revision:</span> <span className="font-medium">{data.doc.revisionNumber}</span></div>}
            {data.doc.revisionDate && <div><span className="text-muted-foreground">Rev. Date:</span> <span className="font-medium">{data.doc.revisionDate}</span></div>}
            {data.doc.systemName && <div><span className="text-muted-foreground">System:</span> <span className="font-medium">{data.doc.systemName}</span></div>}
            {data.doc.systemOwner && <div><span className="text-muted-foreground">System Owner:</span> <span className="font-medium">{data.doc.systemOwner}</span></div>}
            {data.doc.cmmcLevel && <div><span className="text-muted-foreground">CMMC Level:</span> <span className="font-medium">{data.doc.cmmcLevel}</span></div>}
            {data.doc.preparedBy && <div><span className="text-muted-foreground">Prepared By:</span> <span className="font-medium">{data.doc.preparedBy}</span></div>}
            {data.doc.reviewedBy && <div><span className="text-muted-foreground">Reviewed By:</span> <span className="font-medium">{data.doc.reviewedBy}</span></div>}
            {data.doc.approvedBy && <div><span className="text-muted-foreground">Approved By:</span> <span className="font-medium">{data.doc.approvedBy}</span></div>}
            {data.doc.nextReviewDate && <div><span className="text-muted-foreground">Next Review:</span> <span className="font-medium">{data.doc.nextReviewDate}</span></div>}
            <div><span className="text-muted-foreground">Status:</span> <span className={cn("font-medium px-2 py-0.5 rounded-full text-[11px]", data.doc.status === "approved" ? "bg-green-100 text-green-700" : "bg-yellow-100 text-yellow-700")}>{data.doc.status}</span></div>
          </div>
        </CardContent>
      </Card>

      {/* Completeness stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <ReportStatCard label="Total Sections" value={data.sections!.total} />
        <ReportStatCard label="Sections Complete" value={data.sections!.complete} color="text-green-700" bg="bg-green-50" sub={`${sectionPct}% complete`} />
        <ReportStatCard label="Control Mappings" value={data.mappings!.total} />
        <ReportStatCard label="Missing Narratives" value={data.mappings!.missingNarrative} color={data.mappings!.missingNarrative > 0 ? "text-red-700" : "text-green-700"} bg={data.mappings!.missingNarrative > 0 ? "bg-red-50" : "bg-green-50"} />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
        {/* Section completion */}
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Section Completion</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <ProgressBar pct={sectionPct} label={`${data.sections!.complete} of ${data.sections!.total} sections complete (${sectionPct}%)`} color={sectionPct >= 75 ? "bg-green-500" : "bg-yellow-400"} />
            <div className="space-y-1.5 max-h-48 overflow-y-auto">
              {data.sections!.items.map((s, i) => (
                <div key={i} className="flex items-center gap-2 text-sm">
                  {s.isComplete ? <CheckCircle2 className="h-4 w-4 text-green-600 flex-shrink-0" /> : <XCircle className="h-4 w-4 text-gray-300 flex-shrink-0" />}
                  <span className={cn("text-sm", !s.isComplete && "text-muted-foreground")}>{s.sectionTitle}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Narrative coverage */}
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Implementation Narrative Coverage</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <ProgressBar pct={narrativePct} label={`${data.mappings!.withNarrative} of ${data.mappings!.total} mappings have narratives (${narrativePct}%)`} color={narrativePct >= 75 ? "bg-green-500" : "bg-yellow-400"} />
            {data.mappings!.missingNarrative > 0 && (
              <div className="flex items-center gap-2 p-2 bg-yellow-50 border border-yellow-200 rounded text-sm text-yellow-800">
                <AlertTriangle className="h-4 w-4 flex-shrink-0" />
                <span>{data.mappings!.missingNarrative} controls are missing implementation narratives.</span>
              </div>
            )}
            {data.policies && data.policies.length > 0 && (
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-1.5">Referenced Policies ({data.policies.length})</p>
                <div className="flex flex-wrap gap-1.5">
                  {data.policies.map((p, i) => p && <span key={i} className="text-[11px] bg-muted px-2 py-0.5 rounded">{p}</span>)}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Controls missing narratives */}
      {data.mappings!.missingNarrative > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-red-700">Controls Missing Implementation Narratives ({data.mappings!.missingNarrative})</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {data.mappings!.items
                .filter(m => !m.implementationNarrative?.trim())
                .map(m => <code key={m.controlRef} className="text-xs bg-red-50 text-red-700 px-2 py-1 rounded border border-red-200">{m.controlRef}</code>)}
            </div>
          </CardContent>
        </Card>
      )}
    </ReportShell>
  );
}
