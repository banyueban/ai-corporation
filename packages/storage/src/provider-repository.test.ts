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
  return createProvider(repository, {
    providerId,
    vaultId,
    commandId: createCommandId,
    requestHash: "a".repeat(64),
    encrypted,
    name: "Primary",
  });
}

function createProvider(
  repository: ProviderRepository,
  input: {
    readonly providerId: string;
    readonly vaultId: string;
    readonly commandId: string;
    readonly requestHash: string;
    readonly encrypted: EncryptedProviderKey;
    readonly name: string;
  },
) {
  return repository.save({
    command: {
      commandId: input.commandId,
      commandType: "SAVE",
      requestHash: input.requestHash,
    },
    providerId: input.providerId,
    vaultEntryId: input.vaultId,
    encrypted: input.encrypted,
    name: input.name,
    endpoint: "https://api.example.test/v1",
    configStatus: "ENABLED",
    now,
  });
}

describe("ProviderRepository", () => {
  it("isolates and restores failed and verified connection projections", () => {
    const database = fixture();
    const repository = new ProviderRepository(database);
    const first = create(repository);
    const second = createProvider(repository, {
      providerId: "019b7f4d-a000-7000-8000-000000000064",
      vaultId: "019b7f4d-a000-7000-8000-000000000065",
      commandId: "019b7f4d-a000-7000-8000-000000000066",
      requestHash: "7".repeat(64),
      encrypted: { ...encrypted, nonce: Buffer.alloc(12, 7) },
      name: "Secondary",
    });
    repository.saveConnectionTest({
      providerId: first.id,
      expectedVersion: first.version,
      snapshot: {
        status: "FAILED",
        providerVersion: first.version,
        testedAt: now,
        failure: {
          reason: "RATE_LIMIT",
          retryable: true,
          suggestedBackoffMs: 2_000,
        },
        models: [],
      },
    });
    repository.saveConnectionTest({
      providerId: second.id,
      expectedVersion: second.version,
      snapshot: {
        status: "VERIFIED",
        providerVersion: second.version,
        testedAt: now,
        models: [],
      },
    });
    const reopened = new ProviderRepository(database).list();
    expect(
      reopened.find(({ id }) => id === first.id)?.connectionTest,
    ).toMatchObject({ status: "FAILED", failure: { reason: "RATE_LIMIT" } });
    expect(
      reopened.find(({ id }) => id === second.id)?.connectionTest,
    ).toMatchObject({ status: "VERIFIED" });
    database.close();
  });

  it("persists versioned connection results and invalidates them on configuration changes", () => {
    const database = fixture();
    const repository = new ProviderRepository(database);
    const created = create(repository);
    expect(created.connectionTest).toEqual({ status: "UNVERIFIED" });
    const snapshot = repository.saveConnectionTest({
      providerId,
      expectedVersion: created.version,
      snapshot: {
        status: "VERIFIED",
        providerVersion: created.version,
        testedAt: now,
        models: [
          {
            id: "model-a",
            displayName: "model-a",
            source: "PROVIDER",
            observedAt: now,
          },
        ],
      },
    });
    expect(repository.get(providerId)?.connectionTest).toEqual(snapshot);
    expect(new ProviderRepository(database).list()[0]?.connectionTest).toEqual(
      snapshot,
    );
    expect(() =>
      repository.saveConnectionTest({
        providerId,
        expectedVersion: 9,
        snapshot: {
          status: "FAILED",
          providerVersion: 9,
          testedAt: now,
          failure: { reason: "NETWORK", retryable: true },
          models: [],
        },
      }),
    ).toThrow(ProviderVersionConflictError);

    const renamed = repository.save({
      command: {
        commandId: "019b7f4d-a000-7000-8000-000000000060",
        commandType: "SAVE",
        requestHash: "9".repeat(64),
      },
      providerId,
      expectedVersion: created.version,
      name: "Changed",
      endpoint: "https://api.example.test/v1",
      configStatus: "DISABLED",
      now,
    });
    expect(renamed.connectionTest).toMatchObject({
      status: "VERIFIED",
      providerVersion: 2,
    });

    const updated = repository.save({
      command: {
        commandId: "019b7f4d-a000-7000-8000-000000000063",
        commandType: "SAVE",
        requestHash: "8".repeat(64),
      },
      providerId,
      expectedVersion: renamed.version,
      name: "Changed",
      endpoint: "https://api.example.test/v2",
      configStatus: "ENABLED",
      now,
    });
    expect(updated.connectionTest).toEqual({ status: "UNVERIFIED" });
    expect(
      database
        .prepare("SELECT COUNT(*) AS count FROM provider_connection_test")
        .get(),
    ).toEqual({ count: 0 });
    database.close();
  });

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

  it("isolates two Providers and their Vault records", () => {
    const database = fixture();
    const repository = new ProviderRepository(database);
    const first = create(repository);
    const secondId = "019b7f4d-a000-7000-8000-000000000037";
    const secondVaultId = "019b7f4d-a000-7000-8000-000000000038";
    const secondEncrypted = {
      ...encrypted,
      ciphertext: Buffer.from("second-encrypted-value"),
      nonce: Buffer.alloc(12, 9),
    };
    const second = createProvider(repository, {
      providerId: secondId,
      vaultId: secondVaultId,
      commandId: "019b7f4d-a000-7000-8000-000000000039",
      requestHash: "e".repeat(64),
      encrypted: secondEncrypted,
      name: "Secondary",
    });

    repository.deleteKey({
      command: {
        commandId: "019b7f4d-a000-7000-8000-00000000003a",
        commandType: "DELETE_KEY",
        requestHash: "f".repeat(64),
      },
      providerId: first.id,
      expectedVersion: first.version,
      now,
    });

    expect(repository.get(secondId)).toEqual(second);
    expect(
      Buffer.from(repository.getEncryptedKey(secondId).encrypted.ciphertext),
    ).toEqual(Buffer.from(secondEncrypted.ciphertext));
    database.close();
  });

  it("rolls back create at every injected transaction stage", () => {
    for (const faultStage of [
      "AFTER_VAULT_WRITE",
      "AFTER_PROVIDER_WRITE",
      "BEFORE_COMMIT",
    ] as const) {
      const database = fixture();
      const repository = new ProviderRepository(database, {
        fault: (stage) => {
          if (stage === faultStage) throw new Error("injected");
        },
      });
      expect(() => create(repository)).toThrow("injected");
      expect(repository.list()).toEqual([]);
      expect(
        database.prepare("SELECT COUNT(*) AS count FROM key_vault_entry").get(),
      ).toEqual({ count: 0 });
      expect(
        database
          .prepare("SELECT COUNT(*) AS count FROM provider_command")
          .get(),
      ).toEqual({ count: 0 });
      database.close();
    }
  });

  it("rolls back replace and delete at every injected transaction stage", () => {
    const replacementStages = [
      "AFTER_VAULT_WRITE",
      "AFTER_PROVIDER_WRITE",
      "BEFORE_COMMIT",
    ] as const;
    const deleteStages = [
      "AFTER_PROVIDER_WRITE",
      "AFTER_VAULT_WRITE",
      "BEFORE_COMMIT",
    ] as const;

    for (const [index, faultStage] of replacementStages.entries()) {
      const database = fixture();
      const stableRepository = new ProviderRepository(database);
      const created = create(stableRepository);
      const repository = new ProviderRepository(database, {
        fault: (stage) => {
          if (stage === faultStage) throw new Error("injected");
        },
      });
      expect(() =>
        repository.save({
          command: {
            commandId: `019b7f4d-a000-7000-8000-00000000004${index}`,
            commandType: "SAVE",
            requestHash: `${index + 1}`.repeat(64),
          },
          providerId,
          expectedVersion: created.version,
          encrypted: {
            ...encrypted,
            ciphertext: Buffer.from("replacement-encrypted-value"),
          },
          name: "Changed",
          endpoint: "https://api.example.test/v1",
          configStatus: "DISABLED",
          now,
        }),
      ).toThrow("injected");
      expect(stableRepository.get(providerId)).toEqual(created);
      expect(
        Buffer.from(
          stableRepository.getEncryptedKey(providerId).encrypted.ciphertext,
        ),
      ).toEqual(Buffer.from(encrypted.ciphertext));
      database.close();
    }

    for (const [index, faultStage] of deleteStages.entries()) {
      const database = fixture();
      const stableRepository = new ProviderRepository(database);
      const created = create(stableRepository);
      const repository = new ProviderRepository(database, {
        fault: (stage) => {
          if (stage === faultStage) throw new Error("injected");
        },
      });
      expect(() =>
        repository.deleteKey({
          command: {
            commandId: `019b7f4d-a000-7000-8000-00000000005${index}`,
            commandType: "DELETE_KEY",
            requestHash: `${index + 4}`.repeat(64),
          },
          providerId,
          expectedVersion: created.version,
          now,
        }),
      ).toThrow("injected");
      expect(stableRepository.get(providerId)).toEqual(created);
      expect(stableRepository.getEncryptedKey(providerId).entryId).toBe(
        vaultId,
      );
      database.close();
    }
  });
});
