# GeoHarness v1.0 Geo Tool Contract

> **文档状态**：当前 Geo Backend、Layer Registry 与 Tool 的实现契约。

内置 Tool 的 name、semver、capability、input、output、timeout 和 map effect 以版本化
[`builtin-tools.json`](../../bundle/geoharness-bundle/catalog/builtin-tools.json) 为权威来源；
[`catalog-reference.md`](catalog-reference.md) 由它自动生成。本文说明公共运行结果与空间语义，
第三方接入和冲突规则见 [`extension-contract.md`](extension-contract.md)。

## Runtime boundary

Geo computation lives in `backend/geo-service`; the Harness client never performs authoritative
GIS analysis. A `LayerRegistry` owns one caller-provided workspace, writes vector snapshots as
GeoPackage, and persists lineage metadata in `registry.json`.

The tested Phase 4 runtime is Python 3.11 with FastAPI 0.135.3, GeoPandas 1.1.4, Shapely 2.1.2,
PyProj 3.7.2 and Pyogrio. `backend/geo-service/pyproject.toml` records supported version ranges.

## Canonical result

Every tool returns this bounded structure:

```json
{
  "success": true,
  "tool": "create_buffer",
  "step_id": "step_3",
  "inputs": ["layer_0002"],
  "parameters": {
    "distance": 500,
    "unit": "meter",
    "distance_m": 500,
    "metric_crs": "EPSG:32618",
    "dissolve": true
  },
  "outputs": ["layer_0004"],
  "summary": "Created a 500 meter buffer.",
  "warnings": [],
  "data": {}
}
```

Failures use the same schema with `success: false`, no output layers, a bounded error summary and
one or more warnings. A failed operation never registers a partial output layer.

## Layer metadata

Each registered layer records:

- stable workspace-local Layer ID;
- name, vector type, geometry summary, CRS, feature count and bbox;
- source (`scenario`, `upload` or `derived`);
- generating Task step, parent Layer IDs and parameters;
- workspace-relative GeoPackage path and UTC creation time.

API responses can expose GeoJSON through `GET /layers/{layer_id}/geojson`; projected layers are
converted to EPSG:4326 for browser rendering while their canonical GeoPackage retains its CRS.

## Tools

下表是空间语义摘要；Harness `defineTool` 注册不再读取此 Markdown，而是直接读取 catalog。

| Tool | Main input | Structured effect |
| --- | --- | --- |
| `inspect_dataset` | one layer | Geometry, CRS, fields, missing values, validity, bounds and polygon area summary |
| `list_layers` | none | Current canonical Layer Registry metadata |
| `transform_crs` | layer + target CRS | Derived layer in the requested CRS |
| `create_buffer` | layer + positive distance | Metric buffer in EPSG:32618 by default; meter and kilometer inputs |
| `spatial_filter` | input, optional mask and/or attribute equality map | Derived subset using `intersects`, `within`, `contains`, `disjoint` or `touches` |
| `spatial_join` | left and right layers | GeoPandas spatial join with explicit predicate and join mode |
| `clip_layer` | input and clip layers | Geometry clipped to the mask |
| `aggregate_by_region` | features, regions and group field | Region layer with feature count and area sum plus structured rows |
| `calculate_geometry` | one layer | Derived layer with metric area and length fields |
| `nearest_features` | input and target layers | Nearest target attributes and metric distance per input feature |
| `analyze_distribution` | layer and optional fields | Numeric summaries or bounded categorical top values |
| `export_layer` | layer and format | Workspace-local GeoJSON, GeoPackage or CSV export |

## HTTP surface

The local FastAPI service binds to `127.0.0.1` by default and exposes:

- `GET /health`;
- `GET /layers`;
- `GET /layers/{layer_id}`;
- `GET /layers/{layer_id}/geojson`;
- `POST /layers/import`;
- `POST /tools/{tool_name}`.

File imports are accepted only below roots explicitly passed to `create_app` or repeated
`--scenario-root` CLI arguments. Browser CORS is restricted to localhost origins. Phase 5 adds a
Harness Service/Provider/Tool consumer around this canonical backend rather than exposing model
calls directly to arbitrary HTTP or filesystem paths.

## CRS and distance rules

- Input Scenario GeoJSON is OGC:CRS84 / EPSG:4326.
- Metric operations default to UTM zone 18N (`EPSG:32618`), appropriate for the frozen Lower Manhattan snapshots.
- Buffers reject zero/negative distances and unknown units.
- Spatial operands are transformed to a common CRS before predicates.
- GeoJSON export uses EPSG:4326; GeoPackage preserves the canonical layer CRS.
