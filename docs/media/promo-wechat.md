# 一句话完成 GIS 分析：GeoHarness 开源了

> **文档状态**：公众号发布素材，不属于开发规范。

> 让 Agent 不只是聊天，而是真正调用 GIS 工具、生成地图图层并返回可验证的结果。

![GeoHarness 主界面](https://raw.githubusercontent.com/Star-Learning/GeoHarness/main/examples/scenarios/05-parameter-revision/screenshots/result-200m.jpg)

传统 GIS 分析往往需要手动找数据、转换坐标系、设置参数、叠加图层，再整理统计结果。GeoHarness 把这些步骤接入 DeepSeek Harness：你只需要描述空间目标，Agent 就会发现可用数据、规划任务、调用工具，并把执行过程同步展示在地图上。

## 它能做什么？

- 检查空间数据的字段、坐标系与几何质量
- 完成缓冲区、空间筛选和空间连接
- 按行政区或其他区域进行统计汇总
- 组合距离、道路、河流等多重选址条件
- 在对话中修改参数，并只重算受影响的步骤

例如，把分析距离从 500 米改成 200 米时，GeoHarness 会读取新的输入参数，复用仍然有效的上游结果，并动态更新图层与统计结果。

![对话式参数修改](https://raw.githubusercontent.com/Star-Learning/GeoHarness/main/examples/scenarios/05-parameter-revision/media/demo.gif)

更复杂的需求也可以直接用自然语言表达，例如：找出距离 Broadway 300 米以内、同时距离 Hudson River 和 East River 至少 800 米的建筑。

![多条件选址](https://raw.githubusercontent.com/Star-Learning/GeoHarness/main/examples/scenarios/06-multi-constraint-selection/media/demo.gif)

项目目前提供 7 个基于真实 NYC Open Data 快照的案例，每个案例都有独立数据、测试和演示。GeoHarness 不是预设案例播放器：案例用于验证 GIS 结果，正式使用时由 Agent 根据你的输入自主规划。

项目地址：[github.com/Star-Learning/GeoHarness](https://github.com/Star-Learning/GeoHarness)

如果你也在关注 GIS Agent、GeoAI 或可验证的空间分析工作流，欢迎试用、Star 和交流。
