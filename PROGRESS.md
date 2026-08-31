# GeoHarness Progress

## Phase 0 — Harness integration baseline

状态：完成（2026-08-27）

- [x] 完整阅读 `docs/planning/GeoHarness_Agentic_GIS_方案_v1.0.md`，并将执行范围限制在
  Phase 0。
- [x] 确认 `../deepseek-harness` 可读；记录真实版本、提交和工具链版本。
- [x] 阅读 architecture、plugin、bundle、profile、web、slot、service、tool
  的当前源码和相关文档。
- [x] 确认采用外部 npm Bundle + 双面 Host/Client 插件 + Harness 管理的
  Web profile，不 fork、不复制上游源码。
- [x] 初始化独立 pnpm workspace、忽略规则、根 README 和测试入口。
- [x] 创建最小 `@geoharness/harness-plugin` Bundle：Host 端为空，Client
  端只注入诊断视图和加载标记。
- [x] 创建 `docs/architecture/harness-integration.md`，记录经源码和运行时验证的集成方式。
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
- [x] 使用安全的加法型 Slot：原对话标题栏按钮挂载到
  `conversation.session.header.actions`，GIS 工作区挂载到 `shell.overlay`，没有覆盖
  Harness `root`，也不新增独立对话标签。
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
- [x] Scenario 05 额外包含独立的 `revision-prompt.txt`，明确 500 m → 200 m 的
  参数修改目标与 329 → 205 的固定候选数量。
- [x] 建立可复现的 `scripts/build_scenarios/build-fixtures.mjs`，支持生成和
  `--check` 新鲜度验证。
- [x] 数据使用带日期与哈希审计的 NYC Open Data Lower Manhattan 快照，统一为
  OGC:CRS84；每个 README 明确记录 dataset id、查询、日期和处理方法。
- [x] 为六个 Scenario 分别建立一个独立测试文件，验证目录自包含、数据合法、
  Prompt/Plan/Result 契约和 Scenario 特定期望。
- [x] 使用 GeoPandas/Shapely/UTM 18N 对关键固定空间结果做独立抽查：Scenario 02
  为 132，Scenario 04 为 249，Scenario 05 为 329 → 205，Scenario 06 为 27。

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
- [x] 创建 `docs/architecture/tool-spec.md`，记录真实工具、Layer 和 HTTP 契约及 CRS 规则。
- [x] 7 项 Python 测试覆盖全部 12 个工具、持久化、API、安全边界和失败原子性；
  固定工作流验证 Scenario 02=132、Scenario 03=162/40/158、Scenario 06=249→27。

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
  Scenario 02 的 `list → transform → buffer → filter`，固定结果为 132。
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
  12 次转换并得到 132 个候选建筑，另覆盖循环拒绝和失败分支传播。
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
  candidate Layer 为 132；客户端得到 3 个派生层并可由 `filter_buildings` 精确定位。
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
- [x] Scenario 01：360 个 MultiPolygon、0 invalid、0 个 height 缺失、面积为正。
- [x] Scenario 02：132 个候选，全部距离河流不超过 500 m。
- [x] Scenario 03：360 个建筑，三个 District 分别 162/40/158，分区面积和均为正。
- [x] Scenario 04：249 个候选，District 为 130/8/111，全部距 Broadway 不超过 300 m。
- [x] Scenario 05：初始 500 m buffer 与 329 个候选通过；200 m 修订及 history 明确交由
  Phase 9，不以假数据提前通过。
- [x] Scenario 06：27 个候选，全部距 Broadway 不超过 300 m 且距河流至少 800 m。
- [x] 第一轮发现 regression action 的 `scenarioId` 被 provider 消费后未传入 Python；
  改用内部协议 `scenario_id` 后第二轮 6/6 通过。

## Phase 8 边界

六个初始 Scenario 均已自动验收。Scenario 05 的自然语言参数修改、上游复用、下游
失效/重跑、run history 和 lineage 更新属于 Phase 9。

## Phase 9 — Conversational Revision

状态：完成（2026-08-27）

- [x] Scenario 05 的初次执行保持文档规定的 500 m，真实得到 329 个候选；用户输入
  `改成 200 米。` 后通过 Harness Connection RPC 将距离修订为 200 m，真实得到 205 个候选。
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
- [x] Python/GeoPandas oracle 同时覆盖 500 m 初始状态和 200 m 修订状态；2 项 Phase 9
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
  包含初始状态与结果状态，Scenario 05 还分别记录 500 m 和 200 m 两轮结果。
- [x] 六个真实结果再次核对：Scenario 01 为 360 个建筑；02 为 132 个河流邻近建筑；
  03 为三个 District 162/40/158；04 为 249 个 Broadway 可达建筑；05 为 329 → 205、
  2 个 step 重跑且 3 个复用；06 为 27 个多约束候选。
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

Phase 0–10 已按顺序实际实现、测试并分别提交。七个 Scenario 均满足“一个需求 = 一个
独立文件夹 = 一套数据 = 一个测试 = 一个 Demo”，并在真实 Harness UI 中完成
`Goal → Plan → Tools → Layers → Map → Verify → Revise → Result` 链路验证。当前没有阻止
v1.0 完成的外部阻塞；已知的上游 CLI、模型凭据和官方快照更新门禁记录在 `BLOCKERS.md`。

## Supplemental official real-data Demo

状态：完成（2026-08-27）

- [x] 新增独立 `07-official-nyc-building-inspection`，保持“一需求一目录”的回归契约。
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

## 全场景官方数据替换与滑块回归

状态：完成（2026-08-27）

- [x] 将 Scenarios 01–06 从项目合成数据替换为 NYC Open Data 官方快照；未修改上游
  Harness，也没有复制 Harness 源码。
- [x] 原始响应统一保存在 `data/official-sources/nyc/`，记录 dataset id、查询、
  snapshot date、feature count 与 SHA256；提供 PowerShell 下载脚本。
- [x] 新增 `prepare-official-data.py`，校验原始快照并可重复生成建筑、Broadway、
  Community District 和基于官方 land/water difference 的河流派生数据。
- [x] 保持六个 Scenario 各自独立数据副本、测试与 Demo；固定统计更新为
  360、132、162/40/158、249、329→205、27。
- [x] 修复所有图层透明度滑块连续拖动时延迟读取失效 React `currentTarget` 导致的
  GIS 面板崩溃；增加源码回归门禁。
- [x] 真实道路等距最近邻暴露重复 join row，`nearest_features.matched_count` 已修正为
  唯一输入要素数，同时保留并列目标行供审计。
- [x] 在重启后的完整 Harness Web 中依次运行 Scenario 01–07，全部为 Task Graph
  `success`、Map `ready`；Scenarios 01–06 的官方数据截图和 GIF 已重新生成。
- [x] 对七个场景全部输入图层，以及 Scenario 04/05/06/07 的全部派生图层连续快速修改
  透明度；每次 `main` 和地图都保持存在，未再出现白屏或 Slot 崩溃。
- [x] 最终门禁通过：build、typecheck、官方数据/场景新鲜度、媒体可复现性、peer check、
  Node 45/45、Python 9/9、`git diff --check`；31994 预览服务保持运行。

## 原对话界面集成与 200 米真实修订

状态：完成（2026-08-27）

- [x] 确认距离解析不是预设枚举：明确距离在 `(0, 100000]` 米内均可进入同一修订链；
  将 200 米设为 Scenario 05 的正式验收用例。
- [x] 用官方 Broadway Centerline 与官方建筑快照在 UTM 18N 中独立复算：500 米为 329 栋，
  200 米为 205 栋；统计由 `prepare-official-data.py --check` 锁定。
- [x] Phase 9 测试不使用 mock GIS 结果：实际调用 `/geoharness/scenario/run` 与
  `/geoharness/scenario/revise` handler、TaskGraphRuntime、Python/GeoPandas provider、
  Map Verification 和独立距离 oracle。
- [x] 删除 GeoHarness 的 `conversation.view` 注册；改用
  `conversation.session.header.actions` 的“GIS 地图”按钮和 `shell.overlay` 右侧工作区，
  保留 Harness 原对话/轨迹页面。
- [x] UI 颜色和控件改为 Harness DSW theme tokens；取消旧米色、橙色、青色品牌化装饰，
  仅地图图层保留必要分类色。
- [x] 在完整 Harness Web 中验证原页面只有“对话 / 轨迹”标签，“GIS 地图”按钮可开关
  工作区；Scenario 05 为 329→205、Map ready、history 2、`2 rerun · 3 reused`。
- [x] 对 Scenario 05 的六个输入/派生图层分别连续修改透明度，地图、面板和 205 个候选
  状态保持正常；计划标题会随真实参数显示 `Create 200 m road buffer`。
- [x] 七个 Scenario 全部在新界面中真实执行到 success/Map ready，重新保存 1280×720
  截图并生成可复现 GIF；移除已失效的 `result-1km.jpg`。
- [x] 最终门禁通过：官方数据/场景/media check、typecheck、peer check、Node 45/45、
  Python 9/9、浏览器 UI 回归和 `git diff --check`。

## GeoHarness 主界面替换与输入驱动首轮执行

状态：完成（2026-08-27）

- [x] 重新核对上游 `ui-layout`、`ui-conversation`、`ui-slots` 与 runtime Slot 实现；确认
  `conversation` 是公开的 `single + session-maybe` 主槽，single cell 按 priority 升序选取
  winner。GeoHarness 以 `priority: -100` 替换 `ConversationRoot`，不修改上游源码。
- [x] 删除标题栏 “GIS 地图” action、`shell.overlay` 抽屉和相关 DOM 开关；刷新 Harness 后
  中心区域立即是 `main[data-geoharness-plugin="loaded"]`，原 action 数量为 0，仍保留 Harness
  AppFrame、侧栏、session、Connection 和 DSW 主题风格。
- [x] 新增 loopback-only `/geoharness/goal/run`：只在七个 v1.0 工作流中路由，解析米/公里
  明确距离，将参数 patch 到克隆的 Task Graph 后再启动第一步；Example selector 只负责加载
  示例输入，不再决定后台实际执行场景。
- [x] `TaskGraphRuntime.runScenario` 支持经验证的初始 step parameter patches 与用户原始 goal；
  patch 只能修改已存在参数，未知 step、未知参数或非法 patch 会 fail loud。buffer 计划标题
  在初始执行和后续 revision 后均与当前真实距离同步。
- [x] 新增非预设 275 m 真实验收：实际 RPC handler、TaskGraphRuntime、Python/GeoPandas
  provider、官方 Broadway/建筑数据、Map Verification 和独立 UTM 18N oracle 全链执行；仅
  1 轮 initial history，首轮直接使用 275 m，得到 241 栋，最大候选距离 273.7806 m，未先跑
  500 m。
- [x] 完整 Harness Web 实测输入 275 m 后显示 `Create 275 m road buffer`、241 candidates、
  5/5 success、Map ready、history 1；继续输入“改成 200 米”后显示 205 candidates、history 2、
  `2 rerun · 3 reused` 与 `Create 200 m road buffer`。
- [x] 对 200 m 结果的全部六个输入/派生图层逐个设置 0.3–0.8 透明度；每一步保留 972 个
  SVG map features，地图持续可见，无白屏、React 崩溃或 Layer 丢失。
- [x] Scenario 01–07 均在新的 `conversation` 主界面中重新执行到 success/Map ready，保存
  15 张 1280×720 真实 Harness 截图并重建七个 Demo GIF。
- [x] 最终门禁通过：build、typecheck、official-data check、scenario freshness、media check、
  peer check、Node 46/46、Python 9/9、完整浏览器回归与 `git diff --check`；预览服务继续运行
  在 `http://127.0.0.1:31994/`。

## 动态执行、Agent 结果与地图滚轮交互

状态：完成（2026-08-27）

- [x] 新增 workspace-scoped `goal/start`、`scenario/progress`、`scenario/revise/start` 后台 job
  协议；同步 RPC 继续保留，start 请求返回后不复用其 AbortSignal。
- [x] Task Graph 的真实 pending/running/success/failed transition 约每 280 ms 投影到右侧 Plan
  和左侧 Task outputs；success step 的 canonical Registry projection 通过 Map Verification 后
  即可在后续步骤仍运行时加入地图，不伪造中间几何。
- [x] 删除右侧 `Run current input`，页面只保留底部一个“执行 GIS 任务”入口；运行时按钮
  显示“正在执行…”。
- [x] 新增 Agent Result 区，直接展示真实 ToolResult 的 summary、selected_count、input_count
  等结构化数据和最近三步 trace，不读取 expected result 冒充运行结果。
- [x] SVG 地图新增 0.7×–5× 有界鼠标滚轮缩放，保留工具栏缩放、fit bounds 与拖拽平移。
- [x] 启动响应中的解析距离立即更新 Plan preview；真实 333 m 浏览器验收从启动即显示
  `Create 333 m road buffer`，最终返回 260/360，未短暂冒充 500 m 执行。
- [x] 真实 275 m 后台回归观察到至少三个不同完成计数，并在 job 仍 running 时观察到已验证
  派生 Layer；最终仍为 241 candidates、5/5 success、Map ready、history 1。
- [x] 完整 Harness Web 验收页面仅有一个执行入口，333 m 返回 260 candidates；滚轮把地图
  从 1.0× 放大到 2.5×，服务保留在 `http://127.0.0.1:31994/`。
- [x] 七个 Scenario 全部以新动态界面重新执行并保存 15 张 1280×720 Harness 截图，重建
  七个 960×540 GIF；最终门禁通过 Node 48/48、Python 9/9、build、typecheck、官方数据、
  场景新鲜度、media、peer 和 `git diff --check`。

## Root 工作台与全 Agent 正式执行链

状态：实现完成；外部模型 E2E 待凭据（2026-08-27）

- [x] 重新核对上游 `ui-layout` 的 `root`/AppFrame 注册和 current Slot winner 规则；GeoHarness
  改以 `root`、`priority: -100` 接管整页，正式界面不再渲染 DeepSeek Harness 的会话/项目
  侧栏，也不修改上游源码。
- [x] 删除正式 UI 的 Examples 下拉框、Scenario fixture 初始化和 Scenario ID/GeoJSON 客户端
  打包；空工作区打开时地图为空，等待 Agent 产生真实 Layer。
- [x] 底部唯一输入入口接入 Harness 原生 `sessions.create/models/history/prompt`；没有可路由
  模型时明确报错，禁止静默回退到 `goal/start` 或固定 Scenario DAG。
- [x] 新增 Native Session event projector，将真实 `tool/call`、`tool/result`、
  `assistant/message`、`turn/end` 逐步投影为执行步骤和 Agent 最终回答。
- [x] 新增 `nyc-core-official` 可复用官方数据 catalog 和 `discover_datasets`，Geo Tools 增至
  13 个；System Prompt 明确要求从用户目标自主规划，禁止从 Scenario 模板猜测参数与结论。
- [x] 新增 `/geoharness/agent/workspace`，从 Agent 当前 workspace Registry 返回经 feature
  count/parent 校验的 canonical GeoJSON；地图 Layer 不再依赖 Scenario Map Verification 响应。
- [x] 七个 Scenario DAG、goal/scenario RPC 和展示素材继续作为确定性 GIS 回归路径保留，
  不再由正式 UI 调用，仍满足“一需求一目录一数据一测试一 Demo”。
- [x] 更新集成文档和旧门禁；Node 全量 50/50 通过，真实 Python/GeoPandas ToolRuntime 已验证
  dataset discovery/load 和 500 m 河流缓冲为 132/360。
- [ ] 当前环境没有 `DEEPSEEK_API_KEY`/`OPENAI_API_KEY`。预览 profile 虽列出
  `ustc / deepseek-v4-flash-ascend1`，但两次真实 Prompt 都在任何 Tool Call 之前以
  `Connection error` 结束，因此外部模型自主规划 E2E 仍受 Provider/网络配置阻塞；UI 已
  fail-loud，且错误明确说明不会回退到 Scenario。

## Harness 凭据入口与工作台视觉层级

状态：完成（2026-08-27）

- [x] 保持 `root` 接管和无会话/项目列表，同时在左栏底部恢复紧凑的“模型与 API Key”入口。
- [x] 入口直接调用当前 Harness `settings.describe`、`llm.providers`、
  `credentials.describe/set`；已有 key 只返回 configured/writable，不回显 secret，新 key 写入
  Harness credential store，不写入仓库。
- [x] 真实 profile 验收列出 DeepSeek / `DEEPSEEK_API_KEY`（需要密钥）和 ustc /
  `USTC_API_KEY`（已配置）；保存/替换按钮只有输入非空且 Provider 可写时才启用。
- [x] 使用 Harness DSW tokens 重做页面层级：64px 顶栏、带 gap 的三栏 surface、圆角和 lv1
  阴影、右侧嵌套 Agent cards、突出 composer，以及 lv3 credentials modal；未恢复旧侧栏。
- [x] 浏览器 1170×912 验收无溢出/白屏，设置弹窗可开关，主地图仍占最大面积；build、
  typecheck、peer、官方数据门禁、Node 50/50 和 Python 9/9 全部通过。

## Agent 测试 Prompt 与全局字体可读性

状态：完成（2026-08-27）

- [x] 新增 `docs/testing/agent-test-prompts.md`，提供 12 类可直接复制的全 Agent 测试，覆盖官方数据
  发现、质量检查、200/275/500 米动态参数、分区统计、多约束、最近要素、导出、同会话修订
  和数据能力边界；测试输入不包含内部 Scenario/Layer 标识，也不预设 Task Graph。
- [x] 新增 Prompt 文档回归门禁，校验 13 个独立输入块（含连续修订第二轮）以及真实数据、
  非预设距离、上下文修订和拒绝伪造等要求。
- [x] 将 GeoHarness 基础、图层、地图、Agent trace、结果、输入框和凭据弹窗字号整体提高
  1–2 px；基础与输入字号统一为 14 px，继续使用 Harness DSW 字体和颜色 token。
- [x] 1170×912 浏览器实测 document 与 viewport 均为 1170×912、无页面溢出；三栏工作台、
  空地图、Agent cards、底部输入和 680 px 凭据弹窗均完整可见。
- [x] 最终门禁通过：build、typecheck、peer、Node 51/51、Python 9/9 和 `git diff --check`。

## Harness 原生风格输入框与模型切换

状态：完成（2026-08-27）

- [x] 按当前上游 `ui-conversation` composer 结构把底部输入区改为上方多行文本、下方工具栏、
  模型选择和圆形发送键；继续使用 Harness DSW token，没有恢复无关的会话/项目侧栏。
- [x] 从真实 `sessions.models.groups` 按 Provider 分组加载模型，并通过
  `sessions.selectModel({ sessionId, provider, model })` 修改固定 GeoHarness Session 的选择；
  选择后重新读取 Host 目录确认，错误和不可路由状态在输入区 fail-loud。
- [x] 保留 Enter 发送、Shift+Enter 换行、运行期锁定模型和单一执行入口；API Key 继续由左下角
  Harness credential store 入口管理，保存凭据后模型目录同步刷新。
- [x] 浏览器真实切换 `ustc / deepseek-v4-flash-ascend1` →
  `deepseek-official / deepseek-v4-flash` 后右侧 Current Step 同步更新，再恢复原模型；
  1170×912 下 document 与 viewport 完全一致，108 px composer 无溢出。
- [x] 最终门禁通过：build、typecheck、peer、Node 51/51、Python 9/9 和 `git diff --check`。

## Harness 原生设置与右侧原生对话框

状态：完成（2026-08-27）

- [x] 撤销 GeoHarness 对 `root` 的整页接管，恢复当前 DeepSeek Harness 的原生
  `AppFrame`、`SidebarRoot`、`ConversationRoot`、`SettingsRoot`、`InputBar` 和
  `ModelSelect` 装配链；没有复制或修改 `../deepseek-harness` 源码。
- [x] GeoHarness 仅以 `priority: -100` 注册 `conversation.session`、
  `sidebar.workspaces`、`sidebar.brand.mark` 和 `sidebar.brand.name`，且不重复声明上游已拥有的
  `sidebar.settings`、`conversation.composer.bar` 或 `conversation.input.model`。
- [x] 左下角“设置”现在直接打开上游原生设置 Dialog，真实浏览器确认包含通用设置、模型、
  插件和 Agent 预设；API Key 继续由 Harness credential store 管理。
- [x] 原生 `InputBar` 与 `ModelSelect` 被放置在右侧 Agent workspace 底部，输入、访问模式、
  模型选择、上下文状态、发送和停止继续使用 Harness 自身行为；GeoHarness 不再调用
  `sessions.prompt/models/selectModel` 自制一套对话链。
- [x] 修复原生空会话 Hero“探索未至之境 / 预览版”仍按旧整页坐标渲染并遮挡右栏的问题；
  仅在 GeoHarness 的 `data-phase="hero"` 状态隐藏该冗余宣传行，工作区选择、模式、输入框、
  模型和发送控件均继续保留原生实现。
- [x] 浏览器几何验收确认 Agent panel 为 390×562，composer card 为 370×94，且完整位于
  Agent panel 内；原生模型菜单可展开，页面无 console error。
- [x] Native Session history 继续驱动右侧 Goal、Tool Trace 和 Agent Result，真实 Session ID
  同时隔离 Layer Store 与 workspace RPC，不恢复固定 Scenario UI fallback。
- [x] 最终门禁通过：client build、typecheck、peer、Node 51/51、Python 9/9 和
  `git diff --check`。

## Agent 完整流式输出与 Provider TRANSPORT 诊断

状态：实现完成；真实 Provider 凭据验收待下一次用户 Prompt（2026-08-27）

- [x] 右侧由单一最终 `Agent Result` 升级为完整 `Agent Stream`，按 turn、step、retry attempt
  和 block index 合并 Harness `assistant/chunk` 的 text/reasoning delta，并用
  `assistant/message` 收敛最终内容。
- [x] Stream、Tool Trace、Layer projection 继续读取同一个 Native Session history，每 400 ms
  同步更新；运行中输出自动跟随滚动，Tool 成功数和 `LIVE/SUCCESS/FAILED` 状态同步展示。
- [x] 保留 Provider `llm/retry` 事件，显示 Provider、失败码和 retry 计数；`TRANSPORT`、
  `MISSING_CREDENTIAL`、认证失败分别给出可操作错误，不再把所有连接问题笼统归因于 API Key。
- [x] 确认预览实际 `DSH_HOME` 为 `.tmp/dsh-home-preview`，当前 USTC credential 已配置；失败
  Session 是六次 `TRANSPORT`，不是缺失凭据或 HTTP 401。
- [x] 在旧进程环境复现 Node socket `EACCES`，并在允许出站网络后确认 Provider Base URL 可达；
  使用相同 profile、DSH_HOME 与 credential store 重启 31994 服务，没有读取或回显密钥。
- [x] 新增真实 Session chunk/reasoning/retry/TRANSPORT 投影回归，并更新集成说明和运行边界。
- [x] 浏览器 1280×720 验收发现原生 composer 高度为 190 px 后，将 Agent 滚动区底部 clearance
  调整为 210 px；滚动到底时完整 Stream 与 composer 保持 12.5 px 间距，页面无溢出或
  console error。

## 恢复原生项目与历史会话导航

状态：完成（2026-08-27）

- [x] 移除 GeoHarness 对 `sidebar.workspaces` 的替换注册，让 Harness 原生 Workspace/Project、
  新建会话和项目内历史会话列表重新成为左侧主导航；品牌、设置、模型选择和右侧输入框仍是
  原生装配链。
- [x] GeoHarness 继续按当前真实 Session ID 渲染 `conversation.session`，所以切换旧会话会恢复
  该会话自身的 Goal、Agent Stream、Tool Trace 与 Layer Registry，不共享或覆盖其他会话。
- [x] 将原左侧 Layers 移为地图内可收起 drawer；空会话默认收起，首次产生真实图层时自动展开，
  仍保留显隐、透明度、派生输出、CRS 和当前步骤高亮。
- [x] 更新 Phase 0/1 Slot contract 回归和当前 Harness 集成文档，明确 GeoHarness 不再拥有
  `sidebar.workspaces`。
- [x] 完整门禁通过：Node 53/53、Python 9/9、client build、TypeScript、peer dependencies 与
  `git diff --check`。本轮内置浏览器对既有 `127.0.0.1` 标签页的刷新被 URL 安全策略拦截，未以
  其他自动化方式绕过；服务仍占用 31994，用户手动刷新即可完成最终视觉确认。

## 七个正式 Scenario 多关键帧 GIF

状态：完成（2026-08-27）

- [x] 放弃新增复杂 Prompt 案例，继续以 v1.0 已实现、带独立数据/测试/Demo 的 7 个正式
  Scenario 作为演示目录；新增 `examples/README.md` 统一索引案例和共享官方数据。
- [x] 每个 Scenario 新增 `media/gif-storyboard.json`：普通案例包含 7 个语义关键视图，参数修订
  案例包含 11 个，覆盖输入、Agent Plan、关键 Layers、地图、Agent Result 与完成状态。
- [x] 重写 `scripts/build-demo-media.py`，从 1280×720 真实 Harness JPEG 生成 960×540 GIF，
  支持 16:9 局部放大、阶段标签、关键帧停留、三帧平滑过渡、共享色板和逐场景构建/检查。
- [x] 普通案例 GIF 从 2 帧升级为 25 帧，Scenario 05 从 3 帧升级为 41 帧；500 m Plan/Layer/
  Map/329 栋结果与 200 m 修订/更新 Layer/Map/205 栋结果分别展示。
- [x] GIF 只裁切、缩放并标注已有真实 Harness 截图，不伪造尚未实际捕获的实时 Tool 状态；后续
  获得真实 `step-*.jpg` 时可直接在 storyboard 中按顺序加入。
- [x] Scenario 生成器、6 个生成 README、官方数据 Scenario README 和 Phase 10 回归均已同步；
  `verify:phase10` 完整通过，包含 build、Scenario freshness、7 个 GIF 媒体验证和 8/8 测试。

## 开发文档分层整理

状态：完成（2026-08-31）

- [x] 新增 `docs/README.md`，明确推荐阅读顺序、文档事实优先级和后续放置规则。
- [x] 将 v1.0 原始方案移入 `docs/planning/`，并标注为产品与实施规划基线；当前 Harness API
  和运行架构以 `docs/architecture/harness-integration.md` 为准。
- [x] 将已验证的 Harness、Tool、Task Graph、Map Verification 与 Revision 契约归入
  `docs/architecture/`，测试说明归入 `docs/testing/`，录屏与宣传内容归入 `docs/media/`。
- [x] 保留根目录 `README.md`、`PROGRESS.md`、`BLOCKERS.md` 作为入口与开发流水记录；Scenario
  专属文档继续与各自数据、测试和 Demo 共置。
- [x] 修复 README、进度、阻塞记录、媒体 Prompt 和测试中的相对路径；本地 Markdown 链接校验
  无缺失，`tests/agent-test-prompts.test.mjs` 通过。

## GIS Agent 平台 v1.0 · Platform Phase 0

状态：完成（2026-08-31）

- [x] 新增 `docs/planning/geoharness-platform-v1.0.md`，把当前成果定义为平台技术基线，并将
  Workspace、用户矢量导入、Run Manifest、Result Center、扩展契约和发布工程划分为 9 个
  必须真实验收的 Platform Phase。
- [x] 明确 v1.0 继续聚焦本地优先 Vector GIS；GeoTIFF/GEE、路网、3D、Multi-Agent、多租户
  和完整 Marketplace 不以 TODO 骨架混入本次版本。
- [x] 新增 MIT `LICENSE`、`CONTRIBUTING.md`、`SECURITY.md` 和 `CHANGELOG.md`；许可与当前
  DeepSeek Harness 上游 MIT 基线一致。
- [x] 新增 Windows/Linux、Node 22.19/24、Python 3.11 的 GitHub Actions CI，覆盖依赖安装、
  docs、typecheck、peer、Node/Python、Scenario 和媒体门禁。
- [x] 新增 `scripts/check-doc-links.mjs` 与 `pnpm run check:docs`，并将其接入 `pnpm test`；当前
  49 份 Markdown 的 95 个本地链接全部可解析。
- [x] 修正 Bundle README 中已过时的 root/自制设置描述，记录真实的 AppFrame、原生
  `sidebar.workspaces`、`sidebar.settings`、`conversation.composer.bar` 和
  `conversation.session` 装配关系。
- [x] 新增平台计划/治理/CI/Bundle 文档门禁。最终验证通过：TypeScript、peer dependencies、
  Node 57/57、Python 9/9、7 个媒体包和 `git diff --check`。

## GIS Agent 平台 v1.0 · Platform Phase 1

状态：完成（2026-08-31）

- [x] 新增版本化 `workspace.json`，记录稳定的 Workspace/Session 身份、激活 Dataset/Scenario、
  input/derived canonical Layers、exports 和 runs；Layer 数据继续由 `registry.json` 与 GeoPackage
  作为权威来源。
- [x] 将 Provider 路径从 `session/package` 改为固定的 `workspaceRoot/<safe-session-id>/`，移除
  `activePackages` 内存映射；Provider 重建以及 Dataset/Scenario 切换后仍使用同一目录。
- [x] Manifest 使用同目录临时文件、`fsync` 与原子替换；Python schema 恢复时同时核对原始
  Session ID，路径规范化碰撞会 fail closed，不会读取另一 Session 的资产。
- [x] 新增 `imports/`、`runs/` 以及 `workspace_manifest`、`workspace_record_run`、
  `workspace_reset` runner 动作；Layer 注册、派生 Tool 和 export Tool 会同步真实资产索引。
- [x] HTTP Geo Service 增加 `/workspace`，上传、Tool 派生和导出均与同一 Manifest 同步；新增
  `docs/architecture/workspace-manifest.md` 记录已实现的目录、schema、恢复和清理契约。
- [x] Scenario reset 只清当前 Session 的 Layer、Export、Import 与 Run 资产；相邻 Session
  sentinel 测试确认不受影响，Workspace 身份与创建时间保留。
- [x] Host 真实 Provider 测试确认重建后恢复 5 个 Dataset input Layers、1 个 derived Layer、
  1 个 export 与 1 个 run；另一 Session 为空，切换 Scenario 后根目录不变且旧资产被受限清理。
- [x] 最终门禁通过：build、TypeScript、peer dependencies、文档 50/50（96 个本地链接）、
  Scenario freshness、Node 59/59、Python 12/12 和 `git diff --check`。

## GIS Agent 平台 v1.0 · Platform Phase 2

状态：完成（2026-08-31）

- [x] 在现有 `conversation.session` 顶部增加格式感知的“导入数据”入口，不创建独立页面；支持
  GeoJSON/JSON、Shapefile ZIP、GeoPackage 和 CSV 经纬度文件及读取/上传/校验/成功/失败进度。
- [x] 新增 loopback-only `data/import-capabilities` 与 `data/import` RPC；浏览器只发送当前
  Session、普通文件名、base64 内容和格式选项，不接受任意服务器路径。
- [x] 默认单文件上限 20 MB，Bundle `uploadMaxBytes` 可配置，100 MB 为硬上限；Host 和 Python
  分别检查 envelope 与真实解码字节数，UI 从 Provider 读取实际限制。
- [x] Python 导入器真实支持单/多层 GeoPackage 选择、单/多 Shapefile 选择、CSV lon/lat 字段与
  CRS；返回 canonical Layer metadata、字段 dtype、warning 和 import asset。
- [x] ZIP 拒绝路径穿越、Windows drive path、symlink、非 Shapefile sidecar、超过 512 entries、
  异常压缩比和过量解压；普通文件名同时拒绝目录字符、控制符与 Windows 设备名。
- [x] Layer 注册改为唯一临时 GeoPackage + 原子替换；导入 staging、canonical Layer 和
  `workspace.json` 任一环节失败会回滚，不注册或遗留半成品。
- [x] Python 用真实 GeoPandas/Pyogrio 文件验证 GeoJSON、Shapefile ZIP、双层 GeoPackage 和
  带无效坐标的 CSV；恶意 ZIP、超限、坏 GeoJSON、多层未选择均确认零 Layer/零 import 残留。
- [x] Host E2E 将真实 NYC Buildings/Roads 作为用户上传数据导入未激活 Dataset/Scenario 的
  Session，Agent `list_layers` 发现两个 `source=upload` Layer，并真实执行 major road filter、
  UTM 18N、275 米 buffer 和 intersects，独立结果为 241 栋建筑。
- [x] 新增 `docs/architecture/user-data-import.md` 并同步 README、Bundle、Backend 与 Workspace
  契约；完整门禁通过：build、TypeScript、peer dependencies、文档 51 份/97 links、Scenario
  freshness、Node 63/63、Python 19/19、7 个媒体包和 `git diff --check`。
- [x] 预览 Harness 已成功启动在 `127.0.0.1:31994`；内置浏览器在刷新 localhost 时被当前 URL
  安全策略拒绝，因此本轮自动视觉截图未执行，详见 `BLOCKERS.md`。该限制不影响编译或真实 E2E。

## GIS Agent 平台 v1.0 · Platform Phase 3

状态：完成（2026-08-31）

- [x] Python `LayerRegistry.details` 返回真实 metadata、字段 dtype/空值、前 100 行属性、完整总数、
  geometry quality 和 warning；最多 200 字段、单字符串 500 字符，截断均显式标记。
- [x] 在现有地图 Layers 面板中增加数据工作台，不创建平行页面；展示 Layer 来源、CRS、geometry、
  feature count、字段、质量卡片和可滚动属性表。
- [x] 地图要素点击会打开对应 Layer 并选中属性行，属性表行点击会高亮同一 canonical map feature；
  前 100 行外的地图要素明确提示不在当前预览内。
- [x] 新增 loopback-only `layer/details`、`layer/rename`、`layer/remove` 与 `layer/preference` RPC；
  Host 校验 Session/Layer ID、名称和 opacity，浏览器不直接修改 Registry。
- [x] 重命名保持 Layer ID/lineage 并持久恢复；删除有 dependent 的 Layer 会 fail closed，删除叶子
  Layer 同步清理 canonical GeoPackage、上传资产、Workspace index 与显示偏好。
- [x] `workspace.json` 增加按 canonical Layer ID 保存的显隐/透明度；`agent/workspace` 投影只返回
  当前 Layer 的偏好，Provider 重建和页面刷新后可恢复，不同 Session 继续隔离。
- [x] Python 边界测试覆盖 150 行、205 字段、900 字符、null/empty/invalid geometry、重命名恢复、
  dependent 删除保护和受限上传资产清理；Host E2E 使用真实 NYC Buildings 360 要素完成完整生命周期。
- [x] 新增 `docs/architecture/data-layer-workbench.md` 并同步 Workspace/文档索引与 Changelog；最终
  门禁通过：build、TypeScript、peer dependencies、文档 52/52（98 个本地链接）、Scenario
  freshness、Node 66/66、Python 23/23、7 个媒体包和 `git diff --check`。

## GIS Agent 平台 v1.0 · Platform Phase 4

状态：完成（2026-08-31）

- [x] Host 注入官方 `sessions` Service，并在真实 SessionStore owner context 订阅
  `session/event`、`session/flush` 与 `session/disposed`；每轮 Native Harness 事件被投影为
  versioned Run Manifest，没有平行会话、LLM Planner 或 Scenario fallback。
- [x] Run Manifest 记录 user goal、turn、Provider/Model、Tool 参数与状态、输入/输出 Layer、
  final answer 引用、retry 和 Provider/Tool/Data 错误；明确不保存 `assistant/chunk` reasoning。
- [x] Python Workspace 对 Agent Run 使用 Pydantic schema、Session 一致性校验和原子持久化；
  `agent/runs` loopback RPC 与页面最近三轮卡片可在刷新或 Provider 重建后恢复运行摘要。
- [x] 同一 Workspace 的 Provider 请求按提交顺序串行，不同 Session 继续并行；真实并发回归确认
  Run projector 和 CSV export 不再发生旧 `workspace.json` 快照覆盖新 export index。
- [x] Windows Python runner 改为显式 UTF-8 stdin/stdout，中文用户目标、最终回答和 metadata
  均能通过 JSON/Pydantic 并按原文恢复。
- [x] UI 显示本轮 Executed Tools、Reused inputs、New outputs、Provider/Model 及分类错误；数据均
  来自 Run Manifest 与 canonical Registry，不从模型文本猜测复用或统计。
- [x] 同一个 Native Harness Session 使用用户上传的真实 NYC Buildings/Roads/Rivers 完成五类
  修订：275 m → 200 m、`within` → `intersects`、属性值变化、GeoJSON → CSV、追加 river
  800 m `disjoint` 条件；原始 GeoJSON 的独立 GeoPandas oracle 分别核对 228、188、205、
  242 条道路、205 行 CSV 和 14 个最终要素。
- [x] 新增 `docs/architecture/run-manifest.md` 并同步 Harness/Workspace/Bundle/Changelog；最终
  门禁通过：build、TypeScript、peer dependencies、文档 53/53（100 个本地链接）、Scenario
  freshness、Node 72/72、Python 25/25、7 个媒体包和 `git diff --check`。

## GIS Agent 平台 v1.0 · Platform Phase 5

状态：完成（2026-08-31）

- [x] Geo Tool `presentationMeta` 增加经过 output schema 校验的真实 `warnings/data`；Native
  Run Manifest 持久化结构化 Tool Result，但仍不保存 `assistant/chunk` reasoning 或凭据。
- [x] Python `ResultCenter` 从 Run、Registry 与 Workspace 索引生成最终回答、Tool 成功/失败数、
  外部输入、terminal outputs、结构化统计、CRS、单位、数据来源和 warning；不解析 LLM 文本数字。
- [x] 新增 loopback-only `result/center` 与 `result/download`；浏览器只提交当前 Session、
  `export|run` 和安全 asset ID，Python 必须在当前 `exports/` / `runs/` 索引内重新解析路径。
- [x] 下载固定上限 20 MB，并核对 export 索引字节数；响应返回真实 MIME、size 和 SHA256，
  客户端解码后再次核对字节数，再生成用户下载 Blob。越界 ID、未索引资产和跨 Session 均拒绝。
- [x] Result Center 集成在现有 Agent workspace，展示可点击输入/输出 Layer、真实统计表、来源、
  CRS/单位/warning，以及 GeoJSON、GeoPackage、CSV 与 reasoning-free Run JSON 下载；刷新后恢复。
- [x] Native Session 用户上传建筑 E2E 按 `use=feature_code_2100` 真实筛出 357 栋并验证三种导出、
  SHA256 和 Run JSON；独立 Python 河流 500 米测试真实得到 132 栋并逐格式核对要素/行数。
- [x] 新增 `docs/architecture/result-center.md` 并同步 Workspace、Run、Bundle 与 Changelog；最终
  门禁通过：build、TypeScript、peer dependencies、文档 54/54（102 个本地链接）、Scenario
  freshness、Node 74/74、Python 27/27、7 个媒体包和 `git diff --check`。
