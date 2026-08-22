import { z } from "zod";

export const WORKSPACE_SCHEMA_VERSION = 1 as const;
export const WORKSPACE_CANONICALIZE_RPC_METHOD =
  "workspace.canonicalize" as const;
export const WORKSPACE_LIST_RPC_METHOD = "workspace.list" as const;
export const WORKSPACE_READ_TEXT_RPC_METHOD = "workspace.read_text" as const;
export const WORKSPACE_INSPECT_FILE_RPC_METHOD =
  "workspace.inspect_file" as const;
export const WORKSPACE_WRITE_TEXT_RPC_METHOD = "workspace.write_text" as const;
export const WORKSPACE_LIST_IPC_CHANNEL = "workspace:list" as const;
export const WORKSPACE_REVALIDATE_IPC_CHANNEL = "workspace:revalidate" as const;
export const WORKSPACE_SELECT_IPC_CHANNEL = "workspace:select" as const;

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
  "NOT_FOUND",
  "NOT_FILE",
  "NOT_DIRECTORY",
  "SENSITIVE_PATH",
  "BINARY_FILE",
  "FILE_TOO_LARGE",
  "CONFLICT",
  "WRITE_FAILED",
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

const workspaceRelativePathSchema = z.string().max(32_767);
const sha256Schema = z.string().regex(/^[a-f0-9]{64}$/u);

function workspacePathRpcRequestSchema(method: string) {
  return z
    .object({
      jsonrpc: z.literal("2.0"),
      id: rpcIdSchema,
      method: z.literal(method),
      params: z
        .object({
          schemaVersion: z.literal(WORKSPACE_SCHEMA_VERSION),
          sessionToken: z.string().min(32).max(256),
          rootPath: z.string().min(1).max(32_767),
          relativePath: workspaceRelativePathSchema,
        })
        .strict(),
    })
    .strict();
}

export const workspaceListRpcRequestSchema = workspacePathRpcRequestSchema(
  WORKSPACE_LIST_RPC_METHOD,
);
export const workspaceReadTextRpcRequestSchema = workspacePathRpcRequestSchema(
  WORKSPACE_READ_TEXT_RPC_METHOD,
);
export const workspaceInspectFileRpcRequestSchema =
  workspacePathRpcRequestSchema(WORKSPACE_INSPECT_FILE_RPC_METHOD);
export const workspaceWriteTextRpcRequestSchema = z
  .object({
    jsonrpc: z.literal("2.0"),
    id: rpcIdSchema,
    method: z.literal(WORKSPACE_WRITE_TEXT_RPC_METHOD),
    params: z
      .object({
        schemaVersion: z.literal(WORKSPACE_SCHEMA_VERSION),
        sessionToken: z.string().min(32).max(256),
        rootPath: z.string().min(1).max(32_767),
        relativePath: workspaceRelativePathSchema,
        content: z.string().max(1_048_576),
        baseSha256: sha256Schema.optional(),
      })
      .strict(),
  })
  .strict();

export const workspaceListEntrySchema = z
  .object({
    relativePath: workspaceRelativePathSchema,
    kind: z.enum(["FILE", "DIRECTORY"]),
    sizeBytes: z.number().int().nonnegative().optional(),
  })
  .strict();
export const workspaceListResultSchema = z
  .object({
    schemaVersion: z.literal(WORKSPACE_SCHEMA_VERSION),
    relativePath: workspaceRelativePathSchema,
    entries: z.array(workspaceListEntrySchema).max(200),
  })
  .strict();
export const workspaceReadTextResultSchema = z
  .object({
    schemaVersion: z.literal(WORKSPACE_SCHEMA_VERSION),
    relativePath: workspaceRelativePathSchema,
    content: z.string().max(1_048_576),
    sizeBytes: z.number().int().nonnegative().max(1_048_576),
    sha256: sha256Schema,
  })
  .strict();
export const workspaceInspectFileResultSchema = z
  .object({
    schemaVersion: z.literal(WORKSPACE_SCHEMA_VERSION),
    canonicalPath: z.string().min(1).max(32_767),
    relativePath: workspaceRelativePathSchema,
    sizeBytes: z.number().int().nonnegative().max(104_857_600),
    sha256: sha256Schema,
  })
  .strict();
export const workspaceWriteTextResultSchema = z
  .object({
    schemaVersion: z.literal(WORKSPACE_SCHEMA_VERSION),
    relativePath: workspaceRelativePathSchema,
    created: z.boolean(),
    previousSha256: sha256Schema.nullable(),
    sha256: sha256Schema,
    sizeBytes: z.number().int().nonnegative().max(1_048_576),
  })
  .strict();

function workspaceOperationRpcResponseSchema<T extends z.ZodType>(result: T) {
  return z
    .object({
      jsonrpc: z.literal("2.0"),
      id: rpcIdSchema,
      result: result.optional(),
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
}

export const workspaceListRpcResponseSchema =
  workspaceOperationRpcResponseSchema(workspaceListResultSchema);
export const workspaceReadTextRpcResponseSchema =
  workspaceOperationRpcResponseSchema(workspaceReadTextResultSchema);
export const workspaceInspectFileRpcResponseSchema =
  workspaceOperationRpcResponseSchema(workspaceInspectFileResultSchema);
export const workspaceWriteTextRpcResponseSchema =
  workspaceOperationRpcResponseSchema(workspaceWriteTextResultSchema);

export const workspaceIpcErrorCodeSchema = z.enum([
  "WORKSPACE_NOT_FOUND",
  "NATIVE_CORE_UNAVAILABLE",
  "STORAGE_UNAVAILABLE",
  "VERIFICATION_FAILED",
  "SELECTION_UNAVAILABLE",
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

export const workspaceSelectionSchema = z.discriminatedUnion("status", [
  z
    .object({
      status: z.literal("SELECTED"),
      workspace: workspacePublicSchema,
    })
    .strict(),
  z
    .object({
      status: z.literal("CANCELLED"),
    })
    .strict(),
]);

export const workspaceSelectIpcResultSchema = z.discriminatedUnion("ok", [
  z
    .object({
      ok: z.literal(true),
      value: workspaceSelectionSchema,
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
export type WorkspaceListResult = z.infer<typeof workspaceListResultSchema>;
export type WorkspaceInspectFileResult = z.infer<
  typeof workspaceInspectFileResultSchema
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
export type WorkspaceReadTextResult = z.infer<
  typeof workspaceReadTextResultSchema
>;
export type WorkspaceWriteTextResult = z.infer<
  typeof workspaceWriteTextResultSchema
>;
export type WorkspaceSelection = z.infer<typeof workspaceSelectionSchema>;
export type WorkspaceSelectIpcResult = z.infer<
  typeof workspaceSelectIpcResultSchema
>;
export type WorkspaceTrustedRecord = z.infer<
  typeof workspaceTrustedRecordSchema
>;
