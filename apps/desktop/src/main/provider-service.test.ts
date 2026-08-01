import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
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

function fixture(): {
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
      clock: () => "2026-08-02T00:00:00.000Z",
      repository,
      uuid: () => ids[index++] ?? ids[3]!,
      vault: new ProviderKeyVault({ keyPath }),
    }),
  };
}

describe("ProviderService", () => {
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
});
