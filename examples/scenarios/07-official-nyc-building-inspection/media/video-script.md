# Scenario 07 视频脚本

## 视频标题建议

AI GIS 工作流能不能处理真实的纽约市官方建筑数据？

## 开场问题

合成数据适合稳定回归，但真实公开数据会带来 MultiPolygon、日期字段、缺失年份和更复杂的轮廓。GeoHarness 能否在同一 Harness 工作区中处理这些真实情况？

## 用户输入

在 Harness 的 `GeoHarness` 标签选择 `07 · Official NYC Building Data`，展示 133 个来自 NYC Open Data 的 Lower Manhattan 建筑轮廓和审计 Prompt。

## Agent Plan

镜头依次停留在官方数据检查、UTM 18N 面积计算、屋顶高度与建成年份统计三个 Task step。运行状态必须由 ToolResult、Layer Registry 与 Map Verification 共同确认。

## 关键地图变化

初始地图显示 `NYC OPEN DATA` 与 133 个官方 MultiPolygon。运行后出现同样包含 133 个要素的 `buildings_with_geometry` 派生 Layer；点击面积计算 step，只高亮该 Layer。

## 最终结果

口播：133 个建筑几何全部有效，屋顶高度无缺失，建成年份缺失 2 条，已知年份范围为 1830–2021，投影后总建筑面积约为 116,199 平方米。

## 继续追问

点击任一建筑可检查官方 OBJECTID、BIN、建成年份、屋顶高度、几何来源与编辑日期。重复运行仍保持 3/3 success 和 Map ready。

## 结尾一句

这次地图上的轮廓来自可追溯的 NYC Open Data，不是为答案预先画出的测试图形。
