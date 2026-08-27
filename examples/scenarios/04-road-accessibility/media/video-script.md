# Road Accessibility 视频脚本

## 视频标题建议

AI 能否自己组合多个 GIS 工具？

## 开场问题

如果输入换成带真实字段、复杂 MultiPolygon/MultiLineString 和官方行政区边界的 NYC Open Data，GeoHarness 是否仍能把一句空间需求变成可验证 GIS 工作流？

## 用户输入

在 DeepSeek Harness 的 `GeoHarness` 标签选择 `04-road-accessibility`，输入：

> 找出距离主要道路 Broadway 300 米以内的建筑，并按 Community District 统计数量。

## Agent Plan

展示本 Scenario 的真实 Task Graph：`inspect_dataset` → `spatial_filter` → `transform_crs` → `create_buffer` → `spatial_join` → `aggregate_by_region`。每一步只引用 Layer Registry 返回的 Layer ID。

## 关键地图变化

运行前展示本目录的 NYC Open Data 输入 Layer；运行后选择产生最终空间结果的 Task step，使派生 Layer、Registry 行与实际地图要素同步高亮。

## 最终结果

筛选到 249 个 Broadway 300 m 可达建筑，并按三个真实 Community District 汇总。

## 继续追问

打开任一要素的 Feature Inspector，核对官方 OBJECTID/BIN、Centerline、District 或派生统计字段；切换图层显隐和透明度，确认地图不是静态结果图。

## 结尾一句

GeoHarness 的演示输入、GIS 计算与地图验证现在都建立在可追溯的 NYC Open Data 快照上。
