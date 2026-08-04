/**
 * Shared Zod validation schema for CMMC L2 C3PAO certification records.
 * Imported by both the API route (server-side) and the frontend wizard (client-side).
 * No DB imports — pure Zod only.
 */
import { z } from "zod";

// ─── Field label map for human-readable error messages ───────────────────────

const FIELD_LABELS: Record<string, string> = {
  certificationStatus: "Certification status",
  cmmcUid: "CMMC UID",
  assessmentLevel: "Assessment level",
  c3paoName: "C3PAO organization name",
  cmmcStatusDate: "CMMC status date",
  assessmentStartDate: "Assessment start date",
  assessmentCompletionDate: "Assessment completion date",
  assessmentUniqueId: "C3PAO assessment reference number",
  cageCodes: "CAGE codes",
  assessmentScopeName: "Assessment scope name",
  sspTitle: "System Security Plan title",
  sspVersion: "System Security Plan version",
  sspDate: "System Security Plan date",
  affirmingOfficial: "Affirming official",
  internalCertificationOwner: "Internal certification owner",
};

// ─── Helper: date string that parses ─────────────────────────────────────────

const dateString = (label: string) =>
  z
    .string({ required_error: `${label} is required.` })
    .min(1, `${label} is required.`)
    .refine((v) => !isNaN(Date.parse(v)), { message: `${label}: invalid date format.` });

// ─── Main schema ─────────────────────────────────────────────────────────────

export const certificationRecordSchema = z
  .object({
    certificationStatus: z.enum(["CONDITIONAL_L2_C3PAO", "FINAL_L2_C3PAO"], {
      errorMap: () => ({
        message: "Certification status must be CONDITIONAL_L2_C3PAO or FINAL_L2_C3PAO.",
      }),
    }),
    // CMMC UID should be pre-normalized to uppercase before validation.
    cmmcUid: z
      .string({ required_error: "CMMC UID is required." })
      .min(1, "CMMC UID is required.")
      .regex(/^[A-Z0-9]{10}$/, "CMMC UID must contain exactly 10 letters or numbers."),
    assessmentLevel: z
      .string({ required_error: "Assessment level is required." })
      .min(1, "Assessment level is required."),
    c3paoName: z
      .string({ required_error: "C3PAO organization name is required." })
      .min(1, "C3PAO organization name is required."),
    cmmcStatusDate: dateString("CMMC status date"),
    assessmentStartDate: dateString("Assessment start date"),
    assessmentCompletionDate: dateString("Assessment completion date"),
    assessmentUniqueId: z
      .string({ required_error: "C3PAO assessment reference number is required." })
      .min(1, "C3PAO assessment reference number is required."),
    cageCodes: z
      .array(z.string().min(1))
      .min(1, "At least one CAGE code is required."),
    assessmentScopeName: z
      .string({ required_error: "Assessment scope name is required." })
      .min(1, "Assessment scope name is required."),
    sspTitle: z
      .string({ required_error: "System Security Plan title is required." })
      .min(1, "System Security Plan title is required."),
    sspVersion: z
      .string({ required_error: "System Security Plan version is required." })
      .min(1, "System Security Plan version is required."),
    sspDate: dateString("System Security Plan date"),
    affirmingOfficial: z
      .string({ required_error: "Affirming official is required." })
      .min(1, "Affirming official is required."),
    internalCertificationOwner: z
      .string({ required_error: "Internal certification owner is required." })
      .min(1, "Internal certification owner is required."),
    // Optional fields
    assessorNames: z.array(z.string()).optional(),
    assessorContactInfo: z.string().nullable().optional(),
    contractReferences: z.array(z.string()).optional(),
    notes: z.string().nullable().optional(),
    /**
     * Set to true when sspDate > assessmentCompletionDate to confirm the discrepancy
     * is intentional (non-blocking warning acknowledged by the submitter).
     */
    sspDateConfirmed: z.boolean().optional(),
  })
  .superRefine((data, ctx) => {
    const start = new Date(data.assessmentStartDate);
    const completion = new Date(data.assessmentCompletionDate);
    const statusDate = new Date(data.cmmcStatusDate);
    const sspDate = new Date(data.sspDate);
    const now = new Date();

    // start ≤ completion
    if (!isNaN(start.getTime()) && !isNaN(completion.getTime()) && start > completion) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["assessmentCompletionDate"],
        message:
          "Assessment completion date must be on or after the assessment start date.",
      });
    }

    // completion ≤ statusDate
    if (!isNaN(completion.getTime()) && !isNaN(statusDate.getTime()) && completion > statusDate) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["cmmcStatusDate"],
        message:
          "CMMC status date must be on or after the assessment completion date.",
      });
    }

    // Future completionDate is rejected for a completed assessment
    if (!isNaN(completion.getTime()) && completion > now) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["assessmentCompletionDate"],
        message: "Assessment completion date cannot be in the future.",
      });
    }

    // SSP date after completion → require sspDateConfirmed
    if (!isNaN(sspDate.getTime()) && !isNaN(completion.getTime()) && sspDate > completion && !data.sspDateConfirmed) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["sspDate"],
        message:
          "The System Security Plan date is after the assessment completion date. " +
          "Set sspDateConfirmed: true to confirm this is intentional.",
      });
    }
  });

export type CertificationRecordInput = z.infer<typeof certificationRecordSchema>;

// ─── Error formatter ─────────────────────────────────────────────────────────

/**
 * Converts the first Zod issue into a human-readable error string.
 * All error messages in certificationRecordSchema are pre-crafted to be user-friendly,
 * so this simply returns the first issue's message.
 * Never exposes raw camelCase field names or stack traces.
 */
export function formatCertError(issues: z.ZodIssue[]): string {
  if (issues.length === 0) return "Certification record validation failed.";
  return issues[0].message;
}
