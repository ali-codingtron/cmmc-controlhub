import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useOrg } from "@/context/OrgContext";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Link } from "wouter";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Edit2,
  Save,
  X,
  Loader2,
  ShieldCheck,
  Upload,
  Search,
  Filter,
} from "lucide-react";

interface SspDocument {
  id: string;
  title: string;
  documentNumber: string | null;
  extractedAt: string | null;
}

interface SspMapping {
  id: string;
  controlRef: string;
  controlDbId: string | null;
  implementationNarrative: string;
  policyReference: string | null;
  sourceSection: string | null;
  isEdited: boolean;
  controlStatus: string | null;
  hasNarrative: boolean;
  hasEvidence: boolean;
}

const STATUS_OPTS = [
  { value: "not_started", label: "Not Started" },
  { value: "in_progress", label: "In Progress" },
  { value: "implemented", label: "Implemented" },
  { value: "needs_review", label: "Needs Review" },
  { value: "assessor_ready", label: "Assessor Ready" },
  { value: "not_applicable", label: "N/A" },
  { value: "at_risk", label: "At Risk" },
];

const STATUS_COLORS: Record<string, string> = {
  not_started: "bg-gray-100 text-gray-600",
  in_progress: "bg-blue-100 text-blue-700",
  implemented: "bg-green-100 text-green-700",
  needs_review: "bg-yellow-100 text-yellow-700",
  assessor_ready: "bg-purple-100 text-purple-700",
  not_applicable: "bg-gray-100 text-gray-400",
  at_risk: "bg-red-100 text-red-700",
};

function apiHeaders(orgId?: string) {
  const token = localStorage.getItem("auth_token");
  return {
    Authorization: `Bearer ${token}`,
    ...(orgId ? { "X-Organization-ID": orgId } : {}),
  };
}

export default function SspMappings() {
  const { activeOrg } = useOrg();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [editing, setEditing] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ narrative: "" });

  const { data: primary, isLoading: loadingPrimary } = useQuery<SspDocument | null>({
    queryKey: ["ssp-primary", activeOrg?.id],
    queryFn: async () => {
      const r = await fetch("/api/ssp/primary", { headers: apiHeaders(activeOrg?.id) });
      if (!r.ok) return null;
      return r.json();
    },
    enabled: !!activeOrg?.id,
  });

  const { data: allMappings = [], isLoading: loadingMappings } = useQuery<SspMapping[]>({
    queryKey: ["ssp-mappings", primary?.id],
    queryFn: async () => {
      const r = await fetch(`/api/ssp/${primary!.id}/control-mappings`, {
        headers: apiHeaders(activeOrg?.id),
      });
      if (!r.ok) return [];
      return r.json();
    },
    enabled: !!primary?.id,
  });

  const updateMutation = useMutation({
    mutationFn: async ({ mappingId, data }: { mappingId: string; data: Record<string, string> }) => {
      const r = await fetch(`/api/ssp/${primary!.id}/control-mappings/${mappingId}`, {
        method: "PATCH",
        headers: { ...apiHeaders(activeOrg?.id), "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!r.ok) throw new Error("Failed");
      return r.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["ssp-mappings", primary?.id] });
      setEditing(null);
      toast({ title: "Mapping saved" });
    },
    onError: () => toast({ title: "Save failed", variant: "destructive" }),
  });

  const filtered = allMappings.filter((m) => {
    const q = search.toLowerCase();
    const matchSearch =
      !search ||
      m.controlRef.toLowerCase().includes(q) ||
      m.implementationNarrative.toLowerCase().includes(q);
    const matchStatus = statusFilter === "all" || m.controlStatus === statusFilter;
    return matchSearch && matchStatus;
  });

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
        <h1 className="text-2xl font-bold">SSP Control Mapping</h1>
        <Card>
          <CardContent className="flex flex-col items-center py-20 text-center">
            <ShieldCheck className="h-12 w-12 text-muted-foreground/25 mb-4" />
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

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">SSP Control Mapping</h1>
          <p className="text-muted-foreground text-sm mt-1">
            {primary.title}
            {primary.documentNumber && ` · #${primary.documentNumber}`}
            {" · "}{allMappings.length} mappings
          </p>
        </div>
      </div>

      {/* ── Filters ── */}
      <div className="flex gap-2 flex-wrap">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            className="pl-8 h-8 text-sm"
            placeholder="Search control ID or narrative…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-36 h-8 text-sm">
            <Filter className="h-3 w-3 mr-1 text-muted-foreground" />
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            {STATUS_OPTS.map((s) => (
              <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {loadingMappings ? (
        <div className="space-y-2">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="h-14 animate-pulse bg-muted rounded-lg" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center py-14 text-center">
            <ShieldCheck className="h-10 w-10 text-muted-foreground/25 mb-3" />
            <p className="font-medium text-muted-foreground">
              {allMappings.length === 0
                ? "No control mappings extracted yet — parse the document first"
                : "No mappings match the current filters"}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 border-b">
              <tr>
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground w-36">Control</th>
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground">Narrative</th>
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground">Evidence</th>
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground">Implementation Narrative</th>
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground w-32">Status</th>
                <th className="px-4 py-2.5 w-20" />
              </tr>
            </thead>
            <tbody>
              {filtered.map((mapping, i) => (
                <tr key={mapping.id} className={`border-t ${i % 2 === 0 ? "" : "bg-muted/20"}`}>
                  {editing === mapping.id ? (
                    <td colSpan={6} className="px-4 py-3">
                      <div className="space-y-3">
                        <div className="flex items-center gap-2">
                          <code className="text-xs font-mono bg-muted px-2 py-1 rounded">{mapping.controlRef}</code>
                          {mapping.isEdited && <Badge variant="outline" className="text-[10px]">Edited</Badge>}
                        </div>
                        <div>
                          <label className="text-xs font-medium mb-1 block">Implementation Narrative</label>
                          <Textarea
                            value={editForm.narrative}
                            onChange={(e) => setEditForm((p) => ({ ...p, narrative: e.target.value }))}
                            rows={5}
                            className="text-sm"
                          />
                        </div>
                        <p className="text-xs text-muted-foreground">
                          Status is sourced from the Controls Library and updates automatically.
                        </p>
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            onClick={() =>
                              updateMutation.mutate({
                                mappingId: mapping.id,
                                data: {
                                  implementationNarrative: editForm.narrative,
                                },
                              })
                            }
                            disabled={updateMutation.isPending}
                          >
                            {updateMutation.isPending ? (
                              <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
                            ) : (
                              <Save className="h-3.5 w-3.5 mr-1" />
                            )}
                            Save
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => setEditing(null)}>
                            <X className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </div>
                    </td>
                  ) : (
                    <>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5">
                          <code className="text-xs font-mono bg-muted px-1.5 py-0.5 rounded">{mapping.controlRef}</code>
                          {mapping.isEdited && (
                            <span className="text-[10px] text-muted-foreground" title="Manually edited">✎</span>
                          )}
                        </div>
                        {mapping.controlDbId && (
                          <Link href={`/controls/${mapping.controlDbId}`}>
                            <span className="text-[10px] text-primary hover:underline">View control →</span>
                          </Link>
                        )}
                      </td>
                      <td className="px-4 py-3 text-center">
                        {mapping.hasNarrative ? (
                          <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-blue-50 text-blue-700">✓</span>
                        ) : (
                          <span className="text-[11px] text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-center">
                        {mapping.hasEvidence ? (
                          <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-green-50 text-green-700">✓</span>
                        ) : (
                          <span className="text-[11px] text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 max-w-sm">
                        <p className="text-xs text-muted-foreground line-clamp-3">
                          {mapping.implementationNarrative || <span className="italic">No narrative</span>}
                        </p>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${STATUS_COLORS[mapping.controlStatus ?? ""] ?? "bg-gray-100 text-gray-500"}`}>
                          {STATUS_OPTS.find((s) => s.value === mapping.controlStatus)?.label ?? "Not Started"}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setEditing(mapping.id);
                            setEditForm({
                              narrative: mapping.implementationNarrative,
                            });
                          }}
                        >
                          <Edit2 className="h-3.5 w-3.5" />
                        </Button>
                      </td>
                    </>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
