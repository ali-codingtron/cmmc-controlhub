/**
 * L1 Assessment Feature Context
 *
 * Provides `isL1Active` — true when the active org has the CMMC L1
 * self-assessment package (pkg-cmmc-l1-self) active.
 */
import { createContext, useContext, ReactNode } from "react";
import { useOrg } from "@/context/OrgContext";
import { useListOrgPackages } from "@workspace/api-client-react";

interface L1AssessmentFeatureContextValue {
  isL1Active: boolean;
  isLoading: boolean;
}

const L1AssessmentFeatureContext = createContext<L1AssessmentFeatureContextValue>({
  isL1Active: false,
  isLoading: false,
});

export function L1AssessmentFeatureProvider({ children }: { children: ReactNode }) {
  const { activeOrg } = useOrg();

  const { data: orgPackages = [], isLoading } = useListOrgPackages(
    activeOrg?.id ?? "",
    { query: { enabled: !!activeOrg?.id, staleTime: 120000 } as any }
  );

  const isL1Active = !isLoading && (orgPackages as any[]).some(
    (p: any) => p.packageId === "pkg-cmmc-l1-self" && p.isActive
  );

  return (
    <L1AssessmentFeatureContext.Provider value={{ isL1Active, isLoading }}>
      {children}
    </L1AssessmentFeatureContext.Provider>
  );
}

export function useL1AssessmentFeature() {
  return useContext(L1AssessmentFeatureContext);
}
