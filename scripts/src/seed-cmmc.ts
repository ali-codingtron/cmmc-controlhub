import { db, domainsTable, controlsTable, controlAssessmentsTable, usersTable } from "@workspace/db";
import bcrypt from "bcryptjs";
import { randomUUID } from "crypto";
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const raw = JSON.parse(readFileSync(resolve(__dirname, "data/cmmc-controls.json"), "utf-8"));
const { domains, controls } = raw as {
  domains: Array<{ id: string; name: string; description: string }>;
  controls: Array<{
    control_id: string;
    title: string;
    description: string;
    level: string;
    domain: string;
    nist_ref?: string;
    assessment_objectives?: string[];
    expected_evidence_types?: string[];
    recommended_review_frequency?: string;
    implementation_guidance?: string;
  }>;
};

async function seed() {
  console.log("Seeding CMMC data...");

  const domainIdMap: Record<string, string> = {};

  for (let i = 0; i < domains.length; i++) {
    const d = domains[i];
    const id = randomUUID();
    domainIdMap[d.id] = id;

    await db
      .insert(domainsTable)
      .values({
        id,
        name: d.name,
        description: d.description,
        sortOrder: i,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .onConflictDoNothing();
  }
  console.log(`Seeded ${domains.length} domains`);

  let controlCount = 0;
  for (let i = 0; i < controls.length; i++) {
    const ctrl = controls[i];
    const domainId = domainIdMap[ctrl.domain];
    if (!domainId) {
      console.warn(`No domain found for code: ${ctrl.domain}`);
      continue;
    }

    const reviewFreq = ctrl.recommended_review_frequency;
    const validFreqs = ["daily", "weekly", "monthly", "quarterly", "semi_annually", "annually", "as_needed"];
    const normalizedFreq = reviewFreq
      ? (reviewFreq.replace(/-/g, "_") as any)
      : "annually";
    const freq = validFreqs.includes(normalizedFreq) ? normalizedFreq : "annually";

    const id = randomUUID();
    await db
      .insert(controlsTable)
      .values({
        id,
        controlId: ctrl.control_id,
        domainId,
        title: ctrl.title,
        description: ctrl.description,
        level: ctrl.level as "L1" | "L2",
        nistRef: ctrl.nist_ref,
        implementationGuidance: ctrl.implementation_guidance,
        recommendedReviewFrequency: freq,
        isActive: true,
        sortOrder: i,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .onConflictDoNothing();

    await db
      .insert(controlAssessmentsTable)
      .values({
        id: randomUUID(),
        controlId: id,
        status: "not_started",
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .onConflictDoNothing();

    controlCount++;
  }
  console.log(`Seeded ${controlCount} controls`);

  const SALT_ROUNDS = 10;

  const users = [
    {
      name: "System Administrator",
      email: "admin@example.com",
      password: "Admin1234!",
      role: "admin" as const,
      title: "IT Administrator",
      department: "Information Technology",
    },
    {
      name: "Compliance Manager",
      email: "compliance@example.com",
      password: "Admin1234!",
      role: "compliance_manager" as const,
      title: "Compliance Manager",
      department: "Compliance",
    },
    {
      name: "Security Reviewer",
      email: "reviewer@example.com",
      password: "Admin1234!",
      role: "reviewer" as const,
      title: "Security Analyst",
      department: "Compliance",
    },
    {
      name: "Assessor",
      email: "assessor@example.com",
      password: "Admin1234!",
      role: "assessor" as const,
      title: "C3PAO Assessor",
      department: "External",
    },
  ];

  for (const u of users) {
    const hash = await bcrypt.hash(u.password, SALT_ROUNDS);
    await db
      .insert(usersTable)
      .values({
        id: randomUUID(),
        name: u.name,
        email: u.email,
        passwordHash: hash,
        role: u.role,
        title: u.title,
        department: u.department,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .onConflictDoNothing();
  }

  console.log("Seeded 4 users. All have password: Admin1234!");
  console.log("  admin@example.com (admin)");
  console.log("  compliance@example.com (compliance_manager)");
  console.log("  reviewer@example.com (reviewer)");
  console.log("  assessor@example.com (assessor)");
  console.log("Seed complete.");
  process.exit(0);
}

seed().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
