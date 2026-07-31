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

interface PreAssessmentFeatureContextValue {
  isPreAssessmentEnabled: boolean;
  isLoading: boolean;
}

const PreAssessmentFeatureContext = createContext<PreAssessmentFeatureContextValue>({
  isPreAssessmentEnabled: true,
  isLoading: false,
});

export function PreAssessmentFeatureProvider({ children }: { children: ReactNode }) {
  const { activeOrg } = useOrg();

  const { data, isLoading } = useQuery<Array<{ featureKey: string; enabled: boolean }>>({
    queryKey: ["org-features", activeOrg?.id],
    enabled: !!activeOrg?.id,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const res = await fetch(`/api/organizations/${activeOrg!.id}/features`, {
        headers: makeHeaders(activeOrg!.id),
      });
      if (!res.ok) return []; // fail open
      return res.json();
    },
  });

  const preAssessmentFeature = data?.find((f) => f.featureKey === "PRE_ASSESSMENT");
  const isPreAssessmentEnabled = isLoading || !data ? true : (preAssessmentFeature?.enabled ?? true);

  return (
    <PreAssessmentFeatureContext.Provider value={{ isPreAssessmentEnabled, isLoading }}>
      {children}
    </PreAssessmentFeatureContext.Provider>
  );
}

export function usePreAssessmentFeature() {
  return useContext(PreAssessmentFeatureContext);
}
