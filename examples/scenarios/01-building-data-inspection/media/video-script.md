# Scenario 01 视频脚本

## 视频标题建议

AI 能不能自己看懂一份 GIS 建筑数据？

## 开场问题

拿到一份陌生的建筑 GeoJSON，通常要先看坐标系、几何类型、字段、缺失值和几何质量。GeoHarness 能不能从一句模糊需求开始，自己完成这些检查？

## 用户输入

屏幕打开 Harness 的 `GeoHarness` 会话标签，选择 Scenario 01，展示输入：

> 帮我看看这个建筑数据有什么特点。

## Agent Plan

镜头依次停留在 `Inspect building dataset`、`Calculate building geometry`、`Summarize fields and geometry`。强调 Agent 使用正式 Geo Tools，并让中间 Layer 进入 Registry。

## 关键地图变化

点击运行前，地图只有 12 个输入建筑；运行后出现 `buildings_with_geometry`，点击第二个 Task step，让该 Layer 的 12 个真实要素与地图同步高亮。

## 最终结果

口播：结果确认共有 12 个 Polygon、坐标系为 OGC:CRS84、几何全部有效，`height_m` 有 1 个缺失值，建筑面积均由投影后的真实几何计算。

## 继续追问

点击任一建筑打开 Feature Inspector，展示 `building_id`、用途和高度；切换 Layer 显隐说明结果不是一段文本，而是可验证地图状态。

## 结尾一句

GeoHarness 先理解数据，再决定该用哪些 GIS 步骤。
