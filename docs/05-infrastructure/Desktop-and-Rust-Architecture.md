# Electron、TypeScript 与 Rust 工程架构

## 1. 进程模型

```text
Electron Main
├── Renderer (React, sandboxed)
├── Orchestration Services (TypeScript)
└── Native Core Sidecar (Rust)
```

Renderer 可崩溃重载而不终止活跃编排；Main 退出时负责有序暂停 Sidecar 和运行任务。

## 2. Electron 安全设置

BrowserWindow 基线：

```ts
{
  webPreferences: {
    contextIsolation: true,
    nodeIntegration: false,
    sandbox: true,
    preload: PRELOAD_PATH
  }
}
```

并配置：

- 严格 CSP；
- 禁止任意导航和新窗口；
- 外部链接经白名单并交给系统浏览器；
- 不加载远程 UI 代码；
- 生产环境关闭 DevTools 或受控开启；
- IPC 参数使用运行时 Schema。

## 3. Typed Preload API

```ts
type DesktopApi = {
  workspace: {
    list(): Promise<WorkspaceListIpcResult>;
    revalidate(workspaceId: string): Promise<WorkspaceRevalidateIpcResult>;
    select(): Promise<WorkspaceSelectIpcResult>;
  };
  corporations: {
    list(): Promise<CorporationSummary[]>;
    create(command: CreateCorporationCommand): Promise<CorporationSummary>;
    command(command: CorporationCommand): Promise<void>;
    subscribe(
      request: EventSubscription,
      listener: (event: RedactedDomainEvent) => void,
    ): Unsubscribe;
  };
  approvals: {
    resolve(command: ResolveApprovalCommand): Promise<void>;
  };
  settings: {
    getPublic(): Promise<PublicSettings>;
    update(command: UpdateSettingsCommand): Promise<void>;
  };
};
```

Preload 不暴露原始 `ipcRenderer`。

Workspace 选择是特殊的授权入口：Renderer 只能发起无参数 `workspace:select`，Electron Main 调用系统原生单目录选择器并把结果交给 Rust canonicalize。路径、身份和原生句柄不经过 preload；公开 DTO、取消和固定错误以 [Workspace Protocol](../04-protocols/Workspace-Protocol.md) 为唯一来源。

## 4. IPC

- 命令：request/response；
- 事件：带 cursor 的订阅；
- 大文件：通过受控文件读取 API 分块；
- 所有 channel 使用固定常量；
- Main 校验窗口来源、Schema 和权限；
- 响应错误使用安全错误模型。

## 5. Rust Sidecar

### 5.1 为什么采用 Sidecar

- 与 Electron 崩溃隔离；
- 独立测试系统能力；
- 不受 Node ABI 影响；
- Windows/macOS 可分别编译同一 Rust 代码；
- 权限接口更易收窄。

### 5.2 通信

推荐本地 JSON-RPC：

- Main 启动 Sidecar 并传入随机会话令牌；
- 通过 stdin/stdout 长连接或仅本机命名管道；
- 消息带 request ID 和 Schema version；
- stderr 仅用于受控诊断；
- 不监听公网端口；
- 大输出写临时受管文件并返回引用。

### 5.3 RPC 方法

- `health`（Milestone 0 已实现，协议见
  [Native Core Health RPC](../04-protocols/Native-Health-RPC.md)）
- `workspace.canonicalize`（协议见
  [Workspace Protocol](../04-protocols/Workspace-Protocol.md)）
- `workspace.read_text`
- `workspace.search`
- `workspace.prepare_changeset`
- `workspace.commit_changeset`
- `process.start`
- `process.cancel`
- `process.status`
- `secure_store.set/get/delete`
- `hash.file`

每个 RPC 在 Rust 侧再次校验会话、路径和参数。

## 6. 包与 Crate 边界

```text
packages/
├── domain          纯领域类型和状态机
├── protocols       Schema 与 DTO
├── orchestration   核心用例
├── providers       模型适配器
├── tools           Tool 语义
├── storage         Repository
└── ui              React 组件

crates/
├── native-core     JSON-RPC server
├── workspace-fs    安全路径与原子文件
├── process-runner  子进程和取消
└── secure-store    Keychain/Credential Manager
```

依赖方向：

```text
UI → Application → Domain
Infrastructure → Domain interfaces
Native Core 不依赖产品 UI
```

## 7. 平台适配

公共接口下封装：

- 路径大小写与分隔符；
- Windows junction/reparse point；
- macOS symlink；
- 进程组终止；
- Credential Manager / Keychain；
- 文件锁与原子替换；
- 睡眠/唤醒事件。

业务代码不得用 `if (process.platform)` 散落处理，统一进入 adapter。

## 8. 开发与构建

- pnpm workspace 管理 TS；
- Cargo workspace 管理 Rust；
- dev 模式先构建/启动 Sidecar，再启动 Electron；
- 协议 Schema 生成 TS/Rust 类型或做 golden compatibility tests；
- 安装包包含对应平台 Sidecar；
- CI 矩阵构建 Windows 和 macOS；
- 发布包签名、macOS notarization；
- Sidecar 哈希在启动时验证。

## 9. 自动更新

v0.1 可先支持手动检查更新，但架构要求：

- 更新元数据签名；
- 下载后校验；
- 活跃 Corporation 时不强制更新；
- 更新前暂停并创建数据库备份；
- 数据库不支持自动降级；
- 失败后保留原应用版本。

## 10. 崩溃与生命周期

- Main 捕获退出请求，停止调度；
- 等待当前步骤到检查点；
- 超时后取消；
- Sidecar 异常时阻断新工具调用，纯模型任务可按策略继续；
- Renderer 重载后通过事件 cursor 恢复 UI；
- 系统休眠后重新评估超时与租约。

## 11. 测试重点

- Renderer 无 Node/密钥权限；
- 非法 IPC channel 和 payload；
- Sidecar 会话令牌；
- Sidecar 被替换；
- 平台路径边界；
- Renderer 崩溃不损坏状态；
- Main/Sidecar 异常退出恢复；
- 安装包包含正确架构二进制。

## 12. v0.1 模块验收断言

- 同一业务代码构建 Windows/macOS；
- IPC 与 RPC 都有 Schema；
- Rust 只通过窄接口提供系统能力；
- 安全设置自动测试；
- 安装、启动、更新前备份和卸载流程可验证。
