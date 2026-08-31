# Video Outline

> **主题**：待确认（推荐 `warm-keynote`）—— 保持 GeoHarness 现有亮色产品界面的克制气质
> **总时长**：约 70–75 秒（口播 16 个节拍，转场留出约 5 秒）
> **章节数**：3 章 / 16 步

---

## 1. hook — 一句话开始 GIS 分析（3 steps · ~11s）

**信息池**：
- 产品：DeepSeek Harness 的 Agentic GIS 插件 —— 来源 article §1
- 交互：自然语言需求直接进入 Agent 工作流 —— 来源 article §1
- 对比：不是预设案例选择器，参数来自输入 —— 来源 article §1

**开发计划**：

- step 1 (~4s) — GIS 手工操作界面与“一步步点完？”的核心问题
- step 2 (~3s) — 一条自然语言需求和 GeoHarness 完整主界面
- step 3 (~4s) — “输入参数”与“预设案例”形成鲜明对照

口播节选：
> 做一次 GIS 分析，真要手动点完每一步吗？我只输入一句需求，GeoHarness 就开始干活。

---

## 2. agent-run — 多条件任务真实执行（7 steps · ~31s）

**信息池**：
- 条件一：距离 Broadway 300 米以内 —— 来源 article §2
- 条件二：距离 Hudson River 和 East River 至少 800 米 —— 来源 article §2
- 工具链：数据发现、坐标转换、道路筛选、缓冲区、空间过滤 —— 来源 article §2
- 结果：真实 NYC Open Data 得到 27 栋候选建筑 —— 来源 article §2
- 可验证性：每一步都有对应工具结果和地图图层 —— 来源 article §1–2

**开发计划**：

- step 1 (~4s) — Broadway 300 米条件作为任务的第一层约束
- step 2 (~6s) — 两条河 800 米条件加入同一空间目标
- step 3 (~4s) — 可用数据与 Agent 任务计划同时成为画面焦点
- step 4 (~5s) — 坐标转换、道路、缓冲区和空间过滤工具链
- step 5 (~4s) — 右侧完成步骤与中间新增图层的对应关系
- step 6 (~4s) — 地图上的 27 栋最终候选建筑与核心数字
- step 7 (~4s) — “模型文字”与“真实 GIS 工具图层”的可信度对比

口播节选：
> 这次条件有两个。两个距离条件，共同筛出二十七栋建筑。这个数字不是模型猜的。

---

## 3. revision-open — 会修改，也能验证（6 steps · ~28s）

**信息池**：
- 参数修改：Broadway 范围从 500 米改为 200 米 —— 来源 article §3
- 复用：3 个有效上游步骤继续使用 —— 来源 article §3
- 重跑：缓冲与筛选共 2 个步骤 —— 来源 article §3
- 结果变化：329 栋更新为 205 栋 —— 来源 article §3
- 完整性：7 个案例各有独立真实数据、测试和 Demo —— 来源 article §4
- 边界与入口：当前聚焦矢量 GIS，GitHub 项目地址明确 —— 来源 article §4

**开发计划**：

- step 1 (~4s) — 对话框中的“把 500 米改成 200 米”追问
- step 2 (~5s) — 3 个复用步骤和 2 个重跑步骤的任务状态
- step 3 (~4s) — 建筑数量从 329 到 205 的结果变化
- step 4 (~5s) — 7 个真实数据案例的缩略画面集合
- step 5 (~4s) — 矢量 GIS 工作流与开源状态
- step 6 (~6s) — GeoHarness 名称、GitHub 地址和最终行动提示

口播节选：
> 你还能继续追问。结果从三百二十九栋，更新为二百零五栋。代码已经开源。

---

## 素材清单

### 1. hook
- ✓ GeoHarness 完整主界面截图（`examples/scenarios/05-parameter-revision/screenshots/result-200m.jpg`）
- ✓ 真实对话输入文案（`promo-video/script.md`）
- ⚠️ 独立 GeoHarness 标志（当前使用文字字标，不伪造 Logo）

### 2. agent-run
- ✓ 多条件选址完整 GIF（`examples/scenarios/06-multi-constraint-selection/media/demo.gif`）
- ✓ 多条件选址初始与结果截图（`examples/scenarios/06-multi-constraint-selection/screenshots/`）
- ✓ 27 栋候选建筑的真实验证数字（`promo-video/article.md`）

### 3. revision-open
- ✓ 参数修改完整 GIF（`examples/scenarios/05-parameter-revision/media/demo.gif`）
- ✓ 500 米与 200 米结果截图（`examples/scenarios/05-parameter-revision/screenshots/`）
- ✓ 全部 7 个案例 GIF（`examples/scenarios/*/media/demo.gif`）
- ⚠️ 口播音频（Checkpoint Audio 决定是否合成）
