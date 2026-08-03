export const HELP_MODULE_LABELS: Record<string, string> = {
  "dashboard": "Dashboard",
  "controls": "Controls & Requirements",
  "evidence": "Evidence",
  "documents": "Documentation",
  "ssp": "SSP",
  "monitoring": "Monitoring Tracker",
  "poams": "POA&M",
  "roadmap": "Implementation Roadmap",
  "pre-assessment": "Pre-Assessment",
  "reports": "Reports & Exports",
  "users": "Users & Roles",
  "organizations": "Organizations & Modules",
  "settings": "Settings",
  "dfars": "DFARS",
  "crosswalk": "Framework Crosswalk",
  "tasks": "Tasks",
  "certification": "Certification & Sustainment",
  "mfa": "MFA & Sign-In",
  "sso": "Microsoft SSO",
  "PRE_ASSESSMENT": "Pre-Assessment",
  "IMPLEMENTATION_ROADMAP": "Implementation Roadmap",
};

export function getModuleLabel(key: string | null | undefined): string {
  if (!key) return "";
  return HELP_MODULE_LABELS[key] ?? key;
}
