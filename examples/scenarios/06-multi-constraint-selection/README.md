# Multi-Constraint Selection

## Scenario

- ID: `06-multi-constraint-selection`
- Region: Manhattan, New York City
- Fixture profile: `deterministic-manhattan-scale-v1`

## Real user need

把道路邻近与河流避让两个空间约束组合成可解释的布尔筛选工作流。

## User prompt

> 找出距离主要道路 300 米以内，同时距离 Hudson River 和 East River 至少 800 米的建筑。

## Why this Demo exists

这个 Scenario 将一个真实空间需求、独立数据、可执行 Task Graph、期望 Plan、期望 Result 和回归入口放在同一目录中。复制本目录即可离线复现，不依赖其他 Scenario 的数据。

## Input data

| File | Dataset | Original provider | License / terms | Download / generation date |
| --- | --- | --- | --- | --- |
| `data/buildings.geojson` | GeoHarness deterministic Manhattan-scale fixture | GeoHarness project | CC0-1.0 | 2026-08-27 |
| `data/roads.geojson` | GeoHarness deterministic Manhattan-scale fixture | GeoHarness project | CC0-1.0 | 2026-08-27 |
| `data/rivers.geojson` | GeoHarness deterministic Manhattan-scale fixture | GeoHarness project | CC0-1.0 | 2026-08-27 |

### Data source and processing

这些文件是 GeoHarness 为稳定回归测试创作的、小型 Manhattan-scale 合成矢量 fixture，并非 NYC 官方地籍或道路数据。坐标锚定在 Manhattan 附近，使用 OGC:CRS84；几何和属性由 `scripts/build_scenarios/build-fixtures.mjs` 确定性生成。处理包括固定 3.2 km 测试范围、最小字段集和 7 位小数坐标量化；未做几何简化。数据按 CC0-1.0 提供。

## Expected Agent behavior

1. Parse both spatial constraints
1. Identify major roads
1. Transform to a metric CRS
1. Build 300 m road and 800 m river buffers
1. Select inside-road candidates
1. Exclude river-buffer candidates
1. Explain and map the final result

## Key GIS workflow

`inspect_dataset` → `spatial_filter` → `transform_crs` → `create_buffer` → `spatial_filter` → `analyze_distribution`

可执行 DAG 定义位于 `task-graph.json`，每个步骤显式声明 dependencies、Layer 输入引用和 outputs。

## Success criteria

得到 2 个同时满足 road distance <= 300 m 且 river distance >= 800 m 的建筑。

## Demo focus

从单个 Tool Calling 升级到真正的 Agent Planning。

## Demo artifacts

![Scenario 06 verified Harness result](screenshots/result.jpg)

- [Initial Harness screenshot](screenshots/initial.jpg)
- [Animated Demo](media/demo.gif)
- [1–4 minute video script](media/video-script.md)

真实结果画面选择 `exclude_river_buffer`，道路邻近和河流排除两类 Buffer 同时可见，最终 2 个 `candidate_buildings` 与 Task step 同步高亮。

## Run and verify independently

```sh
node --test tests/regression/06-multi-constraint-selection.regression.test.mjs
```

独立回归验证结果为 2，并分别复算 road distance ≤ 300 m、river distance ≥ 800 m，避免只对 Tool 文本做字符串断言。
