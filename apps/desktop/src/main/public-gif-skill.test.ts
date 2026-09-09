import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, readdir, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { resolveSkillDependencies } from "./skill-dependencies";
import { SkillLibrary } from "./skill-library";

interface PublicSkillSource {
  readonly commit: string;
  readonly files: readonly {
    readonly path: string;
    readonly sha256: string;
    readonly sizeBytes: number;
  }[];
  readonly license: string;
  readonly repository: string;
  readonly skillPath: string;
}

const fixtureRoot = path.resolve(
  __dirname,
  "../../test-fixtures/public-skills/slack-gif-creator",
);
const sourceFile = path.resolve(
  __dirname,
  "../../test-fixtures/public-skills/slack-gif-creator.source.json",
);

describe("M13 fixed public slack-gif-creator snapshot", () => {
  const temporaryRoots: string[] = [];

  afterEach(async () => {
    await Promise.all(
      temporaryRoots
        .splice(0)
        .map((root) => rm(root, { recursive: true, force: true })),
    );
  });

  it("matches the pinned public commit file for file", async () => {
    const source = JSON.parse(
      await readFile(sourceFile, "utf8"),
    ) as PublicSkillSource;
    expect(source).toMatchObject({
      commit: "3b3fad96af16a10759d930941b4520ba0c40edae",
      license: "Apache-2.0",
      repository: "https://github.com/anthropics/skills",
      skillPath: "skills/slack-gif-creator",
    });
    const actualPaths = await listFiles(fixtureRoot);
    expect(actualPaths).toEqual(source.files.map(({ path }) => path).sort());
    for (const expected of source.files) {
      const bytes = await readFile(
        path.join(fixtureRoot, ...expected.path.split("/")),
      );
      expect(bytes.byteLength, expected.path).toBe(expected.sizeBytes);
      expect(
        createHash("sha256").update(bytes).digest("hex"),
        expected.path,
      ).toBe(expected.sha256);
    }
  });

  it("imports unchanged without scripts and exposes its four Python dependencies", async () => {
    const root = path.join(
      os.tmpdir(),
      `M13-TU-01-public-skill-${randomUUID()}`,
    );
    temporaryRoots.push(root);
    await mkdir(root, { recursive: true });
    const library = new SkillLibrary(root);
    const preview = await library.previewImport(fixtureRoot);
    expect(preview).toMatchObject({
      name: "slack-gif-creator",
      license: "Complete terms in LICENSE.txt",
    });
    await library.confirmImport(fixtureRoot, preview.digest);

    const resources = await library.listResources("slack-gif-creator");
    expect(resources.some(({ kind }) => kind === "SCRIPT")).toBe(false);
    const inspection = await library.inspectWorkspacePython(
      "slack-gif-creator",
      "make-slack-gif.py",
      "from core.gif_builder import GIFBuilder\n",
    );
    expect(inspection.runtime).toBe("PYTHON");
    expect(
      resolveSkillDependencies(inspection).python.map(
        ({ name, version }) => `${name}${version ?? ""}`,
      ),
    ).toEqual([
      "imageio>=2.31.0",
      "imageio-ffmpeg>=0.4.9",
      "numpy>=1.24.0",
      "pillow>=10.0.0",
    ]);
  });
});

async function listFiles(root: string, prefix = ""): Promise<string[]> {
  const entries = await readdir(path.join(root, prefix), {
    withFileTypes: true,
  });
  const files: string[] = [];
  for (const entry of entries) {
    const relativePath = prefix === "" ? entry.name : `${prefix}/${entry.name}`;
    if (entry.isDirectory())
      files.push(...(await listFiles(root, relativePath)));
    else if (entry.isFile()) files.push(relativePath);
  }
  return files.sort();
}
