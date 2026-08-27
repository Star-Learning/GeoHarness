# River Building Query

## Scenario

- ID: `02-river-building-query`
- Region: Lower Manhattan, New York City
- Data profile: `official-nyc-open-data-lower-manhattan-2026-08-27`

## Real user need

从建筑与水系图层中找出河流邻近建筑，而无需用户知道投影、缓冲区或空间筛选。

## User prompt

> 找出距离 Hudson River 和 East River 500 米以内的建筑，并告诉我一共有多少栋。

## Why this Demo exists

这个 Scenario 将一个真实空间需求、独立官方数据副本、可执行 Task Graph、期望 Plan、期望 Result 和回归入口放在同一目录中。提交后的快照可离线复现，不依赖运行时联网。

## Input data

| File | Dataset | Original provider | License / terms | Download / generation date |
| --- | --- | --- | --- | --- |
| `data/buildings.geojson` | NYC Open Data BUILDING (`5zhs-2jue`) | NYC Office of Technology and Innovation | [NYC Open Data Terms](https://opendata.cityofnewyork.us/overview/#termsofuse) | 2026-08-27 |
| `data/rivers.geojson` | Community Districts land/water difference (`5crt-au7u`, `6ak9-vek3`) | NYC Department of City Planning | [NYC Open Data Terms](https://opendata.cityofnewyork.us/overview/#termsofuse) | 2026-08-27 |

### Data source and processing

这些文件全部来自仓库内 `data/official-sources/nyc/` 的 NYC Open Data 固定快照。建筑数据从固定 bbox 的 2,622 个官方要素中做空间均匀的 360 要素系统抽样；道路保留官方四车道以上 Centerline，并将真实 Broadway 段标记为本 Demo 的 `major` corridor；District 使用官方 101–103 边界；Hudson/East River 由官方含水域边界减去陆地区边界后分侧得到。处理脚本不重画建筑、道路或 District 几何，完整来源、查询、哈希和条款见 [官方源数据说明](../../../data/official-sources/nyc/README.md)。

## Expected Agent behavior

1. Inspect both layers
1. Transform to a metric CRS
1. Create a 500 m river buffer
1. Filter intersecting buildings
1. Count candidates
1. Show intermediate and final layers

## Key GIS workflow

`inspect_dataset` → `transform_crs` → `create_buffer` → `spatial_filter` → `analyze_distribution`

可执行 DAG 定义位于 `task-graph.json`，每个步骤显式声明 dependencies、Layer 输入引用和 outputs。

## Success criteria

生成 river_buffer 和 candidate_buildings，并得到 132 个真实候选建筑。

## Demo focus

只说一句话，AI 自己完成 Buffer + 空间筛选。

## Demo artifacts

![Scenario 02 verified Harness result](screenshots/result.jpg)

- [Initial Harness screenshot](screenshots/initial.jpg)
- [Animated Demo](media/demo.gif)
- [1–4 minute video script](media/video-script.md)
- [GIF keyframe storyboard](media/gif-storyboard.json)

真实结果画面选中 `filter_buildings`：500 m river buffer 可见，132 个 `candidate_buildings` 同步高亮。
GIF 使用 7 个语义关键视图和 18 个平滑过渡帧，依次突出用户输入、Agent Plan、关键图层、地图和最终结果；所有画面均裁自上述真实 Harness 截图。

## Run and verify independently

```sh
node --test tests/regression/02-river-building-query.regression.test.mjs
```

回归测试使用本目录两份官方数据，要求 candidate count 为 132，并独立复算全部候选到河流的距离不超过 500 m。
