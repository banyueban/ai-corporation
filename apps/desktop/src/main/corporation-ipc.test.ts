import { describe, expect, it, vi } from "vitest";
import {
  handleCorporationArchive,
  handleCorporationCreate,
  handleCorporationGet,
  handleCorporationList,
  handleCorporationUpdateName,
} from "./corporation-ipc";

const id = "019fa9bb-375e-7d90-a4e3-a5b0eea2a9ef";
const success = {
  ok: true as const,
  value: {
    schemaVersion: "1.0" as const,
    id,
    workspaceId: id,
    name: "Example",
    status: "DRAFT" as const,
    version: 1,
    createdAt: "2026-07-30T00:00:00.000Z",
    updatedAt: "2026-07-30T00:00:00.000Z",
  },
};

describe("Corporation IPC boundary", () => {
  const service = {
    archive: vi.fn(() => success),
    create: vi.fn(async () => success),
    get: vi.fn(() => success),
    list: vi.fn(() => ({ ok: true as const, value: [success.value] })),
    updateName: vi.fn(() => success),
  };

  it("rejects untrusted callers before dispatch", async () => {
    expect(await handleCorporationCreate(false, {}, service)).toMatchObject({
      ok: false,
      error: { code: "UNAUTHORIZED_CALLER" },
    });
    expect(service.create).not.toHaveBeenCalled();
  });

  it("rejects extra, forged, and invalid fields across every channel", async () => {
    const invalid = {
      schemaVersion: "1.0",
      corporationId: id,
      status: "DRAFT",
    };
    for (const result of [
      await handleCorporationCreate(true, invalid, service),
      handleCorporationGet(true, invalid, service),
      handleCorporationList(true, invalid, service),
      handleCorporationUpdateName(true, invalid, service),
      handleCorporationArchive(true, invalid, service),
    ]) {
      expect(result).toMatchObject({
        ok: false,
        error: { code: "VALIDATION_FAILED" },
      });
    }
  });

  it("dispatches strict valid requests", async () => {
    expect(
      await handleCorporationCreate(
        true,
        {
          schemaVersion: "1.0",
          commandId: id,
          workspaceId: id,
          name: " Example ",
        },
        service,
      ),
    ).toEqual(success);
    expect(service.create).toHaveBeenCalledWith(
      expect.objectContaining({ name: "Example" }),
    );
  });
});
