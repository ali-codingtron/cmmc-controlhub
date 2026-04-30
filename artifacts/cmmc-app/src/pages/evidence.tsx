import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useListEvidence, getListEvidenceQueryKey } from "@workspace/api-client-react";
import { useOrg } from "@/context/OrgContext";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { StatusBadge } from "@/components/ui/badges";
import { useToast } from "@/hooks/use-toast";
import { Link } from "wouter";
import {
  Plus,
  MoreHorizontal,
  Eye,
  Archive,
  Trash2,
  Search,
  RefreshCw,
} from "lucide-react";

const EVIDENCE_TYPE_LABELS: Record<string, string> = {
  policy: "Policy",
  procedure: "Procedure",
  screenshot: "Screenshot",
  log: "Log",
  report: "Report",
  ticket: "Ticket",
  configuration_export: "Configuration Export",
  access_review: "Access Review",
  training_record: "Training Record",
  incident_record: "Incident Record",
  risk_record: "Risk Record",
  approval_record: "Approval Record",
  system_inventory: "System Inventory",
  asset_inventory: "Asset Inventory",
  supplier_review: "Supplier Review",
  backup_verification: "Backup Verification",
  network_diagram: "Network Diagram",
  scan_report: "Vulnerability Scan",
  other: "Other",
};

function formatDate(d: string | Date | null | undefined) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString();
}

function apiHeaders(orgId: string | null | undefined) {
  const token = localStorage.getItem("auth_token");
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
    ...(orgId ? { "X-Organization-ID": orgId } : {}),
  };
}

export default function Evidence() {
  const { activeOrg } = useOrg();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; title: string } | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const queryParams = {
    search: search || undefined,
    showArchived: showArchived ? "true" : undefined,
  };

  const { data: evidence = [], isLoading, refetch } = useListEvidence(queryParams as any);

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: getListEvidenceQueryKey(queryParams as any) });
    refetch();
  };

  const handleArchive = async (id: string, title: string) => {
    try {
      const res = await fetch(`/api/evidence/${id}/archive`, {
        method: "POST",
        headers: apiHeaders(activeOrg?.id),
      });
      if (!res.ok) throw new Error("Failed to archive");
      toast({ title: "Evidence archived", description: title });
      invalidate();
    } catch {
      toast({ title: "Error", description: "Could not archive evidence", variant: "destructive" });
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setIsDeleting(true);
    try {
      const res = await fetch(`/api/evidence/${deleteTarget.id}`, {
        method: "DELETE",
        headers: apiHeaders(activeOrg?.id),
      });
      if (!res.ok) throw new Error("Failed to delete");
      toast({ title: "Evidence deleted", description: deleteTarget.title });
      setDeleteTarget(null);
      invalidate();
    } catch {
      toast({ title: "Error", description: "Could not delete evidence", variant: "destructive" });
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">Evidence Repository</h1>
          <p className="text-muted-foreground text-sm mt-1">
            All evidence items for this organization
          </p>
        </div>
        <Button asChild>
          <Link href="/evidence/upload">
            <Plus className="mr-2 h-4 w-4" /> Upload Evidence
          </Link>
        </Button>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
            <div className="relative w-full sm:max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search evidence..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant={showArchived ? "default" : "outline"}
                size="sm"
                onClick={() => setShowArchived((v) => !v)}
              >
                {showArchived ? "Hide Archived" : "Show Archived"}
              </Button>
              <Button variant="ghost" size="icon" onClick={invalidate} title="Refresh">
                <RefreshCw className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="py-12 text-center text-muted-foreground">Loading evidence...</div>
          ) : evidence.length === 0 ? (
            <div className="py-12 text-center">
              <p className="text-muted-foreground font-medium">No evidence found.</p>
              <p className="text-sm text-muted-foreground mt-1">
                Upload evidence from a control's Evidence tab or click "Upload Evidence" above.
              </p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Title</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Owner</TableHead>
                  <TableHead>Linked Controls</TableHead>
                  <TableHead>Uploaded</TableHead>
                  <TableHead>Expires</TableHead>
                  <TableHead className="w-[60px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {evidence.map((item: any) => (
                  <TableRow key={item.id} className={item.status === "archived" ? "opacity-60" : ""}>
                    <TableCell className="font-medium">
                      <Link
                        href={`/evidence/${item.id}`}
                        className="text-primary hover:underline"
                      >
                        {item.title}
                      </Link>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {EVIDENCE_TYPE_LABELS[item.evidenceType] ?? item.evidenceType}
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={item.status} />
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {item.ownerName ?? "—"}
                    </TableCell>
                    <TableCell>
                      {item.linkedControlLabels && item.linkedControlLabels.length > 0 ? (
                        <div className="flex flex-wrap gap-1">
                          {item.linkedControlLabels.map((label: string) => (
                            <Badge key={label} variant="outline" className="text-xs font-mono">
                              {label}
                            </Badge>
                          ))}
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {formatDate(item.createdAt)}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {item.expiresAt ? formatDate(item.expiresAt) : "—"}
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem asChild>
                            <Link href={`/evidence/${item.id}`} className="flex items-center gap-2">
                              <Eye className="h-4 w-4" />
                              View / Edit
                            </Link>
                          </DropdownMenuItem>
                          {item.status !== "archived" && (
                            <>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                onClick={() => handleArchive(item.id, item.title)}
                                className="flex items-center gap-2"
                              >
                                <Archive className="h-4 w-4" />
                                Archive
                              </DropdownMenuItem>
                            </>
                          )}
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            onClick={() => setDeleteTarget({ id: item.id, title: item.title })}
                            className="flex items-center gap-2 text-red-600 focus:text-red-600"
                          >
                            <Trash2 className="h-4 w-4" />
                            Permanent Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Delete Confirmation Dialog */}
      <Dialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Permanently Delete Evidence?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground py-2">
            This will permanently delete{" "}
            <span className="font-medium text-foreground">"{deleteTarget?.title}"</span>,
            remove all control links, and delete the uploaded file. This cannot be undone.
          </p>
          <p className="text-sm text-muted-foreground">
            If you want to keep the audit trail, use <strong>Archive</strong> instead.
          </p>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDelete} disabled={isDeleting}>
              {isDeleting ? "Deleting..." : "Delete Permanently"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
