# GeoHarness GIS Agent 平台 v1.0 开发文档

> **文档状态**：当前主开发计划
> **基线提交**：`4326848`
> **制定日期**：2026-08-31
> **目标版本**：GeoHarness Platform `v1.0.0`
> **Harness 基线**：DeepSeek Harness `0.1.1-rc.2` / Cordis `4.0.1`

本文定义 GeoHarness 从“已验证的 Agentic GIS 插件与案例体系”走向“可供用户处理自己数据的 GIS Agent 平台”所必须完成的工作。此前的 [`GeoHarness_Agentic_GIS_方案_v1.0.md`](GeoHarness_Agentic_GIS_方案_v1.0.md) 继续作为项目最初的产品与 Phase 规划基线；当前平台版本以本文为主计划，以 [`../architecture/harness-integration.md`](../architecture/harness-integration.md) 为真实 Harness API 依据。

---

## 1. 产品定义

GeoHarness v1.0 是一个基于 DeepSeek Harness 的本地优先、矢量优先 GIS Agent 平台：

```text
项目 / 会话
→ 导入或发现真实空间数据
→ 用户描述空间目标
→ Native Harness Agent 自主选择数据和 GIS Tools
→ 真实工具执行并生成可追踪图层
→ 地图、步骤、流式输出同步
→ 用户继续修订
→ 导出图层、统计和可复现结果
```

正式产品不以 Scenario ID、关键词路由或固定距离模板驱动。`examples/scenarios/*` 只承担确定性回归、教学、Demo 和视频素材职责。

### 1.1 v1.0 的核心判断

在不选择任何示例的情况下，用户应能：

1. 新建或打开 Harness 项目与会话；
2. 导入一份自己的矢量数据，或选择部署提供的数据目录；
3. 用自然语言提出一个此前没有预设的新空间需求；
4. 看到 Agent 使用真实参数调用真实 GIS Tools；
5. 在地图、图层、步骤、统计和导出文件中核查结果；
6. 在同一会话继续修改需求，并得到更新后的真实结果。

只有这条链路通过，GeoHarness 才算 GIS Agent 平台，而不只是案例播放器。

---

## 2. 已有并保留的真实基线

以下能力已经实现，不在新版本中重复造轮子：

- 一个可安装的双面 Harness Bundle，不复制或长期修改上游源码；
- 保留原生 AppFrame、项目/会话历史、设置、模型选择和输入框；
- 正式执行使用 Native Harness Session 与 Agent，而不是 Scenario fallback；
- `discover_datasets`、`list_layers` 与 11 个分析/导出工具，共 13 个 `defineTool`；
- GeoPandas/Shapely/PyProj 支撑的真实矢量运算；
- 磁盘持久化 Layer Registry、GeoPackage 数据与 lineage；
- Agent Stream、Tool Trace、步骤状态和地图图层同步；
- Layer 显隐、透明度、要素检查、拖拽、适配范围和滚轮缩放；
- 7 个真实 NYC Scenario、独立数据、测试、GeoPandas oracle、GIF 与视频 Prompt；
- 非预设 275 米和 500 米改 200 米的真实回归。

新开发必须保持上述门禁继续通过。

---

## 3. v1.0 必须做实的范围

### 3.1 通用 Workspace 资产模型

为每个真实 Harness Session 建立明确、可恢复的 Geo Workspace manifest，至少记录：

```text
workspace_id / session_id
created_at / updated_at
input datasets
canonical layers
derived layers
Agent runs
Tool calls
result artifacts
exports
```

要求：

- Workspace 只写入仓库配置的工作根目录；
- 重新打开历史会话时能恢复图层、显隐状态、运行摘要和结果资产；
- 不同 Session 的 Layer ID、导出文件和历史互不污染；
- manifest 使用版本字段，未来可迁移；
- 删除或清理仅作用于经过解析和校验的单个 Workspace。

### 3.2 用户矢量数据导入

v1.0 必须提供真实端到端导入，而不只是浏览器内存中的 GeoJSON 测试：

| 格式 | v1.0 要求 |
| --- | --- |
| GeoJSON | 必须完整支持 |
| Shapefile ZIP | 必须安全解压并导入一个明确图层 |
| GeoPackage | 必须支持选择或显式指定图层；单图层文件可直接导入 |
| CSV + lon/lat | 必须支持指定经纬度字段和 CRS |

导入链路：

```text
Browser File
→ loopback-only Harness Connection RPC
→ 大小、扩展名和文件名校验
→ workspace/imports
→ Python/GeoPandas 读取
→ canonical GeoPackage
→ Layer Registry
→ Agent list_layers
→ Map projection
```

要求：

- 单文件默认上限 20 MB，可配置但必须有硬上限；
- ZIP 防止路径穿越、符号链接和解压炸弹；
- 不允许浏览器提交任意服务器文件路径；
- 导入失败不注册残缺 Layer；
- 返回真实字段、CRS、几何、数量、bbox 和警告；
- Agent 能通过现有 `list_layers` 发现上传后的 canonical Layer ID。

### 3.3 数据检查与 Layer 工作台

用户导入数据后，无需先运行分析即可看到：

- 图层名称、来源、CRS、几何类型、要素数量；
- 字段名与字段类型；
- 前 100 条属性记录；
- 空值、无效几何和缺失 CRS 警告；
- 图层显隐、透明度、重命名和移除；
- 要素点击与属性表选择联动。

权威数据仍来自 Host/Python Registry；浏览器不得把本地临时对象冒充 canonical Layer。

### 3.4 通用 Native Agent 运行记录

不新增与 Harness 平行的第二套聊天或 LLM Planner。平台以 Native Session 事件为事实源，将每轮真实执行投影成版本化 Run Manifest：

```text
run_id
session_id
user_goal
started_at / finished_at
model / provider（不含凭据）
tool calls and statuses
input / output Layer IDs
final answer reference
errors / retries
```

要求：

- 运行记录来自 `user/message`、`tool/call`、`tool/result`、`assistant/message`、`turn/end`；
- 不保存隐藏 Chain-of-Thought；
- 页面刷新后仍能恢复运行摘要；
- 每个输出 Layer 能追溯到 Tool Call 与输入 Layer；
- Provider、数据和工具错误明确区分；
- 失败运行可以从新一轮用户输入继续，不伪造成功。

### 3.5 对话式修订

v1.0 不要求实现任意自然语言程序变换器，但必须把以下修订做实：

- 距离和单位修改；
- 空间谓词修改；
- 属性过滤值修改；
- 输出格式修改；
- 在已有结果上追加一个空间条件。

修订继续走同一 Native Harness Session。Agent 必须复用 Registry 中仍有效的 Layer ID；新 Tool Call 产生新 lineage。UI 应以 Run Manifest 对比显示本轮执行了哪些 Tool、引用了哪些已有 Layer、生成了哪些新结果，而不是声称模型内部完成了不可验证的“局部重算”。

### 3.6 Result Center

在现有 Agent Stream 之外增加结构化 Result Center，至少展示：

- 最终 Agent 回答；
- 本轮成功/失败 Tool 数量；
- 输入与最终输出 Layer；
- Tool Result 中的关键统计表；
- CRS、单位、数据来源和警告；
- GeoJSON、GeoPackage、CSV 导出资产；
- Run Manifest 下载。

结果中心不得从自然语言猜测统计数字；只能消费真实 Tool Result、Registry metadata 和导出记录。

### 3.7 可扩展契约

v1.0 做实扩展契约，不做完整 Marketplace：

- Dataset catalog 使用版本化 JSON Schema；
- Geo Tool 使用统一 manifest 描述 name、version、capability、input/output、timeout 和 map effect；
- 内置 13 个 Tool 从同一 catalog 注册并生成文档/测试清单；
- 第三方新增 Tool 不需要修改 Agent Stream 或 Result Center 的核心渲染逻辑；
- 未安装能力必须被 Agent 明确报告，不能编造结果。

### 3.8 安全、稳定性与发布工程

必须包含：

- MIT License（与当前上游许可一致）；
- 可在本地一次执行的 Node build/typecheck/test、Python test、Scenario/media/docs checks；
- `CONTRIBUTING.md`、`SECURITY.md`、`CHANGELOG.md`；
- 文件上传和 Workspace 路径安全测试；
- Tool timeout、AbortSignal、失败清理和并发 Workspace 隔离测试；
- Windows 本地完整验收；
- 隔离 `DSH_HOME` 下的插件添加、启动、HTTP 探测和卸载检查；
- `v1.0.0` Release Notes 与兼容矩阵。

仓库保留 Windows/Linux GitHub Actions 作为后续部署参考，但按 2026-08-31 的发布决策，远程
CI、Tag 和 GitHub Release 不属于当前本地 v1.0 的完成门禁，待后续单独处理。

---

## 4. v1.0 明确不做

以下内容有价值，但不进入本次大版本验收：

- GeoTIFF、栅格代数、遥感大模型；
- GEE、STAC 全量搜索与云端数据处理；
- 路网等时圈、导航和交通时效模型；
- 3D GIS、点云、Cesium；
- Multi-Agent 编排；
- 多租户、组织权限、计费和云 SaaS 控制台；
- 任意第三方 Tool Marketplace；
- 自动从互联网下载任何未经用户确认的数据；
- 以增加 Scenario 数量代替平台能力。

这些内容进入 v1.1/v2.0 候选，不得以 TODO 骨架混入 v1.0。

---

## 5. 目标架构

```text
DeepSeek Harness AppFrame
├── Native Project / Session / Settings / Model / Composer
└── GeoHarness conversation.session
    ├── Layer & Data panel
    ├── Map workspace
    ├── Agent Stream / Tool Trace
    └── Result Center

Native Harness Session Events
→ Agent Run Projector
→ versioned Run Manifest

Harness defineTool Registry
→ Geo Service Provider
→ Python vector runtime
→ disk-backed Workspace / Layer Registry

Browser Upload
→ loopback Connection RPC
→ bounded workspace imports
→ canonical Layer
→ Agent list_layers
```

### 5.1 权威来源

| 信息 | 权威来源 |
| --- | --- |
| 会话、模型、流式消息、Tool 事件 | Harness Session history |
| 图层、CRS、数量、lineage、GeoJSON | Python Layer Registry |
| 用户文件与导出资产 | Workspace manifest + 受限目录 |
| 地图状态 | Browser UI state，可由 Workspace preference 恢复 |
| 最终统计 | Tool Result / Registry，不是模型文本 |
| 示例预期 | Scenario oracle，仅用于回归 |

---

## 6. 开发 Phase

每个 Phase 必须完成实现、自动测试、真实数据验证、`PROGRESS.md`、`BLOCKERS.md` 和独立 Git commit 后才能进入下一 Phase。

### Platform Phase 0：发布基线与文档一致性

交付：

- MIT License、Contributing、Security、Changelog；
- GitHub CI 基础门禁；
- 修复 README、Bundle README 与当前真实 Slot/Agent 架构的不一致；
- 增加平台 v1.0 文档自动门禁；
- 完整测试在当前基线通过。

完成标准：干净工作区可运行文档门禁和全部既有测试，仓库不包含生成 MP4 或凭据。

### Platform Phase 1：Workspace Manifest

交付：

- versioned Workspace manifest；
- Session → Workspace 的稳定映射；
- input/derived/export/run 资产索引；
- 原子写入、恢复、隔离和安全清理；
- Host 与 Python 测试。

完成标准：关闭并重新创建 Provider/客户端后，同一 Session 能恢复 canonical Layers 与资产清单；另一个 Session 不可见。

### Platform Phase 2：用户矢量数据导入

交付：

- loopback upload RPC；
- GeoJSON、Shapefile ZIP、GeoPackage、CSV lon/lat 导入；
- 浏览器上传入口与进度/错误；
- 安全限制和格式测试；
- Agent `list_layers` 可发现上传 Layer。

完成标准：不用 Scenario catalog，上传测试数据后，Agent 可基于真实 Layer ID 完成一次非预设分析。

### Platform Phase 3：数据与 Layer 工作台

交付：

- metadata/字段/警告面板；
- 前 100 行属性表；
- 地图选择与表格选择联动；
- 重命名、移除和可恢复显示偏好；
- 大字段与异常数据边界测试。

完成标准：用户能在 Agent 分析前理解数据，在分析后检查真实结果属性。

### Platform Phase 4：Run Manifest 与通用修订

交付：

- Native Session → Run Manifest projector；
- 运行历史恢复与对比；
- 距离、谓词、属性值、输出格式和追加条件的 E2E 修订；
- reuse/executed/new outputs 的可验证展示；
- Provider/Tool/Data 错误分类。

完成标准：至少 5 类修订均通过真实 Tool Call 与空间 oracle，不依赖固定 Scenario router。

### Platform Phase 5：Result Center 与导出

交付：

- 最终回答、统计、来源、CRS、警告、输入/输出 Layer；
- 导出资产列表和安全下载；
- Run Manifest 导出；
- GeoJSON、GeoPackage、CSV 验证；
- 结果刷新后恢复。

完成标准：一个完整任务能交付可下载数据、可核查统计和可复现运行记录。

### Platform Phase 6：Tool / Dataset 扩展契约

交付：

- Dataset schema；
- Tool manifest catalog；
- 内置 Tool 由 catalog 驱动注册/文档；
- 示例第三方 Tool 或 fixture 插件；
- 缺失能力与版本冲突门禁。

完成标准：新增一个测试 Tool 时无需修改 Agent Stream、Layer panel 或 Result Center 核心代码。

### Platform Phase 7：稳定性、安全与性能

交付：

- 文件、ZIP、路径、大小和 Workspace 隔离安全测试；
- 超时、取消、进程退出和失败清理；
- Layer/GeoJSON 大小上限与分页/截断；
- 重复 Tool 调用和并发 Session 验证；
- 结构化诊断导出。

完成标准：失败不会留下已注册的半成品 Layer，不会越界读写，也不会让其他会话看到数据。

### Platform Phase 8：平台 E2E 与 v1.0.0 本地验收

交付：

- Windows 本地完整门禁；
- 隔离 Harness profile 的安装、启动、HTTP 探测和卸载；
- 至少 3 个用户上传数据的非预设 E2E；
- 现有 7 个 Scenario 全部继续通过；
- README、Release Notes 和兼容矩阵；
- 多案例视频仅作为不同 GIS 方法的展示。

完成标准：满足第 1.1 节全部核心判断，并通过本文第 7 节验收矩阵。

远程 Linux/Windows CI、`v1.0.0` Tag 与 GitHub Release 延后到部署阶段，不阻塞本 Phase。

---

## 7. v1.0 验收矩阵

| 验收任务 | 数据入口 | 必须验证 |
| --- | --- | --- |
| 上传建筑数据并检查质量 | 用户 GeoJSON | 导入、字段、CRS、几何、地图、Agent 回答 |
| 上传道路与建筑，查询任意 275 米 | 用户数据 | 非预设参数、米制 CRS、buffer、filter、数量 |
| 上传区域与建筑，按区域统计 | 用户数据 | spatial join、aggregation、属性表、导出 |
| 修改 275 米为 200 米 | 同一 Session | 旧 Layer 引用、新 Tool Call、新 lineage、结果变化 |
| 把 `within` 改为 `intersects` | 同一 Session | predicate 真正变化并可核查 |
| 导出结果 | Result Center | GeoJSON、GeoPackage、CSV 与真实数量 |
| 不支持的栅格需求 | 无对应能力 | 明确能力缺口，不生成虚假图层 |
| 恶意 ZIP/越界路径 | 上传入口 | 拒绝、无残留、无越界写入 |
| 两个并发 Session | 独立 Workspace | Layer、运行、导出完全隔离 |

每个空间正确性任务使用独立 GeoPandas/Shapely oracle，不以 Agent 文本作为验收依据。

---

## 8. 工程规则

1. 严格遵守 `Goal → Plan → Tools → Layers → Map → Verify → Revise → Result`。
2. 正式 UI 不调用 Scenario/goal router；Scenario 只用于回归与演示。
3. 不复制 DeepSeek Harness 源码，不重新实现原生设置、模型、输入框和会话系统。
4. 用户输入的距离、谓词、字段和输出格式必须原样进入真实 Tool 参数。
5. 新能力必须有代码、测试、真实数据和可观察结果，不以 TODO 或空骨架完成。
6. 所有 canonical 空间数据和统计来自 Python Registry/Tool Result。
7. 文件和路径操作默认拒绝越界；密钥永不进入日志、manifest 或前端状态。
8. 每个 Phase 独立提交；生成视频、缓存、工作区和凭据不进入 Git。
9. 普通依赖、构建和 Harness API 错误自行诊断；只有真正外部阻塞才停止。
10. 上游 Harness 升级必须重新执行 [`../architecture/harness-integration.md`](../architecture/harness-integration.md) 中的兼容性核对。

---

## 9. v1.0 结果定义

GeoHarness Platform v1.0 完成时，项目应具备以下产品形态：

```text
Native Harness Project / Session
        ↓
User Data or Dataset Catalog
        ↓
Autonomous GIS Agent
        ↓
Verified Vector Tools
        ↓
Persistent Layers + Map + Run History
        ↓
Conversational Revision
        ↓
Result Center + Export + Reproducibility
```

多个案例和视频只负责体现不同 GIS 分析方法。平台本身必须能够面对用户上传的新数据和未预设的新需求。
