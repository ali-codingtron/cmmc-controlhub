import {
  useState,
  useEffect,
  useRef,
  useCallback,
  type WheelEvent,
  type MouseEvent as ReactMouseEvent,
} from "react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  ZoomIn, ZoomOut, RotateCcw, Maximize2, Minimize2,
  Download, Loader2, AlertCircle, FileX, FileText,
  ChevronLeft, ChevronRight,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

type PreviewKind = "image" | "pdf" | "text" | "docx" | "xlsx" | "unsupported";

type PreviewState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ready"; kind: "image" | "pdf"; blobUrl: string }
  | { status: "ready"; kind: "text"; text: string; truncated: boolean }
  | { status: "ready"; kind: "docx"; html: string }
  | { status: "ready"; kind: "xlsx"; sheets: { name: string; data: (string | number)[][]; totalRows: number }[] }
  | { status: "unsupported" }
  | { status: "error"; message: string };

// ─── Helpers ──────────────────────────────────────────────────────────────────

function detectKindFromFilename(fileName: string): PreviewKind {
  const ext = (fileName.split(".").pop() ?? "").toLowerCase();
  if (["png", "jpg", "jpeg", "gif", "webp", "svg", "bmp"].includes(ext)) return "image";
  if (ext === "pdf") return "pdf";
  if (["txt", "log", "md", "yaml", "yml", "json", "xml", "csv"].includes(ext)) return "text";
  if (ext === "docx") return "docx";
  if (ext === "xlsx") return "xlsx";
  return "unsupported";
}

function detectKindFromContentType(ct: string): PreviewKind | null {
  const base = ct.split(";")[0].trim().toLowerCase();
  if (base.startsWith("image/")) return "image";
  if (base === "application/pdf") return "pdf";
  if (base.startsWith("text/")) return "text";
  if (base.includes("wordprocessingml")) return "docx";
  if (base.includes("spreadsheetml")) return "xlsx";
  return null;
}

function authFetchHeaders(orgId?: string | null): Record<string, string> {
  const token = localStorage.getItem("auth_token");
  return {
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(orgId ? { "X-Organization-ID": orgId } : {}),
  };
}

// ─── Zoom/Pan state hook ──────────────────────────────────────────────────────

function useZoomPan() {
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const dragging = useRef(false);
  const dragStart = useRef({ mx: 0, my: 0, px: 0, py: 0 });

  const applyZoom = useCallback((delta: number, currentZoom: number) => {
    const next = Math.min(8, Math.max(0.2, currentZoom + delta));
    if (next === 1) setPan({ x: 0, y: 0 });
    return next;
  }, []);

  const onWheel = useCallback((e: WheelEvent) => {
    e.preventDefault();
    setZoom(z => applyZoom(e.deltaY < 0 ? 0.15 : -0.15, z));
  }, [applyZoom]);

  const onMouseDown = useCallback((e: ReactMouseEvent) => {
    if (e.button !== 0) return;
    dragging.current = true;
    dragStart.current = { mx: e.clientX, my: e.clientY, px: pan.x, py: pan.y };
    e.preventDefault();
  }, [pan]);

  const onMouseMove = useCallback((e: ReactMouseEvent) => {
    if (!dragging.current) return;
    const dx = e.clientX - dragStart.current.mx;
    const dy = e.clientY - dragStart.current.my;
    setPan({ x: dragStart.current.px + dx, y: dragStart.current.py + dy });
  }, []);

  const onMouseUp = useCallback(() => { dragging.current = false; }, []);

  const reset = useCallback(() => { setZoom(1); setPan({ x: 0, y: 0 }); }, []);
  const zoomIn = useCallback(() => setZoom(z => applyZoom(0.25, z)), [applyZoom]);
  const zoomOut = useCallback(() => setZoom(z => applyZoom(-0.25, z)), [applyZoom]);

  return { zoom, pan, onWheel, onMouseDown, onMouseMove, onMouseUp, reset, zoomIn, zoomOut };
}

// ─── Zoom Controls bar ────────────────────────────────────────────────────────

function ZoomControls({
  zoom, onZoomIn, onZoomOut, onReset, onFullscreen,
  isFullscreen = false,
}: {
  zoom: number; onZoomIn(): void; onZoomOut(): void; onReset(): void;
  onFullscreen?(): void; isFullscreen?: boolean;
}) {
  return (
    <div className="flex items-center gap-1 bg-background/90 backdrop-blur border rounded-md px-1.5 py-1 shadow-sm">
      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onZoomOut} title="Zoom out">
        <ZoomOut className="h-3.5 w-3.5" />
      </Button>
      <span className="text-xs font-mono w-12 text-center tabular-nums">{Math.round(zoom * 100)}%</span>
      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onZoomIn} title="Zoom in">
        <ZoomIn className="h-3.5 w-3.5" />
      </Button>
      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onReset} title="Reset zoom">
        <RotateCcw className="h-3 w-3" />
      </Button>
      {onFullscreen && (
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onFullscreen} title={isFullscreen ? "Exit fullscreen" : "Fullscreen"}>
          {isFullscreen ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
        </Button>
      )}
    </div>
  );
}

// ─── Image Viewer ─────────────────────────────────────────────────────────────

function ImageViewer({ url, fileName, compact = false }: { url: string; fileName: string; compact?: boolean }) {
  const zp = useZoomPan();
  const [fullscreen, setFullscreen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const imgStyle = {
    transform: `scale(${zp.zoom}) translate(${zp.pan.x / zp.zoom}px, ${zp.pan.y / zp.zoom}px)`,
    transformOrigin: "center center",
    cursor: zp.zoom > 1 ? "grab" : "default",
    maxWidth: "100%",
    maxHeight: compact ? "360px" : "100%",
    userSelect: "none" as const,
  };

  const ImageContent = ({ height }: { height: string }) => (
    <div
      ref={containerRef}
      className="relative flex items-center justify-center bg-muted/30 overflow-hidden rounded-md border"
      style={{ height }}
      onMouseMove={zp.onMouseMove}
      onMouseUp={zp.onMouseUp}
      onMouseLeave={zp.onMouseUp}
    >
      <img
        src={url}
        alt={fileName}
        draggable={false}
        onMouseDown={zp.onMouseDown}
        onWheel={zp.onWheel as any}
        style={imgStyle}
        className="select-none"
      />
    </div>
  );

  return (
    <>
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <ZoomControls
              zoom={zp.zoom}
              onZoomIn={zp.zoomIn}
              onZoomOut={zp.zoomOut}
              onReset={zp.reset}
              onFullscreen={() => setFullscreen(true)}
            />
          </div>
          <p className="text-xs text-muted-foreground">Scroll to zoom · Drag to pan</p>
        </div>
        <ImageContent height={compact ? "360px" : "480px"} />
      </div>

      <Dialog open={fullscreen} onOpenChange={setFullscreen}>
        <DialogContent className="max-w-[95vw] w-[95vw] h-[95vh] flex flex-col p-0 gap-0">
          <DialogTitle className="sr-only">{fileName}</DialogTitle>
          <div className="flex items-center justify-between px-4 py-2.5 border-b bg-background/95">
            <div className="flex items-center gap-2">
              <ZoomControls
                zoom={zp.zoom}
                onZoomIn={zp.zoomIn}
                onZoomOut={zp.zoomOut}
                onReset={zp.reset}
                onFullscreen={() => setFullscreen(false)}
                isFullscreen
              />
            </div>
            <span className="text-sm text-muted-foreground truncate max-w-xs">{fileName}</span>
          </div>
          <div
            className="flex-1 relative flex items-center justify-center bg-muted/20 overflow-hidden"
            onMouseMove={zp.onMouseMove}
            onMouseUp={zp.onMouseUp}
            onMouseLeave={zp.onMouseUp}
          >
            <img
              src={url}
              alt={fileName}
              draggable={false}
              onMouseDown={zp.onMouseDown}
              onWheel={zp.onWheel as any}
              style={{ ...imgStyle, maxHeight: "calc(95vh - 60px)", maxWidth: "calc(95vw - 40px)" }}
              className="select-none"
            />
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ─── PDF Viewer ───────────────────────────────────────────────────────────────

function PdfViewer({ url, fileName }: { url: string; fileName: string }) {
  const [fullscreen, setFullscreen] = useState(false);

  return (
    <>
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Button variant="outline" size="sm" className="h-8 gap-1.5" onClick={() => setFullscreen(true)}>
            <Maximize2 className="h-3.5 w-3.5" /> Fullscreen
          </Button>
          <span className="text-xs text-muted-foreground">Use browser controls to zoom and navigate pages</span>
        </div>
        <div className="rounded-md border overflow-hidden bg-white">
          <iframe src={url} title={fileName} className="w-full border-0" style={{ height: "520px" }} />
        </div>
      </div>

      <Dialog open={fullscreen} onOpenChange={setFullscreen}>
        <DialogContent className="max-w-[95vw] w-[95vw] h-[95vh] flex flex-col p-0 gap-0">
          <DialogTitle className="sr-only">{fileName}</DialogTitle>
          <div className="flex items-center justify-between px-4 py-2 border-b bg-background">
            <span className="text-sm font-medium">{fileName}</span>
            <Button variant="ghost" size="sm" className="h-8 gap-1" onClick={() => setFullscreen(false)}>
              <Minimize2 className="h-3.5 w-3.5" /> Exit
            </Button>
          </div>
          <iframe src={url} title={fileName} className="flex-1 w-full border-0" />
        </DialogContent>
      </Dialog>
    </>
  );
}

// ─── Text Viewer ──────────────────────────────────────────────────────────────

function TextViewer({ text, fileName, truncated }: { text: string; fileName: string; truncated: boolean }) {
  const [fullscreen, setFullscreen] = useState(false);

  const TextContent = ({ maxH }: { maxH: string }) => (
    <div className={`rounded-md border bg-zinc-950 text-zinc-100 overflow-auto font-mono text-xs leading-relaxed`} style={{ maxHeight: maxH }}>
      <pre className="p-4 whitespace-pre-wrap break-all">{text}</pre>
      {truncated && (
        <div className="sticky bottom-0 bg-zinc-900/90 text-yellow-400 text-xs px-4 py-2 border-t border-zinc-700">
          ⚠ Preview truncated to first 200 KB
        </div>
      )}
    </div>
  );

  return (
    <>
      <div className="space-y-2">
        <div className="flex justify-end">
          <Button variant="outline" size="sm" className="h-8 gap-1.5" onClick={() => setFullscreen(true)}>
            <Maximize2 className="h-3.5 w-3.5" /> Fullscreen
          </Button>
        </div>
        <TextContent maxH="480px" />
      </div>

      <Dialog open={fullscreen} onOpenChange={setFullscreen}>
        <DialogContent className="max-w-[95vw] w-[95vw] h-[95vh] flex flex-col p-0 gap-0">
          <DialogTitle className="sr-only">{fileName}</DialogTitle>
          <div className="flex items-center justify-between px-4 py-2 border-b bg-background">
            <span className="text-sm font-medium font-mono">{fileName}</span>
            <Button variant="ghost" size="sm" className="h-8 gap-1" onClick={() => setFullscreen(false)}>
              <Minimize2 className="h-3.5 w-3.5" /> Exit
            </Button>
          </div>
          <div className="flex-1 overflow-auto bg-zinc-950">
            <pre className="p-6 text-zinc-100 font-mono text-xs leading-relaxed whitespace-pre-wrap break-all">{text}</pre>
            {truncated && (
              <div className="text-yellow-400 text-xs px-6 py-3 border-t border-zinc-700">
                ⚠ Preview truncated to first 200 KB
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ─── DOCX Viewer ──────────────────────────────────────────────────────────────

function DocxViewer({ html, fileName }: { html: string; fileName: string }) {
  const [fullscreen, setFullscreen] = useState(false);

  const DocxContent = ({ className }: { className?: string }) => (
    <div
      className={`prose prose-sm max-w-none overflow-auto rounded-md border bg-white p-6 ${className ?? ""}`}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );

  if (!html.trim()) {
    return (
      <div className="py-6 text-center text-sm text-muted-foreground">
        <FileText className="h-8 w-8 mx-auto mb-2 text-muted-foreground/50" />
        Document appears to be empty or has no extractable text.
      </div>
    );
  }

  return (
    <>
      <div className="space-y-2">
        <div className="flex justify-end">
          <Button variant="outline" size="sm" className="h-8 gap-1.5" onClick={() => setFullscreen(true)}>
            <Maximize2 className="h-3.5 w-3.5" /> Fullscreen
          </Button>
        </div>
        <DocxContent className="max-h-[540px]" />
      </div>

      <Dialog open={fullscreen} onOpenChange={setFullscreen}>
        <DialogContent className="max-w-[95vw] w-[95vw] h-[95vh] flex flex-col p-0 gap-0">
          <DialogTitle className="sr-only">{fileName}</DialogTitle>
          <div className="flex items-center justify-between px-4 py-2 border-b bg-background">
            <span className="text-sm font-medium">{fileName}</span>
            <Button variant="ghost" size="sm" className="h-8 gap-1" onClick={() => setFullscreen(false)}>
              <Minimize2 className="h-3.5 w-3.5" /> Exit
            </Button>
          </div>
          <div className="flex-1 overflow-auto p-8 bg-white">
            <div
              className="prose max-w-4xl mx-auto"
              dangerouslySetInnerHTML={{ __html: html }}
            />
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ─── XLSX Viewer ──────────────────────────────────────────────────────────────

function XlsxViewer({
  sheets, fileName,
}: {
  sheets: { name: string; data: (string | number)[][]; totalRows: number }[];
  fileName: string;
}) {
  const [activeSheet, setActiveSheet] = useState(0);
  const [fullscreen, setFullscreen] = useState(false);

  const sheet = sheets[activeSheet];
  if (!sheet) return <div className="py-4 text-sm text-muted-foreground">No sheet data available.</div>;

  const headers = sheet.data[0] ?? [];
  const rows = sheet.data.slice(1);

  const SheetTabs = () => (
    sheets.length > 1 ? (
      <div className="flex gap-1 border-b pb-1 mb-3 overflow-x-auto flex-shrink-0">
        {sheets.map((s, i) => (
          <button
            key={s.name}
            onClick={() => setActiveSheet(i)}
            className={`px-3 py-1.5 text-xs rounded-t font-medium whitespace-nowrap transition-colors ${
              i === activeSheet
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground hover:bg-muted/80"
            }`}
          >
            {s.name}
          </button>
        ))}
      </div>
    ) : null
  );

  const TableContent = ({ maxH }: { maxH: string }) => (
    <div className="overflow-auto rounded border" style={{ maxHeight: maxH }}>
      <table className="min-w-full text-xs border-collapse">
        <thead className="sticky top-0 z-10">
          <tr>
            <th className="bg-zinc-100 border border-zinc-200 px-2 py-1.5 text-center text-zinc-400 font-normal w-8">#</th>
            {headers.map((h, ci) => (
              <th key={ci} className="bg-zinc-100 border border-zinc-200 px-3 py-1.5 text-left font-semibold text-zinc-700 whitespace-nowrap">
                {String(h)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, ri) => (
            <tr key={ri} className={ri % 2 === 0 ? "bg-white" : "bg-zinc-50/60"}>
              <td className="border border-zinc-200 px-2 py-1 text-center text-zinc-400 font-mono">{ri + 2}</td>
              {headers.map((_, ci) => (
                <td key={ci} className="border border-zinc-200 px-3 py-1 text-zinc-800 whitespace-nowrap max-w-[240px] truncate">
                  {row[ci] !== undefined ? String(row[ci]) : ""}
                </td>
              ))}
            </tr>
          ))}
          {rows.length === 0 && (
            <tr>
              <td colSpan={headers.length + 1} className="px-4 py-6 text-center text-muted-foreground">
                No data rows
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );

  return (
    <>
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {sheet.totalRows > sheet.data.length && (
              <Badge variant="secondary" className="text-xs">
                Showing {sheet.data.length} of {sheet.totalRows} rows
              </Badge>
            )}
          </div>
          <Button variant="outline" size="sm" className="h-8 gap-1.5" onClick={() => setFullscreen(true)}>
            <Maximize2 className="h-3.5 w-3.5" /> Fullscreen
          </Button>
        </div>
        <SheetTabs />
        <TableContent maxH="480px" />
      </div>

      <Dialog open={fullscreen} onOpenChange={setFullscreen}>
        <DialogContent className="max-w-[98vw] w-[98vw] h-[96vh] flex flex-col p-0 gap-0">
          <DialogTitle className="sr-only">{fileName}</DialogTitle>
          <div className="flex items-center justify-between px-4 py-2 border-b bg-background">
            <span className="text-sm font-medium">{fileName}</span>
            <div className="flex items-center gap-2">
              {sheet.totalRows > sheet.data.length && (
                <span className="text-xs text-muted-foreground">Showing {sheet.data.length} of {sheet.totalRows} rows</span>
              )}
              <Button variant="ghost" size="sm" className="h-8 gap-1" onClick={() => setFullscreen(false)}>
                <Minimize2 className="h-3.5 w-3.5" /> Exit
              </Button>
            </div>
          </div>
          <div className="flex-1 overflow-hidden flex flex-col p-4 gap-3">
            <SheetTabs />
            <TableContent maxH="calc(96vh - 100px)" />
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ─── Main EvidenceFileViewer component ────────────────────────────────────────

export interface EvidenceFileViewerProps {
  evidenceId: string;
  fileName: string;
  orgId?: string | null;
  onDownload?(): void;
}

export function EvidenceFileViewer({
  evidenceId,
  fileName,
  orgId,
  onDownload,
}: EvidenceFileViewerProps) {
  const [state, setState] = useState<PreviewState>({ status: "loading" });
  const blobUrl = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    // Revoke any previous blob URL
    if (blobUrl.current) {
      URL.revokeObjectURL(blobUrl.current);
      blobUrl.current = null;
    }
    setState({ status: "loading" });

    const headers = authFetchHeaders(orgId);
    const kind = detectKindFromFilename(fileName);

    async function load() {
      try {
        if (kind === "docx" || kind === "xlsx") {
          const res = await fetch(`/api/evidence/${evidenceId}/convert`, { headers });
          if (!res.ok) throw new Error(`Server error ${res.status}`);
          const data = await res.json();
          if (cancelled) return;
          if (data.type === "docx") {
            setState({ status: "ready", kind: "docx", html: data.html ?? "" });
          } else if (data.type === "xlsx") {
            setState({ status: "ready", kind: "xlsx", sheets: data.sheets ?? [] });
          } else if (data.type === "too_large") {
            setState({ status: "error", message: `File too large to preview (${Math.round(data.size / 1024 / 1024)} MB). Please download.` });
          } else {
            setState({ status: "unsupported" });
          }
          return;
        }

        // For image/pdf/text — fetch the preview stream
        const res = await fetch(`/api/evidence/${evidenceId}/preview`, { headers });
        if (!res.ok) {
          if (cancelled) return;
          setState({ status: "error", message: `Server error ${res.status}` });
          return;
        }

        const rawCt = res.headers.get("Content-Type") ?? "";
        const resolvedKind = detectKindFromContentType(rawCt) ?? kind;

        if (resolvedKind === "image" || resolvedKind === "pdf") {
          const blob = await res.blob();
          if (cancelled) return;
          const url = URL.createObjectURL(blob);
          blobUrl.current = url;
          setState({ status: "ready", kind: resolvedKind, blobUrl: url });
        } else if (resolvedKind === "text") {
          const text = await res.text();
          if (cancelled) return;
          const truncated = text.length > 204_800;
          setState({ status: "ready", kind: "text", text: text.slice(0, 204_800), truncated });
        } else {
          if (cancelled) return;
          setState({ status: "unsupported" });
        }
      } catch (err: any) {
        if (cancelled) return;
        setState({ status: "error", message: err?.message ?? "Failed to load preview" });
      }
    }

    load();

    return () => {
      cancelled = true;
    };
  }, [evidenceId, orgId, fileName]);

  // Cleanup blob URL on unmount
  useEffect(() => {
    return () => {
      if (blobUrl.current) URL.revokeObjectURL(blobUrl.current);
    };
  }, []);

  if (state.status === "loading") {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-14 text-muted-foreground">
        <Loader2 className="h-7 w-7 animate-spin" />
        <span className="text-sm">Loading preview…</span>
      </div>
    );
  }

  if (state.status === "error") {
    return (
      <div className="flex flex-col items-center gap-3 py-10 text-center">
        <AlertCircle className="h-8 w-8 text-destructive/60" />
        <div>
          <p className="text-sm font-medium">Preview unavailable</p>
          <p className="text-xs text-muted-foreground mt-0.5">{state.message}</p>
        </div>
        {onDownload && (
          <Button variant="outline" size="sm" className="gap-1.5 mt-1" onClick={onDownload}>
            <Download className="h-4 w-4" /> Download to view
          </Button>
        )}
      </div>
    );
  }

  if (state.status === "unsupported") {
    return (
      <div className="flex flex-col items-center gap-3 py-10 text-center">
        <FileX className="h-8 w-8 text-muted-foreground/50" />
        <div>
          <p className="text-sm font-medium text-muted-foreground">Preview not available for this file type</p>
          <p className="text-xs text-muted-foreground mt-0.5">{fileName}</p>
        </div>
        {onDownload && (
          <Button variant="outline" size="sm" className="gap-1.5 mt-1" onClick={onDownload}>
            <Download className="h-4 w-4" /> Download file
          </Button>
        )}
      </div>
    );
  }

  if (state.status === "ready") {
    if (state.kind === "image") {
      return <ImageViewer url={state.blobUrl} fileName={fileName} />;
    }
    if (state.kind === "pdf") {
      return <PdfViewer url={state.blobUrl} fileName={fileName} />;
    }
    if (state.kind === "text") {
      return <TextViewer text={state.text} fileName={fileName} truncated={state.truncated} />;
    }
    if (state.kind === "docx") {
      return <DocxViewer html={state.html} fileName={fileName} />;
    }
    if (state.kind === "xlsx") {
      return <XlsxViewer sheets={state.sheets} fileName={fileName} />;
    }
  }

  return null;
}
