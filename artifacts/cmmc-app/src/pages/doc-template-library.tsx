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
  Search, Eye, FileDown, Plus, Archive, Library, Loader2, AlertTriangle,
  RefreshCw, ChevronRight,
} from "lucide-react";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import { useOrg } from "@/context/OrgContext";

function authHeaders(): Record<string, string> {
  const token = localStorage.getItem("auth_token");
  return token ? { Authorization: `Bearer ${token}` } : {};
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

const CATEGORY_TYPE_MAP: Record<string, string> = {
  policy: "Policy",
  procedure: "Procedure",
  standard: "Standard",
  plan: "Plan",
  assessment: "Assessment",
  matrix: "Matrix",
  form: "Form",
  architecture: "Architecture",
  ssp: "SSP",
};

export default function DocTemplateLibrary() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [location] = useLocation();

  const urlType = new URLSearchParams(location.split("?")[1] ?? "").get("type") ?? "";
  const initialArtifactType = CATEGORY_TYPE_MAP[urlType] ?? "all";

  const [search, setSearch] = useState("");
  const [artifactType, setArtifactType] = useState(initialArtifactType);
  const [family, setFamily] = useState("all");
  const [controlRef, setControlRef] = useState("");
  const [importLoading, setImportLoading] = useState(false);

  useEffect(() => {
    const t = new URLSearchParams(location.split("?")[1] ?? "").get("type") ?? "";
    const mapped = CATEGORY_TYPE_MAP[t] ?? "all";
    setArtifactType(mapped);
  }, [location]);

  const { data: templates, isLoading, refetch } = useQuery<TemplateRow[]>({
    queryKey: ["doc-template-library", search, artifactType, family, controlRef],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (search) params.set("search", search);
      if (artifactType && artifactType !== "all") params.set("artifactType", artifactType);
      if (family && family !== "all") params.set("family", family);
      if (controlRef) params.set("controlRef", controlRef);
      const r = await fetch(`/api/doc-templates/library?${params}`, { headers: authHeaders() });
      if (!r.ok) throw new Error(await r.text());
      return r.json();
    },
  });

  const { data: families } = useQuery<string[]>({
    queryKey: ["doc-template-families"],
    queryFn: async () => {
      const r = await fetch("/api/doc-templates/families", { headers: authHeaders() });
      if (!r.ok) return [];
      return r.json();
    },
  });

  const { data: artifactTypes } = useQuery<string[]>({
    queryKey: ["doc-template-artifact-types"],
    queryFn: async () => {
      const r = await fetch("/api/doc-templates/artifact-types", { headers: authHeaders() });
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
        headers: { ...authHeaders(), "Content-Type": "application/json" },
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

  const isEmpty = !isLoading && (!templates || templates.length === 0);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Library className="h-6 w-6 text-primary" />
            Template Library
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            CMMC Level 2 document templates — {templates?.length ?? 0} templates
          </p>
        </div>
        <div className="flex gap-2">
          {user?.role === "admin" && (
            <Button variant="outline" size="sm" onClick={handleImport} disabled={importLoading}>
              {importLoading ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-1.5" />}
              Import / Refresh
            </Button>
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
        </CardContent>
      </Card>

      {/* Empty state — no templates imported yet */}
      {isEmpty && user?.role === "admin" && (
        <Card className="border-orange-200 bg-orange-50">
          <CardContent className="py-8 text-center">
            <AlertTriangle className="h-10 w-10 text-orange-500 mx-auto mb-3" />
            <h3 className="font-semibold text-lg mb-1">No templates imported yet</h3>
            <p className="text-sm text-muted-foreground mb-4">
              Click "Import / Refresh" to load the CMMC L2 Document Template Library (67 templates).
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
                    : templates!.map((t) => (
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
                              {t.linkedControls.slice(0, 3).map((c, i) => (
                                <Badge key={i} variant="outline" className="text-xs font-mono">
                                  {c.controlRef ?? c.nistRef}
                                </Badge>
                              ))}
                              {t.linkedControls.length > 3 && (
                                <Badge variant="outline" className="text-xs">+{t.linkedControls.length - 3}</Badge>
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
