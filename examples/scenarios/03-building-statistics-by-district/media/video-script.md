# Scenario 03 视频脚本

## 视频标题建议

一句话，让 AI 完成分区建筑统计

## 开场问题

按行政区统计建筑数量和面积，既有几何计算，也有空间关联与分组汇总。能否让结果表和地图保持同一个真相源？

## 用户输入

选择 Scenario 03，展示输入：

> 按 Community District 统计建筑数量和建筑总面积。

## Agent Plan

镜头展示检查两类输入、计算建筑面积、Spatial Join、Aggregate by Region 五个步骤。指出汇总 step 直接依赖真实建筑与 District Layers。

## 关键地图变化

运行后出现 `buildings_with_geometry`、`buildings_with_district` 与 `district_statistics`。选中聚合 step，两个 District 结果面在地图高亮，同时 Layer Registry 保留派生 lineage。

## 最终结果

口播：两个 Demo District 分别统计到 6 个建筑，总数为 12；两个分区的建筑面积总和均为正，空间 oracle 与 Task Graph 输出一致。

## 继续追问

切换 District 统计层的透明度，点击分区要素查看 `district_id` 和汇总字段，演示表格语义如何回到地图对象。

## 结尾一句

GeoHarness 把空间关联、分区汇总和专题地图连成一条可验证链路。
