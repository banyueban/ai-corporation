import assert from "node:assert/strict";
import test from "node:test";
import { checkProjectStatusStructure } from "./check-project-status.mjs";

test("rejects a completed item in a not-started section", () => {
  const errors = checkProjectStatusStructure(`
## 尚未开始

- [x] 已完成但位置错误
`);

  assert.equal(errors.length, 1);
});

test("allows incomplete items in a not-started section", () => {
  const errors = checkProjectStatusStructure(`
## 尚未开始

- [ ] 后续任务
`);

  assert.deepEqual(errors, []);
});

test("stops checking at the next peer section", () => {
  const errors = checkProjectStatusStructure(`
## 尚未开始

- [ ] 后续任务

## 已完成

- [x] 已完成任务
`);

  assert.deepEqual(errors, []);
});
