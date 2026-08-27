# Scenario 05 conversational revision

An initial natural-language request is first sent to `/geoharness/goal/run`. The bounded router
selects one of the seven v1.0 workflows, extracts explicit metres or kilometres and patches the
cloned Task Graph before execution. For example, “Broadway 275 米以内” starts Scenario 05 directly
at 275 m: one initial history entry, a `Create 275 m road buffer` step and 241 official buildings.
There is no preliminary 500 m run.

Phase 9 treats the later “改成 200 米。” as a mutation of the completed Scenario 05 Task Graph, not as a
new unrelated prompt. The loopback RPC parses a bounded distance, targets
`buffer_major_roads`, and patches its distance from 500 to 200 metres. The parser is not a preset
list: any explicit positive distance up to 100 km is accepted; 200 m is the frozen acceptance case.

The Task Graph computes the dependency closure from that step. Only
`buffer_major_roads` and `filter_candidate_buildings` transition back to `pending`; input
inspection, major-road filtering and CRS transformation remain `success` and retain their Layer
IDs. The second run records both its executed and reused steps.

Old buffer/result Layers remain in the Registry and transition history for provenance, but lose
their active aliases. New outputs receive new Layer IDs and updated lineage. Map Verification
accepts historical lineage only when the old output appears in a prior successful transition; the
browser renders only currently active derived aliases.

The acceptance facts are:

```text
initial candidates: 329
revised candidates: 205
run history entries: 2
rerun: buffer_major_roads, filter_candidate_buildings
reused: inspect_buildings, filter_major_roads, transform_major_roads
```

The additional initial-goal acceptance is:

```text
requested distance: 275 m
initial history entries: 1
candidates: 241
maximum independently measured distance: 273.7806 m
hidden 500 m execution: none
```

Both the UI composer and direct callers use the official
`/geoharness/scenario/revise` Connection RPC endpoint. The acceptance test invokes that real RPC
handler with the real TaskGraphRuntime and local Python/GeoPandas provider, then independently
checks every returned building is within 200.5 m of official Broadway geometry.
