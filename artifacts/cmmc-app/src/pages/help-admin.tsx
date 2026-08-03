import { useState } from "react";
import { Link, useLocation } from "wouter";
import { Plus, Pencil, Archive, ArrowLeft, BookOpen, HelpCircle, Loader2, Ticket, ChevronDown, ChevronUp, MessageSquare } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
function apiFetch(path: string, opts?: RequestInit) {
  const token = localStorage.getItem("auth_token");
  const base = (import.meta.env.BASE_URL ?? "").replace(/\/$/, "");
  return fetch(`${base}${path}`, {
    ...opts,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(opts?.headers ?? {}),
    },
  });
}
import { useAuth } from "@/lib/auth";

interface Article {
  id: string;
  slug: string;
  title: string;
  categoryId?: string;
  categoryName?: string;
  module?: string;
  content: string;
  summary: string;
  keywords: string;
  status: string;
  updatedAt: string;
}

interface FaqItem {
  id: string;
  question: string;
  answer: string;
  category: string;
  sortOrder: number;
  status: string;
}

interface Category {
  id: string;
  name: string;
}

interface SupportTicket {
  id: string;
  ticketNumber: string;
  submittedByName: string;
  submittedByEmail: string;
  subject: string;
  category: string;
  priority: string;
  description: string;
  status: string;
  internalNotes: string | null;
  createdAt: string;
  updatedAt: string;
  resolvedAt: string | null;
  closedAt: string | null;
  organizationId: string | null;
  relatedModule: string | null;
  currentPageUrl: string | null;
  emailDeliveryStatus: string;
}

interface ArticleForm {
  slug: string;
  title: string;
  categoryId: string;
  module: string;
  content: string;
  summary: string;
  keywords: string;
  status: string;
}

interface FaqForm {
  question: string;
  answer: string;
  category: string;
  sortOrder: number;
}

const EMPTY_ARTICLE: ArticleForm = { slug: "", title: "", categoryId: "", module: "", content: "", summary: "", keywords: "", status: "published" };
const EMPTY_FAQ: FaqForm = { question: "", answer: "", category: "General", sortOrder: 0 };

const TICKET_STATUSES = [
  { value: "all", label: "All Tickets" },
  { value: "submitted", label: "Submitted" },
  { value: "in_review", label: "In Review" },
  { value: "waiting_on_user", label: "Waiting on User" },
  { value: "resolved", label: "Resolved" },
  { value: "closed", label: "Closed" },
] as const;

const TICKET_STATUS_LABELS: Record<string, string> = {
  submitted: "Submitted",
  in_review: "In Review",
  waiting_on_user: "Waiting on User",
  resolved: "Resolved",
  closed: "Closed",
};

// Map display status back to raw value for PATCH requests
const STATUS_DISPLAY_TO_RAW: Record<string, string> = {
  "Submitted": "submitted",
  "In Review": "in_review",
  "Waiting on User": "waiting_on_user",
  "Resolved": "resolved",
  "Closed": "closed",
};

const TICKET_STATUS_COLORS: Record<string, "default" | "secondary" | "outline" | "destructive"> = {
  Submitted: "default",
  "In Review": "secondary",
  "Waiting on User": "outline",
  Resolved: "secondary",
  Closed: "outline",
};

const PRIORITY_COLORS: Record<string, string> = {
  Low: "text-muted-foreground",
  Normal: "text-foreground",
  High: "text-orange-600",
  Urgent: "text-destructive font-semibold",
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

export default function HelpAdmin() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const qc = useQueryClient();

  if (user?.role !== "admin") {
    setLocation("/help");
    return null;
  }

  const [articleDialog, setArticleDialog] = useState<{ open: boolean; editing?: Article }>({ open: false });
  const [faqDialog, setFaqDialog] = useState<{ open: boolean; editing?: FaqItem }>({ open: false });
  const [articleForm, setArticleForm] = useState<ArticleForm>(EMPTY_ARTICLE);
  const [faqForm, setFaqForm] = useState<FaqForm>(EMPTY_FAQ);

  // Ticket state
  const [ticketStatusFilter, setTicketStatusFilter] = useState<string>("all");
  const [ticketDialog, setTicketDialog] = useState<{ open: boolean; ticket?: SupportTicket }>({ open: false });
  const [ticketStatus, setTicketStatus] = useState("");
  const [ticketNotes, setTicketNotes] = useState("");
  const [expandedTicket, setExpandedTicket] = useState<string | null>(null);

  const { data: articles = [] } = useQuery<Article[]>({
    queryKey: ["help-articles-admin"],
    queryFn: () => apiFetch("/api/help/articles?status=all").then((r) => r.json()),
  });

  const { data: faqItems = [] } = useQuery<FaqItem[]>({
    queryKey: ["help-faq-admin"],
    queryFn: () => apiFetch("/api/help/faq").then((r) => r.json()),
  });

  const { data: categories = [] } = useQuery<Category[]>({
    queryKey: ["help-categories"],
    queryFn: () => apiFetch("/api/help/categories").then((r) => r.json()),
  });

  const { data: allTickets = [] } = useQuery<SupportTicket[]>({
    queryKey: ["support-tickets-admin"],
    queryFn: () => apiFetch("/api/help/support-tickets?all=true").then((r) => r.json()),
  });

  const filteredTickets = ticketStatusFilter === "all"
    ? allTickets
    : allTickets.filter((t) => t.status === ticketStatusFilter);

  const ticketCounts: Record<string, number> = { all: allTickets.length };
  for (const t of allTickets) {
    ticketCounts[t.status] = (ticketCounts[t.status] ?? 0) + 1;
  }

  const saveArticle = useMutation({
    mutationFn: async (form: ArticleForm) => {
      const url = articleDialog.editing ? `/api/help/articles/${articleDialog.editing.id}` : "/api/help/articles";
      const method = articleDialog.editing ? "PUT" : "POST";
      const r = await apiFetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
      if (!r.ok) throw new Error("Failed to save article");
      return r.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["help-articles-admin"] });
      qc.invalidateQueries({ queryKey: ["help-articles"] });
      qc.invalidateQueries({ queryKey: ["help-categories"] });
      setArticleDialog({ open: false });
      toast({ title: articleDialog.editing ? "Article updated" : "Article created" });
    },
    onError: () => toast({ title: "Failed to save article", variant: "destructive" }),
  });

  const saveFaq = useMutation({
    mutationFn: async (form: FaqForm) => {
      const url = faqDialog.editing ? `/api/help/faq/${faqDialog.editing.id}` : "/api/help/faq";
      const method = faqDialog.editing ? "PUT" : "POST";
      const r = await apiFetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
      if (!r.ok) throw new Error("Failed to save FAQ");
      return r.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["help-faq-admin"] });
      qc.invalidateQueries({ queryKey: ["help-faq"] });
      setFaqDialog({ open: false });
      toast({ title: faqDialog.editing ? "FAQ updated" : "FAQ item created" });
    },
    onError: () => toast({ title: "Failed to save FAQ", variant: "destructive" }),
  });

  const archiveArticle = useMutation({
    mutationFn: (id: string) =>
      apiFetch(`/api/help/articles/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "archived" }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["help-articles-admin"] });
      toast({ title: "Article archived" });
    },
  });

  const deleteFaq = useMutation({
    mutationFn: (id: string) => apiFetch(`/api/help/faq/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["help-faq-admin"] });
      toast({ title: "FAQ item deleted" });
    },
  });

  const updateTicket = useMutation({
    mutationFn: async ({ id, status, internalNotes }: { id: string; status?: string; internalNotes?: string }) => {
      const body: Record<string, string> = {};
      if (status) body.status = status;
      if (internalNotes !== undefined) body.internalNotes = internalNotes;
      const r = await apiFetch(`/api/help/support-tickets/${id}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      });
      if (!r.ok) {
        const err = await r.json().catch(() => ({}));
        throw new Error((err as any).error ?? "Failed to update ticket");
      }
      return r.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["support-tickets-admin"] });
      setTicketDialog({ open: false });
      toast({ title: "Ticket updated" });
    },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  const openTicketDialog = (ticket: SupportTicket) => {
    // Convert display status ("In Review") back to raw value ("in_review") for the Select
    setTicketStatus(STATUS_DISPLAY_TO_RAW[ticket.status] ?? ticket.status);
    setTicketNotes(ticket.internalNotes ?? "");
    setTicketDialog({ open: true, ticket });
  };

  const openNewArticle = () => {
    setArticleForm(EMPTY_ARTICLE);
    setArticleDialog({ open: true });
  };

  const openEditArticle = (a: Article) => {
    setArticleForm({
      slug: a.slug, title: a.title, categoryId: a.categoryId ?? "", module: a.module ?? "",
      content: a.content, summary: a.summary, keywords: a.keywords, status: a.status,
    });
    setArticleDialog({ open: true, editing: a });
  };

  const openNewFaq = () => {
    setFaqForm(EMPTY_FAQ);
    setFaqDialog({ open: true });
  };

  const openEditFaq = (f: FaqItem) => {
    setFaqForm({ question: f.question, answer: f.answer, category: f.category, sortOrder: f.sortOrder });
    setFaqDialog({ open: true, editing: f });
  };

  const statusColor = (s: string) => s === "published" ? "default" : s === "draft" ? "secondary" : "outline";

  return (
    <div className="max-w-5xl mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <nav className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
            <Link href="/help" className="hover:text-foreground">Help Center</Link>
            <span>/</span>
            <span className="text-foreground">Admin Editor</span>
          </nav>
          <h1 className="text-2xl font-bold">Help Content Editor</h1>
        </div>
        <Button variant="ghost" size="sm" asChild>
          <Link href="/help">
            <ArrowLeft className="h-4 w-4 mr-2" />
            View Help Center
          </Link>
        </Button>
      </div>

      <Tabs defaultValue="tickets">
        <TabsList>
          <TabsTrigger value="tickets">
            <Ticket className="h-4 w-4 mr-2" />
            Support Tickets {allTickets.length > 0 && `(${allTickets.length})`}
          </TabsTrigger>
          <TabsTrigger value="articles">
            <BookOpen className="h-4 w-4 mr-2" />
            Articles ({articles.length})
          </TabsTrigger>
          <TabsTrigger value="faq">
            <HelpCircle className="h-4 w-4 mr-2" />
            FAQ ({faqItems.length})
          </TabsTrigger>
        </TabsList>

        {/* ── Tickets Tab ── */}
        <TabsContent value="tickets" className="space-y-4">
          {/* Status filter bar */}
          <div className="flex flex-wrap gap-2 pt-1">
            {TICKET_STATUSES.map((s) => (
              <Button
                key={s.value}
                size="sm"
                variant={ticketStatusFilter === s.value ? "default" : "outline"}
                onClick={() => setTicketStatusFilter(s.value)}
                className="h-7 text-xs"
              >
                {s.label}
                {ticketCounts[s.value] != null && (
                  <span className="ml-1.5 rounded-full bg-background/20 px-1.5 py-0.5 text-[10px] font-medium">
                    {ticketCounts[s.value]}
                  </span>
                )}
              </Button>
            ))}
          </div>

          {filteredTickets.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground">
                No tickets {ticketStatusFilter !== "all" ? `with status "${TICKET_STATUS_LABELS[ticketStatusFilter] ?? ticketStatusFilter}"` : "submitted yet"}.
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-2">
              {filteredTickets.map((t) => {
                const isExpanded = expandedTicket === t.id;
                return (
                  <Card key={t.id} className="overflow-hidden">
                    <CardContent className="py-0">
                      {/* Header row */}
                      <div
                        className="flex items-start gap-3 py-3 cursor-pointer"
                        onClick={() => setExpandedTicket(isExpanded ? null : t.id)}
                      >
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap mb-0.5">
                            <span className="font-mono text-xs text-muted-foreground">{t.ticketNumber}</span>
                            <Badge variant={TICKET_STATUS_COLORS[t.status] ?? "outline"} className="text-xs">
                              {t.status}
                            </Badge>
                            <span className={`text-xs font-medium ${PRIORITY_COLORS[t.priority] ?? ""}`}>
                              {t.priority}
                            </span>
                            <Badge variant="outline" className="text-xs">{t.category}</Badge>
                          </div>
                          <p className="font-medium text-sm truncate">{t.subject}</p>
                          <p className="text-xs text-muted-foreground">
                            {t.submittedByName} &middot; {t.submittedByEmail} &middot; {formatDate(t.createdAt)}
                          </p>
                        </div>
                        <div className="flex items-center gap-2 shrink-0 pt-1">
                          {t.internalNotes && (
                            <MessageSquare className="h-3.5 w-3.5 text-muted-foreground" aria-label="Has internal notes" />
                          )}
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 text-xs"
                            onClick={(e) => { e.stopPropagation(); openTicketDialog(t); }}
                          >
                            Manage
                          </Button>
                          {isExpanded ? (
                            <ChevronUp className="h-4 w-4 text-muted-foreground" />
                          ) : (
                            <ChevronDown className="h-4 w-4 text-muted-foreground" />
                          )}
                        </div>
                      </div>

                      {/* Expanded detail */}
                      {isExpanded && (
                        <div className="border-t px-0 pb-3 space-y-3">
                          <div className="pt-3">
                            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">Description</p>
                            <p className="text-sm whitespace-pre-wrap">{t.description}</p>
                          </div>
                          {(t.relatedModule || t.currentPageUrl) && (
                            <div className="flex gap-6 text-xs text-muted-foreground">
                              {t.relatedModule && <span><span className="font-medium">Module:</span> {t.relatedModule}</span>}
                              {t.currentPageUrl && <span><span className="font-medium">Page:</span> {t.currentPageUrl}</span>}
                            </div>
                          )}
                          {t.internalNotes && (
                            <div>
                              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">Internal Notes</p>
                              <p className="text-sm whitespace-pre-wrap bg-muted/40 rounded px-3 py-2">{t.internalNotes}</p>
                            </div>
                          )}
                          {(t.resolvedAt || t.closedAt) && (
                            <div className="flex gap-6 text-xs text-muted-foreground">
                              {t.resolvedAt && <span><span className="font-medium">Resolved:</span> {formatDate(t.resolvedAt)}</span>}
                              {t.closedAt && <span><span className="font-medium">Closed:</span> {formatDate(t.closedAt)}</span>}
                            </div>
                          )}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>

        <TabsContent value="articles" className="space-y-4">
          <div className="flex justify-end">
            <Button onClick={openNewArticle}>
              <Plus className="h-4 w-4 mr-2" />
              New Article
            </Button>
          </div>
          <div className="space-y-2">
            {articles.map((a) => (
              <Card key={a.id}>
                <CardContent className="py-3 flex items-center justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge variant={statusColor(a.status) as any} className="text-xs">{a.status}</Badge>
                      {a.categoryName && <span className="text-xs text-muted-foreground">{a.categoryName}</span>}
                    </div>
                    <p className="font-medium text-sm mt-0.5 truncate">{a.title}</p>
                    <p className="text-xs text-muted-foreground truncate">/help/article/{a.slug}</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Button size="sm" variant="ghost" onClick={() => openEditArticle(a)}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    {a.status !== "archived" && (
                      <Button size="sm" variant="ghost" onClick={() => archiveArticle.mutate(a.id)} title="Archive">
                        <Archive className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="faq" className="space-y-4">
          <div className="flex justify-end">
            <Button onClick={openNewFaq}>
              <Plus className="h-4 w-4 mr-2" />
              New FAQ Item
            </Button>
          </div>
          <div className="space-y-2">
            {faqItems.map((f) => (
              <Card key={f.id}>
                <CardContent className="py-3 flex items-center justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="text-xs">{f.category}</Badge>
                    </div>
                    <p className="font-medium text-sm mt-0.5 line-clamp-1">{f.question}</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Button size="sm" variant="ghost" onClick={() => openEditFaq(f)}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => deleteFaq.mutate(f.id)} className="text-destructive hover:text-destructive">
                      ×
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>
      </Tabs>

      {/* Ticket Manage Dialog */}
      <Dialog open={ticketDialog.open} onOpenChange={(o) => !o && setTicketDialog({ open: false })}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Manage Ticket</DialogTitle>
            <DialogDescription>
              {ticketDialog.ticket?.ticketNumber} &mdash; {ticketDialog.ticket?.subject}
            </DialogDescription>
          </DialogHeader>
          {ticketDialog.ticket && (
            <div className="space-y-4">
              <div className="rounded-md bg-muted/40 px-3 py-2 text-sm space-y-1">
                <p><span className="text-muted-foreground">From:</span> {ticketDialog.ticket.submittedByName} ({ticketDialog.ticket.submittedByEmail})</p>
                <p><span className="text-muted-foreground">Category:</span> {ticketDialog.ticket.category}</p>
                <p><span className="text-muted-foreground">Priority:</span> <span className={PRIORITY_COLORS[ticketDialog.ticket.priority]}>{ticketDialog.ticket.priority}</span></p>
                <p><span className="text-muted-foreground">Submitted:</span> {formatDate(ticketDialog.ticket.createdAt)}</p>
              </div>
              <div className="space-y-1">
                <Label>Status</Label>
                <Select value={ticketStatus} onValueChange={setTicketStatus}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="submitted">Submitted</SelectItem>
                    <SelectItem value="in_review">In Review</SelectItem>
                    <SelectItem value="waiting_on_user">Waiting on User</SelectItem>
                    <SelectItem value="resolved">Resolved</SelectItem>
                    <SelectItem value="closed">Closed</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Internal Notes</Label>
                <Textarea
                  value={ticketNotes}
                  onChange={(e) => setTicketNotes(e.target.value)}
                  placeholder="Add notes visible only to admins..."
                  rows={4}
                />
                <p className="text-xs text-muted-foreground">These notes are not visible to the submitter.</p>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setTicketDialog({ open: false })}>Cancel</Button>
            <Button
              onClick={() => {
                if (!ticketDialog.ticket) return;
                // Compare raw value against the current raw status to detect a change
                const currentRaw = STATUS_DISPLAY_TO_RAW[ticketDialog.ticket.status] ?? ticketDialog.ticket.status;
                updateTicket.mutate({
                  id: ticketDialog.ticket.id,
                  status: ticketStatus !== currentRaw ? ticketStatus : undefined,
                  internalNotes: ticketNotes,
                });
              }}
              disabled={updateTicket.isPending}
            >
              {updateTicket.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Article Dialog */}
      <Dialog open={articleDialog.open} onOpenChange={(o) => !o && setArticleDialog({ open: false })}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{articleDialog.editing ? "Edit Article" : "New Article"}</DialogTitle>
            <DialogDescription>
              {articleDialog.editing ? "Update help article content." : "Create a new help article."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label>Title *</Label>
                <Input value={articleForm.title} onChange={(e) => setArticleForm((f) => ({ ...f, title: e.target.value }))} placeholder="Article title" />
              </div>
              <div className="space-y-1">
                <Label>Slug *</Label>
                <Input value={articleForm.slug} onChange={(e) => setArticleForm((f) => ({ ...f, slug: e.target.value }))} placeholder="article-slug" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label>Category</Label>
                <Select value={articleForm.categoryId} onValueChange={(v) => setArticleForm((f) => ({ ...f, categoryId: v }))}>
                  <SelectTrigger><SelectValue placeholder="Select category" /></SelectTrigger>
                  <SelectContent>
                    {categories.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Module</Label>
                <Input value={articleForm.module} onChange={(e) => setArticleForm((f) => ({ ...f, module: e.target.value }))} placeholder="e.g. controls, evidence" />
              </div>
            </div>
            <div className="space-y-1">
              <Label>Summary</Label>
              <Textarea value={articleForm.summary} onChange={(e) => setArticleForm((f) => ({ ...f, summary: e.target.value }))} placeholder="Short description shown in search results" rows={2} />
            </div>
            <div className="space-y-1">
              <Label>Keywords</Label>
              <Input value={articleForm.keywords} onChange={(e) => setArticleForm((f) => ({ ...f, keywords: e.target.value }))} placeholder="Comma-separated keywords for search" />
            </div>
            <div className="space-y-1">
              <Label>Content (Markdown)</Label>
              <Textarea
                value={articleForm.content}
                onChange={(e) => setArticleForm((f) => ({ ...f, content: e.target.value }))}
                placeholder="## Section Heading&#10;&#10;Article content using markdown..."
                rows={14}
                className="font-mono text-xs"
              />
              <p className="text-xs text-muted-foreground">Supports ## headings, **bold**, - bullet lists, 1. numbered lists</p>
            </div>
            <div className="space-y-1">
              <Label>Status</Label>
              <Select value={articleForm.status} onValueChange={(v) => setArticleForm((f) => ({ ...f, status: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="published">Published</SelectItem>
                  <SelectItem value="draft">Draft</SelectItem>
                  <SelectItem value="archived">Archived</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setArticleDialog({ open: false })}>Cancel</Button>
            <Button onClick={() => saveArticle.mutate(articleForm)} disabled={saveArticle.isPending || !articleForm.title || !articleForm.slug}>
              {saveArticle.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {articleDialog.editing ? "Save Changes" : "Create Article"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* FAQ Dialog */}
      <Dialog open={faqDialog.open} onOpenChange={(o) => !o && setFaqDialog({ open: false })}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{faqDialog.editing ? "Edit FAQ Item" : "New FAQ Item"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1">
              <Label>Question *</Label>
              <Input value={faqForm.question} onChange={(e) => setFaqForm((f) => ({ ...f, question: e.target.value }))} placeholder="FAQ question" />
            </div>
            <div className="space-y-1">
              <Label>Answer *</Label>
              <Textarea value={faqForm.answer} onChange={(e) => setFaqForm((f) => ({ ...f, answer: e.target.value }))} placeholder="Answer text" rows={5} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label>Category</Label>
                <Input value={faqForm.category} onChange={(e) => setFaqForm((f) => ({ ...f, category: e.target.value }))} placeholder="e.g. General" />
              </div>
              <div className="space-y-1">
                <Label>Sort Order</Label>
                <Input type="number" value={faqForm.sortOrder} onChange={(e) => setFaqForm((f) => ({ ...f, sortOrder: parseInt(e.target.value) || 0 }))} />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFaqDialog({ open: false })}>Cancel</Button>
            <Button onClick={() => saveFaq.mutate(faqForm)} disabled={saveFaq.isPending || !faqForm.question || !faqForm.answer}>
              {saveFaq.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {faqDialog.editing ? "Save Changes" : "Create FAQ Item"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
