import { describe, expect, it } from "vitest";
import {
  goalEngineAnswerRequestSchema,
  goalEngineModelOutputSchema,
  goalEngineOperationPublicSchema,
  goalEngineResolveExtensionRequestSchema,
  goalEngineStartRequestSchema,
} from "./goal-engine";

const id = "019fa9bb-7000-7d90-a4e3-a5b0eea2a9ef";

describe("Goal Engine protocol", () => {
  it("normalizes bounded start input and rejects extra or forged fields", () => {
    expect(
      goalEngineStartRequestSchema.parse({
        schemaVersion: "1.0",
        operationId: id,
        corporationId: id,
        expectedCorporationVersion: 1,
        expectedGoalVersion: 0,
        providerId: id,
        expectedProviderVersion: 1,
        input: { originalGoal: "  Ship safely  " },
      }).input.originalGoal,
    ).toBe("Ship safely");
    expect(
      goalEngineStartRequestSchema.safeParse({
        schemaVersion: "1.0",
        operationId: id,
        corporationId: id,
        expectedCorporationVersion: 1,
        expectedGoalVersion: 0,
        providerId: id,
        expectedProviderVersion: 1,
        input: { originalGoal: "Ship", workspacePath: "forged" },
      }).success,
    ).toBe(false);
  });

  it("requires complete bounded answers and a valid extension decision", () => {
    expect(
      goalEngineAnswerRequestSchema.safeParse({
        schemaVersion: "1.0",
        operationId: id,
        expectedOperationVersion: 1,
        answers: [],
      }).success,
    ).toBe(false);
    expect(
      goalEngineResolveExtensionRequestSchema.safeParse({
        schemaVersion: "1.0",
        operationId: id,
        expectedOperationVersion: 1,
        decision: "AUTOMATIC_CONTINUE",
      }).success,
    ).toBe(false);
  });

  it("accepts one complete strict draft with at most five HIGH questions", () => {
    expect(goalEngineModelOutputSchema.safeParse(modelOutput(5)).success).toBe(
      true,
    );
    expect(goalEngineModelOutputSchema.safeParse(modelOutput(6)).success).toBe(
      false,
    );
    expect(
      goalEngineModelOutputSchema.safeParse({
        ...modelOutput(0),
        chatCompletionId: "forbidden-chat-dto",
      }).success,
    ).toBe(false);
  });

  it("rejects inconsistent public terminal and question projections", () => {
    expect(
      goalEngineOperationPublicSchema.safeParse({
        schemaVersion: "1.0",
        operationId: id,
        corporationId: id,
        providerId: id,
        providerVersion: 1,
        modelId: "model-a",
        status: "CLARIFICATION_REQUIRED",
        version: 1,
        cycleNumber: 1,
        roundInCycle: 0,
        questions: [],
        usage: { costSource: "UNKNOWN" },
        updatedAt: "2026-08-02T00:00:00.000Z",
      }).success,
    ).toBe(false);
  });
});

function modelOutput(questionCount: number) {
  return {
    draft: {
      statement: "Ship safely",
      successCriteria: ["All checks pass"],
      inScope: [],
      outOfScope: [],
      constraints: [],
      assumptions: [],
      deliverables: [],
      riskLevel: "LOW",
      budget: {},
      stopConditions: [],
    },
    unresolvedQuestions: Array.from({ length: questionCount }, (_, index) => ({
      text: `Question ${index}`,
      impact: "HIGH",
    })),
  };
}
