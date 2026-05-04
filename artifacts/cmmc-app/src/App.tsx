import { Switch, Route, Router as WouterRouter, Redirect, useLocation } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/lib/auth";
import { OrgProvider, useOrg } from "@/context/OrgContext";
import { Layout } from "@/components/layout/layout";
import NotFound from "@/pages/not-found";

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
import SspOverview from "@/pages/ssp-overview";
import SspSections from "@/pages/ssp-sections";
import SspMappings from "@/pages/ssp-mappings";
import SspDocuments from "@/pages/ssp-documents";
import SspExport from "@/pages/ssp-export";

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
              <Route path="/documents" component={Documents} />
              <Route path="/documents/list" component={DocumentsList} />
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
            <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
              <AppRoutes />
            </WouterRouter>
          </OrgProvider>
        </AuthProvider>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
