import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { PiEmployee, ProviderPublic } from "@ai-corporation/protocols";
import { afterEach, describe, expect, it, vi } from "vitest";
import { handlePiEmployeeList, handlePiEmployeeSave } from "./pi-employee-ipc";
import { PiEmployeeService } from "./pi-employee-service";
import { SkillLibrary } from "./skill-library";

const provider: ProviderPublic = {
  schemaVersion: 1,
  id: "019b7f4d-a310-7000-8000-000000000001",
  type: "OPENAI_COMPATIBLE",
  name: "员工测试 Provider",
  endpoint: "https://api.example.test/v1",
  configStatus: "ENABLED",
  hasKey: true,
  version: 3,
  createdAt: "2026-08-23T00:00:00.000Z",
  updatedAt: "2026-08-23T00:00:00.000Z",
  connectionTest: {
    status: "VERIFIED",
    providerVersion: 3,
    testedAt: "2026-08-23T00:00:00.000Z",
    models: [
      {
        id: "fixture-model",
        displayName: "fixture-model",
        source: "PROVIDER",
        observedAt: "2026-08-23T00:00:00.000Z",
      },
    ],
  },
};

describe("PiEmployeeService", () => {
  const roots: string[] = [];

  afterEach(async () => {
    await Promise.all(
      roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
    );
  });

  it("saves multiple assigned Skills in the user's chosen order", async () => {
    const library = await createSkillLibrary(roots);
    const save = vi.fn((input): PiEmployee => ({
      schemaVersion: 2,
      id: input.id,
      name: input.name,
      providerId: input.providerId,
      providerVersion: input.providerVersion,
      modelId: input.modelId,
      skillNames: [...input.skillNames],
      createdAt: input.now,
      updatedAt: input.now,
    }));
    const service = new PiEmployeeService({
      repository: { get: () => undefined, list: () => [], save },
      listProviders: () => [provider],
      skillLibrary: library,
      createId: () => "019b7f4d-a310-7000-8000-000000000002",
      clock: () => "2026-08-23T01:00:00.000Z",
    });

    const result = await service.save({
      schemaVersion: 2,
      commandId: "019b7f4d-a310-7000-8000-000000000003",
      name: "多技能员工",
      providerId: provider.id,
      expectedProviderVersion: provider.version,
      modelId: "fixture-model",
      skillNames: ["template-skill", "text-organize"],
    });

    expect(result).toMatchObject({
      ok: true,
      value: { skillNames: ["template-skill", "text-organize"] },
    });
    expect(save).toHaveBeenCalledWith(
      expect.objectContaining({
        skillNames: ["template-skill", "text-organize"],
      }),
    );
  });

  it("rejects the whole save when any assigned Skill is unavailable", async () => {
    const library = await createSkillLibrary(roots);
    const save = vi.fn();
    const service = new PiEmployeeService({
      repository: { get: () => undefined, list: () => [], save },
      listProviders: () => [provider],
      skillLibrary: library,
    });

    const result = await service.save({
      schemaVersion: 2,
      commandId: "019b7f4d-a310-7000-8000-000000000004",
      name: "无效员工",
      providerId: provider.id,
      expectedProviderVersion: provider.version,
      modelId: "fixture-model",
      skillNames: ["text-organize", "missing-skill"],
    });

    expect(result).toMatchObject({
      ok: false,
      error: { code: "SKILL_NOT_FOUND" },
    });
    expect(save).not.toHaveBeenCalled();
  });

  it("keeps the IPC contract strict for multi-Skill employees", async () => {
    const service = {
      list: vi.fn(() => ({ ok: true as const, value: [] })),
      save: vi.fn(async () => ({
        ok: false as const,
        error: {
          code: "SKILL_NOT_FOUND" as const,
          message: "员工操作失败" as const,
        },
      })),
    } as unknown as PiEmployeeService;

    expect(handlePiEmployeeList(true, { schemaVersion: 2 }, service).ok).toBe(
      true,
    );
    expect(
      handlePiEmployeeList(true, { schemaVersion: 1 }, service),
    ).toMatchObject({ ok: false, error: { code: "INVALID_REQUEST" } });
    const duplicate = await handlePiEmployeeSave(
      true,
      {
        schemaVersion: 2,
        commandId: "019b7f4d-a310-7000-8000-000000000005",
        name: "重复技能员工",
        providerId: provider.id,
        expectedProviderVersion: provider.version,
        modelId: "fixture-model",
        skillNames: ["text-organize", "text-organize"],
      },
      service,
    );
    expect(duplicate).toMatchObject({
      ok: false,
      error: { code: "INVALID_REQUEST" },
    });
    expect(service.save).not.toHaveBeenCalled();
  });
});

async function createSkillLibrary(roots: string[]): Promise<SkillLibrary> {
  const root = await mkdtemp(path.join(tmpdir(), "M12-TU-01-employee-"));
  roots.push(root);
  const library = new SkillLibrary(path.join(root, "managed"));
  for (const [name, description] of [
    ["text-organize", "整理文字"],
    ["template-skill", "处理模板"],
  ] as const) {
    // 每个来源目录都与标准 name 一致，测试只关注员工的多选保存规则。
    const source = path.join(root, name);
    await mkdir(source, { recursive: true });
    await writeFile(
      path.join(source, "SKILL.md"),
      `---\nname: ${name}\ndescription: ${description}\n---\n按说明工作。\n`,
      "utf8",
    );
    const preview = await library.previewImport(source);
    await library.confirmImport(source, preview.digest);
  }
  return library;
}
