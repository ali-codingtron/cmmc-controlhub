import { useState, useMemo, useEffect, useRef } from "react";
import { Link, useLocation, useSearch } from "wouter";
import {
  Search, HelpCircle, BookOpen, ChevronRight, ArrowRight, ArrowLeft,
  Rocket, LayoutDashboard, ShieldCheck, CheckSquare, FileText, GitMerge,
  Scale, Activity, AlertTriangle, Map, Cable, BarChart3, Users, Building2,
  Lock, GitBranch, Wrench, Clock, LifeBuoy, FileCheck,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useQuery } from "@tanstack/react-query";
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

interface HelpContext {
  platformRole: "global_admin" | "user";
  organizationRole: string | null;
  effectiveRole: string;
  effectiveCapabilities: string[];
  selectedOrganizationId: string | null;
  selectedOrganizationName: string | null;
  activePackageKeys: string[];
  enabledModules: string[];
  organizationLevel: "L1" | "L2" | null;
  isDemo: boolean;
  isTest: boolean;
}

interface Category {
  id: string;
  name: string;
  description: string;
  icon: string;
  sortOrder: number;
  articleCount: number;
  lastUpdated?: string;
}

interface Article {
  id: string;
  slug: string;
  title: string;
  summary: string;
  categoryName: string;
  module?: string;
  estimatedReadTime?: number;
  type?: string;
  lastReviewedAt?: string;
  sortOrder?: number;
}

interface SearchResult {
  articles: Article[];
  faq: Array<{ id: string; question: string; answer: string; category: string }>;
}

const CATEGORY_ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  "Getting Started": Rocket,
  "Dashboard": LayoutDashboard,
  "Controls & Requirements": ShieldCheck,
  "Tasks": CheckSquare,
  "Evidence": FileText,
  "Framework Crosswalk": GitMerge,
  "DFARS Obligations": Scale,
  "Monitoring Tracker": Activity,
  "POA&M Management": AlertTriangle,
  "Implementation Roadmap": Map,
  "Pre-Assessment": Cable,
  "Documentation": BookOpen,
  "System Security Plan": FileCheck,
  "Reports & Exports": BarChart3,
  "Users & Roles": Users,
  "Organizations & Modules": Building2,
  "MFA, SSO & Sign-In": Lock,
  "Workflows": GitBranch,
  "Troubleshooting": Wrench,
};

// Icon map for icon name strings from backend
const ICON_NAME_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  Rocket, LayoutDashboard, ShieldCheck, CheckSquare, FileText, GitMerge,
  Scale, Activity, AlertTriangle, Map, Cable, BookOpen, FileCheck,
  BarChart3, Users, Building2, Lock, GitBranch, Wrench, HelpCircle,
};

function getCategoryIcon(cat: Category): React.ComponentType<{ className?: string }> {
  return CATEGORY_ICON_MAP[cat.name] ?? ICON_NAME_MAP[cat.icon] ?? HelpCircle;
}

function isRecentlyUpdated(lastUpdated?: string): boolean {
  if (!lastUpdated) return false;
  const d = new Date(lastUpdated);
  const now = new Date();
  return (now.getTime() - d.getTime()) < 30 * 24 * 60 * 60 * 1000;
}

function relativeDate(dateStr: string): string {
  const d = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return `${diffDays} days ago`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)} week${Math.floor(diffDays / 7) !== 1 ? "s" : ""} ago`;
  if (diffDays < 365) return `${Math.floor(diffDays / 30)} month${Math.floor(diffDays / 30) !== 1 ? "s" : ""} ago`;
  return `${Math.floor(diffDays / 365)} year${Math.floor(diffDays / 365) !== 1 ? "s" : ""} ago`;
}

function ArticleTypeBadge({ type }: { type?: string }) {
  if (!type) return null;
  const colorMap: Record<string, string> = {
    "Guide": "bg-blue-100 text-blue-700 dark:bg-blue-950/50 dark:text-blue-400",
    "Workflow": "bg-green-100 text-green-700 dark:bg-green-950/50 dark:text-green-400",
    "FAQ": "bg-purple-100 text-purple-700 dark:bg-purple-950/50 dark:text-purple-400",
  };
  return (
    <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium ${colorMap[type] ?? "bg-muted text-muted-foreground"}`}>
      {type}
    </span>
  );
}

export default function Help() {
  const [searchQuery, setSearchQuery] = useState("");
  const [, setLocation] = useLocation();
  const search = useSearch();
  const params = new URLSearchParams(search);
  const selectedCategory = params.get("category") ?? "";
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Keyboard shortcut: press '/' to focus search
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "/" && document.activeElement?.tagName !== "INPUT" && document.activeElement?.tagName !== "TEXTAREA") {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const { data: helpContext, isLoading: contextLoading } = useQuery<HelpContext>({
    queryKey: ["help-context"],
    queryFn: () => apiFetch("/api/help/context").then((r) => r.json()),
  });

  const { data: categories = [] } = useQuery<Category[]>({
    queryKey: ["help-categories"],
    queryFn: () => apiFetch("/api/help/categories").then((r) => r.json()),
  });

  const { data: articles = [] } = useQuery<Article[]>({
    queryKey: ["help-articles"],
    queryFn: () => apiFetch("/api/help/articles").then((r) => r.json()),
  });

  const { data: recommended = [] } = useQuery<Article[]>({
    queryKey: ["help-recommended"],
    queryFn: () => apiFetch("/api/help/recommended").then((r) => r.json()),
  });

  const { data: searchResults } = useQuery<SearchResult>({
    queryKey: ["help-search", searchQuery],
    queryFn: () =>
      apiFetch(`/api/help/search?q=${encodeURIComponent(searchQuery)}`).then((r) => r.json()),
    enabled: searchQuery.length >= 2,
  });

  const categoryArticles = useMemo(
    () => selectedCategory ? articles.filter((a) => a.categoryName === selectedCategory) : [],
    [articles, selectedCategory]
  );

  const activeCat = useMemo(
    () => categories.find((c) => c.name === selectedCategory),
    [categories, selectedCategory]
  );

  const visibleCategories = useMemo(
    () => categories.filter((c) => c.articleCount > 0),
    [categories]
  );

  const recentlyUpdated = useMemo(() => {
    return articles
      .filter((a) => !!a.lastReviewedAt)
      .sort((a, b) => new Date(b.lastReviewedAt!).getTime() - new Date(a.lastReviewedAt!).getTime())
      .slice(0, 5);
  }, [articles]);

  const isSearching = searchQuery.length >= 2;

  return (
    <div className="max-w-[1200px] mx-auto p-6 space-y-8">
      {/* Section 1: Personalized Context Header */}
      {!helpContext?.isDemo && (
        <div className="rounded-lg border bg-card px-4 py-3 shadow-sm">
          {contextLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-4 w-64" />
              <Skeleton className="h-4 w-48" />
            </div>
          ) : helpContext ? (
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-sm">
              <span className="text-muted-foreground">Viewing help for:</span>
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-700 dark:bg-blue-950/50 dark:text-blue-400">
                {helpContext.effectiveRole}
              </span>
              {helpContext.selectedOrganizationName && (
                <span className="text-muted-foreground">
                  Organization: <span className="text-foreground font-medium">{helpContext.selectedOrganizationName}</span>
                </span>
              )}
              {helpContext.activePackageKeys.length > 0 && (
                <div className="flex items-center gap-1.5">
                  {helpContext.activePackageKeys.map((pkg) => (
                    <span key={pkg} className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-muted text-muted-foreground">
                      {pkg}
                    </span>
                  ))}
                </div>
              )}
            </div>
          ) : null}
        </div>
      )}

      {/* Section 2: Hero Search Area */}
      <div className="rounded-xl border bg-card shadow-sm p-8 text-center space-y-4">
        <div className="flex items-center justify-center gap-3">
          <div className="rounded-xl bg-primary/10 p-3">
            <HelpCircle className="h-8 w-8 text-primary" />
          </div>
          <h1 className="text-3xl font-bold">Control HUB Help Center</h1>
        </div>
        <p className="text-muted-foreground text-base max-w-xl mx-auto">
          Find role-specific guidance, step-by-step workflows, troubleshooting help, and support.
        </p>
        <div className="relative max-w-2xl mx-auto mt-4">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
          <Input
            ref={searchInputRef}
            placeholder="Search guides, FAQs, workflows, and troubleshooting…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-11 h-12 text-base"
          />
        </div>
        <p className="text-xs text-muted-foreground">Press <kbd className="px-1.5 py-0.5 rounded border bg-muted font-mono text-xs">/</kbd> to search</p>
      </div>

      {/* Section 3: Search Results */}
      {isSearching && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Search Results for &ldquo;{searchQuery}&rdquo;</h2>
            <Button variant="ghost" size="sm" onClick={() => setSearchQuery("")}>Clear Search</Button>
          </div>

          {(!searchResults?.articles.length && !searchResults?.faq.length) && (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground space-y-3">
                <Search className="h-8 w-8 mx-auto mb-3 opacity-40" />
                <p>No help content matched your search.</p>
                <div className="flex items-center justify-center gap-3">
                  <Button variant="outline" size="sm" onClick={() => setSearchQuery("")}>Clear Search</Button>
                  <Button variant="outline" size="sm" asChild>
                    <Link href="/help/support-ticket">Submit a Support Ticket</Link>
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {(searchResults?.articles ?? []).length > 0 && (
            <div className="space-y-2">
              <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Articles</h3>
              {searchResults!.articles.map((a) => (
                <Link key={a.id} href={`/help/article/${a.slug}`}>
                  <Card className="cursor-pointer hover:bg-accent/50 transition-colors hover:shadow-sm">
                    <CardContent className="py-4 flex items-start justify-between gap-4">
                      <div>
                        <div className="flex items-center gap-2 mb-1.5">
                          <Badge variant="outline" className="text-xs">{a.categoryName}</Badge>
                          <ArticleTypeBadge type={a.type} />
                          {a.module && (
                            <Badge variant="secondary" className="text-xs">{getModuleLabel(a.module)}</Badge>
                          )}
                        </div>
                        <h4 className="font-medium text-sm">{a.title}</h4>
                        <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{a.summary}</p>
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
              <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">FAQ</h3>
              {searchResults!.faq.map((f) => (
                <Link key={f.id} href="/help/faq">
                  <Card className="cursor-pointer hover:bg-accent/50 transition-colors">
                    <CardContent className="py-4">
                      <p className="font-medium text-sm">{f.question}</p>
                      <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{f.answer}</p>
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
          <Button variant="ghost" size="sm" onClick={() => setLocation("/help")} className="gap-1.5 -ml-2">
            <ArrowLeft className="h-4 w-4" />
            All Categories
          </Button>

          <div className="flex items-center gap-3">
            {activeCat && (() => {
              const Icon = getCategoryIcon(activeCat);
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
                  <Card className="cursor-pointer hover:bg-accent/50 hover:shadow-sm transition-all">
                    <CardContent className="py-4 flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1.5">
                          {a.module && (
                            <Badge variant="secondary" className="text-xs">{getModuleLabel(a.module)}</Badge>
                          )}
                          <ArticleTypeBadge type={a.type} />
                        </div>
                        <h4 className="font-medium text-sm leading-snug">{a.title}</h4>
                        <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{a.summary}</p>
                        {a.estimatedReadTime && (
                          <p className="text-xs text-muted-foreground/60 mt-1.5 flex items-center gap-1">
                            <Clock className="h-3 w-3" /> {a.estimatedReadTime} min read
                          </p>
                        )}
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
          {/* Section 4: Quick Actions */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { href: "/help/article/getting-started", icon: Rocket, title: "Start Here", desc: "New to Control HUB? Begin here." },
              { href: "/help/article/user-roles-guide", icon: Users, title: "My Role Guide", desc: "Understand your permissions and capabilities." },
              { href: "#recently-updated", icon: Clock, title: "Recently Updated", desc: "See what's been updated recently." },
              { href: "/help/support-ticket", icon: LifeBuoy, title: "Submit a Support Ticket", desc: "Get help from the support team." },
            ].map(({ href, icon: Icon, title, desc }) => (
              <Link key={href} href={href}>
                <Card className="cursor-pointer hover:shadow-sm transition-all border h-full group relative">
                  <CardContent className="p-4 flex flex-col gap-2 h-full">
                    <div className="rounded-full bg-primary/10 p-2 w-fit">
                      <Icon className="h-4 w-4 text-primary" />
                    </div>
                    <p className="font-semibold text-sm leading-snug">{title}</p>
                    <p className="text-xs text-muted-foreground leading-relaxed">{desc}</p>
                    <div className="absolute bottom-3 right-3">
                      <ArrowRight className="h-3.5 w-3.5 text-muted-foreground/50 group-hover:text-muted-foreground transition-colors" />
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>

          {/* Section 5: Recommended for Your Role */}
          {recommended.length > 0 && (
            <div className="space-y-3">
              <h2 className="text-xl font-semibold">Recommended for You</h2>
              <div className="space-y-2">
                {recommended.slice(0, 5).map((a) => (
                  <Link key={a.id} href={`/help/article/${a.slug}`}>
                    <Card className="cursor-pointer hover:bg-accent/50 hover:shadow-sm transition-all">
                      <CardContent className="py-3 px-4 flex items-center justify-between gap-3">
                        <div className="flex items-center gap-3 min-w-0 flex-1">
                          <div>
                            <div className="flex items-center gap-2 mb-0.5">
                              <Badge variant="outline" className="text-xs">{a.categoryName}</Badge>
                              <ArticleTypeBadge type={a.type} />
                            </div>
                            <p className="font-medium text-sm leading-snug">{a.title}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-3 shrink-0">
                          {a.estimatedReadTime && (
                            <span className="text-xs text-muted-foreground flex items-center gap-1">
                              <Clock className="h-3 w-3" /> {a.estimatedReadTime} min
                            </span>
                          )}
                          <ArrowRight className="h-4 w-4 text-muted-foreground" />
                        </div>
                      </CardContent>
                    </Card>
                  </Link>
                ))}
              </div>
            </div>
          )}

          {/* Section 6: Browse by Category */}
          <div className="space-y-4">
            <h2 className="text-xl font-semibold">Browse by Category</h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
              {visibleCategories.map((cat) => {
                const Icon = getCategoryIcon(cat);
                const updated = isRecentlyUpdated(cat.lastUpdated);
                return (
                  <Card
                    key={cat.id}
                    className="cursor-pointer hover:shadow-sm transition-all group"
                    onClick={() => setLocation(`/help?category=${encodeURIComponent(cat.name)}`)}
                  >
                    <CardContent className="p-4">
                      <div className="flex items-start gap-3">
                        <div className="rounded-lg bg-primary/10 p-2 shrink-0">
                          <Icon className="h-4 w-4 text-primary" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-1">
                            <h3 className="font-medium text-sm leading-tight">{cat.name}</h3>
                            <ChevronRight className="h-3.5 w-3.5 text-muted-foreground group-hover:translate-x-0.5 transition-transform shrink-0" />
                          </div>
                          {updated && (
                            <div className="flex items-center gap-1 mt-0.5">
                              <span className="h-1.5 w-1.5 rounded-full bg-blue-500 inline-block" />
                              <span className="text-xs text-blue-600 dark:text-blue-400">Updated</span>
                            </div>
                          )}
                          <p className="text-xs text-muted-foreground mt-1 leading-relaxed line-clamp-2">{cat.description}</p>
                          <p className="text-xs text-muted-foreground/60 mt-1.5">
                            {cat.articleCount} article{cat.articleCount !== 1 ? "s" : ""}
                          </p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </div>

          {/* Section 7: Recently Updated */}
          {recentlyUpdated.length > 0 && (
            <div id="recently-updated" className="space-y-3">
              <h2 className="text-xl font-semibold">Recently Updated</h2>
              <div className="space-y-2">
                {recentlyUpdated.map((a) => (
                  <Link key={a.id} href={`/help/article/${a.slug}`}>
                    <Card className="cursor-pointer hover:bg-accent/50 hover:shadow-sm transition-all">
                      <CardContent className="py-3 px-4 flex items-center justify-between gap-3">
                        <div className="flex items-center gap-3 min-w-0 flex-1">
                          <div>
                            <Badge variant="outline" className="text-xs mb-0.5">{a.categoryName}</Badge>
                            <p className="font-medium text-sm leading-snug">{a.title}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-3 shrink-0 text-xs text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            Reviewed {relativeDate(a.lastReviewedAt!)}
                          </span>
                          {a.estimatedReadTime && <span>{a.estimatedReadTime} min</span>}
                          <ArrowRight className="h-4 w-4" />
                        </div>
                      </CardContent>
                    </Card>
                  </Link>
                ))}
              </div>
            </div>
          )}

          {/* Section 8: Support Panel */}
          <Card className="border-dashed bg-primary/5">
            <CardContent className="py-6 px-6">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div className="space-y-1">
                  <h3 className="font-semibold text-base">Still Need Help?</h3>
                  <p className="text-sm text-muted-foreground">
                    Submit a support request with your role, organization, and context already included.
                  </p>
                  <p className="text-xs text-muted-foreground">Contact: support@carmetechnology.com</p>
                </div>
                <div className="flex flex-col sm:flex-row gap-2 shrink-0">
                  <Button asChild>
                    <Link href="/help/support-ticket">
                      <LifeBuoy className="h-4 w-4 mr-2" />
                      Submit a Support Ticket
                    </Link>
                  </Button>
                  <Button variant="outline" asChild>
                    <Link href="/help/my-tickets">View My Support Requests</Link>
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
