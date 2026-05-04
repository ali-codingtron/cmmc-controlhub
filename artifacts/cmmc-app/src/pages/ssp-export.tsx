import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useOrg } from "@/context/OrgContext";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";
import {
  Download,
  FileText,
  CheckCircle2,
  Loader2,
  Upload,
  ShieldCheck,
  BookOpen,
} from "lucide-react";

interface SspDocument {
  id: string;
  title: string;
  documentNumber: string | null;
  revisionNumber: string | null;
  revisionDate: string | null;
  organization: string | null;
  cmmcLevel: string | null;
  status: string;
  extractedAt: string | null;
}

interface SspStats {
  totalSections: number;
  completeSections: number;
  totalMappings: number;
  editedMappings: number;
}

function apiHeaders(orgId?: string) {
  const token = localStorage.getItem("auth_token");
  return {
    Authorization: `Bearer ${token}`,
    ...(orgId ? { "X-Organization-ID": orgId } : {}),
  };
}

export default function SspExport() {
  const { activeOrg } = useOrg();
  const { toast } = useToast();
  const [exporting, setExporting] = useState(false);

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
      const r = await fetch(`/api/ssp/${primary!.id}/stats`, {
        headers: apiHeaders(activeOrg?.id),
      });
      if (!r.ok) return null;
      return r.json();
    },
    enabled: !!primary?.id,
  });

  const handleExportDocx = async () => {
    if (!primary) return;
    setExporting(true);
    try {
      const r = await fetch(`/api/ssp/${primary.id}/export`, {
        headers: apiHeaders(activeOrg?.id),
      });
      if (!r.ok) throw new Error("Export failed");
      const blob = await r.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${primary.documentNumber ?? primary.title}-export.docx`.replace(/[^a-zA-Z0-9.\-_]/g, "_");
      a.click();
      URL.revokeObjectURL(url);
      toast({ title: "Export complete", description: "Your DOCX has been downloaded." });
    } catch {
      toast({ title: "Export failed", variant: "destructive" });
    } finally {
      setExporting(false);
    }
  };

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
        <h1 className="text-2xl font-bold">SSP Export</h1>
        <Card>
          <CardContent className="flex flex-col items-center py-20 text-center">
            <FileText className="h-12 w-12 text-muted-foreground/25 mb-4" />
            <p className="font-medium text-muted-foreground">No SSP document uploaded yet</p>
            <Link href="/ssp/documents">
              <Button className="mt-4" size="sm">
                <Upload className="h-4 w-4 mr-2" />
                Upload SSP
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">SSP Export</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Export your updated System Security Plan as a DOCX file
        </p>
      </div>

      {/* ── Document summary ── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <FileText className="h-4 w-4 text-primary" />
            {primary.title}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm mb-4">
            <div>
              <span className="text-xs text-muted-foreground">Document #</span>
              <p className="font-medium">{primary.documentNumber ?? "—"}</p>
            </div>
            <div>
              <span className="text-xs text-muted-foreground">Revision</span>
              <p className="font-medium">{primary.revisionNumber ?? "—"}</p>
            </div>
            <div>
              <span className="text-xs text-muted-foreground">Revision Date</span>
              <p className="font-medium">{primary.revisionDate ?? "—"}</p>
            </div>
            <div>
              <span className="text-xs text-muted-foreground">CMMC Level</span>
              <p className="font-medium">{primary.cmmcLevel ?? "—"}</p>
            </div>
          </div>

          {stats && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
              <SummaryItem icon={BookOpen} label="Sections" value={`${stats.completeSections}/${stats.totalSections}`} color="text-blue-600" />
              <SummaryItem icon={ShieldCheck} label="Control Mappings" value={stats.totalMappings} color="text-green-600" />
              <SummaryItem icon={CheckCircle2} label="Manually Edited" value={stats.editedMappings} color="text-purple-600" />
              <SummaryItem
                icon={FileText}
                label="Status"
                value={primary.status.charAt(0).toUpperCase() + primary.status.slice(1)}
                color="text-orange-600"
              />
            </div>
          )}

          <div className="border-t pt-4">
            <h3 className="text-sm font-semibold mb-3">Export Options</h3>
            <div className="flex flex-col sm:flex-row gap-3">
              <Button
                onClick={handleExportDocx}
                disabled={exporting}
                className="w-full sm:w-auto"
              >
                {exporting ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Download className="h-4 w-4 mr-2" />
                )}
                Export as DOCX
              </Button>
              <Button
                variant="outline"
                onClick={async () => {
                  const r = await fetch(`/api/ssp/${primary.id}/download`, {
                    headers: apiHeaders(activeOrg?.id),
                  });
                  if (!r.ok) { toast({ title: "No file available", variant: "destructive" }); return; }
                  const blob = await r.blob();
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement("a");
                  a.href = url;
                  a.download = `${primary.documentNumber ?? primary.title}-original.docx`.replace(/[^a-zA-Z0-9.\-_]/g, "_");
                  a.click();
                  URL.revokeObjectURL(url);
                }}
                className="w-full sm:w-auto"
              >
                <Download className="h-4 w-4 mr-2" />
                Download Original
              </Button>
            </div>
          </div>

          <div className="mt-4 p-3 bg-muted/50 rounded-lg text-xs text-muted-foreground">
            <p className="font-medium mb-1">What is included in the DOCX export?</p>
            <ul className="space-y-0.5 list-disc list-inside">
              <li>SSP cover page with all metadata fields</li>
              <li>All extracted and edited SSP sections</li>
              <li>Control implementation statements table (with all edits)</li>
              <li>Policy references and implementation status per control</li>
            </ul>
          </div>
        </CardContent>
      </Card>

      {!primary.extractedAt && (
        <div className="p-3 border border-yellow-200 bg-yellow-50 rounded-lg text-sm text-yellow-800">
          <strong>Note:</strong> This document has not been parsed yet. Only metadata will be exported. Go to{" "}
          <Link href="/ssp/documents">
            <span className="underline cursor-pointer">SSP Documents</span>
          </Link>{" "}
          to parse the file first.
        </div>
      )}
    </div>
  );
}

function SummaryItem({
  icon: Icon,
  label,
  value,
  color,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string | number;
  color: string;
}) {
  return (
    <div className="flex items-center gap-2 p-2.5 bg-muted/40 rounded-lg">
      <Icon className={`h-4 w-4 ${color} shrink-0`} />
      <div>
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className="font-semibold text-sm">{value}</div>
      </div>
    </div>
  );
}
