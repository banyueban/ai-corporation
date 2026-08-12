import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildProposal } from "./organization-proposal-test-fixture";
import { applyMigrations, loadMigrations } from "./migrations";
import {
  OrganizationProposalCommandConflictError,
  OrganizationProposalRepository,
  OrganizationProposalVersionError,
} from "./organization-proposal-repository";

const migrationDirectory = fileURLToPath(
  new URL("../migrations/", import.meta.url),
);
const ids = {
  workspace: "019fa9bb-9300-7d90-a4e3-a5b0eea2a9ef",
  corporation: "019fa9bb-9301-7d90-a4e3-a5b0eea2a9ef",
  provider: "019fa9bb-9302-7d90-a4e3-a5b0eea2a9ef",
  plan: "019fa9bb-9303-7d90-a4e3-a5b0eea2a9ef",
  task: "019fa9bb-9304-7d90-a4e3-a5b0eea2a9ef",
  firstOrganization: "019fa9bb-9305-7d90-a4e3-a5b0eea2a9ef",
  secondOrganization: "019fa9bb-9306-7d90-a4e3-a5b0eea2a9ef",
  firstCommand: "019fa9bb-9307-7d90-a4e3-a5b0eea2a9ef",
  secondCommand: "019fa9bb-9308-7d90-a4e3-a5b0eea2a9ef",
};
const now = "2026-08-12T09:00:00.000Z";
let database: DatabaseSync;
let repository: OrganizationProposalRepository;

beforeEach(() => {
  database = new DatabaseSync(":memory:");
  applyMigrations(database, loadMigrations(migrationDirectory));
  seed(database);
  repository = new OrganizationProposalRepository(database);
});

afterEach(() => database.close());

describe("OrganizationProposalRepository", () => {
  it("saves one DRAFT, returns the same result for an idempotent retry, and keeps Corporation unchanged", () => {
    const proposal = buildProposal(ids, ids.firstOrganization, 1, now);
    const input = {
      commandId: ids.firstCommand,
      requestHash: "a".repeat(64),
      proposal,
    };
    expect(repository.save(input)).toEqual(proposal);
    expect(repository.save(input)).toEqual(proposal);
    expect(repository.getCurrent(ids.corporation)).toEqual(proposal);
    expect(
      database
        .prepare("SELECT COUNT(*) AS count FROM organization_version")
        .get(),
    ).toEqual({ count: 1 });
    expect(
      database
        .prepare("SELECT status FROM corporation WHERE id = ?")
        .get(ids.corporation),
    ).toEqual({ status: "DRAFT" });
    expect(
      database
        .prepare(
          "SELECT name FROM sqlite_master WHERE type = 'table' AND name IN ('agent_instance','agent_run')",
        )
        .all(),
    ).toEqual([]);
  });

  it("supersedes the prior DRAFT for a new command and rejects command or version conflicts without losing it", () => {
    repository.save({
      commandId: ids.firstCommand,
      requestHash: "a".repeat(64),
      proposal: buildProposal(ids, ids.firstOrganization, 1, now),
    });
    const second = buildProposal(
      ids,
      ids.secondOrganization,
      2,
      "2026-08-12T09:01:00.000Z",
    );
    repository.save({
      commandId: ids.secondCommand,
      requestHash: "b".repeat(64),
      proposal: second,
    });
    expect(repository.getCurrent(ids.corporation)).toEqual(second);
    expect(
      database
        .prepare(
          "SELECT version, status FROM organization_version ORDER BY version",
        )
        .all(),
    ).toEqual([
      { version: 1, status: "SUPERSEDED" },
      { version: 2, status: "DRAFT" },
    ]);
    expect(() =>
      repository.resolveCommand(ids.secondCommand, "c".repeat(64)),
    ).toThrow(OrganizationProposalCommandConflictError);
    expect(() =>
      repository.save({
        commandId: "019fa9bb-9309-7d90-a4e3-a5b0eea2a9ef",
        requestHash: "d".repeat(64),
        proposal: {
          ...second,
          organizationId: "019fa9bb-9310-7d90-a4e3-a5b0eea2a9ef",
          version: 4,
        },
      }),
    ).toThrow(OrganizationProposalVersionError);
    expect(repository.getCurrent(ids.corporation)).toEqual(second);
  });
});

function seed(target: DatabaseSync) {
  target
    .prepare(
      `INSERT INTO workspace (id,name,display_path,canonical_root_path,platform,permission_mode,access_status,path_identity_json,created_at,updated_at) VALUES (?,'M3-TU-01','E:\\m3-tu-01','\\\\?\\E:\\m3-tu-01','windows','READ_WRITE','AVAILABLE','{}',?,?)`,
    )
    .run(ids.workspace, now, now);
  target
    .prepare(
      "INSERT INTO corporation (id,workspace_id,name,status,version,created_at,updated_at) VALUES (?,?,'Organization','DRAFT',1,?,?)",
    )
    .run(ids.corporation, ids.workspace, now, now);
  target
    .prepare(
      "INSERT INTO goal_contract_version (corporation_id,version,status,source,content_json,created_by,created_at,approved_at) VALUES (?,1,'DRAFT','MANUAL',?,'local-user',?,NULL)",
    )
    .run(
      ids.corporation,
      JSON.stringify({
        goal: "Create",
        successCriteria: ["Done"],
        deliverables: ["result"],
        constraints: [],
        assumptions: [],
        nonGoals: [],
        budget: {},
      }),
      now,
    );
  target
    .prepare("UPDATE corporation SET active_goal_version = 1 WHERE id = ?")
    .run(ids.corporation);
  target
    .prepare(
      "UPDATE goal_contract_version SET status = 'APPROVED', approved_at = ? WHERE corporation_id = ? AND version = 1",
    )
    .run(now, ids.corporation);
  target
    .prepare(
      "INSERT INTO provider (id,type,name,endpoint,config_json,config_status,version,created_at,updated_at) VALUES (?,'OPENAI_COMPATIBLE','Mock','https://example.test','{}','ENABLED',1,?,?)",
    )
    .run(ids.provider, now, now);
  const plan = buildProposal.plan(ids, now);
  target
    .prepare(
      `INSERT INTO task_plan (id,corporation_id,goal_version,version,status,validation_status,summary,draft_json,provider_id,provider_version,model_id,created_by_operation_id,validation_report_json,validator_version,validated_draft_hash,validated_at,supersedes_plan_id,approved_at,created_at) VALUES (?,?,1,1,'APPROVED','VALID',?,?,?,1,'model-a','019fa9bb-9399-7d90-a4e3-a5b0eea2a9ef',?,'1.0',?,?,NULL,?,?)`,
    )
    .run(
      ids.plan,
      ids.corporation,
      plan.summary,
      JSON.stringify(plan),
      ids.provider,
      JSON.stringify(plan.validationReport),
      "e".repeat(64),
      now,
      now,
      now,
    );
}
