import type {
  PiEmployee,
  PiCompany,
  PiSkill,
  PiSkillPreviewImportResult,
  PiTask,
  ProviderPublic,
  WorkspacePublic,
} from "@ai-corporation/protocols";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { createUuidV7 } from "./uuid-v7";

type Preview = Extract<PiSkillPreviewImportResult, { ok: true }>["value"];
type CommandApproval = {
  readonly approvalId: string;
  readonly command: string;
  readonly kind: "TASK" | "HIGH_RISK";
  readonly reason: string;
};

export function EmployeesPage(props: {
  readonly company: PiCompany;
  readonly onCompanyChange: (company: PiCompany) => void;
}) {
  const [employees, setEmployees] = useState<readonly PiEmployee[]>([]);
  const [skills, setSkills] = useState<readonly PiSkill[]>([]);
  const [providers, setProviders] = useState<readonly ProviderPublic[]>([]);
  const [workspaces, setWorkspaces] = useState<readonly WorkspacePublic[]>([]);
  const [name, setName] = useState("");
  const [providerId, setProviderId] = useState("");
  const [modelId, setModelId] = useState("");
  const [skillName, setSkillName] = useState("text-organize");
  const [preview, setPreview] = useState<Preview>();
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState("");
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState("");
  const [taskInput, setTaskInput] = useState("");
  const [changeInput, setChangeInput] = useState("");
  const [currentTask, setCurrentTask] = useState<PiTask>();
  const [tasks, setTasks] = useState<readonly PiTask[]>([]);

  const readyProviders = useMemo(
    () => providers.filter(isReadyProvider),
    [providers],
  );
  const selectedProvider = readyProviders.find(
    (provider) => provider.id === providerId,
  );
  const commandApproval = useMemo(
    () => pendingCommandApproval(currentTask),
    [currentTask],
  );
  const companyEmployees = employees.filter((employee) =>
    props.company.employeeIds.includes(employee.id),
  );
  const companyWorkspaces = workspaces.filter((workspace) =>
    props.company.workspaceIds.includes(workspace.workspaceId),
  );

  const reload = async (company = props.company) => {
    const [
      employeeResult,
      skillResult,
      providerResult,
      workspaceResult,
      taskResult,
    ] = await Promise.all([
      window.desktop.piEmployee.list({ schemaVersion: 1 }),
      window.desktop.piSkill.list({ schemaVersion: 1 }),
      window.desktop.provider.list({ schemaVersion: 1 }),
      window.desktop.workspace.list(),
      window.desktop.piTask.list({
        schemaVersion: 2,
        companyId: company.id,
      }),
    ]);
    if (employeeResult.ok) {
      setEmployees(employeeResult.value);
      setSelectedEmployeeId(
        (current) =>
          (current && company.employeeIds.includes(current) ? current : "") ||
          employeeResult.value.find((item) =>
            company.employeeIds.includes(item.id),
          )?.id ||
          "",
      );
      const latestEmployee = employeeResult.value.find((item) =>
        company.employeeIds.includes(item.id),
      );
      if (
        latestEmployee !== undefined &&
        window.localStorage.getItem(`pi-current-task-id:${company.id}`) === null
      ) {
        const latestTask = await window.desktop.piTask.get({
          schemaVersion: 2,
          companyId: company.id,
          employeeId: latestEmployee.id,
        });
        if (latestTask.ok) rememberTask(latestTask.value, setCurrentTask);
      }
    }
    if (taskResult.ok) setTasks(taskResult.value);
    if (skillResult.ok) setSkills(skillResult.value);
    if (providerResult.ok) setProviders(providerResult.value);
    if (workspaceResult.ok) {
      setWorkspaces(workspaceResult.value);
      setSelectedWorkspaceId(
        (current) =>
          (current && company.workspaceIds.includes(current) ? current : "") ||
          workspaceResult.value.find(
            (workspace) =>
              company.workspaceIds.includes(workspace.workspaceId) &&
              workspace.accessStatus === "AVAILABLE" &&
              workspace.permissionMode === "READ_WRITE",
          )?.workspaceId ||
          "",
      );
    }
    if (
      !employeeResult.ok ||
      !skillResult.ok ||
      !providerResult.ok ||
      !workspaceResult.ok ||
      !taskResult.ok
    ) {
      setMessage("员工资料加载失败，请重试。");
    }
  };

  useEffect(() => {
    void reload();
    const taskId = window.localStorage.getItem(
      `pi-current-task-id:${props.company.id}`,
    );
    if (taskId !== null) {
      void window.desktop.piTask
        .get({ schemaVersion: 2, companyId: props.company.id, taskId })
        .then((result) => {
          if (result.ok) setCurrentTask(result.value);
        });
    }
  }, [props.company.id]);

  useEffect(() => {
    if (currentTask?.status !== "RUNNING") return;
    // 轮询只负责显示已落库的真实事件，界面刷新不会重新调用模型。
    const timer = window.setInterval(async () => {
      const result = await window.desktop.piTask.get({
        schemaVersion: 2,
        companyId: props.company.id,
        taskId: currentTask.id,
      });
      if (result.ok) setCurrentTask(result.value);
    }, 250);
    return () => window.clearInterval(timer);
  }, [currentTask?.id, currentTask?.status, props.company.id]);

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
    const membership = await window.desktop.piCompany.addEmployee({
      schemaVersion: 1,
      commandId: createUuidV7(),
      companyId: props.company.id,
      employeeId: result.value.id,
    });
    if (!membership.ok) {
      setMessage("员工已经创建，但加入当前公司失败，请在员工列表中重试。");
      await reload();
      return;
    }
    props.onCompanyChange(membership.value);
    setName("");
    setSelectedEmployeeId(result.value.id);
    setMessage(`员工“${result.value.name}”已创建，可以接收任务。`);
    await reload(membership.value);
  };

  const startTask = async (event: FormEvent) => {
    event.preventDefault();
    setPending(true);
    const result = await window.desktop.piTask.start({
      schemaVersion: 2,
      commandId: createUuidV7(),
      companyId: props.company.id,
      employeeId: selectedEmployeeId,
      workspaceId: selectedWorkspaceId,
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
      schemaVersion: 2 as const,
      commandId: createUuidV7(),
      companyId: props.company.id,
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

  const resolveCommandApproval = async (decision: "APPROVE" | "REJECT") => {
    if (currentTask === undefined || commandApproval === undefined) return;
    setPending(true);
    const result = await window.desktop.piTask.resolveCommandApproval({
      schemaVersion: 2,
      commandId: createUuidV7(),
      companyId: props.company.id,
      taskId: currentTask.id,
      approvalId: commandApproval.approvalId,
      decision,
    });
    setPending(false);
    if (!result.ok) {
      setMessage("命令决定没有生效，任务状态可能已经变化，请刷新后重试。");
      return;
    }
    rememberTask(result.value, setCurrentTask);
    setMessage(
      decision === "APPROVE" ? "已批准，员工会继续执行。" : "已拒绝这次命令。",
    );
  };

  const retryTask = async () => {
    if (currentTask === undefined) return;
    const workspaceId = currentTask.workspaceId ?? selectedWorkspaceId;
    if (workspaceId === "") {
      setMessage("重新执行前，请先选择本次任务的工作区。");
      return;
    }
    const result = await window.desktop.piTask.start({
      schemaVersion: 2,
      commandId: createUuidV7(),
      companyId: props.company.id,
      employeeId: currentTask.employeeId,
      workspaceId,
      input: currentTask.userInput,
    });
    if (!result.ok) {
      setMessage(`重新执行失败：${taskErrorMessage(result.error.code)}`);
      return;
    }
    rememberTask(result.value, setCurrentTask);
  };

  const selectWorkspace = async () => {
    setPending(true);
    const result = await window.desktop.workspace.select();
    setPending(false);
    if (!result.ok) {
      setMessage("工作区无法添加，请重新选择。");
      return;
    }
    if (result.value.status === "CANCELLED") {
      setMessage("已取消选择工作区。");
      return;
    }
    setSelectedWorkspaceId(result.value.workspace.workspaceId);
    const membership = await window.desktop.piCompany.addWorkspace({
      schemaVersion: 1,
      commandId: createUuidV7(),
      companyId: props.company.id,
      workspaceId: result.value.workspace.workspaceId,
    });
    if (!membership.ok) {
      setMessage("工作区已授权，但没有加入当前公司，请重试。");
      return;
    }
    props.onCompanyChange(membership.value);
    setMessage("工作区已加入当前公司，可以用于这次任务。");
    await reload(membership.value);
  };

  const changeEmployeeMembership = async (employeeId: string, add: boolean) => {
    const result = await window.desktop.piCompany[
      add ? "addEmployee" : "removeEmployee"
    ]({
      schemaVersion: 1,
      commandId: createUuidV7(),
      companyId: props.company.id,
      employeeId,
    });
    if (!result.ok) {
      setMessage("员工归属调整失败，请重试。");
      return;
    }
    props.onCompanyChange(result.value);
    setMessage(
      add ? "员工已加入当前公司。" : "员工已从当前公司移除。已有任务不会改变。",
    );
  };

  const addExistingWorkspace = async (workspaceId: string) => {
    const result = await window.desktop.piCompany.addWorkspace({
      schemaVersion: 1,
      commandId: createUuidV7(),
      companyId: props.company.id,
      workspaceId,
    });
    if (!result.ok) {
      setMessage("工作区加入公司失败，请确认它仍然可写。");
      return;
    }
    props.onCompanyChange(result.value);
    setSelectedWorkspaceId(workspaceId);
    setMessage("工作区已加入当前公司。");
  };

  const removeWorkspace = async (workspaceId: string) => {
    const result = await window.desktop.piCompany.removeWorkspace({
      schemaVersion: 1,
      commandId: createUuidV7(),
      companyId: props.company.id,
      workspaceId,
    });
    if (!result.ok) {
      setMessage("工作区移出公司失败，请重试。");
      return;
    }
    props.onCompanyChange(result.value);
    if (selectedWorkspaceId === workspaceId) setSelectedWorkspaceId("");
    setMessage("工作区已从当前公司移除。全局授权和已有任务没有改变。");
  };

  return (
    <section aria-labelledby="employees-heading">
      <header className="page-header page-header--create">
        <div>
          <p className="eyebrow">{props.company.name}</p>
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
                  <span
                    className={`status-badge status-badge--${
                      props.company.employeeIds.includes(employee.id)
                        ? "positive"
                        : "neutral"
                    }`}
                  >
                    {props.company.employeeIds.includes(employee.id)
                      ? "当前公司"
                      : "其他公司可复用"}
                  </span>
                  <h3>{employee.name}</h3>
                  <p>模型：{employee.modelId}</p>
                  <p>技能：{employee.skillName}</p>
                  <button
                    className="secondary-button"
                    onClick={() =>
                      void changeEmployeeMembership(
                        employee.id,
                        !props.company.employeeIds.includes(employee.id),
                      )
                    }
                    type="button"
                  >
                    {props.company.employeeIds.includes(employee.id)
                      ? "移出当前公司"
                      : "加入当前公司"}
                  </button>
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
                {companyEmployees.map((employee) => (
                  <option key={employee.id} value={employee.id}>
                    {employee.name} · {employee.modelId}
                  </option>
                ))}
              </select>
            </div>
            <div className="field field--wide">
              <label htmlFor="task-workspace">本次任务的工作区</label>
              <div className="workspace-task-picker">
                <select
                  id="task-workspace"
                  onChange={(event) =>
                    setSelectedWorkspaceId(event.target.value)
                  }
                  required
                  value={selectedWorkspaceId}
                >
                  <option value="">选择可写工作区</option>
                  {companyWorkspaces
                    .filter(
                      (workspace) =>
                        workspace.accessStatus === "AVAILABLE" &&
                        workspace.permissionMode === "READ_WRITE",
                    )
                    .map((workspace) => (
                      <option
                        key={workspace.workspaceId}
                        value={workspace.workspaceId}
                      >
                        {workspace.displayPath}
                      </option>
                    ))}
                </select>
                <button
                  className="secondary-button"
                  disabled={pending}
                  onClick={() => void selectWorkspace()}
                  type="button"
                >
                  添加工作区
                </button>
              </div>
              <small>
                员工可在这里读取和修改代码。编码员工首次运行命令时会说明真实风险并请你确认。
              </small>
              {companyWorkspaces.length > 0 && (
                <div className="company-workspace-options">
                  <strong>当前公司的工作区</strong>
                  {companyWorkspaces.map((workspace) => (
                    <button
                      className="secondary-button"
                      key={workspace.workspaceId}
                      onClick={() =>
                        void removeWorkspace(workspace.workspaceId)
                      }
                      type="button"
                    >
                      移出：{workspace.displayPath}
                    </button>
                  ))}
                </div>
              )}
              {workspaces.some(
                (workspace) =>
                  workspace.accessStatus === "AVAILABLE" &&
                  workspace.permissionMode === "READ_WRITE" &&
                  !props.company.workspaceIds.includes(workspace.workspaceId),
              ) && (
                <div className="company-workspace-options">
                  <strong>加入已有工作区</strong>
                  {workspaces
                    .filter(
                      (workspace) =>
                        workspace.accessStatus === "AVAILABLE" &&
                        workspace.permissionMode === "READ_WRITE" &&
                        !props.company.workspaceIds.includes(
                          workspace.workspaceId,
                        ),
                    )
                    .map((workspace) => (
                      <button
                        className="secondary-button"
                        key={workspace.workspaceId}
                        onClick={() =>
                          void addExistingWorkspace(workspace.workspaceId)
                        }
                        type="button"
                      >
                        加入：{workspace.displayPath}
                      </button>
                    ))}
                </div>
              )}
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
              {currentTask.workspaceId !== undefined && (
                <p className="pi-task-workspace">
                  工作区：
                  {workspaces.find(
                    (workspace) =>
                      workspace.workspaceId === currentTask.workspaceId,
                  )?.displayPath ?? "已授权工作区"}
                </p>
              )}
              {currentTask.finalOutput !== undefined && (
                <div className="pi-task-output">
                  <h4>员工交付结果</h4>
                  <pre>{currentTask.finalOutput}</pre>
                </div>
              )}
              {currentTask.failureMessage !== undefined && (
                <p className="error-copy">原因：{currentTask.failureMessage}</p>
              )}
              {commandApproval !== undefined && (
                <section className="provider-disclosure" role="alert">
                  <p className="empty-kicker">
                    {commandApproval.kind === "TASK"
                      ? "本任务首次运行命令"
                      : "高风险命令"}
                  </p>
                  <h4>
                    {commandApproval.kind === "TASK"
                      ? "是否允许本任务运行命令？"
                      : "是否批准这条高风险命令？"}
                  </h4>
                  <p>{commandApproval.reason}</p>
                  {commandApproval.kind === "TASK" && (
                    <p>
                      批准后，本任务中的普通查看、检查、测试和构建不会反复询问；新任务会重新询问。依赖安装、删除、Git
                      写操作和发布仍会单独确认。
                    </p>
                  )}
                  <pre>{commandApproval.command}</pre>
                  <div className="form-actions">
                    <button
                      className="secondary-button"
                      disabled={pending}
                      onClick={() => void resolveCommandApproval("REJECT")}
                      type="button"
                    >
                      拒绝
                    </button>
                    <button
                      className="primary-button"
                      disabled={pending}
                      onClick={() => void resolveCommandApproval("APPROVE")}
                      type="button"
                    >
                      {commandApproval.kind === "TASK"
                        ? "允许本任务运行命令"
                        : "批准这条命令"}
                    </button>
                  </div>
                </section>
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
          {tasks.length > 0 && (
            <section
              className="task-history"
              aria-labelledby="task-history-title"
            >
              <h3 id="task-history-title">本公司的任务记录</h3>
              <div className="employee-card-grid">
                {tasks.map((task) => (
                  <article className="employee-card" key={task.id}>
                    <span className="status-badge status-badge--neutral">
                      {taskStatusLabel(task.status)}
                    </span>
                    <p>{task.userInput}</p>
                    <button
                      className="secondary-button"
                      onClick={() => rememberTask(task, setCurrentTask)}
                      type="button"
                    >
                      查看任务
                    </button>
                  </article>
                ))}
              </div>
            </section>
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
    TOOL_UPDATE: "命令实时输出",
    APPROVAL_REQUIRED: "等待你的命令确认",
    APPROVAL_RESOLVED: "命令确认结果",
  };
  return labels[kind];
}

function pendingCommandApproval(
  task: PiTask | undefined,
): CommandApproval | undefined {
  if (task?.status !== "RUNNING") return undefined;
  const resolved = new Set<string>();
  for (const event of task.events) {
    if (event.kind !== "APPROVAL_RESOLVED") continue;
    const parsed = parseApproval(event.content);
    if (parsed !== undefined) resolved.add(parsed.approvalId);
  }
  for (const event of [...task.events].reverse()) {
    if (event.kind !== "APPROVAL_REQUIRED") continue;
    const parsed = parseApproval(event.content);
    if (parsed !== undefined && !resolved.has(parsed.approvalId)) return parsed;
  }
  return undefined;
}

function parseApproval(content: string): CommandApproval | undefined {
  try {
    const value = JSON.parse(content) as Partial<CommandApproval>;
    if (
      typeof value.approvalId === "string" &&
      typeof value.command === "string" &&
      (value.kind === "TASK" || value.kind === "HIGH_RISK") &&
      typeof value.reason === "string"
    ) {
      return value as CommandApproval;
    }
  } catch {
    // 旧事件或损坏事件不应让整个员工页面崩溃。
  }
  return undefined;
}

function taskErrorMessage(code: string): string {
  if (code === "EMPLOYEE_NOT_READY")
    return "员工的 Provider、模型或 Key 已失效";
  if (code === "WORKSPACE_NOT_READY") return "请选择一个当前可用、可写的工作区";
  if (code === "ALREADY_RUNNING") return "已有任务正在运行";
  if (code === "INVALID_STATE") return "任务状态已经变化，请刷新后再试";
  return "请检查员工和任务内容后重试";
}

function rememberTask(task: PiTask, update: (task: PiTask) => void): void {
  window.localStorage.setItem(`pi-current-task-id:${task.companyId}`, task.id);
  update(task);
}
