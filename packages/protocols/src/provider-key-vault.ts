import { z } from "zod";
import { providerConnectionTestSnapshotSchema } from "./provider-connection-test";

export const PROVIDER_SCHEMA_VERSION = 1 as const;
export const PROVIDER_LIST_IPC_CHANNEL = "provider:list" as const;
export const PROVIDER_SAVE_IPC_CHANNEL = "provider:save" as const;
export const PROVIDER_REVEAL_KEY_IPC_CHANNEL = "provider:reveal-key" as const;
export const PROVIDER_DELETE_KEY_IPC_CHANNEL = "provider:delete-key" as const;

export const providerConfigStatusSchema = z.enum(["ENABLED", "DISABLED"]);

export const providerPublicSchema = z
  .object({
    schemaVersion: z.literal(PROVIDER_SCHEMA_VERSION),
    id: z.uuidv7(),
    type: z.literal("OPENAI_COMPATIBLE"),
    name: z.string().trim().min(1).max(200),
    endpoint: z.url().max(2_048),
    configStatus: providerConfigStatusSchema,
    hasKey: z.boolean(),
    version: z.number().int().positive(),
    createdAt: z.iso.datetime({ offset: true }),
    updatedAt: z.iso.datetime({ offset: true }),
    connectionTest: providerConnectionTestSnapshotSchema.optional(),
  })
  .strict();

export const providerListRequestSchema = z
  .object({ schemaVersion: z.literal(PROVIDER_SCHEMA_VERSION) })
  .strict();

export const providerSaveRequestSchema = z
  .object({
    schemaVersion: z.literal(PROVIDER_SCHEMA_VERSION),
    commandId: z.uuidv7(),
    providerId: z.uuidv7().optional(),
    expectedVersion: z.number().int().positive().optional(),
    name: z.string().trim().min(1).max(200),
    endpoint: z.url().max(2_048),
    configStatus: providerConfigStatusSchema,
    key: z.string().min(1).optional(),
  })
  .strict()
  .superRefine((request, context) => {
    const creating = request.providerId === undefined;
    if (creating !== (request.expectedVersion === undefined)) {
      context.addIssue({
        code: "custom",
        message: "expectedVersion is required exactly when providerId is set",
        path: ["expectedVersion"],
      });
    }
    if (creating && request.key === undefined) {
      context.addIssue({
        code: "custom",
        message: "key is required when creating a provider",
        path: ["key"],
      });
    }
    if (request.key !== undefined && utf8Length(request.key) > 16 * 1_024) {
      context.addIssue({
        code: "custom",
        message: "key exceeds the UTF-8 byte limit",
        path: ["key"],
      });
    }
    if (!isAllowedProviderEndpoint(request.endpoint)) {
      context.addIssue({
        code: "custom",
        message: "endpoint violates the Provider network policy",
        path: ["endpoint"],
      });
    }
  });

export const providerRevealKeyRequestSchema = z
  .object({
    schemaVersion: z.literal(PROVIDER_SCHEMA_VERSION),
    providerId: z.uuidv7(),
  })
  .strict();

export const providerDeleteKeyRequestSchema = z
  .object({
    schemaVersion: z.literal(PROVIDER_SCHEMA_VERSION),
    commandId: z.uuidv7(),
    providerId: z.uuidv7(),
    expectedVersion: z.number().int().positive(),
  })
  .strict();

export const providerErrorCodeSchema = z.enum([
  "INVALID_REQUEST",
  "UNAUTHORIZED_CALLER",
  "NOT_FOUND",
  "CONFLICT",
  "IDEMPOTENCY_CONFLICT",
  "VAULT_KEY_UNAVAILABLE",
  "VAULT_INTEGRITY_FAILED",
  "STORAGE_UNAVAILABLE",
  "INTERNAL",
]);

export const providerErrorSchema = z
  .object({
    code: providerErrorCodeSchema,
    message: z.literal("Provider operation failed"),
  })
  .strict();

const providerItemResultSchema = z.discriminatedUnion("ok", [
  z.object({ ok: z.literal(true), value: providerPublicSchema }).strict(),
  z.object({ ok: z.literal(false), error: providerErrorSchema }).strict(),
]);

export { providerItemResultSchema };

export const providerListResultSchema = z.discriminatedUnion("ok", [
  z
    .object({ ok: z.literal(true), value: z.array(providerPublicSchema) })
    .strict(),
  z.object({ ok: z.literal(false), error: providerErrorSchema }).strict(),
]);

export const providerRevealKeyResultSchema = z.discriminatedUnion("ok", [
  z
    .object({
      ok: z.literal(true),
      value: z
        .object({
          schemaVersion: z.literal(PROVIDER_SCHEMA_VERSION),
          providerId: z.uuidv7(),
          key: z.string().min(1),
        })
        .strict(),
    })
    .strict(),
  z.object({ ok: z.literal(false), error: providerErrorSchema }).strict(),
]);

export type ProviderConfigStatus = z.infer<typeof providerConfigStatusSchema>;
export type ProviderPublic = z.infer<typeof providerPublicSchema>;
export type ProviderListRequest = z.infer<typeof providerListRequestSchema>;
export type ProviderSaveRequest = z.infer<typeof providerSaveRequestSchema>;
export type ProviderRevealKeyRequest = z.infer<
  typeof providerRevealKeyRequestSchema
>;
export type ProviderDeleteKeyRequest = z.infer<
  typeof providerDeleteKeyRequestSchema
>;
export type ProviderErrorCode = z.infer<typeof providerErrorCodeSchema>;
export type ProviderItemResult = z.infer<typeof providerItemResultSchema>;
export type ProviderListResult = z.infer<typeof providerListResultSchema>;
export type ProviderRevealKeyResult = z.infer<
  typeof providerRevealKeyResultSchema
>;

function utf8Length(value: string): number {
  return new TextEncoder().encode(value).byteLength;
}

function isAllowedProviderEndpoint(endpoint: string): boolean {
  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    return false;
  }
  if (
    (url.protocol !== "http:" && url.protocol !== "https:") ||
    url.username !== "" ||
    url.password !== "" ||
    url.search !== "" ||
    url.hash !== ""
  ) {
    return false;
  }
  return (
    url.protocol === "https:" ||
    /^http:\/\/(?:localhost|127\.0\.0\.1|\[::1\])(?::\d+)?(?:\/|$)/iu.test(
      endpoint,
    )
  );
}
