import { createContext, useContext } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useGetMe, useLogin, useLogout } from "@workspace/api-client-react";
import type { User, LoginBody } from "@workspace/api-client-react";

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  login: (data: LoginBody) => Promise<void>;
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

  const loginMutation = useLogin();
  const logoutMutation = useLogout();

  const handleLogin = async (data: LoginBody) => {
    const res = await loginMutation.mutateAsync({ data });
    localStorage.setItem("auth_token", res.token);
    // A normal login is never a demo session — clear demo flags so the
    // demo banner doesn't bleed over from a previous demo session.
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
      // Clear all cached query data so the app immediately treats the
      // user as unauthenticated without relying on stale cache.
      await qc.resetQueries({ queryKey: ["me"] });
      qc.clear();
    }
  };

  return (
    <AuthContext.Provider value={{ user: user || null, isLoading, login: handleLogin, logout: handleLogout }}>
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

/** Returns true when the current user has the assessor role (read-only). */
export function useIsAssessor() {
  const { user } = useAuth();
  return user?.role === "assessor";
}
