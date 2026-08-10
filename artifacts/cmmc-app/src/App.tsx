import { Switch, Route, Router as WouterRouter, Redirect, useLocation } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/lib/auth";
import { OrgProvider, useOrg } from "@/context/OrgContext";
import { DemoModeProvider } from "@/context/DemoModeContext";
import { RoadmapFeatureProvider, useRoadmapFeature } from "@/context/RoadmapFeatureContext";
import { PreAssessmentFeatureProvider, usePreAssessmentFeature } from "@/context/PreAssessmentFeatureContext";
import { L1AssessmentFeatureProvider, useL1AssessmentFeature } from "@/context/L1AssessmentFeatureContext";
import { CrosswalkFeatureProvider, useCrosswalkFeature } from "@/context/CrosswalkFeatureContext";
import { DfarsFeatureProvider, useDfarsFeature } from "@/context/DfarsFeatureContext";
import { Map, Cable, ClipboardCheck, GitCompare, FileCheck2 } from "lucide-react";
import { Layout } from "@/components/layout/layout";
import NotFound from "@/pages/not-found";
import DemoLanding from "@/pages/demo-landing";
import DemoVideo from "@/pages/demo-video";
import DemoApp from "@/pages/demo-app";

import Login from "@/pages/login";
import Dashboard from "@/pages/dashboard";
import Controls from "@/pages/controls";
import ControlDomain from "@/pages/controls-domain";
import ControlDetail from "@/pages/control-detail";
import Evidence from "@/pages/evidence";
import EvidenceUpload from "@/pages/evidence-upload";
import EvidenceDetail from "@/pages/evidence-detail";
import Tasks from "@/pages/tasks";
import TaskDetail from "@/pages/task-detail";
import MonitoringTracker from "@/pages/monitoring-tracker";
import Poams from "@/pages/poams";
import PoamDetail from "@/pages/poam-detail";
import Assessor from "@/pages/assessor";
import AssessorControl from "@/pages/assessor-control";
import AuditLogs from "@/pages/audit-logs";
import Users from "@/pages/users";
import Settings from "@/pages/settings";
import SettingsPackages from "@/pages/settings-packages";
import Documents from "@/pages/documents";
import DocumentDetail from "@/pages/document-detail";
import Organizations from "@/pages/organizations";
import SecurityCenter from "@/pages/security-center";
import AdminRoadmapBackfill from "@/pages/admin-roadmap-backfill";
import SspOverview from "@/pages/ssp-overview";
import SspSections from "@/pages/ssp-sections";
import SspMappings from "@/pages/ssp-mappings";
import SspDocuments from "@/pages/ssp-documents";
import SspExport from "@/pages/ssp-export";
import SspPrefillWizard from "@/pages/ssp-prefill-wizard";
import ReportsExecutive from "@/pages/reports-executive";
import ReportsGap from "@/pages/reports-gap";
import ReportsControls from "@/pages/reports-controls";
import ReportsEvidence from "@/pages/reports-evidence";
import ReportsPoam from "@/pages/reports-poam";
import ReportsMonitoring from "@/pages/reports-monitoring";
import ReportsDomain from "@/pages/reports-domain";
import ReportsAudit from "@/pages/reports-audit";
import ReportsSsp from "@/pages/reports-ssp";
import RoadmapActions from "@/pages/roadmap-actions";
import RoadmapActionDetail from "@/pages/roadmap-action-detail";
import RoadmapCoverage from "@/pages/roadmap-coverage";
import RoadmapProgress from "@/pages/roadmap-progress";
import PaHistory from "@/pages/pa-history";
import PaRun from "@/pages/pa-run";
import PaConnections from "@/pages/pa-connections";
import DocTemplateLibrary from "@/pages/doc-template-library";
import DocTemplateDetail from "@/pages/doc-template-detail";
import DocGenerate from "@/pages/doc-generate";
import PaResults from "@/pages/pa-results";
import PaFindings from "@/pages/pa-findings";
import PaEvidenceRequests from "@/pages/pa-evidence-requests";
import PaRoadmap from "@/pages/pa-roadmap";
import L1Assessment from "@/pages/l1-assessment";
import L1AssessmentHistory from "@/pages/l1-assessment-history";
import L1AssessmentNew from "@/pages/l1-assessment-new";
import L1AssessmentWorkbench from "@/pages/l1-assessment-workbench";
import L1AssessmentRequirement from "@/pages/l1-assessment-requirement";
import L1AssessmentSprs from "@/pages/l1-assessment-sprs";
import InviteAccept from "@/pages/invite-accept";
import ForgotPassword from "@/pages/forgot-password";
import ResetPassword from "@/pages/reset-password";
import Help from "@/pages/help";
import HelpArticle from "@/pages/help-article";
import HelpFaq from "@/pages/help-faq";
import HelpVideos from "@/pages/help-videos";
import HelpAdmin from "@/pages/help-admin";
import HelpSupportTicket from "@/pages/help-support-ticket";
import HelpMyTickets from "@/pages/help-my-tickets";
import DfarsObligations from "@/pages/dfars-obligations";
import Crosswalk from "@/pages/crosswalk";
import AdminPackageMigration from "@/pages/admin-package-migration";
import Certification from "@/pages/certification";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 30000,
    },
  },
});

function Guard({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth();
  const { isLoading: orgLoading } = useOrg();
  const [location] = useLocation();

  if (isLoading || orgLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  if (!user) {
    return <Redirect to="/login" />;
  }

  return <>{children}</>;
}

function AdminOnly({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  if (user?.role !== "admin") return <Redirect to="/" />;
  return <>{children}</>;
}

function RoadmapOnly({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const { activeOrg } = useOrg();
  const isAdmin = user?.role === "admin";
  const effectiveOrgRole = isAdmin ? "admin" : (activeOrg?.role ?? user?.role ?? "");
  const canView = isAdmin || ["compliance_manager", "reviewer", "org_admin"].includes(effectiveOrgRole);
  if (!canView) return <Redirect to="/" />;
  return <>{children}</>;
}

function RoadmapDisabledPage() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 text-center p-6">
      <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center">
        <Map className="h-8 w-8 text-muted-foreground" />
      </div>
      <h2 className="text-xl font-semibold">Implementation Roadmap Not Enabled</h2>
      <p className="text-muted-foreground max-w-md">
        The Implementation Roadmap module is not enabled for this organization.
        A Global Administrator can enable it from the organization settings.
      </p>
    </div>
  );
}

function RoadmapRouteGuard({ children }: { children: React.ReactNode }) {
  const { isRoadmapEnabled } = useRoadmapFeature();
  if (!isRoadmapEnabled) return <RoadmapDisabledPage />;
  return <>{children}</>;
}

function PreAssessmentDisabledPage() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 text-center p-6">
      <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center">
        <Cable className="h-8 w-8 text-muted-foreground" />
      </div>
      <h2 className="text-xl font-semibold">Pre-Assessment Not Enabled</h2>
      <p className="text-muted-foreground max-w-md">
        The Pre-Assessment module is not enabled for this organization.
        A Global Administrator or Organization Administrator can enable it from the organization settings.
      </p>
    </div>
  );
}

function PreAssessmentRouteGuard({ children }: { children: React.ReactNode }) {
  const { isPreAssessmentEnabled } = usePreAssessmentFeature();
  if (!isPreAssessmentEnabled) return <PreAssessmentDisabledPage />;
  return <>{children}</>;
}

function L1AssessmentDisabledPage() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 text-center p-6">
      <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center">
        <ClipboardCheck className="h-8 w-8 text-muted-foreground" />
      </div>
      <h2 className="text-xl font-semibold">Annual Self-Assessment Not Enabled</h2>
      <p className="text-muted-foreground max-w-md">
        The CMMC Level 1 Annual Self-Assessment module is not active for this organization.
        Contact your administrator to enable the CMMC Level 1 package.
      </p>
    </div>
  );
}

function L1AssessmentRouteGuard({ children }: { children: React.ReactNode }) {
  const { isL1Active } = useL1AssessmentFeature();
  if (!isL1Active) return <L1AssessmentDisabledPage />;
  return <>{children}</>;
}

function CrosswalkDisabledPage() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 text-center p-6">
      <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center">
        <GitCompare className="h-8 w-8 text-muted-foreground" />
      </div>
      <h2 className="text-xl font-semibold">Framework Crosswalk Not Enabled</h2>
      <p className="text-muted-foreground max-w-md">
        The Framework Crosswalk module is not enabled for this organization.
        A Global Administrator can enable it from the organization settings.
      </p>
    </div>
  );
}

function CrosswalkRouteGuard({ children }: { children: React.ReactNode }) {
  const { isCrosswalkEnabled } = useCrosswalkFeature();
  if (!isCrosswalkEnabled) return <CrosswalkDisabledPage />;
  return <>{children}</>;
}

function DfarsDisabledPage() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 text-center p-6">
      <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center">
        <FileCheck2 className="h-8 w-8 text-muted-foreground" />
      </div>
      <h2 className="text-xl font-semibold">DFARS Obligations Not Enabled</h2>
      <p className="text-muted-foreground max-w-md">
        The DFARS Obligations module is not enabled for this organization.
        A Global Administrator can enable it from the organization settings.
      </p>
    </div>
  );
}

function DfarsRouteGuard({ children }: { children: React.ReactNode }) {
  const { isDfarsEnabled } = useDfarsFeature();
  if (!isDfarsEnabled) return <DfarsDisabledPage />;
  return <>{children}</>;
}

function AppRoutes() {
  return (
    <Switch>
      <Route path="/login" component={Login} />
      <Route path="/forgot-password" component={ForgotPassword} />
      <Route path="/reset-password" component={ResetPassword} />
      <Route path="/invite/accept" component={InviteAccept} />
      <Route path="/demo" component={DemoLanding} />
      <Route path="/demo-video" component={DemoVideo} />
      <Route path="/demo/app" component={DemoApp} />
      <Route>
        <Layout>
          <Guard>
            <Switch>
              <Route path="/" component={Dashboard} />
              <Route path="/controls" component={Controls} />
              <Route path="/controls/domain/:code">
                {(params: { code: string }) => <ControlDomain code={params.code} />}
              </Route>
              <Route path="/controls/:id">
                {(params: { id: string }) => <ControlDetail id={params.id} />}
              </Route>
              <Route path="/evidence" component={Evidence} />
              <Route path="/evidence/upload" component={EvidenceUpload} />
              <Route path="/evidence/:id">
                {(params: { id: string }) => <EvidenceDetail id={params.id} />}
              </Route>
              <Route path="/monitoring" component={MonitoringTracker} />
              <Route path="/tasks" component={Tasks} />
              <Route path="/tasks/:id">
                {(params: { id: string }) => <TaskDetail id={params.id} />}
              </Route>
              <Route path="/poams" component={Poams} />
              <Route path="/poams/:id">
                {(params: { id: string }) => <PoamDetail id={params.id} />}
              </Route>
              <Route path="/assessor" component={Assessor} />
              <Route path="/assessor/controls/:id">
                {(params: { id: string }) => <AssessorControl id={params.id} />}
              </Route>
              <Route path="/audit-logs" component={AuditLogs} />
              <Route path="/users" component={Users} />
              <Route path="/settings/packages" component={SettingsPackages} />
              <Route path="/settings" component={Settings} />
              <Route path="/organizations" component={Organizations} />
              <Route path="/security" component={SecurityCenter} />
              <Route path="/admin/roadmap-backfill" component={AdminRoadmapBackfill} />
              <Route path="/documents">
                {() => <Documents />}
              </Route>
              <Route path="/documents/templates">
                {() => <DocTemplateLibrary />}
              </Route>
              <Route path="/documents/templates/:id">
                {(params: { id: string }) => <DocTemplateDetail id={params.id} />}
              </Route>
              <Route path="/documents/generate">
                {() => <DocGenerate />}
              </Route>
              <Route path="/documents/list">
                {() => <Redirect to="/documents" />}
              </Route>
              <Route path="/documents/logs">
                {() => <Redirect to="/documents" />}
              </Route>
              <Route path="/documents/checklists">
                {() => <Redirect to="/documents" />}
              </Route>
              <Route path="/documents/missing">
                {() => <Redirect to="/documents" />}
              </Route>
              <Route path="/documents/logs/:id">
                {() => <Redirect to="/documents" />}
              </Route>
              <Route path="/documents/:id">
                {(params: { id: string }) => <DocumentDetail id={params.id} />}
              </Route>
              <Route path="/ssp">
                {() => <Redirect to="/ssp/overview" />}
              </Route>
              <Route path="/ssp/overview" component={SspOverview} />
              <Route path="/ssp/prefill-wizard" component={SspPrefillWizard} />
              <Route path="/ssp/sections" component={SspSections} />
              <Route path="/ssp/mappings" component={SspMappings} />
              <Route path="/ssp/documents" component={SspDocuments} />
              <Route path="/ssp/export" component={SspExport} />
              <Route path="/reports">
                {() => <Redirect to="/reports/executive" />}
              </Route>
              <Route path="/reports/executive" component={ReportsExecutive} />
              <Route path="/reports/gap" component={ReportsGap} />
              <Route path="/reports/controls" component={ReportsControls} />
              <Route path="/reports/evidence" component={ReportsEvidence} />
              <Route path="/reports/poam" component={ReportsPoam} />
              <Route path="/reports/monitoring" component={ReportsMonitoring} />
              <Route path="/reports/domain" component={ReportsDomain} />
              <Route path="/reports/audit" component={ReportsAudit} />
              <Route path="/reports/ssp" component={ReportsSsp} />
              <Route path="/roadmap">
                {() => <RoadmapOnly><RoadmapRouteGuard><RoadmapActions /></RoadmapRouteGuard></RoadmapOnly>}
              </Route>
              <Route path="/roadmap/coverage">
                {() => <RoadmapOnly><RoadmapRouteGuard><RoadmapCoverage /></RoadmapRouteGuard></RoadmapOnly>}
              </Route>
              <Route path="/roadmap/progress">
                {() => <RoadmapOnly><RoadmapRouteGuard><RoadmapProgress /></RoadmapRouteGuard></RoadmapOnly>}
              </Route>
              <Route path="/roadmap/:id">
                {(params: { id: string }) => <RoadmapOnly><RoadmapRouteGuard><RoadmapActionDetail id={params.id} /></RoadmapRouteGuard></RoadmapOnly>}
              </Route>
              <Route path="/pre-assessment">
                {() => <PreAssessmentRouteGuard><Redirect to="/pre-assessment/history" /></PreAssessmentRouteGuard>}
              </Route>
              <Route path="/pre-assessment/history">
                {() => <PreAssessmentRouteGuard><PaHistory /></PreAssessmentRouteGuard>}
              </Route>
              <Route path="/pre-assessment/run">
                {() => <PreAssessmentRouteGuard><PaRun /></PreAssessmentRouteGuard>}
              </Route>
              <Route path="/pre-assessment/connections">
                {() => <PreAssessmentRouteGuard><PaConnections /></PreAssessmentRouteGuard>}
              </Route>
              <Route path="/pre-assessment/findings">
                {() => <PreAssessmentRouteGuard><PaFindings /></PreAssessmentRouteGuard>}
              </Route>
              <Route path="/pre-assessment/evidence-requests">
                {() => <PreAssessmentRouteGuard><PaEvidenceRequests /></PreAssessmentRouteGuard>}
              </Route>
              <Route path="/pre-assessment/roadmap">
                {() => <PreAssessmentRouteGuard><PaRoadmap /></PreAssessmentRouteGuard>}
              </Route>
              <Route path="/pre-assessment/results/:id">
                {(params: { id: string }) => <PreAssessmentRouteGuard><PaResults id={params.id} /></PreAssessmentRouteGuard>}
              </Route>
              {/* L1 Annual Self-Assessment routes */}
              <Route path="/l1-assessment">
                {() => <L1AssessmentRouteGuard><L1Assessment /></L1AssessmentRouteGuard>}
              </Route>
              <Route path="/l1-assessment/new">
                {() => <L1AssessmentRouteGuard><L1AssessmentNew /></L1AssessmentRouteGuard>}
              </Route>
              <Route path="/l1-assessment/history">
                {() => <L1AssessmentRouteGuard><L1AssessmentHistory /></L1AssessmentRouteGuard>}
              </Route>
              <Route path="/l1-assessment/:id/sprs">
                {(params: { id: string }) => <L1AssessmentRouteGuard><L1AssessmentSprs id={params.id} /></L1AssessmentRouteGuard>}
              </Route>
              <Route path="/l1-assessment/:id/requirement/:reqId">
                {(params: { id: string; reqId: string }) => <L1AssessmentRouteGuard><L1AssessmentRequirement assessmentId={params.id} reqId={params.reqId} /></L1AssessmentRouteGuard>}
              </Route>
              <Route path="/l1-assessment/:id">
                {(params: { id: string }) => <L1AssessmentRouteGuard><L1AssessmentWorkbench id={params.id} /></L1AssessmentRouteGuard>}
              </Route>
              <Route path="/certification" component={Certification} />
              <Route path="/dfars-obligations">
                {() => <DfarsRouteGuard><DfarsObligations /></DfarsRouteGuard>}
              </Route>
              <Route path="/crosswalk">
                {() => <CrosswalkRouteGuard><Crosswalk /></CrosswalkRouteGuard>}
              </Route>
              <Route path="/admin/package-migration" component={AdminPackageMigration} />
              <Route path="/help/article/:slug" component={HelpArticle} />
              <Route path="/help/faq" component={HelpFaq} />
              <Route path="/help/videos" component={HelpVideos} />
              <Route path="/help/admin" component={HelpAdmin} />
              <Route path="/help/support-ticket" component={HelpSupportTicket} />
              <Route path="/help/my-tickets" component={HelpMyTickets} />
              <Route path="/help" component={Help} />
              <Route component={NotFound} />
            </Switch>
          </Guard>
        </Layout>
      </Route>
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <AuthProvider>
          <OrgProvider>
            <RoadmapFeatureProvider>
              <PreAssessmentFeatureProvider>
                <L1AssessmentFeatureProvider>
                  <CrosswalkFeatureProvider>
                    <DfarsFeatureProvider>
                      <DemoModeProvider>
                        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
                          <AppRoutes />
                        </WouterRouter>
                      </DemoModeProvider>
                    </DfarsFeatureProvider>
                  </CrosswalkFeatureProvider>
                </L1AssessmentFeatureProvider>
              </PreAssessmentFeatureProvider>
            </RoadmapFeatureProvider>
          </OrgProvider>
        </AuthProvider>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
