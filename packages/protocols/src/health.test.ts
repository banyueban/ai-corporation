import { describe, expect, it } from "vitest";
import {
  HEALTH_SCHEMA_VERSION,
  healthResultSchema,
  healthRpcRequestSchema,
  healthRpcResponseSchema,
} from "./health";

describe("health protocol", () => {
  it("accepts a valid health request and result", () => {
    expect(
      healthRpcRequestSchema.safeParse({
        jsonrpc: "2.0",
        id: "request-1",
        method: "health",
        params: {
          schemaVersion: HEALTH_SCHEMA_VERSION,
          sessionToken: "a".repeat(64),
        },
      }).success,
    ).toBe(true);

    expect(
      healthResultSchema.safeParse({
        schemaVersion: HEALTH_SCHEMA_VERSION,
        status: "ok",
        version: "0.1.0",
        pid: 42,
      }).success,
    ).toBe(true);
  });

  it("rejects unknown request fields", () => {
    expect(
      healthRpcRequestSchema.safeParse({
        jsonrpc: "2.0",
        id: "request-2",
        method: "health",
        params: {
          schemaVersion: HEALTH_SCHEMA_VERSION,
          sessionToken: "a".repeat(64),
          elevated: true,
        },
      }).success,
    ).toBe(false);
  });

  it("rejects responses with both result and error", () => {
    expect(
      healthRpcResponseSchema.safeParse({
        jsonrpc: "2.0",
        id: "request-3",
        result: {
          schemaVersion: HEALTH_SCHEMA_VERSION,
          status: "ok",
          version: "0.1.0",
          pid: 42,
        },
        error: {
          code: -32603,
          message: "Internal error",
        },
      }).success,
    ).toBe(false);
  });
});
