import { useState } from "react";
import { useListDocumentLogs, useListDocumentTemplates, useGenerateLog } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { Link } from "wouter";
import { Plus, Clock, FileText } from "lucide-react";

const DOC_STATUS_COLORS: Record<string, string> = {
  draft: "bg-gray-100 text-gray-700",
  pending_review: "bg-yellow-100 text-yellow-700",
  approved: "bg-green-100 text-green-700",
  active: "bg-green-100 text-green-700",
};

export default function DocumentLogs() {
  const { toast } = useToast();
  const [statusFilter, setStatusFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [generateOpen, setGenerateOpen] = useState(false);

  const [selectedTemplateId, setSelectedTemplateId] = useState("");
  const [logTitle, setLogTitle] = useState("");
  const [periodStart, setPeriodStart] = useState(new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split("T")[0]);
  const [periodEnd, setPeriodEnd] = useState(new Date().toISOString().split("T")[0]);

  const { data: logs, isLoading, refetch } = useListDocumentLogs({
    status: statusFilter !== "all" ? statusFilter : undefined,
    search: search || undefined,
  });

  const { data: templates } = useListDocumentTemplates({ docType: "log" });
  const { mutate: generateLog, isPending } = useGenerateLog();

  const handleGenerate = () => {
    if (!selectedTemplateId) {
      toast({ title: "Select a log template", variant: "destructive" });
      return;
    }
    generateLog(
      {
        templateId: selectedTemplateId,
        title: logTitle || undefined,
        periodStart: periodStart ? new Date(periodStart).toISOString() : undefined,
        periodEnd: periodEnd ? new Date(periodEnd).toISOString() : undefined,
      },
      {
        onSuccess: () => {
          toast({ title: "Log generated" });
          setGenerateOpen(false);
          refetch();
        },
        onError: () => toast({ title: "Failed to generate log", variant: "destructive" }),
      }
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">Compliance Logs</h1>
          <p className="text-muted-foreground mt-1">Generate and track recurring compliance log activities</p>
        </div>
        <Dialog open={generateOpen} onOpenChange={setGenerateOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              New Log
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Generate Compliance Log</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 mt-4">
              <div>
                <Label>Log Template *</Label>
                <Select value={selectedTemplateId} onValueChange={setSelectedTemplateId}>
                  <SelectTrigger className="mt-1.5">
                    <SelectValue placeholder="Select template..." />
                  </SelectTrigger>
                  <SelectContent>
                    {templates?.map((t) => (
                      <SelectItem key={t.id} value={t.id}>{t.title}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Log Title (optional)</Label>
                <Input
                  value={logTitle}
                  onChange={(e) => setLogTitle(e.target.value)}
                  placeholder="Override template title..."
                  className="mt-1.5"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Period Start</Label>
                  <Input type="date" value={periodStart} onChange={(e) => setPeriodStart(e.target.value)} className="mt-1.5" />
                </div>
                <div>
                  <Label>Period End</Label>
                  <Input type="date" value={periodEnd} onChange={(e) => setPeriodEnd(e.target.value)} className="mt-1.5" />
                </div>
              </div>
              <Button onClick={handleGenerate} disabled={isPending || !selectedTemplateId} className="w-full">
                {isPending ? "Generating..." : "Generate Log"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardContent className="pt-6">
          <div className="flex gap-3 mb-6 flex-wrap">
            <Input
              placeholder="Search logs..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="max-w-xs"
            />
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                <SelectItem value="draft">Draft</SelectItem>
                <SelectItem value="pending_review">Pending Review</SelectItem>
                <SelectItem value="approved">Approved</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {isLoading ? (
            <div className="text-center py-8 text-muted-foreground">Loading logs...</div>
          ) : !logs?.length ? (
            <div className="text-center py-12 text-muted-foreground">
              <Clock className="h-12 w-12 mx-auto mb-3 opacity-30" />
              <p className="font-medium">No compliance logs yet</p>
              <p className="text-sm mt-1">Generate your first log using a log template</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Title</TableHead>
                  <TableHead>Template</TableHead>
                  <TableHead>Period</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Responsible</TableHead>
                  <TableHead>Created</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {logs.map((log) => (
                  <TableRow key={log.id}>
                    <TableCell className="font-medium">
                      <Link href={`/documents/logs/${log.id}`} className="text-primary hover:underline flex items-center gap-2">
                        <FileText className="h-3.5 w-3.5 opacity-60" />
                        {log.title}
                      </Link>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">{log.templateTitle ?? "—"}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {log.periodStart ? new Date(log.periodStart).toLocaleDateString() : "—"}
                      {log.periodEnd ? ` – ${new Date(log.periodEnd).toLocaleDateString()}` : ""}
                    </TableCell>
                    <TableCell>
                      <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${DOC_STATUS_COLORS[log.status] ?? "bg-gray-100 text-gray-700"}`}>
                        {log.status.replace(/_/g, " ")}
                      </span>
                    </TableCell>
                    <TableCell className="text-sm">{log.responsibleUserName ?? "—"}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{new Date(log.createdAt).toLocaleDateString()}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
