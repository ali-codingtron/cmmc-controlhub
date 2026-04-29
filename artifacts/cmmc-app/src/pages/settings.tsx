import { useState } from "react";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Eye, EyeOff, User, KeyRound, Shield } from "lucide-react";

function ProfileCard() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [name, setName] = useState(user?.name ?? "");
  const [title, setTitle] = useState("");
  const [department, setDepartment] = useState("");
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      const token = localStorage.getItem("auth_token");
      const res = await fetch("/api/auth/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ name, title, department }),
      });
      if (!res.ok) throw new Error("Failed to update profile");
      toast({ title: "Profile updated" });
    } catch {
      toast({ title: "Error", description: "Could not update profile", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <User className="h-5 w-5 text-primary" />
          <CardTitle>My Profile</CardTitle>
        </div>
        <CardDescription>Update your display name and contact details.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/40 mb-2">
          <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center font-semibold text-primary">
            {(user?.name ?? "?")[0].toUpperCase()}
          </div>
          <div>
            <div className="font-medium">{user?.email}</div>
            <Badge variant="outline" className="text-xs capitalize mt-0.5">
              {user?.role?.replace("_", " ")}
            </Badge>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="col-span-2">
            <Label>Display Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Your full name" />
          </div>
          <div>
            <Label>Title</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Compliance Manager" />
          </div>
          <div>
            <Label>Department</Label>
            <Input value={department} onChange={(e) => setDepartment(e.target.value)} placeholder="e.g. IT Security" />
          </div>
        </div>
        <Button onClick={handleSave} disabled={saving}>
          {saving ? "Saving..." : "Save Profile"}
        </Button>
      </CardContent>
    </Card>
  );
}

function ChangePasswordCard() {
  const { toast } = useToast();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [saving, setSaving] = useState(false);

  const strength = newPassword.length === 0
    ? null
    : newPassword.length < 8
    ? "weak"
    : /[A-Z]/.test(newPassword) && /[0-9]/.test(newPassword) && newPassword.length >= 10
    ? "strong"
    : "moderate";

  const strengthColor = strength === "strong" ? "text-green-600" : strength === "moderate" ? "text-yellow-600" : "text-red-500";

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      toast({ title: "Passwords don't match", variant: "destructive" });
      return;
    }
    if (newPassword.length < 8) {
      toast({ title: "Password must be at least 8 characters", variant: "destructive" });
      return;
    }

    setSaving(true);
    try {
      const token = localStorage.getItem("auth_token");
      const res = await fetch("/api/auth/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to change password");
      toast({ title: "Password changed successfully" });
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <KeyRound className="h-5 w-5 text-primary" />
          <CardTitle>Change Password</CardTitle>
        </div>
        <CardDescription>Use a strong, unique password. Minimum 8 characters.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label>Current Password</Label>
            <div className="relative">
              <Input
                type={showCurrent ? "text" : "password"}
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                placeholder="Enter your current password"
                required
              />
              <button
                type="button"
                onClick={() => setShowCurrent((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                {showCurrent ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          <div>
            <Label>New Password</Label>
            <div className="relative">
              <Input
                type={showNew ? "text" : "password"}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="At least 8 characters"
                required
              />
              <button
                type="button"
                onClick={() => setShowNew((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                {showNew ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            {strength && (
              <p className={`text-xs mt-1 ${strengthColor}`}>
                Password strength: <span className="font-medium capitalize">{strength}</span>
              </p>
            )}
          </div>

          <div>
            <Label>Confirm New Password</Label>
            <Input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Re-enter new password"
              required
            />
            {confirmPassword && newPassword !== confirmPassword && (
              <p className="text-xs mt-1 text-red-500">Passwords do not match</p>
            )}
          </div>

          <Button
            type="submit"
            disabled={saving || !currentPassword || !newPassword || newPassword !== confirmPassword}
          >
            {saving ? "Changing..." : "Change Password"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

function SecurityInfoCard() {
  const { user } = useAuth();
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Shield className="h-5 w-5 text-primary" />
          <CardTitle>Security</CardTitle>
        </div>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <div className="flex justify-between py-2 border-b">
          <span className="text-muted-foreground">Account role</span>
          <Badge variant="outline" className="capitalize">{user?.role?.replace("_", " ")}</Badge>
        </div>
        <div className="flex justify-between py-2 border-b">
          <span className="text-muted-foreground">Authentication</span>
          <span className="font-medium">Password</span>
        </div>
        <div className="flex justify-between py-2">
          <span className="text-muted-foreground">Session storage</span>
          <span className="font-medium">Local (browser)</span>
        </div>
      </CardContent>
    </Card>
  );
}

export default function Settings() {
  return (
    <div className="p-6 space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
        <p className="text-muted-foreground mt-1">Manage your account, password, and preferences.</p>
      </div>

      <ProfileCard />
      <ChangePasswordCard />
      <SecurityInfoCard />
    </div>
  );
}
