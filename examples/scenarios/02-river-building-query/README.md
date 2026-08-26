# River Building Query

## Scenario

- ID: `02-river-building-query`
- Region: Manhattan, New York City
- Fixture profile: `deterministic-manhattan-scale-v1`

## Real user need

从建筑与水系图层中找出河流邻近建筑，而无需用户知道投影、缓冲区或空间筛选。

## User prompt

> 找出距离 Hudson River 和 East River 500 米以内的建筑，并告诉我一共有多少栋。

## Why this Demo exists

这个 Scenario 将一个真实空间需求、独立数据、期望 Plan、期望 Result 和回归入口放在同一目录中。复制本目录即可离线复现，不依赖其他 Scenario 的数据。

## Input data

| File | Dataset | Original provider | License / terms | Download / generation date |
| --- | --- | --- | --- | --- |
| `data/buildings.geojson` | GeoHarness deterministic Manhattan-scale fixture | GeoHarness project | CC0-1.0 | 2026-08-27 |
| `data/rivers.geojson` | GeoHarness deterministic Manhattan-scale fixture | GeoHarness project | CC0-1.0 | 2026-08-27 |

### Data source and processing

这些文件是 GeoHarness 为稳定回归测试创作的、小型 Manhattan-scale 合成矢量 fixture，并非 NYC 官方地籍或道路数据。坐标锚定在 Manhattan 附近，使用 OGC:CRS84；几何和属性由 `scripts/build_scenarios/build-fixtures.mjs` 确定性生成。处理包括固定 3.2 km 测试范围、最小字段集和 7 位小数坐标量化；未做几何简化。数据按 CC0-1.0 提供。

## Expected Agent behavior

1. Inspect both layers
1. Transform to a metric CRS
1. Create a 500 m river buffer
1. Filter intersecting buildings
1. Count candidates
1. Show intermediate and final layers

## Key GIS workflow

`inspect_dataset` → `transform_crs` → `create_buffer` → `spatial_filter` → `analyze_distribution`

## Success criteria

生成 river_buffer 和 candidate_buildings，并得到 5 个候选建筑。

## Demo focus

只说一句话，AI 自己完成 Buffer + 空间筛选。
