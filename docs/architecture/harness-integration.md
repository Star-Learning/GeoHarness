# GeoHarness 与 DeepSeek Harness 的真实集成方式

> **文档状态**：当前实现事实与上游兼容性基线；上游版本变化后必须重新核对。

本文记录当前仓库实际使用的 Harness API。结论来自 `../deepseek-harness` 当前源码，不把
[`GeoHarness_Agentic_GIS_方案_v1.0.md`](../planning/GeoHarness_Agentic_GIS_方案_v1.0.md) 中的示意名称当作现行接口。

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
      → Workspace/Project/Session history(sidebar.workspaces) # 原生
      → SettingsRoot(sidebar.settings)             # 原生
  → ConversationRoot(conversation)
      → GeoHarnessShell(conversation.session)
          → GeoHarnessLayerPanel(map overlay)
      → InputBar(conversation.composer.bar)         # 原生
          → ModelSelect(conversation.input.model)   # 原生
```

GeoHarness 的三个注册均只占用已由上游父 Entry 声明的 Slot：

```ts
ctx.slots.register({ name: 'conversation.session', priority: -100 }, GeoHarnessShell)
ctx.slots.register({ name: 'sidebar.brand.mark', priority: -100 }, GeoHarnessBrandMark)
ctx.slots.register({ name: 'sidebar.brand.name', priority: -100 }, GeoHarnessBrandName)
```

GeoHarness 刻意不注册 `sidebar.workspaces`，因此项目选择、项目内历史会话、新建会话和旧会话
切换继续由上游原生 Sidebar 实现；新建会话不会再把旧会话从界面导航中隐藏。GIS Layers 改为
地图内的可收起面板，并按当前真实 Session ID 隔离，首次产生图层时自动展开。

上述三个 Entry 不声明任何 `children`。这是必要约束：`sidebar.settings` 已由原生 `SidebarRoot`
声明，`conversation.input.model` 已由原生 `InputBar` 声明；GeoHarness 若在自己的 Entry 重复声明，
当前 `ui-slots` 会以 `slot "…" is already declared` 拒绝启动。Slot 也有所有权检查，不能从
GeoHarness Entry 跨父级调用 `renderSlot` 绕过。

所以左下角的“设置”按钮、全屏设置面板、模型/Provider/插件页面和 API Key credential 写入
全部仍是 `ui-settings-general/SettingsRoot` 的原生实现。GeoHarness 不复制该 React 源码，
不调用 `settings.describe`/`credentials.set` 自制弹窗，也不接触或回显密钥。

右侧输入区同样是 `ui-conversation/InputBar` 与 `ui-model-selection/ModelSelect` 的原生实例。
GeoHarness 只用上游公开的稳定 DOM 标记 `[data-conversation-scroll]`、`[data-composer-seat]`、
`[data-composer-card]` 把既有 composer seat 定位到 Agent workspace 底部；没有依赖 CSS Modules
哈希类名，也没有复制输入框 JSX。空会话时，上游还会在 composer 上方渲染整页 Hero；GeoHarness
以当前真实 `data-phase="hero"` 和 `data-chain-overlay-fallback="conversation.composer"` 标记只隐藏
“探索未至之境 / 预览版”这一冗余宣传行，工作区、模式、输入框、模型和发送控件不变。

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

- `assistant/chunk` → 按 turn、step、retry attempt 与 block index 合并 `text-delta` /
  `reasoning-delta`，完整保留模型流式输出；
- `llm/retry` → 在同一 Agent Stream 中记录 Provider、失败码与重试次数；
- `tool/call` → 右侧新增 running step，并显示真实 tool 参数；
- `tool/result` → step success/failed，展示 summary 与输出 Layer ID；
- `assistant/message` → 用 Harness 最终消息收敛当前 stream block，而不是只保留最后一句；
- `turn/end` → 整轮完成或错误状态。

Agent Stream、Tool Trace、Layer projection 都由同一个 Session history 轮询周期驱动，因此
模型文本、步骤逐渐打勾和地图图层会按真实事件同步推进；这不是浏览器定时器模拟，也不是
读取 `expected-result.json`。用户后续修改距离等要求仍发送到同一个 Agent session，由模型
结合历史与当前 Layer ID 自主决定下一次工具调用。

## Native Session 到 Run Manifest

Host Bundle 的实际激活依赖是 `tools`、`systemPrompt` 和官方 `sessions` Service。Host 不创建
第二套会话或 Planner，而是在 SessionStore 所属 context 上订阅：

```text
session/event → 按 Session 串行投影并写入 workspace/runs
session/flush → 等待该 Session 已排队的 Run 写入完成
session/disposed → 完成后释放 Session 队列
```

投影只消费 `user/message`、`turn/start`、`request/header`、`request/context`、`tool/call`、
`tool/result`、`assistant/message`、`llm/retry` 和 `turn/end`。它记录用户目标、Provider/Model、
Tool 参数与状态、输入/输出 Layer、最终回答引用、错误分类和 retry，但不会把
`assistant/chunk` 中的隐藏 reasoning 写入 GeoHarness Workspace。

真实 `0.1.1-rc.2` 会话已经确认 `turn/start` 先于该轮 `user/message`。Run projector 不再假定
文档示例中的固定先后关系，而是为未绑定 Goal 的 turn 保留 start event，等真实用户消息到达后
再创建 Run；兼容测试同时覆盖 `user/message → turn/start`。该适配是当前 Harness 源码/运行事件
得出的真实集成方式，不依赖猜测 API 顺序。

`session/flush` 是本版本确认过的真实集成点：Harness 在 flush 时会等待监听器返回的 Promise，
因此 Session event log 与相应的 Run Manifest 不会在正常 flush 后发生时序缺口。客户端通过
loopback-only `agent/runs` RPC 恢复最近运行，并与 `sessions.history` 的实时 Agent Stream 分工：
前者负责可恢复摘要，后者负责当轮流式展示。完整 schema、并发一致性和五类修订验证见
[`run-manifest.md`](run-manifest.md)。

## 数据发现与 14 个 Geo Tools

Host 通过当前 `@deepseek-ai/dsh-tools` API 注册 14 个 `defineTool` consumer。`discover_datasets`
返回部署可用的数据能力；`inspect_dataset` 和 `list_layers(dataset_id)` 检查或激活所选 catalog，
矢量分析/导出工具只接受返回的 canonical Layer ID。`inspect_satellite_view@0.3.0` 是例外：它接收
用户授权的当前视野，或接收 Agent 从用户 Prompt 原样提取的 `place_name`，通过 Esri World Geocoding
实时解析候选中心；对具有行政区 Polygon/MultiPolygon 的地名，再从 OpenStreetMap Nominatim 获取
边界并以其 bbox 有界读取最多 16 张 World Imagery RGB 瓦片。边界在 Web Mercator 像素空间栅格化，
边界外像素不进入类别统计且 Overlay alpha 为 0。它不会加载 Scenario，也不会把 Raster Overlay 或
OSM 边界伪装成 canonical GeoPackage Layer。

Platform Phase 6 后，这 14 个 Tool 的 name、semver、capability、parameters、`ToolResult@1.0`、
timeout 和 map effect 由 `catalog/builtin-tools.json` 驱动注册；Dataset discovery 和
`list_layers` enum 由实际 `dataset.json` 生成。第三方 Tool 仍注册到相同官方 ToolRuntime，
Agent Stream 与 Result Center 不需要识别具体 Tool 名。版本冲突或缺失 executor 会在 Host
激活/诊断阶段明确暴露，不会由注册顺序静默覆盖。

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

Raster Overlay 使用独立的 `imagery/latest` 投影恢复，不进入 canonical Registry。Host 的
`imagery/preference` RPC 按 Session 和 Raster Layer ID 持久化 `visible` / `opacity`；客户端将它与
矢量 Layer 一起显示在 Layers 面板，并将实际 SVG image opacity 绑定到同一值。Named-place 结果到达
前，Python Tool 会先把解析后的 bbox、OSM geometry 和阶段写入原子的 `imagery/target` 快照。该只读
RPC 是 Provider 唯一绕过同 Workspace 写队列的进度读，因而可在慢速瓦片获取/分类进程仍运行时读取，
不允许修改 Layer 或 Workspace。客户端从当前 bounds 依次插值到 departure、approach 和目标边界，
到达后显示 OSM 边界与加载进度；最终 `imagery/latest` 到达才揭示 Overlay/统计。
`prefers-reduced-motion` 用户直接切换到目标范围。

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

已通过 TypeScript、client build、82 项 Node 测试和 33 项 Python/GeoPandas 测试。真实 provider
已从 `nyc-core-official` 发现并加载官方数据，500 m 河流缓冲测试返回 132/360；Native
Session 事件投影和 Agent workspace RPC 也均有回归。Provider timeout/Abort/进程回收、
Tool 幂等/失败回滚、Layer/GeoJSON 上限、分页投影、并发 Session 和诊断导出的已验证边界见
[稳定性、安全与性能边界](resilience-security.md)。

当前预览实际使用 `.tmp/dsh-home-preview`，其 `ustc / deepseek-v4-flash-ascend1` route 引用
`USTC_API_KEY`，Harness 原生设置也确认该 credential 已配置。失败 Session 的真实事件是连续
六次 `TRANSPORT / Connection error`（包含五次 Harness retry），而不是
`MISSING_CREDENTIAL`、HTTP 401 或认证失败。进一步用同一运行环境的 Node `fetch` 复现到 socket
`EACCES`；允许出站网络后，无凭据访问同一 Base URL 可正常到达并返回预期 HTTP 401，证明
DNS/TLS/HTTP 路径可达。因此该次错误的根因是旧 Harness 服务进程没有 Provider 出站网络权限，
不是“用户没有配置 API Key”。预览已用同一 profile、DSH_HOME 和 credential store 在允许联网
的进程中重启。下一次真实 Prompt 仍需由 Provider 验证凭据本身是否被接受；GeoHarness 不会以
Scenario fallback 掩盖任何模型失败。

上游升级时必须重新核对 Bundle patch、lazy-CJS 协议、`conversation.session`、
`sidebar.workspaces`、`sidebar.settings`、`conversation.composer.bar` 与
`conversation.input.model` 的声明/所有权、Connection Session API、generic RPC、Service 与
Tool contract，不能只修改版本号。
