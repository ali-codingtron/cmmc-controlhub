import { createContext, useContext, ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { useOrg } from "@/context/OrgContext";

function makeHeaders(orgId: string) {
  const token = localStorage.getItem("auth_token");
  return {
    Authorization: `Bearer ${token}`,
    "X-Organization-ID": orgId,
    "Content-Type": "application/json",
  };
}

interface DfarsFeatureContextValue {
  isDfarsEnabled: boolean;
  isLoading: boolean;
}

const DfarsFeatureContext = createContext<DfarsFeatureContextValue>({
  isDfarsEnabled: true,
  isLoading: false,
});

export function DfarsFeatureProvider({ children }: { children: ReactNode }) {
  const { activeOrg } = useOrg();

  const { data, isLoading } = useQuery<Array<{ featureKey: string; enabled: boolean }>>({
    queryKey: ["org-features", activeOrg?.id],
    enabled: !!activeOrg?.id,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const res = await fetch(`/api/organizations/${activeOrg!.id}/features`, {
        headers: makeHeaders(activeOrg!.id),
      });
      if (!res.ok) return [];
      return res.json();
    },
  });

  const dfarsFeature = data?.find((f) => f.featureKey === "DFARS_OBLIGATIONS");
  const isDfarsEnabled = isLoading || !data ? true : (dfarsFeature?.enabled ?? true);

  return (
    <DfarsFeatureContext.Provider value={{ isDfarsEnabled, isLoading }}>
      {children}
    </DfarsFeatureContext.Provider>
  );
}

export function useDfarsFeature() {
  return useContext(DfarsFeatureContext);
}
