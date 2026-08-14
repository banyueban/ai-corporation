import { DatabaseSync } from "node:sqlite";
import { piTaskSchema, type PiTask } from "@ai-corporation/protocols";

export type PiTaskStatus = PiTask["status"];

/** Stores every visible model and tool event in the same order it occurred. */
export class PiTaskRepository {
  constructor(private readonly database: DatabaseSync) {}

  create(input: {
    readonly id: string;
    readonly employeeId: string;
    readonly userInput: string;
    readonly now: string;
  }): PiTask {
    this.database
      .prepare(
        `INSERT INTO pi_task (
          id, employee_id, user_input, status, created_at, updated_at
        ) VALUES (?, ?, ?, 'RUNNING', ?, ?)`,
      )
      .run(input.id, input.employeeId, input.userInput, input.now, input.now);
    return this.require(input.id);
  }

  get(id: string): PiTask | undefined {
    const row = this.database
      .prepare("SELECT * FROM pi_task WHERE id = ?")
      .get(id);
    return row === undefined ? undefined : this.parse(row);
  }

  getLatest(employeeId: string): PiTask | undefined {
    const row = this.database
      .prepare(
        `SELECT * FROM pi_task WHERE employee_id = ?
        ORDER BY updated_at DESC, id DESC LIMIT 1`,
      )
      .get(employeeId);
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
        `UPDATE pi_task SET status = 'INTERRUPTED',
          failure_message = '软件上次关闭时任务仍在运行，没有自动重复调用模型。',
          updated_at = ? WHERE status = 'RUNNING'`,
      )
      .run(now);
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
    return piTaskSchema.parse({
      schemaVersion: 1,
      id: row.id,
      employeeId: row.employee_id,
      userInput: row.user_input,
      status: row.status,
      ...(row.final_output === null ? {} : { finalOutput: row.final_output }),
      ...(row.failure_message === null
        ? {}
        : { failureMessage: row.failure_message }),
      events,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    });
  }
}
