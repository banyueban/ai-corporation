import { fileURLToPath } from "node:url";
import type { WorkspaceCanonicalizeResult } from "@ai-corporation/protocols";
import {
  openWorkspaceDatabase,
  WorkspaceRepository,
} from "@ai-corporation/storage";
import { afterEach, describe, expect, it } from "vitest";
import { WorkspaceNativeError } from "./native-core-client";
import { WorkspaceService } from "./workspace-service";

const migrationDirectory = fileURLToPath(
  new URL("../../../../packages/storage/migrations/", import.meta.url),
);
const databases: ReturnType<typeof openWorkspaceDatabase>[] = [];
const workspaceId = "019fa9bb-375e-7d90-a4e3-a5b0eea2a9ef";
const identity = {
  platform: "windows" as const,
  volumeRoot: "\\\\?\\E:",
  rootCreationTime: "133982208000000000",
};

afterEach(() => {
  while (databases.length > 0) {
    databases.pop()?.close();
  }
});

function createFixture(
  canonicalizeWorkspace: (
    rootPath: string,
    candidateRelativePath?: string,
  ) => Promise<WorkspaceCanonicalizeResult>,
) {
  const database = openWorkspaceDatabase(":memory:", migrationDirectory);
  databases.push(database);
  const repository = new WorkspaceRepository(database);
  const service = new WorkspaceService({
    clock: () => "2026-07-30T00:00:00.000Z",
    nativeClient: () => ({ canonicalizeWorkspace }),
    repository,
  });
  service.saveAuthorized("Example", {
    workspaceId,
    displayPath: "E:\\example",
    canonicalRootPath: "\\\\?\\E:\\example",
    permissionMode: "READ_WRITE",
    accessStatus: "AVAILABLE",
    pathIdentity: identity,
    lastVerifiedAt: "2026-07-29T00:00:00.000Z",
  });
  return { repository, service };
}

function successfulResult(
  overrides: Partial<WorkspaceCanonicalizeResult> = {},
): WorkspaceCanonicalizeResult {
  return {
    schemaVersion: 1,
    canonicalRootPath: "\\\\?\\E:\\example",
    canonicalPath: "\\\\?\\E:\\example",
    relativePath: "",
    targetExists: true,
    pathIdentity: identity,
    permissionMode: "READ_WRITE",
    ...overrides,
  };
}

describe("WorkspaceService", () => {
  it("lists only public records and persists successful revalidation", async () => {
    const fixture = createFixture(async () =>
      successfulResult({ permissionMode: "READ_ONLY" }),
    );

    expect(fixture.service.list()).toEqual({
      ok: true,
      value: [
        {
          workspaceId,
          displayPath: "E:\\example",
          permissionMode: "READ_WRITE",
          accessStatus: "AVAILABLE",
        },
      ],
    });

    await expect(fixture.service.revalidate(workspaceId)).resolves.toEqual({
      ok: true,
      value: {
        workspaceId,
        displayPath: "E:\\example",
        permissionMode: "READ_ONLY",
        accessStatus: "AVAILABLE",
      },
    });
    expect(fixture.repository.getTrusted(workspaceId)?.lastVerifiedAt).toBe(
      "2026-07-30T00:00:00.000Z",
    );
  });

  it("does not replace the trusted boundary when identity changes", async () => {
    const fixture = createFixture(async () =>
      successfulResult({
        pathIdentity: {
          ...identity,
          rootCreationTime: "133982208000000001",
        },
      }),
    );

    await expect(
      fixture.service.revalidate(workspaceId),
    ).resolves.toMatchObject({
      ok: true,
      value: {
        accessStatus: "UNVERIFIED",
      },
    });
    expect(fixture.repository.getTrusted(workspaceId)).toMatchObject({
      canonicalRootPath: "\\\\?\\E:\\example",
      pathIdentity: identity,
    });
  });

  it("persists missing and denied states without exposing Native errors", async () => {
    const missing = createFixture(async () => {
      throw new WorkspaceNativeError("ROOT_NOT_FOUND");
    });
    await expect(
      missing.service.revalidate(workspaceId),
    ).resolves.toMatchObject({
      ok: true,
      value: { accessStatus: "MISSING" },
    });

    const denied = createFixture(async () => {
      throw new WorkspaceNativeError("PERMISSION_DENIED");
    });
    await expect(denied.service.revalidate(workspaceId)).resolves.toMatchObject(
      {
        ok: true,
        value: { accessStatus: "PERMISSION_DENIED" },
      },
    );
  });

  it("returns fixed safe errors for unavailable dependencies and unknown IDs", async () => {
    const fixture = createFixture(async () => successfulResult());
    const unavailable = new WorkspaceService({
      nativeClient: () => undefined,
      repository: fixture.repository,
    });

    await expect(unavailable.revalidate(workspaceId)).resolves.toEqual({
      ok: false,
      error: {
        code: "NATIVE_CORE_UNAVAILABLE",
        message: "Workspace operation failed",
      },
    });
    await expect(
      fixture.service.revalidate("019fa9bb-375e-7d90-a4e3-a5b0eea2a9f0"),
    ).resolves.toMatchObject({
      ok: false,
      error: { code: "WORKSPACE_NOT_FOUND" },
    });
  });

  it("records an indeterminate state when permission-probe cleanup fails", async () => {
    const fixture = createFixture(async () => {
      throw new WorkspaceNativeError("PERMISSION_PROBE_CLEANUP_FAILED");
    });

    await expect(fixture.service.revalidate(workspaceId)).resolves.toEqual({
      ok: false,
      error: {
        code: "VERIFICATION_FAILED",
        message: "Workspace operation failed",
      },
    });
    expect(fixture.repository.getTrusted(workspaceId)).toMatchObject({
      accessStatus: "UNVERIFIED",
      lastVerifiedAt: "2026-07-30T00:00:00.000Z",
    });
  });
});
