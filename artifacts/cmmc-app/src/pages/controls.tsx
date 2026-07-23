import { useState, useMemo, useEffect, useCallback } from "react";
import { useListControls, useListOrgPackages } from "@workspace/api-client-react";
import { useOrg } from "@/context/OrgContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { StatusBadge, LevelBadge } from "@/components/ui/badges";
import { Link } from "wouter";
import {
  X, LayoutGrid, Table2, Grid3x3, AlertTriangle, Package2,
  CheckCircle2, Clock, Circle, XCircle, ChevronRight, Info,
  FileText, ShieldAlert, AlertCircle, Minus, BookOpen, SlidersHorizontal,
} from "lucide-react";
import { cn } from "@/lib/utils";

type ViewType = "domains" | "table" | "matrix" | "attention" | "packages";

const DOMAINS = [
  { code: "AC", name: "Access Control", description: "Limit system access to authorized users and devices." },
  { code: "AT", name: "Awareness and Training", description: "Ensure personnel understand security risks and responsibilities." },
  { code: "AU", name: "Audit and Accountability", description: "Create and retain system audit logs and records." },
  { code: "CM", name: "Configuration Management", description: "Establish baselines and control changes to systems." },
  { code: "IA", name: "Identification and Authentication", description: "Identify and authenticate users and devices accessing systems." },
  { code: "IR", name: "Incident Response", description: "Establish incident-handling capabilities for systems." },
  { code: "MA", name: "Maintenance", description: "Perform maintenance on organizational systems." },
  { code: "MP", name: "Media Protection", description: "Protect system media containing CUI." },
  { code: "PE", name: "Physical Protection", description: "Limit physical access to systems and facilities." },
  { code: "PS", name: "Personnel Security", description: "Screen individuals prior to authorizing access." },
  { code: "RA", name: "Risk Assessment", description: "Assess risk to operations, assets, and individuals." },
  { code: "CA", name: "Security Assessment", description: "Periodically assess security controls and create plans of action." },
  { code: "SC", name: "System & Communications Protection", description: "Monitor and protect communications at boundaries." },
  { code: "SI", name: "System & Information Integrity", description: "Identify, report, and correct system flaws." },
];

function getParam(key: string, fallback = "") {
  if (typeof window === "undefined") return fallback;
  return new URLSearchParams(window.location.search).get(key) ?? fallback;
}

function isValidView(v: string): v is ViewType {
  return ["domains", "table", "matrix", "attention", "packages"].includes(v);
}

function domainCodeFromControlId(controlId: string) {
  return controlId?.split(".")?.[0] ?? "";
}

type Control = {
  id: string;
  controlId: string;
  domainId: string;
  domainName: string;
  title: string;
  description?: string;
  level: string;
  nistRef?: string | null;
  status: string;
  hasNarrative: boolean;
  evidenceCount: number;
  approvedEvidenceCount: number;
  openTaskCount: number;
  openPoamCount: number;
};

type DomainStats = {
  code: string;
  name: string;
  description: string;
  total: number;
  implemented: number;
  inProgress: number;
  notStarted: number;
  atRisk: number;
  needsReview: number;
  notApplicable: number;
  withApprovedEvidence: number;
  noEvidence: number;
  withNarrative: number;
  openPoams: number;
  openTasks: number;
  pct: number;
};

function computeDomainStats(controls: Control[]): DomainStats[] {
  return DOMAINS.map((d) => {
    const dc = controls.filter((c) => domainCodeFromControlId(c.controlId) === d.code);
    const applicable = dc.filter((c) => c.status !== "not_applicable");
    const total = applicable.length;
    const implemented = dc.filter((c) => c.status === "implemented").length;
    const inProgress = dc.filter((c) => c.status === "in_progress").length;
    const atRisk = dc.filter((c) => c.status === "at_risk").length;
    const needsReview = dc.filter((c) => c.status === "needs_review" || c.status === "assessor_ready").length;
    const notApplicable = dc.filter((c) => c.status === "not_applicable").length;
    const notStarted = dc.filter((c) => c.status === "not_started").length;
    const withApprovedEvidence = applicable.filter((c) => (c.approvedEvidenceCount ?? 0) > 0).length;
    const noEvidence = applicable.filter((c) => (c.approvedEvidenceCount ?? 0) === 0 && (c.evidenceCount ?? 0) === 0).length;
    const withNarrative = applicable.filter((c) => c.hasNarrative).length;
    const openPoams = dc.reduce((s, c) => s + (c.openPoamCount ?? 0), 0);
    const openTasks = dc.reduce((s, c) => s + (c.openTaskCount ?? 0), 0);
    return {
      code: d.code,
      name: d.name,
      description: d.description,
      total: dc.length,
      implemented,
      inProgress,
      notStarted,
      atRisk,
      needsReview,
      notApplicable,
      withApprovedEvidence,
      noEvidence,
      withNarrative,
      openPoams,
      openTasks,
      pct: total > 0 ? Math.round((implemented / total) * 100) : 0,
    };
  }).filter((d) => d.total > 0);
}

type CardColor = "green" | "blue" | "amber" | "red" | "slate";

function getDomainCardColor(s: DomainStats): CardColor {
  if (s.total === 0) return "slate";
  if (s.atRisk > 0) return "red";
  if (s.implemented === s.total) return "green";
  if (s.openPoams > 0 || s.noEvidence > Math.ceil(s.total * 0.4)) return "amber";
  if (s.pct >= 50 || s.inProgress > 0) return "blue";
  return "slate";
}

function getDomainCardReason(s: DomainStats, color: CardColor): string {
  if (color === "red") return `${s.atRisk} at-risk control${s.atRisk !== 1 ? "s" : ""} require immediate attention.`;
  if (color === "green") return "All applicable controls are implemented.";
  if (color === "amber") {
    if (s.openPoams > 0) return `${s.openPoams} open POA&M item${s.openPoams !== 1 ? "s" : ""} need remediation.`;
    return `${s.noEvidence} control${s.noEvidence !== 1 ? "s" : ""} lack supporting evidence.`;
  }
  if (color === "blue") return `${s.pct}% implemented — work is in progress.`;
  return "No controls have been started.";
}

function getRecommendedAction(s: DomainStats): string {
  if (s.atRisk > 0) return "Remediate at-risk controls immediately.";
  if (s.openPoams > 0) return "Review and close open POA&M items.";
  if (s.noEvidence > 0) return "Upload supporting evidence for implemented controls.";
  if (s.pct < 50) return "Progress implementation of remaining controls.";
  if (!s.withNarrative || s.withNarrative < s.total - s.notApplicable) return "Complete missing implementation narratives.";
  if (s.implemented === s.total) return "Maintain and monitor current status.";
  return "Continue progressing toward full implementation.";
}

const colorBorder: Record<CardColor, string> = {
  green: "border-l-green-500",
  blue: "border-l-blue-500",
  amber: "border-l-amber-500",
  red: "border-l-red-500",
  slate: "border-l-slate-300",
};
const colorBg: Record<CardColor, string> = {
  green: "bg-green-50",
  blue: "bg-blue-50",
  amber: "bg-amber-50",
  red: "bg-red-50",
  slate: "bg-slate-50",
};
const colorBar: Record<CardColor, string> = {
  green: "bg-green-500",
  blue: "bg-blue-500",
  amber: "bg-amber-500",
  red: "bg-red-500",
  slate: "bg-slate-400",
};

function StatusCell({ status }: { status: string }) {
  const cfg: Record<string, { icon: React.ReactNode; label: string; cls: string }> = {
    implemented: { icon: <CheckCircle2 className="h-3.5 w-3.5" />, label: "Implemented", cls: "text-green-700 bg-green-50" },
    in_progress: { icon: <Clock className="h-3.5 w-3.5" />, label: "In Progress", cls: "text-blue-700 bg-blue-50" },
    not_started: { icon: <Circle className="h-3.5 w-3.5" />, label: "Not Started", cls: "text-slate-500 bg-slate-50" },
    at_risk: { icon: <ShieldAlert className="h-3.5 w-3.5" />, label: "At Risk", cls: "text-red-700 bg-red-50" },
    needs_review: { icon: <AlertCircle className="h-3.5 w-3.5" />, label: "Needs Review", cls: "text-amber-700 bg-amber-50" },
    assessor_ready: { icon: <AlertCircle className="h-3.5 w-3.5" />, label: "Assessor Ready", cls: "text-purple-700 bg-purple-50" },
    not_applicable: { icon: <Minus className="h-3.5 w-3.5" />, label: "N/A", cls: "text-slate-400 bg-slate-50" },
  };
  const s = cfg[status] ?? cfg.not_started;
  return (
    <span className={cn("inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs font-medium", s.cls)}>
      {s.icon}{s.label}
    </span>
  );
}

function MatrixCell({ ok, warn, bad, label, tooltip }: { ok?: boolean; warn?: boolean; bad?: boolean; label: string; tooltip?: string }) {
  const cls = bad ? "bg-red-50 text-red-700 border-red-200" : warn ? "bg-amber-50 text-amber-700 border-amber-200" : ok ? "bg-green-50 text-green-700 border-green-200" : "bg-slate-50 text-slate-400 border-slate-200";
  const inner = <span className={cn("inline-block rounded border px-1.5 py-0.5 text-[11px] font-medium w-full text-center leading-4", cls)}>{label}</span>;
  if (tooltip) return <Tooltip><TooltipTrigger asChild>{inner}</TooltipTrigger><TooltipContent>{tooltip}</TooltipContent></Tooltip>;
  return inner;
}

function SummaryBar({ controls }: { controls: Control[] }) {
  const applicable = controls.filter((c) => c.status !== "not_applicable");
  const implemented = controls.filter((c) => c.status === "implemented").length;
  const inProgress = controls.filter((c) => c.status === "in_progress").length;
  const notStarted = controls.filter((c) => c.status === "not_started").length;
  const atRisk = controls.filter((c) => c.status === "at_risk").length;
  const withEvidence = applicable.filter((c) => (c.approvedEvidenceCount ?? 0) > 0).length;
  const openPoams = controls.reduce((s, c) => s + (c.openPoamCount ?? 0), 0);

  return (
    <div className="flex flex-wrap gap-3 items-center rounded-lg border bg-slate-50/60 px-4 py-2.5 text-sm">
      <span className="font-semibold text-slate-700 mr-1">{controls.length} Controls</span>
      <span className="text-slate-300">|</span>
      <span className="flex items-center gap-1"><CheckCircle2 className="h-3.5 w-3.5 text-green-600" /><span className="font-medium text-green-700">{implemented}</span><span className="text-slate-500">Implemented</span></span>
      <span className="flex items-center gap-1"><Clock className="h-3.5 w-3.5 text-blue-500" /><span className="font-medium text-blue-700">{inProgress}</span><span className="text-slate-500">In Progress</span></span>
      <span className="flex items-center gap-1"><Circle className="h-3.5 w-3.5 text-slate-400" /><span className="font-medium">{notStarted}</span><span className="text-slate-500">Not Started</span></span>
      {atRisk > 0 && <span className="flex items-center gap-1"><ShieldAlert className="h-3.5 w-3.5 text-red-500" /><span className="font-medium text-red-700">{atRisk}</span><span className="text-slate-500">At Risk</span></span>}
      <span className="text-slate-300">|</span>
      <span className="flex items-center gap-1"><FileText className="h-3.5 w-3.5 text-slate-400" /><span className="text-slate-600">{withEvidence}/{applicable.length} Evidence</span></span>
      {openPoams > 0 && <><span className="text-slate-300">|</span><span className="flex items-center gap-1"><AlertTriangle className="h-3.5 w-3.5 text-amber-500" /><span className="font-medium text-amber-700">{openPoams}</span><span className="text-slate-500">Open POA&amp;Ms</span></span></>}
    </div>
  );
}

function FilterBar({
  search, setSearch, domainFilter, setDomainFilter, levelFilter, setLevelFilter,
  statusFilter, setStatusFilter, evidenceFilter, setEvidenceFilter,
  poamFilter, setPoamFilter, narrativeFilter, setNarrativeFilter,
  hasActiveFilters, onClear, resultCount, isLoading,
}: {
  search: string; setSearch: (v: string) => void;
  domainFilter: string; setDomainFilter: (v: string) => void;
  levelFilter: string; setLevelFilter: (v: string) => void;
  statusFilter: string; setStatusFilter: (v: string) => void;
  evidenceFilter: string; setEvidenceFilter: (v: string) => void;
  poamFilter: string; setPoamFilter: (v: string) => void;
  narrativeFilter: string; setNarrativeFilter: (v: string) => void;
  hasActiveFilters: boolean; onClear: () => void;
  resultCount: number; isLoading: boolean;
}) {
  return (
    <Card>
      <CardContent className="pt-4 pb-3">
        <div className="flex flex-wrap gap-2 items-center">
          <SlidersHorizontal className="h-4 w-4 text-muted-foreground shrink-0" />
          <Input placeholder="Search ID, title, description…" value={search} onChange={(e) => setSearch(e.target.value)} className="w-52 shrink-0" />
          <Select value={domainFilter} onValueChange={setDomainFilter}>
            <SelectTrigger className="w-44"><SelectValue placeholder="All Domains" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Domains</SelectItem>
              {DOMAINS.map((d) => <SelectItem key={d.code} value={d.code}>{d.code} — {d.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={levelFilter} onValueChange={setLevelFilter}>
            <SelectTrigger className="w-28"><SelectValue placeholder="All Levels" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Levels</SelectItem>
              <SelectItem value="L1">L1</SelectItem>
              <SelectItem value="L2">L2</SelectItem>
            </SelectContent>
          </Select>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-40"><SelectValue placeholder="All Statuses" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              <SelectItem value="implemented">Implemented</SelectItem>
              <SelectItem value="in_progress">In Progress</SelectItem>
              <SelectItem value="not_started">Not Started</SelectItem>
              <SelectItem value="at_risk">At Risk</SelectItem>
              <SelectItem value="needs_review">Needs Review</SelectItem>
              <SelectItem value="not_applicable">Not Applicable</SelectItem>
            </SelectContent>
          </Select>
          <Select value={evidenceFilter} onValueChange={setEvidenceFilter}>
            <SelectTrigger className="w-40"><SelectValue placeholder="Evidence" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Evidence</SelectItem>
              <SelectItem value="none">No Evidence</SelectItem>
              <SelectItem value="approved">Has Approved</SelectItem>
              <SelectItem value="pending">Pending Review</SelectItem>
            </SelectContent>
          </Select>
          <Select value={narrativeFilter} onValueChange={setNarrativeFilter}>
            <SelectTrigger className="w-40"><SelectValue placeholder="Narrative" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Narratives</SelectItem>
              <SelectItem value="has">Has Narrative</SelectItem>
              <SelectItem value="missing">Missing Narrative</SelectItem>
            </SelectContent>
          </Select>
          <Select value={poamFilter} onValueChange={setPoamFilter}>
            <SelectTrigger className="w-36"><SelectValue placeholder="POA&amp;M" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All POA&Ms</SelectItem>
              <SelectItem value="open">Has Open POA&M</SelectItem>
              <SelectItem value="none">No Open POA&M</SelectItem>
            </SelectContent>
          </Select>
          {hasActiveFilters && (
            <Button variant="ghost" size="sm" onClick={onClear} className="gap-1.5 text-muted-foreground">
              <X className="h-3.5 w-3.5" />Clear
            </Button>
          )}
          <span className="ml-auto text-xs text-muted-foreground shrink-0">
            {isLoading ? "Loading…" : `${resultCount} control${resultCount !== 1 ? "s" : ""}`}
          </span>
        </div>
      </CardContent>
    </Card>
  );
}

function DomainOverview({ controls }: { controls: Control[] }) {
  const domainStats = computeDomainStats(controls);
  if (domainStats.length === 0) {
    return <div className="text-center text-muted-foreground py-16">No controls match the current filters.</div>;
  }
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
      {domainStats.map((s) => {
        const color = getDomainCardColor(s);
        const reason = getDomainCardReason(s, color);
        const action = getRecommendedAction(s);
        return (
          <Tooltip key={s.code}>
            <TooltipTrigger asChild>
              <Card className={cn("border-l-4 hover:shadow-md transition-shadow cursor-pointer", colorBorder[color])}>
                <CardContent className="pt-4 pb-3">
                  <div className="flex items-start justify-between gap-2 mb-3">
                    <div>
                      <p className="text-xs font-bold text-muted-foreground tracking-wide uppercase">{s.code}</p>
                      <p className="font-semibold text-sm leading-tight">{s.name}</p>
                    </div>
                    <Badge variant="outline" className={cn("shrink-0 text-xs", colorBg[color])}>
                      {s.pct}%
                    </Badge>
                  </div>
                  <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden mb-3">
                    <div className={cn("h-full rounded-full transition-all", colorBar[color])} style={{ width: `${s.pct}%` }} />
                  </div>
                  <div className="text-xs text-muted-foreground mb-2">
                    <span className="font-semibold text-foreground">{s.implemented}</span> of {s.total} implemented
                    {s.notApplicable > 0 && <span className="ml-1 text-slate-400">({s.notApplicable} N/A)</span>}
                  </div>
                  <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-slate-500 mb-3">
                    {s.inProgress > 0 && <span className="text-blue-600 font-medium">↑ {s.inProgress} in progress</span>}
                    {s.atRisk > 0 && <span className="text-red-600 font-medium">⚠ {s.atRisk} at risk</span>}
                    {s.needsReview > 0 && <span className="text-amber-600 font-medium">◎ {s.needsReview} needs review</span>}
                    {s.notStarted > 0 && <span>○ {s.notStarted} not started</span>}
                  </div>
                  <div className="flex items-center gap-4 text-[11px] text-slate-500 mb-3 border-t pt-2">
                    <span title="Controls with approved evidence"><FileText className="h-3 w-3 inline mr-0.5" />{s.withApprovedEvidence}/{s.total - s.notApplicable} evidence</span>
                    <span title="Open POA&M items">{s.openPoams > 0 ? <span className="text-amber-600"><AlertTriangle className="h-3 w-3 inline mr-0.5" />{s.openPoams} POA&Ms</span> : <span>✓ No POA&Ms</span>}</span>
                  </div>
                  <p className="text-[11px] text-slate-500 italic mb-3 line-clamp-2">{action}</p>
                  <Link href={`/controls/domain/${s.code}`}>
                    <Button variant="outline" size="sm" className="w-full justify-between text-xs h-7">
                      Open {s.name} <ChevronRight className="h-3.5 w-3.5" />
                    </Button>
                  </Link>
                </CardContent>
              </Card>
            </TooltipTrigger>
            <TooltipContent side="top" className="max-w-xs">
              <p className="text-xs">{reason}</p>
            </TooltipContent>
          </Tooltip>
        );
      })}
    </div>
  );
}

const L1_PACKAGE_KEYS = new Set(["CMMC_L1_SELF", "FAR_52_204_21", "CMMC_L2_SELF", "NIST_800_171_R2", "NIST_800_171_R3", "NIST_800_171A_R2", "NIST_800_171A_R3"]);
const L2_ONLY_PACKAGE_KEYS = new Set(["CMMC_L2_SELF", "NIST_800_171_R2", "NIST_800_171_R3", "NIST_800_171A_R2", "NIST_800_171A_R3"]);

function DetailedTable({ controls, activePackages }: { controls: Control[]; activePackages: any[] }) {
  const hasPackages = activePackages.length > 0;
  if (controls.length === 0) {
    return <div className="text-center text-muted-foreground py-16">No controls match the current filters.</div>;
  }
  return (
    <Card>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-28">Control ID</TableHead>
              <TableHead>Title</TableHead>
              <TableHead className="w-28">Domain</TableHead>
              <TableHead className="w-14">Level</TableHead>
              <TableHead className="w-36">Status</TableHead>
              <TableHead className="w-20 text-center">Evidence</TableHead>
              <TableHead className="w-20 text-center">Narrative</TableHead>
              <TableHead className="w-20 text-center">POA&M</TableHead>
              {hasPackages && <TableHead className="w-32">Packages</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {controls.map((c) => {
              const applicablePkgs = hasPackages
                ? activePackages.filter((p: any) => {
                    const key: string = p.packageKey ?? "";
                    if (c.level === "L1") return L1_PACKAGE_KEYS.has(key);
                    return L2_ONLY_PACKAGE_KEYS.has(key);
                  })
                : [];
              const evBad = (c.approvedEvidenceCount ?? 0) === 0 && c.status !== "not_applicable" && c.status !== "not_started";
              const evWarn = (c.evidenceCount ?? 0) > (c.approvedEvidenceCount ?? 0) && (c.approvedEvidenceCount ?? 0) >= 0;
              return (
                <TableRow key={c.id} className="hover:bg-slate-50/50">
                  <TableCell className="font-medium">
                    <Link href={`/controls/${c.id}`} className="text-primary hover:underline font-mono text-xs">{c.controlId}</Link>
                  </TableCell>
                  <TableCell className="text-sm">{c.title}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{c.domainName}</TableCell>
                  <TableCell><LevelBadge level={c.level} /></TableCell>
                  <TableCell><StatusCell status={c.status} /></TableCell>
                  <TableCell className="text-center">
                    <Tooltip>
                      <TooltipTrigger>
                        <span className={cn("text-xs font-medium", evBad ? "text-red-600" : evWarn ? "text-amber-600" : "text-green-700")}>
                          {c.approvedEvidenceCount}/{c.evidenceCount}
                        </span>
                      </TooltipTrigger>
                      <TooltipContent>{c.approvedEvidenceCount} approved, {(c.evidenceCount ?? 0) - (c.approvedEvidenceCount ?? 0)} pending/other</TooltipContent>
                    </Tooltip>
                  </TableCell>
                  <TableCell className="text-center">
                    {c.status === "not_applicable" ? <Minus className="h-3.5 w-3.5 text-slate-300 mx-auto" /> :
                      c.hasNarrative ? <CheckCircle2 className="h-3.5 w-3.5 text-green-500 mx-auto" /> :
                        <XCircle className="h-3.5 w-3.5 text-slate-300 mx-auto" />}
                  </TableCell>
                  <TableCell className="text-center">
                    {(c.openPoamCount ?? 0) > 0
                      ? <span className="text-xs font-medium text-amber-700 bg-amber-50 rounded px-1.5 py-0.5">{c.openPoamCount}</span>
                      : <span className="text-xs text-slate-300">—</span>}
                  </TableCell>
                  {hasPackages && (
                    <TableCell>
                      <div className="flex flex-wrap gap-0.5">
                        {applicablePkgs.slice(0, 2).map((p: any) => (
                          <Badge key={p.packageId} variant="outline" className={cn("text-[9px] px-1 py-0",
                            p.frameworkShortName === "CMMC" ? "bg-purple-50 text-purple-700 border-purple-200" :
                            p.frameworkShortName?.startsWith("NIST") ? "bg-blue-50 text-blue-700 border-blue-200" :
                            "bg-slate-50 text-slate-600 border-slate-200"
                          )}>{p.frameworkShortName}</Badge>
                        ))}
                        {applicablePkgs.length > 2 && <span className="text-[9px] text-muted-foreground">+{applicablePkgs.length - 2}</span>}
                      </div>
                    </TableCell>
                  )}
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

const MATRIX_QUICK_FILTERS = [
  { key: "all", label: "All" },
  { key: "missing_narrative", label: "Missing Narrative" },
  { key: "no_evidence", label: "No Evidence" },
  { key: "open_poam", label: "Open POA&M" },
  { key: "needs_review", label: "Needs Review" },
  { key: "at_risk", label: "At Risk" },
] as const;

type MatrixFilter = typeof MATRIX_QUICK_FILTERS[number]["key"];

function ReadinessMatrix({ controls }: { controls: Control[] }) {
  const [mf, setMf] = useState<MatrixFilter>("all");

  const visible = useMemo(() => {
    if (mf === "all") return controls;
    if (mf === "missing_narrative") return controls.filter((c) => !c.hasNarrative && c.status !== "not_applicable");
    if (mf === "no_evidence") return controls.filter((c) => (c.approvedEvidenceCount ?? 0) === 0 && c.status !== "not_applicable");
    if (mf === "open_poam") return controls.filter((c) => (c.openPoamCount ?? 0) > 0);
    if (mf === "needs_review") return controls.filter((c) => c.status === "needs_review" || c.status === "assessor_ready");
    if (mf === "at_risk") return controls.filter((c) => c.status === "at_risk");
    return controls;
  }, [controls, mf]);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2 items-center">
        {MATRIX_QUICK_FILTERS.map((f) => (
          <Button key={f.key} size="sm" variant={mf === f.key ? "default" : "outline"} onClick={() => setMf(f.key)} className="h-7 text-xs">
            {f.label}
          </Button>
        ))}
        <div className="ml-auto flex items-center gap-3 text-[11px] text-muted-foreground">
          <span className="inline-flex items-center gap-1"><span className="inline-block w-3 h-3 rounded bg-green-100 border border-green-300" /> Complete</span>
          <span className="inline-flex items-center gap-1"><span className="inline-block w-3 h-3 rounded bg-amber-100 border border-amber-300" /> Partial</span>
          <span className="inline-flex items-center gap-1"><span className="inline-block w-3 h-3 rounded bg-red-100 border border-red-300" /> Missing</span>
          <span className="inline-flex items-center gap-1"><span className="inline-block w-3 h-3 rounded bg-slate-100 border border-slate-200" /> N/A</span>
        </div>
      </div>
      {visible.length === 0 ? (
        <div className="text-center text-muted-foreground py-16">No controls match this filter.</div>
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-28">Control</TableHead>
                  <TableHead>Title</TableHead>
                  <TableHead className="w-32 text-center">Status</TableHead>
                  <TableHead className="w-24 text-center">Narrative</TableHead>
                  <TableHead className="w-24 text-center">Evidence</TableHead>
                  <TableHead className="w-24 text-center">POA&amp;M</TableHead>
                  <TableHead className="w-24 text-center">Tasks</TableHead>
                  <TableHead className="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {visible.map((c) => {
                  const na = c.status === "not_applicable";
                  const evOk = (c.approvedEvidenceCount ?? 0) > 0;
                  const evWarn = (c.evidenceCount ?? 0) > (c.approvedEvidenceCount ?? 0) && (c.evidenceCount ?? 0) > 0;
                  const evBad = !evOk && !na && c.status !== "not_started";
                  return (
                    <TableRow key={c.id} className="hover:bg-slate-50/40">
                      <TableCell className="font-mono text-xs font-semibold">
                        <Link href={`/controls/${c.id}`} className="text-primary hover:underline">{c.controlId}</Link>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground max-w-48 truncate" title={c.title}>{c.title}</TableCell>
                      <TableCell className="text-center">
                        <MatrixCell
                          ok={c.status === "implemented" || c.status === "assessor_ready"}
                          warn={c.status === "in_progress" || c.status === "needs_review"}
                          bad={c.status === "at_risk"}
                          label={na ? "N/A" : c.status === "implemented" ? "✓ Done" : c.status === "in_progress" ? "~ Active" : c.status === "at_risk" ? "✗ Risk" : c.status === "needs_review" ? "~ Review" : "○ Open"}
                        />
                      </TableCell>
                      <TableCell className="text-center">
                        <MatrixCell
                          ok={c.hasNarrative}
                          bad={!c.hasNarrative && !na && c.status !== "not_started"}
                          label={na ? "N/A" : c.hasNarrative ? "✓ Written" : c.status === "not_started" ? "—" : "✗ Missing"}
                        />
                      </TableCell>
                      <TableCell className="text-center">
                        <Link href={`/controls/${c.id}?tab=evidence`}>
                          <MatrixCell
                            ok={evOk && !evWarn}
                            warn={evOk && evWarn}
                            bad={!!evBad}
                            label={na ? "N/A" : evOk ? `✓ ${c.approvedEvidenceCount}` : c.status === "not_started" ? "—" : "✗ None"}
                            tooltip={`${c.approvedEvidenceCount} approved, ${c.evidenceCount} total`}
                          />
                        </Link>
                      </TableCell>
                      <TableCell className="text-center">
                        <Link href={`/controls/${c.id}?tab=poams`}>
                          <MatrixCell
                            ok={(c.openPoamCount ?? 0) === 0}
                            warn={(c.openPoamCount ?? 0) > 0}
                            label={(c.openPoamCount ?? 0) === 0 ? "—" : `⚠ ${c.openPoamCount}`}
                          />
                        </Link>
                      </TableCell>
                      <TableCell className="text-center">
                        <MatrixCell
                          ok={(c.openTaskCount ?? 0) === 0}
                          warn={(c.openTaskCount ?? 0) > 0}
                          label={(c.openTaskCount ?? 0) === 0 ? "—" : `${c.openTaskCount}`}
                        />
                      </TableCell>
                      <TableCell>
                        <Link href={`/controls/${c.id}`}>
                          <ChevronRight className="h-3.5 w-3.5 text-muted-foreground hover:text-primary" />
                        </Link>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

const ISSUE_DEFS = [
  { key: "at_risk", label: "At Risk", color: "red" as const, icon: ShieldAlert, test: (c: Control) => c.status === "at_risk", why: "These controls are flagged as at-risk and require immediate remediation.", action: "Review status and create or update POA&M." },
  { key: "no_evidence", label: "No Approved Evidence", color: "red" as const, icon: FileText, test: (c: Control) => (c.approvedEvidenceCount ?? 0) === 0 && c.status !== "not_applicable" && c.status !== "not_started", why: "No approved evidence is linked. Claims of implementation are unverified.", action: "Upload or link supporting evidence files." },
  { key: "open_poam", label: "Open POA&M", color: "amber" as const, icon: AlertTriangle, test: (c: Control) => (c.openPoamCount ?? 0) > 0, why: "Open plan-of-action items indicate unresolved security gaps.", action: "Review POA&M milestones and close completed items." },
  { key: "missing_narrative", label: "Missing Narrative", color: "amber" as const, icon: BookOpen, test: (c: Control) => !c.hasNarrative && c.status !== "not_applicable" && c.status !== "not_started", why: "No implementation narrative has been written for this control.", action: "Document how the control is implemented in the narrative field." },
  { key: "needs_review", label: "Needs Review", color: "amber" as const, icon: AlertCircle, test: (c: Control) => c.status === "needs_review" || c.status === "assessor_ready", why: "The control is flagged for review before assessment.", action: "Review evidence and implementation status." },
  { key: "pending_evidence", label: "Evidence Pending Review", color: "amber" as const, icon: FileText, test: (c: Control) => (c.evidenceCount ?? 0) > (c.approvedEvidenceCount ?? 0) && (c.evidenceCount ?? 0) > 0, why: "Evidence has been submitted but not yet reviewed and approved.", action: "Review pending evidence submissions." },
  { key: "not_started", label: "Not Started", color: "slate" as const, icon: Circle, test: (c: Control) => c.status === "not_started", why: "Implementation has not yet begun.", action: "Assign an owner and begin implementation." },
] as const;

type IssueKey = typeof ISSUE_DEFS[number]["key"];

function AttentionNeeded({ controls }: { controls: Control[] }) {
  const [activeIssue, setActiveIssue] = useState<IssueKey | null>(null);

  const issueCounts = useMemo(() =>
    ISSUE_DEFS.map((def) => ({ ...def, controls: controls.filter(def.test) })),
    [controls]
  );

  const totalIssues = issueCounts.reduce((s, i) => s + i.controls.length, 0);
  const withIssues = issueCounts.filter((i) => i.controls.length > 0);

  const displayIssues = activeIssue
    ? issueCounts.filter((i) => i.key === activeIssue)
    : withIssues;

  const colorCls: Record<"red" | "amber" | "slate", string> = {
    red: "border-red-200 bg-red-50 text-red-700",
    amber: "border-amber-200 bg-amber-50 text-amber-700",
    slate: "border-slate-200 bg-slate-50 text-slate-600",
  };
  const iconCls: Record<"red" | "amber" | "slate", string> = {
    red: "text-red-500",
    amber: "text-amber-500",
    slate: "text-slate-400",
  };

  if (totalIssues === 0) {
    return (
      <div className="text-center py-16">
        <CheckCircle2 className="h-12 w-12 text-green-500 mx-auto mb-3" />
        <p className="text-lg font-semibold text-green-700">No attention items</p>
        <p className="text-sm text-muted-foreground">All filtered controls look good.</p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
        {issueCounts.map((i) => {
          const Icon = i.icon;
          const active = activeIssue === i.key;
          return (
            <button key={i.key} onClick={() => setActiveIssue(active ? null : i.key)}
              className={cn("rounded-lg border p-3 text-left transition-all hover:shadow-sm", colorCls[i.color], active && "ring-2 ring-offset-1 ring-current")}>
              <div className="flex items-center gap-2 mb-1">
                <Icon className={cn("h-4 w-4", iconCls[i.color])} />
                <span className="text-sm font-bold">{i.controls.length}</span>
              </div>
              <p className="text-xs font-medium leading-tight">{i.label}</p>
            </button>
          );
        })}
      </div>

      {activeIssue && (
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">Filtered by:</span>
          <Badge variant="outline">{ISSUE_DEFS.find((d) => d.key === activeIssue)?.label}</Badge>
          <Button size="sm" variant="ghost" onClick={() => setActiveIssue(null)} className="h-6 gap-1 text-xs"><X className="h-3 w-3" />Clear</Button>
        </div>
      )}

      {displayIssues.filter((i) => i.controls.length > 0).map((issue) => {
        const Icon = issue.icon;
        return (
          <div key={issue.key} className="space-y-2">
            <div className={cn("flex items-center gap-2 rounded-lg border px-3 py-2", colorCls[issue.color])}>
              <Icon className={cn("h-4 w-4 shrink-0", iconCls[issue.color])} />
              <div className="flex-1 min-w-0">
                <span className="font-semibold text-sm">{issue.label}</span>
                <span className="text-xs ml-2 opacity-80">({issue.controls.length} control{issue.controls.length !== 1 ? "s" : ""})</span>
              </div>
              <p className="text-xs hidden md:block opacity-70 italic">{issue.why}</p>
            </div>
            <div className="rounded-lg border divide-y">
              {issue.controls.map((c) => (
                <div key={c.id} className="flex items-center gap-3 px-3 py-2.5 hover:bg-slate-50/60">
                  <span className="font-mono text-xs font-semibold text-muted-foreground w-28 shrink-0">{c.controlId}</span>
                  <span className="text-sm flex-1 min-w-0 truncate" title={c.title}>{c.title}</span>
                  <span className="text-xs text-muted-foreground hidden md:block shrink-0">{c.domainName}</span>
                  <StatusCell status={c.status} />
                  <Link href={`/controls/${c.id}`}>
                    <Button size="sm" variant="outline" className="h-6 text-xs shrink-0">Open <ChevronRight className="h-3 w-3 ml-0.5" /></Button>
                  </Link>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function PackageView({ controls, activePackages }: { controls: Control[]; activePackages: any[] }) {
  const pkgGroups = useMemo(() => {
    return activePackages.map((pkg: any) => {
      const key: string = pkg.packageKey ?? "";
      const applicable = controls.filter((c) => {
        if (c.level === "L1") return L1_PACKAGE_KEYS.has(key);
        return L2_ONLY_PACKAGE_KEYS.has(key);
      });
      const implemented = applicable.filter((c) => c.status === "implemented").length;
      const atRisk = applicable.filter((c) => c.status === "at_risk").length;
      const withEvidence = applicable.filter((c) => (c.approvedEvidenceCount ?? 0) > 0).length;
      const pct = applicable.length > 0 ? Math.round((implemented / applicable.length) * 100) : 0;
      return { pkg, applicable, implemented, atRisk, withEvidence, pct };
    });
  }, [controls, activePackages]);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {pkgGroups.map(({ pkg, applicable, implemented, atRisk, withEvidence, pct }) => {
          const color: CardColor = atRisk > 0 ? "red" : pct === 100 ? "green" : pct >= 50 ? "blue" : "slate";
          return (
            <Card key={pkg.packageId} className={cn("border-l-4", colorBorder[color])}>
              <CardContent className="pt-4 pb-3">
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div>
                    <Badge variant="outline" className={cn("text-[10px] mb-1",
                      pkg.frameworkShortName === "CMMC" ? "bg-purple-50 text-purple-700" :
                      pkg.frameworkShortName?.startsWith("NIST") ? "bg-blue-50 text-blue-700" :
                      "bg-slate-100 text-slate-600"
                    )}>{pkg.frameworkShortName}</Badge>
                    <p className="font-semibold text-sm">{pkg.packageName}</p>
                  </div>
                  <span className="text-lg font-bold text-muted-foreground">{pct}%</span>
                </div>
                <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden mb-3">
                  <div className={cn("h-full rounded-full", colorBar[color])} style={{ width: `${pct}%` }} />
                </div>
                <div className="grid grid-cols-3 gap-2 text-center text-xs">
                  <div><p className="font-semibold">{applicable.length}</p><p className="text-muted-foreground">Controls</p></div>
                  <div><p className="font-semibold text-green-700">{implemented}</p><p className="text-muted-foreground">Implemented</p></div>
                  <div><p className={cn("font-semibold", atRisk > 0 ? "text-red-700" : "")}>{atRisk}</p><p className="text-muted-foreground">At Risk</p></div>
                </div>
                <div className="text-xs text-muted-foreground text-center mt-1">{withEvidence}/{applicable.length} with approved evidence</div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

const VIEW_DEFS = [
  { key: "domains" as ViewType, label: "Domain Overview", icon: LayoutGrid },
  { key: "table" as ViewType, label: "Table", icon: Table2 },
  { key: "matrix" as ViewType, label: "Matrix", icon: Grid3x3 },
  { key: "attention" as ViewType, label: "Attention Needed", icon: AlertTriangle },
] as const;

export default function Controls() {
  const { activeOrg } = useOrg();

  const initView = (): ViewType => {
    const v = getParam("view", "domains");
    return isValidView(v) ? v : "domains";
  };

  const [view, setView] = useState<ViewType>(initView);
  const [search, setSearch] = useState(() => getParam("search", ""));
  const [domainFilter, setDomainFilter] = useState(() => getParam("domain", "all"));
  const [levelFilter, setLevelFilter] = useState(() => getParam("level", "all"));
  const [statusFilter, setStatusFilter] = useState(() => getParam("status", "all"));
  const [evidenceFilter, setEvidenceFilter] = useState(() => getParam("evidence", "all"));
  const [poamFilter, setPoamFilter] = useState(() => getParam("poam", "all"));
  const [narrativeFilter, setNarrativeFilter] = useState(() => getParam("narrative", "all"));

  const { data: controls = [], isLoading } = useListControls(
    {},
    { query: { enabled: !!activeOrg?.id } as any }
  );

  const { data: orgPackages = [] } = useListOrgPackages(activeOrg?.id ?? "", {
    query: { enabled: !!activeOrg?.id } as any,
  });
  const activePackages = (orgPackages as any[]).filter((p) => p.isActive);
  const hasMultiplePackages = activePackages.length > 1;

  const views = hasMultiplePackages
    ? [...VIEW_DEFS, { key: "packages" as ViewType, label: "Packages", icon: Package2 }]
    : VIEW_DEFS;

  const syncURL = useCallback(() => {
    const sp = new URLSearchParams();
    if (view !== "domains") sp.set("view", view);
    if (search) sp.set("search", search);
    if (domainFilter !== "all") sp.set("domain", domainFilter);
    if (levelFilter !== "all") sp.set("level", levelFilter);
    if (statusFilter !== "all") sp.set("status", statusFilter);
    if (evidenceFilter !== "all") sp.set("evidence", evidenceFilter);
    if (poamFilter !== "all") sp.set("poam", poamFilter);
    if (narrativeFilter !== "all") sp.set("narrative", narrativeFilter);
    const qs = sp.toString();
    window.history.replaceState(null, "", `/controls${qs ? "?" + qs : ""}`);
  }, [view, search, domainFilter, levelFilter, statusFilter, evidenceFilter, poamFilter, narrativeFilter]);

  useEffect(() => { syncURL(); }, [syncURL]);

  const filtered = useMemo(() => {
    if (!controls) return [];
    return (controls as any[]).filter((c) => {
      if (search) {
        const q = search.toLowerCase();
        if (!(c.controlId?.toLowerCase().includes(q) || c.title?.toLowerCase().includes(q) || c.description?.toLowerCase().includes(q) || c.domainName?.toLowerCase().includes(q) || c.nistRef?.toLowerCase().includes(q))) return false;
      }
      if (domainFilter !== "all") {
        const code = c.controlId?.split(".")?.[0] ?? "";
        if (code !== domainFilter) return false;
      }
      if (levelFilter !== "all" && c.level !== levelFilter) return false;
      if (statusFilter !== "all" && (c.status ?? "not_started") !== statusFilter) return false;
      if (evidenceFilter === "none" && (c.evidenceCount ?? 0) !== 0) return false;
      if (evidenceFilter === "approved" && (c.approvedEvidenceCount ?? 0) === 0) return false;
      if (evidenceFilter === "pending" && !((c.evidenceCount ?? 0) > (c.approvedEvidenceCount ?? 0))) return false;
      if (narrativeFilter === "has" && !c.hasNarrative) return false;
      if (narrativeFilter === "missing" && c.hasNarrative) return false;
      if (poamFilter === "open" && (c.openPoamCount ?? 0) === 0) return false;
      if (poamFilter === "none" && (c.openPoamCount ?? 0) > 0) return false;
      return true;
    }) as Control[];
  }, [controls, search, domainFilter, levelFilter, statusFilter, evidenceFilter, poamFilter, narrativeFilter]);

  const hasActiveFilters = search !== "" || domainFilter !== "all" || levelFilter !== "all" || statusFilter !== "all" || evidenceFilter !== "all" || poamFilter !== "all" || narrativeFilter !== "all";

  function clearFilters() {
    setSearch(""); setDomainFilter("all"); setLevelFilter("all");
    setStatusFilter("all"); setEvidenceFilter("all"); setPoamFilter("all"); setNarrativeFilter("all");
  }

  const attentionCount = useMemo(() => {
    const seen = new Set<string>();
    ISSUE_DEFS.forEach((def) => filtered.filter(def.test).forEach((c) => seen.add(c.id)));
    return seen.size;
  }, [filtered]);

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">Controls & Requirements</h1>
          <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
            Review implementation progress, supporting evidence, and remediation status across the organization's compliance controls.
          </p>
          {activePackages.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-2">
              {activePackages.map((pkg: any) => (
                <Badge key={pkg.packageId} variant="outline" className={cn("text-[10px] px-1.5 py-0",
                  pkg.frameworkShortName === "CMMC" ? "bg-purple-50 text-purple-700 border-purple-200" :
                  pkg.frameworkShortName?.startsWith("NIST") ? "bg-blue-50 text-blue-700 border-blue-200" :
                  pkg.frameworkShortName === "DFARS" ? "bg-amber-50 text-amber-700 border-amber-200" :
                  "bg-slate-100 text-slate-600 border-slate-200"
                )}>{pkg.packageName}</Badge>
              ))}
            </div>
          )}
        </div>
        <div className="flex flex-wrap gap-1.5 shrink-0 sm:self-start">
          {views.map(({ key, label, icon: Icon }) => {
            const isAttention = key === "attention";
            return (
              <Button key={key} size="sm" variant={view === key ? "default" : "outline"}
                onClick={() => setView(key)}
                className={cn("gap-1.5 h-8 text-xs", view !== key && isAttention && attentionCount > 0 && "border-amber-300 text-amber-700 hover:bg-amber-50")}>
                <Icon className="h-3.5 w-3.5" />
                {label}
                {isAttention && attentionCount > 0 && (
                  <span className={cn("ml-0.5 rounded-full px-1.5 py-0 text-[10px] font-bold", view === key ? "bg-white/20" : "bg-amber-100 text-amber-700")}>{attentionCount}</span>
                )}
              </Button>
            );
          })}
        </div>
      </div>

      {!isLoading && filtered.length > 0 && <SummaryBar controls={filtered} />}

      <FilterBar
        search={search} setSearch={setSearch}
        domainFilter={domainFilter} setDomainFilter={setDomainFilter}
        levelFilter={levelFilter} setLevelFilter={setLevelFilter}
        statusFilter={statusFilter} setStatusFilter={setStatusFilter}
        evidenceFilter={evidenceFilter} setEvidenceFilter={setEvidenceFilter}
        poamFilter={poamFilter} setPoamFilter={setPoamFilter}
        narrativeFilter={narrativeFilter} setNarrativeFilter={setNarrativeFilter}
        hasActiveFilters={hasActiveFilters} onClear={clearFilters}
        resultCount={filtered.length} isLoading={isLoading}
      />

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {[...Array(6)].map((_, i) => <div key={i} className="h-48 animate-pulse bg-muted rounded-lg" />)}
        </div>
      ) : (
        <>
          {view === "domains" && <DomainOverview controls={filtered} />}
          {view === "table" && <DetailedTable controls={filtered} activePackages={activePackages} />}
          {view === "matrix" && <ReadinessMatrix controls={filtered} />}
          {view === "attention" && <AttentionNeeded controls={filtered} />}
          {view === "packages" && hasMultiplePackages && <PackageView controls={filtered} activePackages={activePackages} />}
        </>
      )}
    </div>
  );
}
