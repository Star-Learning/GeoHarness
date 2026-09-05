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

## GIS Agent 平台 v1.0 · Platform Phase 6

状态：完成（2026-08-31）

- [x] 新增 Dataset catalog 与 Tool manifest 的 JSON Schema `1.0`；Host 校验版本、ID、唯一名称、
  semver、capability、`ToolResult@1.0`、timeout 和 map effect，Python 在打开 Dataset path 前再次
  用严格 Pydantic schema 拒绝未知字段与不兼容版本。
- [x] 13 个内置 Harness Tool 的 name、description、parameters、version、capability、timeout、
  output 与 map effect 全部迁入 `catalog/builtin-tools.json`，`tools.js` 不再复制参数清单；Python
  parity test 保证 12 个 backend operation 与 Host manifest 一致。
- [x] `discover_datasets` 和 `list_layers.dataset_id.enum` 从部署的真实 `dataset.json` 生成；Agent
  只看到 region/CRS/layer/license 能力，不会收到服务器相对 path 或预设分析步骤。
- [x] 新增 catalog 合并与 executor 扩展入口；同名不同 semver 报 version conflict，同名同版本
  报 duplicate，声明但缺少 executor 的能力不注册给模型并进入 `unavailable` System Prompt，
  Agent 被明确要求报告未安装能力而不是编造结果。
- [x] 第三方 fixture `fixture_layer_note@1.2.0` 通过真实 Harness ToolRuntime 执行并进入通用 Run
  projector；客户端源码不包含 fixture 名称，证明 Agent Stream、Layer panel 与 Result Center
  不需要按新 Tool 修改核心渲染。
- [x] 新增 `build:catalogs/check:catalogs`，从相同 manifest 生成
  `docs/architecture/catalog-reference.md`；新增扩展契约文档并同步 Harness/Tool/Bundle/Backend。
- [x] 最终门禁通过：build、TypeScript、peer dependencies、catalog freshness、文档 56/56
  （108 个本地链接）、Scenario freshness、Node 78/78、Python 30/30、7 个媒体包和
  `git diff --check`。

## GIS Agent 平台 v1.0 · Platform Phase 7

状态：完成（2026-08-31）

- [x] Provider 对请求增加 120 秒独立超时、AbortSignal 取消、4M 输出上限、非零/无效 JSON
  退出处理和 active-process 回收；真实 Python sleep/exit fixture 验证 timeout、cancel 与清理。
- [x] Session 目录映射对 `:` 等 collision-shaped ID 加 SHA256 后缀；相同 Workspace 串行、不同
  Session 并发，Workspace identity、路径与资产索引继续双重隔离。
- [x] canonical Layer 默认限制为 100,000 要素、256 MB GPKG 和每 Workspace 128 层；注册、导入、
  导出、Registry 与 Workspace 写入使用临时文件/原子替换，Tool 失败回滚本次半成品 Layer。
- [x] 属性表支持 100 行 `offset` 分页；GeoJSON 支持要素/字节双重上限、总数、返回数、next offset、
  full bbox 和超大单要素标记；地图投影固定 3 MB 总预算且完整 Tool 仍读取 canonical GPKG。
- [x] Harness `callId` / Task Graph attempt 作为持久幂等键，语义 `step_id` 继续承担 lineage；相同
  请求重放 `ToolResult` 不重复造层，冲突参数 fail closed，500→200 米修订仍使用新请求正常重算。
- [x] 新增 loopback-only `diagnostics/export` 与右侧下载入口；只包含平台/资产计数、限制、状态、
  耗时和截断错误，不包含 Prompt、凭据、上传内容、Tool 参数、绝对路径或 stdout 正文，并返回 SHA256。
- [x] 新增 `docs/architecture/resilience-security.md` 并同步 Bundle/Backend/Changelog；最终门禁通过：
  build、TypeScript、peer dependencies、catalog/docs/Scenario freshness、Node 82/82、Python 33/33、
  7 个媒体包和 `git diff --check`。

## GIS Agent 平台 v1.0 · Platform Phase 8

状态：完成（本地验收，2026-08-31）

- [x] 新增三个完全绕过 Scenario/Dataset loader 的用户上传 E2E；三个独立 Session Workspace 均
  通过 `import_upload` 注册真实 NYC canonical Layer，不调用 `load_scenario` 或 `load_dataset`。
- [x] 建筑质量链路核对 NYC 官方 133 栋建筑的字段、CRS、几何有效性、bbox、100 行属性预览与
  Map projection；主要道路任意 275 米链路真实筛出 241 栋建筑，并按 `building_id` 与独立
  GeoPandas/Shapely oracle 逐项核对。
- [x] 分区统计链路对用户上传的 360 栋建筑计算真实面积、聚合到 3 个 Community District 并导出
  CSV；独立 spatial join/groupby 核对每区数量、面积、总数和导出内容。
- [x] Native Agent System Prompt 明确 v1.0 只支持矢量 GIS；栅格、路网分析等缺失能力必须显式
  报告 capability gap，不得伪造 Tool、Layer 或结果；发布契约测试确认正式客户端仍只消费
  Native Session history，不调用 Scenario planner/fallback。
- [x] 新增全新 `DSH_HOME` 插件生命周期脚本；本地使用真实上游构建 CLI 完成 Bundle 安装、
  `dump-config`、随机 loopback 端口 Web 启动、HTTP 200/HTML 探测、进程停止、卸载与配置清理。
- [x] GitHub Actions 新增 Ubuntu/Windows clean lifecycle job；保留两平台、Node 22.19/24、
  Python 3.11 的完整 build/typecheck/test/docs/catalog/media 验收矩阵；clean clone 不再错误要求相邻
  上游源码目录，源码级 Phase 0 审计仅在该目录存在时执行，CI 改由精确 peers 和真实 lifecycle 验证；
  Windows 的 published CLI 路径通过 Node `npm_execpath` 调用 pnpm，不依赖 `.cmd` spawn 行为。
- [x] Scenario freshness 保留官方原始快照 SHA256/数量、feature ID、属性和统计精确校验；派生几何改为
  类型/有效性/面积与 `1e-8` 度 Hausdorff 门禁，避免等价 GEOS/PROJ 构建仅因环顺序或坐标末位误报；
  `.gitattributes` 固定生成文本为 LF，并以真实篡改属性、统计和几何的测试确认仍会 fail closed。
- [x] 新增 `docs/releases/v1.0.0.md`、兼容矩阵和平台验收说明；更新 README、文档导航、Security
  支持版本及 Changelog `1.0.0` 条目。
- [x] 本地最终门禁通过：Node 86/86、Python 37/37、TypeScript、peer dependencies、Catalog、
  60 份 Markdown/120 个本地链接、7 个媒体包、插件 lifecycle 和 `git diff --check`。
- [x] 按 2026-08-31 发布决策，以本地全量门禁作为 v1.0 完成标准；不再 push、创建远程 Tag
  或 GitHub Release。仓库保留跨平台 workflow 供后续部署阶段单独处理，其结果不阻塞本 Phase。

## GIS 矢量空间分析 Topic · 曼哈顿历史建筑更新优先区

状态：完成（2026-08-31）

- [x] 新建独立 `examples/topics/01-historic-building-renewal`，Prompt 不引用 Scenario ID 或预设
  答案；真实 Agent 自主完成数据发现、属性筛选、400 m 道路缓冲、600 m 河流避让、空间叠加、
  EPSG:32618 面积计算、Community District 聚合和 GeoJSON/CSV 导出。
- [x] 真实漏斗为 360 → 69 → 15 → 11 栋，最终总面积 4426.92 m²；CD 101/102/103 分别为
  6/4/1 栋。Agent 自主修正 `aggregate_by_region` 输入语义，并通过 Turn 2 停止无效的跨
  Workspace 路径搜索，明确以 Result Center/Asset 索引交付导出。
- [x] 允许联网的 Harness 进程验证 `deepseek-v4-flash-ascend1` Provider、已配置凭据、流式输出和
  follow-up 均可用；此前 `TRANSPORT` 问题正式关闭。
- [x] 保存 4248 个连续真实 UI 帧并编码为 1920×1080、30 fps、H.264 High、17:42 的本地 MP4；
  第 15 分钟编码帧与源帧 SSIM 为 0.998184，确认后半段无清晰度退化，结尾对 Result 与 Map
  增加动态描边。MP4 按仓库策略仅保存在本地，不进入 Git 历史。

## UI / 前端 / 可视化优化

状态：完成（2026-08-31）

- [x] 加强 Step → Layer → Map → Result 双向联动；Tool step、结果 Layer、地图要素和属性行共享
  canonical Layer ID / feature index，不从 Agent 文本猜测状态。
- [x] Layers 按真实 lineage 分为输入、中间和最终结果；Result Center 从结构化 Tool/Layer 数据生成
  有界 feature flow 和数值图，不加载 Scenario 预设答案。
- [x] 新增动态运行状态条、Legend、近似距离比例尺、画布切换、颜色/线宽控制与 Fullscreen 演示模式；
  保持 Harness 原生项目/会话、设置、模型选择和 composer。
- [x] 属性工作台新增前 100 行筛选、字段排序和地图选中联动；CSV 导入新增有界字段/样例预览、
  delimiter/引号识别和经纬度字段建议，canonical 导入仍由 Python 校验。
- [x] 修复服务重启后的已完成会话地图恢复：Workspace hydration 与新 Session 事件解耦，先恢复
  disk-backed Registry，再异步恢复 Run、Result 与导入能力；真实会话约 3.1 秒恢复 15 Layers、
  951 registry features 和 847 个 SVG display features。
- [x] 浏览器验证 `bldg_final_district` 11 行按 `101` 筛为 6 行，表格/地图单要素同步高亮；
  Legend、滚轮/按钮缩放、Result Center 与原生输入区均正常。
- [x] 新增 5 项 UI 模型/接线测试；最终全量门禁通过 TypeScript、Catalog、64 份 Markdown / 126 个
  本地链接、六 Scenario freshness、Node 91/91、Python 37/37 和 `git diff --check`。

## GIS 矢量空间分析 Topic · 下曼哈顿消防覆盖盲区

状态：完成（2026-08-31）

- [x] 新建独立 `examples/topics/02-firehouse-coverage`；真实 Agent 自主发现并选择
  `nyc-fire-coverage-official`，检查 360 栋建筑、48 个曼哈顿消防站和 3 个 Community District，
  在 EPSG:32618 中执行 500 米缓冲、空间反选、最近设施、面积、分区聚合、分布统计和导出。
- [x] 独立 GeoPandas/Shapely oracle 与 Agent 可靠结果一致：26 栋未覆盖建筑，总面积
  10503.30 m²，最近消防站距离 505.50–674.61 m；MN-101/MN-102/MN-103 分别为 2/0/24 栋。
- [x] Agent 识别 `intersects` 产生 36 行重复记录且后续重名字段连接失败，没有把错误中间层用于
  结论；改用 26 行 `within` 分区连接和 `aggregate_by_region`，面积总量与独立 oracle 完全吻合。
- [x] 成功导出 26 要素 GeoJSON 和 3 行分区 CSV；新增独立 Topic 测试、官方数据目录、下载脚本、
  Prompt、oracle、来源哈希与生成 Catalog 文档。
- [x] 完成 1920×1080、60 fps、H.264 High、7:57.5 的真实 Agent 流程 MP4。原始素材 54:49.15；
  Provider 等待以 4 倍速压缩，非 GeoHarness 桌面区间完整删除，开头/中段/结尾和 30 秒联系表均
  完成清晰度与内容抽查。MP4 按仓库策略仅保存在本地，`recording.json` 和 `final.png` 进入版本库。

## 全球卫星影像底图预览

状态：实现并通过真实 Harness 浏览器验收（2026-09-01）

- [x] 在不改变 Native Session、canonical Workspace 或 Layer Registry 的前提下，将 Esri World
  Imagery 在线瓦片置于 GeoHarness 矢量图层下方；卫星底图不进入空间 Tool 或统计结果。
- [x] 将地图显示投影从经纬度线性插值改为 Web Mercator；视野、按钮/滚轮缩放和拖动变化时，按当前
  屏幕范围选择瓦片并提高瓦片 zoom，避免放大后继续拉伸低分辨率影像。
- [x] 地图默认卫星模式，并提供 `SAT → GRID → PLAIN` 循环切换；无网络时保留本地底色，归属信息
  明确显示加载中、在线或回退状态。
- [x] 新增纯函数测试覆盖投影方向、已知坐标、瓦片数量边界、HTTPS 来源、缩放分辨率和正式客户端
  接线；完整 Node 门禁 81/81、client build、TypeScript、66 份 Markdown / 133 个本地链接、Catalog
  freshness 和 `git diff --check` 通过。
- [x] 真实 `http://127.0.0.1:31994/` 浏览器验收恢复 15 个 Layer；初始视野加载 48 张 z12 瓦片，
  1.8× 后加载 z13 瓦片，拖动后仍保持 48 张在线瓦片，卫星/网格/纯色均可切换，console error 为 0。

## 地图主视区与 Agent Workspace 视觉优化

状态：实现并通过真实 Harness 浏览器验收（2026-09-01）

- [x] 在 1120×912 真实视口将地图从 410×754 扩大到 466×758，Agent 栏从固定 390 px 收敛到
  344 px；原生 composer 随同变为 324 px，模型切换、附件与发送控件仍完整可用。
- [x] Legend 默认由 196×175 展开态改为 168×33 收起态；历史 Workspace 恢复不再自动弹开 Layers
  drawer，导入成功后仍会主动打开，用户可随时通过地图左上角入口控制。
- [x] 输入、中间、最终与当前步骤图层分别以 32%、42%、68%、82% 的角色强度叠加用户主透明度；
  Legend 显示实际合成百分比，选中/步骤高亮仍保留动态描边与聚焦。
- [x] 右侧 Agent Workspace 增加状态圆点、标题强调、Goal 强调面、Tool Trace 时间线、卡片层级、
  渐变背景和更克制的阴影；完整 Agent Stream、Result Center、Run history 和原生 composer 未删减。
- [x] client build、TypeScript、`git diff --check`、完整 Node 门禁 81/81 与相关 UI/地图回归 16/16
  通过；真实浏览器恢复 767 个可见 SVG features，卫星影像在线且布局无自动遮挡。

## 新会话自动定位

状态：代码完成；真实系统定位等待用户开启 Windows 权限（2026-09-01）

- [x] 新 Session 先等待 canonical Workspace 恢复；只对确认没有 Layer 的空会话定位，历史分析视野不被
  电脑位置覆盖。
- [x] 浏览器权限为 `granted` 或首次 `prompt` 时自动请求高精度位置，不再要求用户先点击地图按钮；
  桌面定位超时由 10 秒放宽为 30 秒，并保留失败后的手动重试入口。
- [x] 当前位置、精度圆和视野仅保存在浏览器 React 状态，不写 Workspace、不调用 Agent/RPC；分析 Layer
  到达后地图切回真实数据范围。
- [x] 新增 4 项定位回归，client build 与 TypeScript 通过；真实 Harness 新建空会话已确认自动进入
  “正在准备定位”，当前机器随后因 Windows 当前用户位置权限为 `Deny` 返回超时。

## 卫星影像视觉巡检 Agent

状态：实现并通过真实 Harness / Esri 端到端验收（2026-09-01）

- [x] 新增 `inspect_satellite_view` Harness Tool：只读取用户显式授权的当前地图视野，最多请求
  16 张 Esri World Imagery RGB 瓦片，裁剪到最长边 768 px，并以有界颜色优势/边缘规则初筛
  water、vegetation、built_up 和 bare_ground；不创建或伪造矢量 Layer。
- [x] 新增 `imagery/view` / `imagery/latest`、真实预览与 RGBA Overlay、地图统计卡、Tool Trace、
  Agent Stream 和通用 Result Center 结构化统计；结果明确是显示像素份额与启发式置信度，不是
  NDVI、多光谱分类、变化检测或真实面积。
- [x] 定位信息默认只保存在浏览器；必须点击地图 `AI` 才将当前 bbox/zoom 写入本地 Session 并允许
  Esri 请求。本机定位视野已真实处理 12 张瓦片和 768×537 RGB 像素，但精确位置与截图不进入仓库。
- [x] 真实运行发现当前 Harness 事件顺序为 `turn/start → user/message`；修复 Run Manifest 对旧逆序
  的单向假设，Result Center 随当前 Prompt 动态出现统计、来源、警告和 Run 下载。新增连续两轮
  回归，防止首轮缺失或上一轮 Prompt 错绑。
- [x] Esri 首次请求曾返回瞬时 SSL EOF，Native Agent 没有回退到 Scenario，而是自主重试并成功；
  最终 Tool Trace、Result Center、Run history 和 Agent Stream 全部收敛为可核查成功状态。
- [x] 新建独立 `examples/topics/03-satellite-visual-inspection`，包含一个 Prompt、一份来源审计、一项
  Topic 测试和公开纽约视野的真实 `media/final.png`；公开 Demo 隐藏全部矢量显示，不提交本机定位素材。
- [x] `inspect_satellite_view@0.2.0` 支持用户 Prompt 中的真实 `place_name`；Esri World Geocoding
  解析武汉市洪山区得分 100，以约 114.3378431°E、30.502804299°N 为候选中心生成有界视野，并明确
  该窗口不是洪山区官方行政边界全覆盖。
- [x] 巡检蒙版升级为会话级 Raster Overlay Layer：进入 Layers 面板和顶部/步骤 Layer 计数，支持显隐、
  连续透明度、±10% 按钮和百分比显示。Host RPC 按 Session 持久化；真实刷新验收恢复
  `visible=true`、`opacity=0.62`，地图实际 Overlay opacity 同为 0.62。
- [x] 完成短 Prompt“请对武汉市洪山区做一次卫星影像视觉巡检。”的真实 Native Agent 录制；Provider
  经真实 retry 后成功，Tool 读取 16 张 Esri 瓦片、处理 768×668 RGB 像素，92.1% 获得初筛类别，
  全流程输出为本地 1920×1080、60 fps、H.264 High、113.1 秒 MP4。
- [x] 录制脚本按截图真实 magic bytes 写 PNG/JPEG 扩展名，编码器兼容两种格式，不再把 Browser 返回的
  JPEG 字节误命名为 `.png`。
- [x] 最终本地门禁通过：Node 103/103、Python 40/40、TypeScript、peer dependencies、Catalog、
  69 份 Markdown/135 个本地链接、六 Scenario freshness、7 个 Demo GIF、真实浏览器刷新恢复和
  `git diff --check`。

## 洪山区行政边界裁剪与地图飞行动画

状态：实现、真实 Agent 录制并通过全量本地门禁（2026-09-01）

- [x] 地名解析完成后，地图使用约 3.3 秒的三段视野插值：先从当前区域缩小，再平移到目标区域，
  最后放大到行政区范围；动画结束后视野与实际分析 bbox 一致，不用预设城市坐标。
- [x] `inspect_satellite_view@0.3.0` 在 Esri 地名候选之外，通过 OpenStreetMap Nominatim 获取真实
  Polygon/MultiPolygon；在 Web Mercator 像素空间生成边界蒙版，只统计行政区内像素，并让区外
  Overlay alpha 为 0。前端同步绘制边界线和区外暗化，不再把候选 extent 矩形冒充行政区。
- [x] 边界能力保留明确来源与限制：OSM relation / attribution / ODbL 进入结构化结果；它是可审计
  的 OSM 行政边界，不宣称为中国官方法定边界。Nominatim 没有返回可用多边形时，系统显式回退到
  有界候选视野并在结果中说明，而不是伪造轮廓。
- [x] 真实 Native Harness Session `session-36d74ae3-5cb2-407e-95b8-6a782cecf6ed` 使用短 Prompt
  “请巡检武汉市洪山区卫星影像，只报告结果，不解释原因。”完成运行：Esri score 100、OSM relation
  3080399、702 个边界坐标点、12 张 z11 瓦片、683×533 像素，其中行政区内 108,502 像素，
  classified ratio 0.938619；Raster Layer 最终保持可见且透明度为 62%。
- [x] 生成本地 `hongshan-boundary-agent-flow-1080p60.mp4`：原生 1920×1080 源帧、60 fps、
  H.264 High / Level 4.2、111.5 秒、16,067,699 bytes；SHA256 为
  `93697579AAA3682FE8871AF88BBB37F668006D83BA9F39E099AB34370E838865`。MP4 与原始帧按仓库策略
  被 `.gitignore` 排除，仅提交可复核 Manifest。
- [x] 最终门禁通过：client build、Catalog、69 份 Markdown / 135 个本地链接、六 Scenario freshness、
  Node 104/104、Python 41/41、peer dependencies、7 个 Demo GIF、视频 ffprobe 和 `git diff --check`。

## Agent Markdown 与渐进式影像巡检反馈

状态：实现并通过真实 Harness 浏览器验收（2026-09-01）

- [x] Agent Stream 接入安全的 Markdown 子集渲染：标题、段落、列表、强调、代码、引用、链接和表格
  均转换为 React 结构，不再暴露完整消息中的 `#`、`**`、反引号或表格竖线；模型 HTML 始终转义，
  未使用 `dangerouslySetInnerHTML`。
- [x] `inspect_satellite_view` 在完成 Esri 地名与 OSM Polygon/MultiPolygon 解析后立即写入 Session 级
  `imagery/target.json`，随后按 30% 影像获取、70% 区内分类、90% 结果生成、100% 完成更新；写入均
  原子化，并带 Tool step ID 防止同 Session 上一轮目标闪回。
- [x] 新增 loopback-only `imagery/target` 只读 RPC；Provider 只允许该 action 并发读取原子快照，
  其余同 Workspace 写请求继续串行。地图在 Tool Result 前完成飞行，到达后先显示真实 OSM 边界和
  加载动画，最终 `imagery/latest` 到达后再显示 Raster Overlay 与统计卡。
- [x] 真实新会话 `session-6ee6180d-9a39-42c8-902e-1f313efccc73` 从电脑当前位置发起洪山区短 Prompt；
  页面真实观察到渐进加载卡，首轮 Esri TLS EOF 显式失败后 Native Agent 自主重试，最终加载 OSM
  relation 3080399、108,502 个区内像素、93.8619% 初筛分类和可控 Raster Layer。历史会话中的
  Markdown 表格验收为 1 个真实 `<table>`，原始 pipe 表头计数为 0。
- [x] 最终全量门禁通过：可复现 client build、TypeScript、Catalog、69 份 Markdown / 135 个本地链接、
  六 Scenario freshness、Node 105/105、Python 41/41、peer dependencies、7 个 Demo GIF 和
  `git diff --check`；预览服务继续运行在 `http://127.0.0.1:31994/`。

## 2026-09-05：布局优化与洪山区发布版实录

状态：本地实现、测试和真实会话录制完成；未提交、推送或部署。

- [x] 地图/统计卡分区、原生 composer 实测留白、可折叠诊断和下载、较大字号、流式阅读跟随。
- [x] CSS 演示模式保留原生模型菜单；解决焦点造成的外层滚动与标题裁切，并隐藏电脑定位。
- [x] 地名解析先发布 target，稳定概览瓦片衔接飞行；独立 canonical 读取，修复其阻塞历史/进度轮询的问题。
- [x] 经用户同意显式导入真实历史地名/行政边界缓存。新增来源与几何校验，不跨会话自动读数据，
  未命中不套用缓存；影像和分类始终重新执行。使用真实 OSM 702 点边界的测试验证重新获取瓦片、
  更换影像后分类确实变化、区外 alpha=0，并覆盖缓存不匹配和缺少来源信息。
- [x] 最终会话 `session-f9bb5bfa-d16b-41d0-98d3-3ab93c5459f2` 成功运行：12 张在线 Esri 瓦片、
  108,502 个区内像素，蒙版 `raster_inspection-99f92bd6a39a4946`，最终不透明度 52%。
  工具还在 running 时已真实观察到洪山区边界与 30% 巡检进度。
- [x] 同一会话新素材制成 67 秒 1080p/60 fps 导出 MP4，步骤字幕、同帧报告局部放大、结果动态框、
  原创轻配乐、封面与发布简介。源是目标 8 fps 的浏览器截图，不宣称原生 60 fps 录屏。
  源画幅变化和采集超时、未采集等待段均在 Manifest 披露，没有合成假 Agent 输出。
- [x] 本地 Node 107/107、Python 43/43、TypeScript、client build、真实浏览器交互通过；MP4 的
  ffprobe 与整段解码通过。布局在 1920×1080 和普通 1280×800 窗口核查。

发布包：[洪山区实录视频与文案](examples/topics/03-satellite-visual-inspection/media/hongshan-publish-20260905.md)。

## 2026-09-05：地图移动顺滑度优化

- [x] 连续 Mercator 相机与对数缩放，平移/缩放重叠、按航程调整时长，消除三段各自启停。
- [x] 保留出发时真实 pan/zoom；行政区候选范围到真实边界缓动调整；到达提示仅淡出不移位。
- [x] 详细瓦片稳定复用、最多 128 张缓存与加载后淡入；飞行时跳过未显示的复杂边界路径生成。
- [x] 本地 TypeScript、可复现 client build 与基于真实洪山区边界的曲线/瓦片回归通过。
- [ ] 实机连续帧率/完整视觉验收：页面已刷新，但后续截图与只读状态请求均被审批服务 502 阻断，
  没有绕过。算法的 60 Hz 采样不等于实机 60 fps；旧发布 MP4 未重录。无提交、推送或部署。

## 2026-09-05：代码同步前验证

- 用户授权同步当前相关代码与文档到 GitHub；不部署。现有工作流仅执行验证与插件生命周期测试。
- Node 全量 112/112、Python 43/43、TypeScript、可复现 client build、版本目录、六案例 freshness、
  70 份 Markdown / 140 个本地链接、七个 Demo GIF 检查通过。
- 待同步文本的常见凭据特征扫描未命中；运行会话、临时录制帧、MP4 与本机宣传文案未纳入 Git。
- 地图实际帧率验收限制及边界缓存来源说明仍保留，不因代码同步而标记为解决。

## 2026-09-06：README 核心流程 GIF

- [x] 从 2026-09-05 洪山区真实会话发布视频中按时间顺序提取十个关键阶段，生成 960×540、
  28.1 秒、131 帧、5,415,797 bytes 的循环 GIF；统一 128 色调色板减少颜色闪动与体积。
- [x] 保留输入、计划、地图飞行、边界、巡检、蒙版、报告及显隐/透明度操作；没有补造执行状态
  或插值运动帧。Source/GIF SHA256、剪辑区间和时长保存在 Topic 的 Storyboard/Manifest 中。
- [x] README 首屏展示核心 GIF，保留安装和使用步骤，主界面与七个原案例改为折叠展示；
  保留真实缓存、RGB 初筛的限制说明，并修正未提交 MP4 的 Markdown 链接。
- [x] 新增可离线校验的生成脚本与回归测试；相关 Node 11/11、七个旧 GIF 检查、145 个文档链接
  及新 GIF 全帧解码通过。GIF 来源早于连续飞行优化，不替代新版相机的实机帧率验收。
