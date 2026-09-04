import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { CommandResult } from "./command-runner";
import {
  SkillEnvironmentError,
  SkillEnvironmentManager,
  type SkillEnvironmentRequest,
} from "./skill-environment";
import { SkillLibrary } from "./skill-library";

describe("standard Skill script environments", () => {
  let root: string;
  let sourceRoot: string;
  let managedRoot: string;
  let environmentRoot: string;
  let workspaceRoot: string;
  let library: SkillLibrary;

  beforeEach(async () => {
    root = path.join(os.tmpdir(), `M12-TU-02-environment-${randomUUID()}`);
    sourceRoot = path.join(root, "source");
    managedRoot = path.join(root, "managed-skills");
    environmentRoot = path.join(root, "environments");
    workspaceRoot = path.join(root, "workspace");
    await Promise.all([
      mkdir(sourceRoot, { recursive: true }),
      mkdir(workspaceRoot, { recursive: true }),
    ]);
    library = new SkillLibrary(managedRoot);
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it("runs a JavaScript script from a reusable managed copy", async () => {
    await importSkill(library, sourceRoot, "script-worker", {
      "references/guide.txt": "来自 Skill 参考资料",
      "scripts/create.cjs": [
        'const fs = require("node:fs");',
        'const path = require("node:path");',
        "const output = process.argv[2];",
        'const guide = fs.readFileSync(path.join("references", "guide.txt"), "utf8");',
        'fs.writeFileSync(output, guide, "utf8");',
        "console.log(`created:${output}`);",
        'console.error("checked");',
        "",
      ].join("\n"),
    });
    const manager = createManager(library, environmentRoot);
    const request = skillRequest(
      workspaceRoot,
      "script-worker",
      "scripts/create.cjs",
    );

    const first = await manager.check(request);
    expect(first).toMatchObject({
      status: "READY",
      environment: { reused: false, runtime: "JAVASCRIPT" },
    });
    await expect(manager.check(request)).resolves.toMatchObject({
      status: "READY",
      environment: { reused: true },
    });

    const updates: string[] = [];
    const result = await manager.runScript(request, {
      args: ["{{workspace}}/result.txt"],
      onUpdate: ({ text }) => updates.push(text),
    });
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("<当前工作区>");
    expect(result.stdout).not.toContain(workspaceRoot);
    expect(result.stderr).toContain("checked");
    expect(updates.join("")).not.toContain(environmentRoot);
    await expect(
      readFile(path.join(workspaceRoot, "result.txt"), "utf8"),
    ).resolves.toBe("来自 Skill 参考资料");
  });

  it("rejects absolute and parent-directory arguments before starting a script", async () => {
    await importSkill(library, sourceRoot, "safe-arguments", {
      "scripts/run.js": "console.log('should-not-run');",
    });
    const manager = createManager(library, environmentRoot);
    const request = skillRequest(
      workspaceRoot,
      "safe-arguments",
      "scripts/run.js",
    );
    await manager.check(request);

    await expect(
      manager.runScript(request, { args: [path.join(root, "outside.txt")] }),
    ).rejects.toBeInstanceOf(SkillEnvironmentError);
    await expect(
      manager.runScript(request, { args: ["../outside.txt"] }),
    ).rejects.toBeInstanceOf(SkillEnvironmentError);
  });

  it("prepares a private Python runtime only after an installation plan", async () => {
    await importSkill(library, sourceRoot, "python-worker", {
      "scripts/run.py": "print('python-ok')\n",
    });
    const calls: Array<{
      readonly args: readonly string[];
      readonly executable: string;
    }> = [];
    const runner = async (input: {
      readonly args: readonly string[];
      readonly executable: string;
    }): Promise<CommandResult> => {
      calls.push({ args: input.args, executable: input.executable });
      if (input.args[0] === "venv") {
        const venv = input.args.at(-1) ?? "";
        const executable =
          process.platform === "win32"
            ? path.join(venv, "Scripts", "python.exe")
            : path.join(venv, "bin", "python");
        await mkdir(path.dirname(executable), { recursive: true });
        await writeFile(executable, "fixture", "utf8");
      }
      return commandResult(input.args[0] === "-c" ? "3.12\n" : "python-ok\n");
    };
    const manager = createManager(library, environmentRoot, { runner });
    const request = skillRequest(
      workspaceRoot,
      "python-worker",
      "scripts/run.py",
    );

    const check = await manager.check(request);
    expect(check).toMatchObject({
      status: "INSTALL_REQUIRED",
      plan: {
        kind: "ENVIRONMENT",
        network: true,
        systemImpact: expect.stringContaining("不修改系统 PATH"),
      },
    });
    if (check.status !== "INSTALL_REQUIRED")
      throw new Error("missing fixture plan");
    await expect(manager.install(check.plan.id)).resolves.toMatchObject({
      exitCode: 0,
    });
    await expect(manager.check(request)).resolves.toMatchObject({
      status: "READY",
      environment: { runtime: "PYTHON" },
    });
    await expect(
      manager.runScript(request, { args: [] }),
    ).resolves.toMatchObject({
      exitCode: 0,
      stdout: "python-ok\n",
    });
    expect(calls.some(({ args }) => args[0] === "venv")).toBe(true);

    const [environmentDirectory] = await readdir(
      path.join(environmentRoot, "skills"),
    );
    const manifest = await readFile(
      path.join(
        environmentRoot,
        "skills",
        environmentDirectory ?? "",
        "ready.json",
      ),
      "utf8",
    );
    expect(manifest).not.toContain(root);
  });

  it("runs a verified Workspace Python script with an unmodified Skill core", async () => {
    await importSkill(library, sourceRoot, "public-gif-tool", {
      "requirements.txt": "pillow>=10.0.0\nimageio>=2.31.0\nnumpy>=1.24.0\n",
      "core/gif_builder.py": "PUBLIC_SKILL_CORE = True\n",
    });
    const scriptContent =
      "from core.gif_builder import PUBLIC_SKILL_CORE\nprint(PUBLIC_SKILL_CORE)\n";
    const scriptSha256 = createHash("sha256")
      .update(scriptContent, "utf8")
      .digest("hex");
    const calls: Array<{
      readonly args: readonly string[];
      readonly cwd: string;
      readonly environment?: Readonly<Record<string, string>>;
    }> = [];
    const manager = createManager(library, environmentRoot, {
      runner: async (input) => {
        calls.push({
          args: input.args,
          cwd: input.cwd,
          ...(input.environment === undefined
            ? {}
            : { environment: input.environment }),
        });
        if (input.args[0] === "venv") {
          const venv = input.args.at(-1) ?? "";
          const executable =
            process.platform === "win32"
              ? path.join(venv, "Scripts", "python.exe")
              : path.join(venv, "bin", "python");
          await mkdir(path.dirname(executable), { recursive: true });
          await writeFile(executable, "fixture", "utf8");
        }
        if (input.args[0] === "-c") return commandResult("3.12\n");
        return commandResult("True\n");
      },
    });
    const request: SkillEnvironmentRequest = {
      scope: "SKILL",
      scriptRelativePath: "make-animation.py",
      scriptSource: "WORKSPACE",
      skillName: "public-gif-tool",
      workspaceRoot,
      workspaceScriptContent: scriptContent,
      workspaceScriptSha256: scriptSha256,
    };

    const check = await manager.check(request);
    expect(check).toMatchObject({
      status: "INSTALL_REQUIRED",
      plan: {
        items: expect.arrayContaining([
          "Python：pillow>=10.0.0",
          "Python：imageio>=2.31.0",
          "Python：numpy>=1.24.0",
        ]),
      },
    });
    if (check.status !== "INSTALL_REQUIRED")
      throw new Error("missing fixture plan");
    await manager.install(check.plan.id);
    const result = await manager.runWorkspaceScript(request, { args: [] });

    expect(result).toMatchObject({ exitCode: 0, stdout: "True\n" });
    const runCall = calls.at(-1);
    expect(runCall?.cwd).toBe(workspaceRoot);
    expect(runCall?.environment?.PYTHONPATH).toContain("skill");
    expect(runCall?.environment?.PYTHONPATH).not.toBe(managedRoot);
    expect(runCall?.environment).toMatchObject({
      PYTHONIOENCODING: "utf-8",
      PYTHONUTF8: "1",
    });
    expect(runCall?.args[0]).not.toContain(workspaceRoot);
    await expect(
      readFile(
        path.join(
          runCall?.environment?.PYTHONPATH ?? "",
          "core",
          "gif_builder.py",
        ),
        "utf8",
      ),
    ).resolves.toBe("PUBLIC_SKILL_CORE = True\n");
    const runRoot = path.join(
      path.dirname(runCall?.environment?.PYTHONPATH ?? ""),
      ".runs",
    );
    await expect(readdir(runRoot)).resolves.toEqual([]);
  });

  it("does not leave READY after a failed private installation", async () => {
    await importSkill(library, sourceRoot, "broken-python", {
      "scripts/run.py": "print('never')\n",
    });
    const manager = createManager(library, environmentRoot, {
      runner: async () => commandResult("", 1),
    });
    const request = skillRequest(
      workspaceRoot,
      "broken-python",
      "scripts/run.py",
    );
    const check = await manager.check(request);
    if (check.status !== "INSTALL_REQUIRED")
      throw new Error("missing fixture plan");

    await expect(manager.install(check.plan.id)).rejects.toBeInstanceOf(
      SkillEnvironmentError,
    );
    await expect(manager.check(request)).resolves.toMatchObject({
      status: "INSTALL_REQUIRED",
    });
  });

  it("uses a separately bound system installation plan and rechecks it", async () => {
    await importSkill(library, sourceRoot, "system-worker", {
      "scripts/run.js": "console.log('ok');",
    });
    const managerName = process.platform === "win32" ? "winget" : "brew";
    let installed = false;
    const manager = createManager(library, environmentRoot, {
      findExecutable: async (name) => {
        if (name === managerName) return path.join(root, managerName);
        if (name === "m12fixture") {
          return installed ? path.join(root, "m12fixture") : undefined;
        }
        return undefined;
      },
      runner: async () => {
        installed = true;
        return commandResult("installed\n");
      },
    });
    const request: SkillEnvironmentRequest = {
      ...skillRequest(workspaceRoot, "system-worker", "scripts/run.js"),
      dependencies: [
        {
          ecosystem: "SYSTEM",
          installId:
            process.platform === "win32" ? "Example.Tool" : "example-tool",
          name: "m12fixture",
        },
      ],
    };

    const check = await manager.check(request);
    expect(check).toMatchObject({
      status: "INSTALL_REQUIRED",
      plan: { kind: "SYSTEM_INSTALL" },
    });
    if (check.status !== "INSTALL_REQUIRED")
      throw new Error("missing fixture plan");
    await manager.install(check.plan.id);
    await expect(manager.install(check.plan.id)).rejects.toThrow(
      "安装计划已失效",
    );
    await expect(manager.check(request)).resolves.toMatchObject({
      status: "READY",
    });
  });

  it("expires an approved plan when the Skill changes before installation", async () => {
    await importSkill(library, sourceRoot, "changing-python", {
      "scripts/run.py": "print('before')",
    });
    let processCalls = 0;
    const manager = createManager(library, environmentRoot, {
      runner: async () => {
        processCalls += 1;
        return commandResult("unexpected\n");
      },
    });
    const request = skillRequest(
      workspaceRoot,
      "changing-python",
      "scripts/run.py",
    );
    const check = await manager.check(request);
    if (check.status !== "INSTALL_REQUIRED")
      throw new Error("missing fixture plan");

    await importSkill(library, sourceRoot, "changing-python", {
      "scripts/run.py": "print('after')",
    });

    await expect(manager.install(check.plan.id)).rejects.toThrow(
      "批准后发生了变化",
    );
    expect(processCalls).toBe(0);
  });

  it("requires a reason and keeps PROJECT environments inside the workspace", async () => {
    await importSkill(library, sourceRoot, "project-worker", {
      "scripts/run.js": "console.log('ok');",
    });
    const manager = createManager(library, environmentRoot);
    const base = skillRequest(
      workspaceRoot,
      "project-worker",
      "scripts/run.js",
    );

    await expect(manager.check({ ...base, scope: "PROJECT" })).rejects.toThrow(
      "说明原因",
    );
    await expect(
      manager.check({
        ...base,
        projectReason: "Skill 明确要求依赖当前项目目录",
        scope: "PROJECT",
      }),
    ).resolves.toMatchObject({ status: "READY" });
    expect(
      await readdir(
        path.join(workspaceRoot, ".ai-corporation", "skill-environments"),
      ),
    ).toHaveLength(1);
  });
});

function createManager(
  library: SkillLibrary,
  rootDirectory: string,
  overrides: Partial<
    ConstructorParameters<typeof SkillEnvironmentManager>[0]
  > = {},
): SkillEnvironmentManager {
  return new SkillEnvironmentManager({
    rootDirectory,
    runtimeDirectory: path.join(rootDirectory, "runtime-fixture"),
    skillLibrary: library,
    ...overrides,
  });
}

function skillRequest(
  workspaceRoot: string,
  skillName: string,
  scriptRelativePath: string,
): SkillEnvironmentRequest {
  return {
    scope: "SKILL",
    scriptRelativePath,
    skillName,
    workspaceRoot,
  };
}

async function importSkill(
  library: SkillLibrary,
  sourceRoot: string,
  name: string,
  files: Readonly<Record<string, string>>,
): Promise<void> {
  const source = path.join(sourceRoot, name);
  await mkdir(source, { recursive: true });
  await writeFile(
    path.join(source, "SKILL.md"),
    `---\nname: ${name}\ndescription: test ${name}\n---\n\n# ${name}\n`,
    "utf8",
  );
  for (const [relativePath, content] of Object.entries(files)) {
    const destination = path.join(source, ...relativePath.split("/"));
    await mkdir(path.dirname(destination), { recursive: true });
    await writeFile(destination, content, "utf8");
  }
  const preview = await library.previewImport(source);
  await library.confirmImport(source, preview.digest);
}

function commandResult(stdout: string, exitCode = 0): CommandResult {
  return {
    command: "fixture",
    durationMs: 1,
    exitCode,
    stderr: "",
    stdout,
    timedOut: false,
    truncated: false,
  };
}
