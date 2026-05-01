import { useState, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetAllDocuments,
  getGetAllDocumentsQueryKey,
  useListControls,
  useListUsers,
} from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Link } from "wouter";
import { FilePlus, FileText, UploadCloud, Loader2, X } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useOrg } from "@/context/OrgContext";
import { cn } from "@/lib/utils";

// ─── Constants ────────────────────────────────────────────────────────────────

const STATUS_COLORS: Record<string, string> = {
  draft: "bg-gray-100 text-gray-700",
  needs_classification: "bg-gray-100 text-gray-600",
  pending_review: "bg-yellow-100 text-yellow-700",
  approved: "bg-blue-100 text-blue-700",
  assessor_ready: "bg-purple-100 text-purple-700",
  active: "bg-green-100 text-green-700",
  needs_update: "bg-orange-100 text-orange-700",
  expired: "bg-red-100 text-red-700",
  superseded: "bg-slate-100 text-slate-600",
  archived: "bg-slate-100 text-slate-500",
  stale: "bg-orange-100 text-orange-700",
  rejected: "bg-red-100 text-red-600",
};

const DOC_TYPES = [
  { value: "policy", label: "Policy" },
  { value: "procedure", label: "Procedure" },
  { value: "log", label: "Log" },
  { value: "report", label: "Report" },
  { value: "register", label: "Register" },
  { value: "checklist", label: "Checklist" },
  { value: "narrative", label: "Narrative" },
  { value: "plan", label: "Plan" },
  { value: "form", label: "Form" },
  { value: "access_review", label: "Access Review" },
  { value: "training_record", label: "Training Record" },
  { value: "incident_record", label: "Incident Record" },
  { value: "risk_record", label: "Risk Record" },
  { value: "approval_record", label: "Approval Record" },
  { value: "system_inventory", label: "System Inventory" },
  { value: "asset_inventory", label: "Asset Inventory" },
  { value: "supplier_review", label: "Supplier Review" },
  { value: "backup_verification", label: "Backup Verification" },
  { value: "scan_report", label: "Scan Report" },
];

const TYPE_LABELS: Record<string, string> = Object.fromEntries(DOC_TYPES.map((t) => [t.value, t.label]));

function statusLabel(s: string) {
  return s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

// ─── Add Document Dialog ──────────────────────────────────────────────────────

function AddDocumentDialog({ open, onClose, onSaved }: { open: boolean; onClose: () => void; onSaved: () => void }) {
  const { toast } = useToast();
  const { activeOrg } = useOrg();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [title, setTitle] = useState("");
  const [docType, setDocType] = useState("policy");
  const [docStatus, setDocStatus] = useState("draft");
  const [ownerId, setOwnerId] = useState("");
  const [linkedControlIds, setLinkedControlIds] = useState<string[]>([]);
  const [effectiveDate, setEffectiveDate] = useState("");
  const [nextReviewDate, setNextReviewDate] = useState("");
  const [notes, setNotes] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);

  const { data: users = [] } = useListUsers();
  const { data: controlsData } = useListControls();
  const controls = (controlsData as any[]) ?? [];

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] ?? null;
    setSelectedFile(file);
    if (file && !title) setTitle(file.name.replace(/\.[^.]+$/, ""));
  };

  const toggleControl = (id: string) => {
    setLinkedControlIds((prev) =>
      prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id]
    );
  };

  const handleSave = async () => {
    if (!title.trim() || !docType) {
      toast({ title: "Title and document type are required", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const token = localStorage.getItem("auth_token");
      const headers: Record<string, string> = { Authorization: `Bearer ${token}` };
      if (activeOrg?.id) headers["X-Organization-ID"] = activeOrg.id;

      const fd = new FormData();
      fd.append("title", title);
      fd.append("docType", docType);
      fd.append("status", docStatus);
      fd.append("linkedControlIds", JSON.stringify(linkedControlIds));
      if (ownerId) fd.append("ownerId", ownerId);
      if (effectiveDate) fd.append("effectiveDate", effectiveDate);
      if (nextReviewDate) fd.append("nextReviewDate", nextReviewDate);
      if (notes) fd.append("internalNotes", notes);
      if (selectedFile) fd.append("file", selectedFile);

      const res = await fetch("/api/documents/upload", { method: "POST", headers, body: fd });
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        throw new Error(e.error ?? "Upload failed");
      }

      toast({ title: "Document added" });
      setTitle(""); setDocType("policy"); setDocStatus("draft");
      setOwnerId(""); setLinkedControlIds([]); setEffectiveDate("");
      setNextReviewDate(""); setNotes(""); setSelectedFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      onSaved();
      onClose();
    } catch (err: any) {
      toast({ title: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col">
        <DialogHeader className="shrink-0">
          <DialogTitle>Add Document</DialogTitle>
        </DialogHeader>

        <div className="overflow-y-auto flex-1 min-h-0 py-2 space-y-4">
          {/* File upload area */}
          <div
            className="border-2 border-dashed rounded-lg p-5 text-center cursor-pointer hover:border-primary/50 hover:bg-muted/30 transition-colors"
            onClick={() => fileInputRef.current?.click()}
          >
            {selectedFile ? (
              <div className="flex items-center justify-center gap-2">
                <UploadCloud className="h-5 w-5 text-primary" />
                <span className="font-medium text-sm">{selectedFile.name}</span>
                <span className="text-xs text-muted-foreground">({(selectedFile.size / 1024).toFixed(0)} KB)</span>
                <button
                  className="ml-1 text-muted-foreground hover:text-foreground"
                  onClick={(e) => { e.stopPropagation(); setSelectedFile(null); if (fileInputRef.current) fileInputRef.current.value = ""; }}
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            ) : (
              <>
                <UploadCloud className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">Click to attach a file <span className="text-xs">(optional)</span></p>
                <p className="text-xs text-muted-foreground mt-1">PDF, DOCX, XLSX, PNG, JPG up to 25 MB</p>
              </>
            )}
            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              accept=".pdf,.doc,.docx,.xls,.xlsx,.csv,.txt,.png,.jpg,.jpeg"
              onChange={handleFileChange}
            />
          </div>

          <div className="space-y-1.5">
            <Label>Title <span className="text-red-500">*</span></Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Document title" />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Document Type <span className="text-red-500">*</span></Label>
              <Select value={docType} onValueChange={setDocType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {DOC_TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Status</Label>
              <Select value={docStatus} onValueChange={setDocStatus}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="draft">Draft</SelectItem>
                  <SelectItem value="pending_review">Pending Review</SelectItem>
                  <SelectItem value="approved">Approved</SelectItem>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="assessor_ready">Assessor Ready</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Owner</Label>
              <Select value={ownerId || "__none__"} onValueChange={(v) => setOwnerId(v === "__none__" ? "" : v)}>
                <SelectTrigger><SelectValue placeholder="Assign owner..." /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Unassigned</SelectItem>
                  {users.map((u: any) => <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Effective Date</Label>
              <Input type="date" value={effectiveDate} onChange={(e) => setEffectiveDate(e.target.value)} />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Next Review Date</Label>
            <Input type="date" value={nextReviewDate} onChange={(e) => setNextReviewDate(e.target.value)} />
          </div>

          {/* Linked controls */}
          <div className="space-y-1.5">
            <Label>Linked Controls <span className="text-muted-foreground text-xs">(optional)</span></Label>
            <div className="border rounded-md max-h-36 overflow-y-auto divide-y">
              {controls.length === 0 ? (
                <p className="text-xs text-muted-foreground p-3">No controls available</p>
              ) : controls.map((c: any) => (
                <label key={c.id} className="flex items-center gap-2 px-3 py-1.5 text-sm cursor-pointer hover:bg-muted/50">
                  <input
                    type="checkbox"
                    checked={linkedControlIds.includes(c.id)}
                    onChange={() => toggleControl(c.id)}
                    className="rounded"
                  />
                  <span className="font-mono text-xs text-muted-foreground w-16 shrink-0">{c.controlId}</span>
                  <span className="truncate">{c.title}</span>
                </label>
              ))}
            </div>
            {linkedControlIds.length > 0 && (
              <p className="text-xs text-muted-foreground">{linkedControlIds.length} control{linkedControlIds.length !== 1 ? "s" : ""} selected</p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label>Internal Notes</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Notes about this document..." rows={2} className="min-h-[60px]" />
          </div>
        </div>

        <DialogFooter className="shrink-0">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Add Document
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function DocumentsList() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [type, setType] = useState("all");
  const [status, setStatus] = useState("all");
  const [domain, setDomain] = useState("all");
  const [sourceType, setSourceType] = useState("all");
  const [showAdd, setShowAdd] = useState(false);

  const { data: docs, isLoading } = useGetAllDocuments({
    type: type !== "all" ? type : undefined,
    status: status !== "all" ? status : undefined,
    search: search || undefined,
    domain: domain !== "all" ? domain : undefined,
    sourceType: sourceType !== "all" ? (sourceType as "document" | "evidence") : undefined,
  });

  const domainOptions = [...new Set(
    (docs ?? []).flatMap((d) => d.domains.map((dom) => dom.name))
  )].sort();

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">All Documents</h1>
          <p className="text-muted-foreground mt-1">
            {docs?.length ?? 0} item{(docs?.length ?? 0) !== 1 ? "s" : ""} — uploaded documents and evidence
          </p>
        </div>
        <Button onClick={() => setShowAdd(true)}>
          <FilePlus className="h-4 w-4 mr-2" />
          Add Document
        </Button>
      </div>

      <Card>
        <CardContent className="pt-6">
          {/* Filters */}
          <div className="flex gap-3 mb-5 flex-wrap">
            <Input
              placeholder="Search by title..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="max-w-xs"
            />
            <Select value={type} onValueChange={setType}>
              <SelectTrigger className="w-44">
                <SelectValue placeholder="Type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                {DOC_TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger className="w-44">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                <SelectItem value="draft">Draft</SelectItem>
                <SelectItem value="pending_review">Pending Review</SelectItem>
                <SelectItem value="approved">Approved</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="assessor_ready">Assessor Ready</SelectItem>
                <SelectItem value="needs_update">Needs Update</SelectItem>
                <SelectItem value="expired">Expired</SelectItem>
                <SelectItem value="archived">Archived</SelectItem>
              </SelectContent>
            </Select>
            <Select value={domain} onValueChange={setDomain}>
              <SelectTrigger className="w-44">
                <SelectValue placeholder="Domain" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Domains</SelectItem>
                {domainOptions.map((d) => <SelectItem key={d} value={d}>{d}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={sourceType} onValueChange={setSourceType}>
              <SelectTrigger className="w-44">
                <SelectValue placeholder="Source" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Sources</SelectItem>
                <SelectItem value="document">Uploaded Document</SelectItem>
                <SelectItem value="evidence">Uploaded Evidence</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {isLoading ? (
            <div className="space-y-3">
              {[...Array(5)].map((_, i) => <div key={i} className="h-12 animate-pulse bg-muted rounded" />)}
            </div>
          ) : !docs?.length ? (
            <div className="text-center py-14 text-muted-foreground">
              <FileText className="h-12 w-12 mx-auto mb-3 opacity-30" />
              <p className="font-medium">No documents found</p>
              <p className="text-sm mt-1">Add a document to track policies, procedures, and compliance records.</p>
              <Button className="mt-4" onClick={() => setShowAdd(true)}>
                <FilePlus className="h-4 w-4 mr-2" />
                Add First Document
              </Button>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Title</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Linked Controls</TableHead>
                  <TableHead>Security Domain</TableHead>
                  <TableHead>Level</TableHead>
                  <TableHead>Owner</TableHead>
                  <TableHead>Next Review</TableHead>
                  <TableHead>Source</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {docs.map((doc) => {
                  const isAlert = doc.status === "expired" || doc.status === "needs_update";
                  const href = doc.sourceType === "evidence"
                    ? `/evidence/${doc.id}`
                    : `/documents/${doc.id}`;
                  return (
                    <TableRow key={doc.id} className={isAlert ? "bg-red-50 dark:bg-red-950/20" : ""}>
                      <TableCell className="font-medium max-w-xs">
                        <Link href={href} className="text-primary hover:underline flex items-center gap-1.5">
                          {doc.sourceType === "evidence"
                            ? <UploadCloud className="h-3.5 w-3.5 opacity-60 shrink-0" />
                            : <FileText className="h-3.5 w-3.5 opacity-60 shrink-0" />}
                          <span className="truncate">{doc.title}</span>
                        </Link>
                        {doc.fileName && (
                          <p className="text-xs text-muted-foreground mt-0.5 truncate">{doc.fileName}</p>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-xs whitespace-nowrap">
                          {TYPE_LABELS[doc.type] ?? doc.type}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium whitespace-nowrap ${STATUS_COLORS[doc.status] ?? "bg-gray-100 text-gray-700"}`}>
                          {statusLabel(doc.status)}
                        </span>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1 max-w-[180px]">
                          {doc.linkedControls.length === 0
                            ? <span className="text-muted-foreground text-xs">—</span>
                            : doc.linkedControls.slice(0, 3).map((c) => (
                              <Link key={c.id} href={`/controls/${c.id}`}>
                                <Badge variant="outline" className="text-xs cursor-pointer hover:bg-muted">{c.label}</Badge>
                              </Link>
                            ))}
                          {doc.linkedControls.length > 3 && (
                            <span className="text-xs text-muted-foreground">+{doc.linkedControls.length - 3}</span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1 max-w-[150px]">
                          {doc.domains.length === 0
                            ? <span className="text-muted-foreground text-xs">—</span>
                            : doc.domains.slice(0, 2).map((d) => (
                              <span key={d.name} className="text-xs text-muted-foreground whitespace-nowrap">
                                {d.code ? `${d.code} · ` : ""}{d.name.length > 20 ? d.code || d.name : d.name}
                              </span>
                            ))}
                        </div>
                      </TableCell>
                      <TableCell className="text-sm">
                        {doc.cmmcLevels.length > 0 ? doc.cmmcLevels.join(", ") : (doc.cmmcLevel ?? "—")}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground whitespace-nowrap">{doc.ownerName ?? "—"}</TableCell>
                      <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                        {doc.nextReviewDate ? new Date(doc.nextReviewDate).toLocaleDateString() : "—"}
                      </TableCell>
                      <TableCell>
                        {doc.sourceType === "evidence" ? (
                          <Badge className="bg-blue-50 text-blue-700 border border-blue-200 text-xs whitespace-nowrap">
                            <UploadCloud className="h-3 w-3 mr-1" />
                            Evidence
                          </Badge>
                        ) : (
                          <Badge className="bg-slate-50 text-slate-700 border border-slate-200 text-xs whitespace-nowrap">
                            <FileText className="h-3 w-3 mr-1" />
                            Document
                          </Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <AddDocumentDialog
        open={showAdd}
        onClose={() => setShowAdd(false)}
        onSaved={() => qc.invalidateQueries({ queryKey: getGetAllDocumentsQueryKey() })}
      />
    </div>
  );
}
