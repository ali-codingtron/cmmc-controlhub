import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  FileText, Library, Wand2, ChevronRight, BookOpen,
  ClipboardList, ShieldCheck, BarChart3, Table2,
  FileQuestion, Network, ScrollText, CheckCircle2,
  Clock, AlertCircle, Layers, Building2, User,
  CalendarDays, Download, Eye, ExternalLink, Loader2,
  FileStack, TrendingUp,
} from "lucide-react";
import { useOrg } from "@/context/OrgContext";
import { cn } from "@/lib/utils";

function authHeaders(orgId?: string): Record<string, string> {
  const token = localStorage.getItem("auth_token");
  const h: Record<string, string> = {};
  if (token) h["Authorization"] = `Bearer ${token}`;
  if (orgId) h["X-Organization-ID"] = orgId;
  return h;
}

// ── Template category definitions ──────────────────────────────────────────────

interface TemplateCategory {
  key: string;
  label: string;
  description: string;
  icon: React.ReactNode;
  keywords: string[];
  color: string;
}

const TEMPLATE_CATEGORIES: TemplateCategory[] = [
  {
    key: "policy",
    label: "Policies",
    description: "Formal organizational policies establishing requirements and accountability.",
    icon: <BookOpen className="h-5 w-5" />,
    keywords: ["policy", "policies"],
    color: "bg-blue-50 border-blue-200 text-blue-700",
  },
  {
    key: "procedure",
    label: "Procedures",
    description: "Step-by-step operational procedures implementing policy requirements.",
    icon: <ClipboardList className="h-5 w-5" />,
    keywords: ["procedure", "procedures"],
    color: "bg-green-50 border-green-200 text-green-700",
  },
  {
    key: "standard",
    label: "Standards",
    description: "Technical and configuration standards defining baseline requirements.",
    icon: <ShieldCheck className="h-5 w-5" />,
    keywords: ["standard", "standards"],
    color: "bg-purple-50 border-purple-200 text-purple-700",
  },
  {
    key: "plan",
    label: "Plans",
    description: "Strategic and operational plans for security functions and programs.",
    icon: <Layers className="h-5 w-5" />,
    keywords: ["plan", "plans", "planning"],
    color: "bg-orange-50 border-orange-200 text-orange-700",
  },
  {
    key: "assessment",
    label: "Assessments & Reports",
    description: "Risk assessments, security reviews, audits, and evaluation reports.",
    icon: <BarChart3 className="h-5 w-5" />,
    keywords: ["assessment", "report", "review", "audit", "evaluation", "after action"],
    color: "bg-red-50 border-red-200 text-red-700",
  },
  {
    key: "matrix",
    label: "Matrices & Registers",
    description: "Structured control matrices, responsibility assignments, and asset registers.",
    icon: <Table2 className="h-5 w-5" />,
    keywords: ["matrix", "matrices", "register", "inventory", "log"],
    color: "bg-amber-50 border-amber-200 text-amber-700",
  },
  {
    key: "form",
    label: "Forms & Records",
    description: "Standardized forms, templates, and record-keeping documents.",
    icon: <FileQuestion className="h-5 w-5" />,
    keywords: ["form", "record", "checklist", "request", "ticket"],
    color: "bg-teal-50 border-teal-200 text-teal-700",
  },
  {
    key: "architecture",
    label: "Architecture & Diagrams",
    description: "System architecture, data flow diagrams, and boundary documentation.",
    icon: <Network className="h-5 w-5" />,
    keywords: ["architecture", "diagram", "data flow", "boundary", "network", "topology"],
    color: "bg-indigo-50 border-indigo-200 text-indigo-700",
  },
  {
    key: "ssp",
    label: "SSP & Long-Form",
    description: "System Security Plans and comprehensive multi-section controlled documents.",
    icon: <ScrollText className="h-5 w-5" />,
    keywords: ["ssp", "system security plan", "security plan", "long-form"],
    color: "bg-slate-50 border-slate-200 text-slate-700",
  },
];

function categorizeTemplate(artifactTypeLabel: string, title: string): string {
  const text = `${artifactTypeLabel} ${title}`.toLowerCase();
  for (const cat of TEMPLATE_CATEGORIES) {
    if (cat.keywords.some((k) => text.includes(k))) return cat.key;
  }
  return "other";
}

const STATUS_STYLES: Record<string, string> = {
  draft: "bg-gray-100 text-gray-700",
  pending_review: "bg-yellow-100 text-yellow-700",
  approved: "bg-blue-100 text-blue-700",
  active: "bg-green-100 text-green-700",
  assessor_ready: "bg-purple-100 text-purple-700",
  needs_update: "bg-orange-100 text-orange-700",
  expired: "bg-red-100 text-red-700",
  superseded: "bg-purple-100 text-purple-700",
  archived: "bg-slate-100 text-slate-600",
};

// ── WORKFLOW STEPS ──────────────────────────────────────────────────────────────

const WORKFLOW_STEPS = [
  {
    n: 1,
    icon: <Library className="h-5 w-5" />,
    title: "Select a Template",
    description: "Choose the type of controlled document you need from the library of 67+ CMMC L2 templates.",
  },
  {
    n: 2,
    icon: <Building2 className="h-5 w-5" />,
    title: "Confirm Organization Information",
    description: "Review your organization details, responsible roles, document number, version, and approval information.",
  },
  {
    n: 3,
    icon: <Eye className="h-5 w-5" />,
    title: "Review & Preview",
    description: "Complete any missing fields and inspect the formatted document before generation.",
  },
  {
    n: 4,
    icon: <CheckCircle2 className="h-5 w-5" />,
    title: "Generate & Link to Controls",
    description: "Create professional DOCX and PDF outputs and automatically link the generated document to the relevant CMMC controls.",
  },
];

// ── DOCUMENT PROFILE FIELDS ─────────────────────────────────────────────────────

const PROFILE_FIELDS = [
  { key: "name", label: "Organization Name" },
  { key: "legalName", label: "Legal Name" },
  { key: "address", label: "Address" },
  { key: "cageCode", label: "CAGE Code" },
  { key: "uei", label: "UEI" },
  { key: "systemName", label: "System Name" },
  { key: "cmmcScopeName", label: "CMMC / NIST Scope Name" },
  { key: "systemOwner", label: "System Owner" },
  { key: "securityOfficer", label: "Security Officer" },
  { key: "itAdministrator", label: "IT Administrator" },
  { key: "defaultClassification", label: "Default Classification" },
  { key: "documentNumberPrefix", label: "Document Number Prefix" },
];

// ── MAIN PAGE ───────────────────────────────────────────────────────────────────

export default function DocumentationCenter() {
  const { activeOrg } = useOrg();
  const orgId = activeOrg?.id;
  const [expandProfile, setExpandProfile] = useState(false);

  const { data: templates = [], isLoading: templatesLoading } = useQuery({
    queryKey: ["doc-template-library-list"],
    queryFn: async () => {
      const r = await fetch("/api/doc-templates/library", { headers: authHeaders(orgId) });
      if (!r.ok) return [];
      return r.json() as Promise<any[]>;
    },
    enabled: !!orgId,
  });

  const { data: recentDocs = [], isLoading: recentLoading } = useQuery({
    queryKey: ["recent-generated-docs", orgId],
    queryFn: async () => {
      const r = await fetch("/api/documents?limit=10&generated=true", { headers: authHeaders(orgId) });
      if (!r.ok) return [];
      const all = await r.json() as any[];
      return all.filter((d: any) => d.templateId).slice(0, 10);
    },
    enabled: !!orgId,
  });

  const { data: docStats } = useQuery({
    queryKey: ["doc-automation-status", orgId],
    queryFn: async () => {
      const r = await fetch("/api/automation/doc-status", { headers: authHeaders(orgId) });
      if (!r.ok) return null;
      return r.json();
    },
    enabled: !!orgId,
  });

  const templateCount = templates.length;
  const totalDocs = docStats?.totalDocuments ?? 0;
  const totalDraft = docStats?.totalDraft ?? 0;
  const totalPending = docStats?.totalPendingReview ?? 0;
  const totalApproved = (docStats?.totalApproved ?? 0) + (docStats?.totalActive ?? 0);

  // Category breakdown
  const catCounts = new Map<string, number>();
  for (const t of templates) {
    const cat = categorizeTemplate(t.artifactTypeLabel ?? "", t.title ?? "");
    catCounts.set(cat, (catCounts.get(cat) ?? 0) + 1);
  }

  // Organization document profile completion
  const org = activeOrg as any;
  const profileFieldValues = PROFILE_FIELDS.map((f) => ({
    ...f,
    value: org?.[f.key] ?? null,
  }));
  const filledCount = profileFieldValues.filter((f) => f.value).length;
  const profilePct = PROFILE_FIELDS.length > 0 ? Math.round((filledCount / PROFILE_FIELDS.length) * 100) : 0;

  return (
    <div className="space-y-8">
      {/* ── PAGE HEADER ────────────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Documentation Center</h1>
          <p className="text-muted-foreground mt-1.5 max-w-2xl">
            Create controlled policies, procedures, plans, assessments, matrices, registers, and other
            compliance documents. Generated documents are automatically stored as evidence and linked
            to their applicable controls.
          </p>
        </div>
        <div className="flex gap-2 shrink-0">
          <Button variant="outline" asChild>
            <Link href="/documents/templates">
              <Library className="h-4 w-4 mr-2" />
              Browse Templates
            </Link>
          </Button>
          <Button asChild>
            <Link href="/documents/generate">
              <Wand2 className="h-4 w-4 mr-2" />
              Generate Document
            </Link>
          </Button>
        </div>
      </div>

      {/* ── QUICK-START WORKFLOW ────────────────────────────────────────────────── */}
      <Card className="border-primary/20 bg-primary/3">
        <CardHeader className="pb-4">
          <CardTitle className="text-base flex items-center gap-2">
            <FileStack className="h-4 w-4 text-primary" />
            Document Generation Workflow
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {WORKFLOW_STEPS.map((step, i) => (
              <div key={step.n} className="flex gap-3">
                <div className="flex flex-col items-center">
                  <div className="h-9 w-9 rounded-full bg-primary/10 text-primary flex items-center justify-center shrink-0">
                    {step.icon}
                  </div>
                  {i < WORKFLOW_STEPS.length - 1 && (
                    <div className="w-px flex-1 bg-primary/15 mt-2 hidden lg:block" />
                  )}
                </div>
                <div className="flex-1 min-w-0 pb-2">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-0.5">
                    Step {step.n}
                  </p>
                  <p className="text-sm font-semibold leading-snug">{step.title}</p>
                  <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{step.description}</p>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* ── SUMMARY STATS ──────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {[
          { label: "Available Templates", value: templateCount, icon: Library, color: "text-blue-600 bg-blue-50" },
          { label: "Generated This Month", value: recentDocs.filter((d: any) => {
            const created = new Date(d.createdAt);
            const now = new Date();
            return created.getMonth() === now.getMonth() && created.getFullYear() === now.getFullYear();
          }).length, icon: TrendingUp, color: "text-emerald-600 bg-emerald-50" },
          { label: "Draft Documents", value: totalDraft, icon: FileText, color: "text-gray-600 bg-gray-50" },
          { label: "Pending Review", value: totalPending, icon: Clock, color: "text-amber-600 bg-amber-50" },
          { label: "Approved / Active", value: totalApproved, icon: CheckCircle2, color: "text-green-600 bg-green-50" },
          { label: "Total Generated", value: totalDocs, icon: Layers, color: "text-purple-600 bg-purple-50" },
        ].map((card) => (
          <Card key={card.label} className="text-center">
            <CardContent className="pt-4 pb-3">
              <div className={cn("h-8 w-8 rounded-full flex items-center justify-center mx-auto mb-2", card.color)}>
                <card.icon className="h-4 w-4" />
              </div>
              <p className="text-2xl font-bold">{card.value}</p>
              <p className="text-[11px] text-muted-foreground mt-0.5 leading-tight">{card.label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* ── TEMPLATE CATEGORIES ─────────────────────────────────────────────────── */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-lg font-semibold">Template Categories</h2>
            <p className="text-sm text-muted-foreground mt-0.5">
              {templateCount} templates across {TEMPLATE_CATEGORIES.length} categories
            </p>
          </div>
          <Button variant="outline" size="sm" asChild>
            <Link href="/documents/templates">
              <Library className="h-3.5 w-3.5 mr-1.5" />
              Browse All
            </Link>
          </Button>
        </div>

        {templatesLoading ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {[...Array(9)].map((_, i) => (
              <Card key={i}><CardContent className="pt-5"><div className="h-20 animate-pulse bg-muted rounded" /></CardContent></Card>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {TEMPLATE_CATEGORIES.map((cat) => {
              const count = catCounts.get(cat.key) ?? 0;
              return (
                <Card key={cat.key} className="hover:shadow-md transition-shadow cursor-pointer group">
                  <Link href={`/documents/templates?type=${encodeURIComponent(cat.key)}`}>
                    <CardContent className="pt-4 pb-4">
                      <div className="flex items-start gap-3">
                        <div className={cn("h-9 w-9 rounded-lg flex items-center justify-center shrink-0 border", cat.color)}>
                          {cat.icon}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-semibold leading-tight">{cat.label}</p>
                            {count > 0 && (
                              <Badge variant="secondary" className="text-[10px] h-4 px-1.5 shrink-0">
                                {count}
                              </Badge>
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground mt-0.5 leading-snug line-clamp-2">
                            {cat.description}
                          </p>
                        </div>
                      </div>
                      <div className="mt-3 flex items-center gap-1 text-xs text-primary group-hover:gap-1.5 transition-all">
                        Browse Templates
                        <ChevronRight className="h-3 w-3" />
                      </div>
                    </CardContent>
                  </Link>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {/* ── TWO-COLUMN: PROFILE + RECENTLY GENERATED ─────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">

        {/* Organization Document Profile */}
        <div className="lg:col-span-2">
          <Card className={cn(
            "h-full",
            profilePct < 50 ? "border-amber-200" : profilePct < 90 ? "border-blue-200" : "border-emerald-200"
          )}>
            <CardHeader className="pb-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <CardTitle className="text-sm font-semibold">Organization Document Profile</CardTitle>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Controls values used to auto-fill generated documents.
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <p className={cn(
                    "text-lg font-bold",
                    profilePct < 50 ? "text-amber-600" : profilePct < 90 ? "text-blue-600" : "text-emerald-600"
                  )}>
                    {profilePct}%
                  </p>
                  <p className="text-[10px] text-muted-foreground">complete</p>
                </div>
              </div>
              <Progress
                value={profilePct}
                className={cn(
                  "h-1.5 mt-1",
                  profilePct < 50 ? "[&>div]:bg-amber-500" : profilePct < 90 ? "[&>div]:bg-blue-500" : "[&>div]:bg-emerald-500"
                )}
              />
            </CardHeader>
            <CardContent className="space-y-1.5">
              {(expandProfile ? profileFieldValues : profileFieldValues.slice(0, 6)).map((f) => (
                <div key={f.key} className="flex items-center justify-between gap-2 text-xs py-0.5">
                  <span className="text-muted-foreground shrink-0">{f.label}</span>
                  {f.value ? (
                    <span className="font-medium text-right truncate max-w-[140px]">{f.value}</span>
                  ) : (
                    <span className="text-amber-600 flex items-center gap-1 shrink-0">
                      <AlertCircle className="h-3 w-3" />
                      Missing
                    </span>
                  )}
                </div>
              ))}
              {profileFieldValues.length > 6 && (
                <button
                  onClick={() => setExpandProfile((v) => !v)}
                  className="text-xs text-primary hover:underline mt-1"
                >
                  {expandProfile ? "Show less" : `Show ${profileFieldValues.length - 6} more fields`}
                </button>
              )}
              <div className="pt-2">
                <Button size="sm" variant="outline" className="w-full text-xs" asChild>
                  <Link href="/settings">
                    <User className="h-3.5 w-3.5 mr-1.5" />
                    Complete Document Profile
                  </Link>
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Recently Generated */}
        <div className="lg:col-span-3">
          <Card className="h-full">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-semibold">Recently Generated Documents</CardTitle>
                <Button variant="ghost" size="sm" asChild className="h-7 text-xs">
                  <Link href="/evidence">View in Evidence</Link>
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {recentLoading ? (
                <div className="space-y-2">
                  {[...Array(4)].map((_, i) => (
                    <div key={i} className="h-10 animate-pulse bg-muted rounded" />
                  ))}
                </div>
              ) : recentDocs.length === 0 ? (
                <div className="text-center py-8">
                  <Wand2 className="h-8 w-8 text-muted-foreground/40 mx-auto mb-3" />
                  <p className="text-sm text-muted-foreground font-medium">No generated documents yet</p>
                  <p className="text-xs text-muted-foreground mt-1 mb-4">
                    Use a template to generate your first controlled document.
                  </p>
                  <Button size="sm" asChild>
                    <Link href="/documents/generate">
                      <Wand2 className="h-3.5 w-3.5 mr-1.5" />
                      Generate First Document
                    </Link>
                  </Button>
                </div>
              ) : (
                <div className="space-y-1">
                  {recentDocs.map((doc: any) => (
                    <div
                      key={doc.id}
                      className="flex items-center gap-3 px-2 py-2 rounded-lg hover:bg-muted/40 transition-colors group"
                    >
                      <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{doc.title}</p>
                        <p className="text-xs text-muted-foreground">
                          {doc.docType?.replace(/_/g, " ")}
                          {doc.templateTitle && (
                            <span className="ml-1.5 text-muted-foreground/70">{doc.templateTitle}</span>
                          )}
                          {doc.createdAt && (
                            <span className="ml-1.5">
                              · <CalendarDays className="h-3 w-3 inline-block -mt-0.5" />{" "}
                              {new Date(doc.createdAt).toLocaleDateString()}
                            </span>
                          )}
                        </p>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <Badge
                          className={cn("text-[10px] h-5 px-1.5", STATUS_STYLES[doc.status] ?? "bg-gray-100 text-gray-700")}
                          variant="outline"
                        >
                          {(doc.status ?? "draft").replace(/_/g, " ")}
                        </Badge>
                        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <Link href={`/documents/${doc.id}`}>
                            <Button variant="ghost" size="sm" className="h-6 w-6 p-0">
                              <ExternalLink className="h-3 w-3" />
                            </Button>
                          </Link>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* ── HELP CALLOUT ───────────────────────────────────────────────────────── */}
      <Card className="bg-muted/30 border-dashed">
        <CardContent className="py-4">
          <div className="flex flex-col sm:flex-row sm:items-center gap-4">
            <div className="flex-1">
              <p className="text-sm font-semibold">Have a completed policy or procedure to upload?</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Upload existing documents directly to the Evidence Repository and link them to controls.
                The Documentation Center is for generating new controlled documents from templates.
              </p>
            </div>
            <Button variant="outline" size="sm" className="shrink-0" asChild>
              <Link href="/evidence/upload">
                <Download className="h-3.5 w-3.5 mr-1.5" />
                Upload to Evidence
              </Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
