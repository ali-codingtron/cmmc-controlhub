/**
 * SSP Template Registry
 *
 * Static registry of supported SSP master templates.
 * Templates are resolved per-org based on active compliance package keys.
 * Master DOCX files live at src/data/templates/ssp/ (never modified at runtime).
 */

export interface SSPTemplateDefinition {
  templateKey: string;
  name: string;
  shortDescription: string;
  framework: string;
  frameworkVersion: string;
  cmmcLevel: 1 | 2;
  protectedInfoType: "FCI" | "CUI";
  templateVersion: string;
  assetFilename: string;
  downloadFilename: string;
  format: "docx";
  active: boolean;
  recommended: boolean;
  requirementCount: number;
  badges: string[];
  templateFacts: { label: string; value: string }[];
  warningText?: string;
  sections: string[];
}

const L1_SECTIONS = [
  "Cover Page & Document Control",
  "Revision History",
  "System Identification & Scope",
  "Assessment Boundary & In-Scope Assets",
  "Business Use Case — Federal Contract Information",
  "Network & FCI Data Flow Diagram Reference",
  "Information Architecture Overview",
  "Endpoint Security Architecture",
  "Network Boundary Architecture",
  "Roles & Responsibilities",
  "Access Control (AC.L1-3.1.1 – AC.L1-3.1.22) — 4 requirements",
  "Identification & Authentication (IA.L1-3.5.1 – IA.L1-3.5.2) — 2 requirements",
  "Media Protection (MP.L1-3.8.3) — 1 requirement",
  "Physical Protection (PE.L1-3.10.1 – PE.L1-3.10.5) — 4 requirements",
  "System & Communications Protection (SC.L1-3.13.1 – SC.L1-3.13.5) — 2 requirements",
  "System & Information Integrity (SI.L1-3.14.1 – SI.L1-3.14.5) — 4 requirements",
  "CMMC Level 1 Assessment Scorecard",
  "Self-Assessment Affirmation Statement",
  "Appendix A: In-Scope Asset Inventory",
  "Appendix B: External Service Provider Register",
];

const L2_SECTIONS = [
  "Cover Page & Document Control",
  "Revision History",
  "System Identification & Scope",
  "Assessment Boundary & In-Scope Assets",
  "Business Use Case — Controlled Unclassified Information",
  "Network & CUI Data Flow Diagram Reference",
  "Information Architecture Overview",
  "Identity & Access Management Architecture",
  "Endpoint Security Architecture",
  "Network Boundary Architecture",
  "Physical & Environmental Protection Architecture",
  "Access Control (AC) — 3.1.1 – 3.1.22 (22 requirements)",
  "Awareness & Training (AT) — 3.2.1 – 3.2.3 (3 requirements)",
  "Audit & Accountability (AU) — 3.3.1 – 3.3.9 (9 requirements)",
  "Configuration Management (CM) — 3.4.1 – 3.4.9 (9 requirements)",
  "Identification & Authentication (IA) — 3.5.1 – 3.5.11 (11 requirements)",
  "Incident Response (IR) — 3.6.1 – 3.6.3 (3 requirements)",
  "Maintenance (MA) — 3.7.1 – 3.7.6 (6 requirements)",
  "Media Protection (MP) — 3.8.1 – 3.8.9 (9 requirements)",
  "Personnel Security (PS) — 3.9.1 – 3.9.2 (2 requirements)",
  "Physical Protection (PE) — 3.10.1 – 3.10.6 (6 requirements)",
  "Risk Assessment (RA) — 3.11.1 – 3.11.3 (3 requirements)",
  "Security Assessment (CA) — 3.12.1 – 3.12.4 (4 requirements)",
  "System & Communications Protection (SC) — 3.13.1 – 3.13.16 (16 requirements)",
  "System & Information Integrity (SI) — 3.14.1 – 3.14.7 (7 requirements)",
  "CMMC Level 2 / NIST SP 800-171A Assessment Status Summary",
  "DFARS Obligations Summary",
  "Self-Assessment Affirmation Statement",
  "Appendix A: In-Scope Asset Inventory",
  "Appendix B: External Service Provider Register",
  "Appendix C: Plan of Action & Milestones Summary",
];

export const SSP_TEMPLATES: SSPTemplateDefinition[] = [
  {
    templateKey: "CMMC_L1_FCI_SSP_V2_13",
    name: "CMMC Level 1 FCI System Security Plan Template",
    shortDescription:
      "A best-practice System Security Plan for documenting the FCI environment, assessment boundary, safeguards, and all 17 Level 1 requirements with implementation narratives and annual self-assessment support.",
    framework: "CMMC Level 1",
    frameworkVersion: "CMMC v2.0",
    cmmcLevel: 1,
    protectedInfoType: "FCI",
    templateVersion: "1.0",
    assetFilename: "Control_HUB_CMMC_Level_1_FCI_SSP_Template.docx",
    downloadFilename: "Control_HUB_CMMC_Level_1_FCI_SSP_Template.docx",
    format: "docx",
    active: true,
    recommended: false,
    requirementCount: 17,
    badges: ["CMMC L1", "FAR 52.204-21", "FCI", "17 Requirements", "DOCX"],
    templateFacts: [
      { label: "Framework", value: "CMMC Level 1" },
      { label: "Information Type", value: "Federal Contract Information (FCI)" },
      { label: "Requirements", value: "17 canonical L1 requirements" },
      { label: "Assessment Mappings", value: "NIST SP 800-171A" },
      { label: "Template Version", value: "1.0" },
      { label: "Format", value: "Microsoft Word DOCX" },
      { label: "Editable", value: "Yes" },
      { label: "SSP Requirement", value: "Best practice (not required)" },
    ],
    warningText:
      "An SSP is recommended as a Level 1 best practice but is not contractually required for a Level 1 self-assessment. The organization remains responsible for maintaining sufficient implementation and assessment evidence.",
    sections: L1_SECTIONS,
  },
  {
    templateKey: "CMMC_L2_NIST_R2_SSP",
    name: "CMMC Level 2 / NIST SP 800-171 System Security Plan Template",
    shortDescription:
      "A comprehensive System Security Plan covering all 110 NIST SP 800-171 Rev. 2 requirements, CUI handling, DFARS obligations, implementation narratives, NIST SP 800-171A assessment objectives, and SPRS score tracking.",
    framework: "CMMC Level 2 / NIST SP 800-171 Rev. 2",
    frameworkVersion: "NIST SP 800-171 Rev. 2",
    cmmcLevel: 2,
    protectedInfoType: "CUI",
    templateVersion: "1.0",
    assetFilename: "Control_HUB_CMMC_L2_NIST_800-171_SSP_Template.docx",
    downloadFilename: "Control_HUB_CMMC_L2_NIST_800-171_SSP_Template.docx",
    format: "docx",
    active: true,
    recommended: true,
    requirementCount: 110,
    badges: ["CMMC L2", "NIST 800-171 R2", "NIST 800-171A", "DFARS", "CUI", "110 Requirements", "DOCX"],
    templateFacts: [
      { label: "Framework", value: "CMMC Level 2" },
      { label: "Information Type", value: "Controlled Unclassified Information (CUI)" },
      { label: "Requirements", value: "110 NIST SP 800-171 Rev. 2" },
      { label: "Procedures", value: "NIST SP 800-171A" },
      { label: "Template Version", value: "1.0" },
      { label: "Format", value: "Microsoft Word DOCX" },
      { label: "Editable", value: "Yes" },
      { label: "Contract", value: "DFARS" },
    ],
    sections: L2_SECTIONS,
  },
];

/**
 * Resolve which SSP templates are compatible with an org's active package keys.
 * An org with both L1 and L2 packages sees both templates.
 */
export function resolveCompatibleSSPTemplates(packageKeys: string[]): SSPTemplateDefinition[] {
  const hasL2 = packageKeys.some(
    (k) => k.startsWith("CMMC_L2") || k.startsWith("NIST_800_171")
  );
  const hasL1 = packageKeys.some(
    (k) => k.startsWith("CMMC_L1") || k === "FAR_52_204_21"
  );

  return SSP_TEMPLATES.filter((t) => {
    if (!t.active) return false;
    if (t.cmmcLevel === 1) return hasL1;
    if (t.cmmcLevel === 2) return hasL2;
    return false;
  });
}

/** Look up a single template definition by key. */
export function getSSPTemplate(templateKey: string): SSPTemplateDefinition | undefined {
  return SSP_TEMPLATES.find((t) => t.templateKey === templateKey);
}

// ── Wizard placeholder key → DOCX placeholder mapping ──────────────────────
// The DOCX templates use {{PLACEHOLDER_KEY}} tokens throughout their XML.
// This function converts a wizard `valuesJson` record into a flat map of
// placeholder tokens that the prefill engine will inject.
export function buildPlaceholderValues(
  wizardValues: Record<string, string>
): Record<string, string> {
  const v = (key: string) => (wizardValues[key] ?? "").toString().trim();

  // Compose name-and-title fields used in role tables
  const nameAndTitle = (nameKey: string, titleKey: string) => {
    const name = v(nameKey);
    const title = v(titleKey);
    if (name && title) return `${name}, ${title}`;
    return name || title;
  };

  // Format assessment status label for scorecard rows
  const statusLabel = (statusKey: string) => {
    const s = v(statusKey);
    if (s === "MET") return "Met";
    if (s === "NOT_MET") return "Not Met";
    if (s === "NOT_APPLICABLE") return "Not Applicable";
    if (s === "NEEDS_CONFIRMATION") return "Needs Confirmation";
    return "[ ] Met  [ ] Not Met  [ ] N/A";
  };

  return {
    // ── Org profile ──────────────────────────────────────────────────────
    ORGANIZATION_NAME: v("organizationName"),
    ORGANIZATION_LEGAL_NAME: v("organizationLegalName") || v("organizationName"),
    ORGANIZATION_SHORT_NAME: v("organizationShortName") || v("organizationName"),
    CAGE_CODES: v("cageCodes"),
    CAGE_CODE: v("cageCodes"),       // L2 uses singular CAGE_CODE
    UEI: v("uei"),
    ORGANIZATION_ADDRESS: v("organizationAddress"),
    PRIMARY_CONTACT_NAME: v("primaryContactName"),
    PRIMARY_CONTACT_TITLE: v("primaryContactTitle"),
    PRIMARY_CONTACT_EMAIL: v("primaryContactEmail"),
    PRIMARY_CONTACT_NAME_AND_TITLE: nameAndTitle("primaryContactName", "primaryContactTitle"),
    INDUSTRY: v("industry"),
    DUNS_OR_UEI: v("uei"),

    // ── Document control ─────────────────────────────────────────────────
    DOCUMENT_TITLE: v("documentTitle"),
    DOCUMENT_NUMBER: v("documentNumber"),
    REVISION_NUMBER: v("revisionNumber"),
    REVISION_DATE: v("revisionDate"),
    EFFECTIVE_DATE: v("effectiveDate"),
    APPROVED_DATE: v("effectiveDate"),
    PREPARED_BY: v("preparedBy"),
    REVIEWED_BY: v("reviewedBy"),
    APPROVED_BY: v("approvedBy"),
    AUTHORIZED_BY: v("authorizedBy") || v("approvedBy"),
    CLASSIFICATION: v("classification") || "Sensitive – For Internal Use Only",
    ASSESSMENT_SUPPORT_LABEL: v("assessmentSupportLabel"),
    ASSESSMENT_TARGET: v("assessmentSupportLabel"),

    // ── System scope ─────────────────────────────────────────────────────
    SYSTEM_ENVIRONMENT_NAME: v("systemEnvironmentName"),
    ASSESSMENT_SCOPE_NAME: v("systemEnvironmentName"),
    ASSESSMENT_SCOPE_NAME_AND_DESCRIPTION: v("systemEnvironmentName"),
    SYSTEM_ENCLAVE_NAME: v("systemEnvironmentName"),
    ASSESSMENT_SCOPE_DESCRIPTION: v("assessmentScopeDescription"),
    // L1 and L2 use different keys for the business use case narrative
    BUSINESS_AND_FCI_USE_CASE_DESCRIPTION: v("businessFciCuiUseCase"),
    BUSINESS_AND_CUI_USE_CASE_DESCRIPTION: v("businessFciCuiUseCase"),
    PRIMARY_LOCATION: v("primaryLocation"),
    IN_SCOPE_FCI_SYSTEMS: v("inScopeSystems"),
    IN_SCOPE_PEOPLE_AND_ROLES: v("inScopePeopleRoles"),
    IN_SCOPE_FACILITIES_AND_LOCATIONS: v("facilities"),
    EXTERNAL_SERVICE_PROVIDERS: v("externalServiceProviders"),
    OUT_OF_SCOPE_ASSETS: v("outOfScopeAssets"),

    // ── Architecture ─────────────────────────────────────────────────────
    // L1 template uses longer descriptive architecture section names
    IDENTITY_AUTHENTICATION_AND_ACCESS_ARCHITECTURE: v("iamArchitectureNarrative"),
    ENDPOINT_AND_MALWARE_PROTECTION_ARCHITECTURE: v("endpointSecurityNarrative"),
    NETWORK_AND_BOUNDARY_PROTECTION_ARCHITECTURE: v("networkBoundaryNarrative"),
    EXTERNAL_SYSTEMS_AND_CLOUD_SERVICE_ARCHITECTURE: v("externalSystemsNarrative"),
    // L2 template uses shorter/different architecture key names — aliases to same wizard fields
    IDENTITY_AND_ACCESS_ARCHITECTURE: v("iamArchitectureNarrative"),
    ENDPOINT_SECURITY_ARCHITECTURE: v("endpointSecurityNarrative"),
    NETWORK_AND_BOUNDARY_SECURITY_ARCHITECTURE: v("networkBoundaryNarrative"),
    CLOUD_SECURITY_ARCHITECTURE: v("externalSystemsNarrative"),
    EXTERNAL_SERVICES_AND_CUSTOMER_RESPONSIBILITIES_NARRATIVE: v("externalSystemsNarrative"),
    // Physical security architecture — L1 key and L2 key both map to physicalMediaNarrative
    PHYSICAL_AND_MEDIA_PROTECTION_ARCHITECTURE: v("physicalMediaNarrative"),
    PHYSICAL_AND_PERSONNEL_SECURITY_ARCHITECTURE: v("physicalMediaNarrative"),
    // Also cover any shortened keys in case of alias
    IAM_ARCHITECTURE_NARRATIVE: v("iamArchitectureNarrative"),
    ENDPOINT_SECURITY_NARRATIVE: v("endpointSecurityNarrative"),
    MALWARE_PROTECTION_NARRATIVE: v("malwareProtectionNarrative"),
    NETWORK_BOUNDARY_NARRATIVE: v("networkBoundaryNarrative"),
    EXTERNAL_SYSTEMS_NARRATIVE: v("externalSystemsNarrative"),
    // Data flow narrative — L1 uses domain-specific keys; L2 uses generic key
    NETWORK_AND_FCI_DATA_FLOW_NARRATIVE: v("networkDataFlowNarrative"),
    NETWORK_AND_CUI_DATA_FLOW_NARRATIVE: v("networkDataFlowNarrative"),
    NETWORK_AND_DATA_FLOW_NARRATIVE: v("networkDataFlowNarrative"),

    // ── Roles & responsibilities ──────────────────────────────────────────
    SYSTEM_OWNER_NAME: v("systemOwnerName"),
    SYSTEM_OWNER_NAME_AND_TITLE: nameAndTitle("systemOwnerName", "systemOwnerTitle"),
    SECURITY_OFFICER_NAME: v("securityOfficerName"),
    SECURITY_OFFICER_NAME_AND_TITLE: nameAndTitle("securityOfficerName", "securityOfficerTitle"),
    COMPLIANCE_REVIEWER_NAME: v("complianceReviewerName"),
    COMPLIANCE_REVIEWER_NAME_AND_TITLE: v("complianceReviewerName"),

    // ── Assessment summary ────────────────────────────────────────────────
    ASSESSMENT_SUMMARY: v("assessmentSummary"),
    SPRS_SCORE: v("sprsScore"),
    AFFIRMATION_DATE: v("affirmationDate"),
    AFFIRMATION_STATUS_AND_DATE: v("affirmationDate"),

    // ── L1 requirement narratives (Roman numeral ordering per CMMC model) ─
    // AC domain (I–IV)
    AC_L1_B_1_I_IMPLEMENTATION_NARRATIVE: v("req_AC_L1_3_1_1"),
    AC_L1_B_1_II_IMPLEMENTATION_NARRATIVE: v("req_AC_L1_3_1_2"),
    AC_L1_B_1_III_IMPLEMENTATION_NARRATIVE: v("req_AC_L1_3_1_20"),
    AC_L1_B_1_IV_IMPLEMENTATION_NARRATIVE: v("req_AC_L1_3_1_22"),
    // IA domain (V–VI)
    IA_L1_B_1_V_IMPLEMENTATION_NARRATIVE: v("req_IA_L1_3_5_1"),
    IA_L1_B_1_VI_IMPLEMENTATION_NARRATIVE: v("req_IA_L1_3_5_2"),
    // MP domain (VII)
    MP_L1_B_1_VII_IMPLEMENTATION_NARRATIVE: v("req_MP_L1_3_8_3"),
    // PE domain (VIII–IX cover 3.10.1 and 3.10.3; template consolidates 3.10.4/3.10.5 within these sections)
    PE_L1_B_1_VIII_IMPLEMENTATION_NARRATIVE: v("req_PE_L1_3_10_1"),
    PE_L1_B_1_IX_IMPLEMENTATION_NARRATIVE: v("req_PE_L1_3_10_3"),
    // SC domain (X–XI)
    SC_L1_B_1_X_IMPLEMENTATION_NARRATIVE: v("req_SC_L1_3_13_1"),
    SC_L1_B_1_XI_IMPLEMENTATION_NARRATIVE: v("req_SC_L1_3_13_5"),
    // SI domain (XII–XV)
    SI_L1_B_1_XII_IMPLEMENTATION_NARRATIVE: v("req_SI_L1_3_14_1"),
    SI_L1_B_1_XIII_IMPLEMENTATION_NARRATIVE: v("req_SI_L1_3_14_2"),
    SI_L1_B_1_XIV_IMPLEMENTATION_NARRATIVE: v("req_SI_L1_3_14_4"),
    SI_L1_B_1_XV_IMPLEMENTATION_NARRATIVE: v("req_SI_L1_3_14_5"),

    // ── L1 assessment notes (same source, used for assessor notes fields) ─
    AC_L1_B_1_I_ASSESSMENT_NOTES: v("status_AC_L1_3_1_1") ? statusLabel("status_AC_L1_3_1_1") : "",
    AC_L1_B_1_II_ASSESSMENT_NOTES: v("status_AC_L1_3_1_2") ? statusLabel("status_AC_L1_3_1_2") : "",
    AC_L1_B_1_III_ASSESSMENT_NOTES: v("status_AC_L1_3_1_20") ? statusLabel("status_AC_L1_3_1_20") : "",
    AC_L1_B_1_IV_ASSESSMENT_NOTES: v("status_AC_L1_3_1_22") ? statusLabel("status_AC_L1_3_1_22") : "",
    IA_L1_B_1_V_ASSESSMENT_NOTES: v("status_IA_L1_3_5_1") ? statusLabel("status_IA_L1_3_5_1") : "",
    IA_L1_B_1_VI_ASSESSMENT_NOTES: v("status_IA_L1_3_5_2") ? statusLabel("status_IA_L1_3_5_2") : "",
    MP_L1_B_1_VII_ASSESSMENT_NOTES: v("status_MP_L1_3_8_3") ? statusLabel("status_MP_L1_3_8_3") : "",
    PE_L1_B_1_VIII_ASSESSMENT_NOTES: v("status_PE_L1_3_10_1") ? statusLabel("status_PE_L1_3_10_1") : "",
    PE_L1_B_1_IX_ASSESSMENT_NOTES: v("status_PE_L1_3_10_3") ? statusLabel("status_PE_L1_3_10_3") : "",
    SC_L1_B_1_X_ASSESSMENT_NOTES: v("status_SC_L1_3_13_1") ? statusLabel("status_SC_L1_3_13_1") : "",
    SC_L1_B_1_XI_ASSESSMENT_NOTES: v("status_SC_L1_3_13_5") ? statusLabel("status_SC_L1_3_13_5") : "",
    SI_L1_B_1_XII_ASSESSMENT_NOTES: v("status_SI_L1_3_14_1") ? statusLabel("status_SI_L1_3_14_1") : "",
    SI_L1_B_1_XIII_ASSESSMENT_NOTES: v("status_SI_L1_3_14_2") ? statusLabel("status_SI_L1_3_14_2") : "",
    SI_L1_B_1_XIV_ASSESSMENT_NOTES: v("status_SI_L1_3_14_4") ? statusLabel("status_SI_L1_3_14_4") : "",
    SI_L1_B_1_XV_ASSESSMENT_NOTES: v("status_SI_L1_3_14_5") ? statusLabel("status_SI_L1_3_14_5") : "",

    // ── L2 requirement narratives (NIST ref format) ───────────────────────
    // Populated via the "Import from SSP Mappings" button on wizard Step 7.
    // Wizard stores them as:
    //   AC_L2_3_1_1_IMPLEMENTATION_NARRATIVE  (domain + L2 + ref)
    //   REQ_3_1_1_IMPLEMENTATION_NARRATIVE     (ref-only alias)
    // Both pattern families appear as DOCX placeholder tokens in the L2 template.
    // Pass through any key that:
    //   (a) ends in _IMPLEMENTATION_NARRATIVE, AND
    //   (b) is NOT one of the hardcoded L1 Roman-numeral keys above
    //       (those all contain _B_1_ in their name — e.g. AC_L1_B_1_I_...).
    ...Object.fromEntries(
      Object.entries(wizardValues)
        .filter(([k]) =>
          k.endsWith("_IMPLEMENTATION_NARRATIVE") &&
          !k.includes("_B_1_") // exclude hardcoded L1 Roman-numeral keys
        )
        .map(([k, val]) => [k, (val ?? "").toString().trim()])
    ),
  };
}

/**
 * Convert a NIST control ref to the two wizard/DOCX placeholder keys used
 * for L2 implementation narratives. Always emits L2-tagged keys regardless
 * of whether the source ref is tagged L1 or L2, because:
 *   - The L2 DOCX template exclusively uses L2-tagged placeholders
 *   - Some controls are stored in ssp_control_mappings with L1 refs even
 *     in an L2 org context (canonicalized during SSP parse)
 *
 * Returns two keys:
 *   1. "{DOMAIN}_L2_{MAJOR}_{MINOR}_{PATCH}_IMPLEMENTATION_NARRATIVE"
 *      e.g. "AC_L2_3_1_1_IMPLEMENTATION_NARRATIVE"
 *   2. "REQ_{MAJOR}_{MINOR}_{PATCH}_IMPLEMENTATION_NARRATIVE"
 *      e.g. "REQ_3_1_1_IMPLEMENTATION_NARRATIVE"
 * Both variants appear as placeholder tokens in the L2 DOCX template.
 */
export function controlRefToL2NarrativeKeys(controlRef: string): [string, string] {
  // Accepts: "AC.L2-3.1.1", "AC.L1-3.1.1", "AC-3.1.1" etc.
  // Step 1: extract domain and numeric ref
  const m = controlRef.match(/^([A-Z]{2,4})[._-]L[12][._-](\d+\.\d+\.\d+)$/);
  if (m) {
    const domain = m[1];
    const numParts = m[2].replace(/\./g, "_"); // "3.1.1" → "3_1_1"
    return [
      `${domain}_L2_${numParts}_IMPLEMENTATION_NARRATIVE`,
      `REQ_${numParts}_IMPLEMENTATION_NARRATIVE`,
    ];
  }
  // Fallback: replace dots and dashes generically, force L1→L2
  const normalized = controlRef
    .replace(/\.L1-/g, "_L2_")
    .replace(/\.L2-/g, "_L2_")
    .replace(/\./g, "_")
    .replace(/-/g, "_");
  return [`${normalized}_IMPLEMENTATION_NARRATIVE`, `${normalized}_IMPLEMENTATION_NARRATIVE`];
}
