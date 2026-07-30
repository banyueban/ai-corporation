import { describe, expect, it, vi } from "vitest";
import type { CorporationPublic } from "@ai-corporation/protocols";
import {
  CorporationCommandConflictError,
  CorporationNotFoundError,
  type CorporationStateRepository,
  CorporationStateConflictError,
  CorporationVersionConflictError,
} from "@ai-corporation/storage";
import { CorporationStateService } from "./corporation-state-service";

const corporationId = "019fa9bb-6100-7d90-a4e3-a5b0eea2a9ef";
const workspaceId = "019fa9bb-6101-7d90-a4e3-a5b0eea2a9ef";
const commandId = "019fa9bb-6102-7d90-a4e3-a5b0eea2a9ef";
const eventId = "019fa9bb-6103-7d90-a4e3-a5b0eea2a9ef";
const now = "2026-07-30T06:00:00.000Z";

describe("CorporationStateService", () => {
  it("uses trusted workspace, time and event ID for pause", async () => {
    const paused: CorporationPublic = {
      ...corporation(),
      status: "PAUSED",
      version: 2,
      updatedAt: now,
      pausedFrom: "DRAFT",
      pausedAt: now,
    };
    const pause = vi.fn(() => paused);
    const stateService = createService({ pause, resume: vi.fn() });
    await expect(stateService.pause(request())).resolves.toEqual({
      ok: true,
      value: paused,
    });
    expect(pause).toHaveBeenCalledWith({
      command: {
        commandId,
        commandType: "PAUSE",
        requestHash: expect.stringMatching(/^[0-9a-f]{64}$/u),
      },
      corporationId,
      expectedVersion: 1,
      eventId,
      now,
    });
  });

  it.each(["MISSING", "PERMISSION_DENIED", "UNVERIFIED"] as const)(
    "rejects %s workspace before repository mutation",
    async (accessStatus) => {
      const pause = vi.fn();
      const stateService = createService(
        { pause, resume: vi.fn() },
        { accessStatus },
      );
      await expect(stateService.pause(request())).resolves.toMatchObject({
        ok: false,
        error: { code: "WORKSPACE_UNAVAILABLE" },
      });
      expect(pause).not.toHaveBeenCalled();
    },
  );

  it("rejects failed workspace revalidation before repository mutation", async () => {
    const pause = vi.fn();
    const stateService = new CorporationStateService({
      repository: { pause, resume: vi.fn() },
      resolveWorkspaceId: () => workspaceId,
      revalidateWorkspace: async () => {
        throw new Error("probe failed");
      },
    });
    await expect(stateService.pause(request())).resolves.toMatchObject({
      ok: false,
      error: { code: "WORKSPACE_UNAVAILABLE" },
    });
    expect(pause).not.toHaveBeenCalled();
  });

  it.each([
    [new CorporationNotFoundError(), "NOT_FOUND"],
    [new CorporationVersionConflictError(), "VERSION_CONFLICT"],
    [new CorporationStateConflictError(), "STATE_CONFLICT"],
    [new CorporationCommandConflictError(), "COMMAND_CONFLICT"],
    [new Error("private storage detail"), "STORAGE_UNAVAILABLE"],
  ] as const)(
    "maps repository failures to fixed %s errors",
    async (error, code) => {
      const stateService = createService({
        pause: vi.fn(() => {
          throw error;
        }),
        resume: vi.fn(),
      });
      await expect(stateService.pause(request())).resolves.toMatchObject({
        ok: false,
        error: { code },
      });
    },
  );
});

function createService(
  repository: Pick<CorporationStateRepository, "pause" | "resume">,
  workspace: {
    accessStatus: "AVAILABLE" | "MISSING" | "PERMISSION_DENIED" | "UNVERIFIED";
  } = {
    accessStatus: "AVAILABLE",
  },
) {
  return new CorporationStateService({
    clock: () => now,
    repository,
    resolveWorkspaceId: () => workspaceId,
    revalidateWorkspace: async () => ({
      ok: true,
      value: {
        schemaVersion: "1.0",
        workspaceId,
        name: "Workspace",
        displayPath: "E:\\Workspace",
        platform: "windows",
        permissionMode: "READ_WRITE",
        accessStatus: workspace.accessStatus,
        identityStatus: "MATCH",
        verifiedAt: now,
      },
    }),
    uuid: () => eventId,
  });
}

function request() {
  return {
    schemaVersion: "1.0" as const,
    commandId,
    corporationId,
    expectedVersion: 1,
  };
}

function corporation(): CorporationPublic {
  return {
    schemaVersion: "1.0",
    id: corporationId,
    workspaceId,
    name: "Corporation",
    status: "DRAFT",
    version: 1,
    createdAt: now,
    updatedAt: now,
  };
}
