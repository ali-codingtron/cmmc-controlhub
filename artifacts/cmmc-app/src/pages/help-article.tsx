import { useRoute, Link, useLocation } from "wouter";
import { ArrowLeft, BookOpen, HelpCircle, Clock, Tag } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useQuery } from "@tanstack/react-query";
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
import { MarkdownContent } from "@/components/help/MarkdownContent";

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
  updatedAt: string;
}

function formatDate(d: string) {
  return new Date(d).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

export default function HelpArticle() {
  const [, params] = useRoute("/help/article/:slug");
  const [, setLocation] = useLocation();
  const slug = params?.slug ?? "";

  const { data: article, isLoading, isError } = useQuery<Article>({
    queryKey: ["help-article", slug],
    queryFn: () => apiFetch(`/api/help/articles/${slug}`).then((r) => r.json()),
    enabled: !!slug,
  });

  const { data: relatedArticles = [] } = useQuery<Article[]>({
    queryKey: ["help-articles-related", article?.categoryName],
    queryFn: () =>
      apiFetch(`/api/help/articles?category=${encodeURIComponent(article!.categoryName ?? "")}`).then((r) => r.json()),
    enabled: !!article?.categoryName,
    select: (data) => data.filter((a) => a.slug !== slug).slice(0, 4),
  });

  if (isLoading) {
    return (
      <div className="max-w-3xl mx-auto p-6 space-y-6">
        <Skeleton className="h-8 w-3/4" />
        <Skeleton className="h-4 w-1/2" />
        <div className="space-y-3">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-4/5" />
        </div>
      </div>
    );
  }

  if (isError || !article) {
    return (
      <div className="max-w-3xl mx-auto p-6 text-center py-20">
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
    <div className="max-w-3xl mx-auto p-6 space-y-6">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-2 text-sm text-muted-foreground">
        <Link href="/help" className="hover:text-foreground transition-colors">Help Center</Link>
        <span>/</span>
        {article.categoryName && (
          <>
            <span className="hover:text-foreground transition-colors cursor-pointer" onClick={() => setLocation(`/help?category=${encodeURIComponent(article.categoryName ?? "")}`)}>
              {article.categoryName}
            </span>
            <span>/</span>
          </>
        )}
        <span className="text-foreground">{article.title}</span>
      </nav>

      {/* Article Header */}
      <div className="space-y-3">
        <div className="flex items-center gap-2 flex-wrap">
          {article.categoryName && (
            <Badge variant="secondary" className="text-xs">
              <BookOpen className="h-3 w-3 mr-1" />
              {article.categoryName}
            </Badge>
          )}
          {article.module && (
            <Badge variant="outline" className="text-xs">
              <Tag className="h-3 w-3 mr-1" />
              {article.module}
            </Badge>
          )}
        </div>
        <h1 className="text-2xl font-bold leading-tight">{article.title}</h1>
        {article.summary && (
          <p className="text-muted-foreground text-sm leading-relaxed">{article.summary}</p>
        )}
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Clock className="h-3.5 w-3.5" />
          <span>Last updated {formatDate(article.updatedAt)}</span>
        </div>
      </div>

      <hr className="border-border" />

      {/* Article Content */}
      <div className="min-h-[200px]">
        <MarkdownContent content={article.content} />
      </div>

      <hr className="border-border" />

      {/* Navigation */}
      <div className="flex items-center justify-between">
        <Button variant="ghost" size="sm" onClick={() => setLocation("/help")}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Help Center
        </Button>
        <Button asChild variant="ghost" size="sm">
          <a href="mailto:info@carmetechnology.com?subject=Control%20HUB%20Support%20Request">
            Was this helpful? Contact us
          </a>
        </Button>
      </div>

      {/* Related Articles */}
      {relatedArticles.length > 0 && (
        <div className="space-y-3">
          <h3 className="font-semibold text-sm">Related Articles</h3>
          <div className="grid gap-2">
            {relatedArticles.map((r) => (
              <Link key={r.id} href={`/help/article/${r.slug}`}>
                <Card className="cursor-pointer hover:bg-accent/50 transition-colors">
                  <CardContent className="py-3 px-4 flex items-center justify-between">
                    <span className="text-sm font-medium">{r.title}</span>
                    <ArrowLeft className="h-3.5 w-3.5 text-muted-foreground rotate-180" />
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
