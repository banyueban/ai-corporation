import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import {
  applyMigrations,
  type Migration,
  readAppliedMigrations,
} from "./migrations";

const migration: Migration = {
  checksum: "checksum-1",
  name: "example",
  sql: "CREATE TABLE example (id INTEGER PRIMARY KEY) STRICT;",
  version: 1,
};

describe("migration runner", () => {
  it("applies a migration once and enables foreign keys", () => {
    const database = new DatabaseSync(":memory:");

    applyMigrations(database, [migration]);
    applyMigrations(database, [migration]);

    expect(readAppliedMigrations(database)).toEqual([
      { checksum: "checksum-1", version: 1 },
    ]);
    expect(database.prepare("PRAGMA foreign_keys").get()).toEqual({
      foreign_keys: 1,
    });
    database.close();
  });

  it("rejects a changed applied migration", () => {
    const database = new DatabaseSync(":memory:");
    applyMigrations(database, [migration]);

    expect(() =>
      applyMigrations(database, [{ ...migration, checksum: "changed" }]),
    ).toThrow("Applied migration changed: 1");
    database.close();
  });

  it("rolls back a failed migration", () => {
    const database = new DatabaseSync(":memory:");

    expect(() =>
      applyMigrations(database, [
        {
          checksum: "invalid",
          name: "invalid",
          sql: "CREATE TABLE broken (;",
          version: 2,
        },
      ]),
    ).toThrow();

    expect(readAppliedMigrations(database)).toEqual([]);
    database.close();
  });

  it("rejects duplicate migration versions", () => {
    const database = new DatabaseSync(":memory:");

    expect(() => applyMigrations(database, [migration, migration])).toThrow(
      "Duplicate migration version: 1",
    );
    database.close();
  });
});
