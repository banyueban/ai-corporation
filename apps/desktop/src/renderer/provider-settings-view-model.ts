import type { ProviderErrorCode } from "@ai-corporation/protocols";

export function providerErrorMessage(code: ProviderErrorCode): string {
  const messages: Record<ProviderErrorCode, string> = {
    INVALID_REQUEST: "请检查名称、API 基础 URL、状态和 API Key，然后重试。",
    UNAUTHORIZED_CALLER: "当前页面没有管理模型服务商凭据的权限。",
    NOT_FOUND: "模型服务商或已保存的 API Key 已不存在，请重新加载列表。",
    CONFLICT: "模型服务商已有更新版本，请重新加载后再保存。",
    IDEMPOTENCY_CONFLICT: "本次操作编号已被其他修改使用，请重新操作。",
    VAULT_KEY_UNAVAILABLE:
      "软件自管的本地加密密钥不可用，本次 API Key 修改没有保存。",
    VAULT_INTEGRITY_FAILED:
      "已保存的 API Key 未通过完整性检查，请删除后重新输入。",
    STORAGE_UNAVAILABLE: "本地数据库不可用，你当前输入的内容仍然保留。",
    INTERNAL: "软件内部发生错误，不能确认 API Key 修改成功。",
  };
  return messages[code];
}
