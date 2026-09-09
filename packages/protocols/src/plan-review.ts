import { z } from "zod";
import {
  plannerAcceptanceCandidateSchema,
  plannerDraftPublicSchema,
} from "./planner";

export const PLAN_REVIEW_SCHEMA_VERSION = "1.0" as const;
export const PLAN_REVIEW_GET_CURRENT_IPC_CHANNEL =
  "plan-review:get-current" as const;
export const PLAN_REVIEW_LIST_VERSIONS_IPC_CHANNEL =
  "plan-review:list-versions" as const;
export const PLAN_REVIEW_SAVE_VERSION_IPC_CHANNEL =
  "plan-review:save-version" as const;
export const PLAN_REVIEW_APPROVE_IPC_CHANNEL = "plan-review:approve" as const;

const schemaVersion = z.literal(PLAN_REVIEW_SCHEMA_VERSION);
const uuidV7 = z.uuidv7();
const positiveVersion = z.number().int().positive();

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

export const planReviewAcceptanceEditSchema = plannerAcceptanceCandidateSchema
  .omit({ localId: true })
  .extend({ sourceLocalId: z.string().min(1).max(64).optional() })
  .strict();

export const planReviewTaskEditSchema = z
  .object({
    sourceTaskId: uuidV7,
    title: normalizedText(500),
    objective: normalizedText(4_000),
    description: normalizedText(4_000).optional(),
    priority: z.number().int().min(0).max(100),
    acceptanceCriteria: z
      .array(planReviewAcceptanceEditSchema)
      .max(50)
      .superRefine((criteria, context) => {
        const ids = criteria.flatMap(({ sourceLocalId }) =>
          sourceLocalId === undefined ? [] : [sourceLocalId],
        );
        if (new Set(ids).size !== ids.length) {
          context.addIssue({
            code: "custom",
            message: "Acceptance source identities must be unique",
          });
        }
      }),
  })
  .strict();

export const planReviewDependencyEditSchema = z
  .object({
    upstreamSourceTaskId: uuidV7,
    downstreamSourceTaskId: uuidV7,
    condition: z.literal("ON_SUCCESS"),
  })
  .strict();

export const planReviewSaveVersionRequestSchema = z
  .object({
    schemaVersion,
    commandId: uuidV7,
    corporationId: uuidV7,
    sourcePlanId: uuidV7,
    expectedPlanVersion: positiveVersion,
    tasks: z.array(planReviewTaskEditSchema).min(1).max(20),
    dependencies: z.array(planReviewDependencyEditSchema).max(200),
  })
  .strict()
  .superRefine((value, context) => {
    const taskIds = value.tasks.map(({ sourceTaskId }) => sourceTaskId);
    if (new Set(taskIds).size !== taskIds.length) {
      context.addIssue({
        code: "custom",
        path: ["tasks"],
        message: "Task source identities must be unique",
      });
    }
  });

export const planReviewApproveRequestSchema = z
  .object({
    schemaVersion,
    commandId: uuidV7,
    corporationId: uuidV7,
    planId: uuidV7,
    expectedPlanVersion: positiveVersion,
  })
  .strict();

export const planReviewGetCurrentRequestSchema = z
  .object({ schemaVersion, corporationId: uuidV7 })
  .strict();

export const planReviewListVersionsRequestSchema = z
  .object({ schemaVersion, corporationId: uuidV7 })
  .strict();

export const planReviewErrorCodeSchema = z.enum([
  "VALIDATION_FAILED",
  "UNAUTHORIZED_CALLER",
  "NOT_FOUND",
  "VERSION_CONFLICT",
  "STATE_CONFLICT",
  "DELETE_BLOCKED",
  "STORAGE_UNAVAILABLE",
]);

export const planReviewErrorMessages = {
  VALIDATION_FAILED: "Plan review request is invalid.",
  UNAUTHORIZED_CALLER: "Plan review request is not allowed.",
  NOT_FOUND: "Plan review resource was not found.",
  VERSION_CONFLICT: "The Plan changed. Reload and retry.",
  STATE_CONFLICT: "The current Plan state does not allow this action.",
  DELETE_BLOCKED: "A retained Task still uses the deleted Task output.",
  STORAGE_UNAVAILABLE: "Plan review storage is unavailable.",
} as const;

export const planReviewFailureSchema = z
  .object({
    ok: z.literal(false),
    error: z
      .object({
        code: planReviewErrorCodeSchema,
        message: z.string(),
        blockingTaskIds: z.array(uuidV7).min(1).max(20).optional(),
      })
      .strict(),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.error.message !== planReviewErrorMessages[value.error.code]) {
      context.addIssue({ code: "custom", message: "Unexpected error message" });
    }
    if (
      (value.error.code === "DELETE_BLOCKED") !==
      (value.error.blockingTaskIds !== undefined)
    ) {
      context.addIssue({
        code: "custom",
        path: ["error", "blockingTaskIds"],
        message: "Delete blocker details mismatch",
      });
    }
  });

export const planReviewItemResultSchema = z.discriminatedUnion("ok", [
  z.object({ ok: z.literal(true), value: plannerDraftPublicSchema }).strict(),
  planReviewFailureSchema,
]);

export const planReviewNullableItemResultSchema = z.discriminatedUnion("ok", [
  z
    .object({ ok: z.literal(true), value: plannerDraftPublicSchema.nullable() })
    .strict(),
  planReviewFailureSchema,
]);

export const planReviewListResultSchema = z.discriminatedUnion("ok", [
  z
    .object({ ok: z.literal(true), value: z.array(plannerDraftPublicSchema) })
    .strict(),
  planReviewFailureSchema,
]);

export type PlanReviewApproveRequest = z.infer<
  typeof planReviewApproveRequestSchema
>;
export type PlanReviewErrorCode = z.infer<typeof planReviewErrorCodeSchema>;
export type PlanReviewFailure = z.infer<typeof planReviewFailureSchema>;
export type PlanReviewGetCurrentRequest = z.infer<
  typeof planReviewGetCurrentRequestSchema
>;
export type PlanReviewItemResult = z.infer<typeof planReviewItemResultSchema>;
export type PlanReviewListResult = z.infer<typeof planReviewListResultSchema>;
export type PlanReviewListVersionsRequest = z.infer<
  typeof planReviewListVersionsRequestSchema
>;
export type PlanReviewNullableItemResult = z.infer<
  typeof planReviewNullableItemResultSchema
>;
export type PlanReviewSaveVersionRequest = z.infer<
  typeof planReviewSaveVersionRequestSchema
>;
