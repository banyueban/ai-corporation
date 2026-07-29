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

test("rejects advancing past a milestone with incomplete acceptance", () => {
  const errors = checkProjectStatusStructure(`
| 当前阶段 | Milestone 0 已完成 |
| 当前 Milestone | Milestone 1：本地项目骨架 |

## 3. Milestone 0 实施状态

- [x] Windows/macOS 构建；
- [ ] Windows/macOS 打包产物启动与 Rust health E2E；
`);

  assert.equal(errors.length, 1);
});

test("requires packaged health evidence in Milestone 0 status", () => {
  const errors = checkProjectStatusStructure(`
| 当前阶段 | Milestone 0 验收中 |
| 当前 Milestone | Milestone 0：工程基线 |

## 3. Milestone 0 实施状态

- [x] Windows/macOS 构建；
`);

  assert.equal(errors.length, 1);
});

test("allows closing Milestone 0 when packaged health is complete", () => {
  const errors = checkProjectStatusStructure(`
| 当前阶段 | Milestone 0 已完成 |
| 当前 Milestone | Milestone 1：本地项目骨架 |

## 3. Milestone 0 实施状态

- [x] Windows/macOS 构建；
- [x] Windows/macOS 打包产物启动与 Rust health E2E；
`);

  assert.deepEqual(errors, []);
});
