import { execFileSync } from "node:child_process";
import { appendFileSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const STATUS_PATH = "PROJECT_STATUS.md";
const TASK_UNIT_PREFIX = "docs/06-engineering/task-units/";
const EVIDENCE_PREFIX = "docs/06-engineering/evidence/";

export function parseCurrentTask(markdown) {
  const match = /^\|\s*当前任务单元\s*\|\s*(M\d+-TU-\d+)（([^）]+)）/mu.exec(
    markdown,
  );
  if (match === null) return undefined;
  return { id: match[1], completed: match[2].includes("完成") };
}

export function parseTaskUnitCompleted(markdown) {
  const match = /^\|\s*状态\s*\|\s*([^|]+)\|/mu.exec(markdown);
  return match?.[1].trim() === "完成";
}

export function classifyClosureScope({
  changedFiles,
  currentContract,
  currentStatus,
  parentContract,
  parentStatus,
}) {
  const currentTask = parseCurrentTask(currentStatus);
  const parentTask = parseCurrentTask(parentStatus);
  const isCompletionTransition =
    currentTask !== undefined &&
    parentTask !== undefined &&
    currentTask.id === parentTask.id &&
    currentTask.completed &&
    !parentTask.completed &&
    parseTaskUnitCompleted(currentContract) &&
    !parseTaskUnitCompleted(parentContract);

  if (!isCompletionTransition) {
    return { kind: "full", reason: "not a task completion transition" };
  }

  const contractPrefix = `${TASK_UNIT_PREFIX}${currentTask.id}-`;
  const contractPaths = changedFiles.filter((file) =>
    file.startsWith(contractPrefix),
  );
  if (contractPaths.length !== 1) {
    return {
      kind: "invalid",
      reason: `completion must change exactly one ${currentTask.id} contract`,
    };
  }

  const allowed = new Set([STATUS_PATH, contractPaths[0]]);
  const forbidden = changedFiles.filter(
    (file) => !allowed.has(file) && !file.startsWith(EVIDENCE_PREFIX),
  );
  if (forbidden.length > 0) {
    return {
      kind: "invalid",
      reason: `completion commit contains non-evidence changes: ${forbidden.join(", ")}`,
    };
  }

  return {
    kind: "closure",
    reason: `pure ${currentTask.id} completion evidence update`,
  };
}

function git(...args) {
  return execFileSync("git", args, { encoding: "utf8" }).trim();
}

function writeOutput(name, value) {
  if (process.env.GITHUB_OUTPUT !== undefined) {
    appendFileSync(process.env.GITHUB_OUTPUT, `${name}=${value}\n`, "utf8");
  }
}

async function parentHasSuccessfulCi(parentSha) {
  const repository = process.env.GITHUB_REPOSITORY;
  const token = process.env.GITHUB_TOKEN;
  if (repository === undefined || token === undefined) return false;

  const response = await fetch(
    `https://api.github.com/repos/${repository}/actions/runs?head_sha=${parentSha}&per_page=100`,
    {
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${token}`,
        "X-GitHub-Api-Version": "2022-11-28",
      },
    },
  );
  if (!response.ok) {
    throw new Error(
      `GitHub Actions lookup failed with HTTP ${response.status}`,
    );
  }
  const body = await response.json();
  return body.workflow_runs.some(
    (run) => run.name === "CI" && run.conclusion === "success",
  );
}

async function run() {
  if (process.env.AI_CORPORATION_ALLOW_CLOSURE_REUSE !== "true") {
    writeOutput("full_ci", "true");
    writeOutput("closure_only", "false");
    console.log(
      "Full CI required: closure reuse is not enabled for this event",
    );
    return;
  }

  const parentSha = git("rev-parse", "HEAD^");
  const currentStatus = readFileSync(resolve(STATUS_PATH), "utf8");
  const parentStatus = git("show", `HEAD^:${STATUS_PATH}`);
  const currentTask = parseCurrentTask(currentStatus);
  const changedFiles = git("diff", "--name-only", "HEAD^", "HEAD")
    .split(/\r?\n/u)
    .filter(Boolean);
  const contractPath = changedFiles.find((file) =>
    file.startsWith(`${TASK_UNIT_PREFIX}${currentTask?.id ?? "missing"}-`),
  );
  const currentContract =
    contractPath === undefined
      ? ""
      : readFileSync(resolve(contractPath), "utf8");
  const parentContract =
    contractPath === undefined ? "" : git("show", `HEAD^:${contractPath}`);
  const result = classifyClosureScope({
    changedFiles,
    currentContract,
    currentStatus,
    parentContract,
    parentStatus,
  });

  if (result.kind === "invalid") {
    throw new Error(`Invalid completion commit: ${result.reason}`);
  }
  if (result.kind !== "closure") {
    writeOutput("full_ci", "true");
    writeOutput("closure_only", "false");
    console.log(`Full CI required: ${result.reason}`);
    return;
  }
  if (!(await parentHasSuccessfulCi(parentSha))) {
    throw new Error(
      `Completion commit cannot reuse evidence: parent ${parentSha} has no successful CI run`,
    );
  }

  writeOutput("full_ci", "false");
  writeOutput("closure_only", "true");
  console.log(`Full CI evidence reused from ${parentSha}: ${result.reason}`);
}

const entryPath = process.argv[1];
if (
  entryPath !== undefined &&
  import.meta.url === pathToFileURL(resolve(entryPath)).href
) {
  await run();
}
