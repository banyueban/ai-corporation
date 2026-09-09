import { DatabaseSync } from "node:sqlite";
import {
  executionStartSchema,
  organizationProposalSchema,
  taskContractSchema,
  type ExecutionStart,
  type ExecutionStartRequest,
  type OrganizationProposal,
} from "@ai-corporation/protocols";

export class ExecutionStartNotFoundError extends Error {}
export class ExecutionStartVersionError extends Error {}
export class ExecutionStartStateError extends Error {}
export class ExecutionStartWorkspaceError extends Error {}
export class ExecutionStartPlanError extends Error {}
export class ExecutionStartOrganizationError extends Error {}
export class ExecutionStartProviderError extends Error {}
export class ExecutionStartAssignmentError extends Error {}
export class ExecutionStartNoEntryTaskError extends Error {}
export class ExecutionStartCommandConflictError extends Error {}
export class ExecutionStartDataError extends Error {}

type Row = Record<string, unknown>;

export class ExecutionStartRepository {
  readonly #database: DatabaseSync;
  constructor(database: DatabaseSync) {
    this.#database = database;
  }

  getCurrent(corporationId: string): ExecutionStart | undefined {
    const row = this.#database
      .prepare(
        "SELECT result_json FROM execution_start WHERE corporation_id = ?",
      )
      .get(corporationId);
    if (row === undefined) return undefined;
    return parseResult(row.result_json);
  }

  resolveCommand(
    commandId: string,
    requestHash: string,
  ): ExecutionStart | undefined {
    const row = this.#database
      .prepare(
        "SELECT request_hash, result_json FROM execution_start WHERE command_id = ?",
      )
      .get(commandId);
    if (row === undefined) return undefined;
    if (row.request_hash !== requestHash)
      throw new ExecutionStartCommandConflictError();
    return parseResult(row.result_json);
  }

  start(input: {
    request: ExecutionStartRequest;
    requestHash: string;
    runId: string;
    eventId: string;
    now: string;
  }): ExecutionStart {
    this.#database.exec("BEGIN IMMEDIATE");
    try {
      const replay = this.resolveCommand(
        input.request.commandId,
        input.requestHash,
      );
      if (replay !== undefined) {
        this.#database.exec("COMMIT");
        return replay;
      }
      if (this.getCurrent(input.request.corporationId) !== undefined)
        throw new ExecutionStartStateError();

      const corporation = this.#database
        .prepare(
          `SELECT c.id, c.status, c.version, c.active_organization_version,
          w.access_status FROM corporation c JOIN workspace w ON w.id = c.workspace_id
          WHERE c.id = ?`,
        )
        .get(input.request.corporationId) as Row | undefined;
      if (corporation === undefined) throw new ExecutionStartNotFoundError();
      if (corporation.version !== input.request.expectedCorporationVersion)
        throw new ExecutionStartVersionError();
      if (corporation.status !== "DRAFT") throw new ExecutionStartStateError();
      if (corporation.access_status !== "AVAILABLE")
        throw new ExecutionStartWorkspaceError();
      if (typeof corporation.active_organization_version !== "number")
        throw new ExecutionStartOrganizationError();

      const plan = this.#database
        .prepare(
          `SELECT id FROM task_plan WHERE corporation_id = ?
          AND status = 'APPROVED' AND validation_status = 'VALID'
          ORDER BY version DESC LIMIT 1`,
        )
        .get(input.request.corporationId) as Row | undefined;
      if (typeof plan?.id !== "string") throw new ExecutionStartPlanError();

      const organizationRow = this.#database
        .prepare(
          `SELECT o.id, o.version, o.status, o.snapshot_json, a.routes_json
          FROM organization_version o JOIN organization_activation a ON a.organization_id = o.id
          WHERE o.corporation_id = ? AND o.plan_id = ? AND o.version = ?`,
        )
        .get(
          input.request.corporationId,
          plan.id,
          corporation.active_organization_version,
        ) as Row | undefined;
      if (organizationRow?.status !== "APPROVED")
        throw new ExecutionStartOrganizationError();
      const organization = parseOrganization(organizationRow.snapshot_json);
      this.#validateRoutes(organizationRow.routes_json);

      const taskRows = this.#database
        .prepare(
          `SELECT id, title, kind, priority, status, contract_json, created_at
          FROM task WHERE corporation_id = ? AND plan_id = ? ORDER BY created_at, id`,
        )
        .all(input.request.corporationId, plan.id) as Row[];
      if (
        taskRows.length === 0 ||
        taskRows.some(({ status }) => status !== "DRAFT")
      )
        throw new ExecutionStartStateError();
      const dependent = new Set(
        (
          this.#database
            .prepare(
              "SELECT downstream_task_id FROM task_dependency WHERE plan_id = ?",
            )
            .all(plan.id) as Row[]
        ).map(({ downstream_task_id }) => String(downstream_task_id)),
      );
      const assignments = new Map(
        organization.assignments.map((item) => [item.taskId, item]),
      );
      if (
        assignments.size !== taskRows.length ||
        taskRows.some(({ id }) => !assignments.has(String(id)))
      )
        throw new ExecutionStartAssignmentError();

      const entries = taskRows
        .filter(({ id }) => !dependent.has(String(id)))
        .sort(
          (left, right) =>
            Number(right.priority) - Number(left.priority) ||
            Number(right.kind === "HUMAN_DECISION") -
              Number(left.kind === "HUMAN_DECISION") ||
            String(left.created_at).localeCompare(String(right.created_at)) ||
            String(left.id).localeCompare(String(right.id)),
        );
      const selected = entries[0];
      if (selected === undefined) throw new ExecutionStartNoEntryTaskError();

      const setStatus = this.#database.prepare(
        "UPDATE task SET status = ?, updated_at = ? WHERE id = ? AND status = 'DRAFT'",
      );
      for (const task of taskRows) {
        const status = dependent.has(String(task.id)) ? "BLOCKED" : "READY";
        if (setStatus.run(status, input.now, String(task.id)).changes !== 1)
          throw new ExecutionStartStateError();
      }

      const selectedId = String(selected.id);
      const selectedKind = String(selected.kind);
      const assignment = assignments.get(selectedId);
      let run: ExecutionStart["run"];
      let corporationStatus: "EXECUTING" | "WAITING_HUMAN";
      if (selectedKind === "HUMAN_DECISION") {
        if (
          assignment?.ownerType !== "HUMAN" ||
          assignment.ownerId !== "human.user"
        )
          throw new ExecutionStartAssignmentError();
        if (
          this.#database
            .prepare(
              "UPDATE task SET status = 'WAITING_HUMAN', updated_at = ? WHERE id = ? AND status = 'READY'",
            )
            .run(input.now, selectedId).changes !== 1
        )
          throw new ExecutionStartStateError();
        corporationStatus = "WAITING_HUMAN";
      } else {
        if (assignment?.ownerType !== "AGENT")
          throw new ExecutionStartAssignmentError();
        const agent = this.#database
          .prepare(
            `SELECT id FROM agent_instance WHERE corporation_id = ? AND organization_id = ?
            AND member_id = ? AND status = 'READY'`,
          )
          .get(
            input.request.corporationId,
            String(organizationRow.id),
            assignment.ownerId,
          ) as Row | undefined;
        if (typeof agent?.id !== "string")
          throw new ExecutionStartAssignmentError();
        const contract = taskContractSchema.parse(
          JSON.parse(String(selected.contract_json)),
        );
        if (
          this.#database
            .prepare(
              `UPDATE task SET status = 'RUNNING', attempt = 1,
          assigned_agent_id = ?, lease_owner = ?, lease_expires_at = NULL,
          version = version + 1, updated_at = ? WHERE id = ? AND status = 'READY'`,
            )
            .run(agent.id, input.runId, input.now, selectedId).changes !== 1
        )
          throw new ExecutionStartStateError();
        if (
          this.#database
            .prepare(
              "UPDATE agent_instance SET status = 'BUSY', updated_at = ? WHERE id = ? AND status = 'READY'",
            )
            .run(input.now, agent.id).changes !== 1
        )
          throw new ExecutionStartStateError();
        this.#database
          .prepare(
            `INSERT INTO agent_run
          (id, corporation_id, task_id, agent_instance_id, attempt, status,
           limits_json, usage_json, checkpoint_json, created_at, updated_at)
          VALUES (?, ?, ?, ?, 1, 'CREATED', ?, '{}', ?, ?, ?)`,
          )
          .run(
            input.runId,
            input.request.corporationId,
            selectedId,
            agent.id,
            JSON.stringify({
              maxInputTokens: contract.budget.maxInputTokens,
              maxOutputTokens: contract.budget.maxOutputTokens,
              maxCostMicros: contract.budget.maxCostMicros,
              timeoutMs: contract.budget.maxDurationMs,
              maxModelTurns: 8,
              maxToolCalls: 0,
            }),
            JSON.stringify({
              sequence: 0,
              phase: "CREATED",
              committedToolCallIds: [],
              temporaryArtifactIds: [],
              usageSnapshot: {},
            }),
            input.now,
            input.now,
          );
        run = {
          runId: input.runId,
          taskId: selectedId,
          agentInstanceId: String(agent.id),
          attempt: 1,
          status: "CREATED",
        };
        corporationStatus = "EXECUTING";
      }

      const nextVersion = Number(corporation.version) + 1;
      if (
        this.#database
          .prepare(
            `UPDATE corporation SET status = ?, version = ?, updated_at = ?
        WHERE id = ? AND version = ? AND status = 'DRAFT'`,
          )
          .run(
            corporationStatus,
            nextVersion,
            input.now,
            input.request.corporationId,
            corporation.version,
          ).changes !== 1
      )
        throw new ExecutionStartVersionError();

      this.#database
        .prepare(
          `INSERT INTO domain_event
        (event_id, schema_version, event_type, aggregate_type, aggregate_id,
         aggregate_version, corporation_id, correlation_id, actor_json,
         payload_json, sensitivity, occurred_at)
        VALUES (?, '1.0', ?, 'CORPORATION', ?, ?, ?, ?, ?, ?, 'NORMAL', ?)`,
        )
        .run(
          input.eventId,
          corporationStatus === "EXECUTING"
            ? "corporation.execution.started"
            : "corporation.human-decision.requested",
          input.request.corporationId,
          nextVersion,
          input.request.corporationId,
          input.request.commandId,
          JSON.stringify({ type: "USER", id: "local-user" }),
          JSON.stringify({ selectedTaskId: selectedId }),
          input.now,
        );

      const currentTasks = this.#database
        .prepare(
          "SELECT id, title, status FROM task WHERE plan_id = ? ORDER BY created_at, id",
        )
        .all(plan.id) as Row[];
      const result = executionStartSchema.parse({
        schemaVersion: "1.0",
        corporationId: input.request.corporationId,
        corporationVersion: nextVersion,
        corporationStatus,
        selectedTaskId: selectedId,
        selectedTaskTitle: selected.title,
        selectedTaskKind: selectedKind,
        tasks: currentTasks.map((task) => ({
          taskId: task.id,
          title: task.title,
          status: task.status,
        })),
        ...(run === undefined ? {} : { run }),
        startedAt: input.now,
      });
      this.#database
        .prepare(
          `INSERT INTO execution_start
        (corporation_id, command_id, request_hash, result_json, created_at)
        VALUES (?, ?, ?, ?, ?)`,
        )
        .run(
          input.request.corporationId,
          input.request.commandId,
          input.requestHash,
          JSON.stringify(result),
          input.now,
        );
      this.#database.exec("COMMIT");
      return result;
    } catch (error) {
      try {
        this.#database.exec("ROLLBACK");
      } catch {
        /* keep original */
      }
      if (
        error instanceof ExecutionStartNotFoundError ||
        error instanceof ExecutionStartVersionError ||
        error instanceof ExecutionStartStateError ||
        error instanceof ExecutionStartWorkspaceError ||
        error instanceof ExecutionStartPlanError ||
        error instanceof ExecutionStartOrganizationError ||
        error instanceof ExecutionStartProviderError ||
        error instanceof ExecutionStartAssignmentError ||
        error instanceof ExecutionStartNoEntryTaskError ||
        error instanceof ExecutionStartCommandConflictError
      )
        throw error;
      throw new ExecutionStartDataError();
    }
  }

  #validateRoutes(value: unknown): void {
    let routes: unknown;
    try {
      routes = JSON.parse(String(value));
    } catch {
      throw new ExecutionStartDataError();
    }
    if (typeof routes !== "object" || routes === null)
      throw new ExecutionStartDataError();
    for (const route of Object.values(routes)) {
      if (
        typeof route !== "object" ||
        route === null ||
        !("providerId" in route) ||
        !("providerVersion" in route) ||
        !("modelId" in route)
      )
        throw new ExecutionStartDataError();
      const row = this.#database
        .prepare(
          `SELECT p.version, p.config_status, p.key_vault_entry_id,
        t.status, t.models_json FROM provider p LEFT JOIN provider_connection_test t
        ON t.provider_id = p.id AND t.provider_version = p.version WHERE p.id = ?`,
        )
        .get(route.providerId) as Row | undefined;
      let models: unknown;
      try {
        models = JSON.parse(String(row?.models_json));
      } catch {
        throw new ExecutionStartProviderError();
      }
      if (
        row === undefined ||
        row.version !== route.providerVersion ||
        row.config_status !== "ENABLED" ||
        typeof row.key_vault_entry_id !== "string" ||
        row.status !== "VERIFIED" ||
        !Array.isArray(models) ||
        !models.some(
          (model) =>
            typeof model === "object" &&
            model !== null &&
            "id" in model &&
            model.id === route.modelId,
        )
      )
        throw new ExecutionStartProviderError();
    }
  }
}

function parseResult(value: unknown): ExecutionStart {
  try {
    return executionStartSchema.parse(JSON.parse(String(value)));
  } catch {
    throw new ExecutionStartDataError();
  }
}

function parseOrganization(value: unknown): OrganizationProposal {
  try {
    const parsed = JSON.parse(String(value)) as Record<string, unknown>;
    return organizationProposalSchema.parse({ ...parsed, status: "APPROVED" });
  } catch {
    throw new ExecutionStartDataError();
  }
}
