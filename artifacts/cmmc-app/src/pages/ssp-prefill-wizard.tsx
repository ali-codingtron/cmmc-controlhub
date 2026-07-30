/**
 * SSP Pre-fill Wizard
 *
 * 8-step guided wizard that collects organization, document-control, system-scope,
 * architecture, roles, and requirement fields, then generates a pre-filled DOCX
 * from the appropriate Control HUB SSP master template.
 *
 * Route: /ssp/prefill-wizard?templateKey=<key>[&draft=<draftId>]
 */

import { useState, useEffect, useRef, useCallback } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useOrg } from "@/context/OrgContext";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ChevronLeft,
  ChevronRight,
  Download,
  Save,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  ArrowLeft,
  FileText,
  Building2,
  FileEdit,
  Server,
  Shield,
  Users,
  ClipboardList,
  Eye,
  Wand2,
  DatabaseZap,
} from "lucide-react";

// ── helpers ───────────────────────────────────────────────────────────────────

function apiHeaders(orgId?: string) {
  const token = localStorage.getItem("auth_token");
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
    ...(orgId ? { "X-Organization-ID": orgId } : {}),
  };
}

function useSearchParam(name: string): string | null {
  return new URLSearchParams(window.location.search).get(name);
}

// ── types ─────────────────────────────────────────────────────────────────────

interface SSPTemplate {
  templateKey: string;
  name: string;
  cmmcLevel: 1 | 2;
  protectedInfoType: "FCI" | "CUI";
  requirementCount: number;
  badges: string[];
}

interface OrgProfile {
  name: string | null;
  legalName: string | null;
  shortName: string | null;
  cageCode: string | null;
  uei: string | null;
  industry: string | null;
  primaryContact: string | null;
  organizationAddress: string | null;
  assessmentScope: string | null;
}

interface Draft {
  id: string;
  templateKey: string;
  title: string;
  status: string;
  wizardStep: number;
  valuesJson: string;
}

// ── L1 requirement definitions ─────────────────────────────────────────────────

const L1_REQUIREMENTS = [
  { key: "AC_L1_3_1_1", ref: "AC.L1-3.1.1", title: "Limit access to authorized users, processes, and devices" },
  { key: "AC_L1_3_1_2", ref: "AC.L1-3.1.2", title: "Limit access to types of transactions and functions authorized users are permitted to execute" },
  { key: "AC_L1_3_1_20", ref: "AC.L1-3.1.20", title: "Verify and control/limit connections to external information systems" },
  { key: "AC_L1_3_1_22", ref: "AC.L1-3.1.22", title: "Control information posted or processed on publicly accessible information systems" },
  { key: "IA_L1_3_5_1", ref: "IA.L1-3.5.1", title: "Identify information system users, processes acting on behalf of users, and devices" },
  { key: "IA_L1_3_5_2", ref: "IA.L1-3.5.2", title: "Authenticate (or verify) the identities of those users, processes, or devices" },
  { key: "MP_L1_3_8_3", ref: "MP.L1-3.8.3", title: "Sanitize or destroy information system media before disposal or reuse" },
  { key: "PE_L1_3_10_1", ref: "PE.L1-3.10.1", title: "Limit physical access to organizational information systems, equipment, and operating environments" },
  { key: "PE_L1_3_10_3", ref: "PE.L1-3.10.3", title: "Escort visitors and monitor visitor activity" },
  { key: "PE_L1_3_10_4", ref: "PE.L1-3.10.4", title: "Maintain audit logs of physical access" },
  { key: "PE_L1_3_10_5", ref: "PE.L1-3.10.5", title: "Control and manage physical access devices" },
  { key: "SC_L1_3_13_1", ref: "SC.L1-3.13.1", title: "Monitor, control, and protect organizational communications at external boundaries and key internal boundaries" },
  { key: "SC_L1_3_13_5", ref: "SC.L1-3.13.5", title: "Implement subnetworks for publicly accessible system components that are physically or logically separated" },
  { key: "SI_L1_3_14_1", ref: "SI.L1-3.14.1", title: "Identify, report, and correct information and information system flaws in a timely manner" },
  { key: "SI_L1_3_14_2", ref: "SI.L1-3.14.2", title: "Provide protection from malicious code at appropriate locations within organizational information systems" },
  { key: "SI_L1_3_14_4", ref: "SI.L1-3.14.4", title: "Update malicious code protection mechanisms when new releases are available" },
  { key: "SI_L1_3_14_5", ref: "SI.L1-3.14.5", title: "Perform periodic scans of the information system and real-time scans of files from external sources" },
];

const STATUS_OPTIONS = [
  { value: "MET", label: "Met" },
  { value: "NOT_MET", label: "Not Met" },
  { value: "NOT_APPLICABLE", label: "Not Applicable" },
  { value: "NEEDS_CONFIRMATION", label: "Needs Confirmation" },
];

// ── Step config ───────────────────────────────────────────────────────────────

const STEPS = [
  { id: 1, label: "Template", icon: FileText },
  { id: 2, label: "Org Profile", icon: Building2 },
  { id: 3, label: "Doc Control", icon: FileEdit },
  { id: 4, label: "System Scope", icon: Server },
  { id: 5, label: "Architecture", icon: Shield },
  { id: 6, label: "Roles", icon: Users },
  { id: 7, label: "Requirements", icon: ClipboardList },
  { id: 8, label: "Review", icon: Eye },
];

// ── Field component ───────────────────────────────────────────────────────────

function Field({
  label,
  name,
  values,
  onChange,
  multiline = false,
  placeholder,
  hint,
  required = false,
}: {
  label: string;
  name: string;
  values: Record<string, string>;
  onChange: (name: string, val: string) => void;
  multiline?: boolean;
  placeholder?: string;
  hint?: string;
  required?: boolean;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={name} className="text-sm font-medium">
        {label}{required && <span className="text-red-500 ml-0.5">*</span>}
      </Label>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      {multiline ? (
        <Textarea
          id={name}
          rows={4}
          value={values[name] ?? ""}
          onChange={(e) => onChange(name, e.target.value)}
          placeholder={placeholder}
          className="text-sm resize-y"
        />
      ) : (
        <Input
          id={name}
          value={values[name] ?? ""}
          onChange={(e) => onChange(name, e.target.value)}
          placeholder={placeholder}
          className="text-sm"
        />
      )}
    </div>
  );
}

// ── Step 7 L2 sub-component ────────────────────────────────────────────────────

interface ImportResult {
  imported: number;
  skipped: number;
  overwritten: number;
  total: number;
}

function Step7L2({
  draftId,
  orgId,
  values,
  setValues,
}: {
  draftId: string | null;
  orgId: string | undefined;
  values: Record<string, string>;
  setValues: React.Dispatch<React.SetStateAction<Record<string, string>>>;
}) {
  const { toast } = useToast();
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [overwriteExisting, setOverwriteExisting] = useState(false);

  // Count how many narrative keys are already filled
  const filledCount = Object.entries(values).filter(
    ([k, v]) => k.endsWith("_IMPLEMENTATION_NARRATIVE") && v?.trim()
  ).length;

  async function handleImport() {
    if (!draftId || !orgId) {
      toast({ title: "Save the draft first before importing", variant: "destructive" });
      return;
    }
    setImporting(true);
    try {
      const token = localStorage.getItem("auth_token");
      const r = await fetch(`/api/ssp/prefill-drafts/${draftId}/import-mappings`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
          "X-Organization-ID": orgId,
        },
        body: JSON.stringify({ overwrite: overwriteExisting }),
      });
      if (!r.ok) {
        const err = await r.json().catch(() => ({}));
        throw new Error((err as { error?: string }).error || "Import failed");
      }
      const data = await r.json() as { imported: number; skipped: number; overwritten: number; total: number; draft: { valuesJson: string } };
      // Merge new values into local state
      try {
        const merged = JSON.parse(data.draft.valuesJson) as Record<string, string>;
        setValues(merged);
      } catch {
        // ignore parse failure — server saved it, local state stays
      }
      setImportResult({ imported: data.imported, skipped: data.skipped, overwritten: data.overwritten ?? 0, total: data.total });
      const newCount = data.imported + (data.overwritten ?? 0);
      if (newCount > 0) {
        const parts: string[] = [];
        if (data.imported > 0) parts.push(`${data.imported} new`);
        if ((data.overwritten ?? 0) > 0) parts.push(`${data.overwritten} overwritten`);
        toast({
          title: `${newCount} narrative${newCount === 1 ? "" : "s"} imported`,
          description: `${parts.join(", ")}${data.skipped > 0 ? `. ${data.skipped} field${data.skipped === 1 ? "" : "s"} preserved.` : "."}`,
        });
      } else {
        toast({
          title: "No new narratives found",
          description: "Your SSP Mappings page has no narratives yet, or all fields were already filled.",
        });
      }
    } catch (e) {
      toast({
        title: "Import failed",
        description: e instanceof Error ? e.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setImporting(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h2 className="text-lg font-semibold">Level 2 — Requirement Narratives</h2>
        <p className="text-sm text-muted-foreground">
          The CMMC Level 2 template contains all 110 NIST SP 800-171 requirements. If you
          have already entered implementation narratives on the SSP Mappings page, import
          them here to pre-populate the generated document.
        </p>
      </div>

      {/* Import card */}
      <Card className="border-blue-200">
        <CardContent className="pt-5 pb-5 space-y-4">
          <div className="flex items-start gap-3">
            <DatabaseZap className="h-5 w-5 text-blue-600 flex-shrink-0 mt-0.5" />
            <div className="flex-1 space-y-1">
              <p className="font-medium text-sm">Import from SSP Mappings</p>
              <p className="text-xs text-muted-foreground">
                Reads your organization's primary SSP document's control mappings and pulls
                each implementation narrative into the draft.{" "}
                {overwriteExisting
                  ? "All matching fields will be replaced with SSP Mappings content."
                  : "Fields you have already filled will not be overwritten."}
              </p>
            </div>
          </div>

          {/* Overwrite toggle */}
          <label className="flex items-center gap-2.5 cursor-pointer select-none w-fit">
            <input
              type="checkbox"
              checked={overwriteExisting}
              onChange={(e) => {
                setOverwriteExisting(e.target.checked);
                setImportResult(null);
              }}
              className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
            <span className="text-sm font-medium">Overwrite existing narratives</span>
          </label>
          {overwriteExisting && (
            <div className="rounded-md bg-amber-50 border border-amber-200 px-3 py-2 text-amber-800 text-xs flex items-start gap-2">
              <AlertTriangle className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
              <span>
                Any narratives you have already entered in this draft will be replaced with
                content from SSP Mappings. This cannot be undone.
              </span>
            </div>
          )}

          {filledCount > 0 && !importResult && (
            <div className="rounded-md bg-green-50 border border-green-200 px-3 py-2 text-green-800 text-xs flex items-center gap-2">
              <CheckCircle2 className="h-3.5 w-3.5 flex-shrink-0" />
              <span>{filledCount} narrative{filledCount === 1 ? "" : "s"} already in this draft.</span>
            </div>
          )}

          {importResult && (
            <div className={`rounded-md border px-3 py-2 text-xs flex items-start gap-2 ${
              importResult.imported > 0 || importResult.overwritten > 0
                ? "bg-green-50 border-green-200 text-green-800"
                : "bg-amber-50 border-amber-200 text-amber-800"
            }`}>
              <CheckCircle2 className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
              <span>
                {importResult.imported > 0 || importResult.overwritten > 0 ? (
                  <>
                    {importResult.imported > 0 && (
                      <><strong>{importResult.imported}</strong> narrative{importResult.imported === 1 ? "" : "s"} imported. </>
                    )}
                    {importResult.overwritten > 0 && (
                      <><strong>{importResult.overwritten}</strong> narrative{importResult.overwritten === 1 ? "" : "s"} overwritten. </>
                    )}
                    {importResult.skipped > 0 && (
                      <>{importResult.skipped} existing field{importResult.skipped === 1 ? "" : "s"} preserved.</>
                    )}
                  </>
                ) : (
                  <>No new narratives to import — SSP Mappings page is empty or all fields already filled.</>
                )}
              </span>
            </div>
          )}

          <Button
            variant="outline"
            size="sm"
            onClick={handleImport}
            disabled={importing || !draftId}
            className="gap-2"
          >
            {importing ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <DatabaseZap className="h-4 w-4" />
            )}
            {importing ? "Importing…" : importResult ? "Re-import from SSP Mappings" : "Import from SSP Mappings"}
          </Button>

          {!draftId && (
            <p className="text-xs text-muted-foreground">
              Click Next or Save on a previous step to create the draft first.
            </p>
          )}
        </CardContent>
      </Card>

      {/* Fallback workflow */}
      <div className="rounded-lg border bg-muted/30 p-5 space-y-3 text-sm">
        <p className="font-medium">If you haven't filled the Mappings page yet</p>
        <ol className="list-decimal list-inside space-y-1.5 text-muted-foreground">
          <li>Generate the pre-filled template now to get the shell document.</li>
          <li>Open <strong>SSP → Mappings</strong> in Control HUB and enter narratives there.</li>
          <li>Return to this wizard and click <em>Import from SSP Mappings</em> to pull them in.</li>
          <li>Re-generate the document to get the fully pre-populated DOCX.</li>
        </ol>
        <Button variant="outline" size="sm" asChild>
          <a href="/ssp/mappings">Open SSP Mappings →</a>
        </Button>
      </div>

      <div className="rounded-md border border-amber-100 bg-amber-50/60 px-4 py-3 text-amber-800 text-xs flex items-start gap-2">
        <AlertTriangle className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
        <span>
          Do not assert Met or Not Applicable for any requirement unless supported by actual
          implementation, scope rationale, and supporting evidence.
        </span>
      </div>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function SspPrefillWizard() {
  const { activeOrg } = useOrg();
  const { toast } = useToast();
  const [, navigate] = useLocation();

  const templateKeyParam = useSearchParam("templateKey");
  const draftIdParam = useSearchParam("draft");

  const [step, setStep] = useState(1);
  const [draftId, setDraftId] = useState<string | null>(draftIdParam);
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [values, setValues] = useState<Record<string, string>>({});
  const valuesRef = useRef(values);
  valuesRef.current = values;

  // ── Fetch compatible templates ──────────────────────────────────────────────
  const { data: templates } = useQuery<SSPTemplate[]>({
    queryKey: ["ssp-templates", activeOrg?.id],
    queryFn: async () => {
      const r = await fetch("/api/ssp/templates", {
        headers: apiHeaders(activeOrg?.id),
      });
      if (!r.ok) return [];
      return r.json();
    },
    enabled: !!activeOrg?.id,
  });

  // ── Fetch org profile for auto-fill ────────────────────────────────────────
  const { data: orgProfile } = useQuery<OrgProfile>({
    queryKey: ["ssp-org-profile", activeOrg?.id],
    queryFn: async () => {
      const r = await fetch("/api/ssp/prefill-org-profile", {
        headers: apiHeaders(activeOrg?.id),
      });
      if (!r.ok) return {} as OrgProfile;
      return r.json();
    },
    enabled: !!activeOrg?.id,
  });

  // ── Load existing draft ────────────────────────────────────────────────────
  const { data: existingDraft } = useQuery<Draft>({
    queryKey: ["ssp-prefill-draft", draftId],
    queryFn: async () => {
      const r = await fetch(`/api/ssp/prefill-drafts/${draftId}`, {
        headers: apiHeaders(activeOrg?.id),
      });
      if (!r.ok) throw new Error("Draft not found");
      return r.json();
    },
    enabled: !!draftId && !!activeOrg?.id,
  });

  // Pre-fill from org profile + existing draft
  useEffect(() => {
    if (existingDraft) {
      try {
        setValues(JSON.parse(existingDraft.valuesJson));
      } catch {
        // ignore
      }
      setStep(existingDraft.wizardStep ?? 1);
      return;
    }
    if (orgProfile) {
      setValues((prev) => ({
        templateKey: templateKeyParam ?? (templates?.[0]?.templateKey ?? ""),
        organizationName: prev.organizationName || orgProfile.name || "",
        organizationLegalName: prev.organizationLegalName || orgProfile.legalName || "",
        organizationShortName: prev.organizationShortName || orgProfile.shortName || "",
        cageCodes: prev.cageCodes || orgProfile.cageCode || "",
        uei: prev.uei || orgProfile.uei || "",
        industry: prev.industry || orgProfile.industry || "",
        primaryContactName: prev.primaryContactName || orgProfile.primaryContact || "",
        organizationAddress: prev.organizationAddress || orgProfile.organizationAddress || "",
        assessmentScopeDescription: prev.assessmentScopeDescription || orgProfile.assessmentScope || "",
        ...prev,
      }));
    }
  }, [orgProfile, existingDraft, templateKeyParam, templates]);

  // ── Value setter ──────────────────────────────────────────────────────────
  const setVal = useCallback((name: string, val: string) => {
    setValues((prev) => ({ ...prev, [name]: val }));
  }, []);

  // ── Save draft ────────────────────────────────────────────────────────────
  async function saveDraft(nextStep: number): Promise<string | null> {
    const currentValues = valuesRef.current;
    const templateKey = currentValues.templateKey || templateKeyParam || templates?.[0]?.templateKey;
    if (!templateKey) return draftId;

    setSaving(true);
    try {
      if (!draftId) {
        const r = await fetch("/api/ssp/prefill-drafts", {
          method: "POST",
          headers: apiHeaders(activeOrg?.id),
          body: JSON.stringify({
            templateKey,
            title: currentValues.documentTitle || `SSP Pre-fill — ${activeOrg?.name || "Draft"}`,
            valuesJson: JSON.stringify(currentValues),
            wizardStep: nextStep,
          }),
        });
        if (!r.ok) throw new Error("Could not create draft");
        const created = (await r.json()) as Draft;
        setDraftId(created.id);
        return created.id;
      } else {
        await fetch(`/api/ssp/prefill-drafts/${draftId}`, {
          method: "PATCH",
          headers: apiHeaders(activeOrg?.id),
          body: JSON.stringify({
            valuesJson: JSON.stringify(currentValues),
            wizardStep: nextStep,
            title: currentValues.documentTitle || undefined,
          }),
        });
        return draftId;
      }
    } catch {
      toast({ title: "Auto-save failed", variant: "destructive" });
      return draftId;
    } finally {
      setSaving(false);
    }
  }

  // ── Navigate steps ─────────────────────────────────────────────────────────
  async function goNext() {
    const next = step + 1;
    await saveDraft(next);
    setStep(next);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function goBack() {
    const prev = step - 1;
    setStep(prev);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  // ── Generate DOCX ─────────────────────────────────────────────────────────
  async function handleGenerate() {
    const id = await saveDraft(8);
    if (!id) {
      toast({ title: "Save failed — cannot generate", variant: "destructive" });
      return;
    }
    setGenerating(true);
    try {
      const r = await fetch(`/api/ssp/prefill-drafts/${id}/generate`, {
        method: "POST",
        headers: apiHeaders(activeOrg?.id),
      });
      if (!r.ok) {
        const err = await r.json().catch(() => ({}));
        throw new Error((err as { error?: string }).error || "Generation failed");
      }
      const blob = await r.blob();
      const disp = r.headers.get("Content-Disposition") || "";
      const fnMatch = disp.match(/filename="([^"]+)"/);
      const filename = fnMatch ? fnMatch[1] : "SSP_Draft.docx";
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast({ title: "SSP draft generated", description: "Check your downloads folder." });
    } catch (e) {
      toast({
        title: "Generation failed",
        description: e instanceof Error ? e.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setGenerating(false);
    }
  }

  // ── Derived values ────────────────────────────────────────────────────────
  const selectedTemplateKey = values.templateKey || templateKeyParam || templates?.[0]?.templateKey || "";
  const selectedTemplate = templates?.find((t) => t.templateKey === selectedTemplateKey);
  const isL1 = selectedTemplate?.cmmcLevel === 1;

  // ── Step renderers ─────────────────────────────────────────────────────────

  function renderStep1() {
    return (
      <div className="space-y-6">
        <div className="space-y-1">
          <h2 className="text-lg font-semibold">Select Template &amp; Draft Title</h2>
          <p className="text-sm text-muted-foreground">
            Choose the SSP template that matches your compliance package. The wizard will
            pre-fill the template with your organization's data.
          </p>
        </div>

        {templates && templates.length > 1 && (
          <div className="space-y-2">
            <Label className="text-sm font-medium">SSP Template<span className="text-red-500 ml-0.5">*</span></Label>
            <div className="grid gap-3">
              {templates.map((t) => (
                <div
                  key={t.templateKey}
                  onClick={() => setVal("templateKey", t.templateKey)}
                  className={`cursor-pointer rounded-lg border-2 p-4 transition-colors ${
                    selectedTemplateKey === t.templateKey
                      ? "border-blue-500 bg-blue-50"
                      : "border-border hover:border-blue-200"
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <div className={`mt-0.5 h-4 w-4 rounded-full border-2 flex-shrink-0 ${
                      selectedTemplateKey === t.templateKey
                        ? "border-blue-500 bg-blue-500"
                        : "border-gray-400"
                    }`} />
                    <div>
                      <p className="font-medium text-sm">{t.name}</p>
                      <div className="flex flex-wrap gap-1 mt-1.5">
                        {t.badges.slice(0, 5).map((b) => (
                          <Badge key={b} variant="secondary" className="text-xs">{b}</Badge>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {templates && templates.length === 1 && (
          <div className="rounded-lg border bg-muted/30 p-4 space-y-2">
            <p className="text-sm font-medium">Template assigned to your organization:</p>
            <p className="text-sm text-muted-foreground">{templates[0].name}</p>
            <div className="flex flex-wrap gap-1">
              {templates[0].badges.slice(0, 5).map((b) => (
                <Badge key={b} variant="secondary" className="text-xs">{b}</Badge>
              ))}
            </div>
          </div>
        )}

        <Field
          label="Draft Title"
          name="documentTitle"
          values={values}
          onChange={setVal}
          placeholder={`SSP — ${activeOrg?.name || "Organization Name"}`}
          hint="Internal name for this draft. Used as the document title in the generated DOCX."
          required
        />

        {!isL1 && (
          <div className="rounded-md border border-blue-200 bg-blue-50/60 px-4 py-3 text-blue-800 text-sm space-y-1">
            <p className="font-medium flex items-center gap-1.5">
              <AlertTriangle className="h-4 w-4" />
              Level 2 — large template
            </p>
            <p className="text-xs">
              The CMMC Level 2 / NIST SP 800-171 SSP contains 110 requirements. This wizard
              covers structural and organizational fields. Use the <strong>SSP → Mappings</strong> page
              to add individual requirement implementation narratives before generating.
            </p>
          </div>
        )}
      </div>
    );
  }

  function renderStep2() {
    return (
      <div className="space-y-5">
        <div className="space-y-1">
          <h2 className="text-lg font-semibold">Organization Profile</h2>
          <p className="text-sm text-muted-foreground">
            Fields are pre-filled from your organization profile. Correct any values as needed.
          </p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Organization Name" name="organizationName" values={values} onChange={setVal} placeholder="Acme Defense Contractors LLC" required />
          <Field label="Legal Name" name="organizationLegalName" values={values} onChange={setVal} placeholder="Acme Defense Contractors, Limited Liability Company" />
          <Field label="Short Name / Acronym" name="organizationShortName" values={values} onChange={setVal} placeholder="Acme" />
          <Field label="Industry" name="industry" values={values} onChange={setVal} placeholder="Defense Industrial Base" />
          <Field label="CAGE Code(s)" name="cageCodes" values={values} onChange={setVal} placeholder="1AB23" hint="Comma-separate multiple codes" />
          <Field label="UEI" name="uei" values={values} onChange={setVal} placeholder="QBC123456789" hint="Unique Entity Identifier (SAM.gov)" />
        </div>
        <Field label="Organization Address" name="organizationAddress" values={values} onChange={setVal} placeholder="123 Main St, Suite 100, Anytown, VA 22101" />
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Primary Contact Name" name="primaryContactName" values={values} onChange={setVal} placeholder="Jane Smith" />
          <Field label="Primary Contact Title" name="primaryContactTitle" values={values} onChange={setVal} placeholder="Chief Information Security Officer" />
          <Field label="Primary Contact Email" name="primaryContactEmail" values={values} onChange={setVal} placeholder="jsmith@example.com" />
        </div>
      </div>
    );
  }

  function renderStep3() {
    const today = new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
    return (
      <div className="space-y-5">
        <div className="space-y-1">
          <h2 className="text-lg font-semibold">Document Control</h2>
          <p className="text-sm text-muted-foreground">
            Formal document control fields for the cover page and document-control table.
          </p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Document Number" name="documentNumber" values={values} onChange={setVal} placeholder="SSP-001" />
          <Field label="Revision Number" name="revisionNumber" values={values} onChange={setVal} placeholder="1.0" />
          <Field label="Revision Date" name="revisionDate" values={values} onChange={setVal} placeholder={today} />
          <Field label="Effective Date" name="effectiveDate" values={values} onChange={setVal} placeholder={today} />
          <Field label="Prepared By" name="preparedBy" values={values} onChange={setVal} placeholder="Jane Smith, CISO" />
          <Field label="Reviewed By" name="reviewedBy" values={values} onChange={setVal} placeholder="John Doe, Deputy CISO" />
          <Field label="Approved By" name="approvedBy" values={values} onChange={setVal} placeholder="CEO / Authorizing Official" />
          <Field
            label="Classification Label"
            name="classification"
            values={values}
            onChange={setVal}
            placeholder="Sensitive – For Internal Use Only"
          />
        </div>
        {isL1 && (
          <Field
            label="Assessment Support Label"
            name="assessmentSupportLabel"
            values={values}
            onChange={setVal}
            placeholder="Annual CMMC Level 1 Self-Assessment Support Document"
            hint="Label that describes how this SSP supports the annual self-assessment affirmation."
          />
        )}
      </div>
    );
  }

  function renderStep4() {
    return (
      <div className="space-y-5">
        <div className="space-y-1">
          <h2 className="text-lg font-semibold">System Scope &amp; Assessment Boundary</h2>
          <p className="text-sm text-muted-foreground">
            Define the information system and boundary where {isL1 ? "FCI" : "CUI"} is processed, stored, or transmitted.
          </p>
        </div>
        <Field
          label="System / Environment Name"
          name="systemEnvironmentName"
          values={values}
          onChange={setVal}
          placeholder="Acme Corporate IT Environment — FCI Boundary"
          required
        />
        <Field
          label="Assessment Scope Description"
          name="assessmentScopeDescription"
          values={values}
          onChange={setVal}
          multiline
          placeholder={`Describe the people, technology, facilities, and processes that make up the ${isL1 ? "FCI" : "CUI"} processing environment…`}
          hint="Narrative that defines what is in scope for this assessment."
        />
        <Field
          label={`Business / Mission Use Case for ${isL1 ? "FCI" : "CUI"}`}
          name="businessFciCuiUseCase"
          values={values}
          onChange={setVal}
          multiline
          placeholder={`Describe how ${isL1 ? "Federal Contract Information" : "Controlled Unclassified Information"} is received, processed, and used in support of federal contracts…`}
        />
        <Field
          label="Primary Facility / Location"
          name="primaryLocation"
          values={values}
          onChange={setVal}
          placeholder="123 Main St, Suite 100, Anytown, VA 22101"
        />
        <Field
          label="In-Scope Systems &amp; Components"
          name="inScopeSystems"
          values={values}
          onChange={setVal}
          multiline
          placeholder="Workstations, file servers, cloud tenants, network devices, endpoints that process or store FCI/CUI…"
        />
        <Field
          label="In-Scope Roles / Personnel"
          name="inScopePeopleRoles"
          values={values}
          onChange={setVal}
          multiline
          placeholder="Program managers, contract administrators, IT administrators, security team members with access to FCI/CUI…"
        />
        <Field
          label="Facilities"
          name="facilities"
          values={values}
          onChange={setVal}
          multiline
          placeholder="Office locations and data center space that are in scope…"
        />
        <Field
          label="External Service Providers"
          name="externalServiceProviders"
          values={values}
          onChange={setVal}
          multiline
          placeholder="Cloud service providers, managed service providers, and other external parties with access to the in-scope environment…"
        />
        <Field
          label="Out-of-Scope Assets"
          name="outOfScopeAssets"
          values={values}
          onChange={setVal}
          multiline
          placeholder="Systems, networks, or facilities explicitly excluded from this assessment boundary and the reason for exclusion…"
        />
      </div>
    );
  }

  function renderStep5() {
    return (
      <div className="space-y-5">
        <div className="space-y-1">
          <h2 className="text-lg font-semibold">Security Architecture</h2>
          <p className="text-sm text-muted-foreground">
            Describe the key security controls in place within the assessment boundary.
          </p>
        </div>
        <Field
          label="Identity &amp; Access Management Architecture"
          name="iamArchitectureNarrative"
          values={values}
          onChange={setVal}
          multiline
          placeholder="Describe the IAM architecture: directory service, MFA, privileged access controls, account lifecycle management, access reviews…"
        />
        <Field
          label="Endpoint Security Architecture"
          name="endpointSecurityNarrative"
          values={values}
          onChange={setVal}
          multiline
          placeholder="Describe endpoint controls: EDR, AV, patch management, configuration baselines, device management (MDM/GPO)…"
        />
        <Field
          label="Malware Protection"
          name="malwareProtectionNarrative"
          values={values}
          onChange={setVal}
          multiline
          placeholder="Describe anti-malware tools, update cadence, scan schedule, and coverage across endpoints and servers…"
        />
        <Field
          label="Network Boundary Architecture"
          name="networkBoundaryNarrative"
          values={values}
          onChange={setVal}
          multiline
          placeholder="Describe firewall, IDS/IPS, network segmentation, DMZ, VPN, and perimeter security controls…"
        />
        <Field
          label={`Network &amp; ${isL1 ? "FCI" : "CUI"} Data Flow Narrative`}
          name="networkDataFlowNarrative"
          values={values}
          onChange={setVal}
          multiline
          placeholder={`Describe how ${isL1 ? "FCI" : "CUI"} flows across the network — entry points, transmission paths, storage locations, and exit points…`}
        />
        <Field
          label="Physical &amp; Media Protection Architecture"
          name="physicalMediaNarrative"
          values={values}
          onChange={setVal}
          multiline
          placeholder="Describe physical access controls, visitor management, media sanitization and destruction, and secure disposal procedures…"
        />
        <Field
          label="External Systems &amp; Interconnections"
          name="externalSystemsNarrative"
          values={values}
          onChange={setVal}
          multiline
          placeholder="Describe connections to external information systems, federal systems, cloud services, and any ISAs/MOUs in place…"
        />
      </div>
    );
  }

  function renderStep6() {
    return (
      <div className="space-y-5">
        <div className="space-y-1">
          <h2 className="text-lg font-semibold">Roles &amp; Responsibilities</h2>
          <p className="text-sm text-muted-foreground">
            Identify the personnel responsible for the information system and its security.
          </p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="System Owner Name" name="systemOwnerName" values={values} onChange={setVal} placeholder="Jane Smith" />
          <Field label="System Owner Title" name="systemOwnerTitle" values={values} onChange={setVal} placeholder="Chief Information Officer" />
          <Field label="Security Officer Name" name="securityOfficerName" values={values} onChange={setVal} placeholder="John Doe" />
          <Field label="Security Officer Title" name="securityOfficerTitle" values={values} onChange={setVal} placeholder="Chief Information Security Officer" />
          <Field label="Compliance Reviewer Name" name="complianceReviewerName" values={values} onChange={setVal} placeholder="Alice Johnson" />
        </div>

        {!isL1 && (
          <div className="space-y-2">
            <h3 className="text-sm font-semibold">Assessment Summary (L2)</h3>
            <Field
              label="Assessment Summary"
              name="assessmentSummary"
              values={values}
              onChange={setVal}
              multiline
              placeholder="Summarize the overall CMMC Level 2 posture, known gaps, and remediation plans…"
            />
            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                label="SPRS Score"
                name="sprsScore"
                values={values}
                onChange={setVal}
                placeholder="-203 to 110"
                hint="Supplier Performance Risk System score"
              />
              <Field
                label="Affirmation Date"
                name="affirmationDate"
                values={values}
                onChange={setVal}
                placeholder={new Date().toLocaleDateString("en-US")}
              />
            </div>
          </div>
        )}
      </div>
    );
  }

  function renderStep7() {
    if (!isL1) {
      return (
        <Step7L2
          draftId={draftId}
          orgId={activeOrg?.id}
          values={values}
          setValues={setValues}
        />
      );
    }

    // L1: show all 17 requirements
    return (
      <div className="space-y-6">
        <div className="space-y-1">
          <h2 className="text-lg font-semibold">Level 1 — Requirement Narratives</h2>
          <p className="text-sm text-muted-foreground">
            Provide an implementation narrative and status determination for each of the
            17 CMMC Level 1 requirements. These will be inserted directly into the generated DOCX.
          </p>
        </div>
        <div className="rounded-md border border-amber-100 bg-amber-50/60 px-4 py-3 text-amber-800 text-xs flex items-start gap-2">
          <AlertTriangle className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
          <span>
            Only assert Met when the requirement is fully implemented and supported by evidence.
            Leave fields blank to retain the template's placeholder text.
          </span>
        </div>
        <div className="space-y-6">
          {L1_REQUIREMENTS.map((req) => (
            <Card key={req.key} className="border-gray-200">
              <CardHeader className="pb-2 pt-4">
                <CardTitle className="text-sm font-semibold flex items-start gap-2">
                  <Badge variant="outline" className="text-xs font-mono flex-shrink-0 mt-0.5">{req.ref}</Badge>
                  <span>{req.title}</span>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium">Implementation Narrative</Label>
                  <Textarea
                    rows={3}
                    value={values[`req_${req.key}`] ?? ""}
                    onChange={(e) => setVal(`req_${req.key}`, e.target.value)}
                    placeholder="Describe how the organization implements this requirement…"
                    className="text-sm resize-y"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium">Status Determination</Label>
                  <Select
                    value={values[`status_${req.key}`] ?? ""}
                    onValueChange={(v) => setVal(`status_${req.key}`, v)}
                  >
                    <SelectTrigger className="h-8 text-sm">
                      <SelectValue placeholder="— select status —" />
                    </SelectTrigger>
                    <SelectContent>
                      {STATUS_OPTIONS.map((o) => (
                        <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  function renderStep8() {
    const filledCount = Object.values(values).filter((v) => v && v.trim()).length;
    const template = templates?.find((t) => t.templateKey === selectedTemplateKey);

    return (
      <div className="space-y-6">
        <div className="space-y-1">
          <h2 className="text-lg font-semibold">Review &amp; Generate</h2>
          <p className="text-sm text-muted-foreground">
            Review your entries, then generate the pre-filled SSP DOCX. You can always return
            to earlier steps to make corrections.
          </p>
        </div>

        {template && (
          <Card className="border-blue-200 bg-blue-50/30">
            <CardContent className="pt-4 pb-4 flex items-center gap-3">
              <Wand2 className="h-5 w-5 text-blue-600 flex-shrink-0" />
              <div>
                <p className="font-medium text-sm">{template.name}</p>
                <p className="text-xs text-muted-foreground">
                  {filledCount} fields collected · Template version 1.0
                </p>
              </div>
            </CardContent>
          </Card>
        )}

        <div className="grid gap-4 sm:grid-cols-2 text-sm">
          {[
            { label: "Organization Name", key: "organizationName" },
            { label: "Legal Name", key: "organizationLegalName" },
            { label: "CAGE Code(s)", key: "cageCodes" },
            { label: "UEI", key: "uei" },
            { label: "Document Title", key: "documentTitle" },
            { label: "Document Number", key: "documentNumber" },
            { label: "Revision", key: "revisionNumber" },
            { label: "Effective Date", key: "effectiveDate" },
            { label: "Prepared By", key: "preparedBy" },
            { label: "System / Environment", key: "systemEnvironmentName" },
            { label: "System Owner", key: "systemOwnerName" },
            { label: "Security Officer", key: "securityOfficerName" },
          ].map(({ label, key }) => (
            <div key={key} className="flex gap-2">
              <span className="text-muted-foreground min-w-[130px]">{label}:</span>
              <span className="font-medium truncate">
                {values[key] ? (
                  values[key]
                ) : (
                  <span className="text-muted-foreground/60 italic">not set</span>
                )}
              </span>
            </div>
          ))}
        </div>

        <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-amber-800 text-xs space-y-1.5">
          <p className="font-medium">Before distributing or submitting this document:</p>
          <ul className="list-disc list-inside space-y-1">
            <li>Replace any remaining placeholder text in the generated DOCX.</li>
            <li>Verify all implementation narratives reflect the organization's actual posture.</li>
            <li>Obtain internal review and authorization before use in any assessment or contract.</li>
            <li>The generated document contains no compliance assertions or certifications.</li>
          </ul>
        </div>

        <Button
          size="lg"
          onClick={handleGenerate}
          disabled={generating}
          className="w-full sm:w-auto"
        >
          {generating ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <Download className="h-4 w-4 mr-2" />
          )}
          Generate Pre-filled SSP DOCX
        </Button>
      </div>
    );
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  const stepContent: Record<number, () => React.ReactElement> = {
    1: renderStep1,
    2: renderStep2,
    3: renderStep3,
    4: renderStep4,
    5: renderStep5,
    6: renderStep6,
    7: renderStep7,
    8: renderStep8,
  };

  return (
    <div className="max-w-3xl mx-auto py-8 px-4 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={() => navigate("/ssp/overview")}>
          <ArrowLeft className="h-4 w-4 mr-1" />
          Back to SSP
        </Button>
      </div>

      <div>
        <h1 className="text-2xl font-bold">SSP Pre-fill Wizard</h1>
        <p className="text-muted-foreground text-sm mt-1">
          {activeOrg?.name} · Step {step} of {STEPS.length}
        </p>
      </div>

      {/* Step indicator */}
      <div className="flex items-center gap-1 overflow-x-auto pb-1">
        {STEPS.map((s, i) => {
          const Icon = s.icon;
          const isActive = s.id === step;
          const isDone = s.id < step;
          return (
            <div key={s.id} className="flex items-center gap-1">
              <button
                onClick={() => s.id < step && setStep(s.id)}
                disabled={s.id > step}
                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap ${
                  isActive
                    ? "bg-primary text-primary-foreground"
                    : isDone
                    ? "bg-primary/10 text-primary hover:bg-primary/20 cursor-pointer"
                    : "text-muted-foreground cursor-default"
                }`}
              >
                {isDone ? (
                  <CheckCircle2 className="h-3.5 w-3.5" />
                ) : (
                  <Icon className="h-3.5 w-3.5" />
                )}
                {s.label}
              </button>
              {i < STEPS.length - 1 && (
                <ChevronRight className="h-3 w-3 text-muted-foreground flex-shrink-0" />
              )}
            </div>
          );
        })}
      </div>

      {/* Step content */}
      <Card>
        <CardContent className="pt-6 pb-6">
          {(stepContent[step] ?? renderStep8)()}
        </CardContent>
      </Card>

      {/* Navigation */}
      <div className="flex items-center justify-between gap-3">
        <Button
          variant="outline"
          onClick={goBack}
          disabled={step === 1}
        >
          <ChevronLeft className="h-4 w-4 mr-1" />
          Back
        </Button>

        <div className="flex items-center gap-2">
          {saving && (
            <span className="text-xs text-muted-foreground flex items-center gap-1">
              <Loader2 className="h-3 w-3 animate-spin" />
              Saving…
            </span>
          )}
          {step < STEPS.length && (
            <Button onClick={goNext}>
              Save &amp; Continue
              <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
