import type {
  PiEmployee,
  PiSkill,
  PiSkillPreviewImportResult,
  PiTask,
  ProviderPublic,
} from "@ai-corporation/protocols";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { createUuidV7 } from "./uuid-v7";

type Preview = Extract<PiSkillPreviewImportResult, { ok: true }>["value"];

export function EmployeesPage() {
  const [employees, setEmployees] = useState<readonly PiEmployee[]>([]);
  const [skills, setSkills] = useState<readonly PiSkill[]>([]);
  const [providers, setProviders] = useState<readonly ProviderPublic[]>([]);
  const [name, setName] = useState("");
  const [providerId, setProviderId] = useState("");
  const [modelId, setModelId] = useState("");
  const [skillName, setSkillName] = useState("text-organize");
  const [preview, setPreview] = useState<Preview>();
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState("");
  const [taskInput, setTaskInput] = useState("");
  const [changeInput, setChangeInput] = useState("");
  const [currentTask, setCurrentTask] = useState<PiTask>();

  const readyProviders = useMemo(
    () => providers.filter(isReadyProvider),
    [providers],
  );
  const selectedProvider = readyProviders.find(
    (provider) => provider.id === providerId,
  );

  const reload = async () => {
    const [employeeResult, skillResult, providerResult] = await Promise.all([
      window.desktop.piEmployee.list({ schemaVersion: 1 }),
      window.desktop.piSkill.list({ schemaVersion: 1 }),
      window.desktop.provider.list({ schemaVersion: 1 }),
    ]);
    if (employeeResult.ok) {
      setEmployees(employeeResult.value);
      setSelectedEmployeeId(
        (current) => current || employeeResult.value[0]?.id || "",
      );
      const latestEmployee = employeeResult.value[0];
      if (
        latestEmployee !== undefined &&
        window.localStorage.getItem("pi-current-task-id") === null
      ) {
        const latestTask = await window.desktop.piTask.get({
          schemaVersion: 1,
          employeeId: latestEmployee.id,
        });
        if (latestTask.ok) rememberTask(latestTask.value, setCurrentTask);
      }
    }
    if (skillResult.ok) setSkills(skillResult.value);
    if (providerResult.ok) setProviders(providerResult.value);
    if (!employeeResult.ok || !skillResult.ok || !providerResult.ok) {
      setMessage("员工资料加载失败，请重试。");
    }
  };

  useEffect(() => {
    void reload();
    const taskId = window.localStorage.getItem("pi-current-task-id");
    if (taskId !== null) {
      void window.desktop.piTask
        .get({ schemaVersion: 1, taskId })
        .then((result) => {
          if (result.ok) setCurrentTask(result.value);
        });
    }
  }, []);

  useEffect(() => {
    if (currentTask?.status !== "RUNNING") return;
    // 轮询只负责显示已落库的真实事件，界面刷新不会重新调用模型。
    const timer = window.setInterval(async () => {
      const result = await window.desktop.piTask.get({
        schemaVersion: 1,
        taskId: currentTask.id,
      });
      if (result.ok) setCurrentTask(result.value);
    }, 250);
    return () => window.clearInterval(timer);
  }, [currentTask?.id, currentTask?.status]);

  const previewImport = async () => {
    setPending(true);
    setMessage("正在读取技能文件夹。");
    const result = await window.desktop.piSkill.previewImport({
      schemaVersion: 1,
    });
    setPending(false);
    if (!result.ok) {
      setMessage(
        result.error.code === "CANCELLED"
          ? "已取消导入。"
          : `技能无法导入：${skillErrorMessage(result.error.code)}`,
      );
      return;
    }
    setPreview(result.value);
    setMessage("请确认下面的变化，确认前不会覆盖现有技能。");
  };

  const confirmImport = async () => {
    if (preview === undefined) return;
    setPending(true);
    const result = await window.desktop.piSkill.confirmImport({
      schemaVersion: 1,
      previewId: preview.previewId,
    });
    setPending(false);
    setPreview(undefined);
    if (!result.ok) {
      setMessage(`技能更新失败：${skillErrorMessage(result.error.code)}`);
      return;
    }
    setSkillName(result.value.name);
    setMessage(`技能“${result.value.name}”已导入。`);
    await reload();
  };

  const saveEmployee = async (event: FormEvent) => {
    event.preventDefault();
    if (selectedProvider === undefined || modelId === "" || skillName === "") {
      setMessage("请选择可用的 Provider、模型和技能。");
      return;
    }
    setPending(true);
    const result = await window.desktop.piEmployee.save({
      schemaVersion: 1,
      commandId: createUuidV7(),
      name,
      providerId: selectedProvider.id,
      expectedProviderVersion: selectedProvider.version,
      modelId,
      skillName,
    });
    setPending(false);
    if (!result.ok) {
      setMessage(`员工保存失败：${employeeErrorMessage(result.error.code)}`);
      return;
    }
    setName("");
    setSelectedEmployeeId(result.value.id);
    setMessage(`员工“${result.value.name}”已创建，可以接收任务。`);
    await reload();
  };

  const startTask = async (event: FormEvent) => {
    event.preventDefault();
    setPending(true);
    const result = await window.desktop.piTask.start({
      schemaVersion: 1,
      commandId: createUuidV7(),
      employeeId: selectedEmployeeId,
      input: taskInput,
    });
    setPending(false);
    if (!result.ok) {
      setMessage(`任务无法开始：${taskErrorMessage(result.error.code)}`);
      return;
    }
    rememberTask(result.value, setCurrentTask);
    setMessage("任务已开始，模型输入和输出会在下面持续更新。 ");
  };

  const taskCommand = async (
    action: "cancel" | "accept" | "requestChanges",
  ) => {
    if (currentTask === undefined) return;
    const command = {
      schemaVersion: 1 as const,
      commandId: createUuidV7(),
      taskId: currentTask.id,
    };
    const result =
      action === "cancel"
        ? await window.desktop.piTask.cancel(command)
        : action === "accept"
          ? await window.desktop.piTask.accept(command)
          : await window.desktop.piTask.requestChanges({
              ...command,
              input: changeInput,
            });
    if (!result.ok) {
      setMessage(`操作失败：${taskErrorMessage(result.error.code)}`);
      return;
    }
    rememberTask(result.value, setCurrentTask);
    if (action === "requestChanges") setChangeInput("");
  };

  const retryTask = async () => {
    if (currentTask === undefined) return;
    const result = await window.desktop.piTask.start({
      schemaVersion: 1,
      commandId: createUuidV7(),
      employeeId: currentTask.employeeId,
      input: currentTask.userInput,
    });
    if (!result.ok) {
      setMessage(`重新执行失败：${taskErrorMessage(result.error.code)}`);
      return;
    }
    rememberTask(result.value, setCurrentTask);
  };

  return (
    <section aria-labelledby="employees-heading">
      <header className="page-header page-header--create">
        <div>
          <p className="eyebrow">PI 员工</p>
          <h1 id="employees-heading" tabIndex={-1}>
            员工与技能
          </h1>
          <p>
            每名员工保存自己的模型和技能。先把一名员工配置好，再直接交代任务。
          </p>
        </div>
      </header>

      <div className="employee-layout">
        <section className="selection-panel">
          <div className="section-heading">
            <div>
              <p className="empty-kicker">技能库</p>
              <h2>可用技能</h2>
            </div>
            <button
              className="secondary-button"
              disabled={pending}
              onClick={() => void previewImport()}
              type="button"
            >
              导入技能文件夹
            </button>
          </div>
          <div className="employee-card-grid">
            {skills.map((skill) => (
              <article className="employee-card" key={skill.name}>
                <span className="status-badge status-badge--neutral">
                  {skill.source === "BUILTIN" ? "软件内置" : "本地导入"}
                </span>
                <h3>{skill.name}</h3>
                <p>{skill.description}</p>
                <small>首版只读</small>
                <details className="skill-content">
                  <summary>查看技能实际内容</summary>
                  <pre>{skill.content}</pre>
                </details>
              </article>
            ))}
          </div>
          {preview !== undefined && (
            <div className="provider-disclosure" role="alert">
              <h3>确认导入：{preview.name}</h3>
              <p>{preview.description}</p>
              {preview.changes.length === 0 ? (
                <p>技能内容没有变化。</p>
              ) : (
                <ul>
                  {preview.changes.map((change) => (
                    <li key={`${change.type}-${change.path}`}>
                      {changeLabel(change.type)}：{change.path}
                    </li>
                  ))}
                </ul>
              )}
              <div className="form-actions">
                <button
                  className="secondary-button"
                  onClick={() => setPreview(undefined)}
                  type="button"
                >
                  取消
                </button>
                <button
                  className="primary-button"
                  disabled={pending}
                  onClick={() => void confirmImport()}
                  type="button"
                >
                  确认导入
                </button>
              </div>
            </div>
          )}
        </section>

        <form
          className="goal-form"
          onSubmit={(event) => void saveEmployee(event)}
        >
          <div className="field field--wide">
            <label htmlFor="employee-name">员工姓名</label>
            <input
              id="employee-name"
              maxLength={80}
              onChange={(event) => setName(event.target.value)}
              placeholder="例如：小文"
              required
              value={name}
            />
          </div>
          <div className="field">
            <label htmlFor="employee-provider">Provider</label>
            <select
              id="employee-provider"
              onChange={(event) => {
                setProviderId(event.target.value);
                setModelId("");
              }}
              required
              value={providerId}
            >
              <option value="">选择已验证 Provider</option>
              {readyProviders.map((provider) => (
                <option key={provider.id} value={provider.id}>
                  {provider.name}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="employee-model">模型</label>
            <select
              disabled={selectedProvider === undefined}
              id="employee-model"
              onChange={(event) => setModelId(event.target.value)}
              required
              value={modelId}
            >
              <option value="">选择模型</option>
              {selectedProvider?.connectionTest?.status === "VERIFIED" &&
                selectedProvider.connectionTest.models.map((model) => (
                  <option key={model.id} value={model.id}>
                    {model.displayName}
                  </option>
                ))}
            </select>
          </div>
          <div className="field field--wide">
            <label htmlFor="employee-skill">技能</label>
            <select
              id="employee-skill"
              onChange={(event) => setSkillName(event.target.value)}
              required
              value={skillName}
            >
              {skills.map((skill) => (
                <option key={skill.name} value={skill.name}>
                  {skill.name} · {skill.source === "BUILTIN" ? "内置" : "导入"}
                </option>
              ))}
            </select>
          </div>
          <div className="form-actions field--wide">
            <button className="primary-button" disabled={pending} type="submit">
              创建员工
            </button>
          </div>
        </form>

        <section className="selection-panel">
          <p className="empty-kicker">当前员工</p>
          <h2>已创建员工</h2>
          {employees.length === 0 ? (
            <p>还没有员工。上面创建的员工会显示在这里。</p>
          ) : (
            <div className="employee-card-grid">
              {employees.map((employee) => (
                <article className="employee-card" key={employee.id}>
                  <span className="status-badge status-badge--positive">
                    可用
                  </span>
                  <h3>{employee.name}</h3>
                  <p>模型：{employee.modelId}</p>
                  <p>技能：{employee.skillName}</p>
                </article>
              ))}
            </div>
          )}
        </section>

        <section className="selection-panel employee-task-panel">
          <p className="empty-kicker">直接交代任务</p>
          <h2>让员工开始工作</h2>
          <form
            className="goal-form"
            onSubmit={(event) => void startTask(event)}
          >
            <div className="field field--wide">
              <label htmlFor="task-employee">员工</label>
              <select
                id="task-employee"
                onChange={(event) => setSelectedEmployeeId(event.target.value)}
                required
                value={selectedEmployeeId}
              >
                <option value="">选择员工</option>
                {employees.map((employee) => (
                  <option key={employee.id} value={employee.id}>
                    {employee.name} · {employee.modelId}
                  </option>
                ))}
              </select>
            </div>
            <div className="field field--wide">
              <label htmlFor="task-input">任务内容</label>
              <textarea
                id="task-input"
                onChange={(event) => setTaskInput(event.target.value)}
                placeholder="例如：把下面这段内容整理成清楚的三点摘要……"
                required
                rows={5}
                value={taskInput}
              />
            </div>
            <div className="form-actions field--wide">
              <button
                className="primary-button"
                disabled={pending}
                type="submit"
              >
                开始任务
              </button>
            </div>
          </form>

          {currentTask !== undefined && (
            <article className="pi-task" aria-live="polite">
              <div className="section-heading">
                <div>
                  <p className="empty-kicker">当前状态</p>
                  <h3>{taskStatusLabel(currentTask.status)}</h3>
                </div>
                {currentTask.status === "RUNNING" && (
                  <button
                    className="secondary-button"
                    onClick={() => void taskCommand("cancel")}
                    type="button"
                  >
                    停止任务
                  </button>
                )}
              </div>
              {currentTask.finalOutput !== undefined && (
                <div className="pi-task-output">
                  <h4>员工交付结果</h4>
                  <pre>{currentTask.finalOutput}</pre>
                </div>
              )}
              {currentTask.failureMessage !== undefined && (
                <p className="error-copy">原因：{currentTask.failureMessage}</p>
              )}
              {["FAILED", "CANCELLED", "INTERRUPTED"].includes(
                currentTask.status,
              ) && (
                <button
                  className="secondary-button"
                  onClick={() => void retryTask()}
                  type="button"
                >
                  重新执行
                </button>
              )}
              <details
                className="pi-task-details"
                open={currentTask.status === "RUNNING"}
              >
                <summary>查看完整模型和工具过程</summary>
                <ol>
                  {currentTask.events.map((item) => (
                    <li key={item.sequence}>
                      <strong>{eventLabel(item.kind)}</strong>
                      <pre>{item.content}</pre>
                    </li>
                  ))}
                </ol>
              </details>
              {currentTask.status === "WAITING_ACCEPTANCE" && (
                <div className="acceptance-panel">
                  <button
                    className="primary-button"
                    onClick={() => void taskCommand("accept")}
                    type="button"
                  >
                    验收通过
                  </button>
                  <label htmlFor="change-input">需要修改的内容</label>
                  <textarea
                    id="change-input"
                    onChange={(event) => setChangeInput(event.target.value)}
                    rows={3}
                    value={changeInput}
                  />
                  <button
                    className="secondary-button"
                    disabled={changeInput.trim() === ""}
                    onClick={() => void taskCommand("requestChanges")}
                    type="button"
                  >
                    不通过，继续修改
                  </button>
                </div>
              )}
            </article>
          )}
        </section>
      </div>
      <p aria-live="polite" className="employee-message">
        {message}
      </p>
    </section>
  );
}

function isReadyProvider(provider: ProviderPublic): boolean {
  return (
    provider.configStatus === "ENABLED" &&
    provider.hasKey &&
    provider.connectionTest?.status === "VERIFIED" &&
    provider.connectionTest.providerVersion === provider.version
  );
}

function changeLabel(type: "ADDED" | "CHANGED" | "REMOVED"): string {
  if (type === "ADDED") return "新增";
  if (type === "CHANGED") return "修改";
  return "删除";
}

function skillErrorMessage(code: string): string {
  const messages: Record<string, string> = {
    INVALID_SKILL: "SKILL.md 缺失或格式不正确",
    UNSAFE_ENTRY: "技能包含不安全的链接或文件",
    SKILL_TOO_LARGE: "技能文件过多或过大",
    SOURCE_CHANGED: "确认前文件发生变化，请重新预览",
    BUILTIN_CONFLICT: "不能覆盖软件内置技能",
    PREVIEW_EXPIRED: "预览已失效，请重新选择文件夹",
  };
  return messages[code] ?? "请检查技能文件夹后重试";
}

function employeeErrorMessage(code: string): string {
  if (code === "PROVIDER_NOT_READY") return "Provider、连接或模型已失效";
  if (code === "SKILL_NOT_FOUND") return "技能已不存在，请重新选择";
  return "请检查填写内容后重试";
}

function taskStatusLabel(status: PiTask["status"]): string {
  const labels: Record<PiTask["status"], string> = {
    RUNNING: "员工正在工作",
    WAITING_ACCEPTANCE: "等待你验收",
    CHANGES_REQUESTED: "等待继续修改",
    COMPLETED: "已完成",
    CANCELLED: "已停止",
    FAILED: "运行失败",
    INTERRUPTED: "上次运行被中断",
  };
  return labels[status];
}

function eventLabel(kind: PiTask["events"][number]["kind"]): string {
  const labels: Record<PiTask["events"][number]["kind"], string> = {
    PROGRESS: "进度",
    MODEL_INPUT: "发送给模型",
    MODEL_OUTPUT: "模型原始输出",
    TOOL_START: "工具开始",
    TOOL_RESULT: "工具结果",
    TOOL_ERROR: "工具失败",
  };
  return labels[kind];
}

function taskErrorMessage(code: string): string {
  if (code === "EMPLOYEE_NOT_READY")
    return "员工的 Provider、模型或 Key 已失效";
  if (code === "ALREADY_RUNNING") return "已有任务正在运行";
  if (code === "INVALID_STATE") return "任务状态已经变化，请刷新后再试";
  return "请检查员工和任务内容后重试";
}

function rememberTask(task: PiTask, update: (task: PiTask) => void): void {
  window.localStorage.setItem("pi-current-task-id", task.id);
  update(task);
}
