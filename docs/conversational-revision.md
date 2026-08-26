# Scenario 05 conversational revision

Phase 9 treats “改成 1 公里。” as a mutation of the completed Scenario 05 Task Graph, not as a
new unrelated prompt. The loopback RPC parses a bounded distance, targets
`buffer_major_roads`, and patches its distance from 500 to 1000 metres.

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
initial candidates: 4
revised candidates: 8
run history entries: 2
rerun: buffer_major_roads, filter_candidate_buildings
reused: inspect_buildings, filter_major_roads, transform_major_roads
```

Both the UI composer and direct callers use the official
`/geoharness/scenario/revise` Connection RPC endpoint.
