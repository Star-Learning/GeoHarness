# GeoHarness Geo Service

The Geo Service is the local, disk-backed vector computation layer for GeoHarness. It keeps
canonical layer metadata and GeoPackage snapshots under a caller-provided workspace and exposes
12 structured tools:

`inspect_dataset`, `list_layers`, `transform_crs`, `create_buffer`, `spatial_filter`,
`spatial_join`, `clip_layer`, `aggregate_by_region`, `calculate_geometry`, `nearest_features`,
`analyze_distribution`, and `export_layer`.

Every operation returns a `ToolResult` with `success`, `tool`, `step_id`, `inputs`, `parameters`,
`outputs`, `summary`, `warnings`, and bounded structured `data`. Derived layers record parent IDs,
the generating step and parameters in `registry.json`; vector contents are stored as GeoPackage.

Run locally from this directory:

```powershell
python -m geoharness_geo --workspace ../../.tmp/geo-workspace `
  --scenario-root ../../examples/scenarios --port 8765
```

The HTTP surface binds to `127.0.0.1` by default, restricts imports to explicitly configured
Scenario roots, and exposes `/health`, `/layers`, `/layers/{id}/geojson`, `/layers/import`, and
`/tools/{tool_name}`. Phase 5 connects these operations to the Harness Tool pipeline.
