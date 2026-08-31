# Seven official-data Scenario regression gates

> **文档状态**：当前自动化 Scenario 回归门禁说明。

Phase 8 executes every Scenario from its own folder and its own temporary workspace. Each test
loads that folder's `expected-plan.json`, `expected-result.json` and executable Task Graph, then
enforces four independent gates:

1. every required capability appears in successful Task steps;
2. every required Layer alias exists in the execution Layer map;
3. an independent Python/GeoPandas oracle checks the relevant geometry distances, validity,
   parent regions or boolean constraints;
4. actual statistics deep-match the Scenario's applicable expected statistics.

The oracle reads persisted GeoPackage layers from the Registry; it does not reuse the ToolResult
summary being tested. Map Verification must also be `ready`, so a statistical match cannot hide a
broken `Task Step ↔ Layer ↔ Map` projection.

Scenario 05's initial 500 m run is part of Phase 8 and must return 329 buildings. Its
`revised_candidate_count` and retained history are explicitly deferred—not skipped—to Phase 9,
where the conversational 200 m revision and partial rerun are implemented and tested through the
real Connection RPC, Task Graph and GeoPandas provider.

Run Scenarios 01–06 with:

```sh
pnpm run verify:phase8
```

All six packages above are frozen, audited NYC Open Data derivatives. Scenario 07 is an additional
focused official `BUILDING` snapshot. Its independent test runs the same four gates and is included
in `pnpm test`; it can also be run directly with:

```sh
node --test tests/regression/07-official-nyc-building-inspection.regression.test.mjs
```
