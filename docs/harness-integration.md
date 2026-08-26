# GeoHarness 与 DeepSeek Harness 的真实集成方式

本文只记录 Phase 0 在当前上游源码中确认过的事实，不把
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

## 后续 Service 与 Tool 的接入原则

Geo 能力不应把 provider 实现直接塞入 model-facing Tool。当前 Harness 的
`web` 能力给出了可复用的三角色结构：

1. **Service Definition**：定义 `ctx.geo` 服务、请求/结果词汇、provider
   registry、选择策略和结构化错误；
2. **Provider**：实现本地/远端 GIS 引擎能力并注册到 `ctx.geo`；
3. **Consumer**：Geo Tool 只通过 `ctx.geo` 执行，拥有模型可见的名称、描述、
   schema、提示和展示。

工具应以当前 `@deepseek-ai/dsh-tools` API 注册：

```ts
ctx.tools.register(defineTool({
  // name, description, parameters, execute, output ...
}))
```

工具返回的结构化值应作为 canonical result；`output.render` 负责生成给模型
阅读的有界文本，必要时用 `output.presentationMeta` 保留 UI 展示所需的结构
信息。超时、审批、沙箱和执行 hook 应继续走 Harness 的 Tool pipeline。
这些是后续实现约束，不是 Phase 0 已实现功能。

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
