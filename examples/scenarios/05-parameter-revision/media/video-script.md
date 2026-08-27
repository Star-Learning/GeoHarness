# Parameter Revision 视频脚本

## 视频标题建议

不是重新问一次，而是真正修改正在执行的 GIS 工作流。

## 开场问题

如果输入换成带真实字段、复杂 MultiPolygon/MultiLineString 和官方行政区边界的 NYC Open Data，GeoHarness 是否仍能把一句空间需求变成可验证 GIS 工作流？

## 用户输入

在 DeepSeek Harness 的 `GeoHarness` 标签选择 `05-parameter-revision`，输入：

> 找出距离主要道路 Broadway 500 米以内的建筑。

随后修订：

> 改成 1 公里。

## Agent Plan

展示本 Scenario 的真实 Task Graph：`inspect_dataset` → `spatial_filter` → `transform_crs` → `create_buffer` → `spatial_filter`。每一步只引用 Layer Registry 返回的 Layer ID。

## 关键地图变化

运行前展示本目录的 NYC Open Data 输入 Layer；运行后选择产生最终空间结果的 Task step，使派生 Layer、Registry 行与实际地图要素同步高亮。

## 最终结果

初始结果为 329 个真实建筑；修改后为 360 个；仅 buffer 及其下游步骤重跑。

## 继续追问

打开任一要素的 Feature Inspector，核对官方 OBJECTID/BIN、Centerline、District 或派生统计字段；切换图层显隐和透明度，确认地图不是静态结果图。

## 结尾一句

GeoHarness 的演示输入、GIS 计算与地图验证现在都建立在可追溯的 NYC Open Data 快照上。
