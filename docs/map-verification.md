# Task Step ↔ Layer ↔ Map verification

Phase 7 adds a verified projection between the Host Task Graph and the browser map. It does not
infer map state from model prose.

After each successful output-producing step, and again after the Scenario DAG finishes,
`TaskGraphRuntime` asks the Python provider for a projection of all registry metadata and canonical
display GeoJSON. For every Layer it checks feature count,
parent existence and `generated_by` lineage. For every successful Task step it checks that each
declared output alias resolves to an actual map Layer. A projection is `ready` only if every check
passes; the browser rejects a failed projection.

The resulting model has three linked keys:

```text
step_bindings[].step_id
  → step_bindings[].outputs[].layer_id
  → map_layers[].layer_id + metadata + geojson
```

The official Connection extension transports this model over a dedicated loopback-only channel:

```text
POST /geoharness/goal/start
POST /geoharness/scenario/progress
POST /geoharness/scenario/revise/start
POST /geoharness/goal/run
POST /geoharness/scenario/run
POST /geoharness/scenario/latest
POST /geoharness/scenario/revise
```

The Host registers the channel through `ctx.connection.rpc.handle(...)`; the client calls it with
`ctx.connection.rpc.call(...)`. Payloads accept only the six deterministic v1.0 Scenario ids plus
the audited official-data Scenario 07, and bounded workspace keys. This is the current DeepSeek
Harness API confirmed from source, not a custom parallel web server. `goal/start` immediately
returns `goal_resolution` and executes a validated initial parameter patch before any Tool step;
`scenario/progress` then exposes the real pending/running/success/failed snapshots. The synchronous
endpoints remain available for deterministic direct callers.

When the response is ready, the browser merges only derived Layers into its existing Scenario
inputs. Clicking a Task step resolves its output Layer ids, highlights those rows in Layer Registry
and applies the same highlight to their actual SVG map features. Failed states and verification
issues are rendered rather than silently presenting stale results.
