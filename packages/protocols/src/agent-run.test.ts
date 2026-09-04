import { describe, expect, it } from "vitest";
import {
  agentModelCandidateSchema,
  agentRunCommandRequestSchema,
} from "./agent-run";

const id = "018f0f5f-79b2-7cc3-8c4d-1f54a8e2c901";

describe("agent run protocol", () => {
  it("rejects renderer-owned execution fields", () => {
    expect(
      agentRunCommandRequestSchema.safeParse({
        schemaVersion: "1.0",
        commandId: id,
        corporationId: id,
        runId: id,
        expectedAttempt: 1,
        prompt: "forged",
      }).success,
    ).toBe(false);
  });

  it("accepts semantic output and rejects model supplied references", () => {
    const candidate = {
      summary: "done",
      outputs: [
        {
          logicalName: "report",
          artifactType: "DOCUMENT",
          mediaType: "text/markdown",
          content: "safe body",
        },
      ],
      claims: [],
      unresolvedIssues: [],
      requestedFollowups: [],
    };
    expect(agentModelCandidateSchema.safeParse(candidate).success).toBe(true);
    expect(
      agentModelCandidateSchema.safeParse({
        ...candidate,
        outputs: [{ ...candidate.outputs[0], contentRef: "file:///forged" }],
      }).success,
    ).toBe(false);
  });
});
