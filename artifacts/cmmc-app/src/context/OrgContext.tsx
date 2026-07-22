import { createContext, useContext, useEffect, useState, useCallback, useRef } from "react";
import { setOrgIdGetter } from "@workspace/api-client-react";
import { useAuth } from "@/lib/auth";

const ORG_STORAGE_KEY = "cmmc_active_org_id";

export interface OrgSummary {
  id: string;
  name: string;
  shortName: string | null;
  cmmcTargetLevel: string | null;
  industry: string | null;
  isActive: boolean;
  isTestOrganization: boolean;
  certificationModuleState: string;
  role: string;
}

interface OrgContextType {
  activeOrg: OrgSummary | null;
  orgs: OrgSummary[];
  isLoading: boolean;
  setActiveOrg: (org: OrgSummary) => void;
  refreshOrgs: () => Promise<void>;
}

const OrgContext = createContext<OrgContextType | undefined>(undefined);

export function OrgProvider({ children }: { children: React.ReactNode }) {
  const { user, isLoading: authLoading } = useAuth();
  const [orgs, setOrgs] = useState<OrgSummary[]>([]);
  const [activeOrg, setActiveOrgState] = useState<OrgSummary | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const activeOrgRef = useRef<string | null>(null);

  useEffect(() => {
    setOrgIdGetter(() => activeOrgRef.current);
    return () => setOrgIdGetter(null);
  }, []);

  const fetchOrgs = useCallback(async () => {
    const token = localStorage.getItem("auth_token");
    if (!token) return;

    setIsLoading(true);
    try {
      const r = await fetch("/api/organizations/my-orgs", {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      const data: OrgSummary[] = r.ok ? await r.json() : [];
      setOrgs(data);

      // Keep the currently active org if it still exists; otherwise pick the first.
      setActiveOrgState((prev) => {
        const savedId = prev?.id ?? localStorage.getItem(ORG_STORAGE_KEY);
        const kept = data.find((o) => o.id === savedId) ?? data[0] ?? null;
        activeOrgRef.current = kept?.id ?? null;
        if (kept) localStorage.setItem(ORG_STORAGE_KEY, kept.id);
        return kept;
      });
    } catch {
      setOrgs([]);
      setActiveOrgState(null);
      activeOrgRef.current = null;
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    // Wait for auth to finish resolving before acting — prevents a premature
    // isLoading=false while the JWT is still being validated.
    if (authLoading) return;

    if (!user) {
      setOrgs([]);
      setActiveOrgState(null);
      activeOrgRef.current = null;
      setIsLoading(false);
      return;
    }
    fetchOrgs();
  }, [user, authLoading, fetchOrgs]);

  const setActiveOrg = useCallback((org: OrgSummary) => {
    setActiveOrgState(org);
    activeOrgRef.current = org.id;
    localStorage.setItem(ORG_STORAGE_KEY, org.id);
  }, []);

  return (
    <OrgContext.Provider value={{ activeOrg, orgs, isLoading, setActiveOrg, refreshOrgs: fetchOrgs }}>
      {children}
    </OrgContext.Provider>
  );
}

export function useOrg() {
  const ctx = useContext(OrgContext);
  if (!ctx) throw new Error("useOrg must be used within OrgProvider");
  return ctx;
}
