import { spawnSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import {
  access,
  chmod,
  cp,
  mkdir,
  readFile,
  readdir,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import extractZip from "extract-zip";
import { x as extractTar } from "tar";

const UV_VERSION = "0.11.15";
const NPM_VERSION = "11.6.2";
const TARGETS = {
  "darwin-arm64": {
    asset: "uv-aarch64-apple-darwin.tar.gz",
    sha256: "7e5b336108f8576eda1939920ca0a805b4a9a3c3d3eb2f6140e38b7092fbe4f3",
  },
  "darwin-x64": {
    asset: "uv-x86_64-apple-darwin.tar.gz",
    sha256: "42bca7cc879d117ed7139a0e26de8cab0b6f033ad439a32144f324d1f8580d8c",
  },
  "win32-x64": {
    asset: "uv-x86_64-pc-windows-msvc.zip",
    sha256: "04b98d414a9000e25e5e0e7c9f53749e66b790cdaffc582829e6f58c544ee11c",
  },
};

const desktopDirectory = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const runtimeDirectory = path.join(desktopDirectory, "build", "runtime");
const targetName = `${process.platform}-${process.arch}`;
const target = TARGETS[targetName];
if (target === undefined) {
  throw new Error(`Unsupported Skill runtime target: ${targetName}`);
}
const uvName = process.platform === "win32" ? "uv.exe" : "uv";
const manifest = {
  schemaVersion: 1,
  target: targetName,
  uv: {
    asset: target.asset,
    sha256: target.sha256,
    source: `https://github.com/astral-sh/uv/releases/tag/${UV_VERSION}`,
    version: UV_VERSION,
  },
  npm: {
    source: `https://registry.npmjs.org/npm/-/npm-${NPM_VERSION}.tgz`,
    version: NPM_VERSION,
  },
};

if (await currentRuntimeIsValid(manifest)) {
  console.log(`Skill runtime is ready for ${targetName}`);
  process.exit(0);
}

const staging = path.join(
  desktopDirectory,
  "build",
  `.skill-runtime-${randomUUID()}`,
);
await mkdir(staging, { recursive: true });
try {
  const archive = path.join(staging, target.asset);
  const archiveBytes = await download(
    `https://github.com/astral-sh/uv/releases/download/${UV_VERSION}/${target.asset}`,
  );
  const digest = createHash("sha256").update(archiveBytes).digest("hex");
  if (digest !== target.sha256) {
    throw new Error(
      `uv archive checksum mismatch: expected ${target.sha256}, got ${digest}`,
    );
  }
  await writeFile(archive, archiveBytes);
  const extracted = path.join(staging, "extracted");
  await mkdir(extracted, { recursive: true });
  if (target.asset.endsWith(".zip")) {
    await extractZip(archive, { dir: extracted });
  } else {
    await extractTar({ cwd: extracted, file: archive, gzip: true });
  }
  const extractedUv = await findNamedFile(extracted, uvName);
  if (extractedUv === undefined) {
    throw new Error(`uv executable not found in ${target.asset}`);
  }

  const prepared = path.join(staging, "prepared");
  const preparedUvDirectory = path.join(prepared, "uv", targetName);
  await mkdir(preparedUvDirectory, { recursive: true });
  await cp(extractedUv, path.join(preparedUvDirectory, uvName));
  if (process.platform !== "win32") {
    await chmod(path.join(preparedUvDirectory, uvName), 0o755);
  }

  const require = createRequire(import.meta.url);
  const npmPackage = path.dirname(require.resolve("npm/package.json"));
  const installedNpm = JSON.parse(
    await readFile(path.join(npmPackage, "package.json"), "utf8"),
  );
  if (installedNpm.version !== NPM_VERSION) {
    throw new Error(
      `npm package version mismatch: expected ${NPM_VERSION}, got ${installedNpm.version}`,
    );
  }
  // npm 自带其运行依赖；复制完整包，确保最终安装包不依赖用户的 Node/npm。
  await cp(npmPackage, path.join(prepared, "npm"), {
    dereference: true,
    recursive: true,
  });
  await writeFile(
    path.join(prepared, "manifest.json"),
    `${JSON.stringify(manifest, undefined, 2)}\n`,
    "utf8",
  );

  await verifyPreparedRuntime(prepared, targetName);
  await rm(runtimeDirectory, { force: true, recursive: true });
  await rename(prepared, runtimeDirectory);
  console.log(`Prepared Skill runtime for ${targetName}`);
} finally {
  await rm(staging, { force: true, recursive: true });
}

async function currentRuntimeIsValid(expectedManifest) {
  try {
    const current = JSON.parse(
      await readFile(path.join(runtimeDirectory, "manifest.json"), "utf8"),
    );
    if (JSON.stringify(current) !== JSON.stringify(expectedManifest)) {
      return false;
    }
    await verifyPreparedRuntime(runtimeDirectory, targetName);
    return true;
  } catch {
    return false;
  }
}

async function verifyPreparedRuntime(directory, platformTarget) {
  const uv = path.join(directory, "uv", platformTarget, uvName);
  const npmCli = path.join(directory, "npm", "bin", "npm-cli.js");
  await Promise.all([access(uv), access(npmCli)]);
  const uvResult = spawnSync(uv, ["--version"], {
    encoding: "utf8",
    shell: false,
    windowsHide: true,
  });
  if (uvResult.status !== 0 || !uvResult.stdout.includes(UV_VERSION)) {
    throw new Error(`Prepared uv did not report version ${UV_VERSION}`);
  }
  const npmResult = spawnSync(process.execPath, [npmCli, "--version"], {
    encoding: "utf8",
    env: { ...process.env, NODE_OPTIONS: "" },
    shell: false,
    windowsHide: true,
  });
  if (npmResult.status !== 0 || npmResult.stdout.trim() !== NPM_VERSION) {
    throw new Error(`Prepared npm did not report version ${NPM_VERSION}`);
  }
}

async function download(url) {
  let lastError;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const response = await fetch(url, { redirect: "follow" });
      if (!response.ok) {
        throw new Error(`download returned HTTP ${response.status}`);
      }
      return Buffer.from(await response.arrayBuffer());
    } catch (error) {
      lastError = error;
      if (attempt < 3) {
        await new Promise((resolve) => setTimeout(resolve, attempt * 500));
      }
    }
  }
  throw new Error(`Failed to download ${url}: ${String(lastError)}`);
}

async function findNamedFile(directory, name) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const candidate = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      const nested = await findNamedFile(candidate, name);
      if (nested !== undefined) return nested;
    } else if (entry.isFile() && entry.name === name) {
      return candidate;
    }
  }
  return undefined;
}
