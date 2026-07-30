import { DatabaseSync } from "node:sqlite";
import {
  corporationPublicSchema,
  type CorporationPausableStatus,
  type CorporationPublic,
} from "@ai-corporation/protocols";
import {
  CorporationCommandConflictError,
  CorporationDataError,
  CorporationNotFoundError,
  CorporationRepository,
  CorporationStateConflictError,
  CorporationVersionConflictError,
} from "./corporation-repository";

export type CorporationStateFaultStage = "STATE" | "EVENT" | "RECEIPT";

interface StateCommand {
  readonly commandId: string;
  readonly commandType: "PAUSE" | "RESUME";
  readonly requestHash: string;
}

const pausableStatuses = new Set<CorporationPausableStatus>([
  "DRAFT",
  "PLANNING",
  "ORGANIZING",
  "EXECUTING",
  "VERIFYING",
  "WAITING_HUMAN",
]);

export class CorporationStateRepository {
  readonly #corporations: CorporationRepository;
  readonly #database: DatabaseSync;
  readonly #fault: ((stage: CorporationStateFaultStage) => void) | undefined;

  constructor(
    database: DatabaseSync,
    options: {
      readonly fault?: (stage: CorporationStateFaultStage) => void;
    } = {},
  ) {
    this.#corporations = new CorporationRepository(database);
    this.#database = database;
    this.#fault = options.fault;
  }

  pause(input: {
    readonly command: StateCommand;
    readonly corporationId: string;
    readonly expectedVersion: number;
    readonly eventId: string;
    readonly now: string;
  }): CorporationPublic {
    return this.#transaction(input.command, () => {
      const current = this.#required(input.corporationId);
      this.#assertVersionAndWorkspace(current, input.expectedVersion);
      if (!pausableStatuses.has(current.status as CorporationPausableStatus)) {
        throw new CorporationStateConflictError();
      }
      const nextVersion = current.version + 1;
      const result = this.#database
        .prepare(
          `UPDATE corporation
          SET status = 'PAUSED', paused_from = ?, paused_at = ?,
            version = ?, updated_at = ?
          WHERE id = ? AND version = ? AND status = ?
            AND EXISTS (
              SELECT 1 FROM workspace
              WHERE workspace.id = corporation.workspace_id
                AND workspace.access_status = 'AVAILABLE'
            )`,
        )
        .run(
          current.status,
          input.now,
          nextVersion,
          input.now,
          current.id,
          current.version,
          current.status,
        );
      if (result.changes !== 1) throw new CorporationVersionConflictError();
      this.#fault?.("STATE");
      const updated = this.#required(current.id);
      this.#insertEvent({
        eventId: input.eventId,
        eventType: "corporation.paused",
        corporationId: current.id,
        aggregateVersion: nextVersion,
        correlationId: input.command.commandId,
        occurredAt: input.now,
        payload: { previousStatus: current.status, reason: "USER" },
      });
      this.#fault?.("EVENT");
      this.#insertReceipt(input.command, updated);
      this.#fault?.("RECEIPT");
      return updated;
    });
  }

  resume(input: {
    readonly command: StateCommand;
    readonly corporationId: string;
    readonly expectedVersion: number;
    readonly eventId: string;
    readonly now: string;
  }): CorporationPublic {
    return this.#transaction(input.command, () => {
      const current = this.#required(input.corporationId);
      this.#assertVersionAndWorkspace(current, input.expectedVersion);
      if (
        current.status !== "PAUSED" ||
        current.pausedFrom === undefined ||
        current.pausedAt === undefined
      ) {
        throw new CorporationStateConflictError();
      }
      const nextVersion = current.version + 1;
      const targetStatus = current.pausedFrom;
      const result = this.#database
        .prepare(
          `UPDATE corporation
          SET status = ?, paused_from = NULL, paused_at = NULL,
            version = ?, updated_at = ?
          WHERE id = ? AND version = ? AND status = 'PAUSED'
            AND paused_from = ? AND paused_at IS NOT NULL
            AND EXISTS (
              SELECT 1 FROM workspace
              WHERE workspace.id = corporation.workspace_id
                AND workspace.access_status = 'AVAILABLE'
            )`,
        )
        .run(
          targetStatus,
          nextVersion,
          input.now,
          current.id,
          current.version,
          targetStatus,
        );
      if (result.changes !== 1) throw new CorporationVersionConflictError();
      this.#fault?.("STATE");
      const updated = this.#required(current.id);
      this.#insertEvent({
        eventId: input.eventId,
        eventType: "corporation.resumed",
        corporationId: current.id,
        aggregateVersion: nextVersion,
        correlationId: input.command.commandId,
        occurredAt: input.now,
        payload: { previousStatus: "PAUSED", targetStatus },
      });
      this.#fault?.("EVENT");
      this.#insertReceipt(input.command, updated);
      this.#fault?.("RECEIPT");
      return updated;
    });
  }

  #assertVersionAndWorkspace(
    corporation: CorporationPublic,
    expectedVersion: number,
  ): void {
    if (corporation.version !== expectedVersion) {
      throw new CorporationVersionConflictError();
    }
    const workspace = this.#database
      .prepare("SELECT access_status FROM workspace WHERE id = ?")
      .get(corporation.workspaceId);
    if (workspace?.access_status !== "AVAILABLE") {
      throw new CorporationStateConflictError();
    }
  }

  #required(corporationId: string): CorporationPublic {
    const corporation = this.#corporations.get(corporationId);
    if (corporation === undefined) throw new CorporationNotFoundError();
    return corporation;
  }

  #transaction(
    command: StateCommand,
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

  #readReceipt(command: StateCommand): CorporationPublic | undefined {
    const row = this.#database
      .prepare(
        `SELECT command_type, request_hash, result_json
        FROM corporation_state_command WHERE command_id = ?`,
      )
      .get(command.commandId);
    if (row === undefined) return undefined;
    if (
      row.command_type !== command.commandType ||
      row.request_hash !== command.requestHash
    ) {
      throw new CorporationCommandConflictError();
    }
    if (typeof row.result_json !== "string") throw new CorporationDataError();
    try {
      return corporationPublicSchema.parse(JSON.parse(row.result_json));
    } catch {
      throw new CorporationDataError();
    }
  }

  #insertReceipt(command: StateCommand, result: CorporationPublic): void {
    this.#database
      .prepare(
        `INSERT INTO corporation_state_command (
          command_id, command_type, corporation_id, request_hash,
          result_json, result_version, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        command.commandId,
        command.commandType,
        result.id,
        command.requestHash,
        JSON.stringify(result),
        result.version,
        result.updatedAt,
      );
  }

  #insertEvent(event: {
    readonly eventId: string;
    readonly eventType: "corporation.paused" | "corporation.resumed";
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
}
