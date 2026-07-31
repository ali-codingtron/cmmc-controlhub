import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Search, Eye, Plus, Library, Loader2, AlertTriangle,
  RefreshCw, X,
} from "lucide-react";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import { useOrg } from "@/context/OrgContext";

function authHeaders(orgId?: string): Record<string, string> {
  const token = localStorage.getItem("auth_token");
  const h: Record<string, string> = {};
  if (token) h["Authorization"] = `Bearer ${token}`;
  if (orgId) h["X-Organization-ID"] = orgId;
  return h;
}

interface TemplateRow {
  id: string;
  sourceTemplateId: string | null;
  title: string;
  artifactTypeLabel: string | null;
  family: string | null;
  reviewFrequency: string;
  isActive: boolean;
  domainAbbr: string | null;
  linkedControls: { controlId: string | null; nistRef: string; controlRef: string | null }[];
}

const FREQ_LABELS: Record<string, string> = {
  monthly: "Monthly", quarterly: "Quarterly", semi_annually: "Semi-Annual", annually: "Annual", as_needed: "As Needed",
};

const TYPE_COLORS: Record<string, string> = {
  Policy: "bg-blue-100 text-blue-800 border-blue-200",
  Procedure: "bg-green-100 text-green-800 border-green-200",
  Standard: "bg-purple-100 text-purple-800 border-purple-200",
  Plan: "bg-orange-100 text-orange-800 border-orange-200",
  "Log/Form": "bg-slate-100 text-slate-800 border-slate-200",
  "Form/Report": "bg-slate-100 text-slate-800 border-slate-200",
  "Register/Table": "bg-slate-100 text-slate-800 border-slate-200",
  Matrix: "bg-teal-100 text-teal-800 border-teal-200",
};

function artifactColor(label: string | null): string {
  if (!label) return "bg-slate-100 text-slate-700";
  const base = label.split("/")[0];
  return TYPE_COLORS[base] ?? TYPE_COLORS[label] ?? "bg-slate-100 text-slate-700 border-slate-200";
}

// Maps uppercase stable category keys to artifactType filter strings
const CATEGORY_TYPE_MAP: Record<string, string> = {
  POLICIES: "Policy",
  PROCEDURES: "Procedure",
  STANDARDS: "Standard",
  PLANS: "Plan",
  ASSESSMENTS_REPORTS: "Assessment",
  MATRICES_REGISTERS: "Matrix",
  FORMS_RECORDS: "Form",
  ARCHITECTURE: "Architecture",
  SSP: "SSP",
};

export default function DocTemplateLibrary() {
  const { user } = useAuth();
  const { toast } = useToast();
  const { activeOrg } = useOrg();
  const orgId = activeOrg?.id;
  const [location] = useLocation();

  // Read ?category= param (new) — fall back to legacy ?type= if present
  const urlParams = new URLSearchParams(location.split("?")[1] ?? "");
  const urlCategory = urlParams.get("category") ?? "";
  const urlTypeLegacy = urlParams.get("type") ?? "";
  const initialCategory = urlCategory || urlTypeLegacy;
  const initialArtifactType = CATEGORY_TYPE_MAP[initialCategory.toUpperCase()] ?? (initialCategory ? initialCategory : "all");

  const [search, setSearch] = useState("");
  const [artifactType, setArtifactType] = useState(initialArtifactType);
  const [family, setFamily] = useState("all");
  const [controlRef, setControlRef] = useState("");
  const [importLoading, setImportLoading] = useState(false);
  // Global Admins can view the full catalog instead of org-filtered
  const [viewGlobalCatalog, setViewGlobalCatalog] = useState(false);

  useEffect(() => {
    const p = new URLSearchParams(location.split("?")[1] ?? "");
    const cat = p.get("category") ?? p.get("type") ?? "";
    const mapped = CATEGORY_TYPE_MAP[cat.toUpperCase()] ?? (cat ? cat : "all");
    setArtifactType(mapped);
  }, [location]);

  // Resolver — package-aware templates for this org
  const { data: resolverResult, isLoading: resolverLoading } = useQuery({
    queryKey: ["doc-template-resolver", orgId],
    queryFn: async () => {
      const r = await fetch("/api/doc-templates/resolver", { headers: authHeaders(orgId) });
      if (!r.ok) return null;
      return r.json() as Promise<{
        activePackageKeys: string[];
        total: number;
        templates: TemplateRow[];
      }>;
    },
    enabled: !!orgId && !viewGlobalCatalog,
  });

  // Full global library (admin catalog view or fallback when no packages)
  const { data: libraryTemplates, isLoading: libraryLoading, refetch } = useQuery<TemplateRow[]>({
    queryKey: ["doc-template-library", search, artifactType, family, controlRef],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (search) params.set("search", search);
      if (artifactType && artifactType !== "all") params.set("artifactType", artifactType);
      if (family && family !== "all") params.set("family", family);
      if (controlRef) params.set("controlRef", controlRef);
      const r = await fetch(`/api/doc-templates/library?${params}`, { headers: authHeaders(orgId) });
      if (!r.ok) throw new Error(await r.text());
      return r.json();
    },
  });

  const { data: families } = useQuery<string[]>({
    queryKey: ["doc-template-families"],
    queryFn: async () => {
      const r = await fetch("/api/doc-templates/families", { headers: authHeaders(orgId) });
      if (!r.ok) return [];
      return r.json();
    },
  });

  const { data: artifactTypes } = useQuery<string[]>({
    queryKey: ["doc-template-artifact-types"],
    queryFn: async () => {
      const r = await fetch("/api/doc-templates/artifact-types", { headers: authHeaders(orgId) });
      if (!r.ok) return [];
      return r.json();
    },
  });

  const handleImport = async () => {
    if (!window.confirm("Import CMMC L2 Document Template Library? This is idempotent — already-imported templates will be skipped.")) return;
    setImportLoading(true);
    try {
      const r = await fetch("/api/admin/doc-templates/import", {
        method: "POST",
        headers: { ...authHeaders(orgId), "Content-Type": "application/json" },
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error ?? "Import failed");
      toast({ title: `Import complete — ${data.successCount} imported, ${data.skippedCount} skipped` });
      refetch();
    } catch (e: any) {
      toast({ title: "Import failed", description: e.message, variant: "destructive" });
    } finally {
      setImportLoading(false);
    }
  };

  // Determine which templates to display and filter
  const useResolver = !viewGlobalCatalog && !!resolverResult && resolverResult.templates.length > 0;
  const isLoading = viewGlobalCatalog ? libraryLoading : resolverLoading || libraryLoading;

  // Apply client-side filters to resolver templates; global catalog uses server-side filters
  let templates: TemplateRow[] = [];
  if (useResolver) {
    templates = resolverResult!.templates.filter((t) => {
      const matchSearch = !search || t.title.toLowerCase().includes(search.toLowerCase()) || (t.sourceTemplateId ?? "").toLowerCase().includes(search.toLowerCase());
      const matchType = artifactType === "all" || (t.artifactTypeLabel ?? "").toLowerCase().includes(artifactType.toLowerCase());
      const matchFamily = family === "all" || t.family === family;
      const matchControl = !controlRef || (t.linkedControls ?? []).some((c) =>
        (c.controlRef ?? "").toLowerCase().includes(controlRef.toLowerCase()) ||
        (c.nistRef ?? "").toLowerCase().includes(controlRef.toLowerCase())
      );
      return matchSearch && matchType && matchFamily && matchControl;
    });
  } else {
    templates = libraryTemplates ?? [];
  }

  const isEmpty = !isLoading && templates.length === 0;

  // Dynamic subtitle
  const activePackageKeys = resolverResult?.activePackageKeys ?? [];
  const isL1Only = activePackageKeys.some((k) => k.includes("L1")) && !activePackageKeys.some((k) => k.includes("L2"));
  const isL2 = activePackageKeys.some((k) => k.includes("L2"));
  const isMultiPackage = activePackageKeys.length > 2;

  let subtitle = "";
  if (viewGlobalCatalog) {
    subtitle = `All documentation templates — ${templates.length} templates`;
  } else if (isL1Only) {
    subtitle = `CMMC Level 1 / FCI templates — ${useResolver ? resolverResult!.total : templates.length} applicable templates`;
  } else if (isL2 && !isMultiPackage) {
    subtitle = `CMMC Level 2 / NIST SP 800-171 templates — ${useResolver ? resolverResult!.total : templates.length} applicable templates`;
  } else if (isMultiPackage) {
    subtitle = `Documentation templates — ${useResolver ? resolverResult!.total : templates.length} applicable templates across ${activePackageKeys.length} packages`;
  } else {
    subtitle = `CMMC Level 2 document templates — ${templates.length} templates`;
  }

  // Active filter chips
  const activeFilters: { label: string; clear?: () => void }[] = [];
  if (search) activeFilters.push({ label: `Search: "${search}"`, clear: () => setSearch("") });
  if (artifactType !== "all") activeFilters.push({ label: `Type: ${artifactType}`, clear: () => setArtifactType("all") });
  if (family !== "all") activeFilters.push({ label: `Domain: ${family}`, clear: () => setFamily("all") });
  if (controlRef) activeFilters.push({ label: `Control: ${controlRef}`, clear: () => setControlRef("") });
  if (!viewGlobalCatalog && useResolver) activeFilters.push({ label: "Applicable to Current Organization" });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Library className="h-6 w-6 text-primary" />
            Template Library
          </h1>
          <p className="text-muted-foreground text-sm mt-1">{subtitle}</p>
        </div>
        <div className="flex gap-2">
          {user?.role === "admin" && (
            <>
              <Button
                variant={viewGlobalCatalog ? "default" : "outline"}
                size="sm"
                onClick={() => setViewGlobalCatalog((v) => !v)}
              >
                {viewGlobalCatalog ? "View Org Catalog" : "View Global Catalog"}
              </Button>
              <Button variant="outline" size="sm" onClick={handleImport} disabled={importLoading}>
                {importLoading ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-1.5" />}
                Import / Refresh
              </Button>
            </>
          )}
          <Link href="/documents/generate">
            <Button size="sm">
              <Plus className="h-4 w-4 mr-1.5" />
              Generate Document
            </Button>
          </Link>
        </div>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-4 pb-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search templates…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            <Select value={artifactType} onValueChange={setArtifactType}>
              <SelectTrigger><SelectValue placeholder="Artifact type" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All types</SelectItem>
                {artifactTypes?.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={family} onValueChange={setFamily}>
              <SelectTrigger><SelectValue placeholder="Domain / Family" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All domains</SelectItem>
                {families?.map((f) => <SelectItem key={f} value={f}>{f}</SelectItem>)}
              </SelectContent>
            </Select>
            <Input
              placeholder="Filter by control (e.g. AC.L2-3.1.1)"
              value={controlRef}
              onChange={(e) => setControlRef(e.target.value)}
            />
          </div>
          {/* Active filter chips */}
          {activeFilters.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-3">
              {activeFilters.map((f, i) => (
                <Badge
                  key={i}
                  variant="secondary"
                  className="text-xs flex items-center gap-1 cursor-default"
                >
                  {f.label}
                  {f.clear && (
                    <button onClick={f.clear} className="ml-0.5 hover:text-destructive">
                      <X className="h-3 w-3" />
                    </button>
                  )}
                </Badge>
              ))}
              {activeFilters.some((f) => !!f.clear) && (
                <button
                  className="text-xs text-muted-foreground hover:text-foreground underline"
                  onClick={() => { setSearch(""); setArtifactType("all"); setFamily("all"); setControlRef(""); }}
                >
                  Clear all
                </button>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Empty state — no templates imported yet */}
      {isEmpty && user?.role === "admin" && (
        <Card className="border-orange-200 bg-orange-50">
          <CardContent className="py-8 text-center">
            <AlertTriangle className="h-10 w-10 text-orange-500 mx-auto mb-3" />
            <h3 className="font-semibold text-lg mb-1">No templates imported yet</h3>
            <p className="text-sm text-muted-foreground mb-4">
              Click "Import / Refresh" to load the CMMC L2 Document Template Library.
            </p>
            <Button onClick={handleImport} disabled={importLoading}>
              {importLoading ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-1.5" />}
              Import Now
            </Button>
          </CardContent>
        </Card>
      )}

      {isEmpty && user?.role !== "admin" && (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            No templates found.
          </CardContent>
        </Card>
      )}

      {/* Table */}
      {!isEmpty && (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-28">Template ID</TableHead>
                    <TableHead>Title</TableHead>
                    <TableHead>Artifact Type</TableHead>
                    <TableHead>Domain / Family</TableHead>
                    <TableHead>Controls</TableHead>
                    <TableHead>Review</TableHead>
                    <TableHead className="w-28">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading
                    ? Array.from({ length: 8 }).map((_, i) => (
                        <TableRow key={i}>
                          {Array.from({ length: 7 }).map((_, j) => (
                            <TableCell key={j}><div className="h-4 bg-muted rounded animate-pulse" /></TableCell>
                          ))}
                        </TableRow>
                      ))
                    : templates.map((t) => (
                        <TableRow key={t.id} className="group">
                          <TableCell>
                            <code className="text-xs font-mono bg-muted px-1.5 py-0.5 rounded">
                              {t.sourceTemplateId ?? "—"}
                            </code>
                          </TableCell>
                          <TableCell className="font-medium">
                            <Link href={`/documents/templates/${t.id}`} className="hover:underline text-primary">
                              {t.title}
                            </Link>
                          </TableCell>
                          <TableCell>
                            <Badge className={`text-xs ${artifactColor(t.artifactTypeLabel)}`}>
                              {t.artifactTypeLabel ?? "—"}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">{t.family ?? "—"}</TableCell>
                          <TableCell>
                            <div className="flex flex-wrap gap-1 max-w-48">
                              {(t.linkedControls ?? []).slice(0, 3).map((c, i) => (
                                <Badge key={i} variant="outline" className="text-xs font-mono">
                                  {c.controlRef ?? c.nistRef}
                                </Badge>
                              ))}
                              {(t.linkedControls ?? []).length > 3 && (
                                <Badge variant="outline" className="text-xs">+{(t.linkedControls ?? []).length - 3}</Badge>
                              )}
                            </div>
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {FREQ_LABELS[t.reviewFrequency] ?? t.reviewFrequency}
                          </TableCell>
                          <TableCell>
                            <div className="flex gap-1">
                              <Link href={`/documents/templates/${t.id}`}>
                                <Button size="icon" variant="ghost" className="h-7 w-7" title="View">
                                  <Eye className="h-3.5 w-3.5" />
                                </Button>
                              </Link>
                              <Link href={`/documents/generate?templateId=${t.id}`}>
                                <Button size="icon" variant="ghost" className="h-7 w-7" title="Generate">
                                  <Plus className="h-3.5 w-3.5" />
                                </Button>
                              </Link>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
