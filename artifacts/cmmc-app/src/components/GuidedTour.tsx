import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { X, ChevronLeft, ChevronRight, CheckCircle } from "lucide-react";

interface TourStep {
  id: string;
  title: string;
  description: string;
  path: string;
  targetSelector?: string;
  badge?: string;
}

const TOUR_STEPS: TourStep[] = [
  {
    id: "welcome",
    title: "Welcome to Control HUB",
    description: "Control HUB is a CMMC 2.0 readiness and evidence management platform for defense contractors. This tour walks you through the key capabilities using live sample data from CarmeTechnology.",
    path: "/",
    badge: "1 of 9",
  },
  {
    id: "dashboard",
    title: "Executive Dashboard",
    description: "The dashboard gives leadership an instant view of compliance posture — KPI cards for readiness score, evidence health, monitoring status, and POA&M health. Domain readiness bars and recommended next actions are also shown.",
    path: "/",
    targetSelector: '[data-tour="dashboard"]',
    badge: "2 of 9",
  },
  {
    id: "controls",
    title: "CMMC Controls",
    description: "All 110 CMMC Level 2 controls are tracked here with live status. Click any control to drill into its implementation narrative, configure steps, linked evidence, monitoring items, SSP content, and POA&Ms.",
    path: "/controls",
    badge: "3 of 9",
  },
  {
    id: "preassessment",
    title: "Pre-Assessment — Tenant Scan",
    description: "Connect your Microsoft 365 tenant and run automated compliance scans across Entra ID, Intune, and Microsoft Defender. The scan identifies gaps, generates findings with severity ratings, and creates evidence records automatically.",
    path: "/pre-assessment/history",
    badge: "4 of 9",
  },
  {
    id: "evidence",
    title: "Evidence Repository",
    description: "All compliance evidence is managed here — policies, procedures, screenshots, scan reports, training records, and more. Evidence goes through a review and approval workflow before it is marked assessor-ready.",
    path: "/evidence",
    badge: "5 of 9",
  },
  {
    id: "monitoring",
    title: "Operational Monitoring Tracker",
    description: "19 CMMC L2 operational monitoring tasks are tracked with frequency schedules (daily through annually). Overdue items are highlighted. Each row is inline-editable with status, notes, and last-completed date.",
    path: "/monitoring",
    badge: "6 of 9",
  },
  {
    id: "poams",
    title: "POA&M — Remediation Tracking",
    description: "Plans of Action & Milestones track every identified gap with risk level, remediation plan, resource needs, and scheduled completion date. POA&Ms link to controls and evidence.",
    path: "/poams",
    badge: "7 of 9",
  },
  {
    id: "reports",
    title: "Exportable Reports",
    description: "Generate executive and technical PDF reports on demand — including gap analysis, control status, evidence inventory, POA&M summaries, and domain readiness. Reports are C3PAO-ready.",
    path: "/reports/executive",
    badge: "8 of 9",
  },
  {
    id: "ssp",
    title: "System Security Plan",
    description: "The SSP module assembles your full CMMC L2 system security plan — narrative sections, control mappings, document references, and export to Word/PDF. Always up-to-date based on your control assessments.",
    path: "/ssp/overview",
    badge: "9 of 9",
  },
];

interface GuidedTourProps {
  onClose: () => void;
}

export function GuidedTour({ onClose }: GuidedTourProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const [, navigate] = useLocation();
  const step = TOUR_STEPS[currentStep];

  useEffect(() => {
    navigate(step.path);
  }, [currentStep]);

  const goNext = () => {
    if (currentStep < TOUR_STEPS.length - 1) {
      setCurrentStep((s) => s + 1);
    } else {
      onClose();
    }
  };

  const goPrev = () => {
    if (currentStep > 0) {
      setCurrentStep((s) => s - 1);
    }
  };

  const isLast = currentStep === TOUR_STEPS.length - 1;
  const progress = ((currentStep + 1) / TOUR_STEPS.length) * 100;

  return (
    <>
      {/* Backdrop overlay */}
      <div className="fixed inset-0 bg-black/20 z-40 pointer-events-none" />

      {/* Tour card — bottom right */}
      <div className="fixed bottom-6 right-6 z-50 w-[340px] shadow-2xl">
        <Card className="border-primary/30 bg-background">
          <CardHeader className="pb-2 pt-4 px-4">
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2">
                <Badge variant="secondary" className="text-xs font-mono">
                  {step.badge}
                </Badge>
                <CardTitle className="text-sm font-semibold leading-tight">
                  {step.title}
                </CardTitle>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 shrink-0 -mt-0.5 -mr-1 text-muted-foreground"
                onClick={onClose}
              >
                <X className="h-3.5 w-3.5" />
              </Button>
            </div>
          </CardHeader>

          <CardContent className="px-4 pb-4 space-y-4">
            <p className="text-sm text-muted-foreground leading-relaxed">
              {step.description}
            </p>

            {/* Progress bar */}
            <div className="space-y-1">
              <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                <div
                  className="h-full bg-primary rounded-full transition-all duration-300"
                  style={{ width: `${progress}%` }}
                />
              </div>
              <div className="flex justify-between text-[10px] text-muted-foreground">
                <span>Step {currentStep + 1} of {TOUR_STEPS.length}</span>
                <span>
                  {TOUR_STEPS.slice(0, currentStep + 1).map((s) => s.id).join(", ").length > 0
                    ? ""
                    : ""}
                </span>
              </div>
            </div>

            {/* Navigation buttons */}
            <div className="flex items-center justify-between">
              <Button
                variant="outline"
                size="sm"
                onClick={goPrev}
                disabled={currentStep === 0}
                className="h-8 text-xs"
              >
                <ChevronLeft className="h-3.5 w-3.5 mr-1" />
                Back
              </Button>

              <div className="flex gap-1">
                {TOUR_STEPS.map((_, i) => (
                  <button
                    key={i}
                    onClick={() => setCurrentStep(i)}
                    className={`h-1.5 rounded-full transition-all ${
                      i === currentStep
                        ? "w-4 bg-primary"
                        : i < currentStep
                        ? "w-1.5 bg-primary/50"
                        : "w-1.5 bg-muted"
                    }`}
                  />
                ))}
              </div>

              <Button
                size="sm"
                onClick={goNext}
                className="h-8 text-xs"
              >
                {isLast ? (
                  <>
                    <CheckCircle className="h-3.5 w-3.5 mr-1" />
                    Done
                  </>
                ) : (
                  <>
                    Next
                    <ChevronRight className="h-3.5 w-3.5 ml-1" />
                  </>
                )}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
