import { useAuth } from "@/lib/auth";
import { useDemoMode } from "@/context/DemoModeContext";
import { useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { FlaskConical, LogOut, MapPin } from "lucide-react";

interface DemoBannerProps {
  onStartTour: () => void;
}

export function DemoBanner({ onStartTour }: DemoBannerProps) {
  const { isDemoMode, disableDemoMode } = useDemoMode();
  const { logout } = useAuth();
  const [, navigate] = useLocation();
  const queryClient = useQueryClient();

  if (!isDemoMode) return null;

  const handleExitDemo = async () => {
    disableDemoMode();
    localStorage.removeItem("auth_token");
    localStorage.removeItem("cmmc_active_org_id");
    queryClient.clear();
    if (logout) await logout();
    navigate("/demo");
  };

  return (
    <div className="flex items-center justify-between gap-3 px-4 py-2 bg-amber-50 border-b border-amber-200 text-amber-900 shrink-0">
      <div className="flex items-center gap-2 min-w-0">
        <FlaskConical className="h-4 w-4 text-amber-600 shrink-0" />
        <Badge variant="outline" className="border-amber-400 text-amber-700 bg-amber-100 text-xs font-semibold shrink-0">
          DEMO DATA
        </Badge>
        <span className="text-xs text-amber-800 truncate">
          Viewing <strong>CarmeTechnology</strong> — sample data only. Read-only mode.
        </span>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <Button
          size="sm"
          variant="outline"
          className="h-7 text-xs border-amber-400 text-amber-700 bg-amber-100 hover:bg-amber-200"
          onClick={onStartTour}
        >
          <MapPin className="h-3 w-3 mr-1" />
          Start Tour
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="h-7 text-xs border-amber-400 text-amber-700 bg-amber-100 hover:bg-amber-200"
          onClick={handleExitDemo}
        >
          <LogOut className="h-3 w-3 mr-1" />
          Exit Demo
        </Button>
      </div>
    </div>
  );
}
