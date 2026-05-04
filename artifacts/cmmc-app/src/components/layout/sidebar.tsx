import { Link, useLocation } from "wouter";
import { 
  LayoutDashboard, 
  ShieldCheck, 
  FileText, 
  Activity, 
  AlertTriangle, 
  History, 
  Users, 
  Settings,
  LogOut,
  BookOpen,
  ChevronRight,
  Building2,
  ChevronsUpDown,
  Check,
  ScrollText,
  BarChart3,
} from "lucide-react";
import { useAuth } from "@/lib/auth";
import { useOrg } from "@/context/OrgContext";
import { useState, useRef, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { cn } from "@/lib/utils";

const documentationItems = [
  { href: "/documents", label: "Overview" },
  { href: "/documents/list", label: "All Documents" },
  { href: "/documents/logs", label: "Compliance Logs" },
  { href: "/documents/checklists", label: "Checklists" },
  { href: "/documents/missing", label: "Gap Analysis" },
];

const sspItems = [
  { href: "/ssp/overview", label: "Overview" },
  { href: "/ssp/sections", label: "Sections" },
  { href: "/ssp/mappings", label: "Control Mapping" },
  { href: "/ssp/documents", label: "Documents" },
  { href: "/ssp/export", label: "Export" },
];

const reportsItems = [
  { href: "/reports/executive", label: "Executive Readiness" },
  { href: "/reports/gap", label: "Gap Analysis" },
  { href: "/reports/controls", label: "Control Status" },
  { href: "/reports/evidence", label: "Evidence Inventory" },
  { href: "/reports/poam", label: "POA&M Report" },
  { href: "/reports/monitoring", label: "Monitoring Tracker" },
  { href: "/reports/domain", label: "Domain Readiness" },
  { href: "/reports/audit", label: "Audit Readiness" },
  { href: "/reports/ssp", label: "SSP Summary" },
];

function NavLink({ href, icon: Icon, label }: { href: string; icon: React.ComponentType<{ className?: string }>; label: string }) {
  const [location] = useLocation();
  const isActive = location === href || (href !== "/" && location.startsWith(href));
  return (
    <Link href={href} className={cn(
      "flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors",
      isActive
        ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
        : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
    )}>
      <Icon className="h-4 w-4 shrink-0" />
      {label}
    </Link>
  );
}

function OrgSwitcher() {
  const { activeOrg, orgs, setActiveOrg } = useOrg();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const queryClient = useQueryClient();

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  if (!activeOrg) return null;

  const levelBadgeColor = activeOrg.cmmcTargetLevel === "L1" ? "bg-blue-500/20 text-blue-300" : "bg-purple-500/20 text-purple-300";

  const handleSelect = (org: typeof orgs[0]) => {
    setActiveOrg(org);
    setOpen(false);
    queryClient.invalidateQueries();
  };

  return (
    <div ref={containerRef} className="px-2 pb-3 relative">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="listbox"
        title={activeOrg.name}
        className="w-full flex items-center gap-2 px-3 py-2 rounded-md bg-sidebar-accent/60 hover:bg-sidebar-accent text-sidebar-foreground transition-colors text-left"
      >
        <Building2 className="h-4 w-4 shrink-0 text-primary" />
        <span className="flex-1 min-w-0 text-sm font-medium truncate">
          {activeOrg.name}
        </span>
        <span className={cn("text-[10px] font-semibold px-1.5 py-0.5 rounded shrink-0", levelBadgeColor)}>
          {activeOrg.cmmcTargetLevel ?? "—"}
        </span>
        <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 text-sidebar-foreground/50" />
      </button>

      {open && orgs.length > 0 && (
        <div role="listbox" className="mt-1 bg-sidebar border border-sidebar-border rounded-md shadow-lg overflow-hidden z-50">
          {orgs.map((org) => (
            <button
              key={org.id}
              role="option"
              aria-selected={org.id === activeOrg.id}
              onMouseDown={(e) => { e.preventDefault(); handleSelect(org); }}
              className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-sidebar-accent/50 text-sidebar-foreground transition-colors text-left"
            >
              <div className="flex-1 min-w-0">
                <div className="truncate font-medium">{org.name}</div>
                <div className="text-xs text-sidebar-foreground/60 truncate capitalize">{org.role.replace("_", " ")}</div>
              </div>
              {org.id === activeOrg.id && <Check className="h-3.5 w-3.5 text-primary shrink-0" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function Sidebar() {
  const [location] = useLocation();
  const { user, logout } = useAuth();
  const isDocsActive = location.startsWith("/documents");
  const isSspActive = location.startsWith("/ssp");
  const isReportsActive = location.startsWith("/reports");
  const [docsExpanded, setDocsExpanded] = useState(isDocsActive);
  const [sspExpanded, setSspExpanded] = useState(isSspActive);
  const [reportsExpanded, setReportsExpanded] = useState(isReportsActive);

  const isAdmin = user?.role === "admin";

  return (
    <div className="no-print flex flex-col w-64 bg-sidebar border-r border-sidebar-border text-sidebar-foreground h-screen sticky top-0">
      <div className="p-4 flex items-center gap-2 border-b border-sidebar-border h-14">
        <ShieldCheck className="h-6 w-6 text-primary" />
        <span className="font-semibold tracking-tight">Control HUB</span>
      </div>

      <div className="pt-3">
        <OrgSwitcher />
      </div>

      <div className="flex-1 overflow-y-auto pb-4">
        <nav className="px-2 space-y-1">
          <NavLink href="/" icon={LayoutDashboard} label="Dashboard" />
          <NavLink href="/controls" icon={ShieldCheck} label="Controls" />
          <NavLink href="/evidence" icon={FileText} label="Evidence" />
          <NavLink href="/monitoring" icon={Activity} label="Monitoring Tracker" />
          <NavLink href="/poams" icon={AlertTriangle} label="POA&Ms" />

          {/* Documentation section */}
          <button
            onClick={() => setDocsExpanded((v) => !v)}
            className={cn(
              "w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors",
              isDocsActive
                ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
            )}
          >
            <BookOpen className="h-4 w-4 shrink-0" />
            <span className="flex-1 text-left">Documentation</span>
            <ChevronRight className={cn("h-3.5 w-3.5 transition-transform", docsExpanded && "rotate-90")} />
          </button>
          {docsExpanded && (
            <div className="ml-3 pl-3 border-l border-sidebar-border space-y-0.5">
              {documentationItems.map((item) => {
                const isActive = location === item.href || (item.href !== "/documents" && location.startsWith(item.href));
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={cn(
                      "flex items-center px-3 py-1.5 rounded-md text-xs transition-colors",
                      isActive
                        ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                        : "text-sidebar-foreground/60 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
                    )}
                  >
                    {item.label}
                  </Link>
                );
              })}
            </div>
          )}

          {/* SSP section */}
          <button
            onClick={() => setSspExpanded((v) => !v)}
            className={cn(
              "w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors",
              isSspActive
                ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
            )}
          >
            <ScrollText className="h-4 w-4 shrink-0" />
            <span className="flex-1 text-left">SSP</span>
            <ChevronRight className={cn("h-3.5 w-3.5 transition-transform", sspExpanded && "rotate-90")} />
          </button>
          {sspExpanded && (
            <div className="ml-3 pl-3 border-l border-sidebar-border space-y-0.5">
              {sspItems.map((item) => {
                const isActive = location === item.href || location.startsWith(item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={cn(
                      "flex items-center px-3 py-1.5 rounded-md text-xs transition-colors",
                      isActive
                        ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                        : "text-sidebar-foreground/60 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
                    )}
                  >
                    {item.label}
                  </Link>
                );
              })}
            </div>
          )}

          {/* Reports section */}
          <button
            onClick={() => setReportsExpanded((v) => !v)}
            className={cn(
              "w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors",
              isReportsActive
                ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
            )}
          >
            <BarChart3 className="h-4 w-4 shrink-0" />
            <span className="flex-1 text-left">Reports</span>
            <ChevronRight className={cn("h-3.5 w-3.5 transition-transform", reportsExpanded && "rotate-90")} />
          </button>
          {reportsExpanded && (
            <div className="ml-3 pl-3 border-l border-sidebar-border space-y-0.5">
              {reportsItems.map((item) => {
                const isActive = location === item.href;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={cn(
                      "flex items-center px-3 py-1.5 rounded-md text-xs transition-colors",
                      isActive
                        ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                        : "text-sidebar-foreground/60 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
                    )}
                  >
                    {item.label}
                  </Link>
                );
              })}
            </div>
          )}

          <div className="pt-2">
            <div className="px-3 py-1 text-[10px] uppercase tracking-wider font-semibold text-sidebar-foreground/40">
              Admin
            </div>
          </div>
          <NavLink href="/audit-logs" icon={History} label="Audit Trail" />
          <NavLink href="/users" icon={Users} label="Users" />
          {isAdmin && <NavLink href="/organizations" icon={Building2} label="Organizations" />}
          <NavLink href="/settings" icon={Settings} label="Settings" />
        </nav>
      </div>

      <div className="p-4 border-t border-sidebar-border">
        <div className="flex items-center justify-between">
          <div className="flex flex-col overflow-hidden">
            <span className="text-sm font-medium truncate">{user?.name}</span>
            <span className="text-xs text-sidebar-foreground/60 truncate capitalize">{user?.role?.replace("_", " ")}</span>
          </div>
          <button
            onClick={() => logout()}
            className="p-2 rounded-md hover:bg-sidebar-accent text-sidebar-foreground/70 hover:text-sidebar-foreground transition-colors"
            title="Log out"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
