# Building Data Inspection

## Scenario

- ID: `01-building-data-inspection`
- Region: Manhattan, New York City
- Fixture profile: `deterministic-manhattan-scale-v1`

## Real user need

在不手工打开属性表或选择 GIS 工具的情况下理解一份建筑矢量数据。

## User prompt

> 帮我看看这个建筑数据有什么特点。

## Why this Demo exists

这个 Scenario 将一个真实空间需求、独立数据、可执行 Task Graph、期望 Plan、期望 Result 和回归入口放在同一目录中。复制本目录即可离线复现，不依赖其他 Scenario 的数据。

## Input data

| File | Dataset | Original provider | License / terms | Download / generation date |
| --- | --- | --- | --- | --- |
| `data/buildings.geojson` | GeoHarness deterministic Manhattan-scale fixture | GeoHarness project | CC0-1.0 | 2026-08-27 |

### Data source and processing

这些文件是 GeoHarness 为稳定回归测试创作的、小型 Manhattan-scale 合成矢量 fixture，并非 NYC 官方地籍或道路数据。坐标锚定在 Manhattan 附近，使用 OGC:CRS84；几何和属性由 `scripts/build_scenarios/build-fixtures.mjs` 确定性生成。处理包括固定 3.2 km 测试范围、最小字段集和 7 位小数坐标量化；未做几何简化。数据按 CC0-1.0 提供。

## Expected Agent behavior

1. Inspect dataset
1. Identify geometry and CRS
1. Summarize fields and missing values
1. Validate geometries
1. Calculate area and basic statistics
1. Present a map summary

## Key GIS workflow

`inspect_dataset` → `calculate_geometry` → `analyze_distribution`

可执行 DAG 定义位于 `task-graph.json`，每个步骤显式声明 dependencies、Layer 输入引用和 outputs。

## Success criteria

报告 12 个 Polygon 要素、OGC:CRS84、1 个缺失 height_m，且所有几何有效。

## Demo focus

AI 能不能自己看懂一份 GIS 数据？

## Demo artifacts

![Scenario 01 verified Harness result](screenshots/result.jpg)

- [Initial Harness screenshot](screenshots/initial.jpg)
- [Animated Demo](media/demo.gif)
- [1–4 minute video script](media/video-script.md)

素材来自本 Scenario 在 DeepSeek Harness Web `b150a55` 中的真实执行：结果画面选择 `calculate_building_geometry`，12 个输出要素同时在 Layer Registry 与地图高亮。动图由 `scripts/build-demo-media.py` 从上述真实截图生成，不含伪造结果帧。

## Run and verify independently

```sh
node --test tests/regression/01-building-data-inspection.regression.test.mjs
```

该测试只读取本目录的数据、Task Graph 与 expected result，并用独立 GeoPandas oracle 验证 12 个要素、几何有效性、缺失值与面积统计。
