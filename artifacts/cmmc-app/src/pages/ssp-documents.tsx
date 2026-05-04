import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useOrg } from "@/context/OrgContext";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Upload,
  FileText,
  Download,
  Star,
  Loader2,
  Plus,
  RefreshCw,
  Trash2,
} from "lucide-react";

interface SspDocument {
  id: string;
  title: string;
  documentNumber: string | null;
  revisionNumber: string | null;
  revisionDate: string | null;
  preparedBy: string | null;
  reviewedBy: string | null;
  approvedBy: string | null;
  organization: string | null;
  systemName: string | null;
  systemOwner: string | null;
  cmmcLevel: string | null;
  status: string;
  originalFileName: string | null;
  fileKey: string | null;
  isPrimary: boolean;
  extractedAt: string | null;
  nextReviewDate: string | null;
  notes: string | null;
  createdAt: string;
}

const STATUS_COLORS: Record<string, string> = {
  draft: "bg-yellow-100 text-yellow-800",
  review: "bg-blue-100 text-blue-800",
  approved: "bg-green-100 text-green-800",
  superseded: "bg-gray-100 text-gray-600",
};

function apiHeaders(orgId?: string) {
  const token = localStorage.getItem("auth_token");
  return {
    Authorization: `Bearer ${token}`,
    ...(orgId ? { "X-Organization-ID": orgId } : {}),
  };
}

export default function SspDocuments() {
  const { activeOrg } = useOrg();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [showUpload, setShowUpload] = useState(false);

  const { data: docs = [], isLoading } = useQuery<SspDocument[]>({
    queryKey: ["ssp-documents", activeOrg?.id],
    queryFn: async () => {
      const r = await fetch("/api/ssp", { headers: apiHeaders(activeOrg?.id) });
      if (!r.ok) return [];
      return r.json();
    },
    enabled: !!activeOrg?.id,
  });

  const setPrimaryMutation = useMutation({
    mutationFn: async (id: string) => {
      const r = await fetch(`/api/ssp/${id}/set-primary`, {
        method: "POST",
        headers: apiHeaders(activeOrg?.id),
      });
      if (!r.ok) throw new Error("Failed");
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["ssp-documents", activeOrg?.id] });
      qc.invalidateQueries({ queryKey: ["ssp-primary", activeOrg?.id] });
      toast({ title: "Primary SSP updated" });
    },
  });

  const parseMutation = useMutation({
    mutationFn: async (id: string) => {
      const r = await fetch(`/api/ssp/${id}/parse`, {
        method: "POST",
        headers: apiHeaders(activeOrg?.id),
      });
      if (!r.ok) throw new Error("Failed to parse");
      return r.json();
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["ssp-documents", activeOrg?.id] });
      qc.invalidateQueries({ queryKey: ["ssp-primary", activeOrg?.id] });
      toast({
        title: "Parsing complete",
        description: `Extracted ${data.sectionsCount} sections and ${data.mappingsCount} control mappings`,
      });
    },
    onError: () => toast({ title: "Parse failed", variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const r = await fetch(`/api/ssp/${id}`, {
        method: "DELETE",
        headers: apiHeaders(activeOrg?.id),
      });
      if (!r.ok) throw new Error("Failed");
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["ssp-documents", activeOrg?.id] });
      qc.invalidateQueries({ queryKey: ["ssp-primary", activeOrg?.id] });
      toast({ title: "SSP deleted" });
    },
    onError: () => toast({ title: "Delete failed", variant: "destructive" }),
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">SSP Documents</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Upload and manage your System Security Plan documents
          </p>
        </div>
        <Button onClick={() => setShowUpload(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Upload SSP
        </Button>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : docs.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-20 text-center">
            <FileText className="h-12 w-12 text-muted-foreground/30 mb-4" />
            <p className="font-medium text-muted-foreground">No SSP documents yet</p>
            <p className="text-sm text-muted-foreground mt-1 mb-4">
              Upload a DOCX System Security Plan to get started
            </p>
            <Button onClick={() => setShowUpload(true)}>
              <Upload className="h-4 w-4 mr-2" />
              Upload SSP
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {docs.map((doc) => (
            <Card key={doc.id} className={doc.isPrimary ? "border-primary/50 shadow-sm" : ""}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-start gap-3 min-w-0">
                    <FileText className="h-5 w-5 text-primary mt-0.5 shrink-0" />
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold truncate">{doc.title}</span>
                        {doc.isPrimary && (
                          <Badge className="bg-primary/10 text-primary border-primary/20 text-[10px]">
                            <Star className="h-3 w-3 mr-1" />
                            Primary
                          </Badge>
                        )}
                        <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${STATUS_COLORS[doc.status] ?? "bg-gray-100 text-gray-700"}`}>
                          {doc.status.charAt(0).toUpperCase() + doc.status.slice(1)}
                        </span>
                      </div>
                      <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground flex-wrap">
                        {doc.documentNumber && <span>#{doc.documentNumber}</span>}
                        {doc.revisionNumber && <span>Rev {doc.revisionNumber}</span>}
                        {doc.revisionDate && <span>{doc.revisionDate}</span>}
                        {doc.organization && <span>{doc.organization}</span>}
                        {doc.cmmcLevel && <span>CMMC {doc.cmmcLevel}</span>}
                      </div>
                      {doc.originalFileName && (
                        <p className="text-xs text-muted-foreground mt-0.5 truncate">
                          {doc.originalFileName}
                          {doc.extractedAt ? " · Parsed" : " · Not yet parsed"}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    {!doc.isPrimary && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setPrimaryMutation.mutate(doc.id)}
                        disabled={setPrimaryMutation.isPending}
                      >
                        <Star className="h-3.5 w-3.5 mr-1" />
                        Set Primary
                      </Button>
                    )}
                    {doc.fileKey && !doc.extractedAt && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => parseMutation.mutate(doc.id)}
                        disabled={parseMutation.isPending}
                      >
                        {parseMutation.isPending ? (
                          <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
                        ) : (
                          <RefreshCw className="h-3.5 w-3.5 mr-1" />
                        )}
                        Parse
                      </Button>
                    )}
                    {doc.extractedAt && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => parseMutation.mutate(doc.id)}
                        disabled={parseMutation.isPending}
                        title="Re-parse document"
                      >
                        {parseMutation.isPending ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <RefreshCw className="h-3.5 w-3.5" />
                        )}
                      </Button>
                    )}
                    {doc.fileKey && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={async () => {
                          const token = localStorage.getItem("auth_token");
                          const r = await fetch(`/api/ssp/${doc.id}/download`, {
                            headers: apiHeaders(activeOrg?.id),
                          });
                          if (!r.ok) return;
                          const blob = await r.blob();
                          const url = URL.createObjectURL(blob);
                          const a = document.createElement("a");
                          a.href = url;
                          a.download = doc.originalFileName ?? `${doc.title}.docx`;
                          a.click();
                          URL.revokeObjectURL(url);
                        }}
                      >
                        <Download className="h-3.5 w-3.5" />
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-destructive hover:text-destructive"
                      onClick={() => {
                        if (confirm("Delete this SSP document?")) deleteMutation.mutate(doc.id);
                      }}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <UploadDialog
        open={showUpload}
        onClose={() => setShowUpload(false)}
        orgId={activeOrg?.id}
        onSaved={() => {
          qc.invalidateQueries({ queryKey: ["ssp-documents", activeOrg?.id] });
          qc.invalidateQueries({ queryKey: ["ssp-primary", activeOrg?.id] });
          setShowUpload(false);
        }}
      />
    </div>
  );
}

function UploadDialog({
  open,
  onClose,
  orgId,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  orgId?: string;
  onSaved: () => void;
}) {
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    title: "",
    documentNumber: "",
    revisionNumber: "",
    revisionDate: "",
    preparedBy: "",
    reviewedBy: "",
    approvedBy: "",
    organization: "",
    systemName: "",
    systemOwner: "",
    cmmcLevel: "L2",
    status: "draft",
    notes: "",
  });
  const [file, setFile] = useState<File | null>(null);

  const set = (k: string, v: string) => setForm((p) => ({ ...p, [k]: v }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.title.trim()) {
      toast({ title: "Title is required", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const fd = new FormData();
      Object.entries(form).forEach(([k, v]) => fd.append(k, v));
      if (file) fd.append("file", file);

      const token = localStorage.getItem("auth_token");
      const r = await fetch("/api/ssp", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          ...(orgId ? { "X-Organization-ID": orgId } : {}),
        },
        body: fd,
      });
      if (!r.ok) throw new Error("Upload failed");
      const created = await r.json();
      toast({ title: "SSP uploaded successfully" });

      if (file && created?.id) {
        toast({ title: "Parsing document…", description: "Extracting sections and control mappings" });
        const pr = await fetch(`/api/ssp/${created.id}/parse`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            ...(orgId ? { "X-Organization-ID": orgId } : {}),
          },
        });
        if (pr.ok) {
          const pdata = await pr.json();
          toast({
            title: "Parsing complete",
            description: `Extracted ${pdata.sectionsCount} sections, ${pdata.mappingsCount} control mappings`,
          });
        }
      }
      onSaved();
    } catch {
      toast({ title: "Upload failed", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Upload System Security Plan</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <Label htmlFor="ssp-title">SSP Title *</Label>
              <Input id="ssp-title" value={form.title} onChange={(e) => set("title", e.target.value)} placeholder="System Security Plan" />
            </div>
            <div>
              <Label htmlFor="ssp-doc-number">Document Number</Label>
              <Input id="ssp-doc-number" value={form.documentNumber} onChange={(e) => set("documentNumber", e.target.value)} placeholder="VTC-IMS-QP026" />
            </div>
            <div>
              <Label htmlFor="ssp-rev-number">Revision Number</Label>
              <Input id="ssp-rev-number" value={form.revisionNumber} onChange={(e) => set("revisionNumber", e.target.value)} placeholder="2.0" />
            </div>
            <div>
              <Label htmlFor="ssp-rev-date">Revision Date</Label>
              <Input id="ssp-rev-date" value={form.revisionDate} onChange={(e) => set("revisionDate", e.target.value)} placeholder="4/08/2026" />
            </div>
            <div>
              <Label htmlFor="ssp-cmmc-level">CMMC Level</Label>
              <Select value={form.cmmcLevel} onValueChange={(v) => set("cmmcLevel", v)}>
                <SelectTrigger id="ssp-cmmc-level"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="L1">Level 1</SelectItem>
                  <SelectItem value="L2">Level 2</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="ssp-status">Status</Label>
              <Select value={form.status} onValueChange={(v) => set("status", v)}>
                <SelectTrigger id="ssp-status"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="draft">Draft</SelectItem>
                  <SelectItem value="review">In Review</SelectItem>
                  <SelectItem value="approved">Approved</SelectItem>
                  <SelectItem value="superseded">Superseded</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="ssp-prepared-by">Prepared By</Label>
              <Input id="ssp-prepared-by" value={form.preparedBy} onChange={(e) => set("preparedBy", e.target.value)} />
            </div>
            <div>
              <Label htmlFor="ssp-reviewed-by">Reviewed By</Label>
              <Input id="ssp-reviewed-by" value={form.reviewedBy} onChange={(e) => set("reviewedBy", e.target.value)} />
            </div>
            <div>
              <Label htmlFor="ssp-approved-by">Approved By</Label>
              <Input id="ssp-approved-by" value={form.approvedBy} onChange={(e) => set("approvedBy", e.target.value)} />
            </div>
            <div>
              <Label htmlFor="ssp-organization">Organization</Label>
              <Input id="ssp-organization" value={form.organization} onChange={(e) => set("organization", e.target.value)} placeholder="Visionary Technology Consultants, LLC" />
            </div>
            <div>
              <Label htmlFor="ssp-system-name">System Name</Label>
              <Input id="ssp-system-name" value={form.systemName} onChange={(e) => set("systemName", e.target.value)} />
            </div>
            <div>
              <Label htmlFor="ssp-system-owner">System Owner</Label>
              <Input id="ssp-system-owner" value={form.systemOwner} onChange={(e) => set("systemOwner", e.target.value)} />
            </div>
            <div className="col-span-2">
              <Label htmlFor="ssp-notes">Notes</Label>
              <Textarea id="ssp-notes" value={form.notes} onChange={(e) => set("notes", e.target.value)} rows={2} />
            </div>
            <div className="col-span-2">
              <Label>Upload DOCX File</Label>
              <div className="mt-1 border-2 border-dashed rounded-lg p-4 text-center hover:border-primary/50 transition-colors">
                <input
                  type="file"
                  accept=".docx,.doc"
                  className="hidden"
                  id="ssp-file"
                  onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                />
                <label htmlFor="ssp-file" className="cursor-pointer">
                  <Upload className="h-6 w-6 mx-auto text-muted-foreground mb-2" />
                  {file ? (
                    <p className="text-sm font-medium text-primary">{file.name}</p>
                  ) : (
                    <p className="text-sm text-muted-foreground">Click to select a .docx file</p>
                  )}
                </label>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Upload className="h-4 w-4 mr-2" />}
              Upload SSP
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
