# GeoHarness Progress

## Phase 0 — Harness integration baseline

状态：完成（2026-08-27）

- [x] 完整阅读 `GeoHarness_Agentic_GIS_方案_v1.0.md`，并将执行范围限制在
  Phase 0。
- [x] 确认 `../deepseek-harness` 可读；记录真实版本、提交和工具链版本。
- [x] 阅读 architecture、plugin、bundle、profile、web、slot、service、tool
  的当前源码和相关文档。
- [x] 确认采用外部 npm Bundle + 双面 Host/Client 插件 + Harness 管理的
  Web profile，不 fork、不复制上游源码。
- [x] 初始化独立 pnpm workspace、忽略规则、根 README 和测试入口。
- [x] 创建最小 `@geoharness/harness-plugin` Bundle：Host 端为空，Client
  端只注入诊断视图和加载标记。
- [x] 创建 `docs/harness-integration.md`，记录经源码和运行时验证的集成方式。
- [x] 建立 4 个 Phase 0 集成测试，覆盖上游基线、Bundle manifest/patch、
  client factory/Slot 注册以及“不 vendoring 上游源码”。
- [x] 在隔离 `DSH_HOME` 中完成本地 Bundle 安装、profile 配置组合、Web
  启动、boot manifest 发现和客户端产物 HTTP 访问验证。
- [x] 确认上游仓库没有已跟踪修改。

## Phase 1 — GeoHarness UI Shell

状态：完成（2026-08-27）

- [x] 建立可复现的 TypeScript/React 客户端构建链，输出 Harness 当前版本要求的
  lazy-CJS `window.__ModuleLoader__.load(...)` 客户端产物。
- [x] 实现 GeoHarness branding、Scenario Launcher、Layer Panel、Map Workspace、
  Agent Workspace 和 Prompt 输入区。
- [x] 六个官方 Scenario 均可选择；选择会载入对应建议 Prompt，提交 Prompt 会更新
  本地 Goal 与 Scenario 状态。
- [x] 使用安全的加法型 Slot：主工作区挂载到 `conversation.view`，品牌状态挂载到
  `shell.overlay`，没有覆盖 Harness `root`。
- [x] 建立 Phase 1 自动测试，覆盖产物可复现性、UI 表面、Scenario 元数据、Slot
  注册、CSS 注入及未提前引入 Phase 3/4 能力。
- [x] 在隔离 Harness profile 中完成真实 Web 验证：Bundle 安装、会话视图加载、
  Scenario 05 切换、Prompt 修改和 Goal 状态更新均通过。
- [x] 通过 TypeScript 类型检查、Phase 0 回归测试和 Phase 1 验证。

## 当前边界

Phase 1 只提供可运行、可交互的 UI Shell。真实 Scenario 数据包、地图引擎、
Layer Registry、Geo Backend、Geo Tools 和 Task Graph 按后续 Phase 顺序实现。

## Phase 2 — Six Scenario Packages

状态：完成（2026-08-27）

- [x] 建立六个独立需求目录；每个目录均包含 README、Prompt、Scenario manifest、
  Expected Plan、Expected Result 和运行所需的独立数据副本。
- [x] Scenario 05 额外包含独立的 `revision-prompt.txt`，明确 500 m → 1 km 的
  参数修改目标与 4 → 8 的固定候选数量。
- [x] 建立可复现的 `scripts/build_scenarios/build-fixtures.mjs`，支持生成和
  `--check` 新鲜度验证。
- [x] 数据使用 CC0-1.0、OGC:CRS84 的小型确定性 Manhattan-scale fixture；
  每个 README 明确记录来源、许可、生成日期、处理方法和非官方数据性质。
- [x] 为六个 Scenario 分别建立一个独立测试文件，验证目录自包含、数据合法、
  Prompt/Plan/Result 契约和 Scenario 特定期望。
- [x] 使用 GeoPandas/Shapely/UTM 18N 对关键固定空间结果做独立抽查：Scenario 02
  为 5，Scenario 04 为 3，Scenario 05 为 4 → 8，Scenario 06 为 2。

## Phase 2 边界

本阶段只建立可执行需求包和固定测试数据。Scenario 自动加载、地图渲染和真实
空间工具调用分别在 Phase 3、Phase 4 和 Phase 5 实现。

## Phase 3 — Layer Registry + Map

状态：完成（2026-08-27）

- [x] 创建类型化 Layer Registry，统一记录 Layer ID、名称、几何类型、CRS、
  feature count、source、scenario、lineage 占位、storage path、创建时间、显隐、
  透明度、样式和 canonical GeoJSON。
- [x] 客户端构建从六个 Scenario manifest 读取并嵌入各自数据；Scenario Launcher
  切换时真实加载、解析和注册对应图层，不依赖 Harness 静态服务器额外暴露仓库文件。
- [x] 实现 GeoJSON FeatureCollection 上传、校验和注册；无效 JSON/GeoJSON 会显示
  有界错误而不污染 Registry。
- [x] 实现真实矢量地图：Polygon、LineString、MultiPolygon、MultiLineString、
  Point/MultiPoint 投影到 SVG，支持缩放、平移和 Fit Bounds。
- [x] 实现图层显隐、透明度、排序、可见数/CRS 状态，以及地图要素点击高亮与属性检查。
- [x] 建立 4 项 Phase 3 测试；全量 17 项测试通过。
- [x] 在隔离 Harness Web profile 中真实验证 Scenario 02/04 加载、图层注册、显隐、
  1.4× 缩放、Scenario 切换和 Building 属性检查。
- [x] 根据 1280×720 真实截图修正 Harness 会话容器高度，最终同时显示 GeoHarness
  顶栏、地图、图层列表、Agent 面板和 Prompt composer。

## Phase 3 边界

地图当前渲染 Scenario 输入矢量层；Geo Backend 生成的中间/结果层、Tool 调用和
`Task Step ↔ Layer ↔ Map` 验证分别在 Phase 4、Phase 5 和 Phase 7 实现。

## Phase 4 — Geo Backend + Tools

状态：完成（2026-08-27）

- [x] 建立独立 `backend/geo-service` Python 包、FastAPI 本地服务、CLI、依赖声明和
  运行说明；默认仅绑定 `127.0.0.1`。
- [x] 实现磁盘持久化 Layer Registry：canonical GeoPackage、`registry.json`、
  lineage、参数、bbox、CRS、feature count 和安全 workspace-relative path。
- [x] 完成 12 个真实矢量工具：`inspect_dataset`、`list_layers`、
  `transform_crs`、`create_buffer`、`spatial_filter`、`spatial_join`、
  `clip_layer`、`aggregate_by_region`、`calculate_geometry`、`nearest_features`、
  `analyze_distribution`、`export_layer`。
- [x] 所有 Tool 返回统一 `ToolResult`；错误也结构化返回且不注册半成品图层。
- [x] 实现 `/health`、Layer 导入/列表/元数据/GeoJSON 和 Tool 执行 API；导入路径
  限制在显式 Scenario roots，CORS 限制为 localhost。
- [x] 创建 `docs/tool-spec.md`，记录真实工具、Layer 和 HTTP 契约及 CRS 规则。
- [x] 7 项 Python 测试覆盖全部 12 个工具、持久化、API、安全边界和失败原子性；
  固定工作流验证 Scenario 02=5、Scenario 03=6/6、Scenario 06=3→2。

## Phase 4 边界

Geo Backend 目前由测试/API 直接调用。让 Harness Agent 通过当前 `ctx.tools` API
自主调用这些能力属于 Phase 5。

## Phase 5 — Harness Tool Integration

状态：完成（2026-08-27）

- [x] 实现 `GeoRuntime extends Service`，提供 provider 注册、显式选择、可用性检查和
  结构化 provider 错误；Host Tool 不直接依赖 Python 细节。
- [x] 实现 `LocalPythonGeoProvider` 与单请求 JSON runner；子进程可取消、输出有界，
  workspace 按 Harness session 与 Scenario 隔离。
- [x] 使用当前官方 `defineTool` API 注册全部 12 个 Geo Tools，包含参数/输出 schema、
  timeout、model render、presentation metadata 和 system-prompt guidance。
- [x] `list_layers` 可加载六个独立 Scenario；后续操作只使用 canonical Layer ID，
  backend 成功与失败都保持统一 `ToolResult`。
- [x] 官方 `Context + SystemPrompt + ToolRuntime` 测试通过 12 个 schema，并真实执行
  Scenario 02 的 `list → transform → buffer → filter`，固定结果为 5。
- [x] schema 拒绝、未知 Layer/backend failure 都在 Harness boundary 保持结构化。
- [x] `pnpm peers check` 无缺失 peer；精确对齐 Harness `0.1.1-rc.2` 与 Cordis
  `4.0.1`。
- [x] 在隔离 profile 启动完整 Harness Web；Host 插件无激活错误，浏览器确认官方
  Web surface 与 GeoHarness client 标记共同加载。

## Phase 5 边界

当前环境没有外部模型 API Key，因此没有把一次付费/联网模型生成作为离线验收条件。
模型可见 schema、system prompt、官方 ToolRuntime 到 Python GIS 的完整边界已用真实
实现测试。Task Graph 的运行状态与依赖调度属于 Phase 6。

## Phase 6 — Task Graph

状态：完成（2026-08-27）

- [x] 六个独立 Scenario 各自增加真实 `task-graph.json`，与自己的 Prompt、数据、
  expected plan/result 同目录；生成器和新鲜度检查覆盖这些 DAG。
- [x] 实现 Task Graph 校验：稳定 step id、依赖存在性、自依赖、循环、重复 output
  alias、参数/输出结构均有明确失败。
- [x] 实现可观察状态机：`pending → running → success/failed`，每次转换写入有序 history，
  snapshot 同时包含 dependencies、resolved parameters、outputs 和 Layer alias map。
- [x] 实现 DAG 调度：成功依赖解锁下游；失败依赖明确阻断其分支，独立分支继续；Tool
  exception、失败 ToolResult 和输出数量不符都不会被误标为成功。
- [x] 实现 Harness `TaskGraphRuntime` Service：安全读取 Scenario DAG，通过 `ctx.geo`
  真实执行，并按 workspace + Scenario 保存最近一次运行。
- [x] 正式客户端嵌入同一份 DAG，Agent 面板真实显示 step、tool、dependencies、outputs
  和 pending 状态，不维护第二套手写 Demo 计划。
- [x] 3 项 Phase 6 测试通过；其中 Scenario 02 经真实 Python provider 完成 6 步、
  12 次转换并得到 5 个候选建筑，另覆盖循环拒绝和失败分支传播。
- [x] 完整 Harness Web 再次成功加载 Host 插件和 GeoHarness client；新 profile 尚未选择
  workspace 时按上游设计只显示品牌标记，DAG 客户端产物由可复现构建测试验证。

## Phase 6 边界

本阶段建立执行与状态真相源，但尚未把成功 step 的派生 Layer/GeoJSON 投影到浏览器
地图；`Task Step ↔ Layer ↔ Map` 的验证投影属于 Phase 7。参数修改与部分重跑属于
Phase 9。
