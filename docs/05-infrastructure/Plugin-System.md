# Plugin System 设计

## 1. v0.1 定位

v0.1 只实现插件架构和“本地受信插件”最小加载能力，不建设插件市场，也不允许插件任意运行原生代码。

可扩展内容：

- Agent Definition；
- Prompt Template；
- Capability metadata；
- Tool Descriptor + 受控实现；
- Evaluator；
- Process Profile；
- UI 只读展示扩展（未来）。

## 2. Manifest

```json
{
  "schemaVersion": "1.0",
  "id": "com.example.docs",
  "name": "Documentation Pack",
  "version": "0.1.0",
  "publisher": "example",
  "minAppVersion": "0.1.0",
  "contributes": {
    "agentDefinitions": [],
    "promptTemplates": [],
    "tools": [],
    "evaluators": [],
    "processProfiles": []
  },
  "permissions": {
    "workspaceRead": true,
    "workspaceWrite": false,
    "processProfiles": []
  }
}
```

## 3. 信任模型

- 内置插件：随应用签名；
- 本地插件：用户显式安装并确认权限；
- 未签名插件：v0.1 默认拒绝或仅开发模式；
- 插件更新视为新版本，新增权限必须重新批准；
- Publisher 身份在未来市场阶段设计，v0.1 不虚构信任。

## 4. 执行隔离

优先支持声明式贡献。Tool 实现：

- 内置 Tool 可调用 Native Core；
- 第三方插件 v0.1 只组合现有 Tool 或注册受限 Process Profile；
- 不加载任意 Node native module；
- 不允许插件直接拿 IPC、数据库或 Key；
- 所有调用仍经过 Tool Runtime 与 Policy Engine。

## 5. 安装流程

1. 读取压缩包/目录；
2. 校验 manifest 与文件哈希；
3. 检查兼容版本；
4. 展示贡献和权限；
5. 用户确认；
6. 复制到受管插件目录；
7. 登记版本；
8. 重建 Registry；
9. 运行插件自检。

## 6. 生命周期

- `INSTALLED`
- `ENABLED`
- `DISABLED`
- `INCOMPATIBLE`
- `QUARANTINED`

运行中使用的插件版本快照化。禁用不破坏历史 Run 的可读性。

## 7. 冲突

- 全局 ID 使用反向域名；
- 同 ID 只启用一个版本；
- 不允许覆盖内置 Tool ID；
- Definition 与 Prompt 引用精确版本；
- Schema 冲突阻止启用。

## 8. 安全

- 防 Zip Slip；
- 文件大小/数量限制；
- 禁止符号链接；
- 禁止安装脚本；
- 不自动联网；
- Manifest 描述的权限只是请求，不是授权；
- 插件内容进入模型上下文时仍按不可信内容处理。

## 9. 接口

```ts
interface PluginManager {
  inspect(source: string): Promise<PluginInspection>;
  install(source: string, approval: PluginApproval): Promise<InstalledPlugin>;
  enable(id: string, version: string): Promise<void>;
  disable(id: string): Promise<void>;
  uninstall(id: string, version: string): Promise<UninstallReport>;
  rebuildRegistry(): Promise<RegistryReport>;
}
```

## 10. v0.1 模块验收断言

- 内置贡献通过统一 Registry 加载；
- 可安装一个纯声明式本地插件；
- 新权限明确展示；
- 插件不能绕过 Policy/Tool Runtime；
- 历史运行保留插件版本引用。
