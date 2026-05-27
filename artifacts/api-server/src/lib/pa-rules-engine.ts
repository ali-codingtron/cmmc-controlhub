import { randomUUID } from "crypto";
import {
  db,
  paScanRunsTable,
  paScanSnapshotsTable,
  paFindingsTable,
  paEvidenceRecordsTable,
  paEvidenceRequestsTable,
  paRoadmapActionsTable,
  tenantConnectionsTable,
} from "@workspace/db";
import { eq } from "drizzle-orm";
import {
  getGraphTokenForTenant,
  graphGetAll,
  graphGet,
  GraphPermissionError,
  GraphUnavailableError,
} from "./graph-client";
import {
  ASSESSMENT_RULES,
  PACK_DEFINITIONS,
  type RuleEvalInput,
  type MsUser,
  type MsSignIn,
  type MsMfaRegistration,
  type MsCaPolicy,
  type MsDevice,
  type MsAuditLog,
  type MsSecureScore,
} from "../data/assessment-rules";

const USER_SELECT =
  "id,displayName,userPrincipalName,userType,accountEnabled,department,jobTitle,lastSignInDateTime,createdDateTime,assignedLicenses";

async function fetchPack(
  token: string,
  packId: string
): Promise<{ data: RuleEvalInput; error?: string }> {
  try {
    switch (packId) {
      case "identity": {
        const users = await graphGetAll<MsUser>(token, "/users", {
          $select: USER_SELECT,
          $top: "999",
        });
        const guests = users.filter((u) => u.userType === "Guest");
        return { data: { users, guests } };
      }
      case "authentication": {
        const mfaRegistrations = await graphGetAll<MsMfaRegistration>(
          token,
          "/reports/authenticationMethods/userRegistrationDetails",
          { $top: "999" }
        );
        return { data: { mfaRegistrations } };
      }
      case "conditional_access": {
        const resp = await graphGet<{ value: MsCaPolicy[] }>(
          token,
          "/identity/conditionalAccess/policies"
        );
        return { data: { caPolicies: resp.value ?? [] } };
      }
      case "devices": {
        const managedDevices = await graphGetAll<MsDevice>(
          token,
          "/deviceManagement/managedDevices",
          {
            $select:
              "id,displayName,complianceState,managedDeviceOwnerType,operatingSystem,osVersion,lastSyncDateTime,isEncrypted,userPrincipalName,enrolledDateTime",
            $top: "999",
          }
        );
        return { data: { managedDevices } };
      }
      case "audit": {
        const [signIns, auditLogs] = await Promise.all([
          graphGetAll<MsSignIn>(token, "/auditLogs/signIns", {
            $top: "200",
            $orderby: "createdDateTime desc",
          }, 2).catch(() => [] as MsSignIn[]),
          graphGetAll<MsAuditLog>(token, "/auditLogs/directoryAudits", {
            $top: "200",
            $orderby: "activityDateTime desc",
          }, 2).catch(() => [] as MsAuditLog[]),
        ]);
        return { data: { signIns, auditLogs } };
      }
      case "secure_score": {
        const resp = await graphGet<{ value: MsSecureScore[] }>(
          token,
          "/security/secureScores",
          { $top: "1" }
        );
        return { data: { secureScores: resp.value ?? [] } };
      }
      default:
        return { data: {}, error: `Unknown pack: ${packId}` };
    }
  } catch (err) {
    if (err instanceof GraphPermissionError) {
      return { data: {}, error: `Permission denied: ${err.message}` };
    }
    if (err instanceof GraphUnavailableError) {
      return { data: {}, error: `Unavailable: ${err.message}` };
    }
    return { data: {}, error: (err as Error).message };
  }
}

export async function runTenantScan(
  scanRunId: string,
  orgId: string,
  tenantConnectionId: string,
  packs: string[]
): Promise<void> {
  const [conn] = await db
    .select()
    .from(tenantConnectionsTable)
    .where(eq(tenantConnectionsTable.id, tenantConnectionId));

  if (!conn) throw new Error("Tenant connection not found");

  let token: string;
  try {
    token = await getGraphTokenForTenant(conn.microsoftTenantId);
  } catch (err) {
    await db
      .update(paScanRunsTable)
      .set({
        status: "failed",
        errorMessage: (err as Error).message,
        completedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(paScanRunsTable.id, scanRunId));

    await db
      .update(tenantConnectionsTable)
      .set({
        connectionStatus: "error",
        lastFailedScan: new Date(),
        lastFailedReason: (err as Error).message,
        updatedAt: new Date(),
      })
      .where(eq(tenantConnectionsTable.id, tenantConnectionId));
    return;
  }

  await db
    .update(paScanRunsTable)
    .set({ status: "running", startedAt: new Date(), updatedAt: new Date() })
    .where(eq(paScanRunsTable.id, scanRunId));

  const completedPacks: string[] = [];
  const failedPacks: string[] = [];
  const allInput: RuleEvalInput = {};

  for (const packId of packs) {
    const { data, error } = await fetchPack(token, packId);
    if (error) {
      failedPacks.push(packId);
    } else {
      completedPacks.push(packId);
      Object.assign(allInput, data);
    }

    await db.insert(paScanSnapshotsTable).values({
      id: randomUUID(),
      scanRunId,
      organizationId: orgId,
      packId,
      dataType: packId,
      rawData: error ? { error } : (data as Record<string, unknown>),
      summary: error
        ? { status: "failed", error }
        : { status: "collected", keys: Object.keys(data) },
      collectedAt: new Date(),
      createdAt: new Date(),
    });
  }

  const rulesForPacks = ASSESSMENT_RULES.filter((r) => packs.includes(r.packId));

  let passedChecks = 0;
  let failedChecks = 0;
  let warnings = 0;
  let unknowns = 0;
  const findingIds: string[] = [];
  const evidenceIds: string[] = [];
  const requestIds: string[] = [];

  for (const rule of rulesForPacks) {
    let evalResult;
    try {
      evalResult = rule.evaluate(allInput);
    } catch {
      evalResult = {
        result: "unknown" as const,
        observedCondition: "Rule evaluation error",
        expectedCondition: "",
        affectedCount: 0,
        affectedItems: [],
        recommendedRemediation: "",
        suggestedRoadmapAction: "",
        evidenceTitle: rule.name,
        evidenceSummary: "Evaluation error",
      };
    }

    if (evalResult.result === "pass") passedChecks++;
    else if (evalResult.result === "fail" || evalResult.result === "partial") failedChecks++;
    else if (evalResult.result === "unknown") unknowns++;

    const isGap = evalResult.result !== "pass" && evalResult.result !== "not_applicable";

    if (isGap) {
      const findingId = randomUUID();
      findingIds.push(findingId);

      await db.insert(paFindingsTable).values({
        id: findingId,
        scanRunId,
        organizationId: orgId,
        ruleId: rule.id,
        ruleName: rule.name,
        title:
          evalResult.result === "unknown"
            ? `${rule.name} — Data Unavailable`
            : `${rule.name} — ${evalResult.result === "partial" ? "Partial" : "Gap Detected"}`,
        severity: evalResult.result === "unknown" ? "informational" : rule.severity,
        result: evalResult.result,
        packId: rule.packId,
        observedCondition: evalResult.observedCondition,
        expectedCondition: evalResult.expectedCondition,
        affectedCount: evalResult.affectedCount,
        affectedItems: evalResult.affectedItems,
        linkedControlIds: rule.linkedControlIds,
        evidenceSource: "Microsoft Graph",
        recommendedRemediation: evalResult.recommendedRemediation,
        suggestedRoadmapAction: evalResult.suggestedRoadmapAction,
        updatedAt: new Date(),
      });

      if (evalResult.result !== "unknown") {
        warnings++;
        const requestId = randomUUID();
        requestIds.push(requestId);

        await db.insert(paEvidenceRequestsTable).values({
          id: requestId,
          scanRunId,
          organizationId: orgId,
          findingId,
          title: `Upload evidence for: ${rule.name}`,
          instructions: evalResult.recommendedRemediation,
          suggestedFilename: `${rule.id}_${rule.packId}_evidence_YYYY-MM-DD`,
          linkedControlIds: rule.linkedControlIds,
          status: "open",
          updatedAt: new Date(),
        });
      }
    }

    const evidenceId = randomUUID();
    evidenceIds.push(evidenceId);

    await db.insert(paEvidenceRecordsTable).values({
      id: evidenceId,
      scanRunId,
      organizationId: orgId,
      packId: rule.packId,
      title: evalResult.evidenceTitle,
      description: evalResult.evidenceSummary,
      evidenceType: "Tenant Assessment Snapshot",
      source: "Microsoft Graph",
      collectedAt: new Date(),
      dataJson: {
        ruleId: rule.id,
        result: evalResult.result,
        affectedCount: evalResult.affectedCount,
        observedCondition: evalResult.observedCondition,
        collectedAt: new Date().toISOString(),
      },
      linkedControlIds: rule.linkedControlIds,
      status: "draft",
      assessorSummary: evalResult.evidenceSummary,
      updatedAt: new Date(),
    });
  }

  await generateRoadmapActions(scanRunId, orgId, findingIds, rulesForPacks, allInput);

  const finalStatus =
    failedPacks.length > 0 && completedPacks.length > 0
      ? "completed_with_warnings"
      : failedPacks.length === packs.length
      ? "failed"
      : "completed";

  await db
    .update(paScanRunsTable)
    .set({
      status: finalStatus,
      packsCompleted: completedPacks,
      packsFailed: failedPacks,
      completedAt: new Date(),
      totalChecks: rulesForPacks.length,
      passedChecks,
      failedChecks,
      warnings,
      unknowns,
      generatedFindingCount: findingIds.length,
      generatedEvidenceCount: evidenceIds.length,
      generatedEvidenceRequestCount: requestIds.length,
      updatedAt: new Date(),
    })
    .where(eq(paScanRunsTable.id, scanRunId));

  await db
    .update(tenantConnectionsTable)
    .set({
      connectionStatus: "connected",
      lastSuccessfulScan: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(tenantConnectionsTable.id, tenantConnectionId));
}

async function generateRoadmapActions(
  scanRunId: string,
  orgId: string,
  findingIds: string[],
  rules: typeof ASSESSMENT_RULES,
  input: RuleEvalInput
) {
  const actions: {
    category: string;
    title: string;
    description: string;
    priority: number;
    linkedControlIds: string[];
  }[] = [];

  const identityRules = rules.filter((r) => r.packId === "identity");
  const authRules = rules.filter((r) => r.packId === "authentication" || r.packId === "conditional_access");
  const deviceRules = rules.filter((r) => r.packId === "devices");
  const auditRules = rules.filter((r) => r.packId === "audit");
  const scoreRules = rules.filter((r) => r.packId === "secure_score");

  const hasIdentityGaps = identityRules.some((r) => {
    try { const res = r.evaluate(input); return res.result !== "pass"; } catch { return false; }
  });
  const hasAuthGaps = authRules.some((r) => {
    try { const res = r.evaluate(input); return res.result !== "pass"; } catch { return false; }
  });
  const hasDeviceGaps = deviceRules.some((r) => {
    try { const res = r.evaluate(input); return res.result !== "pass"; } catch { return false; }
  });
  const hasAuditGaps = auditRules.some((r) => {
    try { const res = r.evaluate(input); return res.result !== "pass"; } catch { return false; }
  });
  const hasScoreGaps = scoreRules.some((r) => {
    try { const res = r.evaluate(input); return res.result !== "pass"; } catch { return false; }
  });

  if (hasIdentityGaps) {
    actions.push({
      category: "Identity & Access",
      title: "Perform User and Access Review",
      description:
        "Conduct a formal review of all user accounts, guest accounts, and privileged roles. Document the review and remove or disable accounts that are no longer needed.",
      priority: 1,
      linkedControlIds: ["AC.L1-3.1.1", "AC.L1-3.1.2", "IA.L1-3.5.1", "IA.L2-3.5.6"],
    });
  }

  if (hasAuthGaps) {
    actions.push({
      category: "Authentication",
      title: "Configure MFA and Conditional Access Baseline",
      description:
        "Enable and enforce MFA for all users via Conditional Access. Block legacy authentication. Confirm all users are registered for MFA.",
      priority: 1,
      linkedControlIds: ["IA.L2-3.5.3", "IA.L1-3.5.2", "AC.L2-3.1.12", "AC.L2-3.1.13"],
    });
  }

  if (hasDeviceGaps) {
    actions.push({
      category: "Endpoint Management",
      title: "Configure Endpoint Compliance and Device Management",
      description:
        "Ensure all endpoints are enrolled in Intune. Create and assign compliance policies. Block noncompliant devices via Conditional Access.",
      priority: 2,
      linkedControlIds: ["CM.L2-3.4.1", "CM.L2-3.4.2", "CM.L2-3.4.3", "SI.L1-3.14.1"],
    });
  }

  if (hasAuditGaps) {
    actions.push({
      category: "Audit & Logging",
      title: "Configure Logging and Audit Review",
      description:
        "Ensure sign-in and audit logs are retained and reviewed on a scheduled basis. Document review results. Configure SIEM or log alerts if available.",
      priority: 2,
      linkedControlIds: ["AU.L2-3.3.1", "AU.L2-3.3.2", "AU.L2-3.3.5", "AU.L2-3.3.8"],
    });
  }

  if (hasScoreGaps) {
    actions.push({
      category: "Security Posture",
      title: "Run Microsoft Security Baseline Review",
      description:
        "Review all Microsoft Secure Score recommendations. Prioritize identity, device, and data protection improvements with direct CMMC relevance.",
      priority: 3,
      linkedControlIds: ["IA.L2-3.5.3", "CM.L2-3.4.1", "SI.L1-3.14.1"],
    });
  }

  for (const action of actions) {
    await db.insert(paRoadmapActionsTable).values({
      id: randomUUID(),
      scanRunId,
      organizationId: orgId,
      ...action,
      drivingFindings: findingIds,
      status: "open",
      updatedAt: new Date(),
    });
  }
}

export async function testTenantConnection(
  tenantId: string
): Promise<{ success: boolean; error?: string; displayName?: string }> {
  try {
    const token = await getGraphTokenForTenant(tenantId);
    const resp = await graphGet<{ value: { displayName?: string; verifiedDomains?: { name: string; isDefault: boolean }[] }[] }>(
      token,
      "/organization",
      { $top: "1" }
    );
    const org = resp.value?.[0];
    return { success: true, displayName: org?.displayName };
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }
}
