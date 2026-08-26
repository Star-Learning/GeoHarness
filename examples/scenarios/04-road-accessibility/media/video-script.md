# Scenario 04 视频脚本

## 视频标题建议

AI 能自己组合多步 GIS 工具判断道路可达性吗？

## 开场问题

道路可达建筑不仅要做 Buffer，还要先筛出主要道路，再按 Community District 汇总。这个组合工作流能否由 Agent 自动规划？

## 用户输入

选择 Scenario 04，展示输入：

> 找出距离主要道路 300 米以内的建筑，并按 Community District 统计数量。

## Agent Plan

依次展示属性筛选、CRS 转换、300 m Buffer、建筑筛选、District Join 和分区聚合七步。强调中间 Layer 不会被隐藏在一次黑盒调用中。

## 关键地图变化

运行后可见 major road、300 m buffer、accessible buildings 和分区统计层。点击 `Select accessible buildings`，地图只高亮 3 个满足距离约束的建筑。

## 最终结果

口播：结果为 3 个可达建筑，全部属于 MN-DEMO-01，MN-DEMO-02 为 0；独立距离复算确认三者都在主要道路 300 米以内。

## 继续追问

在 Task Graph 中切换到最终聚合 step，对比候选建筑高亮与 District 统计高亮，展示 Step → Layer → Map 的双向定位。

## 结尾一句

真正的 Agentic GIS 不只是调用一个工具，而是组合并验证整条空间分析链。
