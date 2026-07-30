import { DatabaseSync } from "node:sqlite";
import {
  corporationPublicSchema,
  type CorporationPublic,
  type CorporationStatus,
} from "@ai-corporation/protocols";

export class CorporationNotFoundError extends Error {}
export class CorporationVersionConflictError extends Error {}
export class CorporationStateConflictError extends Error {}
export class CorporationCommandConflictError extends Error {}
export class CorporationDataError extends Error {}

export type CorporationFaultStage = "STATE" | "EVENT" | "RECEIPT";

interface CommandContext {
  readonly commandId: string;
  readonly commandType: "CREATE" | "UPDATE_NAME" | "ARCHIVE";
  readonly requestHash: string;
}

interface EventRecord {
  readonly eventId: string;
  readonly eventType:
    "corporation.created" | "corporation.name.updated" | "corporation.archived";
  readonly corporationId: string;
  readonly aggregateVersion: number;
  readonly occurredAt: string;
  readonly payload: Readonly<Record<string, unknown>>;
}

export class CorporationRepository {
  readonly #database: DatabaseSync;
  readonly #fault: ((stage: CorporationFaultStage) => void) | undefined;

  constructor(
    database: DatabaseSync,
    options: {
      readonly fault?: (stage: CorporationFaultStage) => void;
    } = {},
  ) {
    this.#database = database;
    this.#fault = options.fault;
  }

  get(corporationId: string): CorporationPublic | undefined {
    const row = this.#database
      .prepare(
        `SELECT id, workspace_id, name, status, version, created_at,
          updated_at, archived_at
        FROM corporation WHERE id = ?`,
      )
      .get(corporationId);
    return row === undefined ? undefined : parseCorporation(row);
  }

  list(
    workspaceId: string,
    includeArchived: boolean,
  ): readonly CorporationPublic[] {
    return this.#database
      .prepare(
        `SELECT id, workspace_id, name, status, version, created_at,
          updated_at, archived_at
        FROM corporation
        WHERE workspace_id = ? AND (? = 1 OR status <> 'ARCHIVED')
        ORDER BY updated_at DESC, id ASC`,
      )
      .all(workspaceId, includeArchived ? 1 : 0)
      .map(parseCorporation);
  }

  create(input: {
    readonly command: CommandContext;
    readonly corporation: CorporationPublic;
    readonly event: EventRecord;
  }): CorporationPublic {
    return this.#transaction(input.command, () => {
      const corporation = corporationPublicSchema.parse(input.corporation);
      this.#database
        .prepare(
          `INSERT INTO corporation (
            id, workspace_id, name, status, version, created_at, updated_at,
            archived_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          corporation.id,
          corporation.workspaceId,
          corporation.name,
          corporation.status,
          corporation.version,
          corporation.createdAt,
          corporation.updatedAt,
          corporation.archivedAt ?? null,
        );
      this.#fault?.("STATE");
      this.#insertEvent(input.event, input.command.commandId);
      this.#fault?.("EVENT");
      this.#insertReceipt(input.command, corporation);
      this.#fault?.("RECEIPT");
      return corporation;
    });
  }

  updateName(input: {
    readonly command: CommandContext;
    readonly corporationId: string;
    readonly expectedVersion: number;
    readonly name: string;
    readonly now: string;
    readonly eventId: string;
  }): CorporationPublic {
    return this.#transaction(input.command, () => {
      const current = this.#required(input.corporationId);
      if (current.version !== input.expectedVersion) {
        throw new CorporationVersionConflictError();
      }
      if (current.status === "ARCHIVED") {
        throw new CorporationStateConflictError();
      }
      const nextVersion = current.version + 1;
      const result = this.#database
        .prepare(
          `UPDATE corporation SET name = ?, version = ?, updated_at = ?
          WHERE id = ? AND version = ? AND status <> 'ARCHIVED'`,
        )
        .run(input.name, nextVersion, input.now, current.id, current.version);
      if (result.changes !== 1) {
        throw new CorporationVersionConflictError();
      }
      this.#fault?.("STATE");
      const updated = this.#required(current.id);
      this.#insertEvent(
        {
          eventId: input.eventId,
          eventType: "corporation.name.updated",
          corporationId: current.id,
          aggregateVersion: nextVersion,
          occurredAt: input.now,
          payload: { previousName: current.name, name: input.name },
        },
        input.command.commandId,
      );
      this.#fault?.("EVENT");
      this.#insertReceipt(input.command, updated);
      this.#fault?.("RECEIPT");
      return updated;
    });
  }

  archive(input: {
    readonly command: CommandContext;
    readonly corporationId: string;
    readonly expectedVersion: number;
    readonly now: string;
    readonly eventId: string;
  }): CorporationPublic {
    return this.#transaction(input.command, () => {
      const current = this.#required(input.corporationId);
      if (current.version !== input.expectedVersion) {
        throw new CorporationVersionConflictError();
      }
      if (!isArchivable(current.status)) {
        throw new CorporationStateConflictError();
      }
      const nextVersion = current.version + 1;
      const result = this.#database
        .prepare(
          `UPDATE corporation
          SET status = 'ARCHIVED', version = ?, updated_at = ?, archived_at = ?
          WHERE id = ? AND version = ? AND status IN (
            'COMPLETED', 'FAILED', 'CANCELLED'
          )`,
        )
        .run(nextVersion, input.now, input.now, current.id, current.version);
      if (result.changes !== 1) {
        throw new CorporationVersionConflictError();
      }
      this.#fault?.("STATE");
      const updated = this.#required(current.id);
      this.#insertEvent(
        {
          eventId: input.eventId,
          eventType: "corporation.archived",
          corporationId: current.id,
          aggregateVersion: nextVersion,
          occurredAt: input.now,
          payload: {
            previousStatus: current.status,
            archivedAt: input.now,
          },
        },
        input.command.commandId,
      );
      this.#fault?.("EVENT");
      this.#insertReceipt(input.command, updated);
      this.#fault?.("RECEIPT");
      return updated;
    });
  }

  #required(corporationId: string): CorporationPublic {
    const corporation = this.get(corporationId);
    if (corporation === undefined) {
      throw new CorporationNotFoundError();
    }
    return corporation;
  }

  #transaction(
    command: CommandContext,
    operation: () => CorporationPublic,
  ): CorporationPublic {
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

  #readReceipt(command: CommandContext): CorporationPublic | undefined {
    const row = this.#database
      .prepare(
        `SELECT command_type, request_hash, result_json
        FROM corporation_command WHERE command_id = ?`,
      )
      .get(command.commandId);
    if (row === undefined) {
      return undefined;
    }
    if (
      row.command_type !== command.commandType ||
      row.request_hash !== command.requestHash
    ) {
      throw new CorporationCommandConflictError();
    }
    if (typeof row.result_json !== "string") {
      throw new CorporationDataError();
    }
    try {
      return corporationPublicSchema.parse(JSON.parse(row.result_json));
    } catch {
      throw new CorporationDataError();
    }
  }

  #insertReceipt(command: CommandContext, result: CorporationPublic): void {
    this.#database
      .prepare(
        `INSERT INTO corporation_command (
          command_id, command_type, request_hash, result_json,
          result_version, created_at
        ) VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(
        command.commandId,
        command.commandType,
        command.requestHash,
        JSON.stringify(result),
        result.version,
        result.updatedAt,
      );
  }

  #insertEvent(event: EventRecord, correlationId: string): void {
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
        correlationId,
        JSON.stringify({ kind: "USER", id: "local-user" }),
        JSON.stringify(event.payload),
        event.occurredAt,
      );
  }
}

function parseCorporation(row: Record<string, unknown>): CorporationPublic {
  const parsed = corporationPublicSchema.safeParse({
    schemaVersion: "1.0",
    id: row.id,
    workspaceId: row.workspace_id,
    name: row.name,
    status: row.status,
    version: row.version,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    ...(row.archived_at === null ? {} : { archivedAt: row.archived_at }),
  });
  if (!parsed.success) {
    throw new CorporationDataError();
  }
  return parsed.data;
}

function isArchivable(status: CorporationStatus): boolean {
  return ["COMPLETED", "FAILED", "CANCELLED"].includes(status);
}
