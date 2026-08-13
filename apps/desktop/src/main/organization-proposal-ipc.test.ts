import { describe, expect, it, vi } from "vitest";
import {
  handleOrganizationProposalCreate,
  handleOrganizationProposalGetCurrent,
} from "./organization-proposal-ipc";

const commandId = "019fa9bb-9200-7d90-a4e3-a5b0eea2a9ef";
const corporationId = "019fa9bb-9201-7d90-a4e3-a5b0eea2a9ef";
const planId = "019fa9bb-9202-7d90-a4e3-a5b0eea2a9ef";

describe("Organization Proposal IPC", () => {
  it("rejects untrusted and forged requests before calling the service", () => {
    const service = { create: vi.fn(), getCurrent: vi.fn() };
    expect(
      handleOrganizationProposalGetCurrent(
        false,
        { schemaVersion: "1.0", corporationId },
        service,
      ),
    ).toMatchObject({ ok: false, error: { code: "UNAUTHORIZED_CALLER" } });
    expect(
      handleOrganizationProposalCreate(
        true,
        {
          schemaVersion: "1.0",
          commandId,
          corporationId,
          planId,
          expectedPlanVersion: 1,
          model: "forged",
        },
        service,
      ),
    ).toMatchObject({ ok: false, error: { code: "VALIDATION_FAILED" } });
    expect(service.create).not.toHaveBeenCalled();
    expect(service.getCurrent).not.toHaveBeenCalled();
  });

  it("routes the two allowlisted calls", () => {
    const failure = {
      ok: false as const,
      error: {
        code: "PLAN_NOT_APPROVED" as const,
        message: "The current Plan is not approved.",
      },
    };
    const service = {
      create: vi.fn(() => failure),
      getCurrent: vi.fn(() => ({ ok: true as const, value: null })),
    };
    expect(
      handleOrganizationProposalGetCurrent(
        true,
        { schemaVersion: "1.0", corporationId },
        service,
      ),
    ).toEqual({ ok: true, value: null });
    expect(
      handleOrganizationProposalCreate(
        true,
        {
          schemaVersion: "1.0",
          commandId,
          corporationId,
          planId,
          expectedPlanVersion: 1,
        },
        service,
      ),
    ).toEqual(failure);
  });
});
