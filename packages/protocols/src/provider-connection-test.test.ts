import { describe, expect, it } from "vitest";
import {
  providerCancelConnectionTestRequestSchema,
  providerConnectionTestResultSchema,
  providerTestConnectionRequestSchema,
} from "./provider-connection-test";

const requestId = "019b7f4d-a000-7000-8000-000000000061";
const providerId = "019b7f4d-a000-7000-8000-000000000062";

describe("Provider connection test protocol", () => {
  it("accepts strict test and cancellation requests", () => {
    expect(
      providerTestConnectionRequestSchema.parse({
        schemaVersion: 1,
        requestId,
        providerId,
        expectedVersion: 2,
      }),
    ).toMatchObject({ requestId, providerId, expectedVersion: 2 });
    expect(
      providerCancelConnectionTestRequestSchema.parse({
        schemaVersion: 1,
        requestId,
      }),
    ).toEqual({ schemaVersion: 1, requestId });
  });

  it("rejects extra fields, bad versions, UUIDs, and provider versions", () => {
    for (const request of [
      { schemaVersion: 2, requestId, providerId, expectedVersion: 1 },
      { schemaVersion: 1, requestId: "bad", providerId, expectedVersion: 1 },
      { schemaVersion: 1, requestId, providerId: "bad", expectedVersion: 1 },
      { schemaVersion: 1, requestId, providerId, expectedVersion: 0 },
      {
        schemaVersion: 1,
        requestId,
        providerId,
        expectedVersion: 1,
        endpoint: "https://attacker.invalid",
      },
    ]) {
      expect(
        providerTestConnectionRequestSchema.safeParse(request).success,
      ).toBe(false);
    }
  });

  it("accepts only normalized completed results", () => {
    const verified = {
      ok: true as const,
      value: {
        status: "VERIFIED" as const,
        providerVersion: 1,
        testedAt: "2026-08-02T00:00:00.000Z",
        models: [
          {
            id: "gpt-test",
            displayName: "gpt-test",
            source: "PROVIDER" as const,
            observedAt: "2026-08-02T00:00:00.000Z",
          },
        ],
      },
    };
    expect(providerConnectionTestResultSchema.parse(verified)).toEqual(
      verified,
    );
    expect(
      providerConnectionTestResultSchema.safeParse({
        ...verified,
        value: { status: "UNVERIFIED" },
      }).success,
    ).toBe(false);
    expect(
      providerConnectionTestResultSchema.safeParse({
        ...verified,
        value: { ...verified.value, authorization: "Bearer secret" },
      }).success,
    ).toBe(false);
  });
});
