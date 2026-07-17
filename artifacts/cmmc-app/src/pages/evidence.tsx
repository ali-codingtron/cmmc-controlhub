import { useState, useMemo } from "react";
import { EvidencePreviewModal } from "@/components/EvidencePreviewModal";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListEvidence,
  getListEvidenceQueryKey,
  useListControls,
  useListUsers,
} from "@workspace/api-client-react";
import type { EvidenceItem, ControlWithStatus, User } from "@workspace/api-client-react";
import { useOrg } from "@/context/OrgContext";
import { useIsAssessor } from "@/lib/auth";
import { useDemoMode } from "@/context/DemoModeContext";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
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
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
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
  Check,
  ChevronDown,
  Pencil,
  Package,
  Files,
  ArrowUp,
  ArrowDown,
  ArrowUpDown,
  FileSpreadsheet,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { BulkDownloadWizard } from "@/components/bulk-export/BulkDownloadWizard";
import { EvidenceUploadModal } from "@/components/evidence/EvidenceUploadModal";
import { EvidenceBulkUploadModal } from "@/components/evidence/EvidenceBulkUploadModal";
import { EvidenceMappingImportModal } from "@/components/evidence/EvidenceMappingImportModal";

// ─── Constants ───────────────────────────────────────────────────────────────

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

// ─── Helpers ─────────────────────────────────────────────────────────────────

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

// ─── Multi-select control combobox ───────────────────────────────────────────

interface MultiControlComboboxProps {
  controls: ControlWithStatus[];
  selected: string[];
  onChange: (ids: string[]) => void;
}

function MultiControlCombobox({ controls, selected, onChange }: MultiControlComboboxProps) {
  const [open, setOpen] = useState(false);

  const toggle = (id: string) => {
    onChange(
      selected.includes(id)
        ? selected.filter((s) => s !== id)
        : [...selected, id]
    );
  };

  const clearAll = (e: React.MouseEvent) => {
    e.stopPropagation();
    onChange([]);
  };

  const label = useMemo(() => {
    if (selected.length === 0) return null;
    if (selected.length === 1) {
      const ctrl = controls.find((c) => c.id === selected[0]);
      return ctrl ? ctrl.controlId : "1 selected";
    }
    return `${selected.length} Controls`;
  }, [selected, controls]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn(
            "h-8 text-sm px-3 gap-1.5 min-w-[11rem] max-w-[16rem] justify-between font-normal",
            selected.length > 0 && "border-primary/60 bg-primary/5"
          )}
        >
          <span className="truncate text-left flex-1">
            {label ?? (
              <span className="text-muted-foreground">All Controls</span>
            )}
          </span>
          {selected.length > 0 ? (
            <X
              className="h-3 w-3 shrink-0 text-muted-foreground hover:text-foreground"
              onClick={clearAll}
            />
          ) : (
            <ChevronDown className="h-3 w-3 shrink-0 text-muted-foreground" />
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="p-0 w-[22rem]"
        align="start"
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <Command>
          <CommandInput placeholder="Search controls…" />
          <CommandList>
            <CommandEmpty>No controls found.</CommandEmpty>
            {selected.length > 0 && (
              <>
                <CommandGroup heading="Selected">
                  {controls
                    .filter((c) => selected.includes(c.id))
                    .map((ctrl) => (
                      <CommandItem
                        key={ctrl.id}
                        value={`${ctrl.controlId} ${ctrl.title}`}
                        onSelect={() => toggle(ctrl.id)}
                        className="gap-2"
                      >
                        <Check className="h-3.5 w-3.5 text-primary shrink-0" />
                        <span className="font-mono text-xs shrink-0">{ctrl.controlId}</span>
                        <span className="text-xs text-muted-foreground truncate">{ctrl.title}</span>
                      </CommandItem>
                    ))}
                </CommandGroup>
                <CommandSeparator />
              </>
            )}
            <CommandGroup heading="All Controls">
              {controls.map((ctrl) => {
                const isSelected = selected.includes(ctrl.id);
                return (
                  <CommandItem
                    key={ctrl.id}
                    value={`${ctrl.controlId} ${ctrl.title}`}
                    onSelect={() => toggle(ctrl.id)}
                    className="gap-2"
                  >
                    <div
                      className={cn(
                        "h-3.5 w-3.5 shrink-0 rounded-sm border border-muted-foreground/40 flex items-center justify-center",
                        isSelected && "bg-primary border-primary"
                      )}
                    >
                      {isSelected && (
                        <Check className="h-2.5 w-2.5 text-primary-foreground" />
                      )}
                    </div>
                    <span className="font-mono text-xs shrink-0 text-primary">{ctrl.controlId}</span>
                    <span className="text-xs text-muted-foreground truncate">{ctrl.title}</span>
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </CommandList>
          {selected.length > 0 && (
            <div className="border-t p-2">
              <Button
                variant="ghost"
                size="sm"
                className="w-full h-7 text-xs text-muted-foreground"
                onClick={() => onChange([])}
              >
                Clear all ({selected.length} selected)
              </Button>
            </div>
          )}
        </Command>
      </PopoverContent>
    </Popover>
  );
}

// ─── Single-select owner combobox ─────────────────────────────────────────────

interface SingleOwnerComboboxProps {
  users: User[];
  selected: string | null;
  onChange: (id: string | null) => void;
}

function SingleOwnerCombobox({ users, selected, onChange }: SingleOwnerComboboxProps) {
  const [open, setOpen] = useState(false);

  const selectedUser = useMemo(
    () => users.find((u) => u.id === selected) ?? null,
    [users, selected]
  );

  const clearOwner = (e: React.MouseEvent) => {
    e.stopPropagation();
    onChange(null);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn(
            "h-8 text-sm px-3 gap-1.5 min-w-[9rem] max-w-[14rem] justify-between font-normal",
            selected && "border-primary/60 bg-primary/5"
          )}
        >
          <span className="truncate text-left flex-1">
            {selectedUser ? (
              selectedUser.name
            ) : (
              <span className="text-muted-foreground">All Owners</span>
            )}
          </span>
          {selected ? (
            <X
              className="h-3 w-3 shrink-0 text-muted-foreground hover:text-foreground"
              onClick={clearOwner}
            />
          ) : (
            <ChevronDown className="h-3 w-3 shrink-0 text-muted-foreground" />
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="p-0 w-[16rem]"
        align="start"
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <Command>
          <CommandInput placeholder="Search owners…" />
          <CommandList>
            <CommandEmpty>No users found.</CommandEmpty>
            <CommandGroup>
              {selected && (
                <CommandItem
                  value="__clear__"
                  onSelect={() => {
                    onChange(null);
                    setOpen(false);
                  }}
                  className="gap-2 text-muted-foreground italic"
                >
                  <X className="h-3.5 w-3.5 shrink-0" />
                  Clear filter
                </CommandItem>
              )}
              {users.map((user) => {
                const isSelected = user.id === selected;
                return (
                  <CommandItem
                    key={user.id}
                    value={`${user.name} ${user.email}`}
                    onSelect={() => {
                      onChange(isSelected ? null : user.id);
                      setOpen(false);
                    }}
                    className="gap-2"
                  >
                    <Check
                      className={cn(
                        "h-3.5 w-3.5 shrink-0",
                        isSelected ? "text-primary" : "opacity-0"
                      )}
                    />
                    <div className="flex flex-col min-w-0">
                      <span className="text-sm truncate">{user.name}</span>
                      <span className="text-[10px] text-muted-foreground capitalize">{user.role?.replace(/_/g, " ")}</span>
                    </div>
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

// ─── Sortable column header ───────────────────────────────────────────────────

type SortDir = "asc" | "desc";

function SortableHead({
  col,
  label,
  sortKey,
  sortDir,
  onSort,
  className,
}: {
  col: string;
  label: string;
  sortKey: string;
  sortDir: SortDir;
  onSort: (col: string) => void;
  className?: string;
}) {
  const active = sortKey === col;
  const Icon = active ? (sortDir === "asc" ? ArrowUp : ArrowDown) : ArrowUpDown;
  return (
    <TableHead
      className={cn("cursor-pointer select-none whitespace-nowrap", className)}
      onClick={() => onSort(col)}
    >
      <div className="flex items-center gap-1">
        {label}
        <Icon className={cn("h-3 w-3 shrink-0", active ? "text-primary" : "opacity-30")} />
      </div>
    </TableHead>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function Evidence() {
  const { activeOrg } = useOrg();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const isAssessor = useIsAssessor();
  const { isDemoMode } = useDemoMode();

  // Server-side filters (re-fetch when these change)
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterType, setFilterType] = useState("all");
  const [showArchived, setShowArchived] = useState(false);

  // Client-side filters
  const [search, setSearch] = useState("");
  const [filterDomain, setFilterDomain] = useState("all");
  const [filterLevel, setFilterLevel] = useState("all");
  const [selectedControlIds, setSelectedControlIds] = useState<string[]>([]);
  const [selectedOwnerId, setSelectedOwnerId] = useState<string | null>(null);

  const [deleteTarget, setDeleteTarget] = useState<{ id: string; title: string } | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showBulkDeleteConfirm, setShowBulkDeleteConfirm] = useState(false);
  const [isBulkDeleting, setIsBulkDeleting] = useState(false);
  const [bulkDeleteProgress, setBulkDeleteProgress] = useState<{ done: number; total: number } | null>(null);
  const [previewItem, setPreviewItem] = useState<EvidenceItem | null>(null);

  // Sort state
  const [sortKey, setSortKey] = useState<string>("createdAt");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const handleSort = (col: string) => {
    if (sortKey === col) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(col); setSortDir("asc"); }
  };

  // Upload modals
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [showBulkUploadModal, setShowBulkUploadModal] = useState(false);
  const [showMappingImportModal, setShowMappingImportModal] = useState(false);

  // Bulk selection
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showWizard, setShowWizard] = useState(false);

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const queryParams = {
    ...(filterStatus !== "all" ? { status: filterStatus } : {}),
    ...(filterType !== "all" ? { evidenceType: filterType } : {}),
    showArchived: showArchived ? "true" : undefined,
  };

  const { data: evidenceRaw = [], isLoading, refetch } = useListEvidence(queryParams as any);
  const { data: allControls = [] } = useListControls();
  const { data: allUsers = [] } = useListUsers();

  // Build unique security domain options from fetched evidence data
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

  // Client-side filtering
  const evidence = useMemo(() => {
    let items = evidenceRaw as EvidenceItem[];

    // Full-text search across content metadata (not owner/org names)
    const sq = normalizeStr(search.trim());
    if (sq) {
      items = items.filter((item) => {
        if (normalizeStr(item.title).includes(sq)) return true;
        if (item.fileName && normalizeStr(item.fileName).includes(sq)) return true;
        if (item.assessorSummary && normalizeStr(item.assessorSummary).includes(sq)) return true;
        if ((item as any).internalNotes && normalizeStr((item as any).internalNotes).includes(sq)) return true;
        if (item.evidenceType && normalizeStr(item.evidenceType).includes(sq)) return true;
        if ((item.tags ?? []).some((t) => normalizeStr(t).includes(sq))) return true;
        if ((item.linkedControlLabels ?? []).some((l) => normalizeStr(l).includes(sq))) return true;
        if ((item.domains ?? []).some((d) => normalizeStr(d.name).includes(sq) || normalizeStr(d.code).includes(sq))) return true;
        return false;
      });
    }

    // Security domain filter
    if (filterDomain !== "all") {
      items = items.filter((item) =>
        (item.domains ?? []).some((d) => d.code === filterDomain)
      );
    }

    // CMMC level filter
    if (filterLevel !== "all") {
      items = items.filter((item) =>
        (item.cmmcLevels ?? []).includes(filterLevel)
      );
    }

    // Control multi-select filter — item must link to at least one selected control
    if (selectedControlIds.length > 0) {
      items = items.filter((item) =>
        (item.linkedControlIds ?? []).some((id) => selectedControlIds.includes(id))
      );
    }

    // Owner single-select filter
    if (selectedOwnerId) {
      items = items.filter((item) => item.ownerId === selectedOwnerId);
    }

    // Sorting
    items = [...items].sort((a, b) => {
      let av: string | number = "";
      let bv: string | number = "";
      switch (sortKey) {
        case "title":
          av = (a.title ?? "").toLowerCase();
          bv = (b.title ?? "").toLowerCase();
          break;
        case "evidenceType":
          av = (a.evidenceType ?? "").toLowerCase();
          bv = (b.evidenceType ?? "").toLowerCase();
          break;
        case "status":
          av = (a.status ?? "").toLowerCase();
          bv = (b.status ?? "").toLowerCase();
          break;
        case "createdAt":
          av = a.createdAt ? new Date(a.createdAt as string).getTime() : 0;
          bv = b.createdAt ? new Date(b.createdAt as string).getTime() : 0;
          break;
        case "expiresAt":
          av = a.expiresAt ? new Date(a.expiresAt as string).getTime() : 0;
          bv = b.expiresAt ? new Date(b.expiresAt as string).getTime() : 0;
          break;
        case "owner":
          av = ((a as any).ownerName ?? "").toLowerCase();
          bv = ((b as any).ownerName ?? "").toLowerCase();
          break;
      }
      if (av < bv) return sortDir === "asc" ? -1 : 1;
      if (av > bv) return sortDir === "asc" ? 1 : -1;
      return 0;
    });

    return items;
  }, [evidenceRaw, search, filterDomain, filterLevel, selectedControlIds, selectedOwnerId, sortKey, sortDir]);

  const handleSelectAll = (checked: boolean) => {
    if (checked) setSelectedIds(new Set(evidence.map((i) => i.id)));
    else setSelectedIds(new Set());
  };

  const allSelected = evidence.length > 0 && evidence.every((i) => selectedIds.has(i.id));
  const someSelected = evidence.some((i) => selectedIds.has(i.id)) && !allSelected;

  const activeFilterCount = [
    filterStatus !== "all",
    filterType !== "all",
    filterDomain !== "all",
    filterLevel !== "all",
    selectedControlIds.length > 0,
    selectedOwnerId !== null,
    showArchived,
    search.trim() !== "",
  ].filter(Boolean).length;

  const clearAllFilters = () => {
    setFilterStatus("all");
    setFilterType("all");
    setFilterDomain("all");
    setFilterLevel("all");
    setSelectedControlIds([]);
    setSelectedOwnerId(null);
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

  const handleBulkDelete = async () => {
    const ids = Array.from(selectedIds);
    setIsBulkDeleting(true);
    setBulkDeleteProgress({ done: 0, total: ids.length });
    let failed = 0;
    for (let i = 0; i < ids.length; i++) {
      try {
        const res = await fetch(`/api/evidence/${ids[i]}`, {
          method: "DELETE",
          headers: apiHeaders(activeOrg?.id),
        });
        if (!res.ok) failed++;
      } catch {
        failed++;
      }
      setBulkDeleteProgress({ done: i + 1, total: ids.length });
    }
    setIsBulkDeleting(false);
    setBulkDeleteProgress(null);
    setShowBulkDeleteConfirm(false);
    setSelectedIds(new Set());
    invalidate();
    toast({
      title: failed === 0 ? "Deleted successfully" : `Deleted with ${failed} error${failed !== 1 ? "s" : ""}`,
      description: `${ids.length - failed} of ${ids.length} item${ids.length !== 1 ? "s" : ""} deleted.`,
      variant: failed > 0 ? "destructive" : "default",
    });
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
        <div className="flex gap-2 flex-wrap">
          {!isAssessor && (
            <>
              <Button onClick={() => setShowUploadModal(true)} className="gap-1.5">
                <Plus className="h-4 w-4" /> Upload Evidence
              </Button>
              <Button variant="outline" onClick={() => setShowBulkUploadModal(true)} className="gap-1.5">
                <Files className="h-4 w-4" /> Bulk Upload
              </Button>
              <Button variant="outline" onClick={() => setShowMappingImportModal(true)} className="gap-1.5">
                <FileSpreadsheet className="h-4 w-4" /> Mapping Import
              </Button>
            </>
          )}
          <Button variant="outline" onClick={() => setShowWizard(true)} className="gap-1.5">
            <Package className="h-4 w-4" /> Bulk Download
          </Button>
        </div>
      </div>

      <Card>
        {/* Search + Filter Bar */}
        <div className="p-4 border-b space-y-3">
          {/* Search row */}
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search title, filename, control ID, type, tags, summary..."
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

            {/* Control multi-select combobox */}
            <MultiControlCombobox
              controls={allControls}
              selected={selectedControlIds}
              onChange={setSelectedControlIds}
            />

            {/* Owner single-select combobox */}
            <SingleOwnerCombobox
              users={allUsers}
              selected={selectedOwnerId}
              onChange={setSelectedOwnerId}
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

          {/* Selected control badges */}
          {selectedControlIds.length > 0 && (
            <div className="flex flex-wrap gap-1.5 items-center pt-0.5">
              <span className="text-xs text-muted-foreground">Controls:</span>
              {selectedControlIds.map((cid) => {
                const ctrl = allControls.find((c) => c.id === cid);
                return ctrl ? (
                  <Badge
                    key={cid}
                    variant="secondary"
                    className="text-xs gap-1 pl-2 pr-1 font-mono cursor-pointer"
                    onClick={() =>
                      setSelectedControlIds((prev) => prev.filter((id) => id !== cid))
                    }
                  >
                    {ctrl.controlId}
                    <X className="h-2.5 w-2.5" />
                  </Badge>
                ) : null;
              })}
            </div>
          )}

          {/* Result count */}
          {!isLoading && (
            <p className="text-xs text-muted-foreground">
              {evidence.length} item{evidence.length !== 1 ? "s" : ""}
              {activeFilterCount > 0 ? " matching filters" : ""}
            </p>
          )}
        </div>

        {/* Bulk action bar */}
        {selectedIds.size > 0 && (
          <div className="px-4 py-2.5 border-b bg-primary/5 flex items-center gap-3">
            <span className="text-sm font-medium text-primary">
              {selectedIds.size} item{selectedIds.size !== 1 ? "s" : ""} selected
            </span>
            <Button size="sm" variant="default" onClick={() => setShowWizard(true)}>
              <Package className="h-3.5 w-3.5 mr-1.5" />
              Download ZIP
            </Button>
            {!isAssessor && (
              <Button
                size="sm"
                variant="destructive"
                onClick={() => setShowBulkDeleteConfirm(true)}
              >
                <Trash2 className="h-3.5 w-3.5 mr-1.5" />
                Delete Selected
              </Button>
            )}
            <Button
              size="sm"
              variant="ghost"
              className="text-muted-foreground"
              onClick={() => setSelectedIds(new Set())}
            >
              <X className="h-3.5 w-3.5 mr-1" />
              Clear Selection
            </Button>
          </div>
        )}

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
                  {!isAssessor
                    ? "Use the Upload Evidence button above or upload from a control's Evidence tab."
                    : "No evidence has been uploaded yet."}
                </p>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[40px] pl-4">
                      <Checkbox
                        checked={allSelected}
                        data-state={someSelected ? "indeterminate" : allSelected ? "checked" : "unchecked"}
                        onCheckedChange={(v) => handleSelectAll(!!v)}
                        aria-label="Select all"
                      />
                    </TableHead>
                    <SortableHead col="title" label="Title" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} className="min-w-[200px]" />
                    <SortableHead col="evidenceType" label="Type" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
                    <SortableHead col="status" label="Status" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
                    <TableHead className="min-w-[160px]">Linked Controls</TableHead>
                    <TableHead className="whitespace-nowrap">Security Domain</TableHead>
                    <TableHead>Level</TableHead>
                    <SortableHead col="owner" label="Owner" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
                    <SortableHead col="createdAt" label="Uploaded" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
                    <SortableHead col="expiresAt" label="Expires" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
                    <TableHead className="w-[52px]" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {evidence.map((item) => (
                    <TableRow
                      key={item.id}
                      className={cn(
                        item.status === "archived" ? "opacity-55" : "",
                        selectedIds.has(item.id) && "bg-primary/5"
                      )}
                    >
                      {/* Checkbox */}
                      <TableCell className="pl-4 align-top">
                        <Checkbox
                          checked={selectedIds.has(item.id)}
                          onCheckedChange={() => toggleSelect(item.id)}
                          aria-label={`Select ${item.title}`}
                        />
                      </TableCell>
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

                      {/* Linked Controls — primary +N format */}
                      <TableCell className="align-top">
                        {(item.linkedControls ?? []).length > 0 ? (() => {
                          const controls = item.linkedControls ?? [];
                          const primary = (controls as any[]).find((c: any) => c.isPrimary) ?? controls[0];
                          const additionalCount = controls.length - 1;
                          return (
                            <div className="flex items-center gap-1 flex-wrap">
                              <Badge
                                variant="outline"
                                className={cn(
                                  "text-[10px] font-mono px-1.5 py-0 cursor-pointer transition-colors",
                                  selectedControlIds.includes((primary as any).id) && "bg-primary/10 border-primary/40"
                                )}
                                onClick={() => {
                                  const cid = (primary as any).id;
                                  setSelectedControlIds((prev) =>
                                    prev.includes(cid) ? prev.filter((id) => id !== cid) : [...prev, cid]
                                  );
                                }}
                              >
                                {(primary as any).label}
                              </Badge>
                              {additionalCount > 0 && (
                                <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                                  +{additionalCount}
                                </Badge>
                              )}
                            </div>
                          );
                        })() : (
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
                        {item.ownerName ? (
                          <button
                            className={cn(
                              "hover:text-foreground transition-colors",
                              selectedOwnerId === item.ownerId && "text-primary font-medium"
                            )}
                            onClick={() =>
                              setSelectedOwnerId((prev) =>
                                prev === item.ownerId ? null : item.ownerId
                              )
                            }
                            title="Filter by this owner"
                          >
                            {item.ownerName}
                          </button>
                        ) : (
                          "—"
                        )}
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
                            <DropdownMenuItem
                              onClick={() => setPreviewItem(item)}
                              className="flex items-center gap-2"
                            >
                              <Eye className="h-4 w-4" />
                              View
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
                            <DropdownMenuItem asChild>
                              <Link
                                href={`/evidence/${item.id}`}
                                className="flex items-center gap-2"
                              >
                                <Pencil className="h-4 w-4" />
                                Edit
                              </Link>
                            </DropdownMenuItem>
                            {!isAssessor && item.status !== "archived" && (
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
                            {!isAssessor && (
                              <>
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
                              </>
                            )}
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

      {/* Bulk Delete Confirmation Dialog */}
      <Dialog open={showBulkDeleteConfirm} onOpenChange={(o) => { if (!isBulkDeleting) setShowBulkDeleteConfirm(o); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Permanently Delete {selectedIds.size} Item{selectedIds.size !== 1 ? "s" : ""}?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground py-2">
            This will permanently delete{" "}
            <span className="font-medium text-foreground">{selectedIds.size} evidence item{selectedIds.size !== 1 ? "s" : ""}</span>
            , remove all their control links, and delete all uploaded files. This cannot be undone.
          </p>
          <p className="text-sm text-muted-foreground">
            To preserve the audit trail, use <strong>Archive</strong> on individual items instead.
          </p>
          {bulkDeleteProgress && (
            <div className="space-y-1.5">
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>Deleting…</span>
                <span>{bulkDeleteProgress.done} / {bulkDeleteProgress.total}</span>
              </div>
              <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                <div
                  className="h-full bg-destructive transition-all"
                  style={{ width: `${(bulkDeleteProgress.done / bulkDeleteProgress.total) * 100}%` }}
                />
              </div>
            </div>
          )}
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setShowBulkDeleteConfirm(false)} disabled={isBulkDeleting}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleBulkDelete} disabled={isBulkDeleting}>
              {isBulkDeleting ? "Deleting…" : `Delete ${selectedIds.size} Item${selectedIds.size !== 1 ? "s" : ""}`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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

      {/* Upload Evidence Modal */}
      <EvidenceUploadModal
        open={showUploadModal}
        onClose={() => setShowUploadModal(false)}
        onSaved={() => {
          setShowUploadModal(false);
          invalidate();
        }}
      />

      {/* Bulk Upload Modal */}
      <EvidenceBulkUploadModal
        open={showBulkUploadModal}
        onClose={() => setShowBulkUploadModal(false)}
        onSaved={() => {
          setShowBulkUploadModal(false);
          invalidate();
        }}
      />

      {/* Mapping Import Modal */}
      <EvidenceMappingImportModal
        open={showMappingImportModal}
        onClose={() => setShowMappingImportModal(false)}
        onImported={() => {
          setShowMappingImportModal(false);
          invalidate();
        }}
      />

      {/* Evidence Preview Modal */}
      <EvidencePreviewModal
        item={previewItem}
        onClose={() => setPreviewItem(null)}
      />

      {/* Bulk Download Wizard */}
      <BulkDownloadWizard
        open={showWizard}
        onClose={() => setShowWizard(false)}
        orgId={activeOrg?.id ?? ""}
        orgName={activeOrg?.name ?? "Organization"}
        filteredEvidenceIds={evidence.map((i) => i.id)}
        filteredDocumentIds={[]}
        selectedEvidenceIds={[...selectedIds]}
        selectedDocumentIds={[]}
        context="evidence"
      />
    </div>
  );
}
