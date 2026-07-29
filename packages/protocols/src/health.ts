import { z } from "zod";

export const HEALTH_RPC_METHOD = "health" as const;
export const HEALTH_SCHEMA_VERSION = 1 as const;
export const NATIVE_HEALTH_IPC_CHANNEL = "native:health" as const;

const rpcIdSchema = z.union([z.string(), z.number(), z.null()]);

export const healthRpcRequestSchema = z
  .object({
    jsonrpc: z.literal("2.0"),
    id: rpcIdSchema,
    method: z.literal(HEALTH_RPC_METHOD),
    params: z
      .object({
        schemaVersion: z.literal(HEALTH_SCHEMA_VERSION),
        sessionToken: z.string().min(32).max(256),
      })
      .strict(),
  })
  .strict();

export const healthResultSchema = z
  .object({
    schemaVersion: z.literal(HEALTH_SCHEMA_VERSION),
    status: z.literal("ok"),
    version: z.string().min(1),
    pid: z.number().int().positive(),
  })
  .strict();

export const rpcErrorSchema = z
  .object({
    code: z.number().int(),
    message: z.string().min(1),
  })
  .strict();

export const healthRpcResponseSchema = z
  .object({
    jsonrpc: z.literal("2.0"),
    id: rpcIdSchema,
    result: healthResultSchema.optional(),
    error: rpcErrorSchema.optional(),
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

export type HealthResult = z.infer<typeof healthResultSchema>;
export type HealthRpcRequest = z.infer<typeof healthRpcRequestSchema>;
export type HealthRpcResponse = z.infer<typeof healthRpcResponseSchema>;
