import { useState, useMemo } from "react";
import { Link, useLocation, useSearch } from "wouter";
import {
  Search, HelpCircle, BookOpen, ChevronRight, ArrowRight, ArrowLeft,
  Rocket, LayoutDashboard, ShieldCheck, FileText, Activity,
  AlertTriangle, Map, Cable, BarChart3, Users, Lock,
  GitBranch, Wrench, Mail,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
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

const ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  Rocket, LayoutDashboard, ShieldCheck, FileText, Activity,
  AlertTriangle, Map, Cable, BarChart3, Users, Lock,
  GitBranch, Wrench, BookOpen, HelpCircle,
};

interface Category {
  id: string;
  name: string;
  description: string;
  icon: string;
  sortOrder: number;
  articleCount: number;
}

interface Article {
  id: string;
  slug: string;
  title: string;
  summary: string;
  categoryName: string;
  module?: string;
}

interface SearchResult {
  articles: Article[];
  faq: Array<{ id: string; question: string; answer: string; category: string }>;
}

export default function Help() {
  const [searchQuery, setSearchQuery] = useState("");
  const [, setLocation] = useLocation();
  const search = useSearch();
  const params = new URLSearchParams(search);
  const selectedCategory = params.get("category") ?? "";

  const { data: categories = [] } = useQuery<Category[]>({
    queryKey: ["help-categories"],
    queryFn: () => apiFetch("/api/help/categories").then((r) => r.json()),
  });

  const { data: articles = [] } = useQuery<Article[]>({
    queryKey: ["help-articles"],
    queryFn: () => apiFetch("/api/help/articles").then((r) => r.json()),
  });

  const { data: searchResults } = useQuery<SearchResult>({
    queryKey: ["help-search", searchQuery],
    queryFn: () =>
      apiFetch(`/api/help/search?q=${encodeURIComponent(searchQuery)}`).then((r) => r.json()),
    enabled: searchQuery.length >= 2,
  });

  const featuredArticles = useMemo(() => articles.slice(0, 6), [articles]);

  const categoryArticles = useMemo(
    () => selectedCategory ? articles.filter((a) => a.categoryName === selectedCategory) : [],
    [articles, selectedCategory]
  );

  const activeCat = useMemo(
    () => categories.find((c) => c.name === selectedCategory),
    [categories, selectedCategory]
  );

  const isSearching = searchQuery.length >= 2;

  return (
    <div className="max-w-5xl mx-auto space-y-8 p-6">
      {/* Header */}
      <div className="text-center space-y-4 py-8">
        <div className="flex items-center justify-center gap-3">
          <div className="rounded-xl bg-primary/10 p-3">
            <HelpCircle className="h-8 w-8 text-primary" />
          </div>
          <h1 className="text-3xl font-bold">Help & User Guide</h1>
        </div>
        <p className="text-muted-foreground text-lg max-w-xl mx-auto">
          Find answers, learn how to use Control HUB, and explore step-by-step guides.
        </p>

        {/* Search */}
        <div className="relative max-w-xl mx-auto mt-6">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search help articles…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10 h-11"
          />
        </div>
      </div>

      {/* Search Results */}
      {isSearching && (
        <div className="space-y-4">
          <h2 className="text-lg font-semibold">Search Results for "{searchQuery}"</h2>

          {(!searchResults?.articles.length && !searchResults?.faq.length) && (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground">
                <Search className="h-8 w-8 mx-auto mb-3 opacity-40" />
                <p>No results found. Try different keywords.</p>
              </CardContent>
            </Card>
          )}

          {(searchResults?.articles ?? []).length > 0 && (
            <div className="space-y-2">
              <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">Articles</h3>
              {searchResults!.articles.map((a) => (
                <Link key={a.id} href={`/help/article/${a.slug}`}>
                  <Card className="cursor-pointer hover:bg-accent/50 transition-colors">
                    <CardContent className="py-4 flex items-start justify-between gap-4">
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <Badge variant="outline" className="text-xs">{a.categoryName}</Badge>
                          {a.module && <Badge variant="secondary" className="text-xs">{a.module}</Badge>}
                        </div>
                        <h4 className="font-medium">{a.title}</h4>
                        <p className="text-sm text-muted-foreground mt-0.5 line-clamp-2">{a.summary}</p>
                      </div>
                      <ArrowRight className="h-4 w-4 text-muted-foreground shrink-0 mt-1" />
                    </CardContent>
                  </Card>
                </Link>
              ))}
            </div>
          )}

          {(searchResults?.faq ?? []).length > 0 && (
            <div className="space-y-2">
              <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">FAQ</h3>
              {searchResults!.faq.map((f) => (
                <Link key={f.id} href={`/help/faq`}>
                  <Card className="cursor-pointer hover:bg-accent/50 transition-colors">
                    <CardContent className="py-4">
                      <p className="font-medium text-sm">{f.question}</p>
                      <p className="text-sm text-muted-foreground mt-1 line-clamp-2">{f.answer}</p>
                    </CardContent>
                  </Card>
                </Link>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Category drill-down view */}
      {!isSearching && selectedCategory && (
        <div className="space-y-6">
          {/* Back + heading */}
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" onClick={() => setLocation("/help")} className="gap-1.5 -ml-2">
              <ArrowLeft className="h-4 w-4" />
              All Categories
            </Button>
          </div>

          <div className="flex items-center gap-3">
            {activeCat && (() => {
              const Icon = ICON_MAP[activeCat.icon] ?? HelpCircle;
              return (
                <div className="rounded-lg bg-primary/10 p-2.5 shrink-0">
                  <Icon className="h-6 w-6 text-primary" />
                </div>
              );
            })()}
            <div>
              <h2 className="text-2xl font-semibold">{selectedCategory}</h2>
              {activeCat && <p className="text-sm text-muted-foreground mt-0.5">{activeCat.description}</p>}
            </div>
          </div>

          {categoryArticles.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground">
                <BookOpen className="h-8 w-8 mx-auto mb-3 opacity-40" />
                <p>No articles in this category yet.</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {categoryArticles.map((a) => (
                <Link key={a.id} href={`/help/article/${a.slug}`}>
                  <Card className="cursor-pointer hover:bg-accent/50 transition-colors">
                    <CardContent className="py-4 flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        {a.module && (
                          <Badge variant="secondary" className="text-xs mb-1.5">{a.module}</Badge>
                        )}
                        <h4 className="font-medium text-sm leading-snug">{a.title}</h4>
                        <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{a.summary}</p>
                      </div>
                      <ArrowRight className="h-4 w-4 text-muted-foreground shrink-0 mt-1" />
                    </CardContent>
                  </Card>
                </Link>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Home view */}
      {!isSearching && !selectedCategory && (
        <>
          {/* Quick Links */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Link href="/help/article/getting-started">
              <Card className="cursor-pointer hover:bg-accent/50 transition-colors h-full">
                <CardContent className="p-4 flex flex-col items-center text-center gap-2">
                  <Rocket className="h-6 w-6 text-primary" />
                  <span className="text-sm font-medium">Getting Started</span>
                </CardContent>
              </Card>
            </Link>
            <Link href="/help/faq">
              <Card className="cursor-pointer hover:bg-accent/50 transition-colors h-full">
                <CardContent className="p-4 flex flex-col items-center text-center gap-2">
                  <HelpCircle className="h-6 w-6 text-primary" />
                  <span className="text-sm font-medium">FAQ</span>
                </CardContent>
              </Card>
            </Link>
            <Link href="/help/article/user-roles-guide">
              <Card className="cursor-pointer hover:bg-accent/50 transition-colors h-full">
                <CardContent className="p-4 flex flex-col items-center text-center gap-2">
                  <Users className="h-6 w-6 text-primary" />
                  <span className="text-sm font-medium">User Roles</span>
                </CardContent>
              </Card>
            </Link>
            <Link href="/help/videos">
              <Card className="cursor-pointer hover:bg-accent/50 transition-colors h-full">
                <CardContent className="p-4 flex flex-col items-center text-center gap-2">
                  <BookOpen className="h-6 w-6 text-primary" />
                  <span className="text-sm font-medium">Videos</span>
                </CardContent>
              </Card>
            </Link>
          </div>

          {/* Categories */}
          <div>
            <h2 className="text-xl font-semibold mb-4">Browse by Category</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {categories.map((cat) => {
                const Icon = ICON_MAP[cat.icon] ?? HelpCircle;
                return (
                  <Card
                    key={cat.id}
                    className="cursor-pointer hover:bg-accent/50 transition-colors group"
                    onClick={() => setLocation(`/help?category=${encodeURIComponent(cat.name)}`)}
                  >
                    <CardContent className="p-5">
                      <div className="flex items-start gap-3">
                        <div className="rounded-lg bg-primary/10 p-2 shrink-0">
                          <Icon className="h-5 w-5 text-primary" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2">
                            <h3 className="font-medium text-sm leading-tight">{cat.name}</h3>
                            <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:translate-x-0.5 transition-transform shrink-0" />
                          </div>
                          <p className="text-xs text-muted-foreground mt-1 leading-relaxed line-clamp-2">{cat.description}</p>
                          {cat.articleCount > 0 && (
                            <p className="text-xs text-muted-foreground/60 mt-2">{cat.articleCount} article{cat.articleCount !== 1 ? "s" : ""}</p>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </div>

          {/* Featured Articles */}
          {featuredArticles.length > 0 && (
            <div>
              <h2 className="text-xl font-semibold mb-4">Popular Articles</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {featuredArticles.map((a) => (
                  <Link key={a.id} href={`/help/article/${a.slug}`}>
                    <Card className="cursor-pointer hover:bg-accent/50 transition-colors h-full">
                      <CardContent className="p-4 flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          {a.categoryName && (
                            <Badge variant="outline" className="text-xs mb-1.5">{a.categoryName}</Badge>
                          )}
                          <h4 className="font-medium text-sm leading-snug">{a.title}</h4>
                          <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{a.summary}</p>
                        </div>
                        <ArrowRight className="h-4 w-4 text-muted-foreground shrink-0 mt-1" />
                      </CardContent>
                    </Card>
                  </Link>
                ))}
              </div>
            </div>
          )}

          {/* Contact Support */}
          <Card className="bg-muted/40 border-dashed">
            <CardContent className="py-6 flex flex-col sm:flex-row items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="rounded-full bg-primary/10 p-2">
                  <Mail className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <p className="font-medium text-sm">Still need help?</p>
                  <p className="text-xs text-muted-foreground">Our team is here to help with any questions.</p>
                </div>
              </div>
              <Button asChild variant="outline" size="sm">
                <a href="mailto:info@carmetechnology.com?subject=Control%20HUB%20Support%20Request">
                  Contact Support
                </a>
              </Button>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
