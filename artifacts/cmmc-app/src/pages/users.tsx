import { useState, useEffect } from "react";
import { useQueryClient, useQuery, useMutation } from "@tanstack/react-query";
import {
  useListUsers,
  getListUsersQueryKey,
  useCreateUser,
  useUpdateUser,
  useDeleteUser,
  useDeactivateUser,
  useActivateUser,
  useResetUserPassword,
  useGetUser,
  getGetUserQueryKey,
  useGetUserOrgs,
  getGetUserOrgsQueryKey,
  useGetUserOrganizationAccess,
  getGetUserOrganizationAccessQueryKey,
  useSaveUserOrganizationAccess,
  useGetUserEffectiveAccess,
  getGetUserEffectiveAccessQueryKey,
  useAddUserToOrg,
  useUpdateUserOrgMembership,
  useRemoveUserFromOrg,
  useListOrganizations,
  useMfaReset,
  useUnlockUser,
  useMfaRequireUser,
  useMfaDisable,
  useSendInvitation,
  useResendInvitation,
  useCancelInvitation,
} from "@workspace/api-client-react";
import type {
  User,
  UserDetail,
  UserOrgMembership,
  OrganizationSummary,
  OrganizationAccessState,
} from "@workspace/api-client-react";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Plus,
  MoreHorizontal,
  Pencil,
  Key,
  UserX,
  UserCheck,
  Trash2,
  Building2,
  X,
  Loader2,
  ShieldCheck,
  ShieldAlert,
  ChevronsUpDown,
  Mail,
  MailCheck,
  Copy,
  Check,
  AlertTriangle,
  RefreshCw,
  Ban,
  Link,
  Clock,
  UserPlus,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ─── Constants ────────────────────────────────────────────────────────────────

// Organization-specific roles. `global_admin` is deliberately absent — it is a
// PLATFORM role, not something granted through a membership.
const ORG_ROLES = [
  { value: "org_admin", label: "Organization Admin" },
  { value: "compliance_manager", label: "Compliance Manager" },
  { value: "it_contributor", label: "IT Contributor" },
  { value: "reviewer", label: "Reviewer" },
  { value: "executive_viewer", label: "Executive Viewer" },
  { value: "assessor", label: "Assessor Read-Only" },
] as const;

const ORG_STATUSES = [
  { value: "active", label: "Active" },
  { value: "invited", label: "Invited" },
  { value: "suspended", label: "Suspended" },
] as const;

// The only two platform roles. Everything else is organization-scoped.
const PLATFORM_ROLES = [
  { value: "none", label: "None — Organization Access Only" },
  { value: "global_admin", label: "Global Admin — All Organizations" },
] as const;

type PlatformRoleValue = (typeof PLATFORM_ROLES)[number]["value"];

/** Canonical platform role for a stored `users.role` value. */
function platformRoleOf(storedRole: string | null | undefined): PlatformRoleValue {
  return storedRole === "admin" || storedRole === "global_admin" ? "global_admin" : "none";
}

/** Short label for the Users table. Never a blank or ambiguous value. */
function platformRoleLabel(storedRole: string | null | undefined) {
  return platformRoleOf(storedRole) === "global_admin" ? "Global Admin" : "None";
}

function isGlobalAdminRole(storedRole: string | null | undefined) {
  return platformRoleOf(storedRole) === "global_admin";
}

function orgRoleLabel(role: string) {
  if (role === "global_admin") return "Global Admin";
  return ORG_ROLES.find((r) => r.value === role)?.label ?? role;
}

function orgStatusLabel(status: string) {
  return ORG_STATUSES.find((s) => s.value === status)?.label ?? status;
}

/** Legacy global roles that predate the platform/organization split. */
const LEGACY_GLOBAL_ROLES = [
  "compliance_manager",
  "it_contributor",
  "reviewer",
  "executive_viewer",
  "assessor",
];

function formatDate(d: string | null | undefined) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

// ─── User Form (edit only) ────────────────────────────────────────────────────

interface UserFormData {
  name: string;
  email: string;
  password: string;
  role: string;
  title: string;
  department: string;
}

function UserForm({
  data,
  onChange,
  isEdit,
  errors,
}: {
  data: UserFormData;
  onChange: (field: keyof UserFormData, value: string) => void;
  isEdit: boolean;
  errors: Partial<Record<keyof UserFormData, string>>;
}) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label htmlFor="uf-name">
            Full Name <span className="text-red-500">*</span>
          </Label>
          <Input
            id="uf-name"
            value={data.name}
            onChange={(e) => onChange("name", e.target.value)}
            placeholder="Enter full name"
            className={errors.name ? "border-red-500" : ""}
          />
          {errors.name && <p className="text-xs text-red-500">{errors.name}</p>}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="uf-email">
            Email <span className="text-red-500">*</span>
          </Label>
          <Input
            id="uf-email"
            type="email"
            value={data.email}
            onChange={(e) => onChange("email", e.target.value)}
            placeholder="name@company.com"
            className={errors.email ? "border-red-500" : ""}
          />
          {errors.email && <p className="text-xs text-red-500">{errors.email}</p>}
        </div>
      </div>

      {!isEdit && (
        <div className="space-y-1.5">
          <Label htmlFor="uf-password">
            Temporary Password <span className="text-red-500">*</span>
          </Label>
          <Input
            id="uf-password"
            type="password"
            value={data.password}
            onChange={(e) => onChange("password", e.target.value)}
            placeholder="Min. 8 characters"
            className={errors.password ? "border-red-500" : ""}
          />
          {errors.password && (
            <p className="text-xs text-red-500">{errors.password}</p>
          )}
        </div>
      )}

      <div className="space-y-1.5">
        <Label htmlFor="uf-platform-role">Platform Role</Label>
        {/* Stores the canonical platform role only. "None" is a real, explicit
            value — it is never a stand-in for an organization role. */}
        <Select
          value={platformRoleOf(data.role)}
          onValueChange={(v) => onChange("role", v)}
        >
          <SelectTrigger id="uf-platform-role" data-testid="select-platform-role">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PLATFORM_ROLES.map((r) => (
              <SelectItem key={r.value} value={r.value}>
                {r.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">
          <strong>Global Admin</strong> grants access to every organization and does not need
          organization memberships. <strong>None</strong> means access comes solely from the
          organizations assigned on the Organization Access tab.
        </p>
        {LEGACY_GLOBAL_ROLES.includes(data.role) && (
          <p className="text-xs text-amber-700">
            This account still carries the legacy global role
            "{data.role.replace(/_/g, " ")}". Saving with Platform Role = None replaces it with
            organization-based access.
          </p>
        )}
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label htmlFor="uf-title">Title</Label>
          <Input
            id="uf-title"
            value={data.title}
            onChange={(e) => onChange("title", e.target.value)}
            placeholder="Enter job title"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="uf-dept">Department</Label>
          <Input
            id="uf-dept"
            value={data.department}
            onChange={(e) => onChange("department", e.target.value)}
            placeholder="Enter department"
          />
        </div>
      </div>
    </div>
  );
}

// ─── Org Memberships Panel ────────────────────────────────────────────────────

interface DraftMembership {
  organizationId: string;
  organizationName: string;
  role: string;
  status: string;
  /** Role/status as currently persisted. Undefined for rows the admin just added. */
  savedRole?: string;
  savedStatus?: string;
  markedForRemoval: boolean;
}

function buildDraft(state: OrganizationAccessState | undefined): DraftMembership[] {
  if (!state) return [];
  return state.memberships.map((m) => ({
    organizationId: m.organizationId,
    organizationName: m.organizationName,
    role: m.role,
    status: m.status,
    savedRole: m.role,
    savedStatus: m.status,
    markedForRemoval: false,
  }));
}

/**
 * Organization Access editor.
 *
 * Edits are staged locally and only persisted when "Save Organization Access" is
 * pressed. Per-control auto-save was removed: it gave no confirmation, no way to
 * revert, and — combined with duplicate membership rows — made saves look like
 * they had silently failed.
 */
function OrgMembershipsPanel({
  userId,
  onDirtyChange,
  disabled,
  disabledReason,
}: {
  userId: string;
  onDirtyChange?: (dirty: boolean) => void;
  disabled?: boolean;
  disabledReason?: string;
}) {
  const { toast } = useToast();
  const qc = useQueryClient();

  const {
    data: access,
    isLoading,
    isError,
    error,
    refetch,
  } = useGetUserOrganizationAccess(userId, {
    query: { queryKey: getGetUserOrganizationAccessQueryKey(userId) },
  });

  const { data: allOrgs = [] } = useListOrganizations({
    query: { queryKey: ["organizations"] },
  });

  const saveMutation = useSaveUserOrganizationAccess();

  const [draft, setDraft] = useState<DraftMembership[]>([]);
  const [syncedKey, setSyncedKey] = useState<string | null>(null);
  const [addOrgId, setAddOrgId] = useState("");
  const [addRole, setAddRole] = useState("it_contributor");
  const [addStatus, setAddStatus] = useState("active");
  const [showAddRow, setShowAddRow] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  // Re-sync the draft whenever the server-side set actually changes (identified by
  // its version fingerprint) — including the first load and after a save. Local
  // edits survive background refetches that return the same version.
  const dataKey = access ? `${access.userId}:${access.version}` : null;
  if (dataKey && dataKey !== syncedKey) {
    setSyncedKey(dataKey);
    setDraft(buildDraft(access));
    setShowAddRow(false);
    setAddOrgId("");
  }

  const readOnly = disabled || access?.membershipRequired === false;

  const changes = draft.reduce(
    (acc, d) => {
      if (!d.savedRole) acc.added += 1;
      else if (d.markedForRemoval) acc.removed += 1;
      else if (d.role !== d.savedRole || d.status !== d.savedStatus) acc.modified += 1;
      return acc;
    },
    { added: 0, removed: 0, modified: 0 },
  );
  const isDirty = changes.added + changes.removed + changes.modified > 0;

  useEffect(() => {
    onDirtyChange?.(isDirty);
  }, [isDirty, onDirtyChange]);

  // Reset the dirty flag when this panel unmounts so a closed dialog never
  // leaves a stale "unsaved changes" warning behind.
  useEffect(() => () => onDirtyChange?.(false), [onDirtyChange]);

  const assignedOrgIds = new Set(draft.filter((d) => !d.markedForRemoval).map((d) => d.organizationId));

  const updateRow = (organizationId: string, patch: Partial<DraftMembership>) =>
    setDraft((prev) =>
      prev.map((d) => (d.organizationId === organizationId ? { ...d, ...patch } : d)),
    );

  const handleAdd = () => {
    if (!addOrgId) return;
    const org = allOrgs.find((o) => o.id === addOrgId);
    if (!org) return;

    const existing = draft.find((d) => d.organizationId === addOrgId);
    if (existing) {
      // Re-adding an organization that was staged for removal simply un-stages it.
      updateRow(addOrgId, { markedForRemoval: false, role: addRole, status: addStatus });
    } else {
      setDraft((prev) => [
        ...prev,
        {
          organizationId: addOrgId,
          organizationName: org.name,
          role: addRole,
          status: addStatus,
          markedForRemoval: false,
        },
      ]);
    }
    setAddOrgId("");
    setAddRole("it_contributor");
    setAddStatus("active");
    setShowAddRow(false);
  };

  const handleRemoveClick = (row: DraftMembership) => {
    if (!row.savedRole) {
      // Never persisted — drop it outright, nothing to confirm.
      setDraft((prev) => prev.filter((d) => d.organizationId !== row.organizationId));
    } else {
      updateRow(row.organizationId, { markedForRemoval: true });
    }
  };

  const handleRevert = () => {
    setDraft(buildDraft(access));
    setShowAddRow(false);
    setAddOrgId("");
  };

  const doSave = async () => {
    setConfirmOpen(false);
    const memberships = draft
      .filter((d) => !d.markedForRemoval)
      .map((d) => ({
        organizationId: d.organizationId,
        role: d.role as any,
        status: d.status as any,
      }));

    try {
      const saved = await saveMutation.mutateAsync({
        id: userId,
        data: { memberships, expectedVersion: access?.version ?? null },
      });
      // Adopt the canonical server response so what's on screen is exactly what
      // was stored — no optimistic guesses.
      qc.setQueryData(getGetUserOrganizationAccessQueryKey(userId), saved);
      await Promise.all([
        qc.invalidateQueries({ queryKey: getGetUserOrgsQueryKey(userId) }),
        qc.invalidateQueries({ queryKey: getListUsersQueryKey() }),
      ]);
      toast({
        title: "Organization access saved",
        description: `${saved.distinctOrganizationCount} organization${saved.distinctOrganizationCount === 1 ? "" : "s"} assigned.`,
      });
    } catch (e: any) {
      const status = e?.status ?? e?.response?.status;
      if (status === 409) {
        toast({
          title: "Someone else changed this user",
          description: "Reloading the latest organization access. Re-apply your changes and save again.",
          variant: "destructive",
        });
        await refetch();
        return;
      }
      toast({
        title: "Organization access was not saved",
        description: e?.message ?? "No changes were applied. Please try again.",
        variant: "destructive",
      });
    }
  };

  const handleSaveClick = () => {
    if (changes.removed > 0) {
      setConfirmOpen(true);
      return;
    }
    void doSave();
  };

  if (isLoading) {
    return (
      <div className="space-y-2 py-2" data-testid="org-access-loading">
        <div className="h-9 rounded-md bg-muted animate-pulse" />
        <div className="h-9 rounded-md bg-muted animate-pulse" />
        <div className="h-9 w-1/2 rounded-md bg-muted animate-pulse" />
      </div>
    );
  }

  if (isError || !access) {
    return (
      <div className="rounded-md border border-red-200 bg-red-50 p-4 space-y-3" data-testid="org-access-error">
        <div className="flex items-start gap-2 text-sm text-red-700">
          <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
          <div>
            <p className="font-medium">Organization access could not be loaded.</p>
            <p className="text-xs mt-0.5">
              {(error as any)?.message ?? "The request failed."} No changes have been made.
            </p>
          </div>
        </div>
        <Button size="sm" variant="outline" className="gap-1.5" onClick={() => void refetch()}>
          <RefreshCw className="h-3.5 w-3.5" />
          Retry
        </Button>
      </div>
    );
  }

  const visibleRows = [...draft].sort((a, b) => a.organizationName.localeCompare(b.organizationName));
  const availableOrgs = allOrgs.filter((o) => !assignedOrgIds.has(o.id));

  return (
    <div className="space-y-3" data-testid="org-access-panel">
      {/* Global Admin: platform role is the access source, memberships are not required. */}
      {access.membershipRequired === false && (
        <div className="rounded-md border border-blue-200 bg-blue-50 p-3 text-sm text-blue-800 flex items-start gap-2">
          <ShieldCheck className="h-4 w-4 mt-0.5 shrink-0" />
          <div>
            <p className="font-medium">Global Admin — access to all organizations</p>
            <p className="text-xs mt-0.5">
              {access.platformAccessNote ??
                "Organization-specific memberships are not required for this user."}
              {visibleRows.length > 0 &&
                " Any rows listed below are historical records and are not used to calculate access."}
            </p>
          </div>
        </div>
      )}

      {disabled && disabledReason && (
        <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 flex items-start gap-2">
          <ShieldAlert className="h-4 w-4 mt-0.5 shrink-0" />
          <span>{disabledReason}</span>
        </div>
      )}

      {access.duplicateRowCount > 0 && (
        <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 flex items-start gap-2">
          <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
          <div>
            <p className="font-medium">
              {access.duplicateRowCount} redundant membership record
              {access.duplicateRowCount === 1 ? "" : "s"} detected
            </p>
            <p className="text-xs mt-0.5">
              Each organization is shown once below, which is what actually applies. Ask an
              administrator to run the membership repair script to clean up the extra rows.
            </p>
          </div>
        </div>
      )}

      {visibleRows.length === 0 ? (
        <p className="text-sm text-muted-foreground" data-testid="org-access-empty">
          {access.membershipRequired === false
            ? "No organization-specific memberships recorded."
            : "No organization access assigned. This user cannot open any organization yet."}
        </p>
      ) : (
        <div className="space-y-2">
          {visibleRows.map((m) => {
            const isNew = !m.savedRole;
            const isModified =
              !isNew && !m.markedForRemoval && (m.role !== m.savedRole || m.status !== m.savedStatus);
            return (
              <div
                key={m.organizationId}
                data-testid={`org-access-row-${m.organizationId}`}
                className={cn(
                  "flex items-center gap-2 rounded-md border px-3 py-2 bg-muted/30",
                  isNew && "border-emerald-300 bg-emerald-50/60",
                  isModified && "border-amber-300 bg-amber-50/60",
                  m.markedForRemoval && "border-red-300 bg-red-50/60 opacity-80",
                )}
              >
                <Building2 className="h-4 w-4 text-muted-foreground shrink-0" />
                <span
                  className={cn(
                    "text-sm font-medium flex-1 min-w-0 truncate",
                    m.markedForRemoval && "line-through",
                  )}
                >
                  {m.organizationName}
                </span>

                {isNew && (
                  <Badge variant="outline" className="text-[10px] h-5 border-emerald-400 text-emerald-700">
                    New
                  </Badge>
                )}
                {isModified && (
                  <Badge variant="outline" className="text-[10px] h-5 border-amber-400 text-amber-700">
                    Changed
                  </Badge>
                )}
                {m.markedForRemoval && (
                  <Badge variant="outline" className="text-[10px] h-5 border-red-400 text-red-700">
                    Will be removed
                  </Badge>
                )}

                {readOnly || m.markedForRemoval ? (
                  <>
                    <Badge variant="outline" className="text-xs font-normal h-7 px-2">
                      {orgRoleLabel(m.role)}
                    </Badge>
                    <Badge variant="secondary" className="text-xs font-normal h-7 px-2">
                      {orgStatusLabel(m.status)}
                    </Badge>
                  </>
                ) : (
                  <>
                    <Select value={m.role} onValueChange={(v) => updateRow(m.organizationId, { role: v })}>
                      <SelectTrigger className="h-7 w-44 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {ORG_ROLES.map((r) => (
                          <SelectItem key={r.value} value={r.value} className="text-xs">
                            {r.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Select value={m.status} onValueChange={(v) => updateRow(m.organizationId, { status: v })}>
                      <SelectTrigger className="h-7 w-28 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {ORG_STATUSES.map((s) => (
                          <SelectItem key={s.value} value={s.value} className="text-xs">
                            {s.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </>
                )}

                {!readOnly &&
                  (m.markedForRemoval ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 text-xs"
                      onClick={() => updateRow(m.organizationId, { markedForRemoval: false })}
                    >
                      Undo
                    </Button>
                  ) : (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-muted-foreground hover:text-red-500"
                      aria-label={`Remove access to ${m.organizationName}`}
                      onClick={() => handleRemoveClick(m)}
                    >
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  ))}
              </div>
            );
          })}
        </div>
      )}

      {!readOnly &&
        (showAddRow ? (
          <div className="flex items-center gap-2 rounded-md border px-3 py-2 bg-blue-50/50 border-blue-200">
            <Select value={addOrgId} onValueChange={setAddOrgId}>
              <SelectTrigger className="h-7 flex-1 text-xs">
                <SelectValue placeholder="Select organization…" />
              </SelectTrigger>
              <SelectContent>
                {allOrgs.map((o) => {
                  const taken = assignedOrgIds.has(o.id);
                  return (
                    <SelectItem key={o.id} value={o.id} className="text-xs" disabled={taken}>
                      {o.name}
                      {taken && <span className="ml-2 text-muted-foreground">— Already assigned</span>}
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
            <Select value={addRole} onValueChange={setAddRole}>
              <SelectTrigger className="h-7 w-44 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ORG_ROLES.map((r) => (
                  <SelectItem key={r.value} value={r.value} className="text-xs">
                    {r.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={addStatus} onValueChange={setAddStatus}>
              <SelectTrigger className="h-7 w-24 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ORG_STATUSES.map((s) => (
                  <SelectItem key={s.value} value={s.value} className="text-xs">
                    {s.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button size="sm" className="h-7 text-xs" onClick={handleAdd} disabled={!addOrgId}>
              Add
            </Button>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setShowAddRow(false)}>
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
        ) : (
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5 text-xs"
            disabled={availableOrgs.length === 0}
            onClick={() => setShowAddRow(true)}
          >
            <Plus className="h-3.5 w-3.5" />
            {availableOrgs.length === 0 ? "All organizations assigned" : "Add Organization Access"}
          </Button>
        ))}

      {/* Explicit save workflow — nothing above is persisted until this runs. */}
      {!readOnly && (
        <div className="flex items-center justify-between gap-3 border-t pt-3">
          <p className="text-xs text-muted-foreground" data-testid="org-access-dirty-state">
            {isDirty ? (
              <span className="text-amber-700 font-medium">
                Unsaved changes:{" "}
                {[
                  changes.added > 0 && `${changes.added} added`,
                  changes.modified > 0 && `${changes.modified} changed`,
                  changes.removed > 0 && `${changes.removed} to remove`,
                ]
                  .filter(Boolean)
                  .join(", ")}
              </span>
            ) : (
              "All organization access changes are saved."
            )}
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleRevert}
              disabled={!isDirty || saveMutation.isPending}
            >
              Revert Changes
            </Button>
            <Button
              size="sm"
              className="gap-1.5"
              onClick={handleSaveClick}
              disabled={!isDirty || saveMutation.isPending}
              data-testid="save-org-access"
            >
              {saveMutation.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              Save Organization Access
            </Button>
          </div>
        </div>
      )}

      {/* Removing access is destructive — confirm before it is applied. */}
      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-red-500" />
              Remove organization access?
            </DialogTitle>
            <DialogDescription>
              This user will immediately lose access to the following organization
              {changes.removed === 1 ? "" : "s"}. Their account, evidence and other organization
              data are not affected.
            </DialogDescription>
          </DialogHeader>
          <ul className="text-sm space-y-1 list-disc pl-5">
            {draft
              .filter((d) => d.markedForRemoval)
              .map((d) => (
                <li key={d.organizationId}>{d.organizationName}</li>
              ))}
          </ul>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmOpen(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={() => void doSave()}>
              Remove Access &amp; Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Org Access Builder (for Invite dialog) ───────────────────────────────────

interface PendingOrgMembership {
  orgId: string;
  role: string;
  status: string;
}

function OrgAccessBuilder({
  value,
  onChange,
}: {
  value: PendingOrgMembership[];
  onChange: (memberships: PendingOrgMembership[]) => void;
}) {
  const { data: allOrgs = [] } = useListOrganizations();
  const [open, setOpen] = useState(false);
  const assignedIds = new Set(value.map((m) => m.orgId));
  const available = allOrgs.filter((o) => !assignedIds.has(o.id));

  const addOrg = (orgId: string) => {
    onChange([...value, { orgId, role: "it_contributor", status: "active" }]);
    setOpen(false);
  };

  const removeOrg = (orgId: string) => {
    onChange(value.filter((m) => m.orgId !== orgId));
  };

  const updateField = (orgId: string, field: "role" | "status", val: string) => {
    onChange(value.map((m) => (m.orgId === orgId ? { ...m, [field]: val } : m)));
  };

  const orgName = (id: string) => allOrgs.find((o) => o.id === id)?.name ?? id;

  return (
    <div className="space-y-3">
      {value.length > 0 && (
        <div className="space-y-2">
          {value.map((m) => (
            <div key={m.orgId} className="flex items-center gap-2 p-2 rounded-md border bg-muted/30">
              <Building2 className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              <span className="text-sm font-medium flex-1 min-w-0 truncate">{orgName(m.orgId)}</span>
              <Select value={m.role} onValueChange={(v) => updateField(m.orgId, "role", v)}>
                <SelectTrigger className="h-7 w-40 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ORG_ROLES.map((r) => (
                    <SelectItem key={r.value} value={r.value} className="text-xs">
                      {r.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 shrink-0 text-muted-foreground hover:text-red-500"
                onClick={() => removeOrg(m.orgId)}
              >
                <X className="h-3.5 w-3.5" />
              </Button>
            </div>
          ))}
        </div>
      )}

      {available.length > 0 && (
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className="gap-1.5 text-xs">
              <Plus className="h-3.5 w-3.5" />
              Add Organization
              <ChevronsUpDown className="h-3 w-3 opacity-50" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-72 p-0" align="start">
            <Command>
              <CommandInput placeholder="Search organizations…" className="h-9" />
              <CommandList>
                <CommandEmpty>No organizations found.</CommandEmpty>
                <CommandGroup>
                  {available.map((org) => (
                    <CommandItem key={org.id} value={org.name} onSelect={() => addOrg(org.id)}>
                      <Building2 className="h-3.5 w-3.5 mr-2 text-muted-foreground" />
                      {org.name}
                    </CommandItem>
                  ))}
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
      )}

      {available.length === 0 && value.length === 0 && (
        <p className="text-xs text-muted-foreground italic">No organizations available.</p>
      )}
      {available.length === 0 && value.length > 0 && (
        <p className="text-xs text-muted-foreground italic">All organizations assigned.</p>
      )}
    </div>
  );
}

// ─── Invite User Dialog ───────────────────────────────────────────────────────

interface InviteFormData {
  name: string;
  email: string;
  role: string;
  title: string;
  department: string;
}

const EMPTY_INVITE: InviteFormData = {
  name: "",
  email: "",
  role: "it_contributor",
  title: "",
  department: "",
};

interface InviteDialogProps {
  emailConfigured: boolean;
  open: boolean;
  onClose: () => void;
  onInvited: (inviteUrl?: string) => void;
}

function InviteDialog({ open, onClose, onInvited, emailConfigured }: InviteDialogProps) {
  const { toast } = useToast();
  const [form, setForm] = useState<InviteFormData>(EMPTY_INVITE);
  const [errors, setErrors] = useState<Partial<Record<keyof InviteFormData, string>>>({});
  const [pendingOrgs, setPendingOrgs] = useState<PendingOrgMembership[]>([]);

  const sendMutation = useSendInvitation();

  const setField = (field: keyof InviteFormData, value: string) => {
    setForm((f) => ({ ...f, [field]: value }));
    setErrors((e) => ({ ...e, [field]: undefined }));
  };

  const validate = () => {
    const errs: Partial<Record<keyof InviteFormData, string>> = {};
    if (!form.name.trim()) errs.name = "Name is required";
    if (!form.email.trim()) errs.email = "Email is required";
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email))
      errs.email = "Invalid email address";
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleClose = () => {
    setForm(EMPTY_INVITE);
    setErrors({});
    setPendingOrgs([]);
    onClose();
  };

  const handleSubmit = async (sendEmail: boolean) => {
    if (!validate()) return;
    try {
      const result = await sendMutation.mutateAsync({
        data: {
          name: form.name.trim(),
          email: form.email.trim(),
          role: form.role as any,
          title: form.title || undefined,
          department: form.department || undefined,
          orgMemberships: pendingOrgs.map((m) => ({ orgId: m.orgId, role: m.role })),
          sendEmail,
        } as any,
      });
      handleClose();
      onInvited(result.inviteUrl ?? undefined);
    } catch (err: any) {
      const msg = err?.response?.data?.error ?? "Failed to send invitation";
      if (msg.toLowerCase().includes("email already exists") || msg.toLowerCase().includes("email")) {
        setErrors({ email: "A user with this email already exists" });
      } else {
        toast({ title: msg, variant: "destructive" });
      }
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Mail className="h-5 w-5 text-blue-500" />
            Invite User
          </DialogTitle>
        </DialogHeader>

        <div className="py-2 overflow-y-auto flex-1 min-h-0 space-y-6">
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="inv-name">
                  Full Name <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="inv-name"
                  value={form.name}
                  onChange={(e) => setField("name", e.target.value)}
                  placeholder="Enter full name"
                  className={errors.name ? "border-red-500" : ""}
                  autoFocus
                />
                {errors.name && <p className="text-xs text-red-500">{errors.name}</p>}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="inv-email">
                  Email <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="inv-email"
                  type="email"
                  value={form.email}
                  onChange={(e) => setField("email", e.target.value)}
                  placeholder="name@company.com"
                  className={errors.email ? "border-red-500" : ""}
                />
                {errors.email && <p className="text-xs text-red-500">{errors.email}</p>}
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="inv-platform-role">Platform Role</Label>
              <Select
                value={platformRoleOf(form.role)}
                onValueChange={(v) => setField("role", v)}
              >
                <SelectTrigger id="inv-platform-role">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PLATFORM_ROLES.map((r) => (
                    <SelectItem key={r.value} value={r.value}>
                      {r.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Global Admin has unrestricted access. For org-specific roles, configure Organization Access below.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="inv-title">Title</Label>
                <Input
                  id="inv-title"
                  value={form.title}
                  onChange={(e) => setField("title", e.target.value)}
                  placeholder="Enter job title"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="inv-dept">Department</Label>
                <Input
                  id="inv-dept"
                  value={form.department}
                  onChange={(e) => setField("department", e.target.value)}
                  placeholder="Enter department"
                />
              </div>
            </div>
          </div>

          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Building2 className="h-4 w-4 text-muted-foreground" />
              <h3 className="text-sm font-semibold">Organization Access</h3>
              {pendingOrgs.length > 0 && (
                <Badge variant="secondary" className="text-xs h-5">
                  {pendingOrgs.length}
                </Badge>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              Optionally grant this user access to one or more organizations. They'll be activated when they accept the invitation.
            </p>
            <OrgAccessBuilder value={pendingOrgs} onChange={setPendingOrgs} />
          </div>

          <div className="rounded-md bg-blue-50 border border-blue-200 p-3 text-sm text-blue-700 flex items-start gap-2">
            <MailCheck className="h-4 w-4 mt-0.5 shrink-0" />
            <span>
              A secure invitation link will be emailed to {form.email || "the user"}.
              They'll set their own password when they accept. The link expires in 7 days.
            </span>
          </div>
        </div>

        <DialogFooter className="shrink-0">
          <Button variant="outline" onClick={handleClose} disabled={sendMutation.isPending}>
            Cancel
          </Button>
          {emailConfigured ? (
            <>
              <Button
                variant="outline"
                onClick={() => handleSubmit(false)}
                disabled={sendMutation.isPending}
                className="gap-2"
              >
                {sendMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Link className="h-4 w-4" />}
                Create Without Email
              </Button>
              <Button
                onClick={() => handleSubmit(true)}
                disabled={sendMutation.isPending}
                className="gap-2"
              >
                {sendMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}
                Invite &amp; Send Email
              </Button>
            </>
          ) : (
            <Button
              onClick={() => handleSubmit(false)}
              disabled={sendMutation.isPending}
              className="gap-2"
            >
              {sendMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Link className="h-4 w-4" />}
              Create &amp; Copy Link
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Invite URL Banner ─────────────────────────────────────────────────────────

function InviteUrlBanner({ url, onDismiss }: { url: string; onDismiss: () => void }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 space-y-2">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 text-sm font-medium text-blue-800">
          <Link className="h-4 w-4 shrink-0" />
          Invitation link — share this with the user
        </div>
        <Button variant="ghost" size="icon" className="h-6 w-6 -mt-0.5 shrink-0" onClick={onDismiss}>
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>
      <div className="flex items-center gap-2">
        <Input
          readOnly
          value={url}
          className="text-xs font-mono h-8 bg-white"
          onClick={(e) => (e.target as HTMLInputElement).select()}
        />
        <Button size="sm" variant="outline" className="shrink-0 gap-1.5" onClick={handleCopy}>
          {copied ? <Check className="h-3.5 w-3.5 text-green-600" /> : <Copy className="h-3.5 w-3.5" />}
          {copied ? "Copied!" : "Copy"}
        </Button>
      </div>
      <p className="text-xs text-blue-700">
        This link expires in 7 days. The user will set their password when they accept.
      </p>
    </div>
  );
}

// ─── Create User Dialog ────────────────────────────────────────────────────────

const EMPTY_CREATE: UserFormData = {
  name: "",
  email: "",
  password: "",
  role: "it_contributor",
  title: "",
  department: "",
};

interface CreateUserDialogProps {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
}

function CreateUserDialog({ open, onClose, onCreated }: CreateUserDialogProps) {
  const { toast } = useToast();
  const [form, setForm] = useState<UserFormData>(EMPTY_CREATE);
  const [errors, setErrors] = useState<Partial<Record<keyof UserFormData, string>>>({});
  const [pendingOrgs, setPendingOrgs] = useState<PendingOrgMembership[]>([]);

  const createMutation = useCreateUser();
  const addOrgMutation = useAddUserToOrg();

  const setField = (field: keyof UserFormData, value: string) => {
    setForm((f) => ({ ...f, [field]: value }));
    setErrors((e) => ({ ...e, [field]: undefined }));
  };

  const validate = () => {
    const errs: Partial<Record<keyof UserFormData, string>> = {};
    if (!form.name.trim()) errs.name = "Name is required";
    if (!form.email.trim()) errs.email = "Email is required";
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email))
      errs.email = "Invalid email address";
    if (!form.password) errs.password = "Password is required";
    else if (form.password.length < 8) errs.password = "Password must be at least 8 characters";
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleClose = () => {
    setForm(EMPTY_CREATE);
    setErrors({});
    setPendingOrgs([]);
    onClose();
  };

  const handleSubmit = async () => {
    if (!validate()) return;
    try {
      const created = await createMutation.mutateAsync({
        data: {
          name: form.name.trim(),
          email: form.email.trim(),
          password: form.password,
          role: form.role as any,
          title: form.title || undefined,
          department: form.department || undefined,
        },
      });
      for (const m of pendingOrgs) {
        try {
          await addOrgMutation.mutateAsync({
            id: (created as any).id,
            data: { organizationId: m.orgId, role: m.role as any, status: m.status as any },
          });
        } catch {
          // Non-fatal: user was created; org membership can be assigned from Edit dialog
        }
      }
      toast({ title: `${form.name.trim()} created successfully` });
      handleClose();
      onCreated();
    } catch (err: any) {
      const msg = err?.response?.data?.error ?? "Failed to create user";
      if (msg.toLowerCase().includes("email")) {
        setErrors({ email: "A user with this email already exists" });
      } else {
        toast({ title: msg, variant: "destructive" });
      }
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserPlus className="h-5 w-5 text-primary" />
            Create User
          </DialogTitle>
          <DialogDescription>
            Create a user with an immediate password. They can log in right away.
          </DialogDescription>
        </DialogHeader>

        <div className="overflow-y-auto flex-1 min-h-0 py-2 space-y-5">
          <UserForm data={form} onChange={setField} isEdit={false} errors={errors} />

          <div className="rounded-md border p-4 space-y-3">
            <div className="flex items-center gap-2">
              <Building2 className="h-4 w-4 text-muted-foreground" />
              <h3 className="text-sm font-semibold">Organization Access</h3>
              {pendingOrgs.length > 0 && (
                <Badge variant="secondary" className="text-xs h-5">{pendingOrgs.length}</Badge>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              Optionally grant this user access to one or more organizations immediately. You can also assign organizations later from the Edit dialog.
            </p>
            <OrgAccessBuilder value={pendingOrgs} onChange={setPendingOrgs} />
          </div>
        </div>

        <DialogFooter className="shrink-0">
          <Button variant="outline" onClick={handleClose} disabled={createMutation.isPending}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={createMutation.isPending} className="gap-2">
            {createMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
            Create User
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── User Org Summary (table cell badge) ──────────────────────────────────────

/**
 * Organization Access cell.
 *
 * Counts DISTINCT organizations, never raw membership rows — the API collapses
 * duplicates, and Global Admins are described by their platform role rather than
 * by a membership count.
 */
function UserOrgSummary({ user }: { user: User }) {
  const isGlobalAdmin = isGlobalAdminRole(user.role);

  const { data: memberships = [], isLoading } = useGetUserOrgs(user.id, {
    query: { queryKey: getGetUserOrgsQueryKey(user.id), enabled: !isGlobalAdmin },
  });

  if (isGlobalAdmin) {
    return (
      <Badge
        variant="outline"
        className="text-[10px] font-normal border-blue-400 text-blue-700 bg-blue-50 gap-1"
        data-testid={`org-summary-${user.id}`}
      >
        <ShieldCheck className="h-3 w-3" />
        All Organizations — Global Admin
      </Badge>
    );
  }

  if (isLoading) {
    return <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />;
  }

  // Defensive: collapse again client-side so a stale cached payload can never
  // reproduce an inflated count.
  const distinct = Array.from(
    new Map(memberships.map((m) => [m.organizationId, m])).values(),
  ).sort((a, b) => a.organizationName.localeCompare(b.organizationName));

  if (distinct.length === 0) {
    return (
      <span className="text-xs text-muted-foreground" data-testid={`org-summary-${user.id}`}>
        No organization access
      </span>
    );
  }

  const shown = distinct.slice(0, 2);
  const extra = distinct.length - shown.length;

  return (
    <div className="flex flex-wrap gap-1 items-center" data-testid={`org-summary-${user.id}`}>
      {shown.map((m) => (
        <Badge
          key={m.organizationId}
          variant="outline"
          className="text-[10px] font-normal max-w-[180px] truncate"
        >
          {m.organizationName} — {orgRoleLabel(m.role)}
        </Badge>
      ))}
      {extra > 0 && (
        <Popover>
          <PopoverTrigger asChild>
            <button
              type="button"
              className="text-[10px] rounded-full border bg-secondary px-2 py-0.5 hover:bg-secondary/70"
            >
              +{extra} more
            </button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-72 p-2">
            <p className="text-xs font-semibold px-1 pb-1.5">
              {distinct.length} organization{distinct.length === 1 ? "" : "s"}
            </p>
            <div className="max-h-64 overflow-y-auto space-y-1">
              {distinct.map((m) => (
                <div
                  key={m.organizationId}
                  className="flex items-center justify-between gap-2 text-xs px-1 py-0.5"
                >
                  <span className="truncate">{m.organizationName}</span>
                  <span className="text-muted-foreground shrink-0">{orgRoleLabel(m.role)}</span>
                </div>
              ))}
            </div>
          </PopoverContent>
        </Popover>
      )}
    </div>
  );
}

// ─── Effective Permissions Panel (EditDialog Permissions tab) ─────────────────

/** Capabilities surfaced in the access diagnostic. Display-only. */
const DIAGNOSTIC_PERMISSIONS: string[] = [
  "documents.generate", "documents.edit", "documents.approve", "documents.delete",
  "evidence.approve", "evidence.edit", "evidence.delete",
  "controls.edit",
  "poam.create", "poam.edit", "poam.close",
  "tasks.create", "tasks.edit",
  "roadmap.view", "roadmap.update",
  "monitoring.update",
  "users.manage", "org.admin",
  "reports.generate", "preassessment.run", "ssp.edit",
];

const PERMISSION_SOURCE_LABELS: Record<string, string> = {
  PLATFORM_ROLE: "Platform role (Global Admin)",
  ORGANIZATION_MEMBERSHIP: "Organization membership",
  LEGACY_GLOBAL_ROLE: "Legacy global role",
  NONE: "No access",
};

/**
 * Read-only access diagnostic. Reads from the same authorization service the
 * server uses to gate requests, so it cannot disagree with real behaviour.
 *
 * Renders a definitive answer in every state — a Global Admin resolves without
 * selecting an organization, and "no membership" is an explicit message rather
 * than a blank panel.
 */
function EffectivePermissionsPanel({ userId }: { userId: string }) {
  const { data: allOrgs = [] } = useListOrganizations({
    query: { queryKey: ["organizations"] },
  });
  const [selectedOrgId, setSelectedOrgId] = useState<string>("");

  const {
    data: access,
    isLoading,
    isError,
    error,
    refetch,
  } = useGetUserEffectiveAccess(
    userId,
    selectedOrgId ? { organizationId: selectedOrgId } : undefined,
    {
      query: {
        queryKey: getGetUserEffectiveAccessQueryKey(
          userId,
          selectedOrgId ? { organizationId: selectedOrgId } : undefined,
        ),
      },
    },
  );

  const permSet = new Set(access?.permissions ?? []);
  const isGlobalAdmin = access?.platformRole === "global_admin";

  return (
    <div className="space-y-4 py-2" data-testid="effective-permissions-panel">
      <div className="space-y-1.5">
        <Label>Organization Scope</Label>
        <Select
          value={selectedOrgId || "__platform__"}
          onValueChange={(v) => setSelectedOrgId(v === "__platform__" ? "" : v)}
        >
          <SelectTrigger data-testid="select-permission-scope">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__platform__">Platform-wide (no organization selected)</SelectItem>
            {allOrgs.map((o) => (
              <SelectItem key={o.id} value={o.id}>
                {o.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">
          Global Admin access is resolved without selecting an organization. Choose an
          organization to see the permissions that apply inside it.
        </p>
      </div>

      {isLoading && (
        <div className="space-y-2">
          <div className="h-16 rounded-md bg-muted animate-pulse" />
          <div className="h-24 rounded-md bg-muted animate-pulse" />
        </div>
      )}

      {isError && (
        <div className="rounded-md border border-red-200 bg-red-50 p-4 space-y-3">
          <div className="flex items-start gap-2 text-sm text-red-700">
            <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
            <div>
              <p className="font-medium">Effective permissions could not be calculated.</p>
              <p className="text-xs mt-0.5">{(error as any)?.message ?? "The request failed."}</p>
            </div>
          </div>
          <Button size="sm" variant="outline" className="gap-1.5" onClick={() => void refetch()}>
            <RefreshCw className="h-3.5 w-3.5" />
            Retry
          </Button>
        </div>
      )}

      {access && (
        <div className="space-y-4">
          {/* Access is stated plainly before any matrix is shown. */}
          <div
            className={cn(
              "rounded-md border p-3 flex items-start gap-2 text-sm",
              access.hasAccess
                ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                : "border-amber-200 bg-amber-50 text-amber-800",
            )}
            data-testid="effective-access-verdict"
          >
            {access.hasAccess ? (
              <ShieldCheck className="h-4 w-4 mt-0.5 shrink-0" />
            ) : (
              <Ban className="h-4 w-4 mt-0.5 shrink-0" />
            )}
            <div>
              <p className="font-medium">
                {isGlobalAdmin
                  ? "Global Admin — full access to all organizations"
                  : access.hasAccess
                    ? `Access granted as ${access.effectiveRoleLabel}`
                    : "No access"}
              </p>
              <p className="text-xs mt-0.5">
                {access.reason ??
                  (access.organizationName
                    ? `Resolved for ${access.organizationName}.`
                    : "Resolved at the platform level.")}
              </p>
            </div>
          </div>

          {/* Platform role, organization role, effective role and membership status are
              reported as four separate facts — mixing them was the original defect. */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="rounded-md border p-3">
              <div className="text-xs text-muted-foreground mb-1">Platform Role</div>
              <div className="text-sm font-medium">{access.platformRoleLabel}</div>
            </div>
            <div className="rounded-md border p-3">
              <div className="text-xs text-muted-foreground mb-1">Organization Role</div>
              <div className="text-sm font-medium">
                {access.organizationRoleLabel ?? (selectedOrgId ? "None" : "Not scoped")}
              </div>
            </div>
            <div className="rounded-md border p-3">
              <div className="text-xs text-muted-foreground mb-1">Membership Status</div>
              <div className="text-sm font-medium">
                {access.membershipStatus
                  ? orgStatusLabel(access.membershipStatus)
                  : access.membershipRequired
                    ? "No membership"
                    : "Not required"}
              </div>
            </div>
            <div className="rounded-md border p-3">
              <div className="text-xs text-muted-foreground mb-1">Effective Role</div>
              <div className="text-sm font-medium">{access.effectiveRoleLabel}</div>
            </div>
          </div>

          <div className="rounded-md border p-3">
            <div className="text-xs text-muted-foreground mb-1">Permission Source</div>
            <div className="text-sm font-medium" data-testid="permission-source">
              {PERMISSION_SOURCE_LABELS[access.permissionSource] ?? access.permissionSource}
            </div>
            {access.legacyRole && (
              <p className="text-xs text-amber-700 mt-1">
                This account still stores the legacy global role "
                {access.legacyRole.replace(/_/g, " ")}". It does not grant any access —
                only the platform role and organization memberships above do. Clear it by
                setting the Platform Role explicitly.
              </p>
            )}
          </div>

          {!access.hasAccess && access.membershipRequired && (
            <p className="text-sm text-muted-foreground" data-testid="no-membership-message">
              No active organization membership exists. Grant access on the Organization Access
              tab to give this user permissions here.
            </p>
          )}

          <div>
            <div className="flex items-center justify-between mb-2">
              <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                Capabilities
              </div>
              <div className="text-xs text-muted-foreground">
                {access.permissions.length} allowed · {access.deniedPermissions.length} denied
              </div>
            </div>
            <div className="grid grid-cols-2 gap-x-6 gap-y-1">
              {DIAGNOSTIC_PERMISSIONS.map((p) => {
                const allowed = permSet.has(p);
                return (
                  <div key={p} className="flex items-center gap-2 text-xs py-0.5">
                    {allowed ? (
                      <Check className="h-3 w-3 text-green-600 shrink-0" />
                    ) : (
                      <X className="h-3 w-3 text-red-400 shrink-0" />
                    )}
                    <span className={allowed ? "text-foreground" : "text-muted-foreground"}>{p}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Migration Report Card ────────────────────────────────────────────────────

interface MigrationSummary {
  summary: {
    totalUsers: number;
    globalAdmins: number;
    usersWithLegacyNonGlobalRole: number;
    usersWithOrgMemberships: number;
    usersWithNoMembership: number;
  };
  users: Array<{
    userId: string;
    userName: string;
    email: string;
    legacyRole: string;
    isGlobalAdmin: boolean;
    isActive: boolean;
    orgMemberships: Array<{ orgId: string; orgName: string; role: string; status: string }>;
    hasLegacyRoleConflict: boolean;
    noOrgAccess: boolean;
    resolution: string;
  }>;
}

function MigrationReportCard() {
  const [expanded, setExpanded] = useState(false);

  const { data: report, isLoading } = useQuery<MigrationSummary>({
    queryKey: ["migration-report"],
    queryFn: async () => {
      const token = localStorage.getItem("auth_token");
      const r = await fetch("/api/users/migration-report", {
        headers: { Authorization: `Bearer ${token ?? ""}` },
      });
      if (!r.ok) throw new Error("Failed to load report");
      return r.json();
    },
    enabled: expanded,
  });

  const attentionUsers = report?.users.filter((u) => u.hasLegacyRoleConflict || u.noOrgAccess) ?? [];

  return (
    <Card className="border-amber-200 bg-amber-50/40">
      <CardHeader className="pb-2 pt-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0" />
            <CardTitle className="text-sm font-semibold">Legacy Role Migration Report</CardTitle>
          </div>
          <Button variant="outline" size="sm" onClick={() => setExpanded((v) => !v)} className="text-xs h-7">
            {expanded ? "Hide" : "View Report"}
          </Button>
        </div>
        <p className="text-xs text-muted-foreground mt-1">
          Shows users still relying on legacy platform roles. Only Global Admin is a valid platform-level role; all other access is org-specific.
        </p>
      </CardHeader>
      {expanded && (
        <CardContent className="pt-0 pb-4">
          {isLoading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
              <Loader2 className="h-4 w-4 animate-spin" /> Analyzing user roles…
            </div>
          ) : report ? (
            <div className="space-y-4">
              <div className="grid grid-cols-5 gap-2 text-center">
                {[
                  { label: "Total Users", value: report.summary.totalUsers },
                  { label: "Global Admins", value: report.summary.globalAdmins },
                  { label: "Legacy Roles", value: report.summary.usersWithLegacyNonGlobalRole },
                  { label: "Have Org Access", value: report.summary.usersWithOrgMemberships },
                  { label: "No Org Access", value: report.summary.usersWithNoMembership },
                ].map((item) => (
                  <div key={item.label} className="rounded-md border bg-white p-2">
                    <div className="text-lg font-bold">{item.value}</div>
                    <div className="text-[10px] text-muted-foreground leading-tight">{item.label}</div>
                  </div>
                ))}
              </div>
              {attentionUsers.length === 0 ? (
                <div className="flex items-center gap-2 text-sm text-green-700">
                  <Check className="h-4 w-4 text-green-600" />
                  All users are either Global Admins or have org-specific role assignments — no action needed.
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Users Requiring Attention</div>
                  {attentionUsers.map((u) => (
                    <div key={u.userId} className="flex items-start gap-3 rounded-md border bg-white p-3 text-sm">
                      <div className="flex-1 min-w-0">
                        <div className="font-medium">{u.userName}</div>
                        <div className="text-xs text-muted-foreground">{u.email}</div>
                        <div className="mt-1 flex flex-wrap gap-1 items-center">
                          <span className="text-xs text-muted-foreground">Legacy:</span>
                          <Badge variant="outline" className="text-[10px]">{u.legacyRole}</Badge>
                        </div>
                        {u.orgMemberships.length > 0 && (
                          <div className="mt-1 flex flex-wrap gap-1">
                            {u.orgMemberships.map((m) => (
                              <Badge key={m.orgId} variant="secondary" className="text-[10px]">
                                {m.orgName} — {m.role}
                              </Badge>
                            ))}
                          </div>
                        )}
                      </div>
                      <div className={cn(
                        "text-[10px] rounded px-2 py-1 shrink-0 font-medium",
                        u.noOrgAccess ? "bg-red-100 text-red-700" : "bg-blue-100 text-blue-700",
                      )}>
                        {u.noOrgAccess ? "Needs org access" : "Overridden by org role"}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : null}
        </CardContent>
      )}
    </Card>
  );
}

// ─── Edit Dialog ───────────────────────────────────────────────────────────────

const EMPTY_FORM: UserFormData = {
  name: "",
  email: "",
  password: "",
  role: "none",
  title: "",
  department: "",
};

function formFromUser(u: UserDetail): UserFormData {
  return {
    name: u.name ?? "",
    email: u.email ?? "",
    password: "",
    role: u.role ?? "none",
    title: u.title ?? "",
    department: u.department ?? "",
  };
}

interface EditDialogProps {
  user: User | null;
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

/**
 * Edit User.
 *
 * Always loads the target user by ID when opened rather than trusting whatever was
 * in the row. Previously the form state was initialised once — while the selected
 * user was still null — so it kept showing an empty form (its placeholders read as
 * fake sample data) no matter which user was clicked.
 */
function EditDialog({ user, open, onClose, onSuccess }: EditDialogProps) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const { user: authUser } = useAuth();
  const isAdmin = authUser?.role === "admin";

  const userId = user?.id ?? null;

  const {
    data: detail,
    isLoading,
    isError,
    error,
    refetch,
  } = useGetUser(userId ?? "", {
    query: {
      queryKey: getGetUserQueryKey(userId ?? ""),
      enabled: open && !!userId,
      // The row that opened this dialog is a list projection, not the full record —
      // never seed the form from it.
      staleTime: 0,
      gcTime: 0,
    },
  });

  const [form, setForm] = useState<UserFormData>(EMPTY_FORM);
  const [errors, setErrors] = useState<Partial<Record<keyof UserFormData, string>>>({});
  const [activeTab, setActiveTab] = useState<"details" | "orgs" | "permissions">("details");
  const [loadedId, setLoadedId] = useState<string | null>(null);
  const [orgsDirty, setOrgsDirty] = useState(false);
  const [pendingClose, setPendingClose] = useState(false);

  // Clear all prior state the moment the dialog opens or the target changes, so no
  // values from a previously edited user can ever be displayed.
  useEffect(() => {
    if (!open) return;
    setForm(EMPTY_FORM);
    setErrors({});
    setActiveTab("details");
    setLoadedId(null);
    setOrgsDirty(false);
    setPendingClose(false);
  }, [open, userId]);

  // Populate from the authoritative fetch exactly once per loaded user.
  if (detail && detail.id === userId && loadedId !== detail.id) {
    setLoadedId(detail.id);
    setForm(formFromUser(detail));
    setErrors({});
  }

  const updateMutation = useUpdateUser();

  const setField = (field: keyof UserFormData, value: string) => {
    setForm((f) => ({ ...f, [field]: value }));
    setErrors((e) => ({ ...e, [field]: undefined }));
  };

  const savedForm = detail ? formFromUser(detail) : null;
  const detailsDirty =
    !!savedForm &&
    loadedId === detail?.id &&
    (form.name !== savedForm.name ||
      form.email !== savedForm.email ||
      platformRoleOf(form.role) !== platformRoleOf(savedForm.role) ||
      form.title !== savedForm.title ||
      form.department !== savedForm.department);

  const isProtected = detail?.isProtected === true;
  const isSelf = detail?.id === authUser?.id;

  const validate = () => {
    const errs: Partial<Record<keyof UserFormData, string>> = {};
    if (!form.name.trim()) errs.name = "Name is required";
    if (!form.email.trim()) errs.email = "Email is required";
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) errs.email = "Invalid email address";
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = async () => {
    if (!detail) return;
    if (!validate()) return;
    try {
      await updateMutation.mutateAsync({
        id: detail.id,
        data: {
          name: form.name.trim(),
          email: form.email.trim(),
          // Canonical platform role only — an organization role can never be sent here.
          role: platformRoleOf(form.role) as any,
          title: form.title || undefined,
          department: form.department || undefined,
        },
      });
      await Promise.all([
        qc.invalidateQueries({ queryKey: getGetUserQueryKey(detail.id) }),
        qc.invalidateQueries({ queryKey: getListUsersQueryKey() }),
      ]);
      toast({ title: "User details saved" });
      onSuccess();
    } catch (err: any) {
      const msg = err?.response?.data?.error ?? err?.message ?? "Failed to update user";
      if (msg.toLowerCase().includes("last active global admin")) {
        toast({ title: "Change blocked", description: msg, variant: "destructive" });
      } else if (msg.toLowerCase().includes("email")) {
        setErrors({ email: "Email already in use" });
      } else {
        toast({ title: msg, variant: "destructive" });
      }
    }
  };

  const hasUnsaved = detailsDirty || orgsDirty;

  const requestClose = () => {
    if (hasUnsaved) {
      setPendingClose(true);
      return;
    }
    onClose();
  };

  const switchTab = (tab: "details" | "orgs" | "permissions") => {
    // Tabs keep their own drafts, so switching never discards work silently.
    setActiveTab(tab);
  };

  const identity = detail
    ? `${detail.name} · ${detail.email}`
    : userId
      ? "Loading user…"
      : "No user selected";

  return (
    <Dialog open={open} onOpenChange={(o) => (!o ? requestClose() : undefined)}>
      <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Edit User</DialogTitle>
          {/* Always show WHICH user is being edited. */}
          <DialogDescription className="flex flex-wrap items-center gap-1.5" data-testid="edit-user-identity">
            <span className="font-medium text-foreground">{identity}</span>
            {detail && isGlobalAdminRole(detail.role) && (
              <Badge variant="outline" className="border-blue-400 text-blue-700 bg-blue-50 gap-1 text-[10px]">
                <ShieldCheck className="h-3 w-3" /> Global Admin
              </Badge>
            )}
            {isProtected && (
              <Badge variant="outline" className="border-amber-500 text-amber-700 bg-amber-50 gap-1 text-[10px]">
                Protected Account
              </Badge>
            )}
            {isSelf && (
              <Badge variant="secondary" className="text-[10px]">
                You
              </Badge>
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="flex gap-1 border-b pb-0 -mt-2 shrink-0">
          <button
            onClick={() => switchTab("details")}
            className={cn(
              "px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors flex items-center gap-1.5",
              activeTab === "details"
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            Details
            {detailsDirty && <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />}
          </button>
          <button
            onClick={() => switchTab("orgs")}
            className={cn(
              "px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors flex items-center gap-1.5",
              activeTab === "orgs"
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            <Building2 className="h-3.5 w-3.5" />
            Organization Access
            {orgsDirty && <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />}
          </button>
          {isAdmin && (
            <button
              onClick={() => switchTab("permissions")}
              className={cn(
                "px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors flex items-center gap-1.5",
                activeTab === "permissions"
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              <ShieldCheck className="h-3.5 w-3.5" />
              Effective Permissions
            </button>
          )}
        </div>

        <div className="py-2 overflow-y-auto flex-1 min-h-0">
          {isLoading && (
            <div className="space-y-3 py-2" data-testid="edit-user-loading">
              <div className="grid grid-cols-2 gap-4">
                <div className="h-16 rounded-md bg-muted animate-pulse" />
                <div className="h-16 rounded-md bg-muted animate-pulse" />
              </div>
              <div className="h-20 rounded-md bg-muted animate-pulse" />
              <div className="grid grid-cols-2 gap-4">
                <div className="h-16 rounded-md bg-muted animate-pulse" />
                <div className="h-16 rounded-md bg-muted animate-pulse" />
              </div>
            </div>
          )}

          {isError && (
            <div
              className="rounded-md border border-red-200 bg-red-50 p-4 space-y-3"
              data-testid="edit-user-error"
            >
              <div className="flex items-start gap-2 text-sm text-red-700">
                <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                <div>
                  <p className="font-medium">This user could not be loaded.</p>
                  <p className="text-xs mt-0.5">
                    {(error as any)?.message ?? "The request failed."} No fields are shown because
                    no data was received.
                  </p>
                </div>
              </div>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" className="gap-1.5" onClick={() => void refetch()}>
                  <RefreshCw className="h-3.5 w-3.5" />
                  Retry
                </Button>
                <Button size="sm" variant="ghost" onClick={onClose}>
                  Close
                </Button>
              </div>
            </div>
          )}

          {!isLoading && !isError && detail && (
            <>
              {activeTab === "details" && (
                <div className="space-y-4">
                  <UserForm data={form} onChange={setField} isEdit={true} errors={errors} />
                  <div className="grid grid-cols-2 gap-3 text-xs text-muted-foreground border-t pt-3">
                    <div>
                      <span className="font-medium text-foreground">Account status: </span>
                      {detail.status ?? (detail.isActive ? "active" : "deactivated")}
                    </div>
                    <div>
                      <span className="font-medium text-foreground">MFA: </span>
                      {detail.mfaEnabled ? "Enabled" : "Not enrolled"}
                    </div>
                    <div>
                      <span className="font-medium text-foreground">Created: </span>
                      {formatDate(detail.createdAt)}
                    </div>
                    <div>
                      <span className="font-medium text-foreground">Last login: </span>
                      {formatDate(detail.lastLoginAt)}
                    </div>
                  </div>
                </div>
              )}
              {activeTab === "orgs" && (
                <OrgMembershipsPanel
                  userId={detail.id}
                  onDirtyChange={setOrgsDirty}
                  disabled={isProtected}
                />
              )}
              {activeTab === "permissions" && isAdmin && (
                <EffectivePermissionsPanel userId={detail.id} />
              )}
            </>
          )}
        </div>

        <DialogFooter className="shrink-0 sm:justify-between">
          <span className="text-xs text-muted-foreground self-center">
            {activeTab === "orgs"
              ? "Organization access is saved with its own button above."
              : activeTab === "permissions"
                ? "This tab is read-only."
                : detailsDirty
                  ? "You have unsaved detail changes."
                  : ""}
          </span>
          <div className="flex gap-2">
            <Button variant="outline" onClick={requestClose}>
              {hasUnsaved ? "Close" : "Cancel"}
            </Button>
            {activeTab === "details" && (
              <Button
                onClick={handleSubmit}
                disabled={
                  updateMutation.isPending || isLoading || isError || !detail || isProtected || !detailsDirty
                }
                data-testid="save-user-details"
              >
                {updateMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Save Details
              </Button>
            )}
          </div>
        </DialogFooter>
      </DialogContent>

      {/* Closing with unsaved work requires an explicit decision. */}
      <Dialog open={pendingClose} onOpenChange={setPendingClose}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-500" />
              Discard unsaved changes?
            </DialogTitle>
            <DialogDescription>
              {[
                detailsDirty && "user details",
                orgsDirty && "organization access",
              ]
                .filter(Boolean)
                .join(" and ")}{" "}
              {detailsDirty && orgsDirty ? "have" : "has"} unsaved changes. Closing now discards
              them — nothing has been written.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPendingClose(false)}>
              Keep Editing
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                setPendingClose(false);
                onClose();
              }}
            >
              Discard &amp; Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Dialog>
  );
}

// ─── Reset Password Dialog ────────────────────────────────────────────────────

function ResetPasswordDialog({
  user,
  open,
  onClose,
}: {
  user: User | null;
  open: boolean;
  onClose: () => void;
}) {
  const { toast } = useToast();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");

  const mutation = useResetUserPassword();

  const handleSubmit = async () => {
    if (password.length < 8) {
      setError("Password must be at least 8 characters");
      return;
    }
    if (password !== confirm) {
      setError("Passwords do not match");
      return;
    }
    if (!user) return;
    try {
      await mutation.mutateAsync({ id: user.id, data: { password } });
      toast({ title: "Password reset successfully" });
      setPassword("");
      setConfirm("");
      setError("");
      onClose();
    } catch {
      toast({ title: "Failed to reset password", variant: "destructive" });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Reset Password</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          Setting a new password for{" "}
          <span className="font-medium text-foreground">{user?.name}</span>
          {" "}({user?.email}).
        </p>
        <div className="space-y-3 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="rp-new">New Password</Label>
            <Input
              id="rp-new"
              type="password"
              value={password}
              onChange={(e) => { setPassword(e.target.value); setError(""); }}
              placeholder="Min. 8 characters"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="rp-confirm">Confirm Password</Label>
            <Input
              id="rp-confirm"
              type="password"
              value={confirm}
              onChange={(e) => { setConfirm(e.target.value); setError(""); }}
              placeholder="Repeat password"
            />
          </div>
          {error && <p className="text-xs text-red-500">{error}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={mutation.isPending}>
            {mutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Reset Password
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Confirm Dialog ───────────────────────────────────────────────────────────

function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  description,
  confirmLabel,
  destructive,
  loading,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  description: React.ReactNode;
  confirmLabel: string;
  destructive?: boolean;
  loading?: boolean;
}) {
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <div className="text-sm text-muted-foreground py-2">{description}</div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant={destructive ? "destructive" : "default"}
            onClick={onConfirm}
            disabled={loading}
          >
            {loading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

type DialogKind = "create" | "invite" | "edit" | "reset-password" | "deactivate" | "activate" | "delete";

export default function Users() {
  const { user: me } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const isAdmin = me?.role === "admin";
  const canInvite = isAdmin;

  const { data: emailStatus } = useQuery({
    queryKey: ["invitations", "email-status"],
    queryFn: async () => {
      const token = localStorage.getItem("auth_token");
      const base = (import.meta.env.BASE_URL ?? "").replace(/\/$/, "");
      const res = await fetch(`${base}/api/invitations/email-status`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) return { emailConfigured: true };
      return res.json() as Promise<{ emailConfigured: boolean }>;
    },
    staleTime: 60_000,
    enabled: canInvite,
  });

  const emailConfigured = emailStatus?.emailConfigured ?? true;
  const emailNotConfigured = canInvite && emailStatus !== undefined && !emailStatus.emailConfigured;

  const { data: users = [], isLoading } = useListUsers({
    query: { queryKey: getListUsersQueryKey() },
  });

  const deactivateMutation = useDeactivateUser();
  const activateMutation = useActivateUser();
  const deleteMutation = useDeleteUser();
  const mfaResetMutation = useMfaReset();
  const unlockMutation = useUnlockUser();
  const requireMfaMutation = useMfaRequireUser();
  const disableMfaMutation = useMfaDisable();
  const resendMutation = useResendInvitation();
  const cancelMutation = useCancelInvitation();

  const sendResetMutation = useMutation({
    mutationFn: async (userId: string) => {
      const token = localStorage.getItem("auth_token");
      const base = (import.meta.env.BASE_URL ?? "").replace(/\/$/, "");
      const res = await fetch(`${base}/api/users/${userId}/send-password-reset`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to send reset email");
      return data as { success: boolean; emailSent: boolean; resetUrl?: string };
    },
  });

  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [openDialog, setOpenDialog] = useState<DialogKind | null>(null);
  const [search, setSearch] = useState("");
  const [pendingInviteUrl, setPendingInviteUrl] = useState<string | null>(null);

  const open = (kind: DialogKind, user: User | null = null) => {
    setSelectedUser(user);
    setOpenDialog(kind);
  };
  const close = () => {
    setOpenDialog(null);
    setSelectedUser(null);
  };

  const invalidate = () => qc.invalidateQueries({ queryKey: getListUsersQueryKey() });

  const handleMfaReset = async (u: User) => {
    try {
      await mfaResetMutation.mutateAsync({ data: { userId: u.id } });
      toast({ title: `MFA reset for ${u.name}. They must re-enroll on next login.` });
      invalidate();
    } catch {
      toast({ title: "Failed to reset MFA", variant: "destructive" });
    }
  };

  const handleUnlock = async (u: User) => {
    try {
      await unlockMutation.mutateAsync({ data: { userId: u.id } });
      toast({ title: `Account unlocked for ${u.name}` });
      invalidate();
    } catch {
      toast({ title: "Failed to unlock account", variant: "destructive" });
    }
  };

  const handleRequireMfa = async (u: User, required: boolean) => {
    try {
      await requireMfaMutation.mutateAsync({ data: { userId: u.id, mfaRequired: required } });
      toast({ title: required ? `MFA required for ${u.name}` : `MFA no longer required for ${u.name}` });
      invalidate();
    } catch {
      toast({ title: "Failed to update MFA requirement", variant: "destructive" });
    }
  };

  const handleDisableMfa = async (u: User) => {
    try {
      await disableMfaMutation.mutateAsync({ data: { userId: u.id } });
      toast({ title: `MFA disabled for ${u.name}` });
      invalidate();
    } catch {
      toast({ title: "Failed to disable MFA", variant: "destructive" });
    }
  };

  const handleDeactivate = async () => {
    if (!selectedUser) return;
    try {
      await deactivateMutation.mutateAsync({ id: selectedUser.id });
      toast({ title: `${selectedUser.name} deactivated` });
      invalidate();
      close();
    } catch (err: any) {
      toast({
        title: err?.response?.data?.error ?? "Failed to deactivate user",
        variant: "destructive",
      });
    }
  };

  const handleActivate = async () => {
    if (!selectedUser) return;
    try {
      await activateMutation.mutateAsync({ id: selectedUser.id });
      toast({ title: `${selectedUser.name} reactivated` });
      invalidate();
      close();
    } catch (err: any) {
      toast({
        title: err?.response?.data?.error ?? "Failed to activate user",
        variant: "destructive",
      });
    }
  };

  const handleDelete = async () => {
    if (!selectedUser) return;
    try {
      await deleteMutation.mutateAsync({ id: selectedUser.id });
      toast({ title: `${selectedUser.name} deleted` });
      invalidate();
      close();
    } catch (err: any) {
      toast({
        title: err?.response?.data?.error ?? "Failed to delete user",
        variant: "destructive",
      });
    }
  };

  const handleResendInvite = async (u: User) => {
    try {
      const result = await resendMutation.mutateAsync({ id: u.id, data: {} });
      if (result.inviteUrl && !result.emailSent) {
        setPendingInviteUrl(result.inviteUrl);
      } else {
        toast({ title: `Invitation resent to ${u.email}` });
      }
      invalidate();
    } catch (err: any) {
      toast({ title: err?.response?.data?.error ?? "Failed to resend invitation", variant: "destructive" });
    }
  };

  const handleCopyInviteLink = async (u: User) => {
    try {
      const result = await resendMutation.mutateAsync({ id: u.id, data: { sendEmail: false } });
      if (result.inviteUrl) {
        try {
          await navigator.clipboard.writeText(result.inviteUrl);
          toast({ title: "Invite link copied to clipboard" });
        } catch {
          setPendingInviteUrl(result.inviteUrl);
        }
      }
      invalidate();
    } catch (err: any) {
      toast({ title: err?.response?.data?.error ?? "Failed to get invite link", variant: "destructive" });
    }
  };

  const handleCancelInvite = async (u: User) => {
    try {
      await cancelMutation.mutateAsync({ id: u.id });
      toast({ title: `Invitation cancelled for ${u.email}` });
      invalidate();
    } catch (err: any) {
      toast({ title: err?.response?.data?.error ?? "Failed to cancel invitation", variant: "destructive" });
    }
  };

  const handleSendPasswordReset = async (u: User) => {
    try {
      const result = await sendResetMutation.mutateAsync(u.id);
      if (result.resetUrl && !result.emailSent) {
        setPendingInviteUrl(result.resetUrl);
      } else {
        toast({ title: `Password reset email sent to ${u.email}` });
      }
    } catch (err: any) {
      toast({ title: err?.message ?? "Failed to send password reset email", variant: "destructive" });
    }
  };

  const filteredUsers = users.filter((u) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      u.name.toLowerCase().includes(q) ||
      u.email.toLowerCase().includes(q) ||
      (u.title ?? "").toLowerCase().includes(q) ||
      (u.department ?? "").toLowerCase().includes(q) ||
      u.role.toLowerCase().includes(q)
    );
  });

  const isInvited = (u: User) => (u as any).status === "invited";

  function UserStatusBadge({ u }: { u: User }) {
    const status: string = (u as any).status ?? (u.isActive ? "active" : "deactivated");
    switch (status) {
      case "invited":
        return (
          <Badge variant="outline" className="border-amber-400 text-amber-700 gap-1 text-xs bg-amber-50">
            <Mail className="h-3 w-3" /> Invited
          </Badge>
        );
      case "pending_setup":
        return (
          <Badge variant="outline" className="border-blue-400 text-blue-700 gap-1 text-xs bg-blue-50">
            Pending Setup
          </Badge>
        );
      case "active":
        return (
          <Badge className="bg-green-600 hover:bg-green-600 text-white text-xs">Active</Badge>
        );
      case "suspended":
        return (
          <Badge variant="outline" className="border-orange-400 text-orange-700 text-xs bg-orange-50">
            Suspended
          </Badge>
        );
      case "deactivated":
        return <Badge variant="secondary" className="text-xs">Deactivated</Badge>;
      default:
        return <Badge variant="secondary" className="text-xs">{status}</Badge>;
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">Users & Roles</h1>
          <p className="text-muted-foreground text-sm mt-1">
            {users.length} user{users.length !== 1 ? "s" : ""} total
          </p>
        </div>
        {isAdmin && (
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => open("create")} className="gap-2">
              <UserPlus className="h-4 w-4" />
              Create User
            </Button>
            <Button onClick={() => open("invite")} className="gap-2">
              <Mail className="h-4 w-4" />
              Invite User
            </Button>
          </div>
        )}
      </div>

      {/* Proactive no-email alert */}
      {emailNotConfigured && !pendingInviteUrl && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 flex items-start gap-3">
          <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
          <div className="text-sm text-amber-800">
            <p className="font-semibold">Email delivery not configured</p>
            <p className="text-amber-700 mt-0.5">
              Invitation emails won't be sent automatically. When you invite a user, you'll receive a link to share manually.
              Configure your email provider in <strong>Settings &gt; Email Delivery</strong> to enable automatic sending.
            </p>
          </div>
        </div>
      )}

      {/* Invite URL banner (shown when email not configured) */}
      {pendingInviteUrl && (
        <InviteUrlBanner url={pendingInviteUrl} onDismiss={() => setPendingInviteUrl(null)} />
      )}

      {/* Legacy Role Migration Report — admin only */}
      {isAdmin && <MigrationReportCard />}

      {/* Search */}
      <div className="flex gap-3 items-center">
        <Input
          placeholder="Search by name, email, role, title…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-sm"
        />
        {search && (
          <Button variant="ghost" size="sm" onClick={() => setSearch("")}>
            Clear
          </Button>
        )}
      </div>

      {/* Table */}
      <Card>
        <CardContent className="pt-0">
          {isLoading ? (
            <div className="flex items-center gap-2 py-10 justify-center text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" />
              Loading users…
            </div>
          ) : filteredUsers.length === 0 ? (
            <div className="text-center py-10 text-muted-foreground text-sm">
              {search ? "No users match your search." : "No users found."}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Platform Role</TableHead>
                  <TableHead>Organization Access</TableHead>
                  <TableHead>Title / Dept</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>MFA</TableHead>
                  <TableHead>Last Login</TableHead>
                  {isAdmin && <TableHead className="w-10" />}
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredUsers.map((u) => (
                  <TableRow
                    key={u.id}
                    className={cn(!u.isActive && !isInvited(u) && "opacity-50")}
                  >
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-2 flex-wrap">
                        {isGlobalAdminRole(u.role) && (
                          <ShieldCheck className="h-3.5 w-3.5 text-blue-500 shrink-0" />
                        )}
                        {u.name}
                        {u.id === me?.id && (
                          <Badge variant="secondary" className="text-[10px] px-1 py-0">
                            You
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{u.email}</TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={cn(
                          "text-xs font-normal",
                          isGlobalAdminRole(u.role) && "border-blue-400 text-blue-700 bg-blue-50",
                        )}
                      >
                        {platformRoleLabel(u.role)}
                      </Badge>
                    </TableCell>
                    <TableCell className="py-2">
                      <UserOrgSummary user={u} />
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {u.title || "—"}
                      {u.department ? (
                        <span className="text-xs ml-1">({u.department})</span>
                      ) : null}
                    </TableCell>
                    <TableCell>
                      <UserStatusBadge u={u} />
                    </TableCell>
                    <TableCell>
                      {isInvited(u) ? (
                        <Badge variant="outline" className="text-muted-foreground text-xs">—</Badge>
                      ) : u.mfaEnabled && !u.mfaResetRequired ? (
                        <Badge variant="outline" className="border-green-500 text-green-700 gap-1 text-xs">
                          <ShieldCheck className="h-3 w-3" /> Enabled
                        </Badge>
                      ) : u.mfaResetRequired ? (
                        <Badge variant="outline" className="border-amber-500 text-amber-700 gap-1 text-xs">
                          <ShieldCheck className="h-3 w-3" /> Reset Required
                        </Badge>
                      ) : u.mfaRequired ? (
                        <Badge variant="outline" className="border-blue-500 text-blue-700 gap-1 text-xs">
                          <ShieldCheck className="h-3 w-3" /> Required
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-muted-foreground text-xs">
                          Off
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {isInvited(u) ? (
                        <div className="space-y-0.5">
                          <div className="text-xs text-amber-700">
                            Invited {formatDate((u as any).invitedAt ?? u.createdAt)}
                          </div>
                          {(u as any).invitationExpiresAt && (
                            <div className={cn(
                              "text-xs flex items-center gap-1",
                              new Date((u as any).invitationExpiresAt) < new Date()
                                ? "text-red-600"
                                : "text-slate-500",
                            )}>
                              <Clock className="h-3 w-3" />
                              {new Date((u as any).invitationExpiresAt) < new Date()
                                ? "Expired"
                                : `Expires ${formatDate((u as any).invitationExpiresAt)}`}
                            </div>
                          )}
                        </div>
                      ) : (
                        formatDate(u.lastLoginAt ?? null)
                      )}
                    </TableCell>
                    {isAdmin && (
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            {isInvited(u) ? (
                              <>
                                <DropdownMenuItem
                                  onClick={() => handleResendInvite(u)}
                                  className="gap-2"
                                  disabled={resendMutation.isPending}
                                >
                                  <RefreshCw className="h-4 w-4" />
                                  Resend Invitation
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  onClick={() => handleCopyInviteLink(u)}
                                  className="gap-2"
                                  disabled={resendMutation.isPending}
                                >
                                  <Copy className="h-4 w-4" />
                                  Copy Invite Link
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                  onClick={() => handleCancelInvite(u)}
                                  className="gap-2 text-red-600 focus:text-red-600"
                                  disabled={cancelMutation.isPending}
                                >
                                  <Ban className="h-4 w-4" />
                                  Cancel Invitation
                                </DropdownMenuItem>
                              </>
                            ) : (
                              <>
                                <DropdownMenuItem
                                  onClick={() => open("edit", u)}
                                  className="gap-2"
                                >
                                  <Pencil className="h-4 w-4" />
                                  Edit User
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  onClick={() => open("reset-password", u)}
                                  className="gap-2"
                                >
                                  <Key className="h-4 w-4" />
                                  Reset Password
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  onClick={() => handleSendPasswordReset(u)}
                                  className="gap-2"
                                  disabled={sendResetMutation.isPending}
                                >
                                  <MailCheck className="h-4 w-4" />
                                  Send Reset Email
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                {u.isActive ? (
                                  <DropdownMenuItem
                                    onClick={() => open("deactivate", u)}
                                    className="gap-2"
                                    disabled={u.id === me?.id}
                                  >
                                    <UserX className="h-4 w-4" />
                                    Deactivate
                                  </DropdownMenuItem>
                                ) : (
                                  <DropdownMenuItem
                                    onClick={() => open("activate", u)}
                                    className="gap-2"
                                  >
                                    <UserCheck className="h-4 w-4" />
                                    Reactivate
                                  </DropdownMenuItem>
                                )}
                                <DropdownMenuSeparator />
                                {u.mfaEnabled ? (
                                  <>
                                    <DropdownMenuItem
                                      onClick={() => handleMfaReset(u)}
                                      className="gap-2"
                                    >
                                      <ShieldCheck className="h-4 w-4" />
                                      Reset MFA
                                    </DropdownMenuItem>
                                    <DropdownMenuItem
                                      onClick={() => handleDisableMfa(u)}
                                      className="gap-2 text-amber-600 focus:text-amber-600"
                                      disabled={u.id === me?.id}
                                    >
                                      <ShieldCheck className="h-4 w-4" />
                                      Disable MFA
                                    </DropdownMenuItem>
                                  </>
                                ) : (
                                  <DropdownMenuItem
                                    onClick={() => handleRequireMfa(u, !u.mfaRequired)}
                                    className="gap-2"
                                    disabled={u.id === me?.id}
                                  >
                                    <ShieldCheck className="h-4 w-4" />
                                    {u.mfaRequired ? "Remove MFA Requirement" : "Require MFA"}
                                  </DropdownMenuItem>
                                )}
                                {u.lockedUntil && new Date(u.lockedUntil) > new Date() && (
                                  <DropdownMenuItem
                                    onClick={() => handleUnlock(u)}
                                    className="gap-2"
                                  >
                                    <ShieldCheck className="h-4 w-4" />
                                    Unlock Account
                                  </DropdownMenuItem>
                                )}
                              </>
                            )}
                            <>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                onClick={() => open("delete", u)}
                                className="gap-2 text-red-600 focus:text-red-600"
                                disabled={u.id === me?.id}
                              >
                                <Trash2 className="h-4 w-4" />
                                Delete User
                              </DropdownMenuItem>
                            </>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Create User Dialog */}
      <CreateUserDialog
        open={openDialog === "create"}
        onClose={close}
        onCreated={invalidate}
      />

      {/* Invite Dialog */}
      <InviteDialog
        open={openDialog === "invite"}
        onClose={close}
        emailConfigured={emailConfigured}
        onInvited={(url) => {
          invalidate();
          if (url) setPendingInviteUrl(url);
          else toast({ title: "Invitation sent successfully" });
        }}
      />

      {/* Edit Dialog */}
      <EditDialog
        user={selectedUser}
        open={openDialog === "edit"}
        onClose={close}
        onSuccess={invalidate}
      />

      {/* Reset Password */}
      <ResetPasswordDialog
        user={selectedUser}
        open={openDialog === "reset-password"}
        onClose={close}
      />

      {/* Deactivate */}
      <ConfirmDialog
        open={openDialog === "deactivate"}
        onClose={close}
        onConfirm={handleDeactivate}
        title="Deactivate User?"
        description={
          <>
            <span className="font-medium text-foreground">{selectedUser?.name}</span>{" "}
            will be immediately signed out and unable to log in. Their audit
            history will be preserved.
          </>
        }
        confirmLabel="Deactivate"
        loading={deactivateMutation.isPending}
      />

      {/* Activate */}
      <ConfirmDialog
        open={openDialog === "activate"}
        onClose={close}
        onConfirm={handleActivate}
        title="Reactivate User?"
        description={
          <>
            Restore login access for{" "}
            <span className="font-medium text-foreground">{selectedUser?.name}</span>.
          </>
        }
        confirmLabel="Reactivate"
        loading={activateMutation.isPending}
      />

      {/* Delete */}
      <ConfirmDialog
        open={openDialog === "delete"}
        onClose={close}
        onConfirm={handleDelete}
        title="Permanently Delete User?"
        description={
          <div className="space-y-2">
            <p>
              This will permanently delete{" "}
              <span className="font-medium text-foreground">{selectedUser?.name}</span>{" "}
              ({selectedUser?.email}) and remove all their organization access.
            </p>
            <p className="text-amber-600 font-medium text-xs">
              If this user has audit history, consider deactivating instead.
            </p>
          </div>
        }
        confirmLabel="Delete Permanently"
        destructive
        loading={deleteMutation.isPending}
      />
    </div>
  );
}
