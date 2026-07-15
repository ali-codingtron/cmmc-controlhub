import { useState } from "react";
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
  useGetUserOrgs,
  getGetUserOrgsQueryKey,
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
import type { User, UserOrgMembership, OrganizationSummary } from "@workspace/api-client-react";
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

const GLOBAL_ROLES = [
  { value: "admin", label: "Global Admin" },
  { value: "compliance_manager", label: "Compliance Manager" },
  { value: "it_contributor", label: "IT Contributor" },
  { value: "reviewer", label: "Reviewer" },
  { value: "executive_viewer", label: "Executive Viewer" },
  { value: "assessor", label: "Assessor Read-Only" },
] as const;

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

function globalRoleLabel(role: string) {
  return GLOBAL_ROLES.find((r) => r.value === role)?.label ?? role;
}

function orgRoleLabel(role: string) {
  return ORG_ROLES.find((r) => r.value === role)?.label ?? role;
}

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
            placeholder="Jane Smith"
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
            placeholder="jane@example.com"
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
        <Label htmlFor="uf-role">
          Role <span className="text-red-500">*</span>
        </Label>
        <Select
          value={data.role}
          onValueChange={(v) => onChange("role", v)}
        >
          <SelectTrigger id="uf-role" className={errors.role ? "border-red-500" : ""}>
            <SelectValue placeholder="Select role…" />
          </SelectTrigger>
          <SelectContent>
            {GLOBAL_ROLES.map((r) => (
              <SelectItem key={r.value} value={r.value}>
                {r.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {errors.role && <p className="text-xs text-red-500">{errors.role}</p>}
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label htmlFor="uf-title">Title</Label>
          <Input
            id="uf-title"
            value={data.title}
            onChange={(e) => onChange("title", e.target.value)}
            placeholder="Security Engineer"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="uf-dept">Department</Label>
          <Input
            id="uf-dept"
            value={data.department}
            onChange={(e) => onChange("department", e.target.value)}
            placeholder="IT / Security"
          />
        </div>
      </div>
    </div>
  );
}

// ─── Org Memberships Panel ────────────────────────────────────────────────────

function OrgMembershipsPanel({ userId }: { userId: string }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const { data: memberships = [], isLoading } = useGetUserOrgs(userId);
  const { data: allOrgs = [] } = useListOrganizations({
    query: { queryKey: ["organizations"] },
  });

  const addMutation = useAddUserToOrg();
  const updateMutation = useUpdateUserOrgMembership();
  const removeMutation = useRemoveUserFromOrg();

  const [addOrgId, setAddOrgId] = useState("");
  const [addRole, setAddRole] = useState("it_contributor");
  const [addStatus, setAddStatus] = useState("active");
  const [showAddRow, setShowAddRow] = useState(false);

  const assignedOrgIds = new Set(memberships.map((m) => m.organizationId));
  const availableOrgs = allOrgs.filter((o) => !assignedOrgIds.has(o.id));

  const invalidate = () =>
    qc.refetchQueries({ queryKey: getGetUserOrgsQueryKey(userId), exact: true });

  const handleAdd = async () => {
    if (!addOrgId || !addRole) return;
    try {
      await addMutation.mutateAsync({
        id: userId,
        data: { organizationId: addOrgId, role: addRole as any, status: addStatus as any },
      });
      setAddOrgId("");
      setAddRole("it_contributor");
      setAddStatus("active");
      setShowAddRow(false);
      await invalidate();
      toast({ title: "Organization access granted" });
    } catch {
      toast({ title: "Failed to add organization", variant: "destructive" });
    }
  };

  const handleUpdateRole = async (membership: UserOrgMembership, role: string) => {
    try {
      await updateMutation.mutateAsync({
        id: userId,
        orgId: membership.organizationId,
        data: { role: role as any },
      });
      await invalidate();
    } catch {
      toast({ title: "Failed to update role", variant: "destructive" });
    }
  };

  const handleUpdateStatus = async (membership: UserOrgMembership, status: string) => {
    try {
      await updateMutation.mutateAsync({
        id: userId,
        orgId: membership.organizationId,
        data: { status: status as any },
      });
      await invalidate();
    } catch {
      toast({ title: "Failed to update status", variant: "destructive" });
    }
  };

  const handleRemove = async (membership: UserOrgMembership) => {
    try {
      await removeMutation.mutateAsync({ id: userId, orgId: membership.organizationId });
      await invalidate();
      toast({ title: "Organization access removed" });
    } catch {
      toast({ title: "Failed to remove organization", variant: "destructive" });
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 py-4 text-muted-foreground text-sm">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading organizations…
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {memberships.length === 0 ? (
        <p className="text-sm text-muted-foreground">No organization access assigned.</p>
      ) : (
        <div className="space-y-2">
          {memberships.map((m) => (
            <div
              key={m.membershipId}
              className="flex items-center gap-2 rounded-md border px-3 py-2 bg-muted/30"
            >
              <Building2 className="h-4 w-4 text-muted-foreground shrink-0" />
              <span className="text-sm font-medium flex-1 min-w-0 truncate">
                {m.organizationName}
              </span>
              <Select
                value={m.role}
                onValueChange={(v) => handleUpdateRole(m, v)}
              >
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
              <Select
                value={m.status}
                onValueChange={(v) => handleUpdateStatus(m, v)}
              >
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
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-muted-foreground hover:text-red-500"
                onClick={() => handleRemove(m)}
              >
                <X className="h-3.5 w-3.5" />
              </Button>
            </div>
          ))}
        </div>
      )}

      {showAddRow ? (
        <div className="flex items-center gap-2 rounded-md border px-3 py-2 bg-blue-50/50 border-blue-200">
          <Select value={addOrgId} onValueChange={setAddOrgId}>
            <SelectTrigger className="h-7 flex-1 text-xs">
              <SelectValue placeholder="Select organization…" />
            </SelectTrigger>
            <SelectContent>
              {availableOrgs.map((o) => (
                <SelectItem key={o.id} value={o.id} className="text-xs">
                  {o.name}
                </SelectItem>
              ))}
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
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={() => setShowAddRow(false)}
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      ) : (
        availableOrgs.length > 0 && (
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5 text-xs"
            onClick={() => setShowAddRow(true)}
          >
            <Plus className="h-3.5 w-3.5" />
            Add Organization Access
          </Button>
        )
      )}
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
    if (!form.role) errs.role = "Role is required";
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
                  placeholder="Jane Smith"
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
                  placeholder="jane@example.com"
                  className={errors.email ? "border-red-500" : ""}
                />
                {errors.email && <p className="text-xs text-red-500">{errors.email}</p>}
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="inv-role">
                Role <span className="text-red-500">*</span>
              </Label>
              <Select value={form.role} onValueChange={(v) => setField("role", v)}>
                <SelectTrigger id="inv-role" className={errors.role ? "border-red-500" : ""}>
                  <SelectValue placeholder="Select role…" />
                </SelectTrigger>
                <SelectContent>
                  {GLOBAL_ROLES.map((r) => (
                    <SelectItem key={r.value} value={r.value}>
                      {r.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errors.role && <p className="text-xs text-red-500">{errors.role}</p>}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="inv-title">Title</Label>
                <Input
                  id="inv-title"
                  value={form.title}
                  onChange={(e) => setField("title", e.target.value)}
                  placeholder="Security Engineer"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="inv-dept">Department</Label>
                <Input
                  id="inv-dept"
                  value={form.department}
                  onChange={(e) => setField("department", e.target.value)}
                  placeholder="IT / Security"
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

  const createMutation = useCreateUser();

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
    if (!form.role) errs.role = "Role is required";
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleClose = () => {
    setForm(EMPTY_CREATE);
    setErrors({});
    onClose();
  };

  const handleSubmit = async () => {
    if (!validate()) return;
    try {
      await createMutation.mutateAsync({
        data: {
          name: form.name.trim(),
          email: form.email.trim(),
          password: form.password,
          role: form.role as any,
          title: form.title || undefined,
          department: form.department || undefined,
        },
      });
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
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserPlus className="h-5 w-5 text-primary" />
            Create User
          </DialogTitle>
          <DialogDescription>
            Create a user with an immediate password. They can log in right away.
          </DialogDescription>
        </DialogHeader>

        <UserForm data={form} onChange={setField} isEdit={false} errors={errors} />

        <DialogFooter>
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

// ─── Edit Dialog ───────────────────────────────────────────────────────────────

const EMPTY_FORM: UserFormData = {
  name: "",
  email: "",
  password: "",
  role: "it_contributor",
  title: "",
  department: "",
};

interface EditDialogProps {
  user: User | null;
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

function EditDialog({ user, open, onClose, onSuccess }: EditDialogProps) {
  const { toast } = useToast();

  const [form, setForm] = useState<UserFormData>(() =>
    user
      ? {
          name: user.name,
          email: user.email,
          password: "",
          role: user.role,
          title: user.title ?? "",
          department: user.department ?? "",
        }
      : EMPTY_FORM
  );
  const [errors, setErrors] = useState<Partial<Record<keyof UserFormData, string>>>({});
  const [activeTab, setActiveTab] = useState<"details" | "orgs">("details");

  const updateMutation = useUpdateUser();

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
    if (!form.role) errs.role = "Role is required";
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = async () => {
    if (!validate()) return;
    try {
      await updateMutation.mutateAsync({
        id: user!.id,
        data: {
          name: form.name,
          email: form.email,
          role: form.role as any,
          title: form.title || undefined,
          department: form.department || undefined,
        },
      });
      toast({ title: "User updated successfully" });
      onSuccess();
      onClose();
    } catch (err: any) {
      const msg = err?.response?.data?.error ?? "Failed to update user";
      if (msg.toLowerCase().includes("email")) {
        setErrors({ email: "Email already in use" });
      } else {
        toast({ title: msg, variant: "destructive" });
      }
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Edit User</DialogTitle>
        </DialogHeader>

        <div className="flex gap-1 border-b pb-0 -mt-2 shrink-0">
          <button
            onClick={() => setActiveTab("details")}
            className={cn(
              "px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors",
              activeTab === "details"
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            Details
          </button>
          <button
            onClick={() => setActiveTab("orgs")}
            className={cn(
              "px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors flex items-center gap-1.5",
              activeTab === "orgs"
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            <Building2 className="h-3.5 w-3.5" />
            Organization Access
          </button>
        </div>

        <div className="py-2 overflow-y-auto flex-1 min-h-0">
          {activeTab === "details" && (
            <UserForm data={form} onChange={setField} isEdit={true} errors={errors} />
          )}
          {activeTab === "orgs" && user && (
            <OrgMembershipsPanel userId={user.id} />
          )}
        </div>

        <DialogFooter className="shrink-0">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          {activeTab === "details" && (
            <Button onClick={handleSubmit} disabled={updateMutation.isPending}>
              {updateMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Save Changes
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
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
                        {u.role === "admin" && (
                          <ShieldCheck className="h-3.5 w-3.5 text-blue-500 shrink-0" />
                        )}
                        {u.name}
                        {(u as any).isBreakGlass && (
                          <Badge variant="outline" className="border-red-500 text-red-700 gap-1 text-xs bg-red-50 shrink-0">
                            <ShieldAlert className="h-3 w-3" /> Break-Glass
                          </Badge>
                        )}
                        {u.id === me?.id && (
                          <Badge variant="secondary" className="text-[10px] px-1 py-0">
                            You
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{u.email}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-xs font-normal">
                        {globalRoleLabel(u.role)}
                      </Badge>
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
                            {(u as any).isBreakGlass ? (
                              <DropdownMenuItem disabled className="text-xs text-muted-foreground gap-2">
                                <ShieldAlert className="h-4 w-4 text-red-500" />
                                Break-glass account — protected
                              </DropdownMenuItem>
                            ) : isInvited(u) ? (
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
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              onClick={() => open("delete", u)}
                              className="gap-2 text-red-600 focus:text-red-600"
                              disabled={u.id === me?.id}
                            >
                              <Trash2 className="h-4 w-4" />
                              Delete User
                            </DropdownMenuItem>
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
