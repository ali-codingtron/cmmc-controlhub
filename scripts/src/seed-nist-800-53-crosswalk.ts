/**
 * Seed script: NIST SP 800-171 Rev. 2 → NIST SP 800-53 Rev. 4 crosswalk
 *
 * Source: NIST SP 800-171 Rev. 2, Appendix D (Table D-1)
 * Relationship type: derived_from (800-171 requirements were derived from 800-53 source controls)
 *
 * Usage:
 *   pnpm seed:framework-crosswalks --dry-run    (inspect changes, no DB writes)
 *   pnpm seed:framework-crosswalks              (apply changes)
 */

import {
  db,
  compliancePackagesTable,
  complianceRequirementsTable,
  requirementCrosswalkTable,
} from "@workspace/db";
import { eq, inArray } from "drizzle-orm";
import { randomUUID } from "crypto";

const isDryRun = process.argv.includes("--dry-run");

// ── NIST 800-53 Rev. 4 control catalog (only controls referenced by 800-171 R2) ─

type ControlMeta = { family: string; familyName: string; title: string };

const CATALOG: Record<string, ControlMeta> = {
  // Access Control
  "AC-2":       { family: "AC", familyName: "Access Control", title: "Account Management" },
  "AC-3":       { family: "AC", familyName: "Access Control", title: "Access Enforcement" },
  "AC-4":       { family: "AC", familyName: "Access Control", title: "Information Flow Enforcement" },
  "AC-5":       { family: "AC", familyName: "Access Control", title: "Separation of Duties" },
  "AC-6":       { family: "AC", familyName: "Access Control", title: "Least Privilege" },
  "AC-6(1)":    { family: "AC", familyName: "Access Control", title: "Least Privilege | Authorize Access to Security Functions" },
  "AC-6(2)":    { family: "AC", familyName: "Access Control", title: "Least Privilege | Non-Privileged Access for Nonsecurity Functions" },
  "AC-6(5)":    { family: "AC", familyName: "Access Control", title: "Least Privilege | Privileged Accounts" },
  "AC-6(9)":    { family: "AC", familyName: "Access Control", title: "Least Privilege | Log Use of Privileged Functions" },
  "AC-6(10)":   { family: "AC", familyName: "Access Control", title: "Least Privilege | Prohibit Non-Privileged Users from Executing Privileged Functions" },
  "AC-7":       { family: "AC", familyName: "Access Control", title: "Unsuccessful Logon Attempts" },
  "AC-8":       { family: "AC", familyName: "Access Control", title: "System Use Notification" },
  "AC-11":      { family: "AC", familyName: "Access Control", title: "Session Lock" },
  "AC-11(1)":   { family: "AC", familyName: "Access Control", title: "Session Lock | Pattern-Hiding Displays" },
  "AC-12":      { family: "AC", familyName: "Access Control", title: "Session Termination" },
  "AC-17":      { family: "AC", familyName: "Access Control", title: "Remote Access" },
  "AC-17(1)":   { family: "AC", familyName: "Access Control", title: "Remote Access | Automated Monitoring / Control" },
  "AC-18":      { family: "AC", familyName: "Access Control", title: "Wireless Access" },
  "AC-18(1)":   { family: "AC", familyName: "Access Control", title: "Wireless Access | Authentication and Encryption" },
  "AC-19":      { family: "AC", familyName: "Access Control", title: "Access Control for Mobile Devices" },
  "AC-19(5)":   { family: "AC", familyName: "Access Control", title: "Access Control for Mobile Devices | Full Device / Container-Based Encryption" },
  "AC-20":      { family: "AC", familyName: "Access Control", title: "Use of External Information Systems" },
  "AC-20(1)":   { family: "AC", familyName: "Access Control", title: "Use of External Information Systems | Limits on Authorized Use" },
  "AC-20(2)":   { family: "AC", familyName: "Access Control", title: "Use of External Information Systems | Portable Storage Devices" },
  "AC-21":      { family: "AC", familyName: "Access Control", title: "Information Sharing" },
  "AC-22":      { family: "AC", familyName: "Access Control", title: "Publicly Accessible Content" },

  // Awareness and Training
  "AT-2":       { family: "AT", familyName: "Awareness and Training", title: "Security Awareness Training" },
  "AT-2(2)":    { family: "AT", familyName: "Awareness and Training", title: "Security Awareness Training | Insider Threat" },
  "AT-3":       { family: "AT", familyName: "Awareness and Training", title: "Role-Based Security Training" },

  // Audit and Accountability
  "AU-2":       { family: "AU", familyName: "Audit and Accountability", title: "Audit Events" },
  "AU-3":       { family: "AU", familyName: "Audit and Accountability", title: "Content of Audit Records" },
  "AU-5":       { family: "AU", familyName: "Audit and Accountability", title: "Response to Audit Processing Failures" },
  "AU-6":       { family: "AU", familyName: "Audit and Accountability", title: "Audit Review, Analysis, and Reporting" },
  "AU-6(1)":    { family: "AU", familyName: "Audit and Accountability", title: "Audit Review, Analysis, and Reporting | Process Integration" },
  "AU-6(3)":    { family: "AU", familyName: "Audit and Accountability", title: "Audit Review, Analysis, and Reporting | Correlate Audit Repositories" },
  "AU-7":       { family: "AU", familyName: "Audit and Accountability", title: "Audit Reduction and Report Generation" },
  "AU-7(1)":    { family: "AU", familyName: "Audit and Accountability", title: "Audit Reduction and Report Generation | Automatic Processing" },
  "AU-8":       { family: "AU", familyName: "Audit and Accountability", title: "Time Stamps" },
  "AU-9":       { family: "AU", familyName: "Audit and Accountability", title: "Protection of Audit Information" },
  "AU-9(2)":    { family: "AU", familyName: "Audit and Accountability", title: "Protection of Audit Information | Audit Backup on Separate Physical Systems / Components" },
  "AU-12":      { family: "AU", familyName: "Audit and Accountability", title: "Audit Record Generation" },

  // Security Assessment and Authorization
  "CA-2":       { family: "CA", familyName: "Security Assessment and Authorization", title: "Security Assessments" },
  "CA-2(1)":    { family: "CA", familyName: "Security Assessment and Authorization", title: "Security Assessments | Independent Assessors" },
  "CA-5":       { family: "CA", familyName: "Security Assessment and Authorization", title: "Plan of Action and Milestones" },
  "CA-7":       { family: "CA", familyName: "Security Assessment and Authorization", title: "Continuous Monitoring" },
  "CA-7(1)":    { family: "CA", familyName: "Security Assessment and Authorization", title: "Continuous Monitoring | Independent Assessment" },

  // Configuration Management
  "CM-2":       { family: "CM", familyName: "Configuration Management", title: "Baseline Configuration" },
  "CM-3":       { family: "CM", familyName: "Configuration Management", title: "Configuration Change Control" },
  "CM-3(2)":    { family: "CM", familyName: "Configuration Management", title: "Configuration Change Control | Test / Validate / Document Changes" },
  "CM-4":       { family: "CM", familyName: "Configuration Management", title: "Security Impact Analysis" },
  "CM-6":       { family: "CM", familyName: "Configuration Management", title: "Configuration Settings" },
  "CM-7":       { family: "CM", familyName: "Configuration Management", title: "Least Functionality" },
  "CM-7(1)":    { family: "CM", familyName: "Configuration Management", title: "Least Functionality | Periodic Review" },
  "CM-7(2)":    { family: "CM", familyName: "Configuration Management", title: "Least Functionality | Prevent Program Execution" },
  "CM-7(4)":    { family: "CM", familyName: "Configuration Management", title: "Least Functionality | Unauthorized Software / Blacklisting" },
  "CM-7(5)":    { family: "CM", familyName: "Configuration Management", title: "Least Functionality | Authorized Software / Whitelisting" },
  "CM-8":       { family: "CM", familyName: "Configuration Management", title: "Information System Component Inventory" },
  "CM-11":      { family: "CM", familyName: "Configuration Management", title: "User-Installed Software" },
  "CM-11(1)":   { family: "CM", familyName: "Configuration Management", title: "User-Installed Software | Alerts for Unauthorized Installations" },

  // Contingency Planning
  "CP-6":       { family: "CP", familyName: "Contingency Planning", title: "Alternate Storage Site" },
  "CP-6(1)":    { family: "CP", familyName: "Contingency Planning", title: "Alternate Storage Site | Separation from Primary Site" },

  // Identification and Authentication
  "IA-2":       { family: "IA", familyName: "Identification and Authentication", title: "Identification and Authentication (Organizational Users)" },
  "IA-2(1)":    { family: "IA", familyName: "Identification and Authentication", title: "Identification and Authentication | Network Access to Privileged Accounts" },
  "IA-2(2)":    { family: "IA", familyName: "Identification and Authentication", title: "Identification and Authentication | Network Access to Non-Privileged Accounts" },
  "IA-2(3)":    { family: "IA", familyName: "Identification and Authentication", title: "Identification and Authentication | Local Access to Privileged Accounts" },
  "IA-2(8)":    { family: "IA", familyName: "Identification and Authentication", title: "Identification and Authentication | Network Access to Privileged Accounts — Replay Resistant" },
  "IA-2(11)":   { family: "IA", familyName: "Identification and Authentication", title: "Identification and Authentication | Remote Access — Separate Device" },
  "IA-5":       { family: "IA", familyName: "Identification and Authentication", title: "Authenticator Management" },
  "IA-5(1)":    { family: "IA", familyName: "Identification and Authentication", title: "Authenticator Management | Password-Based Authentication" },
  "IA-5(3)":    { family: "IA", familyName: "Identification and Authentication", title: "Authenticator Management | In-Person or Trusted Third-Party Registration" },
  "IA-5(13)":   { family: "IA", familyName: "Identification and Authentication", title: "Authenticator Management | Expiration of Cached Authenticators" },
  "IA-6":       { family: "IA", familyName: "Identification and Authentication", title: "Authenticator Feedback" },

  // Incident Response
  "IR-2":       { family: "IR", familyName: "Incident Response", title: "Incident Response Training" },
  "IR-3":       { family: "IR", familyName: "Incident Response", title: "Incident Response Testing" },
  "IR-3(2)":    { family: "IR", familyName: "Incident Response", title: "Incident Response Testing | Coordination with Related Plans" },
  "IR-4":       { family: "IR", familyName: "Incident Response", title: "Incident Handling" },
  "IR-5":       { family: "IR", familyName: "Incident Response", title: "Incident Monitoring" },
  "IR-6":       { family: "IR", familyName: "Incident Response", title: "Incident Reporting" },

  // Maintenance
  "MA-2":       { family: "MA", familyName: "Maintenance", title: "Controlled Maintenance" },
  "MA-3":       { family: "MA", familyName: "Maintenance", title: "Maintenance Tools" },
  "MA-3(1)":    { family: "MA", familyName: "Maintenance", title: "Maintenance Tools | Inspect Tools" },
  "MA-3(2)":    { family: "MA", familyName: "Maintenance", title: "Maintenance Tools | Inspect Media" },
  "MA-4":       { family: "MA", familyName: "Maintenance", title: "Nonlocal Maintenance" },
  "MA-4(3)":    { family: "MA", familyName: "Maintenance", title: "Nonlocal Maintenance | Comparable Security / Sanitization" },
  "MA-5":       { family: "MA", familyName: "Maintenance", title: "Maintenance Personnel" },
  "MA-5(1)":    { family: "MA", familyName: "Maintenance", title: "Maintenance Personnel | Individuals Without Appropriate Access" },

  // Media Protection
  "MP-2":       { family: "MP", familyName: "Media Protection", title: "Media Access" },
  "MP-3":       { family: "MP", familyName: "Media Protection", title: "Media Marking" },
  "MP-4":       { family: "MP", familyName: "Media Protection", title: "Media Storage" },
  "MP-5":       { family: "MP", familyName: "Media Protection", title: "Media Transport" },
  "MP-5(4)":    { family: "MP", familyName: "Media Protection", title: "Media Transport | Cryptographic Protection" },
  "MP-6":       { family: "MP", familyName: "Media Protection", title: "Media Sanitization" },
  "MP-6(1)":    { family: "MP", familyName: "Media Protection", title: "Media Sanitization | Review / Approve / Track / Document / Verify" },
  "MP-6(3)":    { family: "MP", familyName: "Media Protection", title: "Media Sanitization | Nondestructive Techniques" },
  "MP-7":       { family: "MP", familyName: "Media Protection", title: "Media Use" },

  // Physical and Environmental Protection
  "PE-2":       { family: "PE", familyName: "Physical and Environmental Protection", title: "Physical Access Authorizations" },
  "PE-3":       { family: "PE", familyName: "Physical and Environmental Protection", title: "Physical Access Control" },
  "PE-3(2)":    { family: "PE", familyName: "Physical and Environmental Protection", title: "Physical Access Control | Facility / Information System Boundaries" },
  "PE-4":       { family: "PE", familyName: "Physical and Environmental Protection", title: "Access Control for Transmission Medium" },
  "PE-6":       { family: "PE", familyName: "Physical and Environmental Protection", title: "Monitoring Physical Access" },
  "PE-6(2)":    { family: "PE", familyName: "Physical and Environmental Protection", title: "Monitoring Physical Access | Automated Intrusion Recognition / Responses" },
  "PE-8":       { family: "PE", familyName: "Physical and Environmental Protection", title: "Visitor Access Records" },
  "PE-17":      { family: "PE", familyName: "Physical and Environmental Protection", title: "Alternate Work Site" },

  // Planning
  "PL-2":       { family: "PL", familyName: "Planning", title: "System Security Plan" },

  // Personnel Security
  "PS-3":       { family: "PS", familyName: "Personnel Security", title: "Personnel Screening" },
  "PS-4":       { family: "PS", familyName: "Personnel Security", title: "Personnel Termination" },
  "PS-5":       { family: "PS", familyName: "Personnel Security", title: "Personnel Transfer" },

  // Risk Assessment
  "RA-3":       { family: "RA", familyName: "Risk Assessment", title: "Risk Assessment" },
  "RA-5":       { family: "RA", familyName: "Risk Assessment", title: "Vulnerability Scanning" },
  "RA-5(5)":    { family: "RA", familyName: "Risk Assessment", title: "Vulnerability Scanning | Privileged Access" },

  // System and Communications Protection
  "SC-2":       { family: "SC", familyName: "System and Communications Protection", title: "Application Partitioning" },
  "SC-3":       { family: "SC", familyName: "System and Communications Protection", title: "Security Function Isolation" },
  "SC-7":       { family: "SC", familyName: "System and Communications Protection", title: "Boundary Protection" },
  "SC-7(5)":    { family: "SC", familyName: "System and Communications Protection", title: "Boundary Protection | Deny by Default / Allow by Exception" },
  "SC-7(7)":    { family: "SC", familyName: "System and Communications Protection", title: "Boundary Protection | Route Traffic to Managed Interfaces" },
  "SC-7(11)":   { family: "SC", familyName: "System and Communications Protection", title: "Boundary Protection | Restrict Incoming Communications Traffic" },
  "SC-8":       { family: "SC", familyName: "System and Communications Protection", title: "Transmission Confidentiality and Integrity" },
  "SC-8(1)":    { family: "SC", familyName: "System and Communications Protection", title: "Transmission Confidentiality and Integrity | Cryptographic or Alternate Physical Protection" },
  "SC-10":      { family: "SC", familyName: "System and Communications Protection", title: "Network Disconnect" },
  "SC-12":      { family: "SC", familyName: "System and Communications Protection", title: "Cryptographic Key Establishment and Management" },
  "SC-13":      { family: "SC", familyName: "System and Communications Protection", title: "Cryptographic Protection" },
  "SC-15":      { family: "SC", familyName: "System and Communications Protection", title: "Collaborative Computing Devices" },
  "SC-19":      { family: "SC", familyName: "System and Communications Protection", title: "Voice Over Internet Protocol" },
  "SC-20":      { family: "SC", familyName: "System and Communications Protection", title: "Secure Name / Address Resolution Service (Authoritative Source)" },
  "SC-22":      { family: "SC", familyName: "System and Communications Protection", title: "Architecture and Provisioning for Name / Address Resolution Service" },
  "SC-23":      { family: "SC", familyName: "System and Communications Protection", title: "Session Authenticity" },
  "SC-26":      { family: "SC", familyName: "System and Communications Protection", title: "Honeypots" },
  "SC-28":      { family: "SC", familyName: "System and Communications Protection", title: "Protection of Information at Rest" },
  "SC-28(1)":   { family: "SC", familyName: "System and Communications Protection", title: "Protection of Information at Rest | Cryptographic Protection" },
  "SC-32":      { family: "SC", familyName: "System and Communications Protection", title: "Information System Partitioning" },
  "SC-39":      { family: "SC", familyName: "System and Communications Protection", title: "Process Isolation" },

  // System and Information Integrity
  "SI-2":       { family: "SI", familyName: "System and Information Integrity", title: "Flaw Remediation" },
  "SI-3":       { family: "SI", familyName: "System and Information Integrity", title: "Malicious Code Protection" },
  "SI-3(1)":    { family: "SI", familyName: "System and Information Integrity", title: "Malicious Code Protection | Central Management" },
  "SI-3(7)":    { family: "SI", familyName: "System and Information Integrity", title: "Malicious Code Protection | Nonsignature-Based Detection" },
  "SI-4":       { family: "SI", familyName: "System and Information Integrity", title: "Information System Monitoring" },
  "SI-4(2)":    { family: "SI", familyName: "System and Information Integrity", title: "Information System Monitoring | Automated Tools for Real-Time Analysis" },
  "SI-5":       { family: "SI", familyName: "System and Information Integrity", title: "Security Alerts, Advisories, and Directives" },
  "SI-7":       { family: "SI", familyName: "System and Information Integrity", title: "Software, Firmware, and Information Integrity" },
  "SI-7(1)":    { family: "SI", familyName: "System and Information Integrity", title: "Software, Firmware, and Information Integrity | Integrity Checks" },
  "SI-7(7)":    { family: "SI", familyName: "System and Information Integrity", title: "Software, Firmware, and Information Integrity | Integration of Detection and Response" },
  "SI-8":       { family: "SI", familyName: "System and Information Integrity", title: "Spam Protection" },
  "SI-16":      { family: "SI", familyName: "System and Information Integrity", title: "Memory Protection" },
};

// ── Official NIST 800-171 Rev. 2 Appendix D mapping → 800-53 Rev. 4 source controls ──

const MAPPING: Record<string, string[]> = {
  // 3.1 Access Control
  "3.1.1":  ["AC-2", "AC-3", "AC-17"],
  "3.1.2":  ["AC-3", "AC-17"],
  "3.1.3":  ["AC-4", "SC-7", "SC-7(5)"],
  "3.1.4":  ["AC-5", "AC-6"],
  "3.1.5":  ["AC-6", "AC-6(1)", "AC-6(2)", "AC-6(5)"],
  "3.1.6":  ["AC-6(9)"],
  "3.1.7":  ["AC-6(9)", "AC-6(10)"],
  "3.1.8":  ["AC-7"],
  "3.1.9":  ["AC-8"],
  "3.1.10": ["AC-11", "AC-11(1)"],
  "3.1.11": ["AC-12"],
  "3.1.12": ["AC-17", "AC-17(1)"],
  "3.1.13": ["AC-17", "SC-8", "SC-8(1)"],
  "3.1.14": ["AC-17", "SC-8", "SC-8(1)"],
  "3.1.15": ["AC-17"],
  "3.1.16": ["AC-18", "AC-18(1)"],
  "3.1.17": ["AC-18", "AC-18(1)"],
  "3.1.18": ["AC-19", "AC-19(5)"],
  "3.1.19": ["AC-20", "AC-20(1)"],
  "3.1.20": ["AC-20", "AC-20(2)"],
  "3.1.21": ["AC-21"],
  "3.1.22": ["AC-22"],

  // 3.2 Awareness and Training
  "3.2.1":  ["AT-2"],
  "3.2.2":  ["AT-2", "AT-3"],
  "3.2.3":  ["AT-2(2)"],

  // 3.3 Audit and Accountability
  "3.3.1":  ["AU-2", "AU-3", "AU-8", "AU-12"],
  "3.3.2":  ["AU-3", "AU-8", "AU-12"],
  "3.3.3":  ["AU-7", "AU-7(1)"],
  "3.3.4":  ["AU-5"],
  "3.3.5":  ["AU-6", "AU-6(1)"],
  "3.3.6":  ["AU-3", "AU-12"],
  "3.3.7":  ["AU-8"],
  "3.3.8":  ["AU-9", "AU-9(2)"],
  "3.3.9":  ["AU-6(3)"],

  // 3.4 Configuration Management
  "3.4.1":  ["CM-2", "CM-6", "CM-8"],
  "3.4.2":  ["CM-6", "CM-7"],
  "3.4.3":  ["CM-3", "CM-4"],
  "3.4.4":  ["CM-3(2)"],
  "3.4.5":  ["CM-2", "CM-7", "CM-7(2)", "CM-8"],
  "3.4.6":  ["CM-7", "CM-7(1)"],
  "3.4.7":  ["CM-7(2)", "CM-7(5)"],
  "3.4.8":  ["CM-7(4)", "CM-7(5)"],
  "3.4.9":  ["CM-11", "CM-11(1)"],

  // 3.5 Identification and Authentication
  "3.5.1":  ["IA-2"],
  "3.5.2":  ["IA-5"],
  "3.5.3":  ["IA-2(1)", "IA-2(2)", "IA-2(3)", "IA-2(11)"],
  "3.5.4":  ["IA-2(8)"],
  "3.5.5":  ["IA-5(13)"],
  "3.5.6":  ["IA-5(1)"],
  "3.5.7":  ["IA-5(1)"],
  "3.5.8":  ["IA-5(1)"],
  "3.5.9":  ["IA-5(1)"],
  "3.5.10": ["IA-5(3)"],
  "3.5.11": ["IA-6"],

  // 3.6 Incident Response
  "3.6.1":  ["IR-2", "IR-4", "IR-5", "IR-6"],
  "3.6.2":  ["IR-4", "IR-6"],
  "3.6.3":  ["IR-2", "IR-3", "IR-3(2)"],

  // 3.7 Maintenance
  "3.7.1":  ["MA-2"],
  "3.7.2":  ["MA-3", "MA-3(1)", "MA-3(2)"],
  "3.7.3":  ["MA-4"],
  "3.7.4":  ["MA-3(2)"],
  "3.7.5":  ["MA-4", "MA-4(3)"],
  "3.7.6":  ["MA-5", "MA-5(1)"],

  // 3.8 Media Protection
  "3.8.1":  ["MP-2", "MP-4"],
  "3.8.2":  ["MP-2", "MP-4"],
  "3.8.3":  ["MP-6", "MP-6(1)", "MP-6(3)"],
  "3.8.4":  ["MP-3"],
  "3.8.5":  ["MP-4", "MP-7"],
  "3.8.6":  ["MP-4", "MP-5", "MP-5(4)"],
  "3.8.7":  ["MP-5", "MP-5(4)"],
  "3.8.8":  ["MP-6"],
  "3.8.9":  ["CP-6", "CP-6(1)"],

  // 3.9 Personnel Security
  "3.9.1":  ["PS-3"],
  "3.9.2":  ["PS-4", "PS-5"],

  // 3.10 Physical Protection
  "3.10.1": ["PE-2", "PE-3", "PE-6"],
  "3.10.2": ["PE-2", "PE-3", "PE-4", "PE-6"],
  "3.10.3": ["PE-3(2)"],
  "3.10.4": ["PE-8"],
  "3.10.5": ["PE-6(2)"],
  "3.10.6": ["PE-17"],

  // 3.11 Risk Assessment
  "3.11.1": ["CA-2", "CA-2(1)", "RA-3", "RA-5", "RA-5(5)"],
  "3.11.2": ["RA-3", "RA-5", "RA-5(5)"],
  "3.11.3": ["RA-5", "RA-5(5)"],

  // 3.12 Security Assessment
  "3.12.1": ["CA-2", "CA-7", "CA-7(1)", "PL-2"],
  "3.12.2": ["CA-5", "CA-7"],
  "3.12.3": ["CA-7", "CA-7(1)"],
  "3.12.4": ["PL-2"],

  // 3.13 System and Communications Protection
  "3.13.1":  ["AC-4", "AC-17", "SC-7", "SC-7(5)"],
  "3.13.2":  ["SC-39"],
  "3.13.3":  ["SC-2", "SC-3"],
  "3.13.4":  ["SC-32", "SI-16"],
  "3.13.5":  ["SC-7", "SC-7(5)"],
  "3.13.6":  ["SC-7", "SC-7(11)"],
  "3.13.7":  ["SC-7", "SC-7(7)"],
  "3.13.8":  ["SC-8", "SC-8(1)"],
  "3.13.9":  ["SC-10"],
  "3.13.10": ["SC-12"],
  "3.13.11": ["SC-13"],
  "3.13.12": ["SC-15"],
  "3.13.13": ["SC-26", "SI-3", "SI-3(7)"],
  "3.13.14": ["SC-19", "SC-20", "SC-22"],
  "3.13.15": ["SC-23"],
  "3.13.16": ["SC-28", "SC-28(1)"],

  // 3.14 System and Information Integrity
  "3.14.1": ["SI-2", "SI-3"],
  "3.14.2": ["SI-3", "SI-8"],
  "3.14.3": ["SI-5"],
  "3.14.4": ["SI-3", "SI-3(1)"],
  "3.14.5": ["SI-3", "SI-7", "SI-7(1)", "SI-7(7)"],
  "3.14.6": ["SI-4", "SI-4(2)"],
  "3.14.7": ["SI-4"],
};

function getSortOrder(controlId: string): number {
  const m = controlId.match(/^([A-Z]+)-(\d+)(?:\((\d+)\))?$/);
  if (!m) return 0;
  return parseInt(m[2]) * 100 + (m[3] ? parseInt(m[3]) : 0);
}

async function main(): Promise<void> {
  console.log(`\n=== NIST 800-171 R2 → 800-53 R4 Crosswalk Seed ===`);
  console.log(`Mode: ${isDryRun ? "DRY RUN (no changes)" : "LIVE (writing to DB)"}\n`);

  // ── 1. Resolve packages ──────────────────────────────────────────────────────
  const [pkg171] = await db
    .select({ id: compliancePackagesTable.id, name: compliancePackagesTable.name })
    .from(compliancePackagesTable)
    .where(eq(compliancePackagesTable.packageKey, "NIST_800_171_R2"))
    .limit(1);

  const [pkg53] = await db
    .select({ id: compliancePackagesTable.id, name: compliancePackagesTable.name })
    .from(compliancePackagesTable)
    .where(eq(compliancePackagesTable.packageKey, "NIST_800_53_R4"))
    .limit(1);

  if (!pkg171) throw new Error("Package NIST_800_171_R2 not found in compliance_packages");
  if (!pkg53)  throw new Error("Package NIST_800_53_R4 not found in compliance_packages");

  console.log(`Resolved packages:`);
  console.log(`  Source: ${pkg171.name} (${pkg171.id})`);
  console.log(`  Target: ${pkg53.name}  (${pkg53.id})\n`);

  // ── 2. Load existing 800-171 R2 requirements ─────────────────────────────────
  const reqs171 = await db
    .select({ id: complianceRequirementsTable.id, requirementId: complianceRequirementsTable.requirementId })
    .from(complianceRequirementsTable)
    .where(eq(complianceRequirementsTable.packageId, pkg171.id));

  const req171Map: Record<string, string> = {};
  for (const r of reqs171) req171Map[r.requirementId] = r.id;
  console.log(`Loaded ${reqs171.length} NIST 800-171 R2 requirements`);

  // ── 3. Check which 800-171 requirements are in the mapping ───────────────────
  const missing171 = Object.keys(MAPPING).filter(k => !req171Map[k]);
  if (missing171.length > 0) {
    console.warn(`  WARNING: These 800-171 requirements are in the mapping but not in the DB:`);
    console.warn(`  ${missing171.join(", ")}`);
  }

  // ── 4. Determine which 800-53 controls need to be created ────────────────────
  const neededControls = new Set<string>();
  for (const targets of Object.values(MAPPING)) {
    for (const t of targets) neededControls.add(t);
  }

  const existing53 = await db
    .select({ id: complianceRequirementsTable.id, requirementId: complianceRequirementsTable.requirementId })
    .from(complianceRequirementsTable)
    .where(eq(complianceRequirementsTable.packageId, pkg53.id));

  const req53Map: Record<string, string> = {};
  for (const r of existing53) req53Map[r.requirementId] = r.id;
  console.log(`Existing 800-53 R4 requirements in DB: ${existing53.length}`);

  const toCreate53: Array<typeof complianceRequirementsTable.$inferInsert> = [];
  const unknownControls: string[] = [];

  for (const ctrlId of [...neededControls].sort()) {
    if (req53Map[ctrlId]) continue;
    const meta = CATALOG[ctrlId];
    if (!meta) {
      unknownControls.push(ctrlId);
      continue;
    }
    const newId = randomUUID();
    toCreate53.push({
      id: newId,
      packageId: pkg53.id,
      requirementId: ctrlId,
      familyCode: meta.family,
      familyName: meta.familyName,
      title: meta.title,
      sortOrder: getSortOrder(ctrlId),
      isActive: true,
      sourceReference: "NIST SP 800-53 Rev. 4",
    });
    req53Map[ctrlId] = newId;
  }

  if (unknownControls.length > 0) {
    console.warn(`  WARNING: No catalog entry for these controls (skipped): ${unknownControls.join(", ")}`);
  }
  console.log(`800-53 R4 controls to CREATE: ${toCreate53.length}`);
  if (toCreate53.length > 0 && isDryRun) {
    for (const r of toCreate53) console.log(`    + ${r.requirementId} — ${r.title}`);
  }

  // ── 5. Determine crosswalk rows to create ────────────────────────────────────
  // Load existing crosswalk rows between these two packages
  const all171Ids = Object.values(req171Map);
  const all53Ids  = Object.values(req53Map);

  let existingCw: Array<{ sourceRequirementId: string; targetRequirementId: string }> = [];
  if (all171Ids.length > 0 && all53Ids.length > 0) {
    existingCw = await db
      .select({
        sourceRequirementId: requirementCrosswalkTable.sourceRequirementId,
        targetRequirementId: requirementCrosswalkTable.targetRequirementId,
      })
      .from(requirementCrosswalkTable)
      .where(inArray(requirementCrosswalkTable.sourceRequirementId, all171Ids));
  }

  const existingCwSet = new Set(existingCw.map(c => `${c.sourceRequirementId}::${c.targetRequirementId}`));

  const toCreateCw: Array<typeof requirementCrosswalkTable.$inferInsert> = [];

  for (const [req171Key, targetControlIds] of Object.entries(MAPPING)) {
    const srcId = req171Map[req171Key];
    if (!srcId) continue;

    for (const ctrlId of targetControlIds) {
      const tgtId = req53Map[ctrlId];
      if (!tgtId) continue;

      const key = `${srcId}::${tgtId}`;
      if (existingCwSet.has(key)) continue;

      toCreateCw.push({
        id: randomUUID(),
        sourceRequirementId: srcId,
        targetRequirementId: tgtId,
        relationshipType: "derived_from",
        notes: `NIST SP 800-171 Rev. 2 requirement ${req171Key} was derived from 800-53 Rev. 4 source control ${ctrlId}. Source: Appendix D.`,
      });
    }
  }

  const skippedCw = existingCw.filter(
    c => all53Ids.includes(c.targetRequirementId)
  ).length;

  console.log(`Crosswalk rows to CREATE: ${toCreateCw.length}`);
  console.log(`Crosswalk rows already exist (skipped): ${skippedCw}`);

  // ── 6. Unique 800-53 controls referenced ─────────────────────────────────────
  const uniqueTargets = new Set<string>();
  for (const [req171Key, targets] of Object.entries(MAPPING)) {
    if (!req171Map[req171Key]) continue;
    for (const t of targets) if (req53Map[t]) uniqueTargets.add(t);
  }

  const sourceCoverage = Object.keys(MAPPING).filter(k => req171Map[k]).length;
  console.log(`\n--- Summary ---`);
  console.log(`Source 800-171 requirements covered: ${sourceCoverage} / ${Object.keys(MAPPING).length}`);
  console.log(`Unique 800-53 R4 controls referenced: ${uniqueTargets.size}`);
  console.log(`Total mapping relationships: ${toCreateCw.length + skippedCw}`);

  if (isDryRun) {
    console.log(`\n[DRY RUN] No changes written. Re-run without --dry-run to apply.\n`);
    return;
  }

  // ── 7. Apply changes ─────────────────────────────────────────────────────────
  if (toCreate53.length > 0) {
    console.log(`\nCreating ${toCreate53.length} NIST 800-53 R4 requirements...`);
    const BATCH = 50;
    for (let i = 0; i < toCreate53.length; i += BATCH) {
      await db.insert(complianceRequirementsTable).values(toCreate53.slice(i, i + BATCH));
    }
    console.log(`  ✓ Created ${toCreate53.length} requirements`);
  }

  if (toCreateCw.length > 0) {
    console.log(`Creating ${toCreateCw.length} crosswalk rows...`);
    const BATCH = 100;
    for (let i = 0; i < toCreateCw.length; i += BATCH) {
      await db.insert(requirementCrosswalkTable).values(toCreateCw.slice(i, i + BATCH));
    }
    console.log(`  ✓ Created ${toCreateCw.length} crosswalk rows`);
  }

  if (toCreate53.length === 0 && toCreateCw.length === 0) {
    console.log(`\n✓ Nothing to do — all data already seeded.`);
  } else {
    console.log(`\n✓ Seed complete.`);
  }

  process.exit(0);
}

main().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
