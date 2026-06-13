import { Link } from "wouter";
import { ArrowLeft, PlayCircle, Clock, HelpCircle, Mail } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

const VIDEOS = [
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

export default function HelpVideos() {
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

      {/* Videos Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {VIDEOS.map((video) => (
          <Card key={video.id} className={video.available ? "hover:bg-accent/30 transition-colors" : "opacity-60"}>
            <CardHeader className="pb-2">
              <div className="flex items-start justify-between gap-2">
                <div className="rounded-lg bg-primary/10 p-2 shrink-0">
                  <PlayCircle className={`h-5 w-5 ${video.available ? "text-primary" : "text-muted-foreground"}`} />
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge variant="outline" className="text-xs">{video.category}</Badge>
                  {!video.available && <Badge variant="secondary" className="text-xs">Coming Soon</Badge>}
                </div>
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
                {video.available && video.url ? (
                  <Button size="sm" variant="outline" asChild>
                    <a href={video.url} target="_blank" rel="noopener noreferrer">
                      <PlayCircle className="h-3.5 w-3.5 mr-1.5" />
                      Watch
                    </a>
                  </Button>
                ) : (
                  <Button size="sm" variant="ghost" disabled>Coming Soon</Button>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Request a Video */}
      <Card className="bg-muted/30 border-dashed">
        <CardContent className="py-5 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <HelpCircle className="h-5 w-5 text-muted-foreground" />
            <div>
              <p className="text-sm font-medium">Need a tutorial video on a specific topic?</p>
              <p className="text-xs text-muted-foreground">Let us know and we'll prioritize it.</p>
            </div>
          </div>
          <Button variant="outline" size="sm" asChild>
            <a href="mailto:info@carmetechnology.com?subject=Control%20HUB%20Video%20Request">
              <Mail className="h-3.5 w-3.5 mr-1.5" />
              Request a Video
            </a>
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
