# 安全威胁模型

## 1. 范围

保护：

- 用户本地文件；
- API Key；
- 系统完整性；
- Corporation 状态和 Artifact；
- 预算；
- 用户对外部副作用的控制权。

攻击者/不可信来源：

- 用户打开的恶意文件；
- 网页或检索内容；
- 模型输出；
- 恶意/失陷 Provider；
- 插件包；
- 本机其他低权限进程；
- 供应链依赖。

## 2. 信任边界

```mermaid
flowchart LR
  R["Renderer: untrusted UI content"] -->|typed IPC| M["Electron Main"]
  M -->|domain calls| O["Orchestration"]
  O -->|normalized HTTPS| P["Remote Provider"]
  O -->|authenticated local RPC| N["Rust Native Core"]
  O --> K["Application-managed Key Vault"]
  N --> W["Authorized Workspace"]
  M --> X["Task-scoped Child Processes"]
```

边界原则：

- Renderer 不可信；
- Provider 内容不可信；
- Artifact 内容不可信；
- Native Core 是工作区文件副作用边界；Electron Main 的可信命令 Runner 是命令副作用边界；
- Policy Decision 是授权边界。

## 3. 主要威胁与控制

### T-01 Prompt Injection 获取工具权限

场景：文件包含“忽略规则并删除目录”。

控制：

- 内容标记为不可信；
- 权限不由 Prompt 决定；
- Tool Call 经结构化 Policy；
- 高风险审批展示真实动作；
- 测试多跳注入。

### T-02 路径逃逸

场景：`../`、symlink、junction、UNC、大小写混淆。

控制：

- Rust canonicalization；
- 最终目标与工作区根比较；
- 对不存在目标检查最近存在父目录；
- 禁止跟随越界链接；
- 平台攻击测试。

### T-03 命令注入

场景：模型构造 `&&`、管道或恶意参数。

控制：

- 完整命令只在用户为当前任务明确授权后开放，授权不跨任务继承；
- 首次授权明确提示命令以用户 OS 账户运行、项目脚本可能访问工作区外内容、当前版本没有 OS 级强隔离；
- 普通查看、检查、测试和构建在任务授权后不反复打断；安装依赖、删除、Git 写操作、发布和其他明显高风险命令仍单独审批；
- 模型、技能或项目文件不能自行产生授权；无法可靠判断风险时要求审批；
- 命令环境排除 Provider API Key、Key Vault 内容和应用认证秘密；
- 取消、超时和应用退出终止整个进程树，不留下后台子进程；
- 命令结果未知时不自动重放，也不显示为成功。

### T-04 密钥泄漏

控制：

- AI Corporation Desktop 使用应用自管 SQLite Key Vault，并独立于 Provider 配置记录；完整 Key 使用应用自行生成并保存在应用数据目录的本地加密密钥进行 AES-256-GCM v1 认证加密；
- 该控制只保证 SQLite 数据库单独泄漏时不直接暴露 Key；同时取得数据库和应用本地加密密钥的攻击者可以解密，这是已确认的 v0.1 残余风险，不得宣传为 OS 级强机密保护；
- Renderer 可以通过专用 typed Provider IPC 录入、替换、删除和按用户明确动作读取 Key；默认遮挡，明文查看状态不持久化；
- 除 Key Vault 加密记录外，Provider 配置、日志、错误、截图和诊断包不得包含非预期明文副本；
- Key Vault 加解密或一致性检查失败时固定失败，不允许明文降级；
- 日志落盘前脱敏；
- Tool 环境不默认继承 Key；
- Artifact/Prompt Secret Scan；
- 诊断包预览。

### T-05 重复副作用

场景：崩溃恢复后重复写入或命令。

控制：

- idempotency key；
- Tool Invocation 预记录；
- Change Set commit record；
- 未知副作用人工处理；
- 故障注入。

### T-06 恶意 Artifact 预览

控制：

- Markdown/HTML 消毒；
- 严格 CSP；
- 禁止脚本和远程资源；
- 二进制不内嵌执行；
- 外部打开需要确认。

### T-07 IPC/RPC 越权

控制：

- typed preload；
- channel allowlist；
- payload Schema；
- 窗口来源检查；
- Sidecar 随机会话令牌；
- Sidecar 不监听公网；
- 方法 allowlist、严格 Schema、请求大小上限与方法级验证；
- Provider Key Vault IPC 使用固定脱敏错误；只有用户主动查看动作的成功结果可以向 Renderer 返回 Key。

### T-08 插件供应链

控制：

- Manifest/哈希；
- 无安装脚本；
- 禁止任意原生模块；
- 权限 diff；
- 签名内置插件；
- 可禁用/隔离；
- 更新重新授权。

### T-09 费用耗尽

控制：

- 硬预算；
- 调用前 reservation；
- 并发上限；
- 最大轮数；
- Goal Engine 每个澄清周期固定最多 5 轮；到达上限立即停止模型调用，只有用户明确选择后才可增加下一个 5 轮周期；续期决定不持久化为自动偏好；
- 每个结构化生成阶段最多一次 JSON 修复；每次调用独立记录 usage，用户可在周期边界选择保存未确认草稿或取消；
- Planner 首次生成不计为修复；JSON/Schema 非法只允许一次同 Provider/版本/模型修复。DAG/引用等语义错误由独立验证任务处理，不得借此增加本阶段调用次数；
- 计划语义验证完全在本地确定性执行；失败只保存受限结构化问题，不自动调用 Provider、不自动改写计划、不把未知预算当作零；
- 熔断；
- 用户追加预算。

### T-10 Judge 被产物诱导

控制：

- 独立 Judge；
- rubric 位于高信任层；
- Artifact 作为引用数据；
- 确定性验证优先；
- Evidence 必需；
- 无证据返回不确定。

### T-11 更新包被替换

控制：

- 代码签名；
- 更新签名/哈希；
- HTTPS；
- Sidecar 哈希验证；
- 失败回退。

### T-12 数据残留

控制：

- 删除预览；
- 内部 Artifact 清理；
- Key 引用清理；
- 工作区文件默认保留；
- 备份保留说明；
- 导出/删除测试。

### T-14 自动文本写入覆盖用户修改

场景：员工读取文件后，用户或其他程序又修改了文件；员工随后用旧内容覆盖新版本。

控制：

- 每次读取返回内容哈希；
- 修改必须携带读取时的基线哈希；
- 写入前在 Native Core 内重新计算当前哈希，不一致固定返回冲突；
- 新文件只允许在目标仍不存在时创建；
- 写入采用同目录临时文件和原子替换；
- 工具调用在执行前记录幂等键、目标相对路径、基线哈希和目标哈希；
- 重启不自动重放写入，恢复时按目标哈希判断已提交、未提交或未知，并向用户显示真实结论。

### T-15 伪造成果与危险文件打开

场景：模型声称生成了不存在或越界文件，恶意路径冒充成果，或者用户点击成果后直接执行脚本/可执行文件。

控制：

- 受控写入只在成功后自动登记；命令产物必须通过 `workspace.register_deliverable` 在可信边界重新核对；
- Renderer 不能提交绝对 Workspace root，也不能把模型文字、命令输出或 Skill 内容直接变成果记录；
- 预览、系统打开和显示位置重新验证公司、任务、Workspace、成果归属和相对路径；
- 文本预览按纯文本处理，不执行 HTML、脚本或远程资源；
- 可执行和脚本类文件不提供系统直接打开按钮，只允许安全预览和查看所在位置；
- 交付后文件哈希变化、缺失或不可读时显示真实状态，不继续声称原成果完整。

### T-13 Provider Endpoint 与凭据转发

场景：恶意或错误 Endpoint 通过明文传输、redirect、URL 凭据或异常响应诱导应用泄漏 Key、访问非预期目标或耗尽内存。

控制：

- Provider 网络请求只由 Electron Main/Application Service 发起，Renderer 不直接读取 Key 或调用 Provider 网络；
- 远程 Endpoint 必须为 HTTPS；HTTP 只允许 loopback，且只接受 `localhost`、`127.0.0.1`、`::1`；
- Endpoint 禁止 URL 用户名、密码、query 和 fragment；连接测试只在保存的 API base URL 下解析固定相对路径 `models`；
- 禁止 HTTP redirect，Authorization 不向第二目标转发；
- 固定 15 秒截止、可取消、限制响应体和模型条目数量，异常成功响应固定归一化；
- Key、Authorization、Provider 原始错误正文和响应正文不得进入日志、SQLite 测试结果、事件、错误或 Renderer；
- 连接测试结果通过 Provider ID 与配置版本绑定；Endpoint 或 Key 变化后旧结果失效，迟到结果不得覆盖新版本。
- 生成调用只向已保存 Endpoint 下由显式 dialect Adapter 解析的固定路径发送 Authorization；当前 Chat Adapter 只允许 `POST chat/completions`、`stream:false`，禁止 Renderer 覆盖 URL、Header、Key、dialect 或模型；
- 通用生成 DTO 不携带 Chat/Responses 原始对象；远端正文、request ID 和错误仅在 Adapter 内受限解析，输出与 usage 通过大小、类型和整数边界校验后才可跨边界；
- 生成超时限制为 5–300 秒且始终可取消；取消、Provider 版本变化和迟到响应不得覆盖已持久化结果；
- 未来 Responses 必须作为独立 Adapter 与 Chat Adapter 并存；streaming 另建 dialect-neutral 事件协议，禁止把远端 Chat delta 暴露为公共协议。

## 4. 风险接受

v0.1 不提供完整 OS 容器隔离。因此：

- 用户可以为一个可信任务授权完整系统原生命令，以换取真实编码任务的可用性；
- 命令仍以用户权限运行，项目脚本可能访问工作区外内容，应用无法声称已经把影响限制在工作区内；
- 授权仅限当前任务，明显高风险命令仍单独确认，应用秘密不进入命令环境；
- 不把“沙箱”描述为绝对隔离；
- 更强隔离作为后续增强单独设计，不能阻塞当前好用的编码闭环。

## 5. 安全发布门槛

- P0/P1 安全缺陷为 0；
- Key 泄漏测试通过；
- 路径/命令攻击集通过；
- Electron 基线通过；
- 恢复不重复副作用；
- 更新签名在公开发布前启用；
- 第三方依赖和许可证扫描无未处理高风险项。

## 6. 安全回归清单

- 新 Tool；
- 新 Provider；
- 新 IPC/RPC；
- 新插件贡献点；
- 新路径操作；
- 新外部网络动作；
- Policy 默认值变化；
- Electron/Rust 依赖大版本升级。

上述变更必须更新本文档并补攻击测试。
