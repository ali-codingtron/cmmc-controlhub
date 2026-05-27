export type RuleResult = "pass" | "fail" | "partial" | "unknown" | "not_applicable";
export type RuleSeverity = "critical" | "high" | "medium" | "low" | "informational";

export interface RuleEvalInput {
  users?: MsUser[];
  guests?: MsUser[];
  signIns?: MsSignIn[];
  mfaRegistrations?: MsMfaRegistration[];
  caPolicies?: MsCaPolicy[];
  managedDevices?: MsDevice[];
  auditLogs?: MsAuditLog[];
  secureScores?: MsSecureScore[];
}

export interface MsUser {
  id: string;
  displayName: string;
  userPrincipalName: string;
  userType?: string;
  accountEnabled?: boolean;
  department?: string;
  jobTitle?: string;
  lastSignInDateTime?: string;
  createdDateTime?: string;
  assignedLicenses?: { skuId: string }[];
}

export interface MsSignIn {
  id: string;
  userPrincipalName?: string;
  createdDateTime?: string;
  status?: { errorCode: number; failureReason?: string };
  riskLevelAggregated?: string;
  clientAppUsed?: string;
  conditionalAccessStatus?: string;
}

export interface MsMfaRegistration {
  id: string;
  userPrincipalName?: string;
  isMfaRegistered?: boolean;
  isMfaCapable?: boolean;
  methodsRegistered?: string[];
  isAdmin?: boolean;
}

export interface MsCaPolicy {
  id: string;
  displayName: string;
  state: "enabled" | "disabled" | "enabledForReportingButNotEnforced";
  conditions?: {
    users?: { includeUsers?: string[]; excludeUsers?: string[]; includeGroups?: string[]; excludeGroups?: string[] };
    clientAppTypes?: string[];
    applications?: { includeApplications?: string[] };
  };
  grantControls?: { operator?: string; builtInControls?: string[] };
  sessionControls?: Record<string, unknown>;
}

export interface MsDevice {
  id: string;
  displayName: string;
  complianceState?: string;
  managedDeviceOwnerType?: string;
  operatingSystem?: string;
  osVersion?: string;
  lastSyncDateTime?: string;
  isEncrypted?: boolean;
  userPrincipalName?: string;
  enrolledDateTime?: string;
}

export interface MsAuditLog {
  id: string;
  activityDisplayName?: string;
  activityDateTime?: string;
  initiatedBy?: { user?: { userPrincipalName?: string }; app?: { displayName?: string } };
  targetResources?: { displayName?: string; type?: string }[];
  result?: string;
  category?: string;
}

export interface MsSecureScore {
  id: string;
  currentScore?: number;
  maxScore?: number;
  createdDateTime?: string;
  controlScores?: { controlName: string; score: number; maxScore: number; description?: string }[];
}

export interface RuleEvalResult {
  result: RuleResult;
  observedCondition: string;
  expectedCondition: string;
  affectedCount: number;
  affectedItems: unknown[];
  recommendedRemediation: string;
  suggestedRoadmapAction: string;
  evidenceTitle: string;
  evidenceSummary: string;
}

export interface AssessmentRule {
  id: string;
  name: string;
  description: string;
  packId: string;
  graphEndpoints: string[];
  linkedControlIds: string[];
  severity: RuleSeverity;
  supportType: "Strong Evidence" | "Partial Evidence" | "Configuration Indicator";
  evaluate(input: RuleEvalInput): RuleEvalResult;
}

const STALE_DAYS = 90;
const STALE_MS = STALE_DAYS * 24 * 60 * 60 * 1000;
const GENERIC_PATTERNS = /^(admin|test|shared|temp|generic|user[0-9]*|service|contractor|help|support|info|noreply|no-reply|helpdesk|it|root|guest)/i;

function daysSince(isoStr?: string | null): number | null {
  if (!isoStr) return null;
  const diff = Date.now() - new Date(isoStr).getTime();
  return Math.floor(diff / (1000 * 60 * 60 * 24));
}

export const ASSESSMENT_RULES: AssessmentRule[] = [
  {
    id: "PA-001",
    name: "Unique Named Accounts",
    description:
      "Checks for shared, generic, or service accounts without clear ownership. All users should have unique named accounts.",
    packId: "identity",
    graphEndpoints: ["/users"],
    linkedControlIds: ["AC.L1-3.1.1", "AC.L1-3.1.2", "IA.L1-3.5.1"],
    severity: "high",
    supportType: "Configuration Indicator",
    evaluate({ users = [] }) {
      const members = users.filter((u) => u.userType !== "Guest");
      const flagged = members.filter(
        (u) =>
          GENERIC_PATTERNS.test(u.displayName ?? "") ||
          GENERIC_PATTERNS.test(u.userPrincipalName ?? "")
      );

      if (members.length === 0) {
        return {
          result: "unknown",
          observedCondition: "No user data available or permission not granted.",
          expectedCondition: "All users have unique named accounts.",
          affectedCount: 0,
          affectedItems: [],
          recommendedRemediation: "Grant User.Read.All permission to scan user accounts.",
          suggestedRoadmapAction: "Grant Identity Pack permissions and re-run scan.",
          evidenceTitle: "Microsoft Tenant User Inventory Snapshot",
          evidenceSummary: "User inventory could not be retrieved.",
        };
      }

      if (flagged.length === 0) {
        return {
          result: "pass",
          observedCondition: `All ${members.length} member accounts use unique named accounts.`,
          expectedCondition: "All users have unique named accounts.",
          affectedCount: 0,
          affectedItems: [],
          recommendedRemediation: "No action needed.",
          suggestedRoadmapAction: "",
          evidenceTitle: "Microsoft Tenant User Inventory Snapshot",
          evidenceSummary: `${members.length} user accounts reviewed. No shared/generic accounts detected.`,
        };
      }

      return {
        result: "fail",
        observedCondition: `${flagged.length} of ${members.length} accounts match shared/generic naming patterns.`,
        expectedCondition: "All users have unique named accounts.",
        affectedCount: flagged.length,
        affectedItems: flagged.map((u) => ({
          name: u.displayName,
          upn: u.userPrincipalName,
        })),
        recommendedRemediation:
          "Review flagged accounts. Assign dedicated owners, rename service accounts, or disable/remove accounts that are no longer needed.",
        suggestedRoadmapAction: "Perform User and Access Review",
        evidenceTitle: "Microsoft Tenant User Inventory Snapshot",
        evidenceSummary: `${flagged.length} of ${members.length} accounts flagged for review.`,
      };
    },
  },

  {
    id: "PA-002",
    name: "Stale and Disabled User Review",
    description:
      "Identifies user accounts with no sign-in activity in 90+ days and disabled accounts that may still hold access rights.",
    packId: "identity",
    graphEndpoints: ["/users", "/auditLogs/signIns"],
    linkedControlIds: ["AC.L1-3.1.1", "IA.L2-3.5.6", "CA.L2-3.12.3"],
    severity: "high",
    supportType: "Configuration Indicator",
    evaluate({ users = [] }) {
      const members = users.filter((u) => u.userType !== "Guest");
      if (members.length === 0) {
        return {
          result: "unknown",
          observedCondition: "No user data available.",
          expectedCondition: "Stale and disabled accounts are reviewed regularly.",
          affectedCount: 0,
          affectedItems: [],
          recommendedRemediation: "Grant User.Read.All permission.",
          suggestedRoadmapAction: "Grant Identity Pack permissions and re-run scan.",
          evidenceTitle: "Stale Account Review Snapshot",
          evidenceSummary: "User data not available.",
        };
      }

      const disabled = members.filter((u) => u.accountEnabled === false);
      const stale = members.filter((u) => {
        const days = daysSince(u.lastSignInDateTime);
        return days !== null && days >= STALE_DAYS && u.accountEnabled !== false;
      });
      const noSignIn = members.filter(
        (u) => !u.lastSignInDateTime && u.accountEnabled !== false
      );

      const total = disabled.length + stale.length + noSignIn.length;
      if (total === 0) {
        return {
          result: "pass",
          observedCondition: `No stale or disabled accounts requiring review found among ${members.length} accounts.`,
          expectedCondition: "Stale and disabled accounts are reviewed regularly.",
          affectedCount: 0,
          affectedItems: [],
          recommendedRemediation: "No action needed.",
          suggestedRoadmapAction: "",
          evidenceTitle: "Stale Account Review Snapshot",
          evidenceSummary: `${members.length} accounts reviewed. No stale/disabled accounts found.`,
        };
      }

      return {
        result: "fail",
        observedCondition: `${stale.length} stale (${STALE_DAYS}+ days inactive), ${disabled.length} disabled, ${noSignIn.length} with no sign-in history.`,
        expectedCondition: "Stale and disabled accounts are reviewed and removed promptly.",
        affectedCount: total,
        affectedItems: [
          ...stale.map((u) => ({
            type: "stale",
            name: u.displayName,
            upn: u.userPrincipalName,
            lastSignIn: u.lastSignInDateTime,
          })),
          ...disabled.map((u) => ({
            type: "disabled",
            name: u.displayName,
            upn: u.userPrincipalName,
          })),
        ],
        recommendedRemediation:
          "Review stale accounts. Disable or remove accounts with no recent sign-in. Document the review as an access review record.",
        suggestedRoadmapAction: "Perform User and Access Review",
        evidenceTitle: "Stale Account Review Snapshot",
        evidenceSummary: `${total} accounts flagged: ${stale.length} stale, ${disabled.length} disabled, ${noSignIn.length} no sign-in history.`,
      };
    },
  },

  {
    id: "PA-003",
    name: "Guest User Review",
    description:
      "Identifies all guest users in the tenant. Guests should be reviewed regularly to confirm continued access need.",
    packId: "identity",
    graphEndpoints: ["/users?$filter=userType eq 'Guest'"],
    linkedControlIds: ["AC.L1-3.1.1", "AC.L2-3.1.5", "AC.L2-3.1.12"],
    severity: "medium",
    supportType: "Configuration Indicator",
    evaluate({ guests = [], users = [] }) {
      const guestList = guests.length > 0
        ? guests
        : users.filter((u) => u.userType === "Guest");

      if (users.length === 0 && guestList.length === 0) {
        return {
          result: "unknown",
          observedCondition: "No user data available.",
          expectedCondition: "Guest users are reviewed and approved regularly.",
          affectedCount: 0,
          affectedItems: [],
          recommendedRemediation: "Grant User.Read.All permission.",
          suggestedRoadmapAction: "Grant Identity Pack permissions and re-run scan.",
          evidenceTitle: "Guest User Inventory Snapshot",
          evidenceSummary: "User data not available.",
        };
      }

      if (guestList.length === 0) {
        return {
          result: "pass",
          observedCondition: "No guest users detected in the tenant.",
          expectedCondition: "Guest users are reviewed and approved.",
          affectedCount: 0,
          affectedItems: [],
          recommendedRemediation: "No action needed.",
          suggestedRoadmapAction: "",
          evidenceTitle: "Guest User Inventory Snapshot",
          evidenceSummary: "No guest users found in tenant.",
        };
      }

      return {
        result: "partial",
        observedCondition: `${guestList.length} guest users detected. Review documentation not available in tenant data.`,
        expectedCondition: "Guest users are formally reviewed and approved on a regular basis.",
        affectedCount: guestList.length,
        affectedItems: guestList.map((u) => ({
          name: u.displayName,
          upn: u.userPrincipalName,
          created: u.createdDateTime,
        })),
        recommendedRemediation:
          "Conduct and document a formal guest user access review. Remove guests with no continued business need. Upload the access review worksheet as evidence.",
        suggestedRoadmapAction: "Perform User and Access Review",
        evidenceTitle: "Guest User Inventory Snapshot",
        evidenceSummary: `${guestList.length} guest accounts inventoried. Manual review and documentation required.`,
      };
    },
  },

  {
    id: "PA-004",
    name: "MFA Registration Coverage",
    description:
      "Checks what percentage of users, including privileged users, are registered for MFA.",
    packId: "authentication",
    graphEndpoints: [
      "/reports/authenticationMethods/userRegistrationDetails",
    ],
    linkedControlIds: ["IA.L2-3.5.3", "IA.L1-3.5.2", "AC.L2-3.1.13"],
    severity: "critical",
    supportType: "Strong Evidence",
    evaluate({ mfaRegistrations = [] }) {
      if (mfaRegistrations.length === 0) {
        return {
          result: "unknown",
          observedCondition: "MFA registration data not available or permission not granted.",
          expectedCondition: "All users are registered for MFA.",
          affectedCount: 0,
          affectedItems: [],
          recommendedRemediation: "Grant Reports.Read.All or UserAuthenticationMethod.Read.All permission.",
          suggestedRoadmapAction: "Grant Authentication Pack permissions and re-run scan.",
          evidenceTitle: "MFA Registration Snapshot",
          evidenceSummary: "MFA registration data not available.",
        };
      }

      const total = mfaRegistrations.length;
      const registered = mfaRegistrations.filter((r) => r.isMfaRegistered);
      const notRegistered = mfaRegistrations.filter((r) => !r.isMfaRegistered);
      const pct = total > 0 ? Math.round((registered.length / total) * 100) : 0;

      if (pct === 100) {
        return {
          result: "pass",
          observedCondition: `100% of ${total} users are registered for MFA.`,
          expectedCondition: "All users registered for MFA.",
          affectedCount: 0,
          affectedItems: [],
          recommendedRemediation: "No action needed. Maintain MFA registration requirements.",
          suggestedRoadmapAction: "",
          evidenceTitle: "MFA Registration Snapshot",
          evidenceSummary: `All ${total} users registered for MFA.`,
        };
      }

      const result: RuleResult = pct >= 80 ? "partial" : "fail";
      return {
        result,
        observedCondition: `${registered.length} of ${total} users (${pct}%) registered for MFA. ${notRegistered.length} users missing MFA registration.`,
        expectedCondition: "100% of users registered for MFA.",
        affectedCount: notRegistered.length,
        affectedItems: notRegistered.slice(0, 50).map((r) => ({
          upn: r.userPrincipalName,
          methods: r.methodsRegistered ?? [],
        })),
        recommendedRemediation:
          "Enforce MFA registration via Conditional Access. Run a targeted campaign for unregistered users. Consider requiring MFA registration at next sign-in.",
        suggestedRoadmapAction: "Configure MFA and Conditional Access Baseline",
        evidenceTitle: "MFA Registration Snapshot",
        evidenceSummary: `${registered.length}/${total} users (${pct}%) registered for MFA.`,
      };
    },
  },

  {
    id: "PA-005",
    name: "MFA Conditional Access Policy",
    description:
      "Checks for an enabled Conditional Access policy that requires MFA for all users or all apps.",
    packId: "conditional_access",
    graphEndpoints: ["/identity/conditionalAccess/policies"],
    linkedControlIds: ["IA.L2-3.5.3", "AC.L2-3.1.12", "AC.L2-3.1.13"],
    severity: "critical",
    supportType: "Strong Evidence",
    evaluate({ caPolicies = [] }) {
      if (caPolicies.length === 0) {
        return {
          result: "unknown",
          observedCondition: "No Conditional Access policy data available.",
          expectedCondition: "An enabled CA policy requiring MFA exists.",
          affectedCount: 0,
          affectedItems: [],
          recommendedRemediation: "Grant Policy.Read.All permission.",
          suggestedRoadmapAction: "Grant Conditional Access Pack permissions and re-run scan.",
          evidenceTitle: "Conditional Access Policy Snapshot",
          evidenceSummary: "CA policy data not available.",
        };
      }

      const enabled = caPolicies.filter((p) => p.state === "enabled");
      const mfaPolicies = enabled.filter((p) => {
        const grants = p.grantControls?.builtInControls ?? [];
        return grants.includes("mfa");
      });

      const reportOnly = caPolicies.filter(
        (p) => p.state === "enabledForReportingButNotEnforced" &&
          (p.grantControls?.builtInControls ?? []).includes("mfa")
      );

      if (mfaPolicies.length === 0 && reportOnly.length > 0) {
        return {
          result: "partial",
          observedCondition: `${reportOnly.length} MFA CA policy found but in report-only mode. MFA is not being enforced.`,
          expectedCondition: "At least one enabled (enforced) CA policy requires MFA.",
          affectedCount: reportOnly.length,
          affectedItems: reportOnly.map((p) => ({
            name: p.displayName,
            state: p.state,
          })),
          recommendedRemediation:
            "Move MFA Conditional Access policies from report-only to enabled/enforced mode after testing.",
          suggestedRoadmapAction: "Configure MFA and Conditional Access Baseline",
          evidenceTitle: "Conditional Access Policy Snapshot",
          evidenceSummary: `MFA CA policy exists but is in report-only mode.`,
        };
      }

      if (mfaPolicies.length === 0) {
        return {
          result: "fail",
          observedCondition: `No enabled Conditional Access policy requiring MFA detected among ${caPolicies.length} policies.`,
          expectedCondition: "At least one enabled CA policy requires MFA.",
          affectedCount: 0,
          affectedItems: [],
          recommendedRemediation:
            "Create and enable a Conditional Access policy requiring MFA for all users. Review Microsoft's MFA Conditional Access template.",
          suggestedRoadmapAction: "Configure MFA and Conditional Access Baseline",
          evidenceTitle: "Conditional Access Policy Snapshot",
          evidenceSummary: `${caPolicies.length} CA policies reviewed. No MFA-enforcing policy found.`,
        };
      }

      const broadMfa = mfaPolicies.filter((p) => {
        const incUsers = p.conditions?.users?.includeUsers ?? [];
        const incApps = p.conditions?.applications?.includeApplications ?? [];
        return incUsers.includes("All") || incApps.includes("All");
      });

      if (broadMfa.length === 0) {
        return {
          result: "partial",
          observedCondition: `${mfaPolicies.length} MFA CA policies enabled but none appear to cover All Users or All Applications.`,
          expectedCondition: "MFA is enforced for all users across all cloud apps.",
          affectedCount: mfaPolicies.length,
          affectedItems: mfaPolicies.map((p) => ({
            name: p.displayName,
            includeUsers: p.conditions?.users?.includeUsers ?? [],
          })),
          recommendedRemediation:
            "Review CA policy scope. Ensure MFA is required for all users, not just a subset.",
          suggestedRoadmapAction: "Configure MFA and Conditional Access Baseline",
          evidenceTitle: "Conditional Access Policy Snapshot",
          evidenceSummary: `${mfaPolicies.length} MFA policies found but scope may be limited.`,
        };
      }

      return {
        result: "pass",
        observedCondition: `${broadMfa.length} enabled CA policies requiring MFA with broad coverage detected.`,
        expectedCondition: "MFA enforced via CA policy for all users.",
        affectedCount: 0,
        affectedItems: [],
        recommendedRemediation: "No action needed. Validate policy exclusions are minimal.",
        suggestedRoadmapAction: "",
        evidenceTitle: "Conditional Access Policy Snapshot",
        evidenceSummary: `${broadMfa.length} broad MFA CA policies active.`,
      };
    },
  },

  {
    id: "PA-006",
    name: "Legacy Authentication Blocked",
    description:
      "Checks for Conditional Access policies that block legacy authentication protocols (IMAP, POP3, SMTP Auth, Basic Auth).",
    packId: "conditional_access",
    graphEndpoints: ["/identity/conditionalAccess/policies"],
    linkedControlIds: ["IA.L2-3.5.4", "AC.L2-3.1.8", "SC.L2-3.13.8"],
    severity: "high",
    supportType: "Configuration Indicator",
    evaluate({ caPolicies = [] }) {
      if (caPolicies.length === 0) {
        return {
          result: "unknown",
          observedCondition: "No CA policy data available.",
          expectedCondition: "Legacy authentication is blocked via CA policy.",
          affectedCount: 0,
          affectedItems: [],
          recommendedRemediation: "Grant Policy.Read.All permission.",
          suggestedRoadmapAction: "Grant Conditional Access Pack permissions and re-run scan.",
          evidenceTitle: "Legacy Authentication Block Snapshot",
          evidenceSummary: "CA policy data not available.",
        };
      }

      const legacyBlockPolicies = caPolicies.filter((p) => {
        if (p.state !== "enabled") return false;
        const clientApps = p.conditions?.clientAppTypes ?? [];
        const grants = p.grantControls?.builtInControls ?? [];
        const hasLegacyCondition =
          clientApps.some((c) =>
            ["exchangeActiveSync", "other", "mapi", "imap", "pop3", "smtp"].includes(c.toLowerCase())
          ) || clientApps.includes("exchangeActiveSync");
        return hasLegacyCondition && grants.includes("block");
      });

      if (legacyBlockPolicies.length > 0) {
        return {
          result: "pass",
          observedCondition: `${legacyBlockPolicies.length} CA policy/policies blocking legacy authentication detected.`,
          expectedCondition: "Legacy authentication is blocked.",
          affectedCount: 0,
          affectedItems: [],
          recommendedRemediation: "No action needed. Confirm the policy covers all legacy client types.",
          suggestedRoadmapAction: "",
          evidenceTitle: "Legacy Authentication Block Snapshot",
          evidenceSummary: `Legacy authentication block policy found: ${legacyBlockPolicies.map((p) => p.displayName).join(", ")}`,
        };
      }

      return {
        result: "fail",
        observedCondition: `No Conditional Access policy blocking legacy authentication found among ${caPolicies.length} policies.`,
        expectedCondition: "Legacy authentication is blocked via an enabled CA policy.",
        affectedCount: 0,
        affectedItems: [],
        recommendedRemediation:
          "Create a CA policy that blocks legacy authentication clients (Exchange ActiveSync, Other clients, IMAP, POP3, SMTP Auth). Use Microsoft's Legacy Authentication block template.",
        suggestedRoadmapAction: "Configure MFA and Conditional Access Baseline",
        evidenceTitle: "Legacy Authentication Block Snapshot",
        evidenceSummary: `${caPolicies.length} CA policies reviewed. No legacy auth block policy found.`,
      };
    },
  },

  {
    id: "PA-007",
    name: "Managed Devices Inventory",
    description:
      "Inventories Intune-managed devices and flags stale check-ins, non-compliant status, and unknown ownership.",
    packId: "devices",
    graphEndpoints: ["/deviceManagement/managedDevices"],
    linkedControlIds: ["CM.L2-3.4.3", "IA.L1-3.5.1", "AC.L2-3.1.18"],
    severity: "high",
    supportType: "Configuration Indicator",
    evaluate({ managedDevices = [] }) {
      if (managedDevices.length === 0) {
        return {
          result: "unknown",
          observedCondition: "No Intune managed device data available.",
          expectedCondition: "A managed device inventory exists and is current.",
          affectedCount: 0,
          affectedItems: [],
          recommendedRemediation:
            "Grant DeviceManagementManagedDevices.Read.All permission. Confirm Intune is licensed and deployed.",
          suggestedRoadmapAction: "Configure Endpoint Compliance and Device Management",
          evidenceTitle: "Intune Device Inventory Snapshot",
          evidenceSummary: "Device inventory data not available.",
        };
      }

      const staleDevices = managedDevices.filter((d) => {
        const days = daysSince(d.lastSyncDateTime);
        return days !== null && days > 30;
      });
      const noOwner = managedDevices.filter(
        (d) => !d.userPrincipalName && !d.managedDeviceOwnerType
      );
      const unknownCompliance = managedDevices.filter(
        (d) => !d.complianceState || d.complianceState === "unknown"
      );

      const issues = staleDevices.length + noOwner.length;
      const result: RuleResult = issues === 0 ? "pass" : issues < 3 ? "partial" : "fail";

      return {
        result,
        observedCondition: `${managedDevices.length} managed devices found. ${staleDevices.length} stale (30+ days), ${noOwner.length} no owner, ${unknownCompliance.length} unknown compliance.`,
        expectedCondition: "All managed devices have current check-ins, known owners, and compliance state.",
        affectedCount: issues,
        affectedItems: staleDevices.slice(0, 30).map((d) => ({
          name: d.displayName,
          lastSync: d.lastSyncDateTime,
          owner: d.userPrincipalName,
          compliance: d.complianceState,
        })),
        recommendedRemediation:
          "Review stale devices. Remove or reassign retired devices. Ensure all devices have assigned owners. Confirm compliance policies are applied.",
        suggestedRoadmapAction: "Configure Endpoint Compliance and Device Management",
        evidenceTitle: "Intune Device Inventory Snapshot",
        evidenceSummary: `${managedDevices.length} devices inventoried. ${staleDevices.length} stale, ${noOwner.length} no owner.`,
      };
    },
  },

  {
    id: "PA-008",
    name: "Device Compliance Enforcement",
    description:
      "Checks device compliance state from Intune. Flags noncompliant and devices without a compliance policy applied.",
    packId: "devices",
    graphEndpoints: ["/deviceManagement/managedDevices"],
    linkedControlIds: [
      "CM.L2-3.4.1",
      "CM.L2-3.4.2",
      "CM.L2-3.4.6",
      "SI.L1-3.14.1",
    ],
    severity: "high",
    supportType: "Strong Evidence",
    evaluate({ managedDevices = [] }) {
      if (managedDevices.length === 0) {
        return {
          result: "unknown",
          observedCondition: "No device data available.",
          expectedCondition: "Device compliance is enforced in Intune.",
          affectedCount: 0,
          affectedItems: [],
          recommendedRemediation: "Grant DeviceManagementManagedDevices.Read.All permission.",
          suggestedRoadmapAction: "Configure Endpoint Compliance and Device Management",
          evidenceTitle: "Intune Device Compliance Snapshot",
          evidenceSummary: "Device compliance data not available.",
        };
      }

      const compliant = managedDevices.filter((d) => d.complianceState === "compliant");
      const noncompliant = managedDevices.filter(
        (d) => d.complianceState === "noncompliant"
      );
      const noPolicy = managedDevices.filter(
        (d) => d.complianceState === "unknown" || !d.complianceState
      );
      const total = managedDevices.length;
      const pct = total > 0 ? Math.round((compliant.length / total) * 100) : 0;

      if (noncompliant.length === 0 && noPolicy.length === 0) {
        return {
          result: "pass",
          observedCondition: `All ${total} devices are compliant.`,
          expectedCondition: "All managed devices are compliant.",
          affectedCount: 0,
          affectedItems: [],
          recommendedRemediation: "No action needed.",
          suggestedRoadmapAction: "",
          evidenceTitle: "Intune Device Compliance Snapshot",
          evidenceSummary: `${total} devices, 100% compliant.`,
        };
      }

      const result: RuleResult = pct >= 80 ? "partial" : "fail";
      return {
        result,
        observedCondition: `${compliant.length}/${total} (${pct}%) compliant. ${noncompliant.length} noncompliant, ${noPolicy.length} without compliance policy.`,
        expectedCondition: "All managed devices meet compliance requirements.",
        affectedCount: noncompliant.length + noPolicy.length,
        affectedItems: noncompliant.slice(0, 30).map((d) => ({
          name: d.displayName,
          owner: d.userPrincipalName,
          os: d.operatingSystem,
          compliance: d.complianceState,
        })),
        recommendedRemediation:
          "Remediate noncompliant devices. Apply compliance policies to devices without one. Consider blocking noncompliant devices via Conditional Access.",
        suggestedRoadmapAction: "Configure Endpoint Compliance and Device Management",
        evidenceTitle: "Intune Device Compliance Snapshot",
        evidenceSummary: `${compliant.length}/${total} devices compliant (${pct}%).`,
      };
    },
  },

  {
    id: "PA-009",
    name: "Sign-in Logs Available and Reviewed",
    description:
      "Confirms sign-in logs are accessible and summarizes failed sign-ins and unusual patterns.",
    packId: "audit",
    graphEndpoints: ["/auditLogs/signIns"],
    linkedControlIds: [
      "AU.L2-3.3.1",
      "AU.L2-3.3.5",
      "SI.L2-3.14.6",
      "CA.L2-3.12.3",
    ],
    severity: "high",
    supportType: "Partial Evidence",
    evaluate({ signIns = [] }) {
      if (signIns.length === 0) {
        return {
          result: "unknown",
          observedCondition: "Sign-in logs not retrievable. Permission may be missing or logs not available.",
          expectedCondition: "Sign-in logs are accessible and regularly reviewed.",
          affectedCount: 0,
          affectedItems: [],
          recommendedRemediation:
            "Grant AuditLog.Read.All permission. Ensure Azure AD P1/P2 license includes sign-in log retention.",
          suggestedRoadmapAction: "Configure Logging and Audit Review",
          evidenceTitle: "Sign-in Log Review Snapshot",
          evidenceSummary: "Sign-in log data not available.",
        };
      }

      const failed = signIns.filter(
        (s) => s.status?.errorCode && s.status.errorCode !== 0
      );
      const risky = signIns.filter(
        (s) => s.riskLevelAggregated && s.riskLevelAggregated !== "none"
      );
      const legacySignIns = signIns.filter((s) => {
        const app = (s.clientAppUsed ?? "").toLowerCase();
        return (
          app.includes("exchange activesync") ||
          app.includes("imap") ||
          app.includes("pop3") ||
          app.includes("smtp") ||
          app.includes("other clients")
        );
      });

      return {
        result: "partial",
        observedCondition: `${signIns.length} sign-in events retrieved. ${failed.length} failures, ${risky.length} risky, ${legacySignIns.length} legacy client sign-ins.`,
        expectedCondition: "Sign-in logs are reviewed regularly with documented review evidence.",
        affectedCount: failed.length + risky.length,
        affectedItems: [],
        recommendedRemediation:
          "Upload sign-in log review notes or a log review worksheet as evidence. Investigate high-failure or risky sign-in patterns.",
        suggestedRoadmapAction: "Configure Logging and Audit Review",
        evidenceTitle: "Sign-in Log Review Snapshot",
        evidenceSummary: `${signIns.length} events sampled. ${failed.length} failures, ${risky.length} risky, ${legacySignIns.length} legacy.`,
      };
    },
  },

  {
    id: "PA-010",
    name: "Directory Audit Logs Available",
    description:
      "Confirms directory audit logs are accessible and summarizes admin and configuration changes.",
    packId: "audit",
    graphEndpoints: ["/auditLogs/directoryAudits"],
    linkedControlIds: [
      "AU.L2-3.3.1",
      "AU.L2-3.3.2",
      "AU.L2-3.3.8",
      "AU.L2-3.3.9",
    ],
    severity: "high",
    supportType: "Partial Evidence",
    evaluate({ auditLogs = [] }) {
      if (auditLogs.length === 0) {
        return {
          result: "unknown",
          observedCondition: "Directory audit logs not retrievable.",
          expectedCondition: "Directory audit logs are accessible and reviewed.",
          affectedCount: 0,
          affectedItems: [],
          recommendedRemediation: "Grant AuditLog.Read.All permission.",
          suggestedRoadmapAction: "Configure Logging and Audit Review",
          evidenceTitle: "Directory Audit Log Snapshot",
          evidenceSummary: "Audit log data not available.",
        };
      }

      const roleChanges = auditLogs.filter((l) =>
        (l.category ?? "").toLowerCase().includes("rolemember") ||
        (l.activityDisplayName ?? "").toLowerCase().includes("role")
      );
      const userChanges = auditLogs.filter((l) =>
        (l.category ?? "").toLowerCase().includes("user") ||
        (l.category ?? "").toLowerCase().includes("group")
      );
      const caChanges = auditLogs.filter((l) =>
        (l.activityDisplayName ?? "").toLowerCase().includes("conditional access")
      );

      return {
        result: "partial",
        observedCondition: `${auditLogs.length} audit events retrieved. ${roleChanges.length} role changes, ${userChanges.length} user/group changes, ${caChanges.length} CA policy changes.`,
        expectedCondition: "Audit logs reviewed and findings documented.",
        affectedCount: 0,
        affectedItems: [],
        recommendedRemediation:
          "Upload a directory audit log review summary or SIEM export as evidence. Document your audit log review process.",
        suggestedRoadmapAction: "Configure Logging and Audit Review",
        evidenceTitle: "Directory Audit Log Snapshot",
        evidenceSummary: `${auditLogs.length} events sampled. ${roleChanges.length} role changes, ${userChanges.length} user/group changes.`,
      };
    },
  },

  {
    id: "PA-011",
    name: "Microsoft Secure Score Snapshot",
    description:
      "Captures the current Microsoft Secure Score and maps high-impact security recommendations to CMMC-relevant categories.",
    packId: "secure_score",
    graphEndpoints: ["/security/secureScores"],
    linkedControlIds: [
      "IA.L2-3.5.3",
      "AC.L2-3.1.12",
      "CM.L2-3.4.1",
      "AU.L2-3.3.1",
      "SI.L1-3.14.1",
    ],
    severity: "informational",
    supportType: "Partial Evidence",
    evaluate({ secureScores = [] }) {
      if (secureScores.length === 0) {
        return {
          result: "unknown",
          observedCondition: "Secure Score data not available.",
          expectedCondition: "Microsoft Secure Score is accessible and reviewed.",
          affectedCount: 0,
          affectedItems: [],
          recommendedRemediation: "Grant SecurityEvents.Read.All or SecurityActions.Read.All permission.",
          suggestedRoadmapAction: "Run Microsoft Security Baseline Review",
          evidenceTitle: "Microsoft Secure Score Snapshot",
          evidenceSummary: "Secure Score data not available.",
        };
      }

      const latest = secureScores[0];
      const currentScore = latest.currentScore ?? 0;
      const maxScore = latest.maxScore ?? 0;
      const pct = maxScore > 0 ? Math.round((currentScore / maxScore) * 100) : 0;

      const lowScoreControls = (latest.controlScores ?? [])
        .filter((c) => c.score < c.maxScore * 0.5)
        .slice(0, 10);

      return {
        result: pct >= 50 ? "partial" : "fail",
        observedCondition: `Current Secure Score: ${currentScore}/${maxScore} (${pct}%). ${lowScoreControls.length} controls below 50%.`,
        expectedCondition: "Secure Score reviewed. High-impact recommendations actioned.",
        affectedCount: lowScoreControls.length,
        affectedItems: lowScoreControls.map((c) => ({
          name: c.controlName,
          score: c.score,
          maxScore: c.maxScore,
        })),
        recommendedRemediation:
          "Review Microsoft Secure Score recommendations. Prioritize identity and access controls, device compliance, and data protection improvements.",
        suggestedRoadmapAction: "Run Microsoft Security Baseline Review",
        evidenceTitle: "Microsoft Secure Score Snapshot",
        evidenceSummary: `Secure Score: ${currentScore}/${maxScore} (${pct}%).`,
      };
    },
  },
];

export const PACK_DEFINITIONS: Record<
  string,
  { name: string; shortName: string; permissions: string[]; description: string }
> = {
  identity: {
    name: "Identity Pack",
    shortName: "Identity",
    permissions: ["User.Read.All", "Directory.Read.All"],
    description: "Users, guests, disabled accounts, stale accounts, group membership",
  },
  authentication: {
    name: "Authentication Pack",
    shortName: "Authentication",
    permissions: ["Reports.Read.All", "UserAuthenticationMethod.Read.All"],
    description: "MFA registration, authentication methods, password posture",
  },
  conditional_access: {
    name: "Conditional Access Pack",
    shortName: "Cond. Access",
    permissions: ["Policy.Read.All"],
    description: "Conditional Access policies, MFA enforcement, legacy auth blocking",
  },
  devices: {
    name: "Device / Intune Pack",
    shortName: "Devices",
    permissions: ["DeviceManagementManagedDevices.Read.All"],
    description: "Managed devices, compliance status, encryption, ownership",
  },
  audit: {
    name: "Audit / Sign-in Pack",
    shortName: "Audit Logs",
    permissions: ["AuditLog.Read.All"],
    description: "Sign-in logs, directory audit logs, admin changes",
  },
  secure_score: {
    name: "Security Score Pack",
    shortName: "Secure Score",
    permissions: ["SecurityEvents.Read.All"],
    description: "Microsoft Secure Score, improvement actions",
  },
};
