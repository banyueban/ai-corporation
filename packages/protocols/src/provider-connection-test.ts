import { z } from "zod";

export const PROVIDER_TEST_CONNECTION_IPC_CHANNEL =
  "provider:test-connection" as const;
export const PROVIDER_CANCEL_CONNECTION_TEST_IPC_CHANNEL =
  "provider:cancel-connection-test" as const;

export const providerFailureReasonSchema = z.enum([
  "AUTHENTICATION",
  "PERMISSION",
  "RATE_LIMIT",
  "QUOTA_EXHAUSTED",
  "INVALID_REQUEST",
  "MODEL_NOT_FOUND",
  "CONTENT_FILTER",
  "TIMEOUT",
  "NETWORK",
  "PROVIDER_INTERNAL",
  "CANCELLED",
]);

export const providerModelDescriptorSchema = z
  .object({
    id: z.string().min(1).max(512),
    displayName: z.string().min(1).max(512),
    source: z.literal("PROVIDER"),
    observedAt: z.iso.datetime({ offset: true }),
  })
  .strict();

const providerFailureSchema = z
  .object({
    reason: providerFailureReasonSchema,
    retryable: z.boolean(),
    suggestedBackoffMs: z.number().int().nonnegative().optional(),
  })
  .strict();

const providerVerifiedConnectionTestSnapshotSchema = z
  .object({
    status: z.literal("VERIFIED"),
    providerVersion: z.number().int().positive(),
    testedAt: z.iso.datetime({ offset: true }),
    models: z.array(providerModelDescriptorSchema).max(1_000),
  })
  .strict();
const providerFailedConnectionTestSnapshotSchema = z
  .object({
    status: z.literal("FAILED"),
    providerVersion: z.number().int().positive(),
    testedAt: z.iso.datetime({ offset: true }),
    failure: providerFailureSchema,
    models: z.tuple([]),
  })
  .strict();

export const providerCompletedConnectionTestSnapshotSchema =
  z.discriminatedUnion("status", [
    providerVerifiedConnectionTestSnapshotSchema,
    providerFailedConnectionTestSnapshotSchema,
  ]);

export const providerConnectionTestSnapshotSchema = z.discriminatedUnion(
  "status",
  [
    z.object({ status: z.literal("UNVERIFIED") }).strict(),
    providerVerifiedConnectionTestSnapshotSchema,
    providerFailedConnectionTestSnapshotSchema,
  ],
);

export const providerTestConnectionRequestSchema = z
  .object({
    schemaVersion: z.literal(1),
    requestId: z.uuidv7(),
    providerId: z.uuidv7(),
    expectedVersion: z.number().int().positive(),
  })
  .strict();

export const providerCancelConnectionTestRequestSchema = z
  .object({
    schemaVersion: z.literal(1),
    requestId: z.uuidv7(),
  })
  .strict();

export const providerConnectionTestResultSchema = z.discriminatedUnion("ok", [
  z
    .object({
      ok: z.literal(true),
      value: providerCompletedConnectionTestSnapshotSchema,
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
            "CONFLICT",
            "MISSING_KEY",
            "ALREADY_TESTING",
            "CANCELLED",
            "VAULT_KEY_UNAVAILABLE",
            "VAULT_INTEGRITY_FAILED",
            "STORAGE_UNAVAILABLE",
            "INTERNAL",
          ]),
          message: z.literal("Provider connection test failed"),
        })
        .strict(),
    })
    .strict(),
]);

export const providerCancelConnectionTestResultSchema = z.discriminatedUnion(
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
            message: z.literal("Provider connection test cancellation failed"),
          })
          .strict(),
      })
      .strict(),
  ],
);

export type ProviderFailureReason = z.infer<typeof providerFailureReasonSchema>;
export type ProviderModelDescriptor = z.infer<
  typeof providerModelDescriptorSchema
>;
export type ProviderConnectionTestSnapshot = z.infer<
  typeof providerConnectionTestSnapshotSchema
>;
export type ProviderTestConnectionRequest = z.infer<
  typeof providerTestConnectionRequestSchema
>;
export type ProviderCancelConnectionTestRequest = z.infer<
  typeof providerCancelConnectionTestRequestSchema
>;
export type ProviderConnectionTestResult = z.infer<
  typeof providerConnectionTestResultSchema
>;
export type ProviderCancelConnectionTestResult = z.infer<
  typeof providerCancelConnectionTestResultSchema
>;
