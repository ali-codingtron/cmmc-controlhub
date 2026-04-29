import { useState } from "react";
import { useListDocumentTemplates, useGenerateDocument } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useLocation, useSearch } from "wouter";
import { ArrowLeft, Wand2, FileText } from "lucide-react";
import { Link } from "wouter";

export default function DocumentsGenerate() {
  const search = useSearch();
  const params = new URLSearchParams(search);
  const preSelectedId = params.get("templateId") ?? "";

  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const { data: templates, isLoading: templatesLoading } = useListDocumentTemplates({});
  const { mutate: generate, isPending } = useGenerateDocument();

  const [selectedTemplateId, setSelectedTemplateId] = useState(preSelectedId);
  const [title, setTitle] = useState("");
  const [orgName, setOrgName] = useState("");
  const [systemName, setSystemName] = useState("");
  const [policyOwner, setPolicyOwner] = useState("");
  const [effectiveDate, setEffectiveDate] = useState(new Date().toISOString().split("T")[0]);
  const [nextReviewDate, setNextReviewDate] = useState(
    new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().split("T")[0]
  );

  const selectedTemplate = templates?.find((t) => t.id === selectedTemplateId);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTemplateId) {
      toast({ title: "Select a template", variant: "destructive" });
      return;
    }

    generate(
      {
        templateId: selectedTemplateId,
        title: title || selectedTemplate?.title,
        organizationName: orgName,
        systemName: systemName,
        policyOwner: policyOwner,
        effectiveDate: effectiveDate ? new Date(effectiveDate).toISOString() : undefined,
        nextReviewDate: nextReviewDate ? new Date(nextReviewDate).toISOString() : undefined,
        fieldValues: {},
      },
      {
        onSuccess: (doc) => {
          toast({ title: "Document generated successfully" });
          setLocation(`/documents/${doc.id}`);
        },
        onError: () => {
          toast({ title: "Failed to generate document", variant: "destructive" });
        },
      }
    );
  };

  return (
    <div className="space-y-6 max-w-2xl">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/documents/templates">
            <ArrowLeft className="h-4 w-4 mr-1" />
            Back
          </Link>
        </Button>
        <div>
          <h1 className="text-3xl font-bold">Generate Document</h1>
          <p className="text-muted-foreground text-sm mt-1">Create a new compliance document from a template</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">1. Select Template</CardTitle>
          </CardHeader>
          <CardContent>
            {templatesLoading ? (
              <div className="h-10 animate-pulse bg-muted rounded" />
            ) : (
              <Select value={selectedTemplateId} onValueChange={setSelectedTemplateId}>
                <SelectTrigger>
                  <SelectValue placeholder="Choose a template..." />
                </SelectTrigger>
                <SelectContent>
                  {templates?.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      <div className="flex items-center gap-2">
                        <span className="capitalize text-xs text-muted-foreground">[{t.docType}]</span>
                        {t.title}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            {selectedTemplate && (
              <div className="mt-3 p-3 bg-muted/50 rounded-lg">
                <div className="flex gap-2 text-xs text-muted-foreground mb-1">
                  <span className="font-medium capitalize">{selectedTemplate.docType}</span>
                  <span>·</span>
                  <span>CMMC {selectedTemplate.cmmcLevel}</span>
                  <span>·</span>
                  <span>Review: {selectedTemplate.reviewFrequency?.replace(/_/g, " ")}</span>
                </div>
                {selectedTemplate.description && (
                  <p className="text-xs text-muted-foreground">{selectedTemplate.description}</p>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">2. Document Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label>Document Title</Label>
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder={selectedTemplate?.title ?? "Enter document title..."}
                className="mt-1.5"
              />
            </div>
            <div>
              <Label>Organization Name *</Label>
              <Input
                value={orgName}
                onChange={(e) => setOrgName(e.target.value)}
                placeholder="Acme Defense Contractors LLC"
                className="mt-1.5"
                required
              />
            </div>
            <div>
              <Label>System / Information System Name</Label>
              <Input
                value={systemName}
                onChange={(e) => setSystemName(e.target.value)}
                placeholder="Enterprise IT System"
                className="mt-1.5"
              />
            </div>
            <div>
              <Label>Policy / Document Owner Name</Label>
              <Input
                value={policyOwner}
                onChange={(e) => setPolicyOwner(e.target.value)}
                placeholder="John Smith, ISSO"
                className="mt-1.5"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Effective Date</Label>
                <Input
                  type="date"
                  value={effectiveDate}
                  onChange={(e) => setEffectiveDate(e.target.value)}
                  className="mt-1.5"
                />
              </div>
              <div>
                <Label>Next Review Date</Label>
                <Input
                  type="date"
                  value={nextReviewDate}
                  onChange={(e) => setNextReviewDate(e.target.value)}
                  className="mt-1.5"
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {selectedTemplate && (selectedTemplate.placeholders?.length ?? 0) > 0 && (
          <div className="p-3 bg-muted/30 rounded-lg border">
            <p className="text-sm font-medium mb-2">Template placeholders</p>
            <p className="text-xs text-muted-foreground mb-2">
              The following placeholders will be filled in the document body. Basic fields above (org name, owner, etc.) 
              are auto-populated. Additional placeholders will remain as <code className="bg-muted px-1 rounded">{"{{placeholder}}"}</code> for you to edit after generation.
            </p>
            <div className="flex flex-wrap gap-1">
              {selectedTemplate.placeholders?.map((p) => (
                <span key={p} className="text-xs bg-muted px-2 py-0.5 rounded font-mono">{`{{${p}}}`}</span>
              ))}
            </div>
          </div>
        )}

        <div className="flex justify-end gap-3">
          <Button variant="outline" type="button" asChild>
            <Link href="/documents/templates">Cancel</Link>
          </Button>
          <Button type="submit" disabled={isPending || !selectedTemplateId || !orgName}>
            {isPending ? (
              <>
                <div className="animate-spin h-4 w-4 border-2 border-current border-t-transparent rounded-full mr-2" />
                Generating...
              </>
            ) : (
              <>
                <Wand2 className="h-4 w-4 mr-2" />
                Generate Document
              </>
            )}
          </Button>
        </div>
      </form>
    </div>
  );
}
