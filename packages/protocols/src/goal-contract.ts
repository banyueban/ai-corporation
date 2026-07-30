import { z } from "zod";

export const GOAL_CONTRACT_SCHEMA_VERSION = "1.0" as const;
export const GOAL_CONTRACT_SAVE_DRAFT_IPC_CHANNEL =
  "goal-contract:save-draft" as const;
export const GOAL_CONTRACT_GET_CURRENT_IPC_CHANNEL =
  "goal-contract:get-current" as const;
export const GOAL_CONTRACT_LIST_VERSIONS_IPC_CHANNEL =
  "goal-contract:list-versions" as const;
export const GOAL_CONTRACT_APPROVE_IPC_CHANNEL =
  "goal-contract:approve" as const;
export const TIMELINE_LIST_IPC_CHANNEL = "timeline:list" as const;

const schemaVersion = z.literal(GOAL_CONTRACT_SCHEMA_VERSION);
const uuidV7 = z.uuidv7();
const positiveVersion = z.number().int().positive();
const utcTimestamp = z.iso.datetime({ offset: false });
const safeNonnegativeInteger = z.number().int().nonnegative().safe();

function normalizedString(maxCodePoints: number) {
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

const goalTextSchema = normalizedString(4_000);
const listItemSchema = normalizedString(500);

function uniqueStringList(minimum = 0) {
  return z
    .array(listItemSchema)
    .min(minimum)
    .max(50)
    .superRefine((values, context) => {
      if (new Set(values).size !== values.length) {
        context.addIssue({
          code: "custom",
          message: "List items must be unique after normalization",
        });
      }
    });
}

export const goalContractStatusSchema = z.enum([
  "DRAFT",
  "APPROVED",
  "SUPERSEDED",
]);
export const goalContractSourceSchema = z.enum(["MANUAL", "MOCK"]);
export const goalRiskLevelSchema = z.enum([
  "LOW",
  "MEDIUM",
  "HIGH",
  "CRITICAL",
]);
export const goalAssumptionImpactSchema = z.enum(["LOW", "MEDIUM", "HIGH"]);

export const goalAssumptionSchema = z
  .object({
    text: listItemSchema,
    impact: goalAssumptionImpactSchema,
    confirmed: z.boolean(),
  })
  .strict();

const assumptionListSchema = z
  .array(goalAssumptionSchema)
  .max(50)
  .superRefine((values, context) => {
    const identities = values.map(
      ({ impact, text }) => `${impact}\u0000${text}`,
    );
    if (new Set(identities).size !== identities.length) {
      context.addIssue({
        code: "custom",
        message: "Assumptions must be unique after normalization",
      });
    }
  });

export const goalBudgetSchema = z
  .object({
    costLimitMicros: safeNonnegativeInteger.optional(),
    durationLimitMinutes: safeNonnegativeInteger.optional(),
    maxRevisions: safeNonnegativeInteger.optional(),
  })
  .strict();

export const goalContractContentInputSchema = z
  .object({
    source: goalContractSourceSchema,
    originalGoal: goalTextSchema,
    statement: goalTextSchema,
    successCriteria: uniqueStringList(1),
    inScope: uniqueStringList(),
    outOfScope: uniqueStringList(),
    constraints: uniqueStringList(),
    assumptions: assumptionListSchema,
    deliverables: uniqueStringList(),
    riskLevel: goalRiskLevelSchema,
    budget: goalBudgetSchema,
    stopConditions: uniqueStringList(),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.source === "MOCK" && value.statement !== value.originalGoal) {
      context.addIssue({
        code: "custom",
        path: ["statement"],
        message: "Mock statement must equal the original goal",
      });
    }
  });

export const goalContractPublicSchema = z
  .object({
    schemaVersion,
    corporationId: uuidV7,
    version: positiveVersion,
    status: goalContractStatusSchema,
    source: goalContractSourceSchema,
    originalGoal: goalTextSchema,
    statement: goalTextSchema,
    successCriteria: uniqueStringList(1),
    inScope: uniqueStringList(),
    outOfScope: uniqueStringList(),
    constraints: uniqueStringList(),
    assumptions: assumptionListSchema,
    deliverables: uniqueStringList(),
    riskLevel: goalRiskLevelSchema,
    budget: goalBudgetSchema,
    stopConditions: uniqueStringList(),
    createdAt: utcTimestamp,
    approvedAt: utcTimestamp.optional(),
  })
  .strict()
  .superRefine((value, context) => {
    if ((value.status === "APPROVED") !== (value.approvedAt !== undefined)) {
      context.addIssue({
        code: "custom",
        path: ["approvedAt"],
        message: "approvedAt must exist only for approved Goal Contracts",
      });
    }
    if (value.source === "MOCK" && value.statement !== value.originalGoal) {
      context.addIssue({
        code: "custom",
        path: ["statement"],
        message: "Mock statement must equal the original goal",
      });
    }
  });

export const goalContractSaveDraftRequestSchema = z
  .object({
    schemaVersion,
    commandId: uuidV7,
    corporationId: uuidV7,
    expectedCorporationVersion: positiveVersion,
    expectedGoalVersion: z.number().int().nonnegative(),
    content: goalContractContentInputSchema,
  })
  .strict();

export const goalContractGetCurrentRequestSchema = z
  .object({
    schemaVersion,
    corporationId: uuidV7,
  })
  .strict();

export const goalContractListVersionsRequestSchema =
  goalContractGetCurrentRequestSchema;

export const goalContractApproveRequestSchema = z
  .object({
    schemaVersion,
    commandId: uuidV7,
    corporationId: uuidV7,
    expectedCorporationVersion: positiveVersion,
    goalVersion: positiveVersion,
  })
  .strict();

export const timelineListRequestSchema = z
  .object({
    schemaVersion,
    corporationId: uuidV7,
    afterCursor: z
      .string()
      .min(1)
      .max(256)
      .regex(/^[A-Za-z0-9_-]+$/u)
      .optional(),
    limit: z.number().int().min(1).max(100).optional(),
  })
  .strict();

export const timelineEventTypeSchema = z.enum([
  "corporation.created",
  "corporation.name.updated",
  "corporation.archived",
  "goal.contract.drafted",
  "goal.contract.approved",
]);

export const timelineSummaryByEventType = {
  "corporation.created": "Corporation created.",
  "corporation.name.updated": "Corporation name updated.",
  "corporation.archived": "Corporation archived.",
  "goal.contract.drafted": "Goal Contract draft saved.",
  "goal.contract.approved": "Goal Contract approved.",
} as const satisfies Record<z.infer<typeof timelineEventTypeSchema>, string>;

export const timelineEventPublicSchema = z
  .object({
    schemaVersion,
    eventId: uuidV7,
    eventType: timelineEventTypeSchema,
    corporationId: uuidV7,
    aggregateVersion: positiveVersion,
    occurredAt: utcTimestamp,
    summary: z.string(),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.summary !== timelineSummaryByEventType[value.eventType]) {
      context.addIssue({
        code: "custom",
        message: "Unexpected timeline summary",
      });
    }
  });

export const timelinePagePublicSchema = z
  .object({
    schemaVersion,
    items: z.array(timelineEventPublicSchema),
    nextCursor: z
      .string()
      .min(1)
      .max(256)
      .regex(/^[A-Za-z0-9_-]+$/u)
      .optional(),
  })
  .strict();

export const goalContractErrorCodeSchema = z.enum([
  "VALIDATION_FAILED",
  "UNAUTHORIZED_CALLER",
  "CORPORATION_NOT_FOUND",
  "VERSION_CONFLICT",
  "STATE_CONFLICT",
  "ASSUMPTION_CONFIRMATION_REQUIRED",
  "COMMAND_CONFLICT",
  "STORAGE_UNAVAILABLE",
]);

export const goalContractErrorMessages = {
  VALIDATION_FAILED: "Goal Contract request is invalid.",
  UNAUTHORIZED_CALLER: "Goal Contract request is not allowed.",
  CORPORATION_NOT_FOUND: "Corporation was not found.",
  VERSION_CONFLICT: "Goal Contract changed. Reload and retry.",
  STATE_CONFLICT: "Corporation state does not allow this Goal Contract action.",
  ASSUMPTION_CONFIRMATION_REQUIRED:
    "High-impact assumptions must be confirmed.",
  COMMAND_CONFLICT: "Goal Contract command conflicts with an earlier request.",
  STORAGE_UNAVAILABLE: "Goal Contract storage is unavailable.",
} as const satisfies Record<GoalContractErrorCode, string>;

export const goalContractFailureSchema = z
  .object({
    ok: z.literal(false),
    error: z
      .object({
        code: goalContractErrorCodeSchema,
        message: z.string(),
      })
      .strict(),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.error.message !== goalContractErrorMessages[value.error.code]) {
      context.addIssue({ code: "custom", message: "Unexpected error message" });
    }
  });

const goalContractSuccessSchema = z
  .object({ ok: z.literal(true), value: goalContractPublicSchema })
  .strict();

export const goalContractItemResultSchema = z.discriminatedUnion("ok", [
  goalContractSuccessSchema,
  goalContractFailureSchema,
]);

export const goalContractNullableItemResultSchema = z.discriminatedUnion("ok", [
  z
    .object({
      ok: z.literal(true),
      value: goalContractPublicSchema.nullable(),
    })
    .strict(),
  goalContractFailureSchema,
]);

export const goalContractListResultSchema = z.discriminatedUnion("ok", [
  z
    .object({ ok: z.literal(true), value: z.array(goalContractPublicSchema) })
    .strict(),
  goalContractFailureSchema,
]);

export const timelineListResultSchema = z.discriminatedUnion("ok", [
  z.object({ ok: z.literal(true), value: timelinePagePublicSchema }).strict(),
  goalContractFailureSchema,
]);

export type GoalAssumption = z.infer<typeof goalAssumptionSchema>;
export type GoalBudget = z.infer<typeof goalBudgetSchema>;
export type GoalContractApproveRequest = z.infer<
  typeof goalContractApproveRequestSchema
>;
export type GoalContractContentInput = z.infer<
  typeof goalContractContentInputSchema
>;
export type GoalContractErrorCode = z.infer<typeof goalContractErrorCodeSchema>;
export type GoalContractFailure = z.infer<typeof goalContractFailureSchema>;
export type GoalContractGetCurrentRequest = z.infer<
  typeof goalContractGetCurrentRequestSchema
>;
export type GoalContractItemResult = z.infer<
  typeof goalContractItemResultSchema
>;
export type GoalContractListResult = z.infer<
  typeof goalContractListResultSchema
>;
export type GoalContractListVersionsRequest = z.infer<
  typeof goalContractListVersionsRequestSchema
>;
export type GoalContractNullableItemResult = z.infer<
  typeof goalContractNullableItemResultSchema
>;
export type GoalContractPublic = z.infer<typeof goalContractPublicSchema>;
export type GoalContractSaveDraftRequest = z.infer<
  typeof goalContractSaveDraftRequestSchema
>;
export type GoalContractSource = z.infer<typeof goalContractSourceSchema>;
export type GoalContractStatus = z.infer<typeof goalContractStatusSchema>;
export type TimelineEventPublic = z.infer<typeof timelineEventPublicSchema>;
export type TimelineListRequest = z.infer<typeof timelineListRequestSchema>;
export type TimelineListResult = z.infer<typeof timelineListResultSchema>;
export type TimelinePagePublic = z.infer<typeof timelinePagePublicSchema>;
