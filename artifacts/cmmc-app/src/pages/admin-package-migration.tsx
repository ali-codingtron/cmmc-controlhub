import { useState } from "react";
import { useAuth } from "@/lib/auth";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ShieldCheck,
  Package,
  AlertCircle,
  Check,
  Building2,
  Plus,
  Trash2,
  Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useListPackages, useAddOrgPackages, useRemoveOrgPackage } from "@workspace/api-client-react";
import type { CompliancePackageWithFramework } from "@workspace/api-client-react";

interface OrgPackageStatus {
  id: string;
  name: string;
  shortName: string | null;
  cmmcTargetLevel: string | null;
  isTestOrganization: boolean;
  isActive: boolean;
  packageControlCount: number;
  assessedControlCount: number;
  inferredLevel: string | null;
  packages: Array<{
    packageId: string;
    packageKey: string;
    packageName: string;
    packageType: string;
    frameworkShortName: string;
    isActive: boolean;
    selectedAt: string;
  }>;
}

function frameworkColor(fw: string): string {
  if (fw === "CMMC") return "bg-purple-50 text-purple-700 border-purple-200";
  if (fw?.startsWith("NIST")) return "bg-blue-50 text-blue-700 border-blue-200";
  if (fw === "DFARS") return "bg-amber-50 text-amber-700 border-amber-200";
  if (fw === "FAR") return "bg-slate-50 text-slate-600 border-slate-200";
  return "bg-slate-50 text-slate-600 border-slate-200";
}

function ConfirmRemoveDialog({
  packageName,
  orgName,
  onConfirm,
  onCancel,
  isPending,
}: {
  packageName: string;
  orgName: string;
  onConfirm: () => void;
  onCancel: () => void;
  isPending: boolean;
}) {
  return (
    <Dialog open onOpenChange={(open) => { if (!open) onCancel(); }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Trash2 className="h-4 w-4 text-destructive" />
            Remove Package
          </DialogTitle>
          <DialogDescription>
            Remove <span className="font-medium text-foreground">{packageName}</span> from{" "}
            <span className="font-medium text-foreground">{orgName}</span>? The package will no
            longer appear in their compliance view.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onCancel} disabled={isPending}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={onConfirm} disabled={isPending}>
            {isPending ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5 mr-1.5" />}
            Remove
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ManagePackagesModal({
  org,
  allPackages,
  onClose,
  onRefresh,
}: {
  org: OrgPackageStatus;
  allPackages: CompliancePackageWithFramework[];
  onClose: () => void;
  onRefresh: () => void;
}) {
  const queryClient = useQueryClient();
  const [selectedPackageId, setSelectedPackageId] = useState<string>("");
  const [confirmRemovePackage, setConfirmRemovePackage] = useState<{ packageId: string; packageName: string } | null>(null);

  const invalidateOrgPackages = () => {
    void queryClient.invalidateQueries({
      queryKey: [`/api/organizations/${org.id}/packages`],
    });
  };

  const addMutation = useAddOrgPackages({
    mutation: {
      onSuccess: () => {
        setSelectedPackageId("");
        invalidateOrgPackages();
        onRefresh();
      },
    },
  });

  const removeMutation = useRemoveOrgPackage({
    mutation: {
      onSuccess: () => {
        setConfirmRemovePackage(null);
        invalidateOrgPackages();
        onRefresh();
      },
    },
  });

  const assignedPackageIds = new Set(org.packages.map((p) => p.packageId));
  const availablePackages = allPackages.filter((p) => !assignedPackageIds.has(p.id));

  const handleAssign = () => {
    if (!selectedPackageId) return;
    addMutation.mutate({ id: org.id, data: { packageIds: [selectedPackageId] } });
  };

  const handleRemoveConfirmed = () => {
    if (!confirmRemovePackage) return;
    removeMutation.mutate({ id: org.id, packageId: confirmRemovePackage.packageId });
  };

  return (
    <>
      <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Package className="h-5 w-5 text-primary" />
              Manage Packages
            </DialogTitle>
            <DialogDescription>
              Assign or remove compliance packages for{" "}
              <span className="font-medium text-foreground">{org.name}</span>.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-5 py-1">
            <div>
              <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                Assigned Packages ({org.packages.length})
              </div>
              {org.packages.length === 0 ? (
                <p className="text-sm text-muted-foreground">No packages assigned yet.</p>
              ) : (
                <div className="space-y-1.5">
                  {org.packages.map((pkg) => (
                    <div
                      key={pkg.packageId}
                      className="flex items-center gap-2 text-sm rounded-md border border-border/50 px-3 py-2 bg-muted/20"
                    >
                      <Badge
                        variant="outline"
                        className={cn("text-[10px] shrink-0", frameworkColor(pkg.frameworkShortName))}
                      >
                        {pkg.frameworkShortName}
                      </Badge>
                      <span className="flex-1 font-medium">{pkg.packageName}</span>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 text-muted-foreground hover:text-destructive shrink-0"
                        onClick={() =>
                          setConfirmRemovePackage({ packageId: pkg.packageId, packageName: pkg.packageName })
                        }
                        disabled={removeMutation.isPending}
                        title={`Remove ${pkg.packageName}`}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div>
              <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                Assign Package
              </div>
              {availablePackages.length === 0 ? (
                <div className="flex items-center gap-2 text-sm text-green-700 rounded-md border border-green-200 bg-green-50 px-3 py-2">
                  <Check className="h-4 w-4 shrink-0" />
                  All available packages are already assigned.
                </div>
              ) : (
                <div className="flex gap-2">
                  <Select value={selectedPackageId} onValueChange={setSelectedPackageId}>
                    <SelectTrigger className="flex-1 text-sm h-9">
                      <SelectValue placeholder="Select a package to assign…" />
                    </SelectTrigger>
                    <SelectContent>
                      {availablePackages.map((pkg) => (
                        <SelectItem key={pkg.id} value={pkg.id}>
                          <div className="flex items-center gap-2">
                            <Badge
                              variant="outline"
                              className={cn("text-[9px] px-1 py-0 shrink-0", frameworkColor(pkg.frameworkShortName))}
                            >
                              {pkg.frameworkShortName}
                            </Badge>
                            <span>{pkg.name}</span>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    size="sm"
                    onClick={handleAssign}
                    disabled={!selectedPackageId || addMutation.isPending}
                    className="h-9"
                  >
                    {addMutation.isPending ? (
                      <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                    ) : (
                      <Plus className="h-3.5 w-3.5 mr-1.5" />
                    )}
                    Assign
                  </Button>
                </div>
              )}
              {addMutation.isError && (
                <p className="text-xs text-destructive mt-1.5">
                  Failed to assign package. Please try again.
                </p>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={onClose}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {confirmRemovePackage && (
        <ConfirmRemoveDialog
          packageName={confirmRemovePackage.packageName}
          orgName={org.name}
          onConfirm={handleRemoveConfirmed}
          onCancel={() => setConfirmRemovePackage(null)}
          isPending={removeMutation.isPending}
        />
      )}
    </>
  );
}

export default function AdminPackageMigration() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [manageOrg, setManageOrg] = useState<OrgPackageStatus | null>(null);

  const { data: orgs = [], isLoading, refetch } = useQuery<OrgPackageStatus[]>({
    queryKey: ["/api/admin/orgs-package-status"],
    queryFn: async () => {
      const token = localStorage.getItem("auth_token");
      const res = await fetch("/api/admin/orgs-package-status", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: user?.role === "admin",
    staleTime: 30000,
  });

  const { data: allPackages = [] } = useListPackages(
    undefined,
    { query: { enabled: user?.role === "admin", staleTime: 60000 } as any }
  );

  if (user?.role !== "admin") {
    return (
      <div className="space-y-4">
        <h1 className="text-3xl font-bold">Package Migration Tool</h1>
        <p className="text-muted-foreground">Admin access required.</p>
      </div>
    );
  }

  const activeOrgs = orgs.filter((o) => o.isActive);
  const unassignedOrgs = activeOrgs.filter((o) => o.packages.length === 0);
  const assignedOrgs = activeOrgs.filter((o) => o.packages.length > 0);

  const handleRefreshAfterChange = () => {
    void refetch();
    void queryClient.invalidateQueries({ queryKey: ["/api/organizations"] });
  };

  const liveManageOrg = manageOrg
    ? (orgs.find((o) => o.id === manageOrg.id) ?? manageOrg)
    : null;

  return (
    <div className="space-y-6 max-w-5xl">
      <div>
        <h1 className="text-3xl font-bold">Package Migration Tool</h1>
        <p className="text-muted-foreground mt-1">
          Assign or remove compliance packages for any organization directly from this page.
        </p>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-4 text-center">
            <div className="text-2xl font-bold">{activeOrgs.length}</div>
            <div className="text-xs text-muted-foreground mt-0.5">Total Organizations</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <div className="text-2xl font-bold text-amber-600">{unassignedOrgs.length}</div>
            <div className="text-xs text-muted-foreground mt-0.5">No Packages Assigned</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <div className="text-2xl font-bold text-green-600">{assignedOrgs.length}</div>
            <div className="text-xs text-muted-foreground mt-0.5">Have Packages</div>
          </CardContent>
        </Card>
      </div>

      {unassignedOrgs.length > 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50/50 p-4 flex items-start gap-3">
          <AlertCircle className="h-5 w-5 text-amber-600 mt-0.5 shrink-0" />
          <div>
            <p className="font-medium text-amber-900 text-sm">
              {unassignedOrgs.length} organization{unassignedOrgs.length !== 1 ? "s" : ""} without packages
            </p>
            <p className="text-sm text-amber-700 mt-0.5">
              Organizations without compliance packages assigned will default to showing all CMMC
              controls. Click <strong>Manage</strong> to assign packages.
            </p>
          </div>
        </div>
      )}

      <Card>
        <CardContent className="pt-4">
          {isLoading ? (
            <div className="space-y-2">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="h-12 animate-pulse bg-muted rounded" />
              ))}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Organization</TableHead>
                  <TableHead className="w-24">CMMC Level</TableHead>
                  <TableHead className="w-32">Inferred Level</TableHead>
                  <TableHead className="w-36">Controls Assessed</TableHead>
                  <TableHead>Assigned Packages</TableHead>
                  <TableHead className="w-28">Status</TableHead>
                  <TableHead className="w-32">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {activeOrgs.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-muted-foreground py-10">
                      No organizations found.
                    </TableCell>
                  </TableRow>
                ) : (
                  activeOrgs.map((org) => (
                    <TableRow key={org.id}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Building2 className="h-4 w-4 text-muted-foreground shrink-0" />
                          <div>
                            <div className="font-medium text-sm">{org.name}</div>
                            {org.shortName && (
                              <div className="text-xs text-muted-foreground">{org.shortName}</div>
                            )}
                          </div>
                          {org.isTestOrganization && (
                            <Badge
                              variant="outline"
                              className="text-[9px] border-amber-400/60 text-amber-600 bg-amber-50"
                            >
                              TEST
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        {org.cmmcTargetLevel ? (
                          <Badge
                            variant="outline"
                            className="text-[11px] bg-purple-50 text-purple-700 border-purple-200"
                          >
                            {org.cmmcTargetLevel}
                          </Badge>
                        ) : (
                          <span className="text-muted-foreground text-xs">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {org.inferredLevel ? (
                          <Badge
                            variant="outline"
                            className={cn(
                              "text-[10px]",
                              org.inferredLevel === "L2"
                                ? "bg-purple-50 text-purple-700 border-purple-200"
                                : "bg-slate-50 text-slate-600 border-slate-200"
                            )}
                          >
                            {org.inferredLevel} (from pkgs)
                          </Badge>
                        ) : (
                          <span className="text-muted-foreground text-xs">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col gap-0.5">
                          <div>
                            <span
                              className={cn(
                                "text-sm font-medium tabular-nums",
                                org.packageControlCount === 0 ? "text-muted-foreground" : ""
                              )}
                            >
                              {org.packageControlCount}
                            </span>
                            <span className="text-xs text-muted-foreground ml-1">in scope</span>
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {org.assessedControlCount} assessed
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {org.packages.length === 0 ? (
                            <span className="text-xs text-muted-foreground">None</span>
                          ) : (
                            org.packages.slice(0, 3).map((pkg) => (
                              <Badge
                                key={pkg.packageId}
                                variant="outline"
                                className={cn(
                                  "text-[10px] px-1.5 py-0",
                                  frameworkColor(pkg.frameworkShortName)
                                )}
                              >
                                {pkg.frameworkShortName}
                              </Badge>
                            ))
                          )}
                          {org.packages.length > 3 && (
                            <span className="text-xs text-muted-foreground">
                              +{org.packages.length - 3} more
                            </span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        {org.packages.length === 0 ? (
                          <Badge
                            variant="outline"
                            className="text-[10px] bg-amber-50 text-amber-700 border-amber-200"
                          >
                            Unassigned
                          </Badge>
                        ) : (
                          <Badge
                            variant="outline"
                            className="text-[10px] bg-green-50 text-green-700 border-green-200"
                          >
                            <Check className="h-3 w-3 mr-0.5" />
                            Assigned
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setManageOrg(org)}
                          className="text-xs h-7"
                        >
                          <ShieldCheck className="h-3.5 w-3.5 mr-1" />
                          Manage
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {liveManageOrg && (
        <ManagePackagesModal
          org={liveManageOrg}
          allPackages={allPackages}
          onClose={() => setManageOrg(null)}
          onRefresh={handleRefreshAfterChange}
        />
      )}
    </div>
  );
}
