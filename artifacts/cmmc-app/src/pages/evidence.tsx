import { useState, useMemo } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useListEvidence, getListEvidenceQueryKey } from "@workspace/api-client-react";
import type { EvidenceItem } from "@workspace/api-client-react";
import { useOrg } from "@/context/OrgContext";
import { Card, CardContent } from "@/components/ui/card";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import { StatusBadge, LevelBadge } from "@/components/ui/badges";
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
  Download,
  Filter,
  X,
} from "lucide-react";

const EVIDENCE_TYPES = [
  { value: "policy", label: "Policy" },
  { value: "procedure", label: "Procedure" },
  { value: "screenshot", label: "Screenshot" },
  { value: "log", label: "Log" },
  { value: "report", label: "Report" },
  { value: "ticket", label: "Ticket" },
  { value: "configuration_export", label: "Configuration Export" },
  { value: "training_record", label: "Training Record" },
  { value: "incident_record", label: "Incident Record" },
  { value: "risk_record", label: "Risk Record" },
  { value: "approval_record", label: "Approval Record" },
  { value: "network_diagram", label: "Network Diagram" },
  { value: "scan_report", label: "Vulnerability Scan" },
  { value: "other", label: "Other" },
];

const EVIDENCE_STATUSES = [
  { value: "draft", label: "Draft" },
  { value: "pending_review", label: "Pending Review" },
  { value: "approved", label: "Approved" },
  { value: "active", label: "Active" },
  { value: "assessor_ready", label: "Assessor Ready" },
  { value: "rejected", label: "Rejected" },
  { value: "stale", label: "Stale" },
  { value: "superseded", label: "Superseded" },
  { value: "archived", label: "Archived" },
];

const CMMC_LEVELS = ["L1", "L2"];

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

function normalizeStr(s: string) {
  return s.toLowerCase();
}

export default function Evidence() {
  const { activeOrg } = useOrg();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Server-side filters (re-fetch when these change)
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterType, setFilterType] = useState("all");
  const [showArchived, setShowArchived] = useState(false);

  // Client-side filters (applied on already-fetched data)
  const [search, setSearch] = useState("");
  const [filterDomain, setFilterDomain] = useState("all");
  const [filterLevel, setFilterLevel] = useState("all");
  const [filterControl, setFilterControl] = useState("");
  const [filterOwner, setFilterOwner] = useState("");

  const [deleteTarget, setDeleteTarget] = useState<{ id: string; title: string } | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const queryParams = {
    ...(filterStatus !== "all" ? { status: filterStatus } : {}),
    ...(filterType !== "all" ? { evidenceType: filterType } : {}),
    showArchived: showArchived ? "true" : undefined,
  };

  const { data: evidenceRaw = [], isLoading, refetch } = useListEvidence(queryParams as any);

  // Build unique security domain options from currently fetched data
  const domainOptions = useMemo(() => {
    const seen = new Map<string, string>();
    for (const item of evidenceRaw) {
      for (const d of (item.domains ?? [])) {
        if (d.code && !seen.has(d.code)) seen.set(d.code, d.name);
      }
    }
    return Array.from(seen.entries())
      .map(([code, name]) => ({ code, name }))
      .sort((a, b) => a.code.localeCompare(b.code));
  }, [evidenceRaw]);

  // Client-side filtering (search, domain, level, control label, owner)
  const evidence = useMemo(() => {
    let items = evidenceRaw as EvidenceItem[];

    const sq = normalizeStr(search.trim());
    if (sq) {
      items = items.filter((item) => {
        if (normalizeStr(item.title).includes(sq)) return true;
        if (item.fileName && normalizeStr(item.fileName).includes(sq)) return true;
        if (item.assessorSummary && normalizeStr(item.assessorSummary).includes(sq)) return true;
        if ((item.tags ?? []).some((t) => normalizeStr(t).includes(sq))) return true;
        if ((item.linkedControlLabels ?? []).some((l) => normalizeStr(l).includes(sq))) return true;
        if (item.ownerName && normalizeStr(item.ownerName).includes(sq)) return true;
        return false;
      });
    }

    if (filterDomain !== "all") {
      items = items.filter((item) =>
        (item.domains ?? []).some((d) => d.code === filterDomain)
      );
    }

    if (filterLevel !== "all") {
      items = items.filter((item) =>
        (item.cmmcLevels ?? []).includes(filterLevel)
      );
    }

    const fc = filterControl.trim();
    if (fc) {
      const fcn = normalizeStr(fc);
      items = items.filter((item) =>
        (item.linkedControlLabels ?? []).some((l) => normalizeStr(l).includes(fcn))
      );
    }

    const fo = filterOwner.trim();
    if (fo) {
      const fon = normalizeStr(fo);
      items = items.filter((item) =>
        item.ownerName ? normalizeStr(item.ownerName).includes(fon) : false
      );
    }

    return items;
  }, [evidenceRaw, search, filterDomain, filterLevel, filterControl, filterOwner]);

  const activeFilterCount = [
    filterStatus !== "all",
    filterType !== "all",
    filterDomain !== "all",
    filterLevel !== "all",
    filterControl.trim() !== "",
    filterOwner.trim() !== "",
    showArchived,
    search.trim() !== "",
  ].filter(Boolean).length;

  const clearAllFilters = () => {
    setFilterStatus("all");
    setFilterType("all");
    setFilterDomain("all");
    setFilterLevel("all");
    setFilterControl("");
    setFilterOwner("");
    setShowArchived(false);
    setSearch("");
  };

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

  const handleDownload = async (item: EvidenceItem) => {
    if (!item.fileName) {
      toast({ title: "No file attached", description: "This evidence item has no uploaded file.", variant: "destructive" });
      return;
    }
    const token = localStorage.getItem("auth_token");
    const headers: Record<string, string> = {
      Authorization: `Bearer ${token ?? ""}`,
      ...(activeOrg?.id ? { "X-Organization-ID": activeOrg.id } : {}),
    };
    try {
      const res = await fetch(`/api/evidence/${item.id}/download`, { headers });
      if (!res.ok) throw new Error("Download failed");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = item.fileName;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      toast({ title: "Download failed", description: "Could not download the file.", variant: "destructive" });
    }
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex justify-between items-start">
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
        {/* Search + Filter Bar */}
        <div className="p-4 border-b space-y-3">
          {/* Search row */}
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search title, file name, summary, tags, control ID…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            <Button variant="ghost" size="icon" onClick={invalidate} title="Refresh">
              <RefreshCw className="h-4 w-4" />
            </Button>
          </div>

          {/* Filter dropdowns row */}
          <div className="flex flex-wrap gap-2 items-center">
            <Filter className="h-4 w-4 text-muted-foreground shrink-0" />

            {/* Evidence Type */}
            <Select value={filterType} onValueChange={setFilterType}>
              <SelectTrigger className="w-44 h-8 text-sm">
                <SelectValue placeholder="All Types" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                {EVIDENCE_TYPES.map((t) => (
                  <SelectItem key={t.value} value={t.value}>
                    {t.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Status */}
            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger className="w-44 h-8 text-sm">
                <SelectValue placeholder="All Statuses" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                {EVIDENCE_STATUSES.map((s) => (
                  <SelectItem key={s.value} value={s.value}>
                    {s.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Security Domain */}
            <Select value={filterDomain} onValueChange={setFilterDomain}>
              <SelectTrigger className="w-52 h-8 text-sm">
                <SelectValue placeholder="All Domains" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Domains</SelectItem>
                {domainOptions.map((d) => (
                  <SelectItem key={d.code} value={d.code}>
                    <span className="font-mono mr-1">{d.code}</span>
                    <span className="text-muted-foreground">· {d.name}</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* CMMC Level */}
            <Select value={filterLevel} onValueChange={setFilterLevel}>
              <SelectTrigger className="w-32 h-8 text-sm">
                <SelectValue placeholder="Level" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Levels</SelectItem>
                {CMMC_LEVELS.map((l) => (
                  <SelectItem key={l} value={l}>
                    {l}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Linked Control text search */}
            <Input
              placeholder="Control (e.g. AC.L1)"
              value={filterControl}
              onChange={(e) => setFilterControl(e.target.value)}
              className="h-8 text-sm w-40 font-mono"
            />

            {/* Owner text search */}
            <Input
              placeholder="Owner name…"
              value={filterOwner}
              onChange={(e) => setFilterOwner(e.target.value)}
              className="h-8 text-sm w-36"
            />

            {/* Show Archived toggle */}
            <Button
              variant={showArchived ? "secondary" : "outline"}
              size="sm"
              className="h-8 text-sm"
              onClick={() => setShowArchived((v) => !v)}
            >
              {showArchived ? "Hide Archived" : "Show Archived"}
            </Button>

            {/* Clear all filters */}
            {activeFilterCount > 0 && (
              <Button
                variant="ghost"
                size="sm"
                className="h-8 text-sm gap-1 text-muted-foreground hover:text-foreground"
                onClick={clearAllFilters}
              >
                <X className="h-3 w-3" />
                Clear ({activeFilterCount})
              </Button>
            )}
          </div>

          {/* Result count */}
          {!isLoading && (
            <p className="text-xs text-muted-foreground">
              {evidence.length} item{evidence.length !== 1 ? "s" : ""}
              {activeFilterCount > 0 ? " matching filters" : ""}
            </p>
          )}
        </div>

        <CardContent className="p-0">
          {isLoading ? (
            <div className="py-16 text-center text-muted-foreground">
              Loading evidence…
            </div>
          ) : evidence.length === 0 ? (
            <div className="py-16 text-center space-y-2">
              <p className="font-medium text-muted-foreground">No evidence found.</p>
              {activeFilterCount > 0 ? (
                <p className="text-sm text-muted-foreground">
                  Try adjusting your filters or{" "}
                  <button
                    onClick={clearAllFilters}
                    className="text-primary hover:underline"
                  >
                    clear all filters
                  </button>
                  .
                </p>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Upload evidence from a control's Evidence tab or click "Upload Evidence" above.
                </p>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="min-w-[200px]">Title</TableHead>
                    <TableHead className="whitespace-nowrap">Type</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="min-w-[160px]">Linked Controls</TableHead>
                    <TableHead className="whitespace-nowrap">Security Domain</TableHead>
                    <TableHead>Level</TableHead>
                    <TableHead className="whitespace-nowrap">Owner</TableHead>
                    <TableHead className="whitespace-nowrap">Uploaded</TableHead>
                    <TableHead className="whitespace-nowrap">Expires</TableHead>
                    <TableHead className="w-[52px]" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {evidence.map((item) => (
                    <TableRow
                      key={item.id}
                      className={item.status === "archived" ? "opacity-55" : ""}
                    >
                      {/* Title + file name + tags */}
                      <TableCell className="font-medium align-top">
                        <Link
                          href={`/evidence/${item.id}`}
                          className="text-primary hover:underline leading-tight"
                        >
                          {item.title}
                        </Link>
                        {item.fileName && (
                          <p className="text-[11px] text-muted-foreground mt-0.5 truncate max-w-[230px]">
                            {item.fileName}
                          </p>
                        )}
                        {(item.tags ?? []).length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-1">
                            {(item.tags ?? []).slice(0, 3).map((tag) => (
                              <Badge
                                key={tag}
                                variant="secondary"
                                className="text-[10px] px-1.5 py-0 font-normal"
                              >
                                {tag}
                              </Badge>
                            ))}
                            {(item.tags ?? []).length > 3 && (
                              <span className="text-[10px] text-muted-foreground self-center">
                                +{(item.tags ?? []).length - 3}
                              </span>
                            )}
                          </div>
                        )}
                      </TableCell>

                      {/* Type */}
                      <TableCell className="text-sm text-muted-foreground whitespace-nowrap align-top">
                        {EVIDENCE_TYPES.find((t) => t.value === item.evidenceType)?.label ??
                          item.evidenceType}
                      </TableCell>

                      {/* Status */}
                      <TableCell className="align-top">
                        <StatusBadge status={item.status} />
                      </TableCell>

                      {/* Linked Controls badges */}
                      <TableCell className="align-top">
                        {(item.linkedControls ?? []).length > 0 ? (
                          <div className="flex flex-wrap gap-1">
                            {(item.linkedControls ?? []).slice(0, 4).map((c) => (
                              <Badge
                                key={c.id}
                                variant="outline"
                                className="text-[10px] font-mono px-1.5 py-0"
                              >
                                {c.label}
                              </Badge>
                            ))}
                            {(item.linkedControls ?? []).length > 4 && (
                              <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                                +{(item.linkedControls ?? []).length - 4}
                              </Badge>
                            )}
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </TableCell>

                      {/* Security Domain */}
                      <TableCell className="align-top">
                        {(item.domains ?? []).length > 0 ? (
                          <div className="flex flex-wrap gap-1">
                            {(item.domains ?? []).slice(0, 3).map((d) => (
                              <Badge
                                key={d.code}
                                variant="secondary"
                                className="text-[10px] font-mono px-1.5 py-0"
                              >
                                {d.code}
                              </Badge>
                            ))}
                            {(item.domains ?? []).length > 3 && (
                              <span className="text-[10px] text-muted-foreground self-center">
                                +{(item.domains ?? []).length - 3}
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </TableCell>

                      {/* CMMC Level */}
                      <TableCell className="align-top">
                        {(item.cmmcLevels ?? []).length > 0 ? (
                          <div className="flex flex-wrap gap-1">
                            {[...new Set(item.cmmcLevels ?? [])].map((lvl) => (
                              <LevelBadge key={lvl} level={lvl} />
                            ))}
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </TableCell>

                      {/* Owner */}
                      <TableCell className="text-sm text-muted-foreground whitespace-nowrap align-top">
                        {item.ownerName ?? "—"}
                      </TableCell>

                      {/* Uploaded date */}
                      <TableCell className="text-sm text-muted-foreground whitespace-nowrap align-top">
                        {formatDate(item.createdAt)}
                      </TableCell>

                      {/* Expires */}
                      <TableCell className="text-sm whitespace-nowrap align-top">
                        {item.expiresAt ? (
                          <span
                            className={
                              new Date(item.expiresAt) < new Date()
                                ? "text-red-500 font-medium"
                                : "text-muted-foreground"
                            }
                          >
                            {formatDate(item.expiresAt)}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>

                      {/* Actions */}
                      <TableCell className="align-top">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem asChild>
                              <Link
                                href={`/evidence/${item.id}`}
                                className="flex items-center gap-2"
                              >
                                <Eye className="h-4 w-4" />
                                View / Edit
                              </Link>
                            </DropdownMenuItem>
                            {item.fileName && (
                              <DropdownMenuItem
                                onClick={() => handleDownload(item)}
                                className="flex items-center gap-2"
                              >
                                <Download className="h-4 w-4" />
                                Download
                              </DropdownMenuItem>
                            )}
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
                              onClick={() =>
                                setDeleteTarget({ id: item.id, title: item.title })
                              }
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
            </div>
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
            <span className="font-medium text-foreground">
              "{deleteTarget?.title}"
            </span>
            , remove all control links, and delete the uploaded file. This
            cannot be undone.
          </p>
          <p className="text-sm text-muted-foreground">
            If you want to keep the audit trail, use{" "}
            <strong>Archive</strong> instead.
          </p>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={isDeleting}
            >
              {isDeleting ? "Deleting…" : "Delete Permanently"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
