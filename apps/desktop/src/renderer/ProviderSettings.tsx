import type {
  NormalizedUsage,
  ProviderConnectionTestSnapshot,
  ProviderErrorCode,
  ProviderFailureReason,
  ProviderGenerationTestSnapshot,
  ProviderPublic,
} from "@ai-corporation/protocols";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { providerErrorMessage } from "./provider-settings-view-model";
import { formatUiTime, internalLabel } from "./ui-labels";
import { createUuidV7 } from "./uuid-v7";

type FormState = {
  readonly name: string;
  readonly endpoint: string;
  readonly key: string;
  readonly configStatus: "ENABLED" | "DISABLED";
  readonly selectedModelId: string;
  readonly generationTimeoutSeconds: string;
};

const emptyForm: FormState = {
  name: "",
  endpoint: "https://api.openai.com/v1",
  key: "",
  configStatus: "ENABLED",
  selectedModelId: "",
  generationTimeoutSeconds: "60",
};

export function ProviderSettings() {
  const [providers, setProviders] = useState<readonly ProviderPublic[]>([]);
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<ProviderErrorCode>();
  const [status, setStatus] = useState("");
  const [editing, setEditing] = useState<ProviderPublic>();
  const [form, setForm] = useState<FormState>(emptyForm);
  const [showKey, setShowKey] = useState(false);
  const [activeTestRequestId, setActiveTestRequestId] = useState<string>();
  const [connectionError, setConnectionError] = useState<string>();
  const [endpointError, setEndpointError] = useState<string>();
  const [showConnectionDiagnostic, setShowConnectionDiagnostic] =
    useState(false);
  const [activeGenerationRequestId, setActiveGenerationRequestId] =
    useState<string>();
  const [generationError, setGenerationError] = useState<string>();
  const [showGenerationDiagnostic, setShowGenerationDiagnostic] =
    useState(false);
  const headingRef = useRef<HTMLHeadingElement>(null);

  const load = async () => {
    setLoading(true);
    setError(undefined);
    try {
      const result = await window.desktop.provider.list({ schemaVersion: 1 });
      if (!result.ok) {
        setError(result.error.code);
        return;
      }
      setProviders(result.value);
    } catch {
      setError("STORAGE_UNAVAILABLE");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    headingRef.current?.focus();
  }, []);

  const startCreate = () => {
    setEditing(undefined);
    setForm(emptyForm);
    setShowKey(false);
    setError(undefined);
    setStatus("");
    setConnectionError(undefined);
    setShowConnectionDiagnostic(false);
    setEndpointError(undefined);
    setGenerationError(undefined);
    setShowGenerationDiagnostic(false);
  };

  const startEdit = (provider: ProviderPublic) => {
    setEditing(provider);
    setForm({
      name: provider.name,
      endpoint: provider.endpoint,
      key: "",
      configStatus: provider.configStatus,
      selectedModelId: provider.selectedModelId ?? "",
      generationTimeoutSeconds: String(
        (provider.generationTimeoutMs ?? 60_000) / 1_000,
      ),
    });
    setShowKey(false);
    setError(undefined);
    setStatus("");
    setConnectionError(undefined);
    setShowConnectionDiagnostic(false);
    setEndpointError(undefined);
    setGenerationError(undefined);
    setShowGenerationDiagnostic(false);
  };

  const testConnection = async () => {
    if (editing === undefined || activeTestRequestId !== undefined) return;
    const requestId = createUuidV7();
    setActiveTestRequestId(requestId);
    setConnectionError(undefined);
    setShowConnectionDiagnostic(false);
    setStatus("正在测试已保存的 API 基础 URL 和 API Key…");
    const diagnosticTimer = window.setTimeout(
      () => setShowConnectionDiagnostic(true),
      10_000,
    );
    try {
      const result = await window.desktop.provider.testConnection({
        schemaVersion: 1,
        requestId,
        providerId: editing.id,
        expectedVersion: editing.version,
      });
      if (!result.ok) {
        if (result.error.code === "CANCELLED") {
          setStatus("连接测试已取消，上一次结果保持不变。");
        } else {
          setConnectionError(connectionOperationMessage(result.error.code));
          setStatus("");
        }
        return;
      }
      const updated = { ...editing, connectionTest: result.value };
      setEditing(updated);
      setProviders((current) => replaceProvider(current, updated));
      setStatus(
        result.value.status === "VERIFIED"
          ? `连接已验证，找到 ${result.value.models.length} 个模型。`
          : connectionFailureMessage(result.value.failure.reason),
      );
    } catch {
      setConnectionError("连接测试未能完成，请在设置页面重试。");
      setStatus("");
    } finally {
      window.clearTimeout(diagnosticTimer);
      setActiveTestRequestId(undefined);
      setShowConnectionDiagnostic(false);
    }
  };

  const cancelConnectionTest = async () => {
    if (activeTestRequestId === undefined) return;
    try {
      const result = await window.desktop.provider.cancelConnectionTest({
        schemaVersion: 1,
        requestId: activeTestRequestId,
      });
      if (!result.ok && result.error.code !== "NOT_FOUND") {
        setConnectionError("无法确认连接测试已经取消。");
      }
    } catch {
      setConnectionError("无法确认连接测试已经取消。");
    }
  };

  const testGeneration = async () => {
    if (editing === undefined || activeGenerationRequestId !== undefined)
      return;
    const requestId = createUuidV7();
    setActiveGenerationRequestId(requestId);
    setGenerationError(undefined);
    setShowGenerationDiagnostic(false);
    setStatus(
      `正在使用 ${editing.selectedModelId ?? "所选模型"} 进行低风险生成测试…`,
    );
    const diagnosticTimer = window.setTimeout(
      () => setShowGenerationDiagnostic(true),
      10_000,
    );
    try {
      const result = await window.desktop.provider.testGeneration({
        schemaVersion: 1,
        requestId,
        providerId: editing.id,
        expectedVersion: editing.version,
        input: [
          {
            actor: "USER",
            parts: [
              {
                kind: "TEXT",
                text: "Return a short acknowledgement that the Provider generation test succeeded.",
              },
            ],
          },
        ],
        maxOutputTokens: 32,
        temperature: 0,
      });
      if (!result.ok) {
        if (result.error.code === "CANCELLED") {
          setStatus("生成测试已取消，上一次结果保持不变。");
        } else {
          setGenerationError(generationOperationMessage(result.error.code));
          setStatus("");
        }
        return;
      }
      const updated = { ...editing, generationTest: result.value };
      setEditing(updated);
      setProviders((current) => replaceProvider(current, updated));
      setStatus(
        result.value.status === "SUCCEEDED"
          ? "生成测试成功，已保存统一格式的用量数据。"
          : generationFailureMessage(result.value.failure.reason),
      );
    } catch {
      setGenerationError("生成测试未能安全完成，请在设置页面重试。");
      setStatus("");
    } finally {
      window.clearTimeout(diagnosticTimer);
      setActiveGenerationRequestId(undefined);
      setShowGenerationDiagnostic(false);
    }
  };

  const cancelGenerationTest = async () => {
    if (activeGenerationRequestId === undefined) return;
    try {
      const result = await window.desktop.provider.cancelGenerationTest({
        schemaVersion: 1,
        requestId: activeGenerationRequestId,
      });
      if (!result.ok && result.error.code !== "NOT_FOUND") {
        setGenerationError("无法确认生成测试已经取消。");
      }
    } catch {
      setGenerationError("无法确认生成测试已经取消。");
    }
  };

  const update = (field: keyof FormState, value: string) => {
    setForm((current) => ({ ...current, [field]: value }));
    setError(undefined);
    setStatus("");
    setGenerationError(undefined);
    if (field === "endpoint") setEndpointError(undefined);
  };

  const save = async (event: FormEvent) => {
    event.preventDefault();
    const endpointValidationError = validateProviderEndpointForUi(
      form.endpoint,
    );
    if (endpointValidationError !== undefined) {
      setEndpointError(endpointValidationError);
      return;
    }
    setPending(true);
    setError(undefined);
    setStatus("");
    try {
      const result = await window.desktop.provider.save({
        schemaVersion: 1,
        commandId: createUuidV7(),
        ...(editing === undefined
          ? {}
          : { providerId: editing.id, expectedVersion: editing.version }),
        name: form.name,
        endpoint: form.endpoint,
        configStatus: form.configStatus,
        apiDialect: "CHAT_COMPLETIONS",
        selectedModelId:
          form.selectedModelId.length === 0 ? null : form.selectedModelId,
        generationTimeoutMs: Number(form.generationTimeoutSeconds) * 1_000,
        ...(form.key.length === 0 ? {} : { key: form.key }),
      });
      if (!result.ok) {
        setError(result.error.code);
        return;
      }
      setProviders((current) => replaceProvider(current, result.value));
      setEditing(result.value);
      setForm((current) => ({
        ...current,
        key: "",
        selectedModelId: result.value.selectedModelId ?? "",
        generationTimeoutSeconds: String(
          (result.value.generationTimeoutMs ?? 60_000) / 1_000,
        ),
      }));
      setShowKey(false);
      setStatus(
        editing === undefined ? "模型服务商已保存。" : "模型服务商已更新。",
      );
    } catch {
      setError("STORAGE_UNAVAILABLE");
    } finally {
      setPending(false);
    }
  };

  const toggleReveal = async () => {
    if (showKey) {
      setShowKey(false);
      return;
    }
    if (form.key.length > 0 || editing?.hasKey !== true) {
      setShowKey(true);
      return;
    }
    setPending(true);
    setError(undefined);
    try {
      const result = await window.desktop.provider.revealKey({
        schemaVersion: 1,
        providerId: editing.id,
      });
      if (!result.ok) {
        setError(result.error.code);
        return;
      }
      setForm((current) => ({ ...current, key: result.value.key }));
      setShowKey(true);
      setStatus("API Key 只在当前页面临时显示。");
    } catch {
      setError("STORAGE_UNAVAILABLE");
    } finally {
      setPending(false);
    }
  };

  const deleteKey = async () => {
    if (
      editing === undefined ||
      !editing.hasKey ||
      !window.confirm(
        `要删除“${editing.name}”已保存的 API Key 吗？模型服务商配置会继续保留。`,
      )
    ) {
      return;
    }
    setPending(true);
    setError(undefined);
    try {
      const result = await window.desktop.provider.deleteKey({
        schemaVersion: 1,
        commandId: createUuidV7(),
        providerId: editing.id,
        expectedVersion: editing.version,
      });
      if (!result.ok) {
        setError(result.error.code);
        return;
      }
      setProviders((current) => replaceProvider(current, result.value));
      setEditing(result.value);
      setForm((current) => ({ ...current, key: "" }));
      setShowKey(false);
      setStatus(
        "已删除保存的 API Key。保存新的 API Key 前，软件不会调用该模型服务商。",
      );
    } catch {
      setError("STORAGE_UNAVAILABLE");
    } finally {
      setPending(false);
    }
  };

  return (
    <section aria-labelledby="provider-settings-title">
      <header className="page-header page-header--create">
        <div>
          <p className="eyebrow">设置 / 模型服务商</p>
          <h1 id="provider-settings-title" ref={headingRef} tabIndex={-1}>
            模型服务商凭据
          </h1>
          <p>
            API Key 由 AI Corporation Desktop 加密，并保存在本地 SQLite
            数据库中。 本地加密密钥由本软件管理，不使用操作系统安全存储。
          </p>
        </div>
        <button
          className="secondary-button"
          onClick={startCreate}
          type="button"
        >
          + 添加模型服务商
        </button>
      </header>

      {loading ? (
        <div aria-label="正在加载模型服务商" className="skeleton-card" />
      ) : (
        <div className="provider-settings-grid">
          <aside
            aria-label="已保存的模型服务商"
            className="provider-list-panel"
          >
            <h2>模型服务商</h2>
            {providers.length === 0 ? (
              <p className="provider-empty">还没有保存模型服务商。</p>
            ) : (
              <ul>
                {providers.map((provider) => (
                  <li key={provider.id}>
                    <button
                      aria-current={
                        editing?.id === provider.id ? "true" : undefined
                      }
                      className="provider-list-button"
                      onClick={() => startEdit(provider)}
                      type="button"
                    >
                      <strong>{provider.name}</strong>
                      <span>
                        {provider.hasKey ? "API Key 已保存" : "需要 API Key"}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </aside>

          <form className="provider-form" onSubmit={save}>
            <div>
              <p className="eyebrow">
                {editing === undefined ? "新建模型服务商" : "编辑模型服务商"}
              </p>
              <h2>{editing?.name ?? "兼容 OpenAI API 的模型服务商"}</h2>
            </div>

            {error !== undefined && (
              <div className="provider-error" role="alert">
                <strong>模型服务商修改未完成。</strong>
                <p>{providerErrorMessage(error)}</p>
              </div>
            )}

            {connectionError !== undefined && (
              <div className="provider-error" role="alert">
                <strong>连接测试未完成。</strong>
                <p>{connectionError}</p>
              </div>
            )}

            {generationError !== undefined && (
              <div className="provider-error" role="alert">
                <strong>生成测试未完成。</strong>
                <p>{generationError}</p>
              </div>
            )}

            <label className="field">
              <span>名称</span>
              <input
                autoComplete="off"
                maxLength={200}
                onChange={(event) => update("name", event.target.value)}
                required
                value={form.name}
              />
            </label>
            <label className="field">
              <span>API 基础 URL</span>
              <input
                aria-describedby={
                  endpointError === undefined
                    ? undefined
                    : "provider-endpoint-error"
                }
                aria-invalid={endpointError === undefined ? undefined : true}
                autoComplete="url"
                maxLength={2_048}
                onChange={(event) => update("endpoint", event.target.value)}
                onBlur={() =>
                  setEndpointError(validateProviderEndpointForUi(form.endpoint))
                }
                required
                type="url"
                value={form.endpoint}
              />
              {endpointError !== undefined && (
                <small id="provider-endpoint-error" role="alert">
                  {endpointError}
                </small>
              )}
            </label>
            <label className="field">
              <span>状态</span>
              <select
                onChange={(event) => update("configStatus", event.target.value)}
                value={form.configStatus}
              >
                <option value="ENABLED">已启用</option>
                <option value="DISABLED">已停用</option>
              </select>
            </label>
            <label className="field">
              <span>模型</span>
              <select
                disabled={editing?.connectionTest?.status !== "VERIFIED"}
                onChange={(event) =>
                  update("selectedModelId", event.target.value)
                }
                value={form.selectedModelId}
              >
                <option value="">选择已验证的模型</option>
                {editing?.connectionTest?.status === "VERIFIED" &&
                  editing.connectionTest.models.map((model) => (
                    <option key={model.id} value={model.id}>
                      {model.id}
                    </option>
                  ))}
              </select>
              <small>
                只能选择当前已验证连接返回的模型。软件绝不会擅自替换成其他模型。
              </small>
            </label>
            <label className="field">
              <span>生成超时（秒）</span>
              <input
                inputMode="numeric"
                max={300}
                min={5}
                onChange={(event) =>
                  update("generationTimeoutSeconds", event.target.value)
                }
                required
                step={1}
                type="number"
                value={form.generationTimeoutSeconds}
              />
              <small>可设置 5–300 秒，默认 60 秒。</small>
            </label>
            <div className="field">
              <label htmlFor="provider-api-key">API Key</label>
              <div className="secret-input-row">
                <input
                  aria-describedby="key-storage-note"
                  autoComplete="off"
                  id="provider-api-key"
                  onChange={(event) => update("key", event.target.value)}
                  placeholder={
                    editing?.hasKey === true
                      ? "留空则不修改已保存的 API Key"
                      : "输入 API Key"
                  }
                  required={editing === undefined || editing.hasKey === false}
                  type={showKey ? "text" : "password"}
                  value={form.key}
                />
                <button
                  aria-pressed={showKey}
                  className="secondary-button"
                  disabled={
                    pending ||
                    (editing?.hasKey !== true && form.key.length === 0)
                  }
                  onClick={() => void toggleReveal()}
                  type="button"
                >
                  {showKey ? "隐藏" : "查看"}
                </button>
              </div>
              <small id="key-storage-note">
                API Key
                默认隐藏。只有你主动点击“查看”后才显示已保存的明文；离开本页面后会再次隐藏。
              </small>
            </div>

            <div className="provider-form-actions">
              <button
                className="primary-button"
                disabled={pending}
                type="submit"
              >
                {pending
                  ? "正在保存…"
                  : editing === undefined
                    ? "保存模型服务商"
                    : "保存修改"}
              </button>
              {editing?.hasKey === true && (
                <button
                  className="danger-button"
                  disabled={pending}
                  onClick={() => void deleteKey()}
                  type="button"
                >
                  删除已保存的 API Key
                </button>
              )}
            </div>
            {editing !== undefined && (
              <>
                <ConnectionTestPanel
                  diagnostic={showConnectionDiagnostic}
                  onCancel={() => void cancelConnectionTest()}
                  onTest={() => void testConnection()}
                  snapshot={editing.connectionTest ?? { status: "UNVERIFIED" }}
                  testing={activeTestRequestId !== undefined}
                  testDisabled={
                    pending ||
                    !editing.hasKey ||
                    activeTestRequestId !== undefined ||
                    activeGenerationRequestId !== undefined
                  }
                />
                <GenerationTestPanel
                  diagnostic={showGenerationDiagnostic}
                  onCancel={() => void cancelGenerationTest()}
                  onTest={() => void testGeneration()}
                  snapshot={editing.generationTest ?? { status: "IDLE" }}
                  testDisabled={
                    pending ||
                    activeTestRequestId !== undefined ||
                    activeGenerationRequestId !== undefined ||
                    editing.configStatus !== "ENABLED" ||
                    editing.connectionTest?.status !== "VERIFIED" ||
                    editing.selectedModelId === undefined
                  }
                  testing={activeGenerationRequestId !== undefined}
                  timeoutSeconds={
                    (editing.generationTimeoutMs ?? 60_000) / 1_000
                  }
                />
              </>
            )}
            <p aria-live="polite" className="provider-status" role="status">
              {status}
            </p>
          </form>
        </div>
      )}
    </section>
  );
}

function ConnectionTestPanel(props: {
  readonly diagnostic: boolean;
  readonly onCancel: () => void;
  readonly onTest: () => void;
  readonly snapshot: ProviderConnectionTestSnapshot;
  readonly testDisabled: boolean;
  readonly testing: boolean;
}) {
  return (
    <section
      aria-labelledby="provider-connection-title"
      className="provider-connection-panel"
    >
      <div>
        <p className="eyebrow">连接测试</p>
        <h3 id="provider-connection-title">
          {props.testing ? "正在测试" : connectionLabel(props.snapshot)}
        </h3>
      </div>
      {props.testing ? (
        <>
          <p>软件正在检查已保存的 API 基础 URL、API Key 和模型列表。</p>
          {props.diagnostic && (
            <p role="status">
              已经超过 10 秒。请求会在 15 秒后超时；你现在可以取消。
            </p>
          )}
          <button
            className="secondary-button"
            onClick={props.onCancel}
            type="button"
          >
            取消测试
          </button>
        </>
      ) : (
        <>
          <ConnectionSnapshot snapshot={props.snapshot} />
          <button
            className="secondary-button"
            disabled={props.testDisabled}
            onClick={props.onTest}
            type="button"
          >
            测试连接
          </button>
        </>
      )}
    </section>
  );
}

function ConnectionSnapshot(props: {
  readonly snapshot: ProviderConnectionTestSnapshot;
}) {
  if (props.snapshot.status === "UNVERIFIED") {
    return (
      <p>尚未验证。请先保存 API Key，再进行测试，然后才能使用该模型服务商。</p>
    );
  }
  if (props.snapshot.status === "FAILED") {
    return (
      <p>
        {connectionFailureMessage(props.snapshot.failure.reason)} 测试时间：{" "}
        {formatTestTime(props.snapshot.testedAt)}.
      </p>
    );
  }
  return (
    <div>
      <p>
        已于 {formatTestTime(props.snapshot.testedAt)} 验证，找到{" "}
        {props.snapshot.models.length} 个模型。
      </p>
      {props.snapshot.models.length > 0 && (
        <ul className="provider-model-list">
          {props.snapshot.models.map((model) => (
            <li key={model.id}>{model.id}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

function GenerationTestPanel(props: {
  readonly diagnostic: boolean;
  readonly onCancel: () => void;
  readonly onTest: () => void;
  readonly snapshot: ProviderGenerationTestSnapshot;
  readonly testDisabled: boolean;
  readonly testing: boolean;
  readonly timeoutSeconds: number;
}) {
  return (
    <section
      aria-labelledby="provider-generation-title"
      className="provider-generation-panel"
    >
      <div>
        <p className="eyebrow">生成测试</p>
        <h3 id="provider-generation-title">
          {props.testing ? "正在生成" : generationLabel(props.snapshot)}
        </h3>
      </div>
      {props.testing ? (
        <>
          <p>
            软件正在使用已保存的模型服务商和准确模型发送固定的、非敏感的非流式测试。
          </p>
          {props.diagnostic && (
            <p role="status">
              已经超过 10 秒。当前超时设置为
              {` ${props.timeoutSeconds} 秒`}；你现在可以取消。
            </p>
          )}
          <button
            className="secondary-button"
            onClick={props.onCancel}
            type="button"
          >
            取消生成
          </button>
        </>
      ) : (
        <>
          <GenerationSnapshot
            snapshot={props.snapshot}
            timeoutSeconds={props.timeoutSeconds}
          />
          <button
            className="secondary-button"
            disabled={props.testDisabled}
            onClick={props.onTest}
            type="button"
          >
            测试生成
          </button>
        </>
      )}
    </section>
  );
}

function GenerationSnapshot(props: {
  readonly snapshot: ProviderGenerationTestSnapshot;
  readonly timeoutSeconds: number;
}) {
  if (props.snapshot.status === "IDLE") {
    return <p>测试生成前，请先选择并保存一个已验证的模型。</p>;
  }
  if (props.snapshot.status === "FAILED") {
    return (
      <p>
        {generationFailureMessage(
          props.snapshot.failure.reason,
          props.timeoutSeconds,
        )}{" "}
        完成时间：{formatTestTime(props.snapshot.completedAt)}。
      </p>
    );
  }
  return (
    <div className="provider-generation-result">
      <p>
        已于 {formatTestTime(props.snapshot.completedAt)} 使用{" "}
        {props.snapshot.modelId} 完成。停止原因：
        {internalLabel(props.snapshot.stopReason)}。
      </p>
      <blockquote>{props.snapshot.outputPreview}</blockquote>
      <p>{formatUsage(props.snapshot.usage)} 费用未知。</p>
    </div>
  );
}

export function generationLabel(
  snapshot: ProviderGenerationTestSnapshot,
): string {
  if (snapshot.status === "SUCCEEDED") return "生成成功";
  if (snapshot.status === "FAILED") return "生成失败";
  return "尚未测试";
}

export function generationFailureMessage(
  reason: ProviderFailureReason,
  timeoutSeconds = 60,
): string {
  if (reason === "MODEL_NOT_FOUND") {
    return "准确选择的模型不可用。请重新测试连接，并从返回列表中选择模型。";
  }
  if (reason === "CONTENT_FILTER") {
    return "模型服务商根据其内容政策拦截了固定测试，没有保存输出。";
  }
  if (reason === "TIMEOUT") {
    return `模型服务商在 ${timeoutSeconds} 秒内没有响应。请检查网络后重试。`;
  }
  return connectionFailureMessage(reason);
}

export function generationOperationMessage(code: string): string {
  const messages: Record<string, string> = {
    NOT_FOUND: "模型服务商已不存在，请重新加载设置页面。",
    CONFLICT: "生成期间模型服务商配置发生变化，请重新加载并测试当前版本。",
    MISSING_KEY: "没有可用的 API Key，请保存后再生成。",
    DISABLED: "该模型服务商已停用，请启用并保存后再生成。",
    UNVERIFIED: "当前模型服务商配置尚未验证，请先测试连接。",
    MODEL_NOT_SELECTED: "尚未选择模型，请选择并保存一个准确的已验证模型。",
    MODEL_STALE: "所选模型已不在验证列表中，请重新测试并选择。",
    ALREADY_GENERATING: "该生成请求已经在运行。",
    VAULT_KEY_UNAVAILABLE:
      "软件自管的本地加密密钥不可用。请恢复它，或替换模型服务商的 API Key。",
    VAULT_INTEGRITY_FAILED: "无法验证已保存的 API Key。请删除后重新输入。",
    STORAGE_UNAVAILABLE: "无法保存生成结果，系统没有记录成功，请重试。",
  };
  return messages[code] ?? "生成测试未能安全完成，请在设置页面重试。";
}

function formatUsage(usage: NormalizedUsage): string {
  const values = [
    `输入 ${usage.inputTokens ?? "未知"}`,
    `输出 ${usage.outputTokens ?? "未知"}`,
    ...(usage.cachedInputTokens === undefined
      ? []
      : [`缓存输入 ${usage.cachedInputTokens}`]),
    ...(usage.reasoningTokens === undefined
      ? []
      : [`推理 ${usage.reasoningTokens}`]),
  ];
  return `${values.join(" · ")} 个 token。`;
}

export function connectionLabel(
  snapshot: ProviderConnectionTestSnapshot,
): string {
  if (snapshot.status === "VERIFIED") return "已验证";
  if (snapshot.status === "FAILED") return "测试失败";
  return "尚未验证";
}

export function connectionFailureMessage(
  reason: ProviderFailureReason,
): string {
  const messages: Record<ProviderFailureReason, string> = {
    AUTHENTICATION: "身份验证失败。请检查已保存的 API Key，然后重新测试。",
    PERMISSION: "API Key 没有读取模型列表的权限，请检查模型服务商权限。",
    RATE_LIMIT: "模型服务商限制了请求频率，请稍后重试。",
    QUOTA_EXHAUSTED: "模型服务商额度已用完，请增加额度或使用其他模型服务商。",
    INVALID_REQUEST: "API 基础 URL 或请求无效，请检查 API 基础 URL。",
    MODEL_NOT_FOUND: "请求的模型不可用，请选择其他模型。",
    CONTENT_FILTER: "模型服务商根据其内容政策拒绝了请求。",
    TIMEOUT: "模型服务商在 15 秒内没有响应，请检查网络后重试。",
    NETWORK: "无法连接模型服务商，请检查网络和 API 基础 URL。",
    PROVIDER_INTERNAL:
      "模型服务商返回了无效响应或内部错误，请重试或检查 API 基础 URL。",
    CANCELLED: "连接测试已取消，上一次结果保持不变。",
  };
  return messages[reason];
}

export function connectionOperationMessage(code: string): string {
  const messages: Record<string, string> = {
    NOT_FOUND: "模型服务商已不存在，请重新加载设置页面。",
    CONFLICT: "测试期间模型服务商配置发生变化，请重新加载并测试当前版本。",
    MISSING_KEY: "没有可用的 API Key，请保存后再测试。",
    ALREADY_TESTING: "该连接测试已经在运行。",
    VAULT_KEY_UNAVAILABLE:
      "软件自管的本地加密密钥不可用。请恢复它，或替换模型服务商的 API Key。",
    VAULT_INTEGRITY_FAILED: "无法验证已保存的 API Key。请删除后重新输入。",
    STORAGE_UNAVAILABLE: "无法保存连接结果，系统没有记录成功，请重试。",
  };
  return messages[code] ?? "连接测试未能安全完成，请在设置页面重试。";
}

export function validateProviderEndpointForUi(
  endpoint: string,
): string | undefined {
  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    return "请输入有效的 HTTP(S) API 基础 URL。";
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return "只支持 HTTP(S) API 基础 URL。";
  }
  if (
    url.username !== "" ||
    url.password !== "" ||
    url.search !== "" ||
    url.hash !== ""
  ) {
    return "请删除 URL 中的凭据、查询参数和片段。";
  }
  if (
    url.protocol === "http:" &&
    !/^http:\/\/(?:localhost|127\.0\.0\.1|\[::1\])(?::\d+)?(?:\/|$)/iu.test(
      endpoint,
    )
  ) {
    return "远程 API 基础 URL 必须使用 HTTPS；只有准确的本机回环地址可以使用 HTTP。";
  }
  return undefined;
}

function formatTestTime(value: string): string {
  return formatUiTime(value);
}

function replaceProvider(
  providers: readonly ProviderPublic[],
  replacement: ProviderPublic,
): readonly ProviderPublic[] {
  const existing = providers.findIndex(({ id }) => id === replacement.id);
  if (existing < 0) return [...providers, replacement];
  return providers.map((provider) =>
    provider.id === replacement.id ? replacement : provider,
  );
}
