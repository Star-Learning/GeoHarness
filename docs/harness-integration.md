# GeoHarness 与 DeepSeek Harness 的真实集成方式

本文记录 Phase 0 基线以及 Phase 5 在同一上游版本完成的 Host 集成事实，不把
`GeoHarness_Agentic_GIS_方案_v1.0.md` 中的设想当作现行 API。

## 已核对的上游基线

- 仓库：`../deepseek-harness`
- 分支：`master`
- 提交：`b150a551b8d465e31e418e1b2eaf5e79bbb7d28e`
- 根包版本：`0.1.1-rc.2`
- Cordis 版本：`4.0.1`
- 验证环境：Node.js `v24.19.0`、pnpm `11.22.0`、Windows
- 核对日期：2026-08-27

上游目录可以读取。Phase 0 为验证生产 Web 启动而在上游执行过一次
`pnpm run build`；构建成功，且没有修改任何已跟踪文件。GeoHarness
没有复制或修改上游源码。

## 源码核对范围

| 主题 | 主要事实来源 |
| --- | --- |
| 总体架构 | `docs/architecture.md`；Cordis Loader 组合而成的插件树是运行时核心 |
| Profile | `packages/boot/app-boot/src/profile.ts`、`apps/cli/src/profile-boot.ts` |
| Plugin 管理 | `apps/cli/src/plugin.ts`、`apps/cli/reference/README.md` |
| Bundle | `packages/bundle/base`、`packages/bundle/web-app`、`packages/bundle/headless` |
| Web 与客户端发现 | `packages/client/modules`、`packages/client/web`、`packages/bundle/web-app` |
| Slot | `packages/client/ui-slots`、`packages/client/runtime/src/client/slots.ts`、`packages/client/ui-layout`、`packages/client/ui-conversation` |
| Service | `docs/user/develop/framework/service.md`，以及 `packages/web/web` 的 Definition/Provider/Consumer 分层 |
| Tool | `packages/core/tools`、`packages/web/tool-web`、`docs/user/develop/basic/tool.md` |

同时核对了 `docs/user/develop/basic` 下的开发、配置、工具和发布说明，
以及 Web 搜索服务与 provider 的实现。下列结论以这些当前源码为准。

## 结论：GeoHarness 是外部 Bundle 层，不是 Harness fork

当前版本的正确扩展单位是一个可安装 npm 包。这个包可以同时具有：

1. Host 插件入口，即包的 `.` 导出；
2. Bundle 声明，即 `dsh.bundle.patch` 指向一个 Cordis patch；
3. Web 客户端入口，即 `dsh.client` 声明和 `./client` 导出。

CLI 将包安装到 `$DSH_HOME/profiles/<name>` 管理的 profile 中，并把声明
了 `dsh.bundle` 的依赖自动加入该 profile 的 `dsh.profile.bundles` 有序
层栈。Bundle patch 中的 Loader 行再把 Host 插件挂入组合树。

因此 GeoHarness 仓库不应该：

- 复制 `../deepseek-harness` 的源码；
- 长期修改上游仓库；
- 自己提交或手写 `$DSH_HOME/profiles/.../package.json`；
- 绕过 Harness 另做一套无关的 Chat + Map 应用。

本仓库的 Phase 0 骨架采用一个双面包：
`bundle/geoharness-bundle`。包名是
`@geoharness/harness-plugin`，既是可安装 Bundle，也是最小 Host/Client
插件。以后可以按领域拆包，但不需要为了 Phase 0 提前制造包层级。

## Profile 与 Bundle 的实际装配

安装到现成 Web profile 的正式命令形态是：

```sh
dsh plugin --profile web add ./bundle/geoharness-bundle
dsh --profile web --dump-config
dsh --profile web --no-open
```

`dsh plugin` 实际是在 profile 目录中转发 pnpm 命令，然后依据已安装包
的 `dsh.bundle` 声明重算 `dsh.profile.bundles`。相对文件路径会先锚定到
调用 `dsh` 的目录。新增或移除 Bundle 后必须重启 profile；普通 profile
patch 修改支持热重载。

当前骨架的关键 manifest 是：

```json
{
  "exports": {
    ".": { "default": "./index.js" },
    "./client": { "default": "./client.js" }
  },
  "dsh": {
    "bundle": { "patch": "./cordis.patch.yml" },
    "client": {
      "platform": "web",
      "inject": [
        "@deepseek-ai/dsh-client-runtime",
        "@deepseek-ai/dsh-client-ui-conversation",
        "@deepseek-ai/dsh-client-ui-layout"
      ]
    }
  }
}
```

其 patch 只插入一个启用的 Loader 行：

```yaml
- insert:
    - id: geoharness-plugin
      name: '@geoharness/harness-plugin'
```

Profile 的 Bundle 按声明顺序叠加；后层可按行 id 覆盖前层。上游明确规定
patch 替换目标行的完整 `config`，不是深合并。后续写 profile override
时必须重述需要保留的配置字段。

## Web 客户端插件的真实发现链

Web 客户端不会扫描 GeoHarness 仓库，也不会因为存在一个前端文件就自动
加载。当前链路是：

```text
启用的 Host Loader 行
  → 解析该行的 npm 包
  → 读取 package.json 的 dsh.client
  → 解析 exports["./client"]
  → 将 client.js 暴露为 /plugins/<package>/client.js
  → 写入 window.__DSH_BOOT__ 依赖图
  → 浏览器 ClientModuleSystem 加载 lazy-CJS factory
  → Cordis Client Loader 激活插件
```

`dsh.client.inject` 是客户端 Cordis 插件之间的激活依赖，不等同于 JavaScript
源码的 import 列表。当前客户端产物格式通过
`window.__ModuleLoader__.load({ id, factory })` 交接。React、Cordis、Slot
基础包等由 Web 的固定 module seed 提供；动态包依赖则需要
`dsh.client.external`。

Phase 0 的 `client.js` 是刻意保持最小的预构建 factory，用来证实发现链和
Slot 注册。它不是后续 UI 的构建方案。进入 Phase 1 前要在 GeoHarness
仓库内建立独立、类型化、可复现的客户端构建流程，产出同样的 `client.js`
协议；不能直接依赖上游仓库内部的 `packages/client/tsdown.client.ts`。

## Slot 选择

Slot 是当前 Web UI 的公开组合边界。插件注册顺序与 Slot 声明顺序互不保证，
所以外部插件必须等待声明生命周期：

```js
ctx.slots.inject('conversation.view', () =>
  ctx.slots.register({
    name: 'conversation.view',
    id: 'geoharness',
    label: 'GeoHarness',
  }, GeoHarnessView),
)
```

Phase 0 只使用两个加法型 Slot：

- `conversation.view`：session scope 的 list slot，新增一个独立视图标签；
- `shell.overlay`：root scope 的 list slot，新增一个全局浮层标记。

不能注册到 `root`。当前 `SlotRegistry` 源码明确警告：`root` 是 single slot，
由 `ui-layout` 的完整 AppFrame 占用；动态注册的新条目会遮蔽整个应用框架，
同时让框架声明的所有子 Slot 消失。

是否能仅靠现有 Slot 完成方案中的完整三栏 GIS Workspace，需要在后续阶段用
真实地图组件验证。如果不足，应提供 GeoHarness 自己的 Web surface/bundle
和 profile patch，但仍复用 Harness Host、Agent、Service、Tool 与会话体系，
而不是修改上游源码或另做无关站点。Phase 0 不做这个产品决策。

## Service 与 Tool 的实际接入（Phase 5）

GeoHarness 没有把 provider 实现直接塞入 model-facing Tool。当前实现沿用
`web` 能力展示的三角色结构：

1. **Service Definition**：定义 `ctx.geo` 服务、请求/结果词汇、provider
   registry、选择策略和结构化错误；
2. **Provider**：实现本地/远端 GIS 引擎能力并注册到 `ctx.geo`；
3. **Consumer**：Geo Tool 只通过 `ctx.geo` 执行，拥有模型可见的名称、描述、
   schema、提示和展示。

Host 包的 `index.js` 先实例化 `GeoRuntime extends Service`，再注册
`LocalPythonGeoProvider`，最后注册 Tool consumers。插件声明
`inject = ['tools', 'systemPrompt']`，因此只有官方 Tool 与 system-prompt 服务就绪后
才激活。默认 provider 每次请求启动一个可取消的 Python runner；workspace 按
Harness session id 和 Scenario id 隔离，派生层以 GeoPackage 和 registry metadata
持久化在 `.geoharness/workspaces` 下。

全部 12 个工具都以当前 `@deepseek-ai/dsh-tools` API 注册：

```ts
ctx.tools.register(defineTool({
  // name, description, parameters, execute, output ...
}))
```

工具返回的统一 `ToolResult` 是 canonical result；`output.render` 生成给模型阅读的
有界文本，`output.presentationMeta` 保留 tool、success、outputs 和 summary。参数由
Harness schema 校验，调用使用 Harness timeout/cancellation pipeline。`list_layers`
是 Scenario 入口：首次调用时先通过 Service 加载该 Scenario 自有数据，后续工具只
接受 canonical Layer ID。模型 guidance 明确规定
`Goal → Plan → Geo Tools → Layers → Map → Verify → Result`。

当前本地 provider 的请求协议不是 Harness API，而是 GeoHarness 内部边界：Host
以单个 JSON stdin 调用 `python -m geoharness_geo.runner`，runner 只返回单个 JSON
stdout。支持 `load_scenario`、`tool`、`layers`、`geojson` 四种动作。这个边界允许
以后增加远端 provider，而不改变模型可见 Tool schema。

Phase 5 通过两层真实验证：

- `Context + SystemPrompt + ToolRuntime` 注册全部 12 个 Tool schema，并执行
  `list_layers → transform_crs → create_buffer → spatial_filter`；Python provider
  对 Scenario 02 返回固定空间结果 5。
- 隔离 profile 启动完整官方 Harness Web，Host 插件无激活错误，浏览器同时发现
  DSH Web surface 与 GeoHarness client 标记。验证环境没有外部模型 API Key，故
  不伪造端到端模型生成；ToolRuntime 入口之后的真实执行链已经覆盖。

## Host ↔ Client 地图验证通道（Phase 7）

当前上游的正式双端扩展点是 `@deepseek-ai/dsh-client-connection` 的 generic RPC。
GeoHarness Host 通过 `ctx.connection.rpc.handle('/geoharness', ...)` 注册 loopback-only
channel，客户端把 `connection` 加入 Cordis inject 后通过
`ctx.connection.rpc.call(...)` 调用。没有新增第二个 Web 服务，也没有绕过 Harness
transport/trust fence。

公开两个 bounded endpoint：`scenario/run` 执行官方 Scenario DAG 并返回 step/layer/map
projection，`scenario/latest` 读取同一 workspace + Scenario 的最近结果。请求只接受六个
官方 Scenario id 和有界 workspace key。成功执行后 Host 会核对 Registry
`generated_by`、parents、feature count、output alias 和 canonical display GeoJSON；只有
全部通过才返回 `map_verification.status = ready`。浏览器拒绝 failed projection。

Phase 7 在隔离 profile 中实际 POST 该官方 RPC channel，Scenario 02 返回 Task Graph
`success`、Map Verification `ready`、四项检查全为 true，candidate layer 为 5 个要素；
浏览器同时成功激活声明 `slots + connection` 的 GeoHarness client。

## Phase 0 真实验证

隔离验证使用 GeoHarness 工作区下、被 `.gitignore` 忽略的临时 `DSH_HOME`，
没有污染用户现有 profile：

```powershell
$env:DSH_HOME = '<GeoHarness>/.tmp/dsh-home-phase0-runtime'
node ../deepseek-harness/apps/cli/lib/bin.js plugin --profile web add `
  '<GeoHarness>/bundle/geoharness-bundle'
node ../deepseek-harness/apps/cli/lib/bin.js --profile web --dump-config
node ../deepseek-harness/apps/cli/lib/bin.js web --no-open --port 31987
```

确认结果：

- profile manifest 的层栈为 `dsh-base`、`dsh-web-app`、
  `@geoharness/harness-plugin`；
- `--dump-config` 返回 0，组合配置包含 `geoharness-plugin` 行；
- Web 启动并监听 `http://127.0.0.1:31987`；
- `/` 返回 200，注入的 `window.__DSH_BOOT__` 含 GeoHarness 节点以及三个
  声明的 client inject；
- `/plugins/@geoharness/harness-plugin/client.js` 返回 200；
- 本仓库测试在 VM 中执行该 factory，并确认两个 Slot 注册及诊断组件标记；
- 上游仓库最终没有已跟踪改动。

本仓库的可重复静态验证命令是：

```sh
pnpm test
pnpm run verify:phase0
```

## 当前版本限制

- Phase 0 没有地图、图层注册表、Geo Service、Geo Tool、Task Graph、Scenario
  或数据处理代码。
- 当前客户端文件只用于集成探针；生产 UI 必须先补独立构建链。
- HTTP 发现、产物服务和 factory/Slot 行为已验证，但尚未建立真实浏览器 UI
  截图回归。
- 在本次 Windows + Node 24.19.0 环境中，上游源码入口
  `node --import tsx/esm apps/cli/src/bin.ts ...` 会因
  `profile-boot.ts` 运行时导入 Cordis 的 `const enum FiberState` 而失败；同一
  提交构建后的 `apps/cli/lib/bin.js` 可正常安装、dump 和启动 Web。GeoHarness
  不应在上游仓库内修补此问题。
