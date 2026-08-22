import { DatabaseSync } from "node:sqlite";
import { piTaskSchema, type PiTask } from "@ai-corporation/protocols";

type PiTaskDeliverable = NonNullable<PiTask["deliverables"]>[number];

export type PiTaskStatus = PiTask["status"];

export interface PendingWorkspaceWrite {
  readonly toolCallId: string;
  readonly taskId: string;
  readonly workspaceId: string;
  readonly relativePath: string;
  readonly baseSha256?: string;
  readonly targetSha256: string;
}

export interface PendingCommandCall {
  readonly command: string;
  readonly taskId: string;
  readonly toolCallId: string;
}

/** Stores every visible model and tool event in the same order it occurred. */
export class PiTaskRepository {
  constructor(private readonly database: DatabaseSync) {}

  create(input: {
    readonly id: string;
    readonly companyId: string;
    readonly employeeId: string;
    readonly workspaceId: string;
    readonly userInput: string;
    readonly now: string;
  }): PiTask {
    this.database
      .prepare(
        `INSERT INTO pi_task (
          id, company_id, employee_id, workspace_id, user_input, status,
          created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, 'RUNNING', ?, ?)`,
      )
      .run(
        input.id,
        input.companyId,
        input.employeeId,
        input.workspaceId,
        input.userInput,
        input.now,
        input.now,
      );
    return this.require(input.id);
  }

  get(id: string): PiTask | undefined {
    const row = this.database
      .prepare("SELECT * FROM pi_task WHERE id = ?")
      .get(id);
    return row === undefined ? undefined : this.parse(row);
  }

  list(companyId: string): readonly PiTask[] {
    return this.database
      .prepare(
        `SELECT * FROM pi_task WHERE company_id = ?
        ORDER BY updated_at DESC, id DESC`,
      )
      .all(companyId)
      .map((row) => this.parse(row));
  }

  getLatest(companyId: string, employeeId: string): PiTask | undefined {
    const row = this.database
      .prepare(
        `SELECT * FROM pi_task WHERE company_id = ? AND employee_id = ?
        ORDER BY updated_at DESC, id DESC LIMIT 1`,
      )
      .get(companyId, employeeId);
    return row === undefined ? undefined : this.parse(row);
  }

  appendEvent(
    taskId: string,
    kind: PiTask["events"][number]["kind"],
    content: string,
    now: string,
  ): PiTask {
    this.database.exec("BEGIN IMMEDIATE");
    try {
      const sequenceRow = this.database
        .prepare(
          "SELECT COALESCE(MAX(sequence), 0) + 1 AS sequence FROM pi_task_event WHERE task_id = ?",
        )
        .get(taskId);
      const sequence = sequenceRow?.sequence;
      if (typeof sequence !== "number")
        throw new Error("Invalid event sequence");
      this.database
        .prepare(
          `INSERT INTO pi_task_event (task_id, sequence, kind, content, created_at)
          VALUES (?, ?, ?, ?, ?)`,
        )
        .run(taskId, sequence, kind, content, now);
      this.database
        .prepare("UPDATE pi_task SET updated_at = ? WHERE id = ?")
        .run(now, taskId);
      this.database.exec("COMMIT");
    } catch (error) {
      this.database.exec("ROLLBACK");
      throw error;
    }
    return this.require(taskId);
  }

  setStatus(
    taskId: string,
    status: PiTaskStatus,
    now: string,
    details: {
      readonly finalOutput?: string;
      readonly failureMessage?: string;
    } = {},
  ): PiTask {
    this.database
      .prepare(
        `UPDATE pi_task SET status = ?, final_output = ?, failure_message = ?,
          updated_at = ? WHERE id = ?`,
      )
      .run(
        status,
        details.finalOutput ?? null,
        details.failureMessage ?? null,
        now,
        taskId,
      );
    return this.require(taskId);
  }

  interruptRunning(now: string): void {
    this.database
      .prepare(
        `DELETE FROM pi_command_grant WHERE task_id IN (
          SELECT id FROM pi_task WHERE status = 'RUNNING'
        )`,
      )
      .run();
    this.database
      .prepare(
        `UPDATE pi_task SET status = 'INTERRUPTED',
          failure_message = '软件上次关闭时任务仍在运行，没有自动重复调用模型。',
          updated_at = ? WHERE status = 'RUNNING'`,
      )
      .run(now);
  }

  /** Records write intent before touching the filesystem. */
  beginWorkspaceWrite(input: {
    readonly toolCallId: string;
    readonly taskId: string;
    readonly relativePath: string;
    readonly baseSha256?: string;
    readonly targetSha256: string;
    readonly now: string;
  }): { readonly status: string; readonly result?: unknown } | undefined {
    const existing = this.database
      .prepare(
        "SELECT status, result_json FROM pi_workspace_write WHERE tool_call_id = ?",
      )
      .get(input.toolCallId);
    if (existing !== undefined) {
      return {
        status: String(existing.status),
        ...(typeof existing.result_json === "string"
          ? { result: JSON.parse(existing.result_json) as unknown }
          : {}),
      };
    }
    this.database
      .prepare(
        `INSERT INTO pi_workspace_write (
          tool_call_id, task_id, relative_path, base_sha256, target_sha256,
          status, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, 'STARTING', ?, ?)`,
      )
      .run(
        input.toolCallId,
        input.taskId,
        input.relativePath,
        input.baseSha256 ?? null,
        input.targetSha256,
        input.now,
        input.now,
      );
    return undefined;
  }

  finishWorkspaceWrite(
    toolCallId: string,
    status: "SUCCEEDED" | "FAILED" | "UNKNOWN",
    result: unknown,
    now: string,
  ): void {
    this.database
      .prepare(
        `UPDATE pi_workspace_write SET status = ?, result_json = ?, updated_at = ?
        WHERE tool_call_id = ?`,
      )
      .run(status, JSON.stringify(result), now, toolCallId);
  }

  /** Keeps one current, verified record for each delivered task file. */
  upsertDeliverable(
    input: PiTaskDeliverable & {
      readonly taskId: string;
      readonly sourceCallId: string;
    },
  ): void {
    this.database
      .prepare(
        `INSERT INTO pi_task_deliverable (
          task_id, relative_path, source, change_kind, sha256, size_bytes,
          diff_text, source_call_id, registered_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(task_id, relative_path) DO UPDATE SET
          source = excluded.source,
          change_kind = excluded.change_kind,
          sha256 = excluded.sha256,
          size_bytes = excluded.size_bytes,
          diff_text = excluded.diff_text,
          source_call_id = excluded.source_call_id,
          registered_at = excluded.registered_at`,
      )
      .run(
        input.taskId,
        input.relativePath,
        input.source,
        input.changeKind,
        input.sha256,
        input.sizeBytes,
        input.diff ?? null,
        input.sourceCallId,
        input.registeredAt,
      );
  }

  getDeliverable(
    taskId: string,
    relativePath: string,
  ): PiTaskDeliverable | undefined {
    const row = this.database
      .prepare(
        `SELECT relative_path, source, change_kind, sha256, size_bytes,
          diff_text, registered_at
        FROM pi_task_deliverable WHERE task_id = ? AND relative_path = ?`,
      )
      .get(taskId, relativePath);
    return row === undefined ? undefined : parseDeliverable(row);
  }

  listDeliverables(taskId: string): readonly PiTaskDeliverable[] {
    return this.database
      .prepare(
        `SELECT relative_path, source, change_kind, sha256, size_bytes,
          diff_text, registered_at
        FROM pi_task_deliverable WHERE task_id = ?
        ORDER BY registered_at, relative_path`,
      )
      .all(taskId)
      .map(parseDeliverable);
  }

  listPendingWorkspaceWrites(): readonly PendingWorkspaceWrite[] {
    return this.database
      .prepare(
        `SELECT w.tool_call_id, w.task_id, t.workspace_id, w.relative_path,
          w.base_sha256, w.target_sha256
        FROM pi_workspace_write w
        JOIN pi_task t ON t.id = w.task_id
        WHERE w.status = 'STARTING'
        ORDER BY w.created_at, w.tool_call_id`,
      )
      .all()
      .map((row) => {
        if (
          typeof row.tool_call_id !== "string" ||
          typeof row.task_id !== "string" ||
          typeof row.workspace_id !== "string" ||
          typeof row.relative_path !== "string" ||
          typeof row.target_sha256 !== "string"
        ) {
          throw new Error("Pending workspace write is invalid");
        }
        return {
          toolCallId: row.tool_call_id,
          taskId: row.task_id,
          workspaceId: row.workspace_id,
          relativePath: row.relative_path,
          ...(typeof row.base_sha256 === "string"
            ? { baseSha256: row.base_sha256 }
            : {}),
          targetSha256: row.target_sha256,
        };
      });
  }

  /** Records a command before the process starts so restart never replays it. */
  beginCommandCall(input: {
    readonly command: string;
    readonly now: string;
    readonly taskId: string;
    readonly toolCallId: string;
  }): void {
    this.database
      .prepare(
        `INSERT INTO pi_command_call (
          tool_call_id, task_id, command_text, status, created_at, updated_at
        ) VALUES (?, ?, ?, 'STARTING', ?, ?)`,
      )
      .run(input.toolCallId, input.taskId, input.command, input.now, input.now);
  }

  finishCommandCall(
    toolCallId: string,
    status: "SUCCEEDED" | "FAILED" | "CANCELLED" | "TIMED_OUT" | "UNKNOWN",
    result: unknown,
    now: string,
  ): void {
    this.database
      .prepare(
        `UPDATE pi_command_call SET status = ?, result_json = ?, updated_at = ?
        WHERE tool_call_id = ?`,
      )
      .run(status, JSON.stringify(result), now, toolCallId);
  }

  recoverPendingCommands(now: string): readonly PendingCommandCall[] {
    const pending = this.database
      .prepare(
        `SELECT tool_call_id, task_id, command_text FROM pi_command_call
        WHERE status = 'STARTING' ORDER BY created_at, tool_call_id`,
      )
      .all()
      .map((row) => {
        if (
          typeof row.tool_call_id !== "string" ||
          typeof row.task_id !== "string" ||
          typeof row.command_text !== "string"
        ) {
          throw new Error("Pending command call is invalid");
        }
        return {
          toolCallId: row.tool_call_id,
          taskId: row.task_id,
          command: row.command_text,
        };
      });
    this.database
      .prepare(
        `UPDATE pi_command_call SET status = 'UNKNOWN',
          result_json = '{"message":"软件关闭时命令仍在运行，结果未知，不会自动重放。"}',
          updated_at = ? WHERE status = 'STARTING'`,
      )
      .run(now);
    return pending;
  }

  hasCommandGrant(taskId: string): boolean {
    return (
      this.database
        .prepare("SELECT 1 FROM pi_command_grant WHERE task_id = ?")
        .get(taskId) !== undefined
    );
  }

  grantCommandsForTask(taskId: string, now: string): void {
    this.database
      .prepare(
        `INSERT INTO pi_command_grant (task_id, granted_at) VALUES (?, ?)
        ON CONFLICT(task_id) DO NOTHING`,
      )
      .run(taskId, now);
  }

  revokeCommandGrant(taskId: string): void {
    this.database
      .prepare("DELETE FROM pi_command_grant WHERE task_id = ?")
      .run(taskId);
  }

  private require(id: string): PiTask {
    const task = this.get(id);
    if (task === undefined) throw new Error("Pi task not found");
    return task;
  }

  private parse(row: Readonly<Record<string, unknown>>): PiTask {
    if (typeof row.id !== "string") throw new Error("Invalid Pi task id");
    const events = this.database
      .prepare(
        `SELECT sequence, kind, content, created_at FROM pi_task_event
        WHERE task_id = ? ORDER BY sequence`,
      )
      .all(row.id)
      .map((event) => ({
        sequence: event.sequence,
        kind: event.kind,
        content: event.content,
        createdAt: event.created_at,
      }));
    const checks = this.database
      .prepare(
        `SELECT command_text, status, result_json, created_at, updated_at
        FROM pi_command_call WHERE task_id = ?
        ORDER BY created_at, tool_call_id`,
      )
      .all(row.id)
      .map((check) => {
        const result = parseJsonObject(check.result_json);
        return {
          command: check.command_text,
          status: check.status,
          ...(typeof result?.exitCode === "number" || result?.exitCode === null
            ? { exitCode: result.exitCode }
            : {}),
          ...(typeof result?.durationMs === "number"
            ? { durationMs: result.durationMs }
            : {}),
          ...(typeof result?.truncated === "boolean"
            ? { truncated: result.truncated }
            : {}),
          createdAt: check.created_at,
          updatedAt: check.updated_at,
        };
      });
    return piTaskSchema.parse({
      schemaVersion: 2,
      id: row.id,
      companyId: row.company_id,
      employeeId: row.employee_id,
      ...(row.workspace_id === null ? {} : { workspaceId: row.workspace_id }),
      userInput: row.user_input,
      status: row.status,
      ...(row.final_output === null ? {} : { finalOutput: row.final_output }),
      ...(row.failure_message === null
        ? {}
        : { failureMessage: row.failure_message }),
      deliverables: this.listDeliverables(row.id),
      checks,
      events,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    });
  }
}

function parseDeliverable(
  row: Readonly<Record<string, unknown>>,
): PiTaskDeliverable {
  return {
    relativePath: String(row.relative_path),
    source: row.source as PiTaskDeliverable["source"],
    changeKind: row.change_kind as PiTaskDeliverable["changeKind"],
    sha256: String(row.sha256),
    sizeBytes: Number(row.size_bytes),
    ...(typeof row.diff_text === "string" ? { diff: row.diff_text } : {}),
    registeredAt: String(row.registered_at),
  };
}

function parseJsonObject(
  value: unknown,
): Readonly<Record<string, unknown>> | undefined {
  if (typeof value !== "string") return undefined;
  try {
    const parsed = JSON.parse(value) as unknown;
    return typeof parsed === "object" && parsed !== null
      ? (parsed as Readonly<Record<string, unknown>>)
      : undefined;
  } catch {
    // 损坏的旧命令记录仍可显示状态，不能阻塞整个任务页。
    return undefined;
  }
}
