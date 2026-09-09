import { describe, expect, it } from "vitest";
import type { ProviderErrorCode } from "@ai-corporation/protocols";
import { providerErrorMessage } from "./provider-settings-view-model";

describe("模型服务商设置的恢复提示", () => {
  it.each<[ProviderErrorCode, RegExp]>([
    ["INVALID_REQUEST", /检查.+重试/u],
    ["UNAUTHORIZED_CALLER", /没有.+权限/u],
    ["NOT_FOUND", /重新加载/u],
    ["CONFLICT", /重新加载后再保存/u],
    ["IDEMPOTENCY_CONFLICT", /已被其他修改使用/u],
    ["VAULT_KEY_UNAVAILABLE", /API Key 修改没有保存/u],
    ["VAULT_INTEGRITY_FAILED", /删除后重新输入/u],
    ["STORAGE_UNAVAILABLE", /输入的内容仍然保留/u],
    ["INTERNAL", /不能确认 API Key 修改成功/u],
  ])("把 %s 映射为固定且可操作的中文提示", (code, expected) => {
    expect(providerErrorMessage(code)).toMatch(expected);
  });
});
