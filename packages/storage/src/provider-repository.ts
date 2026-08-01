import { DatabaseSync } from "node:sqlite";
import {
  providerPublicSchema,
  type ProviderConfigStatus,
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
        `SELECT id, type, name, endpoint, key_vault_entry_id, config_status,
          version, created_at, updated_at
        FROM provider
        ORDER BY created_at, id`,
      )
      .all()
      .map(parseProviderRow);
  }

  get(providerId: string): ProviderPublic | undefined {
    const row = this.#database
      .prepare(
        `SELECT id, type, name, endpoint, key_vault_entry_id, config_status,
          version, created_at, updated_at
        FROM provider WHERE id = ?`,
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
              id, type, name, endpoint, key_vault_entry_id, config_json,
              config_status, version, created_at, updated_at
            ) VALUES (?, 'OPENAI_COMPATIBLE', ?, ?, ?, '{}', ?, 1, ?, ?)`,
          )
          .run(
            input.providerId,
            input.name,
            input.endpoint,
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
        const result = this.#database
          .prepare(
            `UPDATE provider
            SET name = ?, endpoint = ?, config_status = ?,
              key_vault_entry_id = ?, version = version + 1, updated_at = ?
            WHERE id = ? AND version = ?`,
          )
          .run(
            input.name,
            input.endpoint,
            input.configStatus,
            vaultEntryId ?? null,
            input.now,
            input.providerId,
            input.expectedVersion,
          );
        if (result.changes !== 1) throw new ProviderVersionConflictError();
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
          SET key_vault_entry_id = NULL, version = version + 1, updated_at = ?
          WHERE id = ? AND version = ?`,
        )
        .run(input.now, input.providerId, input.expectedVersion);
      if (result.changes !== 1) throw new ProviderVersionConflictError();
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
  const parsed = providerPublicSchema.safeParse({
    schemaVersion: 1,
    id: row.id,
    type: row.type,
    name: row.name,
    endpoint: row.endpoint,
    configStatus: row.config_status,
    hasKey: typeof row.key_vault_entry_id === "string",
    version: row.version,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });
  if (!parsed.success) throw new ProviderDataError();
  return parsed.data;
}
