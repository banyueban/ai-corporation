import { DatabaseSync } from "node:sqlite";
import {
  providerCompletedConnectionTestSnapshotSchema,
  providerCompletedGenerationTestSnapshotSchema,
  providerPublicSchema,
  type ProviderConnectionTestSnapshot,
  type ProviderConfigStatus,
  type ProviderGenerationTestSnapshot,
  type ProviderPublic,
} from "@ai-corporation/protocols";

export class ProviderNotFoundError extends Error {
  constructor() {
    super("Provider not found");
    this.name = "ProviderNotFoundError";
  }
}

export class ProviderVersionConflictError extends Error {
  constructor() {
    super("Provider version conflict");
    this.name = "ProviderVersionConflictError";
  }
}

export class ProviderCommandConflictError extends Error {
  constructor() {
    super("Provider command conflict");
    this.name = "ProviderCommandConflictError";
  }
}

export class ProviderDataError extends Error {
  constructor() {
    super("Provider data is invalid");
    this.name = "ProviderDataError";
  }
}

export class ProviderConnectionTestDataError extends Error {
  constructor() {
    super("Provider connection test data is invalid");
    this.name = "ProviderConnectionTestDataError";
  }
}

export class ProviderGenerationTestDataError extends Error {
  constructor() {
    super("Provider generation test data is invalid");
    this.name = "ProviderGenerationTestDataError";
  }
}

export class ProviderModelSelectionError extends Error {
  constructor() {
    super("Provider model selection is invalid");
    this.name = "ProviderModelSelectionError";
  }
}

export interface EncryptedProviderKey {
  readonly authTag: Uint8Array;
  readonly ciphertext: Uint8Array;
  readonly encryptionVersion: 1;
  readonly nonce: Uint8Array;
}

interface ProviderCommand {
  readonly commandId: string;
  readonly requestHash: string;
  readonly commandType: "SAVE" | "DELETE_KEY";
}

export type ProviderFaultStage =
  "AFTER_VAULT_WRITE" | "AFTER_PROVIDER_WRITE" | "BEFORE_COMMIT";

export class ProviderRepository {
  readonly #database: DatabaseSync;
  readonly #fault: ((stage: ProviderFaultStage) => void) | undefined;

  constructor(
    database: DatabaseSync,
    options: { readonly fault?: (stage: ProviderFaultStage) => void } = {},
  ) {
    this.#database = database;
    this.#fault = options.fault;
  }

  list(): readonly ProviderPublic[] {
    return this.#database
      .prepare(
        `SELECT p.id, p.type, p.name, p.endpoint, p.api_dialect,
          p.selected_model_id, p.generation_timeout_ms, p.key_vault_entry_id,
          p.config_status, p.version, p.created_at, p.updated_at,
          t.status AS test_status, t.failure_reason, t.retryable,
          t.suggested_backoff_ms, t.models_json, t.tested_at,
          g.status AS generation_status, g.model_id AS generation_model_id,
          g.failure_reason AS generation_failure_reason,
          g.retryable AS generation_retryable,
          g.suggested_backoff_ms AS generation_backoff_ms,
          g.stop_reason, g.output_preview, g.usage_json, g.completed_at
        FROM provider p
        LEFT JOIN provider_connection_test t
          ON t.provider_id = p.id AND t.provider_version = p.version
        LEFT JOIN provider_generation_test g
          ON g.provider_id = p.id AND g.provider_version = p.version
        ORDER BY p.created_at, p.id`,
      )
      .all()
      .map(parseProviderRow);
  }

  get(providerId: string): ProviderPublic | undefined {
    const row = this.#database
      .prepare(
        `SELECT p.id, p.type, p.name, p.endpoint, p.api_dialect,
          p.selected_model_id, p.generation_timeout_ms, p.key_vault_entry_id,
          p.config_status, p.version, p.created_at, p.updated_at,
          t.status AS test_status, t.failure_reason, t.retryable,
          t.suggested_backoff_ms, t.models_json, t.tested_at,
          g.status AS generation_status, g.model_id AS generation_model_id,
          g.failure_reason AS generation_failure_reason,
          g.retryable AS generation_retryable,
          g.suggested_backoff_ms AS generation_backoff_ms,
          g.stop_reason, g.output_preview, g.usage_json, g.completed_at
        FROM provider p
        LEFT JOIN provider_connection_test t
          ON t.provider_id = p.id AND t.provider_version = p.version
        LEFT JOIN provider_generation_test g
          ON g.provider_id = p.id AND g.provider_version = p.version
        WHERE p.id = ?`,
      )
      .get(providerId);
    return row === undefined ? undefined : parseProviderRow(row);
  }

  hasVaultEntries(): boolean {
    const row = this.#database
      .prepare("SELECT EXISTS(SELECT 1 FROM key_vault_entry) AS present")
      .get();
    return row?.present === 1;
  }

  getEncryptedKey(providerId: string): {
    readonly entryId: string;
    readonly encrypted: EncryptedProviderKey;
  } {
    const row = this.#database
      .prepare(
        `SELECT k.id, k.ciphertext, k.nonce, k.auth_tag, k.encryption_version
        FROM provider p
        JOIN key_vault_entry k ON k.id = p.key_vault_entry_id
        WHERE p.id = ?`,
      )
      .get(providerId);
    if (row === undefined) throw new ProviderNotFoundError();
    if (
      typeof row.id !== "string" ||
      !(row.ciphertext instanceof Uint8Array) ||
      !(row.nonce instanceof Uint8Array) ||
      !(row.auth_tag instanceof Uint8Array) ||
      row.encryption_version !== 1
    ) {
      throw new ProviderDataError();
    }
    return {
      entryId: row.id,
      encrypted: {
        ciphertext: row.ciphertext,
        nonce: row.nonce,
        authTag: row.auth_tag,
        encryptionVersion: 1,
      },
    };
  }

  save(input: {
    readonly command: ProviderCommand & { readonly commandType: "SAVE" };
    readonly providerId: string;
    readonly vaultEntryId?: string;
    readonly encrypted?: EncryptedProviderKey;
    readonly expectedVersion?: number;
    readonly name: string;
    readonly endpoint: string;
    readonly configStatus: ProviderConfigStatus;
    readonly apiDialect?: "CHAT_COMPLETIONS";
    readonly selectedModelId?: string | null;
    readonly generationTimeoutMs?: number;
    readonly now: string;
  }): ProviderPublic {
    const replay = this.#readCommand(input.command);
    if (replay !== undefined) return replay;

    this.#database.exec("BEGIN IMMEDIATE");
    try {
      const transactionalReplay = this.#readCommand(input.command);
      if (transactionalReplay !== undefined) {
        this.#database.exec("COMMIT");
        return transactionalReplay;
      }
      const existing = this.get(input.providerId);
      let vaultEntryId: string | undefined;
      if (input.expectedVersion === undefined) {
        if (existing !== undefined || input.encrypted === undefined) {
          throw new ProviderVersionConflictError();
        }
        vaultEntryId = input.vaultEntryId;
        if (vaultEntryId === undefined) throw new ProviderDataError();
        this.#insertVault(vaultEntryId, input.encrypted, input.now);
        this.#fault?.("AFTER_VAULT_WRITE");
        this.#database
          .prepare(
            `INSERT INTO provider (
              id, type, name, endpoint, api_dialect, selected_model_id,
              generation_timeout_ms, key_vault_entry_id, config_json,
              config_status, version, created_at, updated_at
            ) VALUES (?, 'OPENAI_COMPATIBLE', ?, ?, ?, NULL, ?, ?, '{}', ?, 1, ?, ?)`,
          )
          .run(
            input.providerId,
            input.name,
            input.endpoint,
            input.apiDialect ?? "CHAT_COMPLETIONS",
            input.generationTimeoutMs ?? 60_000,
            vaultEntryId,
            input.configStatus,
            input.now,
            input.now,
          );
      } else {
        if (existing === undefined) throw new ProviderNotFoundError();
        if (existing.version !== input.expectedVersion) {
          throw new ProviderVersionConflictError();
        }
        vaultEntryId = this.#vaultEntryId(input.providerId);
        if (input.encrypted !== undefined) {
          if (vaultEntryId === undefined) {
            vaultEntryId = input.vaultEntryId;
            if (vaultEntryId === undefined) throw new ProviderDataError();
            this.#insertVault(vaultEntryId, input.encrypted, input.now);
          } else {
            this.#database
              .prepare(
                `UPDATE key_vault_entry
                SET ciphertext = ?, nonce = ?, auth_tag = ?,
                  encryption_version = 1, version = version + 1, updated_at = ?
                WHERE id = ?`,
              )
              .run(
                input.encrypted.ciphertext,
                input.encrypted.nonce,
                input.encrypted.authTag,
                input.now,
                vaultEntryId,
              );
          }
          this.#fault?.("AFTER_VAULT_WRITE");
        }
        const endpointOrKeyChanged =
          existing.endpoint !== input.endpoint || input.encrypted !== undefined;
        const selectedModelId = endpointOrKeyChanged
          ? undefined
          : input.selectedModelId === undefined
            ? existing.selectedModelId
            : (input.selectedModelId ?? undefined);
        if (
          selectedModelId !== undefined &&
          (existing.connectionTest?.status !== "VERIFIED" ||
            !existing.connectionTest.models.some(
              ({ id }) => id === selectedModelId,
            ))
        ) {
          throw new ProviderModelSelectionError();
        }
        const generationTimeoutMs =
          input.generationTimeoutMs ?? existing.generationTimeoutMs ?? 60_000;
        const modelChanged = selectedModelId !== existing.selectedModelId;
        const timeoutChanged =
          generationTimeoutMs !== (existing.generationTimeoutMs ?? 60_000);
        const result = this.#database
          .prepare(
            `UPDATE provider
            SET name = ?, endpoint = ?, api_dialect = ?, selected_model_id = ?,
              generation_timeout_ms = ?, config_status = ?,
              key_vault_entry_id = ?, version = version + 1, updated_at = ?
            WHERE id = ? AND version = ?`,
          )
          .run(
            input.name,
            input.endpoint,
            input.apiDialect ?? existing.apiDialect ?? "CHAT_COMPLETIONS",
            selectedModelId ?? null,
            generationTimeoutMs,
            input.configStatus,
            vaultEntryId ?? null,
            input.now,
            input.providerId,
            input.expectedVersion,
          );
        if (result.changes !== 1) throw new ProviderVersionConflictError();
        if (endpointOrKeyChanged) {
          this.#database
            .prepare(
              "DELETE FROM provider_connection_test WHERE provider_id = ?",
            )
            .run(input.providerId);
          this.#database
            .prepare(
              "DELETE FROM provider_generation_test WHERE provider_id = ?",
            )
            .run(input.providerId);
        } else {
          this.#database
            .prepare(
              `UPDATE provider_connection_test
              SET provider_version = ?
              WHERE provider_id = ? AND provider_version = ?`,
            )
            .run(existing.version + 1, input.providerId, existing.version);
          if (modelChanged || timeoutChanged) {
            this.#database
              .prepare(
                "DELETE FROM provider_generation_test WHERE provider_id = ?",
              )
              .run(input.providerId);
          } else {
            this.#database
              .prepare(
                `UPDATE provider_generation_test
                SET provider_version = ?
                WHERE provider_id = ? AND provider_version = ?`,
              )
              .run(existing.version + 1, input.providerId, existing.version);
          }
        }
      }
      this.#fault?.("AFTER_PROVIDER_WRITE");
      const saved = this.get(input.providerId);
      if (saved === undefined) throw new ProviderDataError();
      this.#insertCommand(input.command, input.providerId, saved, input.now);
      this.#fault?.("BEFORE_COMMIT");
      this.#database.exec("COMMIT");
      return saved;
    } catch (error) {
      this.#database.exec("ROLLBACK");
      throw error;
    }
  }

  deleteKey(input: {
    readonly command: ProviderCommand & { readonly commandType: "DELETE_KEY" };
    readonly providerId: string;
    readonly expectedVersion: number;
    readonly now: string;
  }): ProviderPublic {
    const replay = this.#readCommand(input.command);
    if (replay !== undefined) return replay;

    this.#database.exec("BEGIN IMMEDIATE");
    try {
      const transactionalReplay = this.#readCommand(input.command);
      if (transactionalReplay !== undefined) {
        this.#database.exec("COMMIT");
        return transactionalReplay;
      }
      const existing = this.get(input.providerId);
      if (existing === undefined) throw new ProviderNotFoundError();
      if (existing.version !== input.expectedVersion) {
        throw new ProviderVersionConflictError();
      }
      const vaultEntryId = this.#vaultEntryId(input.providerId);
      const result = this.#database
        .prepare(
          `UPDATE provider
          SET key_vault_entry_id = NULL, selected_model_id = NULL,
            version = version + 1, updated_at = ?
          WHERE id = ? AND version = ?`,
        )
        .run(input.now, input.providerId, input.expectedVersion);
      if (result.changes !== 1) throw new ProviderVersionConflictError();
      this.#database
        .prepare("DELETE FROM provider_connection_test WHERE provider_id = ?")
        .run(input.providerId);
      this.#database
        .prepare("DELETE FROM provider_generation_test WHERE provider_id = ?")
        .run(input.providerId);
      this.#fault?.("AFTER_PROVIDER_WRITE");
      if (vaultEntryId !== undefined) {
        this.#database
          .prepare("DELETE FROM key_vault_entry WHERE id = ?")
          .run(vaultEntryId);
        this.#fault?.("AFTER_VAULT_WRITE");
      }
      const saved = this.get(input.providerId);
      if (saved === undefined) throw new ProviderDataError();
      this.#insertCommand(input.command, input.providerId, saved, input.now);
      this.#fault?.("BEFORE_COMMIT");
      this.#database.exec("COMMIT");
      return saved;
    } catch (error) {
      this.#database.exec("ROLLBACK");
      throw error;
    }
  }

  saveConnectionTest(input: {
    readonly providerId: string;
    readonly expectedVersion: number;
    readonly snapshot: Exclude<
      ProviderConnectionTestSnapshot,
      { readonly status: "UNVERIFIED" }
    >;
  }): Exclude<
    ProviderConnectionTestSnapshot,
    { readonly status: "UNVERIFIED" }
  > {
    const snapshot = providerCompletedConnectionTestSnapshotSchema.parse(
      input.snapshot,
    );
    if (snapshot.providerVersion !== input.expectedVersion) {
      throw new ProviderVersionConflictError();
    }
    this.#database.exec("BEGIN IMMEDIATE");
    try {
      const provider = this.get(input.providerId);
      if (provider === undefined) throw new ProviderNotFoundError();
      if (provider.version !== input.expectedVersion) {
        throw new ProviderVersionConflictError();
      }
      const failed = snapshot.status === "FAILED";
      this.#database
        .prepare(
          `INSERT INTO provider_connection_test (
            provider_id, provider_version, status, failure_reason, retryable,
            suggested_backoff_ms, models_json, tested_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(provider_id) DO UPDATE SET
            provider_version = excluded.provider_version,
            status = excluded.status,
            failure_reason = excluded.failure_reason,
            retryable = excluded.retryable,
            suggested_backoff_ms = excluded.suggested_backoff_ms,
            models_json = excluded.models_json,
            tested_at = excluded.tested_at`,
        )
        .run(
          input.providerId,
          input.expectedVersion,
          snapshot.status,
          failed ? snapshot.failure.reason : null,
          failed ? (snapshot.failure.retryable ? 1 : 0) : null,
          failed ? (snapshot.failure.suggestedBackoffMs ?? null) : null,
          JSON.stringify(snapshot.models),
          snapshot.testedAt,
        );
      this.#database.exec("COMMIT");
      return snapshot;
    } catch (error) {
      this.#database.exec("ROLLBACK");
      throw error;
    }
  }

  saveGenerationTest(input: {
    readonly providerId: string;
    readonly expectedVersion: number;
    readonly snapshot: Exclude<
      ProviderGenerationTestSnapshot,
      { readonly status: "IDLE" }
    >;
  }): Exclude<ProviderGenerationTestSnapshot, { readonly status: "IDLE" }> {
    const snapshot = providerCompletedGenerationTestSnapshotSchema.parse(
      input.snapshot,
    );
    if (snapshot.providerVersion !== input.expectedVersion) {
      throw new ProviderVersionConflictError();
    }
    this.#database.exec("BEGIN IMMEDIATE");
    try {
      const provider = this.get(input.providerId);
      if (provider === undefined) throw new ProviderNotFoundError();
      if (
        provider.version !== input.expectedVersion ||
        provider.selectedModelId !== snapshot.modelId
      ) {
        throw new ProviderVersionConflictError();
      }
      const failed = snapshot.status === "FAILED";
      this.#database
        .prepare(
          `INSERT INTO provider_generation_test (
            provider_id, provider_version, model_id, status, failure_reason,
            retryable, suggested_backoff_ms, stop_reason, output_preview,
            usage_json, completed_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(provider_id) DO UPDATE SET
            provider_version = excluded.provider_version,
            model_id = excluded.model_id,
            status = excluded.status,
            failure_reason = excluded.failure_reason,
            retryable = excluded.retryable,
            suggested_backoff_ms = excluded.suggested_backoff_ms,
            stop_reason = excluded.stop_reason,
            output_preview = excluded.output_preview,
            usage_json = excluded.usage_json,
            completed_at = excluded.completed_at`,
        )
        .run(
          input.providerId,
          input.expectedVersion,
          snapshot.modelId,
          snapshot.status,
          failed ? snapshot.failure.reason : null,
          failed ? (snapshot.failure.retryable ? 1 : 0) : null,
          failed ? (snapshot.failure.suggestedBackoffMs ?? null) : null,
          failed ? null : snapshot.stopReason,
          failed ? null : snapshot.outputPreview,
          JSON.stringify(failed ? { costSource: "UNKNOWN" } : snapshot.usage),
          snapshot.completedAt,
        );
      this.#database.exec("COMMIT");
      return snapshot;
    } catch (error) {
      this.#database.exec("ROLLBACK");
      throw error;
    }
  }

  #insertVault(id: string, encrypted: EncryptedProviderKey, now: string): void {
    this.#database
      .prepare(
        `INSERT INTO key_vault_entry (
          id, ciphertext, nonce, auth_tag, encryption_version,
          version, created_at, updated_at
        ) VALUES (?, ?, ?, ?, 1, 1, ?, ?)`,
      )
      .run(
        id,
        encrypted.ciphertext,
        encrypted.nonce,
        encrypted.authTag,
        now,
        now,
      );
  }

  #vaultEntryId(providerId: string): string | undefined {
    const row = this.#database
      .prepare("SELECT key_vault_entry_id FROM provider WHERE id = ?")
      .get(providerId);
    if (row === undefined) throw new ProviderNotFoundError();
    if (row.key_vault_entry_id === null) return undefined;
    if (typeof row.key_vault_entry_id !== "string") {
      throw new ProviderDataError();
    }
    return row.key_vault_entry_id;
  }

  #readCommand(command: ProviderCommand): ProviderPublic | undefined {
    const row = this.#database
      .prepare(
        `SELECT command_type, request_hash, result_json
        FROM provider_command WHERE command_id = ?`,
      )
      .get(command.commandId);
    if (row === undefined) return undefined;
    if (
      row.command_type !== command.commandType ||
      row.request_hash !== command.requestHash
    ) {
      throw new ProviderCommandConflictError();
    }
    if (typeof row.result_json !== "string") throw new ProviderDataError();
    try {
      return providerPublicSchema.parse(JSON.parse(row.result_json));
    } catch {
      throw new ProviderDataError();
    }
  }

  #insertCommand(
    command: ProviderCommand,
    providerId: string,
    result: ProviderPublic,
    now: string,
  ): void {
    this.#database
      .prepare(
        `INSERT INTO provider_command (
          command_id, command_type, provider_id, request_hash,
          result_json, result_version, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        command.commandId,
        command.commandType,
        providerId,
        command.requestHash,
        JSON.stringify(result),
        result.version,
        now,
      );
  }
}

function parseProviderRow(row: Record<string, unknown>): ProviderPublic {
  const connectionTest = parseConnectionTest(row);
  const generationTest = parseGenerationTest(row);
  const parsed = providerPublicSchema.safeParse({
    schemaVersion: 1,
    id: row.id,
    type: row.type,
    name: row.name,
    endpoint: row.endpoint,
    apiDialect: row.api_dialect,
    ...(typeof row.selected_model_id === "string"
      ? { selectedModelId: row.selected_model_id }
      : {}),
    generationTimeoutMs: row.generation_timeout_ms,
    configStatus: row.config_status,
    hasKey: typeof row.key_vault_entry_id === "string",
    version: row.version,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    connectionTest,
    generationTest,
  });
  if (!parsed.success) throw new ProviderDataError();
  return parsed.data;
}

function parseGenerationTest(
  row: Record<string, unknown>,
): ProviderGenerationTestSnapshot {
  if (row.generation_status === null || row.generation_status === undefined) {
    return { status: "IDLE" };
  }
  if (
    typeof row.generation_model_id !== "string" ||
    typeof row.completed_at !== "string" ||
    typeof row.version !== "number" ||
    typeof row.usage_json !== "string"
  ) {
    throw new ProviderGenerationTestDataError();
  }
  let usage: unknown;
  try {
    usage = JSON.parse(row.usage_json);
  } catch {
    throw new ProviderGenerationTestDataError();
  }
  const candidate =
    row.generation_status === "SUCCEEDED"
      ? {
          status: "SUCCEEDED",
          providerVersion: row.version,
          modelId: row.generation_model_id,
          outputPreview: row.output_preview,
          stopReason: row.stop_reason,
          usage,
          completedAt: row.completed_at,
        }
      : {
          status: row.generation_status,
          providerVersion: row.version,
          modelId: row.generation_model_id,
          failure: {
            reason: row.generation_failure_reason,
            retryable: row.generation_retryable === 1,
            ...(typeof row.generation_backoff_ms === "number"
              ? { suggestedBackoffMs: row.generation_backoff_ms }
              : {}),
          },
          completedAt: row.completed_at,
        };
  const parsed =
    providerCompletedGenerationTestSnapshotSchema.safeParse(candidate);
  if (!parsed.success) throw new ProviderGenerationTestDataError();
  return parsed.data;
}

function parseConnectionTest(
  row: Record<string, unknown>,
): ProviderConnectionTestSnapshot {
  if (row.test_status === null || row.test_status === undefined) {
    return { status: "UNVERIFIED" };
  }
  if (
    typeof row.models_json !== "string" ||
    typeof row.tested_at !== "string" ||
    typeof row.version !== "number"
  ) {
    throw new ProviderConnectionTestDataError();
  }
  let models: unknown;
  try {
    models = JSON.parse(row.models_json);
  } catch {
    throw new ProviderConnectionTestDataError();
  }
  const candidate =
    row.test_status === "VERIFIED"
      ? {
          status: "VERIFIED",
          providerVersion: row.version,
          testedAt: row.tested_at,
          models,
        }
      : {
          status: row.test_status,
          providerVersion: row.version,
          testedAt: row.tested_at,
          models,
          failure: {
            reason: row.failure_reason,
            retryable: row.retryable === 1,
            ...(typeof row.suggested_backoff_ms === "number"
              ? { suggestedBackoffMs: row.suggested_backoff_ms }
              : {}),
          },
        };
  const parsed =
    providerCompletedConnectionTestSnapshotSchema.safeParse(candidate);
  if (!parsed.success) throw new ProviderConnectionTestDataError();
  return parsed.data;
}
