import { z } from "zod";

export const PLAN_VALIDATOR_VERSION = "1.0" as const;

export const planValidationIssueCodeSchema = z.enum([
  "TASK_COUNT_EXCEEDED",
  "DUPLICATE_TASK_LOCAL_ID",
  "DUPLICATE_ACCEPTANCE_LOCAL_ID",
  "ACCEPTANCE_EVIDENCE_MISSING",
  "DUPLICATE_OUTPUT_LOGICAL_NAME",
  "UNKNOWN_TASK_REFERENCE",
  "SELF_DEPENDENCY",
  "DUPLICATE_DEPENDENCY",
  "CYCLE_DETECTED",
  "UNKNOWN_MILESTONE_TASK",
  "DUPLICATE_MILESTONE_TASK",
  "TASK_MISSING_REQUIRED_ACCEPTANCE",
  "LEAF_MISSING_REQUIRED_OUTPUT",
  "TASK_OUTPUT_NOT_FOUND",
  "TASK_OUTPUT_NOT_UPSTREAM",
  "TASK_OUTPUT_MEDIA_TYPE_MISMATCH",
  "UNSUPPORTED_MEDIA_TYPE",
  "BUDGET_LIMIT_MISSING",
  "BUDGET_COST_EXCEEDED",
  "BUDGET_DURATION_EXCEEDED",
  "BUDGET_REVISIONS_EXCEEDED",
  "UNKNOWN_CAPABILITY",
  "UNKNOWN_TOOL",
  "UNSAFE_WORKSPACE_PATH",
  "FORBIDDEN_PROCESS_PROFILE",
]);
export const planValidationWarningCodeSchema = z.literal(
  "SINGLE_RUN_SIZE_WARNING",
);

export const planValidationFindingSchema = z
  .object({
    code: z.union([
      planValidationIssueCodeSchema,
      planValidationWarningCodeSchema,
    ]),
    path: z.string().min(1).max(256),
    taskId: z.uuidv7().optional(),
    relatedTaskId: z.uuidv7().optional(),
    logicalName: z.string().min(1).max(500).optional(),
    actual: z.union([z.number().safe(), z.string().max(128)]).optional(),
    limit: z.union([z.number().safe(), z.string().max(128)]).optional(),
  })
  .strict();

export const planValidationReportSchema = z
  .object({
    schemaVersion: z.literal("1.0"),
    validatorVersion: z.literal(PLAN_VALIDATOR_VERSION),
    planId: z.uuidv7(),
    planVersion: z.number().int().positive(),
    status: z.enum(["VALID", "INVALID"]),
    issues: z.array(planValidationFindingSchema).max(200),
    warnings: z.array(planValidationFindingSchema).max(100),
    validatedAt: z.iso.datetime({ offset: false }),
  })
  .strict()
  .superRefine((value, context) => {
    if ((value.status === "VALID") !== (value.issues.length === 0)) {
      context.addIssue({
        code: "custom",
        path: ["issues"],
        message: "Status mismatch",
      });
    }
    if (value.warnings.some(({ code }) => code !== "SINGLE_RUN_SIZE_WARNING")) {
      context.addIssue({
        code: "custom",
        path: ["warnings"],
        message: "Invalid warning",
      });
    }
    if (value.issues.some(({ code }) => code === "SINGLE_RUN_SIZE_WARNING")) {
      context.addIssue({
        code: "custom",
        path: ["issues"],
        message: "Invalid issue",
      });
    }
  });

export type PlanValidationFinding = z.infer<typeof planValidationFindingSchema>;
export type PlanValidationReport = z.infer<typeof planValidationReportSchema>;
