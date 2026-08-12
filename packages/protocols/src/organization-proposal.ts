import { z } from "zod";

export const ORGANIZATION_PROPOSAL_SCHEMA_VERSION = "1.0" as const;
export const ORGANIZATION_PROPOSAL_GET_CURRENT_IPC_CHANNEL =
  "organization-proposal:get-current" as const;
export const ORGANIZATION_PROPOSAL_CREATE_IPC_CHANNEL =
  "organization-proposal:create" as const;

const schemaVersion = z.literal(ORGANIZATION_PROPOSAL_SCHEMA_VERSION);
const uuidV7 = z.uuidv7();
const shortText = z.string().min(1).max(500);
const stableId = z.string().regex(/^[a-z][a-z0-9._-]{0,127}$/u);

export const organizationMemberSchema = z
  .object({
    memberId: stableId,
    templateId: stableId,
    templateVersion: z.number().int().positive(),
    displayName: shortText,
    role: z.enum(["PLANNER", "EXECUTOR", "JUDGE"]),
    capabilityGroup: z
      .enum([
        "ANALYSIS_DOCUMENTS",
        "SOFTWARE_IMPLEMENTATION",
        "QUALITY_VALIDATION",
      ])
      .optional(),
    modelStrategy: z.enum(["BALANCED", "HIGH_REASONING", "LOW_COST"]),
    capabilities: z.array(stableId).max(20),
    allowedTools: z.array(stableId).max(20),
  })
  .strict()
  .superRefine((value, context) => {
    if ((value.role === "EXECUTOR") !== (value.capabilityGroup !== undefined)) {
      context.addIssue({
        code: "custom",
        path: ["capabilityGroup"],
        message: "Executor capability group mismatch",
      });
    }
  });

export const organizationAssignmentSchema = z
  .object({
    taskId: uuidV7,
    ownerType: z.enum(["AGENT", "HUMAN"]),
    ownerId: stableId,
    reason: shortText,
  })
  .strict()
  .superRefine((value, context) => {
    if ((value.ownerType === "HUMAN") !== (value.ownerId === "human.user")) {
      context.addIssue({
        code: "custom",
        path: ["ownerId"],
        message: "Human owner mismatch",
      });
    }
  });

export const organizationCapabilityGapSchema = z
  .object({
    taskIds: z.array(uuidV7).min(1).max(50),
    capability: stableId,
    severity: z.enum(["BLOCKING", "DEGRADED"]),
    reason: shortText,
    alternatives: z
      .array(
        z.enum(["CHANGE_PLAN", "ADD_PROVIDER", "INSTALL_TOOL", "ASK_HUMAN"]),
      )
      .min(1)
      .max(4),
  })
  .strict();

export const organizationProposalSchema = z
  .object({
    schemaVersion,
    organizationId: uuidV7,
    corporationId: uuidV7,
    planId: uuidV7,
    planVersion: z.number().int().positive(),
    version: z.number().int().positive(),
    status: z.literal("DRAFT"),
    templateSetVersion: z.literal("builtin-v1"),
    members: z.array(organizationMemberSchema).min(2).max(5),
    assignments: z.array(organizationAssignmentSchema).min(1).max(50),
    separationConstraints: z
      .array(
        z
          .object({
            rule: z.literal("EXECUTOR_JUDGE_SEPARATION"),
            executorMemberId: stableId,
            judgeMemberId: stableId,
          })
          .strict(),
      )
      .max(3),
    capabilityGaps: z.array(organizationCapabilityGapSchema).max(50),
    createdAt: z.iso.datetime({ offset: false }),
  })
  .strict()
  .superRefine((value, context) => {
    const memberIds = value.members.map(({ memberId }) => memberId);
    if (new Set(memberIds).size !== memberIds.length) {
      context.addIssue({
        code: "custom",
        path: ["members"],
        message: "Member IDs must be unique",
      });
    }
    const taskIds = value.assignments.map(({ taskId }) => taskId);
    if (new Set(taskIds).size !== taskIds.length) {
      context.addIssue({
        code: "custom",
        path: ["assignments"],
        message: "Task assignments must be unique",
      });
    }
    const memberIdSet = new Set(memberIds);
    for (const assignment of value.assignments) {
      if (
        assignment.ownerType === "AGENT" &&
        !memberIdSet.has(assignment.ownerId)
      ) {
        context.addIssue({
          code: "custom",
          path: ["assignments"],
          message: "Assignment owner must be a proposed member",
        });
      }
    }
  });

export const organizationProposalCreateRequestSchema = z
  .object({
    schemaVersion,
    commandId: uuidV7,
    corporationId: uuidV7,
    planId: uuidV7,
    expectedPlanVersion: z.number().int().positive(),
  })
  .strict();

export const organizationProposalGetCurrentRequestSchema = z
  .object({ schemaVersion, corporationId: uuidV7 })
  .strict();

export const organizationProposalErrorCodeSchema = z.enum([
  "VALIDATION_FAILED",
  "UNAUTHORIZED_CALLER",
  "PLAN_NOT_APPROVED",
  "CURRENT_PLAN_CHANGED",
  "COMMAND_CONFLICT",
  "ORGANIZATION_NOT_FOUND",
  "STORAGE_FAILURE",
]);

export const organizationProposalErrorMessages = {
  VALIDATION_FAILED: "Organization proposal request is invalid.",
  UNAUTHORIZED_CALLER: "Organization proposal request is not allowed.",
  PLAN_NOT_APPROVED: "The current Plan is not approved.",
  CURRENT_PLAN_CHANGED: "The current Plan changed. Reload and retry.",
  COMMAND_CONFLICT: "The command ID was already used for different input.",
  ORGANIZATION_NOT_FOUND: "Organization proposal was not found.",
  STORAGE_FAILURE: "Organization proposal storage is unavailable.",
} as const;

export const organizationProposalFailureSchema = z
  .object({
    ok: z.literal(false),
    error: z
      .object({
        code: organizationProposalErrorCodeSchema,
        message: z.string(),
      })
      .strict(),
  })
  .strict()
  .superRefine((value, context) => {
    if (
      value.error.message !==
      organizationProposalErrorMessages[value.error.code]
    ) {
      context.addIssue({
        code: "custom",
        path: ["error", "message"],
        message: "Unexpected error message",
      });
    }
  });

export const organizationProposalItemResultSchema = z.discriminatedUnion("ok", [
  z.object({ ok: z.literal(true), value: organizationProposalSchema }).strict(),
  organizationProposalFailureSchema,
]);

export const organizationProposalNullableItemResultSchema =
  z.discriminatedUnion("ok", [
    z
      .object({
        ok: z.literal(true),
        value: organizationProposalSchema.nullable(),
      })
      .strict(),
    organizationProposalFailureSchema,
  ]);

export type OrganizationProposal = z.infer<typeof organizationProposalSchema>;
export type OrganizationProposalCreateRequest = z.infer<
  typeof organizationProposalCreateRequestSchema
>;
export type OrganizationProposalErrorCode = z.infer<
  typeof organizationProposalErrorCodeSchema
>;
export type OrganizationProposalGetCurrentRequest = z.infer<
  typeof organizationProposalGetCurrentRequestSchema
>;
export type OrganizationProposalItemResult = z.infer<
  typeof organizationProposalItemResultSchema
>;
export type OrganizationProposalNullableItemResult = z.infer<
  typeof organizationProposalNullableItemResultSchema
>;
