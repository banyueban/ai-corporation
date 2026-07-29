import { describe, expect, it } from "vitest";
import {
  WORKSPACE_CANONICALIZE_RPC_METHOD,
  WORKSPACE_LIST_IPC_CHANNEL,
  WORKSPACE_REVALIDATE_IPC_CHANNEL,
  WORKSPACE_SCHEMA_VERSION,
  workspaceCanonicalizeRpcRequestSchema,
  workspaceCanonicalizeRpcResponseSchema,
  workspaceListIpcResultSchema,
  workspacePublicSchema,
  workspaceRevalidateIpcResultSchema,
  workspaceRevalidateRequestSchema,
  workspaceTrustedRecordSchema,
} from "./workspace";

const workspaceId = "019fa9bb-375e-7d90-a4e3-a5b0eea2a9ef";

describe("workspace protocol", () => {
  it("keeps trusted path fields out of the Renderer DTO", () => {
    expect(
      workspacePublicSchema.safeParse({
        workspaceId,
        displayPath: "E:\\projects\\example",
        permissionMode: "READ_WRITE",
        accessStatus: "AVAILABLE",
      }).success,
    ).toBe(true);

    expect(
      workspacePublicSchema.safeParse({
        workspaceId,
        displayPath: "E:\\projects\\example",
        permissionMode: "READ_WRITE",
        accessStatus: "AVAILABLE",
        canonicalRootPath: "\\\\?\\E:\\projects\\example",
        pathIdentity: {
          platform: "windows",
          volumeRoot: "\\\\?\\E:",
          rootCreationTime: "133982208000000000",
        },
      }).success,
    ).toBe(false);
  });

  it("validates trusted Workspace metadata separately", () => {
    expect(
      workspaceTrustedRecordSchema.safeParse({
        workspaceId,
        displayPath: "/Users/example/project",
        permissionMode: "READ_ONLY",
        accessStatus: "UNVERIFIED",
        canonicalRootPath: "/Users/example/project",
        pathIdentity: {
          platform: "macos",
          deviceId: "16777234",
          inode: "98765",
        },
        lastVerifiedAt: "2026-07-29T00:00:00.000Z",
      }).success,
    ).toBe(true);
  });

  it("accepts the internal canonicalize RPC contract", () => {
    expect(
      workspaceCanonicalizeRpcRequestSchema.safeParse({
        jsonrpc: "2.0",
        id: "workspace-1",
        method: WORKSPACE_CANONICALIZE_RPC_METHOD,
        params: {
          schemaVersion: WORKSPACE_SCHEMA_VERSION,
          sessionToken: "a".repeat(64),
          rootPath: "/Users/example/project",
          candidateRelativePath: "docs/README.md",
        },
      }).success,
    ).toBe(true);

    expect(
      workspaceCanonicalizeRpcResponseSchema.safeParse({
        jsonrpc: "2.0",
        id: "workspace-1",
        result: {
          schemaVersion: WORKSPACE_SCHEMA_VERSION,
          canonicalRootPath: "\\\\?\\E:\\projects\\example",
          canonicalPath: "\\\\?\\E:\\projects\\example\\docs\\README.md",
          relativePath: "docs\\README.md",
          targetExists: true,
          permissionMode: "READ_WRITE",
          pathIdentity: {
            platform: "windows",
            volumeRoot: "\\\\?\\E:",
            rootCreationTime: "133982208000000000",
          },
        },
      }).success,
    ).toBe(true);

    expect(
      workspaceCanonicalizeRpcResponseSchema.safeParse({
        jsonrpc: "2.0",
        id: "workspace-1",
        error: {
          code: -32_010,
          message: "Workspace path rejected",
          data: {
            reason: "OUTSIDE_ROOT",
          },
        },
      }).success,
    ).toBe(true);
  });

  it("freezes narrow Workspace IPC channels and public-only results", () => {
    expect(WORKSPACE_LIST_IPC_CHANNEL).toBe("workspace:list");
    expect(WORKSPACE_REVALIDATE_IPC_CHANNEL).toBe("workspace:revalidate");
    expect(
      workspaceRevalidateRequestSchema.safeParse({
        workspaceId,
      }).success,
    ).toBe(true);

    expect(
      workspaceListIpcResultSchema.safeParse({
        ok: true,
        value: [
          {
            workspaceId,
            displayPath: "E:\\projects\\example",
            permissionMode: "READ_WRITE",
            accessStatus: "AVAILABLE",
          },
        ],
      }).success,
    ).toBe(true);

    expect(
      workspaceRevalidateIpcResultSchema.safeParse({
        ok: true,
        value: {
          workspaceId,
          displayPath: "E:\\projects\\example",
          permissionMode: "READ_WRITE",
          accessStatus: "AVAILABLE",
          canonicalRootPath: "sensitive",
        },
      }).success,
    ).toBe(false);
  });

  it("rejects unsafe Workspace IPC requests and errors", () => {
    expect(
      workspaceRevalidateRequestSchema.safeParse({
        workspaceId: "not-a-uuid",
        canonicalRootPath: "sensitive",
      }).success,
    ).toBe(false);

    expect(
      workspaceRevalidateIpcResultSchema.safeParse({
        ok: false,
        error: {
          code: "VERIFICATION_FAILED",
          message: "sensitive database error",
        },
      }).success,
    ).toBe(false);
  });

  it("rejects absolute Renderer capabilities and unstructured errors", () => {
    expect(
      workspaceCanonicalizeRpcResponseSchema.safeParse({
        jsonrpc: "2.0",
        id: "workspace-2",
        error: {
          code: -32_010,
          message: "E:\\secret\\outside.txt",
        },
      }).success,
    ).toBe(false);
  });
});
