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

## Phase 7 — Map Verification

状态：完成（2026-08-27）

- [x] Task Graph 完成后从 Python Registry 一次性投影真实 metadata + canonical display
  GeoJSON；不从模型文本猜测 Layer 或地图状态。
- [x] 对每个 Layer 验证 feature count、parents 和 `generated_by` lineage；对每个成功
  Task step 验证 declared output alias 可解析到实际 map Layer。
- [x] 只有 `all_step_outputs_linked`、`feature_counts_match`、`lineage_matches`、
  `parent_layers_present` 全为 true 时投影才是 `ready`，客户端拒绝失败投影。
- [x] 基于当前 Harness `ctx.connection.rpc.handle/call` 建立 loopback-only
  `/geoharness` channel，没有新增平行 Web server；payload 限制为六个官方 Scenario。
- [x] 浏览器把 verified derived Layers 合并到已有输入层；Task step 状态可点击，输出
  Layer Registry 行与真实 SVG 要素同步高亮，失败信息显式显示。
- [x] 3 项 Phase 7 测试通过：真实 Scenario 02 的 5 个地图层全部通过投影检查，
  candidate Layer 为 5；客户端得到 3 个派生层并可由 `filter_buildings` 精确定位。
- [x] 在隔离 Harness Web profile 中实际 POST `/geoharness/scenario/run`；官方 RPC
  envelope 返回 Task Graph success、Map Verification ready、四项检查全 true，并确认
  `slots + connection` 客户端激活。
- [x] 新增 Connection peer 后处理 pnpm 非 TTY 重建与 peer cascade；最终采用 Web-only
  optional peer，`pnpm peers check` 无问题且运行时由官方 Web bundle 提供服务。

## Phase 7 边界

Phase 7 证明单个真实 Scenario 的 `Task Step ↔ Layer ↔ Map` 链路。六个 Scenario 的
capability、required layers、spatial correctness 和 expected statistics 全量自动验收属于
Phase 8。

## Phase 8 — Scenario Regression Tests

状态：完成（2026-08-27）

- [x] 为六个 Scenario 分别建立独立回归测试与独立临时 workspace；每项测试从该
  Scenario 自己的 Task Graph、数据、expected plan/result 开始真实执行。
- [x] Required capability gate 验证 expected capability 全部出现在成功 Task steps；
  Required layers gate 验证每个 required alias 都存在于真实 Layer map。
- [x] 新增独立 Python/GeoPandas oracle，直接读取持久化 GeoPackage，复算几何有效性、
  面积、河流/道路距离、分区计数和多约束布尔逻辑；不复用待测 ToolResult 文本。
- [x] Expected statistics 对适用字段做深比较；Map Verification 还必须为 `ready`，避免
  统计正确但 step/layer/map 投影断裂。
- [x] Scenario 01：12 个 Polygon、0 invalid、1 个 height 缺失、面积为正。
- [x] Scenario 02：5 个候选，全部距离河流不超过 500 m。
- [x] Scenario 03：12 个建筑，两个 District 分别 6/6，分区面积和均为正。
- [x] Scenario 04：3 个候选，District 为 3/0，全部距主要道路不超过 300 m。
- [x] Scenario 05：初始 500 m buffer 与 4 个候选通过；1 km 修订及 history 明确交由
  Phase 9，不以假数据提前通过。
- [x] Scenario 06：2 个候选，全部距主要道路不超过 300 m 且距河流至少 800 m。
- [x] 第一轮发现 regression action 的 `scenarioId` 被 provider 消费后未传入 Python；
  改用内部协议 `scenario_id` 后第二轮 6/6 通过。

## Phase 8 边界

六个初始 Scenario 均已自动验收。Scenario 05 的自然语言参数修改、上游复用、下游
失效/重跑、run history 和 lineage 更新属于 Phase 9。

## Phase 9 — Conversational Revision

状态：完成（2026-08-27）

- [x] Scenario 05 的初次执行保持文档规定的 500 m，真实得到 4 个候选；用户输入
  `改成 1 公里。` 后通过 Harness Connection RPC 将距离修订为 1000 m，真实得到 8 个候选。
- [x] Task Graph 支持已完成 execution 的 bounded revision：计算目标 step 下游闭包，
  仅将受影响 step 退回 pending，保留未受影响 success step 的结果和 Layer ID。
- [x] 本例只重跑 `buffer_major_roads` 与 `filter_candidate_buildings`，复用
  `inspect_buildings`、`filter_major_roads`、`transform_major_roads`；测试精确断言两组。
- [x] 新增有序 `run_history`，每轮保存 initial/revision、参数 before/after、用户理由、
  executed steps、reused steps 和最终状态；Scenario 05 修订后保留 2 轮记录。
- [x] 被替代的派生 Layer 留在 Registry 作为可审计历史，Map Verification 用历史 success
  transition 验证其 lineage 并标记 `active=false`；客户端只渲染当前 active 派生层。
- [x] 新增 loopback-only `/geoharness/scenario/revise`，只接受 Scenario 05 且必须包含
  有界数值距离；模糊修改、错误 Scenario 和超过 100 km 的输入显式拒绝。
- [x] 客户端在初次成功后准备官方 `revision-prompt.txt`，提交修订后显示 history、
  rerun/reused 摘要并把 Task step、当前 Layer 与地图重新同步。
- [x] Python/GeoPandas oracle 同时覆盖 500 m 初始状态和 1000 m 修订状态；2 项 Phase 9
  自动测试及完整 Harness Web 连续 RPC 验证通过。

## Phase 9 边界

v1.0 只承诺 Scenario 05 的显式距离修订，不将自由文本解析器扩展为通用规划器。其他
Scenario 的任意 schema 变更或模型生成式重规划属于后续版本。Phase 10 负责六个独立
Scenario 的真实截图、动图/视频、视频脚本与项目文档收尾。

## Phase 10 — Video / README Polish

状态：完成（2026-08-27）

- [x] 六个 Scenario 各自保留独立数据、Prompt、Task Graph、预期结果、回归测试和
  README，并新增自己的 `screenshots/`、`media/demo.gif` 与 `media/video-script.md`；
  没有用一个共享大 Demo 代替独立验收。
- [x] 所有截图均来自 DeepSeek Harness `0.1.1-rc.2` 的真实 1280×720 Web UI；每组
  包含初始状态与结果状态，Scenario 05 还分别记录 500 m 和 1 km 两轮结果。
- [x] 六个真实结果再次核对：Scenario 01 为 12 个建筑；02 为 5 个河流邻近建筑；
  03 为两个 District 各 6 个；04 为 3 个道路可达建筑；05 为 4 → 8、2 个 step 重跑且
  3 个复用；06 为 2 个多约束候选。
- [x] 新增可重复的 Demo GIF 构建/检查脚本；六个 960×540 GIF 均由真实 Harness 截图
  生成，Scenario 05 为三帧，其余为两帧。
- [x] 新增 7 项 Phase 10 资产测试，真实解析 JPEG/GIF 结构与尺寸，并检查每个 Scenario
  的独立回归、README、视频脚本、数据和展示素材；场景生成器同步覆盖 README 内容。
- [x] 根 README 完成 v1.0 产品说明、架构、安装、六个 Demo、验证命令和明确边界；根包
  与 Bundle 版本更新为 `1.0.0`。
- [x] 修复 Windows 下 pytest 默认临时目录/缓存的 ACL 不稳定性，将两者约束在被忽略的
  仓库 `.tmp` 中，确保 `pnpm test` 可重复运行。
- [x] 最终验证通过：`verify:phase10` 7/7、全量 Node 测试 41/41、Python 测试 7/7，
  `pnpm peers check` 无问题。

## GeoHarness v1.0 最终验收

状态：完成（2026-08-27）

Phase 0–10 已按顺序实际实现、测试并分别提交。六个 Scenario 均满足“一个需求 = 一个
独立文件夹 = 一套数据 = 一个测试 = 一个 Demo”，并在真实 Harness UI 中完成
`Goal → Plan → Tools → Layers → Map → Verify → Revise → Result` 链路验证。当前没有阻止
v1.0 完成的外部阻塞；已知的上游 CLI、模型凭据和合成数据边界记录在 `BLOCKERS.md`。

## Supplemental official real-data Demo

状态：完成（2026-08-27）

- [x] 保持六个 v1.0 确定性 Scenario 不变，新增独立
  `07-official-nyc-building-inspection`，避免以外部变化数据静默破坏原回归契约。
- [x] 从 NYC Open Data `BUILDING`（`5zhs-2jue`）按固定 Lower Manhattan bbox 获取并
  审计 133 个真实 MultiPolygon；GeoJSON metadata 记录 publisher、查询 URL、source
  update、snapshot date、Terms of Use、空间范围和处理说明。
- [x] 提供可重复下载/规范化脚本；直接 Node 请求遇到 Socrata 403 后，最终采用
  PowerShell 下载原始响应、Node 规范化的工作流，未手工改画几何。
- [x] 新增自己的 Prompt、Task Graph、预期结果、数据、README、独立包测试、独立
  GeoPandas 回归、Harness 截图、Demo GIF、视频脚本与资产测试。
- [x] 独立 oracle 确认 133 个要素、0 invalid、屋顶高度缺失 0、建成年份缺失 2、
  已知年份 1830–2021、投影后总面积约 116,198.58 m²。
- [x] 修复真实日期字段的 canonical GeoJSON 序列化，并使同一 Scenario 的完整重跑在
  已解析 workspace 内安全清除 stale Layers；相关 Python 与 Task Graph 测试覆盖。
- [x] 完整 Harness Web 连续运行两次均为 3/3 success、Map ready；输入 Layer 与
  `buildings_with_geometry` 均为 133 个要素，Task step ↔ Layer ↔ Map 高亮通过。
- [x] Python pytest cache 路径按其 `backend/geo-service` rootdir 修正为仓库根 `.tmp`，
  避免 Windows 上误落入 backend 子目录并产生 ACL 警告。
- [x] 最终验证通过：build、typecheck、media check、peer check、Node 45/45、Python 9/9、
  `git diff --check`；预览服务保留在 `http://127.0.0.1:31994/` 供人工检查。
