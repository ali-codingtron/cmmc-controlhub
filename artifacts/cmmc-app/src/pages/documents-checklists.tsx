import { useState } from "react";
import { useListChecklists, useCompleteChecklist } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { CheckCircle2, ClipboardList, Play } from "lucide-react";

type ChecklistTemplate = {
  id: string;
  title: string;
  description?: string | null;
  docType: string;
  items: Array<{
    id: string;
    itemText: string;
    description?: string | null;
    isRequired: boolean;
    sortOrder: number;
  }>;
};

export default function DocumentChecklists() {
  const { toast } = useToast();
  const { data: checklists, isLoading, refetch } = useListChecklists();
  const { mutate: completeChecklist, isPending } = useCompleteChecklist();

  const [activeChecklist, setActiveChecklist] = useState<ChecklistTemplate | null>(null);
  const [itemResults, setItemResults] = useState<Record<string, boolean>>({});
  const [completionTitle, setCompletionTitle] = useState("");
  const [notes, setNotes] = useState("");
  const [generateEvidence, setGenerateEvidence] = useState(true);

  const openChecklist = (cl: ChecklistTemplate) => {
    setActiveChecklist(cl);
    setCompletionTitle(`${cl.title} — ${new Date().toLocaleDateString()}`);
    setItemResults({});
    setNotes("");
  };

  const handleComplete = () => {
    if (!activeChecklist) return;
    const results = activeChecklist.items.map((item) => ({
      itemId: item.id,
      isCompleted: itemResults[item.id] ?? false,
    }));

    const requiredIncomplete = activeChecklist.items.filter(
      (item) => item.isRequired && !itemResults[item.id]
    );

    if (requiredIncomplete.length > 0) {
      toast({
        title: `${requiredIncomplete.length} required item(s) not checked`,
        description: "Please complete all required items before submitting.",
        variant: "destructive",
      });
      return;
    }

    completeChecklist(
      {
        id: activeChecklist.id,
        title: completionTitle,
        notes,
        itemResults: results,
        generateEvidence,
      },
      {
        onSuccess: () => {
          toast({ title: "Checklist completed" + (generateEvidence ? " and evidence created" : "") });
          setActiveChecklist(null);
          refetch();
        },
        onError: () => toast({ title: "Failed to complete checklist", variant: "destructive" }),
      }
    );
  };

  const completedCount = Object.values(itemResults).filter(Boolean).length;
  const totalCount = activeChecklist?.items.length ?? 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Compliance Checklists</h1>
        <p className="text-muted-foreground mt-1">Run checklists and generate evidence of completion</p>
      </div>

      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-2">
          {[...Array(4)].map((_, i) => (
            <Card key={i}><CardContent className="pt-6"><div className="h-40 animate-pulse bg-muted rounded" /></CardContent></Card>
          ))}
        </div>
      ) : !checklists?.length ? (
        <div className="text-center py-12 text-muted-foreground">
          <ClipboardList className="h-12 w-12 mx-auto mb-3 opacity-30" />
          <p className="font-medium">No checklists available</p>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {(checklists as unknown as ChecklistTemplate[]).map((cl) => (
            <Card key={cl.id} className="hover:shadow-md transition-shadow">
              <CardContent className="pt-6">
                <div className="flex justify-between items-start mb-3">
                  <h3 className="font-semibold">{cl.title}</h3>
                  <Badge variant="outline" className="capitalize text-xs">{cl.docType}</Badge>
                </div>
                {cl.description && (
                  <p className="text-sm text-muted-foreground mb-4">{cl.description}</p>
                )}
                <div className="mb-4">
                  <p className="text-xs text-muted-foreground mb-2">{cl.items.length} items</p>
                  <div className="space-y-1">
                    {cl.items.slice(0, 4).map((item) => (
                      <div key={item.id} className="flex items-start gap-2 text-sm">
                        <CheckCircle2 className="h-3.5 w-3.5 text-muted-foreground mt-0.5 shrink-0" />
                        <span className="text-muted-foreground truncate">{item.itemText}</span>
                        {item.isRequired && <span className="text-red-500 text-xs shrink-0">*</span>}
                      </div>
                    ))}
                    {cl.items.length > 4 && (
                      <p className="text-xs text-muted-foreground pl-5">+{cl.items.length - 4} more items</p>
                    )}
                  </div>
                </div>
                <Button onClick={() => openChecklist(cl)} className="w-full">
                  <Play className="h-4 w-4 mr-2" />
                  Run Checklist
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={!!activeChecklist} onOpenChange={(open) => !open && setActiveChecklist(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{activeChecklist?.title}</DialogTitle>
          </DialogHeader>
          {activeChecklist && (
            <div className="space-y-6 mt-4">
              <div>
                <Label>Completion Title</Label>
                <Input
                  value={completionTitle}
                  onChange={(e) => setCompletionTitle(e.target.value)}
                  className="mt-1.5"
                />
              </div>

              <div>
                <div className="flex justify-between items-center mb-3">
                  <Label>Checklist Items</Label>
                  <span className="text-sm text-muted-foreground">{completedCount} / {totalCount} completed</span>
                </div>
                <div className="space-y-3 border rounded-lg p-4">
                  {activeChecklist.items.map((item) => (
                    <div key={item.id} className="flex items-start gap-3">
                      <Checkbox
                        id={item.id}
                        checked={itemResults[item.id] ?? false}
                        onCheckedChange={(checked) =>
                          setItemResults((prev) => ({ ...prev, [item.id]: !!checked }))
                        }
                        className="mt-0.5"
                      />
                      <Label htmlFor={item.id} className="cursor-pointer font-normal leading-snug">
                        {item.itemText}
                        {item.isRequired && <span className="text-red-500 ml-1">*</span>}
                        {item.description && (
                          <span className="block text-xs text-muted-foreground mt-0.5">{item.description}</span>
                        )}
                      </Label>
                    </div>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground mt-1">* Required items</p>
              </div>

              <div>
                <Label>Notes (optional)</Label>
                <Textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Any notes about this checklist completion..."
                  className="mt-1.5"
                  rows={3}
                />
              </div>

              <div className="flex items-center gap-2">
                <Checkbox
                  id="gen-evidence"
                  checked={generateEvidence}
                  onCheckedChange={(c) => setGenerateEvidence(!!c)}
                />
                <Label htmlFor="gen-evidence" className="cursor-pointer font-normal">
                  Generate evidence record upon completion
                </Label>
              </div>

              <div className="flex justify-end gap-3">
                <Button variant="outline" onClick={() => setActiveChecklist(null)}>Cancel</Button>
                <Button onClick={handleComplete} disabled={isPending}>
                  {isPending ? "Completing..." : "Complete Checklist"}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
