import { describe, expect, it } from "vitest";
import { internalLabel, timelineLabel } from "./ui-labels";

describe("中文界面标签", () => {
  it("把项目自定义状态显示为中文", () => {
    expect(internalLabel("APPROVED")).toBe("已批准");
    expect(internalLabel("PLAN_SAVED")).toBe("计划草稿已保存");
    expect(internalLabel("READ_WRITE")).toBe("可读写");
  });

  it("保留没有中文映射的外部值", () => {
    expect(internalLabel("deepseek-v4-flash")).toBe("deepseek-v4-flash");
  });

  it("按事件类型显示中文时间线", () => {
    expect(timelineLabel("goal.contract.approved")).toBe("目标合同已批准。");
  });
});
