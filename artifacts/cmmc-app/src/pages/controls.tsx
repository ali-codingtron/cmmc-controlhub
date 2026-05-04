import { useState, useMemo } from "react";
import { useListControls } from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { StatusBadge, LevelBadge } from "@/components/ui/badges";
import { Link } from "wouter";
import { X } from "lucide-react";

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

export default function Controls() {
  const [search, setSearch] = useState("");
  const [domainFilter, setDomainFilter] = useState("all");
  const [levelFilter, setLevelFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [evidenceFilter, setEvidenceFilter] = useState<EvidenceCoverage>("all");

  const { data: controls, isLoading } = useListControls({});

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
      if (levelFilter !== "all") {
        if (c.level !== levelFilter) return false;
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
  }, [controls, search, domainFilter, levelFilter, statusFilter, evidenceFilter]);

  const hasActiveFilters =
    search !== "" ||
    domainFilter !== "all" ||
    levelFilter !== "all" ||
    statusFilter !== "all" ||
    evidenceFilter !== "all";

  function clearFilters() {
    setSearch("");
    setDomainFilter("all");
    setLevelFilter("all");
    setStatusFilter("all");
    setEvidenceFilter("all");
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold">Controls Library</h1>
      </div>

      <Card>
        <CardContent className="pt-4 pb-0">
          <div className="flex flex-wrap gap-3 items-center">
            <Input
              placeholder="Search controls..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-48 shrink-0"
            />

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
                  <TableHead>Control ID</TableHead>
                  <TableHead>Title</TableHead>
                  <TableHead>Domain</TableHead>
                  <TableHead>Level</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Evidence</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-muted-foreground py-10">
                      No controls match the current filters.
                    </TableCell>
                  </TableRow>
                ) : (
                  filtered.map((control) => (
                    <TableRow key={control.id}>
                      <TableCell className="font-medium">
                        <Link href={`/controls/${control.id}`} className="text-primary hover:underline">
                          {control.controlId}
                        </Link>
                      </TableCell>
                      <TableCell>{control.title}</TableCell>
                      <TableCell>{control.domainName}</TableCell>
                      <TableCell><LevelBadge level={control.level} /></TableCell>
                      <TableCell><StatusBadge status={control.status} /></TableCell>
                      <TableCell>{control.approvedEvidenceCount} / {control.evidenceCount}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
