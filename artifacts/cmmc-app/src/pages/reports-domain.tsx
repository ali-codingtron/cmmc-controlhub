import { useQuery } from "@tanstack/react-query";
import { useOrg } from "@/context/OrgContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Loader2, ShieldCheck, FileText, AlertTriangle, Activity, CheckCircle2,
  XCircle, MinusCircle, TrendingUp, TrendingDown, Lock, Search, BarChart3,
  ClipboardList, Eye,
} from "lucide-react";
import { ReportShell, ReportStatCard, ProgressBar } from "@/components/reports/ReportShell";
import { apiHeaders, fmtPct } from "@/lib/report-utils";

// ─── Types ────────────────────────────────────────────────────────────────────
interface DomainRow {
  domainCode: string;
  domainName: string;
  implemented: number;
  inProgress: number;
  notStarted: number;
  atRisk: number;
  total: number;
  readinessPct: number;
  evidenceQualityPct: number;
  sspCoveragePct: number;
  monitoringStatus: "current" | "overdue" | "no_data";
  openPoams: number;
  riskRating: "low" | "medium" | "high" | "critical";
  nextAction: string;
}

interface ChecklistItem {
  item: string;
  status: "complete" | "partial" | "missing";
  count: number;
  total: number;
  notes: string;
  link: string;
}

interface DomainReport {
  reportDate: string;
  org: { name: string; cmmcTargetLevel: string; legalName: string | null };
  executiveSummary: {
    overallReadinessPct: number;
    overallStatus: string;
    controlsReady: number;
    totalControls: number;
    domainsReady: number;
    totalDomains: number;
    openPoams: number;
    evidenceGaps: number;
    monitoringGaps: number;
  };
  projectedScore: { max: number; score: number; loss: number; notMet: number; openPoams: number };
  auditConfidence: {
    score: number;
    rating: string;
    breakdown: {
      implementedControls: number;
      approvedEvidence: number;
      evidenceCoverage: number;
      sspNarrative: number;
      policyProcedure: number;
      freshEvidence: number;
      monitoringCurrent: number;
      poamStatus: number;
    };
  };
  c3paoChecklist: ChecklistItem[];
  domains: DomainRow[];
  evidenceIntegrity: {
    total: number;
    withFile: number;
    withHash: number;
    missingHash: number;
    stale: number;
    approved: number;
    pendingReview: number;
  };
  exceptions: { controlId: string; title: string; domain: string; issues: string[] }[];
  poamSummary: { open: number; overdue: number; scoreImpact: number };
  monitoringSummary: { total: number; current: number; overdue: number; dueSoon: number };
  ssp: { title: string; version: string | null; mappingsCount: number; mappingsWithNarrative: number } | null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function riskBorderBg(r: string) {
  if (r === "critical") return "bg-red-100 text-red-800 border-red-200";
  if (r === "high") return "bg-orange-100 text-orange-800 border-orange-200";
  if (r === "medium") return "bg-yellow-100 text-yellow-800 border-yellow-200";
  return "bg-green-100 text-green-800 border-green-200";
}

function pctBar(pct: number) {
  if (pct >= 90) return "bg-green-500";
  if (pct >= 75) return "bg-yellow-500";
  if (pct >= 50) return "bg-orange-500";
  return "bg-red-500";
}

function pctText(pct: number) {
  if (pct >= 90) return "text-green-700";
  if (pct >= 75) return "text-yellow-600";
  if (pct >= 50) return "text-orange-600";
  return "text-red-700";
}

function ChecklistStatusIcon({ status }: { status: "complete" | "partial" | "missing" }) {
  if (status === "complete") return <CheckCircle2 className="h-5 w-5 text-green-600 flex-shrink-0" />;
  if (status === "partial") return <MinusCircle className="h-5 w-5 text-yellow-500 flex-shrink-0" />;
  return <XCircle className="h-5 w-5 text-red-500 flex-shrink-0" />;
}

function ChecklistBadge({ status }: { status: "complete" | "partial" | "missing" }) {
  if (status === "complete") return <Badge className="bg-green-100 text-green-800 border-green-200 text-xs">Complete</Badge>;
  if (status === "partial") return <Badge className="bg-yellow-100 text-yellow-800 border-yellow-200 text-xs">Partial</Badge>;
  return <Badge className="bg-red-100 text-red-800 border-red-200 text-xs">Missing</Badge>;
}

function MiniBar({ value, max }: { value: number; max: number }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  const color = pct >= 80 ? "bg-green-500" : pct >= 50 ? "bg-yellow-500" : "bg-red-400";
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-20 bg-muted rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs font-mono w-8 text-right">{value}/{max}</span>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function ReportsDomain() {
  const { activeOrg } = useOrg();

  const { data, isLoading } = useQuery<DomainReport>({
    queryKey: ["report-domain-v2", activeOrg?.id],
    queryFn: async () => {
      const r = await fetch("/api/reports/domain", { headers: apiHeaders(activeOrg?.id) });
      if (!r.ok) throw new Error("Failed");
      return r.json();
    },
    enabled: !!activeOrg?.id,
  });

  if (isLoading) return (
    <div className="flex justify-center py-24">
      <Loader2 className="h-7 w-7 animate-spin text-muted-foreground" />
    </div>
  );
  if (!data) return null;

  const { executiveSummary: es, projectedScore: ps, auditConfidence: ac, domains, evidenceIntegrity: ei, exceptions, c3paoChecklist, poamSummary, monitoringSummary } = data;

  const overallStatusBadge =
    es.overallStatus === "C3PAO Ready" ? "bg-green-100 text-green-800 border-green-200" :
    es.overallStatus === "In Progress" ? "bg-blue-100 text-blue-800 border-blue-200" :
    "bg-red-100 text-red-800 border-red-200";

  const csvRows = domains.map(d => ({
    Domain: d.domainName,
    Code: d.domainCode,
    "Total Controls": d.total,
    Implemented: d.implemented,
    "In Progress": d.inProgress,
    "Not Started": d.notStarted,
    "At Risk": d.atRisk,
    "Readiness %": d.readinessPct,
    "Evidence Quality %": d.evidenceQualityPct,
    "SSP Coverage %": d.sspCoveragePct,
    "Monitoring Status": d.monitoringStatus,
    "Open POA&Ms": d.openPoams,
    "Risk Rating": d.riskRating,
  }));

  return (
    <ReportShell
      title="CMMC Domain Readiness & C3PAO Readiness Report"
      subtitle="Comprehensive compliance posture for Third-Party Assessment readiness"
      reportDate={data.reportDate}
      orgName={data.org.name}
      csvRows={csvRows}
      csvFilename={`cmmc-domain-readiness-${new Date(data.reportDate).toISOString().split("T")[0]}.csv`}
    >

      {/* ── 1. ORG HEADER ─────────────────────────────────────────────────── */}
      <Card className="mb-6 border-2 border-primary/20 bg-gradient-to-r from-primary/5 to-transparent">
        <CardContent className="pt-5 pb-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <ShieldCheck className="h-5 w-5 text-primary" />
                <h2 className="text-xl font-bold">{data.org.name}</h2>
              </div>
              {data.org.legalName && (
                <p className="text-sm text-muted-foreground ml-7">{data.org.legalName}</p>
              )}
              <p className="text-xs text-muted-foreground ml-7 mt-1">
                Report Date:{" "}
                {new Date(data.reportDate).toLocaleDateString("en-US", {
                  year: "numeric", month: "long", day: "numeric",
                })}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <div className="text-center rounded-lg border bg-background px-4 py-2.5">
                <div className="text-xs text-muted-foreground mb-0.5">CMMC Target</div>
                <div className="font-bold text-primary text-sm">{data.org.cmmcTargetLevel}</div>
              </div>
              <div className="text-center rounded-lg border bg-background px-4 py-2.5">
                <div className="text-xs text-muted-foreground mb-0.5">Overall Readiness</div>
                <div className={`text-2xl font-black ${pctText(es.overallReadinessPct)}`}>
                  {fmtPct(es.overallReadinessPct)}
                </div>
              </div>
              <div className="text-center rounded-lg border bg-background px-4 py-2.5">
                <div className="text-xs text-muted-foreground mb-1">Status</div>
                <Badge className={`${overallStatusBadge} font-semibold`}>{es.overallStatus}</Badge>
              </div>
            </div>
          </div>
          <div className="mt-4">
            <ProgressBar
              pct={es.overallReadinessPct}
              label={`${es.controlsReady} of ${es.totalControls} controls implemented across ${es.totalDomains} domains`}
              color={pctBar(es.overallReadinessPct)}
            />
          </div>
        </CardContent>
      </Card>

      {/* ── 2. EXECUTIVE SUMMARY CARDS ───────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        <ReportStatCard
          label="Controls Implemented"
          value={`${es.controlsReady}/${es.totalControls}`}
          sub={`${fmtPct(es.overallReadinessPct)} complete`}
          color="text-green-700" bg="bg-green-50"
        />
        <ReportStatCard
          label="Domains Full"
          value={`${es.domainsReady}/${es.totalDomains}`}
          sub="at 100% readiness"
          color={es.domainsReady === es.totalDomains ? "text-green-700" : "text-orange-700"}
          bg={es.domainsReady === es.totalDomains ? "bg-green-50" : "bg-orange-50"}
        />
        <ReportStatCard
          label="Evidence Gaps"
          value={es.evidenceGaps}
          sub="controls without evidence"
          color={es.evidenceGaps === 0 ? "text-green-700" : "text-red-700"}
          bg={es.evidenceGaps === 0 ? "bg-green-50" : "bg-red-50"}
        />
        <ReportStatCard
          label="Open POA&Ms"
          value={es.openPoams}
          sub={poamSummary.overdue > 0 ? `${poamSummary.overdue} overdue` : "none overdue"}
          color={es.openPoams === 0 ? "text-green-700" : es.openPoams > 5 ? "text-red-700" : "text-orange-700"}
          bg={es.openPoams === 0 ? "bg-green-50" : "bg-orange-50"}
        />
      </div>

      {/* ── 3. PROJECTED SCORE + AUDIT CONFIDENCE ──────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
        {/* Projected CMMC Score */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <BarChart3 className="h-4 w-4 text-primary" />
              Projected CMMC Score
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-end gap-3 mb-3">
              <div>
                <div className={`text-5xl font-black leading-none ${pctText(Math.round((ps.score / ps.max) * 100))}`}>
                  {ps.score}
                </div>
                <div className="text-xs text-muted-foreground mt-1">of {ps.max} maximum points</div>
              </div>
              <div className="mb-1">
                {ps.loss > 0 ? (
                  <div className="text-sm text-red-600 flex items-center gap-1">
                    <TrendingDown className="h-4 w-4" />
                    <span>−{ps.loss} pts lost</span>
                  </div>
                ) : (
                  <div className="text-sm text-green-600 flex items-center gap-1">
                    <TrendingUp className="h-4 w-4" />
                    <span>Maximum score</span>
                  </div>
                )}
              </div>
            </div>
            <ProgressBar pct={Math.round((ps.score / ps.max) * 100)} color={pctBar(Math.round((ps.score / ps.max) * 100))} />
            <div className="grid grid-cols-2 gap-3 mt-4 text-sm">
              <div className="rounded bg-muted/40 p-2.5 text-center">
                <div className="font-bold text-red-700 text-xl">{ps.notMet}</div>
                <div className="text-xs text-muted-foreground">Controls not met</div>
              </div>
              <div className="rounded bg-muted/40 p-2.5 text-center">
                <div className="font-bold text-orange-700 text-xl">{ps.openPoams}</div>
                <div className="text-xs text-muted-foreground">Open POA&Ms</div>
              </div>
            </div>
            <p className="text-xs text-muted-foreground mt-3 leading-relaxed">
              {ps.max} controls in scope, 1 point each. Score reflects currently implemented controls. Open POA&Ms require documented remediation plans before a C3PAO assessment.
            </p>
          </CardContent>
        </Card>

        {/* Audit Confidence Score */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Eye className="h-4 w-4 text-primary" />
              Audit Confidence Score
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-end gap-3 mb-3">
              <div>
                <div className={`text-5xl font-black leading-none ${pctText(ac.score)}`}>
                  {ac.score}
                </div>
                <div className="text-xs text-muted-foreground mt-1">of 100 maximum</div>
              </div>
              <div className="mb-1">
                <Badge className={
                  ac.rating === "Strong" ? "bg-green-100 text-green-800 border-green-200" :
                  ac.rating === "Moderate" ? "bg-yellow-100 text-yellow-800 border-yellow-200" :
                  ac.rating === "Needs Work" ? "bg-orange-100 text-orange-800 border-orange-200" :
                  "bg-red-100 text-red-800 border-red-200"
                }>{ac.rating}</Badge>
              </div>
            </div>
            <ProgressBar pct={ac.score} color={pctBar(ac.score)} />
            <div className="mt-3 space-y-1.5">
              {([
                { label: "Implemented Controls", val: ac.breakdown.implementedControls, max: 25 },
                { label: "Approved Evidence", val: ac.breakdown.approvedEvidence, max: 20 },
                { label: "Evidence Coverage", val: ac.breakdown.evidenceCoverage, max: 15 },
                { label: "SSP Narratives", val: ac.breakdown.sspNarrative, max: 15 },
                { label: "Policy & Procedure", val: ac.breakdown.policyProcedure, max: 10 },
                { label: "Fresh Evidence", val: ac.breakdown.freshEvidence, max: 5 },
                { label: "Monitoring Current", val: ac.breakdown.monitoringCurrent, max: 5 },
                { label: "POA&M Status", val: ac.breakdown.poamStatus, max: 5 },
              ] as const).map(row => (
                <div key={row.label} className="flex items-center justify-between text-xs gap-2">
                  <span className="text-muted-foreground w-36 shrink-0">{row.label}</span>
                  <MiniBar value={row.val} max={row.max} />
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ── 4. C3PAO READINESS CHECKLIST ─────────────────────────────────── */}
      <Card className="mb-6">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <ClipboardList className="h-4 w-4 text-primary" />
            C3PAO Assessment Readiness Checklist
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="divide-y">
            {c3paoChecklist.map((item, i) => (
              <div
                key={i}
                className={`flex items-center gap-3 px-5 py-3 ${
                  item.status === "missing" ? "bg-red-50/50" :
                  item.status === "partial" ? "bg-yellow-50/40" : ""
                }`}
              >
                <ChecklistStatusIcon status={item.status} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center flex-wrap gap-2">
                    <span className="font-medium text-sm">{item.item}</span>
                    <ChecklistBadge status={item.status} />
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">{item.notes}</p>
                </div>
                {item.total > 0 && (
                  <div className="text-right shrink-0 hidden sm:block">
                    <div className="text-sm font-bold">{item.count}/{item.total}</div>
                    <div className="text-xs text-muted-foreground">{Math.round((item.count / item.total) * 100)}%</div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* ── 5. DOMAIN HEATMAP TABLE ──────────────────────────────────────── */}
      <Card className="mb-6">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <BarChart3 className="h-4 w-4 text-primary" />
            Domain Heatmap — All {domains.length} Domains
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0 overflow-auto">
          <table className="w-full text-sm min-w-[820px]">
            <thead>
              <tr className="border-b bg-muted/30 text-xs text-muted-foreground">
                <th className="text-left px-4 py-2 font-medium w-8">#</th>
                <th className="text-left px-4 py-2 font-medium">Domain</th>
                <th className="text-center px-3 py-2 font-medium">Controls</th>
                <th className="text-left px-3 py-2 font-medium w-40">Readiness</th>
                <th className="text-center px-3 py-2 font-medium">Evidence</th>
                <th className="text-center px-3 py-2 font-medium">SSP</th>
                <th className="text-center px-3 py-2 font-medium">Monitor</th>
                <th className="text-center px-3 py-2 font-medium">POA&Ms</th>
                <th className="text-center px-3 py-2 font-medium">Risk</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {domains.map((d, i) => (
                <tr key={d.domainCode} className="hover:bg-muted/20">
                  <td className="px-4 py-2.5 text-xs text-muted-foreground">{i + 1}</td>
                  <td className="px-4 py-2.5">
                    <div className="font-semibold text-xs">{d.domainCode}</div>
                    <div className="text-xs text-muted-foreground leading-tight">{d.domainName}</div>
                  </td>
                  <td className="px-3 py-2.5 text-center">
                    <span className="font-medium text-green-700">{d.implemented}</span>
                    <span className="text-muted-foreground">/{d.total}</span>
                    {d.atRisk > 0 && <div className="text-xs text-red-600">{d.atRisk} at risk</div>}
                    {d.notStarted > 0 && <div className="text-xs text-gray-400">{d.notStarted} not started</div>}
                  </td>
                  <td className="px-3 py-2.5">
                    <div className="flex items-center gap-1.5">
                      <div className="flex-1">
                        <ProgressBar pct={d.readinessPct} color={pctBar(d.readinessPct)} />
                      </div>
                      <span className={`text-xs font-bold w-8 text-right ${pctText(d.readinessPct)}`}>{d.readinessPct}%</span>
                    </div>
                  </td>
                  <td className="px-3 py-2.5 text-center">
                    <span className={`text-xs font-semibold ${pctText(d.evidenceQualityPct)}`}>{d.evidenceQualityPct}%</span>
                  </td>
                  <td className="px-3 py-2.5 text-center">
                    <span className={`text-xs font-semibold ${pctText(d.sspCoveragePct)}`}>{d.sspCoveragePct}%</span>
                  </td>
                  <td className="px-3 py-2.5 text-center">
                    {d.monitoringStatus === "current" && <Badge className="bg-green-100 text-green-800 border-green-200 text-xs px-1.5">Current</Badge>}
                    {d.monitoringStatus === "overdue" && <Badge className="bg-red-100 text-red-800 border-red-200 text-xs px-1.5">Overdue</Badge>}
                    {d.monitoringStatus === "no_data" && <span className="text-xs text-muted-foreground">—</span>}
                  </td>
                  <td className="px-3 py-2.5 text-center">
                    <span className={`text-xs font-semibold ${d.openPoams > 0 ? "text-orange-700" : "text-green-700"}`}>{d.openPoams}</span>
                  </td>
                  <td className="px-3 py-2.5 text-center">
                    <Badge className={`${riskBorderBg(d.riskRating)} text-xs capitalize px-1.5`}>{d.riskRating}</Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

      {/* ── 6. DOMAIN DETAIL CARDS ───────────────────────────────────────── */}
      {domains.some(d => d.readinessPct < 100 || d.openPoams > 0) && (
        <div className="mb-6">
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3 flex items-center gap-2">
            <Search className="h-3.5 w-3.5" />
            Domain Detail &amp; Next Actions (Incomplete Domains)
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {domains.filter(d => d.readinessPct < 100 || d.openPoams > 0).map(d => (
              <div
                key={d.domainCode}
                className={`rounded-lg border p-4 ${
                  d.riskRating === "critical" ? "border-red-200 bg-red-50/30" :
                  d.riskRating === "high" ? "border-orange-200 bg-orange-50/20" :
                  "border-border bg-muted/10"
                }`}
              >
                <div className="flex items-start justify-between gap-2 mb-3">
                  <div>
                    <div className="font-semibold text-sm">{d.domainCode} — {d.domainName}</div>
                    <div className="text-xs text-muted-foreground">{d.implemented}/{d.total} implemented</div>
                  </div>
                  <Badge className={`${riskBorderBg(d.riskRating)} capitalize text-xs shrink-0`}>{d.riskRating}</Badge>
                </div>
                <div className="grid grid-cols-3 gap-2 mb-3 text-center text-xs">
                  <div className="rounded bg-background/80 border px-2 py-1.5">
                    <div className={`font-bold ${pctText(d.readinessPct)}`}>{d.readinessPct}%</div>
                    <div className="text-muted-foreground">Ready</div>
                  </div>
                  <div className="rounded bg-background/80 border px-2 py-1.5">
                    <div className={`font-bold ${pctText(d.evidenceQualityPct)}`}>{d.evidenceQualityPct}%</div>
                    <div className="text-muted-foreground">Evidence</div>
                  </div>
                  <div className="rounded bg-background/80 border px-2 py-1.5">
                    <div className={`font-bold ${pctText(d.sspCoveragePct)}`}>{d.sspCoveragePct}%</div>
                    <div className="text-muted-foreground">SSP</div>
                  </div>
                </div>
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <AlertTriangle className="h-3 w-3 text-orange-500 flex-shrink-0" />
                  <span className="leading-tight">{d.nextAction}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── 7. EVIDENCE STATUS ────────────────────────────────────────────── */}
      <Card className="mb-6">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Lock className="h-4 w-4 text-primary" />
            Evidence Status
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-4 text-center">
            <div>
              <div className="text-3xl font-bold">{ei.total}</div>
              <div className="text-xs text-muted-foreground">Total Artifacts</div>
            </div>
            <div>
              <div className={`text-3xl font-bold ${ei.approved >= ei.total * 0.8 ? "text-green-700" : "text-orange-700"}`}>{ei.approved}</div>
              <div className="text-xs text-muted-foreground">Approved</div>
            </div>
            <div>
              <div className={`text-3xl font-bold ${ei.pendingReview === 0 ? "text-green-700" : "text-yellow-700"}`}>{ei.pendingReview}</div>
              <div className="text-xs text-muted-foreground">Pending Review</div>
            </div>
            <div>
              <div className={`text-3xl font-bold ${ei.stale === 0 ? "text-green-700" : "text-red-700"}`}>{ei.stale}</div>
              <div className="text-xs text-muted-foreground">Stale / Expired</div>
            </div>
          </div>
          <ProgressBar
            pct={ei.total > 0 ? Math.round((ei.approved / ei.total) * 100) : 0}
            label={`Approval rate: ${ei.approved}/${ei.total} artifacts`}
            color="bg-green-500"
          />
          {(ei.stale > 0 || ei.pendingReview > 0) && (
            <div className="flex flex-wrap gap-2 mt-3">
              {ei.stale > 0 && <Badge className="bg-red-100 text-red-800 border-red-200 text-xs">{ei.stale} stale artifacts</Badge>}
              {ei.pendingReview > 0 && <Badge className="bg-yellow-100 text-yellow-800 border-yellow-200 text-xs">{ei.pendingReview} pending review</Badge>}
            </div>
          )}
          {ei.stale === 0 && ei.pendingReview === 0 && (
            <p className="text-xs text-green-700 font-medium mt-3">All evidence artifacts are approved and current.</p>
          )}
        </CardContent>
      </Card>

      {/* ── 8. EXCEPTIONS / GAPS ─────────────────────────────────────────── */}
      {exceptions.length > 0 && (
        <Card className="mb-6">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-orange-500" />
              Exceptions &amp; Compliance Gaps ({exceptions.length} controls)
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="max-h-72 overflow-y-auto divide-y">
              {exceptions.map((ex, i) => (
                <div key={i} className="flex items-start gap-3 px-5 py-2.5 hover:bg-muted/20">
                  <span className="font-mono text-xs font-semibold text-primary w-20 shrink-0 pt-0.5">{ex.controlId}</span>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-medium truncate">{ex.title}</div>
                    <div className="text-xs text-muted-foreground">{ex.domain}</div>
                  </div>
                  <div className="flex flex-wrap gap-1 justify-end shrink-0">
                    {ex.issues.map((issue, j) => (
                      <Badge key={j} className={`text-xs px-1.5 py-0 ${
                        issue.includes("At Risk") || issue.includes("No evidence") ? "bg-red-100 text-red-700 border-red-200" :
                        issue.includes("No approved") ? "bg-orange-100 text-orange-700 border-orange-200" :
                        "bg-yellow-100 text-yellow-700 border-yellow-200"
                      }`}>{issue}</Badge>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            {exceptions.length >= 60 && (
              <div className="px-5 py-2 border-t text-xs text-muted-foreground bg-muted/20">
                Showing top 60. See Gap Analysis Report for the complete list.
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* ── 9. POA&M + MONITORING ────────────────────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <FileText className="h-4 w-4 text-orange-500" />
              POA&amp;M Summary
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-3 mb-3">
              <div className={`rounded-lg p-3 text-center border ${poamSummary.open > 0 ? "bg-orange-50 border-orange-200" : "bg-green-50 border-green-200"}`}>
                <div className={`text-3xl font-bold ${poamSummary.open > 0 ? "text-orange-700" : "text-green-700"}`}>{poamSummary.open}</div>
                <div className="text-xs text-muted-foreground">Open Items</div>
              </div>
              <div className={`rounded-lg p-3 text-center border ${poamSummary.overdue > 0 ? "bg-red-50 border-red-200" : "bg-muted/20"}`}>
                <div className={`text-3xl font-bold ${poamSummary.overdue > 0 ? "text-red-700" : "text-muted-foreground"}`}>{poamSummary.overdue}</div>
                <div className="text-xs text-muted-foreground">Overdue</div>
              </div>
            </div>
            {poamSummary.open > 0 ? (
              <p className="text-xs text-orange-900 bg-orange-50 border border-orange-200 rounded px-3 py-2">
                <span className="font-semibold">C3PAO note:</span> {poamSummary.open} open POA&M{poamSummary.open > 1 ? "s" : ""} must have milestone dates and remediation plans before assessment.
              </p>
            ) : (
              <p className="text-xs text-green-800 bg-green-50 border border-green-200 rounded px-3 py-2 font-medium">
                All POA&M items closed — excellent audit posture.
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Activity className="h-4 w-4 text-blue-500" />
              Continuous Monitoring Summary
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-3 mb-3">
              <div className="rounded-lg p-3 text-center border bg-muted/20">
                <div className="text-3xl font-bold text-green-700">{monitoringSummary.current}</div>
                <div className="text-xs text-muted-foreground">Current of {monitoringSummary.total}</div>
              </div>
              <div className={`rounded-lg p-3 text-center border ${monitoringSummary.overdue > 0 ? "bg-red-50 border-red-200" : "bg-muted/20"}`}>
                <div className={`text-3xl font-bold ${monitoringSummary.overdue > 0 ? "text-red-700" : "text-muted-foreground"}`}>{monitoringSummary.overdue}</div>
                <div className="text-xs text-muted-foreground">Overdue</div>
              </div>
            </div>
            <ProgressBar
              pct={monitoringSummary.total > 0 ? Math.round((monitoringSummary.current / monitoringSummary.total) * 100) : 100}
              label={monitoringSummary.dueSoon > 0 ? `${monitoringSummary.dueSoon} tasks due within 7 days` : "All tasks on schedule"}
              color={monitoringSummary.overdue === 0 ? "bg-green-500" : "bg-orange-500"}
            />
          </CardContent>
        </Card>
      </div>

      {/* ── 10. GUIDANCE ─────────────────────────────────────────────────── */}
      <Card className="border-primary/20 bg-primary/5">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-primary" />
            C3PAO Assessment Preparation Guidance
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="space-y-2 text-sm">
            {!data.ssp && (
              <li className="flex gap-2"><span className="text-red-500 font-bold shrink-0">!</span>No System Security Plan uploaded — the SSP is a mandatory artifact for CMMC assessment.</li>
            )}
            {ac.score < 75 && (
              <li className="flex gap-2"><span className="text-red-500 font-bold shrink-0">!</span>Audit Confidence Score is {ac.score}/100 — focus on evidence collection, SSP narratives, and monitoring before scheduling assessment.</li>
            )}
            {es.evidenceGaps > 0 && (
              <li className="flex gap-2"><span className="text-orange-500 font-bold shrink-0">!</span>{es.evidenceGaps} control{es.evidenceGaps > 1 ? "s have" : " has"} no linked evidence — attach artifacts and submit for approval before assessment.</li>
            )}
            {poamSummary.overdue > 0 && (
              <li className="flex gap-2"><span className="text-red-500 font-bold shrink-0">!</span>Resolve {poamSummary.overdue} overdue POA&amp;M{poamSummary.overdue > 1 ? "s" : ""} — assessors require milestone dates and remediation plans for all open items.</li>
            )}
            {monitoringSummary.overdue > 0 && (
              <li className="flex gap-2"><span className="text-orange-500 font-bold shrink-0">!</span>Complete {monitoringSummary.overdue} overdue monitoring task{monitoringSummary.overdue > 1 ? "s" : ""} — continuous monitoring is a scored CMMC ML2 requirement.</li>
            )}
            {ei.stale > 0 && (
              <li className="flex gap-2"><span className="text-yellow-600 font-bold shrink-0">!</span>Refresh or supersede {ei.stale} stale evidence artifact{ei.stale > 1 ? "s" : ""} — assessors may reject outdated evidence.</li>
            )}
            {ac.score >= 90 && es.evidenceGaps === 0 && poamSummary.overdue === 0 && monitoringSummary.overdue === 0 && data.ssp && (
              <li className="text-green-700 font-medium flex gap-2">
                <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5" />
                Your compliance posture is strong. Schedule a mock assessment before the official C3PAO engagement to validate readiness.
              </li>
            )}
            {ac.score >= 80 && ac.score < 90 && es.evidenceGaps === 0 && poamSummary.overdue === 0 && (
              <li className="text-blue-700 flex gap-2">
                <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5 text-blue-500" />
                Good progress — score is in the 80–89% range. Focus on completing SSP narratives and closing any open POA&Ms to reach assessment-ready status.
              </li>
            )}
            {ac.score >= 50 && ac.score < 80 && es.evidenceGaps === 0 && poamSummary.overdue === 0 && (
              <li className="text-amber-700 flex gap-2">
                <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5 text-amber-500" />
                Compliance posture needs improvement. Prioritize evidence collection, SSP narratives, and closing open POA&Ms before scheduling an assessment.
              </li>
            )}
            {ac.score < 50 && (
              <li className="text-red-700 flex gap-2">
                <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5 text-red-500" />
                Critical readiness gap — score below 50%. An immediate remediation sprint is recommended: identify unmet controls, create POA&Ms for each gap, and begin evidence collection before any assessment activities.
              </li>
            )}
          </ul>
        </CardContent>
      </Card>

      {/* ── PRINT FOOTER ─────────────────────────────────────────────────── */}
      <div className="hidden print:flex justify-between border-t pt-3 mt-6 text-xs text-gray-500">
        <span>CMMC Domain Readiness &amp; C3PAO Readiness Report — {data.org.name}</span>
        <span>
          Generated {new Date(data.reportDate).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })} · Control HUB
        </span>
      </div>
    </ReportShell>
  );
}
