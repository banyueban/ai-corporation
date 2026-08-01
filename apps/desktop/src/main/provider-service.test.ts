import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import {
  DeterministicMockProvider,
  ProviderAdapterError,
  type ModelProvider,
} from "@ai-corporation/providers";
import {
  applyMigrations,
  loadMigrations,
  ProviderRepository,
} from "@ai-corporation/storage";
import { ProviderKeyVault } from "./provider-key-vault";
import { ProviderService } from "./provider-service";

const migrationDirectory = fileURLToPath(
  new URL("../../../../packages/storage/migrations/", import.meta.url),
);
const roots: string[] = [];
const ids = [
  "019b7f4d-a000-7000-8000-000000000041",
  "019b7f4d-a000-7000-8000-000000000042",
  "019b7f4d-a000-7000-8000-000000000043",
  "019b7f4d-a000-7000-8000-000000000044",
];

afterEach(() => {
  while (roots.length > 0) {
    const root = roots.pop();
    if (root !== undefined) rmSync(root, { force: true, recursive: true });
  }
});

function fixture(adapter?: ModelProvider): {
  readonly database: DatabaseSync;
  readonly keyPath: string;
  readonly repository: ProviderRepository;
  readonly service: ProviderService;
} {
  const root = mkdtempSync(path.join(tmpdir(), "M2-TU-02-service-"));
  roots.push(root);
  const database = new DatabaseSync(":memory:");
  applyMigrations(database, loadMigrations(migrationDirectory));
  const repository = new ProviderRepository(database);
  let index = 0;
  const keyPath = path.join(root, "key-vault", "master-key-v1");
  return {
    database,
    keyPath,
    repository,
    service: new ProviderService({
      ...(adapter === undefined ? {} : { adapter }),
      clock: () => "2026-08-02T00:00:00.000Z",
      repository,
      uuid: () => ids[index++] ?? ids[3]!,
      vault: new ProviderKeyVault({ keyPath }),
    }),
  };
}

describe("ProviderService", () => {
  it("tests a saved Provider and persists normalized models and failures", async () => {
    const successFixture = fixture(
      new DeterministicMockProvider(
        { type: "SUCCESS", modelIds: ["mock-a", "mock-b"] },
        () => "2026-08-02T00:00:00.000Z",
      ),
    );
    const created = successFixture.service.save({
      schemaVersion: 1,
      commandId: "019b7f4d-a000-7000-8000-000000000071",
      name: "Primary",
      endpoint: "https://api.example.test/v1",
      configStatus: "ENABLED",
      key: "M2-TU-03-fake-service-key",
    });
    if (!created.ok) throw new Error("fixture create failed");
    await expect(
      successFixture.service.testConnection({
        schemaVersion: 1,
        requestId: "019b7f4d-a000-7000-8000-000000000072",
        providerId: created.value.id,
        expectedVersion: created.value.version,
      }),
    ).resolves.toMatchObject({
      ok: true,
      value: {
        status: "VERIFIED",
        models: [{ id: "mock-a" }, { id: "mock-b" }],
      },
    });
    expect(successFixture.service.list()).toMatchObject({
      ok: true,
      value: [{ connectionTest: { status: "VERIFIED" } }],
    });
    successFixture.database.close();

    const failureFixture = fixture(
      new DeterministicMockProvider({
        type: "FAILURE",
        failure: {
          reason: "AUTHENTICATION",
          retryable: false,
        },
      }),
    );
    const failedProvider = failureFixture.service.save({
      schemaVersion: 1,
      commandId: "019b7f4d-a000-7000-8000-000000000073",
      name: "Primary",
      endpoint: "https://api.example.test/v1",
      configStatus: "ENABLED",
      key: "M2-TU-03-fake-failed-key",
    });
    if (!failedProvider.ok) throw new Error("fixture create failed");
    await expect(
      failureFixture.service.testConnection({
        schemaVersion: 1,
        requestId: "019b7f4d-a000-7000-8000-000000000074",
        providerId: failedProvider.value.id,
        expectedVersion: failedProvider.value.version,
      }),
    ).resolves.toMatchObject({
      ok: true,
      value: {
        status: "FAILED",
        failure: { reason: "AUTHENTICATION", retryable: false },
      },
    });
    failureFixture.database.close();
  });

  it("cancels only the active request without overwriting a previous result", async () => {
    const blockingAdapter: ModelProvider = {
      descriptor: () => ({ type: "MOCK", displayName: "Blocking Mock" }),
      validateConfig: () => undefined,
      listModels: async (_config, signal) =>
        new Promise((_resolve, reject) => {
          signal.addEventListener(
            "abort",
            () =>
              reject(
                new ProviderAdapterError({
                  reason: "CANCELLED",
                  retryable: false,
                }),
              ),
            { once: true },
          );
        }),
    };
    const { database, repository, service } = fixture(blockingAdapter);
    const created = service.save({
      schemaVersion: 1,
      commandId: "019b7f4d-a000-7000-8000-000000000075",
      name: "Primary",
      endpoint: "https://api.example.test/v1",
      configStatus: "ENABLED",
      key: "M2-TU-03-fake-cancel-key",
    });
    if (!created.ok) throw new Error("fixture create failed");
    const requestId = "019b7f4d-a000-7000-8000-000000000076";
    const pending = service.testConnection({
      schemaVersion: 1,
      requestId,
      providerId: created.value.id,
      expectedVersion: created.value.version,
    });
    expect(
      service.cancelConnectionTest({ schemaVersion: 1, requestId }),
    ).toMatchObject({ ok: true, value: { cancelled: true } });
    await expect(pending).resolves.toMatchObject({
      ok: false,
      error: { code: "CANCELLED" },
    });
    expect(repository.get(created.value.id)?.connectionTest).toEqual({
      status: "UNVERIFIED",
    });
    expect(
      service.cancelConnectionTest({ schemaVersion: 1, requestId }),
    ).toMatchObject({ ok: false, error: { code: "NOT_FOUND" } });
    await expect(
      service.testConnection({
        schemaVersion: 1,
        requestId,
        providerId: created.value.id,
        expectedVersion: created.value.version,
      }),
    ).resolves.toMatchObject({
      ok: false,
      error: { code: "ALREADY_TESTING" },
    });
    database.close();
  });

  it("rejects a late result after the Provider version changes", async () => {
    let release: (() => void) | undefined;
    const delayedAdapter: ModelProvider = {
      descriptor: () => ({ type: "MOCK", displayName: "Delayed Mock" }),
      validateConfig: () => undefined,
      listModels: async () => {
        await new Promise<void>((resolve) => {
          release = resolve;
        });
        return [];
      },
    };
    const { database, service } = fixture(delayedAdapter);
    const created = service.save({
      schemaVersion: 1,
      commandId: "019b7f4d-a000-7000-8000-000000000077",
      name: "Primary",
      endpoint: "https://api.example.test/v1",
      configStatus: "ENABLED",
      key: "M2-TU-03-fake-late-key",
    });
    if (!created.ok) throw new Error("fixture create failed");
    const pending = service.testConnection({
      schemaVersion: 1,
      requestId: "019b7f4d-a000-7000-8000-000000000078",
      providerId: created.value.id,
      expectedVersion: created.value.version,
    });
    expect(
      service.save({
        schemaVersion: 1,
        commandId: "019b7f4d-a000-7000-8000-000000000079",
        providerId: created.value.id,
        expectedVersion: created.value.version,
        name: "Changed",
        endpoint: "https://api.example.test/v2",
        configStatus: "ENABLED",
      }),
    ).toMatchObject({ ok: true, value: { version: 2 } });
    release?.();
    await expect(pending).resolves.toMatchObject({
      ok: false,
      error: { code: "CONFLICT" },
    });
    expect(service.list()).toMatchObject({
      ok: true,
      value: [{ version: 2, connectionTest: { status: "UNVERIFIED" } }],
    });
    database.close();
  });

  it("keeps plaintext out of public results across the full lifecycle", () => {
    const { database, service } = fixture();
    const secret = "M2-TU-02-fake-service-key";
    const created = service.save({
      schemaVersion: 1,
      commandId: "019b7f4d-a000-7000-8000-000000000045",
      name: "Primary",
      endpoint: "https://api.example.test/v1",
      configStatus: "ENABLED",
      key: secret,
    });
    expect(created).toMatchObject({ ok: true, value: { hasKey: true } });
    expect(JSON.stringify(created)).not.toContain(secret);
    if (!created.ok) throw new Error("fixture create failed");

    expect(service.list()).toEqual({
      ok: true,
      value: [created.value],
    });
    expect(
      service.revealKey({
        schemaVersion: 1,
        providerId: created.value.id,
      }),
    ).toMatchObject({ ok: true, value: { key: secret } });

    const replaced = service.save({
      schemaVersion: 1,
      commandId: "019b7f4d-a000-7000-8000-000000000046",
      providerId: created.value.id,
      expectedVersion: created.value.version,
      name: "Primary",
      endpoint: "https://api.example.test/v1",
      configStatus: "ENABLED",
      key: "M2-TU-02-fake-replacement",
    });
    expect(replaced).toMatchObject({ ok: true, value: { version: 2 } });
    if (!replaced.ok) throw new Error("fixture replace failed");
    const deleted = service.deleteKey({
      schemaVersion: 1,
      commandId: "019b7f4d-a000-7000-8000-000000000047",
      providerId: created.value.id,
      expectedVersion: replaced.value.version,
    });
    expect(deleted).toMatchObject({
      ok: true,
      value: { hasKey: false, version: 3 },
    });
    expect(
      service.revealKey({ schemaVersion: 1, providerId: created.value.id }),
    ).toMatchObject({ ok: false, error: { code: "NOT_FOUND" } });
    database.close();
  });

  it("fails without changing SQLite when the existing local key is missing", () => {
    const { database, keyPath, repository, service } = fixture();
    const created = service.save({
      schemaVersion: 1,
      commandId: "019b7f4d-a000-7000-8000-000000000048",
      name: "Primary",
      endpoint: "https://api.example.test/v1",
      configStatus: "ENABLED",
      key: "M2-TU-02-fake-before-loss",
    });
    if (!created.ok) throw new Error("fixture create failed");
    rmSync(keyPath, { force: true });

    expect(
      service.save({
        schemaVersion: 1,
        commandId: "019b7f4d-a000-7000-8000-000000000049",
        providerId: created.value.id,
        expectedVersion: created.value.version,
        name: "Changed",
        endpoint: "https://api.example.test/v1",
        configStatus: "ENABLED",
        key: "M2-TU-02-fake-after-loss",
      }),
    ).toMatchObject({
      ok: false,
      error: { code: "VAULT_KEY_UNAVAILABLE" },
    });
    expect(repository.get(created.value.id)).toEqual(created.value);
    expect(
      service.revealKey({ schemaVersion: 1, providerId: created.value.id }),
    ).toMatchObject({
      ok: false,
      error: { code: "VAULT_KEY_UNAVAILABLE" },
    });

    expect(
      service.deleteKey({
        schemaVersion: 1,
        commandId: "019b7f4d-a000-7000-8000-000000000050",
        providerId: created.value.id,
        expectedVersion: created.value.version,
      }),
    ).toMatchObject({
      ok: true,
      value: { hasKey: false, version: 2 },
    });
    expect(repository.get(created.value.id)).toMatchObject({ hasKey: false });
    database.close();
  });

  it("does not commit Provider or Vault rows when the local key cannot be created", () => {
    const { database, keyPath, repository, service } = fixture();
    writeFileSync(path.dirname(keyPath), "blocks-key-directory", {
      flag: "wx",
    });

    expect(
      service.save({
        schemaVersion: 1,
        commandId: "019b7f4d-a000-7000-8000-000000000051",
        name: "Primary",
        endpoint: "https://api.example.test/v1",
        configStatus: "ENABLED",
        key: "M2-TU-02-fake-create-failure",
      }),
    ).toMatchObject({
      ok: false,
      error: { code: "VAULT_KEY_UNAVAILABLE" },
    });
    expect(repository.list()).toEqual([]);
    expect(repository.hasVaultEntries()).toBe(false);
    database.close();
  });
});
