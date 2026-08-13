import { describe, expect, it } from "vitest";
import {
  organizationActivationFailureSchema,
  organizationActivationRequestSchema,
} from "./organization-activation";

const id = (suffix: string) =>
  `019faa01-0000-7000-8000-${suffix.padStart(12, "0")}`;

describe("Organization Activation protocol", () => {
  it("accepts only identities, three routes, and degraded-gap consent", () => {
    const request = {
      schemaVersion: "1.0",
      commandId: id("1"),
      corporationId: id("2"),
      organizationId: id("3"),
      expectedOrganizationVersion: 1,
      routes: {
        planner: {
          providerId: id("4"),
          providerVersion: 1,
          modelId: "planner-model",
        },
        executor: {
          providerId: id("5"),
          providerVersion: 2,
          modelId: "executor-model",
        },
        judge: {
          providerId: id("4"),
          providerVersion: 1,
          modelId: "judge-model",
        },
      },
      acceptDegradedGaps: false,
    };
    expect(organizationActivationRequestSchema.safeParse(request).success).toBe(
      true,
    );
    expect(
      organizationActivationRequestSchema.safeParse({
        ...request,
        members: [],
        key: "secret",
      }).success,
    ).toBe(false);
  });

  it("requires fixed error messages", () => {
    expect(
      organizationActivationFailureSchema.safeParse({
        ok: false,
        error: {
          code: "MODEL_NOT_AVAILABLE",
          message: "Selected model is not currently available.",
        },
      }).success,
    ).toBe(true);
    expect(
      organizationActivationFailureSchema.safeParse({
        ok: false,
        error: { code: "MODEL_NOT_AVAILABLE", message: "remote body" },
      }).success,
    ).toBe(false);
  });
});
