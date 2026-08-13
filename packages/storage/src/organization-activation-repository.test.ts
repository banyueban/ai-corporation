import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { applyMigrations, loadMigrations } from "./migrations";
import { buildProposal } from "./organization-proposal-test-fixture";
import { OrganizationProposalRepository } from "./organization-proposal-repository";
import {
  OrganizationActivationBlockingGapError,
  OrganizationActivationCommandConflictError,
  OrganizationActivationDegradedGapError,
  OrganizationActivationModelError,
  OrganizationActivationProviderNotReadyError,
  OrganizationActivationProviderVersionError,
  OrganizationActivationRepository,
} from "./organization-activation-repository";
import { ExecutionStartRepository } from "./execution-start-repository";

const migrationDirectory = fileURLToPath(
  new URL("../migrations/", import.meta.url),
);
const id = (suffix: string) =>
  `019faa02-0000-7000-8000-${suffix.padStart(12, "0")}`;
const ids = {
  workspace: id("1"),
  corporation: id("2"),
  provider: id("3"),
  plan: id("4"),
  task: id("5"),
  organization: id("6"),
  proposalCommand: id("7"),
  activation: id("8"),
  activationCommand: id("9"),
};
const now = "2026-08-13T01:00:00.000Z";
let database: DatabaseSync;
let repository: OrganizationActivationRepository;

beforeEach(() => {
  database = new DatabaseSync(":memory:");
  applyMigrations(database, loadMigrations(migrationDirectory));
  seed(database);
  repository = new OrganizationActivationRepository(database);
});
afterEach(() => database.close());

describe("OrganizationActivationRepository", () => {
  it("atomically activates three role routes without changing Provider defaults or starting work", () => {
    const request = activationRequest();
    const result = repository.activate({
      request,
      requestHash: "a".repeat(64),
      activationId: ids.activation,
      agentInstanceIds: [id("10"), id("11"), id("12")],
      activatedAt: now,
    });
    expect(result.routes.planner.modelId).toBe("model-planner");
    expect(result.routes.executor.modelId).toBe("model-executor");
    expect(result.routes.judge.modelId).toBe("model-judge");
    expect(result.agents).toHaveLength(3);
    expect(
      database
        .prepare("SELECT status FROM organization_version WHERE id = ?")
        .get(ids.organization),
    ).toEqual({ status: "APPROVED" });
    expect(
      database
        .prepare(
          "SELECT status, active_organization_version FROM corporation WHERE id = ?",
        )
        .get(ids.corporation),
    ).toEqual({ status: "DRAFT", active_organization_version: 1 });
    expect(
      database
        .prepare("SELECT selected_model_id FROM provider WHERE id = ?")
        .get(ids.provider),
    ).toEqual({ selected_model_id: "default-model" });
    expect(
      database.prepare("SELECT COUNT(*) AS count FROM agent_instance").get(),
    ).toEqual({ count: 3 });
    expect(
      database.prepare("SELECT COUNT(*) AS count FROM model_call").get(),
    ).toEqual({ count: 0 });
    expect(
      database.prepare("SELECT COUNT(*) AS count FROM agent_run").get(),
    ).toEqual({ count: 0 });
    expect(
      repository.activate({
        request,
        requestHash: "a".repeat(64),
        activationId: id("99"),
        agentInstanceIds: [id("90"), id("91"), id("92")],
        activatedAt: now,
      }),
    ).toEqual(result);
  });

  it("rejects missing models and command conflicts without partial activation", () => {
    expect(() =>
      repository.activate({
        request: {
          ...activationRequest(),
          routes: {
            ...activationRequest().routes,
            judge: {
              providerId: ids.provider,
              providerVersion: 1,
              modelId: "missing",
            },
          },
        },
        requestHash: "b".repeat(64),
        activationId: ids.activation,
        agentInstanceIds: [id("10"), id("11"), id("12")],
        activatedAt: now,
      }),
    ).toThrow(OrganizationActivationModelError);
    expect(
      database
        .prepare("SELECT status FROM organization_version WHERE id = ?")
        .get(ids.organization),
    ).toEqual({ status: "DRAFT" });
    expect(
      database.prepare("SELECT COUNT(*) AS count FROM agent_instance").get(),
    ).toEqual({ count: 0 });
    repository.activate({
      request: activationRequest(),
      requestHash: "a".repeat(64),
      activationId: ids.activation,
      agentInstanceIds: [id("10"), id("11"), id("12")],
      activatedAt: now,
    });
    expect(() =>
      repository.resolveCommand(ids.activationCommand, "c".repeat(64)),
    ).toThrow(OrganizationActivationCommandConflictError);
  });

  it("reports an unverified Provider as not ready without writing partial data", () => {
    database
      .prepare("DELETE FROM provider_connection_test WHERE provider_id = ?")
      .run(ids.provider);
    expect(() =>
      repository.activate({
        request: activationRequest(),
        requestHash: "a".repeat(64),
        activationId: ids.activation,
        agentInstanceIds: [id("10"), id("11"), id("12")],
        activatedAt: now,
      }),
    ).toThrow(OrganizationActivationProviderNotReadyError);
    expect(
      database
        .prepare("SELECT status FROM organization_version WHERE id = ?")
        .get(ids.organization),
    ).toEqual({ status: "DRAFT" });
    expect(
      database
        .prepare("SELECT COUNT(*) AS count FROM organization_activation")
        .get(),
    ).toEqual({ count: 0 });
    expect(
      database.prepare("SELECT COUNT(*) AS count FROM agent_instance").get(),
    ).toEqual({ count: 0 });
  });

  it("blocks activation when the trusted proposal has a blocking gap", () => {
    database
      .prepare("UPDATE organization_version SET snapshot_json = ? WHERE id = ?")
      .run(
        JSON.stringify({
          ...buildProposal(ids, ids.organization, 1, now),
          capabilityGaps: [
            {
              taskIds: [ids.task],
              capability: "unknown.capability",
              severity: "BLOCKING",
              reason: "missing",
              alternatives: ["CHANGE_PLAN"],
            },
          ],
        }),
        ids.organization,
      );
    expect(() =>
      repository.activate({
        request: activationRequest(),
        requestHash: "a".repeat(64),
        activationId: ids.activation,
        agentInstanceIds: [id("10"), id("11"), id("12")],
        activatedAt: now,
      }),
    ).toThrow(OrganizationActivationBlockingGapError);
  });

  it("requires explicit acceptance for degraded gaps and binds it to the activated version", () => {
    database
      .prepare("UPDATE organization_version SET snapshot_json = ? WHERE id = ?")
      .run(
        JSON.stringify({
          ...buildProposal(ids, ids.organization, 1, now),
          capabilityGaps: [
            {
              taskIds: [ids.task],
              capability: "optional.capability",
              severity: "DEGRADED",
              reason: "limited",
              alternatives: ["ASK_HUMAN"],
            },
          ],
        }),
        ids.organization,
      );
    expect(() =>
      repository.activate({
        request: activationRequest(),
        requestHash: "a".repeat(64),
        activationId: ids.activation,
        agentInstanceIds: [id("10"), id("11"), id("12")],
        activatedAt: now,
      }),
    ).toThrow(OrganizationActivationDegradedGapError);
    const acceptedRequest = {
      ...activationRequest(),
      acceptDegradedGaps: true,
    };
    const result = repository.activate({
      request: acceptedRequest,
      requestHash: "b".repeat(64),
      activationId: ids.activation,
      agentInstanceIds: [id("10"), id("11"), id("12")],
      activatedAt: now,
    });
    expect(result).toMatchObject({
      organizationVersion: 1,
      acceptedDegradedGaps: true,
    });
  });

  it("rejects a changed Provider version and rolls back any mid-transaction failure", () => {
    database
      .prepare("UPDATE provider SET version = 2 WHERE id = ?")
      .run(ids.provider);
    expect(() =>
      repository.activate({
        request: activationRequest(),
        requestHash: "a".repeat(64),
        activationId: ids.activation,
        agentInstanceIds: [id("10"), id("11"), id("12")],
        activatedAt: now,
      }),
    ).toThrow(OrganizationActivationProviderVersionError);
    database
      .prepare("UPDATE provider SET version = 1 WHERE id = ?")
      .run(ids.provider);
    database.exec(
      "CREATE TRIGGER fail_agent_insert BEFORE INSERT ON agent_instance BEGIN SELECT RAISE(ABORT, 'injected failure'); END",
    );
    expect(() =>
      repository.activate({
        request: activationRequest(),
        requestHash: "b".repeat(64),
        activationId: ids.activation,
        agentInstanceIds: [id("10"), id("11"), id("12")],
        activatedAt: now,
      }),
    ).toThrow();
    expect(
      database
        .prepare("SELECT status FROM organization_version WHERE id = ?")
        .get(ids.organization),
    ).toEqual({ status: "DRAFT" });
    expect(
      database
        .prepare(
          "SELECT active_organization_version FROM corporation WHERE id = ?",
        )
        .get(ids.corporation),
    ).toEqual({ active_organization_version: null });
    expect(
      database
        .prepare("SELECT COUNT(*) AS count FROM organization_activation")
        .get(),
    ).toEqual({ count: 0 });
    expect(
      database.prepare("SELECT COUNT(*) AS count FROM agent_definition").get(),
    ).toEqual({ count: 0 });
    expect(
      database.prepare("SELECT COUNT(*) AS count FROM agent_instance").get(),
    ).toEqual({ count: 0 });
  });

  it("keeps the immutable route snapshot and reports it invalid after Provider changes", () => {
    repository.activate({
      request: activationRequest(),
      requestHash: "a".repeat(64),
      activationId: ids.activation,
      agentInstanceIds: [id("10"), id("11"), id("12")],
      activatedAt: now,
    });
    database
      .prepare("UPDATE provider SET config_status='DISABLED' WHERE id=?")
      .run(ids.provider);
    expect(repository.getCurrent(ids.corporation)?.routes.planner.modelId).toBe(
      "model-planner",
    );
    expect(repository.validateActiveRoutes(ids.corporation)).toEqual([
      "planner",
      "executor",
      "judge",
    ]);
  });
});

describe("ExecutionStartRepository", () => {
  it("computes task states, claims exactly one agent task, and creates one CREATED run", () => {
    materializeTask(database);
    activateTeam();
    const execution = new ExecutionStartRepository(database);
    const request = {
      schemaVersion: "1.0" as const,
      commandId: id("40"),
      corporationId: ids.corporation,
      expectedCorporationVersion: 1,
    };
    const result = execution.start({
      request,
      requestHash: "1".repeat(64),
      runId: id("41"),
      eventId: id("42"),
      now,
    });
    expect(result.corporationStatus).toBe("EXECUTING");
    expect(result.tasks).toEqual([
      { taskId: ids.task, title: "Create", status: "RUNNING" },
    ]);
    expect(result.run).toMatchObject({
      runId: id("41"),
      taskId: ids.task,
      attempt: 1,
      status: "CREATED",
    });
    expect(
      database.prepare("SELECT COUNT(*) AS count FROM agent_run").get(),
    ).toEqual({ count: 1 });
    expect(
      database.prepare("SELECT COUNT(*) AS count FROM model_call").get(),
    ).toEqual({ count: 0 });
    expect(
      execution.start({
        request,
        requestHash: "1".repeat(64),
        runId: id("50"),
        eventId: id("51"),
        now,
      }),
    ).toEqual(result);
    expect(
      database.prepare("SELECT COUNT(*) AS count FROM agent_run").get(),
    ).toEqual({ count: 1 });
  });

  it("prefers an equally ranked human task and leaves the agent task ready without a run", () => {
    materializeTask(database);
    const humanId = id("43");
    const base = buildProposal.plan(ids, now).tasks[0]!;
    const humanContract = {
      ...JSON.parse(
        String(
          database
            .prepare("SELECT contract_json FROM task WHERE id=?")
            .get(ids.task)?.contract_json,
        ),
      ),
      id: humanId,
      title: "Choose",
      objective: "Choose direction",
      kind: "HUMAN_DECISION",
      expectedOutputs: [],
    };
    database
      .prepare(
        `INSERT INTO task
      (id,corporation_id,plan_id,title,objective,kind,priority,risk_level,status,
       contract_json,attempt,max_attempts,weight,version,created_at,updated_at)
      VALUES (?,?,?,'Choose','Choose direction','HUMAN_DECISION',50,'LOW','DRAFT',?,0,1,1,1,?,?)`,
      )
      .run(
        humanId,
        ids.corporation,
        ids.plan,
        JSON.stringify(humanContract),
        now,
        now,
      );
    const row = database
      .prepare("SELECT snapshot_json FROM organization_version WHERE id=?")
      .get(ids.organization)!;
    const proposal = JSON.parse(String(row.snapshot_json));
    proposal.assignments.push({
      taskId: humanId,
      ownerType: "HUMAN",
      ownerId: "human.user",
      reason: "User decision",
    });
    database
      .prepare("UPDATE organization_version SET snapshot_json=? WHERE id=?")
      .run(JSON.stringify(proposal), ids.organization);
    activateTeam();
    const result = new ExecutionStartRepository(database).start({
      request: {
        schemaVersion: "1.0",
        commandId: id("44"),
        corporationId: ids.corporation,
        expectedCorporationVersion: 1,
      },
      requestHash: "2".repeat(64),
      runId: id("45"),
      eventId: id("46"),
      now,
    });
    expect(result.selectedTaskId).toBe(humanId);
    expect(result.corporationStatus).toBe("WAITING_HUMAN");
    expect(result.run).toBeUndefined();
    expect(result.tasks).toEqual([
      { taskId: ids.task, title: "Create", status: "READY" },
      { taskId: humanId, title: "Choose", status: "WAITING_HUMAN" },
    ]);
    expect(
      database.prepare("SELECT COUNT(*) AS count FROM agent_run").get(),
    ).toEqual({ count: 0 });
    void base;
  });
});

function materializeTask(target: DatabaseSync) {
  const plan = buildProposal.plan(ids, now);
  const draftTask = plan.tasks[0]!;
  const contract = {
    schemaVersion: "1.0",
    id: draftTask.id,
    corporationId: ids.corporation,
    planVersion: 1,
    title: draftTask.title,
    objective: draftTask.objective,
    kind: draftTask.kind,
    priority: draftTask.priority,
    riskLevel: draftTask.riskLevel,
    requiredCapabilities: draftTask.requiredCapabilities,
    requiredTools: draftTask.requiredTools,
    inputRefs: [
      {
        source: "GOAL_CONTRACT",
        goalVersion: 1,
        logicalName: "goal",
        required: true,
      },
    ],
    expectedOutputs: draftTask.expectedOutputs.map((output) => ({
      ...output,
      artifactType: "TEXT",
    })),
    acceptanceCriteria: draftTask.acceptanceCriteria.map((criterion) => ({
      id: criterion.localId,
      description: criterion.description,
      severity: criterion.severity,
      evidenceRequired: criterion.evidenceRequired,
    })),
    dependencies: [],
    budget: draftTask.budget,
    retryPolicy: draftTask.retryPolicy,
    permissionRequest: draftTask.permissionHints,
    assumptions: draftTask.assumptions,
    nonGoals: draftTask.nonGoals,
  };
  target
    .prepare(
      `INSERT INTO task
    (id,corporation_id,plan_id,title,objective,kind,priority,risk_level,status,
     contract_json,attempt,max_attempts,weight,version,created_at,updated_at)
    VALUES (?,?,?,?,?,?,?,?, 'DRAFT', ?,0,?,1,1,?,?)`,
    )
    .run(
      ids.task,
      ids.corporation,
      ids.plan,
      draftTask.title,
      draftTask.objective,
      draftTask.kind,
      draftTask.priority,
      draftTask.riskLevel,
      JSON.stringify(contract),
      draftTask.retryPolicy.maxAttempts,
      now,
      now,
    );
}

function activateTeam() {
  repository.activate({
    request: activationRequest(),
    requestHash: "a".repeat(64),
    activationId: ids.activation,
    agentInstanceIds: [id("10"), id("11"), id("12")],
    activatedAt: now,
  });
}

function activationRequest() {
  return {
    schemaVersion: "1.0" as const,
    commandId: ids.activationCommand,
    corporationId: ids.corporation,
    organizationId: ids.organization,
    expectedOrganizationVersion: 1,
    routes: {
      planner: {
        providerId: ids.provider,
        providerVersion: 1,
        modelId: "model-planner",
      },
      executor: {
        providerId: ids.provider,
        providerVersion: 1,
        modelId: "model-executor",
      },
      judge: {
        providerId: ids.provider,
        providerVersion: 1,
        modelId: "model-judge",
      },
    },
    acceptDegradedGaps: false,
  };
}

function seed(target: DatabaseSync) {
  target
    .prepare(
      `INSERT INTO workspace (id,name,display_path,canonical_root_path,platform,permission_mode,access_status,path_identity_json,created_at,updated_at) VALUES (?,'M3-TU-02','E:\\m3-tu-02','\\\\?\\E:\\m3-tu-02','windows','READ_WRITE','AVAILABLE','{}',?,?)`,
    )
    .run(ids.workspace, now, now);
  target
    .prepare(
      "INSERT INTO corporation (id,workspace_id,name,status,version,created_at,updated_at) VALUES (?,?,'Activation','DRAFT',1,?,?)",
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
    .prepare("UPDATE corporation SET active_goal_version=1 WHERE id=?")
    .run(ids.corporation);
  target
    .prepare(
      "UPDATE goal_contract_version SET status='APPROVED', approved_at=? WHERE corporation_id=? AND version=1",
    )
    .run(now, ids.corporation);
  target
    .prepare(
      "INSERT INTO key_vault_entry (id,ciphertext,nonce,auth_tag,encryption_version,version,created_at,updated_at) VALUES (?,x'01',zeroblob(12),zeroblob(16),1,1,?,?)",
    )
    .run(id("30"), now, now);
  target
    .prepare(
      "INSERT INTO provider (id,type,name,endpoint,key_vault_entry_id,config_json,config_status,version,created_at,updated_at,api_dialect,selected_model_id,generation_timeout_ms) VALUES (?,'OPENAI_COMPATIBLE','Verified','https://example.test',?,'{}','ENABLED',1,?,?,'CHAT_COMPLETIONS','default-model',60000)",
    )
    .run(ids.provider, id("30"), now, now);
  target
    .prepare(
      "INSERT INTO provider_connection_test (provider_id,provider_version,status,models_json,tested_at) VALUES (?,1,'VERIFIED',?,?)",
    )
    .run(
      ids.provider,
      JSON.stringify(
        ["model-planner", "model-executor", "model-judge"].map((model) => ({
          id: model,
          displayName: model,
          source: "PROVIDER",
          observedAt: now,
        })),
      ),
      now,
    );
  const plan = buildProposal.plan(ids, now);
  target
    .prepare(
      `INSERT INTO task_plan (id,corporation_id,goal_version,version,status,validation_status,summary,draft_json,provider_id,provider_version,model_id,created_by_operation_id,validation_report_json,validator_version,validated_draft_hash,validated_at,supersedes_plan_id,approved_at,created_at) VALUES (?,?,1,1,'APPROVED','VALID',?,?,?,1,'model-planner',?,?,'1.0',?,?,NULL,?,?)`,
    )
    .run(
      ids.plan,
      ids.corporation,
      plan.summary,
      JSON.stringify(plan),
      ids.provider,
      id("31"),
      JSON.stringify(plan.validationReport),
      "e".repeat(64),
      now,
      now,
      now,
    );
  new OrganizationProposalRepository(target).save({
    commandId: ids.proposalCommand,
    requestHash: "f".repeat(64),
    proposal: buildProposal(ids, ids.organization, 1, now),
  });
}
