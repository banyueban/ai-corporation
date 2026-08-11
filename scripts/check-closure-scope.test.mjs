import assert from "node:assert/strict";
import test from "node:test";
import {
  classifyClosureScope,
  parseCurrentTask,
  parseTaskUnitCompleted,
} from "./check-closure-scope.mjs";

const status = (state) => `| 当前任务单元 | M3-TU-01（${state}） |`;
const contract = (state) => `| 状态 | ${state} |`;

test("parses task and contract completion", () => {
  assert.deepEqual(parseCurrentTask(status("完成")), {
    id: "M3-TU-01",
    completed: true,
  });
  assert.equal(parseTaskUnitCompleted(contract("完成")), true);
});

test("accepts a pure completion evidence commit", () => {
  const result = classifyClosureScope({
    changedFiles: [
      "PROJECT_STATUS.md",
      "docs/06-engineering/task-units/M3-TU-01-example.md",
      "docs/06-engineering/evidence/M3-TU-01.json",
    ],
    currentContract: contract("完成"),
    currentStatus: status("完成"),
    parentContract: contract("进行中"),
    parentStatus: status("进行中"),
  });
  assert.equal(result.kind, "closure");
});

test("rejects source changes hidden in a completion commit", () => {
  const result = classifyClosureScope({
    changedFiles: [
      "PROJECT_STATUS.md",
      "docs/06-engineering/task-units/M3-TU-01-example.md",
      "apps/desktop/src/main/index.ts",
    ],
    currentContract: contract("完成"),
    currentStatus: status("完成"),
    parentContract: contract("进行中"),
    parentStatus: status("进行中"),
  });
  assert.equal(result.kind, "invalid");
});

test("requires full CI when no task is being completed", () => {
  const result = classifyClosureScope({
    changedFiles: ["docs/06-engineering/Acceptance-Standard.md"],
    currentContract: contract("完成"),
    currentStatus: status("完成"),
    parentContract: contract("完成"),
    parentStatus: status("完成"),
  });
  assert.equal(result.kind, "full");
});
