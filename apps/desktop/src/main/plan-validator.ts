import { createHash } from "node:crypto";
import {
  PLAN_VALIDATOR_VERSION,
  planValidationReportSchema,
  taskContractSchema,
  type ArtifactType,
  type GoalBudget,
  type PlanValidationFinding,
  type PlanValidationReport,
  type PlannerDraftPublic,
  type TaskContract,
} from "@ai-corporation/protocols";
import type { PlannerCatalogs } from "./planner-catalogs";

const MEDIA_TYPES: Readonly<Record<string, ArtifactType>> = {
  "text/plain": "TEXT",
  "text/markdown": "DOCUMENT",
  "application/json": "JSON",
  "application/octet-stream": "FILE",
};

export interface PlanValidationResult {
  readonly draftHash: string;
  readonly report: PlanValidationReport;
  readonly tasks: readonly TaskContract[];
}

export function validatePlanDraft(input: {
  readonly catalogs: PlannerCatalogs;
  readonly goalBudget: GoalBudget;
  readonly now: string;
  readonly plan: PlannerDraftPublic;
}): PlanValidationResult {
  const { plan } = input;
  const issues: PlanValidationFinding[] = [];
  const warnings: PlanValidationFinding[] = [];
  const taskByLocal = new Map(plan.tasks.map((task) => [task.localId, task]));
  const taskIdByLocal = new Map(
    plan.tasks.map((task) => [task.localId, task.id]),
  );
  const duplicateTaskIds = duplicates(plan.tasks.map(({ localId }) => localId));
  for (const localId of duplicateTaskIds) {
    issue(issues, "DUPLICATE_TASK_LOCAL_ID", "tasks", { logicalName: localId });
  }
  if (plan.tasks.length > 20) {
    issue(issues, "TASK_COUNT_EXCEEDED", "tasks", {
      actual: plan.tasks.length,
      limit: 20,
    });
  }

  const adjacency = new Map<string, Set<string>>(
    plan.tasks.map(({ localId }) => [localId, new Set<string>()]),
  );
  const dependencyKeys = new Set<string>();
  for (const [index, dependency] of plan.dependencies.entries()) {
    const path = `dependencies.${index}`;
    const upstream = taskByLocal.get(dependency.upstreamLocalId);
    const downstream = taskByLocal.get(dependency.downstreamLocalId);
    if (upstream === undefined || downstream === undefined) {
      issue(issues, "UNKNOWN_TASK_REFERENCE", path);
      continue;
    }
    if (dependency.upstreamLocalId === dependency.downstreamLocalId) {
      issue(issues, "SELF_DEPENDENCY", path, { taskId: upstream.id });
      continue;
    }
    const key = `${dependency.upstreamLocalId}\0${dependency.downstreamLocalId}`;
    if (dependencyKeys.has(key)) {
      issue(issues, "DUPLICATE_DEPENDENCY", path, {
        taskId: upstream.id,
        relatedTaskId: downstream.id,
      });
      continue;
    }
    dependencyKeys.add(key);
    adjacency
      .get(dependency.upstreamLocalId)
      ?.add(dependency.downstreamLocalId);
  }
  if (hasCycle(adjacency)) issue(issues, "CYCLE_DETECTED", "dependencies");

  const milestoneTasks = new Set<string>();
  for (const [milestoneIndex, milestone] of plan.milestones.entries()) {
    for (const [taskIndex, localId] of milestone.taskLocalIds.entries()) {
      const task = taskByLocal.get(localId);
      const path = `milestones.${milestoneIndex}.taskLocalIds.${taskIndex}`;
      if (task === undefined) issue(issues, "UNKNOWN_MILESTONE_TASK", path);
      else if (milestoneTasks.has(localId)) {
        issue(issues, "DUPLICATE_MILESTONE_TASK", path, { taskId: task.id });
      } else milestoneTasks.add(localId);
    }
  }

  const capabilities = new Set<string>(input.catalogs.capabilityPaths);
  const tools = new Set<string>(input.catalogs.tools);
  const profiles = new Set<string>(input.catalogs.processProfiles);
  const incoming = incomingCounts(
    plan.tasks.map(({ localId }) => localId),
    adjacency,
  );

  for (const [taskIndex, task] of plan.tasks.entries()) {
    const taskPath = `tasks.${taskIndex}`;
    for (const localId of duplicates(
      task.acceptanceCriteria.map(({ localId }) => localId),
    )) {
      issue(
        issues,
        "DUPLICATE_ACCEPTANCE_LOCAL_ID",
        `${taskPath}.acceptanceCriteria`,
        {
          taskId: task.id,
          logicalName: localId,
        },
      );
    }
    if (
      !task.acceptanceCriteria.some(({ severity }) => severity === "REQUIRED")
    ) {
      issue(
        issues,
        "TASK_MISSING_REQUIRED_ACCEPTANCE",
        `${taskPath}.acceptanceCriteria`,
        { taskId: task.id },
      );
    }
    for (const [
      criterionIndex,
      criterion,
    ] of task.acceptanceCriteria.entries()) {
      if (criterion.evidenceRequired.length === 0) {
        issue(
          issues,
          "ACCEPTANCE_EVIDENCE_MISSING",
          `${taskPath}.acceptanceCriteria.${criterionIndex}.evidenceRequired`,
          { taskId: task.id },
        );
      }
    }
    if (
      (adjacency.get(task.localId)?.size ?? 0) === 0 &&
      !task.expectedOutputs.some(({ required }) => required)
    ) {
      issue(
        issues,
        "LEAF_MISSING_REQUIRED_OUTPUT",
        `${taskPath}.expectedOutputs`,
        { taskId: task.id },
      );
    }
    for (const logicalName of duplicates(
      task.expectedOutputs.map(({ logicalName }) => logicalName),
    )) {
      issue(
        issues,
        "DUPLICATE_OUTPUT_LOGICAL_NAME",
        `${taskPath}.expectedOutputs`,
        { taskId: task.id, logicalName },
      );
    }
    for (const [outputIndex, output] of task.expectedOutputs.entries()) {
      if (MEDIA_TYPES[output.mediaType] === undefined) {
        issue(
          issues,
          "UNSUPPORTED_MEDIA_TYPE",
          `${taskPath}.expectedOutputs.${outputIndex}.mediaType`,
          { taskId: task.id, logicalName: output.logicalName },
        );
      }
    }
    for (const [inputIndex, candidate] of task.inputs.entries()) {
      if (candidate.source !== "TASK_OUTPUT") continue;
      const path = `${taskPath}.inputs.${inputIndex}`;
      if (candidate.taskLocalId === undefined) {
        issue(issues, "UNKNOWN_TASK_REFERENCE", path, { taskId: task.id });
        continue;
      }
      const producer = taskByLocal.get(candidate.taskLocalId);
      if (producer === undefined) {
        issue(issues, "UNKNOWN_TASK_REFERENCE", path, { taskId: task.id });
        continue;
      }
      const matching = producer.expectedOutputs.filter(
        ({ logicalName }) => logicalName === candidate.logicalName,
      );
      if (matching.length !== 1)
        issue(issues, "TASK_OUTPUT_NOT_FOUND", path, {
          taskId: task.id,
          relatedTaskId: producer.id,
          logicalName: candidate.logicalName,
        });
      else if (
        candidate.mediaType !== undefined &&
        candidate.mediaType !== matching[0]?.mediaType
      ) {
        issue(issues, "TASK_OUTPUT_MEDIA_TYPE_MISMATCH", path, {
          taskId: task.id,
          relatedTaskId: producer.id,
          logicalName: candidate.logicalName,
        });
      }
      if (!hasPath(adjacency, producer.localId, task.localId)) {
        issue(issues, "TASK_OUTPUT_NOT_UPSTREAM", path, {
          taskId: task.id,
          relatedTaskId: producer.id,
          logicalName: candidate.logicalName,
        });
      }
    }
    task.requiredCapabilities.forEach(({ path }, index) => {
      if (!capabilities.has(path))
        issue(
          issues,
          "UNKNOWN_CAPABILITY",
          `${taskPath}.requiredCapabilities.${index}.path`,
          { taskId: task.id },
        );
    });
    task.requiredTools.forEach((tool, index) => {
      if (!tools.has(tool))
        issue(issues, "UNKNOWN_TOOL", `${taskPath}.requiredTools.${index}`, {
          taskId: task.id,
        });
    });
    task.permissionHints.workspaceWrite.forEach((path, index) => {
      if (!safeRelativePath(path))
        issue(
          issues,
          "UNSAFE_WORKSPACE_PATH",
          `${taskPath}.permissionHints.workspaceWrite.${index}`,
          { taskId: task.id },
        );
    });
    task.permissionHints.processProfiles.forEach((profile, index) => {
      if (!profiles.has(profile))
        issue(
          issues,
          "FORBIDDEN_PROCESS_PROFILE",
          `${taskPath}.permissionHints.processProfiles.${index}`,
          { taskId: task.id },
        );
    });
    const itemCount =
      task.requiredCapabilities.length +
      task.requiredTools.length +
      task.inputs.length +
      task.expectedOutputs.length +
      task.acceptanceCriteria.length;
    if (
      task.inputs.length >= 40 ||
      task.expectedOutputs.length >= 40 ||
      task.acceptanceCriteria.length >= 40 ||
      itemCount >= 10
    ) {
      warnings.push({
        code: "SINGLE_RUN_SIZE_WARNING",
        path: taskPath,
        taskId: task.id,
        actual: itemCount,
        limit: 10,
      });
    }
  }

  validateBudgets(plan, input.goalBudget, adjacency, incoming, issues);
  const valid = issues.length === 0;
  const report = planValidationReportSchema.parse({
    schemaVersion: "1.0",
    validatorVersion: PLAN_VALIDATOR_VERSION,
    planId: plan.planId,
    planVersion: plan.planVersion,
    status: valid ? "VALID" : "INVALID",
    issues,
    warnings,
    validatedAt: input.now,
  });
  const tasks = valid
    ? plan.tasks.map((task) =>
        taskContractSchema.parse({
          schemaVersion: "1.0",
          id: task.id,
          corporationId: plan.corporationId,
          planVersion: plan.planVersion,
          title: task.title,
          objective: task.objective,
          ...(task.description === undefined
            ? {}
            : { description: task.description }),
          kind: task.kind,
          priority: task.priority,
          riskLevel: task.riskLevel,
          requiredCapabilities: task.requiredCapabilities,
          requiredTools: task.requiredTools,
          inputRefs: task.inputs.map((candidate) =>
            candidate.source === "GOAL_CONTRACT"
              ? {
                  source: "GOAL_CONTRACT" as const,
                  goalVersion: plan.goalVersion,
                  logicalName: candidate.logicalName,
                  ...(candidate.mediaType === undefined
                    ? {}
                    : { mediaType: candidate.mediaType }),
                  required: candidate.required,
                }
              : {
                  source: "TASK_OUTPUT" as const,
                  upstreamTaskId: requiredTaskId(
                    taskIdByLocal,
                    candidate.taskLocalId,
                  ),
                  logicalName: candidate.logicalName,
                  ...(candidate.mediaType === undefined
                    ? {}
                    : { mediaType: candidate.mediaType }),
                  required: candidate.required,
                },
          ),
          expectedOutputs: task.expectedOutputs.map((output) => ({
            ...output,
            artifactType: MEDIA_TYPES[output.mediaType]!,
          })),
          acceptanceCriteria: task.acceptanceCriteria.map(
            ({ localId, ...criterion }) => ({ id: localId, ...criterion }),
          ),
          dependencies: plan.dependencies
            .filter(
              ({ downstreamLocalId }) => downstreamLocalId === task.localId,
            )
            .map(({ upstreamLocalId, condition }) => ({
              taskId: requiredTaskId(taskIdByLocal, upstreamLocalId),
              condition,
            })),
          budget: task.budget,
          retryPolicy: task.retryPolicy,
          permissionRequest: task.permissionHints,
          assumptions: task.assumptions,
          nonGoals: task.nonGoals,
        }),
      )
    : [];
  return { draftHash: semanticHash(plan), report, tasks };
}

function validateBudgets(
  plan: PlannerDraftPublic,
  goal: GoalBudget,
  adjacency: ReadonlyMap<string, ReadonlySet<string>>,
  incoming: ReadonlyMap<string, number>,
  issues: PlanValidationFinding[],
) {
  if (goal.costLimitMicros !== undefined) {
    const values = plan.tasks.map(({ budget }) => budget.maxCostMicros);
    if (values.some((value) => value === undefined))
      issue(issues, "BUDGET_LIMIT_MISSING", "tasks.budget.maxCostMicros");
    else {
      const sum = values.reduce((total, value) => total + BigInt(value!), 0n);
      if (sum > BigInt(goal.costLimitMicros))
        issue(issues, "BUDGET_COST_EXCEEDED", "tasks.budget.maxCostMicros", {
          actual: sum.toString(),
          limit: String(goal.costLimitMicros),
        });
    }
  }
  if (goal.maxRevisions !== undefined) {
    const sum = plan.tasks.reduce(
      (total, task) => total + task.retryPolicy.maxEvaluationRevisions,
      0,
    );
    if (sum > goal.maxRevisions)
      issue(
        issues,
        "BUDGET_REVISIONS_EXCEEDED",
        "tasks.retryPolicy.maxEvaluationRevisions",
        { actual: sum, limit: goal.maxRevisions },
      );
  }
  if (goal.durationLimitMinutes !== undefined) {
    if (plan.tasks.some(({ budget }) => budget.maxDurationMs === undefined))
      issue(issues, "BUDGET_LIMIT_MISSING", "tasks.budget.maxDurationMs");
    else if (!hasCycle(adjacency)) {
      const duration = longestPath(plan, adjacency, incoming);
      const limit = goal.durationLimitMinutes * 60_000;
      if (
        !Number.isSafeInteger(limit) ||
        !Number.isSafeInteger(duration) ||
        duration > limit
      ) {
        issue(
          issues,
          "BUDGET_DURATION_EXCEEDED",
          "tasks.budget.maxDurationMs",
          {
            actual: Number.isSafeInteger(duration)
              ? duration
              : String(duration),
            limit: Number.isSafeInteger(limit) ? limit : String(limit),
          },
        );
      }
    }
  }
}

function longestPath(
  plan: PlannerDraftPublic,
  adjacency: ReadonlyMap<string, ReadonlySet<string>>,
  incoming: ReadonlyMap<string, number>,
): number {
  const byId = new Map(plan.tasks.map((task) => [task.localId, task]));
  const counts = new Map(incoming);
  const totals = new Map<string, number>();
  const queue = plan.tasks
    .filter(({ localId }) => counts.get(localId) === 0)
    .map(({ localId }) => localId);
  let maximum = 0;
  while (queue.length > 0) {
    const id = queue.shift()!;
    const total =
      (totals.get(id) ?? 0) + (byId.get(id)?.budget.maxDurationMs ?? 0);
    maximum = Math.max(maximum, total);
    for (const next of adjacency.get(id) ?? []) {
      totals.set(next, Math.max(totals.get(next) ?? 0, total));
      counts.set(next, (counts.get(next) ?? 1) - 1);
      if (counts.get(next) === 0) queue.push(next);
    }
  }
  return maximum;
}

function incomingCounts(
  ids: readonly string[],
  adjacency: ReadonlyMap<string, ReadonlySet<string>>,
): Map<string, number> {
  const values = new Map(ids.map((id) => [id, 0]));
  for (const next of adjacency.values())
    for (const id of next) values.set(id, (values.get(id) ?? 0) + 1);
  return values;
}

function hasCycle(
  adjacency: ReadonlyMap<string, ReadonlySet<string>>,
): boolean {
  const state = new Map<string, number>();
  const visit = (id: string): boolean => {
    if (state.get(id) === 1) return true;
    if (state.get(id) === 2) return false;
    state.set(id, 1);
    for (const next of adjacency.get(id) ?? []) if (visit(next)) return true;
    state.set(id, 2);
    return false;
  };
  return [...adjacency.keys()].some(visit);
}

function hasPath(
  adjacency: ReadonlyMap<string, ReadonlySet<string>>,
  start: string,
  target: string,
): boolean {
  const pending = [start];
  const seen = new Set<string>();
  while (pending.length > 0) {
    const current = pending.pop()!;
    if (current === target && current !== start) return true;
    if (seen.has(current)) continue;
    seen.add(current);
    pending.push(...(adjacency.get(current) ?? []));
  }
  return false;
}

function safeRelativePath(value: string): boolean {
  if (
    value.includes("\0") ||
    value.includes("\\") ||
    value.startsWith("/") ||
    /^[a-z]:/iu.test(value) ||
    value.startsWith("//")
  )
    return false;
  const parts = value.split("/");
  return (
    parts.length > 0 &&
    parts.every((part) => part.length > 0 && part !== "." && part !== "..")
  );
}

function duplicates(values: readonly string[]): readonly string[] {
  const seen = new Set<string>();
  const result = new Set<string>();
  for (const value of values) (seen.has(value) ? result : seen).add(value);
  return [...result];
}

function issue(
  issues: PlanValidationFinding[],
  code: Exclude<PlanValidationFinding["code"], "SINGLE_RUN_SIZE_WARNING">,
  path: string,
  details: Omit<PlanValidationFinding, "code" | "path"> = {},
): void {
  if (issues.length < 200) issues.push({ code, path, ...details });
}

function semanticHash(plan: PlannerDraftPublic): string {
  return createHash("sha256")
    .update(
      JSON.stringify({
        schemaVersion: plan.schemaVersion,
        planId: plan.planId,
        corporationId: plan.corporationId,
        planVersion: plan.planVersion,
        goalVersion: plan.goalVersion,
        summary: plan.summary,
        tasks: plan.tasks,
        dependencies: plan.dependencies,
        milestones: plan.milestones,
        assumptions: plan.assumptions,
        risks: plan.risks,
        provider: plan.provider,
      }),
    )
    .digest("hex");
}

function requiredTaskId(
  values: ReadonlyMap<string, string>,
  localId: string | undefined,
): string {
  const value = localId === undefined ? undefined : values.get(localId);
  if (value === undefined)
    throw new Error("Validated task identity is missing");
  return value;
}
