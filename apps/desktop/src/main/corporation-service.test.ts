import { describe, expect, it, vi } from "vitest";
import { CorporationService } from "./corporation-service";

const workspaceId = "019fa9bb-375e-7d90-a4e3-a5b0eea2a9ef";
const commandId = "019fa9bb-375f-7d90-a4e3-a5b0eea2a9ef";
const corporationId = "019fa9bb-3760-7d90-a4e3-a5b0eea2a9ef";
const eventId = "019fa9bb-3761-7d90-a4e3-a5b0eea2a9ef";
const now = "2026-07-30T00:00:00.000Z";

describe("CorporationService", () => {
  it("revalidates Workspace before creating and writes a trusted projection", async () => {
    const create = vi.fn((input) => input.corporation);
    const service = new CorporationService({
      clock: () => now,
      repository: {
        archive: vi.fn(),
        create,
        get: vi.fn(),
        list: vi.fn(),
        updateName: vi.fn(),
      },
      revalidateWorkspace: vi.fn(async () => ({
        ok: true as const,
        value: {
          workspaceId,
          displayPath: "sensitive display path",
          permissionMode: "READ_WRITE" as const,
          accessStatus: "AVAILABLE" as const,
        },
      })),
      uuid: sequence(corporationId, eventId),
    });

    const result = await service.create({
      schemaVersion: "1.0",
      commandId,
      workspaceId,
      name: " Café ",
    });
    expect(result).toMatchObject({
      ok: true,
      value: {
        id: corporationId,
        workspaceId,
        name: "Café",
        status: "DRAFT",
        version: 1,
      },
    });
    expect(JSON.stringify(result)).not.toContain("sensitive display path");
    expect(create).toHaveBeenCalledOnce();
  });

  it.each(["MISSING", "PERMISSION_DENIED", "UNVERIFIED"] as const)(
    "does not write when Workspace is %s",
    async (accessStatus) => {
      const create = vi.fn();
      const service = new CorporationService({
        repository: {
          archive: vi.fn(),
          create,
          get: vi.fn(),
          list: vi.fn(),
          updateName: vi.fn(),
        },
        revalidateWorkspace: vi.fn(async () => ({
          ok: true as const,
          value: {
            workspaceId,
            displayPath: "hidden",
            permissionMode: "READ_ONLY" as const,
            accessStatus,
          },
        })),
      });
      expect(
        await service.create({
          schemaVersion: "1.0",
          commandId,
          workspaceId,
          name: "Example",
        }),
      ).toMatchObject({
        ok: false,
        error: { code: "WORKSPACE_UNAVAILABLE" },
      });
      expect(create).not.toHaveBeenCalled();
    },
  );

  it("does not write when Workspace is missing or verification fails", async () => {
    const create = vi.fn();
    const repository = {
      archive: vi.fn(),
      create,
      get: vi.fn(),
      list: vi.fn(),
      updateName: vi.fn(),
    };
    const request = {
      schemaVersion: "1.0" as const,
      commandId,
      workspaceId,
      name: "Example",
    };
    const missing = new CorporationService({
      repository,
      revalidateWorkspace: vi.fn(async () => ({
        ok: false as const,
        error: {
          code: "WORKSPACE_NOT_FOUND" as const,
          message: "Workspace operation failed" as const,
        },
      })),
    });
    const unavailable = new CorporationService({
      repository,
      revalidateWorkspace: vi.fn(async () => {
        throw new Error("native unavailable");
      }),
    });
    expect(await missing.create(request)).toMatchObject({
      ok: false,
      error: { code: "WORKSPACE_UNAVAILABLE" },
    });
    expect(await unavailable.create(request)).toMatchObject({
      ok: false,
      error: { code: "WORKSPACE_UNAVAILABLE" },
    });
    expect(create).not.toHaveBeenCalled();
  });
});

function sequence(...values: readonly string[]) {
  let index = 0;
  return () => {
    const value = values[index];
    index += 1;
    if (value === undefined) throw new Error("UUID fixture exhausted");
    return value;
  };
}
