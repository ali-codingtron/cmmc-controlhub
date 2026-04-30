import { Badge } from "@/components/ui/badge";

type Status = 
  | "not_started" | "in_progress" | "implemented" | "needs_review" | "assessor_ready" | "not_applicable" | "at_risk"
  | "draft" | "needs_classification" | "pending_review" | "approved" | "active" | "rejected" | "stale" | "superseded" | "archived"
  | "open" | "completed" | "overdue" | "cancelled" | "deferred"
  | "waiting_on_vendor" | "mitigated" | "accepted_risk" | "closed";

const statusColors: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  not_started: "secondary",
  in_progress: "default",
  implemented: "default", // Need custom green
  needs_review: "secondary", // Need custom yellow
  assessor_ready: "default", // Need custom emerald
  not_applicable: "secondary",
  at_risk: "destructive",
  
  draft: "secondary",
  needs_classification: "secondary",
  pending_review: "secondary", // yellow
  approved: "default", // blue/green
  active: "default", // green
  rejected: "destructive",
  stale: "destructive", // orange
  superseded: "default", // purple (custom class)
  archived: "secondary",

  open: "default",
  completed: "default", // green
  overdue: "destructive",
  cancelled: "secondary",
  deferred: "secondary",

  waiting_on_vendor: "secondary", // yellow
  mitigated: "default", // green
  accepted_risk: "secondary", // yellow
  closed: "default" // green
};

const statusClasses: Record<string, string> = {
  implemented: "bg-green-600 hover:bg-green-700 text-white",
  needs_review: "bg-yellow-500 hover:bg-yellow-600 text-white",
  assessor_ready: "bg-emerald-700 hover:bg-emerald-800 text-white",
  pending_review: "bg-yellow-500 hover:bg-yellow-600 text-white",
  approved: "bg-blue-600 hover:bg-blue-700 text-white",
  active: "bg-green-600 hover:bg-green-700 text-white",
  stale: "bg-orange-500 hover:bg-orange-600 text-white",
  superseded: "bg-purple-600 hover:bg-purple-700 text-white",
  completed: "bg-green-600 hover:bg-green-700 text-white",
  waiting_on_vendor: "bg-yellow-500 hover:bg-yellow-600 text-white",
  mitigated: "bg-green-600 hover:bg-green-700 text-white",
  accepted_risk: "bg-yellow-500 hover:bg-yellow-600 text-white",
  closed: "bg-green-600 hover:bg-green-700 text-white",
};

export function StatusBadge({ status }: { status: string }) {
  const variant = statusColors[status] || "default";
  const customClass = statusClasses[status] || "";
  const label = status.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');

  return (
    <Badge variant={variant} className={customClass}>
      {label}
    </Badge>
  );
}

export function RiskBadge({ level }: { level: string }) {
  const colors: Record<string, string> = {
    critical: "bg-red-600 hover:bg-red-700 text-white",
    high: "bg-orange-500 hover:bg-orange-600 text-white",
    medium: "bg-yellow-500 hover:bg-yellow-600 text-white",
    low: "bg-green-600 hover:bg-green-700 text-white"
  };
  const customClass = colors[level.toLowerCase()] || "bg-gray-500 text-white";
  const label = level.charAt(0).toUpperCase() + level.slice(1);
  return (
    <Badge className={customClass}>{label}</Badge>
  );
}

export function LevelBadge({ level }: { level: string }) {
  const colors: Record<string, string> = {
    l1: "bg-blue-600 hover:bg-blue-700 text-white",
    l2: "bg-indigo-600 hover:bg-indigo-700 text-white"
  };
  const customClass = colors[level.toLowerCase()] || "bg-gray-500 text-white";
  return (
    <Badge className={customClass}>{level.toUpperCase()}</Badge>
  );
}
