import { useState, useMemo, useEffect } from "react";
import { useOrg } from "@/context/OrgContext";
import { useListOrgPackages } from "@workspace/api-client-react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  GitCompare,
  Link as LinkIcon,
  ArrowRight,
  ArrowLeftRight,
  X,
  ChevronDown,
  Info,
  AlertTriangle,
  CircleCheck,
  CircleDot,
  CircleAlert,
  ExternalLink,
  Layers,
  CheckCircle2,
  Shield,
} from "lucide-react";
import { Link } from "wouter";
import { cn } from "@/lib/utils";

interface CrosswalkEntry {
  id: string;
  sourceRequirementId: string;
  sourceKey: string;
  sourceTitle: string;
  sourcePackageName: string;
  sourcePackageId: string;
  sourceFramework: string;
  sourceControlId: string | null;
  sourceStatus: string | null;
  sourceNarrative: string | null;
  sourceDomain: string;
  targetRequirementId: string;
  targetKey: string;
  targetTitle: string;
  targetPackageName: string;
  targetPackageId: string;
  targetFramework: string;
  targetControlId: string | null;
  targetStatus: string | null;
  targetNarrative: string | null;
  targetDomain: string;
  relationshipType: string;
  notes: string | null;
}

function frameworkColor(fw: string): string {
  if (fw === "CMMC") return "bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-950/40 dark:text-purple-300 dark:border-purple-800";
  if (fw?.startsWith("NIST")) return "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-800";
  if (fw === "DFARS") return "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800";
  if (fw === "FAR") return "bg-slate-50 text-slate-600 border-slate-200";
  return "bg-slate-50 text-slate-600 border-slate-200";
}

function relationshipLabel(type: string): string {
  switch (type) {
    case "equivalent": return "Equivalent";
    case "maps_to": return "Direct Mapping";
    case "partially_maps_to": return "Partial Mapping";
    case "subset": return "Subset";
    case "superset": return "Superset";
    case "related": return "Related";
    case "partial_overlap": return "Partial Overlap";
    case "replaces": return "Replaces";
    case "replaced_by": return "Replaced By";
    case "supports": return "Supports";
    case "supported_by": return "Supported By";
    case "derived_from": return "Derived From";
    default: return type;
  }
}

function relationshipColor(type: string): string {
  switch (type) {
    case "equivalent": return "bg-emerald-50 text-emerald-700 border-emerald-200";
    case "maps_to": return "bg-green-50 text-green-700 border-green-200";
    case "partially_maps_to": return "bg-amber-50 text-amber-700 border-amber-200";
    case "subset": return "bg-blue-50 text-blue-700 border-blue-200";
    case "superset": return "bg-purple-50 text-purple-700 border-purple-200";
    case "related": return "bg-slate-50 text-slate-600 border-slate-200";
    case "partial_overlap": return "bg-orange-50 text-orange-700 border-orange-200";
    default: return "bg-slate-50 text-slate-600 border-slate-200";
  }
}

function implementationImpact(type: string): { label: string; color: string } {
  switch (type) {
    case "equivalent":
      return { label: "No additional work", color: "text-emerald-700" };
    case "maps_to":
      return { label: "Same implementation reused", color: "text-emerald-700" };
    case "partially_maps_to":
      return { label: "Additional evidence required", color: "text-amber-700" };
    case "subset":
      return { label: "Partial coverage — review needed", color: "text-amber-700" };
    case "superset":
      return { label: "Expanded scope required", color: "text-amber-700" };
    case "related":
      return { label: "Reference only", color: "text-slate-500" };
    case "replaces":
    case "replaced_by":
      return { label: "Narrative update required", color: "text-amber-700" };
    default:
      return { label: "Manual review required", color: "text-red-700" };
  }
}

function statusLabel(status: string | null): string {
  switch (status) {
    case "implemented": return "Implemented";
    case "in_progress": return "In Progress";
    case "not_started": return "Not Started";
    case "at_risk": return "At Risk";
    case "assessor_ready": return "Assessor Ready";
    default: return "Not Assessed";
  }
}

function statusColor(status: string | null): string {
  switch (status) {
    case "implemented": return "bg-emerald-50 text-emerald-700 border-emerald-200";
    case "in_progress": return "bg-amber-50 text-amber-700 border-amber-200";
    case "at_risk": return "bg-red-50 text-red-700 border-red-200";
    case "assessor_ready": return "bg-blue-50 text-blue-700 border-blue-200";
    default: return "bg-slate-50 text-slate-500 border-slate-200";
  }
}

function reuseAnalysis(type: string): { narrative: string; evidence: string; documents: string; monitoring: string; poam: string } {
  const yes = "Yes";
  const partial = "Partial";
  const review = "Review Required";
  const no = "No";
  switch (type) {
    case "equivalent":
    case "maps_to":
      return { narrative: yes, evidence: yes, documents: yes, monitoring: yes, poam: yes };
    case "partially_maps_to":
    case "subset":
    case "superset":
      return { narrative: partial, evidence: partial, documents: partial, monitoring: review, poam: review };
    default:
      return { narrative: review, evidence: review, documents: no, monitoring: no, poam: no };
  }
}

function ReuseRow({ label, value }: { label: string; value: string }) {
  const color = value === "Yes" ? "text-emerald-700" : value === "Partial" ? "text-amber-700" : value === "Review Required" ? "text-orange-600" : "text-red-600";
  const Icon = value === "Yes" ? CircleCheck : value === "Partial" ? CircleDot : value === "No" ? CircleAlert : AlertTriangle;
  return (
    <div className="flex items-center justify-between py-1 border-b border-border/40 last:border-0">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className={cn("text-xs font-medium flex items-center gap-1", color)}>
        <Icon className="h-3 w-3" />
        {value}
      </span>
    </div>
  );
}

function ExplanationPanel() {
  const [open, setOpen] = useState(false);
  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <div className="flex items-start gap-3 p-3 rounded-lg bg-blue-50/60 border border-blue-100 dark:bg-blue-950/20 dark:border-blue-900">
        <Info className="h-4 w-4 text-blue-600 shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-medium text-blue-900 dark:text-blue-200">What is a framework crosswalk?</p>
            <CollapsibleTrigger asChild>
              <Button variant="ghost" size="sm" className="h-6 px-2 text-xs text-blue-700 dark:text-blue-300">
                {open ? "Hide" : "Learn more"}
                <ChevronDown className={cn("h-3 w-3 ml-1 transition-transform", open && "rotate-180")} />
              </Button>
            </CollapsibleTrigger>
          </div>
          <p className="text-xs text-blue-700 dark:text-blue-300 mt-0.5">
            A framework crosswalk shows how requirements from one compliance package relate to requirements in another. It helps identify equivalent requirements, reusable evidence, changed requirements, and additional work.
          </p>
          <CollapsibleContent>
            <div className="mt-3 pt-3 border-t border-blue-200 dark:border-blue-800 grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs text-blue-800 dark:text-blue-300">
              <div>
                <p className="font-semibold mb-1">Equivalent</p>
                <p>Requirements are identical across both packages. One implementation record, one set of evidence — no duplication needed.</p>
              </div>
              <div>
                <p className="font-semibold mb-1">Direct Mapping</p>
                <p>Requirements have the same intent and implementation. Work performed for one satisfies the other.</p>
              </div>
              <div>
                <p className="font-semibold mb-1">Partial Mapping</p>
                <p>One requirement covers part of another. Additional evidence or narrative work may be needed for full coverage.</p>
              </div>
              <div>
                <p className="font-semibold mb-1">No Mapping / New</p>
                <p>A requirement exists in the target package with no equivalent in the source. Additional implementation work is required.</p>
              </div>
            </div>
          </CollapsibleContent>
        </div>
      </div>
    </Collapsible>
  );
}

function MetricCard({ label, value, sub, color }: { label: string; value: string | number; sub?: string; color?: string }) {
  return (
    <div className="flex flex-col gap-0.5 px-4 py-3 rounded-lg border border-border/60 bg-card min-w-[100px]">
      <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">{label}</p>
      <p className={cn("text-2xl font-extrabold tabular-nums", color ?? "text-foreground")}>{value}</p>
      {sub && <p className="text-[10px] text-muted-foreground">{sub}</p>}
    </div>
  );
}

function DetailDrawer({
  entry,
  onClose,
}: {
  entry: CrosswalkEntry | null;
  onClose: () => void;
}) {
  const reuse = entry ? reuseAnalysis(entry.relationshipType) : reuseAnalysis("equivalent");
  const impact = entry ? implementationImpact(entry.relationshipType) : implementationImpact("equivalent");
  const hasConsistencyIssue = entry?.sourceStatus && entry?.targetStatus && entry.sourceStatus !== entry.targetStatus;

  return (
    <Sheet open={!!entry} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right" className="w-full sm:max-w-2xl overflow-y-auto p-0">
        {entry && (
          <>
            <SheetHeader className="px-6 py-4 border-b border-border sticky top-0 bg-background z-10">
              <SheetTitle className="flex items-center gap-2 text-base">
                <GitCompare className="h-4 w-4 text-muted-foreground" />
                Mapping Detail
              </SheetTitle>
              <div className="flex items-center gap-2 flex-wrap">
                <Badge variant="outline" className={cn("text-[11px]", relationshipColor(entry.relationshipType))}>
                  {relationshipLabel(entry.relationshipType)}
                </Badge>
                <span className={cn("text-xs font-medium", impact.color)}>{impact.label}</span>
              </div>
            </SheetHeader>

            <div className="p-6 space-y-6">
              {hasConsistencyIssue && (
                <div className="flex items-start gap-2 p-3 rounded-lg bg-red-50 border border-red-200 dark:bg-red-950/20 dark:border-red-800">
                  <AlertTriangle className="h-4 w-4 text-red-600 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-semibold text-red-700">Mapping Consistency Issue</p>
                    <p className="text-xs text-red-600 mt-0.5">
                      These requirements are mapped as {relationshipLabel(entry.relationshipType).toLowerCase()}, but their implementation statuses differ:
                      source is <strong>{statusLabel(entry.sourceStatus)}</strong> while target is <strong>{statusLabel(entry.targetStatus)}</strong>.
                    </p>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <div className="flex items-center gap-1.5 mb-2">
                    <div className="h-1 w-4 rounded bg-purple-400" />
                    <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Source Requirement</p>
                  </div>
                  <Badge variant="outline" className={cn("text-[10px]", frameworkColor(entry.sourceFramework))}>
                    {entry.sourceFramework}
                  </Badge>
                  <p className="font-mono text-sm font-bold">{entry.sourceKey}</p>
                  {entry.sourceTitle && <p className="text-sm text-foreground leading-snug">{entry.sourceTitle}</p>}
                  <p className="text-[10px] text-muted-foreground">{entry.sourcePackageName}</p>
                  {entry.sourceDomain && (
                    <p className="text-[10px] text-muted-foreground">Domain: {entry.sourceDomain}</p>
                  )}
                  <Badge variant="outline" className={cn("text-[10px]", statusColor(entry.sourceStatus))}>
                    {statusLabel(entry.sourceStatus)}
                  </Badge>
                  {entry.sourceNarrative && (
                    <div className="mt-2 p-2 rounded bg-muted/50 text-xs text-muted-foreground max-h-24 overflow-y-auto">
                      {entry.sourceNarrative}
                    </div>
                  )}
                  {entry.sourceControlId && (
                    <Link href={`/controls/${entry.sourceControlId}`}>
                      <Button size="sm" variant="outline" className="gap-1.5 h-7 text-xs w-full">
                        <ExternalLink className="h-3 w-3" />
                        Open Source Control
                      </Button>
                    </Link>
                  )}
                </div>

                <div className="space-y-2">
                  <div className="flex items-center gap-1.5 mb-2">
                    <div className="h-1 w-4 rounded bg-blue-400" />
                    <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Target Requirement</p>
                  </div>
                  <Badge variant="outline" className={cn("text-[10px]", frameworkColor(entry.targetFramework))}>
                    {entry.targetFramework}
                  </Badge>
                  <p className="font-mono text-sm font-bold">{entry.targetKey}</p>
                  {entry.targetTitle && <p className="text-sm text-foreground leading-snug">{entry.targetTitle}</p>}
                  <p className="text-[10px] text-muted-foreground">{entry.targetPackageName}</p>
                  {entry.targetDomain && (
                    <p className="text-[10px] text-muted-foreground">Domain: {entry.targetDomain}</p>
                  )}
                  <Badge variant="outline" className={cn("text-[10px]", statusColor(entry.targetStatus))}>
                    {statusLabel(entry.targetStatus)}
                  </Badge>
                  {entry.targetNarrative && (
                    <div className="mt-2 p-2 rounded bg-muted/50 text-xs text-muted-foreground max-h-24 overflow-y-auto">
                      {entry.targetNarrative}
                    </div>
                  )}
                  {entry.targetControlId && (
                    <Link href={`/controls/${entry.targetControlId}`}>
                      <Button size="sm" variant="outline" className="gap-1.5 h-7 text-xs w-full">
                        <ExternalLink className="h-3 w-3" />
                        Open Target Control
                      </Button>
                    </Link>
                  )}
                </div>
              </div>

              <div className="space-y-2">
                <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Mapping</p>
                <div className="p-3 rounded-lg border border-border/60 bg-muted/20 space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground w-28">Relationship</span>
                    <Badge variant="outline" className={cn("text-[11px]", relationshipColor(entry.relationshipType))}>
                      {relationshipLabel(entry.relationshipType)}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground w-28">Mapping Source</span>
                    <Badge variant="outline" className="text-[10px] bg-blue-50 text-blue-700 border-blue-200">Official</Badge>
                  </div>
                  {entry.notes && (
                    <div className="flex items-start gap-2">
                      <span className="text-xs text-muted-foreground w-28 shrink-0">Rationale</span>
                      <p className="text-xs text-muted-foreground">{entry.notes}</p>
                    </div>
                  )}
                </div>
              </div>

              <div className="space-y-2">
                <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Reuse Analysis</p>
                <div className="p-3 rounded-lg border border-border/60 bg-muted/20">
                  <ReuseRow label="Implementation Narrative" value={reuse.narrative} />
                  <ReuseRow label="SSP Narrative" value={reuse.narrative} />
                  <ReuseRow label="Evidence" value={reuse.evidence} />
                  <ReuseRow label="Documents" value={reuse.documents} />
                  <ReuseRow label="Monitoring Records" value={reuse.monitoring} />
                  <ReuseRow label="POA&M Records" value={reuse.poam} />
                </div>
              </div>

              <div className="space-y-2">
                <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Actions</p>
                <div className="flex flex-wrap gap-2">
                  {entry.sourceControlId && (
                    <Link href={`/evidence?controlId=${entry.sourceControlId}`}>
                      <Button size="sm" variant="outline" className="gap-1.5 h-7 text-xs">
                        <Shield className="h-3 w-3" />
                        View Shared Evidence
                      </Button>
                    </Link>
                  )}
                  {entry.sourceControlId && (
                    <Link href={`/poams?controlId=${entry.sourceControlId}`}>
                      <Button size="sm" variant="outline" className="gap-1.5 h-7 text-xs">
                        <AlertTriangle className="h-3 w-3" />
                        Create Gap Action
                      </Button>
                    </Link>
                  )}
                </div>
              </div>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

function isActionRequired(entry: CrosswalkEntry): boolean {
  if (entry.relationshipType !== "equivalent" && entry.relationshipType !== "maps_to") return true;
  if (entry.sourceStatus && entry.targetStatus && entry.sourceStatus !== entry.targetStatus) return true;
  return false;
}

export default function Crosswalk() {
  const { activeOrg } = useOrg();
  const [search, setSearch] = useState("");
  const [quickFilter, setQuickFilter] = useState("all");
  const [groupByDomain, setGroupByDomain] = useState(false);
  const [selectedEntry, setSelectedEntry] = useState<CrosswalkEntry | null>(null);
  const [activeTab, setActiveTab] = useState("summary");

  const { data: orgPackages = [] } = useListOrgPackages(activeOrg?.id ?? "", {
    query: { enabled: !!activeOrg?.id } as any,
  });
  const activePackages = (orgPackages as any[]).filter((p) => p.isActive);

  const [pendingPkgAId, setPendingPkgAId] = useState<string>("");
  const [pendingPkgBId, setPendingPkgBId] = useState<string>("");
  const [committedPkgAId, setCommittedPkgAId] = useState<string>("");
  const [committedPkgBId, setCommittedPkgBId] = useState<string>("");

  useEffect(() => {
    if (activePackages.length >= 2 && !committedPkgAId) {
      const aId = activePackages[0].packageId;
      const bId = activePackages[1].packageId;
      setPendingPkgAId(aId);
      setPendingPkgBId(bId);
      setCommittedPkgAId(aId);
      setCommittedPkgBId(bId);
    }
  }, [activePackages.length, committedPkgAId]);

  const { data: crosswalk = [], isLoading } = useQuery<CrosswalkEntry[]>({
    queryKey: ["/api/crosswalk", activeOrg?.id],
    queryFn: async () => {
      const token = localStorage.getItem("auth_token");
      const res = await fetch("/api/crosswalk", {
        headers: {
          Authorization: `Bearer ${token}`,
          "X-Organization-ID": activeOrg?.id ?? "",
        },
      });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!activeOrg?.id,
    staleTime: 300000,
  });

  const pkgAInfo = activePackages.find((p: any) => p.packageId === committedPkgAId);
  const pkgBInfo = activePackages.find((p: any) => p.packageId === committedPkgBId);

  const pairFiltered = useMemo(() => {
    if (!committedPkgAId || !committedPkgBId) return crosswalk;
    if (committedPkgAId === committedPkgBId) return [];
    return crosswalk.filter((c) =>
      (c.sourcePackageId === committedPkgAId && c.targetPackageId === committedPkgBId) ||
      (c.sourcePackageId === committedPkgBId && c.targetPackageId === committedPkgAId)
    );
  }, [crosswalk, committedPkgAId, committedPkgBId]);

  const totalMappings = pairFiltered.length;
  const equivalentMappings = pairFiltered.filter((c) => c.relationshipType === "equivalent").length;
  const directMappings = pairFiltered.filter((c) => c.relationshipType === "maps_to").length;
  const partialMappings = pairFiltered.filter((c) => c.relationshipType === "partially_maps_to" || c.relationshipType === "partial_overlap").length;
  const actionRequiredCount = pairFiltered.filter(isActionRequired).length;
  const consistencyIssues = pairFiltered.filter(
    (c) => c.sourceStatus && c.targetStatus && c.sourceStatus !== c.targetStatus
  ).length;
  const reuseableCount = equivalentMappings + directMappings;
  const reusePercent = totalMappings > 0 ? Math.round((reuseableCount / totalMappings) * 100) : 0;
  const isFullAlignment = totalMappings > 0 && (equivalentMappings + directMappings) === totalMappings;

  const filtered = useMemo(() => {
    let rows = pairFiltered;
    if (search) {
      const q = search.toLowerCase();
      rows = rows.filter((c) =>
        c.sourceKey.toLowerCase().includes(q) ||
        c.targetKey.toLowerCase().includes(q) ||
        c.sourceTitle.toLowerCase().includes(q) ||
        c.targetTitle.toLowerCase().includes(q)
      );
    }
    switch (quickFilter) {
      case "equivalent": rows = rows.filter((c) => c.relationshipType === "equivalent" || c.relationshipType === "maps_to"); break;
      case "action_required": rows = rows.filter(isActionRequired); break;
      case "gaps": rows = rows.filter((c) => c.relationshipType !== "equivalent" && c.relationshipType !== "maps_to"); break;
      case "consistency": rows = rows.filter((c) => c.sourceStatus && c.targetStatus && c.sourceStatus !== c.targetStatus); break;
    }
    return rows;
  }, [pairFiltered, search, quickFilter]);

  const gapRows = useMemo(() => pairFiltered.filter((c) => c.relationshipType !== "equivalent" && c.relationshipType !== "maps_to"), [pairFiltered]);

  const domainGroups = useMemo(() => {
    if (!groupByDomain) return null;
    const groups: Record<string, CrosswalkEntry[]> = {};
    for (const row of filtered) {
      const domain = row.sourceDomain || "Other";
      if (!groups[domain]) groups[domain] = [];
      groups[domain].push(row);
    }
    return groups;
  }, [filtered, groupByDomain]);

  if (!activeOrg) {
    return (
      <div className="space-y-4">
        <h1 className="text-3xl font-bold">Framework Crosswalk & Gap Analysis</h1>
        <p className="text-muted-foreground">Select an organization to view the framework crosswalk.</p>
      </div>
    );
  }

  const fewPackages = activePackages.length < 2;

  function handleSwap() {
    const tmp = pendingPkgAId;
    setPendingPkgAId(pendingPkgBId);
    setPendingPkgBId(tmp);
  }

  function handleCompare() {
    if (pendingPkgAId && pendingPkgBId && pendingPkgAId !== pendingPkgBId) {
      setCommittedPkgAId(pendingPkgAId);
      setCommittedPkgBId(pendingPkgBId);
      setActiveTab("summary");
    }
  }

  function handleReset() {
    if (activePackages.length >= 2) {
      const aId = activePackages[0].packageId;
      const bId = activePackages[1].packageId;
      setPendingPkgAId(aId);
      setPendingPkgBId(bId);
      setCommittedPkgAId(aId);
      setCommittedPkgBId(bId);
    }
    setSearch("");
    setQuickFilter("all");
    setGroupByDomain(false);
  }

  const TableContent = ({ rows }: { rows: CrosswalkEntry[] }) => (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Source Requirement</TableHead>
          <TableHead className="w-6"></TableHead>
          <TableHead>Target Requirement</TableHead>
          <TableHead className="w-32">Relationship</TableHead>
          <TableHead className="w-48">Implementation Impact</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.length === 0 ? (
          <TableRow>
            <TableCell colSpan={5} className="text-center text-muted-foreground py-10">
              <GitCompare className="h-8 w-8 mx-auto mb-2 opacity-30" />
              No mappings match the current filters.
            </TableCell>
          </TableRow>
        ) : groupByDomain && domainGroups ? (
          Object.entries(domainGroups).sort(([a], [b]) => a.localeCompare(b)).flatMap(([domain, domainRows]) => [
            <TableRow key={`domain-${domain}`} className="bg-muted/30 hover:bg-muted/30">
              <TableCell colSpan={5} className="py-1.5 px-4">
                <div className="flex items-center gap-2">
                  <Layers className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="text-xs font-semibold text-muted-foreground">{domain}</span>
                  <span className="text-[10px] text-muted-foreground">({domainRows.length} mapping{domainRows.length !== 1 ? "s" : ""})</span>
                </div>
              </TableCell>
            </TableRow>,
            ...domainRows.map((cw) => (
              <TableRow
                key={cw.id}
                className="cursor-pointer hover:bg-muted/40 transition-colors"
                onClick={() => setSelectedEntry(cw)}
              >
                <MappingCells cw={cw} />
              </TableRow>
            )),
          ])
        ) : (
          rows.map((cw) => (
            <TableRow
              key={cw.id}
              className="cursor-pointer hover:bg-muted/40 transition-colors"
              onClick={() => setSelectedEntry(cw)}
            >
              <MappingCells cw={cw} />
            </TableRow>
          ))
        )}
      </TableBody>
    </Table>
  );

  const MappingCells = ({ cw }: { cw: CrosswalkEntry }) => {
    const impact = implementationImpact(cw.relationshipType);
    const hasIssue = cw.sourceStatus && cw.targetStatus && cw.sourceStatus !== cw.targetStatus;
    return (
      <>
        <TableCell>
          <div className="flex flex-col gap-0.5">
            <div className="flex items-center gap-1.5">
              <Badge variant="outline" className={cn("text-[9px] px-1 py-0 leading-4", frameworkColor(cw.sourceFramework))}>
                {cw.sourceFramework}
              </Badge>
              <span className="font-mono text-xs font-semibold">{cw.sourceKey}</span>
              {cw.sourceStatus && (
                <Badge variant="outline" className={cn("text-[9px] px-1 py-0 leading-4", statusColor(cw.sourceStatus))}>
                  {statusLabel(cw.sourceStatus)}
                </Badge>
              )}
            </div>
            {cw.sourceTitle && (
              <span className="text-xs text-muted-foreground line-clamp-1">{cw.sourceTitle}</span>
            )}
          </div>
        </TableCell>
        <TableCell>
          <ArrowRight className="h-3.5 w-3.5 text-muted-foreground/50" />
        </TableCell>
        <TableCell>
          <div className="flex flex-col gap-0.5">
            <div className="flex items-center gap-1.5">
              <Badge variant="outline" className={cn("text-[9px] px-1 py-0 leading-4", frameworkColor(cw.targetFramework))}>
                {cw.targetFramework}
              </Badge>
              <span className="font-mono text-xs font-semibold">{cw.targetKey}</span>
            </div>
            {cw.targetTitle && (
              <span className="text-xs text-muted-foreground line-clamp-1">{cw.targetTitle}</span>
            )}
          </div>
        </TableCell>
        <TableCell>
          <Badge variant="outline" className={cn("text-[10px]", relationshipColor(cw.relationshipType))}>
            {relationshipLabel(cw.relationshipType)}
          </Badge>
        </TableCell>
        <TableCell>
          <div className="flex items-center gap-1.5">
            <span className={cn("text-xs", impact.color)}>{impact.label}</span>
            {hasIssue && <AlertTriangle className="h-3 w-3 text-red-500 shrink-0" />}
          </div>
        </TableCell>
      </>
    );
  };

  return (
    <div className="space-y-5 max-w-[1400px] mx-auto">

      <div className="space-y-3">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Framework Crosswalk & Gap Analysis</h1>
            <p className="text-muted-foreground text-sm mt-0.5">
              Compare selected compliance packages, reuse implementation work, and identify additional requirements.
            </p>
          </div>
        </div>
        <ExplanationPanel />
      </div>

      {!fewPackages && (
        <Card className="border-border/60">
          <CardContent className="p-4">
            <div className="flex flex-wrap items-end gap-3">
              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Compare Package A</label>
                <Select value={pendingPkgAId} onValueChange={setPendingPkgAId}>
                  <SelectTrigger className="w-52">
                    <SelectValue placeholder="Select package A" />
                  </SelectTrigger>
                  <SelectContent>
                    {activePackages.map((p: any) => (
                      <SelectItem key={p.packageId} value={p.packageId}>{p.packageName}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <Button
                variant="ghost"
                size="sm"
                className="mb-0.5 h-9 px-2"
                onClick={handleSwap}
                title="Swap packages"
              >
                <ArrowLeftRight className="h-4 w-4 text-muted-foreground" />
              </Button>

              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">To Package B</label>
                <Select value={pendingPkgBId} onValueChange={setPendingPkgBId}>
                  <SelectTrigger className="w-52">
                    <SelectValue placeholder="Select package B" />
                  </SelectTrigger>
                  <SelectContent>
                    {activePackages.map((p: any) => (
                      <SelectItem key={p.packageId} value={p.packageId}>{p.packageName}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex gap-2 mb-0.5">
                <Button
                  size="sm"
                  className="h-9"
                  onClick={handleCompare}
                  disabled={!pendingPkgAId || !pendingPkgBId || pendingPkgAId === pendingPkgBId}
                >
                  <GitCompare className="h-4 w-4 mr-1.5" />
                  Compare
                </Button>
                <Button size="sm" variant="ghost" className="h-9" onClick={handleReset}>
                  Reset
                </Button>
              </div>

              {pendingPkgAId === pendingPkgBId && pendingPkgAId && (
                <p className="text-xs text-amber-600 mb-0.5">Select two different packages to compare.</p>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {fewPackages && !isLoading && (
        <Card className="border-blue-200 bg-blue-50/50 dark:border-blue-800 dark:bg-blue-950/20">
          <CardContent className="py-5 flex items-start gap-3">
            <GitCompare className="h-5 w-5 text-blue-600 mt-0.5 shrink-0" />
            <div>
              <p className="font-medium text-blue-900 dark:text-blue-200 text-sm">Multiple frameworks needed</p>
              <p className="text-sm text-blue-700 dark:text-blue-300 mt-0.5">
                The crosswalk shows requirement mappings between two or more frameworks. This organization currently
                has {activePackages.length === 0 ? "no packages" : "only one package"} selected.
                Assign at least two compliance packages to compare framework requirements.
              </p>
              <Link href="/settings/packages">
                <Button size="sm" variant="outline" className="mt-2 border-blue-300 text-blue-700 hover:bg-blue-100">
                  <LinkIcon className="h-3.5 w-3.5 mr-1.5" />
                  Manage Packages
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      )}

      {!fewPackages && !isLoading && pairFiltered.length === 0 && crosswalk.length > 0 && (
        <Card>
          <CardContent className="py-12 text-center">
            <GitCompare className="h-10 w-10 mx-auto mb-3 text-muted-foreground/40" />
            <p className="font-medium text-muted-foreground">No crosswalk mappings between these packages</p>
            <p className="text-sm text-muted-foreground mt-1 max-w-md mx-auto">
              No mapping data exists between the selected packages. Try selecting different packages or check that your organization has the appropriate packages assigned.
            </p>
          </CardContent>
        </Card>
      )}

      {!fewPackages && !isLoading && crosswalk.length === 0 && (
        <Card>
          <CardContent className="py-12 text-center">
            <GitCompare className="h-10 w-10 mx-auto mb-3 text-muted-foreground/40" />
            <p className="font-medium text-muted-foreground">No crosswalk data available</p>
            <p className="text-sm text-muted-foreground mt-1 max-w-md mx-auto">
              No crosswalk mappings exist between the currently assigned packages. Crosswalk data is available when two packages share overlapping requirements.
            </p>
          </CardContent>
        </Card>
      )}

      {!fewPackages && (isLoading || pairFiltered.length > 0) && (
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList>
            <TabsTrigger value="summary">Summary</TabsTrigger>
            <TabsTrigger value="mappings">
              Requirement Mappings
              {!isLoading && <span className="ml-1.5 text-[10px] bg-muted rounded px-1">{totalMappings}</span>}
            </TabsTrigger>
            <TabsTrigger value="gaps">
              Gaps & Changes
              {!isLoading && gapRows.length > 0 && (
                <span className="ml-1.5 text-[10px] bg-amber-100 text-amber-700 rounded px-1">{gapRows.length}</span>
              )}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="summary" className="mt-4 space-y-4">
            {isLoading ? (
              <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
                {[...Array(7)].map((_, i) => <div key={i} className="h-20 bg-muted animate-pulse rounded-lg" />)}
              </div>
            ) : (
              <>
                {isFullAlignment && (
                  <div className="flex items-start gap-3 p-4 rounded-xl border border-emerald-200 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-950/20">
                    <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0 mt-0.5" />
                    <div>
                      <p className="font-semibold text-emerald-800 dark:text-emerald-200">Full alignment detected</p>
                      <p className="text-sm text-emerald-700 dark:text-emerald-300 mt-1">
                        {pkgAInfo?.packageName ?? "Package A"} and {pkgBInfo?.packageName ?? "Package B"} share the same {totalMappings} security requirements.
                        Control HUB recommends maintaining one implementation record and reusing the same evidence, documents, SSP narrative,
                        monitoring records, and POA&M mappings across both packages.
                      </p>
                    </div>
                  </div>
                )}

                {consistencyIssues > 0 && (
                  <div className="flex items-start gap-3 p-4 rounded-xl border border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-950/20">
                    <AlertTriangle className="h-5 w-5 text-red-600 shrink-0 mt-0.5" />
                    <div>
                      <p className="font-semibold text-red-800 dark:text-red-200">Mapping Consistency Issues Detected</p>
                      <p className="text-sm text-red-700 dark:text-red-300 mt-1">
                        {consistencyIssues} equivalent requirement{consistencyIssues !== 1 ? "s" : ""} have different implementation statuses across packages.
                        Click on a mapping row to review the details and resolve discrepancies.
                      </p>
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
                  <MetricCard label="Total Mappings" value={totalMappings} />
                  <MetricCard label="Equivalent" value={equivalentMappings} color={equivalentMappings > 0 ? "text-emerald-700" : undefined} />
                  <MetricCard label="Direct Mapping" value={directMappings} color={directMappings > 0 ? "text-green-700" : undefined} />
                  <MetricCard label="Partial" value={partialMappings} color={partialMappings > 0 ? "text-amber-700" : undefined} />
                  <MetricCard label="Action Required" value={actionRequiredCount} color={actionRequiredCount > 0 ? "text-red-700" : "text-emerald-700"} />
                  <MetricCard label="Impl. Reuse" value={`${reusePercent}%`} sub="of mappings" color={reusePercent === 100 ? "text-emerald-700" : reusePercent > 80 ? "text-green-700" : "text-amber-700"} />
                  <MetricCard label="Consistency Issues" value={consistencyIssues} color={consistencyIssues > 0 ? "text-red-700" : "text-emerald-700"} />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <Card className="border-border/60">
                    <CardContent className="p-4 space-y-2">
                      <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Package A</p>
                      {pkgAInfo ? (
                        <>
                          <Badge variant="outline" className={cn("text-[10px]", frameworkColor((pkgAInfo as any).frameworkShortName))}>
                            {(pkgAInfo as any).frameworkShortName}
                          </Badge>
                          <p className="font-semibold">{(pkgAInfo as any).packageName}</p>
                        </>
                      ) : <p className="text-sm text-muted-foreground">—</p>}
                    </CardContent>
                  </Card>
                  <Card className="border-border/60">
                    <CardContent className="p-4 space-y-2">
                      <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Package B</p>
                      {pkgBInfo ? (
                        <>
                          <Badge variant="outline" className={cn("text-[10px]", frameworkColor((pkgBInfo as any).frameworkShortName))}>
                            {(pkgBInfo as any).frameworkShortName}
                          </Badge>
                          <p className="font-semibold">{(pkgBInfo as any).packageName}</p>
                        </>
                      ) : <p className="text-sm text-muted-foreground">—</p>}
                    </CardContent>
                  </Card>
                </div>

                <div className="rounded-lg border border-border/60 p-4 bg-muted/20">
                  <p className="text-xs font-semibold mb-2">Evidence & Document Reuse Summary</p>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div className="text-center">
                      <p className={cn("text-xl font-bold", reusePercent === 100 ? "text-emerald-700" : "text-amber-700")}>{reusePercent}%</p>
                      <p className="text-[10px] text-muted-foreground">Implementation Reuse</p>
                    </div>
                    <div className="text-center">
                      <p className={cn("text-xl font-bold", reusePercent === 100 ? "text-emerald-700" : "text-amber-700")}>{reusePercent}%</p>
                      <p className="text-[10px] text-muted-foreground">Evidence Reuse Potential</p>
                    </div>
                    <div className="text-center">
                      <p className={cn("text-xl font-bold", actionRequiredCount === 0 ? "text-emerald-700" : "text-amber-700")}>{actionRequiredCount}</p>
                      <p className="text-[10px] text-muted-foreground">Requirements Needing Work</p>
                    </div>
                    <div className="text-center">
                      <p className={cn("text-xl font-bold", consistencyIssues === 0 ? "text-emerald-700" : "text-red-700")}>{consistencyIssues}</p>
                      <p className="text-[10px] text-muted-foreground">Status Mismatches</p>
                    </div>
                  </div>
                </div>
              </>
            )}
          </TabsContent>

          <TabsContent value="mappings" className="mt-4">
            <Card className="border-border/60">
              <CardContent className="pt-4 pb-0">
                <div className="flex flex-wrap gap-2 items-center mb-3">
                  <Input
                    placeholder="Search requirement ID or title..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="w-60 shrink-0 h-8 text-sm"
                  />
                  <Select value={quickFilter} onValueChange={setQuickFilter}>
                    <SelectTrigger className="w-44 h-8">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Show All</SelectItem>
                      <SelectItem value="equivalent">Equivalent / No Work</SelectItem>
                      <SelectItem value="action_required">Action Required</SelectItem>
                      <SelectItem value="gaps">Gaps Only</SelectItem>
                      <SelectItem value="consistency">Consistency Issues</SelectItem>
                    </SelectContent>
                  </Select>
                  <Button
                    variant={groupByDomain ? "default" : "outline"}
                    size="sm"
                    className="h-8 gap-1.5 text-xs"
                    onClick={() => setGroupByDomain(!groupByDomain)}
                  >
                    <Layers className="h-3.5 w-3.5" />
                    Group by Domain
                  </Button>
                  {(search || quickFilter !== "all") && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 gap-1.5 text-muted-foreground"
                      onClick={() => { setSearch(""); setQuickFilter("all"); }}
                    >
                      <X className="h-3.5 w-3.5" />
                      Clear
                    </Button>
                  )}
                  <span className="ml-auto text-xs text-muted-foreground shrink-0">
                    {filtered.length} of {totalMappings} mapping{totalMappings !== 1 ? "s" : ""}
                  </span>
                </div>
              </CardContent>
              <CardContent className="pt-2">
                {isLoading ? (
                  <div className="space-y-2">
                    {[...Array(8)].map((_, i) => <div key={i} className="h-10 animate-pulse bg-muted rounded" />)}
                  </div>
                ) : (
                  <TableContent rows={filtered} />
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="gaps" className="mt-4">
            <Card className="border-border/60">
              <CardContent className="pt-4">
                {isLoading ? (
                  <div className="space-y-2">
                    {[...Array(4)].map((_, i) => <div key={i} className="h-10 animate-pulse bg-muted rounded" />)}
                  </div>
                ) : gapRows.length === 0 ? (
                  <div className="py-16 text-center">
                    <CheckCircle2 className="h-12 w-12 mx-auto mb-3 text-emerald-500/60" />
                    <p className="font-semibold text-muted-foreground">All mappings equivalent — no gaps detected</p>
                    <p className="text-sm text-muted-foreground mt-1 max-w-md mx-auto">
                      Every requirement in Package A maps directly and equivalently to a requirement in Package B.
                      No additional implementation work is required for this package combination.
                    </p>
                  </div>
                ) : (
                  <>
                    <div className="flex items-center gap-2 mb-3 p-3 rounded-lg bg-amber-50 border border-amber-200 dark:bg-amber-950/20 dark:border-amber-800">
                      <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0" />
                      <p className="text-sm text-amber-800 dark:text-amber-300">
                        {gapRows.length} requirement{gapRows.length !== 1 ? "s" : ""} require additional work or review. Click a row for details.
                      </p>
                    </div>
                    <TableContent rows={gapRows} />
                  </>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      )}

      <DetailDrawer entry={selectedEntry} onClose={() => setSelectedEntry(null)} />
    </div>
  );
}
