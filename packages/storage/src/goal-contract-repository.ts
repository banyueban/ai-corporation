import { DatabaseSync } from "node:sqlite";
import {
  goalContractContentInputSchema,
  goalContractPublicSchema,
  timelineEventPublicSchema,
  timelinePagePublicSchema,
  timelineSummaryByEventType,
  type GoalContractContentInput,
  type GoalContractPublic,
  type TimelineEventPublic,
  type TimelinePagePublic,
} from "@ai-corporation/protocols";

export class GoalCorporationNotFoundError extends Error {}
export class GoalVersionConflictError extends Error {}
export class GoalStateConflictError extends Error {}
export class GoalAssumptionConfirmationError extends Error {}
export class GoalCommandConflictError extends Error {}
export class GoalDataError extends Error {}
export class TimelineCursorError extends Error {}

export type GoalFaultStage = "GOAL" | "CORPORATION" | "EVENT" | "RECEIPT";

interface GoalCommandContext {
  readonly commandId: string;
  readonly commandType: "SAVE_DRAFT" | "APPROVE";
  readonly requestHash: string;
}

interface CorporationGoalState {
  readonly activeGoalVersion: number | undefined;
  readonly id: string;
  readonly status: string;
  readonly version: number;
  readonly workspaceAccessStatus: string;
}

const timelineEventTypes = [
  "corporation.created",
  "corporation.name.updated",
  "corporation.archived",
  "goal.contract.drafted",
  "goal.contract.approved",
] as const;

export class GoalContractRepository {
  readonly #database: DatabaseSync;
  readonly #fault: ((stage: GoalFaultStage) => void) | undefined;

  constructor(
    database: DatabaseSync,
    options: { readonly fault?: (stage: GoalFaultStage) => void } = {},
  ) {
    this.#database = database;
    this.#fault = options.fault;
  }

  getCurrent(corporationId: string): GoalContractPublic | undefined {
    const corporation = this.#requiredCorporation(corporationId);
    return corporation.activeGoalVersion === undefined
      ? undefined
      : this.#requiredGoal(corporationId, corporation.activeGoalVersion);
  }

  listVersions(corporationId: string): readonly GoalContractPublic[] {
    this.#requiredCorporation(corporationId);
    return this.#database
      .prepare(
        `SELECT corporation_id, version, status, source, content_json,
          created_at, approved_at
        FROM goal_contract_version
        WHERE corporation_id = ?
        ORDER BY version DESC`,
      )
      .all(corporationId)
      .map(parseGoal);
  }

  saveDraft(input: {
    readonly command: GoalCommandContext;
    readonly corporationId: string;
    readonly expectedCorporationVersion: number;
    readonly expectedGoalVersion: number;
    readonly content: GoalContractContentInput;
    readonly now: string;
    readonly eventId: string;
  }): GoalContractPublic {
    return this.#transaction(input.command, () => {
      const corporation = this.#requiredCorporation(input.corporationId);
      this.#assertWritable(corporation, input.expectedCorporationVersion);
      const currentGoalVersion = corporation.activeGoalVersion ?? 0;
      if (currentGoalVersion !== input.expectedGoalVersion) {
        throw new GoalVersionConflictError();
      }
      const content = goalContractContentInputSchema.parse(input.content);
      const nextGoalVersion = currentGoalVersion + 1;
      const nextCorporationVersion = corporation.version + 1;

      if (currentGoalVersion > 0) {
        const update = this.#database
          .prepare(
            `UPDATE goal_contract_version
            SET status = 'SUPERSEDED', approved_at = NULL
            WHERE corporation_id = ? AND version = ?
              AND status IN ('DRAFT', 'APPROVED')`,
          )
          .run(corporation.id, currentGoalVersion);
        if (update.changes !== 1) throw new GoalVersionConflictError();
      }
      this.#database
        .prepare(
          `INSERT INTO goal_contract_version (
            corporation_id, version, status, source, content_json,
            created_by, created_at, approved_at
          ) VALUES (?, ?, 'DRAFT', ?, ?, 'local-user', ?, NULL)`,
        )
        .run(
          corporation.id,
          nextGoalVersion,
          content.source,
          JSON.stringify(content),
          input.now,
        );
      this.#fault?.("GOAL");

      const corporationUpdate = this.#database
        .prepare(
          `UPDATE corporation
          SET active_goal_version = ?, version = ?, updated_at = ?
          WHERE id = ? AND version = ? AND status = 'DRAFT'`,
        )
        .run(
          nextGoalVersion,
          nextCorporationVersion,
          input.now,
          corporation.id,
          corporation.version,
        );
      if (corporationUpdate.changes !== 1) {
        throw new GoalVersionConflictError();
      }
      this.#fault?.("CORPORATION");

      const goal = this.#requiredGoal(corporation.id, nextGoalVersion);
      this.#insertEvent({
        eventId: input.eventId,
        eventType: "goal.contract.drafted",
        corporationId: corporation.id,
        aggregateVersion: nextCorporationVersion,
        correlationId: input.command.commandId,
        occurredAt: input.now,
        payload: { goalVersion: nextGoalVersion, source: content.source },
      });
      this.#fault?.("EVENT");
      this.#insertReceipt(input.command, corporation.id, goal, input.now);
      this.#fault?.("RECEIPT");
      return goal;
    });
  }

  approve(input: {
    readonly command: GoalCommandContext;
    readonly corporationId: string;
    readonly expectedCorporationVersion: number;
    readonly goalVersion: number;
    readonly now: string;
    readonly eventId: string;
  }): GoalContractPublic {
    return this.#transaction(input.command, () => {
      const corporation = this.#requiredCorporation(input.corporationId);
      this.#assertWritable(corporation, input.expectedCorporationVersion);
      if (corporation.activeGoalVersion !== input.goalVersion) {
        throw new GoalVersionConflictError();
      }
      const goal = this.#requiredGoal(corporation.id, input.goalVersion);
      if (goal.status !== "DRAFT") throw new GoalStateConflictError();
      if (
        goal.assumptions.some(
          ({ confirmed, impact }) => impact === "HIGH" && !confirmed,
        )
      ) {
        throw new GoalAssumptionConfirmationError();
      }

      const goalUpdate = this.#database
        .prepare(
          `UPDATE goal_contract_version
          SET status = 'APPROVED', approved_at = ?
          WHERE corporation_id = ? AND version = ? AND status = 'DRAFT'`,
        )
        .run(input.now, corporation.id, input.goalVersion);
      if (goalUpdate.changes !== 1) throw new GoalVersionConflictError();
      this.#fault?.("GOAL");

      const nextCorporationVersion = corporation.version + 1;
      const corporationUpdate = this.#database
        .prepare(
          `UPDATE corporation SET version = ?, updated_at = ?
          WHERE id = ? AND version = ? AND status = 'DRAFT'
            AND active_goal_version = ?`,
        )
        .run(
          nextCorporationVersion,
          input.now,
          corporation.id,
          corporation.version,
          input.goalVersion,
        );
      if (corporationUpdate.changes !== 1) {
        throw new GoalVersionConflictError();
      }
      this.#fault?.("CORPORATION");

      const approved = this.#requiredGoal(corporation.id, input.goalVersion);
      this.#insertEvent({
        eventId: input.eventId,
        eventType: "goal.contract.approved",
        corporationId: corporation.id,
        aggregateVersion: nextCorporationVersion,
        correlationId: input.command.commandId,
        occurredAt: input.now,
        payload: { goalVersion: input.goalVersion },
      });
      this.#fault?.("EVENT");
      this.#insertReceipt(input.command, corporation.id, approved, input.now);
      this.#fault?.("RECEIPT");
      return approved;
    });
  }

  listTimeline(input: {
    readonly corporationId: string;
    readonly afterCursor?: string;
    readonly limit?: number;
  }): TimelinePagePublic {
    this.#requiredCorporation(input.corporationId);
    const after =
      input.afterCursor === undefined
        ? undefined
        : this.#decodeCursor(input.corporationId, input.afterCursor);
    const limit = input.limit ?? 50;
    const placeholders = timelineEventTypes.map(() => "?").join(", ");
    const rows = this.#database
      .prepare(
        `SELECT event_id, event_type, corporation_id, aggregate_version,
          occurred_at
        FROM domain_event
        WHERE corporation_id = ?
          AND event_type IN (${placeholders})
          AND (
            ? IS NULL
            OR occurred_at > ?
            OR (occurred_at = ? AND event_id > ?)
          )
        ORDER BY occurred_at ASC, event_id ASC
        LIMIT ?`,
      )
      .all(
        input.corporationId,
        ...timelineEventTypes,
        after?.occurredAt ?? null,
        after?.occurredAt ?? null,
        after?.occurredAt ?? null,
        after?.eventId ?? null,
        limit + 1,
      );
    const hasNext = rows.length > limit;
    const items = rows.slice(0, limit).map(parseTimelineEvent);
    const last = items.at(-1);
    return timelinePagePublicSchema.parse({
      schemaVersion: "1.0",
      items,
      ...(hasNext && last !== undefined
        ? { nextCursor: encodeCursor(last.occurredAt, last.eventId) }
        : {}),
    });
  }

  #assertWritable(
    corporation: CorporationGoalState,
    expectedCorporationVersion: number,
  ): void {
    if (corporation.version !== expectedCorporationVersion) {
      throw new GoalVersionConflictError();
    }
    if (
      corporation.status !== "DRAFT" ||
      corporation.workspaceAccessStatus !== "AVAILABLE"
    ) {
      throw new GoalStateConflictError();
    }
  }

  #requiredCorporation(corporationId: string): CorporationGoalState {
    const row = this.#database
      .prepare(
        `SELECT c.id, c.status, c.version, c.active_goal_version,
          w.access_status AS workspace_access_status
        FROM corporation c
        INNER JOIN workspace w ON w.id = c.workspace_id
        WHERE c.id = ?`,
      )
      .get(corporationId);
    if (row === undefined) throw new GoalCorporationNotFoundError();
    if (
      typeof row.id !== "string" ||
      typeof row.status !== "string" ||
      typeof row.version !== "number" ||
      typeof row.workspace_access_status !== "string" ||
      (row.active_goal_version !== null &&
        typeof row.active_goal_version !== "number")
    ) {
      throw new GoalDataError();
    }
    return {
      activeGoalVersion:
        row.active_goal_version === null ? undefined : row.active_goal_version,
      id: row.id,
      status: row.status,
      version: row.version,
      workspaceAccessStatus: row.workspace_access_status,
    };
  }

  #requiredGoal(corporationId: string, version: number): GoalContractPublic {
    const row = this.#database
      .prepare(
        `SELECT corporation_id, version, status, source, content_json,
          created_at, approved_at
        FROM goal_contract_version
        WHERE corporation_id = ? AND version = ?`,
      )
      .get(corporationId, version);
    if (row === undefined) throw new GoalDataError();
    return parseGoal(row);
  }

  #transaction(
    command: GoalCommandContext,
    operation: () => GoalContractPublic,
  ): GoalContractPublic {
    this.#database.exec("BEGIN IMMEDIATE");
    try {
      const replay = this.#readReceipt(command);
      if (replay !== undefined) {
        this.#database.exec("COMMIT");
        return replay;
      }
      const result = operation();
      this.#database.exec("COMMIT");
      return result;
    } catch (error) {
      this.#database.exec("ROLLBACK");
      throw error;
    }
  }

  #readReceipt(command: GoalCommandContext): GoalContractPublic | undefined {
    const row = this.#database
      .prepare(
        `SELECT command_type, request_hash, result_json
        FROM goal_contract_command WHERE command_id = ?`,
      )
      .get(command.commandId);
    if (row === undefined) return undefined;
    if (
      row.command_type !== command.commandType ||
      row.request_hash !== command.requestHash
    ) {
      throw new GoalCommandConflictError();
    }
    if (typeof row.result_json !== "string") throw new GoalDataError();
    try {
      return goalContractPublicSchema.parse(JSON.parse(row.result_json));
    } catch {
      throw new GoalDataError();
    }
  }

  #insertReceipt(
    command: GoalCommandContext,
    corporationId: string,
    result: GoalContractPublic,
    now: string,
  ): void {
    this.#database
      .prepare(
        `INSERT INTO goal_contract_command (
          command_id, command_type, corporation_id, request_hash,
          result_json, result_version, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        command.commandId,
        command.commandType,
        corporationId,
        command.requestHash,
        JSON.stringify(result),
        result.version,
        now,
      );
  }

  #insertEvent(event: {
    readonly eventId: string;
    readonly eventType: "goal.contract.drafted" | "goal.contract.approved";
    readonly corporationId: string;
    readonly aggregateVersion: number;
    readonly correlationId: string;
    readonly occurredAt: string;
    readonly payload: Readonly<Record<string, unknown>>;
  }): void {
    this.#database
      .prepare(
        `INSERT INTO domain_event (
          event_id, schema_version, event_type, aggregate_type, aggregate_id,
          aggregate_version, corporation_id, correlation_id, actor_json,
          payload_json, sensitivity, occurred_at
        ) VALUES (?, '1.0', ?, 'CORPORATION', ?, ?, ?, ?, ?, ?, 'NORMAL', ?)`,
      )
      .run(
        event.eventId,
        event.eventType,
        event.corporationId,
        event.aggregateVersion,
        event.corporationId,
        event.correlationId,
        JSON.stringify({ kind: "USER", id: "local-user" }),
        JSON.stringify(event.payload),
        event.occurredAt,
      );
  }

  #decodeCursor(
    corporationId: string,
    cursor: string,
  ): { readonly occurredAt: string; readonly eventId: string } {
    try {
      if (!/^[A-Za-z0-9_-]+$/u.test(cursor)) throw new Error();
      const decoded = Buffer.from(cursor, "base64url").toString("utf8");
      const value: unknown = JSON.parse(decoded);
      if (
        typeof value !== "object" ||
        value === null ||
        Object.keys(value).join(",") !== "occurredAt,eventId" ||
        !("occurredAt" in value) ||
        !("eventId" in value) ||
        typeof value.occurredAt !== "string" ||
        typeof value.eventId !== "string" ||
        encodeCursor(value.occurredAt, value.eventId) !== cursor
      ) {
        throw new Error();
      }
      const exists = this.#database
        .prepare(
          `SELECT 1 FROM domain_event
          WHERE corporation_id = ? AND occurred_at = ? AND event_id = ?
            AND event_type IN (${timelineEventTypes.map(() => "?").join(", ")})`,
        )
        .get(
          corporationId,
          value.occurredAt,
          value.eventId,
          ...timelineEventTypes,
        );
      if (exists === undefined) throw new Error();
      return { occurredAt: value.occurredAt, eventId: value.eventId };
    } catch {
      throw new TimelineCursorError();
    }
  }
}

function parseGoal(row: Record<string, unknown>): GoalContractPublic {
  if (typeof row.content_json !== "string") throw new GoalDataError();
  try {
    const content = goalContractContentInputSchema.parse(
      JSON.parse(row.content_json),
    );
    return goalContractPublicSchema.parse({
      schemaVersion: "1.0",
      corporationId: row.corporation_id,
      version: row.version,
      status: row.status,
      ...content,
      createdAt: row.created_at,
      ...(row.approved_at === null ? {} : { approvedAt: row.approved_at }),
    });
  } catch {
    throw new GoalDataError();
  }
}

function parseTimelineEvent(row: Record<string, unknown>): TimelineEventPublic {
  if (
    typeof row.event_type !== "string" ||
    !(row.event_type in timelineSummaryByEventType)
  ) {
    throw new GoalDataError();
  }
  return timelineEventPublicSchema.parse({
    schemaVersion: "1.0",
    eventId: row.event_id,
    eventType: row.event_type,
    corporationId: row.corporation_id,
    aggregateVersion: row.aggregate_version,
    occurredAt: row.occurred_at,
    summary:
      timelineSummaryByEventType[
        row.event_type as keyof typeof timelineSummaryByEventType
      ],
  });
}

function encodeCursor(occurredAt: string, eventId: string): string {
  return Buffer.from(JSON.stringify({ occurredAt, eventId }), "utf8").toString(
    "base64url",
  );
}
