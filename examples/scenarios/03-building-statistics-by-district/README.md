# Building Statistics by District

## Scenario

- ID: `03-building-statistics-by-district`
- Region: Manhattan, New York City
- Fixture profile: `deterministic-manhattan-scale-v1`

## Real user need

按行政区汇总建筑数量与面积，并把表格统计与专题图关联。

## User prompt

> 按 Community District 统计建筑数量和建筑总面积。

## Why this Demo exists

这个 Scenario 将一个真实空间需求、独立数据、可执行 Task Graph、期望 Plan、期望 Result 和回归入口放在同一目录中。复制本目录即可离线复现，不依赖其他 Scenario 的数据。

## Input data

| File | Dataset | Original provider | License / terms | Download / generation date |
| --- | --- | --- | --- | --- |
| `data/buildings.geojson` | GeoHarness deterministic Manhattan-scale fixture | GeoHarness project | CC0-1.0 | 2026-08-27 |
| `data/districts.geojson` | GeoHarness deterministic Manhattan-scale fixture | GeoHarness project | CC0-1.0 | 2026-08-27 |

### Data source and processing

这些文件是 GeoHarness 为稳定回归测试创作的、小型 Manhattan-scale 合成矢量 fixture，并非 NYC 官方地籍或道路数据。坐标锚定在 Manhattan 附近，使用 OGC:CRS84；几何和属性由 `scripts/build_scenarios/build-fixtures.mjs` 确定性生成。处理包括固定 3.2 km 测试范围、最小字段集和 7 位小数坐标量化；未做几何简化。数据按 CC0-1.0 提供。

## Expected Agent behavior

1. Inspect buildings and districts
1. Calculate building area
1. Spatially join district attributes
1. Aggregate count and area
1. Render a thematic result

## Key GIS workflow

`inspect_dataset` → `calculate_geometry` → `spatial_join` → `aggregate_by_region`

可执行 DAG 定义位于 `task-graph.json`，每个步骤显式声明 dependencies、Layer 输入引用和 outputs。

## Success criteria

两个 Demo Community District 各统计到 6 个建筑，总计 12 个，面积总和为正。

## Demo focus

一句话让 AI 自动做分区统计。

## Demo artifacts

![Scenario 03 verified Harness result](screenshots/result.jpg)

- [Initial Harness screenshot](screenshots/initial.jpg)
- [Animated Demo](media/demo.gif)
- [1–4 minute video script](media/video-script.md)

真实结果画面选择 `aggregate_districts`，两个 `district_statistics` 面与该 Task step 同步高亮；输入、Join 中间层与聚合层均保留在 Layer Registry。

## Run and verify independently

```sh
node --test tests/regression/03-building-statistics-by-district.regression.test.mjs
```

回归测试只使用本目录建筑与 District 数据，独立确认两个分区各 6 个建筑、总计 12 个，并检查分区面积汇总为正。
