import { z } from "zod";

const uuidV7 = z.uuidv7();
const text = z.string().min(1).max(4_000);
const itemText = z.string().min(1).max(500);
const mediaType = z
  .string()
  .min(1)
  .max(255)
  .regex(/^[a-z0-9!#$&^_.+-]+\/[a-z0-9!#$&^_.+-]+$/u);

export const artifactTypeSchema = z.enum([
  "TEXT",
  "JSON",
  "DOCUMENT",
  "SOURCE_CODE",
  "FILE",
  "PATCH",
  "TEST_REPORT",
  "DECISION_RECORD",
  "EVALUATION_REPORT",
  "TOOL_OUTPUT",
  "MEMORY_CANDIDATE",
]);

export const taskInputRefSchema = z.discriminatedUnion("source", [
  z
    .object({
      source: z.literal("GOAL_CONTRACT"),
      goalVersion: z.number().int().positive(),
      logicalName: itemText,
      mediaType: mediaType.optional(),
      required: z.boolean(),
    })
    .strict(),
  z
    .object({
      source: z.literal("TASK_OUTPUT"),
      upstreamTaskId: uuidV7,
      logicalName: itemText,
      mediaType: mediaType.optional(),
      required: z.boolean(),
    })
    .strict(),
]);

export const outputContractSchema = z
  .object({
    logicalName: itemText,
    artifactType: artifactTypeSchema,
    mediaType,
    required: z.boolean(),
    description: itemText,
  })
  .strict();

export const acceptanceCriterionSchema = z
  .object({
    id: z.string().regex(/^[a-z][a-z0-9-]{0,63}$/u),
    description: itemText,
    severity: z.enum(["REQUIRED", "RECOMMENDED"]),
    evidenceRequired: z.array(itemText).max(50),
  })
  .strict()
  .superRefine((value, context) => {
    if (
      new Set(value.evidenceRequired).size !== value.evidenceRequired.length
    ) {
      context.addIssue({
        code: "custom",
        path: ["evidenceRequired"],
        message: "Evidence labels must be unique",
      });
    }
  });

export const taskContractSchema = z
  .object({
    schemaVersion: z.literal("1.0"),
    id: uuidV7,
    corporationId: uuidV7,
    planVersion: z.number().int().positive(),
    parentId: uuidV7.optional(),
    title: itemText,
    objective: text,
    description: text.optional(),
    kind: z.enum([
      "ANALYSIS",
      "GENERATION",
      "TRANSFORMATION",
      "VALIDATION",
      "HUMAN_DECISION",
    ]),
    priority: z.number().int().min(0).max(100),
    riskLevel: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]),
    requiredCapabilities: z
      .array(
        z
          .object({
            path: z.string().min(1).max(128),
            minimumLevel: z.number().min(0).max(1),
            mandatory: z.boolean(),
          })
          .strict(),
      )
      .max(20),
    requiredTools: z.array(z.string().min(1).max(128)).max(20),
    inputRefs: z.array(taskInputRefSchema).max(50),
    expectedOutputs: z.array(outputContractSchema).max(50),
    acceptanceCriteria: z.array(acceptanceCriterionSchema).max(50),
    dependencies: z
      .array(
        z
          .object({ taskId: uuidV7, condition: z.literal("ON_SUCCESS") })
          .strict(),
      )
      .max(50),
    budget: z
      .object({
        maxInputTokens: z.number().int().nonnegative().optional(),
        maxOutputTokens: z.number().int().nonnegative().optional(),
        maxCostMicros: z.string().regex(/^\d+$/u).optional(),
        maxDurationMs: z.number().int().nonnegative().optional(),
      })
      .strict(),
    retryPolicy: z
      .object({
        maxAttempts: z.number().int().min(1).max(10),
        maxEvaluationRevisions: z.number().int().min(0).max(10),
        retryableCategories: z.array(z.string().min(1).max(128)).max(20),
      })
      .strict(),
    permissionRequest: z
      .object({
        workspaceRead: z.boolean(),
        workspaceWrite: z.array(itemText).max(50),
        processProfiles: z.array(z.string().min(1).max(128)).max(20),
      })
      .strict(),
    assumptions: z.array(itemText).max(50),
    nonGoals: z.array(itemText).max(50),
  })
  .strict()
  .superRefine((value, context) => {
    const outputNames = value.expectedOutputs.map(
      ({ logicalName }) => logicalName,
    );
    if (new Set(outputNames).size !== outputNames.length) {
      context.addIssue({
        code: "custom",
        path: ["expectedOutputs"],
        message: "Output logical names must be unique",
      });
    }
    const criterionIds = value.acceptanceCriteria.map(({ id }) => id);
    if (new Set(criterionIds).size !== criterionIds.length) {
      context.addIssue({
        code: "custom",
        path: ["acceptanceCriteria"],
        message: "Acceptance criterion IDs must be unique",
      });
    }
  });

export type ArtifactType = z.infer<typeof artifactTypeSchema>;
export type TaskContract = z.infer<typeof taskContractSchema>;
