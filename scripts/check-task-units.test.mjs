import assert from "node:assert/strict";
import test from "node:test";
import {
  checkCurrentTaskUnitReference,
  checkTaskUnitCollection,
  checkTaskUnitDocument,
} from "./check-task-units.mjs";

function taskUnit({
  id = "M1-TU-01",
  status = "就绪",
  acceptance = "[ ] 通过",
} = {}) {
  return `# ${id} 示例

| 属性 | 内容 |
|---|---|
| 任务单元 ID | ${id} |
| 状态 | ${status} |
| 所属 Milestone | Milestone 1 |
| 主要结果 | 独立结果 |
| 基线提交 | \`abc1234\` |

## 1. 需求与设计引用
内容
## 2. 前置条件
内容
## 3. 包含范围
内容
## 4. 非范围
内容
## 5. 依赖与接口
内容
## 6. 交付物与所有权
内容
## 7. 验收合同
- ${acceptance}
## 8. 隔离与干扰控制
内容
## 9. 证据计划
内容
## 10. 完成规则
内容
`;
}

test("accepts a ready task unit with a complete contract", () => {
  const result = checkTaskUnitDocument(
    taskUnit(),
    "M1-TU-01-workspace-boundary.md",
  );
  assert.deepEqual(result.errors, []);
});

test("rejects a completed task unit with unchecked acceptance", () => {
  const result = checkTaskUnitDocument(
    taskUnit({ status: "完成" }),
    "M1-TU-01-example.md",
  );
  assert.equal(result.errors.length, 1);
});

test("rejects unresolved placeholders after a task becomes ready", () => {
  const result = checkTaskUnitDocument(
    `${taskUnit()}\nTBD`,
    "M1-TU-01-example.md",
  );
  assert.equal(result.errors.length, 1);
});

test("rejects duplicate task unit IDs", () => {
  const errors = checkTaskUnitCollection([
    { fileName: "M1-TU-01-first.md", markdown: taskUnit() },
    { fileName: "M1-TU-01-second.md", markdown: taskUnit() },
  ]);
  assert.equal(errors.length, 1);
});

test("accepts a project status reference matching the task contract", () => {
  const errors = checkCurrentTaskUnitReference(
    "| 当前任务单元 | M1-TU-01（就绪，尚未实施） |",
    [{ fileName: "M1-TU-01-example.md", markdown: taskUnit() }],
  );
  assert.deepEqual(errors, []);
});

test("rejects a project status state that differs from the task contract", () => {
  const errors = checkCurrentTaskUnitReference(
    "| 当前任务单元 | M1-TU-01（完成） |",
    [{ fileName: "M1-TU-01-example.md", markdown: taskUnit() }],
  );
  assert.equal(errors.length, 1);
});
