import { ReactNode } from "react";
import { Link, useLocation } from "wouter";
import { 
  LayoutDashboard, 
  ShieldCheck, 
  FileText, 
  CheckSquare, 
  AlertTriangle, 
  UserSquare2, 
  History, 
  Users, 
  Settings,
  LogOut,
  BookOpen,
  ChevronRight,
} from "lucide-react";
import { useAuth } from "@/lib/auth";
import { useState } from "react";

const navItems = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/controls", label: "Controls", icon: ShieldCheck },
  { href: "/evidence", label: "Evidence", icon: FileText },
  { href: "/tasks", label: "Tasks", icon: CheckSquare },
  { href: "/poams", label: "POA&Ms", icon: AlertTriangle },
  { href: "/assessor", label: "Assessor View", icon: UserSquare2 },
  { href: "/audit-logs", label: "Audit Trail", icon: History },
  { href: "/users", label: "Users", icon: Users },
  { href: "/settings", label: "Settings", icon: Settings },
];

const documentationItems = [
  { href: "/documents", label: "Overview" },
  { href: "/documents/list", label: "All Documents" },
  { href: "/documents/templates", label: "Templates" },
  { href: "/documents/logs", label: "Compliance Logs" },
  { href: "/documents/checklists", label: "Checklists" },
  { href: "/documents/missing", label: "Gap Analysis" },
];

export function Sidebar() {
  const [location] = useLocation();
  const { user, logout } = useAuth();
  const isDocsActive = location.startsWith("/documents");
  const [docsExpanded, setDocsExpanded] = useState(isDocsActive);

  return (
    <div className="flex flex-col w-64 bg-sidebar border-r border-sidebar-border text-sidebar-foreground h-screen sticky top-0">
      <div className="p-4 flex items-center gap-2 border-b border-sidebar-border h-14">
        <ShieldCheck className="h-6 w-6 text-primary" />
        <span className="font-semibold tracking-tight">CMMC Ops</span>
      </div>
      
      <div className="flex-1 overflow-y-auto py-4">
        <nav className="px-2 space-y-1">
          {navItems.slice(0, 6).map((item) => {
            const isActive = location === item.href || (item.href !== "/" && location.startsWith(item.href));
            return (
              <Link key={item.href} href={item.href} className={`flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors ${isActive ? 'bg-sidebar-accent text-sidebar-accent-foreground font-medium' : 'text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground'}`}>
                <item.icon className="h-4 w-4" />
                {item.label}
              </Link>
            );
          })}

          {/* Documentation section */}
          <button
            onClick={() => setDocsExpanded((v) => !v)}
            className={`w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors ${isDocsActive ? 'bg-sidebar-accent text-sidebar-accent-foreground font-medium' : 'text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground'}`}
          >
            <BookOpen className="h-4 w-4" />
            <span className="flex-1 text-left">Documentation</span>
            <ChevronRight className={`h-3.5 w-3.5 transition-transform ${docsExpanded ? "rotate-90" : ""}`} />
          </button>
          {docsExpanded && (
            <div className="ml-3 pl-3 border-l border-sidebar-border space-y-0.5">
              {documentationItems.map((item) => {
                const isActive = location === item.href || (item.href !== "/documents" && location.startsWith(item.href));
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`flex items-center px-3 py-1.5 rounded-md text-xs transition-colors ${isActive ? 'bg-sidebar-accent text-sidebar-accent-foreground font-medium' : 'text-sidebar-foreground/60 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground'}`}
                  >
                    {item.label}
                  </Link>
                );
              })}
            </div>
          )}

          {navItems.slice(6).map((item) => {
            const isActive = location === item.href || (item.href !== "/" && location.startsWith(item.href));
            return (
              <Link key={item.href} href={item.href} className={`flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors ${isActive ? 'bg-sidebar-accent text-sidebar-accent-foreground font-medium' : 'text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground'}`}>
                <item.icon className="h-4 w-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>
      </div>

      <div className="p-4 border-t border-sidebar-border">
        <div className="flex items-center justify-between">
          <div className="flex flex-col overflow-hidden">
            <span className="text-sm font-medium truncate">{user?.name}</span>
            <span className="text-xs text-sidebar-foreground/60 truncate">{user?.role}</span>
          </div>
          <button onClick={() => logout()} className="p-2 rounded-md hover:bg-sidebar-accent text-sidebar-foreground/70 hover:text-sidebar-foreground transition-colors" title="Log out">
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
