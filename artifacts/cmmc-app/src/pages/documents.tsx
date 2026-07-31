import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  FileText, Library, Wand2, ChevronRight, BookOpen,
  ClipboardList, ShieldCheck, BarChart3, Table2,
  FileQuestion, Network, ScrollText, CheckCircle2,
  Clock, AlertCircle, Layers, Building2,
  CalendarDays, Download, ExternalLink, Loader2,
  FileStack, TrendingUp, Pencil,
} from "lucide-react";
import { useOrg } from "@/context/OrgContext";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { EvidenceUploadModal } from "@/components/evidence/EvidenceUploadModal";

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
    key: "POLICIES",
    label: "Policies",
    description: "Formal organizational policies establishing requirements and accountability.",
    icon: <BookOpen className="h-5 w-5" />,
    keywords: ["policy", "policies"],
    color: "bg-blue-50 border-blue-200 text-blue-700",
  },
  {
    key: "PROCEDURES",
    label: "Procedures",
    description: "Step-by-step operational procedures implementing policy requirements.",
    icon: <ClipboardList className="h-5 w-5" />,
    keywords: ["procedure", "procedures"],
    color: "bg-green-50 border-green-200 text-green-700",
  },
  {
    key: "STANDARDS",
    label: "Standards",
    description: "Technical and configuration standards defining baseline requirements.",
    icon: <ShieldCheck className="h-5 w-5" />,
    keywords: ["standard", "standards"],
    color: "bg-purple-50 border-purple-200 text-purple-700",
  },
  {
    key: "PLANS",
    label: "Plans",
    description: "Strategic and operational plans for security functions and programs.",
    icon: <Layers className="h-5 w-5" />,
    keywords: ["plan", "plans", "planning"],
    color: "bg-orange-50 border-orange-200 text-orange-700",
  },
  {
    key: "ASSESSMENTS_REPORTS",
    label: "Assessments & Reports",
    description: "Risk assessments, security reviews, audits, and evaluation reports.",
    icon: <BarChart3 className="h-5 w-5" />,
    keywords: ["assessment", "report", "review", "audit", "evaluation", "after action"],
    color: "bg-red-50 border-red-200 text-red-700",
  },
  {
    key: "MATRICES_REGISTERS",
    label: "Matrices & Registers",
    description: "Structured control matrices, responsibility assignments, and asset registers.",
    icon: <Table2 className="h-5 w-5" />,
    keywords: ["matrix", "matrices", "register", "inventory", "log"],
    color: "bg-amber-50 border-amber-200 text-amber-700",
  },
  {
    key: "FORMS_RECORDS",
    label: "Forms & Records",
    description: "Standardized forms, templates, and record-keeping documents.",
    icon: <FileQuestion className="h-5 w-5" />,
    keywords: ["form", "record", "checklist", "request", "ticket"],
    color: "bg-teal-50 border-teal-200 text-teal-700",
  },
  {
    key: "ARCHITECTURE",
    label: "Architecture & Diagrams",
    description: "System architecture, data flow diagrams, and boundary documentation.",
    icon: <Network className="h-5 w-5" />,
    keywords: ["architecture", "diagram", "data flow", "boundary", "network", "topology"],
    color: "bg-indigo-50 border-indigo-200 text-indigo-700",
  },
  {
    key: "SSP",
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
  return "OTHER";
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
    title: "Select Template",
    description: "Choose from applicable compliance templates across document categories.",
  },
  {
    n: 2,
    icon: <Building2 className="h-5 w-5" />,
    title: "Confirm Document Information",
    description: "Review org details, responsible roles, document number, version, and approver.",
  },
  {
    n: 3,
    icon: <CheckCircle2 className="h-5 w-5" />,
    title: "Review Auto-Filled Values",
    description: "Complete any missing fields, grouped by section, before generating.",
  },
  {
    n: 4,
    icon: <FileStack className="h-5 w-5" />,
    title: "Preview & Validate",
    description: "Inspect the formatted document; all required fields must be resolved.",
  },
  {
    n: 5,
    icon: <TrendingUp className="h-5 w-5" />,
    title: "Generate, Review & Link",
    description: "Create professional DOCX/PDF outputs and link automatically to controls.",
  },
];

// ── DOCUMENT PROFILE FIELDS ─────────────────────────────────────────────────────

interface ProfileField {
  key: string;
  label: string;
  placeholder?: string;
  readOnly?: boolean;
  section: string;
}

const PROFILE_FIELDS: ProfileField[] = [
  { key: "name", label: "Organization Name", readOnly: true, section: "identity" },
  { key: "legalName", label: "Legal Name", placeholder: "Full legal entity name", section: "identity" },
  { key: "organizationAddress", label: "Address", placeholder: "Street, City, State, ZIP", section: "identity" },
  { key: "cageCode", label: "CAGE Code", placeholder: "5-character CAGE code", section: "identity" },
  { key: "uei", label: "UEI", placeholder: "Unique Entity Identifier (12 chars)", section: "identity" },
  { key: "systemName", label: "System Name", placeholder: "e.g. Carme Tech CUI System", section: "system" },
  { key: "assessmentScope", label: "CMMC / NIST Scope Name", placeholder: "e.g. Carme Tech CUI Environment", section: "system" },
  { key: "systemOwner", label: "System Owner", placeholder: "Name and title", section: "roles" },
  { key: "securityOfficer", label: "Security Officer (ISSO)", placeholder: "Name and title", section: "roles" },
  { key: "itAdministrator", label: "IT Administrator", placeholder: "Name and title", section: "roles" },
  { key: "defaultClassification", label: "Default Classification", placeholder: "e.g. Internal Use Only — CUI", section: "defaults" },
  { key: "documentNumberPrefix", label: "Document Number Prefix", placeholder: "e.g. ACME or CT", section: "defaults" },
];

const SECTION_LABELS: Record<string, string> = {
  identity: "Organization Identity",
  system: "CUI System Information",
  roles: "Responsible Roles",
  defaults: "Document Defaults",
};

// ── DOC PROFILE DIALOG ─────────────────────────────────────────────────────────

function DocumentProfileDialog({
  open,
  onClose,
  orgId,
  fullOrg,
  onSaved,
  canEditProfile,
}: {
  open: boolean;
  onClose: () => void;
  orgId: string;
  fullOrg: Record<string, any> | null;
  onSaved: () => void;
  canEditProfile: boolean;
}) {
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {};
    for (const f of PROFILE_FIELDS) {
      initial[f.key] = (fullOrg?.[f.key] as string) ?? "";
    }
    return initial;
  });

  // Re-initialize form when fullOrg changes
  const [initialized, setInitialized] = useState(false);
  if (fullOrg && !initialized) {
    const initial: Record<string, string> = {};
    for (const f of PROFILE_FIELDS) {
      initial[f.key] = (fullOrg[f.key] as string) ?? "";
    }
    setForm(initial);
    setInitialized(true);
  }

  const handleSave = async () => {
    setSaving(true);
    try {
      const body: Record<string, string | null> = {};
      for (const f of PROFILE_FIELDS) {
        if (!f.readOnly) body[f.key] = form[f.key] || null;
      }
      const r = await fetch(`/api/organizations/${orgId}/profile`, {
        method: "PATCH",
        headers: { ...authHeaders(orgId), "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!r.ok) throw new Error((await r.json()).error ?? "Save failed");
      toast({ title: "Document profile saved" });
      onSaved();
      onClose();
    } catch (e: any) {
      toast({ title: "Save failed", description: e.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const sections = ["identity", "system", "roles", "defaults"];

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Organization Document Profile</DialogTitle>
          <DialogDescription>
            {canEditProfile
              ? "These values auto-fill every generated document. Complete as many fields as possible to reduce manual entry during document generation."
              : "These values auto-fill every generated document. Contact a Global Administrator to update this information."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-2">
          {sections.map((section) => {
            const fields = PROFILE_FIELDS.filter((f) => f.section === section);
            return (
              <div key={section}>
                <h3 className="text-sm font-semibold text-foreground mb-3 pb-1.5 border-b">
                  {SECTION_LABELS[section]}
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {fields.map((f) => (
                    <div key={f.key} className={cn("space-y-1", f.key === "organizationAddress" && "sm:col-span-2")}>
                      <Label htmlFor={`profile-${f.key}`} className="text-xs font-medium">
                        {f.label}
                        {f.readOnly && (
                          <span className="ml-1.5 text-[10px] text-muted-foreground font-normal">(managed in Organizations)</span>
                        )}
                      </Label>
                      {canEditProfile && !f.readOnly ? (
                        <Input
                          id={`profile-${f.key}`}
                          value={form[f.key] ?? ""}
                          onChange={(e) => setForm((prev) => ({ ...prev, [f.key]: e.target.value }))}
                          placeholder={f.placeholder}
                          disabled={saving}
                          className="text-sm"
                        />
                      ) : (
                        <div
                          id={`profile-${f.key}`}
                          className="text-sm px-3 py-2 rounded-md border bg-muted text-muted-foreground min-h-[36px]"
                        >
                          {form[f.key] || <span className="italic opacity-60">{f.placeholder ?? "Not set"}</span>}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            {canEditProfile ? "Cancel" : "Close"}
          </Button>
          {canEditProfile && (
            <Button onClick={handleSave} disabled={saving}>
              {saving ? <><Loader2 className="h-4 w-4 mr-1.5 animate-spin" />Saving…</> : "Save Profile"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── MAIN PAGE ───────────────────────────────────────────────────────────────────

export default function DocumentationCenter() {
  const { user } = useAuth();
  const { activeOrg } = useOrg();
  const orgId = activeOrg?.id;
  const queryClient = useQueryClient();
  const [expandProfile, setExpandProfile] = useState(false);
  const [profileDialogOpen, setProfileDialogOpen] = useState(false);
  const [uploadEvidenceOpen, setUploadEvidenceOpen] = useState(false);

  // Global Admins and org_admins of the active org may edit the organization profile.
  const canEditProfile = user?.role === "admin" || activeOrg?.role === "org_admin";

  const { data: templates = [], isLoading: templatesLoading } = useQuery({
    queryKey: ["doc-template-library-list", orgId],
    queryFn: async () => {
      const r = await fetch("/api/doc-templates/library", { headers: authHeaders(orgId) });
      if (!r.ok) return [];
      return r.json() as Promise<any[]>;
    },
    enabled: !!orgId,
  });

  // Package-aware resolver — gives us applicable template counts and active package keys
  const { data: resolverResult } = useQuery({
    queryKey: ["doc-template-resolver", orgId],
    queryFn: async () => {
      const r = await fetch("/api/doc-templates/resolver", { headers: authHeaders(orgId) });
      if (!r.ok) return null;
      return r.json() as Promise<{ activePackageKeys: string[]; total: number; templates: any[] }>;
    },
    enabled: !!orgId,
  });

  const { data: recentDocs = [], isLoading: recentLoading } = useQuery({
    queryKey: ["recent-generated-docs", orgId],
    queryFn: async () => {
      const r = await fetch("/api/documents", { headers: authHeaders(orgId) });
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

  const { data: fullOrg, refetch: refetchFullOrg } = useQuery({
    queryKey: ["org-full-profile", orgId],
    queryFn: async () => {
      const r = await fetch(`/api/organizations/${orgId}`, { headers: authHeaders(orgId) });
      if (!r.ok) return null;
      return r.json() as Promise<Record<string, any>>;
    },
    enabled: !!orgId,
  });

  // Use resolver count when available (package-aware), else fall back to full library
  const templateCount = resolverResult?.total ?? templates.length;
  const totalDocs = docStats?.totalDocuments ?? 0;
  const totalDraft = docStats?.totalDraft ?? 0;
  const totalPending = docStats?.totalPendingReview ?? 0;
  const totalApproved = (docStats?.totalApproved ?? 0) + (docStats?.totalActive ?? 0);

  // Package badges derived from org level or resolver result
  const activePackageKeys = resolverResult?.activePackageKeys ?? [];
  const isL1 = activeOrg?.cmmcTargetLevel === "L1" || activePackageKeys.some((k) => k.includes("L1") && !k.includes("L2"));
  const isL2 = activeOrg?.cmmcTargetLevel === "L2" || activePackageKeys.some((k) => k.includes("L2"));

  // Category breakdown — prefer resolver templates if available, else use library list
  const catSourceTemplates: any[] = resolverResult?.templates?.length ? resolverResult.templates : templates;
  const catCounts = new Map<string, number>();
  for (const t of catSourceTemplates) {
    const cat = categorizeTemplate(t.artifactTypeLabel ?? "", t.title ?? "");
    catCounts.set(cat, (catCounts.get(cat) ?? 0) + 1);
  }

  // Organization document profile completion (uses full org data)
  const profileFieldValues = PROFILE_FIELDS.map((f) => ({
    ...f,
    value: (fullOrg?.[f.key] as string) ?? null,
  }));
  const editableFields = profileFieldValues.filter((f) => !f.readOnly);
  const filledCount = editableFields.filter((f) => f.value).length;
  const profilePct = editableFields.length > 0
    ? Math.round((filledCount / editableFields.length) * 100)
    : 0;

  const displayFields = expandProfile ? profileFieldValues : profileFieldValues.slice(0, 6);

  return (
    <div className="space-y-8">
      {/* Profile dialog — only mounted for Global Admins (edit) or when explicitly opened for read-only view) */}
      {orgId && (
        <DocumentProfileDialog
          open={profileDialogOpen}
          onClose={() => setProfileDialogOpen(false)}
          orgId={orgId}
          fullOrg={fullOrg ?? null}
          canEditProfile={canEditProfile}
          onSaved={() => {
            refetchFullOrg();
            queryClient.invalidateQueries({ queryKey: ["org-full-profile", orgId] });
          }}
        />
      )}

      {/* ── PAGE HEADER ────────────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Documentation Center</h1>
          <p className="text-muted-foreground mt-1.5 max-w-2xl">
            Create controlled policies, procedures, plans, assessments, matrices, registers, and other
            compliance documents. Generated documents are automatically stored as evidence and linked
            to their applicable controls.
          </p>
          {/* Package badges */}
          <div className="flex flex-wrap gap-1.5 mt-2">
            {isL1 && (
              <>
                <Badge className="text-xs bg-blue-100 text-blue-700 border-blue-200">CMMC Level 1</Badge>
                <Badge className="text-xs bg-blue-50 text-blue-600 border-blue-200">FCI</Badge>
              </>
            )}
            {isL2 && (
              <>
                <Badge className="text-xs bg-indigo-100 text-indigo-700 border-indigo-200">CMMC Level 2</Badge>
                <Badge className="text-xs bg-indigo-50 text-indigo-600 border-indigo-200">NIST SP 800-171</Badge>
                <Badge className="text-xs bg-indigo-50 text-indigo-600 border-indigo-200">CUI</Badge>
              </>
            )}
            {!isL1 && !isL2 && activeOrg && (
              <Badge variant="outline" className="text-xs text-muted-foreground">No packages configured</Badge>
            )}
          </div>
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
          { label: "Available Templates", value: templateCount, icon: Library, color: "text-blue-600 bg-blue-50", href: undefined },
          {
            label: "Generated This Month",
            value: recentDocs.filter((d: any) => {
              const created = new Date(d.createdAt);
              const now = new Date();
              return created.getMonth() === now.getMonth() && created.getFullYear() === now.getFullYear();
            }).length,
            icon: TrendingUp,
            color: "text-emerald-600 bg-emerald-50",
            href: undefined,
          },
          { label: "Draft Documents", value: totalDraft, icon: FileText, color: "text-gray-600 bg-gray-50", href: undefined },
          { label: "Pending Review", value: totalPending, icon: Clock, color: "text-amber-600 bg-amber-50", href: "/documents/reviews" },
          { label: "Approved / Active", value: totalApproved, icon: CheckCircle2, color: "text-green-600 bg-green-50", href: undefined },
          { label: "Total Generated", value: totalDocs, icon: Layers, color: "text-purple-600 bg-purple-50", href: undefined },
        ].map((card) => (
          card.href ? (
            <Link key={card.label} href={card.href}>
              <Card className="text-center hover:shadow-md transition-shadow cursor-pointer">
                <CardContent className="pt-4 pb-3">
                  <div className={cn("h-8 w-8 rounded-full flex items-center justify-center mx-auto mb-2", card.color)}>
                    <card.icon className="h-4 w-4" />
                  </div>
                  <p className="text-2xl font-bold">{card.value}</p>
                  <p className="text-[11px] text-muted-foreground mt-0.5 leading-tight">{card.label}</p>
                </CardContent>
              </Card>
            </Link>
          ) : (
            <Card key={card.label} className="text-center">
              <CardContent className="pt-4 pb-3">
                <div className={cn("h-8 w-8 rounded-full flex items-center justify-center mx-auto mb-2", card.color)}>
                  <card.icon className="h-4 w-4" />
                </div>
                <p className="text-2xl font-bold">{card.value}</p>
                <p className="text-[11px] text-muted-foreground mt-0.5 leading-tight">{card.label}</p>
              </CardContent>
            </Card>
          )
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
                  <Link href={`/documents/templates?category=${cat.key}`}>
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
              {displayFields.map((f) => (
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
              {canEditProfile && (
                <div className="pt-2">
                  <Button
                    size="sm"
                    variant={profilePct < 100 ? "default" : "outline"}
                    className="w-full text-xs"
                    onClick={() => setProfileDialogOpen(true)}
                  >
                    <Pencil className="h-3.5 w-3.5 mr-1.5" />
                    {profilePct === 0 ? "Complete Document Profile" : profilePct < 100 ? "Finish Document Profile" : "Edit Document Profile"}
                  </Button>
                </div>
              )}
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
            <Button
              variant="outline"
              size="sm"
              className="shrink-0"
              onClick={() => setUploadEvidenceOpen(true)}
            >
              <Download className="h-3.5 w-3.5 mr-1.5" />
              Upload to Evidence
            </Button>
          </div>
        </CardContent>
      </Card>

      <EvidenceUploadModal
        open={uploadEvidenceOpen}
        onClose={() => setUploadEvidenceOpen(false)}
        onSaved={() => setUploadEvidenceOpen(false)}
      />
    </div>
  );
}
