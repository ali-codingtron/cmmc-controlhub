import { useState } from "react";
import { useListDocuments } from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Link } from "wouter";
import { FilePlus, FileText } from "lucide-react";

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

const DOC_TYPE_LABELS: Record<string, string> = {
  policy: "Policy",
  procedure: "Procedure",
  log: "Log",
  register: "Register",
  checklist: "Checklist",
  narrative: "Narrative",
  form: "Form",
  plan: "Plan",
};

export default function DocumentsList() {
  const [search, setSearch] = useState("");
  const [docType, setDocType] = useState("all");
  const [status, setStatus] = useState("all");

  const { data: docs, isLoading } = useListDocuments({
    docType: docType !== "all" ? docType : undefined,
    status: status !== "all" ? status : undefined,
    search: search || undefined,
  });

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">All Documents</h1>
          <p className="text-muted-foreground mt-1">
            {docs?.length ?? 0} document{(docs?.length ?? 0) !== 1 ? "s" : ""}
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
          <div className="flex gap-3 mb-6 flex-wrap">
            <Input
              placeholder="Search documents..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="max-w-xs"
            />
            <Select value={docType} onValueChange={setDocType}>
              <SelectTrigger className="w-48">
                <SelectValue placeholder="Document Type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                <SelectItem value="policy">Policies</SelectItem>
                <SelectItem value="procedure">Procedures</SelectItem>
                <SelectItem value="log">Logs</SelectItem>
                <SelectItem value="register">Registers</SelectItem>
                <SelectItem value="checklist">Checklists</SelectItem>
                <SelectItem value="narrative">Narratives</SelectItem>
                <SelectItem value="plan">Plans</SelectItem>
              </SelectContent>
            </Select>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger className="w-48">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                <SelectItem value="draft">Draft</SelectItem>
                <SelectItem value="pending_review">Pending Review</SelectItem>
                <SelectItem value="approved">Approved</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="needs_update">Needs Update</SelectItem>
                <SelectItem value="expired">Expired</SelectItem>
                <SelectItem value="archived">Archived</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {isLoading ? (
            <div className="text-center py-8 text-muted-foreground">Loading documents...</div>
          ) : !docs?.length ? (
            <div className="text-center py-12 text-muted-foreground">
              <FileText className="h-12 w-12 mx-auto mb-3 opacity-30" />
              <p className="font-medium">No documents found</p>
              <p className="text-sm mt-1">Generate your first document from a template</p>
              <Button asChild className="mt-4">
                <Link href="/documents/generate">Browse Templates</Link>
              </Button>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Title</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Version</TableHead>
                  <TableHead>Owner</TableHead>
                  <TableHead>Next Review</TableHead>
                  <TableHead>Updated</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {docs.map((doc) => (
                  <TableRow key={doc.id} className={doc.status === "expired" || doc.status === "needs_update" ? "bg-red-50 dark:bg-red-950/20" : ""}>
                    <TableCell className="font-medium">
                      <Link href={`/documents/${doc.id}`} className="text-primary hover:underline flex items-center gap-2">
                        <FileText className="h-3.5 w-3.5 opacity-60" />
                        {doc.title}
                      </Link>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-xs">
                        {DOC_TYPE_LABELS[doc.docType] ?? doc.docType}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${DOC_STATUS_COLORS[doc.status] ?? ""}`}>
                        {doc.status.replace(/_/g, " ")}
                      </span>
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">v{doc.version}</TableCell>
                    <TableCell className="text-sm">{(doc as any).ownerName ?? "—"}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {doc.nextReviewDate ? new Date(doc.nextReviewDate).toLocaleDateString() : "—"}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {new Date(doc.updatedAt).toLocaleDateString()}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
