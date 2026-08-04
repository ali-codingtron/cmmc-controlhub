import { Router, Request, Response, NextFunction } from "express";
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
  organizationPackagesTable,
  certificationRecordSchema,
  formatCertError,
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

// ─── L2 Package Eligibility Middleware ───────────────────────────────────────
// Every certification route requires the org to have an active CMMC L2 package.

async function requireL2CertificationEligible(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const orgId = (req as any).orgId as string | undefined;
  if (!orgId) {
    res.status(400).json({ error: "Organization context required" });
    return;
  }
  const [pkg] = await db
    .select({ id: organizationPackagesTable.id })
    .from(organizationPackagesTable)
    .where(
      and(
        eq(organizationPackagesTable.organizationId, orgId),
        eq(organizationPackagesTable.packageId, "pkg-cmmc-l2-self"),
        eq(organizationPackagesTable.isActive, true)
      )
    )
    .limit(1);
  if (!pkg) {
    res
      .status(404)
      .json({ error: "CMMC Level 2 C3PAO Certification is not available for this organization." });
    return;
  }
  next();
}

// ─── Response helper: add c3paoAssessmentReference alias ─────────────────────
// The DB column is assessmentUniqueId; the API response exposes it as
// c3paoAssessmentReference. The old key is preserved for backward compat.

function mapCertRecord<T extends Record<string, unknown>>(
  record: T
): T & { c3paoAssessmentReference: unknown } {
  return { ...record, c3paoAssessmentReference: record.assessmentUniqueId };
}

// ─── GET /api/certification/status ──────────────────────────────────────────

router.get("/status", requireAuth, requireOrg, requireL2CertificationEligible, async (req, res) => {
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
    res.json({
      certificationModuleState: state,
      certificationRecord: record ? mapCertRecord(record as Record<string, unknown>) : null,
    });
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

  res.json({
    certificationModuleState: state,
    certificationRecord: record ? mapCertRecord(record as Record<string, unknown>) : null,
    sustainmentHealth,
  });
});

// ─── POST /api/certification/initiate ───────────────────────────────────────
// For Platform Global Admins: validates + activates directly (GLOBAL_ADMIN_DIRECT).
// For all other authorized users: creates a VERIFICATION_PENDING record.
// Both paths use the shared certificationRecordSchema for field validation.

router.post("/initiate", requireAuth, requireOrg, requireL2CertificationEligible, async (req, res) => {
  const orgId = req.orgId!;
  const orgRole = req.orgRole ?? "member";
  const isGlobalAdmin = req.authUser!.role === "admin";

  if (!hasCertPerm(orgRole, "certification.activate")) {
    res.status(403).json({ error: "certification.activate permission required" });
    return;
  }

  const currentState = await getOrgCertState(orgId);
  if (!["NOT_AVAILABLE", "EXPIRED"].includes(currentState)) {
    res.status(400).json({
      error: "Certification can only be initiated when the module is in NOT_AVAILABLE or EXPIRED state.",
    });
    return;
  }

  // Normalize CMMC UID to uppercase before running Zod validation
  const bodyForValidation = { ...req.body };
  if (typeof bodyForValidation.cmmcUid === "string") {
    bodyForValidation.cmmcUid = bodyForValidation.cmmcUid
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, "");
  }

  const parseResult = certificationRecordSchema.safeParse(bodyForValidation);
  if (!parseResult.success) {
    res.status(400).json({ error: formatCertError(parseResult.error.issues) });
    return;
  }

  const data = parseResult.data;
  const normalizedUid = data.cmmcUid; // already normalized above
  const statusDate = new Date(data.cmmcStatusDate);
  const id = randomUUID();

  const statusValidThrough =
    data.certificationStatus === "FINAL_L2_C3PAO" ? addYears(statusDate, 3) : null;
  const nextAffirmationDue = addYears(statusDate, 1);
  const closeoutDeadline =
    data.certificationStatus === "CONDITIONAL_L2_C3PAO" ? addDays(statusDate, 180) : null;

  // ── Global Admin Direct Activation ────────────────────────────────────────
  if (isGlobalAdmin) {
    const officialRecords: any[] = Array.isArray(req.body.officialRecords)
      ? req.body.officialRecords
      : [];

    // At least one official record or external reference is required
    if (officialRecords.length === 0) {
      res.status(400).json({
        error:
          "At least one official record or external reference is required before " +
          "activating certification as a Platform Global Admin.",
      });
      return;
    }

    // Validate each record has required fields
    for (const or of officialRecords) {
      if (!or.title || !or.recordType) {
        res.status(400).json({
          error: "Each official record must include a title and record type.",
        });
        return;
      }
    }

    const officialRecordIds: string[] = [];

    await db.transaction(async (tx) => {
      // Insert the certification record (directly active)
      await tx.insert(certificationRecordsTable).values({
        id,
        organizationId: orgId,
        certificationStatus: data.certificationStatus,
        cmmcUid: normalizedUid,
        assessmentLevel: data.assessmentLevel,
        c3paoName: data.c3paoName,
        cmmcStatusDate: statusDate,
        assessmentStartDate: new Date(data.assessmentStartDate),
        assessmentCompletionDate: new Date(data.assessmentCompletionDate),
        assessmentUniqueId: data.assessmentUniqueId ?? "",
        cageCodes: data.cageCodes,
        assessmentScopeName: data.assessmentScopeName,
        sspTitle: data.sspTitle,
        sspVersion: data.sspVersion,
        sspDate: new Date(data.sspDate),
        affirmingOfficial: data.affirmingOfficial,
        internalCertificationOwner: data.internalCertificationOwner,
        assessorNames: data.assessorNames ?? [],
        assessorContactInfo: data.assessorContactInfo ?? null,
        contractReferences: data.contractReferences ?? [],
        notes: data.notes ?? null,
        moduleState: data.certificationStatus, // activated directly — no VERIFICATION_PENDING
        activationMethod: "GLOBAL_ADMIN_DIRECT",
        submittedById: req.authUser!.id,
        submittedAt: new Date(),
        verifiedById: req.authUser!.id,
        verifiedAt: new Date(),
        statusValidThrough,
        nextAffirmationDue,
        closeoutDeadline,
        isActive: true,
        isArchived: false,
      });

      // Insert the official records provided in the request
      for (const or of officialRecords) {
        const orId = randomUUID();
        officialRecordIds.push(orId);
        await tx.insert(certificationOfficialRecordsTable).values({
          id: orId,
          certificationRecordId: id,
          organizationId: orgId,
          title: or.title,
          recordType: or.recordType,
          description: or.description ?? null,
          effectiveDate: or.effectiveDate ? new Date(or.effectiveDate) : null,
          documentDate: or.documentDate ? new Date(or.documentDate) : null,
          issuedBy: or.issuedBy ?? null,
          version: or.version ?? null,
          externalRepositoryName: or.externalRepositoryName ?? null,
          externalDocumentId: or.externalDocumentId ?? null,
          externalUrl: or.externalUrl ?? null,
          isExternalReference: or.isExternalReference ?? false,
          originalFilename: or.originalFilename ?? null,
          confidentialityClassification:
            or.confidentialityClassification ?? "controlled",
          isRequired: or.isRequired ?? false,
          uploadedById: req.authUser!.id,
          uploadedAt: new Date(),
        });
      }

      // Set org module state directly to the certified status
      await tx
        .update(organizationsTable)
        .set({ certificationModuleState: data.certificationStatus, updatedAt: new Date() })
        .where(eq(organizationsTable.id, orgId));
    });

    await addCertHistory({
      certificationRecordId: id,
      organizationId: orgId,
      eventType: "certification_activated_admin_direct",
      eventTitle: "Certification Activated — Global Admin Direct",
      description:
        `${data.certificationStatus === "CONDITIONAL_L2_C3PAO" ? "Conditional" : "Final"} ` +
        "Level 2 (C3PAO) certification activated directly by Platform Global Admin, " +
        "bypassing second-person verification.",
      previousState: currentState,
      newState: data.certificationStatus,
      performedById: req.authUser!.id,
      performedByName: req.authUser!.name,
      metadata: {
        certificationStatus: data.certificationStatus,
        c3paoName: data.c3paoName,
        cmmcUid: normalizedUid,
        activationMethod: "GLOBAL_ADMIN_DIRECT",
        officialRecordCount: officialRecordIds.length,
      },
    });

    await logAudit(req, "activated" as any, "certification_record", id, {
      entityLabel: `Certification Activated: ${data.certificationStatus} (Global Admin Direct)`,
      previousValue: {
        state: currentState,
        actingUser: req.authUser!.email,
        platformRole: req.authUser!.role,
        organization: orgId,
      },
      newValue: {
        state: data.certificationStatus,
        certificationRecordId: id,
        previousStatus: currentState,
        newStatus: data.certificationStatus,
        cmmcUid: normalizedUid,
        officialRecordIds,
        activationMethod: "GLOBAL_ADMIN_DIRECT",
        success: true,
      },
    });

    res.json({
      id,
      certificationModuleState: data.certificationStatus,
      c3paoAssessmentReference: data.assessmentUniqueId,
    });
    return;
  }

  // ── Standard Path: create VERIFICATION_PENDING record ────────────────────
  await db.insert(certificationRecordsTable).values({
    id,
    organizationId: orgId,
    certificationStatus: data.certificationStatus,
    cmmcUid: normalizedUid,
    assessmentLevel: data.assessmentLevel,
    c3paoName: data.c3paoName,
    cmmcStatusDate: statusDate,
    assessmentStartDate: new Date(data.assessmentStartDate),
    assessmentCompletionDate: new Date(data.assessmentCompletionDate),
    assessmentUniqueId: data.assessmentUniqueId ?? "",
    cageCodes: data.cageCodes,
    assessmentScopeName: data.assessmentScopeName,
    sspTitle: data.sspTitle,
    sspVersion: data.sspVersion,
    sspDate: new Date(data.sspDate),
    affirmingOfficial: data.affirmingOfficial,
    internalCertificationOwner: data.internalCertificationOwner,
    assessorNames: data.assessorNames ?? [],
    assessorContactInfo: data.assessorContactInfo ?? null,
    contractReferences: data.contractReferences ?? [],
    notes: data.notes ?? null,
    moduleState: "VERIFICATION_PENDING",
    activationMethod: null,
    submittedById: req.authUser!.id,
    submittedAt: new Date(),
    statusValidThrough,
    nextAffirmationDue,
    closeoutDeadline,
    isActive: true,
    isArchived: false,
  });

  await db
    .update(organizationsTable)
    .set({ certificationModuleState: "VERIFICATION_PENDING", updatedAt: new Date() })
    .where(eq(organizationsTable.id, orgId));

  await addCertHistory({
    certificationRecordId: id,
    organizationId: orgId,
    eventType: "certification_submitted",
    eventTitle: "Certification Record Submitted",
    description:
      `${data.certificationStatus === "CONDITIONAL_L2_C3PAO" ? "Conditional" : "Final"} ` +
      "Level 2 (C3PAO) certification record submitted for verification.",
    previousState: currentState,
    newState: "VERIFICATION_PENDING",
    performedById: req.authUser!.id,
    performedByName: req.authUser!.name,
    metadata: {
      certificationStatus: data.certificationStatus,
      c3paoName: data.c3paoName,
      cmmcUid: normalizedUid,
    },
  });

  await logAudit(req, "status_changed" as any, "certification_record", id, {
    entityLabel: `Certification Submitted: ${data.certificationStatus}`,
    previousValue: {
      state: currentState,
      actingUser: req.authUser!.email,
      platformRole: req.authUser!.role,
      organization: orgId,
    },
    newValue: {
      state: "VERIFICATION_PENDING",
      certificationStatus: data.certificationStatus,
      certificationRecordId: id,
      cmmcUid: normalizedUid,
      success: true,
    },
  });

  res.json({
    id,
    certificationModuleState: "VERIFICATION_PENDING",
    c3paoAssessmentReference: data.assessmentUniqueId,
  });
});

// ─── POST /api/certification/verify ─────────────────────────────────────────
// Activation via second-person review — restricted to Platform Global Admins.
// Org-level roles (including reviewer) cannot transition a record to active status;
// every certification state transition to FINAL/CONDITIONAL requires Global Admin authority.

router.post("/verify", requireAuth, requireOrg, requireL2CertificationEligible, async (req, res) => {
  const orgId = req.orgId!;

  // Only Platform Global Admins can activate a certification record.
  if (req.authUser!.role !== "admin") {
    res.status(403).json({
      error: "Only Platform Global Admins can activate a certification record.",
    });

    await logAudit(req, "status_changed" as any, "certification_record", orgId, {
      entityLabel: "Certification Activation — Unauthorized Attempt",
      previousValue: { actingUser: req.authUser!.email, platformRole: req.authUser!.role },
      newValue: { denied: true, reason: "non-global-admin attempted verify activation" },
    });
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

  const { verificationNotes } = req.body;
  const targetState = record.certificationStatus as string;

  await db
    .update(certificationRecordsTable)
    .set({
      moduleState: targetState,
      verifiedById: req.authUser!.id,
      verifiedAt: new Date(),
      verificationNotes: verificationNotes ?? null,
      activationMethod: "SECOND_PERSON_VERIFIED",
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

  await logAudit(req, "activated" as any, "certification_record", record.id, {
    entityLabel: `Certification Verified and Activated: ${targetState}`,
    previousValue: {
      state: "VERIFICATION_PENDING",
      actingUser: req.authUser!.email,
      platformRole: req.authUser!.role,
      organization: orgId,
    },
    newValue: {
      state: targetState,
      certificationRecordId: record.id,
      previousStatus: "VERIFICATION_PENDING",
      newStatus: targetState,
      cmmcUid: record.cmmcUid,
      activationMethod: "SECOND_PERSON_VERIFIED",
      success: true,
    },
  });

  res.json({ certificationModuleState: targetState });
});

// ─── POST /api/certification/reject ─────────────────────────────────────────

router.post("/reject", requireAuth, requireOrg, requireL2CertificationEligible, async (req, res) => {
  const orgId = req.orgId!;

  // Only Platform Global Admins can reject (and thus reset) a certification submission.
  if (req.authUser!.role !== "admin") {
    res.status(403).json({
      error: "Only Platform Global Admins can reject a certification submission.",
    });

    await logAudit(req, "status_changed" as any, "certification_record", orgId, {
      entityLabel: "Certification Rejection — Unauthorized Attempt",
      previousValue: { actingUser: req.authUser!.email, platformRole: req.authUser!.role },
      newValue: { denied: true, reason: "non-global-admin attempted reject" },
    });
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

router.post("/admin-override", requireAuth, requireOrg, requireL2CertificationEligible, async (req, res) => {
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
      activationMethod: "GLOBAL_ADMIN_DIRECT",
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
    metadata: { justification, activationMethod: "GLOBAL_ADMIN_DIRECT" },
  });

  await logAudit(req, "activated" as any, "certification_record", record.id, {
    entityLabel: "Admin Override — Certification Module Activated",
    previousValue: {
      state: "VERIFICATION_PENDING",
      actingUser: req.authUser!.email,
      platformRole: req.authUser!.role,
      organization: orgId,
    },
    newValue: {
      state: targetState,
      certificationRecordId: record.id,
      previousStatus: "VERIFICATION_PENDING",
      newStatus: targetState,
      cmmcUid: record.cmmcUid,
      activationMethod: "GLOBAL_ADMIN_DIRECT",
      adminOverride: true,
      justification,
      success: true,
    },
  });

  res.json({ certificationModuleState: targetState });
});

// ─── GET /api/certification/records ─────────────────────────────────────────
// All certification records for the org (full lifecycle history).

router.get("/records", requireAuth, requireOrg, requireL2CertificationEligible, async (req, res) => {
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

  res.json(records.map((r) => mapCertRecord(r as Record<string, unknown>)));
});

// ─── GET /api/certification/official-records ─────────────────────────────────

router.get("/official-records", requireAuth, requireOrg, requireL2CertificationEligible, async (req, res) => {
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

router.post("/official-records", requireAuth, requireOrg, requireL2CertificationEligible, async (req, res) => {
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

router.patch("/official-records/:id", requireAuth, requireOrg, requireL2CertificationEligible, async (req, res) => {
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

router.get("/scope", requireAuth, requireOrg, requireL2CertificationEligible, async (req, res) => {
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

router.post("/scope", requireAuth, requireOrg, requireL2CertificationEligible, async (req, res) => {
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

router.get("/affirmations", requireAuth, requireOrg, requireL2CertificationEligible, async (req, res) => {
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

router.post("/affirmations", requireAuth, requireOrg, requireL2CertificationEligible, async (req, res) => {
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

router.patch("/affirmations/:id", requireAuth, requireOrg, requireL2CertificationEligible, async (req, res) => {
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

router.get("/changes", requireAuth, requireOrg, requireL2CertificationEligible, async (req, res) => {
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

router.post("/changes", requireAuth, requireOrg, requireL2CertificationEligible, async (req, res) => {
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

router.patch("/changes/:id", requireAuth, requireOrg, requireL2CertificationEligible, async (req, res) => {
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

router.get("/poam-closeout", requireAuth, requireOrg, requireL2CertificationEligible, async (req, res) => {
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

router.post("/poam-closeout", requireAuth, requireOrg, requireL2CertificationEligible, async (req, res) => {
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

router.patch("/poam-closeout/:id", requireAuth, requireOrg, requireL2CertificationEligible, async (req, res) => {
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

router.get("/recertification", requireAuth, requireOrg, requireL2CertificationEligible, async (req, res) => {
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

router.patch("/recertification/:id", requireAuth, requireOrg, requireL2CertificationEligible, async (req, res) => {
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

router.get("/history", requireAuth, requireOrg, requireL2CertificationEligible, async (req, res) => {
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

router.get("/sustainment", requireAuth, requireOrg, requireL2CertificationEligible, async (req, res) => {
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
