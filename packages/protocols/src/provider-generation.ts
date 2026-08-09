import { z } from "zod";
import { providerFailureReasonSchema } from "./provider-connection-test";

export const PROVIDER_TEST_GENERATION_IPC_CHANNEL =
  "provider:test-generation" as const;
export const PROVIDER_CANCEL_GENERATION_TEST_IPC_CHANNEL =
  "provider:cancel-generation-test" as const;
export const MAX_NORMALIZED_OUTPUT_TOKENS = 65_536;

export const normalizedGenerationActorSchema = z.enum([
  "SYSTEM",
  "USER",
  "ASSISTANT",
]);

export const normalizedGenerationPartSchema = z
  .object({ kind: z.literal("TEXT"), text: z.string().min(1).max(65_536) })
  .strict();

export const normalizedGenerationInputItemSchema = z
  .object({
    actor: normalizedGenerationActorSchema,
    parts: z.array(normalizedGenerationPartSchema).min(1).max(16),
  })
  .strict();

export const normalizedUsageSchema = z
  .object({
    inputTokens: z.number().int().nonnegative().safe().optional(),
    outputTokens: z.number().int().nonnegative().safe().optional(),
    cachedInputTokens: z.number().int().nonnegative().safe().optional(),
    reasoningTokens: z.number().int().nonnegative().safe().optional(),
    costMicros: z.string().regex(/^\d+$/u).optional(),
    costSource: z.enum(["PROVIDER", "LOCAL_CALCULATION", "UNKNOWN"]),
  })
  .strict();

export const normalizedStopReasonSchema = z.enum([
  "COMPLETED",
  "OUTPUT_LIMIT",
  "CONTENT_FILTER",
  "UNKNOWN",
]);

export const normalizedOutputFormatSchema = z.enum(["TEXT", "JSON_OBJECT"]);

export const providerFailureDiagnosticSchema = z.enum([
  "HTTP_SERVER_ERROR",
  "RESPONSE_TOO_LARGE",
  "INVALID_UTF8",
  "INVALID_JSON",
  "INVALID_RESPONSE_SHAPE",
  "EMPTY_OUTPUT",
  "OUTPUT_LIMIT_WITHOUT_OUTPUT",
  "INVALID_USAGE",
]);

export const normalizedGenerationOutputPartSchema = z
  .object({ kind: z.literal("TEXT"), text: z.string().min(1).max(1_048_576) })
  .strict();

export const normalizedGenerationRequestSchema = z
  .object({
    modelId: z.string().min(1).max(512),
    input: z.array(normalizedGenerationInputItemSchema).min(1).max(32),
    maxOutputTokens: z.number().int().min(1).max(MAX_NORMALIZED_OUTPUT_TOKENS),
    outputFormat: normalizedOutputFormatSchema.optional(),
    temperature: z.number().min(0).max(2).optional(),
  })
  .strict()
  .superRefine((request, context) => {
    const bytes = new TextEncoder().encode(
      request.input
        .flatMap(({ parts }) => parts.map(({ text }) => text))
        .join(""),
    ).byteLength;
    if (bytes > 65_536) {
      context.addIssue({
        code: "custom",
        message: "generation input exceeds the UTF-8 byte limit",
        path: ["input"],
      });
    }
  });

export const normalizedGenerationResponseSchema = z
  .object({
    modelId: z.string().min(1).max(512),
    outputParts: z.array(normalizedGenerationOutputPartSchema).min(1).max(32),
    stopReason: normalizedStopReasonSchema,
    usage: normalizedUsageSchema,
  })
  .strict();

const providerGenerationSuccessSnapshotSchema = z
  .object({
    status: z.literal("SUCCEEDED"),
    providerVersion: z.number().int().positive(),
    modelId: z.string().min(1).max(512),
    outputPreview: z.string().min(1).max(65_536),
    stopReason: normalizedStopReasonSchema,
    usage: normalizedUsageSchema,
    completedAt: z.iso.datetime({ offset: true }),
  })
  .strict();

const providerGenerationFailedSnapshotSchema = z
  .object({
    status: z.literal("FAILED"),
    providerVersion: z.number().int().positive(),
    modelId: z.string().min(1).max(512),
    failure: z
      .object({
        reason: providerFailureReasonSchema,
        retryable: z.boolean(),
        suggestedBackoffMs: z.number().int().nonnegative().optional(),
      })
      .strict(),
    completedAt: z.iso.datetime({ offset: true }),
  })
  .strict();

export const providerCompletedGenerationTestSnapshotSchema =
  z.discriminatedUnion("status", [
    providerGenerationSuccessSnapshotSchema,
    providerGenerationFailedSnapshotSchema,
  ]);

export const providerGenerationTestSnapshotSchema = z.discriminatedUnion(
  "status",
  [
    z.object({ status: z.literal("IDLE") }).strict(),
    providerGenerationSuccessSnapshotSchema,
    providerGenerationFailedSnapshotSchema,
  ],
);

export const providerTestGenerationRequestSchema = z
  .object({
    schemaVersion: z.literal(1),
    requestId: z.uuidv7(),
    providerId: z.uuidv7(),
    expectedVersion: z.number().int().positive(),
    input: z.array(normalizedGenerationInputItemSchema).min(1).max(32),
    maxOutputTokens: z.number().int().min(1).max(4_096),
    temperature: z.number().min(0).max(2).optional(),
  })
  .strict()
  .superRefine((request, context) => {
    const parsed = normalizedGenerationRequestSchema.safeParse({
      modelId: "validation-placeholder",
      input: request.input,
      maxOutputTokens: request.maxOutputTokens,
      ...(request.temperature === undefined
        ? {}
        : { temperature: request.temperature }),
    });
    if (!parsed.success) {
      context.addIssue({
        code: "custom",
        message: "generation input is invalid",
        path: ["input"],
      });
    }
  });

export const providerCancelGenerationTestRequestSchema = z
  .object({ schemaVersion: z.literal(1), requestId: z.uuidv7() })
  .strict();

const generationOperationErrorCodeSchema = z.enum([
  "INVALID_REQUEST",
  "UNAUTHORIZED_CALLER",
  "NOT_FOUND",
  "CONFLICT",
  "MISSING_KEY",
  "DISABLED",
  "UNVERIFIED",
  "MODEL_NOT_SELECTED",
  "MODEL_STALE",
  "ALREADY_GENERATING",
  "CANCELLED",
  "VAULT_KEY_UNAVAILABLE",
  "VAULT_INTEGRITY_FAILED",
  "STORAGE_UNAVAILABLE",
  "INTERNAL",
]);

export const providerGenerationTestResultSchema = z.discriminatedUnion("ok", [
  z
    .object({
      ok: z.literal(true),
      value: providerCompletedGenerationTestSnapshotSchema,
    })
    .strict(),
  z
    .object({
      ok: z.literal(false),
      error: z
        .object({
          code: generationOperationErrorCodeSchema,
          message: z.literal("Provider generation test failed"),
        })
        .strict(),
    })
    .strict(),
]);

export const providerCancelGenerationTestResultSchema = z.discriminatedUnion(
  "ok",
  [
    z
      .object({
        ok: z.literal(true),
        value: z
          .object({
            schemaVersion: z.literal(1),
            requestId: z.uuidv7(),
            cancelled: z.literal(true),
          })
          .strict(),
      })
      .strict(),
    z
      .object({
        ok: z.literal(false),
        error: z
          .object({
            code: z.enum([
              "INVALID_REQUEST",
              "UNAUTHORIZED_CALLER",
              "NOT_FOUND",
              "STORAGE_UNAVAILABLE",
              "INTERNAL",
            ]),
            message: z.literal("Provider generation test cancellation failed"),
          })
          .strict(),
      })
      .strict(),
  ],
);

export type NormalizedGenerationActor = z.infer<
  typeof normalizedGenerationActorSchema
>;
export type NormalizedGenerationRequest = z.infer<
  typeof normalizedGenerationRequestSchema
>;
export type NormalizedGenerationResponse = z.infer<
  typeof normalizedGenerationResponseSchema
>;
export type NormalizedUsage = z.infer<typeof normalizedUsageSchema>;
export type ProviderFailureDiagnostic = z.infer<
  typeof providerFailureDiagnosticSchema
>;
export type ProviderGenerationTestSnapshot = z.infer<
  typeof providerGenerationTestSnapshotSchema
>;
export type ProviderTestGenerationRequest = z.infer<
  typeof providerTestGenerationRequestSchema
>;
export type ProviderCancelGenerationTestRequest = z.infer<
  typeof providerCancelGenerationTestRequestSchema
>;
export type ProviderGenerationTestResult = z.infer<
  typeof providerGenerationTestResultSchema
>;
export type ProviderCancelGenerationTestResult = z.infer<
  typeof providerCancelGenerationTestResultSchema
>;
