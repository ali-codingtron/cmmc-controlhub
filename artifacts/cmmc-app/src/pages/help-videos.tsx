import { useState } from "react";
import { Link } from "wouter";
import { ArrowLeft, PlayCircle, Clock, HelpCircle, ChevronDown } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface VideoItem {
  id: string;
  title: string;
  description: string;
  duration: string;
  category: string;
  available: boolean;
  url?: string;
}

const VIDEOS: VideoItem[] = [
  {
    id: "demo",
    title: "Control HUB Demo Walkthrough",
    description: "A complete overview of Control HUB — covering the dashboard, controls, evidence management, monitoring tracker, POA&Ms, and reports.",
    duration: "15 min",
    category: "Overview",
    available: true,
    url: "https://www.carmetechnology.com",
  },
  {
    id: "getting-started",
    title: "Getting Started: First Steps",
    description: "How to select your organization, understand your role, upload your first evidence, and use the dashboard.",
    duration: "~8 min",
    category: "Getting Started",
    available: false,
  },
  {
    id: "evidence",
    title: "Uploading and Managing Evidence",
    description: "Uploading evidence, linking it to controls, the review workflow, and bulk upload.",
    duration: "~10 min",
    category: "Evidence",
    available: false,
  },
  {
    id: "pre-assessment",
    title: "Running a Tenant-Connected Pre-Assessment",
    description: "Connecting your Microsoft 365 tenant, running an automated scan, and interpreting findings.",
    duration: "~12 min",
    category: "Pre-Assessment",
    available: false,
  },
  {
    id: "monitoring",
    title: "Using the Monitoring Tracker",
    description: "Recording monitoring completions, understanding frequency logic, and keeping monitoring items Current.",
    duration: "~6 min",
    category: "Monitoring",
    available: false,
  },
  {
    id: "reports",
    title: "Generating Compliance Reports",
    description: "Creating executive reports, gap analysis, and assessor packages.",
    duration: "~8 min",
    category: "Reports",
    available: false,
  },
];

const publishedVideos = VIDEOS.filter((v) => v.available);
const comingSoonVideos = VIDEOS.filter((v) => !v.available);

export default function HelpVideos() {
  const [showPlanned, setShowPlanned] = useState(false);

  const isSinglePublished = publishedVideos.length === 1;

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-6">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-2 text-sm text-muted-foreground">
        <Link href="/help" className="hover:text-foreground transition-colors">Help Center</Link>
        <span>/</span>
        <span className="text-foreground">Videos</span>
      </nav>

      {/* Header */}
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <PlayCircle className="h-6 w-6 text-primary" />
          <h1 className="text-2xl font-bold">Video Tutorials</h1>
        </div>
        <p className="text-muted-foreground text-sm">Watch step-by-step video guides for Control HUB.</p>
      </div>

      {/* Featured Tutorial (single published video) */}
      {isSinglePublished && publishedVideos[0] && (
        <>
          <div className="rounded-xl border bg-gradient-to-br from-primary/5 to-primary/10 p-6 space-y-4">
            <div className="flex items-center gap-2 mb-1">
              <Badge variant="default" className="text-xs">Featured Tutorial</Badge>
              <Badge variant="outline" className="text-xs">{publishedVideos[0].category}</Badge>
            </div>
            <div className="flex items-start gap-4">
              <div className="rounded-xl bg-primary/15 p-4 shrink-0">
                <PlayCircle className="h-10 w-10 text-primary" />
              </div>
              <div className="flex-1 min-w-0 space-y-2">
                <h2 className="text-xl font-semibold">{publishedVideos[0].title}</h2>
                <p className="text-muted-foreground text-sm leading-relaxed">{publishedVideos[0].description}</p>
                <div className="flex items-center gap-4">
                  <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Clock className="h-3.5 w-3.5" />
                    {publishedVideos[0].duration}
                  </span>
                  {publishedVideos[0].url && (
                    <Button asChild>
                      <a href={publishedVideos[0].url} target="_blank" rel="noopener noreferrer">
                        <PlayCircle className="h-4 w-4 mr-2" />
                        Watch Now
                      </a>
                    </Button>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Relevant written guides beneath the featured video */}
          <div className="space-y-2">
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Relevant Written Guides</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {[
                { title: "Getting Started with Control HUB", href: "/help/article/getting-started" },
                { title: "Understanding Your Role", href: "/help/article/user-roles-guide" },
                { title: "Uploading Evidence", href: "/help/article/uploading-evidence" },
                { title: "Using the Dashboard", href: "/help/article/dashboard-overview" },
              ].map(({ title, href }) => (
                <Link key={href} href={href}>
                  <Card className="cursor-pointer hover:bg-accent/50 hover:shadow-sm transition-all">
                    <CardContent className="py-3 px-4 flex items-center justify-between gap-2">
                      <span className="text-sm font-medium">{title}</span>
                      <PlayCircle className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                    </CardContent>
                  </Card>
                </Link>
              ))}
            </div>
          </div>
        </>
      )}

      {/* Multi-published grid (for when more videos become available) */}
      {!isSinglePublished && publishedVideos.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {publishedVideos.map((video) => (
            <Card key={video.id} className="hover:bg-accent/30 hover:shadow-sm transition-all">
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="rounded-lg bg-primary/10 p-2 shrink-0">
                    <PlayCircle className="h-5 w-5 text-primary" />
                  </div>
                  <Badge variant="outline" className="text-xs">{video.category}</Badge>
                </div>
                <CardTitle className="text-base mt-2">{video.title}</CardTitle>
                <CardDescription className="text-xs leading-relaxed">{video.description}</CardDescription>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Clock className="h-3.5 w-3.5" />
                    <span>{video.duration}</span>
                  </div>
                  {video.url && (
                    <Button size="sm" variant="outline" asChild>
                      <a href={video.url} target="_blank" rel="noopener noreferrer">
                        <PlayCircle className="h-3.5 w-3.5 mr-1.5" />
                        Watch
                      </a>
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Planned Tutorials — collapsible */}
      {comingSoonVideos.length > 0 && (
        <div className="border rounded-lg overflow-hidden">
          <button
            className="w-full flex items-center justify-between gap-4 px-5 py-4 text-left hover:bg-accent/30 transition-colors bg-muted/20"
            onClick={() => setShowPlanned(!showPlanned)}
          >
            <div>
              <span className="font-medium text-sm">Planned Tutorials</span>
              <span className="ml-2 text-xs text-muted-foreground">({comingSoonVideos.length} upcoming)</span>
            </div>
            <ChevronDown
              className={cn("h-4 w-4 text-muted-foreground shrink-0 transition-transform duration-200", showPlanned && "rotate-180")}
            />
          </button>
          <div
            className={cn(
              "overflow-hidden transition-all duration-200",
              showPlanned ? "max-h-[1000px] opacity-100" : "max-h-0 opacity-0"
            )}
          >
            <div className="p-4 space-y-3 border-t">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {comingSoonVideos.map((video) => (
                  <Card key={video.id} className="opacity-70">
                    <CardHeader className="pb-2">
                      <div className="flex items-start justify-between gap-2">
                        <div className="rounded-lg bg-muted p-2 shrink-0">
                          <PlayCircle className="h-4 w-4 text-muted-foreground" />
                        </div>
                        <div className="flex items-center gap-1.5">
                          <Badge variant="outline" className="text-xs">{video.category}</Badge>
                          <Badge variant="secondary" className="text-xs">Coming Soon</Badge>
                        </div>
                      </div>
                      <CardTitle className="text-sm mt-2">{video.title}</CardTitle>
                      <CardDescription className="text-xs leading-relaxed">{video.description}</CardDescription>
                    </CardHeader>
                    <CardContent className="pt-0">
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <Clock className="h-3.5 w-3.5" />
                        <span>{video.duration}</span>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Request a Tutorial */}
      <Card className="bg-muted/30 border-dashed">
        <CardContent className="py-5 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <HelpCircle className="h-5 w-5 text-muted-foreground" />
            <div>
              <p className="text-sm font-medium">Need a tutorial on a specific topic?</p>
              <p className="text-xs text-muted-foreground">Let us know and we'll prioritize it.</p>
            </div>
          </div>
          <Button variant="outline" size="sm" asChild>
            <Link href="/help/support-ticket?category=Tutorial+Request">
              Request a Tutorial
            </Link>
          </Button>
        </CardContent>
      </Card>

      <Button variant="ghost" size="sm" asChild>
        <Link href="/help">
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Help Center
        </Link>
      </Button>
    </div>
  );
}
