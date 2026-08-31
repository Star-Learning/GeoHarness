# 我把 DeepSeek Harness 变成了一个会做 GIS 的 Agent 🗺️

> **文档状态**：小红书发布素材，不属于开发规范。

![GeoHarness 主界面](https://raw.githubusercontent.com/Star-Learning/GeoHarness/main/examples/scenarios/05-parameter-revision/screenshots/result-200m.jpg)

最近做了一个开源项目：**GeoHarness**。

输入一句空间分析需求，Agent 会自己找数据、拆步骤、调用 GIS 工具；右侧能看到执行进度，中间地图同步增加图层，最后还会给出文字和统计结果。

## 它不是预设好的 Chat + Map

- 缓冲区 200 米还是 500 米，直接由输入决定
- 修改参数后，只重算真正受影响的步骤
- 图层来自真实工具结果，不由聊天文本“编”出来
- 使用真实 NYC Open Data，并为每个案例保留独立测试

![参数修改演示](https://raw.githubusercontent.com/Star-Learning/GeoHarness/main/examples/scenarios/05-parameter-revision/media/demo.gif)

我目前用它做了建筑数据检查、河流缓冲区查询、分区统计、道路可达性、多条件选址等 7 个案例。

下面这个案例同时组合了道路距离和河流距离两个条件，Agent 会逐步生成图层并筛选最终候选建筑：

![多条件选址演示](https://raw.githubusercontent.com/Star-Learning/GeoHarness/main/examples/scenarios/06-multi-constraint-selection/media/demo.gif)

项目已开源，GitHub 搜索：**Star-Learning/GeoHarness**

适合对 GIS、Agent、GeoAI、空间数据分析或 DeepSeek Harness 插件开发感兴趣的朋友。

#开源项目 #GIS #GeoAI #Agent #DeepSeekHarness #空间分析 #程序员 #人工智能
