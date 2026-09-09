import { z } from "zod";
import { providerFailureReasonSchema } from "./provider-connection-test";
import { normalizedUsageSchema } from "./provider-generation";

export const AGENT_RUN_SCHEMA_VERSION = "1.0" as const;
export const AGENT_RUN_GET_CURRENT_IPC_CHANNEL =
  "agent-run:get-current" as const;
export const AGENT_RUN_CONTINUE_IPC_CHANNEL = "agent-run:continue" as const;
export const AGENT_RUN_RETRY_IPC_CHANNEL = "agent-run:retry" as const;
export const AGENT_RUN_CANCEL_IPC_CHANNEL = "agent-run:cancel" as const;

const uuid = z.uuidv7();
const schemaVersion = z.literal(AGENT_RUN_SCHEMA_VERSION);

export const agentRunCommandRequestSchema = z
  .object({
    schemaVersion,
    commandId: uuid,
    corporationId: uuid,
    runId: uuid,
    expectedAttempt: z.number().int().positive(),
  })
  .strict();
export const agentRunGetCurrentRequestSchema = z
  .object({ schemaVersion, corporationId: uuid })
  .strict();

export const agentModelCandidateSchema = z
  .object({
    summary: z.string().min(1).max(4_000),
    outputs: z
      .array(
        z
          .object({
            logicalName: z.string().min(1).max(500),
            artifactType: z.enum([
              "TEXT",
              "JSON",
              "DOCUMENT",
              "SOURCE_CODE",
              "FILE",
              "PATCH",
              "TEST_REPORT",
              "DECISION_RECORD",
              "EVALUATION_REPORT",
              "TOOL_OUTPUT",
              "MEMORY_CANDIDATE",
            ]),
            mediaType: z.string().min(1).max(255),
            content: z.string().min(1).max(1_048_576),
          })
          .strict(),
      )
      .min(1)
      .max(50),
    claims: z
      .array(
        z
          .object({
            statement: z.string().min(1).max(1_000),
            confidence: z.number().min(0).max(1),
          })
          .strict(),
      )
      .max(50),
    unresolvedIssues: z
      .array(
        z
          .object({
            code: z.string().min(1).max(128),
            message: z.string().min(1).max(1_000),
            blocking: z.boolean(),
          })
          .strict(),
      )
      .max(50),
    requestedFollowups: z
      .array(
        z
          .object({
            kind: z.enum(["CLARIFICATION", "FOLLOWUP_TASK"]),
            reason: z.string().min(1).max(1_000),
            requiredCapability: z.string().min(1).max(128).optional(),
          })
          .strict(),
      )
      .max(20),
  })
  .strict()
  .superRefine((candidate, context) => {
    const bytes = candidate.outputs.reduce(
      (total, output) =>
        total + new TextEncoder().encode(output.content).byteLength,
      0,
    );
    if (bytes > 2_097_152) {
      context.addIssue({
        code: "custom",
        message: "candidate output exceeds the total UTF-8 byte limit",
        path: ["outputs"],
      });
    }
  });

const candidateOutputSchema = z
  .object({
    candidateId: uuid,
    logicalName: z.string(),
    artifactType: z.string(),
    mediaType: z.string(),
    content: z.string(),
    contentRef: z.string().regex(/^candidate:\/\/[0-9a-f-]+$/u),
  })
  .strict();
export const agentRunSchema = z
  .object({
    schemaVersion,
    runId: uuid,
    corporationId: uuid,
    taskId: uuid,
    taskTitle: z.string(),
    agentInstanceId: uuid,
    attempt: z.number().int().positive(),
    status: z.enum([
      "CREATED",
      "PREPARING",
      "READY",
      "RUNNING",
      "PRODUCED",
      "FAILED",
      "CANCELLED",
    ]),
    modelId: z.string().optional(),
    usage: normalizedUsageSchema,
    summary: z.string().optional(),
    outputs: z.array(candidateOutputSchema),
    failureReason: z
      .union([
        providerFailureReasonSchema,
        z.literal("INVALID_MODEL_OUTPUT"),
        z.literal("TASK_INPUT_UNSUPPORTED"),
      ])
      .optional(),
    createdAt: z.iso.datetime({ offset: true }),
    updatedAt: z.iso.datetime({ offset: true }),
  })
  .strict();
export const agentRunErrorCodeSchema = z.enum([
  "VALIDATION_FAILED",
  "UNAUTHORIZED_CALLER",
  "RUN_NOT_FOUND",
  "RUN_CHANGED",
  "RUN_NOT_CONTINUABLE",
  "TASK_INPUT_UNSUPPORTED",
  "PROVIDER_NOT_READY",
  "PROVIDER_FAILURE",
  "INVALID_MODEL_OUTPUT",
  "COMMAND_CONFLICT",
  "CANCELLED",
  "STORAGE_FAILURE",
]);
export const agentRunResultSchema = z.discriminatedUnion("ok", [
  z.object({ ok: z.literal(true), value: agentRunSchema }).strict(),
  z
    .object({
      ok: z.literal(false),
      error: z
        .object({
          code: agentRunErrorCodeSchema,
          message: z.literal("Agent run operation failed"),
        })
        .strict(),
    })
    .strict(),
]);
export const agentRunNullableResultSchema = z.discriminatedUnion("ok", [
  z.object({ ok: z.literal(true), value: agentRunSchema.nullable() }).strict(),
  z
    .object({
      ok: z.literal(false),
      error: z
        .object({
          code: agentRunErrorCodeSchema,
          message: z.literal("Agent run operation failed"),
        })
        .strict(),
    })
    .strict(),
]);
export type AgentRun = z.infer<typeof agentRunSchema>;
export type AgentRunGetCurrentRequest = z.infer<
  typeof agentRunGetCurrentRequestSchema
>;
export type AgentRunCommandRequest = z.infer<
  typeof agentRunCommandRequestSchema
>;
export type AgentModelCandidate = z.infer<typeof agentModelCandidateSchema>;
export type AgentRunErrorCode = z.infer<typeof agentRunErrorCodeSchema>;
export type AgentRunResult = z.infer<typeof agentRunResultSchema>;
export type AgentRunNullableResult = z.infer<
  typeof agentRunNullableResultSchema
>;
