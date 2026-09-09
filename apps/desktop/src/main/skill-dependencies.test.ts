import { describe, expect, it } from "vitest";
import {
  resolveSkillDependencies,
  SkillDependencyError,
} from "./skill-dependencies";
import type { SkillScriptInspection } from "./skill-library";

describe("standard Skill dependency declarations", () => {
  it("reads package.json and merges structured JavaScript packages", () => {
    const result = resolveSkillDependencies(
      inspection({
        runtime: "JAVASCRIPT",
        packageJson: JSON.stringify({
          type: "module",
          dependencies: { lodash: "^4.17.21" },
          optionalDependencies: { kleur: "4.1.5" },
        }),
      }),
      [{ ecosystem: "JAVASCRIPT", name: "zod", version: "^4.0.0" }],
    );

    expect(result.packageJsonType).toBe("module");
    expect(result.javascript).toEqual([
      { ecosystem: "JAVASCRIPT", name: "kleur", version: "4.1.5" },
      { ecosystem: "JAVASCRIPT", name: "lodash", version: "^4.17.21" },
      { ecosystem: "JAVASCRIPT", name: "zod", version: "^4.0.0" },
    ]);
  });

  it("reads PEP 723 and requirements.txt into one concrete Python version", () => {
    const result = resolveSkillDependencies(
      inspection({
        runtime: "PYTHON",
        requirements: "rich==13.9.4\n# comment\n",
        scriptContent: `# /// script
# requires-python = ">=3.11,<3.13"
# dependencies = ["httpx>=0.27", "rich==13.9.4"]
# ///
print("ok")
`,
      }),
    );

    expect(result.pythonRequest).toBe("3.12");
    expect(result.python).toEqual([
      { ecosystem: "PYTHON", name: "httpx", version: ">=0.27" },
      { ecosystem: "PYTHON", name: "rich", version: "==13.9.4" },
    ]);
  });

  it("keeps structured system packages separate", () => {
    const result = resolveSkillDependencies(inspection(), [
      {
        ecosystem: "SYSTEM",
        installId: "Git.Git",
        name: "git",
      },
    ]);

    expect(result.system).toEqual([
      { ecosystem: "SYSTEM", installId: "Git.Git", name: "git" },
    ]);
  });

  it.each([
    { ecosystem: "PYTHON", name: "https://evil.invalid/a" },
    { ecosystem: "JAVASCRIPT", name: "pkg;whoami" },
    { ecosystem: "SYSTEM", name: "git", installId: "--silent" },
  ] as const)("rejects command, URL and option injection: %j", (dependency) => {
    expect(() => resolveSkillDependencies(inspection(), [dependency])).toThrow(
      SkillDependencyError,
    );
  });

  it("rejects local, URL and package-manager requirements", () => {
    for (const requirements of [
      "-r other.txt",
      "git+https://example.invalid/repo",
      "local/package.whl",
    ]) {
      expect(() =>
        resolveSkillDependencies(
          inspection({ runtime: "PYTHON", requirements }),
        ),
      ).toThrow(SkillDependencyError);
    }
  });
});

function inspection(
  overrides: Partial<SkillScriptInspection> = {},
): SkillScriptInspection {
  return {
    digest: "a".repeat(64),
    metadata: {},
    relativePath: "scripts/run.js",
    runtime: "JAVASCRIPT",
    scriptContent: "console.log('ok');",
    skillName: "test-skill",
    ...overrides,
  };
}
