import { useState } from "react";
import { useAuth } from "@/lib/auth";
import { useOrg } from "@/context/OrgContext";
import { ReportShell } from "@/components/reports/ReportShell";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Separator } from "@/components/ui/separator";
import {
  Download, Package, Shield, FileText, FolderOpen,
  AlertTriangle, CheckCircle2, Clock, Loader2, Info,
} from "lucide-react";
import { apiHeaders } from "@/lib/report-utils";

interface ExportOptions {
  includeApproved: boolean;
  includeAssessorReady: boolean;
  includeDraft: boolean;
  includePendingReview: boolean;
  includeArchived: boolean;
  includeInternalNotes: boolean;
  includeHashManifest: boolean;
  includeMetadataJson: boolean;
}

const FOLDER_STRUCTURE = [
  {
    icon: <FolderOpen className="h-4 w-4 text-yellow-500" />,
    name: "00_START_HERE",
    desc: "README.pdf, C3PAO_Upload_Instructions.pdf, Package_Index.xlsx",
    highlight: true,
  },
  {
    icon: <FolderOpen className="h-4 w-4 text-blue-500" />,
    name: "01_C3PAO_Review_Package",
    desc: "Human-readable browsable format",
    children: [
      { name: "01_Assessment_Overview", desc: "Executive Readiness Report, Domain Readiness Report" },
      { name: "02_SSP", desc: "System Security Plan PDF, SSP Control Mapping XLSX" },
      { name: "03_Control_Packages/AC/ AU/ CM/ IA/ …", desc: "Per-control folders with Control_Summary.pdf, Evidence/, Documents/, Monitoring/, POAM/" },
      { name: "04_Document_Library", desc: "Policies/, Procedures/, all documents + document-like evidence" },
      { name: "05_Evidence_Library", desc: "All unique evidence files by category + Evidence_Inventory.xlsx" },
      { name: "06_Monitoring", desc: "Monitoring_Tracker.xlsx (all fields) + PDF report" },
      { name: "07_POAM", desc: "POAM_Register.xlsx, POAM_Report.pdf, Unmapped_POAM/" },
      { name: "08_Reports", desc: "Executive Readiness, Domain Readiness, Gap Analysis PDFs" },
    ],
  },
  {
    icon: <FolderOpen className="h-4 w-4 text-green-500" />,
    name: "02_C3PAO_Import_Package",
    desc: "Upload-optimized flat structure for C3PAO repository import",
    children: [
      { name: "import_manifest.xlsx", desc: "Master upload guide — sort by Control ID" },
      { name: "evidence_files/", desc: "All unique evidence files (flat)" },
      { name: "document_files/", desc: "All unique document files (flat)" },
      { name: "ssp_files/ / poam_files/ / monitoring_files/", desc: "SSP, POA&M, monitoring exports" },
    ],
  },
  {
    icon: <FolderOpen className="h-4 w-4 text-purple-500" />,
    name: "99_Manifests",
    desc: "Cross-reference maps, hash manifest, export issues log",
    children: [
      { name: "Control_to_Evidence_Map.xlsx", desc: "All control ↔ evidence relationships" },
      { name: "Control_to_Document_Map.xlsx", desc: "All control ↔ document relationships" },
      { name: "File_Hash_Manifest.xlsx", desc: "SHA-256 hash for every file in the package" },
      { name: "Export_Issues.xlsx", desc: "Warnings: missing files, unlinked evidence, unmapped POA&Ms" },
      { name: "Package_Metadata.json", desc: "Machine-readable manifest with counts" },
    ],
  },
];

const DOMAIN_CODES = [
  ["AC", "Access Control"], ["AT", "Awareness & Training"], ["AU", "Audit & Accountability"],
  ["CM", "Configuration Management"], ["IA", "Identification & Authentication"], ["IR", "Incident Response"],
  ["MA", "Maintenance"], ["MP", "Media Protection"], ["PE", "Physical Protection"],
  ["PS", "Personnel Security"], ["RA", "Risk Assessment"], ["CA", "Security Assessment"],
  ["SC", "System & Comms Protection"], ["SI", "System & Info Integrity"],
];

export default function ReportsExport() {
  const { user } = useAuth();
  const { activeOrg } = useOrg();

  const [options, setOptions] = useState<ExportOptions>({
    includeApproved: true,
    includeAssessorReady: true,
    includeDraft: false,
    includePendingReview: false,
    includeArchived: false,
    includeInternalNotes: false,
    includeHashManifest: true,
    includeMetadataJson: true,
  });

  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastGenerated, setLastGenerated] = useState<string | null>(null);

  const isAdmin = user?.role === "admin" || user?.role === "compliance_manager";

  function toggle(key: keyof ExportOptions) {
    setOptions((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  async function handleGenerate() {
    if (!activeOrg?.id) return;
    setGenerating(true);
    setError(null);

    try {
      const res = await fetch("/api/export/c3pao-package", {
        method: "POST",
        headers: { ...apiHeaders(activeOrg.id), "Content-Type": "application/json" },
        body: JSON.stringify(options),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error((data as { error?: string }).error ?? `Server error ${res.status}`);
      }

      const blob = await res.blob();
      const disposition = res.headers.get("Content-Disposition") ?? "";
      const match = disposition.match(/filename="([^"]+)"/);
      const filename = match?.[1] ?? `C3PAO_Evidence_Package.zip`;

      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      setLastGenerated(new Date().toLocaleString());
    } catch (err) {
      setError(err instanceof Error ? err.message : "An unexpected error occurred");
    } finally {
      setGenerating(false);
    }
  }

  if (!isAdmin) {
    return (
      <ReportShell title="C3PAO Export Package">
        <Alert className="border-amber-200 bg-amber-50">
          <AlertTriangle className="h-4 w-4 text-amber-600" />
          <AlertDescription className="text-amber-800">
            Generating export packages requires the Admin or Compliance Manager role.
          </AlertDescription>
        </Alert>
      </ReportShell>
    );
  }

  return (
    <ReportShell title="C3PAO Export Package">
      <Card className="border-blue-200 bg-gradient-to-r from-blue-50 to-indigo-50">
        <CardContent className="pt-6">
          <div className="flex items-start gap-4">
            <div className="rounded-lg bg-blue-600 p-3">
              <Package className="h-6 w-6 text-white" />
            </div>
            <div className="flex-1">
              <h2 className="text-lg font-semibold text-gray-900">C3PAO Evidence Export Package</h2>
              <p className="mt-1 text-sm text-gray-600 max-w-2xl">
                Generate a structured ZIP containing all evidence, documents, control packages, SSP, POA&M,
                and monitoring data in two formats: a human-readable Review Package and an upload-ready Import Package.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Badge variant="outline" className="border-blue-300 text-blue-700 bg-blue-50">
                  <Shield className="h-3 w-3 mr-1" /> CMMC Level 2
                </Badge>
                <Badge variant="outline" className="border-green-300 text-green-700 bg-green-50">
                  <FileText className="h-3 w-3 mr-1" /> All 110 Controls
                </Badge>
                <Badge variant="outline" className="border-purple-300 text-purple-700 bg-purple-50">
                  <Package className="h-3 w-3 mr-1" /> Review + Import Package
                </Badge>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Options panel */}
        <div className="lg:col-span-1 space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Export Options</CardTitle>
              <CardDescription className="text-xs">Choose which evidence statuses and content to include</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Evidence Statuses</p>
                <div className="space-y-2">
                  {(
                    [
                      { key: "includeApproved" as const, label: "Approved", desc: "Fully approved evidence", recommended: true },
                      { key: "includeAssessorReady" as const, label: "Assessor Ready", desc: "Ready for C3PAO review", recommended: true },
                      { key: "includePendingReview" as const, label: "Pending Review", desc: "Awaiting internal review" },
                      { key: "includeDraft" as const, label: "Draft", desc: "Work-in-progress evidence" },
                      { key: "includeArchived" as const, label: "Archived", desc: "Historical/superseded evidence" },
                    ] satisfies { key: keyof ExportOptions; label: string; desc: string; recommended?: boolean }[]
                  ).map(({ key, label, desc, recommended }) => (
                    <div key={key} className="flex items-start gap-2">
                      <Checkbox id={key} checked={options[key]} onCheckedChange={() => toggle(key)} className="mt-0.5" />
                      <div className="flex-1">
                        <Label htmlFor={key} className="text-sm font-medium cursor-pointer flex items-center gap-1.5">
                          {label}
                          {recommended && (
                            <Badge variant="outline" className="text-[10px] px-1 py-0 h-4 border-green-300 text-green-700">recommended</Badge>
                          )}
                        </Label>
                        <p className="text-[11px] text-muted-foreground">{desc}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <Separator />

              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Package Contents</p>
                <div className="space-y-2">
                  {(
                    [
                      { key: "includeInternalNotes" as const, label: "Include Internal Notes", desc: "Adds internal/reviewer notes to evidence" },
                      { key: "includeHashManifest" as const, label: "SHA-256 Hash Manifest", desc: "Tamper-evident file integrity manifest", recommended: true },
                      { key: "includeMetadataJson" as const, label: "Package Metadata JSON", desc: "Machine-readable export manifest with counts", recommended: true },
                    ] satisfies { key: keyof ExportOptions; label: string; desc: string; recommended?: boolean }[]
                  ).map(({ key, label, desc, recommended }) => (
                    <div key={key} className="flex items-start gap-2">
                      <Checkbox id={key} checked={options[key]} onCheckedChange={() => toggle(key)} className="mt-0.5" />
                      <div className="flex-1">
                        <Label htmlFor={key} className="text-sm font-medium cursor-pointer flex items-center gap-1.5">
                          {label}
                          {recommended && (
                            <Badge variant="outline" className="text-[10px] px-1 py-0 h-4 border-green-300 text-green-700">recommended</Badge>
                          )}
                        </Label>
                        <p className="text-[11px] text-muted-foreground">{desc}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <Separator />

              {error && (
                <Alert className="border-red-200 bg-red-50">
                  <AlertTriangle className="h-4 w-4 text-red-600" />
                  <AlertDescription className="text-red-700 text-xs">{error}</AlertDescription>
                </Alert>
              )}

              {lastGenerated && !error && (
                <div className="flex items-center gap-1.5 text-xs text-green-700 bg-green-50 rounded px-2 py-1.5">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  Last generated {lastGenerated}
                </div>
              )}

              <Button className="w-full" onClick={handleGenerate} disabled={generating || !activeOrg?.id}>
                {generating ? (
                  <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Building package…</>
                ) : (
                  <><Download className="h-4 w-4 mr-2" />Generate &amp; Download</>
                )}
              </Button>

              {generating && (
                <p className="text-[11px] text-muted-foreground text-center">
                  Fetching files, building control packages, generating PDFs. Large packages may take 30–90 seconds.
                </p>
              )}
            </CardContent>
          </Card>

          <Alert className="border-amber-200 bg-amber-50">
            <Info className="h-4 w-4 text-amber-600" />
            <AlertDescription className="text-amber-800 text-xs">
              Only share this package with authorised C3PAO assessors. It contains sensitive system security information.
            </AlertDescription>
          </Alert>
        </div>

        {/* Package structure panel */}
        <div className="lg:col-span-2 space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Package Structure</CardTitle>
              <CardDescription className="text-xs">
                The ZIP contains a Review Package (human-browsable) and an Import Package (upload-ready)
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {FOLDER_STRUCTURE.map((folder) => (
                <div key={folder.name}>
                  <div className={`flex items-start gap-3 rounded-lg border px-3 py-2.5 ${folder.highlight ? "border-yellow-200 bg-yellow-50" : "border-gray-100 bg-gray-50"}`}>
                    {folder.icon}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-mono font-medium text-gray-800">{folder.name}/</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{folder.desc}</p>
                    </div>
                  </div>
                  {folder.children && (
                    <div className="ml-7 mt-1 space-y-1">
                      {folder.children.map((child) => (
                        <div key={child.name} className="flex items-start gap-2 rounded border border-gray-100 bg-white px-2.5 py-1.5">
                          <FolderOpen className="h-3.5 w-3.5 text-gray-400 mt-0.5 flex-shrink-0" />
                          <div>
                            <p className="text-xs font-mono text-gray-700">{child.name}</p>
                            <p className="text-[11px] text-muted-foreground">{child.desc}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Domain Folder Codes</CardTitle>
              <CardDescription className="text-xs">03_Control_Packages uses standard CMMC 2-letter domain codes</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                {DOMAIN_CODES.map(([code, name]) => (
                  <div key={code} className="flex items-center gap-2 rounded border border-gray-100 bg-gray-50 px-2.5 py-1.5">
                    <span className="font-mono text-xs font-bold text-blue-700 w-7 flex-shrink-0">{code}</span>
                    <span className="text-[11px] text-muted-foreground truncate">{name}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">What's New in This Export</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-sm text-muted-foreground space-y-1.5">
                {[
                  ["Standard CMMC domain codes", "AC, AT, AU, CM, IA, IR, MA, MP, PE, PS, RA, CA, SC, SI"],
                  ["Document Library", "Includes both uploaded documents AND policy/procedure evidence"],
                  ["Evidence Library", "All 1,000+ unique evidence files, categorized by type"],
                  ["Import Package", "Flat file structure with import_manifest.xlsx for C3PAO upload"],
                  ["Control packages", "Always include Evidence/, Documents/, Monitoring/, POAM/ subfolders"],
                  ["Monitoring Tracker", "All fields: task, control ref, operating procedure, test procedure"],
                  ["Export Issues log", "99_Manifests/Export_Issues.xlsx lists all warnings"],
                  ["Accurate counts", "Package_Metadata.json reflects actual document + evidence counts"],
                ].map(([label, detail]) => (
                  <div key={label} className="flex items-start gap-2">
                    <CheckCircle2 className="h-3.5 w-3.5 text-green-500 flex-shrink-0 mt-0.5" />
                    <span><strong>{label}</strong> — {detail}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card className="border-slate-200">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Clock className="h-4 w-4 text-muted-foreground" />
                Generation Time Estimates
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-3 gap-3 text-center text-sm">
                {[
                  { scenario: "No attached files", time: "~15s" },
                  { scenario: "50–200 evidence files", time: "~30s" },
                  { scenario: "1,000+ evidence files", time: "60–120s" },
                ].map((row) => (
                  <div key={row.scenario} className="rounded-lg border bg-slate-50 px-2 py-3">
                    <p className="text-lg font-bold text-slate-800">{row.time}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{row.scenario}</p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </ReportShell>
  );
}
