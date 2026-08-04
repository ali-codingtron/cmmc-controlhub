import { useState } from "react";
import { Link, useSearch } from "wouter";
import { LifeBuoy, Ticket } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useQuery } from "@tanstack/react-query";

function apiFetch(path: string, opts?: RequestInit) {
  const token = localStorage.getItem("auth_token");
  const base = (import.meta.env.BASE_URL ?? "").replace(/\/$/, "");
  const orgId = localStorage.getItem("active_org_id");
  return fetch(`${base}${path}`, {
    ...opts,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(orgId ? { "X-Organization-ID": orgId } : {}),
      ...(opts?.headers ?? {}),
    },
  });
}

interface HelpContext {
  platformRole: "global_admin" | "user";
  effectiveRole: string;
}

interface SupportTicket {
  id: string;
  ticketNumber: string;
  subject: string;
  category: string;
  priority: "Low" | "Normal" | "High" | "Urgent";
  status: "Submitted" | "In Review" | "Waiting on User" | "Resolved" | "Closed";
  submittedAt: string;
  emailDeliveryStatus?: "Pending" | "Delivered" | "Failed" | "Retry Scheduled";
}

function formatDate(d: string): string {
  return new Date(d).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function StatusBadge({ status }: { status: SupportTicket["status"] }) {
  const styles: Record<SupportTicket["status"], string> = {
    "Submitted": "bg-blue-100 text-blue-700 dark:bg-blue-950/50 dark:text-blue-400",
    "In Review": "bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-400",
    "Waiting on User": "bg-purple-100 text-purple-700 dark:bg-purple-950/50 dark:text-purple-400",
    "Resolved": "bg-green-100 text-green-700 dark:bg-green-950/50 dark:text-green-400",
    "Closed": "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400",
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${styles[status] ?? ""}`}>
      {status}
    </span>
  );
}

function PriorityBadge({ priority }: { priority: SupportTicket["priority"] }) {
  const styles: Record<SupportTicket["priority"], string> = {
    "Low": "bg-green-100 text-green-700 dark:bg-green-950/50 dark:text-green-400",
    "Normal": "bg-blue-100 text-blue-700 dark:bg-blue-950/50 dark:text-blue-400",
    "High": "bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-400",
    "Urgent": "bg-red-100 text-red-700 dark:bg-red-950/50 dark:text-red-400",
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${styles[priority] ?? ""}`}>
      {priority}
    </span>
  );
}

function EmailStatusBadge({ status }: { status?: SupportTicket["emailDeliveryStatus"] }) {
  if (!status) return null;
  const styles: Record<NonNullable<SupportTicket["emailDeliveryStatus"]>, string> = {
    "Pending": "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400",
    "Delivered": "bg-green-100 text-green-700 dark:bg-green-950/50 dark:text-green-400",
    "Failed": "bg-red-100 text-red-700 dark:bg-red-950/50 dark:text-red-400",
    "Retry Scheduled": "bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-400",
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${styles[status] ?? ""}`}>
      {status}
    </span>
  );
}

export default function HelpMyTickets() {
  const search = useSearch();
  const params = new URLSearchParams(search);
  const [viewAll, setViewAll] = useState(params.get("all") === "true");

  const { data: helpContext } = useQuery<HelpContext>({
    queryKey: ["help-context"],
    queryFn: () => apiFetch("/api/help/context").then((r) => r.json()),
  });

  const isGlobalAdmin = helpContext?.platformRole === "global_admin";

  const { data: tickets = [], isLoading } = useQuery<SupportTicket[]>({
    queryKey: ["help-support-tickets", viewAll],
    queryFn: () =>
      apiFetch(`/api/help/support-tickets${viewAll ? "?all=true" : ""}`).then((r) => r.json()),
  });

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-6">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-2 text-sm text-muted-foreground">
        <Link href="/help" className="hover:text-foreground transition-colors">Help Center</Link>
        <span>/</span>
        <span className="text-foreground">My Support Requests</span>
      </nav>

      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="rounded-lg bg-primary/10 p-2">
            <Ticket className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">My Support Requests</h1>
            <p className="text-sm text-muted-foreground">Track the status of your submitted tickets.</p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {isGlobalAdmin && (
            <>
              <Button
                variant={viewAll ? "default" : "outline"}
                size="sm"
                onClick={() => setViewAll(!viewAll)}
              >
                {viewAll ? "View My Tickets" : "View All Tickets"}
              </Button>
              <Button asChild variant="outline" size="sm">
                <Link href="/help/admin">
                  Manage &amp; Resolve Tickets
                </Link>
              </Button>
            </>
          )}
          <Button asChild size="sm">
            <Link href="/help/support-ticket">
              <LifeBuoy className="h-4 w-4 mr-1.5" />
              New Ticket
            </Link>
          </Button>
        </div>
      </div>

      {/* Loading */}
      {isLoading && (
        <div className="space-y-3">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-20 rounded-lg" />
          ))}
        </div>
      )}

      {/* Empty state */}
      {!isLoading && tickets.length === 0 && (
        <Card>
          <CardContent className="py-16 text-center space-y-3">
            <div className="rounded-full bg-muted p-4 w-fit mx-auto">
              <Ticket className="h-8 w-8 text-muted-foreground opacity-60" />
            </div>
            <p className="font-medium">No support tickets submitted yet.</p>
            <p className="text-sm text-muted-foreground">Submit a support ticket if you need help.</p>
            <Button asChild className="mt-2">
              <Link href="/help/support-ticket">Submit a Support Ticket</Link>
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Ticket table */}
      {!isLoading && tickets.length > 0 && (
        <>
          {/* Desktop table */}
          <div className="hidden md:block rounded-lg border overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/40">
                  <th className="px-4 py-3 text-left font-semibold text-xs uppercase tracking-wide text-muted-foreground">Ticket #</th>
                  <th className="px-4 py-3 text-left font-semibold text-xs uppercase tracking-wide text-muted-foreground">Subject</th>
                  <th className="px-4 py-3 text-left font-semibold text-xs uppercase tracking-wide text-muted-foreground">Category</th>
                  <th className="px-4 py-3 text-left font-semibold text-xs uppercase tracking-wide text-muted-foreground">Priority</th>
                  <th className="px-4 py-3 text-left font-semibold text-xs uppercase tracking-wide text-muted-foreground">Status</th>
                  <th className="px-4 py-3 text-left font-semibold text-xs uppercase tracking-wide text-muted-foreground">Submitted</th>
                  <th className="px-4 py-3 text-left font-semibold text-xs uppercase tracking-wide text-muted-foreground">Email</th>
                </tr>
              </thead>
              <tbody>
                {tickets.map((ticket, i) => (
                  <tr key={ticket.id} className={`border-b last:border-0 hover:bg-muted/20 ${i % 2 === 0 ? "" : "bg-muted/10"}`}>
                    <td className="px-4 py-3">
                      <span className="font-mono text-xs font-medium text-primary">{ticket.ticketNumber}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="font-medium">{ticket.subject}</span>
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant="outline" className="text-xs">{ticket.category}</Badge>
                    </td>
                    <td className="px-4 py-3">
                      <PriorityBadge priority={ticket.priority} />
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={ticket.status} />
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">
                      {formatDate(ticket.submittedAt)}
                    </td>
                    <td className="px-4 py-3">
                      <EmailStatusBadge status={ticket.emailDeliveryStatus} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <div className="md:hidden space-y-3">
            {tickets.map((ticket) => (
              <Card key={ticket.id}>
                <CardContent className="py-4 px-4 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <span className="font-mono text-xs font-medium text-primary">{ticket.ticketNumber}</span>
                    <StatusBadge status={ticket.status} />
                  </div>
                  <p className="font-medium text-sm leading-snug">{ticket.subject}</p>
                  <div className="flex flex-wrap gap-1.5">
                    <Badge variant="outline" className="text-xs">{ticket.category}</Badge>
                    <PriorityBadge priority={ticket.priority} />
                    <EmailStatusBadge status={ticket.emailDeliveryStatus} />
                  </div>
                  <p className="text-xs text-muted-foreground">{formatDate(ticket.submittedAt)}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </>
      )}

      <div className="flex justify-start pt-2">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/help">← Back to Help Center</Link>
        </Button>
      </div>
    </div>
  );
}
