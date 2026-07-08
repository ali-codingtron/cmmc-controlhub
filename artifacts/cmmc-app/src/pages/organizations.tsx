import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import {
  Building2,
  Plus,
  AlertTriangle,
  CheckSquare,
  FileText,
  RefreshCw,
  Trash2,
} from "lucide-react";
import { useAuth } from "@/lib/auth";
import { useOrg } from "@/context/OrgContext";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

interface OrgStats {
  id: string;
  name: string;
  shortName: string | null;
  cmmcTargetLevel: string | null;
  isTestOrganization: boolean;
  readinessPercent: number;
  implementedControls: number;
  totalControls: number;
  openPoams: number;
  openTasks: number;
  evidenceCount: number;
}

function ReadinessRing({ percent, size = 56 }: { percent: number; size?: number }) {
  const radius = (size - 8) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (percent / 100) * circumference;
  const color = percent >= 75 ? "#22c55e" : percent >= 40 ? "#f59e0b" : "#ef4444";

  return (
    <svg width={size} height={size} className="-rotate-90">
      <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="currentColor" strokeWidth={6} className="text-muted/30" />
      <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke={color} strokeWidth={6} strokeDasharray={circumference} strokeDashoffset={offset} strokeLinecap="round" />
      <text x="50%" y="50%" dominantBaseline="middle" textAnchor="middle" fill={color} fontSize={size * 0.22} fontWeight="700" className="rotate-90" style={{ transform: `rotate(90deg) translate(0px, -${size}px)` }}>
        {percent}%
      </text>
    </svg>
  );
}

function OrgCard({ org, onSwitch, onDelete }: { org: OrgStats; onSwitch: (id: string) => void; onDelete: (id: string, name: string) => void }) {
  const { activeOrg } = useOrg();
  const isActive = activeOrg?.id === org.id;
  const levelColor = org.cmmcTargetLevel === "L1" ? "bg-blue-500/10 text-blue-600 border-blue-200 dark:text-blue-400" : "bg-purple-500/10 text-purple-600 border-purple-200 dark:text-purple-400";

  return (
    <Card className={cn("hover:shadow-md transition-shadow relative", isActive && "ring-2 ring-primary")}>
      <div className="absolute top-3 right-3 flex items-center gap-1.5">
        {org.isTestOrganization && (
          <Badge variant="outline" className="text-[10px] font-semibold px-1.5 py-0 border-amber-300 text-amber-700 bg-amber-50 dark:border-amber-700 dark:text-amber-400 dark:bg-amber-950/40">
            TEST DATA
          </Badge>
        )}
        {isActive && <Badge variant="default" className="text-xs">Active</Badge>}
        {!isActive && (
          <button
            onClick={() => onDelete(org.id, org.name)}
            className="p-1.5 rounded-md text-muted-foreground hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors"
            title="Delete organization"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
      <CardHeader className="pb-3">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
            <Building2 className="h-5 w-5 text-primary" />
          </div>
          <div className="flex-1 min-w-0 pr-16">
            <CardTitle className="text-base truncate">{org.name}</CardTitle>
            <div className="flex items-center gap-2 mt-1">
              <Badge variant="outline" className={cn("text-xs font-semibold", levelColor)}>
                CMMC {org.cmmcTargetLevel ?? "—"}
              </Badge>
            </div>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center gap-4">
          <div className="relative">
            <svg width={56} height={56} className="-rotate-90">
              <circle cx={28} cy={28} r={22} fill="none" stroke="currentColor" strokeWidth={5} className="text-muted/30" />
              <circle
                cx={28} cy={28} r={22}
                fill="none"
                stroke={org.readinessPercent >= 75 ? "#22c55e" : org.readinessPercent >= 40 ? "#f59e0b" : "#ef4444"}
                strokeWidth={5}
                strokeDasharray={2 * Math.PI * 22}
                strokeDashoffset={2 * Math.PI * 22 * (1 - org.readinessPercent / 100)}
                strokeLinecap="round"
              />
            </svg>
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="text-xs font-bold">{org.readinessPercent}%</span>
            </div>
          </div>
          <div className="flex-1">
            <div className="text-xs text-muted-foreground">Readiness</div>
            <div className="text-sm font-medium">{org.implementedControls}/{org.totalControls} controls</div>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="bg-muted/40 rounded-md p-2">
            <AlertTriangle className="h-3.5 w-3.5 mx-auto text-orange-500 mb-0.5" />
            <div className="text-sm font-semibold">{org.openPoams}</div>
            <div className="text-[10px] text-muted-foreground">POA&Ms</div>
          </div>
          <div className="bg-muted/40 rounded-md p-2">
            <CheckSquare className="h-3.5 w-3.5 mx-auto text-blue-500 mb-0.5" />
            <div className="text-sm font-semibold">{org.openTasks}</div>
            <div className="text-[10px] text-muted-foreground">Tasks</div>
          </div>
          <div className="bg-muted/40 rounded-md p-2">
            <FileText className="h-3.5 w-3.5 mx-auto text-green-500 mb-0.5" />
            <div className="text-sm font-semibold">{org.evidenceCount}</div>
            <div className="text-[10px] text-muted-foreground">Evidence</div>
          </div>
        </div>

        <Button
          variant={isActive ? "outline" : "default"}
          size="sm"
          className="w-full"
          onClick={() => onSwitch(org.id)}
        >
          {isActive ? "Currently Viewing" : "Switch to Org"}
        </Button>
      </CardContent>
    </Card>
  );
}

function NewOrgDialog({ open, onClose, onSuccess }: { open: boolean; onClose: () => void; onSuccess?: () => void }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [form, setForm] = useState({
    name: "",
    legalName: "",
    shortName: "",
    cageCode: "",
    uei: "",
    industry: "",
    primaryContact: "",
    cmmcTargetLevel: "L2",
    organizationAddress: "",
    assessmentScope: "",
    notes: "",
  });
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name) return;

    setSaving(true);
    try {
      const token = localStorage.getItem("auth_token");
      const res = await fetch("/api/organizations", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(form),
      });
      if (!res.ok) throw new Error("Failed to create organization");
      toast({ title: "Organization created" });
      queryClient.invalidateQueries({ queryKey: ["global-stats"] });
      onSuccess?.();
      onClose();
    } catch {
      toast({ title: "Error", description: "Could not create organization", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add New Organization</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <Label>Organization Name *</Label>
              <Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="Apex Defense LLC" required />
            </div>
            <div>
              <Label>Legal Name</Label>
              <Input value={form.legalName} onChange={(e) => setForm((f) => ({ ...f, legalName: e.target.value }))} placeholder="Full legal name" />
            </div>
            <div>
              <Label>Short Name</Label>
              <Input value={form.shortName} onChange={(e) => setForm((f) => ({ ...f, shortName: e.target.value }))} placeholder="Apex" />
            </div>
            <div>
              <Label>CAGE Code</Label>
              <Input value={form.cageCode} onChange={(e) => setForm((f) => ({ ...f, cageCode: e.target.value }))} placeholder="1ABC2" />
            </div>
            <div>
              <Label>UEI</Label>
              <Input value={form.uei} onChange={(e) => setForm((f) => ({ ...f, uei: e.target.value }))} placeholder="UEI number" />
            </div>
            <div>
              <Label>Industry</Label>
              <Input value={form.industry} onChange={(e) => setForm((f) => ({ ...f, industry: e.target.value }))} placeholder="Aerospace & Defense" />
            </div>
            <div>
              <Label>CMMC Target Level</Label>
              <Select value={form.cmmcTargetLevel} onValueChange={(v) => setForm((f) => ({ ...f, cmmcTargetLevel: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="L1">Level 1</SelectItem>
                  <SelectItem value="L2">Level 2</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="col-span-2">
              <Label>Primary Contact</Label>
              <Input value={form.primaryContact} onChange={(e) => setForm((f) => ({ ...f, primaryContact: e.target.value }))} placeholder="Contact name" />
            </div>
            <div className="col-span-2">
              <Label>Address</Label>
              <Input value={form.organizationAddress} onChange={(e) => setForm((f) => ({ ...f, organizationAddress: e.target.value }))} placeholder="Street, City, State ZIP" />
            </div>
            <div className="col-span-2">
              <Label>Assessment Scope</Label>
              <Input value={form.assessmentScope} onChange={(e) => setForm((f) => ({ ...f, assessmentScope: e.target.value }))} placeholder="Brief description of systems in scope" />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={saving}>{saving ? "Creating..." : "Create Organization"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default function Organizations() {
  const { user } = useAuth();
  const { orgs, setActiveOrg, refreshOrgs } = useOrg();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [showNew, setShowNew] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [deleting, setDeleting] = useState(false);

  const { data: stats = [], isLoading, refetch } = useQuery<OrgStats[]>({
    queryKey: ["global-stats"],
    queryFn: async () => {
      const token = localStorage.getItem("auth_token");
      const res = await fetch("/api/organizations/global-stats", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Failed to fetch stats");
      return res.json();
    },
    enabled: user?.role === "admin",
  });

  const handleSwitch = (orgId: string) => {
    // First try the context orgs list (has membership role info)
    const contextOrg = orgs.find((o) => o.id === orgId);
    if (contextOrg) {
      setActiveOrg(contextOrg);
      toast({ title: `Switched to ${contextOrg.name}` });
      queryClient.invalidateQueries();
      return;
    }
    // Fallback for global admin: org may not have an explicit membership row,
    // so build an OrgSummary from the stats data already loaded on this page.
    const statOrg = stats.find((s) => s.id === orgId);
    if (statOrg) {
      setActiveOrg({
        id: statOrg.id,
        name: statOrg.name,
        shortName: statOrg.shortName,
        cmmcTargetLevel: statOrg.cmmcTargetLevel,
        industry: null,
        isActive: true,
        isTestOrganization: statOrg.isTestOrganization,
        role: "admin",
      });
      toast({ title: `Switched to ${statOrg.name}` });
      queryClient.invalidateQueries();
    }
  };

  const handleDeleteConfirm = async () => {
    if (!deleteTarget || deleteConfirmText !== deleteTarget.name) return;
    setDeleting(true);
    try {
      const token = localStorage.getItem("auth_token");
      const res = await fetch(`/api/organizations/${deleteTarget.id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Failed to delete organization");
      toast({ title: `"${deleteTarget.name}" deleted` });
      queryClient.invalidateQueries({ queryKey: ["global-stats"] });
      refreshOrgs();
      setDeleteTarget(null);
      setDeleteConfirmText("");
    } catch {
      toast({ title: "Error", description: "Could not delete organization", variant: "destructive" });
    } finally {
      setDeleting(false);
    }
  };

  if (user?.role !== "admin") {
    return (
      <div className="p-8 text-center text-muted-foreground">
        <Building2 className="h-12 w-12 mx-auto mb-3 opacity-30" />
        <p>Admin access required to manage organizations.</p>
      </div>
    );
  }

  const totalReadiness = stats.length > 0 ? Math.round(stats.reduce((s, o) => s + o.readinessPercent, 0) / stats.length) : 0;
  const totalPoams = stats.reduce((s, o) => s + o.openPoams, 0);
  const totalTasks = stats.reduce((s, o) => s + o.openTasks, 0);

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Building2 className="h-7 w-7 text-primary" />
            Organizations
          </h1>
          <p className="text-muted-foreground mt-1">Manage client organizations and monitor compliance readiness across all tenants.</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => { refetch(); refreshOrgs(); }}>
            <RefreshCw className="h-4 w-4 mr-1" />
            Refresh
          </Button>
          <Button onClick={() => setShowNew(true)}>
            <Plus className="h-4 w-4 mr-1" />
            Add Organization
          </Button>
        </div>
      </div>

      {/* Summary banner */}
      <div className="grid grid-cols-4 gap-4">
        <Card className="col-span-1">
          <CardContent className="pt-5 pb-4">
            <div className="text-3xl font-bold text-primary">{stats.length}</div>
            <div className="text-sm text-muted-foreground mt-0.5">Total Organizations</div>
          </CardContent>
        </Card>
        <Card className="col-span-1">
          <CardContent className="pt-5 pb-4">
            <div className="text-3xl font-bold">{totalReadiness}%</div>
            <div className="text-sm text-muted-foreground mt-0.5">Avg. Readiness</div>
          </CardContent>
        </Card>
        <Card className="col-span-1">
          <CardContent className="pt-5 pb-4">
            <div className="text-3xl font-bold text-orange-500">{totalPoams}</div>
            <div className="text-sm text-muted-foreground mt-0.5">Open POA&Ms</div>
          </CardContent>
        </Card>
        <Card className="col-span-1">
          <CardContent className="pt-5 pb-4">
            <div className="text-3xl font-bold text-blue-500">{totalTasks}</div>
            <div className="text-sm text-muted-foreground mt-0.5">Open Tasks</div>
          </CardContent>
        </Card>
      </div>

      {/* Org grid */}
      {isLoading ? (
        <div className="grid grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <Card key={i} className="h-64 animate-pulse bg-muted" />
          ))}
        </div>
      ) : stats.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center">
            <Building2 className="h-12 w-12 mx-auto mb-3 text-muted-foreground/40" />
            <p className="text-muted-foreground">No organizations found. Create one to get started.</p>
            <Button className="mt-4" onClick={() => setShowNew(true)}>
              <Plus className="h-4 w-4 mr-1" /> Add Organization
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {stats.map((org) => (
            <OrgCard key={org.id} org={org} onSwitch={handleSwitch} onDelete={(id, name) => setDeleteTarget({ id, name })} />
          ))}
        </div>
      )}

      {/* Cross-org table view */}
      {stats.length > 1 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Compliance Comparison</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-muted-foreground">
                    <th className="text-left font-medium pb-2 pr-4">Organization</th>
                    <th className="text-center font-medium pb-2 px-3">Level</th>
                    <th className="text-center font-medium pb-2 px-3">Readiness</th>
                    <th className="text-center font-medium pb-2 px-3">Controls</th>
                    <th className="text-center font-medium pb-2 px-3">POA&Ms</th>
                    <th className="text-center font-medium pb-2 px-3">Tasks</th>
                    <th className="text-center font-medium pb-2 px-3">Evidence</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {stats.map((org) => (
                    <tr key={org.id} className="hover:bg-muted/30 transition-colors">
                      <td className="py-2.5 pr-4 font-medium">{org.name}</td>
                      <td className="text-center py-2.5 px-3">
                        <Badge variant="outline" className="text-xs">
                          {org.cmmcTargetLevel ?? "—"}
                        </Badge>
                      </td>
                      <td className="text-center py-2.5 px-3">
                        <div className="flex items-center justify-center gap-1.5">
                          <div className="w-16 h-1.5 rounded-full bg-muted overflow-hidden">
                            <div
                              className="h-full rounded-full transition-all"
                              style={{
                                width: `${org.readinessPercent}%`,
                                backgroundColor: org.readinessPercent >= 75 ? "#22c55e" : org.readinessPercent >= 40 ? "#f59e0b" : "#ef4444",
                              }}
                            />
                          </div>
                          <span className="text-xs font-medium">{org.readinessPercent}%</span>
                        </div>
                      </td>
                      <td className="text-center py-2.5 px-3 text-muted-foreground">{org.implementedControls}/{org.totalControls}</td>
                      <td className="text-center py-2.5 px-3">
                        <span className={cn("font-medium", org.openPoams > 0 && "text-orange-500")}>{org.openPoams}</span>
                      </td>
                      <td className="text-center py-2.5 px-3">
                        <span className={cn("font-medium", org.openTasks > 0 && "text-blue-500")}>{org.openTasks}</span>
                      </td>
                      <td className="text-center py-2.5 px-3 text-muted-foreground">{org.evidenceCount}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      <NewOrgDialog open={showNew} onClose={() => setShowNew(false)} onSuccess={refreshOrgs} />

      <Dialog open={!!deleteTarget} onOpenChange={() => { setDeleteTarget(null); setDeleteConfirmText(""); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-600">
              <Trash2 className="h-5 w-5" />
              Delete Organization
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="rounded-md bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 p-3 text-sm text-red-700 dark:text-red-400">
              <p className="font-semibold mb-1">⚠ This action is permanent and cannot be undone.</p>
              <p>Deleting <span className="font-semibold">"{deleteTarget?.name}"</span> will remove the organization and all user memberships. Controls, evidence, tasks, and POA&Ms scoped to this org will no longer be accessible.</p>
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm">
                Type <span className="font-semibold text-foreground">{deleteTarget?.name}</span> to confirm:
              </Label>
              <Input
                value={deleteConfirmText}
                onChange={(e) => setDeleteConfirmText(e.target.value)}
                placeholder={deleteTarget?.name}
                className="font-mono"
                autoComplete="off"
              />
            </div>
          </div>
          <DialogFooter className="mt-2">
            <Button variant="outline" onClick={() => { setDeleteTarget(null); setDeleteConfirmText(""); }}>Cancel</Button>
            <Button
              variant="destructive"
              onClick={handleDeleteConfirm}
              disabled={deleting || deleteConfirmText !== deleteTarget?.name}
            >
              {deleting ? "Deleting..." : "Delete Organization"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
