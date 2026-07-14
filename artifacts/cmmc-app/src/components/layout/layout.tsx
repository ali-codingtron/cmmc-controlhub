import { useState } from "react";
import { useAuth } from "@/lib/auth";
import { useDemoMode } from "@/context/DemoModeContext";
import { Sidebar } from "./sidebar";
import { DemoBanner } from "@/components/DemoBanner";
import { GuidedTour } from "@/components/GuidedTour";
import { ReactNode } from "react";

export function Layout({ children }: { children: ReactNode }) {
  const { user, isLoading } = useAuth();
  const { isDemoMode } = useDemoMode();
  const [showTour, setShowTour] = useState(false);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-pulse flex flex-col items-center gap-4">
          <div className="w-8 h-8 rounded-full bg-primary/20"></div>
          <div className="text-sm text-muted-foreground">Loading...</div>
        </div>
      </div>
    );
  }

  if (!user) {
    return <>{children}</>;
  }

  return (
    <div className="theme-soft-slate flex min-h-screen w-full bg-background">
      <Sidebar />
      <main className="flex-1 flex flex-col overflow-hidden">
        {isDemoMode && (
          <DemoBanner onStartTour={() => setShowTour(true)} />
        )}
        <div className="flex-1 overflow-y-auto p-8">
          {children}
        </div>
      </main>
      {showTour && <GuidedTour onClose={() => setShowTour(false)} />}
    </div>
  );
}
