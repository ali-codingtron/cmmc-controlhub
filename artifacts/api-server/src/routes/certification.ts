import { Router } from "express";
import {
  db,
  organizationsTable,
  certificationRecordsTable,
  certificationOfficialRecordsTable,
  certificationScopeSnapshotsTable,
  certificationAffirmationsTable,
  certificationChangeImpactTable,
  certificationPoamCloseoutTable,
  certificationRecertificationMilestonesTable,
  certificationHistoryTable,
  monitoringItemsTable,
  evidenceItemsTable,
  poamsTable,
  usersTable,
} from "@workspace/db";
import { eq, and, desc, asc, count, sql } from "drizzle-orm";
import { requireAuth } from "../lib/auth";
import { requireOrg } from "../middleware/org";
import { logAudit } from "../lib/audit";
import { randomUUID } from "crypto";

const router = Router();

// ─── Permission Matrix ──────────────────────────────────────────────────────

const ALL_CERT_PERMS = [
  "certification.view",
  "certification.activate",
  "certification.verify",
  "certification.edit",
  "certification.upload_records",
  "certification.manage_scope",
  "certification.manage_affirmations",
  "certification.manage_sustainment",
  "certification.manage_change_impact",
  "certification.manage_poam_closeout",
  "certification.manage_recertification",
  "certification.download_records",
  "certification.archive",
];

const CERT_PERM_MATRIX: Record<string, string[]> = {
  admin: ALL_CERT_PERMS,
  org_admin: [
    "certification.view",
    "certification.activate",
    "certification.edit",
    "certification.upload_records",
    "certification.manage_scope",
    "certification.manage_affirmations",
    "certification.manage_sustainment",
    "certification.manage_change_impact",
    "certification.manage_poam_closeout",
    "certification.manage_recertification",
    "certification.download_records",
  ],
  compliance_manager: [
    "certification.view",
    "certification.upload_records",
    "certification.manage_scope",
    "certification.manage_affirmations",
    "certification.manage_sustainment",
    "certification.manage_change_impact",
    "certification.manage_poam_closeout",
    "certification.manage_recertification",
    "certification.download_records",
  ],
  reviewer: ["certification.view", "certification.verify", "certification.download_records"],
  executive_viewer: ["certification.view"],
  it_contributor: ["certification.view"],
  assessor: ["certification.view"],
};

function hasCertPerm(orgRole: string, permission: string): boolean {
  return (CERT_PERM_MATRIX[orgRole] ?? []).includes(permission);
}

// ─── CMMC UID validation ────────────────────────────────────────────────────

function validateCmmcUid(uid: string): boolean {
  return /^[A-Z0-9]{10}$/.test(uid.toUpperCase());
}

// ─── Date helpers ────────────────────────────────────────────────────────────

function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function addYears(date: Date, years: number): Date {
  const d = new Date(date);
  d.setFullYear(d.getFullYear() + years);
  return d;
}

// ─── History helper ──────────────────────────────────────────────────────────

async function addCertHistory(opts: {
  certificationRecordId: string;
  organizationId: string;
  eventType: string;
  eventTitle: string;
  description?: string;
  previousState?: string;
  newState?: string;
  performedById?: string;
  performedByName?: string;
  metadata?: Record<string, unknown>;
}) {
  await db.insert(certificationHistoryTable).values({
    id: randomUUID(),
    certificationRecordId: opts.certificationRecordId,
    organizationId: opts.organizationId,
    eventType: opts.eventType,
    eventTitle: opts.eventTitle,
    description: opts.description ?? null,
    previousState: opts.previousState ?? null,
    newState: opts.newState ?? null,
    performedById: opts.performedById ?? null,
    performedByName: opts.performedByName ?? null,
    metadata: opts.metadata ?? {},
    occurredAt: new Date(),
  });
}

// ─── Module state guard ──────────────────────────────────────────────────────

const ACTIVE_STATES = [
  "CONDITIONAL_L2_C3PAO",
  "FINAL_L2_C3PAO",
  "EXPIRED",
  "SUSPENDED",
  "INVALIDATED",
];

async function getOrgCertState(orgId: string): Promise<string> {
  const [org] = await db
    .select({ certificationModuleState: organizationsTable.certificationModuleState })
    .from(organizationsTable)
    .where(eq(organizationsTable.id, orgId))
    .limit(1);
  return org?.certificationModuleState ?? "NOT_AVAILABLE";
}

async function getActiveCertRecord(orgId: string) {
  const [record] = await db
    .select()
    .from(certificationRecordsTable)
    .where(
      and(
        eq(certificationRecordsTable.organizationId, orgId),
        eq(certificationRecordsTable.isArchived, false)
      )
    )
    .orderBy(desc(certificationRecordsTable.createdAt))
    .limit(1);
  return record ?? null;
}

async function requireCertModule(orgId: string, res: any): Promise<boolean> {
  const state = await getOrgCertState(orgId);
  if (!ACTIVE_STATES.includes(state)) {
    res.status(404).json({ error: "Certification module not available for this organization" });
    return false;
  }
  return true;
}

// ─── GET /api/certification/status ──────────────────────────────────────────

router.get("/status", requireAuth, requireOrg, async (req, res) => {
  const orgId = req.orgId!;
  const orgRole = req.orgRole ?? "member";

  if (!hasCertPerm(orgRole, "certification.view")) {
    res.status(403).json({ error: "certification.view permission required" });
    return;
  }

  const state = await getOrgCertState(orgId);

  // Return minimal info for NOT_AVAILABLE / VERIFICATION_PENDING
  if (state === "NOT_AVAILABLE") {
    res.json({ certificationModuleState: state, certificationRecord: null });
    return;
  }

  // VERIFICATION_PENDING: only show to those who can verify or activate
  if (state === "VERIFICATION_PENDING") {
    const canVerify = hasCertPerm(orgRole, "certification.verify") || hasCertPerm(orgRole, "certification.activate");
    if (!canVerify) {
      res.json({ certificationModuleState: state, certificationRecord: null });
      return;
    }
    const record = await getActiveCertRecord(orgId);
    res.json({ certificationModuleState: state, certificationRecord: record });
    return;
  }

  const record = await getActiveCertRecord(orgId);

  // Calculate sustainment health indicators
  const now = new Date();
  let sustainmentHealth = "On Track";

  if (record) {
    const isExpired = record.statusValidThrough && record.statusValidThrough < now;
    const affirmationOverdue = record.nextAffirmationDue && record.nextAffirmationDue < now;
    const closeoutExpired = record.closeoutDeadline && record.closeoutDeadline < now && state === "CONDITIONAL_L2_C3PAO";

    if (isExpired || closeoutExpired) sustainmentHealth = "Expired";
    else if (affirmationOverdue) sustainmentHealth = "At Risk";
    else if (record.nextAffirmationDue && record.nextAffirmationDue < addDays(now, 30)) sustainmentHealth = "Attention Needed";
  }

  res.json({ certificationModuleState: state, certificationRecord: record, sustainmentHealth });
});

// ─── POST /api/certification/initiate ───────────────────────────────────────
// Step 1-3 of activation wizard: submitter creates the pending record.

router.post("/initiate", requireAuth, requireOrg, async (req, res) => {
  const orgId = req.orgId!;
  const orgRole = req.orgRole ?? "member";

  if (!hasCertPerm(orgRole, "certification.activate")) {
    res.status(403).json({ error: "certification.activate permission required" });
    return;
  }

  const currentState = await getOrgCertState(orgId);
  if (!["NOT_AVAILABLE", "EXPIRED"].includes(currentState)) {
    res.status(400).json({ error: "Certification can only be initiated when module is NOT_AVAILABLE or EXPIRED" });
    return;
  }

  const {
    certificationStatus,
    cmmcUid,
    assessmentLevel,
    c3paoName,
    cmmcStatusDate,
    assessmentStartDate,
    assessmentCompletionDate,
    assessmentUniqueId,
    cageCodes,
    assessmentScopeName,
    sspTitle,
    sspVersion,
    sspDate,
    affirmingOfficial,
    internalCertificationOwner,
    assessorNames,
    assessorContactInfo,
    contractReferences,
    notes,
  } = req.body;

  // Validate required fields
  if (!certificationStatus || !["CONDITIONAL_L2_C3PAO", "FINAL_L2_C3PAO"].includes(certificationStatus)) {
    res.status(400).json({ error: "certificationStatus must be CONDITIONAL_L2_C3PAO or FINAL_L2_C3PAO" });
    return;
  }
  if (!cmmcUid || !validateCmmcUid(cmmcUid)) {
    res.status(400).json({ error: "cmmcUid must be exactly 10 alphanumeric characters" });
    return;
  }
  const requiredFields = [
    "assessmentLevel", "c3paoName", "cmmcStatusDate", "assessmentStartDate",
    "assessmentCompletionDate", "assessmentUniqueId", "assessmentScopeName",
    "sspTitle", "sspVersion", "sspDate", "affirmingOfficial", "internalCertificationOwner",
  ];
  for (const field of requiredFields) {
    if (!req.body[field]) {
      res.status(400).json({ error: `${field} is required` });
      return;
    }
  }
  if (!cageCodes || !Array.isArray(cageCodes) || cageCodes.length === 0) {
    res.status(400).json({ error: "At least one CAGE code is required" });
    return;
  }

  const normalizedUid = cmmcUid.toUpperCase().replace(/[^A-Z0-9]/g, "");
  const statusDate = new Date(cmmcStatusDate);
  const id = randomUUID();

  // Calculate validity dates
  const statusValidThrough = certificationStatus === "FINAL_L2_C3PAO"
    ? addYears(statusDate, 3)
    : null;
  const nextAffirmationDue = addYears(statusDate, 1);
  const closeoutDeadline = certificationStatus === "CONDITIONAL_L2_C3PAO"
    ? addDays(statusDate, 180)
    : null;

  await db.insert(certificationRecordsTable).values({
    id,
    organizationId: orgId,
    certificationStatus,
    cmmcUid: normalizedUid,
    assessmentLevel,
    c3paoName,
    cmmcStatusDate: statusDate,
    assessmentStartDate: new Date(assessmentStartDate),
    assessmentCompletionDate: new Date(assessmentCompletionDate),
    assessmentUniqueId,
    cageCodes: Array.isArray(cageCodes) ? cageCodes : [cageCodes],
    assessmentScopeName,
    sspTitle,
    sspVersion,
    sspDate: new Date(sspDate),
    affirmingOfficial,
    internalCertificationOwner,
    assessorNames: assessorNames ?? [],
    assessorContactInfo: assessorContactInfo ?? null,
    contractReferences: contractReferences ?? [],
    notes: notes ?? null,
    moduleState: "VERIFICATION_PENDING",
    submittedById: req.authUser!.id,
    submittedAt: new Date(),
    statusValidThrough,
    nextAffirmationDue,
    closeoutDeadline,
    isActive: true,
    isArchived: false,
  });

  // Set org module state to VERIFICATION_PENDING
  await db
    .update(organizationsTable)
    .set({ certificationModuleState: "VERIFICATION_PENDING", updatedAt: new Date() })
    .where(eq(organizationsTable.id, orgId));

  await addCertHistory({
    certificationRecordId: id,
    organizationId: orgId,
    eventType: "certification_submitted",
    eventTitle: "Certification Record Submitted",
    description: `${certificationStatus === "CONDITIONAL_L2_C3PAO" ? "Conditional" : "Final"} Level 2 (C3PAO) certification record submitted for verification.`,
    previousState: currentState,
    newState: "VERIFICATION_PENDING",
    performedById: req.authUser!.id,
    performedByName: req.authUser!.name,
    metadata: { certificationStatus, c3paoName, cmmcUid: normalizedUid },
  });

  await logAudit(req, "status_changed" as any, "certification_record", id, {
    entityLabel: `Certification Initiated: ${certificationStatus}`,
    previousValue: { state: currentState },
    newValue: { state: "VERIFICATION_PENDING", certificationStatus },
  });

  res.json({ id, certificationModuleState: "VERIFICATION_PENDING" });
});

// ─── POST /api/certification/verify ─────────────────────────────────────────
// Second-person verification (verifier must NOT be the submitter).

router.post("/verify", requireAuth, requireOrg, async (req, res) => {
  const orgId = req.orgId!;
  const orgRole = req.orgRole ?? "member";

  if (!hasCertPerm(orgRole, "certification.verify")) {
    res.status(403).json({ error: "certification.verify permission required" });
    return;
  }

  const currentState = await getOrgCertState(orgId);
  if (currentState !== "VERIFICATION_PENDING") {
    res.status(400).json({ error: "Organization certification is not pending verification" });
    return;
  }

  const record = await getActiveCertRecord(orgId);
  if (!record) {
    res.status(404).json({ error: "No pending certification record found" });
    return;
  }

  // Enforce second-person rule
  if (record.submittedById === req.authUser!.id) {
    res.status(403).json({ error: "The user who submitted the record cannot be the verifier" });
    return;
  }

  const { verificationNotes } = req.body;
  const targetState = record.certificationStatus as string;

  await db
    .update(certificationRecordsTable)
    .set({
      moduleState: targetState,
      verifiedById: req.authUser!.id,
      verifiedAt: new Date(),
      verificationNotes: verificationNotes ?? null,
      updatedAt: new Date(),
    })
    .where(eq(certificationRecordsTable.id, record.id));

  await db
    .update(organizationsTable)
    .set({ certificationModuleState: targetState, updatedAt: new Date() })
    .where(eq(organizationsTable.id, orgId));

  await addCertHistory({
    certificationRecordId: record.id,
    organizationId: orgId,
    eventType: "certification_verified",
    eventTitle: "Certification Verified",
    description: `Certification verified by ${req.authUser!.name}. Module activated.`,
    previousState: "VERIFICATION_PENDING",
    newState: targetState,
    performedById: req.authUser!.id,
    performedByName: req.authUser!.name,
    metadata: { verificationNotes },
  });

  await logAudit(req, "status_changed" as any, "certification_record", record.id, {
    entityLabel: `Certification Verified: ${targetState}`,
    previousValue: { state: "VERIFICATION_PENDING" },
    newValue: { state: targetState },
  });

  res.json({ certificationModuleState: targetState });
});

// ─── POST /api/certification/reject ─────────────────────────────────────────

router.post("/reject", requireAuth, requireOrg, async (req, res) => {
  const orgId = req.orgId!;
  const orgRole = req.orgRole ?? "member";

  if (!hasCertPerm(orgRole, "certification.verify") && orgRole !== "admin") {
    res.status(403).json({ error: "certification.verify permission required" });
    return;
  }

  const currentState = await getOrgCertState(orgId);
  if (currentState !== "VERIFICATION_PENDING") {
    res.status(400).json({ error: "Organization certification is not pending verification" });
    return;
  }

  const record = await getActiveCertRecord(orgId);
  if (!record) {
    res.status(404).json({ error: "No pending certification record found" });
    return;
  }

  if (record.submittedById === req.authUser!.id) {
    res.status(403).json({ error: "The submitter cannot reject their own record" });
    return;
  }

  const { rejectionReason } = req.body;
  if (!rejectionReason) {
    res.status(400).json({ error: "rejectionReason is required" });
    return;
  }

  await db
    .update(certificationRecordsTable)
    .set({
      moduleState: "NOT_AVAILABLE",
      rejectedById: req.authUser!.id,
      rejectedAt: new Date(),
      rejectionReason,
      isActive: false,
      updatedAt: new Date(),
    })
    .where(eq(certificationRecordsTable.id, record.id));

  await db
    .update(organizationsTable)
    .set({ certificationModuleState: "NOT_AVAILABLE", updatedAt: new Date() })
    .where(eq(organizationsTable.id, orgId));

  await addCertHistory({
    certificationRecordId: record.id,
    organizationId: orgId,
    eventType: "certification_rejected",
    eventTitle: "Certification Rejected",
    description: rejectionReason,
    previousState: "VERIFICATION_PENDING",
    newState: "NOT_AVAILABLE",
    performedById: req.authUser!.id,
    performedByName: req.authUser!.name,
    metadata: { rejectionReason },
  });

  res.json({ certificationModuleState: "NOT_AVAILABLE" });
});

// ─── POST /api/certification/admin-override ──────────────────────────────────
// Global admin override of verification step.

router.post("/admin-override", requireAuth, requireOrg, async (req, res) => {
  if (req.authUser?.role !== "admin") {
    res.status(403).json({ error: "Global admin access required" });
    return;
  }

  const orgId = req.orgId!;
  const currentState = await getOrgCertState(orgId);
  if (currentState !== "VERIFICATION_PENDING") {
    res.status(400).json({ error: "Organization certification is not pending verification" });
    return;
  }

  const record = await getActiveCertRecord(orgId);
  if (!record) {
    res.status(404).json({ error: "No pending certification record found" });
    return;
  }

  const { justification } = req.body;
  if (!justification || justification.length < 20) {
    res.status(400).json({ error: "justification is required (minimum 20 characters)" });
    return;
  }

  const targetState = record.certificationStatus as string;

  await db
    .update(certificationRecordsTable)
    .set({
      moduleState: targetState,
      verifiedById: req.authUser!.id,
      verifiedAt: new Date(),
      adminOverrideById: req.authUser!.id,
      adminOverrideJustification: justification,
      updatedAt: new Date(),
    })
    .where(eq(certificationRecordsTable.id, record.id));

  await db
    .update(organizationsTable)
    .set({ certificationModuleState: targetState, updatedAt: new Date() })
    .where(eq(organizationsTable.id, orgId));

  await addCertHistory({
    certificationRecordId: record.id,
    organizationId: orgId,
    eventType: "certification_admin_override",
    eventTitle: "Admin Override — Verification Bypassed",
    description: `Global admin override. Justification: ${justification}`,
    previousState: "VERIFICATION_PENDING",
    newState: targetState,
    performedById: req.authUser!.id,
    performedByName: req.authUser!.name,
    metadata: { justification },
  });

  await logAudit(req, "status_changed" as any, "certification_record", record.id, {
    entityLabel: "Admin Override — Certification Module Activated",
    previousValue: { state: "VERIFICATION_PENDING" },
    newValue: { state: targetState, adminOverride: true, justification },
  });

  res.json({ certificationModuleState: targetState });
});

// ─── GET /api/certification/records ─────────────────────────────────────────
// All certification records for the org (full lifecycle history).

router.get("/records", requireAuth, requireOrg, async (req, res) => {
  const orgId = req.orgId!;
  const orgRole = req.orgRole ?? "member";

  if (!hasCertPerm(orgRole, "certification.view")) {
    res.status(403).json({ error: "certification.view permission required" });
    return;
  }

  if (!(await requireCertModule(orgId, res))) return;

  const records = await db
    .select()
    .from(certificationRecordsTable)
    .where(eq(certificationRecordsTable.organizationId, orgId))
    .orderBy(desc(certificationRecordsTable.createdAt));

  res.json(records);
});

// ─── GET /api/certification/official-records ─────────────────────────────────

router.get("/official-records", requireAuth, requireOrg, async (req, res) => {
  const orgId = req.orgId!;
  const orgRole = req.orgRole ?? "member";

  if (!hasCertPerm(orgRole, "certification.view")) {
    res.status(403).json({ error: "certification.view permission required" });
    return;
  }

  if (!(await requireCertModule(orgId, res))) return;

  const certRecord = await getActiveCertRecord(orgId);
  if (!certRecord) {
    res.json([]);
    return;
  }

  const records = await db
    .select()
    .from(certificationOfficialRecordsTable)
    .where(
      and(
        eq(certificationOfficialRecordsTable.organizationId, orgId),
        eq(certificationOfficialRecordsTable.certificationRecordId, certRecord.id)
      )
    )
    .orderBy(desc(certificationOfficialRecordsTable.createdAt));

  res.json(records);
});

// ─── POST /api/certification/official-records ─────────────────────────────────

router.post("/official-records", requireAuth, requireOrg, async (req, res) => {
  const orgId = req.orgId!;
  const orgRole = req.orgRole ?? "member";

  if (!hasCertPerm(orgRole, "certification.upload_records")) {
    res.status(403).json({ error: "certification.upload_records permission required" });
    return;
  }

  if (!(await requireCertModule(orgId, res))) return;

  const certRecord = await getActiveCertRecord(orgId);
  if (!certRecord) {
    res.status(404).json({ error: "No active certification record found" });
    return;
  }

  const { title, recordType, description, effectiveDate, confidentialityClassification, isRequired } = req.body;

  if (!title || !recordType) {
    res.status(400).json({ error: "title and recordType are required" });
    return;
  }

  const id = randomUUID();
  await db.insert(certificationOfficialRecordsTable).values({
    id,
    certificationRecordId: certRecord.id,
    organizationId: orgId,
    title,
    recordType,
    description: description ?? null,
    effectiveDate: effectiveDate ? new Date(effectiveDate) : null,
    confidentialityClassification: confidentialityClassification ?? "controlled",
    isRequired: isRequired ?? false,
    uploadedById: req.authUser!.id,
    uploadedAt: new Date(),
  });

  await logAudit(req, "uploaded" as any, "certification_official_record", id, {
    entityLabel: title,
    newValue: { recordType, certificationRecordId: certRecord.id },
  });

  res.json({ id });
});

// ─── PATCH /api/certification/official-records/:id ───────────────────────────

router.patch("/official-records/:id", requireAuth, requireOrg, async (req, res) => {
  const orgId = req.orgId!;
  const orgRole = req.orgRole ?? "member";

  if (!hasCertPerm(orgRole, "certification.edit")) {
    res.status(403).json({ error: "certification.edit permission required" });
    return;
  }

  if (!(await requireCertModule(orgId, res))) return;

  const [existing] = await db
    .select()
    .from(certificationOfficialRecordsTable)
    .where(
      and(
        eq(certificationOfficialRecordsTable.id, String(req.params.id)),
        eq(certificationOfficialRecordsTable.organizationId, orgId)
      )
    )
    .limit(1);

  if (!existing) {
    res.status(404).json({ error: "Record not found" });
    return;
  }

  const { status, title, description, effectiveDate, confidentialityClassification } = req.body;

  const updates: Record<string, unknown> = { updatedAt: new Date() };
  if (status !== undefined) updates.status = status;
  if (title !== undefined) updates.title = title;
  if (description !== undefined) updates.description = description;
  if (effectiveDate !== undefined) updates.effectiveDate = new Date(effectiveDate);
  if (confidentialityClassification !== undefined) updates.confidentialityClassification = confidentialityClassification;
  if (status === "archived") {
    updates.archivedById = req.authUser!.id;
    updates.archivedAt = new Date();
  }

  await db
    .update(certificationOfficialRecordsTable)
    .set(updates as any)
    .where(eq(certificationOfficialRecordsTable.id, String(req.params.id)));

  res.json({ success: true });
});

// ─── GET /api/certification/scope ────────────────────────────────────────────

router.get("/scope", requireAuth, requireOrg, async (req, res) => {
  const orgId = req.orgId!;
  const orgRole = req.orgRole ?? "member";

  if (!hasCertPerm(orgRole, "certification.view")) {
    res.status(403).json({ error: "certification.view permission required" });
    return;
  }

  if (!(await requireCertModule(orgId, res))) return;

  const certRecord = await getActiveCertRecord(orgId);
  if (!certRecord) { res.json(null); return; }

  const [snapshot] = await db
    .select()
    .from(certificationScopeSnapshotsTable)
    .where(
      and(
        eq(certificationScopeSnapshotsTable.organizationId, orgId),
        eq(certificationScopeSnapshotsTable.certificationRecordId, certRecord.id)
      )
    )
    .orderBy(desc(certificationScopeSnapshotsTable.createdAt))
    .limit(1);

  res.json(snapshot ?? null);
});

// ─── POST /api/certification/scope ───────────────────────────────────────────

router.post("/scope", requireAuth, requireOrg, async (req, res) => {
  const orgId = req.orgId!;
  const orgRole = req.orgRole ?? "member";

  if (!hasCertPerm(orgRole, "certification.manage_scope")) {
    res.status(403).json({ error: "certification.manage_scope permission required" });
    return;
  }

  if (!(await requireCertModule(orgId, res))) return;

  const certRecord = await getActiveCertRecord(orgId);
  if (!certRecord) {
    res.status(404).json({ error: "No active certification record found" });
    return;
  }

  const {
    scopeName, cageCodes, locations, cuiAssets, securityProtectionAssets,
    contractorRiskManagedAssets, specializedAssets, externalServiceProviders,
    sspVersion, scopeApprovalDate, scopeNotes,
  } = req.body;

  if (!scopeName) {
    res.status(400).json({ error: "scopeName is required" });
    return;
  }

  const id = randomUUID();
  await db.insert(certificationScopeSnapshotsTable).values({
    id,
    certificationRecordId: certRecord.id,
    organizationId: orgId,
    scopeName,
    cageCodes: cageCodes ?? [],
    locations: locations ?? [],
    cuiAssets: cuiAssets ?? [],
    securityProtectionAssets: securityProtectionAssets ?? [],
    contractorRiskManagedAssets: contractorRiskManagedAssets ?? [],
    specializedAssets: specializedAssets ?? [],
    externalServiceProviders: externalServiceProviders ?? [],
    sspVersion: sspVersion ?? null,
    scopeApprovalDate: scopeApprovalDate ? new Date(scopeApprovalDate) : null,
    scopeNotes: scopeNotes ?? null,
    createdById: req.authUser!.id,
  });

  await addCertHistory({
    certificationRecordId: certRecord.id,
    organizationId: orgId,
    eventType: "scope_snapshot_created",
    eventTitle: "Certified Scope Snapshot Created",
    description: `Scope snapshot "${scopeName}" recorded.`,
    performedById: req.authUser!.id,
    performedByName: req.authUser!.name,
  });

  await logAudit(req, "created" as any, "certification_scope_snapshot", id, {
    entityLabel: scopeName,
  });

  res.json({ id });
});

// ─── GET /api/certification/affirmations ─────────────────────────────────────

router.get("/affirmations", requireAuth, requireOrg, async (req, res) => {
  const orgId = req.orgId!;
  const orgRole = req.orgRole ?? "member";

  if (!hasCertPerm(orgRole, "certification.view")) {
    res.status(403).json({ error: "certification.view permission required" });
    return;
  }

  if (!(await requireCertModule(orgId, res))) return;

  const certRecord = await getActiveCertRecord(orgId);
  if (!certRecord) { res.json([]); return; }

  const affirmations = await db
    .select()
    .from(certificationAffirmationsTable)
    .where(
      and(
        eq(certificationAffirmationsTable.organizationId, orgId),
        eq(certificationAffirmationsTable.certificationRecordId, certRecord.id)
      )
    )
    .orderBy(asc(certificationAffirmationsTable.dueDate));

  res.json(affirmations);
});

// ─── POST /api/certification/affirmations ─────────────────────────────────────

router.post("/affirmations", requireAuth, requireOrg, async (req, res) => {
  const orgId = req.orgId!;
  const orgRole = req.orgRole ?? "member";

  if (!hasCertPerm(orgRole, "certification.manage_affirmations")) {
    res.status(403).json({ error: "certification.manage_affirmations permission required" });
    return;
  }

  if (!(await requireCertModule(orgId, res))) return;

  const certRecord = await getActiveCertRecord(orgId);
  if (!certRecord) {
    res.status(404).json({ error: "No active certification record found" });
    return;
  }

  const { affirmationNumber, dueDate, status, affirmingOfficial, notes } = req.body;

  if (!dueDate) {
    res.status(400).json({ error: "dueDate is required" });
    return;
  }

  const id = randomUUID();
  await db.insert(certificationAffirmationsTable).values({
    id,
    certificationRecordId: certRecord.id,
    organizationId: orgId,
    affirmationNumber: affirmationNumber ?? 1,
    dueDate: new Date(dueDate),
    status: status ?? "Not Started",
    affirmingOfficial: affirmingOfficial ?? null,
    notes: notes ?? null,
  });

  res.json({ id });
});

// ─── PATCH /api/certification/affirmations/:id ────────────────────────────────

router.patch("/affirmations/:id", requireAuth, requireOrg, async (req, res) => {
  const orgId = req.orgId!;
  const orgRole = req.orgRole ?? "member";

  if (!hasCertPerm(orgRole, "certification.manage_affirmations")) {
    res.status(403).json({ error: "certification.manage_affirmations permission required" });
    return;
  }

  if (!(await requireCertModule(orgId, res))) return;

  const [existing] = await db
    .select()
    .from(certificationAffirmationsTable)
    .where(
      and(
        eq(certificationAffirmationsTable.id, String(req.params.id)),
        eq(certificationAffirmationsTable.organizationId, orgId)
      )
    )
    .limit(1);

  if (!existing) {
    res.status(404).json({ error: "Affirmation not found" });
    return;
  }

  const allowedFields = ["status", "affirmingOfficial", "submittedDate", "submissionReference", "notes", "dueDate"];
  const updates: Record<string, unknown> = { updatedAt: new Date() };
  for (const f of allowedFields) {
    if (req.body[f] !== undefined) {
      updates[f] = f.endsWith("Date") && req.body[f] ? new Date(req.body[f]) : req.body[f];
    }
  }

  await db
    .update(certificationAffirmationsTable)
    .set(updates as any)
    .where(eq(certificationAffirmationsTable.id, String(req.params.id)));

  await logAudit(req, "updated" as any, "certification_affirmation", String(req.params.id), {
    entityLabel: `Affirmation #${existing.affirmationNumber}`,
    newValue: updates,
  });

  res.json({ success: true });
});

// ─── GET /api/certification/changes ──────────────────────────────────────────

router.get("/changes", requireAuth, requireOrg, async (req, res) => {
  const orgId = req.orgId!;
  const orgRole = req.orgRole ?? "member";

  if (!hasCertPerm(orgRole, "certification.view")) {
    res.status(403).json({ error: "certification.view permission required" });
    return;
  }

  if (!(await requireCertModule(orgId, res))) return;

  const certRecord = await getActiveCertRecord(orgId);
  if (!certRecord) { res.json([]); return; }

  const changes = await db
    .select()
    .from(certificationChangeImpactTable)
    .where(
      and(
        eq(certificationChangeImpactTable.organizationId, orgId),
        eq(certificationChangeImpactTable.certificationRecordId, certRecord.id)
      )
    )
    .orderBy(desc(certificationChangeImpactTable.changeDate));

  res.json(changes);
});

// ─── POST /api/certification/changes ─────────────────────────────────────────

router.post("/changes", requireAuth, requireOrg, async (req, res) => {
  const orgId = req.orgId!;
  const orgRole = req.orgRole ?? "member";

  if (!hasCertPerm(orgRole, "certification.manage_change_impact")) {
    res.status(403).json({ error: "certification.manage_change_impact permission required" });
    return;
  }

  if (!(await requireCertModule(orgId, res))) return;

  const certRecord = await getActiveCertRecord(orgId);
  if (!certRecord) {
    res.status(404).json({ error: "No active certification record found" });
    return;
  }

  const { changeTitle, changeDate, description } = req.body;
  if (!changeTitle || !changeDate || !description) {
    res.status(400).json({ error: "changeTitle, changeDate, and description are required" });
    return;
  }

  const id = randomUUID();
  await db.insert(certificationChangeImpactTable).values({
    id,
    certificationRecordId: certRecord.id,
    organizationId: orgId,
    changeTitle,
    changeDate: new Date(changeDate),
    description,
    systemServiceAffected: req.body.systemServiceAffected ?? null,
    scopeImpact: req.body.scopeImpact ?? null,
    cuiImpact: req.body.cuiImpact ?? null,
    controlsAffected: req.body.controlsAffected ?? [],
    sspUpdateRequired: req.body.sspUpdateRequired ?? false,
    diagramUpdateRequired: req.body.diagramUpdateRequired ?? false,
    providerEspChange: req.body.providerEspChange ?? false,
    cageLocationChange: req.body.cageLocationChange ?? false,
    reassessmentConsidered: req.body.reassessmentConsidered ?? false,
    externalClarificationRequired: req.body.externalClarificationRequired ?? false,
    notes: req.body.notes ?? null,
    createdById: req.authUser!.id,
  });

  res.json({ id });
});

// ─── PATCH /api/certification/changes/:id ─────────────────────────────────────

router.patch("/changes/:id", requireAuth, requireOrg, async (req, res) => {
  const orgId = req.orgId!;
  const orgRole = req.orgRole ?? "member";

  if (!hasCertPerm(orgRole, "certification.manage_change_impact")) {
    res.status(403).json({ error: "certification.manage_change_impact permission required" });
    return;
  }

  if (!(await requireCertModule(orgId, res))) return;

  const [existing] = await db
    .select()
    .from(certificationChangeImpactTable)
    .where(
      and(
        eq(certificationChangeImpactTable.id, String(req.params.id)),
        eq(certificationChangeImpactTable.organizationId, orgId)
      )
    )
    .limit(1);

  if (!existing) {
    res.status(404).json({ error: "Change record not found" });
    return;
  }

  const updatable = [
    "status", "impactDecision", "notes", "changeTitle", "description",
    "systemServiceAffected", "scopeImpact", "cuiImpact",
  ];
  const updates: Record<string, unknown> = { updatedAt: new Date() };
  for (const f of updatable) {
    if (req.body[f] !== undefined) updates[f] = req.body[f];
  }
  if (req.body.impactDecision) {
    updates.decisionOwnerId = req.authUser!.id;
  }

  await db
    .update(certificationChangeImpactTable)
    .set(updates as any)
    .where(eq(certificationChangeImpactTable.id, String(req.params.id)));

  await logAudit(req, "updated" as any, "certification_change_impact", String(req.params.id), {
    entityLabel: existing.changeTitle,
    newValue: updates,
  });

  res.json({ success: true });
});

// ─── GET /api/certification/poam-closeout ─────────────────────────────────────

router.get("/poam-closeout", requireAuth, requireOrg, async (req, res) => {
  const orgId = req.orgId!;
  const orgRole = req.orgRole ?? "member";

  if (!hasCertPerm(orgRole, "certification.view")) {
    res.status(403).json({ error: "certification.view permission required" });
    return;
  }

  if (!(await requireCertModule(orgId, res))) return;

  const certRecord = await getActiveCertRecord(orgId);
  if (!certRecord) { res.json([]); return; }

  const items = await db
    .select()
    .from(certificationPoamCloseoutTable)
    .where(
      and(
        eq(certificationPoamCloseoutTable.organizationId, orgId),
        eq(certificationPoamCloseoutTable.certificationRecordId, certRecord.id)
      )
    )
    .orderBy(asc(certificationPoamCloseoutTable.dueDate));

  res.json({ items, certificationRecord: certRecord });
});

// ─── POST /api/certification/poam-closeout ────────────────────────────────────

router.post("/poam-closeout", requireAuth, requireOrg, async (req, res) => {
  const orgId = req.orgId!;
  const orgRole = req.orgRole ?? "member";

  if (!hasCertPerm(orgRole, "certification.manage_poam_closeout")) {
    res.status(403).json({ error: "certification.manage_poam_closeout permission required" });
    return;
  }

  if (!(await requireCertModule(orgId, res))) return;

  const certRecord = await getActiveCertRecord(orgId);
  if (!certRecord) {
    res.status(404).json({ error: "No active certification record found" });
    return;
  }

  const { title, description, dueDate, milestone, evidenceRequired, notes, linkedPoamId } = req.body;
  if (!title) {
    res.status(400).json({ error: "title is required" });
    return;
  }

  const id = randomUUID();
  await db.insert(certificationPoamCloseoutTable).values({
    id,
    certificationRecordId: certRecord.id,
    organizationId: orgId,
    title,
    description: description ?? null,
    linkedPoamId: linkedPoamId ?? null,
    dueDate: dueDate ? new Date(dueDate) : null,
    milestone: milestone ?? null,
    evidenceRequired: evidenceRequired ?? null,
    notes: notes ?? null,
    createdById: req.authUser!.id,
  });

  res.json({ id });
});

// ─── PATCH /api/certification/poam-closeout/:id ────────────────────────────────

router.patch("/poam-closeout/:id", requireAuth, requireOrg, async (req, res) => {
  const orgId = req.orgId!;
  const orgRole = req.orgRole ?? "member";

  if (!hasCertPerm(orgRole, "certification.manage_poam_closeout")) {
    res.status(403).json({ error: "certification.manage_poam_closeout permission required" });
    return;
  }

  if (!(await requireCertModule(orgId, res))) return;

  const [existing] = await db
    .select()
    .from(certificationPoamCloseoutTable)
    .where(
      and(
        eq(certificationPoamCloseoutTable.id, String(req.params.id)),
        eq(certificationPoamCloseoutTable.organizationId, orgId)
      )
    )
    .limit(1);

  if (!existing) {
    res.status(404).json({ error: "POA&M closeout item not found" });
    return;
  }

  const updatable = ["status", "notes", "title", "description", "milestone", "evidenceRequired", "closeoutResult"];
  const updates: Record<string, unknown> = { updatedAt: new Date() };
  for (const f of updatable) {
    if (req.body[f] !== undefined) updates[f] = req.body[f];
  }
  if (req.body.dueDate !== undefined) updates.dueDate = req.body.dueDate ? new Date(req.body.dueDate) : null;
  if (req.body.scheduledCloseoutAssessmentDate !== undefined) {
    updates.scheduledCloseoutAssessmentDate = req.body.scheduledCloseoutAssessmentDate
      ? new Date(req.body.scheduledCloseoutAssessmentDate) : null;
  }

  await db
    .update(certificationPoamCloseoutTable)
    .set(updates as any)
    .where(eq(certificationPoamCloseoutTable.id, String(req.params.id)));

  res.json({ success: true });
});

// ─── GET /api/certification/recertification ───────────────────────────────────

router.get("/recertification", requireAuth, requireOrg, async (req, res) => {
  const orgId = req.orgId!;
  const orgRole = req.orgRole ?? "member";

  if (!hasCertPerm(orgRole, "certification.view")) {
    res.status(403).json({ error: "certification.view permission required" });
    return;
  }

  if (!(await requireCertModule(orgId, res))) return;

  const certRecord = await getActiveCertRecord(orgId);
  if (!certRecord) { res.json([]); return; }

  const milestones = await db
    .select()
    .from(certificationRecertificationMilestonesTable)
    .where(
      and(
        eq(certificationRecertificationMilestonesTable.organizationId, orgId),
        eq(certificationRecertificationMilestonesTable.certificationRecordId, certRecord.id)
      )
    )
    .orderBy(asc(certificationRecertificationMilestonesTable.sortOrder));

  // Auto-seed standard milestones if none exist and we have an expiry date
  if (milestones.length === 0 && certRecord.statusValidThrough) {
    const expiry = certRecord.statusValidThrough;
    const standardMilestones = [
      { name: "12 Months Before Expiration", monthsBefore: 12, sort: 0 },
      { name: "9 Months Before Expiration", monthsBefore: 9, sort: 1 },
      { name: "6 Months Before Expiration", monthsBefore: 6, sort: 2 },
      { name: "4 Months Before Expiration", monthsBefore: 4, sort: 3 },
      { name: "3 Months Before Expiration", monthsBefore: 3, sort: 4 },
      { name: "2 Months Before Expiration", monthsBefore: 2, sort: 5 },
      { name: "1 Month Before Expiration", monthsBefore: 1, sort: 6 },
      { name: "Assessment Scheduled", monthsBefore: 0, sort: 7 },
      { name: "Assessment Completed", monthsBefore: 0, sort: 8 },
    ];

    const inserts = standardMilestones.map((m) => {
      let dueDate: Date | null = null;
      if (m.monthsBefore > 0) {
        dueDate = new Date(expiry);
        dueDate.setMonth(dueDate.getMonth() - m.monthsBefore);
      }
      return {
        id: randomUUID(),
        certificationRecordId: certRecord.id,
        organizationId: orgId,
        milestoneName: m.name,
        sortOrder: m.sort,
        dueDate,
        status: "not_started",
      };
    });

    await db.insert(certificationRecertificationMilestonesTable).values(inserts);

    const seeded = await db
      .select()
      .from(certificationRecertificationMilestonesTable)
      .where(eq(certificationRecertificationMilestonesTable.certificationRecordId, certRecord.id))
      .orderBy(asc(certificationRecertificationMilestonesTable.sortOrder));

    res.json(seeded);
    return;
  }

  res.json(milestones);
});

// ─── PATCH /api/certification/recertification/:id ─────────────────────────────

router.patch("/recertification/:id", requireAuth, requireOrg, async (req, res) => {
  const orgId = req.orgId!;
  const orgRole = req.orgRole ?? "member";

  if (!hasCertPerm(orgRole, "certification.manage_recertification")) {
    res.status(403).json({ error: "certification.manage_recertification permission required" });
    return;
  }

  if (!(await requireCertModule(orgId, res))) return;

  const [existing] = await db
    .select()
    .from(certificationRecertificationMilestonesTable)
    .where(
      and(
        eq(certificationRecertificationMilestonesTable.id, String(req.params.id)),
        eq(certificationRecertificationMilestonesTable.organizationId, orgId)
      )
    )
    .limit(1);

  if (!existing) {
    res.status(404).json({ error: "Milestone not found" });
    return;
  }

  const updates: Record<string, unknown> = { updatedAt: new Date() };
  if (req.body.status !== undefined) updates.status = req.body.status;
  if (req.body.notes !== undefined) updates.notes = req.body.notes;
  if (req.body.linkedWork !== undefined) updates.linkedWork = req.body.linkedWork;
  if (req.body.dueDate !== undefined) updates.dueDate = req.body.dueDate ? new Date(req.body.dueDate) : null;
  if (req.body.status === "completed") updates.completedAt = new Date();

  await db
    .update(certificationRecertificationMilestonesTable)
    .set(updates as any)
    .where(eq(certificationRecertificationMilestonesTable.id, String(req.params.id)));

  res.json({ success: true });
});

// ─── GET /api/certification/history ──────────────────────────────────────────

router.get("/history", requireAuth, requireOrg, async (req, res) => {
  const orgId = req.orgId!;
  const orgRole = req.orgRole ?? "member";

  if (!hasCertPerm(orgRole, "certification.view")) {
    res.status(403).json({ error: "certification.view permission required" });
    return;
  }

  if (!(await requireCertModule(orgId, res))) return;

  const certRecord = await getActiveCertRecord(orgId);
  if (!certRecord) { res.json([]); return; }

  const history = await db
    .select()
    .from(certificationHistoryTable)
    .where(eq(certificationHistoryTable.organizationId, orgId))
    .orderBy(desc(certificationHistoryTable.occurredAt));

  res.json(history);
});

// ─── GET /api/certification/sustainment ──────────────────────────────────────
// Cross-module sustainment dashboard data — references, not duplicates.

router.get("/sustainment", requireAuth, requireOrg, async (req, res) => {
  const orgId = req.orgId!;
  const orgRole = req.orgRole ?? "member";

  if (!hasCertPerm(orgRole, "certification.view")) {
    res.status(403).json({ error: "certification.view permission required" });
    return;
  }

  if (!(await requireCertModule(orgId, res))) return;

  const certRecord = await getActiveCertRecord(orgId);
  if (!certRecord) { res.json({ certificationRecord: null }); return; }

  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const ninetyDaysOut = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000);

  // Monitoring items overdue (past due date and not current)
  const [monitoringOverdue] = await db
    .select({ value: count() })
    .from(monitoringItemsTable)
    .where(
      and(
        eq(monitoringItemsTable.organizationId, orgId),
        sql`${monitoringItemsTable.nextDue} < now()`,
        sql`${monitoringItemsTable.status} != 'current'`
      )
    );

  // Evidence requiring review
  const [evidencePendingReview] = await db
    .select({ value: count() })
    .from(evidenceItemsTable)
    .where(
      and(
        eq(evidenceItemsTable.organizationId, orgId),
        eq(evidenceItemsTable.status, "pending_review")
      )
    );

  // Open POA&Ms
  const [openPoams] = await db
    .select({ value: count() })
    .from(poamsTable)
    .where(
      and(
        eq(poamsTable.organizationId, orgId),
        eq(poamsTable.status, "open")
      )
    );

  // Affirmation status
  const [nextAffirmation] = await db
    .select()
    .from(certificationAffirmationsTable)
    .where(
      and(
        eq(certificationAffirmationsTable.organizationId, orgId),
        eq(certificationAffirmationsTable.certificationRecordId, certRecord.id)
      )
    )
    .orderBy(asc(certificationAffirmationsTable.dueDate))
    .limit(1);

  // Change impact items open
  const [openChanges] = await db
    .select({ value: count() })
    .from(certificationChangeImpactTable)
    .where(
      and(
        eq(certificationChangeImpactTable.organizationId, orgId),
        eq(certificationChangeImpactTable.certificationRecordId, certRecord.id),
        eq(certificationChangeImpactTable.status, "open")
      )
    );

  // Recertification milestone status
  const [nextMilestone] = await db
    .select()
    .from(certificationRecertificationMilestonesTable)
    .where(
      and(
        eq(certificationRecertificationMilestonesTable.organizationId, orgId),
        eq(certificationRecertificationMilestonesTable.certificationRecordId, certRecord.id),
        eq(certificationRecertificationMilestonesTable.status, "not_started")
      )
    )
    .orderBy(asc(certificationRecertificationMilestonesTable.sortOrder))
    .limit(1);

  res.json({
    certificationRecord: certRecord,
    monitoringOverdue: monitoringOverdue?.value ?? 0,
    evidencePendingReview: evidencePendingReview?.value ?? 0,
    openPoams: openPoams?.value ?? 0,
    openChanges: openChanges?.value ?? 0,
    nextAffirmation: nextAffirmation ?? null,
    nextMilestone: nextMilestone ?? null,
  });
});

export default router;
