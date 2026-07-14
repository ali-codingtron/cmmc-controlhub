import { useState, useMemo } from "react";
import { useListControls, useListOrgPackages } from "@workspace/api-client-react";
import { useOrg } from "@/context/OrgContext";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { StatusBadge, LevelBadge } from "@/components/ui/badges";
import { Link } from "wouter";
import { X, Info } from "lucide-react";
import { cn } from "@/lib/utils";

const L1_PACKAGE_KEYS = new Set(["CMMC_L1_SELF", "FAR_52_204_21", "CMMC_L2_SELF", "NIST_800_171_R2", "NIST_800_171_R3", "NIST_800_171A_R2", "NIST_800_171A_R3"]);
const L2_ONLY_PACKAGE_KEYS = new Set(["CMMC_L2_SELF", "NIST_800_171_R2", "NIST_800_171_R3", "NIST_800_171A_R2", "NIST_800_171A_R3"]);

const DOMAINS = [
  { code: "AC", label: "AC - Access Control" },
  { code: "AT", label: "AT - Awareness and Training" },
  { code: "AU", label: "AU - Audit and Accountability" },
  { code: "CM", label: "CM - Configuration Management" },
  { code: "IA", label: "IA - Identification and Authentication" },
  { code: "IR", label: "IR - Incident Response" },
  { code: "MA", label: "MA - Maintenance" },
  { code: "MP", label: "MP - Media Protection" },
  { code: "PE", label: "PE - Physical Protection" },
  { code: "PS", label: "PS - Personnel Security" },
  { code: "RA", label: "RA - Risk Assessment" },
  { code: "CA", label: "CA - Security Assessment" },
  { code: "SC", label: "SC - System and Communications Protection" },
  { code: "SI", label: "SI - System and Information Integrity" },
];

type EvidenceCoverage = "all" | "none" | "partial" | "complete";

function packageKeyToLevelFilter(key: string): "L1" | undefined | "dfars_notice" {
  if (key === "CMMC_L1_SELF" || key === "FAR_52_204_21") return "L1";
  if (key?.startsWith("DFARS_")) return "dfars_notice";
  return undefined;
}

export default function Controls() {
  const { activeOrg } = useOrg();
  const [search, setSearch] = useState("");
  const [domainFilter, setDomainFilter] = useState("all");
  const [levelFilter, setLevelFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [evidenceFilter, setEvidenceFilter] = useState<EvidenceCoverage>("all");
  const [packageFilter, setPackageFilter] = useState("all");

  const { data: controls, isLoading } = useListControls(
    packageFilter !== "all" ? ({ packageId: packageFilter } as any) : {},
    { query: { enabled: !!activeOrg?.id } as any }
  );

  const { data: orgPackages = [] } = useListOrgPackages(activeOrg?.id ?? "", {
    query: { enabled: !!activeOrg?.id } as any,
  });
  const activePackages = (orgPackages as any[]).filter((p) => p.isActive);
  const hasPackages = activePackages.length > 0;

  const selectedPackage = activePackages.find((p: any) => p.packageId === packageFilter);
  const pkgDerivedLevel = selectedPackage
    ? packageKeyToLevelFilter(selectedPackage.packageKey)
    : undefined;
  const isDfarsSelected = pkgDerivedLevel === "dfars_notice";

  const filtered = useMemo(() => {
    if (!controls) return [];
    return controls.filter((c) => {
      if (search) {
        const q = search.toLowerCase();
        const matches =
          c.controlId?.toLowerCase().includes(q) ||
          c.title?.toLowerCase().includes(q) ||
          (c as any).description?.toLowerCase().includes(q) ||
          c.domainName?.toLowerCase().includes(q);
        if (!matches) return false;
      }
      if (domainFilter !== "all") {
        const code = c.controlId?.split(".")[0] ?? "";
        if (code !== domainFilter) return false;
      }
      // Package-level filtering is now server-side (via packageId query param); only apply explicit level filter here
      const effectiveLevel = levelFilter !== "all" ? levelFilter : undefined;
      if (effectiveLevel) {
        if (c.level !== effectiveLevel) return false;
      }
      if (statusFilter !== "all") {
        const st = c.status ?? "not_started";
        if (st !== statusFilter) return false;
      }
      if (evidenceFilter !== "all") {
        const total = c.evidenceCount ?? 0;
        const approved = c.approvedEvidenceCount ?? 0;
        if (evidenceFilter === "none" && total !== 0) return false;
        if (evidenceFilter === "partial" && !(total > 0 && approved < total)) return false;
        if (evidenceFilter === "complete" && !(total > 0 && approved >= total)) return false;
      }
      return true;
    });
  }, [controls, search, domainFilter, levelFilter, statusFilter, evidenceFilter, pkgDerivedLevel, isDfarsSelected]);

  const hasActiveFilters =
    search !== "" ||
    domainFilter !== "all" ||
    levelFilter !== "all" ||
    statusFilter !== "all" ||
    evidenceFilter !== "all" ||
    packageFilter !== "all";

  function clearFilters() {
    setSearch("");
    setDomainFilter("all");
    setLevelFilter("all");
    setStatusFilter("all");
    setEvidenceFilter("all");
    setPackageFilter("all");
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">Controls & Requirements Library</h1>
          {hasPackages && (
            <div className="flex flex-wrap gap-1.5 mt-2">
              {activePackages.map((pkg: any) => (
                <Badge
                  key={pkg.packageId}
                  variant="outline"
                  className={cn(
                    "text-[10px] px-1.5 py-0",
                    pkg.frameworkShortName === "CMMC"
                      ? "bg-purple-50 text-purple-700 border-purple-200"
                      : pkg.frameworkShortName?.startsWith("NIST")
                      ? "bg-blue-50 text-blue-700 border-blue-200"
                      : pkg.frameworkShortName === "DFARS"
                      ? "bg-amber-50 text-amber-700 border-amber-200"
                      : pkg.frameworkShortName === "FAR"
                      ? "bg-slate-50 text-slate-600 border-slate-200"
                      : "bg-slate-100 text-slate-600 border-slate-200"
                  )}
                >
                  {pkg.packageName}
                </Badge>
              ))}
            </div>
          )}
        </div>
      </div>

      {isDfarsSelected && (
        <div className="rounded-lg border border-amber-200 bg-amber-50/60 p-3 flex items-start gap-2.5 text-sm">
          <Info className="h-4 w-4 text-amber-700 mt-0.5 shrink-0" />
          <div>
            <span className="font-medium text-amber-900">DFARS packages don't map to CMMC controls. </span>
            <span className="text-amber-700">
              DFARS obligations are tracked on the{" "}
              <Link href="/dfars-obligations" className="underline hover:no-underline">
                DFARS Contract Obligations
              </Link>{" "}
              page. Showing all controls below.
            </span>
          </div>
        </div>
      )}

      <Card>
        <CardContent className="pt-4 pb-0">
          <div className="flex flex-wrap gap-3 items-center">
            <Input
              placeholder="Search controls..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-48 shrink-0"
            />

            {hasPackages && (
              <Select value={packageFilter} onValueChange={setPackageFilter}>
                <SelectTrigger className="w-56">
                  <SelectValue placeholder="All packages" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All packages</SelectItem>
                  {activePackages.map((pkg: any) => (
                    <SelectItem key={pkg.packageId} value={pkg.packageId}>
                      {pkg.packageName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}

            <Select value={domainFilter} onValueChange={setDomainFilter}>
              <SelectTrigger className="w-52">
                <SelectValue placeholder="All Domains" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Domains</SelectItem>
                {DOMAINS.map((d) => (
                  <SelectItem key={d.code} value={d.code}>{d.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={levelFilter} onValueChange={setLevelFilter}>
              <SelectTrigger className="w-32">
                <SelectValue placeholder="All Levels" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Levels</SelectItem>
                <SelectItem value="L1">L1</SelectItem>
                <SelectItem value="L2">L2</SelectItem>
              </SelectContent>
            </Select>

            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-40">
                <SelectValue placeholder="All Statuses" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                <SelectItem value="not_started">Not Started</SelectItem>
                <SelectItem value="in_progress">In Progress</SelectItem>
                <SelectItem value="implemented">Implemented</SelectItem>
              </SelectContent>
            </Select>

            <Select value={evidenceFilter} onValueChange={(v) => setEvidenceFilter(v as EvidenceCoverage)}>
              <SelectTrigger className="w-44">
                <SelectValue placeholder="All Evidence" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Evidence</SelectItem>
                <SelectItem value="none">No Evidence</SelectItem>
                <SelectItem value="partial">Partial Evidence</SelectItem>
                <SelectItem value="complete">Complete Evidence</SelectItem>
              </SelectContent>
            </Select>

            {hasActiveFilters && (
              <Button variant="ghost" size="sm" onClick={clearFilters} className="gap-1.5 text-muted-foreground">
                <X className="h-3.5 w-3.5" />
                Clear filters
              </Button>
            )}

            <span className="ml-auto text-xs text-muted-foreground shrink-0">
              {isLoading ? "Loading..." : `${filtered.length} control${filtered.length !== 1 ? "s" : ""}`}
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
                  <TableHead className="w-28">Control ID</TableHead>
                  <TableHead>Title</TableHead>
                  <TableHead className="w-32">Domain</TableHead>
                  <TableHead className="w-16">Level</TableHead>
                  <TableHead className="w-36">Status</TableHead>
                  <TableHead className="w-24">Evidence</TableHead>
                  {hasPackages && <TableHead className="w-40">Packages</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={hasPackages ? 7 : 6} className="text-center text-muted-foreground py-10">
                      No controls match the current filters.
                    </TableCell>
                  </TableRow>
                ) : (
                  filtered.map((control) => {
                    const applicablePkgs = hasPackages
                      ? activePackages.filter((p: any) => {
                          const key: string = p.packageKey ?? "";
                          if (control.level === "L1") return L1_PACKAGE_KEYS.has(key);
                          return L2_ONLY_PACKAGE_KEYS.has(key);
                        })
                      : [];
                    return (
                      <TableRow key={control.id}>
                        <TableCell className="font-medium">
                          <Link href={`/controls/${control.id}`} className="text-primary hover:underline">
                            {control.controlId}
                          </Link>
                        </TableCell>
                        <TableCell>{control.title}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{control.domainName}</TableCell>
                        <TableCell><LevelBadge level={control.level} /></TableCell>
                        <TableCell><StatusBadge status={control.status} /></TableCell>
                        <TableCell className="text-xs">{control.approvedEvidenceCount} / {control.evidenceCount}</TableCell>
                        {hasPackages && (
                          <TableCell>
                            <div className="flex flex-wrap gap-1">
                              {applicablePkgs.slice(0, 2).map((p: any) => (
                                <Badge
                                  key={p.packageId}
                                  variant="outline"
                                  className={cn(
                                    "text-[9px] px-1 py-0",
                                    p.frameworkShortName === "CMMC"
                                      ? "bg-purple-50 text-purple-700 border-purple-200"
                                      : p.frameworkShortName?.startsWith("NIST")
                                      ? "bg-blue-50 text-blue-700 border-blue-200"
                                      : p.frameworkShortName === "FAR"
                                      ? "bg-slate-50 text-slate-600 border-slate-200"
                                      : "bg-slate-100 text-slate-600 border-slate-200"
                                  )}
                                >
                                  {p.frameworkShortName}
                                </Badge>
                              ))}
                              {applicablePkgs.length > 2 && (
                                <span className="text-[9px] text-muted-foreground/60">+{applicablePkgs.length - 2}</span>
                              )}
                            </div>
                          </TableCell>
                        )}
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
