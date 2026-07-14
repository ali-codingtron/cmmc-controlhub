import { useState, useMemo } from "react";
import { useOrg } from "@/context/OrgContext";
import { useListOrgPackages } from "@workspace/api-client-react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
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
import { ChevronRight, FileText, Link as LinkIcon, AlertCircle, X } from "lucide-react";
import { Link } from "wouter";
import { cn } from "@/lib/utils";

interface DfarsObligation {
  id: string;
  packageId: string;
  packageName: string;
  clauseNumber: string;
  obligationTitle: string;
  obligationDescription: string | null;
  requiredArtifacts: string[];
  requiredProcess: string | null;
  applicableTo: string | null;
  flowdownRequired: boolean;
  incidentReportingRequired: boolean;
  assessmentRequired: boolean;
  sortOrder: number;
}

function clauseColor(clause: string): string {
  if (clause.includes("7012")) return "bg-amber-50 text-amber-700 border-amber-200";
  if (clause.includes("7019")) return "bg-blue-50 text-blue-700 border-blue-200";
  if (clause.includes("7020")) return "bg-purple-50 text-purple-700 border-purple-200";
  if (clause.includes("7021")) return "bg-green-50 text-green-700 border-green-200";
  return "bg-slate-50 text-slate-600 border-slate-200";
}

function FlagBadge({ active, label }: { active: boolean; label: string }) {
  if (!active) return null;
  return (
    <Badge variant="outline" className="text-[10px] px-1.5 py-0 bg-red-50 text-red-700 border-red-200">
      {label}
    </Badge>
  );
}

function ObligationRow({ obligation }: { obligation: DfarsObligation }) {
  const [open, setOpen] = useState(false);

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger asChild>
        <TableRow className="cursor-pointer hover:bg-muted/30 transition-colors">
          <TableCell className="font-mono text-xs">
            <Badge variant="outline" className={cn("text-[11px]", clauseColor(obligation.clauseNumber))}>
              {obligation.clauseNumber}
            </Badge>
          </TableCell>
          <TableCell>
            <div className="flex items-center gap-2">
              <ChevronRight className={cn("h-3.5 w-3.5 text-muted-foreground shrink-0 transition-transform", open && "rotate-90")} />
              <span className="font-medium text-sm">{obligation.obligationTitle}</span>
            </div>
          </TableCell>
          <TableCell className="text-xs text-muted-foreground max-w-xs">
            <span className="line-clamp-2">{obligation.obligationDescription}</span>
          </TableCell>
          <TableCell>
            <div className="flex flex-wrap gap-1">
              <FlagBadge active={obligation.flowdownRequired} label="Flowdown" />
              <FlagBadge active={obligation.incidentReportingRequired} label="72h Reporting" />
              <FlagBadge active={obligation.assessmentRequired} label="Assessment" />
            </div>
          </TableCell>
          <TableCell className="text-xs text-muted-foreground">
            {obligation.requiredArtifacts.length > 0 ? (
              <span>{obligation.requiredArtifacts.length} artifact{obligation.requiredArtifacts.length !== 1 ? "s" : ""}</span>
            ) : (
              <span className="text-muted-foreground/50">—</span>
            )}
          </TableCell>
        </TableRow>
      </CollapsibleTrigger>
      <CollapsibleContent asChild>
        <TableRow className="bg-muted/20">
          <TableCell colSpan={5} className="py-4 px-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
              {obligation.obligationDescription && (
                <div>
                  <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Description</div>
                  <p className="text-sm leading-relaxed">{obligation.obligationDescription}</p>
                </div>
              )}
              {obligation.requiredProcess && (
                <div>
                  <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Required Process</div>
                  <p className="text-sm leading-relaxed text-muted-foreground">{obligation.requiredProcess}</p>
                </div>
              )}
              {obligation.applicableTo && (
                <div>
                  <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Applies To</div>
                  <p className="text-sm text-muted-foreground">{obligation.applicableTo}</p>
                </div>
              )}
              {obligation.requiredArtifacts.length > 0 && (
                <div>
                  <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Required Artifacts</div>
                  <ul className="space-y-1">
                    {obligation.requiredArtifacts.map((artifact, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm text-muted-foreground">
                        <FileText className="h-3.5 w-3.5 mt-0.5 shrink-0 text-muted-foreground/50" />
                        {artifact}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </TableCell>
        </TableRow>
      </CollapsibleContent>
    </Collapsible>
  );
}

export default function DfarsObligations() {
  const { activeOrg } = useOrg();
  const [clauseFilter, setClauseFilter] = useState("all");
  const [search, setSearch] = useState("");

  const { data: orgPackages = [] } = useListOrgPackages(activeOrg?.id ?? "", {
    query: { enabled: !!activeOrg?.id } as any,
  });

  const activePackages = (orgPackages as any[]).filter((p) => p.isActive);
  const dfarsPackages = activePackages.filter((p) => p.frameworkShortName === "DFARS");

  const { data: obligations = [], isLoading } = useQuery<DfarsObligation[]>({
    queryKey: ["/api/dfars-obligations", activeOrg?.id],
    queryFn: async () => {
      const token = localStorage.getItem("auth_token");
      const res = await fetch("/api/dfars-obligations", {
        headers: {
          Authorization: `Bearer ${token}`,
          "X-Organization-ID": activeOrg?.id ?? "",
        },
      });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!activeOrg?.id,
    staleTime: 60000,
  });

  const clauses = useMemo(() => {
    const unique = new Set(obligations.map((o) => o.clauseNumber));
    return Array.from(unique).sort();
  }, [obligations]);

  const filtered = useMemo(() => {
    return obligations.filter((o) => {
      if (clauseFilter !== "all" && o.clauseNumber !== clauseFilter) return false;
      if (search) {
        const q = search.toLowerCase();
        if (
          !o.obligationTitle.toLowerCase().includes(q) &&
          !o.clauseNumber.toLowerCase().includes(q) &&
          !(o.obligationDescription?.toLowerCase().includes(q))
        ) {
          return false;
        }
      }
      return true;
    });
  }, [obligations, clauseFilter, search]);

  const hasActiveFilters = clauseFilter !== "all" || search !== "";

  if (!activeOrg) {
    return (
      <div className="space-y-4">
        <h1 className="text-3xl font-bold">DFARS Contract Obligations</h1>
        <p className="text-muted-foreground">Select an organization to view DFARS obligations.</p>
      </div>
    );
  }

  if (!isLoading && dfarsPackages.length === 0) {
    return (
      <div className="space-y-6">
        <h1 className="text-3xl font-bold">DFARS Contract Obligations</h1>
        <Card>
          <CardContent className="py-16 text-center">
            <AlertCircle className="h-12 w-12 mx-auto mb-3 text-muted-foreground/40" />
            <p className="font-medium text-muted-foreground">No DFARS packages assigned</p>
            <p className="text-sm text-muted-foreground mt-1 max-w-sm mx-auto">
              This organization doesn't have any DFARS contract clause packages selected.
              Add a DFARS package in Settings → Compliance Packages to track contract obligations.
            </p>
            <Link href="/settings/packages">
              <Button className="mt-4" variant="outline">
                <LinkIcon className="h-4 w-4 mr-1.5" />
                Manage Packages
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">DFARS Contract Obligations</h1>
          <p className="text-muted-foreground mt-1">
            Contract compliance obligations from DFARS clauses assigned to{" "}
            <span className="font-medium text-foreground">{activeOrg.name}</span>.
          </p>
        </div>
      </div>

      {dfarsPackages.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {dfarsPackages.map((pkg: any) => (
            <Badge key={pkg.packageId} variant="outline" className="bg-amber-50 text-amber-700 border-amber-200">
              {pkg.packageName}
            </Badge>
          ))}
        </div>
      )}

      <Card>
        <CardContent className="pt-4 pb-0">
          <div className="flex flex-wrap gap-3 items-center">
            <Input
              placeholder="Search obligations..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-56 shrink-0"
            />
            <Select value={clauseFilter} onValueChange={setClauseFilter}>
              <SelectTrigger className="w-52">
                <SelectValue placeholder="All Clauses" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Clauses</SelectItem>
                {clauses.map((clause) => (
                  <SelectItem key={clause} value={clause}>{clause}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {hasActiveFilters && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => { setClauseFilter("all"); setSearch(""); }}
                className="gap-1.5 text-muted-foreground"
              >
                <X className="h-3.5 w-3.5" />
                Clear filters
              </Button>
            )}
            <span className="ml-auto text-xs text-muted-foreground shrink-0">
              {isLoading ? "Loading..." : `${filtered.length} obligation${filtered.length !== 1 ? "s" : ""}`}
            </span>
          </div>
        </CardContent>

        <CardContent className="pt-4">
          {isLoading ? (
            <div className="space-y-2">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="h-12 animate-pulse bg-muted rounded" />
              ))}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-36">Clause</TableHead>
                  <TableHead>Obligation Area</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead className="w-48">Flags</TableHead>
                  <TableHead className="w-28">Artifacts</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-muted-foreground py-10">
                      No obligations match the current filters.
                    </TableCell>
                  </TableRow>
                ) : (
                  filtered.map((obligation) => (
                    <ObligationRow key={obligation.id} obligation={obligation} />
                  ))
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <div className="rounded-lg border border-border/60 bg-muted/20 p-4 text-sm text-muted-foreground">
        <p className="font-medium text-foreground mb-1">About DFARS obligations</p>
        <p>
          DFARS clauses impose specific compliance obligations on DoD contractors. The obligations above are
          derived from the DFARS packages assigned to this organization. Flowdown obligations must be included
          in subcontractor agreements. 72-hour incident reporting applies to cyber incidents affecting covered
          defense information (CDI).
        </p>
      </div>
    </div>
  );
}
