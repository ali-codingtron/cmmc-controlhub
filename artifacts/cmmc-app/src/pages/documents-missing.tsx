import { useGetMissingDocumentation } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";
import {
  AlertTriangle, CheckCircle2, FileText, ArrowLeft,
  ExternalLink, Clock, Shield, ShieldAlert, ShieldCheck, ShieldOff
} from "lucide-react";

const STATUS_COLORS: Record<string, string> = {
  draft: "bg-gray-100 text-gray-700",
  needs_classification: "bg-gray-100 text-gray-700",
  pending_review: "bg-yellow-100 text-yellow-800",
  approved: "bg-blue-100 text-blue-700",
  assessor_ready: "bg-purple-100 text-purple-700",
  active: "bg-green-100 text-green-700",
  needs_update: "bg-orange-100 text-orange-700",
  expired: "bg-red-100 text-red-700",
  rejected: "bg-red-100 text-red-700",
  stale: "bg-orange-100 text-orange-700",
  superseded: "bg-slate-100 text-slate-700",
  archived: "bg-slate-100 text-slate-500",
};

function statusLabel(s: string | undefined): string {
  if (!s) return "Unknown";
  return s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

type ControlDocItem = {
  controlId: string;
  controlLabel: string;
  title: string;
  domainName: string;
  existingStatus?: string | null;
  existingSource?: "evidence" | "document" | null;
  evidenceId?: string | null;
  documentId?: string | null;
};

function ControlRow({ item, showStatus }: { item: ControlDocItem; showStatus?: boolean }) {
  const linkHref = item.evidenceId
    ? `/evidence/${item.evidenceId}`
    : item.documentId
    ? `/documents/${item.documentId}`
    : null;

  return (
    <div className="flex items-start justify-between gap-3 p-3 rounded border bg-background hover:bg-muted/30 transition-colors">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <Link href={`/controls/${item.controlId}`} className="text-sm font-semibold text-primary hover:underline shrink-0">
            {item.controlLabel}
          </Link>
          <span className="text-xs text-muted-foreground truncate">{item.title}</span>
        </div>
        <div className="flex items-center gap-2 mt-0.5 flex-wrap">
          <span className="text-xs text-muted-foreground">{item.domainName}</span>
          {showStatus && item.existingStatus && (
            <>
              <span className="text-xs text-muted-foreground">·</span>
              <Badge className={`text-xs px-1.5 py-0 ${STATUS_COLORS[item.existingStatus] ?? "bg-gray-100 text-gray-700"}`}>
                {statusLabel(item.existingStatus)}
              </Badge>
              {item.existingSource && (
                <span className="text-xs text-muted-foreground capitalize">
                  via {item.existingSource}
                </span>
              )}
            </>
          )}
        </div>
      </div>
      <div className="flex items-center gap-1 shrink-0">
        <Button size="sm" variant="ghost" className="text-xs h-7 px-2" asChild>
          <Link href={`/controls/${item.controlId}`}>
            <Shield className="h-3 w-3" />
          </Link>
        </Button>
        {linkHref && (
          <Button size="sm" variant="ghost" className="text-xs h-7 px-2" asChild>
            <Link href={linkHref}>
              <ExternalLink className="h-3 w-3" />
            </Link>
          </Button>
        )}
      </div>
    </div>
  );
}

function GapSection({
  title,
  icon: Icon,
  iconColor,
  borderColor,
  items,
  showStatus,
  emptyText,
}: {
  title: string;
  icon: React.ElementType;
  iconColor: string;
  borderColor: string;
  items: ControlDocItem[];
  showStatus?: boolean;
  emptyText?: string;
}) {
  if (items.length === 0 && emptyText) {
    return (
      <Card className={`border-l-4 border-l-green-400`}>
        <CardContent className="pt-4 pb-4 flex items-center gap-2 text-sm text-green-700">
          <CheckCircle2 className="h-4 w-4" />
          {emptyText}
        </CardContent>
      </Card>
    );
  }
  if (items.length === 0) return null;
  return (
    <Card className={`border-l-4 ${borderColor}`}>
      <CardHeader className="pb-3">
        <CardTitle className={`text-base flex items-center gap-2 ${iconColor}`}>
          <Icon className="h-4 w-4" />
          {title} ({items.length})
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
          {items.map((item) => (
            <ControlRow key={item.controlId} item={item} showStatus={showStatus} />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

export default function DocumentsMissing() {
  const { data, isLoading } = useGetMissingDocumentation();

  const allOk =
    !isLoading &&
    data &&
    data.totalMissingPolicies === 0 &&
    data.totalWithDraftPolicy === 0 &&
    data.totalMissingProcedures === 0 &&
    data.totalWithDraftProcedure === 0 &&
    data.totalExpired === 0;

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
            Policy and procedure coverage across all controls — checks both uploaded evidence and formal documents
          </p>
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-4">
          {[...Array(6)].map((_, i) => (
            <Card key={i}><CardContent className="pt-6"><div className="h-24 animate-pulse bg-muted rounded" /></CardContent></Card>
          ))}
        </div>
      ) : (
        <div className="space-y-6">
          {/* Summary KPIs */}
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
            {[
              { label: "Missing Policy", value: data?.totalMissingPolicies ?? 0, color: "text-red-600" },
              { label: "Policy Not Active", value: data?.totalWithDraftPolicy ?? 0, color: "text-orange-600" },
              { label: "Missing Procedure", value: data?.totalMissingProcedures ?? 0, color: "text-red-600" },
              { label: "Procedure Not Active", value: data?.totalWithDraftProcedure ?? 0, color: "text-orange-600" },
              { label: "Expired Docs", value: data?.totalExpired ?? 0, color: "text-red-600" },
              { label: "Needs Review", value: data?.totalNeedingReview ?? 0, color: "text-yellow-600" },
              { label: "Pending Approval", value: data?.totalPendingApproval ?? 0, color: "text-blue-600" },
            ].map(({ label, value, color }) => (
              <Card key={label}>
                <CardContent className="pt-4 pb-4 text-center">
                  <p className={`text-2xl font-bold ${value > 0 ? color : "text-green-600"}`}>{value}</p>
                  <p className="text-xs text-muted-foreground mt-1 leading-tight">{label}</p>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* All clear */}
          {allOk && (
            <Card>
              <CardContent className="pt-6 text-center py-12">
                <CheckCircle2 className="h-12 w-12 mx-auto mb-3 text-green-500" />
                <p className="font-semibold text-green-700">No documentation gaps detected</p>
                <p className="text-sm text-muted-foreground mt-1">
                  All active controls have approved or active policies and procedures
                </p>
              </CardContent>
            </Card>
          )}

          {/* Policy sections */}
          <GapSection
            title="Controls Missing Active Policy"
            icon={ShieldOff}
            iconColor="text-red-700"
            borderColor="border-l-red-500"
            items={data?.controlsMissingPolicy ?? []}
            emptyText="All controls have an approved/active policy."
          />

          <GapSection
            title="Policy Exists But Not Active"
            icon={ShieldAlert}
            iconColor="text-orange-700"
            borderColor="border-l-orange-400"
            items={data?.controlsWithDraftPolicy ?? []}
            showStatus
          />

          {/* Procedure sections */}
          <GapSection
            title="Controls Missing Active Procedure"
            icon={ShieldOff}
            iconColor="text-red-700"
            borderColor="border-l-red-500"
            items={data?.controlsMissingProcedure ?? []}
            emptyText="All controls have an approved/active procedure."
          />

          <GapSection
            title="Procedure Exists But Not Active"
            icon={ShieldAlert}
            iconColor="text-orange-700"
            borderColor="border-l-orange-400"
            items={data?.controlsWithDraftProcedure ?? []}
            showStatus
          />

          {/* Expired documents */}
          {(data?.expiredDocuments?.length ?? 0) > 0 && (
            <Card className="border-l-4 border-l-red-500">
              <CardHeader className="pb-3">
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
                      <Badge className="bg-red-100 text-red-700 text-xs">expired</Badge>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Needing review */}
          {(data?.documentsNeedingReview?.length ?? 0) > 0 && (
            <Card className="border-l-4 border-l-yellow-400">
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2 text-yellow-700">
                  <Clock className="h-4 w-4" />
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
                      <Badge className={`text-xs capitalize ${STATUS_COLORS[doc.status] ?? "bg-gray-100 text-gray-700"}`}>
                        {statusLabel(doc.status)}
                      </Badge>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Pending approval */}
          {(data?.pendingApproval?.length ?? 0) > 0 && (
            <Card className="border-l-4 border-l-blue-400">
              <CardHeader className="pb-3">
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
        </div>
      )}
    </div>
  );
}
