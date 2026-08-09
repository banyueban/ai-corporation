import { z } from "zod";
import {
  goalBudgetSchema,
  goalContractContentInputSchema,
  goalContractPublicSchema,
} from "./goal-contract";
import { normalizedUsageSchema } from "./provider-generation";

export const GOAL_ENGINE_SCHEMA_VERSION = "1.0" as const;
export const GOAL_ENGINE_START_IPC_CHANNEL = "goal-engine:start" as const;
export const GOAL_ENGINE_ANSWER_IPC_CHANNEL = "goal-engine:answer" as const;
export const GOAL_ENGINE_RESOLVE_EXTENSION_IPC_CHANNEL =
  "goal-engine:resolve-extension" as const;
export const GOAL_ENGINE_CANCEL_IPC_CHANNEL = "goal-engine:cancel" as const;
export const GOAL_ENGINE_GET_CURRENT_IPC_CHANNEL =
  "goal-engine:get-current" as const;

const schemaVersion = z.literal(GOAL_ENGINE_SCHEMA_VERSION);
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

const goalText = normalizedText(4_000);
const itemText = normalizedText(500);
const answerText = normalizedText(2_000);

function uniqueList(maximum = 50) {
  return z
    .array(itemText)
    .max(maximum)
    .superRefine((values, context) => {
      if (new Set(values).size !== values.length) {
        context.addIssue({ code: "custom", message: "Values must be unique" });
      }
    });
}

export const goalEngineInputSchema = z
  .object({
    originalGoal: goalText,
    successCriteriaHints: uniqueList().optional(),
    deliverableHints: uniqueList().optional(),
    constraints: uniqueList().optional(),
    outOfScope: uniqueList().optional(),
  })
  .strict();

export const goalEngineQuestionSchema = z
  .object({
    questionId: uuidV7,
    text: itemText,
    impact: z.literal("HIGH"),
  })
  .strict();

export const goalEngineAnswerSchema = z
  .object({ questionId: uuidV7, answer: answerText })
  .strict();

export const goalEngineAnswerRecordSchema = z
  .object({ questionId: uuidV7, question: itemText, answer: answerText })
  .strict();

const modelAssumptionSchema = z
  .object({
    text: itemText,
    impact: z.enum(["LOW", "MEDIUM", "HIGH"]),
    confirmed: z.literal(false),
  })
  .strict();

export const goalEngineModelDraftSchema = z
  .object({
    statement: goalText,
    successCriteria: uniqueList().min(1),
    inScope: uniqueList(),
    outOfScope: uniqueList(),
    constraints: uniqueList(),
    assumptions: z.array(modelAssumptionSchema).max(50),
    deliverables: uniqueList(),
    riskLevel: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]),
    budget: goalBudgetSchema,
    stopConditions: uniqueList(),
  })
  .strict();

const unresolvedQuestionSchema = z
  .object({ text: itemText, impact: z.literal("HIGH") })
  .strict();

export const goalEngineModelOutputSchema = z
  .object({
    draft: goalEngineModelDraftSchema,
    unresolvedQuestions: z
      .array(unresolvedQuestionSchema)
      .max(5)
      .superRefine((questions, context) => {
        const values = questions.map(({ text }) => text);
        if (new Set(values).size !== values.length) {
          context.addIssue({
            code: "custom",
            message: "Questions must be unique",
          });
        }
      }),
  })
  .strict();

const goalModelOutputIssueCodeSchema = z.enum([
  "invalid_type",
  "too_big",
  "too_small",
  "invalid_format",
  "not_multiple_of",
  "unrecognized_keys",
  "invalid_union",
  "invalid_key",
  "invalid_element",
  "invalid_value",
  "custom",
]);

const goalModelOutputIssuePathSchema = z.enum([
  "ROOT",
  "draft",
  "draft.statement",
  "draft.successCriteria",
  "draft.successCriteria.[]",
  "draft.inScope",
  "draft.inScope.[]",
  "draft.outOfScope",
  "draft.outOfScope.[]",
  "draft.constraints",
  "draft.constraints.[]",
  "draft.assumptions",
  "draft.assumptions.[]",
  "draft.assumptions.[].text",
  "draft.assumptions.[].impact",
  "draft.assumptions.[].confirmed",
  "draft.deliverables",
  "draft.deliverables.[]",
  "draft.riskLevel",
  "draft.budget",
  "draft.budget.costLimitMicros",
  "draft.budget.durationLimitMinutes",
  "draft.budget.maxRevisions",
  "draft.stopConditions",
  "draft.stopConditions.[]",
  "unresolvedQuestions",
  "unresolvedQuestions.[]",
  "unresolvedQuestions.[].text",
  "unresolvedQuestions.[].impact",
  "UNKNOWN",
]);

export const goalModelOutputDiagnosticSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("RESPONSE_TOO_LARGE") }).strict(),
  z.object({ kind: z.literal("INVALID_JSON") }).strict(),
  z
    .object({
      kind: z.literal("SCHEMA_INVALID"),
      issues: z
        .array(
          z
            .object({
              code: goalModelOutputIssueCodeSchema,
              path: goalModelOutputIssuePathSchema,
            })
            .strict(),
        )
        .min(1)
        .max(16),
    })
    .strict(),
]);

export const goalEngineStatusSchema = z.enum([
  "GENERATING",
  "CLARIFICATION_REQUIRED",
  "EXTENSION_REQUIRED",
  "GOAL_SAVED",
  "FAILED",
  "CANCELLED",
  "INTERRUPTED",
]);

export const goalEngineFailureReasonSchema = z.enum([
  "PROVIDER_FAILURE",
  "INVALID_MODEL_OUTPUT",
  "WORKSPACE_UNAVAILABLE",
  "PROVIDER_UNAVAILABLE",
  "VERSION_CONFLICT",
  "STORAGE_UNAVAILABLE",
]);

export const goalEngineOperationPublicSchema = z
  .object({
    schemaVersion,
    operationId: uuidV7,
    corporationId: uuidV7,
    providerId: uuidV7,
    providerVersion: positiveVersion,
    modelId: z.string().min(1).max(512),
    status: goalEngineStatusSchema,
    version: positiveVersion,
    cycleNumber: positiveVersion,
    roundInCycle: z.number().int().min(0).max(5),
    questions: z.array(goalEngineQuestionSchema).max(5),
    usage: normalizedUsageSchema,
    failureReason: goalEngineFailureReasonSchema.optional(),
    goal: goalContractPublicSchema.optional(),
    updatedAt: utcTimestamp,
  })
  .strict()
  .superRefine((value, context) => {
    if (
      (value.status === "CLARIFICATION_REQUIRED" ||
        value.status === "EXTENSION_REQUIRED") !==
      value.questions.length > 0
    ) {
      context.addIssue({
        code: "custom",
        path: ["questions"],
        message: "Question state mismatch",
      });
    }
    if ((value.status === "GOAL_SAVED") !== (value.goal !== undefined)) {
      context.addIssue({
        code: "custom",
        path: ["goal"],
        message: "Goal state mismatch",
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

export const goalEngineStartRequestSchema = z
  .object({
    schemaVersion,
    operationId: uuidV7,
    corporationId: uuidV7,
    expectedCorporationVersion: positiveVersion,
    expectedGoalVersion: z.number().int().nonnegative(),
    providerId: uuidV7,
    expectedProviderVersion: positiveVersion,
    input: goalEngineInputSchema,
  })
  .strict();

export const goalEngineAnswerRequestSchema = z
  .object({
    schemaVersion,
    operationId: uuidV7,
    expectedOperationVersion: positiveVersion,
    answers: z.array(goalEngineAnswerSchema).min(1).max(5),
  })
  .strict();

export const goalEngineExtensionDecisionSchema = z.enum([
  "CONTINUE",
  "SAVE_DRAFT",
  "CANCEL",
]);

export const goalEngineResolveExtensionRequestSchema = z
  .object({
    schemaVersion,
    operationId: uuidV7,
    expectedOperationVersion: positiveVersion,
    decision: goalEngineExtensionDecisionSchema,
  })
  .strict();

export const goalEngineCancelRequestSchema = z
  .object({ schemaVersion, operationId: uuidV7 })
  .strict();

export const goalEngineGetCurrentRequestSchema = z
  .object({ schemaVersion, corporationId: uuidV7 })
  .strict();

export const goalEngineErrorCodeSchema = z.enum([
  "VALIDATION_FAILED",
  "UNAUTHORIZED_CALLER",
  "NOT_FOUND",
  "VERSION_CONFLICT",
  "STATE_CONFLICT",
  "INCOMPLETE_ANSWERS",
  "PROVIDER_UNAVAILABLE",
  "CANCELLED",
  "STORAGE_UNAVAILABLE",
]);

export const goalEngineErrorMessages = {
  VALIDATION_FAILED: "Goal analysis request is invalid.",
  UNAUTHORIZED_CALLER: "Goal analysis request is not allowed.",
  NOT_FOUND: "Goal analysis resource was not found.",
  VERSION_CONFLICT: "Goal analysis facts changed. Reload and retry.",
  STATE_CONFLICT: "Goal analysis state does not allow this action.",
  INCOMPLETE_ANSWERS: "All current clarification questions must be answered.",
  PROVIDER_UNAVAILABLE: "The selected Provider cannot analyze this Goal.",
  CANCELLED: "Goal analysis was cancelled.",
  STORAGE_UNAVAILABLE: "Goal analysis storage is unavailable.",
} as const;

export const goalEngineFailureSchema = z
  .object({
    ok: z.literal(false),
    error: z
      .object({ code: goalEngineErrorCodeSchema, message: z.string() })
      .strict(),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.error.message !== goalEngineErrorMessages[value.error.code]) {
      context.addIssue({ code: "custom", message: "Unexpected error message" });
    }
  });

export const goalEngineItemResultSchema = z.discriminatedUnion("ok", [
  z
    .object({ ok: z.literal(true), value: goalEngineOperationPublicSchema })
    .strict(),
  goalEngineFailureSchema,
]);

export const goalEngineNullableItemResultSchema = z.discriminatedUnion("ok", [
  z
    .object({
      ok: z.literal(true),
      value: goalEngineOperationPublicSchema.nullable(),
    })
    .strict(),
  goalEngineFailureSchema,
]);

export const providerGoalContentSchema = goalContractContentInputSchema.refine(
  (value) => value.source === "PROVIDER",
  { message: "Goal source must be PROVIDER" },
);

export type GoalEngineAnswer = z.infer<typeof goalEngineAnswerSchema>;
export type GoalEngineAnswerRecord = z.infer<
  typeof goalEngineAnswerRecordSchema
>;
export type GoalEngineAnswerRequest = z.infer<
  typeof goalEngineAnswerRequestSchema
>;
export type GoalEngineCancelRequest = z.infer<
  typeof goalEngineCancelRequestSchema
>;
export type GoalEngineErrorCode = z.infer<typeof goalEngineErrorCodeSchema>;
export type GoalEngineExtensionDecision = z.infer<
  typeof goalEngineExtensionDecisionSchema
>;
export type GoalEngineFailureReason = z.infer<
  typeof goalEngineFailureReasonSchema
>;
export type GoalEngineGetCurrentRequest = z.infer<
  typeof goalEngineGetCurrentRequestSchema
>;
export type GoalEngineInput = z.infer<typeof goalEngineInputSchema>;
export type GoalEngineItemResult = z.infer<typeof goalEngineItemResultSchema>;
export type GoalEngineModelDraft = z.infer<typeof goalEngineModelDraftSchema>;
export type GoalEngineModelOutput = z.infer<typeof goalEngineModelOutputSchema>;
export type GoalModelOutputDiagnostic = z.infer<
  typeof goalModelOutputDiagnosticSchema
>;
export type GoalEngineNullableItemResult = z.infer<
  typeof goalEngineNullableItemResultSchema
>;
export type GoalEngineOperationPublic = z.infer<
  typeof goalEngineOperationPublicSchema
>;
export type GoalEngineQuestion = z.infer<typeof goalEngineQuestionSchema>;
export type GoalEngineResolveExtensionRequest = z.infer<
  typeof goalEngineResolveExtensionRequestSchema
>;
export type GoalEngineStartRequest = z.infer<
  typeof goalEngineStartRequestSchema
>;
export type GoalEngineStatus = z.infer<typeof goalEngineStatusSchema>;
