import { useState } from "react";
import { Link } from "wouter";
import { ChevronDown, HelpCircle, Search, LifeBuoy } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
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

interface FaqItem {
  id: string;
  question: string;
  answer: string;
  category: string;
  sortOrder: number;
}

function FaqAccordionItem({ item, open, onToggle }: { item: FaqItem; open: boolean; onToggle: () => void }) {
  return (
    <div id={`faq-${item.id}`} className="border rounded-lg overflow-hidden bg-card">
      <button
        className="w-full flex items-center justify-between gap-4 px-5 py-4 text-left hover:bg-accent/50 transition-colors"
        onClick={onToggle}
        aria-expanded={open}
      >
        <span className="font-medium text-sm">{item.question}</span>
        <ChevronDown
          className={cn("h-4 w-4 text-muted-foreground shrink-0 transition-transform duration-200", open && "rotate-180")}
        />
      </button>
      <div
        className={cn(
          "overflow-hidden transition-all duration-200",
          open ? "max-h-[500px] opacity-100" : "max-h-0 opacity-0"
        )}
      >
        <div className="px-5 pb-4 text-sm text-muted-foreground leading-relaxed border-t bg-muted/20 pt-4">
          {item.answer}
        </div>
      </div>
    </div>
  );
}

export default function HelpFaq() {
  const [openId, setOpenId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [activeCategory, setActiveCategory] = useState("All");

  const { data: faqItems = [], isLoading } = useQuery<FaqItem[]>({
    queryKey: ["help-faq"],
    queryFn: () => apiFetch("/api/help/faq").then((r) => r.json()),
  });

  const categories = ["All", ...Array.from(new Set(faqItems.map((f) => f.category)))];

  const filtered = faqItems.filter((f) => {
    const matchesSearch =
      !search ||
      f.question.toLowerCase().includes(search.toLowerCase()) ||
      f.answer.toLowerCase().includes(search.toLowerCase());
    const matchesCategory = activeCategory === "All" || f.category === activeCategory;
    return matchesSearch && matchesCategory;
  });

  const grouped: Record<string, FaqItem[]> = {};
  for (const item of filtered) {
    if (!grouped[item.category]) grouped[item.category] = [];
    grouped[item.category].push(item);
  }

  const showGrouped = activeCategory === "All";

  return (
    <div className="max-w-3xl mx-auto p-6 space-y-6">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-2 text-sm text-muted-foreground">
        <Link href="/help" className="hover:text-foreground transition-colors">Help Center</Link>
        <span>/</span>
        <span className="text-foreground">FAQ</span>
      </nav>

      {/* Header */}
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <HelpCircle className="h-6 w-6 text-primary" />
          <h1 className="text-2xl font-bold">Frequently Asked Questions</h1>
        </div>
        <p className="text-muted-foreground text-sm">Common questions about Control HUB and CMMC compliance.</p>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search FAQ…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-10"
        />
      </div>

      {/* Category Filter */}
      <div className="flex items-center gap-2 flex-wrap">
        {categories.map((cat) => (
          <Badge
            key={cat}
            variant={activeCategory === cat ? "default" : "outline"}
            className="cursor-pointer select-none"
            onClick={() => setActiveCategory(cat)}
          >
            {cat}
          </Badge>
        ))}
      </div>

      {/* FAQ Items */}
      {isLoading ? (
        <div className="space-y-2">
          {[1, 2, 3, 4, 5].map((i) => (
            <Skeleton key={i} className="h-14 rounded-lg" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <HelpCircle className="h-8 w-8 mx-auto mb-3 opacity-40" />
            <p>No FAQ content available for your current role.</p>
            {search && (
              <Button variant="ghost" size="sm" className="mt-3" onClick={() => setSearch("")}>
                Clear Search
              </Button>
            )}
          </CardContent>
        </Card>
      ) : showGrouped ? (
        <div className="space-y-6">
          {Object.entries(grouped).map(([cat, items]) => (
            <div key={cat} className="space-y-2">
              <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{cat}</h2>
              <div className="space-y-2">
                {items.map((item) => (
                  <FaqAccordionItem
                    key={item.id}
                    item={item}
                    open={openId === item.id}
                    onToggle={() => setOpenId(openId === item.id ? null : item.id)}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((item) => (
            <FaqAccordionItem
              key={item.id}
              item={item}
              open={openId === item.id}
              onToggle={() => setOpenId(openId === item.id ? null : item.id)}
            />
          ))}
        </div>
      )}

      {/* Support Panel */}
      <Card className="border-dashed bg-primary/5">
        <CardContent className="py-5 px-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="rounded-full bg-primary/10 p-2">
              <LifeBuoy className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="text-sm font-medium">Still Need Help?</p>
              <p className="text-xs text-muted-foreground">Submit a support request with your context already included.</p>
            </div>
          </div>
          <div className="flex flex-col sm:flex-row gap-2 shrink-0">
            <Button asChild size="sm">
              <Link href="/help/support-ticket">Submit a Support Ticket</Link>
            </Button>
            <Button variant="outline" size="sm" asChild>
              <Link href="/help">Back to Help Center</Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
