import { z } from "zod";

export const EXECUTION_START_SCHEMA_VERSION = "1.0" as const;
export const EXECUTION_START_GET_CURRENT_IPC_CHANNEL =
  "execution-start:get-current" as const;
export const EXECUTION_START_START_IPC_CHANNEL =
  "execution-start:start" as const;

const uuidV7 = z.uuidv7();
const schemaVersion = z.literal(EXECUTION_START_SCHEMA_VERSION);

export const executionStartRequestSchema = z
  .object({
    schemaVersion,
    commandId: uuidV7,
    corporationId: uuidV7,
    expectedCorporationVersion: z.number().int().positive(),
  })
  .strict();

export const executionStartGetCurrentRequestSchema = z
  .object({ schemaVersion, corporationId: uuidV7 })
  .strict();

export const executionTaskStatusSchema = z.enum([
  "BLOCKED",
  "READY",
  "RUNNING",
  "WAITING_HUMAN",
]);

export const executionStartSchema = z
  .object({
    schemaVersion,
    corporationId: uuidV7,
    corporationVersion: z.number().int().positive(),
    corporationStatus: z.enum(["EXECUTING", "WAITING_HUMAN"]),
    selectedTaskId: uuidV7,
    selectedTaskTitle: z.string().min(1).max(500),
    selectedTaskKind: z.enum([
      "ANALYSIS",
      "GENERATION",
      "TRANSFORMATION",
      "VALIDATION",
      "HUMAN_DECISION",
    ]),
    tasks: z
      .array(
        z
          .object({
            taskId: uuidV7,
            title: z.string().min(1).max(500),
            status: executionTaskStatusSchema,
          })
          .strict(),
      )
      .min(1)
      .max(20),
    run: z
      .object({
        runId: uuidV7,
        taskId: uuidV7,
        agentInstanceId: uuidV7,
        attempt: z.number().int().positive(),
        status: z.literal("CREATED"),
      })
      .strict()
      .optional(),
    startedAt: z.iso.datetime({ offset: false }),
  })
  .strict()
  .superRefine((value, context) => {
    if (
      (value.selectedTaskKind === "HUMAN_DECISION") !==
      (value.run === undefined)
    ) {
      context.addIssue({
        code: "custom",
        message: "Run and task kind mismatch",
      });
    }
  });

export const executionStartErrorCodeSchema = z.enum([
  "VALIDATION_FAILED",
  "UNAUTHORIZED_CALLER",
  "CORPORATION_NOT_FOUND",
  "CORPORATION_CHANGED",
  "STATE_CONFLICT",
  "WORKSPACE_UNAVAILABLE",
  "PLAN_NOT_READY",
  "ORGANIZATION_NOT_READY",
  "PROVIDER_NOT_READY",
  "ASSIGNMENT_INVALID",
  "NO_ENTRY_TASK",
  "COMMAND_CONFLICT",
  "STORAGE_FAILURE",
]);

export const executionStartErrorMessages = {
  VALIDATION_FAILED: "Execution start request is invalid.",
  UNAUTHORIZED_CALLER: "Execution start request is not allowed.",
  CORPORATION_NOT_FOUND: "Corporation was not found.",
  CORPORATION_CHANGED: "Corporation changed. Reload and retry.",
  STATE_CONFLICT: "Corporation state does not allow execution start.",
  WORKSPACE_UNAVAILABLE: "Workspace is unavailable.",
  PLAN_NOT_READY: "The current Plan is not approved and valid.",
  ORGANIZATION_NOT_READY: "The current Organization is not active.",
  PROVIDER_NOT_READY: "An activated Provider route is no longer ready.",
  ASSIGNMENT_INVALID: "Task assignment does not match the active team.",
  NO_ENTRY_TASK: "The Plan has no task that can start.",
  COMMAND_CONFLICT: "The command ID was already used for different input.",
  STORAGE_FAILURE: "Execution start storage is unavailable.",
} as const;

const failureSchema = z
  .object({
    ok: z.literal(false),
    error: z
      .object({ code: executionStartErrorCodeSchema, message: z.string() })
      .strict(),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.error.message !== executionStartErrorMessages[value.error.code])
      context.addIssue({ code: "custom", message: "Unexpected error message" });
  });

export const executionStartItemResultSchema = z.discriminatedUnion("ok", [
  z.object({ ok: z.literal(true), value: executionStartSchema }).strict(),
  failureSchema,
]);
export const executionStartNullableItemResultSchema = z.discriminatedUnion(
  "ok",
  [
    z
      .object({ ok: z.literal(true), value: executionStartSchema.nullable() })
      .strict(),
    failureSchema,
  ],
);

export type ExecutionStart = z.infer<typeof executionStartSchema>;
export type ExecutionStartRequest = z.infer<typeof executionStartRequestSchema>;
export type ExecutionStartGetCurrentRequest = z.infer<
  typeof executionStartGetCurrentRequestSchema
>;
export type ExecutionStartErrorCode = z.infer<
  typeof executionStartErrorCodeSchema
>;
export type ExecutionStartItemResult = z.infer<
  typeof executionStartItemResultSchema
>;
export type ExecutionStartNullableItemResult = z.infer<
  typeof executionStartNullableItemResultSchema
>;
