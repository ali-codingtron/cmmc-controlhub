import { useState } from "react";
import { useAuth } from "@/lib/auth";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ShieldCheck, Package, AlertCircle, Check, Building2, Link as LinkIcon } from "lucide-react";
import { Link } from "wouter";
import { cn } from "@/lib/utils";

interface OrgPackageStatus {
  id: string;
  name: string;
  shortName: string | null;
  cmmcTargetLevel: string | null;
  isTestOrganization: boolean;
  isActive: boolean;
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

const SUGGESTED_PACKAGES: Record<string, Array<{ key: string; name: string; reason: string }>> = {
  L1: [
    { key: "CMMC_L1_SELF", name: "CMMC L1 Self-Assessment", reason: "CMMC Level 1 target requires L1 self-assessment tracking" },
    { key: "FAR_52_204_21", name: "FAR 52.204-21", reason: "FCI handling requires FAR Basic Safeguarding clause compliance" },
  ],
  L2: [
    { key: "CMMC_L2_SELF", name: "CMMC L2 Self-Assessment", reason: "CMMC Level 2 target requires L2 assessment tracking" },
    { key: "NIST_800_171_R2", name: "NIST SP 800-171 Rev. 2", reason: "CMMC L2 is based on NIST 800-171 Rev. 2 (110 controls)" },
  ],
};

function frameworkColor(fw: string): string {
  if (fw === "CMMC") return "bg-purple-50 text-purple-700 border-purple-200";
  if (fw?.startsWith("NIST")) return "bg-blue-50 text-blue-700 border-blue-200";
  if (fw === "DFARS") return "bg-amber-50 text-amber-700 border-amber-200";
  if (fw === "FAR") return "bg-slate-50 text-slate-600 border-slate-200";
  return "bg-slate-50 text-slate-600 border-slate-200";
}

function PreviewModal({
  org,
  onClose,
}: {
  org: OrgPackageStatus;
  onClose: () => void;
}) {
  const level = org.cmmcTargetLevel ?? "L2";
  const suggested = SUGGESTED_PACKAGES[level] ?? SUGGESTED_PACKAGES["L2"];
  const activeKeys = org.packages.map((p) => p.packageKey);
  const toAdd = suggested.filter((s) => !activeKeys.includes(s.key));

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Package className="h-5 w-5 text-primary" />
            Package Assignment Preview
          </DialogTitle>
          <p className="text-sm text-muted-foreground mt-1">
            Dry-run for{" "}
            <span className="font-medium text-foreground">{org.name}</span>. No changes are applied automatically.
          </p>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div>
            <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
              Current packages ({org.packages.length})
            </div>
            {org.packages.length === 0 ? (
              <p className="text-sm text-muted-foreground">None assigned</p>
            ) : (
              <div className="space-y-1">
                {org.packages.map((pkg) => (
                  <div key={pkg.packageId} className="flex items-center gap-2 text-sm">
                    <Check className="h-4 w-4 text-green-600 shrink-0" />
                    <Badge variant="outline" className={cn("text-[10px]", frameworkColor(pkg.frameworkShortName))}>
                      {pkg.frameworkShortName}
                    </Badge>
                    <span>{pkg.packageName}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div>
            <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
              Suggested packages to add ({toAdd.length})
            </div>
            {toAdd.length === 0 ? (
              <div className="flex items-center gap-2 text-sm text-green-700">
                <Check className="h-4 w-4" />
                All recommended packages are already assigned.
              </div>
            ) : (
              <div className="space-y-2">
                {toAdd.map((pkg) => (
                  <div key={pkg.key} className="rounded-md border border-border/60 p-2.5">
                    <div className="font-medium text-sm">{pkg.name}</div>
                    <div className="text-xs text-muted-foreground mt-0.5">{pkg.reason}</div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {toAdd.length > 0 && (
            <div className="rounded-lg bg-amber-50 border border-amber-200 p-3 text-sm text-amber-800">
              <p className="font-medium mb-1">To apply this assignment:</p>
              <ol className="list-decimal list-inside space-y-1 text-xs">
                <li>
                  Navigate to{" "}
                  <Link href="/settings/packages" className="underline">
                    Settings → Compliance Packages
                  </Link>{" "}
                  while {org.name} is the active org
                </li>
                <li>Click "Add Package" and select the packages above</li>
              </ol>
              <p className="text-xs mt-2 text-amber-700">
                No automatic migration is applied from this tool. Admin review is required before assigning packages.
              </p>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function AdminPackageMigration() {
  const { user } = useAuth();
  const [previewOrg, setPreviewOrg] = useState<OrgPackageStatus | null>(null);

  const { data: orgs = [], isLoading } = useQuery<OrgPackageStatus[]>({
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

  if (user?.role !== "admin") {
    return (
      <div className="space-y-4">
        <h1 className="text-3xl font-bold">Package Migration Tool</h1>
        <p className="text-muted-foreground">Admin access required.</p>
      </div>
    );
  }

  const unassignedOrgs = orgs.filter((o) => o.isActive && o.packages.length === 0);
  const assignedOrgs = orgs.filter((o) => o.isActive && o.packages.length > 0);

  return (
    <div className="space-y-6 max-w-5xl">
      <div>
        <h1 className="text-3xl font-bold">Package Migration Tool</h1>
        <p className="text-muted-foreground mt-1">
          Review existing organizations and assign compliance packages. This is a read-only dry-run tool — no changes
          are applied automatically.
        </p>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-4 text-center">
            <div className="text-2xl font-bold">{orgs.filter((o) => o.isActive).length}</div>
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
              Organizations without compliance packages assigned will default to showing all CMMC controls.
              Use the Preview button to see suggested packages for each org.
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
                {orgs.filter((o) => o.isActive).length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-muted-foreground py-10">
                      No organizations found.
                    </TableCell>
                  </TableRow>
                ) : (
                  orgs.filter((o) => o.isActive).map((org) => (
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
                            <Badge variant="outline" className="text-[9px] border-amber-400/60 text-amber-600 bg-amber-50">
                              TEST
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        {org.cmmcTargetLevel ? (
                          <Badge variant="outline" className="text-[11px] bg-purple-50 text-purple-700 border-purple-200">
                            {org.cmmcTargetLevel}
                          </Badge>
                        ) : (
                          <span className="text-muted-foreground text-xs">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {org.inferredLevel ? (
                          <Badge variant="outline" className={cn("text-[10px]", org.inferredLevel === "L2" ? "bg-purple-50 text-purple-700 border-purple-200" : "bg-slate-50 text-slate-600 border-slate-200")}>
                            {org.inferredLevel} (from pkgs)
                          </Badge>
                        ) : (
                          <span className="text-muted-foreground text-xs">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <span className={cn("text-sm font-medium tabular-nums", org.assessedControlCount === 0 ? "text-muted-foreground" : "")}>
                          {org.assessedControlCount}
                        </span>
                        <span className="text-xs text-muted-foreground ml-1">controls</span>
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
                                className={cn("text-[10px] px-1.5 py-0", frameworkColor(pkg.frameworkShortName))}
                              >
                                {pkg.frameworkShortName}
                              </Badge>
                            ))
                          )}
                          {org.packages.length > 3 && (
                            <span className="text-xs text-muted-foreground">+{org.packages.length - 3} more</span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        {org.packages.length === 0 ? (
                          <Badge variant="outline" className="text-[10px] bg-amber-50 text-amber-700 border-amber-200">
                            Unassigned
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-[10px] bg-green-50 text-green-700 border-green-200">
                            <Check className="h-3 w-3 mr-0.5" />
                            Assigned
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setPreviewOrg(org)}
                          className="text-xs h-7"
                        >
                          <ShieldCheck className="h-3.5 w-3.5 mr-1" />
                          Preview
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

      <div className="rounded-lg border border-border/60 bg-muted/20 p-4 text-sm text-muted-foreground">
        <p className="font-medium text-foreground mb-1">How to use this tool</p>
        <p>
          Click <strong>Preview</strong> next to any organization to see a dry-run of suggested package assignments
          based on the org's CMMC target level. The preview shows which packages are recommended and why — but
          does not make any changes. To assign packages, use{" "}
          <Link href="/settings/packages" className="text-primary hover:underline">
            Settings → Compliance Packages
          </Link>{" "}
          while the target organization is active.
        </p>
      </div>

      {previewOrg && (
        <PreviewModal org={previewOrg} onClose={() => setPreviewOrg(null)} />
      )}
    </div>
  );
}
