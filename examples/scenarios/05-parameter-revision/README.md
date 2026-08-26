# Parameter Revision

## Scenario

- ID: `05-parameter-revision`
- Region: Manhattan, New York City
- Fixture profile: `deterministic-manhattan-scale-v1`

## Real user need

证明自然语言修改可以更新已有 GIS 工作流参数并只重算下游步骤。

## User prompt

> 找出距离主要道路 500 米以内的建筑。

Revision: > 改成 1 公里。

## Why this Demo exists

这个 Scenario 将一个真实空间需求、独立数据、可执行 Task Graph、期望 Plan、期望 Result 和回归入口放在同一目录中。复制本目录即可离线复现，不依赖其他 Scenario 的数据。

## Input data

| File | Dataset | Original provider | License / terms | Download / generation date |
| --- | --- | --- | --- | --- |
| `data/buildings.geojson` | GeoHarness deterministic Manhattan-scale fixture | GeoHarness project | CC0-1.0 | 2026-08-27 |
| `data/roads.geojson` | GeoHarness deterministic Manhattan-scale fixture | GeoHarness project | CC0-1.0 | 2026-08-27 |

### Data source and processing

这些文件是 GeoHarness 为稳定回归测试创作的、小型 Manhattan-scale 合成矢量 fixture，并非 NYC 官方地籍或道路数据。坐标锚定在 Manhattan 附近，使用 OGC:CRS84；几何和属性由 `scripts/build_scenarios/build-fixtures.mjs` 确定性生成。处理包括固定 3.2 km 测试范围、最小字段集和 7 位小数坐标量化；未做几何简化。数据按 CC0-1.0 提供。

## Expected Agent behavior

1. Build and retain the initial Task Graph
1. Run a 500 m major-road query
1. Recognize a distance-only revision
1. Invalidate downstream steps
1. Rerun buffer and spatial filter at 1000 m
1. Preserve run history and lineage

## Key GIS workflow

`inspect_dataset` → `spatial_filter` → `transform_crs` → `create_buffer` → `spatial_filter`

可执行 DAG 定义位于 `task-graph.json`，每个步骤显式声明 dependencies、Layer 输入引用和 outputs。

## Success criteria

初始结果为 4 个建筑；修改后为 8 个；仅 buffer 及其下游步骤重跑。

## Demo focus

不是重新问一次，而是真正修改正在执行的 GIS 工作流。
