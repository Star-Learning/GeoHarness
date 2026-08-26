# Scenario 06 视频脚本

## 视频标题建议

AI 能自己规划一套多约束 GIS 工作流吗？

## 开场问题

目标同时要求“靠近主要道路”和“远离两条河流”。这不是单个 Tool Calling，而是两个空间条件的组合与布尔逻辑。

## 用户输入

选择 Scenario 06，展示输入：

> 找出距离主要道路 300 米以内，同时距离 Hudson River 和 East River 至少 800 米的建筑。

## Agent Plan

扫过九步 DAG：检查数据、筛主要道路、分别转换道路与河流、创建 300 m 道路 buffer 和 800 m 河流排除 buffer、先选道路候选、再排除河流邻近建筑、最后汇总。

## 关键地图变化

运行后同时显示两类 Buffer 与多级候选 Layer。选中 `Exclude buildings near rivers`，地图最终只高亮 2 个满足 `inside road buffer AND outside river buffer` 的建筑。

## 最终结果

口播：独立 oracle 确认结果为 2；它们到主要道路均不超过 300 米，同时到 Hudson River / East River 至少 800 米，所有 Task outputs 都已链接到 verified map Layers。

## 继续追问

依次点击道路候选 step 与河流排除 step，观察地图从第一道约束到最终布尔结果的变化，说明中间决策可检查、可解释。

## 结尾一句

从单个工具调用到多约束规划，GeoHarness 让每一步空间逻辑都能在地图上被证实。
