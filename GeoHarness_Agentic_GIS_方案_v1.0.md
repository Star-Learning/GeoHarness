# GeoHarness v1.0
## 面向 AI Agent 时代的需求驱动型遥感 / GIS 工作空间

> **项目定位**：基于 DeepSeek Harness 构建的 Agentic Geospatial Workspace  
> **版本**：v1.0  
> **核心范式**：**Goal-driven → Agent-planned → Map-verifiable → Human-revisable**  
> **Demo 原则**：**一个需求 = 一个 Demo 文件夹 = 一套测试 = 一条展示视频**

---

# 0. 给 Codex 的一句话任务

开发一个独立开源项目 **GeoHarness**。

GeoHarness 不是 QGIS 的复制品，也不是“地图 + ChatGPT”。

它需要建立在 **DeepSeek Harness** 之上，让用户只描述现实中的空间需求，由 Agent 自动：

```text
理解目标
→ 识别数据
→ 生成 GIS Task Graph
→ 调用 Geo Tools
→ 产生中间图层
→ 在地图上逐步验证
→ 接受用户修改
→ 局部重新规划 / 重算
→ 输出结果
```

GeoHarness v1.0 聚焦一个完整闭环：

```text
用户选择 Demo / 上传矢量数据
→ 输入一个空间需求
→ Agent 自动规划
→ 自动执行 GIS Tools
→ 地图逐步展示
→ 用户查看过程
→ 用户修改需求
→ 局部重新计算
→ 导出数据 + 统计 + 结论
```

---

# 1. 产品核心思想

传统 GIS 软件是：

```text
Problem
↓
User chooses tools
↓
Buffer
↓
Clip
↓
Spatial Join
↓
Field Calculator
↓
Result
```

GeoHarness 是：

```text
Problem
↓
Agent understands the goal
↓
Agent creates a plan
↓
Agent selects tools
↓
Agent executes
↓
Map verifies every important step
↓
User revises
↓
Result
```

因此 GeoHarness 的核心不是：

> “提供了多少 GIS Tools？”

而是：

> **“用户提出一个现实空间需求后，系统能否完整解决它？”**

---

# 2. 产品定位

GeoHarness 定义为：

> **一个面向真实空间需求的 Agentic Geospatial Workspace。用户通过自然语言描述空间问题，Agent 自动规划并组合 GIS、遥感与 AI 能力，在地图上完成可验证、可修改、可追踪的分析。**

v1.0 重点围绕四个关键词：

## 2.1 Goal-driven

用户表达目标，而不是选择工具。

例如：

```text
找出距离河流 500 米以内的建筑。
```

用户无需知道：

```text
CRS
Buffer
Intersection
Spatial Filter
```

---

## 2.2 Agent-planned

Agent 将需求转成结构化 Task Graph。

---

## 2.3 Map-verifiable

关键 GIS 步骤必须有对应地图结果。

---

## 2.4 Human-revisable

用户可以继续说：

```text
500 米改成 1 公里。
```

系统只重算受影响步骤。

---

# 3. GeoHarness 与 DeepSeek Harness 的关系

## 3.1 GeoHarness 必须新建独立仓库

不要长期 fork DeepSeek Harness 官方仓库进行业务开发。

推荐本地开发目录：

```text
GeoHarness-Dev/
│
├── deepseek-harness/    # 官方仓库，仅用于阅读、调试、对照和必要的本地 link
│
└── geoharness/          # GeoHarness 正式开发仓库
```

正式开源：

```text
geoharness/
```

---

## 3.2 DeepSeek Harness 负责什么

```text
LLM
Agent Runtime
Agent Loop
Session
Tool Registry
Approval / Sandbox
Services
Events
Plugin System
Profile / Bundle
Web Runtime
```

GeoHarness 负责：

```text
Geo Task Understanding
Geo Tools
Geo Backend
Layer Registry
Task Graph
Map Workspace
Geo Result UI
Demo Scenarios
Scenario Tests
```

---

## 3.3 UI 基于 Harness Web 体系扩展

优先：

```text
DeepSeek Harness Web
+
GeoHarness UI Plugin
+
GeoHarness Profile
+
GeoHarness Bundle
```

注入：

```text
Map Workspace
Layer Panel
Agent Task Panel
Geo Result Panel
Scenario Launcher
```

如果 Harness 当前 Slot 无法实现三栏 GIS Workspace：

```text
GeoHarness 独立 Web surface / bundle
+
GeoHarness profile patch
```

仍然保持：

> 不长期修改 DeepSeek Harness 官方仓库源码。

---

# 4. GeoHarness v1.0 范围

v1.0 只做：

> **Vector Data Agent**

包括：

```text
GeoJSON
Shapefile ZIP
GeoPackage
CSV + lon/lat
```

暂不重点做：

```text
GeoTIFF
NetCDF
HDF5
遥感大模型
SAM
Change Detection
3D GIS
Point Cloud
GEE
自动搜数据
复杂 Multi-Agent
```

---

# 5. v1.0 官方 Demo 区域

统一使用：

> **Manhattan, New York City**

原因：

- 建筑密集；
- 道路清晰；
- Hudson River / East River 明显；
- 有多个 Community District；
- 公开 GIS 数据较丰富；
- 视频辨识度高；
- 同一地区可以连续演示多个需求。

核心数据类型：

```text
Buildings
Roads
Rivers / Hydrography
Community Districts
```

---

# 6. 最重要的 Demo 设计原则

GeoHarness 不按“功能”组织 Demo。

不要这样：

```text
buffer-demo/
spatial-join-demo/
clip-demo/
```

应该按真实用户需求组织：

```text
river-building-query/
building-statistics/
road-accessibility/
```

即：

> **一个需求 = 一个完整 Demo。**

每个 Demo 既是：

```text
Product Demo
+
Integration Test
+
Regression Test
+
Tutorial
+
Video Material
+
Social Media Content
```

---

# 7. Demo 文件夹规范

所有示例统一放在：

```text
examples/
└── scenarios/
```

每个需求一个独立文件夹。

推荐结构：

```text
examples/
└── scenarios/
    │
    ├── 01-building-data-inspection/
    │   ├── README.md
    │   ├── prompt.txt
    │   ├── expected-plan.json
    │   ├── expected-result.json
    │   ├── scenario.json
    │   ├── data/
    │   │   └── buildings.geojson
    │   ├── screenshots/
    │   └── media/
    │       └── video-script.md
    │
    ├── 02-river-building-query/
    │   ├── README.md
    │   ├── prompt.txt
    │   ├── expected-plan.json
    │   ├── expected-result.json
    │   ├── scenario.json
    │   ├── data/
    │   │   ├── buildings.geojson
    │   │   └── rivers.geojson
    │   ├── screenshots/
    │   └── media/
    │       └── video-script.md
    │
    ├── 03-building-statistics-by-district/
    │   └── ...
    │
    ├── 04-road-accessibility/
    │   └── ...
    │
    ├── 05-parameter-revision/
    │   └── ...
    │
    └── 06-multi-constraint-selection/
        └── ...
```

---

# 8. 为什么每个 Demo 自己带数据

即使多个 Demo 使用相同 Manhattan 数据，也建议每个需求文件夹里保留自己运行所需的数据。

例如：

```text
02-river-building-query/
└── data/
    ├── buildings.geojson
    └── rivers.geojson
```

而不是让 Demo 强依赖：

```text
../../shared-data/
```

原因：

### 8.1 Demo 独立

复制单个目录即可完整运行。

### 8.2 测试稳定

某个 Demo 的数据不会因为另一个 Demo 更新而变化。

### 8.3 视频复现方便

录某条视频时直接打开对应 Scenario。

### 8.4 GitHub 更容易理解

用户点进一个文件夹就能看到：

```text
需求
数据
Prompt
Plan
Result
```

### 8.5 后续可以做 Scenario Marketplace / Gallery

每个文件夹天然就是一个可分发 Scenario Package。

---

# 9. 数据体积控制

虽然每个 Scenario 都带数据，但不能简单重复大量原始数据。

必须裁剪成小型测试数据。

建议：

```text
单个 Demo < 10–20 MB
整个 examples/scenarios 尽量 < 100 MB
```

如果原始 Manhattan 数据太大：

```text
固定 bbox
↓
裁剪
↓
简化字段
↓
必要时 geometry simplification
↓
保留最少必要 features
```

Demo 数据目标是：

> 足以验证空间逻辑，而不是完整保存 NYC 数据。

---

# 10. Scenario 文件规范

每个 Demo 必须包含：

## 10.1 `README.md`

包含：

```text
Scenario 名称
真实用户需求
为什么需要这个 Demo
输入数据
数据来源
预期 Agent 行为
关键 GIS 步骤
成功标准
视频展示重点
```

---

## 10.2 `prompt.txt`

只保存最终用户输入。

例如：

```text
找出距离 Hudson River 和 East River 500 米以内的建筑，并告诉我一共有多少栋。
```

---

## 10.3 `scenario.json`

统一描述 Demo 元信息。

例如：

```json
{
  "id": "02-river-building-query",
  "title": "River Building Query",
  "region": "Manhattan, New York City",
  "prompt": "prompt.txt",
  "data": [
    "data/buildings.geojson",
    "data/rivers.geojson"
  ],
  "expected_plan": "expected-plan.json",
  "expected_result": "expected-result.json",
  "supports_revision": true
}
```

---

## 10.4 `expected-plan.json`

不要要求 LLM 生成完全相同的自然语言。

只描述关键 Workflow 要素。

例如：

```json
{
  "required_capabilities": [
    "inspect_dataset",
    "check_or_transform_crs",
    "create_buffer",
    "spatial_filter",
    "calculate_statistics"
  ],
  "constraints": {
    "distance": 500,
    "unit": "meter"
  }
}
```

---

## 10.5 `expected-result.json`

记录可验证的结果。

例如：

```json
{
  "required_output_layers": [
    "river_buffer",
    "candidate_buildings"
  ],
  "checks": [
    "candidate_buildings_count > 0",
    "all_candidates_within_500m_of_river == true"
  ]
}
```

对于固定数据，后期也可以记录具体 feature count。

---

## 10.6 `screenshots/`

保存：

```text
01-input.png
02-plan.png
03-intermediate.png
04-result.png
```

用于：

- README；
- 回归对比；
- 自媒体图文；
- 项目主页。

---

## 10.7 `media/video-script.md`

保存该 Demo 对应的视频流程。

结构统一：

```text
视频标题建议
开场问题
用户输入
Agent Plan
关键地图变化
最终结果
继续追问
结尾一句
```

---

# 11. v1.0 六个官方 Scenario

---

## Scenario 01：Building Data Inspection

目录：

```text
01-building-data-inspection/
```

用户需求：

```text
帮我看看这个建筑数据有什么特点。
```

数据：

```text
buildings.geojson
```

关键 Agent 行为：

```text
Inspect dataset
↓
Geometry type
↓
CRS
↓
Feature count
↓
Fields
↓
Missing values
↓
Invalid geometries
↓
Area / basic statistics
↓
Map summary
```

主要测试能力：

```text
Dataset understanding
Layer Registry
Map rendering
Basic statistics
```

视频重点：

> **AI 能不能自己看懂一份 GIS 数据？**

---

## Scenario 02：River Building Query

目录：

```text
02-river-building-query/
```

用户需求：

```text
找出距离 Hudson River 和 East River 500 米以内的建筑，并告诉我一共有多少栋。
```

数据：

```text
buildings.geojson
rivers.geojson
```

关键流程：

```text
Inspect layers
↓
Check CRS
↓
Transform to metric CRS
↓
River Buffer 500 m
↓
Spatial Filter
↓
Candidate Buildings
↓
Count
↓
Map
```

主要测试：

```text
CRS reasoning
Buffer
Spatial filter
Statistics
Intermediate layer visualization
```

视频重点：

> **只说一句话，AI 自己完成 Buffer + 空间筛选。**

---

## Scenario 03：Building Statistics by District

目录：

```text
03-building-statistics-by-district/
```

用户需求：

```text
按 Community District 统计建筑数量和建筑总面积。
```

数据：

```text
buildings.geojson
districts.geojson
```

流程：

```text
Buildings
↓
Geometry area
↓
Spatial Join
↓
Group By District
↓
Count
↓
Area Sum
↓
Thematic Map
```

主要测试：

```text
Spatial Join
Aggregation
Geometry calculation
Table result
Thematic map
```

视频重点：

> **一句话让 AI 自动做分区统计。**

---

## Scenario 04：Road Accessibility

目录：

```text
04-road-accessibility/
```

用户需求：

```text
找出距离主要道路 300 米以内的建筑，并按 Community District 统计数量。
```

数据：

```text
buildings.geojson
roads.geojson
districts.geojson
```

流程：

```text
Identify major roads
↓
Check CRS
↓
Buffer 300 m
↓
Filter buildings
↓
Spatial Join districts
↓
Aggregation
↓
Map
```

主要测试：

```text
Attribute filtering
Buffer
Spatial filter
Spatial join
Aggregation
```

视频重点：

> **AI 能否自己组合多个 GIS 工具？**

---

## Scenario 05：Parameter Revision

目录：

```text
05-parameter-revision/
```

初始需求：

```text
找出距离主要道路 500 米以内的建筑。
```

第二轮用户输入：

```text
改成 1 公里。
```

数据：

```text
buildings.geojson
roads.geojson
```

系统必须：

```text
保留原 Task Graph
↓
识别 distance 参数变化
↓
500 m → 1000 m
↓
Invalidate downstream steps
↓
重新运行 buffer
↓
重新运行 spatial filter
↓
更新 map
↓
保留历史
```

主要测试：

```text
Context memory
Task dependency
Partial rerun
Layer lineage
Map update
```

视频重点：

> **不是重新问一次，而是真正修改正在执行的 GIS 工作流。**

这是 GeoHarness v1.0 最重要的差异化 Demo 之一。

---

## Scenario 06：Multi-Constraint Selection

目录：

```text
06-multi-constraint-selection/
```

用户需求：

```text
找出距离主要道路 300 米以内，同时距离 Hudson River 和 East River 至少 800 米的建筑。
```

数据：

```text
buildings.geojson
roads.geojson
rivers.geojson
```

流程：

```text
Parse two spatial constraints

Road distance <= 300 m
River distance >= 800 m

↓
Check CRS
↓
Road Buffer 300 m
↓
River Buffer 800 m
↓
Inside road buffer
↓
Outside river buffer
↓
Candidate buildings
↓
Map
↓
Statistics
```

主要测试：

```text
Multi-constraint planning
Multiple intermediate layers
Boolean spatial logic
Task Graph
Result explanation
```

视频重点：

> **从单个 Tool Calling 升级到真正的 Agent Planning。**

---

# 12. Scenario Launcher

GeoHarness 首页增加：

```text
Examples
```

或：

```text
Try a Demo
```

用户可以直接选择：

```text
01 Understand Building Data
02 Buildings Near Rivers
03 Buildings by District
04 Road Accessibility
05 Revise a Spatial Query
06 Multi-Constraint Selection
```

点击后：

```text
加载对应 Scenario 文件夹
↓
自动加载数据
↓
显示建议 Prompt
↓
用户点击 Run 或自己输入
```

---

# 13. Scenario 与测试体系统一

不要单独维护一套 Demo，再维护另一套集成测试数据。

Scenario 本身就是测试输入。

测试框架读取：

```text
scenario.json
prompt.txt
expected-plan.json
expected-result.json
data/
```

然后自动执行。

---

# 14. 测试分三层

## 14.1 Tool-level Test

测试单个 GIS Tool。

例如：

```text
buffer
spatial_join
spatial_filter
transform_crs
```

---

## 14.2 Scenario Workflow Test

不要求 LLM 输出完全相同 Plan 文本。

检查关键能力是否存在。

例如 Scenario 02 至少需要：

```text
CRS Handling
Buffer
Spatial Filter
Statistics
```

允许 Agent 在合理情况下多执行：

```text
inspect_dataset
validate_geometry
```

---

## 14.3 Result Validation

最终检查真实空间结果。

例如：

```text
所有 candidate buildings
是否真的处在 river 500 m 范围内？
```

测试重点：

> 最终空间逻辑正确，而不是只看 Agent 有没有说“完成”。

---

# 15. 视频与开发完全绑定

每完成一个 Scenario：

```text
Scenario Implementation
↓
Integration Test
↓
Screenshots
↓
Record Demo
↓
Bilibili / 小红书 / 公众号
```

不另外为了自媒体重新设计案例。

---

# 16. 推荐视频模板

每个 Scenario 视频保持 1～4 分钟。

结构：

```text
1. 真实问题
2. 打开 GeoHarness
3. 加载 Scenario
4. 输入一句需求
5. 展示 Agent Plan
6. 地图逐步变化
7. 展示最终结果
8. 继续修改一次需求（如果适合）
9. 总结 GeoHarness 做了什么
```

不要以 GIS 功能名作为主标题。

例如不要：

```text
GeoHarness Buffer Demo
```

推荐：

```text
只说一句话，AI 自动找出河流附近的建筑
```

或者：

```text
AI 能自己规划一套 GIS 工作流吗？
```

---

# 17. Demo 数据下载与生成

增加：

```text
scripts/
└── build_scenarios/
    ├── download_nyc_data.py
    ├── build_scenario_01.py
    ├── build_scenario_02.py
    ├── build_scenario_03.py
    ├── build_scenario_04.py
    ├── build_scenario_05.py
    └── build_scenario_06.py
```

职责：

```text
Download source data
↓
Clip Manhattan demo area
↓
Clean fields
↓
Normalize CRS
↓
Simplify / sample if needed
↓
Write scenario-specific files
```

最终 GitHub 仓库中直接保留小型 Scenario 数据。

用户运行 Demo 不需要重新下载。

---

# 18. 数据来源记录

每个 Scenario 的 README 都必须记录：

```text
Data Source
Dataset Name
Original Provider
Region
Download Date
License / Terms
Processing
Fields retained
Spatial clipping
Geometry simplification if any
```

保证开源项目可追踪。

---

# 19. 核心 UI

推荐：

```text
┌─────────────────────────────────────────────────────────────┐
│ GeoHarness                         Scenario       Settings   │
├──────────────┬────────────────────────────┬─────────────────┤
│              │                            │                 │
│ Data /       │                            │ Agent           │
│ Layers       │                            │ Workspace       │
│              │           MAP              │                 │
│ buildings    │                            │ Goal            │
│ roads        │                            │ Plan            │
│ rivers       │                            │ Steps           │
│ districts    │                            │ Result          │
│              │                            │                 │
├──────────────┴────────────────────────────┴─────────────────┤
│ 描述你想解决的空间问题……                                   │
└─────────────────────────────────────────────────────────────┘
```

---

# 20. 左侧：Layers

包含：

```text
Upload
Layer list
Show / hide
Rename
Delete
CRS
Geometry
Feature count
Attribute table
Export
```

不设计传统 GIS Toolbox。

---

# 21. 中间：Map Workspace

支持：

```text
Zoom
Pan
Fit bounds
Layer toggle
Opacity
Feature click
Hover
Tooltip
Highlight
Intermediate layer
Final result layer
```

每个 Task Step 的空间输出应可映射为 Map Layer。

---

# 22. 右侧：Agent Workspace

展示：

```text
Goal
Plan
Current Step
Tool
Input
Parameters
Output
Status
Result
Error
```

不要展示模型冗长 Chain-of-Thought。

示例：

```text
Goal
Find buildings within 500 m of rivers

Plan

✓ Inspect datasets
✓ Check CRS
✓ Create 500 m river buffer
→ Filter buildings
○ Calculate statistics

Current Step

Tool:
spatial_filter

Input:
buildings
river_buffer

Output:
candidate_buildings
```

---

# 23. Task Graph

所有复杂任务都先生成结构化 Task Graph。

例如：

```json
{
  "goal": "找出距离河流500米以内的建筑",
  "steps": [
    {
      "id": "step_1",
      "tool": "inspect_dataset",
      "inputs": ["layer_buildings", "layer_river"]
    },
    {
      "id": "step_2",
      "tool": "transform_crs",
      "inputs": ["layer_river"],
      "output": "layer_river_metric"
    },
    {
      "id": "step_3",
      "tool": "create_buffer",
      "inputs": ["layer_river_metric"],
      "params": {
        "distance": 500,
        "unit": "meter"
      },
      "output": "layer_river_buffer"
    },
    {
      "id": "step_4",
      "tool": "spatial_filter",
      "inputs": [
        "layer_buildings",
        "layer_river_buffer"
      ],
      "output": "layer_candidate_buildings"
    }
  ]
}
```

Task Graph 用于：

```text
Execution
Progress
Map binding
Retry
Partial rerun
Undo
History
Provenance
Testing
```

---

# 24. Layer Registry

内部统一使用 Layer ID。

示例：

```json
{
  "layer_001": {
    "name": "buildings",
    "type": "vector",
    "geometry": "Polygon",
    "crs": "EPSG:4326",
    "source": "scenario",
    "generated_by": null
  },
  "layer_002": {
    "name": "river_buffer",
    "type": "vector",
    "geometry": "Polygon",
    "crs": "EPSG:32618",
    "source": "derived",
    "generated_by": "step_3",
    "parents": ["layer_river"]
  }
}
```

记录：

```text
Layer ID
Name
Geometry
CRS
Parents
Generated by
Parameters
Storage path
Created time
```

---

# 25. v1.0 Geo Tools

第一版控制在约 10～12 个：

```text
inspect_dataset
list_layers
transform_crs
create_buffer
spatial_filter
spatial_join
clip_layer
aggregate_by_region
calculate_geometry
nearest_features
analyze_distribution
export_layer
```

---

# 26. Tool 输出标准

例如：

```json
{
  "success": true,
  "tool": "create_buffer",
  "step_id": "step_3",
  "inputs": ["layer_001"],
  "parameters": {
    "distance": 500,
    "unit": "meter"
  },
  "outputs": ["layer_008"],
  "summary": "Created 500 m buffer.",
  "warnings": []
}
```

Tool 不能只返回自然语言文本。

---

# 27. Geo Backend

推荐：

```text
Python
FastAPI
GeoPandas
Shapely
PyProj
Pyogrio / Fiona
DuckDB Spatial（按需）
```

前端只负责交互和地图展示。

GIS 计算全部由 Geo Backend 完成。

---

# 28. 推荐仓库结构

```text
geoharness/
│
├── packages/
│   ├── ui/
│   │   ├── map/
│   │   ├── layers/
│   │   ├── scenario-launcher/
│   │   ├── task-panel/
│   │   └── result-panel/
│   │
│   ├── workspace/
│   ├── vector-tools/
│   └── analysis-tools/
│
├── bundle/
│   └── geoharness-bundle/
│
├── profile/
│   └── geoharness/
│
├── backend/
│   └── geo-service/
│       ├── api/
│       ├── operations/
│       ├── workspace/
│       ├── models/
│       └── tests/
│
├── examples/
│   └── scenarios/
│       ├── 01-building-data-inspection/
│       ├── 02-river-building-query/
│       ├── 03-building-statistics-by-district/
│       ├── 04-road-accessibility/
│       ├── 05-parameter-revision/
│       └── 06-multi-constraint-selection/
│
├── scripts/
│   └── build_scenarios/
│
├── docs/
│   ├── architecture.md
│   ├── scenario-spec.md
│   ├── tool-spec.md
│   └── task-graph.md
│
├── tests/
├── README.md
└── LICENSE
```

---

# 29. 开发阶段

## Phase 0：Harness Baseline

完成：

```text
Run DeepSeek Harness
Understand profile
Understand bundle
Understand client plugin
Understand slots
Load minimal GeoHarness plugin
```

---

## Phase 1：GeoHarness UI Shell

完成：

```text
GeoHarness branding
Map Workspace
Layer Panel
Agent Panel
Prompt input
Scenario Launcher
```

---

## Phase 2：Build Six Scenario Packages

先把六个需求文件夹全部建立好。

每个至少包含：

```text
README
prompt
scenario.json
data
expected-plan
expected-result
```

这样开发从一开始就围绕真实需求进行。

---

## Phase 3：Layer Registry + Map

实现：

```text
Load Scenario
Read data
Register layer
Render map
Layer show / hide
Feature inspection
```

---

## Phase 4：Geo Backend + Tools

完成核心矢量工具及单元测试。

---

## Phase 5：Harness Tool Integration

让 Agent 根据 Scenario Prompt 自主调用 Geo Tools。

---

## Phase 6：Task Graph

实现：

```text
pending
running
success
failed
dependencies
outputs
```

---

## Phase 7：Map Verification

建立：

```text
Task Step
↕
Layer
↕
Map
```

---

## Phase 8：Scenario Regression Tests

自动运行六个 Scenario。

检查：

```text
Required capability
Required layers
Spatial correctness
Expected statistics
```

---

## Phase 9：Conversational Revision

重点完成 Scenario 05。

---

## Phase 10：Video / README Polish

每个 Scenario 输出：

```text
Screenshots
Demo GIF / video
README
Video script
```

---

# 30. v1.0 最终验收

不是只验收一个“大 Demo”。

必须要求六个 Scenario 都可以独立完成：

```text
01 Building Data Inspection
02 River Building Query
03 Statistics by District
04 Road Accessibility
05 Parameter Revision
06 Multi-Constraint Selection
```

每个 Demo：

```text
独立文件夹
独立数据
独立 Prompt
独立测试
独立 README
独立展示素材
```

并且用户可以：

```text
进入 GeoHarness
↓
选择 Scenario
↓
自动加载数据
↓
输入需求
↓
看到 Plan
↓
看到 Map 变化
↓
得到 Result
```

---

# 31. GeoHarness v1.0 的最终产品逻辑

GeoHarness 不应该被介绍为：

```text
一个拥有 Buffer、Clip、Spatial Join 的 GIS Agent。
```

而应该介绍为：

> **你只需要告诉 GeoHarness 你想解决什么空间问题，它会自己规划 GIS 工作流、执行分析，并把每一步结果展示在地图上。**

---

# 32. GeoHarness 的 Demo / 内容生产逻辑

以后每增加一个能力，不优先新增：

```text
Tool Demo
```

而是新增：

```text
一个真实需求 Scenario
```

标准流程：

```text
User Need
↓
Scenario Folder
↓
Data
↓
Prompt
↓
Expected Workflow
↓
Expected Result
↓
Implementation
↓
Automated Test
↓
Demo Video
↓
GitHub Example
↓
Bilibili / 小红书 / 公众号
```

形成：

> **开发即测试，测试即 Demo，Demo 即内容。**

---

# 33. 一句话总结

GeoHarness v1.0 的产品主线是：

```text
Goal
↓
Plan
↓
Tools
↓
Layers
↓
Map
↓
Verify
↓
Revise
↓
Result
```

而它的工程和内容主线是：

```text
One Need
=
One Scenario Folder
=
One Test
=
One Demo
=
One Video
```

这两条主线共同构成 GeoHarness v1.0。
