import { useState } from "react";
import { useGetDocAutomationStatus } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";
import {
  FileText, FilePlus, LayoutList,
  Clock, AlertCircle, CheckCircle2, RefreshCw, ChevronRight
} from "lucide-react";

function StatCard({ label, value, icon: Icon, color }: { label: string; value: number; icon: any; color: string }) {
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-muted-foreground">{label}</p>
            <p className="text-3xl font-bold mt-1">{value}</p>
          </div>
          <div className={`rounded-full p-3 ${color}`}>
            <Icon className="h-5 w-5 text-white" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

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

export default function Documents() {
  const { data: status, isLoading, refetch } = useGetDocAutomationStatus();

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">Documentation</h1>
          <p className="text-muted-foreground mt-1">
            Policies, procedures, logs, checklists, and assessor-ready narratives
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => refetch()}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
          <Button asChild>
            <Link href="/documents/list">
              <FilePlus className="h-4 w-4 mr-2" />
              Add Document
            </Link>
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[...Array(8)].map((_, i) => (
            <Card key={i}><CardContent className="pt-6"><div className="h-16 animate-pulse bg-muted rounded" /></CardContent></Card>
          ))}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <StatCard label="Total Documents" value={status?.totalDocuments ?? 0} icon={FileText} color="bg-blue-500" />
            <StatCard label="Active" value={status?.totalActive ?? 0} icon={CheckCircle2} color="bg-green-500" />
            <StatCard label="Pending Review" value={status?.totalPendingReview ?? 0} icon={Clock} color="bg-yellow-500" />
            <StatCard label="Expired / Needs Update" value={(status?.totalExpired ?? 0) + (status?.totalNeedsUpdate ?? 0)} icon={AlertCircle} color="bg-red-500" />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <Card className={`border-l-4 ${(status?.controlsMissingPolicy ?? 0) > 0 ? 'border-l-red-500' : (status?.controlsWithDraftPolicy ?? 0) > 0 ? 'border-l-orange-400' : 'border-l-green-500'}`}>
              <CardContent className="pt-6">
                <p className="text-sm text-muted-foreground">Controls Missing Policy</p>
                <p className="text-2xl font-bold mt-1 text-red-600">{status?.controlsMissingPolicy ?? 0}</p>
                {(status?.controlsWithDraftPolicy ?? 0) > 0 && (
                  <p className="text-xs text-orange-600 mt-0.5">{status?.controlsWithDraftPolicy} with draft/pending</p>
                )}
                <Link href="/documents/missing" className="text-xs text-primary hover:underline mt-1 flex items-center gap-1">
                  View gap analysis <ChevronRight className="h-3 w-3" />
                </Link>
              </CardContent>
            </Card>
            <Card className={`border-l-4 ${(status?.controlsMissingProcedure ?? 0) > 0 ? 'border-l-red-500' : (status?.controlsWithDraftProcedure ?? 0) > 0 ? 'border-l-orange-400' : 'border-l-green-500'}`}>
              <CardContent className="pt-6">
                <p className="text-sm text-muted-foreground">Controls Missing Procedure</p>
                <p className="text-2xl font-bold mt-1 text-red-600">{status?.controlsMissingProcedure ?? 0}</p>
                {(status?.controlsWithDraftProcedure ?? 0) > 0 && (
                  <p className="text-xs text-orange-600 mt-0.5">{status?.controlsWithDraftProcedure} with draft/pending</p>
                )}
                <Link href="/documents/missing" className="text-xs text-primary hover:underline mt-1 flex items-center gap-1">
                  View gap analysis <ChevronRight className="h-3 w-3" />
                </Link>
              </CardContent>
            </Card>
            <Card className={`border-l-4 ${(status?.totalExpired ?? 0) > 0 ? 'border-l-red-500' : 'border-l-green-500'}`}>
              <CardContent className="pt-6">
                <p className="text-sm text-muted-foreground">Expired Documents</p>
                <p className="text-2xl font-bold mt-1 text-red-600">{status?.totalExpired ?? 0}</p>
                <Link href="/documents/missing" className="text-xs text-primary hover:underline mt-1 flex items-center gap-1">
                  View expired <ChevronRight className="h-3 w-3" />
                </Link>
              </CardContent>
            </Card>
            <Card className="border-l-4 border-l-blue-400">
              <CardContent className="pt-6">
                <p className="text-sm text-muted-foreground">Assessor Ready</p>
                <p className="text-2xl font-bold mt-1 text-blue-700">{status?.totalAssessorReady ?? 0}</p>
                <Link href="/documents/list?status=assessor_ready" className="text-xs text-primary hover:underline mt-1 flex items-center gap-1">
                  View documents <ChevronRight className="h-3 w-3" />
                </Link>
              </CardContent>
            </Card>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card>
              <CardContent className="pt-6">
                <div className="flex justify-between items-center mb-3">
                  <p className="text-sm font-medium text-muted-foreground">Compliance Logs</p>
                </div>
                <div className="flex gap-4">
                  <div>
                    <p className="text-2xl font-bold">{status?.logsCompletedThisMonth ?? 0}</p>
                    <p className="text-xs text-muted-foreground">Completed this month</p>
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-orange-500">{status?.logsDue ?? 0}</p>
                    <p className="text-xs text-muted-foreground">Due / In progress</p>
                  </div>
                </div>
                <Link href="/documents/logs" className="text-xs text-primary hover:underline mt-3 flex items-center gap-1">
                  Manage logs <ChevronRight className="h-3 w-3" />
                </Link>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <p className="text-sm font-medium text-muted-foreground mb-3">Checklists Completed This Month</p>
                <p className="text-2xl font-bold">{status?.checklistsCompleted ?? 0}</p>
                <Link href="/documents/checklists" className="text-xs text-primary hover:underline mt-3 flex items-center gap-1">
                  Run checklists <ChevronRight className="h-3 w-3" />
                </Link>
              </CardContent>
            </Card>
          </div>
        </>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {[
          { href: "/documents/list", icon: LayoutList, label: "All Documents", description: "Browse and manage all policies, procedures, and records" },
          { href: "/documents/logs", icon: Clock, label: "Compliance Logs", description: "Track recurring compliance log activities" },
          { href: "/documents/checklists", icon: CheckCircle2, label: "Checklists", description: "Run and document compliance checklists with evidence generation" },
        ].map((item) => (
          <Link key={item.href} href={item.href}>
            <Card className="hover:border-primary hover:shadow-md transition-all cursor-pointer h-full">
              <CardContent className="pt-6">
                <item.icon className="h-8 w-8 text-primary mb-3" />
                <p className="font-semibold">{item.label}</p>
                <p className="text-sm text-muted-foreground mt-1">{item.description}</p>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      {(status?.recentDocuments?.length ?? 0) > 0 && (
        <Card>
          <CardHeader>
            <div className="flex justify-between items-center">
              <CardTitle className="text-lg">Recent Documents</CardTitle>
              <Button variant="ghost" size="sm" asChild>
                <Link href="/documents/list">View all</Link>
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {status?.recentDocuments?.map((doc) => (
                <Link key={doc.id} href={`/documents/${doc.id}`}>
                  <div className="flex items-center justify-between p-3 rounded-lg hover:bg-muted/50 cursor-pointer transition-colors">
                    <div className="flex items-center gap-3">
                      <FileText className="h-4 w-4 text-muted-foreground" />
                      <div>
                        <p className="text-sm font-medium">{doc.title}</p>
                        <p className="text-xs text-muted-foreground capitalize">
                          {doc.docType.replace(/_/g, " ")} · v{doc.version}
                        </p>
                      </div>
                    </div>
                    <Badge className={DOC_STATUS_COLORS[doc.status] ?? ""} variant="outline">
                      {doc.status.replace(/_/g, " ")}
                    </Badge>
                  </div>
                </Link>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
