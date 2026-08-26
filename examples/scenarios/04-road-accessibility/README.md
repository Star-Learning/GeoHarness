# Road Accessibility

## Scenario

- ID: `04-road-accessibility`
- Region: Manhattan, New York City
- Fixture profile: `deterministic-manhattan-scale-v1`

## Real user need

组合属性过滤、距离分析和分区统计来理解主要道路可达建筑。

## User prompt

> 找出距离主要道路 300 米以内的建筑，并按 Community District 统计数量。

## Why this Demo exists

这个 Scenario 将一个真实空间需求、独立数据、可执行 Task Graph、期望 Plan、期望 Result 和回归入口放在同一目录中。复制本目录即可离线复现，不依赖其他 Scenario 的数据。

## Input data

| File | Dataset | Original provider | License / terms | Download / generation date |
| --- | --- | --- | --- | --- |
| `data/buildings.geojson` | GeoHarness deterministic Manhattan-scale fixture | GeoHarness project | CC0-1.0 | 2026-08-27 |
| `data/roads.geojson` | GeoHarness deterministic Manhattan-scale fixture | GeoHarness project | CC0-1.0 | 2026-08-27 |
| `data/districts.geojson` | GeoHarness deterministic Manhattan-scale fixture | GeoHarness project | CC0-1.0 | 2026-08-27 |

### Data source and processing

这些文件是 GeoHarness 为稳定回归测试创作的、小型 Manhattan-scale 合成矢量 fixture，并非 NYC 官方地籍或道路数据。坐标锚定在 Manhattan 附近，使用 OGC:CRS84；几何和属性由 `scripts/build_scenarios/build-fixtures.mjs` 确定性生成。处理包括固定 3.2 km 测试范围、最小字段集和 7 位小数坐标量化；未做几何简化。数据按 CC0-1.0 提供。

## Expected Agent behavior

1. Identify roads where road_class is major
1. Transform to a metric CRS
1. Create a 300 m road buffer
1. Filter buildings
1. Join districts
1. Aggregate candidate counts

## Key GIS workflow

`inspect_dataset` → `spatial_filter` → `transform_crs` → `create_buffer` → `spatial_join` → `aggregate_by_region`

可执行 DAG 定义位于 `task-graph.json`，每个步骤显式声明 dependencies、Layer 输入引用和 outputs。

## Success criteria

筛选到 3 个建筑，全部位于 MN-DEMO-01，并生成可视化中间图层。

## Demo focus

AI 能否自己组合多个 GIS 工具？
