import { useState, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetEvidence,
  useGetEvidenceAuditLog,
  getGetEvidenceQueryKey,
  useListControls,
} from "@workspace/api-client-react";
import { useOrg } from "@/context/OrgContext";
import { useIsAssessor } from "@/lib/auth";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
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
import { StatusBadge } from "@/components/ui/badges";
import { useToast } from "@/hooks/use-toast";
import { Link, useLocation } from "wouter";
import {
  Download,
  Eye,
  EyeOff,
  Paperclip,
  Save,
  Archive,
  Trash2,
  ArrowLeft,
  Clock,
  User,
  Link2,
  Calendar,
  FileText,
  Star,
  Plus,
  X,
  Check,
  ChevronDown,
} from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { EvidenceFileViewer } from "@/components/evidence/EvidenceFileViewer";

const EVIDENCE_TYPES = [
  { value: "policy", label: "Policy" },
  { value: "procedure", label: "Procedure" },
  { value: "screenshot", label: "Screenshot" },
  { value: "log", label: "Log" },
  { value: "report", label: "Report" },
  { value: "ticket", label: "Ticket" },
  { value: "configuration_export", label: "Configuration Export" },
  { value: "access_review", label: "Access Review" },
  { value: "training_record", label: "Training Record" },
  { value: "incident_record", label: "Incident Record" },
  { value: "risk_record", label: "Risk Record" },
  { value: "approval_record", label: "Approval Record" },
  { value: "system_inventory", label: "System Inventory" },
  { value: "asset_inventory", label: "Asset Inventory" },
  { value: "supplier_review", label: "Supplier Review" },
  { value: "backup_verification", label: "Backup Verification" },
  { value: "network_diagram", label: "Network Diagram" },
  { value: "scan_report", label: "Vulnerability Scan" },
  { value: "other", label: "Other" },
];

const EVIDENCE_STATUSES = [
  { value: "draft", label: "Draft" },
  { value: "pending_review", label: "Pending Review" },
  { value: "approved", label: "Approved" },
  { value: "assessor_ready", label: "Assessor Ready" },
  { value: "rejected", label: "Rejected" },
  { value: "stale", label: "Stale" },
  { value: "superseded", label: "Superseded" },
  { value: "archived", label: "Archived" },
];

function formatDate(d: string | Date | null | undefined) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString();
}

function formatDateTime(d: string | Date | null | undefined) {
  if (!d) return "—";
  return new Date(d).toLocaleString();
}

function apiHeaders(orgId: string | null | undefined) {
  const token = localStorage.getItem("auth_token");
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
    ...(orgId ? { "X-Organization-ID": orgId } : {}),
  };
}

function downloadFile(id: string, fileName: string, orgId: string | undefined | null) {
  const token = localStorage.getItem("auth_token");
  fetch(`/api/evidence/${id}/download`, {
    headers: {
      Authorization: `Bearer ${token}`,
      ...(orgId ? { "X-Organization-ID": orgId } : {}),
    },
  })
    .then((r) => {
      if (!r.ok) throw new Error("Download failed");
      return r.blob();
    })
    .then((blob) => {
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = fileName ?? "evidence-file";
      a.click();
      URL.revokeObjectURL(url);
    })
    .catch(() => {});
}

export default function EvidenceDetail({ id }: { id: string }) {
  const { activeOrg } = useOrg();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [, navigate] = useLocation();

  const isAssessor = useIsAssessor();
  const { data: evidence, isLoading } = useGetEvidence(id);
  const { data: auditLog = [] } = useGetEvidenceAuditLog(id);

  const [saving, setSaving] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  // Linked controls management
  const [addLinkOpen, setAddLinkOpen] = useState(false);
  const [addingControl, setAddingControl] = useState(false);
  const [removingControlId, setRemovingControlId] = useState<string | null>(null);
  const [settingPrimaryId, setSettingPrimaryId] = useState<string | null>(null);

  const { data: allControls = [] } = useListControls({});

  // Form state — seeded from evidence once loaded
  const [form, setForm] = useState<{
    title: string;
    description: string;
    evidenceType: string;
    status: string;
    assessorSummary: string;
    internalNotes: string;
    collectedAt: string;
    expiresAt: string;
  } | null>(null);

  // Seed form once evidence loads (only once)
  if (evidence && !form) {
    setForm({
      title: evidence.title ?? "",
      description: evidence.description ?? "",
      evidenceType: evidence.evidenceType ?? "",
      status: evidence.status ?? "draft",
      assessorSummary: evidence.assessorSummary ?? "",
      internalNotes: evidence.internalNotes ?? "",
      collectedAt: evidence.collectedAt ? new Date(evidence.collectedAt).toISOString().split("T")[0] : "",
      expiresAt: evidence.expiresAt ? new Date(evidence.expiresAt).toISOString().split("T")[0] : "",
    });
  }

  const setField = (k: keyof NonNullable<typeof form>) => (v: string) =>
    setForm((f) => (f ? { ...f, [k]: v } : f));

  const invalidate = () => queryClient.invalidateQueries({ queryKey: getGetEvidenceQueryKey(id) });

  const handleAddLink = async (controlId: string) => {
    setAddingControl(true);
    try {
      const linkedIds: string[] = ((evidence as any)?.linkedControlIds ?? []) as string[];
      const isPrimary = linkedIds.length === 0;
      const res = await fetch(`/api/evidence/${id}/controls`, {
        method: "POST",
        headers: apiHeaders(activeOrg?.id),
        body: JSON.stringify({ controlId, isPrimary }),
      });
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        throw new Error(e.error ?? "Failed to add link");
      }
      toast({ title: "Control linked" });
      invalidate();
      setAddLinkOpen(false);
    } catch (err: any) {
      toast({ title: "Link failed", description: err.message, variant: "destructive" });
    } finally {
      setAddingControl(false);
    }
  };

  const handleRemoveLink = async (controlId: string) => {
    const linkedIds: string[] = ((evidence as any)?.linkedControlIds ?? []) as string[];
    if (linkedIds.length <= 1) {
      const confirmed = window.confirm(
        "This is the only linked control. Removing it will leave the evidence unmapped. Continue?"
      );
      if (!confirmed) return;
    }
    setRemovingControlId(controlId);
    try {
      const res = await fetch(`/api/evidence/${id}/controls/${controlId}`, {
        method: "DELETE",
        headers: apiHeaders(activeOrg?.id),
      });
      if (!res.ok) throw new Error("Failed to remove link");
      toast({ title: "Control unlinked" });
      invalidate();
    } catch {
      toast({ title: "Error", description: "Could not remove link", variant: "destructive" });
    } finally {
      setRemovingControlId(null);
    }
  };

  const handleSetPrimary = async (controlId: string) => {
    setSettingPrimaryId(controlId);
    try {
      const res = await fetch(`/api/evidence/${id}/controls/${controlId}/primary`, {
        method: "PATCH",
        headers: apiHeaders(activeOrg?.id),
      });
      if (!res.ok) throw new Error("Failed to set primary");
      toast({ title: "Primary control updated" });
      invalidate();
    } catch {
      toast({ title: "Error", description: "Could not update primary control", variant: "destructive" });
    } finally {
      setSettingPrimaryId(null);
    }
  };

  const handleSave = async () => {
    if (!form) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/evidence/${id}`, {
        method: "PATCH",
        headers: apiHeaders(activeOrg?.id),
        body: JSON.stringify({
          title: form.title,
          description: form.description,
          evidenceType: form.evidenceType,
          status: form.status,
          assessorSummary: form.assessorSummary,
          internalNotes: form.internalNotes,
          collectedAt: form.collectedAt || undefined,
          expiresAt: form.expiresAt || undefined,
        }),
      });
      if (!res.ok) throw new Error("Failed to save");
      toast({ title: "Evidence saved" });
      invalidate();
    } catch {
      toast({ title: "Error", description: "Could not save evidence", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleArchive = async () => {
    try {
      const res = await fetch(`/api/evidence/${id}/archive`, {
        method: "POST",
        headers: apiHeaders(activeOrg?.id),
      });
      if (!res.ok) throw new Error("Failed to archive");
      toast({ title: "Evidence archived" });
      invalidate();
    } catch {
      toast({ title: "Error", description: "Could not archive evidence", variant: "destructive" });
    }
  };

  const handleDelete = async () => {
    setIsDeleting(true);
    try {
      const res = await fetch(`/api/evidence/${id}`, {
        method: "DELETE",
        headers: apiHeaders(activeOrg?.id),
      });
      if (!res.ok) throw new Error("Failed to delete");
      toast({ title: "Evidence deleted permanently" });
      navigate("/evidence");
    } catch {
      toast({ title: "Error", description: "Could not delete evidence", variant: "destructive" });
    } finally {
      setIsDeleting(false);
      setShowDeleteDialog(false);
    }
  };

  if (isLoading) {
    return (
      <div className="p-8 flex items-center justify-center">
        <div className="text-muted-foreground">Loading evidence...</div>
      </div>
    );
  }
  if (!evidence || !form) {
    return <div className="p-8 text-center text-muted-foreground">Evidence not found</div>;
  }

  const ev = evidence as any;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <Button variant="ghost" size="icon" className="mt-0.5" onClick={() => window.history.back()}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <div className="flex items-center gap-3 mb-1">
              <h1 className="text-2xl font-bold">{evidence.title}</h1>
              <StatusBadge status={evidence.status} />
            </div>
            <p className="text-sm text-muted-foreground">
              Evidence · {EVIDENCE_TYPES.find((t) => t.value === evidence.evidenceType)?.label ?? evidence.evidenceType}
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              New evidence starts as <strong>Draft</strong> until reviewed or approved.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {!isAssessor && evidence.status !== "archived" && (
            <Button variant="outline" size="sm" onClick={handleArchive} className="gap-1.5">
              <Archive className="h-4 w-4" />
              Archive
            </Button>
          )}
          {!isAssessor && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowDeleteDialog(true)}
              className="gap-1.5 text-red-600 hover:text-red-700 border-red-200 hover:border-red-300"
            >
              <Trash2 className="h-4 w-4" />
              Delete
            </Button>
          )}
          {!isAssessor && (
            <Button size="sm" onClick={handleSave} disabled={saving} className="gap-1.5">
              <Save className="h-4 w-4" />
              {saving ? "Saving..." : "Save"}
            </Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: editable fields */}
        <div className="lg:col-span-2 space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label>Title</Label>
                <Input
                  value={form.title}
                  onChange={(e) => setField("title")(e.target.value)}
                  className="mt-1"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Evidence Type</Label>
                  <Select value={form.evidenceType} onValueChange={setField("evidenceType")}>
                    <SelectTrigger className="mt-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {EVIDENCE_TYPES.map((t) => (
                        <SelectItem key={t.value} value={t.value}>
                          {t.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Status</Label>
                  <Select value={form.status} onValueChange={setField("status")}>
                    <SelectTrigger className="mt-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {EVIDENCE_STATUSES.map((s) => (
                        <SelectItem key={s.value} value={s.value}>
                          {s.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground mt-1">
                    New evidence starts as Draft until reviewed or approved.
                  </p>
                </div>
              </div>

              <div>
                <Label>Description</Label>
                <Textarea
                  value={form.description}
                  onChange={(e) => setField("description")(e.target.value)}
                  placeholder="What does this evidence demonstrate?"
                  rows={3}
                  className="mt-1"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Collection Date</Label>
                  <Input
                    type="date"
                    value={form.collectedAt}
                    onChange={(e) => setField("collectedAt")(e.target.value)}
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label>Expiration / Review Date</Label>
                  <Input
                    type="date"
                    value={form.expiresAt}
                    onChange={(e) => setField("expiresAt")(e.target.value)}
                    className="mt-1"
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Notes & Summary</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label>Assessor Summary</Label>
                <Textarea
                  value={form.assessorSummary}
                  onChange={(e) => setField("assessorSummary")(e.target.value)}
                  placeholder="Summary for the assessor..."
                  rows={3}
                  className="mt-1"
                />
              </div>
              <div>
                <Label>Internal Notes</Label>
                <Textarea
                  value={form.internalNotes}
                  onChange={(e) => setField("internalNotes")(e.target.value)}
                  placeholder="Internal team notes..."
                  rows={3}
                  className="mt-1"
                />
              </div>
            </CardContent>
          </Card>

          {/* Audit Log */}
          {(auditLog as any[]).length > 0 && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Clock className="h-4 w-4" />
                  Audit History
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {(auditLog as any[]).map((log: any) => (
                    <div key={log.id} className="flex gap-3 text-sm">
                      <div className="w-1.5 h-1.5 rounded-full bg-primary mt-1.5 shrink-0" />
                      <div>
                        <span className="font-medium capitalize">{log.action?.replace(/_/g, " ")}</span>
                        {log.newValue && (
                          <span className="text-muted-foreground"> → {String(log.newValue).replace(/_/g, " ")}</span>
                        )}
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {formatDateTime(log.timestamp)}
                          {log.userEmail && ` · ${log.userEmail}`}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Right: metadata sidebar */}
        <div className="space-y-4">
          {/* File */}
          {ev.fileKey && (
            <>
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Paperclip className="h-4 w-4" />
                    Uploaded File
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex items-start gap-2">
                    <FileText className="h-5 w-5 text-muted-foreground shrink-0 mt-0.5" />
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{ev.fileName ?? "File"}</p>
                      {ev.fileSize && (
                        <p className="text-xs text-muted-foreground">
                          {(ev.fileSize / 1024).toFixed(0)} KB
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant={showPreview ? "secondary" : "outline"}
                      size="sm"
                      className="flex-1 gap-1.5"
                      onClick={() => setShowPreview((v) => !v)}
                    >
                      {showPreview ? (
                        <>
                          <EyeOff className="h-4 w-4" />
                          Hide Preview
                        </>
                      ) : (
                        <>
                          <Eye className="h-4 w-4" />
                          View File
                        </>
                      )}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex-1 gap-1.5"
                      onClick={() => downloadFile(id, ev.fileName ?? "evidence-file", activeOrg?.id)}
                    >
                      <Download className="h-4 w-4" />
                      Download File
                    </Button>
                  </div>
                </CardContent>
              </Card>

            </>
          )}

          {/* Linked Controls — interactive */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base flex items-center gap-2">
                  <Link2 className="h-4 w-4" />
                  Linked Controls
                </CardTitle>
                {!isAssessor && (
                  <Popover open={addLinkOpen} onOpenChange={setAddLinkOpen}>
                    <PopoverTrigger asChild>
                      <Button size="sm" variant="outline" className="h-7 gap-1 text-xs">
                        <Plus className="h-3 w-3" />
                        Add Link
                        <ChevronDown className="h-3 w-3" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="p-0 w-[22rem]" align="end">
                      <Command>
                        <CommandInput placeholder="Search controls…" />
                        <CommandList className="max-h-[260px]">
                          <CommandEmpty>No controls found.</CommandEmpty>
                          <CommandGroup>
                            {(allControls as any[])
                              .filter((c: any) => !(ev?.linkedControlIds ?? []).includes(c.id))
                              .map((c: any) => (
                                <CommandItem
                                  key={c.id}
                                  value={`${c.controlId} ${c.title ?? ""}`}
                                  onSelect={() => handleAddLink(c.id)}
                                  disabled={addingControl}
                                  className="gap-2 cursor-pointer"
                                >
                                  <span className="font-mono text-xs font-semibold text-primary">{c.controlId}</span>
                                  {c.title && (
                                    <span className="text-xs text-muted-foreground truncate flex-1">{c.title}</span>
                                  )}
                                </CommandItem>
                              ))}
                          </CommandGroup>
                        </CommandList>
                      </Command>
                    </PopoverContent>
                  </Popover>
                )}
              </div>
            </CardHeader>
            <CardContent>
              {(ev?.linkedControls ?? []).length > 0 ? (
                <div className="space-y-2">
                  {(ev.linkedControls as any[]).map((ctrl: any) => (
                    <div
                      key={ctrl.id}
                      className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm"
                    >
                      {ctrl.isPrimary && (
                        <Star className="h-3.5 w-3.5 fill-primary text-primary shrink-0" />
                      )}
                      <Link
                        href={`/controls/${ctrl.id}`}
                        className="font-mono font-semibold text-primary hover:underline shrink-0 text-xs"
                      >
                        {ctrl.label}
                      </Link>
                      {ctrl.title && (
                        <span className="text-xs text-muted-foreground truncate flex-1">{ctrl.title}</span>
                      )}
                      {ctrl.isPrimary && (
                        <Badge variant="outline" className="text-[10px] px-1.5 py-0 shrink-0">Primary</Badge>
                      )}
                      {!isAssessor && (
                        <div className="flex items-center gap-1 ml-auto shrink-0">
                          {!ctrl.isPrimary && (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-6 px-2 text-[10px] gap-1 text-muted-foreground hover:text-primary"
                              onClick={() => handleSetPrimary(ctrl.id)}
                              disabled={settingPrimaryId === ctrl.id}
                              title="Set as primary control"
                            >
                              <Star className="h-2.5 w-2.5" />
                              {settingPrimaryId === ctrl.id ? "…" : "Set Primary"}
                            </Button>
                          )}
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-6 w-6 p-0 text-muted-foreground hover:text-red-500"
                            onClick={() => handleRemoveLink(ctrl.id)}
                            disabled={removingControlId === ctrl.id}
                            title="Remove link"
                          >
                            {removingControlId === ctrl.id ? (
                              <span className="text-[10px]">…</span>
                            ) : (
                              <X className="h-3 w-3" />
                            )}
                          </Button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="space-y-2">
                  <p className="text-sm text-muted-foreground">No controls linked to this evidence.</p>
                  {!isAssessor && (
                    <p className="text-xs text-muted-foreground">Use the Add Link button above to link a CMMC control.</p>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Ownership & dates */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <User className="h-4 w-4" />
                Ownership
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div>
                <span className="text-muted-foreground block text-xs uppercase tracking-wide mb-0.5">Owner</span>
                <span>{ev.ownerName ?? "—"}</span>
              </div>
              <div>
                <span className="text-muted-foreground block text-xs uppercase tracking-wide mb-0.5">Uploaded</span>
                <span>{formatDate(ev.createdAt)}</span>
              </div>
              {ev.approvedAt && (
                <div>
                  <span className="text-muted-foreground block text-xs uppercase tracking-wide mb-0.5">Approved</span>
                  <span>{formatDate(ev.approvedAt)}</span>
                </div>
              )}
              {ev.expiresAt && (
                <div>
                  <span className="text-muted-foreground block text-xs uppercase tracking-wide mb-0.5 flex items-center gap-1">
                    <Calendar className="h-3 w-3" />
                    Expires
                  </span>
                  <span>{formatDate(ev.expiresAt)}</span>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Full-width file preview — shown below the grid when toggled */}
      {ev.fileKey && showPreview && (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2">
                <Eye className="h-4 w-4" />
                File Preview — {ev.fileName ?? "File"}
              </CardTitle>
              <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs" onClick={() => setShowPreview(false)}>
                <EyeOff className="h-3.5 w-3.5" /> Hide
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <EvidenceFileViewer
              evidenceId={id}
              fileName={ev.fileName ?? ""}
              orgId={activeOrg?.id}
              onDownload={() => downloadFile(id, ev.fileName ?? "evidence-file", activeOrg?.id)}
            />
          </CardContent>
        </Card>
      )}

      {/* Delete Confirmation Dialog */}
      <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Permanently Delete Evidence?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground py-2">
            This will permanently delete this evidence record, remove all control links, and delete
            the uploaded file. This cannot be undone.
          </p>
          <p className="text-sm text-muted-foreground">
            If you want to keep the audit trail, use <strong>Archive</strong> instead.
          </p>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setShowDeleteDialog(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDelete} disabled={isDeleting}>
              {isDeleting ? "Deleting..." : "Delete Permanently"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
