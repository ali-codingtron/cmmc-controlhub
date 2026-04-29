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
  role: string;
}

interface OrgContextType {
  activeOrg: OrgSummary | null;
  orgs: OrgSummary[];
  isLoading: boolean;
  setActiveOrg: (org: OrgSummary) => void;
}

const OrgContext = createContext<OrgContextType | undefined>(undefined);

export function OrgProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [orgs, setOrgs] = useState<OrgSummary[]>([]);
  const [activeOrg, setActiveOrgState] = useState<OrgSummary | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const activeOrgRef = useRef<string | null>(null);

  useEffect(() => {
    setOrgIdGetter(() => activeOrgRef.current);
    return () => setOrgIdGetter(null);
  }, []);

  useEffect(() => {
    if (!user) {
      setOrgs([]);
      setActiveOrgState(null);
      activeOrgRef.current = null;
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    const token = localStorage.getItem("auth_token");

    fetch("/api/organizations/my-orgs", {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => (r.ok ? r.json() : []))
      .then((data: OrgSummary[]) => {
        setOrgs(data);

        const savedId = localStorage.getItem(ORG_STORAGE_KEY);
        const saved = data.find((o) => o.id === savedId);
        const first = data[0] ?? null;
        const selected = saved ?? first;

        setActiveOrgState(selected);
        activeOrgRef.current = selected?.id ?? null;
      })
      .catch(() => {
        setOrgs([]);
        setActiveOrgState(null);
        activeOrgRef.current = null;
      })
      .finally(() => setIsLoading(false));
  }, [user]);

  const setActiveOrg = useCallback((org: OrgSummary) => {
    setActiveOrgState(org);
    activeOrgRef.current = org.id;
    localStorage.setItem(ORG_STORAGE_KEY, org.id);
  }, []);

  return (
    <OrgContext.Provider value={{ activeOrg, orgs, isLoading, setActiveOrg }}>
      {children}
    </OrgContext.Provider>
  );
}

export function useOrg() {
  const ctx = useContext(OrgContext);
  if (!ctx) throw new Error("useOrg must be used within OrgProvider");
  return ctx;
}
