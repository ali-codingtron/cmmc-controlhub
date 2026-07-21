import { useState } from "react";
import { Link } from "wouter";
import { useOrg } from "@/context/OrgContext";
import { useAuth } from "@/lib/auth";
import {
  useListOrgPackages,
  useListPackages,
  useAddOrgPackages,
  useRemoveOrgPackage,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import {
  Package,
  Plus,
  Trash2,
  ArrowLeft,
  Check,
  ExternalLink,
} from "lucide-react";

function fwBadgeColor(shortName?: string | null): string {
  switch (shortName) {
    case "CMMC": return "bg-purple-50 text-purple-700 border-purple-200";
    case "NIST 800-171":
    case "NIST 800-171A": return "bg-blue-50 text-blue-700 border-blue-200";
    case "NIST 800-53": return "bg-indigo-50 text-indigo-700 border-indigo-200";
    case "DFARS": return "bg-amber-50 text-amber-700 border-amber-200";
    case "FAR": return "bg-slate-50 text-slate-600 border-slate-200";
    default: return "bg-slate-100 text-slate-600 border-slate-200";
  }
}

function packageTypeLabel(type?: string | null): string {
  switch (type) {
    case "control_framework": return "Control Framework";
    case "assessment_procedure": return "Assessment Procedure";
    case "contract_clause": return "Contract Clause";
    default: return type ?? "Package";
  }
}

export default function SettingsPackages() {
  const { activeOrg } = useOrg();
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [showAdd, setShowAdd] = useState(false);
  const [pendingAdd, setPendingAdd] = useState<string[]>([]);
  const [confirmRemove, setConfirmRemove] = useState<{ packageId: string; packageName: string } | null>(null);

  const canManage =
    user?.role === "admin" || user?.role === "compliance_manager";

  const {
    data: orgPackages = [],
    isLoading,
    refetch,
  } = useListOrgPackages(activeOrg?.id ?? "", {
    query: { enabled: !!activeOrg?.id } as any,
  });

  const { data: allPackages = [], isLoading: allPkgLoading } = useListPackages(
    undefined,
    { query: { enabled: showAdd } as any }
  );

  const addMutation = useAddOrgPackages();
  const removeMutation = useRemoveOrgPackage();

  const activePackages = orgPackages.filter((p) => p.isActive);
  const assignablePackages = (allPackages as any[]).filter(
    (p) => !activePackages.some((ap) => ap.packageId === p.id)
  );

  const handleAdd = () => {
    if (!activeOrg?.id || pendingAdd.length === 0) return;
    addMutation.mutate(
      { id: activeOrg.id, data: { packageIds: pendingAdd } },
      {
        onSuccess: () => {
          toast({
            title: "Packages added",
            description: `${pendingAdd.length} package${pendingAdd.length !== 1 ? "s" : ""} added to ${activeOrg.name}`,
          });
          queryClient.invalidateQueries({
            queryKey: [`/api/organizations/${activeOrg.id}/packages`],
          });
          refetch();
          setShowAdd(false);
          setPendingAdd([]);
        },
        onError: () => {
          toast({
            title: "Error",
            description: "Could not add packages",
            variant: "destructive",
          });
        },
      }
    );
  };

  const handleRemove = (packageId: string, packageName: string) => {
    setConfirmRemove({ packageId, packageName });
  };

  const handleConfirmedRemove = () => {
    if (!activeOrg?.id || !confirmRemove) return;
    const { packageId, packageName } = confirmRemove;
    removeMutation.mutate(
      { id: activeOrg.id, packageId },
      {
        onSuccess: () => {
          toast({
            title: "Package removed",
            description: `${packageName} removed from ${activeOrg.name}`,
          });
          queryClient.invalidateQueries({
            queryKey: [`/api/organizations/${activeOrg.id}/packages`],
          });
          refetch();
          setConfirmRemove(null);
        },
        onError: () => {
          toast({
            title: "Error",
            description: "Could not remove package",
            variant: "destructive",
          });
          setConfirmRemove(null);
        },
      }
    );
  };

  if (!activeOrg) {
    return (
      <div className="p-6 max-w-3xl space-y-4">
        <div className="flex items-center gap-2 text-sm">
          <Link href="/settings" className="text-muted-foreground hover:text-foreground flex items-center gap-1">
            <ArrowLeft className="h-3.5 w-3.5" /> Settings
          </Link>
          <span className="text-muted-foreground">/</span>
          <span className="font-medium">Compliance Packages</span>
        </div>
        <p className="text-muted-foreground">
          Select an organization from the sidebar to manage its compliance packages.
        </p>
      </div>
    );
  }

  const grouped = assignablePackages.reduce(
    (acc: Record<string, any[]>, pkg: any) => {
      const key = pkg.frameworkShortName ?? "Other";
      if (!acc[key]) acc[key] = [];
      acc[key].push(pkg);
      return acc;
    },
    {} as Record<string, any[]>
  );

  return (
    <div className="p-6 space-y-6 max-w-3xl">
      <div className="flex items-center gap-2 text-sm">
        <Link href="/settings" className="text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors">
          <ArrowLeft className="h-3.5 w-3.5" /> Settings
        </Link>
        <span className="text-muted-foreground">/</span>
        <span className="font-medium">Compliance Packages</span>
      </div>

      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Compliance Packages</h1>
          <p className="text-muted-foreground mt-1">
            Frameworks and regulatory packages assigned to{" "}
            <span className="font-medium text-foreground">{activeOrg.name}</span>.
          </p>
        </div>
        {canManage && (
          <Button onClick={() => setShowAdd(true)} className="shrink-0">
            <Plus className="h-4 w-4 mr-1.5" />
            Add Package
          </Button>
        )}
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <Card key={i} className="h-20 animate-pulse bg-muted" />
          ))}
        </div>
      ) : activePackages.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center">
            <Package className="h-12 w-12 mx-auto mb-3 text-muted-foreground/40" />
            <p className="text-muted-foreground font-medium">No compliance packages assigned</p>
            <p className="text-sm text-muted-foreground mt-1 max-w-sm mx-auto">
              Add packages to track which frameworks and regulations this organization must comply with.
            </p>
            {canManage && (
              <Button className="mt-4" onClick={() => setShowAdd(true)}>
                <Plus className="h-4 w-4 mr-1.5" />
                Add Package
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {activePackages.map((pkg) => (
            <Card key={pkg.id} className="border border-border/60 hover:shadow-sm transition-shadow">
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-sm">{pkg.packageName}</span>
                      {pkg.packageVersion && (
                        <span className="text-xs text-muted-foreground">{pkg.packageVersion}</span>
                      )}
                      <Badge
                        variant="outline"
                        className={cn("text-[10px] px-1.5 py-0 shrink-0", fwBadgeColor(pkg.frameworkShortName))}
                      >
                        {pkg.frameworkShortName}
                      </Badge>
                      <Badge variant="outline" className="text-[10px] px-1.5 py-0 capitalize">
                        {packageTypeLabel(pkg.packageType)}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                      {pkg.controlCount != null && (
                        <span>{pkg.controlCount} controls/requirements</span>
                      )}
                      {pkg.selectedAt && (
                        <span>Added {new Date(pkg.selectedAt).toLocaleDateString()}</span>
                      )}
                    </div>
                  </div>
                  {canManage && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-muted-foreground hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 shrink-0"
                      onClick={() => handleRemove(pkg.packageId, pkg.packageName ?? "")}
                      disabled={removeMutation.isPending}
                      title="Remove package"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {activePackages.length > 0 && (
        <div className="rounded-lg border border-border/60 bg-muted/20 p-4 text-sm text-muted-foreground">
          <p className="font-medium text-foreground mb-1">About compliance packages</p>
          <p>
            Packages define the regulatory frameworks this organization must comply with. They inform dashboard
            reporting, gap analysis, and monitoring requirements. Packages can be added or removed without affecting
            existing controls or evidence.
          </p>
          {canManage && (
            <Link
              href="/settings"
              className="inline-flex items-center gap-1 mt-2 text-xs text-primary hover:underline"
            >
              <ExternalLink className="h-3 w-3" />
              Back to Settings
            </Link>
          )}
        </div>
      )}

      <Dialog
        open={showAdd}
        onOpenChange={(open) => {
          setShowAdd(open);
          if (!open) setPendingAdd([]);
        }}
      >
        <DialogContent className="max-w-2xl flex flex-col overflow-hidden" style={{ maxHeight: "80vh" }}>
          <DialogHeader>
            <DialogTitle>Add Compliance Packages</DialogTitle>
            <p className="text-sm text-muted-foreground">
              Select packages to assign to <span className="font-medium text-foreground">{activeOrg.name}</span>.
            </p>
          </DialogHeader>

          <div className="overflow-y-auto flex-1 min-h-0 py-2 space-y-5">
            {allPkgLoading ? (
              <div className="space-y-2">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="h-16 animate-pulse bg-muted rounded-lg" />
                ))}
              </div>
            ) : assignablePackages.length === 0 ? (
              <p className="text-sm text-muted-foreground py-8 text-center">
                All available packages are already assigned to this organization.
              </p>
            ) : (
              Object.entries(grouped).map(([framework, pkgs]) => (
                <div key={framework}>
                  <div className="text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-2">
                    {framework}
                  </div>
                  <div className="space-y-2">
                    {(pkgs as any[]).map((pkg) => {
                      const isPending = pendingAdd.includes(pkg.id);
                      return (
                        <button
                          key={pkg.id}
                          type="button"
                          className={cn(
                            "w-full text-left rounded-lg border p-3 transition-all",
                            isPending
                              ? "border-primary bg-primary/5"
                              : "border-border hover:border-primary/40 hover:bg-muted/30"
                          )}
                          onClick={() =>
                            setPendingAdd((prev) =>
                              prev.includes(pkg.id)
                                ? prev.filter((id) => id !== pkg.id)
                                : [...prev, pkg.id]
                            )
                          }
                        >
                          <div className="flex items-start gap-3">
                            <div
                              className={cn(
                                "mt-0.5 w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 transition-colors",
                                isPending
                                  ? "border-primary bg-primary"
                                  : "border-border bg-background"
                              )}
                            >
                              {isPending && (
                                <Check className="h-3 w-3 text-primary-foreground" strokeWidth={3} />
                              )}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-sm font-medium">{pkg.name}</span>
                                {pkg.version && (
                                  <span className="text-xs text-muted-foreground">{pkg.version}</span>
                                )}
                                <Badge
                                  variant="outline"
                                  className={cn("text-[10px] px-1.5 py-0", fwBadgeColor(pkg.frameworkShortName))}
                                >
                                  {pkg.frameworkShortName}
                                </Badge>
                              </div>
                              {pkg.description && (
                                <div className="text-xs text-muted-foreground mt-0.5 line-clamp-2 leading-relaxed">
                                  {pkg.description}
                                </div>
                              )}
                              {pkg.controlCount != null && (
                                <div className="text-[10px] text-muted-foreground mt-1.5">
                                  {pkg.controlCount} controls/requirements
                                </div>
                              )}
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Dry-run impact preview */}
          {pendingAdd.length > 0 && (() => {
            const pendingPkgs = (allPackages as any[]).filter(p => pendingAdd.includes(p.id));
            const activeIds = activePackages.map(p => p.packageId);
            // Raw control count from newly selected control frameworks
            const newCtlRaw = pendingPkgs
              .filter((p: any) => p.packageType === "control_framework")
              .reduce((s: number, p: any) => s + (p.controlCount ?? 0), 0);
            // Overlaps: pending + already-active packages share controls
            const allIds = [...activeIds, ...pendingAdd];
            const hasL2 = allIds.includes("pkg-cmmc-l2-self");
            const hasNist2 = allIds.includes("pkg-nist-800-171-r2");
            const hasNist3 = allIds.includes("pkg-nist-800-171-r3");
            const hasL1 = allIds.includes("pkg-cmmc-l1-self");
            const hasFar = allIds.includes("pkg-far-52-204-21");
            // Only subtract overlap if the overlapping partner is not already active
            // (if partner already active, those controls were already counted)
            const activeHasL2 = activeIds.includes("pkg-cmmc-l2-self");
            const activeHasNist2 = activeIds.includes("pkg-nist-800-171-r2");
            let overlap = 0;
            if (hasL2 && hasNist2 && !activeHasL2 && !activeHasNist2) overlap += 110;
            else if (hasL2 && hasNist2 && (activeHasL2 || activeHasNist2)) overlap += 110; // one side already counted
            if (hasL2 && hasNist3) overlap += 110;
            if (hasL1 && hasFar) overlap += 17;
            const netNewCtl = Math.max(0, newCtlRaw - overlap);
            const overlapNote = (hasL2 && hasNist2) || (hasL2 && hasNist3);
            const assessmentCount = pendingPkgs
              .filter((p: any) => p.packageType === "assessment_procedure")
              .reduce((s: number, p: any) => s + (p.controlCount ?? 0), 0);
            return (
              <div className="border-t pt-3 shrink-0">
                <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Impact Preview</div>
                <div className="flex gap-3 flex-wrap">
                  {netNewCtl > 0 && (
                    <div className="flex-1 min-w-[100px] rounded-md bg-muted/30 border border-border/60 p-2 text-center">
                      <div className="text-xl font-bold">{netNewCtl}</div>
                      <div className="text-[10px] text-muted-foreground">net new controls</div>
                    </div>
                  )}
                  {assessmentCount > 0 && (
                    <div className="flex-1 min-w-[100px] rounded-md bg-muted/30 border border-border/60 p-2 text-center">
                      <div className="text-xl font-bold">{assessmentCount}</div>
                      <div className="text-[10px] text-muted-foreground">assessment methods</div>
                    </div>
                  )}
                  {netNewCtl === 0 && assessmentCount === 0 && (
                    <p className="text-xs text-muted-foreground">Contract clause(s) only — no new control requirements.</p>
                  )}
                </div>
                {overlapNote && (
                  <p className="text-[11px] text-blue-700 dark:text-blue-300 mt-1.5">
                    ↔ CMMC L2 and NIST 800-171 share the same 110 controls — overlap is excluded from the count above.
                  </p>
                )}
              </div>
            );
          })()}

          <DialogFooter className="pt-4 border-t shrink-0">
            <Button
              variant="outline"
              onClick={() => {
                setShowAdd(false);
                setPendingAdd([]);
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={handleAdd}
              disabled={pendingAdd.length === 0 || addMutation.isPending}
            >
              {addMutation.isPending
                ? "Adding..."
                : `Add ${pendingAdd.length > 0 ? pendingAdd.length + " " : ""}Package${pendingAdd.length !== 1 ? "s" : ""}`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirmation dialog for package removal */}
      <Dialog open={!!confirmRemove} onOpenChange={(open) => { if (!open) setConfirmRemove(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Remove compliance package?</DialogTitle>
            <p className="text-sm text-muted-foreground mt-1">
              This will deactivate{" "}
              <span className="font-medium text-foreground">{confirmRemove?.packageName}</span> from{" "}
              <span className="font-medium text-foreground">{activeOrg?.name}</span>. Existing controls, evidence, and monitoring items will not be affected — the package can be re-added at any time.
            </p>
          </DialogHeader>
          <DialogFooter className="mt-2">
            <Button
              variant="outline"
              onClick={() => setConfirmRemove(null)}
              disabled={removeMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleConfirmedRemove}
              disabled={removeMutation.isPending}
            >
              {removeMutation.isPending ? "Removing..." : "Remove Package"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
