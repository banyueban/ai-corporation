import { describe, expect, it } from "vitest";
import {
  WORKSPACE_CANONICALIZE_RPC_METHOD,
  WORKSPACE_COPY_ASSET_RPC_METHOD,
  WORKSPACE_LIST_IPC_CHANNEL,
  WORKSPACE_LIST_RPC_METHOD,
  WORKSPACE_READ_TEXT_RPC_METHOD,
  WORKSPACE_REVALIDATE_IPC_CHANNEL,
  WORKSPACE_SCHEMA_VERSION,
  WORKSPACE_SELECT_IPC_CHANNEL,
  WORKSPACE_WRITE_TEXT_RPC_METHOD,
  workspaceCanonicalizeRpcRequestSchema,
  workspaceCanonicalizeRpcResponseSchema,
  workspaceCopyAssetRpcRequestSchema,
  workspaceCopyAssetRpcResponseSchema,
  workspaceListIpcResultSchema,
  workspaceListRpcRequestSchema,
  workspaceListRpcResponseSchema,
  workspacePublicSchema,
  workspaceReadTextRpcRequestSchema,
  workspaceReadTextRpcResponseSchema,
  workspaceRevalidateIpcResultSchema,
  workspaceRevalidateRequestSchema,
  workspaceSelectionSchema,
  workspaceSelectIpcResultSchema,
  workspaceTrustedRecordSchema,
  workspaceWriteTextRpcRequestSchema,
  workspaceWriteTextRpcResponseSchema,
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
    expect(WORKSPACE_SELECT_IPC_CHANNEL).toBe("workspace:select");
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

  it("strictly validates bounded text tool RPC messages", () => {
    const base = {
      jsonrpc: "2.0" as const,
      id: "workspace-tool-1",
      params: {
        schemaVersion: WORKSPACE_SCHEMA_VERSION,
        sessionToken: "a".repeat(64),
        rootPath: "E:\\projects\\example",
        relativePath: "docs/README.md",
      },
    };
    expect(
      workspaceListRpcRequestSchema.safeParse({
        ...base,
        method: WORKSPACE_LIST_RPC_METHOD,
      }).success,
    ).toBe(true);
    expect(
      workspaceReadTextRpcRequestSchema.safeParse({
        ...base,
        method: WORKSPACE_READ_TEXT_RPC_METHOD,
      }).success,
    ).toBe(true);
    expect(
      workspaceWriteTextRpcRequestSchema.safeParse({
        ...base,
        method: WORKSPACE_WRITE_TEXT_RPC_METHOD,
        params: { ...base.params, content: "结果" },
      }).success,
    ).toBe(true);
    expect(
      workspaceWriteTextRpcRequestSchema.safeParse({
        ...base,
        method: WORKSPACE_WRITE_TEXT_RPC_METHOD,
        params: { ...base.params, content: "结果", canonicalPath: "secret" },
      }).success,
    ).toBe(false);

    expect(
      workspaceListRpcResponseSchema.safeParse({
        jsonrpc: "2.0",
        id: "workspace-tool-1",
        result: {
          schemaVersion: 1,
          relativePath: "",
          entries: [{ relativePath: "docs", kind: "DIRECTORY" }],
        },
      }).success,
    ).toBe(true);
    const sha256 = "ab".repeat(32);
    expect(
      workspaceReadTextRpcResponseSchema.safeParse({
        jsonrpc: "2.0",
        id: "workspace-tool-1",
        result: {
          schemaVersion: 1,
          relativePath: "docs/README.md",
          content: "结果",
          sizeBytes: 6,
          sha256,
        },
      }).success,
    ).toBe(true);
    expect(
      workspaceWriteTextRpcResponseSchema.safeParse({
        jsonrpc: "2.0",
        id: "workspace-tool-1",
        result: {
          schemaVersion: 1,
          relativePath: "result.md",
          created: true,
          previousSha256: null,
          sha256,
          sizeBytes: 6,
        },
      }).success,
    ).toBe(true);
  });

  it("keeps Skill asset source and Workspace target inside the trusted RPC", () => {
    const request = {
      jsonrpc: "2.0" as const,
      id: "skill-asset-1",
      method: WORKSPACE_COPY_ASSET_RPC_METHOD,
      params: {
        schemaVersion: WORKSPACE_SCHEMA_VERSION,
        sessionToken: "a".repeat(64),
        sourceRootPath: "C:\\app-data\\pi-skills\\template-skill",
        sourceRelativePath: "assets/template.bin",
        expectedSha256: "ab".repeat(32),
        expectedSizeBytes: 4,
        rootPath: "E:\\projects\\example",
        relativePath: "template.bin",
      },
    };
    expect(workspaceCopyAssetRpcRequestSchema.safeParse(request).success).toBe(
      true,
    );
    expect(
      workspaceCopyAssetRpcRequestSchema.safeParse({
        ...request,
        params: { ...request.params, unexpected: true },
      }).success,
    ).toBe(false);
    expect(
      workspaceCopyAssetRpcResponseSchema.safeParse({
        jsonrpc: "2.0",
        id: "skill-asset-1",
        result: {
          schemaVersion: 1,
          relativePath: "template.bin",
          created: true,
          sha256: "ab".repeat(32),
          sizeBytes: 4,
        },
      }).success,
    ).toBe(true);
  });

  it("accepts only strict public directory selection results", () => {
    const publicWorkspace = {
      workspaceId,
      displayPath: "E:\\projects\\example",
      permissionMode: "READ_WRITE" as const,
      accessStatus: "AVAILABLE" as const,
    };

    expect(
      workspaceSelectionSchema.parse({
        status: "SELECTED",
        workspace: publicWorkspace,
      }),
    ).toEqual({
      status: "SELECTED",
      workspace: publicWorkspace,
    });
    expect(
      workspaceSelectIpcResultSchema.parse({
        ok: true,
        value: { status: "CANCELLED" },
      }),
    ).toEqual({
      ok: true,
      value: { status: "CANCELLED" },
    });
    expect(
      workspaceSelectionSchema.safeParse({
        status: "CANCELLED",
        canonicalRootPath: "E:\\sensitive",
      }).success,
    ).toBe(false);
    expect(
      workspaceSelectionSchema.safeParse({
        status: "SELECTED",
        workspace: {
          ...publicWorkspace,
          pathIdentity: { platform: "windows" },
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
