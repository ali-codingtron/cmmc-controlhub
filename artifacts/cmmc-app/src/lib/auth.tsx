import { createContext, useContext, useState } from "react";
import { useOrg } from "@/context/OrgContext";
import { useQueryClient } from "@tanstack/react-query";
import { useGetMe, useLogin, useLogout } from "@workspace/api-client-react";
import type { User, LoginBody } from "@workspace/api-client-react";

export type MfaChallenge =
  | { type: "mfa_required"; mfaStateToken: string }
  | { type: "mfa_setup_required"; mfaStateToken: string };

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  mfaChallenge: MfaChallenge | null;
  clearMfaChallenge: () => void;
  login: (data: LoginBody) => Promise<void>;
  loginWithToken: (token: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const qc = useQueryClient();
  const { data: user, isLoading, refetch } = useGetMe({
    query: {
      queryKey: ["me"],
      retry: false,
    }
  });
  const [mfaChallenge, setMfaChallenge] = useState<MfaChallenge | null>(null);

  const loginMutation = useLogin();
  const logoutMutation = useLogout();

  const handleLogin = async (data: LoginBody) => {
    const res = await loginMutation.mutateAsync({ data });

    if (res.mfa_required && res.mfa_state_token) {
      setMfaChallenge({ type: "mfa_required", mfaStateToken: res.mfa_state_token });
      return;
    }
    if (res.mfa_setup_required && res.mfa_state_token) {
      setMfaChallenge({ type: "mfa_setup_required", mfaStateToken: res.mfa_state_token });
      return;
    }

    localStorage.setItem("auth_token", res.token);
    localStorage.removeItem("isDemoMode");
    await refetch();
  };

  const handleLoginWithToken = async (token: string) => {
    setMfaChallenge(null);
    localStorage.setItem("auth_token", token);
    localStorage.removeItem("isDemoMode");
    await refetch();
  };

  const handleLogout = async () => {
    try {
      await logoutMutation.mutateAsync();
    } catch {
      // Ignore server errors — the session ends locally regardless
    } finally {
      localStorage.removeItem("auth_token");
      localStorage.removeItem("isDemoMode");
      localStorage.removeItem("cmmc_active_org_id");
      setMfaChallenge(null);
      await qc.resetQueries({ queryKey: ["me"] });
      qc.clear();
    }
  };

  return (
    <AuthContext.Provider value={{
      user: user || null,
      isLoading,
      mfaChallenge,
      clearMfaChallenge: () => setMfaChallenge(null),
      login: handleLogin,
      loginWithToken: handleLoginWithToken,
      logout: handleLogout,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}

/**
 * Returns true when the user's effective role for the active organization is Assessor Read-Only.
 * Uses the org-specific membership role when available; falls back to global role.
 * Global admins are never treated as assessors.
 */
export function useIsAssessor() {
  const { user } = useAuth();
  const { activeOrg } = useOrg();
  if (user?.role === "admin") return false;
  const effectiveRole = activeOrg?.role ?? user?.role;
  return effectiveRole === "assessor";
}
