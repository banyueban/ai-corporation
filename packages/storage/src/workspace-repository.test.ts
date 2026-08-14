import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { openWorkspaceDatabase } from "./workspace-database";
import {
  WorkspaceNotFoundError,
  WorkspaceRepository,
} from "./workspace-repository";

const migrationDirectory = fileURLToPath(
  new URL("../migrations/", import.meta.url),
);
const roots: string[] = [];

afterEach(() => {
  while (roots.length > 0) {
    const root = roots.pop();
    if (root !== undefined) {
      rmSync(root, { force: true, recursive: true });
    }
  }
});

function fixturePath(): string {
  const root = mkdtempSync(path.join(tmpdir(), "M1-TU-02-storage-"));
  roots.push(root);
  return path.join(root, "workspace.sqlite3");
}

function trustedRecord(
  workspaceId: string,
  displayPath: string,
  canonicalRootPath: string,
) {
  return {
    workspaceId,
    displayPath,
    canonicalRootPath,
    permissionMode: "READ_WRITE" as const,
    accessStatus: "AVAILABLE" as const,
    pathIdentity: {
      platform: "windows" as const,
      volumeRoot: "\\\\?\\E:",
      rootCreationTime: "133982208000000000",
    },
    lastVerifiedAt: "2026-07-29T00:00:00.000Z",
  };
}

describe("WorkspaceRepository", () => {
  it("saves trusted records and lists only stable public projections", () => {
    const database = openWorkspaceDatabase(fixturePath(), migrationDirectory);
    const repository = new WorkspaceRepository(database);
    const second = trustedRecord(
      "019fa9bb-375e-7d90-a4e3-a5b0eea2a9f0",
      "Second",
      "\\\\?\\E:\\second",
    );
    const first = trustedRecord(
      "019fa9bb-375e-7d90-a4e3-a5b0eea2a9ef",
      "First",
      "\\\\?\\E:\\first",
    );

    repository.saveAuthorized("Second", second, "2026-07-29T00:00:01.000Z");
    repository.saveAuthorized("First", first, "2026-07-29T00:00:00.000Z");

    expect(repository.getTrusted(first.workspaceId)).toEqual(first);
    expect(
      repository.getTrustedByCanonicalRoot(first.canonicalRootPath),
    ).toEqual(first);
    expect(repository.getTrustedByCanonicalRoot("E:\\missing")).toBeUndefined();
    expect(repository.listPublic()).toEqual([
      {
        workspaceId: first.workspaceId,
        displayPath: "First",
        permissionMode: "READ_WRITE",
        accessStatus: "AVAILABLE",
      },
      {
        workspaceId: second.workspaceId,
        displayPath: "Second",
        permissionMode: "READ_WRITE",
        accessStatus: "AVAILABLE",
      },
    ]);
    expect(JSON.stringify(repository.listPublic())).not.toContain(
      "canonicalRootPath",
    );
    database.close();
  });

  it("restores committed records after closing and reopening", () => {
    const databasePath = fixturePath();
    const first = trustedRecord(
      "019fa9bb-375e-7d90-a4e3-a5b0eea2a9ef",
      "First",
      "\\\\?\\E:\\first",
    );
    const initial = openWorkspaceDatabase(databasePath, migrationDirectory);
    new WorkspaceRepository(initial).saveAuthorized(
      "First",
      first,
      "2026-07-29T00:00:00.000Z",
    );
    initial.close();

    const reopened = openWorkspaceDatabase(databasePath, migrationDirectory);
    expect(
      new WorkspaceRepository(reopened).getTrusted(first.workspaceId),
    ).toEqual(first);
    expect(
      reopened.prepare("SELECT COUNT(*) AS count FROM schema_migrations").get()
        ?.count,
    ).toBe(18);
    reopened.close();
  });

  it("updates one Workspace atomically and rolls back missing IDs", () => {
    const database = openWorkspaceDatabase(fixturePath(), migrationDirectory);
    const repository = new WorkspaceRepository(database);
    const first = trustedRecord(
      "019fa9bb-375e-7d90-a4e3-a5b0eea2a9ef",
      "First",
      "\\\\?\\E:\\first",
    );
    const second = trustedRecord(
      "019fa9bb-375e-7d90-a4e3-a5b0eea2a9f0",
      "Second",
      "\\\\?\\E:\\second",
    );
    repository.saveAuthorized("First", first, "2026-07-29T00:00:00.000Z");
    repository.saveAuthorized("Second", second, "2026-07-29T00:00:01.000Z");

    const updated = repository.updateVerification(first.workspaceId, {
      permissionMode: null,
      accessStatus: "MISSING",
      lastVerifiedAt: "2026-07-29T00:01:00.000Z",
    });
    expect(updated.accessStatus).toBe("MISSING");
    expect(updated.permissionMode).toBe("READ_WRITE");
    expect(repository.getTrusted(second.workspaceId)).toEqual(second);

    expect(() =>
      repository.updateVerification("019fa9bb-375e-7d90-a4e3-a5b0eea2aff", {
        permissionMode: null,
        accessStatus: "MISSING",
        lastVerifiedAt: "2026-07-29T00:02:00.000Z",
      }),
    ).toThrow(WorkspaceNotFoundError);
    expect(repository.getTrusted(first.workspaceId)).toEqual(updated);
    database.close();
  });
});
