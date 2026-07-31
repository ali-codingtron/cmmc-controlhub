import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation, Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  ArrowLeft, ArrowRight, CheckCircle2, FileDown, Loader2, Plus,
  AlertTriangle, Eye, EyeOff,
} from "lucide-react";
import { useOrg } from "@/context/OrgContext";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";

function authHeaders(orgId?: string): Record<string, string> {
  const token = localStorage.getItem("auth_token");
  const h: Record<string, string> = {};
  if (token) h["Authorization"] = `Bearer ${token}`;
  if (orgId) h["X-Organization-ID"] = orgId;
  return h;
}

// ── Required placeholder set ──────────────────────────────────────────────────
const REQUIRED_PLACEHOLDERS = new Set([
  "{{ORGANIZATION_NAME}}",
  "{{SYSTEM_NAME}}",
  "{{DOCUMENT_OWNER}}",
  "{{APPROVER_NAME}}",
  "{{EFFECTIVE_DATE}}",
  "{{REVIEW_DATE}}",
  "{{VERSION}}",
  "{{CLASSIFICATION}}",
]);

// ── Placeholder sections ──────────────────────────────────────────────────────
interface PlaceholderField {
  key: string;
  label: string;
  required?: boolean;
  dataSource?: string;
}

interface PlaceholderSection {
  key: string;
  label: string;
  fields: PlaceholderField[];
}

const PLACEHOLDER_SECTIONS: PlaceholderSection[] = [
  {
    key: "org_info",
    label: "Organization Information",
    fields: [
      { key: "{{ORGANIZATION_NAME}}", label: "Organization Name", required: true, dataSource: "Organization Profile" },
      { key: "{{SYSTEM_NAME}}", label: "System Name", required: true, dataSource: "Organization Profile" },
      { key: "{{CMMC_SCOPE_NAME}}", label: "CMMC Scope Name", dataSource: "Organization Profile" },
      { key: "{{ASSESSMENT_SCOPE}}", label: "Assessment Scope", dataSource: "Organization Profile" },
    ],
  },
  {
    key: "doc_control",
    label: "Document Control",
    fields: [
      { key: "{{VERSION}}", label: "Document Version", required: true, dataSource: "Template Default" },
      { key: "{{CLASSIFICATION}}", label: "Classification", required: true, dataSource: "Organization Profile" },
      { key: "{{DOCUMENT_NUMBER_PREFIX}}", label: "Document Number Prefix", dataSource: "Organization Profile" },
      { key: "{{DOCUMENT_OWNER}}", label: "Document Owner", required: true, dataSource: "Template Default" },
      { key: "{{POLICY_OWNER}}", label: "Policy Owner", dataSource: "Template Default" },
      { key: "{{PROCEDURE_OWNER}}", label: "Procedure Owner", dataSource: "Template Default" },
      { key: "{{APPROVER_NAME}}", label: "Approver Name", required: true, dataSource: "Organization Profile" },
      { key: "{{APPROVER_TITLE}}", label: "Approver Title", dataSource: "Template Default" },
      { key: "{{EFFECTIVE_DATE}}", label: "Effective Date", required: true, dataSource: "User Entered" },
      { key: "{{REVIEW_DATE}}", label: "Next Review Date", required: true, dataSource: "User Entered" },
      { key: "{{APPROVAL_DATE}}", label: "Approval Date", dataSource: "Control HUB Record" },
    ],
  },
  {
    key: "roles",
    label: "Roles & Responsibilities",
    fields: [
      { key: "{{SECURITY_OFFICER}}", label: "Security Officer", dataSource: "Organization Profile" },
      { key: "{{SECURITY_OFFICER_TITLE}}", label: "Security Officer Title", dataSource: "Template Default" },
      { key: "{{SYSTEM_OWNER}}", label: "System Owner", dataSource: "Organization Profile" },
      { key: "{{SYSTEM_OWNER_TITLE}}", label: "System Owner Title", dataSource: "Template Default" },
      { key: "{{IT_ADMIN}}", label: "IT Administrator", dataSource: "Organization Profile" },
      { key: "{{IT_ADMIN_TITLE}}", label: "IT Admin Title", dataSource: "Template Default" },
      { key: "{{IT_ADMINISTRATOR}}", label: "IT Administrator (Alt)", dataSource: "Organization Profile" },
      { key: "{{HR_OWNER_TITLE}}", label: "HR Owner Title", dataSource: "Template Default" },
      { key: "{{FACILITY_OWNER_TITLE}}", label: "Facility Owner Title", dataSource: "Template Default" },
      { key: "{{REVIEWER_NAME}}", label: "Reviewer Name", dataSource: "Organization Profile" },
      { key: "{{VERIFIER_NAME}}", label: "Verifier Name", dataSource: "Organization Profile" },
      { key: "{{PERFORMED_BY}}", label: "Performed By", dataSource: "Organization Profile" },
      { key: "{{INCIDENT_CONTACT}}", label: "Incident Contact", dataSource: "Organization Profile" },
      { key: "{{ALERT_CONTACT}}", label: "Alert Contact", dataSource: "Organization Profile" },
    ],
  },
  {
    key: "frequencies",
    label: "Review Frequencies",
    fields: [
      { key: "{{REMOTE_ACCESS_REVIEW_FREQUENCY}}", label: "Remote Access Review Frequency", dataSource: "Template Default" },
      { key: "{{LOG_REVIEW_FREQUENCY}}", label: "Log Review Frequency", dataSource: "Template Default" },
      { key: "{{VULN_SCAN_FREQUENCY}}", label: "Vulnerability Scan Frequency", dataSource: "Template Default" },
      { key: "{{REVIEW_PERIOD}}", label: "Review Period", dataSource: "Control HUB Record" },
      { key: "{{SCAN_PERIOD}}", label: "Scan Period", dataSource: "Control HUB Record" },
      { key: "{{REVIEW_MONTH}}", label: "Review Month", dataSource: "Control HUB Record" },
      { key: "{{PERIOD_START}}", label: "Period Start", dataSource: "Control HUB Record" },
      { key: "{{PERIOD_END}}", label: "Period End", dataSource: "Control HUB Record" },
      { key: "{{ANNUAL_TRAINING_DEADLINE}}", label: "Annual Training Deadline", dataSource: "Template Default" },
    ],
  },
  {
    key: "retention",
    label: "Retention",
    fields: [
      { key: "{{EVIDENCE_RETENTION_PERIOD}}", label: "Evidence Retention Period", dataSource: "Template Default" },
      { key: "{{RECORD_RETENTION}}", label: "Record Retention", dataSource: "Template Default" },
      { key: "{{TRAINING_RECORD_RETENTION}}", label: "Training Record Retention", dataSource: "Template Default" },
      { key: "{{LOG_RETENTION_DAYS}}", label: "Log Retention (Days)", dataSource: "Template Default" },
      { key: "{{FULL_BACKUP_RETENTION}}", label: "Full Backup Retention", dataSource: "Template Default" },
      { key: "{{BACKUP_RETENTION}}", label: "Backup Retention", dataSource: "Template Default" },
    ],
  },
  {
    key: "operational",
    label: "Operational Settings",
    fields: [
      { key: "{{INACTIVE_ACCOUNT_DAYS}}", label: "Inactive Account Days", dataSource: "Template Default" },
      { key: "{{LOCKOUT_ATTEMPTS}}", label: "Lockout Attempts", dataSource: "Template Default" },
      { key: "{{LOCKOUT_DURATION}}", label: "Lockout Duration", dataSource: "Template Default" },
      { key: "{{CRITICAL_VULN_DAYS}}", label: "Critical Vuln Remediation (Days)", dataSource: "Template Default" },
      { key: "{{CRITICAL_DAYS}}", label: "Critical (Days)", dataSource: "Template Default" },
      { key: "{{HIGH_DAYS}}", label: "High (Days)", dataSource: "Template Default" },
      { key: "{{MEDIUM_DAYS}}", label: "Medium (Days)", dataSource: "Template Default" },
      { key: "{{LOW_DAYS}}", label: "Low (Days)", dataSource: "Template Default" },
      { key: "{{INCIDENT_REPORT_HOURS}}", label: "Incident Report Hours", dataSource: "Template Default" },
      { key: "{{POST_INCIDENT_DAYS}}", label: "Post-Incident Review (Days)", dataSource: "Template Default" },
      { key: "{{POST_INCIDENT_REVIEW_DAYS}}", label: "Post-Incident Review Days (Alt)", dataSource: "Template Default" },
      { key: "{{TRAINING_SYSTEM}}", label: "Training System", dataSource: "User Entered" },
      { key: "{{SCAN_TOOL}}", label: "Vulnerability Scanner", dataSource: "User Entered" },
      { key: "{{SCAN_REVIEWER}}", label: "Scan Reviewer", dataSource: "Organization Profile" },
      { key: "{{BACKUP_LOCATION}}", label: "Backup Storage Location", dataSource: "User Entered" },
      { key: "{{BACKUP_TIME}}", label: "Backup Time", dataSource: "Template Default" },
    ],
  },
];

// All placeholders in sections (flat list)
const ALL_SECTION_KEYS = new Set(PLACEHOLDER_SECTIONS.flatMap((s) => s.fields.map((f) => f.key)));

type Step = 1 | 2 | 3 | 4 | 5;

const STEPS = [
  { n: 1, label: "Select Template" },
  { n: 2, label: "Confirm" },
  { n: 3, label: "Review Values" },
  { n: 4, label: "Preview & Validate" },
  { n: 5, label: "Generate & Link" },
];

const DATA_SOURCE_BADGE: Record<string, { color: string; label: string }> = {
  "Organization Profile": { color: "bg-blue-50 text-blue-700 border-blue-200", label: "Org Profile" },
  "Template Default": { color: "bg-purple-50 text-purple-700 border-purple-200", label: "Default" },
  "Control HUB Record": { color: "bg-teal-50 text-teal-700 border-teal-200", label: "Auto" },
  "User Entered": { color: "bg-orange-50 text-orange-700 border-orange-200", label: "User" },
};

export default function DocGenerate() {
  const [location] = useLocation();
  const { activeOrg } = useOrg();
  const { user } = useAuth();
  const { toast } = useToast();

  const urlParams = new URLSearchParams(window.location.search);
  const preselectedTemplateId = urlParams.get("templateId") ?? "";

  const [step, setStep] = useState<Step>(preselectedTemplateId ? 2 : 1);
  const [selectedTemplateId, setSelectedTemplateId] = useState(preselectedTemplateId);
  const [docTitle, setDocTitle] = useState("");
  const [effectiveDateStr, setEffectiveDateStr] = useState(() => new Date().toISOString().slice(0, 10));
  const [reviewDateStr, setReviewDateStr] = useState(() => {
    const d = new Date(); d.setFullYear(d.getFullYear() + 1); return d.toISOString().slice(0, 10);
  });
  const [placeholderValues, setPlaceholderValues] = useState<Record<string, string>>({});
  const [autoFilledValues, setAutoFilledValues] = useState<Record<string, string>>({});
  const [generatedDocId, setGeneratedDocId] = useState<string | null>(null);
  const [unresolved, setUnresolved] = useState<string[]>([]);
  const [showMissingOnly, setShowMissingOnly] = useState(false);
  const [blockingMissing, setBlockingMissing] = useState<string[]>([]);

  const orgId = activeOrg?.id;

  // Load template list for step 1
  const { data: templates, isLoading: templatesLoading } = useQuery({
    queryKey: ["doc-template-library-list"],
    queryFn: async () => {
      const r = await fetch("/api/doc-templates/library", { headers: authHeaders(orgId) });
      if (!r.ok) throw new Error("Failed to load templates");
      return r.json() as Promise<any[]>;
    },
    enabled: step === 1,
  });

  // Load template detail when selected
  const { data: template, isLoading: templateLoading } = useQuery({
    queryKey: ["doc-template-detail-gen", selectedTemplateId],
    queryFn: async () => {
      const r = await fetch(`/api/doc-templates/library/${selectedTemplateId}`, { headers: authHeaders(orgId) });
      if (!r.ok) throw new Error("Template not found");
      return r.json();
    },
    enabled: !!selectedTemplateId,
  });

  // Auto-set default placeholder values when template loads
  useEffect(() => {
    if (!template || !activeOrg) return;
    const orgAny = activeOrg as any;
    const today = new Date().toLocaleDateString("en-US");
    const nextYear = new Date(new Date().setFullYear(new Date().getFullYear() + 1)).toLocaleDateString("en-US");
    const now = new Date();
    const currentQuarter = `Q${Math.ceil((now.getMonth() + 1) / 3)} ${now.getFullYear()}`;

    const defaults: Record<string, string> = {
      "{{ORGANIZATION_NAME}}": activeOrg.name ?? "",
      "{{SYSTEM_NAME}}": orgAny.systemName ?? activeOrg.name ?? "",
      "{{CMMC_SCOPE_NAME}}": orgAny.assessmentScope ?? `${activeOrg.name} CUI Environment`,
      "{{ASSESSMENT_SCOPE}}": orgAny.assessmentScope ?? `${activeOrg.name} CUI Environment`,
      "{{DOCUMENT_OWNER}}": "Compliance Manager",
      "{{POLICY_OWNER}}": "Compliance Manager",
      "{{PROCEDURE_OWNER}}": "IT Administrator",
      "{{APPROVER_NAME}}": orgAny.systemOwner ?? "System Owner",
      "{{APPROVER_TITLE}}": "System Owner",
      "{{EFFECTIVE_DATE}}": today,
      "{{REVIEW_DATE}}": nextYear,
      "{{APPROVAL_DATE}}": today,
      "{{VERIFICATION_DATE}}": today,
      "{{VERSION}}": "1.0",
      "{{CLASSIFICATION}}": orgAny.defaultClassification ?? "Internal Use Only — CUI",
      "{{DOCUMENT_NUMBER_PREFIX}}": orgAny.documentNumberPrefix ?? activeOrg.shortName ?? activeOrg.name.substring(0, 4).toUpperCase(),
      "{{SECURITY_OFFICER}}": orgAny.securityOfficer ?? "Information System Security Officer (ISSO)",
      "{{SECURITY_OFFICER_TITLE}}": "Information System Security Officer (ISSO)",
      "{{SYSTEM_OWNER}}": orgAny.systemOwner ?? "System Owner",
      "{{SYSTEM_OWNER_TITLE}}": "System Owner",
      "{{IT_ADMIN}}": orgAny.itAdministrator ?? "IT Administrator",
      "{{IT_ADMIN_TITLE}}": "IT Administrator",
      "{{IT_ADMINISTRATOR}}": orgAny.itAdministrator ?? "IT Administrator",
      "{{HR_OWNER_TITLE}}": "Human Resources Manager",
      "{{FACILITY_OWNER_TITLE}}": "Facility Manager",
      "{{REVIEWER_NAME}}": orgAny.securityOfficer ?? "Information System Security Officer (ISSO)",
      "{{VERIFIER_NAME}}": orgAny.itAdministrator ?? "IT Administrator",
      "{{PERFORMED_BY}}": orgAny.securityOfficer ?? "Information System Security Officer (ISSO)",
      "{{INCIDENT_CONTACT}}": orgAny.primaryContact ?? orgAny.securityOfficer ?? "Security Officer",
      "{{ALERT_CONTACT}}": orgAny.primaryContact ?? orgAny.itAdministrator ?? "IT Administrator",
      "{{REMOTE_ACCESS_REVIEW_FREQUENCY}}": "Quarterly",
      "{{LOG_REVIEW_FREQUENCY}}": "Weekly",
      "{{VULN_SCAN_FREQUENCY}}": "Monthly",
      "{{REVIEW_PERIOD}}": currentQuarter,
      "{{SCAN_PERIOD}}": currentQuarter,
      "{{REVIEW_MONTH}}": now.toLocaleDateString("en-US", { month: "long", year: "numeric" }),
      "{{PERIOD_START}}": new Date(now.getFullYear(), 0, 1).toLocaleDateString("en-US"),
      "{{PERIOD_END}}": today,
      "{{ANNUAL_TRAINING_DEADLINE}}": "December 31",
      "{{EVIDENCE_RETENTION_PERIOD}}": "3 years",
      "{{RECORD_RETENTION}}": "3 years",
      "{{TRAINING_RECORD_RETENTION}}": "3 years",
      "{{LOG_RETENTION_DAYS}}": "1095",
      "{{FULL_BACKUP_RETENTION}}": "90 days",
      "{{BACKUP_RETENTION}}": "90 days",
      "{{INACTIVE_ACCOUNT_DAYS}}": "90",
      "{{LOCKOUT_ATTEMPTS}}": "5",
      "{{LOCKOUT_DURATION}}": "30 minutes",
      "{{CRITICAL_VULN_DAYS}}": "30",
      "{{CRITICAL_DAYS}}": "30",
      "{{HIGH_DAYS}}": "60",
      "{{MEDIUM_DAYS}}": "90",
      "{{LOW_DAYS}}": "180",
      "{{INCIDENT_REPORT_HOURS}}": "72",
      "{{POST_INCIDENT_DAYS}}": "30",
      "{{POST_INCIDENT_REVIEW_DAYS}}": "30",
      "{{TRAINING_SYSTEM}}": "[Training Management System]",
      "{{SCAN_TOOL}}": "[Vulnerability Scanner]",
      "{{SCAN_REVIEWER}}": orgAny.securityOfficer ?? "Security Officer",
      "{{BACKUP_LOCATION}}": "[Backup Storage Location]",
      "{{BACKUP_TIME}}": "02:00 AM UTC",
    };
    setAutoFilledValues(defaults);
    setPlaceholderValues(defaults);
    setDocTitle(`${template.title} — ${activeOrg.name}`);
  }, [template, activeOrg]);

  const generateMutation = useMutation({
    mutationFn: async () => {
      const r = await fetch("/api/doc-templates/generate", {
        method: "POST",
        headers: { ...authHeaders(orgId), "Content-Type": "application/json" },
        body: JSON.stringify({
          templateId: selectedTemplateId,
          title: docTitle,
          placeholderValues,
          effectiveDateStr,
          reviewDateStr,
        }),
      });
      if (!r.ok) throw new Error(await r.text());
      return r.json();
    },
    onSuccess: (data) => {
      setGeneratedDocId(data.documentId);
      setUnresolved(data.unresolved ?? []);
      setStep(5);
      toast({ title: `Document created — ${data.title}` });
    },
    onError: (e: Error) => toast({ title: "Generation failed", description: e.message, variant: "destructive" }),
  });

  const canGenerate = !!(user?.role === "admin" || user?.role === "compliance_manager");

  // Check for required missing fields before generating
  function validateAndGenerate() {
    const missing: string[] = [];
    for (const key of REQUIRED_PLACEHOLDERS) {
      const val = (placeholderValues[key] ?? "").trim();
      if (!val || /\{\{[A-Z_]+\}\}/.test(val)) {
        missing.push(key);
      }
    }
    if (missing.length > 0) {
      setBlockingMissing(missing);
      return;
    }
    setBlockingMissing([]);
    generateMutation.mutate();
  }

  // Summary counts for step 3
  const totalFields = PLACEHOLDER_SECTIONS.flatMap((s) => s.fields).length;
  const filledFields = PLACEHOLDER_SECTIONS.flatMap((s) => s.fields).filter((f) => (placeholderValues[f.key] ?? "").trim()).length;
  const missingRequired = Array.from(REQUIRED_PLACEHOLDERS).filter((k) => !(placeholderValues[k] ?? "").trim()).length;

  // Data source label for a field
  function getDataSource(field: PlaceholderField): string {
    const current = placeholderValues[field.key] ?? "";
    const auto = autoFilledValues[field.key] ?? "";
    if (!current.trim()) return "Missing";
    if (current === auto) return field.dataSource ?? "Auto-filled";
    return "User Entered";
  }

  function getLabelForKey(key: string): string {
    for (const section of PLACEHOLDER_SECTIONS) {
      const field = section.fields.find((f) => f.key === key);
      if (field) return field.label;
    }
    return key.replace(/\{\{|\}\}/g, "").replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  }

  if (!canGenerate) {
    return (
      <div className="max-w-xl mx-auto mt-20 text-center">
        <AlertTriangle className="h-10 w-10 text-orange-400 mx-auto mb-3" />
        <h2 className="text-xl font-bold mb-2">Access Required</h2>
        <p className="text-muted-foreground">Only Compliance Managers and Admins can generate documents.</p>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link href="/documents/templates">
          <Button variant="ghost" size="sm"><ArrowLeft className="h-4 w-4 mr-1.5" /> Template Library</Button>
        </Link>
      </div>
      <div>
        <h1 className="text-2xl font-bold">Generate Document</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Generate a CMMC compliance document from a template for {activeOrg?.name ?? "your organization"}.
        </p>
      </div>

      {/* Step indicator */}
      <div className="flex items-center gap-1 overflow-x-auto pb-1">
        {STEPS.map((s, i) => (
          <div key={s.n} className="flex items-center gap-1 shrink-0">
            <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
              step === s.n ? "bg-primary text-primary-foreground" :
              step > s.n ? "bg-green-100 text-green-700" :
              "bg-muted text-muted-foreground"
            }`}>
              {step > s.n ? <CheckCircle2 className="h-3 w-3" /> : <span className="w-3 text-center">{s.n}</span>}
              <span className="hidden sm:inline">{s.label}</span>
            </div>
            {i < STEPS.length - 1 && <div className="h-px w-3 bg-border" />}
          </div>
        ))}
      </div>

      {/* ── Step 1: Select Template ────────────────────────────────────────────── */}
      {step === 1 && (
        <Card>
          <CardHeader><CardTitle className="text-sm">Step 1 — Select Template</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            {templatesLoading ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground py-4"><Loader2 className="h-4 w-4 animate-spin" /> Loading templates…</div>
            ) : (
              <Select value={selectedTemplateId} onValueChange={setSelectedTemplateId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a template…" />
                </SelectTrigger>
                <SelectContent className="max-h-72 overflow-y-auto">
                  {(templates ?? []).map((t: any) => (
                    <SelectItem key={t.id} value={t.id}>
                      <span className="font-mono text-xs mr-2 text-muted-foreground">{t.sourceTemplateId}</span>
                      {t.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            <div className="flex justify-end">
              <Button disabled={!selectedTemplateId} onClick={() => setStep(2)}>
                Next <ArrowRight className="h-4 w-4 ml-1.5" />
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Step 2: Confirm Document Information ────────────────────────────────── */}
      {step === 2 && (
        <Card>
          <CardHeader><CardTitle className="text-sm">Step 2 — Confirm Document Information</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            {templateLoading ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</div>
            ) : template ? (
              <>
                {/* Template summary */}
                <div className="rounded-md border bg-muted/20 p-3 space-y-2">
                  <div className="flex items-center gap-2">
                    <code className="text-xs font-mono bg-muted px-2 py-0.5 rounded">{template.sourceTemplateId}</code>
                    <Badge variant="outline" className="text-xs">{template.artifactTypeLabel}</Badge>
                  </div>
                  <h3 className="font-semibold text-sm">{template.title}</h3>
                  {template.purpose && <p className="text-xs text-muted-foreground border-l-2 border-primary/30 pl-2">{template.purpose}</p>}
                  <div className="text-xs text-muted-foreground">
                    {template.controlMaps?.length ?? 0} controls · {template.procedureSteps?.length ?? 0} procedure steps · {template.records?.length ?? 0} records
                  </div>
                </div>

                {/* Document fields */}
                <div className="space-y-3">
                  <div>
                    <Label className="text-xs font-medium">Document Title <span className="text-red-500">*</span></Label>
                    <Input value={docTitle} onChange={(e) => setDocTitle(e.target.value)} className="mt-1" />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label className="text-xs font-medium">Effective Date <span className="text-red-500">*</span></Label>
                      <Input type="date" value={effectiveDateStr} onChange={(e) => setEffectiveDateStr(e.target.value)} className="mt-1" />
                    </div>
                    <div>
                      <Label className="text-xs font-medium">Next Review Date <span className="text-red-500">*</span></Label>
                      <Input type="date" value={reviewDateStr} onChange={(e) => setReviewDateStr(e.target.value)} className="mt-1" />
                    </div>
                  </div>
                </div>
              </>
            ) : null}
            <div className="flex gap-2 justify-between">
              <Button variant="outline" onClick={() => setStep(1)}>Back</Button>
              <Button onClick={() => setStep(3)} disabled={!template || !docTitle.trim()}>
                Next <ArrowRight className="h-4 w-4 ml-1.5" />
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Step 3: Review Auto-Filled Values ───────────────────────────────────── */}
      {step === 3 && (
        <Card>
          <CardHeader>
            <div className="flex items-start justify-between gap-3">
              <CardTitle className="text-sm">Step 3 — Review Auto-Filled Values</CardTitle>
              <div className="flex items-center gap-2 shrink-0">
                <Label htmlFor="missing-toggle" className="text-xs text-muted-foreground cursor-pointer">
                  {showMissingOnly ? <Eye className="h-3.5 w-3.5 inline mr-1" /> : <EyeOff className="h-3.5 w-3.5 inline mr-1" />}
                  Show Missing Only
                </Label>
                <Switch
                  id="missing-toggle"
                  checked={showMissingOnly}
                  onCheckedChange={setShowMissingOnly}
                  className="data-[state=checked]:bg-amber-500"
                />
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Summary cards */}
            <div className="grid grid-cols-3 gap-3">
              <div className="rounded-md border bg-blue-50/50 p-3 text-center">
                <p className="text-lg font-bold text-blue-700">{totalFields}</p>
                <p className="text-xs text-blue-600">Total Fields</p>
              </div>
              <div className="rounded-md border bg-green-50/50 p-3 text-center">
                <p className="text-lg font-bold text-green-700">{filledFields}</p>
                <p className="text-xs text-green-600">Filled</p>
              </div>
              <div className={`rounded-md border p-3 text-center ${missingRequired > 0 ? "bg-red-50/50" : "bg-emerald-50/50"}`}>
                <p className={`text-lg font-bold ${missingRequired > 0 ? "text-red-700" : "text-emerald-700"}`}>{missingRequired}</p>
                <p className={`text-xs ${missingRequired > 0 ? "text-red-600" : "text-emerald-600"}`}>Required Missing</p>
              </div>
            </div>

            <p className="text-xs text-muted-foreground">Review and edit placeholder values. All fields are pre-filled from your organization data.</p>

            {/* Sections */}
            <div className="space-y-5 max-h-[480px] overflow-y-auto pr-1">
              {PLACEHOLDER_SECTIONS.map((section) => {
                const visibleFields = section.fields.filter((f) => {
                  if (showMissingOnly) return !(placeholderValues[f.key] ?? "").trim();
                  return true;
                });
                if (visibleFields.length === 0) return null;

                return (
                  <div key={section.key}>
                    <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2 pb-1 border-b">
                      {section.label}
                    </h3>
                    <div className="space-y-2">
                      {visibleFields.map((field) => {
                        const isMissing = !(placeholderValues[field.key] ?? "").trim();
                        const dataSource = getDataSource(field);
                        const dsStyle = DATA_SOURCE_BADGE[dataSource] ?? DATA_SOURCE_BADGE["User Entered"];

                        return (
                          <div key={field.key} className={`rounded-md border p-2 ${isMissing && field.required ? "border-red-200 bg-red-50/30" : "bg-transparent"}`}>
                            <div className="flex items-center justify-between mb-1">
                              <Label className="text-xs font-medium flex items-center gap-1.5">
                                {field.label}
                                {field.required && <span className="text-red-500 text-[10px] font-bold">Required</span>}
                              </Label>
                              <div className="flex items-center gap-1.5">
                                <Badge variant="outline" className={`text-[10px] h-4 px-1 ${dsStyle?.color ?? ""}`}>
                                  {dataSource === "Missing" ? "Missing" : dsStyle?.label}
                                </Badge>
                              </div>
                            </div>
                            <Input
                              value={placeholderValues[field.key] ?? ""}
                              onChange={(e) => setPlaceholderValues((prev) => ({ ...prev, [field.key]: e.target.value }))}
                              className={`text-xs h-8 ${isMissing && field.required ? "border-red-300 focus:ring-red-200" : ""}`}
                              placeholder={`Enter ${field.label}…`}
                            />
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="flex gap-2 justify-between">
              <Button variant="outline" onClick={() => setStep(2)}>Back</Button>
              <Button onClick={() => { setShowMissingOnly(false); setStep(4); }}>
                Preview <Eye className="h-4 w-4 ml-1.5" />
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Step 4: Preview & Validate ────────────────────────────────────────── */}
      {step === 4 && template && (
        <Card>
          <CardHeader><CardTitle className="text-sm">Step 4 — Preview & Validate</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="border rounded-lg overflow-hidden">
              {/* Cover */}
              <div className="bg-[#1a3a5c] text-white p-4 text-center">
                <p className="text-xs text-blue-200 mb-1">Control HUB — CMMC Compliance Platform</p>
                <h2 className="text-lg font-bold">{docTitle || template.title}</h2>
                <p className="text-xs text-blue-200 mt-1">{template.sourceTemplateId} · {template.artifactTypeLabel}</p>
              </div>
              <div className="p-4 space-y-4 bg-white text-sm max-h-80 overflow-y-auto">
                <div className="grid grid-cols-2 gap-2 text-xs border-b pb-3">
                  {[
                    ["Organization", placeholderValues["{{ORGANIZATION_NAME}}"] || activeOrg?.name],
                    ["Effective Date", placeholderValues["{{EFFECTIVE_DATE}}"]],
                    ["Next Review", placeholderValues["{{REVIEW_DATE}}"]],
                    ["Version", placeholderValues["{{VERSION}}"] || "1.0"],
                    ["Classification", placeholderValues["{{CLASSIFICATION}}"]],
                    ["Approver", placeholderValues["{{APPROVER_NAME}}"]],
                  ].map(([k, v]) => (
                    <div key={k as string}>
                      <span className="font-semibold text-gray-500">{k}: </span>
                      <span className={!v ? "text-red-400 italic" : ""}>{v || "Not filled"}</span>
                    </div>
                  ))}
                </div>
                {template.purpose && (
                  <div>
                    <h4 className="font-semibold text-gray-800 mb-1">1. Purpose</h4>
                    <p className="text-gray-600 text-xs">{applyPreviewPlaceholders(template.purpose, placeholderValues)}</p>
                  </div>
                )}
                {template.roles?.length > 0 && (
                  <div>
                    <h4 className="font-semibold text-gray-800 mb-1">Roles & Responsibilities</h4>
                    <ul className="list-disc ml-4 text-xs text-gray-600 space-y-0.5">
                      {template.roles.slice(0, 3).map((r: any, i: number) => (
                        <li key={i}>{applyPreviewPlaceholders(r.roleText, placeholderValues)}</li>
                      ))}
                    </ul>
                  </div>
                )}
                <p className="text-xs text-muted-foreground italic">
                  … {template.requirements?.length ?? 0} requirements, {template.procedureSteps?.length ?? 0} procedure steps, {template.records?.length ?? 0} records in full document
                </p>
              </div>
            </div>

            {/* Blocking error: required placeholders missing */}
            {blockingMissing.length > 0 && (
              <div className="rounded-md border border-red-200 bg-red-50 p-4">
                <p className="text-sm font-semibold text-red-700 flex items-center gap-1.5 mb-2">
                  <AlertTriangle className="h-4 w-4" />
                  {blockingMissing.length} required field{blockingMissing.length !== 1 ? "s" : ""} must be filled before generating
                </p>
                <ul className="mb-3 space-y-1">
                  {blockingMissing.map((k) => (
                    <li key={k} className="text-xs text-red-600 flex items-center gap-1.5">
                      <span className="h-1 w-1 rounded-full bg-red-400 shrink-0" />
                      {getLabelForKey(k)}
                    </li>
                  ))}
                </ul>
                <Button
                  size="sm"
                  variant="outline"
                  className="border-red-300 text-red-700 hover:bg-red-50"
                  onClick={() => { setBlockingMissing([]); setShowMissingOnly(true); setStep(3); }}
                >
                  Return to Missing Fields
                </Button>
              </div>
            )}

            {/* Non-blocking warnings */}
            {blockingMissing.length === 0 && missingRequired === 0 && (
              <div className="rounded-md border border-green-200 bg-green-50 p-3 flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-green-600 shrink-0" />
                <p className="text-xs text-green-700 font-medium">All required fields are filled. Ready to generate.</p>
              </div>
            )}

            <div className="flex gap-2 justify-between">
              <Button variant="outline" onClick={() => setStep(3)}>Back</Button>
              <Button
                onClick={validateAndGenerate}
                disabled={generateMutation.isPending}
              >
                {generateMutation.isPending
                  ? <><Loader2 className="h-4 w-4 mr-1.5 animate-spin" />Generating…</>
                  : <><Plus className="h-4 w-4 mr-1.5" />Generate &amp; Save</>}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Step 5: Generated ─────────────────────────────────────────────────── */}
      {step === 5 && generatedDocId && (
        <Card className="border-green-200 bg-green-50/40">
          <CardHeader>
            <CardTitle className="text-sm flex items-center gap-2 text-green-800">
              <CheckCircle2 className="h-5 w-5 text-green-600" />
              Document Generated Successfully
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="text-sm text-green-800 space-y-1">
              <p className="font-semibold">{docTitle}</p>
              <p className="text-xs text-muted-foreground">Status: Draft · Linked to {template?.controlMaps?.length ?? 0} controls</p>
            </div>

            {unresolved.length > 0 && (
              <div className="rounded-md border border-orange-200 bg-orange-50 p-3">
                <p className="text-xs font-semibold text-orange-700 mb-1.5 flex items-center gap-1.5">
                  <AlertTriangle className="h-3.5 w-3.5" />
                  {unresolved.length} unresolved placeholder{unresolved.length > 1 ? "s" : ""} in document body
                </p>
                <div className="flex flex-wrap gap-1">
                  {unresolved.map((p) => (
                    <code key={p} className="text-xs bg-orange-100 text-orange-800 px-1.5 py-0.5 rounded">{p}</code>
                  ))}
                </div>
              </div>
            )}

            <div className="flex flex-wrap gap-2">
              <Link href={`/documents/${generatedDocId}`}>
                <Button variant="outline" size="sm">
                  <Eye className="h-3.5 w-3.5 mr-1.5" /> View Document
                </Button>
              </Link>
              <a
                href={`/api/doc-templates/generated/${generatedDocId}/docx`}
                onClick={(e) => {
                  e.preventDefault();
                  const headers = authHeaders(orgId);
                  fetch(`/api/doc-templates/generated/${generatedDocId}/docx`, { headers })
                    .then((r) => r.blob())
                    .then((blob) => {
                      const url = URL.createObjectURL(blob);
                      const a = document.createElement("a");
                      a.href = url; a.download = `${template?.sourceTemplateId ?? "document"}.docx`; a.click();
                      URL.revokeObjectURL(url);
                    });
                }}>
                <Button size="sm" className="bg-[#1a3a5c] hover:bg-[#143050] text-white">
                  <FileDown className="h-3.5 w-3.5 mr-1.5" /> Download DOCX
                </Button>
              </a>
              <a
                href={`/api/doc-templates/generated/${generatedDocId}/pdf`}
                onClick={(e) => {
                  e.preventDefault();
                  const headers = authHeaders(orgId);
                  fetch(`/api/doc-templates/generated/${generatedDocId}/pdf`, { headers })
                    .then((r) => r.blob())
                    .then((blob) => {
                      const url = URL.createObjectURL(blob);
                      const a = document.createElement("a");
                      a.href = url; a.download = `${template?.sourceTemplateId ?? "document"}.pdf`; a.click();
                      URL.revokeObjectURL(url);
                    });
                }}>
                <Button size="sm" variant="outline">
                  <FileDown className="h-3.5 w-3.5 mr-1.5" /> Download PDF
                </Button>
              </a>
              <Button variant="ghost" size="sm" onClick={() => {
                setStep(1); setSelectedTemplateId(""); setGeneratedDocId(null); setBlockingMissing([]);
              }}>
                Generate Another
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function applyPreviewPlaceholders(text: string, values: Record<string, string>): string {
  let result = text;
  for (const [key, val] of Object.entries(values)) {
    result = result.replaceAll(key, val || key);
  }
  return result;
}
