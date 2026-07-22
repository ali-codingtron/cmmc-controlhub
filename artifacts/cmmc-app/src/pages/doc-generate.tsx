import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation, Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  ArrowLeft, ArrowRight, CheckCircle2, FileDown, Loader2, Plus,
  AlertTriangle, Eye,
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

const PLACEHOLDER_LABELS: Record<string, string> = {
  "{{ORGANIZATION_NAME}}": "Organization Name",
  "{{SYSTEM_NAME}}": "System Name",
  "{{CMMC_SCOPE_NAME}}": "CMMC Scope Name",
  "{{DOCUMENT_OWNER}}": "Document Owner",
  "{{APPROVER_NAME}}": "Approver Name",
  "{{APPROVER_TITLE}}": "Approver Title",
  "{{EFFECTIVE_DATE}}": "Effective Date",
  "{{REVIEW_DATE}}": "Next Review Date",
  "{{VERSION}}": "Document Version",
  "{{CLASSIFICATION}}": "Classification",
  "{{SECURITY_OFFICER_TITLE}}": "Security Officer Title",
  "{{SYSTEM_OWNER_TITLE}}": "System Owner Title",
  "{{IT_ADMIN_TITLE}}": "IT Admin Title",
  "{{HR_OWNER_TITLE}}": "HR Owner Title",
  "{{FACILITY_OWNER_TITLE}}": "Facility Owner Title",
};

type Step = 1 | 2 | 3 | 4 | 5 | 6;

const STEPS = [
  { n: 1, label: "Select Template" },
  { n: 2, label: "Confirm" },
  { n: 3, label: "Auto-Fill" },
  { n: 4, label: "Review" },
  { n: 5, label: "Preview" },
  { n: 6, label: "Generate" },
];

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
  const [generatedDocId, setGeneratedDocId] = useState<string | null>(null);
  const [unresolved, setUnresolved] = useState<string[]>([]);

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
    const today = new Date().toLocaleDateString("en-US");
    const nextYear = new Date(new Date().setFullYear(new Date().getFullYear() + 1)).toLocaleDateString("en-US");
    setPlaceholderValues({
      "{{ORGANIZATION_NAME}}": activeOrg.name ?? "",
      "{{SYSTEM_NAME}}": (activeOrg as any).systemName ?? activeOrg.name ?? "",
      "{{CMMC_SCOPE_NAME}}": `${activeOrg.name} CUI Environment`,
      "{{DOCUMENT_OWNER}}": "Compliance Manager",
      "{{APPROVER_NAME}}": "System Owner",
      "{{APPROVER_TITLE}}": "System Owner",
      "{{EFFECTIVE_DATE}}": today,
      "{{REVIEW_DATE}}": nextYear,
      "{{VERSION}}": "1.0",
      "{{CLASSIFICATION}}": "Internal Use Only — CUI",
      "{{SECURITY_OFFICER_TITLE}}": "Information System Security Officer (ISSO)",
      "{{SYSTEM_OWNER_TITLE}}": "System Owner",
      "{{IT_ADMIN_TITLE}}": "IT Administrator",
      "{{HR_OWNER_TITLE}}": "Human Resources Manager",
      "{{FACILITY_OWNER_TITLE}}": "Facility Manager",
    });
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
      setStep(6);
      toast({ title: `Document created — ${data.title}` });
    },
    onError: (e: Error) => toast({ title: "Generation failed", description: e.message, variant: "destructive" }),
  });

  // All template placeholders used in this template
  const usedPlaceholders = template
    ? [...new Set([
        ...(template.placeholders ?? []),
        ...Object.keys(PLACEHOLDER_LABELS),
      ])]
    : [];

  const canGenerate = !!(user?.role === "admin" || user?.role === "compliance_manager");

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

      {/* Step 1: Select Template */}
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

      {/* Step 2: Confirm Template */}
      {step === 2 && (
        <Card>
          <CardHeader><CardTitle className="text-sm">Step 2 — Confirm Template</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            {templateLoading ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</div>
            ) : template ? (
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <code className="text-xs font-mono bg-muted px-2 py-0.5 rounded">{template.sourceTemplateId}</code>
                  <Badge variant="outline" className="text-xs">{template.artifactTypeLabel}</Badge>
                </div>
                <h3 className="font-semibold">{template.title}</h3>
                <p className="text-sm text-muted-foreground">{template.family} · {template.reviewFrequency}</p>
                {template.purpose && <p className="text-sm border-l-2 border-primary/30 pl-3 text-muted-foreground">{template.purpose}</p>}
                <div className="text-xs text-muted-foreground">
                  Maps to {template.controlMaps?.length ?? 0} controls · {template.procedureSteps?.length ?? 0} procedure steps · {template.records?.length ?? 0} required records
                </div>
              </div>
            ) : null}
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setStep(1)}>Back</Button>
              <Button onClick={() => setStep(3)} disabled={!template}>
                Next <ArrowRight className="h-4 w-4 ml-1.5" />
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step 3: Auto-fill organization values */}
      {step === 3 && (
        <Card>
          <CardHeader><CardTitle className="text-sm">Step 3 — Auto-Fill Organization Values</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-3">
              <div>
                <Label className="text-xs">Document Title</Label>
                <Input value={docTitle} onChange={(e) => setDocTitle(e.target.value)} className="mt-1" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">Effective Date</Label>
                  <Input type="date" value={effectiveDateStr} onChange={(e) => setEffectiveDateStr(e.target.value)} className="mt-1" />
                </div>
                <div>
                  <Label className="text-xs">Next Review Date</Label>
                  <Input type="date" value={reviewDateStr} onChange={(e) => setReviewDateStr(e.target.value)} className="mt-1" />
                </div>
              </div>
            </div>
            <div className="rounded-md border bg-muted/20 p-3">
              <p className="text-xs font-semibold text-muted-foreground mb-2">Auto-filled from organization data</p>
              <div className="grid grid-cols-2 gap-1 text-xs">
                {[
                  ["Organization", activeOrg?.name],
                  ["Domain", template?.family],
                  ["Template", template?.sourceTemplateId],
                  ["Controls", `${template?.controlMaps?.length ?? 0} linked`],
                ].map(([k, v]) => (
                  <div key={k as string} className="flex gap-1">
                    <span className="text-muted-foreground">{k}:</span>
                    <span className="font-medium truncate">{v}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setStep(2)}>Back</Button>
              <Button onClick={() => setStep(4)}>
                Next <ArrowRight className="h-4 w-4 ml-1.5" />
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step 4: Placeholder review */}
      {step === 4 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Step 4 — Review Placeholders</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-xs text-muted-foreground">Review and edit placeholder values. All are pre-filled from your organization data.</p>
            <div className="space-y-3 max-h-96 overflow-y-auto pr-1">
              {Object.entries(PLACEHOLDER_LABELS).map(([key, label]) => (
                <div key={key}>
                  <Label className="text-xs flex items-center justify-between">
                    <span>{label}</span>
                    <code className="font-mono text-muted-foreground text-[10px]">{key}</code>
                  </Label>
                  <Input
                    value={placeholderValues[key] ?? ""}
                    onChange={(e) => setPlaceholderValues((prev) => ({ ...prev, [key]: e.target.value }))}
                    className="mt-1 text-sm"
                    placeholder={`Enter ${label}…`}
                  />
                </div>
              ))}
            </div>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setStep(3)}>Back</Button>
              <Button onClick={() => setStep(5)}>
                Preview <Eye className="h-4 w-4 ml-1.5" />
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step 5: Preview */}
      {step === 5 && template && (
        <Card>
          <CardHeader><CardTitle className="text-sm">Step 5 — Document Preview</CardTitle></CardHeader>
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
                      <span>{v}</span>
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
                <p className="text-xs text-muted-foreground italic">… {template.requirements?.length ?? 0} requirements, {template.procedureSteps?.length ?? 0} procedure steps, {template.records?.length ?? 0} records in full document</p>
              </div>
            </div>
            {usedPlaceholders.filter((k) => !(placeholderValues[k] ?? "").trim()).length > 0 && (
              <div className="rounded-md border border-amber-200 bg-amber-50 p-3">
                <p className="text-xs font-semibold text-amber-700 flex items-center gap-1.5 mb-1">
                  <AlertTriangle className="h-3.5 w-3.5" />
                  {usedPlaceholders.filter((k) => !(placeholderValues[k] ?? "").trim()).length} placeholder{usedPlaceholders.filter((k) => !(placeholderValues[k] ?? "").trim()).length !== 1 ? "s" : ""} not filled
                </p>
                <p className="text-xs text-amber-600">Go back to step 4 to fill them in, or generate now and edit the document afterward.</p>
              </div>
            )}
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setStep(4)}>Back</Button>
              <Button onClick={() => generateMutation.mutate()} disabled={generateMutation.isPending}>
                {generateMutation.isPending
                  ? <><Loader2 className="h-4 w-4 mr-1.5 animate-spin" />Generating…</>
                  : <><Plus className="h-4 w-4 mr-1.5" />Generate &amp; Save</>}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step 6: Generated */}
      {step === 6 && generatedDocId && (
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
              <a href={`/api/doc-templates/generated/${generatedDocId}/docx`}
                target="_blank" rel="noopener noreferrer"
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
              <a href={`/api/doc-templates/generated/${generatedDocId}/pdf`}
                target="_blank" rel="noopener noreferrer"
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
                setStep(1); setSelectedTemplateId(""); setGeneratedDocId(null);
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
