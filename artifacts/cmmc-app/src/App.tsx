import { Switch, Route, Router as WouterRouter, Redirect, useLocation } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/lib/auth";
import { OrgProvider, useOrg } from "@/context/OrgContext";
import { DemoModeProvider } from "@/context/DemoModeContext";
import { Layout } from "@/components/layout/layout";
import NotFound from "@/pages/not-found";
import DemoLanding from "@/pages/demo-landing";
import DemoVideo from "@/pages/demo-video";
import DemoApp from "@/pages/demo-app";

import Login from "@/pages/login";
import Dashboard from "@/pages/dashboard";
import Controls from "@/pages/controls";
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
import Documents from "@/pages/documents";
import DocumentsList from "@/pages/documents-list";
import DocumentLogs from "@/pages/documents-logs";
import DocumentChecklists from "@/pages/documents-checklists";
import DocumentsMissing from "@/pages/documents-missing";
import DocumentDetail from "@/pages/document-detail";
import DocumentLogDetail from "@/pages/document-log-detail";
import Organizations from "@/pages/organizations";
import SecurityCenter from "@/pages/security-center";
import AdminRoadmapBackfill from "@/pages/admin-roadmap-backfill";
import SspOverview from "@/pages/ssp-overview";
import SspSections from "@/pages/ssp-sections";
import SspMappings from "@/pages/ssp-mappings";
import SspDocuments from "@/pages/ssp-documents";
import SspExport from "@/pages/ssp-export";
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
import InviteAccept from "@/pages/invite-accept";
import ForgotPassword from "@/pages/forgot-password";
import ResetPassword from "@/pages/reset-password";
import Help from "@/pages/help";
import HelpArticle from "@/pages/help-article";
import HelpFaq from "@/pages/help-faq";
import HelpVideos from "@/pages/help-videos";
import HelpAdmin from "@/pages/help-admin";

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
              <Route path="/settings" component={Settings} />
              <Route path="/organizations" component={Organizations} />
              <Route path="/security" component={SecurityCenter} />
              <Route path="/admin/roadmap-backfill" component={AdminRoadmapBackfill} />
              <Route path="/documents" component={Documents} />
              <Route path="/documents/list" component={DocumentsList} />
              <Route path="/documents/templates" component={DocTemplateLibrary} />
              <Route path="/documents/templates/:id">
                {(params: { id: string }) => <DocTemplateDetail id={params.id} />}
              </Route>
              <Route path="/documents/generate" component={DocGenerate} />
              <Route path="/documents/logs" component={DocumentLogs} />
              <Route path="/documents/checklists" component={DocumentChecklists} />
              <Route path="/documents/missing" component={DocumentsMissing} />
              <Route path="/documents/logs/:id">
                {(params: { id: string }) => <DocumentLogDetail id={params.id} />}
              </Route>
              <Route path="/documents/:id">
                {(params: { id: string }) => <DocumentDetail id={params.id} />}
              </Route>
              <Route path="/ssp">
                {() => <Redirect to="/ssp/overview" />}
              </Route>
              <Route path="/ssp/overview" component={SspOverview} />
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
                {() => <RoadmapActions />}
              </Route>
              <Route path="/roadmap/coverage" component={RoadmapCoverage} />
              <Route path="/roadmap/progress" component={RoadmapProgress} />
              <Route path="/roadmap/:id">
                {(params: { id: string }) => <RoadmapActionDetail id={params.id} />}
              </Route>
              <Route path="/pre-assessment">
                {() => <Redirect to="/pre-assessment/history" />}
              </Route>
              <Route path="/pre-assessment/history" component={PaHistory} />
              <Route path="/pre-assessment/run" component={PaRun} />
              <Route path="/pre-assessment/connections" component={PaConnections} />
              <Route path="/pre-assessment/findings" component={PaFindings} />
              <Route path="/pre-assessment/evidence-requests" component={PaEvidenceRequests} />
              <Route path="/pre-assessment/roadmap" component={PaRoadmap} />
              <Route path="/pre-assessment/results/:id">
                {(params: { id: string }) => <PaResults id={params.id} />}
              </Route>
              <Route path="/help/article/:slug" component={HelpArticle} />
              <Route path="/help/faq" component={HelpFaq} />
              <Route path="/help/videos" component={HelpVideos} />
              <Route path="/help/admin" component={HelpAdmin} />
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
            <DemoModeProvider>
              <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
                <AppRoutes />
              </WouterRouter>
            </DemoModeProvider>
          </OrgProvider>
        </AuthProvider>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
