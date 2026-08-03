import { useState, useEffect, useRef } from "react";
import { useRoute, Link, useLocation } from "wouter";
import {
  ArrowLeft, BookOpen, HelpCircle, Clock, Tag, ChevronRight,
  ThumbsUp, ThumbsDown, LifeBuoy, ArrowRight,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useQuery } from "@tanstack/react-query";
import MarkdownContent from "@/components/help/MarkdownContent";
import { getModuleLabel } from "@/lib/help-labels";

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

interface Article {
  id: string;
  slug: string;
  title: string;
  categoryId?: string;
  categoryName?: string;
  module?: string;
  content: string;
  summary: string;
  keywords?: string;
  updatedAt?: string;
  lastReviewedAt?: string;
  estimatedReadTime?: number;
  contentVersion?: string;
  type?: string;
  requiredRoles?: string[];
  requiredPackages?: string[];
  requiredCapabilities?: string[];
  sortOrder?: number;
}

function formatDate(d: string): string {
  return new Date(d).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

// Extract H2 headings from content for ToC
function extractHeadings(content: string): Array<{ id: string; text: string; level: number }> {
  return content.split("\n")
    .filter((l) => l.startsWith("## ") || l.startsWith("### "))
    .map((l) => {
      const level = l.startsWith("### ") ? 3 : 2;
      const text = l.startsWith("### ") ? l.slice(4) : l.slice(3);
      const id = text.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
      return { id, text, level };
    });
}

type FeedbackReason = "Outdated" | "Steps Did Not Match" | "Missing Information" | "Permission Issue" | "Other";

function ArticleFeedback({ slug, title }: { slug: string; title: string }) {
  const [state, setState] = useState<"idle" | "no-reason" | "submitted">("idle");
  const [helpful, setHelpful] = useState<boolean | null>(null);
  const [reason, setReason] = useState<FeedbackReason | null>(null);
  const [comment, setComment] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const reasons: FeedbackReason[] = ["Outdated", "Steps Did Not Match", "Missing Information", "Permission Issue", "Other"];

  async function submitFeedback() {
    setSubmitting(true);
    try {
      await apiFetch(`/api/help/articles/${slug}/feedback`, {
        method: "POST",
        body: JSON.stringify({ helpful, reason, comment }),
      });
      setState("submitted");
    } finally {
      setSubmitting(false);
    }
  }

  if (state === "submitted") {
    return (
      <div className="flex items-center gap-2 text-sm text-green-600 dark:text-green-400">
        <ThumbsUp className="h-4 w-4" />
        Thank you for your feedback!
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-sm font-medium">Was this article helpful?</p>
      <div className="flex items-center gap-2">
        <Button
          variant={helpful === true ? "default" : "outline"}
          size="sm"
          onClick={() => { setHelpful(true); setState("idle"); submitFeedback(); setHelpful(true); }}
          className="gap-1.5"
        >
          <ThumbsUp className="h-3.5 w-3.5" /> Yes
        </Button>
        <Button
          variant={helpful === false ? "default" : "outline"}
          size="sm"
          onClick={() => { setHelpful(false); setState("no-reason"); }}
          className="gap-1.5"
        >
          <ThumbsDown className="h-3.5 w-3.5" /> No
        </Button>
      </div>

      {state === "no-reason" && (
        <div className="space-y-3 pl-1">
          <p className="text-xs text-muted-foreground">What was the issue?</p>
          <div className="flex flex-wrap gap-2">
            {reasons.map((r) => (
              <button
                key={r}
                onClick={() => setReason(r === reason ? null : r)}
                className={`px-2.5 py-1 rounded-full text-xs border transition-colors ${
                  reason === r
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-background hover:bg-accent border-border"
                }`}
              >
                {r}
              </button>
            ))}
          </div>
          <textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="Optional: add more details…"
            rows={2}
            className="w-full rounded-md border bg-background px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-ring"
          />
          <Button size="sm" onClick={submitFeedback} disabled={submitting}>
            {submitting ? "Submitting…" : "Submit Feedback"}
          </Button>
        </div>
      )}
    </div>
  );
}

export default function HelpArticle() {
  const [, params] = useRoute("/help/article/:slug");
  const [, setLocation] = useLocation();
  const slug = params?.slug ?? "";
  const [activeHeading, setActiveHeading] = useState<string>("");
  const contentRef = useRef<HTMLDivElement>(null);

  const { data: article, isLoading, isError, error } = useQuery<Article, { status?: number }>({
    queryKey: ["help-article", slug],
    queryFn: async () => {
      const r = await apiFetch(`/api/help/articles/${slug}`);
      if (!r.ok) {
        const err = new Error("Not found") as Error & { status: number };
        err.status = r.status;
        throw err;
      }
      return r.json();
    },
    enabled: !!slug,
    retry: false,
  });

  const { data: relatedArticles = [] } = useQuery<Article[]>({
    queryKey: ["help-articles-related", article?.categoryName],
    queryFn: () =>
      apiFetch(`/api/help/articles?category=${encodeURIComponent(article!.categoryName ?? "")}`).then((r) => r.json()),
    enabled: !!article?.categoryName,
    select: (data) => data.filter((a) => a.slug !== slug).slice(0, 3),
  });

  const headings = article ? extractHeadings(article.content) : [];

  // IntersectionObserver for active heading
  useEffect(() => {
    if (!headings.length) return;
    const observers: IntersectionObserver[] = [];
    headings.forEach(({ id }) => {
      const el = document.getElementById(id);
      if (!el) return;
      const obs = new IntersectionObserver(
        ([entry]) => { if (entry.isIntersecting) setActiveHeading(id); },
        { rootMargin: "-20% 0px -70% 0px" }
      );
      obs.observe(el);
      observers.push(obs);
    });
    return () => observers.forEach((o) => o.disconnect());
  }, [headings.map((h) => h.id).join(",")]);

  if (isLoading) {
    return (
      <div className="max-w-5xl mx-auto p-6 space-y-6">
        <Skeleton className="h-4 w-48" />
        <Skeleton className="h-8 w-3/4" />
        <Skeleton className="h-4 w-1/2" />
        <div className="space-y-3 mt-6">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-4/5" />
          <Skeleton className="h-4 w-full" />
        </div>
      </div>
    );
  }

  // Access denied
  const is403 = (error as (Error & { status?: number }) | null)?.status === 403;
  if (is403) {
    return (
      <div className="max-w-5xl mx-auto p-6 text-center py-20 space-y-4">
        <div className="rounded-full bg-red-100 dark:bg-red-950/30 p-4 w-fit mx-auto">
          <HelpCircle className="h-8 w-8 text-red-600 dark:text-red-400" />
        </div>
        <h2 className="text-lg font-semibold">Access Restricted</h2>
        <p className="text-muted-foreground text-sm max-w-md mx-auto">
          This guide is not available for your current role or organization configuration.
        </p>
        <div className="flex items-center justify-center gap-3">
          <Button variant="outline" onClick={() => setLocation("/help")}>
            Return to Help Center
          </Button>
          <Button variant="outline" onClick={() => setLocation("/help")}>
            View Relevant Guides
          </Button>
        </div>
      </div>
    );
  }

  if (isError || !article) {
    return (
      <div className="max-w-5xl mx-auto p-6 text-center py-20">
        <HelpCircle className="h-10 w-10 text-muted-foreground mx-auto mb-4 opacity-40" />
        <h2 className="text-lg font-semibold mb-2">Article not found</h2>
        <p className="text-muted-foreground text-sm mb-6">This article may have been moved or deleted.</p>
        <Button variant="outline" onClick={() => setLocation("/help")}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Help Center
        </Button>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto p-6 space-y-6">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-1.5 text-sm text-muted-foreground flex-wrap">
        <Link href="/help" className="hover:text-foreground transition-colors">Help Center</Link>
        <ChevronRight className="h-3.5 w-3.5" />
        {article.categoryName && (
          <>
            <span
              className="hover:text-foreground transition-colors cursor-pointer"
              onClick={() => setLocation(`/help?category=${encodeURIComponent(article.categoryName ?? "")}`)}
            >
              {article.categoryName}
            </span>
            <ChevronRight className="h-3.5 w-3.5" />
          </>
        )}
        <span className="text-foreground truncate max-w-xs">{article.title}</span>
      </nav>

      {/* Article Header */}
      <div className="space-y-3">
        <div className="flex items-center gap-2 flex-wrap">
          {article.categoryName && (
            <Badge variant="outline" className="text-xs gap-1">
              <BookOpen className="h-3 w-3" />
              {article.categoryName}
            </Badge>
          )}
          {article.module && (
            <Badge variant="secondary" className="text-xs gap-1">
              <Tag className="h-3 w-3" />
              {getModuleLabel(article.module)}
            </Badge>
          )}
          {(article.requiredRoles ?? []).map((r) => (
            <span key={r} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-400">
              {r}
            </span>
          ))}
          {(article.requiredCapabilities ?? []).map((c) => (
            <span key={c} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-700 dark:bg-purple-950/40 dark:text-purple-400">
              {c}
            </span>
          ))}
        </div>
        <h1 className="text-2xl font-bold leading-tight">{article.title}</h1>
        {article.summary && (
          <p className="text-muted-foreground text-sm leading-relaxed">{article.summary}</p>
        )}
        <div className="flex items-center gap-4 text-xs text-muted-foreground flex-wrap">
          {article.estimatedReadTime && (
            <span className="flex items-center gap-1">
              <Clock className="h-3.5 w-3.5" />
              {article.estimatedReadTime} min read
            </span>
          )}
          {article.lastReviewedAt && (
            <span className="flex items-center gap-1">
              <Clock className="h-3.5 w-3.5" />
              Reviewed {formatDate(article.lastReviewedAt)}
            </span>
          )}
          {!article.lastReviewedAt && article.updatedAt && (
            <span className="flex items-center gap-1">
              <Clock className="h-3.5 w-3.5" />
              Updated {formatDate(article.updatedAt)}
            </span>
          )}
          {article.contentVersion && (
            <span className="text-muted-foreground/60">v{article.contentVersion}</span>
          )}
        </div>
      </div>

      <hr className="border-border" />

      {/* Two-column layout */}
      <div className="flex gap-8">
        {/* Table of Contents — sticky left column, hidden on mobile */}
        {headings.length > 0 && (
          <aside className="hidden md:block w-48 shrink-0">
            <div className="sticky top-6 space-y-1">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">On this page</p>
              {headings.map((h) => (
                <a
                  key={h.id}
                  href={`#${h.id}`}
                  onClick={(e) => {
                    e.preventDefault();
                    document.getElementById(h.id)?.scrollIntoView({ behavior: "smooth" });
                  }}
                  className={`block text-xs leading-snug py-1 border-l-2 pl-2.5 transition-colors hover:text-foreground ${
                    activeHeading === h.id
                      ? "border-primary text-foreground font-medium"
                      : "border-transparent text-muted-foreground"
                  } ${h.level === 3 ? "pl-5" : ""}`}
                >
                  {h.text}
                </a>
              ))}
            </div>
          </aside>
        )}

        {/* Article content */}
        <div ref={contentRef} className="flex-1 min-w-0">
          <MarkdownContent content={article.content} />
        </div>

        {/* Related guides — right column on desktop */}
        {relatedArticles.length > 0 && (
          <aside className="hidden lg:block w-56 shrink-0">
            <div className="sticky top-6 space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Related Guides</p>
              {relatedArticles.map((r) => (
                <Link key={r.id} href={`/help/article/${r.slug}`}>
                  <Card className="cursor-pointer hover:bg-accent/50 transition-colors">
                    <CardContent className="py-3 px-3 flex items-start justify-between gap-2">
                      <span className="text-xs font-medium leading-snug">{r.title}</span>
                      <ArrowRight className="h-3 w-3 text-muted-foreground shrink-0 mt-0.5" />
                    </CardContent>
                  </Card>
                </Link>
              ))}
            </div>
          </aside>
        )}
      </div>

      {/* Related guides — bottom on mobile */}
      {relatedArticles.length > 0 && (
        <div className="lg:hidden space-y-2">
          <h3 className="font-semibold text-sm">Related Guides</h3>
          <div className="grid gap-2">
            {relatedArticles.map((r) => (
              <Link key={r.id} href={`/help/article/${r.slug}`}>
                <Card className="cursor-pointer hover:bg-accent/50 transition-colors">
                  <CardContent className="py-3 px-4 flex items-center justify-between">
                    <span className="text-sm font-medium">{r.title}</span>
                    <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        </div>
      )}

      <hr className="border-border" />

      {/* Article Feedback */}
      <div className="space-y-4">
        <ArticleFeedback slug={slug} title={article.title} />

        <div>
          <Link
            href={`/help/support-ticket?article=${encodeURIComponent(slug)}&subject=${encodeURIComponent(`Help: ${article.title}`)}`}
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <LifeBuoy className="h-4 w-4" />
            Submit a Support Ticket About This Guide
          </Link>
        </div>
      </div>

      {/* Navigation footer */}
      <div className="flex items-center justify-between pt-2">
        <Button variant="ghost" size="sm" onClick={() => setLocation("/help")}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Help Center
        </Button>
        {article.categoryName && (
          <Button variant="ghost" size="sm" onClick={() => setLocation(`/help?category=${encodeURIComponent(article.categoryName ?? "")}`)}>
            More in {article.categoryName}
            <ChevronRight className="h-4 w-4 ml-1" />
          </Button>
        )}
      </div>
    </div>
  );
}
