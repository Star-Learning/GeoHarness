# GeoHarness v1.0 兼容矩阵

本矩阵记录 `v1.0.0` 实际构建和验收边界。超出范围不代表必然不可用，但必须重新执行 Harness 集成核对和完整门禁后才能声明支持。

## 运行环境

| 组件 | v1.0 支持范围 | 验证方式 |
| --- | --- | --- |
| DeepSeek Harness CLI / packages | `0.1.1-rc.2` | 全新 profile 安装、组合、Web 启动、卸载 |
| `@deepseek-ai/cordis` | `4.0.1` | 精确 peer dependency 与 Tool/Service 激活测试 |
| Node.js | `22.19.0`、`24.x` | Windows/Linux CI 的 build、typecheck、Node/Python tests |
| pnpm | `11.22.0` | frozen lockfile 安装与 workspace build |
| Python | `3.11` | GeoPandas runtime、真实格式、空间 oracle |
| 操作系统 | Windows（主验收）、Ubuntu Linux（CI） | 完整 CI；两平台插件 lifecycle smoke |
| Web 入口 | Chromium 系现代浏览器、loopback HTTP | Harness Web shell 与 Connection RPC |

Python 空间运行时的受测版本范围以 `backend/geo-service/pyproject.toml` 为准；发布验收使用 GeoPandas `1.1.4`、Shapely `2.1.2`、PyProj `3.7.2` 与 Pyogrio。

## 数据与能力

| 类别 | v1.0 状态 |
| --- | --- |
| GeoJSON | 支持用户上传、检查、分析、地图和导出 |
| Shapefile ZIP | 支持安全解压与单一明确图层导入 |
| GeoPackage | 支持单图层或显式选择多图层文件中的图层 |
| CSV lon/lat | 支持显式经纬度字段与 CRS |
| 矢量检查、CRS、buffer、filter、join、clip、aggregation、geometry、nearest、distribution、export | 支持，来自 13 个 Harness Tools（含发现与列举） |
| GeoJSON / GeoPackage / CSV 结果 | 支持受限导出与校验下载 |
| 栅格、GeoTIFF、遥感处理 | v1.0 不支持；Agent 必须明确报告缺失能力 |
| 路网等时圈、导航 | v1.0 不支持；Agent 必须明确报告缺失能力 |
| 3D、点云、云端多租户 | v1.0 不支持 |

## 升级门禁

以下任一项变化都必须重新阅读当前 DeepSeek Harness 源码并运行[真实集成检查](../architecture/harness-integration.md)：

- Harness 或 Cordis 版本；
- `dsh.bundle` / `dsh.client` manifest；
- `conversation.session`、composer、settings 或项目/会话 Slot；
- Connection、Session event、Service 或 `defineTool` 契约；
- Web profile 启动和客户端 bundle 协议。

GeoHarness 不复制或长期修改 DeepSeek Harness 源码；兼容升级应在本仓库 Bundle 中完成。
