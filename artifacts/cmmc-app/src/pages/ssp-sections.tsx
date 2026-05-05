import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useOrg } from "@/context/OrgContext";
import { useIsAssessor } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Link } from "wouter";
import {
  CheckCircle2,
  Circle,
  Edit2,
  Save,
  X,
  Loader2,
  BookOpen,
  Upload,
} from "lucide-react";

interface SspDocument {
  id: string;
  title: string;
  documentNumber: string | null;
  extractedAt: string | null;
}

interface SspSection {
  id: string;
  sectionKey: string;
  sectionTitle: string;
  content: string;
  sortOrder: number;
  isComplete: boolean;
}

function apiHeaders(orgId?: string) {
  const token = localStorage.getItem("auth_token");
  return {
    Authorization: `Bearer ${token}`,
    ...(orgId ? { "X-Organization-ID": orgId } : {}),
  };
}

export default function SspSections() {
  const { activeOrg } = useOrg();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [editing, setEditing] = useState<string | null>(null);
  const [editContent, setEditContent] = useState("");

  const { data: primary, isLoading: loadingPrimary } = useQuery<SspDocument | null>({
    queryKey: ["ssp-primary", activeOrg?.id],
    queryFn: async () => {
      const r = await fetch("/api/ssp/primary", { headers: apiHeaders(activeOrg?.id) });
      if (!r.ok) return null;
      return r.json();
    },
    enabled: !!activeOrg?.id,
  });

  const isAssessor = useIsAssessor();

  const { data: sections = [], isLoading: loadingSections } = useQuery<SspSection[]>({
    queryKey: ["ssp-sections", primary?.id],
    queryFn: async () => {
      const r = await fetch(`/api/ssp/${primary!.id}/sections`, {
        headers: apiHeaders(activeOrg?.id),
      });
      if (!r.ok) return [];
      return r.json();
    },
    enabled: !!primary?.id,
  });

  const updateMutation = useMutation({
    mutationFn: async ({ sectionId, content, isComplete }: { sectionId: string; content: string; isComplete: boolean }) => {
      const r = await fetch(`/api/ssp/${primary!.id}/sections/${sectionId}`, {
        method: "PATCH",
        headers: { ...apiHeaders(activeOrg?.id), "Content-Type": "application/json" },
        body: JSON.stringify({ content, isComplete }),
      });
      if (!r.ok) throw new Error("Failed");
      return r.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["ssp-sections", primary?.id] });
      qc.invalidateQueries({ queryKey: ["ssp-stats", primary?.id] });
      setEditing(null);
      toast({ title: "Section saved" });
    },
    onError: () => toast({ title: "Save failed", variant: "destructive" }),
  });

  const toggleComplete = async (section: SspSection) => {
    await fetch(`/api/ssp/${primary!.id}/sections/${section.id}`, {
      method: "PATCH",
      headers: { ...apiHeaders(activeOrg?.id), "Content-Type": "application/json" },
      body: JSON.stringify({ isComplete: !section.isComplete }),
    });
    qc.invalidateQueries({ queryKey: ["ssp-sections", primary?.id] });
    qc.invalidateQueries({ queryKey: ["ssp-stats", primary?.id] });
  };

  if (loadingPrimary) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-7 w-7 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!primary) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold">SSP Sections</h1>
        <Card>
          <CardContent className="flex flex-col items-center py-20 text-center">
            <BookOpen className="h-12 w-12 text-muted-foreground/25 mb-4" />
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

  const completedCount = sections.filter((s) => s.isComplete).length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">SSP Sections</h1>
          <p className="text-muted-foreground text-sm mt-1">
            {primary.title}
            {primary.documentNumber && ` · #${primary.documentNumber}`}
            {!primary.extractedAt && " · Not yet parsed"}
          </p>
        </div>
        <Badge variant="outline" className="text-xs">
          {completedCount} / {sections.length} complete
        </Badge>
      </div>

      {loadingSections ? (
        <div className="space-y-3">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-24 animate-pulse bg-muted rounded-lg" />
          ))}
        </div>
      ) : sections.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center py-16 text-center">
            <BookOpen className="h-10 w-10 text-muted-foreground/25 mb-3" />
            <p className="font-medium text-muted-foreground">No sections extracted yet</p>
            <p className="text-sm text-muted-foreground mt-1">
              {primary.extractedAt
                ? "The document was parsed but no recognizable sections were found."
                : "Parse the document to extract sections automatically."}
            </p>
            <Link href="/ssp/documents">
              <Button className="mt-4" size="sm" variant="outline">
                Go to Documents
              </Button>
            </Link>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {sections.map((section) => (
            <Card key={section.id} className={section.isComplete ? "border-green-200/60" : ""}>
              <CardHeader className="pb-2 pt-4 px-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-2">
                    {!isAssessor && (
                      <button
                        onClick={() => toggleComplete(section)}
                        className="shrink-0 text-muted-foreground hover:text-primary transition-colors"
                        title={section.isComplete ? "Mark incomplete" : "Mark complete"}
                      >
                        {section.isComplete ? (
                          <CheckCircle2 className="h-5 w-5 text-green-500" />
                        ) : (
                          <Circle className="h-5 w-5" />
                        )}
                      </button>
                    )}
                    {isAssessor && section.isComplete && (
                      <CheckCircle2 className="h-5 w-5 text-green-500 shrink-0" />
                    )}
                    <CardTitle className="text-sm font-semibold">{section.sectionTitle}</CardTitle>
                    {section.isComplete && (
                      <Badge className="text-[10px] bg-green-50 text-green-700 border-green-200">
                        Complete
                      </Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5">
                    {editing === section.id ? (
                      <>
                        <Button
                          size="sm"
                          onClick={() =>
                            updateMutation.mutate({
                              sectionId: section.id,
                              content: editContent,
                              isComplete: editContent.trim().length > 20,
                            })
                          }
                          disabled={updateMutation.isPending}
                        >
                          {updateMutation.isPending ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Save className="h-3.5 w-3.5 mr-1" />
                          )}
                          Save
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setEditing(null)}
                        >
                          <X className="h-3.5 w-3.5" />
                        </Button>
                      </>
                    ) : (
                      !isAssessor && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            setEditing(section.id);
                            setEditContent(section.content);
                          }}
                        >
                          <Edit2 className="h-3.5 w-3.5 mr-1" />
                          Edit
                        </Button>
                      )
                    )}
                  </div>
                </div>
              </CardHeader>
              <CardContent className="px-4 pb-4">
                {editing === section.id ? (
                  <Textarea
                    value={editContent}
                    onChange={(e) => setEditContent(e.target.value)}
                    rows={8}
                    className="font-mono text-xs"
                  />
                ) : section.content ? (
                  <p className="text-sm text-muted-foreground whitespace-pre-line line-clamp-6">
                    {section.content}
                  </p>
                ) : (
                  <p className="text-sm text-muted-foreground italic">No content yet — click Edit to add.</p>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
