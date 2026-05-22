export type AssessmentPack = {
  id: string;
  name: string;
  shortName: string;
  description: string;
  domainPrefixes: string[];
  evidenceType: string;
  evidenceInstructions: string;
};

export const ASSESSMENT_PACKS: AssessmentPack[] = [
  {
    id: "identity_access",
    name: "Identity and Access Control",
    shortName: "Identity & Access",
    description:
      "User accounts, groups, privileged access, access reviews, stale accounts, service accounts, and access approvals.",
    domainPrefixes: ["AC"],
    evidenceType: "Access Control Documentation",
    evidenceInstructions:
      "Provide user inventory, access review records, privileged user documentation, and access control policy screenshots.",
  },
  {
    id: "mfa_auth",
    name: "MFA and Authentication",
    shortName: "MFA & Auth",
    description:
      "Multi-factor authentication, password policy, account lockout, legacy authentication, and session controls.",
    domainPrefixes: ["IA"],
    evidenceType: "Authentication Configuration",
    evidenceInstructions:
      "Provide MFA configuration screenshots, password policy documentation, conditional access policy, and account lockout settings.",
  },
  {
    id: "logging_audit",
    name: "Logging and Audit",
    shortName: "Logging & Audit",
    description:
      "Audit logging, log retention, log review procedures, alerting, audit protection, and traceability.",
    domainPrefixes: ["AU"],
    evidenceType: "Audit Log Configuration",
    evidenceInstructions:
      "Provide audit logging configuration screenshots, log retention policy, and sample audit review records or reports.",
  },
  {
    id: "endpoint_config",
    name: "Endpoint and Configuration",
    shortName: "Endpoint & Config",
    description:
      "Device inventory, endpoint management, compliance policies, baseline configurations, patching, antivirus, and encryption.",
    domainPrefixes: ["CM", "SA"],
    evidenceType: "Endpoint Configuration",
    evidenceInstructions:
      "Provide device inventory, baseline configuration documentation, patch compliance reports, and antivirus/EDR deployment evidence.",
  },
  {
    id: "vuln_integrity",
    name: "Vulnerability and System Integrity",
    shortName: "Vuln & Integrity",
    description:
      "Vulnerability scanning, patch remediation, malware protection, security alerts, and monitoring for attacks.",
    domainPrefixes: ["SI", "RA"],
    evidenceType: "Vulnerability Scan Reports",
    evidenceInstructions:
      "Provide vulnerability scan reports, remediation tracking records, and malware protection configuration evidence.",
  },
  {
    id: "network",
    name: "Network and External Connections",
    shortName: "Network",
    description:
      "Firewall rules, external connections, secure communications, network diagrams, segmentation, and default deny posture.",
    domainPrefixes: ["SC"],
    evidenceType: "Network Configuration",
    evidenceInstructions:
      "Provide network diagram, firewall ruleset documentation, and secure communication (TLS/VPN) configuration evidence.",
  },
  {
    id: "incident_response",
    name: "Incident Response",
    shortName: "Incident Response",
    description:
      "Incident response policy, incident handling procedures, reporting, tabletop testing, and after-action records.",
    domainPrefixes: ["IR"],
    evidenceType: "Incident Response Documentation",
    evidenceInstructions:
      "Provide incident response policy, procedure, last tabletop exercise record, and incident contact list.",
  },
  {
    id: "risk_poam",
    name: "Risk and POA&M",
    shortName: "Risk & POA&M",
    description:
      "Risk assessment, risk register, Plan of Action and Milestones (POA&M), remediation tracking, and risk acceptance.",
    domainPrefixes: ["CA"],
    evidenceType: "Risk Documentation",
    evidenceInstructions:
      "Provide risk assessment, current POA&M, and remediation tracking documentation.",
  },
  {
    id: "backup_media",
    name: "Backup, Media, and Data Protection",
    shortName: "Backup & Media",
    description:
      "Backups, restore testing, media protection, removable media controls, sanitization, and encryption at rest.",
    domainPrefixes: ["MP", "MA"],
    evidenceType: "Backup and Media Records",
    evidenceInstructions:
      "Provide backup configuration screenshots, restore test records, and removable media policy.",
  },
  {
    id: "personnel_physical",
    name: "Personnel, Physical, and Training",
    shortName: "Personnel & Training",
    description:
      "Awareness training, role-based training, physical access controls, visitor logs, personnel screening, and offboarding.",
    domainPrefixes: ["AT", "PE", "PS"],
    evidenceType: "Training and Physical Security Records",
    evidenceInstructions:
      "Provide training completion records, physical access log, and personnel screening/background check documentation.",
  },
];

const DOMAIN_TO_PACK: Record<string, string> = {
  AC: "identity_access",
  AT: "personnel_physical",
  AU: "logging_audit",
  CA: "risk_poam",
  CM: "endpoint_config",
  IA: "mfa_auth",
  IR: "incident_response",
  MA: "backup_media",
  MP: "backup_media",
  PE: "personnel_physical",
  PS: "personnel_physical",
  RA: "vuln_integrity",
  SA: "endpoint_config",
  SC: "network",
  SI: "vuln_integrity",
};

export function getPackForControl(controlId: string): string {
  const prefix = controlId.split(".")[0];
  return DOMAIN_TO_PACK[prefix] ?? "identity_access";
}

export function getPackById(packId: string): AssessmentPack | undefined {
  return ASSESSMENT_PACKS.find((p) => p.id === packId);
}

export type IntakeQuestion = {
  key: string;
  text: string;
  packIds: string[];
};

export const INTAKE_QUESTIONS: IntakeQuestion[] = [
  {
    key: "ssp_uploaded",
    text: "Is a System Security Plan (SSP) uploaded?",
    packIds: ["risk_poam"],
  },
  {
    key: "scope_defined",
    text: "Is the assessment scope and system boundary defined?",
    packIds: ["risk_poam"],
  },
  {
    key: "assets_documented",
    text: "Are in-scope assets (hardware, software, services) documented?",
    packIds: ["endpoint_config", "risk_poam"],
  },
  {
    key: "cui_defined",
    text: "Is CUI being stored, processed, or transmitted identified?",
    packIds: ["backup_media", "network", "identity_access"],
  },
  {
    key: "users_documented",
    text: "Are users and privileged users documented?",
    packIds: ["identity_access", "mfa_auth"],
  },
  {
    key: "policies_uploaded",
    text: "Are security policies uploaded and current?",
    packIds: [
      "identity_access",
      "mfa_auth",
      "logging_audit",
      "endpoint_config",
      "vuln_integrity",
      "network",
      "incident_response",
      "risk_poam",
      "backup_media",
      "personnel_physical",
    ],
  },
  {
    key: "procedures_uploaded",
    text: "Are security procedures uploaded and current?",
    packIds: [
      "identity_access",
      "mfa_auth",
      "logging_audit",
      "endpoint_config",
      "vuln_integrity",
      "network",
      "incident_response",
      "risk_poam",
      "backup_media",
      "personnel_physical",
    ],
  },
  {
    key: "evidence_uploaded",
    text: "Has compliance evidence (screenshots, exports, reports) been uploaded?",
    packIds: [
      "identity_access",
      "mfa_auth",
      "logging_audit",
      "endpoint_config",
      "vuln_integrity",
      "network",
      "incident_response",
      "risk_poam",
      "backup_media",
      "personnel_physical",
    ],
  },
  {
    key: "poam_available",
    text: "Is a Plan of Action and Milestones (POA&M) available?",
    packIds: ["risk_poam"],
  },
  {
    key: "monitoring_active",
    text: "Is the operational monitoring tracker active and up to date?",
    packIds: ["logging_audit", "risk_poam", "vuln_integrity"],
  },
  {
    key: "endpoints_managed",
    text: "Are endpoints centrally managed (MDM / Intune / GPO)?",
    packIds: ["endpoint_config"],
  },
  {
    key: "mfa_enforced",
    text: "Is MFA enforced for all users including privileged accounts?",
    packIds: ["mfa_auth", "identity_access"],
  },
  {
    key: "audit_logs_reviewed",
    text: "Are audit logs regularly reviewed?",
    packIds: ["logging_audit"],
  },
  {
    key: "vulnerabilities_reviewed",
    text: "Are vulnerability scans performed and results reviewed?",
    packIds: ["vuln_integrity"],
  },
  {
    key: "backups_tested",
    text: "Are backups performed and restore procedures tested?",
    packIds: ["backup_media"],
  },
  {
    key: "ir_tested",
    text: "Has incident response been tested (tabletop or exercise)?",
    packIds: ["incident_response"],
  },
];

export function getIntakeAnswerForPack(
  packId: string,
  intakeAnswers: Record<string, string>
): string {
  const relevant = INTAKE_QUESTIONS.filter((q) => q.packIds.includes(packId));
  if (relevant.length === 0) return "unknown";
  const answers = relevant
    .map((q) => intakeAnswers[q.key] ?? "unknown")
    .filter((a) => a !== "unknown" && a !== "not_applicable");
  if (answers.length === 0) return "unknown";
  if (answers.includes("yes")) return "yes";
  if (answers.includes("partial")) return "partial";
  if (answers.includes("no")) return "no";
  return "unknown";
}
