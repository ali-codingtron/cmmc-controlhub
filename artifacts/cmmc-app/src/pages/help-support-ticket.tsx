import { useState } from "react";
import { Link, useSearch } from "wouter";
import { AlertTriangle, CheckCircle2, LifeBuoy, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
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
  organizationRole: string | null;
  effectiveRole: string;
  selectedOrganizationName: string | null;
  activePackageKeys: string[];
  enabledModules: string[];
  organizationLevel: "L1" | "L2" | null;
}

interface AuthMe {
  id: string;
  email: string;
  name: string;
}

interface TicketSuccessResponse {
  ticketNumber: string;
  submittedAt: string;
  emailDeliveryStatus?: "pending" | "delivered" | "failed" | "retry_scheduled";
}

const TICKET_CATEGORIES = [
  "Sign-In, Password or MFA",
  "Microsoft SSO",
  "User Access or Role",
  "Organization Setup",
  "Controls or Frameworks",
  "Tasks",
  "Evidence Upload or Download",
  "Monitoring Tracker",
  "POA&M",
  "Implementation Roadmap",
  "Pre-Assessment",
  "Documentation",
  "SSP",
  "Reports or Exports",
  "Performance",
  "Bug Report",
  "Feature Request",
  "Tutorial Request",
  "Other",
];

const RELATED_MODULES = [
  "Dashboard",
  "Controls & Requirements",
  "Tasks",
  "Evidence",
  "Monitoring Tracker",
  "POA&M",
  "Implementation Roadmap",
  "Pre-Assessment",
  "Documentation",
  "SSP",
  "Reports & Exports",
  "Users & Roles",
  "Organizations & Modules",
  "MFA, SSO & Sign-In",
  "Other",
];

type Priority = "Low" | "Normal" | "High" | "Urgent";

function formatDate(d: string): string {
  return new Date(d).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function HelpSupportTicket() {
  const search = useSearch();
  const params = new URLSearchParams(search);
  const prefillSubject = params.get("subject") ?? "";
  const prefillCategory = params.get("category") ?? "";

  const [subject, setSubject] = useState(prefillSubject);
  const [category, setCategory] = useState(prefillCategory);
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState<Priority>("Normal");
  const [relatedModule, setRelatedModule] = useState("");
  const [includeDiagnostics, setIncludeDiagnostics] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState<TicketSuccessResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { data: helpContext } = useQuery<HelpContext>({
    queryKey: ["help-context"],
    queryFn: () => apiFetch("/api/help/context").then((r) => r.json()),
  });

  const { data: me } = useQuery<AuthMe>({
    queryKey: ["auth-me"],
    queryFn: () => apiFetch("/api/auth/me").then((r) => r.json()),
  });

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    const payload: Record<string, unknown> = {
      subject,
      category,
      description,
      priority,
      relatedModule: relatedModule || undefined,
      currentPageUrl: window.location.href,
      browserSummary: navigator.userAgent.slice(0, 200),
    };

    if (includeDiagnostics && helpContext) {
      payload.diagnostics = {
        effectiveRole: helpContext.effectiveRole,
        selectedOrganizationName: helpContext.selectedOrganizationName,
        currentPageUrl: window.location.href,
        browserSummary: navigator.userAgent.slice(0, 200),
        submittedAt: new Date().toISOString(),
      };
    }

    try {
      const r = await apiFetch("/api/help/support-tickets", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      if (!r.ok) throw new Error("non-2xx");
      const data: TicketSuccessResponse = await r.json();
      setSuccess(data);
    } catch {
      setError(
        "Your support request could not be submitted. No ticket was created. Please try again or email support@carmetechnology.com."
      );
    } finally {
      setSubmitting(false);
    }
  }

  if (success) {
    return (
      <div className="max-w-2xl mx-auto p-6 space-y-6">
        <nav className="flex items-center gap-2 text-sm text-muted-foreground">
          <Link href="/help" className="hover:text-foreground transition-colors">Help Center</Link>
          <span>/</span>
          <span className="text-foreground">Support Ticket</span>
        </nav>

        <Card>
          <CardContent className="py-10 text-center space-y-4">
            <div className="rounded-full bg-green-100 dark:bg-green-950/30 p-4 w-fit mx-auto">
              <CheckCircle2 className="h-10 w-10 text-green-600 dark:text-green-400" />
            </div>
            <h2 className="text-xl font-bold">Support Request Submitted Successfully</h2>
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground uppercase tracking-wide">Ticket Number</p>
              <p className="text-3xl font-mono font-bold text-primary">{success.ticketNumber}</p>
            </div>
            {success.submittedAt && (
              <p className="text-sm text-muted-foreground">Submitted {formatDate(success.submittedAt)}</p>
            )}
            {me?.email && (
              <p className="text-sm text-muted-foreground">
                You will receive a confirmation email at <span className="font-medium text-foreground">{me.email}</span>
              </p>
            )}
            {success.emailDeliveryStatus === "failed" && (
              <div className="rounded-md border border-amber-200 bg-amber-50 dark:bg-amber-950/30 px-4 py-3 text-sm text-amber-700 dark:text-amber-400">
                Email delivery is delayed. Your ticket was recorded and our team will receive it shortly.
              </div>
            )}
            <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
              <Button asChild>
                <Link href="/help/my-tickets">View My Support Requests</Link>
              </Button>
              <Button variant="ghost" asChild>
                <Link href="/help">Return to Help Center</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto p-6 space-y-6">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-2 text-sm text-muted-foreground">
        <Link href="/help" className="hover:text-foreground transition-colors">Help Center</Link>
        <span>/</span>
        <span className="text-foreground">Submit a Support Ticket</span>
      </nav>

      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="rounded-lg bg-primary/10 p-2">
          <LifeBuoy className="h-6 w-6 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">Submit a Support Ticket</h1>
          <p className="text-sm text-muted-foreground">Our team will respond to your request.</p>
        </div>
      </div>

      {/* Security Notice */}
      <div className="rounded-md border border-amber-200 bg-amber-50 dark:bg-amber-950/30 px-4 py-3 flex items-start gap-3">
        <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
        <p className="text-sm text-amber-800 dark:text-amber-300">
          <span className="font-semibold">Security Notice:</span> Do not include Controlled Unclassified Information (CUI), passwords, access tokens, recovery keys, or sensitive contract data in this support request.
        </p>
      </div>

      {/* Form */}
      <form onSubmit={handleSubmit} className="space-y-5">
        {/* Subject */}
        <div className="space-y-1.5">
          <label className="text-sm font-medium" htmlFor="subject">
            Subject <span className="text-red-500">*</span>
          </label>
          <Input
            id="subject"
            value={subject}
            onChange={(e) => setSubject(e.target.value.slice(0, 200))}
            placeholder="Brief description of your issue"
            required
            maxLength={200}
          />
          <p className="text-xs text-muted-foreground text-right">{subject.length}/200</p>
        </div>

        {/* Category */}
        <div className="space-y-1.5">
          <label className="text-sm font-medium" htmlFor="category">
            Category <span className="text-red-500">*</span>
          </label>
          <select
            id="category"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            required
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            <option value="">— Select a category —</option>
            {TICKET_CATEGORIES.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>

        {/* Description */}
        <div className="space-y-1.5">
          <label className="text-sm font-medium" htmlFor="description">
            Description <span className="text-red-500">*</span>
          </label>
          <textarea
            id="description"
            value={description}
            onChange={(e) => setDescription(e.target.value.slice(0, 5000))}
            placeholder="Describe the issue or question in detail. Do not include passwords, tokens, or sensitive data."
            required
            minLength={10}
            rows={6}
            className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 resize-y min-h-[120px]"
          />
          <p className="text-xs text-muted-foreground text-right">{description.length}/5000</p>
        </div>

        {/* Priority */}
        <div className="space-y-2">
          <label className="text-sm font-medium">Priority</label>
          <div className="flex flex-wrap gap-2">
            {(["Low", "Normal", "High", "Urgent"] as Priority[]).map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setPriority(p)}
                className={`px-3 py-1.5 rounded-md text-sm border transition-colors ${
                  priority === p
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-background hover:bg-accent border-border"
                }`}
              >
                {p}
              </button>
            ))}
          </div>
          {priority === "Urgent" && (
            <p className="text-xs text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 rounded px-3 py-2">
              Use Urgent only when users cannot access Control HUB, critical data appears unavailable, or a severe production issue is occurring.
            </p>
          )}
        </div>

        {/* Related Module */}
        <div className="space-y-1.5">
          <label className="text-sm font-medium" htmlFor="related-module">Related Module <span className="text-xs text-muted-foreground">(optional)</span></label>
          <select
            id="related-module"
            value={relatedModule}
            onChange={(e) => setRelatedModule(e.target.value)}
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            <option value="">— Select module —</option>
            {RELATED_MODULES.map((m) => (
              <option key={m} value={m}>{m}</option>
            ))}
          </select>
        </div>

        {/* Diagnostic Context */}
        <div className="space-y-2">
          <label className="flex items-start gap-2.5 cursor-pointer">
            <input
              type="checkbox"
              checked={includeDiagnostics}
              onChange={(e) => setIncludeDiagnostics(e.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-input"
            />
            <div>
              <span className="text-sm font-medium">Include Basic Diagnostic Context</span>
              {includeDiagnostics && (
                <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                  Includes: your effective role, selected organization name, current page URL, application version, browser name, and submission timestamp. Does not include passwords, tokens, evidence, or Microsoft tenant secrets.
                </p>
              )}
            </div>
          </label>
        </div>

        {/* Context badges */}
        {helpContext && (
          <div className="rounded-md border bg-muted/30 px-4 py-3 space-y-1.5">
            <p className="text-xs font-medium text-muted-foreground">Your context (auto-captured):</p>
            <div className="flex flex-wrap gap-2">
              <Badge variant="secondary" className="text-xs">{helpContext.effectiveRole}</Badge>
              {helpContext.selectedOrganizationName && (
                <Badge variant="outline" className="text-xs">{helpContext.selectedOrganizationName}</Badge>
              )}
            </div>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="rounded-md border border-red-200 bg-red-50 dark:bg-red-950/30 px-4 py-3 text-sm text-red-700 dark:text-red-400">
            {error}
          </div>
        )}

        {/* Submit */}
        <div className="flex items-center gap-3 pt-1">
          <Button type="submit" disabled={submitting || !subject || !category || description.length < 10}>
            {submitting ? "Submitting…" : "Submit Support Ticket"}
          </Button>
          <Button variant="ghost" asChild>
            <Link href="/help">
              <ArrowLeft className="h-4 w-4 mr-1.5" />
              Cancel
            </Link>
          </Button>
        </div>
      </form>
    </div>
  );
}
