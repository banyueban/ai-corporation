import { createHash } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import {
  agentRunSchema,
  taskContractSchema,
  type AgentModelCandidate,
  type AgentRun,
  type NormalizedUsage,
} from "@ai-corporation/protocols";

export class AgentRunNotFoundError extends Error {}
export class AgentRunStateError extends Error {}
export class AgentRunInputUnsupportedError extends Error {}
export class AgentRunDataError extends Error {}
export class AgentRunCommandConflictError extends Error {}

type Row = Record<string, unknown>;
export type PreparedAgentRun = {
  run: AgentRun;
  providerId: string;
  providerVersion: number;
  modelId: string;
  goal: unknown;
  contract: ReturnType<typeof taskContractSchema.parse>;
  role: unknown;
};

export class AgentRunRepository {
  constructor(readonly database: DatabaseSync) {}

  getCurrent(corporationId: string): AgentRun | undefined {
    const row = this.database
      .prepare(
        `SELECT r.*, t.title FROM agent_run r JOIN task t ON t.id=r.task_id WHERE r.corporation_id=? ORDER BY r.created_at DESC LIMIT 1`,
      )
      .get(corporationId) as Row | undefined;
    return row === undefined ? undefined : this.parseRun(row);
  }

  inspect(runId: string, expectedAttempt: number): PreparedAgentRun {
    try {
      const row = this.database
        .prepare(
          `SELECT r.*, t.title, t.contract_json, a.snapshot_json, c.active_goal_version,
           g.content_json AS goal_json FROM agent_run r JOIN task t ON t.id=r.task_id
           JOIN agent_instance a ON a.id=r.agent_instance_id JOIN corporation c ON c.id=r.corporation_id
           JOIN goal_contract_version g ON g.corporation_id=c.id AND g.version=c.active_goal_version WHERE r.id=?`,
        )
        .get(runId) as Row | undefined;
      if (row === undefined) throw new AgentRunNotFoundError();
      if (row.attempt !== expectedAttempt || row.status !== "CREATED")
        throw new AgentRunStateError();
      const contract = taskContractSchema.parse(
        JSON.parse(String(row.contract_json)),
      );
      if (
        contract.permissionRequest.workspaceRead ||
        contract.permissionRequest.workspaceWrite.length > 0 ||
        contract.permissionRequest.processProfiles.length > 0 ||
        contract.inputRefs.some((item) => item.source === "TASK_OUTPUT")
      )
        throw new AgentRunInputUnsupportedError();
      const snapshot = JSON.parse(String(row.snapshot_json)) as {
        member?: unknown;
        route?: {
          providerId?: unknown;
          providerVersion?: unknown;
          modelId?: unknown;
        };
      };
      const route = snapshot.route;
      if (
        typeof route?.providerId !== "string" ||
        typeof route.providerVersion !== "number" ||
        typeof route.modelId !== "string"
      )
        throw new AgentRunDataError();
      return {
        run: this.parseRun(row),
        providerId: route.providerId,
        providerVersion: route.providerVersion,
        modelId: route.modelId,
        goal: JSON.parse(String(row.goal_json)),
        contract,
        role: snapshot.member,
      };
    } catch (error) {
      if (
        error instanceof AgentRunNotFoundError ||
        error instanceof AgentRunStateError ||
        error instanceof AgentRunInputUnsupportedError
      )
        throw error;
      throw new AgentRunDataError();
    }
  }

  claimCommand(input: {
    commandId: string;
    commandType: "CONTINUE" | "RETRY" | "CANCEL";
    corporationId: string;
    runId: string;
    expectedAttempt: number;
    now: string;
  }): AgentRun | undefined {
    const hash = createHash("sha256")
      .update(
        JSON.stringify({
          commandType: input.commandType,
          corporationId: input.corporationId,
          runId: input.runId,
          expectedAttempt: input.expectedAttempt,
        }),
      )
      .digest("hex");
    try {
      this.database
        .prepare(
          `INSERT INTO agent_run_command (command_id,command_type,corporation_id,run_id,request_hash,result_run_id,created_at)
           VALUES (?,?,?,?,?,?,?)`,
        )
        .run(
          input.commandId,
          input.commandType,
          input.corporationId,
          input.runId,
          hash,
          input.runId,
          input.now,
        );
      return undefined;
    } catch {
      const row = this.database
        .prepare(
          "SELECT request_hash,result_run_id FROM agent_run_command WHERE command_id=?",
        )
        .get(input.commandId) as Row | undefined;
      if (row === undefined) throw new AgentRunDataError();
      if (row.request_hash !== hash) throw new AgentRunCommandConflictError();
      return this.getById(String(row.result_run_id));
    }
  }

  completeCommand(commandId: string, resultRunId: string): void {
    this.database
      .prepare(
        "UPDATE agent_run_command SET result_run_id=? WHERE command_id=?",
      )
      .run(resultRunId, commandId);
  }

  retry(
    runId: string,
    expectedAttempt: number,
    newRunId: string,
    now: string,
  ): AgentRun {
    this.database.exec("BEGIN IMMEDIATE");
    try {
      const row = this.database
        .prepare("SELECT * FROM agent_run WHERE id=?")
        .get(runId) as Row | undefined;
      if (row === undefined) throw new AgentRunNotFoundError();
      if (
        row.attempt !== expectedAttempt ||
        !["FAILED", "CANCELLED"].includes(String(row.status))
      )
        throw new AgentRunStateError();
      const nextAttempt = expectedAttempt + 1;
      this.database
        .prepare(
          `INSERT INTO agent_run (id,corporation_id,task_id,agent_instance_id,attempt,status,limits_json,usage_json,checkpoint_json,created_at,updated_at)
        VALUES (?,?,?,?,?,'CREATED',?,'{}',?,?,?)`,
        )
        .run(
          newRunId,
          String(row.corporation_id),
          String(row.task_id),
          String(row.agent_instance_id),
          nextAttempt,
          String(row.limits_json),
          JSON.stringify({
            sequence: 0,
            phase: "CREATED",
            committedToolCallIds: [],
            temporaryArtifactIds: [],
            usageSnapshot: {},
          }),
          now,
          now,
        );
      this.database
        .prepare(
          "UPDATE task SET status='RUNNING',attempt=?,assigned_agent_id=?,lease_owner=?,updated_at=? WHERE id=? AND status='RETRY_PENDING'",
        )
        .run(
          nextAttempt,
          String(row.agent_instance_id),
          newRunId,
          now,
          String(row.task_id),
        );
      this.database
        .prepare(
          "UPDATE agent_instance SET status='BUSY',updated_at=? WHERE id=? AND status='READY'",
        )
        .run(now, String(row.agent_instance_id));
      this.database.exec("COMMIT");
      return this.getById(newRunId);
    } catch (error) {
      try {
        this.database.exec("ROLLBACK");
      } catch {
        // Preserve the original repository error when rollback is unavailable.
      }
      if (
        error instanceof AgentRunNotFoundError ||
        error instanceof AgentRunStateError
      )
        throw error;
      throw new AgentRunDataError();
    }
  }

  cancel(runId: string, expectedAttempt: number, now: string): AgentRun {
    this.database.exec("BEGIN IMMEDIATE");
    try {
      const row = this.database
        .prepare(
          "SELECT task_id,agent_instance_id,status,attempt FROM agent_run WHERE id=?",
        )
        .get(runId) as Row | undefined;
      if (row === undefined) throw new AgentRunNotFoundError();
      if (
        row.attempt !== expectedAttempt ||
        !["PREPARING", "READY", "RUNNING"].includes(String(row.status))
      )
        throw new AgentRunStateError();
      this.database
        .prepare(
          "UPDATE model_call SET status='CANCELLED',failure_reason='CANCELLED',ended_at=? WHERE run_id=? AND status='STARTED'",
        )
        .run(now, runId);
      this.database
        .prepare(
          "UPDATE agent_run SET status='CANCELLED',failure_json=?,updated_at=?,ended_at=? WHERE id=?",
        )
        .run(JSON.stringify({ reason: "CANCELLED" }), now, now, runId);
      this.database
        .prepare(
          "UPDATE task SET status='RETRY_PENDING',updated_at=? WHERE id=?",
        )
        .run(now, String(row.task_id));
      this.database
        .prepare(
          "UPDATE agent_instance SET status='READY',updated_at=? WHERE id=?",
        )
        .run(now, String(row.agent_instance_id));
      this.database.exec("COMMIT");
      return this.getById(runId);
    } catch (error) {
      try {
        this.database.exec("ROLLBACK");
      } catch {
        // Preserve the original repository error when rollback is unavailable.
      }
      if (
        error instanceof AgentRunNotFoundError ||
        error instanceof AgentRunStateError
      )
        throw error;
      throw new AgentRunDataError();
    }
  }

  prepare(
    runId: string,
    expectedAttempt: number,
    modelCallId: string,
    now: string,
  ): PreparedAgentRun {
    this.database.exec("BEGIN IMMEDIATE");
    try {
      const inspected = this.inspect(runId, expectedAttempt);
      const row = this.database
        .prepare(
          `SELECT r.*, t.title, t.contract_json, a.snapshot_json, c.active_goal_version,
        g.content_json AS goal_json FROM agent_run r JOIN task t ON t.id=r.task_id
        JOIN agent_instance a ON a.id=r.agent_instance_id JOIN corporation c ON c.id=r.corporation_id
        JOIN goal_contract_version g ON g.corporation_id=c.id AND g.version=c.active_goal_version WHERE r.id=?`,
        )
        .get(runId) as Row | undefined;
      if (row === undefined) throw new AgentRunNotFoundError();
      const snapshot = JSON.parse(String(row.snapshot_json)) as {
        member?: unknown;
        route?: {
          providerId?: unknown;
          providerVersion?: unknown;
          modelId?: unknown;
        };
      };
      const route = snapshot.route;
      if (
        typeof route?.providerId !== "string" ||
        typeof route.providerVersion !== "number" ||
        typeof route.modelId !== "string"
      )
        throw new AgentRunDataError();
      for (const status of ["PREPARING", "READY", "RUNNING"])
        this.database
          .prepare(
            "UPDATE agent_run SET status=?, checkpoint_json=?, updated_at=?, started_at=COALESCE(started_at,?) WHERE id=?",
          )
          .run(
            status,
            JSON.stringify({
              sequence: status === "PREPARING" ? 1 : status === "READY" ? 2 : 3,
              phase: status,
              committedToolCallIds: [],
              temporaryArtifactIds: [],
              usageSnapshot: {},
            }),
            now,
            now,
            runId,
          );
      this.database
        .prepare(
          `INSERT INTO model_call (id,corporation_id,operation_id,purpose,task_id,run_id,provider_id,provider_version,model_id,attempt,status,request_meta_json,usage_json,started_at)
        VALUES (?,?,?,'AGENT_RUN',?,?,?,?,?,1,'STARTED',?,'{}',?)`,
        )
        .run(
          modelCallId,
          String(row.corporation_id),
          runId,
          String(row.task_id),
          runId,
          route.providerId,
          route.providerVersion,
          route.modelId,
          JSON.stringify({
            schemaVersion: 1,
            promptTemplate: "executor.candidate-only.v2",
            repair: false,
          }),
          now,
        );
      this.database.exec("COMMIT");
      return {
        run: this.getById(runId),
        providerId: route.providerId,
        providerVersion: route.providerVersion,
        modelId: route.modelId,
        goal: JSON.parse(String(row.goal_json)),
        contract: inspected.contract,
        role: snapshot.member,
      };
    } catch (error) {
      try {
        this.database.exec("ROLLBACK");
      } catch {
        // Preserve the original repository error when rollback is unavailable.
      }
      if (
        error instanceof AgentRunNotFoundError ||
        error instanceof AgentRunStateError ||
        error instanceof AgentRunInputUnsupportedError
      )
        throw error;
      throw new AgentRunDataError();
    }
  }

  produce(input: {
    runId: string;
    modelCallId: string;
    candidateIds: readonly string[];
    candidate: AgentModelCandidate;
    callUsage: NormalizedUsage;
    runUsage: NormalizedUsage;
    now: string;
  }): AgentRun {
    this.database.exec("BEGIN IMMEDIATE");
    try {
      const run = this.database
        .prepare("SELECT status FROM agent_run WHERE id=?")
        .get(input.runId) as Row | undefined;
      if (run?.status !== "RUNNING") throw new AgentRunStateError();
      input.candidate.outputs.forEach((output, index) =>
        this.database
          .prepare(
            `INSERT INTO agent_run_candidate (id,run_id,logical_name,artifact_type,media_type,content,sha256,created_at) VALUES (?,?,?,?,?,?,?,?)`,
          )
          .run(
            input.candidateIds[index] ??
              (() => {
                throw new AgentRunDataError();
              })(),
            input.runId,
            output.logicalName,
            output.artifactType,
            output.mediaType,
            output.content,
            createHash("sha256").update(output.content).digest("hex"),
            input.now,
          ),
      );
      this.database
        .prepare(
          "UPDATE model_call SET status='SUCCEEDED', response_meta_json=?, usage_json=?, ended_at=? WHERE id=? AND status='STARTED'",
        )
        .run(
          JSON.stringify({ schemaVersion: 1, result: "CANDIDATE_PRODUCED" }),
          JSON.stringify(input.callUsage),
          input.now,
          input.modelCallId,
        );
      this.database
        .prepare(
          "UPDATE agent_run SET status='PRODUCED', usage_json=?, checkpoint_json=?, updated_at=? WHERE id=? AND status='RUNNING'",
        )
        .run(
          JSON.stringify(input.runUsage),
          JSON.stringify({
            sequence: 4,
            phase: "PRODUCED",
            summary: input.candidate.summary,
            committedToolCallIds: [],
            temporaryArtifactIds: input.candidateIds,
            usageSnapshot: input.runUsage,
          }),
          input.now,
          input.runId,
        );
      this.database.exec("COMMIT");
      return this.getById(input.runId);
    } catch (error) {
      try {
        this.database.exec("ROLLBACK");
      } catch {
        // Preserve the original repository error when rollback is unavailable.
      }
      if (error instanceof AgentRunStateError) throw error;
      throw new AgentRunDataError();
    }
  }

  startRepair(
    runId: string,
    firstCallId: string,
    repairCallId: string,
    usage: NormalizedUsage,
    now: string,
  ): void {
    this.database.exec("BEGIN IMMEDIATE");
    try {
      const first = this.database
        .prepare(
          "SELECT corporation_id,task_id,provider_id,provider_version,model_id FROM model_call WHERE id=? AND run_id=? AND status='STARTED'",
        )
        .get(firstCallId, runId) as Row | undefined;
      if (first === undefined) throw new AgentRunStateError();
      const run = this.database
        .prepare("SELECT status FROM agent_run WHERE id=?")
        .get(runId) as Row | undefined;
      if (run?.status !== "RUNNING") throw new AgentRunStateError();
      this.database
        .prepare(
          "UPDATE model_call SET status='FAILED',response_meta_json=?,usage_json=?,failure_reason='INVALID_MODEL_OUTPUT',ended_at=? WHERE id=? AND status='STARTED'",
        )
        .run(
          JSON.stringify({
            schemaVersion: 1,
            result: "FORMAT_REPAIR_REQUIRED",
          }),
          JSON.stringify(usage),
          now,
          firstCallId,
        );
      this.database
        .prepare(
          `INSERT INTO model_call (id,corporation_id,operation_id,purpose,task_id,run_id,provider_id,provider_version,model_id,attempt,status,request_meta_json,usage_json,started_at)
           VALUES (?,?,?,'AGENT_RUN',?,?,?,?,?,2,'STARTED',?,'{}',?)`,
        )
        .run(
          repairCallId,
          String(first.corporation_id),
          runId,
          String(first.task_id),
          runId,
          String(first.provider_id),
          Number(first.provider_version),
          String(first.model_id),
          JSON.stringify({
            schemaVersion: 1,
            promptTemplate: "executor.format-repair.v1",
            repair: true,
          }),
          now,
        );
      this.database.exec("COMMIT");
    } catch (error) {
      try {
        this.database.exec("ROLLBACK");
      } catch {
        // Preserve the original repository error when rollback is unavailable.
      }
      if (error instanceof AgentRunStateError) throw error;
      throw new AgentRunDataError();
    }
  }

  fail(
    runId: string,
    modelCallId: string,
    reason: string,
    callUsage: NormalizedUsage,
    runUsage: NormalizedUsage,
    now: string,
  ): AgentRun {
    this.database.exec("BEGIN IMMEDIATE");
    try {
      this.database
        .prepare(
          "UPDATE model_call SET status='FAILED',response_meta_json=?,usage_json=?,failure_reason=?,ended_at=? WHERE id=? AND status='STARTED'",
        )
        .run(
          JSON.stringify({ schemaVersion: 1, result: "FAILED" }),
          JSON.stringify(callUsage),
          reason,
          now,
          modelCallId,
        );
      const row = this.database
        .prepare(
          "SELECT task_id,agent_instance_id FROM agent_run WHERE id=? AND status='RUNNING'",
        )
        .get(runId) as Row | undefined;
      if (row === undefined) throw new AgentRunStateError();
      this.database
        .prepare(
          "UPDATE agent_run SET status='FAILED',usage_json=?,failure_json=?,updated_at=?,ended_at=? WHERE id=?",
        )
        .run(
          JSON.stringify(runUsage),
          JSON.stringify({ reason }),
          now,
          now,
          runId,
        );
      this.database
        .prepare(
          "UPDATE task SET status='RETRY_PENDING',updated_at=? WHERE id=?",
        )
        .run(now, String(row.task_id));
      this.database
        .prepare(
          "UPDATE agent_instance SET status='READY',updated_at=? WHERE id=?",
        )
        .run(now, String(row.agent_instance_id));
      this.database.exec("COMMIT");
      return this.getById(runId);
    } catch (error) {
      try {
        this.database.exec("ROLLBACK");
      } catch {
        // Preserve the original repository error when rollback is unavailable.
      }
      if (error instanceof AgentRunStateError) throw error;
      throw new AgentRunDataError();
    }
  }

  getById(runId: string): AgentRun {
    const row = this.database
      .prepare(
        `SELECT r.*,t.title FROM agent_run r JOIN task t ON t.id=r.task_id WHERE r.id=?`,
      )
      .get(runId) as Row | undefined;
    if (row === undefined) throw new AgentRunNotFoundError();
    return this.parseRun(row);
  }
  private parseRun(row: Row): AgentRun {
    const candidates = this.database
      .prepare(
        "SELECT * FROM agent_run_candidate WHERE run_id=? ORDER BY created_at,id",
      )
      .all(String(row.id)) as Row[];
    const checkpoint = JSON.parse(String(row.checkpoint_json)) as {
      summary?: string;
    };
    const failure =
      row.failure_json === null
        ? undefined
        : (JSON.parse(String(row.failure_json)) as { reason?: string });
    const storedUsage = JSON.parse(String(row.usage_json)) as NormalizedUsage;
    const modelCall = this.database
      .prepare(
        "SELECT model_id FROM model_call WHERE run_id=? ORDER BY attempt DESC LIMIT 1",
      )
      .get(String(row.id)) as Row | undefined;
    return agentRunSchema.parse({
      schemaVersion: "1.0",
      runId: row.id,
      corporationId: row.corporation_id,
      taskId: row.task_id,
      taskTitle: row.title,
      agentInstanceId: row.agent_instance_id,
      attempt: row.attempt,
      status: row.status,
      ...(typeof modelCall?.model_id === "string"
        ? { modelId: modelCall.model_id }
        : {}),
      usage: {
        ...storedUsage,
        costSource: storedUsage.costSource ?? "UNKNOWN",
      },
      ...(checkpoint.summary ? { summary: checkpoint.summary } : {}),
      outputs: candidates.map((c) => ({
        candidateId: c.id,
        logicalName: c.logical_name,
        artifactType: c.artifact_type,
        mediaType: c.media_type,
        content: c.content,
        contentRef: `candidate://${String(c.id)}`,
      })),
      ...(failure?.reason ? { failureReason: failure.reason } : {}),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    });
  }
}
