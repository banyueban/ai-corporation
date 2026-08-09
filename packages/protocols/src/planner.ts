import { z } from "zod";
import { normalizedUsageSchema } from "./provider-generation";

export const PLANNER_SCHEMA_VERSION = "1.0" as const;
export const PLANNER_START_IPC_CHANNEL = "planner:start" as const;
export const PLANNER_CANCEL_IPC_CHANNEL = "planner:cancel" as const;
export const PLANNER_GET_CURRENT_IPC_CHANNEL = "planner:get-current" as const;

const schemaVersion = z.literal(PLANNER_SCHEMA_VERSION);
const uuidV7 = z.uuidv7();
const positiveVersion = z.number().int().positive();
const utcTimestamp = z.iso.datetime({ offset: false });

function normalizedText(maxCodePoints: number) {
  return z
    .string()
    .transform((value) => value.normalize("NFC").trim())
    .pipe(
      z
        .string()
        .min(1)
        .refine((value) => Array.from(value).length <= maxCodePoints)
        .refine((value) => !/\p{Cc}/u.test(value)),
    );
}

const itemText = normalizedText(500);
const summaryText = normalizedText(4_000);
const localId = z
  .string()
  .regex(/^[a-z][a-z0-9-]{0,63}$/u)
  .transform((value) => value.normalize("NFC"));
const mediaType = z
  .string()
  .min(1)
  .max(255)
  .regex(/^[a-z0-9!#$&^_.+-]+\/[a-z0-9!#$&^_.+-]+$/u);
const catalogName = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[a-z][a-z0-9._-]*$/u);

const uniqueTextList = z
  .array(itemText)
  .max(50)
  .superRefine((values, context) => {
    if (new Set(values).size !== values.length) {
      context.addIssue({ code: "custom", message: "Values must be unique" });
    }
  });

export const plannerCapabilityCandidateSchema = z
  .object({
    path: catalogName,
    minimumLevel: z.number().min(0).max(1),
    mandatory: z.boolean(),
  })
  .strict();

export const plannerInputCandidateSchema = z
  .object({
    source: z.enum(["GOAL_CONTRACT", "TASK_OUTPUT"]),
    taskLocalId: localId.optional(),
    logicalName: itemText,
    mediaType: mediaType.optional(),
    required: z.boolean(),
  })
  .strict()
  .superRefine((value, context) => {
    if (
      (value.source === "TASK_OUTPUT") !==
      (value.taskLocalId !== undefined)
    ) {
      context.addIssue({
        code: "custom",
        path: ["taskLocalId"],
        message: "Task output inputs require one local task reference",
      });
    }
  });

export const plannerOutputCandidateSchema = z
  .object({
    logicalName: itemText,
    mediaType,
    required: z.boolean(),
    description: itemText,
  })
  .strict();

export const plannerAcceptanceCandidateSchema = z
  .object({
    localId,
    description: itemText,
    severity: z.enum(["REQUIRED", "RECOMMENDED"]),
    evidenceRequired: uniqueTextList,
  })
  .strict();

const plannerBudgetCandidateSchema = z
  .object({
    maxInputTokens: z.number().int().nonnegative().optional(),
    maxOutputTokens: z.number().int().nonnegative().optional(),
    maxCostMicros: z.string().regex(/^\d+$/u).optional(),
    maxDurationMs: z.number().int().nonnegative().optional(),
  })
  .strict();

const plannerRetryPolicyCandidateSchema = z
  .object({
    maxAttempts: z.number().int().min(1).max(10),
    maxEvaluationRevisions: z.number().int().min(0).max(10),
    retryableCategories: z.array(catalogName).max(20),
  })
  .strict();

const plannerPermissionHintsSchema = z
  .object({
    workspaceRead: z.boolean(),
    workspaceWrite: uniqueTextList,
    processProfiles: z.array(catalogName).max(20),
  })
  .strict();

export const plannerTaskCandidateSchema = z
  .object({
    localId,
    title: itemText,
    objective: summaryText,
    description: summaryText.optional(),
    kind: z.enum([
      "ANALYSIS",
      "GENERATION",
      "TRANSFORMATION",
      "VALIDATION",
      "HUMAN_DECISION",
    ]),
    priority: z.number().int().min(0).max(100),
    riskLevel: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]),
    suggestedRole: itemText,
    requiredCapabilities: z.array(plannerCapabilityCandidateSchema).max(20),
    requiredTools: z.array(catalogName).max(20),
    inputs: z.array(plannerInputCandidateSchema).max(50),
    expectedOutputs: z.array(plannerOutputCandidateSchema).max(50),
    acceptanceCriteria: z.array(plannerAcceptanceCandidateSchema).max(50),
    budget: plannerBudgetCandidateSchema,
    retryPolicy: plannerRetryPolicyCandidateSchema,
    permissionHints: plannerPermissionHintsSchema,
    assumptions: uniqueTextList,
    nonGoals: uniqueTextList,
  })
  .strict();

export const plannerDependencyCandidateSchema = z
  .object({
    upstreamLocalId: localId,
    downstreamLocalId: localId,
    condition: z.literal("ON_SUCCESS"),
  })
  .strict();

export const plannerMilestoneCandidateSchema = z
  .object({ title: itemText, taskLocalIds: z.array(localId).max(50) })
  .strict();

export const plannerRiskCandidateSchema = z
  .object({
    description: itemText,
    level: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]),
    mitigation: itemText,
  })
  .strict();

export const plannerDraftCandidateSchema = z
  .object({
    schemaVersion,
    summary: summaryText,
    tasks: z.array(plannerTaskCandidateSchema).min(1).max(50),
    dependencies: z.array(plannerDependencyCandidateSchema).max(200),
    milestones: z.array(plannerMilestoneCandidateSchema).max(50),
    assumptions: uniqueTextList,
    risks: z.array(plannerRiskCandidateSchema).max(50),
  })
  .strict();

export const plannerTaskDraftPublicSchema = plannerTaskCandidateSchema.extend({
  id: uuidV7,
});

export const plannerDraftPublicSchema = z
  .object({
    schemaVersion,
    planId: uuidV7,
    corporationId: uuidV7,
    planVersion: positiveVersion,
    goalVersion: positiveVersion,
    status: z.literal("DRAFT"),
    validationStatus: z.literal("PENDING"),
    summary: summaryText,
    tasks: z.array(plannerTaskDraftPublicSchema).min(1).max(50),
    dependencies: z.array(plannerDependencyCandidateSchema).max(200),
    milestones: z.array(plannerMilestoneCandidateSchema).max(50),
    assumptions: uniqueTextList,
    risks: z.array(plannerRiskCandidateSchema).max(50),
    provider: z
      .object({
        providerId: uuidV7,
        providerVersion: positiveVersion,
        model: z.string().min(1).max(512),
      })
      .strict(),
    usage: normalizedUsageSchema,
    createdAt: utcTimestamp,
  })
  .strict();

export const plannerOperationStatusSchema = z.enum([
  "GENERATING",
  "PLAN_SAVED",
  "FAILED",
  "CANCELLED",
  "INTERRUPTED",
]);

export const plannerFailureReasonSchema = z.enum([
  "PROVIDER_FAILURE",
  "INVALID_MODEL_OUTPUT",
  "INPUT_TOO_LARGE",
  "PROVIDER_UNAVAILABLE",
  "VERSION_CONFLICT",
  "STORAGE_UNAVAILABLE",
]);

export const plannerOperationPublicSchema = z
  .object({
    schemaVersion,
    operationId: uuidV7,
    corporationId: uuidV7,
    providerId: uuidV7,
    providerVersion: positiveVersion,
    modelId: z.string().min(1).max(512),
    status: plannerOperationStatusSchema,
    version: positiveVersion,
    usage: normalizedUsageSchema,
    failureReason: plannerFailureReasonSchema.optional(),
    plan: plannerDraftPublicSchema.optional(),
    updatedAt: utcTimestamp,
  })
  .strict()
  .superRefine((value, context) => {
    if ((value.status === "PLAN_SAVED") !== (value.plan !== undefined)) {
      context.addIssue({
        code: "custom",
        path: ["plan"],
        message: "Plan state mismatch",
      });
    }
    if ((value.status === "FAILED") !== (value.failureReason !== undefined)) {
      context.addIssue({
        code: "custom",
        path: ["failureReason"],
        message: "Failure state mismatch",
      });
    }
  });

export const plannerStartRequestSchema = z
  .object({
    schemaVersion,
    operationId: uuidV7,
    corporationId: uuidV7,
    expectedCorporationVersion: positiveVersion,
    goalVersion: positiveVersion,
    providerId: uuidV7,
    expectedProviderVersion: positiveVersion,
    modelId: z.string().min(1).max(512),
  })
  .strict();

export const plannerCancelRequestSchema = z
  .object({ schemaVersion, operationId: uuidV7 })
  .strict();

export const plannerGetCurrentRequestSchema = z
  .object({ schemaVersion, corporationId: uuidV7 })
  .strict();

export const plannerErrorCodeSchema = z.enum([
  "VALIDATION_FAILED",
  "UNAUTHORIZED_CALLER",
  "NOT_FOUND",
  "VERSION_CONFLICT",
  "STATE_CONFLICT",
  "PROVIDER_UNAVAILABLE",
  "INPUT_TOO_LARGE",
  "CANCELLED",
  "STORAGE_UNAVAILABLE",
]);

export const plannerErrorMessages = {
  VALIDATION_FAILED: "Planner request is invalid.",
  UNAUTHORIZED_CALLER: "Planner request is not allowed.",
  NOT_FOUND: "Planner resource was not found.",
  VERSION_CONFLICT: "Planning facts changed. Reload and retry.",
  STATE_CONFLICT: "The current state does not allow planning.",
  PROVIDER_UNAVAILABLE: "The selected Provider cannot generate this Plan.",
  INPUT_TOO_LARGE: "The approved Goal is too large for one planning request.",
  CANCELLED: "Plan generation was cancelled.",
  STORAGE_UNAVAILABLE: "Planner storage is unavailable.",
} as const;

export const plannerFailureSchema = z
  .object({
    ok: z.literal(false),
    error: z
      .object({ code: plannerErrorCodeSchema, message: z.string() })
      .strict(),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.error.message !== plannerErrorMessages[value.error.code]) {
      context.addIssue({ code: "custom", message: "Unexpected error message" });
    }
  });

export const plannerItemResultSchema = z.discriminatedUnion("ok", [
  z
    .object({ ok: z.literal(true), value: plannerOperationPublicSchema })
    .strict(),
  plannerFailureSchema,
]);

export const plannerNullableItemResultSchema = z.discriminatedUnion("ok", [
  z
    .object({
      ok: z.literal(true),
      value: plannerOperationPublicSchema.nullable(),
    })
    .strict(),
  plannerFailureSchema,
]);

export type PlannerCancelRequest = z.infer<typeof plannerCancelRequestSchema>;
export type PlannerDraftCandidate = z.infer<typeof plannerDraftCandidateSchema>;
export type PlannerDraftPublic = z.infer<typeof plannerDraftPublicSchema>;
export type PlannerErrorCode = z.infer<typeof plannerErrorCodeSchema>;
export type PlannerFailureReason = z.infer<typeof plannerFailureReasonSchema>;
export type PlannerGetCurrentRequest = z.infer<
  typeof plannerGetCurrentRequestSchema
>;
export type PlannerItemResult = z.infer<typeof plannerItemResultSchema>;
export type PlannerNullableItemResult = z.infer<
  typeof plannerNullableItemResultSchema
>;
export type PlannerOperationPublic = z.infer<
  typeof plannerOperationPublicSchema
>;
export type PlannerStartRequest = z.infer<typeof plannerStartRequestSchema>;
export type PlannerTaskCandidate = z.infer<typeof plannerTaskCandidateSchema>;
