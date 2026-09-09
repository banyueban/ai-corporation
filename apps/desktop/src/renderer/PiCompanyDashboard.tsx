import type { PiCompany } from "@ai-corporation/protocols";
import { useEffect, useState, type FormEvent } from "react";
import { createUuidV7 } from "./uuid-v7";

/** 当前主流程只展示轻量公司，不把旧目标规划流程混进来。 */
export function PiCompanyDashboard(props: {
  readonly onOpen: (company: PiCompany) => void;
}) {
  const [companies, setCompanies] = useState<readonly PiCompany[]>([]);
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");

  const reload = async () => {
    const result = await window.desktop.piCompany.list({ schemaVersion: 1 });
    setLoading(false);
    if (!result.ok) {
      setMessage("公司列表加载失败，请重试。");
      return;
    }
    setCompanies(result.value);
  };

  useEffect(() => {
    void reload();
  }, []);

  const create = async (event: FormEvent) => {
    event.preventDefault();
    setPending(true);
    const result = await window.desktop.piCompany.create({
      schemaVersion: 1,
      commandId: createUuidV7(),
      name,
    });
    setPending(false);
    if (!result.ok) {
      setMessage("公司创建失败，请检查名称后重试。");
      return;
    }
    setName("");
    await reload();
    props.onOpen(result.value);
  };

  const rename = async (company: PiCompany) => {
    const nextName = window.prompt("输入新的公司名称", company.name)?.trim();
    if (nextName === undefined || nextName === "" || nextName === company.name)
      return;
    const result = await window.desktop.piCompany.updateName({
      schemaVersion: 1,
      commandId: createUuidV7(),
      companyId: company.id,
      name: nextName,
    });
    if (!result.ok) {
      setMessage("公司改名失败，请重试。");
      return;
    }
    setCompanies((current) =>
      current.map((item) =>
        item.id === result.value.id ? result.value : item,
      ),
    );
    setMessage("公司名称已更新。");
  };

  return (
    <section aria-labelledby="company-dashboard-title">
      <header className="page-header">
        <div>
          <p className="eyebrow">AI Corporation</p>
          <h1 id="company-dashboard-title">控制台</h1>
          <p>进入一家公司，安排员工、工作区和真实任务。</p>
        </div>
      </header>

      <form className="company-create" onSubmit={(event) => void create(event)}>
        <label htmlFor="company-name">公司名称</label>
        <input
          id="company-name"
          maxLength={120}
          onChange={(event) => setName(event.target.value)}
          placeholder="例如：我的工作室"
          required
          value={name}
        />
        <button className="primary-button" disabled={pending} type="submit">
          {pending ? "正在创建…" : "新建公司"}
        </button>
      </form>

      {loading ? (
        <div className="skeleton-card" aria-label="正在加载公司" />
      ) : companies.length === 0 ? (
        <section className="empty-state">
          <h2>先创建一家公司</h2>
          <p>只需要一个名称。创建后就能加入员工和工作区，再直接交代任务。</p>
        </section>
      ) : (
        <section aria-labelledby="company-list-title">
          <div className="section-heading">
            <div>
              <p className="empty-kicker">当前公司</p>
              <h2 id="company-list-title">公司列表</h2>
            </div>
            <span>{companies.length}</span>
          </div>
          <div className="workspace-grid">
            {companies.map((company) => (
              <article className="workspace-card" key={company.id}>
                <span className="status-badge status-badge--positive">
                  可用
                </span>
                <h3>{company.name}</h3>
                <p>
                  {company.employeeIds.length} 名员工 ·{" "}
                  {company.workspaceIds.length} 个工作区
                </p>
                <button
                  className="primary-button"
                  onClick={() => props.onOpen(company)}
                  type="button"
                >
                  进入公司
                </button>
                <button
                  className="secondary-button"
                  onClick={() => void rename(company)}
                  type="button"
                >
                  修改名称
                </button>
              </article>
            ))}
          </div>
        </section>
      )}
      <p className="inline-status" aria-live="polite">
        {message}
      </p>
    </section>
  );
}
