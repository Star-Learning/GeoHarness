# Scenario 05 视频脚本

## 视频标题建议

“改成 1 公里”：AI 真的修改了正在运行的 GIS 工作流

## 开场问题

如果用户只修改一个距离参数，系统会从头重跑、伪造一张新图，还是能识别依赖并只重算受影响部分？

## 用户输入

选择 Scenario 05，先展示：

> 找出距离主要道路 500 米以内的建筑。

初次运行成功后，再输入：

> 改成 1 公里。

## Agent Plan

初始 DAG 包含建筑检查、主要道路筛选、米制投影、Buffer 和候选筛选。修订时锁定 `buffer_major_roads`，计算其下游闭包，只失效 Buffer 与候选筛选两步。

## 关键地图变化

第一段画面显示 500 m buffer 与 4 个候选。提交修订后 buffer 扩展到 1000 m，候选变为 8；界面显示 `History 2 runs`、`2 rerun · 3 reused`。旧派生层保留为 inactive lineage，但地图只渲染当前 active Layers。

## 最终结果

口播：上游 `inspect_buildings`、`filter_major_roads`、`transform_major_roads` 的 Layer ID 保持不变；只有 Buffer 与最终筛选得到新 Layer，Map Verification 仍为 ready。

## 继续追问

对比 `result-500m.jpg` 与 `result-1km.jpg`，指出这不是重新问一次，而是带参数 before/after、executed/reused steps 和历史 lineage 的有状态修订。

## 结尾一句

人只改需求，GeoHarness 负责找出工作流里真正需要重算的部分。
