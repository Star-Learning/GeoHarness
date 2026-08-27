# GeoHarness 与 DeepSeek Harness 的真实集成方式

本文记录当前仓库实际使用的 Harness API。结论来自 `../deepseek-harness` 当前源码，不把
`GeoHarness_Agentic_GIS_方案_v1.0.md` 中的示意名称当作现行接口。

## 已核对基线

- 上游仓库：`../deepseek-harness`，可正常只读访问
- 分支与提交：`master` / `b150a551b8d465e31e418e1b2eaf5e79bbb7d28e`
- Harness 版本：`0.1.1-rc.2`
- Cordis 版本：`4.0.1`
- 验证环境：Windows、Node.js `v24.19.0`、pnpm `11.22.0`
- 核对日期：2026-08-27

核对范围包括上游总体 architecture、CLI profile/plugin 管理、base/web/headless bundles、
Web client module discovery、Slot runtime、Service Definition/Provider/Consumer 分层、Session
Connection API 和 ToolRuntime/`defineTool`。主要事实来源为：

| 主题 | 当前上游实现 |
| --- | --- |
| Architecture / Loader | `docs/architecture.md`、Cordis Loader 组合树 |
| Profile / Plugin | `packages/boot/app-boot/src/profile.ts`、`apps/cli/src/profile-boot.ts`、`apps/cli/src/plugin.ts` |
| Bundle | `packages/bundle/base`、`packages/bundle/web-app`、`packages/bundle/headless` |
| Web client | `packages/client/modules`、`packages/client/web`、`packages/bundle/web-app` |
| Slot / AppFrame | `packages/client/runtime/src/client/slots.ts`、`packages/client/ui-slots`、`packages/client/ui-layout` |
| Session API | `packages/client/connection` 的 `sessions.create/models/history/prompt` 实现和测试 |
| Service | `docs/user/develop/framework/service.md`、`packages/web/web` |
| Tool | `packages/core/tools`、`packages/web/tool-web`、`packages/client/ui-tool` |

GeoHarness 没有复制或修改上游已跟踪源码。上游只作为构建产物和 API 事实来源。

## 扩展单元：一个双面外部 Bundle

当前版本的正确扩展单元是可安装 npm 包 `bundle/geoharness-bundle`：

1. 包导出 `.` 作为 Host Cordis 插件；
2. `dsh.bundle.patch` 指向 `cordis.patch.yml`，让 profile 将 Host 插件插入组合树；
3. `dsh.client` 和 `./client` 导出把浏览器模块交给 Harness Web module registry。

Web 发现链是真实的：

```text
profile bundle stack
  → enabled Cordis Loader row
  → package.json dsh.client + exports["./client"]
  → /plugins/<package>/client.js
  → window.__DSH_BOOT__ dependency graph
  → window.__ModuleLoader__.load({ id, factory })
  → Cordis client plugin activation
```

`dsh.client.inject` 表示客户端 Cordis 激活依赖，并不是源码 import 清单。当前 GeoHarness
客户端只注入 `@deepseek-ai/dsh-client-connection`；React 由 Harness 的固定 Web module
seed 提供。

## 正式 UI 保留 AppFrame，并只替换内层产品区

上游 `packages/client/ui-layout/src/client/index.ts` 把 `AppFrame` 注册到公开的 `root`
single Slot；`AppFrame` 再渲染 `sidebar` 和 `conversation`。本项目现在不再接管 `root`，而是保留
原生装配链：

```text
AppFrame(root)
  → SidebarRoot(sidebar)
      → GeoHarnessLayerPanel(sidebar.workspaces)
      → SettingsRoot(sidebar.settings)             # 原生
  → ConversationRoot(conversation)
      → GeoHarnessShell(conversation.session)
      → InputBar(conversation.composer.bar)         # 原生
          → ModelSelect(conversation.input.model)   # 原生
```

GeoHarness 的四个注册均只占用已由上游父 Entry 声明的 Slot：

```ts
ctx.slots.register({ name: 'conversation.session', priority: -100 }, GeoHarnessShell)
ctx.slots.register({ name: 'sidebar.workspaces', priority: -100 }, GeoHarnessLayerPanel)
ctx.slots.register({ name: 'sidebar.brand.mark', priority: -100 }, GeoHarnessBrandMark)
ctx.slots.register({ name: 'sidebar.brand.name', priority: -100 }, GeoHarnessBrandName)
```

这些 Entry 不声明任何 `children`。这是必要约束：`sidebar.settings` 已由原生 `SidebarRoot`
声明，`conversation.input.model` 已由原生 `InputBar` 声明；GeoHarness 若在自己的 Entry 重复声明，
当前 `ui-slots` 会以 `slot "…" is already declared` 拒绝启动。Slot 也有所有权检查，不能从
GeoHarness Entry 跨父级调用 `renderSlot` 绕过。

所以左下角的“设置”按钮、全屏设置面板、模型/Provider/插件页面和 API Key credential 写入
全部仍是 `ui-settings-general/SettingsRoot` 的原生实现。GeoHarness 不复制该 React 源码，
不调用 `settings.describe`/`credentials.set` 自制弹窗，也不接触或回显密钥。

右侧输入区同样是 `ui-conversation/InputBar` 与 `ui-model-selection/ModelSelect` 的原生实例。
GeoHarness 只用上游公开的稳定 DOM 标记 `[data-conversation-scroll]`、`[data-composer-seat]`、
`[data-composer-card]` 把既有 composer seat 定位到 Agent workspace 底部；没有依赖 CSS Modules
哈希类名，也没有复制输入框 JSX。

视觉层继续使用 DSW background/label/border/business/shadow tokens。三栏以低对比度 surface、
12px 间距、圆角边框和一至三级阴影区分顶栏、工作区、Agent 卡片、composer 与 modal，地图仍
保持最大视觉面积，没有引入另一套高饱和品牌色。

## 正式执行链：Native Harness Agent，不是 Scenario 路由

用户在右侧原生 InputBar 提交后，输入、模型选择、排队/steer、停止和错误处理继续由上游
`ui-conversation` 完成。GeoHarness 客户端只读取当前真实 Session：

```text
sessions.history({ sessionId })
/geoharness agent/workspace { workspace_key: sessionId }
```

`agent-session.ts` 从 `user/message` 中只选择 `source.kind === "user"` 的最近请求，忽略 Harness
与插件注入的上下文，并以该事件 seq 作为本轮基线。随后轮询 `sessions.history`，只投影本轮
新事件：

- `tool/call` → 右侧新增 running step，并显示真实 tool 参数；
- `tool/result` → step success/failed，展示 summary 与输出 Layer ID；
- `assistant/message` → Agent Result；
- `turn/end` → 整轮完成或错误状态。

因此“步骤逐渐打勾”来自 Harness Session 事件，不是浏览器定时器模拟，也不是读取
`expected-result.json`。用户后续修改距离等要求仍发送到同一个 Agent session，由模型结合
历史与当前 Layer ID 自主决定下一次工具调用。

## 数据发现与 13 个 Geo Tools

Host 通过当前 `@deepseek-ai/dsh-tools` API 注册 13 个 `defineTool` consumer。新增的
`discover_datasets` 返回部署可用的数据能力；`list_layers(dataset_id)` 激活所选 catalog，
其他 11 个分析/导出工具只接受返回的 canonical Layer ID。

当前 catalog 为 `examples/datasets/nyc-core-official/dataset.json`，聚合仓库中已审计的 NYC
Open Data 冻结快照：buildings、roads、rivers、districts 和 Lower Manhattan buildings。
它没有 Task Graph、预设距离或预期结论。System Prompt 要求 Agent 遵循：

```text
Goal → Plan → Geo Tools → Layers → Map → Verify → Result
```

并明确禁止从示例 Scenario 推断 distance、predicate、field、output 或 conclusion。如果数据
catalog 不支持请求，Agent 必须说明能力缺口，不能伪造数据。

Geo Tool 通过 `ctx.geo` Service 调用 `LocalPythonGeoProvider`。Provider 每次启动一个可取消
Python runner，使用 GeoPandas/Shapely/PyProj 做真实空间运算，并把 Layer Registry 与
GeoPackage/GeoJSON 结果隔离到 workspace。Harness 参数 schema、timeout、AbortSignal、
`ToolResult.output.render` 和 `presentationMeta` 均保留。

## Agent workspace 到地图

GeoHarness Host 在官方 Connection generic RPC 上注册 loopback-only `/geoharness` channel。
正式 UI 只调用 `agent/workspace`，Host 从 Python Registry 获取 canonical projection，检查：

- metadata `feature_count` 等于 GeoJSON feature 数；
- 每个 parent Layer 都存在；
- Layer metadata、GeoJSON 和 workspace key 均来自当前 Registry。

通过后，客户端的 `registerWorkspaceProjection` 合并图层并保留可见性与透明度状态。地图支持
Layer 显隐、连续透明度拖动、要素检查、pointer pan、fit bounds、工具栏缩放和 0.7×–5×
鼠标滚轮缩放。正式客户端构建产物不再嵌入七个 Scenario GeoJSON。

## Scenario 仍保留，但仅是确定性回归

七个 `examples/scenarios/*`、`TaskGraphRuntime` 和旧 Scenario/goal RPC 仍保留，因为它们提供：

- 每个需求独立的数据、测试、oracle 和 Demo；
- 不依赖模型措辞的空间正确性验证；
- 500 m → 200 m 局部修订、非预设 275 m、lineage 和 Map Verification 回归。

这些 endpoint 不再由正式浏览器调用，Scenario ID 和 fixture GeoJSON 也不进入客户端产物。
它们是测试夹具，不是生产 Agent 的 planner。

## Profile 装配与启动

```sh
dsh plugin --profile web add ./bundle/geoharness-bundle
dsh --profile web --dump-config
dsh --profile web --no-open
```

当前 Windows + Node 24 环境中，上游源码 CLI 入口会遇到 `FiberState` const-enum 运行时导入
问题；同一提交已构建的 `../deepseek-harness/apps/cli/lib/bin.js` 可正常安装、dump 和启动，
本仓库不修改上游规避此问题。

## 已验证与外部边界

已通过 TypeScript、client build、51 项 Node 测试和 9 项 Python/GeoPandas 测试。真实 provider
已从 `nyc-core-official` 发现并加载官方数据，500 m 河流缓冲测试返回 132/360；Native
Session 事件投影和 Agent workspace RPC 也均有回归。

当前进程环境没有 `DEEPSEEK_API_KEY` 或 `OPENAI_API_KEY`。预览 profile 虽然从
`sessions.models` 列出 `ustc / deepseek-v4-flash-ascend1`，两次实际 Prompt 却都在任何
Tool Call 之前以 `Connection error` 结束。因此不能声称“外部模型实际完成自主规划并调用
工具”的 E2E 已通过。该外部条件不允许用 Scenario fallback 掩盖；UI 会明确提示检查
Provider、网络和 API Key，并需要在模型连接可用后补做 planning smoke test。

上游升级时必须重新核对 Bundle patch、lazy-CJS 协议、`conversation.session`、
`sidebar.workspaces`、`sidebar.settings`、`conversation.composer.bar` 与
`conversation.input.model` 的声明/所有权、Connection Session API、generic RPC、Service 与
Tool contract，不能只修改版本号。
