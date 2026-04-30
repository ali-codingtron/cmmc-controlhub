import { useState } from "react";
import { useGetAllDocuments } from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Link } from "wouter";
import { FilePlus, FileText, UploadCloud, ExternalLink } from "lucide-react";

const STATUS_COLORS: Record<string, string> = {
  draft: "bg-gray-100 text-gray-700",
  needs_classification: "bg-gray-100 text-gray-600",
  pending_review: "bg-yellow-100 text-yellow-700",
  approved: "bg-blue-100 text-blue-700",
  assessor_ready: "bg-purple-100 text-purple-700",
  active: "bg-green-100 text-green-700",
  needs_update: "bg-orange-100 text-orange-700",
  expired: "bg-red-100 text-red-700",
  superseded: "bg-slate-100 text-slate-600",
  archived: "bg-slate-100 text-slate-500",
  stale: "bg-orange-100 text-orange-700",
  rejected: "bg-red-100 text-red-600",
};

const TYPE_LABELS: Record<string, string> = {
  policy: "Policy",
  procedure: "Procedure",
  log: "Log",
  report: "Report",
  register: "Register",
  checklist: "Checklist",
  narrative: "Narrative",
  plan: "Plan",
  form: "Form",
  access_review: "Access Review",
  training_record: "Training Record",
  incident_record: "Incident Record",
  risk_record: "Risk Record",
  approval_record: "Approval Record",
  system_inventory: "System Inventory",
  asset_inventory: "Asset Inventory",
  supplier_review: "Supplier Review",
  backup_verification: "Backup Verification",
  scan_report: "Scan Report",
};

function statusLabel(s: string) {
  return s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export default function DocumentsList() {
  const [search, setSearch] = useState("");
  const [type, setType] = useState("all");
  const [status, setStatus] = useState("all");
  const [domain, setDomain] = useState("all");
  const [sourceType, setSourceType] = useState("all");

  const { data: docs, isLoading } = useGetAllDocuments({
    type: type !== "all" ? type : undefined,
    status: status !== "all" ? status : undefined,
    search: search || undefined,
    domain: domain !== "all" ? domain : undefined,
    sourceType: sourceType !== "all" ? (sourceType as "document" | "evidence") : undefined,
  });

  // Collect unique domains from all items for the domain filter
  const domainOptions = [...new Set(
    (docs ?? []).flatMap((d) => d.domains.map((dom) => dom.name))
  )].sort();

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">All Documents</h1>
          <p className="text-muted-foreground mt-1">
            {docs?.length ?? 0} item{(docs?.length ?? 0) !== 1 ? "s" : ""} — generated documents and uploaded evidence
          </p>
        </div>
        <Button asChild>
          <Link href="/documents/generate">
            <FilePlus className="h-4 w-4 mr-2" />
            New Document
          </Link>
        </Button>
      </div>

      <Card>
        <CardContent className="pt-6">
          {/* Filters */}
          <div className="flex gap-3 mb-5 flex-wrap">
            <Input
              placeholder="Search by title..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="max-w-xs"
            />
            <Select value={type} onValueChange={setType}>
              <SelectTrigger className="w-44">
                <SelectValue placeholder="Type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                <SelectItem value="policy">Policy</SelectItem>
                <SelectItem value="procedure">Procedure</SelectItem>
                <SelectItem value="log">Log</SelectItem>
                <SelectItem value="report">Report</SelectItem>
                <SelectItem value="register">Register</SelectItem>
                <SelectItem value="checklist">Checklist</SelectItem>
                <SelectItem value="narrative">Narrative</SelectItem>
                <SelectItem value="plan">Plan</SelectItem>
                <SelectItem value="access_review">Access Review</SelectItem>
                <SelectItem value="training_record">Training Record</SelectItem>
                <SelectItem value="incident_record">Incident Record</SelectItem>
                <SelectItem value="risk_record">Risk Record</SelectItem>
                <SelectItem value="approval_record">Approval Record</SelectItem>
                <SelectItem value="system_inventory">System Inventory</SelectItem>
                <SelectItem value="asset_inventory">Asset Inventory</SelectItem>
                <SelectItem value="supplier_review">Supplier Review</SelectItem>
                <SelectItem value="backup_verification">Backup Verification</SelectItem>
                <SelectItem value="scan_report">Scan Report</SelectItem>
              </SelectContent>
            </Select>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger className="w-44">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                <SelectItem value="draft">Draft</SelectItem>
                <SelectItem value="pending_review">Pending Review</SelectItem>
                <SelectItem value="approved">Approved</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="assessor_ready">Assessor Ready</SelectItem>
                <SelectItem value="needs_update">Needs Update</SelectItem>
                <SelectItem value="expired">Expired</SelectItem>
                <SelectItem value="archived">Archived</SelectItem>
              </SelectContent>
            </Select>
            <Select value={domain} onValueChange={setDomain}>
              <SelectTrigger className="w-44">
                <SelectValue placeholder="Domain" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Domains</SelectItem>
                {domainOptions.map((d) => (
                  <SelectItem key={d} value={d}>{d}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={sourceType} onValueChange={setSourceType}>
              <SelectTrigger className="w-44">
                <SelectValue placeholder="Source" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Sources</SelectItem>
                <SelectItem value="document">Generated Document</SelectItem>
                <SelectItem value="evidence">Uploaded Evidence</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {isLoading ? (
            <div className="space-y-3">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="h-12 animate-pulse bg-muted rounded" />
              ))}
            </div>
          ) : !docs?.length ? (
            <div className="text-center py-14 text-muted-foreground">
              <FileText className="h-12 w-12 mx-auto mb-3 opacity-30" />
              <p className="font-medium">No documents found</p>
              <p className="text-sm mt-1">
                Upload policy/procedure evidence or generate a document from a template
              </p>
              <div className="flex gap-3 justify-center mt-4">
                <Button asChild variant="outline">
                  <Link href="/evidence">Upload Evidence</Link>
                </Button>
                <Button asChild>
                  <Link href="/documents/generate">Browse Templates</Link>
                </Button>
              </div>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Title</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Linked Controls</TableHead>
                  <TableHead>Security Domain</TableHead>
                  <TableHead>Level</TableHead>
                  <TableHead>Owner</TableHead>
                  <TableHead>Next Review</TableHead>
                  <TableHead>Source</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {docs.map((doc) => {
                  const isAlert = doc.status === "expired" || doc.status === "needs_update";
                  const href = doc.sourceType === "evidence"
                    ? `/evidence/${doc.id}`
                    : `/documents/${doc.id}`;
                  return (
                    <TableRow key={doc.id} className={isAlert ? "bg-red-50 dark:bg-red-950/20" : ""}>
                      <TableCell className="font-medium max-w-xs">
                        <Link href={href} className="text-primary hover:underline flex items-center gap-1.5">
                          {doc.sourceType === "evidence"
                            ? <UploadCloud className="h-3.5 w-3.5 opacity-60 shrink-0" />
                            : <FileText className="h-3.5 w-3.5 opacity-60 shrink-0" />}
                          <span className="truncate">{doc.title}</span>
                        </Link>
                        {doc.fileName && (
                          <p className="text-xs text-muted-foreground mt-0.5 truncate">{doc.fileName}</p>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-xs whitespace-nowrap">
                          {TYPE_LABELS[doc.type] ?? doc.type}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium whitespace-nowrap ${STATUS_COLORS[doc.status] ?? "bg-gray-100 text-gray-700"}`}>
                          {statusLabel(doc.status)}
                        </span>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1 max-w-[180px]">
                          {doc.linkedControls.length === 0
                            ? <span className="text-muted-foreground text-xs">—</span>
                            : doc.linkedControls.slice(0, 3).map((c) => (
                              <Link key={c.id} href={`/controls/${c.id}`}>
                                <Badge variant="outline" className="text-xs cursor-pointer hover:bg-muted">{c.label}</Badge>
                              </Link>
                            ))}
                          {doc.linkedControls.length > 3 && (
                            <span className="text-xs text-muted-foreground">+{doc.linkedControls.length - 3}</span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1 max-w-[150px]">
                          {doc.domains.length === 0
                            ? <span className="text-muted-foreground text-xs">—</span>
                            : doc.domains.slice(0, 2).map((d) => (
                              <span key={d.name} className="text-xs text-muted-foreground whitespace-nowrap">
                                {d.code ? `${d.code} · ` : ""}{d.name.length > 20 ? d.code || d.name : d.name}
                              </span>
                            ))}
                        </div>
                      </TableCell>
                      <TableCell className="text-sm">
                        {doc.cmmcLevels.length > 0
                          ? doc.cmmcLevels.join(", ")
                          : doc.cmmcLevel ?? "—"}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                        {doc.ownerName ?? "—"}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                        {doc.nextReviewDate
                          ? new Date(doc.nextReviewDate).toLocaleDateString()
                          : "—"}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          {doc.sourceType === "evidence" ? (
                            <Badge className="bg-blue-50 text-blue-700 border border-blue-200 text-xs whitespace-nowrap">
                              <UploadCloud className="h-3 w-3 mr-1" />
                              Uploaded
                            </Badge>
                          ) : (
                            <Badge className="bg-green-50 text-green-700 border border-green-200 text-xs whitespace-nowrap">
                              <FileText className="h-3 w-3 mr-1" />
                              Generated
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
