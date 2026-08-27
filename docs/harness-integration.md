# GeoHarness 与 DeepSeek Harness 的真实集成方式

本文记录 Phase 0 基线以及 Phase 1–10 在同一上游版本完成的 Host、Client、Tool、
Connection RPC 和真实 Web 集成事实，不把 `GeoHarness_Agentic_GIS_方案_v1.0.md`
中的设想当作现行 API。

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

本仓库的 v1.0 集成采用一个双面包：
`bundle/geoharness-bundle`。包名是
`@geoharness/harness-plugin`，既是可安装 Bundle，也是 Host/Client
插件。以后可以按领域拆包，但 v1.0 不额外制造包层级。

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
        "@deepseek-ai/dsh-client-connection",
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

Phase 0 曾用最小 factory 证实发现链和 Slot 注册。Phase 1 起已在 GeoHarness
仓库内建立独立、类型化、可复现的客户端构建流程；当前 `client.js` 由正式源码、
样式和六个 Scenario 数据生成，仍遵循同一 lazy-CJS 协议，且不依赖上游仓库内部的
`packages/client/tsdown.client.ts`。

## Slot 选择

Slot 是当前 Web UI 的公开组合边界。插件注册顺序与 Slot 声明顺序互不保证，
所以外部插件必须等待声明生命周期：

```js
ctx.slots.inject('conversation.session.header.actions', () =>
  ctx.slots.register({
    name: 'conversation.session.header.actions',
    id: 'geoharness-gis',
  }, GeoHarnessHeaderAction),
)
ctx.slots.inject('shell.overlay', () =>
  ctx.slots.register({
    name: 'shell.overlay',
    id: 'geoharness-gis-panel',
  }, GeoHarnessPanel),
)
```

GeoHarness v1.0 只使用两个加法型 Slot：

- `conversation.session.header.actions`：session scope 的 list slot，在 Harness 原对话标题栏
  增加一个原生风格的“GIS 地图”按钮；
- `shell.overlay`：root scope 的 list slot，承载由该按钮开关的右侧 GIS 工作区。

GeoHarness 不再注册 `conversation.view`，所以不会新增 `GeoHarness` 标签。按钮和面板均是
Harness AppFrame 中已有公开 seat 的加法型扩展；面板使用 DSW theme tokens，跟随原页面
背景、标签、边框、交互和业务蓝色，不复制或长期修改上游 UI 源码。

不能注册到 `root`。当前 `SlotRegistry` 源码明确警告：`root` 是 single slot，
由 `ui-layout` 的完整 AppFrame 占用；动态注册的新条目会遮蔽整个应用框架，
同时让框架声明的所有子 Slot 消失。

当前真实 Web 验证确认，`shell.overlay` 可以在保留原对话页和标题栏的同时容纳三栏
GIS Workspace、SVG 矢量地图、Layer Panel、Task 状态与 Prompt composer；720p 高度约束
由 drawer 自身处理。因此 v1.0 不需要独立标签或独立 Web surface，更没有修改上游源码
或另做无关站点。

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
  对 Scenario 02 返回固定空间结果 132。
- 隔离 profile 启动完整官方 Harness Web，Host 插件无激活错误，浏览器同时发现
  DSH Web surface 与 GeoHarness client 标记。验证环境没有外部模型 API Key，故
  不伪造端到端模型生成；ToolRuntime 入口之后的真实执行链已经覆盖。

## Host ↔ Client 地图验证通道（Phase 7）

当前上游的正式双端扩展点是 `@deepseek-ai/dsh-client-connection` 的 generic RPC。
GeoHarness Host 通过 `ctx.connection.rpc.handle('/geoharness', ...)` 注册 loopback-only
channel，客户端把 `connection` 加入 Cordis inject 后通过
`ctx.connection.rpc.call(...)` 调用。没有新增第二个 Web 服务，也没有绕过 Harness
transport/trust fence。

公开三个 bounded endpoint：`scenario/run` 执行官方 Scenario DAG 并返回 step/layer/map
projection，`scenario/latest` 读取同一 workspace + Scenario 的最近结果，
`scenario/revise` 接受 v1.0 Scenario 05 中有明确数值与单位的距离修订。请求只接受七个
官方数据 Scenario id 和有界 workspace key；修订 endpoint 进一步限制为 Scenario 05 及
0–100 km 的正距离。成功执行后 Host 会核对 Registry
`generated_by`、parents、feature count、output alias 和 canonical display GeoJSON；只有
全部通过才返回 `map_verification.status = ready`。浏览器拒绝 failed projection。

修订没有重新创建整张 Task Graph：Host 在原 execution 上计算被修改 step 的下游闭包，
只把这些 step 从 `success/failed` 退回 `pending`，清除其当前 alias 绑定并重跑；未受影响的
上游 step、结果和 Layer ID 保持不变。每轮在 `run_history` 中记录参数变化、executed steps、
reused steps 与用户原始理由。Registry 中被替代的派生 Layer 不删除，而是投影为
`active=false` 并用历史 success transition 验证 lineage；客户端地图只合并 active Layers。
这是建立在 Harness Connection RPC、Geo Service、Task Graph 与 Layer Registry 之上的局部
修订，不是浏览器端伪造新结果。

Phase 7 在隔离 profile 中实际 POST 该官方 RPC channel，Scenario 02 返回 Task Graph
`success`、Map Verification `ready`、四项检查全为 true，candidate layer 为 132 个要素；
浏览器同时成功激活声明 `slots + connection` 的 GeoHarness client。

Phase 9 又通过真实 Connection RPC、TaskGraphRuntime 和 Python/GeoPandas provider 连续执行
`scenario/run` 与 `scenario/revise`：Scenario 05 从 500 m / 329 个候选更新为
200 m / 205 个候选，history 为 2 轮；仅
`buffer_major_roads`、`filter_candidate_buildings` 重跑，三个上游 step 被复用，最终
Map Verification 仍为 `ready`。

## 七个官方数据 Scenario 的真实 Web 验证

Phase 10 在同一 DeepSeek Harness `0.1.1-rc.2`、提交 `b150a551` 的完整 Web profile
中分别运行七个独立 Scenario，不使用另建的 Chat + Map 页面。浏览器显示的 Plan 来自
各自 `task-graph.json`，Tools 通过 Host Service 调用 Python GIS provider，派生 Layers
通过官方 Connection RPC 投影到原对话页内打开的 `shell.overlay` GIS 面板。真实结果为：

| Scenario | Harness UI 中确认的结果 |
| --- | --- |
| 01 Building Data Inspection | 360 个有效 MultiPolygon，height_m 缺失 0 |
| 02 River Building Query | 132 个河流 500 m 邻近建筑 |
| 03 Statistics by District | 360 个建筑按 MN-101/102/103 分为 162 / 40 / 158 |
| 04 Broadway Accessibility | 249 个 Broadway 300 m 可达建筑，分区为 130 / 8 / 111 |
| 05 Parameter Revision | 500 m 为 329，修订 200 m 后为 205；2 rerun、3 reused、history 2 |
| 06 Multi-Constraint Selection | 27 个多约束候选 |
| 07 Official NYC Building Inspection | 133 个有效 MultiPolygon，建成年份缺失 2 |

每个 Scenario 目录保存初始与结果两类 1280×720 Harness 截图、由这些真实截图生成的
960×540 Demo GIF、视频脚本、README、独立数据与独立回归。`build-demo-media.py --check`
验证 GIF 可复现；Phase 10 的 7 项测试直接解析 JPEG/GIF 文件格式、尺寸、帧数和目录
契约。最终 `pnpm run verify:phase10`、Node 41 项、Python 7 项和 `pnpm peers check`
全部通过。这证明 v1.0 的展示层仍走已确认的 Bundle/Slot/Connection 集成链，而不是
在文档收尾阶段引入平行应用。

## Scenario 07 聚焦快照

Scenario 07 沿用上述同一 Bundle、标题栏 action + `shell.overlay`、Connection RPC、TaskGraphRuntime、
Python provider、Layer Registry 与 Map Verification 链路。输入是独立的
NYC Open Data `BUILDING`（`5zhs-2jue`）在固定 Lower Manhattan bbox 内的 2026-08-27
审计快照：133 个 MultiPolygon。官方来源、Socrata 查询、publisher、source update、
Terms of Use、空间范围与字段规范化均记录在 GeoJSON metadata 和 Scenario README。

完整 Harness Web 实测两次执行均为 3/3 success、Map `ready`；输入和面积派生 Layer 均为
133 个要素，点击 `calculate_geometry` step 只高亮 `buildings_with_geometry`。真实日期属性
在 canonical GeoJSON 边界序列化为字符串；完整重跑会先清理该已解析 workspace 的旧派生
文件，避免重复运行产生 stale Layers。官方数据截图和由截图生成的 GIF 保存在 Scenario
自己的目录，并由独立资产测试验证。

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
- `/` 返回 200，注入的 `window.__DSH_BOOT__` 含 GeoHarness 节点以及当时三个
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

- v1.0 精确对齐 Harness `0.1.1-rc.2`、Cordis `4.0.1`。升级时必须重新核对
  Bundle manifest、lazy-CJS 客户端协议、Slot、Connection、Service 与 Tool API。
- 在本次 Windows + Node 24.19.0 环境中，上游源码入口
  `node --import tsx/esm apps/cli/src/bin.ts ...` 会因
  `profile-boot.ts` 运行时导入 Cordis 的 `const enum FiberState` 而失败；同一
  提交构建后的 `apps/cli/lib/bin.js` 可正常安装、dump 和启动 Web。GeoHarness
  不应在上游仓库内修补此问题。
- 七个 Scenario 都使用带固定查询与日期的 NYC Open Data 快照。Scenarios 01–06 的未改动
  下载响应统一保存在 `data/official-sources/nyc/`，派生脚本校验 SHA256 与 feature count；
  每个 Scenario 仍保存自己的独立数据副本。刷新快照必须显式审查统计变化。
- 当前环境没有外部模型 API Key，因此最终验收不依赖付费模型请求。Harness
  `SystemPrompt + ToolRuntime` 边界、全部 Tool schema、真实 GIS 执行、Task Graph、
  Connection RPC 与 Web UI 已分别做确定性验证。
- v1.0 的自然语言局部修订只承诺 Scenario 05 的有界距离修改；通用自由文本规划、
  任意 DAG 重写、栅格/3D/时空分析和远端生产 provider 均不在当前范围内。
