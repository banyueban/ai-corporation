import { z } from "zod";
import { organizationMemberSchema } from "./organization-proposal";

export const ORGANIZATION_ACTIVATION_SCHEMA_VERSION = "1.0" as const;
export const ORGANIZATION_ACTIVATION_GET_CURRENT_IPC_CHANNEL =
  "organization-activation:get-current" as const;
export const ORGANIZATION_ACTIVATION_ACTIVATE_IPC_CHANNEL =
  "organization-activation:activate" as const;

const schemaVersion = z.literal(ORGANIZATION_ACTIVATION_SCHEMA_VERSION);
const uuidV7 = z.uuidv7();
const modelId = z.string().min(1).max(512);

export const organizationRoleRouteSchema = z
  .object({
    providerId: uuidV7,
    providerVersion: z.number().int().positive(),
    modelId,
  })
  .strict();

export const organizationActivationRequestSchema = z
  .object({
    schemaVersion,
    commandId: uuidV7,
    corporationId: uuidV7,
    organizationId: uuidV7,
    expectedOrganizationVersion: z.number().int().positive(),
    routes: z
      .object({
        planner: organizationRoleRouteSchema,
        executor: organizationRoleRouteSchema,
        judge: organizationRoleRouteSchema,
      })
      .strict(),
    acceptDegradedGaps: z.boolean(),
  })
  .strict();

export const organizationActivationGetCurrentRequestSchema = z
  .object({ schemaVersion, corporationId: uuidV7 })
  .strict();

export const organizationActivatedRouteSchema = organizationRoleRouteSchema
  .extend({
    apiDialect: z.literal("CHAT_COMPLETIONS"),
  })
  .strict();

export const activatedAgentInstanceSchema = z
  .object({
    instanceId: uuidV7,
    member: organizationMemberSchema,
    status: z.enum(["READY", "BUSY"]),
    route: organizationActivatedRouteSchema
      .extend({
        modelStrategy: z.enum(["BALANCED", "HIGH_REASONING", "LOW_COST"]),
      })
      .strict(),
  })
  .strict();

export const organizationActivationSchema = z
  .object({
    schemaVersion,
    activationId: uuidV7,
    corporationId: uuidV7,
    organizationId: uuidV7,
    organizationVersion: z.number().int().positive(),
    status: z.literal("ACTIVE"),
    routes: z
      .object({
        planner: organizationActivatedRouteSchema,
        executor: organizationActivatedRouteSchema,
        judge: organizationActivatedRouteSchema,
      })
      .strict(),
    acceptedDegradedGaps: z.boolean(),
    agents: z.array(activatedAgentInstanceSchema).min(2).max(5),
    activatedAt: z.iso.datetime({ offset: false }),
  })
  .strict();

export const organizationActivationErrorCodeSchema = z.enum([
  "VALIDATION_FAILED",
  "UNAUTHORIZED_CALLER",
  "ORGANIZATION_NOT_FOUND",
  "ORGANIZATION_NOT_DRAFT",
  "ORGANIZATION_CHANGED",
  "BLOCKING_CAPABILITY_GAP",
  "DEGRADED_GAP_ACCEPTANCE_REQUIRED",
  "PROVIDER_NOT_READY",
  "PROVIDER_CHANGED",
  "MODEL_NOT_AVAILABLE",
  "COMMAND_CONFLICT",
  "STORAGE_FAILURE",
]);

export const organizationActivationErrorMessages = {
  VALIDATION_FAILED: "Organization activation request is invalid.",
  UNAUTHORIZED_CALLER: "Organization activation request is not allowed.",
  ORGANIZATION_NOT_FOUND: "Organization proposal was not found.",
  ORGANIZATION_NOT_DRAFT: "Organization proposal is not a draft.",
  ORGANIZATION_CHANGED: "Organization proposal changed. Reload and retry.",
  BLOCKING_CAPABILITY_GAP: "Blocking capability gaps prevent activation.",
  DEGRADED_GAP_ACCEPTANCE_REQUIRED:
    "Degraded capability gaps require explicit acceptance.",
  PROVIDER_NOT_READY: "Selected Provider is not ready.",
  PROVIDER_CHANGED: "Selected Provider changed. Reload and retry.",
  MODEL_NOT_AVAILABLE: "Selected model is not currently available.",
  COMMAND_CONFLICT: "The command ID was already used for different input.",
  STORAGE_FAILURE: "Organization activation storage is unavailable.",
} as const;

export const organizationActivationFailureSchema = z
  .object({
    ok: z.literal(false),
    error: z
      .object({
        code: organizationActivationErrorCodeSchema,
        message: z.string(),
      })
      .strict(),
  })
  .strict()
  .superRefine((value, context) => {
    if (
      value.error.message !==
      organizationActivationErrorMessages[value.error.code]
    ) {
      context.addIssue({
        code: "custom",
        path: ["error", "message"],
        message: "Unexpected error message",
      });
    }
  });

export const organizationActivationItemResultSchema = z.discriminatedUnion(
  "ok",
  [
    z
      .object({ ok: z.literal(true), value: organizationActivationSchema })
      .strict(),
    organizationActivationFailureSchema,
  ],
);

export const organizationActivationNullableItemResultSchema =
  z.discriminatedUnion("ok", [
    z
      .object({
        ok: z.literal(true),
        value: organizationActivationSchema.nullable(),
      })
      .strict(),
    organizationActivationFailureSchema,
  ]);

export type OrganizationActivation = z.infer<
  typeof organizationActivationSchema
>;
export type OrganizationActivationRequest = z.infer<
  typeof organizationActivationRequestSchema
>;
export type OrganizationActivationGetCurrentRequest = z.infer<
  typeof organizationActivationGetCurrentRequestSchema
>;
export type OrganizationActivationErrorCode = z.infer<
  typeof organizationActivationErrorCodeSchema
>;
export type OrganizationActivationItemResult = z.infer<
  typeof organizationActivationItemResultSchema
>;
export type OrganizationActivationNullableItemResult = z.infer<
  typeof organizationActivationNullableItemResultSchema
>;
