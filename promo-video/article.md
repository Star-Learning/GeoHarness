# GeoHarness 宣传视频素材底稿

## 1. 产品定位

GeoHarness 是 DeepSeek Harness 的 Agentic GIS 插件。用户直接输入自然语言空间需求，Agent 自动发现数据、规划步骤、调用 GIS 工具，并同步展示流式输出、执行进度、地图图层和最终结果。正式界面不依赖预设案例选择器，距离与筛选条件来自用户输入。

## 2. 多条件选址案例

案例要求筛选距离 Broadway 300 米以内，同时距离 Hudson River 和 East River 至少 800 米的建筑。工作流包含数据发现、坐标转换、道路筛选、缓冲区和空间过滤。使用真实 NYC Open Data 快照得到 27 栋候选建筑，每一步都产生可核查图层。

## 3. 对话式参数修改

另一个案例先分析 Broadway 500 米范围，得到 329 栋建筑。用户追问改为 200 米后，GeoHarness 复用 3 个仍然有效的上游步骤，只重跑缓冲与筛选 2 个步骤，结果更新为 205 栋建筑。

## 4. 真实性与开源

GeoHarness v1.0 提供 7 个独立案例。每个案例都有自己的真实数据、测试和 Demo。目前聚焦矢量 GIS 工作流。项目已开源，地址为 https://github.com/Star-Learning/GeoHarness，并通过 `dsh-plugin` GitHub Topic 进入 DeepSeek Harness 插件发现分组。

## 5. 已有视觉素材

- 完整主界面截图：`examples/scenarios/05-parameter-revision/screenshots/result-200m.jpg`
- 多条件选址 GIF：`examples/scenarios/06-multi-constraint-selection/media/demo.gif`
- 参数修改 GIF：`examples/scenarios/05-parameter-revision/media/demo.gif`
- 7 个案例 GIF：`examples/scenarios/*/media/demo.gif`
