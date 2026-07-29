import { z } from "zod";

export const WORKSPACE_SCHEMA_VERSION = 1 as const;
export const WORKSPACE_CANONICALIZE_RPC_METHOD =
  "workspace.canonicalize" as const;
export const WORKSPACE_LIST_IPC_CHANNEL = "workspace:list" as const;
export const WORKSPACE_REVALIDATE_IPC_CHANNEL = "workspace:revalidate" as const;

export const workspacePermissionModeSchema = z.enum([
  "READ_ONLY",
  "READ_WRITE",
]);

export const workspaceAccessStatusSchema = z.enum([
  "UNVERIFIED",
  "AVAILABLE",
  "MISSING",
  "PERMISSION_DENIED",
]);

export const workspacePublicSchema = z
  .object({
    workspaceId: z.uuidv7(),
    displayPath: z.string().min(1).max(32_767),
    permissionMode: workspacePermissionModeSchema,
    accessStatus: workspaceAccessStatusSchema,
  })
  .strict();

export const workspacePathIdentitySchema = z.discriminatedUnion("platform", [
  z
    .object({
      platform: z.literal("windows"),
      volumeRoot: z.string().min(1).max(1_024),
      rootCreationTime: z.string().regex(/^\d+$/u),
    })
    .strict(),
  z
    .object({
      platform: z.literal("macos"),
      deviceId: z.string().regex(/^\d+$/u),
      inode: z.string().regex(/^\d+$/u),
    })
    .strict(),
]);

export const workspaceTrustedRecordSchema = z
  .object({
    workspaceId: z.uuidv7(),
    displayPath: z.string().min(1).max(32_767),
    permissionMode: workspacePermissionModeSchema,
    accessStatus: workspaceAccessStatusSchema,
    canonicalRootPath: z.string().min(1).max(32_767),
    pathIdentity: workspacePathIdentitySchema,
    lastVerifiedAt: z.iso.datetime({ offset: true }).nullable(),
  })
  .strict();

export const workspacePathErrorReasonSchema = z.enum([
  "INVALID_PATH",
  "ROOT_NOT_FOUND",
  "PERMISSION_DENIED",
  "OUTSIDE_ROOT",
  "LINK_ESCAPE",
  "PATH_IDENTITY_UNAVAILABLE",
  "PERMISSION_PROBE_FAILED",
  "PERMISSION_PROBE_CLEANUP_FAILED",
]);

const rpcIdSchema = z.union([z.string(), z.number(), z.null()]);

export const workspaceCanonicalizeRpcRequestSchema = z
  .object({
    jsonrpc: z.literal("2.0"),
    id: rpcIdSchema,
    method: z.literal(WORKSPACE_CANONICALIZE_RPC_METHOD),
    params: z
      .object({
        schemaVersion: z.literal(WORKSPACE_SCHEMA_VERSION),
        sessionToken: z.string().min(32).max(256),
        rootPath: z.string().min(1).max(32_767),
        candidateRelativePath: z.string().max(32_767),
      })
      .strict(),
  })
  .strict();

export const workspaceCanonicalizeResultSchema = z
  .object({
    schemaVersion: z.literal(WORKSPACE_SCHEMA_VERSION),
    canonicalRootPath: z.string().min(1).max(32_767),
    canonicalPath: z.string().min(1).max(32_767),
    relativePath: z.string().max(32_767),
    targetExists: z.boolean(),
    pathIdentity: workspacePathIdentitySchema,
    permissionMode: workspacePermissionModeSchema.optional(),
  })
  .strict();

export const workspaceRpcErrorSchema = z
  .object({
    code: z.literal(-32_010),
    message: z.literal("Workspace path rejected"),
    data: z
      .object({
        reason: workspacePathErrorReasonSchema,
      })
      .strict(),
  })
  .strict();

export const workspaceCanonicalizeRpcResponseSchema = z
  .object({
    jsonrpc: z.literal("2.0"),
    id: rpcIdSchema,
    result: workspaceCanonicalizeResultSchema.optional(),
    error: workspaceRpcErrorSchema.optional(),
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

export const workspaceIpcErrorCodeSchema = z.enum([
  "WORKSPACE_NOT_FOUND",
  "NATIVE_CORE_UNAVAILABLE",
  "STORAGE_UNAVAILABLE",
  "VERIFICATION_FAILED",
  "IPC_UNAUTHORIZED",
  "INVALID_REQUEST",
]);

export const workspaceIpcErrorSchema = z
  .object({
    code: workspaceIpcErrorCodeSchema,
    message: z.literal("Workspace operation failed"),
  })
  .strict();

export const workspaceRevalidateRequestSchema = z
  .object({
    workspaceId: z.uuidv7(),
  })
  .strict();

export const workspaceListIpcResultSchema = z.discriminatedUnion("ok", [
  z
    .object({
      ok: z.literal(true),
      value: z.array(workspacePublicSchema),
    })
    .strict(),
  z
    .object({
      ok: z.literal(false),
      error: workspaceIpcErrorSchema,
    })
    .strict(),
]);

export const workspaceRevalidateIpcResultSchema = z.discriminatedUnion("ok", [
  z
    .object({
      ok: z.literal(true),
      value: workspacePublicSchema,
    })
    .strict(),
  z
    .object({
      ok: z.literal(false),
      error: workspaceIpcErrorSchema,
    })
    .strict(),
]);

export type WorkspaceAccessStatus = z.infer<typeof workspaceAccessStatusSchema>;
export type WorkspaceCanonicalizeResult = z.infer<
  typeof workspaceCanonicalizeResultSchema
>;
export type WorkspaceIpcErrorCode = z.infer<typeof workspaceIpcErrorCodeSchema>;
export type WorkspaceListIpcResult = z.infer<
  typeof workspaceListIpcResultSchema
>;
export type WorkspacePathErrorReason = z.infer<
  typeof workspacePathErrorReasonSchema
>;
export type WorkspacePathIdentity = z.infer<typeof workspacePathIdentitySchema>;
export type WorkspacePermissionMode = z.infer<
  typeof workspacePermissionModeSchema
>;
export type WorkspacePublic = z.infer<typeof workspacePublicSchema>;
export type WorkspaceRevalidateIpcResult = z.infer<
  typeof workspaceRevalidateIpcResultSchema
>;
export type WorkspaceRevalidateRequest = z.infer<
  typeof workspaceRevalidateRequestSchema
>;
export type WorkspaceTrustedRecord = z.infer<
  typeof workspaceTrustedRecordSchema
>;
