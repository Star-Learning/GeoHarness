# Scenario 02 视频脚本

## 视频标题建议

只说一句话，AI 自动找出河流附近的建筑

## 开场问题

“河流 500 米以内”看似简单，实际需要理解 CRS、做米制投影、生成缓冲区、空间筛选并统计。用户是否还需要逐个选择工具？

## 用户输入

选择 Scenario 02，展示输入：

> 找出距离 Hudson River 和 East River 500 米以内的建筑，并告诉我一共有多少栋。

## Agent Plan

快速扫过六步 DAG：检查建筑和河流、转换到 EPSG:32618、创建 500 m buffer、筛选建筑、汇总结果。提醒观众每个 step 都声明依赖与输出 Layer。

## 关键地图变化

运行前只显示两条河流与 12 个建筑。运行后地图出现 `rivers_metric`、`river_buffer` 和 `candidate_buildings`；点击筛选 step，5 个候选在地图和 Layer Registry 同步高亮。

## 最终结果

口播：独立 GeoPandas oracle 复算确认候选为 5，且每个候选到 Hudson River 或 East River 的距离都不超过 500 米；Map Verification 为 ready。

## 继续追问

关闭 `river_buffer` 再打开，比较中间空间范围；点击候选建筑检查其属性，说明每一步都能在地图上追溯。

## 结尾一句

用户描述目标，GeoHarness 自己完成投影、Buffer、筛选与验证。
