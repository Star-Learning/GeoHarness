# GeoHarness v1.0

GeoHarness is an Agentic GIS workspace built as a real extension of DeepSeek Harness. A user states
a spatial goal; GeoHarness turns it into an executable Task Graph, runs structured Geo Tools,
registers every derived Layer, verifies the result on the map, and supports a bounded human
revision without hiding the GIS work behind chat prose.

> 你只需要告诉 GeoHarness 想解决什么空间问题；它会规划 GIS 工作流、执行分析，并把每一步结果展示在地图上供人验证。

![GeoHarness conversational revision Demo](examples/scenarios/05-parameter-revision/media/demo.gif)

This repository implements the complete currently feasible v1.0 scope against the inspected
DeepSeek Harness `0.1.1-rc.2` source at commit `b150a551`. It does not vendor or patch Harness
source, and it is not a separate Chat + Map website.

## What is implemented

- A dual-face Harness plugin/bundle: Host plugin plus browser module, composed through current
  `dsh.bundle`, `dsh.client`, Cordis Service and Harness Slot contracts.
- A three-column GIS workspace inside the official `conversation.view` surface: Layer Registry,
  interactive vector map and observable Agent Task Graph.
- Twelve model-facing Geo Tools with Harness schema validation, timeout/cancellation, structured
  `ToolResult` and prompt guidance.
- A cancellable local Python provider using GeoPandas, Shapely, PyProj and persistent GeoPackage
  workspaces.
- An executable DAG runtime with dependency resolution, state transitions, Layer aliases and run
  history.
- Verified `Task Step ↔ Layer ↔ Map` projection over the official loopback Connection RPC.
- Conversational Scenario 05 revision from 500 m to 1 km with downstream-only rerun and retained
  lineage.
- Six independent Scenario packages, each with its own data, prompt, Task Graph, oracle-backed
  test, README, screenshots, animated Demo and video script.

## Architecture

```text
DeepSeek Harness Web
  └─ conversation.view / shell.overlay Slots
       └─ GeoHarness browser workspace
            └─ official Connection RPC (/geoharness)
                 └─ TaskGraphRuntime + Map Verification
                      └─ 12 Harness defineTool consumers
                           └─ cancellable local Python provider
                                └─ GeoPandas / Shapely / PyProj / GeoPackage
```

The Registry is the Layer truth source. Agent text never invents Layer IDs or map state. A run is
reported ready only when step outputs, feature counts, parents and lineage all match the canonical
backend projection.

## Requirements

- Node.js `^22.19.0` or `>=24.0.0`
- pnpm `11.22.0`
- Python `>=3.11`
- A readable, built DeepSeek Harness checkout at `../deepseek-harness` for the source-integration
  workflow used by this repository

Install and build GeoHarness:

```sh
pnpm install
python -m pip install -e "./backend/geo-service[test]"
pnpm run build
```

The current upstream source CLI has a Node 24 `FiberState` source-entry issue, so use its built
entrypoint. A fully local/offline profile can link both checked-out bundles:

```powershell
$env:DSH_HOME = "$PWD/.tmp/dsh-home-geoharness"
node ../deepseek-harness/apps/cli/lib/bin.js plugin --profile geoharness add `
  ../deepseek-harness/packages/bundle/web-app ./bundle/geoharness-bundle --offline
node ../deepseek-harness/apps/cli/lib/bin.js --profile geoharness --no-open
```

If a Web-capable published Harness profile already exists, only add GeoHarness:

```sh
dsh plugin --profile web add ./bundle/geoharness-bundle
dsh --profile web --no-open
```

In Harness, open a session for this repository, choose the `GeoHarness` tab, select a Scenario and
press **Run + verify on map**. The deterministic GIS workflows do not require a model API key.

## Six independent Demos

| Scenario | Verified result | Package | Demo |
| --- | --- | --- | --- |
| 01 Building Data Inspection | 12 valid Polygons; 1 missing height | [README](examples/scenarios/01-building-data-inspection/README.md) | [GIF](examples/scenarios/01-building-data-inspection/media/demo.gif) |
| 02 River Building Query | 5 buildings within 500 m | [README](examples/scenarios/02-river-building-query/README.md) | [GIF](examples/scenarios/02-river-building-query/media/demo.gif) |
| 03 Statistics by District | 6 + 6 buildings | [README](examples/scenarios/03-building-statistics-by-district/README.md) | [GIF](examples/scenarios/03-building-statistics-by-district/media/demo.gif) |
| 04 Road Accessibility | 3 candidates; District split 3/0 | [README](examples/scenarios/04-road-accessibility/README.md) | [GIF](examples/scenarios/04-road-accessibility/media/demo.gif) |
| 05 Parameter Revision | 500 m: 4 → 1 km: 8; 2 rerun / 3 reused | [README](examples/scenarios/05-parameter-revision/README.md) | [GIF](examples/scenarios/05-parameter-revision/media/demo.gif) |
| 06 Multi-Constraint Selection | 2 candidates satisfying both distances | [README](examples/scenarios/06-multi-constraint-selection/README.md) | [GIF](examples/scenarios/06-multi-constraint-selection/media/demo.gif) |

Every Scenario follows the same rule:

```text
one need = one folder = one data package = one test = one Demo = one video script
```

The committed Manhattan-scale fixtures are small, deterministic CC0-1.0 project data. They are
not represented as official NYC datasets; provenance and processing are recorded in every
Scenario README.

## Verification

Run the complete build, six Scenario regressions and Python backend suite:

```sh
pnpm test
```

Run the final Phase 10 artifact gate, including media decoding and per-Scenario completeness:

```sh
pnpm run verify:phase10
```

Other useful commands:

```sh
pnpm run verify:phase9       # 500 m → 1 km partial rerun
pnpm run build:media         # rebuild GIFs from the committed real screenshots
pnpm run check:scenarios     # prove generated fixtures are fresh
pnpm peers check             # confirm exact Harness peer compatibility
```

## v1.0 boundaries

- Vector data only: GeoJSON/GeoPackage/CSV export; no raster, point cloud or GEE pipeline.
- Scenario data is deterministic project-created fixture data, not production NYC data.
- Natural-language revision is deliberately bounded to Scenario 05 distance changes with an
  explicit number and unit; arbitrary replanning is not claimed.
- No external model credential is stored in this repository. Tool schemas and deterministic GIS
  execution are tested through the real Harness runtime; model wording is not an acceptance
  oracle.
- Upstream version changes require rechecking bundle, client, Slot, Connection, Service and Tool
  contracts before upgrading the exact peers.

## Documentation

- [Verified Harness integration](docs/harness-integration.md)
- [Geo Tool contract](docs/tool-spec.md)
- [Task Graph runtime](docs/task-graph.md)
- [Map verification](docs/map-verification.md)
- [Scenario regression strategy](docs/scenario-regressions.md)
- [Conversational revision](docs/conversational-revision.md)
- [Implementation progress](PROGRESS.md)
- [Known constraints and resolved blockers](BLOCKERS.md)
