import { Router } from "express";
import {
  db,
  csvImportsTable,
  usersTable,
  tasksTable,
  poamsTable,
  auditLogsTable,
} from "@workspace/db";
import { eq, and, desc } from "drizzle-orm";
import { requireAuth } from "../lib/auth";
import { requireOrg } from "../middleware/org";
import { logAudit } from "../lib/audit";
import { randomUUID } from "crypto";

const router = Router();

// CSV column definitions per import type
const CSV_TEMPLATES: Record<string, string[]> = {
  users: ["name", "email", "role", "department"],
  assets: ["name", "type", "serial_number", "owner", "location", "criticality"],
  systems: ["name", "description", "owner", "classification", "location", "connections"],
  access_reviews: ["user", "system", "access_level", "last_reviewed", "reviewer", "action"],
  training_records: ["user", "training_name", "completed_date", "expiry_date", "score"],
  suppliers: ["name", "contact", "service", "criticality", "contract_end", "last_review"],
  risks: ["title", "description", "likelihood", "impact", "owner", "mitigation", "status"],
  poam_items: ["weakness", "description", "control_id", "severity", "due_date", "milestone", "owner"],
};

// GET /api/csv-imports/templates/:type
// Returns CSV column headers as a downloadable template
router.get("/csv-imports/templates/:type", requireAuth, async (req, res) => {
  const { type } = req.params;
  const headers = CSV_TEMPLATES[type];
  if (!headers) return res.status(404).json({ error: "Unknown import type" });

  res.setHeader("Content-Type", "text/csv");
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="${type}-template.csv"`
  );
  res.send(headers.join(",") + "\r\n");
});

// GET /api/csv-imports
router.get("/csv-imports", requireAuth, requireOrg, async (req, res) => {
  const orgId = req.orgId!;
  const items = await db
    .select({
      id: csvImportsTable.id,
      importType: csvImportsTable.importType,
      fileName: csvImportsTable.fileName,
      rowsTotal: csvImportsTable.rowsTotal,
      rowsImported: csvImportsTable.rowsImported,
      rowsFailed: csvImportsTable.rowsFailed,
      status: csvImportsTable.status,
      errors: csvImportsTable.errors,
      importedById: csvImportsTable.importedById,
      importerName: usersTable.name,
      createdAt: csvImportsTable.createdAt,
    })
    .from(csvImportsTable)
    .leftJoin(usersTable, eq(usersTable.id, csvImportsTable.importedById))
    .where(eq(csvImportsTable.organizationId, orgId))
    .orderBy(desc(csvImportsTable.createdAt))
    .limit(100);

  res.json(items);
});

// POST /api/csv-imports
// Body: { importType, fileName, rows: Array<Record<string,string>> }
router.post("/csv-imports", requireAuth, requireOrg, async (req, res) => {
  const orgId = req.orgId!;
  const userId = req.user!.id;
  const { importType, fileName, rows } = req.body as {
    importType: string;
    fileName: string;
    rows: Record<string, string>[];
  };

  if (!importType || !fileName || !Array.isArray(rows)) {
    return res.status(400).json({ error: "importType, fileName, and rows are required" });
  }

  if (!CSV_TEMPLATES[importType]) {
    return res.status(400).json({ error: "Unknown import type" });
  }

  const importId = randomUUID();

  // Create import record (processing)
  await db.insert(csvImportsTable).values({
    id: importId,
    organizationId: orgId,
    importType: importType as any,
    fileName,
    rowsTotal: rows.length,
    rowsImported: 0,
    rowsFailed: 0,
    status: "processing",
    errors: [],
    importedById: userId,
    updatedAt: new Date(),
  });

  let imported = 0;
  let failed = 0;
  const errors: Array<{ row: number; error: string }> = [];

  // Process rows based on import type
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    try {
      if (importType === "poam_items") {
        if (!row.weakness) throw new Error("Missing 'weakness' field");
        await db.insert(poamsTable).values({
          id: randomUUID(),
          organizationId: orgId,
          title: row.weakness,
          description: row.description || null,
          controlId: row.control_id || null,
          severity: (row.severity as any) || "medium",
          status: "open",
          dueDate: row.due_date ? new Date(row.due_date) : null,
          milestones: row.milestone ? [row.milestone] : [],
          createdByUserId: userId,
          assigneeId: null,
          updatedAt: new Date(),
        });
      } else {
        // For other types, just record the data was received (no dedicated tables yet)
        // Future: insert into assets, systems, suppliers, etc. tables
      }
      imported++;
    } catch (err: any) {
      failed++;
      errors.push({ row: i + 1, error: err.message ?? "Unknown error" });
    }
  }

  await db
    .update(csvImportsTable)
    .set({
      rowsImported: imported,
      rowsFailed: failed,
      status: failed > 0 && imported === 0 ? "failed" : "completed",
      errors: errors as any,
      updatedAt: new Date(),
    })
    .where(eq(csvImportsTable.id, importId));

  await logAudit({
    organizationId: orgId,
    userId,
    action: "csv_import.completed",
    entityType: "csv_import",
    entityId: importId,
    details: { importType, fileName, rowsTotal: rows.length, imported, failed },
  });

  const [result] = await db
    .select()
    .from(csvImportsTable)
    .where(eq(csvImportsTable.id, importId));

  res.status(201).json(result);
});

export default router;
