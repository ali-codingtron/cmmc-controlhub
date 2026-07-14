import { Router } from "express";
import {
  db,
  controlsTable,
  controlAssessmentsTable,
  domainsTable,
  evidenceItemsTable,
  evidenceControlLinksTable,
  usersTable,
  poamsTable,
  auditLogsTable,
} from "@workspace/db";
import { eq, and, or, ilike, desc } from "drizzle-orm";
import { requireAuth } from "../lib/auth";
import { requireOrg } from "../middleware/org";
import { logAudit } from "../lib/audit";

const router = Router();

router.get("/assessor/controls", requireAuth, requireOrg, async (req, res) => {
  const { domain, level, search } = req.query as Record<string, string>;
  const orgId = req.orgId;

  const controls = await db
    .select({
      id: controlsTable.id,
      controlId: controlsTable.controlId,
      domainId: controlsTable.domainId,
      domainName: domainsTable.name,
      title: controlsTable.title,
      description: controlsTable.description,
      level: controlsTable.level,
      nistRef: controlsTable.nistRef,
      status: controlAssessmentsTable.status,
      implementationNarrative: controlAssessmentsTable.implementationNarrative,
      lastAssessedAt: controlAssessmentsTable.lastAssessedAt,
    })
    .from(controlsTable)
    .leftJoin(domainsTable, eq(domainsTable.id, controlsTable.domainId))
    .leftJoin(
      controlAssessmentsTable,
      and(
        eq(controlAssessmentsTable.controlId, controlsTable.id),
        orgId ? eq(controlAssessmentsTable.organizationId, orgId) : undefined
      )
    )
    .where(
      and(
        eq(controlsTable.isActive, true),
        or(
          eq(controlAssessmentsTable.status, "implemented"),
          eq(controlAssessmentsTable.status, "assessor_ready")
        ),
        domain ? eq(controlsTable.domainId, domain) : undefined,
        level ? eq(controlsTable.level, level as any) : undefined,
        search
          ? or(
              ilike(controlsTable.controlId, `%${search}%`),
              ilike(controlsTable.title, `%${search}%`)
            )
          : undefined
      )
    )
    .orderBy(controlsTable.sortOrder);

  res.json(controls);
});

router.get("/assessor/controls/:id/package", requireAuth, requireOrg, async (req, res) => {
  const orgId = req.orgId;

  const [control] = await db
    .select({
      id: controlsTable.id,
      controlId: controlsTable.controlId,
      domainId: controlsTable.domainId,
      domainName: domainsTable.name,
      title: controlsTable.title,
      description: controlsTable.description,
      level: controlsTable.level,
      nistRef: controlsTable.nistRef,
      implementationGuidance: controlsTable.implementationGuidance,
      status: controlAssessmentsTable.status,
      implementationNarrative: controlAssessmentsTable.implementationNarrative,
      assessorNotes: controlAssessmentsTable.assessorNotes,
      lastAssessedAt: controlAssessmentsTable.lastAssessedAt,
      candidateReadyAt: controlAssessmentsTable.candidateReadyAt,
    })
    .from(controlsTable)
    .leftJoin(domainsTable, eq(domainsTable.id, controlsTable.domainId))
    .leftJoin(
      controlAssessmentsTable,
      and(
        eq(controlAssessmentsTable.controlId, controlsTable.id),
        orgId ? eq(controlAssessmentsTable.organizationId, orgId) : undefined
      )
    )
    .where(eq(controlsTable.id, req.params.id as string))
    .limit(1);

  if (!control) { res.status(404).json({ error: "Not found" }); return; }

  const evidence = await db
    .select({
      id: evidenceItemsTable.id,
      title: evidenceItemsTable.title,
      evidenceType: evidenceItemsTable.evidenceType,
      status: evidenceItemsTable.status,
      fileName: evidenceItemsTable.fileName,
      fileSize: evidenceItemsTable.fileSize,
      version: evidenceItemsTable.version,
      assessorSummary: evidenceItemsTable.assessorSummary,
      collectedAt: evidenceItemsTable.collectedAt,
      approvedAt: evidenceItemsTable.approvedAt,
      expiresAt: evidenceItemsTable.expiresAt,
      ownerName: usersTable.name,
    })
    .from(evidenceControlLinksTable)
    .innerJoin(evidenceItemsTable, eq(evidenceItemsTable.id, evidenceControlLinksTable.evidenceId))
    .leftJoin(usersTable, eq(usersTable.id, evidenceItemsTable.ownerId))
    .where(
      and(
        eq(evidenceControlLinksTable.controlId, req.params.id as string),
        or(eq(evidenceItemsTable.status, "approved"), eq(evidenceItemsTable.status, "assessor_ready")),
        orgId ? eq(evidenceItemsTable.organizationId, orgId) : undefined
      )
    );

  const poams = await db
    .select()
    .from(poamsTable)
    .where(
      and(
        eq(poamsTable.linkedControlId, req.params.id as string),
        orgId ? eq(poamsTable.organizationId, orgId) : undefined
      )
    );

  const history = await db
    .select()
    .from(auditLogsTable)
    .where(
      and(
        eq(auditLogsTable.entityType, "control"),
        eq(auditLogsTable.entityId, req.params.id as string),
        orgId ? eq(auditLogsTable.organizationId, orgId) : undefined
      )
    )
    .orderBy(desc(auditLogsTable.timestamp))
    .limit(20);

  await logAudit(req, "downloaded", "control", req.params.id as string, { entityLabel: control.controlId });

  res.json({ ...control, evidence, poams, history });
});

router.post("/assessor/controls/:id/export", requireAuth, requireOrg, async (req, res) => {
  res.json({ message: "Export queued", controlId: req.params.id as string });
});

router.post("/assessor/domains/:id/export", requireAuth, requireOrg, async (req, res) => {
  res.json({ message: "Export queued", domainId: req.params.id as string });
});

router.post("/assessor/export-full", requireAuth, requireOrg, async (req, res) => {
  res.json({ message: "Full export queued" });
});

export default router;
