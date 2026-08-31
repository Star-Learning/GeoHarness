# `@geoharness/harness-plugin`

This package is the GeoHarness integration layer for the inspected DeepSeek Harness
`0.1.1-rc.2` release. One installable package has two official Harness faces:

- `dsh.bundle` exports `cordis.patch.yml`, which inserts the Host plugin into the Cordis tree.
- `dsh.client` exposes `./client` to the Harness Web client module registry.

It does not copy or patch DeepSeek Harness source and it does not start an independent Chat + Map
application.

## Production interaction path

The browser plugin keeps the upstream AppFrame and contributes only Slots owned by their native
parents:

```text
AppFrame(root)
  → SidebarRoot(sidebar)
      → sidebar.workspaces                 # native project/session history
      → sidebar.settings                   # native model/provider/API Key settings
  → ConversationRoot(conversation)
      → conversation.session               # GeoHarness workspace
      → conversation.composer.bar          # native InputBar
          → conversation.input.model       # native ModelSelect
```

GeoHarness registers `conversation.session` plus brand mark/name entries. It does not replace
`root`, register `sidebar.workspaces`, duplicate `sidebar.settings`, implement a credential dialog,
or read secret values. The workspace uses Harness DSW theme tokens and injects only the official
Connection client service.

The native composer remains the only execution entry. GeoHarness observes the real Session through
`sessions.history({ sessionId })`; prompt submission, model routing, queue/steer, stop and errors stay
owned by the upstream conversation modules.

The Host plugin also injects the official `sessions` Service. It subscribes to canonical
`session/event` publications, projects each native turn into a versioned, reasoning-free Run
Manifest, and participates in `session/flush` so completed event history and the matching GIS run
summary reach disk together. The loopback-only `agent/runs` RPC restores the latest run summaries
after a reload; credentials and `assistant/chunk` reasoning are never persisted by GeoHarness.

The Native Harness Agent receives GeoHarness prompt guidance and 13 model-facing Geo Tools. It
discovers available datasets, selects the required tools and parameters from the user's actual
request, and emits ordinary Harness Session events. The client folds `tool/call`, `tool/result`,
`assistant/message` and `turn/end` into progressive steps and the final Agent answer. There is no
Examples selector, keyword-to-Scenario router or hidden deterministic fallback. If `sessions.models`
returns no routable model, the UI fails loudly with model-provider configuration guidance.

## Data and tools

The native GeoHarness conversation surface also provides a bounded **Import data** action. GeoJSON,
Shapefile ZIP, GeoPackage and CSV longitude/latitude files travel through the loopback-only
Connection RPC into the current Session's `imports/` directory, then GeoPandas registers a
canonical GeoPackage Layer. The browser never submits a server path. Default upload size is 20 MB
(configurable up to a 100 MB hard ceiling); ZIP traversal, symlinks, suspicious compression and
unbounded extraction are rejected. Imported Layer IDs are immediately visible to `list_layers`
and the map.

`discover_datasets` exposes the reusable `nyc-core-official` catalog. `list_layers` can activate it
and returns canonical Layer IDs for official NYC buildings, roads, rivers, districts and Lower
Manhattan buildings. The catalog describes data capabilities only; it does not prescribe an
analysis plan.

Dataset and Tool declarations are versioned JSON catalogs. The current Dataset `dataset.json`
drives discovery and `list_layers` enums; `catalog/builtin-tools.json` drives all 13 Harness Tool
registrations and the generated reference. Each Tool declares semver, capability, parameters,
`ToolResult@1.0`, timeout and map effect. Third-party Host plugins may provide another validated
catalog plus executors. Missing executors remain unregistered and appear as unavailable
capabilities in the System Prompt; duplicate or conflicting Tool versions fail activation.

The remaining 12 tools cover inspection, CRS transformation, buffering, filtering, spatial join,
clipping, regional aggregation, geometry calculation, nearest-feature analysis, distribution
analysis and export. All are registered with Harness `defineTool`, schema validation, structured
`ToolResult`, timeout/cancellation and presentation metadata. Geo operations go through `ctx.geo`
to a cancellable Python/GeoPandas provider and persistent workspace Layer Registry.

Provider requests for the same Session Workspace are queued in issue order. This prevents concurrent
Run projection, export and Layer updates from replacing `workspace.json` with an older in-memory
snapshot. Different Sessions retain independent queues and can execute in parallel.

The local Provider also enforces an independent 120-second process timeout, terminates Python on
AbortSignal, and exposes a redacted in-memory request diagnostic ring. Bundle configuration may
override `requestTimeoutMs` (100–600000), `maxLayerFeatures` (default 100000) and `maxLayerBytes`
(default 256 MB) within their hard ceilings. Semantic Tool `step_id` remains lineage; the unique
Harness call ID is the persistent idempotency key, so transport retries replay while conversational
parameter revisions create a new execution.

After each Agent history refresh, the client calls the loopback-only
`/geoharness` channel's `agent/workspace` RPC. The Host projects canonical Registry GeoJSON only after feature
counts and parent Layer references validate. The client preserves per-Layer visibility and opacity,
and renders pointer pan, fit bounds, toolbar zoom, 0.7×–5× mouse-wheel zoom and feature inspection.
It also reads `agent/runs` and shows the latest three turns with provider/model, executed Tools,
reused inputs, new output Layers and Provider/Tool/Data errors.

The Result Center reads `result/center` from the same loopback channel. Final answers come from the
Run Manifest; counts and statistics come from structured Tool Results; CRS, sources, warnings and
Layer counts come from the canonical Registry and Workspace indexes. `result/download` accepts only
an indexed export or Run asset ID for the current Session. Python resolves it under `exports/` or
`runs/`, enforces a 20 MB RPC download ceiling and returns byte count plus SHA256. GeoJSON,
GeoPackage, CSV and the reasoning-free Run JSON are restored after reload and downloadable without
exposing server paths.

Map projection is bounded to a 3 MB workspace preview. Each GeoJSON page declares total/returned
features, offset, next offset, byte limit and full bounds; complete Tool computation continues to
use canonical GeoPackages. `layer/geojson` and `layer/details` provide bounded pagination. The Agent
workspace can download a structured diagnostic JSON through `diagnostics/export`; it contains
runtime/asset counts and redacted request status only, never prompts, credentials, upload content,
Tool parameters or absolute Workspace paths.

## Deterministic regression path

The seven independent Scenario packages and `TaskGraphRuntime` remain in the Host as deterministic
GIS correctness tests and Demo assets. Their synchronous/background Scenario RPC endpoints remain
for regression compatibility, but the production browser does not call them or bundle Scenario
fixtures. This separation lets official data, geometry, lineage and nonpreset distances such as
275 m be tested without turning those fixtures into the Agent's planner.

## Local profile

From the GeoHarness repository root, install into a Web-capable profile:

```sh
dsh plugin --profile web add ./bundle/geoharness-bundle
dsh --profile web --dump-config
dsh --profile web --no-open
```

For this checked-out upstream on Node 24, use the already built upstream CLI entry documented in
the root README. Configure a DeepSeek or other compatible Harness LLM provider before submitting a
production Agent request.

Verification:

```sh
pnpm run build
pnpm run typecheck
pnpm run verify:phase5
pnpm run verify:phase7
pnpm test
pnpm peers check
```

The package pins inspected Harness packages to `0.1.1-rc.2` and Cordis to `4.0.1`. Re-run the
integration review before advancing these exact peers.
