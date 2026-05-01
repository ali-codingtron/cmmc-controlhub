import { useState, useEffect, useCallback } from "react";
import type { EvidenceItem } from "@workspace/api-client-react";
import { useOrg } from "@/context/OrgContext";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { StatusBadge, LevelBadge } from "@/components/ui/badges";
import { useToast } from "@/hooks/use-toast";
import { Link } from "wouter";
import {
  Download,
  ExternalLink,
  FileText,
  File,
  Loader2,
  AlertCircle,
  Calendar,
  User,
  Tag,
  Shield,
} from "lucide-react";

// ─── File type helpers ────────────────────────────────────────────────────────

function getExtension(fileName: string | null | undefined): string {
  if (!fileName) return "";
  return (fileName.split(".").pop() ?? "").toLowerCase();
}

type PreviewKind = "pdf" | "image" | "text" | "unsupported" | "no-file";

function kindFromContentType(contentType: string): PreviewKind {
  if (contentType === "application/pdf") return "pdf";
  if (contentType.startsWith("image/")) return "image";
  if (contentType.startsWith("text/")) return "text";
  return "unsupported";
}

function kindFromExtension(ext: string): PreviewKind {
  if (ext === "pdf") return "pdf";
  if (["png", "jpg", "jpeg", "gif", "webp", "svg"].includes(ext)) return "image";
  if (["txt", "log", "md", "yaml", "yml", "json", "xml", "csv"].includes(ext)) return "text";
  return "unsupported";
}

function formatBytes(bytes: number | null | undefined): string {
  if (!bytes) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(d: string | Date | null | undefined): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

const EVIDENCE_TYPE_LABELS: Record<string, string> = {
  policy: "Policy",
  procedure: "Procedure",
  screenshot: "Screenshot",
  log: "Log",
  report: "Report",
  ticket: "Ticket",
  configuration_export: "Configuration Export",
  training_record: "Training Record",
  incident_record: "Incident Record",
  risk_record: "Risk Record",
  approval_record: "Approval Record",
  network_diagram: "Network Diagram",
  scan_report: "Vulnerability Scan",
  other: "Other",
};

// ─── Preview state ────────────────────────────────────────────────────────────

type PreviewState =
  | { status: "loading" }
  | { status: "ready"; kind: PreviewKind; url?: string; text?: string; contentType: string }
  | { status: "no-file" }
  | { status: "error"; message: string };

// ─── Sub-components ───────────────────────────────────────────────────────────

function PreviewPane({
  state,
  fileName,
}: {
  state: PreviewState;
  fileName: string | null | undefined;
}) {
  if (state.status === "loading") {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3 text-muted-foreground">
        <Loader2 className="h-8 w-8 animate-spin" />
        <p className="text-sm">Loading preview…</p>
      </div>
    );
  }

  if (state.status === "no-file") {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3 text-muted-foreground">
        <File className="h-12 w-12 opacity-30" />
        <p className="text-sm font-medium">No file attached</p>
        <p className="text-xs">This evidence item has no uploaded file.</p>
      </div>
    );
  }

  if (state.status === "error") {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3 text-muted-foreground">
        <AlertCircle className="h-10 w-10 text-destructive/60" />
        <p className="text-sm font-medium">Preview unavailable</p>
        <p className="text-xs">{state.message}</p>
      </div>
    );
  }

  const { kind, url, text } = state;

  if (kind === "pdf" && url) {
    return (
      <iframe
        src={url}
        title="PDF Preview"
        className="w-full h-full border-0 rounded-md bg-white"
      />
    );
  }

  if (kind === "image" && url) {
    return (
      <div className="flex items-center justify-center h-full p-4 bg-muted/30 rounded-md overflow-auto">
        <img
          src={url}
          alt={fileName ?? "Evidence file"}
          className="max-w-full max-h-full object-contain rounded shadow-sm"
        />
      </div>
    );
  }

  if (kind === "text" && text !== undefined) {
    return (
      <div className="h-full overflow-auto rounded-md bg-muted/30 p-4">
        <pre className="text-xs font-mono whitespace-pre-wrap break-all leading-relaxed">
          {text}
        </pre>
      </div>
    );
  }

  // Unsupported
  return (
    <div className="flex flex-col items-center justify-center h-full gap-4 text-muted-foreground p-8">
      <div className="rounded-full bg-muted p-5">
        <FileText className="h-10 w-10 opacity-50" />
      </div>
      <div className="text-center space-y-1">
        <p className="font-medium text-foreground">Preview not available</p>
        <p className="text-sm">
          {fileName
            ? `${fileName} cannot be displayed in the browser.`
            : "This file type cannot be displayed in the browser."}
        </p>
        <p className="text-sm">Download to view.</p>
      </div>
    </div>
  );
}

// ─── Main modal ───────────────────────────────────────────────────────────────

interface EvidencePreviewModalProps {
  item: EvidenceItem | null;
  onClose: () => void;
}

export function EvidencePreviewModal({ item, onClose }: EvidencePreviewModalProps) {
  const { activeOrg } = useOrg();
  const { toast } = useToast();
  const [previewState, setPreviewState] = useState<PreviewState>({ status: "loading" });
  const [blobUrl, setBlobUrl] = useState<string | null>(null);

  // Cleanup blob URL on unmount or item change
  useEffect(() => {
    return () => {
      if (blobUrl) URL.revokeObjectURL(blobUrl);
    };
  }, [blobUrl]);

  // Fetch file preview when item changes
  useEffect(() => {
    if (!item) return;

    // Reset state
    if (blobUrl) {
      URL.revokeObjectURL(blobUrl);
      setBlobUrl(null);
    }

    if (!item.fileName) {
      setPreviewState({ status: "no-file" });
      return;
    }

    setPreviewState({ status: "loading" });

    const token = localStorage.getItem("auth_token");
    const headers: Record<string, string> = {
      Authorization: `Bearer ${token ?? ""}`,
      ...(activeOrg?.id ? { "X-Organization-ID": activeOrg.id } : {}),
    };

    fetch(`/api/evidence/${item.id}/preview`, { headers })
      .then(async (res) => {
        if (!res.ok) {
          setPreviewState({ status: "error", message: `Server returned ${res.status}` });
          return;
        }

        const rawContentType = res.headers.get("Content-Type") ?? "";
        const contentType = rawContentType.split(";")[0].trim();
        const kind = kindFromContentType(contentType) !== "unsupported"
          ? kindFromContentType(contentType)
          : kindFromExtension(getExtension(item.fileName));

        if (kind === "pdf" || kind === "image") {
          const blob = await res.blob();
          const url = URL.createObjectURL(blob);
          setBlobUrl(url);
          setPreviewState({ status: "ready", kind, url, contentType });
        } else if (kind === "text") {
          const text = await res.text();
          setPreviewState({ status: "ready", kind, text, contentType });
        } else {
          setPreviewState({ status: "ready", kind: "unsupported", contentType });
        }
      })
      .catch((err) => {
        setPreviewState({ status: "error", message: err?.message ?? "Failed to load file" });
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item?.id, activeOrg?.id]);

  const handleDownload = useCallback(async () => {
    if (!item?.fileName) return;
    const token = localStorage.getItem("auth_token");
    const headers: Record<string, string> = {
      Authorization: `Bearer ${token ?? ""}`,
      ...(activeOrg?.id ? { "X-Organization-ID": activeOrg.id } : {}),
    };
    try {
      const res = await fetch(`/api/evidence/${item.id}/download`, { headers });
      if (!res.ok) throw new Error("Download failed");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = item.fileName;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      toast({ title: "Download failed", description: "Could not download the file.", variant: "destructive" });
    }
  }, [item, activeOrg?.id, toast]);

  if (!item) return null;

  const ext = getExtension(item.fileName);

  return (
    <Dialog open={!!item} onOpenChange={onClose}>
      <DialogContent className="max-w-5xl w-[90vw] h-[88vh] p-0 gap-0 flex flex-col overflow-hidden">
        {/* Header */}
        <DialogHeader className="px-5 py-4 border-b shrink-0">
          <div className="flex items-start justify-between gap-4 pr-6">
            <div className="min-w-0">
              <DialogTitle className="text-base font-semibold leading-tight truncate">
                {item.title}
              </DialogTitle>
              {item.fileName && (
                <p className="text-xs text-muted-foreground mt-0.5 font-mono truncate">
                  {item.fileName}
                  {item.fileSize ? ` · ${formatBytes(item.fileSize)}` : ""}
                  {ext ? ` · .${ext.toUpperCase()}` : ""}
                </p>
              )}
            </div>
            <div className="flex gap-2 shrink-0">
              {item.fileName && (
                <Button variant="outline" size="sm" onClick={handleDownload} className="gap-1.5">
                  <Download className="h-3.5 w-3.5" />
                  Download
                </Button>
              )}
              <Button variant="ghost" size="sm" asChild className="gap-1.5">
                <Link href={`/evidence/${item.id}`} onClick={onClose}>
                  <ExternalLink className="h-3.5 w-3.5" />
                  Edit
                </Link>
              </Button>
            </div>
          </div>
        </DialogHeader>

        {/* Body: preview (left) + metadata (right) */}
        <div className="flex flex-1 overflow-hidden min-h-0">
          {/* Preview pane */}
          <div className="flex-1 min-w-0 p-4 overflow-hidden">
            <PreviewPane state={previewState} fileName={item.fileName} />
          </div>

          {/* Metadata sidebar */}
          <div className="w-64 shrink-0 border-l overflow-y-auto p-4 space-y-4 bg-muted/10">
            {/* Status + Type */}
            <div className="space-y-2">
              <div className="flex flex-wrap gap-1.5">
                <StatusBadge status={item.status} />
                <Badge variant="secondary" className="text-xs">
                  {EVIDENCE_TYPE_LABELS[item.evidenceType] ?? item.evidenceType}
                </Badge>
              </div>
            </div>

            <Separator />

            {/* Owner */}
            <div className="space-y-1">
              <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground flex items-center gap-1">
                <User className="h-3 w-3" /> Owner
              </p>
              <p className="text-sm">{item.ownerName ?? "—"}</p>
            </div>

            {/* Dates */}
            <div className="space-y-2">
              <div className="space-y-1">
                <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground flex items-center gap-1">
                  <Calendar className="h-3 w-3" /> Uploaded
                </p>
                <p className="text-sm">{formatDate(item.createdAt)}</p>
              </div>
              {item.expiresAt && (
                <div className="space-y-1">
                  <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                    Expires
                  </p>
                  <p
                    className={`text-sm ${
                      new Date(item.expiresAt) < new Date()
                        ? "text-red-500 font-medium"
                        : ""
                    }`}
                  >
                    {formatDate(item.expiresAt)}
                  </p>
                </div>
              )}
            </div>

            {/* Linked Controls */}
            {(item.linkedControls ?? []).length > 0 && (
              <>
                <Separator />
                <div className="space-y-1.5">
                  <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground flex items-center gap-1">
                    <Shield className="h-3 w-3" /> Linked Controls
                  </p>
                  <div className="flex flex-wrap gap-1">
                    {(item.linkedControls ?? []).map((c) => (
                      <Badge
                        key={c.id}
                        variant="outline"
                        className="text-[10px] font-mono px-1.5 py-0"
                      >
                        {c.label}
                      </Badge>
                    ))}
                  </div>
                </div>
              </>
            )}

            {/* Security Domain */}
            {(item.domains ?? []).length > 0 && (
              <div className="space-y-1.5">
                <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                  Security Domain
                </p>
                <div className="flex flex-wrap gap-1">
                  {(item.domains ?? []).map((d) => (
                    <Badge
                      key={d.code}
                      variant="secondary"
                      className="text-[10px] font-mono px-1.5 py-0"
                    >
                      {d.code}
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            {/* CMMC Levels */}
            {(item.cmmcLevels ?? []).length > 0 && (
              <div className="space-y-1.5">
                <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                  CMMC Level
                </p>
                <div className="flex flex-wrap gap-1">
                  {[...new Set(item.cmmcLevels ?? [])].map((lvl) => (
                    <LevelBadge key={lvl} level={lvl} />
                  ))}
                </div>
              </div>
            )}

            {/* Tags */}
            {(item.tags ?? []).length > 0 && (
              <>
                <Separator />
                <div className="space-y-1.5">
                  <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground flex items-center gap-1">
                    <Tag className="h-3 w-3" /> Tags
                  </p>
                  <div className="flex flex-wrap gap-1">
                    {(item.tags ?? []).map((tag) => (
                      <Badge
                        key={tag}
                        variant="secondary"
                        className="text-[10px] font-normal px-1.5 py-0"
                      >
                        {tag}
                      </Badge>
                    ))}
                  </div>
                </div>
              </>
            )}

            {/* Assessor summary */}
            {item.assessorSummary && (
              <>
                <Separator />
                <div className="space-y-1">
                  <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                    Assessor Summary
                  </p>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    {item.assessorSummary}
                  </p>
                </div>
              </>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
