import { describe, expect, it } from "vitest";
import {
  agentRunErrorLabel,
  internalLabel,
  planValidationFindingLabel,
  timelineLabel,
} from "./ui-labels";

describe("中文界面标签", () => {
  it("把项目自定义状态显示为中文", () => {
    expect(internalLabel("APPROVED")).toBe("已批准");
    expect(internalLabel("PLAN_SAVED")).toBe("计划草稿已保存");
    expect(internalLabel("READ_WRITE")).toBe("可读写");
    expect(internalLabel("VALIDATED")).toBe("已验证");
    expect(internalLabel("INVALID")).toBe("验证未通过");
  });

  it("把计划验证问题显示为中文", () => {
    expect(planValidationFindingLabel("CYCLE_DETECTED")).toBe(
      "任务之间形成循环依赖",
    );
    expect(planValidationFindingLabel("UNKNOWN_FUTURE_CODE")).toBe(
      "未知的计划验证问题",
    );
  });

  it("保留没有中文映射的外部值", () => {
    expect(internalLabel("deepseek-v4-flash")).toBe("deepseek-v4-flash");
  });

  it("按事件类型显示中文时间线", () => {
    expect(timelineLabel("goal.contract.approved")).toBe("目标合同已批准。");
  });

  it("把运行错误解释成用户能直接处理的中文", () => {
    expect(agentRunErrorLabel("RUN_CHANGED")).toBe(
      "运行记录已经变化，请刷新后再试。",
    );
    expect(agentRunErrorLabel("TASK_INPUT_UNSUPPORTED")).toContain(
      "当前版本还不能处理",
    );
    expect(agentRunErrorLabel("FUTURE_ERROR")).toContain("FUTURE_ERROR");
  });
});
