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

interface RoadmapFeatureContextValue {
  isRoadmapEnabled: boolean;
  isLoading: boolean;
}

const RoadmapFeatureContext = createContext<RoadmapFeatureContextValue>({
  isRoadmapEnabled: true,
  isLoading: false,
});

export function RoadmapFeatureProvider({ children }: { children: ReactNode }) {
  const { activeOrg } = useOrg();

  const { data, isLoading } = useQuery<Array<{ featureKey: string; enabled: boolean }>>({
    queryKey: ["org-features", activeOrg?.id],
    enabled: !!activeOrg?.id,
    staleTime: 5 * 60 * 1000, // 5 min
    queryFn: async () => {
      const res = await fetch(`/api/organizations/${activeOrg!.id}/features`, {
        headers: makeHeaders(activeOrg!.id),
      });
      if (!res.ok) return []; // fail open
      return res.json();
    },
  });

  const roadmapFeature = data?.find((f) => f.featureKey === "IMPLEMENTATION_ROADMAP");
  const isRoadmapEnabled = isLoading || !data ? true : (roadmapFeature?.enabled ?? true);

  return (
    <RoadmapFeatureContext.Provider value={{ isRoadmapEnabled, isLoading }}>
      {children}
    </RoadmapFeatureContext.Provider>
  );
}

export function useRoadmapFeature() {
  return useContext(RoadmapFeatureContext);
}
