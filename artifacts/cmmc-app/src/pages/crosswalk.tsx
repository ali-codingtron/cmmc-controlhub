import { useState, useMemo } from "react";
import { useOrg } from "@/context/OrgContext";
import { useListOrgPackages } from "@workspace/api-client-react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import { GitCompare, Link as LinkIcon, ArrowRight, X } from "lucide-react";
import { Link } from "wouter";
import { cn } from "@/lib/utils";

interface CrosswalkEntry {
  id: string;
  sourceKey: string;
  sourceTitle: string;
  sourcePackageName: string;
  sourceFramework: string;
  targetKey: string;
  targetTitle: string;
  targetPackageName: string;
  targetFramework: string;
  relationshipType: string;
  notes: string | null;
}

function relationshipLabel(type: string): string {
  switch (type) {
    case "equivalent": return "Equivalent";
    case "subset": return "Subset";
    case "superset": return "Superset";
    case "related": return "Related";
    case "partial_overlap": return "Partial Overlap";
    default: return type;
  }
}

function relationshipColor(type: string): string {
  switch (type) {
    case "equivalent": return "bg-green-50 text-green-700 border-green-200";
    case "subset": return "bg-blue-50 text-blue-700 border-blue-200";
    case "superset": return "bg-purple-50 text-purple-700 border-purple-200";
    case "related": return "bg-slate-50 text-slate-600 border-slate-200";
    case "partial_overlap": return "bg-amber-50 text-amber-700 border-amber-200";
    default: return "bg-slate-50 text-slate-600 border-slate-200";
  }
}

function frameworkColor(fw: string): string {
  if (fw === "CMMC") return "bg-purple-50 text-purple-700 border-purple-200";
  if (fw?.startsWith("NIST")) return "bg-blue-50 text-blue-700 border-blue-200";
  if (fw === "DFARS") return "bg-amber-50 text-amber-700 border-amber-200";
  if (fw === "FAR") return "bg-slate-50 text-slate-600 border-slate-200";
  return "bg-slate-50 text-slate-600 border-slate-200";
}

export default function Crosswalk() {
  const { activeOrg } = useOrg();
  const [search, setSearch] = useState("");
  const [sourceFilter, setSourceFilter] = useState("all");
  const [targetFilter, setTargetFilter] = useState("all");
  const [relationshipFilter, setRelationshipFilter] = useState("all");

  const { data: orgPackages = [] } = useListOrgPackages(activeOrg?.id ?? "", {
    query: { enabled: !!activeOrg?.id } as any,
  });
  const activePackages = (orgPackages as any[]).filter((p) => p.isActive);

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

  const sourceFrameworks = useMemo(() => {
    const unique = new Set(crosswalk.map((c) => c.sourceFramework));
    return Array.from(unique).sort();
  }, [crosswalk]);

  const targetFrameworks = useMemo(() => {
    const unique = new Set(crosswalk.map((c) => c.targetFramework));
    return Array.from(unique).sort();
  }, [crosswalk]);

  const relationshipTypes = useMemo(() => {
    const unique = new Set(crosswalk.map((c) => c.relationshipType));
    return Array.from(unique).sort();
  }, [crosswalk]);

  const filtered = useMemo(() => {
    return crosswalk.filter((c) => {
      if (sourceFilter !== "all" && c.sourceFramework !== sourceFilter) return false;
      if (targetFilter !== "all" && c.targetFramework !== targetFilter) return false;
      if (relationshipFilter !== "all" && c.relationshipType !== relationshipFilter) return false;
      if (search) {
        const q = search.toLowerCase();
        if (
          !c.sourceKey.toLowerCase().includes(q) &&
          !c.targetKey.toLowerCase().includes(q) &&
          !c.sourceTitle.toLowerCase().includes(q) &&
          !c.targetTitle.toLowerCase().includes(q)
        ) {
          return false;
        }
      }
      return true;
    });
  }, [crosswalk, sourceFilter, targetFilter, relationshipFilter, search]);

  const hasActiveFilters =
    search !== "" ||
    sourceFilter !== "all" ||
    targetFilter !== "all" ||
    relationshipFilter !== "all";

  if (!activeOrg) {
    return (
      <div className="space-y-4">
        <h1 className="text-3xl font-bold">Framework Crosswalk</h1>
        <p className="text-muted-foreground">Select an organization to view the framework crosswalk.</p>
      </div>
    );
  }

  const noData = !isLoading && crosswalk.length === 0;
  const fewPackages = activePackages.length < 2;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">Framework Crosswalk</h1>
          <p className="text-muted-foreground mt-1">
            Requirement mappings between frameworks assigned to{" "}
            <span className="font-medium text-foreground">{activeOrg.name}</span>.
          </p>
        </div>
      </div>

      {activePackages.length > 0 && (
        <div className="flex flex-wrap gap-2 items-center">
          <span className="text-xs text-muted-foreground">Active packages:</span>
          {activePackages.map((pkg: any) => (
            <Badge
              key={pkg.packageId}
              variant="outline"
              className={cn("text-[11px]", frameworkColor(pkg.frameworkShortName))}
            >
              {pkg.packageName}
            </Badge>
          ))}
        </div>
      )}

      {fewPackages && !isLoading && (
        <Card className="border-blue-200 bg-blue-50/50">
          <CardContent className="py-5 flex items-start gap-3">
            <GitCompare className="h-5 w-5 text-blue-600 mt-0.5 shrink-0" />
            <div>
              <p className="font-medium text-blue-900 text-sm">Multiple frameworks needed</p>
              <p className="text-sm text-blue-700 mt-0.5">
                The crosswalk shows requirement mappings between two or more frameworks. This organization currently
                has {activePackages.length === 0 ? "no packages" : "only one package"} selected.
                Add a second compliance package to see crosswalk data.
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

      {!fewPackages && noData && (
        <Card>
          <CardContent className="py-16 text-center">
            <GitCompare className="h-12 w-12 mx-auto mb-3 text-muted-foreground/40" />
            <p className="font-medium text-muted-foreground">No crosswalk data available</p>
            <p className="text-sm text-muted-foreground mt-1 max-w-md mx-auto">
              Requirement crosswalk mappings between frameworks will appear here once the requirement
              data has been loaded. CMMC L2 ↔ NIST 800-171 Rev. 2 mappings (110 pairs) and
              NIST Rev. 2 ↔ Rev. 3 crosswalk data are included in upcoming data releases.
            </p>
          </CardContent>
        </Card>
      )}

      {!fewPackages && !noData && (
        <Card>
          <CardContent className="pt-4 pb-0">
            <div className="flex flex-wrap gap-3 items-center">
              <Input
                placeholder="Search by requirement ID or title..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-64 shrink-0"
              />
              <Select value={sourceFilter} onValueChange={setSourceFilter}>
                <SelectTrigger className="w-44">
                  <SelectValue placeholder="Source Framework" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Sources</SelectItem>
                  {sourceFrameworks.map((fw) => (
                    <SelectItem key={fw} value={fw}>{fw}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={targetFilter} onValueChange={setTargetFilter}>
                <SelectTrigger className="w-44">
                  <SelectValue placeholder="Target Framework" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Targets</SelectItem>
                  {targetFrameworks.map((fw) => (
                    <SelectItem key={fw} value={fw}>{fw}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={relationshipFilter} onValueChange={setRelationshipFilter}>
                <SelectTrigger className="w-40">
                  <SelectValue placeholder="Relationship" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Relationships</SelectItem>
                  {relationshipTypes.map((rt) => (
                    <SelectItem key={rt} value={rt}>{relationshipLabel(rt)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {hasActiveFilters && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setSearch("");
                    setSourceFilter("all");
                    setTargetFilter("all");
                    setRelationshipFilter("all");
                  }}
                  className="gap-1.5 text-muted-foreground"
                >
                  <X className="h-3.5 w-3.5" />
                  Clear
                </Button>
              )}
              <span className="ml-auto text-xs text-muted-foreground shrink-0">
                {isLoading ? "Loading..." : `${filtered.length} mapping${filtered.length !== 1 ? "s" : ""}`}
              </span>
            </div>
          </CardContent>

          <CardContent className="pt-4">
            {isLoading ? (
              <div className="space-y-2">
                {[...Array(6)].map((_, i) => (
                  <div key={i} className="h-10 animate-pulse bg-muted rounded" />
                ))}
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Source Requirement</TableHead>
                    <TableHead className="w-8"></TableHead>
                    <TableHead>Target Requirement</TableHead>
                    <TableHead className="w-36">Relationship</TableHead>
                    <TableHead>Notes</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center text-muted-foreground py-10">
                        No crosswalk mappings match the current filters.
                      </TableCell>
                    </TableRow>
                  ) : (
                    filtered.map((cw) => (
                      <TableRow key={cw.id}>
                        <TableCell>
                          <div className="flex flex-col gap-0.5">
                            <div className="flex items-center gap-1.5">
                              <Badge variant="outline" className={cn("text-[10px] px-1.5 py-0", frameworkColor(cw.sourceFramework))}>
                                {cw.sourceFramework}
                              </Badge>
                              <span className="font-mono text-xs font-medium">{cw.sourceKey}</span>
                            </div>
                            {cw.sourceTitle && (
                              <span className="text-xs text-muted-foreground line-clamp-1">{cw.sourceTitle}</span>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <ArrowRight className="h-4 w-4 text-muted-foreground/50" />
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-col gap-0.5">
                            <div className="flex items-center gap-1.5">
                              <Badge variant="outline" className={cn("text-[10px] px-1.5 py-0", frameworkColor(cw.targetFramework))}>
                                {cw.targetFramework}
                              </Badge>
                              <span className="font-mono text-xs font-medium">{cw.targetKey}</span>
                            </div>
                            {cw.targetTitle && (
                              <span className="text-xs text-muted-foreground line-clamp-1">{cw.targetTitle}</span>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className={cn("text-[11px]", relationshipColor(cw.relationshipType))}>
                            {relationshipLabel(cw.relationshipType)}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground max-w-xs">
                          <span className="line-clamp-2">{cw.notes ?? "—"}</span>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      )}

      <div className="rounded-lg border border-border/60 bg-muted/20 p-4 text-sm text-muted-foreground">
        <p className="font-medium text-foreground mb-1">About the framework crosswalk</p>
        <p>
          The crosswalk maps requirements between frameworks to identify overlaps, equivalencies, and gaps.
          CMMC L2 and NIST SP 800-171 share the same 110 controls — organizations with both packages benefit
          from a single implementation effort. Relationship types: <strong>Equivalent</strong> (controls map
          1:1), <strong>Subset/Superset</strong> (one framework is more detailed), <strong>Related</strong>
          (thematically linked but not identical).
        </p>
      </div>
    </div>
  );
}
