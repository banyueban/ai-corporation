import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { applyMigrations, loadMigrations } from "./migrations";
import {
  ProviderCommandConflictError,
  ProviderRepository,
  ProviderVersionConflictError,
  type EncryptedProviderKey,
} from "./provider-repository";

const migrationDirectory = fileURLToPath(
  new URL("../migrations/", import.meta.url),
);
const providerId = "019b7f4d-a000-7000-8000-000000000031";
const vaultId = "019b7f4d-a000-7000-8000-000000000032";
const createCommandId = "019b7f4d-a000-7000-8000-000000000033";
const deleteCommandId = "019b7f4d-a000-7000-8000-000000000034";
const now = "2026-08-02T00:00:00.000Z";
const encrypted: EncryptedProviderKey = {
  authTag: Buffer.alloc(16, 3),
  ciphertext: Buffer.from("encrypted-value"),
  encryptionVersion: 1,
  nonce: Buffer.alloc(12, 2),
};

function fixture(): DatabaseSync {
  const database = new DatabaseSync(":memory:");
  applyMigrations(database, loadMigrations(migrationDirectory));
  return database;
}

function create(repository: ProviderRepository) {
  return repository.save({
    command: {
      commandId: createCommandId,
      commandType: "SAVE",
      requestHash: "a".repeat(64),
    },
    providerId,
    vaultEntryId: vaultId,
    encrypted,
    name: "Primary",
    endpoint: "https://api.example.test/v1",
    configStatus: "ENABLED",
    now,
  });
}

describe("ProviderRepository", () => {
  it("creates, lists, updates, reveals encrypted material, and deletes a key", () => {
    const database = fixture();
    const repository = new ProviderRepository(database);
    const created = create(repository);
    expect(created).toMatchObject({
      id: providerId,
      hasKey: true,
      version: 1,
    });
    expect(repository.list()).toEqual([created]);
    const stored = repository.getEncryptedKey(providerId);
    expect(stored.entryId).toBe(vaultId);
    expect(Buffer.from(stored.encrypted.ciphertext)).toEqual(
      Buffer.from(encrypted.ciphertext),
    );
    expect(Buffer.from(stored.encrypted.nonce)).toEqual(
      Buffer.from(encrypted.nonce),
    );
    expect(Buffer.from(stored.encrypted.authTag)).toEqual(
      Buffer.from(encrypted.authTag),
    );

    const updated = repository.save({
      command: {
        commandId: "019b7f4d-a000-7000-8000-000000000035",
        commandType: "SAVE",
        requestHash: "b".repeat(64),
      },
      providerId,
      expectedVersion: 1,
      encrypted: { ...encrypted, ciphertext: Buffer.from("replacement") },
      name: "Renamed",
      endpoint: "https://other.example.test/v1",
      configStatus: "DISABLED",
      now: "2026-08-02T00:01:00.000Z",
    });
    expect(updated).toMatchObject({
      name: "Renamed",
      configStatus: "DISABLED",
      version: 2,
      hasKey: true,
    });

    const deleted = repository.deleteKey({
      command: {
        commandId: deleteCommandId,
        commandType: "DELETE_KEY",
        requestHash: "c".repeat(64),
      },
      providerId,
      expectedVersion: 2,
      now: "2026-08-02T00:02:00.000Z",
    });
    expect(deleted).toMatchObject({ hasKey: false, version: 3 });
    expect(() => repository.getEncryptedKey(providerId)).toThrow();
    expect(
      database.prepare("SELECT COUNT(*) AS count FROM key_vault_entry").get(),
    ).toEqual({ count: 0 });
    database.close();
  });

  it("replays matching commands and rejects conflicts", () => {
    const database = fixture();
    const repository = new ProviderRepository(database);
    const created = create(repository);
    expect(create(repository)).toEqual(created);
    expect(() =>
      repository.save({
        command: {
          commandId: createCommandId,
          commandType: "SAVE",
          requestHash: "f".repeat(64),
        },
        providerId,
        vaultEntryId: vaultId,
        encrypted,
        name: "Other",
        endpoint: "https://api.example.test/v1",
        configStatus: "ENABLED",
        now,
      }),
    ).toThrow(ProviderCommandConflictError);
    expect(() =>
      repository.save({
        command: {
          commandId: "019b7f4d-a000-7000-8000-000000000036",
          commandType: "SAVE",
          requestHash: "d".repeat(64),
        },
        providerId,
        expectedVersion: 9,
        name: "Other",
        endpoint: "https://api.example.test/v1",
        configStatus: "ENABLED",
        now,
      }),
    ).toThrow(ProviderVersionConflictError);
    database.close();
  });

  it("rolls back Provider and Vault writes together after injected failure", () => {
    const database = fixture();
    const repository = new ProviderRepository(database, {
      fault: (stage) => {
        if (stage === "AFTER_VAULT_WRITE") throw new Error("injected");
      },
    });
    expect(() => create(repository)).toThrow("injected");
    expect(repository.list()).toEqual([]);
    expect(
      database.prepare("SELECT COUNT(*) AS count FROM key_vault_entry").get(),
    ).toEqual({ count: 0 });
    expect(
      database.prepare("SELECT COUNT(*) AS count FROM provider_command").get(),
    ).toEqual({ count: 0 });
    database.close();
  });
});
