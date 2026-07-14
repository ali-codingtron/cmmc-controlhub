import { useState, useMemo, useEffect } from "react";
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
  Check,
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
import { useListPackages } from "@workspace/api-client-react";

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

interface CompliancePkg {
  id: string;
  frameworkId?: string | null;
  frameworkName?: string | null;
  frameworkShortName?: string | null;
  packageKey?: string | null;
  name: string;
  version?: string | null;
  description?: string | null;
  packageType?: string | null;
  controlCount?: number | null;
  sortOrder?: number | null;
}

const QUICK_START_PROFILES = [
  {
    id: "fci-only",
    label: "FCI Only",
    description: "Federal Contract Information — basic safeguarding under FAR 52.204-21",
    pkgIds: ["pkg-cmmc-l1-self", "pkg-far-52-204-21"],
  },
  {
    id: "dod-cui",
    label: "DoD CUI Contractor",
    description: "Handles CUI under DoD contracts — CMMC L2, NIST 800-171 r2, and DFARS 7012",
    pkgIds: ["pkg-cmmc-l2-self", "pkg-nist-800-171-r2", "pkg-dfars-7012"],
  },
  {
    id: "nist-readiness",
    label: "NIST Readiness",
    description: "NIST 800-171 assessment prep — control framework and assessment procedures",
    pkgIds: ["pkg-nist-800-171-r2", "pkg-nist-800-171a-r2"],
  },
  {
    id: "dfars-full",
    label: "DFARS Contract Support",
    description: "Full DFARS suite — all four DFARS clauses plus CMMC L2 and NIST 800-171",
    pkgIds: ["pkg-cmmc-l2-self", "pkg-nist-800-171-r2", "pkg-dfars-7012", "pkg-dfars-7019", "pkg-dfars-7020", "pkg-dfars-7021"],
  },
] as const;

function fwBadgeColor(shortName?: string | null): string {
  switch (shortName) {
    case "CMMC": return "bg-purple-50 text-purple-700 border-purple-200";
    case "NIST 800-171":
    case "NIST 800-171A": return "bg-blue-50 text-blue-700 border-blue-200";
    case "DFARS": return "bg-amber-50 text-amber-700 border-amber-200";
    case "FAR": return "bg-slate-50 text-slate-600 border-slate-200";
    default: return "bg-slate-100 text-slate-600 border-slate-200";
  }
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

function OrgCreationWizard({ open, onClose, onSuccess }: { open: boolean; onClose: () => void; onSuccess?: () => void }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [step, setStep] = useState(1);

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
  });

  const [ctx, setCtx] = useState({
    handlesFci: false,
    handlesCui: false,
    isDodContractor: false,
    hasDfars7012: false,
  });

  const [selectedPkgIds, setSelectedPkgIds] = useState<string[]>([]);
  const [autoApplied, setAutoApplied] = useState(false);
  const [activeProfile, setActiveProfile] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const { data: allPackages = [], isLoading: pkgLoading } = useListPackages(
    undefined,
    { query: { enabled: open } as any }
  );

  const recommendedIds = useMemo(() => {
    const ids = new Set<string>();
    if (ctx.handlesFci && !ctx.handlesCui && !ctx.isDodContractor) {
      ids.add("pkg-cmmc-l1-self");
      ids.add("pkg-far-52-204-21");
    }
    if (ctx.handlesFci && (ctx.isDodContractor || ctx.handlesCui)) {
      ids.add("pkg-cmmc-l1-self");
    }
    if (ctx.handlesCui) {
      ids.add("pkg-cmmc-l2-self");
      ids.add("pkg-nist-800-171-r2");
    }
    if ((ctx.isDodContractor && ctx.handlesCui) || ctx.hasDfars7012) {
      ["pkg-dfars-7012", "pkg-dfars-7019", "pkg-dfars-7020", "pkg-dfars-7021"].forEach(id => ids.add(id));
      ids.add("pkg-cmmc-l2-self");
      ids.add("pkg-nist-800-171-r2");
    }
    return Array.from(ids);
  }, [ctx]);

  useEffect(() => {
    if (step === 3 && !autoApplied && allPackages.length > 0) {
      setSelectedPkgIds(recommendedIds.filter(id => allPackages.some((p: CompliancePkg) => p.id === id)));
      setAutoApplied(true);
    }
  }, [step, allPackages.length, autoApplied, recommendedIds]);

  useEffect(() => {
    if (step <= 2) setAutoApplied(false);
  }, [ctx, step]);

  const grouped = useMemo(() => {
    const map = new Map<string, CompliancePkg[]>();
    for (const pkg of allPackages as CompliancePkg[]) {
      const key = pkg.frameworkShortName ?? "Other";
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(pkg);
    }
    return Array.from(map.entries());
  }, [allPackages]);

  const selectedPkgs = (allPackages as CompliancePkg[]).filter(p => selectedPkgIds.includes(p.id));
  const totalControlCount = selectedPkgs
    .filter(p => p.packageType === "control_framework")
    .reduce((s, p) => s + (p.controlCount ?? 0), 0);

  const handleCreate = async () => {
    if (!form.name.trim()) return;
    setCreating(true);
    try {
      const token = localStorage.getItem("auth_token");
      const base = (import.meta.env.BASE_URL ?? "").replace(/\/$/, "");

      const orgRes = await fetch(`${base}/api/organizations`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(form),
      });
      if (!orgRes.ok) {
        const errData = await orgRes.json().catch(() => ({}));
        throw new Error(errData.error ?? "Failed to create organization");
      }
      const newOrg = await orgRes.json();

      if (selectedPkgIds.length > 0) {
        const pkgRes = await fetch(`${base}/api/organizations/${newOrg.id}/packages`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ packageIds: selectedPkgIds }),
        });
        if (!pkgRes.ok) {
          const errData = await pkgRes.json().catch(() => ({}));
          throw new Error(errData.error ?? "Organization created but packages could not be assigned. You can add them later in Settings.");
        }
      }

      toast({
        title: "Organization created",
        description: selectedPkgIds.length > 0
          ? `${selectedPkgIds.length} compliance package${selectedPkgIds.length !== 1 ? "s" : ""} assigned`
          : undefined,
      });
      queryClient.invalidateQueries({ queryKey: ["global-stats"] });
      onSuccess?.();
      handleClose();
    } catch (err: any) {
      toast({ title: "Error", description: err.message ?? "Could not create organization", variant: "destructive" });
    } finally {
      setCreating(false);
    }
  };

  const handleClose = () => {
    setStep(1);
    setForm({ name: "", legalName: "", shortName: "", cageCode: "", uei: "", industry: "", primaryContact: "", cmmcTargetLevel: "L2", organizationAddress: "", assessmentScope: "" });
    setCtx({ handlesFci: false, handlesCui: false, isDodContractor: false, hasDfars7012: false });
    setSelectedPkgIds([]);
    setAutoApplied(false);
    setActiveProfile(null);
    onClose();
  };

  const STEP_TITLES = [
    "Organization Profile",
    "Contract & Data Context",
    "Compliance Package Selection",
    "Review Summary",
    "Confirm & Create",
  ];

  const contextQuestions = [
    {
      key: "handlesFci" as const,
      label: "Handles Federal Contract Information (FCI)",
      desc: "Receives or processes information provided by the federal government under a contract, not intended for public release.",
    },
    {
      key: "handlesCui" as const,
      label: "Handles Controlled Unclassified Information (CUI)",
      desc: "Processes, stores, or transmits information designated as CUI — including technical data, export-controlled info, or personally identifiable information.",
    },
    {
      key: "isDodContractor" as const,
      label: "Active DoD Prime or Subcontractor",
      desc: "Holds or performs work under active Department of Defense contracts or subcontracts.",
    },
    {
      key: "hasDfars7012" as const,
      label: "Contract Includes DFARS 252.204-7012",
      desc: "DoD contracts explicitly include the DFARS 252.204-7012 clause (Safeguarding Covered Defense Information).",
    },
  ];

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl flex flex-col overflow-hidden" style={{ maxHeight: "90vh" }}>
        <DialogHeader className="shrink-0 pb-2">
          <div className="flex items-center gap-1.5 mb-3">
            {[1, 2, 3, 4, 5].map(n => (
              <div
                key={n}
                className={cn(
                  "h-1 flex-1 rounded-full transition-all duration-300",
                  n <= step ? "bg-primary" : "bg-muted"
                )}
              />
            ))}
          </div>
          <div className="text-xs font-medium text-muted-foreground">Step {step} of 5</div>
          <DialogTitle className="text-lg">{STEP_TITLES[step - 1]}</DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto min-h-0 pr-1">
          {step === 1 && (
            <div className="space-y-4 py-1">
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <Label>Organization Name <span className="text-destructive">*</span></Label>
                  <Input
                    value={form.name}
                    onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                    placeholder="Apex Defense LLC"
                    autoFocus
                  />
                </div>
                <div>
                  <Label>Legal Name</Label>
                  <Input value={form.legalName} onChange={e => setForm(f => ({ ...f, legalName: e.target.value }))} placeholder="Full legal entity name" />
                </div>
                <div>
                  <Label>Short Name</Label>
                  <Input value={form.shortName} onChange={e => setForm(f => ({ ...f, shortName: e.target.value }))} placeholder="Apex" />
                </div>
                <div>
                  <Label>CAGE Code</Label>
                  <Input value={form.cageCode} onChange={e => setForm(f => ({ ...f, cageCode: e.target.value }))} placeholder="1ABC2" />
                </div>
                <div>
                  <Label>UEI</Label>
                  <Input value={form.uei} onChange={e => setForm(f => ({ ...f, uei: e.target.value }))} placeholder="Unique Entity Identifier" />
                </div>
                <div>
                  <Label>Industry</Label>
                  <Input value={form.industry} onChange={e => setForm(f => ({ ...f, industry: e.target.value }))} placeholder="Aerospace & Defense" />
                </div>
                <div>
                  <Label>CMMC Target Level</Label>
                  <Select value={form.cmmcTargetLevel} onValueChange={v => setForm(f => ({ ...f, cmmcTargetLevel: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="L1">Level 1 (FCI only)</SelectItem>
                      <SelectItem value="L2">Level 2 (CUI)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="col-span-2">
                  <Label>Primary Contact</Label>
                  <Input value={form.primaryContact} onChange={e => setForm(f => ({ ...f, primaryContact: e.target.value }))} placeholder="Contact name and title" />
                </div>
                <div className="col-span-2">
                  <Label>Organization Address</Label>
                  <Input value={form.organizationAddress} onChange={e => setForm(f => ({ ...f, organizationAddress: e.target.value }))} placeholder="Street, City, State ZIP" />
                </div>
                <div className="col-span-2">
                  <Label>Assessment Scope</Label>
                  <Input value={form.assessmentScope} onChange={e => setForm(f => ({ ...f, assessmentScope: e.target.value }))} placeholder="Brief description of systems in scope" />
                </div>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-3 py-1">
              <p className="text-sm text-muted-foreground">
                Answer a few quick questions about this organization's data and contracts. We'll use your answers to recommend the right compliance packages on the next step.
              </p>
              {contextQuestions.map(({ key, label, desc }) => (
                <button
                  key={key}
                  type="button"
                  className={cn(
                    "w-full text-left rounded-lg border p-4 transition-all",
                    ctx[key]
                      ? "border-primary bg-primary/5"
                      : "border-border hover:border-primary/40 hover:bg-muted/30"
                  )}
                  onClick={() => setCtx(c => ({ ...c, [key]: !c[key] }))}
                >
                  <div className="flex items-start gap-3">
                    <div className={cn(
                      "mt-0.5 w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 transition-colors",
                      ctx[key] ? "border-primary bg-primary" : "border-border bg-background"
                    )}>
                      {ctx[key] && <Check className="h-3 w-3 text-primary-foreground" strokeWidth={3} />}
                    </div>
                    <div>
                      <div className="font-medium text-sm">{label}</div>
                      <div className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{desc}</div>
                    </div>
                  </div>
                </button>
              ))}
              {!ctx.handlesFci && !ctx.handlesCui && !ctx.isDodContractor && (
                <p className="text-xs text-muted-foreground italic pt-1">
                  You can proceed without selecting any options and choose packages manually, or skip packages and add them later in Settings.
                </p>
              )}
            </div>
          )}

          {step === 3 && (
            <div className="space-y-5 py-1">
              {/* Quick Start profiles */}
              <div>
                <div className="text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-2">Quick Start Profile</div>
                <div className="grid grid-cols-2 gap-2">
                  {QUICK_START_PROFILES.map(profile => {
                    const isActive = activeProfile === profile.id;
                    const availableIds = profile.pkgIds.filter(id =>
                      allPackages.some((p: CompliancePkg) => p.id === id)
                    );
                    return (
                      <button
                        key={profile.id}
                        type="button"
                        className={cn(
                          "text-left rounded-lg border p-3 transition-all",
                          isActive
                            ? "border-primary bg-primary/5 ring-1 ring-primary/30"
                            : "border-border hover:border-primary/40 hover:bg-muted/20"
                        )}
                        onClick={() => {
                          if (isActive) {
                            setActiveProfile(null);
                            setSelectedPkgIds([]);
                          } else {
                            setActiveProfile(profile.id);
                            setSelectedPkgIds(availableIds);
                          }
                        }}
                      >
                        <div className="flex items-start gap-2">
                          <div className={cn(
                            "mt-0.5 w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors",
                            isActive ? "border-primary bg-primary" : "border-border bg-background"
                          )}>
                            {isActive && <Check className="h-2.5 w-2.5 text-primary-foreground" strokeWidth={3} />}
                          </div>
                          <div>
                            <div className="text-sm font-semibold leading-tight">{profile.label}</div>
                            <div className="text-[11px] text-muted-foreground mt-0.5 leading-relaxed">{profile.description}</div>
                            <div className="text-[10px] text-primary mt-1">{availableIds.length} package{availableIds.length !== 1 ? "s" : ""}</div>
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
                {activeProfile && (
                  <button
                    type="button"
                    className="mt-1.5 text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
                    onClick={() => { setActiveProfile(null); }}
                  >
                    Clear profile — customize manually below
                  </button>
                )}
              </div>

              {recommendedIds.length > 0 && !activeProfile && (
                <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 text-sm">
                  <span className="font-semibold text-primary">
                    {recommendedIds.filter(id => allPackages.some((p: CompliancePkg) => p.id === id)).length} package{recommendedIds.filter(id => allPackages.some((p: CompliancePkg) => p.id === id)).length !== 1 ? "s" : ""} recommended
                  </span>
                  <span className="text-muted-foreground"> based on your Step 2 answers. Customize below.</span>
                </div>
              )}

              {pkgLoading ? (
                <div className="space-y-3">
                  {[1, 2, 3].map(i => <div key={i} className="h-20 animate-pulse bg-muted rounded-lg" />)}
                </div>
              ) : (
                <div className="space-y-5">
                  <div className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">Individual Packages</div>
                  {grouped.map(([framework, pkgs]) => (
                    <div key={framework}>
                      <div className="text-[11px] font-medium text-muted-foreground mb-1.5">{framework}</div>
                      <div className="space-y-2">
                        {pkgs.map(pkg => {
                          const isSelected = selectedPkgIds.includes(pkg.id);
                          const isRecommended = recommendedIds.includes(pkg.id);
                          return (
                            <button
                              key={pkg.id}
                              type="button"
                              className={cn(
                                "w-full text-left rounded-lg border p-3 transition-all",
                                isSelected
                                  ? "border-primary bg-primary/5"
                                  : "border-border hover:border-primary/40 hover:bg-muted/30"
                              )}
                              onClick={() => {
                                setActiveProfile(null);
                                setSelectedPkgIds(prev =>
                                  prev.includes(pkg.id)
                                    ? prev.filter(id => id !== pkg.id)
                                    : [...prev, pkg.id]
                                );
                              }}
                            >
                              <div className="flex items-start gap-3">
                                <div className={cn(
                                  "mt-0.5 w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 transition-colors",
                                  isSelected ? "border-primary bg-primary" : "border-border bg-background"
                                )}>
                                  {isSelected && <Check className="h-3 w-3 text-primary-foreground" strokeWidth={3} />}
                                </div>
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <span className="text-sm font-medium">{pkg.name}</span>
                                    {pkg.version && <span className="text-xs text-muted-foreground">{pkg.version}</span>}
                                    {isRecommended && (
                                      <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-amber-100 text-amber-700 border border-amber-200">
                                        ★ Recommended
                                      </span>
                                    )}
                                  </div>
                                  <div className="text-xs text-muted-foreground mt-0.5 line-clamp-2 leading-relaxed">{pkg.description}</div>
                                  {pkg.controlCount != null && (
                                    <div className="text-[10px] text-muted-foreground mt-1.5">{pkg.controlCount} controls/requirements</div>
                                  )}
                                </div>
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <p className="text-xs text-muted-foreground">
                {selectedPkgIds.length === 0
                  ? "No packages selected — you can proceed without packages and add them later in Settings."
                  : `${selectedPkgIds.length} package${selectedPkgIds.length !== 1 ? "s" : ""} selected.`}
              </p>
            </div>
          )}

          {step === 4 && (
            <div className="space-y-5 py-1">
              <div className="rounded-lg border border-border bg-muted/20 p-4 space-y-3">
                <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Organization Details</div>
                <div className="space-y-2 text-sm divide-y divide-border/50">
                  <div className="flex justify-between gap-2 py-1.5">
                    <span className="text-muted-foreground">Name</span>
                    <span className="font-medium">{form.name}</span>
                  </div>
                  {form.shortName && (
                    <div className="flex justify-between gap-2 py-1.5">
                      <span className="text-muted-foreground">Short Name</span>
                      <span>{form.shortName}</span>
                    </div>
                  )}
                  <div className="flex justify-between gap-2 py-1.5">
                    <span className="text-muted-foreground">CMMC Target Level</span>
                    <span className="font-medium">Level {form.cmmcTargetLevel?.replace("L", "")}</span>
                  </div>
                  {form.industry && (
                    <div className="flex justify-between gap-2 py-1.5">
                      <span className="text-muted-foreground">Industry</span>
                      <span>{form.industry}</span>
                    </div>
                  )}
                  {form.primaryContact && (
                    <div className="flex justify-between gap-2 py-1.5">
                      <span className="text-muted-foreground">Primary Contact</span>
                      <span>{form.primaryContact}</span>
                    </div>
                  )}
                </div>
              </div>

              <div>
                <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                  Compliance Packages — {selectedPkgIds.length} selected
                </div>
                {selectedPkgIds.length === 0 ? (
                  <div className="rounded-lg border border-dashed border-border p-4 text-center">
                    <p className="text-sm text-muted-foreground">
                      No packages selected — you can add packages later in Settings &gt; Compliance Packages.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {selectedPkgs.map(pkg => (
                      <div key={pkg.id} className="flex items-center justify-between gap-2 p-2.5 rounded-md border border-border/60 bg-muted/20">
                        <div className="flex items-center gap-2 min-w-0">
                          <Badge variant="outline" className={cn("text-[10px] px-1.5 py-0 shrink-0", fwBadgeColor(pkg.frameworkShortName))}>
                            {pkg.frameworkShortName}
                          </Badge>
                          <span className="text-sm font-medium truncate">{pkg.name}</span>
                          {pkg.version && <span className="text-xs text-muted-foreground shrink-0">{pkg.version}</span>}
                        </div>
                        {pkg.controlCount != null && (
                          <span className="text-xs text-muted-foreground shrink-0">{pkg.controlCount} req.</span>
                        )}
                      </div>
                    ))}
                    {totalControlCount > 0 && (
                      <div className="text-xs text-muted-foreground pt-1 text-right">
                        Control framework scope: <span className="font-semibold text-foreground">{totalControlCount} requirements</span>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Compliance impact summary */}
              {selectedPkgIds.length > 0 && (
                <div>
                  <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                    What will be provisioned
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    {totalControlCount > 0 && (
                      <div className="rounded-md border border-border/60 bg-muted/20 p-3 text-center">
                        <div className="text-2xl font-bold text-foreground">{totalControlCount}</div>
                        <div className="text-xs text-muted-foreground mt-0.5">controls to assess</div>
                      </div>
                    )}
                    <div className="rounded-md border border-border/60 bg-muted/20 p-3 text-center">
                      <div className="text-2xl font-bold text-foreground">19</div>
                      <div className="text-xs text-muted-foreground mt-0.5">monitoring items</div>
                    </div>
                    {selectedPkgs.some(p => p.packageType === "assessment_procedure") && (
                      <div className="rounded-md border border-border/60 bg-muted/20 p-3 text-center">
                        <div className="text-2xl font-bold text-foreground">
                          {selectedPkgs.filter(p => p.packageType === "assessment_procedure").reduce((s, p) => s + (p.controlCount ?? 0), 0)}
                        </div>
                        <div className="text-xs text-muted-foreground mt-0.5">assessment methods</div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Overlap callout */}
              {selectedPkgIds.includes("pkg-cmmc-l2-self") && selectedPkgIds.includes("pkg-nist-800-171-r2") && (
                <div className="rounded-lg border border-blue-200 bg-blue-50 dark:bg-blue-950/20 dark:border-blue-800 p-3 text-xs text-blue-800 dark:text-blue-300">
                  <p className="font-semibold mb-0.5">CMMC L2 ↔ NIST 800-171 overlap</p>
                  <p>CMMC Level 2 and NIST 800-171 r2 cover the same 110 security requirements. Assessments and evidence submitted for one will count toward both — reducing your compliance workload.</p>
                </div>
              )}

              {selectedPkgs.some(p => p.frameworkShortName === "DFARS") && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-800 p-3 text-xs text-amber-800 dark:text-amber-300">
                  <p className="font-semibold mb-0.5">DFARS clause obligations included</p>
                  <p>DFARS packages carry contractual obligations: 72-hour cyber incident reporting, subcontractor flowdown, and SSP/POA&amp;M maintenance. These will be pre-loaded as monitoring items.</p>
                </div>
              )}
            </div>
          )}

          {step === 5 && (
            <div className="space-y-6 py-4">
              <div className="flex flex-col items-center text-center gap-3 py-2">
                <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center">
                  <Building2 className="h-7 w-7 text-primary" />
                </div>
                <div>
                  <h3 className="text-xl font-bold">{form.name}</h3>
                  <div className="flex items-center justify-center gap-2 mt-2 flex-wrap">
                    <Badge variant="outline">CMMC Level {form.cmmcTargetLevel?.replace("L", "")}</Badge>
                    {selectedPkgIds.length > 0 && (
                      <Badge variant="outline">{selectedPkgIds.length} package{selectedPkgIds.length !== 1 ? "s" : ""}</Badge>
                    )}
                    {form.industry && <Badge variant="outline">{form.industry}</Badge>}
                  </div>
                </div>
              </div>

              <div className="rounded-lg border border-border divide-y divide-border text-sm">
                <div className="flex justify-between gap-2 px-4 py-3">
                  <span className="text-muted-foreground">Organization name</span>
                  <span className="font-medium">{form.name}</span>
                </div>
                {form.shortName && (
                  <div className="flex justify-between gap-2 px-4 py-3">
                    <span className="text-muted-foreground">Short name</span>
                    <span>{form.shortName}</span>
                  </div>
                )}
                <div className="flex justify-between gap-2 px-4 py-3">
                  <span className="text-muted-foreground">CMMC target level</span>
                  <span>Level {form.cmmcTargetLevel?.replace("L", "")}</span>
                </div>
                <div className="flex justify-between gap-2 px-4 py-3">
                  <span className="text-muted-foreground">Compliance packages</span>
                  <span>{selectedPkgIds.length === 0 ? "None (add later)" : `${selectedPkgIds.length} package${selectedPkgIds.length !== 1 ? "s" : ""}`}</span>
                </div>
              </div>

              <p className="text-xs text-muted-foreground text-center">
                Clicking "Create Organization" will provision this tenant and assign the selected compliance packages. You will be added as an administrator.
              </p>
            </div>
          )}
        </div>

        <DialogFooter className="shrink-0 pt-4 border-t mt-4">
          <Button
            type="button"
            variant="outline"
            onClick={step === 1 ? handleClose : () => setStep(s => s - 1)}
          >
            {step === 1 ? "Cancel" : "← Back"}
          </Button>
          {step < 5 ? (
            <Button
              onClick={() => setStep(s => s + 1)}
              disabled={step === 1 && !form.name.trim()}
            >
              Next →
            </Button>
          ) : (
            <Button
              onClick={handleCreate}
              disabled={creating || !form.name.trim()}
            >
              {creating ? "Creating..." : "Create Organization"}
            </Button>
          )}
        </DialogFooter>
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
    const contextOrg = orgs.find((o) => o.id === orgId);
    if (contextOrg) {
      setActiveOrg(contextOrg);
      toast({ title: `Switched to ${contextOrg.name}` });
      queryClient.invalidateQueries();
      return;
    }
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

      <OrgCreationWizard open={showNew} onClose={() => setShowNew(false)} onSuccess={refreshOrgs} />

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
