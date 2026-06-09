import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetSecurityCenter,
  useUpdateSecuritySettings,
  useMfaReset,
  useUnlockUser,
} from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  ShieldCheck,
  ShieldAlert,
  ShieldOff,
  Users,
  Lock,
  Unlock,
  RefreshCw,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Activity,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth";
import { useLocation } from "wouter";

const ENFORCEMENT_OPTIONS = [
  { value: "disabled", label: "Disabled", description: "MFA is not required for any user" },
  { value: "admins_only", label: "Admins Only", description: "Required for Global Admin role only" },
  { value: "privileged", label: "Privileged Roles", description: "Required for Admin, Compliance Manager, and Reviewer" },
  { value: "all_users", label: "All Users", description: "Required for every account" },
] as const;

function roleLabel(role: string) {
  return role.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
}

function formatDate(d: string | null | undefined) {
  if (!d) return "—";
  return new Date(d).toLocaleString(undefined, {
    month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
  });
}

function actionLabel(action: string) {
  return action.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
}

function actionBadgeColor(action: string) {
  if (action.includes("fail") || action.includes("lock")) return "destructive";
  if (action.includes("success") || action.includes("enabled") || action.includes("unlocked")) return "default";
  if (action.includes("reset") || action.includes("disabled")) return "secondary";
  return "outline";
}

export default function SecurityCenter() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const qc = useQueryClient();

  if (user?.role !== "admin") {
    setLocation("/");
    return null;
  }

  const { data, isLoading, refetch } = useGetSecurityCenter();
  const updateSettingsMutation = useUpdateSecuritySettings();
  const mfaResetMutation = useMfaReset();
  const unlockMutation = useUnlockUser();

  const [enforcementMode, setEnforcementMode] = useState<string | null>(null);
  const [savingPolicy, setSavingPolicy] = useState(false);

  const currentMode = enforcementMode ?? data?.settings?.mfaEnforcementMode ?? "privileged";

  const handleSavePolicy = async () => {
    setSavingPolicy(true);
    try {
      await updateSettingsMutation.mutateAsync({ data: { mfaEnforcementMode: currentMode as any } });
      await refetch();
      setEnforcementMode(null);
      toast({ title: "MFA policy updated" });
    } catch {
      toast({ title: "Failed to update policy", variant: "destructive" });
    } finally {
      setSavingPolicy(false);
    }
  };

  const handleResetMfa = async (userId: string, userName: string) => {
    try {
      await mfaResetMutation.mutateAsync({ data: { userId } });
      await refetch();
      qc.invalidateQueries({ queryKey: ["listUsers"] });
      toast({ title: `MFA reset for ${userName}. They must re-enroll on next login.` });
    } catch {
      toast({ title: "Failed to reset MFA", variant: "destructive" });
    }
  };

  const handleUnlock = async (userId: string, userName: string) => {
    try {
      await unlockMutation.mutateAsync({ data: { userId } });
      await refetch();
      toast({ title: `Account unlocked for ${userName}` });
    } catch {
      toast({ title: "Failed to unlock account", variant: "destructive" });
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  const stats = data?.stats;
  const enrollmentPct = stats && stats.totalUsers > 0
    ? Math.round((stats.enrolledCount / stats.totalUsers) * 100)
    : 0;

  return (
    <div className="p-6 space-y-6 max-w-6xl">
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <ShieldCheck className="h-6 w-6 text-primary" />
          Security Center
        </h1>
        <p className="text-muted-foreground text-sm mt-1">
          Manage MFA policy, monitor account security, and respond to security events.
        </p>
      </div>

      {/* MFA Adoption Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-5">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-blue-50 p-2">
                <Users className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <div className="text-2xl font-bold">{stats?.totalUsers ?? 0}</div>
                <div className="text-xs text-muted-foreground">Total Active Users</div>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-green-50 p-2">
                <ShieldCheck className="h-5 w-5 text-green-600" />
              </div>
              <div>
                <div className="text-2xl font-bold">{stats?.enrolledCount ?? 0}</div>
                <div className="text-xs text-muted-foreground">MFA Enrolled ({enrollmentPct}%)</div>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-amber-50 p-2">
                <ShieldAlert className="h-5 w-5 text-amber-600" />
              </div>
              <div>
                <div className="text-2xl font-bold">{stats?.notEnrolledCount ?? 0}</div>
                <div className="text-xs text-muted-foreground">Not Enrolled</div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* MFA Policy */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <ShieldCheck className="h-4 w-4" />
            MFA Enforcement Policy
          </CardTitle>
          <CardDescription>
            Control which users are required to enroll in multi-factor authentication.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {ENFORCEMENT_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => setEnforcementMode(opt.value)}
                className={cn(
                  "text-left rounded-lg border p-4 transition-colors",
                  currentMode === opt.value
                    ? "border-primary bg-primary/5 ring-1 ring-primary"
                    : "hover:border-muted-foreground/40 hover:bg-muted/30"
                )}
              >
                <div className="font-medium text-sm">{opt.label}</div>
                <div className="text-xs text-muted-foreground mt-0.5">{opt.description}</div>
              </button>
            ))}
          </div>
          {enforcementMode && enforcementMode !== data?.settings?.mfaEnforcementMode && (
            <div className="flex items-center gap-3 pt-2">
              <Button onClick={handleSavePolicy} disabled={savingPolicy} size="sm">
                {savingPolicy ? "Saving…" : "Save Policy"}
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setEnforcementMode(null)}>
                Cancel
              </Button>
            </div>
          )}
          <div className="text-xs text-muted-foreground pt-1">
            Current: <span className="font-medium">{ENFORCEMENT_OPTIONS.find(o => o.value === data?.settings?.mfaEnforcementMode)?.label ?? "—"}</span>
            {" · "}Max failed attempts: <span className="font-medium">{data?.settings?.maxFailedLoginAttempts ?? 5}</span>
            {" · "}Lockout: <span className="font-medium">{data?.settings?.lockoutDurationMinutes ?? 15} min</span>
          </div>
        </CardContent>
      </Card>

      {/* Privileged users without MFA */}
      {(data?.privilegedWithoutMfa?.length ?? 0) > 0 && (
        <Card className="border-amber-200 bg-amber-50/30">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base text-amber-800">
              <AlertTriangle className="h-4 w-4 text-amber-600" />
              Privileged Users Without MFA
            </CardTitle>
            <CardDescription>
              These users have elevated roles but have not enrolled in MFA.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data?.privilegedWithoutMfa?.map((u) => (
                  <TableRow key={u.id}>
                    <TableCell className="font-medium">{u.name}</TableCell>
                    <TableCell className="text-muted-foreground">{u.email}</TableCell>
                    <TableCell><Badge variant="secondary">{roleLabel(u.role)}</Badge></TableCell>
                    <TableCell className="text-right">
                      <Button variant="outline" size="sm" onClick={() => handleResetMfa(u.id, u.name)}>
                        Force Re-enrollment
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Locked Accounts */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Lock className="h-4 w-4" />
            Locked Accounts
          </CardTitle>
          <CardDescription>
            Accounts currently locked due to repeated failed login attempts.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {(data?.lockedAccounts?.length ?? 0) === 0 ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground py-3">
              <CheckCircle2 className="h-4 w-4 text-green-500" />
              No accounts are currently locked.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Locked Until</TableHead>
                  <TableHead>Failed Attempts</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data?.lockedAccounts?.map((u) => (
                  <TableRow key={u.id}>
                    <TableCell className="font-medium">{u.name}</TableCell>
                    <TableCell className="text-muted-foreground">{u.email}</TableCell>
                    <TableCell><Badge variant="secondary">{roleLabel(u.role)}</Badge></TableCell>
                    <TableCell className="text-sm">{formatDate(u.lockedUntil)}</TableCell>
                    <TableCell>
                      <Badge variant="destructive">{u.failedLoginCount}</Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="outline"
                        size="sm"
                        className="gap-1.5"
                        onClick={() => handleUnlock(u.id, u.name)}
                      >
                        <Unlock className="h-3.5 w-3.5" />
                        Unlock
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Recent Security Events */}
      <Card>
        <CardHeader className="flex flex-row items-start justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <Activity className="h-4 w-4" />
              Recent Security Events
            </CardTitle>
            <CardDescription>Last 50 authentication and MFA-related audit events.</CardDescription>
          </div>
          <Button variant="ghost" size="icon" onClick={() => refetch()} title="Refresh">
            <RefreshCw className="h-4 w-4" />
          </Button>
        </CardHeader>
        <CardContent>
          {(data?.recentEvents?.length ?? 0) === 0 ? (
            <p className="text-sm text-muted-foreground py-3">No recent security events.</p>
          ) : (
            <div className="space-y-2">
              {data?.recentEvents?.map((evt: any) => (
                <div key={evt.id} className="flex items-start gap-3 py-2 border-b last:border-0">
                  <div className="shrink-0 mt-0.5">
                    {evt.action?.includes("fail") || evt.action?.includes("lock") ? (
                      <XCircle className="h-4 w-4 text-red-500" />
                    ) : evt.action?.includes("success") || evt.action?.includes("enabled") || evt.action?.includes("logged_in") ? (
                      <CheckCircle2 className="h-4 w-4 text-green-500" />
                    ) : (
                      <Activity className="h-4 w-4 text-muted-foreground" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge variant={actionBadgeColor(evt.action ?? "") as any} className="text-xs">
                        {actionLabel(evt.action ?? "")}
                      </Badge>
                      <span className="text-sm font-medium truncate">{evt.userName ?? "System"}</span>
                      {evt.entityLabel && evt.entityLabel !== evt.userName && (
                        <span className="text-xs text-muted-foreground truncate">→ {evt.entityLabel}</span>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      {formatDate(evt.timestamp)}
                      {evt.ipAddress && <span className="ml-2">from {evt.ipAddress}</span>}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
