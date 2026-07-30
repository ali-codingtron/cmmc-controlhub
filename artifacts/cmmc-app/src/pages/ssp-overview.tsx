import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useOrg } from "@/context/OrgContext";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Link, useLocation } from "wouter";
import {
  FileText,
  ShieldCheck,
  CheckCircle2,
  BookOpen,
  ClipboardList,
  ExternalLink,
  Loader2,
  Upload,
  RefreshCw,
  Download,
  FileDown,
  AlertTriangle,
  Wand2,
  Shield,
  Info,
  Trash2,
  Clock,
  RotateCcw,
  PlayCircle,
} from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
interface SSPTemplate {
  templateKey: string;
  name: string;
  shortDescription: string;
  framework: string;
  cmmcLevel: 1 | 2;
  protectedInfoType: "FCI" | "CUI";
  templateVersion: string;
  downloadFilename: string;
  badges: string[];
  templateFacts: { label: string; value: string }[];
  warningText?: string;
  sections: string[];
  recommended: boolean;
}

interface SspDocument {
  id: string;
  title: string;
  documentNumber: string | null;
  revisionNumber: string | null;
  revisionDate: string | null;
  preparedBy: string | null;
  reviewedBy: string | null;
  approvedBy: string | null;
  organization: string | null;
  systemName: string | null;
  systemOwner: string | null;
  cmmcLevel: string | null;
  status: string;
  isPrimary: boolean;
  extractedAt: string | null;
  nextReviewDate: string | null;
  fileKey?: string | null;
  originalFileName?: string | null;
}

interface SspStats {
  totalSections: number;
  completeSections: number;
  totalMappings: number;
  editedMappings: number;
  withNarrative: number;
  totalControls: number;
}

interface PrefillDraft {
  id: string;
  templateKey: string;
  title: string;
  status: string;
  wizardStep: number;
  updatedAt: string;
  createdAt: string;
}
const STATUS_COLORS: Record<string, string> = {
  draft: "bg-yellow-100 text-yellow-800 border-yellow-200",
  review: "bg-blue-100 text-blue-800 border-blue-200",
  approved: "bg-green-100 text-green-800 border-green-200",
  superseded: "bg-gray-100 text-gray-600 border-gray-200",
};

function apiHeaders(orgId?: string) {
  const token = localStorage.getItem("auth_token");
  return {
    Authorization: `Bearer ${token}`,
    ...(orgId ? { "X-Organization-ID": orgId } : {}),
  };
}

const TEMPLATE_SECTIONS = [
  "Cover page and document-control table",
  "Revision history",
  "Reference authorities",
  "Table of contents",
  "Purpose, authority, and status",
  "Organization and system overview",
  "Assessment scope and system boundary",
  "CUI lifecycle and handling rules",
  "Security architecture",
  "Roles and responsibilities",
  "Security requirement implementation summary",
  "DFARS compliance status",
  "Not Applicable rationale section",
  "POA&M and risk-treatment section",
  "External services and customer responsibilities",
  "Continuous monitoring and evidence management",
  "Incident response and external reporting",
  "SSP maintenance and approval",
  "All 110 NIST SP 800-171 Rev. 2 requirements",
  "NIST SP 800-53 source-control mappings",
  "Implementation narrative fields",
  "Evidence and test-expectation fields",
  "Assessment attachment register",
  'NIST SP 800-171A "Determine if" objective checklist',
];

function TemplateContentsDialog({
  open,
  onClose,
  template,
  onDownload,
  downloading,
}: {
  open: boolean;
  onClose: () => void;
  template: SSPTemplate;
  onDownload: () => void;
  downloading: boolean;
}) {
  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileDown className="h-5 w-5 text-blue-600" />
            {template.name}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 text-sm">
          <div className="flex flex-wrap gap-1.5">
            {template.badges.map((b) => (
              <Badge key={b} variant="secondary" className="text-xs">{b}</Badge>
            ))}
          </div>

          <p className="text-muted-foreground">This template contains the following sections:</p>

          <ul className="space-y-1.5">
            {template.sections.map((s) => (
              <li key={s} className="flex items-start gap-2 text-sm">
                <CheckCircle2 className="h-3.5 w-3.5 mt-0.5 text-green-500 flex-shrink-0" />
                <span>{s}</span>
              </li>
            ))}
          </ul>

          {template.warningText && (
            <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-amber-800 text-xs space-y-1">
              <p className="font-medium">Important notice</p>
              <p>{template.warningText}</p>
            </div>
          )}

          <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-amber-800 text-xs">
            <p className="font-medium mb-1">No compliance assertions included</p>
            <p>
              Each organization must replace the placeholders, document its actual
              implementation, identify supporting evidence, complete status determinations,
              and obtain the required approval.
            </p>
          </div>

          <div className="flex gap-2 pt-1">
            <Button onClick={onDownload} disabled={downloading} className="flex-1">
              {downloading ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Download className="h-4 w-4 mr-2" />
              )}
              Download Template
            </Button>
            <Button variant="outline" onClick={onClose}>Close</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function SspTemplateCard({
  template,
  orgId,
}: {
  template: SSPTemplate;
  orgId: string;
}) {
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const [downloading, setDownloading] = useState(false);
  const [contentsOpen, setContentsOpen] = useState(false);

  async function handleDownload() {
    setDownloading(true);
    try {
      const r = await fetch(`/api/ssp/templates/${template.templateKey}/download`, {
        headers: apiHeaders(orgId),
      });
      if (!r.ok) {
        const err = await r.json().catch(() => ({}));
        throw new Error(
          (err as { error?: string }).error ||
            "The SSP template is temporarily unavailable."
        );
      }
      const blob = await r.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = template.downloadFilename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast({ title: "Template downloaded", description: template.name });
    } catch (e: unknown) {
      toast({
        title: "Download failed",
        description: e instanceof Error ? e.message : "Template unavailable.",
        variant: "destructive",
      });
    } finally {
      setDownloading(false);
    }
  }

  const borderColor = template.cmmcLevel === 1 ? "border-emerald-200" : "border-blue-200";
  const bgGradient = template.cmmcLevel === 1
    ? "bg-gradient-to-br from-emerald-50/60 to-white"
    : "bg-gradient-to-br from-blue-50/60 to-white";
  const iconBg = template.cmmcLevel === 1 ? "bg-emerald-100" : "bg-blue-100";
  const iconColor = template.cmmcLevel === 1 ? "text-emerald-700" : "text-blue-700";

  return (
    <>
      <TemplateContentsDialog
        open={contentsOpen}
        onClose={() => setContentsOpen(false)}
        template={template}
        onDownload={handleDownload}
        downloading={downloading}
      />

      <Card className={`${borderColor} ${bgGradient}`}>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <div className={`p-1.5 ${iconBg} rounded-md`}>
              {template.cmmcLevel === 1
                ? <Shield className={`h-4 w-4 ${iconColor}`} />
                : <FileDown className={`h-4 w-4 ${iconColor}`} />
              }
            </div>
            <span>{template.name}</span>
            {template.recommended && (
              <Badge className="ml-auto text-xs bg-blue-600">Recommended</Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground leading-relaxed">
            {template.shortDescription}
          </p>

          <div className="flex flex-wrap gap-1.5">
            {template.badges.map((b) => (
              <Badge key={b} variant="secondary" className="text-xs">{b}</Badge>
            ))}
          </div>

          <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-muted-foreground py-1">
            {template.templateFacts.map((f) => (
              <span key={f.label}>
                <span className="font-medium text-foreground">{f.label}:</span> {f.value}
              </span>
            ))}
          </div>

          <div className="flex flex-wrap gap-2 pt-1">
            <Button
              size="sm"
              onClick={() => navigate(`/ssp/prefill-wizard?templateKey=${template.templateKey}`)}
            >
              <Wand2 className="h-3.5 w-3.5 mr-1.5" />
              Pre-fill &amp; Generate
            </Button>
            <Button onClick={handleDownload} disabled={downloading} variant="outline" size="sm">
              {downloading ? (
                <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
              ) : (
                <Download className="h-3.5 w-3.5 mr-1.5" />
              )}
              Blank Template
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setContentsOpen(true)}
            >
              <Info className="h-3.5 w-3.5 mr-1.5" />
              Contents
            </Button>
          </div>

          {template.warningText && (
            <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50/80 px-3 py-2 text-amber-800 text-xs">
              <AlertTriangle className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
              <span>{template.warningText}</span>
            </div>
          )}
        </CardContent>
      </Card>
    </>
  );
}

const TOTAL_STEPS = 8;

function SspResourcesCard() {
  const { activeOrg } = useOrg();

  const { data: templates, isLoading } = useQuery<SSPTemplate[]>({
    queryKey: ["ssp-templates", activeOrg?.id],
    queryFn: async () => {
      const r = await fetch("/api/ssp/templates", { headers: apiHeaders(activeOrg?.id) });
      if (!r.ok) return [];
      return r.json();
    },
    enabled: !!activeOrg?.id,
  });

  if (isLoading) {
    return (
      <Card className="border-dashed">
        <CardContent className="flex items-center gap-3 py-8 justify-center text-muted-foreground text-sm">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading SSP templates…
        </CardContent>
      </Card>
    );
  }

  if (!templates || templates.length === 0) {
    return (
      <Card className="border-dashed">
        <CardContent className="py-8 text-center space-y-2">
          <FileDown className="h-8 w-8 mx-auto text-muted-foreground/40" />
          <p className="text-sm font-medium text-muted-foreground">No SSP templates available</p>
          <p className="text-xs text-muted-foreground">
            SSP templates become available once compliance packages are assigned to your organization.
            Contact your administrator to assign CMMC Level 1 or Level 2 packages.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {templates.map((tmpl) => (
        <SspTemplateCard key={tmpl.templateKey} template={tmpl} orgId={activeOrg?.id ?? ""} />
      ))}
    </div>
  );
}

export default function SspOverview() {
  const { activeOrg } = useOrg();
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data: primary, isLoading } = useQuery<SspDocument | null>({
    queryKey: ["ssp-primary", activeOrg?.id],
    queryFn: async () => {
      const r = await fetch("/api/ssp/primary", { headers: apiHeaders(activeOrg?.id) });
      if (!r.ok) return null;
      return r.json();
    },
    enabled: !!activeOrg?.id,
  });

  const { data: stats } = useQuery<SspStats>({
    queryKey: ["ssp-stats", primary?.id],
    queryFn: async () => {
      const r = await fetch(`/api/ssp/${primary!.id}/stats`, { headers: apiHeaders(activeOrg?.id) });
      if (!r.ok) return { totalSections: 0, completeSections: 0, totalMappings: 0, editedMappings: 0, withNarrative: 0 };
      return r.json();
    },
    enabled: !!primary?.id && !!activeOrg?.id,
  });

  const parseMutation = useMutation({
    mutationFn: async (id: string) => {
      const r = await fetch(`/api/ssp/${id}/parse`, {
        method: "POST",
        headers: apiHeaders(activeOrg?.id),
      });
      if (!r.ok) throw new Error("Parse failed");
      return r.json();
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["ssp-primary", activeOrg?.id] });
      qc.invalidateQueries({ queryKey: ["ssp-stats", primary?.id] });
      toast({
        title: "Parsing complete",
        description: `Extracted ${data.sectionsCount} sections and ${data.mappingsCount} control mappings`,
      });
    },
    onError: () => toast({ title: "Parse failed", variant: "destructive" }),
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-7 w-7 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!primary) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold">SSP Overview</h1>
          <p className="text-muted-foreground text-sm mt-1">System Security Plan dashboard</p>
        </div>

        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <FileText className="h-14 w-14 text-muted-foreground/25 mb-4" />
            <p className="font-semibold text-lg">No SSP document yet</p>
            <p className="text-sm text-muted-foreground mt-1 mb-6">
              Upload your System Security Plan to get started with structured control tracking
            </p>
            <Link href="/ssp/documents">
              <Button>
                <Upload className="h-4 w-4 mr-2" />
                Upload SSP
              </Button>
            </Link>
          </CardContent>
        </Card>

        <SspDraftsCard />
        <SspResourcesCard />
      </div>
    );
  }

  const pct = (stats?.completeSections ?? 0) / Math.max(stats?.totalSections ?? 1, 1);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold">SSP Overview</h1>
          <p className="text-muted-foreground text-sm mt-1">System Security Plan dashboard</p>
        </div>
        <div className="flex items-center gap-2">
          {primary.extractedAt ? (
            <Button
              variant="outline"
              size="sm"
              onClick={() => parseMutation.mutate(primary.id)}
              disabled={parseMutation.isPending}
            >
              {parseMutation.isPending ? (
                <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
              ) : (
                <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
              )}
              Re-parse
            </Button>
          ) : primary.fileKey ? (
            <Button
              size="sm"
              onClick={() => parseMutation.mutate(primary.id)}
              disabled={parseMutation.isPending}
            >
              {parseMutation.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4 mr-2" />
              )}
              Parse Document
            </Button>
          ) : null}
        </div>
      </div>

      {/* ── Document Info ── */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <FileText className="h-4 w-4 text-primary" />
              {primary.title}
            </CardTitle>
            <span className={`text-xs font-medium px-2.5 py-1 rounded-full border ${STATUS_COLORS[primary.status] ?? "bg-gray-100 text-gray-600"}`}>
              {primary.status.charAt(0).toUpperCase() + primary.status.slice(1)}
            </span>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-x-6 gap-y-2 text-sm">
            <MetaField label="Document #" value={primary.documentNumber} />
            <MetaField label="Revision" value={primary.revisionNumber} />
            <MetaField label="Revision Date" value={primary.revisionDate} />
            <MetaField label="Organization" value={primary.organization} />
            <MetaField label="System Name" value={primary.systemName} />
            <MetaField label="System Owner" value={primary.systemOwner} />
            <MetaField label="CMMC Level" value={primary.cmmcLevel} />
            <MetaField label="Prepared By" value={primary.preparedBy} />
            <MetaField label="Approved By" value={primary.approvedBy} />
            {primary.nextReviewDate && (
              <MetaField label="Next Review" value={primary.nextReviewDate} />
            )}
            {primary.extractedAt && (
              <MetaField
                label="Last Parsed"
                value={new Date(primary.extractedAt).toLocaleDateString()}
              />
            )}
          </div>
          <div className="mt-4 flex gap-2">
            <Link href="/ssp/documents">
              <Button variant="outline" size="sm">
                <ExternalLink className="h-3.5 w-3.5 mr-1.5" />
                Manage Documents
              </Button>
            </Link>
          </div>
        </CardContent>
      </Card>

      {/* ── Stats cards ── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard
          icon={BookOpen}
          label="SSP Sections"
          value={stats ? `${stats.completeSections} / ${stats.totalSections}` : "—"}
          sub="complete"
          color="text-blue-600"
          bg="bg-blue-50"
        />
        <StatCard
          icon={ShieldCheck}
          label="Controls Mapped"
          value={stats ? `${stats.totalMappings} / ${stats.totalControls}` : "—"}
          sub="unique valid controls"
          color="text-green-600"
          bg="bg-green-50"
        />
        <StatCard
          icon={ClipboardList}
          label="Manually Edited"
          value={stats?.editedMappings ?? "—"}
          sub="control mappings"
          color="text-purple-600"
          bg="bg-purple-50"
        />
        <StatCard
          icon={CheckCircle2}
          label="Sections Complete"
          value={stats ? `${Math.round(pct * 100)}%` : "—"}
          sub="of all sections"
          color="text-orange-600"
          bg="bg-orange-50"
        />
      </div>

      {/* ── Progress bar ── */}
      {stats && stats.totalSections > 0 && (
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium">Section Completion</span>
              <span className="text-sm text-muted-foreground">
                {stats.completeSections} of {stats.totalSections} sections complete
              </span>
            </div>
            <div className="h-2 bg-muted rounded-full overflow-hidden">
              <div
                className="h-full bg-primary rounded-full transition-all"
                style={{ width: `${Math.round(pct * 100)}%` }}
              />
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Quick Links ── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <QuickLink href="/ssp/sections" icon={BookOpen} label="View & Edit Sections" description="Review and update extracted SSP sections" />
        <QuickLink href="/ssp/mappings" icon={ShieldCheck} label="Control Mappings" description="Manage control implementation narratives" />
        <QuickLink href="/ssp/export" icon={FileText} label="Export SSP" description="Download updated DOCX with all edits" />
      </div>

      {/* ── In-Progress Drafts ── */}
      <SspDraftsCard />

      {/* ── SSP Resources ── */}
      <SspResourcesCard />
    </div>
  );
}

function MetaField({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div>
      <span className="text-xs text-muted-foreground">{label}</span>
      <p className="font-medium">{value ?? "—"}</p>
    </div>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  sub,
  color,
  bg,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string | number;
  sub: string;
  color: string;
  bg: string;
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className={`inline-flex p-2 rounded-lg ${bg} mb-2`}>
          <Icon className={`h-4 w-4 ${color}`} />
        </div>
        <div className="text-2xl font-bold">{value}</div>
        <div className="text-xs font-medium text-muted-foreground">{label}</div>
        <div className="text-[11px] text-muted-foreground/70">{sub}</div>
      </CardContent>
    </Card>
  );
}

function QuickLink({
  href,
  icon: Icon,
  label,
  description,
}: {
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  description: string;
}) {
  return (
    <Link href={href}>
      <Card className="hover:border-primary/50 hover:shadow-sm transition-all cursor-pointer h-full">
        <CardContent className="p-4">
          <div className="flex items-start gap-3">
            <div className="p-2 bg-primary/10 rounded-lg">
              <Icon className="h-4 w-4 text-primary" />
            </div>
            <div>
              <p className="font-medium text-sm">{label}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}

function SspDraftsCard() {
  const { activeOrg } = useOrg();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [, navigate] = useLocation();
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const { data: drafts, isLoading } = useQuery<PrefillDraft[]>({
    queryKey: ["ssp-prefill-drafts", activeOrg?.id],
    queryFn: async () => {
      const r = await fetch("/api/ssp/prefill-drafts", {
        headers: apiHeaders(activeOrg?.id),
      });
      if (!r.ok) return [];
      return r.json();
    },
    enabled: !!activeOrg?.id,
  });

  const deleteMutation = useMutation({
    mutationFn: async (draftId: string) => {
      const r = await fetch(`/api/ssp/prefill-drafts/${draftId}`, {
        method: "DELETE",
        headers: apiHeaders(activeOrg?.id),
      });
      if (!r.ok) throw new Error("Delete failed");
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["ssp-prefill-drafts", activeOrg?.id] });
      toast({ title: "Draft deleted" });
    },
    onError: () => toast({ title: "Could not delete draft", variant: "destructive" }),
  });

  const draftToDelete = deletingId ? drafts?.find((d) => d.id === deletingId) : undefined;

  if (isLoading) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Wand2 className="h-4 w-4 text-violet-600" />
            In-Progress SSP Drafts
          </CardTitle>
        </CardHeader>
        <CardContent className="flex items-center gap-2 py-6 text-muted-foreground text-sm">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading drafts…
        </CardContent>
      </Card>
    );
  }

  if (!drafts || drafts.length === 0) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Wand2 className="h-4 w-4 text-violet-600" />
            In-Progress SSP Drafts
          </CardTitle>
        </CardHeader>
        <CardContent className="py-8 text-center space-y-2">
          <Wand2 className="h-8 w-8 mx-auto text-muted-foreground/30" />
          <p className="text-sm font-medium text-muted-foreground">No drafts yet</p>
          <p className="text-xs text-muted-foreground">
            Drafts are saved automatically as you work through the pre-fill wizard.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <AlertDialog open={!!deletingId} onOpenChange={(open) => { if (!open) setDeletingId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete draft?</AlertDialogTitle>
            <AlertDialogDescription>
              "{draftToDelete?.title ?? "This draft"}" will be permanently deleted. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive hover:bg-destructive/90"
              onClick={() => {
                if (deletingId) deleteMutation.mutate(deletingId);
                setDeletingId(null);
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Wand2 className="h-4 w-4 text-violet-600" />
            In-Progress SSP Drafts
            <Badge variant="secondary" className="ml-auto text-xs">{drafts.length}</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 pt-1">
          {drafts.map((draft) => {
            const isComplete = draft.wizardStep >= TOTAL_STEPS;
            const stepLabel = isComplete
              ? "Complete"
              : `Step ${draft.wizardStep} of ${TOTAL_STEPS}`;
            const updatedDate = new Date(draft.updatedAt).toLocaleDateString(undefined, {
              year: "numeric", month: "short", day: "numeric",
            });

            return (
              <div
                key={draft.id}
                className="flex items-center gap-3 rounded-lg border bg-muted/20 px-4 py-3"
              >
                <div className={`p-2 rounded-md flex-shrink-0 ${isComplete ? "bg-green-100" : "bg-violet-100"}`}>
                  <Wand2 className={`h-4 w-4 ${isComplete ? "text-green-700" : "text-violet-700"}`} />
                </div>

                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{draft.title}</p>
                  <div className="flex items-center gap-3 mt-0.5 text-xs text-muted-foreground flex-wrap">
                    <span className="flex items-center gap-1">
                      <PlayCircle className="h-3 w-3" />
                      {stepLabel}
                    </span>
                    <span className="flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {updatedDate}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-2 flex-shrink-0">
                  {isComplete ? (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        navigate(`/ssp/prefill-wizard?draft=${draft.id}&templateKey=${draft.templateKey}`)
                      }
                    >
                      <RotateCcw className="h-3.5 w-3.5 mr-1.5" />
                      Re-generate
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      onClick={() =>
                        navigate(`/ssp/prefill-wizard?draft=${draft.id}&templateKey=${draft.templateKey}`)
                      }
                    >
                      <PlayCircle className="h-3.5 w-3.5 mr-1.5" />
                      Continue
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-muted-foreground hover:text-destructive"
                    onClick={() => setDeletingId(draft.id)}
                    disabled={deleteMutation.isPending}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    <span className="sr-only">Delete draft</span>
                  </Button>
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>
    </>
  );
}
