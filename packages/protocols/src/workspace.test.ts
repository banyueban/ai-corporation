import { describe, expect, it } from "vitest";
import {
  WORKSPACE_CANONICALIZE_RPC_METHOD,
  WORKSPACE_SCHEMA_VERSION,
  workspaceCanonicalizeRpcRequestSchema,
  workspaceCanonicalizeRpcResponseSchema,
  workspacePublicSchema,
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
