import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

const excludedDirectories = new Set([
  ".git",
  ".pnpm-store",
  "build",
  "dist",
  "node_modules",
  "release",
  "target",
  "test-results",
]);
const excludedFiles = new Set(["pnpm-lock.yaml"]);
const patterns = [
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/u,
  /\bghp_[A-Za-z0-9]{20,}\b/u,
  /\bgithub_pat_[A-Za-z0-9_]{20,}\b/u,
  /\bAKIA[0-9A-Z]{16}\b/u,
];
const matches = [];

function scan(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (entry.isDirectory() && excludedDirectories.has(entry.name)) {
      continue;
    }
    if (entry.isFile() && excludedFiles.has(entry.name)) {
      continue;
    }

    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      scan(entryPath);
      continue;
    }
    if (!entry.isFile()) {
      continue;
    }

    let content;
    try {
      content = readFileSync(entryPath, "utf8");
    } catch {
      continue;
    }

    for (const pattern of patterns) {
      if (pattern.test(content)) {
        matches.push(entryPath);
        break;
      }
    }
  }
}

scan(".");

if (matches.length > 0) {
  console.error("Secret scan failed:");
  for (const match of matches) {
    console.error(`- ${match}`);
  }
  process.exitCode = 1;
} else {
  console.log("Secret scan passed");
}
