import { useDemoMode } from "@/context/DemoModeContext";
import { useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { MapPin, LogOut, FlaskConical } from "lucide-react";

interface DemoBannerProps {
  onStartTour: () => void;
}

export function DemoBanner({ onStartTour }: DemoBannerProps) {
  const { isDemoMode, disableDemoMode } = useDemoMode();
  const [, navigate] = useLocation();
  const queryClient = useQueryClient();

  if (!isDemoMode) return null;

  const handleExitDemo = () => {
    disableDemoMode();
    localStorage.removeItem("auth_token");
    localStorage.removeItem("cmmc_active_org_id");
    queryClient.clear();
    navigate("/demo");
  };

  return (
    <div
      className="flex items-center justify-between gap-3 px-4 py-2 shrink-0"
      style={{
        background: "linear-gradient(90deg, #1E1A0F 0%, #1C1A0A 100%)",
        borderBottom: "1px solid rgba(201,168,76,0.25)",
      }}
    >
      <div className="flex items-center gap-2 min-w-0">
        <FlaskConical className="h-3.5 w-3.5 shrink-0" style={{ color: "#C9A84C" }} />
        <span
          className="text-[11px] font-bold uppercase tracking-wider shrink-0 px-2 py-0.5 rounded"
          style={{ color: "#C9A84C", background: "rgba(201,168,76,0.12)", border: "1px solid rgba(201,168,76,0.25)" }}
        >
          DEMO MODE
        </span>
        <span className="text-xs text-yellow-200/50 truncate hidden sm:block">
          Sample data only — <strong className="text-yellow-200/70">CarmeTechnology</strong>. Read-only. No real data.
        </span>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <Button
          size="sm"
          variant="ghost"
          className="h-7 text-xs px-2.5"
          style={{ color: "#C9A84C" }}
          onClick={onStartTour}
        >
          <MapPin className="h-3 w-3 mr-1" />
          Tour
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className="h-7 text-xs px-2.5"
          style={{ color: "#C9A84C" }}
          onClick={handleExitDemo}
        >
          <LogOut className="h-3 w-3 mr-1" />
          Exit Demo
        </Button>
      </div>
    </div>
  );
}
