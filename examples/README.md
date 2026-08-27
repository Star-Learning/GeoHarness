# GeoHarness Examples

`examples/` 保留 v1.0 已经实现、测试并制作 Demo 的 7 个正式 Scenario：

| Scenario | 真实执行 GIF |
| --- | --- |
| [01 Building Data Inspection](scenarios/01-building-data-inspection/) | [Demo](scenarios/01-building-data-inspection/media/demo.gif) |
| [02 River Building Query](scenarios/02-river-building-query/) | [Demo](scenarios/02-river-building-query/media/demo.gif) |
| [03 Statistics by District](scenarios/03-building-statistics-by-district/) | [Demo](scenarios/03-building-statistics-by-district/media/demo.gif) |
| [04 Road Accessibility](scenarios/04-road-accessibility/) | [Demo](scenarios/04-road-accessibility/media/demo.gif) |
| [05 Parameter Revision](scenarios/05-parameter-revision/) | [Demo](scenarios/05-parameter-revision/media/demo.gif) |
| [06 Multi-Constraint Selection](scenarios/06-multi-constraint-selection/) | [Demo](scenarios/06-multi-constraint-selection/media/demo.gif) |
| [07 Official NYC Building Inspection](scenarios/07-official-nyc-building-inspection/) | [Demo](scenarios/07-official-nyc-building-inspection/media/demo.gif) |

共享真实数据目录为
[`datasets/nyc-core-official/dataset.json`](datasets/nyc-core-official/dataset.json)。原始快照、哈希、
下载方式和派生统计由 [`../data/official-sources/nyc/README.md`](../data/official-sources/nyc/README.md)
统一审计，媒体目录不复制或修改数据。

每个 GIF 由本 Scenario 的真实 Harness 截图构建，并按 `media/gif-storyboard.json` 依次突出用户
输入、Agent Plan、关键图层、地图结果和最终回答。它是对真实执行结果的多关键视图讲解，不把
裁切视图伪装成额外的实时 Tool 状态。
