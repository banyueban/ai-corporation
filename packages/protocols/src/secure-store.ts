import { z } from "zod";

export const SECURE_STORE_SCHEMA_VERSION = 1 as const;
export const SECURE_STORE_STATUS_RPC_METHOD = "secure_store.status" as const;
export const SECURE_STORE_SET_RPC_METHOD = "secure_store.set" as const;
export const SECURE_STORE_GET_RPC_METHOD = "secure_store.get" as const;
export const SECURE_STORE_DELETE_RPC_METHOD = "secure_store.delete" as const;
export const SECURE_STORE_MAX_SECRET_BYTES = 2_048 as const;

const rpcIdSchema = z.union([z.string(), z.number(), z.null()]);
const sessionTokenSchema = z.string().min(32).max(256);
export const secureStoreSecretRefSchema = z.uuid();

export const secureStoreSecretSchema = z
  .string()
  .min(1)
  .superRefine((secret, context) => {
    if (
      new TextEncoder().encode(secret).byteLength >
      SECURE_STORE_MAX_SECRET_BYTES
    ) {
      context.addIssue({
        code: "too_big",
        maximum: SECURE_STORE_MAX_SECRET_BYTES,
        origin: "string",
        inclusive: true,
        message: "Secret exceeds the secure store byte limit",
      });
    }
    if ([...secret].some((character) => /\p{Cc}/u.test(character))) {
      context.addIssue({
        code: "custom",
        message: "Secret must not contain control characters",
      });
    }
  });

const baseParamsSchema = z
  .object({
    schemaVersion: z.literal(SECURE_STORE_SCHEMA_VERSION),
    sessionToken: sessionTokenSchema,
  })
  .strict();

const referenceParamsSchema = baseParamsSchema
  .extend({ secretRef: secureStoreSecretRefSchema })
  .strict();

export const secureStoreStatusRpcRequestSchema = z
  .object({
    jsonrpc: z.literal("2.0"),
    id: rpcIdSchema,
    method: z.literal(SECURE_STORE_STATUS_RPC_METHOD),
    params: baseParamsSchema,
  })
  .strict();

export const secureStoreSetRpcRequestSchema = z
  .object({
    jsonrpc: z.literal("2.0"),
    id: rpcIdSchema,
    method: z.literal(SECURE_STORE_SET_RPC_METHOD),
    params: referenceParamsSchema
      .extend({ secret: secureStoreSecretSchema })
      .strict(),
  })
  .strict();

export const secureStoreGetRpcRequestSchema = z
  .object({
    jsonrpc: z.literal("2.0"),
    id: rpcIdSchema,
    method: z.literal(SECURE_STORE_GET_RPC_METHOD),
    params: referenceParamsSchema,
  })
  .strict();

export const secureStoreDeleteRpcRequestSchema = z
  .object({
    jsonrpc: z.literal("2.0"),
    id: rpcIdSchema,
    method: z.literal(SECURE_STORE_DELETE_RPC_METHOD),
    params: referenceParamsSchema,
  })
  .strict();

export const secureStoreStatusResultSchema = z
  .object({
    schemaVersion: z.literal(SECURE_STORE_SCHEMA_VERSION),
    available: z.literal(true),
  })
  .strict();

export const secureStoreSetResultSchema = z
  .object({
    schemaVersion: z.literal(SECURE_STORE_SCHEMA_VERSION),
    stored: z.literal(true),
  })
  .strict();

export const secureStoreDeleteResultSchema = z
  .object({
    schemaVersion: z.literal(SECURE_STORE_SCHEMA_VERSION),
    deleted: z.literal(true),
  })
  .strict();

export const secureStoreGetResultSchema = z
  .object({
    schemaVersion: z.literal(SECURE_STORE_SCHEMA_VERSION),
    secret: secureStoreSecretSchema,
  })
  .strict();

export const secureStoreErrorReasonSchema = z.enum([
  "UNAVAILABLE",
  "NOT_FOUND",
  "REJECTED",
  "INTERNAL",
]);

export const secureStoreRpcErrorSchema = z
  .object({
    code: z.literal(-32_020),
    message: z.literal("Secure store operation failed"),
    data: z.object({ reason: secureStoreErrorReasonSchema }).strict(),
  })
  .strict();

function rpcResponseSchema<T extends z.ZodType>(resultSchema: T) {
  return z
    .object({
      jsonrpc: z.literal("2.0"),
      id: rpcIdSchema,
      result: resultSchema.optional(),
      error: secureStoreRpcErrorSchema.optional(),
    })
    .strict()
    .superRefine((response, context) => {
      if ((response.result === undefined) === (response.error === undefined)) {
        context.addIssue({
          code: "custom",
          message: "RPC response must contain exactly one of result or error",
        });
      }
    });
}

export const secureStoreStatusRpcResponseSchema = rpcResponseSchema(
  secureStoreStatusResultSchema,
);
export const secureStoreSetRpcResponseSchema = rpcResponseSchema(
  secureStoreSetResultSchema,
);
export const secureStoreGetRpcResponseSchema = rpcResponseSchema(
  secureStoreGetResultSchema,
);
export const secureStoreDeleteRpcResponseSchema = rpcResponseSchema(
  secureStoreDeleteResultSchema,
);

export type SecureStoreErrorReason = z.infer<
  typeof secureStoreErrorReasonSchema
>;
export type SecureStoreGetResult = z.infer<typeof secureStoreGetResultSchema>;
export type SecureStoreMutationResult =
  | z.infer<typeof secureStoreSetResultSchema>
  | z.infer<typeof secureStoreDeleteResultSchema>;
export type SecureStoreStatusResult = z.infer<
  typeof secureStoreStatusResultSchema
>;
