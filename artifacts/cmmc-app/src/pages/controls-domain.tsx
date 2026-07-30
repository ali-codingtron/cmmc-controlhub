import { useMemo } from "react";
import { useListControls } from "@workspace/api-client-react";
import { useOrg } from "@/context/OrgContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { LevelBadge } from "@/components/ui/badges";
import { Link } from "wouter";
import {
  ArrowLeft, CheckCircle2, Clock, Circle, XCircle, ChevronRight,
  FileText, ShieldAlert, AlertTriangle, AlertCircle, Minus, BookOpen,
} from "lucide-react";
import { cn } from "@/lib/utils";

const DOMAIN_META: Record<string, { name: string; description: string }> = {
  AC: { name: "Access Control", description: "Limit system access to authorized users, processes acting on behalf of authorized users, or devices and to the types of transactions and functions that authorized users are permitted to exercise." },
  AT: { name: "Awareness and Training", description: "Ensure that personnel are aware of the security risks associated with their activities and are trained to carry out their assigned information security-related duties and responsibilities." },
  AU: { name: "Audit and Accountability", description: "Create and retain system audit logs and records to the extent needed to enable the monitoring, analysis, investigation, and reporting of unlawful or unauthorized system activity." },
  CM: { name: "Configuration Management", description: "Establish and maintain baseline configurations and inventories of organizational systems and enforce security configuration settings for information technology products." },
  IA: { name: "Identification and Authentication", description: "Identify information system users, processes acting on behalf of users, or devices and authenticate (or verify) the identities of those users, processes, or devices as a prerequisite to allowing access." },
  IR: { name: "Incident Response", description: "Establish an operational incident-handling capability for organizational information systems that includes adequate preparation, detection, analysis, containment, recovery, and user response activities." },
  MA: { name: "Maintenance", description: "Perform maintenance on organizational information systems and provide controls on the tools, techniques, mechanisms, and personnel that conduct information system maintenance." },
  MP: { name: "Media Protection", description: "Protect information system media, both paper and digital, limit access to information on information system media to authorized users, and sanitize or destroy information system media before disposal or reuse." },
  PE: { name: "Physical Protection", description: "Limit physical access to organizational information systems, equipment, and the respective operating environments to authorized individuals." },
  PS: { name: "Personnel Security", description: "Ensure that individuals occupying positions of responsibility within organizations are trustworthy and meet established security criteria for those positions." },
  RA: { name: "Risk Assessment", description: "Periodically assess the risk to organizational operations, organizational assets, and individuals resulting from the operation of organizational information systems and the associated processing, storage, or transmission of CUI." },
  CA: { name: "Security Assessment", description: "Periodically assess the security controls in organizational information systems to determine if the controls are effective in their application and develop and implement plans of action designed to correct deficiencies." },
  SC: { name: "System & Communications Protection", description: "Monitor, control, and protect organizational communications at the external boundaries and key internal boundaries of the information systems and employ architectural designs, software development techniques, and systems engineering principles." },
  SI: { name: "System & Information Integrity", description: "Identify, report, and correct information and information system flaws in a timely manner, provide protection from malicious code at appropriate locations within organizational information systems, and monitor information system security alerts and advisories." },
};

type Control = {
  id: string;
  controlId: string;
  domainId: string;
  domainName: string;
  title: string;
  level: string;
  nistRef?: string | null;
  status: string;
  hasNarrative: boolean;
  evidenceCount: number;
  approvedEvidenceCount: number;
  openTaskCount: number;
  openPoamCount: number;
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

function StatCard({ label, value, sub, color }: { label: string; value: string | number; sub?: string; color?: string }) {
  return (
    <div className="rounded-lg border bg-white px-4 py-3 text-center">
      <p className={cn("text-2xl font-bold", color)}>{value}</p>
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      {sub && <p className="text-[11px] text-muted-foreground/70 mt-0.5">{sub}</p>}
    </div>
  );
}

export default function ControlDomain({ code }: { code: string }) {
  const { activeOrg } = useOrg();
  const meta = DOMAIN_META[code];

  const { data: allControls = [], isLoading } = useListControls(
    {},
    { query: { enabled: !!activeOrg?.id } as any }
  );

  const controls = useMemo(() => {
    return (allControls as any[]).filter((c: any) => {
      const domainCode = c.controlId?.split(".")?.[0] ?? "";
      return domainCode === code;
    }) as Control[];
  }, [allControls, code]);

  const applicable = controls.filter((c) => c.status !== "not_applicable");
  const implemented = controls.filter((c) => c.status === "implemented");
  const inProgress = controls.filter((c) => c.status === "in_progress");
  const atRisk = controls.filter((c) => c.status === "at_risk");
  const needsReview = controls.filter((c) => c.status === "needs_review" || c.status === "assessor_ready");
  const notStarted = controls.filter((c) => c.status === "not_started");
  const notApplicable = controls.filter((c) => c.status === "not_applicable");

  const withApprovedEvidence = applicable.filter((c) => (c.approvedEvidenceCount ?? 0) > 0);
  const withNarrative = applicable.filter((c) => c.hasNarrative);
  const openPoams = controls.reduce((s, c) => s + (c.openPoamCount ?? 0), 0);
  const openTasks = controls.reduce((s, c) => s + (c.openTaskCount ?? 0), 0);

  const pct = applicable.length > 0 ? Math.round((implemented.length / applicable.length) * 100) : 0;

  const attentionItems = useMemo(() => {
    const groups: { label: string; color: string; icon: React.ReactNode; items: Control[] }[] = [
      { label: "At Risk", color: "red", icon: <ShieldAlert className="h-4 w-4 text-red-500" />, items: atRisk },
      { label: "No Approved Evidence", color: "amber", icon: <FileText className="h-4 w-4 text-amber-500" />, items: applicable.filter((c) => (c.approvedEvidenceCount ?? 0) === 0 && c.status !== "not_started") },
      { label: "Open POA&M", color: "amber", icon: <AlertTriangle className="h-4 w-4 text-amber-500" />, items: controls.filter((c) => (c.openPoamCount ?? 0) > 0) },
      { label: "Missing Narrative", color: "amber", icon: <BookOpen className="h-4 w-4 text-amber-500" />, items: applicable.filter((c) => !c.hasNarrative && c.status !== "not_started") },
    ].filter((g) => g.items.length > 0);
    return groups;
  }, [controls, applicable, atRisk]);

  if (!meta) {
    return (
      <div className="space-y-4">
        <Link href="/controls?view=domains">
          <Button variant="ghost" size="sm" className="gap-2"><ArrowLeft className="h-4 w-4" />Back to Domain Overview</Button>
        </Link>
        <div className="text-center py-16 text-muted-foreground">Unknown domain code: {code}</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <Link href="/controls?view=domains">
          <Button variant="ghost" size="sm" className="gap-2 mb-3 -ml-2 text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-4 w-4" />Back to Domain Overview
          </Button>
        </Link>
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Badge variant="outline" className="font-mono font-bold text-sm px-2 py-0.5">{code}</Badge>
              <h1 className="text-3xl font-bold">{meta.name}</h1>
            </div>
            <p className="text-sm text-muted-foreground max-w-2xl leading-relaxed">{meta.description}</p>
          </div>
          <div className="text-right shrink-0">
            <p className="text-4xl font-bold text-primary">{pct}%</p>
            <p className="text-xs text-muted-foreground">Implementation Complete</p>
          </div>
        </div>
        <div className="h-2 bg-slate-100 rounded-full overflow-hidden mt-4 max-w-xl">
          <div
            className={cn("h-full rounded-full transition-all", atRisk.length > 0 ? "bg-red-500" : pct === 100 ? "bg-green-500" : pct >= 50 ? "bg-blue-500" : "bg-amber-400")}
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
        <StatCard label="Implemented" value={implemented.length} sub={`of ${applicable.length} applicable`} color="text-green-700" />
        <StatCard label="In Progress" value={inProgress.length} color={inProgress.length > 0 ? "text-blue-700" : undefined} />
        <StatCard label="At Risk" value={atRisk.length} color={atRisk.length > 0 ? "text-red-700" : undefined} />
        <StatCard label="Evidence Coverage" value={`${withApprovedEvidence.length}/${applicable.length}`} sub="controls with approved evidence" color={withApprovedEvidence.length === applicable.length ? "text-green-700" : "text-amber-700"} />
        <StatCard label="Open POA&Ms" value={openPoams} color={openPoams > 0 ? "text-amber-700" : "text-green-700"} />
      </div>

      {attentionItems.length > 0 && (
        <Card className="border-amber-200 bg-amber-50/40">
          <CardHeader className="pb-3 pt-4">
            <CardTitle className="text-base flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-500" />
              Attention Required
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0 space-y-3">
            {attentionItems.map((group) => (
              <div key={group.label}>
                <div className="flex items-center gap-2 mb-1.5">
                  {group.icon}
                  <span className="font-semibold text-sm">{group.label}</span>
                  <Badge variant="outline" className="text-xs">{group.items.length}</Badge>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {group.items.map((c) => (
                    <Link key={c.id} href={`/controls/${c.id}`}>
                      <Badge variant="outline" className="text-xs font-mono hover:bg-white cursor-pointer">
                        {c.controlId}
                      </Badge>
                    </Link>
                  ))}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <div>
        <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
          Controls in this Domain
          <Badge variant="secondary">{controls.length}</Badge>
          {notApplicable.length > 0 && <span className="text-xs text-muted-foreground font-normal">({notApplicable.length} not applicable)</span>}
        </h2>
        {isLoading ? (
          <div className="space-y-2">{[...Array(5)].map((_, i) => <div key={i} className="h-10 animate-pulse bg-muted rounded" />)}</div>
        ) : (
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-28">Control ID</TableHead>
                    <TableHead>Title</TableHead>
                    <TableHead className="w-14">Level</TableHead>
                    <TableHead className="w-36">Status</TableHead>
                    <TableHead className="w-20 text-center">Evidence</TableHead>
                    <TableHead className="w-20 text-center">Narrative</TableHead>
                    <TableHead className="w-20 text-center">POA&M</TableHead>
                    <TableHead className="w-10" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {controls.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={8} className="text-center text-muted-foreground py-10">
                        No controls found for this domain.
                      </TableCell>
                    </TableRow>
                  ) : (
                    controls.map((c) => {
                      const evBad = (c.approvedEvidenceCount ?? 0) === 0 && c.status !== "not_applicable" && c.status !== "not_started";
                      return (
                        <TableRow key={c.id} className="hover:bg-slate-50/50">
                          <TableCell className="font-mono text-xs font-semibold">
                            <Link href={`/controls/${c.id}`} className="text-primary hover:underline">{c.controlId}</Link>
                          </TableCell>
                          <TableCell className="text-sm">{c.title}</TableCell>
                          <TableCell><LevelBadge level={c.level} /></TableCell>
                          <TableCell><StatusCell status={c.status} /></TableCell>
                          <TableCell className="text-center">
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Link
                                  href={`/controls/${c.id}?tab=evidence${evBad || ((c.evidenceCount ?? 0) > (c.approvedEvidenceCount ?? 0)) ? "&evStatus=pending_review" : ""}`}
                                  className={cn("text-xs font-medium hover:underline", evBad ? "text-red-600" : (c.evidenceCount ?? 0) > (c.approvedEvidenceCount ?? 0) ? "text-amber-600" : "text-green-700")}
                                >
                                  {c.approvedEvidenceCount}/{c.evidenceCount}
                                </Link>
                              </TooltipTrigger>
                              <TooltipContent>
                                {c.approvedEvidenceCount} approved, {(c.evidenceCount ?? 0) - (c.approvedEvidenceCount ?? 0)} pending/other
                                {(c.evidenceCount ?? 0) > (c.approvedEvidenceCount ?? 0) && <span className="block text-amber-300 mt-0.5">Click to view pending items</span>}
                              </TooltipContent>
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
                          <TableCell>
                            <Link href={`/controls/${c.id}`}>
                              <ChevronRight className="h-3.5 w-3.5 text-muted-foreground hover:text-primary" />
                            </Link>
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
