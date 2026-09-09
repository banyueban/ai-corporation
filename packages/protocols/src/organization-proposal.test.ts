import { describe, expect, it } from "vitest";
import {
  organizationProposalCreateRequestSchema,
  organizationProposalFailureSchema,
} from "./organization-proposal";

const commandId = "019fa9bb-9100-7d90-a4e3-a5b0eea2a9ef";
const corporationId = "019fa9bb-9101-7d90-a4e3-a5b0eea2a9ef";
const planId = "019fa9bb-9102-7d90-a4e3-a5b0eea2a9ef";

describe("Organization Proposal protocol", () => {
  it("only accepts identity and expected Plan version from Renderer", () => {
    const request = {
      schemaVersion: "1.0",
      commandId,
      corporationId,
      planId,
      expectedPlanVersion: 1,
    };
    expect(
      organizationProposalCreateRequestSchema.safeParse(request).success,
    ).toBe(true);
    expect(
      organizationProposalCreateRequestSchema.safeParse({
        ...request,
        role: "ADMIN",
        providerId: corporationId,
        model: "secret",
      }).success,
    ).toBe(false);
  });

  it("requires fixed error messages", () => {
    expect(
      organizationProposalFailureSchema.safeParse({
        ok: false,
        error: {
          code: "PLAN_NOT_APPROVED",
          message: "The current Plan is not approved.",
        },
      }).success,
    ).toBe(true);
    expect(
      organizationProposalFailureSchema.safeParse({
        ok: false,
        error: { code: "PLAN_NOT_APPROVED", message: "Try anyway" },
      }).success,
    ).toBe(false);
  });
});
