import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useRoute, Link } from "wouter";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Collapsible, CollapsibleContent, CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  ArrowLeft, Plus, FileText, Users, CheckSquare, BookOpen,
  Table2, Shield, Loader2, ChevronDown, ChevronRight, Code2,
} from "lucide-react";
import { useAuth } from "@/lib/auth";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

function authHeaders() {
  const token = localStorage.getItem("auth_token");
  return token ? { Authorization: `Bearer ${token}` } : {};
}

const FREQ_LABELS: Record<string, string> = {
  monthly: "Monthly", quarterly: "Quarterly", semi_annually: "Semi-Annual", annually: "Annual", as_needed: "As Needed",
};

const TYPE_COLORS: Record<string, string> = {
  Policy: "bg-blue-100 text-blue-800 border-blue-200",
  Procedure: "bg-green-100 text-green-800 border-green-200",
  Standard: "bg-purple-100 text-purple-800 border-purple-200",
  Plan: "bg-orange-100 text-orange-800 border-orange-200",
};

export default function DocTemplateDetail({ id: propId }: { id?: string }) {
  const [matched, params] = useRoute("/documents/templates/:id");
  const id = propId ?? params?.id ?? "";
  const { user } = useAuth();
  const [rawSourceOpen, setRawSourceOpen] = useState(false);

  const { data: template, isLoading } = useQuery({
    queryKey: ["doc-template-detail", id],
    queryFn: async () => {
      const r = await fetch(`/api/doc-templates/library/${id}`, { headers: authHeaders() as Record<string, string> });
      if (!r.ok) throw new Error("Template not found");
      return r.json();
    },
    enabled: !!id,
  });

  if (isLoading) return (
    <div className="flex items-center justify-center py-20">
      <Loader2 className="h-8 w-8 animate-spin text-primary" />
    </div>
  );

  if (!template) return (
    <div className="py-20 text-center text-muted-foreground">Template not found.</div>
  );

  const artifactBase = template.artifactTypeLabel?.split("/")[0] ?? "";
  const badgeColor = TYPE_COLORS[artifactBase] ?? "bg-slate-100 text-slate-700 border-slate-200";
  const markdown = template.sections?.[0]?.content ?? "";

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Back */}
      <div className="flex items-center gap-3">
        <Link href="/documents/templates">
          <Button variant="ghost" size="sm">
            <ArrowLeft className="h-4 w-4 mr-1.5" /> Template Library
          </Button>
        </Link>
        <ChevronRight className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm text-muted-foreground">{template.sourceTemplateId}</span>
      </div>

      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <code className="text-xs font-mono bg-muted px-2 py-0.5 rounded">{template.sourceTemplateId}</code>
            <Badge className={`text-xs ${badgeColor}`}>{template.artifactTypeLabel}</Badge>
            {template.informationType && (
              <Badge variant="outline" className="text-xs">
                {template.informationType === "CUI" ? "CUI" : template.informationType === "FCI" ? "FCI" : template.informationType === "BOTH" ? "CUI / FCI" : template.informationType}
              </Badge>
            )}
          </div>
          <h1 className="text-2xl font-bold">{template.title}</h1>
          <p className="text-sm text-muted-foreground mt-1">{template.family} · Review: {FREQ_LABELS[template.reviewFrequency] ?? template.reviewFrequency}</p>
        </div>
        <Link href={`/documents/generate?templateId=${template.id}`}>
          <Button>
            <Plus className="h-4 w-4 mr-1.5" />
            Generate Document
          </Button>
        </Link>
      </div>

      {/* Meta grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {template.purpose && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-1.5"><BookOpen className="h-4 w-4 text-primary" /> Purpose</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground leading-relaxed">{template.purpose}</CardContent>
          </Card>
        )}
        {template.scope && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-1.5"><Shield className="h-4 w-4 text-primary" /> Scope</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground leading-relaxed">{template.scope}</CardContent>
          </Card>
        )}
      </div>

      {/* Roles */}
      {template.roles?.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-1.5"><Users className="h-4 w-4 text-primary" /> Roles & Responsibilities</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-1.5">
              {template.roles.map((r: any, i: number) => (
                <li key={i} className="text-sm flex gap-2">
                  <span className="text-primary mt-0.5">•</span>
                  <span className="text-muted-foreground">{r.roleText}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {/* Requirements */}
      {template.requirements?.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-1.5"><CheckSquare className="h-4 w-4 text-primary" /> Requirements</CardTitle>
          </CardHeader>
          <CardContent>
            <ol className="space-y-2">
              {template.requirements.map((r: any, i: number) => (
                <li key={i} className="text-sm flex gap-2">
                  <span className="font-semibold text-primary shrink-0">{i + 1}.</span>
                  <span className="text-muted-foreground">{r.requirementText}</span>
                </li>
              ))}
            </ol>
          </CardContent>
        </Card>
      )}

      {/* Procedure steps */}
      {template.procedureSteps?.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-1.5"><FileText className="h-4 w-4 text-primary" /> Procedure Steps</CardTitle>
          </CardHeader>
          <CardContent>
            <ol className="space-y-2">
              {template.procedureSteps.map((s: any, i: number) => (
                <li key={i} className="text-sm flex gap-2">
                  <span className="font-semibold text-primary shrink-0">{i + 1}.</span>
                  <span className="text-muted-foreground">{s.stepText}</span>
                </li>
              ))}
            </ol>
          </CardContent>
        </Card>
      )}

      {/* Records */}
      {template.records?.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-1.5"><FileText className="h-4 w-4 text-primary" /> Required Records & Evidence</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
              {template.records.map((r: any, i: number) => (
                <li key={i} className="text-sm flex items-center gap-2 text-muted-foreground">
                  <span className="h-1.5 w-1.5 rounded-full bg-primary shrink-0" />
                  {r.recordName}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {/* Tables */}
      {template.tables?.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-1.5"><Table2 className="h-4 w-4 text-primary" /> Required Tables</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {template.tables.map((tbl: any, i: number) => (
              <div key={i}>
                <p className="text-sm font-medium mb-2">{tbl.tableName}</p>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs border-collapse">
                    <thead>
                      <tr className="bg-primary/10">
                        {(tbl.columnsJson as string[]).map((col: string, j: number) => (
                          <th key={j} className="border border-border px-2 py-1.5 text-left font-semibold">{col}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        {(tbl.columnsJson as string[]).map((_: any, j: number) => (
                          <td key={j} className="border border-border px-2 py-2 text-muted-foreground italic text-center">—</td>
                        ))}
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Control Mapping */}
      {template.controlMaps?.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-1.5"><Shield className="h-4 w-4 text-primary" /> CMMC Control Mapping</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-1.5">
              {template.controlMaps.map((m: any, i: number) => (
                m.controlId ? (
                  <Link key={i} href={`/controls/${m.controlId}`}>
                    <Badge variant="outline" className="text-xs font-mono hover:bg-primary/10 cursor-pointer">
                      {m.controlRef ?? m.nistControlNumber}
                    </Badge>
                  </Link>
                ) : (
                  <Badge key={i} variant="outline" className="text-xs font-mono text-muted-foreground">
                    {m.nistControlNumber}
                  </Badge>
                )
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Rendered Markdown preview */}
      {markdown && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-1.5">
              <FileText className="h-4 w-4 text-primary" /> Sample Document Preview
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="prose prose-sm max-w-none rounded-md border bg-white p-5 overflow-y-auto max-h-[520px]
              prose-headings:text-[#1a3a5c] prose-headings:font-semibold
              prose-h1:text-xl prose-h2:text-lg prose-h3:text-base
              prose-p:text-gray-700 prose-li:text-gray-700
              prose-strong:text-gray-900 prose-code:text-primary prose-code:bg-muted prose-code:px-1 prose-code:rounded">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {markdown.length > 8000 ? markdown.slice(0, 8000) + "\n\n…[preview truncated]" : markdown}
              </ReactMarkdown>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Raw source — admin only, collapsed */}
      {markdown && user?.role === "admin" && (
        <Collapsible open={rawSourceOpen} onOpenChange={setRawSourceOpen}>
          <Card className="border-dashed border-muted-foreground/30">
            <CollapsibleTrigger asChild>
              <CardHeader className="pb-2 cursor-pointer hover:bg-muted/30 rounded-t-lg transition-colors">
                <CardTitle className="text-xs flex items-center gap-1.5 text-muted-foreground font-normal">
                  <Code2 className="h-3.5 w-3.5" />
                  Technical Source (Admin Only)
                  {rawSourceOpen ? <ChevronDown className="h-3.5 w-3.5 ml-auto" /> : <ChevronRight className="h-3.5 w-3.5 ml-auto" />}
                </CardTitle>
              </CardHeader>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <CardContent>
                <pre className="text-xs bg-muted/50 rounded p-4 overflow-x-auto max-h-80 overflow-y-auto font-mono leading-relaxed whitespace-pre-wrap">
                  {markdown.slice(0, 4000)}{markdown.length > 4000 ? "\n\n…[truncated]" : ""}
                </pre>
              </CardContent>
            </CollapsibleContent>
          </Card>
        </Collapsible>
      )}
    </div>
  );
}
