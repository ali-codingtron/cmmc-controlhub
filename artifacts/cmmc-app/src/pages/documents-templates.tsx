import { useState } from "react";
import { useListDocumentTemplates } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Link } from "wouter";
import { FileText, Wand2, ClipboardList, BookOpen } from "lucide-react";

const DOC_TYPE_ICONS: Record<string, any> = {
  policy: BookOpen,
  procedure: ClipboardList,
  log: FileText,
  register: FileText,
  checklist: ClipboardList,
  narrative: FileText,
  form: FileText,
  plan: FileText,
};

const DOC_TYPE_COLORS: Record<string, string> = {
  policy: "bg-blue-100 text-blue-700",
  procedure: "bg-purple-100 text-purple-700",
  log: "bg-green-100 text-green-700",
  register: "bg-orange-100 text-orange-700",
  checklist: "bg-teal-100 text-teal-700",
  narrative: "bg-pink-100 text-pink-700",
  form: "bg-yellow-100 text-yellow-700",
  plan: "bg-indigo-100 text-indigo-700",
};

const REVIEW_FREQ_LABELS: Record<string, string> = {
  monthly: "Monthly",
  quarterly: "Quarterly",
  semi_annually: "Semi-Annually",
  annually: "Annually",
  as_needed: "As Needed",
};

export default function DocumentTemplates() {
  const [search, setSearch] = useState("");
  const [docType, setDocType] = useState("all");

  const { data: templates, isLoading } = useListDocumentTemplates({
    search: search || undefined,
    docType: docType !== "all" ? docType : undefined,
  });

  const groupedByType = (templates ?? []).reduce<Record<string, typeof templates>>((acc, t) => {
    const type = t.docType;
    if (!acc[type]) acc[type] = [];
    acc[type]!.push(t);
    return acc;
  }, {});

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">Document Templates</h1>
          <p className="text-muted-foreground mt-1">
            Pre-built CMMC compliance templates ready to customize and generate
          </p>
        </div>
      </div>

      <div className="flex gap-3 flex-wrap">
        <Input
          placeholder="Search templates..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-xs"
        />
        <Select value={docType} onValueChange={setDocType}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder="Document Type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            <SelectItem value="policy">Policies</SelectItem>
            <SelectItem value="procedure">Procedures</SelectItem>
            <SelectItem value="log">Logs</SelectItem>
            <SelectItem value="register">Registers</SelectItem>
            <SelectItem value="checklist">Checklists</SelectItem>
            <SelectItem value="narrative">Narratives</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[...Array(6)].map((_, i) => (
            <Card key={i}><CardContent className="pt-6"><div className="h-32 animate-pulse bg-muted rounded" /></CardContent></Card>
          ))}
        </div>
      ) : (
        <div className="space-y-8">
          {Object.entries(groupedByType).map(([type, typeTemplates]) => {
            const Icon = DOC_TYPE_ICONS[type] ?? FileText;
            return (
              <div key={type}>
                <div className="flex items-center gap-2 mb-4">
                  <Icon className="h-5 w-5 text-muted-foreground" />
                  <h2 className="text-lg font-semibold capitalize">{type}s</h2>
                  <Badge variant="secondary" className="text-xs">{typeTemplates?.length}</Badge>
                </div>
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                  {typeTemplates?.map((t) => (
                    <Card key={t.id} className="hover:shadow-md transition-shadow">
                      <CardContent className="pt-6">
                        <div className="flex items-start justify-between mb-3">
                          <span className={`text-xs font-medium px-2 py-0.5 rounded ${DOC_TYPE_COLORS[t.docType] ?? ""}`}>
                            {t.docType}
                          </span>
                          <Badge variant="outline" className="text-xs">{t.cmmcLevel}</Badge>
                        </div>
                        <h3 className="font-semibold text-sm leading-snug mb-2">{t.title}</h3>
                        {t.description && (
                          <p className="text-xs text-muted-foreground mb-3 line-clamp-2">{t.description}</p>
                        )}
                        <div className="flex flex-wrap gap-1 mb-4">
                          {t.domainAbbr && (
                            <Badge variant="secondary" className="text-xs">Domain: {t.domainAbbr}</Badge>
                          )}
                          <Badge variant="secondary" className="text-xs">
                            {REVIEW_FREQ_LABELS[t.reviewFrequency] ?? t.reviewFrequency}
                          </Badge>
                          {(t.checklistItems?.length ?? 0) > 0 && (
                            <Badge variant="secondary" className="text-xs">
                              {t.checklistItems?.length} checklist items
                            </Badge>
                          )}
                        </div>
                        <div className="flex gap-2">
                          <Button size="sm" asChild className="flex-1">
                            <Link href={`/documents/generate?templateId=${t.id}`}>
                              <Wand2 className="h-3.5 w-3.5 mr-1.5" />
                              Generate
                            </Link>
                          </Button>
                          <Button size="sm" variant="outline" asChild>
                            <Link href={`/documents/templates/${t.id}`}>
                              Preview
                            </Link>
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>
            );
          })}
          {!templates?.length && (
            <div className="text-center py-12 text-muted-foreground">
              <FileText className="h-12 w-12 mx-auto mb-3 opacity-30" />
              <p>No templates found</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
