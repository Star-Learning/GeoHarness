# 下曼哈顿消防服务覆盖盲区综合分析

本 Topic 使用真实 NYC 官方矢量数据，展示 GeoHarness Agent 自主完成数据检查、米制缓冲、空间反选、最近设施、几何计算、空间连接、分区聚合、分布统计和数据导出的完整链路。

## 数据

| 图层 | 官方来源 | 快照 | 数量 |
| --- | --- | --- | ---: |
| 建筑轮廓 | NYC Open Data BUILDING (`5zhs-2jue`) | 2026-08-27 | 360 |
| 消防站 | FDNY Firehouse Listing (`hc8x-tcnd`) | 2026-08-31 | 48 |
| Community District | NYC Open Data (`5crt-au7u`) | 2026-08-27 | 3 |

消防站原始记录由 [`scripts/download-firehouse-topic.mjs`](../../../scripts/download-firehouse-topic.mjs) 生成；[`data/source.json`](data/source.json) 保存官方 URL、查询、数量和 SHA256。建筑与分区继续引用仓库中已审计的独立真实数据副本，不复制第二份相同数据。

## 独立空间基线

[`oracle.py`](oracle.py) 不调用 GeoHarness Tool 或 Agent 文本，直接以 GeoPandas/Shapely 在 EPSG:32618 中计算：

- 48 个曼哈顿消防站的 500 米覆盖范围之外有 26 栋建筑；
- 未覆盖建筑总面积为 10503.30 m²；
- 最近消防站距离为 505.50–674.61 米；
- Community District 101 有 2 栋，103 有 24 栋；
- 全部未覆盖建筑真实距离均大于 500 米，且全部可关联到分区。

这只是欧氏直线距离覆盖初筛，不是道路网络服务区、交通时间或真实消防响应时间分析。

## 资产

- [`prompt.md`](prompt.md)：不包含预设答案的 Agent 输入；
- [`oracle.py`](oracle.py)：独立空间 oracle；
- `media/agent-flow-1080p60.mp4`：本地 1920×1080、60 fps、7:57.5 的真实录屏，不进入 Git；
- [`media/recording.json`](media/recording.json)：录屏参数、Prompt/MP4 哈希、保留区间和真实结果；
- [`media/final.png`](media/final.png)：真实 Agent 完成 GeoJSON/CSV 导出后的最终画面。

录屏从 54:49.15 的原始 60 fps 素材中保留两个纯 GeoHarness 区间，并将 Provider 等待统一
加速 4 倍；误切到其他应用的桌面区间被完整删除。成片抽查开头、中段、结尾和每 30 秒联系表，
均只包含 GeoHarness，且保留 Agent 的真实工具错误、自我修正、15 个 Layer 和两项成功导出。
