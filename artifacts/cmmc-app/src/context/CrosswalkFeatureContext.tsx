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

interface CrosswalkFeatureContextValue {
  isCrosswalkEnabled: boolean;
  isLoading: boolean;
}

const CrosswalkFeatureContext = createContext<CrosswalkFeatureContextValue>({
  isCrosswalkEnabled: true,
  isLoading: false,
});

export function CrosswalkFeatureProvider({ children }: { children: ReactNode }) {
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

  const crosswalkFeature = data?.find((f) => f.featureKey === "FRAMEWORK_CROSSWALK");
  const isCrosswalkEnabled = isLoading || !data ? true : (crosswalkFeature?.enabled ?? true);

  return (
    <CrosswalkFeatureContext.Provider value={{ isCrosswalkEnabled, isLoading }}>
      {children}
    </CrosswalkFeatureContext.Provider>
  );
}

export function useCrosswalkFeature() {
  return useContext(CrosswalkFeatureContext);
}
