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
import { Link } from "wouter";
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
} from "lucide-react";

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
  onDownload,
  downloading,
}: {
  open: boolean;
  onClose: () => void;
  onDownload: () => void;
  downloading: boolean;
}) {
  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileDown className="h-5 w-5 text-blue-600" />
            CMMC L2 / NIST SP 800-171 SSP Template
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 text-sm">
          <div className="flex flex-wrap gap-1.5">
            {["CMMC L2", "NIST 800-171 R2", "NIST 800-171A", "DFARS", "DOCX"].map((b) => (
              <Badge key={b} variant="secondary" className="text-xs">{b}</Badge>
            ))}
          </div>

          <p className="text-muted-foreground">
            This template contains the following sections:
          </p>

          <ul className="space-y-1.5">
            {TEMPLATE_SECTIONS.map((s) => (
              <li key={s} className="flex items-start gap-2 text-sm">
                <CheckCircle2 className="h-3.5 w-3.5 mt-0.5 text-green-500 flex-shrink-0" />
                <span>{s}</span>
              </li>
            ))}
          </ul>

          <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-amber-800 text-xs space-y-1">
            <p className="font-medium">Important notice</p>
            <p>
              The template contains no compliance assertion. Each organization must
              replace the placeholders, document its actual implementation, identify
              supporting evidence, complete status determinations, and obtain the
              required approval.
            </p>
          </div>

          <div className="flex gap-2 pt-1">
            <Button onClick={onDownload} disabled={downloading} className="flex-1">
              {downloading ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Download className="h-4 w-4 mr-2" />
              )}
              Download SSP Template
            </Button>
            <Button variant="outline" onClick={onClose}>
              Close
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function SspResourcesCard() {
  const { activeOrg } = useOrg();
  const { toast } = useToast();
  const [downloading, setDownloading] = useState(false);
  const [contentsOpen, setContentsOpen] = useState(false);

  async function handleDownload() {
    setDownloading(true);
    try {
      const r = await fetch("/api/ssp/templates/cmmc-l2-nist-r2/download", {
        headers: apiHeaders(activeOrg?.id),
      });
      if (!r.ok) {
        const err = await r.json().catch(() => ({}));
        throw new Error(
          (err as { error?: string }).error ||
            "The SSP template is temporarily unavailable. Contact your Control HUB administrator."
        );
      }
      const blob = await r.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "Control_HUB_CMMC_L2_NIST_800-171_SSP_Template.docx";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast({
        title: "Template downloaded",
        description: "CMMC L2 / NIST SP 800-171 SSP Template",
      });
    } catch (e: unknown) {
      toast({
        title: "Download failed",
        description:
          e instanceof Error
            ? e.message
            : "The SSP template is temporarily unavailable. Contact your Control HUB administrator.",
        variant: "destructive",
      });
    } finally {
      setDownloading(false);
    }
  }

  return (
    <>
      <TemplateContentsDialog
        open={contentsOpen}
        onClose={() => setContentsOpen(false)}
        onDownload={handleDownload}
        downloading={downloading}
      />

      <Card className="border-blue-200 bg-gradient-to-br from-blue-50/60 to-white">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <div className="p-1.5 bg-blue-100 rounded-md">
              <FileDown className="h-4 w-4 text-blue-700" />
            </div>
            Start with the Control HUB SSP Template
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground leading-relaxed">
            Download a reusable CMMC Level 2 and NIST SP 800-171 System Security Plan. The
            template includes system-boundary sections, security architecture, all 110
            requirement narratives, evidence and test fields, DFARS status tracking, and
            NIST SP 800-171A assessment objectives.
          </p>

          <div className="flex flex-wrap gap-1.5">
            {["CMMC L2", "NIST 800-171 R2", "NIST 800-171A", "DFARS", "DOCX"].map((b) => (
              <Badge key={b} variant="secondary" className="text-xs">{b}</Badge>
            ))}
          </div>

          <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-muted-foreground py-1">
            <span><span className="font-medium text-foreground">Framework:</span> CMMC Level 2</span>
            <span><span className="font-medium text-foreground">Format:</span> Microsoft Word DOCX</span>
            <span><span className="font-medium text-foreground">Requirements:</span> NIST SP 800-171 Rev. 2</span>
            <span><span className="font-medium text-foreground">Version:</span> 1.0</span>
            <span><span className="font-medium text-foreground">Procedures:</span> NIST SP 800-171A</span>
            <span><span className="font-medium text-foreground">Editable:</span> Yes</span>
            <span><span className="font-medium text-foreground">Contract:</span> DFARS</span>
            <span><span className="font-medium text-foreground">Org Assertions:</span> None</span>
          </div>

          <div className="flex gap-2 pt-1">
            <Button onClick={handleDownload} disabled={downloading} size="sm">
              {downloading ? (
                <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
              ) : (
                <Download className="h-3.5 w-3.5 mr-1.5" />
              )}
              Download SSP Template
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setContentsOpen(true)}
            >
              View Template Contents
            </Button>
          </div>

          <p className="text-xs text-muted-foreground">
            Download the editable Word template, replace the organization placeholders,
            complete the implementation and evidence sections, and upload the completed SSP
            through the existing SSP upload workflow.
          </p>

          <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50/80 px-3 py-2 text-amber-800 text-xs">
            <AlertTriangle className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
            <span>
              Do not mark a requirement Met or Not Applicable unless the status is supported
              by the organization's actual implementation, scope, rationale, and evidence.
            </span>
          </div>
        </CardContent>
      </Card>
    </>
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
