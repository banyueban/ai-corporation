import { describe, expect, it } from "vitest";
import {
  handleWorkspaceList,
  handleWorkspaceRevalidate,
  handleWorkspaceSelect,
} from "./workspace-ipc";

const workspaceId = "019fa9bb-375e-7d90-a4e3-a5b0eea2a9ef";
const service = {
  list: () => ({ ok: true as const, value: [] }),
  revalidate: async () => ({
    ok: true as const,
    value: {
      workspaceId,
      displayPath: "Example",
      permissionMode: "READ_WRITE" as const,
      accessStatus: "AVAILABLE" as const,
    },
  }),
  authorizeSelectedRoot: async () => ({
    ok: true as const,
    value: {
      status: "SELECTED" as const,
      workspace: {
        workspaceId,
        displayPath: "Example",
        permissionMode: "READ_WRITE" as const,
        accessStatus: "AVAILABLE" as const,
      },
    },
  }),
};

describe("Workspace IPC handlers", () => {
  it("accepts only authorized, strict allowlisted requests", async () => {
    expect(handleWorkspaceList(true, undefined, service)).toEqual({
      ok: true,
      value: [],
    });
    await expect(
      handleWorkspaceRevalidate(true, { workspaceId }, service),
    ).resolves.toMatchObject({
      ok: true,
      value: { workspaceId },
    });
  });

  it("rejects unauthorized callers and extra request fields", async () => {
    expect(handleWorkspaceList(false, undefined, service)).toMatchObject({
      ok: false,
      error: { code: "IPC_UNAUTHORIZED" },
    });
    expect(handleWorkspaceList(true, {}, service)).toMatchObject({
      ok: false,
      error: { code: "INVALID_REQUEST" },
    });
    await expect(
      handleWorkspaceRevalidate(
        true,
        { workspaceId, canonicalRootPath: "sensitive" },
        service,
      ),
    ).resolves.toEqual({
      ok: false,
      error: {
        code: "INVALID_REQUEST",
        message: "Workspace operation failed",
      },
    });
  });

  it("rejects invalid IDs without echoing the input", async () => {
    const result = await handleWorkspaceRevalidate(
      true,
      { workspaceId: "E:\\sensitive" },
      service,
    );
    expect(result).toMatchObject({
      ok: false,
      error: { code: "INVALID_REQUEST" },
    });
    expect(JSON.stringify(result)).not.toContain("sensitive");
  });

  it("keeps paths inside the trusted selection adapter", async () => {
    const selector = { select: async () => "E:\\example" };

    await expect(
      handleWorkspaceSelect(true, undefined, selector, service),
    ).resolves.toMatchObject({
      ok: true,
      value: { status: "SELECTED", workspace: { workspaceId } },
    });
    await expect(
      handleWorkspaceSelect(true, { path: "E:\\forged" }, selector, service),
    ).resolves.toMatchObject({
      ok: false,
      error: { code: "INVALID_REQUEST" },
    });
    await expect(
      handleWorkspaceSelect(false, undefined, selector, service),
    ).resolves.toMatchObject({
      ok: false,
      error: { code: "IPC_UNAUTHORIZED" },
    });
  });

  it("returns safe cancellation and selection failures", async () => {
    await expect(
      handleWorkspaceSelect(
        true,
        undefined,
        { select: async () => undefined },
        service,
      ),
    ).resolves.toEqual({
      ok: true,
      value: { status: "CANCELLED" },
    });
    await expect(
      handleWorkspaceSelect(
        true,
        undefined,
        {
          select: async () => {
            throw new Error("E:\\sensitive");
          },
        },
        service,
      ),
    ).resolves.toEqual({
      ok: false,
      error: {
        code: "SELECTION_UNAVAILABLE",
        message: "Workspace operation failed",
      },
    });
  });
});
