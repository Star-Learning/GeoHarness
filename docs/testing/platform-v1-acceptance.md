# GeoHarness Platform v1.0 验收

> **版本**：`v1.0.0`  
> **数据规则**：所有空间数字来自 canonical Layer、Tool Result 或独立 GeoPandas/Shapely oracle，不以 Agent 文本作为正确性依据。

## 用户上传数据 E2E

`backend/geo-service/tests/test_platform_acceptance.py` 包含三个独立 Session Workspace。每条链路都把真实 NYC GeoJSON 编码成浏览器上传 RPC 的同等 payload，通过 `import_upload` 注册 canonical Layer；测试没有调用 `load_scenario` 或 `load_dataset`。

| 需求 | 真实链路 | 独立验证 |
| --- | --- | --- |
| 上传建筑并检查质量 | upload → details → inspect → map projection | NYC 官方 133 栋建筑的字段、CRS、几何质量、bbox、预览与投影总数 |
| 查询主要道路任意 275 米内建筑 | upload buildings/roads → filter → EPSG:32618 → buffer 275 m → intersects | 独立 GeoPandas/Shapely 得到同一 241 个建筑 ID |
| 按区域统计并导出 | upload buildings/districts → geometry → aggregate → CSV export | 独立 spatial join/groupby 核对 360 栋、3 个区域、面积和导出表 |

三个测试分别使用自己的数据入口、Workspace、Tool 调用和 oracle，证明平台能力不依赖预设 Scenario router。七个 `examples/scenarios/*` 仍作为另一组确定性回归和 Demo 门禁，不参与上述规划。

运行：

```sh
python -m pytest backend/geo-service/tests/test_platform_acceptance.py -q
```

## 插件生命周期验收

`scripts/verify-plugin-lifecycle.mjs` 每次创建全新的临时 `DSH_HOME`，并执行：

```text
安装本仓库 Bundle
→ dump-config 确认 geoharness-plugin
→ 127.0.0.1 随机端口启动 Web
→ HTTP 200 与 HTML shell 探测
→ 停止 Web
→ 卸载插件
→ dump-config 确认已移除
```

本地若有相邻的 DeepSeek Harness 官方源码构建，脚本使用其 `apps/cli/lib/bin.js`；干净 CI 使用固定版本 `@deepseek-ai/dsh@0.1.1-rc.2`。Linux 和 Windows 的 GitHub Actions 都执行同一流程。

```sh
pnpm run verify:plugin-lifecycle
```

## 完整发布门禁

```sh
pnpm test
pnpm run typecheck
pnpm peers check
pnpm run check:media
pnpm run check:catalogs
pnpm run check:docs
git diff --check
```

不支持的栅格、路网等能力由 System Prompt 明确声明为 capability gap，不注册虚假 Tool，也不创建伪 Layer。版本范围与平台差异见[兼容矩阵](../releases/compatibility-matrix.md)。
