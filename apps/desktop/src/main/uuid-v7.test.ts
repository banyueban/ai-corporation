import { workspacePublicSchema } from "@ai-corporation/protocols";
import { describe, expect, it } from "vitest";
import { createUuidV7 } from "./uuid-v7";

describe("createUuidV7", () => {
  it("sets RFC version and variant bits using trusted randomness", () => {
    const workspaceId = createUuidV7({
      now: () => 0,
      random: () => new Uint8Array(10),
    });

    expect(workspaceId).toBe("00000000-0000-7000-8000-000000000000");
    expect(
      workspacePublicSchema.safeParse({
        workspaceId,
        displayPath: "Example",
        permissionMode: "READ_WRITE",
        accessStatus: "AVAILABLE",
      }).success,
    ).toBe(true);
  });

  it("rejects invalid clocks and random sources", () => {
    expect(() =>
      createUuidV7({
        now: () => -1,
        random: () => new Uint8Array(10),
      }),
    ).toThrow("UUID timestamp is unavailable");
    expect(() =>
      createUuidV7({
        now: () => 0,
        random: () => new Uint8Array(9),
      }),
    ).toThrow("UUID randomness is unavailable");
  });
});
