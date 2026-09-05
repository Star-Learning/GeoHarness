# GeoHarness Catalog Reference

> 此文件由 `scripts/generate-catalog-reference.mjs` 从版本化 Dataset / Tool catalog 生成，请勿手工维护清单。

- Tool catalog：`geoharness.builtin` / schema `1.0` / 14 tools
- Dataset catalogs：2

## Built-in Tools

| Tool | Version | Capability | Map effect | Creates Layer | Timeout |
| --- | --- | --- | --- | --- | --- |
| `discover_datasets` | `1.0.0` | `dataset.discovery` | `none` | no | 120000 ms |
| `inspect_dataset` | `1.0.0` | `vector.inspect` | `none` | no | 120000 ms |
| `list_layers` | `1.0.0` | `layer.discovery` | `none` | no | 120000 ms |
| `transform_crs` | `1.0.0` | `vector.crs-transform` | `add-layer` | yes | 120000 ms |
| `create_buffer` | `1.0.0` | `vector.buffer` | `add-layer` | yes | 120000 ms |
| `spatial_filter` | `1.0.0` | `vector.spatial-filter` | `add-layer` | yes | 120000 ms |
| `spatial_join` | `1.0.0` | `vector.spatial-join` | `add-layer` | yes | 120000 ms |
| `clip_layer` | `1.0.0` | `vector.clip` | `add-layer` | yes | 120000 ms |
| `aggregate_by_region` | `1.0.0` | `vector.aggregate-region` | `add-layer` | yes | 120000 ms |
| `calculate_geometry` | `1.0.0` | `vector.geometry-calculate` | `add-layer` | yes | 120000 ms |
| `nearest_features` | `1.0.0` | `vector.nearest` | `add-layer` | yes | 120000 ms |
| `analyze_distribution` | `1.0.0` | `vector.distribution` | `none` | no | 120000 ms |
| `inspect_satellite_view` | `0.3.0` | `imagery.visual-inspection` | `add-overlay` | no | 120000 ms |
| `export_layer` | `1.0.0` | `vector.export` | `export` | no | 120000 ms |

## Dataset Catalogs

| Dataset | Region / CRS | Snapshot | Layers | License |
| --- | --- | --- | --- | --- |
| `nyc-core-official` | Manhattan, New York City / `OGC:CRS84` | 2026-08-27 | `buildings`, `roads`, `rivers`, `districts`, `lower_manhattan_buildings` | NYC Open Data Terms of Use |
| `nyc-fire-coverage-official` | Lower Manhattan, New York City / `OGC:CRS84` | 2026-08-31 | `coverage_buildings`, `firehouses`, `coverage_districts` | NYC Open Data Terms of Use |

## Extension Gate

第三方 Tool catalog 必须使用 `ToolResult@1.0`，声明 semver、capability、timeout 和 map effect。
同名不同版本会在 Host 激活时拒绝；声明但没有 executor 的能力不会注册给模型，并进入
`unavailable` 诊断与 System Prompt，Agent 必须明确报告未安装能力。
